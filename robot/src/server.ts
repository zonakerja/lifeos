import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { BrowserPool, NotFound } from "./browser.js";
import { authorized, parseInput } from "./logic.js";
import { validRows } from "./ekinerja-renaksi.js";
import { validAnswer, validCredentials } from "./login-form.js";
import { parseRegisterForm } from "./srikandi-register.js";
import { requestedCategories } from "./srikandi-reference.js";

/**
 * Service robot LifeOS (tahap 6 docs/AI-AGENT.md §21): API internal yang hanya dipanggil backend (token
 * `ROBOT_TOKEN`), tidak pernah dibuka ke internet. Tidak menyimpan kata sandi, kode OTP, atau sesi — semuanya lewat
 * backend; pengguna mengetik sendiri di tayangan "browser jarak jauh".
 */
const PORT = Number(process.env.PORT ?? 4100);
const TOKEN = process.env.ROBOT_TOKEN ?? "";
const MAX_BODY = 10 * 1024 * 1024;
// Registrasi naskah membawa berkas (naskah ≤ 5 MB + lampiran ≤ 20 MB) dalam base64
const MAX_REGISTER_BODY = 40 * 1024 * 1024;

if (TOKEN.length < 32) {
  console.error("ROBOT_TOKEN wajib diisi (minimal 32 karakter).");
  process.exit(1);
}

