import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Browser, type BrowserContext, chromium, type Locator, type Page } from "playwright";
import {
  allowedHosts,
  clampText,
  DEFAULT_LOGIN_MARKERS,
  type InputEvent,
  looksLikeLogin,
  urlAllowed,
  VIEWPORT,
} from "./logic.js";
import { groupRhk, overlapsYear, parseSkpBlock, type Rhk, type RhkRow, type SkpSummary } from "./ekinerja.js";
import {
  BUTTON_LABELS,
  type FillStep,
  FORBIDDEN_BUTTON,
  indicatorsToCheck,
  modalPasses,
  monthSummary,
  MONTH_NAMES,
  monthName,
  normalize,
  parseItems,
  plannedSteps,
  type RenaksiRow,
  rowKey,
  syncPlan,
} from "./ekinerja-renaksi.js";
import { classifyFields, infoDialogButton, loginStage, pickSubmit } from "./login-form.js";
import {
  mergeReferenceItems,
  parseReferenceRows,
  parseTotal,
  DEFAULT_REFERENCE_CATEGORIES,
  maxReferencePages,
  REFERENCE_PAGES,
  type ReferenceCategory,
  type ReferenceItem,
} from "./srikandi-reference.js";
import {
  attachmentName,
  isFileResponse,
  isSigned,
  letterFileName,
  looksLikePdf,
  mimeForName,
  type OutgoingLetter,
  parseLetterRow,
  sameSite,
  validFileBody,
} from "./srikandi.js";
import {
  findDraft,
  LOG_PATH,
  type LogRow,
  pickOption,
  REGISTER_PATH,
  type RegisterForm,
  type RegisterPick,
  SELECT_LABELS,
  type SelectKey,
  searchTerm,
  detailIdOf,
} from "./srikandi-register.js";

/** Alamat yang tampak seperti berkas lampiran. */
const FILE_URL = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|jpe?g|png|zip)$/i;
/** Batas butir per job (satu bulan) agar job tidak berjalan tanpa akhir. */
const MAX_RENAKSI_STEPS = 60;

/** Sesi tersimpan = cookie + localStorage + IndexedDB (format `storageState` Playwright), dikelola backend (terenkripsi). */
export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export interface Target {
  /** Alamat utama sistem (mis. https://srikandi.arsip.go.id) */
  baseUrl: string;
  /** Host tambahan yang boleh dibuka (mis. server SSO) */
  extraHosts?: string[];
  /** Penanda alamat halaman login khusus sistem ini */
  loginMarkers?: string[];
  storageState?: StorageState | null;
}

/** SKP + RHK-nya (null = Detail SKP tidak dibaca karena di luar tahun yang diminta). */
export type SkpWithRhk = SkpSummary & { rhk: Rhk[] | null };

/** PDF naskah ber-TTD yang ditangkap dari halaman detail (`pdf` base64; null = tidak tertangkap, `pages` = jejak respons). */
export interface FetchedLetter {
  key: string;
  name: string;
  pdf: string | null;
  attachments: FetchedAttachment[];
  pages: string[];
}

/** Lampiran naskah (`data` base64; null = tidak tertangkap / melebihi batas). */
export interface FetchedAttachment {
  name: string;
  data: string | null;
  mimeType: string;
}

const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Batas halaman tabel referensi yang dibaca per menu (10 baris/halaman). */
const MAX_ATTACHMENTS = 10;
/** Batas total lampiran per naskah (respons robot → backend) */
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

interface LiveSession {
  context: BrowserContext;
  page: Page;
  hosts: string[];
  markers: string[];
  lastUsed: number;
}

/** Sesi login jarak jauh ditutup otomatis bila tidak dipakai selama ini. */
const IDLE_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 4;
const NAV_TIMEOUT = 45_000;

/**
 * Satu Chromium bersama; setiap sesi/job memakai context terpisah (tidak berbagi cookie). Robot tidak menyimpan apa pun
 * di disk: sesi masuk sebagai `storageState` dari backend dan dikembalikan setelah selesai.
 */
export class BrowserPool {
  private browser?: Promise<Browser>;
  private readonly sessions = new Map<string, LiveSession>();

  constructor() {
    setInterval(() => void this.sweep(), 60_000).unref();
  }

  get size() {
    return this.sessions.size;
  }

  private async getBrowser(): Promise<Browser> {
    this.browser ??= chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
    const browser = await this.browser;
    if (!browser.isConnected()) {
      this.browser = undefined;
      return this.getBrowser();
    }
    return browser;
  }

