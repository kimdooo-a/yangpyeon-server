/**
 * GET /api/v1/t/<tenant>/categories
 *
 * 트랙별 카테고리 + 활성 콘텐츠 카운트.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.3 contract.
 *
 * 가드:
 *   - withTenant — Bearer pub_/srv_ 키 또는 cookie 멤버십 검증.
 *   - K3 cross-validation: dbTenant.slug === pathTenant.slug (api-guard-tenant.ts).
 *
 * RLS:
 *   - prismaWithTenant 가 매 query 마다 SET LOCAL app.tenant_id 적용.
 *   - 따라서 명시적 tenantId where 절 없이도 자기 tenant row 만 노출.
 *
 * 캐시:
 *   - public, s-maxage=300, stale-while-revalidate=900 (Almanac /explore ISR 5분과 정합).
 *
 * 응답:
 *   { success:true, data:{ byTrack:{ hustle:[...], work:[...], build:[...], invest:[...], learn:[...], community:[...] } } }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant, prismaWithTenant } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";

export const runtime = "nodejs";

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

function buildCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = (process.env.ALMANAC_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
      Vary: "Origin",
    };
  }
  return {};
}

export const GET = withTenant(async (request, _user, _tenant) => {
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

    const categories = await prismaWithTenant.contentCategory.findMany({
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

    const counts = await prismaWithTenant.contentItem.groupBy({
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

    const corsHeaders = buildCorsHeaders(request);
    const res = successResponse({ byTrack });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=900",
    );
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/categories] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "카테고리 조회 중 오류가 발생했습니다",
      500,
    );
  }
});

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request),
  });
}
