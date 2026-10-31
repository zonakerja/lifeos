import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BotMessageSquare,
  CircleAlert,
  CircleCheck,
  Loader2,
  MessageSquarePlus,
  SendHorizontal,
  Sparkles,
  Square,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/common/markdown";
import { SectionCard } from "@/components/common/section-card";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/textarea";
import { useAgentRuns, useAgentRunWatcher, useAgentSkills, useAgentStatus } from "@/data/use-agent";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/lib/api/client";
import { type AgentStatus, agentApi } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/dates";
import { generateId } from "@/lib/ids";
import { Link } from "react-router";
import { AgentSetupCard } from "./agent-setup-card";

/**
 * AI Agent → Asisten Agen: antarmuka LifeOS untuk agen Hermes (docs/AI-AGENT.md §23) — chat, status & skill, tugas
 * terakhir. Hermes bekerja dengan data LifeOS lewat MCP; hasil resmi selalu masuk Approval untuk diperiksa pemilik.
 */
export function Component() {
  const { data: status, isLoading } = useAgentStatus();
  const ready = !!status?.configured && !!status.owner && !!status.reachable;
  return (
    <ModulePage
      module="agent"
      meta={
        <HeroStat>
          <Activity className="size-3.5" />{" "}
          {isLoading
            ? "Memeriksa agen…"
            : ready
              ? `Hermes aktif · ${status?.lifeosSkills ?? 0} skill LifeOS`
              : "Agen tidak aktif"}
        </HeroStat>
      }
    >
      {(tab) =>
        !status ? null : !ready && tab !== "status" ? (
          <NotReady status={status} />
        ) : tab === "status" ? (
          <StatusTab status={status} />
        ) : (
          <ChatTab />
        )
      }
    </ModulePage>
  );
}

function NotReady({ status }: { status: AgentStatus }) {
  const reason = !status.configured
    ? "Agen belum diatur di server (HERMES_URL & HERMES_API_KEY)."
    : !status.owner
      ? "Asisten Agen hanya untuk pemilik agen (HERMES_OWNER_EMAIL) — Hermes bekerja dengan data akun pemilik."
      : "Hermes tidak menyala atau tidak dapat dihubungi.";
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BotMessageSquare />
        </EmptyMedia>
        <EmptyTitle>Agen belum siap</EmptyTitle>
        <EmptyDescription>
          {reason}
          {status.configured && status.owner && (
            <>
              {" "}
              Nyalakan dari PowerShell: <code>wsl -e sh /mnt/d/Development/Application/LifeOS/infra/hermes/up.sh</code>
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  error?: boolean;
}

const CONVERSATION_KEY = "lifeos.agent.conversation";
const readConversation = () => {
  try {
    return localStorage.getItem(CONVERSATION_KEY) ?? "utama";
  } catch {
    return "utama";
  }
};

/** Chat dengan Hermes: setiap pesan = satu run di sesi Hermes yang sama (konteks percakapan disimpan Hermes). */
function ChatTab() {
  const [conversation, setConversation] = useState(readConversation);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { run, error } = useAgentRunWatcher(runId, (r) => {
    setMessages((prev) => [
      ...prev,
      {
        id: r.runId,
        role: "agent",
        text: r.output || r.error || `Tugas berakhir (${r.status}).`,
        error: r.status !== "completed",
      },
    ]);
    setRunId(null);
  });
  const busy = sending || !!runId;

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setSending(true);
    setMessages((prev) => [...prev, { id: generateId("msg"), role: "user", text }]);
    setDraft("");
    try {
      const started = await agentApi.chat(text, conversation);
      setRunId(started.runId);
    } catch (e) {
      setMessages((prev) => [...prev, { id: generateId("msg"), role: "agent", text: errorMessage(e), error: true }]);
    } finally {
      setSending(false);
    }
  };

  const newConversation = () => {
    const id = generateId("c")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .slice(0, 30);
    try {
      localStorage.setItem(CONVERSATION_KEY, id);
    } catch {
      /* penyimpanan browser tidak tersedia — percakapan baru tetap berlaku di tab ini */
    }
    setConversation(id);
    setMessages([]);
  };

  const stop = async () => {
    if (!runId) return;
    try {
      await agentApi.stop(runId);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <SectionCard
      icon={BotMessageSquare}
      title="Chat dengan Hermes"
      description="Agen memakai basis pengetahuan, data kerja, dan pengajuan Anda lewat MCP. Hasil resmi selalu diserahkan ke Approval."
      action={
        <Button size="sm" variant="outline" onClick={newConversation} disabled={busy}>
          <MessageSquarePlus /> Percakapan baru
        </Button>
      }
      contentClassName="flex flex-col gap-3"
    >
      <div className="flex min-h-64 flex-col gap-2 rounded-lg bg-muted/30 p-3">
        {messages.length === 0 && !busy && (
          <p className="m-auto max-w-md text-center text-sm text-muted-foreground">
            Contoh: <em>“Pengajuan apa saja yang menunggu?”</em> atau{" "}
            <em>“Telaah pengajuan PSP terbaru dengan skill telaah-pengajuan.”</em>
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-xl bg-module px-3 py-2 text-sm text-module-foreground"
                : `mr-auto max-w-[95%] rounded-xl border bg-card px-3 py-2 text-sm ${m.error ? "border-destructive/40 text-destructive" : ""}`
            }
          >
            {m.role === "agent" && !m.error ? (
              <Markdown content={m.text} />
            ) : (
              <p className="whitespace-pre-line">{m.text}</p>
            )}
          </div>
        ))}
        {busy && (
          <div className="mr-auto flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {run?.status === "stopping" ? "Menghentikan…" : "Agen bekerja…"}
            {runId && (
              <Button size="xs" variant="ghost" onClick={() => void stop()}>
                <Square /> Hentikan
              </Button>
            )}
          </div>
        )}
        {error && <p className="text-xs text-warning">{error}</p>}
      </div>
      <form onSubmit={(e) => void send(e)} className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Tulis pesan untuk agen… (Enter kirim, Shift+Enter baris baru)"
          className="min-h-0"
        />
        <Button type="submit" disabled={busy || !draft.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <SendHorizontal />} Kirim
        </Button>
      </form>
    </SectionCard>
  );
}

