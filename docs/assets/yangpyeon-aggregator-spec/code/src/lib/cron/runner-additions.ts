/**
 * yangpyeon Cron Runner — AGGREGATOR 분기 추가 스니펫.
 *
 * ─────────────────────────────────────────────────────────────────────
 * 기존 `src/lib/cron/runner.ts`의 `dispatchCron` 함수에 아래 분기를 추가한다.
 *
 * 삽입 위치:
 *   `if (job.kind === "WEBHOOK") { ... }` 분기 다음,
 *   함수 말미의 `return failure(started, "지원하지 않는 cron kind");` 직전.
 *
 * 추가 import (파일 상단에 한 줄 추가):
 *   import { runAggregatorModule } from "@/lib/aggregator/runner";
 *
 * 사전 조건:
 *   - Prisma `CronKind` enum에 `AGGREGATOR` 값이 추가되어 있어야 함
 *     (schema-additions.prisma 적용 후 마이그레이션 완료).
 *   - `src/lib/aggregator/runner.ts`에 `runAggregatorModule` export가 존재.
 *
 * `payload`의 형태:
 *   {
 *     module: "rss-fetcher" | "html-scraper" | "api-poller" |
 *             "classifier"  | "promoter",
 *     batch?: number   // 한 번에 처리할 행 수 (default는 module별 상수)
 *   }
 * ─────────────────────────────────────────────────────────────────────
 *
 * 또한 `src/lib/types/supabase-clone.ts`의 `CronKindPayload`(union type)에
 * 다음 케이스를 추가한다:
 *
 *   | {
 *       kind: "AGGREGATOR";
 *       module:
 *         | "rss-fetcher"
 *         | "html-scraper"
 *         | "api-poller"
 *         | "classifier"
 *         | "promoter";
 *       batch?: number;
 *     }
 */

// 이 파일은 코드 머지 안내용 스니펫이며, 그대로 import해서 쓰지 않는다.
// (런타임 임포트 시 `runAggregatorModule` 모듈이 없으면 빌드 실패하므로
//  타입 차단을 위해 의도적으로 declare 형태로만 표기.)

declare const job: { kind: string };
declare const payload: { module?: unknown; batch?: unknown };
declare function failure(started: Date, msg: string): unknown;
declare function runAggregatorModule(args: {
  module:
    | "rss-fetcher"
    | "html-scraper"
    | "api-poller"
    | "classifier"
    | "promoter";
  batch?: number;
}): Promise<unknown>;
declare const started: Date;

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
export async function __AGGREGATOR_BRANCH_SNIPPET__(): Promise<unknown> {
  // ──────────────────────────────────────────────────────────────────
  // 아래 블록을 dispatchCron 내부 적절한 위치에 그대로 복사한다.
  // ──────────────────────────────────────────────────────────────────
  if (job.kind === "AGGREGATOR") {
    const moduleName =
      typeof payload.module === "string" ? payload.module : null;
    if (!moduleName) {
      return failure(started, "payload.module 누락");
    }

    const batch =
      typeof payload.batch === "number" && payload.batch > 0
        ? payload.batch
        : undefined;

    const result = await runAggregatorModule({
      module: moduleName as any,
      batch,
    });
    return result;
  }
  // ──────────────────────────────────────────────────────────────────

  return failure(started, "지원하지 않는 cron kind");
}
