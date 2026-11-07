import { describe, expect, it } from "vitest";
import { addInterval, applyTaskToggle, parseRecurrence, parseTaskLine, parseTasks, setTaskStatus } from "./vault-tasks";

describe("parseTaskLine", () => {
  it("membaca metadata plugin Tasks", () => {
    const t = parseTaskLine("- [ ] Kirim laporan #kantor ⏫ 📅 2026-11-10 ⏳ 2026-11-08 ^abc")!;
    expect(t).toMatchObject({
      status: "todo",
      text: "Kirim laporan #kantor",
      due: "2026-11-10",
      scheduled: "2026-11-08",
      priority: "high",
      tags: ["kantor"],
    });
  });

  it("status lain, daftar bernomor, callout, dan Dataview", () => {
    expect(parseTaskLine("1. [x] Selesai ✅ 2026-11-01")).toMatchObject({ status: "done", doneDate: "2026-11-01" });
    expect(parseTaskLine("> - [/] Sedang [due:: 2026-11-12]")).toMatchObject({
      status: "in_progress",
      due: "2026-11-12",
    });
    expect(parseTaskLine("  * [-] Batal")?.status).toBe("cancelled");
    expect(parseTaskLine("- [ ] Rapat 🔁 every week 📅 2026-11-09")?.recurrence).toBe("every week");
    expect(parseTaskLine("- bukan tugas")).toBeNull();
    expect(parseTaskLine("- [ ]")).toMatchObject({ text: "" });
  });
});

describe("parseTasks", () => {
  const note = [
    "---",
    "jenis: rapat",
    "---",
    "# Proyek",
    "- [ ] Satu",
    "```",
    "- [ ] di blok kode",
    "```",
    "## Tindak lanjut",
    "- [x] Dua",
  ].join("\n");

  it("melewati properti & blok kode, mencatat judul terdekat", () => {
    const tasks = parseTasks(note);
    expect(tasks.map((t) => [t.index, t.line, t.text, t.heading])).toEqual([
      [0, 1, "Satu", "Proyek"],
      [1, 6, "Dua", "Tindak lanjut"],
    ]);
  });

  it("melewati ringkasan LifeOS di catatan harian tanpa menggeser urutan", () => {
    const daily = [
      "# Senin",
      "## Agenda",
      "- 09:00 Rapat",
      "## To-do",
      "- [ ] Dari Planner",
      "> [!info] Ringkasan LifeOS saat catatan dibuat",
      "## Catatan",
      "- [ ] Milik saya",
    ].join("\n");
    const tasks = parseTasks(daily, { skipLifeosSummary: true });
    expect(tasks.map((t) => [t.index, t.text])).toEqual([[1, "Milik saya"]]);
  });
});

describe("menulis balik", () => {
  it("menandai selesai & membuka lagi", () => {
    expect(setTaskStatus("- [ ] Tulis ^id1", true, "2026-11-07").line).toBe("- [x] Tulis ✅ 2026-11-07 ^id1");
    expect(setTaskStatus("- [x] Tulis ✅ 2026-11-07", false, "2026-11-08").line).toBe("- [ ] Tulis");
  });

  it("tugas berulang membuat kejadian berikutnya", () => {
    const result = setTaskStatus("- [ ] Laporan 🔁 every month 📅 2026-01-31", true, "2026-01-30");
    expect(result.next).toBe("- [ ] Laporan 🔁 every month 📅 2026-02-28");
    expect(result.line).toBe("- [x] Laporan 🔁 every month 📅 2026-01-31 ✅ 2026-01-30");
  });

  it("aturan & langkah tanggal", () => {
    expect(parseRecurrence("every 2 weeks")).toEqual({ count: 2, unit: "week" });
    expect(parseRecurrence("setiap hari")).toEqual({ count: 1, unit: "day" });
    expect(parseRecurrence("every monday")).toBeNull();
    expect(addInterval("2024-02-29", { count: 1, unit: "year" })).toBe("2025-02-28");
  });

  it("menerapkan ke berkas (properti, CRLF, baris bergeser)", () => {
    const file = "---\na: 1\n---\r\n- [ ] Satu\r\n- [ ] Dua\r\n".replace(/\n/g, "\r\n").replace(/\r\r/g, "\r");
    const out = applyTaskToggle(file, { index: 1, raw: "- [ ] Dua", done: true, today: "2026-11-07" });
    expect(out?.text).toBe("---\r\na: 1\r\n---\r\n- [ ] Satu\r\n- [x] Dua ✅ 2026-11-07\r\n");
    // tugas baru disisipkan di atas → urutan bergeser, dicari dari baris aslinya
    const moved = applyTaskToggle("- [ ] Baru\n- [ ] Satu\n", {
      index: 0,
      raw: "- [ ] Satu",
      done: true,
      today: "2026-11-07",
    });
    expect(moved?.text).toBe("- [ ] Baru\n- [x] Satu ✅ 2026-11-07\n");
    expect(
      applyTaskToggle("- [ ] Lain\n", { index: 0, raw: "- [ ] Satu", done: true, today: "2026-11-07" }),
    ).toBeNull();
  });
});
