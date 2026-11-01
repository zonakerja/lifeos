import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, Worker } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { redisConnectionOptions } from "../redis/redis.module";
import { ROBOT_JOBS, summarizeRobotJob } from "../robot/robot-jobs";
import { SYSTEM_INFO } from "../robot/robot-logic";
import { RobotService } from "../robot/robot.service";
import type { AuthUser } from "../common/types/auth-user";
import { type AutomationKind, type AutomationSchedule, currentYear } from "./automation-logic";
import { AUTOMATION_QUEUE, type AutomationJobData, AutomationService } from "./automation.service";

/**
 * Pelaksana otomasi: **satu tugas sekaligus** untuk semua user (robot memakai satu browser Chromium; tugas berurutan
 * lebih ramah ke sistem pemerintah). Tugas yang bertepatan dengan tombol di sistem yang sama → dilewati (skipped).
 */
@Injectable()
export class AutomationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationWorkerService.name);
  private worker?: Worker<AutomationJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly robot: RobotService,
    private readonly automation: AutomationService,
  ) {}

  onModuleInit() {
    this.worker = new Worker(AUTOMATION_QUEUE, (job) => this.execute(job), {
      concurrency: 1,
      connection: redisConnectionOptions(this.config),
      // Sinkron klasifikasi (±1.000 baris) bisa beberapa menit — perpanjang kunci agar tidak dianggap macet
      lockDuration: 10 * 60_000,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`Automation job ${job?.id ?? "unknown"} failed: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async execute(job: Job<AutomationJobData>) {
    const data = job.data;
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true, role: true },
    });
    const row = user
      ? await this.prisma.automationJob.findUnique({ where: { userId_kind: { userId: data.userId, kind: data.kind } } })
      : null;
    // Jadwal yatim (user dihapus / jadwal dimatikan tetapi job sudah terlanjur dibuat) → buang tanpa riwayat
    if (!user || !row || (data.trigger === "schedule" && !row.enabled)) {
      if (data.trigger === "schedule") await this.automation.dropScheduler(data.userId, data.kind);
      return;
    }

    const run = await this.automation.startRun(data);
    const pause = await this.pauseReason(data.userId, data.kind);
    if (pause) {
      await this.automation.finishRun(run.id, "skipped", pause);
      return;
    }
    const timezone = (row.schedule as unknown as AutomationSchedule).timezone ?? "Asia/Jakarta";
    try {
      const result = await this.dispatch(user, data.kind, data.trigger, currentYear(timezone));
      // Jaga sesi yang menemukan sesi kedaluwarsa = gagal (memicu notifikasi), bukan berhasil
      const expired = data.kind.endsWith("_session") && (result as { status?: string }).status !== "active";
      await this.automation.finishRun(run.id, expired ? "failed" : "ok", summarizeRobotJob(data.kind, result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.automation.finishRun(run.id, error instanceof ConflictException ? "skipped" : "failed", message);
    }
  }

  /**
   * Sesi belum ada / kedaluwarsa → tugas dilewati tanpa membuka sistem (tidak membanjiri halaman login sistem pemerintah);
   * user mendapat notifikasi lewat `/automation/alerts` dan jadwal berjalan lagi sendiri setelah login ulang.
   */
  private async pauseReason(userId: string, kind: AutomationKind) {
    const system = ROBOT_JOBS[kind].system;
    const label = SYSTEM_INFO[system].label;
    const connector = await this.prisma.robotConnector.findUnique({
      where: { userId_system: { userId, system } },
      select: { status: true, sessionEnc: true },
    });
    if (!connector?.sessionEnc) return `Belum ada sesi login ${label} — login dulu di tab Connector.`;
    if (connector.status === "expired") {
      return `Sesi ${label} kedaluwarsa — jadwal dijeda sampai Anda login ulang di tab Connector.`;
    }
    return null;
  }

  private dispatch(user: AuthUser, kind: AutomationKind, trigger: "schedule" | "manual", year: number) {
    switch (kind) {
      case "ekinerja_session":
      case "srikandi_session":
        return this.robot.check(user.id, ROBOT_JOBS[kind].system, trigger);
      case "ekinerja_skp":
        return this.robot.syncEkinerjaSkp(user, year, trigger);
      case "ekinerja_renaksi":
        return this.robot.syncEkinerjaRenaksi(user, year, trigger);
      case "srikandi_letters":
        return this.robot.syncSrikandiLetters(user, trigger);
      case "srikandi_references":
        return this.robot.syncSrikandiReferences(user, undefined, trigger);
      case "srikandi_classifications":
        return this.robot.syncSrikandiReferences(user, ["classification"], trigger);
    }
  }
}
