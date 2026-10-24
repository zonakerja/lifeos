import type { GroupKind, WaContact, WaConversation, WaMessage, WaMessageStatus } from "@/types/api";

/** Tampilan nomor: `+62 812-3456-7890` (sama dengan `formatPhone` backend). */
export function formatPhone(phone: string) {
  if (!phone.startsWith("62")) return `+${phone}`;
  const rest = phone.slice(2);
  return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`.replace(/-$/, "");
}

export const MESSAGE_STATUS: Record<WaMessageStatus, { label: string; tone: string }> = {
  received: { label: "Diproses bot…", tone: "bg-muted text-muted-foreground" },
  answered: { label: "Terjawab", tone: "bg-success/15 text-success" },
  needs_reply: { label: "Perlu dijawab", tone: "bg-warning/15 text-warning" },
  ignored: { label: "Tidak diproses", tone: "bg-muted text-muted-foreground" },
  sent: { label: "Terkirim", tone: "bg-success/15 text-success" },
  simulated: { label: "Simulasi", tone: "bg-info/15 text-info" },
  failed: { label: "Gagal kirim", tone: "bg-destructive/15 text-destructive" },
};

export const INTENT_LABELS: Record<string, string> = {
  question: "Pertanyaan",
  request: "Pengajuan",
  status: "Cek status",
  unregistered: "Nomor belum terdaftar",
  unverified: "Belum diverifikasi",
  off_topic: "Di luar topik",
  rate_limited: "Terlalu sering",
  unsupported: "Jenis pesan tak didukung",
  manual: "Balasan petugas",
  notice: "Kabar status",
  error: "Kendala",
};

/** Nama tampil percakapan: nama kontak atau nomor saja. */
export function conversationTitle(c: Pick<WaConversation, "phone" | "contact">) {
  return c.contact ? c.contact.name : formatPhone(c.phone);
}

/** Saring percakapan per kata (nama, nomor, grup) + hanya yang perlu dijawab; yang perlu dijawab di atas. */
export function filterConversations(items: WaConversation[], query: string, onlyPending: boolean) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((c) => !onlyPending || c.needsReply > 0)
    .filter((c) => {
      const hay = [c.contact?.name, c.contact?.group?.name, c.contact?.group?.code, c.phone, formatPhone(c.phone)]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort(
      (a, b) =>
        (b.needsReply > 0 ? 1 : 0) - (a.needsReply > 0 ? 1 : 0) ||
        b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt),
    );
}

/** Pertanyaan terakhir yang belum terjawab (bahan "Simpan ke Inbox" sebagai FAQ). */
export function lastPendingQuestion(messages: WaMessage[]) {
  return [...messages].reverse().find((m) => m.direction === "in" && m.status === "needs_reply")?.text ?? "";
}

/** Judul catatan FAQ dari pertanyaan (maks. 80 karakter, tanpa tanda tanya ganda). */
export function faqTitle(question: string) {
  const text = question
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?!.]+$/, "");
  return text ? `FAQ - ${text.slice(0, 80)}` : "FAQ WhatsApp";
}

/** Label jenis grup kontak. */
export const GROUP_KIND_LABELS: Record<GroupKind, string> = {
  satker: "Satuan kerja",
  instansi: "Instansi / mitra",
  masyarakat: "Masyarakat umum",
  internal: "Internal / tim",
  lainnya: "Lainnya",
};

/** Ringkasan hak akses grup untuk ditampilkan. */
export function groupAccessSummary(g: { allowRequests: boolean; shareRequests: boolean }) {
  return [
    "Tanya pengetahuan publik + khusus grup",
    g.allowRequests ? "boleh kirim pengajuan" : "tidak bisa kirim pengajuan",
    g.shareRequests ? "lihat status seluruh grup" : "lihat status miliknya saja",
  ].join(" · ");
}

/** Kontak boleh memakai bot bila aktif & terverifikasi. */
export const contactReady = (c: Pick<WaContact, "active" | "verified">) => c.active && c.verified;
