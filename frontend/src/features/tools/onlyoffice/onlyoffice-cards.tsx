import { AlertTriangle, FilePen, FileStack, Sparkles, Trash2, Type, Upload } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { previewFile } from "@/components/common/file-preview";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { queryKeys } from "@/data/query-keys";
import {
  useOfficeFonts,
  useOfficePreferences,
  useOfficeTemplates,
  useUpdateOfficePreferences,
} from "@/data/use-office";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { isAdminRole, useAuthStore } from "@/stores/auth-store";
import type { OfficeFormat, OfficeTemplate } from "@/types/api";
import { useQueryClient } from "@tanstack/react-query";
import { OFFICE_KIND_ICON, openOfficeEditor } from "./office-editor-host";
import { OFFICE_KIND_LABELS } from "./office-formats";
import { DOCUMENT_ACCEPT, TEMPLATE_CONTEXT, isDocumentFile } from "./office-templates";

const KIND_OF_TARGET: Record<OfficeFormat, keyof typeof OFFICE_KIND_ICON> = {
  docx: "word",
  xlsx: "cell",
  pptx: "slide",
  pdf: "pdf",
};

/**
 * AI di editor (keputusan user): tab **AI** bawaan ONLYOFFICE (Chatbot, Summarization, Translation, Grammar & Spelling,
 * asisten kustom, OCR) dengan provider & API key yang sama dengan Pengaturan → AI — satu pintu, tanpa pengaturan key di
 * editor. Sakelar pribadi; berlaku saat dokumen dibuka berikutnya.
 */
export function OfficeAiCard() {
  const { data, isLoading, error } = useOfficePreferences();
  const update = useUpdateOfficePreferences();
  const checked = update.isPending && update.variables !== undefined ? update.variables : !!data?.ai;

  const change = (next: boolean) =>
    update.mutate(next, {
      onSuccess: () =>
        toast.success(next ? "AI di editor diaktifkan" : "AI di editor dimatikan", {
          description: "Berlaku saat dokumen dibuka berikutnya.",
        }),
      onError: (err) => toast.error("Pengaturan AI gagal disimpan", { description: errorMessage(err) }),
    });

  return (
    <SectionCard
      icon={Sparkles}
      title="AI di editor"
      description="Tab AI ONLYOFFICE memakai AI LifeOS (Pengaturan → AI)."
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">{errorMessage(error)}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Label
            htmlFor="office-ai-switch"
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal",
              checked && "border-module bg-module-soft",
            )}
          >
            <Switch
              id="office-ai-switch"
              checked={checked}
              disabled={update.isPending}
              onCheckedChange={change}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block font-semibold">Aktifkan tab AI di editor</span>
              <span className="text-sm text-muted-foreground">
                Semua fitur AI bawaan ONLYOFFICE — Chatbot, Summarization, Translation, Grammar & Spelling, asisten
                kustom, OCR PDF — dijawab provider AI Anda
                {data?.provider ? (
                  <>
                    {" "}
                    (<b>{data.provider.label}</b> · {data.provider.model})
                  </>
                ) : null}
                . API key tetap di server LifeOS; tidak ada pengaturan key di editor. Mati = tidak ada isi dokumen yang
                dikirim ke AI.
              </span>
            </span>
          </Label>
          {checked && data && !data.aiReady && (
            <Notice>
              AI belum bisa menjawab: pilih provider dan simpan API key di{" "}
              <Link to="/settings/api" className="font-medium underline">
                Pengaturan → AI
              </Link>
              .
            </Notice>
          )}
          <p className="text-xs text-muted-foreground">
            Pilih teks dulu agar AI memproses bagian itu saja. Bahasa hasil ringkasan/terjemahan dipilih di jendela
            fiturnya (Target language). Pembuatan gambar belum didukung.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Templat dokumen milik user (keputusan user: diunggah di sini, bukan lewat Resource). Dipakai "Buat Dokumen
 * (ONLYOFFICE)" → "Dari templat": isinya disalin ke dokumen baru, templat tetap utuh.
 */
