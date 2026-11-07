import type { KnowledgeNoteListItem } from "@/types/api";

/**
 * Mesin Bases (K2, docs/AI-AGENT.md §25.6): subset sintaks Bases Obsidian yang dievaluasi di browser atas daftar catatan.
 * Ekspresi: literal, properti (`status`, `note.status`, `note["nama prop"]`, `file.*`, `formula.*`), `! && ||`,
 * `== != > < >= <=`, `+ - * / %` (tanggal ± durasi "7d"), fungsi `today() now() date() number() if() list()`, metode
 * `contains containsAny containsAll startsWith endsWith isEmpty lower upper toString` + `length`, dan `file.hasTag()
 * file.inFolder() file.hasProperty()`. Logika murni.
 */

export type BaseValue = string | number | boolean | Date | BaseValue[] | null;
export type BaseFilter = string | { and?: BaseFilter[]; or?: BaseFilter[]; not?: BaseFilter[] };

export interface BaseView {
  type?: string;
  name?: string;
  filters?: BaseFilter;
  order?: string[];
  sort?: { property: string; direction?: string }[];
  groupBy?: { property: string; direction?: string };
  limit?: number;
  /** Ringkasan per kolom (id properti → nama ringkasan Obsidian, mis. "Average") */
  summaries?: Record<string, string>;
  [key: string]: unknown;
}

export interface BaseData {
  filters?: BaseFilter;
  formulas?: Record<string, string>;
  properties?: Record<string, { displayName?: string } | undefined>;
  views?: BaseView[];
  [key: string]: unknown;
}

export class BaseExpressionError extends Error {}

// ---------------------------------------------------------------- tokenizer & parser

type Token = { t: "num"; v: number } | { t: "str"; v: string } | { t: "id"; v: string } | { t: "op"; v: string };

const OPS = ["==", "!=", ">=", "<=", "&&", "||", ">", "<", "!", "+", "-", "*", "/", "%", "(", ")", "[", "]", ",", "."];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        value += src[j++];
      }
      if (j >= src.length) throw new BaseExpressionError("Tanda kutip tidak ditutup");
      tokens.push({ t: "str", v: value });
      i = j + 1;
      continue;
    }
    const num = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num) {
      tokens.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(src.slice(i));
    if (id) {
      tokens.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new BaseExpressionError(`Karakter tidak dikenal "${ch}"`);
    tokens.push({ t: "op", v: op });
    i += op.length;
  }
  return tokens;
}

type Node =
  | { k: "lit"; v: BaseValue }
  | { k: "id"; name: string }
  | { k: "list"; items: Node[] }
  | { k: "member"; obj: Node; name: string }
  | { k: "index"; obj: Node; index: Node }
  | { k: "call"; callee: Node; args: Node[] }
  | { k: "un"; op: string; arg: Node }
  | { k: "bin"; op: string; left: Node; right: Node };

const parseCache = new Map<string, Node>();

