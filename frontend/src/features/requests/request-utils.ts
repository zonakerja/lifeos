import type {
  AgentPolicy,
  AgentPolicyInput,
  AgentPolicyMode,
  AssetField,
  RequestAutoDecision,
  RequestChecklistItem,
  RequestHistoryEntry,
  RequestKind,
  RequestStatus,
  RequestSummary,
} from "@/types/api";

/** Sama dengan `KIND_LABELS` backend (`requests/request-logic.ts`). */
export const KIND_LABELS: Record<RequestKind, string> = {
  psp: "PSP BMN",
  penghapusan: "Penghapusan BMN",
  pemanfaatan: "Pemanfaatan BMN",
  surat: "Surat / permintaan",
  lainnya: "Lainnya",
};
export const KIND_OPTIONS = Object.entries(KIND_LABELS) as [RequestKind, string][];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  baru: "Baru",
  diproses: "Diproses",
  menunggu_verifikasi: "Menunggu verifikasi",
  disetujui: "Disetujui",
  dikirim: "Dikirim",
  ditolak: "Ditolak",
};

export const STATUS_TONE: Record<RequestStatus, string> = {
  baru: "bg-info/15 text-info",
  diproses: "bg-module-soft text-module",
  menunggu_verifikasi: "bg-warning/15 text-warning",
  disetujui: "bg-success/15 text-success",
  dikirim: "bg-success/15 text-success",
  ditolak: "bg-destructive/15 text-destructive",
};

export const CHECK_LABELS: Record<RequestChecklistItem["status"], string> = {
  ada: "Ada",
  tidak_ada: "Tidak ada",
  perlu_dicek: "Perlu dicek",
};
export const CHECK_TONE: Record<RequestChecklistItem["status"], string> = {
  ada: "bg-success/15 text-success",
  tidak_ada: "bg-destructive/15 text-destructive",
  perlu_dicek: "bg-warning/15 text-warning",
};

/** Tab Antrian = yang masih perlu dikerjakan; Selesai = sudah diputuskan user. */
export const TAB_STATUSES: Record<"queue" | "done", RequestStatus[]> = {
  queue: ["baru", "diproses", "menunggu_verifikasi"],
  done: ["disetujui", "dikirim", "ditolak"],
};

/** Urutan antrian: menunggu verifikasi dulu (tinggal diputuskan), lalu baru, lalu diproses; terbaru dulu. */
const QUEUE_ORDER: Record<RequestStatus, number> = {
  menunggu_verifikasi: 0,
  baru: 1,
  diproses: 2,
  disetujui: 3,
  dikirim: 3,
  ditolak: 3,
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Saring daftar pengajuan per tab, jenis, dan kata kunci (judul, pemohon, kode grup, nomor, perihal; per kata, tanpa aksen). */
export function filterRequests(
  items: RequestSummary[],
  { tab, kind, query }: { tab: "queue" | "done"; kind: RequestKind | "all"; query: string },
) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return items
    .filter((r) => TAB_STATUSES[tab].includes(r.status))
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => {
      if (!words.length) return true;
      const hay = normalize(
        [r.title, r.applicant, r.groupCode, r.letterNumber, r.subject, KIND_LABELS[r.kind]].join(" "),
      );
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) =>
      tab === "queue" && QUEUE_ORDER[a.status] !== QUEUE_ORDER[b.status]
        ? QUEUE_ORDER[a.status] - QUEUE_ORDER[b.status]
        : b.updatedAt.localeCompare(a.updatedAt),
    );
}

/** Nilai awal formulir isi templat: usulan AI menimpa nilai kosong, nilai yang sudah diketik user dipertahankan. */
export function mergeSuggestedValues(current: Record<string, string>, suggested: Record<string, string>) {
  const next = { ...current };
  for (const [key, value] of Object.entries(suggested)) if (!next[key]?.trim()) next[key] = value;
  return next;
}

