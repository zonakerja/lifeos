import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useKnowledgeNote } from "@/data/use-knowledge";
import { useKnowledgeActions, useKnowledgeTree } from "@/data/use-knowledge-workspace";
import { useOpenSession } from "@/hooks/use-retained";
import { ApiError, errorMessage } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/endpoints";
import { extractTitle, folderOf, isMirrorNote, noteName, outline } from "./knowledge-logic";
import {
  flushOpenEditors,
  reloadOpenEditors,
  useOpenNote,
  useWorkspaceStore,
  type ComposeDialog,
} from "./workspace-store";

const NEW_NOTE = "__new__";
const ROOT = "__root__";
const HEADING_PREFIX = "heading:";
const AFTER_KEY = "lifeos.noteComposer.after";
type After = "link" | "embed" | "none";

const AFTER_LABEL: Record<After, string> = {
  link: "Tautan ke catatan tujuan",
  embed: "Sematan catatan tujuan",
  none: "Tidak ada (teks hilang dari sini)",
};

function savedAfter(): After {
  try {
    const value = localStorage.getItem(AFTER_KEY);
    return value === "embed" || value === "none" ? value : "link";
  } catch {
    return "link";
  }
}

function rememberAfter(value: After) {
  try {
    localStorage.setItem(AFTER_KEY, value);
  } catch {
    /* preferensi per browser saja: gagal menyimpan tidak mengganggu */
  }
}

