import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

/**
 * Mesin templat DOCX (tahap 4 docs/AI-AGENT.md): templat instansi memakai penanda gaya SRIKANDI `${nama_isian}` dan
 * paragraf petunjuk `[Paragraf pembuka: …]`. Penanda diisi nilai dari pengajuan/AI; paragraf petunjuk diganti teks yang
 * ditulis AI (format paragraf asli dipertahankan). Penanda milik SRIKANDI (nomor & tanggal naskah, tanda tangan) dan
 * penanda tanpa nilai **dibiarkan utuh** agar tetap bisa diisi SRIKANDI / user. Diuji di `template-engine.spec.ts`.
 */

/**
 * Penanda yang diisi SRIKANDI dari formulir registrasi, penomoran, & tanda tangan elektronik — tidak pernah diisi LifeOS.
 * Akhiran angka = penandatangan / tujuan ke-n (`nama_pengirim2`).
 */
export const isSrikandiTag = (tag: string) =>
  /^(nomor_naskah|tanggal_naskah|ttd(_.*)?|(jabatan_tujuan|jabatan_pengirim|nama_pengirim|nip_pengirim)\d*)$/i.test(
    tag,
  );

/** Nama isian paragraf petunjuk ke-n (dipakai sebagai penanda sementara saat mengisi). */
const slotName = (index: number) => `__petunjuk_${index + 1}`;
export const isSlotName = (name: string) => /^__petunjuk_\d+$/.test(name);

export interface TemplateSlot {
  name: string;
  /** Petunjuk di dalam kurung siku, mis. "Paragraf pembuka: dasar/latar belakang …" */
  instruction: string;
}

export interface TemplateAnalysis {
  /** Penanda `${…}` unik sesuai urutan kemunculan */
  tags: string[];
  slots: TemplateSlot[];
}

const DOC_PATH = "word/document.xml";
const PARAGRAPH = /<w:p(?=[\s>])[\s\S]*?<\/w:p>/g;
const TEXT_NODE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const paragraphText = (xml: string) => decode([...xml.matchAll(TEXT_NODE)].map((m) => m[1]).join(""));

/** Isi kurung siku bila seluruh paragraf berbentuk `[ … ]` (petunjuk penulisan), selain itu null. */
export function instructionOf(text: string) {
  const match = /^\s*\[([\s\S]{3,})\]\s*$/.exec(text);
  return match ? match[1].trim() : null;
}

/** Baris-baris tidak kosong dari teks isian paragraf petunjuk. */
const slotLines = (value: string | undefined) =>
  (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Ganti setiap paragraf petunjuk `[…]` dengan satu run berisi penanda `${__petunjuk_n}` — properti paragraf (`w:pPr`)
 * dan format run pertama (`w:rPr`) dipertahankan agar teks hasil AI mengikuti gaya templat. Isian yang terdiri dari
 * beberapa baris menjadi beberapa paragraf bergaya sama (bukan pindah baris dalam satu paragraf — pada paragraf rata
 * kiri-kanan baris sebelum pindah baris ikut diregangkan).
 */
function markSlots(documentXml: string, values: Record<string, string> = {}) {
  const slots: TemplateSlot[] = [];
  const xml = documentXml.replace(PARAGRAPH, (paragraph) => {
    const instruction = instructionOf(paragraphText(paragraph));
    if (!instruction) return paragraph;
    const open = /^<w:p(?=[\s>])[^>]*>/.exec(paragraph)![0];
    const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0] ?? "";
    const rPr = /<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(paragraph)?.[1] ?? "";
    const name = slotName(slots.length);
    slots.push({ name, instruction });
    const lines = slotLines(values[name]);
    const keys = lines.length > 1 ? lines.map((_, i) => `${name}__${i + 1}`) : [name];
    return keys.map((key) => `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">\${${key}}</w:t></w:r></w:p>`).join("");
  });
  return { xml, slots };
}

function loadZip(buffer: Buffer) {
  const zip = new PizZip(buffer);
  if (!zip.file(DOC_PATH)) throw new Error("Berkas bukan dokumen Word (.docx) yang valid.");
  return zip;
}

const createDoc = (zip: PizZip, values: Record<string, string>) =>
  new Docxtemplater(zip, {
    delimiters: { start: "${", end: "}" },
    paragraphLoop: true,
    linebreaks: true,
    // Penanda tanpa nilai (termasuk milik SRIKANDI) dikembalikan apa adanya
    nullGetter: (part) => (part.module ? "" : `\${${part.value}}`),
    parser: (tag) => ({
      get: (scope: Record<string, unknown>) => {
        const key = tag.trim();
        if (isSrikandiTag(key)) return undefined;
        const value = scope[key];
        return typeof value === "string" && value.trim() ? value : undefined;
      },
    }),
  }).render(values);

/** Daftar penanda & paragraf petunjuk dalam templat (tanpa mengubah berkas). */
export function analyzeTemplate(buffer: Buffer): TemplateAnalysis {
  const zip = loadZip(buffer);
  const { xml, slots } = markSlots(zip.file(DOC_PATH)!.asText());
  const text = paragraphText(xml.replace(/<\/w:p>/g, "</w:p>\n"));
  const tags = [...new Set([...text.matchAll(/\$\{\s*([A-Za-z0-9_.-]+)\s*\}/g)].map((m) => m[1]))].filter(
    (t) => !isSlotName(t),
  );
  return { tags, slots };
}

/**
 * Yang masih kosong di dokumen hasil isian, kecuali penanda yang diisi SRIKANDI saat tanda tangan: penanda `${x}` & petunjuk `[…]`.
 * Dokumen seperti ini tidak boleh lolos persetujuan otomatis.
 */
export function unfilledFields(buffer: Buffer) {
  const { tags, slots } = analyzeTemplate(buffer);
  return [...tags.filter((tag) => !isSrikandiTag(tag)), ...slots.map((slot) => `[${slot.instruction.slice(0, 60)}]`)];
}

/**
 * Isi templat: nilai penanda + teks paragraf petunjuk (`__petunjuk_n`). Paragraf petunjuk tanpa teks dibiarkan berisi
 * petunjuk aslinya (dalam kurung siku) agar user tahu bagian mana yang masih harus ditulis.
 */
export function fillTemplate(buffer: Buffer, values: Record<string, string>): Buffer {
  const zip = loadZip(buffer);
  const { xml, slots } = markSlots(zip.file(DOC_PATH)!.asText(), values);
  zip.file(DOC_PATH, xml);
  const scope: Record<string, string> = { ...values };
  for (const slot of slots) {
    const lines = slotLines(values[slot.name]);
    if (!lines.length) scope[slot.name] = `[${slot.instruction}]`;
    else if (lines.length > 1) lines.forEach((line, i) => (scope[`${slot.name}__${i + 1}`] = line));
  }
  const doc = createDoc(zip, scope);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
