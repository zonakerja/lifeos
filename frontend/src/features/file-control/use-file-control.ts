import { isInFileControl } from "@/features/resources/file-control-intake";
import { useMemo } from "react";
import {
  useBorrowings,
  useDispositionLogs,
  useJraList,
  useMoveLogs,
  useParaArchives,
  usePhysRefs,
  useResources,
} from "@/data/collections";
import { useToday } from "@/hooks/use-today";
import { useAuthStore } from "@/stores/auth-store";
import type {
  ArchiveBorrowing,
  ArchiveDispositionLog,
  ArchiveResource,
  DispositionData,
  DispositionType,
  MovedItem,
  PhysicalReference,
  Resource,
} from "@/types/entities";
import {
  type ArchiveFile,
  computeDynamicStatus,
  descendantIds,
  EMPTY_LOCATION,
  formatPhysCode,
  generatePhysId,
  isPermanent,
  locationForTarget,
  maxCodeNumber,
  toItemRef,
} from "./lib/archive";

/** Buang field sementara agar tidak ikut tersimpan. */
function toStoredResource(file: ArchiveResource & Partial<ArchiveFile>): Resource {
  const { dynamicStatus: _d, isArchived: _i, archiveWrapperId: _w, archivedAt: _a, ...rest } = file;
  return rest as Resource;
}

const withDispositionTag = (tags: string[] | undefined, label: string) => [
  ...(tags ?? []).filter((t) => t !== "Musnah" && t !== "Statis"),
  label,
];

const randomSuffix = () => Math.floor(Math.random() * 1000);

/**
 * Sumber data File Control: resource bertipe file (aktif) + file yang ada di dalam
 * snapshot PARA Archive. Setiap perubahan dirutekan kembali ke koleksi asalnya.
 * Default hanya arsip milik sendiri (pengelolaan, auto-dispose, transaksi); `includeShared` menyertakan arsip yang
 * dibagikan user lain (tab Dibagikan & detail arsip).
 */
export function useArchiveFiles({ includeShared = false }: { includeShared?: boolean } = {}) {
  const today = useToday();
  const resources = useResources();
  const archives = useParaArchives();

  const files = useMemo<ArchiveFile[]>(() => {
    const active = resources.items
      // Hanya berkas yang dimasukkan ke File Control (centang "Masukkan ke File Control"), bukan semua resource berkas
      .filter((r) => isInFileControl(r) && (includeShared || !r.share))
      .map((r) => ({ ...(r as ArchiveResource), isArchived: false }));
    const archived = archives.items
      .filter(
        (a) =>
          String(a.originalType).toLowerCase() === "resource" &&
          isInFileControl(a.data as { type?: string; archivalStatus?: string }),
      )
      .map((a) => ({
        ...(a.data as unknown as ArchiveResource),
        isArchived: true,
        archivedAt: a.archivedAt,
        archiveWrapperId: a.id,
      }));
    return [...active, ...archived].map((r) => ({ ...r, dynamicStatus: computeDynamicStatus(r, today) }));
  }, [resources.items, archives.items, today, includeShared]);

  /** Simpan perubahan banyak arsip sekaligus (dirutekan ke resources / para_archive). */
  const saveFiles = (updated: (ArchiveResource & Partial<ArchiveFile>)[]) => {
    const toArchive = updated.filter((f) => f.isArchived && f.archiveWrapperId);
    const toResources = updated.filter((f) => !f.isArchived);
    if (toResources.length > 0) {
      const byId = new Map(toResources.map((f) => [f.id, toStoredResource(f)]));
      resources.setItems((prev) => prev.map((r) => byId.get(r.id) ?? r));
    }
    if (toArchive.length > 0) {
      const byWrapper = new Map(toArchive.map((f) => [f.archiveWrapperId, toStoredResource(f)]));
      archives.setItems((prev) =>
        prev.map((a) => {
          const data = byWrapper.get(a.id);
          return data ? { ...a, data: data as unknown as Record<string, unknown> } : a;
        }),
      );
    }
  };

  return {
    files,
    saveFiles,
    isLoading: resources.isLoading || archives.isLoading,
  };
}

