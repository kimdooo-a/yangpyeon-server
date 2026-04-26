/**
 * dispatchTenantRoute 단위 테스트.
 *
 * 검증 대상 (ADR-027 §3):
 *   - HANDLER_TABLE 미정의 resource → 404 ROUTE_NOT_FOUND
 *   - (Phase 2+ 에서 method 미지원 시 405 도 추가될 예정)
 */
import { describe, it, expect } from "vitest";
import { dispatchTenantRoute } from "./dispatch";
import type { ResolvedTenant } from "./types";
import type { AccessTokenPayload } from "@/lib/jwt-v1";

const tenant: ResolvedTenant = {
  id: "tenant-id",
  slug: "almanac",
  displayName: "Almanac",
  active: true,
  status: "active",
};

const user: AccessTokenPayload = {
  sub: "u1",
  email: "x@y.com",
  role: "USER",
  type: "access",
};

describe("dispatchTenantRoute (Phase 0~1 임시 디스패처)", () => {
  it("HANDLER_TABLE 미정의 resource → 404 ROUTE_NOT_FOUND", async () => {
    const response = await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "contents/123",
      request: new Request("http://localhost/x"),
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("빈 subPath 도 404 ROUTE_NOT_FOUND", async () => {
    const response = await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "",
      request: new Request("http://localhost/x"),
    });
    expect(response.status).toBe(404);
  });
});
