import {
  Archive,
  BookOpen,
  Bot,
  Database,
  FilePen,
  FileText,
  Globe,
  PencilLine,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DateRangeFilter } from "@/components/common/date-range-filter";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { type OptionGroup, SearchableSelect } from "@/components/common/searchable-select";
import { TagInput } from "@/components/common/tag-input";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAiNotes, useFreeNotes, useLists, useResources } from "@/data/collections";
import {
  NewOfficeDocumentPicker,
  OFFICE_ATTACHMENT_LABEL,
  OFFICE_ATTACHMENT_TYPE,
  useOfficeEnabled,
} from "@/features/tools/onlyoffice/new-office-document-button";
import { openOfficeEditor } from "@/features/tools/onlyoffice/office-editor-host";
import { isOfficeEditable } from "@/features/tools/onlyoffice/office-formats";
import { useOfficeDiscardConfirm } from "@/features/tools/onlyoffice/use-office-discard-confirm";
import type { UploadedAsset } from "@/types/api";
import { ResourceAiDialog } from "@/features/resources/resource-ai-dialog";
import { useAttachmentCleanup } from "@/features/resources/use-attachment-cleanup";
import { noteAttachmentPath, openAttachment } from "@/features/resources/resource-utils";
import { readAiSummaryPreference, writeAiSummaryPreference } from "@/features/resources/ai-summary-preference";
import {
  addFreeTag,
  collectFreeTags,
  isContextTag,
  MAX_TAG_LENGTH,
  resourceTags,
  splitTags,
} from "@/features/resources/resource-tags";
import {
  fileControlStatus,
  isFiledArchive,
  isInFileControl,
  readFileControlPreference,
  writeFileControlPreference,
} from "@/features/resources/file-control-intake";
import { SummaryStatusBadge } from "@/features/resources/summary-status-badge";
import { useFileSummarizer } from "@/features/resources/use-file-summarizer";
import { usePermissions } from "@/hooks/use-permissions";
import { useSearchParam } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { DEFAULT_DATE_FILTER, matchesDateFilter } from "@/lib/date-filter";
import { trackPendingUpload, untrackPendingUpload } from "@/lib/pending-uploads";
import { formatNumericDate } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import type { Resource } from "@/types/entities";
import { AccessScope } from "@/components/common/access-scope";
import { CommentsButton } from "@/features/sharing/comments-panel";
import { ShareButton } from "@/features/sharing/share-dialog";
import { SharedBadge } from "@/features/sharing/shared-badge";
import { itemAccess } from "@/lib/sharing";
import { PARA_INFO, replacedUploadId, resourceFileAttachment } from "../lib/para";
import { DiscardScope, useDiscardOnClose, useDiscardScope } from "../use-attachment-edits";
import { useParaActions } from "../use-para-actions";
import { ParaInfo } from "./para-info";
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import { useOfficeLinkBadges } from "@/data/use-office";
import { DocumentLinkBadge } from "@/features/tools/onlyoffice/document-links";

/** Waktu sekarang (helper modul agar tidak dianggap pemanggilan tidak murni saat render) */
const nowIso = () => new Date().toISOString();

