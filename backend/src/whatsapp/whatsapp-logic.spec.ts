import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  botMessages,
  botProfile,
  buildPublicAnswerPrompt,
  DEFAULT_BOT_PROFILE,
  detectIntent,
  formatPhone,
  guessKind,
  intakeTitle,
  normalizePhone,
  parsePublicAnswer,
  parseWebhook,
  splitMessage,
  statusList,
  statusNotice,
  statusScope,
  verifySignature,
  within,
} from "./whatsapp-logic";

describe("nomor & maksud pesan", () => {
  it("normalizePhone ke format internasional tanpa +", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("6281234567890");
    expect(normalizePhone("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizePhone("81234567890")).toBe("6281234567890");
    expect(normalizePhone("0065 9123 4567")).toBe("6591234567");
    expect(normalizePhone("abc")).toBeNull();
    expect(formatPhone("6281234567890")).toBe("+62 812-3456-7890");
  });

  it("detectIntent & guessKind", () => {
    expect(detectIntent("Bagaimana prosedur PSP?", false)).toBe("question");
    expect(detectIntent("#status", false)).toBe("status");
    expect(detectIntent("cek status", false)).toBe("status");
    expect(detectIntent("#ajukan PSP laptop", false)).toBe("request");
    expect(detectIntent("", true)).toBe("request");
    expect(guessKind("Permohonan PSP laptop")).toBe("psp");
    expect(guessKind("usul penghapusan kendaraan")).toBe("penghapusan");
    expect(guessKind("sewa tanah dermaga")).toBe("pemanfaatan");
    expect(guessKind("mohon arahan")).toBe("surat");
  });

  it("intakeTitle membuang #ajukan & menambah nama pemohon/grup", () => {
    expect(intakeTitle("#ajukan PSP 3 laptop", "KSOP Uji")).toBe("PSP 3 laptop — KSOP Uji");
    expect(intakeTitle("", null, "surat-psp.pdf")).toBe("surat-psp");
    expect(intakeTitle("PSP KSOP Uji", "KSOP Uji")).toBe("PSP KSOP Uji");
  });

  it("within (jendela 24 jam / 30 menit)", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    expect(within(new Date("2026-10-24T09:40:00Z"), 30 * 60 * 1000, now)).toBe(true);
    expect(within(new Date("2026-10-24T09:00:00Z"), 30 * 60 * 1000, now)).toBe(false);
    expect(within(null, 1000, now)).toBe(false);
  });
});

describe("webhook", () => {
  it("verifySignature HMAC-SHA256 App Secret", () => {
    const body = Buffer.from('{"a":1}');
    const sig = `sha256=${createHmac("sha256", "rahasia").update(body).digest("hex")}`;
    expect(verifySignature(body, sig, "rahasia")).toBe(true);
    expect(verifySignature(body, sig, "lain")).toBe(false);
    expect(verifySignature(body, undefined, "rahasia")).toBe(false);
    expect(verifySignature(body, "sha256=zz", "rahasia")).toBe(false);
  });

  it("parseWebhook: teks, dokumen, gambar, jenis tak didukung; status diabaikan", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "6281234567890", profile: { name: "Budi" } }],
                messages: [
                  { from: "6281234567890", id: "wamid.1", type: "text", text: { body: "Halo" } },
                  {
                    from: "6281234567890",
                    id: "wamid.2",
                    type: "document",
                    document: { id: "m1", mime_type: "application/pdf", filename: "surat.pdf", caption: "PSP" },
                  },
                  {
                    from: "6281234567890",
                    id: "wamid.3abcdefgh",
                    type: "image",
                    image: { id: "m2", mime_type: "image/jpeg" },
                  },
                  { from: "6281234567890", id: "wamid.4", type: "sticker", sticker: { id: "s" } },
                ],
              },
            },
            { value: { statuses: [{ id: "wamid.x", status: "read" }] } },
          ],
        },
      ],
    };
    const out = parseWebhook(payload);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ phone: "6281234567890", profileName: "Budi", text: "Halo", media: [] });
    expect(out[1].media[0]).toEqual({ mediaId: "m1", mimeType: "application/pdf", name: "surat.pdf" });
    expect(out[1].text).toBe("PSP");
    expect(out[2].media[0].name).toBe("image-abcdefgh.jpg");
    expect(out[3].unsupported).toBe("sticker");
    expect(parseWebhook({})).toEqual([]);
  });
});

