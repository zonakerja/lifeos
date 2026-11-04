import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response as ExpressResponse } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { AiService } from "../ai/ai.service";
import type { AuthUser } from "../common/types/auth-user";
import { type ApiScope, hashToken, looksLikeToken, normalizeScopes } from "../integrations/api-token-logic";
import type { TokenPrincipal } from "../integrations/api-tokens.service";
import { PrismaService } from "../prisma/prisma.service";
import { RequestsService } from "../requests/requests.service";
import {
  chatCompletion,
  chunkFactory,
  claudeRequest,
  ClaudeTurnMemory,
  replayableBlocks,
  runClaude,
} from "./agent-claude";
import {
  AGENT_TOKEN_NAME,
  AGENT_TOKEN_PREFIX,
  DEFAULT_AGENT_SCOPES,
  modelsResponse,
  OPENAI_COMPAT_BASE,
  prepareChatBody,
  upstreamErrorSummary,
} from "./agent-llm";
import {
  type AgentRunView,
  type AgentSkill,
  isAgentOwner,
  parseRun,
  parseSkillFile,
  parseSkills,
  sessionIdFor,
  SKILL_NAME,
  skillRunInput,
} from "./agent-logic";

interface TrackedRun {
  userId: string;
  kind: "chat" | "skill";
  input: string;
  requestId?: string;
  skill?: string;
  startedAt: string;
  last?: AgentRunView;
}

/** Batas run yang diingat (riwayat singkat di memori; isi percakapan lengkap ada di sesi Hermes). */
const MAX_TRACKED = 200;

/** Batas satu panggilan model agen (langkah agen bisa panjang: banyak alat + berkas). */
const MODEL_TIMEOUT_MS = 10 * 60_000;

/** Panggilan model agen terakhir (untuk kartu Siapkan agen; di memori, hilang saat backend restart). */
export interface ModelCall {
  at: string;
  ok: boolean;
  provider: string;
  model: string;
  error?: string;
  /** Pemakaian token (saat ini hanya Claude): dasar memeriksa prompt caching & biaya */
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/** Error berformat OpenAI untuk Hermes (klien OpenAI membaca `error.message`). */
const llmError = (res: ExpressResponse, status: number, message: string) =>
  res.status(status).json({ error: { message, type: "lifeos_agent_error" } });

/**
 * Asisten Agen (docs/AI-AGENT.md §23): backend LifeOS ↔ API server Hermes (OpenAI-compatible, `Authorization: Bearer
 * HERMES_API_KEY`). Kunci tidak pernah sampai ke browser. Hermes memakai token MCP milik satu user, sehingga hanya
 * `HERMES_OWNER_EMAIL` yang boleh memakai agen ini. Tugas berjalan sebagai **run** asinkron (`/v1/runs`) yang di-poll.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly runs = new Map<string, TrackedRun>();
  private lastModelCall: ModelCall | null = null;
  private readonly claudeTurns = new ClaudeTurnMemory();

  constructor(
    private readonly config: ConfigService,
    private readonly requests: RequestsService,
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  get configured() {
    return !!this.config.get<string>("HERMES_URL") && !!this.config.get<string>("HERMES_API_KEY");
  }

  private isOwner(user: AuthUser) {
    return isAgentOwner(this.config.get<string>("HERMES_OWNER_EMAIL"), user.email);
  }

  private requireOwner(user: AuthUser) {
    if (!this.configured) {
      throw new UnprocessableEntityException("Agen belum diatur (HERMES_URL & HERMES_API_KEY di server).");
    }
    if (!this.isOwner(user)) {
      throw new ForbiddenException("Asisten Agen hanya untuk pemilik agen (HERMES_OWNER_EMAIL).");
    }
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}, timeoutMs = 20_000) {
    const base = this.config.get<string>("HERMES_URL")!.replace(/\/+$/, "");
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("HERMES_API_KEY")}`,
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new UnprocessableEntityException(
        "Hermes tidak dapat dihubungi. Nyalakan: wsl -e sh /mnt/d/Development/Application/LifeOS/infra/hermes/up.sh",
      );
    }
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 300);
      // Error layanan agen → 422/429 (bukan 401/5xx: memicu refresh sesi / pesan "server tidak dapat dihubungi")
      if (response.status === 429) throw new UnprocessableEntityException("Agen sedang penuh. Coba lagi sebentar.");
      if (response.status === 404) throw new NotFoundException("Tugas agen tidak ditemukan di Hermes.");
      throw new UnprocessableEntityException(`Hermes menolak (${response.status}): ${text || response.statusText}`);
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  async status(user: AuthUser) {
    const base = { configured: this.configured, owner: this.isOwner(user) };
    if (!base.configured || !base.owner) return { ...base, reachable: false };
    const setup = await this.setupState(user);
    try {
      const health = await this.call<{ status?: string }>("/health", {}, 4_000);
      const models = await this.call<{ data?: { id?: string }[] }>("/v1/models", {}, 4_000).catch(() => null);
      const skills = await this.skills(user).catch(() => []);
      return {
        ...base,
        setup,
        reachable: true,
        health: typeof health.status === "string" ? health.status : "ok",
        model: models?.data?.[0]?.id ?? null,
        skills: skills.length,
        lifeosSkills: skills.filter((s) => s.lifeos).length,
      };
    } catch (error) {
      return { ...base, setup, reachable: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ---------------------------------------------------------------- Penyiapan agen (tanpa terminal)

  /** Hash kunci bersama Hermes ↔ LifeOS = hash token akses "Agen Hermes" di tabel `api_tokens`. */
  private agentKeyHash() {
    const key = this.config.get<string>("HERMES_API_KEY") ?? "";
    return looksLikeToken(key) ? hashToken(key) : null;
  }

