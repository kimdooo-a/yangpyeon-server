/**
 * tests/aggregator/runner.test.ts
 *
 * Track B / B6 commit — aggregator runner TDD (10 케이스 / 15 중).
 *
 * 분류:
 *   - module 디스패치 (5): rss-fetcher / html-scraper / api-poller / classifier / promoter
 *   - 알 수 없는 module (1)
 *   - processSingleSource (4): success / fetch error / 임계 도달 active=false / cross-source 격리
 *
 * Multi-tenant 적응 검증:
 *   - tenantPrismaFor(ctx) 사용 (contentSource.findMany/update + contentIngestedItem.*)
 *   - dedupeAgainstDb(items, ctx) 호출
 *   - promotePending(ctx, batch) 호출
 *
 * Spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §6 T7
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1) 모든 의존 모듈 모킹 — vi.hoisted 로 호이스팅 안전
// ─────────────────────────────────────────────────────────────────────────────
const {
  fetchSourceMock,
  dedupeMock,
  enrichMock,
  promoteMock,
  findManySourceMock,
  findManyIngestedMock,
  updateSourceMock,
  createManyIngestedMock,
  updateIngestedMock,
  tenantPrismaForMock,
} = vi.hoisted(() => {
  const fetchSourceMock = vi.fn();
  const dedupeMock = vi.fn();
  const enrichMock = vi.fn();
  const promoteMock = vi.fn();
  const findManySourceMock = vi.fn();
  const findManyIngestedMock = vi.fn();
  const updateSourceMock = vi.fn();
  const createManyIngestedMock = vi.fn();
  const updateIngestedMock = vi.fn();
  const tenantPrismaForMock = vi.fn(() => ({
    contentSource: { findMany: findManySourceMock, update: updateSourceMock },
    contentIngestedItem: {
      findMany: findManyIngestedMock,
      createMany: createManyIngestedMock,
      update: updateIngestedMock,
    },
  }));
  return {
    fetchSourceMock,
    dedupeMock,
    enrichMock,
    promoteMock,
    findManySourceMock,
    findManyIngestedMock,
    updateSourceMock,
    createManyIngestedMock,
    updateIngestedMock,
    tenantPrismaForMock,
  };
});

vi.mock("@/lib/aggregator/fetchers", () => ({ fetchSource: fetchSourceMock }));
vi.mock("@/lib/aggregator/dedupe", () => ({
  dedupeAgainstDb: dedupeMock,
  urlHash: vi.fn((u: string) => `hash-of-${u}`),
}));
vi.mock("@/lib/aggregator/classify", () => ({
  classifyItem: vi.fn(() => ({ track: "build", categorySlug: "ai-tools" })),
}));
vi.mock("@/lib/aggregator/llm", () => ({ enrichItem: enrichMock }));
vi.mock("@/lib/aggregator/promote", () => ({ promotePending: promoteMock }));
vi.mock("@/lib/aggregator/cleanup", () => ({ runCleanup: vi.fn(async () => ({ deleted: 0 })) }));
vi.mock("@/lib/db/prisma-tenant-client", () => ({
  tenantPrismaFor: tenantPrismaForMock,
  withTenantTx: vi.fn(),
}));

import { runAggregatorModule } from "@/lib/aggregator/runner";

const FAKE_CTX = { tenantId: "00000000-0000-0000-0000-000000000001" };

beforeEach(() => {
  fetchSourceMock.mockReset();
  dedupeMock.mockReset();
  enrichMock.mockReset();
  promoteMock.mockReset();
  findManySourceMock.mockReset();
  findManyIngestedMock.mockReset();
  updateSourceMock.mockReset();
  createManyIngestedMock.mockReset();
  updateIngestedMock.mockReset();
  tenantPrismaForMock.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Helper — ContentSource fixture
// ─────────────────────────────────────────────────────────────────────────────
function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: FAKE_CTX.tenantId,
    slug: "test",
    name: "Test",
    url: "https://example.com/feed",
    kind: "RSS",
    parserConfig: {},
    active: true,
    consecutiveFailures: 0,
    lastFetchedAt: null,
    lastSuccessAt: null,
    lastError: null,
    ...overrides,
  };
}

// =============================================================================
// runner.ts (10 케이스)
// =============================================================================

describe("runAggregatorModule — module 디스패처 (multi-tenant)", () => {
  it("1. module='rss-fetcher' → contentSource.findMany kind in ['RSS'] + active=true", async () => {
    findManySourceMock.mockResolvedValue([]);

    const result = await runAggregatorModule(FAKE_CTX, { module: "rss-fetcher" });

    expect(result.status).toBe("SUCCESS");
    expect(findManySourceMock).toHaveBeenCalledTimes(1);
    const arg = findManySourceMock.mock.calls[0]?.[0] as {
      where: { kind: { in: string[] }; active: boolean };
    };
    expect(arg.where.kind.in).toEqual(["RSS"]);
    expect(arg.where.active).toBe(true);
  });

  it("2. module='html-scraper' → kind in ['HTML']", async () => {
    findManySourceMock.mockResolvedValue([]);

    await runAggregatorModule(FAKE_CTX, { module: "html-scraper" });

    const arg = findManySourceMock.mock.calls[0]?.[0] as {
      where: { kind: { in: string[] } };
    };
    expect(arg.where.kind.in).toEqual(["HTML"]);
  });

  it("3. module='api-poller' → kind in ['API', 'FIRECRAWL']", async () => {
    findManySourceMock.mockResolvedValue([]);

    await runAggregatorModule(FAKE_CTX, { module: "api-poller" });

    const arg = findManySourceMock.mock.calls[0]?.[0] as {
      where: { kind: { in: string[] } };
    };
    expect(arg.where.kind.in.sort()).toEqual(["API", "FIRECRAWL"]);
  });

  it("4. module='classifier' → contentIngestedItem.findMany status='pending' + enrichItem 호출", async () => {
    const pending = [
      { id: 1, url: "https://x.com/a", title: "T1", summary: null, contentHtml: null, author: null, imageUrl: null, publishedAt: null },
    ];
    findManyIngestedMock.mockResolvedValue(pending);
    enrichMock.mockResolvedValue({
      url: "https://x.com/a",
      title: "T1",
      urlHash: "h",
      suggestedTrack: "build",
      suggestedCategorySlug: "ai-tools",
      aiSummary: "요약",
      aiTags: ["ai"],
      aiLanguage: "ko",
    });
    updateIngestedMock.mockResolvedValue({});

    const result = await runAggregatorModule(FAKE_CTX, {
      module: "classifier",
      batch: 50,
    });

    expect(result.status).toBe("SUCCESS");
    expect(enrichMock).toHaveBeenCalledTimes(1);
    expect(updateIngestedMock).toHaveBeenCalledTimes(1);
    const updateArg = updateIngestedMock.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(updateArg.data.status).toBe("ready");
  });

  it("5. module='promoter' → promotePending(ctx, batch) 호출", async () => {
    promoteMock.mockResolvedValue({ promoted: 5, errors: 0 });

    const result = await runAggregatorModule(FAKE_CTX, {
      module: "promoter",
      batch: 30,
    });

    expect(promoteMock).toHaveBeenCalledTimes(1);
    expect(promoteMock.mock.calls[0]?.[0]).toBe(FAKE_CTX);
    expect(promoteMock.mock.calls[0]?.[1]).toBe(30);
    expect(result.status).toBe("SUCCESS");
    expect(result.message).toMatch(/promoted=5/);
  });

  it("6. 알 수 없는 module → status FAILURE + message 에 module 이름", async () => {
    const result = await runAggregatorModule(FAKE_CTX, {
      module: "unknown-module" as never,
    });

    expect(result.status).toBe("FAILURE");
    expect(result.message).toMatch(/unknown-module/);
  });

  it("7. processSingleSource success — createMany + consecutiveFailures=0 reset + lastSuccessAt set", async () => {
    findManySourceMock.mockResolvedValue([makeSource({ id: 42 })]);
    fetchSourceMock.mockResolvedValue([
      { url: "https://x.com/a", title: "A" },
      { url: "https://x.com/b", title: "B" },
    ]);
    dedupeMock.mockResolvedValue({
      fresh: [
        { url: "https://x.com/a", title: "A" },
        { url: "https://x.com/b", title: "B" },
      ],
      duplicates: 0,
    });
    createManyIngestedMock.mockResolvedValue({ count: 2 });
    updateSourceMock.mockResolvedValue({});

    const result = await runAggregatorModule(FAKE_CTX, { module: "rss-fetcher" });

    expect(createManyIngestedMock).toHaveBeenCalledTimes(1);
    const createArg = createManyIngestedMock.mock.calls[0]?.[0] as {
      data: Array<{ status: string }>;
    };
    expect(createArg.data).toHaveLength(2);
    expect(createArg.data[0].status).toBe("pending");

    // Source update — consecutiveFailures reset + lastSuccessAt
    expect(updateSourceMock).toHaveBeenCalled();
    const updateArg = updateSourceMock.mock.calls[0]?.[0] as {
      where: { id: number };
      data: { consecutiveFailures: number; lastSuccessAt: Date };
    };
    expect(updateArg.where.id).toBe(42);
    expect(updateArg.data.consecutiveFailures).toBe(0);
    expect(updateArg.data.lastSuccessAt).toBeInstanceOf(Date);
    expect(result.message).toMatch(/inserted=2/);
  });

  it("8. processSingleSource fetch 실패 → consecutiveFailures 증가 + lastError 기록", async () => {
    findManySourceMock.mockResolvedValue([
      makeSource({ id: 7, consecutiveFailures: 2 }),
    ]);
    fetchSourceMock.mockRejectedValue(new Error("네트워크 타임아웃"));
    updateSourceMock.mockResolvedValue({});
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runAggregatorModule(FAKE_CTX, { module: "rss-fetcher" });

    expect(updateSourceMock).toHaveBeenCalled();
    const updateArg = updateSourceMock.mock.calls[0]?.[0] as {
      data: {
        consecutiveFailures: number;
        lastError: string;
        active?: boolean;
      };
    };
    expect(updateArg.data.consecutiveFailures).toBe(3);
    expect(updateArg.data.lastError).toMatch(/네트워크 타임아웃/);
    expect(updateArg.data.active).toBeUndefined();
    consoleSpy.mockRestore();
  });

  it("9. processSingleSource 임계 5 도달 → active=false 자동 비활성화", async () => {
    findManySourceMock.mockResolvedValue([
      makeSource({ id: 9, consecutiveFailures: 4 }),
    ]);
    fetchSourceMock.mockRejectedValue(new Error("일관 실패"));
    updateSourceMock.mockResolvedValue({});
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runAggregatorModule(FAKE_CTX, { module: "rss-fetcher" });

    const updateArg = updateSourceMock.mock.calls[0]?.[0] as {
      data: { consecutiveFailures: number; active: boolean };
    };
    expect(updateArg.data.consecutiveFailures).toBe(5);
    expect(updateArg.data.active).toBe(false);
    consoleSpy.mockRestore();
  });

  it("10. cross-source 격리 — 한 소스 fetch 실패가 다른 소스를 막지 않음", async () => {
    findManySourceMock.mockResolvedValue([
      makeSource({ id: 1, slug: "fail-source" }),
      makeSource({ id: 2, slug: "ok-source" }),
    ]);
    fetchSourceMock.mockImplementation(async (s: { id: number }) => {
      if (s.id === 1) throw new Error("첫 소스 실패");
      return [{ url: "https://ok.com/a", title: "OK" }];
    });
    dedupeMock.mockResolvedValue({
      fresh: [{ url: "https://ok.com/a", title: "OK" }],
      duplicates: 0,
    });
    createManyIngestedMock.mockResolvedValue({ count: 1 });
    updateSourceMock.mockResolvedValue({});
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runAggregatorModule(FAKE_CTX, { module: "rss-fetcher" });

    // 두 소스 모두 fetchSource 호출
    expect(fetchSourceMock).toHaveBeenCalledTimes(2);
    // 성공 소스: createMany 1번
    expect(createManyIngestedMock).toHaveBeenCalledTimes(1);
    // 실패 소스: updateSource 호출 (failure path)
    // 성공 소스: updateSource 호출 (success path)
    expect(updateSourceMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("SUCCESS");
    consoleSpy.mockRestore();
  });

  // ===========================================================================
  // S87 추가 5 케이스 (Track B TDD 10→15, R-W1 갭 보강)
  // ===========================================================================

  it("11. module='cleanup' → runCleanup 호출 + deleted=N 메시지", async () => {
    const result = await runAggregatorModule(FAKE_CTX, { module: "cleanup" });

    expect(result.status).toBe("SUCCESS");
    expect(result.message).toMatch(/deleted=0/);
  });

  it("12. buildPendingRow boundary slice — title 500 / summary 5000 / contentHtml 50000 / author 200 / imageUrl 1000", async () => {
    findManySourceMock.mockResolvedValue([makeSource({ id: 99 })]);
    fetchSourceMock.mockResolvedValue([
      {
        url: "https://x.com/long",
        title: "a".repeat(700), // > 500
        summary: "b".repeat(7000), // > 5000
        contentHtml: "c".repeat(60_000), // > 50000
        author: "d".repeat(300), // > 200
        imageUrl: "https://x.com/img/" + "e".repeat(2000), // > 1000
      },
    ]);
    dedupeMock.mockResolvedValue({
      fresh: [
        {
          url: "https://x.com/long",
          title: "a".repeat(700),
          summary: "b".repeat(7000),
          contentHtml: "c".repeat(60_000),
          author: "d".repeat(300),
          imageUrl: "https://x.com/img/" + "e".repeat(2000),
        },
      ],
      duplicates: 0,
    });
    createManyIngestedMock.mockResolvedValue({ count: 1 });
    updateSourceMock.mockResolvedValue({});

    await runAggregatorModule(FAKE_CTX, { module: "rss-fetcher" });

    const createArg = createManyIngestedMock.mock.calls[0]?.[0] as {
      data: Array<{
        title: string;
        summary: string | null;
        contentHtml: string | null;
        author: string | null;
        imageUrl: string | null;
      }>;
    };
    const row = createArg.data[0];
    expect(row.title.length).toBe(500);
    expect(row.summary?.length).toBe(5000);
    expect(row.contentHtml?.length).toBe(50_000);
    expect(row.author?.length).toBe(200);
    expect(row.imageUrl?.length).toBe(1000);
  });

  it("13. classifier — enrichItem throw → errors++ + 다음 row 진행 (격리)", async () => {
    findManyIngestedMock.mockResolvedValue([
      { id: 1, url: "https://x/a", title: "T1", summary: null, contentHtml: null, author: null, imageUrl: null, publishedAt: null },
      { id: 2, url: "https://x/b", title: "T2", summary: null, contentHtml: null, author: null, imageUrl: null, publishedAt: null },
      { id: 3, url: "https://x/c", title: "T3", summary: null, contentHtml: null, author: null, imageUrl: null, publishedAt: null },
    ]);
    let n = 0;
    enrichMock.mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error("LLM 일시 장애");
      return {
        url: "https://x/x",
        title: "T",
        urlHash: "h",
        suggestedTrack: "build",
        suggestedCategorySlug: null,
        aiSummary: null,
        aiTags: [],
        aiLanguage: null,
      };
    });
    updateIngestedMock.mockResolvedValue({});
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runAggregatorModule(FAKE_CTX, {
      module: "classifier",
      batch: 50,
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.message).toMatch(/pending=3 classified=2 errors=1/);
    expect(updateIngestedMock).toHaveBeenCalledTimes(2); // 성공 2건만 update
    consoleSpy.mockRestore();
  });

  it("14. promoter promoted=0 + errors>0 → status='FAILURE' (전체 실패 분기)", async () => {
    promoteMock.mockResolvedValue({ promoted: 0, errors: 3 });

    const result = await runAggregatorModule(FAKE_CTX, {
      module: "promoter",
      batch: 50,
    });

    expect(result.status).toBe("FAILURE");
    expect(result.message).toMatch(/promoted=0 errors=3/);
  });

  it("15. processSingleSource — url 또는 title 비어있는 raw item 필터링 (dedupe 입력 단계)", async () => {
    findManySourceMock.mockResolvedValue([makeSource({ id: 50 })]);
    fetchSourceMock.mockResolvedValue([
      { url: "https://x.com/valid", title: "OK" },
      { url: "", title: "no-url" }, // url empty → filter
      { url: "https://x.com/no-title", title: "" }, // title empty → filter
      { url: "https://x.com/another", title: "OK2" },
    ]);
    dedupeMock.mockResolvedValue({
      fresh: [
        { url: "https://x.com/valid", title: "OK" },
        { url: "https://x.com/another", title: "OK2" },
      ],
      duplicates: 0,
    });
    createManyIngestedMock.mockResolvedValue({ count: 2 });
    updateSourceMock.mockResolvedValue({});

    const result = await runAggregatorModule(FAKE_CTX, { module: "rss-fetcher" });

    // dedupeAgainstDb 에 전달된 valid 배열은 2건 (url+title 둘 다 truthy)
    const dedupeArg = dedupeMock.mock.calls[0]?.[0] as Array<{ url: string }>;
    expect(dedupeArg).toHaveLength(2);
    expect(dedupeArg.map((i) => i.url)).toEqual([
      "https://x.com/valid",
      "https://x.com/another",
    ]);
    expect(result.message).toMatch(/fetched=4 inserted=2/);
  });
});
