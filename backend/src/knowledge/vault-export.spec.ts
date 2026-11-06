import { describe, expect, it } from "vitest";
import { buildExport, DEFAULT_EXPORT, EXPORT_DIR, isManagedNote, parseExportSettings, wikilink } from "./vault-export";
import { buildLinkResolver, parseNote } from "./vault-parser";

const empty = {
  appUrl: "http://localhost:5173",
  freeNotes: [],
  lists: [],
  aiNotes: [],
  areas: [],
  projects: [],
  activities: [],
  tasks: [],
  schedules: [],
  resources: [],
  notebooks: [],
};
const all = DEFAULT_EXPORT.kinds;

describe("vault-export", () => {
  it("parseExportSettings: bawaan mati, semua jenis menyala", () => {
    expect(parseExportSettings(null)).toEqual(DEFAULT_EXPORT);
    expect(parseExportSettings({ enabled: true, kinds: { notes: false, x: true } })).toEqual({
      enabled: true,
      kinds: { ...all, notes: false },
    });
  });

  it("berkas bertanda sumber lifeos & nama ganda diberi nomor", () => {
    const files = buildExport(
      {
        ...empty,
        freeNotes: [
          { id: "1", title: "Rapat", content: "isi a" },
          { id: "2", title: "Rapat", content: "isi b" },
          { id: "3", title: "", content: "" },
        ],
      },
      all,
    );
    const paths = [...files.keys()];
    expect(paths).toContain(`${EXPORT_DIR}/Catatan Bebas/Rapat.md`);
    expect(paths).toContain(`${EXPORT_DIR}/Catatan Bebas/Rapat (2).md`);
    expect(paths.filter((p) => p.includes("Catatan Bebas"))).toHaveLength(2);
    const raw = files.get(`${EXPORT_DIR}/Catatan Bebas/Rapat.md`)!;
    expect(isManagedNote(raw)).toBe(true);
    expect(isManagedNote("---\njenis: sop\n---\nhalo")).toBe(false);
    expect(raw).toContain("http://localhost:5173/notes/free?note=1");
    expect(files.has(`${EXPORT_DIR}/LifeOS.md`)).toBe(true);
  });

  it("project, area, task, agenda & resource saling bertaut dan tautannya terselesaikan", () => {
    const files = buildExport(
      {
        ...empty,
        areas: [{ id: "a1", title: "Keuangan" }],
        activities: [{ id: "s1", title: "Anggaran", areaId: "a1" }],
        projects: [
          {
            id: "p1",
            title: "Laporan Q4",
            areaId: "a1",
            status: "active",
            resources: [{ id: "x", type: "file", name: "KAK.pdf", uploadId: "u1" }],
          },
        ],
        tasks: [
          { id: "t1", projectId: "p1", title: "Susun draf", weight: 40, completed: true, completedAt: "2026-11-01" },
          { id: "t2", projectId: "p1", title: "Review", weight: 60 },
          { id: "t3", projectId: "s1", title: "Rekap SPJ" },
        ],
        schedules: [
          { id: "g1", title: "Rapat review", startDate: "2026-11-05", projectId: "p1", outcome: "Disetujui" },
          { id: "g2", title: "Tanpa hasil", startDate: "2026-11-06" },
        ],
        resources: [
          {
            id: "r1",
            title: "SOP Keuangan",
            type: "link",
            url: "https://contoh.go.id/sop",
            tags: ["Regulasi", "Project Basis"],
          },
          { id: "r2", title: "KAK Laporan", type: "file", uploadId: "u1" },
        ],
      },
      all,
    );
    const project = files.get(`${EXPORT_DIR}/Productivity/Project/Laporan Q4.md`)!;
    expect(project).toContain("progres: 40%");
    expect(project).toContain("- [x] Susun draf");
    expect(project).toContain(wikilink(`${EXPORT_DIR}/Productivity/Area/Keuangan.md`, "Keuangan"));
    expect(project).toContain("2026-11-05 Rapat review");
    const area = files.get(`${EXPORT_DIR}/Productivity/Area/Keuangan.md`)!;
    expect(area).toContain("**Sub Area: Anggaran**");
    expect(area).toContain("- [ ] Rekap SPJ");
    expect([...files.keys()].some((p) => p.includes("Tanpa hasil"))).toBe(false);
    expect(files.get(`${EXPORT_DIR}/Productivity/Resource/SOP Keuangan.md`)).toContain("Project-Basis");
    expect(project).toContain(wikilink(`${EXPORT_DIR}/Productivity/Resource/KAK Laporan.md`, "KAK Laporan"));

    // Semua tautan [[…]] di berkas cermin menunjuk berkas yang ada
    const notes = [...files.keys()].map((path, i) => ({ id: String(i), path, frontmatter: null }));
    const resolve = buildLinkResolver(notes);
    for (const [path, raw] of files) {
      for (const link of parseNote(path, raw).links)
        expect(resolve(link.target), `${path} → ${link.target}`).not.toBeNull();
    }
  });

  it("My Notebook: indeks, catatan, riwayat chat; jenis yang dimatikan tidak ikut", () => {
    const at = new Date("2026-11-06T03:00:00Z");
    const files = buildExport(
      {
        ...empty,
        lists: [{ id: "l1", title: "Belanja", items: [{ text: "Kertas", checked: true }] }],
        notebooks: [
          {
            id: "n1",
            title: "Regulasi BMN",
            createdAt: at,
            updatedAt: at,
            summary: { overview: "Ringkas", keyPoints: ["PSP"], questions: ["Apa itu PSP?"] },
            sources: [{ title: "Daftar", kind: "record", recordType: "list", recordId: "l1" }],
            notes: [{ id: "c1", title: "Jawaban", content: "Isi jawaban", origin: "chat", updatedAt: at }],
            messages: [
              { role: "user", content: "Apa itu PSP?", createdAt: at },
              { role: "assistant", content: "PSP adalah …", citations: [{ n: 1, title: "PMK" }], createdAt: at },
            ],
          },
        ],
      },
      { ...all, productivity: false },
    );
    const folder = `${EXPORT_DIR}/My Notebook/Regulasi BMN`;
    const index = files.get(`${folder}.md`)!;
    expect(index).toContain("### Poin kunci");
    expect(index).toContain(wikilink(`${EXPORT_DIR}/List Bebas/Belanja.md`, "Belanja"));
    expect(files.get(`${folder}/Catatan/Jawaban.md`)).toContain("Isi jawaban");
    expect(files.get(`${folder}/Riwayat Chat - Regulasi BMN.md`)).toContain("> Sumber: [1] PMK");

    const off = buildExport({ ...empty, lists: [{ id: "l1", title: "Belanja", items: [] }] }, { ...all, lists: false });
    expect([...off.keys()].some((p) => p.includes("List Bebas"))).toBe(false);
  });
});
