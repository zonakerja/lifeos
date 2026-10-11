/**
 * Berbagi item antar-user (lihat backend `src/sharing/`). Item milik user lain yang dapat diakses membawa `share`
 * (pemilik, izin, root/turunan); item milik sendiri tidak.
 */
import { links } from "@/lib/deep-links";
import type { RecordType, ShareableType, ShareMeta, SharePermission } from "@/types/api";

export const PERMISSION_LABEL: Record<SharePermission, string> = {
  view: "Lihat",
  comment: "Komentar",
  edit: "Edit",
};

export const PERMISSION_HINT: Record<SharePermission, string> = {
  view: "Hanya melihat isi & membuka berkas",
  comment: "Melihat dan menulis komentar",
  edit: "Mengubah isi, menambah & menghapus turunan, dan berkomentar",
};

const RANK: Record<SharePermission, number> = { view: 1, comment: 2, edit: 3 };

export const SHAREABLE_LABEL: Record<ShareableType, string> = {
  para_project: "Project",
  para_area: "Area",
  para_resource: "Resource",
  free_note: "Catatan",
  ai_note: "Notes AI",
  list: "List",
  schedule: "Agenda",
};

/** Yang ikut terbagi bersama item induk (ditampilkan di dialog Bagikan). */
export const SHARE_SCOPE_HINT: Record<ShareableType, string> = {
  para_project: "Action, lampiran, dan berkasnya ikut terbagi.",
  para_area: "Sub area, kegiatan, sub kegiatan, project, task, lampiran, dan berkasnya ikut terbagi.",
  para_resource: "Berkas atau catatan yang dirujuk ikut terbagi.",
  free_note: "Gambar di dalam catatan ikut terbagi.",
  ai_note: "Rekaman, dokumen, dan agenda terhubung ikut terbagi (baca saja).",
  list: "Seluruh item di dalam list ikut terbagi.",
  schedule: "Dasar pelaksanaan, hasil agenda, berkas, dan Notes AI terhubung ikut terbagi.",
};

export interface ItemAccess {
  /** Item milik user lain */
  shared: boolean;
  ownerId?: string;
  ownerName?: string;
  /** Izin atas item milik user lain; undefined = milik sendiri */
  permission?: SharePermission;
  /** Boleh mengubah isi (pemilik atau izin edit) */
  canEdit: boolean;
  /** Boleh menulis komentar */
  canComment: boolean;
  /** Hanya pemilik: bagikan, hapus item induk, arsipkan */
  isOwner: boolean;
}

export function itemAccess(item?: { share?: ShareMeta } | null): ItemAccess {
  const share = item?.share;
  if (!share) return { shared: false, canEdit: true, canComment: true, isOwner: true };
  return {
    shared: true,
    ownerId: share.ownerId,
    ownerName: share.ownerName,
    permission: share.permission,
    canEdit: RANK[share.permission] >= RANK.edit,
    canComment: RANK[share.permission] >= RANK.comment,
    isOwner: false,
  };
}

/** Item milik sendiri (bukan yang dibagikan user lain). */
export const isMine = (item: { share?: ShareMeta }) => !item.share;

/** Path untuk membuka item yang dibagikan (Pengaturan → Berbagi). */
export function sharedItemPath(type: ShareableType | RecordType, id: string): string | null {
  switch (type) {
    case "para_project":
      return links.project(id);
    case "para_area":
      return links.area(id);
    case "para_resource":
      return links.resource(id);
    case "free_note":
      return links.note("free", id);
    case "ai_note":
      return links.note("ai", id);
    case "list":
      return links.list(id);
    case "schedule":
      return links.schedule(id);
    default:
      return null;
  }
}
