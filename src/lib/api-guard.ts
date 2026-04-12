import { NextRequest } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/jwt-v1";
import { errorResponse } from "@/lib/api-response";
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
 * v1 API 인증 가드 — Bearer 토큰 전용 (쿠키 fallback 제거됨).
 *
 * 대시보드 쿠키 세션이 필요한 Route Handler는 @/lib/auth-guard의
 * requireSessionApi/requireRoleApi 를 사용할 것. (CVE-2025-29927 방어)
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    const bearerToken = extractBearerToken(request);
    if (!bearerToken) {
      return errorResponse("UNAUTHORIZED", "인증 토큰이 필요합니다", 401);
    }
    const payload = await verifyAccessToken(bearerToken);
    if (!payload) {
      return errorResponse("INVALID_TOKEN", "유효하지 않은 토큰입니다", 401);
    }
    return runHandler(handler, request, payload, context);
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
