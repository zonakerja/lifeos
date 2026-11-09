import { FilePlus2, FileText, FolderInput, Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { useKnowledgeActions, useKnowledgeTree } from "@/data/use-knowledge-workspace";
import { useOpenSession } from "@/hooks/use-retained";
import { useSearchParam } from "@/hooks/use-search-param";
import { errorMessage } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/endpoints";
import type { KnowledgeNoteListItem } from "@/types/api";
import { ComposeDialogHost } from "./compose-dialog";
import { CommandPalette } from "./command-palette";
import { VersionHistoryDialog } from "./version-history-dialog";
import { folderOf, noteName, templateNotes } from "./knowledge-logic";
import { useOpenNote, useWorkspaceStore } from "./workspace-store";

const ROOT = "__root__";

function FolderPicker({
  value,
  onChange,
  folders,
}: {
  value: string;
  onChange: (v: string) => void;
  folders: string[];
}) {
  return (
    <SearchableSelect
      value={value || ROOT}
      onChange={(v) => onChange(v === ROOT ? "" : v)}
      options={[{ value: ROOT, label: "/ (akar vault)" }, ...folders.map((f) => ({ value: f, label: f }))]}
      placeholder="Pilih folder"
      searchPlaceholder="Cari folder…"
    />
  );
}

/** Semua dialog menu Knowledge; dipasang sekali di halaman. */
export function WorkspaceDialogs() {
  const dialog = useWorkspaceStore((s) => s.dialog);
  const close = useWorkspaceStore((s) => s.close);
  const session = useOpenSession(!!dialog);
  const kind = dialog?.kind;
  return (
    <>
      <Dialog open={kind === "new-note"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.kind === "new-note" && <NewNoteForm key={session} folder={dialog.folder} title={dialog.title} />}
        </DialogContent>
      </Dialog>
      <Dialog open={kind === "new-folder" || kind === "move-folder"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {dialog?.kind === "new-folder" && <FolderForm key={session} parent={dialog.parent} />}
          {dialog?.kind === "move-folder" && <FolderForm key={session} from={dialog.path} />}
        </DialogContent>
      </Dialog>
      <Dialog open={kind === "move-note"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.kind === "move-note" && <MoveNoteForm key={session} note={dialog.note} mode={dialog.mode} />}
        </DialogContent>
      </Dialog>
      <Dialog open={kind === "curate"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-lg">
          {dialog?.kind === "curate" && <CurateForm key={session} note={dialog.note} />}
        </DialogContent>
      </Dialog>
      <DeleteDialogs />
      <QuickSwitcher />
      <CommandPalette />
      <VersionHistoryDialog />
      <ComposeDialogHost />
    </>
  );
}

function NewNoteForm(props: { folder?: string; title?: string }) {
  const { data: tree } = useKnowledgeTree();
  const { createNote } = useKnowledgeActions();
  const close = useWorkspaceStore((s) => s.close);
  const openNote = useOpenNote();
  const [title, setTitle] = useState(props.title ?? "");
  const [folder, setFolder] = useState(props.folder ?? "");
  const [templateId, setTemplateId] = useState("none");
  const templates = templateNotes(tree?.notes ?? []);

  const submit = async () => {
    try {
      const created = await createNote.mutateAsync({
        folder,
        title: title.trim(),
        ...(templateId !== "none" ? { templateId } : {}),
      });
      close();
      toast.success(`Catatan dibuat: ${created.path}`);
      if (created.id) openNote(created.id);
    } catch (error) {
      toast.error("Gagal membuat catatan", { description: errorMessage(error) });
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FilePlus2 className="size-4 text-module" /> Catatan baru
        </DialogTitle>
        <DialogDescription>Berkas Markdown baru di vault — langsung tersinkron ke Obsidian.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="kn-new-title">Judul</FieldLabel>
          <Input id="kn-new-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <FieldDescription>
            Menjadi nama berkas (karakter \ / : * ? " &lt; &gt; | # ^ [ ] diganti spasi).
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Folder</FieldLabel>
          <FolderPicker value={folder} onChange={setFolder} folders={tree?.folders ?? []} />
        </Field>
        <Field>
          <FieldLabel>Templat</FieldLabel>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Catatan kosong</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Dari folder 90-Templat; {"{{judul}}"} dan {"{{tanggal}}"} diisi otomatis.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Batal
        </Button>
        <Button type="submit" disabled={!title.trim() || createNote.isPending}>
          Buat catatan
        </Button>
      </DialogFooter>
    </form>
  );
}

function FolderForm({ parent, from }: { parent?: string; from?: string }) {
  const { createFolder, moveFolder } = useKnowledgeActions();
  const close = useWorkspaceStore((s) => s.close);
  const [path, setPath] = useState(from ?? (parent ? `${parent}/` : ""));
  const busy = createFolder.isPending || moveFolder.isPending;
  const submit = async () => {
    try {
      if (from) await moveFolder.mutateAsync({ from, to: path.trim() });
      else await createFolder.mutateAsync(path.trim());
      close();
      toast.success(from ? "Folder dipindah." : "Folder dibuat.");
    } catch (error) {
      toast.error(from ? "Gagal memindah folder" : "Gagal membuat folder", { description: errorMessage(error) });
    }
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FolderInput className="size-4 text-module" /> {from ? "Ganti nama / pindah folder" : "Folder baru"}
        </DialogTitle>
        <DialogDescription>
          Path di dalam vault, pisahkan subfolder dengan "/".{" "}
          {from && "Tautan [[nama]] tidak berubah karena nama catatan tetap."}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="kn-folder">Path folder</FieldLabel>
        <Input
          id="kn-folder"
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="10-Peraturan/PMK"
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Batal
        </Button>
        <Button type="submit" disabled={!path.trim() || busy || path.trim() === from}>
          Simpan
        </Button>
      </DialogFooter>
    </form>
  );
}

function MoveNoteForm({ note, mode }: { note: KnowledgeNoteListItem; mode: "rename" | "move" }) {
  const { data: tree } = useKnowledgeTree();
  const { moveNote } = useKnowledgeActions();
  const close = useWorkspaceStore((s) => s.close);
  const openNote = useOpenNote();
  const ext = note.kind === "note" ? "" : note.path.slice(note.path.lastIndexOf("."));
  const [name, setName] = useState(
    note.kind === "note" ? noteName(note.path) : note.path.slice(note.path.lastIndexOf("/") + 1),
  );
  const [folder, setFolder] = useState(folderOf(note.path));
  const [updateLinks, setUpdateLinks] = useState(true);
  const renamed = note.kind === "note" && name.trim() !== noteName(note.path);

  const submit = async () => {
    const file =
      note.kind === "note" ? `${name.trim()}.md` : name.trim().endsWith(ext) ? name.trim() : `${name.trim()}${ext}`;
    try {
      const result = await moveNote.mutateAsync({
        id: note.id,
        path: folder ? `${folder}/${file}` : file,
        updateLinks,
      });
      close();
      toast.success(
        result.updatedLinks
          ? `Dipindah; ${result.updatedLinks} tautan di catatan lain diperbarui.`
          : "Catatan dipindah.",
      );
      if (result.id) openNote(result.id, undefined, { replace: true });
    } catch (error) {
      toast.error("Gagal memindah catatan", { description: errorMessage(error) });
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{mode === "rename" ? "Ganti nama" : "Pindahkan"}</DialogTitle>
        <DialogDescription className="truncate font-mono text-xs">{note.path}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="kn-move-name">Nama</FieldLabel>
          <Input
            id="kn-move-name"
            autoFocus={mode === "rename"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Folder</FieldLabel>
          <FolderPicker value={folder} onChange={setFolder} folders={tree?.folders ?? []} />
        </Field>
        {renamed && (
          <Field orientation="horizontal">
            <Switch id="kn-update-links" checked={updateLinks} onCheckedChange={setUpdateLinks} />
            <FieldLabel htmlFor="kn-update-links" className="font-normal">
              Perbarui [[tautan]] di catatan lain ({note.backlinks} catatan merujuk)
            </FieldLabel>
          </Field>
        )}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Batal
        </Button>
        <Button type="submit" disabled={!name.trim() || moveNote.isPending}>
          Simpan
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Kurasi usulan Inbox: tetapkan status/publik lalu pindahkan ke folder tujuan, tanpa membuka Obsidian. */
function CurateForm({ note }: { note: KnowledgeNoteListItem }) {
  const { data: tree } = useKnowledgeTree();
  const { setProperties, moveNote } = useKnowledgeActions();
  const close = useWorkspaceStore((s) => s.close);
  const folders = (tree?.folders ?? []).filter((f) => !f.startsWith("00-Inbox") && !f.startsWith("90-Templat"));
  const [folder, setFolder] = useState(folders.find((f) => f.startsWith("40-")) ?? folders[0] ?? "");
  const [status, setStatus] = useState("berlaku");
  const [publik, setPublik] = useState(note.publik ?? false);
  const [title, setTitle] = useState(noteName(note.path).replace(/^\d{4}-\d{2}-\d{2} \d{4} /, ""));
  const busy = setProperties.isPending || moveNote.isPending;

  const submit = async () => {
    try {
      const source = await knowledgeApi.source(note.id);
      await setProperties.mutateAsync({ id: note.id, set: { status, publik }, baseHash: source.hash });
      const result = await moveNote.mutateAsync({
        id: note.id,
        path: `${folder ? `${folder}/` : ""}${title.trim()}.md`,
      });
      close();
      toast.success(`Usulan dikurasi ke ${result.path}`);
    } catch (error) {
      toast.error("Gagal mengkurasi usulan", { description: errorMessage(error) });
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Kurasi usulan</DialogTitle>
        <DialogDescription>
          Tetapkan status lalu pindahkan dari 00-Inbox. Catatan berstatus berlaku dipakai chatbot & agen untuk menjawab.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="kn-curate-title">Judul / nama berkas</FieldLabel>
          <Input id="kn-curate-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Pindahkan ke folder</FieldLabel>
          <FolderPicker value={folder} onChange={setFolder} folders={folders} />
        </Field>
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="berlaku">Berlaku (dipakai menjawab)</SelectItem>
              <SelectItem value="draf">Draf</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal">
          <Switch id="kn-curate-publik" checked={publik} onCheckedChange={setPublik} />
          <FieldLabel htmlFor="kn-curate-publik" className="font-normal">
            Publik (boleh dipakai bot WhatsApp untuk semua kontak)
          </FieldLabel>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Batal
        </Button>
        <Button type="submit" disabled={!title.trim() || busy}>
          Kurasi
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteDialogs() {
  const dialog = useWorkspaceStore((s) => s.dialog);
  const [openId, setOpenId] = useSearchParam("note");
  const close = useWorkspaceStore((s) => s.close);
  const { deleteNote, deleteFolder } = useKnowledgeActions();
  const isNote = dialog?.kind === "delete-note";
  const isFolder = dialog?.kind === "delete-folder";
  return (
    <ConfirmDialog
      open={isNote || isFolder}
      onOpenChange={(open) => !open && close()}
      title={isFolder ? "Pindahkan folder ke sampah?" : "Pindahkan catatan ke sampah?"}
      itemName={dialog?.kind === "delete-note" ? dialog.note.path : dialog?.kind === "delete-folder" ? dialog.path : ""}
      description={
        isFolder && dialog?.kind === "delete-folder"
          ? `Folder beserta ${dialog.count} catatan/berkas dipindah ke folder .trash di vault (bisa dipulihkan dari disk / Obsidian).`
          : "Berkas dipindah ke folder .trash di vault (bisa dipulihkan dari disk / Obsidian). Tautan ke catatan ini menjadi tautan rusak."
      }
      confirmLabel="Pindahkan ke sampah"
      onConfirm={() => {
        const run = async () => {
          try {
            if (dialog?.kind === "delete-note") {
              await deleteNote.mutateAsync(dialog.note.id);
              // Catatan yang sedang dibuka dihapus → kembali ke beranda vault
              if (openId === dialog.note.id) setOpenId(null);
            }
            if (dialog?.kind === "delete-folder") await deleteFolder.mutateAsync(dialog.path);
            toast.success("Dipindah ke .trash.");
          } catch (error) {
            toast.error("Gagal menghapus", { description: errorMessage(error) });
          }
        };
        void run();
      }}
    />
  );
}

/** Pembuka cepat (Ctrl+O): cari judul/alias/path, Enter = buka; tidak ada = buat catatan baru. */
function QuickSwitcher() {
  const dialog = useWorkspaceStore((s) => s.dialog);
  const close = useWorkspaceStore((s) => s.close);
  const open = useWorkspaceStore((s) => s.open);
  const { data: tree } = useKnowledgeTree(dialog?.kind === "quick-switcher");
  const openNote = useOpenNote();
  const [query, setQuery] = useState("");
  const isOpen = dialog?.kind === "quick-switcher";
  const side = isOpen && !!dialog.side;
  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(value) => {
        if (!value) close();
        setQuery("");
      }}
      title={side ? "Buka berdampingan" : "Pembuka cepat"}
      description="Cari catatan menurut judul atau path"
    >
      <Command>
        <CommandInput placeholder="Ketik judul catatan…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>Tidak ada catatan cocok.</CommandEmpty>
          <CommandGroup heading="Catatan">
            {(tree?.notes ?? []).slice(0, 2000).map((note) => (
              <CommandItem
                key={note.id}
                value={`${note.title} ${note.path}`}
                onSelect={() => {
                  close();
                  openNote(note.id, undefined, side ? { side: true } : undefined);
                }}
              >
                {note.kind === "note" ? <FileText /> : <Paperclip />}
                <span className="truncate">{note.title}</span>
                <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                  {folderOf(note.path)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          {query.trim() && (
            <CommandGroup heading="Baru">
              <CommandItem value={`__new__ ${query}`} onSelect={() => open({ kind: "new-note", title: query.trim() })}>
                <FilePlus2 /> Buat catatan "{query.trim()}"
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
