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

/** Route 등록 — apps/web 빌드 시 codegen 으로 Next.js route 파일로 expand. */
export interface TenantRouteRegistration {
  /** Next.js App Router 경로 (예: "/api/v1/almanac/contents"). */
  path: string;
  /** dynamic import — 빌드 시점에 핸들러 모듈 lazy load. */
  handler: () => Promise<{
    GET?: unknown;
    POST?: unknown;
    PATCH?: unknown;
    DELETE?: unknown;
  }>;
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
