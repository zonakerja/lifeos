import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { domainDelegate } from "../records/record-delegate";
import { rowToPayload } from "../records/record-mapper";
import { RECORD_TABLES, type RecordType } from "../records/record-schema";
import { KnowledgeVaultService } from "./knowledge-vault.service";
import {
  buildDailyNote,
  buildDailySection,
  DAILY_TEMPLATE,
  dailyPath,
  isYmd,
  type DailyAgenda,
  type DailyTask,
  type DailyTodo,
} from "./vault-daily";
import { EXPORT_DIR } from "./vault-parser";

type Row = Record<string, unknown> & { id: string };
const MAX_OVERDUE = 20;

/** Catatan harian (K1 docs/AI-AGENT.md §25.6): `Harian/YYYY-MM-DD.md` + ringkasan Planner/Productivity tanggal itu. */
@Injectable()
export class KnowledgeDailyService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: KnowledgeVaultService,
    config: ConfigService,
  ) {
    this.appUrl = (config.get<string>("CORS_ORIGIN") ?? "").split(",")[0].trim();
  }

  /** Buka catatan harian tanggal itu; bila belum ada dibuat sekali (berkas yang sudah ada tidak pernah ditimpa). */
  async open(userId: string, date: string) {
    if (!isYmd(date)) throw new BadRequestException("Tanggal tidak valid (format YYYY-MM-DD).");
    const path = dailyPath(date);
    const existing = await this.prisma.knowledgeNote.findUnique({
      where: { userId_path: { userId, path } },
      select: { id: true },
    });
    if (existing) return { id: existing.id, path, created: false };
    const section = await this.section(userId, date);
    const template = await this.vault.readOptional(userId, DAILY_TEMPLATE);
    const content = buildDailyNote({ date, section, template, now: new Date() });
    return this.vault.createAt(userId, path, content);
  }

  private async rows(userId: string, type: RecordType, where: Record<string, unknown>, take?: number) {
    const rows = await domainDelegate(this.prisma, type).findMany({
      where: { userId, deletedAt: null, ...where },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(take ? { take } : {}),
    });
    return rows.map((row) => ({ ...rowToPayload(RECORD_TABLES[type], row), id: String(row.clientId) }) as Row);
  }

  private async section(userId: string, date: string) {
    const day = new Date(`${date}T00:00:00.000Z`); // kolom @db.Date dibandingkan sebagai tanggal UTC
    const [agenda, todos, tasks, overdue] = await Promise.all([
      this.rows(userId, "schedule", {
        OR: [
          { startDate: { lte: day }, endDate: { gte: day } },
          { startDate: day, endDate: null },
          { startDate: null, date: day },
        ],
      }),
      this.rows(userId, "todo", { date: day }),
      this.rows(userId, "para_task", { dueDate: day }),
      this.rows(userId, "para_task", { dueDate: { lt: day }, completed: { not: true } }, MAX_OVERDUE),
    ]);
    const parentIds = [...new Set([...tasks, ...overdue].map((t) => t.projectId).filter((v): v is string => !!v))];
    const [projects, activities] = parentIds.length
      ? await Promise.all([
          this.rows(userId, "para_project", { clientId: { in: parentIds } }),
          this.rows(userId, "para_activity", { clientId: { in: parentIds } }),
        ])
      : [[], []];
    const parents = new Map<string, { title: string; kind: "project" | "activity"; areaId?: string | null }>();
    for (const p of projects) parents.set(p.id, { title: String(p.title ?? "Project"), kind: "project" });
    for (const a of activities)
      parents.set(a.id, {
        title: String(a.title ?? "Kegiatan"),
        kind: "activity",
        areaId: (a.areaId as string) ?? null,
      });
    // Berkas cermin 80-LifeOS (bila cermin menyala) → tautan wiki agar catatan harian ikut tergambar di graf
    const mirrorNotes = await this.prisma.knowledgeNote.findMany({
      where: { userId, path: { startsWith: `${EXPORT_DIR}/` } },
      select: { path: true, frontmatter: true },
    });
    const mirror = new Map<string, string>();
    for (const n of mirrorNotes) {
      const fm = n.frontmatter as Record<string, unknown> | null;
      if (fm?.sumber === "lifeos" && typeof fm.lifeos_id === "string") mirror.set(fm.lifeos_id, n.path);
    }
    return buildDailySection({
      date,
      appUrl: this.appUrl,
      agenda: agenda as unknown as DailyAgenda[],
      todos: todos as unknown as DailyTodo[],
      tasks: tasks as unknown as DailyTask[],
      overdue: overdue as unknown as DailyTask[],
      parents,
      mirror,
    });
  }
}
