import { zodResolver } from "@hookform/resolvers/zod";
import { Database, Home, Pencil, Phone, Plus, Share2, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageLoader } from "@/components/common/page-loader";
import { SectionCard } from "@/components/common/section-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ROLE_LABELS } from "@/config/navigation";
import { useUserMutations, useUsers } from "@/data/use-users";
import { useUserStats } from "@/data/use-sharing";
import { useToday } from "@/hooks/use-today";
import { formatRelative } from "@/lib/dates";
import { errorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import type { PublicUser, UserRole, UserStats } from "@/types/api";
import { useRetained } from "@/hooks/use-retained";

const ROLE_BADGE: Record<UserRole, string> = {
  super_admin: "bg-mod-overview/15 text-mod-overview",
  admin: "bg-mod-planner/15 text-mod-planner",
  member: "bg-mod-productivity/15 text-mod-productivity",
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
};

const userSchema = (isNew: boolean) =>
  z.object({
    name: z.string().trim().min(1, "Nama wajib diisi."),
    email: z.string().trim().min(1, "Email wajib diisi.").email("Format email tidak valid."),
    password: isNew
      ? z.string().min(3, "Password wajib diisi (minimal 3 karakter).")
      : z.string().refine((v) => v === "" || v.length >= 3, "Password minimal 3 karakter."),
    role: z.enum(["super_admin", "admin", "member"]),
    phone: z.string(),
    address: z.string(),
  });

type UserForm = z.infer<ReturnType<typeof userSchema>>;

const EMPTY_FORM: UserForm = { name: "", email: "", password: "", role: "member", phone: "", address: "" };

export function UsersTab() {
  const currentUser = useAuthStore((s) => s.user);
  const { data: users = [], isLoading } = useUsers();
  const [editing, setEditing] = useState<PublicUser | "new" | null>(null);
  const [deleting, setDeleting] = useState<PublicUser | null>(null);
  const { remove } = useUserMutations();
  const { data: stats = [] } = useUserStats();
  const now = useToday();

  const isSuperAdmin = currentUser?.role === "super_admin";
  // Admin biasa tidak boleh mengelola akun super admin (juga ditegakkan backend)
  const canManage = (target: PublicUser) => isSuperAdmin || target.role !== "super_admin";

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`Pengguna ${deleting.name} dihapus.`);
    } catch (error) {
      toast.error("Gagal menghapus pengguna", { description: errorMessage(error) });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <SectionCard
      icon={Users}
      title="Manajemen User"
      description="Kelola akun dan role pengguna. Data setiap pengguna terisolasi — admin hanya melihat statistik pemakaian, bukan isi data."
      action={
        <Button onClick={() => setEditing("new")}>
          <Plus /> Tambah User
        </Button>
      }
    >
      {isLoading ? (
        <PageLoader />
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Avatar className="size-10">
                  <AvatarFallback className="bg-module-soft font-bold text-module">
                    {u.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{u.name}</span>
                    <Badge className={ROLE_BADGE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                    {u.id === currentUser?.id && <Badge variant="outline">Anda</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  <UserStatsLine stat={stats.find((st) => st.userId === u.id)} now={now} />
                  {(u.phone || u.address) && (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {u.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" /> {u.phone}
                        </span>
                      )}
                      {u.address && (
                        <span className="flex items-center gap-1">
                          <Home className="size-3" /> {u.address}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {canManage(u) && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
                    <Pencil /> Edit
                  </Button>
                  {u.id !== currentUser?.id && (
                    <Button size="sm" variant="destructive" onClick={() => setDeleting(u)}>
                      <Trash2 /> Hapus
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <UserFormDialog
        target={editing}
        allowSuperAdmin={isSuperAdmin}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus User?"
        description="Akses pengguna akan dicabut permanen."
        itemName={deleting?.name}
        confirmLabel="Hapus"
        onConfirm={confirmDelete}
      />
    </SectionCard>
  );
}

/** Statistik pemakaian (tanpa isi data): jumlah data, berkas & ukurannya, berbagi, aktif terakhir. */
function UserStatsLine({ stat, now }: { stat?: UserStats; now: Date }) {
  if (!stat) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Database className="size-3" /> {stat.records} data · {stat.files} berkas ({formatBytes(stat.storageBytes)})
      </span>
      <span className="flex items-center gap-1">
        <Share2 className="size-3" /> membagikan {stat.sharesOut} · menerima {stat.sharesIn}
      </span>
      <span>Aktif {stat.lastActiveAt ? formatRelative(stat.lastActiveAt, now) : "belum pernah"}</span>
    </div>
  );
}

function UserFormDialog({
  target: targetProp,
  allowSuperAdmin,
  onOpenChange,
}: {
  target: PublicUser | "new" | null;
  allowSuperAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const target = useRetained(targetProp);
  const isNew = target === "new";
  return (
    <Dialog open={targetProp !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Tambah User Baru" : "Edit Data User"}</DialogTitle>
          <DialogDescription>
            {isNew ? "Buat akun baru beserta role aksesnya." : "Perbarui data dan role pengguna."}
          </DialogDescription>
        </DialogHeader>
        {target !== null && (
          <UserForm
            key={isNew ? "new" : target.id}
            target={isNew ? null : target}
            allowSuperAdmin={allowSuperAdmin}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserForm({
  target,
  allowSuperAdmin,
  onDone,
}: {
  target: PublicUser | null;
  allowSuperAdmin: boolean;
  onDone: () => void;
}) {
  const isNew = target === null;
  const { create, update } = useUserMutations();
  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema(isNew)),
    defaultValues: target
      ? {
          name: target.name,
          email: target.email,
          password: "",
          role: target.role,
          phone: target.phone ?? "",
          address: target.address ?? "",
        }
      : EMPTY_FORM,
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password, ...values }) => {
    try {
      if (isNew) {
        await create.mutateAsync({ ...values, password });
        toast.success("Pengguna baru berhasil ditambahkan.");
      } else {
        await update.mutateAsync({ id: target.id, input: { ...values, ...(password ? { password } : {}) } });
        toast.success("Data pengguna berhasil diperbarui.");
      }
      onDone();
    } catch (error) {
      toast.error("Gagal menyimpan pengguna", { description: errorMessage(error) });
    }
  });

  const roles: UserRole[] = allowSuperAdmin ? ["member", "admin", "super_admin"] : ["member", "admin"];
  const saving = create.isPending || update.isPending;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="user-name">Nama Lengkap</FieldLabel>
            <Input id="user-name" aria-invalid={!!errors.name} {...form.register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="user-email">Email</FieldLabel>
            <Input id="user-email" type="email" aria-invalid={!!errors.email} {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="user-password">{isNew ? "Password" : "Password Baru (opsional)"}</FieldLabel>
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              placeholder={isNew ? "••••••••" : "Kosongkan jika tidak diubah"}
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="user-role">Role</FieldLabel>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="user-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="user-phone">No. HP</FieldLabel>
            <Input id="user-phone" placeholder="08..." {...form.register("phone")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="user-address">Alamat</FieldLabel>
            <Input id="user-address" placeholder="Jalan..." {...form.register("address")} />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Batal
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner /> : isNew ? <Plus /> : <Pencil />}
            {isNew ? "Tambah User" : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
