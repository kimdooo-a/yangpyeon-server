/**
 * GET /api/v1/t/<tenant>/today-top
 *
 * 오늘의 트랙별 TOP N (기본 N=10).
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.5 contract.
 *
 * 가드:
 *   - withTenant — Bearer pub_/srv_ 키 또는 cookie 멤버십 검증.
 *   - K3 cross-validation: dbTenant.slug === pathTenant.slug.
 *
 * RLS:
 *   - prismaWithTenant 가 ContentItem / ContentItemMetric 모두에 SET LOCAL app.tenant_id 적용.
 *
 * 캐시:
 *   - public, s-maxage=600, stale-while-revalidate=1800 (10분).
 *
 * 알고리즘 (트랙별 score_today 내림차순):
 *   score_today = 0.4 * metric.views + 0.6 * item.score
 *   - 단, item.publishedAt 이 24시간 이내이면 1.5x boost
 *
 * 쿼리:
 *   date?: YYYY-MM-DD (default = today, UTC)
 *
 * 응답:
 *   { success:true, data:{ date, byTrack:{ hustle:[...], work:[...], ... } } }
 *
 * 스키마 정합:
 *   - ContentItemMetric.itemId (spec 의 contentItemId 가 아님 — schema.prisma:783).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
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

const TOP_N = 10;

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식")
    .optional(),
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

function getDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export const GET = withTenant(async (request, _user, tenant) => {
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

    const dateStr = parsed.data.date ?? todayUtcYmd();
    const { start, end } = getDayRange(dateStr);
    const boostThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const metrics = await db.contentItemMetric.findMany({
      where: { date: { gte: start, lt: end } },
      select: { itemId: true, views: true },
    });
    const viewsMap = new Map<string, number>();
    for (const m of metrics) {
      viewsMap.set(m.itemId, m.views);
    }

    const candidates = await db.contentItem.findMany({
      where: { qualityFlag: { not: "blocked" } },
      orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
      take: 1000,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        aiSummary: true,
        track: true,
        url: true,
        imageUrl: true,
        score: true,
        publishedAt: true,
        category: {
          select: { slug: true, name: true, track: true, icon: true },
        },
        source: { select: { slug: true, name: true } },
      },
    });

    type Ranked = (typeof candidates)[number] & { scoreToday: number };
    const byTrack: Record<Track, Ranked[]> = {
      hustle: [],
      work: [],
      build: [],
      invest: [],
      learn: [],
      community: [],
    };

    for (const item of candidates) {
      const t = item.track as Track;
      if (!byTrack[t]) continue;
      const views = viewsMap.get(item.id) ?? 0;
      const baseScore = item.score ?? 0;
      const isFresh = item.publishedAt >= boostThreshold;
      const boost = isFresh ? 1.5 : 1.0;
      const scoreToday = (0.4 * views + 0.6 * baseScore) * boost;
      byTrack[t].push({ ...item, scoreToday });
    }

    const result: Record<Track, unknown[]> = {
      hustle: [],
      work: [],
      build: [],
      invest: [],
      learn: [],
      community: [],
    };
    for (const t of TRACKS) {
      result[t] = byTrack[t]
        .sort((a, b) => b.scoreToday - a.scoreToday)
        .slice(0, TOP_N)
        .map((x) => ({
          id: x.id,
          slug: x.slug,
          title: x.title,
          excerpt: x.excerpt,
          aiSummary: x.aiSummary,
          track: x.track,
          category: x.category,
          source: x.source,
          url: x.url,
          imageUrl: x.imageUrl,
          score: Number(x.scoreToday.toFixed(2)),
          publishedAt: x.publishedAt,
        }));
    }

    const corsHeaders = buildCorsHeaders(request);
    const res = successResponse({ date: dateStr, byTrack: result });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=600, stale-while-revalidate=1800",
    );
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/today-top] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "today-top 조회 중 오류가 발생했습니다",
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
