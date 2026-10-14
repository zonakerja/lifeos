import { formatLocalYMD, parseLocalYMD, startOfDay } from "@/lib/dates";
import type {
  ArchiveBorrowing,
  ArchiveClassification,
  ArchiveItemRef,
  ArchiveJra,
  ArchiveResource,
  DispositionType,
  DynamicStatus,
  PhysicalReference,
  PhysRefType,
} from "@/types/entities";

/**
 * Logika murni kearsipan. Tidak ada React di sini
 * agar mudah diuji dan dipakai ulang oleh semua tab File Control.
 */

/** Arsip yang sedang dikelola File Control: resource file aktif + file di dalam PARA Archive. */
export interface ArchiveFile extends ArchiveResource {
  /** true bila sumbernya snapshot `para_archive` */
  isArchived: boolean;
  archiveWrapperId?: string;
  archivedAt?: string;
  dynamicStatus: DynamicStatus;
}

// ---------------------------------------------------------------------------
// Status & retensi
// ---------------------------------------------------------------------------

const parseDate = (value?: string) => (value ? (parseLocalYMD(value) ?? new Date(value)) : null);

/** Status dinamis terhadap `today` (00:00): expired = "Perlu Tindak Lanjut". */
export function computeDynamicStatus(r: ArchiveResource, today: Date): DynamicStatus {
  const base = startOfDay(today);
  if (r.status === "destroyed") return "destroyed";
  if (r.status === "static") return "static";
  if (r.retentionActiveDate && r.retentionInactiveDate && r.archivalStatus !== "none") {
    const active = parseDate(r.retentionActiveDate);
    const inactive = parseDate(r.retentionInactiveDate);
    if (inactive && base > inactive) return r.isVital ? "inactive" : "expired";
    if (active && base > active) return "inactive";
    return "active";
  }
  return (r.status as DynamicStatus) || "active";
}

export const STATUS_LABEL: Record<DynamicStatus, string> = {
  active: "Aktif",
  inactive: "Inaktif",
  expired: "Perlu Tindak Lanjut",
  static: "Statis",
  destroyed: "Musnah",
};

/** Kelas badge per status (token desain, bukan warna hardcoded). */
export const STATUS_TONE: Record<DynamicStatus, string> = {
  active: "border-success/30 bg-success/10 text-success",
  inactive: "border-warning/40 bg-warning/20 text-warning-foreground dark:text-warning",
  expired: "border-destructive/30 bg-destructive/10 text-destructive",
  static: "border-info/30 bg-info/10 text-info",
  destroyed: "border-border bg-muted text-muted-foreground",
};

/** Arsip sudah diberkaskan (fisik/digital) dan belum statis/musnah. */
export const isManagedArchive = (r: ArchiveResource) =>
  !!r.archivalStatus && r.archivalStatus !== "pending" && r.archivalStatus !== "none";

export const isFinalStatus = (r: ArchiveResource) => r.status === "destroyed" || r.status === "static";

/** Label status untuk cetak daftar isi wadah (dihitung pada tanggal cetak). */
export function printStatusLabel(r: ArchiveResource, today: Date) {
  const base = startOfDay(today);
  const active = parseDate(r.retentionActiveDate);
  const inactive = parseDate(r.retentionInactiveDate);
  if (inactive && base >= inactive) return "Perlu Tindak Lanjut";
  if (active && base >= active) return "Inaktif";
  return "Aktif";
}

/** Tanggal retensi dari JRA: tanggal dokumen + aktif tahun, lalu + inaktif tahun. */
export function retentionDatesFromJra(docDate: string, jra: ArchiveJra) {
  const base = parseDate(docDate);
  if (!base) return null;
  const active = new Date(base);
  active.setFullYear(active.getFullYear() + (Number.parseInt(String(jra.retensiAktif)) || 0));
  const inactive = new Date(active);
  inactive.setFullYear(inactive.getFullYear() + (Number.parseInt(String(jra.retensiInaktif)) || 0));
  return { retentionActiveDate: formatLocalYMD(active), retentionInactiveDate: formatLocalYMD(inactive) };
}

/** ID registrasi arsip `ARC-<tahun dokumen>-<6 karakter acak>`. */
export function generateArchiveRegId(docDate?: string) {
  const year = parseDate(docDate)?.getFullYear() ?? new Date().getFullYear();
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  return `ARC-${year}-${suffix}`;
}

export const isPermanent = (jra?: ArchiveJra) => jra?.keterangan === "Permanen";

/** ID arsip yang sedang dipinjam (peminjaman berstatus aktif). */
export const borrowedArchiveIds = (borrowings: Pick<ArchiveBorrowing, "status" | "items">[]) =>
  new Set(borrowings.filter((b) => b.status === "active").flatMap((b) => (b.items ?? []).map((i) => i.id)));

