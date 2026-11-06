import { ArrowDown, ArrowUp, Columns3, FileText, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PaginationControl } from "@/components/common/pagination-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useKnowledgeActions, useKnowledgeTree } from "@/data/use-knowledge-workspace";
import { usePagination } from "@/hooks/use-pagination";
import { ApiError, errorMessage } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/endpoints";
import { formatShortDate } from "@/lib/dates";
import type { KnowledgeNoteListItem } from "@/types/api";
import { folderOf, isEmptyQuery, matchesNodeQuery, parseNodeQuery, propertyText } from "./knowledge-logic";
import { useOpenNote } from "./workspace-store";

type SortKey = "title" | "folder" | "jenis" | "status" | "backlinks" | "updatedAt" | `prop:${string}`;
const BASE_COLUMNS = ["folder", "jenis", "status", "publik", "tags", "backlinks", "updatedAt"] as const;
const BASE_LABELS: Record<(typeof BASE_COLUMNS)[number], string> = {
  folder: "Folder",
  jenis: "Jenis",
  status: "Status",
  publik: "Publik",
  tags: "Tag",
  backlinks: "Backlink",
  updatedAt: "Diubah",
};
const HIDDEN_PROPS = new Set(["title", "judul", "jenis", "status", "publik", "tags", "tag"]);

/** Nilai pembanding untuk pengurutan kolom. */
function sortValue(note: KnowledgeNoteListItem, key: SortKey): string | number {
  if (key === "title") return note.title.toLowerCase();
  if (key === "folder") return folderOf(note.path).toLowerCase();
  if (key === "backlinks") return note.backlinks;
  if (key === "updatedAt") return note.updatedAt;
  if (key === "jenis") return note.jenis ?? "";
  if (key === "status") return note.status ?? "";
  return propertyText(note.properties?.[key.slice(5)]).toLowerCase();
}

/**
 * Tab Tabel (setara Bases sederhana): semua catatan sebagai baris, kolom properti terpilih, saring dengan kueri
 * (`tag:`, `status:`, `jenis:`, `path:`), urutkan per kolom, dan ubah status / jenis / publik langsung di sel.
 */
