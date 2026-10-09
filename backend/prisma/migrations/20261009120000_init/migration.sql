-- Skema awal LifeOS (baseline). Dibuat dari prisma/schema.prisma.

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('super_admin', 'admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('uploaded', 'queued', 'extracting', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "asset_extraction_status" AS ENUM ('pending', 'extracting', 'completed', 'unsupported', 'failed');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('created', 'updated', 'deleted');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'member',
    "phone" TEXT,
    "address" TEXT,
    "api_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "name" TEXT NOT NULL DEFAULT 'LifeOS',
    "nav_sub" TEXT NOT NULL DEFAULT 'Integrated Edition',
    "login_sub" TEXT NOT NULL DEFAULT 'Ultimate',
    "motto" TEXT NOT NULL DEFAULT 'Design Your Life, Manage Your Resources',
    "welcome_title" TEXT NOT NULL DEFAULT 'Selamat Datang',
    "welcome_sub" TEXT NOT NULL DEFAULT 'Silakan masuk menggunakan User ID dan Password Anda.',
    "footer_text" TEXT NOT NULL DEFAULT '© 2026 LifeOS System',
    "app_logo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "asset_status" NOT NULL DEFAULT 'uploaded',
    "source" TEXT NOT NULL DEFAULT 'upload',
    "context" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_extractions" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "status" "asset_extraction_status" NOT NULL DEFAULT 'pending',
    "extracted_text" TEXT,
    "summary" TEXT,
    "metadata" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "audit_action" NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archive_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_types" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT,
    "order" INTEGER,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "agenda_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "date" DATE,
    "start_time" TEXT,
    "end_time" TEXT,
    "time" TEXT,
    "is_all_day" BOOLEAN,
    "type" TEXT,
    "location" TEXT,
    "media" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "frequency" TEXT,
    "days" JSONB,
    "interval" INTEGER,
    "interval_type" TEXT,
    "month_dates" JSONB,
    "start_date" DATE,
    "active" BOOLEAN,
    "archived" BOOLEAN,
    "freeze_periods" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "completed" BOOLEAN,
    "date" DATE,
    "priority" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_completions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "routine_id" TEXT,
    "date" DATE,
    "actual_date" DATE,
    "note" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "routine_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "color" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "free_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "date" DATE,
    "linked_schedule_id" TEXT,
    "content" TEXT,
    "ai_summary" TEXT,
    "audio_transcript" TEXT,
    "file_context" TEXT,
    "has_audio" BOOLEAN,
    "audio_upload_id" TEXT,
    "file_attachment" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_lists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "archived" BOOLEAN,
    "items" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "note_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "color" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "area_id" TEXT,
    "start_date" DATE,
    "deadline" DATE,
    "status" TEXT,
    "progress" DOUBLE PRECISION,
    "linked_notes" JSONB,
    "resources" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "area_id" TEXT,
    "deadline" DATE,
    "status" TEXT,
    "resources" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT,
    "description" TEXT,
    "due_date" DATE,
    "priority" TEXT,
    "weight" DOUBLE PRECISION,
    "completed" BOOLEAN,
    "completed_at" TIMESTAMPTZ(3),
    "type" TEXT,
    "resources" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "number" TEXT,
    "title" TEXT,
    "description" TEXT,
    "content" TEXT,
    "type" TEXT,
    "url" TEXT,
    "upload_id" TEXT,
    "mime_type" TEXT,
    "note_id" TEXT,
    "date" DATE,
    "tags" JSONB,
    "source_tag" TEXT,
    "ai_summary" TEXT,
    "archival_status" TEXT,
    "archive_reg_id" TEXT,
    "classification_id" TEXT,
    "jra_id" TEXT,
    "retention_active_date" DATE,
    "retention_inactive_date" DATE,
    "status" TEXT,
    "is_vital" BOOLEAN,
    "is_auto_dispose" BOOLEAN,
    "phys_location_id" TEXT,
    "phys_rack_id" TEXT,
    "phys_box_id" TEXT,
    "phys_folder_id" TEXT,
    "digital_app" TEXT,
    "digital_link" TEXT,
    "notes" TEXT,
    "disposition_data" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "para_archives" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "original_type" TEXT,
    "original_id" TEXT,
    "data" JSONB,
    "archived_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "para_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_classifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "jenis" TEXT,
    "kode_pokok" TEXT,
    "nama_pokok" TEXT,
    "kode_sub" TEXT,
    "nama_sub" TEXT,
    "kode_item" TEXT,
    "nama_item" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "archive_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_retention_schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "kategori_utama" TEXT,
    "sub_kategori" TEXT,
    "jenis_arsip" TEXT,
    "retensi_aktif" INTEGER,
    "retensi_inaktif" INTEGER,
    "keterangan" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "archive_retention_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_locations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT,
    "parent_id" TEXT,
    "code" TEXT,
    "name" TEXT,
    "description" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "archive_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_borrowings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "date" DATE,
    "return_date" DATE,
    "borrower_name" TEXT,
    "unit" TEXT,
    "purpose" TEXT,
    "items" JSONB,
    "status" TEXT,
    "pic" TEXT,
    "returned_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "archive_borrowings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_dispositions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT,
    "status_label" TEXT,
    "executed_at" TIMESTAMPTZ(3),
    "form_data" JSONB,
    "items" JSONB,
    "executed_by" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "archive_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_move_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3),
    "items_count" INTEGER,
    "target_name" TEXT,
    "performed_by" TEXT,
    "description" TEXT,
    "moved_items" JSONB,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "archive_move_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "assets_object_key_key" ON "assets"("object_key");

-- CreateIndex
CREATE INDEX "assets_user_id_status_idx" ON "assets"("user_id", "status");

-- CreateIndex
CREATE INDEX "assets_user_id_created_at_idx" ON "assets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "assets_checksum_idx" ON "assets"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "asset_extractions_asset_id_key" ON "asset_extractions"("asset_id");

-- CreateIndex
CREATE INDEX "asset_extractions_status_idx" ON "asset_extractions"("status");

-- CreateIndex
CREATE INDEX "archive_audit_logs_user_id_entity_type_entity_id_idx" ON "archive_audit_logs"("user_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "archive_audit_logs_created_at_idx" ON "archive_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "agenda_types_user_id_deleted_at_idx" ON "agenda_types"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_types_user_id_client_id_key" ON "agenda_types"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "schedules_user_id_deleted_at_idx" ON "schedules"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "schedules_user_id_start_date_idx" ON "schedules"("user_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_user_id_client_id_key" ON "schedules"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "routines_user_id_deleted_at_idx" ON "routines"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "routines_user_id_client_id_key" ON "routines"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "todos_user_id_deleted_at_idx" ON "todos"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "todos_user_id_date_idx" ON "todos"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "todos_user_id_client_id_key" ON "todos"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "routine_completions_user_id_deleted_at_idx" ON "routine_completions"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "routine_completions_user_id_routine_id_date_idx" ON "routine_completions"("user_id", "routine_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "routine_completions_user_id_client_id_key" ON "routine_completions"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "free_notes_user_id_deleted_at_idx" ON "free_notes"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "free_notes_user_id_client_id_key" ON "free_notes"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "ai_notes_user_id_deleted_at_idx" ON "ai_notes"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "ai_notes_user_id_date_idx" ON "ai_notes"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ai_notes_user_id_client_id_key" ON "ai_notes"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "note_lists_user_id_deleted_at_idx" ON "note_lists"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "note_lists_user_id_client_id_key" ON "note_lists"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "areas_user_id_deleted_at_idx" ON "areas"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "areas_user_id_client_id_key" ON "areas"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "projects_user_id_deleted_at_idx" ON "projects"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "projects_user_id_area_id_idx" ON "projects"("user_id", "area_id");

-- CreateIndex
CREATE INDEX "projects_user_id_status_idx" ON "projects"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_user_id_client_id_key" ON "projects"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "activities_user_id_deleted_at_idx" ON "activities"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "activities_user_id_area_id_idx" ON "activities"("user_id", "area_id");

-- CreateIndex
CREATE UNIQUE INDEX "activities_user_id_client_id_key" ON "activities"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "tasks_user_id_deleted_at_idx" ON "tasks"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "tasks_user_id_project_id_idx" ON "tasks"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks"("user_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_user_id_client_id_key" ON "tasks"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "resources_user_id_deleted_at_idx" ON "resources"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "resources_user_id_type_idx" ON "resources"("user_id", "type");

-- CreateIndex
CREATE INDEX "resources_user_id_archival_status_idx" ON "resources"("user_id", "archival_status");

-- CreateIndex
CREATE INDEX "resources_user_id_archive_reg_id_idx" ON "resources"("user_id", "archive_reg_id");

-- CreateIndex
CREATE UNIQUE INDEX "resources_user_id_client_id_key" ON "resources"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "para_archives_user_id_deleted_at_idx" ON "para_archives"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "para_archives_user_id_original_type_idx" ON "para_archives"("user_id", "original_type");

-- CreateIndex
CREATE UNIQUE INDEX "para_archives_user_id_client_id_key" ON "para_archives"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "archive_classifications_user_id_deleted_at_idx" ON "archive_classifications"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "archive_classifications_user_id_kode_pokok_kode_sub_kode_it_idx" ON "archive_classifications"("user_id", "kode_pokok", "kode_sub", "kode_item");

-- CreateIndex
CREATE UNIQUE INDEX "archive_classifications_user_id_client_id_key" ON "archive_classifications"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "archive_retention_schedules_user_id_deleted_at_idx" ON "archive_retention_schedules"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "archive_retention_schedules_user_id_client_id_key" ON "archive_retention_schedules"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "archive_locations_user_id_deleted_at_idx" ON "archive_locations"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "archive_locations_user_id_parent_id_idx" ON "archive_locations"("user_id", "parent_id");

-- CreateIndex
CREATE INDEX "archive_locations_user_id_type_idx" ON "archive_locations"("user_id", "type");

-- CreateIndex
CREATE INDEX "archive_locations_user_id_code_idx" ON "archive_locations"("user_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "archive_locations_user_id_client_id_key" ON "archive_locations"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "archive_borrowings_user_id_deleted_at_idx" ON "archive_borrowings"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "archive_borrowings_user_id_status_idx" ON "archive_borrowings"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "archive_borrowings_user_id_client_id_key" ON "archive_borrowings"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "archive_dispositions_user_id_deleted_at_idx" ON "archive_dispositions"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "archive_dispositions_user_id_executed_at_idx" ON "archive_dispositions"("user_id", "executed_at");

-- CreateIndex
CREATE UNIQUE INDEX "archive_dispositions_user_id_client_id_key" ON "archive_dispositions"("user_id", "client_id");

-- CreateIndex
CREATE INDEX "archive_move_logs_user_id_deleted_at_idx" ON "archive_move_logs"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "archive_move_logs_user_id_date_idx" ON "archive_move_logs"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "archive_move_logs_user_id_client_id_key" ON "archive_move_logs"("user_id", "client_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_extractions" ADD CONSTRAINT "asset_extractions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_audit_logs" ADD CONSTRAINT "archive_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_types" ADD CONSTRAINT "agenda_types_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_completions" ADD CONSTRAINT "routine_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_notes" ADD CONSTRAINT "free_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_notes" ADD CONSTRAINT "ai_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_lists" ADD CONSTRAINT "note_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "para_archives" ADD CONSTRAINT "para_archives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_classifications" ADD CONSTRAINT "archive_classifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_retention_schedules" ADD CONSTRAINT "archive_retention_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_locations" ADD CONSTRAINT "archive_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_borrowings" ADD CONSTRAINT "archive_borrowings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_dispositions" ADD CONSTRAINT "archive_dispositions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_move_logs" ADD CONSTRAINT "archive_move_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

