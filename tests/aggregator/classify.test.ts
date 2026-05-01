/**
 * tests/aggregator/classify.test.ts
 *
 * Track B / B3 commit — aggregator classify TDD (40 케이스).
 *
 * 분류:
 *   - A. getAvailableCategorySlugs DB 시드 37 슬러그 정합 (5)
 *   - B. classifyItem 트랙 매처 (10)
 *   - C. 서브카테고리 build (8) — DB 7 슬러그
 *   - D. 서브카테고리 work (3) — DB 6 슬러그 중 신규/정정
 *   - E. 서브카테고리 hustle (2) — DB 6 슬러그 중 신규/정정
 *   - F. 서브카테고리 invest (3) — DB 6 슬러그 중 신규
 *   - G. 서브카테고리 learn (3) — DB 6 슬러그 중 신규/정정
 *   - H. 서브카테고리 community (3) — DB 6 슬러그 중 신규
 *   - I. 한국어 + matched (3)
 *
 * spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §6 T4
 * 매핑: docs/research/baas-foundation/05-aggregator-migration/slug-mapping-db-vs-spec.md
 * 단일 진실 소스: prisma/seeds/almanac-aggregator-categories.sql (DB 시드 37 슬러그)
 *
 * Korean fix: spec 의 \b 패턴은 ASCII 전용이라 한글 키워드가 매치되지 않음.
 * 포팅 시 lookbehind/lookahead `(?<![\\w가-힣])` 로 교정. 본 테스트가 그 보장.
 */
import { describe, it, expect } from "vitest";
import {
  classifyItem,
  getAvailableCategorySlugs,
} from "@/lib/aggregator/classify";
import type { RawItem } from "@/lib/aggregator/types";

function makeItem(title: string, summary?: string): RawItem {
  return { url: "https://example.com/x", title, summary };
}

// =============================================================================
// A. getAvailableCategorySlugs — DB 시드 37 슬러그 정합 (5)
// =============================================================================

