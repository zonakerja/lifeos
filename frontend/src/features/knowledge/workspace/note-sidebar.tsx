import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronRight,
  FilePlus2,
  Link2,
  ListTree,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Unlink,
  Waypoints,
  X,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/common/markdown";
import { TagInput } from "@/components/common/tag-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAddToKnowledgeInbox, useKnowledgeNote } from "@/data/use-knowledge";
import {
  useKnowledgeActions,
  useKnowledgeGraph,
  useKnowledgeSource,
  useKnowledgeUnlinked,
} from "@/data/use-knowledge-workspace";
import { useSearchParam } from "@/hooks/use-search-param";
import { useAi, AI_NOT_CONFIGURED } from "@/lib/ai/use-ai";
import { ApiError, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { KnowledgeNoteListItem } from "@/types/api";
import { isMirrorNote, localGraph, outline, propertyKind, propertyText } from "./knowledge-logic";
import { openWorkspaceDialog, useOpenNote } from "./workspace-store";
import { statusColorVar } from "./graph-colors";

const GraphCanvas = lazy(() => import("./graph-canvas"));

function Section({
  title,
  icon: Icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: typeof Link2;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        <Icon className="size-3.5" />
        <span className="flex-1 text-left">{title}</span>
        {count !== undefined && <span className="tabular-nums">{count}</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

/** Panel kanan catatan: Properti, Garis besar, Backlink, Sebutan tanpa tautan, Tautan keluar, Graf lokal, Tanya AI. */
export function NoteSidebar({ id, notes }: { id: string; notes: KnowledgeNoteListItem[] }) {
  const { data: note } = useKnowledgeNote(id);
  const openNote = useOpenNote();
  const [, setHeading] = useSearchParam("h");
  if (!note) return null;
  const items = note.kind === "note" ? outline(note.content ?? "") : [];
  const backlinks = [...new Map(note.backlinks.map((b) => [b.note.id, b])).values()];
  const resolved = [...new Map(note.linksOut.filter((l) => l.note).map((l) => [l.note!.id, l])).values()];
  const missing = [...new Set(note.linksOut.filter((l) => !l.note && l.kind !== "embed").map((l) => l.target))];

  return (
    <div className="flex flex-col">
      {note.kind === "note" && (
        <Section title="Properti" icon={SlidersHorizontal}>
          <PropertiesPanel id={id} notes={notes} />
        </Section>
      )}
      {items.length > 0 && (
        <Section title="Garis besar" icon={ListTree} count={items.length}>
          <ul className="flex flex-col gap-0.5">
            {items.map((h) => (
              <li key={h.id} style={{ paddingLeft: (h.level - 1) * 10 }}>
                <button
                  type="button"
                  className="w-full truncate text-left text-xs hover:text-module"
                  onClick={() => setHeading(h.id)}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Backlink" icon={ArrowLeft} count={backlinks.length}>
        {backlinks.length ? (
          <NoteRefs items={backlinks.map((b) => b.note)} onOpen={openNote} />
        ) : (
          <p className="text-xs text-muted-foreground">Belum ada catatan yang menautkan ke sini.</p>
        )}
      </Section>
      {note.kind === "note" && (
        <Section title="Sebutan tanpa tautan" icon={Unlink} defaultOpen={false}>
          <UnlinkedMentions id={id} />
        </Section>
      )}
      <Section title="Tautan keluar" icon={ArrowRight} count={resolved.length + missing.length}>
        {resolved.length > 0 && <NoteRefs items={resolved.map((l) => l.note!)} onOpen={openNote} />}
        {missing.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-[11px] text-warning">Belum ada catatannya:</p>
            {missing.map((target) => (
              <button
                key={target}
                type="button"
                className="flex items-center gap-1.5 truncate text-left text-xs text-muted-foreground hover:text-module"
                onClick={() => openWorkspaceDialog({ kind: "new-note", title: target })}
              >
                <FilePlus2 className="size-3 shrink-0" /> {target}
              </button>
            ))}
          </div>
        )}
        {!resolved.length && !missing.length && (
          <p className="text-xs text-muted-foreground">Tidak ada tautan keluar.</p>
        )}
      </Section>
      <Section title="Graf lokal" icon={Waypoints}>
        <LocalGraph id={id} />
      </Section>
      {note.kind === "note" && (
        <Section title="Tanya AI tentang catatan ini" icon={Sparkles} defaultOpen={false}>
          <AskNote title={note.title} path={note.path} content={note.content ?? ""} />
        </Section>
      )}
    </div>
  );
}

function NoteRefs({
  items,
  onOpen,
}: {
  items: { id: string; title: string; path: string }[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            className="flex w-full min-w-0 flex-col text-left hover:text-module"
            onClick={() => onOpen(n.id)}
          >
            <span className="truncate text-xs font-medium">{n.title}</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{n.path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function UnlinkedMentions({ id }: { id: string }) {
  const { data, isLoading } = useKnowledgeUnlinked(id);
  const { linkMention } = useKnowledgeActions();
  const openNote = useOpenNote();
  if (isLoading) return <Spinner />;
  if (!data?.length)
    return <p className="text-xs text-muted-foreground">Tidak ada catatan yang menyebut judul ini tanpa tautan.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {data.map((m) => (
        <li key={m.id} className="rounded-lg border p-2">
          <button
            type="button"
            className="truncate text-xs font-medium hover:text-module"
            onClick={() => openNote(m.id)}
          >
            {m.title}
          </button>
          <p className="mt-0.5 line-clamp-3 text-[11px] text-muted-foreground">{m.snippet}</p>
          <Button
            size="xs"
            variant="outline"
            className="mt-1"
            disabled={linkMention.isPending}
            onClick={() =>
              linkMention.mutate(
                { id, sourceId: m.id },
                {
                  onSuccess: () => toast.success(`Sebutan di "${m.title}" ditautkan.`),
                  onError: (error) => toast.error("Gagal menautkan", { description: errorMessage(error) }),
                },
              )
            }
          >
            <Link2 /> Tautkan
          </Button>
        </li>
      ))}
    </ul>
  );
}

function LocalGraph({ id }: { id: string }) {
  const { data: graph } = useKnowledgeGraph();
  const openNote = useOpenNote();
  const [depth, setDepth] = useState(1);
  const subset = useMemo(() => {
    if (!graph) return null;
    const ids = localGraph(graph, id, depth);
    const nodes = [
      ...graph.nodes
        .filter((n) => ids.has(n.id))
        .map((n) => ({
          id: n.id,
          label: n.title,
          weight: n.backlinks,
          colorVar: statusColorVar(n.status),
          variant: n.kind === "file" ? ("file" as const) : ("note" as const),
        })),
      ...graph.missing
        .filter((m) => ids.has(m.id))
        .map((m) => ({ id: m.id, label: m.title, weight: 0, variant: "missing" as const })),
    ];
    return { nodes, edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [graph, id, depth]);
  if (!subset) return <Spinner />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        Kedalaman
        {[1, 2, 3].map((d) => (
          <Button key={d} size="xs" variant={d === depth ? "default" : "outline"} onClick={() => setDepth(d)}>
            {d}
          </Button>
        ))}
        <span className="ml-auto">{subset.nodes.length} catatan</span>
      </div>
      <div className="rounded-lg border bg-muted/20">
        <Suspense fallback={<Spinner className="m-4" />}>
          <GraphCanvas
            nodes={subset.nodes}
            edges={subset.edges}
            focusId={id}
            height={220}
            showLabels="always"
            forces={{ distance: 30 }}
            onNodeClick={(nodeId) =>
              nodeId.startsWith("missing:")
                ? openWorkspaceDialog({ kind: "new-note", title: subset.nodes.find((n) => n.id === nodeId)?.label })
                : openNote(nodeId)
            }
          />
        </Suspense>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ["berlaku", "draf", "dicabut"];

/** Properti catatan (frontmatter berkas) sebagai formulir; setiap ubahan langsung ditulis ke berkas (cek hash). */
function PropertiesPanel({ id, notes }: { id: string; notes: KnowledgeNoteListItem[] }) {
  const { data: source, refetch } = useKnowledgeSource(id);
  const { setProperties } = useKnowledgeActions();
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const jenisOptions = useMemo(
    () => [...new Set(notes.map((n) => n.jenis).filter((j): j is string => !!j))].sort(),
    [notes],
  );
  const tagOptions = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes]);
  if (!source) return <Spinner />;
  const entries = Object.entries(source.frontmatter ?? {});
  const item = notes.find((n) => n.id === id);
  if (item && isMirrorNote(item)) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-muted-foreground">Cermin LifeOS — properti dibuat otomatis (baca saja).</p>
        {entries.map(([key, value]) => (
          <p key={key} className="flex min-w-0 gap-2 text-xs">
            <span className="w-24 shrink-0 truncate font-mono text-muted-foreground">{key}</span>
            <span className="min-w-0 flex-1 truncate" title={String(value)}>
              {Array.isArray(value) ? value.join(", ") : String(value)}
            </span>
          </p>
        ))}
      </div>
    );
  }

  const commit = async (set: Record<string, unknown>, remove: string[] = []) => {
    try {
      await setProperties.mutateAsync({ id, set, remove, baseHash: source.hash });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.warning("Catatan berubah di tempat lain — properti dimuat ulang, silakan ulangi.");
        void refetch();
      } else toast.error("Gagal menyimpan properti", { description: errorMessage(error) });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 && <p className="text-xs text-muted-foreground">Belum ada properti.</p>}
      {entries.map(([key, value]) => (
        <PropertyRow
          key={`${key}-${source.hash}`}
          name={key}
          value={value}
          jenisOptions={jenisOptions}
          tagOptions={tagOptions}
          disabled={setProperties.isPending}
          onCommit={(next) => void commit({ [key]: next })}
          onRemove={() => void commit({}, [key])}
        />
      ))}
      <form
        className="mt-1 flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const key = newKey.trim().replace(/\s+/g, "_");
          if (!key || !newValue.trim()) return;
          void commit({ [key]: newValue.trim() }).then(() => {
            setNewKey("");
            setNewValue("");
          });
        }}
      >
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="properti"
          className="h-7 w-24 text-xs"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="nilai"
          className="h-7 flex-1 text-xs"
        />
        <Button
          type="submit"
          size="icon-xs"
          variant="outline"
          aria-label="Tambah properti"
          disabled={!newKey.trim() || !newValue.trim()}
        >
          <Plus />
        </Button>
      </form>
    </div>
  );
}

function PropertyRow({
  name,
  value,
  jenisOptions,
  tagOptions,
  disabled,
  onCommit,
  onRemove,
}: {
  name: string;
  value: unknown;
  jenisOptions: string[];
  tagOptions: string[];
  disabled: boolean;
  onCommit: (value: unknown) => void;
  onRemove: () => void;
}) {
  const kind = propertyKind(name, value);
  const [draft, setDraft] = useState(propertyText(value));
  const list = Array.isArray(value)
    ? value.map(propertyText)
    : propertyText(value)
      ? propertyText(value)
          .split(",")
          .map((s) => s.trim())
      : [];
  const listId = `kn-prop-${name}`;

  let editor: ReactNode;
  if (kind === "boolean") {
    editor = (
      <Switch checked={value === true || value === "true"} disabled={disabled} onCheckedChange={(v) => onCommit(v)} />
    );
  } else if (kind === "list") {
    editor = (
      <TagInput
        value={list}
        suggestions={name === "tags" || name === "tag" ? tagOptions : []}
        disabled={disabled}
        onAdd={(raw) =>
          onCommit([
            ...new Set([
              ...list,
              ...raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            ]),
          ])
        }
        onRemove={(tag) => onCommit(list.filter((t) => t !== tag))}
        placeholder="Tambah…"
      />
    );
  } else if (name === "status") {
    editor = (
      <Select value={draft} disabled={disabled} onValueChange={(v) => onCommit(v)}>
        <SelectTrigger size="sm" className="h-7 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[...new Set([...STATUS_OPTIONS, draft])].filter(Boolean).map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else {
    const save = () => {
      const next = draft.trim();
      if (next === propertyText(value)) return;
      onCommit(kind === "number" && next !== "" && !Number.isNaN(Number(next)) ? Number(next) : next);
    };
    editor = (
      <>
        <Input
          type={kind === "date" ? "date" : "text"}
          value={draft}
          disabled={disabled}
          list={name === "jenis" ? listId : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
          className="h-7 text-xs"
        />
        {name === "jenis" && (
          <datalist id={listId}>
            {jenisOptions.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <div className="group grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-1.5">
      <span className="truncate text-[11px] font-medium text-muted-foreground" title={name}>
        {name}
      </span>
      <div className="min-w-0">{editor}</div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Hapus properti ${name}`}
        className="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
        disabled={disabled}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}

/** Tanya AI dengan isi catatan ini sebagai konteks (provider Pengaturan → Model AI); jawaban bisa disimpan ke Inbox. */
function AskNote({ title, path, content }: { title: string; path: string; content: string }) {
  const ai = useAi();
  const inbox = useAddToKnowledgeInbox();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (!ai.isConfigured) return toast.error(AI_NOT_CONFIGURED);
    setBusy(true);
    try {
      const prompt = [
        "Anda membantu pemilik basis pengetahuan memahami satu catatan. Jawab dalam Bahasa Indonesia, ringkas dan tepat.",
        "Gunakan hanya isi catatan di bawah; bila jawabannya tidak ada di catatan, katakan terus terang.",
        `<catatan judul="${title}" path="${path}">`,
        content.slice(0, 60_000),
        "</catatan>",
        `Pertanyaan: ${question.trim()}`,
      ].join("\n");
      setAnswer(await ai.generate(prompt));
    } catch (error) {
      toast.error("AI gagal menjawab", { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Mis. Apa syarat utama yang diatur di catatan ini?"
        className="min-h-16 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void ask();
        }}
      />
      <Button size="sm" disabled={!question.trim() || busy} onClick={() => void ask()}>
        {busy ? <Spinner /> : <Bot />} Tanya
      </Button>
      {answer && (
        <div className="rounded-lg border bg-muted/30 p-2">
          <Markdown content={answer} className="text-xs" />
          <Button
            size="xs"
            variant="outline"
            className="mt-2"
            disabled={inbox.isPending}
            onClick={() =>
              inbox.mutate(
                { title: `Tanya: ${title}`, content: answer, question },
                {
                  onSuccess: (r) => toast.success(`Disimpan ke ${r.path}`),
                  onError: (error) => toast.error("Gagal menyimpan", { description: errorMessage(error) }),
                },
              )
            }
          >
            <Badge variant="secondary" className="mr-0.5">
              Inbox
            </Badge>
            Simpan jawaban
          </Button>
        </div>
      )}
    </div>
  );
}
