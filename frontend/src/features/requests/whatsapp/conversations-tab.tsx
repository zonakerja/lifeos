import {
  ArrowLeft,
  Bot,
  CheckCheck,
  FileText,
  FlaskConical,
  Loader2,
  Paperclip,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { SearchInput } from "@/components/common/search-input";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useWaContacts,
  useWaConversations,
  useWaMessages,
  useWhatsappMutations,
  useWhatsappStatus,
} from "@/data/use-whatsapp";
import { useSearchParam } from "@/hooks/use-search-param";
import { errorMessage } from "@/lib/api/client";
import { uploadsApi } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { WaMessage } from "@/types/api";
import {
  contactReady,
  conversationTitle,
  faqTitle,
  filterConversations,
  formatPhone,
  INTENT_LABELS,
  lastPendingQuestion,
  MESSAGE_STATUS,
} from "./whatsapp-utils";

/**
 * Pengajuan → Percakapan WA: status bot, daftar percakapan (yang perlu dijawab di atas), isi percakapan +
 * balasan petugas (opsional disimpan sebagai FAQ di Inbox vault), dan Simulator untuk mencoba bot tanpa Meta.
 */
export function ConversationsTab() {
  const [phone, setPhone] = useSearchParam("wa");
  return (
    <div className="flex flex-col gap-4">
      <BotStatusCard />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className={cn("min-w-0 flex-col gap-4", phone ? "hidden lg:flex" : "flex")}>
          <ConversationList selected={phone} onSelect={(p) => setPhone(p, { replace: false })} />
          <SimulatorCard onSent={(p) => setPhone(p)} />
        </div>
        <div className={cn("min-w-0", phone ? "block" : "hidden lg:block")}>
          {phone ? (
            <Thread phone={phone} onBack={() => setPhone(null)} />
          ) : (
            <Card className="flex h-full min-h-60 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Pilih percakapan untuk melihat isi dan membalas.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BotStatusCard() {
  const { data } = useWhatsappStatus();
  if (!data) return <Skeleton className="h-20 rounded-xl" />;
  const live = data.configured && data.isOwner;
  return (
    <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          live ? "bg-success/15 text-success" : "bg-info/15 text-info",
        )}
      >
        {live ? <ShieldCheck className="size-5" /> : <FlaskConical className="size-5" />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          {live ? "Bot WhatsApp aktif (WhatsApp Cloud API resmi)" : "Mode simulasi — bot belum tersambung ke WhatsApp"}
        </p>
        <p className="text-xs text-muted-foreground">
          {live
            ? `Webhook: ${window.location.origin}${data.webhookPath} · Graph API ${data.graphVersion}`
            : data.configured
              ? "Kredensial Meta sudah diisi di server, tetapi bot memakai akun LifeOS lain (WHATSAPP_OWNER_EMAIL)."
              : "Isi kredensial WhatsApp Cloud API di server (docs/TODO-USER.md bagian WhatsApp). Sementara itu coba bot lewat Simulator — balasan hanya dicatat."}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge variant="outline">{data.verified} kontak terverifikasi</Badge>
        {data.needsReply > 0 && <Badge className="bg-warning/15 text-warning">{data.needsReply} perlu dijawab</Badge>}
        <Button asChild size="xs" variant="outline">
          <Link to="/requests/contacts">Grup & Kontak</Link>
        </Button>
      </div>
    </Card>
  );
}

function ConversationList({ selected, onSelect }: { selected: string | null; onSelect: (phone: string) => void }) {
  const { data, isLoading } = useWaConversations();
  const [query, setQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const items = filterConversations(data ?? [], query, pendingOnly);
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-3">
      <SearchInput value={query} onChange={setQuery} placeholder="Cari nama, grup, nomor…" className="md:w-full" />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={pendingOnly} onCheckedChange={(v) => setPendingOnly(v === true)} /> Hanya yang perlu dijawab
      </label>
      {isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : items.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">Belum ada percakapan.</p>
      ) : (
        <ul className="grid max-h-[28rem] grid-cols-1 gap-1 overflow-y-auto">
          {items.map((c) => (
            <li key={c.phone}>
              <button
                type="button"
                onClick={() => onSelect(c.phone)}
                className={cn(
                  "flex w-full min-w-0 flex-col rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-module-soft",
                  selected === c.phone ? "border-module/50 bg-module-soft" : "border-transparent",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm font-semibold">{conversationTitle(c)}</span>
                  {c.needsReply > 0 && (
                    <Badge className="ml-auto h-5 shrink-0 bg-warning/15 text-warning">{c.needsReply}</Badge>
                  )}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {[
                    c.contact?.group?.name ?? (c.contact ? "Tanpa grup" : "Belum terdaftar"),
                    formatPhone(c.phone),
                  ].join(" · ")}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {c.lastMessage.direction === "out" ? "Bot: " : ""}
                  {c.lastMessage.text || "(berkas)"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Thread({ phone, onBack }: { phone: string; onBack: () => void }) {
  const { data: messages, isLoading } = useWaMessages(phone);
  const { data: conversations } = useWaConversations();
  const conversation = conversations?.find((c) => c.phone === phone);
  const contact = conversation?.contact ?? null;
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button size="icon-sm" variant="ghost" className="lg:hidden" aria-label="Kembali" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{contact?.name ?? formatPhone(phone)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[formatPhone(phone), contact?.position, contact?.group?.name].filter(Boolean).join(" · ")}
          </p>
        </div>
        {contact ? (
          !contactReady(contact) && <Badge className="bg-warning/15 text-warning">Belum diverifikasi / nonaktif</Badge>
        ) : (
          <Badge className="bg-warning/15 text-warning">Belum terdaftar</Badge>
        )}
      </div>
      <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto rounded-lg bg-muted/30 p-2">
        {isLoading ? <Skeleton className="h-40" /> : messages?.map((m) => <Bubble key={m.id} message={m} />)}
      </div>
      <ReplyBox phone={phone} messages={messages ?? []} pending={(conversation?.needsReply ?? 0) > 0} />
    </Card>
  );
}

function Bubble({ message: m }: { message: WaMessage }) {
  const out = m.direction === "out";
  const status = MESSAGE_STATUS[m.status];
  return (
    <div className={cn("flex min-w-0", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] min-w-0 rounded-xl px-3 py-2 text-sm shadow-xs",
          out ? "bg-module-soft" : "border bg-card",
        )}
      >
        {m.text && <p className="break-words whitespace-pre-wrap">{m.text}</p>}
        {m.attachments.map((a, i) => (
          <p key={`${a.name}-${i}`} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3 shrink-0" /> <span className="truncate">{a.name}</span>
          </p>
        ))}
        {m.citations && m.citations.length > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">Sumber: {m.citations.map((c) => c.title).join("; ")}</p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <span className="tabular-nums">{formatDateTime(m.createdAt)}</span>
          {m.intent && <span>· {INTENT_LABELS[m.intent] ?? m.intent}</span>}
          <Badge className={cn("h-4 px-1.5 text-[10px]", status.tone)}>{status.label}</Badge>
          {m.requestId && (
            <Link
              to={`/requests/queue?request=${m.requestId}`}
              className="inline-flex items-center gap-0.5 text-module"
            >
              <FileText className="size-3" /> Buka pengajuan
            </Link>
          )}
        </p>
        {m.error && <p className="mt-1 text-[11px] text-destructive">{m.error}</p>}
      </div>
    </div>
  );
}

function ReplyBox({ phone, messages, pending }: { phone: string; messages: WaMessage[]; pending: boolean }) {
  const m = useWhatsappMutations();
  const [text, setText] = useState("");
  const [saveFaq, setSaveFaq] = useState(false);
  const question = lastPendingQuestion(messages);
  const send = () =>
    m.reply.mutate(
      {
        phone,
        text: text.trim(),
        saveToInbox: saveFaq && question ? { title: faqTitle(question), question } : undefined,
      },
      {
        onSuccess: (sent) => {
          setText("");
          setSaveFaq(false);
          const failed = sent.find((s) => s.status === "failed");
          if (failed) toast.error(failed.error ?? "Pesan gagal dikirim.");
          else
            toast.success(sent[0]?.status === "simulated" ? "Balasan dicatat (mode simulasi)." : "Balasan terkirim.");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <div className="grid grid-cols-1 gap-2">
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Tulis balasan petugas…"
        aria-label="Balasan"
      />
      <div className="flex flex-wrap items-center gap-2">
        {question && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={saveFaq} onCheckedChange={(v) => setSaveFaq(v === true)} />
            Simpan juga sebagai FAQ di Inbox basis pengetahuan
          </label>
        )}
        <div className="ml-auto flex gap-2">
          {pending && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                m.resolve.mutate(phone, {
                  onSuccess: () => toast.success("Ditandai selesai."),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <CheckCheck /> Tandai selesai
            </Button>
          )}
          <Button size="sm" disabled={!text.trim() || m.reply.isPending} onClick={send}>
            {m.reply.isPending ? <Loader2 className="animate-spin" /> : <Send />} Kirim
          </Button>
        </div>
      </div>
    </div>
  );
}

const OTHER_NUMBER = "__other";

/** Simulator: kirim pesan seolah dari nomor kontak (tanpa Meta); berkas diunggah dulu sebagai berkas pengajuan. */
function SimulatorCard({ onSent }: { onSent: (phone: string) => void }) {
  const { data: contacts } = useWaContacts();
  const m = useWhatsappMutations();
  const [contactPhone, setContactPhone] = useState<string>("");
  const [otherPhone, setOtherPhone] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const phone = contactPhone === OTHER_NUMBER ? otherPhone.trim() : contactPhone;

  const send = async () => {
    setSending(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) uploaded.push((await uploadsApi.upload(file, "request")).id);
      const message = await m.simulate.mutateAsync({ phone, text: text.trim() || undefined, uploadIds: uploaded });
      setText("");
      setFiles([]);
      onSent(message.phone);
    } catch (error) {
      await Promise.allSettled(uploaded.map((id) => uploadsApi.remove(id)));
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <SectionCard
      icon={Bot}
      title="Simulator"
      description="Coba bot seolah Anda pengguna: pertanyaan, #status, atau kirim berkas (menjadi pengajuan)."
    >
      <div className="grid grid-cols-1 gap-2">
        <div className="grid gap-1">
          <Label>Pengirim</Label>
          <Select value={contactPhone} onValueChange={setContactPhone}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih kontak…" />
            </SelectTrigger>
            <SelectContent>
              {contacts?.map((c) => (
                <SelectItem key={c.id} value={c.phone}>
                  {c.name} {c.group ? `(${c.group.code})` : ""}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_NUMBER}>Nomor lain (belum terdaftar)…</SelectItem>
            </SelectContent>
          </Select>
          {contactPhone === OTHER_NUMBER && (
            <Input value={otherPhone} onChange={(e) => setOtherPhone(e.target.value)} placeholder="0812-…" />
          )}
        </div>
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pesan, mis. Apa syarat PSP laptop? / #status / keterangan berkas"
          aria-label="Pesan simulasi"
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 5));
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex max-w-52 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Lepas ${f.name}`}
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            <Paperclip /> Berkas
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!phone || (!text.trim() && !files.length) || sending}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />} Kirim simulasi
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
