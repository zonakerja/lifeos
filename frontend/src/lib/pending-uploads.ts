/**
 * Pencatat berkas yang sudah diunggah tetapi **belum tersimpan** di data mana pun (mis. sudah dipilih di form lampiran
 * tetapi belum "Tambahkan" / form belum disimpan). Cleanup React tidak berjalan saat tab di-reload atau ditutup, jadi
 * berkas seperti itu bisa tertinggal di storage. Pencatat ini:
 * - menyimpan daftar `uploadId` per user di localStorage beserta pemiliknya (instans halaman) dan detak terakhir;
 * - saat halaman ditutup/di-reload (`pagehide`): menandai catatannya "ditinggalkan" + menghapus berkasnya (keepalive);
 * - sapuan berkala (tab mana pun milik user yang sama): menghapus berkas catatan yang ditinggalkan, atau yang pemiliknya
 *   tidak berdetak lebih dari `STALE_MS` (mis. browser crash).
 * Hanya berkas yang **belum pernah tersimpan** yang dicatat, sehingga sapuan tidak pernah menyentuh berkas yang dipakai.
 */

export interface PendingUpload {
  id: string;
  /** Instans halaman yang mengunggah */
  owner: string;
  /** Detak terakhir pemilik (ms); 0 = ditinggalkan (halaman sudah ditutup) */
  at: number;
}

export const ABANDONED = 0;
/** Pemilik yang tidak berdetak selama ini dianggap mati (tab hidden bisa dibekukan browser → batas longgar). */
export const STALE_MS = 24 * 60 * 60 * 1000;
export const HEARTBEAT_MS = 60 * 1000;

// ---------------------------------------------------------------------------- logika murni

export const addPending = (entries: PendingUpload[], id: string, owner: string, now: number) => [
  ...entries.filter((e) => e.id !== id),
  { id, owner, at: now },
];

export const removePending = (entries: PendingUpload[], id: string) => entries.filter((e) => e.id !== id);

/** Perbarui detak semua catatan milik `owner`. */
export const touchOwner = (entries: PendingUpload[], owner: string, now: number) =>
  entries.map((e) => (e.owner === owner ? { ...e, at: now } : e));

/** Tandai catatan milik `owner` ditinggalkan (halaman ditutup / di-reload). */
export const abandonOwner = (entries: PendingUpload[], owner: string) =>
  entries.map((e) => (e.owner === owner ? { ...e, at: ABANDONED } : e));

/** Catatan yang boleh dibersihkan oleh halaman `owner` (bukan miliknya sendiri yang masih hidup). */
export const sweepable = (entries: PendingUpload[], owner: string, now: number) =>
  entries.filter((e) => e.owner !== owner && (e.at === ABANDONED || now - e.at > STALE_MS));

// ---------------------------------------------------------------------------- penyimpanan (per user)

/** ID instans halaman ini (baru setiap muat halaman — tab duplikat / reload = pemilik berbeda). */
export const PAGE_ID = `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

let currentUserId: string | null = null;
/** Dipanggil saat sesi berubah: catatan disimpan terpisah per user. */
export const setPendingUploadsUser = (userId: string | null) => {
  currentUserId = userId;
};

const storageKey = () => (currentUserId ? `lifeos.pendingUploads.${currentUserId}` : null);

export const readPending = (): PendingUpload[] => {
  const key = storageKey();
  if (!key) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((e): e is PendingUpload => !!e && typeof e.id === "string" && typeof e.owner === "string")
      : [];
  } catch {
    return [];
  }
};

export const updatePending = (fn: (entries: PendingUpload[]) => PendingUpload[]) => {
  const key = storageKey();
  if (!key) return;
  try {
    const next = fn(readPending());
    if (next.length) localStorage.setItem(key, JSON.stringify(next));
    else localStorage.removeItem(key);
  } catch {
    // Storage diblokir / penuh: pencatatan hanya upaya terbaik
  }
};

/** Catat berkas yang baru diunggah dan belum tersimpan di data mana pun. */
export const trackPendingUpload = (id: string | undefined) => {
  if (id) updatePending((entries) => addPending(entries, id, PAGE_ID, Date.now()));
};

/** Hapus catatan: berkas sudah tersimpan (dipakai data) atau sudah dibuang. */
export const untrackPendingUpload = (id: string | undefined) => {
  if (id) updatePending((entries) => removePending(entries, id));
};
