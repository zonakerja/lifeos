-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "draft_id" TEXT;

-- CreateIndex
CREATE INDEX "assets_draft_id_idx" ON "assets"("draft_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

