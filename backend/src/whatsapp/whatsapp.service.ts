import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type Request, type WaContact } from "../generated/prisma/client";
import { EXCLUDED_STATUSES, numberSources } from "../ai/chat/ai-chat-context";
import { AiService } from "../ai/ai.service";
import { AiIndexService } from "../ai/index/ai-index.service";
import { KNOWLEDGE_COLLECTION } from "../ai/index/index-text";
import type { AuthUser } from "../common/types/auth-user";
import { todayLabel } from "../integrations/api-token-logic";
import { KnowledgeVaultService } from "../knowledge/knowledge-vault.service";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestStatus } from "../requests/request-logic";
import { RequestsService } from "../requests/requests.service";
import { REQUEST_UPLOAD_CONTEXT } from "../requests/requests.service";
import { UploadsService } from "../uploads/uploads.service";
import { WhatsappQueueService } from "./whatsapp-queue.service";
import {
  buildPublicAnswerPrompt,
  detectIntent,
  guessKind,
  type InboundMessage,
  intakeAck,
  INTAKE_WINDOW_MS,
  intakeTitle,
  MAX_INBOUND_PER_HOUR,
  botMessages,
  botProfile,
  type BotProfile,
  normalizePhone,
  parsePublicAnswer,
  requestNo,
  splitMessage,
  statusList,
  statusNotice,
  statusScope,
  WA_SERVICE_WINDOW_MS,
  within,
} from "./whatsapp-logic";
import type {
  BotProfileDto,
  ContactDto,
  GroupDto,
  ReplyDto,
  SimulateDto,
  UpdateContactDto,
  UpdateGroupDto,
} from "./whatsapp.dto";

/** Berkas dari WhatsApp yang dibaca ke memori (batas media dokumen Cloud API 100 MB; kita batasi 20 MB). */
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
/** Catatan pengetahuan yang tidak dipakai bot publik: hanya yang berstatus berlaku (draf, dicabut, templat dibuang). */
const PUBLIC_EXCLUDED = [...EXCLUDED_STATUSES, "draf"];

interface Attachment {
  uploadId?: string;
  mediaId?: string;
  name: string;
  mimeType: string;
}

const asList = <T>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);
const shortDate = (d: Date) =>
  d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

/**
 * Bot WhatsApp (tahap 5 docs/AI-AGENT.md §20): webhook WhatsApp Cloud API resmi → antrian → jawaban dari basis
 * pengetahuan yang boleh dibaca penanya (publik, atau khusus grupnya), penerimaan berkas pengajuan ke Antrian
 * Verifikasi, cek status pengajuan, dan kabar perubahan status. Pengirim dikenali dari nomor (tanda tangan Meta), grupnya
 * (satker / instansi / masyarakat / …) dari tabel kontak —
 * tidak pernah dari isi pesan (AG-20). Tanpa kredensial Meta semua balasan berstatus `simulated` (Simulator).
 */
