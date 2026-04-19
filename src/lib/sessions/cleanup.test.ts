import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 세션 40 — TIMESTAMPTZ 마이그레이션 후에도 Prisma 7 adapter-pg 의 binding-side
 * TZ 시프트가 별도 존재함이 E2E 에서 재확인됨. 정공법은 SELECT 의 cutoff 를
 * PG 측 `NOW() - INTERVAL '1 day'` 로 위임. DELETE 는 ORM `deleteMany` 사용.
 */
const { mockQueryRaw, mockDeleteMany } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    session: {
      deleteMany: mockDeleteMany,
    },
  },
}));

import { buildSessionExpireAuditDetail, cleanupExpiredSessions } from "./cleanup";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSessionExpireAuditDetail — 만료 세션 감사 payload", () => {
  it("필수 필드 JSON 으로 반환 (sessionId, userId, expiresAt, reason='expired')", () => {
    const detail = buildSessionExpireAuditDetail({
      id: "sess-1",
      userId: "user-1",
      expiresAt: new Date("2026-04-18T03:00:00.000Z"),
    });
    const parsed = JSON.parse(detail);
    expect(parsed.sessionId).toBe("sess-1");
    expect(parsed.userId).toBe("user-1");
    expect(parsed.reason).toBe("expired");
    expect(parsed.expiresAt).toBe("2026-04-18T03:00:00.000Z");
  });

  it("반환값은 항상 JSON.parse 가능한 문자열", () => {
    const detail = buildSessionExpireAuditDetail({
      id: "s",
      userId: "u",
      expiresAt: new Date(0),
    });
    expect(() => JSON.parse(detail)).not.toThrow();
  });

  it("expiresAt 을 ISO 문자열로 직렬화 (Date 객체 아님)", () => {
    const detail = buildSessionExpireAuditDetail({
      id: "s",
      userId: "u",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const parsed = JSON.parse(detail);
    expect(typeof parsed.expiresAt).toBe("string");
    expect(parsed.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("cleanupExpiredSessions — raw SELECT (PG NOW()-INTERVAL) + ORM deleteMany", () => {
  it("PG ::text ISO+offset 문자열을 정확한 UTC Date 로 변환", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "sess-1", userId: "user-a", expiresAt: "2026-04-01 00:00:00.000+00" },
      { id: "sess-2", userId: "user-b", expiresAt: "2026-04-02 00:00:00.000+00" },
    ]);
    mockDeleteMany.mockResolvedValueOnce({ count: 2 });

    const result = await cleanupExpiredSessions();
    expect(result.deleted).toBe(2);
    expect(result.expiredEntries).toHaveLength(2);
    expect(result.expiredEntries[0].id).toBe("sess-1");
    expect(result.expiredEntries[0].expiresAt).toBeInstanceOf(Date);
    expect(result.expiredEntries[0].expiresAt.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
  });

  it("PG ::text +09 KST offset 문자열도 정확한 UTC Date 로 변환", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "s1", userId: "u1", expiresAt: "2026-04-18 14:14:19.232+09" },
    ]);
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await cleanupExpiredSessions();
    expect(result.expiredEntries[0].expiresAt.toISOString()).toBe(
      "2026-04-18T05:14:19.232Z",
    );
  });

  it("만료 세션 0건 시 deleteMany 호출 없이 빈 배열 반환", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await cleanupExpiredSessions();
    expect(result.deleted).toBe(0);
    expect(result.expiredEntries).toEqual([]);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("SELECT raw SQL 에 PG 측 NOW()-INTERVAL '1 day' + ::text 캐스팅 포함", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await cleanupExpiredSessions();
    const strings = mockQueryRaw.mock.calls[0][0];
    const combined = Array.isArray(strings) ? strings.join("?") : String(strings);
    expect(combined).toMatch(/FROM sessions/i);
    expect(combined).toMatch(/expires_at\s*<\s*NOW\(\)\s*-\s*INTERVAL/i);
    expect(combined).toMatch(/'1 day'/i);
    expect(combined).toMatch(/expires_at::text/i);
  });

  it("DELETE 는 eligible id 만 대상 (deleteMany id IN ids)", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "a", userId: "u1", expiresAt: "2026-04-18 00:00:00.000+00" },
      { id: "b", userId: "u2", expiresAt: "2026-04-18 00:00:00.000+00" },
    ]);
    mockDeleteMany.mockResolvedValueOnce({ count: 2 });

    await cleanupExpiredSessions();
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
    });
  });

  it("Prisma 에러 전파 (scheduler 가 상위에서 catch)", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("DB 연결 끊김"));
    await expect(cleanupExpiredSessions()).rejects.toThrow("DB 연결 끊김");
  });

  it("deleteMany count 를 deleted 로 반환", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "x", userId: "u", expiresAt: "2026-04-18 00:00:00.000+00" },
    ]);
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await cleanupExpiredSessions();
    expect(result.deleted).toBe(1);
    expect(typeof result.deleted).toBe("number");
  });
});
