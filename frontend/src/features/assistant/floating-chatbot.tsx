import {
  BookMarked,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  History,
  Inbox,
  Library,
  Link2,
  SendHorizontal,
  Sparkles,
  SquarePen,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { previewFile } from "@/components/common/file-preview";
import { Markdown } from "@/components/common/markdown";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAiChat, useAiConversationMessages, useAiConversations, useDeleteAiConversation } from "@/data/use-ai-chat";
import { useAddToKnowledgeInbox, useKnowledgeStatus } from "@/data/use-knowledge";
import { openKnowledgeNote } from "@/features/knowledge/knowledge-note-dialog";
import { answerForInbox, citationTarget, inboxTitle } from "@/features/knowledge/knowledge-utils";
import { stripCitations } from "@/features/notes/notebook/notebook-utils";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AiChatCitation, AiChatMessage } from "@/types/api";
import { aiErrorMessage, buildLifeosContext, useLifeosData } from "./lifeos-context";

const GREETING =
  "Halo! Saya **LifeOS AI**. Saya menjawab dari **basis pengetahuan** Anda (vault Obsidian) dan **data kerja** " +
  "(catatan, agenda, project, berkas) — lengkap dengan sumbernya. Ada yang bisa saya bantu?";

/** Tanggal hari ini menurut perangkat, untuk konteks pertanyaan seperti "agenda besok". */
const todayLabel = () =>
  new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Tombol mengambang + jendela chat AI (RAG atas basis pengetahuan & data kerja, riwayat tersimpan). */
export function FloatingChatbot() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  return (
    <div data-module="overview">
      <Button
        size="icon-lg"
        aria-label={open ? "Tutup asisten AI" : "Buka asisten AI"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed right-5 bottom-5 z-40 size-14 rounded-full shadow-2xl transition-transform hover:scale-110",
          open ? "rotate-90 bg-foreground text-background" : "bg-module-gradient text-white shadow-module/40",
        )}
      >
        {open ? <X className="size-6" /> : <Bot className="size-6" />}
      </Button>

      {open && (
        <section
          className={cn(
            "fixed right-5 bottom-22 z-40 flex origin-bottom-right animate-in flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl zoom-in-90 fade-in",
            expanded
              ? "h-[85svh] w-[calc(100vw-2.5rem)] md:w-[60vw]"
              : "h-[min(600px,78svh)] w-[calc(100vw-2.5rem)] sm:w-[420px]",
          )}
        >
          <header className="flex items-center justify-between gap-2 bg-module-gradient p-3 pl-4 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="rounded-xl bg-white/20 p-2">
                <Sparkles className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="leading-tight font-bold">LifeOS AI</h3>
                <p className="flex items-center gap-1 text-[10px] opacity-85">
                  <Library className="size-3" /> Basis pengetahuan & data kerja
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/20 hover:text-white"
                aria-label="Percakapan baru"
                title="Percakapan baru"
                onClick={() => setConversationId(null)}
              >
                <SquarePen />
              </Button>
              <ConversationHistory current={conversationId} onSelect={setConversationId} />
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/20 hover:text-white"
                aria-label={expanded ? "Perkecil" : "Perbesar"}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <ChevronDown /> : <ChevronUp />}
              </Button>
            </div>
          </header>
          <ChatBody key={conversationId ?? "new"} conversationId={conversationId} onCreated={setConversationId} />
        </section>
      )}
    </div>
  );
}

