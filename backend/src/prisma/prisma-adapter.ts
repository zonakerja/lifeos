import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Driver adapter node-postgres untuk Prisma engine "client" (tanpa Rust).
 * Parameter `schema` pada DATABASE_URL dipisahkan karena bukan opsi koneksi pg.
 */
export function createPrismaAdapter(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema") ?? undefined;
  url.searchParams.delete("schema");
  return new PrismaPg({ connectionString: url.toString() }, { schema });
}
