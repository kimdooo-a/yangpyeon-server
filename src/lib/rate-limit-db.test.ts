import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 15 Step 6 — DB-backed Rate Limiter 단위 테스트.
 *
 * Prisma client (`@/lib/prisma`) 의 `$queryRaw` / `$executeRaw` 만 모킹.
 * 실제 PG SQL 동작은 별도 통합 테스트(WSL 배포 후 curl) 로 검증 — 본 파일은 비즈니스 로직만.
 */
const { mockQueryRaw, mockExecuteRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockExecuteRaw: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    $executeRaw: mockExecuteRaw,
  },
}));

import {
  checkRateLimitDb,
  cleanupExpiredRateLimitBuckets,
  buildBucketKey,
} from "./rate-limit-db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildBucketKey", () => {
  it("scope:dimension:value 포맷, value 는 lowercase", () => {
    expect(buildBucketKey("v1Login", "ip", "1.2.3.4")).toBe("v1Login:ip:1.2.3.4");
    expect(buildBucketKey("v1Login", "email", "Kim@Example.COM")).toBe(
      "v1Login:email:kim@example.com",
    );
  });

  it("scope/dimension 은 그대로 (lowercase 변환 없음)", () => {
    expect(buildBucketKey("MfaChallenge", "user", "u-1")).toBe("MfaChallenge:user:u-1");
  });
});

describe("checkRateLimitDb — happy path", () => {
  it("hits=1 (신규 키): allowed=true, remaining = max-1", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ hits: 1, reset_ms: "60000" }]);

    const result = await checkRateLimitDb("test:ip:1.2.3.4", 5, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.hits).toBe(1);
    expect(result.resetMs).toBe(60_000);
  });

  it("hits=5 정확히 max: allowed=true, remaining=0", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ hits: 5, reset_ms: "55000" }]);

    const result = await checkRateLimitDb("test:ip:1.2.3.4", 5, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.hits).toBe(5);
    expect(result.resetMs).toBe(55_000);
  });

  it("hits=6 max 초과: allowed=false, remaining=0", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ hits: 6, reset_ms: "10000" }]);

    const result = await checkRateLimitDb("test:ip:1.2.3.4", 5, 60_000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.hits).toBe(6);
    expect(result.resetMs).toBe(10_000);
  });

  it("PG 가 EXTRACT EPOCH 소수점 포함 문자열 반환 시 floor 적용", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ hits: 3, reset_ms: "30450.789" }]);

    const result = await checkRateLimitDb("test:ip:1.2.3.4", 5, 60_000);

    expect(result.resetMs).toBe(30_450);
  });

  it("음수/0 reset_ms 는 0 으로 floor (윈도우 만료 경계)", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ hits: 1, reset_ms: "-100" }]);

    const result = await checkRateLimitDb("test:ip:1.2.3.4", 5, 60_000);

    expect(result.resetMs).toBe(0);
  });
});

describe("checkRateLimitDb — guard", () => {
  it("maxRequests <= 0 은 throw", async () => {
    await expect(checkRateLimitDb("k", 0, 60_000)).rejects.toThrow();
    await expect(checkRateLimitDb("k", -1, 60_000)).rejects.toThrow();
  });

  it("windowMs <= 0 은 throw", async () => {
    await expect(checkRateLimitDb("k", 5, 0)).rejects.toThrow();
    await expect(checkRateLimitDb("k", 5, -1)).rejects.toThrow();
  });

  it("RETURNING 0행(이론상 불가)에도 graceful fallback", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await checkRateLimitDb("test:ip:1.2.3.4", 5, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetMs).toBe(60_000);
    expect(result.hits).toBe(1);
  });
});

describe("cleanupExpiredRateLimitBuckets", () => {
  it("$executeRaw 결과를 number 로 반환", async () => {
    mockExecuteRaw.mockResolvedValueOnce(7);

    const deleted = await cleanupExpiredRateLimitBuckets();

    expect(deleted).toBe(7);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("BigInt 결과도 안전하게 number 로 변환", async () => {
    mockExecuteRaw.mockResolvedValueOnce(BigInt(42));

    const deleted = await cleanupExpiredRateLimitBuckets();

    expect(deleted).toBe(42);
  });
});
