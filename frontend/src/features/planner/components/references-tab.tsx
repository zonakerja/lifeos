import { PencilLine, Plus, Tag, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PaginationControl } from "@/components/common/pagination-control";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AiIconButton, IconPicker } from "@/components/common/icon-picker";
import { useSchedules } from "@/data/collections";
import { usePagination } from "@/hooks/use-pagination";
import { usePermissions } from "@/hooks/use-permissions";
import { useRetained } from "@/hooks/use-retained";
import { generateId } from "@/lib/ids";
import { getAppIcon } from "@/lib/icons/icon-registry";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import type { AgendaColor, AgendaType, Schedule } from "@/types/entities";
import { AGENDA_COLORS, defaultAgendaColor, defaultAgendaIcon, resolveAgendaStyle } from "../lib/schedule-style";

/** Konteks yang dikirim ke AI saat memilih ikon tipe agenda. */
const AI_CONTEXT = "tipe/kategori agenda (jadwal kegiatan) di Planner";
import { useAgendaTypeList } from "../use-agenda-types";
import { searchAgendaTypes } from "../lib/planner-search";

/** Agenda yang memakai tipe ini (milik user yang sama; agenda yang dibagikan user lain tidak ikut). */
const usesType = (s: Schedule, type: AgendaType) =>
  s.type === type.name && (!type.userId || !s.userId || s.userId === type.userId);

