import { timingSafeEqual } from "node:crypto";

/**
 * Logika murni service robot (diuji di `logic.test.ts`): otorisasi token, batas alamat yang boleh dibuka, deteksi
 * halaman login, dan validasi masukan dari "browser jarak jauh".
 */

/** Ukuran layar browser robot (juga ukuran gambar yang ditayangkan ke pengguna). */
export const VIEWPORT = { width: 1280, height: 800 };

/** Token antar-service (header `Authorization: Bearer …`) dibandingkan waktu-konstan. */
export function authorized(header: string | undefined, token: string) {
  if (!token || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Host yang boleh dibuka robot untuk satu konektor: host alamat utama + host tambahan (mis. SSO). */
export function allowedHosts(baseUrl: string, extraHosts: string[] = []) {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(baseUrl).hostname.toLowerCase());
  } catch {
    // alamat tidak valid → tidak ada host yang diizinkan
  }
  for (const h of extraHosts) {
    const host = h
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (host) hosts.add(host);
  }
  return [...hosts];
}

/**
 * URL boleh dibuka bila skemanya https (http hanya untuk localhost) dan host-nya termasuk daftar atau subdomainnya.
 * Mencegah robot dipakai sebagai browser bebas ke situs lain.
 */
export function urlAllowed(url: string, hosts: string[]) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) return false;
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Heuristik "masih di halaman login": ada kolom password yang terlihat, atau alamat mengandung penanda login/SSO.
 * Dipakai untuk menilai sesi setelah membuka halaman utama sistem dengan cookie tersimpan.
 */
export function looksLikeLogin(url: string, hasPasswordField: boolean, markers: string[] = DEFAULT_LOGIN_MARKERS) {
  if (hasPasswordField) return true;
  const lower = url.toLowerCase();
  return markers.some((m) => m && lower.includes(m.toLowerCase()));
}

export const DEFAULT_LOGIN_MARKERS = ["/login", "/signin", "/sign-in", "/auth/", "/sso", "openid-connect", "/otp"];

export type InputEvent =
  | { type: "click" | "dblclick"; x: number; y: number }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; dy: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "goto"; url: string }
  | { type: "back" }
  | { type: "reload" };

/** Tombol yang boleh dikirim (tanpa pintasan browser yang bisa membuka jendela/alat pengembang). */
const KEYS = new Set([
  "Enter",
  "Tab",
  "Shift+Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Space",
  "Control+a",
  "Control+c",
  "Control+v",
]);

const num = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

/** Validasi event masukan dari pengguna; null = ditolak. */
export function parseInput(value: unknown): InputEvent | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case "click":
    case "dblclick":
    case "move":
      return num(v.x, VIEWPORT.width) && num(v.y, VIEWPORT.height)
        ? { type: v.type, x: v.x as number, y: v.y as number }
        : null;
    case "scroll":
      return num(v.x, VIEWPORT.width) && num(v.y, VIEWPORT.height) && typeof v.dy === "number" && Math.abs(v.dy) <= 5000
        ? { type: "scroll", x: v.x as number, y: v.y as number, dy: v.dy }
        : null;
    case "type":
      return typeof v.text === "string" && v.text.length > 0 && v.text.length <= 500
        ? { type: "type", text: v.text }
        : null;
    case "key":
      return typeof v.key === "string" && KEYS.has(v.key) ? { type: "key", key: v.key } : null;
    case "goto":
      return typeof v.url === "string" && v.url.length <= 2_000 ? { type: "goto", url: v.url } : null;
    case "back":
    case "reload":
      return { type: v.type };
    default:
      return null;
  }
}

/** Batas teks snapshot aksesibilitas yang dikembalikan (cukup untuk memetakan formulir). */
export const MAX_ARIA_CHARS = 200_000;

export const clampText = (text: string, max = MAX_ARIA_CHARS) =>
  text.length > max ? `${text.slice(0, max)}\n… (dipotong)` : text;
