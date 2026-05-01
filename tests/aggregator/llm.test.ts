/**
 * tests/aggregator/llm.test.ts
 *
 * Track B / B5 commit — Gemini Flash 래퍼 TDD (13 케이스).
 *
 * 핵심 정책 검증:
 *   - GEMINI_API_KEY 없음 → 규칙 결과만 (graceful degradation)
 *   - 일일 한도 초과 → API call 스킵 + 규칙 결과
 *   - JSON 파싱 실패 → 규칙 결과 + 에러 로그
 *   - track / subcategorySlug 화이트리스트 검증
 *   - tags slice / summary slice / language slice
 *
 * 모듈 상태 (client/counter/lastCallAt) 격리: vi.resetModules + dynamic import.
 * Spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §6 T6
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RawItem } from "@/lib/aggregator/types";

// ─────────────────────────────────────────────────────────────────────────────
// 1) @google/genai 모킹 — vi.hoisted 로 resetModules 후에도 mock 상태 보존
// ─────────────────────────────────────────────────────────────────────────────
const { generateContentMock, GoogleGenAICtor } = vi.hoisted(() => {
  const gen = vi.fn();
  const ctor = vi.fn(function MockGoogleGenAI() {
    return { models: { generateContent: gen } };
  });
  return { generateContentMock: gen, GoogleGenAICtor: ctor };
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: GoogleGenAICtor,
}));

// ─────────────────────────────────────────────────────────────────────────────
// 2) enrichItem / getLlmStats 동적 로드 — beforeEach 마다 fresh 모듈
// ─────────────────────────────────────────────────────────────────────────────
let enrichItem: typeof import("@/lib/aggregator/llm").enrichItem;
let getLlmStats: typeof import("@/lib/aggregator/llm").getLlmStats;

beforeEach(async () => {
  vi.resetModules();
  generateContentMock.mockReset();
  GoogleGenAICtor.mockClear();
  delete process.env.GEMINI_API_KEY;
  delete process.env.AGGREGATOR_LLM_DAILY_BUDGET;
  const mod = await import("@/lib/aggregator/llm");
  enrichItem = mod.enrichItem;
  getLlmStats = mod.getLlmStats;
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) Helper — RawItem fixture
// ─────────────────────────────────────────────────────────────────────────────
function makeItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    url: "https://example.com/post",
    title: "Test Post",
    summary: "테스트 요약",
    ...overrides,
  };
}

// =============================================================================
// llm.ts (13 케이스)
// =============================================================================

describe("enrichItem — Gemini 래퍼", () => {
  it("1. GEMINI_API_KEY 없으면 API call 없이 ruleResult 만 반환", async () => {
    const result = await enrichItem(makeItem());

    expect(generateContentMock).not.toHaveBeenCalled();
    expect(GoogleGenAICtor).not.toHaveBeenCalled();
    expect(result.urlHash).toBeTruthy();
    expect(result.aiSummary).toBeUndefined();
  });

  it("2. 결과는 urlHash 를 항상 포함한다 (dedupe.urlHash 호출)", async () => {
    const result = await enrichItem(makeItem({ url: "https://example.com/a" }));

    expect(result.urlHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("3. 결과는 ruleResult.track + categorySlug 를 base 로 포함한다 (classifyItem)", async () => {
    // hustle 트랙 매처 키워드 포함 → ruleResult 가 hustle 반환 기대
    const result = await enrichItem(
      makeItem({ title: "사이드 프로젝트로 부수입 만들기", summary: "freelance + indie" }),
    );

    expect(result.suggestedTrack).toBeTruthy();
  });

  it("4. 일일 한도 초과 시 generateContent 호출 안 함", async () => {
    process.env.GEMINI_API_KEY = "test_key";
    process.env.AGGREGATOR_LLM_DAILY_BUDGET = "1";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ track: "build", summary: "요약", tags: ["a"], language: "ko" }),
    });

    await enrichItem(makeItem({ url: "https://example.com/1" }));
    await enrichItem(makeItem({ url: "https://example.com/2" }));

    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("5. valid response 가 suggestedTrack 으로 채택된다", async () => {
    process.env.GEMINI_API_KEY = "k";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        track: "build",
        subcategorySlug: null,
        summary: "AI 요약",
        tags: ["ai", "build"],
        language: "ko",
      }),
    });

    const result = await enrichItem(makeItem());

    expect(result.suggestedTrack).toBe("build");
    expect(result.aiSummary).toBe("AI 요약");
    expect(result.aiLanguage).toBe("ko");
  });

  it("6. invalid track (whitelist 외) → ruleResult.track 으로 fallback", async () => {
    process.env.GEMINI_API_KEY = "k";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        track: "invalid-track-xyz",
        summary: "x",
        tags: [],
        language: "ko",
      }),
    });

    const result = await enrichItem(
      makeItem({ title: "사이드 프로젝트로 부수입 만들기" }),
    );

    expect(result.suggestedTrack).not.toBe("invalid-track-xyz");
  });

  it("7. invalid subcategorySlug (가용 목록 외) → ruleResult.categorySlug fallback", async () => {
    process.env.GEMINI_API_KEY = "k";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        track: "build",
        subcategorySlug: "fake-slug-not-in-list",
        summary: "x",
        tags: [],
        language: "en",
      }),
    });

    const result = await enrichItem(makeItem());

    expect(result.suggestedCategorySlug).not.toBe("fake-slug-not-in-list");
  });

  it("8. JSON 파싱 실패 시 ruleResult only + 카운터는 +1", async () => {
    process.env.GEMINI_API_KEY = "k";
    generateContentMock.mockResolvedValue({ text: "not-json{{{" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await enrichItem(makeItem());

    expect(result.aiSummary).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    expect(getLlmStats().used).toBe(1);
    consoleSpy.mockRestore();
  });

  it("9. tags 배열은 8개로 slice + String() 매핑 + 빈 값 필터", async () => {
    process.env.GEMINI_API_KEY = "k";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        track: "learn",
        summary: "x",
        tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", ""],
        language: "ko",
      }),
    });

    const result = await enrichItem(makeItem());

    expect(result.aiTags).toHaveLength(8);
    expect(result.aiTags?.every((t) => t.length > 0)).toBe(true);
  });

  it("10. summary 는 2000자 / language 는 10자로 slice", async () => {
    process.env.GEMINI_API_KEY = "k";
    const longSummary = "가".repeat(3000);
    const longLang = "ko-KR-extra-very-long-locale-tag";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        track: "build",
        summary: longSummary,
        tags: [],
        language: longLang,
      }),
    });

    const result = await enrichItem(makeItem());

    expect(result.aiSummary?.length).toBe(2000);
    expect(result.aiLanguage?.length).toBe(10);
  });

  it("11. response.text 가 빈 문자열이면 ruleResult only", async () => {
    process.env.GEMINI_API_KEY = "k";
    generateContentMock.mockResolvedValue({ text: "" });

    const result = await enrichItem(makeItem());

    expect(result.aiSummary).toBeUndefined();
    expect(result.aiTags).toBeUndefined();
  });

  it("12. generateContent 호출 시 title + summary 가 user prompt 에 포함된다", async () => {
    process.env.GEMINI_API_KEY = "k";
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ track: "build", summary: "x", tags: [], language: "ko" }),
    });

    await enrichItem(
      makeItem({ title: "특별한 제목 ABCDEF", summary: "특별한 요약 XYZ123" }),
    );

    const callArg = generateContentMock.mock.calls[0]?.[0] as {
      contents: string;
    };
    expect(callArg.contents).toContain("특별한 제목 ABCDEF");
    expect(callArg.contents).toContain("특별한 요약 XYZ123");
  });

  it("13. getLlmStats 는 date/used/budget shape 반환", async () => {
    process.env.AGGREGATOR_LLM_DAILY_BUDGET = "150";

    const stats = getLlmStats();

    expect(stats).toMatchObject({
      date: expect.any(String),
      used: 0,
      budget: 150,
    });
    expect(stats.date).toMatch(/^\d{4}-\d{1,2}-\d{1,2}$/);
  });
});
