import { zodResolver } from "@hookform/resolvers/zod";
import { Activity, AtSign, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { appLogoUrl, useAppSettings } from "@/data/use-app-settings";
import { useLogin } from "@/data/use-auth";
import { errorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";

const schema = z.object({
  email: z.string().trim().min(1, "Email wajib diisi.").email("Format email tidak valid."),
  password: z.string().min(1, "Password wajib diisi."),
});

type FormValues = z.infer<typeof schema>;

function LoginPage() {
  const { settings } = useAppSettings();
  const logoUrl = appLogoUrl(settings);
  const isAuthenticated = useAuthStore((s) => s.status === "authenticated");
  const location = useLocation();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit((values) =>
    login
      .mutateAsync(values)
      .catch((error: unknown) =>
        toast.error("Login gagal", { description: errorMessage(error, "Tidak dapat login.") }),
      ),
  );

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 sm:p-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-primary/10 md:grid-cols-[1fr_1.1fr]">
        {/* Panel branding */}
        <section
          data-module="overview"
          className="relative flex flex-col justify-between gap-10 overflow-hidden bg-module-gradient p-8 text-white md:p-10"
        >
          <div className="pointer-events-none absolute inset-0 bg-dots opacity-70" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-mod-planner/40 blur-3xl" />

          <div className="relative flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-primary shadow-lg">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="size-full object-cover" />
              ) : (
                <Activity className="size-8" strokeWidth={2.75} />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-3xl font-extrabold tracking-wider">{settings.name}</p>
              <p className="mt-1 text-sm font-bold tracking-widest text-white/80 uppercase">{settings.loginSub}</p>
            </div>
          </div>

          <h2 className="relative text-2xl leading-snug font-bold md:text-3xl">{settings.motto}</h2>

          <div className="relative flex flex-wrap gap-2">
            {(["planner", "notes", "productivity", "files"] as const).map((key) => (
              <span key={key} data-module={key} className="h-1.5 w-10 rounded-full bg-module ring-1 ring-white/40" />
            ))}
          </div>
          <p className="relative text-xs font-medium text-white/75">{settings.footerText}</p>
        </section>

        {/* Form login */}
        <section className="flex flex-col justify-center p-8 md:p-12">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">{settings.welcomeTitle}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{settings.welcomeSub}</p>
          </div>

          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.email}>
                <FieldLabel htmlFor="email">User ID / Email</FieldLabel>
                <InputGroup className="h-11">
                  <InputGroupAddon>
                    <AtSign />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="nama@contoh.com"
                    aria-invalid={!!form.formState.errors.email}
                    {...form.register("email")}
                  />
                </InputGroup>
                <FieldError errors={[form.formState.errors.email]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.password}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <InputGroup className="h-11">
                  <InputGroupAddon>
                    <LockKeyhole />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    aria-invalid={!!form.formState.errors.password}
                    {...form.register("password")}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError errors={[form.formState.errors.password]} />
              </Field>

              <Button
                type="submit"
                size="lg"
                className="mt-2 h-11 w-full text-base font-bold"
                disabled={login.isPending}
              >
                {login.isPending ? <Spinner /> : "Masuk Aplikasi"}
              </Button>
            </FieldGroup>
          </form>
        </section>
      </div>
    </div>
  );
}

/** Dipakai `lazy` router. */
export const Component = LoginPage;
