import { Bot, CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useUpdateProfile } from "@/data/use-auth";
import { errorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";

export function ApiKeyTab() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useUpdateProfile();
  const [apiKey, setApiKey] = useState(user?.apiKey ?? "");
  const [visible, setVisible] = useState(false);

  const save = async () => {
    try {
      await updateProfile.mutateAsync({ apiKey: apiKey.trim() });
      toast.success("API Key AI berhasil disimpan untuk akun Anda.");
    } catch (error) {
      toast.error("Gagal menyimpan API Key", { description: errorMessage(error) });
    }
  };

  return (
    <SectionCard
      icon={KeyRound}
      title="Konfigurasi API AI Khusus Anda"
      description="Masukkan API Key dari Google AI Studio. Key ini hanya berlaku untuk akun Anda."
    >
      <div className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="gemini-key">Google Gemini API Key</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              id="gemini-key"
              type={visible ? "text" : "password"}
              placeholder="AIzaSy..."
              className="font-mono"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={visible ? "Sembunyikan key" : "Tampilkan key"}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>Kosongkan lalu simpan untuk menghapus key.</FieldDescription>
        </Field>

        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={updateProfile.isPending}
            className="bg-success text-success-foreground hover:bg-success/85"
          >
            {updateProfile.isPending ? <Spinner /> : <CheckCircle2 />} Simpan Konfigurasi
          </Button>
        </div>

        <div className="flex items-start gap-3 rounded-2xl bg-info/10 p-4 text-xs text-info">
          <span className="mt-0.5 rounded-full bg-info/20 p-1">
            <Bot className="size-3" />
          </span>
          <p className="leading-relaxed">
            API Key ini diikat secara spesifik pada profil Anda. Pengguna lain memiliki API Key mereka sendiri dan tidak
            akan menggunakan kuota Anda.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
