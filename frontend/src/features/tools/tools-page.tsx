import type { ReactNode } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { KnowledgeIndexSettings } from "@/features/tools/knowledge-index/knowledge-index-settings";
import { KnowledgeSettings } from "@/features/tools/knowledge/knowledge-settings";
import { OnlyofficeSettings } from "@/features/tools/onlyoffice/onlyoffice-settings";

const TABS: Record<string, () => ReactNode> = {
  onlyoffice: () => <OnlyofficeSettings />,
  knowledge: () => <KnowledgeSettings />,
  index: () => <KnowledgeIndexSettings />,
};

export function Component() {
  return <ModulePage module="tools">{(tab) => tab && TABS[tab]?.()}</ModulePage>;
}