const pool = new BrowserPool();

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(req: IncomingMessage, maxBody = MAX_BODY): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBody) throw new HttpError(413, "Isi permintaan terlalu besar.");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "JSON tidak valid.");
  }
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Target konektor dari isi permintaan backend. */
function target(body: Record<string, unknown>) {
  const baseUrl = str(body.baseUrl);
  if (!baseUrl) throw new HttpError(400, "baseUrl wajib.");
  return {
    baseUrl,
    extraHosts: strings(body.extraHosts),
    loginMarkers: strings(body.loginMarkers),
    storageState: (body.storageState as never) ?? null,
  };
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://robot");
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, sessions: pool.size });
  if (!authorized(req.headers.authorization, TOKEN)) throw new HttpError(401, "Token robot salah.");

  // /sessions
  if (parts[0] === "sessions") {
    if (req.method === "POST" && parts.length === 1) {
      const body = await readJson(req);
      return json(res, 201, await pool.startSession({ ...target(body), startUrl: str(body.startUrl) }));
    }
    const id = parts[1];
    if (!id) throw new HttpError(404, "Tidak ditemukan.");
    if (req.method === "GET" && parts[2] === "frame") {
      const { image, url: pageUrl, title, loggedIn } = await pool.frame(id);
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "X-Robot-Url": encodeURIComponent(pageUrl),
        "X-Robot-Title": encodeURIComponent(title),
        "X-Robot-Logged-In": String(loggedIn),
      });
      return res.end(image);
    }
    if (req.method === "POST" && parts[2] === "input") {
      const event = parseInput(await readJson(req));
      if (!event) throw new HttpError(400, "Masukan tidak dikenal.");
      return json(res, 200, await pool.input(id, event));
    }
    if (req.method === "POST" && parts[2] === "autofill") {
      const body = await readJson(req);
      if (!validCredentials(body)) throw new HttpError(400, "Kredensial tidak valid.");
      return json(res, 200, await pool.autofill(id, { username: body.username, password: body.password }));
    }
    if (req.method === "POST" && parts[2] === "answer") {
      const body = await readJson(req);
      const kind = body.kind === "otp" ? "otp" : body.kind === "captcha" ? "captcha" : null;
      if (!kind || !validAnswer(kind, body.value)) throw new HttpError(400, "Jawaban tidak valid.");
      const credentials = validCredentials(body.credentials) ? body.credentials : undefined;
      return json(res, 200, await pool.answer(id, kind, body.value, credentials));
    }
    if (req.method === "POST" && parts[2] === "capture") return json(res, 200, await pool.captureSession(id));
    if (req.method === "POST" && parts[2] === "finish") return json(res, 200, await pool.finishSession(id));
    if (req.method === "DELETE" && parts.length === 2) {
      await pool.closeSession(id);
      return json(res, 200, { closed: true });
    }
  }
  if (req.method === "POST" && url.pathname === "/check") {
    const body = await readJson(req);
    return json(res, 200, await pool.check({ ...target(body), homeUrl: str(body.homeUrl) }));
  }
  if (req.method === "POST" && url.pathname === "/capture") {
    const body = await readJson(req);
    const pageUrl = str(body.url);
    if (!pageUrl) throw new HttpError(400, "url wajib.");
    return json(res, 200, await pool.capture({ ...target(body), url: pageUrl }));
  }
  if (req.method === "POST" && url.pathname === "/jobs/ekinerja/skp") {
    const body = await readJson(req);
    const year = typeof body.year === "number" && body.year >= 2000 && body.year <= 2100 ? body.year : undefined;
    return json(res, 200, await pool.ekinerjaSkp({ ...target(body), year }));
  }
  if (req.method === "POST" && url.pathname === "/jobs/ekinerja/renaksi") {
    const body = await readJson(req);
    const skpExternalId = str(body.skpExternalId);
    const period = str(body.period);
    const rows = validRows(body.rows);
    if (!skpExternalId || !/^\d+$/.test(skpExternalId) || !period || !rows) {
      throw new HttpError(400, "Masukan rencana aksi tidak valid.");
    }
    return json(
      res,
      200,
      await pool.ekinerjaRenaksi({
        ...target(body),
        skpExternalId,
        period,
        rows,
        dryRun: body.dryRun === true,
        mode: body.mode === "sync" ? "sync" : "add",
      }),
    );
  }
  if (req.method === "POST" && url.pathname === "/jobs/ekinerja/renaksi/read") {
    const body = await readJson(req);
    const skpExternalId = str(body.skpExternalId);
    if (!skpExternalId || !/^\d+$/.test(skpExternalId)) throw new HttpError(400, "Nomor SKP tidak valid.");
    return json(res, 200, await pool.ekinerjaRenaksiRead({ ...target(body), skpExternalId }));
  }
  if (req.method === "POST" && url.pathname === "/jobs/srikandi/outgoing") {
    const body = await readJson(req);
    const maxFetch = typeof body.maxFetch === "number" ? Math.min(Math.max(body.maxFetch, 0), 10) : undefined;
    return json(
      res,
      200,
      await pool.srikandiOutgoing({
        ...target(body),
        known: strings(body.known),
        haveMain: strings(body.haveMain),
        maxFetch,
      }),
    );
  }
  if (req.method === "POST" && url.pathname === "/jobs/srikandi/register") {
    const body = await readJson(req, MAX_REGISTER_BODY);
    const parsed = parseRegisterForm(body.form);
    if ("error" in parsed) throw new HttpError(400, parsed.error);
    return json(
      res,
      200,
      await pool.srikandiRegister({ ...target(body), form: parsed.form, dryRun: body.dryRun === true }),
    );
  }
  if (req.method === "POST" && url.pathname === "/jobs/srikandi/references") {
    const body = await readJson(req);
    return json(
      res,
      200,
      await pool.srikandiReferences({ ...target(body), categories: requestedCategories(body.categories) }),
    );
  }
  throw new HttpError(404, "Tidak ditemukan.");
}

const server = createServer((req, res) => {
  route(req, res).catch((error: unknown) => {
    const status = error instanceof HttpError ? error.status : error instanceof NotFound ? 404 : 500;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 500) console.error(`[robot] ${req.method} ${req.url}: ${message}`);
    if (!res.headersSent) json(res, status, { message });
    else res.end();
  });
});

server.listen(PORT, () => console.log(`[robot] siap di port ${PORT}`));

const shutdown = async () => {
  server.close();
  await pool.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
