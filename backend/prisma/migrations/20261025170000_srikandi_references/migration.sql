-- CreateTable
CREATE TABLE "srikandi_references" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "category" TEXT,
    "label" TEXT,
    "fields" JSONB,
    "order" INTEGER,
    "synced_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "srikandi_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "srikandi_references_user_id_deleted_at_idx" ON "srikandi_references"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "srikandi_references_user_id_category_idx" ON "srikandi_references"("user_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "srikandi_references_user_id_client_id_key" ON "srikandi_references"("user_id", "client_id");

-- AddForeignKey
ALTER TABLE "srikandi_references" ADD CONSTRAINT "srikandi_references_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