/**
 * Alasan arsip tidak boleh disusutkan dengan jenis `type` (null = boleh). Satu aturan untuk penyusutan dari daftar
 * arsip maupun BAP manual: hanya arsip terkelola yang "Perlu Tindak Lanjut", bukan vital, tidak sedang dipinjam;
 * pemusnahan hanya untuk JRA non-Permanen, penyerahan statis hanya untuk JRA Permanen.
 */
export function dispositionBlockReason(
  r: ArchiveFile,
  type: DispositionType,
  jra: ArchiveJra | undefined,
  borrowed: Set<string>,
): string | null {
  if (!isManagedArchive(r)) return "belum diberkaskan";
  if (isFinalStatus(r)) return "sudah berstatus Statis/Musnah";
  if (r.isVital) return "arsip vital tidak dapat disusutkan";
  if (r.dynamicStatus !== "expired") return "masa retensi inaktif belum selesai";
  if (type === "destroy" && isPermanent(jra)) return "JRA Permanen harus diserahkan (statis), bukan dimusnahkan";
  if (type === "transfer" && !isPermanent(jra)) return "hanya arsip dengan JRA Permanen yang diserahkan";
  if (borrowed.has(r.id)) return "sedang dipinjam — selesaikan peminjamannya dulu";
  return null;
}

// ---------------------------------------------------------------------------
// Referensi
// ---------------------------------------------------------------------------

export const classificationCode = (c?: ArchiveClassification) =>
  c ? `${c.kodePokok}.${c.kodeSub}.${c.kodeItem}` : "---";

export const archiveTitle = (r: { title?: string; name?: string }) => r.title || r.name || "Tanpa Judul";

/** Kunci keunikan klasifikasi = kode lengkap P.S.I (tanpa peka huruf besar/kecil). */
export const classificationKey = (c: Pick<ArchiveClassification, "kodePokok" | "kodeSub" | "kodeItem">) =>
  `${c.kodePokok}.${c.kodeSub}.${c.kodeItem}`.trim().toUpperCase();

/** Kunci keunikan JRA = kategori utama + sub kategori + jenis arsip. */
export const jraKey = (j: Pick<ArchiveJra, "kategoriUtama" | "subKategori" | "jenisArsip">) =>
  [j.kategoriUtama, j.subKategori, j.jenisArsip]
    .map((s) =>
      String(s ?? "")
        .trim()
        .toLowerCase(),
    )
    .join("|");

/** Jumlah arsip (termasuk yang sudah statis/musnah) yang merujuk klasifikasi/JRA tertentu. */
export const countArchivesUsing = (
  files: Pick<ArchiveResource, "classificationId" | "jraId">[],
  field: "classificationId" | "jraId",
  id: string,
) => files.filter((f) => f[field] === id).length;

/** Lokasi fisik lengkap "Gedung / Rak / Box / Folder" ("" = belum ditata). */
export const locationPath = (r: ArchiveResource, refs: PhysicalReference[]) =>
  [r.physLocationId, r.physRackId, r.physBoxId, r.physFolderId]
    .map((id) => (id ? refs.find((x) => x.id === id)?.name : undefined))
    .filter(Boolean)
    .join(" / ");

/** Hari keterlambatan peminjaman aktif terhadap target kembali (0 = belum terlambat / sudah selesai). */
export function borrowingOverdueDays(b: Pick<ArchiveBorrowing, "status" | "returnDate">, today: Date) {
  const due = parseDate(b.returnDate);
  if (b.status !== "active" || !due) return 0;
  const diff = Math.round((startOfDay(today).getTime() - startOfDay(due).getTime()) / 86_400_000);
  return Math.max(0, diff);
}

export const toItemRef = (r: ArchiveResource): ArchiveItemRef => ({
  id: r.id,
  title: r.title,
  number: r.number,
  archiveRegId: r.archiveRegId,
});

/** Kode wadah fisik berikutnya: `LOC|RAK|BOX|MAP-<tahun>-<urut>` (urut di-reset per tahun). */
const PHYS_PREFIX: Record<PhysRefType, string> = { location: "LOC", rack: "RAK", box: "BOX", folder: "MAP" };

export function maxCodeNumber(refs: PhysicalReference[], type: PhysRefType, year = new Date().getFullYear()) {
  const numbers = refs
    .filter((r) => r.type === type && r.code?.includes(`-${year}-`))
    .map((r) => Number.parseInt(r.code.split("-").at(-1) ?? "", 10) || 0);
  return numbers.length > 0 ? Math.max(...numbers) : 0;
}

export function formatPhysCode(type: PhysRefType, num: number, year = new Date().getFullYear()) {
  return `${PHYS_PREFIX[type]}-${year}-${String(num).padStart(type === "folder" ? 4 : 3, "0")}`;
}

