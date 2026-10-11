import { ExternalLink, Inbox, LogOut, Send, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageLoader } from "@/components/common/page-loader";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIncomingShares, useOutgoingShares, useShareMutations } from "@/data/use-sharing";
import { useToday } from "@/hooks/use-today";
import { errorMessage } from "@/lib/api/client";
import { formatRelative } from "@/lib/dates";
import { PERMISSION_LABEL, SHAREABLE_LABEL, sharedItemPath } from "@/lib/sharing";
import type { ShareEntry, SharePermission } from "@/types/api";

/** Ringkasan berbagi: item milik orang lain yang dibagikan ke saya, dan item saya yang dibagikan ke orang lain. */
export function SharingTab() {
  const incoming = useIncomingShares();
  const outgoing = useOutgoingShares();
  const { update, remove } = useShareMutations();
  const [leaving, setLeaving] = useState<ShareEntry | null>(null);
  const now = useToday();

  const removeShare = (share: ShareEntry, success: string) =>
    remove.mutate(share.id, {
      onSuccess: () => toast.success(success),
      onError: (error) => toast.error("Gagal", { description: errorMessage(error) }),
    });

  const itemCell = (share: ShareEntry) => {
    const path = share.item ? sharedItemPath(share.recordType, share.recordId) : null;
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{SHAREABLE_LABEL[share.recordType] ?? share.recordType}</Badge>
          {path ? (
            <Link to={path} className="truncate font-semibold hover:underline">
              {share.item?.title || "(tanpa judul)"}
            </Link>
          ) : (
            <span className="truncate font-semibold text-muted-foreground italic">
              Item sudah dihapus / diarsipkan pemilik
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        icon={Inbox}
        title="Dibagikan dengan saya"
        description="Item milik pengguna lain yang dapat Anda akses. Item ini juga tampil di modulnya masing-masing dengan penanda pemilik."
      >
        {incoming.isLoading ? (
          <PageLoader />
        ) : !incoming.data?.length ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Belum ada item yang dibagikan kepada Anda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {incoming.data.map((share) => (
              <li
                key={share.id}
                className="flex flex-col gap-3 rounded-2xl border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  {itemCell(share)}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dari <span className="font-medium text-foreground">{share.owner?.name}</span> ·{" "}
                    {formatRelative(share.createdAt, now)}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Badge className="bg-info/15 text-info">{PERMISSION_LABEL[share.permission]}</Badge>
                  {share.item && sharedItemPath(share.recordType, share.recordId) && (
                    <Button size="sm" variant="secondary" asChild>
                      <Link to={sharedItemPath(share.recordType, share.recordId)!}>
                        <ExternalLink /> Buka
                      </Link>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setLeaving(share)}>
                    <LogOut /> Keluar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        icon={Send}
        title="Dibagikan oleh saya"
        description="Item Anda yang dapat diakses pengguna lain. Untuk menambah penerima, buka item lalu pilih Bagikan."
      >
        {outgoing.isLoading ? (
          <PageLoader />
        ) : !outgoing.data?.length ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            <Share2 className="mx-auto mb-2 size-5" />
            Anda belum membagikan item apa pun. Tombol <b>Bagikan</b> tersedia di Project, Area, Resource, Catatan,
            Notes AI, List, Agenda, dan arsip File Control.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {outgoing.data.map((share) => (
              <li
                key={share.id}
                className="flex flex-col gap-3 rounded-2xl border p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  {itemCell(share)}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ke <span className="font-medium text-foreground">{share.recipient?.name}</span> (
                    {share.recipient?.email}) · {formatRelative(share.createdAt, now)}
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Select
                    value={share.permission}
                    onValueChange={(value) =>
                      update.mutate(
                        { id: share.id, permission: value as SharePermission },
                        {
                          onError: (error) => toast.error("Gagal mengubah izin", { description: errorMessage(error) }),
                        },
                      )
                    }
                  >
                    <SelectTrigger className="w-28" aria-label="Izin">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["view", "comment", "edit"] as const).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PERMISSION_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => removeShare(share, "Akses dicabut.")}>
                    <Trash2 className="text-destructive" /> Cabut
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={!!leaving}
        onOpenChange={(open) => !open && setLeaving(null)}
        title="Keluar dari berbagi?"
        description="Anda tidak akan bisa melihat item ini lagi kecuali pemiliknya membagikannya kembali."
        itemName={leaving?.item?.title ?? undefined}
        confirmLabel="Keluar"
        onConfirm={() => {
          if (leaving) removeShare(leaving, "Anda keluar dari berbagi.");
          setLeaving(null);
        }}
      />
    </div>
  );
}
