import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSessionFromCookies,
  type DashboardSessionPayload,
} from "@/lib/auth";
import { Role } from "@/generated/prisma/enums";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

/**
 * Server Component / Layout 전용.
 * 미인증 시 /login으로 redirect (never 반환).
 * cookies() 직접 호출로 x-middleware-subrequest 헤더 우회를 구조적으로 차단 (CVE-2025-29927).
 */
export async function requireSession(): Promise<DashboardSessionPayload> {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  return session;
}

/**
 * Server Component / Layout 전용.
 * role 부족 시 /로 redirect.
 */
export async function requireRole(
  role: Role | Role[],
): Promise<DashboardSessionPayload> {
  const session = await requireSession();
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(session.role as Role)) redirect("/");
  return session;
}

type AuthApiResult =
  | { session: DashboardSessionPayload; response?: never }
  | { session?: never; response: NextResponse };

/**
 * Route Handler 전용.
 * 미인증 시 401 NextResponse 반환 + AUTH_FAILED 감사 로그 기록.
 * discriminated union으로 핸들러에서 session 검증 누락 구조적 불가.
 */
export async function requireSessionApi(
  request: NextRequest,
): Promise<AuthApiResult> {
  const session = await getSessionFromCookies();
  if (!session) {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.nextUrl.pathname,
      ip: extractClientIp(request.headers),
      status: 401,
      action: "AUTH_FAILED",
      detail: "세션 없음 또는 만료",
    });
    return {
      response: NextResponse.json({ error: "인증 필요" }, { status: 401 }),
    };
  }
  return { session };
}

/**
 * Route Handler 전용.
 * role 부족 시 403 NextResponse 반환 + FORBIDDEN 감사 로그 기록.
 */
export async function requireRoleApi(
  request: NextRequest,
  role: Role | Role[],
): Promise<AuthApiResult> {
  const result = await requireSessionApi(request);
  if (result.response) return result;
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(result.session.role as Role)) {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.nextUrl.pathname,
      ip: extractClientIp(request.headers),
      status: 403,
      action: "FORBIDDEN",
      detail: `${result.session.email} role=${result.session.role} required=${allowed.join("|")}`,
    });
    return {
      response: NextResponse.json(
        { error: "권한 부족" },
        { status: 403 },
      ),
    };
  }
  return { session: result.session };
}
