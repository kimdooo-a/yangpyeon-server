/**
 * src/lib/messenger/messages.ts
 *
 * 메시지 도메인 헬퍼 — clientGeneratedId 멱등 송신, 편집/회수 한도, 검색.
 *
 * 가드 전제:
 *   - withTenant() 가 TenantContext 주입 완료.
 *   - 라우트가 sender 의 conversation 멤버 자격을 사전 확인 (defense-in-depth 로 본 헬퍼도 검증).
 *
 * 비즈니스 룰:
 *   - clientGeneratedId 는 (tenantId, conversationId, clientGeneratedId) UNIQUE — 같은 conv 내 멱등.
 *   - DIRECT 양방향 차단 시 송신 실패 (USER_BLOCKED).
 *   - 편집은 sender 본인 + 15분 이내.
 *   - 회수는 sender 본인 24h 또는 admin 무제한.
 *   - 첨부 fileId 는 sender 가 owner.
 *   - 멘션 차단 사용자는 mention row 자체를 INSERT 안 함 (notification skip 의 1차 보호).
 */
import { Prisma } from "@/generated/prisma/client";
import type { Message } from "@/generated/prisma/client";
import {
  tenantPrismaFor,
  withTenantTx,
} from "@/lib/db/prisma-tenant-client";
import { getCurrentTenant } from "@yangpyeon/core/tenant/context";
import { isBlocked } from "./blocks";
import {
  MessengerError,
  decodeCursor,
  encodeCursor,
  type KeysetCursor,
} from "./types";

/** 편집 윈도우 — sender 본인 한도. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** 자기 회수 윈도우. admin 회수는 무제한. */
export const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 검색 윈도우 — Phase 1 30일. */
export const SEARCH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface MessageWithRelations extends Message {
  attachments: Array<{
    id: string;
    fileId: string;
    kind: string;
    displayOrder: number;
  }>;
  mentions: Array<{
    id: string;
    mentionedUserId: string;
  }>;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  kind: "TEXT" | "IMAGE" | "FILE";
  body: string | null;
  clientGeneratedId: string;
  replyToId?: string;
  attachments?: Array<{
    fileId: string;
    kind: "IMAGE" | "FILE" | "VOICE";
    displayOrder?: number;
  }>;
  mentions?: string[];
}

function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === "P2002";
  }
  // generated client 가 @ts-nocheck 인 영향으로 instanceof 가 안 잡힐 수 있음 — 코드 필드도 검사.
  const code = (err as { code?: unknown } | null)?.code;
  return code === "P2002";
}

async function fetchByCgid(input: {
  tenantId: string;
  conversationId: string;
  clientGeneratedId: string;
}): Promise<MessageWithRelations | null> {
  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const db = tenantPrismaFor({ tenantId: input.tenantId });
  const row = await db.message.findUnique({
    where: {
      tenantId_conversationId_clientGeneratedId: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        clientGeneratedId: input.clientGeneratedId,
      },
    },
    include: { attachments: true, mentions: true },
  });
  return row as MessageWithRelations | null;
}

/**
 * 메시지 송신 — clientGeneratedId 멱등 보장.
 *
 * 처리 순서:
 *   1. conv + sender 활성 멤버 검증
 *   2. clientGeneratedId 사전 lookup → 있으면 fetch return (created=false)
 *   3. DIRECT 면 peer 양방향 차단 검증
 *   4. replyToId 가 같은 conversation 인지 검증
 *   5. attachments[].fileId.owner === senderId 검증
 *   6. mentions 차단 필터 (차단된 사용자는 mention row INSERT 안 함)
 *   7. tx 안에서 message + attachments + mentions INSERT, conversation.lastMessageAt UPDATE
 *   8. UNIQUE violation race condition catch → fetch return
 *
 * Throws:
 *   - NOT_FOUND — conversation/replyTo 없음
 *   - CONVERSATION_NOT_MEMBER — sender 가 멤버 아님
 *   - USER_BLOCKED — DIRECT 의 peer 가 양방향 차단
 *   - REPLY_CROSS_CONVERSATION — replyToId 의 conv 가 다름
 *   - ATTACHMENT_NOT_FOUND / ATTACHMENT_NOT_OWNED
 */
