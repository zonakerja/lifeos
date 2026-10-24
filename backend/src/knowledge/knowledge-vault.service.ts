import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type FSWatcher, watch } from "node:fs";
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { AiIndexQueueService } from "../ai/index/ai-index-queue.service";
import { ASSET_SOURCE, OBSIDIAN_SOURCE } from "../ai/index/index-text";
import { AuthUser } from "../common/types/auth-user";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { KNOWLEDGE_VAULT_CONTEXT } from "./knowledge-constants";
import {
  buildLinkResolver,
  INBOX_DIR,
  inboxFileName,
  inboxNote,
  isIgnoredDir,
  isSafeVaultFolder,
  knowledgeMetadata,
  MAX_NOTE_BYTES,
  MAX_VAULT_FILE_BYTES,
  noteProblems,
  parseNote,
  sha256,
  VAULT_FILE_TYPES,
  vaultEntryKind,
} from "./vault-parser";

/** Jeda setelah perubahan berkas terakhir sebelum vault dibaca ulang (Obsidian menyimpan berkali-kali saat mengetik). */
const WATCH_DEBOUNCE_MS = 3_000;
/** Pindai ulang berkala sebagai cadangan pemantau berkas (mis. Syncthing mengganti berkas lewat rename). */
const RESCAN_INTERVAL_MS = 10 * 60_000;
/** Batas jumlah entri per vault agar folder yang salah pilih (mis. seluruh drive) tidak membebani server. */
const MAX_ENTRIES = 5_000;
/** Templat vault awal (struktur folder §10.3 docs/AI-AGENT.md), ikut image backend. */
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
 * menyalin lampiran (PDF, DOCX, …) ke storage agar diekstrak, lalu mengantre indeks RAG. Obsidian tetap sumber
 * kebenaran: LifeOS hanya membaca, kecuali menulis catatan usulan ke `00-Inbox/`.
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

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly indexQueue: AiIndexQueueService,
  ) {
    const dir = config.get<string>("KNOWLEDGE_VAULTS_DIR");
    this.root = dir ? resolve(dir) : null;
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
    this.interval = setInterval(() => void this.rescanAll(), RESCAN_INTERVAL_MS);
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
    await this.prisma.aiChunk.deleteMany({ where: { userId, sourceType: OBSIDIAN_SOURCE } });
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
    this.setStatus(userId, { lastScanAt: new Date().toISOString(), lastError: undefined, changed });
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
}
