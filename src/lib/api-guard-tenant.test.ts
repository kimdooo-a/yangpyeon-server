/**
 * api-guard-tenant 단위 테스트.
 *
 * 검증 대상 (ADR-027 §4 + 시나리오 매트릭스 §8):
 *   1. tenant 파라미터 누락 → 400 TENANT_MISSING
 *   2. 잘못된 slug 형식 → 400 TENANT_INVALID_SLUG
 *   3. 미등록 tenant → 404 TENANT_NOT_FOUND + audit `tenant_not_found`
 *   4. 비활성 tenant → 410 TENANT_DISABLED
 *   5. 멤버십 없는 cookie 경로 → 403 + audit `tenant_membership_missing`
 *   6. 정상 멤버십 → 핸들러 실행 + TenantContext 내부 동일 tenantId
 *   7. legacy 토큰 → 403 + audit `tenant_membership_missing`
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks (반드시 import 전에 vi.mock) ───
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: vi.fn(),
}));

vi.mock("@/lib/audit/safe", () => ({
  auditLogSafe: vi.fn(async () => undefined),
}));

vi.mock("@/lib/tenant-router/membership", () => ({
  findTenantMembership: vi.fn(async () => null),
}));

import { withTenant } from "./api-guard-tenant";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { auditLogSafe } from "@/lib/audit/safe";
import { findTenantMembership } from "@/lib/tenant-router/membership";
import { getCurrentTenant } from "../../packages/core/src/tenant/context";

// ─── helpers ───
type MockedPrisma = {
  tenant: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

function buildRequest(opts?: { authHeader?: string }) {
  const headers: Record<string, string> = {};
  if (opts?.authHeader) {
    headers["authorization"] = opts.authHeader;
  }
  return new NextRequest("http://localhost/api/v1/t/almanac/contents", {
    headers,
  });
}

function buildContext(params: { tenant?: string; path?: string[] } = {}) {
  return {
    params: Promise.resolve(params as Record<string, string>),
  };
}

const ACTIVE_TENANT_ROW = {
  id: "tenant-uuid-almanac",
  slug: "almanac",
  displayName: "Almanac",
  status: "active",
};

const SUSPENDED_TENANT_ROW = {
  ...ACTIVE_TENANT_ROW,
  status: "suspended",
};

const COOKIE_USER = {
  sub: "user-uuid-1",
  email: "kim@example.com",
  role: "USER" as const,
};

// ─── tests ───

describe("withTenant() 가드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: 쿠키 세션은 활성 사용자
    vi.mocked(getSessionFromCookies).mockResolvedValue(COOKIE_USER as never);
    // withAuth 의 cookie 경로는 prisma.user.findUnique 로 활성 검증
    (prisma as unknown as MockedPrisma).user.findUnique.mockResolvedValue({
      id: COOKIE_USER.sub,
      email: COOKIE_USER.email,
      role: COOKIE_USER.role,
      isActive: true,
    });
  });

  it("tenant 파라미터 누락 → 400 TENANT_MISSING", async () => {
    const handler = vi.fn();
    const wrapped = withTenant(async (...args) => handler(...args));

    const request = buildRequest();
    const context = buildContext({});

    const response = await wrapped(request, context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("TENANT_MISSING");
    expect(handler).not.toHaveBeenCalled();
  });

  it("잘못된 slug 형식(대문자/특수문자) → 400 TENANT_INVALID_SLUG", async () => {
    const handler = vi.fn();
    const wrapped = withTenant(async (...args) => handler(...args));

    // 대문자: "Almanac" → toLowerCase 거쳐 "almanac" 이 되므로 통과되어 버림.
    // slug 검증은 실제 invalid 패턴(공백/특수문자/시작-)으로 트리거.
    const request = new NextRequest("http://localhost/api/v1/t/-bad/x");
    const context = buildContext({ tenant: "-bad" });

    const response = await wrapped(request, context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("TENANT_INVALID_SLUG");
    expect(handler).not.toHaveBeenCalled();
  });

  it("미등록 tenant → 404 TENANT_NOT_FOUND + audit `tenant_not_found`", async () => {
    (prisma as unknown as MockedPrisma).tenant.findUnique.mockResolvedValue(
      null,
    );
    const handler = vi.fn();
    const wrapped = withTenant(async (...args) => handler(...args));

    const request = buildRequest();
    const context = buildContext({ tenant: "ghost", path: ["x"] });

    const response = await wrapped(request, context);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("TENANT_NOT_FOUND");
    expect(handler).not.toHaveBeenCalled();
    expect(auditLogSafe).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tenant_not_found" }),
    );
  });

  it("비활성 tenant → 410 TENANT_DISABLED", async () => {
    (prisma as unknown as MockedPrisma).tenant.findUnique.mockResolvedValue(
      SUSPENDED_TENANT_ROW,
    );
    const handler = vi.fn();
    const wrapped = withTenant(async (...args) => handler(...args));

    const request = buildRequest();
    const context = buildContext({ tenant: "almanac", path: ["x"] });

    const response = await wrapped(request, context);
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error.code).toBe("TENANT_DISABLED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("멤버십 없는 cookie 경로 → 403 + audit `tenant_membership_missing`", async () => {
    (prisma as unknown as MockedPrisma).tenant.findUnique.mockResolvedValue(
      ACTIVE_TENANT_ROW,
    );
    vi.mocked(findTenantMembership).mockResolvedValue(null);

    const handler = vi.fn();
    const wrapped = withTenant(async (...args) => handler(...args));

    const request = buildRequest();
    const context = buildContext({ tenant: "almanac", path: ["x"] });

    const response = await wrapped(request, context);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
    expect(auditLogSafe).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tenant_membership_missing" }),
    );
  });

  it("legacy 토큰은 멤버십 우회 없이 즉시 403 + audit", async () => {
    (prisma as unknown as MockedPrisma).tenant.findUnique.mockResolvedValue(
      ACTIVE_TENANT_ROW,
    );
    vi.mocked(getSessionFromCookies).mockResolvedValue({
      sub: "legacy",
      email: "ops@example.com",
      role: "ADMIN",
    } as never);

    const handler = vi.fn();
    const wrapped = withTenant(async (...args) => handler(...args));

    const request = buildRequest();
    const context = buildContext({ tenant: "almanac", path: ["x"] });

    const response = await wrapped(request, context);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
    expect(auditLogSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "tenant_membership_missing",
        details: expect.objectContaining({
          reason: "legacy-token-no-membership",
        }),
      }),
    );
    // findTenantMembership 은 호출되지 않아야 함 — legacy 분기 우선.
    expect(findTenantMembership).not.toHaveBeenCalled();
  });

  it("정상 멤버십(ADMIN) → 핸들러 실행 + TenantContext 내부 tenantId 일치", async () => {
    (prisma as unknown as MockedPrisma).tenant.findUnique.mockResolvedValue(
      ACTIVE_TENANT_ROW,
    );
    vi.mocked(findTenantMembership).mockResolvedValue({ role: "ADMIN" });

    const observed: Array<{ tenantId: string; tenantArg: unknown }> = [];

    const wrapped = withTenant(async (_request, _user, tenant) => {
      // AsyncLocalStorage 컨텍스트 검증 + tenant 파라미터 캡처.
      const ctx = getCurrentTenant();
      observed.push({ tenantId: ctx.tenantId, tenantArg: tenant });
      return new Response(JSON.stringify({ ok: true, ctx }), { status: 200 });
    });

    const request = buildRequest();
    const context = buildContext({ tenant: "almanac", path: ["contents"] });

    const response = await wrapped(request, context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; ctx: { tenantId: string } };
    expect(body.ok).toBe(true);
    expect(body.ctx.tenantId).toBe(ACTIVE_TENANT_ROW.id);

    expect(observed).toHaveLength(1);
    expect(observed[0].tenantId).toBe(ACTIVE_TENANT_ROW.id);
    expect(observed[0].tenantArg).toMatchObject({
      id: ACTIVE_TENANT_ROW.id,
      slug: "almanac",
      active: true,
    });
  });
});
