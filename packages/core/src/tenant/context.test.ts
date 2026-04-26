/**
 * TenantContext 단위 테스트.
 *
 * 검증 대상 (ADR-023 §5.1 요구):
 *   1. 컨텍스트 외부 호출은 throw (fail-loud)
 *   2. getCurrentTenantOrNull 은 컨텍스트 외부에서 null
 *   3. runWithTenant 내부에서 동일 ctx 가 동기/비동기 양쪽에서 보임
 *   4. 중첩 runWithTenant 는 내부 ctx 로 덮임 → 종료 시 외부 ctx 복원
 *   5. 병렬 runWithTenant 두 호출이 서로의 ctx 를 침범하지 않음 (격리)
 *   6. bypassRls 플래그 보존
 */
import { describe, it, expect } from "vitest";
import {
  getCurrentTenant,
  getCurrentTenantOrNull,
  runWithTenant,
  type TenantContext,
} from "./context";

describe("TenantContext (AsyncLocalStorage)", () => {
  it("getCurrentTenant() 는 컨텍스트 외부에서 throw 한다 (fail-loud)", () => {
    expect(() => getCurrentTenant()).toThrow(/Tenant context missing/);
  });

  it("getCurrentTenantOrNull() 은 컨텍스트 외부에서 null", () => {
    expect(getCurrentTenantOrNull()).toBeNull();
  });

  it("runWithTenant 내부에서 동일 ctx 를 동기 조회 가능", async () => {
    const ctx: TenantContext = { tenantId: "almanac" };
    await runWithTenant(ctx, async () => {
      expect(getCurrentTenant()).toEqual(ctx);
    });
  });

  it("await 경계를 넘어 컨텍스트가 전파된다", async () => {
    const ctx: TenantContext = { tenantId: "alpha" };
    await runWithTenant(ctx, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getCurrentTenant().tenantId).toBe("alpha");
      await Promise.resolve();
      expect(getCurrentTenant().tenantId).toBe("alpha");
    });
  });

  it("중첩 runWithTenant 는 내부 ctx 로 덮이고 종료 시 외부 ctx 복원", async () => {
    const outer: TenantContext = { tenantId: "outer" };
    const inner: TenantContext = { tenantId: "inner" };

    await runWithTenant(outer, async () => {
      expect(getCurrentTenant().tenantId).toBe("outer");

      await runWithTenant(inner, async () => {
        expect(getCurrentTenant().tenantId).toBe("inner");
      });

      expect(getCurrentTenant().tenantId).toBe("outer");
    });
  });

  it("병렬 runWithTenant 호출은 서로 격리된다", async () => {
    const a: TenantContext = { tenantId: "tenant-a" };
    const b: TenantContext = { tenantId: "tenant-b" };

    const taskA = runWithTenant(a, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return getCurrentTenant().tenantId;
    });
    const taskB = runWithTenant(b, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getCurrentTenant().tenantId;
    });

    const [resultA, resultB] = await Promise.all([taskA, taskB]);
    expect(resultA).toBe("tenant-a");
    expect(resultB).toBe("tenant-b");
  });

  it("bypassRls 플래그가 보존된다", async () => {
    const ctx: TenantContext = { tenantId: "ops", bypassRls: true };
    await runWithTenant(ctx, async () => {
      expect(getCurrentTenant().bypassRls).toBe(true);
    });
  });

  it("컨텍스트 종료 후 다시 외부에서 throw", async () => {
    await runWithTenant({ tenantId: "x" }, async () => {
      expect(getCurrentTenant().tenantId).toBe("x");
    });
    expect(() => getCurrentTenant()).toThrow();
    expect(getCurrentTenantOrNull()).toBeNull();
  });
});
