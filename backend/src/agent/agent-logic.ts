/**
 * Logika murni modul Asisten Agen (diuji di `agent-logic.spec.ts`): pesan perintah skill untuk Hermes, pembacaan respons
 * API server Hermes (Runs, skill, health), dan aturan pemilik.
 */

export const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "interrupted"] as const;

export interface AgentSkill {
  name: string;
  description: string;
  category: string;
  /** Skill LifeOS (folder repo `agents/hermes/skills/`) */
  lifeos: boolean;
}

export interface AgentRunView {
  runId: string;
  status: string;
  done: boolean;
  output: string | null;
  error: string | null;
}

/** Nama skill: huruf kecil, angka, tanda hubung (sama dengan nama folder skill). */
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Kategori skill LifeOS = nama folder mount di container Hermes (`/opt/data/skills/lifeos`). */
export const LIFEOS_SKILL_CATEGORY = "lifeos";

/**
 * Perintah untuk Hermes agar menjalankan skill atas satu pengajuan. ID & judul pengajuan dari database LifeOS (bukan dari
 * isi pesan pemohon); agen tetap membaca isi lewat MCP.
 */
export function skillRunInput(skill: string, request: { id: string; title: string }) {
  return [
    `Jalankan skill \`${skill}\` untuk pengajuan LifeOS berikut.`,
    `- ID pengajuan: ${request.id}`,
    `- Judul: ${request.title.replace(/\s+/g, " ").slice(0, 200)}`,
    "",
    "Gunakan alat MCP `lifeos`. Simpan hasil ke pengajuan lalu serahkan ke pemilik (submitForReview). Jangan menyetujui,",
    "menolak, atau mengirim apa pun. Akhiri dengan ringkasan singkat dalam Bahasa Indonesia.",
  ].join("\n");
}

/**
 * Perintah tugas dari Kebijakan Otomatis: skill sama dengan tombol, ditambah kewajiban menyerahkan daftar aset ke server
 * (keputusan akhir diambil server LifeOS menurut aturan pemilik, bukan oleh agen).
 */
export function policyRunInput(skill: string, request: { id: string; title: string }, policyName: string) {
  return [
    skillRunInput(skill, request),
    "",
    `Tugas ini dijalankan otomatis oleh Kebijakan Otomatis "${policyName.replace(/\s+/g, " ").slice(0, 80)}".`,
    "Bila berkas memuat daftar aset, serahkan semuanya lewat `submit_asset_check` sebelum membuat dokumen, lalu ikuti",
    "`branch` pada responsnya. Keputusan akhir diambil server LifeOS — jangan meminta konfirmasi pengguna.",
  ].join("\n");
}

/** Respons `GET /v1/skills` (array, atau `{ data | skills: [...] }`) → daftar skill, skill LifeOS di atas. */
export function parseSkills(body: unknown): AgentSkill[] {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown })?.data)
      ? (body as { data: unknown[] }).data
      : Array.isArray((body as { skills?: unknown })?.skills)
        ? (body as { skills: unknown[] }).skills
        : [];
  const skills: AgentSkill[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.name !== "string" || !s.name) continue;
    const category = typeof s.category === "string" ? s.category : "";
    skills.push({
      name: s.name,
      description: typeof s.description === "string" ? s.description : "",
      category,
      lifeos: category.toLowerCase() === LIFEOS_SKILL_CATEGORY,
    });
  }
  return skills.sort((a, b) => Number(b.lifeos) - Number(a.lifeos) || a.name.localeCompare(b.name));
}

/** Respons `GET /v1/runs/{id}` → tampilan ringkas. Status tidak dikenal = belum selesai. */
export function parseRun(runId: string, body: unknown): AgentRunView {
  const r = (body ?? {}) as Record<string, unknown>;
  const status = typeof r.status === "string" ? r.status : "unknown";
  const done = (TERMINAL_STATUSES as readonly string[]).includes(status);
  const output = typeof r.output === "string" ? r.output : outputText(r.output);
  const rawError = r.error as unknown;
  const error =
    typeof rawError === "string"
      ? rawError
      : rawError && typeof rawError === "object" && typeof (rawError as { message?: unknown }).message === "string"
        ? (rawError as { message: string }).message
        : status === "failed"
          ? "Agen gagal menyelesaikan tugas."
          : null;
  return { runId, status, done, output: output || null, error };
}

/** `output` berbentuk item Responses ([{ content: [{ text }] }]) → teks. */
function outputText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((item) => {
      const content = (item as { content?: unknown })?.content;
      if (typeof content === "string") return [content];
      return Array.isArray(content)
        ? content.map((c) => (typeof (c as { text?: unknown })?.text === "string" ? (c as { text: string }).text : ""))
        : [];
    })
    .join("")
    .trim();
}

/** Pemilik agen = `HERMES_OWNER_EMAIL` (Hermes memakai token MCP milik satu user — orang lain tidak boleh memakainya). */
export const isAgentOwner = (ownerEmail: string | undefined, email: string) =>
  !!ownerEmail && ownerEmail.trim().toLowerCase() === email.trim().toLowerCase();

/** ID sesi Hermes per user + percakapan (huruf/angka/tanda hubung, maks. 64). */
export const sessionIdFor = (userId: string, conversation: string) =>
  `lifeos-${userId}-${conversation.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || "utama"}`;

/**
 * Frontmatter `SKILL.md` (`name`, `description`) → skill LifeOS. Dipakai karena daftar skill API Hermes (`/v1/skills`)
 * bisa gagal (bug Hermes 0.22.x) dan repo adalah sumber kebenaran skill (AG-22).
 */
export function parseSkillFile(text: string, folder: string): AgentSkill | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const field = (key: string) => {
    const line = match[1].split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
    return line
      ? line
          .slice(key.length + 1)
          .trim()
          .replace(/^["']|["']$/g, "")
      : "";
  };
  const name = field("name") || folder;
  if (!SKILL_NAME.test(name)) return null;
  return { name, description: field("description"), category: LIFEOS_SKILL_CATEGORY, lifeos: true };
}
