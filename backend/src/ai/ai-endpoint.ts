import { AiProvider } from "../generated/prisma/client";
import { AI_PROVIDERS, type AttachmentKind } from "./ai-providers";

/**
 * Jalur koneksi satu provider AI (logika murni, diuji di `ai-endpoint.spec.ts`).
 *
 * Bawaan = **langsung** ke API resmi provider (SDK resmi). User boleh memilih **lewat router** (layanan perantara pihak
 * ketiga yang menjual akses banyak model, mis. OpenRouter atau router lokal): cukup alamat API + key router + ID model
 * sesuai dokumentasi router. Router berbicara dengan salah satu format umum:
 * - `openai`    — OpenAI Chat Completions (`POST {base}/chat/completions`, embedding `POST {base}/embeddings`)
 * - `anthropic` — Anthropic Messages (`POST {base tanpa /v1}/v1/messages`), hanya untuk Claude
 */
export type AiApiFormat = "openai" | "anthropic";
export const AI_API_FORMATS: readonly AiApiFormat[] = ["openai", "anthropic"];

export interface AiEndpoint {
  /** Alamat API router (sudah dinormalkan, tanpa garis miring akhir). */
  baseUrl: string;
  format: AiApiFormat;
}

/** Bagian kredensial yang menentukan jalur (kolom `ai_credentials.base_url` & `api_format`). */
export interface EndpointFields {
  provider: AiProvider;
  baseUrl: string | null;
  apiFormat: string | null;
}

/** Format yang boleh dipakai provider lewat router. */
export function allowedFormats(provider: AiProvider): AiApiFormat[] {
  return provider === AiProvider.anthropic ? ["anthropic", "openai"] : ["openai"];
}

/** Format bawaan provider lewat router: Claude = Messages (cache & pemikiran tetap jalan), lainnya = OpenAI. */
export const defaultFormat = (provider: AiProvider): AiApiFormat => allowedFormats(provider)[0];

/** Jalur sebuah kredensial: null = langsung ke API resmi provider. */
export function endpointOf(credential: EndpointFields): AiEndpoint | null {
  if (!credential.baseUrl) return null;
  const allowed = allowedFormats(credential.provider);
  const format = allowed.find((f) => f === credential.apiFormat) ?? allowed[0];
  return { baseUrl: credential.baseUrl, format };
}

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];
const LOCAL_HOSTS = new Set(["localhost", "localhost.localdomain", "host.docker.internal"]);

/** Host jaringan lokal / privat (tidak boleh dituju server produksi atas isian user). */
export function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return true;
  }
  if (PRIVATE_V4.some((re) => re.test(host))) return true;
  // IPv6: loopback, unspecified, link-local, unique local, IPv4-mapped
  if (host.includes(":"))
    return host === "::1" || host === "::" || /^(fe8|fe9|fea|feb|fc|fd)/.test(host) || host.startsWith("::ffff:");
  return false;
}

export type BaseUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validasi & normalkan alamat API router isian user. Wajib `https` tanpa kredensial / query / fragmen. Host lokal &
 * privat hanya boleh di luar production (router lokal / server tiruan saat uji) — server produksi tidak boleh dipakai
 * untuk menjangkau layanan internal (SSRF).
 */
export function normalizeBaseUrl(raw: string, production: boolean): BaseUrlResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Alamat API tidak valid. Contoh: https://router.example.com/v1" };
  }
  if (url.username || url.password) return { ok: false, error: "Alamat API tidak boleh memuat nama/sandi." };
  if (url.search || url.hash) return { ok: false, error: "Alamat API tidak boleh memuat ? atau #." };
  const privateHost = isPrivateHost(url.hostname);
  if (production && privateHost) return { ok: false, error: "Alamat API harus alamat publik (bukan jaringan lokal)." };
  if (url.protocol !== "https:" && !(url.protocol === "http:" && privateHost && !production)) {
    return { ok: false, error: "Alamat API harus diawali https://" };
  }
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, url: `${url.origin}${path}` };
}

/** Alamat dasar untuk SDK Anthropic: SDK sendiri menambahkan `/v1/messages`, jadi akhiran `/v1` dibuang. */
export const anthropicBaseUrl = (baseUrl: string) => baseUrl.replace(/\/v1$/, "");

/** Nama host untuk label ("Google Gemini lewat router.example.com"). */
export function endpointHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/** Label provider sesuai jalurnya. */
export function credentialLabel(credential: EndpointFields) {
  const label = AI_PROVIDERS[credential.provider].label;
  return credential.baseUrl ? `${label} lewat ${endpointHost(credential.baseUrl)}` : label;
}

/**
 * Jenis lampiran yang bisa dikirim lewat jalur ini. Format OpenAI Chat Completions di router: gambar & PDF (`file`),
 * tanpa audio (format audio Chat Completions terbatas & jarang diteruskan router). Format Anthropic = seperti Claude.
 */
export function endpointSupports(credential: EndpointFields): Record<AttachmentKind, boolean> {
  const endpoint = endpointOf(credential);
  const base = AI_PROVIDERS[credential.provider].supports;
  if (!endpoint || endpoint.format === "anthropic") return base;
  return { image: true, pdf: true, text: true, audio: false };
}

/**
 * Nama model Claude yang dinormalkan untuk mengenali kemampuan (router bisa menulis `claude-opus-5.5` atau
 * `anthropic/claude-opus-5-5`).
 */
export const canonicalClaudeModel = (model: string) => (model.split("/").pop() ?? model).replace(/\./g, "-");
