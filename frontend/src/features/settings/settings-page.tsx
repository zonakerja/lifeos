import type { ReactNode } from "react";
import { ModulePage } from "@/components/layout/module-page";
import { ApiKeyTab } from "@/features/settings/api-key-tab";
import { AppTab } from "@/features/settings/app-tab";
import { ProfileTab } from "@/features/settings/profile-tab";
import { UsersTab } from "@/features/settings/users-tab";

const TABS: Record<string, () => ReactNode> = {
  profile: () => <ProfileTab />,
  users: () => <UsersTab />,
  app: () => <AppTab />,
  api: () => <ApiKeyTab />,
};

export function Component() {
  return (
    <ModulePage module="settings">
      {(tab) => <div className="mx-auto w-full max-w-4xl">{tab && TABS[tab]?.()}</div>}
    </ModulePage>
  );
}
