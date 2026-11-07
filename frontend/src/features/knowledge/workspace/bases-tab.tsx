import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Database,
  FileText,
  LayoutGrid,
  List,
  Plus,
  Settings2,
  SlidersHorizontal,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { RenameDialog } from "@/components/common/rename-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  useKnowledgeActions,
  useKnowledgeBase,
  useKnowledgeBaseActions,
  useKnowledgeBases,
  useKnowledgeTree,
} from "@/data/use-knowledge-workspace";
import { useSearchParam, useSetSearchParams } from "@/hooks/use-search-param";
import { useToday } from "@/hooks/use-today";
import { ApiError, errorMessage } from "@/lib/api/client";
import { knowledgeApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteListItem } from "@/types/api";
import {
  applyView,
  availableProperties,
  type BaseData,
  type BaseFilter,
  type BaseResult,
  type BaseRow,
  type BaseValue,
  type BaseView,
  buildCondition,
  cellInputText,
  CONDITION_OPS,
  type ConditionOp,
  formatBaseValue,
  joinFilter,
  parseCellInput,
  propertyLabel,
  splitFilter,
  SUMMARIES,
  summarize,
  summaryLabel,
  viewColumns,
} from "./base-engine";
import { isMirrorNote } from "./knowledge-logic";
import { useOpenNote } from "./workspace-store";

const VIEW_TYPES = [
  { id: "table", label: "Tabel", icon: Table2 },
  { id: "cards", label: "Kartu", icon: LayoutGrid },
  { id: "list", label: "Daftar", icon: List },
] as const;
const viewIcon = (type?: string) => VIEW_TYPES.find((v) => v.id === type)?.icon ?? Table2;
const NONE = "__none__";

/**
 * Tab Bases (K2, docs/AI-AGENT.md §25.6): tampilan tersimpan atas catatan vault, dibaca/ditulis sebagai berkas `.base`
 * Obsidian (filter, rumus, kolom, urutan, kelompok). Tampilan yang sama terbuka di Obsidian.
 */
