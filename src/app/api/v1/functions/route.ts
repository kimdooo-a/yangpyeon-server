import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

export const runtime = "nodejs";

// 글로벌 운영자 콘솔 — default tenant UUID 사용 (ADR-023 §5)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

const MAX_CODE_SIZE = 256 * 1024;

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  code: z.string().min(1).max(MAX_CODE_SIZE),
  runtime: z.enum(["NODE_VM", "WORKER_THREAD"]).default("NODE_VM"),
  enabled: z.boolean().default(true),
});

// GET: 본인 소유 함수 목록
export const GET = withRole(
  ["ADMIN"],
  async (_request: NextRequest, user) => {
    const rows = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
      return prismaWithTenant.edgeFunction.findMany({
        where: { ownerId: user.sub },
        orderBy: { updatedAt: "desc" },
        include: {
          runs: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { id: true, startedAt: true, status: true },
          },
        },
      });
    });
    // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
    const fnDateMap = await fetchDateFieldsText(
      "edge_functions",
      rows.map((r) => r.id),
      ["updated_at"],
    );
    const runIds = rows.flatMap((r) => r.runs.map((run) => run.id));
    const runDateMap = await fetchDateFieldsText(
      "edge_function_runs",
      runIds,
      ["started_at"],
    );
    const data = rows.map((r) => {
      const fnD = fnDateMap.get(r.id);
      const lastRun = r.runs[0];
      const runD = lastRun ? runDateMap.get(lastRun.id) : null;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        runtime: r.runtime,
        enabled: r.enabled,
        updatedAt: toIsoOrNull(fnD?.updated_at),
        lastRun: lastRun
          ? { startedAt: toIsoOrNull(runD?.started_at), status: lastRun.status }
          : null,
      };
    });
    return successResponse(data);
  }
);

// POST: 신규 함수
export const POST = withRole(
  ["ADMIN"],
  async (request: NextRequest, user) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_JSON", "잘못된 요청 형식", 400);
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "검증 실패";
      return errorResponse("VALIDATION_ERROR", msg, 400);
    }
    try {
      const fn = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID }, async () => {
        return prismaWithTenant.edgeFunction.create({
          data: {
            name: parsed.data.name,
            description: parsed.data.description,
            code: parsed.data.code,
            runtime: parsed.data.runtime,
            enabled: parsed.data.enabled,
            ownerId: user.sub,
          },
        });
      });
      return successResponse({ id: fn.id, name: fn.name }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "생성 실패";
      return errorResponse("CREATE_FAILED", msg, 400);
    }
  }
);