export function parseExpression(src: string): Node {
  const cached = parseCache.get(src);
  if (cached) return cached;
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new BaseExpressionError(`Diharapkan "${v}"`);
    pos++;
  };
  const args = (close: string): Node[] => {
    const list: Node[] = [];
    if (isOp(close)) {
      pos++;
      return list;
    }
    for (;;) {
      list.push(or());
      if (isOp(",")) pos++;
      else break;
    }
    expect(close);
    return list;
  };
  const primary = (): Node => {
    const tok = peek();
    if (!tok) throw new BaseExpressionError("Ekspresi terpotong");
    pos++;
    if (tok.t === "num" || tok.t === "str") return { k: "lit", v: tok.v };
    if (tok.t === "id") {
      if (tok.v === "true" || tok.v === "false") return { k: "lit", v: tok.v === "true" };
      if (tok.v === "null") return { k: "lit", v: null };
      return { k: "id", name: tok.v };
    }
    if (tok.v === "(") {
      const inner = or();
      expect(")");
      return inner;
    }
    if (tok.v === "[") return { k: "list", items: args("]") };
    throw new BaseExpressionError(`Tidak terduga "${tok.v}"`);
  };
  const postfix = (): Node => {
    let node = primary();
    for (;;) {
      if (isOp(".")) {
        pos++;
        const name = peek();
        if (name?.t !== "id") throw new BaseExpressionError("Nama setelah titik");
        pos++;
        node = { k: "member", obj: node, name: name.v };
      } else if (isOp("(")) {
        pos++;
        node = { k: "call", callee: node, args: args(")") };
      } else if (isOp("[")) {
        pos++;
        const index = or();
        expect("]");
        node = { k: "index", obj: node, index };
      } else return node;
    }
  };
  const unary = (): Node => {
    if (isOp("!") || isOp("-")) {
      const op = peek()!.v as string;
      pos++;
      return { k: "un", op, arg: unary() };
    }
    return postfix();
  };
  const level = (ops: string[], next: () => Node) => (): Node => {
    let left = next();
    while (peek()?.t === "op" && ops.includes(peek()!.v as string)) {
      const op = peek()!.v as string;
      pos++;
      left = { k: "bin", op, left, right: next() };
    }
    return left;
  };
  const mul = level(["*", "/", "%"], unary);
  const add = level(["+", "-"], mul);
  const cmp = level(["==", "!=", ">=", "<=", ">", "<"], add);
  const and = level(["&&"], cmp);
  const or = level(["||"], and);
  const tree = or();
  if (pos < tokens.length) throw new BaseExpressionError(`Sisa ekspresi tidak dikenali dekat "${String(peek()!.v)}"`);
  if (parseCache.size > 500) parseCache.clear();
  parseCache.set(src, tree);
  return tree;
}

// ---------------------------------------------------------------- nilai

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Tanggal dari teks ISO; tanggal saja dibaca sebagai tengah malam lokal (bukan UTC). */
export function toDate(value: BaseValue): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !ISO_DATE.test(value.trim())) return null;
  const text = value.trim();
  if (text.length === 10) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DURATION =
  /^(-?\d+(?:\.\d+)?)\s*(y|yr|year|years|tahun|M|mo|month|months|bulan|w|week|weeks|minggu|d|day|days|hari|h|hour|hours|jam|m|min|minute|minutes|menit|s|sec|second|seconds|detik)$/;

/** Durasi "7d", "2 weeks", "1M" → { ms } atau bulan/tahun (kalender). */
function parseDuration(text: string): { months: number; ms: number } | null {
  const match = DURATION.exec(text.trim());
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2];
  if (/^(y|yr|year|years|tahun)$/.test(unit)) return { months: n * 12, ms: 0 };
  if (/^(M|mo|month|months|bulan)$/.test(unit)) return { months: n, ms: 0 };
  const ms = /^(w|week|weeks|minggu)$/.test(unit)
    ? 7 * 86_400_000
    : /^(d|day|days|hari)$/.test(unit)
      ? 86_400_000
      : /^(h|hour|hours|jam)$/.test(unit)
        ? 3_600_000
        : /^(s|sec|second|seconds|detik)$/.test(unit)
          ? 1000
          : 60_000;
  return { months: 0, ms: n * ms };
}

function shiftDate(date: Date, duration: { months: number; ms: number }, sign: 1 | -1) {
  const next = new Date(date.getTime());
  if (duration.months) next.setMonth(next.getMonth() + sign * duration.months);
  return new Date(next.getTime() + sign * duration.ms);
}

const toNumber = (value: BaseValue): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

export const isEmptyValue = (value: BaseValue) =>
  value === null || value === "" || (Array.isArray(value) && value.length === 0);

export const truthy = (value: BaseValue) =>
  !isEmptyValue(value) && value !== false && value !== 0 && !(value instanceof Date && Number.isNaN(value.getTime()));

function valueText(value: BaseValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  return String(value);
}

