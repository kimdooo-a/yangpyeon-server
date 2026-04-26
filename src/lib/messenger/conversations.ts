/**
 * src/lib/messenger/conversations.ts
 *
 * 대화 도메인 헬퍼 — DM 페어 멱등, GROUP 한도/차단, 멤버 관리, archive.
 *
 * 가드 전제:
 *   - withTenant() 가 이미 TenantContext 주입 완료.
 *   - 라우트 layer 가 actor 의 conversation member 자격을 사전 검증 (route guard).
 *   - 단, GROUP/DIRECT 생성은 actor 의 tenant 멤버십만 사전 검증 (대화 멤버 자격은 본 헬퍼가 만든다).
 *
 * 비즈니스 룰:
 *   - DIRECT: 정확히 2명, 같은 tenant, 양방향 차단 없음, (creator, peer) 페어당 활성 conv 최대 1개.
 *   - GROUP: 멤버 ≤ 100 (creator 포함), 모든 멤버 tenant 멤버, creator↔각 멤버 차단 없음.
 *   - 멤버 추가: 기존 멤버는 ALREADY_MEMBER, tenant 미멤버는 NOT_TENANT_MEMBER, 차단 관계는 BLOCKED 로 skip.
 *   - 멤버 제거: actor 가 ADMIN/OWNER 또는 self. soft remove (leftAt SET).
 */
import {
  prismaWithTenant,
  withTenantTx,
} from "@/lib/db/prisma-tenant-client";
import type {
  Conversation,
  ConversationMember,
} from "@/generated/prisma/client";
import { getCurrentTenant } from "@yangpyeon/core/tenant/context";
import { findTenantMembership } from "@/lib/tenant-router/membership";
import { isBlocked } from "./blocks";
import { MessengerError } from "./types";

/** GROUP 멤버 수 한도 (ADR-030 부속결정 #5 — Phase 1 ≤100). */
export const GROUP_MEMBER_LIMIT = 100;

export type SkipReason = "ALREADY_MEMBER" | "NOT_TENANT_MEMBER" | "BLOCKED";

export interface SkippedMember {
  userId: string;
  reason: SkipReason;
}

/**
 * DM 페어 멱등 — 같은 (creator, peer) 의 활성 DIRECT 가 있으면 반환, 없으면 생성.
 *
 * @returns conversation + created (true 면 신규).
 *
 * 검증:
 *   - peer 가 동일 tenant 의 멤버 (TenantMembership row 존재).
 *   - creator/peer 양방향 차단 없음.
 *
 * 동시성:
 *   - Phase 1 은 application-layer 멱등만 (DB UNIQUE 페어 인덱스 미도입).
 *   - 두 동시 호출이 모두 fresh 면 2개 conversation 생성될 수 있음 — 다음 호출은 가장 오래된 것 반환.
 *   - Phase 2 (체크리스트): 정렬된 member-id pair hash 컬럼에 UNIQUE partial index 도입 검토.
 */
