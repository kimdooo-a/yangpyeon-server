import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api-guard";
import { successResponse } from "@/lib/api-response";
import {
  listActiveSessions,
  findSessionByToken,
  touchSessionLastUsed,
} from "@/lib/sessions/tokens";
import { V1_REFRESH_COOKIE } from "@/lib/jwt-v1";

/**
 * GET /api/v1/auth/sessions — 현재 사용자의 활성 세션 목록 (Phase 15-D).
 *
 * revokedAt IS NULL AND expiresAt > NOW() 만 포함. lastUsedAt desc 순.
 * 현재 브라우저 세션을 `current: true` 로 표시 (쿠키 tokenHash 매칭).
 *
 * 세션 37: 현재 세션이 식별되면 lastUsedAt 을 NOW 로 갱신 (UI "마지막 사용" 정확도 ↑).
 * rotation 시점 의존성 제거 — 사용자가 보안 페이지를 열 때마다 "방금" 반영.
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  const token = request.cookies.get(V1_REFRESH_COOKIE)?.value;
  let currentSessionId: string | undefined;
  if (token) {
    const lookup = await findSessionByToken(token);
    if (
      lookup.status === "active" &&
      lookup.session &&
      lookup.session.userId === user.sub
    ) {
      currentSessionId = lookup.session.id;
      try {
        await touchSessionLastUsed(currentSessionId);
      } catch {
        // race — 조회 사이 revoke 된 경우 무시
      }
    }
  }
  const sessions = await listActiveSessions(user.sub, currentSessionId);
  return successResponse({ sessions });
});