export function TableTab() {
  const { data: tree, isLoading } = useKnowledgeTree();
  const { setProperties } = useKnowledgeActions();
  const openNote = useOpenNote();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "title", desc: false });
  const [extra, setExtra] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [notesOnly, setNotesOnly] = useState(true);

  const propertyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const n of tree?.notes ?? [])
      for (const k of Object.keys(n.properties ?? {})) if (!HIDDEN_PROPS.has(k)) keys.add(k);
    return [...keys].sort();
  }, [tree]);

  const rows = useMemo(() => {
    const query = parseNodeQuery(filter);
    const list = (tree?.notes ?? []).filter(
      (n) => (!notesOnly || n.kind === "note") && (isEmptyQuery(query) || matchesNodeQuery(n, query)),
    );
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "id", { numeric: true });
      return sort.desc ? -cmp : cmp;
    });
  }, [tree, filter, sort, notesOnly]);
  const { pageItems, setPage, controlProps } = usePagination(rows, 50);

  const update = async (note: KnowledgeNoteListItem, key: string, value: unknown) => {
    try {
      const source = await knowledgeApi.source(note.id);
      await setProperties.mutateAsync({ id: note.id, set: { [key]: value }, baseHash: source.hash });
      toast.success(`${key} "${note.title}" diperbarui.`);
    } catch (error) {
      toast.error("Gagal menyimpan", {
        description:
          error instanceof ApiError && error.status === 409
            ? "Catatan sedang berubah, coba lagi."
            : errorMessage(error),
      });
    }
  };

  const header = (key: SortKey, label: string) => (
    <th className="sticky top-0 z-[1] bg-muted px-2 py-2 text-left text-xs font-semibold whitespace-nowrap">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-module"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }))}
      >
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
  const visible = (col: string) => !hidden.includes(col);

  if (isLoading || !tree) return <Spinner className="m-6" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Saring: status:berlaku jenis:peraturan tag:bmn path:10- atau kata judul"
          className="h-8 max-w-md flex-1 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={notesOnly} onCheckedChange={setNotesOnly} /> Hanya catatan
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Columns3 /> Kolom
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-60 flex-col gap-1 overflow-y-auto"
          >
            {BASE_COLUMNS.map((col) => (
              <label key={col} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={visible(col)}
                  onCheckedChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== col) : [...h, col]))}
                />
                {BASE_LABELS[col]}
              </label>
            ))}
            {propertyKeys.length > 0 && (
              <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Properti lain</p>
            )}
            {propertyKeys.map((key) => (
              <label key={key} className="flex items-center gap-2 font-mono text-xs">
                <Checkbox
                  checked={extra.includes(key)}
                  onCheckedChange={(v) => setExtra((x) => (v ? [...x, key] : x.filter((k) => k !== key)))}
                />
                {key}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} baris</span>
      </div>

      <div className="max-h-[calc(100svh-16rem)] overflow-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {header("title", "Judul")}
              {visible("folder") && header("folder", "Folder")}
              {visible("jenis") && header("jenis", "Jenis")}
              {visible("status") && header("status", "Status")}
              {visible("publik") && (
                <th className="sticky top-0 bg-muted px-2 py-2 text-left text-xs font-semibold">Publik</th>
              )}
              {visible("tags") && (
                <th className="sticky top-0 bg-muted px-2 py-2 text-left text-xs font-semibold">Tag</th>
              )}
              {extra.map((key) => header(`prop:${key}`, key))}
              {visible("backlinks") && header("backlinks", "Backlink")}
              {visible("updatedAt") && header("updatedAt", "Diubah")}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((note) => (
              <tr key={note.id} className="border-t hover:bg-muted/40">
                <td className="max-w-72 px-2 py-1.5">
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-1.5 text-left text-xs font-medium hover:text-module"
                    onClick={() => openNote(note.id)}
                  >
                    {note.kind === "note" ? (
                      <FileText className="size-3.5 shrink-0" />
                    ) : (
                      <Paperclip className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{note.title}</span>
                  </button>
                </td>
                {visible("folder") && (
                  <td className="max-w-48 truncate px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {folderOf(note.path) || "/"}
                  </td>
                )}
                {visible("jenis") && (
                  <td className="px-2 py-1.5">
                    {note.kind === "note" ? (
                      <Input
                        key={`${note.id}-${note.jenis}`}
                        defaultValue={note.jenis ?? ""}
                        className="h-7 w-28 text-xs"
                        onBlur={(e) =>
                          e.target.value.trim() !== (note.jenis ?? "") &&
                          void update(note, "jenis", e.target.value.trim())
                        }
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                {visible("status") && (
                  <td className="px-2 py-1.5">
                    {note.kind === "note" ? (
                      <Select
                        value={note.status ?? "none"}
                        onValueChange={(v) => void update(note, "status", v === "none" ? null : v)}
                      >
                        <SelectTrigger size="sm" className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          <SelectItem value="berlaku">berlaku</SelectItem>
                          <SelectItem value="draf">draf</SelectItem>
                          <SelectItem value="dicabut">dicabut</SelectItem>
                          {note.status === "templat" && <SelectItem value="templat">templat</SelectItem>}
                        </SelectContent>
                      </Select>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                {visible("publik") && (
                  <td className="px-2 py-1.5">
                    {note.kind === "note" && (
                      <Switch checked={note.publik === true} onCheckedChange={(v) => void update(note, "publik", v)} />
                    )}
                  </td>
                )}
                {visible("tags") && (
                  <td className="max-w-56 px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {note.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          #{t}
                        </Badge>
                      ))}
                      {note.tags.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">+{note.tags.length - 4}</span>
                      )}
                    </div>
                  </td>
                )}
                {extra.map((key) => (
                  <td key={key} className="max-w-56 truncate px-2 py-1.5 text-xs">
                    {propertyText(note.properties?.[key])}
                  </td>
                ))}
                {visible("backlinks") && <td className="px-2 py-1.5 text-xs tabular-nums">{note.backlinks}</td>}
                {visible("updatedAt") && (
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap text-muted-foreground">
                    {formatShortDate(note.updatedAt)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControl {...controlProps} />
    </div>
  );
}
