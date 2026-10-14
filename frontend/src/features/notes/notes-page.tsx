import { BookOpenText, ListChecks, NotebookPen, Sparkles } from "lucide-react";
import { lazy, type ReactNode, Suspense } from "react";
import { PageLoader } from "@/components/common/page-loader";
import { HeroStat, ModulePage } from "@/components/layout/module-page";
import { useAiNotes, useFreeNotes, useLists } from "@/data/collections";
import { useNotebooks } from "@/data/use-notebooks";
import { AiNotesTab } from "./components/ai-notes-tab";
import { FreeNotesTab } from "./components/free-notes-tab";
import { ListsTab } from "./components/lists-tab";

// My Notebook dimuat saat tabnya dibuka
const NotebookTab = lazy(() => import("./notebook/notebook-tab"));

const TABS: Record<string, () => ReactNode> = {
  free: () => <FreeNotesTab />,
  lists: () => <ListsTab />,
  ai: () => <AiNotesTab />,
  notebook: () => (
    <Suspense fallback={<PageLoader />}>
      <NotebookTab />
    </Suspense>
  ),
};

export function Component() {
  const { items: freeNotes } = useFreeNotes();
  const { items: aiNotes } = useAiNotes();
  const { items: lists } = useLists();
  const { data: notebooks } = useNotebooks();

  return (
    <ModulePage
      module="notes"
      meta={
        <>
          <HeroStat>
            <NotebookPen className="size-3.5" /> {freeNotes.length} catatan
          </HeroStat>
          <HeroStat>
            <ListChecks className="size-3.5" /> {lists.filter((l) => !l.archived).length} list aktif
          </HeroStat>
          <HeroStat>
            <Sparkles className="size-3.5" /> {aiNotes.length} notes AI
          </HeroStat>
          <HeroStat>
            <BookOpenText className="size-3.5" /> {notebooks?.length ?? 0} notebook
          </HeroStat>
        </>
      }
    >
      {(tab) => tab && TABS[tab]?.()}
    </ModulePage>
  );
}
