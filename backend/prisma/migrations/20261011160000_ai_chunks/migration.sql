-- RAG tahap 1: potongan teks + embedding (gemini-embedding-2, 768 dimensi) per user, dan sakelar indeks per user.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_index_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ai_chunks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(768),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_chunks_user_id_source_type_source_id_idx" ON "ai_chunks"("user_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chunks_user_id_source_type_source_id_chunk_index_key" ON "ai_chunks"("user_id", "source_type", "source_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "ai_chunks" ADD CONSTRAINT "ai_chunks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Indeks yang tidak bisa dinyatakan di skema Prisma (dibuat manual):
-- pencarian kemiripan (cosine) dan pencarian kata persis (nomor arsip, kode klasifikasi, nama).
-- HNSW dibuat sebagai indeks parsial: Prisma tidak memodelkan indeks parsial sehingga tidak dianggap drift.
-- Query vektor wajib menyertakan `WHERE embedding IS NOT NULL` agar indeks ini terpakai.
CREATE INDEX "ai_chunks_embedding_hnsw_idx" ON "ai_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX "ai_chunks_fts_idx" ON "ai_chunks" USING gin (to_tsvector('simple', "title" || ' ' || "content"));
