-- Bot WhatsApp (tahap 5 AI Agent): grup kontak (satker/instansi/masyarakat/…), kontak terverifikasi, pesan;
-- pengajuan memakai pemohon & kode grup (bukan khusus satker); profil layanan bot per user.
-- AlterTable
-- Data lama dipertahankan: kolom satker → applicant, satker_code → group_code
ALTER TABLE "requests" RENAME COLUMN "satker" TO "applicant";
ALTER TABLE "requests" RENAME COLUMN "satker_code" TO "group_code";
ALTER TABLE "requests" ADD COLUMN     "wa_contact_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "wa_bot" JSONB;

-- CreateTable
CREATE TABLE "contact_groups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'lainnya',
    "notes" TEXT,
    "allow_requests" BOOLEAN NOT NULL DEFAULT true,
    "share_requests" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_contacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "group_id" TEXT,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "last_inbound_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wa_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "wa_message_id" TEXT,
    "status" TEXT NOT NULL,
    "intent" TEXT,
    "request_id" TEXT,
    "citations" JSONB,
    "error" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contact_groups_user_id_code_key" ON "contact_groups"("user_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "wa_contacts_user_id_phone_key" ON "wa_contacts"("user_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "wa_messages_wa_message_id_key" ON "wa_messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "wa_messages_user_id_phone_created_at_idx" ON "wa_messages"("user_id", "phone", "created_at");

-- CreateIndex
CREATE INDEX "wa_messages_user_id_status_idx" ON "wa_messages"("user_id", "status");

-- CreateIndex
CREATE INDEX "requests_wa_contact_id_idx" ON "requests"("wa_contact_id");

-- AddForeignKey
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_contacts" ADD CONSTRAINT "wa_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_contacts" ADD CONSTRAINT "wa_contacts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "contact_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

