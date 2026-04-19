import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse } from "@/lib/api-response";
import {
  listActiveSessions,
  findSessionByToken,
} from "@/lib/sessions/tokens";
import { V1_REFRESH_COOKIE } from "@/lib/jwt-v1";

/**
 * GET /api/v1/auth/sessions — 현재 사용자의 활성 세션 목록 (Phase 15-D).
 *
 * revokedAt IS NULL AND expiresAt > NOW() 만 포함. lastUsedAt desc 순.
 * 현재 브라우저 세션을 `current: true` 로 표시 (쿠키 tokenHash 매칭).
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  const token = request.cookies.get(V1_REFRESH_COOKIE)?.value;
  let currentSessionId: string | undefined;
  if (token) {
    const lookup = await findSessionByToken(token);
    if (lookup.status === "active" && lookup.session) {
      currentSessionId = lookup.session.id;
    }
  }
  const sessions = await listActiveSessions(user.sub, currentSessionId);
  return successResponse({ sessions });
});
