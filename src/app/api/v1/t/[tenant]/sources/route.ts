/**
 * GET /api/v1/t/<tenant>/sources
 *
 * 활성 콘텐츠 소스 메타.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.4 contract.
 *
 * 가드:
 *   - withTenant — Bearer pub_/srv_ 키 또는 cookie 멤버십 검증.
 *   - K3 cross-validation: dbTenant.slug === pathTenant.slug.
 *
 * RLS:
 *   - prismaWithTenant 가 매 query 마다 SET LOCAL app.tenant_id 적용.
 *
 * 캐시:
 *   - public, s-maxage=3600, stale-while-revalidate=86400 (1시간).
 *
 * 쿼리:
 *   kind?: RSS | HTML | API | FIRECRAWL
 *   country?: ISO 2자리
 *
 * 응답:
 *   { success:true, data:{ sources: [{slug,name,kind,country,defaultTrack,lastSuccessAt}] } }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";

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
      "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
      Vary: "Origin",
    };
  }
  return {};
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
    const { kind, country } = parsed.data;

    const where: Prisma.ContentSourceWhereInput = {
      active: true,
      ...(kind && { kind }),
      ...(country && { country: country.toUpperCase() }),
    };

    // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const sources = await db.contentSource.findMany({
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
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/sources] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "소스 조회 중 오류가 발생했습니다",
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
