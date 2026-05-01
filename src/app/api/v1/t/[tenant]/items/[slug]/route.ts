/**
 * GET /api/v1/t/<tenant>/items/[slug]
 *
 * 단일 콘텐츠 상세.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.2 contract.
 *
 * 가드:
 *   - withTenant — Bearer pub_/srv_ 키 또는 cookie 멤버십 검증.
 *   - K3 cross-validation: dbTenant.slug === pathTenant.slug.
 *
 * RLS:
 *   - prismaWithTenant 가 SET LOCAL app.tenant_id 적용.
 *   - findUnique({ slug }) 는 (tenantId, slug) composite unique 라 schema.prisma:769 의
 *     `tenantId_slug` compound 키로 조회. 다른 tenant 의 slug 는 자동 격리.
 *
 * 캐시:
 *   - public, s-maxage=120, stale-while-revalidate=600 (2분).
 *
 * 부수효과:
 *   - viewCount += 1 (fire-and-forget, 응답 차단 X).
 *
 * 에러:
 *   - 404 NOT_FOUND — slug 없음 또는 qualityFlag === "blocked".
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";

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
      "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
      Vary: "Origin",
    };
  }
  return {};
}

export const GET = withTenant(async (request, _user, tenant, context) => {
  try {
    const params = (await context!.params) as {
      tenant: string;
      slug: string;
    };
    const parsed = slugSchema.safeParse(params.slug);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }
    const slug = parsed.data;

    // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const item = await db.contentItem.findUnique({
      where: {
        tenantId_slug: {
          tenantId: tenant.id,
          slug,
        },
      },
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

    void db.contentItem
      .update({
        where: { id: item.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch((e) =>
        console.warn("[items/:slug] viewCount increment failed", e),
      );

    const corsHeaders = buildCorsHeaders(request);
    const res = successResponse(item);
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600",
    );
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/items/:slug] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "콘텐츠 상세 조회 중 오류가 발생했습니다",
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