export const generateNextCode = (refs: PhysicalReference[], type: PhysRefType) =>
  formatPhysCode(type, maxCodeNumber(refs, type) + 1);

export const generatePhysId = () => `phys-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// ---------------------------------------------------------------------------
// Hierarki fisik
// ---------------------------------------------------------------------------

export const PHYS_TYPE_LABEL: Record<PhysRefType, string> = {
  location: "Gedung / Ruang",
  rack: "Lemari / Rak",
  box: "Boks Arsip",
  folder: "Folder / Map",
};

export const PHYS_SHORT_LABEL: Record<PhysRefType | "root" | "file", string> = {
  location: "Gedung",
  rack: "Rak",
  box: "Box",
  folder: "Folder",
  root: "Root",
  file: "Arsip",
};

const LEVELS: Record<PhysRefType | "root", number> = { root: 0, location: 1, rack: 2, box: 3, folder: 4 };

/** Wadah hanya boleh masuk ke wadah satu tingkat di atasnya; arsip boleh ke mana saja. */
export function isValidHierarchy(itemType: PhysRefType | "file", targetType: PhysRefType | "root") {
  if (itemType === "file") return true;
  return LEVELS[itemType] === LEVELS[targetType] + 1;
}

/** Jenis wadah yang dibuat di dalam wadah `parentType` (null = tidak bisa). */
export const childTypeOf = (parentType: PhysRefType | "root"): PhysRefType | null =>
  parentType === "root"
    ? "location"
    : parentType === "location"
      ? "rack"
      : parentType === "rack"
        ? "box"
        : parentType === "box"
          ? "folder"
          : null;

/** ID wadah terdalam tempat arsip berada ("" = belum punya lokasi). */
export const deepestContainerId = (r: ArchiveResource) =>
  r.physFolderId || r.physBoxId || r.physRackId || r.physLocationId || "";

export const EMPTY_LOCATION = { physLocationId: "", physRackId: "", physBoxId: "", physFolderId: "" };

/** Rantai lokasi lengkap untuk arsip yang dimasukkan ke `target` (null = root). */
export function locationForTarget(target: PhysicalReference | null, refs: PhysicalReference[]) {
  const locs = { ...EMPTY_LOCATION };
  if (!target) return locs;
  const find = (id?: string) => refs.find((x) => x.id === id);
  if (target.type === "folder") {
    locs.physFolderId = target.id;
    locs.physBoxId = target.parentId || "";
    const box = find(target.parentId);
    if (box) {
      locs.physRackId = box.parentId || "";
      const rack = find(box.parentId);
      if (rack) locs.physLocationId = rack.parentId || "";
    }
  } else if (target.type === "box") {
    locs.physBoxId = target.id;
    locs.physRackId = target.parentId || "";
    const rack = find(target.parentId);
    if (rack) locs.physLocationId = rack.parentId || "";
  } else if (target.type === "rack") {
    locs.physRackId = target.id;
    locs.physLocationId = target.parentId || "";
  } else {
    locs.physLocationId = target.id;
  }
  return locs;
}

export function descendantIds(refs: PhysicalReference[], parentId: string): string[] {
  return refs.filter((r) => r.parentId === parentId).flatMap((child) => [child.id, ...descendantIds(refs, child.id)]);
}

/**
 * Arsip yang ditata di wadah fisik. Arsip digital tidak punya lokasi fisik (lokasi lama yang mungkin tersimpan
 * diabaikan) sehingga tidak tampil di Penataan dan tidak dihitung sebagai isi wadah.
 */
export const isPhysicalArchive = (r: Pick<ArchiveResource, "archivalStatus">) => r.archivalStatus === "physical";

/** Wadah (atau sub-wadahnya) masih berisi arsip fisik? */
export function containerHasFiles(containerId: string, refs: PhysicalReference[], files: ArchiveResource[]): boolean {
  const direct = files.some(
    (r) =>
      isPhysicalArchive(r) &&
      (r.physLocationId === containerId ||
        r.physRackId === containerId ||
        r.physBoxId === containerId ||
        r.physFolderId === containerId),
  );
  if (direct) return true;
  return refs.filter((r) => r.parentId === containerId).some((child) => containerHasFiles(child.id, refs, files));
}

/** Cari arsip/wadah dari hasil scan: ID, lalu kode wadah, lalu ID registrasi arsip. */
export function findBySmartCode(code: string, refs: PhysicalReference[], files: ArchiveFile[]) {
  const byId = refs.find((r) => r.id === code) ?? files.find((f) => f.id === code);
  if (byId) return byId;
  return refs.find((r) => r.code === code) ?? files.find((f) => f.archiveRegId === code);
}
