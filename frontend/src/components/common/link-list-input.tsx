import { Link2, Plus, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { toExternalHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

interface LinkListInputProps {
  id?: string;
  value: string[];
  onChange: (links: string[]) => void;
  placeholder?: string;
  /** Teks yang sedang diketik (belum ditambahkan) — diangkat ke induk agar ikut tersimpan saat form disubmit */
  draft: string;
  onDraftChange: (draft: string) => void;
}

/** Host ringkas sebuah link untuk label (tanpa "www."). */
const hostOf = (link: string) => {
  const href = toExternalHref(link);
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * Input beberapa link: ketik/tempel lalu **Enter** (atau tombol +) untuk menambah; setiap link tampil sebagai baris rapi
 * dengan host sebagai label dan tombol hapus. Menempel beberapa link sekaligus (dipisah baris/spasi) ikut dipecah.
 */
export function LinkListInput({
  id,
  value,
  onChange,
  placeholder = "Tempel link lalu tekan Enter",
  draft,
  onDraftChange,
}: LinkListInputProps) {
  const [focused, setFocused] = useState(false);

  const add = () => {
    const parts = draft
      .split(/[\s\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    onDraftChange("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Enter menambah link, bukan mengirim form
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {value.map((link, i) => {
            const host = hostOf(link);
            return (
              <li
                key={`${link}-${i}`}
                className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-2.5 text-sm"
              >
                <Link2 className={cn("size-3.5 shrink-0", host ? "text-info" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1 truncate" title={link}>
                  {host && <span className="mr-1.5 font-semibold">{host}</span>}
                  <span className="text-xs text-muted-foreground">{link}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Hapus link ${link}`}
                  title="Hapus link"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <InputGroup>
        <InputGroupAddon>
          <Link2 />
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          placeholder={value.length ? "Tambah link lain…" : placeholder}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {draft.trim() && (
          <InputGroupAddon align="inline-end">
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Tambah link" onClick={add}>
              <Plus />
            </Button>
          </InputGroupAddon>
        )}
      </InputGroup>
      {focused && draft.trim() && (
        <p className="text-[11px] text-muted-foreground">Tekan Enter untuk menambahkan link ini.</p>
      )}
    </div>
  );
}
