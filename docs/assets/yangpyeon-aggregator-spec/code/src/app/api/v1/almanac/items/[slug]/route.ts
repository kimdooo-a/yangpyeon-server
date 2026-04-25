/**
 * GET /api/v1/almanac/items/[slug]
 *
 * 단일 콘텐츠 상세.
 * - 가드: PUBLISHABLE 키 (allowAnonymous)
 * - 캐시: `Cache-Control: public, s-maxage=120, stale-while-revalidate=600` (2분)
 * - 부수효과: viewCount 증가 (백그라운드, 응답 지연 X)
 *
 * 응답:
 *   { success:true, data: { ...item, category, source } }
 *
 * 에러:
 *   404 NOT_FOUND  — slug 없거나 qualityFlag === "blocked"
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { withApiKey } from "@/lib/api-guard-publishable";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug 형식 오류");

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
  async (request, _apiKey, context) => {
    try {
      // Next.js 16 App Router: params는 Promise
      const params = (await context!.params) as { slug: string };
      const parsed = slugSchema.safeParse(params.slug);
      if (!parsed.success) {
        return errorResponse(
          "VALIDATION_ERROR",
          parsed.error.issues.map((i) => i.message).join(", "),
          400
        );
      }
      const slug = parsed.data;

      const item = await prisma.contentItem.findUnique({
        where: { slug },
        include: {
          category: {
            select: {
              slug: true,
              name: true,
              nameEn: true,
              track: true,
              icon: true,
            },
          },
          source: {
            select: { slug: true, name: true, kind: true },
          },
        },
      });

      if (!item || item.qualityFlag === "blocked") {
        return errorResponse("NOT_FOUND", "콘텐츠 없음", 404);
      }

      // 조회수 증가 — 응답을 막지 않도록 fire-and-forget.
      // (실패해도 사용자 응답에는 영향 X. 에러는 콘솔로만 노출.)
      void prisma.contentItem
        .update({
          where: { id: item.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch((e) =>
          console.warn("[items/:slug] viewCount increment failed", e)
        );

      const corsHeaders = buildCorsHeaders(request);
      const res = successResponse(item);
      res.headers.set(
        "Cache-Control",
        "public, s-maxage=120, stale-while-revalidate=600"
      );
      for (const [k, v] of Object.entries(corsHeaders)) {
        res.headers.set(k, v);
      }
      return res;
    } catch (err) {
      console.error("[GET /api/v1/almanac/items/:slug] error", err);
      return errorResponse(
        "INTERNAL_ERROR",
        "콘텐츠 상세 조회 중 오류가 발생했습니다",
        500
      );
    }
  },
  { allowAnonymous: true }
);

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
}