export function ResourcesTab() {
  const today = useToday();
  const { items: resources, setItems: setResources } = useResources();
  const { canEdit } = usePermissions();
  const actions = useParaActions();
  const navigate = useNavigate();
  // Resource catatan (tanpa berkas/link) dibuka di Notes Space; berkas di modal pratinjau, link di tab baru
  const openResource = (res: Resource) => {
    const notePath = !res.uploadId && !res.url ? noteAttachmentPath(res.noteId) : null;
    if (notePath) void navigate(notePath);
    else void openAttachment(res);
  };
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [editing, setEditing] = useState<Resource | "new" | null>(null);
  const [aiTarget, setAiTarget] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const cleanup = useAttachmentCleanup();
  // Berkas milik resource yang dihapus: ikut dihapus dari storage bila tidak dipakai di tempat lain
  const deletingFile = deleting ? resourceFileAttachment(deleting) : null;
  const deletingFileShared =
    !!deletingFile?.uploadId && cleanup.referenced([], [deleting!.id]).has(deletingFile.uploadId);
  const [archiving, setArchiving] = useState<Resource | null>(null);
  // Deep link ?resource=<id> menyorot baris resource
  const [highlightId] = useSearchParam("resource");

  const filtered = resources
    // Cari di nama resource atau tag (mis. "SOP", "Regulasi")
    .filter((r) => {
      const q = search.trim().toLowerCase();
      return !q || [r.title ?? "", ...resourceTags(r)].some((v) => v.toLowerCase().includes(q));
    })
    .filter((r) => matchesDateFilter(r.date, dateFilter, today))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const pageItems = paginate(filtered, page, pageSize);
  // Penanda konsep ↔ dokumen final untuk berkas di halaman ini
  const linkBadges = useOfficeLinkBadges(pageItems.map((res) => res.uploadId));

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
            {pageItems.map((res) => (
              <TableRow key={res.id} className={cn(highlightId === res.id && "bg-module-soft")}>
                <TableCell className="font-mono text-xs">{res.number || "-"}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => openResource(res)}
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
                  <SharedBadge item={res} recordType="para_resource" className="mt-1" />
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">{res.content || "-"}</TableCell>
                <TableCell className="text-xs">{res.date ? formatNumericDate(res.date) : "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="uppercase">
                      {res.type}
                    </Badge>
                    {res.uploadId && <DocumentLinkBadge link={linkBadges?.[res.uploadId]} />}
                    {isInFileControl(res) && (
                      <Badge className="bg-mod-files/15 text-mod-files" title="Dikelola di File Control">
                        <Archive /> File Control
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {resourceTags(res).map((tag) =>
                      isContextTag(tag) ? (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-muted-foreground"
                          title="Tag otomatis (asal)"
                        >
                          {tag}
                        </Badge>
                      ) : (
                        <Badge key={tag} className="bg-module-soft text-module" title="Tag">
                          {tag}
                        </Badge>
                      ),
                    )}
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
                    <CommentsButton recordType="para_resource" item={res} title={res.title} />
                    {canEdit && itemAccess(res).canEdit && (
                      <Button variant="ghost" size="icon-sm" title="Ubah" onClick={() => setEditing(res)}>
                        <PencilLine />
                      </Button>
                    )}
                    {/* Bagikan, arsipkan, hapus hanya oleh pemilik */}
                    {canEdit && !res.share && (
                      <>
                        <ShareButton item={res} recordType="para_resource" title={res.title} iconOnly />
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
        description={
          !deletingFile
            ? "Anda yakin ingin menghapus item ini secara permanen dari database?"
            : deletingFileShared
              ? "Resource ini akan dihapus permanen. Berkasnya tetap disimpan karena masih dipakai di tempat lain (lampiran item lain / arsip)."
              : "Resource ini beserta berkasnya di storage akan dihapus permanen."
        }
        itemName={deleting?.title}
        confirmLabel="Konfirmasi Hapus"
        onConfirm={() => {
          if (deleting) {
            setResources((prev) => prev.filter((r) => r.id !== deleting.id));
            if (deletingFile) {
              cleanup.release([deletingFile], [], {
                contextTag: "Global Resource",
                exclude: [],
                excludeResourceIds: [deleting.id],
              });
            }
          }
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
  const session = useOpenSession(resourceProp !== null);
  const { register, discardAll } = useDiscardScope();
  // Penjaga dari form: false = jangan tutup (user memilih kembali di konfirmasi buang dokumen ONLYOFFICE)
  const closeGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  const close = async () => {
    if (closeGuardRef.current && !(await closeGuardRef.current())) return;
    discardAll(); // Batal / X / Esc: buang berkas yang diunggah tetapi tidak jadi disimpan
    onOpenChange(false);
  };
  return (
    <Dialog open={resourceProp !== null} onOpenChange={(open) => (open ? onOpenChange(true) : void close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resource === "new" ? "Tambah Resource" : "Edit Resource"}</DialogTitle>
        </DialogHeader>
        {resource !== null && (
          <AccessScope item={resource === "new" ? null : resource}>
            <DiscardScope register={register}>
              <ResourceForm
                key={session}
                resource={resource === "new" ? null : resource}
                onCancel={() => void close()}
                onDone={() => onOpenChange(false)}
                closeGuardRef={closeGuardRef}
              />
            </DiscardScope>
          </AccessScope>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResourceForm({
  resource,
  onCancel,
  onDone,
  closeGuardRef,
}: {
  resource: Resource | null;
  onCancel: () => void;
  onDone: () => void;
  /** Diisi form: dipanggil dialog sebelum ditutup (Batal / X / Esc) */
  closeGuardRef?: RefObject<(() => Promise<boolean>) | null>;
}) {
  const { items: allResources, setItems: setResources } = useResources();
  const cleanup = useAttachmentCleanup();
  // Berkas yang diunggah di sesi form ini (dibuang bila tidak disimpan / diganti lagi sebelum disimpan)
  const sessionUploads = useRef(new Set<string>());
  const savedRef = useRef(false);
  useDiscardOnClose(() => {
    if (savedRef.current || sessionUploads.current.size === 0) return;
    const ids = [...sessionUploads.current];
    ids.forEach(untrackPendingUpload);
    cleanup.discardUploads(ids);
    sessionUploads.current.clear();
  });
  const { items: freeNotes } = useFreeNotes();
  const { items: aiNotes } = useAiNotes();
  const { items: lists } = useLists();
  const summarizer = useFileSummarizer();
  // "Ringkas dengan AI" opsional (default mati, diingat per browser); hasil lama diabaikan bila berkas diganti
  const [aiSummary, setAiSummary] = useState(readAiSummaryPreference);
  // Dipakai callback editor ONLYOFFICE (ditutup setelah state berubah)
  const aiSummaryRef = useRef(aiSummary);
  useEffect(() => {
    aiSummaryRef.current = aiSummary;
  }, [aiSummary]);
  // Tipe "Buat Dokumen (ONLYOFFICE)" = berkas (tipe `file`) yang dibuat dari templat, bukan diunggah
  const [fileSource, setFileSource] = useState<"upload" | "office">("upload");
  const officeEnabled = useOfficeEnabled();
  // "Masukkan ke File Control": resource baru mengikuti preferensi terakhir, resource lama mengikuti statusnya.
  // Arsip yang sudah diberkaskan (fisik/digital) dikelola File Control → centang terkunci.
  const [toFileControl, setToFileControl] = useState(() =>
    resource ? isInFileControl(resource) : readFileControlPreference(),
  );
  const filed = isFiledArchive(resource?.archivalStatus);
  const toggleFileControl = (enabled: boolean) => {
    setToFileControl(enabled);
    if (!resource) writeFileControlPreference(enabled);
  };
  const lastFileRef = useRef<File | null>(null);
  const summaryRunRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const { uploadOwnerId } = usePermissions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Resource>(
    () => resource ?? { id: "", title: "", number: "", type: "link", content: "", date: "", url: "", noteId: "" },
  );
  const patch = (values: Partial<Resource>) => setForm((prev) => ({ ...prev, ...values }));
  // Tag konteks (asal resource) dikunci; user hanya mengelola tag bebas. Resource baru dari tab ini bertag "Global Resource".
  const initialTags = splitTags(resource ? resourceTags(resource) : []);
  const contextTags = initialTags.context.length ? initialTags.context : ["Global Resource"];
  const [freeTags, setFreeTags] = useState(initialTags.free);
  const tagSuggestions = collectFreeTags(allResources);

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

  /** Berkas baru (upload atau dokumen ONLYOFFICE baru) di sesi form ini — dibuang bila diganti / form dibatalkan. */
  const acceptAsset = (asset: UploadedAsset, title: string) => {
    // Upload sebelumnya di sesi ini (belum pernah tersimpan) langsung dibuang saat diganti
    if (form.uploadId && sessionUploads.current.delete(form.uploadId)) {
      untrackPendingUpload(form.uploadId);
      cleanup.discardUploads([form.uploadId]);
    }
    sessionUploads.current.add(asset.id);
    trackPendingUpload(asset.id); // tetap dibersihkan bila tab di-reload/ditutup sebelum disimpan
    patch({ uploadId: asset.id, mimeType: asset.mimeType, url: undefined, title, aiSummary: undefined });
  };
  const officeSource = form.type === "file" && fileSource === "office";
  // Konfirmasi sebelum dokumen ONLYOFFICE yang dibuat di form ini dibuang (batal / tutup / ganti tipe / hapus)
  const officeDiscard = useOfficeDiscardConfirm();
  // Tipe "Buat Dokumen" hanya untuk resource baru → dokumennya pasti dibuat di sesi form ini
  const sessionOfficeDoc = officeSource && !!form.uploadId;
  useEffect(() => {
    if (!closeGuardRef) return;
    closeGuardRef.current = async () =>
      savedRef.current || !sessionOfficeDoc || !form.uploadId || officeDiscard.confirm(form.uploadId);
    return () => {
      closeGuardRef.current = null;
    };
  });

  /** Buang berkas sesi ini dari form (dan storage); ringkasan AI yang sedang berjalan diabaikan. */
  const dropSessionUpload = () => {
    if (!form.uploadId || !sessionUploads.current.delete(form.uploadId)) return;
    untrackPendingUpload(form.uploadId);
    cleanup.discardUploads([form.uploadId]);
    summaryRunRef.current++;
    summarizer.setStatus("idle");
    lastFileRef.current = null;
    patch({ uploadId: undefined, mimeType: undefined, aiSummary: undefined });
  };

  /** Tombol "Hapus dokumen": selalu dikonfirmasi; setelahnya jenis dokumen lain bisa dipilih. */
  const deleteOfficeDoc = async () => {
    if (!form.uploadId || !(await officeDiscard.confirm(form.uploadId, { explicit: true }))) return;
    dropSessionUpload();
  };

  /** Buka berkas di ONLYOFFICE; setelah ditutup (tersimpan) ringkas ulang isinya bila "Ringkas dengan AI" dicentang. */
  const editInOffice = (uploadId: string, name: string) =>
    openOfficeEditor({
      uploadId,
      name,
      onClosed: () => {
        if (aiSummaryRef.current) void runSummaryUpload(uploadId);
      },
    });

  /** Ringkas berkas yang sudah di server (dokumen ONLYOFFICE) dari teks ekstraksi backend. */
  const runSummaryUpload = async (uploadId: string) => {
    const run = ++summaryRunRef.current;
    const summary = await summarizer.summarizeUpload(uploadId);
    if (summary && run === summaryRunRef.current) patch({ aiSummary: summary });
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadsApi.upload(file, "resource", uploadOwnerId);
      acceptAsset(asset, form.title || asset.originalName);
      lastFileRef.current = file;
    } catch (error) {
      toast.error("Upload file gagal", { description: errorMessage(error) });
      setUploading(false);
      return;
    }
    setUploading(false);
    if (aiSummary) void runSummary(file);
    else summaryRunRef.current++;
  };

  const runSummary = async (file: File) => {
    const run = ++summaryRunRef.current;
    const summary = await summarizer.summarize(file);
    if (summary && run === summaryRunRef.current) patch({ aiSummary: summary });
  };

  const toggleAiSummary = (enabled: boolean) => {
    setAiSummary(enabled);
    writeAiSummaryPreference(enabled);
    if (!enabled) {
      summaryRunRef.current++;
      summarizer.setStatus("idle");
    } else if (!form.aiSummary && summarizer.status !== "processing") {
      if (lastFileRef.current) void runSummary(lastFileRef.current);
      else if (officeSource && form.uploadId) void runSummaryUpload(form.uploadId);
    }
  };

  const save = () => {
    if (!form.title.trim()) {
      toast.error("Nama resource wajib diisi.");
      return;
    }
    if (officeSource && !form.uploadId) {
      toast.error("Pilih jenis dokumen yang dibuat terlebih dahulu.");
      return;
    }
    const data: Resource = {
      ...form,
      tags: [...contextTags, ...freeTags],
      title: form.title.trim(),
      date: form.date || nowIso().slice(0, 10),
      // Resource bukan berkas tidak menyimpan rujukan berkas
      ...(form.type === "file" ? {} : { uploadId: undefined, mimeType: undefined }),
      archivalStatus: fileControlStatus(resource?.archivalStatus, form.type === "file" && toFileControl),
    };
    if (resource) {
      setResources((prev) => prev.map((r) => (r.id === resource.id ? { ...r, ...data, id: resource.id } : r)));
    } else {
      setResources((prev) => [...prev, { ...data, id: generateId("res"), createdAt: nowIso() }]);
    }
    savedRef.current = true;
    sessionUploads.current.forEach(untrackPendingUpload); // kini tersimpan di data
    if (summarizer.status === "processing") {
      summaryRunRef.current++;
      toast.info("Ringkasan AI dilewati", { description: "Buat nanti lewat tombol AI pada resource." });
    }
    // Berkas lama yang diganti / tidak dipakai lagi dihapus dari storage (kecuali masih dipakai di tempat lain)
    const oldUploadId = replacedUploadId(resource, data);
    if (resource && oldUploadId) {
      const old = resourceFileAttachment({ ...resource, uploadId: oldUploadId });
      if (old)
        cleanup.release([old], [], { contextTag: "Global Resource", exclude: [], excludeResourceIds: [resource.id] });
    }
    onDone();
  };

  return (
    <FieldGroup className="gap-4">
      {officeDiscard.dialog}
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
          <Select
            value={officeSource ? OFFICE_ATTACHMENT_TYPE : form.type}
            onValueChange={async (v) => {
              const office = v === OFFICE_ATTACHMENT_TYPE;
              // Berkas sesi ini dari sumber lain (upload ↔ dokumen baru) tidak dibawa; dokumen berisi dikonfirmasi dulu
              if (form.uploadId && office !== officeSource && sessionUploads.current.has(form.uploadId)) {
                if (sessionOfficeDoc && !(await officeDiscard.confirm(form.uploadId))) return;
                dropSessionUpload();
              }
              setFileSource(office ? "office" : "upload");
              patch({ type: office ? "file" : v });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="link">Web Link</SelectItem>
              <SelectItem value="file">File</SelectItem>
              {/* Dokumen baru hanya untuk resource baru (resource lama sudah punya berkas) */}
              {officeEnabled && !resource && (
                <SelectItem value={OFFICE_ATTACHMENT_TYPE}>{OFFICE_ATTACHMENT_LABEL}</SelectItem>
              )}
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
          <FieldLabel>{officeSource ? "Jenis dokumen baru" : "Upload File"}</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            {!officeSource ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Spinner /> : <Upload />} {form.uploadId ? "Ganti File" : "Pilih File"}
              </Button>
            ) : (
              !form.uploadId && (
                <NewOfficeDocumentPicker
                  title={form.title}
                  context="resource"
                  ownerId={uploadOwnerId}
                  onCreated={(asset) => {
                    lastFileRef.current = null;
                    const title = form.title.trim() || asset.originalName.replace(/\.[a-z0-9]+$/i, "");
                    acceptAsset(asset, title);
                    editInOffice(asset.id, title);
                  }}
                />
              )
            )}
            <span className="flex items-center gap-2">
              <Checkbox
                id="res-ai-summary"
                checked={aiSummary}
                onCheckedChange={(checked) => toggleAiSummary(checked === true)}
              />
              <Label htmlFor="res-ai-summary" className="text-xs font-normal text-muted-foreground">
                Ringkas dengan AI
              </Label>
              {aiSummary && <SummaryStatusBadge status={summarizer.status} />}
            </span>
            <span className="flex items-center gap-2">
              <Checkbox
                id="res-file-control"
                checked={toFileControl || filed}
                disabled={filed}
                onCheckedChange={(checked) => toggleFileControl(checked === true)}
              />
              <Label htmlFor="res-file-control" className="text-xs font-normal text-muted-foreground">
                <Archive className="size-3.5" /> Masukkan ke File Control
                {filed && " (sudah diberkaskan)"}
              </Label>
            </span>
            {form.uploadId && (
              <span className="truncate text-xs text-muted-foreground">
                {officeSource ? "Dokumen dibuat" : "File saat ini"}: {form.title}
              </span>
            )}
            {form.uploadId && officeEnabled && isOfficeEditable(form.title, form.mimeType) && (
              <Button type="button" variant="ghost" size="xs" onClick={() => editInOffice(form.uploadId!, form.title)}>
                <FilePen /> Edit di ONLYOFFICE
              </Button>
            )}
            {sessionOfficeDoc && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-destructive"
                onClick={() => void deleteOfficeDoc()}
              >
                <Trash2 /> Hapus dokumen
              </Button>
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
        <FieldLabel htmlFor="res-tags">Tag</FieldLabel>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Otomatis:
          {contextTags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-muted-foreground">
              {tag}
            </Badge>
          ))}
        </div>
        <TagInput
          id="res-tags"
          value={freeTags}
          suggestions={tagSuggestions}
          maxLength={MAX_TAG_LENGTH}
          placeholder="Tambah tag, mis. Regulasi, SOP..."
          onAdd={(input) => setFreeTags((prev) => addFreeTag(prev, input, tagSuggestions))}
          onRemove={(tag) => setFreeTags((prev) => prev.filter((t) => t !== tag))}
        />
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
        <Button variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button onClick={save} disabled={uploading}>
          Simpan
        </Button>
      </DialogFooter>
    </FieldGroup>
  );
}
