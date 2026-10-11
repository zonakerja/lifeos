-- AlterTable
ALTER TABLE "schedules" ADD COLUMN     "project_id" TEXT;

-- CreateIndex
CREATE INDEX "schedules_user_id_project_id_idx" ON "schedules"("user_id", "project_id");

-- Data: projectId agenda sebelumnya tersimpan di kolom extra → pindah ke kolom bertipe
UPDATE "schedules"
SET "project_id" = "extra"->>'projectId', "extra" = "extra" - 'projectId'
WHERE "extra" ? 'projectId';
