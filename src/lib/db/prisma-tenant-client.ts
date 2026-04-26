/**
 * prisma-tenant-client — TenantContext 를 PG 세션 변수로 자동 주입하는 Prisma Client Extension.
 *
 * Phase 1.4 (T1.4) ADR-023 §5.2 / §5.3 구현.
 *
 * 핵심:
 *   - 모든 read/write 가 자동으로 SET LOCAL app.tenant_id = '<uuid>'.
 *   - bypassRls=true 시 SET LOCAL ROLE app_admin (운영 콘솔 전용, ADR-023 §5).
 *   - $allOperations 내부에서 멱등 SET 처리 — 단발 query / 명시 transaction 모두 커버.
 *
 * 의존성:
 *   - 베이스 PrismaClient: src/lib/prisma.ts (lazy proxy + PrismaPg adapter).
 *     ⚠ T1.4 는 src/lib/prisma.ts 를 변경하지 않음. 본 모듈이 wrap 만 한다.
 *   - TenantContext: packages/core/src/tenant/context.ts (T1.1 frozen).
 *
 * 사용 위치:
 *   - 핸들러: withTenant() / runWithTenant() 안에서 prismaWithTenant.<model>.<op> 호출.
 *   - 시스템 작업 (cleanup cron, bootstrap): runWithTenant({ tenantId, bypassRls: true }, ...)
 *     또는 베이스 prisma 를 직접 사용 (src/lib/db/ allowlist).
 *
 * 한계 (spec §5.2):
 *   - $allOperations 가 매 호출 1회 SET 을 강제하므로 N+1 query latency 가 1.x 배 (T1.4 측정 deferred).
 *   - deep transaction 미지원 — multi-statement transaction 은 withTenantTx() 사용.
 */
import { prisma as basePrisma } from "@/lib/prisma";
import {
  getCurrentTenantOrNull,
  runWithTenant,
} from "@yangpyeon/core/tenant/context";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * UUID 형식 검증 (SQL injection 1차 방어).
 *
 * SET LOCAL app.tenant_id = '<uuid>' 의 <uuid> 가 SQL 리터럴로 inline 되므로
 * 값이 UUID 형식인지 확인. TenantContext 가 신뢰 가능한 source 지만
 * defense-in-depth.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertValidUuid(uuid: string): string {
  if (!UUID_RE.test(uuid)) {
    throw new Error(
      `Invalid tenantId format (expected UUID, got: ${uuid.substring(0, 64)})`,
    );
  }
  return uuid;
}

/**
 * tenant-scoped Prisma client.
 *
 * 모든 query 를 $transaction 으로 감싸 SET LOCAL 을 멱등 적용한다.
 * TenantContext 가 없으면 throw — withTenant() 외부 호출은 fail-loud.
 *
 * spec §5.2 요지:
 *   - Prisma 6+ 의 Extension 재진입은 자동 회피 (query(args) 가 Extension hook 을 다시 트리거하지 않음).
 *   - $transaction 안에서 SET LOCAL 은 트랜잭션 종료 시 자동 reset → connection pool 재사용 안전.
 */
// 본 프로젝트의 generated client(@/generated/prisma/client) 는 @ts-nocheck 가 적용되어 있어
// Extension callback 인자 / transaction client 의 raw method($executeRawUnsafe) 가 외부 ts 검사에서 누락된다.
// 기존 src/lib/sessions/tokens.ts 등 다수 호출 사이트와 동일 양상 — runtime 동작 OK.
// 회피: any 캐스트 + 명시적 시그니처.
type AllOperationsParams = {
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
  model?: string;
  operation: string;
};

export const prismaWithTenant = (basePrisma as PrismaClient).$extends({
  name: "tenant-rls",
  query: {
    $allOperations: async (params: AllOperationsParams) => {
      const { args, query } = params;
      const ctx = getCurrentTenantOrNull();
      if (!ctx) {
        throw new Error(
          "Tenant context missing. " +
            "All prismaWithTenant.* calls must be inside withTenant() / withTenantTx() / runWithTenant().",
        );
      }

      // Extension 자체가 transaction 을 감싸지 않으면 SET LOCAL 이 다음 query 까지 살지 못한다.
      // basePrisma.$transaction 으로 감싸 GUC 가 query 시점에 유효하게 한다.
      // tx 는 Omit<PrismaClient, ITXClientDenyList> — generated client 의 @ts-nocheck 영향으로
      // 타입 surface 가 부정확. 다른 호출 사이트와 동일하게 any 로 캐스트.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (basePrisma as PrismaClient).$transaction(async (tx: any) => {
          const txAny = tx;
          if (ctx.bypassRls) {
            // 운영 콘솔 BYPASS_RLS — SET LOCAL ROLE app_admin (BYPASSRLS).
            // app_runtime → app_admin 은 GRANT app_admin TO app_runtime 에 의해 가능.
            await txAny.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
          } else {
            const safeUuid = assertValidUuid(ctx.tenantId);
            // PG 의 SET 은 prepared statement 에서 parameterized 가 안 되므로 inline.
            // assertValidUuid 가 SQL injection 1차 방어. defense-in-depth.
            await txAny.$executeRawUnsafe(
              `SET LOCAL app.tenant_id = '${safeUuid}'`,
            );
          }
          // Prisma Client Extension 의 query(args) 는 동일 Extension 재진입 회피 (Prisma 6+).
          return query(args);
        },
      );
    },
  },
});

export type AppPrismaClient = typeof prismaWithTenant;

/**
 * Multi-statement transaction wrapper.
 *
 * 핸들러에서 명시적 transaction 이 필요할 때 사용 — 1 회 SET LOCAL 로 전체 트랜잭션 커버.
 * 핸들러 내부의 prisma.* 호출은 같은 transaction context 를 공유하므로 SET 재실행 없음.
 *
 * spec §5.3 의 시그니처를 충실히 따르되, basePrisma (PrismaClient lazy proxy) 를 사용한다.
 *
 * @example
 *   await withTenantTx(tenantId, async (tx) => {
 *     const user = await tx.user.create({ data: { email, ... } });
 *     await tx.session.create({ data: { userId: user.id, ... } });
 *     return user;
 *   });
 */
export function withTenantTx<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>,
  options?: { bypassRls?: boolean },
): Promise<T> {
  const ctx = { tenantId, bypassRls: options?.bypassRls };
  return runWithTenant(ctx, () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (basePrisma as PrismaClient).$transaction(async (tx: any) => {
      const txAny = tx;
      if (ctx.bypassRls) {
        await txAny.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
      } else {
        const safeUuid = assertValidUuid(tenantId);
        await txAny.$executeRawUnsafe(
          `SET LOCAL app.tenant_id = '${safeUuid}'`,
        );
      }
      // Prisma Client Extension 의 transactional 인자는 PrismaClient 와 동일 surface.
      return fn(tx as unknown as PrismaClient);
    }),
  );
}

/**
 * 단발 query 헬퍼 — runWithTenant 와 prismaWithTenant 사용을 묶음.
 *
 * 가장 간단한 사용 패턴 (단일 query 1회 fetch):
 *   const files = await withTenantQuery(tenantId, () =>
 *     prismaWithTenant.file.findMany({ where: { ownerId } })
 *   );
 */
export function withTenantQuery<T>(
  tenantId: string,
  fn: () => Promise<T>,
  options?: { bypassRls?: boolean },
): Promise<T> {
  return runWithTenant({ tenantId, bypassRls: options?.bypassRls }, fn);
}
