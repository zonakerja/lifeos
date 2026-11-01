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
import { Queue } from "bullmq";
import type { AutomationJob } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { redisConnectionOptions } from "../redis/redis.module";
import { ROBOT_JOBS, type RobotJobEvent } from "../robot/robot-jobs";
import { RobotService } from "../robot/robot.service";
import {
  AUTOMATION_KINDS,
  automationAlerts,
  type AutomationKind,
  type AutomationSchedule,
  DEFAULT_SCHEDULES,
  isAutomationKind,
  parseSchedule,
  parseSchedulerId,
  schedulerId,
  toCron,
} from "./automation-logic";

export const AUTOMATION_QUEUE = "automation";

export interface AutomationJobData {
  userId: string;
  kind: AutomationKind;
  trigger: "schedule" | "manual";
  /** Baris riwayat yang sudah dibuat saat "Jalankan sekarang" (status queued). */
  runId?: string;
}

/** Riwayat yang disimpan per user per jenis tugas. */
const KEEP_RUNS = 50;
const ACTIVE = ["queued", "running"];

/**
 * Otomasi terjadwal (Tools → Otomasi): jadwal per user di `automation_jobs` → job scheduler BullMQ (cron + zona waktu).
 * Tabel = sumber kebenaran; saat start jadwal di Redis disamakan dengan tabel. Tugas yang sama tetap bisa dipicu tombol
 * di menu asal (riwayatnya ikut tercatat lewat kait RobotService) atau "Jalankan sekarang".
 */
