import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { domainDelegate } from "../records/record-delegate";
import { rowToPayload } from "../records/record-mapper";
import { RECORD_TABLES, type RecordType } from "../records/record-schema";
import { KnowledgeVaultService } from "./knowledge-vault.service";
import {
  buildExport,
  EXPORT_DIR,
  EXPORT_KINDS,
  type ExportInput,
  type ExportKind,
  type ExportSettings,
  isManagedNote,
  parseExportSettings,
} from "./vault-export";

/** Pemeriksaan perubahan data user yang menyalakan cermin (murah: jumlah + waktu ubah terakhir per tabel). */
const CHECK_INTERVAL_MS = 60_000;

/** Record type yang dibaca untuk cermin (kunci input `buildExport`). */
const SOURCES: Record<Exclude<keyof ExportInput, "appUrl" | "notebooks">, RecordType> = {
  freeNotes: "free_note",
  lists: "list",
  aiNotes: "ai_note",
  areas: "para_area",
  projects: "para_project",
  activities: "para_activity",
  tasks: "para_task",
  schedules: "schedule",
  resources: "para_resource",
};

interface ExportStatus {
  running?: boolean;
  lastRunAt?: string;
  lastError?: string;
  files?: number;
  written?: number;
  removed?: number;
}

/**
 * Cermin satu arah hasil kerja LifeOS → vault Obsidian (`80-LifeOS/`, logika murni `vault-export.ts`). Berjalan saat
 * data user berubah (diperiksa tiap menit), saat diaktifkan, dan lewat tombol Sinkronkan sekarang. Hanya data milik
 * user sendiri; hanya berkas bertanda `sumber: lifeos` yang ditimpa/dihapus (catatan user di folder itu aman).
 */
