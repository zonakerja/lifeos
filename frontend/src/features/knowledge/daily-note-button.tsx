import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useKnowledgeStatus } from "@/data/use-knowledge";
import { useKnowledgeActions } from "@/data/use-knowledge-workspace";
import { errorMessage } from "@/lib/api/client";
import { todayYMD } from "@/lib/dates";
import { useOpenNote } from "./workspace/workspace-store";

const HELP =
  "Berkas Harian/YYYY-MM-DD.md dibuat sekali dari templat 90-Templat/Harian.md (bila ada) + ringkasan agenda, to-do, dan task tanggal itu. Setelah dibuat, isinya milik Anda — LifeOS tidak menimpanya.";

export function useDailyNote() {
  const { openDaily } = useKnowledgeActions();
  const openNote = useOpenNote();
  const open = (date: string, after?: () => void) =>
    openDaily.mutate(date, {
      onSuccess: (r) => {
        if (r.id) openNote(r.id);
        toast.success(r.created ? `Catatan harian ${date} dibuat` : `Membuka catatan harian ${date}`);
        after?.();
      },
      onError: (error) => toast.error("Gagal membuka catatan harian", { description: errorMessage(error) }),
    });
  return { open, pending: openDaily.isPending };
}

/** Menu Knowledge: "Catatan hari ini" + pilih tanggal lain (setara Daily notes Obsidian, K1 docs/AI-AGENT.md §25.6). */
export function DailyNoteButton() {
  const { open, pending } = useDailyNote();
  const [date, setDate] = useState(todayYMD);
  const [popover, setPopover] = useState(false);
  return (
    <div className="flex">
      <Button
        size="sm"
        variant="outline"
        className="rounded-r-none"
        disabled={pending}
        onClick={() => open(todayYMD())}
        title={HELP}
      >
        {pending ? <Loader2 className="animate-spin" /> : <CalendarDays />} Catatan hari ini
      </Button>
      <Popover open={popover} onOpenChange={setPopover}>
        <PopoverTrigger asChild>
          <Button
            size="icon-sm"
            variant="outline"
            className="rounded-l-none border-l-0"
            aria-label="Catatan harian tanggal lain"
          >
            <ChevronDown />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-72 gap-2">
          <Label htmlFor="daily-note-date">Catatan harian tanggal</Label>
          <Input id="daily-note-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button size="sm" disabled={!date || pending} onClick={() => open(date, () => setPopover(false))}>
            <CalendarDays /> Buka catatan harian
          </Button>
          <p className="text-xs text-muted-foreground">{HELP}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Planner Harian: buka catatan harian vault untuk tanggal yang sedang dilihat (hanya bila vault sudah dipilih). */
export function PlannerDailyNoteButton({ date }: { date: string }) {
  const { data: status } = useKnowledgeStatus();
  const { open, pending } = useDailyNote();
  if (!status?.folder || !status.folderExists) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Catatan harian di Knowledge"
      title={`Catatan harian ${date} di Knowledge (vault Obsidian)`}
      disabled={pending}
      onClick={() => open(date)}
    >
      {pending ? <Loader2 className="animate-spin" /> : <CalendarDays />}
    </Button>
  );
}