export function ReferencesTab() {
  const { items: types, setItems } = useAgendaTypeList();
  const { items: schedules, setItems: setSchedules } = useSchedules();
  const { canEdit } = usePermissions();
  const user = useAuthStore((s) => s.user);
  const [newType, setNewType] = useState("");
  // null = ikon default dari nama
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgendaType | null>(null);
  const [deleting, setDeleting] = useState<AgendaType | null>(null);
  const [query, setQuery] = useState("");
  const visibleTypes = searchAgendaTypes(types, query);
  const { pageItems, setPage, controlProps } = usePagination(visibleTypes, 12);

  /** Nama ganda hanya dicek di antara tipe milik pemilik yang sama. */
  const isDuplicate = (name: string, ownerId: string | undefined, exceptId?: string) =>
    types.some(
      (t) =>
        t.id !== exceptId &&
        t.name.toLowerCase() === name.toLowerCase() &&
        (!ownerId || !t.userId || t.userId === ownerId),
    );

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = newType.trim();
    if (!name) return;
    if (isDuplicate(name, user?.id)) {
      toast.error("Tipe sudah ada.");
      return;
    }
    const order = Math.max(-1, ...types.map((t) => t.order ?? 0)) + 1;
    setItems((prev) => [
      ...prev,
      {
        id: generateId("type"),
        name,
        order,
        color: defaultAgendaColor(name),
        icon: newIcon ?? defaultAgendaIcon(name),
      },
    ]);
    setNewType("");
    setNewIcon(null);
  };

  const saveEdit = (next: AgendaType) => {
    const prevType = editing;
    if (!prevType) return;
    if (isDuplicate(next.name, prevType.userId, prevType.id)) {
      toast.error("Tipe sudah ada.");
      return;
    }
    setItems((prev) => prev.map((t) => (t.id === prevType.id ? next : t)));
    // Ganti nama → agenda yang memakai nama lama ikut diperbarui
    if (next.name !== prevType.name) {
      const affected = schedules.filter((s) => usesType(s, prevType)).length;
      if (affected > 0) {
        setSchedules((prev) => prev.map((s) => (usesType(s, prevType) ? { ...s, type: next.name } : s)));
        toast.success(`${affected} agenda ikut diperbarui ke tipe "${next.name}".`);
      }
    }
    setEditing(null);
  };

  const deletingUsage = deleting ? schedules.filter((s) => usesType(s, deleting)).length : 0;

  return (
    <SectionCard icon={Tag} title="Referensi Planner" description="Kelola kategori dan tipe untuk jadwal Anda.">
      <div className="flex flex-col gap-6">
        {canEdit && (
          <form onSubmit={add} className="flex flex-col gap-2 rounded-2xl border bg-muted/40 p-4">
            <span className="text-sm font-semibold">Tambah Tipe Agenda</span>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Contoh: Webinar..."
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="min-w-40 flex-1"
              />
              <IconPicker
                value={newIcon ?? defaultAgendaIcon(newType.trim())}
                onChange={setNewIcon}
                aiSubject={newType}
                aiContext={AI_CONTEXT}
                iconClassName={AGENDA_COLORS[defaultAgendaColor(newType.trim())].badge}
              />
              <AiIconButton subject={newType} context={AI_CONTEXT} onPick={setNewIcon} />
              <Button type="submit">
                <Plus /> Tambah
              </Button>
            </div>
          </form>
        )}

        {types.length > 0 && (
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Cari tipe agenda…"
            className="md:w-72"
          />
        )}
        {query.trim() && visibleTypes.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground italic">
            Tidak ada tipe agenda yang cocok dengan "{query.trim()}".
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {pageItems.map((type) => {
            const style = resolveAgendaStyle(type.name, type);
            const Icon = getAppIcon(style.icon).icon;
            const usage = schedules.filter((s) => usesType(s, type)).length;
            return (
              <div
                key={type.id}
                className="group flex items-center justify-between gap-2 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md"
              >
                <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm",
                      AGENDA_COLORS[style.color].badge,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{type.name}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">{usage} agenda</span>
                  </span>
                </span>
                {canEdit && (
                  <div className="flex gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
                    <Button variant="ghost" size="icon-xs" title="Ubah" onClick={() => setEditing(type)}>
                      <PencilLine />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Hapus"
                      className="hover:text-destructive"
                      onClick={() => setDeleting(type)}
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <PaginationControl {...controlProps} sizes={[12, 24, 48]} />
      </div>

      <AgendaTypeDialog type={editing} onOpenChange={(open) => !open && setEditing(null)} onSave={saveEdit} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Hapus Tipe?"
        description={
          deletingUsage > 0
            ? `Tipe agenda ini dihapus dari pilihan. ${deletingUsage} agenda yang memakainya tetap menyimpan label "${deleting?.name}".`
            : "Tipe agenda ini akan dihapus dari pilihan."
        }
        itemName={deleting?.name}
        confirmLabel="Hapus"
        onConfirm={() => {
          if (deleting) setItems((prev) => prev.filter((t) => t.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </SectionCard>
  );
}

/** Ubah nama, warna, dan ikon tipe agenda. `type` null = tertutup. */
function AgendaTypeDialog({
  type: typeProp,
  onOpenChange,
  onSave,
}: {
  type: AgendaType | null;
  onOpenChange: (open: boolean) => void;
  onSave: (type: AgendaType) => void;
}) {
  const type = useRetained(typeProp);
  return (
    <Dialog open={!!typeProp} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="size-5 text-module" /> Ubah Tipe Agenda
          </DialogTitle>
          <DialogDescription>Mengganti nama juga memperbarui agenda yang memakai tipe ini.</DialogDescription>
        </DialogHeader>
        {type && <AgendaTypeForm key={type.id} type={type} onSave={onSave} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AgendaTypeForm({
  type,
  onSave,
  onCancel,
}: {
  type: AgendaType;
  onSave: (type: AgendaType) => void;
  onCancel: () => void;
}) {
  const initial = resolveAgendaStyle(type.name, type);
  const [name, setName] = useState(type.name);
  const [color, setColor] = useState<AgendaColor>(initial.color);
  const [icon, setIcon] = useState<string>(initial.icon);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ ...type, name: name.trim(), color, icon });
  };

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="agenda-type-name">Nama</FieldLabel>
          <Input id="agenda-type-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Warna</FieldLabel>
          <ToggleGroup
            type="single"
            spacing={2}
            value={color}
            onValueChange={(v) => v && setColor(v as AgendaColor)}
            className="flex-wrap"
          >
            {(Object.keys(AGENDA_COLORS) as AgendaColor[]).map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                aria-label={AGENDA_COLORS[key].label}
                title={AGENDA_COLORS[key].label}
                className="size-9 rounded-full p-0 data-[state=on]:ring-2 data-[state=on]:ring-ring data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-background"
              >
                <span className={cn("size-7 rounded-full", AGENDA_COLORS[key].swatch)} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel>Ikon</FieldLabel>
          <div className="flex gap-2">
            <IconPicker
              value={icon}
              onChange={setIcon}
              aiSubject={name}
              aiContext={AI_CONTEXT}
              iconClassName={AGENDA_COLORS[color].badge}
              className="flex-1 justify-start"
            />
            <AiIconButton subject={name} context={AI_CONTEXT} onPick={setIcon} />
          </div>
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit">Simpan</Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
