import { Activity, ImageUp, LayoutGrid, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { PageLoader } from "@/components/common/page-loader";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { appLogoUrl, useAppSettings, useUpdateAppSettings } from "@/data/use-app-settings";
import { errorMessage } from "@/lib/api/client";
import type { AppSettings } from "@/types/api";

const MAX_LOGO_BYTES = 1_000_000;

interface AppForm {
  name: string;
  navSub: string;
  loginSub: string;
  motto: string;
  welcomeTitle: string;
  welcomeSub: string;
  footerText: string;
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const toForm = (settings: AppSettings): AppForm => ({
  name: settings.name,
  navSub: settings.navSub,
  loginSub: settings.loginSub,
  motto: settings.motto,
  welcomeTitle: settings.welcomeTitle,
  welcomeSub: settings.welcomeSub,
  footerText: settings.footerText,
});

export function AppTab() {
  const { settings, isSuccess } = useAppSettings();
  // Form diisi sekali setelah data server termuat (tanpa sinkronisasi props → state)
  return isSuccess ? <AppSettingsForm settings={settings} /> : <PageLoader />;
}

function AppSettingsForm({ settings }: { settings: AppSettings }) {
  const update = useUpdateAppSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<AppForm>({ defaultValues: toForm(settings) });
  // undefined = logo tidak diubah, "" = dihapus, data URL = gambar baru
  const [logoChange, setLogoChange] = useState<string>();
  const logo = logoChange === undefined ? appLogoUrl(settings) : logoChange || null;

  const onLogoChange = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Ukuran file terlalu besar", { description: "Maksimal 1 MB." });
      return;
    }
    setLogoChange(await readAsDataUrl(file));
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!values.name.trim()) {
      toast.error("Nama aplikasi wajib diisi.");
      return;
    }
    try {
      const saved = await update.mutateAsync(logoChange === undefined ? values : { ...values, appLogo: logoChange });
      form.reset(toForm(saved));
      setLogoChange(undefined);
      toast.success("Pengaturan aplikasi berhasil diperbarui.");
    } catch (error) {
      toast.error("Gagal menyimpan pengaturan", { description: errorMessage(error) });
    }
  });

  return (
    <SectionCard
      icon={LayoutGrid}
      title="Konfigurasi Aplikasi"
      description="Atur branding dan identitas aplikasi Anda."
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Logo Aplikasi</FieldLabel>
            <div className="flex items-center gap-4">
              <span
                data-module="overview"
                className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-module-gradient text-white shadow-lg shadow-module/25"
              >
                {logo ? (
                  <img src={logo} alt="Logo" className="size-full object-cover" />
                ) : (
                  <Activity className="size-8" />
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImageUp /> Upload Gambar
                </Button>
                {logo && (
                  <Button type="button" variant="destructive" size="sm" onClick={() => setLogoChange("")}>
                    <Trash2 /> Hapus Logo
                  </Button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    void onLogoChange(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <FieldDescription>Disarankan format PNG transparan rasio 1:1 (maks. 1 MB).</FieldDescription>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="app-name">Nama Aplikasi</FieldLabel>
              <Input id="app-name" placeholder="LifeOS" required {...form.register("name")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="app-navsub">Sub Nama (Navbar)</FieldLabel>
              <Input id="app-navsub" placeholder="Boleh dikosongkan..." {...form.register("navSub")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="app-loginsub">Sub Nama (Halaman Login)</FieldLabel>
              <Input id="app-loginsub" placeholder="Ultimate" {...form.register("loginSub")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="app-motto">Motto Aplikasi (Login)</FieldLabel>
              <Input id="app-motto" placeholder="Design Your Life..." {...form.register("motto")} />
            </Field>
          </div>

          <FieldSet className="rounded-2xl border bg-muted/40 p-4 md:p-5">
            <FieldLegend>Teks Sambutan (Halaman Login)</FieldLegend>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="app-welcome-title">Judul Sambutan</FieldLabel>
                <Input id="app-welcome-title" placeholder="Selamat Datang Kembali" {...form.register("welcomeTitle")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="app-welcome-sub">Sub-judul Sambutan</FieldLabel>
                <Input id="app-welcome-sub" placeholder="Silakan masuk untuk..." {...form.register("welcomeSub")} />
              </Field>
            </FieldGroup>
          </FieldSet>

          <Field>
            <FieldLabel htmlFor="app-footer">Teks Footer (Bawah Login)</FieldLabel>
            <Textarea
              id="app-footer"
              rows={3}
              placeholder="Informasi kontak, versi aplikasi, atau kutipan..."
              {...form.register("footerText")}
            />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : <Save />} Simpan Pengaturan
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SectionCard>
  );
}
