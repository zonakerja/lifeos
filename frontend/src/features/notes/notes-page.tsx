import { ListChecks, NotebookPen, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { useAiNotes, useFreeNotes, useLists } from "@/data/collections";
import { AiNotesTab } from "./components/ai-notes-tab";
import { FreeNotesTab } from "./components/free-notes-tab";
import { ListsTab } from "./components/lists-tab";

const TABS: Record<string, () => ReactNode> = {
  free: () => <FreeNotesTab />,
  ai: () => <AiNotesTab />,
  lists: () => <ListsTab />,
};

export function Component() {
  const { items: freeNotes } = useFreeNotes();
  const { items: aiNotes } = useAiNotes();
  const { items: lists } = useLists();

  return (
    <ModulePage
      module="notes"
      meta={
        <>
          <HeroStat>
            <NotebookPen className="size-3.5" /> {freeNotes.length} catatan
          </HeroStat>
          <HeroStat>
            <Sparkles className="size-3.5" /> {aiNotes.length} notes AI
          </HeroStat>
          <HeroStat>
            <ListChecks className="size-3.5" /> {lists.filter((l) => !l.archived).length} list aktif
          </HeroStat>
        </>
      }
    >
      {(tab) => tab && TABS[tab]?.()}
    </ModulePage>
  );
}
