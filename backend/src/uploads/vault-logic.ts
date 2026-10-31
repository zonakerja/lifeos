/**
 * Logika murni brankas digital (diuji di `vault-logic.spec.ts`): alamat IP pengunjung, IP jaringan lokal/privat (tidak
 * dicari lokasinya), hasil layanan lokasi IP → lokasi, dan ringkasan peramban untuk log akses.
 */

export const VAULT_PATH = "/brankas/";
export const MAX_VAULT_FILES = 30;
/** Context upload berkas yang diunggah khusus untuk brankas (bukan lampiran item) — sama dengan frontend. */
export const VAULT_UPLOAD_CONTEXT = "renaksi-vault";

/**
 * Berkas yang dilepas dari brankas (brankas dihapus / isinya diganti) dan boleh ikut dihapus dari storage: hanya unggahan
 * khusus brankas milik pemilik brankas yang tidak dipakai brankas lain. Lampiran item & berkas lain tetap utuh.
 */
export function vaultFilesToRelease(
  removed: { id: string; userId: string; context: string | null }[],
  ownerId: string,
  stillUsed: ReadonlySet<string>,
) {
  return removed
    .filter((a) => a.userId === ownerId && a.context === VAULT_UPLOAD_CONTEXT && !stillUsed.has(a.id))
    .map((a) => a.id);
}

/** Alamat IP dari Express (`req.ip` sudah memperhitungkan `trust proxy`); bentuk IPv4-mapped dirapikan. */
export function normalizeIp(ip: string | undefined | null) {
  const value = (ip ?? "").trim();
  if (!value) return null;
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

/** IP lokal / privat / CGNAT — tidak punya lokasi publik. */
export function isPrivateIp(ip: string) {
  if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.")) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(ip)) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  const c = /^100\.(\d+)\./.exec(ip);
  if (c && Number(c[1]) >= 64 && Number(c[1]) <= 127) return true;
  return /^(fc|fd|fe80)/i.test(ip);
}

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
  network?: string;
}

/** Jawaban layanan lokasi IP (format ipapi.co) → lokasi; galat / kosong → null. */
export function parseGeo(json: unknown): GeoInfo | null {
  if (!json || typeof json !== "object") return null;
  const v = json as Record<string, unknown>;
  if (v.error || v.reserved) return null;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 120) : undefined);
  const geo: GeoInfo = {
    country: str(v.country_name) ?? str(v.country),
    region: str(v.region),
    city: str(v.city),
    network: str(v.org),
  };
  return geo.country || geo.city || geo.region ? geo : null;
}

/** Teks lokasi untuk ditampilkan ("Jakarta, DKI Jakarta, Indonesia"). */
export function locationLabel(geo: GeoInfo | null, ip: string | null) {
  if (ip && isPrivateIp(ip)) return "Jaringan lokal / privat";
  const parts = [geo?.city, geo?.region, geo?.country].filter((p, i, all): p is string => !!p && all.indexOf(p) === i);
  return parts.length ? parts.join(", ") : "Tidak diketahui";
}

/** Ringkasan peramban & sistem operasi dari User-Agent ("Chrome 140 · Windows"). */
export function shortUserAgent(ua: string | undefined | null) {
  const value = ua ?? "";
  if (!value) return null;
  const browser =
    /Edg\/(\d+)/.exec(value)?.[1] !== undefined
      ? `Edge ${/Edg\/(\d+)/.exec(value)![1]}`
      : /OPR\/(\d+)/.test(value)
        ? `Opera ${/OPR\/(\d+)/.exec(value)![1]}`
        : /Chrome\/(\d+)/.test(value)
          ? `Chrome ${/Chrome\/(\d+)/.exec(value)![1]}`
          : /Firefox\/(\d+)/.test(value)
            ? `Firefox ${/Firefox\/(\d+)/.exec(value)![1]}`
            : /Version\/(\d+).*Safari/.test(value)
              ? `Safari ${/Version\/(\d+)/.exec(value)![1]}`
              : null;
  const os = /Android/.test(value)
    ? "Android"
    : /iPhone|iPad/.test(value)
      ? "iOS"
      : /Windows/.test(value)
        ? "Windows"
        : /Mac OS X/.test(value)
          ? "macOS"
          : /Linux/.test(value)
            ? "Linux"
            : null;
  return [browser, os].filter(Boolean).join(" · ") || value.slice(0, 80);
}
