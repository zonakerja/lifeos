-- Sub Area (item area tanpa induk, parent_id NULL) = wadah seperti Area: hanya nama + deskripsi.
-- Tanggal & Dasar Pelaksanaan hanya untuk Kegiatan / Sub Kegiatan → bersihkan sisa data di Sub Area
-- (termasuk nilai yang tersimpan di kolom extra). Kolom tetap ada karena dipakai Kegiatan / Sub Kegiatan.
UPDATE "activities"
SET "deadline" = NULL,
    "resources" = NULL,
    "extra" = "extra" - 'deadline' - 'resources'
WHERE "parent_id" IS NULL
  AND ("deadline" IS NOT NULL OR "resources" IS NOT NULL OR "extra" ? 'deadline' OR "extra" ? 'resources');
