import { NextRequest } from "next/server";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { deliver } from "@/lib/drains";
import { writeAuditLog } from "@/lib/audit-log";
import type { LogDrainEntry } from "@/lib/types/supabase-clone";

// 글로벌 운영자 콘솔 — default tenant UUID 사용 (ADR-023 §5)
// 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID } as const;

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withRole(["ADMIN"], async (request: NextRequest, user, context) => {
  const { id } = await (context as RouteContext).params;
  const db = tenantPrismaFor(OPS_CTX);
  const drain = await db.logDrain.findUnique({ where: { id } });
  if (!drain) return errorResponse("NOT_FOUND", "로그 드레인을 찾을 수 없습니다", 404);

  const sample: LogDrainEntry = {
    timestamp: new Date().toISOString(),
    level: "info",
    source: "ypserver-dashboard",
    message: "테스트 로그 드레인 전송",
    metadata: { triggeredBy: user.email, drainId: id },
  };

  const result = await deliver(drain, [sample]);

  await db.logDrain.update({
    where: { id },
    data: {
      lastDeliveredAt: new Date(),
      failureCount: result.failed > 0 ? drain.failureCount + 1 : 0,
    },
  });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: `/api/v1/log-drains/${id}/test`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "LOG_DRAIN_TEST",
    detail: `${user.email} -> ${drain.name} delivered=${result.delivered} failed=${result.failed} ${result.error ?? ""}`,
  });

  return successResponse(result);
});
