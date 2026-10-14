import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { extractDocumentText } from "../extraction/text-extractors";

/**
 * Mengambil halaman web untuk sumber notebook dengan aman (server-side request):
 * - hanya http/https, tanpa kredensial di URL;
 * - alamat IP tujuan diperiksa **saat koneksi** (lookup kustom, tahan DNS rebinding) — jaringan lokal/privat,
 *   loopback, link-local (termasuk metadata cloud 169.254.169.254) ditolak, juga pada setiap redirect;
 * - batas waktu, ukuran, dan jumlah redirect; hanya HTML, teks, dan PDF yang dibaca.
 */

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 4;
export const MAX_WEB_TEXT_CHARS = 500_000;

export class WebSourceError extends Error {}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
  ["64:ff9b::", 96],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** Alamat yang tidak boleh dihubungi server (jaringan internal, loopback, link-local, dsb.). */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return isBlockedAddress(mapped[1]);
    return blocked.check(address, "ipv6");
  }
  return blocked.check(address, "ipv4");
}

/** URL yang boleh diambil; melempar WebSourceError dengan pesan untuk user bila tidak. */
export function parseWebUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new WebSourceError("Alamat web tidak valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebSourceError("Hanya alamat http/https yang didukung.");
  }
  if (url.username || url.password) throw new WebSourceError("Alamat web tidak boleh berisi nama pengguna/sandi.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new WebSourceError("Alamat jaringan lokal tidak diizinkan.");
  }
  if (isIP(host) && isBlockedAddress(host)) throw new WebSourceError("Alamat jaringan lokal tidak diizinkan.");
  url.hash = "";
  return url;
}

/** Lookup DNS yang menolak alamat terlarang — dipakai Node saat membuka koneksi. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as unknown as LookupAddress[];
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (!list.length || bad) {
      return callback(new WebSourceError("Alamat jaringan lokal tidak diizinkan."), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

interface RawResponse {
  url: URL;
  contentType: string;
  body: Buffer;
}

function request(url: URL): Promise<IncomingMessage> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "LifeOS-Notebook/1.0 (+https://github.com/zonakerja/lifeos)",
          Accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.5",
          "Accept-Language": "id,en;q=0.8",
        },
      },
      resolve,
    );
    req.on("timeout", () => req.destroy(new WebSourceError("Halaman web terlalu lama merespons.")));
    req.on("error", reject);
  });
}

async function fetchRaw(start: URL): Promise<RawResponse> {
  let url = start;
  for (let redirects = 0; ; redirects++) {
    const res = await request(url);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (redirects >= MAX_REDIRECTS) throw new WebSourceError("Terlalu banyak pengalihan (redirect).");
      url = parseWebUrl(new URL(res.headers.location, url).toString());
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      throw new WebSourceError(`Halaman web tidak dapat diambil (status ${status}).`);
    }
    const length = Number(res.headers["content-length"] ?? 0);
    if (length > MAX_BYTES) {
      res.resume();
      throw new WebSourceError("Halaman web lebih dari 5 MB.");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        res.destroy();
        throw new WebSourceError("Halaman web lebih dari 5 MB.");
      }
      chunks.push(chunk);
    }
    return { url, contentType: String(res.headers["content-type"] ?? "").toLowerCase(), body: Buffer.concat(chunks) };
  }
}

const normalizeText = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Judul & teks utama halaman HTML (Readability; cadangan: seluruh teks body tanpa skrip/gaya/navigasi). */
export function htmlToText(html: string, url: string): { title: string; text: string } {
  const { document } = parseHTML(html);
  const fallbackTitle = document.querySelector("title")?.textContent?.trim() ?? "";
  try {
    const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      return { title: article.title?.trim() || fallbackTitle || url, text: normalizeText(article.textContent) };
    }
  } catch {
    // Halaman tidak bisa diurai Readability → pakai teks body
  }
  const { document: doc } = parseHTML(html);
  for (const el of doc.querySelectorAll("script, style, noscript, nav, footer, header, svg, iframe")) el.remove();
  return { title: fallbackTitle || url, text: normalizeText(doc.body?.textContent ?? "") };
}

/** Ambil halaman web → judul + teks (HTML, teks polos, atau PDF berlapis teks). */
export async function fetchWebSource(raw: string): Promise<{ url: string; title: string; text: string }> {
  const start = parseWebUrl(raw);
  let res: RawResponse;
  try {
    res = await fetchRaw(start);
  } catch (error) {
    if (error instanceof WebSourceError) throw error;
    throw new WebSourceError("Halaman web tidak dapat dihubungi.");
  }
  const url = res.url.toString();
  let result: { title: string; text: string };
  if (res.contentType.includes("application/pdf")) {
    const outcome = await extractDocumentText(res.body, "application/pdf");
    if (!outcome || outcome === "ocr")
      throw new WebSourceError("PDF ini berupa hasil scan (tanpa teks) — unggah sebagai berkas.");
    result = { title: decodeURIComponent(res.url.pathname.split("/").pop() || url), text: normalizeText(outcome.text) };
  } else if (res.contentType.includes("text/plain")) {
    result = { title: url, text: normalizeText(res.body.toString("utf8")) };
  } else if (res.contentType.includes("html") || !res.contentType) {
    result = htmlToText(res.body.toString("utf8"), url);
  } else {
    throw new WebSourceError("Jenis halaman tidak didukung (hanya HTML, teks, atau PDF).");
  }
  if (result.text.length < 50) throw new WebSourceError("Halaman web tidak berisi teks yang bisa dibaca.");
  return { url, title: result.title.slice(0, 300), text: result.text.slice(0, MAX_WEB_TEXT_CHARS) };
}
