import { Bot, Pencil, Plus, Trash2, UserRound, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useBotProfile, useContactGroups, useWaContacts, useWhatsappMutations } from "@/data/use-whatsapp";
import { useOpenSession } from "@/hooks/use-retained";
import { errorMessage } from "@/lib/api/client";
import type { ContactGroup, GroupKind, WaBotProfile, WaContact } from "@/types/api";
import { formatPhone, GROUP_KIND_LABELS, groupAccessSummary } from "./whatsapp-utils";

const NO_GROUP = "__none";
const KIND_OPTIONS = Object.entries(GROUP_KIND_LABELS) as [GroupKind, string][];

/**
 * Pengajuan → Grup & Kontak: profil layanan bot, grup kontak (satker, instansi, masyarakat umum, unit layanan, …) beserta
 * hak aksesnya, dan nomor WhatsApp pengguna. Hanya kontak **aktif & terverifikasi** yang dilayani bot; **grup** kontak
 * menentukan data yang boleh diaksesnya (AG-20).
 */
export function ContactsTab() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <ProfileCard />
      <GroupCard />
      <ContactCard />
    </div>
  );
}

function ProfileCard() {
  const { data, isLoading } = useBotProfile();
  return (
    <SectionCard
      icon={Bot}
      title="Profil layanan bot"
      description="Nama layanan yang disebut bot dan topik yang boleh dijawabnya. Pertanyaan di luar topik ditolak sopan."
    >
      {isLoading || !data ? <Skeleton className="h-24" /> : <ProfileForm key={JSON.stringify(data)} value={data} />}
    </SectionCard>
  );
}

