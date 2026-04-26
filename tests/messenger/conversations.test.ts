/**
 * tests/messenger/conversations.test.ts
 *
 * 세션 67 — 메신저 M2 conversations 도메인 헬퍼 단위 테스트 (8건).
 *
 * 시나리오 (plan §6.1):
 *   1. DM 페어 멱등 — 2회 호출 시 동일 id (created=false on 2nd)
 *   2. GROUP 생성 — creator + 1명, members=2, role 정상
 *   3. GROUP 100명 한도 — 101번째 → GROUP_MEMBER_LIMIT_EXCEEDED
 *   4. GROUP 차단 관계 추가 거부 — GROUP_MEMBER_BLOCKED
 *   5. DIRECT peer 가 tenant 미참여 → TENANT_MEMBERSHIP_REQUIRED
 *   6. addMembers — ALREADY_MEMBER / NOT_TENANT_MEMBER / BLOCKED 분기
 *   7. removeMember self leave — leftAt SET
 *   8. archiveConversation — archivedAt SET
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  TENANTS,
  setupMessengerFixtures,
  createUser,
  createConversation,
  createBlock,
  getAdminPool,
} from "./_fixtures";
import { MESSENGER_ERROR_CODES } from "@/lib/messenger/types";
import * as conversations from "@/lib/messenger/conversations";

function uniqueEmail(prefix: string): string {
  return `mxtest-${prefix}-${randomUUID().slice(0, 8)}@x.com`;
}

describe("messenger/conversations (env-gated)", () => {
  const fx = setupMessengerFixtures();

  it.skipIf(!fx.hasDb)(
    "findOrCreateDirect: 2회 호출 시 동일 conversation id (멱등)",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dm1-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dm1-b"),
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r1 = await conversations.findOrCreateDirect({
          creatorId: alice.id,
          peerId: bob.id,
        });
        expect(r1.created).toBe(true);
        expect(r1.conversation.kind).toBe("DIRECT");

        const r2 = await conversations.findOrCreateDirect({
          creatorId: alice.id,
          peerId: bob.id,
        });
        expect(r2.created).toBe(false);
        expect(r2.conversation.id).toBe(r1.conversation.id);

        // peerId 와 creatorId 자리를 바꿔도 동일 — 페어 멱등.
        const r3 = await conversations.findOrCreateDirect({
          creatorId: bob.id,
          peerId: alice.id,
        });
        expect(r3.created).toBe(false);
        expect(r3.conversation.id).toBe(r1.conversation.id);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "createGroup: creator + 1명 → members 2, creator OWNER 다른 사람 MEMBER",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("grp-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("grp-b"),
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await conversations.createGroup({
          creatorId: alice.id,
          memberIds: [bob.id],
          title: "테스트 그룹",
        });
        expect(r.conversation.kind).toBe("GROUP");
        expect(r.conversation.title).toBe("테스트 그룹");
        expect(r.members).toHaveLength(2);
        const aliceM = r.members.find((m) => m.userId === alice.id);
        const bobM = r.members.find((m) => m.userId === bob.id);
        expect(aliceM?.role).toBe("OWNER");
        expect(bobM?.role).toBe("MEMBER");
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "createGroup: creator+others 합 > 100 → GROUP_MEMBER_LIMIT_EXCEEDED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const creator = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("grplim-c"),
      });

      // 100명의 추가 멤버를 시드 (creator 포함 시 101 → 한도 초과).
      const others: string[] = [];
      const pool = await getAdminPool();
      for (let i = 0; i < 100; i++) {
        const r = await pool.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, name, is_active, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'h', $3, true, NOW(), NOW())
           RETURNING id`,
          [TENANTS.a, uniqueEmail(`grplim-${i}`), `m${i}`],
        );
        const uid = (r.rows[0] as { id: string }).id;
        await pool.query(
          `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'MEMBER', NOW(), NOW())`,
          [TENANTS.a, uid],
        );
        others.push(uid);
      }

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          conversations.createGroup({
            creatorId: creator.id,
            memberIds: others,
            title: "한도 초과",
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.GROUP_MEMBER_LIMIT_EXCEEDED,
        });
      });
    },
    /* timeout — 100 INSERT */ 30_000,
  );

  it.skipIf(!fx.hasDb)(
    "createGroup: creator↔member 차단 관계 → GROUP_MEMBER_BLOCKED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("grpblk-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("grpblk-b"),
      });
      // alice 가 bob 을 차단.
      await createBlock({
        tenantId: TENANTS.a,
        blockerId: alice.id,
        blockedId: bob.id,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          conversations.createGroup({
            creatorId: alice.id,
            memberIds: [bob.id],
            title: "차단 포함",
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.GROUP_MEMBER_BLOCKED,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "findOrCreateDirect: peer 가 tenant 미멤버 → TENANT_MEMBERSHIP_REQUIRED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dmnomem-a"),
      });
      // bob 은 user row 만 있고 TenantMembership 없음.
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dmnomem-b"),
        withMembership: false,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          conversations.findOrCreateDirect({
            creatorId: alice.id,
            peerId: bob.id,
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.TENANT_MEMBERSHIP_REQUIRED,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "addMembers: 부분 성공 — ALREADY_MEMBER / NOT_TENANT_MEMBER / BLOCKED skip",
    async () => {
      const { runWithTenant } = await fx.modules();
      const owner = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("addm-o"),
      });
      const existingMember = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("addm-e"),
      });
      const newOk = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("addm-ok"),
      });
      const noMembership = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("addm-nm"),
        withMembership: false,
      });
      const blockedUser = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("addm-blk"),
      });
      // owner 가 blockedUser 를 차단.
      await createBlock({
        tenantId: TENANTS.a,
        blockerId: owner.id,
        blockedId: blockedUser.id,
      });

      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: owner.id,
        memberIds: [owner.id, existingMember.id],
        title: "addMembers test",
        memberRoles: { [owner.id]: "OWNER", [existingMember.id]: "MEMBER" },
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await conversations.addMembers({
          conversationId: conv.id,
          actorId: owner.id,
          userIds: [existingMember.id, newOk.id, noMembership.id, blockedUser.id],
        });
        expect(r.added).toHaveLength(1);
        expect(r.added[0].userId).toBe(newOk.id);

        const reasonByUser = new Map(
          r.skipped.map((s) => [s.userId, s.reason] as const),
        );
        expect(reasonByUser.get(existingMember.id)).toBe("ALREADY_MEMBER");
        expect(reasonByUser.get(noMembership.id)).toBe("NOT_TENANT_MEMBER");
        expect(reasonByUser.get(blockedUser.id)).toBe("BLOCKED");
      });
    },
  );

  it.skipIf(!fx.hasDb)("removeMember: self leave 시 leftAt SET", async () => {
    const { runWithTenant } = await fx.modules();
    const owner = await createUser({
      tenantId: TENANTS.a,
      email: uniqueEmail("rmv-o"),
    });
    const member = await createUser({
      tenantId: TENANTS.a,
      email: uniqueEmail("rmv-m"),
    });
    const conv = await createConversation({
      tenantId: TENANTS.a,
      kind: "GROUP",
      creatorId: owner.id,
      memberIds: [owner.id, member.id],
      title: "leave test",
    });

    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      // member 가 self leave (actorIsAdmin=false 이지만 본인 = OK).
      const r = await conversations.removeMember({
        conversationId: conv.id,
        removerUserId: member.id,
        removedUserId: member.id,
        actorIsAdmin: false,
      });
      expect(r.leftAt).not.toBeNull();
      expect(r.userId).toBe(member.id);

      // 남이 다른 사람 제거 시도 (admin 아님) → FORBIDDEN.
      await expect(
        conversations.removeMember({
          conversationId: conv.id,
          removerUserId: member.id,
          removedUserId: owner.id,
          actorIsAdmin: false,
        }),
      ).rejects.toMatchObject({
        code: MESSENGER_ERROR_CODES.FORBIDDEN,
      });
    });
  });

  it.skipIf(!fx.hasDb)(
    "archiveConversation: archivedAt SET",
    async () => {
      const { runWithTenant } = await fx.modules();
      const owner = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("arc-o"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: owner.id,
        memberIds: [owner.id],
        title: "archive test",
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await conversations.archiveConversation({
          conversationId: conv.id,
          actorId: owner.id,
        });
        expect(r.archivedAt).not.toBeNull();
      });
    },
  );
});