export async function sendMessage(input: SendMessageInput): Promise<{
  message: MessageWithRelations;
  created: boolean;
}> {
  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const ctx = getCurrentTenant();
  const db = tenantPrismaFor(ctx);

  const conv = await db.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, kind: true, archivedAt: true },
  });
  if (!conv || conv.archivedAt !== null) {
    throw new MessengerError("NOT_FOUND", "대화를 찾을 수 없습니다");
  }

  const senderMembership =
    await db.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.senderId,
        },
      },
      select: { leftAt: true },
    });
  if (!senderMembership || senderMembership.leftAt !== null) {
    throw new MessengerError(
      "CONVERSATION_NOT_MEMBER",
      "대화 멤버가 아닙니다",
    );
  }

  // 사전 lookup — 멱등 fetch.
  const existing = await fetchByCgid({
    tenantId: ctx.tenantId,
    conversationId: input.conversationId,
    clientGeneratedId: input.clientGeneratedId,
  });
  if (existing) {
    return { message: existing, created: false };
  }

  // DIRECT 차단 검증.
  if (conv.kind === "DIRECT") {
    const other = await db.conversationMember.findFirst({
      where: {
        conversationId: input.conversationId,
        userId: { not: input.senderId },
      },
      select: { userId: true },
    });
    if (
      other &&
      (await isBlocked({
        userIdA: input.senderId,
        userIdB: other.userId,
      }))
    ) {
      throw new MessengerError(
        "USER_BLOCKED",
        "차단 관계로 인해 메시지를 보낼 수 없습니다",
      );
    }
  }

  // replyTo 검증.
  if (input.replyToId) {
    const reply = await db.message.findUnique({
      where: { id: input.replyToId },
      select: { conversationId: true },
    });
    if (!reply) {
      throw new MessengerError("NOT_FOUND", "회신 대상 메시지를 찾을 수 없습니다");
    }
    if (reply.conversationId !== input.conversationId) {
      throw new MessengerError(
        "REPLY_CROSS_CONVERSATION",
        "다른 대화의 메시지에는 회신할 수 없습니다",
      );
    }
  }

  // attachments 소유 검증.
  if (input.attachments && input.attachments.length > 0) {
    for (const a of input.attachments) {
      const file = await db.file.findUnique({
        where: { id: a.fileId },
        select: { ownerId: true },
      });
      if (!file) {
        throw new MessengerError(
          "ATTACHMENT_NOT_FOUND",
          "첨부 파일을 찾을 수 없습니다",
          { fileId: a.fileId },
        );
      }
      if (file.ownerId !== input.senderId) {
        throw new MessengerError(
          "ATTACHMENT_NOT_OWNED",
          "본인 소유의 파일만 첨부할 수 있습니다",
          { fileId: a.fileId },
        );
      }
    }
  }

  // mentions 차단 필터.
  const filteredMentions: string[] = [];
  if (input.mentions && input.mentions.length > 0) {
    for (const userId of input.mentions) {
      if (userId === input.senderId) continue; // self-mention 제외
      const blocked = await isBlocked({
        userIdA: input.senderId,
        userIdB: userId,
      });
      if (!blocked) {
        filteredMentions.push(userId);
      }
    }
  }

  try {
    const created = await withTenantTx(ctx.tenantId, async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          kind: input.kind,
          body: input.body,
          replyToId: input.replyToId ?? null,
          clientGeneratedId: input.clientGeneratedId,
          attachments:
            input.attachments && input.attachments.length > 0
              ? {
                  create: input.attachments.map((a) => ({
                    fileId: a.fileId,
                    kind: a.kind,
                    displayOrder: a.displayOrder ?? 0,
                  })),
                }
              : undefined,
          mentions:
            filteredMentions.length > 0
              ? {
                  create: filteredMentions.map((uid) => ({
                    mentionedUserId: uid,
                  })),
                }
              : undefined,
        },
        include: { attachments: true, mentions: true },
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: msg.createdAt },
      });
      return msg as MessageWithRelations;
    });
    return { message: created, created: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const fresh = await fetchByCgid({
        tenantId: ctx.tenantId,
        conversationId: input.conversationId,
        clientGeneratedId: input.clientGeneratedId,
      });
      if (fresh) {
        return { message: fresh, created: false };
      }
    }
    throw err;
  }
}

/**
 * 편집 — sender 본인 + 15분 이내.
 *
 * Throws:
 *   - NOT_FOUND — 메시지 없음
 *   - FORBIDDEN — sender 아님
 *   - EDIT_WINDOW_EXPIRED — createdAt + 15분 경과
 */
export async function editMessage(input: {
  messageId: string;
  editorId: string;
  newBody: string;
}): Promise<MessageWithRelations> {
  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const db = tenantPrismaFor(getCurrentTenant());
  const msg = await db.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      senderId: true,
      createdAt: true,
      deletedAt: true,
    },
  });
  if (!msg || msg.deletedAt !== null) {
    throw new MessengerError("NOT_FOUND", "메시지를 찾을 수 없습니다");
  }
  if (msg.senderId !== input.editorId) {
    throw new MessengerError("FORBIDDEN", "본인의 메시지만 편집할 수 있습니다");
  }
  if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new MessengerError(
      "EDIT_WINDOW_EXPIRED",
      "편집 가능 시간(15분)이 경과했습니다",
    );
  }

  const updated = await db.message.update({
    where: { id: input.messageId },
    data: {
      body: input.newBody,
      editedAt: new Date(),
      editCount: { increment: 1 },
    },
    include: { attachments: true, mentions: true },
  });
  return updated as MessageWithRelations;
}

