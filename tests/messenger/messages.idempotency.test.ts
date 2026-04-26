/**
 * tests/messenger/messages.idempotency.test.ts
 *
 * 세션 67 — clientGeneratedId 동시성 시뮬레이션 (3건).
 *
 * 시나리오 (plan §6.1):
 *   1. Promise.all 50회 동일 cgid → 정확히 1 INSERT, 50개 응답 모두 같은 message.id
 *   2. Promise.all 50회 다른 cgid → 50 INSERT
 *   3. 다른 conversation 에서 동일 cgid → 2 INSERT
 *      (UNIQUE 가 (tenantId, conversationId, cgid) 이므로 conv 가 다르면 충돌 X)
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  TENANTS,
  setupMessengerFixtures,
  createUser,
  createConversation,
} from "./_fixtures";
import * as messages from "@/lib/messenger/messages";

function uniqueEmail(prefix: string): string {
  return `mxtest-${prefix}-${randomUUID().slice(0, 8)}@x.com`;
}

const CONCURRENCY = 50;

describe("messenger/messages — idempotency under concurrency (env-gated)", () => {
  const fx = setupMessengerFixtures();

  it.skipIf(!fx.hasDb)(
    `Promise.all ${CONCURRENCY}회 동일 cgid → 1 INSERT, 모든 응답 동일 message.id`,
    async () => {
      const { runWithTenant, prismaWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("idemp-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("idemp-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });
      const cgid = randomUUID();

      const results = await runWithTenant({ tenantId: TENANTS.a }, async () =>
        Promise.all(
          Array.from({ length: CONCURRENCY }, (_, i) =>
            messages.sendMessage({
              conversationId: conv.id,
              senderId: alice.id,
              kind: "TEXT",
              body: `attempt ${i}`,
              clientGeneratedId: cgid,
            }),
          ),
        ),
      );

      // 모두 같은 message.id 반환.
      const ids = new Set(results.map((r) => r.message.id));
      expect(ids.size).toBe(1);

      // 정확히 1번만 created=true (race condition winner). 나머지는 false.
      const createdCount = results.filter((r) => r.created).length;
      expect(createdCount).toBe(1);

      // DB row 수 = 1.
      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const dbCount = await prismaWithTenant.message.count({
          where: {
            conversationId: conv.id,
            clientGeneratedId: cgid,
          },
        });
        expect(dbCount).toBe(1);
      });
    },
    /* timeout — 50 동시 transaction */ 30_000,
  );

  it.skipIf(!fx.hasDb)(
    `Promise.all ${CONCURRENCY}회 서로 다른 cgid → ${CONCURRENCY} INSERT`,
    async () => {
      const { runWithTenant, prismaWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("idmpx-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("idmpx-b"),
      });
      const conv = await createConversation({
        tenantId: TENANTS.a,
        kind: "DIRECT",
        creatorId: alice.id,
        memberIds: [alice.id, bob.id],
      });

      const results = await runWithTenant({ tenantId: TENANTS.a }, async () =>
        Promise.all(
          Array.from({ length: CONCURRENCY }, (_, i) =>
            messages.sendMessage({
              conversationId: conv.id,
              senderId: alice.id,
              kind: "TEXT",
              body: `msg ${i}`,
              clientGeneratedId: randomUUID(),
            }),
          ),
        ),
      );

      // 모두 created=true.
      expect(results.every((r) => r.created)).toBe(true);
      const ids = new Set(results.map((r) => r.message.id));
      expect(ids.size).toBe(CONCURRENCY);

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const count = await prismaWithTenant.message.count({
          where: { conversationId: conv.id },
        });
        expect(count).toBe(CONCURRENCY);
      });
    },
    /* timeout */ 30_000,
  );

  it.skipIf(!fx.hasDb)(
    "다른 conversation 에서 동일 cgid → 2 INSERT (UNIQUE 는 conv-scoped)",
    async () => {
      const { runWithTenant, prismaWithTenant } = await fx.modules();
      const alice = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("idconv-a"),
      });
      const bob = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("idconv-b"),
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
      const cgid = randomUUID();

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const r1 = await messages.sendMessage({
          conversationId: conv1.id,
          senderId: alice.id,
          kind: "TEXT",
          body: "conv1",
          clientGeneratedId: cgid,
        });
        const r2 = await messages.sendMessage({
          conversationId: conv2.id,
          senderId: alice.id,
          kind: "TEXT",
          body: "conv2",
          clientGeneratedId: cgid,
        });
        expect(r1.created).toBe(true);
        expect(r2.created).toBe(true);
        expect(r1.message.id).not.toBe(r2.message.id);

        const count = await prismaWithTenant.message.count({
          where: { clientGeneratedId: cgid },
        });
        expect(count).toBe(2);
      });
    },
  );
});
