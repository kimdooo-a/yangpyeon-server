import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 세션 37 — revokeAllExceptCurrent 는 Prisma updateMany 동작에 의존.
 * rate-limit-db.test.ts 패턴을 따라 `@/lib/prisma` 만 모킹하고 where 절 구성만 검증.
 * 실제 PG 동작은 E2E curl 로 확인.
 */
const { mockUpdateMany } = vi.hoisted(() => ({
  mockUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      updateMany: mockUpdateMany,
    },
  },
}));

import {
  generateOpaqueToken,
  hashToken,
  REFRESH_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_SEC,
  revokeAllExceptCurrent,
} from "./tokens";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOpaqueToken — opaque 랜덤 토큰", () => {
  it("32 bytes = 64 hex chars", () => {
    const token = generateOpaqueToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("매 호출마다 고유 값", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateOpaqueToken());
    expect(set.size).toBe(100);
  });
});

describe("hashToken — SHA-256 hex", () => {
  it("same input → same hash (결정성)", () => {
    const h1 = hashToken("abc123");
    const h2 = hashToken("abc123");
    expect(h1).toBe(h2);
  });

  it("different input → different hash (충돌 없음)", () => {
    const h1 = hashToken("abc123");
    const h2 = hashToken("abc124");
    expect(h1).not.toBe(h2);
  });

  it("hex 64 chars (256 bits / 4 bits per hex)", () => {
    const h = hashToken("x");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("빈 문자열도 처리 (SHA-256 e3b0... empty hash)", () => {
    const h = hashToken("");
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("REFRESH_TOKEN_MAX_AGE — 7일 상수", () => {
  it("MS 는 7일", () => {
    expect(REFRESH_TOKEN_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("SEC 는 MS / 1000 (604800)", () => {
    expect(REFRESH_TOKEN_MAX_AGE_SEC).toBe(604800);
  });
});

describe("revokeAllExceptCurrent — 세션 37 사용자 자발적 종료", () => {
  it("currentSessionId 제공 시 NOT { id: current } 포함", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });
    const count = await revokeAllExceptCurrent("user-1", "sess-current");
    expect(count).toBe(2);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const args = mockUpdateMany.mock.calls[0][0];
    expect(args.where.userId).toBe("user-1");
    expect(args.where.revokedAt).toBeNull();
    expect(args.where.NOT).toEqual({ id: "sess-current" });
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });

  it("currentSessionId 미제공(null) 시 NOT 절 생략 → 전체 revoke", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 3 });
    const count = await revokeAllExceptCurrent("user-2", null);
    expect(count).toBe(3);
    const args = mockUpdateMany.mock.calls[0][0];
    expect(args.where.userId).toBe("user-2");
    expect("NOT" in args.where).toBe(false);
  });

  it("currentSessionId 미제공(undefined) 시도 NOT 절 생략", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const count = await revokeAllExceptCurrent("user-3");
    expect(count).toBe(0);
    const args = mockUpdateMany.mock.calls[0][0];
    expect("NOT" in args.where).toBe(false);
  });

  it("빈 문자열 currentSessionId 는 falsy → NOT 절 생략", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });
    await revokeAllExceptCurrent("user-4", "");
    const args = mockUpdateMany.mock.calls[0][0];
    expect("NOT" in args.where).toBe(false);
  });

  it("Prisma 에러 전파 (try/catch 금지 — 상위에서 처리)", async () => {
    mockUpdateMany.mockRejectedValueOnce(new Error("DB connection lost"));
    await expect(
      revokeAllExceptCurrent("user-5", "sess-x"),
    ).rejects.toThrow("DB connection lost");
  });
});