/** Label ramah untuk nama penanda templat (`jabatan_tujuan` → "Jabatan tujuan"). */
export const tagLabel = (tag: string) => {
  const text = tag.replace(/_+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : tag;
};

/** Nama berkas bawaan dokumen dari templat. */
export const defaultDocumentName = (templateName: string, title: string) =>
  `${templateName} - ${title}`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 150);

// ---------------------------------------------------------------- Kebijakan Otomatis (docs/AI-AGENT.md §24)

export const HISTORY_ACTOR: Record<RequestHistoryEntry["by"], string> = {
  user: "Anda",
  agen: "agen AI",
  kebijakan: "Kebijakan Otomatis",
};

export const POLICY_MODE_LABELS: Record<AgentPolicyMode, string> = {
  off: "Mati",
  shadow: "Shadow (hanya dicatat)",
  auto: "Otomatis",
};

export const ASSET_FIELD_LABELS: Record<AssetField, string> = {
  nup: "NUP",
  kodeBarang: "Kode barang",
  nama: "Nama barang",
  nilai: "Nilai",
};

/** Nilai awal formulir aturan baru: mode shadow, ambang 75%, NUP & kode barang wajib cocok. */
export const defaultPolicyInput = (): AgentPolicyInput => ({
  name: "",
  skill: "",
  requestKind: "psp",
  groupCodes: [],
  mode: "shadow",
  threshold: 75,
  criticalFields: ["nup", "kodeBarang"],
  valueTolerance: 0,
  dailyLimit: 5,
  holdMinutes: 15,
  registerTemplate: null,
});

/** Data aturan tersimpan → isian formulir (tanpa id/statistik yang ditolak validasi backend). */
export const policyToInput = (p: AgentPolicyInput): AgentPolicyInput => ({
  name: p.name,
  skill: p.skill,
  requestKind: p.requestKind,
  groupCodes: p.groupCodes,
  mode: p.mode,
  threshold: p.threshold,
  criticalFields: p.criticalFields,
  valueTolerance: p.valueTolerance,
  dailyLimit: p.dailyLimit,
  holdMinutes: p.holdMinutes,
  registerTemplate: p.registerTemplate,
});

/** "Kode grup" diketik dipisah koma/spasi → daftar huruf besar unik. */
export const parseGroupCodes = (text: string) => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  ),
];

/** Kecocokan mode shadow: "8 dari 10 sama dengan keputusan Anda" (null bila belum ada pembanding). */
export function policyAgreement(stats: AgentPolicy["stats"]) {
  if (!stats.judged) return null;
  return { agree: stats.agree, judged: stats.judged, percent: Math.round((stats.agree / stats.judged) * 100) };
}

export type AutoDecisionState = "shadow" | "review" | "waiting" | "sent" | "cancelled" | "failed" | "approved";

/** Keadaan keputusan otomatis untuk penanda & panel detail. */
export function autoDecisionState(d: RequestAutoDecision): AutoDecisionState {
  if (!d.applied) return d.outcome === "approve" ? "shadow" : "review";
  if (d.cancelledAt) return "cancelled";
  if (d.sentAt) return "sent";
  if (d.error) return "failed";
  if (d.sendAt) return "waiting";
  return "approved";
}

export const AUTO_STATE_LABELS: Record<AutoDecisionState, string> = {
  shadow: "Shadow: akan disetujui",
  review: "Perlu telaah",
  waiting: "Menunggu dikirim ke SRIKANDI",
  sent: "Konsep di SRIKANDI",
  cancelled: "Kiriman dibatalkan",
  failed: "Gagal dikirim",
  approved: "Disetujui otomatis",
};

export const AUTO_STATE_TONE: Record<AutoDecisionState, string> = {
  shadow: "bg-info/15 text-info",
  review: "bg-warning/15 text-warning",
  waiting: "bg-module-soft text-module",
  sent: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
  approved: "bg-success/15 text-success",
};
