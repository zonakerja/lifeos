import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TagInputProps {
  id?: string;
  value: string[];
  /** Menambah satu tag dari teks masukan; pemakai yang merapikan & mencegah duplikat */
  onAdd: (input: string) => void;
  onRemove: (tag: string) => void;
  /** Saran tag yang sudah pernah dipakai (ditampilkan lewat datalist bawaan browser) */
  suggestions?: string[];
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

/**
 * Input tag bebas: ketik lalu Enter / koma / tombol + untuk menambah, Backspace pada input kosong menghapus tag
 * terakhir, klik × pada chip untuk menghapus. Saran memakai `<datalist>` agar ringan dan berfungsi di layar sentuh.
 */
export function TagInput({
  id,
  value,
  onAdd,
  onRemove,
  suggestions = [],
  placeholder = "Ketik tag lalu Enter...",
  maxLength,
  disabled,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const available = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

  const commit = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} className="gap-1 bg-module-soft pr-1 text-module">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  title={`Hapus tag ${tag}`}
                  className="rounded-sm opacity-70 hover:opacity-100"
                  onClick={() => onRemove(tag)}
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            id={id}
            list={available.length ? listId : undefined}
            value={draft}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => {
              // Koma memisahkan tag (mis. menempel "SOP, Regulasi")
              const text = e.target.value;
              if (!text.includes(",")) return setDraft(text);
              const parts = text.split(",");
              parts.slice(0, -1).forEach((part) => part.trim() && onAdd(part));
              setDraft(parts.at(-1) ?? "");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // jangan mengirim form
                commit();
              } else if (e.key === "Backspace" && !draft && value.length) onRemove(value[value.length - 1]);
            }}
          />
          <Button type="button" variant="secondary" size="icon" title="Tambah tag" onClick={commit}>
            <Plus />
          </Button>
          {available.length > 0 && (
            <datalist id={listId}>
              {available.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </div>
      )}
    </div>
  );
}
