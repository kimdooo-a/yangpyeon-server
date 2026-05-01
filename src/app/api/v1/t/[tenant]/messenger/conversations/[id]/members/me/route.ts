/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/members/me
 *
 * PATCH — 본인 멤버 설정 갱신 (pin/mute).
 *
 * Note: 정적 segment "me" 가 동적 [userId] 보다 우선 매칭 (Next.js 라우팅 우선순위).
 */
import { withTenant } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";
import { updateMemberSelf } from "@/lib/messenger/conversations";
import { updateMemberSelfSchema } from "@/lib/schemas/messenger/conversations";
import { messengerErrorResponse } from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

export const PATCH = withTenant(async (request, user, _tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = updateMemberSelfSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const result = await updateMemberSelf({
      conversationId: id,
      userId: user.sub,
      pinned: parsed.data.pinned,
      mutedUntil:
        parsed.data.mutedUntil === undefined
          ? undefined
          : parsed.data.mutedUntil === null
            ? null
            : new Date(parsed.data.mutedUntil),
    });
    return successResponse({ member: result });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
