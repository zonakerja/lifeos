import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useLatchedWhileOpen } from "@/hooks/use-retained";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Nama item yang terdampak, ditampilkan menonjol. */
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/** Dialog konfirmasi standar (aksi destruktif / penting). */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  description: descriptionProp,
  ...props
}: ConfirmDialogProps) {
  // Teks dipertahankan selama animasi menutup (parent biasanya mengosongkan item saat ditutup)
  const title = useLatchedWhileOpen(open, props.title);
  const itemName = useLatchedWhileOpen(open, props.itemName);
  const confirmLabel = useLatchedWhileOpen(open, props.confirmLabel ?? "Ya, lanjutkan");
  const cancelLabel = useLatchedWhileOpen(open, props.cancelLabel ?? "Batal");
  const destructive = useLatchedWhileOpen(open, props.destructive ?? true);
  const latchedDescription = useLatchedWhileOpen(open, typeof descriptionProp === "string" ? descriptionProp : null);
  const description = typeof descriptionProp === "string" || !descriptionProp ? latchedDescription : descriptionProp;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          {destructive && (
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <AlertTriangle />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {(description || itemName) && (
            <AlertDialogDescription>
              {description}
              {itemName && (
                <span className="mt-2 block rounded-lg bg-muted px-3 py-2 font-semibold text-foreground">
                  {itemName}
                </span>
              )}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