@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private ownerCache?: { email: string; id: string | null };

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queue: WhatsappQueueService,
    private readonly ai: AiService,
    private readonly index: AiIndexService,
    private readonly uploads: UploadsService,
    private readonly requests: RequestsService,
    private readonly vault: KnowledgeVaultService,
  ) {}

  onModuleInit() {
    this.requests.onStatusChange((request, status, note) => this.notifyRequestStatus(request, status, note));
  }

  // ---------------------------------------------------------------- Konfigurasi

  /** Kredensial Meta lengkap (webhook bisa diaktifkan). */
  get configured() {
    return !!(
      this.config.get<string>("WHATSAPP_PHONE_NUMBER_ID") &&
      this.config.get<string>("WHATSAPP_ACCESS_TOKEN") &&
      this.config.get<string>("WHATSAPP_APP_SECRET") &&
      this.config.get<string>("WHATSAPP_VERIFY_TOKEN") &&
      this.config.get<string>("WHATSAPP_OWNER_EMAIL")
    );
  }

  get appSecret() {
    return this.config.get<string>("WHATSAPP_APP_SECRET") ?? "";
  }

  get verifyToken() {
    return this.config.get<string>("WHATSAPP_VERIFY_TOKEN") ?? "";
  }

  /** ID user pemilik bot (dari `WHATSAPP_OWNER_EMAIL`), null bila belum diatur / akun tidak ada. */
  async ownerId(): Promise<string | null> {
    const email = this.config.get<string>("WHATSAPP_OWNER_EMAIL")?.toLowerCase();
    if (!email || !this.configured) return null;
    if (this.ownerCache?.email === email && this.ownerCache.id) return this.ownerCache.id;
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    this.ownerCache = { email, id: user?.id ?? null };
    return user?.id ?? null;
  }

  /** Bot sungguhan aktif untuk user ini (selain itu balasan hanya disimulasikan). */
  private async live(userId: string) {
    return (await this.ownerId()) === userId;
  }

  async status(user: AuthUser) {
    const [contacts, verified, needsReply] = await Promise.all([
      this.prisma.waContact.count({ where: { userId: user.id } }),
      this.prisma.waContact.count({ where: { userId: user.id, verified: true, active: true } }),
      this.prisma.waMessage.count({ where: { userId: user.id, status: "needs_reply" } }),
    ]);
    const ownerId = await this.ownerId();
    return {
      configured: this.configured,
      ownerFound: !!ownerId,
      isOwner: ownerId === user.id,
      webhookPath: "/api/v1/whatsapp/webhook",
      graphVersion: this.config.get<string>("WHATSAPP_GRAPH_VERSION"),
      contacts,
      verified,
      needsReply,
    };
  }

  // ---------------------------------------------------------------- Profil layanan, grup & kontak

  async profile(userId: string): Promise<BotProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { waBot: true } });
    return botProfile(user.waBot);
  }

  async updateProfile(userId: string, dto: BotProfileDto) {
    const next = botProfile({ ...(await this.profile(userId)), ...dto });
    await this.prisma.user.update({ where: { id: userId }, data: { waBot: next as unknown as Prisma.InputJsonValue } });
    return next;
  }

  groups(userId: string) {
    return this.prisma.contactGroup.findMany({
      where: { userId },
      orderBy: { code: "asc" },
      include: { _count: { select: { contacts: true } } },
    });
  }

  async createGroup(userId: string, dto: GroupDto) {
    return this.prisma.contactGroup.create({
      data: {
        userId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        kind: dto.kind ?? "lainnya",
        notes: dto.notes?.trim() || null,
        allowRequests: dto.allowRequests ?? true,
        shareRequests: dto.shareRequests ?? false,
      },
    });
  }

  async updateGroup(userId: string, id: string, dto: UpdateGroupDto) {
    await this.ownGroup(userId, id);
    return this.prisma.contactGroup.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.allowRequests !== undefined ? { allowRequests: dto.allowRequests } : {}),
        ...(dto.shareRequests !== undefined ? { shareRequests: dto.shareRequests } : {}),
      },
    });
  }

  async removeGroup(userId: string, id: string) {
    await this.ownGroup(userId, id);
    await this.prisma.contactGroup.delete({ where: { id } });
    return { success: true };
  }

  contacts(userId: string) {
    return this.prisma.waContact.findMany({
      where: { userId },
      orderBy: [{ verified: "asc" }, { name: "asc" }],
      include: {
        group: { select: { id: true, code: true, name: true, kind: true, allowRequests: true, shareRequests: true } },
      },
    });
  }

  async createContact(userId: string, dto: ContactDto) {
    const phone = this.phoneOrFail(dto.phone);
    if (dto.groupId) await this.ownGroup(userId, dto.groupId);
    return this.prisma.waContact.create({
      data: {
        userId,
        phone,
        name: dto.name.trim(),
        position: dto.position?.trim() || null,
        groupId: dto.groupId || null,
        verified: dto.verified ?? false,
        active: dto.active ?? true,
        notes: dto.notes?.trim() || null,
      },
      include: {
        group: { select: { id: true, code: true, name: true, kind: true, allowRequests: true, shareRequests: true } },
      },
    });
  }

  async updateContact(userId: string, id: string, dto: UpdateContactDto) {
    const contact = await this.prisma.waContact.findFirst({ where: { id, userId } });
    if (!contact) throw new NotFoundException("Kontak tidak ditemukan.");
    if (dto.groupId) await this.ownGroup(userId, dto.groupId);
    return this.prisma.waContact.update({
      where: { id },
      data: {
        ...(dto.phone !== undefined ? { phone: this.phoneOrFail(dto.phone) } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.position !== undefined ? { position: dto.position?.trim() || null } : {}),
        ...(dto.groupId !== undefined ? { groupId: dto.groupId || null } : {}),
        ...(dto.verified !== undefined ? { verified: dto.verified } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: {
        group: { select: { id: true, code: true, name: true, kind: true, allowRequests: true, shareRequests: true } },
      },
    });
  }

  async removeContact(userId: string, id: string) {
    const contact = await this.prisma.waContact.findFirst({ where: { id, userId } });
    if (!contact) throw new NotFoundException("Kontak tidak ditemukan.");
    await this.prisma.waContact.delete({ where: { id } });
    return { success: true };
  }

  // ---------------------------------------------------------------- Percakapan

  async conversations(userId: string) {
    const latest = await this.prisma.waMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      distinct: ["phone"],
      take: 300,
    });
    const phones = latest.map((m) => m.phone);
    const [pending, contacts] = await Promise.all([
      this.prisma.waMessage.groupBy({
        by: ["phone"],
        where: { userId, status: "needs_reply", phone: { in: phones } },
        _count: { _all: true },
      }),
      this.prisma.waContact.findMany({
        where: { userId, phone: { in: phones } },
        include: {
          group: { select: { id: true, code: true, name: true, kind: true, allowRequests: true, shareRequests: true } },
        },
      }),
    ]);
    return latest.map((m) => ({
      phone: m.phone,
      contact: contacts.find((c) => c.phone === m.phone) ?? null,
      lastMessage: { text: m.text, direction: m.direction, createdAt: m.createdAt, status: m.status },
      needsReply: pending.find((p) => p.phone === m.phone)?._count._all ?? 0,
    }));
  }

  async messages(userId: string, phone: string) {
    const normalized = this.phoneOrFail(phone);
    const rows = await this.prisma.waMessage.findMany({
      where: { userId, phone: normalized },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.reverse();
  }

  /** Balasan manual petugas (+ opsional disimpan sebagai usulan FAQ di Inbox vault). */
  async reply(user: AuthUser, phone: string, dto: ReplyDto) {
    const normalized = this.phoneOrFail(phone);
    const contact = await this.prisma.waContact.findUnique({
      where: { userId_phone: { userId: user.id, phone: normalized } },
    });
    const sent = await this.send(user.id, normalized, dto.text.trim(), {
      contact,
      intent: "manual",
      simulated: !(await this.live(user.id)),
    });
    await this.prisma.waMessage.updateMany({
      where: { userId: user.id, phone: normalized, status: "needs_reply" },
      data: { status: "answered" },
    });
    if (dto.saveToInbox) {
      await this.vault.addToInbox(user.id, {
        title: dto.saveToInbox.title,
        content: dto.text.trim(),
        question: dto.saveToInbox.question,
      });
    }
    return sent;
  }

  /** Tandai pertanyaan sudah ditangani (mis. dijawab lewat telepon). */
  async resolve(userId: string, phone: string) {
    const normalized = this.phoneOrFail(phone);
    const { count } = await this.prisma.waMessage.updateMany({
      where: { userId, phone: normalized, status: "needs_reply" },
      data: { status: "answered" },
    });
    return { resolved: count };
  }

  followUps(userId: string, take = 20) {
    return this.prisma.waMessage.findMany({
      where: { userId, status: "needs_reply" },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, phone: true, text: true, createdAt: true, contactId: true },
    });
  }

  // ---------------------------------------------------------------- Pesan masuk

  /** Webhook (payload sudah diverifikasi): catat pesan baru lalu proses di antrian. Pesan ganda diabaikan. */
  async receive(messages: InboundMessage[]) {
    const ownerId = await this.ownerId();
    if (!ownerId) return 0;
    let accepted = 0;
    for (const m of messages) {
      const created = await this.record(ownerId, {
        phone: m.phone,
        text: m.text,
        waMessageId: m.waMessageId,
        attachments: m.media.map((x) => ({ mediaId: x.mediaId, name: x.name, mimeType: x.mimeType })),
        unsupported: m.unsupported,
        simulated: false,
      });
      if (created) accepted++;
    }
    return accepted;
  }

  /** Simulator (tanpa Meta): pesan seolah dikirim nomor ini; berkas = upload milik user. Balasan tidak dikirim. */
  async simulate(user: AuthUser, dto: SimulateDto) {
    const phone = this.phoneOrFail(dto.phone);
    if (!dto.text?.trim() && !dto.uploadIds?.length) throw new BadRequestException("Isi pesan atau lampirkan berkas.");
    const ids = [...new Set(dto.uploadIds ?? [])];
    const assets = ids.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: ids }, userId: user.id },
          select: { id: true, originalName: true, mimeType: true },
        })
      : [];
    if (assets.length !== ids.length) throw new BadRequestException("Sebagian berkas tidak ditemukan.");
    const message = await this.record(user.id, {
      phone,
      text: dto.text?.trim() ?? "",
      attachments: assets.map((a) => ({ uploadId: a.id, name: a.originalName, mimeType: a.mimeType })),
      simulated: true,
    });
    if (!message) throw new ConflictException("Pesan ganda.");
    return message;
  }

  private async record(
    userId: string,
    input: {
      phone: string;
      text: string;
      waMessageId?: string;
      attachments: Attachment[];
      unsupported?: string;
      simulated: boolean;
    },
  ) {
    const contact = await this.prisma.waContact.findUnique({ where: { userId_phone: { userId, phone: input.phone } } });
    try {
      const message = await this.prisma.waMessage.create({
        data: {
          userId,
          contactId: contact?.id ?? null,
          phone: input.phone,
          direction: "in",
          text: input.text.slice(0, 10_000),
          attachments: input.attachments as unknown as Prisma.InputJsonValue,
          waMessageId: input.waMessageId ?? null,
          status: "received",
          intent: input.unsupported ? "unsupported" : null,
          simulated: input.simulated,
        },
      });
      if (contact) {
        await this.prisma.waContact.update({ where: { id: contact.id }, data: { lastInboundAt: message.createdAt } });
      }
      await this.queue.enqueue(message.id);
      return message;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  }

  /** Worker antrian: pahami pesan, jalankan aksi, kirim balasan. */
  async process(messageId: string) {
    const message = await this.prisma.waMessage.findUnique({ where: { id: messageId } });
    if (!message || message.status !== "received") return;
    const { userId, phone } = message;
    const simulated = message.simulated || !(await this.live(userId));
    const contact = await this.prisma.waContact.findUnique({
      where: { userId_phone: { userId, phone } },
      include: { group: true },
    });
    const finish = (data: Prisma.WaMessageUpdateInput) =>
      this.prisma.waMessage.update({ where: { id: messageId }, data });
    const messages = botMessages(await this.profile(userId));
    const reply = (text: string, intent: string, requestId?: string) =>
      this.send(userId, phone, text, { contact, intent, requestId, simulated });

    // Nomor tak dikenal / nonaktif / belum diverifikasi: dicatat, dibalas sekali per 24 jam
    if (!contact || !contact.active || !contact.verified) {
      const intent = !contact || !contact.active ? "unregistered" : "unverified";
      await finish({ status: "ignored", intent });
      if (!(await this.repliedRecently(userId, phone, intent, WA_SERVICE_WINDOW_MS))) {
        await reply(intent === "unregistered" ? messages.unregistered : messages.unverified, intent);
      }
      return;
    }
    const hourAgo = new Date(Date.now() - 3600 * 1000);
    const recent = await this.prisma.waMessage.count({
      where: { userId, phone, direction: "in", createdAt: { gte: hourAgo } },
    });
    if (recent > MAX_INBOUND_PER_HOUR) {
      await finish({ status: "ignored", intent: "rate_limited" });
      if (!(await this.repliedRecently(userId, phone, "rate_limited", 3600 * 1000))) {
        await reply(messages.rateLimited, "rate_limited");
      }
      return;
    }
    if (message.intent === "unsupported") {
      await finish({ status: "answered" });
      await reply(messages.unsupported, "unsupported");
      return;
    }

    const attachments = asList<Attachment>(message.attachments);
    const intent = detectIntent(message.text, attachments.length > 0);
    try {
      if (intent === "status") {
        await finish({ status: "answered", intent });
        // AG-20: cakupan dari grup kontak terdaftar (server), bukan dari isi pesan
        const scope = statusScope(contact.id, contact.group);
        const rows = await this.prisma.request.findMany({
          where: scope.kind === "group" ? { userId, groupCode: scope.groupCode } : { userId, waContactId: contact.id },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, title: true, status: true, updatedAt: true },
        });
        await reply(statusList(scope.label, rows, shortDate), intent);
        return;
      }
      if (intent === "request") {
        if (contact.group && !contact.group.allowRequests) {
          await finish({ status: "answered", intent });
          await reply(messages.requestsClosed, intent);
          return;
        }
        const request = await this.intake(userId, contact, message.text, attachments);
        await finish({ status: "answered", intent, requestId: request.id });
        await reply(
          intakeAck({
            requestNo: requestNo(request.id),
            title: request.title,
            files: asList(request.attachments).length,
            added: request.added,
          }),
          intent,
          request.id,
        );
        return;
      }
      await this.answer(message.id, userId, contact, message.text, reply, messages.forwarded);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Pesan WhatsApp ${messageId} gagal diproses: ${text}`);
      await finish({ status: "needs_reply", intent, error: text.slice(0, 500) });
      await reply(messages.error, "error");
    }
  }

  /** Pertanyaan → jawaban dari basis pengetahuan publik; ragu / tanpa sumber → diteruskan ke petugas. */
  private async answer(
    messageId: string,
    userId: string,
    contact: WaContact & { group: { code: string; name: string } | null },
    question: string,
    reply: (text: string, intent: string) => Promise<unknown>,
    forwarded: string,
  ) {
    const finish = (data: Prisma.WaMessageUpdateInput) =>
      this.prisma.waMessage.update({ where: { id: messageId }, data });
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, aiProvider: true },
    });
    const hits = owner.aiProvider
      ? await this.index.search(userId, question.slice(0, 1_000), 6, {
          collections: [KNOWLEDGE_COLLECTION],
          excludeStatuses: PUBLIC_EXCLUDED,
          publicOnly: true,
          audienceGroup: contact.group?.code,
        })
      : [];
    if (!hits.length) {
      await finish({ status: "needs_reply", intent: "question" });
      await reply(forwarded, "question");
      return;
    }
    const sources = numberSources([hits]);
    const history = await this.prisma.waMessage.findMany({
      where: { userId, phone: contact.phone, id: { not: messageId }, text: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { direction: true, text: true },
    });
    const result = await this.ai.generate(
      userId,
      buildPublicAnswerPrompt({
        question,
        sources,
        history: history.reverse().map((h) => ({ direction: h.direction as "in" | "out", text: h.text.slice(0, 600) })),
        contactName: contact.name,
        groupName: contact.group?.name ?? null,
        profile: await this.profile(userId),
        officerName: owner.name,
        today: todayLabel(new Date()),
      }),
      [],
      "chat",
    );
    const parsed = parsePublicAnswer(result.text);
    const citations = sources
      .filter((s) => parsed.used.includes(s.n))
      .map((s) => ({ n: s.n, title: s.title, sourceType: s.sourceType, sourceId: s.sourceId }));
    const followUp = !parsed.offTopic && !parsed.confident;
    await finish({
      status: followUp ? "needs_reply" : "answered",
      intent: parsed.offTopic ? "off_topic" : "question",
      citations: citations as unknown as Prisma.InputJsonValue,
    });
    await reply(
      followUp ? `${parsed.answer}\n\n_Pertanyaan ini juga diteruskan ke petugas untuk dikonfirmasi._` : parsed.answer,
      parsed.offTopic ? "off_topic" : "question",
    );
  }

  /** Berkas masuk → pengajuan baru, atau ditambahkan ke pengajuan kontak ini yang dibuat ≤ 30 menit lalu. */
  private async intake(
    userId: string,
    contact: WaContact & { group: { code: string; name: string } | null },
    text: string,
    attachments: Attachment[],
  ) {
    const owner = await this.ownerAuth(userId);
    const uploadIds: string[] = [];
    for (const file of attachments) {
      if (file.uploadId) uploadIds.push(file.uploadId);
      else if (file.mediaId) {
        const buffer = await this.downloadMedia(file.mediaId);
        const asset = await this.uploads.createFromBuffer(
          buffer,
          file.name,
          file.mimeType,
          owner,
          REQUEST_UPLOAD_CONTEXT,
        );
        uploadIds.push(asset.id);
      }
    }
    const open = await this.prisma.request.findFirst({
      where: {
        userId,
        waContactId: contact.id,
        status: "baru",
        updatedAt: { gte: new Date(Date.now() - INTAKE_WINDOW_MS) },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (open && uploadIds.length) {
      const updated = await this.requests.appendAttachments(owner, open.id, uploadIds);
      if (text.trim()) {
        await this.prisma.request.update({
          where: { id: open.id },
          data: { message: [open.message, text.trim()].filter(Boolean).join("\n\n") },
        });
      }
      return { ...updated, added: true };
    }
    const created = await this.requests.create(
      owner,
      {
        kind: guessKind(text),
        title: intakeTitle(text, contact.group?.name ?? contact.name, attachments[0]?.name),
        applicant: contact.group ? `${contact.group.name} — ${contact.name}` : contact.name,
        groupCode: contact.group?.code,
        message: text.trim() || undefined,
        uploadIds,
      },
      "whatsapp",
      { waContactId: contact.id },
    );
    return { ...created, added: false };
  }

  /** Kabar status pengajuan dari WhatsApp ke pemohonnya (dipanggil `RequestsService` setelah user mengubah status). */
  private async notifyRequestStatus(request: Request, status: RequestStatus, note?: string) {
    if (!request.waContactId) return;
    const contact = await this.prisma.waContact.findUnique({ where: { id: request.waContactId } });
    const text = statusNotice({ id: request.id, title: request.title, status, note });
    if (!contact || !text) return;
    await this.send(request.userId, contact.phone, text, {
      contact,
      intent: "notice",
      requestId: request.id,
      simulated: !(await this.live(request.userId)),
    });
  }

  // ---------------------------------------------------------------- Pesan keluar

  /**
   * Kirim teks (dipecah ≤ 4096 karakter) lalu catat. Mode simulasi hanya mencatat. Pesan bebas di luar jendela 24 jam
   * ditolak Meta → dicatat `failed` (perlu pesan templat).
   */
  private async send(
    userId: string,
    phone: string,
    text: string,
    options: { contact: WaContact | null; intent: string; requestId?: string; simulated: boolean },
  ) {
    const now = new Date();
    const outOfWindow = !options.simulated && !within(options.contact?.lastInboundAt, WA_SERVICE_WINDOW_MS, now);
    const saved = [];
    for (const part of splitMessage(text)) {
      let status = options.simulated ? "simulated" : "sent";
      let waMessageId: string | null = null;
      let error: string | null = null;
      if (!options.simulated) {
        if (outOfWindow) {
          status = "failed";
          error = "Di luar jendela 24 jam sejak pesan terakhir kontak — Meta hanya menerima pesan templat.";
        } else {
          try {
            waMessageId = await this.postText(phone, part);
          } catch (e) {
            status = "failed";
            error = e instanceof Error ? e.message : String(e);
          }
        }
      }
      saved.push(
        await this.prisma.waMessage.create({
          data: {
            userId,
            contactId: options.contact?.id ?? null,
            phone,
            direction: "out",
            text: part,
            status,
            intent: options.intent,
            requestId: options.requestId ?? null,
            waMessageId,
            error,
            simulated: options.simulated,
          },
        }),
      );
    }
    return saved;
  }

  private graphUrl(path: string) {
    const base = this.config.get<string>("WHATSAPP_API_URL") ?? "https://graph.facebook.com";
    return `${base.replace(/\/$/, "")}/${this.config.get<string>("WHATSAPP_GRAPH_VERSION")}/${path}`;
  }

  private authHeader() {
    return { Authorization: `Bearer ${this.config.get<string>("WHATSAPP_ACCESS_TOKEN")}` };
  }

  private async postText(phone: string, body: string) {
    const response = await fetch(this.graphUrl(`${this.config.get<string>("WHATSAPP_PHONE_NUMBER_ID")}/messages`), {
      method: "POST",
      headers: { ...this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body, preview_url: false },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    } | null;
    if (!response.ok) throw new Error(`Meta ${response.status}: ${json?.error?.message ?? "gagal mengirim"}`);
    return json?.messages?.[0]?.id ?? null;
  }

  /** Unduh media dari Cloud API (URL media hanya berlaku sebentar & wajib token). */
  private async downloadMedia(mediaId: string) {
    const meta = await fetch(this.graphUrl(mediaId), {
      headers: this.authHeader(),
      signal: AbortSignal.timeout(20_000),
    });
    const info = (await meta.json().catch(() => null)) as { url?: string; file_size?: number } | null;
    if (!meta.ok || !info?.url) throw new Error(`Media ${mediaId} tidak bisa diambil (${meta.status}).`);
    if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) throw new Error("Berkas lebih dari 20 MB.");
    const file = await fetch(info.url, { headers: this.authHeader(), signal: AbortSignal.timeout(60_000) });
    if (!file.ok) throw new Error(`Unduh media gagal (${file.status}).`);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error("Berkas lebih dari 20 MB.");
    return buffer;
  }

  // ---------------------------------------------------------------- Bantuan

  private async repliedRecently(userId: string, phone: string, intent: string, ms: number) {
    return !!(await this.prisma.waMessage.findFirst({
      where: { userId, phone, direction: "out", intent, createdAt: { gte: new Date(Date.now() - ms) } },
      select: { id: true },
    }));
  }

  private async ownerAuth(userId: string): Promise<AuthUser> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, role: true } });
  }

  private async ownGroup(userId: string, id: string) {
    const group = await this.prisma.contactGroup.findFirst({ where: { id, userId } });
    if (!group) throw new NotFoundException("Grup tidak ditemukan.");
    return group;
  }

  private phoneOrFail(input: string) {
    const phone = normalizePhone(input);
    if (!phone) throw new BadRequestException("Nomor WhatsApp tidak valid (contoh 0812-3456-7890).");
    return phone;
  }
}
