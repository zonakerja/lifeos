-- Pembagian tugas AI per user (provider chat/umum/OCR + provider embedding Gemini/OpenAI).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_routing" JSONB;