function ProfileForm({ value }: { value: WaBotProfile }) {
  const m = useWhatsappMutations();
  const [form, setForm] = useState(value);
  const dirty = form.serviceName !== value.serviceName || form.topic !== value.topic;
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid gap-1">
        <Label htmlFor="bot-name">Nama layanan</Label>
        <Input
          id="bot-name"
          value={form.serviceName}
          onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
          placeholder="mis. Layanan Informasi BMN Kantor X / Layanan Perizinan"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="bot-topic">Topik yang dilayani</Label>
        <Textarea
          id="bot-topic"
          rows={2}
          value={form.topic}
          onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!dirty || m.updateProfile.isPending}
          onClick={() =>
            m.updateProfile.mutate(form, {
              onSuccess: () => toast.success("Profil layanan disimpan."),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          Simpan
        </Button>
      </div>
    </div>
  );
}

function GroupCard() {
  const { data, isLoading } = useContactGroups();
  const m = useWhatsappMutations();
  const [editing, setEditing] = useState<ContactGroup | "new" | null>(null);
  const [removing, setRemoving] = useState<ContactGroup | null>(null);
  return (
    <SectionCard
      icon={UsersRound}
      title="Grup kontak"
      description="Satker, instansi, masyarakat umum, unit layanan, dst. Grup menentukan data yang boleh diakses anggotanya lewat bot."
      action={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Grup
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          Belum ada grup. Kontak tanpa grup hanya bisa bertanya pengetahuan publik dan melihat pengajuannya sendiri.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-1">
          {data.map((g) => (
            <li key={g.id} className="flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <code className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-xs">{g.code}</code>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium">{g.name}</span>
                  <Badge variant="outline">{GROUP_KIND_LABELS[g.kind] ?? g.kind}</Badge>
                  <span className="text-xs text-muted-foreground">{g._count.contacts} kontak</span>
                </span>
                <span className="block text-xs text-muted-foreground">{groupAccessSummary(g)}</span>
              </span>
              <Button size="icon-xs" variant="ghost" aria-label={`Ubah ${g.name}`} onClick={() => setEditing(g)}>
                <Pencil />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Hapus ${g.name}`} onClick={() => setRemoving(g)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Catatan basis pengetahuan khusus grup: tambahkan properti <code>grup: [KODE]</code> di catatan Obsidian. Catatan
        itu hanya dipakai menjawab anggota grup tersebut (selain catatan <code>publik: true</code>).
      </p>
      <GroupDialog value={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Hapus grup?"
        itemName={removing?.name}
        description="Kontak di grup ini tetap ada tetapi tidak lagi punya grup (hanya akses publik & pengajuan sendiri)."
        confirmLabel="Hapus"
        onConfirm={() =>
          removing &&
          m.removeGroup.mutate(removing.id, {
            onSuccess: () => toast.success("Grup dihapus."),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </SectionCard>
  );
}

function GroupDialog({ value, onClose }: { value: ContactGroup | "new" | null; onClose: () => void }) {
  const session = useOpenSession(!!value);
  return (
    <Dialog open={!!value} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{value === "new" ? "Grup baru" : "Ubah grup"}</DialogTitle>
          <DialogDescription>
            Untuk satker pakai kode yang sama dengan aplikasi lain (mis. kode satker SIMAN) agar data mudah dicocokkan.
          </DialogDescription>
        </DialogHeader>
        {value && <GroupForm key={session} value={value} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function GroupForm({ value, onDone }: { value: ContactGroup | "new"; onDone: () => void }) {
  const m = useWhatsappMutations();
  const current = value === "new" ? null : value;
  const [form, setForm] = useState(() => ({
    code: current?.code ?? "",
    name: current?.name ?? "",
    kind: current?.kind ?? ("satker" as GroupKind),
    notes: current?.notes ?? "",
    allowRequests: current?.allowRequests ?? true,
    shareRequests: current?.shareRequests ?? false,
  }));
  const save = () => {
    const input = { ...form, code: form.code.trim(), name: form.name.trim(), notes: form.notes.trim() || undefined };
    const options = {
      onSuccess: () => {
        toast.success("Grup disimpan.");
        onDone();
      },
      onError: (e: unknown) => toast.error(errorMessage(e)),
    };
    if (current) m.updateGroup.mutate({ id: current.id, ...input }, options);
    else m.createGroup.mutate(input, options);
  };
  return (
    <>
      <div className="grid gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
          <div className="grid gap-1">
            <Label htmlFor="group-code">Kode</Label>
            <Input
              id="group-code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="mis. 123456 / UMUM"
            />
          </div>
          <div className="grid gap-1">
            <Label>Jenis</Label>
            <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as GroupKind }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="group-name">Nama</Label>
          <Input id="group-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={form.allowRequests}
            onCheckedChange={(v) => setForm((f) => ({ ...f, allowRequests: v }))}
            className="mt-0.5"
          />
          <span>
            Boleh mengirim berkas pengajuan
            <span className="block text-xs text-muted-foreground">
              Berkas yang dikirim lewat bot menjadi pengajuan.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={form.shareRequests}
            onCheckedChange={(v) => setForm((f) => ({ ...f, shareRequests: v }))}
            className="mt-0.5"
          />
          <span>
            Anggota melihat status pengajuan seluruh grup
            <span className="block text-xs text-muted-foreground">
              Cocok untuk satker (rekan satu kantor). Matikan untuk masyarakat umum — tiap orang hanya melihat miliknya.
            </span>
          </span>
        </label>
        <div className="grid gap-1">
          <Label htmlFor="group-notes">Catatan</Label>
          <Textarea
            id="group-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button disabled={!form.code.trim() || !form.name.trim()} onClick={save}>
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}

function ContactCard() {
  const { data, isLoading } = useWaContacts();
  const m = useWhatsappMutations();
  const [editing, setEditing] = useState<WaContact | "new" | null>(null);
  const [removing, setRemoving] = useState<WaContact | null>(null);
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const items = (data ?? []).filter((c) =>
    words.every((w) =>
      [c.name, c.phone, formatPhone(c.phone), c.group?.name, c.group?.code, c.position]
        .join(" ")
        .toLowerCase()
        .includes(w),
    ),
  );
  const toggle = (c: WaContact, patch: { verified?: boolean; active?: boolean }) =>
    m.updateContact.mutate({ id: c.id, ...patch }, { onError: (e) => toast.error(errorMessage(e)) });
  return (
    <SectionCard
      icon={UserRound}
      title="Kontak WhatsApp"
      description="Nomor pengguna layanan. Bot hanya melayani kontak aktif & terverifikasi; nomor lain dibalas 'belum terdaftar'."
      action={
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Kontak
        </Button>
      }
    >
      <SearchInput value={query} onChange={setQuery} placeholder="Cari nama, nomor, grup…" />
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !items.length ? (
        <p className="text-sm text-muted-foreground">{data?.length ? "Tidak ada yang cocok." : "Belum ada kontak."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 basis-56">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[formatPhone(c.phone), c.position, c.group ? `${c.group.code} · ${c.group.name}` : "Tanpa grup"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-xs">
                <Switch checked={c.verified} onCheckedChange={(v) => toggle(c, { verified: v })} /> Terverifikasi
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Switch checked={c.active} onCheckedChange={(v) => toggle(c, { active: v })} /> Aktif
              </label>
              {!c.group && <Badge className="bg-warning/15 text-warning">Tanpa grup</Badge>}
              <span className="flex gap-1">
                <Button size="icon-xs" variant="ghost" aria-label={`Ubah ${c.name}`} onClick={() => setEditing(c)}>
                  <Pencil />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Hapus ${c.name}`} onClick={() => setRemoving(c)}>
                  <Trash2 />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ContactDialog value={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Hapus kontak?"
        itemName={removing?.name}
        description="Riwayat percakapan tetap tersimpan; nomor ini akan dibalas 'belum terdaftar'."
        confirmLabel="Hapus"
        onConfirm={() =>
          removing &&
          m.removeContact.mutate(removing.id, {
            onSuccess: () => toast.success("Kontak dihapus."),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </SectionCard>
  );
}

function ContactDialog({ value, onClose }: { value: WaContact | "new" | null; onClose: () => void }) {
  const session = useOpenSession(!!value);
  return (
    <Dialog open={!!value} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{value === "new" ? "Kontak baru" : "Ubah kontak"}</DialogTitle>
          <DialogDescription>
            Pastikan nomor benar milik orang tersebut sebelum menandai terverifikasi. Grup menentukan data yang boleh
            diaksesnya.
          </DialogDescription>
        </DialogHeader>
        {value && <ContactForm key={session} value={value} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({ value, onDone }: { value: WaContact | "new"; onDone: () => void }) {
  const m = useWhatsappMutations();
  const { data: groups } = useContactGroups();
  const current = value === "new" ? null : value;
  const [form, setForm] = useState(() => ({
    phone: current ? formatPhone(current.phone) : "",
    name: current?.name ?? "",
    position: current?.position ?? "",
    groupId: current?.groupId ?? NO_GROUP,
    verified: current?.verified ?? true,
    notes: current?.notes ?? "",
  }));
  const save = () => {
    const input = {
      phone: form.phone,
      name: form.name.trim(),
      position: form.position.trim() || undefined,
      groupId: form.groupId === NO_GROUP ? null : form.groupId,
      verified: form.verified,
      notes: form.notes.trim() || undefined,
    };
    const options = {
      onSuccess: () => {
        toast.success("Kontak disimpan.");
        onDone();
      },
      onError: (e: unknown) => toast.error(errorMessage(e)),
    };
    if (current) m.updateContact.mutate({ id: current.id, ...input }, options);
    else m.createContact.mutate(input, options);
  };
  return (
    <>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label htmlFor="contact-name">Nama</Label>
          <Input
            id="contact-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="contact-phone">Nomor WhatsApp</Label>
          <Input
            id="contact-phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="0812-3456-7890"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="contact-position">Jabatan / keterangan</Label>
          <Input
            id="contact-position"
            value={form.position}
            onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
          />
        </div>
        <div className="grid gap-1">
          <Label>Grup</Label>
          <Select value={form.groupId} onValueChange={(v) => setForm((f) => ({ ...f, groupId: v }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>Tanpa grup (hanya akses publik)</SelectItem>
              {groups?.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.verified} onCheckedChange={(v) => setForm((f) => ({ ...f, verified: v }))} />
          Terverifikasi (boleh memakai bot)
        </label>
        <div className="grid gap-1">
          <Label htmlFor="contact-notes">Catatan</Label>
          <Textarea
            id="contact-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button disabled={!form.name.trim() || !form.phone.trim()} onClick={save}>
          Simpan
        </Button>
      </DialogFooter>
    </>
  );
}
