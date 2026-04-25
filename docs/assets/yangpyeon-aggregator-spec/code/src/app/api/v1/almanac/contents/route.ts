/**
 * GET /api/v1/almanac/contents
 *
 * Almanac(외부) 클라이언트용 콘텐츠 목록 API.
 * - 가드: `withApiKey(["PUBLISHABLE"], ..., { allowAnonymous: true })`
 *         익명 IP 60/min, 인증 키 600/min 으로 rate limit (caller에서 적용)
 * - 캐시: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
 * - CORS: `ALMANAC_ALLOWED_ORIGINS` (콤마 분리) Origin 화이트리스트
 *
 * 응답 형태:
 *   { success:true, data: { items, nextCursor, filters } }
 *
 * 커서 형식: base64(`${publishedAt.toISOString()}|${id}`)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withApiKey } from "@/lib/api-guard-publishable";
import { successResponse, errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

// TODO: yangpyeon에 이미 존재하는 rate limit 헬퍼(`RateLimitBucket`)와 연결.
// import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// ── 쿼리 스키마 ────────────────────────────────────────────────────────────
const querySchema = z.object({
  track: z
    .enum(["hustle", "work", "build", "invest", "learn", "community"])
    .optional(),
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

// ── 커서 헬퍼 ─────────────────────────────────────────────────────────────
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

// ── CORS 헬퍼 ─────────────────────────────────────────────────────────────
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

// ── GET ───────────────────────────────────────────────────────────────────
export const GET = withApiKey(
  ["PUBLISHABLE"],
  async (request, apiKey) => {
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

      // ── where 빌드 ────────────────────────────────────────────────────
      // ContentItem.publishedAt 은 non-nullable(필수) → DateTimeFilter 사용.
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

      // ── orderBy ───────────────────────────────────────────────────────
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

      // ── 커서 ──────────────────────────────────────────────────────────
      const parsedCursor = cursor ? parseCursor(cursor) : null;

      // ── 조회 ──────────────────────────────────────────────────────────
      const items = await prisma.contentItem.findMany({
        where,
        orderBy,
        take: limit + 1, // hasMore 판정용 +1
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

      // ── Audit log (yangpyeon AuditEntry 시그니처에 맞춤) ──────────────
      writeAuditLog({
        timestamp: new Date().toISOString(),
        method: request.method,
        path: new URL(request.url).pathname,
        ip: extractClientIp(request.headers),
        action: "ALMANAC_CONTENTS_LIST",
        userAgent: request.headers.get("user-agent") ?? undefined,
        detail: JSON.stringify({
          actor: apiKey ? `apikey:${apiKey.id}` : "anonymous",
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

      // ── 응답 + 캐시/CORS 헤더 ─────────────────────────────────────────
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
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      for (const [k, v] of Object.entries(corsHeaders)) {
        res.headers.set(k, v);
      }
      return res;
    } catch (err) {
      console.error("[GET /api/v1/almanac/contents] error", err);
      return errorResponse(
        "INTERNAL_ERROR",
        "콘텐츠 조회 중 오류가 발생했습니다",
        500
      );
    }
  },
  { allowAnonymous: true }
);

// ── OPTIONS (CORS preflight) ─────────────────────────────────────────────
export async function OPTIONS(request: NextRequest) {
  const headers = buildCorsHeaders(request);
  return new Response(null, { status: 204, headers });
}
