import { FileText, FolderLock, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription } from "@/components/ui/field";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { trackPendingUpload } from "@/lib/pending-uploads";

export interface VaultChoice {
  id: string;
  name: string;
}

export const VAULT_UPLOAD_CONTEXT = "renaksi-vault";

/**
 * Pilihan berkas brankas digital satu poin renaksi: lampiran item + berkas yang sudah ada di brankas + unggahan baru.
 * Berkas yang diunggah di sini dicatat sebagai unggahan tertunda sampai renaksi disimpan.
 */
export function VaultFilePicker({
  choices,
  selected,
  onToggle,
  onUploaded,
}: {
  choices: VaultChoice[];
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
  onUploaded: (file: VaultChoice) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadsApi.upload(file, VAULT_UPLOAD_CONTEXT);
        trackPendingUpload(asset.id);
        onUploaded({ id: asset.id, name: asset.originalName || file.name });
      }
    } catch (error) {
      toast.error(errorMessage(error, "Unggah berkas gagal."));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-1 gap-1.5">
      {choices.map((c) => (
        <label key={c.id} className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
          <Checkbox checked={selected.includes(c.id)} onCheckedChange={(v) => onToggle(c.id, v === true)} />
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{c.name}</span>
        </label>
      ))}
      {!choices.length && <p className="text-xs text-muted-foreground">Belum ada berkas — unggah berkas bukti.</p>}
      <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={uploading}
        onClick={() => input.current?.click()}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Unggah berkas
      </Button>
      <FieldDescription className="flex items-start gap-1">
        <FolderLock className="mt-0.5 size-3.5 shrink-0" /> Satu tautan publik baca-saja untuk poin renaksi ini; hanya
        berkas yang dicentang yang dapat dibuka. Setiap pembukaan dicatat (waktu, IP, perkiraan lokasi). Berkas bisa
        diganti kapan saja tanpa mengubah tautan.
      </FieldDescription>
    </div>
  );
}
