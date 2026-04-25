/**
 * GET /api/v1/almanac/categories
 *
 * 트랙별 카테고리 + 활성 콘텐츠 개수.
 * - 가드: PUBLISHABLE 키 (allowAnonymous)
 * - 캐시: `Cache-Control: public, s-maxage=300, stale-while-revalidate=900` (5분)
 *
 * 응답:
 *   {
 *     success:true,
 *     data: {
 *       byTrack: {
 *         hustle: [{slug,name,nameEn,icon,sortOrder,count}, ...],
 *         work:   [...],
 *         ...
 *       }
 *     }
 *   }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
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
      "Access-Control-Allow-Headers": "x-api-key, content-type",
      Vary: "Origin",
    };
  }
  return {};
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
      const { track } = parsed.data;

      // ── 1) 카테고리 메타 ─────────────────────────────────────────────
      const where: Prisma.ContentCategoryWhereInput = track ? { track } : {};
      const categories = await prisma.contentCategory.findMany({
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

      // ── 2) 카테고리별 활성 콘텐츠 개수 ─────────────────────────────
      const counts = await prisma.contentItem.groupBy({
        by: ["categoryId"],
        where: { qualityFlag: { not: "blocked" } },
        _count: { _all: true },
      });
      const countMap = new Map<string, number>();
      for (const c of counts) {
        if (c.categoryId) countMap.set(c.categoryId, c._count._all);
      }

      // ── 3) 트랙별 그룹핑 ────────────────────────────────────────────
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
        "public, s-maxage=300, stale-while-revalidate=900"
      );
      for (const [k, v] of Object.entries(corsHeaders)) {
        res.headers.set(k, v);
      }
      return res;
    } catch (err) {
      console.error("[GET /api/v1/almanac/categories] error", err);
      return errorResponse(
        "INTERNAL_ERROR",
        "카테고리 조회 중 오류가 발생했습니다",
        500
      );
    }
  },
  { allowAnonymous: true }
);

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
}
