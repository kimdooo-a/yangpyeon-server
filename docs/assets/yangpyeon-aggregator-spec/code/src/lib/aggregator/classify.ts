// =============================================================================
// 모듈: aggregator/classify
// 역할: 규칙 기반 트랙 + 서브카테고리 분류기 (LLM 호출 전 1차 판정)
// 출처: Almanac scripts/ingest/classify.ts 의 가중치 매처를 포팅
//       + 서브카테고리 슬러그 40개 매칭 추가
// 정책:
//   - 점수 합산 후 최상위 트랙 채택. MIN_SCORE 미달이면 undefined → LLM에 위임
//   - 서브카테고리는 트랙 매치 후 해당 트랙 한정 키워드만 검사
//   - DB 와 동기화된 슬러그 목록은 getAvailableCategorySlugs() 로도 조회 가능
// =============================================================================

import type { RawItem, RuleClassifyResult } from "./types";

// ----------------------------------------------------------------------------
// 트랙 키워드 매처
// ----------------------------------------------------------------------------

interface KeywordRule {
  track: string;
  pattern: RegExp;
  weight: number;
}

/** 정규식 메타문자 이스케이프 (사용자 키워드 → RegExp 변환 시 안전) */
const REGEX_META = /[.*+?^$(){}|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(REGEX_META, "\\$&");
}

