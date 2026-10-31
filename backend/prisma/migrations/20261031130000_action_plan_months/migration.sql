-- CreateTable
CREATE TABLE "action_plan_months" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "period" TEXT,
    "skp_id" TEXT,
    "status" TEXT,
    "submitted_at" DATE,
    "synced_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "action_plan_months_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_plan_months_user_id_deleted_at_idx" ON "action_plan_months"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "action_plan_months_user_id_period_idx" ON "action_plan_months"("user_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "action_plan_months_user_id_client_id_key" ON "action_plan_months"("user_id", "client_id");

-- AddForeignKey
ALTER TABLE "action_plan_months" ADD CONSTRAINT "action_plan_months_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

