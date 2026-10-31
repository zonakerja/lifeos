import {
  CheckCircle2,
  FileCheck2,
  FilePlus2,
  FileText,
  Link2,
  Link2Off,
  Loader2,
  MoreHorizontal,
  Pencil,
  ScanSearch,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { previewFile } from "@/components/common/file-preview";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSrikandiLetters, useSrikandiOutgoings } from "@/data/collections";
import { queryKeys } from "@/data/query-keys";
import { useRequests } from "@/data/use-requests";
import { RunDialog } from "@/features/tools/robot/robot-settings";
import { useLatchedWhileOpen } from "@/hooks/use-retained";
import { usePagination } from "@/hooks/use-pagination";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import { errorMessage } from "@/lib/api/client";
import { officeApi, robotApi, uploadsApi } from "@/lib/api/endpoints";
import { formatShortDate, parseLocalYMD } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import type { SrikandiLetter, SrikandiOutgoing } from "@/types/entities";
import { RegisterDialog } from "./register-dialog";
import {
  canLinkAsDraft,
  emptyOutgoing,
  finalLetterCandidates,
  FORM_TYPE_LABELS,
  ownedUploadIds,
  REGISTER_STATUS_LABELS,
  type RegisterStatus,
  registerIssues,
  registerStatus,
} from "./register-logic";

const STATUS_STYLE: Record<RegisterStatus, string> = {
  incomplete: "bg-warning/15 text-warning",
  ready: "bg-info/15 text-info",
  submitted: "bg-module-soft text-module",
  done: "bg-success/15 text-success",
};

type Filter = "all" | "open" | "submitted" | "done";
const FILTERS: Record<Filter, string> = {
  all: "Semua",
  open: "Draf",
  submitted: "Terdaftar",
  done: "Selesai",
};
const inFilter = (status: RegisterStatus, filter: Filter) =>
  filter === "all" ||
  (filter === "open" && (status === "incomplete" || status === "ready")) ||
  (filter === "submitted" && status === "submitted") ||
  (filter === "done" && status === "done");

const nowIso = () => new Date().toISOString();

const matches = (entry: SrikandiOutgoing, q: string) =>
  !q ||
  [entry.subject, entry.number, entry.docType, entry.sourceTitle, entry.file?.name]
    .filter(Boolean)
    .some((v) => v!.toLowerCase().includes(q));

/**
 * SRIKANDI → Register Naskah Keluar: gerbang LifeOS sebelum naskah didaftarkan ke SRIKANDI. Entri berisi isian
 * formulir Registrasi Naskah Keluar + berkas mentah (Approval / berkas LifeOS); setelah naskah ditandatangani, PDF
 * final dari Daftar Naskah Keluar ditautkan ke entrinya. Pendaftaran ke SRIKANDI sementara ditandai manual — robot
 * menyusul setelah formulir SRIKANDI direkam.
 */
