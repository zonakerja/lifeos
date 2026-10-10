/**
 * Generator model Prisma untuk tabel domain dari src/records/record-schema.ts.
 *
 *   npm run db:generate-models   → tulis ulang blok model di schema.prisma (+ prisma format)
 *
 * Dijalankan dengan Node (type stripping), tanpa kompilasi.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type FieldKind, RECORD_TABLES, type TableSpec, fieldName } from "../src/records/record-schema.ts";

const SCHEMA_PATH = join(import.meta.dirname, "schema.prisma");
const RESERVED = new Set(["id", "userId", "clientId", "extra", "createdAt", "updatedAt", "deletedAt", "user"]);

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const PRISMA_TYPE: Record<FieldKind, string> = {
  string: "String?",
  int: "Int?",
  float: "Float?",
  bool: "Boolean?",
  ymd: "DateTime? @db.Date",
  dateKey: "DateTime? @db.Date",
  timestamp: "DateTime? @db.Timestamptz(3)",
  json: "Json?",
};

function modelBlock(type: string, spec: TableSpec) {
  const rows: [string, string][] = [
    ["id", "String    @id @default(cuid())"],
    ["userId", 'String    @map("user_id")'],
    ["clientId", 'String    @map("client_id")'],
  ];
  for (const field of spec.fields) {
    const name = fieldName(field);
    if (RESERVED.has(name)) throw new Error(`${type}.${name}: nama field bentrok dengan kolom sistem`);
    const [base, ...attrs] = PRISMA_TYPE[field.kind].split(" ");
    const map = snake(name) === name ? [] : [`@map("${snake(name)}")`];
    rows.push([name, [base.padEnd(9), ...map, ...attrs].join(" ")]);
  }
  rows.push(
    ["extra", 'Json      @default("{}")'],
    ["createdAt", 'DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)'],
    ["updatedAt", 'DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)'],
    ["deletedAt", 'DateTime? @map("deleted_at") @db.Timestamptz(3)'],
    ["user", "User      @relation(fields: [userId], references: [id], onDelete: Cascade)"],
  );
  const width = Math.max(...rows.map(([n]) => n.length)) + 1;
  const lines = rows.map(([n, t]) => `  ${n.padEnd(width)}${t}`);
  lines.push("", "  @@unique([userId, clientId])", "  @@index([userId, deletedAt])");
  for (const index of spec.indexes ?? []) lines.push(`  @@index([userId, ${index.join(", ")}])`);
  lines.push(`  @@map("${spec.table}")`);
  return `/// Record type \`${type}\`\nmodel ${spec.model} {\n${lines.join("\n")}\n}`;
}

function replaceBetween(source: string, marker: string, content: string) {
  const start = `// <generated:${marker}>`;
  const end = `// </generated:${marker}>`;
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from < 0 || to < 0) throw new Error(`Marker ${marker} tidak ditemukan di schema.prisma`);
  return `${source.slice(0, from + start.length)}\n${content}\n${source.slice(to)}`;
}

// ---------------------------------------------------------------- main

const entries = Object.entries(RECORD_TABLES) as [string, TableSpec][];
let schema = readFileSync(SCHEMA_PATH, "utf8");
schema = replaceBetween(schema, "domain-models", entries.map(([type, spec]) => modelBlock(type, spec)).join("\n\n"));
const relationWidth = Math.max(...entries.map(([, spec]) => spec.model.length)) + 2;
schema = replaceBetween(
  schema,
  "user-relations",
  entries
    .map(([, spec]) => {
      const base = spec.model.charAt(0).toLowerCase() + spec.model.slice(1);
      const name = base.endsWith("y") ? `${base.slice(0, -1)}ies` : `${base}s`;
      return `  ${name.padEnd(relationWidth + 1)}${spec.model}[]`;
    })
    .join("\n") + "\n  ",
);
writeFileSync(SCHEMA_PATH, schema);
console.log(`schema.prisma: ${entries.length} model domain diperbarui`);
