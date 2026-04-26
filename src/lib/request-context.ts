// Phase 1.7 (T1.7) ADR-029 §2.3.1 — request-scoped context (T3 trace correlation).
//
// 목적: AsyncLocalStorage 기반으로 요청 진입 시 traceId/tenantId/userId 를 캡슐화하여
// safeAudit, recordTenantMetric, console.warn 등 cross-cutting observability 가
// 시그니처 변경 없이 (ADR-021 §amendment-2) 자동으로 차원 정보를 획득한다.
//
// 관계:
//   - packages/core 의 TenantContext (T1.1) 와 직교 — 본 모듈은 observability 차원 (traceId 포함).
//   - withRequestContext() (src/lib/with-request-context.ts) 가 API Route 진입점에서 진입.
//   - Edge Runtime 미들웨어 (src/middleware.ts) 는 X-Request-Id 헤더만 발급.
//     (Edge Runtime 은 AsyncLocalStorage 미지원 — Node Runtime 진입 후 ALS 시작.)
//
// 핵심 invariant (ADR-021 §amendment-2):
//   - safeAudit / writeAuditLogDb / recordTenantMetric 는 본 모듈을 import 하되,
//     getRequestContext() 가 undefined 반환 시 '_system' / undefined 로 fail-soft.
//   - 도메인 라우트 11 콜사이트 시그니처 무수정.

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  /** 요청 trace ID — X-Request-Id 헤더 또는 server-side crypto.randomUUID(). T3 correlation key. */
  traceId: string;
  /** 인증/라우터 해석 후 주입되는 tenant slug ('almanac' / 'default' / ...). 미인증 시 undefined. */
  tenantId?: string;
  /** 옵션: 인증된 사용자 ID. audit detail 평문 회피용 보조 식별자. */
  userId?: string;
  /** 요청 시작 ms 타임스탬프. duration 계산 용. */
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * 현재 요청 컨텍스트를 조회.
 *
 * 외부(부트스트랩, 시스템 cron, 정적 import 시점) 호출 시 undefined.
 * fail-soft 호출자가 직접 `_system` 등 fallback 을 정한다 (ADR-021 §amendment-2).
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * 주어진 컨텍스트로 함수를 실행 — sync/async 모두 지원.
 *
 * AsyncLocalStorage.run 은 await/Promise/setTimeout 경계를 가로질러
 * 컨텍스트를 자동 전파한다.
 */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * 테스트 전용 — 현재 컨텍스트를 재정의(덮어쓰기). 운영 코드에서 사용 금지.
 *
 * 예: 단일 콜사이트의 traceId 만 갱신하려는 경우. 일반 로직에서는
 * `runWithContext` 를 새로 호출해 새 스코프를 시작하라.
 */
export function setRequestContextForTesting(
  ctx: Partial<RequestContext>,
): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, ctx);
}
