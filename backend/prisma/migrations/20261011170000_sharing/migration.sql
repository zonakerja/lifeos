-- Isolasi data & berbagi: role viewer dihapus (akun viewer menjadi member; hak baca-saja kini per item lewat
-- berbagi), tabel shares + record_comments, pengunggah aset.
UPDATE "users" SET "role" = 'member' WHERE "role" = 'viewer';

-- CreateEnum
CREATE TYPE "share_permission" AS ENUM ('view', 'comment', 'edit');

-- AlterEnum
BEGIN;
CREATE TYPE "user_role_new" AS ENUM ('super_admin', 'admin', 'member');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_new" USING ("role"::text::"user_role_new");
ALTER TYPE "user_role" RENAME TO "user_role_old";
ALTER TYPE "user_role_new" RENAME TO "user_role";
DROP TYPE "public"."user_role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member';
COMMIT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "uploaded_by_id" TEXT;

-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "permission" "share_permission" NOT NULL DEFAULT 'view',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_comments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "record_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shares_recipient_id_idx" ON "shares"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "shares_owner_id_record_type_record_id_recipient_id_key" ON "shares"("owner_id", "record_type", "record_id", "recipient_id");

-- CreateIndex
CREATE INDEX "record_comments_owner_id_record_type_record_id_created_at_idx" ON "record_comments"("owner_id", "record_type", "record_id", "created_at");

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

