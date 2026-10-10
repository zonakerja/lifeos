import { Bot, ChevronDown, ChevronUp, SendHorizontal, Sparkles, UserRound, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/common/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { cn } from "@/lib/utils";
import { aiErrorMessage, buildLifeosContext, useLifeosData } from "./lifeos-context";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

const GREETING: ChatMessage = {
  role: "ai",
  content:
    "Halo! Saya adalah AI Assistant LifeOS Anda. Ada yang bisa saya bantu terkait jadwal, tugas, atau mencari info dari catatan Anda?",
};

/** Tombol mengambang + jendela chat AI kontekstual. */
export function FloatingChatbot() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
              : "h-[min(550px,78svh)] w-[calc(100vw-2.5rem)] sm:w-[400px]",
          )}
        >
          <header className="flex items-center justify-between bg-module-gradient p-4 text-white">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-white/20 p-2">
                <Sparkles className="size-5" />
              </span>
              <div>
                <h3 className="leading-tight font-bold">LifeOS AI</h3>
                <p className="flex items-center gap-1 text-[10px] opacity-85">
                  <span className="size-1.5 animate-pulse rounded-full bg-success" /> Context-Aware
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20 hover:text-white"
              aria-label={expanded ? "Perkecil" : "Perbesar"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown /> : <ChevronUp />}
            </Button>
          </header>
          <ChatBody />
        </section>
      )}
    </div>
  );
}

function ChatBody() {
  const ai = useAi();
  const data = useLifeosData();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Gulir otomatis ke pesan terbaru (sinkronisasi DOM)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const history = [...messages];
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    if (!ai.isConfigured) {
      setMessages((prev) => [...prev, { role: "ai", content: `⚠️ **${AI_NOT_CONFIGURED}**` }]);
      return;
    }

    setLoading(true);
    try {
      const chatHistory = history
        .slice(-4)
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n\n");
      const prompt = `Anda adalah "LifeOS AI", asisten pribadi pengguna.
TUGAS UTAMA:
1. Jawab pertanyaan pengguna menggunakan [DATA APLIKASI LIFEOS USER] di bawah.
2. JIKA Anda merujuk pada salah satu data (Catatan, Agenda, Project, Task, To-Do, atau Rutinitas), Anda WAJIB membuat Link Markdown yang mengarah ke ID item tersebut.
Format: [Nama Item yang Relevan](ID)
Contoh: "Jangan lupa selesaikan [Bayar Listrik](app:todo:123) hari ini."
atau "Terkait [Olahraga](app:routine:456)..."
3. Jika informasi TIDAK ADA di data, jawab dengan pengetahuan umum, tapi beritahu bahwa itu tidak ada di catatan aplikasi.
4. Gunakan Markdown (Tabel, Bold, List) jika perlu.

${buildLifeosContext(data, "chat")}

[HISTORI CHAT]
${chatHistory}

User: ${text}
AI:`;
      const response = await ai.generate(prompt);
      setMessages((prev) => [...prev, { role: "ai", content: response }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: "ai", content: aiErrorMessage(error) }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-muted/30 p-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm",
                msg.role === "user" ? "bg-module-soft text-module" : "bg-module-gradient text-white",
              )}
            >
              {msg.role === "user" ? <UserRound className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div
              className={cn(
                "max-w-[85%] overflow-x-auto rounded-2xl p-3.5 text-sm shadow-xs",
                msg.role === "user" ? "rounded-tr-sm bg-module text-module-foreground" : "rounded-tl-sm border bg-card",
              )}
            >
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <Markdown content={msg.content} />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-module-gradient text-white">
              <Bot className="size-4" />
            </span>
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
              <span className="text-[10px] text-muted-foreground">Menganalisis data...</span>
            </div>
          </div>
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
              void send();
            }
          }}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || loading} aria-label="Kirim">
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}
