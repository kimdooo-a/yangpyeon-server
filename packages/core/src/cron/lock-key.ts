/**
 * tenantJobLockKey — (tenantId, jobId) → BIGINT (PG advisory lock 호환).
 *
 * 07-adr-028-impl-spec §2.4 + spike-baas-002 §3.7 전략 1 채택.
 *
 * 핵심:
 *   - sha256(tenant:<id>:job:<id>) 의 첫 8 bytes 를 BIGINT 로 reading.
 *   - 충돌 위험: 64-bit hash, 200 jobs × 1.5 cluster worker = 300 entry,
 *     충돌 확률 ~10⁻¹⁵ (통계적 무시 가능).
 *   - Pure function — DB/IO 의존 없음. packages/core 에서 격리.
 *
 * 호출자:
 *   - src/lib/cron/lock.ts — pg_try_advisory_lock(BIGINT) 인자로 사용.
 *   - src/lib/cron/registry.ts — tick() 에서 per-(tenant,job) lock 획득.
 *
 * 시그니처 변경 시 ADR-028 amendment 필수.
 */
import { createHash } from "node:crypto";

/**
 * 주어진 tenantId + jobId 로 결정적(deterministic) BIGINT lock key 생성.
 *
 * @param tenantId 테넌트 식별자 (UUID 또는 slug)
 * @param jobId    Cron job 식별자 (UUID)
 * @returns 64-bit signed BIGINT (-2^63 ~ 2^63-1) — pg_advisory_lock 호환.
 */
export function tenantJobLockKey(tenantId: string, jobId: string): bigint {
  const h = createHash("sha256")
    .update(`tenant:${tenantId}:job:${jobId}`)
    .digest();
  // 첫 8 bytes 를 signed BIGINT 로 reading.
  // PG advisory lock 은 signed bigint 받음 (PG bigint range = JS BigInt 64-bit signed).
  return h.readBigInt64BE(0);
}
