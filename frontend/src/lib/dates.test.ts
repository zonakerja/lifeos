import { describe, expect, it } from "vitest";
import { formatRelative } from "./dates";

describe("formatRelative", () => {
  const now = new Date("2026-10-11T12:00:00");
  it("menampilkan waktu relatif dalam Bahasa Indonesia", () => {
    expect(formatRelative("2026-10-11T11:59:30", now)).toBe("baru saja");
    expect(formatRelative("2026-10-11T12:00:05", now)).toBe("baru saja");
    expect(formatRelative("2026-10-11T11:55:00", now)).toBe("5 menit yang lalu");
    expect(formatRelative("2026-10-11T09:00:00", now)).toBe("3 jam yang lalu");
    expect(formatRelative("2026-10-10T12:00:00", now)).toBe("kemarin");
    expect(formatRelative("2026-09-20T12:00:00", now)).toBe("3 minggu yang lalu");
    expect(formatRelative("bukan tanggal", now)).toBe("-");
  });
});