/** Bandingkan dua nilai: tanggal, angka, lalu teks (tanpa huruf besar/kecil). */
export function compareValues(a: BaseValue, b: BaseValue): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const da = toDate(a);
  const db = toDate(b);
  if (da && db) return da.getTime() - db.getTime();
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return valueText(a).localeCompare(valueText(b), "id", { sensitivity: "base", numeric: true });
}

const equals = (a: BaseValue, b: BaseValue): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
  if (Array.isArray(a) || Array.isArray(b)) return false;
  if (a === null || b === null) return isEmptyValue(a) && isEmptyValue(b);
  return compareValues(a, b) === 0;
};

/** Nilai mentah frontmatter → nilai Bases (objek bersarang jadi teks). */
function fromJson(value: unknown): BaseValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(fromJson);
  return JSON.stringify(value);
}

// ---------------------------------------------------------------- konteks catatan

export interface BaseContext {
  note: KnowledgeNoteListItem;
  formulas: Record<string, string>;
  now: Date;
}

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

function fileField(note: KnowledgeNoteListItem, name: string): BaseValue | undefined {
  const file = baseName(note.path);
  const dot = file.lastIndexOf(".");
  switch (name) {
    case "name":
      return file;
    case "basename":
      return dot > 0 ? file.slice(0, dot) : file;
    case "ext":
      return dot > 0 ? file.slice(dot + 1) : "";
    case "path":
      return note.path;
    case "folder":
      return folderOf(note.path);
    case "mtime":
      return new Date(note.updatedAt);
    case "tags":
      return note.tags;
    case "links":
      return note.links;
    case "backlinks":
      return note.backlinks;
    case "title":
      return note.title;
    default:
      return undefined;
  }
}

function noteProperty(note: KnowledgeNoteListItem, name: string): BaseValue {
  const props = note.properties ?? {};
  if (name in props) return fromJson(props[name]);
  const key = Object.keys(props).find((k) => k.toLowerCase() === name.toLowerCase());
  if (key) return fromJson(props[key]);
  if (name === "tags") return note.tags;
  return null;
}

type Scope = "file" | "note" | "formula";
type Resolved = BaseValue | { scope: Scope };

const isScope = (v: Resolved): v is { scope: Scope } =>
  !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && "scope" in v;

function evaluateNode(node: Node, ctx: BaseContext, stack: string[]): Resolved {
  switch (node.k) {
    case "lit":
      return node.v;
    case "list":
      return node.items.map((item) => value(item, ctx, stack));
    case "id":
      if (node.name === "file" || node.name === "note" || node.name === "formula") return { scope: node.name };
      return noteProperty(ctx.note, node.name);
    case "member":
    case "index": {
      const obj = evaluateNode(node.obj, ctx, stack);
      const name = node.k === "member" ? node.name : valueText(value(node.index, ctx, stack));
      if (isScope(obj)) {
        if (obj.scope === "file") {
          const field = fileField(ctx.note, name);
          if (field === undefined) throw new BaseExpressionError(`file.${name} tidak didukung`);
          return field;
        }
        if (obj.scope === "note") return noteProperty(ctx.note, name);
        return formulaValue(name, ctx, stack);
      }
      if (name === "length") return Array.isArray(obj) ? obj.length : valueText(obj).length;
      if (obj instanceof Date) {
        if (name === "year") return obj.getFullYear();
        if (name === "month") return obj.getMonth() + 1;
        if (name === "day") return obj.getDate();
      }
      const date = toDate(obj);
      if (date && (name === "year" || name === "month" || name === "day"))
        return name === "year" ? date.getFullYear() : name === "month" ? date.getMonth() + 1 : date.getDate();
      throw new BaseExpressionError(`Properti .${name} tidak didukung`);
    }
    case "call":
      return call(node, ctx, stack);
    case "un": {
      const arg = value(node.arg, ctx, stack);
      if (node.op === "!") return !truthy(arg);
      const n = toNumber(arg);
      if (n === null) throw new BaseExpressionError("Tanda minus untuk bukan angka");
      return -n;
    }
    case "bin":
      return binary(node, ctx, stack);
  }
}

