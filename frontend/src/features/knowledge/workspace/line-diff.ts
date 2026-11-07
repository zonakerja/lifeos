/**
 * Perbandingan baris dua isi catatan (riwayat versi K7): LCS sederhana → baris sama / ditambah / dihapus, baris sama yang
 * panjang diringkas. Logika murni.
 */

export type DiffLine = { type: "same" | "add" | "del"; text: string } | { type: "skip"; count: number };

/** Batas sel tabel LCS (baris lama × baris baru) agar browser tidak berat untuk catatan sangat panjang. */
const MAX_CELLS = 4_000_000;

export function lineDiff(before: string, after: string, context = 3): DiffLine[] | null {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  // buang awal & akhir yang sama agar tabel LCS kecil
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > MAX_CELLS) return null;

  const n = midA.length;
  const m = midB.length;
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const raw: { type: "same" | "add" | "del"; text: string }[] = a
    .slice(0, start)
    .map((text) => ({ type: "same", text }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      raw.push({ type: "same", text: midA[i++] });
      j++;
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) raw.push({ type: "add", text: midB[j++] });
    else raw.push({ type: "del", text: midA[i++] });
  }
  for (const text of a.slice(endA)) raw.push({ type: "same", text });

  // ringkas baris sama yang jauh dari perubahan
  const keep = raw.map((line, idx) => {
    if (line.type !== "same") return true;
    for (let k = Math.max(0, idx - context); k <= Math.min(raw.length - 1, idx + context); k++) {
      if (raw[k].type !== "same") return true;
    }
    return false;
  });
  const result: DiffLine[] = [];
  raw.forEach((line, idx) => {
    if (keep[idx]) result.push(line);
    else {
      const last = result[result.length - 1];
      if (last?.type === "skip") last.count++;
      else result.push({ type: "skip", count: 1 });
    }
  });
  return result;
}

/** Jumlah baris ditambah & dihapus. */
export const diffStats = (lines: DiffLine[]) => ({
  added: lines.filter((l) => l.type === "add").length,
  removed: lines.filter((l) => l.type === "del").length,
});
