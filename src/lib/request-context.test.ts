// Phase 1.7 (T1.7) ADR-029 §2.3.1 — request-context 단위 테스트.

import { describe, expect, it } from "vitest";
import {
  getRequestContext,
  runWithContext,
  type RequestContext,
} from "./request-context";

describe("request-context — AsyncLocalStorage RequestContext", () => {
  it("컨텍스트 외부 호출 시 undefined 반환 (fail-soft)", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("runWithContext 안에서 traceId/tenantId/userId 모두 읽힘", () => {
    const ctx: RequestContext = {
      traceId: "trace-123",
      tenantId: "almanac",
      userId: "user-7",
      startedAt: 1_000_000,
    };
    const result = runWithContext(ctx, () => {
      const cur = getRequestContext();
      return {
        traceId: cur?.traceId,
        tenantId: cur?.tenantId,
        userId: cur?.userId,
        startedAt: cur?.startedAt,
      };
    });
    expect(result).toEqual({
      traceId: "trace-123",
      tenantId: "almanac",
      userId: "user-7",
      startedAt: 1_000_000,
    });
  });

  it("중첩 컨텍스트 — inner 가 outer 를 덮고 종료 후 복원", () => {
    const outer: RequestContext = {
      traceId: "outer",
      tenantId: "default",
      startedAt: 1,
    };
    const inner: RequestContext = {
      traceId: "inner",
      tenantId: "almanac",
      startedAt: 2,
    };

    const result = runWithContext(outer, () => {
      const before = getRequestContext()?.traceId;
      const innerResult = runWithContext(inner, () => {
        return getRequestContext()?.traceId;
      });
      const after = getRequestContext()?.traceId;
      return { before, innerResult, after };
    });

    expect(result).toEqual({
      before: "outer",
      innerResult: "inner",
      after: "outer",
    });
  });

  it("await 경계 가로질러 컨텍스트 전파", async () => {
    const ctx: RequestContext = {
      traceId: "async-trace",
      tenantId: "almanac",
      startedAt: 0,
    };
    const result = await runWithContext(ctx, async () => {
      await new Promise((r) => setTimeout(r, 5));
      const after1 = getRequestContext()?.traceId;
      await Promise.resolve();
      const after2 = getRequestContext()?.traceId;
      return { after1, after2 };
    });
    expect(result).toEqual({ after1: "async-trace", after2: "async-trace" });
  });

  it("병렬 컨텍스트 — 두 갈래가 서로 침범하지 않음", async () => {
    const ctxA: RequestContext = {
      traceId: "A",
      tenantId: "tenant-A",
      startedAt: 0,
    };
    const ctxB: RequestContext = {
      traceId: "B",
      tenantId: "tenant-B",
      startedAt: 0,
    };

    const [a, b] = await Promise.all([
      runWithContext(ctxA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getRequestContext()?.traceId;
      }),
      runWithContext(ctxB, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestContext()?.traceId;
      }),
    ]);
    expect(a).toBe("A");
    expect(b).toBe("B");
  });

  it("optional 필드 — tenantId/userId 미지정 시 undefined", () => {
    const ctx: RequestContext = {
      traceId: "trace-only",
      startedAt: 0,
    };
    const result = runWithContext(ctx, () => {
      const cur = getRequestContext();
      return {
        traceId: cur?.traceId,
        tenantId: cur?.tenantId,
        userId: cur?.userId,
      };
    });
    expect(result).toEqual({
      traceId: "trace-only",
      tenantId: undefined,
      userId: undefined,
    });
  });

  it("runWithContext 종료 후 컨텍스트는 다시 외부 — undefined", () => {
    const ctx: RequestContext = {
      traceId: "ephemeral",
      startedAt: 0,
    };
    runWithContext(ctx, () => {
      expect(getRequestContext()).toBeDefined();
    });
    expect(getRequestContext()).toBeUndefined();
  });
});