@Injectable()
export class KnowledgeExportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KnowledgeExportService.name);
  private readonly appUrl: string;
  private readonly status = new Map<string, ExportStatus>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly fingerprints = new Map<string, string>();
  private interval?: NodeJS.Timeout;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly vault: KnowledgeVaultService,
  ) {
    this.appUrl = (config.get<string>("CORS_ORIGIN") ?? "").split(",")[0].trim();
  }

  onModuleInit() {
    if (!this.vault.configured) return;
    this.interval = setInterval(() => void this.checkAll(), CHECK_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  // ---------------------------------------------------------------- Pengaturan

  private async rawPrefs(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { knowledgePrefs: true } });
    return (user.knowledgePrefs as Record<string, unknown> | null) ?? {};
  }

  async settings(userId: string) {
    const settings = parseExportSettings((await this.rawPrefs(userId)).export);
    const s = this.status.get(userId) ?? {};
    return {
      ...settings,
      folder: EXPORT_DIR,
      vaultReady: !!(await this.vault.vaultDir(userId)),
      running: !!s.running || this.running.has(userId),
      lastRunAt: s.lastRunAt ?? null,
      lastError: s.lastError ?? null,
      files: s.files ?? null,
      written: s.written ?? null,
      removed: s.removed ?? null,
    };
  }

  async updateSettings(userId: string, input: { enabled?: boolean; kinds?: Partial<Record<ExportKind, boolean>> }) {
    const prefs = await this.rawPrefs(userId);
    const current = parseExportSettings(prefs.export);
    const next: ExportSettings = {
      enabled: input.enabled ?? current.enabled,
      kinds: { ...current.kinds, ...pick(input.kinds) },
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: { knowledgePrefs: { ...prefs, export: next } as unknown as Prisma.InputJsonValue },
    });
    this.fingerprints.delete(userId);
    if (next.enabled) void this.run(userId).catch(() => undefined);
    return this.settings(userId);
  }

  // ---------------------------------------------------------------- Menjalankan

  private async checkAll() {
    const users = await this.prisma.user.findMany({
      where: { knowledgeVault: { not: null } },
      select: { id: true, knowledgePrefs: true },
    });
    for (const user of users) {
      if (!parseExportSettings((user.knowledgePrefs as Record<string, unknown> | null)?.export).enabled) continue;
      const print = await this.fingerprint(user.id).catch(() => null);
      if (!print || print === this.fingerprints.get(user.id)) continue;
      await this.run(user.id).catch(() => undefined);
    }
  }

  /** Sidik jari data: jumlah + waktu ubah terakhir per tabel (hapus = jumlah berubah / `updated_at` soft delete). */
  private async fingerprint(userId: string) {
    const parts = [
      ...Object.values(SOURCES).map(
        (type) =>
          `SELECT '${type}' AS t, count(*)::int AS n, max(updated_at) AS m FROM "${RECORD_TABLES[type].table}" WHERE user_id = $1 AND deleted_at IS NULL`,
      ),
      `SELECT 'nb' AS t, count(*)::int AS n, max(updated_at) AS m FROM "notebooks" WHERE user_id = $1`,
      `SELECT 'nbn' AS t, count(*)::int AS n, max(n.updated_at) AS m FROM "notebook_notes" n JOIN "notebooks" b ON b.id = n.notebook_id WHERE b.user_id = $1`,
      `SELECT 'nbm' AS t, count(*)::int AS n, max(m.created_at) AS m FROM "notebook_messages" m JOIN "notebooks" b ON b.id = m.notebook_id WHERE b.user_id = $1`,
      `SELECT 'nbs' AS t, count(*)::int AS n, max(s.updated_at) AS m FROM "notebook_sources" s JOIN "notebooks" b ON b.id = s.notebook_id WHERE b.user_id = $1`,
    ];
    const rows = await this.prisma.$queryRawUnsafe<{ t: string; n: number; m: Date | null }[]>(
      parts.join(" UNION ALL "),
      userId,
    );
    return rows.map((r) => `${r.t}:${r.n}:${r.m?.getTime() ?? 0}`).join("|");
  }

  /** Sinkronkan sekarang (satu proses per user; permintaan saat berjalan menunggu proses itu). */
  run(userId: string): Promise<void> {
    const current = this.running.get(userId);
    if (current) return current;
    const job = this.doRun(userId)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Cermin 80-LifeOS user ${userId} gagal: ${message}`);
        this.setStatus(userId, { lastError: message });
        throw error;
      })
      .finally(() => {
        this.running.delete(userId);
        this.setStatus(userId, { running: false });
      });
    this.running.set(userId, job);
    return job;
  }

  private async doRun(userId: string) {
    const base = await this.vault.vaultDir(userId);
    if (!base) throw new Error("Vault Obsidian belum dipilih.");
    const settings = parseExportSettings((await this.rawPrefs(userId)).export);
    this.setStatus(userId, { running: true });
    const print = await this.fingerprint(userId);
    const files = settings.enabled ? buildExport(await this.load(userId), settings.kinds) : new Map<string, string>();

    let written = 0;
    for (const [path, text] of files) {
      const absolute = this.inside(base, path);
      const existing = await readFile(absolute, "utf8").catch(() => null);
      if (existing === text) continue;
      // Berkas buatan user sendiri yang kebetulan bernama sama tidak pernah ditimpa
      if (existing !== null && !isManagedNote(existing)) continue;
      await mkdir(dirname(absolute), { recursive: true });
      const temp = `${absolute}.${randomUUID().slice(0, 8)}.lifeos-tmp`;
      await writeFile(temp, text, "utf8");
      await rename(temp, absolute);
      written++;
    }
    const removed = await this.removeStale(base, new Set(files.keys()));
    this.fingerprints.set(userId, print);
    this.setStatus(userId, {
      lastRunAt: new Date().toISOString(),
      lastError: undefined,
      files: files.size,
      written,
      removed,
    });
    if (written || removed) await this.vault.scanNow(userId);
  }

  /** Hapus semua berkas cermin dari vault (tombol "Hapus berkas cermin"). */
  async clear(userId: string) {
    await this.running.get(userId)?.catch(() => undefined);
    const base = await this.vault.vaultDir(userId);
    if (!base) return;
    const removed = await this.removeStale(base, new Set());
    this.fingerprints.delete(userId);
    this.setStatus(userId, { removed, written: 0, files: 0 });
    if (removed) await this.vault.scanNow(userId);
  }

  /** Hapus berkas cermin yang datanya sudah tidak ada (hanya bertanda `sumber: lifeos`) + folder yang jadi kosong. */
  private async removeStale(base: string, keep: Set<string>) {
    const root = join(base, EXPORT_DIR);
    let removed = 0;
    const visit = async (dir: string): Promise<boolean> => {
      const items = await readdir(dir, { withFileTypes: true }).catch(() => null);
      if (!items) return false;
      let empty = true;
      for (const item of items) {
        const absolute = join(dir, item.name);
        if (item.isDirectory()) {
          if (item.name.startsWith(".") || !(await visit(absolute))) empty = false;
          continue;
        }
        const path = relative(base, absolute).split(sep).join("/");
        if (keep.has(path) || !item.name.toLowerCase().endsWith(".md")) {
          empty = false;
          continue;
        }
        const raw = await readFile(absolute, "utf8").catch(() => "");
        if (!isManagedNote(raw)) {
          empty = false;
          continue;
        }
        await rm(absolute, { force: true });
        removed++;
      }
      if (empty && dir !== root) await rmdir(dir).catch(() => undefined);
      return empty;
    };
    await visit(root);
    return removed;
  }

  private inside(base: string, path: string) {
    const absolute = resolve(base, ...path.split("/"));
    const back = relative(join(base, EXPORT_DIR), absolute);
    if (!back || back.startsWith("..")) throw new Error(`Path cermin di luar ${EXPORT_DIR}: ${path}`);
    return absolute;
  }

  private async load(userId: string): Promise<ExportInput> {
    const input = { appUrl: this.appUrl } as ExportInput;
    for (const [key, type] of Object.entries(SOURCES) as [keyof typeof SOURCES, RecordType][]) {
      const rows = await domainDelegate(this.prisma, type).findMany({
        where: { userId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      input[key] = rows.map((row) => ({
        ...rowToPayload(RECORD_TABLES[type], row),
        id: String(row.clientId),
        updatedAt: row.updatedAt,
      }));
    }
    const notebooks = await this.prisma.notebook.findMany({
      where: { userId },
      include: {
        sources: { select: { title: true, kind: true, url: true, recordType: true, recordId: true } },
        notes: { select: { id: true, title: true, content: true, origin: true, updatedAt: true } },
        messages: { select: { role: true, content: true, citations: true, createdAt: true } },
      },
    });
    input.notebooks = notebooks.map((nb) => ({
      ...nb,
      sources: nb.sources.map((s) => ({ ...s, kind: String(s.kind) })),
    }));
    return input;
  }

  private setStatus(userId: string, patch: ExportStatus) {
    this.status.set(userId, { ...this.status.get(userId), ...patch });
  }
}

const pick = (kinds?: Partial<Record<ExportKind, boolean>>) =>
  Object.fromEntries(EXPORT_KINDS.filter((k) => typeof kinds?.[k] === "boolean").map((k) => [k, kinds![k]])) as Partial<
    Record<ExportKind, boolean>
  >;
