import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOfficeStatus } from "@/data/use-office";
import { errorMessage } from "@/lib/api/client";
import { officeApi } from "@/lib/api/endpoints";
import type { OfficeFormat, UploadedAsset } from "@/types/api";
import { OFFICE_KIND_ICON } from "./office-editor-host";
import { NEW_DOCUMENT_TYPES } from "./office-formats";

/** Pilihan tipe "Buat Dokumen (ONLYOFFICE)" di form lampiran / Resource (nilai UI, disimpan sebagai tipe `file`). */
export const OFFICE_ATTACHMENT_TYPE = "office";
export const OFFICE_ATTACHMENT_LABEL = "Buat Dokumen (ONLYOFFICE)";

/** ONLYOFFICE aktif di server → pilihan "Buat Dokumen" ditawarkan di form. */
export const useOfficeEnabled = () => useOfficeStatus().data?.enabled ?? false;

interface NewOfficeDocumentPickerProps {
  /** Judul dokumen (isi "Nama Resource" di form); kosong → nama jenis dokumen */
  title?: string;
  /** Konteks upload lampiran (mis. "task", "schedule") */
  context?: string;
  /** Pemilik item bersama (izin edit) — dokumen disimpan atas nama pemilik, seperti upload lampiran */
  ownerId?: string;
  disabled?: boolean;
  /** Dokumen kosong sudah dibuat (berkas baru, belum tersimpan di form — perlakukan seperti hasil upload) */
  onCreated: (asset: UploadedAsset) => void;
}

/**
 * Tombol jenis dokumen baru (Dokumen / Spreadsheet / Presentasi / PDF) dari templat ONLYOFFICE — isi tipe "Buat Dokumen"
 * di form lampiran & form Resource. Pemanggil yang membuka editor (agar bisa meringkas setelah editor ditutup).
 */
export function NewOfficeDocumentPicker({
  title,
  context,
  ownerId,
  disabled,
  onCreated,
}: NewOfficeDocumentPickerProps) {
  const [busy, setBusy] = useState<OfficeFormat | null>(null);

  const create = async (format: OfficeFormat) => {
    setBusy(format);
    try {
      const asset = await officeApi.createDocument(format, {
        title: title?.trim() || `${NEW_DOCUMENT_TYPES[format].label} baru`,
        context,
        ownerId,
      });
      onCreated(asset);
    } catch (err) {
      toast.error("Dokumen gagal dibuat", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
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
    </div>
  );
}
