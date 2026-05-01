/**
 * src/lib/messenger/reports.ts
 *
 * 신고 도메인 헬퍼 — UNIQUE 중복 거부, 운영자 처리 액션, cross-tenant 방어.
 *
 * 가드 전제:
 *   - withTenant() 가 TenantContext 주입 완료.
 *   - resolveReport 는 운영자 패널 라우트에서 withTenantRole(["OWNER","ADMIN"]) 사후 호출.
 *
 * 비즈니스 룰:
 *   - 동일 (reporter, targetKind, targetId) 의 신고는 거부 (UNIQUE 위반 사전 차단).
 *   - 대상 (message/user) 이 동일 tenant 에 없으면 NOT_FOUND (cross-tenant 침투 방어).
 *   - resolve action 은 status 가 OPEN 일 때만 가능.
 *   - DELETE_MESSAGE 는 targetKind=MESSAGE 에만, BLOCK_USER 는 targetKind=USER 에만 적용.
 */
import type { AbuseReport, Prisma } from "@/generated/prisma/client";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { getCurrentTenant } from "@yangpyeon/core/tenant/context";
import {
  MessengerError,
  decodeCursor,
  encodeCursor,
} from "./types";

/**
 * 신고 생성.
 *
 * Throws:
 *   - NOT_FOUND — 대상 message/user 없음 (RLS 또는 명시 tenant 필터 결과)
 *   - DUPLICATE_REPORT — 동일 reporter+target 의 신고 존재
 */
export async function fileReport(input: {
  reporterId: string;
  targetKind: "MESSAGE" | "USER";
  targetId: string;
  reason: string;
}): Promise<AbuseReport> {
  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const ctx = getCurrentTenant();
  const db = tenantPrismaFor(ctx);

  if (input.targetKind === "MESSAGE") {
    const msg = await db.message.findUnique({
      where: { id: input.targetId },
      select: { id: true },
    });
    if (!msg) {
      throw new MessengerError("NOT_FOUND", "신고 대상 메시지를 찾을 수 없습니다");
    }
  } else {
    // USER target — RLS 가 적용되지 않을 수 있어 명시 tenant 필터 (defense-in-depth).
    const user = await db.user.findFirst({
      where: { id: input.targetId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!user) {
      throw new MessengerError("NOT_FOUND", "신고 대상 사용자를 찾을 수 없습니다");
    }
  }

  // UNIQUE pre-lookup — 친화적 에러.
  const existing = await db.abuseReport.findUnique({
    where: {
      reporterId_targetKind_targetId: {
        reporterId: input.reporterId,
        targetKind: input.targetKind,
        targetId: input.targetId,
      },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new MessengerError(
      "DUPLICATE_REPORT",
      "이미 신고된 대상입니다",
      { existingReportId: existing.id, status: existing.status },
    );
  }

  return db.abuseReport.create({
    data: {
      reporterId: input.reporterId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      reason: input.reason,
    },
  });
}

/**
 * 운영자 신고 처리.
 *
 * action 분기:
 *   - DELETE_MESSAGE: targetKind=MESSAGE 일 때 메시지 회수 (deletedBy='admin')
 *   - BLOCK_USER: targetKind=USER 일 때 tenant-wide 비활성화 (Phase 1.5+ — Phase 1 은 기록만)
 *   - DISMISS: status=DISMISSED 만 SET
 *
 * Throws:
 *   - NOT_FOUND — 신고 row 없음
 *   - REPORT_ALREADY_RESOLVED — status 가 OPEN 아님
 *   - REPORT_ACTION_INVALID — action 과 targetKind 불부합
 */
export async function resolveReport(input: {
  reportId: string;
  resolverId: string;
  action: "DELETE_MESSAGE" | "BLOCK_USER" | "DISMISS";
  note?: string;
}): Promise<{ report: AbuseReport; performedActions: string[] }> {
  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const db = tenantPrismaFor(getCurrentTenant());
  const report = await db.abuseReport.findUnique({
    where: { id: input.reportId },
  });
  if (!report) {
    throw new MessengerError("NOT_FOUND", "신고를 찾을 수 없습니다");
  }
  if (report.status !== "OPEN") {
    throw new MessengerError(
      "REPORT_ALREADY_RESOLVED",
      `이미 처리된 신고입니다 (status=${report.status})`,
    );
  }

  const performedActions: string[] = [];

  if (input.action === "DELETE_MESSAGE") {
    if (report.targetKind !== "MESSAGE") {
      throw new MessengerError(
        "REPORT_ACTION_INVALID",
        "DELETE_MESSAGE 는 MESSAGE 타입 신고에만 적용 가능합니다",
      );
    }
    const msg = await db.message.findUnique({
      where: { id: report.targetId },
      select: { id: true, deletedAt: true },
    });
    if (msg && msg.deletedAt === null) {
      await db.message.update({
        where: { id: report.targetId },
        data: {
          deletedAt: new Date(),
          body: null,
          deletedBy: "admin",
        },
      });
      performedActions.push("MESSAGE_DELETED");
    } else {
      // 이미 삭제된 메시지 — action 은 신고 상태만 갱신.
      performedActions.push("MESSAGE_ALREADY_DELETED");
    }
  } else if (input.action === "BLOCK_USER") {
    if (report.targetKind !== "USER") {
      throw new MessengerError(
        "REPORT_ACTION_INVALID",
        "BLOCK_USER 는 USER 타입 신고에만 적용 가능합니다",
      );
    }
    // Phase 1.5+ — tenant 비활성화 / 메신저 차단 / 세션 만료.
    // Phase 1 은 신고 상태만 RESOLVED 로 표시 (audit 만 추적).
    performedActions.push("USER_BLOCK_RECORDED");
  }

  const updated = await db.abuseReport.update({
    where: { id: input.reportId },
    data: {
      status: input.action === "DISMISS" ? "DISMISSED" : "RESOLVED",
      resolvedById: input.resolverId,
      resolvedAt: new Date(),
      resolutionNote: input.note ?? null,
    },
  });

  return { report: updated, performedActions };
}

/**
 * 신고 큐 — 운영자 패널.
 *
 * 기본 status=OPEN. 페이지네이션은 message keyset 과 동일 패턴.
 */
export async function listOpenReports(input: {
  status?: "OPEN" | "RESOLVED" | "DISMISSED";
  cursor?: string;
  limit?: number;
}): Promise<{
  items: AbuseReport[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);

  let cursorFilter: Prisma.AbuseReportWhereInput | undefined;
  if (input.cursor) {
    const parsed = decodeCursor(input.cursor);
    if (parsed) {
      const cursorDate = new Date(parsed.createdAt);
      cursorFilter = {
        OR: [
          { createdAt: { lt: cursorDate } },
          {
            AND: [
              { createdAt: cursorDate },
              { id: { lt: parsed.id } },
            ],
          },
        ],
      };
    }
  }

  // 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
  const db = tenantPrismaFor(getCurrentTenant());
  const rows = await db.abuseReport.findMany({
    where: {
      status: input.status ?? "OPEN",
      ...(cursorFilter ?? {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    });
  }

  return { items, nextCursor, hasMore };
}
