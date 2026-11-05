import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, Queue, Worker } from "bullmq";
import type { AgentPolicy, AgentRun, Request } from "../generated/prisma/client";
import type { AuthUser } from "../common/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { RecordsService } from "../records/records.service";
import { redisConnectionOptions } from "../redis/redis.module";
import type { AutoDecision } from "../requests/requests.service";
import { RequestsService } from "../requests/requests.service";
import { type OutgoingEntry, registerBlockers } from "../robot/srikandi-register";
import { RobotService } from "../robot/robot.service";
import { isAgentOwner, policyRunInput } from "./agent-logic";
import { type AssetCheck, decidePolicy, matchPolicy } from "./agent-policy";

export const AGENT_SEND_QUEUE = "agent-send";

interface SendJob {
  userId: string;
  requestId: string;
  registerId: string;
}

export interface PolicyInput {
  name: string;
  skill: string;
  requestKind: string;
  groupCodes: string[];
  mode: string;
  threshold: number;
  criticalFields: string[];
  valueTolerance: number;
  dailyLimit: number;
  holdMinutes: number;
  registerTemplate?: string | null;
}

/** Isian entri Register yang tidak disalin dari templat (milik naskah masing-masing). */
const OWN_FIELDS = [
  "id",
  "userId",
  "file",
  "uploadId",
  "attachments",
  "subject",
  "summary",
  "number",
  "reference",
  "status",
  "sourceType",
  "sourceId",
  "sourceTitle",
  "submittedAt",
  "letterId",
  "draftLinked",
  "notes",
  "createdAt",
  "share",
];

const DAY_MS = 24 * 3_600_000;
const asList = <T>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);

/**
 * Kebijakan Otomatis (docs/AI-AGENT.md §24): pengajuan baru yang cocok dengan aturan user dikerjakan skill agen, lalu
 * hasilnya diputuskan **server** (`decidePolicy`). Mode auto menyetujui dan — setelah masa tunda yang bisa dibatalkan —
 * menyimpan konsep di Log Naskah Keluar SRIKANDI lewat robot. Kirim Konsep / TTE tetap ditekan user di SRIKANDI.
 */
