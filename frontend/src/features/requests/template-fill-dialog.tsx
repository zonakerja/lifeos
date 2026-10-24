import { Loader2, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useOfficeTemplates } from "@/data/use-office";
import { useRequestMutations, useRequestTemplateFields } from "@/data/use-requests";
import { openOfficeEditor } from "@/features/tools/onlyoffice/office-editor-host";
import { useOpenSession } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import type { RequestDetail } from "@/types/api";
import { defaultDocumentName, mergeSuggestedValues, tagLabel } from "./request-utils";

/**
 * Isi templat DOCX instansi dengan data pengajuan: pilih templat → penanda `${…}` & paragraf petunjuk `[…]` tampil
 * sebagai isian (bisa diusulkan AI, selalu bisa disunting) → dokumen baru dibuka di ONLYOFFICE untuk diperiksa.
 */
export function TemplateFillDialog({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: RequestDetail;
}) {
  const session = useOpenSession(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94svh] grid-cols-1 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buat dokumen dari templat</DialogTitle>
          <DialogDescription>
            Penanda SRIKANDI (nomor & tanggal naskah, tanda tangan) tidak diisi — dibiarkan untuk SRIKANDI saat naskah
            diproses di sana.
          </DialogDescription>
        </DialogHeader>
        <TemplateFillForm key={session} request={request} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TemplateFillForm({ request, onDone }: { request: RequestDetail; onDone: () => void }) {
  const templates = useOfficeTemplates();
  const docxTemplates = (templates.data ?? []).filter((t) => /\.docx$/i.test(t.originalName));
  const [templateId, setTemplateId] = useState<string | null>(null);
  const fields = useRequestTemplateFields(templateId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const m = useRequestMutations();
  const aiReady = !!useAuthStore((s) => s.user?.aiProvider);
  const template = docxTemplates.find((t) => t.id === templateId);
  const fillable = fields.data?.tags.filter((t) => !t.srikandi) ?? [];
  const reserved = fields.data?.tags.filter((t) => t.srikandi) ?? [];

  const pick = (id: string) => {
    setTemplateId(id);
    setValues({});
    const picked = docxTemplates.find((t) => t.id === id);
    setName(picked ? defaultDocumentName(picked.name, request.title) : "");
  };
  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const suggest = () =>
    templateId &&
    m.suggestValues.mutate(
      { id: request.id, templateId },
      {
        onSuccess: ({ values: suggested }) => {
          setValues((prev) => mergeSuggestedValues(prev, suggested));
          toast.success("Usulan AI dipasang pada isian yang masih kosong. Periksa sebelum membuat dokumen.");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const create = () =>
    templateId &&
    m.createDocument.mutate(
      { id: request.id, templateId, values, name: name.trim() || undefined },
      {
        onSuccess: ({ document }) => {
          toast.success("Dokumen dibuat. Periksa & rapikan di editor.");
          onDone();
          openOfficeEditor({ uploadId: document.uploadId, name: document.name });
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  if (templates.isLoading) return <Skeleton className="h-32 rounded-xl" />;
  if (docxTemplates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Belum ada templat DOCX. Unggah templat instansi di{" "}
        <Link to="/tools/onlyoffice" className="font-medium text-module underline" onClick={onDone}>
          Tools → ONLYOFFICE → Templat dokumen
        </Link>
        . Tandai isian dengan <code>{"${nama_penanda}"}</code> dan paragraf yang ditulis AI dengan{" "}
        <code>[petunjuk isi]</code>.
      </p>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Templat</Label>
          <SearchableSelect
            value={templateId ?? ""}
            onChange={pick}
            options={docxTemplates.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Pilih templat DOCX…"
          />
        </div>

        {templateId && fields.isLoading && <Skeleton className="h-40 rounded-xl" />}
        {fields.error && <p className="text-sm text-destructive">{errorMessage(fields.error)}</p>}
        {fields.data && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {fillable.length} isian · {fields.data.slots.length} paragraf petunjuk
              </p>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={!aiReady || m.suggestValues.isPending || fillable.length + fields.data.slots.length === 0}
                onClick={suggest}
              >
                {m.suggestValues.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Isi dengan AI
              </Button>
            </div>
            {fillable.length + fields.data.slots.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Templat ini tidak punya penanda <code>{"${…}"}</code> maupun paragraf <code>[…]</code> — dokumen dibuat
                sebagai salinan apa adanya.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {fillable.map((tag) => (
                <div key={tag.name} className="grid gap-1">
                  <Label htmlFor={`tag-${tag.name}`} className="text-xs">
                    {tagLabel(tag.name)} <code className="text-[10px] text-muted-foreground">{`\${${tag.name}}`}</code>
                  </Label>
                  <Input
                    id={`tag-${tag.name}`}
                    value={values[tag.name] ?? ""}
                    onChange={(e) => setValue(tag.name, e.target.value)}
                  />
                </div>
              ))}
            </div>
            {fields.data.slots.map((slot) => (
              <div key={slot.name} className="grid gap-1">
                <Label htmlFor={slot.name} className="text-xs">
                  Paragraf: <span className="font-normal text-muted-foreground">[{slot.instruction}]</span>
                </Label>
                <Textarea
                  id={slot.name}
                  rows={3}
                  value={values[slot.name] ?? ""}
                  onChange={(e) => setValue(slot.name, e.target.value)}
                  placeholder="Kosong = petunjuk tetap tertulis di dokumen"
                />
              </div>
            ))}
            {reserved.length > 0 && (
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" /> Diisi SRIKANDI:
                {reserved.map((t) => (
                  <code key={t.name} className="rounded bg-muted px-1">{`\${${t.name}}`}</code>
                ))}
              </p>
            )}
            <div className="grid gap-1">
              <Label htmlFor="doc-name">Nama berkas</Label>
              <Input id="doc-name" value={name} onChange={(e) => setName(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">.docx · dari templat {template?.name}</p>
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button disabled={!fields.data || m.createDocument.isPending} onClick={create}>
          {m.createDocument.isPending && <Loader2 className="animate-spin" />} Buat dokumen
        </Button>
      </DialogFooter>
    </>
  );
}
