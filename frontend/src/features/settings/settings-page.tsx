import type { ReactNode } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { AiSettingsTab } from "@/features/settings/ai-settings-tab";
import { AppTab } from "@/features/settings/app-tab";
import { SharingTab } from "@/features/settings/sharing-tab";
import { UsersTab } from "@/features/settings/users-tab";

const TABS: Record<string, () => ReactNode> = {
  app: () => <AppTab />,
  users: () => <UsersTab />,
  sharing: () => <SharingTab />,
  api: () => <AiSettingsTab />,
};

export function Component() {
  return (
    <ModulePage module="settings">
      {(tab) => <div className="mx-auto w-full max-w-4xl">{tab && TABS[tab]?.()}</div>}
    </ModulePage>
  );
}