export async function findOrCreateDirect(input: {
  creatorId: string;
  peerId: string;
}): Promise<{ conversation: Conversation; created: boolean }> {
  if (input.creatorId === input.peerId) {
    throw new MessengerError("FORBIDDEN", "본인과의 DIRECT 는 생성할 수 없습니다");
  }
  const ctx = getCurrentTenant();

  const peerMembership = await findTenantMembership({
    tenantId: ctx.tenantId,
    userId: input.peerId,
  });
  if (!peerMembership) {
    throw new MessengerError(
      "TENANT_MEMBERSHIP_REQUIRED",
      "상대방이 동일 tenant 의 멤버가 아닙니다",
    );
  }

  if (await isBlocked({ userIdA: input.creatorId, userIdB: input.peerId })) {
    throw new MessengerError(
      "USER_BLOCKED",
      "차단 관계의 사용자와는 DIRECT 를 생성할 수 없습니다",
    );
  }

  // 활성 DIRECT 중 양쪽 모두 leftAt IS NULL 인 페어 검색.
  const existing = await prismaWithTenant.conversation.findFirst({
    where: {
      kind: "DIRECT",
      archivedAt: null,
      AND: [
        {
          members: {
            some: { userId: input.creatorId, leftAt: null },
          },
        },
        {
          members: {
            some: { userId: input.peerId, leftAt: null },
          },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return { conversation: existing, created: false };
  }

  const created = await withTenantTx(ctx.tenantId, async (tx) => {
    const conv = await tx.conversation.create({
      data: {
        kind: "DIRECT",
        createdById: input.creatorId,
      },
    });
    await tx.conversationMember.createMany({
      data: [
        {
          conversationId: conv.id,
          userId: input.creatorId,
          role: "OWNER",
        },
        {
          conversationId: conv.id,
          userId: input.peerId,
          role: "OWNER",
        },
      ],
    });
    return conv;
  });

  return { conversation: created, created: true };
}

/**
 * GROUP 생성 — creator + memberIds.
 *
 * Throws:
 *   - GROUP_MEMBER_LIMIT_EXCEEDED — 멤버 + creator > 100
 *   - TENANT_MEMBERSHIP_REQUIRED — 한 명이라도 tenant 미멤버
 *   - GROUP_MEMBER_BLOCKED — creator↔member 차단 관계
 */
export async function createGroup(input: {
  creatorId: string;
  memberIds: string[];
  title: string;
}): Promise<{
  conversation: Conversation;
  members: ConversationMember[];
}> {
  const ctx = getCurrentTenant();
  // creator 자신이 memberIds 에 포함될 수도 있으므로 unique 처리 후 creator 제거.
  const others = Array.from(new Set(input.memberIds)).filter(
    (u) => u !== input.creatorId,
  );

  if (others.length === 0) {
    throw new MessengerError(
      "FORBIDDEN",
      "GROUP 은 creator 외 최소 1명이 필요합니다",
    );
  }
  // creator(1) + others = 총 멤버.
  if (others.length + 1 > GROUP_MEMBER_LIMIT) {
    throw new MessengerError(
      "GROUP_MEMBER_LIMIT_EXCEEDED",
      `GROUP 은 최대 ${GROUP_MEMBER_LIMIT}명까지 가능합니다`,
      { attempted: others.length + 1, limit: GROUP_MEMBER_LIMIT },
    );
  }

  // 모든 other 가 tenant 멤버인지 일괄 검증.
  for (const userId of others) {
    const m = await findTenantMembership({
      tenantId: ctx.tenantId,
      userId,
    });
    if (!m) {
      throw new MessengerError(
        "TENANT_MEMBERSHIP_REQUIRED",
        "tenant 미멤버 사용자가 포함되어 있습니다",
        { userId },
      );
    }
  }

  // creator↔each member 차단 검증.
  for (const userId of others) {
    if (await isBlocked({ userIdA: input.creatorId, userIdB: userId })) {
      throw new MessengerError(
        "GROUP_MEMBER_BLOCKED",
        "차단 관계의 사용자가 포함되어 있습니다",
        { blockedUserId: userId },
      );
    }
  }

  return withTenantTx(ctx.tenantId, async (tx) => {
    const conv = await tx.conversation.create({
      data: {
        kind: "GROUP",
        title: input.title,
        createdById: input.creatorId,
      },
    });
    const memberData = [
      {
        conversationId: conv.id,
        userId: input.creatorId,
        role: "OWNER" as const,
      },
      ...others.map((userId) => ({
        conversationId: conv.id,
        userId,
        role: "MEMBER" as const,
      })),
    ];
    await tx.conversationMember.createMany({ data: memberData });
    const members = await tx.conversationMember.findMany({
      where: { conversationId: conv.id },
    });
    return { conversation: conv, members };
  });
}

/**
 * 멤버 추가 — actor 는 OWNER/ADMIN.
 *
 * 룰 위반은 throw 가 아닌 skipped 배열로 반환 — 부분 성공 UX.
 * (예: 10명 추가 시 2명이 이미 멤버 → 8명 added + 2명 skipped)
 *
 * Throws:
 *   - NOT_FOUND — conversation 미존재 (RLS 차단 포함)
 *   - FORBIDDEN — DIRECT 에 멤버 추가 시도
 *   - GROUP_MEMBER_LIMIT_EXCEEDED — 추가 후 합계 > 100
 */
export async function addMembers(input: {
  conversationId: string;
  actorId: string;
  userIds: string[];
}): Promise<{
  added: ConversationMember[];
  skipped: SkippedMember[];
}> {
  const ctx = getCurrentTenant();

  const conv = await prismaWithTenant.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, kind: true, archivedAt: true },
  });
  if (!conv || conv.archivedAt !== null) {
    throw new MessengerError("NOT_FOUND", "대화를 찾을 수 없습니다");
  }
  if (conv.kind === "DIRECT") {
    throw new MessengerError(
      "FORBIDDEN",
      "DIRECT 에는 멤버를 추가할 수 없습니다",
    );
  }

  const activeMembers = await prismaWithTenant.conversationMember.findMany({
    where: { conversationId: conv.id, leftAt: null },
    select: { userId: true },
  });
  const activeUserIds = new Set(activeMembers.map((m) => m.userId));

  const candidates = Array.from(new Set(input.userIds));
  const skipped: SkippedMember[] = [];
  const toAdd: string[] = [];

  for (const userId of candidates) {
    if (activeUserIds.has(userId)) {
      skipped.push({ userId, reason: "ALREADY_MEMBER" });
      continue;
    }
    const m = await findTenantMembership({
      tenantId: ctx.tenantId,
      userId,
    });
    if (!m) {
      skipped.push({ userId, reason: "NOT_TENANT_MEMBER" });
      continue;
    }
    if (await isBlocked({ userIdA: input.actorId, userIdB: userId })) {
      skipped.push({ userId, reason: "BLOCKED" });
      continue;
    }
    toAdd.push(userId);
  }

  if (toAdd.length === 0) {
    return { added: [], skipped };
  }

  if (activeUserIds.size + toAdd.length > GROUP_MEMBER_LIMIT) {
    throw new MessengerError(
      "GROUP_MEMBER_LIMIT_EXCEEDED",
      `멤버 추가 후 ${GROUP_MEMBER_LIMIT}명을 초과합니다`,
      {
        currentActive: activeUserIds.size,
        attemptedAdd: toAdd.length,
        limit: GROUP_MEMBER_LIMIT,
      },
    );
  }

  const added = await withTenantTx(ctx.tenantId, async (tx) => {
    // soft-removed (leftAt SET) row 가 있으면 leftAt clear, 없으면 INSERT.
    // ON CONFLICT 가 없으므로 case-by-case.
    const results: ConversationMember[] = [];
    for (const userId of toAdd) {
      const existing = await tx.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: conv.id,
            userId,
          },
        },
      });
      if (existing) {
        // re-add (leftAt 이 NOT NULL 인 row 만 도달 가능 — 위에서 active 는 skip)
        const updated = await tx.conversationMember.update({
          where: { id: existing.id },
          data: { leftAt: null, joinedAt: new Date() },
        });
        results.push(updated);
      } else {
        const created = await tx.conversationMember.create({
          data: {
            conversationId: conv.id,
            userId,
            role: "MEMBER",
          },
        });
        results.push(created);
      }
    }
    return results;
  });

  return { added, skipped };
}

