/**
 * tenant dispatcher TDD — PLUGIN-MIG-5 (S98).
 *
 * 검증 범위:
 *   - registerTenant / getTenantManifest / unregisterTenant 라이프사이클
 *   - registerCoreHandler / getCoreHandler 라이프사이클
 *   - dispatchTenantHandler 우선순위:
 *     1. core handler 가 manifest handler 보다 먼저
 *     2. tenant 미등록 → ok=false + 메시지
 *     3. tenant disabled → ok=false + 메시지
 *     4. handler 미등록 → ok=false + 메시지
 *   - clearTenantRegistry — 테스트 격리용
 *   - listTenantManifests — 운영 콘솔 디버깅용
 *
 * 본 테스트는 globalThis 싱글턴 registry 사용 — beforeEach 마다 clear 필수.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerTenant,
  unregisterTenant,
  getTenantManifest,
  listTenantManifests,
  registerCoreHandler,
  unregisterCoreHandler,
  getCoreHandler,
  clearTenantRegistry,
  dispatchTenantHandler,
  defineTenant,
  type TenantContext,
  type TenantCronHandler,
} from "./index";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const ctx: TenantContext = { tenantId: TENANT_ID };

beforeEach(() => {
  clearTenantRegistry();
});

describe("tenant dispatcher — registerTenant / getTenantManifest", () => {
  it("registerTenant 후 getTenantManifest 로 조회 가능", () => {
    const m = defineTenant({
      id: TENANT_ID,
      version: "1.0",
      displayName: "Test",
      enabled: true,
    });
    registerTenant(m);
    expect(getTenantManifest(TENANT_ID)).toBe(m);
  });

  it("unregisterTenant 후 조회 시 undefined", () => {
    registerTenant(
      defineTenant({ id: TENANT_ID, version: "1.0", displayName: "T", enabled: true }),
    );
    unregisterTenant(TENANT_ID);
    expect(getTenantManifest(TENANT_ID)).toBeUndefined();
  });

  it("listTenantManifests — 등록된 전체 manifest 배열 반환", () => {
    registerTenant(
      defineTenant({ id: "a", version: "1", displayName: "A", enabled: true }),
    );
    registerTenant(
      defineTenant({ id: "b", version: "1", displayName: "B", enabled: false }),
    );
    const list = listTenantManifests();
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("동일 id 재등록 시 덮어쓰기 (개발 핫리로드 안전)", () => {
    const v1 = defineTenant({
      id: TENANT_ID,
      version: "1.0",
      displayName: "V1",
      enabled: true,
    });
    const v2 = defineTenant({
      id: TENANT_ID,
      version: "2.0",
      displayName: "V2",
      enabled: true,
    });
    registerTenant(v1);
    registerTenant(v2);
    expect(getTenantManifest(TENANT_ID)?.version).toBe("2.0");
  });
});

describe("tenant dispatcher — registerCoreHandler / getCoreHandler", () => {
  it("registerCoreHandler 후 getCoreHandler 로 조회 가능", () => {
    const handler: TenantCronHandler = vi.fn();
    registerCoreHandler("test-handler", handler);
    expect(getCoreHandler("test-handler")).toBe(handler);
  });

  it("unregisterCoreHandler 후 조회 시 undefined", () => {
    const handler: TenantCronHandler = vi.fn();
    registerCoreHandler("test-handler", handler);
    unregisterCoreHandler("test-handler");
    expect(getCoreHandler("test-handler")).toBeUndefined();
  });
});

describe("dispatchTenantHandler — 우선순위", () => {
  it("core handler 가 tenant manifest handler 보다 먼저", async () => {
    const tenantHandler = vi.fn().mockResolvedValue({ ok: true, processedCount: 1 });
    const coreHandler = vi.fn().mockResolvedValue({ ok: true, processedCount: 99 });

    registerTenant(
      defineTenant({
        id: TENANT_ID,
        version: "1",
        displayName: "T",
        enabled: true,
        cronHandlers: { foo: tenantHandler },
      }),
    );
    registerCoreHandler("foo", coreHandler);

    const result = await dispatchTenantHandler("foo", {}, ctx);

    expect(coreHandler).toHaveBeenCalledTimes(1);
    expect(tenantHandler).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(99);
  });

  it("tenant 미등록 → ok=false + '매니페스트 미등록' 메시지", async () => {
    const result = await dispatchTenantHandler("any-module", {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("매니페스트 미등록");
    expect(result.errorMessage).toContain(TENANT_ID);
    expect(result.errorMessage).toContain("any-module");
  });

  it("tenant disabled → ok=false + 'disabled' 메시지", async () => {
    registerTenant(
      defineTenant({
        id: TENANT_ID,
        version: "1",
        displayName: "T",
        enabled: false,
        cronHandlers: { foo: vi.fn() },
      }),
    );
    const result = await dispatchTenantHandler("foo", {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("disabled");
  });

  it("handler 미등록 → ok=false + '핸들러 미등록' 메시지", async () => {
    registerTenant(
      defineTenant({
        id: TENANT_ID,
        version: "1",
        displayName: "T",
        enabled: true,
        cronHandlers: {},
      }),
    );
    const result = await dispatchTenantHandler("missing", {}, ctx);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain("missing");
    expect(result.errorMessage).toContain("핸들러 미등록");
  });

  it("정상 매니페스트 dispatch — handler 결과 그대로 반환", async () => {
    const handler = vi
      .fn()
      .mockResolvedValue({ ok: true, processedCount: 7 });
    registerTenant(
      defineTenant({
        id: TENANT_ID,
        version: "1",
        displayName: "T",
        enabled: true,
        cronHandlers: { foo: handler },
      }),
    );

    const payload = { module: "foo", extra: "data" };
    const result = await dispatchTenantHandler("foo", payload, ctx);

    expect(handler).toHaveBeenCalledWith(payload, ctx);
    expect(result.ok).toBe(true);
    expect(result.processedCount).toBe(7);
  });
});