@Injectable()
export class AgentPolicyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentPolicyService.name);
  private readonly queue: Queue<SendJob>;
  private worker?: Worker<SendJob>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly requests: RequestsService,
    private readonly records: RecordsService,
    private readonly robot: RobotService,
  ) {
    this.queue = new Queue(AGENT_SEND_QUEUE, {
      connection: redisConnectionOptions(config),
      defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    });
  }

  onModuleInit() {
    this.requests.onCreated((request) => this.onRequestCreated(request));
    this.worker = new Worker(AGENT_SEND_QUEUE, (job) => this.send(job), {
      concurrency: 1,
      connection: redisConnectionOptions(this.config),
      lockDuration: 10 * 60_000,
    });
    this.worker.on("failed", (job, error) =>
      this.logger.error(`Kiriman otomatis ${job?.id ?? "?"} gagal: ${error.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  private requireOwner(user: AuthUser) {
    if (!isAgentOwner(this.config.get<string>("HERMES_OWNER_EMAIL"), user.email)) {
      throw new ForbiddenException("Kebijakan Otomatis hanya untuk pemilik agen (HERMES_OWNER_EMAIL).");
    }
  }

  private async authUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    return user as AuthUser | null;
  }

  // ---------------------------------------------------------------- Aturan

  async list(user: AuthUser) {
    this.requireOwner(user);
    const [policies, account, decided] = await Promise.all([
      this.prisma.agentPolicy.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
      this.prisma.user.findUnique({ where: { id: user.id }, select: { agentAutoPaused: true } }),
      this.prisma.request.findMany({
        where: { userId: user.id, autoDecision: { not: { equals: null } as never } },
        select: { status: true, autoDecision: true },
        take: 1000,
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return {
      paused: !!account?.agentAutoPaused,
      policies: policies.map((p) => {
        const mine = decided.filter((d) => (d.autoDecision as unknown as AutoDecision | null)?.policyId === p.id);
        // Kecocokan shadow: keputusan aturan vs keputusan akhir pemilik (hanya pengajuan yang sudah diputuskan pemilik)
        const judged = mine.filter((d) => {
          const a = d.autoDecision as unknown as AutoDecision;
          return !a.applied && ["disetujui", "dikirim", "ditolak"].includes(d.status);
        });
        const agree = judged.filter((d) => {
          const a = d.autoDecision as unknown as AutoDecision;
          return (a.outcome === "approve") === (d.status !== "ditolak");
        }).length;
        return {
          ...p,
          stats: {
            decisions: mine.length,
            applied: mine.filter((d) => (d.autoDecision as unknown as AutoDecision).applied).length,
            judged: judged.length,
            agree,
          },
        };
      }),
    };
  }

  async save(user: AuthUser, input: PolicyInput, id?: string) {
    this.requireOwner(user);
    if (input.registerTemplate) {
      await this.records.findOne("srikandi_outgoing", input.registerTemplate, {}, user).catch(() => {
        throw new UnprocessableEntityException("Entri Register yang dipilih sebagai templat tidak ditemukan.");
      });
    }
    const data = {
      ...input,
      groupCodes: input.groupCodes.map((g) => g.trim().toUpperCase()).filter(Boolean),
      registerTemplate: input.registerTemplate || null,
    };
    if (!id) return this.prisma.agentPolicy.create({ data: { ...data, userId: user.id } });
    await this.own(user.id, id);
    return this.prisma.agentPolicy.update({ where: { id }, data });
  }

  async remove(user: AuthUser, id: string) {
    this.requireOwner(user);
    await this.own(user.id, id);
    await this.prisma.agentPolicy.delete({ where: { id } });
    return { ok: true };
  }

  /** Sakelar darurat: menahan pemicu, keputusan, dan kiriman otomatis baru. */
  async setPaused(user: AuthUser, paused: boolean) {
    this.requireOwner(user);
    await this.prisma.user.update({ where: { id: user.id }, data: { agentAutoPaused: paused } });
    return { paused };
  }

  private async own(userId: string, id: string) {
    const policy = await this.prisma.agentPolicy.findFirst({ where: { id, userId } });
    if (!policy) throw new NotFoundException("Kebijakan tidak ditemukan.");
    return policy;
  }

  // ---------------------------------------------------------------- Pemicu & keputusan

  /** Pengajuan baru milik pemilik agen yang cocok dengan aturan aktif → tugas agen antri (dimulai worker tugas agen). */
  private async onRequestCreated(request: Request) {
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: { email: true, agentAutoPaused: true },
    });
    if (!user || user.agentAutoPaused || !isAgentOwner(this.config.get<string>("HERMES_OWNER_EMAIL"), user.email))
      return;
    const policy = matchPolicy(await this.prisma.agentPolicy.findMany({ where: { userId: request.userId } }), request);
    if (!policy) return;
    await this.prisma.agentRun.create({
      data: {
        userId: request.userId,
        kind: "skill",
        trigger: "policy",
        skill: policy.skill,
        requestId: request.id,
        policyId: policy.id,
        input: policyRunInput(policy.skill, request, policy.name),
        status: "queued",
      },
    });
  }

  /** Tugas agen dari aturan selesai → server memutuskan menurut aturan (bukan agen). */
  async finalize(run: AgentRun) {
    if (run.trigger !== "policy" || !run.policyId || !run.requestId) return;
    const policy = await this.prisma.agentPolicy.findUnique({ where: { id: run.policyId } });
    const request = await this.prisma.request.findUnique({ where: { id: run.requestId } });
    if (!policy || !request) return;
    const account = await this.prisma.user.findUnique({ where: { id: run.userId }, select: { agentAutoPaused: true } });
    const check = request.assetCheck as (AssetCheck & { available?: boolean }) | null;
    const decision = decidePolicy({
      mode: policy.mode,
      threshold: policy.threshold,
      check,
      masterAvailable: check?.available !== false,
      documents: asList(request.documents).length,
      requestStatus: request.status,
      paused: !!account?.agentAutoPaused,
      usedToday: await this.usedToday(run.userId),
      dailyLimit: policy.dailyLimit,
    });
    if (run.status !== "completed") {
      decision.outcome = "review";
      decision.apply = false;
      decision.reasons.unshift(
        `Tugas agen ${run.status === "failed" ? "gagal" : "tidak selesai"}: ${run.error ?? run.status}.`,
      );
    }
    if (decision.apply && !policy.registerTemplate) {
      decision.apply = false;
      decision.reasons.push("Kebijakan belum punya templat Register Naskah Keluar.");
    }
    const autoDecision: AutoDecision = {
      policyId: policy.id,
      policyName: policy.name,
      mode: policy.mode,
      outcome: decision.outcome,
      applied: decision.apply,
      reasons: decision.reasons,
      score: check?.score ?? null,
      decidedAt: new Date().toISOString(),
    };
    const updated = await this.requests.policyDecide(run.userId, request.id, autoDecision);
    if (decision.apply) await this.scheduleSend(run.userId, updated, policy);
  }

  private async usedToday(userId: string) {
    const since = Date.now() - DAY_MS;
    const rows = await this.prisma.request.findMany({
      where: { userId, updatedAt: { gte: new Date(since) }, autoDecision: { not: { equals: null } as never } },
      select: { autoDecision: true },
    });
    return rows.filter((r) => {
      const a = r.autoDecision as unknown as AutoDecision;
      return a.applied && new Date(a.decidedAt).getTime() >= since;
    }).length;
  }

  /** Entri Register dari templat aturan + dokumen terakhir pengajuan, lalu kiriman tertunda (masa tunda). */
  private async scheduleSend(userId: string, request: Request, policy: AgentPolicy) {
    const user = await this.authUser(userId);
    if (!user) return;
    try {
      const template = await this.records.findOne("srikandi_outgoing", policy.registerTemplate!, {}, user);
      const copied = Object.fromEntries(
        Object.entries(template.payload as Record<string, unknown>).filter(([key]) => !OWN_FIELDS.includes(key)),
      );
      const document = asList<{ uploadId: string; name: string }>(request.documents).at(-1)!;
      const file = {
        uploadId: document.uploadId,
        name: document.name,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        owned: false,
      };
      const entry = {
        ...copied,
        autoNumber: true,
        subject: (request.subject || request.title).slice(0, 300),
        summary: request.title.slice(0, 500),
        uploadId: file.uploadId,
        file,
        status: "draft",
        sourceType: "request",
        sourceId: request.id,
        sourceTitle: request.title,
        notes: `Dibuat otomatis oleh kebijakan ${policy.name}.`,
        createdAt: new Date().toISOString(),
      };
      const registerId = `reg-auto-${request.id}`;
      await this.records.upsert("srikandi_outgoing", registerId, { payload: entry }, user);
      const blockers = registerBlockers(entry as unknown as OutgoingEntry);
      if (blockers.length) {
        await this.requests.patchAutoDecision(request.id, {
          registerId,
          error: `Register belum lengkap (${blockers.join(", ")}): lengkapi lalu daftarkan dari menu SRIKANDI.`,
        });
        return;
      }
      const sendAt = new Date(Date.now() + policy.holdMinutes * 60_000).toISOString();
      await this.queue.add(
        "send",
        { userId, requestId: request.id, registerId },
        { delay: policy.holdMinutes * 60_000, jobId: `send-${request.id}` },
      );
      await this.requests.patchAutoDecision(request.id, { registerId, sendAt });
    } catch (error) {
      await this.requests.patchAutoDecision(request.id, {
        error: `Register tidak dibuat: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /** Masa tunda habis → robot menyimpan KONSEP di Log Naskah Keluar (tidak pernah Kirim Konsep). */
  private async send(job: Job<SendJob>) {
    const { userId, requestId, registerId } = job.data;
    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    const decision = request?.autoDecision as AutoDecision | null;
    if (!request || !decision || decision.cancelledAt || decision.sentAt || request.status !== "disetujui") return;
    const user = await this.authUser(userId);
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { agentAutoPaused: true } });
    if (!user) return;
    if (account?.agentAutoPaused) {
      await this.requests.patchAutoDecision(requestId, {
        error: "Ditahan sakelar darurat: daftarkan dari menu SRIKANDI bila tetap ingin dikirim.",
      });
      return;
    }
    try {
      await this.robot.registerSrikandiOutgoing(user, registerId, false);
      const updated = await this.requests.patchAutoDecision(requestId, {
        sentAt: new Date().toISOString(),
        error: undefined,
      });
      if (updated) {
        await this.requests.emitStatus(
          updated,
          "disetujui",
          "Konsep naskah tersimpan di SRIKANDI dan menunggu penandatanganan.",
        );
      }
    } catch (error) {
      await this.requests.patchAutoDecision(requestId, {
        error: `Konsep gagal disimpan ke SRIKANDI: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /** Batalkan kiriman selama masa tunda → keputusan kembali ke pemilik. */
  async cancel(user: AuthUser, requestId: string) {
    this.requireOwner(user);
    const request = await this.prisma.request.findFirst({ where: { id: requestId, userId: user.id } });
    const decision = request?.autoDecision as AutoDecision | null;
    if (!request || !decision?.sendAt || decision.sentAt || decision.cancelledAt) {
      throw new UnprocessableEntityException("Tidak ada kiriman otomatis yang bisa dibatalkan.");
    }
    await this.queue.remove(`send-${requestId}`);
    await this.requests.patchAutoDecision(
      requestId,
      { cancelledAt: new Date().toISOString() },
      "Kiriman otomatis dibatalkan pemilik",
    );
    return { ok: true };
  }
}