function value(node: Node, ctx: BaseContext, stack: string[]): BaseValue {
  const result = evaluateNode(node, ctx, stack);
  if (isScope(result)) throw new BaseExpressionError(`"${result.scope}" perlu nama properti`);
  return result;
}

function binary(node: Extract<Node, { k: "bin" }>, ctx: BaseContext, stack: string[]): BaseValue {
  if (node.op === "&&") return truthy(value(node.left, ctx, stack)) && truthy(value(node.right, ctx, stack));
  if (node.op === "||") return truthy(value(node.left, ctx, stack)) || truthy(value(node.right, ctx, stack));
  const left = value(node.left, ctx, stack);
  const right = value(node.right, ctx, stack);
  switch (node.op) {
    case "==":
      return equals(left, right);
    case "!=":
      return !equals(left, right);
    case ">":
    case "<":
    case ">=":
    case "<=": {
      if (left === null || right === null) return false;
      const c = compareValues(left, right);
      return node.op === ">" ? c > 0 : node.op === "<" ? c < 0 : node.op === ">=" ? c >= 0 : c <= 0;
    }
  }
  // aritmetika: tanggal ± durasi, selisih dua tanggal (ms), angka, sambung teks
  const leftDate = toDate(left);
  if (leftDate && (node.op === "+" || node.op === "-")) {
    const duration = typeof right === "string" ? parseDuration(right) : null;
    if (duration) return shiftDate(leftDate, duration, node.op === "+" ? 1 : -1);
    const rightDate = toDate(right);
    if (rightDate && node.op === "-") return leftDate.getTime() - rightDate.getTime();
    const ms = toNumber(right);
    if (ms !== null) return new Date(leftDate.getTime() + (node.op === "+" ? ms : -ms));
  }
  const a = toNumber(left);
  const b = toNumber(right);
  if (a !== null && b !== null) {
    if (node.op === "+") return a + b;
    if (node.op === "-") return a - b;
    if (node.op === "*") return a * b;
    if (node.op === "/") return b === 0 ? null : a / b;
    return b === 0 ? null : a % b;
  }
  if (node.op === "+") return valueText(left) + valueText(right);
  throw new BaseExpressionError(`Operasi "${node.op}" tidak bisa untuk nilai ini`);
}

