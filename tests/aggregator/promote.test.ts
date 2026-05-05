/**
 * tests/aggregator/promote.test.ts
 *
 * Track B / B5 commit — promote.ts (ingested → content_items 승격) TDD (14 케이스).
 *
 * Multi-tenant 적응 검증:
 *   - tenantPrismaFor(ctx) 사용 (findMany)
 *   - withTenantTx(ctx.tenantId, fn) 사용 (upsert + update)
 *
 * 핵심 정책:
 *   - upsert (ingestedItemId 유니크) 로 재실행 안전
 *   - 카테고리 슬러그 → categoryId 매핑
 *   - 폴백: excerpt(aiSummary→summary→title), track(suggestedTrack ?? "general"),
 *     publishedAt(item.publishedAt ?? item.fetchedAt)
 *   - 단일 항목 실패가 batch 전체를 막지 않음
 *
 * Spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §6 T6
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1) tenantPrismaFor + withTenantTx 모킹 — vi.hoisted 로 vi.mock 호이스팅 안전
//    factory 가 tenantPrismaForMock/withTenantTxMock 을 직접 참조하므로
//    동기 평가 시점에 이미 초기화돼 있어야 함. dedupe.test.ts 의 inline-closure
//    패턴과 다른 이유: assertion 을 위해 mock instance reference 가 필요.
// ─────────────────────────────────────────────────────────────────────────────
const {
  findManyIngestedMock,
  findManyCategoryMock,
  upsertItemMock,
  updateIngestedMock,
  tenantPrismaForMock,
  withTenantTxMock,
} = vi.hoisted(() => {
  const findManyIngestedMock = vi.fn();
  const findManyCategoryMock = vi.fn();
  const upsertItemMock = vi.fn();
  const updateIngestedMock = vi.fn();
  const tenantPrismaForMock = vi.fn(() => ({
    contentIngestedItem: { findMany: findManyIngestedMock },
    contentCategory: { findMany: findManyCategoryMock },
  }));
  const withTenantTxMock = vi.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        contentItem: { upsert: upsertItemMock },
        contentIngestedItem: { update: updateIngestedMock },
      }),
  );
  return {
    findManyIngestedMock,
    findManyCategoryMock,
    upsertItemMock,
    updateIngestedMock,
    tenantPrismaForMock,
    withTenantTxMock,
  };
});

vi.mock("@/lib/db/prisma-tenant-client", () => ({
  tenantPrismaFor: tenantPrismaForMock,
  withTenantTx: withTenantTxMock,
}));

import { promotePending } from "@/lib/aggregator/promote";

const FAKE_CTX = { tenantId: "00000000-0000-0000-0000-000000000001" };

beforeEach(() => {
  findManyIngestedMock.mockReset();
  findManyCategoryMock.mockReset();
  upsertItemMock.mockReset();
  updateIngestedMock.mockReset();
  tenantPrismaForMock.mockClear();
  withTenantTxMock.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Helper — ingested fixture
// ─────────────────────────────────────────────────────────────────────────────
type Ingested = {
  id: number;
  sourceId: number;
  url: string;
  urlHash: string;
  title: string;
  summary: string | null;
  aiSummary: string | null;
  aiTags: string[];
  aiLanguage: string | null;
  imageUrl: string | null;
  author: string | null;
  suggestedTrack: string | null;
  suggestedCategorySlug: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
};

function makeIngested(overrides: Partial<Ingested> = {}): Ingested {
  return {
    id: 1,
    sourceId: 100,
    url: "https://example.com/post",
    urlHash: "abcdef0123456789".repeat(4),
    title: "테스트 글 제목",
    summary: "원본 요약",
    aiSummary: "AI 가 만든 요약",
    aiTags: ["ai"],
    aiLanguage: "ko",
    imageUrl: "https://example.com/img.jpg",
    author: "Alice",
    suggestedTrack: "build",
    suggestedCategorySlug: "ai-tools",
    publishedAt: new Date("2026-05-02T00:00:00Z"),
    fetchedAt: new Date("2026-05-02T01:00:00Z"),
    ...overrides,
  };
}

// =============================================================================
// promote.ts (14 케이스)
// =============================================================================

describe("promotePending — ingested → content_items 승격 (multi-tenant)", () => {
  it("1. ready=[] 빈 배열이면 promoted=0 errors=0 반환 + tx 호출 없음", async () => {
    findManyIngestedMock.mockResolvedValue([]);

    const result = await promotePending(FAKE_CTX);

    expect(result).toEqual({ promoted: 0, errors: 0 });
    expect(withTenantTxMock).not.toHaveBeenCalled();
  });

  it("2. tenantPrismaFor 가 ctx 와 함께 호출된다", async () => {
    findManyIngestedMock.mockResolvedValue([]);

    await promotePending(FAKE_CTX);

    expect(tenantPrismaForMock).toHaveBeenCalledWith(FAKE_CTX);
  });

  it("3. categoryRows 가 ready 의 unique slug 들로 contentCategory.findMany 호출", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: "ai-tools" }),
      makeIngested({ id: 2, suggestedCategorySlug: "ai-tools" }),
      makeIngested({ id: 3, suggestedCategorySlug: "frontend" }),
    ]);
    findManyCategoryMock.mockResolvedValue([
      { id: "cat-1", slug: "ai-tools" },
      { id: "cat-2", slug: "frontend" },
    ]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    expect(findManyCategoryMock).toHaveBeenCalledTimes(1);
    const callArg = findManyCategoryMock.mock.calls[0]?.[0] as {
      where: { slug: { in: string[] } };
    };
    expect(callArg.where.slug.in.sort()).toEqual(["ai-tools", "frontend"]);
  });

  it("4. categoryId 가 슬러그 매핑에서 해석된다", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: "ai-tools" }),
    ]);
    findManyCategoryMock.mockResolvedValue([{ id: "cat-1", slug: "ai-tools" }]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as {
      create: { categoryId: string | null };
    };
    expect(upsertArg.create.categoryId).toBe("cat-1");
  });

  it("5. categoryId null when slug not in mapping", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: "missing-slug" }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as {
      create: { categoryId: string | null };
    };
    expect(upsertArg.create.categoryId).toBeNull();
  });

  it("6. slug 는 slugify(title) + urlHash 앞 8자 (한글 포함 매핑)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        title: "AI 도구 소개",
        urlHash: "fedcba9876543210" + "0".repeat(48),
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as {
      create: { slug: string };
    };
    expect(upsertArg.create.slug).toMatch(/^ai-도구-소개-fedcba98$/);
  });

  it("7. excerpt 폴백 — aiSummary 우선, summary fallback, title fallback", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, aiSummary: "  AI 요약  ", summary: "원본", suggestedCategorySlug: null }),
      makeIngested({ id: 2, aiSummary: null, summary: "  원본 요약  ", suggestedCategorySlug: null }),
      makeIngested({ id: 3, aiSummary: null, summary: null, title: "타이틀만 존재", suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const args = upsertItemMock.mock.calls.map(
      (c) => (c[0] as { create: { excerpt: string } }).create.excerpt,
    );
    expect(args[0]).toBe("AI 요약");
    expect(args[1]).toBe("원본 요약");
    expect(args[2]).toBe("타이틀만 존재");
  });

  it("8. track 폴백 — suggestedTrack ?? \"general\"", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedTrack: "invest", suggestedCategorySlug: null }),
      makeIngested({ id: 2, suggestedTrack: null, suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const tracks = upsertItemMock.mock.calls.map(
      (c) => (c[0] as { create: { track: string } }).create.track,
    );
    expect(tracks).toEqual(["invest", "general"]);
  });

  it("9. publishedAt 폴백 — item.publishedAt ?? item.fetchedAt", async () => {
    const fetched = new Date("2026-05-01T12:00:00Z");
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        publishedAt: null,
        fetchedAt: fetched,
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as {
      create: { publishedAt: Date };
    };
    expect(upsertArg.create.publishedAt.getTime()).toBe(fetched.getTime());
  });

  it("10. withTenantTx 가 ctx.tenantId 와 호출된다", async () => {
    findManyIngestedMock.mockResolvedValue([makeIngested({ suggestedCategorySlug: null })]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    expect(withTenantTxMock).toHaveBeenCalled();
    expect(withTenantTxMock.mock.calls[0]?.[0]).toBe(FAKE_CTX.tenantId);
  });

  it("11. tx.contentItem.upsert 가 where.ingestedItemId 로 호출된다", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 42, suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as {
      where: { ingestedItemId: number };
    };
    expect(upsertArg.where.ingestedItemId).toBe(42);
  });

  it("12. tx.contentIngestedItem.update 가 status='promoted' + processedAt 갱신", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 7, suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const updateArg = updateIngestedMock.mock.calls[0]?.[0] as {
      where: { id: number };
      data: { status: string; processedAt: Date };
    };
    expect(updateArg.where.id).toBe(7);
    expect(updateArg.data.status).toBe("promoted");
    expect(updateArg.data.processedAt).toBeInstanceOf(Date);
  });

  it("13. 단일 항목 실패가 batch 전체를 막지 않는다 (errors 카운터 증가)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: null }),
      makeIngested({ id: 2, suggestedCategorySlug: null }),
      makeIngested({ id: 3, suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    let upsertCallCount = 0;
    upsertItemMock.mockImplementation(async () => {
      upsertCallCount += 1;
      if (upsertCallCount === 2) throw new Error("DB upsert 실패");
      return {};
    });
    updateIngestedMock.mockResolvedValue({});
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await promotePending(FAKE_CTX);

    expect(result.promoted).toBe(2);
    expect(result.errors).toBe(1);
    consoleSpy.mockRestore();
  });

  it("14. promoted count 가 성공적으로 처리된 row 수와 일치", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: null }),
      makeIngested({ id: 2, suggestedCategorySlug: null }),
      makeIngested({ id: 3, suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    const result = await promotePending(FAKE_CTX);

    expect(result.promoted).toBe(3);
    expect(result.errors).toBe(0);
  });

  // ===========================================================================
  // S87 추가 13 케이스 (Track B TDD 14→27, R-W1 갭 보강)
  // ===========================================================================

  it("15. slugify 한글 음절 보존 (NFKD→NFC 재결합 — jamo 분해 차단)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        title: "양평 부엌",
        urlHash: "11111111".repeat(8),
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as { create: { slug: string } };
    // 한글이 그대로 보존돼야 함 (jamo 로 분해되면 정규식이 매치 못해 빈 슬러그가 됨)
    expect(upsertArg.create.slug).toMatch(/양평-부엌/);
  });

  it("16. slugify Latin 분음부호 제거 (café → cafe)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        title: "Café résumé",
        urlHash: "22222222".repeat(8),
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as { create: { slug: string } };
    expect(upsertArg.create.slug).toMatch(/^cafe-resume-/);
  });

  it("17. slugify 60자 + suffix 8자 — base slice 60자 제한", async () => {
    const longTitle = "a".repeat(100);
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        title: longTitle,
        urlHash: "33333333".repeat(8),
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as { create: { slug: string } };
    // base = 60자 'a' + '-' + 8자 hash = 69자
    expect(upsertArg.create.slug).toBe("a".repeat(60) + "-33333333");
  });

  it("18. slugify 빈 결과 → 'item' 폴백", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        title: "!!!@@@###",
        urlHash: "44444444".repeat(8),
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as { create: { slug: string } };
    expect(upsertArg.create.slug).toBe("item-44444444");
  });

  it("19. batch 명시 인수가 findMany.take 로 전달된다 (기본 50 vs custom)", async () => {
    findManyIngestedMock.mockResolvedValue([]);

    await promotePending(FAKE_CTX, 25);

    const callArg = findManyIngestedMock.mock.calls[0]?.[0] as { take: number };
    expect(callArg.take).toBe(25);
  });

  it("20. batch 기본값은 50", async () => {
    findManyIngestedMock.mockResolvedValue([]);

    await promotePending(FAKE_CTX);

    const callArg = findManyIngestedMock.mock.calls[0]?.[0] as { take: number };
    expect(callArg.take).toBe(50);
  });

  it("21. upsert.update 분기에 categoryId/excerpt/tags 갱신 명시 (재실행 시 update path)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: "ai-tools" }),
    ]);
    findManyCategoryMock.mockResolvedValue([{ id: "cat-1", slug: "ai-tools" }]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as {
      update: { categoryId: string | null; track: string; tags: string[] };
    };
    expect(upsertArg.update.categoryId).toBe("cat-1");
    expect(upsertArg.update.track).toBe("build");
    expect(upsertArg.update.tags).toEqual(["ai"]);
  });

  it("22. ready 의 모든 slug=null/empty 면 contentCategory.findMany 호출 안 함 (slugs.length=0 분기)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: null }),
      makeIngested({ id: 2, suggestedCategorySlug: "" }),
    ]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    expect(findManyCategoryMock).not.toHaveBeenCalled();
  });

  it("23. categoryRows.findMany 의 slug.in 은 중복 제거된 unique 목록 (Set 처리)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: "ai-tools" }),
      makeIngested({ id: 2, suggestedCategorySlug: "ai-tools" }),
      makeIngested({ id: 3, suggestedCategorySlug: "ai-tools" }),
    ]);
    findManyCategoryMock.mockResolvedValue([{ id: "cat-1", slug: "ai-tools" }]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const callArg = findManyCategoryMock.mock.calls[0]?.[0] as {
      where: { slug: { in: string[] } };
    };
    expect(callArg.where.slug.in).toEqual(["ai-tools"]); // 1개 (중복 3 제거됨)
  });

  it("24. excerpt — title slice 200자 제한 (aiSummary, summary 모두 null/공백)", async () => {
    const longTitle = "긴 제목입니다 ".repeat(50); // 350자+
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        title: longTitle,
        aiSummary: null,
        summary: null,
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as { create: { excerpt: string } };
    expect(upsertArg.create.excerpt.length).toBe(200);
    expect(upsertArg.create.excerpt).toBe(longTitle.slice(0, 200));
  });

  it("25. tags 폴백 — aiTags 가 빈 배열이어도 그대로 사용 (?? 가 [] 통과)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, aiTags: [], suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as { create: { tags: string[] } };
    expect(upsertArg.create.tags).toEqual([]);
  });

  it("26. withTenantTx fn throw → errors++ + 다음 row 흐름 보존 (격리)", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({ id: 1, suggestedCategorySlug: null }),
      makeIngested({ id: 2, suggestedCategorySlug: null }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    let txCallCount = 0;
    withTenantTxMock.mockImplementation(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
        txCallCount += 1;
        if (txCallCount === 1) throw new Error("tx 격리 실패 시뮬");
        return fn({
          contentItem: { upsert: upsertItemMock },
          contentIngestedItem: { update: updateIngestedMock },
        });
      },
    );
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await promotePending(FAKE_CTX);

    expect(result.promoted).toBe(1);
    expect(result.errors).toBe(1);
    expect(withTenantTxMock).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it("27. excerpt 폴백 — aiSummary 공백만 → trim 후 falsy → summary 폴백", async () => {
    findManyIngestedMock.mockResolvedValue([
      makeIngested({
        id: 1,
        aiSummary: "    ",
        summary: "원본 요약 폴백",
        suggestedCategorySlug: null,
      }),
    ]);
    findManyCategoryMock.mockResolvedValue([]);
    upsertItemMock.mockResolvedValue({});
    updateIngestedMock.mockResolvedValue({});

    await promotePending(FAKE_CTX);

    const upsertArg = upsertItemMock.mock.calls[0]?.[0] as { create: { excerpt: string } };
    expect(upsertArg.create.excerpt).toBe("원본 요약 폴백");
  });
});
