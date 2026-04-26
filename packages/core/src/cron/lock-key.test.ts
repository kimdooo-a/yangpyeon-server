/**
 * tenantJobLockKey 단위 테스트.
 *
 * 검증 대상 (07-adr-028-impl-spec §2.4 + §5.2 전략 1):
 *   1. 결정성(deterministic): 동일 (tenantId, jobId) → 동일 BIGINT
 *   2. 다른 tenant 또는 다른 job 은 다른 키 생성
 *   3. 정확히 64-bit signed BIGINT 범위 안 (PG advisory lock 호환)
 *   4. 1000 쌍 sample 충돌 없음 (~10⁻¹⁵ 확률 가시 검증)
 */
import { describe, it, expect } from "vitest";
import { tenantJobLockKey } from "./lock-key";

describe("tenantJobLockKey (07-adr-028-impl-spec §2.4)", () => {
  it("동일 (tenantId, jobId) → 동일 키 (deterministic)", () => {
    const key1 = tenantJobLockKey("almanac", "cleanup-sessions");
    const key2 = tenantJobLockKey("almanac", "cleanup-sessions");
    expect(key1).toBe(key2);
    expect(typeof key1).toBe("bigint");
  });

  it("다른 tenant/job 쌍은 다른 키", () => {
    const k1 = tenantJobLockKey("almanac", "cleanup");
    const k2 = tenantJobLockKey("almanac", "cleanup-sessions");
    const k3 = tenantJobLockKey("default", "cleanup");
    const k4 = tenantJobLockKey("default", "cleanup-sessions");

    // 4개 키가 모두 distinct.
    const set = new Set([k1, k2, k3, k4]);
    expect(set.size).toBe(4);
  });

  it("64-bit signed BIGINT 범위 (-2^63 ~ 2^63-1) 안", () => {
    // ES2017 target 호환: BigInt() 함수 사용 (literal `n` 미지원).
    const min = -(BigInt(1) << BigInt(63));
    const max = (BigInt(1) << BigInt(63)) - BigInt(1);

    // 다양한 입력으로 검증.
    const samples = [
      tenantJobLockKey("a", "b"),
      tenantJobLockKey("almanac", "very-long-job-name-with-dashes"),
      tenantJobLockKey("00000000-0000-0000-0000-000000000000", "uuid-job"),
      tenantJobLockKey("", ""), // edge: 빈 문자열도 허용.
    ];

    for (const k of samples) {
      expect(k >= min).toBe(true);
      expect(k <= max).toBe(true);
    }
  });

  it("1000 (tenant, job) 쌍 — 충돌 없음 (sha256 64-bit 첫 8바이트 분포 확인)", () => {
    const keys = new Set<bigint>();
    // 50 tenants × 20 jobs/tenant = 1000 쌍 — 운영 시 N=20 × ~10 cron = 200 의 5배.
    for (let t = 0; t < 50; t++) {
      for (let j = 0; j < 20; j++) {
        const k = tenantJobLockKey(`tenant-${t}`, `job-${j}`);
        keys.add(k);
      }
    }
    expect(keys.size).toBe(1000); // 충돌 0
  });
});
