import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { type DomainRow } from "./record-mapper";
import { RECORD_TABLES, type RecordType } from "./record-schema";

/**
 * Bentuk minimal delegate Prisma yang dipakai layanan generik. Semua tabel domain
 * dibuat dari spesifikasi yang sama sehingga punya kolom sistem yang identik
 * (user_id, client_id, extra, timestamps, deleted_at).
 */
export interface DomainDelegate {
  findMany(args: object): Promise<DomainRow[]>;
  findUnique(args: object): Promise<DomainRow | null>;
  upsert(args: object): Promise<DomainRow>;
  update(args: object): Promise<DomainRow>;
  updateMany(args: object): Promise<{ count: number }>;
  count(args: object): Promise<number>;
  groupBy(args: object): Promise<{ userId: string; _count: { _all: number } }[]>;
}
export type Db = Prisma.TransactionClient | PrismaService;

export function domainDelegate(db: Db, type: RecordType): DomainDelegate {
  const model = RECORD_TABLES[type].model;
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (db as unknown as Record<string, DomainDelegate>)[key];
}
