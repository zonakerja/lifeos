import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/common/search-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useIconSuggestion } from "@/lib/icons/icon-ai";
import { getAppIcon, ICON_CATEGORIES, type IconCategory, searchIcons } from "@/lib/icons/icon-registry";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  /** Key ikon terpilih (lihat `lib/icons/icon-registry.ts`) */
  value?: string | null;
  onChange: (key: string) => void;
  /**
   * Teks yang diberi ikon (mis. nama tipe agenda). Bila diisi, tombol "Sarankan dengan AI" tersedia di dialog.
   */
  aiSubject?: string;
  /** Untuk apa ikon dipakai, dikirim ke AI (mis. "tipe agenda di Planner") */
  aiContext?: string;
  /** Kelas warna kotak ikon pada tombol (mis. warna tipe agenda) */
  iconClassName?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Tombol pemilih ikon: menampilkan ikon terpilih, klik → dialog berisi pencarian, kategori, dan (opsional) saran AI.
 * Ikon disimpan sebagai key string sehingga dapat dipakai fitur mana pun.
 */
export function IconPicker({
  value,
  onChange,
  aiSubject,
  aiContext = "item di aplikasi produktivitas",
  iconClassName,
  disabled,
  className,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const current = getAppIcon(value);
  const Icon = current.icon;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className={cn("h-9 gap-2 px-2", className)}
        onClick={() => setOpen(true)}
        title="Pilih ikon"
      >
        <span
          className={cn("flex size-6 items-center justify-center rounded-md bg-module-soft text-module", iconClassName)}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="text-xs">{current.label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </Button>
      <IconPickerDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        aiSubject={aiSubject}
        aiContext={aiContext}
        onSelect={(key) => {
          onChange(key);
          setOpen(false);
        }}
      />
    </>
  );
}

interface IconPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value?: string | null;
  onSelect: (key: string) => void;
  aiSubject?: string;
  aiContext: string;
}

export function IconPickerDialog({ open, onOpenChange, ...props }: IconPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pilih Ikon</DialogTitle>
          <DialogDescription>
            Cari berdasarkan nama atau kata kunci (mis. "rapat", "dinas", "olahraga").
          </DialogDescription>
        </DialogHeader>
        {/* Di-mount ulang setiap dibuka → pencarian & saran mulai kosong */}
        {open && <IconPickerBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function IconPickerBody({
  value,
  onSelect,
  aiSubject,
  aiContext,
}: Omit<IconPickerDialogProps, "open" | "onOpenChange">) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<IconCategory | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const ai = useIconSuggestion(aiContext);
  const icons = searchIcons(query, category);
  const selectedKey = value ? getAppIcon(value).key : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Cari ikon..." className="md:w-full sm:flex-1" />
        {aiSubject !== undefined && (
          <Button
            type="button"
            variant="secondary"
            className="bg-module-soft text-module hover:bg-module/15"
            disabled={ai.loading || !aiSubject.trim()}
            title={ai.isConfigured ? `Sarankan ikon untuk "${aiSubject}"` : "AI belum diatur di Pengaturan → AI"}
            onClick={async () => setSuggestions(await ai.suggest(aiSubject))}
          >
            {ai.loading ? <Spinner /> : <Sparkles />} Sarankan dengan AI
          </Button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-module/30 bg-module-soft/50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-module">
            <Sparkles className="size-3.5" /> Saran AI untuk "{aiSubject}"
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((key) => (
              <IconTile key={key} iconKey={key} selected={key === selectedKey} onSelect={onSelect} showLabel />
            ))}
          </div>
        </div>
      )}

      <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1">
        <CategoryChip active={category === null} onClick={() => setCategory(null)}>
          Semua
        </CategoryChip>
        {ICON_CATEGORIES.map((c) => (
          <CategoryChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.label}
          </CategoryChip>
        ))}
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {icons.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground italic">Tidak ada ikon yang cocok.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
            {icons.map((icon) => (
              <IconTile
                key={icon.key}
                iconKey={icon.key}
                selected={icon.key === selectedKey}
                onSelect={onSelect}
                showLabel
              />
            ))}
          </div>
        )}
      </div>
      <p className="text-right text-[11px] text-muted-foreground">{icons.length} ikon</p>
    </div>
  );
}

function IconTile({
  iconKey,
  selected,
  onSelect,
  showLabel,
}: {
  iconKey: string;
  selected: boolean;
  onSelect: (key: string) => void;
  showLabel?: boolean;
}) {
  const { icon: Icon, label } = getAppIcon(iconKey);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(iconKey)}
      className={cn(
        "relative flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors",
        selected
          ? "border-module bg-module text-module-foreground"
          : "bg-card hover:border-module/40 hover:bg-module-soft",
      )}
    >
      <Icon className="size-5" />
      {showLabel && <span className="line-clamp-1 w-full text-[10px] font-medium">{label}</span>}
      {selected && <Check className="absolute top-1 right-1 size-3" />}
    </button>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-module bg-module text-module-foreground"
          : "bg-card text-muted-foreground hover:bg-module-soft",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Tombol cepat: minta AI memilih ikon terbaik untuk `subject` lalu langsung memakainya (tanpa membuka dialog).
 * Untuk melihat beberapa saran sekaligus, pakai "Sarankan dengan AI" di dialog `IconPicker`.
 */
export function AiIconButton({
  subject,
  context = "item di aplikasi produktivitas",
  onPick,
  disabled,
}: {
  subject: string;
  context?: string;
  onPick: (key: string) => void;
  disabled?: boolean;
}) {
  const ai = useIconSuggestion(context);
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="shrink-0 bg-module-soft text-module hover:bg-module/15"
      disabled={disabled || ai.loading || !subject.trim()}
      title={ai.isConfigured ? "Pilih ikon otomatis dengan AI" : "AI belum diatur di Pengaturan → AI"}
      aria-label="Pilih ikon dengan AI"
      onClick={async () => {
        const [best] = await ai.suggest(subject);
        if (best) {
          onPick(best);
          toast.success(`Ikon dipilih AI: ${getAppIcon(best).label}`);
        }
      }}
    >
      {ai.loading ? <Spinner /> : <Sparkles />}
    </Button>
  );
}
