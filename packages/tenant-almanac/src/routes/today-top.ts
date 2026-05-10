/**
 * Almanac plugin route — GET /api/v1/t/<tenant>/today-top
 *
 * PLUGIN-MIG-3 (S99 Chunk B). 본체 출처: src/app/api/v1/t/[tenant]/today-top/route.ts.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.5 contract.
 *
 * 캐시: public, s-maxage=600, stale-while-revalidate=1800 (10분).
 *
 * 알고리즘 (트랙별 score_today 내림차순):
 *   score_today = 0.4 * metric.views + 0.6 * item.score
 *   - 단, item.publishedAt 이 24시간 이내이면 1.5x boost
 *
 * 스키마 정합:
 *   - ContentItemMetric.itemId (spec 의 contentItemId 가 아님 — schema.prisma:783).
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

const TOP_N = 10;

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식")
    .optional(),
});

function getDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

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

    const dateStr = parsed.data.date ?? todayUtcYmd();
    const { start, end } = getDayRange(dateStr);
    const boostThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

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

    const res = successResponse({ date: dateStr, byTrack: result });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=600, stale-while-revalidate=1800",
    );
    return applyCors(request, res);
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/today-top] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "today-top 조회 중 오류가 발생했습니다",
      500,
    );
  }
};

export const OPTIONS: TenantRouteHandler = async ({ request }) =>
  preflightResponse(request);
