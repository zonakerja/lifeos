import type { Payload } from "./record-mapper";
import type { RecordType } from "./record-schema";

/**
 * Daftar ringan (`GET /records/:type?light=1`): field berat yang hanya dibutuhkan editor tidak ikut dikirim ke daftar,
 * agar membuka Notes Space tidak mengunduh seluruh dokumen/coretan/teks dokumen semua catatan. Record yang dipotong
 * diberi `partial` (key yang tidak utuh); isi lengkap diambil lewat `GET /records/:type/:clientId`. Saat menulis item
 * yang tidak utuh, client mengirim `preserve` → server mempertahankan nilai key itu (tidak terhapus).
 */
export const LIGHT_FIELDS: Partial<Record<RecordType, readonly string[]>> = {
  // doc = JSON editor, ink = goresan tulis tangan (bisa beberapa MB)
  free_note: ["doc", "ink"],
  // Teks dokumen terlampir (sampai 200 rb karakter) — transkrip & ringkasan tetap dikirim (dipakai pencarian)
  ai_note: ["fileContext"],
};

/** Tinggi pratinjau tulis tangan di kartu (koordinat logis, sama dengan frontend). */
export const INK_PREVIEW_HEIGHT = 600;

type InkStroke = { points?: unknown };
type Ink = { strokes?: unknown } & Record<string, unknown>;

/** Goresan yang (sebagian) berada di bagian atas halaman — cukup untuk pratinjau kartu. */
export function inkPreview(ink: unknown, height = INK_PREVIEW_HEIGHT): unknown {
  if (!ink || typeof ink !== "object") return ink;
  const { strokes, ...rest } = ink as Ink;
  if (!Array.isArray(strokes)) return ink;
  const visible = (strokes as InkStroke[]).filter((s) => {
    const points = Array.isArray(s?.points) ? (s.points as unknown[]) : [];
    for (let i = 1; i < points.length; i += 3) {
      if (typeof points[i] === "number" && (points[i] as number) < height) return true;
    }
    return false;
  });
  return { ...rest, strokes: visible };
}

/** Payload versi daftar + key yang tidak utuh (kosong = utuh). */
export function toLightPayload(type: RecordType, payload: Payload): { payload: Payload; partial: string[] } {
  const keys = LIGHT_FIELDS[type];
  if (!keys) return { payload, partial: [] };
  const light: Payload = { ...payload };
  const partial: string[] = [];
  for (const key of keys) {
    if (light[key] === undefined) continue;
    partial.push(key);
    // Coretan dipotong ke bagian atas (pratinjau kartu), sisanya dibuang
    if (type === "free_note" && key === "ink") light.ink = inkPreview(light.ink);
    else delete light[key];
  }
  return { payload: light, partial };
}

/** Pertahankan nilai key yang tidak utuh di client dari isi tersimpan (key di luar `LIGHT_FIELDS` diabaikan). */
export function preserveFields(type: RecordType, incoming: Payload, current: Payload | undefined, preserve: string[]) {
  const allowed = LIGHT_FIELDS[type] ?? [];
  const result: Payload = { ...incoming };
  for (const key of preserve) {
    if (!allowed.includes(key)) continue;
    if (current && current[key] !== undefined) result[key] = current[key];
    else delete result[key];
  }
  return result;
}
