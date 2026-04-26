/**
 * tests/messenger/reports.test.ts
 *
 * 세션 67 — 메신저 M2 reports 도메인 헬퍼 단위 테스트 (6건).
 *
 * 시나리오 (plan §6.1):
 *   1. 신규 신고 OK
 *   2. 동일 reporter+target 재시도 → DUPLICATE_REPORT
 *   3. cross-tenant target → NOT_FOUND
 *   4. resolve DELETE_MESSAGE → 메시지 회수 + 신고 RESOLVED
 *   5. resolve DISMISS → 메시지 변경 없음 + 신고 DISMISSED
 *   6. listOpenReports 페이지네이션 (한도 초과 → nextCursor + hasMore)
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  TENANTS,
  setupMessengerFixtures,
  createUser,
  createConversation,
  createMessage,
  getAdminPool,
} from "./_fixtures";
import { MESSENGER_ERROR_CODES } from "@/lib/messenger/types";
import * as reports from "@/lib/messenger/reports";

function uniqueEmail(prefix: string): string {
  return `mxtest-${prefix}-${randomUUID().slice(0, 8)}@x.com`;
}

describe("messenger/reports (env-gated)", () => {
  const fx = setupMessengerFixtures();

  it.skipIf(!fx.hasDb)(
    "fileReport: 신규 신고 OK + 같은 reporter+target 재시도 → DUPLICATE_REPORT",
    async () => {
      const { runWithTenant } = await fx.modules();
      const reporter = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rep-r"),
      });
      const offender = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rep-o"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: reporter.id,
        memberIds: [reporter.id, offender.id],
      });
      const msg = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: offender.id,
        body: "harmful content",
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await reports.fileReport({
          reporterId: reporter.id,
          targetKind: "MESSAGE",
          targetId: msg.id,
          reason: "스팸",
        });
        expect(r.status).toBe("OPEN");

        await expect(
          reports.fileReport({
            reporterId: reporter.id,
            targetKind: "MESSAGE",
            targetId: msg.id,
            reason: "재시도",
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.DUPLICATE_REPORT,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "fileReport: cross-tenant message 대상 → NOT_FOUND (RLS 차단)",
    async () => {
      const { runWithTenant } = await fx.modules();
      // tenant_b 에 메시지 시드 (admin pool — RLS BYPASS).
      const tenantBOffender = await createUser({
        tenantId: TENANTS.b,
        email: uniqueEmail("xtb-o"),
      });
      const tenantBMember = await createUser({
        tenantId: TENANTS.b,
        email: uniqueEmail("xtb-m"),
      });
      const convB = await createConversation({
        tenantId: TENANTS.b,
        kind: "DIRECT",
        creatorId: tenantBOffender.id,
        memberIds: [tenantBOffender.id, tenantBMember.id],
      });
      const msgB = await createMessage({
        tenantId: TENANTS.b,
        conversationId: convB.id,
        senderId: tenantBOffender.id,
        body: "tenant_b 메시지",
      });

      // tenant_a 의 reporter 가 tenant_b 메시지 신고 시도.
      const reporter = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("xta-r"),
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          reports.fileReport({
            reporterId: reporter.id,
            targetKind: "MESSAGE",
            targetId: msgB.id,
            reason: "cross-tenant 시도",
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.NOT_FOUND,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "resolveReport: DELETE_MESSAGE → 메시지 회수 + 신고 RESOLVED",
    async () => {
      const { runWithTenant, prismaWithTenant } = await fx.modules();
      const reporter = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rsv-r"),
      });
      const offender = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rsv-o"),
      });
      const admin = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rsv-a"),
        membershipRole: "ADMIN",
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: reporter.id,
        memberIds: [reporter.id, offender.id, admin.id],
        title: "신고 처리",
      });
      const msg = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: offender.id,
        body: "삭제 대상",
      });

      const filed = await runWithTenant({ tenantId: TENANTS.a }, () =>
        reports.fileReport({
          reporterId: reporter.id,
          targetKind: "MESSAGE",
          targetId: msg.id,
          reason: "운영자 처리 테스트",
        }),
      );

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await reports.resolveReport({
          reportId: filed.id,
          resolverId: admin.id,
          action: "DELETE_MESSAGE",
          note: "검토 완료",
        });
        expect(r.report.status).toBe("RESOLVED");
        expect(r.report.resolvedById).toBe(admin.id);
        expect(r.performedActions).toContain("MESSAGE_DELETED");

        // 메시지 상태 확인.
        const recalled = await prismaWithTenant.message.findUnique({
          where: { id: msg.id },
        });
        expect(recalled?.deletedAt).not.toBeNull();
        expect(recalled?.deletedBy).toBe("admin");
        expect(recalled?.body).toBeNull();
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "resolveReport: DISMISS → 메시지 변경 없음 + 신고 DISMISSED",
    async () => {
      const { runWithTenant, prismaWithTenant } = await fx.modules();
      const reporter = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dis-r"),
      });
      const offender = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dis-o"),
      });
      const admin = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dis-a"),
        membershipRole: "ADMIN",
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: reporter.id,
        memberIds: [reporter.id, offender.id, admin.id],
        title: "기각",
      });
      const msg = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: offender.id,
        body: "유지될 메시지",
      });

      const filed = await runWithTenant({ tenantId: TENANTS.a }, () =>
        reports.fileReport({
          reporterId: reporter.id,
          targetKind: "MESSAGE",
          targetId: msg.id,
          reason: "false alarm",
        }),
      );

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await reports.resolveReport({
          reportId: filed.id,
          resolverId: admin.id,
          action: "DISMISS",
        });
        expect(r.report.status).toBe("DISMISSED");
        expect(r.performedActions).toHaveLength(0);

        // 메시지는 유지.
        const stillThere = await prismaWithTenant.message.findUnique({
          where: { id: msg.id },
        });
        expect(stillThere?.deletedAt).toBeNull();
        expect(stillThere?.body).toBe("유지될 메시지");
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "resolveReport: 이미 처리된 신고 재처리 → REPORT_ALREADY_RESOLVED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const reporter = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dup-r"),
      });
      const offender = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dup-o"),
      });
      const admin = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dup-a"),
        membershipRole: "ADMIN",
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: reporter.id,
        memberIds: [reporter.id, offender.id, admin.id],
        title: "중복 처리",
      });
      const msg = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: offender.id,
        body: "중복 처리 대상",
      });

      const filed = await runWithTenant({ tenantId: TENANTS.a }, () =>
        reports.fileReport({
          reporterId: reporter.id,
          targetKind: "MESSAGE",
          targetId: msg.id,
          reason: "spam",
        }),
      );

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        // 1차 처리 OK.
        await reports.resolveReport({
          reportId: filed.id,
          resolverId: admin.id,
          action: "DISMISS",
        });

        // 2차 처리 → REPORT_ALREADY_RESOLVED.
        await expect(
          reports.resolveReport({
            reportId: filed.id,
            resolverId: admin.id,
            action: "DELETE_MESSAGE",
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.REPORT_ALREADY_RESOLVED,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "listOpenReports: limit 보다 많이 시드되면 nextCursor + hasMore=true",
    async () => {
      const { runWithTenant } = await fx.modules();
      const reporter = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("ls-r"),
      });
      const offender = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("ls-o"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: reporter.id,
        memberIds: [reporter.id, offender.id],
      });
      // 5개의 다른 메시지 + 5개 신고.
      const pool = await getAdminPool();
      for (let i = 0; i < 5; i++) {
        const m = await createMessage({
          tenantId: TENANTS.a,
          conversationId: conv.id,
          senderId: offender.id,
          body: `bad ${i}`,
        });
        await pool.query(
          `INSERT INTO abuse_reports (id, tenant_id, reporter_id, target_kind, target_id,
                                       reason, status, created_at)
           VALUES (gen_random_uuid(), $1, $2, 'MESSAGE', $3, $4, 'OPEN', NOW() - INTERVAL '${i} seconds')`,
          [TENANTS.a, reporter.id, m.id, `r${i}`],
        );
      }

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const page1 = await reports.listOpenReports({ limit: 3 });
        expect(page1.items).toHaveLength(3);
        expect(page1.hasMore).toBe(true);
        expect(page1.nextCursor).not.toBeNull();

        const page2 = await reports.listOpenReports({
          limit: 3,
          cursor: page1.nextCursor!,
        });
        expect(page2.items).toHaveLength(2);
        expect(page2.hasMore).toBe(false);
        expect(page2.nextCursor).toBeNull();

        // page1 + page2 의 id 합 = 5 (중복 0).
        const allIds = new Set([
          ...page1.items.map((r) => r.id),
          ...page2.items.map((r) => r.id),
        ]);
        expect(allIds.size).toBe(5);
      });
    },
  );
});
