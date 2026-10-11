import { Share2, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageLoader } from "@/components/common/page-loader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useItemShares, useShareMutations, useSharedOutKeys, useUserDirectory } from "@/data/use-sharing";
import { usePermissions } from "@/hooks/use-permissions";
import { errorMessage } from "@/lib/api/client";
import { PERMISSION_HINT, PERMISSION_LABEL, SHARE_SCOPE_HINT, SHAREABLE_LABEL, itemAccess } from "@/lib/sharing";
import { cn } from "@/lib/utils";
import type { ShareableType, ShareMeta, SharePermission } from "@/types/api";

const PERMISSIONS: SharePermission[] = ["view", "comment", "edit"];

function PermissionSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: SharePermission;
  onChange: (value: SharePermission) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SharePermission)} disabled={disabled}>
      <SelectTrigger className={cn("w-32", className)} aria-label="Izin">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERMISSIONS.map((p) => (
          <SelectItem key={p} value={p}>
            {PERMISSION_LABEL[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordType: ShareableType;
  recordId: string;
  title?: string;
}

/** Kelola penerima satu item milik sendiri: tambah (email + izin), ubah izin, cabut. */
export function ShareDialog({ open, onOpenChange, recordType, recordId, title }: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5 text-module" /> Bagikan {SHAREABLE_LABEL[recordType]}
          </DialogTitle>
          <DialogDescription>
            {title ? <span className="font-semibold text-foreground">{title}</span> : null}
            {title ? " — " : ""}
            {SHARE_SCOPE_HINT[recordType]}
          </DialogDescription>
        </DialogHeader>
        {open && <ShareManager recordType={recordType} recordId={recordId} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareManager({ recordType, recordId }: { recordType: ShareableType; recordId: string }) {
  const { data: shares = [], isLoading } = useItemShares(recordType, recordId);
  const { create, update, remove } = useShareMutations();
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<SharePermission>("view");
  const { data: suggestions = [] } = useUserDirectory(email);
  const shownSuggestions = suggestions.filter(
    (u) => u.email !== email.trim().toLowerCase() && !shares.some((s) => s.recipientId === u.id),
  );

  const submit = async () => {
    const target = email.trim();
    if (!target) return;
    try {
      const share = await create.mutateAsync({ recordType, recordId, email: target, permission });
      toast.success(`Dibagikan ke ${share.recipient?.name ?? target}`);
      setEmail("");
    } catch (error) {
      toast.error("Gagal membagikan", { description: errorMessage(error) });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field>
          <FieldLabel htmlFor="share-email">Tambah orang</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="share-email"
              type="email"
              autoComplete="off"
              placeholder="Email atau nama akun"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex gap-2">
              <PermissionSelect value={permission} onChange={setPermission} />
              <Button type="submit" disabled={!email.trim() || create.isPending}>
                {create.isPending ? <Spinner /> : <UserPlus />} Bagikan
              </Button>
            </div>
          </div>
          <FieldDescription>{PERMISSION_HINT[permission]}.</FieldDescription>
        </Field>
        {shownSuggestions.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-xl border p-1" aria-label="Saran akun">
            {shownSuggestions.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => setEmail(u.email)}
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Orang yang memiliki akses</p>
        {isLoading ? (
          <PageLoader />
        ) : shares.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            Belum dibagikan ke siapa pun.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shares.map((share) => (
              <li key={share.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-module-soft text-xs font-bold text-module">
                    {(share.recipient?.name ?? "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{share.recipient?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{share.recipient?.email}</p>
                </div>
                <PermissionSelect
                  value={share.permission}
                  disabled={update.isPending}
                  className="w-28"
                  onChange={(value) =>
                    update.mutate(
                      { id: share.id, permission: value },
                      { onError: (error) => toast.error("Gagal mengubah izin", { description: errorMessage(error) }) },
                    )
                  }
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Cabut akses ${share.recipient?.name ?? ""}`}
                      onClick={() =>
                        remove.mutate(share.id, {
                          onSuccess: () => toast.success("Akses dicabut."),
                          onError: (error) => toast.error("Gagal mencabut akses", { description: errorMessage(error) }),
                        })
                      }
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cabut akses</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface ShareButtonProps {
  item: { id: string | number; share?: ShareMeta };
  recordType: ShareableType;
  title?: string;
  /** Tombol ikon saja (kartu/daftar) */
  iconOnly?: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Tombol "Bagikan" + dialognya. Hanya tampil untuk item milik sendiri; jumlah penerima ditampilkan bila sudah
 * dibagikan.
 */
export function ShareButton({ item, recordType, title, iconOnly, size = "sm", className }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const { canEdit } = usePermissions();
  const count = useSharedOutKeys().get(`${recordType}:${item.id}`) ?? 0;
  if (!itemAccess(item).isOwner || !canEdit) return null;
  const label = count ? `Dibagikan (${count})` : "Bagikan";
  return (
    <>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className={cn(count > 0 && "text-info", className)}
              aria-label={label}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
            >
              <Share2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          size={size}
          variant="outline"
          className={cn(count > 0 && "text-info", className)}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Share2 /> {label}
        </Button>
      )}
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        recordType={recordType}
        recordId={String(item.id)}
        title={title}
      />
    </>
  );
}
