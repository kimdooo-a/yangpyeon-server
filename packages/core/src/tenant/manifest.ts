/**
 * @yangpyeon/core/tenant/manifest — Tenant 패키지 (workspace) 의 선언 인터페이스.
 *
 * ADR-024 옵션 D (Hybrid: Complex=workspace, Simple=manifest) 의 workspace 측 매니페스트.
 * Complex tenant (Almanac, JobBoard 등) 는 `packages/tenant-<id>/manifest.ts` 에서
 * 본 인터페이스를 satisfies 한다.
 *
 * 본 골격은 PLUGIN-MIG-1 (S98 schema-first) 의 최소 형태 — Phase 1.x manifest 가
 * 채택될 때까지 호환 유지. Simple tenant (DB row manifest) 는 별도 SimpleTenantSpec
 * 인터페이스로 분리 (Phase 2.x).
 *
 * 4 불변 인터페이스 중 `computeEffectiveConfig(tenantId)` 의 입력 토대.
 * 시그니처 변경 시 ADR-024/026 amendment 필수.
 */

import type { TenantContext } from "./context";

/** Cron handler 시그니처 — packages/core 의 dispatchTenantJob 가 호출. */
export type TenantCronHandler = (
  payload: Record<string, unknown>,
  ctx: TenantContext,
) => Promise<TenantCronResult>;

/** Cron handler 결과 — core cron runner 가 audit log + circuit breaker 에 반영. */
export interface TenantCronResult {
  ok: boolean;
  /** 처리한 단위 (msg/row 등). 메트릭 차원에 사용. */
  processedCount?: number;
  /** 실패 시 메시지 (audit log + observability). */
  errorMessage?: string;
}

/** HTTP 메서드 (TenantRouteRegistration.methods 의 키). */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PATCH"
  | "PUT"
  | "DELETE"
  | "OPTIONS";

/**
 * Plugin route handler 호출 컨텍스트.
 *
 * app-side dispatcher (`src/lib/tenant-router/dispatch.ts`) 가 withTenant 가드
 * 통과 후 본 객체를 구성하여 handler 에 전달한다.
 *
 * `tenant`/`user` 의 실제 형은 app-side `ResolvedTenant` / `AccessTokenPayload`
 * 이지만, core 가 app-side 에 역의존하지 않도록 구조적 호환 사본만 노출한다.
 * Plugin 은 본 인터페이스의 필드만 사용 가능 — app-side 추가 필드 의존 시
 * ADR-024 옵션 D 의 격리가 깨진다.
 */
export interface TenantRouteContext {
  request: Request;
  tenant: {
    id: string;
    slug: string;
    displayName: string;
    active: boolean;
    status: string;
  };
  user: {
    sub: string;
    email: string;
    role: string;
    type: string;
  };
  /** `:slug` 등 path 패턴에서 추출한 dynamic param. */
  params: Record<string, string>;
  /** /api/v1/t/<tenant>/ 이후 전체 subPath (디버깅/감사). */
  subPath: string;
}

/** Plugin route handler 시그니처. */
export type TenantRouteHandler = (
  ctx: TenantRouteContext,
) => Promise<Response>;

/**
 * Route 등록 — manifest.routes 배열 항목.
 *
 * PLUGIN-MIG-3 (S99): 기존 codegen-지향 thunk 시그니처에서 dynamic dispatch
 * 시그니처로 전환. 기준 prefix 는 `/api/v1/t/<tenant>/` 이며, `path` 는 그
 * 이후의 상대 패턴.
 *
 * Path 패턴 문법 (간이):
 *   - 정적 segment: "contents", "today-top"
 *   - dynamic param: "items/:slug" → params.slug 로 추출
 *   - 와일드카드/optional 미지원 (필요 시 path-to-regexp 도입 검토)
 */
export interface TenantRouteRegistration {
  /** /api/v1/t/<tenant>/ 기준 상대 경로 패턴. */
  path: string;
  /** 메서드별 핸들러. 없는 메서드는 dispatcher 가 405 반환. */
  methods: Partial<Record<HttpMethod, TenantRouteHandler>>;
}

/** Admin UI 페이지 등록 — apps/web/app/admin/(<id>)/* 로 codegen. */
export interface TenantAdminPageRegistration {
  /** /admin/(<id>)/<slug> 의 slug. */
  slug: string;
  /** dynamic import — 페이지 컴포넌트 lazy load. */
  page: () => Promise<{ default: unknown }>;
}

/** Tenant 매니페스트 본체. */
export interface TenantManifest {
  /** 영구 식별자 (예: "almanac"). DB tenants.id 와 일치. */
  id: string;
  /** 버전 (semver). 마이그레이션 추적 용도. */
  version: string;
  /** 사람이 읽는 표시명 (운영 콘솔). */
  displayName: string;
  /** 활성 여부. false 면 cron/route 등록 skip (kill-switch). */
  enabled: boolean;
  /** Cron 핸들러 맵 — kind="TENANT" 작업의 module 필드로 dispatch. */
  cronHandlers?: Record<string, TenantCronHandler>;
  /** REST 라우트 등록. 코드 0줄 신규 라우트 도입의 단일 진입점. */
  routes?: TenantRouteRegistration[];
  /** Admin UI 페이지 등록. */
  adminPages?: TenantAdminPageRegistration[];
  /** Prisma schema fragment 경로 — apps/web 빌드 시 core schema 끝에 append. */
  prismaFragment?: string;
  /** 환경 변수 의존성 — 빌드/런타임 검증 (없으면 부팅 거부). */
  envVarsRequired?: string[];
  /** Data API allowlist — Prisma 모델별 노출 정책 병합. */
  dataApiAllowlist?: Record<
    string,
    { read?: boolean; write?: boolean; list?: boolean }
  >;
}

/** 매니페스트 정의 helper — type 추론 보강 (defineTenant 어휘). */
export function defineTenant(manifest: TenantManifest): TenantManifest {
  return manifest;
}
