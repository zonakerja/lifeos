import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { SummaryStatus } from "./use-file-summarizer";

/** Lencana status ekstraksi AI: AI Extracting / No AI / AI Ready. */
export function SummaryStatusBadge({ status }: { status: SummaryStatus }) {
  if (status === "processing")
    return (
      <Badge className="bg-warning/20 text-warning-foreground dark:text-warning">
        <Spinner className="size-3" /> AI Extracting
      </Badge>
    );
  if (status === "error") return <Badge className="bg-destructive/12 text-destructive">No AI</Badge>;
  if (status === "done")
    return (
      <Badge className="bg-success/15 text-success">
        <CheckCircle2 /> AI Ready
      </Badge>
    );
  return null;
}
