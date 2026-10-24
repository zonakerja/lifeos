import type { ReactNode } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { KnowledgeSettings } from "@/features/tools/knowledge/knowledge-settings";
import { OnlyofficeSettings } from "@/features/tools/onlyoffice/onlyoffice-settings";

const TABS: Record<string, () => ReactNode> = {
  onlyoffice: () => <OnlyofficeSettings />,
  knowledge: () => <KnowledgeSettings />,
};

export function Component() {
  return <ModulePage module="tools">{(tab) => tab && TABS[tab]?.()}</ModulePage>;
}
