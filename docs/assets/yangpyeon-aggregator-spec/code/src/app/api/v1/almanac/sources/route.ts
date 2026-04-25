/**
 * GET /api/v1/almanac/sources
 *
 * 활성 콘텐츠 소스 메타.
 * - 가드: PUBLISHABLE 키 (allowAnonymous)
 * - 캐시: `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (1시간)
 *
 * 쿼리 파라미터:
 *   kind     ?: RSS | HTML | API | FIRECRAWL
 *   country  ?: ISO-3166-1 alpha-2
 *
 * 응답:
 *   { success:true, data:{ sources: [{slug,name,kind,country,defaultTrack,lastSuccessAt}] } }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withApiKey } from "@/lib/api-guard-publishable";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const querySchema = z.object({
  kind: z.enum(["RSS", "HTML", "API", "FIRECRAWL"]).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "country는 ISO 2자리 코드")
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
      const { kind, country } = parsed.data;

      const where: Prisma.ContentSourceWhereInput = {
        active: true,
        ...(kind && { kind }),
        ...(country && { country: country.toUpperCase() }),
      };

      const sources = await prisma.contentSource.findMany({
        where,
        orderBy: [{ name: "asc" }],
        select: {
          slug: true,
          name: true,
          kind: true,
          country: true,
          defaultTrack: true,
          lastSuccessAt: true,
        },
      });

      const corsHeaders = buildCorsHeaders(request);
      const res = successResponse({ sources });
      res.headers.set(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=86400"
      );
      for (const [k, v] of Object.entries(corsHeaders)) {
        res.headers.set(k, v);
      }
      return res;
    } catch (err) {
      console.error("[GET /api/v1/almanac/sources] error", err);
      return errorResponse(
        "INTERNAL_ERROR",
        "소스 조회 중 오류가 발생했습니다",
        500
      );
    }
  },
  { allowAnonymous: true }
);

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
}
