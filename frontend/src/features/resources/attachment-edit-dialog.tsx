import { useState } from "react";
import { toast } from "sonner";
import { TagInput } from "@/components/common/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useResources } from "@/data/collections";
import { useOpenSession, useRetained } from "@/hooks/use-retained";
import type { AttachedResource } from "@/types/entities";
import { addFreeTag, collectFreeTags, MAX_TAG_LENGTH } from "./resource-tags";

/**
 * Ubah data lampiran yang sudah ditambahkan: nomor, nama, tanggal, deskripsi, tag. Jenis & berkasnya tidak diubah di sini
 * (mengganti berkas = hapus lalu tambah lampiran baru, agar aturan pembersihan berkas tetap berlaku). Tag yang ditambahkan
 * ikut ke Resource Global saat item disimpan bila lampiran memang disimpan ke sana (`mergeIntoGlobalResources`).
 */
export function AttachmentEditDialog({
  attachment: attachmentProp,
  onOpenChange,
  onSave,
}: {
  attachment: AttachedResource | null;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: AttachedResource) => void;
}) {
  const attachment = useRetained(attachmentProp);
  const session = useOpenSession(!!attachmentProp);
  return (
    <Dialog open={!!attachmentProp} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ubah Lampiran</DialogTitle>
        </DialogHeader>
        {attachment && (
          <AttachmentEditForm
            key={`${attachment.id}-${session}`}
            attachment={attachment}
            onCancel={() => onOpenChange(false)}
            onSave={(updated) => {
              onSave(updated);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AttachmentEditForm({
  attachment,
  onCancel,
  onSave,
}: {
  attachment: AttachedResource;
  onCancel: () => void;
  onSave: (updated: AttachedResource) => void;
}) {
  const [draft, setDraft] = useState(attachment);
  const { items: resources } = useResources();
  const tagSuggestions = collectFreeTags(resources);
  const patch = (values: Partial<AttachedResource>) => setDraft((prev) => ({ ...prev, ...values }));

  const save = () => {
    if (!draft.name?.trim() && !draft.title?.trim()) {
      toast.error("Nama lampiran wajib diisi.");
      return;
    }
    onSave({ ...draft, name: draft.name?.trim() || draft.name, ...(draft.tags?.length ? {} : { tags: undefined }) });
  };

  return (
    <FieldGroup className="gap-4">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field>
          <FieldLabel htmlFor="att-edit-number">Nomor</FieldLabel>
          <Input
            id="att-edit-number"
            placeholder="No."
            value={draft.number ?? ""}
            onChange={(e) => patch({ number: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="att-edit-name">Nama</FieldLabel>
          <Input
            id="att-edit-name"
            autoFocus
            value={draft.name ?? draft.title ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
        <Field>
          <FieldLabel htmlFor="att-edit-date">Tanggal</FieldLabel>
          <Input
            id="att-edit-date"
            type="date"
            value={draft.date ?? ""}
            onChange={(e) => patch({ date: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="att-edit-desc">Deskripsi</FieldLabel>
          <Input
            id="att-edit-desc"
            placeholder="Keterangan..."
            value={draft.description ?? ""}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="att-edit-tags">Tag</FieldLabel>
        <TagInput
          id="att-edit-tags"
          value={draft.tags ?? []}
          suggestions={tagSuggestions}
          maxLength={MAX_TAG_LENGTH}
          placeholder="Tambah tag, mis. Regulasi, SOP..."
          // Pembaruan fungsional: menempel "a, b" memanggil onAdd beberapa kali dalam satu event
          onAdd={(input) => setDraft((prev) => ({ ...prev, tags: addFreeTag(prev.tags ?? [], input, tagSuggestions) }))}
          onRemove={(tag) => setDraft((prev) => ({ ...prev, tags: (prev.tags ?? []).filter((t) => t !== tag) }))}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Jenis dan berkas lampiran tidak diubah di sini — untuk mengganti berkas, hapus lampiran lalu tambahkan yang
        baru.
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button type="button" onClick={save}>
          Simpan
        </Button>
      </DialogFooter>
    </FieldGroup>
  );
}
