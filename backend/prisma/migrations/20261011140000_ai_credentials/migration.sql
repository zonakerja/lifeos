-- API key AI pindah dari users.api_key (plaintext) ke ai_credentials (terenkripsi AES-256-GCM oleh backend).
-- Key lama sengaja tidak dipindahkan (SQL tidak bisa mengenkripsi dengan kunci aplikasi): user memasukkan ulang
-- key di Pengaturan -> AI.

-- CreateEnum
CREATE TYPE "ai_provider" AS ENUM ('gemini', 'anthropic', 'openai');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "api_key",
ADD COLUMN     "ai_provider" "ai_provider";

-- CreateTable
CREATE TABLE "ai_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "key_hint" TEXT NOT NULL,
    "model" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_credentials_user_id_provider_key" ON "ai_credentials"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

