import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FilledRow, RenaksiRow } from "./ekinerja-renaksi";

/** Sesi browser (format `storageState` Playwright): cookie + localStorage + IndexedDB. */
export type StorageState = Record<string, unknown>;

export interface RobotTarget {
  baseUrl: string;
  extraHosts: string[];
  loginMarkers: string[];
  storageState: StorageState | null;
}

export interface PageInfo {
  url: string;
  title: string;
  loggedIn: boolean;
}

/** Keadaan login otomatis: `done` = sudah masuk; `captcha`/`otp` = menunggu ketikan pengguna. */
export interface LoginState extends PageInfo {
  stage: "done" | "captcha" | "otp" | "credentials" | "unknown";
  message?: string;
  /** PNG base64 gambar CAPTCHA */
  captchaImage?: string;
}

/**
 * Klien HTTP ke service robot (container `robot`, docs/AI-AGENT.md §21). Service tidak aktif / gagal dihubungi →
 * 422 dengan petunjuk (bukan ≥ 502 yang di frontend berarti "server LifeOS tidak dapat dihubungi").
 */
@Injectable()
export class RobotClient {
  constructor(private readonly config: ConfigService) {}

  get configured() {
    return !!(this.config.get<string>("ROBOT_URL") && this.config.get<string>("ROBOT_TOKEN"));
  }

