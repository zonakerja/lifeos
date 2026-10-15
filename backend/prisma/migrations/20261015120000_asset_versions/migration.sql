-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "office_key" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "version_author_id" TEXT,
ADD COLUMN     "versioned_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "asset_versions" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "author_id" TEXT,
    "session_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_versions_object_key_key" ON "asset_versions"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "asset_versions_asset_id_version_key" ON "asset_versions"("asset_id", "version");

-- AddForeignKey
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