  /** Keadaan penyiapan: izin agen (token), model yang akan dipakai, dan panggilan model terakhir. */
  private async setupState(user: AuthUser) {
    const hash = this.agentKeyHash();
    const [token, credential] = await Promise.all([
      hash
        ? this.prisma.apiToken.findFirst({
            where: { tokenHash: hash, userId: user.id },
            select: { id: true, scopes: true, lastUsedAt: true, createdAt: true },
          })
        : null,
      this.ai.agentCredential(user.id),
    ]);
    return {
      keyValid: !!hash,
      token: token ? { ...token, scopes: normalizeScopes(token.scopes) } : null,
      model: credential ? { provider: credential.provider, model: credential.model } : null,
      lastModelCall: this.lastModelCall,
    };
  }

  /**
   * Tombol "Siapkan agen": buat/perbarui token akses "Agen Hermes" milik pemilik agen dengan hash `HERMES_API_KEY`.
   * Hermes sudah memegang kunci itu (`API_SERVER_KEY`), jadi tidak ada rahasia yang perlu diketik atau disalin.
   * Mencabut token di Pengaturan → Integrasi = memutus akses agen ke data & model.
   */
  async setup(user: AuthUser, scopes?: string[]) {
    this.requireOwner(user);
    const hash = this.agentKeyHash();
    if (!hash) {
      throw new UnprocessableEntityException(
        "HERMES_API_KEY di server harus 24–128 karakter huruf/angka/_/- (buat dengan: openssl rand -hex 32).",
      );
    }
    const chosen: ApiScope[] = scopes ? normalizeScopes(scopes) : DEFAULT_AGENT_SCOPES;
    if (!chosen.length) throw new UnprocessableEntityException("Pilih minimal satu izin untuk agen.");
    // Kunci yang sama pernah disiapkan untuk akun lain (pemilik agen berganti) → dilepas dari akun itu
    await this.prisma.apiToken.deleteMany({ where: { tokenHash: hash, userId: { not: user.id } } });
    await this.prisma.apiToken.upsert({
      where: { tokenHash: hash },
      create: {
        userId: user.id,
        name: AGENT_TOKEN_NAME,
        tokenHash: hash,
        prefix: AGENT_TOKEN_PREFIX,
        scopes: chosen,
        expiresAt: null,
      },
      update: { scopes: chosen, name: AGENT_TOKEN_NAME },
    });
    return this.status(user);
  }

  // ---------------------------------------------------------------- Proxy model (OpenAI-compatible) untuk Hermes

  /** `GET /agent/llm/v1/models`: satu model `lifeos-agent` (konteks sesuai provider pilihan user). */
  async models(principal: TokenPrincipal) {
    const credential = await this.ai.agentCredential(principal.user.id);
    return modelsResponse(credential?.provider ?? null, credential?.model ?? null);
  }

