import { BellRing, Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAutomationAlerts } from "@/data/use-automation";
import { formatDateTime } from "@/lib/dates";
import { useAuthStore } from "@/stores/auth-store";
import type { AutomationAlert } from "@/types/api";
import { alertAction, newAlerts } from "./automation-utils";

const seenKey = (userId: string) => `lifeos.robotAlerts.seen.${userId}`;

function readSeen(userId: string): string[] {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeSeen(userId: string, ids: string[]) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(ids));
  } catch {
    // Penyimpanan browser tidak tersedia → toast bisa muncul lagi setelah reload; tidak masalah
  }
}

const browserNotifications = () => typeof window !== "undefined" && "Notification" in window;

/**
 * Toast (dan notifikasi browser bila diizinkan & tab tidak sedang dilihat) untuk notifikasi robot yang **baru**:
 * sesi kedaluwarsa, jadwal aktif tanpa sesi, tugas terjadwal gagal. Yang sudah ditampilkan diingat per browser.
 */
export function useRobotAlertToasts() {
  const { data: alerts } = useAutomationAlerts();
  const userId = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();

  useEffect(() => {
    if (!alerts || !userId) return;
    const { fresh, keep } = newAlerts(alerts, readSeen(userId));
    writeSeen(userId, keep);
    for (const alert of fresh) {
      toast.warning(alert.title, {
        id: alert.id,
        description: alert.message,
        duration: 20_000,
        action: { label: alertAction(alert), onClick: () => void navigate(alert.path) },
      });
      if (browserNotifications() && Notification.permission === "granted" && document.hidden) {
        const n = new Notification(`LifeOS — ${alert.title}`, { body: alert.message, tag: alert.id });
        n.onclick = () => {
          window.focus();
          void navigate(alert.path);
          n.close();
        };
      }
    }
  }, [alerts, userId, navigate]);
}

/** Bagian lonceng notifikasi: daftar notifikasi robot. */
export function RobotAlertsSection({ alerts, onOpen }: { alerts: AutomationAlert[]; onOpen: (path: string) => void }) {
  if (!alerts.length) return null;
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="flex items-center justify-between text-sm font-bold">
        Robot & Otomasi <Badge className="bg-destructive/12 text-destructive">{alerts.length}</Badge>
      </h3>
      {alerts.map((alert) => (
        <button
          key={alert.id}
          type="button"
          onClick={() => onOpen(alert.path)}
          className="flex flex-col gap-1 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-left transition-colors hover:bg-destructive/10"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <Bot className="size-4 shrink-0" /> {alert.title}
          </span>
          <span className="text-xs text-muted-foreground">{alert.message}</span>
          <span className="flex justify-between text-[10px] font-semibold text-muted-foreground">
            <span>{alert.at ? formatDateTime(alert.at) : ""}</span>
            <span className="text-destructive">{alertAction(alert)} →</span>
          </span>
        </button>
      ))}
    </section>
  );
}

/** Tombol meminta izin notifikasi browser (muncul di luar tab LifeOS saat tab tidak sedang dilihat). */
export function BrowserNotificationButton() {
  const [permission, setPermission] = useState(() =>
    browserNotifications() ? Notification.permission : ("unsupported" as const),
  );
  if (permission === "unsupported") return null;
  if (permission === "granted") {
    return <p className="text-xs text-success">Notifikasi browser aktif untuk sesi kedaluwarsa & tugas gagal.</p>;
  }
  if (permission === "denied") {
    return (
      <p className="text-xs text-muted-foreground">
        Notifikasi browser diblokir — izinkan lewat pengaturan situs di browser bila ingin diberi tahu di luar tab ini.
      </p>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-fit"
      onClick={() => void Notification.requestPermission().then(setPermission)}
    >
      <BellRing /> Aktifkan notifikasi browser
    </Button>
  );
}