/**
 * 회수 (soft delete).
 *
 * 권한:
 *   - actorIsAdmin=true → 무제한 (deletedBy='admin')
 *   - actorIsAdmin=false → sender 본인 + 24h 이내 (deletedBy='self')
 *
 * 효과: deletedAt SET, body=NULL.
 *
 * Throws:
 *   - NOT_FOUND — 메시지 없음 또는 이미 삭제
 *   - FORBIDDEN — sender 아니고 admin 도 아님
 *   - DELETE_WINDOW_EXPIRED — sender 본인 24h 초과
 */
export async function recallMessage(input: {
  messageId: string;
  actorId: string;
  actorIsAdmin: boolean;
}): Promise<Message> {
  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const db = tenantPrismaFor(getCurrentTenant());
  const msg = await db.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      senderId: true,
      createdAt: true,
      deletedAt: true,
    },
  });
  if (!msg || msg.deletedAt !== null) {
    throw new MessengerError("NOT_FOUND", "메시지를 찾을 수 없습니다");
  }

  let deletedBy: "self" | "admin";
  if (input.actorIsAdmin) {
    deletedBy = "admin";
  } else {
    if (msg.senderId !== input.actorId) {
      throw new MessengerError(
        "FORBIDDEN",
        "본인의 메시지만 회수할 수 있습니다 (운영자 제외)",
      );
    }
    if (Date.now() - msg.createdAt.getTime() > RECALL_WINDOW_MS) {
      throw new MessengerError(
        "DELETE_WINDOW_EXPIRED",
        "회수 가능 시간(24시간)이 경과했습니다",
      );
    }
    deletedBy = "self";
  }

  return db.message.update({
    where: { id: input.messageId },
    data: {
      deletedAt: new Date(),
      body: null,
      deletedBy,
    },
  });
}

/**
 * 메시지 stream — keyset cursor pagination.
 *
 * Cursor: base64(JSON({createdAt, id})). desc 정렬 (createdAt, id).
 * deletedAt IS NULL 인 메시지만 반환 (회수된 메시지 제외).
 */
export async function listMessages(input: {
  conversationId: string;
  cursor?: string;
  limit?: number;
}): Promise<{
  items: MessageWithRelations[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);

  let cursorFilter: Prisma.MessageWhereInput | undefined;
  if (input.cursor) {
    const parsed = decodeCursor(input.cursor);
    if (parsed) {
      const cursorDate = new Date(parsed.createdAt);
      // (createdAt, id) tie-break: createdAt < cursor OR (createdAt = cursor AND id < cursorId)
      cursorFilter = {
        OR: [
          { createdAt: { lt: cursorDate } },
          {
            AND: [
              { createdAt: cursorDate },
              { id: { lt: parsed.id } },
            ],
          },
        ],
      };
    }
  }

  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const db = tenantPrismaFor(getCurrentTenant());
  // limit + 1 fetch → hasMore 판정.
  const rows = await db.message.findMany({
    where: {
      conversationId: input.conversationId,
      ...(cursorFilter ?? {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { attachments: true, mentions: true },
  });

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows) as MessageWithRelations[];
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    const c: KeysetCursor = {
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    };
    nextCursor = encodeCursor(c);
  }

  return { items, nextCursor, hasMore };
}

export interface SearchResult extends MessageWithRelations {
  conversationId: string;
}

/**
 * 검색 — LIKE %q% on body, 30일 윈도, deletedAt IS NULL, 사용자 멤버 conv 만.
 *
 * RLS 가 tenant 격리를 자동 처리. 사용자 멤버 conv 필터는 명시 JOIN.
 * GIN trgm index (마이그 040) 가 ILIKE 가속.
 *
 * Phase 2: tsvector + ranking 으로 교체.
 */
export async function searchMessages(input: {
  searcherId: string;
  q: string;
  convId?: string;
  cursor?: string;
  limit?: number;
}): Promise<{
  items: SearchResult[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const since = new Date(Date.now() - SEARCH_WINDOW_MS);

  let cursorFilter: Prisma.MessageWhereInput | undefined;
  if (input.cursor) {
    const parsed = decodeCursor(input.cursor);
    if (parsed) {
      const cursorDate = new Date(parsed.createdAt);
      cursorFilter = {
        OR: [
          { createdAt: { lt: cursorDate } },
          {
            AND: [
              { createdAt: cursorDate },
              { id: { lt: parsed.id } },
            ],
          },
        ],
      };
    }
  }

  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const db = tenantPrismaFor(getCurrentTenant());
  const rows = await db.message.findMany({
    where: {
      body: { contains: input.q, mode: "insensitive" },
      deletedAt: null,
      createdAt: { gte: since },
      conversationId: input.convId,
      conversation: {
        members: {
          some: {
            userId: input.searcherId,
            leftAt: null,
          },
        },
      },
      ...(cursorFilter ?? {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { attachments: true, mentions: true },
  });

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows) as SearchResult[];
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    });
  }

  return { items, nextCursor, hasMore };
}
