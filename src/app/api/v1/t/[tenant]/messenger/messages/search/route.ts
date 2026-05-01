/**
 * /api/v1/t/[tenant]/messenger/messages/search
 *
 * GET — 30일 윈도 본문 검색 (LIKE %q%, 사용자 멤버 conv 만, GIN trgm 가속).
 *
 * 가드:
 *   - withTenant + rate-limit 30/min/user.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit-guard";
import { searchMessages } from "@/lib/messenger/messages";
import { searchMessagesSchema } from "@/lib/schemas/messenger/messages";
import { messengerErrorResponse } from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

export const GET = withTenant(async (request, user) => {
  const limited = await applyRateLimit(request as unknown as NextRequest, {
    scope: "messenger.message_search",
    maxRequests: 30,
    windowMs: 60_000,
    identifier: { dimension: "user", value: user.sub },
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const parsed = searchMessagesSchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const result = await searchMessages({
      searcherId: user.sub,
      q: parsed.data.q,
      convId: parsed.data.convId,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });
    return successResponse(result);
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
