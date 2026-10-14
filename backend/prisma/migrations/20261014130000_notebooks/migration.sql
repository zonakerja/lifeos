-- CreateEnum
CREATE TYPE "NotebookSourceKind" AS ENUM ('upload', 'record', 'text', 'web');

-- CreateTable
CREATE TABLE "notebooks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "summary" JSONB,
    "summary_hash" TEXT,
    "summary_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_sources" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "kind" "NotebookSourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "asset_id" TEXT,
    "record_type" TEXT,
    "record_id" TEXT,
    "url" TEXT,
    "content" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notebook_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_messages" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_notes" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notebook_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebooks_user_id_updated_at_idx" ON "notebooks"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "notebook_sources_notebook_id_idx" ON "notebook_sources"("notebook_id");

-- CreateIndex
CREATE INDEX "notebook_messages_notebook_id_created_at_idx" ON "notebook_messages"("notebook_id", "created_at");

-- CreateIndex
CREATE INDEX "notebook_notes_notebook_id_updated_at_idx" ON "notebook_notes"("notebook_id", "updated_at");

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_sources" ADD CONSTRAINT "notebook_sources_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_messages" ADD CONSTRAINT "notebook_messages_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_notes" ADD CONSTRAINT "notebook_notes_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

