import { NextRequest } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/jwt-v1";
import { errorResponse } from "@/lib/api-response";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

export type AuthenticatedHandler = (
  request: NextRequest,
  user: AccessTokenPayload,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

/**
 * 대시보드 쿠키 세션에서 실제 사용자를 조회하여 AccessTokenPayload 형태로 변환.
 * 하드코딩 ADMIN fallback 없음 — 실제 세션 주체의 role을 사용.
 *
 * CVE-2025-29927은 middleware 레벨의 x-middleware-subrequest 헤더 우회 버그이며,
 * Route Handler가 request.cookies/cookies()로 직접 읽는 경로는 영향받지 않음.
 */
async function resolveCookieSession(): Promise<AccessTokenPayload | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  // 레거시 토큰 (sub === "legacy")은 DB 조회 없이 그대로 통과
  if (session.sub === "legacy") {
    return {
      sub: "legacy",
      email: session.email,
      role: session.role as Role,
      type: "access",
    };
  }

  // DB에서 실제 사용자 검증 (비활성화된 계정 차단)
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 인증 인프라: 사용자 신원 확인은 tenant context 결정 전 단계 — base prisma 사용 정당 (membership.ts 동일 패턴)
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: "access",
  };
}

async function runHandler(
  handler: AuthenticatedHandler,
  request: NextRequest,
  user: AccessTokenPayload,
  context?: { params: Promise<Record<string, string>> }
): Promise<Response> {
  try {
    return await handler(request, user, context);
  } catch (err) {
    if (err instanceof Error && err.name === "StaleSessionError") {
      return errorResponse("STALE_SESSION", err.message, 401);
    }
    throw err;
  }
}

/**
 * v1 API 인증 가드 — Bearer 우선, 없으면 대시보드 쿠키 세션 fallback.
 *
 * Bearer는 외부 클라이언트용, 쿠키는 대시보드 내부 fetch 용.
 * 쿠키 경로는 실제 세션 주체의 role을 사용 (하드코딩 ADMIN 없음).
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      const payload = await verifyAccessToken(bearerToken);
      if (payload) return runHandler(handler, request, payload, context);
      return errorResponse("INVALID_TOKEN", "유효하지 않은 토큰입니다", 401);
    }

    const cookieUser = await resolveCookieSession();
    if (cookieUser) return runHandler(handler, request, cookieUser, context);

    return errorResponse("UNAUTHORIZED", "인증 토큰이 필요합니다", 401);
  };
}

export function withRole(roles: Role[], handler: AuthenticatedHandler) {
  return withAuth(async (request, user, context) => {
    if (!roles.includes(user.role)) {
      return errorResponse("FORBIDDEN", "권한이 부족합니다", 403);
    }
    return handler(request, user, context);
  });
}
