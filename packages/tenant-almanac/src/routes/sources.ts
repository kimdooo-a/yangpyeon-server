/**
 * Almanac plugin route — GET /api/v1/t/<tenant>/sources
 *
 * PLUGIN-MIG-3 (S99 Chunk B). 본체 출처: src/app/api/v1/t/[tenant]/sources/route.ts.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.4 contract.
 *
 * 캐시: public, s-maxage=3600, stale-while-revalidate=86400.
 */
import { z } from "zod";
import type { TenantRouteHandler } from "@yangpyeon/core";
import { Prisma } from "@/generated/prisma/client";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyCors, preflightResponse } from "../lib/cors";

const querySchema = z.object({
  kind: z.enum(["RSS", "HTML", "API", "FIRECRAWL"]).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "country는 ISO 2자리 코드")
    .optional(),
});

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
    const { kind, country } = parsed.data;

    const where: Prisma.ContentSourceWhereInput = {
      active: true,
      ...(kind && { kind }),
      ...(country && { country: country.toUpperCase() }),
    };

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

    const res = successResponse({ sources });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    return applyCors(request, res);
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/sources] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "소스 조회 중 오류가 발생했습니다",
      500,
    );
  }
};

export const OPTIONS: TenantRouteHandler = async ({ request }) =>
  preflightResponse(request);
