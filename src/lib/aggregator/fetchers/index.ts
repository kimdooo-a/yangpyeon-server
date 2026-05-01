// =============================================================================
// 모듈: aggregator/fetchers/index
// 역할: ContentSource.kind 별 fetcher 디스패처 — runner 의 단일 진입점
// kind 값:
//   - RSS       → fetchRss
//   - HTML      → fetchHtml
//   - API       → fetchApi (parserConfig.adapter 로 추가 분기)
//   - FIRECRAWL → fetchFirecrawl (단일 URL 동적 스크랩)
// 출처: docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/fetchers/index.ts
// 변경 (multi-tenant 적응):
//   - DB 의존 0 → spec 그대로 복사 (변경 0)
// =============================================================================

import type { ContentSource } from "@/generated/prisma/client";
import type { RawItem } from "../types";
import { fetchRss } from "./rss";
import { fetchHtml } from "./html";
import { fetchApi, fetchFirecrawl } from "./api";

export { fetchRss } from "./rss";
export { fetchHtml } from "./html";
export {
  fetchApi,
  fetchHnAlgolia,
  fetchReddit,
  fetchProductHunt,
  fetchArxiv,
  fetchFirecrawl,
} from "./api";

/**
 * ContentSource.kind 에 따라 적절한 fetcher 호출.
 * 알 수 없는 kind 면 빈 배열 반환 (방어적 — runner 에서 에러 로깅).
 */
export async function fetchSource(source: ContentSource): Promise<RawItem[]> {
  switch (source.kind) {
    case "RSS":
      return fetchRss(source);
    case "HTML":
      return fetchHtml(source);
    case "API":
      return fetchApi(source);
    case "FIRECRAWL":
      return fetchFirecrawl(source);
    default:
      console.error(
        `[fetchers] 알 수 없는 source.kind: ${String(source.kind)} (source #${source.id})`,
      );
      return [];
  }
}
