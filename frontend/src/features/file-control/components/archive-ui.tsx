import { Box, FileText, Folder, MapPin, Server, type LucideIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ArchiveJra, DynamicStatus, PhysicalReference, PhysRefType } from "@/types/entities";
import { isPermanent, STATUS_LABEL, STATUS_TONE } from "../lib/archive";

/** Badge status siklus arsip (Aktif / Inaktif / Perlu Tindak Lanjut / Statis / Musnah). */
export function StatusBadge({ status, className }: { status: DynamicStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", STATUS_TONE[status], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * Badge jenis retensi dari JRA: Permanen / Non Permanen (Musnah) / Dinilai Kembali. Arsip vital tidak memakai JRA
 * (retensi manual); arsip tanpa JRA = "JRA Belum Diset".
 */
export function RetentionBadge({
  jra,
  isVital,
  className,
}: {
  jra?: ArchiveJra;
  isVital?: boolean;
  className?: string;
}) {
  const [label, tone] = jra
    ? isPermanent(jra)
      ? ["Permanen", "border-info/30 bg-info/10 text-info"]
      : jra.keterangan === "Musnah"
        ? ["Non Permanen", "border-destructive/30 bg-destructive/10 text-destructive"]
        : [
            jra.keterangan || "Non Permanen",
            "border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning",
          ]
    : isVital
      ? ["Retensi Manual (Vital)", "text-muted-foreground"]
      : ["JRA Belum Diset", "text-muted-foreground"];
  return (
    <Badge variant="outline" className={cn(tone, className)}>
      {label}
    </Badge>
  );
}

/** Ikon & warna per jenis wadah fisik (+ arsip). */
export const CONTAINER_STYLE: Record<PhysRefType | "file", { icon: LucideIcon; tone: string; label: string }> = {
  location: { icon: MapPin, tone: "bg-success/15 text-success", label: "LOKASI" },
  rack: { icon: Server, tone: "bg-primary/15 text-primary", label: "RAK" },
  box: { icon: Box, tone: "bg-warning/20 text-warning-foreground dark:text-warning", label: "BOX" },
  folder: { icon: Folder, tone: "bg-info/15 text-info", label: "FOLDER" },
  file: { icon: FileText, tone: "bg-muted text-muted-foreground", label: "ARSIP" },
};

export function ContainerIcon({ type, className }: { type: PhysRefType | "file"; className?: string }) {
  const { icon: Icon, tone } = CONTAINER_STYLE[type];
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone, className)}>
      <Icon className="size-5" />
    </span>
  );
}

/** QR lokal (tanpa layanan eksternal). */
export function QrImage({ value, size = 90 }: { value: string; size?: number }) {
  return <QRCodeSVG value={value || "-"} size={size} marginSize={0} style={{ display: "block" }} />;
}

const caption = { fontSize: "8px", textTransform: "uppercase", color: "#666", display: "block" } as const;

/** Label stiker arsip (inline style agar identik saat dicetak). */
export const ArchiveLabel = forwardRef<
  HTMLDivElement,
  { regId: string; code: string; title: string; isVital?: boolean }
>(function ArchiveLabel({ regId, code, title, isVital }, ref) {
  return (
    <div ref={ref} style={{ background: "white", padding: "10px", display: "flex", justifyContent: "center" }}>
      <div
        style={{
          border: "3px solid black",
          padding: "10px",
          display: "flex",
          gap: "15px",
          alignItems: "center",
          width: "320px",
          boxSizing: "border-box",
          background: "white",
          color: "black",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <QrImage value={regId} />
          <p
            style={{
              fontSize: "10px",
              fontFamily: "monospace",
              fontWeight: "bold",
              textAlign: "center",
              margin: "5px 0 0",
            }}
          >
            {regId}
          </p>
        </div>
        <div
          style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}
        >
          <div style={{ borderBottom: "2px solid black", paddingBottom: "4px", marginBottom: "4px" }}>
            <span style={caption}>Klasifikasi</span>
            <span
              style={{ fontSize: "16px", fontWeight: 900, fontFamily: "monospace", display: "block", lineHeight: 1 }}
            >
              {code}
            </span>
          </div>
          {isVital && (
            <div
              style={{
                border: "2px solid red",
                color: "red",
                padding: "2px",
                textAlign: "center",
                marginBottom: "4px",
                fontWeight: 900,
                fontSize: "10px",
                textTransform: "uppercase",
              }}
            >
              ARSIP VITAL
            </div>
          )}
          <div>
            <span style={caption}>Uraian</span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "bold",
                lineHeight: 1.2,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                maxHeight: "40px",
              }}
            >
              {title}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

/** Label wadah fisik (lokasi/rak/box/folder). */
export const ContainerLabel = forwardRef<HTMLDivElement, { container: PhysicalReference }>(function ContainerLabel(
  { container },
  ref,
) {
  return (
    <div ref={ref} style={{ background: "white", padding: "10px", display: "flex", justifyContent: "center" }}>
      <div
        style={{
          border: "3px solid black",
          padding: "15px",
          width: "320px",
          display: "flex",
          gap: "15px",
          alignItems: "center",
          background: "white",
          color: "black",
          fontFamily: "sans-serif",
          boxSizing: "border-box",
        }}
      >
        <QrImage value={container.id} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <span
            style={{
              fontSize: "18px",
              fontWeight: 900,
              fontFamily: "monospace",
              display: "block",
              borderBottom: "2px solid black",
              marginBottom: "5px",
              paddingBottom: "2px",
            }}
          >
            {container.code}
          </span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: "bold",
              lineHeight: 1.2,
              textTransform: "uppercase",
              display: "block",
              overflowWrap: "break-word",
            }}
          >
            {container.name}
          </span>
          <span style={{ fontSize: "10px", marginTop: "5px", display: "block", color: "#555" }}>
            {container.type.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
});
