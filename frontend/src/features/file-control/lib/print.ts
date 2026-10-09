/**
 * Cetak sebuah elemen di jendela baru. Stylesheet aplikasi (Tailwind) ikut disalin
 * sehingga dokumen A4 tampil sama dengan pratinjaunya; label memakai inline style.
 */
export function printElement(element: HTMLElement | null, title: string, layout: "label" | "a4" = "label") {
  if (!element) return;
  const win = window.open("", "_blank", layout === "label" ? "height=500,width=500" : "height=900,width=800");
  if (!win) return;

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join("\n");
  const pageCss =
    layout === "label"
      ? "body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff;font-family:sans-serif}"
      : "@page{size:A4;margin:0}body{margin:0;background:#fff;color:#000}.print-sheet{box-shadow:none!important;margin:0 auto!important}";

  win.document.open();
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${styles}<style>${pageCss}</style></head><body>${element.outerHTML}</body></html>`,
  );
  win.document.close();
  // Beri waktu stylesheet & SVG dirender sebelum dialog print muncul
  setTimeout(() => {
    win.focus();
    win.print();
  }, 500);
}
