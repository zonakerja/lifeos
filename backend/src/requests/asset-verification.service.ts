import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "../generated/prisma/client";
import {
  ASSET_FIELDS,
  type AssetClaim,
  type AssetField,
  compareAssets,
  type MasterAsset,
  matchPolicy,
} from "../agent/agent-policy";
import { PrismaService } from "../prisma/prisma.service";
import { RequestsService } from "./requests.service";

/** Ambang & kolom kritis bila pengajuan tidak cocok dengan aturan mana pun. */
const DEFAULTS = { threshold: 75, criticalFields: ["nup", "kodeBarang"] as AssetField[], valueTolerance: 0 };

/**
 * Verifikasi aset oleh server (docs/AI-AGENT.md §24): daftar aset yang dibaca agen dibandingkan dengan data master,
 * hasilnya disimpan di pengajuan dan dipakai mesin keputusan. Agen tidak bisa mengarang skor karena skor dihitung di sini.
 * Sumber master sementara = berkas JSON tiruan (`AGENT_ASSET_MASTER_FILE`); kelak diganti OnTrack (AG-18).
 */
@Injectable()
export class AssetVerificationService {
  private readonly logger = new Logger(AssetVerificationService.name);
  private cache: { path: string; mtime: number; assets: MasterAsset[] } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly requests: RequestsService,
  ) {}

  /** Data master; null = sumber belum tersedia. */
  private async masters(): Promise<{ source: string; assets: MasterAsset[] } | null> {
    const file = this.config.get<string>("AGENT_ASSET_MASTER_FILE");
    if (!file) return null;
    const path = resolve(file);
    try {
      const { mtimeMs } = await stat(path);
      if (this.cache?.path !== path || this.cache.mtime !== mtimeMs) {
        const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
        const assets = (Array.isArray(parsed) ? parsed : []).flatMap((row): MasterAsset[] => {
          const r = row as Record<string, unknown>;
          return typeof r?.nup === "string" || typeof r?.nup === "number"
            ? [
                {
                  nup: String(r.nup),
                  kodeBarang: String(r.kodeBarang ?? ""),
                  nama: typeof r.nama === "string" ? r.nama : undefined,
                  nilai: typeof r.nilai === "number" ? r.nilai : undefined,
                },
              ]
            : [];
        });
        this.cache = { path, mtime: mtimeMs, assets };
      }
      return { source: "master tiruan (development)", assets: this.cache.assets };
    } catch (error) {
      this.logger.warn(`Data master aset tidak terbaca: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  async submit(userId: string, requestId: string, claims: AssetClaim[]) {
    const request = await this.prisma.request.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException("Pengajuan tidak ditemukan.");
    const policies = await this.prisma.agentPolicy.findMany({ where: { userId } });
    const policy = matchPolicy(policies, request);
    const critical = Array.isArray(policy?.criticalFields)
      ? (policy.criticalFields as unknown[]).filter((f): f is AssetField =>
          (ASSET_FIELDS as readonly string[]).includes(f as string),
        )
      : DEFAULTS.criticalFields;
    const threshold = policy?.threshold ?? DEFAULTS.threshold;
    const master = await this.masters();
    const check = compareAssets(claims, master?.assets ?? [], {
      criticalFields: critical,
      valueTolerance: policy?.valueTolerance ?? DEFAULTS.valueTolerance,
    });
    const stored = {
      source: master?.source ?? null,
      available: !!master,
      checkedAt: new Date().toISOString(),
      threshold,
      ...check,
    };
    await this.requests.setAssetCheck(userId, requestId, stored as unknown as Prisma.InputJsonValue);
    const branch = master && check.total > 0 && check.score >= threshold ? "lanjut" : "telaah";
    return {
      available: !!master,
      score: check.score,
      matched: check.matched,
      total: check.total,
      threshold,
      branch,
      catatan: !master
        ? "Data master aset belum tersedia: susun telaah staf, keputusan di tangan pemilik."
        : branch === "lanjut"
          ? "Skor memenuhi ambang: buat dokumen hanya untuk aset berstatus cocok; aset lain sebutkan sebagai catatan."
          : "Skor di bawah ambang: susun telaah staf yang menjelaskan aset tidak cocok / tidak ditemukan.",
      items: check.items.map((i) => ({
        nup: i.claimed.nup ?? null,
        kodeBarang: i.claimed.kodeBarang ?? null,
        status: i.status,
        perbedaan: i.diffs,
      })),
    };
  }
}
