/**
 * /api/v1/t/[tenant]/messenger/user-blocks/[id]
 *
 * DELETE — 차단 해제 (cross-user 침투 방어 — blockerId 일치 검증은 헬퍼 내부).
 *
 * audit: messenger.user_unblocked.
 */
import { withTenant } from "@/lib/api-guard-tenant";
import { successResponse } from "@/lib/api-response";
import { unblockUser } from "@/lib/messenger/blocks";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

export const DELETE = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  try {
    await unblockUser({ blockerId: user.sub, blockId: id });
    await emitMessengerAudit({
      event: "messenger.user_unblocked",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: { tenantId: tenant.id, blockId: id },
    });
    return successResponse({ unblocked: true });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
