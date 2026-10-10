import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: URL datasource & shadow DB diatur di sini (bukan di schema.prisma).
// Dibaca dari process.env tanpa env() agar `prisma generate` tetap jalan tanpa DATABASE_URL (build image).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/database/seed.ts"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL
  }
});
