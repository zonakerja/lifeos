import { describe, expect, it } from "vitest";
import type { WaConversation, WaMessage } from "@/types/api";
import { faqTitle, filterConversations, formatPhone, lastPendingQuestion } from "./whatsapp-utils";

const conv = (phone: string, patch: Partial<WaConversation> = {}): WaConversation => ({
  phone,
  contact: null,
  lastMessage: { text: "", direction: "in", createdAt: "2026-10-24T01:00:00Z", status: "answered" },
  needsReply: 0,
  ...patch,
});

describe("whatsapp utils", () => {
  it("formatPhone", () => {
    expect(formatPhone("6281234567890")).toBe("+62 812-3456-7890");
    expect(formatPhone("6591234567")).toBe("+6591234567");
  });

  it("filterConversations: perlu dijawab di atas, cari nama/grup/nomor", () => {
    const items = [
      conv("6281", {
        lastMessage: { text: "", direction: "in", createdAt: "2026-10-24T03:00:00Z", status: "answered" },
      }),
      conv("6282", {
        needsReply: 1,
        contact: {
          id: "c",
          phone: "6282",
          name: "Budi",
          position: null,
          groupId: "s",
          group: { id: "s", code: "K1", name: "KSOP Perak", kind: "satker", allowRequests: true, shareRequests: true },
          verified: true,
          active: true,
          notes: null,
          lastInboundAt: null,
        },
      }),
    ];
    expect(filterConversations(items, "", false).map((c) => c.phone)).toEqual(["6282", "6281"]);
    expect(filterConversations(items, "perak", false).map((c) => c.phone)).toEqual(["6282"]);
    expect(filterConversations(items, "", true).map((c) => c.phone)).toEqual(["6282"]);
  });

  it("lastPendingQuestion & faqTitle", () => {
    const msgs = [
      { direction: "in", status: "needs_reply", text: "Lama proses PSP??" },
      { direction: "out", status: "simulated", text: "Diteruskan" },
    ] as WaMessage[];
    expect(lastPendingQuestion(msgs)).toBe("Lama proses PSP??");
    expect(faqTitle("Lama proses PSP??")).toBe("FAQ - Lama proses PSP");
    expect(faqTitle("  ")).toBe("FAQ WhatsApp");
  });
});
