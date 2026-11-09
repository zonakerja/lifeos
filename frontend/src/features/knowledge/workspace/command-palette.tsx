import {
  BookOpen,
  CalendarDays,
  ArrowLeftRight,
  Columns2,
  Combine,
  PanelRightClose,
  Split,
  Scissors,
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
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import { SNIPPETS } from "./editor-snippets";
import { noteName, obsidianUri, templateNotes } from "./knowledge-logic";
import { openWorkspaceDialog, SPLIT_MEDIA_QUERY, useOpenNote, useWorkspaceStore } from "./workspace-store";

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
  const [noteParam] = useSearchParam("note");
  const [sideParam] = useSearchParam("with");
  const setParams = useSetSearchParams();
  const splitFits = useMediaQuery(SPLIT_MEDIA_QUERY);

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
        ...(item.kind === "note"
          ? [
              {
                id: "merge",
                label: "Gabungkan catatan ini ke catatan lain…",
                icon: Combine,
                keywords: "merge note composer gabung",
                run: () =>
                  openWorkspaceDialog({
                    kind: "compose",
                    mode: "merge",
                    source: { id: item.id, path: item.path },
                  }),
              },
              {
                id: "split-headings",
                label: "Pecah catatan ini per judul…",
                icon: Split,
                keywords: "split refactor pecah bab pasal heading note composer",
                run: () =>
                  openWorkspaceDialog({
                    kind: "compose",
                    mode: "split",
                    source: { id: item.id, path: item.path },
                  }),
              },
            ]
          : []),
        {
          id: "delete",
          label: "Pindahkan catatan ke sampah",
          icon: Trash2,
          keywords: "delete hapus trash",
          run: () => openWorkspaceDialog({ kind: "delete-note", note: item }),
        },
      );
    if (splitFits)
      commands.push({
        id: "side-open",
        label: "Buka catatan lain berdampingan…",
        icon: Columns2,
        keywords: "split side tab belah dua panel berdampingan",
        run: () => openWorkspaceDialog({ kind: "quick-switcher", side: true }),
      });
    if (splitFits && sideParam && noteParam)
      commands.push(
        {
          id: "side-swap",
          label: "Tukar posisi dua panel",
          icon: ArrowLeftRight,
          keywords: "split swap tukar panel",
          run: () => setParams({ note: sideParam, with: noteParam, h: null, h2: null }),
        },
        {
          id: "side-close",
          label: "Tutup panel kanan",
          icon: PanelRightClose,
          keywords: "split close tutup panel belah",
          run: () => setParams({ with: null, h2: null }),
        },
      );
    groups.push({ heading: `Catatan ini — ${active.title}`, commands });
  }

  if (editor) {
    groups.push({
      heading: "Sisipkan di editor",
      commands: [
        ...(active && !active.mirror
          ? [
              {
                id: "extract",
                label: "Ekstrak teks terpilih ke catatan…",
                icon: Scissors,
                keywords: "extract note composer pindah pilihan selection",
                run: () => {
                  const selection = editor.selection();
                  if (!selection?.text.trim()) {
                    toast.info("Pilih dulu teks yang akan diekstrak di editor.");
                    return;
                  }
                  openWorkspaceDialog({
                    kind: "compose",
                    mode: "extract",
                    source: { id: active.id, path: active.path },
                    ...selection,
                  });
                },
              },
              {
                id: "split-cursor",
                label: "Pecah catatan di posisi kursor…",
                icon: Split,
                keywords: "split cursor pecah kursor note composer",
                run: () => {
                  const tail = editor.tail();
                  if (!tail?.text.trim()) {
                    toast.info("Letakkan kursor sebelum teks yang akan dipindah ke catatan lain.");
                    return;
                  }
                  openWorkspaceDialog({
                    kind: "compose",
                    mode: "extract",
                    source: { id: active.id, path: active.path },
                    ...tail,
                    cursor: true,
                  });
                },
              },
            ]
          : []),
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
      {
        id: "weekly",
        label: "Catatan minggu ini",
        icon: CalendarDays,
        keywords: "weekly periodic mingguan minggu",
        run: () => daily.open(dayFromToday(0), undefined, "week"),
      },
      {
        id: "monthly",
        label: "Catatan bulan ini",
        icon: CalendarDays,
        keywords: "monthly periodic bulanan bulan",
        run: () => daily.open(dayFromToday(0), undefined, "month"),
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
