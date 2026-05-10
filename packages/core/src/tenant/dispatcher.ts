/**
 * @yangpyeon/core/tenant/dispatcher — Tenant manifest + Core handler 공통 dispatch.
 *
 * PLUGIN-MIG-5 (S98) — cron runner 의 AGGREGATOR 분기를 generic dispatch 로 교체.
 *
 * 역할:
 *   - 등록 (registerTenant / registerCoreHandler) — 부팅 시 1회.
 *   - 조회 (getTenantManifest / getCoreHandler) — 디버깅/관측 용.
 *   - dispatch (dispatchTenantHandler) — cron runner 가 호출. core handler 우선,
 *     없으면 tenant manifest 의 cronHandlers 에서 lookup.
 *
 * Singleton 정책 (memory rule project_workspace_singleton_globalthis):
 *   Turbopack/Next.js 의 chunk 분할로 본 모듈이 여러 번 로드되어도 globalThis 의
 *   __yangpyeonTenantRegistry 를 공유 → 등록은 한 번만, 모든 dispatch 가 동일 맵
 *   참조.
 *
 * Core handler vs tenant manifest:
 *   - Core: 컨슈머 도메인이 아닌 플랫폼-레벨 cron (예: messenger-attachments-deref).
 *     `messenger` 같은 core 도메인은 tenant 와 N:M 관계라 manifest 적합 X.
 *   - Tenant manifest: 컨슈머별 cron (almanac 의 rss-fetcher, classifier, ...).
 *
 * 우선순위:
 *   1. coreHandlers[name] — 모든 tenant 에 동일 적용.
 *   2. tenantRegistry[ctx.tenantId].cronHandlers[name] — tenant 별 dispatch.
 *   3. 둘 다 없으면 ok=false + errorMessage.
 */
import type { TenantContext } from "./context";
import type {
  TenantManifest,
  TenantCronHandler,
  TenantCronResult,
} from "./manifest";

interface RegistryState {
  tenants: Map<string, TenantManifest>;
  coreHandlers: Map<string, TenantCronHandler>;
}

declare global {
  // eslint-disable-next-line no-var
  var __yangpyeonTenantRegistry: RegistryState | undefined;
}

function state(): RegistryState {
  if (!globalThis.__yangpyeonTenantRegistry) {
    globalThis.__yangpyeonTenantRegistry = {
      tenants: new Map(),
      coreHandlers: new Map(),
    };
  }
  return globalThis.__yangpyeonTenantRegistry;
}

/**
 * Tenant 등록. 동일 id 재등록 시 덮어쓰기 (개발 핫리로드 안전).
 * 부팅 시 1회 호출 — `src/lib/tenant-bootstrap.ts` 가 import 시 side-effect 로 등록.
 */
export function registerTenant(manifest: TenantManifest): void {
  state().tenants.set(manifest.id, manifest);
}

export function unregisterTenant(id: string): void {
  state().tenants.delete(id);
}

export function getTenantManifest(id: string): TenantManifest | undefined {
  return state().tenants.get(id);
}

export function listTenantManifests(): TenantManifest[] {
  return Array.from(state().tenants.values());
}

/**
 * Core handler 등록 — tenant 비특정 cron (예: messenger-attachments-deref).
 * 동일 name 재등록 시 덮어쓰기.
 */
export function registerCoreHandler(
  name: string,
  handler: TenantCronHandler,
): void {
  state().coreHandlers.set(name, handler);
}

export function unregisterCoreHandler(name: string): void {
  state().coreHandlers.delete(name);
}

export function getCoreHandler(name: string): TenantCronHandler | undefined {
  return state().coreHandlers.get(name);
}

/**
 * 테스트용 — 레지스트리 전체 초기화.
 * 운영 코드는 사용 금지 (등록 손실 위험).
 */
export function clearTenantRegistry(): void {
  state().tenants.clear();
  state().coreHandlers.clear();
}

/**
 * Cron runner 의 generic dispatch 진입점.
 *
 * @param moduleName cron payload.module — 예: "rss-fetcher", "messenger-attachments-deref"
 * @param payload    cron payload 전체 (handler 가 batch / 추가 옵션 사용)
 * @param ctx        TenantContext — tenantId 로 manifest lookup
 *
 * 반환:
 *   - core handler 매치 → core handler 실행 결과 그대로
 *   - tenant manifest handler 매치 → manifest handler 실행 결과 그대로
 *   - 둘 다 없음 → { ok: false, errorMessage: "..." }
 *   - manifest 가 disabled 인 경우 → { ok: false, errorMessage: "tenant disabled" }
 */
export async function dispatchTenantHandler(
  moduleName: string,
  payload: Record<string, unknown>,
  ctx: TenantContext,
): Promise<TenantCronResult> {
  const reg = state();

  const coreHandler = reg.coreHandlers.get(moduleName);
  if (coreHandler) {
    return coreHandler(payload, ctx);
  }

  const manifest = reg.tenants.get(ctx.tenantId);
  if (!manifest) {
    return {
      ok: false,
      errorMessage: `tenant '${ctx.tenantId}' 매니페스트 미등록 (module='${moduleName}')`,
    };
  }
  if (!manifest.enabled) {
    return {
      ok: false,
      errorMessage: `tenant '${ctx.tenantId}' disabled (module='${moduleName}')`,
    };
  }

  const handler = manifest.cronHandlers?.[moduleName];
  if (!handler) {
    return {
      ok: false,
      errorMessage: `tenant '${ctx.tenantId}' 의 '${moduleName}' 핸들러 미등록`,
    };
  }

  return handler(payload, ctx);
}
