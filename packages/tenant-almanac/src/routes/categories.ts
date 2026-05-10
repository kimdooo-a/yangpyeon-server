/**
 * Almanac plugin route — GET /api/v1/t/<tenant>/categories
 *
 * PLUGIN-MIG-3 (S99 Chunk B). 본체 출처: src/app/api/v1/t/[tenant]/categories/route.ts.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.3 contract.
 *
 * 가드/RLS:
 *   - withTenant 가드 + K3 cross-validation 은 catch-all (`/api/v1/t/[tenant]/[...path]`) 에서 처리.
 *   - tenantPrismaFor({ tenantId }) 가 SET LOCAL app.tenant_id 적용 (memory rule
 *     project_workspace_singleton_globalthis — ALS propagation 깨짐 회피 closure 캡처).
 *
 * 캐시: public, s-maxage=300, stale-while-revalidate=900.
 */
import { z } from "zod";
import type { TenantRouteHandler } from "@yangpyeon/core";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyCors, preflightResponse } from "../lib/cors";

const TRACKS = [
  "hustle",
  "work",
  "build",
  "invest",
  "learn",
  "community",
] as const;
type Track = (typeof TRACKS)[number];

const querySchema = z.object({
  track: z.enum(TRACKS).optional(),
});

export const GET: TenantRouteHandler = async ({ request, tenant }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }
    const { track } = parsed.data;

    const where = track ? { track } : {};

    const db = tenantPrismaFor({ tenantId: tenant.id });
    const categories = await db.contentCategory.findMany({
      where,
      orderBy: [{ track: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        track: true,
        slug: true,
        name: true,
        nameEn: true,
        icon: true,
        sortOrder: true,
        description: true,
      },
    });

    const counts = await db.contentItem.groupBy({
      by: ["categoryId"],
      where: { qualityFlag: { not: "blocked" } },
      _count: { _all: true },
    });
    const countMap = new Map<string, number>();
    for (const c of counts) {
      if (c.categoryId) countMap.set(c.categoryId, c._count._all);
    }

    const byTrack: Record<Track, Array<Record<string, unknown>>> = {
      hustle: [],
      work: [],
      build: [],
      invest: [],
      learn: [],
      community: [],
    };
    for (const cat of categories) {
      const t = cat.track as Track;
      if (!byTrack[t]) continue;
      byTrack[t].push({
        slug: cat.slug,
        name: cat.name,
        nameEn: cat.nameEn,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
        description: cat.description,
        count: countMap.get(cat.id) ?? 0,
      });
    }

    const res = successResponse({ byTrack });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=900",
    );
    return applyCors(request, res);
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/categories] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "카테고리 조회 중 오류가 발생했습니다",
      500,
    );
  }
};

export const OPTIONS: TenantRouteHandler = async ({ request }) =>
  preflightResponse(request);
