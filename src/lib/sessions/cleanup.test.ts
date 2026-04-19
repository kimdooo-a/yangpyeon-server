import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 세션 39 — cleanupExpiredSessions 는 PG 서버측 NOW()-INTERVAL 로 filter 를 위임하여
 * Prisma 7 + adapter-pg + TIMESTAMP(3) timezone-naive 조합에서의 9시간 KST 오프셋을 우회.
 * `$queryRaw` + `$executeRaw` 만 모킹.
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

describe("cleanupExpiredSessions — 만료 1일 경과 세션 정리 (raw SQL)", () => {
  it("만료 세션 entries + 삭제 건수 반환", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "sess-1", userId: "user-a", expiresAt: "2026-04-01 00:00:00.000" },
      { id: "sess-2", userId: "user-b", expiresAt: "2026-04-02 00:00:00.000" },
    ]);
    mockExecuteRaw.mockResolvedValueOnce(2);

    const result = await cleanupExpiredSessions();
    expect(result.deleted).toBe(2);
    expect(result.expiredEntries).toHaveLength(2);
    expect(result.expiredEntries[0].id).toBe("sess-1");
    expect(result.expiredEntries[0].userId).toBe("user-a");
    expect(result.expiredEntries[0].expiresAt).toBeInstanceOf(Date);
    expect(result.expiredEntries[0].expiresAt.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
  });

  it("만료 세션 0건 시 $executeRaw 호출 없이 빈 배열 반환", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    const result = await cleanupExpiredSessions();
    expect(result.deleted).toBe(0);
    expect(result.expiredEntries).toEqual([]);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("PG 서버측 NOW()-INTERVAL filter 위임 — SELECT raw SQL 에 NOW()-INTERVAL 포함", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await cleanupExpiredSessions();
    // $queryRaw 는 tagged template 으로 호출됨. 첫 인자는 strings 배열.
    const strings = mockQueryRaw.mock.calls[0][0];
    const combined = Array.isArray(strings) ? strings.join("?") : String(strings);
    expect(combined).toMatch(/FROM sessions/i);
    expect(combined).toMatch(/expires_at\s*<\s*NOW\(\)\s*-\s*INTERVAL/i);
    expect(combined).toMatch(/'1 day'/i);
  });

  it("expires_at::text 캐스팅으로 원본 문자열 보존 (TZ 오프셋 회피)", async () => {
    mockQueryRaw.mockResolvedValueOnce([]);

    await cleanupExpiredSessions();
    const strings = mockQueryRaw.mock.calls[0][0];
    const combined = Array.isArray(strings) ? strings.join("?") : String(strings);
    expect(combined).toMatch(/expires_at::text/i);
  });

  it("PG 반환 공백 구분 timestamp 문자열을 UTC Date 로 변환", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "s1", userId: "u1", expiresAt: "2026-04-18 02:32:50.001" },
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1);

    const result = await cleanupExpiredSessions();
    expect(result.expiredEntries[0].expiresAt.toISOString()).toBe(
      "2026-04-18T02:32:50.001Z",
    );
  });

  it("DELETE 는 eligible id 만 대상 (id = ANY(ids))", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "a", userId: "u1", expiresAt: "2026-04-18 00:00:00.000" },
      { id: "b", userId: "u2", expiresAt: "2026-04-18 00:00:00.000" },
    ]);
    mockExecuteRaw.mockResolvedValueOnce(2);

    await cleanupExpiredSessions();
    // $executeRaw 는 tagged template — 두 번째 값이 바인딩됨. 첫 인자는 strings.
    const strings = mockExecuteRaw.mock.calls[0][0];
    const combined = Array.isArray(strings) ? strings.join("?") : String(strings);
    expect(combined).toMatch(/DELETE FROM sessions/i);
    expect(combined).toMatch(/id\s*=\s*ANY/i);
    // 바인딩 인자(2번째부터): ids 배열
    const boundIds = mockExecuteRaw.mock.calls[0][1];
    expect(boundIds).toEqual(["a", "b"]);
  });

  it("Prisma 에러 전파 (scheduler 가 상위에서 catch)", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("DB 연결 끊김"));
    await expect(cleanupExpiredSessions()).rejects.toThrow("DB 연결 끊김");
  });

  it("$executeRaw 반환값이 BigInt 여도 Number 로 안전 변환", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "x", userId: "u", expiresAt: "2026-04-18 00:00:00.000" },
    ]);
    mockExecuteRaw.mockResolvedValueOnce(BigInt(1));

    const result = await cleanupExpiredSessions();
    expect(result.deleted).toBe(1);
    expect(typeof result.deleted).toBe("number");
  });
});
