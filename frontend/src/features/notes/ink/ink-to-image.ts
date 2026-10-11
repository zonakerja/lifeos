import { cachedStrokePath, INK_WIDTH, type InkData, PAGE_HEIGHT, strokeBounds } from "./ink-logic";

/** Batas halaman yang dikirim ke AI dalam satu kali pengenalan. */
export const MAX_RECOGNITION_PAGES = 10;

/**
 * Potongan halaman (dalam satuan logis) yang berisi goresan. Halaman kosong dilewati agar tidak membuang kuota AI.
 * Untuk blok pendek seluruh tinggi dipakai sebagai satu potongan.
 */
export const inkPageSlices = (ink: InkData): { top: number; bottom: number }[] => {
  const slices: { top: number; bottom: number }[] = [];
  for (let top = 0; top < ink.height; top += PAGE_HEIGHT) {
    const bottom = Math.min(top + PAGE_HEIGHT, ink.height);
    const used = ink.strokes.some((s) => {
      const b = strokeBounds(s.points);
      return b.maxY >= top && b.minY < bottom;
    });
    if (used) slices.push({ top, bottom });
  }
  return slices.slice(0, MAX_RECOGNITION_PAGES);
};

/**
 * Gambar PNG per halaman untuk dibaca AI: latar putih, tinta hitam (warna & kertas diabaikan agar mudah dibaca,
 * stabilo abu-abu muda). Warna tetap di sini sengaja tidak memakai token tema karena hasilnya berupa berkas gambar.
 */
export async function inkToPngPages(ink: InkData): Promise<Blob[]> {
  const pens = ink.strokes.filter((s) => s.tool === "pen").map((s) => `<path d="${cachedStrokePath(s)}"/>`);
  const highlights = ink.strokes
    .filter((s) => s.tool === "highlighter")
    .map((s) => `<path d="${cachedStrokePath(s)}"/>`);

  const pages: Blob[] = [];
  for (const { top, bottom } of inkPageSlices(ink)) {
    const height = bottom - top;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${INK_WIDTH}" height="${height}" viewBox="0 ${top} ${INK_WIDTH} ${height}"><rect x="0" y="${top}" width="${INK_WIDTH}" height="${height}" fill="#ffffff"/><g fill="#d9d9d9">${highlights.join("")}</g><g fill="#111111">${pens.join("")}</g></svg>`;
    pages.push(await svgToPng(svg, INK_WIDTH, height));
  }
  return pages;
}

async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gagal membuat gambar."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
