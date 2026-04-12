import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  getSessionFromCookies,
  type DashboardSessionPayload,
} from "@/lib/auth";
import { Role } from "@/generated/prisma/enums";

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
 * 미인증 시 401 NextResponse 반환. discriminated union으로 핸들러에서 session 검증 누락 구조적 불가.
 */
export async function requireSessionApi(): Promise<AuthApiResult> {
  const session = await getSessionFromCookies();
  if (!session) {
    return {
      response: NextResponse.json({ error: "인증 필요" }, { status: 401 }),
    };
  }
  return { session };
}

/**
 * Route Handler 전용.
 * role 부족 시 403 NextResponse 반환.
 */
export async function requireRoleApi(
  role: Role | Role[],
): Promise<AuthApiResult> {
  const result = await requireSessionApi();
  if (result.response) return result;
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(result.session.role as Role)) {
    return {
      response: NextResponse.json(
        { error: "권한 부족" },
        { status: 403 },
      ),
    };
  }
  return { session: result.session };
}
