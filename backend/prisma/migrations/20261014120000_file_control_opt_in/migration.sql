-- File Control kini opt-in: hanya resource berkas dengan archival_status (pending/physical/digital) yang dikelola.
-- Sebelumnya semua resource berkas otomatis tampil di Gantung (status kosong dianggap pending) → resource berkas lama
-- ditandai "pending" agar tetap berada di File Control. Termasuk baris terhapus (soft delete) agar pemulihannya konsisten.
UPDATE "resources"
SET "archival_status" = 'pending'
WHERE lower("type") = 'file' AND "archival_status" IS NULL;

-- Resource berkas yang diarsipkan di PARA (snapshot di kolom data) diperlakukan sama.
UPDATE "para_archives"
SET "data" = jsonb_set("data", '{archivalStatus}', '"pending"')
WHERE lower("original_type") = 'resource'
  AND lower("data"->>'type') = 'file'
  AND ("data"->>'archivalStatus') IS NULL;
