/**
 * TenantContext — AsyncLocalStorage 기반 요청-범위 테넌트 식별자.
 *
 * Phase 1.1 (T1.1) 1차 산출. ADR-023 §5.1 시그니처 준수.
 *
 * 역할:
 *   - 모든 핸들러는 요청 진입 시 `runWithTenant(ctx, fn)` 으로 감싸진다.
 *   - 핸들러 내부 어디서든 `getCurrentTenant()` 로 동기 조회 가능.
 *   - Prisma Client Extension(Phase 1.4) 가 이 값을 SET LOCAL 로 PG 세션에 주입.
 *
 * 4 불변 인터페이스 중 `withTenant(handler)`/`withTenantTx(fn)` 의 토대.
 * 시그니처 변경 시 ADR-023 amendment 필수.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  /** 테넌트 식별자(URL slug 또는 UUID — Phase 1.2 에서 확정). */
  tenantId: string;
  /**
   * 운영자 BYPASS_RLS 모드.
   * true 일 경우 Prisma Extension 이 `SET LOCAL ROLE app_admin` 으로 RLS 우회.
   * 운영 콘솔(`/dashboard/*`) 전용 — 컨슈머 라우트(`/api/v1/t/*`) 에서는 항상 false.
   */
  bypassRls?: boolean;
}

// Turbopack 이 본 모듈을 라우트별 chunk 에 인라인 복제 → 각 chunk 가 자체 `new AsyncLocalStorage`
// 를 가지면 storage 가 분기됨. globalThis + Symbol.for 로 프로세스 단위 단일 인스턴스를
// 강제해 모든 chunk 사본이 동일 storage 를 공유하도록 한다.
//
// ⚠ 2026-05-01 진단 결과: globalThis 싱글턴은 정상 작동하나, Prisma 7 의 client extension
// $allOperations 콜백이 internal worker 로 dispatch 되며 ALS async context 자체가 끊어지는
// 케이스가 관측됨. 따라서 prismaWithTenant + runWithTenant 조합은 신뢰 불가.
// 신규 호출 사이트는 src/lib/db/prisma-tenant-client.ts 의 `tenantPrismaFor(ctx)` 를 사용할 것.
// runWithTenant/getCurrentTenant 자체는 다른 비-Prisma 용도(예: audit-log 자동주입)에서 유효.
const STORAGE_KEY = Symbol.for("@yangpyeon/core/tenant/context::tenantStorage");
type GlobalWithStorage = typeof globalThis & {
  [STORAGE_KEY]?: AsyncLocalStorage<TenantContext>;
};
const g = globalThis as GlobalWithStorage;
const tenantStorage: AsyncLocalStorage<TenantContext> =
  g[STORAGE_KEY] ?? (g[STORAGE_KEY] = new AsyncLocalStorage<TenantContext>());

/**
 * 현재 요청의 TenantContext 를 반환.
 * 컨텍스트 외부 호출 시 throw — fail-loud 가드.
 */
export function getCurrentTenant(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error(
      "Tenant context missing. Did you wrap your handler in withTenant()?"
    );
  }
  return ctx;
}

/**
 * 컨텍스트가 없을 수 있는 코드(예: 부트스트랩, 시스템 cron) 용 안전 조회.
 */
export function getCurrentTenantOrNull(): TenantContext | null {
  return tenantStorage.getStore() ?? null;
}

/**
 * 주어진 컨텍스트로 비동기 함수를 실행.
 * AsyncLocalStorage 가 await/Promise/setTimeout 경계를 가로질러 컨텍스트를 전파한다.
 *
 * ⚠ Prisma 호출 경로에는 사용 금지 (위 모듈 헤더 참조). 다른 비동기 용도용.
 */
export function runWithTenant<T>(
  ctx: TenantContext,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantStorage.run(ctx, fn);
}
