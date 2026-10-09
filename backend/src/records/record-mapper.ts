import { Prisma } from "@prisma/client";
import { type FieldKind, type FieldSpec, type TableSpec, fieldName } from "./record-schema";

/**
 * Konversi payload frontend <-> baris tabel domain.
 *
 * Aturan (HARUS identik dengan SQL salin data di prisma/generate-domain-models.mts):
 * - Nilai field yang lolos validasi jenisnya → kolom bertipe.
 * - Nilai yang tidak lolos (termasuk null eksplisit) → tetap di `extra` apa adanya.
 * - Key yang tidak dikenal spesifikasi → `extra`.
 * - `id` hanya dibuang bila sama persis dengan clientId; `userId` selalu dari kolom.
 * Dengan begitu payload yang dibaca kembali identik dengan yang ditulis.
 */

export type Payload = Record<string, unknown>;
export type DomainRow = Record<string, unknown> & {
  id: string;
  userId: string;
  clientId: string;
  extra: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Tanggal (kolom DATE) → "YYYY-MM-DD" (UTC, sesuai cara Prisma memetakan DATE). */
const formatYmd = (d: Date) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Tanggal → format Date.toDateString(), mis. "Thu Oct 08 2026". */
const formatDateKey = (d: Date) =>
  `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad(d.getUTCFullYear(), 4)}`;

function parseYmd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCFullYear(Number(m[1])); // tahun < 100 tidak digeser ke 19xx
  return formatYmd(d) === value ? d : null;
}

function parseDateKey(value: string): Date | null {
  const m = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) (\d{2}) (\d{4})$/.exec(value);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
  d.setUTCFullYear(Number(m[3]));
  return formatDateKey(d) === value ? d : null;
}

function parseTimestamp(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.toISOString() === value ? d : null;
}

/** Nilai kolom untuk `value`, atau `undefined` bila tidak valid untuk jenis tersebut. */
function toColumn(kind: FieldKind, value: unknown): unknown {
  switch (kind) {
    case "string":
      return typeof value === "string" ? value : undefined;
    case "int":
      return typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= 999_999_999 ? value : undefined;
    case "float":
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "bool":
      return typeof value === "boolean" ? value : undefined;
    case "ymd":
      return typeof value === "string" ? (parseYmd(value) ?? undefined) : undefined;
    case "dateKey":
      return typeof value === "string" ? (parseDateKey(value) ?? undefined) : undefined;
    case "timestamp":
      return typeof value === "string" ? (parseTimestamp(value) ?? undefined) : undefined;
    case "json":
      return value === null || value === undefined ? undefined : value;
  }
}

function fromColumn(kind: FieldKind, value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  switch (kind) {
    case "ymd":
      return formatYmd(value as Date);
    case "dateKey":
      return formatDateKey(value as Date);
    case "timestamp":
      return (value as Date).toISOString();
    default:
      return value;
  }
}

const nullValue = (spec: FieldSpec) => (spec.kind === "json" ? Prisma.DbNull : null);

/** Payload → data kolom (tanpa userId/clientId) untuk create/update. */
export function payloadToRow(spec: TableSpec, payload: Payload, clientId: string) {
  const data: Record<string, unknown> = {};
  const extra: Payload = {};
  const known = new Set(["id", "userId", ...spec.fields.map((f) => f.key)]);

  for (const [key, value] of Object.entries(payload)) {
    if (!known.has(key) && value !== undefined) extra[key] = value;
  }
  if ("id" in payload && payload.id !== clientId) extra.id = payload.id;

  for (const field of spec.fields) {
    const value = payload[field.key];
    const column = toColumn(field.kind, value);
    if (column === undefined) {
      data[fieldName(field)] = nullValue(field);
      if (field.key in payload && value !== undefined) extra[field.key] = value;
    } else {
      data[fieldName(field)] = column;
    }
  }
  data.extra = extra as Prisma.InputJsonObject;
  return data;
}

/** Baris tabel → payload frontend. */
export function rowToPayload(spec: TableSpec, row: DomainRow): Payload {
  const payload: Payload = { id: row.clientId };
  for (const field of spec.fields) {
    const value = fromColumn(field.kind, row[fieldName(field)]);
    if (value !== undefined) payload[field.key] = value;
  }
  Object.assign(payload, row.extra as Payload);
  payload.userId = row.userId;
  return payload;
}

/** Bentuk respons API /records. */
export function toApiRecord(type: string, spec: TableSpec, row: DomainRow) {
  const payload = rowToPayload(spec, row);
  const title = spec.titleKey ? payload[spec.titleKey] : undefined;
  const dateField = spec.fields.find((f) => f.key === spec.dateKey);
  const dateValue = dateField ? row[fieldName(dateField)] : null;
  return {
    id: row.id,
    clientId: row.clientId,
    type,
    userId: row.userId,
    title: typeof title === "string" ? title : null,
    date: dateValue instanceof Date ? dateValue.toISOString() : null,
    payload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
