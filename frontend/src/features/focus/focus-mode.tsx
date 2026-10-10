import { Pause, Play, RotateCcw, Settings2, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type FocusKind = "focus" | "shortBreak" | "longBreak";
const LABELS: Record<FocusKind, string> = { focus: "Fokus", shortBreak: "Rehat", longBreak: "Istirahat" };

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

/**
 * Tombol header + dialog Pomodoro. Timer tetap berjalan
 * saat dialog ditutup; sisa waktu tampil di tombol header.
 */
export function FocusModeButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FocusKind>("focus");
  const [durations, setDurations] = useState<Record<FocusKind, number>>({ focus: 25, shortBreak: 5, longBreak: 15 });
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [active, setActive] = useState(false);
  const [editing, setEditing] = useState(false);

  // Hitung mundur (sinkronisasi dengan timer eksternal)
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setActive(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  const switchMode = (next: FocusKind) => {
    setMode(next);
    setTimeLeft(durations[next] * 60);
    setActive(false);
    setEditing(false);
  };

  const updateDuration = (minutes: number) => {
    setDurations((prev) => ({ ...prev, [mode]: minutes }));
    if (!active) setTimeLeft(minutes * 60);
  };

  return (
    <>
      <Button
        variant="ghost"
        size={active ? "sm" : "icon"}
        aria-label="Focus Mode"
        title="Focus Mode"
        onClick={() => setOpen(true)}
        className={cn(active && "bg-module-soft font-mono text-module tabular-nums")}
      >
        <Timer /> {active && formatTime(timeLeft)}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-module="overview" className="sm:max-w-sm">
          <DialogHeader className="items-center text-center">
            <DialogTitle className="flex items-center gap-2 text-2xl font-extrabold">
              <Timer className="size-6 text-module" /> Focus Mode
            </DialogTitle>
            <DialogDescription>{editing ? "Atur durasi (menit)" : "Kerjakan tugas tanpa gangguan."}</DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => switchMode(v as FocusKind)}>
            <TabsList className="grid w-full grid-cols-3">
              {(Object.keys(LABELS) as FocusKind[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex min-h-24 items-center justify-center">
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={durations[mode]}
                  onChange={(e) => updateDuration(parseInt(e.target.value) || 1)}
                  className="h-16 w-32 text-center text-4xl font-extrabold text-module"
                />
                <span className="text-lg font-bold text-muted-foreground">mnt</span>
              </div>
            ) : (
              <span className="text-7xl font-extrabold tracking-tighter tabular-nums">{formatTime(timeLeft)}</span>
            )}
          </div>

          {editing ? (
            <Button className="w-full" onClick={() => setEditing(false)}>
              Simpan Pengaturan
            </Button>
          ) : (
            <div className="flex justify-center gap-4">
              <Button
                size="icon-lg"
                className={cn(
                  "size-18 rounded-3xl shadow-lg",
                  active
                    ? "bg-module-soft text-module hover:bg-module/15"
                    : "bg-module-gradient text-white shadow-module/30",
                )}
                aria-label={active ? "Jeda" : "Mulai"}
                onClick={() => setActive((v) => !v)}
              >
                {active ? (
                  <Pause className="size-8" fill="currentColor" />
                ) : (
                  <Play className="ml-1 size-8" fill="currentColor" />
                )}
              </Button>
              <Button
                size="icon-lg"
                variant="secondary"
                className="size-18 rounded-3xl"
                aria-label="Reset"
                onClick={() => {
                  setActive(false);
                  setTimeLeft(durations[mode] * 60);
                }}
              >
                <RotateCcw className="size-7" />
              </Button>
              <Button
                size="icon-lg"
                variant="ghost"
                className="size-18 rounded-3xl text-muted-foreground"
                aria-label="Ubah durasi"
                onClick={() => setEditing(true)}
              >
                <Settings2 className="size-7" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