function ConversationHistory({ current, onSelect }: { current: string | null; onSelect: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const { data: conversations = [], isLoading } = useAiConversations(open);
  const remove = useDeleteAiConversation();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/20 hover:text-white"
          aria-label="Riwayat percakapan"
          title="Riwayat percakapan"
        >
          <History />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-72 flex-col p-0"
      >
        <p className="shrink-0 border-b px-3 py-2 text-xs font-semibold">Riwayat percakapan</p>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex justify-center p-4">
              <Spinner />
            </div>
          ) : !conversations.length ? (
            <p className="p-3 text-xs text-muted-foreground">Belum ada percakapan tersimpan.</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted",
                  c.id === current && "bg-module-soft",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                >
                  <span className="block truncate text-sm">{c.title}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDateTime(c.updatedAt)}</span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Hapus percakapan"
                  className="pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(c.id, {
                      onSuccess: () => c.id === current && onSelect(null),
                      onError: (error) => toast.error("Gagal menghapus", { description: errorMessage(error) }),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CitationChip({ citation }: { citation: AiChatCitation }) {
  const navigate = useNavigate();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const target = citationTarget(citation);
  const open = () => {
    setPopoverOpen(false);
    if (target.kind === "knowledge") openKnowledgeNote(target.noteId);
    else if (target.kind === "file") previewFile({ uploadId: target.uploadId, name: target.name });
    else if (target.kind === "page") void navigate(target.path);
  };
  const Icon = citation.collection === "knowledge" ? BookMarked : FileText;
  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-52 items-center gap-1 rounded-md border border-module/30 bg-module-soft px-1.5 py-0.5 text-[11px] font-semibold text-module transition-colors hover:bg-module/15"
        >
          <span className="tabular-nums">[{citation.n}]</span>
          <span className="truncate font-medium">{citation.title.replace(/^[^:]+:\s*/, "")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
          <Icon className="size-3.5 shrink-0 text-module" /> [{citation.n}] {citation.title}
        </p>
        {citation.linked && (
          <p className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Link2 className="size-3" /> Catatan tertaut dengan sumber yang ditemukan
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{citation.excerpt}</p>
        {target.kind !== "none" && (
          <Button variant="link" size="xs" className="mt-1 h-auto px-0" onClick={open}>
            Buka sumber
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AssistantBubble({
  message,
  question,
  canSaveToInbox,
}: {
  message: AiChatMessage;
  question?: string;
  canSaveToInbox: boolean;
}) {
  const inbox = useAddToKnowledgeInbox();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stripCitations(message.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin.");
    }
  };

  const saveToInbox = () =>
    inbox.mutate(
      { title: inboxTitle(question), content: answerForInbox(message.content, message.citations), question },
      {
        onSuccess: (result) => {
          setSaved(true);
          toast.success("Disimpan ke Inbox Obsidian", { description: result.path });
        },
        onError: (error) => toast.error("Gagal menyimpan ke Inbox", { description: errorMessage(error) }),
      },
    );

  return (
    <div className="max-w-[88%] min-w-0 overflow-x-auto rounded-2xl rounded-tl-sm border bg-card p-3.5 text-sm shadow-xs">
      <Markdown content={message.content} />
      {!!message.citations?.length && (
        <div className="mt-2.5 flex flex-wrap gap-1 border-t pt-2">
          {message.citations.map((c) => (
            <CitationChip key={c.n} citation={c} />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Button variant="ghost" size="xs" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />} {copied ? "Disalin" : "Salin"}
        </Button>
        {canSaveToInbox && (
          <Button
            variant="ghost"
            size="xs"
            disabled={saved || inbox.isPending}
            onClick={saveToInbox}
            title="Simpan jawaban sebagai catatan draf di folder 00-Inbox vault Obsidian untuk dikurasi"
          >
            {saved ? <Check /> : <Inbox />} {saved ? "Di Inbox" : "Simpan ke Inbox"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ChatBody({ conversationId, onCreated }: { conversationId: string | null; onCreated: (id: string) => void }) {
  const ai = useAi();
  const data = useLifeosData();
  const chat = useAiChat();
  const { data: page, isLoading } = useAiConversationMessages(conversationId);
  const { data: knowledge } = useKnowledgeStatus();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = page?.messages ?? [];

  // Gulir otomatis ke pesan terbaru (sinkronisasi DOM)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending, failure]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || chat.isPending) return;
    setFailure(null);
    if (!ai.isConfigured) {
      setFailure(`⚠️ **${AI_NOT_CONFIGURED}**`);
      return;
    }
    setInput("");
    setPending(text);
    chat.mutate(
      {
        conversationId: conversationId ?? undefined,
        message: text,
        snapshot: buildLifeosContext(data, "chat"),
        today: todayLabel(),
      },
      {
        onSuccess: (result) => {
          if (!conversationId) onCreated(result.conversation.id);
        },
        onError: (error) => {
          setFailure(aiErrorMessage(error));
          setInput(text);
        },
        onSettled: () => setPending(null),
      },
    );
  };

  const questionBefore = (index: number) =>
    [...messages.slice(0, index)].reverse().find((m) => m.role === "user")?.content;

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-muted/30 p-4">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {!messages.length && (
              <Row role="assistant">
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm border bg-card p-3.5 text-sm shadow-xs">
                  <Markdown content={GREETING} />
                </div>
              </Row>
            )}
            {messages.map((msg, i) => (
              <Row key={msg.id} role={msg.role}>
                {msg.role === "user" ? (
                  <UserBubble content={msg.content} />
                ) : (
                  <AssistantBubble message={msg} question={questionBefore(i)} canSaveToInbox={!!knowledge?.folder} />
                )}
              </Row>
            ))}
          </>
        )}
        {pending && (
          <>
            <Row role="user">
              <UserBubble content={pending} />
            </Row>
            <Row role="assistant">
              <div className="flex flex-col gap-1 rounded-2xl rounded-tl-sm border bg-card px-4 py-3">
                <span className="flex gap-1.5">
                  {[0, 0.2, 0.4].map((delay) => (
                    <span
                      key={delay}
                      className="size-1.5 animate-bounce rounded-full bg-module"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  ))}
                </span>
                <span className="text-[10px] text-muted-foreground">Mencari di basis pengetahuan & data kerja...</span>
              </div>
            </Row>
          </>
        )}
        {failure && (
          <Row role="assistant">
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm border bg-card p-3.5 text-sm shadow-xs">
              <Markdown content={failure} />
            </div>
          </Row>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t bg-card p-3">
        <Textarea
          rows={1}
          placeholder="Tanya sesuatu ke AI..."
          className="max-h-32 min-h-10 resize-none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || chat.isPending} aria-label="Kirim">
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}

function Row({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={cn("flex gap-3", role === "user" && "flex-row-reverse")}>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm",
          role === "user" ? "bg-module-soft text-module" : "bg-module-gradient text-white",
        )}
      >
        {role === "user" ? <UserRound className="size-4" /> : <Bot className="size-4" />}
      </span>
      {children}
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-module p-3.5 text-sm text-module-foreground shadow-xs">
      <p className="whitespace-pre-wrap">{content}</p>
    </div>
  );
}