export function OfficeTemplatesCard() {
  const { data: templates = [], isLoading } = useOfficeTemplates();
  const client = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<OfficeTemplate | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.officeTemplates });

  const upload = async (files: File[]) => {
    const valid = files.filter((file) => isDocumentFile(file.name, file.type));
    if (valid.length < files.length) {
      toast.error("Sebagian berkas dilewati", {
        description: "Templat harus berupa dokumen, spreadsheet, presentasi, atau PDF.",
      });
    }
    if (valid.length === 0) return;
    setUploading(true);
    try {
      for (const file of valid) await uploadsApi.upload(file, TEMPLATE_CONTEXT);
      toast.success(valid.length > 1 ? `${valid.length} templat ditambahkan` : "Templat ditambahkan");
    } catch (err) {
      toast.error("Templat gagal diunggah", { description: errorMessage(err) });
    } finally {
      setUploading(false);
      void refresh();
    }
  };

  const remove = async (template: OfficeTemplate) => {
    try {
      await uploadsApi.remove(template.id);
      toast.success("Templat dihapus");
    } catch (err) {
      toast.error("Templat gagal dihapus", { description: errorMessage(err) });
    } finally {
      void refresh();
    }
  };

  return (
    <SectionCard
      icon={FileStack}
      title="Templat dokumen"
      description="Kop surat, nota dinas, notulen, format laporan — dipakai saat Buat Dokumen."
      action={
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Spinner /> : <Upload />} Unggah templat
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void upload(files);
        }}
      />
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Unggah DOCX/DOTX/ODT, XLSX/XLTX, PPTX/POTX, atau PDF. Di form lampiran atau Resource, pilih Tipe{" "}
          <b>Buat Dokumen (ONLYOFFICE)</b> → bagian <b>Dari templat</b>: isinya disalin ke dokumen baru (DOTX/ODT/…
          menjadi DOCX/XLSX/PPTX), templat tetap utuh. <b>Sunting</b> mengubah templat itu sendiri.
        </p>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : templates.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Belum ada templat.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {templates.map((template) => {
              const kind = KIND_OF_TARGET[template.target];
              const Icon = OFFICE_KIND_ICON[kind];
              return (
                <li key={template.id} className="flex min-w-0 items-center gap-2 rounded-xl border p-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-module/12 text-module">
                    <Icon className="size-4" />
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                    title={`Lihat ${template.originalName}`}
                    onClick={() =>
                      previewFile({ uploadId: template.id, name: template.originalName, mimeType: template.mimeType })
                    }
                  >
                    {template.name}
                  </button>
                  <Badge variant="outline" className="shrink-0">
                    {OFFICE_KIND_LABELS[kind]}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Sunting templat di ONLYOFFICE"
                    onClick={() =>
                      openOfficeEditor({ uploadId: template.id, name: template.originalName, onClosed: refresh })
                    }
                  >
                    <FilePen />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="Hapus templat" onClick={() => setRemoving(template)}>
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Hapus templat?"
        itemName={removing?.name}
        description="Dokumen yang sudah dibuat dari templat ini tidak terpengaruh."
        confirmLabel="Hapus templat"
        onConfirm={() => {
          if (removing) void remove(removing);
          setRemoving(null);
        }}
      />
    </SectionCard>
  );
}

/** Font yang terpasang di server ONLYOFFICE + cara menambah font (folder font di server, keputusan user). */
export function OfficeFontsCard() {
  const { data, isLoading } = useOfficeFonts();
  const admin = isAdminRole(useAuthStore((state) => state.user?.role));
  const [query, setQuery] = useState("");
  const families = useMemo(() => {
    const words = query.trim().toLowerCase();
    return (data?.families ?? []).filter((name) => !words || name.toLowerCase().includes(words));
  }, [data, query]);

  return (
    <SectionCard
      icon={Type}
      title="Font"
      description={
        data?.available ? `${data.families.length} keluarga font terpasang di server ONLYOFFICE.` : "Font di editor."
      }
      action={<SearchInput value={query} onChange={setQuery} placeholder="Cari font..." className="md:w-52" />}
    >
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !data?.available ? (
          <p className="text-sm text-muted-foreground">
            Daftar font tidak tersedia (server ONLYOFFICE tidak menjawab).
          </p>
        ) : (
          <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
            {families.map((name) => (
              <Badge key={name} variant="outline" className="font-normal" style={{ fontFamily: `"${name}"` }}>
                {name}
              </Badge>
            ))}
            {families.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada font "{query}".</p>}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {admin ? (
            <>
              Menambah font (mis. Bookman Old Style, Century Gothic, Garamond, font kop instansi): salin berkas{" "}
              <b>.ttf/.otf</b> ke folder <code className="rounded bg-muted px-1">infra/onlyoffice/fonts</code> lalu
              restart container ONLYOFFICE — daftar font dibuat ulang otomatis (± 1–2 menit). Panduan:
              docs/ONLYOFFICE.md. Pakai font yang boleh Anda pakai (lisensi).
            </>
          ) : (
            <>Butuh font lain (mis. font kop instansi)? Minta admin aplikasi menambahkannya ke server ONLYOFFICE.</>
          )}
        </p>
      </div>
    </SectionCard>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>{children}</span>
    </p>
  );
}
