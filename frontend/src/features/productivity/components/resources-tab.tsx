import { Archive, BookOpen, Bot, Database, FileText, Globe, PencilLine, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DateRangeFilter } from "@/components/common/date-range-filter";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { type OptionGroup, SearchableSelect } from "@/components/common/searchable-select";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAiNotes, useFreeNotes, useLists, useResources } from "@/data/collections";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { openAttachment } from "@/features/resources/resource-utils";
import { SummaryStatusBadge } from "@/features/resources/summary-status-badge";
import { useFileSummarizer } from "@/features/resources/use-file-summarizer";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { DEFAULT_DATE_FILTER, matchesDateFilter } from "@/lib/date-filter";
import { formatNumericDate } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import type { Resource } from "@/types/entities";
import { PARA_INFO } from "../lib/para";
import { useParaActions } from "../use-para-actions";
import { ParaInfo } from "./para-info";
import { useRetained } from "@/hooks/use-retained";

const resourceTags = (r: Resource) => (Array.isArray(r.tags) ? r.tags : r.sourceTag ? [r.sourceTag] : ["Global"]);

export function ResourcesTab() {
  const today = useToday();
  const { items: resources, setItems: setResources } = useResources();
  const { canEdit } = usePermissions();
  const actions = useParaActions();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [editing, setEditing] = useState<Resource | "new" | null>(null);
  const [aiTarget, setAiTarget] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [archiving, setArchiving] = useState<Resource | null>(null);
  // Deep link ?resource=<id> menyorot baris resource
  const [highlightId] = useSearchParam("resource");

  const filtered = resources
    .filter((r) => !search || (r.title ?? "").toLowerCase().includes(search.toLowerCase()))
    .filter((r) => matchesDateFilter(r.date, dateFilter, today))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  return (
    <div className="flex flex-col gap-5">
      <ParaInfo icon={BookOpen} {...PARA_INFO.resources} />
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <h3 className="text-xl font-bold">Resources & Assets</h3>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchInput value={search} onChange={setSearch} />
          <DateRangeFilter
            value={dateFilter}
            onChange={(v) => {
              setDateFilter(v);
              setPage(1);
            }}
            labels={{ custom: "Custom" }}
          />
          {canEdit && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Tambah
            </Button>
          )}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>No Resource</TableHead>
              <TableHead>Nama Resource</TableHead>
              <TableHead>Deskripsi</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground italic">
                  Tidak ada resource ditemukan.
                </TableCell>
              </TableRow>
            )}
            {paginate(filtered, page, pageSize).map((res) => (
              <TableRow key={res.id} className={cn(highlightId === res.id && "bg-module-soft")}>
                <TableCell className="font-mono text-xs">{res.number || "-"}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => void openAttachment(res)}
                    className="flex max-w-72 items-center gap-2 text-left font-semibold text-module hover:underline"
                  >
                    {res.type === "file" ? (
                      <FileText className="size-3.5 shrink-0" />
                    ) : res.type === "link" ? (
                      <Globe className="size-3.5 shrink-0" />
                    ) : (
                      <Database className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{res.title || "Untitled"}</span>
                  </button>
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">{res.content || "-"}</TableCell>
                <TableCell className="text-xs">{res.date ? formatNumericDate(res.date) : "-"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="uppercase">
                    {res.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {resourceTags(res).map((tag, i) => (
                      <Badge key={i} className="bg-module-soft text-module">
                        {typeof tag === "string" ? tag : "Unknown Tag"}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="AI Knowledge Summary"
                      className={cn(res.aiSummary && "bg-module-soft text-module")}
                      onClick={() => setAiTarget(res)}
                    >
                      <Bot />
                    </Button>
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon-sm" title="Ubah" onClick={() => setEditing(res)}>
                          <PencilLine />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Arsipkan"
                          className="hover:text-warning"
                          onClick={() => setArchiving(res)}
                        >
                          <Archive />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Hapus"
                          className="hover:text-destructive"
                          onClick={() => setDeleting(res)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <PaginationControl
        totalItems={filtered.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ResourceFormDialog resource={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <ResourceAiDialog
        resource={aiTarget}
        onOpenChange={(open) => !open && setAiTarget(null)}
        onSave={(id, summary) =>
          setResources((prev) => prev.map((r) => (r.id === id ? { ...r, aiSummary: summary } : r)))
        }
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Resource?"
        description="Anda yakin ingin menghapus item ini secara permanen dari database?"
        itemName={deleting?.title}
        confirmLabel="Konfirmasi Hapus"
        onConfirm={() => {
          if (deleting) setResources((prev) => prev.filter((r) => r.id !== deleting.id));
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Arsipkan Resource?"
        description="Item ini akan dipindahkan ke Arsip. Anda bisa memulihkannya nanti."
        itemName={archiving?.title}
        confirmLabel="Arsipkan"
        destructive={false}
        onConfirm={() => {
          if (archiving) actions.archiveResource(archiving);
          setArchiving(null);
        }}
      />
    </div>
  );
}

function ResourceFormDialog({
  resource: resourceProp,
  onOpenChange,
}: {
  resource: Resource | "new" | null;
  onOpenChange: (open: boolean) => void;
}) {
  const resource = useRetained(resourceProp);
  return (
    <Dialog open={resourceProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resource === "new" ? "Tambah Resource" : "Edit Resource"}</DialogTitle>
        </DialogHeader>
        {resource !== null && (
          <ResourceForm resource={resource === "new" ? null : resource} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResourceForm({ resource, onDone }: { resource: Resource | null; onDone: () => void }) {
  const { setItems: setResources } = useResources();
  const { items: freeNotes } = useFreeNotes();
  const { items: aiNotes } = useAiNotes();
  const { items: lists } = useLists();
  const summarizer = useFileSummarizer();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Resource>(
    () => resource ?? { id: "", title: "", number: "", type: "link", content: "", date: "", url: "", noteId: "" },
  );
  const patch = (values: Partial<Resource>) => setForm((prev) => ({ ...prev, ...values }));

  const noteGroups: OptionGroup[] = [
    { heading: "Free Notes", options: freeNotes.map((n) => ({ label: n.title, value: `free-${n.id}` })) },
    { heading: "AI Notes", options: aiNotes.map((n) => ({ label: n.title, value: `ai-${n.id}` })) },
    { heading: "List Bebas", options: lists.map((l) => ({ label: l.title, value: `list-${l.id}` })) },
  ];

  const selectNote = (value: string) => {
    let title: string | undefined;
    let aiSummary = "";
    if (value.startsWith("free-")) title = freeNotes.find((n) => `free-${n.id}` === value)?.title;
    else if (value.startsWith("ai-")) {
      const note = aiNotes.find((n) => `ai-${n.id}` === value);
      title = note?.title;
      aiSummary = note?.aiSummary ?? "";
    } else if (value.startsWith("list-")) title = lists.find((l) => `list-${l.id}` === value)?.title;
    if (title) patch({ noteId: value, title: form.title || title, content: "Linked Note / List", aiSummary });
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadsApi.upload(file, "resource");
      patch({ uploadId: asset.id, mimeType: asset.mimeType, url: undefined, title: form.title || asset.originalName });
    } catch (error) {
      toast.error("Upload file gagal", { description: errorMessage(error) });
      setUploading(false);
      return;
    }
    setUploading(false);
    const summary = await summarizer.summarize(file);
    if (summary) patch({ aiSummary: summary });
  };

  const save = () => {
    if (!form.title.trim()) {
      toast.error("Nama resource wajib diisi.");
      return;
    }
    const data = { ...form, title: form.title.trim(), date: form.date || new Date().toISOString().slice(0, 10) };
    if (resource) {
      setResources((prev) =>
        prev.map((r) =>
          r.id === resource.id ? { ...r, ...data, tags: r.tags || ["Global Resource"], id: resource.id } : r,
        ),
      );
    } else {
      setResources((prev) => [
        ...prev,
        { ...data, id: generateId("res"), tags: ["Global Resource"], createdAt: new Date().toISOString() },
      ]);
    }
    onDone();
  };

  return (
    <FieldGroup className="gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="res-number">Nomor</FieldLabel>
          <Input
            id="res-number"
            autoFocus
            placeholder="No."
            value={form.number ?? ""}
            onChange={(e) => patch({ number: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel>Tipe</FieldLabel>
          <Select value={form.type} onValueChange={(v) => patch({ type: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="link">Web Link</SelectItem>
              <SelectItem value="file">File</SelectItem>
              <SelectItem value="note">Catatan / List</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="res-title">Nama Resource</FieldLabel>
          <Input
            id="res-title"
            placeholder="Judul dokumen..."
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </Field>
      </div>

      {form.type === "link" && (
        <Field>
          <FieldLabel htmlFor="res-url">URL / Link</FieldLabel>
          <Input
            id="res-url"
            placeholder="https://..."
            value={form.url ?? ""}
            onChange={(e) => patch({ url: e.target.value })}
          />
        </Field>
      )}
      {form.type === "file" && (
        <Field>
          <FieldLabel>Upload File</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Spinner /> : <Upload />} {form.uploadId ? "Ganti File" : "Pilih File"}
            </Button>
            <SummaryStatusBadge status={summarizer.status} />
            {form.uploadId && (
              <span className="truncate text-xs text-muted-foreground">File saat ini: {form.title}</span>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </Field>
      )}
      {form.type === "note" && (
        <Field>
          <FieldLabel>Pilih Catatan / List</FieldLabel>
          <SearchableSelect
            groups={noteGroups}
            value={form.noteId}
            onChange={selectNote}
            placeholder="Cari & pilih catatan/list..."
          />
        </Field>
      )}

      <Field className="md:w-1/2">
        <FieldLabel htmlFor="res-date">Tanggal</FieldLabel>
        <Input id="res-date" type="date" value={form.date ?? ""} onChange={(e) => patch({ date: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="res-content">Deskripsi</FieldLabel>
        <Textarea
          id="res-content"
          rows={3}
          value={form.content ?? ""}
          onChange={(e) => patch({ content: e.target.value })}
        />
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button onClick={save} disabled={uploading || summarizer.status === "processing"}>
          Simpan
        </Button>
      </DialogFooter>
    </FieldGroup>
  );
}