/** Semua aksi File Control yang mengubah data. */
export function useFileControlActions() {
  const userName = useAuthStore((s) => s.user?.name) || "Admin";
  const { files, saveFiles } = useArchiveFiles();
  const physRefs = usePhysRefs();
  const jra = useJraList();
  const borrowings = useBorrowings();
  const dispositions = useDispositionLogs();
  const moveLogs = useMoveLogs();

  const addMoveLog = (
    prefix: "MV-LOG" | "MV-CTR" | "MV-BLK",
    description: string,
    targetName: string,
    movedItems?: MovedItem[],
  ) => {
    moveLogs.setItems((prev) => [
      {
        id: `${prefix}-${Date.now()}-${randomSuffix()}`,
        date: new Date().toISOString(),
        itemsCount: movedItems?.length ?? 1,
        targetName,
        user: userName,
        description,
        ...(movedItems ? { movedItems } : {}),
      },
      ...prev,
    ]);
  };

  /** Ubah status arsip menjadi statis/musnah + catat berita acara. */
  const dispose = (
    type: DispositionType,
    items: ArchiveFile[],
    formData: DispositionData,
    log: Pick<ArchiveDispositionLog, "id" | "statusLabel">,
  ) => {
    const targetStatus = type === "destroy" ? "destroyed" : "static";
    const tag = type === "destroy" ? "Musnah" : "Statis";
    const executedAt = new Date().toISOString();
    saveFiles(
      items.map((r) => ({
        ...r,
        status: targetStatus,
        tags: withDispositionTag(r.tags, tag),
        dispositionData: { ...formData, executedAt, type },
      })),
    );
    dispositions.setItems((prev) => [
      ...prev,
      { ...log, type, executedAt, formData, items: items.map(toItemRef), user: userName },
    ]);
  };

  return {
    saveArchive: (file: ArchiveFile | ArchiveResource) => saveFiles([file]),

    /** Pulihkan arsip statis/musnah ke status dinamis (khusus super admin). */
    restore(file: ArchiveFile) {
      saveFiles([
        {
          ...file,
          status: "active",
          isAutoDispose: false,
          tags: (file.tags ?? []).filter((t) => t.toLowerCase() !== "musnah" && t.toLowerCase() !== "statis"),
          dispositionData: null,
        },
      ]);
    },

    /** Penyusutan dari tab Fisik/Digital (pilih banyak / tindak lanjut satuan). */
    executeDisposition(type: DispositionType, items: ArchiveFile[], formData: DispositionData) {
      dispose(type, items, formData, {
        id: `BAP-${Date.now()}`,
        statusLabel: type === "destroy" ? "Musnah" : "Statis",
      });
    },

    /** Berita acara penyusutan manual dari tab Transaksi. */
    executeManualDisposition(type: DispositionType, items: ArchiveFile[], formData: DispositionData) {
      dispose(type, items, formData, {
        id: `BAP-${type === "destroy" ? "MSN" : "SRH"}-${Date.now()}`,
        statusLabel: type === "destroy" ? "DIMUSNAHKAN" : "DISERAHKAN KE ANRI",
      });
    },

    /**
     * Auto-dispose arsip digital yang masa inaktifnya lewat (idempoten: arsip yang
     * sudah statis/musnah dilewati). Mengembalikan jumlah arsip yang dieksekusi.
     */
    runAutoDispose(today: Date) {
      const base = new Date(today);
      base.setHours(0, 0, 0, 0);
      const due = files.filter((r) => {
        if (r.archivalStatus !== "digital" || !r.isAutoDispose) return false;
        if (r.status === "destroyed" || r.status === "static" || !r.retentionInactiveDate) return false;
        return base > new Date(`${r.retentionInactiveDate}T00:00:00`);
      });
      if (due.length === 0) return 0;
      const now = new Date().toISOString();
      const updates: ArchiveFile[] = [];
      const logs: ArchiveDispositionLog[] = [];
      for (const r of due) {
        const perm = isPermanent(jra.items.find((j) => j.id === r.jraId));
        const type: DispositionType = perm ? "transfer" : "destroy";
        const statusLabel = perm ? "Statis" : "Musnah";
        const dispositionData: DispositionData = {
          legalNumber: `AUTO-SYS-${new Date().getFullYear()}`,
          date: now.slice(0, 10),
          description: "Eksekusi pemusnahan/penyerahan otomatis oleh sistem (Auto-Dispose) untuk arsip digital.",
          userNote: "Eksekusi Otomatisasi via Sistem Terintegrasi",
          executedAt: now,
          type,
        };
        updates.push({
          ...r,
          status: perm ? "static" : "destroyed",
          tags: withDispositionTag(r.tags, statusLabel),
          dispositionData,
        });
        logs.push({
          id: `BAP-AUTO-${Date.now()}-${r.id}`,
          type,
          statusLabel,
          executedAt: now,
          formData: dispositionData,
          items: [toItemRef(r)],
        });
      }
      saveFiles(updates);
      dispositions.setItems((prev) => [...prev, ...logs]);
      return due.length;
    },

    // ----- Penataan & pemindahan -----

    /**
     * Pindahkan arsip/wadah ke `target` (null = root). Mode "arrangement" mencatat log
     * terpisah untuk arsip & wadah (satuan/massal); mode "scanner" satu log massal.
     */
    moveItems(
      items: (ArchiveFile | PhysicalReference)[],
      target: PhysicalReference | null,
      mode: "arrangement" | "scanner",
    ) {
      const targetId = target?.id ?? "";
      const fileItems = items.filter((i): i is ArchiveFile => i.type === "file" && i.id !== targetId);
      const refItems = items.filter((i): i is PhysicalReference => i.type !== "file" && i.id !== targetId);
      const locs = locationForTarget(target, physRefs.items);

      const movedFiles = fileItems.filter((f) => {
        const current = files.find((x) => x.id === f.id) ?? f;
        return (
          current.physFolderId !== locs.physFolderId ||
          current.physBoxId !== locs.physBoxId ||
          current.physRackId !== locs.physRackId ||
          current.physLocationId !== locs.physLocationId
        );
      });
      const movedRefs = refItems.filter((r) => (r.parentId || "") !== targetId);

      if (movedFiles.length > 0) {
        saveFiles(movedFiles.map((f) => ({ ...(files.find((x) => x.id === f.id) ?? f), ...locs })));
      }
      if (movedRefs.length > 0) {
        const ids = new Set(movedRefs.map((r) => r.id));
        physRefs.setItems((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, parentId: targetId } : r)));
      }

      const fileSummary = (f: ArchiveFile): MovedItem => ({
        id: f.id,
        name: f.title || f.name || f.archiveRegId || "Arsip Tanpa Judul",
        code: f.archiveRegId || "NO-ID",
        type: "file",
      });
      const refSummary = (r: PhysicalReference): MovedItem => ({
        id: r.id,
        name: r.name || r.code || "Tanpa Nama",
        code: r.code || "NO-ID",
        type: (r.type || "wadah").toUpperCase(),
      });

      if (mode === "scanner") {
        const all = [...fileItems, ...refItems];
        if (all.length === 0) return;
        addMoveLog("MV-BLK", `MASSAL | Pindah massal via Scanner (${all.length} item)`, target?.name ?? "ROOT", [
          ...fileItems.map(fileSummary),
          ...refItems.map((r) => ({ ...refSummary(r), type: r.type })),
        ]);
        return;
      }

      const targetName = target?.name ?? "ROOT";
      if (movedFiles.length === 1) {
        addMoveLog("MV-LOG", `ARSIP | Pindah lokasi: ${fileSummary(movedFiles[0]).name}`, targetName);
      } else if (movedFiles.length > 1) {
        addMoveLog(
          "MV-BLK",
          `MASSAL | Pindah massal (${movedFiles.length} Arsip)`,
          targetName,
          movedFiles.map(fileSummary),
        );
      }
      if (movedRefs.length === 1) {
        const s = refSummary(movedRefs[0]);
        addMoveLog("MV-CTR", `WADAH | Memindahkan [${s.type}] ${s.name}`, targetName);
      } else if (movedRefs.length > 1) {
        addMoveLog(
          "MV-BLK",
          `MASSAL | Pindah massal (${movedRefs.length} Wadah)`,
          targetName,
          movedRefs.map(refSummary),
        );
      }
    },

    saveContainer(data: Omit<PhysicalReference, "id"> & { id?: string }) {
      if (data.id) {
        const id = data.id;
        physRefs.setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...data, id } : r)));
      } else {
        physRefs.setItems((prev) => [...prev, { ...data, id: generatePhysId() }]);
      }
    },

    /** Hapus wadah beserta seluruh sub-wadahnya (pemanggil memastikan wadah kosong). */
    deleteContainers(ids: string[]) {
      const all = new Set(ids.flatMap((id) => [id, ...descendantIds(physRefs.items, id)]));
      physRefs.setItems((prev) => prev.filter((r) => !all.has(r.id)));
    },

    /** Lepas arsip dari lokasi fisiknya (kembali ke root). */
    clearFileLocations(items: ArchiveFile[]) {
      saveFiles(items.map((f) => ({ ...f, ...EMPTY_LOCATION })));
    },

    /** Tempel salinan wadah: kode baru berurutan per tipe, nama + " (Copy)". */
    pasteCopies(items: PhysicalReference[], parentId: string) {
      const counters = new Map<string, number>();
      const stamp = Date.now().toString(36);
      const copies = items.map((item, index) => {
        const next = (counters.get(item.type) ?? maxCodeNumber(physRefs.items, item.type)) + 1;
        counters.set(item.type, next);
        return {
          ...item,
          id: `phys-${stamp}-${index}`,
          parentId,
          code: formatPhysCode(item.type, next),
          name: `${item.name} (Copy)`,
        };
      });
      if (copies.length > 0) physRefs.setItems((prev) => [...prev, ...copies]);
    },

    // ----- Peminjaman -----

    createBorrowing(data: Omit<ArchiveBorrowing, "id" | "status" | "pic">) {
      borrowings.setItems((prev) => [
        { ...data, id: `BAP-PINJAM-${Date.now()}`, status: "active", pic: userName },
        ...prev,
      ]);
    },
    returnBorrowing(id: string) {
      borrowings.setItems((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "returned", returnedAt: new Date().toISOString() } : b)),
      );
    },
    cancelBorrowing(id: string) {
      borrowings.setItems((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "cancelled", cancelledAt: new Date().toISOString() } : b)),
      );
    },
  };
}
