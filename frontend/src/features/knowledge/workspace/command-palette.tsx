import {
  BookOpen,
  CalendarDays,
  Copy,
  Dices,
  ExternalLink,
  FilePen,
  FilePlus2,
  FileStack,
  FolderInput,
  FolderPlus,
  History,
  type LucideIcon,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Star,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { getModule } from "@/config/navigation";
import { useKnowledgeMutations, useKnowledgeStatus } from "@/data/use-knowledge";
import { useKnowledgeTree } from "@/data/use-knowledge-workspace";
import { errorMessage } from "@/lib/api/client";
import { addDays, formatLocalYMD } from "@/lib/dates";
import { useDailyNote } from "../daily-note-button";
import { SNIPPETS } from "./editor-snippets";
import { noteName, obsidianUri, templateNotes } from "./knowledge-logic";
import { openWorkspaceDialog, useOpenNote, useWorkspaceStore } from "./workspace-store";

interface PaletteCommand {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Kata tambahan yang ikut dicari (mis. istilah Obsidian dalam bahasa Inggris). */
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

const dayFromToday = (days: number) => formatLocalYMD(addDays(new Date(), days));
const pickRandom = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/**
 * Palet perintah (Ctrl/Cmd+P, seperti Obsidian — K5 docs/AI-AGENT.md §25.6): semua aksi menu Knowledge dari satu tempat.
 * Grup "Catatan ini" & "Sisipkan" hanya muncul bila ada catatan terbuka / editor sumber aktif.
 */
export function CommandPalette() {
  const dialog = useWorkspaceStore((s) => s.dialog);
  const close = useWorkspaceStore((s) => s.close);
  const active = useWorkspaceStore((s) => s.active);
  const editor = useWorkspaceStore((s) => s.editor);
  const isOpen = dialog?.kind === "command-palette";
  const { data: tree } = useKnowledgeTree(isOpen);
  const { data: status } = useKnowledgeStatus();
  const { scan } = useKnowledgeMutations();
  const daily = useDailyNote();
  const openNote = useOpenNote();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const notes = tree?.notes ?? [];

  const groups: { heading: string; commands: PaletteCommand[] }[] = [];

  if (active) {
    const commands: PaletteCommand[] = [];
    if (active.editable)
      commands.push(
        active.mode === "edit"
          ? {
              id: "read",
              label: "Beralih ke mode baca",
              icon: BookOpen,
              keywords: "reading view",
              run: () => active.setMode("read"),
            }
          : {
              id: "edit",
              label: "Sunting catatan ini",
              icon: Pencil,
              keywords: "edit source",
              run: () => active.setMode("edit"),
            },
      );
    commands.push(
      {
        id: "bookmark",
        label: active.bookmarked ? "Hapus penanda" : "Tandai catatan ini",
        icon: Star,
        keywords: "bookmark star penanda",
        run: active.toggleBookmark,
      },
      ...(active.mirror
        ? []
        : [
            {
              id: "versions",
              label: "Riwayat versi catatan ini",
              icon: History,
              keywords: "history version recovery pulihkan riwayat",
              run: () => openWorkspaceDialog({ kind: "versions", id: active.id, title: active.title }),
            },
          ]),
      {
        id: "copy-link",
        label: "Salin tautan [[…]]",
        icon: Copy,
        keywords: "copy wikilink",
        run: () =>
          void navigator.clipboard
            .writeText(`[[${noteName(active.path)}]]`)
            .then(() => toast.success("Tautan disalin")),
      },
    );
    if (status?.folder) {
      const vault = status.folder;
      commands.push({
        id: "obsidian",
        label: "Buka di Obsidian",
        icon: ExternalLink,
        keywords: "obsidian aplikasi",
        run: () => window.location.assign(obsidianUri(vault, active.path)),
      });
    }
    const item = active.item;
    if (item && !active.mirror)
      commands.push(
        {
          id: "rename",
          label: "Ganti nama catatan",
          icon: FilePen,
          keywords: "rename",
          run: () => openWorkspaceDialog({ kind: "move-note", note: item, mode: "rename" }),
        },
        {
          id: "move",
          label: "Pindahkan catatan ke folder…",
          icon: FolderInput,
          keywords: "move",
          run: () => openWorkspaceDialog({ kind: "move-note", note: item, mode: "move" }),
        },
        {
          id: "delete",
          label: "Pindahkan catatan ke sampah",
          icon: Trash2,
          keywords: "delete hapus trash",
          run: () => openWorkspaceDialog({ kind: "delete-note", note: item }),
        },
      );
    groups.push({ heading: `Catatan ini — ${active.title}`, commands });
  }

  if (editor) {
    groups.push({
      heading: "Sisipkan di editor",
      commands: [
        ...SNIPPETS.map((s) => ({
          id: `snippet-${s.id}`,
          label: `Sisipkan ${s.label.toLowerCase()}`,
          icon: TextCursorInput,
          keywords: `insert ${s.keywords}`,
          run: () => editor.insertSnippet(s.id),
        })),
        ...templateNotes(notes).map((t) => ({
          id: `template-${t.id}`,
          label: `Sisipkan templat: ${noteName(t.path)}`,
          icon: FileStack,
          keywords: "insert template templat",
          run: () => void editor.insertTemplate(t.id),
        })),
      ],
    });
  }

  const realNotes = notes.filter((n) => n.kind === "note");
  groups.push({
    heading: "Vault",
    commands: [
      {
        id: "new-note",
        label: "Catatan baru",
        icon: FilePlus2,
        keywords: "new note create buat",
        run: () => openWorkspaceDialog({ kind: "new-note" }),
      },
      {
        id: "new-folder",
        label: "Folder baru",
        icon: FolderPlus,
        keywords: "new folder create buat",
        run: () => openWorkspaceDialog({ kind: "new-folder" }),
      },
      {
        id: "switcher",
        label: "Buka cepat (cari catatan)",
        icon: Search,
        keywords: "quick switcher open",
        shortcut: "Ctrl O",
        run: () => openWorkspaceDialog({ kind: "quick-switcher" }),
      },
      {
        id: "daily",
        label: "Catatan hari ini",
        icon: CalendarDays,
        keywords: "daily note harian today",
        run: () => daily.open(dayFromToday(0)),
      },
      {
        id: "daily-prev",
        label: "Catatan harian kemarin",
        icon: CalendarDays,
        keywords: "daily yesterday harian",
        run: () => daily.open(dayFromToday(-1)),
      },
      {
        id: "daily-next",
        label: "Catatan harian besok",
        icon: CalendarDays,
        keywords: "daily tomorrow harian",
        run: () => daily.open(dayFromToday(1)),
      },
      ...(realNotes.length
        ? [
            {
              id: "random",
              label: "Buka catatan acak",
              icon: Dices,
              keywords: "random acak",
              run: () => openNote(pickRandom(realNotes).id),
            },
          ]
        : []),
      {
        id: "scan",
        label: "Pindai ulang vault",
        icon: RefreshCw,
        keywords: "scan reload refresh",
        run: () =>
          scan.mutate(undefined, {
            onSuccess: () => toast.success("Vault dipindai ulang"),
            onError: (error) => toast.error("Gagal memindai", { description: errorMessage(error) }),
          }),
      },
      {
        id: "settings",
        label: "Pengaturan vault (Tools → Basis Pengetahuan)",
        icon: Settings2,
        keywords: "settings pengaturan",
        run: () => void navigate("/tools/knowledge"),
      },
    ],
  });

  const knowledge = getModule("knowledge");
  groups.push({
    heading: "Buka tab",
    commands: (knowledge?.tabs ?? []).map((tab) => ({
      id: `tab-${tab.id}`,
      label: `Buka tab ${tab.label}`,
      icon: tab.icon,
      keywords: `tab ${tab.id}`,
      run: () => void navigate(`/knowledge/${tab.id}`),
    })),
  });

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(value) => {
        if (!value) close();
        setQuery("");
      }}
      title="Palet perintah"
      description="Jalankan perintah menu Knowledge"
    >
      <Command>
        <CommandInput
          placeholder="Ketik perintah… (mis. sunting, tabel, harian)"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Tidak ada perintah cocok.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group.heading} heading={group.heading}>
              {group.commands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={`${cmd.label} ${cmd.keywords ?? ""} ${cmd.id}`}
                  onSelect={() => {
                    close();
                    setQuery("");
                    cmd.run();
                  }}
                >
                  <cmd.icon />
                  <span className="truncate">{cmd.label}</span>
                  {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
