import {
  Archive,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Grid2x2,
  History,
  Layers,
  Link2,
  type LucideIcon,
  RotateCcw,
  ScrollText,
  Tag,
  UserRound,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DateRangeFilter } from "@/components/common/date-range-filter";
import { type PageSize, PaginationControl, paginate } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAreas, useParaArchiveLogs, useParaArchives } from "@/data/collections";
import { usePermissions } from "@/hooks/use-permissions";
import { useToday } from "@/hooks/use-today";
import { DEFAULT_DATE_FILTER, matchesDateFilter } from "@/lib/date-filter";
import { formatDateTime, formatRelative, formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Activity, Area, ParaArchive, ParaArchiveLog, Project, Resource } from "@/types/entities";
import { activityDepth, AREA_LEVELS, PARA_INFO } from "../lib/para";
import { archiveTitle, relatedSummary } from "../lib/para-archive";
import { useParaActions } from "../use-para-actions";
import { ParaInfo } from "./para-info";

type TypeFilter = "all" | "project" | "area" | "resource";
type View = "archives" | "log";
type ActionFilter = "all" | ParaArchiveLog["action"];

const TYPES: { value: TypeFilter; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "Semua", icon: Archive },
  { value: "project", label: "Project", icon: Layers },
  { value: "area", label: "Area", icon: Grid2x2 },
  { value: "resource", label: "Resource", icon: BookOpen },
];
const TYPE_META: Record<string, { label: string; icon: LucideIcon; style: string }> = {
  project: { label: "Project", icon: Layers, style: "bg-primary/12 text-primary" },
  area: { label: "Area", icon: Grid2x2, style: "bg-success/15 text-success" },
  resource: { label: "Resource", icon: BookOpen, style: "bg-mod-notes/15 text-mod-notes" },
};
const typeMeta = (type: string) => TYPE_META[type] ?? { label: type, icon: Archive, style: "bg-muted" };

const ACTION_META: Record<ParaArchiveLog["action"], { label: string; icon: LucideIcon; style: string }> = {
  archived: { label: "Diarsipkan", icon: Archive, style: "bg-warning/15 text-warning" },
  restored: { label: "Dipulihkan", icon: RotateCcw, style: "bg-success/15 text-success" },
};

