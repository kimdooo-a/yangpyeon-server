// =============================================================================
// 모듈: aggregator/classify
// 역할: 규칙 기반 트랙 + 서브카테고리 분류기 (LLM 호출 전 1차 판정)
// 출처: docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/classify.ts
// 매핑: docs/research/baas-foundation/05-aggregator-migration/slug-mapping-db-vs-spec.md
// 단일 진실 소스: prisma/seeds/almanac-aggregator-categories.sql (DB 시드 37 슬러그)
//
// 변경 (multi-tenant DB 정합):
//   - SUBCATEGORY_RULES 슬러그를 DB 시드 (37) 기준으로 재작성. spec 40 슬러그 중
//     14 drop, 단/복수형 정정, 병합 (rag-agents/public-markets/layoff-restructure),
//     DB 신규 11개 (no-code/remote-work/korean-tech/data-science/system-design/
//     career-growth/discussion/korean-community/macro-economy/market-analysis/
//     research-paper) 추가.
//   - compilePattern 에 한글 lookbehind/lookahead 적용. spec 의 \b 는 ASCII word
//     전용이라 한글(가-힣) 양쪽이 non-word 로 취급되어 \b 가 매치되지 않는 버그가
//     있었음. [\w가-힣] 을 통합 word-class 로 정의하여 ASCII/한글 둘 다 정확한
//     boundary 인식.
//   - DB 의존 0 (분류는 순수 함수). tenantPrismaFor 사용 안 함.
//   - SUBCATEGORY_RULES iteration 우선순위: korean-tech 를 infrastructure 보다
//     앞에 배치 (한글 fix 후 '인프라' 키워드가 양쪽 매처에 노출되는 영향 회피).
// =============================================================================

import type { RawItem, RuleClassifyResult } from "./types";

// ----------------------------------------------------------------------------
// 패턴 컴파일러
// ----------------------------------------------------------------------------

/** 정규식 메타문자 이스케이프 (사용자 키워드 → RegExp 변환 시 안전) */
const REGEX_META = /[.*+?^$(){}|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(REGEX_META, "\\$&");
}

/**
 * 키워드 배열 → 한글 호환 boundary 매처.
 *
 * spec 의 `\\b` 는 ASCII `\\w`(=[A-Za-z0-9_]) 전용이라 가-힣 음절은 non-word 로
 * 취급되어 한글 키워드 양쪽 boundary 가 잡히지 않음 → spec Korean 매처가 사실상
 * 작동하지 않는 잠재 버그. lookbehind/lookahead 로 [\w가-힣] 를 통합 word-class
 * 로 정의하여 ASCII/한글 양쪽 모두 정확한 단어 경계 인식.
 */
function compilePattern(terms: string[]): RegExp {
  const escaped = terms.map(escapeRegex).join("|");
  return new RegExp(
    `(?<![\\w가-힣])(?:${escaped})(?![\\w가-힣])`,
    "i",
  );
}

// ----------------------------------------------------------------------------
// 트랙 키워드 매처 (spec 그대로 — 트랙 자체는 FK 제약 없음)
// ----------------------------------------------------------------------------

interface KeywordRule {
  track: string;
  pattern: RegExp;
  weight: number;
}

