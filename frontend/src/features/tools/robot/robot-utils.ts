import type { RobotConnectorStatus, RobotRun } from "@/types/api";

/** Ukuran layar browser robot (sama dengan `VIEWPORT` service robot). */
export const ROBOT_VIEWPORT = { width: 1280, height: 800 };

/** Titik klik pada gambar tayangan (ukuran tampil) → koordinat layar browser robot. */
export function toViewportPoint(offsetX: number, offsetY: number, shownWidth: number, shownHeight: number) {
  if (!shownWidth || !shownHeight) return null;
  const x = Math.round((offsetX / shownWidth) * ROBOT_VIEWPORT.width);
  const y = Math.round((offsetY / shownHeight) * ROBOT_VIEWPORT.height);
  return {
    x: Math.min(Math.max(x, 0), ROBOT_VIEWPORT.width),
    y: Math.min(Math.max(y, 0), ROBOT_VIEWPORT.height),
  };
}

/** Tombol keyboard yang diteruskan sebagai tombol khusus (huruf/angka dikirim sebagai teks). */
const SPECIAL_KEYS = new Set([
  "Enter",
  "Tab",
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
]);

/** Event keyboard di tayangan → masukan robot (null = abaikan, mis. pintasan browser). */
export function keyToInput(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }) {
  if (e.metaKey || e.altKey) return null;
  if (e.ctrlKey) return e.key.toLowerCase() === "a" ? ({ type: "key", key: "Control+a" } as const) : null;
  if (e.key === "Tab" && e.shiftKey) return { type: "key", key: "Shift+Tab" } as const;
  if (SPECIAL_KEYS.has(e.key)) return { type: "key", key: e.key } as const;
  if (e.key === " ") return { type: "key", key: "Space" } as const;
  if (e.key.length === 1) return { type: "type", text: e.key } as const;
  return null;
}

export const CONNECTOR_STATUS: Record<RobotConnectorStatus, { label: string; tone: string }> = {
  none: { label: "Belum login", tone: "bg-muted text-muted-foreground" },
  active: { label: "Sesi aktif", tone: "bg-success/15 text-success" },
  expired: { label: "Sesi kedaluwarsa", tone: "bg-warning/15 text-warning" },
  error: { label: "Gagal", tone: "bg-destructive/15 text-destructive" },
};

export const RUN_KIND_LABELS: Record<RobotRun["kind"], string> = {
  login: "Login",
  check: "Cek sesi",
  capture: "Eksplor halaman",
  credentials: "Kredensial",
};

/** Host tambahan dari teks bebas (koma / spasi / baris baru). */
export const parseHosts = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter(Boolean);
