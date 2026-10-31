-- Brankas kredensial konektor robot (SRIKANDI, e-Kinerja): nama pengguna & kata sandi terenkripsi AES-256-GCM.
-- AlterTable
ALTER TABLE "robot_connectors" ADD COLUMN     "credential_hint" TEXT,
ADD COLUMN     "credentials_updated_at" TIMESTAMPTZ(3),
ADD COLUMN     "password_enc" TEXT,
ADD COLUMN     "username_enc" TEXT;

