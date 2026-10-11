import {
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Layers,
  type LucideIcon,
  RefreshCw,
  Search,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Markdown } from "@/components/common/markdown";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeFrequency, scheduleStart } from "@/features/planner/lib/planner-logic";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { links } from "@/lib/deep-links";
import { aiErrorMessage, buildLifeosContext, type LifeosData, useLifeosData } from "./lifeos-context";

interface SearchResult {
  key: string;
  type: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  path: string;
}

/** Pencarian cepat lintas modul (maks. 15 hasil). */
const searchAll = (data: LifeosData, query: string): SearchResult[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const has = (s?: string | null) => !!s && s.toLowerCase().includes(q);
  const results: SearchResult[] = [];

  data.projects.forEach((p) => {
    if (has(p.title) || has(p.description))
      results.push({
        key: `p-${p.id}`,
        type: "Project",
        title: p.title,
        desc: p.deadline ? `Deadline: ${p.deadline}` : "No deadline",
        icon: Layers,
        color: "text-mod-productivity",
        path: links.project(p.id),
      });
  });
  data.projectTasks.forEach((t) => {
    if (has(t.title) || has(t.description))
      results.push({
        key: `t-${t.id}`,
        type: "Task",
        title: t.title,
        desc: `Prioritas: ${t.priority ?? "-"}`,
        icon: CheckSquare,
        color: "text-success",
        path: links.task(t.id),
      });
  });
  data.schedules.forEach((s) => {
    if (has(s.title) || has(s.location))
      results.push({
        key: `s-${s.id}`,
        type: "Agenda",
        title: s.title,
        desc: `Tgl: ${scheduleStart(s)}`,
        icon: CalendarDays,
        color: "text-mod-planner",
        path: links.schedule(s.id),
      });
  });
  data.todos.forEach((t) => {
    if (has(t.title))
      results.push({
        key: `td-${t.id}`,
        type: "To-Do",
        title: t.title,
        desc: t.completed ? "Selesai" : "Belum Selesai",
        icon: CheckCircle2,
        color: "text-info",
        path: links.todo(t.id),
      });
  });
  data.routines.forEach((r) => {
    if (has(r.title))
      results.push({
        key: `r-${r.id}`,
        type: "Rutinitas",
        title: r.title,
        desc: `Frekuensi: ${describeFrequency(r)}`,
        icon: RefreshCw,
        color: "text-mod-notes",
        path: links.routineEdit(r.id),
      });
  });
  data.freeNotes.forEach((n) => {
    if (has(n.title) || has(n.content))
      results.push({
        key: `fn-${n.id}`,
        type: "Catatan",
        title: n.title,
        desc: `${n.content?.substring(0, 50) ?? ""}...`,
        icon: StickyNote,
        color: "text-warning",
        path: links.note("free", n.id),
      });
  });
  data.aiNotes.forEach((n) => {
    if (has(n.title) || has(n.aiSummary))
      results.push({
        key: `an-${n.id}`,
        type: "AI Note",
        title: n.title,
        desc: "Catatan Pintar",
        icon: Bot,
        color: "text-mod-overview",
        path: links.note("ai", n.id),
      });
  });
  data.resources.forEach((r) => {
    if (has(r.title))
      results.push({
        key: `res-${r.id}`,
        type: "Resource",
        title: r.title,
        desc: String(r.type ?? ""),
        icon: BookOpen,
        color: "text-mod-files",
        path: links.resource(r.id),
      });
  });
  return results.slice(0, 15);
};

