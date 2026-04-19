import { prisma } from "@/lib/prisma";

/**
 * 만료 세션 정리 (Phase 15 Auth Advanced Step 1 / SP-015 결과 채택안).
 *
 * 세션 32: `$executeRaw DELETE ... NOW() - INTERVAL '1 day'` 단일 쿼리.
 * 세션 39: 각 만료 row 별 SESSION_EXPIRE 감사 로그 기록을 위해
 *          `$queryRaw` SELECT → `$executeRaw` DELETE 2-step 으로 재설계.
 *          Prisma ORM filter (session.findMany) 는 PG TIMESTAMP(3) timezone-naive +
 *          adapter-pg 의 KST 9시간 오프셋 문제로 회피 (자세한 설명은 함수 위 주석).
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

/**
 * 세션 39 — PG TIMESTAMP(3) timezone-naive + Prisma 7 adapter-pg 에서
 * JS Date 바인딩 시 KST 9시간 오프셋이 발생하는 문제(CK `pg-timestamp-naive-js-date-tz-offset`)
 * 를 E2E 에서 재확인함. filter cutoff 는 반드시 PG 서버측 `NOW() - INTERVAL '1 day'` 로
 * 위임하여 클라이언트 TZ 변환을 우회.
 *
 * - SELECT: `$queryRaw` 로 eligible row 스냅샷 확보 (id/userId/expiresAt).
 *   `expires_at::text` 캐스팅으로 Prisma 가 재해석하지 않는 원본 문자열 보존.
 * - DELETE: `$executeRaw DELETE ... WHERE id = ANY($ids)` 로 해당 id 만 제거 (race 방지).
 */
export async function cleanupExpiredSessions(): Promise<CleanupResult> {
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
  const deletedCount = await prisma.$executeRaw`
    DELETE FROM sessions WHERE id = ANY(${ids}::text[])
  `;
  const expiredEntries: ExpiredSessionEntry[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    // PG 측 text 값은 타임존 없음 문자열 — UTC 간주로 Date 생성.
    // audit 상세에는 이 Date 의 toISOString() 가 기록됨. 9h 오프셋 리스크 회피.
    expiresAt: new Date(r.expiresAt.replace(" ", "T") + "Z"),
  }));
  return { deleted: Number(deletedCount), expiredEntries };
}