export function RegisterBoard() {
  const { items, upsert, remove } = useSrikandiOutgoings();
  const { items: letters } = useSrikandiLetters();
  const { data: requests } = useRequests();
  const [editId, setEditId] = useSearchParam("register");
  const [requestParam] = useSearchParam("request");
  const [docParam] = useSearchParam("doc");
  const setParams = useSetSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<SrikandiOutgoing | null>(null);
  const [registering, setRegistering] = useState<SrikandiOutgoing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const client = useQueryClient();
  const [linking, setLinking] = useState<SrikandiOutgoing | null>(null);
  // ID entri baru dibuat sekali per pembukaan "new" (stabil selama dialog terbuka)
  const [newId, setNewId] = useState(() => generateId("reg"));

  const lettersById = new Map(letters.map((l) => [l.id, l]));
  const q = search.trim().toLowerCase();
  const list = [...items]
    .filter((e) => matches(e, q) && inFilter(registerStatus(e), filter))
    .sort((a, b) => (b.createdAt ?? b.id).localeCompare(a.createdAt ?? a.id));
  const { pageItems, setPage, controlProps } = usePagination(list, 10);

  // Dialog dikendalikan URL: ?register=<id> | new (+ ?request=&doc= = dari dokumen Approval)
  const isNew = editId === "new";
  const editing = isNew ? null : (items.find((e) => e.id === editId) ?? null);
  const request = requestParam ? requests?.find((r) => r.id === requestParam) : undefined;
  const doc = request?.documents.find((d) => d.uploadId === docParam);
  // Objek stabil per (entri baru, dokumen asal) — useLatchedWhileOpen membutuhkan nilai yang tidak berganti tiap render
  const initialNew = useMemo<SrikandiOutgoing | null>(
    () =>
      isNew
        ? {
            ...emptyOutgoing(newId),
            createdAt: nowIso(),
            ...(request && doc
              ? {
                  subject: request.subject || request.title,
                  file: { uploadId: doc.uploadId, name: doc.name },
                  uploadId: doc.uploadId,
                  sourceType: "request" as const,
                  sourceId: request.id,
                  sourceTitle: request.title,
                }
              : {}),
          }
        : null,
    [isNew, newId, request, doc],
  );
  // Tunggu daftar pengajuan dimuat agar isian awal dari Approval tidak terlewat
  const waitingRequest = isNew && !!requestParam && !requests;
  const dialogEntry = useLatchedWhileOpen(!!editId, isNew ? initialNew : editing);

  const closeDialog = () => {
    setParams({ register: null, request: null, doc: null });
    setNewId(generateId("reg"));
  };

  const setStage = (entry: SrikandiOutgoing, status: SrikandiOutgoing["status"]) =>
    upsert({ ...entry, status, submittedAt: status === "submitted" ? nowIso() : entry.submittedAt });

  // Robot mengisi formulir Registrasi SRIKANDI; dryRun = berhenti sebelum Simpan (hasil dilihat di tangkapan layar)
  const runRobot = async (entry: SrikandiOutgoing, dryRun: boolean) => {
    setBusy(entry.id);
    const pending = toast.loading(
      dryRun ? "Robot mengisi formulir SRIKANDI…" : "Robot mendaftarkan naskah ke SRIKANDI…",
    );
    try {
      const r = await robotApi.registerOutgoing(entry.id, dryRun);
      await client.invalidateQueries({ queryKey: queryKeys.records("srikandi_outgoing") });
      if (r.status === "preview") {
        toast.success(`Formulir terisi (${r.filled.length} isian) — tidak disimpan.`, { id: pending });
        setRunId(r.runId);
      } else {
        toast.success(
          r.status === "exists"
            ? "Konsep berhal sama sudah ada di Log Naskah Keluar — tidak dibuat ulang."
            : `Konsep tersimpan di SRIKANDI${r.draft?.number ? ` (${r.draft.number})` : ""}.`,
          {
            id: pending,
            description: "Buka SRIKANDI → Log Naskah Keluar, periksa, lalu Kirim Konsep sendiri.",
            action: { label: "Lihat", onClick: () => setRunId(r.runId) },
          },
        );
      }
    } catch (error) {
      toast.error(errorMessage(error), { id: pending });
    } finally {
      setBusy(null);
    }
  };

  const deleteEntry = async (entry: SrikandiOutgoing) => {
    remove(entry.id);
    const failed: string[] = [];
    for (const id of ownedUploadIds(entry)) {
      await uploadsApi.remove(id).catch(() => failed.push(id));
    }
    if (failed.length) toast.warning(`${failed.length} berkas tidak bisa dihapus (masih dipakai di tempat lain).`);
    toast.success("Entri register dihapus.");
  };

  const unlinkFinal = async (entry: SrikandiOutgoing) => {
    const letter = entry.letterId ? lettersById.get(entry.letterId) : undefined;
    if (entry.draftLinked && letter?.uploadId) {
      await officeApi.setDraft(letter.uploadId, null).catch(() => undefined);
    }
    upsert({ ...entry, letterId: undefined, draftLinked: false, status: "submitted" });
    toast.success("Tautan naskah final dilepas.");
  };

  return (
    <SectionCard
      icon={FilePlus2}
      title="Register Naskah Keluar"
      description="Siapkan naskah sebelum didaftarkan ke SRIKANDI: isian formulir Registrasi Naskah Keluar, file naskah dari Approval atau berkas LifeOS, tujuan, verifikator, dan penandatangan. Setelah ditandatangani, naskah final ditautkan ke entrinya."
      action={
        <Button size="sm" onClick={() => setEditId("new", { replace: false })}>
          <FilePlus2 /> Register baru
        </Button>
      }
      contentClassName="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Cari hal, nomor, jenis, berkas…"
          className="sm:flex-1 md:w-auto"
        />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => {
            if (!v) return;
            setFilter(v as Filter);
            setPage(1);
          }}
        >
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <ToggleGroupItem key={f} value={f}>
              {FILTERS[f]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {list.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilePlus2 />
            </EmptyMedia>
            <EmptyTitle>{items.length ? "Tidak ada yang cocok" : "Belum ada register"}</EmptyTitle>
            <EmptyDescription>
              {items.length
                ? "Ubah pencarian atau filter."
                : "Klik Register baru, atau buka dokumen pengajuan di Approval lalu Daftarkan ke SRIKANDI."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {pageItems.map((entry) => {
            const status = registerStatus(entry);
            const issues = status === "incomplete" ? registerIssues(entry) : [];
            const letter = entry.letterId ? lettersById.get(entry.letterId) : undefined;
            return (
              <li
                key={entry.id}
                className="flex min-w-0 flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setEditId(entry.id, { replace: false })}
                >
                  <p className="text-sm font-semibold">{entry.subject || "(tanpa hal)"}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      FORM_TYPE_LABELS[entry.formType],
                      entry.docType,
                      entry.autoNumber ? "Ambil Nomor" : entry.number,
                      entry.sourceType === "request" ? `Approval · ${entry.sourceTitle ?? ""}` : entry.file?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge className={STATUS_STYLE[status]}>{REGISTER_STATUS_LABELS[status]}</Badge>
                    {!!entry.attachments?.length && (
                      <Badge variant="secondary">{entry.attachments.length} lampiran</Badge>
                    )}
                    {entry.signer && <Badge variant="secondary">TTD: {entry.signer.label.split(" - ")[0]}</Badge>}
                    {entry.submittedAt && status !== "incomplete" && status !== "ready" && (
                      <span className="text-muted-foreground">
                        Didaftarkan {formatShortDate(new Date(entry.submittedAt))}
                      </span>
                    )}
                  </div>
                  {issues.length > 0 && <p className="mt-1 text-xs text-warning">Belum lengkap: {issues.join(", ")}</p>}
                  {letter && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-success">
                      <FileCheck2 className="size-3.5" /> Final: {letter.number || "tanpa nomor"}
                      {letter.date ? ` · ${formatShortDate(parseLocalYMD(letter.date))}` : ""}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {status === "ready" && (
                    <Button size="sm" disabled={!!busy} onClick={() => setRegistering(entry)}>
                      {busy === entry.id ? <Loader2 className="animate-spin" /> : <Send />} Daftarkan ke SRIKANDI
                    </Button>
                  )}
                  {status === "submitted" && (
                    <Button size="sm" variant="outline" onClick={() => setLinking(entry)}>
                      <Link2 /> Tautkan final
                    </Button>
                  )}
                  {letter?.uploadId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        previewFile({
                          uploadId: letter.uploadId!,
                          name: `${letter.number || "naskah"}.pdf`,
                          mimeType: "application/pdf",
                        })
                      }
                    >
                      <FileCheck2 /> PDF final
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="Aksi lain">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditId(entry.id, { replace: false })}>
                        <Pencil /> Ubah
                      </DropdownMenuItem>
                      {entry.file && (
                        <DropdownMenuItem
                          onSelect={() =>
                            previewFile({
                              uploadId: entry.file!.uploadId,
                              name: entry.file!.name,
                              mimeType: entry.file!.mimeType,
                            })
                          }
                        >
                          <FileText /> Lihat file naskah
                        </DropdownMenuItem>
                      )}
                      {status === "ready" && (
                        <DropdownMenuItem disabled={!!busy} onSelect={() => void runRobot(entry, true)}>
                          <ScanSearch /> Periksa di SRIKANDI (tanpa simpan)
                        </DropdownMenuItem>
                      )}
                      {status === "ready" && (
                        <DropdownMenuItem onSelect={() => setStage(entry, "submitted")}>
                          <CheckCircle2 /> Tandai terdaftar (manual)
                        </DropdownMenuItem>
                      )}
                      {status === "submitted" && (
                        <DropdownMenuItem onSelect={() => setStage(entry, "draft")}>
                          <Undo2 /> Kembalikan ke draf
                        </DropdownMenuItem>
                      )}
                      {status === "done" && (
                        <DropdownMenuItem onSelect={() => void unlinkFinal(entry)}>
                          <Link2Off /> Lepas naskah final
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(entry)}>
                        <Trash2 /> Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PaginationControl {...controlProps} />

      <RegisterDialog
        open={!!editId && !waitingRequest && (isNew || !!editing)}
        entry={dialogEntry}
        isNew={isNew}
        onClose={closeDialog}
      />
      <LinkFinalDialog
        entry={linking}
        entries={items}
        letters={letters}
        onClose={() => setLinking(null)}
        onLink={async (entry, letter) => {
          let draftLinked = false;
          if (letter.uploadId && entry.file && canLinkAsDraft(entry)) {
            try {
              await officeApi.setDraft(letter.uploadId, entry.file.uploadId);
              draftLinked = true;
            } catch (error) {
              toast.warning(`Tautan konsep ↔ final berkas tidak dibuat: ${errorMessage(error)}`);
            }
          }
          upsert({ ...entry, letterId: letter.id, draftLinked, status: "done" });
          setLinking(null);
          toast.success("Naskah final ditautkan ke register.");
        }}
      />
      <ConfirmDialog
        open={!!registering}
        onOpenChange={(o) => !o && setRegistering(null)}
        title="Daftarkan ke SRIKANDI?"
        description="Robot mengisi formulir Registrasi Naskah Keluar dan menekan Simpan: konsep masuk Log Naskah Keluar, belum dikirim. Kirim Konsep ke verifikator tetap Anda lakukan sendiri di SRIKANDI. Butuh sesi SRIKANDI aktif (tab Connector)."
        itemName={registering?.subject || "(tanpa hal)"}
        confirmLabel="Daftarkan"
        destructive={false}
        onConfirm={() => {
          if (registering) void runRobot(registering, false);
          setRegistering(null);
        }}
      />
      <RunDialog id={runId} onClose={() => setRunId(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Hapus entri register?"
        description="Berkas yang diunggah lewat register ikut dihapus. Dokumen Approval & berkas LifeOS lain tidak tersentuh, begitu pula naskah di SRIKANDI."
        itemName={deleting?.subject || "(tanpa hal)"}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) void deleteEntry(deleting);
          setDeleting(null);
        }}
      />
    </SectionCard>
  );
}

function LinkFinalDialog(props: {
  entry: SrikandiOutgoing | null;
  entries: SrikandiOutgoing[];
  letters: SrikandiLetter[];
  onClose: () => void;
  onLink: (entry: SrikandiOutgoing, letter: SrikandiLetter) => Promise<void>;
}) {
  const entry = useLatchedWhileOpen(!!props.entry, props.entry);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const taken = new Set(props.entries.filter((e) => e.letterId && e.id !== entry?.id).map((e) => e.letterId!));
  const suggested = entry ? finalLetterCandidates(entry, props.letters, taken) : [];
  const q = search.trim().toLowerCase();
  const others = q
    ? props.letters.filter(
        (l) =>
          !taken.has(l.id) && !suggested.includes(l) && [l.number, l.subject].some((v) => v?.toLowerCase().includes(q)),
      )
    : [];

  const choose = async (letter: SrikandiLetter) => {
    if (!entry) return;
    setBusy(true);
    await props.onLink(entry, letter).finally(() => setBusy(false));
  };

  const row = (l: SrikandiLetter) => (
    <li key={l.id}>
      <button
        type="button"
        disabled={busy}
        className="flex w-full min-w-0 items-start gap-2 rounded-md p-2 text-left hover:bg-muted disabled:opacity-50"
        onClick={() => void choose(l)}
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{l.subject || "(tanpa hal)"}</span>
          <span className="block text-xs text-muted-foreground">
            {l.number || "Belum bernomor"}
            {l.date ? ` · ${formatShortDate(parseLocalYMD(l.date))}` : ""}
            {l.uploadId ? "" : " · PDF belum diambil"}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <Dialog open={!!props.entry} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Tautkan naskah final</DialogTitle>
          <DialogDescription>
            Pilih naskah ber-TTD dari Daftar Naskah Keluar (ambil dulu di tab itu bila belum ada). File naskah DOCX ikut
            ditautkan sebagai konsep dari PDF final.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">{entry?.subject || "(tanpa hal)"}</p>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground">Saran (nomor / hal sama)</p>
          {suggested.length ? (
            <ul className="flex flex-col gap-1">{suggested.map(row)}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">Tidak ada naskah dengan nomor atau hal yang sama.</p>
          )}
          <SearchInput value={search} onChange={setSearch} placeholder="Cari naskah lain (nomor / hal)…" />
          {others.length > 0 && (
            <ul className="flex max-h-[35svh] flex-col gap-1 overflow-y-auto">{others.slice(0, 30).map(row)}</ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
