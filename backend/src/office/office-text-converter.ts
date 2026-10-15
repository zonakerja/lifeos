import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { networkInterfaces } from "node:os";
import { fileFormat, formatInfo, resolveBackendUrl, toInternalUrl } from "./office-logic";

const CONVERT_TIMEOUT_MS = 120_000;
/** Batas teks hasil konversi yang dibaca (sama dengan batas ekstraksi berkas). */
const MAX_TEXT_BYTES = 20 * 1024 * 1024;

/**
 * Teks isi dokumen kantor yang tidak bisa dibaca ekstraktor bawaan (PPTX, ODT, ODP, RTF, DOC, PPT, EPUB, ODS, XLS, …)
 * lewat Conversion API ONLYOFFICE (dokumen/presentasi → TXT, spreadsheet → CSV). Dipakai worker ekstraksi sehingga
 * ringkasan AI & indeks pengetahuan ikut membaca format itu. ONLYOFFICE mati / tidak diatur → null (berkas tetap
 * berstatus "format tidak didukung", tidak gagal).
 *
 * Sengaja tidak bergantung pada `OfficeModule` (yang memakai modul ekstraksi) agar tidak terjadi impor melingkar.
 */
@Injectable()
export class OfficeTextConverter {
  private readonly logger = new Logger(OfficeTextConverter.name);
  private readonly publicUrl?: string;
  private readonly internalUrl?: string;
  private readonly dsJwt?: JwtService;
  private readonly fileJwt: JwtService;

  constructor(private readonly config: ConfigService) {
    this.publicUrl = config.get<string>("ONLYOFFICE_URL")?.replace(/\/+$/, "") || undefined;
    this.internalUrl = config.get<string>("ONLYOFFICE_INTERNAL_URL")?.replace(/\/+$/, "") || this.publicUrl;
    const secret = config.get<string>("ONLYOFFICE_JWT_SECRET");
    this.dsJwt = secret ? new JwtService({ secret }) : undefined;
    // Sama dengan token link berkas OfficeService (`office.module.ts`) → divalidasi endpoint files/:id/content
    this.fileJwt = new JwtService({ secret: `${config.getOrThrow<string>("JWT_ACCESS_SECRET")}:office` });
  }

  /** Format ini bisa dibaca lewat ONLYOFFICE (dan ONLYOFFICE diatur)? */
  canConvert(originalName: string) {
    return !!this.dsJwt && !!this.internalUrl && this.outputType(originalName) !== null;
  }

  private outputType(originalName: string): "txt" | "csv" | null {
    const info = formatInfo(fileFormat(originalName));
    if (!info) return null;
    if (info.documentType === "cell") return "csv";
    if (info.documentType === "word" || info.documentType === "slide") return "txt";
    return null;
  }

  async convert(asset: { id: string; originalName: string; checksum: string }): Promise<string | null> {
    const outputtype = this.outputType(asset.originalName);
    if (!outputtype || !this.dsJwt || !this.internalUrl || !this.publicUrl) return null;
    try {
      const backendUrl = resolveBackendUrl(
        this.config.getOrThrow<string>("ONLYOFFICE_BACKEND_URL"),
        this.config.getOrThrow<number>("PORT"),
        networkInterfaces(),
      );
      const fileToken = await this.fileJwt.signAsync(
        { assetId: asset.id, purpose: "office-file" },
        { expiresIn: "1h" },
      );
      const body = {
        async: false,
        filetype: fileFormat(asset.originalName),
        outputtype,
        // Kunci per isi berkas: isi sama → hasil konversi di cache ONLYOFFICE dipakai ulang
        key: `${asset.id}-${outputtype}-${asset.checksum.slice(0, 32)}`.slice(0, 128),
        title: asset.originalName,
        url: `${backendUrl}/api/v1/office/files/${asset.id}/content?token=${encodeURIComponent(fileToken)}`,
      };
      const response = await fetch(`${this.internalUrl}/converter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...body, token: await this.dsJwt.signAsync(body) }),
        signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS),
      });
      const result = (await response.json()) as { endConvert?: boolean; fileUrl?: string; error?: number };
      if (!result.fileUrl) {
        this.logger.warn(`Konversi ONLYOFFICE ${asset.id} gagal (kode ${result.error ?? response.status}).`);
        return null;
      }
      const file = await fetch(toInternalUrl(result.fileUrl, this.publicUrl, this.internalUrl), {
        signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS),
      });
      if (!file.ok) return null;
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_TEXT_BYTES) return null;
      // Hasil TXT/CSV ONLYOFFICE ber-UTF-8 (kadang dengan BOM)
      const text = buffer.toString("utf8");
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    } catch (error) {
      this.logger.warn(`Konversi ONLYOFFICE ${asset.id}: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
