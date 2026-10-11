import type { RecordType } from "@/types/api";

export const queryKeys = {
  appSettings: ["app-settings"] as const,
  profile: ["profile"] as const,
  users: ["users"] as const,
  records: (type: RecordType) => ["records", type] as const,
  uploads: ["uploads"] as const,
  aiSettings: ["ai-settings"] as const,
  aiIndex: ["ai-index"] as const,
  userStats: ["users", "stats"] as const,
  shares: ["shares"] as const,
  itemShares: (type: string, id: string) => ["shares", "item", type, id] as const,
  sharesOutgoing: ["shares", "outgoing"] as const,
  sharesIncoming: ["shares", "incoming"] as const,
  comments: (type: string, id: string, ownerId?: string) => ["comments", type, id, ownerId ?? ""] as const,
};
