import { describe, expect, it } from "vitest";
import { joinTranscript, runSegments, runTranscript, stripMetaPreamble, type TranscriptPass } from "./transcript-logic";

const queue = (items: (TranscriptPass | Error)[]) => {
  const seen: string[] = [];
  return {
    seen,
    generate: (soFar: string) => {
      seen.push(soFar);
      const next = items.shift();
      if (!next) throw new Error("tidak ada lagi");
      if (next instanceof Error) throw next;
      return Promise.resolve(next);
    },
  };
};
const noWait = () => Promise.resolve();

describe("stripMetaPreamble", () => {
  it("catatan kerja model sebelum label pembicara dibuang", () => {
    const leaked = "write detail within this outline. Correctly labeled speakers. Output directly.Pembicara 1: FBO ini.";
    expect(stripMetaPreamble(leaked)).toBe("Pembicara 1: FBO ini.");
  });

  it("ucapan sungguhan sebelum label pembicara tidak disentuh", () => {
    const speech = "...dan payback period-nya itu tiga belas tahun. Pembicara 2: Baik.";
    expect(stripMetaPreamble(speech)).toBe(speech);
    expect(stripMetaPreamble("Pembicara 1: Output kita naik.")).toBe("Pembicara 1: Output kita naik.");
    expect(stripMetaPreamble("Tanpa label sama sekali, output naik.")).toBe("Tanpa label sama sekali, output naik.");
  });
});

describe("runSegments", () => {
  const ok = (text: string) => ({ text, truncated: false, passes: 1 });
  const starts = [0, 600_000, 1_200_000];

  it("gabung berurutan dengan penanda menit walau selesai tidak berurutan", async () => {
    const delays = [30, 1, 10];
    const result = await runSegments(
      starts,
      async (i) => {
        await new Promise((r) => setTimeout(r, delays[i]));
        return ok(`isi ${i}`);
      },
      { concurrency: 3 },
    );
    expect(result.text).toBe("[Menit 0]\nisi 0\n\n[Menit 10]\nisi 1\n\n[Menit 20]\nisi 2");
    expect(result).toMatchObject({ truncated: false, passes: 3, warning: null });
  });

  it("jumlah paralel dibatasi", async () => {
    let running = 0;
    let peak = 0;
    await runSegments(
      Array.from({ length: 8 }, (_, i) => i * 600_000),
      async () => {
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
        return ok("x");
      },
      { concurrency: 3 },
    );
    expect(peak).toBe(3);
  });

  it("potongan gagal diulang di akhir", async () => {
    const tries = new Map<number, number>();
    const result = await runSegments(
      starts,
      (i) => {
        tries.set(i, (tries.get(i) ?? 0) + 1);
        return i === 1 && tries.get(i) === 1 ? Promise.reject(new Error("429")) : Promise.resolve(ok(`isi ${i}`));
      },
      { concurrency: 2, retryDelayMs: 0 },
    );
    expect(result.warning).toBeNull();
    expect(result.text).toContain("isi 1");
    expect([...tries.values()]).toEqual(expect.arrayContaining([2, 1, 1]));
  });

  it("bagian yang sudah berhasil tidak dibayar lagi", async () => {
    const done = new Map([[600_000, ok("tersimpan")]]);
    const called: number[] = [];
    const result = await runSegments(
      starts,
      (i) => {
        called.push(i);
        return Promise.resolve(ok(`baru ${i}`));
      },
      { concurrency: 3, done },
    );
    expect(called.sort()).toEqual([0, 2]);
    expect(result.text).toContain("tersimpan");
    expect(done.size).toBe(3);
  });

  it("potongan gagal ditandai beserta alasannya, sisanya tetap dipakai", async () => {
    const result = await runSegments(
      starts,
      (i) => (i === 1 ? Promise.reject(new Error("503")) : Promise.resolve(ok(`isi ${i}`))),
      { concurrency: 1, retryDelayMs: 0 },
    );
    expect(result.warning).toContain("(503)");
    expect(result.text).toContain("[Menit 10: gagal ditranskrip]");
    expect(result.text).toContain("isi 2");
    expect(result.truncated).toBe(true);
    expect(result.warning).toContain("menit 10");
  });

  it("potongan yang tidak selesai dilaporkan", async () => {
    const result = await runSegments([0, 600_000], (i) => Promise.resolve({ ...ok("x"), truncated: i === 1 }), {
      concurrency: 2,
    });
    expect(result.warning).toBe("Bagian menit 10 mungkin belum lengkap.");
  });

  it("semua gagal melempar error", async () => {
    await expect(
      runSegments(starts, () => Promise.reject(new Error("503")), { concurrency: 2, retryDelayMs: 0 }),
    ).rejects.toThrow("503");
  });

  it("kegagalan fatal menghentikan potongan berikutnya", async () => {
    let calls = 0;
    await expect(
      runSegments(
        starts,
        () => {
          calls++;
          return Promise.reject(new Error("key ditolak"));
        },
        { concurrency: 1, isFatal: () => true },
      ),
    ).rejects.toThrow("key ditolak");
    expect(calls).toBe(1);
  });

  it("satu potongan tanpa penanda menit", async () => {
    const result = await runSegments([0], () => Promise.resolve(ok("Halo.")), { concurrency: 3 });
    expect(result.text).toBe("Halo.");
  });
});

