import type { CookieOptions, Request, Response } from "express";

/**
 * Refresh token disimpan di cookie httpOnly (tidak terbaca JavaScript → aman dari XSS),
 * SameSite=Strict (tidak terkirim dari situs lain → aman dari CSRF), dan hanya dikirim ke
 * endpoint /api/v1/auth. Access token tetap dikirim lewat header Authorization dan
 * hanya disimpan di memori frontend.
 */
export const REFRESH_COOKIE = "lifeos_rt";
const COOKIE_PATH = "/api/v1/auth";

const baseOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: "strict",
  path: COOKIE_PATH,
});

export function setRefreshCookie(res: Response, token: string, maxAgeSeconds: number, secure: boolean) {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(secure), maxAge: maxAgeSeconds * 1000 });
}

export function clearRefreshCookie(res: Response, secure: boolean) {
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

/** Baca cookie refresh tanpa dependensi cookie-parser. */
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === REFRESH_COOKIE) {
      const value = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(value) || undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