/** 키워드 배열에서 \b…\b 매칭 패턴 한 개를 만든다 */
function compilePattern(terms: string[]): RegExp {
  const escaped = terms.map(escapeRegex).join("|");
  return new RegExp(`\\b(?:${escaped})\\b`, "i");
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
// 서브카테고리 키워드 매처 (40개 슬러그)
// ※ DB content_categories.slug 와 동기화 필수
// ----------------------------------------------------------------------------

interface SubcategoryRule {
  /** 서브카테고리 슬러그 */
  slug: string;
  /** 부모 트랙 */
  track: string;
  /** 검사 패턴 */
  pattern: RegExp;
}

const SUBCATEGORY_RULES: SubcategoryRule[] = [
  // ===== build (10) =====
  { slug: "open-source-llm", track: "build", pattern: compilePattern([
    "llama", "mistral", "qwen", "deepseek", "gemma", "phi-3", "phi-4", "open source model", "오픈소스 모델", "오픈웨이트",
  ])},
  { slug: "ai-companies", track: "build", pattern: compilePattern([
    "openai", "anthropic", "google deepmind", "deepmind", "meta ai", "microsoft ai", "xai", "mistral ai",
  ])},
  { slug: "model-releases", track: "build", pattern: compilePattern([
    "release", "released", "launch", "launches", "announcement", "릴리즈", "공개", "출시",
  ])},
  { slug: "ai-infrastructure", track: "build", pattern: compilePattern([
    "infrastructure", "gpu", "cuda", "nvidia", "tpu", "datacenter", "인프라", "데이터센터",
  ])},
  { slug: "devtools", track: "build", pattern: compilePattern([
    "devtool", "developer tool", "ide", "cli", "sdk", "api", "framework", "개발자 도구",
  ])},
  { slug: "agents", track: "build", pattern: compilePattern([
    "agent", "agentic", "autonomous", "multi-agent", "에이전트",
  ])},
  { slug: "rag-vector", track: "build", pattern: compilePattern([
    "rag", "retrieval", "vector db", "embedding", "pinecone", "weaviate", "벡터", "임베딩",
  ])},
  { slug: "fine-tuning", track: "build", pattern: compilePattern([
    "fine-tune", "fine tuning", "lora", "qlora", "peft", "파인튜닝",
  ])},
  { slug: "ai-safety", track: "build", pattern: compilePattern([
    "safety", "alignment", "red team", "jailbreak", "harm", "안전", "정렬",
  ])},
  { slug: "benchmarks", track: "build", pattern: compilePattern([
    "benchmark", "leaderboard", "eval", "mmlu", "humaneval", "swe-bench", "벤치마크",
  ])},

  // ===== work (5) =====
  { slug: "productivity-tools", track: "work", pattern: compilePattern([
    "notion", "obsidian", "linear", "asana", "todoist", "생산성 도구",
  ])},
  { slug: "automation", track: "work", pattern: compilePattern([
    "zapier", "make.com", "n8n", "workflow", "automation", "자동화", "워크플로우",
  ])},
  { slug: "team-collaboration", track: "work", pattern: compilePattern([
    "slack", "discord", "microsoft teams", "huddle", "회의", "협업",
  ])},
  { slug: "ai-at-work", track: "work", pattern: compilePattern([
    "copilot", "ai assistant", "ai for work", "업무 ai",
  ])},
  { slug: "knowledge-management", track: "work", pattern: compilePattern([
    "second brain", "knowledge base", "wiki", "지식 관리", "노션",
  ])},

  // ===== hustle (7) =====
  { slug: "indie-hackers", track: "hustle", pattern: compilePattern([
    "indie hacker", "solopreneur", "1인 창업", "인디해커",
  ])},
  { slug: "saas-business", track: "hustle", pattern: compilePattern([
    "saas", "subscription", "mrr", "arr", "구독",
  ])},
  { slug: "creator-economy", track: "hustle", pattern: compilePattern([
    "creator", "youtuber", "newsletter", "substack", "patreon", "크리에이터", "뉴스레터",
  ])},
  { slug: "side-projects", track: "hustle", pattern: compilePattern([
    "side project", "side hustle", "weekend project", "사이드프로젝트", "사이드 프로젝트",
  ])},
  { slug: "monetization", track: "hustle", pattern: compilePattern([
    "monetize", "monetization", "pricing", "paywall", "수익화", "유료화",
  ])},
  { slug: "marketing-growth", track: "hustle", pattern: compilePattern([
    "growth hack", "seo", "ads", "마케팅", "그로스",
  ])},
  { slug: "freelance", track: "hustle", pattern: compilePattern([
    "freelance", "contract work", "프리랜서", "외주",
  ])},

  // ===== invest (5) =====
  { slug: "ai-funding", track: "invest", pattern: compilePattern([
    "ai funding", "ai investment", "ai startup raised", "ai 투자",
  ])},
  { slug: "venture-capital", track: "invest", pattern: compilePattern([
    "venture", "vc", "sequoia", "a16z", "y combinator", "ycombinator", "벤처캐피탈",
  ])},
  { slug: "ipo-acquisition", track: "invest", pattern: compilePattern([
    "ipo", "acquisition", "m&a", "merger", "상장", "인수",
  ])},
  { slug: "valuation", track: "invest", pattern: compilePattern([
    "valuation", "unicorn", "decacorn", "밸류에이션", "유니콘",
  ])},
  { slug: "earnings", track: "invest", pattern: compilePattern([
    "earnings", "quarterly", "revenue report", "실적",
  ])},

  // ===== learn (7) =====
  { slug: "research-papers", track: "learn", pattern: compilePattern([
    "arxiv", "paper", "abstract", "preprint", "논문",
  ])},
  { slug: "tutorials", track: "learn", pattern: compilePattern([
    "tutorial", "step by step", "how-to", "how to", "튜토리얼", "따라하기",
  ])},
  { slug: "deep-dives", track: "learn", pattern: compilePattern([
    "deep dive", "in depth", "분석", "해부",
  ])},
  { slug: "courses", track: "learn", pattern: compilePattern([
    "course", "mooc", "coursera", "udemy", "강의", "강좌",
  ])},
  { slug: "guides", track: "learn", pattern: compilePattern([
    "guide", "primer", "cheatsheet", "가이드", "치트시트",
  ])},
  { slug: "case-studies", track: "learn", pattern: compilePattern([
    "case study", "postmortem", "사례", "케이스 스터디",
  ])},
  { slug: "explainers", track: "learn", pattern: compilePattern([
    "explained", "explainer", "intuition", "쉽게 풀어",
  ])},

  // ===== community (6) =====
  { slug: "hiring", track: "community", pattern: compilePattern([
    "hiring", "we're hiring", "채용", "구인",
  ])},
  { slug: "layoffs", track: "community", pattern: compilePattern([
    "layoff", "job cut", "정리해고", "구조조정",
  ])},
  { slug: "conferences", track: "community", pattern: compilePattern([
    "conference", "summit", "expo", "컨퍼런스",
  ])},
  { slug: "hackathons", track: "community", pattern: compilePattern([
    "hackathon", "jam", "해커톤",
  ])},
  { slug: "meetups", track: "community", pattern: compilePattern([
    "meetup", "gathering", "모임",
  ])},
  { slug: "open-positions", track: "community", pattern: compilePattern([
    "open role", "job opening", "포지션",
  ])},
];

/**
 * 외부에서 쓸 수 있는 가용 슬러그 목록 — LLM 시스템 프롬프트에 동적 주입.
 * 정확한 진실은 DB content_categories 테이블이지만, 매처와 동기화된 상수도 노출.
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