const TRACK_RULES: KeywordRule[] = [
  // hustle — 1인 창업/부업/수익화
  {
    track: "hustle",
    weight: 3,
    pattern: compilePattern([
      "side hustle", "side project", "indie hacker", "indie", "solopreneur",
      "bootstrap", "make money", "monetize", "monetization", "passive income",
      "freelance", "creator economy", "saas", "mrr", "arr",
      "수익화", "부업", "사이드프로젝트", "사이드 프로젝트", "창업", "소호", "1인기업", "독립", "자영업",
    ]),
  },
  { track: "hustle", weight: 1, pattern: compilePattern(["launched", "earning", "revenue"]) },

  // work — 업무/생산성/자동화
  {
    track: "work",
    weight: 2,
    pattern: compilePattern([
      "productivity", "workflow", "automation", "template", "notion", "obsidian",
      "slack", "sop", "playbook",
      "업무", "효율", "자동화", "생산성", "템플릿", "보고서", "회의록",
    ]),
  },

  // build — AI 모델/인프라/개발
  {
    track: "build",
    weight: 2,
    pattern: compilePattern([
      "openai", "anthropic", "claude", "gpt", "gemini", "llama", "mistral",
      "qwen", "deepseek", "gemma", "phi", "deepmind", "huggingface", "hugging face",
      "model", "inference", "training", "infrastructure", "devtool", "open source",
      "opensource", "benchmark", "fine-tune", "rag", "transformers", "diffusion",
      "오픈소스", "모델", "인프라", "개발자", "릴리즈", "벤치마크", "파인튜닝",
    ]),
  },
  { track: "build", weight: 1, pattern: compilePattern(["safety", "alignment", "red team", "jailbreak"]) },

  // invest — 투자/펀딩/M&A
  {
    track: "invest",
    weight: 3,
    pattern: compilePattern([
      "funding", "series a", "series b", "series c", "series d",
      "valuation", "ipo", "m&a", "acquisition", "venture", "vc",
      "startup round", "raised",
      "투자", "시리즈", "상장", "인수", "자본", "밸류에이션", "유니콘", "펀딩",
    ]),
  },
  { track: "invest", weight: 1, pattern: compilePattern(["billion", "trillion", "stock", "earnings"]) },

  // learn — 리서치/논문/튜토리얼
  {
    track: "learn",
    weight: 2,
    pattern: compilePattern([
      "research", "paper", "study", "analysis", "explained", "deep dive",
      "tutorial", "primer", "guide", "how-to", "how to", "course",
      "튜토리얼", "강의", "학습", "논문", "리서치", "해설", "분석", "가이드", "입문",
    ]),
  },
  { track: "learn", weight: 2, pattern: compilePattern(["arxiv", "abstract", "hypothesis"]) },

  // community — 채용/컨퍼런스/해커톤
  {
    track: "community",
    weight: 2,
    pattern: compilePattern([
      "hiring", "layoff", "community", "meetup", "conference", "hackathon",
      "채용", "구조조정", "해고", "커뮤니티", "컨퍼런스", "해커톤", "모임",
    ]),
  },
];

const MIN_TRACK_SCORE = 2;

// ----------------------------------------------------------------------------
// 서브카테고리 키워드 매처 (DB 시드 37 슬러그)
// ※ slug 는 DB content_categories.slug 와 정확히 일치 필수 (FK 제약).
// ※ iteration order = first-match-wins 우선순위. 한국 특화 매처는 일반 매처보다
//   앞에 배치하여 한글 텍스트가 한국 매처를 우선 채택하도록 한다.
// ----------------------------------------------------------------------------

interface SubcategoryRule {
  /** DB content_categories.slug (FK target) */
  slug: string;
  /** 부모 트랙 */
  track: string;
  /** 검사 패턴 */
  pattern: RegExp;
}