export function BasesTab() {
  const { data: list, isLoading } = useKnowledgeBases();
  const [current, setCurrent] = useSearchParam("base");
  const actions = useKnowledgeBaseActions();
  const [creating, setCreating] = useState(false);
  // `?base=` bisa path lengkap atau nama berkas saja (dari tautan `[[Nama.base]]` di catatan)
  const wanted = current?.toLowerCase();
  const active =
    (wanted &&
      list?.find((b) => b.path.toLowerCase() === wanted || `${b.name}.base`.toLowerCase() === wanted.split("/").pop())
        ?.path) ||
    current ||
    list?.[0]?.path ||
    null;

  if (isLoading) return <Spinner className="m-6" />;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-2xl border bg-card p-2">
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <Database className="size-3.5 text-module" /> Bases
          </span>
          <Button size="xs" variant="outline" onClick={() => setCreating(true)}>
            <Plus /> Baru
          </Button>
        </div>
        {list?.length ? (
          <ul className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
            {list.map((item) => (
              <li key={item.path} className="shrink-0">
                <button
                  type="button"
                  title={item.path}
                  onClick={() => setCurrent(item.path)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                    item.path === active && "bg-module-soft font-semibold text-module",
                  )}
                >
                  <Database className="size-3.5 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 text-xs text-muted-foreground">Belum ada base. Buat satu untuk menyimpan tampilan.</p>
        )}
      </aside>

      <div className="min-w-0">
        {active ? (
          <BaseView key={active} path={active} onDeleted={() => setCurrent(null)} />
        ) : (
          <Empty className="rounded-2xl border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Database />
              </EmptyMedia>
              <EmptyTitle>Tampilan tersimpan untuk vault Anda</EmptyTitle>
              <EmptyDescription>
                Base = berkas <code>.base</code> berisi filter, kolom, urutan, dan kelompok — misalnya "Regulasi
                berlaku" atau "SOP per status". Base yang sama terbuka juga di Obsidian.
              </EmptyDescription>
            </EmptyHeader>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Buat base
            </Button>
          </Empty>
        )}
      </div>

      <RenameDialog
        open={creating}
        onOpenChange={setCreating}
        title="Base baru"
        label="Nama base (berkas .base di akar vault)"
        initialValue=""
        onSave={(name) =>
          actions.create.mutate(
            { name },
            {
              onSuccess: (file) => setCurrent(file.path),
              onError: (error) => toast.error("Gagal membuat base", { description: errorMessage(error) }),
            },
          )
        }
      />
    </div>
  );
}

function BaseView({ path, onDeleted }: { path: string; onDeleted: () => void }) {
  const { data: file, isLoading, error, refetch } = useKnowledgeBase(path);
  const { data: tree } = useKnowledgeTree();
  const actions = useKnowledgeBaseActions();
  const [viewParam, setViewParam] = useSearchParam("view");
  const setParams = useSetSearchParams();
  const [editing, setEditing] = useState<"view" | "base" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const today = useToday();

  const base = useMemo(() => (file?.data ?? {}) as BaseData, [file]);
  const views: BaseView[] = useMemo(
    () => (Array.isArray(base.views) && base.views.length ? base.views : [{ type: "table", name: "Tabel" }]),
    [base],
  );
  const index = Math.min(Math.max(Number(viewParam ?? 0) || 0, 0), views.length - 1);
  const view = views[index];
  const notes = useMemo(() => tree?.notes ?? [], [tree]);
  const result = useMemo(() => applyView(notes, base, view, today), [notes, base, view, today]);
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.base$/i, "");
  const editable = !!file && !file.readOnly && !file.error;

  const save = (data: BaseData) => {
    if (!file) return;
    actions.save.mutate(
      { path, data, baseHash: file.hash },
      {
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            toast.error("Base diubah di Obsidian", { description: "Isi terbaru dimuat; ulangi perubahan Anda." });
            void refetch();
          } else toast.error("Gagal menyimpan base", { description: errorMessage(err) });
        },
      },
    );
  };
  const saveView = (next: BaseView) => save({ ...base, views: views.map((v, i) => (i === index ? next : v)) });
  const addView = () => {
    save({ ...base, views: [...views, { type: "table", name: `Tampilan ${views.length + 1}` }] });
    setViewParam(String(views.length));
  };
  const removeView = () => {
    if (views.length <= 1) return;
    save({ ...base, views: views.filter((_, i) => i !== index) });
    setViewParam(null);
  };

  if (isLoading) return <Spinner className="m-6" />;
  if (error || !file)
    return (
      <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {errorMessage(error)}
      </p>
    );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2">
        <div className="mr-auto min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            <Database className="size-4 shrink-0 text-module" /> {name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {file.path} · {result.total} catatan
            {result.rows.length < result.total ? ` (${result.rows.length} ditampilkan)` : ""}
          </p>
        </div>
        {editable && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing("base")}>
              <Settings2 /> Filter & rumus base
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Hapus base" onClick={() => setDeleting(true)}>
              <Trash2 />
            </Button>
          </>
        )}
      </div>

      {file.error && (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span>YAML base tidak terbaca ({file.error}). Perbaiki berkasnya di Obsidian — LifeOS tidak menimpanya.</span>
        </p>
      )}
      {file.readOnly && (
        <p className="rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Base di folder 80-LifeOS dikelola LifeOS — hanya dibaca.
        </p>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <div className="flex min-w-0 gap-1 overflow-x-auto">
          {views.map((v, i) => {
            const Icon = viewIcon(v.type);
            return (
              <Button
                key={`${i}-${v.name}`}
                size="sm"
                variant={i === index ? "secondary" : "ghost"}
                className={cn("shrink-0", i === index && "bg-module-soft text-module")}
                onClick={() => setParams({ view: i ? String(i) : null })}
              >
                <Icon /> {v.name || `Tampilan ${i + 1}`}
              </Button>
            );
          })}
        </div>
        {editable && (
          <>
            <Button size="sm" variant="ghost" onClick={addView} aria-label="Tambah tampilan">
              <Plus />
            </Button>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing("view")}>
              <SlidersHorizontal /> Atur tampilan
            </Button>
          </>
        )}
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <p className="font-semibold">Sebagian ekspresi tidak dikenali LifeOS (diabaikan):</p>
          <ul className="mt-1 list-disc pl-4">
            {result.errors.slice(0, 5).map((e) => (
              <li key={e} className="break-all font-mono">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <BaseResults result={result} base={base} type={view.type} summaries={view.summaries} />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="grid-cols-1 sm:max-w-2xl">
          {editing === "view" && (
            <ViewEditor
              view={view}
              base={base}
              notes={notes}
              canRemove={views.length > 1}
              onRemove={() => {
                removeView();
                setEditing(null);
              }}
              onSave={(next) => {
                saveView(next);
                setEditing(null);
              }}
            />
          )}
          {editing === "base" && (
            <BaseEditor
              base={base}
              notes={notes}
              onSave={(next) => {
                save(next);
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Hapus base?"
        itemName={name}
        description="Berkas .base dipindahkan ke .trash vault. Catatan di dalamnya tidak terpengaruh."
        confirmLabel="Hapus"
        onConfirm={() =>
          actions.remove.mutate(path, {
            onSuccess: () => {
              toast.success("Base dipindahkan ke .trash");
              onDeleted();
            },
            onError: (err) => toast.error("Gagal menghapus base", { description: errorMessage(err) }),
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------- hasil

function BaseResults({
  result,
  base,
  type,
  summaries,
}: {
  result: BaseResult;
  base: BaseData;
  type?: string;
  summaries?: Record<string, string>;
}) {
  if (!result.rows.length) {
    return (
      <Empty className="rounded-2xl border bg-card py-10">
        <EmptyHeader>
          <EmptyDescription>Tidak ada catatan yang cocok dengan filter ini.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const sections = result.groups ?? [{ key: "", value: null, rows: result.rows }];
  const grouped = !!result.groups;
  if (type !== "cards" && type !== "list") {
    return (
      <TableView
        sections={sections}
        grouped={grouped}
        columns={result.columns}
        base={base}
        rows={result.rows}
        summaries={summaries}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <section key={section.key} className="min-w-0">
          {grouped && <GroupTitle value={section.value} count={section.rows.length} />}
          {type === "cards" ? (
            <CardsView rows={section.rows} columns={result.columns} base={base} />
          ) : (
            <ListView rows={section.rows} columns={result.columns} />
          )}
        </section>
      ))}
    </div>
  );
}

function GroupTitle({ value, count }: { value: BaseValue; count: number }) {
  return (
    <span className="text-xs font-bold text-module">
      {formatBaseValue(value) || "(kosong)"} <span className="font-normal text-muted-foreground">· {count}</span>
    </span>
  );
}

/** Kolom pertama yang berupa nama → tautan pembuka catatan. */
const isNameColumn = (id: string) => ["file.name", "file.basename", "file.title"].includes(id);

/** Sel properti catatan yang bisa disunting langsung (bukan properti berkas/rumus/tag, bukan berkas cermin 80-LifeOS). */
const canEditCell = (row: BaseRow, id: string) =>
  id.startsWith("note.") && id !== "note.tags" && row.note.kind === "note" && !isMirrorNote(row.note);

function NoteCell({ row, id }: { row: BaseRow; id: string }) {
  const openNote = useOpenNote();
  const text = formatBaseValue(row.values[id] ?? null);
  if (canEditCell(row, id)) return <EditableCell row={row} id={id} text={text} />;
  if (!isNameColumn(id)) return <>{text}</>;
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 text-left font-medium text-module hover:underline"
      onClick={() => openNote(row.note.id)}
      title={row.note.path}
    >
      <FileText className="size-3.5 shrink-0" />
      <span className="truncate">{text || row.note.title}</span>
    </button>
  );
}

/** Klik sel → isian; Enter / klik di luar = simpan ke properti catatan (frontmatter), Esc = batal. */
function EditableCell({ row, id, text }: { row: BaseRow; id: string; text: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const { setProperties } = useKnowledgeActions();
  const previous = row.values[id] ?? null;
  const name = id.slice("note.".length);
  // tulis dengan nama kunci asli (huruf besar/kecil) bila properti sudah ada
  const key = Object.keys(row.note.properties ?? {}).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;

  const commit = async () => {
    setEditing(false);
    if (draft === cellInputText(previous)) return;
    const next = parseCellInput(draft, previous);
    setSaving(true);
    try {
      const source = await knowledgeApi.source(row.note.id);
      await setProperties.mutateAsync({
        id: row.note.id,
        baseHash: source.hash,
        ...(next === undefined ? { remove: [key] } : { set: { [key]: next } }),
      });
    } catch (error) {
      toast.error("Gagal mengubah properti", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 min-w-28 text-sm"
        aria-label={`Ubah ${name}`}
      />
    );
  }
  return (
    <button
      type="button"
      title="Klik untuk mengubah"
      className={cn(
        "block min-h-5 w-full truncate rounded px-1 text-left hover:bg-muted",
        saving && "opacity-60",
        !text && "text-muted-foreground/50",
      )}
      onClick={() => {
        setDraft(cellInputText(previous));
        setEditing(true);
      }}
    >
      {saving ? "Menyimpan…" : text || "—"}
    </button>
  );
}

/** Satu tabel; bila dikelompokkan, tiap kelompok diawali baris judul (lebar kolom tetap sama). Ringkasan di kaki tabel. */
function TableView({
  sections,
  grouped,
  columns,
  base,
  rows,
  summaries,
}: {
  sections: { key: string; value: BaseValue; rows: BaseRow[] }[];
  grouped: boolean;
  columns: string[];
  base: BaseData;
  rows: BaseRow[];
  summaries?: Record<string, string>;
}) {
  const hasName = columns.some(isNameColumn);
  const span = columns.length + (hasName ? 0 : 1);
  const summaryOf = (id: string) => summaries?.[id] ?? summaries?.[id.replace(/^note\./, "")];
  const showSummary = columns.some((id) => summaryOf(id));
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60 text-xs">
          <tr>
            {!hasName && <th className="px-3 py-2 font-semibold">Catatan</th>}
            {columns.map((id) => (
              <th key={id} className="px-3 py-2 font-semibold whitespace-nowrap">
                {propertyLabel(id, base)}
              </th>
            ))}
          </tr>
        </thead>
        {sections.map((section) => (
          <tbody key={section.key}>
            {grouped && (
              <tr className="border-t bg-module-soft/40">
                <td colSpan={span} className="px-3 py-1.5">
                  <GroupTitle value={section.value} count={section.rows.length} />
                </td>
              </tr>
            )}
            {section.rows.map((row) => (
              <tr key={row.note.id} className="border-t hover:bg-muted/30">
                {!hasName && (
                  <td className="px-3 py-1.5">
                    <NoteCell row={{ ...row, values: { "file.basename": row.note.title } }} id="file.basename" />
                  </td>
                )}
                {columns.map((id) => (
                  <td
                    key={id}
                    className="max-w-72 truncate px-3 py-1.5"
                    title={formatBaseValue(row.values[id] ?? null)}
                  >
                    <NoteCell row={row} id={id} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
        {showSummary && (
          <tfoot className="border-t bg-muted/40 text-xs">
            <tr>
              {!hasName && <td className="px-3 py-1.5" />}
              {columns.map((id) => {
                const kind = summaryOf(id);
                const result = kind
                  ? summarize(
                      rows.map((r) => r.values[id] ?? null),
                      kind,
                    )
                  : null;
                return (
                  <td key={id} className="px-3 py-1.5 whitespace-nowrap">
                    {kind && (
                      <>
                        <span className="text-muted-foreground">{summaryLabel(kind)}</span> <b>{result ?? "—"}</b>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function CardsView({ rows, columns, base }: { rows: BaseRow[]; columns: string[]; base: BaseData }) {
  const openNote = useOpenNote();
  const details = columns.filter((id) => !isNameColumn(id));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <button
          key={row.note.id}
          type="button"
          onClick={() => openNote(row.note.id)}
          className="min-w-0 rounded-2xl border bg-card p-3 text-left hover:border-module/50"
        >
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            <FileText className="size-3.5 shrink-0 text-module" /> {row.note.title}
          </p>
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
            {details.map((id) => (
              <div key={id} className="contents">
                <dt className="text-muted-foreground">{propertyLabel(id, base)}</dt>
                <dd className="truncate">{formatBaseValue(row.values[id] ?? null) || "—"}</dd>
              </div>
            ))}
          </dl>
        </button>
      ))}
    </div>
  );
}

function ListView({ rows, columns }: { rows: BaseRow[]; columns: string[] }) {
  const openNote = useOpenNote();
  const details = columns.filter((id) => !isNameColumn(id));
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {rows.map((row) => (
        <li key={row.note.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
          <button
            type="button"
            onClick={() => openNote(row.note.id)}
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-module hover:underline"
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="truncate">{row.note.title}</span>
          </button>
          {details.map((id) => {
            const text = formatBaseValue(row.values[id] ?? null);
            return text ? (
              <Badge key={id} variant="outline" className="max-w-56 truncate font-normal">
                {text}
              </Badge>
            ) : null;
          })}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- penyunting

function PropertySelect({
  value,
  options,
  base,
  onChange,
  placeholder = "Pilih properti",
  allowNone,
}: {
  value: string;
  options: string[];
  base: BaseData;
  onChange: (value: string) => void;
  placeholder?: string;
  allowNone?: boolean;
}) {
  return (
    <Select value={value || (allowNone ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger size="sm" className="min-w-0 flex-1">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>Tidak ada</SelectItem>}
        {options.map((id) => (
          <SelectItem key={id} value={id}>
            {propertyLabel(id, base)} <span className="text-muted-foreground">({id})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Daftar kondisi filter: ekspresi Bases (bisa disunting langsung) + penyusun kondisi. */
function FilterEditor({
  filter,
  onChange,
  options,
  base,
}: {
  filter: BaseFilter | undefined;
  onChange: (next: BaseFilter | undefined) => void;
  options: string[];
  base: BaseData;
}) {
  const { mode, items } = splitFilter(filter);
  const [property, setProperty] = useState("note.status");
  const [op, setOp] = useState<ConditionOp>("is");
  const [value, setValue] = useState("");
  const opInfo = CONDITION_OPS.find((o) => o.id === op)!;
  const update = (nextItems: BaseFilter[], nextMode = mode) => onChange(joinFilter(nextMode, nextItems));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span>Tampilkan catatan yang cocok dengan</span>
        <Select value={mode} onValueChange={(v) => update(items, v as "and" | "or")}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">semua kondisi</SelectItem>
            <SelectItem value="or">salah satu kondisi</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {items.map((item, i) =>
        typeof item === "string" ? (
          <div key={i} className="flex items-center gap-1">
            <Input
              value={item}
              onChange={(e) => update(items.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-8 font-mono text-xs"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Hapus kondisi"
              onClick={() => update(items.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
        ) : (
          <div key={i} className="flex items-center gap-1 rounded-lg border bg-muted/30 px-2 py-1">
            <code className="min-w-0 flex-1 truncate text-xs">{JSON.stringify(item)}</code>
            <span className="text-[11px] text-muted-foreground">kelompok bersarang (sunting di Obsidian)</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Hapus kondisi"
              onClick={() => update(items.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
        ),
      )}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-dashed p-1.5">
        {opInfo.needsProperty && (
          <PropertySelect value={property} options={options} base={base} onChange={setProperty} />
        )}
        <Select value={op} onValueChange={(v) => setOp(v as ConditionOp)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPS.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {opInfo.needsValue && (
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={op === "hasTag" ? "tag" : op === "inFolder" ? "folder" : "nilai"}
            className="h-8 w-36 flex-1"
          />
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={(opInfo.needsValue && !value.trim()) || (opInfo.needsProperty && !property)}
          onClick={() => {
            update([...items, buildCondition(property, op, value)]);
            setValue("");
          }}
        >
          <Plus /> Tambah
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ekspresi mengikuti sintaks Bases Obsidian, mis. <code>file.mtime &gt; now() - "30d"</code> atau{" "}
        <code>tahun &gt;= 2020</code>.
      </p>
    </div>
  );
}

function ViewEditor({
  view,
  base,
  notes,
  canRemove,
  onSave,
  onRemove,
}: {
  view: BaseView;
  base: BaseData;
  notes: KnowledgeNoteListItem[];
  canRemove: boolean;
  onSave: (view: BaseView) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<BaseView>(() => ({ ...view, order: viewColumns(view) }));
  const options = useMemo(() => availableProperties(notes, base), [notes, base]);
  const order = draft.order ?? [];
  const sort = draft.sort ?? [];
  const set = (patch: Partial<BaseView>) => setDraft((d) => ({ ...d, ...patch }));
  const move = (i: number, by: number) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set({ order: next });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-5 text-module" /> Atur tampilan
        </DialogTitle>
      </DialogHeader>
      <div className="grid max-h-[65svh] grid-cols-1 gap-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <div className="grid gap-1">
            <Label htmlFor="view-name">Nama</Label>
            <Input id="view-name" value={draft.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>Bentuk</Label>
            <Select value={draft.type ?? "table"} onValueChange={(v) => set({ type: v })}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="view-limit">Batas</Label>
            <Input
              id="view-limit"
              type="number"
              min={0}
              className="w-24"
              value={draft.limit ?? ""}
              onChange={(e) => set({ limit: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
            />
          </div>
        </div>

        <section className="grid gap-1.5">
          <Label>Kolom / properti yang ditampilkan</Label>
          {order.map((id, i) => (
            <div key={`${id}-${i}`} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {propertyLabel(id, base)} <span className="text-xs text-muted-foreground">({id})</span>
              </span>
              <Button size="icon-xs" variant="ghost" aria-label="Naik" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Turun"
                disabled={i === order.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Hapus kolom"
                onClick={() => set({ order: order.filter((_, j) => j !== i) })}
              >
                <X />
              </Button>
            </div>
          ))}
          <PropertySelect
            value=""
            placeholder="+ Tambah kolom"
            options={options.filter((o) => !order.includes(o))}
            base={base}
            onChange={(id) => id && set({ order: [...order, id] })}
          />
        </section>

        <section className="grid gap-1.5">
          <Label>Urutkan</Label>
          {sort.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <PropertySelect
                value={s.property}
                options={options}
                base={base}
                onChange={(id) => set({ sort: sort.map((x, j) => (j === i ? { ...x, property: id } : x)) })}
              />
              <Select
                value={(s.direction ?? "ASC").toUpperCase()}
                onValueChange={(v) => set({ sort: sort.map((x, j) => (j === i ? { ...x, direction: v } : x)) })}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASC">Naik (A→Z)</SelectItem>
                  <SelectItem value="DESC">Turun (Z→A)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Hapus urutan"
                onClick={() => set({ sort: sort.filter((_, j) => j !== i) })}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => set({ sort: [...sort, { property: "file.mtime", direction: "DESC" }] })}
          >
            <Plus /> Tambah urutan
          </Button>
        </section>

        <section className="grid gap-1.5">
          <Label>Kelompokkan menurut</Label>
          <div className="flex items-center gap-1">
            <PropertySelect
              value={draft.groupBy?.property ?? ""}
              options={options}
              base={base}
              allowNone
              onChange={(id) =>
                set({ groupBy: id ? { property: id, direction: draft.groupBy?.direction ?? "ASC" } : undefined })
              }
            />
            {draft.groupBy && (
              <Select
                value={(draft.groupBy.direction ?? "ASC").toUpperCase()}
                onValueChange={(v) => set({ groupBy: { ...draft.groupBy!, direction: v } })}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASC">Naik</SelectItem>
                  <SelectItem value="DESC">Turun</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </section>

        {(draft.type ?? "table") === "table" && order.length > 0 && (
          <section className="grid gap-1.5">
            <Label>Ringkasan di kaki tabel</Label>
            {order.map((id) => (
              <div key={id} className="grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-2 text-sm">
                <span className="truncate">{propertyLabel(id, base)}</span>
                <Select
                  value={draft.summaries?.[id] ?? NONE}
                  onValueChange={(v) => {
                    const next = { ...(draft.summaries ?? {}) };
                    if (v === NONE) delete next[id];
                    else next[id] = v;
                    set({ summaries: Object.keys(next).length ? next : undefined });
                  }}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Tidak ada</SelectItem>
                    {SUMMARIES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </section>
        )}

        <section className="grid gap-1.5">
          <Label>Filter tampilan ini</Label>
          <FilterEditor filter={draft.filters} onChange={(f) => set({ filters: f })} options={options} base={base} />
        </section>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {canRemove ? (
          <Button variant="ghost" className="text-destructive" onClick={onRemove}>
            <Trash2 /> Hapus tampilan
          </Button>
        ) : (
          <span />
        )}
        <Button
          onClick={() => {
            const next: BaseView = { ...draft };
            if (!next.sort?.length) delete next.sort;
            if (!next.filters) delete next.filters;
            if (!next.groupBy) delete next.groupBy;
            if (!next.limit) delete next.limit;
            if (!next.summaries) delete next.summaries;
            onSave(next);
          }}
        >
          Simpan tampilan
        </Button>
      </DialogFooter>
    </>
  );
}

function BaseEditor({
  base,
  notes,
  onSave,
}: {
  base: BaseData;
  notes: KnowledgeNoteListItem[];
  onSave: (base: BaseData) => void;
}) {
  const [filters, setFilters] = useState<BaseFilter | undefined>(base.filters);
  const [formulas, setFormulas] = useState<[string, string][]>(() =>
    Object.entries(base.formulas ?? {}).map(([k, v]) => [k, String(v ?? "")]),
  );
  const options = useMemo(
    () => availableProperties(notes, { ...base, formulas: Object.fromEntries(formulas) }),
    [notes, base, formulas],
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Settings2 className="size-5 text-module" /> Filter & rumus base
        </DialogTitle>
      </DialogHeader>
      <div className="grid max-h-[65svh] grid-cols-1 gap-4 overflow-y-auto pr-1">
        <section className="grid gap-1.5">
          <Label>Filter untuk semua tampilan</Label>
          <FilterEditor filter={filters} onChange={setFilters} options={options} base={base} />
        </section>
        <section className="grid gap-1.5">
          <Label>Rumus (kolom hitungan, dipakai sebagai formula.nama)</Label>
          {formulas.map(([name, expr], i) => (
            <div key={i} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-1">
              <Input
                value={name}
                placeholder="nama"
                onChange={(e) =>
                  setFormulas((f) =>
                    f.map((x, j) => (j === i ? [e.target.value.replace(/[^\p{L}\p{N}_]/gu, ""), x[1]] : x)),
                  )
                }
                className="h-8"
              />
              <Input
                value={expr}
                placeholder='mis. 2026 - tahun  ·  if(status == "berlaku", "Ya", "Tidak")'
                onChange={(e) => setFormulas((f) => f.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}
                className="h-8 font-mono text-xs"
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Hapus rumus"
                onClick={() => setFormulas((f) => f.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => setFormulas((f) => [...f, [`rumus${f.length + 1}`, ""]])}
          >
            <Plus /> Tambah rumus
          </Button>
        </section>
      </div>
      <DialogFooter>
        <Button
          onClick={() => {
            const named = formulas.filter(([k, v]) => k && v.trim());
            const next: BaseData = { ...base, filters };
            if (!filters) delete next.filters;
            if (named.length) next.formulas = Object.fromEntries(named);
            else delete next.formulas;
            onSave(next);
          }}
        >
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Sematan `![[nama.base]]` / `![[nama.base#Tampilan]]` di catatan (seperti Obsidian): tampilan base dirender di dalam catatan,
 * dengan tombol membuka base di tab Bases.
 */
export function EmbeddedBase({ target }: { target: string }) {
  const { data: list, isLoading: listLoading } = useKnowledgeBases();
  const [file, viewName] = target.split("#");
  const wanted = file.trim().toLowerCase();
  const match = list?.find(
    (b) => b.path.toLowerCase() === wanted || `${b.name}.base`.toLowerCase() === wanted.split("/").pop(),
  );
  const { data, isLoading } = useKnowledgeBase(match?.path ?? null);
  const { data: tree } = useKnowledgeTree();
  const navigate = useNavigate();
  const today = useToday();
  const base = useMemo(() => (data?.data ?? {}) as BaseData, [data]);
  const views: BaseView[] = Array.isArray(base.views) && base.views.length ? base.views : [{ type: "table" }];
  const index = Math.max(
    0,
    views.findIndex((v) => viewName && (v.name ?? "").toLowerCase() === viewName.trim().toLowerCase()),
  );
  const view = views[index];
  const result = useMemo(() => applyView(tree?.notes ?? [], base, view, today), [tree, base, view, today]);

  if (listLoading || isLoading) return <Spinner className="my-2" />;
  if (!match) return <span className="text-xs text-warning">Base tidak ditemukan: {file}</span>;
  return (
    <div className="my-3 rounded-xl border-l-4 border-module/40 bg-muted/30 p-2">
      <button
        type="button"
        className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-module hover:underline"
        onClick={() =>
          void navigate(`/knowledge/bases?base=${encodeURIComponent(match.path)}${index ? `&view=${index}` : ""}`)
        }
      >
        <Database className="size-3.5" /> {match.name}
        {view.name ? ` › ${view.name}` : ""} · {result.total} catatan
      </button>
      <div className="max-h-[420px] overflow-y-auto">
        <BaseResults result={result} base={base} type={view.type} summaries={view.summaries} />
      </div>
    </div>
  );
}

export default EmbeddedBase;
