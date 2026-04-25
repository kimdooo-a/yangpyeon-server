import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/api-guard";
import { getAuditMetrics } from "@/lib/audit-metrics";

/**
 * GET /api/admin/audit/health — safeAudit 카운터 메트릭 조회 (ADR-021 §amendment).
 *
 * 인메모리 카운터라 PM2 reload 시 리셋. 1차 가시성 도구 — "지금 audit 가
 * silently 실패 중인가?"를 즉시 답한다. 누적 추세는 `audit_logs` 테이블 자체가
 * source of truth.
 *
 * 응답 shape:
 *   {
 *     startedAt: ISO,
 *     uptimeSeconds: number,
 *     total: { success, failure, failureRate },
 *     byBucket: [{ name, success, failure, failureRate, lastFailureAt, lastFailureMessage }, ...]
 *   }
 *
 * byBucket 은 실패 많은 순 → 호출량 많은 순 정렬. context 의 첫 2 segment 만
 * 버킷명으로 사용 (cleanup-scheduler 의 entry-id 같은 high-cardinality 차단).
 *
 * 인증: ADMIN 만. CSRF 는 proxy.ts 가 Referer 검증.
 * 캐시: no-store.
 */
export const GET = withRole(["ADMIN"], async (_request: NextRequest) => {
  const snapshot = getAuditMetrics();
  return NextResponse.json(
    { success: true, data: snapshot },
    { headers: { "Cache-Control": "no-store" } },
  );
});
