import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { verifyAccessToken, type AccessTokenPayload } from "@/lib/jwt-v1";
import { errorResponse } from "@/lib/api-response";
import type { Role } from "@/generated/prisma";

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

/** 대시보드 쿠키 세션 확인 → ADMIN 페이로드 반환 */
async function checkDashboardSession(
  request: NextRequest
): Promise<AccessTokenPayload | null> {
  const token = request.cookies.get("dashboard_session")?.value;
  if (!token) return null;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return {
      sub: "dashboard-admin",
      email: "admin@dashboard",
      role: "ADMIN" as Role,
      type: "access",
    };
  } catch {
    return null;
  }
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    // 1. Bearer Token 확인
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      const payload = await verifyAccessToken(bearerToken);
      if (payload) return handler(request, payload, context);
      return errorResponse("INVALID_TOKEN", "유효하지 않은 토큰입니다", 401);
    }

    // 2. 대시보드 쿠키 세션 fallback
    const dashboardUser = await checkDashboardSession(request);
    if (dashboardUser) return handler(request, dashboardUser, context);

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