describe("getAvailableCategorySlugs — DB 시드 정합", () => {
  it("1. 정확히 37개 슬러그 반환 (DB 시드 = source of truth)", () => {
    const slugs = getAvailableCategorySlugs();
    expect(slugs).toHaveLength(37);
  });

  it("2. 모든 슬러그 unique (중복 0)", () => {
    const slugs = getAvailableCategorySlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("3. DB hustle 6 슬러그 모두 포함 (단수형 + DB-naming)", () => {
    const slugs = new Set(getAvailableCategorySlugs());
    for (const s of [
      "side-project", // NOT side-projects (단수)
      "indie-hacker", // NOT indie-hackers (단수)
      "monetization",
      "freelance",
      "creator-economy",
      "saas-bootstrap", // NOT saas-business
    ]) {
      expect(slugs.has(s), `expected ${s}`).toBe(true);
    }
  });

  it("4. spec drop 슬러그 14개 부재 (DB 미등록 → 매처 작성 금지)", () => {
    const slugs = new Set(getAvailableCategorySlugs());
    for (const s of [
      "marketing-growth",
      "automation",
      "model-releases",
      "fine-tuning",
      "ai-safety",
      "benchmarks",
      "valuation",
      "earnings",
      "courses",
      "guides",
      "case-studies",
      "explainers",
      "meetups",
      "open-positions",
    ]) {
      expect(slugs.has(s), `unexpected ${s}`).toBe(false);
    }
  });

  it("5. spec naming (단/복수 차이 + 별명) 부재 — DB 명만 사용", () => {
    const slugs = new Set(getAvailableCategorySlugs());
    for (const s of [
      "side-projects", // DB: side-project
      "indie-hackers", // DB: indie-hacker
      "saas-business", // DB: saas-bootstrap
      "tutorials", // DB: tutorial
      "deep-dives", // DB: deep-dive
      "research-papers", // DB: paper-summary (learn)
      "conferences", // DB: conference
      "hackathons", // DB: hackathon
      "layoffs", // DB: layoff-restructure
      "productivity-tools", // DB: productivity
      "team-collaboration", // DB: team-ops
      "knowledge-management", // DB: knowledge-mgmt
      "ai-at-work", // DB: ai-workflow
      "ai-infrastructure", // DB: infrastructure
      "rag-vector", // DB: rag-agents (병합)
      "agents", // DB: rag-agents (병합)
      "ai-funding", // DB: funding
    ]) {
      expect(slugs.has(s), `unexpected spec slug ${s}`).toBe(false);
    }
  });
});

// =============================================================================
// B. classifyItem — 트랙 매처 (10)
// =============================================================================

describe("classifyItem — 트랙 매처", () => {
  it("6. hustle: 'side hustle' high-weight → track=hustle", () => {
    const r = classifyItem(makeItem("Side hustle that pays $10k MRR"));
    expect(r.track).toBe("hustle");
  });

  it("7. work: 'productivity automation' → track=work", () => {
    const r = classifyItem(makeItem("Notion productivity automation Slack"));
    expect(r.track).toBe("work");
  });

  it("8. build: 'openai claude inference' → track=build", () => {
    const r = classifyItem(
      makeItem("OpenAI Claude integration", "Anthropic GPU inference"),
    );
    expect(r.track).toBe("build");
  });

  it("9. invest: 'series a funding' → track=invest", () => {
    const r = classifyItem(makeItem("Anthropic raises Series A funding"));
    expect(r.track).toBe("invest");
  });

  it("10. learn: 'arxiv paper' → track=learn", () => {
    const r = classifyItem(makeItem("New arxiv paper explained"));
    expect(r.track).toBe("learn");
  });

  it("11. community: 'hiring conference' → track=community", () => {
    const r = classifyItem(makeItem("We're hiring at AI conference"));
    expect(r.track).toBe("community");
  });

  it("12. multi-track invest > build (3 > 2)", () => {
    const r = classifyItem(makeItem("OpenAI series a funding round"));
    expect(r.track).toBe("invest");
  });

  it("13. weight=1 단독 → MIN_SCORE 미달 → track=undefined", () => {
    const r = classifyItem(makeItem("Company launched today"));
    expect(r.track).toBeUndefined();
  });

  it("14. 매치 0 → track=undefined", () => {
    const r = classifyItem(makeItem("Hello world general topic"));
    expect(r.track).toBeUndefined();
  });

  it("15. 빈 title + summary → track=undefined", () => {
    const r = classifyItem(makeItem(""));
    expect(r.track).toBeUndefined();
  });
});

// =============================================================================
// C. 서브카테고리: build (8) — DB 7 슬러그
// =============================================================================

describe("서브카테고리: build (DB 7 슬러그)", () => {
  it("16. open-source-llm: 'llama mistral' → build/open-source-llm", () => {
    const r = classifyItem(
      makeItem("llama 3 release notes", "huggingface mistral hosted"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("open-source-llm");
  });

  it("17. ai-companies: 'openai anthropic' → build/ai-companies", () => {
    const r = classifyItem(
      makeItem("OpenAI announces new feature", "anthropic gemini also"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("ai-companies");
  });

  it("18. korean-tech (DB 신규): '네이버 카카오' → build/korean-tech (한글 fix 필수)", () => {
    const r = classifyItem(
      makeItem("네이버 카카오 AI 모델 출시", "라인 우아한 인프라"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("korean-tech");
  });

  it("19. infrastructure (NOT ai-infrastructure): 'nvidia gpu cuda' → build/infrastructure", () => {
    const r = classifyItem(
      makeItem("NVIDIA H100 GPU", "CUDA datacenter benchmark"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("infrastructure");
  });

  it("20. rag-agents (병합 from rag-vector): 'rag retrieval embedding' → build/rag-agents", () => {
    const r = classifyItem(
      makeItem("RAG retrieval pinecone tutorial", "embedding inference benchmark"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("rag-agents");
  });

  it("21. rag-agents (병합 from agents): 'agentic multi-agent' → build/rag-agents", () => {
    const r = classifyItem(
      makeItem("Autonomous multi-agent system", "agentic training inference"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("rag-agents");
  });

  it("22. devtools: 'sdk cli framework' → build/devtools", () => {
    const r = classifyItem(
      makeItem("New developer tool", "sdk cli framework training"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("devtools");
  });

  it("23. research-paper (DB 신규 build 트랙): 'arxiv preprint cs.AI' → build/research-paper", () => {
    // 벤치마크 → build TRACK_RULES weight=2; arxiv → learn TRACK_RULES weight=2; 동점 시 build wins.
    const r = classifyItem(
      makeItem("새 벤치마크 발표", "arxiv preprint cs.AI 결과"),
    );
    expect(r.track).toBe("build");
    expect(r.categorySlug).toBe("research-paper");
  });
});

// =============================================================================
// D. 서브카테고리: work (3) — DB 6 슬러그 중 정정/신규
// =============================================================================

describe("서브카테고리: work (DB 6 슬러그)", () => {
  it("24. productivity (NOT productivity-tools): 'notion linear' → work/productivity", () => {
    const r = classifyItem(
      makeItem("Notion vs Linear", "productivity obsidian todoist"),
    );
    expect(r.track).toBe("work");
    expect(r.categorySlug).toBe("productivity");
  });

  it("25. no-code (DB 신규, automation 흡수): 'zapier n8n' → work/no-code", () => {
    const r = classifyItem(
      makeItem("Zapier vs n8n", "make.com workflow automation 자동화"),
    );
    expect(r.track).toBe("work");
    expect(r.categorySlug).toBe("no-code");
  });

  it("26. remote-work (DB 신규): 'remote distributed asynchronous' → work/remote-work", () => {
    const r = classifyItem(
      makeItem("Remote distributed team", "asynchronous workflow productivity"),
    );
    expect(r.track).toBe("work");
    expect(r.categorySlug).toBe("remote-work");
  });
});

// =============================================================================
// E. 서브카테고리: hustle (2) — DB 6 슬러그 중 정정
// =============================================================================

describe("서브카테고리: hustle (DB 6 슬러그)", () => {
  it("27. side-project (단수, NOT side-projects): 'weekend side project' → hustle/side-project", () => {
    const r = classifyItem(
      makeItem("My weekend side project", "indie bootstrap 사이드프로젝트"),
    );
    expect(r.track).toBe("hustle");
    expect(r.categorySlug).toBe("side-project");
  });

  it("28. saas-bootstrap (NOT saas-business): 'saas bootstrap mrr' → hustle/saas-bootstrap", () => {
    const r = classifyItem(makeItem("SaaS bootstrap journey", "MRR ARR 구독"));
    expect(r.track).toBe("hustle");
    expect(r.categorySlug).toBe("saas-bootstrap");
  });
});

// =============================================================================
// F. 서브카테고리: invest (3) — DB 6 슬러그 중 신규
// =============================================================================

describe("서브카테고리: invest (DB 6 슬러그)", () => {
  it("29. funding (NOT ai-funding): 'startup raised funding' → invest/funding", () => {
    const r = classifyItem(makeItem("Startup raised $20M", "Series A funding round"));
    expect(r.track).toBe("invest");
    expect(r.categorySlug).toBe("funding");
  });

  it("30. public-markets (DB 신규, earnings 흡수): 'stock earnings 실적' → invest/public-markets", () => {
    const r = classifyItem(
      makeItem("Quarterly earnings 투자 report", "stock revenue trillion 실적"),
    );
    expect(r.track).toBe("invest");
    expect(r.categorySlug).toBe("public-markets");
  });

  it("31. macro-economy (DB 신규): '금리 inflation policy' → invest/macro-economy", () => {
    const r = classifyItem(makeItem("Fed 금리 인상", "inflation policy 투자"));
    expect(r.track).toBe("invest");
    expect(r.categorySlug).toBe("macro-economy");
  });
});

// =============================================================================
// G. 서브카테고리: learn (3) — DB 6 슬러그 중 신규/정정
// =============================================================================

describe("서브카테고리: learn (DB 6 슬러그)", () => {
  it("32. tutorial (단수, NOT tutorials): 'tutorial step by step' → learn/tutorial", () => {
    const r = classifyItem(
      makeItem("Step by step tutorial", "guide how to 튜토리얼"),
    );
    expect(r.track).toBe("learn");
    expect(r.categorySlug).toBe("tutorial");
  });

  it("33. data-science (DB 신규): 'data science visualization' → learn/data-science", () => {
    const r = classifyItem(
      makeItem("Data science 강의", "visualization analysis course"),
    );
    expect(r.track).toBe("learn");
    expect(r.categorySlug).toBe("data-science");
  });

  it("34. system-design (DB 신규): 'system design scalability' → learn/system-design", () => {
    const r = classifyItem(
      makeItem("System design 가이드", "scalability architecture"),
    );
    expect(r.track).toBe("learn");
    expect(r.categorySlug).toBe("system-design");
  });
});

// =============================================================================
// H. 서브카테고리: community (3) — DB 6 슬러그 중 신규/정정
// =============================================================================

describe("서브카테고리: community (DB 6 슬러그)", () => {
  it("35. conference (단수, NOT conferences): 'conference summit expo' → community/conference", () => {
    const r = classifyItem(
      makeItem("AI Conference 2026", "summit expo 컨퍼런스"),
    );
    expect(r.track).toBe("community");
    expect(r.categorySlug).toBe("conference");
  });

  it("36. korean-community (DB 신규): '긱뉴스 요즘IT 모각코' → community/korean-community", () => {
    const r = classifyItem(
      makeItem("긱뉴스 요즘IT 모각코 모임", "한국 커뮤니티"),
    );
    expect(r.track).toBe("community");
    expect(r.categorySlug).toBe("korean-community");
  });

  it("37. layoff-restructure (단/복수 + 병합 layoffs): 'layoff 정리해고 구조조정' → community/layoff-restructure", () => {
    const r = classifyItem(
      makeItem("Big tech layoff", "job cut 정리해고 구조조정 커뮤니티"),
    );
    expect(r.track).toBe("community");
    expect(r.categorySlug).toBe("layoff-restructure");
  });
});

// =============================================================================
// I. 한국어 + matched 배열 (3)
// =============================================================================

describe("한국어 + matched 배열", () => {
  it("38. 한글 키워드 hustle: '부업 수익화 창업' → track=hustle (한글 fix 필수)", () => {
    const r = classifyItem(makeItem("1인 창업 부업 수익화 가이드"));
    expect(r.track).toBe("hustle");
  });

  it("39. matched 배열: lower-case 변환 + non-empty", () => {
    const r = classifyItem(makeItem("OpenAI Claude inference"));
    expect(r.matched).toBeDefined();
    expect(r.matched!.length).toBeGreaterThan(0);
    for (const k of r.matched!) {
      expect(k).toBe(k.toLowerCase());
    }
  });

  it("40. matched 배열: 중복 키워드 제거", () => {
    const r = classifyItem(
      makeItem("OpenAI OpenAI funding", "OpenAI series a"),
    );
    expect(r.matched).toBeDefined();
    expect(r.matched).toEqual(Array.from(new Set(r.matched ?? [])));
  });
});
