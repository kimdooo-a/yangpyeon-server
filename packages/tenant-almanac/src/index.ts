/**
 * @yangpyeon/tenant-almanac — 진입점.
 *
 * PLUGIN-MIG-2 (S98): manifest + 6 handler 본체 export.
 * - manifest: cron runner / route registry 가 dispatch 시 사용.
 * - handlers/*: 직접 호출 가능 (테스트, 운영 콘솔, future tenant 자체 dispatch).
 *
 * 향후 PLUGIN-MIG-3 에서 routes/* 추가, PLUGIN-MIG-4 에서 prisma fragment 별도 보관.
 */
export { default as manifest } from "../manifest";

// 6 handler — 외부에서 직접 import 가능 (테스트 + 운영 콘솔)
export { runRssFetcher } from "./handlers/rss-fetcher";
export { runHtmlScraper } from "./handlers/html-scraper";
export { runApiPoller } from "./handlers/api-poller";
export { runClassifierHandler } from "./handlers/classifier";
export { runPromoterHandler } from "./handlers/promoter";
export { runCleanupHandler } from "./handlers/cleanup";

// PLUGIN-MIG-3 (S99 Chunk B): 5 route handler — namespace export.
// 직접 import 가능 (단위 테스트, 향후 SDK 노출).
export * as categoriesRoute from "./routes/categories";
export * as sourcesRoute from "./routes/sources";
export * as itemsBySlugRoute from "./routes/items-by-slug";
export * as todayTopRoute from "./routes/today-top";
export * as contentsRoute from "./routes/contents";