const SUBCATEGORY_RULES: SubcategoryRule[] = [
  // ===== build (7) =====
  { slug: "open-source-llm", track: "build", pattern: compilePattern([
    "llama", "mistral", "qwen", "deepseek", "gemma", "phi-3", "phi-4",
    "open source model", "오픈소스 모델", "오픈웨이트",
  ])},
  { slug: "ai-companies", track: "build", pattern: compilePattern([
    "openai", "anthropic", "google deepmind", "deepmind", "meta ai",
    "microsoft ai", "xai", "mistral ai",
  ])},
  // korean-tech 를 infrastructure 보다 앞에 배치 (한국 회사명 우선 채택)
  { slug: "korean-tech", track: "build", pattern: compilePattern([
    "네이버", "카카오", "라인", "우아한", "쿠팡", "배민", "토스", "당근", "naver", "kakao",
  ])},
  { slug: "infrastructure", track: "build", pattern: compilePattern([
    "infrastructure", "gpu", "cuda", "nvidia", "tpu", "datacenter",
    "인프라", "데이터센터",
  ])},
  // rag-agents = spec rag-vector + agents 병합
  { slug: "rag-agents", track: "build", pattern: compilePattern([
    "rag", "retrieval", "vector db", "embedding", "pinecone", "weaviate",
    "agent", "agentic", "autonomous", "multi-agent",
    "벡터", "임베딩", "에이전트",
  ])},
  { slug: "devtools", track: "build", pattern: compilePattern([
    "devtool", "developer tool", "ide", "cli", "sdk", "api", "framework",
    "개발자 도구",
  ])},
  // research-paper = DB 신규 build 트랙 (learn/paper-summary 와 별개)
  { slug: "research-paper", track: "build", pattern: compilePattern([
    "arxiv", "preprint", "cs.ai", "cs.lg", "cs.cl", "research paper", "ml paper",
  ])},

  // ===== work (6) =====
  { slug: "productivity", track: "work", pattern: compilePattern([
    "notion", "obsidian", "linear", "asana", "todoist", "생산성 도구",
  ])},
  // no-code = DB 신규 (spec automation 흡수)
  { slug: "no-code", track: "work", pattern: compilePattern([
    "zapier", "make.com", "n8n", "airtable", "노코드", "no-code", "no code",
  ])},
  { slug: "team-ops", track: "work", pattern: compilePattern([
    "team ops", "1on1", "okr", "leadership", "리더십", "팀 운영", "okr 미팅",
  ])},
  // ai-workflow = spec ai-at-work 정정
  { slug: "ai-workflow", track: "work", pattern: compilePattern([
    "copilot", "ai assistant", "ai for work", "업무 ai", "ai 워크플로우",
  ])},
  // knowledge-mgmt = spec knowledge-management 약어
  { slug: "knowledge-mgmt", track: "work", pattern: compilePattern([
    "second brain", "knowledge base", "wiki", "pkm", "지식 관리",
  ])},
  // remote-work = DB 신규
  { slug: "remote-work", track: "work", pattern: compilePattern([
    "remote", "distributed", "asynchronous", "재택", "원격", "분산 팀",
  ])},

  // ===== hustle (6) =====
  // side-project = 단수
  { slug: "side-project", track: "hustle", pattern: compilePattern([
    "side project", "side hustle", "weekend project", "사이드프로젝트", "사이드 프로젝트",
  ])},
  // indie-hacker = 단수
  { slug: "indie-hacker", track: "hustle", pattern: compilePattern([
    "indie hacker", "solopreneur", "1인 창업", "인디해커",
  ])},
  // saas-bootstrap = spec saas-business 정정 (VC 없이 키우는 SaaS)
  { slug: "saas-bootstrap", track: "hustle", pattern: compilePattern([
    "saas", "subscription", "mrr", "arr", "구독", "bootstrap",
  ])},
  { slug: "creator-economy", track: "hustle", pattern: compilePattern([
    "creator", "youtuber", "newsletter", "substack", "patreon", "크리에이터", "뉴스레터",
  ])},
  { slug: "monetization", track: "hustle", pattern: compilePattern([
    "monetize", "monetization", "pricing", "paywall", "수익화", "유료화",
  ])},
  { slug: "freelance", track: "hustle", pattern: compilePattern([
    "freelance", "contract work", "프리랜서", "외주",
  ])},

  // ===== invest (6) =====
  // funding = spec ai-funding 정정 (AI 한정 → 일반)
  { slug: "funding", track: "invest", pattern: compilePattern([
    "funding", "raised", "series a", "series b", "series c", "series d",
    "seed round", "펀딩", "투자 라운드",
  ])},
  { slug: "vc-thesis", track: "invest", pattern: compilePattern([
    "venture", "vc", "sequoia", "a16z", "y combinator", "ycombinator",
    "벤처캐피탈", "vc 인사이트",
  ])},
  { slug: "ipo-acquisition", track: "invest", pattern: compilePattern([
    "ipo", "acquisition", "m&a", "merger", "상장", "인수",
  ])},
  // public-markets = DB 신규 (spec earnings 흡수)
  { slug: "public-markets", track: "invest", pattern: compilePattern([
    "earnings", "quarterly", "stock", "revenue report", "주식", "환율", "채권", "실적",
  ])},
  // market-analysis = DB 신규
  { slug: "market-analysis", track: "invest", pattern: compilePattern([
    "market analysis", "sector report", "industry report", "시장 분석", "산업 리서치",
  ])},
  // macro-economy = DB 신규
  { slug: "macro-economy", track: "invest", pattern: compilePattern([
    "inflation", "interest rate", "policy", "fed", "금리", "인플레이션", "거시 경제", "통화정책",
  ])},

  // ===== learn (6) =====
  { slug: "tutorial", track: "learn", pattern: compilePattern([
    "tutorial", "step by step", "how-to", "how to", "튜토리얼", "따라하기",
  ])},
  { slug: "deep-dive", track: "learn", pattern: compilePattern([
    "deep dive", "in depth", "deep dives", "해부",
  ])},
  // paper-summary = spec research-papers 정정 (요약 의미 강조)
  { slug: "paper-summary", track: "learn", pattern: compilePattern([
    "paper summary", "논문 요약", "abstract", "tl;dr",
  ])},
  // data-science = DB 신규
  { slug: "data-science", track: "learn", pattern: compilePattern([
    "data science", "data analysis", "visualization", "statistics", "시각화", "데이터 분석",
  ])},
  // system-design = DB 신규
  { slug: "system-design", track: "learn", pattern: compilePattern([
    "system design", "architecture", "scalability", "distributed system",
    "시스템 설계", "확장성",
  ])},
  // career-growth = DB 신규
  { slug: "career-growth", track: "learn", pattern: compilePattern([
    "career", "promotion", "salary", "interview prep", "이직", "커리어", "연봉",
  ])},

  // ===== community (6) =====
  { slug: "hiring", track: "community", pattern: compilePattern([
    "hiring", "we're hiring", "we are hiring", "open role", "job opening",
    "채용", "구인", "포지션",
  ])},
  // layoff-restructure = spec layoffs 단/복수 + 정리해고+구조조정 병합
  { slug: "layoff-restructure", track: "community", pattern: compilePattern([
    "layoff", "job cut", "restructure", "정리해고", "구조조정",
  ])},
  { slug: "conference", track: "community", pattern: compilePattern([
    "conference", "summit", "expo", "컨퍼런스",
  ])},
  { slug: "hackathon", track: "community", pattern: compilePattern([
    "hackathon", "jam", "해커톤",
  ])},
  // discussion = DB 신규 (spec meetups 흡수)
  { slug: "discussion", track: "community", pattern: compilePattern([
    "discussion", "debate", "interview", "meetup", "gathering", "토론", "인터뷰",
  ])},
  // korean-community = DB 신규
  { slug: "korean-community", track: "community", pattern: compilePattern([
    "긱뉴스", "요즘it", "모각코", "한국 커뮤니티", "okky", "geeknews",
  ])},
];

