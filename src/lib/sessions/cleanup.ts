import { prisma } from "@/lib/prisma";

/**
 * 만료 세션 정리 (Phase 15 Auth Advanced Step 1 / SP-015 결과 채택안).
 *
 * partial index `WHERE expires_at > NOW()` 가 PG 제약(NOW() STABLE)으로 불가하므로,
 * 일반 복합 인덱스 `(user_id, revoked_at, expires_at)` + 본 cleanup job 조합을 채택.
 * 만료 1일 경과분만 삭제하여 감사/디버깅용 grace를 둔다.
 *
 * 등록은 별도 스케줄러(Step 1에서는 인프라만 제공, 활성화는 후속 단계).
 */
export async function cleanupExpiredSessions(): Promise<{ deleted: number }> {
  const result = await prisma.$executeRaw`
    DELETE FROM "sessions"
    WHERE "expires_at" < NOW() - INTERVAL '1 day'
  `;
  return { deleted: Number(result) };
}
