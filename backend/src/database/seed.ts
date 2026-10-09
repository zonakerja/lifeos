/**
 * Seed data awal.
 *
 * - Development (default): pengaturan aplikasi + akun demo
 *   admin@lifeos.com / 123 (super_admin) dan viewer@lifeos.com / 123 (viewer).
 * - Production (NODE_ENV=production): pengaturan aplikasi + satu super admin dari
 *   env SEED_ADMIN_EMAIL & SEED_ADMIN_PASSWORD (wajib, min. 8 karakter). Tanpa akun demo.
 *
 * Idempoten: akun yang sudah ada tidak diubah.
 * Dev:  npm run prisma:seed   |   Produksi/container:  node dist/database/seed.js
 */
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaClient, UserRole } from "@prisma/client";
import { createPrismaAdapter } from "../prisma/prisma-adapter";

const prisma = new PrismaClient({ adapter: createPrismaAdapter(process.env.DATABASE_URL ?? "") });

async function ensureUser(email: string, name: string, password: string, role: UserRole) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return console.log(`• ${email} sudah ada (dilewati)`);
  await prisma.user.create({ data: { email, name, role, passwordHash: await hash(password) } });
  console.log(`✓ ${email} dibuat (${role})`);
}

async function main() {
  await prisma.appSettings.upsert({ where: { id: "global" }, create: {}, update: {} });

  if (process.env.NODE_ENV === "production") {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password || password.length < 8) {
      throw new Error("Produksi: set SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD (min. 8 karakter).");
    }
    await ensureUser(email, process.env.SEED_ADMIN_NAME ?? "Super Admin", password, UserRole.super_admin);
    return;
  }

  await ensureUser("admin@lifeos.com", "Super Admin", "123", UserRole.super_admin);
  await ensureUser("viewer@lifeos.com", "Tamu Viewer", "123", UserRole.viewer);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
