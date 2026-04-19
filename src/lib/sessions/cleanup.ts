import { prisma } from "@/lib/prisma";

/**
 * 만료 세션 정리 (Phase 15 Auth Advanced Step 1 / SP-015 결과 채택안).
 *
 * 세션 32: `$executeRaw DELETE ... NOW() - INTERVAL '1 day'` 단일 쿼리.
 * 세션 39: 각 만료 row 별 SESSION_EXPIRE 감사 로그 기록을 위해
 *          `$queryRaw` SELECT → `$executeRaw` DELETE 2-step 으로 재설계.
 *          Prisma ORM filter 가 PG TIMESTAMP(3) timezone-naive + adapter-pg 의
 *          9시간 KST 오프셋 문제로 회피 (raw SQL + `expires_at::text` 캐스팅).
 * 세션 40: 컬럼을 TIMESTAMPTZ(3) 로 마이그레이션. 컬럼 자체는 정확한 timestamptz 가
 *          되었으나 E2E 재현 결과 Prisma 7 adapter-pg 가 timestamptz 컬럼 SELECT 시도
 *          server timezone wall-clock 을 UTC ms 로 직접 해석하는 9h 시프트가 양방향
 *          (binding + parsing) 으로 존재. 정공법: SELECT 의 cutoff 를 PG 측
 *          `NOW() - INTERVAL '1 day'` 로 위임 + `expires_at::text` 캐스팅으로
 *          PG 가 직접 ISO+offset 문자열 (예: "2026-04-18 05:14:19.232+00") 반환 →
 *          JS `new Date(text)` 가 정확한 UTC ms 로 파싱. DELETE 는 ORM `deleteMany`.
 *
 * partial index `WHERE expires_at > NOW()` 가 PG 제약(NOW() STABLE)으로 불가하므로,
 * 일반 복합 인덱스 `(user_id, revoked_at, expires_at)` + 본 cleanup job 조합을 유지.
 * 만료 1일 경과분만 삭제하여 감사/디버깅용 grace를 둔다.
 */

export interface ExpiredSessionEntry {
  id: string;
  userId: string;
  expiresAt: Date;
}

export interface CleanupResult {
  deleted: number;
  expiredEntries: ExpiredSessionEntry[];
}

/**
 * SESSION_EXPIRE 감사 로그 detail 페이로드 생성. 순수 함수 — 단위 테스트 대상.
 * scheduler 가 각 expired entry 에 대해 호출하여 `writeAuditLogDb({..., detail})` 로 넘긴다.
 */
export function buildSessionExpireAuditDetail(entry: ExpiredSessionEntry): string {
  return JSON.stringify({
    sessionId: entry.id,
    userId: entry.userId,
    expiresAt: entry.expiresAt.toISOString(),
    reason: "expired",
  });
}

export async function cleanupExpiredSessions(): Promise<CleanupResult> {
  // SELECT: cutoff 는 PG 측 NOW()-INTERVAL 위임 (binding-side TZ 시프트 회피).
  // expires_at::text 캐스팅으로 PG 가 정확한 ISO+offset 문자열 반환 → JS new Date() 정확 파싱.
  const rows = await prisma.$queryRaw<
    Array<{ id: string; userId: string; expiresAt: string }>
  >`
    SELECT id, user_id AS "userId", (expires_at::text) AS "expiresAt"
    FROM sessions
    WHERE expires_at < NOW() - INTERVAL '1 day'
  `;
  if (rows.length === 0) {
    return { deleted: 0, expiredEntries: [] };
  }
  const ids = rows.map((r) => r.id);
  const result = await prisma.session.deleteMany({
    where: { id: { in: ids } },
  });
  return {
    deleted: result.count,
    expiredEntries: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      // PG ::text 결과 예: "2026-04-18 05:14:19.232+00" — new Date() 가 ISO 해석.
      expiresAt: new Date(r.expiresAt),
    })),
  };
}
