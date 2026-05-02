/**
 * tests/messenger/messages.test.ts
 *
 * 세션 67 — 메신저 M2 messages 도메인 헬퍼 단위 테스트 (10건).
 *
 * 시나리오 (plan §6.1):
 *    1. cgid 신규 → created=true
 *    2. cgid 동일 → created=false (동일 메시지 fetch)
 *    3. edit 14:59 경과 → 통과
 *    4. edit 15:01 경과 → EDIT_WINDOW_EXPIRED
 *    5. recall self 23:59 → 통과 (deletedBy='self')
 *    6. recall self 24:01 → DELETE_WINDOW_EXPIRED
 *    7. recall admin 무제한 → 통과 (deletedBy='admin')
 *    8. replyToId 가 다른 conversation → REPLY_CROSS_CONVERSATION
 *    9. attachments fileId.owner 가 sender 아님 → ATTACHMENT_NOT_OWNED
 *   10. mentions 차단 사용자 → mention row INSERT skip
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  TENANTS,
  setupMessengerFixtures,
  createUser,
  createConversation,
  createMessage,
  createBlock,
  getAdminPool,
} from "./_fixtures";
import { MESSENGER_ERROR_CODES } from "@/lib/messenger/types";
import * as messages from "@/lib/messenger/messages";

function uniqueEmail(prefix: string): string {
  return `mxtest-${prefix}-${randomUUID().slice(0, 8)}@x.com`;
}

/** 테스트 전용 file row 시드 — folder + file 한 쌍. */
async function seedFile(opts: {
  tenantId: string;
  ownerId: string;
}): Promise<{ folderId: string; fileId: string }> {
  const pool = await getAdminPool();
  const folderName = `mxtest-folder-${randomUUID().slice(0, 8)}`;
  const f = await pool.query(
    `INSERT INTO folders (id, tenant_id, name, parent_id, owner_id, is_root, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, NULL, $3, false, NOW(), NOW())
     RETURNING id`,
    [opts.tenantId, folderName, opts.ownerId],
  );
  const folderId = (f.rows[0] as { id: string }).id;
  const stored = `mxtest-stored-${randomUUID()}`;
  const file = await pool.query(
    `INSERT INTO files (id, tenant_id, original_name, stored_name, size, mime_type,
                        folder_id, owner_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 100, 'image/png', $4, $5, NOW(), NOW())
     RETURNING id`,
    [
      opts.tenantId,
      "test.png",
      stored,
      folderId,
      opts.ownerId,
    ],
  );
  return { folderId, fileId: (file.rows[0] as { id: string }).id };
}

