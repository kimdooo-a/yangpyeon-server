import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/api-guard";
import { runCleanupsNow } from "@/lib/cleanup-scheduler";
import { errorResponse } from "@/lib/api-response";
import { extractClientIp } from "@/lib/audit-log";

/**
 * POST /api/admin/cleanup/run — 관리자 수동 cleanup 실행.
 *
 * 세션 35 `src/lib/cleanup-scheduler.ts` 의 자동 스케줄(매일 KST 03:00)과 별개로,
 * ADMIN 이 즉시 4종 cleanup(sessions / rate-limit / jwks-retired / webauthn-challenges)을 실행.
 *
 * 인증: 쿠키 세션 우선, Bearer fallback (withRole). CSRF 는 proxy.ts 가 Referer 검증.
 * 감사 로그: `CLEANUP_EXECUTED_MANUAL` (actor + summary 포함).
 */
export const POST = withRole(
  ["ADMIN"],
  async (request: NextRequest, actor) => {
    try {
      const summary = await runCleanupsNow({
        userId: actor.sub,
        email: actor.email,
        ip: extractClientIp(request.headers),
      });
      return NextResponse.json({
        success: true,
        data: {
          summary,
          executedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "cleanup 실행 실패";
      return errorResponse("CLEANUP_FAILED", message, 500);
    }
  },
);