/**
 * 멤버 제거 — soft remove (leftAt SET).
 *
 * 권한:
 *   - actorIsAdmin=true → 누구든 제거 가능
 *   - actorIsAdmin=false → 본인만 self leave 가능 (removerUserId === removedUserId)
 *
 * Throws:
 *   - NOT_FOUND — 대화 또는 멤버 미존재
 *   - FORBIDDEN — 권한 부족
 */
export async function removeMember(input: {
  conversationId: string;
  removerUserId: string;
  removedUserId: string;
  actorIsAdmin: boolean;
}): Promise<ConversationMember> {
  if (!input.actorIsAdmin && input.removerUserId !== input.removedUserId) {
    throw new MessengerError(
      "FORBIDDEN",
      "본인만 self leave 가능합니다 (admin 권한 필요)",
    );
  }

  const member = await prismaWithTenant.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.removedUserId,
      },
    },
  });
  if (!member || member.leftAt !== null) {
    throw new MessengerError("NOT_FOUND", "멤버를 찾을 수 없습니다");
  }

  return prismaWithTenant.conversationMember.update({
    where: { id: member.id },
    data: { leftAt: new Date() },
  });
}

/**
 * 자기 멤버 설정 갱신 (pin/mute).
 *
 * Throws:
 *   - NOT_FOUND — 멤버 row 없음
 */
export async function updateMemberSelf(input: {
  conversationId: string;
  userId: string;
  pinned?: boolean;
  /** ISO string 또는 null (해제). undefined 면 변경 없음. */
  mutedUntil?: Date | null;
}): Promise<ConversationMember> {
  const member = await prismaWithTenant.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
    },
  });
  if (!member || member.leftAt !== null) {
    throw new MessengerError("NOT_FOUND", "멤버 정보를 찾을 수 없습니다");
  }

  const data: {
    pinnedAt?: Date | null;
    mutedUntil?: Date | null;
  } = {};
  if (input.pinned !== undefined) {
    data.pinnedAt = input.pinned ? new Date() : null;
  }
  if (input.mutedUntil !== undefined) {
    data.mutedUntil = input.mutedUntil;
  }

  return prismaWithTenant.conversationMember.update({
    where: { id: member.id },
    data,
  });
}

/**
 * 대화 archive (soft delete) — OWNER 권한 호출자 보장은 라우트에서.
 *
 * Throws:
 *   - NOT_FOUND — 대화 미존재
 */
export async function archiveConversation(input: {
  conversationId: string;
  /** actorId 는 audit 용. 권한 검증은 라우트에서. */
  actorId: string;
}): Promise<Conversation> {
  void input.actorId;
  const conv = await prismaWithTenant.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, archivedAt: true },
  });
  if (!conv) {
    throw new MessengerError("NOT_FOUND", "대화를 찾을 수 없습니다");
  }
  if (conv.archivedAt !== null) {
    return prismaWithTenant.conversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });
  }
  return prismaWithTenant.conversation.update({
    where: { id: input.conversationId },
    data: { archivedAt: new Date() },
  });
}
