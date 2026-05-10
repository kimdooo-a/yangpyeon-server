/**
 * dispatchTenantRoute + matchRoute 단위 테스트.
 *
 * 검증 대상 (ADR-027 §3 + PLUGIN-MIG-3 manifest dispatch):
 *   - matchRoute: 정적 + `:param` + 길이 mismatch
 *   - manifest 정의된 route → handler 호출 + params 전달
 *   - manifest method 미지원 → 405 METHOD_NOT_ALLOWED
 *   - manifest disabled → manifest 무시 → 404 ROUTE_NOT_FOUND
 *   - manifest 미등록 tenant → 404 ROUTE_NOT_FOUND
 *   - HANDLER_TABLE 도 manifest 도 없는 resource → 404 ROUTE_NOT_FOUND
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearTenantRegistry,
  defineTenant,
  registerTenant,
  type TenantRouteHandler,
} from "@yangpyeon/core";
import { dispatchTenantRoute, matchRoute } from "./dispatch";
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

afterEach(() => {
  clearTenantRegistry();
});

describe("matchRoute", () => {
  it("정적 segment 단일 매칭", () => {
    expect(matchRoute("contents", "contents")).toEqual({});
  });

  it("정적 segment 다중 매칭", () => {
    expect(matchRoute("today-top", "today-top")).toEqual({});
  });

  it(":param 추출", () => {
    expect(matchRoute("items/:slug", "items/foo-bar")).toEqual({
      slug: "foo-bar",
    });
  });

  it(":param URL 디코딩", () => {
    expect(matchRoute("items/:slug", "items/%ED%95%9C%EA%B8%80")).toEqual({
      slug: "한글",
    });
  });

  it("segment 수 불일치 → null", () => {
    expect(matchRoute("items/:slug", "items")).toBeNull();
    expect(matchRoute("items/:slug", "items/foo/extra")).toBeNull();
  });

  it("정적 segment 불일치 → null", () => {
    expect(matchRoute("contents", "other")).toBeNull();
  });

  it("빈 path/pattern → 빈 매칭", () => {
    expect(matchRoute("", "")).toEqual({});
  });
});

describe("dispatchTenantRoute (manifest 우선)", () => {
  it("manifest static route 매칭 → handler 호출 + params 전달", async () => {
    const calls: Array<{ subPath: string; params: Record<string, string> }> =
      [];
    const handler: TenantRouteHandler = async (ctx) => {
      calls.push({ subPath: ctx.subPath, params: ctx.params });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    registerTenant(
      defineTenant({
        id: "tenant-id",
        version: "0.0.0",
        displayName: "Test",
        enabled: true,
        routes: [{ path: "contents", methods: { GET: handler } }],
      }),
    );

    const response = await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "contents",
      request: new Request("http://localhost/x"),
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ subPath: "contents", params: {} }]);
  });

  it("manifest :param route 매칭 → params 추출", async () => {
    let captured: Record<string, string> = {};
    const handler: TenantRouteHandler = async (ctx) => {
      captured = ctx.params;
      return new Response("ok", { status: 200 });
    };

    registerTenant(
      defineTenant({
        id: "tenant-id",
        version: "0.0.0",
        displayName: "Test",
        enabled: true,
        routes: [{ path: "items/:slug", methods: { GET: handler } }],
      }),
    );

    const response = await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "items/hello-world",
      request: new Request("http://localhost/x"),
    });

    expect(response.status).toBe(200);
    expect(captured).toEqual({ slug: "hello-world" });
  });

  it("manifest 정의된 path + 미지원 method → 405", async () => {
    const handler: TenantRouteHandler = async () =>
      new Response("ok", { status: 200 });

    registerTenant(
      defineTenant({
        id: "tenant-id",
        version: "0.0.0",
        displayName: "Test",
        enabled: true,
        routes: [{ path: "contents", methods: { GET: handler } }],
      }),
    );

    const response = await dispatchTenantRoute({
      method: "POST",
      tenant,
      user,
      subPath: "contents",
      request: new Request("http://localhost/x"),
    });

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("manifest enabled=false → manifest 무시 → 404", async () => {
    const handler: TenantRouteHandler = async () =>
      new Response("never", { status: 200 });

    registerTenant(
      defineTenant({
        id: "tenant-id",
        version: "0.0.0",
        displayName: "Test",
        enabled: false,
        routes: [{ path: "contents", methods: { GET: handler } }],
      }),
    );

    const response = await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "contents",
      request: new Request("http://localhost/x"),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("manifest 미등록 tenant → 404 ROUTE_NOT_FOUND", async () => {
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

  it("manifest 등록되어도 path 미매칭 → 404", async () => {
    const handler: TenantRouteHandler = async () =>
      new Response("never", { status: 200 });

    registerTenant(
      defineTenant({
        id: "tenant-id",
        version: "0.0.0",
        displayName: "Test",
        enabled: true,
        routes: [{ path: "contents", methods: { GET: handler } }],
      }),
    );

    const response = await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "unknown-resource",
      request: new Request("http://localhost/x"),
    });

    expect(response.status).toBe(404);
  });

  it("빈 subPath → 404 ROUTE_NOT_FOUND", async () => {
    const response = await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "",
      request: new Request("http://localhost/x"),
    });
    expect(response.status).toBe(404);
  });

  it("handler 가 받은 ctx — request/tenant/user 전달 검증", async () => {
    let captured: { reqUrl: string; tenantId: string; userSub: string } | null =
      null;
    const handler: TenantRouteHandler = async (ctx) => {
      captured = {
        reqUrl: ctx.request.url,
        tenantId: ctx.tenant.id,
        userSub: ctx.user.sub,
      };
      return new Response("ok", { status: 200 });
    };

    registerTenant(
      defineTenant({
        id: "tenant-id",
        version: "0.0.0",
        displayName: "Test",
        enabled: true,
        routes: [{ path: "contents", methods: { GET: handler } }],
      }),
    );

    await dispatchTenantRoute({
      method: "GET",
      tenant,
      user,
      subPath: "contents",
      request: new Request("http://localhost/test-url"),
    });

    expect(captured).toEqual({
      reqUrl: "http://localhost/test-url",
      tenantId: "tenant-id",
      userSub: "u1",
    });
  });
});
