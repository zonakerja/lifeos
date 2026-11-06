import {
  CheckCircle2,
  DatabaseZap,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Network,
  PlugZap,
  TriangleAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageLoader } from "@/components/common/page-loader";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { AiRoutingCard } from "@/features/settings/ai-routing-card";
import {
  useAiSettings,
  useRemoveAiProvider,
  useSaveAiProvider,
  useTestAiProvider,
  useUpdateAiSettings,
} from "@/data/use-ai-settings";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { AiApiFormat, AiAttachmentKind, AiProviderSettings, AiSettings } from "@/types/api";

const KIND_LABELS: Record<AiAttachmentKind, string> = { pdf: "PDF", image: "gambar", text: "teks", audio: "audio" };

const FORMAT_LABELS: Record<AiApiFormat, string> = {
  openai: "OpenAI-compatible (Chat Completions)",
  anthropic: "Anthropic Messages",
};

/** Label provider beserta jalurnya ("Google Gemini lewat router.example.com"). */
const providerLabel = (p: AiProviderSettings) => (p.via ? `${p.label} lewat ${p.via}` : p.label);

/** Pengaturan → Model AI: provider aktif, API key (terenkripsi di server), dan model per provider. */
export function AiSettingsTab() {
  const { data, isLoading, error } = useAiSettings();

  if (isLoading) return <PageLoader />;
  if (!data) {
    return (
      <SectionCard icon={Sparkles} title="Model AI">
        <p className="text-sm text-destructive">Gagal memuat pengaturan AI: {errorMessage(error)}</p>
      </SectionCard>
    );
  }

  const active = data.providers.find((p) => p.id === data.activeProvider);

  return (
    <SectionCard
      icon={Sparkles}
      title="Model AI"
      description="Pilih provider AI dan simpan API key milik Anda. Key hanya berlaku untuk akun Anda."
    >
      <div className="flex flex-col gap-5">
        <div
          className={cn(
            "flex items-start gap-3 rounded-2xl p-4 text-sm",
            active ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
          )}
        >
          {active ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <PlugZap className="mt-0.5 size-4 shrink-0" />
          )}
          <p>
            {active ? (
              <>
                Fitur AI memakai <b>{providerLabel(active)}</b> dengan model{" "}
                <b>{active.model || active.defaultModel}</b>.
              </>
            ) : (
              "AI belum diatur. Simpan API key salah satu provider di bawah agar chatbot, pencarian AI, Notes AI, dan ringkasan resource bisa dipakai."
            )}
          </p>
        </div>

        <FallbackSwitch settings={data} />

        {data.providers.map((provider) => (
          // Remount setelah disimpan agar form kembali ke nilai dari server
          <ProviderCard
            key={`${provider.id}:${provider.updatedAt ?? "baru"}`}
            provider={provider}
            active={provider.id === data.activeProvider}
          />
        ))}

        <AiRoutingCard settings={data} />

        <Link
          to="/tools/index"
          className="flex w-fit items-center gap-1 text-xs font-medium text-info underline-offset-2 hover:underline"
        >
          <DatabaseZap className="size-3.5" /> Indeks Pengetahuan (RAG) — nyala/mati, indeks ulang, dan uji pencarian —
          ada di Tools → Indeks Pengetahuan
        </Link>

        <div className="flex items-start gap-3 rounded-2xl bg-info/10 p-4 text-xs text-info">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p className="leading-relaxed">
            API key disimpan terenkripsi di server dan tidak pernah dikirim kembali ke browser — hanya 4 karakter
            terakhirnya yang ditampilkan. Permintaan AI diproses oleh server LifeOS memakai kuota akun provider Anda.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

/** Sakelar cadangan otomatis: provider lain yang punya key dipakai bila provider aktif tidak bisa melayani. */
function FallbackSwitch({ settings }: { settings: AiSettings }) {
  const update = useUpdateAiSettings();
  const backups = settings.providers.filter((p) => p.configured && p.id !== settings.activeProvider);

  const toggle = async (fallbackEnabled: boolean) => {
    try {
      await update.mutateAsync({ fallbackEnabled });
      toast.success(fallbackEnabled ? "Cadangan otomatis dinyalakan." : "Cadangan otomatis dimatikan.");
    } catch (error) {
      toast.error("Gagal mengubah cadangan otomatis", { description: errorMessage(error) });
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="ai-fallback" className="font-semibold">
          Cadangan otomatis
        </label>
        <p className="text-xs text-muted-foreground">
          Bila provider aktif kehabisan kuota atau tidak dapat dihubungi, atau tidak mendukung lampiran (mis. audio),
          provider lain yang punya key dipakai otomatis dan Anda diberi tahu. Key ditolak atau model tidak tersedia
          tetap ditampilkan sebagai error agar bisa diperbaiki.
        </p>
        <p className="text-xs text-muted-foreground">
          Cadangan saat ini:{" "}
          {backups.length > 0 ? (
            <b>{backups.map(providerLabel).join(", ")}</b>
          ) : (
            "belum ada — simpan API key provider lain di bawah."
          )}
        </p>
      </div>
      <Switch
        id="ai-fallback"
        checked={settings.fallbackEnabled}
        disabled={update.isPending}
        onCheckedChange={(checked) => void toggle(checked)}
      />
    </div>
  );
}

function ProviderCard({ provider, active }: { provider: AiProviderSettings; active: boolean }) {
  const save = useSaveAiProvider();
  const remove = useRemoveAiProvider();
  const setActive = useUpdateAiSettings();
  const test = useTestAiProvider();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(provider.model ?? "");
  const [viaRouter, setViaRouter] = useState(!!provider.baseUrl);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [apiFormat, setApiFormat] = useState<AiApiFormat>(provider.apiFormat ?? provider.formats[0] ?? "openai");
  const [embeddingModel, setEmbeddingModel] = useState(provider.embeddingModel ?? "");
  const [visible, setVisible] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const nextBaseUrl = viaRouter ? baseUrl.trim() : "";
  // Ganti jalur (langsung ↔ router / alamat lain) = key lama tidak dipakai lagi → server meminta key baru
  const routeChanged = provider.configured && nextBaseUrl !== (provider.baseUrl ?? "");
  const endpointDirty =
    routeChanged ||
    (viaRouter && apiFormat !== (provider.apiFormat ?? provider.formats[0])) ||
    (viaRouter && embeddingModel.trim() !== (provider.embeddingModel ?? ""));
  const dirty = !!apiKey.trim() || model.trim() !== (provider.model ?? "") || endpointDirty;
  const needsKey = (routeChanged || !provider.configured) && !apiKey.trim();
  const missingUrl = viaRouter && !baseUrl.trim();
  const busy = save.isPending || remove.isPending || setActive.isPending || test.isPending;
  const attachments = (Object.keys(KIND_LABELS) as AiAttachmentKind[])
    .filter((kind) => provider.supports[kind])
    .map((kind) => KIND_LABELS[kind])
    .join(", ");

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        provider: provider.id,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model: model.trim() || null,
        baseUrl: nextBaseUrl || null,
        ...(viaRouter ? { apiFormat, embeddingModel: embeddingModel.trim() || null } : {}),
      });
      toast.success(`Pengaturan ${provider.label} disimpan.`);
    } catch (error) {
      toast.error(`Gagal menyimpan ${provider.label}`, { description: errorMessage(error) });
    }
  };

  const handleTest = async () => {
    try {
      const result = await test.mutateAsync(provider.id);
      toast.success(`${providerLabel(provider)} terhubung`, {
        description: `Model ${result.model} menjawab: "${result.text}"`,
      });
    } catch (error) {
      toast.error(`Uji ${provider.label} gagal`, { description: errorMessage(error) });
    }
  };

  const handleActivate = async () => {
    try {
      await setActive.mutateAsync({ activeProvider: provider.id });
      toast.success(`${provider.label} sekarang dipakai untuk semua fitur AI.`);
    } catch (error) {
      toast.error("Gagal mengganti provider", { description: errorMessage(error) });
    }
  };

  const handleRemove = async () => {
    try {
      await remove.mutateAsync(provider.id);
      toast.success(`API key ${provider.label} dihapus.`);
    } catch (error) {
      toast.error("Gagal menghapus API key", { description: errorMessage(error) });
    }
  };

  const keyId = `ai-key-${provider.id}`;
  const modelId = `ai-model-${provider.id}`;

  return (
    <div
      className={cn("flex flex-col gap-4 rounded-2xl border p-4", active && "border-success ring-1 ring-success/40")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">{provider.label}</h4>
          {active && <Badge className="bg-success/15 text-success">Aktif</Badge>}
          {provider.configured && (
            <Badge variant="outline" className="font-mono">
              Key tersimpan{provider.keyHint ? ` …${provider.keyHint}` : ""}
            </Badge>
          )}
          {provider.via && (
            <Badge className="bg-info/15 text-info">
              <Network /> Lewat {provider.via}
            </Badge>
          )}
        </div>
        {provider.configured && !active && (
          <Button size="sm" variant="outline" onClick={handleActivate} disabled={busy}>
            {setActive.isPending ? <Spinner /> : <CheckCircle2 />} Pakai provider ini
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Koneksi</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={viaRouter ? "router" : "direct"}
            onValueChange={(value) => value && setViaRouter(value === "router")}
          >
            <ToggleGroupItem value="direct">Langsung (API resmi)</ToggleGroupItem>
            <ToggleGroupItem value="router">Lewat router</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {viaRouter && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${keyId}-url`}>Alamat API router</FieldLabel>
                <Input
                  id={`${keyId}-url`}
                  placeholder="https://router.example.com/v1"
                  className="font-mono"
                  autoComplete="off"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <FieldDescription>
                  Alamat dasar (base URL) dari dokumentasi router, biasanya berakhiran <code>/v1</code>.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Format API</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  className="flex-wrap justify-start"
                  value={apiFormat}
                  onValueChange={(value) => value && setApiFormat(value as AiApiFormat)}
                >
                  {provider.formats.map((format) => (
                    <ToggleGroupItem key={format} value={format}>
                      {FORMAT_LABELS[format]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  {provider.formats.includes("anthropic")
                    ? "Anthropic Messages disarankan untuk Claude (cache prompt & pemikiran tetap jalan); pilih OpenAI bila router hanya menyediakan /chat/completions."
                    : "Router dipanggil lewat /chat/completions (format yang didukung hampir semua router)."}
                </FieldDescription>
              </Field>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <p className="leading-relaxed">
                Router adalah pihak ketiga: semua isi permintaan AI (termasuk dokumen & data kantor) melewati server
                router sebelum ke penyedia model. Pastikan Anda memercayai router itu. ID model mengikuti dokumentasi
                router (bisa berbeda dengan ID resmi, mis. <code>claude-opus-5.5</code>).
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={keyId}>{viaRouter ? "API Key router" : "API Key"}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={keyId}
              type={visible ? "text" : "password"}
              placeholder={
                needsKey && provider.configured
                  ? "Wajib diisi: key untuk koneksi baru"
                  : provider.configured
                    ? "Isi hanya untuk mengganti key"
                    : "Tempel API key di sini"
              }
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
          <FieldDescription>
            {viaRouter ? (
              "Key dari dashboard router (bukan key resmi provider)."
            ) : (
              <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                Buat API key <ExternalLink className="size-3" />
              </a>
            )}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={modelId}>Model</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={modelId}
              placeholder={`${provider.defaultModel} (default)`}
              className="font-mono"
              autoComplete="off"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <InputGroupButton size="icon-xs" aria-label="Pilih model">
                    <ChevronDown />
                  </InputGroupButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-64">
                  <DropdownMenuLabel>Model {provider.label}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={model.trim() || provider.defaultModel}
                    // Model default disimpan kosong agar mengikuti default terbaru aplikasi
                    onValueChange={(value) => setModel(value === provider.defaultModel ? "" : value)}
                  >
                    {provider.suggestedModels.map((m) => (
                      <DropdownMenuRadioItem key={m} value={m} className="font-mono">
                        {m}
                        {m === provider.defaultModel && (
                          <Badge variant="outline" className="ml-auto font-sans">
                            default
                          </Badge>
                        )}
                        {m.includes("preview") && (
                          <Badge className="ml-auto bg-warning/15 font-sans text-warning">preview</Badge>
                        )}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            {viaRouter
              ? `Ketik ID model persis seperti di dokumentasi router. Kosong = ${provider.defaultModel} (ID resmi, belum tentu dikenal router).`
              : `Pilih dari daftar atau ketik ID model lain. Kosong = default (${provider.defaultModel}). Model "preview" bisa dihentikan provider sewaktu-waktu.`}
          </FieldDescription>
        </Field>

        {viaRouter && provider.defaultEmbeddingModel && (
          <Field>
            <FieldLabel htmlFor={`${modelId}-embed`}>Model embedding (indeks pengetahuan)</FieldLabel>
            <Input
              id={`${modelId}-embed`}
              placeholder={`${provider.defaultEmbeddingModel} (default)`}
              className="font-mono"
              autoComplete="off"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
            />
            <FieldDescription>
              Dipakai bila provider ini menjadi embedding di Pembagian tugas AI (router lewat /embeddings, 768 dimensi).
              Ganti model = indeks dibangun ulang.
            </FieldDescription>
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Lampiran yang didukung: {attachments}.</p>
        <div className="flex flex-wrap gap-2">
          {provider.configured && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
              >
                <Trash2 /> Hapus key
              </Button>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={busy || dirty}>
                {test.isPending ? <Spinner /> : <PlugZap />} Uji koneksi
              </Button>
            </>
          )}
          {dirty && needsKey && (
            <span className="self-center text-xs text-warning">Isi API key untuk koneksi ini.</span>
          )}
          <Button size="sm" onClick={handleSave} disabled={busy || !dirty || needsKey || missingUrl}>
            {save.isPending ? <Spinner /> : <CheckCircle2 />} Simpan
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Hapus API key?"
        itemName={provider.label}
        description={
          active
            ? "Provider ini sedang aktif. Fitur AI akan memakai provider lain yang masih punya key, atau nonaktif."
            : undefined
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={handleRemove}
      />
    </div>
  );
}
