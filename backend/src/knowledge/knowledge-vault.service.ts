import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type FSWatcher, watch } from "node:fs";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { AiIndexQueueService } from "../ai/index/ai-index-queue.service";
import { AiIndexService } from "../ai/index/ai-index.service";
import { ASSET_SOURCE, CANVAS_SOURCE, KNOWLEDGE_COLLECTION, OBSIDIAN_SOURCE } from "../ai/index/index-text";
import type { SourceDocument } from "../ai/index/ai-index.service";
import { AuthUser } from "../common/types/auth-user";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { KNOWLEDGE_VAULT_CONTEXT } from "./knowledge-constants";
import { cleanTag, renameTagInNote, renameTagInQuery } from "./vault-tags";
import {
  type AfterExtract,
  applyComposerTemplate,
  ComposeConflict,
  type ComposePosition,
  COMPOSER_TEMPLATE,
  composeMerge,
  MAX_SPLIT_SECTIONS,
  planSplit,
  splitSections,
  mergedProperties,
  planExtract,
  rewriteExtractedLinks,
  rewriteMergedLinks,
} from "./vault-compose";
import {
  BASE_EXT,
  DEFAULT_BASE,
  isBasePath,
  MAX_BASE_BYTES,
  parseBase,
  updateBaseYaml,
  validateBase,
} from "./vault-bases";
import {
  retargetCanvasNodes,
  canvasIndexText,
  CANVAS_EXT,
  type CanvasData,
  DEFAULT_CANVAS,
  isCanvasPath,
  MAX_CANVAS_BYTES,
  parseCanvas,
  serializeCanvas,
  validateCanvas,
} from "./vault-canvas";
import { isExportPath } from "./vault-export";
import { movedVersionPath, versionAction, versionsToPrune, type VersionReason } from "./vault-history";
import { applyTaskToggle, parseTasks, type VaultTask } from "./vault-tasks";
import {
  buildLinkResolver,
  EXPORT_DIR,
  INBOX_DIR,
  inboxFileName,
  inboxNote,
  isIgnoredDir,
  isSafeVaultFolder,
  knowledgeMetadata,
  MAX_NOTE_BYTES,
  MAX_VAULT_FILE_BYTES,
  noteAliases,
  noteProblems,
  parseNote,
  sha256,
  TEMPLATE_DIR,
  VAULT_FILE_TYPES,
  splitFrontmatter,
  vaultEntryKind,
} from "./vault-parser";
import {
  baseName,
  fileFrontmatter,
  fillTemplate,
  joinVaultPath,
  type KnowledgePrefs,
  linkFirstMention,
  matchesSearch,
  mentionsName,
  moveBookmarks,
  normalizeVaultPath,
  noteName,
  notePath,
  parentFolder,
  parsePrefs,
  parseSearchQuery,
  renameWikilinks,
  safeFileName,
  searchScore,
  searchSnippet,
  tagsOf,
  TRASH_DIR,
  updateFrontmatter,
  vaultHealth,
} from "./vault-editor";

/** Jeda setelah perubahan berkas terakhir sebelum vault dibaca ulang (Obsidian menyimpan berkali-kali saat mengetik). */
const WATCH_DEBOUNCE_MS = 3_000;
/** Pindai ulang berkala sebagai cadangan pemantau berkas (mis. Syncthing mengganti berkas lewat rename). */
const RESCAN_INTERVAL_MS = 10 * 60_000;
/** Batas jumlah entri per vault agar folder yang salah pilih (mis. seluruh drive) tidak membebani server. */
const MAX_ENTRIES = 5_000;
/** Gambar sematan yang boleh dibaca langsung dari vault (menu Knowledge). */
const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};
/** Templat vault awal (struktur folder §10.3 docs/AI-AGENT.md), ikut image backend. */
/** Batas tugas lintas vault per permintaan (vault sangat besar dipotong). */
const MAX_TASKS = 3000;
const dirnameOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const VAULT_TEMPLATE_DIR = resolve(__dirname, "..", "..", "templates", "knowledge-vault");

interface ScanStatus {
  lastScanAt?: string;
  lastError?: string;
  scanning?: boolean;
  changed?: number;
}

interface VaultEntry {
  path: string;
  absolute: string;
  kind: "note" | "file";
  size: number;
  mtime: Date;
}

/**
 * Konektor vault Obsidian (basis pengetahuan, tahap 2 docs/AI-AGENT.md): membaca folder vault user di
 * `KNOWLEDGE_VAULTS_DIR/<folder>`, menyimpan catatan (+ properti, tautan) di `knowledge_notes`/`knowledge_links`,
 * menyalin lampiran (PDF, DOCX, …) ke storage agar diekstrak, lalu mengantre indeks RAG. Berkas vault tetap sumber
 * kebenaran: menu Knowledge menulis ke berkas (atomik, dicek hash agar tidak menimpa perubahan Obsidian), agen hanya
 * menulis catatan usulan ke `00-Inbox/`.
 */
