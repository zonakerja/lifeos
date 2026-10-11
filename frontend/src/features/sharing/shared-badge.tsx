import { Share2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSharedOutKeys } from "@/data/use-sharing";
import { PERMISSION_HINT, PERMISSION_LABEL } from "@/lib/sharing";
import { cn } from "@/lib/utils";
import type { ShareableType, ShareMeta } from "@/types/api";

interface SharedBadgeProps {
  item: { id: string | number; share?: ShareMeta };
  /** Diisi untuk item induk yang bisa dibagikan → item milik sendiri yang dibagikan diberi penanda "Dibagikan" */
  recordType?: ShareableType;
  className?: string;
}

/**
 * Penanda berbagi: item milik user lain → "Dari <pemilik> · <izin>"; item milik sendiri yang sedang dibagikan →
 * "Dibagikan · <n>". Tidak tampil untuk item pribadi.
 */
export function SharedBadge({ item, recordType, className }: SharedBadgeProps) {
  const outKeys = useSharedOutKeys();
  if (item.share) {
    const { ownerName, permission } = item.share;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("border-info/30 bg-info/10 text-info", className)}>
            <Users /> {ownerName} · {PERMISSION_LABEL[permission]}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Dibagikan oleh {ownerName}. {PERMISSION_HINT[permission]}.
        </TooltipContent>
      </Tooltip>
    );
  }
  const count = recordType ? (outKeys.get(`${recordType}:${item.id}`) ?? 0) : 0;
  if (!count) return null;
  return (
    <Badge variant="outline" className={cn("border-info/30 text-info", className)}>
      <Share2 /> Dibagikan · {count}
    </Badge>
  );
}
