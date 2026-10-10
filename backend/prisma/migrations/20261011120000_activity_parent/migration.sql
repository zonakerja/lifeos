-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "parent_id" TEXT;

-- CreateIndex
CREATE INDEX "activities_user_id_parent_id_idx" ON "activities"("user_id", "parent_id");

