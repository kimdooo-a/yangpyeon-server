import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/api-guard";
import { memberListSchema } from "@/lib/schemas/member";
import { paginatedResponse, errorResponse } from "@/lib/api-response";
import type { Prisma } from "@/generated/prisma/client";

export const GET = withRole(["ADMIN", "MANAGER"], async (request: NextRequest) => {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = memberListSchema.safeParse(params);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { page, limit, search, role, isActive } = parsed.data;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  // 세션 43: Date 필드는 raw SELECT + ::text 로 정확 읽기 (parsing-side 시프트 회피).
  // orderBy 는 ORM 결과(createdAt desc) 순서 유지 — Map 병합으로 순서 안전.
  const ids = users.map((u) => u.id);
  const dateMap = new Map<string, { lastLoginAt: string | null; createdAt: string }>();
  if (ids.length > 0) {
    const dateRows = await prisma.$queryRaw<
      Array<{ id: string; last_login_at_text: string | null; created_at_text: string }>
    >`
      SELECT id,
        (last_login_at::text) AS last_login_at_text,
        (created_at::text)    AS created_at_text
      FROM users
      WHERE id = ANY(${ids}::text[])
    `;
    for (const r of dateRows) {
      dateMap.set(r.id, {
        lastLoginAt: r.last_login_at_text
          ? new Date(r.last_login_at_text).toISOString()
          : null,
        createdAt: new Date(r.created_at_text).toISOString(),
      });
    }
  }
  const withDates = users.map((u) => {
    const d = dateMap.get(u.id);
    return {
      ...u,
      lastLoginAt: d?.lastLoginAt ?? null,
      createdAt: d?.createdAt ?? null,
    };
  });

  return paginatedResponse(withDates, { page, limit, total });
});
