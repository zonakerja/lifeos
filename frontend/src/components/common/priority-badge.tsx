import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types/entities";

export const PRIORITY_LABELS: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "bg-destructive/12 text-destructive",
  medium: "bg-warning/20 text-warning-foreground dark:text-warning",
  low: "bg-muted text-muted-foreground",
};

export const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export function PriorityBadge({ priority = "medium", className }: { priority?: Priority; className?: string }) {
  return (
    <Badge className={cn("uppercase", PRIORITY_STYLES[priority], className)}>
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}
