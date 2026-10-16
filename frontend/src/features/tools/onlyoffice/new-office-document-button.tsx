import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOfficeStatus, useOfficeTemplates } from "@/data/use-office";
import { errorMessage } from "@/lib/api/client";
import { officeApi, uploadsApi } from "@/lib/api/endpoints";
import type { OfficeFormat, OfficeTemplate, UploadedAsset } from "@/types/api";
import { OFFICE_KIND_ICON } from "./office-editor-host";
import { NEW_DOCUMENT_TYPES, OFFICE_KIND_LABELS } from "./office-formats";
import { DOCUMENT_ACCEPT, importNeedsConversion, isDocumentFile } from "./office-templates";

/** Pilihan tipe "Buat Dokumen (ONLYOFFICE)" di form lampiran / Resource (nilai UI, disimpan sebagai tipe `file`). */
export const OFFICE_ATTACHMENT_TYPE = "office";
export const OFFICE_ATTACHMENT_LABEL = "Buat Dokumen (ONLYOFFICE)";

/** ONLYOFFICE aktif di server → pilihan "Buat Dokumen" ditawarkan di form. */
export const useOfficeEnabled = () => useOfficeStatus().data?.enabled ?? false;

const KIND_OF_TARGET: Record<OfficeFormat, keyof typeof OFFICE_KIND_ICON> = {
  docx: "word",
  xlsx: "cell",
  pptx: "slide",
  pdf: "pdf",
};

interface NewOfficeDocumentPickerProps {
  /** Judul dokumen (isi "Nama Resource" di form); kosong → nama jenis dokumen / templat / berkas */
  title?: string;
  /** Konteks upload lampiran (mis. "task", "schedule") */
  context?: string;
  /** Pemilik item bersama (izin edit) — dokumen disimpan atas nama pemilik, seperti upload lampiran */
  ownerId?: string;
  disabled?: boolean;
  /** Dokumen sudah dibuat (berkas baru, belum tersimpan di form — perlakukan seperti hasil upload) */
  onCreated: (asset: UploadedAsset) => void;
}

/**
 * Isi tipe "Buat Dokumen" di form lampiran & form Resource: dokumen kosong (Dokumen / Spreadsheet / Presentasi / PDF),
 * **templat** milik user (diunggah di Tools → ONLYOFFICE), atau **impor** berkas DOCX/XLSX/PPTX/… dari komputer.
 * Pemanggil yang membuka editor (agar bisa meringkas setelah editor ditutup).
 */
export function NewOfficeDocumentPicker({
  title,
  context,
  ownerId,
  disabled,
  onCreated,
}: NewOfficeDocumentPickerProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const { data: templates = [] } = useOfficeTemplates();
  const importRef = useRef<HTMLInputElement>(null);

  const run = async (key: string, task: () => Promise<UploadedAsset>) => {
    setBusy(key);
    try {
      onCreated(await task());
    } catch (err) {
      toast.error("Dokumen gagal dibuat", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const create = (format: OfficeFormat) =>
    run(format, () =>
      officeApi.createDocument(
        { format },
        { title: title?.trim() || `${NEW_DOCUMENT_TYPES[format].label} baru`, context, ownerId },
      ),
    );

  // Isi templat disalin ke dokumen baru (templat tetap utuh); judul kosong → nama templat
  const createFromTemplate = (template: OfficeTemplate) =>
    run(`template:${template.id}`, () =>
      officeApi.createDocument({ templateId: template.id }, { title: title?.trim() || undefined, context, ownerId }),
    );

  // Impor: berkas diunggah apa adanya; format lama yang hanya bisa dilihat (DOC, PPT, …) dikonversi ke DOCX/PPTX
  const importFile = (file: File) => {
    if (!isDocumentFile(file.name, file.type)) {
      toast.error("Format tidak didukung", {
        description: "Pilih dokumen, spreadsheet, presentasi, atau PDF (DOCX, XLSX, PPTX, ODT, DOC, PDF, …).",
      });
      return;
    }
    void run("import", async () => {
      const uploaded = await uploadsApi.upload(file, context, ownerId);
      if (!importNeedsConversion(file.name, file.type)) return uploaded;
      try {
        return await officeApi.createDocument(
          { templateId: uploaded.id },
          { title: title?.trim() || file.name.replace(/\.[^.]+$/, ""), context, ownerId },
        );
      } finally {
        await uploadsApi.remove(uploaded.id).catch(() => undefined);
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(NEW_DOCUMENT_TYPES) as OfficeFormat[]).map((format) => {
          const type = NEW_DOCUMENT_TYPES[format];
          const Icon = OFFICE_KIND_ICON[type.kind];
          return (
            <Button
              key={format}
              type="button"
              variant="secondary"
              size="sm"
              title={type.hint}
              disabled={disabled || !!busy}
              onClick={() => void create(format)}
            >
              {busy === format ? <Spinner /> : <Icon />} {type.label}
            </Button>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Impor berkas DOCX, XLSX, PPTX, ODT, DOC, PDF, … dari komputer lalu sunting di ONLYOFFICE"
          disabled={disabled || !!busy}
          onClick={() => importRef.current?.click()}
        >
          {busy === "import" ? <Spinner /> : <FileUp />} Impor berkas
        </Button>
        <input
          ref={importRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) importFile(file);
          }}
        />
      </div>
      {templates.length > 0 ? (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Dari templat</p>
          <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {templates.map((template) => {
              const Icon = OFFICE_KIND_ICON[KIND_OF_TARGET[template.target]];
              return (
                <Button
                  key={template.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  title={`${OFFICE_KIND_LABELS[KIND_OF_TARGET[template.target]]} dari templat "${template.name}"`}
                  disabled={disabled || !!busy}
                  onClick={() => void createFromTemplate(template)}
                >
                  {busy === `template:${template.id}` ? <Spinner /> : <Icon />}
                  <span className="max-w-48 truncate">{template.name}</span>
                </Button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Templat instansi (kop surat, nota dinas) bisa diunggah di{" "}
          <span className="font-medium">Tools → ONLYOFFICE → Templat dokumen</span>.
        </p>
      )}
    </div>
  );
}
