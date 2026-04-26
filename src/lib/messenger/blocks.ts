/**
 * src/lib/messenger/blocks.ts
 *
 * 사용자 차단 — UserBlock 모델의 단일 진실 소스.
 *
 * 양방향 의미:
 *   - DB row 는 단방향 (blockerId → blockedId).
 *   - 비즈니스 룰은 양방향 — A→B 차단이면 B→A 송신/멘션도 차단.
 *   - 따라서 isBlocked 는 두 방향 모두 조회.
 *
 * 모든 호출은 withTenant() 가드 내부 — TenantContext 가 이미 주입되어 있다.
 * prismaWithTenant 가 SET LOCAL app.tenant_id 를 자동 적용하므로 명시 tenantId where 불필요.
 */
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";
import type { UserBlock } from "@/generated/prisma/client";
import { MessengerError } from "./types";

/**
 * 양방향 차단 검증.
 *
 * @returns A↔B 어느 방향이든 차단 row 가 있으면 true.
 *
 * 핫패스: 메시지 송신마다 호출. 인덱스 (tenantId, blockedId) + RLS 가 자동 작용.
 * Phase 2 진입 시 in-memory LRU 캐시 검토.
 */
export async function isBlocked(input: {
  userIdA: string;
  userIdB: string;
}): Promise<boolean> {
  if (input.userIdA === input.userIdB) return false;
  const row = await prismaWithTenant.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: input.userIdA, blockedId: input.userIdB },
        { blockerId: input.userIdB, blockedId: input.userIdA },
      ],
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * 차단 생성.
 *
 * Throws:
 *   - BLOCK_SELF — 자기 자신 차단 시도
 *   - DUPLICATE_BLOCK — 이미 차단됨 ((blockerId, blockedId) UNIQUE 위반)
 */
export async function blockUser(input: {
  blockerId: string;
  blockedId: string;
  reason?: string;
}): Promise<UserBlock> {
  if (input.blockerId === input.blockedId) {
    throw new MessengerError("BLOCK_SELF", "자기 자신은 차단할 수 없습니다");
  }
  // UNIQUE (blockerId, blockedId) — 중복은 사전 lookup 으로 친화적 에러 반환.
  const existing = await prismaWithTenant.userBlock.findFirst({
    where: { blockerId: input.blockerId, blockedId: input.blockedId },
    select: { id: true },
  });
  if (existing) {
    throw new MessengerError(
      "DUPLICATE_BLOCK",
      "이미 차단된 사용자입니다",
      { existingBlockId: existing.id },
    );
  }
  return prismaWithTenant.userBlock.create({
    data: {
      blockerId: input.blockerId,
      blockedId: input.blockedId,
      reason: input.reason ?? null,
    },
  });
}

/**
 * 차단 해제.
 *
 * blockId 가 본인의 차단 row 인지 verify (cross-user 침투 방어).
 * Throws NOT_FOUND 면 row 없음 또는 다른 사람의 차단.
 */
export async function unblockUser(input: {
  blockerId: string;
  blockId: string;
}): Promise<void> {
  const row = await prismaWithTenant.userBlock.findUnique({
    where: { id: input.blockId },
    select: { id: true, blockerId: true },
  });
  if (!row || row.blockerId !== input.blockerId) {
    throw new MessengerError("NOT_FOUND", "차단 정보를 찾을 수 없습니다");
  }
  await prismaWithTenant.userBlock.delete({ where: { id: input.blockId } });
}

/**
 * 본인이 차단한 사용자 목록 — 최신순.
 */
export async function listMyBlocks(input: {
  blockerId: string;
}): Promise<UserBlock[]> {
  return prismaWithTenant.userBlock.findMany({
    where: { blockerId: input.blockerId },
    orderBy: { createdAt: "desc" },
  });
}