  private async newContext(target: Target, options: { downloads?: boolean } = {}) {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      locale: "id-ID",
      timezoneId: "Asia/Jakarta",
      // Unduhan hanya untuk job yang membutuhkannya (lampiran SRIKANDI) — berkas sementara, dihapus setelah dibaca
      acceptDownloads: options.downloads ?? false,
      storageState: target.storageState ?? undefined,
    });
    context.setDefaultNavigationTimeout(NAV_TIMEOUT);
    context.setDefaultTimeout(20_000);
    const hosts = allowedHosts(target.baseUrl, target.extraHosts);
    return { context, hosts, markers: [...DEFAULT_LOGIN_MARKERS, ...(target.loginMarkers ?? [])] };
  }

  private async open(page: Page, url: string, hosts: string[]) {
    if (!urlAllowed(url, hosts)) throw new Error(`Alamat di luar konektor: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  }

  private async describe(page: Page, markers: string[]) {
    const url = page.url();
    const hasPassword =
      (await page
        .locator("input[type=password]:visible")
        .count()
        .catch(() => 0)) > 0;
    return { url, title: await page.title().catch(() => ""), loggedIn: !looksLikeLogin(url, hasPassword, markers) };
  }

  // ---------------------------------------------------------------- Login jarak jauh

  async startSession(target: Target & { startUrl?: string }) {
    if (this.sessions.size >= MAX_SESSIONS) throw new Error("Terlalu banyak sesi login terbuka. Tutup yang lain dulu.");
    const { context, hosts, markers } = await this.newContext(target);
    const page = await context.newPage();
    const id = randomUUID();
    const session: LiveSession = { context, page, hosts, markers, lastUsed: Date.now() };
    this.sessions.set(id, session);
    // Popup / tab baru (mis. jendela SSO) menjadi halaman yang ditayangkan; saat ditutup kembali ke tab sebelumnya
    context.on("page", (p: Page) => {
      session.page = p;
      p.on("close", () => {
        if (session.page === p) session.page = context.pages().at(-1) ?? page;
      });
    });
    try {
      await this.open(page, target.startUrl ?? target.baseUrl, hosts);
    } catch (error) {
      await this.closeSession(id);
      throw error;
    }
    return { id, ...(await this.describe(page, markers)) };
  }

  private live(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new NotFound("Sesi login tidak ditemukan atau sudah ditutup.");
    session.lastUsed = Date.now();
    return session;
  }

  async frame(id: string) {
    const { page, markers } = this.live(id);
    const image = await page.screenshot({ type: "jpeg", quality: 60 });
    return { image, ...(await this.describe(page, markers)) };
  }

  async input(id: string, event: InputEvent) {
    const { page, hosts, markers } = this.live(id);
    switch (event.type) {
      case "click":
        await page.mouse.click(event.x, event.y);
        break;
      case "dblclick":
        await page.mouse.dblclick(event.x, event.y);
        break;
      case "move":
        await page.mouse.move(event.x, event.y);
        break;
      case "scroll":
        await page.mouse.move(event.x, event.y);
        await page.mouse.wheel(0, event.dy);
        break;
      case "type":
        await page.keyboard.type(event.text, { delay: 20 });
        break;
      case "key":
        await page.keyboard.press(event.key === "Space" ? " " : event.key);
        break;
      case "goto":
        await this.open(page, event.url, hosts);
        break;
      case "back":
        await page.goBack().catch(() => undefined);
        break;
      case "reload":
        await page.reload().catch(() => undefined);
        break;
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    return this.describe(page, markers);
  }

  /** Simpan sesi (cookie + storage) lalu tutup. */
  async finishSession(id: string) {
    const { context, page, markers } = this.live(id);
    await this.dismissInfoDialog(page);
    const info = await this.describe(page, markers);
    const storageState = await context.storageState({ indexedDB: true });
    await this.closeSession(id);
    return { ...info, storageState };
  }

  async closeSession(id: string) {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    await session?.context.close().catch(() => undefined);
  }

  private async sweep() {
    const now = Date.now();
    for (const [id, s] of this.sessions) if (now - s.lastUsed > IDLE_MS) await this.closeSession(id);
  }

  // ---------------------------------------------------------------- Job singkat (tanpa tayangan)

  /** Buka halaman utama dengan sesi tersimpan → masih login? (sesi diperbarui dikembalikan). */
  async check(target: Target & { homeUrl?: string }) {
    return this.withPage(target, async (page, hosts, markers) => {
      await this.open(page, target.homeUrl ?? target.baseUrl, hosts);
      await this.dismissInfoDialog(page);
      return this.describe(page, markers);
    });
  }

  /**
   * Eksplor: buka satu halaman sistem dengan sesi tersimpan lalu kembalikan tangkapan layar + snapshot aksesibilitas
   * (struktur formulir/tombol) — bahan untuk memetakan alur pengisian bersama pengguna.
   */
  async capture(target: Target & { url: string }) {
    return this.withPage(target, async (page, hosts, markers) => {
      await this.open(page, target.url, hosts);
      return this.record(page, markers);
    });
  }

  /**
   * Rekam halaman yang sedang tampil di browser jarak jauh (mis. setelah pengguna membuka Rencana Aksi atau formulir
   * tambah) — keadaan yang tidak bisa dicapai lewat alamat saja. Tidak mengklik apa pun.
   */
  async captureSession(id: string) {
    const { context, page, markers } = this.live(id);
    const result = await this.record(page, markers);
    return { ...result, storageState: await context.storageState({ indexedDB: true }) };
  }

  /**
   * e-Kinerja: baca daftar SKP (`/skp`) lalu tabel Hasil Kerja tiap Detail SKP yang beririsan dengan `year` (satu tahun
   * bisa beberapa SKP). Hanya membuka halaman & membaca teks — tidak mengklik apa pun.
   */
  async ekinerjaSkp(target: Target & { year?: number; maxDetails?: number }) {
    return this.withPage(target, async (page, hosts, markers) => {
      const base = target.baseUrl.replace(/\/+$/, "");
      await this.open(page, `${base}/skp`, hosts);
      await this.dismissInfoDialog(page);
      const info = await this.describe(page, markers);
      if (!info.loggedIn) return { ...info, skps: [] as SkpWithRhk[] };

      // Tabel Periode & Status diikuti tautan Rencana Aksi milik SKP yang sama (urutan dokumen)
      const blocks = await page.evaluate(() => {
        const found: { href: string; text: string }[] = [];
        let period = "";
        let status = "";
        for (const el of document.querySelectorAll("table, a[href*='/skp/renaksi/']")) {
          if (el instanceof HTMLAnchorElement) {
            found.push({ href: el.href, text: `${period}\n${status}` });
            period = status = "";
          } else {
            const text = (el as HTMLElement).innerText;
            if (/Periode\s*:/i.test(text)) period = text;
            else if (/Status\s*:/i.test(text)) status = text;
          }
        }
        return found;
      });
      const skps = blocks.map((b) => parseSkpBlock(b.text, b.href)).filter((s): s is SkpSummary => !!s);
      const wanted = skps.filter((s) => !target.year || overlapsYear(s, target.year)).slice(0, target.maxDetails ?? 8);

      const result: SkpWithRhk[] = skps.map((s) => ({ ...s, rhk: null }));
      for (const skp of wanted) {
        await this.open(page, `${base}/skp/detail/${skp.externalId}`, hosts);
        const rows = await page.evaluate(() => {
          const table = [...document.querySelectorAll("table")].find((t) =>
            [...t.querySelectorAll("th")].some((th) => /^\s*RENCANA HASIL KERJA\s*$/i.test(th.textContent ?? "")),
          );
          if (!table) return null;
          let section = "UTAMA";
          const out: Record<string, string>[] = [];
          for (const tr of table.querySelectorAll("tbody tr")) {
            // Tombol di dalam sel (Edit RHK / Hapus RHK pada SKP draft) bukan bagian narasi → dibuang sebelum dibaca
            const cells = [...(tr as HTMLTableRowElement).cells].map((c) => {
              const copy = c.cloneNode(true) as HTMLElement;
              copy.querySelectorAll("button, a, [role=group], .btn-group, .dropdown").forEach((x) => x.remove());
              return (copy.innerText || copy.textContent || "").trim();
            });
            if (cells.length === 1) {
              if (cells[0]) section = cells[0];
            } else if (cells.length >= 6) {
              const [no, leader, rhk, aspect, indicator, target] = cells;
              out.push({ section, no, leader, rhk, aspect, indicator, target });
            }
          }
          return out;
        });
        const item = result.find((r) => r.externalId === skp.externalId)!;
        item.rhk = rows ? groupRhk(rows as unknown as RhkRow[]) : [];
      }
      return { ...info, skps: result };
    });
  }

  /**
   * e-Kinerja: isi Rencana Aksi satu bulan pada `/skp/renaksi/<id SKP>`.
   * - `mode: "add"` (bawaan): centang indikator yang dipetakan LifeOS (tidak pernah melepas) lalu tambahkan butir yang
   *   belum ada (idempoten).
   * - `mode: "sync"`: isi bulan disamakan dengan LifeOS (`rows` = seluruh isian bulan itu) — indikator yang tidak diminta
   *   dilepas, baris yang memuat butir di luar LifeOS ditulis ulang (lepas centang → centang lagi → isi ulang), lalu butir
   *   yang kurang ditambahkan. Backend selalu membaca & mengimpor isi e-Kinerja lebih dulu sehingga tidak ada butir yang hilang.
   * Berhenti di draf: "Kirim Penilaian Ke Atasan" tidak pernah diklik, bulan yang sudah diajukan ditolak.
   */
  async ekinerjaRenaksi(
    target: Target & {
      skpExternalId: string;
      period: string;
      rows: RenaksiRow[];
      dryRun?: boolean;
      mode?: "add" | "sync";
    },
  ) {
    return this.withPage(target, async (page, hosts, markers) => {
      const month = monthName(target.period);
      if (!month) throw new Error("Periode tidak valid.");
      const base = target.baseUrl.replace(/\/+$/, "");
      const url = `${base}/skp/renaksi/${encodeURIComponent(target.skpExternalId)}`;
      await this.open(page, url, hosts);
      await this.dismissInfoDialog(page);
      const info = await this.describe(page, markers);
      const empty = {
        month,
        checked: [] as string[],
        unchecked: [] as string[],
        rewritten: [] as string[],
        added: [] as FillStep[],
        missing: [] as string[],
        rows: [] as unknown[],
      };
      if (!info.loggedIn) return { ...info, ...empty, status: "logged_out" as const, screenshot: null };

      let block = await this.renaksiBlock(page, month);
      if (!block.found) throw new Error(`Blok bulan ${month} tidak ditemukan di halaman Rencana Aksi.`);
      if (block.submitted) {
        return { ...info, ...empty, rows: block.rows, status: "submitted" as const, screenshot: await this.jpeg(page) };
      }
      const sync = target.mode === "sync";
      const plan = sync ? syncPlan(block.rows, target.rows) : null;

      // Periksa saja: baca isi bulan + rencana langkah tanpa mengklik apa pun
      if (target.dryRun) {
        // Mode sinkron: baris yang ditulis ulang dihitung kosong, indikator yang akan dicentang dihitung sebagai baris baru
        const previewRows = plan
          ? [
              ...block.rows.map((r) =>
                plan.rewrite.includes(r.key) ? { ...r, renaksi: [], realisasi: [], bukti: [] } : r,
              ),
              ...plan.check.map((key) => ({ key, renaksi: [], realisasi: [], bukti: [] })),
            ]
          : block.rows;
        const preview = plannedSteps(previewRows, target.rows);
        return {
          ...info,
          ...empty,
          status: "preview" as const,
          planned: preview.steps,
          missing: preview.missing,
          check:
            plan?.check ??
            target.rows.map((r) => rowKey(r.rhk, r.indicator)).filter((k) => !block.rows.some((r) => r.key === k)),
          uncheck: plan?.uncheck ?? [],
          rewrite: plan?.rewrite ?? [],
          rows: block.rows,
          screenshot: await this.jpeg(page),
        };
      }

      // Langkah 1: pilihan indikator (centang baru; mode sync juga melepas & menulis ulang)
      let checked: string[] = [];
      let unchecked: string[] = [];
      let missing: string[] = [];
      const wantedKeys = target.rows.map((r) => rowKey(r.rhk, r.indicator));
      const needsModal = plan
        ? plan.check.length + plan.uncheck.length + plan.rewrite.length > 0
        : wantedKeys.some((k) => !block.rows.some((r) => r.key === k));
      if (needsModal) {
        const opened = await this.openIndicatorModal(page, block);
        missing = wantedKeys.filter((k) => !opened.options.some((o) => o.key === k));
        if (plan) {
          const passes = modalPasses(
            opened.options.map((o) => o.key),
            opened.options.filter((o) => o.checked).map((o) => o.key),
            plan,
          );
          if (!passes) throw new Error("Semua indikator SKP perlu ditulis ulang sekaligus — lakukan dari e-Kinerja.");
          await this.applyIndicatorModal(page, opened, passes.first);
          checked = passes.first.check;
          unchecked = passes.first.uncheck;
          block = await this.renaksiBlock(page, month);
          if (passes.second) {
            const again = await this.openIndicatorModal(page, block);
            await this.applyIndicatorModal(page, again, passes.second);
            block = await this.renaksiBlock(page, month);
          }
        } else {
          const pick = indicatorsToCheck(opened.options, target.rows);
          missing = pick.missing;
          checked = pick.check;
          await this.applyIndicatorModal(page, opened, { check: pick.check, uncheck: [] });
          block = await this.renaksiBlock(page, month);
        }
      }

      // Langkah 2: tambah butir yang belum ada (dibaca ulang setiap kali karena halaman dimuat ulang setelah Simpan)
      const steps = plannedSteps(block.rows, target.rows);
      missing = [...new Set([...missing, ...steps.missing])];
      const added: FillStep[] = [];
      for (const step of steps.steps.slice(0, MAX_RENAKSI_STEPS)) {
        const row = block.rows.find((r) => r.key === step.key);
        if (!row) continue;
        const button = page
          .locator(`tr[data-lifeos-row="${row.index}"] button`)
          .filter({ hasText: BUTTON_LABELS[step.kind] });
        await this.safeClick(button.first());
        const modal = page
          .locator(".modal.show, .modal.in, [role=dialog]")
          .filter({ has: page.locator("textarea:visible") });
        await modal.first().waitFor({ state: "visible", timeout: 15_000 });
        await modal.first().locator("textarea:visible").first().fill(step.value);
        await this.saveModal(page, modal.first());
        added.push(step);
        block = await this.renaksiBlock(page, month);
      }
      const done = plannedSteps(block.rows, target.rows);
      const leftover = plan ? syncPlan(block.rows, target.rows) : null;
      const clean = !done.steps.length && !done.missing.length && (!leftover || !leftover.rewrite.length);
      return {
        ...info,
        month,
        status: clean ? ("filled" as const) : ("partial" as const),
        checked,
        unchecked,
        rewritten: plan?.rewrite ?? [],
        added,
        missing,
        rows: block.rows,
        screenshot: await this.jpeg(page),
      };
    });
  }

  /**
   * e-Kinerja: baca semua blok bulan Rencana Aksi satu SKP (status, tanggal pengajuan, rating, isi per indikator,
   * feedback). Hanya membaca — tidak ada yang diklik.
   */
  async ekinerjaRenaksiRead(target: Target & { skpExternalId: string }) {
    return this.withPage(target, async (page, hosts, markers) => {
      const base = target.baseUrl.replace(/\/+$/, "");
      await this.open(page, `${base}/skp/renaksi/${encodeURIComponent(target.skpExternalId)}`, hosts);
      await this.dismissInfoDialog(page);
      await page
        .waitForFunction(() => /januari/i.test(document.body.innerText), undefined, { timeout: 20_000 })
        .catch(() => undefined);
      const info = await this.describe(page, markers);
      if (!info.loggedIn) return { ...info, months: [] };
      const months = [];
      for (const [index, month] of MONTH_NAMES.entries()) {
        const block = await this.renaksiBlock(page, month);
        if (!block.found) continue;
        const summary = monthSummary(block.text, block.canFill, block.canEdit, block.rows.length);
        months.push({
          month: index + 1,
          ...summary,
          rows: block.rows.map(({ key, text, feedback, renaksi, realisasi, bukti }) => ({
            key,
            text,
            feedback,
            renaksi,
            realisasi,
            bukti,
          })),
        });
      }
      return { ...info, months };
    });
  }

  /** Buka modal "Pilih Indikator Kinerja" (tombol Isi … Bulan / Edit Rencana Aksi Kerja) dan baca pilihannya. */
  private async openIndicatorModal(page: Page, block: { canFill: boolean; canEdit: boolean }) {
    const opener = block.canFill ? "[data-lifeos-renaksi=fill]" : block.canEdit ? "[data-lifeos-renaksi=edit]" : null;
    if (!opener) throw new Error("Bulan ini belum bisa diisi (tombol Isi/Edit Rencana Aksi Kerja tidak ada).");
    await this.safeClick(page.locator(opener).first());
    const modal = page.locator(".modal.show, .modal.in, [role=dialog]").filter({ hasText: "Pilih Indikator Kinerja" });
    await modal.first().waitFor({ state: "visible", timeout: 15_000 });
    const options = await modal.first().evaluate((box) => {
      const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
      return Array.from(box.querySelectorAll("tbody tr")).flatMap((tr, index) => {
        const input = tr.querySelector("input[type=checkbox]") as HTMLInputElement | null;
        const cell = (tr as HTMLTableRowElement).cells[1];
        if (!input || !cell) return [];
        input.setAttribute("data-lifeos-pick", String(index));
        return [{ index, text: clean(cell.innerText || cell.textContent), checked: input.checked }];
      });
    });
    return { modal: modal.first(), options: options.map((o) => ({ ...o, key: normalize(o.text) })) };
  }

  /** Centang / lepas pilihan indikator lalu Simpan; tanpa perubahan → modal ditutup tanpa menyimpan. */
  private async applyIndicatorModal(
    page: Page,
    opened: { modal: Locator; options: { index: number; key: string }[] },
    change: { check: string[]; uncheck: string[] },
  ) {
    const find = (key: string) => opened.options.find((o) => o.key === key);
    const toCheck = change.check.map(find).filter((o): o is NonNullable<typeof o> => !!o);
    const toUncheck = change.uncheck.map(find).filter((o): o is NonNullable<typeof o> => !!o);
    if (!toCheck.length && !toUncheck.length) {
      await opened.modal
        .locator("button.close, button[aria-label=Close], [data-dismiss=modal], [data-bs-dismiss=modal]")
        .first()
        .click({ timeout: 3_000 })
        .catch(() => page.keyboard.press("Escape"));
      await page.waitForTimeout(500);
      return;
    }
    for (const o of toCheck) await opened.modal.locator(`[data-lifeos-pick="${o.index}"]`).check({ timeout: 5_000 });
    for (const o of toUncheck) {
      await opened.modal.locator(`[data-lifeos-pick="${o.index}"]`).uncheck({ timeout: 5_000 });
    }
    await this.saveModal(page, opened.modal);
  }

  private async jpeg(page: Page) {
    return (
      (await page.screenshot({ type: "jpeg", quality: 60, fullPage: false }).catch(() => null))?.toString("base64") ??
      null
    );
  }

  /** Klik dengan pengaman: tombol kirim/ajukan/hapus tidak pernah diklik. */
  private async safeClick(locator: Locator) {
    const text = (await locator.textContent({ timeout: 10_000 })) ?? "";
    if (FORBIDDEN_BUTTON.test(text)) throw new Error(`Tombol "${text.trim()}" tidak boleh diklik robot.`);
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 10_000 });
  }

  /** Simpan modal (tombol "Simpan" di dalamnya), tunggu halaman tenang, tolak bila e-Kinerja menampilkan gagal. */
  private async saveModal(page: Page, modal: Locator) {
    await this.safeClick(
      modal
        .locator("button, input[type=submit]")
        .filter({ hasText: /^\s*Simpan\s*$/ })
        .first(),
    );
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    const error = await page
      .locator(".swal2-popup:visible, .swal-modal:visible")
      .filter({ hasText: /gagal|error|harus/i })
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => null);
    if (error) throw new Error(`e-Kinerja menolak: ${error.replace(/\s+/g, " ").trim().slice(0, 200)}`);
    await this.dismissInfoDialog(page);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  }

  /**
   * Tandai blok bulan di halaman (urutan dokumen: judul bulan → tabel & tombol bulan itu) lalu baca barisnya. Elemen
   * diberi penanda `data-lifeos-*` agar diklik lewat locator.
   */
  private async renaksiBlock(page: Page, month: string) {
    const raw = await page.evaluate(
      ({ month, months }) => {
        const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
        document.querySelectorAll("[data-lifeos-renaksi], [data-lifeos-row]").forEach((el) => {
          el.removeAttribute("data-lifeos-renaksi");
          el.removeAttribute("data-lifeos-row");
        });
        // Nama bulan bisa berupa node teks lepas di wadah bersama ("oktober", "juli Rating Hasil Kerja : …") →
        // telusuri node (elemen + teks) sesuai urutan dokumen; teks di dalam tabel/modal bukan judul bulan
        let current = "";
        let text = "";
        let found = false;
        const tables: HTMLTableElement[] = [];
        const buttons: HTMLElement[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
          if (!parent || parent.closest(".modal, [role=dialog], script, style")) continue;
          // Halaman memuat templat tersembunyi (rating kosong, tab Perilaku) → hanya yang terlihat
          if (!parent.getClientRects().length || getComputedStyle(parent).visibility === "hidden") continue;
          if (node.nodeType === Node.TEXT_NODE) {
            if (parent.closest("table, button")) continue;
            const value = clean(node.textContent);
            if (!value) continue;
            const first = value.toLowerCase().split(" ")[0] ?? "";
            if (months.includes(first)) {
              current = first;
              if (current === month) found = true;
            }
            if (current === month) text += ` ${value}`;
            continue;
          }
          if (current !== month) continue;
          if (node instanceof HTMLTableElement) tables.push(node);
          if (
            node instanceof HTMLButtonElement ||
            (node instanceof HTMLAnchorElement && node.classList.contains("btn"))
          ) {
            buttons.push(node as HTMLElement);
          }
        }
        let canFill = false;
        let canEdit = false;
        for (const b of buttons) {
          const label = clean(b.textContent);
          if (/^Isi Rencana Aksi Kerja Bulan/i.test(label) && label.toLowerCase().endsWith(month)) {
            b.setAttribute("data-lifeos-renaksi", "fill");
            canFill = true;
          } else if (/^Edit Rencana Aksi Kerja/i.test(label)) {
            b.setAttribute("data-lifeos-renaksi", "edit");
            canEdit = true;
          }
        }
        // Sel "Rencana Aksi dan Realisasi": judul bagian (Renaksi / Realisasi / Bukti Data Dukung) lalu butir <li>;
        // struktur pembungkusnya tidak dijamin → telusuri node berurutan, teks di luar <li> yang berupa judul = bagian baru
        const sectionsOf = (cell: Element) => {
          const sections: { label: string; items: string[] }[] = [];
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (n.nodeType === Node.TEXT_NODE) {
              const value = clean(n.textContent);
              if (value && !n.parentElement?.closest("li") && /^(renaksi|realisasi|bukti)/i.test(value)) {
                sections.push({ label: value, items: [] });
              }
            } else if ((n as Element).tagName === "LI" && sections.length) {
              sections[sections.length - 1].items.push(clean((n as HTMLElement).innerText || n.textContent));
            }
          }
          return sections;
        };
        let index = 0;
        const rows: {
          index: number;
          text: string;
          sections: { label: string; items: string[] }[];
          feedback: string;
        }[] = [];
        for (const table of tables) {
          // Kolom ke-4: "Feedback" (bulan diajukan) atau "Aksi" (draf, berisi tombol isi)
          const fourth = clean(table.querySelector("thead th:nth-child(4)")?.textContent);
          const hasFeedback = /feedback/i.test(fourth);
          for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
            const cells = (tr as HTMLTableRowElement).cells;
            if (cells.length < 3) continue;
            tr.setAttribute("data-lifeos-row", String(index));
            const sections = sectionsOf(cells[2]);
            // Feedback atasan: "👍" / "Belum ada feedback"
            const feedback = hasFeedback && cells[3] ? clean((cells[3] as HTMLElement).innerText) : "";
            rows.push({ index, text: clean((cells[1] as HTMLElement).innerText), sections, feedback });
            index++;
          }
        }
        return { found, text: clean(text), canFill, canEdit, rows };
      },
      { month, months: MONTH_NAMES },
    );
    return {
      found: raw.found,
      // Bulan yang sudah diajukan menampilkan rating di judulnya dan tidak punya tombol Isi/Edit; robot berhenti
      submitted:
        /Rating Hasil Kerja\s*:\s*[A-Z]/.test(raw.text) || (!raw.canFill && !raw.canEdit && raw.rows.length > 0),
      canFill: raw.canFill,
      canEdit: raw.canEdit,
      text: raw.text,
      rows: raw.rows.map((r) => ({
        index: r.index,
        key: normalize(r.text),
        text: r.text,
        feedback: r.feedback,
        ...parseItems(r.sections),
      })),
    };
  }

  /**
   * SRIKANDI: baca Daftar Naskah Keluar, lalu untuk naskah yang sudah ditandatangani dan belum dikenal backend (`known` =
   * nomor naskah) buka halaman detailnya dan tangkap PDF naskah yang dimuat penampil (maks. `maxFetch`). Tidak ada
   * tombol yang diklik.
   */
  async srikandiOutgoing(target: Target & { known?: string[]; haveMain?: string[]; maxFetch?: number }) {
    return this.withPage(
      target,
      async (page, hosts, markers) => {
        const base = target.baseUrl.replace(/\/+$/, "");
        await this.open(page, `${base}/pembuatan-naskah-keluar/naskah-keluar`, hosts);
        await this.dismissInfoDialog(page);
        const info = await this.describe(page, markers);
        if (!info.loggedIn) return { ...info, letters: [] as OutgoingLetter[], files: [] as FetchedLetter[] };

        // Tabel diisi lewat API setelah halaman tampil → tunggu tautan detail / keterangan akhir data
        await page
          .waitForFunction(
            () =>
              !!document.querySelector("a[href*='naskah-keluar/detail']") ||
              /Semua data telah dimuat|Tidak ada data|Data tidak ditemukan/i.test(document.body.innerText),
            undefined,
            { timeout: 20_000 },
          )
          .catch(() => undefined);
        const rows = await page.evaluate(() =>
          [...document.querySelectorAll("table tbody tr")].map((tr) => ({
            cells: [...(tr as HTMLTableRowElement).cells].map((c) => (c as HTMLElement).innerText.trim()),
            href: (tr.querySelector("a[href*='naskah-keluar/detail']") as HTMLAnchorElement | null)?.href ?? null,
          })),
        );
        const letters = rows.map((r) => parseLetterRow(r.cells, r.href)).filter((l): l is OutgoingLetter => !!l);

        const known = new Set(target.known ?? []);
        const wanted = letters
          .filter((l) => isSigned(l.signStatus) && !known.has(l.key))
          .slice(0, target.maxFetch ?? 5);
        const files: FetchedLetter[] = [];
        const haveMain = new Set(target.haveMain ?? []);
        for (const letter of wanted) files.push(await this.capturePdf(page, letter, hosts, !haveMain.has(letter.key)));
        return { ...info, letters, files };
      },
      { downloads: true },
    );
  }

  /**
   * Buka detail naskah: PDF pertama yang dimuat penampil = naskah utama. Lampiran baru dimuat setelah "Lihat" di daftar
   * lampiran diklik → robot hanya mengklik teks persis "Lihat" pada butir yang berupa nama berkas (melihat, bukan
   * mengubah), menangkap berkas dari respons jaringan (termasuk tab baru), lalu menutup penampil dengan Esc.
   */
  private async capturePdf(
    page: Page,
    letter: OutgoingLetter,
    hosts: string[],
    withMain: boolean,
  ): Promise<FetchedLetter> {
    const context = page.context();
    const captured: { url: string; type: string; body: Buffer }[] = [];
    const seen: string[] = [];
    let pending: Promise<void>[] = [];
    const onResponse = (response: import("playwright").Response) => {
      const type = response.headers()["content-type"] ?? "";
      if (!isFileResponse(type)) return;
      const url = response.url();
      seen.push(`${type.split(";")[0]} ${url.split("?")[0].slice(0, 160)}`);
      pending.push(
        response
          .body()
          .then((body) => {
            if (body.length > 4 && body.length <= MAX_PDF_BYTES) captured.push({ url, type, body });
          })
          .catch(() => undefined),
      );
    };
    const settle = async (timeout: number) => {
      await page.waitForLoadState("networkidle", { timeout }).catch(() => undefined);
      await Promise.all(pending);
      pending = [];
    };
    // Lampiran yang dibuka di tab/iframe = unduhan di Chromium headless → tangkap juga unduhan & alamat berkas yang diminta
    const downloads: import("playwright").Download[] = [];
    const requested: string[] = [];
    const site = new URL(letter.detailUrl, page.url()).toString();
    const onDownload = (d: import("playwright").Download) => void downloads.push(d);
    const onPage = (p: Page) => void p.on("download", onDownload);
    const onRequest = (request: import("playwright").Request) => {
      const url = request.url();
      if (!sameSite(url, site)) return;
      // Berkas di host penyimpanan (mis. s3.arsip.go.id) sering tanpa ekstensi di alamatnya
      const fileHost = new URL(url).hostname !== new URL(site).hostname;
      const kind = request.resourceType();
      if (FILE_URL.test(url.split("?")[0]) || (fileHost && (kind === "document" || kind === "fetch" || kind === "xhr")))
        requested.push(url);
    };
    page.on("download", onDownload);
    context.on("page", onPage);
    context.on("request", onRequest);
    context.on("response", onResponse);
    let main: Buffer | null = null;
    const attachments: FetchedAttachment[] = [];
    try {
      await this.open(page, new URL(letter.detailUrl, page.url()).toString(), hosts);
      await settle(20_000);
      main = captured.find((c) => looksLikePdf(c.body))?.body ?? null;

      // Daftar lampiran: butir yang teksnya nama berkas (+ "Lihat")
      const items = await page.evaluate(() =>
        [...document.querySelectorAll("li")].map((li) => (li as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
      );
      const names = [...new Set(items.map(attachmentName).filter((n): n is string => !!n))].slice(0, MAX_ATTACHMENTS);
      let total = 0;
      for (const name of names) {
        const before = captured.length;
        const beforeDownloads = downloads.length;
        const beforeRequests = requested.length;
        const item = page.locator("li", { hasText: name }).first();
        const view = item.getByText("Lihat", { exact: true }).first();
        if (!(await view.count())) {
          attachments.push({ name, data: null, mimeType: mimeForName(name) });
          continue;
        }
        const popup = context.waitForEvent("page", { timeout: 4_000 }).catch(() => null);
        const clicked = await view
          .click({ timeout: 10_000 })
          .then(() => true)
          .catch(() => false);
        const opened = await popup;
        if (opened) await opened.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
        await settle(30_000);
        // Tunggu sebentar bila belum ada respons / unduhan / permintaan berkas baru
        for (let i = 0; i < 20; i++) {
          if (captured.length > before || downloads.length > beforeDownloads || requested.length > beforeRequests)
            break;
          await page.waitForTimeout(500);
        }
        await Promise.all(pending);
        let body: Buffer | null =
          captured.slice(before).find((c) => validFileBody(c.body, name) && (!main || !c.body.equals(main)))?.body ??
          null;
        const download = downloads[beforeDownloads];
        if (!body && download) {
          const path = await download.path().catch(() => null);
          if (path) body = await readFile(path).catch(() => null);
          await download.delete().catch(() => undefined);
          seen.push(`unduhan ${download.suggestedFilename().slice(0, 80)}`);
        }
        if (!body) {
          for (const url of requested.slice(beforeRequests)) {
            const res = await context.request.get(url, { timeout: 60_000, maxRedirects: 3 }).catch(() => null);
            const data = res?.ok() ? await res.body().catch(() => null) : null;
            seen.push(`ambil-ulang ${res?.status() ?? "galat"} ${url.split("?")[0].slice(0, 120)}`);
            if (data && data.length <= MAX_PDF_BYTES && validFileBody(data, name)) {
              body = data;
              break;
            }
          }
        }
        if (body && !validFileBody(body, name)) body = null;
        if (body && total + body.length <= MAX_TOTAL_BYTES) {
          total += body.length;
          attachments.push({ name, data: body.toString("base64"), mimeType: mimeForName(name) });
        } else {
          seen.push(`lampiran gagal: ${name.slice(0, 80)} (klik ${clicked ? "ok" : "gagal"})`);
          attachments.push({ name, data: null, mimeType: mimeForName(name) });
        }
        if (opened) await opened.close().catch(() => undefined);
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(300);
      }
    } finally {
      context.off("response", onResponse);
      context.off("request", onRequest);
      context.off("page", onPage);
      page.off("download", onDownload);
    }
    return {
      key: letter.key,
      name: letterFileName(letter),
      pdf: withMain && main ? main.toString("base64") : null,
      attachments,
      pages: seen.slice(0, 15),
    };
  }

  /**
   * SRIKANDI → Pengguna: baca tabel referensi (penandatangan, tujuan, verifikator, tembusan, grup) semua halaman. Hanya
   * tombol halaman berikutnya di navigasi tabel yang diklik — Tambah Baru / Edit / Sync / Hapus tidak pernah disentuh.
   */
  /**
   * SRIKANDI: isi formulir Registrasi Naskah Keluar dari entri Register LifeOS lalu SIMPAN (draf di Log Naskah Keluar).
   * Pilihan react-select dipilih dengan mengklik opsinya (Enter di kotak cari tanpa opsi ikut mengirim formulir).
   * Draf berhal sama yang belum terkirim tidak dibuat ulang. Kirim Konsep / Kirim Naskah / TTE tidak pernah diklik.
   * `dryRun` = isi formulir lalu berhenti (tidak disimpan) untuk diperiksa.
   */
  async srikandiRegister(target: Target & { form: RegisterForm; dryRun?: boolean }) {
    return this.withPage(target, async (page, hosts, markers) => {
      const form = target.form;
      const base = target.baseUrl.replace(/\/+$/, "");
      await this.open(page, base + LOG_PATH, hosts);
      await this.dismissInfoDialog(page);
      const info = await this.describe(page, markers);
      const empty = { filled: [] as string[], draft: null as LogRow | null };
      if (!info.loggedIn) return { ...info, ...empty, status: "logged_out" as const, screenshot: null };

      const existing = findDraft(await this.readLog(page), form.subject);
      if (existing) {
        return { ...info, ...empty, draft: existing, status: "exists" as const, screenshot: await this.jpeg(page) };
      }

      await this.open(page, base + REGISTER_PATH, hosts);
      await this.dismissInfoDialog(page);
      await page.getByText("Form Registrasi Naskah Keluar").first().waitFor({ timeout: 20_000 });
      const filled: string[] = [];

      await page
        .getByRole("radio", { name: form.formType === "final" ? "Naskah Final" : "Naskah Keluar", exact: true })
        .check();
      await page.waitForTimeout(500);
      const pick = async (key: SelectKey, values: RegisterPick[]) => {
        for (const value of values) {
          await this.pickSelect(page, key, value);
          filled.push(`${SELECT_LABELS[key]}: ${value.label}`);
        }
      };
      await pick("unit", [{ label: form.unit }]);
      await pick("docType", [{ label: form.docType }]);
      await pick("nature", [{ label: form.nature }]);
      await pick("classification", [{ label: form.classification }]);

      const number = page.getByPlaceholder("Masukkan Nomor Naskah...");
      if (form.autoNumber) {
        await this.safeClick(page.getByRole("button", { name: "Ambil Nomor", exact: true }));
        await page.waitForFunction(
          () =>
            !!(document.querySelector("input[placeholder='Masukkan Nomor Naskah...']") as HTMLInputElement | null)
              ?.value,
          undefined,
          { timeout: 15_000 },
        );
      } else {
        await number.fill(form.number ?? "");
      }
      filled.push(`Nomor Naskah: ${await number.inputValue()}`);
      await page.getByPlaceholder("Masukkan Hal..").fill(form.subject);
      await page.getByPlaceholder("Masukkan Isi Ringkas..").fill(form.summary);

      const files = page.locator("input[type=file]");
      const toFile = (f: RegisterForm["file"]) => ({
        name: f.name,
        mimeType: f.mimeType,
        buffer: Buffer.from(f.data, "base64"),
      });
      await files.nth(0).setInputFiles(toFile(form.file));
      filled.push(`File naskah: ${form.file.name}`);
      if (form.attachments.length) {
        const input = files.nth(1);
        const multiple = await input.evaluate((el) => (el as HTMLInputElement).multiple);
        if (multiple) await input.setInputFiles(form.attachments.map(toFile));
        else for (const a of form.attachments) await input.setInputFiles(toFile(a));
        filled.push(`Lampiran: ${form.attachments.map((a) => a.name).join(", ")}`);
      }
      await page.waitForTimeout(800);

      await pick("recipientGroups", form.recipientGroups);
      await pick("recipients", form.recipients);
      await pick("recipientsExternal", form.recipientsExternal);
      await pick("ccGroups", form.ccGroups);
      await pick("cc", form.cc);
      await pick("ccExternal", form.ccExternal);
      if (form.formType === "keluar") {
        await pick("verifiers", form.verifiers);
        if (form.signer) await pick("signer", [form.signer]);
        await page
          .getByRole("radio", {
            name: form.signatureType === "konvensional" ? "Konvensional" : "Elektronik",
            exact: true,
          })
          .check();
        if (form.signatureType === "elektronik") {
          await page
            .getByRole("radio", { name: form.visualTte === "spesimen" ? "Spesimen Gambar" : "QR Code", exact: true })
            .check();
        }
      }

      if (target.dryRun) {
        return {
          ...info,
          filled,
          draft: null,
          status: "preview" as const,
          url: page.url(),
          screenshot: await this.fullJpeg(page),
        };
      }

      await this.safeClick(page.getByRole("button", { name: "Simpan", exact: true }));
      const popup = page.locator(".swal2-popup:visible, .swal-modal:visible").first();
      await popup.waitFor({ timeout: 30_000 });
      const message = ((await popup.textContent()) ?? "").replace(/\s+/g, " ").trim();
      if (!/berhasil/i.test(message)) throw new Error(`SRIKANDI menolak: ${message.slice(0, 300)}`);
      await this.dismissInfoDialog(page);
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

      await this.open(page, base + LOG_PATH, hosts);
      const draft = findDraft(await this.readLog(page), form.subject);
      return { ...info, url: page.url(), filled, draft, status: "saved" as const, screenshot: await this.jpeg(page) };
    });
  }

  /** Pilih satu nilai pada react-select berlabel `SELECT_LABELS[key]`: ketik istilah cari → klik opsi yang cocok. */
  private async pickSelect(page: Page, key: SelectKey, value: RegisterPick) {
    const label = SELECT_LABELS[key];
    const marked = await page.evaluate(
      ({ label, key }) => {
        const clean = (t: string | null | undefined) => (t ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (clean(node.textContent) !== label || !node.parentElement) continue;
          const anchor = node.parentElement;
          const input = Array.from(document.querySelectorAll("input[role=combobox]")).find(
            (el) => anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
          if (input) {
            input.setAttribute("data-lifeos-select", key);
            return true;
          }
        }
        return false;
      },
      { label, key },
    );
    if (!marked) throw new Error(`Kolom "${label}" tidak ditemukan di formulir.`);
    const input = page.locator(`[data-lifeos-select="${key}"]`);
    await input.scrollIntoViewIfNeeded().catch(() => undefined);
    await input.click();
    await input.fill("");
    await input.pressSequentially(searchTerm(value.label), { delay: 25 });
    // Opsi dimuat dari server: tunggu sampai opsi yang cocok muncul (atau "Data tidak ditemukan")
    let index = -1;
    let texts: string[] = [];
    for (let i = 0; i < 30 && index < 0; i++) {
      await page.waitForTimeout(400);
      texts = await page
        .getByRole("option")
        .allTextContents()
        .catch(() => []);
      index = pickOption(texts, value);
      if (index < 0 && i > 8 && (await page.getByText("Data tidak ditemukan").count()) > 0) break;
    }
    if (index < 0) {
      await page.keyboard.press("Escape");
      throw new Error(`Pilihan "${value.label}" tidak ditemukan di kolom ${label}.`);
    }
    await page.getByRole("option").nth(index).click();
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
  }

  /** Baca baris halaman pertama Log Naskah Keluar (kolom dikenali dari judulnya). */
  private async readLog(page: Page): Promise<LogRow[]> {
    await page
      .getByText("Daftar Log Naskah Keluar")
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    const rows = await page.evaluate(() => {
      const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
      const table = document.querySelector("table");
      if (!table) return [];
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => clean(th.textContent).toLowerCase());
      const col = (name: string) => headers.indexOf(name);
      const [number, subject, send] = [col("nomor naskah"), col("hal"), col("status kirim")];
      return Array.from(table.querySelectorAll("tbody tr")).flatMap((tr) => {
        const cells = Array.from((tr as HTMLTableRowElement).cells).map((c) => clean(c.textContent));
        const link = tr.querySelector("a[href*='detail?id=']")?.getAttribute("href") ?? null;
        if (!link || subject < 0) return [];
        return [{ number: cells[number] ?? "", subject: cells[subject] ?? "", sendStatus: cells[send] ?? "", link }];
      });
    });
    return rows.map(({ link, ...r }) => ({ ...r, detailId: detailIdOf(link) }));
  }

  private async fullJpeg(page: Page) {
    return (
      (await page.screenshot({ type: "jpeg", quality: 55, fullPage: true }).catch(() => null))?.toString("base64") ??
      null
    );
  }

  async srikandiReferences(target: Target & { categories?: ReferenceCategory[] }) {
    return this.withPage(target, async (page, hosts, markers) => {
      const base = target.baseUrl.replace(/\/+$/, "");
      const result: {
        category: ReferenceCategory;
        items: ReferenceItem[];
        pages: number;
        total: number | null;
        nav: string;
      }[] = [];
      let info = await this.describe(page, markers);
      const wanted = target.categories ?? DEFAULT_REFERENCE_CATEGORIES;
      for (const ref of REFERENCE_PAGES.filter((p) => wanted.includes(p.category))) {
        await this.open(page, `${base}${ref.path}`, hosts);
        await this.dismissInfoDialog(page);
        info = await this.describe(page, markers);
        if (!info.loggedIn) return { ...info, references: result };
        await page
          .waitForFunction(
            () =>
              document.querySelectorAll("table tbody tr").length > 1 ||
              /Tidak ada data|Data tidak ditemukan|Belum ada data/i.test(document.body.innerText),
            undefined,
            { timeout: 20_000 },
          )
          .catch(() => undefined);
        // Token kedaluwarsa: aplikasi SRIKANDI baru mengalihkan ke /auth/login setelah memuat data → periksa ulang
        info = await this.describe(page, markers);
        if (!info.loggedIn) return { ...info, references: result };
        // "Hitung Total" hanya menghitung jumlah data (tidak mengubah apa pun) → pembanding kelengkapan
        const nav = page.locator("nav[aria-label='Table navigation']");
        const counter = nav.getByRole("button", { name: /Hitung Total/i });
        let total: number | null = null;
        if (await counter.count()) {
          await counter.click({ timeout: 10_000 }).catch(() => undefined);
          // Selama menghitung SRIKANDI menampilkan "Mohon Tunggu" dan menonaktifkan tombol halaman
          await page
            .waitForFunction(
              () =>
                !/Mohon Tunggu/i.test(
                  (document.querySelector("nav[aria-label='Table navigation']") as HTMLElement | null)?.innerText ?? "",
                ),
              undefined,
              { timeout: 45_000 },
            )
            .catch(() => undefined);
          total = parseTotal(await nav.innerText().catch(() => ""));
        }
        const navHtml = (await nav.innerHTML().catch(() => "")).replace(/\s+/g, " ").slice(0, 1500);
        const collected: ReferenceItem[][] = [];
        let pages = 0;
        let unique = 0;
        let idle = 0;
        for (; pages < maxReferencePages(ref.category); pages++) {
          const table = await page.evaluate(() => {
            const el = document.querySelector("table");
            if (!el) return null;
            const headers = [...el.querySelectorAll("thead th, tr:first-child th")].map(
              (th) => (th as HTMLElement).innerText,
            );
            const rows = [...el.querySelectorAll("tbody tr")].map((tr) =>
              [...(tr as HTMLTableRowElement).cells].map((c) => (c as HTMLElement).innerText),
            );
            return {
              headers: [...new Set(headers)],
              rows,
              signature: (el.querySelector("tbody") as HTMLElement)?.innerText ?? "",
            };
          });
          if (!table) break;
          collected.push(parseReferenceRows(ref.category, table.headers, table.rows));
          // Berhenti bila semua data sudah terbaca (sesuai Hitung Total) atau 2 halaman berturut-turut tidak menambah data
          const now = mergeReferenceItems(collected).length;
          idle = now > unique ? 0 : idle + 1;
          unique = now;
          if ((total !== null && unique >= total) || idle >= 2) break;
          // Tombol halaman berikutnya = tombol terakhir di navigasi tabel selain "Hitung Total"
          const next = page
            .locator("nav[aria-label='Table navigation'] button")
            .filter({ hasNotText: /Hitung Total/i })
            .last();
          if (!(await next.count())) break;
          // Tombol halaman dinonaktifkan sementara saat memuat → tunggu aktif (tetap nonaktif = halaman terakhir)
          let enabled = false;
          for (let i = 0; i < 30 && !enabled; i++) {
            enabled = !(await next.isDisabled().catch(() => true));
            if (!enabled) await page.waitForTimeout(500);
          }
          if (!enabled) break;
          await next.click({ timeout: 10_000 }).catch(() => undefined);
          // Tunggu isi tabel berganti dan selesai dimuat (bukan baris "memuat")
          const changed = await page
            .waitForFunction(
              (old) => {
                const text = (document.querySelector("table tbody") as HTMLElement | null)?.innerText ?? "";
                return (
                  text !== old &&
                  !/memuat|loading/i.test(text) &&
                  document.querySelectorAll("table tbody tr").length > 1
                );
              },
              table.signature,
              { timeout: 15_000 },
            )
            .then(() => true)
            .catch(() => false);
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
          if (!changed) break;
          if (total !== null && mergeReferenceItems(collected).length >= total) break;
        }
        // Halaman terakhir yang baru dimuat ikut dibaca
        const last = await page.evaluate(() => {
          const el = document.querySelector("table");
          if (!el) return null;
          const headers = [...el.querySelectorAll("thead th, tr:first-child th")].map(
            (th) => (th as HTMLElement).innerText,
          );
          const rows = [...el.querySelectorAll("tbody tr")].map((tr) =>
            [...(tr as HTMLTableRowElement).cells].map((c) => (c as HTMLElement).innerText),
          );
          return { headers: [...new Set(headers)], rows };
        });
        if (last) collected.push(parseReferenceRows(ref.category, last.headers, last.rows));
        result.push({
          category: ref.category,
          items: mergeReferenceItems(collected),
          pages: collected.length,
          total,
          nav: navHtml,
        });
      }
      return { ...info, references: result };
    });
  }

  private async record(page: Page, markers: string[]) {
    const info = await this.describe(page, markers);
    const screenshot = (await page.screenshot({ type: "jpeg", quality: 70, fullPage: true })).toString("base64");
    const aria = clampText(
      await page
        .locator("body")
        .ariaSnapshot()
        .catch(() => ""),
    );
    return { ...info, screenshot, aria };
  }

  private async withPage<T>(
    target: Target,
    run: (page: Page, hosts: string[], markers: string[]) => Promise<T>,
    options: { downloads?: boolean } = {},
  ) {
    const { context, hosts, markers } = await this.newContext(target, options);
    try {
      const page = await context.newPage();
      const result = await run(page, hosts, markers);
      return { ...result, storageState: await context.storageState({ indexedDB: true }) };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- Login otomatis (kredensial dari brankas LifeOS)

  /**
   * Pindai formulir yang terlihat: setiap input/tombol diberi penanda `data-lifeos-*` lalu dikenali oleh logika murni
   * (`classifyFields`, `pickSubmit`). Pesan galat situs (alert/SweetAlert/toast) ikut dibaca.
   */
  private async scan(page: Page) {
    const data = await page.evaluate(() => {
      const visible = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
      const inputs = Array.from(document.querySelectorAll("input")).filter(visible);
      const fields = inputs.map((el, index) => {
        el.setAttribute("data-lifeos-field", String(index));
        const labels = el.labels ? Array.from(el.labels).map((l) => l.textContent) : [];
        const text = clean(
          [...labels, el.placeholder, el.name, el.id, el.getAttribute("aria-label"), el.autocomplete].join(" "),
        ).toLowerCase();
        return {
          index,
          type: (el.type || "text").toLowerCase(),
          text,
          maxLength: el.maxLength > 0 ? el.maxLength : null,
          inputMode: el.inputMode || "",
        };
      });
      const buttonEls = Array.from(
        document.querySelectorAll("button, input[type=submit], input[type=button], [role=button]"),
      ).filter(visible);
      const buttons = buttonEls.map((el, index) => {
        el.setAttribute("data-lifeos-button", String(index));
        return {
          index,
          text: clean((el as HTMLInputElement).value || el.textContent || el.getAttribute("aria-label")),
        };
      });
      const messages = Array.from(
        document.querySelectorAll(
          "[role=alert], .alert, .swal2-html-container, .swal2-title, .toast, .invalid-feedback, .text-danger, .error-message",
        ),
      )
        .filter(visible)
        .map((el) => clean(el.textContent))
        .filter(Boolean)
        .slice(0, 3);
      return { fields, buttons, messages };
    });
    return {
      fields: classifyFields(data.fields),
      submit: pickSubmit(data.buttons),
      message: data.messages.join(" · ").slice(0, 300) || undefined,
    };
  }

  /** Gambar CAPTCHA: elemen img/canvas bertanda captcha, atau yang terdekat di atas kolom CAPTCHA (cadangan: area di atasnya). */
  private async captchaImage(page: Page, captchaIndex: number) {
    const clip = await page.evaluate((index) => {
      const input = document.querySelector(`[data-lifeos-field="${index}"]`);
      if (!input) return null;
      const box = input.getBoundingClientRect();
      const candidates = Array.from(document.querySelectorAll("img, canvas, svg"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 20 && r.height > 12 && r.width < 500 && r.height < 200);
      const marked = candidates.find(({ el }) =>
        /captcha/i.test([el.getAttribute("src"), el.id, el.getAttribute("class"), el.getAttribute("alt")].join(" ")),
      );
      const near = candidates
        .filter(({ r }) => r.bottom <= box.top + 4 && box.top - r.bottom < 160)
        .sort((a, b) => box.top - a.r.bottom - (box.top - b.r.bottom))[0];
      const pick = (marked ?? near)?.r;
      const r = pick ?? { left: box.left - 10, top: box.top - 90, width: box.width + 20, height: 86 };
      return {
        x: Math.max(0, r.left - 6 + window.scrollX),
        y: Math.max(0, r.top - 6 + window.scrollY),
        width: r.width + 12,
        height: r.height + 12,
      };
    }, captchaIndex);
    if (!clip) return undefined;
    const image = await page.screenshot({ type: "png", clip, fullPage: true }).catch(() => undefined);
    return image?.toString("base64");
  }

  private async fill(page: Page, index: number | undefined, value: string) {
    if (index === undefined) return;
    await page.locator(`[data-lifeos-field="${index}"]`).fill(value);
  }

  private async submit(page: Page, submit: number | null, lastField: number | undefined) {
    if (submit !== null) await page.locator(`[data-lifeos-button="${submit}"]`).click();
    else if (lastField !== undefined) await page.locator(`[data-lifeos-field="${lastField}"]`).press("Enter");
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);
  }

  /** Keadaan login saat ini + gambar CAPTCHA bila diminta. */
  /**
   * Tutup modal informasi yang menghalangi setelah login (mis. "Login berhasil" + OK). Modal keputusan (kirim, hapus,
   * setujui, tanda tangan) tidak disentuh — lihat `infoDialogButton`.
   */
  private async dismissInfoDialog(page: Page) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const dialogs = await page
        .evaluate(() => {
          const visible = (el: Element) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const st = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
          };
          const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();
          const boxes = Array.from(
            document.querySelectorAll(
              ".swal2-popup, .swal-modal, [role=dialog], [role=alertdialog], .modal.show, .modal.in, .bootbox",
            ),
          ).filter(visible);
          return boxes.map((box, d) => ({
            text: clean(box.textContent).slice(0, 400),
            buttons: Array.from(box.querySelectorAll("button, a.btn, input[type=button], input[type=submit]"))
              .filter(visible)
              .map((el, index) => {
                el.setAttribute("data-lifeos-modal-button", `${d}-${index}`);
                return { index, text: clean((el as HTMLInputElement).value || el.textContent) };
              }),
          }));
        })
        .catch(() => []);
      const target = dialogs
        .map((dlg, d) => ({ d, button: infoDialogButton(dlg.text, dlg.buttons) }))
        .find((x) => x.button !== null);
      if (!target) return;
      await page
        .locator(`[data-lifeos-modal-button="${target.d}-${target.button}"]`)
        .click({ timeout: 3_000 })
        .catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
      await page.waitForTimeout(600);
    }
  }

  private async loginState(page: Page, markers: string[]) {
    await this.dismissInfoDialog(page);
    const info = await this.describe(page, markers);
    const form = await this.scan(page);
    const stage = loginStage(info.loggedIn, form.fields);
    const captchaImage =
      stage === "captcha" && form.fields.captcha !== undefined
        ? await this.captchaImage(page, form.fields.captcha)
        : undefined;
    return { ...info, stage, message: form.message, captchaImage };
  }

  /**
   * Isi nama pengguna & kata sandi. Bila ada CAPTCHA, berhenti dan kembalikan gambarnya untuk diketik pengguna; bila tidak,
   * langsung kirim formulir. Kredensial tidak pernah dicatat atau disimpan di robot.
   */
  async autofill(id: string, credentials: { username: string; password: string }) {
    const { page, markers } = this.live(id);
    const info = await this.describe(page, markers);
    if (info.loggedIn) return { ...info, stage: "done" as const };
    const form = await this.scan(page);
    if (form.fields.password === undefined) return this.loginState(page, markers);
    await this.fill(page, form.fields.username, credentials.username);
    await this.fill(page, form.fields.password, credentials.password);
    if (form.fields.captcha === undefined) await this.submit(page, form.submit, form.fields.password);
    return this.loginState(page, markers);
  }

  /** Jawaban pengguna (CAPTCHA / OTP) diisikan lalu formulir dikirim; kata sandi diisi ulang bila dikosongkan situs. */
  async answer(
    id: string,
    kind: "captcha" | "otp",
    value: string,
    credentials?: { username: string; password: string },
  ) {
    const { page, markers } = this.live(id);
    const form = await this.scan(page);
    if (kind === "captcha") {
      if (form.fields.captcha === undefined) return this.loginState(page, markers);
      if (credentials && form.fields.password !== undefined) {
        const current = await page.locator(`[data-lifeos-field="${form.fields.password}"]`).inputValue();
        if (!current) {
          await this.fill(page, form.fields.username, credentials.username);
          await this.fill(page, form.fields.password, credentials.password);
        }
      }
      await this.fill(page, form.fields.captcha, value);
      await this.submit(page, form.submit, form.fields.captcha);
    } else {
      if (!form.fields.otp.length) return this.loginState(page, markers);
      if (form.fields.otp.length > 1) {
        await page.locator(`[data-lifeos-field="${form.fields.otp[0]}"]`).click();
        await page.keyboard.type(value, { delay: 60 });
      } else {
        await this.fill(page, form.fields.otp[0], value);
      }
      await this.submit(page, form.submit, form.fields.otp.at(-1));
    }
    return this.loginState(page, markers);
  }

  async close() {
    for (const id of [...this.sessions.keys()]) await this.closeSession(id);
    if (this.browser) await (await this.browser).close().catch(() => undefined);
  }
}

export class NotFound extends Error {}
