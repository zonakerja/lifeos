import type { RecordType } from "@/types/api";

export const queryKeys = {
  appSettings: ["app-settings"] as const,
  profile: ["profile"] as const,
  users: ["users"] as const,
  records: (type: RecordType) => ["records", type] as const,
  uploads: ["uploads"] as const,
  aiSettings: ["ai-settings"] as const,
  aiIndex: ["ai-index"] as const,
};
