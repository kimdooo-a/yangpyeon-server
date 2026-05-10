/**
 * Almanac plugin route — GET /api/v1/t/<tenant>/items/:slug
 *
 * PLUGIN-MIG-3 (S99 Chunk B). 본체 출처: src/app/api/v1/t/[tenant]/items/[slug]/route.ts.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.2 contract.
 *
 * 가드/RLS:
 *   - findUnique({ tenantId_slug }) — schema.prisma 의 (tenantId, slug) composite unique 사용.
 *
 * 캐시: public, s-maxage=120, stale-while-revalidate=600 (2분).
 *
 * 부수효과:
 *   - viewCount += 1 (fire-and-forget, 응답 차단 X).
 *
 * 에러:
 *   - 404 NOT_FOUND — slug 없음 또는 qualityFlag === "blocked".
 */
import { z } from "zod";
import type { TenantRouteHandler } from "@yangpyeon/core";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyCors, preflightResponse } from "../lib/cors";

const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "slug 형식 오류");

export const GET: TenantRouteHandler = async ({ request, tenant, params }) => {
  try {
    const parsed = slugSchema.safeParse(params.slug);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }
    const slug = parsed.data;

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

    const res = successResponse(item);
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600",
    );
    return applyCors(request, res);
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/items/:slug] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "콘텐츠 상세 조회 중 오류가 발생했습니다",
      500,
    );
  }
};

export const OPTIONS: TenantRouteHandler = async ({ request }) =>
  preflightResponse(request);
