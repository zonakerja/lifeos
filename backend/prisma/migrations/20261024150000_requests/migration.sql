-- Pengajuan satker & Antrian Verifikasi (tahap 4 AI Agent).
-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "satker" TEXT,
    "satker_code" TEXT,
    "letter_number" TEXT,
    "letter_date" TEXT,
    "subject" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'baru',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "analysis" JSONB,
    "review" TEXT,
    "review_citations" JSONB,
    "draft_reply" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requests_user_id_status_updated_at_idx" ON "requests"("user_id", "status", "updated_at");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

