// =============================================================================
// 모듈: aggregator/types
// 역할: 크롤러 파이프라인 전반에서 공유되는 공통 타입 정의
// 컨벤션: 영어 식별자 + 한국어 주석. Prisma 모델은 별도로 import (순환 회피)
// 출처: docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/types.ts
// 변경 (multi-tenant 적응):
//   - DB 의존 없음 → spec 그대로 복사 (변경 0)
// =============================================================================

/**
 * fetcher가 외부 소스에서 추출한 원본 아이템.
 * DB INSERT 직전 상태이며 분류 정보가 아직 없음.
 */
export interface RawItem {
  /** 정규화 전 원본 URL */
  url: string;
  /** 기사 제목 */
  title: string;
  /** 짧은 요약 / 디스크립션 (텍스트만) */
  summary?: string;
  /** 원문 HTML (50KB 이내로 잘라 저장) */
  contentHtml?: string;
  /** 작성자 이름 */
  author?: string;
  /** 썸네일 이미지 URL */
  imageUrl?: string;
  /** 게시 시각 */
  publishedAt?: Date;
  /** fetcher 별 원본 페이로드 일부 (디버깅용) */
  raw?: Record<string, unknown>;
}

/**
 * 분류기/LLM 후처리를 거친 아이템.
 * urlHash 가 채워지며 suggestedTrack/suggestedCategorySlug 가 옵션으로 부여됨.
 */
export interface EnrichedItem extends RawItem {
  /** sha256(canonicalize(url)) 의 hex 문자열 */
  urlHash: string;
  /** 6개 메인 트랙 (hustle|work|build|invest|learn|community 등) */
  suggestedTrack?: string;
  /** content_categories.slug 와 매칭되는 서브카테고리 슬러그 */
  suggestedCategorySlug?: string;
  /** LLM 또는 규칙 기반 한국어 요약 */
  aiSummary?: string;
  /** 2~5개 정도의 태그 배열 */
  aiTags?: string[];
  /** ISO 639-1 언어 코드 (ko/en/ja/zh ...) */
  aiLanguage?: string;
}

/**
 * 단일 소스 fetch 사이클의 보고서.
 * cron runner 가 이 보고서를 모아 audit_logs 에 적재.
 */
export interface FetchReport {
  sourceId: number;
  sourceSlug: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  errors: string[];
  durationMs: number;
}

/**
 * AGGREGATOR cron job 분기 키.
 * cron payload.module 으로 전달되어 runner.ts 에서 디스패치.
 *
 * cleanup (S84+ 추가): 기존 SQL kind 의 readonly 풀 한계 회피 — 30일 경과
 * rejected/duplicate ingested 행을 tenant-scoped 로 삭제. aggregator/cleanup.ts.
 */
export type AggregatorModule =
  | "rss-fetcher"
  | "html-scraper"
  | "api-poller"
  | "classifier"
  | "promoter"
  | "cleanup";

/**
 * runner 가 cron 에 반환하는 표준 결과 포맷.
 * status / durationMs / message 만 노출하여 cron 로그와 일관 유지.
 */
export interface AggregatorRunResult {
  status: "SUCCESS" | "FAILURE" | "TIMEOUT";
  durationMs: number;
  message?: string;
}

/**
 * classifier 결과 — 규칙 매처가 반환.
 * 둘 다 undefined 면 LLM 단계에서 보강.
 */
export interface RuleClassifyResult {
  track?: string;
  categorySlug?: string;
  /** 매치된 키워드 (디버깅용, DB 저장용 X) */
  matched?: string[];
}
