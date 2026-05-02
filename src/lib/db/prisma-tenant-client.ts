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
  type TenantContext,
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

// Lazy 초기화: $extends 는 첫 property 접근 시점에 호출.
// basePrisma 는 src/lib/prisma.ts 의 lazy Proxy — module-load 시점에 .$extends 를 직접
// 호출하면 vi.mock("@/lib/prisma") 가 적용된 테스트에서 부분 mock 객체에 $extends 가 없어
// "is not a function" 으로 실패한다. 본 Proxy 가 $extends 호출을 첫 .file/.user 등 접근까지 미룬다.
let _extendedClient: ReturnType<PrismaClient["$extends"]> | null = null;
function getExtendedClient() {
  if (!_extendedClient) {
    _extendedClient = (basePrisma as PrismaClient).$extends({
      name: "tenant-rls",
      query: {
        $allOperations: async (params: AllOperationsParams) => {
          const { args, model, operation } = params;
          const ctx = getCurrentTenantOrNull();
          if (!ctx) {
            throw new Error(
              "Tenant context missing. " +
                "All prismaWithTenant.* calls must be inside withTenant() / withTenantTx() / runWithTenant().",
            );
          }

          // 2026-05-02 (s82) — tenantPrismaFor 와 동일 함정. query(args) 가 tx connection
          // 을 사용하지 않고 base client 의 새 connection 으로 escape → SET LOCAL 무효.
          // 수정: tx 안에서 model.operation 을 직접 호출하여 같은 connection 보장.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (basePrisma as PrismaClient).$transaction(async (tx: any) => {
            if (ctx.bypassRls) {
              await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
            } else {
              const safeUuid = assertValidUuid(ctx.tenantId);
              await tx.$executeRawUnsafe(
                `SET LOCAL app.tenant_id = '${safeUuid}'`,
              );
            }
            if (!model) {
              // Raw operation ($executeRawUnsafe/$queryRawUnsafe/$queryRaw 등) — tx
              // delegate 호출 시 args 가 array 면 spread (variadic), 아니면 단일 인자.
              const rawFn = (tx as Record<string, unknown>)[operation];
              if (typeof rawFn === "function") {
                if (Array.isArray(args)) {
                  return (rawFn as (...a: unknown[]) => Promise<unknown>).apply(
                    tx,
                    args,
                  );
                }
                return (rawFn as (a: unknown) => Promise<unknown>).call(tx, args);
              }
              return params.query(args);
            }
            const camel = model.charAt(0).toLowerCase() + model.slice(1);
            const delegate = (tx as Record<string, unknown>)[camel] as
              | Record<string, (args: unknown) => Promise<unknown>>
              | undefined;
            if (!delegate || typeof delegate[operation] !== "function") {
              throw new Error(
                `prismaWithTenant: unknown model/operation in tx — ${model}.${operation}`,
              );
            }
            return delegate[operation].call(delegate, args);
          });
        },
      },
    });
  }
  return _extendedClient;
}

// 타입 surface 는 기본 PrismaClient 와 동일하게 노출 — Extension 의 query hook 은 호출자에게 투명.
// generated client 가 @ts-nocheck 인 점, 다른 호출 사이트가 any 캐스트를 쓰는 점과 일관.
export const prismaWithTenant = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Reflect.get(getExtendedClient() as any, prop);
  },
});

export type AppPrismaClient = typeof prismaWithTenant;

/**
 * tenantPrismaFor — TenantContext 를 closure 로 직접 캡처하는 라우트-범위 클라이언트.
 *
 * 배경 (2026-05-01 사고):
 *   prismaWithTenant + runWithTenant 조합은 AsyncLocalStorage 에 의존하는데,
 *   Prisma 7 의 client extension 이 $allOperations 콜백을 internal worker/queue 로
 *   dispatch 하며 ALS async context 를 잃는 경우가 관측됨 (진단 로그상 같은 ALS
 *   인스턴스인데도 .getStore() 가 null 반환). globalThis 싱글턴으로 chunk 복제는
 *   해결됐으나 ALS propagation 자체가 끊김.
 *
 * 해법:
 *   요청마다 새 extended client 를 만들고 $allOperations callback 의 closure 에
 *   ctx 를 직접 캡처. ALS 의존성 자체를 제거한다. $extends() 비용은 µs 단위라
 *   요청당 호출에도 무시 가능.
 *
 * @example
 *   const tx = tenantPrismaFor({ tenantId: '...', bypassRls: true });
 *   const rows = await tx.stickyNote.findMany({ ... });
 */
export function tenantPrismaFor(ctx: TenantContext): PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (basePrisma as PrismaClient).$extends({
    name: "tenant-rls-direct",
    query: {
      $allOperations: async (params: AllOperationsParams) => {
        const { args, model, operation } = params;
        // 2026-05-02 (s82): Prisma extension 의 `query(args)` 콜백은 우리가 연
        // `$transaction` 의 tx connection 을 사용하지 않고 base client 의
        // 새 connection 으로 escape 한다. 결과: SET LOCAL app.tenant_id 가 적용된
        // tx 와 실제 query 가 다른 connection 이라 RLS 가 always-fail (0 rows).
        //
        // 수정: tx 안에서 SET LOCAL 이후 같은 tx client 의 model.operation 을 직접
        // 호출. Prisma extension 의 자동 query(args) 우회. params.model 은 PascalCase
        // ("Message") 라 camelCase 로 변환 필요.
        //
        // prod 환경(postgres BYPASSRLS) 에서는 SET LOCAL 이 no-op 와 같으나 테스트 환경
        // (app_test_runtime non-bypass) 에서는 본 fix 가 필수.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (basePrisma as PrismaClient).$transaction(async (tx: any) => {
          if (ctx.bypassRls) {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
          } else {
            const safeUuid = assertValidUuid(ctx.tenantId);
            await tx.$executeRawUnsafe(
              `SET LOCAL app.tenant_id = '${safeUuid}'`,
            );
          }
          // Raw operation ($queryRaw/$executeRaw 등) 은 model 미지정 — 원본 query 사용.
          // 단 raw 도 tx connection 을 써야 하므로 tx 에 binding.
          if (!model) {
            const rawFn = (tx as Record<string, unknown>)[operation];
            if (typeof rawFn === "function") {
              return (rawFn as (args: unknown) => Promise<unknown>).call(tx, args);
            }
            // fallback: 알 수 없는 raw operation — query 콜백 사용 (transaction 밖이지만
            // bypass 모드일 가능성 높음).
            return params.query(args);
          }
          // PascalCase → camelCase ("Message" → "message", "AbuseReport" → "abuseReport").
          const camel = model.charAt(0).toLowerCase() + model.slice(1);
          const delegate = (tx as Record<string, unknown>)[camel] as
            | Record<string, (args: unknown) => Promise<unknown>>
            | undefined;
          if (!delegate || typeof delegate[operation] !== "function") {
            throw new Error(
              `tenantPrismaFor: unknown model/operation in tx — ${model}.${operation}`,
            );
          }
          return delegate[operation].call(delegate, args);
        });
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any as PrismaClient;
}

// TenantContext type 재export (호출 사이트에서 별도 import 안 해도 됨)
export type { TenantContext } from "@yangpyeon/core/tenant/context";

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
