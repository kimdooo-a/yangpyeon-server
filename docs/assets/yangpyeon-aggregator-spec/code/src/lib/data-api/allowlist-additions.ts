/**
 * yangpyeon Data-API 화이트리스트 — Aggregator 신규 테이블 4개 추가 엔트리.
 *
 * 적용 방법 (택1):
 *   (a) 기존 `src/lib/data-api/allowlist.ts`의 `DATA_API_ALLOWLIST` 객체에
 *       아래 키-값을 그대로 추가한다.
 *   (b) 또는 import해서 spread로 머지한다:
 *
 *         import { DATA_API_ALLOWLIST as BASE } from "@/lib/data-api/allowlist";
 *         import { AGGREGATOR_ALLOWLIST } from "@/lib/data-api/allowlist-additions";
 *         export const DATA_API_ALLOWLIST = { ...BASE, ...AGGREGATOR_ALLOWLIST };
 *
 * 노출 정책:
 *   - 신규 테이블은 ADMIN/MANAGER 읽기 전용. 일반 USER는 ContentCategory만 읽기 허용.
 *   - 외부(Almanac 등) 노출은 `/api/v1/almanac/*` 전용 라우트 경유로만.
 *     Data-API 직접 노출 금지 (writeRoles=ADMIN으로 제한).
 *
 * NOTE — yangpyeon 기존 allowlist 엔트리의 `readRoles`/`writeRoles`/`exposedColumns`
 *        키 이름이 다른 경우(예: `read`/`write`), 아래 형태도 그에 맞게 조정한다.
 */

export const AGGREGATOR_ALLOWLIST = {
  ContentSource: {
    table: "ContentSource",
    readRoles: ["ADMIN", "MANAGER"],
    writeRoles: ["ADMIN"],
    exposedColumns: [
      "id",
      "slug",
      "name",
      "url",
      "kind",
      "defaultTrack",
      "country",
      "active",
      "consecutiveFailures",
      "lastFetchedAt",
      "lastSuccessAt",
      "lastError",
      "createdAt",
      "updatedAt",
    ],
  },
  ContentCategory: {
    table: "ContentCategory",
    readRoles: ["ADMIN", "MANAGER", "USER"],
    writeRoles: ["ADMIN"],
    exposedColumns: [
      "id",
      "track",
      "slug",
      "name",
      "nameEn",
      "description",
      "icon",
      "sortOrder",
    ],
  },
  ContentIngestedItem: {
    table: "ContentIngestedItem",
    readRoles: ["ADMIN", "MANAGER"],
    writeRoles: ["ADMIN"],
    exposedColumns: [
      "id",
      "sourceId",
      "url",
      "title",
      "summary",
      "status",
      "suggestedTrack",
      "suggestedCategorySlug",
      "fetchedAt",
      "processedAt",
      "errorMsg",
      "qualityFlag",
      "reviewedById",
      "reviewedAt",
      "reviewNote",
    ],
  },
  ContentItem: {
    table: "ContentItem",
    readRoles: ["ADMIN", "MANAGER"],
    writeRoles: ["ADMIN"],
    exposedColumns: [
      "id",
      "slug",
      "title",
      "track",
      "categoryId",
      "url",
      "language",
      "score",
      "pinned",
      "featured",
      "qualityFlag",
      "viewCount",
      "publishedAt",
    ],
  },
} as const;

export type AggregatorAllowlistKey = keyof typeof AGGREGATOR_ALLOWLIST;
