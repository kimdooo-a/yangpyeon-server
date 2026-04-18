/**
 * Phase 15 Auth Advanced Step 6 — Rate Limit Guard.
 *
 * 라우트 핸들러에서 일관된 패턴으로 DB-backed rate limit 적용:
 *   const blocked = await applyRateLimit(request, { scope: "v1Login", maxRequests: 5, windowMs: 60_000 });
 *   if (blocked) return blocked;
 *
 * IP 추출 우선순위: cf-connecting-ip > x-forwarded-for[0] > x-real-ip > "unknown".
 * email/user 별 추가 키는 옵션 인자로 지원 (정밀 제한).
 *
 * 본 헬퍼는 인메모리 fallback 을 의도적으로 제거 — DB 장애 시 throw 하여 라우트 500 으로 노출.
 *   "rate limit 우회로 모든 요청 통과" 보다 "auth 라우트 잠시 마비" 가 보안상 안전 (fail-closed).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitDb, buildBucketKey } from "./rate-limit-db";

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export interface RateLimitOptions {
  /** 라우트 식별자 (예: "v1Login", "mfaChallenge"). 버킷 키 prefix. */
  scope: string;
  /** 윈도우 내 허용 최대 요청 수. */
  maxRequests: number;
  /** 윈도우 크기 (ms). */
  windowMs: number;
  /** 추가로 잠금할 사용자 식별자 (email 또는 userId). 있으면 IP 키와 별도 카운트. */
  identifier?: { dimension: "email" | "user"; value: string };
}

/**
 * 라우트 시작부에서 호출. 한도 초과 시 429 응답을 반환, 통과 시 null.
 *
 * IP 키 한도 초과 시 즉시 차단. identifier 가 있으면 추가로 검사 (둘 중 먼저 초과한 쪽 적용).
 */
export async function applyRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const ipKey = buildBucketKey(options.scope, "ip", ip);

  const ipResult = await checkRateLimitDb(ipKey, options.maxRequests, options.windowMs);
  if (!ipResult.allowed) {
    return rateLimited(ipResult.resetMs);
  }

  if (options.identifier) {
    const idKey = buildBucketKey(
      options.scope,
      options.identifier.dimension,
      options.identifier.value,
    );
    const idResult = await checkRateLimitDb(idKey, options.maxRequests, options.windowMs);
    if (!idResult.allowed) {
      return rateLimited(idResult.resetMs);
    }
  }

  return null;
}

function rateLimited(resetMs: number): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000));
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: `요청이 너무 많습니다. ${retryAfterSec}초 후 재시도하세요.`,
        retryAfter: retryAfterSec,
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}
