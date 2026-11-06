/**
 * Pengaturan tab Graf (setara panel Graph view Obsidian: Filter, Tampilan, Gaya). Disimpan per browser — pilihan
 * tampilan, bukan data; grup warna tetap disimpan per akun (`knowledge_prefs`).
 */
export interface GraphSettings {
  // Filter
  showTags: boolean;
  showFiles: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
  showSpecial: boolean;
  showMirror: boolean;
  byStatus: boolean;
  // Tampilan
  arrows: boolean;
  /** Zoom minimal agar label tampil (0 = selalu tampil) */
  textFade: number;
  nodeSize: number;
  linkThickness: number;
  // Gaya (forces)
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  showTags: false,
  showFiles: true,
  existingOnly: true,
  showOrphans: true,
  showSpecial: false,
  showMirror: true,
  byStatus: true,
  arrows: false,
  textFade: 1.4,
  nodeSize: 1,
  linkThickness: 1,
  centerForce: 0.3,
  repelForce: 10,
  linkForce: 0.6,
  linkDistance: 40,
};

/** Rentang penggeser (min, maks, langkah) — juga dipakai untuk menjepit nilai tersimpan. */
export const GRAPH_RANGES = {
  textFade: [0, 4, 0.1],
  nodeSize: [0.4, 3, 0.1],
  linkThickness: [0.2, 4, 0.1],
  centerForce: [0, 1, 0.05],
  repelForce: [0, 20, 0.5],
  linkForce: [0, 1, 0.05],
  linkDistance: [10, 250, 5],
} as const satisfies Partial<Record<keyof GraphSettings, readonly [number, number, number]>>;

const STORAGE_KEY = "lifeos.knowledgeGraph";

/** Nilai tersimpan → pengaturan sah (kunci asing dibuang, angka dijepit ke rentang). */
export function parseGraphSettings(value: unknown): GraphSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result = { ...DEFAULT_GRAPH_SETTINGS };
  for (const key of Object.keys(DEFAULT_GRAPH_SETTINGS) as (keyof GraphSettings)[]) {
    const fallback = DEFAULT_GRAPH_SETTINGS[key];
    const v = raw[key];
    if (typeof fallback === "boolean" && typeof v === "boolean") (result as Record<string, unknown>)[key] = v;
    if (typeof fallback === "number" && typeof v === "number" && Number.isFinite(v)) {
      const range = GRAPH_RANGES[key as keyof typeof GRAPH_RANGES];
      (result as Record<string, unknown>)[key] = range ? Math.min(range[1], Math.max(range[0], v)) : v;
    }
  }
  return result;
}

export function loadGraphSettings(): GraphSettings {
  try {
    return parseGraphSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_GRAPH_SETTINGS;
  }
}

export function saveGraphSettings(settings: GraphSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Penyimpanan browser tidak tersedia (mode privat) — pengaturan hanya berlaku di sesi ini
  }
}

/**
 * Gaya Obsidian → parameter simulasi d3: tolakan (charge, negatif), tarikan pusat (forceX/Y), kekuatan tautan.
 * Skala dipilih agar nilai bawaan setara tampilan graf sebelumnya.
 */
export const forceParams = (s: Pick<GraphSettings, "centerForce" | "repelForce" | "linkForce">) => ({
  charge: -s.repelForce * 6,
  center: s.centerForce * 0.1,
  link: s.linkForce,
});

/** Opasitas label menurut zoom: 0 di bawah ambang, naik halus sampai penuh di 1,5× ambang. */
export function labelAlpha(scale: number, threshold: number) {
  if (threshold <= 0) return 1;
  if (scale <= threshold) return 0;
  return Math.min(1, (scale - threshold) / (threshold * 0.5));
}

/** Urutan kemunculan tombol Animasi: catatan tertua dulu (seperti Obsidian), lalu path. */
export function animationOrder<T extends { id: string; path?: string; createdAt?: string }>(nodes: T[]) {
  return [...nodes]
    .sort(
      (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || (a.path ?? a.id).localeCompare(b.path ?? b.id),
    )
    .map((n) => n.id);
}