function call(node: Extract<Node, { k: "call" }>, ctx: BaseContext, stack: string[]): BaseValue {
  const args = () => node.args.map((a) => value(a, ctx, stack));
  if (node.callee.k === "id") {
    const name = node.callee.name;
    const a = args();
    if (name === "today") return new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate());
    if (name === "now") return new Date(ctx.now.getTime());
    if (name === "date") return toDate(a[0] ?? null);
    if (name === "number") return toNumber(a[0] ?? null);
    if (name === "list") return Array.isArray(a[0]) ? a[0] : a[0] === null || a[0] === undefined ? [] : [a[0]];
    if (name === "if") return truthy(a[0] ?? null) ? (a[1] ?? null) : (a[2] ?? null);
    if (name === "link") return a[0] ?? null;
    throw new BaseExpressionError(`Fungsi ${name}() tidak didukung`);
  }
  if (node.callee.k !== "member") throw new BaseExpressionError("Pemanggilan tidak dikenali");
  const method = node.callee.name;
  const target = evaluateNode(node.callee.obj, ctx, stack);
  const a = args();
  if (isScope(target)) {
    if (target.scope !== "file") throw new BaseExpressionError(`${target.scope}.${method}() tidak didukung`);
    if (method === "hasTag") {
      const tags = ctx.note.tags.map((t) => t.toLowerCase().replace(/^#/, ""));
      return a.some((x) => {
        const want = valueText(x).toLowerCase().replace(/^#/, "");
        return tags.some((t) => t === want || t.startsWith(`${want}/`));
      });
    }
    if (method === "inFolder") {
      const folder = valueText(a[0] ?? "").replace(/^\/+|\/+$/g, "");
      const own = folderOf(ctx.note.path);
      return !folder || own === folder || own.startsWith(`${folder}/`);
    }
    if (method === "hasProperty") return a.some((x) => !isEmptyValue(noteProperty(ctx.note, valueText(x))));
    throw new BaseExpressionError(`file.${method}() tidak didukung`);
  }
  const text = valueText(target).toLowerCase();
  const has = (x: BaseValue) =>
    Array.isArray(target) ? target.some((item) => equals(item, x)) : text.includes(valueText(x).toLowerCase());
  switch (method) {
    case "contains":
      return has(a[0] ?? null);
    case "containsAny":
      return a.some(has);
    case "containsAll":
      return a.every(has);
    case "startsWith":
      return text.startsWith(valueText(a[0] ?? "").toLowerCase());
    case "endsWith":
      return text.endsWith(valueText(a[0] ?? "").toLowerCase());
    case "isEmpty":
      return isEmptyValue(target);
    case "lower":
      return valueText(target).toLowerCase();
    case "upper":
      return valueText(target).toUpperCase();
    case "toString":
      return valueText(target);
    default:
      throw new BaseExpressionError(`Metode .${method}() tidak didukung`);
  }
}

function formulaValue(name: string, ctx: BaseContext, stack: string[]): BaseValue {
  const src = ctx.formulas[name];
  if (src === undefined) throw new BaseExpressionError(`Rumus "${name}" tidak ada`);
  if (stack.includes(name)) throw new BaseExpressionError(`Rumus "${name}" merujuk dirinya sendiri`);
  return value(parseExpression(String(src)), ctx, [...stack, name]);
}

/** Nilai satu ekspresi untuk satu catatan. */
export function evaluate(src: string, ctx: BaseContext): BaseValue {
  return value(parseExpression(src), ctx, []);
}

// ---------------------------------------------------------------- filter, kolom, tampilan

/** Id properti baku: nama tanpa awalan = properti catatan (`status` → `note.status`). */
export const normalizeProperty = (id: string) => (/^(file|note|formula)\./.test(id) ? id : `note.${id}`);

/** Ekspresi pembaca nilai properti untuk id baku (nama berisi spasi memakai `note["…"]`). */
const propertyExpression = (id: string) => {
  const [scope, ...rest] = normalizeProperty(id).split(".");
  const name = rest.join(".");
  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name) ? `${scope}.${name}` : `${scope}[${JSON.stringify(name)}]`;
};

export function propertyValue(id: string, ctx: BaseContext): BaseValue {
  try {
    return evaluate(propertyExpression(id), ctx);
  } catch {
    return null;
  }
}

/** Evaluasi filter (string / and / or / not). Ekspresi galat dicatat dan dianggap lolos (tidak menyembunyikan catatan). */
export function matchesFilter(filter: BaseFilter | undefined, ctx: BaseContext, errors: Set<string>): boolean {
  if (filter === undefined || filter === null) return true;
  if (typeof filter === "string") {
    if (!filter.trim()) return true;
    try {
      return truthy(evaluate(filter, ctx));
    } catch (error) {
      errors.add(`${filter} — ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  }
  if (typeof filter !== "object") return true;
  if (Array.isArray(filter.and) && !filter.and.every((f) => matchesFilter(f, ctx, errors))) return false;
  if (Array.isArray(filter.or) && filter.or.length && !filter.or.some((f) => matchesFilter(f, ctx, errors)))
    return false;
  if (Array.isArray(filter.not) && filter.not.some((f) => matchesFilter(f, ctx, errors))) return false;
  return true;
}

const FILE_LABELS: Record<string, string> = {
  "file.name": "Nama berkas",
  "file.basename": "Nama",
  "file.title": "Judul",
  "file.path": "Path",
  "file.folder": "Folder",
  "file.ext": "Ekstensi",
  "file.mtime": "Diubah",
  "file.tags": "Tag",
  "file.links": "Tautan keluar",
  "file.backlinks": "Backlink",
};
export const FILE_PROPERTIES = Object.keys(FILE_LABELS);

export function propertyLabel(id: string, base: BaseData) {
  const key = normalizeProperty(id);
  const custom = base.properties?.[key]?.displayName ?? base.properties?.[id]?.displayName;
  if (custom) return custom;
  return FILE_LABELS[key] ?? key.replace(/^(note|formula)\./, "");
}

/** Kolom tampilan: `order` bila ada, selain itu nama berkas + diubah. */
export const viewColumns = (view: BaseView) =>
  (view.order?.length ? view.order : ["file.name", "file.mtime"]).map(normalizeProperty);

export interface BaseRow {
  note: KnowledgeNoteListItem;
  values: Record<string, BaseValue>;
}

export interface BaseResult {
  columns: string[];
  rows: BaseRow[];
  groups: { key: string; value: BaseValue; rows: BaseRow[] }[] | null;
  total: number;
  errors: string[];
}

/** Terapkan base + tampilan atas catatan: filter base & tampilan, kolom, urutan, kelompok, batas. */
export function applyView(notes: KnowledgeNoteListItem[], base: BaseData, view: BaseView, now: Date): BaseResult {
  const errors = new Set<string>();
  const formulas = Object.fromEntries(Object.entries(base.formulas ?? {}).map(([k, v]) => [k, String(v ?? "")]));
  const columns = viewColumns(view);
  const sort = (view.sort ?? [])
    .filter((s) => s?.property)
    .map((s) => ({ ...s, property: normalizeProperty(s.property) }));
  const group = view.groupBy?.property ? normalizeProperty(view.groupBy.property) : null;
  const needed = [...new Set([...columns, ...sort.map((s) => s.property), ...(group ? [group] : [])])];

  let rows: BaseRow[] = [];
  for (const note of notes) {
    const ctx: BaseContext = { note, formulas, now };
    if (!matchesFilter(base.filters, ctx, errors) || !matchesFilter(view.filters, ctx, errors)) continue;
    const values: Record<string, BaseValue> = {};
    for (const id of needed) {
      try {
        values[id] = evaluate(propertyExpression(id), ctx);
      } catch (error) {
        values[id] = null;
        if (id.startsWith("formula.")) errors.add(`${id} — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    rows.push({ note, values });
  }
  if (sort.length) {
    rows.sort((x, y) => {
      for (const s of sort) {
        const c = compareValues(x.values[s.property] ?? null, y.values[s.property] ?? null);
        if (c) return s.direction?.toUpperCase() === "DESC" ? -c : c;
      }
      return 0;
    });
  }
  const total = rows.length;
  if (typeof view.limit === "number" && view.limit > 0) rows = rows.slice(0, view.limit);

  let groups: BaseResult["groups"] = null;
  if (group) {
    const map = new Map<string, { key: string; value: BaseValue; rows: BaseRow[] }>();
    for (const row of rows) {
      const v = row.values[group] ?? null;
      const key = valueText(v);
      const entry = map.get(key) ?? { key, value: v, rows: [] };
      entry.rows.push(row);
      map.set(key, entry);
    }
    const desc = view.groupBy?.direction?.toUpperCase() === "DESC";
    groups = [...map.values()].sort((a, b) => {
      const c = compareValues(a.value, b.value);
      return desc ? -c : c;
    });
  }
  return { columns, rows, groups, total, errors: [...errors] };
}

/** Teks tampilan nilai (tanggal = tanggal lokal, daftar = koma, boolean = Ya/Tidak). */
export function formatBaseValue(value: BaseValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const hasTime = value.getHours() || value.getMinutes();
    return value.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }
  if (Array.isArray(value)) return value.map(formatBaseValue).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return value;
}

// ---------------------------------------------------------------- penyusun kondisi (UI)

export type ConditionOp =
  "is" | "isNot" | "contains" | "notContains" | "empty" | "notEmpty" | "gt" | "lt" | "hasTag" | "inFolder";

export const CONDITION_OPS: { id: ConditionOp; label: string; needsValue: boolean; needsProperty: boolean }[] = [
  { id: "is", label: "sama dengan", needsValue: true, needsProperty: true },
  { id: "isNot", label: "tidak sama dengan", needsValue: true, needsProperty: true },
  { id: "contains", label: "memuat", needsValue: true, needsProperty: true },
  { id: "notContains", label: "tidak memuat", needsValue: true, needsProperty: true },
  { id: "empty", label: "kosong", needsValue: false, needsProperty: true },
  { id: "notEmpty", label: "tidak kosong", needsValue: false, needsProperty: true },
  { id: "gt", label: "lebih dari", needsValue: true, needsProperty: true },
  { id: "lt", label: "kurang dari", needsValue: true, needsProperty: true },
  { id: "hasTag", label: "bertag", needsValue: true, needsProperty: false },
  { id: "inFolder", label: "di folder", needsValue: true, needsProperty: false },
];

/** Nilai isian → literal ekspresi: angka & true/false apa adanya, selain itu teks berkutip. */
const literal = (raw: string) => {
  const text = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(text) || text === "true" || text === "false") return text;
  return JSON.stringify(text);
};

/** Satu kondisi dari penyusun → ekspresi Bases (disimpan apa adanya di berkas `.base`). */
export function buildCondition(property: string, op: ConditionOp, raw: string) {
  if (op === "hasTag") return `file.hasTag(${JSON.stringify(raw.trim().replace(/^#/, ""))})`;
  if (op === "inFolder") return `file.inFolder(${JSON.stringify(raw.trim())})`;
  const prop = propertyExpression(property);
  switch (op) {
    case "is":
      return `${prop} == ${literal(raw)}`;
    case "isNot":
      return `${prop} != ${literal(raw)}`;
    case "contains":
      return `${prop}.contains(${literal(raw)})`;
    case "notContains":
      return `!${prop}.contains(${literal(raw)})`;
    case "empty":
      return `${prop}.isEmpty()`;
    case "notEmpty":
      return `!${prop}.isEmpty()`;
    case "gt":
      return `${prop} > ${literal(raw)}`;
    case "lt":
      return `${prop} < ${literal(raw)}`;
  }
}

/** Filter tingkat atas → mode + daftar butir (butir bersarang tetap objek). */
export function splitFilter(filter: BaseFilter | undefined): { mode: "and" | "or"; items: BaseFilter[] } {
  if (filter === undefined || filter === null) return { mode: "and", items: [] };
  if (typeof filter === "string") return { mode: "and", items: [filter] };
  if (Array.isArray(filter.or) && !filter.and && !filter.not) return { mode: "or", items: filter.or };
  if (Array.isArray(filter.and) && !filter.or && !filter.not) return { mode: "and", items: filter.and };
  return { mode: "and", items: [filter] };
}

export function joinFilter(mode: "and" | "or", items: BaseFilter[]): BaseFilter | undefined {
  const clean = items.filter((i) => (typeof i === "string" ? i.trim() : i));
  if (!clean.length) return undefined;
  return mode === "and" ? { and: clean } : { or: clean };
}

/** Semua id properti yang bisa dipilih: properti berkas, properti catatan yang ada di vault, rumus base. */
export function availableProperties(notes: KnowledgeNoteListItem[], base: BaseData) {
  const props = new Set<string>();
  for (const note of notes) for (const key of Object.keys(note.properties ?? {})) props.add(`note.${key}`);
  props.add("note.tags");
  return [
    ...FILE_PROPERTIES,
    ...[...props].sort((a, b) => a.localeCompare(b, "id")),
    ...Object.keys(base.formulas ?? {}).map((k) => `formula.${k}`),
  ];
}

// ---------------------------------------------------------------- ringkasan kolom

/** Ringkasan bawaan Bases Obsidian (nama disimpan apa adanya di `summaries`). */
export const SUMMARIES: { id: string; label: string }[] = [
  { id: "Average", label: "Rata-rata" },
  { id: "Median", label: "Median" },
  { id: "Min", label: "Terkecil" },
  { id: "Max", label: "Terbesar" },
  { id: "Sum", label: "Jumlah" },
  { id: "Range", label: "Rentang" },
  { id: "Stddev", label: "Simpangan baku" },
  { id: "Earliest", label: "Paling awal" },
  { id: "Latest", label: "Paling akhir" },
  { id: "Checked", label: "Tercentang" },
  { id: "Unchecked", label: "Tidak tercentang" },
  { id: "Empty", label: "Kosong" },
  { id: "Filled", label: "Terisi" },
  { id: "Unique", label: "Nilai unik" },
];

const round = (n: number) => Math.round(n * 100) / 100;

/** Hitung satu ringkasan atas nilai satu kolom. Null = tidak bisa dihitung (mis. rata-rata tanpa angka). */
export function summarize(values: BaseValue[], kind: string): string | null {
  const numbers = values.map((v) => (v instanceof Date ? null : toNumber(v))).filter((n): n is number => n !== null);
  const dates = values.map((v) => toDate(v)).filter((d): d is Date => !!d);
  switch (kind) {
    case "Average":
      return numbers.length ? String(round(numbers.reduce((a, b) => a + b, 0) / numbers.length)) : null;
    case "Median": {
      if (!numbers.length) return null;
      const s = [...numbers].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return String(round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2));
    }
    case "Min":
      return numbers.length ? String(Math.min(...numbers)) : null;
    case "Max":
      return numbers.length ? String(Math.max(...numbers)) : null;
    case "Sum":
      return numbers.length ? String(round(numbers.reduce((a, b) => a + b, 0))) : null;
    case "Range": {
      if (numbers.length) return String(round(Math.max(...numbers) - Math.min(...numbers)));
      if (dates.length) {
        const days = (Math.max(...dates.map(Number)) - Math.min(...dates.map(Number))) / 86_400_000;
        return `${Math.round(days)} hari`;
      }
      return null;
    }
    case "Stddev": {
      if (numbers.length < 2) return null;
      const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      return String(round(Math.sqrt(numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / numbers.length)));
    }
    case "Earliest":
      return dates.length ? formatBaseValue(new Date(Math.min(...dates.map(Number)))) : null;
    case "Latest":
      return dates.length ? formatBaseValue(new Date(Math.max(...dates.map(Number)))) : null;
    case "Checked":
      return String(values.filter((v) => v === true).length);
    case "Unchecked":
      return String(values.filter((v) => v === false).length);
    case "Empty":
      return String(values.filter(isEmptyValue).length);
    case "Filled":
      return String(values.filter((v) => !isEmptyValue(v)).length);
    case "Unique":
      return String(new Set(values.filter((v) => !isEmptyValue(v)).map(valueText)).size);
    default:
      return null;
  }
}

export const summaryLabel = (kind: string) => SUMMARIES.find((s) => s.id === kind)?.label ?? kind;

// ---------------------------------------------------------------- sunting nilai di sel

/**
 * Teks isian sel → nilai properti frontmatter. Bentuk mengikuti nilai lama: daftar dipecah koma, angka/boolean dikenali.
 * Undefined = kosongkan (properti dihapus).
 */
export function parseCellInput(text: string, previous: BaseValue): unknown {
  const raw = text.trim();
  if (!raw) return undefined;
  if (Array.isArray(previous))
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof previous === "number" || (previous === null && /^-?\d+(\.\d+)?$/.test(raw))) {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof previous === "boolean" || previous === null) {
    if (/^(true|ya)$/i.test(raw)) return true;
    if (/^(false|tidak)$/i.test(raw)) return false;
  }
  return raw;
}

/** Nilai properti → teks isian sel (kebalikan `parseCellInput`). */
export const cellInputText = (value: BaseValue) =>
  Array.isArray(value)
    ? value.map(valueText).join(", ")
    : value instanceof Date
      ? value.toISOString()
      : valueText(value);
