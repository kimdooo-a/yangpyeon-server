/**
 * with-request-context.test.ts — P1 resolveTenantId path 기반 구현 단위 테스트.
 *
 * 검증 범위:
 *   - URL path slug 추출 + DB 조회 → tenantId 반환 (케이스 1~6)
 *   - traceId 추출 (X-Request-Id 헤더 / crypto.randomUUID() 발급) (케이스 7~8)
 *
 * 테스트 전략:
 *   - resolveTenantFromSlug 를 vi.mock 으로 가로채어 DB 없이 검증.
 *   - withRequestContext 래퍼를 통해 RequestContext 에 주입된 tenantId 를 간접 검증.
 *   - getRequestContext() 로 ALS 스토어 내부 값 확인.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequestContext, type RequestContext } from "./request-context";

// ────────────────────────────────────────────────────────────────────────
// resolveTenantFromSlug mock — hoisted (vi.mock 은 import 보다 먼저 실행됨)
// ────────────────────────────────────────────────────────────────────────
const { mockResolveTenantFromSlug } = vi.hoisted(() => ({
  mockResolveTenantFromSlug: vi.fn(),
}));

vi.mock("./tenant-router/manifest", () => ({
  resolveTenantFromSlug: mockResolveTenantFromSlug,
}));

import { withRequestContext } from "./with-request-context";

// ────────────────────────────────────────────────────────────────────────
// 공통 fixture
// ────────────────────────────────────────────────────────────────────────
const ALMANAC_TENANT = {
  id: "tenant-uuid-almanac",
  slug: "almanac",
  displayName: "Almanac",
  status: "active",
  active: true,
};

const SUSPENDED_TENANT = {
  id: "tenant-uuid-suspended",
  slug: "suspended",
  displayName: "Suspended App",
  status: "suspended",
  active: false,
};

/**
 * 테스트용 Request 팩토리.
 * withRequestContext 내부에서 `new URL(req.url)` 을 사용하므로 완전한 URL 이 필요.
 */
function makeRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

/**
 * withRequestContext 로 래핑된 핸들러를 실행하고
 * 핸들러 내부에서 getRequestContext() 를 통해 주입된 context 를 캡처한다.
 */
