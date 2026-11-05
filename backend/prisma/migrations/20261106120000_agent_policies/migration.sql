-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "asset_check" JSONB,
ADD COLUMN     "auto_decision" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "agent_auto_paused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "agent_policies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "request_kind" TEXT NOT NULL,
    "group_codes" JSONB NOT NULL DEFAULT '[]',
    "mode" TEXT NOT NULL DEFAULT 'shadow',
    "threshold" INTEGER NOT NULL DEFAULT 75,
    "critical_fields" JSONB NOT NULL DEFAULT '["nup","kodeBarang"]',
    "value_tolerance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daily_limit" INTEGER NOT NULL DEFAULT 5,
    "hold_minutes" INTEGER NOT NULL DEFAULT 15,
    "register_template" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hermes_run_id" TEXT,
    "kind" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "skill" TEXT,
    "request_id" TEXT,
    "policy_id" TEXT,
    "input" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_policies_user_id_idx" ON "agent_policies"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_hermes_run_id_key" ON "agent_runs"("hermes_run_id");

-- CreateIndex
CREATE INDEX "agent_runs_user_id_created_at_idx" ON "agent_runs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- AddForeignKey
ALTER TABLE "agent_policies" ADD CONSTRAINT "agent_policies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

