/**
 * Link yang diketik user → href eksternal yang aman, atau null bila bukan http/https.
 * Tanpa skema dianggap https ("zoom.us/j/1" → "https://zoom.us/j/1"; tanpa ini browser
 * memperlakukannya sebagai path relatif di dalam aplikasi).
 */
export const toExternalHref = (value?: string | null) => {
  const raw = value?.trim();
  if (!raw) return null;
  // Punya skema ("https:", "mailto:", "javascript:") — kecuali pola host:port seperti "meet.local:8080/x"
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(raw) && !/^[^:/]+:\d/.test(raw);
  const withScheme = hasScheme ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};
