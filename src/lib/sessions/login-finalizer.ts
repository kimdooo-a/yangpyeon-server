import { NextRequest, NextResponse } from "next/server";
import { createAccessToken, V1_REFRESH_COOKIE } from "@/lib/jwt-v1";
import { issueSession, REFRESH_TOKEN_MAX_AGE_SEC } from "./tokens";
import { writeAuditLogDb } from "@/lib/audit-log-db";
import { extractClientIp } from "@/lib/audit-log";
import type { Role } from "@/generated/prisma/client";

/**
 * Phase 15-D Refresh Token Rotation — 로그인 마감 공통 helper (세션 36).
 *
 * 3 경로에서 공통으로 쓰이는 (accessToken + opaque refresh + 쿠키 + audit 로그) 묶음:
 *   1. POST /api/v1/auth/login (비밀번호)
 *   2. POST /api/v1/auth/mfa/challenge (TOTP / recovery)
 *   3. POST /api/v1/auth/mfa/webauthn/assert-verify (Passkey)
 *
 * 변경 전: jwt-v1 `createRefreshToken` 으로 stateless JWT 를 쿠키에 내려보냄 (서버 revoke 불가).
 * 변경 후: Prisma `Session` 레코드 insert + opaque 토큰만 쿠키 → rotate/revoke 가능 + 감사 로그 완결성.
 */

export interface LoginUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export type LoginMethod = "password" | "totp" | "recovery" | "passkey";

export interface FinalizeLoginParams {
  request: NextRequest;
  user: LoginUser;
  method: LoginMethod;
  /** accessToken/user 외 응답 data 에 병합할 필드 (예: mfaMethod). */
  extraData?: Record<string, unknown>;
}

export async function finalizeLoginResponse(
  params: FinalizeLoginParams,
): Promise<NextResponse> {
  const ip = extractClientIp(params.request.headers);
  const userAgent = params.request.headers.get("user-agent") ?? null;

  const accessToken = await createAccessToken({
    userId: params.user.id,
    email: params.user.email,
    role: params.user.role,
  });
  const session = await issueSession({
    userId: params.user.id,
    ip,
    userAgent,
  });

  writeAuditLogDb({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: params.request.nextUrl.pathname,
    ip,
    action: "SESSION_LOGIN",
    userAgent: userAgent ?? undefined,
    detail: JSON.stringify({
      userId: params.user.id,
      sessionId: session.sessionId,
      method: params.method,
    }),
  });

  const response = NextResponse.json(
    {
      success: true,
      data: {
        accessToken,
        user: {
          id: params.user.id,
          email: params.user.email,
          name: params.user.name,
          role: params.user.role,
        },
        ...(params.extraData ?? {}),
      },
    },
    { status: 200 },
  );

  response.cookies.set(V1_REFRESH_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC,
    path: "/api/v1/",
  });

  return response;
}
