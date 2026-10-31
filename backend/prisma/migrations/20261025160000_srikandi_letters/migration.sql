-- CreateTable
CREATE TABLE "srikandi_letters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "number" TEXT,
    "date" DATE,
    "subject" TEXT,
    "origin" TEXT,
    "sign_status" TEXT,
    "send_status" TEXT,
    "upload_id" TEXT,
    "imported_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "srikandi_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "srikandi_letters_user_id_deleted_at_idx" ON "srikandi_letters"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "srikandi_letters_user_id_date_idx" ON "srikandi_letters"("user_id", "date");

-- CreateIndex
CREATE INDEX "srikandi_letters_user_id_number_idx" ON "srikandi_letters"("user_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "srikandi_letters_user_id_client_id_key" ON "srikandi_letters"("user_id", "client_id");

-- AddForeignKey
ALTER TABLE "srikandi_letters" ADD CONSTRAINT "srikandi_letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