/** Note composer (K9, pola Obsidian): gabung catatan & ekstrak pilihan teks ke catatan lain / baru. */
export function ComposeDialogHost() {
  const dialog = useWorkspaceStore((s) => s.dialog);
  const close = useWorkspaceStore((s) => s.close);
  const open = dialog?.kind === "compose";
  const session = useOpenSession(open);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        {dialog?.kind === "compose" &&
          (dialog.mode === "split" ? (
            <SplitForm key={session} source={dialog.source} />
          ) : (
            <ComposeForm key={session} dialog={dialog} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

/** Pecah per judul: pratinjau daftar catatan baru dari server sebelum menulis apa pun. */
function SplitForm({ source }: { source: { id: string; path: string } }) {
  const { data: tree } = useKnowledgeTree();
  const { data: detail } = useKnowledgeNote(source.id);
  const { splitNote } = useKnowledgeActions();
  const close = useWorkspaceStore((s) => s.close);
  const levels = useMemo(() => {
    const counts = new Map<number, number>();
    for (const h of outline(detail?.content ?? "")) counts.set(h.level, (counts.get(h.level) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [detail?.content]);
  const [chosen, setChosen] = useState<number | null>(null);
  // Bawaan: tingkat tertinggi yang punya lebih dari satu judul (# judul dokumen tunggal bukan pemecah yang berguna)
  const level = chosen ?? levels.find(([, count]) => count > 1)?.[0] ?? levels[0]?.[0] ?? null;
  const [folder, setFolder] = useState(folderOf(source.path));
  const [after, setAfter] = useState<After>(savedAfter);
  const [busy, setBusy] = useState(false);

  const preview = useQuery({
    queryKey: ["knowledge", "split-preview", source.id, level, folder],
    enabled: level !== null,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      await flushOpenEditors();
      const { hash } = await knowledgeApi.source(source.id);
      return knowledgeApi.splitPreview(source.id, { level: level!, folder, baseHash: hash });
    },
  });
  const sections = preview.data?.sections ?? [];

  const submit = async () => {
    setBusy(true);
    try {
      if (!(await flushOpenEditors())) {
        toast.error("Catatan yang sedang disunting belum tersimpan. Selesaikan dulu, lalu ulangi.");
        return;
      }
      rememberAfter(after);
      const { hash } = await knowledgeApi.source(source.id);
      const result = await splitNote.mutateAsync({ id: source.id, level: level!, folder, after, baseHash: hash });
      await reloadOpenEditors();
      close();
      toast.success(
        `Dipecah menjadi ${result.created.length} catatan; ${result.updatedLinks} tautan diperbarui. Isi semula ada di Riwayat versi.`,
      );
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      toast.error(conflict ? "Catatan berubah sejak dibuka" : "Gagal memecah catatan", {
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid min-w-0 grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && sections.length) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Pecah catatan per judul</DialogTitle>
        <DialogDescription className="truncate font-mono text-xs">{source.path}</DialogDescription>
      </DialogHeader>
      {detail && !levels.length ? (
        <p className="text-sm text-muted-foreground">Catatan ini tidak punya judul Markdown untuk dipecah.</p>
      ) : (
        <FieldGroup>
          <Field>
            <FieldLabel>Pecah di setiap judul</FieldLabel>
            <Select value={level === null ? "" : String(level)} onValueChange={(v) => setChosen(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {levels.map(([value, count]) => (
                  <SelectItem key={value} value={String(value)}>
                    {"#".repeat(value)} Tingkat {value} — {count} judul
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Folder catatan baru</FieldLabel>
            <SearchableSelect
              value={folder || ROOT}
              onChange={(v) => setFolder(v === ROOT ? "" : v)}
              options={[
                { value: ROOT, label: "/ (akar vault)" },
                ...(tree?.folders ?? []).map((f) => ({ value: f, label: f })),
              ]}
              placeholder="Pilih folder"
              searchPlaceholder="Cari folder…"
            />
          </Field>
          <Field>
            <FieldLabel>Yang tertinggal di catatan ini</FieldLabel>
            <Select value={after} onValueChange={(v) => setAfter(v as After)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AFTER_LABEL) as After[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {AFTER_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Catatan yang akan dibuat ({sections.length})</FieldLabel>
            {preview.isError ? (
              <FieldDescription className="text-destructive">{errorMessage(preview.error)}</FieldDescription>
            ) : (
              <ul className="max-h-40 overflow-y-auto rounded-lg border p-2 font-mono text-[11px] text-muted-foreground">
                {sections.map((s) => (
                  <li key={s.path} className="truncate" title={s.path}>
                    {s.path}
                  </li>
                ))}
                {preview.isFetching && !sections.length && <li>Memuat…</li>}
              </ul>
            )}
            <FieldDescription>
              Teks sebelum judul pertama tetap di sini. Tautan dari catatan lain ke judul yang dipindah ikut diperbarui.
              {sections.length > 20 && " Jumlahnya cukup banyak; pastikan tingkat judulnya sudah tepat."}
            </FieldDescription>
          </Field>
        </FieldGroup>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={busy}>
          Batal
        </Button>
        <Button type="submit" disabled={busy || !sections.length || preview.isFetching}>
          {busy ? "Memproses…" : `Pecah menjadi ${sections.length} catatan`}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ComposeForm({ dialog }: { dialog: Exclude<ComposeDialog, { mode: "split" }> }) {
  const merge = dialog.mode === "merge";
  const { data: tree } = useKnowledgeTree();
  const { data: detail } = useKnowledgeNote(merge ? dialog.source.id : null);
  const { mergeNote, extractNote } = useKnowledgeActions();
  const close = useWorkspaceStore((s) => s.close);
  const openNote = useOpenNote();
  const [target, setTarget] = useState(NEW_NOTE);
  const [title, setTitle] = useState(() =>
    dialog.mode === "extract" ? extractTitle(dialog.text) : noteName(dialog.source.path),
  );
  const [folder, setFolder] = useState(folderOf(dialog.source.path));
  const [position, setPosition] = useState<string>("end");
  const [heading, setHeading] = useState(true);
  const [after, setAfter] = useState<After>(savedAfter);
  const [busy, setBusy] = useState(false);

  const notes = (tree?.notes ?? []).filter(
    (n) => n.kind === "note" && n.id !== dialog.source.id && !isMirrorNote({ path: n.path, properties: n.properties }),
  );
  const isNew = target === NEW_NOTE;
  const { data: targetDetail } = useKnowledgeNote(isNew ? null : target);
  const targetHeadings = useMemo(() => outline(targetDetail?.content ?? ""), [targetDetail?.content]);
  const backlinks = detail?.backlinks.length ?? 0;
  const canSubmit = !busy && (isNew ? !!title.trim() : true);

  const submit = async () => {
    setBusy(true);
    try {
      // Perubahan yang belum tersimpan di editor dikirim dulu agar hash & isi yang dicocokkan server terkini
      if (!(await flushOpenEditors())) {
        toast.error("Catatan yang sedang disunting belum tersimpan. Selesaikan dulu, lalu ulangi.");
        return;
      }
      const source = await knowledgeApi.source(dialog.source.id);
      const destination = isNew ? null : await knowledgeApi.source(target);
      const shared = {
        baseHash: source.hash,
        ...(position.startsWith(HEADING_PREFIX)
          ? { targetHeading: position.slice(HEADING_PREFIX.length) }
          : { position: position as "end" | "start" }),
        ...(destination ? { targetId: target, targetHash: destination.hash } : { newTitle: title.trim(), folder }),
      };
      if (dialog.mode === "merge") {
        const result = await mergeNote.mutateAsync({ id: dialog.source.id, ...shared, heading });
        close();
        toast.success(
          `Digabung ke ${noteName(result.path)}; ${result.updatedLinks} tautan & ${result.updatedCanvases} canvas diperbarui. Catatan sumber ada di .trash vault.`,
        );
        await reloadOpenEditors(dialog.source.id);
        if (result.id) openNote(result.id, undefined, { replace: true });
      } else {
        rememberAfter(after);
        const result = await extractNote.mutateAsync({
          id: dialog.source.id,
          ...shared,
          from: dialog.from,
          to: dialog.to,
          text: dialog.text,
          after,
        });
        await reloadOpenEditors();
        close();
        toast.success(`Teks dipindah ke ${noteName(result.path)}.`, {
          action: result.id ? { label: "Buka", onClick: () => openNote(result.id!) } : undefined,
        });
      }
    } catch (error) {
      const conflict = error instanceof ApiError && error.status === 409;
      toast.error(conflict ? "Catatan berubah sejak dibuka" : "Gagal memproses catatan", {
        description: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid min-w-0 grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {merge ? "Gabungkan catatan" : !merge && dialog.cursor ? "Pecah di posisi kursor" : "Ekstrak teks terpilih"}
        </DialogTitle>
        <DialogDescription className="truncate font-mono text-xs">{dialog.source.path}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel>Tujuan</FieldLabel>
          <SearchableSelect
            value={target}
            onChange={(value) => {
              setTarget(value);
              setPosition("end");
            }}
            options={[
              { value: NEW_NOTE, label: "+ Catatan baru" },
              ...notes.map((n) => ({ value: n.id, label: n.path.replace(/\.md$/i, "") })),
            ]}
            placeholder="Pilih catatan"
            searchPlaceholder="Cari catatan…"
          />
        </Field>
        {isNew ? (
          <>
            <Field>
              <FieldLabel htmlFor="kn-compose-title">Judul catatan baru</FieldLabel>
              <Input id="kn-compose-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Folder</FieldLabel>
              <SearchableSelect
                value={folder || ROOT}
                onChange={(v) => setFolder(v === ROOT ? "" : v)}
                options={[
                  { value: ROOT, label: "/ (akar vault)" },
                  ...(tree?.folders ?? []).map((f) => ({ value: f, label: f })),
                ]}
                placeholder="Pilih folder"
                searchPlaceholder="Cari folder…"
              />
            </Field>
          </>
        ) : (
          <Field>
            <FieldLabel>Posisi di catatan tujuan</FieldLabel>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="end">Di akhir catatan</SelectItem>
                <SelectItem value="start">Di awal catatan (sesudah properti)</SelectItem>
                {targetHeadings.map((h) => (
                  <SelectItem key={h.id} value={`${HEADING_PREFIX}${h.text}`}>
                    {"\u00a0".repeat((h.level - 1) * 2)}Akhir bagian: {h.text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {dialog.mode === "extract" && (
          <Field>
            <FieldLabel>Yang tertinggal di catatan ini</FieldLabel>
            <Select value={after} onValueChange={(v) => setAfter(v as After)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AFTER_LABEL) as After[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {AFTER_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription className="line-clamp-2 break-words">
              {dialog.cursor
                ? `${dialog.text.length} karakter dari kursor sampai akhir: `
                : `${dialog.text.length} karakter terpilih: `}
              {dialog.text.slice(0, 120)}
            </FieldDescription>
          </Field>
        )}
        {merge && !isNew && (
          <Field orientation="horizontal">
            <Switch id="kn-compose-heading" checked={heading} onCheckedChange={setHeading} />
            <FieldLabel htmlFor="kn-compose-heading">
              Awali dengan judul &ldquo;{noteName(dialog.source.path)}&rdquo; agar tautan lama menuju bagian ini
            </FieldLabel>
          </Field>
        )}
        {merge && (
          <FieldDescription>
            Isi & properti digabung (nilai tujuan menang, tag & alias disatukan). {backlinks} catatan yang menaut ke
            catatan ini diperbarui, begitu juga canvas. Catatan sumber dipindah ke <code>.trash</code> vault.
          </FieldDescription>
        )}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close} disabled={busy}>
          Batal
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {busy ? "Memproses…" : merge ? "Gabungkan" : dialog.cursor ? "Pecah" : "Ekstrak"}
        </Button>
      </DialogFooter>
    </form>
  );
}