export function ArchivesTab() {
  const today = useToday();
  const { items: archives } = useParaArchives();
  const { items: logs } = useParaArchiveLogs();
  const { items: areas } = useAreas();
  const { canEdit } = usePermissions();
  const actions = useParaActions();
  const [view, setView] = useState<View>("archives");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(DEFAULT_DATE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [restoring, setRestoring] = useState<ParaArchive | null>(null);

  const query = search.toLowerCase();
  const byType = <T extends { originalType: string }>(items: T[], type: TypeFilter) =>
    type === "all" ? items : items.filter((i) => i.originalType === type);

  const filteredArchives = byType(archives, typeFilter)
    .filter((a) => !query || archiveTitle(a).toLowerCase().includes(query))
    .filter((a) => matchesDateFilter(a.archivedAt, dateFilter, today))
    .sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
  const filteredLogs = byType(logs, typeFilter)
    .filter((l) => actionFilter === "all" || l.action === actionFilter)
    .filter((l) => !query || l.title.toLowerCase().includes(query))
    .filter((l) => matchesDateFilter(l.at, dateFilter, today))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const total = view === "archives" ? filteredArchives.length : filteredLogs.length;

  // Aksi terakhir yang mengarsipkan tiap entri (untuk menampilkan pelakunya)
  const archivedBy = new Map(logs.filter((l) => l.action === "archived").map((l) => [l.archiveId, l]));
  const resetPage = () => setPage(1);

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Filter ringkas */}
      <Card className="h-fit w-full shrink-0 gap-0 py-3 md:w-44">
        <CardContent className="flex flex-col gap-0.5 px-2">
          <h4 className="mb-1 px-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Jenis</h4>
          {TYPES.map(({ value, label, icon: Icon }) => {
            const count = view === "archives" ? byType(archives, value).length : byType(logs, value).length;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTypeFilter(value);
                  resetPage();
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors",
                  typeFilter === value
                    ? "bg-module text-module-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                <span className="tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <ParaInfo icon={Archive} {...PARA_INFO.archives} />
        <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
          <ToggleGroup
            type="single"
            variant="outline"
            value={view}
            onValueChange={(v) => {
              if (!v) return;
              setView(v as View);
              resetPage();
            }}
          >
            <ToggleGroupItem value="archives">
              <Archive /> Arsip ({archives.length})
            </ToggleGroupItem>
            <ToggleGroupItem value="log">
              <ScrollText /> Log Arsip & Pemulihan ({logs.length})
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            {view === "log" && (
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={actionFilter}
                onValueChange={(v) => {
                  if (!v) return;
                  setActionFilter(v as ActionFilter);
                  resetPage();
                }}
              >
                <ToggleGroupItem value="all">Semua</ToggleGroupItem>
                <ToggleGroupItem value="archived">Diarsipkan</ToggleGroupItem>
                <ToggleGroupItem value="restored">Dipulihkan</ToggleGroupItem>
              </ToggleGroup>
            )}
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                resetPage();
              }}
              placeholder={view === "archives" ? "Cari dalam arsip..." : "Cari dalam log..."}
              className="md:w-56"
            />
            <DateRangeFilter
              value={dateFilter}
              onChange={(v) => {
                setDateFilter(v);
                resetPage();
              }}
            />
          </div>
        </div>

        {total === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-muted text-muted-foreground">
                {view === "archives" ? <Archive /> : <ScrollText />}
              </EmptyMedia>
              <EmptyDescription>
                {view === "archives"
                  ? "Tidak ada item arsip yang sesuai filter."
                  : "Belum ada riwayat arsip/pemulihan yang sesuai filter."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : view === "archives" ? (
          <ul className="flex flex-col gap-2.5">
            {paginate(filteredArchives, page, pageSize).map((item) => (
              <ArchiveCard
                key={item.id}
                item={item}
                areas={areas}
                archivedBy={archivedBy.get(item.id)?.actorName}
                now={today}
                onRestore={canEdit ? () => setRestoring(item) : undefined}
              />
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {paginate(filteredLogs, page, pageSize).map((log) => (
              <LogRow key={log.id} log={log} now={today} />
            ))}
          </ul>
        )}
        <PaginationControl
          totalItems={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(open) => !open && setRestoring(null)}
        title="Aktifkan Kembali?"
        description={
          restoring && relatedSummary(restoring)
            ? `Item ini beserta ${relatedSummary(restoring)} di dalamnya akan dipulihkan dan kembali aktif di daftar utama.`
            : "Item ini akan dipulihkan dan kembali aktif di daftar utama."
        }
        itemName={restoring ? archiveTitle(restoring) : undefined}
        confirmLabel="Pulihkan"
        destructive={false}
        onConfirm={() => {
          if (restoring) actions.restore(restoring);
          setRestoring(null);
        }}
      />
    </div>
  );
}

// ============================================================================
// Kartu arsip
// ============================================================================

function MetaItem({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Informasi khusus per jenis item (area asal, periode, tipe resource, tag, ...). */
function archiveMeta(item: ParaArchive, areas: Area[]) {
  const meta: { icon: LucideIcon; text: string }[] = [];
  if (item.originalType === "project") {
    const p = item.data as unknown as Project;
    const area = p.areaId ? areas.find((a) => a.id === p.areaId) : undefined;
    meta.push({
      icon: Grid2x2,
      text: area ? `Area: ${area.title}` : p.areaId ? "Area asal tidak aktif" : "Free Project",
    });
    if (p.startDate || p.deadline) {
      const start = p.startDate ? formatShortDate(p.startDate) : "?";
      const end = p.deadline ? formatShortDate(p.deadline) : "?";
      meta.push({ icon: CalendarDays, text: `${start} – ${end}` });
    }
  } else if (item.originalType === "resource") {
    const r = item.data as unknown as Resource;
    meta.push({ icon: BookOpen, text: `Tipe: ${r.type ?? "-"}` });
    if (r.url) {
      let host = r.url;
      try {
        host = new URL(r.url).hostname;
      } catch {
        // URL tidak valid → tampilkan apa adanya
      }
      meta.push({ icon: Link2, text: host });
    }
    const tags = r.tags?.length ? r.tags : r.sourceTag ? [r.sourceTag] : [];
    if (tags.length) meta.push({ icon: Tag, text: tags.join(", ") });
  }
  return meta;
}

function ArchiveCard({
  item,
  areas,
  archivedBy,
  now,
  onRestore,
}: {
  item: ParaArchive;
  areas: Area[];
  archivedBy?: string;
  now: Date;
  onRestore?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const type = typeMeta(item.originalType);
  const description = typeof item.data.description === "string" ? item.data.description : "";
  const tasks = item.related?.tasks ?? [];
  const done = tasks.filter((t) => t.completed).length;
  const summary = relatedSummary(item);
  const hasContents = !!(item.related?.projects?.length || item.related?.activities?.length || tasks.length);
  const meta = archiveMeta(item, areas);

  return (
    <li className="rounded-2xl border bg-card transition-shadow hover:shadow-md">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <Badge className={cn("gap-1 uppercase", type.style)}>
                <type.icon className="size-3" /> {type.label}
              </Badge>
              <span className="flex items-center gap-1" title={formatDateTime(item.archivedAt)}>
                <History className="size-3" /> Diarsipkan {formatDateTime(item.archivedAt)} ·{" "}
                {formatRelative(item.archivedAt, now)}
              </span>
              {archivedBy && (
                <span className="flex items-center gap-1">
                  <UserRound className="size-3" /> {archivedBy}
                </span>
              )}
            </div>
            <h4 className="truncate text-base font-bold">{archiveTitle(item)}</h4>
            {description && <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>}
            {meta.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {meta.map((m) => (
                  <MetaItem key={m.text} icon={m.icon}>
                    {m.text}
                  </MetaItem>
                ))}
              </div>
            )}
            {(summary || tasks.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                {summary && <span className="font-medium text-muted-foreground">Termasuk: {summary}</span>}
                {tasks.length > 0 && (
                  <span className="flex items-center gap-2">
                    <Progress
                      value={(done / tasks.length) * 100}
                      className="h-1.5 w-24"
                      indicatorClassName="bg-success"
                    />
                    <span className="text-muted-foreground tabular-nums">
                      {done}/{tasks.length} {item.originalType === "project" ? "action" : "task"} selesai
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2 md:flex-col md:items-end">
            {onRestore && (
              <Button variant="secondary" size="sm" onClick={onRestore}>
                <RotateCcw /> Pulihkan
              </Button>
            )}
            {hasContents && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                  {open ? "Sembunyikan isi" : "Lihat isi"}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        {hasContents && (
          <CollapsibleContent>
            <ArchiveContents item={item} />
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  );
}

const MAX_TASKS_SHOWN = 30;

/** Isi arsip: project, struktur sub area/kegiatan/sub kegiatan, dan daftar task. */
function ArchiveContents({ item }: { item: ParaArchive }) {
  const projects = item.related?.projects ?? [];
  const activities = item.related?.activities ?? [];
  const tasks = item.related?.tasks ?? [];
  const parentName = new Map<string, string>([
    ...projects.map((p) => [p.id, p.title] as const),
    ...activities.map((a) => [a.id, a.title] as const),
  ]);
  // Urutkan struktur area sebagai pohon (induk diikuti turunannya)
  const ordered: Activity[] = [];
  const walk = (parentId?: string) => {
    for (const a of activities.filter((x) => (x.parentId ?? undefined) === parentId)) {
      if (ordered.includes(a)) continue;
      ordered.push(a);
      walk(a.id);
    }
  };
  walk(undefined);
  for (const a of activities) if (!ordered.includes(a)) ordered.push(a); // induk tidak ikut diarsipkan

  return (
    <div className="grid gap-4 border-t bg-muted/30 p-4 text-xs md:grid-cols-2">
      {projects.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h5 className="font-bold tracking-wider text-muted-foreground uppercase">Project ({projects.length})</h5>
          <ul className="flex flex-col gap-1">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5">
                <Layers className="size-3 text-primary" /> {p.title}
              </li>
            ))}
          </ul>
        </section>
      )}
      {ordered.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h5 className="font-bold tracking-wider text-muted-foreground uppercase">Struktur Area</h5>
          <ul className="flex flex-col gap-1">
            {ordered.map((a) => {
              const depth = activityDepth(activities, a);
              return (
                <li key={a.id} className="flex items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {AREA_LEVELS[depth]}
                  </Badge>
                  <span className="truncate">{a.title}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {tasks.length > 0 && (
        <section className="flex flex-col gap-1.5 md:col-span-2">
          <h5 className="font-bold tracking-wider text-muted-foreground uppercase">
            {item.originalType === "project" ? "Action" : "Task"} ({tasks.length})
          </h5>
          <ul className="grid gap-1 md:grid-cols-2">
            {tasks.slice(0, MAX_TASKS_SHOWN).map((t) => (
              <li key={t.id} className="flex min-w-0 items-center gap-1.5">
                {t.completed ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                ) : (
                  <Circle className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className={cn("truncate", t.completed && "text-muted-foreground line-through")}>{t.title}</span>
                {item.originalType !== "project" && parentName.get(t.projectId) && (
                  <span className="shrink-0 text-muted-foreground">· {parentName.get(t.projectId)}</span>
                )}
                {t.dueDate && <span className="shrink-0 text-muted-foreground">· {formatShortDate(t.dueDate)}</span>}
              </li>
            ))}
          </ul>
          {tasks.length > MAX_TASKS_SHOWN && (
            <p className="text-muted-foreground italic">dan {tasks.length - MAX_TASKS_SHOWN} lainnya…</p>
          )}
        </section>
      )}
    </div>
  );
}

// ============================================================================
// Baris log
// ============================================================================

function LogRow({ log, now }: { log: ParaArchiveLog; now: Date }) {
  const action = ACTION_META[log.action] ?? ACTION_META.archived;
  const type = typeMeta(log.originalType);
  return (
    <li className="flex items-start gap-3 p-3.5">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", action.style)}>
        <action.icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-bold">{action.label}</span>
          <Badge className={cn("gap-1 uppercase", type.style)}>
            <type.icon className="size-3" /> {type.label}
          </Badge>
          <span className="min-w-0 truncate font-medium">{log.title}</span>
        </p>
        {log.summary && <p className="mt-0.5 text-xs text-muted-foreground">Termasuk: {log.summary}</p>}
      </div>
      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
        <p title={formatDateTime(log.at)}>{formatRelative(log.at, now)}</p>
        <p>{formatDateTime(log.at)}</p>
        {log.actorName && (
          <p className="flex items-center justify-end gap-1">
            <UserRound className="size-3" /> {log.actorName}
          </p>
        )}
      </div>
    </li>
  );
}
