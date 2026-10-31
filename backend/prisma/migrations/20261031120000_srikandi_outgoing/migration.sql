-- CreateTable
CREATE TABLE "srikandi_outgoings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "form_type" TEXT,
    "subject" TEXT,
    "number" TEXT,
    "status" TEXT,
    "upload_id" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "letter_id" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "srikandi_outgoings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "srikandi_outgoings_user_id_deleted_at_idx" ON "srikandi_outgoings"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "srikandi_outgoings_user_id_status_idx" ON "srikandi_outgoings"("user_id", "status");

-- CreateIndex
CREATE INDEX "srikandi_outgoings_user_id_letter_id_idx" ON "srikandi_outgoings"("user_id", "letter_id");

-- CreateIndex
CREATE UNIQUE INDEX "srikandi_outgoings_user_id_client_id_key" ON "srikandi_outgoings"("user_id", "client_id");

-- AddForeignKey
ALTER TABLE "srikandi_outgoings" ADD CONSTRAINT "srikandi_outgoings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

