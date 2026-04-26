/**
 * loadTenantCronPolicy — TenantCronPolicy 로드 + DEFAULT fallback.
 *
 * Phase 1.5 (T1.5) — 07-adr-028-impl-spec §11 체크리스트 §src/lib/cron/policy.ts.
 *
 * 책임:
 *   - prisma.tenantCronPolicy.findUnique 로 per-tenant override 조회.
 *   - row 부재 시 DEFAULT_POLICY (코드 상수) 반환.
 *   - DB 에러 시 caller 에 throw — TenantWorkerPool 이 .catch(() => DEFAULT_POLICY) 로 감싼다.
 *
 * 캐싱은 호출자(TenantWorkerPool) 책임 — 본 모듈은 단발 조회만.
 */
import { prisma } from "@/lib/prisma";

/** 07-adr-028-impl-spec §7.1 + spike-baas-002 §3.2 — 캐스팅 가능한 plain shape. */
export interface TenantCronPolicy {
  /** per-tenant 동시 실행 cron 개수 캡 (main thread 게이트). */
  maxConcurrentJobs: number;
  /** per-job timeout (worker.terminate 트리거). */
  jobTimeoutMs: number;
  /** resourceLimits.maxOldGenerationSizeMb — 약한 heap cap. */
  jobMemoryLimitMb: number;
  /** circuit breaker OPEN 진입 임계값. */
  consecutiveFailureThreshold: number;
  /** 분당 tick 한도 (운영 모니터링). */
  ticksPerDay: number;
  /** 컨슈머별 fetch 화이트리스트. */
  allowedFetchHosts: string[];
  /** WEBHOOK fetch 타임아웃. */
  webhookTimeoutMs: number;
}

/**
 * DEFAULT_POLICY — TenantCronPolicy row 부재 시 사용하는 안전 기본값.
 * Prisma model 의 @default 와 정합성 유지 필수 (Stage 1.5 + Stage 3 enforce 동기).
 */
export const DEFAULT_POLICY: TenantCronPolicy = {
  maxConcurrentJobs: 3,
  jobTimeoutMs: 30_000,
  jobMemoryLimitMb: 128,
  consecutiveFailureThreshold: 5,
  ticksPerDay: 1440,
  allowedFetchHosts: [],
  webhookTimeoutMs: 60_000,
};

/**
 * tenantId 로 TenantCronPolicy 조회. row 없으면 DEFAULT_POLICY.
 *
 * @throws 본 함수 자체는 에러 던지지 않으나 prisma.findUnique 실패 시 caller 에 전파.
 *         caller(TenantWorkerPool.resolvePolicy) 가 .catch(() => DEFAULT_POLICY) 로 감싼다.
 */
export async function loadTenantCronPolicy(
  tenantId: string,
): Promise<TenantCronPolicy> {
  const row = await prisma.tenantCronPolicy.findUnique({
    where: { tenantId },
  });
  if (!row) return DEFAULT_POLICY;
  return {
    maxConcurrentJobs: row.maxConcurrentJobs,
    jobTimeoutMs: row.jobTimeoutMs,
    jobMemoryLimitMb: row.jobMemoryLimitMb,
    consecutiveFailureThreshold: row.consecutiveFailureThreshold,
    ticksPerDay: row.ticksPerDay,
    allowedFetchHosts: row.allowedFetchHosts ?? [],
    webhookTimeoutMs: row.webhookTimeoutMs,
  };
}