function StatusTab({ status }: { status: AgentStatus }) {
  const ready = status.configured && status.owner && status.reachable;
  const { data: skills } = useAgentSkills(ready);
  const { data: runs } = useAgentRuns(ready);
  const client = useQueryClient();
  const lifeos = (skills ?? []).filter((s) => s.lifeos);
  const others = (skills ?? []).filter((s) => !s.lifeos);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {status.configured && status.owner && <AgentSetupCard status={status} />}
      <SectionCard
        icon={Activity}
        title="Status Hermes"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void client.invalidateQueries({ queryKey: queryKeys.agentStatus })}
          >
            Periksa ulang
          </Button>
        }
        contentClassName="grid grid-cols-1 gap-2 text-sm"
      >
        <StatusRow ok={status.configured} label="Diatur di server" />
        <StatusRow ok={status.owner} label="Akun ini pemilik agen" />
        <StatusRow
          ok={status.reachable}
          label={status.reachable ? `Hermes aktif (${status.health})` : "Hermes menyala"}
        />
        {status.error && <p className="text-xs text-warning">{status.error}</p>}
        <p className="text-xs text-muted-foreground">
          Hermes berjalan sebagai container <code>lifeos-hermes</code> (profile <code>agent</code>). Model AI-nya
          dipanggil lewat LifeOS memakai provider & API key di Pengaturan → Model AI.
        </p>
      </SectionCard>

      <SectionCard
        icon={Sparkles}
        title="Skill"
        description="Skill LifeOS = prosedur kerja agen di repo (agents/hermes/skills/). Jalankan dari detail pengajuan di Approval."
        contentClassName="grid grid-cols-1 gap-1.5"
      >
        {!ready ? (
          <p className="text-sm text-muted-foreground">Nyalakan Hermes untuk melihat skill.</p>
        ) : lifeos.length === 0 ? (
          <p className="text-sm text-warning">Skill LifeOS belum terbaca — periksa mount folder skill.</p>
        ) : (
          lifeos.map((s) => (
            <div key={s.name} className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
            </div>
          ))
        )}
        {others.length > 0 && <p className="text-xs text-muted-foreground">+ {others.length} skill bawaan Hermes</p>}
      </SectionCard>

      <SectionCard
        icon={BotMessageSquare}
        title="Tugas agen terakhir"
        description="Sejak backend dinyalakan. Rincian tiap pemanggilan alat ada di Pengaturan → Integrasi → Aktivitas agen."
        className="lg:col-span-2"
        contentClassName="grid grid-cols-1 gap-1.5"
      >
        {!runs?.length ? (
          <p className="text-sm text-muted-foreground">Belum ada tugas.</p>
        ) : (
          runs.map((r) => (
            <div key={r.runId} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-sm">
              <Badge variant="outline">{r.kind === "skill" ? r.skill : "chat"}</Badge>
              <span className="min-w-0 flex-1 truncate">
                {r.requestId ? (
                  <Link className="hover:underline" to={`/requests/queue?request=${r.requestId}`}>
                    Pengajuan {r.requestId.slice(-6)}
                  </Link>
                ) : (
                  r.input
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(r.startedAt)}</span>
              <Badge variant="secondary">{r.status}</Badge>
            </div>
          ))
        )}
      </SectionCard>
    </div>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="flex items-center gap-2">
      {ok ? <CircleCheck className="size-4 text-success" /> : <CircleAlert className="size-4 text-warning" />}
      {label}
    </p>
  );
}
