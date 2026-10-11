import { describe, expect, it } from "vitest";
import { buildIconPrompt, MAX_ICON_SUGGESTIONS, parseIconSuggestions } from "./icon-ai";
import { APP_ICONS, getAppIcon, ICON_CATEGORIES, resolveIconKey, searchIcons } from "./icon-registry";

describe("paket ikon", () => {
  it("key unik, kategori valid, setiap ikon punya komponen", () => {
    const keys = APP_ICONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const categories = new Set<string>(ICON_CATEGORIES.map((c) => c.id));
    expect(APP_ICONS.every((i) => categories.has(i.category) && !!i.icon && !!i.label)).toBe(true);
    expect(APP_ICONS.length).toBeGreaterThan(100);
  });

  it("key lama tetap dikenali lewat alias; key asing jatuh ke ikon cadangan", () => {
    expect(resolveIconKey("graduation")).toBe("graduation-cap");
    expect(resolveIconKey("heart")).toBe("heart");
    expect(resolveIconKey("tidak-ada")).toBeNull();
    expect(getAppIcon("tidak-ada").key).toBe("clock");
    expect(getAppIcon(undefined, "tag").key).toBe("tag");
  });

  it("pencarian per kata (label, kata kunci, key) dan per kategori", () => {
    expect(searchIcons("rapat").map((i) => i.key)).toContain("users");
    expect(searchIcons("DINAS luar").map((i) => i.key)).toContain("plane");
    expect(searchIcons("", "keuangan").every((i) => i.category === "keuangan")).toBe(true);
    expect(searchIcons("zzzz")).toHaveLength(0);
  });
});

describe("saran ikon AI", () => {
  it("prompt memuat subjek, konteks, dan semua key", () => {
    const prompt = buildIconPrompt("Webinar", "tipe agenda");
    expect(prompt).toContain('"Webinar"');
    expect(prompt).toContain("tipe agenda");
    expect(APP_ICONS.every((i) => prompt.includes(`${i.key} =`))).toBe(true);
  });

  it("mengambil key valid & unik dari JSON (dengan teks/kode tambahan)", () => {
    expect(parseIconSuggestions('Berikut:\n```json\n["video","users","video","bukan-ikon"]\n```')).toEqual([
      "video",
      "users",
    ]);
    expect(parseIconSuggestions('["graduation", "Briefcase"]')).toEqual(["graduation-cap", "briefcase"]);
  });

  it("cadangan tanpa JSON & batas jumlah saran", () => {
    expect(parseIconSuggestions("Saya sarankan: plane atau luggage.")).toEqual(["plane", "luggage"]);
    const many = JSON.stringify(APP_ICONS.slice(0, 20).map((i) => i.key));
    expect(parseIconSuggestions(many)).toHaveLength(MAX_ICON_SUGGESTIONS);
    expect(parseIconSuggestions("tidak tahu")).toEqual([]);
  });
});
