import { Bot, Eye, PencilLine, Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/common/markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRetained } from "@/hooks/use-retained";
import { AI_NOT_CONFIGURED, useAi } from "@/lib/ai/use-ai";
import { errorMessage } from "@/lib/api/client";
import { fetchAttachmentBlob } from "./resource-utils";

interface AiSummarizable {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  content?: string;
  type?: string;
  uploadId?: string;
  url?: string;
  mimeType?: string;
  aiSummary?: string;
}

const AI_FILE_TYPES = (mime?: string) =>
  !!mime && (mime === "application/pdf" || mime.startsWith("image/") || mime === "text/plain");

interface ResourceAiDialogProps {
  resource: AiSummarizable | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, summary: string) => void;
}

/** Ringkasan AI untuk resource. */
export function ResourceAiDialog(props: ResourceAiDialogProps) {
  // Konten dipertahankan saat menutup; remount per resource → ringkasan awal langsung dari props
  const resource = useRetained(props.resource);
  return <ResourceAiDialogInner key={resource?.id ?? "none"} {...props} resource={resource} open={!!props.resource} />;
}

function ResourceAiDialogInner({ resource, open, onOpenChange, onSave }: ResourceAiDialogProps & { open: boolean }) {
  const ai = useAi();
  const [summary, setSummary] = useState(resource?.aiSummary ?? "");
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!resource) return;
    if (!ai.isConfigured) {
      toast.error("AI belum diatur", { description: AI_NOT_CONFIGURED });
      return;
    }
    setGenerating(true);
    setMode("preview");
    try {
      const files: Blob[] = [];
      if (AI_FILE_TYPES(resource.mimeType)) {
        const blob = await fetchAttachmentBlob(resource);
        if (blob) files.push(blob);
      }
      const prompt = `Buat ringkasan komprehensif untuk resource berikut untuk keperluan knowledge-base AI masa depan.\nJudul: ${resource.title || resource.name}\nDeskripsi: ${resource.description || resource.content || "-"}\nTipe Referensi: ${resource.type}\n\nEkstrak informasi utama dan sajikan dalam format Markdown yang rapi. Sertakan poin-poin penting. Gunakan delimiter $$ untuk blok rumus matematika.`;
      setSummary(await ai.generate(prompt, files));
    } catch (error) {
      toast.error("Gagal membuat ringkasan", { description: errorMessage(error) });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader className="flex-row items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-module-soft text-module">
            <Bot className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle>AI Knowledge Summary</DialogTitle>
            <DialogDescription className="truncate">{resource?.title || resource?.name}</DialogDescription>
          </div>
          {summary && (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={mode}
              onValueChange={(v) => v && setMode(v as "preview" | "edit")}
              className="mr-8"
            >
              <ToggleGroupItem value="preview">
                <Eye /> View
              </ToggleGroupItem>
              <ToggleGroupItem value="edit">
                <PencilLine /> Edit
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </DialogHeader>

        <div className="min-h-72 flex-1 overflow-y-auto rounded-2xl bg-muted/40 p-4">
          {generating ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner /> AI sedang meringkas...
            </div>
          ) : summary ? (
            mode === "preview" ? (
              <Markdown content={summary} />
            ) : (
              <Textarea
                className="min-h-64 resize-none border-none bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            )
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-module-soft text-module">
                  <Sparkles />
                </EmptyMedia>
                <EmptyTitle>Belum ada ringkasan AI</EmptyTitle>
                <EmptyDescription>Klik "Generate AI" untuk meringkas resource ini secara otomatis.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="secondary" onClick={generate} disabled={generating}>
            {generating ? <Spinner /> : <Sparkles />} Generate AI
          </Button>
          <Button
            onClick={() => {
              if (resource) onSave(resource.id, summary);
              onOpenChange(false);
            }}
          >
            <Save /> Simpan Hasil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
