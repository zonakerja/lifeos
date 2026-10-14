import {
  BookmarkPlus,
  Bot,
  Check,
  Copy,
  Eraser,
  FileText,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Paperclip,
  SendHorizontal,
  Sparkles,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Markdown } from "@/components/common/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  useClearNotebookChat,
  useNotebookChat,
  useNotebookMessages,
  useNotebookNoteMutations,
} from "@/data/use-notebooks";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { ApiError, errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { NotebookAttachment, NotebookCitation, NotebookMessage, NotebookSource } from "@/types/api";
import { AttachmentTray, MAX_CHAT_FILES, MessageAttachments, useChatAttachments } from "./chat-attachments";
import { DOCUMENT_ACCEPT } from "../lib/read-file-text";
import { answerToNote, readySources, stripCitations } from "./notebook-utils";

function CitationChip({ citation, onOpenSource }: { citation: NotebookCitation; onOpenSource: (id: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-56 items-center gap-1 rounded-md border border-module/30 bg-module-soft px-1.5 py-0.5 text-[11px] font-semibold text-module transition-colors hover:bg-module/15"
        >
          <span className="tabular-nums">[{citation.n}]</span>
          <span className="truncate font-medium">{citation.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
          <FileText className="size-3.5 text-module" /> [{citation.n}] {citation.title}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{citation.excerpt}</p>
        <Button variant="link" size="xs" className="mt-1 h-auto px-0" onClick={() => onOpenSource(citation.sourceId)}>
          Sorot sumber
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function AssistantMessage({
  message,
  question,
  notebookId,
  onOpenSource,
}: {
  message: NotebookMessage;
  question?: string;
  notebookId: string;
  onOpenSource: (id: string) => void;
}) {
  const { create } = useNotebookNoteMutations(notebookId);
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

  const save = () =>
    create.mutate(answerToNote(question, message.content, message.citations), {
      onSuccess: () => {
        setSaved(true);
        toast.success("Disimpan ke catatan notebook.");
      },
      onError: (error) => toast.error("Gagal menyimpan", { description: errorMessage(error) }),
    });

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-module-soft text-module">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border bg-card px-4 py-3">
        {/* Menyalin sebagian teks (Ctrl+C) juga tanpa nomor rujukan */}
        <div
          onCopy={(e) => {
            const selected = window.getSelection()?.toString();
            if (!selected) return;
            e.preventDefault();
            e.clipboardData.setData("text/plain", stripCitations(selected));
          }}
        >
          <Markdown content={message.content} />
        </div>
        {!!message.citations?.length && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5">
            {message.citations.map((c) => (
              <CitationChip key={c.n} citation={c} onOpenSource={onOpenSource} />
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-1">
          <Button variant="ghost" size="xs" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />} {copied ? "Disalin" : "Salin"}
          </Button>
          <Button variant="ghost" size="xs" disabled={saved || create.isPending} onClick={save}>
            {saved ? <Check /> : <BookmarkPlus />} {saved ? "Tersimpan" : "Simpan ke catatan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface AskOptions {
  /** Gambar yang dilampirkan (sudah diunggah) */
  attachments?: NotebookAttachment[];
  onSuccess?: () => void;
  /** Dipanggil bila AI gagal menjawab (mis. kembalikan pertanyaan ke kotak input) */
  onFailed?: () => void;
}

export interface NotebookAsker {
  /** Kirim pertanyaan ke notebook */
  ask: (question: string, options?: AskOptions) => void;
  isPending: boolean;
  /** Cara AI membaca sumber pada jawaban terakhir */
  lastMode: "full" | "rag" | null;
}

/** Pengirim pertanyaan notebook (satu untuk Chat & Studio, agar status "menjawab" sama). */
export function useNotebookAsker(notebookId: string): NotebookAsker {
  const ai = useAi();
  const chat = useNotebookChat(notebookId);
  const [lastMode, setLastMode] = useState<"full" | "rag" | null>(null);

  const ask = (question: string, { attachments, onSuccess, onFailed }: AskOptions = {}) => {
    if (chat.isPending) return;
    if (!ai.isConfigured) {
      toast.error("AI belum diatur", { description: AI_NOT_CONFIGURED });
      onFailed?.();
      return;
    }
    chat.mutate(
      { message: question, attachments },
      {
        onSuccess: (result) => {
          setLastMode(result.mode);
          onSuccess?.();
        },
        onError: (error) => {
          onFailed?.();
          const quota = error instanceof ApiError && error.status === 429;
          toast.error(quota ? "Limit API Tercapai ⚠️" : "Gagal menjawab", { description: errorMessage(error) });
        },
      },
    );
  };

  return { ask, isPending: chat.isPending, lastMode };
}

/**
 * Isi kotak prompt + lampiran chat. Dipegang induk agar tetap utuh saat panel chat dipindah antara tata letak biasa
 * dan modal besar (panel di-mount ulang, tetapi upload yang sedang berjalan & teks yang diketik tidak hilang).
 */
export function useChatComposer() {
  const [input, setInput] = useState("");
  const files = useChatAttachments();
  return { input, setInput, files };
}
export type ChatComposer = ReturnType<typeof useChatComposer>;

/** Chat notebook: jawaban hanya dari sumber, dengan sitasi yang bisa ditelusuri. */
export function ChatPanel({
  notebookId,
  sources,
  renderSummary,
  asker,
  composer,
  onOpenSource,
  expanded = false,
  onToggleExpand,
  className,
}: {
  notebookId: string;
  sources: NotebookSource[];
  /** Kartu ringkasan di atas percakapan (terbuka otomatis bila chat masih kosong) */
  renderSummary?: (hasMessages: boolean) => ReactNode;
  /** Pengirim pertanyaan bersama (dipakai juga oleh Studio) */
  asker: NotebookAsker;
  composer: ChatComposer;
  onOpenSource: (sourceId: string) => void;
  /** Sedang tampil di modal besar */
  expanded?: boolean;
  /** Tombol perbesar / kecilkan (tidak tampil bila tidak diisi) */
  onToggleExpand?: () => void;
  className?: string;
}) {
  const ai = useAi();
  const { data: messages = [], isLoading } = useNotebookMessages(notebookId);
  const clear = useClearNotebookChat(notebookId);
  const { input, setInput, files: chatFiles } = composer;
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragging, setDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = readySources(sources);
  const hasFiles = chatFiles.attachments.length > 0;
  // Tanpa sumber pun boleh bertanya tentang lampiran
  const canAsk = ai.isConfigured && (ready.length > 0 || hasFiles) && !asker.isPending && !chatFiles.busy;
  const lastMode = asker.lastMode;

  const send = (text: string) => {
    const question = text.trim();
    if ((!question && !hasFiles) || !canAsk) return;
    setInput("");
    asker.ask(question, {
      attachments: chatFiles.attachments,
      onSuccess: chatFiles.commit,
      // Gagal → pertanyaan dikembalikan ke kotak input (lampiran tetap di baki)
      onFailed: () => setInput(question),
    });
  };

  const fileList = (list: FileList | null | undefined) => Array.from(list ?? []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, asker.isPending]);

  return (
    <section
      className={cn(
        "relative flex h-[calc(100svh-15rem)] min-h-[26rem] flex-col rounded-2xl border bg-muted/30 lg:h-auto lg:min-h-0 lg:flex-1",
        dragging && "border-module ring-2 ring-module/40",
        className,
      )}
      onDragOver={(e) => {
        if (!ai.isConfigured || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        chatFiles.addFiles(fileList(e.dataTransfer.files));
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-module-soft/80 text-sm font-semibold text-module">
          <Paperclip className="mr-2 size-5" /> Lepas gambar / berkas untuk dilampirkan
        </div>
      )}
      {/* Di modal: ruang kanan untuk tombol tutup dialog */}
      <div className={cn("flex items-center justify-between gap-2 border-b px-4 py-2.5", expanded && "pr-12")}>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <MessageSquareText className="size-4 text-module" /> Chat
        </h3>
        <div className="flex items-center gap-2">
          {lastMode && (
            <Badge
              variant="outline"
              className="hidden sm:inline-flex"
              title="Cara AI membaca sumber pada jawaban terakhir"
            >
              {lastMode === "full" ? "Membaca seluruh sumber" : "Membaca bagian paling relevan"}
            </Badge>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="xs" onClick={() => setConfirmClear(true)}>
              <Eraser /> Bersihkan
            </Button>
          )}
          {onToggleExpand && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={expanded ? "Kecilkan chat" : "Perbesar chat"}
              title={expanded ? "Kecilkan chat" : "Perbesar chat"}
              onClick={onToggleExpand}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {!isLoading && renderSummary && <div className="mb-4">{renderSummary(messages.length > 0)}</div>}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" />
          </div>
        ) : messages.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-module-soft text-module">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>Tanyakan apa saja tentang sumber Anda</EmptyTitle>
              <EmptyDescription>
                {!ai.isConfigured
                  ? "AI belum diatur. Atur provider & API key di Pengaturan → AI."
                  : ready.length
                    ? "Jawaban hanya berdasarkan sumber notebook dan menyertakan rujukan [1], [2] ke sumbernya."
                    : "Tambahkan dan aktifkan minimal satu sumber terlebih dahulu."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message, i) =>
              message.role === "user" ? (
                <div key={message.id} className="flex flex-col items-end gap-1.5">
                  <MessageAttachments attachments={message.attachments} className="max-w-[85%]" />
                  {message.content && (
                    <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-module px-4 py-2.5 text-sm whitespace-pre-wrap text-module-foreground">
                      {message.content}
                    </p>
                  )}
                </div>
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  question={messages[i - 1]?.role === "user" ? messages[i - 1].content : undefined}
                  notebookId={notebookId}
                  onOpenSource={onOpenSource}
                />
              ),
            )}
            {asker.isPending && (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <span className="flex size-7 items-center justify-center rounded-full bg-module-soft text-module">
                  <Spinner className="size-4" />
                </span>
                Membaca sumber & menyusun jawaban…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Ruang kanan agar tombol Kirim tidak tertutup tombol chatbot melayang (fixed kanan-bawah); di modal tidak perlu */}
      <div className={cn("border-t p-3", !expanded && "pr-[4.75rem]")}>
        <AttachmentTray items={chatFiles.items} onRemove={chatFiles.remove} />
        <form
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Lampirkan gambar atau berkas"
            title="Lampirkan gambar / berkas (PDF, DOCX, XLSX, teks) — bisa juga tempel Ctrl+V atau seret ke chat"
            disabled={!ai.isConfigured || asker.isPending || chatFiles.items.length >= MAX_CHAT_FILES}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            multiple
            className="hidden"
            aria-label="Pilih gambar atau berkas"
            onChange={(e) => {
              chatFiles.addFiles(fileList(e.target.files));
              e.target.value = "";
            }}
          />
          <Textarea
            rows={1}
            value={input}
            aria-label="Pertanyaan"
            placeholder={ready.length || hasFiles ? "Tanyakan sesuatu…" : "Tambah sumber atau lampiran dulu"}
            disabled={!ai.isConfigured}
            // Satu baris setinggi tombol (36 px) agar ikon lampiran & kirim sejajar; tumbuh saat teks panjang
            className="max-h-40 min-h-9 resize-none bg-card py-1.5"
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              // Tempel gambar/berkas dari clipboard (screenshot, salin gambar/berkas dari aplikasi lain)
              const files = fileList(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                chatFiles.addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <Button type="submit" size="icon" aria-label="Kirim" disabled={!canAsk || (!input.trim() && !hasFiles)}>
            {asker.isPending || chatFiles.busy ? <Spinner /> : <SendHorizontal />}
          </Button>
        </form>
        {/* Bantuan di baris tersendiri (bukan di placeholder) agar kotak prompt tetap satu baris */}
        <p className="mt-1.5 truncate pl-11 text-[10px] text-muted-foreground">
          Enter kirim · Shift+Enter baris baru · Ctrl+V tempel gambar/berkas
        </p>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Bersihkan Riwayat Chat?"
        description="Semua pesan di notebook ini dihapus. Sumber dan catatan notebook tidak terpengaruh."
        confirmLabel="Bersihkan"
        onConfirm={() => {
          clear.mutate(undefined, {
            onError: (error) => toast.error("Gagal membersihkan chat", { description: errorMessage(error) }),
          });
          setConfirmClear(false);
        }}
      />
    </section>
  );
}
