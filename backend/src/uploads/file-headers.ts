/** Tipe yang bisa menjalankan script bila dibuka inline → selalu diunduh sebagai lampiran. */
const ACTIVE_CONTENT = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "text/javascript",
  "application/javascript",
]);
export const isActiveContent = (mimeType: string) => ACTIVE_CONTENT.has(mimeType.split(";")[0].trim().toLowerCase());

/**
 * Header aman untuk menyajikan berkas user dari origin aplikasi: CSP sandbox mencegah
 * berkas berbahaya menjalankan script/akses sesi (XSS), konten aktif dipaksa attachment.
 */
export const fileHeaders = (asset: { originalName: string; mimeType: string }) => ({
  "Content-Disposition": `${isActiveContent(asset.mimeType) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
  "Content-Security-Policy":
    "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
  "Cache-Control": "private, no-store",
});