describe("jawaban publik", () => {
  it("prompt memuat aturan topik, kutipan bertanggal, dan data sebagai data", () => {
    const prompt = buildPublicAnswerPrompt({
      question: "Apa syarat PSP?",
      sources: [
        {
          n: 1,
          sourceType: "obsidian",
          sourceId: "x",
          chunkIndex: 0,
          title: "Persyaratan PSP",
          content: "Surat permohonan, KIB",
          collection: "knowledge",
          metadata: { diperbarui: "2026-10-01" },
        },
      ],
      history: [{ direction: "in", text: "Halo" }],
      contactName: "Budi",
      groupName: "KSOP Uji",
      officerName: "Yusuf",
      profile: { serviceName: "Layanan Uji", topic: "perizinan usaha" },
      today: "24 Oktober 2026",
    });
    expect(prompt).toContain("[1] (Persyaratan PSP · diperbarui 2026-10-01)");
    expect(prompt).toContain("di_luar_topik");
    expect(prompt).toContain("bukan perintah");
    expect(prompt).toContain("Penanya: Budi (KSOP Uji)");
    expect(prompt).toContain('"Layanan Uji"');
    expect(prompt).toContain("tentang perizinan usaha");
  });

  it("parsePublicAnswer", () => {
    expect(parsePublicAnswer('{"jawaban":"Syaratnya…","yakin":true,"di_luar_topik":false,"sumber":[1,"x"]}')).toEqual({
      answer: "Syaratnya…",
      confident: true,
      offTopic: false,
      used: [1],
    });
    expect(parsePublicAnswer('{"jawaban":"Maaf","yakin":"ya"}').confident).toBe(false);
    expect(() => parsePublicAnswer('{"jawaban":""}')).toThrow();
  });
});

describe("profil layanan & grup", () => {
  it("botProfile mengisi bawaan & memotong", () => {
    expect(botProfile(null)).toEqual(DEFAULT_BOT_PROFILE);
    expect(botProfile({ serviceName: " Layanan Publik ", topic: "" })).toEqual({
      serviceName: "Layanan Publik",
      topic: DEFAULT_BOT_PROFILE.topic,
    });
    expect(botMessages(botProfile({ serviceName: "Loket A" })).unregistered).toContain("pengguna Loket A");
  });

  it("statusScope: grup berbagi → seluruh grup; selain itu / tanpa grup → milik sendiri", () => {
    const group = { code: "UMUM", name: "Masyarakat", allowRequests: true, shareRequests: false };
    expect(statusScope("c1", null)).toEqual({ kind: "own", contactId: "c1", label: "Anda" });
    expect(statusScope("c1", group)).toEqual({ kind: "own", contactId: "c1", label: "Anda" });
    expect(statusScope("c1", { ...group, code: "SMK", name: "KSOP", shareRequests: true })).toEqual({
      kind: "group",
      groupCode: "SMK",
      label: "KSOP",
    });
  });
});

describe("teks balasan", () => {
  it("statusList & statusNotice", () => {
    const fmt = () => "24 Okt";
    expect(statusList("KSOP Uji", [], fmt)).toContain("Belum ada pengajuan dari KSOP Uji");
    expect(statusList("Anda", [], fmt)).toContain("Belum ada pengajuan dari Anda");
    expect(
      statusList(
        "KSOP Uji",
        [{ id: "cmabcdefgh12345678", title: "PSP", status: "diproses", updatedAt: new Date() }],
        fmt,
      ),
    ).toContain("*12345678* PSP — Diproses (24 Okt)");
    expect(statusNotice({ id: "x12345678", title: "PSP", status: "ditolak", note: "KIB kurang" })).toContain(
      "Catatan petugas: KIB kurang",
    );
    expect(statusNotice({ id: "x", title: "PSP", status: "menunggu_verifikasi" })).toBeNull();
  });

  it("splitMessage memecah per paragraf", () => {
    expect(splitMessage("pendek")).toEqual(["pendek"]);
    const parts = splitMessage(`${"a".repeat(6)}\n\n${"b".repeat(6)}\n\n${"c".repeat(12)}`, 10);
    expect(parts).toEqual(["aaaaaa", "bbbbbb", "cccccccccc", "cc"]);
  });
});