/** Tombol header + dialog Global Search (Ctrl/⌘+K). */
export function GlobalSearchButton() {
  const [open, setOpen] = useState(false);

  // Shortcut keyboard global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden w-56 justify-between text-muted-foreground md:flex"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2">
          <Search /> Cari...
        </span>
        <Kbd>Ctrl K</Kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Cari" onClick={() => setOpen(true)}>
        <Search />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[10svh] flex max-h-[80svh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">Pencarian Global</DialogTitle>
          <DialogDescription className="sr-only">Cari data atau tanya AI tentang data LifeOS Anda.</DialogDescription>
          <GlobalSearchPanel onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function GlobalSearchPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const data = useLifeosData();
  const ai = useAi();
  const [mode, setMode] = useState<"standard" | "ai">("standard");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const results = mode === "standard" ? searchAll(data, query) : [];

  const askAi = async () => {
    if (!query.trim()) return;
    if (!ai.isConfigured) {
      setAnswer(`⚠️ ${AI_NOT_CONFIGURED}`);
      return;
    }
    setLoading(true);
    setAnswer("");
    try {
      const prompt = `Anda adalah fitur pencarian AI dari aplikasi "LifeOS".
Pengguna mencari/bertanya: "${query}".

TUGAS ANDA:
1. Jawab secara akurat dan komprehensif berdasarkan [DATA APLIKASI LIFEOS USER] di bawah ini.
2. JIKA Anda merujuk pada salah satu data, Anda WAJIB menyisipkan Link Markdown yang mengarah ke ID item tersebut agar pengguna bisa mengkliknya.
Format: [Nama Item atau Judul Dokumen](ID)
Contoh: "Anda bisa membaca [Catatan Marketing](app:ainote:123)." atau "Ingat tugas [Bayar Listrik](app:todo:456)."
3. JIKA informasi TIDAK ADA di data, silakan berikan wawasan/jawaban umum dari luar, namun beritahu bahwa itu bukan dari data aplikasi.
4. Gunakan Markdown (Tabel, List, Bold) untuk merapikan jawaban.

${buildLifeosContext(data, "search")}

Pertanyaan/Pencarian User: ${query}
Jawaban AI:`;
      setAnswer(await ai.generate(prompt));
    } catch (error) {
      setAnswer(aiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Command shouldFilter={false} className="rounded-none" data-module="overview">
      <div className="flex items-center gap-2 border-b pr-3">
        <div className="flex-1">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={
              mode === "standard"
                ? "Cari Project, Tugas, Catatan, Agenda..."
                : "Tanya AI (cth: Apa tugas mendesak saya minggu ini?)"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && mode === "ai") {
                e.preventDefault();
                void askAi();
              }
            }}
          />
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "standard" | "ai")}>
          <TabsList>
            <TabsTrigger value="standard">Cepat</TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles /> AI
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <CommandList className="max-h-none flex-1 overflow-y-auto p-2">
        {mode === "standard" &&
          (!query ? (
            <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
              <Search className="size-10 opacity-40" />
              Ketik sesuatu untuk mencari di seluruh aplikasi...
            </div>
          ) : (
            <>
              <CommandEmpty>Tidak menemukan hasil untuk "{query}". Coba beralih ke Mode AI.</CommandEmpty>
              <CommandGroup>
                {results.map((r) => (
                  <CommandItem
                    key={r.key}
                    value={r.key}
                    onSelect={() => {
                      onClose();
                      void navigate(r.path);
                    }}
                    className="gap-3 rounded-xl py-3"
                  >
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted ${r.color}`}>
                      <r.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.desc}</span>
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                      {r.type}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ))}

        {mode === "ai" && (
          <div className="p-2">
            {!answer && !loading && (
              <div className="flex flex-col items-center gap-4 py-14 text-center text-sm text-muted-foreground">
                <Bot className="size-12 text-module opacity-60" />
                AI akan menganalisis data Agenda, Project, Tugas, dan Catatan Anda.
                <Button onClick={() => void askAi()} disabled={!query.trim()}>
                  <Sparkles /> Tanya AI Sekarang
                </Button>
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-module">
                <Spinner className="size-6" /> AI sedang berpikir...
              </div>
            )}
            {answer && !loading && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-module/20 bg-card p-5">
                  <h4 className="mb-3 flex items-center gap-2 border-b pb-3 font-bold">
                    <span className="rounded-lg bg-module-soft p-1.5 text-module">
                      <Bot className="size-4" />
                    </span>
                    Jawaban AI LifeOS
                  </h4>
                  {/* Klik link app: menutup dialog agar halaman tujuan terlihat */}
                  <div onClickCapture={(e) => (e.target as HTMLElement).closest("button") && onClose()}>
                    <Markdown content={answer} />
                  </div>
                </div>
                <Button variant="secondary" size="sm" className="self-center" onClick={() => setAnswer("")}>
                  <RefreshCw /> Tanya Hal Lain
                </Button>
              </div>
            )}
          </div>
        )}
      </CommandList>
    </Command>
  );
}