describe("messenger/messages (env-gated)", () => {
  const fx = setupMessengerFixtures();

  it.skipIf(!fx.hasDb)(
    "sendMessage: 신규 cgid → created=true, 동일 cgid 재호출 → created=false (멱등 fetch)",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("send-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("send-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
        memberRoles: { [alice.id]: "OWNER", [bob.id]: "OWNER" },
      });
      const cgid = randomUUID();

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r1 = await messages.sendMessage({
          conversationId: conv.id,
          senderId: alice.id,
          kind: "TEXT",
          body: "hello",
          clientGeneratedId: cgid,
        });
        expect(r1.created).toBe(true);
        expect(r1.message.body).toBe("hello");

        const r2 = await messages.sendMessage({
          conversationId: conv.id,
          senderId: alice.id,
          kind: "TEXT",
          body: "hello (재시도)",
          clientGeneratedId: cgid,
        });
        expect(r2.created).toBe(false);
        expect(r2.message.id).toBe(r1.message.id);
        // body 는 첫 INSERT 의 값이 그대로 (재시도 body 무시).
        expect(r2.message.body).toBe("hello");
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "editMessage: 14분 59초 경과 → 통과 (editedAt SET, editCount=1)",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("edit-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("edit-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      // createdAt = now() - (15 * 60 * 1000) + 1000 → 14:59 ago
      const past = new Date(Date.now() - 15 * 60 * 1000 + 1000);
      const seeded = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: alice.id,
        body: "원문",
        createdAt: past,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const updated = await messages.editMessage({
          messageId: seeded.id,
          editorId: alice.id,
          newBody: "수정됨",
        });
        expect(updated.body).toBe("수정됨");
        expect(updated.editedAt).not.toBeNull();
        expect(updated.editCount).toBe(1);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "editMessage: 15분 1초 경과 → EDIT_WINDOW_EXPIRED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("editx-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("editx-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      const past = new Date(Date.now() - 15 * 60 * 1000 - 1000);
      const seeded = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: alice.id,
        body: "원문",
        createdAt: past,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          messages.editMessage({
            messageId: seeded.id,
            editorId: alice.id,
            newBody: "늦음",
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.EDIT_WINDOW_EXPIRED,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "recallMessage: self 23시간 59분 경과 → 통과 (deletedBy='self')",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rcl-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rcl-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000 + 60 * 1000);
      const seeded = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: alice.id,
        body: "회수 대상",
        createdAt: past,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await messages.recallMessage({
          messageId: seeded.id,
          actorId: alice.id,
          actorIsAdmin: false,
        });
        expect(r.deletedAt).not.toBeNull();
        expect(r.deletedBy).toBe("self");
        expect(r.body).toBeNull();
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "recallMessage: self 24시간 1초 경과 → DELETE_WINDOW_EXPIRED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rclx-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rclx-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000);
      const seeded = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: alice.id,
        body: "늦은 회수",
        createdAt: past,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          messages.recallMessage({
            messageId: seeded.id,
            actorId: alice.id,
            actorIsAdmin: false,
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.DELETE_WINDOW_EXPIRED,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "recallMessage: admin 은 24h 무관 통과 (deletedBy='admin')",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rcladm-a"),
      });
      const admin = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rcladm-x"),
        membershipRole: "ADMIN",
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: alice.id,
        memberIds: [alice.id, admin.id],
        title: "admin recall",
      });
      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1주일 전
      const seeded = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv.id,
        senderId: alice.id,
        body: "오래된 메시지",
        createdAt: past,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await messages.recallMessage({
          messageId: seeded.id,
          actorId: admin.id,
          actorIsAdmin: true,
        });
        expect(r.deletedBy).toBe("admin");
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "sendMessage: replyToId 가 다른 conversation → REPLY_CROSS_CONVERSATION",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rep-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rep-b"),
      });
      const conv1 = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      const conv2 = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
        title: "다른 대화",
      });
      const otherMsg = await createMessage({
        tenantId: TENANTS.a,
        conversationId: conv1.id,
        senderId: alice.id,
        body: "conv1 의 메시지",
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          messages.sendMessage({
            conversationId: conv2.id,
            senderId: alice.id,
            kind: "TEXT",
            body: "conv2 에서 conv1 메시지에 회신 시도",
            clientGeneratedId: randomUUID(),
            replyToId: otherMsg.id,
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.REPLY_CROSS_CONVERSATION,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "sendMessage: 첨부 fileId.owner 가 sender 아님 → ATTACHMENT_NOT_OWNED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("att-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("att-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      // bob 이 file 소유.
      const { fileId } = await seedFile({
        tenantId: TENANTS.a,
        ownerId: bob.id,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          messages.sendMessage({
            conversationId: conv.id,
            senderId: alice.id,
            kind: "IMAGE",
            body: null,
            clientGeneratedId: randomUUID(),
            attachments: [
              { fileId, kind: "IMAGE", displayOrder: 0 },
            ],
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.ATTACHMENT_NOT_OWNED,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "sendMessage: 차단된 사용자 mention 은 mention row INSERT skip",
    async () => {
      const { runWithTenant, prismaWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("mn-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("mn-b"),
      });
      const charlie = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("mn-c"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id, charlie.id],
        title: "멘션 그룹",
      });
      // alice 가 bob 을 차단 (양방향 적용).
      await createBlock({
        tenantId: TENANTS.a,
        blockerId: alice.id,
        blockedId: bob.id,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await messages.sendMessage({
          conversationId: conv.id,
          senderId: alice.id,
          kind: "TEXT",
          body: "@bob @charlie 안녕",
          clientGeneratedId: randomUUID(),
          mentions: [bob.id, charlie.id],
        });
        expect(r.created).toBe(true);

        const ms = await prismaWithTenant.messageMention.findMany({
          where: { messageId: r.message.id },
          select: { mentionedUserId: true },
        });
        const mentionedIds = ms.map((m) => m.mentionedUserId);
        expect(mentionedIds).toContain(charlie.id);
        expect(mentionedIds).not.toContain(bob.id);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "sendMessage: DIRECT 반환에 conversationKind='DIRECT' + otherMemberId=peer 포함 (M3 user-channel routing 용)",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rk-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rk-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await messages.sendMessage({
          conversationId: conv.id,
          senderId: alice.id,
          kind: "TEXT",
          body: "DM 라우팅",
          clientGeneratedId: randomUUID(),
        });
        expect(r.created).toBe(true);
        expect(r.conversationKind).toBe("DIRECT");
        expect(r.otherMemberId).toBe(bob.id);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "sendMessage: GROUP 반환은 conversationKind='GROUP' + otherMemberId=null (peer 단일 식별 불가)",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rkg-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rkg-b"),
      });
      const charlie = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("rkg-c"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "GROUP",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id, charlie.id],
        title: "그룹 dm-routing",
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r = await messages.sendMessage({
          conversationId: conv.id,
          senderId: alice.id,
          kind: "TEXT",
          body: "그룹은 peer 단일 식별 불가",
          clientGeneratedId: randomUUID(),
        });
        expect(r.created).toBe(true);
        expect(r.conversationKind).toBe("GROUP");
        expect(r.otherMemberId).toBeNull();
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "sendMessage: DIRECT peer 차단 시 USER_BLOCKED",
    async () => {
      const { runWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dmblk-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("dmblk-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      // bob 이 alice 를 차단 — alice 가 보내려 해도 양방향이라 차단.
      await createBlock({
        tenantId: TENANTS.a,
        blockerId: bob.id,
        blockedId: alice.id,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          messages.sendMessage({
            conversationId: conv.id,
            senderId: alice.id,
            kind: "TEXT",
            body: "block test",
            clientGeneratedId: randomUUID(),
          }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.USER_BLOCKED,
        });
      });
    },
  );
});