@Injectable()
export class KnowledgeVaultService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeVaultService.name);
  private readonly root: string | null;
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly rerun = new Set<string>();
  private readonly status = new Map<string, ScanStatus>();
  private interval?: NodeJS.Timeout;
  /** Waktu ubah berkas canvas yang terakhir diantrekan ke indeks, per user (hilang saat restart = diantre ulang, murah). */
  private readonly canvasMtimes = new Map<string, Map<string, number>>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly indexQueue: AiIndexQueueService,
    private readonly aiIndex: AiIndexService,
  ) {
    const dir = config.get<string>("KNOWLEDGE_VAULTS_DIR");
    this.root = dir ? resolve(dir) : null;
    this.aiIndex.registerSourceLoader(CANVAS_SOURCE, {
      load: (userId, path) => this.canvasDocument(userId, path),
      loadAll: async (userId) => {
        const files = await this.listVaultFiles(userId, CANVAS_EXT).catch(() => []);
        const docs = await Promise.all(files.map((f) => this.canvasDocument(userId, f.path).catch(() => null)));
        return docs.filter((d): d is SourceDocument => d !== null);
      },
    });
  }

  get configured() {
    return this.root !== null;
  }

  async onModuleInit() {
    if (!this.root) return;
    await mkdir(this.root, { recursive: true }).catch((error) =>
      this.logger.warn(
        `Folder vault ${this.root} tidak bisa dibuat: ${error instanceof Error ? error.message : error}`,
      ),
    );
    const users = await this.prisma.user.findMany({
      where: { knowledgeVault: { not: null } },
      select: { id: true, knowledgeVault: true },
    });
    for (const user of users) {
      this.startWatcher(user.id, user.knowledgeVault!);
      this.schedule(user.id, 0);
    }
    this.interval = setInterval(() => void this.rescanAll().catch(() => undefined), RESCAN_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const watcher of this.watchers.values()) watcher.close();
  }

  // ---------------------------------------------------------------- Pengaturan vault

  private vaultPath(folder: string) {
    if (!this.root) throw new BadRequestException("Konektor Obsidian belum diatur di server (KNOWLEDGE_VAULTS_DIR).");
    if (!isSafeVaultFolder(folder)) throw new BadRequestException("Nama folder vault tidak valid.");
    const path = resolve(this.root, folder);
    const rel = relative(this.root, path);
    if (!rel || rel.startsWith("..") || isAbsolute(rel) || rel.includes(sep)) {
      throw new BadRequestException("Folder vault harus berada langsung di dalam folder vault server.");
    }
    return path;
  }

  /** Daftar subfolder di root vault (pilihan folder di UI). */
  async folders() {
    if (!this.root) return [];
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    return entries.filter((e) => e.isDirectory() && isSafeVaultFolder(e.name)).map((e) => e.name);
  }

  async setVault(userId: string, folder: string | null) {
    if (folder) {
      const info = await stat(this.vaultPath(folder)).catch(() => null);
      if (!info?.isDirectory())
        throw new BadRequestException(`Folder "${folder}" tidak ditemukan di folder vault server.`);
      const taken = await this.prisma.user.findFirst({
        where: { knowledgeVault: folder, id: { not: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictException("Folder itu sudah dipakai sebagai vault pengguna lain.");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { knowledgeVault: folder } });
    this.stopWatcher(userId);
    if (folder) {
      this.startWatcher(userId, folder);
      this.schedule(userId, 0);
    } else {
      await this.clear(userId);
    }
    return this.statusOf(userId);
  }

  /** Buat vault baru dari templat (struktur folder + templat catatan) lalu langsung dipakai. */
  async createVault(userId: string, folder: string) {
    const path = this.vaultPath(folder);
    if (await stat(path).catch(() => null)) throw new ConflictException(`Folder "${folder}" sudah ada.`);
    await cp(VAULT_TEMPLATE_DIR, path, { recursive: true, errorOnExist: true });
    return this.setVault(userId, folder);
  }

  /** Lepas vault: catatan, tautan, berkas salinan, dan potongan indeksnya dihapus (isi vault di disk tidak disentuh). */
  private async clear(userId: string) {
    const notes = await this.prisma.knowledgeNote.findMany({ where: { userId }, select: { id: true, assetId: true } });
    await this.prisma.knowledgeNote.deleteMany({ where: { userId } });
    await this.prisma.aiChunk.deleteMany({ where: { userId, sourceType: { in: [OBSIDIAN_SOURCE, CANVAS_SOURCE] } } });
    this.canvasMtimes.delete(userId);
    for (const note of notes) if (note.assetId) await this.removeAsset(userId, note.assetId);
  }

  // ---------------------------------------------------------------- Pemantauan & pemindaian

  private startWatcher(userId: string, folder: string) {
    if (!this.root) return;
    try {
      const watcher = watch(this.vaultPath(folder), { recursive: true }, (_event, file) => {
        const name = typeof file === "string" ? file.replace(/\\/g, "/") : "";
        if (name.split("/").some((part) => isIgnoredDir(part))) return;
        this.schedule(userId, WATCH_DEBOUNCE_MS);
      });
      watcher.on("error", (error) => {
        this.setStatus(userId, { lastError: `Pemantau vault berhenti: ${error.message}` });
        this.stopWatcher(userId);
      });
      this.watchers.set(userId, watcher);
    } catch (error) {
      this.setStatus(userId, {
        lastError: `Vault tidak bisa dipantau: ${error instanceof Error ? error.message : error}`,
      });
    }
  }

  private stopWatcher(userId: string) {
    this.watchers.get(userId)?.close();
    this.watchers.delete(userId);
  }

  private schedule(userId: string, delay: number) {
    clearTimeout(this.timers.get(userId));
    const timer = setTimeout(() => {
      this.timers.delete(userId);
      void this.scan(userId).catch(() => undefined);
    }, delay);
    timer.unref();
    this.timers.set(userId, timer);
  }

  private async rescanAll() {
    const users = await this.prisma.user.findMany({ where: { knowledgeVault: { not: null } }, select: { id: true } });
    for (const user of users) await this.scan(user.id).catch(() => undefined);
  }

  /** Pindai sekarang atas permintaan user: tunggu pemindaian yang sedang berjalan, lalu pindai lagi (isi terbaru). */
  async scanNow(userId: string) {
    await this.running.get(userId);
    this.rerun.delete(userId);
    await this.scan(userId);
  }

  /** Pindai vault user (satu pemindaian per user; perubahan selama memindai memicu satu pemindaian lanjutan). */
  scan(userId: string): Promise<void> {
    const current = this.running.get(userId);
    if (current) {
      this.rerun.add(userId);
      return current;
    }
    const job = this.doScan(userId)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Pemindaian vault user ${userId} gagal: ${message}`);
        this.setStatus(userId, { lastError: message });
      })
      .finally(() => {
        this.running.delete(userId);
        this.setStatus(userId, { scanning: false });
        if (this.rerun.delete(userId)) this.schedule(userId, WATCH_DEBOUNCE_MS);
      });
    this.running.set(userId, job);
    return job;
  }

  private async doScan(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, knowledgeVault: true },
    });
    if (!user?.knowledgeVault || !this.root) return;
    this.setStatus(userId, { scanning: true });
    const base = this.vaultPath(user.knowledgeVault);
    const entries = await this.walk(base);
    const existing = await this.prisma.knowledgeNote.findMany({ where: { userId } });
    const byPath = new Map(existing.map((n) => [n.path, n]));
    const assetIds = existing.flatMap((n) => (n.assetId ? [n.assetId] : []));
    const liveAssets = new Set(
      (await this.prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true } })).map((a) => a.id),
    );
    let changed = 0;

    for (const entry of entries) {
      const known = byPath.get(entry.path);
      // Berkas yang tidak berubah (ukuran & waktu sama) dilewati tanpa membaca isinya
      const sameStat = known && known.fileMtime.getTime() === entry.mtime.getTime();
      const assetMissing = entry.kind === "file" && known && (!known.assetId || !liveAssets.has(known.assetId));
      if (sameStat && !assetMissing) continue;
      const data = await readFile(entry.absolute);
      const hash = sha256(data);
      if (known && known.hash === hash && !assetMissing) {
        await this.prisma.knowledgeNote.update({ where: { id: known.id }, data: { fileMtime: entry.mtime } });
        continue;
      }
      changed++;
      if (entry.kind === "note") await this.saveNote(userId, entry, data.toString("utf8"), hash, known?.id);
      else await this.saveFile(user, entry, data, hash, known);
    }

    // Catatan/berkas yang sudah tidak ada di vault
    const live = new Set(entries.map((e) => e.path));
    for (const note of existing.filter((n) => !live.has(n.path))) {
      changed++;
      await this.prisma.knowledgeNote.delete({ where: { id: note.id } });
      if (note.kind === "note") await this.indexQueue.enqueueSource(userId, OBSIDIAN_SOURCE, note.id);
      if (note.assetId) await this.removeAsset(userId, note.assetId);
    }

    if (changed) await this.resolveLinks(userId);
    await this.syncCanvasIndex(userId);
    this.setStatus(userId, { lastScanAt: new Date().toISOString(), lastError: undefined, changed });
  }

  /** Antrekan canvas yang baru / berubah / hilang ke indeks RAG (isi dibandingkan hash per potongan, jadi aman diulang). */
  private async syncCanvasIndex(userId: string) {
    const files = await this.listVaultFiles(userId, CANVAS_EXT).catch(() => null);
    if (!files) return;
    const known = this.canvasMtimes.get(userId) ?? new Map<string, number>();
    const next = new Map(files.map((f) => [f.path, f.mtime.getTime()]));
    for (const [path, mtime] of next) {
      if (known.get(path) !== mtime) await this.indexQueue.enqueueSource(userId, CANVAS_SOURCE, path);
    }
    for (const path of known.keys()) {
      if (!next.has(path)) await this.indexQueue.enqueueSource(userId, CANVAS_SOURCE, path);
    }
    this.canvasMtimes.set(userId, next);
  }

  /** Canvas vault → dokumen koleksi pengetahuan (templat & cermin 80-LifeOS tidak diindeks; JSON rusak = dilewati). */
  private async canvasDocument(userId: string, path: string): Promise<SourceDocument | null> {
    if (!isCanvasPath(path) || [TEMPLATE_DIR, EXPORT_DIR].includes(path.split("/")[0])) return null;
    const absolute = this.inVault(await this.vaultBase(userId), this.validPath(path, "any"));
    const raw = await readFile(absolute, "utf8").catch(() => null);
    if (raw === null || Buffer.byteLength(raw) > MAX_CANVAS_BYTES) return null;
    const { data, error } = parseCanvas(raw);
    if (error) return null;
    const text = canvasIndexText(path, data);
    if (!text.replace(/^# .*$/m, "").trim()) return null;
    return {
      sourceType: CANVAS_SOURCE,
      sourceId: path,
      title: `Canvas: ${(path.split("/").pop() ?? path).slice(0, -CANVAS_EXT.length)}`,
      text,
      collection: KNOWLEDGE_COLLECTION,
      metadata: { path, jenis: "canvas" },
    };
  }

  private async walk(base: string): Promise<VaultEntry[]> {
    const result: VaultEntry[] = [];
    const visit = async (dir: string) => {
      const items = await readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (result.length >= MAX_ENTRIES) return;
        const absolute = join(dir, item.name);
        if (item.isDirectory()) {
          if (!isIgnoredDir(item.name)) await visit(absolute);
          continue;
        }
        const path = relative(base, absolute).split(sep).join("/");
        const kind = item.isFile() ? vaultEntryKind(path) : null;
        if (!kind) continue;
        const info = await stat(absolute);
        if (info.size > (kind === "note" ? MAX_NOTE_BYTES : MAX_VAULT_FILE_BYTES)) continue;
        result.push({ path, absolute, kind, size: info.size, mtime: info.mtime });
      }
    };
    await visit(base);
    return result;
  }

  private async saveNote(userId: string, entry: VaultEntry, raw: string, hash: string, id?: string) {
    await this.recordVersion(userId, entry.path, raw, "observed");
    const parsed = parseNote(entry.path, raw);
    // Tag inline (#tag) digabung ke properti `tags` yang disimpan agar metadata indeks memuatnya
    const frontmatter = parsed.tags.length ? { ...(parsed.frontmatter ?? {}), tags: parsed.tags } : parsed.frontmatter;
    const data = {
      kind: "note",
      title: parsed.title,
      content: parsed.body,
      frontmatter: frontmatter ? (frontmatter as Prisma.InputJsonValue) : Prisma.DbNull,
      hash,
      fileMtime: entry.mtime,
    };
    const note = id
      ? await this.prisma.knowledgeNote.update({ where: { id }, data })
      : await this.prisma.knowledgeNote.create({ data: { ...data, userId, path: entry.path } });
    await this.prisma.knowledgeLink.deleteMany({ where: { fromId: note.id } });
    const unique = [...new Map(parsed.links.map((l) => [`${l.kind}|${l.target.toLowerCase()}`, l])).values()];
    if (unique.length) {
      await this.prisma.knowledgeLink.createMany({
        data: unique.map((l) => ({ userId, fromId: note.id, target: l.target, kind: l.kind })),
      });
    }
    await this.indexQueue.enqueueSource(userId, OBSIDIAN_SOURCE, note.id);
  }

  private async saveFile(
    user: AuthUser,
    entry: VaultEntry,
    data: Buffer,
    hash: string,
    known?: { id: string; assetId: string | null },
  ) {
    if (known?.assetId) await this.removeAsset(user.id, known.assetId);
    const mime = VAULT_FILE_TYPES[extname(entry.path).toLowerCase()];
    const asset = await this.uploads.createFromBuffer(
      data,
      entry.path.split("/").pop()!,
      mime,
      user,
      KNOWLEDGE_VAULT_CONTEXT,
    );
    const fields = {
      kind: "file",
      title: entry.path.split("/").pop()!,
      content: null,
      hash,
      fileMtime: entry.mtime,
      assetId: asset.id,
    };
    if (known) await this.prisma.knowledgeNote.update({ where: { id: known.id }, data: fields });
    else await this.prisma.knowledgeNote.create({ data: { ...fields, userId: user.id, path: entry.path } });
  }

  private async removeAsset(userId: string, assetId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!owner) return;
    await this.uploads.remove(assetId, owner).catch((error) => {
      if (!(error instanceof NotFoundException)) {
        this.logger.warn(`Berkas vault ${assetId} gagal dihapus: ${error instanceof Error ? error.message : error}`);
      }
    });
    // Potongan indeks berkas sudah dihapus oleh uploads.remove; antre ulang untuk jaga-jaga
    await this.indexQueue.enqueueSource(userId, ASSET_SOURCE, assetId);
  }

  /** Cocokkan ulang semua tautan user dengan catatan yang ada (catatan baru bisa membuat tautan lama ditemukan). */
  private async resolveLinks(userId: string) {
    const notes = await this.prisma.knowledgeNote.findMany({
      where: { userId },
      select: { id: true, path: true, frontmatter: true },
    });
    const resolveTarget = buildLinkResolver(
      notes.map((n) => ({ ...n, frontmatter: (n.frontmatter as Record<string, unknown> | null) ?? null })),
    );
    const links = await this.prisma.knowledgeLink.findMany({
      where: { userId },
      select: { id: true, target: true, toId: true },
    });
    for (const link of links) {
      const toId = resolveTarget(link.target);
      if (toId !== link.toId) await this.prisma.knowledgeLink.update({ where: { id: link.id }, data: { toId } });
    }
  }

  private setStatus(userId: string, patch: ScanStatus) {
    this.status.set(userId, { ...this.status.get(userId), ...patch });
  }

  // ---------------------------------------------------------------- Status, daftar, Inbox

  async statusOf(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { knowledgeVault: true } });
    const [notes, files, links, unresolved, problems] = await Promise.all([
      this.prisma.knowledgeNote.count({ where: { userId, kind: "note" } }),
      this.prisma.knowledgeNote.count({ where: { userId, kind: "file" } }),
      this.prisma.knowledgeLink.count({ where: { userId } }),
      this.prisma.knowledgeLink.findMany({
        where: { userId, toId: null, kind: { not: "embed" } },
        select: { target: true, from: { select: { id: true, path: true } } },
        take: 50,
      }),
      this.problems(userId),
    ]);
    const folderExists = user.knowledgeVault
      ? !!(await stat(this.vaultPath(user.knowledgeVault)).catch(() => null))?.isDirectory()
      : false;
    const s = this.status.get(userId) ?? {};
    return {
      configured: this.configured,
      folder: user.knowledgeVault,
      folderExists,
      watching: this.watchers.has(userId),
      scanning: !!s.scanning || this.running.has(userId),
      lastScanAt: s.lastScanAt ?? null,
      lastError: s.lastError ?? null,
      notes,
      files,
      links,
      unresolvedLinks: unresolved.map((l) => ({ target: l.target, noteId: l.from.id, path: l.from.path })),
      problems,
    };
  }

  private async problems(userId: string) {
    const notes = await this.prisma.knowledgeNote.findMany({
      where: { userId, kind: "note" },
      select: { id: true, path: true, frontmatter: true },
    });
    return notes
      .map((n) => ({
        noteId: n.id,
        path: n.path,
        issues: noteProblems(n.path, (n.frontmatter as Record<string, unknown> | null) ?? null),
      }))
      .filter((p) => p.issues.length)
      .slice(0, 100);
  }

  async notes(userId: string, q?: string) {
    const rows = await this.prisma.knowledgeNote.findMany({
      where: {
        userId,
        ...(q?.trim()
          ? {
              OR: [
                { title: { contains: q.trim(), mode: "insensitive" } },
                { path: { contains: q.trim(), mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { path: "asc" },
      take: 1000,
      select: {
        id: true,
        path: true,
        kind: true,
        title: true,
        frontmatter: true,
        assetId: true,
        createdAt: true,
        fileMtime: true,
        updatedAt: true,
        _count: { select: { linksOut: true, linksIn: true } },
      },
    });
    return rows.map(({ frontmatter, _count, ...row }) => {
      const meta = knowledgeMetadata(row.path, (frontmatter as Record<string, unknown> | null) ?? null);
      return {
        ...row,
        jenis: meta.jenis ?? null,
        status: meta.status ?? null,
        publik: meta.publik ?? null,
        tags: tagsOf((frontmatter as Record<string, unknown> | null) ?? null),
        /** Properti tersimpan (tampilan Tabel); `tags` sudah memuat tag inline */
        properties: (frontmatter as Record<string, unknown> | null) ?? null,
        links: _count.linksOut,
        backlinks: _count.linksIn,
      };
    });
  }

  async note(userId: string, id: string) {
    const note = await this.prisma.knowledgeNote.findFirst({
      where: { id, userId },
      include: {
        linksOut: { select: { target: true, kind: true, to: { select: { id: true, title: true, path: true } } } },
        linksIn: { select: { kind: true, from: { select: { id: true, title: true, path: true } } } },
      },
    });
    if (!note) throw new NotFoundException("Catatan pengetahuan tidak ditemukan.");
    const frontmatter = (note.frontmatter as Record<string, unknown> | null) ?? null;
    return {
      id: note.id,
      path: note.path,
      kind: note.kind,
      title: note.title,
      content: note.content,
      frontmatter,
      metadata: knowledgeMetadata(note.path, frontmatter),
      problems: note.kind === "note" ? noteProblems(note.path, frontmatter) : [],
      assetId: note.assetId,
      hash: note.hash,
      updatedAt: note.updatedAt,
      linksOut: note.linksOut.map((l) => ({ target: l.target, kind: l.kind, note: l.to })),
      backlinks: note.linksIn.map((l) => ({ kind: l.kind, note: l.from })),
    };
  }

  /** Tulis catatan usulan (draf) ke `00-Inbox/` vault user untuk dikurasi di Obsidian. Tidak pernah menimpa berkas. */
  async addToInbox(userId: string, input: { title: string; content: string; question?: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { knowledgeVault: true } });
    if (!user.knowledgeVault)
      throw new BadRequestException("Pilih folder vault Obsidian dulu di Tools → Basis Pengetahuan.");
    const dir = join(this.vaultPath(user.knowledgeVault), INBOX_DIR);
    await mkdir(dir, { recursive: true });
    const now = new Date();
    let name = inboxFileName(input.title, now);
    for (let i = 2; await stat(join(dir, name)).catch(() => null); i++)
      name = name.replace(/( \(\d+\))?\.md$/, ` (${i}).md`);
    await writeFile(join(dir, name), inboxNote({ ...input, now }), { flag: "wx" });
    this.schedule(userId, 500);
    return { path: `${INBOX_DIR}/${name}` };
  }
  // ---------------------------------------------------------------- Menu Knowledge (antarmuka Obsidian)

  /** Folder vault user di disk; error 400 bila vault belum dipilih. */
  private async vaultBase(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { knowledgeVault: true } });
    if (!user.knowledgeVault)
      throw new BadRequestException("Pilih folder vault Obsidian dulu di Tools → Basis Pengetahuan.");
    return this.vaultPath(user.knowledgeVault);
  }

  /** Path absolut dari path relatif vault yang sudah divalidasi; menolak apa pun yang keluar dari vault. */
  private inVault(base: string, rel: string) {
    const absolute = resolve(base, ...rel.split("/"));
    const back = relative(base, absolute);
    if (!back || back.startsWith("..") || isAbsolute(back)) throw new BadRequestException("Path di luar vault.");
    return absolute;
  }

  private validPath(input: string, kind: "note" | "any" | "folder") {
    const path = kind === "note" ? notePath(input) : normalizeVaultPath(input);
    if (!path)
      throw new BadRequestException(
        'Nama/path tidak valid (hindari karakter \\ : * ? " < > | # ^ [ ] dan titik di awal).',
      );
    return path;
  }

  private async findNote(userId: string, id: string) {
    const note = await this.prisma.knowledgeNote.findFirst({ where: { id, userId } });
    if (!note) throw new NotFoundException("Catatan pengetahuan tidak ditemukan.");
    return note;
  }

  /** Berkas cermin 80-LifeOS ditimpa setiap sinkron → tidak diubah/dipindah/dihapus dari menu Knowledge. */
  private async findEditable(userId: string, id: string) {
    const note = await this.findNote(userId, id);
    if (isExportPath(note.path) && (note.frontmatter as Record<string, unknown> | null)?.sumber === "lifeos")
      throw new BadRequestException(
        "Berkas ini dikelola LifeOS (cermin 80-LifeOS) dan ditimpa setiap sinkron — ubah datanya di menu asalnya.",
      );
    return note;
  }

  /**
   * Catat satu versi catatan (K7): isi sama dengan versi terakhir dilewati, versi terpantau dirapatkan per selang waktu,
   * riwayat dipangkas ke sekian versi terbaru. Gagal mencatat tidak pernah menggagalkan penulisan.
   */
  private async recordVersion(userId: string, path: string, raw: string, reason: VersionReason) {
    try {
      if (Buffer.byteLength(raw) > MAX_NOTE_BYTES) return;
      const hash = sha256(raw);
      const latest = await this.prisma.knowledgeNoteVersion.findFirst({
        where: { userId, path },
        orderBy: { createdAt: "desc" },
        select: { id: true, hash: true, reason: true, createdAt: true },
      });
      const action = versionAction(latest, { hash, reason, now: new Date() });
      if (action.kind === "skip") return;
      if (action.kind === "mark") {
        await this.prisma.knowledgeNoteVersion.update({ where: { id: action.id }, data: { reason } });
        return;
      }
      const data = { content: raw, hash, size: Buffer.byteLength(raw), reason };
      if (action.kind === "replace") {
        await this.prisma.knowledgeNoteVersion.update({
          where: { id: action.id },
          data: { ...data, createdAt: new Date() },
        });
        return;
      }
      await this.prisma.knowledgeNoteVersion.create({ data: { ...data, userId, path } });
      const all = await this.prisma.knowledgeNoteVersion.findMany({
        where: { userId, path },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const prune = versionsToPrune(all);
      if (prune.length) await this.prisma.knowledgeNoteVersion.deleteMany({ where: { id: { in: prune } } });
    } catch (error) {
      this.logger.warn(`Riwayat versi ${path} gagal dicatat: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Tulis catatan dari LifeOS: isi lama disimpan ke riwayat versi lebih dulu (bisa dipulihkan). */
  private async writeNoteFile(
    userId: string,
    path: string,
    absolute: string,
    previous: string | null,
    next: string,
    reason: VersionReason,
  ) {
    if (previous !== null && previous !== next) await this.recordVersion(userId, path, previous, reason);
    await this.writeAtomic(absolute, next);
  }

  /** Riwayat ikut pindah saat catatan / folder dipindah (riwayat dikunci per path). */
  private async moveVersions(userId: string, from: string, to: string, folder: boolean) {
    const rows = await this.prisma.knowledgeNoteVersion.findMany({
      where: folder ? { userId, path: { startsWith: `${from}/` } } : { userId, path: from },
      select: { id: true, path: true },
    });
    for (const row of rows) {
      const next = movedVersionPath(row.path, from, to, folder);
      if (next) await this.prisma.knowledgeNoteVersion.update({ where: { id: row.id }, data: { path: next } });
    }
  }

  /** Tulis atomik (berkas sementara → rename) agar Obsidian/Syncthing tidak pernah membaca berkas setengah jadi. */
  private async writeAtomic(absolute: string, text: string) {
    if (Buffer.byteLength(text) > MAX_NOTE_BYTES) throw new BadRequestException("Catatan terlalu besar (maks. 2 MB).");
    const temp = `${absolute}.${randomUUID().slice(0, 8)}.lifeos-tmp`;
    await writeFile(temp, text, "utf8");
    await rename(temp, absolute);
  }

  /** Baca berkas & pastikan belum berubah sejak dibuka (hash). Berubah → 409 berisi hash terbaru. */
  private async readChecked(absolute: string, baseHash: string) {
    const raw = await readFile(absolute, "utf8").catch(() => {
      throw new NotFoundException("Berkas catatan sudah tidak ada di vault.");
    });
    if (sha256(raw) !== baseHash) {
      throw new ConflictException({
        message: "Catatan sudah diubah di tempat lain (Obsidian / perangkat lain) sejak Anda membukanya.",
        currentHash: sha256(raw),
      });
    }
    return raw;
  }

  private async folderList(base: string) {
    const folders: string[] = [];
    const visit = async (dir: string) => {
      const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const item of items) {
        if (!item.isDirectory() || isIgnoredDir(item.name) || folders.length >= 2_000) continue;
        const absolute = join(dir, item.name);
        folders.push(relative(base, absolute).split(sep).join("/"));
        await visit(absolute);
      }
    };
    await visit(base);
    return folders.sort((a, b) => a.localeCompare(b, "id"));
  }

  /** Pohon vault: semua folder (termasuk yang kosong) + daftar catatan & berkas. */
  async tree(userId: string) {
    const base = await this.vaultBase(userId);
    const [folders, notes] = await Promise.all([this.folderList(base), this.notes(userId)]);
    return { folders, notes };
  }

  /** Graf: node = catatan & berkas, edge = tautan yang ditemukan, node bayangan = tautan ke catatan yang belum ada. */
  async graph(userId: string) {
    const [notes, links] = await Promise.all([
      this.notes(userId),
      this.prisma.knowledgeLink.findMany({
        where: { userId },
        select: { fromId: true, toId: true, target: true, kind: true },
      }),
    ]);
    const edges = new Map<string, { source: string; target: string; kind: string }>();
    const missing = new Map<string, { id: string; title: string; count: number }>();
    for (const link of links) {
      let target = link.toId;
      if (!target) {
        if (link.kind === "embed") continue;
        const key = link.target.toLowerCase();
        const node = missing.get(key) ?? { id: `missing:${key}`, title: link.target, count: 0 };
        node.count++;
        missing.set(key, node);
        target = node.id;
      }
      if (target === link.fromId) continue;
      edges.set(`${link.fromId}|${target}`, { source: link.fromId, target, kind: link.kind });
    }
    return {
      nodes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        path: n.path,
        kind: n.kind,
        status: n.status,
        jenis: n.jenis,
        tags: n.tags,
        links: n.links,
        backlinks: n.backlinks,
        /** Perkiraan waktu dibuat (urutan tombol Animasi di graf): waktu berkas atau pertama terbaca, yang lebih awal */
        createdAt: n.fileMtime < n.createdAt ? n.fileMtime : n.createdAt,
      })),
      missing: [...missing.values()],
      edges: [...edges.values()],
    };
  }

  /** Pencarian kata (beroperator, di judul/path/isi) atau makna (indeks RAG koleksi pengetahuan). */
  async search(userId: string, q: string, mode: "text" | "semantic" = "text") {
    const text = q.trim();
    if (!text) return [];
    if (mode === "semantic") {
      const hits = await this.aiIndex.search(userId, text, 20, { collections: ["knowledge"] });
      const notes = await this.prisma.knowledgeNote.findMany({
        where: {
          userId,
          OR: [
            { id: { in: hits.filter((h) => h.sourceType === OBSIDIAN_SOURCE).map((h) => h.sourceId) } },
            { assetId: { in: hits.filter((h) => h.sourceType === ASSET_SOURCE).map((h) => h.sourceId) } },
          ],
        },
        select: { id: true, path: true, title: true, kind: true, assetId: true },
      });
      const results = new Map<
        string,
        { id: string; path: string; title: string; kind: string; snippet: string; score: number }
      >();
      for (const hit of hits) {
        const note = notes.find((n) => (hit.sourceType === OBSIDIAN_SOURCE ? n.id : n.assetId) === hit.sourceId);
        if (!note || results.has(note.id)) continue;
        results.set(note.id, { ...note, snippet: searchSnippet(hit.content, []), score: hit.score });
      }
      return [...results.values()];
    }
    const query = parseSearchQuery(text);
    const rows = await this.prisma.knowledgeNote.findMany({
      where: { userId },
      select: { id: true, path: true, title: true, kind: true, content: true, frontmatter: true },
      take: MAX_ENTRIES,
    });
    return rows
      .map((row) => {
        const frontmatter = (row.frontmatter as Record<string, unknown> | null) ?? null;
        const meta = knowledgeMetadata(row.path, frontmatter);
        const note = {
          ...row,
          tags: tagsOf(frontmatter),
          status: meta.status ?? null,
          jenis: meta.jenis ?? null,
        };
        return matchesSearch(note, query)
          ? {
              id: row.id,
              path: row.path,
              title: row.title,
              kind: row.kind,
              snippet: searchSnippet(row.content, query.words),
              score: searchScore(note, query),
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, 100);
  }

  /** Isi mentah berkas catatan (termasuk properti) + hash untuk editor sumber. */
  async source(userId: string, id: string) {
    const note = await this.findNote(userId, id);
    if (note.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang bisa disunting.");
    const raw = await readFile(this.inVault(await this.vaultBase(userId), note.path), "utf8").catch(() => {
      throw new NotFoundException("Berkas catatan sudah tidak ada di vault.");
    });
    return { id: note.id, path: note.path, raw, hash: sha256(raw), frontmatter: fileFrontmatter(raw) };
  }

  /** Setelah menulis berkas: pindai sekarang lalu kembalikan id catatan pada path itu (id berganti bila dipindah). */
  private async afterWrite(userId: string, path: string | null) {
    await this.scanNow(userId);
    if (!path) return null;
    return this.prisma.knowledgeNote.findUnique({
      where: { userId_path: { userId, path } },
      select: { id: true, path: true },
    });
  }

  /** Simpan isi sumber catatan (editor). */
  async save(userId: string, id: string, input: { content: string; baseHash: string }) {
    const note = await this.findEditable(userId, id);
    if (note.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang bisa disunting.");
    const absolute = this.inVault(await this.vaultBase(userId), note.path);
    const previous = await this.readChecked(absolute, input.baseHash);
    await this.writeNoteFile(userId, note.path, absolute, previous, input.content, "before_save");
    await this.afterWrite(userId, note.path);
    return this.source(userId, id);
  }

  /** Ubah properti (frontmatter) tanpa menyentuh isi; komentar & urutan YAML dipertahankan. */
  async setProperties(
    userId: string,
    id: string,
    input: { set?: Record<string, unknown>; remove?: string[]; baseHash: string },
  ) {
    const note = await this.findEditable(userId, id);
    if (note.kind !== "note") throw new BadRequestException("Berkas lampiran tidak punya properti.");
    const absolute = this.inVault(await this.vaultBase(userId), note.path);
    const raw = await this.readChecked(absolute, input.baseHash);
    let next: string;
    try {
      next = updateFrontmatter(raw, input.set ?? {}, input.remove ?? []);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
    await this.writeNoteFile(userId, note.path, absolute, raw, next, "before_properties");
    await this.afterWrite(userId, note.path);
    return this.source(userId, id);
  }

  /** Catatan baru di folder (kosong / isi / dari templat di `90-Templat`). Nama sama → diberi nomor. */
  async createNote(userId: string, input: { folder?: string; title: string; content?: string; templateId?: string }) {
    const base = await this.vaultBase(userId);
    const folder = input.folder?.trim() ? this.validPath(input.folder, "folder") : "";
    const name = safeFileName(input.title);
    if (!name) throw new BadRequestException("Judul catatan wajib diisi.");
    let content = input.content ?? "";
    if (input.templateId) {
      const template = await this.findNote(userId, input.templateId);
      if (template.kind !== "note") throw new BadRequestException("Templat harus catatan Markdown.");
      const raw = await readFile(this.inVault(base, template.path), "utf8");
      content = fillTemplate(raw, { title: input.title.trim(), now: new Date() });
    }
    if (folder) await mkdir(this.inVault(base, folder), { recursive: true });
    for (let i = 1; i < 100; i++) {
      const path = this.validPath(joinVaultPath(folder, i === 1 ? name : `${name} ${i}`), "note");
      try {
        await writeFile(this.inVault(base, path), content, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
      const created = await this.afterWrite(userId, path);
      return { id: created?.id ?? null, path };
    }
    throw new ConflictException("Terlalu banyak catatan bernama sama di folder ini.");
  }

  /**
   * Buat catatan di path tetap bila belum ada (dipakai catatan harian). Berkas yang sudah ada tidak pernah disentuh —
   * hasilnya `created: false` dengan id catatan itu.
   */
  async createAt(userId: string, path: string, content: string) {
    const base = await this.vaultBase(userId);
    const target = this.validPath(path, "note");
    const folder = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "";
    if (folder) await mkdir(this.inVault(base, folder), { recursive: true });
    let created = true;
    try {
      await writeFile(this.inVault(base, target), content, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      created = false;
    }
    const note = created
      ? await this.afterWrite(userId, target)
      : ((await this.prisma.knowledgeNote.findUnique({
          where: { userId_path: { userId, path: target } },
          select: { id: true, path: true },
        })) ?? (await this.afterWrite(userId, target)));
    return { id: note?.id ?? null, path: target, created };
  }

  /** Isi mentah berkas vault bila ada (templat dsb.), `null` bila tidak ada / vault belum diatur. */
  async readOptional(userId: string, path: string) {
    const base = await this.vaultBase(userId).catch(() => null);
    if (!base) return null;
    return readFile(this.inVault(base, this.validPath(path, "note")), "utf8").catch(() => null);
  }

  /**
   * Catatan serupa (K4 docs/AI-AGENT.md §25.6, pola Smart Connections): rata-rata vektor potongan catatan ini dibandingkan
   * dengan potongan lain koleksi pengetahuan (model embedding sama), skor = kemiripan kosinus terbaik per sumber. Tanpa
   * panggilan AI — memakai embedding yang sudah ada di indeks.
   */
  async similar(userId: string, id: string, limit = 8) {
    const note = await this.findNote(userId, id);
    const sourceType = note.kind === "note" ? OBSIDIAN_SOURCE : ASSET_SOURCE;
    const sourceId = note.kind === "note" ? note.id : note.assetId;
    if (!sourceId) return { available: false, items: [] };
    const rows = await this.prisma.$queryRaw<{ source_type: string; source_id: string; score: number }[]>`
      WITH src AS (
        SELECT avg(embedding) AS v, model FROM ai_chunks
        WHERE user_id = ${userId} AND source_type = ${sourceType} AND source_id = ${sourceId} AND embedding IS NOT NULL
        GROUP BY model ORDER BY count(*) DESC LIMIT 1
      )
      SELECT c.source_type, c.source_id, max(1 - (c.embedding <=> src.v))::float8 AS score
      FROM ai_chunks c, src
      WHERE c.user_id = ${userId} AND c.collection = 'knowledge' AND c.model = src.model AND c.embedding IS NOT NULL
        AND NOT (c.source_type = ${sourceType} AND c.source_id = ${sourceId})
      GROUP BY c.source_type, c.source_id
      ORDER BY score DESC
      LIMIT ${limit * 3}`;
    if (!rows.length) {
      // Kosong karena catatan ini belum punya vektor (indeks mati / tanpa key embedding / belum diproses) atau memang tidak ada yang lain
      const [{ n }] = await this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ai_chunks
        WHERE user_id = ${userId} AND source_type = ${sourceType} AND source_id = ${sourceId} AND embedding IS NOT NULL`;
      return { available: n > 0, items: [] };
    }
    const notes = await this.prisma.knowledgeNote.findMany({
      where: {
        userId,
        OR: [
          { id: { in: rows.filter((r) => r.source_type === OBSIDIAN_SOURCE).map((r) => r.source_id) } },
          { assetId: { in: rows.filter((r) => r.source_type === ASSET_SOURCE).map((r) => r.source_id) } },
        ],
      },
      select: { id: true, path: true, title: true, kind: true, assetId: true },
    });
    const items: { id: string; path: string; title: string; kind: string; score: number }[] = [];
    for (const row of rows) {
      const hit = notes.find((n) => (row.source_type === OBSIDIAN_SOURCE ? n.id : n.assetId) === row.source_id);
      if (!hit || hit.id === note.id || items.some((i) => i.id === hit.id)) continue;
      items.push({
        id: hit.id,
        path: hit.path,
        title: hit.title,
        kind: hit.kind,
        score: Math.round(row.score * 1000) / 1000,
      });
      if (items.length >= limit) break;
    }
    return { available: true, items };
  }

  async createFolder(userId: string, input: string) {
    const path = this.validPath(input, "folder");
    const absolute = this.inVault(await this.vaultBase(userId), path);
    if (await stat(absolute).catch(() => null)) throw new ConflictException(`"${path}" sudah ada.`);
    await mkdir(absolute, { recursive: true });
    return { path };
  }

  /**
   * Pindah / ganti nama catatan atau berkas. Ganti nama catatan bisa memperbarui `[[tautan]]` di catatan yang merujuknya
   * (seperti Obsidian). Id catatan berganti (dibaca ulang dari path baru).
   */
  async moveNote(userId: string, id: string, input: { path: string; updateLinks?: boolean }) {
    const note = await this.findEditable(userId, id);
    const base = await this.vaultBase(userId);
    let path = this.validPath(input.path, note.kind === "note" ? "note" : "any");
    if (note.kind === "file" && extname(path).toLowerCase() !== extname(note.path).toLowerCase())
      path += extname(note.path);
    if (path === note.path) return { id: note.id, path, updatedLinks: 0 };
    const target = this.inVault(base, path);
    if (await stat(target).catch(() => null)) throw new ConflictException(`"${path}" sudah ada.`);
    await mkdir(dirname(target), { recursive: true });
    await rename(this.inVault(base, note.path), target);
    await this.moveVersions(userId, note.path, path, false);

    let updatedLinks = 0;
    if (input.updateLinks !== false && noteName(path).toLowerCase() !== noteName(note.path).toLowerCase()) {
      const sources = await this.prisma.knowledgeLink.findMany({
        where: { userId, toId: note.id },
        select: { from: { select: { path: true, kind: true } } },
      });
      for (const sourcePath of new Set(sources.filter((s) => s.from.kind === "note").map((s) => s.from.path))) {
        const current = sourcePath === note.path ? path : sourcePath;
        const absolute = this.inVault(base, current);
        const raw = await readFile(absolute, "utf8").catch(() => null);
        if (raw === null) continue;
        const result = renameWikilinks(raw, note.path, path);
        if (result.count) {
          await this.writeNoteFile(userId, current, absolute, raw, result.text, "before_move");
          updatedLinks += result.count;
        }
      }
    }
    if (input.updateLinks !== false)
      await this.updateCanvasRefs(userId, base, (file, subpath) =>
        file === note.path ? { file: path, subpath } : null,
      );
    await this.updatePrefs(userId, (prefs) => ({
      ...prefs,
      bookmarks: moveBookmarks(prefs.bookmarks, note.path, path),
    }));
    const moved = await this.afterWrite(userId, path);
    return { id: moved?.id ?? null, path, updatedLinks };
  }

  async moveFolder(userId: string, input: { from: string; to: string }) {
    const base = await this.vaultBase(userId);
    const from = this.validPath(input.from, "folder");
    const to = this.validPath(input.to, "folder");
    if (to === from || to.startsWith(`${from}/`))
      throw new BadRequestException("Folder tidak bisa dipindah ke dalam dirinya.");
    const source = this.inVault(base, from);
    if (!(await stat(source).catch(() => null))?.isDirectory()) throw new NotFoundException("Folder tidak ditemukan.");
    const target = this.inVault(base, to);
    if (await stat(target).catch(() => null)) throw new ConflictException(`"${to}" sudah ada.`);
    await mkdir(dirname(target), { recursive: true });
    await rename(source, target);
    await this.moveVersions(userId, from, to, true);
    await this.updateCanvasRefs(userId, base, (file, subpath) =>
      file.startsWith(`${from}/`) ? { file: `${to}${file.slice(from.length)}`, subpath } : null,
    );
    await this.updatePrefs(userId, (prefs) => ({ ...prefs, bookmarks: moveBookmarks(prefs.bookmarks, from, to) }));
    await this.afterWrite(userId, null);
    return { path: to };
  }

  /** Rujukan node `file` di semua canvas (bukan cermin 80-LifeOS); canvas rusak dilewati, tidak pernah ditimpa. */
  private async updateCanvasRefs(
    userId: string,
    base: string,
    map: (file: string, subpath?: string) => { file: string; subpath?: string } | null,
  ) {
    let updated = 0;
    for (const { path } of await this.listVaultFiles(userId, CANVAS_EXT).catch(() => [])) {
      if (isExportPath(path)) continue;
      const absolute = this.inVault(base, path);
      const raw = await readFile(absolute, "utf8").catch(() => null);
      if (raw === null) continue;
      const { data, error } = parseCanvas(raw);
      if (error) continue;
      const result = retargetCanvasNodes(data, map);
      if (!result.changed) continue;
      await this.writeAtomic(absolute, serializeCanvas(result.data));
      await this.indexQueue.enqueueSource(userId, CANVAS_SOURCE, path);
      updated++;
    }
    return updated;
  }

  /** Tulis ulang `[[tautan]]` di catatan perujuk (catatan terindeks; cermin 80-LifeOS & `skip` dilewati). */
  private async rewriteReferrers(
    userId: string,
    base: string,
    noteId: string,
    skip: string[],
    rewrite: (raw: string) => { text: string; count: number },
    reason: VersionReason,
  ) {
    const links = await this.prisma.knowledgeLink.findMany({
      where: { userId, toId: noteId },
      select: { from: { select: { path: true, kind: true } } },
    });
    const paths = new Set(links.filter((l) => l.from.kind === "note").map((l) => l.from.path));
    let updated = 0;
    for (const path of paths) {
      if (skip.includes(path) || isExportPath(path)) continue;
      const absolute = this.inVault(base, path);
      const raw = await readFile(absolute, "utf8").catch(() => null);
      if (raw === null) continue;
      const result = rewrite(raw);
      if (!result.count) continue;
      await this.writeNoteFile(userId, path, absolute, raw, result.text, reason);
      updated += result.count;
    }
    return updated;
  }

  /** Path catatan baru yang masih kosong di folder (nama sama → diberi nomor). */
  private async freeNotePath(
    base: string,
    folderInput: string | undefined,
    title: string,
    reserved: ReadonlySet<string> = new Set(),
  ) {
    const folder = folderInput?.trim() ? this.validPath(folderInput, "folder") : "";
    const name = safeFileName(title);
    if (!name) throw new BadRequestException("Judul catatan wajib diisi.");
    for (let i = 1; i < 100; i++) {
      const path = this.validPath(joinVaultPath(folder, i === 1 ? name : `${name} ${i}`), "note");
      if (!reserved.has(path.toLowerCase()) && !(await stat(this.inVault(base, path)).catch(() => null))) return path;
    }
    throw new ConflictException("Terlalu banyak catatan bernama sama di folder ini.");
  }

  /**
   * Gabung catatan (K9, pola Note composer Obsidian): isi & properti sumber masuk tujuan, perujuk & canvas diarahkan ke tujuan,
   * sumber ke `.trash` **paling akhir** — gagal di tengah = isi ganda, tidak pernah hilang.
   */
  async mergeNote(
    userId: string,
    id: string,
    input: {
      targetId?: string;
      newTitle?: string;
      folder?: string;
      position?: ComposePosition;
      targetHeading?: string;
      heading?: boolean;
      baseHash: string;
      targetHash?: string;
    },
  ) {
    await this.scanNow(userId); // tautan perujuk terkini
    const source = await this.findEditable(userId, id);
    if (source.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang bisa digabung.");
    if (input.targetId === id) throw new BadRequestException("Catatan tidak bisa digabung dengan dirinya sendiri.");
    const base = await this.vaultBase(userId);
    const sourceAbs = this.inVault(base, source.path);
    const sourceRaw = await this.readChecked(sourceAbs, input.baseHash);
    const sourceName = noteName(source.path);
    const now = new Date();

    let targetPath: string;
    let targetText: string;
    let renames = new Map<string, string>();
    let heading: string | null = null;
    try {
      if (input.targetId) {
        const target = await this.findEditable(userId, input.targetId);
        if (target.kind !== "note") throw new BadRequestException("Tujuan harus catatan Markdown.");
        if (!input.targetHash) throw new BadRequestException("targetHash wajib diisi.");
        targetPath = target.path;
        const targetRaw = await this.readChecked(this.inVault(base, target.path), input.targetHash);
        const plan = composeMerge({
          targetRaw,
          sourceRaw,
          sourceName,
          position: input.position ?? "end",
          targetHeading: input.targetHeading,
          heading: input.heading !== false,
        });
        targetText = plan.text;
        renames = plan.renames;
        heading = plan.heading;
      } else {
        if (!input.newTitle?.trim()) throw new BadRequestException("Pilih catatan tujuan atau isi judul catatan baru.");
        targetPath = await this.freeNotePath(base, input.folder ?? dirnameOf(source.path), input.newTitle);
        const { frontmatter, body } = splitFrontmatter(sourceRaw);
        const template = await this.readOptional(userId, COMPOSER_TEMPLATE);
        const content = template
          ? applyComposerTemplate(template, {
              content: body,
              fromTitle: sourceName,
              newTitle: noteName(targetPath),
              now,
            })
          : body;
        targetText = updateFrontmatter(content, mergedProperties(null, frontmatter, sourceName));
      }
    } catch (error) {
      if (error instanceof Error && !(error instanceof HttpException)) throw new BadRequestException(error.message);
      throw error;
    }
    const options = { heading, renames };
    // Tautan di isi hasil gabung sendiri (sumber menaut dirinya / tujuan menaut sumber) ikut diarahkan
    targetText = rewriteMergedLinks(targetText, source.path, targetPath, options).text;

    const targetAbs = this.inVault(base, targetPath);
    if (input.targetId)
      await this.writeNoteFile(
        userId,
        targetPath,
        targetAbs,
        await readFile(targetAbs, "utf8"),
        targetText,
        "before_merge",
      );
    else {
      await mkdir(dirname(targetAbs), { recursive: true });
      await writeFile(targetAbs, targetText, { flag: "wx" });
    }
    const updatedLinks = await this.rewriteReferrers(
      userId,
      base,
      source.id,
      [source.path, targetPath],
      (raw) => rewriteMergedLinks(raw, source.path, targetPath, options),
      "before_merge",
    );
    const updatedCanvases = await this.updateCanvasRefs(userId, base, (file, subpath) =>
      file === source.path ? { file: targetPath, subpath: subpath ?? (heading ? `#${heading}` : undefined) } : null,
    );
    await this.recordVersion(userId, source.path, sourceRaw, "before_merge");
    const trash = await this.toTrash(base, source.path);
    await this.updatePrefs(userId, (prefs) => ({
      ...prefs,
      bookmarks: moveBookmarks(prefs.bookmarks, source.path, targetPath),
    }));
    const merged = await this.afterWrite(userId, targetPath);
    return { id: merged?.id ?? null, path: targetPath, updatedLinks, updatedCanvases, trash };
  }

  /**
   * Ekstrak pilihan teks (K9) ke catatan lain / baru. Pilihan dikirim sebagai posisi + teks dan dicocokkan dengan berkas (beda → 409).
   * Tujuan ditulis dulu, perujuk & canvas, lalu catatan asal paling akhir.
   */
  /** Pecah catatan per judul (K9 tahap 2). `dryRun` = daftar catatan baru tanpa menulis; urutan tulis sama dengan ekstrak. */
  async splitNote(
    userId: string,
    id: string,
    input: { level: number; folder?: string; after?: AfterExtract; dryRun?: boolean; baseHash: string },
  ) {
    await this.scanNow(userId);
    const source = await this.findEditable(userId, id);
    if (source.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang bisa dipecah.");
    const base = await this.vaultBase(userId);
    const sourceAbs = this.inVault(base, source.path);
    const sourceRaw = await this.readChecked(sourceAbs, input.baseHash);
    const sections = splitSections(sourceRaw, input.level);
    if (!sections.length) throw new BadRequestException("Tidak ada judul di tingkat itu.");
    if (sections.length > MAX_SPLIT_SECTIONS)
      throw new BadRequestException(
        `Terlalu banyak bagian (${sections.length}; maks. ${MAX_SPLIT_SECTIONS}). Pilih tingkat judul yang lebih tinggi.`,
      );

    const reserved = new Set<string>();
    const targetPaths: string[] = [];
    for (const [index, section] of sections.entries()) {
      const path = await this.freeNotePath(
        base,
        input.folder ?? dirnameOf(source.path),
        section.title || `${noteName(source.path)} bagian ${index + 1}`,
        reserved,
      );
      reserved.add(path.toLowerCase());
      targetPaths.push(path);
    }
    if (input.dryRun)
      return { sections: sections.map((s, i) => ({ title: s.title, path: targetPaths[i], chars: s.to - s.from })) };

    let plan: ReturnType<typeof planSplit>;
    try {
      plan = planSplit({
        sourceRaw,
        sourcePath: source.path,
        level: input.level,
        targetPaths,
        after: input.after ?? "link",
        template: await this.readOptional(userId, COMPOSER_TEMPLATE),
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof ComposeConflict) throw new ConflictException(error.message);
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
    for (const target of plan.targets) {
      const absolute = this.inVault(base, target.path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, target.text, { flag: "wx" });
    }
    const updatedLinks = await this.rewriteReferrers(
      userId,
      base,
      source.id,
      [source.path, ...targetPaths],
      (raw) => {
        let text = raw;
        let count = 0;
        for (const target of plan.targets) {
          const result = rewriteExtractedLinks(text, source.path, target.path, target.moved, new Map());
          text = result.text;
          count += result.count;
        }
        return { text, count };
      },
      "before_extract",
    );
    await this.updateCanvasRefs(userId, base, (file, subpath) => {
      if (file !== source.path || !subpath) return null;
      const block = /^#\^(.+)$/.exec(subpath);
      const heading = subpath
        .slice(subpath.lastIndexOf("#") + 1)
        .trim()
        .toLowerCase();
      const target = plan.targets.find((t) => (block ? t.moved.blocks.has(block[1]) : t.moved.headings.has(heading)));
      return target ? { file: target.path, subpath } : null;
    });
    await this.writeNoteFile(userId, source.path, sourceAbs, sourceRaw, plan.sourceText, "before_extract");
    await this.scanNow(userId);
    const created = await this.prisma.knowledgeNote.findMany({
      where: { userId, path: { in: targetPaths } },
      select: { id: true, path: true },
    });
    return { created, updatedLinks };
  }

  async extractNote(
    userId: string,
    id: string,
    input: {
      from: number;
      to: number;
      text: string;
      baseHash: string;
      targetId?: string;
      targetHash?: string;
      newTitle?: string;
      folder?: string;
      position?: ComposePosition;
      targetHeading?: string;
      after?: AfterExtract;
    },
  ) {
    await this.scanNow(userId);
    const source = await this.findEditable(userId, id);
    if (source.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang bisa diekstrak.");
    if (input.targetId === id) throw new BadRequestException("Tujuan ekstrak harus catatan lain.");
    const base = await this.vaultBase(userId);
    const sourceAbs = this.inVault(base, source.path);
    const sourceRaw = await this.readChecked(sourceAbs, input.baseHash);

    let targetPath: string;
    let targetRaw: string | null = null;
    if (input.targetId) {
      const target = await this.findEditable(userId, input.targetId);
      if (target.kind !== "note") throw new BadRequestException("Tujuan harus catatan Markdown.");
      if (!input.targetHash) throw new BadRequestException("targetHash wajib diisi.");
      targetPath = target.path;
      targetRaw = await this.readChecked(this.inVault(base, target.path), input.targetHash);
    } else {
      if (!input.newTitle?.trim()) throw new BadRequestException("Pilih catatan tujuan atau isi judul catatan baru.");
      targetPath = await this.freeNotePath(base, input.folder ?? dirnameOf(source.path), input.newTitle);
    }
    let plan: ReturnType<typeof planExtract>;
    try {
      plan = planExtract({
        sourceRaw,
        from: input.from,
        to: input.to,
        text: input.text,
        sourcePath: source.path,
        targetPath,
        targetRaw,
        position: input.position ?? "end",
        targetHeading: input.targetHeading,
        after: input.after ?? "link",
        template: targetRaw === null ? await this.readOptional(userId, COMPOSER_TEMPLATE) : null,
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof ComposeConflict) throw new ConflictException(error.message);
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
    const targetAbs = this.inVault(base, targetPath);
    if (targetRaw !== null)
      await this.writeNoteFile(userId, targetPath, targetAbs, targetRaw, plan.targetText, "before_extract");
    else {
      await mkdir(dirname(targetAbs), { recursive: true });
      await writeFile(targetAbs, plan.targetText, { flag: "wx" });
    }
    const updatedLinks = await this.rewriteReferrers(
      userId,
      base,
      source.id,
      [source.path, targetPath],
      (raw) => rewriteExtractedLinks(raw, source.path, targetPath, plan.moved, plan.renames),
      "before_extract",
    );
    await this.updateCanvasRefs(userId, base, (file, subpath) => {
      if (file !== source.path || !subpath) return null;
      const block = /^#\^(.+)$/.exec(subpath);
      if (block)
        return plan.moved.blocks.has(block[1])
          ? { file: targetPath, subpath: `#^${plan.renames.get(block[1]) ?? block[1]}` }
          : null;
      return plan.moved.headings.has(
        subpath
          .slice(subpath.lastIndexOf("#") + 1)
          .trim()
          .toLowerCase(),
      )
        ? { file: targetPath, subpath }
        : null;
    });
    await this.writeNoteFile(userId, source.path, sourceAbs, sourceRaw, plan.sourceText, "before_extract");
    const created = await this.afterWrite(userId, targetPath);
    return { id: created?.id ?? null, path: targetPath, updatedLinks };
  }

  /**
   * Ganti nama tag se-vault (K10): semua catatan yang memakai tag itu (properti & `#tag`, termasuk turunan) + kueri grup graf.
   * Cermin 80-LifeOS dilewati (ditimpa setiap sinkron). Setiap catatan yang berubah tercatat di riwayat versi.
   */
  async renameTag(userId: string, input: { from: string; to: string }) {
    const from = cleanTag(input.from);
    const to = cleanTag(input.to);
    if (!from || !to) throw new BadRequestException("Nama tag tidak sah (tanpa spasi, minimal satu huruf).");
    if (from.toLowerCase() === to.toLowerCase() && from === to) return { notes: 0, occurrences: 0 };
    await this.scanNow(userId);
    const base = await this.vaultBase(userId);
    const rows = await this.prisma.knowledgeNote.findMany({ where: { userId, kind: "note" }, select: { path: true } });
    let notes = 0;
    let occurrences = 0;
    const failed: string[] = [];
    for (const { path } of rows) {
      if (isExportPath(path)) continue;
      const absolute = this.inVault(base, path);
      const raw = await readFile(absolute, "utf8").catch(() => null);
      if (raw === null) continue;
      try {
        const result = renameTagInNote(raw, from, to);
        if (!result.count) continue;
        await this.writeNoteFile(userId, path, absolute, raw, result.text, "before_tag");
        notes++;
        occurrences += result.count;
      } catch {
        // YAML rusak di satu catatan tidak menggagalkan yang lain; dilaporkan agar diperbaiki
        failed.push(path);
      }
    }
    await this.updatePrefs(userId, (prefs) => ({
      ...prefs,
      graphGroups: prefs.graphGroups.map((g) => ({ ...g, query: renameTagInQuery(g.query, from, to) })),
    }));
    await this.afterWrite(userId, null);
    return { notes, occurrences, failed };
  }

  /** Pindahkan ke `.trash` vault (bisa dipulihkan dari Obsidian / disk), bukan hapus permanen. */
  private async toTrash(base: string, path: string) {
    let trashPath = `${TRASH_DIR}/${path}`;
    if (await stat(join(base, ...trashPath.split("/"))).catch(() => null)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      trashPath = `${TRASH_DIR}/${parentFolder(path) ? `${parentFolder(path)}/` : ""}${stamp} ${baseName(path)}`;
    }
    const target = join(base, ...trashPath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await rename(this.inVault(base, path), target);
    return trashPath;
  }

  async deleteNote(userId: string, id: string) {
    const note = await this.findEditable(userId, id);
    const trash = await this.toTrash(await this.vaultBase(userId), note.path);
    await this.updatePrefs(userId, (prefs) => ({
      ...prefs,
      bookmarks: moveBookmarks(prefs.bookmarks, note.path, null),
    }));
    await this.afterWrite(userId, null);
    return { trash };
  }

  async deleteFolder(userId: string, input: string) {
    const base = await this.vaultBase(userId);
    const path = this.validPath(input, "folder");
    if (!(await stat(this.inVault(base, path)).catch(() => null))?.isDirectory())
      throw new NotFoundException("Folder tidak ditemukan.");
    const trash = await this.toTrash(base, path);
    await this.updatePrefs(userId, (prefs) => ({ ...prefs, bookmarks: moveBookmarks(prefs.bookmarks, path, null) }));
    await this.afterWrite(userId, null);
    return { trash };
  }

  /** Catatan yang menyebut judul/alias catatan ini tanpa `[[tautan]]` (Obsidian "Unlinked mentions"). */
  async unlinked(userId: string, id: string) {
    const note = await this.findNote(userId, id);
    const frontmatter = (note.frontmatter as Record<string, unknown> | null) ?? null;
    const names = [...new Set([note.title, noteName(note.path), ...noteAliases(frontmatter)])];
    const linking = new Set(
      (await this.prisma.knowledgeLink.findMany({ where: { userId, toId: note.id }, select: { fromId: true } })).map(
        (l) => l.fromId,
      ),
    );
    const candidates = await this.prisma.knowledgeNote.findMany({
      where: {
        userId,
        kind: "note",
        id: { not: note.id },
        OR: names.filter((n) => n.length >= 3).map((n) => ({ content: { contains: n, mode: "insensitive" as const } })),
      },
      select: { id: true, path: true, title: true, content: true },
      take: 300,
    });
    return candidates
      .filter((c) => !linking.has(c.id) && c.content && mentionsName(c.content, names))
      .slice(0, 50)
      .map((c) => ({
        id: c.id,
        path: c.path,
        title: c.title,
        snippet: searchSnippet(
          c.content,
          names.map((n) => n.toLowerCase()),
        ),
      }));
  }

  /** Tombol "Tautkan" pada sebutan tanpa tautan: ubah sebutan pertama di catatan `sourceId` menjadi `[[catatan ini]]`. */
  async linkMention(userId: string, id: string, sourceId: string) {
    const note = await this.findNote(userId, id);
    const source = await this.findEditable(userId, sourceId);
    if (source.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang bisa disunting.");
    const frontmatter = (note.frontmatter as Record<string, unknown> | null) ?? null;
    const absolute = this.inVault(await this.vaultBase(userId), source.path);
    const raw = await readFile(absolute, "utf8");
    const next = linkFirstMention(
      raw,
      [note.title, noteName(note.path), ...noteAliases(frontmatter)],
      noteName(note.path),
    );
    if (!next) throw new ConflictException("Sebutan tidak ditemukan lagi (catatan mungkin sudah berubah).");
    await this.writeNoteFile(userId, source.path, absolute, raw, next, "before_link");
    await this.afterWrite(userId, source.path);
    return { ok: true };
  }

  /**
   * Tugas lintas vault (K3): semua `- [ ]` dari catatan Markdown (dibaca dari isi tersimpan hasil pindai), kecuali templat,
   * cermin 80-LifeOS (salinan data LifeOS), dan ringkasan LifeOS di catatan harian.
   */
  async tasks(userId: string) {
    const notes = await this.prisma.knowledgeNote.findMany({
      where: {
        userId,
        kind: "note",
        content: { contains: "[" },
        NOT: [{ path: { startsWith: `${TEMPLATE_DIR}/` } }, { path: { startsWith: `${EXPORT_DIR}/` } }],
      },
      select: { id: true, path: true, title: true, content: true },
      orderBy: { path: "asc" },
    });
    const tasks: (VaultTask & { noteId: string; path: string; noteTitle: string })[] = [];
    for (const note of notes) {
      for (const task of parseTasks(note.content ?? "", { skipLifeosSummary: true })) {
        tasks.push({ ...task, noteId: note.id, path: note.path, noteTitle: note.title });
        if (tasks.length >= MAX_TASKS) return { tasks, truncated: true };
      }
    }
    return { tasks, truncated: false };
  }

  /** Centang / buka lagi tugas → tulis balik ke berkasnya (baris asli harus masih ada; tidak pernah menebak). */
  async toggleTask(
    userId: string,
    input: { noteId: string; index: number; raw: string; done: boolean; today: string },
  ) {
    const note = await this.findEditable(userId, input.noteId);
    if (note.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang punya tugas.");
    const absolute = this.inVault(await this.vaultBase(userId), note.path);
    const raw = await readFile(absolute, "utf8").catch(() => {
      throw new NotFoundException("Berkas catatan sudah tidak ada di vault.");
    });
    const result = applyTaskToggle(raw, input);
    if (!result)
      throw new ConflictException(
        "Tugas sudah berubah di tempat lain (Obsidian / perangkat lain). Daftar dimuat ulang.",
      );
    await this.writeNoteFile(userId, note.path, absolute, raw, result.text, "before_task");
    await this.afterWrite(userId, note.path);
    return { ok: true, line: result.line };
  }

  // ---------------------------------------------------------------- Riwayat versi (K7)

  /** Daftar versi catatan (terbaru dulu, tanpa isi). `current` = sama dengan isi berkas sekarang. */
  async versions(userId: string, id: string) {
    const note = await this.findNote(userId, id);
    if (note.kind !== "note") throw new BadRequestException("Hanya catatan Markdown yang punya riwayat versi.");
    const rows = await this.prisma.knowledgeNoteVersion.findMany({
      where: { userId, path: note.path },
      orderBy: { createdAt: "desc" },
      select: { id: true, hash: true, size: true, reason: true, createdAt: true },
    });
    return rows.map((r) => ({ ...r, current: r.hash === note.hash }));
  }

  async version(userId: string, id: string, versionId: string) {
    const note = await this.findNote(userId, id);
    const row = await this.prisma.knowledgeNoteVersion.findFirst({ where: { id: versionId, userId, path: note.path } });
    if (!row) throw new NotFoundException("Versi tidak ditemukan.");
    return { id: row.id, content: row.content, reason: row.reason, createdAt: row.createdAt, size: row.size };
  }

  /** Pulihkan versi: isi sekarang disimpan ke riwayat dulu, lalu berkas ditulis dengan isi versi itu. */
  async restoreVersion(userId: string, id: string, versionId: string, baseHash: string) {
    const note = await this.findEditable(userId, id);
    const row = await this.prisma.knowledgeNoteVersion.findFirst({ where: { id: versionId, userId, path: note.path } });
    if (!row) throw new NotFoundException("Versi tidak ditemukan.");
    const absolute = this.inVault(await this.vaultBase(userId), note.path);
    const current = await this.readChecked(absolute, baseHash);
    await this.writeNoteFile(userId, note.path, absolute, current, row.content, "before_restore");
    await this.afterWrite(userId, note.path);
    return this.source(userId, id);
  }

  // ---------------------------------------------------------------- Bases (K2): berkas `.base` Obsidian

  /** Semua berkas `.base` di vault (selain folder tersembunyi seperti `.trash`). */
  listBases(userId: string) {
    return this.listVaultFiles(userId, BASE_EXT);
  }

  /** Semua berkas berakhiran `ext` di vault (selain folder tersembunyi seperti `.trash`), maks. 300. */
  private async listVaultFiles(userId: string, ext: string) {
    const base = await this.vaultBase(userId);
    const result: { path: string; name: string; mtime: Date }[] = [];
    const visit = async (dir: string) => {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        if (result.length >= 300) return;
        const absolute = join(dir, item.name);
        if (item.isDirectory()) {
          if (!isIgnoredDir(item.name)) await visit(absolute);
        } else if (item.isFile() && item.name.toLowerCase().endsWith(ext)) {
          const path = relative(base, absolute).split(sep).join("/");
          result.push({ path, name: item.name.slice(0, -ext.length), mtime: (await stat(absolute)).mtime });
        }
      }
    };
    await visit(base);
    return result.sort((a, b) => a.path.localeCompare(b.path, "id"));
  }

  /** Buat berkas baru `<nama>[ n]<ext>` di folder (nama sama → diberi nomor, tidak pernah menimpa). */
  private async createVaultFile(
    userId: string,
    input: { folder?: string; name: string },
    ext: string,
    content: string,
  ) {
    const base = await this.vaultBase(userId);
    const folder = input.folder?.trim() ? this.validPath(input.folder, "folder") : "";
    const name = safeFileName(input.name);
    if (!name) throw new BadRequestException("Nama wajib diisi.");
    if (isExportPath(joinVaultPath(folder, "x"))) throw new BadRequestException("Folder 80-LifeOS dikelola LifeOS.");
    for (let n = 1; n < 100; n++) {
      const path = joinVaultPath(folder, `${name}${n > 1 ? ` ${n}` : ""}${ext}`);
      const absolute = this.inVault(base, path);
      await mkdir(dirname(absolute), { recursive: true });
      const created = await writeFile(absolute, content, { encoding: "utf8", flag: "wx" }).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "EEXIST") return false;
          throw error;
        },
      );
      if (created) return path;
    }
    throw new ConflictException("Terlalu banyak berkas bernama sama.");
  }

  // ---------------------------------------------------------------- Canvas (K8): berkas `.canvas` (JSON Canvas)

  listCanvases(userId: string) {
    return this.listVaultFiles(userId, CANVAS_EXT);
  }

  private canvasPath(input: string) {
    const path = this.validPath(input, "any");
    if (!isCanvasPath(path)) throw new BadRequestException("Berkas bukan canvas (.canvas).");
    return path;
  }

  async readCanvas(userId: string, input: string) {
    const path = this.canvasPath(input);
    const absolute = this.inVault(await this.vaultBase(userId), path);
    const raw = await readFile(absolute, "utf8").catch(() => {
      throw new NotFoundException("Berkas canvas tidak ditemukan di vault.");
    });
    if (Buffer.byteLength(raw) > MAX_CANVAS_BYTES) throw new BadRequestException("Berkas canvas terlalu besar.");
    const { data, error } = parseCanvas(raw);
    return { path, hash: sha256(raw), data, error, readOnly: isExportPath(path) };
  }

  async createCanvas(userId: string, input: { folder?: string; name: string }) {
    const path = await this.createVaultFile(userId, input, CANVAS_EXT, DEFAULT_CANVAS);
    await this.indexQueue.enqueueSource(userId, CANVAS_SOURCE, path);
    return this.readCanvas(userId, path);
  }

  /** Simpan canvas utuh (bentuk diperiksa); berubah di disk sejak dibuka → 409, tidak pernah menimpa. */
  async saveCanvas(userId: string, input: { path: string; data: Record<string, unknown>; baseHash: string }) {
    const path = this.canvasPath(input.path);
    if (isExportPath(path)) throw new BadRequestException("Folder 80-LifeOS dikelola LifeOS.");
    const invalid = validateCanvas(input.data);
    if (invalid) throw new BadRequestException(invalid);
    const absolute = this.inVault(await this.vaultBase(userId), path);
    await this.readChecked(absolute, input.baseHash);
    const next = serializeCanvas(input.data as CanvasData);
    if (Buffer.byteLength(next) > MAX_CANVAS_BYTES) throw new BadRequestException("Berkas canvas terlalu besar.");
    await this.writeAtomic(absolute, next);
    await this.indexQueue.enqueueSource(userId, CANVAS_SOURCE, path);
    return this.readCanvas(userId, path);
  }

  async deleteCanvas(userId: string, input: string) {
    const path = this.canvasPath(input);
    if (isExportPath(path)) throw new BadRequestException("Folder 80-LifeOS dikelola LifeOS.");
    const base = await this.vaultBase(userId);
    if (!(await stat(this.inVault(base, path)).catch(() => null)))
      throw new NotFoundException("Berkas canvas tidak ditemukan.");
    const trash = await this.toTrash(base, path);
    await this.indexQueue.enqueueSource(userId, CANVAS_SOURCE, path);
    return { trash };
  }

  private basePath(input: string) {
    const path = this.validPath(input, "any");
    if (!isBasePath(path)) throw new BadRequestException("Berkas bukan base (.base).");
    return path;
  }

  /** Isi base: objek hasil parse YAML + hash (untuk simpan tanpa menimpa perubahan dari Obsidian). */
  async readBase(userId: string, input: string) {
    const path = this.basePath(input);
    const absolute = this.inVault(await this.vaultBase(userId), path);
    const raw = await readFile(absolute, "utf8").catch(() => {
      throw new NotFoundException("Berkas base tidak ditemukan di vault.");
    });
    if (Buffer.byteLength(raw) > MAX_BASE_BYTES) throw new BadRequestException("Berkas base terlalu besar.");
    const { data, error } = parseBase(raw);
    return { path, hash: sha256(raw), data, error, readOnly: isExportPath(path) };
  }

  /** Base baru (satu tampilan tabel); nama sama → diberi nomor. */
  async createBase(userId: string, input: { folder?: string; name: string }) {
    return this.readBase(userId, await this.createVaultFile(userId, input, BASE_EXT, DEFAULT_BASE));
  }

  /** Simpan base (kunci utama ditulis ulang, sisanya dipertahankan). Berkas berubah di disk → 409. */
  async saveBase(userId: string, input: { path: string; data: Record<string, unknown>; baseHash: string }) {
    const path = this.basePath(input.path);
    if (isExportPath(path)) throw new BadRequestException("Folder 80-LifeOS dikelola LifeOS.");
    const invalid = validateBase(input.data);
    if (invalid) throw new BadRequestException(invalid);
    const absolute = this.inVault(await this.vaultBase(userId), path);
    const raw = await this.readChecked(absolute, input.baseHash);
    const next = updateBaseYaml(raw, input.data);
    if (Buffer.byteLength(next) > MAX_BASE_BYTES) throw new BadRequestException("Berkas base terlalu besar.");
    await this.writeAtomic(absolute, next);
    return this.readBase(userId, path);
  }

  async deleteBase(userId: string, input: string) {
    const path = this.basePath(input);
    if (isExportPath(path)) throw new BadRequestException("Folder 80-LifeOS dikelola LifeOS.");
    const base = await this.vaultBase(userId);
    if (!(await stat(this.inVault(base, path)).catch(() => null)))
      throw new NotFoundException("Berkas base tidak ditemukan.");
    return { trash: await this.toTrash(base, path) };
  }

  /** Kesehatan vault: properti bermasalah, tautan rusak, catatan yatim, judul ganda. */
  async health(userId: string) {
    const [notes, problems, unresolved] = await Promise.all([
      this.notes(userId),
      this.problems(userId),
      this.prisma.knowledgeLink.findMany({
        where: { userId, toId: null, kind: { not: "embed" } },
        select: { target: true, from: { select: { id: true, path: true, title: true } } },
        take: 500,
      }),
    ]);
    const health = vaultHealth(
      notes.map((n) => ({
        id: n.id,
        path: n.path,
        title: n.title,
        kind: n.kind,
        linksOut: n.links,
        linksIn: n.backlinks,
      })),
    );
    return {
      problems,
      broken: unresolved.map((l) => ({ target: l.target, note: l.from })),
      ...health,
    };
  }

  async prefs(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { knowledgePrefs: true } });
    return parsePrefs(user.knowledgePrefs);
  }

  async setPrefs(userId: string, input: unknown) {
    const prefs = parsePrefs(input);
    // Pengaturan cermin 80-LifeOS (`export`, KnowledgeExportService) ikut disimpan di kolom yang sama — dipertahankan
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { knowledgePrefs: true },
    });
    const keep = (current.knowledgePrefs as Record<string, unknown> | null)?.export;
    await this.prisma.user.update({
      where: { id: userId },
      data: { knowledgePrefs: { ...prefs, ...(keep ? { export: keep } : {}) } as unknown as Prisma.InputJsonValue },
    });
    return prefs;
  }

  /** Folder vault user di disk, atau null bila vault belum dipilih / konektor nonaktif (dipakai cermin 80-LifeOS). */
  async vaultDir(userId: string) {
    if (!this.root) return null;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { knowledgeVault: true } });
    return user?.knowledgeVault ? this.vaultPath(user.knowledgeVault) : null;
  }

  private async updatePrefs(userId: string, change: (prefs: KnowledgePrefs) => KnowledgePrefs) {
    await this.setPrefs(userId, change(await this.prefs(userId)));
  }
  /**
   * Gambar sematan `![[gambar.png]]` dibaca langsung dari vault (tidak disalin ke storage, tidak di-OCR). `name` = path
   * lengkap atau nama berkas saja (dicari di seluruh vault, path terpendek menang — seperti Obsidian).
   */
  async attachment(userId: string, name: string) {
    const base = await this.vaultBase(userId);
    const ext = extname(name).toLowerCase();
    const mime = IMAGE_TYPES[ext];
    if (!mime) throw new BadRequestException("Hanya gambar (PNG, JPG, GIF, WEBP, BMP) yang bisa ditampilkan.");
    let path: string | null = null;
    if (name.includes("/")) path = this.validPath(name, "any");
    else {
      const wanted = name.toLowerCase();
      const found: string[] = [];
      const visit = async (dir: string, depth: number) => {
        if (depth > 12 || found.length) return;
        const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const item of items)
          if (item.isFile() && item.name.toLowerCase() === wanted) found.push(join(dir, item.name));
        if (found.length) return;
        for (const item of items)
          if (item.isDirectory() && !isIgnoredDir(item.name)) await visit(join(dir, item.name), depth + 1);
      };
      await visit(base, 0);
      if (found[0]) path = relative(base, found[0]).split(sep).join("/");
    }
    if (!path) throw new NotFoundException("Gambar tidak ditemukan di vault.");
    const absolute = this.inVault(base, path);
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException("Gambar tidak ditemukan di vault.");
    if (info.size > 10 * 1024 * 1024) throw new BadRequestException("Gambar lebih dari 10 MB.");
    return { data: await readFile(absolute), mime };
  }
}