/**
 * 외부에서 쓸 수 있는 가용 슬러그 목록 — LLM 시스템 프롬프트에 동적 주입.
 * 정확한 진실은 DB content_categories 테이블이지만, 매처와 동기화된 상수도 노출.
 * SUBCATEGORY_RULES 와 동일한 iteration order 로 반환.
 */
export function getAvailableCategorySlugs(): string[] {
  return SUBCATEGORY_RULES.map((r) => r.slug);
}

/**
 * RawItem 의 title + summary 를 검사해 트랙 / 서브카테고리를 추정한다.
 * 매치가 약하면 undefined 를 반환 → LLM 단계에서 보강.
 */
export function classifyItem(item: RawItem): RuleClassifyResult {
  const text = `${item.title}\n${item.summary ?? ""}`;
  const matched: string[] = [];

  // 1) 트랙 점수 계산
  const scoreByTrack = new Map<string, number>();
  for (const rule of TRACK_RULES) {
    const m = text.match(rule.pattern);
    if (m) {
      scoreByTrack.set(rule.track, (scoreByTrack.get(rule.track) ?? 0) + rule.weight);
      matched.push(m[0].toLowerCase());
    }
  }

  let bestTrack: string | undefined;
  let bestScore = -1;
  for (const [track, score] of scoreByTrack) {
    if (score > bestScore) {
      bestTrack = track;
      bestScore = score;
    }
  }
  const track = bestScore >= MIN_TRACK_SCORE ? bestTrack : undefined;

  // 2) 트랙이 정해졌으면 서브카테고리 매처 — 해당 트랙 한정
  let categorySlug: string | undefined;
  if (track) {
    for (const sub of SUBCATEGORY_RULES) {
      if (sub.track !== track) continue;
      const m = text.match(sub.pattern);
      if (m) {
        categorySlug = sub.slug;
        matched.push(m[0].toLowerCase());
        break;
      }
    }
  }

  return {
    track,
    categorySlug,
    matched: matched.length > 0 ? Array.from(new Set(matched)) : undefined,
  };
}
