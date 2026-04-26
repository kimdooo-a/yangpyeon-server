import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";
import { runIsolatedFunction } from "@/lib/runner/isolated";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

export const runtime = "nodejs";

// 글로벌 운영자 콘솔 — default tenant UUID 사용 (ADR-023 §5)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

const bodySchema = z.object({
  input: z.unknown().optional(),
});

const ALLOWED_FETCH_HOSTS = ["api.github.com", "stylelucky4u.com"];

export const POST = withRole(["ADMIN"], async (request: NextRequest, user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const fn = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
    return prismaWithTenant.edgeFunction.findUnique({ where: { id } });
  });
  if (!fn) return errorResponse("NOT_FOUND", "함수를 찾을 수 없습니다", 404);
  if (fn.ownerId !== user.sub)
    return errorResponse("FORBIDDEN", "소유자만 실행할 수 있습니다", 403);
  if (!fn.enabled)
    return errorResponse("DISABLED", "비활성화된 함수입니다", 400);

  let body: unknown = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "잘못된 입력", 400);
  }

  const started = new Date();
  const result = await runIsolatedFunction(fn.code, {
    input: parsed.data.input ?? null,
    timeoutMs: 30_000,
    allowedFetchHosts: ALLOWED_FETCH_HOSTS,
  });
  const finished = new Date();

  await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
    return prismaWithTenant.edgeFunctionRun.create({
      data: {
        functionId: fn.id,
        status: result.status,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        startedAt: started,
        finishedAt: finished,
      },
    });
  });

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: `/api/v1/functions/${fn.id}/run`,
    ip: extractClientIp(request.headers),
    action: "EDGE_FN_RUN",
    detail: `${fn.name} → ${result.status} (${result.durationMs}ms)`,
    status: 200,
  });

  return successResponse({
    status: result.status,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    returnValue: result.returnValue,
  });
});
