import { PencilLine, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePhysRefs } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import type { PhysicalReference, PhysRefType } from "@/types/entities";
import { containerHasFiles, PHYS_TYPE_LABEL } from "../../lib/archive";
import { useArchiveFiles, useFileControlActions } from "../../use-file-control";
import { CONTAINER_STYLE, ContainerIcon } from "../archive-ui";
import { ContainerLabelDialog } from "../label-dialogs";
import { type PhysRefFormTarget, PhysRefFormDialog } from "../phys-ref-form-dialog";

const TYPES: PhysRefType[] = ["location", "rack", "box", "folder"];

/** Referensi lokasi fisik per jenis wadah. */
export function PhysicalReferenceManager() {
  const { items: refs } = usePhysRefs();
  const { files } = useArchiveFiles();
  const actions = useFileControlActions();
  const { canEdit } = usePermissions();
  const [type, setType] = useState<PhysRefType>("location");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(100);
  const [form, setForm] = useState<PhysRefFormTarget | null>(null);
  const [deleting, setDeleting] = useState<PhysicalReference | null>(null);
  const [printing, setPrinting] = useState<PhysicalReference | null>(null);

  const q = search.toLowerCase();
  const filtered = refs
    .filter((r) => r.type === type)
    .filter((r) => (r.name ?? "").toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q))
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  const label = PHYS_TYPE_LABEL[type];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h3 className="text-lg font-bold">Referensi Lokasi Fisik</h3>
          <p className="text-sm text-muted-foreground">Manajemen struktur penyimpanan arsip fisik.</p>
        </div>
        {canEdit && (
          <Button onClick={() => setForm({ mode: "new", type })}>
            <Plus /> Tambah {label}
          </Button>
        )}
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        value={type}
        onValueChange={(v) => {
          if (!v) return;
          setType(v as PhysRefType);
          setPage(1);
        }}
        className="w-full overflow-x-auto"
      >
        {TYPES.map((t) => {
          const Icon = CONTAINER_STYLE[t].icon;
          return (
            <ToggleGroupItem
              key={t}
              value={t}
              className="flex-1 gap-2 data-[state=on]:bg-module-soft data-[state=on]:text-module"
            >
              <Icon /> {PHYS_TYPE_LABEL[t]}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {refs.filter((r) => r.type === t).length}
              </Badge>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <SearchInput
        className="md:w-full"
        placeholder={`Cari kode atau nama ${label.toLowerCase()}...`}
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />

      {filtered.length === 0 ? (
        <Empty className="border-2 border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ContainerIcon type={type} className="size-8 bg-transparent" />
            </EmptyMedia>
            <EmptyTitle>Belum ada data referensi {label}.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {paginate(filtered, page, pageSize).map((item) => (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border bg-card p-5 transition-all hover:border-module/40 hover:shadow-lg"
              >
                <div>
                  <div className="mb-3 flex items-start justify-between">
                    <ContainerIcon type={type} />
                    <div className="flex items-center gap-1">
                      <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] font-bold">
                        {item.code || "NO-CODE"}
                      </span>
                      <Button variant="ghost" size="icon-xs" aria-label="Cetak Label" onClick={() => setPrinting(item)}>
                        <Printer />
                      </Button>
                    </div>
                  </div>
                  <h4 className="mb-1 font-bold">{item.name}</h4>
                  <p className="line-clamp-2 min-h-[2.5em] text-xs text-muted-foreground">
                    {item.description || "Tidak ada keterangan."}
                  </p>
                </div>
                {canEdit && (
                  <div className="mt-2 flex gap-2 border-t pt-4 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setForm({ mode: "edit", item })}
                    >
                      <PencilLine /> Edit
                    </Button>
                    <Button variant="destructive" size="icon-sm" aria-label="Hapus" onClick={() => setDeleting(item)}>
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <PaginationControl
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            sizes={[25, 50, 100]}
          />
        </>
      )}

      <PhysRefFormDialog
        target={form}
        onClose={() => setForm(null)}
        onSave={(data) => {
          actions.saveContainer(data);
          setForm(null);
        }}
      />
      <ContainerLabelDialog container={printing} onClose={() => setPrinting(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Referensi?"
        description="Data lokasi ini beserta seluruh sub-wadahnya akan dihapus permanen."
        itemName={deleting ? `${deleting.code} - ${deleting.name}` : undefined}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) {
            if (containerHasFiles(deleting.id, refs, files)) {
              toast.error(
                "Penghapusan ditolak: wadah ini (atau sub-wadahnya) masih berisi arsip. Pindahkan atau hapus arsip terlebih dahulu.",
              );
            } else {
              actions.deleteContainers([deleting.id]);
            }
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
