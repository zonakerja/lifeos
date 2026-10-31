-- CreateTable
CREATE TABLE "public_vaults" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entry_id" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_access_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_vault_files" (
    "id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_vault_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_vault_accesses" (
    "id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "file_name" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "network" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_vault_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "public_vaults_token_hash_key" ON "public_vaults"("token_hash");

-- CreateIndex
CREATE INDEX "public_vaults_user_id_idx" ON "public_vaults"("user_id");

-- CreateIndex
CREATE INDEX "public_vaults_entry_id_idx" ON "public_vaults"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_vault_files_vault_id_asset_id_key" ON "public_vault_files"("vault_id", "asset_id");

-- CreateIndex
CREATE INDEX "public_vault_accesses_vault_id_at_idx" ON "public_vault_accesses"("vault_id", "at");

-- AddForeignKey
ALTER TABLE "public_vaults" ADD CONSTRAINT "public_vaults_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_vault_files" ADD CONSTRAINT "public_vault_files_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public_vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_vault_files" ADD CONSTRAINT "public_vault_files_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_vault_accesses" ADD CONSTRAINT "public_vault_accesses_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public_vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

