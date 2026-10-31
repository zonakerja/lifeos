-- CreateTable
CREATE TABLE "skp_targets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "year" INTEGER,
    "name" TEXT,
    "order" INTEGER,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "skp_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_plan_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "period" TEXT,
    "target_id" TEXT,
    "description" TEXT,
    "document_url" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "source_title" TEXT,
    "status" TEXT,
    "filled_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "action_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skp_targets_user_id_deleted_at_idx" ON "skp_targets"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "skp_targets_user_id_year_idx" ON "skp_targets"("user_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "skp_targets_user_id_client_id_key" ON "skp_targets"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "action_plan_entries_user_id_deleted_at_idx" ON "action_plan_entries"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "action_plan_entries_user_id_period_idx" ON "action_plan_entries"("user_id", "period");

-- CreateIndex
CREATE INDEX "action_plan_entries_user_id_source_id_idx" ON "action_plan_entries"("user_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "action_plan_entries_user_id_client_id_key" ON "action_plan_entries"("user_id", "client_id");

-- AddForeignKey
ALTER TABLE "skp_targets" ADD CONSTRAINT "skp_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_plan_entries" ADD CONSTRAINT "action_plan_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

