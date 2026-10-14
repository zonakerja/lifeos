import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LockKeyhole, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useChangePassword, useUpdateProfile } from "@/data/use-auth";
import { errorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import type { PublicUser } from "@/types/api";

const schema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi."),
    email: z.string().trim().min(1, "Email wajib diisi.").email("Format email tidak valid."),
    phone: z.string(),
    address: z.string(),
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    const wantsChange = v.currentPassword || v.newPassword || v.confirmPassword;
    if (!wantsChange) return;
    if (!v.currentPassword)
      ctx.addIssue({ code: "custom", path: ["currentPassword"], message: "Password saat ini belum diisi." });
    if (!v.newPassword) ctx.addIssue({ code: "custom", path: ["newPassword"], message: "Password baru belum diisi." });
    else if (v.newPassword.length < 3)
      ctx.addIssue({ code: "custom", path: ["newPassword"], message: "Password baru minimal 3 karakter." });
    if (v.newPassword !== v.confirmPassword)
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Konfirmasi password baru tidak cocok." });
  });

type FormValues = z.infer<typeof schema>;

export function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  // Form diisi sekali dari profil saat dibuka; key = akun agar ganti akun selalu mulai dari data baru
  return user ? <ProfileFormInner key={user.id} user={user} /> : null;
}

function ProfileFormInner({ user }: { user: PublicUser }) {
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      address: user.address ?? "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateProfile.mutateAsync({
        name: values.name,
        email: values.email,
        phone: values.phone,
        address: values.address,
      });
      if (values.newPassword) {
        await changePassword.mutateAsync({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
      }
      form.reset({ ...values, currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Profil Anda berhasil diperbarui.");
    } catch (error) {
      toast.error("Gagal menyimpan profil", { description: errorMessage(error) });
    }
  });

  const isSaving = updateProfile.isPending || changePassword.isPending;

  return (
    <SectionCard icon={UserRound} title="Edit Profil" description="Perbarui informasi pribadi dan password Anda.">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="profile-name">Nama Lengkap</FieldLabel>
              <Input id="profile-name" aria-invalid={!!errors.name} {...form.register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="profile-email">Email</FieldLabel>
              <Input id="profile-email" type="email" aria-invalid={!!errors.email} {...form.register("email")} />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-phone">No. HP</FieldLabel>
              <Input id="profile-phone" placeholder="08..." {...form.register("phone")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-address">Alamat</FieldLabel>
              <Input id="profile-address" placeholder="Jalan..." {...form.register("address")} />
            </Field>
          </div>

          <FieldSet className="rounded-2xl border bg-muted/40 p-4 md:p-5">
            <FieldLegend className="flex items-center gap-2">
              <LockKeyhole className="size-4 text-module" /> Ganti Password
            </FieldLegend>
            <FieldGroup className="gap-4">
              <Field data-invalid={!!errors.currentPassword}>
                <FieldLabel htmlFor="current-password">Password Saat Ini</FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Kosongkan jika tidak mengubah"
                  aria-invalid={!!errors.currentPassword}
                  {...form.register("currentPassword")}
                />
                <FieldError errors={[errors.currentPassword]} />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field data-invalid={!!errors.newPassword}>
                  <FieldLabel htmlFor="new-password">Password Baru</FieldLabel>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    aria-invalid={!!errors.newPassword}
                    {...form.register("newPassword")}
                  />
                  <FieldError errors={[errors.newPassword]} />
                </Field>
                <Field data-invalid={!!errors.confirmPassword}>
                  <FieldLabel htmlFor="confirm-password">Konfirmasi Password</FieldLabel>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    aria-invalid={!!errors.confirmPassword}
                    {...form.register("confirmPassword")}
                  />
                  <FieldError errors={[errors.confirmPassword]} />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Spinner /> : <CheckCircle2 />} Simpan Profil
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SectionCard>
  );
}
