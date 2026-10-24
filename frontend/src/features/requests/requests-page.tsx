import { Bot, FileText, Inbox, Paperclip, Plus } from "lucide-react";
import { useState } from "react";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { ModulePage } from "@/components/layout/module-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequests } from "@/data/use-requests";
import { usePagination } from "@/hooks/use-pagination";
import { useSearchParam } from "@/hooks/use-search-param";
import { formatDateTime, formatShortDate, parseLocalYMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { RequestKind, RequestSummary } from "@/types/api";
import { CreateRequestDialog } from "./create-request-dialog";
import { RequestDetailDialog } from "./request-detail-dialog";
import { filterRequests, KIND_LABELS, KIND_OPTIONS, STATUS_LABELS, STATUS_TONE, TAB_STATUSES } from "./request-utils";

/**
 * Pengajuan satker & Antrian Verifikasi (docs/AI-AGENT.md tahap 4): pengajuan dicatat manual atau oleh agen (MCP),
 * dianalisis & dikonsep AI, lalu diputuskan pengguna. `?request=<id>` membuka detail, `?request=new` formulir baru.
 */
export function Component() {
  const [requestParam, setRequestParam] = useSearchParam("request");
  const { data } = useRequests();
  const queueCount = data?.filter((r) => TAB_STATUSES.queue.includes(r.status)).length ?? 0;
  const waiting = data?.filter((r) => r.status === "menunggu_verifikasi").length ?? 0;
  return (
    <ModulePage
      module="requests"
      actions={
        <Button variant="secondary" onClick={() => setRequestParam("new", { replace: false })}>
          <Plus /> Pengajuan Baru
        </Button>
      }
      meta={
        data && (
          <>
            <Badge className="bg-white/20 text-white">{queueCount} dalam antrian</Badge>
            {waiting > 0 && <Badge className="bg-white/20 text-white">{waiting} menunggu verifikasi</Badge>}
          </>
        )
      }
    >
      {(tab) => (
        <>
          <RequestList
            tab={tab === "done" ? "done" : "queue"}
            onOpen={(id) => setRequestParam(id, { replace: false })}
          />
          <CreateRequestDialog
            open={requestParam === "new"}
            onOpenChange={(open) => !open && setRequestParam(null)}
            onCreated={(id) => setRequestParam(id)}
          />
          <RequestDetailDialog
            requestId={requestParam && requestParam !== "new" ? requestParam : null}
            onClose={() => setRequestParam(null)}
          />
        </>
      )}
    </ModulePage>
  );
}

function RequestList({ tab, onOpen }: { tab: "queue" | "done"; onOpen: (id: string) => void }) {
  const { data, isLoading } = useRequests();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<RequestKind | "all">("all");
  const items = filterRequests(data ?? [], { tab, kind, query });
  const { pageItems, setPage, controlProps } = usePagination(items, 10);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Cari judul, satker, nomor surat…"
          className="md:w-80"
        />
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v as RequestKind | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis</SelectItem>
            {KIND_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Inbox className="size-8 text-module" />
          {query || kind !== "all"
            ? "Tidak ada pengajuan yang cocok."
            : tab === "queue"
              ? "Antrian kosong. Catat pengajuan baru, atau minta agen (MCP) mencatatnya."
              : "Belum ada pengajuan yang selesai."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {pageItems.map((r) => (
            <RequestRow key={r.id} request={r} onOpen={() => onOpen(r.id)} />
          ))}
        </div>
      )}
      <PaginationControl {...controlProps} />
    </div>
  );
}

function RequestRow({ request: r, onOpen }: { request: RequestSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-xl border bg-card p-3 text-left transition-colors hover:border-module/40 hover:bg-module-soft"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-module-soft text-module">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate font-semibold">{r.title}</span>
          <Badge className={cn("shrink-0", STATUS_TONE[r.status])}>{STATUS_LABELS[r.status]}</Badge>
          {r.source !== "manual" && (
            <Badge variant="outline" className="shrink-0 gap-1">
              <Bot className="size-3" /> {r.source === "mcp" ? "Agen" : "WhatsApp"}
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {[
            KIND_LABELS[r.kind],
            r.satker,
            r.letterNumber,
            r.letterDate && formatShortDate(parseLocalYMD(r.letterDate)),
            r.subject,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>Diperbarui {formatDateTime(r.updatedAt)}</span>
          {r.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" /> {r.attachments.length} berkas
            </span>
          )}
          {r.documents.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" /> {r.documents.length} dokumen
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
