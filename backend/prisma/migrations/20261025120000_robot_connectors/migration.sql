-- Konektor robot SRIKANDI & e-Kinerja (tahap 6 AI Agent): sesi browser terenkripsi, log run, tautan publik berkas.
-- CreateTable
CREATE TABLE "robot_connectors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "extra_hosts" JSONB NOT NULL DEFAULT '[]',
    "login_markers" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'none',
    "session_enc" TEXT,
    "last_login_at" TIMESTAMPTZ(3),
    "last_check_at" TIMESTAMPTZ(3),
    "last_url" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "robot_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "robot_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "note" TEXT,
    "aria" TEXT,
    "screenshot_key" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "robot_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "label" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_access_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "robot_connectors_user_id_system_key" ON "robot_connectors"("user_id", "system");

-- CreateIndex
CREATE INDEX "robot_runs_user_id_created_at_idx" ON "robot_runs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "public_links_token_hash_key" ON "public_links"("token_hash");

-- CreateIndex
CREATE INDEX "public_links_asset_id_idx" ON "public_links"("asset_id");

-- AddForeignKey
ALTER TABLE "robot_connectors" ADD CONSTRAINT "robot_connectors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "robot_runs" ADD CONSTRAINT "robot_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "robot_runs" ADD CONSTRAINT "robot_runs_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "robot_connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_links" ADD CONSTRAINT "public_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_links" ADD CONSTRAINT "public_links_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