@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private readonly queue: Queue<AutomationJobData>;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly robot: RobotService,
  ) {
    this.queue = new Queue(AUTOMATION_QUEUE, {
      connection: redisConnectionOptions(config),
      // Satu percobaan: mengulang otomatis = membuka sistem pemerintah berkali-kali; jadwal berikutnya akan mencoba lagi
      defaultJobOptions: { attempts: 1, removeOnComplete: 200, removeOnFail: 500 },
    });
  }

  async onModuleInit() {
    this.robot.onJobFinished((event) => this.recordButtonRun(event));
    // Run yang tertinggal "berjalan" saat server berhenti tidak akan selesai lagi
    await this.prisma.automationRun.updateMany({
      where: { status: "running" },
      data: { status: "failed", message: "Terhenti karena server dimulai ulang.", finishedAt: new Date() },
    });
    void this.reconcile().catch((error: unknown) =>
      this.logger.error(`Gagal menyamakan jadwal otomasi: ${error instanceof Error ? error.message : String(error)}`),
    );
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  /** Samakan job scheduler di Redis dengan tabel: yang aktif dipasang ulang, sisanya dihapus. */
  private async reconcile() {
    const enabled = await this.prisma.automationJob.findMany({ where: { enabled: true } });
    const wanted = new Set(enabled.map((job) => schedulerId(job.userId, job.kind as AutomationKind)));
    for (const scheduler of await this.queue.getJobSchedulers(0, -1)) {
      const id = scheduler.key;
      if (parseSchedulerId(id) && !wanted.has(id)) await this.queue.removeJobScheduler(id);
    }
    for (const job of enabled) await this.applyScheduler(job);
  }

  private async applyScheduler(job: AutomationJob) {
    if (!isAutomationKind(job.kind)) return;
    const id = schedulerId(job.userId, job.kind);
    if (!job.enabled) {
      await this.queue.removeJobScheduler(id);
      return;
    }
    const schedule = job.schedule as unknown as AutomationSchedule;
    await this.queue.upsertJobScheduler(
      id,
      { pattern: toCron(schedule), tz: schedule.timezone },
      { name: job.kind, data: { userId: job.userId, kind: job.kind, trigger: "schedule" } },
    );
  }

  /** Semua jenis tugas milik user (baris bawaan dibuat sekali, nonaktif). */
  private async ensureJobs(userId: string) {
    await this.prisma.automationJob.createMany({
      data: AUTOMATION_KINDS.map((kind) => ({ userId, kind, schedule: DEFAULT_SCHEDULES[kind] as object })),
      skipDuplicates: true,
    });
    return this.prisma.automationJob.findMany({ where: { userId } });
  }

  async list(userId: string) {
    const rows = await this.ensureJobs(userId);
    const active = await this.prisma.automationRun.findMany({
      where: { userId, status: { in: ACTIVE } },
      orderBy: { createdAt: "desc" },
    });
    const views = await Promise.all(
      rows.filter((row) => isAutomationKind(row.kind)).map((row) => this.view(row, active)),
    );
    return views.sort((a, b) => AUTOMATION_KINDS.indexOf(a.kind) - AUTOMATION_KINDS.indexOf(b.kind));
  }

  async update(userId: string, kind: string, input: { enabled?: boolean; schedule?: unknown }) {
    const valid = this.requireKind(kind);
    await this.ensureJobs(userId);
    let schedule: AutomationSchedule | undefined;
    if (input.schedule !== undefined) {
      const parsed = parseSchedule(input.schedule);
      if (typeof parsed === "string") throw new BadRequestException(parsed);
      schedule = parsed;
    }
    const row = await this.prisma.automationJob.update({
      where: { userId_kind: { userId, kind: valid } },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(schedule ? { schedule: schedule as object } : {}),
      },
    });
    try {
      await this.applyScheduler(row);
    } catch (error) {
      // Pola ditolak BullMQ (jarang: validasi kita lebih ketat) → kembalikan pesan yang bisa dibaca
      throw new BadRequestException(`Jadwal tidak bisa dipasang: ${error instanceof Error ? error.message : error}`);
    }
    return this.view(row, []);
  }

  /** "Jalankan sekarang": masuk antrian yang sama dengan jadwal (berurutan, tidak bentrok dengan tugas lain). */
  async runNow(userId: string, kind: string) {
    const valid = this.requireKind(kind);
    await this.ensureJobs(userId);
    const active = await this.prisma.automationRun.findFirst({
      where: { userId, kind: valid, status: { in: ACTIVE } },
    });
    if (active) throw new ConflictException(`"${ROBOT_JOBS[valid].label}" sudah dalam antrian / sedang berjalan.`);
    const run = await this.prisma.automationRun.create({
      data: { userId, kind: valid, trigger: "manual", status: "queued" },
    });
    await this.queue.add(valid, { userId, kind: valid, trigger: "manual", runId: run.id });
    return run;
  }

  /** Hal robot yang perlu ditindaklanjuti (sesi kedaluwarsa / belum login / tugas gagal) — lonceng & toast frontend. */
  async alerts(userId: string) {
    // Tanpa membuat baris konektor/jadwal baru: user yang belum memakai robot tidak mendapat notifikasi apa pun
    const [connectors, jobs] = await Promise.all([
      this.prisma.robotConnector.findMany({
        where: { userId },
        select: { system: true, status: true, sessionEnc: true, lastCheckAt: true },
      }),
      this.prisma.automationJob.findMany({ where: { userId } }),
    ]);
    return automationAlerts(
      connectors.map(({ sessionEnc, ...c }) => ({ ...c, hasSession: !!sessionEnc })),
      jobs,
    );
  }

  runs(userId: string, kind?: string, take = 20) {
    return this.prisma.automationRun.findMany({
      where: { userId, ...(kind ? { kind: this.requireKind(kind) } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(take, 1), KEEP_RUNS),
    });
  }

  /** Dipakai worker: catat mulai (membuat baris untuk jadwal; baris "Jalankan sekarang" sudah ada). */
  async startRun(data: AutomationJobData) {
    const startedAt = new Date();
    if (data.runId) {
      const existing = await this.prisma.automationRun.findUnique({ where: { id: data.runId } });
      if (existing) {
        return this.prisma.automationRun.update({ where: { id: existing.id }, data: { status: "running", startedAt } });
      }
    }
    return this.prisma.automationRun.create({
      data: { userId: data.userId, kind: data.kind, trigger: data.trigger, status: "running", startedAt },
    });
  }

  async finishRun(runId: string, status: "ok" | "failed" | "skipped", message: string) {
    const run = await this.prisma.automationRun.update({
      where: { id: runId },
      data: { status, message: message.slice(0, 500), finishedAt: new Date() },
    });
    await this.touchJob(run.userId, run.kind, status, message, run.finishedAt ?? new Date());
    await this.prune(run.userId, run.kind);
  }

  /** Jadwal user sudah tidak ada / dimatikan → hapus job scheduler-nya. */
  async dropScheduler(userId: string, kind: AutomationKind) {
    await this.queue.removeJobScheduler(schedulerId(userId, kind));
  }

  /** Tombol sinkron di menu asal (Laporan Kinerja / SRIKANDI) → ikut tercatat di riwayat Otomasi. */
  private async recordButtonRun(event: RobotJobEvent) {
    if (event.trigger !== "button") return;
    const user = await this.prisma.user.findUnique({ where: { id: event.userId }, select: { id: true } });
    if (!user) return;
    await this.ensureJobs(event.userId);
    const status = event.ok ? "ok" : "failed";
    await this.prisma.automationRun.create({
      data: {
        userId: event.userId,
        kind: event.kind,
        trigger: "button",
        status,
        message: event.message.slice(0, 500),
        startedAt: event.startedAt,
        finishedAt: event.finishedAt,
      },
    });
    await this.touchJob(event.userId, event.kind, status, event.message, event.finishedAt);
    await this.prune(event.userId, event.kind);
  }

  private async touchJob(userId: string, kind: string, status: string, message: string, at: Date) {
    await this.prisma.automationJob.updateMany({
      where: { userId, kind },
      data: { lastRunAt: at, lastStatus: status, lastMessage: message.slice(0, 500) },
    });
  }

  private async prune(userId: string, kind: string) {
    const keep = await this.prisma.automationRun.findMany({
      where: { userId, kind },
      orderBy: { createdAt: "desc" },
      skip: KEEP_RUNS - 1,
      take: 1,
      select: { createdAt: true },
    });
    if (keep[0]) {
      await this.prisma.automationRun.deleteMany({
        where: { userId, kind, createdAt: { lt: keep[0].createdAt }, status: { notIn: ACTIVE } },
      });
    }
  }

  private requireKind(kind: string): AutomationKind {
    if (!isAutomationKind(kind)) throw new NotFoundException("Jenis otomasi tidak dikenal.");
    return kind;
  }

  private async view(row: AutomationJob, active: { kind: string; id: string; status: string; createdAt: Date }[]) {
    const kind = row.kind as AutomationKind;
    const schedule = row.schedule as unknown as AutomationSchedule;
    let nextRunAt: Date | null = null;
    if (row.enabled) {
      try {
        const scheduler = await this.queue.getJobScheduler(schedulerId(row.userId, kind));
        if (scheduler?.next) nextRunAt = new Date(scheduler.next);
      } catch {
        // Redis tidak terjangkau → tanpa perkiraan jadwal berikutnya
      }
    }
    const current = active.find((run) => run.kind === kind);
    return {
      kind,
      system: ROBOT_JOBS[kind].system,
      label: ROBOT_JOBS[kind].label,
      enabled: row.enabled,
      schedule,
      cron: toCron(schedule),
      nextRunAt,
      lastRunAt: row.lastRunAt,
      lastStatus: row.lastStatus,
      lastMessage: row.lastMessage,
      activeRun: current ? { id: current.id, status: current.status, createdAt: current.createdAt } : null,
    };
  }
}
