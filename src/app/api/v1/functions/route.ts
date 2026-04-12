import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
    const rows = await prisma.edgeFunction.findMany({
      where: { ownerId: user.sub },
      orderBy: { updatedAt: "desc" },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { startedAt: true, status: true },
        },
      },
    });
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      runtime: r.runtime,
      enabled: r.enabled,
      updatedAt: r.updatedAt,
      lastRun: r.runs[0]
        ? { startedAt: r.runs[0].startedAt, status: r.runs[0].status }
        : null,
    }));
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
      const fn = await prisma.edgeFunction.create({
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          code: parsed.data.code,
          runtime: parsed.data.runtime,
          enabled: parsed.data.enabled,
          ownerId: user.sub,
        },
      });
      return successResponse({ id: fn.id, name: fn.name }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "생성 실패";
      return errorResponse("CREATE_FAILED", msg, 400);
    }
  }
);
