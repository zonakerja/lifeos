-- Basis pengetahuan & chat AI: koleksi/metadata potongan indeks, profil kerja & folder vault user,
-- percakapan chatbot LifeOS (riwayat permanen), catatan & tautan vault Obsidian.
-- AlterTable
ALTER TABLE "ai_chunks" ADD COLUMN     "collection" TEXT NOT NULL DEFAULT 'workspace',
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_profile" TEXT,
ADD COLUMN     "knowledge_vault" TEXT;

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "frontmatter" JSONB,
    "hash" TEXT NOT NULL,
    "asset_id" TEXT,
    "file_mtime" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "to_id" TEXT,
    "kind" TEXT NOT NULL,

    CONSTRAINT "knowledge_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_notes_asset_id_idx" ON "knowledge_notes"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_notes_user_id_path_key" ON "knowledge_notes"("user_id", "path");

-- CreateIndex
CREATE INDEX "knowledge_links_user_id_to_id_idx" ON "knowledge_links"("user_id", "to_id");

-- CreateIndex
CREATE INDEX "knowledge_links_from_id_idx" ON "knowledge_links"("from_id");

-- CreateIndex
CREATE INDEX "ai_chunks_user_id_collection_idx" ON "ai_chunks"("user_id", "collection");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_notes" ADD CONSTRAINT "knowledge_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "knowledge_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "knowledge_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