  /**
   * `POST /agent/llm/v1/chat/completions`: teruskan ke endpoint OpenAI-compatible provider user dengan key tersimpan
   * (streaming diteruskan apa adanya). Hanya token dengan izin `ai:model`.
   */
  async proxyChat(principal: TokenPrincipal, body: unknown, res: ExpressResponse) {
    if (!principal.scopes.includes("ai:model")) {
      return llmError(res, 403, "Token agen tidak punya izin Model AI (ai:model). Siapkan ulang agen di LifeOS.");
    }
    const credential = await this.ai.agentCredential(principal.user.id);
    if (!credential) {
      return llmError(res, 400, "Model AI agen belum diatur: simpan API key di LifeOS → Pengaturan → Model AI.");
    }
    if (credential.provider === "anthropic") return this.proxyClaude(principal.user.id, credential, body, res);
    const payload = prepareChatBody(body, credential.provider, credential.model);
    if (!payload) return llmError(res, 400, "Permintaan chat tidak valid (messages kosong).");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    res.on("close", () => controller.abort());
    const call: ModelCall = {
      at: new Date().toISOString(),
      ok: true,
      provider: credential.provider,
      model: credential.model,
    };
    try {
      const upstream = await fetch(`${OPENAI_COMPAT_BASE[credential.provider]}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!upstream.ok || !upstream.body) {
        const summary = upstreamErrorSummary(upstream.status, await upstream.text().catch(() => ""));
        this.lastModelCall = { ...call, ok: false, error: summary };
        this.logger.warn(`Model agen ${credential.provider}/${credential.model} ditolak ${summary}`);
        return llmError(res, upstream.status || 502, `${credential.provider}: ${summary}`);
      }
      this.lastModelCall = call;
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
      res.setHeader("Cache-Control", "no-cache");
      await new Promise<void>((done) => {
        const stream = Readable.fromWeb(upstream.body as WebReadableStream);
        stream.on("error", () => {
          res.destroy();
          done();
        });
        stream.on("end", done);
        stream.pipe(res);
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      const message = aborted ? "waktu habis / dibatalkan" : error instanceof Error ? error.message : String(error);
      this.lastModelCall = { ...call, ok: false, error: message };
      if (!res.headersSent) return llmError(res, aborted ? 504 : 502, `Provider tidak dapat dihubungi: ${message}`);
      res.end();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Proxy untuk Claude: Messages API native (prompt caching, blok pemikiran) dengan keluaran format OpenAI. */
  private async proxyClaude(
    userId: string,
    credential: { apiKey: string; model: string },
    body: unknown,
    res: ExpressResponse,
  ) {
    const { apiKey, model } = credential;
    const request = claudeRequest(body, model, (toolIds) => this.claudeTurns.recall(userId, toolIds));
    if (!request) return llmError(res, 400, "Permintaan chat tidak valid (messages kosong).");

    const streaming = (body as { stream?: unknown }).stream === true;
    const client = new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    const call: ModelCall = { at: new Date().toISOString(), ok: true, provider: "anthropic", model };
    const created = Math.floor(Date.now() / 1000);
    const id = `chatcmpl-${randomUUID()}`;
    const chunks = chunkFactory(id, model, created);
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const message = await runClaude(
        client,
        request,
        controller.signal,
        () => {
          if (!streaming) return;
          res.status(200);
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          send(chunks.start());
        },
        (text) => {
          if (streaming) send(chunks.text(text));
        },
      );
      this.claudeTurns.remember(userId, replayableBlocks(message.content));
      const { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } = message.usage;
      this.lastModelCall = {
        ...call,
        usage: {
          input: input_tokens,
          output: output_tokens,
          cacheRead: cache_read_input_tokens ?? 0,
          cacheWrite: cache_creation_input_tokens ?? 0,
        },
      };
      if (!streaming) {
        res.json(chatCompletion(message, created));
        return;
      }
      chunks.finish(message).forEach(send);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      const aborted = controller.signal.aborted;
      const status = error instanceof Anthropic.APIError && error.status ? error.status : aborted ? 504 : 502;
      const detail = error instanceof Anthropic.APIError ? JSON.stringify(error.error ?? error.message) : String(error);
      const raw = error instanceof Error ? error.message : detail;
      const summary = upstreamErrorSummary(status, detail);
      this.lastModelCall = { ...call, ok: false, error: summary };
      this.logger.warn(`Model agen anthropic/${model} gagal ${summary}`);
      if (res.writableEnded || res.destroyed) return;
      if (!res.headersSent) {
        // Saldo kredit habis dikembalikan Anthropic sebagai 400 → 402 agar Hermes tidak mengira permintaannya salah
        return llmError(res, /credit balance/i.test(raw) ? 402 : status, `anthropic: ${summary}`);
      }
      send({ error: { message: `anthropic: ${summary}`, code: status } });
      res.end();
    }
  }

  /**
   * Skill LifeOS dibaca dari folder repo (`HERMES_SKILLS_DIR`, bawaan `../agents/hermes/skills`) — folder yang sama
   * dipasang ke container Hermes. Skill bawaan Hermes ditambahkan dari `/v1/skills` bila endpoint itu berfungsi.
   */
  async skills(user: AuthUser): Promise<AgentSkill[]> {
    this.requireOwner(user);
    const local = await this.localSkills();
    const remote = await this.call<unknown>("/v1/skills", {}, 5_000)
      .then(parseSkills)
      .catch(() => [] as AgentSkill[]);
    const names = new Set(local.map((s) => s.name));
    return [...local, ...remote.filter((s) => !s.lifeos && !names.has(s.name))];
  }

  private async localSkills(): Promise<AgentSkill[]> {
    const dir = resolve(
      this.config.get<string>("HERMES_SKILLS_DIR") || join(process.cwd(), "..", "agents", "hermes", "skills"),
    );
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const skills: AgentSkill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const text = await readFile(join(dir, entry.name, "SKILL.md"), "utf8").catch(() => null);
      const skill = text ? parseSkillFile(text, entry.name) : null;
      if (skill) skills.push(skill);
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Pesan chat → run di sesi Hermes milik user (percakapan berlanjut lewat `session_id`). */
  async chat(user: AuthUser, message: string, conversation: string) {
    this.requireOwner(user);
    return this.start(user, { kind: "chat", input: message, sessionId: sessionIdFor(user.id, conversation) });
  }

  /** Jalankan skill atas satu pengajuan milik user (hasil disimpan agen ke pengajuan lewat MCP → Approval). */
  async runSkill(user: AuthUser, requestId: string, skill: string) {
    this.requireOwner(user);
    if (!SKILL_NAME.test(skill)) throw new UnprocessableEntityException("Nama skill tidak valid.");
    const request = await this.requests.get(user.id, requestId);
    if (!["baru", "diproses", "menunggu_verifikasi"].includes(request.status)) {
      throw new UnprocessableEntityException("Pengajuan sudah diputuskan — agen tidak dijalankan.");
    }
    return this.start(user, {
      kind: "skill",
      input: skillRunInput(skill, request),
      sessionId: sessionIdFor(user.id, `req-${request.id}`),
      requestId: request.id,
      skill,
    });
  }

  private async start(
    user: AuthUser,
    run: { kind: "chat" | "skill"; input: string; sessionId: string; requestId?: string; skill?: string },
  ) {
    const body = await this.call<{ run_id?: string; status?: string }>("/v1/runs", {
      method: "POST",
      body: { input: run.input, session_id: run.sessionId },
    });
    if (!body.run_id) throw new UnprocessableEntityException("Hermes tidak mengembalikan ID tugas.");
    this.runs.set(body.run_id, {
      userId: user.id,
      kind: run.kind,
      input: run.input,
      requestId: run.requestId,
      skill: run.skill,
      startedAt: new Date().toISOString(),
    });
    while (this.runs.size > MAX_TRACKED) this.runs.delete(this.runs.keys().next().value!);
    return { runId: body.run_id, status: body.status ?? "started" };
  }

  private tracked(user: AuthUser, runId: string) {
    const run = this.runs.get(runId);
    if (!run || run.userId !== user.id) throw new NotFoundException("Tugas agen tidak ditemukan.");
    return run;
  }

  async run(user: AuthUser, runId: string) {
    this.requireOwner(user);
    const run = this.tracked(user, runId);
    if (run.last?.done) return { ...run.last, requestId: run.requestId, skill: run.skill };
    run.last = parseRun(runId, await this.call<unknown>(`/v1/runs/${encodeURIComponent(runId)}`));
    return { ...run.last, requestId: run.requestId, skill: run.skill };
  }

  async stop(user: AuthUser, runId: string) {
    this.requireOwner(user);
    this.tracked(user, runId);
    await this.call(`/v1/runs/${encodeURIComponent(runId)}/stop`, { method: "POST", body: {} });
    return { stopping: true };
  }

  /** Tugas agen terakhir milik user (sejak backend dinyalakan). */
  recent(user: AuthUser) {
    this.requireOwner(user);
    return [...this.runs.entries()]
      .filter(([, r]) => r.userId === user.id)
      .reverse()
      .slice(0, 20)
      .map(([runId, r]) => ({
        runId,
        kind: r.kind,
        skill: r.skill ?? null,
        requestId: r.requestId ?? null,
        input: r.kind === "chat" ? r.input.slice(0, 200) : null,
        startedAt: r.startedAt,
        status: r.last?.status ?? "running",
      }));
  }
}
