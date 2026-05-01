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
    return successResponse({ block }, 201);
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
