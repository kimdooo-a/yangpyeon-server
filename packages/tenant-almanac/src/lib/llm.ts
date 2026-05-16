// =============================================================================
// 모듈: aggregator/llm
// 역할: Gemini Flash 호출 래퍼 — throttle + 일일 한도 + JSON 파싱 안전화
// 출처: docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/llm.ts
// 변경 (multi-tenant 적응):
//   - DB 의존 0 → spec 그대로 복사 (변경 0)
//   - classifyItem / urlHash 는 이미 multi-tenant aware 한 dedupe·classify 모듈 사용
// 정책:
//   - 무료 티어 10 RPM 보호: 호출 간 6.5초 간격
//   - 일일 한도 초과 → 호출 스킵 + 규칙 결과만 (graceful degradation)
//   - JSON 파싱 실패도 무시 — 파이프라인은 계속
// =============================================================================

import { GoogleGenAI } from "@google/genai";
import type { EnrichedItem, RawItem } from "./types";
import { classifyItem, getAvailableCategorySlugs } from "./classify";
import { urlHash } from "./dedupe";

const MODEL = "gemini-2.5-flash";

/** 호출 간 최소 간격 (10 RPM 무료 티어 + 0.5초 버퍼) */
const MIN_INTERVAL_MS = 6500;

/** 일일 한도 (환경변수로 조정 가능, 기본 200) */
const DEFAULT_DAILY_BUDGET = 200;

/** 7개 트랙 화이트리스트 — Gemini 응답 검증용 */
const VALID_TRACKS: ReadonlyArray<string> = [
  "hustle",
  "work",
  "build",
  "invest",
  "learn",
  "tools",
  "community",
];

// ----------------------------------------------------------------------------
// 클라이언트 / throttle / 카운터 상태
// ----------------------------------------------------------------------------

let client: GoogleGenAI | null = null;
let lastCallAt = 0;

const counter = {
  date: todayKey(),
  used: 0,
};

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function ensureCounterFresh(): void {
  const today = todayKey();
  if (counter.date !== today) {
    counter.date = today;
    counter.used = 0;
  }
}

function getDailyBudget(): number {
  const raw = process.env.AGGREGATOR_LLM_DAILY_BUDGET;
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_DAILY_BUDGET;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_BUDGET;
}

function getClient(): GoogleGenAI | null {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  client = new GoogleGenAI({ apiKey });
  return client;
}

// ----------------------------------------------------------------------------
// 시스템 프롬프트
// ----------------------------------------------------------------------------

function buildSystemInstruction(): string {
  const slugs = getAvailableCategorySlugs();
  const slugList = slugs.join(", ");
  return `당신은 콘텐츠 분류 전문가입니다. 입력된 제목과 요약을 보고 다음 JSON을 반환하세요.

{
  "track": "hustle|work|build|invest|learn|community",
  "subcategorySlug": "<아래 슬러그 중 하나 또는 null>",
  "summary": "한국어 2-3줄 요약 (왜 중요한지 포함)",
  "tags": ["태그1", "태그2", "태그3"],
  "language": "ko|en|ja|zh|기타"
}

가용 subcategorySlug 목록:
${slugList}

규칙:
- track 은 위 7개 중 정확히 하나, 애매하면 가장 가까운 것
- subcategorySlug 는 위 목록에서 정확히 일치하는 슬러그여야 함. 매치가 없으면 null
- summary 는 마크다운 없이 평문, 200자 이내
- tags 는 2~5개, 소문자 또는 한글 단어
- 반드시 유효한 JSON 만 출력. 코드펜스/설명 금지`;
}

// ----------------------------------------------------------------------------
// 핵심 함수
// ----------------------------------------------------------------------------

interface GeminiPayload {
  track?: unknown;
  subcategorySlug?: unknown;
  summary?: unknown;
  tags?: unknown;
  language?: unknown;
}

/**
 * 단일 RawItem 을 LLM 으로 보강해 EnrichedItem 을 만든다.
 *  - 우선 규칙 분류기로 1차 결과 확보
 *  - 한도/throttle 통과 시 Gemini 호출 → 결과 병합
 *  - LLM 결과가 잘못되면 규칙 결과만 적용
 */
export async function enrichItem(item: RawItem): Promise<EnrichedItem> {
  const ruleResult = classifyItem(item);
  const baseEnriched: EnrichedItem = {
    ...item,
    urlHash: urlHash(item.url),
    suggestedTrack: ruleResult.track,
    suggestedCategorySlug: ruleResult.categorySlug,
  };

  ensureCounterFresh();
  const budget = getDailyBudget();
  if (counter.used >= budget) {
    return baseEnriched;
  }

  const c = getClient();
  if (!c) return baseEnriched;

  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastCallAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();

  const userPrompt = `제목: ${item.title}\n\n요약/본문: ${item.summary ?? "(요약 없음)"}`;

  try {
    const response = await c.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: buildSystemInstruction(),
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    counter.used += 1;

    const text = response.text;
    if (!text) return baseEnriched;

    let parsed: GeminiPayload;
    try {
      parsed = JSON.parse(text) as GeminiPayload;
    } catch (err) {
      console.error("[llm] JSON 파싱 실패:", (err as Error).message);
      return baseEnriched;
    }

    const track =
      typeof parsed.track === "string" && VALID_TRACKS.includes(parsed.track)
        ? parsed.track
        : ruleResult.track;

    const slugs = new Set(getAvailableCategorySlugs());
    const subSlug =
      typeof parsed.subcategorySlug === "string" && slugs.has(parsed.subcategorySlug)
        ? parsed.subcategorySlug
        : ruleResult.categorySlug;

    const aiSummary =
      typeof parsed.summary === "string" ? parsed.summary.slice(0, 2000) : undefined;
    const aiTags = Array.isArray(parsed.tags)
      ? parsed.tags
          .slice(0, 8)
          .map((t) => String(t))
          .filter(Boolean)
      : undefined;
    const aiLanguage =
      typeof parsed.language === "string" ? parsed.language.slice(0, 10) : undefined;

    return {
      ...baseEnriched,
      suggestedTrack: track,
      suggestedCategorySlug: subSlug,
      aiSummary,
      aiTags,
      aiLanguage,
    };
  } catch (err) {
    console.error("[llm] enrichItem 실패:", (err as Error).message);
    return baseEnriched;
  }
}

/** 디버깅/테스트용: 현재 카운터 상태 노출 */
export function getLlmStats(): { date: string; used: number; budget: number } {
  ensureCounterFresh();
  return { date: counter.date, used: counter.used, budget: getDailyBudget() };
}
