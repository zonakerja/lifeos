-- CreateTable
CREATE TABLE "para_archive_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "action" TEXT,
    "original_type" TEXT,
    "original_id" TEXT,
    "archive_id" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "actor_name" TEXT,
    "at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "para_archive_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "para_archive_logs_user_id_deleted_at_idx" ON "para_archive_logs"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "para_archive_logs_user_id_at_idx" ON "para_archive_logs"("user_id", "at");

-- CreateIndex
CREATE INDEX "para_archive_logs_user_id_original_id_idx" ON "para_archive_logs"("user_id", "original_id");

-- CreateIndex
CREATE UNIQUE INDEX "para_archive_logs_user_id_client_id_key" ON "para_archive_logs"("user_id", "client_id");

-- AddForeignKey
ALTER TABLE "para_archive_logs" ADD CONSTRAINT "para_archive_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

