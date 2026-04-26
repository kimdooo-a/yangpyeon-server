/**
 * GET /api/v1/t/<tenant>/contents
 *
 * Almanac /explore 카드 피드용 콘텐츠 목록.
 * 인수인계서 `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §3.1 contract.
 *
 * 가드:
 *   - withTenant — Bearer pub_/srv_ 키 또는 cookie 멤버십 검증.
 *   - K3 cross-validation: dbTenant.slug === pathTenant.slug.
 *
 * RLS:
 *   - prismaWithTenant 가 매 query 마다 SET LOCAL app.tenant_id 적용.
 *   - 명시적 tenantId where 절 없이도 자기 tenant row 만 노출.
 *
 * 캐시:
 *   - public, s-maxage=60, stale-while-revalidate=300.
 *
 * 커서: base64url(`${publishedAt.toISOString()}|${id}`).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withTenant, prismaWithTenant } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

export const runtime = "nodejs";

const TRACKS = [
  "hustle",
  "work",
  "build",
  "invest",
  "learn",
  "community",
] as const;

const querySchema = z.object({
  track: z.enum(TRACKS).optional(),
  category: z.string().min(1).max(64).optional(),
  q: z.string().min(1).max(120).optional(),
  language: z.string().min(2).max(8).optional(),
  source: z.string().min(1).max(64).optional(),
  from: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional(),
  to: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional(),
  cursor: z.string().min(1).max(256).optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(50)),
  sort: z.enum(["latest", "popular", "featured"]).optional().default("latest"),
});

type CursorTuple = { publishedAt: Date; id: string };

function encodeCursor(item: { publishedAt: Date; id: string }): string {
  const ts = item.publishedAt.toISOString();
  return Buffer.from(`${ts}|${item.id}`, "utf8").toString("base64url");
}

function parseCursor(raw: string): CursorTuple | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const [ts, id] = decoded.split("|");
    if (!ts || !id) return null;
    return { publishedAt: new Date(ts), id };
  } catch {
    return null;
  }
}

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

export const GET = withTenant(async (request, user, _tenant) => {
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
    const {
      track,
      category,
      q,
      language,
      source,
      from,
      to,
      cursor,
      limit,
      sort,
    } = parsed.data;

    const publishedAtRange: Prisma.DateTimeFilter = {};
    if (from) publishedAtRange.gte = new Date(from);
    if (to) publishedAtRange.lte = new Date(to);

    const where: Prisma.ContentItemWhereInput = {
      qualityFlag: { not: "blocked" },
      ...(track && { track }),
      ...(category && { category: { slug: category } }),
      ...(language && { language }),
      ...(source && { source: { slug: source } }),
      ...(q && {
        title: { contains: q, mode: "insensitive" as const },
      }),
      ...(Object.keys(publishedAtRange).length > 0 && {
        publishedAt: publishedAtRange,
      }),
    };

    const orderBy: Prisma.ContentItemOrderByWithRelationInput[] =
      sort === "popular"
        ? [{ score: "desc" }, { publishedAt: "desc" }, { id: "desc" }]
        : sort === "featured"
          ? [
              { featured: "desc" },
              { publishedAt: "desc" },
              { id: "desc" },
            ]
          : [{ publishedAt: "desc" }, { id: "desc" }];

    const parsedCursor = cursor ? parseCursor(cursor) : null;

    const items = await prismaWithTenant.contentItem.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(parsedCursor && {
        skip: 1,
        cursor: { id: parsedCursor.id },
      }),
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        aiSummary: true,
        track: true,
        url: true,
        imageUrl: true,
        language: true,
        score: true,
        pinned: true,
        featured: true,
        qualityFlag: true,
        viewCount: true,
        publishedAt: true,
        createdAt: true,
        category: {
          select: { slug: true, name: true, track: true, icon: true },
        },
        source: { select: { slug: true, name: true } },
      },
    });

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, -1) : items;
    const nextCursor =
      hasMore && trimmed.length > 0
        ? encodeCursor(trimmed[trimmed.length - 1])
        : null;

    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: new URL(request.url).pathname,
      ip: extractClientIp(request.headers),
      action: "ALMANAC_CONTENTS_LIST",
      userAgent: request.headers.get("user-agent") ?? undefined,
      detail: JSON.stringify({
        actor: user.email,
        track,
        category,
        q,
        language,
        source,
        sort,
        limit,
        count: trimmed.length,
      }),
    });

    const corsHeaders = buildCorsHeaders(request);
    const res = successResponse({
      items: trimmed,
      nextCursor,
      filters: {
        track: track ?? null,
        category: category ?? null,
        q: q ?? null,
        language: language ?? null,
        source: source ?? null,
        from: from ?? null,
        to: to ?? null,
        sort,
      },
    });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  } catch (err) {
    console.error("[GET /api/v1/t/{tenant}/contents] error", err);
    return errorResponse(
      "INTERNAL_ERROR",
      "콘텐츠 조회 중 오류가 발생했습니다",
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
