-- CreateTable
CREATE TABLE "knowledge_note_versions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_note_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_note_versions_user_id_path_created_at_idx" ON "knowledge_note_versions"("user_id", "path", "created_at");

-- AddForeignKey
ALTER TABLE "knowledge_note_versions" ADD CONSTRAINT "knowledge_note_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

