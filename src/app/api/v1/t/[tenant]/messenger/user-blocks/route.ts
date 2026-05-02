/**
 * /api/v1/t/[tenant]/messenger/user-blocks
 *
 * GET  — 본인이 차단한 사용자 목록 (최신순).
 * POST — 차단 생성 (BLOCK_SELF / DUPLICATE_BLOCK 검증).
 *
 * audit: messenger.user_blocked.
 */
import { withTenant } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";
import { blockUser, listMyBlocks } from "@/lib/messenger/blocks";
import { blockUserSchema } from "@/lib/schemas/messenger/safety";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";
import { publishUserEvent } from "@/lib/messenger/sse";

export const runtime = "nodejs";

export const GET = withTenant(async (_request, user) => {
  try {
    const blocks = await listMyBlocks({ blockerId: user.sub });
    return successResponse({ blocks });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});

export const POST = withTenant(async (request, user, tenant) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = blockUserSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const block = await blockUser({
      blockerId: user.sub,
      blockedId: parsed.data.blockedId,
      reason: parsed.data.reason,
    });
    await emitMessengerAudit({
      event: "messenger.user_blocked",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: {
        tenantId: tenant.id,
        blockedUserId: parsed.data.blockedId,
        blockId: block.id,
      },
    });

    // M3 user 채널 — blocker 본인 채널 (cross-device sync 목적, PRD api-surface §4.3).
    // 차단당한 사람에게는 노출하지 않음 (stalker risk 차단).
    publishUserEvent(tenant.id, user.sub, "block.created", {
      blockId: block.id,
      blockedUserId: parsed.data.blockedId,
    });

    return successResponse({ block }, 201);
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
