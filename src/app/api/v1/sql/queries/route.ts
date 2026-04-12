import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import type { QueryScope } from "@/generated/prisma/client";

export const runtime = "nodejs";

const listQuerySchema = z.object({
  scope: z.enum(["PRIVATE", "SHARED", "FAVORITE"]).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  sql: z.string().min(1).max(50_000),
  scope: z.enum(["PRIVATE", "SHARED", "FAVORITE"]).default("PRIVATE"),
});

// 저장된 쿼리 목록 (본인 것 + SHARED는 전체 노출)
export const GET = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user) => {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "잘못된 쿼리 파라미터", 400);
  }

  const scope = parsed.data.scope;
  const where: Record<string, unknown> = {};
  if (scope) {
    // 특정 scope 요청: SHARED면 전체, 그 외는 본인만
    where.scope = scope as QueryScope;
    if (scope !== "SHARED") where.ownerId = user.sub;
  } else {
    // 기본: 본인 소유 OR SHARED
    where.OR = [{ ownerId: user.sub }, { scope: "SHARED" as QueryScope }];
  }

  const rows = await prisma.sqlQuery.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      sql: true,
      scope: true,
      ownerId: true,
      lastRunAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return successResponse(rows);
});

// 쿼리 저장
export const POST = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const created = await prisma.sqlQuery.create({
    data: {
      name: parsed.data.name,
      sql: parsed.data.sql,
      scope: parsed.data.scope as QueryScope,
      ownerId: user.sub,
    },
    select: {
      id: true,
      name: true,
      sql: true,
      scope: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return successResponse(created, 201);
});
