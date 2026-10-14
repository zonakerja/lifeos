import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Tombol impor CSV berpemisah pipa `|` (baris pertama = header, dilewati).
 * `parseRow` mengembalikan null untuk baris yang kolomnya kurang. Baris yang kuncinya (`keyOf`) sudah ada di
 * `existingKeys` atau muncul dua kali di berkas dilewati agar impor ulang tidak membuat data kembar.
 */
export function CsvImportButton<T>({
  parseRow,
  onImport,
  entityLabel,
  keyOf,
  existingKeys,
}: {
  parseRow: (cols: string[]) => T | null;
  onImport: (items: T[]) => void;
  entityLabel: string;
  keyOf: (item: T) => string;
  existingKeys: Iterable<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const lines = (await file.text()).split("\n");
      const rows = lines
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => parseRow(line.split("|").map((c) => c.trim())))
        .filter((item): item is T => item !== null);
      const seen = new Set(existingKeys);
      const items = rows.filter((item) => {
        const key = keyOf(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (items.length > 0) onImport(items);
      const skipped = rows.length - items.length;
      const message = `Berhasil mengimpor ${items.length} data ${entityLabel}.`;
      if (skipped > 0) toast.warning(`${message} ${skipped} baris dilewati karena sudah ada (duplikat).`);
      else toast.success(message);
    } catch {
      toast.error("Gagal membaca file CSV. Pastikan format delimiter menggunakan Pipe '|'.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        variant="outline"
        className="border-dashed"
        disabled={importing}
        onClick={() => inputRef.current?.click()}
      >
        {importing ? <Spinner /> : <Upload />} Import CSV (|)
      </Button>
    </>
  );
}
