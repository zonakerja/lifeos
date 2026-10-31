import { describe, expect, it } from "vitest";
import {
  isAgentOwner,
  parseRun,
  parseSkillFile,
  parseSkills,
  sessionIdFor,
  SKILL_NAME,
  skillRunInput,
} from "./agent-logic";

describe("agent-logic", () => {
  it("perintah skill memuat ID & judul pengajuan dan larangan memutuskan", () => {
    const input = skillRunInput("telaah-pengajuan", { id: "req1", title: "PSP\n laptop" });
    expect(input).toContain("`telaah-pengajuan`");
    expect(input).toContain("ID pengajuan: req1");
    expect(input).toContain("Judul: PSP laptop");
    expect(input).toMatch(/Jangan menyetujui/);
  });

  it("nama skill", () => {
    expect(SKILL_NAME.test("penetapan-psp")).toBe(true);
    expect(SKILL_NAME.test("../etc")).toBe(false);
    expect(SKILL_NAME.test("Telaah")).toBe(false);
  });

  it("daftar skill: skill LifeOS di atas, bentuk respons berbeda", () => {
    const body = [
      { name: "github-pr-workflow", description: "x", category: "github" },
      { name: "telaah-pengajuan", description: "Telaah", category: "lifeos" },
      { description: "tanpa nama" },
    ];
    expect(parseSkills(body).map((s) => [s.name, s.lifeos])).toEqual([
      ["telaah-pengajuan", true],
      ["github-pr-workflow", false],
    ]);
    expect(parseSkills({ data: body })).toHaveLength(2);
    expect(parseSkills({ skills: body })).toHaveLength(2);
    expect(parseSkills(null)).toEqual([]);
  });

  it("status run: selesai, berjalan, gagal, output item", () => {
    expect(parseRun("r1", { status: "completed", output: "Done." })).toEqual({
      runId: "r1",
      status: "completed",
      done: true,
      output: "Done.",
      error: null,
    });
    expect(parseRun("r1", { status: "running" }).done).toBe(false);
    expect(parseRun("r1", {}).status).toBe("unknown");
    expect(parseRun("r1", { status: "failed" }).error).toMatch(/gagal/);
    expect(parseRun("r1", { status: "failed", error: { message: "kuota" } }).error).toBe("kuota");
    expect(parseRun("r1", { status: "completed", output: [{ content: [{ text: "Halo" }] }] }).output).toBe("Halo");
  });

  it("pemilik & ID sesi", () => {
    expect(isAgentOwner("Admin@LifeOS.com ", "admin@lifeos.com")).toBe(true);
    expect(isAgentOwner(undefined, "admin@lifeos.com")).toBe(false);
    expect(isAgentOwner("a@x.com", "b@x.com")).toBe(false);
    expect(sessionIdFor("u1", "abc-1!")).toBe("lifeos-u1-abc-1");
    expect(sessionIdFor("u1", "")).toBe("lifeos-u1-utama");
  });
});

describe("parseSkillFile", () => {
  it("membaca frontmatter SKILL.md", () => {
    const text = "---\nname: telaah-pengajuan\ndescription: Menelaah pengajuan.\n---\n\n# Isi";
    expect(parseSkillFile(text, "x")).toEqual({
      name: "telaah-pengajuan",
      description: "Menelaah pengajuan.",
      category: "lifeos",
      lifeos: true,
    });
    expect(parseSkillFile("---\ndescription: tanpa nama\n---", "folder-ku")?.name).toBe("folder-ku");
    expect(parseSkillFile("# tanpa frontmatter", "x")).toBeNull();
    expect(parseSkillFile("---\nname: Nama Salah\n---", "x")).toBeNull();
  });
});