describe("joinTranscript", () => {
  it("bagian pertama dipakai apa adanya", () => {
    expect(joinTranscript("", "  Halo semua.")).toBe("Halo semua.");
  });

  it("awal bagian baru yang mengulang akhir teks dibuang", () => {
    const repeated = "kita mulai rapat hari ini dengan agenda";
    expect(joinTranscript(`Baik, ${repeated}`, `${repeated} pertama.`)).toBe(`Baik, ${repeated} pertama.`);
  });

  it("kalimat terpotong disambung spasi, kalimat utuh disambung baris baru", () => {
    expect(joinTranscript("Kita akan memb", "ahas anggaran.")).toBe("Kita akan memb ahas anggaran.");
    expect(joinTranscript("Selesai.", "Pembicara 2: Baik.")).toBe("Selesai.\nPembicara 2: Baik.");
  });

  it("kemiripan pendek tidak dianggap pengulangan", () => {
    expect(joinTranscript("Ya, baik.", "baik sekali.")).toBe("Ya, baik.\nbaik sekali.");
  });
});

describe("runTranscript", () => {
  it("selesai dalam satu bagian", async () => {
    const q = queue([{ text: "Halo.", truncated: false }]);
    await expect(runTranscript(q.generate)).resolves.toEqual({ text: "Halo.", truncated: false, passes: 1 });
  });

  it("melanjutkan saat terpotong dan mengirim teks sejauh ini", async () => {
    const q = queue([
      { text: "Bagian satu.", truncated: true },
      { text: "Bagian dua.", truncated: false },
    ]);
    const result = await runTranscript(q.generate);
    expect(result).toEqual({ text: "Bagian satu.\nBagian dua.", truncated: false, passes: 2 });
    expect(q.seen).toEqual(["", "Bagian satu."]);
  });

  it("gagal sementara diulang tanpa membuang bagian yang sudah selesai", async () => {
    const q = queue([
      { text: "Bagian satu.", truncated: true },
      new Error("503"),
      { text: "Bagian dua.", truncated: false },
    ]);
    const result = await runTranscript(q.generate, { isRetryable: () => true, wait: noWait });
    expect(result.text).toBe("Bagian satu.\nBagian dua.");
    expect(q.seen).toEqual(["", "Bagian satu.", "Bagian satu."]);
  });

  it("kegagalan yang tidak bisa diulang langsung dilempar", async () => {
    const q = queue([new Error("key ditolak"), { text: "x", truncated: false }]);
    await expect(runTranscript(q.generate, { wait: noWait })).rejects.toThrow("key ditolak");
    expect(q.seen).toHaveLength(1);
  });

  it("batas percobaan ulang tetap berlaku", async () => {
    const q = queue([new Error("a"), new Error("b"), new Error("c"), { text: "x", truncated: false }]);
    await expect(runTranscript(q.generate, { isRetryable: () => true, maxRetries: 2, wait: noWait })).rejects.toThrow(
      "c",
    );
  });

  it("melaporkan terpotong bila batas bagian tercapai", async () => {
    const q = queue([
      { text: "Satu.", truncated: true },
      { text: "Dua.", truncated: true },
      { text: "Tiga.", truncated: false },
    ]);
    const result = await runTranscript(q.generate, { maxPasses: 2 });
    expect(result).toEqual({ text: "Satu.\nDua.", truncated: true, passes: 2 });
  });

  it("berhenti bila bagian lanjutan kosong", async () => {
    const q = queue([
      { text: "Satu.", truncated: true },
      { text: "", truncated: true },
      { text: "Tidak terpanggil.", truncated: false },
    ]);
    const result = await runTranscript(q.generate);
    expect(result).toMatchObject({ truncated: true, passes: 2 });
    expect(q.seen).toHaveLength(2);
  });
});
