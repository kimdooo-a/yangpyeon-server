/**
 * /api/v1/t/[tenant]/messenger/notification-preferences
 *
 * GET   — 본인 알림 설정 조회 (없으면 default 반환).
 * PATCH — 부분 갱신 (mentionsOnly / dndStart / dndEnd / pushEnabled).
 *
 * 단일 row per (tenantId, userId) — 본인 행만 접근.
 */
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { updateNotificationPrefsSchema } from "@/lib/schemas/messenger/safety";
import { messengerErrorResponse } from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

export const GET = withTenant(async (_request, user, tenant) => {
  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const prefs = await db.notificationPreference.findUnique({
      where: { userId: user.sub },
    });
    return successResponse({
      preferences: prefs ?? {
        userId: user.sub,
        mentionsOnly: false,
        dndStart: null,
        dndEnd: null,
        pushEnabled: true,
      },
    });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});

export const PATCH = withTenant(async (request, user, tenant) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = updateNotificationPrefsSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const prefs = await db.notificationPreference.upsert({
      where: { userId: user.sub },
      create: {
        tenantId: tenant.id,
        userId: user.sub,
        mentionsOnly: parsed.data.mentionsOnly ?? false,
        dndStart: parsed.data.dndStart ?? null,
        dndEnd: parsed.data.dndEnd ?? null,
        pushEnabled: parsed.data.pushEnabled ?? true,
      },
      update: {
        ...(parsed.data.mentionsOnly !== undefined && {
          mentionsOnly: parsed.data.mentionsOnly,
        }),
        ...(parsed.data.dndStart !== undefined && {
          dndStart: parsed.data.dndStart,
        }),
        ...(parsed.data.dndEnd !== undefined && { dndEnd: parsed.data.dndEnd }),
        ...(parsed.data.pushEnabled !== undefined && {
          pushEnabled: parsed.data.pushEnabled,
        }),
      },
    });
    return successResponse({ preferences: prefs });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