  private async call(path: string, init: RequestInit = {}, timeoutMs = 90_000) {
    if (!this.configured) {
      throw new UnprocessableEntityException("Service robot belum diatur (ROBOT_URL & ROBOT_TOKEN di server).");
    }
    const base = this.config.get<string>("ROBOT_URL")!.replace(/\/$/, "");
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.get<string>("ROBOT_TOKEN")}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new UnprocessableEntityException(
        "Service robot tidak dapat dihubungi. Nyalakan: docker compose --profile robot up -d robot",
      );
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new UnprocessableEntityException(`Robot: ${body?.message ?? `galat ${response.status}`}`);
    }
    return response;
  }

  private async json<T>(path: string, body?: unknown, method = "POST", timeoutMs?: number) {
    const response = await this.call(
      path,
      { method, body: body === undefined ? undefined : JSON.stringify(body) },
      timeoutMs,
    );
    return (await response.json()) as T;
  }

  async health() {
    if (!this.configured) return { configured: false, reachable: false };
    try {
      const base = this.config.get<string>("ROBOT_URL")!.replace(/\/$/, "");
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3_000) });
      return { configured: true, reachable: r.ok };
    } catch {
      return { configured: true, reachable: false };
    }
  }

  startSession(target: RobotTarget & { startUrl?: string }) {
    return this.json<PageInfo & { id: string }>("/sessions", target);
  }

  async frame(id: string) {
    const response = await this.call(`/sessions/${encodeURIComponent(id)}/frame`, {}, 20_000);
    const header = (name: string) => decodeURIComponent(response.headers.get(name) ?? "");
    return {
      image: Buffer.from(await response.arrayBuffer()),
      url: header("x-robot-url"),
      title: header("x-robot-title"),
      loggedIn: response.headers.get("x-robot-logged-in") === "true",
    };
  }

  input(id: string, event: Record<string, unknown>) {
    return this.json<PageInfo>(`/sessions/${encodeURIComponent(id)}/input`, event);
  }

  /** Isi nama pengguna & kata sandi di formulir login sesi ini (berhenti di CAPTCHA/OTP). */
  autofill(id: string, credentials: { username: string; password: string }) {
    return this.json<LoginState>(`/sessions/${encodeURIComponent(id)}/autofill`, credentials);
  }

  /** Jawaban pengguna untuk CAPTCHA / OTP. */
  answer(
    id: string,
    input: { kind: "captcha" | "otp"; value: string; credentials?: { username: string; password: string } },
  ) {
    return this.json<LoginState>(`/sessions/${encodeURIComponent(id)}/answer`, input);
  }

  finish(id: string) {
    return this.json<PageInfo & { storageState: StorageState }>(`/sessions/${encodeURIComponent(id)}/finish`, {});
  }

  async close(id: string) {
    await this.call(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }, 10_000).catch(() => undefined);
  }

  check(target: RobotTarget) {
    return this.json<PageInfo & { storageState: StorageState }>("/check", target);
  }

  capture(target: RobotTarget & { url: string }) {
    return this.json<CaptureResult>("/capture", target);
  }

  /** e-Kinerja: daftar SKP + RHK SKP yang beririsan dengan tahun itu (beberapa halaman → waktu lebih lama). */
  /** Isi Rencana Aksi satu bulan (banyak klik + muat ulang → batas waktu panjang). */
  ekinerjaRenaksi(
    target: RobotTarget & {
      skpExternalId: string;
      period: string;
      rows: RenaksiRow[];
      dryRun?: boolean;
      mode?: "add" | "sync";
    },
  ) {
    return this.json<
      PageInfo & {
        storageState: StorageState;
        status: "filled" | "partial" | "submitted" | "logged_out" | "preview";
        planned?: unknown[];
        checked: string[];
        unchecked?: string[];
        rewritten?: string[];
        added: unknown[];
        missing: string[];
        rows: FilledRow[];
        screenshot: string | null;
      }
    >("/jobs/ekinerja/renaksi", target, "POST", 480_000);
  }

  /** Baca semua bulan Rencana Aksi satu SKP (status, tanggal pengajuan, rating, isi, feedback) — hanya membaca. */
  ekinerjaRenaksiRead(target: RobotTarget & { skpExternalId: string }) {
    return this.json<PageInfo & { storageState: StorageState; months: EkinerjaMonth[] }>(
      "/jobs/ekinerja/renaksi/read",
      target,
      "POST",
      240_000,
    );
  }

  ekinerjaSkp(target: RobotTarget & { year?: number }) {
    return this.json<PageInfo & { storageState: StorageState; skps: unknown[] }>(
      "/jobs/ekinerja/skp",
      target,
      "POST",
      240_000,
    );
  }

  /** SRIKANDI: daftar naskah keluar + PDF naskah ber-TTD yang belum dikenal (`known` = nomor naskah). */
  srikandiOutgoing(target: RobotTarget & { known: string[]; haveMain: string[]; maxFetch?: number }) {
    return this.json<PageInfo & { storageState: StorageState; letters: unknown[]; files: unknown[] }>(
      "/jobs/srikandi/outgoing",
      target,
      "POST",
      300_000,
    );
  }

  /** SRIKANDI: isi formulir Registrasi Naskah Keluar lalu SIMPAN (draf di Log); `dryRun` = isi tanpa menyimpan. */
  srikandiRegister(target: RobotTarget & { form: Record<string, unknown>; dryRun?: boolean }) {
    return this.json<
      PageInfo & {
        storageState: StorageState;
        status: "saved" | "exists" | "preview" | "logged_out";
        filled: string[];
        draft: { number: string; subject: string; sendStatus: string; detailId: string | null } | null;
        screenshot: string | null;
      }
    >("/jobs/srikandi/register", target, "POST", 300_000);
  }

  /** SRIKANDI: tabel referensi menu Pengguna (semua halaman; bisa lama). */
  srikandiReferences(target: RobotTarget & { categories?: string[] }) {
    return this.json<
      PageInfo & {
        storageState: StorageState;
        references: { category: string; items: unknown[]; pages?: number; total?: number | null; nav?: string }[];
      }
    >("/jobs/srikandi/references", target, "POST", 600_000);
  }

  /** Rekam halaman yang sedang tampil di sesi browser jarak jauh. */
  captureSession(id: string) {
    return this.json<CaptureResult>(`/sessions/${encodeURIComponent(id)}/capture`, {});
  }
}

/** Satu bulan Rencana Aksi yang dibaca robot. */
export interface EkinerjaMonth {
  month: number;
  status: "empty" | "unavailable" | "draft" | "submitted" | "rated";
  submittedAt?: string;
  workday?: number;
  ratings?: Record<string, string | undefined>;
  rows: (FilledRow & { text: string; feedback: string })[];
}

export type CaptureResult = PageInfo & { storageState: StorageState; screenshot: string; aria: string };
