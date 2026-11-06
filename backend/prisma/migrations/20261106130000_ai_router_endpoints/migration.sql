-- Jalur provider AI lewat router (alamat API, format, model embedding); kosong = langsung ke API resmi.
-- AlterTable
ALTER TABLE "ai_credentials" ADD COLUMN     "api_format" TEXT,
ADD COLUMN     "base_url" TEXT,
ADD COLUMN     "embedding_model" TEXT;
