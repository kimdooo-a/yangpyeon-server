/**
 * Phase 15 Auth Advanced Step 6 — DB-backed Rate Limiter (FR-6.3)
 *
 * 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md
 *
 * 알고리즘: fixed-window. bucketKey 별 (hits, windowStart) 한 행으로 관리.
 *   요청 시 atomic UPSERT — 윈도우 만료면 hits=1 + windowStart=NOW() 로 reset, 아니면 hits++.
 *
 * 인메모리(rate-limit.ts)와의 차이:
 *   - 메모리는 슬라이딩 윈도우 + 워커별 분리(부정확).
 *   - DB는 fixed window + 노드/워커 통합 카운트(정확). PM2 cluster 안전.
 *
 * cleanup: 일 1회 cron 으로 windowStart < NOW() - INTERVAL '1 day' 행 DELETE.
 *   sessions cleanup 패턴(src/lib/sessions/cleanup.ts) 동일 운용.
 *
 * 다중 노드 확장: 본 구현은 단일 PG 가정. 다중 PG → Redis 또는 별도 rate-limit PG 인스턴스 분리.
 */

import { prisma } from "@/lib/prisma";

export interface RateLimitDbResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  hits: number;
}

/**
 * 단일 atomic UPSERT 로 카운터 증가/리셋 후 결과 반환.
 *
 * 쿼리:
 *   - 신규 키: hits=1, windowStart=NOW().
 *   - 기존 키 + 윈도우 미만료: hits++, windowStart 유지.
 *   - 기존 키 + 윈도우 만료: hits=1, windowStart=NOW().
 *
 * Postgres `(windowMs * INTERVAL '1 ms')` 표현으로 동적 윈도우 크기 지원.
 *
 * @param key 식별자 (예: "v1Login:ip:1.2.3.4" / "v1Login:email:user@x.com")
 * @param maxRequests 윈도우 내 허용 최대 요청 수
 * @param windowMs 윈도우 크기 (ms)
 */
export async function checkRateLimitDb(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitDbResult> {
  if (maxRequests <= 0 || windowMs <= 0) {
    throw new Error("maxRequests and windowMs must be positive");
  }

  // PG가 직접 reset 잔여 시간을 계산해서 반환.
  // 세션 40에서 컬럼이 TIMESTAMPTZ(3) 으로 마이그레이션되어 9h 시프트는 해소되었으나,
  // PG 측 EXTRACT(EPOCH FROM (windowStart + windowMs - NOW())) 패턴은 race-safe (UPSERT 한 번에
  // 카운터 + 잔여시간 동시 결정) 이라 유지. 클라이언트 측 Date.now() 분리 호출은 race window 발생.
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 글로벌 rate limit: rate_limit_buckets 는 테넌트 간 공유 카운터 (IP/email 기준 집계). tenant_id 컬럼 없음 — cross-tenant 개념 비해당
  const rows = await prisma.$queryRaw<
    { hits: number; reset_ms: string }[]
  >`
    INSERT INTO rate_limit_buckets (bucket_key, hits, window_start, updated_at)
    VALUES (${key}, 1, NOW(), NOW())
    ON CONFLICT (bucket_key) DO UPDATE
    SET
      hits = CASE
        WHEN rate_limit_buckets.window_start + (${windowMs} * INTERVAL '1 ms') < NOW()
          THEN 1
        ELSE rate_limit_buckets.hits + 1
      END,
      window_start = CASE
        WHEN rate_limit_buckets.window_start + (${windowMs} * INTERVAL '1 ms') < NOW()
          THEN NOW()
        ELSE rate_limit_buckets.window_start
      END,
      updated_at = NOW()
    RETURNING
      hits,
      GREATEST(0, EXTRACT(EPOCH FROM (rate_limit_buckets.window_start + (${windowMs} * INTERVAL '1 ms') - NOW())) * 1000)::text AS reset_ms
  `;

  const row = rows[0];
  if (!row) {
    // 발생 불가 (UPSERT 는 항상 1행 RETURNING) — 방어적 처리
    return { allowed: true, remaining: maxRequests - 1, resetMs: windowMs, hits: 1 };
  }

  // EXTRACT(EPOCH ...) 결과는 NUMERIC. Prisma 가 string 으로 직렬화하므로 parseFloat.
  const resetMs = Math.max(0, Math.floor(parseFloat(row.reset_ms)));
  const allowed = row.hits <= maxRequests;
  const remaining = Math.max(0, maxRequests - row.hits);

  return { allowed, remaining, resetMs, hits: row.hits };
}

/**
 * 만료된 버킷 정리 — cron 또는 수동 호출.
 * 1일 이상 갱신 없는 행 DELETE. 인덱스 (windowStart) 활용.
 * @returns 삭제된 행 수
 */
export async function cleanupExpiredRateLimitBuckets(): Promise<number> {
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 글로벌 rate limit 정리 cron: rate_limit_buckets 는 테넌트 공유 테이블 — cross-tenant 개념 비해당
  const result = await prisma.$executeRaw`
    DELETE FROM rate_limit_buckets
    WHERE window_start < NOW() - INTERVAL '1 day'
  `;
  return Number(result);
}

/**
 * Bucket key 빌더 — 라우트별 일관된 네이밍.
 * 형식: "<scope>:<dimension>:<value>"
 *   scope     = "v1Login" / "mfaChallenge" / "webauthnAssert" 등
 *   dimension = "ip" / "email" / "user"
 *
 * IP 키와 email/user 키를 분리 배치하여 다른 임계값 적용 가능
 * (예: IP=20/min 광역, email=5/min 정밀).
 */
export function buildBucketKey(
  scope: string,
  dimension: "ip" | "email" | "user",
  value: string,
): string {
  return `${scope}:${dimension}:${value.toLowerCase()}`;
}
