import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AiService } from "../ai.service";
import { AiIndexService } from "../index/ai-index.service";
import { KNOWLEDGE_COLLECTION, OBSIDIAN_SOURCE, WORKSPACE_COLLECTION } from "../index/index-text";
import {
  buildAssistantPrompt,
  chatCitations,
  type ChatSource,
  conversationTitle,
  EXCLUDED_STATUSES,
  HISTORY_LIMIT,
  KNOWLEDGE_LIMIT,
  LINKED_LIMIT,
  numberSources,
  searchQuery,
  WORKSPACE_LIMIT,
} from "./ai-chat-context";
import { AiChatDto } from "./ai-chat.dto";

/** Jumlah percakapan yang ditampilkan di riwayat. */
const CONVERSATION_PAGE = 30;
export const AI_MESSAGES_PAGE = 100;

/**
 * Chatbot LifeOS (RAG tahap 2): pertanyaan → cari basis pengetahuan (vault Obsidian) + data kerja di indeks →
 * perluas dengan catatan yang tertaut (`[[...]]`) → jawab dengan sitasi, riwayat percakapan disimpan permanen.
 * Semua data milik user sendiri; endpoint ini juga dasar agen & bot WhatsApp nanti.
 */
@Injectable()
export class AiChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly index: AiIndexService,
  ) {}

  conversations(userId: string) {
    return this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: CONVERSATION_PAGE,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  async messages(userId: string, conversationId: string, take = AI_MESSAGES_PAGE) {
    await this.own(userId, conversationId);
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    });
    return { messages: rows.slice(0, take).reverse(), hasMore: rows.length > take };
  }

  async remove(userId: string, conversationId: string) {
    await this.own(userId, conversationId);
    await this.prisma.aiConversation.delete({ where: { id: conversationId } });
    return { success: true };
  }

  async chat(userId: string, dto: AiChatDto) {
    const message = dto.message.trim();
    const [user, existing] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, aiProfile: true } }),
      dto.conversationId ? this.own(userId, dto.conversationId) : null,
    ]);
    const history = existing
      ? (
          await this.prisma.aiMessage.findMany({
            where: { conversationId: existing.id },
            orderBy: { createdAt: "desc" },
            take: HISTORY_LIMIT,
            select: { role: true, content: true },
          })
        ).reverse()
      : [];

    const query = searchQuery(message, history);
    const [knowledge, workspace] = await Promise.all([
      this.index.search(userId, query, KNOWLEDGE_LIMIT, {
        collections: [KNOWLEDGE_COLLECTION],
        excludeStatuses: EXCLUDED_STATUSES,
      }),
      this.index.search(userId, query, WORKSPACE_LIMIT, { collections: [WORKSPACE_COLLECTION] }),
    ]);
    const linked = await this.linkedNotes(userId, knowledge);
    const sources = numberSources([knowledge, linked, workspace]);

    const prompt = buildAssistantPrompt({
      userName: user.name,
      profile: user.aiProfile,
      today: dto.today,
      sources,
      snapshot: dto.snapshot,
      history,
      question: message,
    });
    const result = await this.ai.generate(userId, prompt);
    const citations = chatCitations(result.text, sources);

    const conversation =
      existing ?? (await this.prisma.aiConversation.create({ data: { userId, title: conversationTitle(message) } }));
    const now = Date.now();
    const userMessage = await this.prisma.aiMessage.create({
      data: { conversationId: conversation.id, role: "user", content: message, createdAt: new Date(now) },
    });
    const assistantMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: result.text,
        citations: citations as unknown as Prisma.InputJsonValue,
        createdAt: new Date(now + 1),
      },
    });
    const updated = await this.prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return {
      conversation: updated,
      userMessage,
      assistantMessage,
      fallback: result.fallback,
      used: { knowledge: knowledge.length + linked.length, workspace: workspace.length },
    };
  }

  /**
   * "GraphRAG ringan": catatan vault yang tertaut dengan catatan hasil pencarian (tautan keluar & backlink) ikut
   * dikirim sebagai konteks pendukung — potongan pertamanya saja, maks. `LINKED_LIMIT`, status dicabut/templat dibuang.
   */
  private async linkedNotes(userId: string, hits: ChatSource[]): Promise<ChatSource[]> {
    const found = [...new Set(hits.filter((h) => h.sourceType === OBSIDIAN_SOURCE).map((h) => h.sourceId))];
    if (!found.length) return [];
    const links = await this.prisma.knowledgeLink.findMany({
      where: { userId, OR: [{ fromId: { in: found }, toId: { not: null } }, { toId: { in: found } }] },
      select: { fromId: true, toId: true },
    });
    const foundSet = new Set(found);
    const neighbors: string[] = [];
    for (const link of links) {
      for (const id of [link.toId, link.fromId]) {
        if (id && !foundSet.has(id) && !neighbors.includes(id)) neighbors.push(id);
      }
    }
    if (!neighbors.length) return [];
    const chunks = await this.prisma.aiChunk.findMany({
      where: {
        userId,
        sourceType: OBSIDIAN_SOURCE,
        sourceId: { in: neighbors.slice(0, LINKED_LIMIT * 3) },
        chunkIndex: 0,
      },
      select: {
        sourceType: true,
        sourceId: true,
        chunkIndex: true,
        title: true,
        content: true,
        collection: true,
        metadata: true,
      },
    });
    return chunks
      .map((c) => ({ ...c, metadata: (c.metadata as Record<string, unknown> | null) ?? null, linked: true }))
      .filter((c) => !EXCLUDED_STATUSES.includes(String(c.metadata?.status ?? "")))
      .sort((a, b) => neighbors.indexOf(a.sourceId) - neighbors.indexOf(b.sourceId))
      .slice(0, LINKED_LIMIT);
  }

  private async own(userId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, userId } });
    if (!conversation) throw new NotFoundException("Percakapan tidak ditemukan.");
    return conversation;
  }
}
