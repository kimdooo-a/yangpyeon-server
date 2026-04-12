import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runReadonly } from "@/lib/pg/pool";
import { checkDangerousSql } from "@/lib/sql/danger-check";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";
import type { SqlRunResult } from "@/lib/types/supabase-clone";

export const runtime = "nodejs";

const bodySchema = z.object({
  sql: z.string().min(1, "SQL이 비어 있습니다").max(50_000, "SQL이 너무 깁니다 (최대 50KB)"),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
});

const MAX_ROWS = 1000;

export const POST = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { sql, timeoutMs } = parsed.data;

  // 1차 방어: 위험 키워드 체크
  const danger = checkDangerousSql(sql);
  if (danger.blocked) {
    return errorResponse("DANGEROUS_SQL", `위험 키워드가 감지되었습니다: ${danger.keyword}`, 400);
  }

  // 감사 로그 (실행 전 기록)
  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: "/api/v1/sql/execute",
    ip: extractClientIp(request.headers),
    action: "SQL_EXEC",
    detail: `${user.email} | ${sql.slice(0, 100)}`,
  });

  const startedAt = Date.now();
  try {
    const result = await runReadonly(sql, [], { timeoutMs: timeoutMs ?? 10_000 });
    const rowsRaw = result.rows as Record<string, unknown>[];
    const truncated = rowsRaw.length > MAX_ROWS;
    const rows = truncated ? rowsRaw.slice(0, MAX_ROWS) : rowsRaw;

    const payload: SqlRunResult = {
      rows,
      fields: result.fields,
      rowCount: result.rowCount,
      durationMs: Date.now() - startedAt,
      truncated,
    };
    return successResponse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "SQL 실행 실패";
    return errorResponse("SQL_ERROR", message, 400);
  }
});
