-- AlterTable
ALTER TABLE "action_plan_entries" ADD COLUMN     "skp_id" TEXT;

-- AlterTable
ALTER TABLE "skp_targets" ADD COLUMN     "indicators" JSONB,
ADD COLUMN     "leader" TEXT,
ADD COLUMN     "section" TEXT,
ADD COLUMN     "skp_id" TEXT;

-- CreateTable
CREATE TABLE "skps" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "external_id" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "status" TEXT,
    "approach" TEXT,
    "appraiser" TEXT,
    "synced_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "skps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skps_user_id_deleted_at_idx" ON "skps"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "skps_user_id_start_date_idx" ON "skps"("user_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "skps_user_id_client_id_key" ON "skps"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "skp_targets_user_id_skp_id_idx" ON "skp_targets"("user_id", "skp_id");

-- AddForeignKey
ALTER TABLE "skps" ADD CONSTRAINT "skps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