async function captureContext(req: Request): Promise<RequestContext | undefined> {
  let capturedContext: RequestContext | undefined;
  const handler = withRequestContext(async (_req: Request) => {
    capturedContext = getRequestContext();
    return Response.json({ ok: true });
  });
  await handler(req);
  return capturedContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 1: 정상 tenant path (sub-path 포함)
// ────────────────────────────────────────────────────────────────────────
describe("resolveTenantId — 케이스 1: 정상 path + active tenant (sub-path 포함)", () => {
  it("/api/v1/t/almanac/contents → tenant.id 반환", async () => {
    mockResolveTenantFromSlug.mockResolvedValueOnce(ALMANAC_TENANT);

    const ctx = await captureContext(makeRequest("/api/v1/t/almanac/contents"));

    expect(ctx?.tenantId).toBe("tenant-uuid-almanac");
    expect(mockResolveTenantFromSlug).toHaveBeenCalledWith("almanac");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 2: 정상 tenant path (sub-path 없음)
// ────────────────────────────────────────────────────────────────────────
describe("resolveTenantId — 케이스 2: 정상 path + active tenant (sub-path 없음)", () => {
  it("/api/v1/t/almanac → tenant.id 반환 (trailing slash 없음도 허용)", async () => {
    mockResolveTenantFromSlug.mockResolvedValueOnce(ALMANAC_TENANT);

    const ctx = await captureContext(makeRequest("/api/v1/t/almanac"));

    expect(ctx?.tenantId).toBe("tenant-uuid-almanac");
    expect(mockResolveTenantFromSlug).toHaveBeenCalledWith("almanac");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 3: 글로벌 라우트 (tenant prefix 없음)
// ────────────────────────────────────────────────────────────────────────
describe("resolveTenantId — 케이스 3: 글로벌 라우트", () => {
  it("/api/settings/users → undefined (DB 조회 없음)", async () => {
    const ctx = await captureContext(makeRequest("/api/settings/users"));

    expect(ctx?.tenantId).toBeUndefined();
    // 글로벌 라우트 — slug 추출 단계에서 종료, DB 조회 불필요
    expect(mockResolveTenantFromSlug).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 4: slug 너무 짧음 (정규식 불일치)
// ────────────────────────────────────────────────────────────────────────
describe("resolveTenantId — 케이스 4: slug 길이 위반", () => {
  it("/api/v1/t/x/foo → undefined (slug 한 글자 → ADR-026 최소 2글자 위반)", async () => {
    const ctx = await captureContext(makeRequest("/api/v1/t/x/foo"));

    // 정규식 `[a-z0-9][a-z0-9-]{1,30}` 은 총 2~31자 필요 → 'x' 는 불일치
    expect(ctx?.tenantId).toBeUndefined();
    expect(mockResolveTenantFromSlug).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 5: DB miss (존재하지 않는 slug)
// ────────────────────────────────────────────────────────────────────────
describe("resolveTenantId — 케이스 5: DB miss", () => {
  it("/api/v1/t/notfound/foo → undefined (resolveTenantFromSlug null 반환)", async () => {
    mockResolveTenantFromSlug.mockResolvedValueOnce(null);

    const ctx = await captureContext(makeRequest("/api/v1/t/notfound/foo"));

    expect(ctx?.tenantId).toBeUndefined();
    expect(mockResolveTenantFromSlug).toHaveBeenCalledWith("notfound");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 6: suspended tenant → tenant.id 반환 (P1 확정 결정)
// ────────────────────────────────────────────────────────────────────────
describe("resolveTenantId — 케이스 6: suspended tenant", () => {
  it("/api/v1/t/suspended/foo → tenant.id 반환 (active=false 이어도 ID 주입)", async () => {
    // **P1 결정**: active=false 이어도 tenant.id 를 반환한다.
    // 근거: resolveTenantId 는 관측성(observability) 맥락 확립 담당.
    // 인가(active 체크 + 410 응답)는 withTenant 가드 (T1.3) 책임.
    // suspended tenant 의 호출도 감사 로그에 실제 tenant UUID 로 기록되어야 한다.
    mockResolveTenantFromSlug.mockResolvedValueOnce(SUSPENDED_TENANT);

    const ctx = await captureContext(makeRequest("/api/v1/t/suspended/foo"));

    expect(ctx?.tenantId).toBe("tenant-uuid-suspended");
    expect(mockResolveTenantFromSlug).toHaveBeenCalledWith("suspended");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 6b: DB 장애 → fail-soft (undefined)
// ────────────────────────────────────────────────────────────────────────
describe("resolveTenantId — 케이스 6b: DB 장애 fail-soft", () => {
  it("resolveTenantFromSlug 가 throw → undefined 반환 (fail-soft, 요청 중단 없음)", async () => {
    mockResolveTenantFromSlug.mockRejectedValueOnce(new Error("DB connection refused"));

    // withRequestContext 가 throw 없이 정상 응답을 반환해야 한다
    const ctx = await captureContext(makeRequest("/api/v1/t/almanac/data"));

    expect(ctx?.tenantId).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 7: X-Request-Id 헤더 존재 시 traceId 그대로 사용
// ────────────────────────────────────────────────────────────────────────
describe("extractTraceId — 케이스 7: X-Request-Id 헤더 존재", () => {
  it("X-Request-Id 헤더 값이 traceId 로 그대로 주입된다", async () => {
    mockResolveTenantFromSlug.mockResolvedValueOnce(null);

    const ctx = await captureContext(
      makeRequest("/api/v1/t/almanac/data", {
        "x-request-id": "cf-trace-abc123",
      }),
    );

    expect(ctx?.traceId).toBe("cf-trace-abc123");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 케이스 8: X-Request-Id 헤더 부재 시 crypto.randomUUID() 발급
// ────────────────────────────────────────────────────────────────────────
describe("extractTraceId — 케이스 8: 헤더 부재 시 신규 UUID 발급", () => {
  it("헤더 없으면 traceId 가 UUID 형식 (crypto.randomUUID) 으로 신규 발급된다", async () => {
    // 글로벌 라우트 → DB 조회 없음
    const ctx = await captureContext(makeRequest("/api/settings/users"));

    expect(ctx?.traceId).toBeDefined();
    // UUID v4 형식 검증 (8-4-4-4-12)
    expect(ctx?.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
