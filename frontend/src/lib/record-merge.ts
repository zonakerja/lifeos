import type { RecordType } from "@/types/api";

type Payload = Record<string, unknown>;

/**
 * Salinan `backend/src/records/record-merge.ts` (logika sama, ubah keduanya bersamaan) — dipakai client untuk
 * memasang hasil gabungan server ke cache tanpa menimpa perubahan lokal yang lebih baru.
 *
 * Penggabungan tulis untuk record yang sering diubah bersamaan (List Bebas bersama, atau satu list di dua tab).
 * Client mengirim `base` (isi item sebelum perubahannya) + payload baru; server menerapkan **selisih base → payload**
 * di atas isi record terkini. Perubahan orang lain yang tidak disentuh client tetap ada (tidak tertimpa).
 *
 * Field biasa: dipakai nilai client bila client mengubahnya, selain itu nilai terkini.
 * Field array berkunci `id` (`MERGE_ARRAY_KEYS`): digabung per elemen — tambah, ubah, hapus, dan urutan client
 * diterapkan; elemen yang ditambahkan orang lain tetap ada.
 */
export const MERGE_ARRAY_KEYS: Partial<Record<RecordType, readonly string[]>> = {
  list: ["items"],
};

type Keyed = { id?: unknown } & Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const idOf = (item: unknown) => String((item as Keyed)?.id);
const asArray = (value: unknown): Keyed[] => (Array.isArray(value) ? (value as Keyed[]) : []);

/** Gabungkan perubahan client (base → incoming) ke array terkini (current), per elemen ber-`id`. */
export function mergeKeyedArray(current: unknown, base: unknown, incoming: unknown): Keyed[] {
  const cur = asArray(current);
  const baseArr = asArray(base);
  const inc = asArray(incoming);
  const baseById = new Map(baseArr.map((i) => [idOf(i), i]));
  const incById = new Map(inc.map((i) => [idOf(i), i]));
  const curById = new Map(cur.map((i) => [idOf(i), i]));

  const removedByClient = new Set([...baseById.keys()].filter((id) => !incById.has(id)));
  const addedByClient = inc.filter((i) => !baseById.has(idOf(i)));
  // Elemen yang diubah client menggantikan versi terkini; elemen yang sudah dihapus orang lain tetap terhapus
  const resolve = (id: string): Keyed | undefined => {
    const now = curById.get(id);
    if (!now) return undefined;
    const mine = incById.get(id);
    const was = baseById.get(id);
    return mine && was && !same(mine, was) ? mine : now;
  };

  // Client mengubah urutan elemen yang sama-sama dikenalnya → urutan client dipakai
  const common = (arr: Keyed[]) => arr.map(idOf).filter((id) => baseById.has(id) && incById.has(id));
  const reordered = !same(common(baseArr), common(inc));

  const result: Keyed[] = [];
  const placed = new Set<string>();
  const push = (item: Keyed | undefined) => {
    if (!item || placed.has(idOf(item))) return;
    placed.add(idOf(item));
    result.push(item);
  };

  if (reordered) {
    for (const item of inc) push(baseById.has(idOf(item)) ? resolve(idOf(item)) : item);
    for (const item of cur) if (!removedByClient.has(idOf(item))) push(item);
  } else {
    for (const item of cur) if (!removedByClient.has(idOf(item))) push(resolve(idOf(item)));
    for (const item of addedByClient) push(item);
  }
  return result;
}

/** Selisih base → incoming diterapkan ke current. Tanpa current (record baru/terhapus) → incoming apa adanya. */
export function mergePayload(
  current: Payload | undefined,
  base: Payload,
  incoming: Payload,
  arrayKeys: readonly string[],
): Payload {
  if (!current) return incoming;
  const merged: Payload = { ...current };
  for (const key of new Set([...Object.keys(base), ...Object.keys(incoming)])) {
    if (arrayKeys.includes(key)) continue;
    if (!same(base[key], incoming[key])) {
      if (incoming[key] === undefined) delete merged[key];
      else merged[key] = incoming[key];
    }
  }
  for (const key of arrayKeys) merged[key] = mergeKeyedArray(current[key], base[key], incoming[key]);
  return merged;
}
