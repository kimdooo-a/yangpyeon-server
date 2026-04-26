import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { memberListSchema } from "@/lib/schemas/member";
import { paginatedResponse, errorResponse } from "@/lib/api-response";
import { runWithTenant } from "@yangpyeon/core/tenant/context";
import { prismaWithTenant } from "@/lib/db/prisma-tenant-client";

// 운영 콘솔 — default tenant 로 RLS bypass (ADR-023 §5 운영자 BYPASS_RLS)
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";

export const GET = withRole(["ADMIN", "MANAGER"], async (request: NextRequest) => {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = memberListSchema.safeParse(params);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다";
    return errorResponse("VALIDATION_ERROR", message, 400);
  }

  const { page, limit, search, role, isActive } = parsed.data;
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive;

  const result = await runWithTenant({ tenantId: DEFAULT_TENANT_UUID, bypassRls: true }, async () => {
    const [users, total] = await Promise.all([
      prismaWithTenant.user.findMany({
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
      prismaWithTenant.user.count({ where }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersTyped = users as any[];
    // 세션 43: Date 필드는 raw SELECT + ::text 로 정확 읽기 (parsing-side 시프트 회피).
    // orderBy 는 ORM 결과(createdAt desc) 순서 유지 — Map 병합으로 순서 안전.
    const ids = usersTyped.map((u) => u.id as string);
    const dateMap = new Map<string, { lastLoginAt: string | null; createdAt: string }>();
    if (ids.length > 0) {
      const dateRows = (await prismaWithTenant.$queryRaw`
        SELECT id,
          (last_login_at::text) AS last_login_at_text,
          (created_at::text)    AS created_at_text
        FROM users
        WHERE id = ANY(${ids}::text[])
      `) as Array<{ id: string; last_login_at_text: string | null; created_at_text: string }>;
      for (const r of dateRows) {
        dateMap.set(r.id, {
          lastLoginAt: r.last_login_at_text
            ? new Date(r.last_login_at_text).toISOString()
            : null,
          createdAt: new Date(r.created_at_text).toISOString(),
        });
      }
    }

    return { users: usersTyped, total: total as number, dateMap };
  });

  const { users, total, dateMap } = result;
  const withDates = users.map((u) => {
    const d = dateMap.get(u.id as string);
    return {
      ...u,
      lastLoginAt: d?.lastLoginAt ?? null,
      createdAt: d?.createdAt ?? null,
    };
  });

  return paginatedResponse(withDates, { page, limit, total });
});
