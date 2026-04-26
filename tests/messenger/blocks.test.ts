/**
 * tests/messenger/blocks.test.ts
 *
 * 세션 67 — 메신저 M2 blocks 도메인 헬퍼 단위 테스트 (5건).
 *
 * 시나리오 (plan §6.1):
 *   1. A→B 차단 후 isBlocked(A,B)=true
 *   2. A→B 차단 후 isBlocked(B,A)=true (양방향)
 *   3. 자기 자신 차단 시 BLOCK_SELF
 *   4. 동일 (blocker, blocked) 재차단 시 DUPLICATE_BLOCK
 *   5. unblockUser 정상 + 다른 사용자 차단 row 해제 시 NOT_FOUND
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  TENANTS,
  setupMessengerFixtures,
  createUser,
  createBlock,
} from "./_fixtures";
import { MESSENGER_ERROR_CODES, MessengerError } from "@/lib/messenger/types";
import * as blocks from "@/lib/messenger/blocks";

function uniqueEmail(prefix: string): string {
  return `mxtest-${prefix}-${randomUUID().slice(0, 8)}@x.com`;
}

describe("messenger/blocks (env-gated)", () => {
  const fx = setupMessengerFixtures();

  it.skipIf(!fx.hasDb)(
    "isBlocked: A→B 차단 row 존재 시 true",
    async () => {
      const { runWithTenant } = await fx.modules();
      const a = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("blk-a"),
      });
      const b = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("blk-b"),
      });
      await createBlock({ tenantId: TENANTS.a, blockerId: a.id, blockedId: b.id });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          blocks.isBlocked({ userIdA: a.id, userIdB: b.id }),
        ).resolves.toBe(true);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "isBlocked: 양방향 — A→B 차단 시 isBlocked(B,A) 도 true",
    async () => {
      const { runWithTenant } = await fx.modules();
      const a = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("blkbi-a"),
      });
      const b = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("blkbi-b"),
      });
      await createBlock({ tenantId: TENANTS.a, blockerId: a.id, blockedId: b.id });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        await expect(
          blocks.isBlocked({ userIdA: b.id, userIdB: a.id }),
        ).resolves.toBe(true);
      });
    },
  );

  it.skipIf(!fx.hasDb)("blockUser: 자기 자신 차단 시 BLOCK_SELF", async () => {
    const { runWithTenant } = await fx.modules();
    const a = await createUser({
      tenantId: TENANTS.a,
      email: uniqueEmail("blkself"),
    });

    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      await expect(
        blocks.blockUser({ blockerId: a.id, blockedId: a.id }),
      ).rejects.toMatchObject({
        name: "MessengerError",
        code: MESSENGER_ERROR_CODES.BLOCK_SELF,
      });
    });
  });

  it.skipIf(!fx.hasDb)(
    "blockUser: 동일 (blocker, blocked) 재차단 시 DUPLICATE_BLOCK",
    async () => {
      const { runWithTenant } = await fx.modules();
      const a = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("blkdup-a"),
      });
      const b = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("blkdup-b"),
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const created = await blocks.blockUser({
          blockerId: a.id,
          blockedId: b.id,
        });
        expect(created.blockerId).toBe(a.id);
        expect(created.blockedId).toBe(b.id);

        await expect(
          blocks.blockUser({ blockerId: a.id, blockedId: b.id }),
        ).rejects.toBeInstanceOf(MessengerError);
        await expect(
          blocks.blockUser({ blockerId: a.id, blockedId: b.id }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.DUPLICATE_BLOCK,
        });
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "unblockUser: 본인 차단 row 해제 OK + 타인 row 해제 시 NOT_FOUND",
    async () => {
      const { runWithTenant } = await fx.modules();
      const a = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("unblk-a"),
      });
      const b = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("unblk-b"),
      });
      const c = await createUser({
        tenantId: TENANTS.a,
        email: uniqueEmail("unblk-c"),
      });
      const ab = await createBlock({
        tenantId: TENANTS.a,
        blockerId: a.id,
        blockedId: b.id,
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        // c 가 a 의 차단 row 를 해제하려고 시도 → NOT_FOUND
        await expect(
          blocks.unblockUser({ blockerId: c.id, blockId: ab.id }),
        ).rejects.toMatchObject({
          code: MESSENGER_ERROR_CODES.NOT_FOUND,
        });

        // a 본인은 정상 해제
        await expect(
          blocks.unblockUser({ blockerId: a.id, blockId: ab.id }),
        ).resolves.toBeUndefined();

        // 해제 후 isBlocked → false
        await expect(
          blocks.isBlocked({ userIdA: a.id, userIdB: b.id }),
        ).resolves.toBe(false);
      });
    },
  );
});
