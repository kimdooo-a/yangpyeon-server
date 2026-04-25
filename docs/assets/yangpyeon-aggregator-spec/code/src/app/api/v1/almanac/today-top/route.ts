/**
 * GET /api/v1/almanac/today-top
 *
 * 오늘의 트랙별 TOP N (기본 N=10).
 * - 가드: PUBLISHABLE 키 (allowAnonymous)
 * - 캐시: `Cache-Control: public, s-maxage=600, stale-while-revalidate=1800` (10분)
 *
 * 알고리즘 (트랙별 score_today 내림차순):
 *   score_today = 0.4 * metric.views + 0.6 * item.score
 *   - 단, item.publishedAt 이 24시간 이내이면 1.5x boost
 *
 * 쿼리 파라미터:
 *   date  ?: YYYY-MM-DD (default = today, UTC 기준)
 *
 * 응답:
 *   {
 *     success:true,
 *     data: {
 *       date: "2026-04-25",
 *       byTrack: { build: [...], hustle:[...], ... }
 *     }
 *   }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { withApiKey } from "@/lib/api-guard-publishable";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

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
      "Access-Control-Allow-Headers": "x-api-key, content-type",
      Vary: "Origin",
    };
  }
  return {};
}

/** YYYY-MM-DD → 하루 범위(UTC) [start, end) */
function getDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function todayKstYmd(): string {
  // UTC 기준 ISO date 부분만 추출 (KST 변환은 클라이언트에서 표시용으로 처리)
  return new Date().toISOString().slice(0, 10);
}

export const GET = withApiKey(
  ["PUBLISHABLE"],
  async (request) => {
    try {
      const { searchParams } = new URL(request.url);
      const parsed = querySchema.safeParse(
        Object.fromEntries(searchParams)
      );
      if (!parsed.success) {
        return errorResponse(
          "VALIDATION_ERROR",
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }

      const dateStr = parsed.data.date ?? todayKstYmd();
      const { start, end } = getDayRange(dateStr);
      const boostThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // ── 1) 당일 메트릭 조회 (date == start 자정 키) ──────────────────
      // ContentItemMetric 스키마의 date 필드가 DateTime(UTC 자정)이라 가정.
      const metrics = await prisma.contentItemMetric.findMany({
        where: { date: { gte: start, lt: end } },
        select: { contentItemId: true, views: true },
      });
      const viewsMap = new Map<string, number>();
      for (const m of metrics) {
        viewsMap.set(m.contentItemId, m.views);
      }

      // ── 2) 후보 콘텐츠 (블락 제외) — 트랙별 상위 후보군 충분히 확보 ─
      // 단순화를 위해 score 상위 1000개를 받아 메모리에서 트랙별 가중합 정렬.
      // (운영 규모가 커지면 트랙별 raw SQL 또는 머터리얼라이즈드 뷰로 교체)
      const candidates = await prisma.contentItem.findMany({
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

      // ── 3) score_today 계산 + 트랙별 분류 ────────────────────────────
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
        const isFresh =
          item.publishedAt !== null && item.publishedAt >= boostThreshold;
        const boost = isFresh ? 1.5 : 1.0;
        const scoreToday = (0.4 * views + 0.6 * baseScore) * boost;

        byTrack[t].push({ ...item, scoreToday });
      }

      // ── 4) 트랙별 TOP N ─────────────────────────────────────────────
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
        "public, s-maxage=600, stale-while-revalidate=1800"
      );
      for (const [k, v] of Object.entries(corsHeaders)) {
        res.headers.set(k, v);
      }
      return res;
    } catch (err) {
      console.error("[GET /api/v1/almanac/today-top] error", err);
      return errorResponse(
        "INTERNAL_ERROR",
        "today-top 조회 중 오류가 발생했습니다",
        500
      );
    }
  },
  { allowAnonymous: true }
);

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
}
