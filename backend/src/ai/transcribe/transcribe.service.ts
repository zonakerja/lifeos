import { BadRequestException, HttpException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { AuthUser } from "../../common/types/auth-user";
import { ObjectStorageService } from "../../storage/object-storage.service";
import { UploadsService } from "../../uploads/uploads.service";
import { AiService } from "../ai.service";
import type { SegmentResult } from "./transcript-logic";

export interface TranscribeResult {
  text: string;
  truncated: boolean;
  passes: number;
  /** Kelengkapan yang perlu diperiksa user (bagian gagal / terpotong). */
  warning: string | null;
  provider: string;
  model: string;
}

export type TranscribeJob =
  | { status: "running"; startedAt: number }
  | { status: "done"; startedAt: number; finishedAt: number; result: TranscribeResult }
  | { status: "failed"; startedAt: number; finishedAt: number; httpStatus: number; message: string };

const TEMP_DIR = join(tmpdir(), "lifeos-transcribe");
/** Hasil disimpan sementara agar bisa diambil setelah tab ditutup / dibuka lagi tanpa membayar transkrip kedua. */
const RESULT_TTL_MS = 24 * 60 * 60_000;

/**
 * Transkrip berkas audio tersimpan sebagai pekerjaan latar belakang: rekaman panjang memakan banyak menit, jadi tidak
 * bergantung pada satu permintaan HTTP yang harus tetap tersambung. Status di memori satu proses backend (restart =
 * pekerjaan hilang, user bisa memulai lagi). Satu berkas per user hanya dikerjakan sekali.
 */
@Injectable()
export class TranscribeService implements OnModuleInit {
  private readonly logger = new Logger(TranscribeService.name);
  private readonly jobs = new Map<string, TranscribeJob>();
  private readonly segments = new Map<string, Map<number, SegmentResult>>();

  constructor(
    private readonly ai: AiService,
    private readonly uploads: UploadsService,
    private readonly storage: ObjectStorageService,
  ) {}

  /** Salinan sementara dari proses sebelumnya (backend berhenti di tengah transkrip) tidak dipakai siapa pun lagi. */
  async onModuleInit() {
    await rm(TEMP_DIR, { recursive: true, force: true }).catch(() => undefined);
  }

  /** Mulai transkrip; bila sedang berjalan atau sudah selesai, pekerjaan yang ada dikembalikan. */
  async start(user: AuthUser, uploadId: string): Promise<TranscribeJob> {
    this.prune();
    const { asset } = await this.uploads.findWithPermission(uploadId, user);
    const mimeType = asset.mimeType.split(";")[0].trim().toLowerCase();
    if (!mimeType.startsWith("audio/")) throw new BadRequestException("Berkas ini bukan audio.");

    const key = this.key(user.id, uploadId);
    const existing = this.jobs.get(key);
    // Selesai tetapi ada bagian gagal/terpotong = boleh diulang; bagian yang sudah berhasil tidak dibayar lagi
    if (existing?.status === "running" || (existing?.status === "done" && !existing.result.truncated)) return existing;

    const job: TranscribeJob = { status: "running", startedAt: Date.now() };
    this.jobs.set(key, job);
    void this.run(key, asset.id, asset.objectKey, Number(asset.size), user.id, mimeType, job.startedAt);
    return job;
  }

  /** Hanya pekerjaan milik user sendiri (kunci memuat ID user). */
  status(userId: string, uploadId: string): TranscribeJob | null {
    this.prune();
    return this.jobs.get(this.key(userId, uploadId)) ?? null;
  }

  private key(userId: string, uploadId: string) {
    return `${userId}:${uploadId}`;
  }

  private prune() {
    const now = Date.now();
    for (const [key, job] of this.jobs) {
      if (job.status !== "running" && now - job.finishedAt > RESULT_TTL_MS) {
        this.jobs.delete(key);
        this.segments.delete(key);
      }
    }
  }

  private async run(
    key: string,
    assetId: string,
    objectKey: string,
    sizeBytes: number,
    userId: string,
    mimeType: string,
    startedAt: number,
  ) {
    // Disalin sementara ke disk (bukan memori): rekaman panjang bisa ratusan MB
    const filePath = join(TEMP_DIR, randomUUID());
    try {
      await mkdir(TEMP_DIR, { recursive: true });
      await pipeline(await this.storage.getObject(objectKey), createWriteStream(filePath));
      let segments = this.segments.get(key);
      if (!segments) {
        segments = new Map();
        this.segments.set(key, segments);
      }
      const result = await this.ai.transcribeFile(userId, filePath, mimeType, sizeBytes, segments);
      this.jobs.set(key, { status: "done", startedAt, finishedAt: Date.now(), result });
      this.logger.log(
        `Transkrip ${assetId} selesai: ${result.text.length} karakter, ${result.passes} bagian, ${Date.now() - startedAt} ms`,
      );
    } catch (error) {
      const http = error instanceof HttpException;
      const message = http ? error.message : "Transkrip gagal karena kesalahan server.";
      this.jobs.set(key, {
        status: "failed",
        startedAt,
        finishedAt: Date.now(),
        httpStatus: http ? error.getStatus() : 422,
        message,
      });
      this.logger.warn(`Transkrip ${assetId} gagal: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await rm(filePath, { force: true }).catch(() => undefined);
    }
  }
}
