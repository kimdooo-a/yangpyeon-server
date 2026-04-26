/**
 * Advisory Lock helper — main thread 가 lock holder.
 *
 * Phase 1.5 (T1.5) — 07-adr-028-impl-spec §2.4 + spike-baas-002 §3.7 결정:
 *   - lock holder = main thread (worker terminate 시 lock 자동 해제 함정 회피).
 *   - lock key = sha256(tenant:<id>:job:<id>) 의 첫 8 bytes (BIGINT).
 *
 * pure 한 lock-key 생성은 @yangpyeon/core/cron — 본 파일은 prisma.$queryRaw wrapper 만.
 */
import { prisma } from "@/lib/prisma";
import { tenantJobLockKey } from "@yangpyeon/core";

/** re-export — caller(`registry.ts`) 편의용. */
export { tenantJobLockKey };

/**
 * pg_try_advisory_lock(BIGINT) — non-blocking 시도.
 * 성공 시 true, 이미 다른 connection 이 잡은 경우 false (caller 가 skip).
 */
export async function tryAdvisoryLock(key: bigint): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ got: boolean }>>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS got
  `;
  return rows[0]?.got === true;
}

/**
 * pg_advisory_unlock(BIGINT) — main thread 가 finally 블록에서 호출.
 * 같은 connection 이 잡지 않은 키를 unlock 시도해도 PG 가 silent 처리 (false 반환).
 */
export async function releaseAdvisoryLock(key: bigint): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;
}
