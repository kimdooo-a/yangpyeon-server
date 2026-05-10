# 인수인계서 — 세션 98 후속 (PLUGIN-MIG-2 + 5)

> 작성일: 2026-05-10
> 이전 세션: [session 98 (INFRA-2 + PLUGIN-MIG-1)](./260510-session98-infra-2-plugin-mig-1.md)
> 본 chunk: 동일 세션 98 의 후속 — 다른 터미널이 위 인수인계서 commit `727bb24` 직후 이 터미널이 PLUGIN-MIG-2 + 5 본격 이전 작업 진입. S96 의 후속/후속-2 패턴 정합.

---

## 작업 요약

PLUGIN-MIG-2 (6 almanac 핸들러 본체 추출) + PLUGIN-MIG-5 (cron runner generic dispatch — `@yangpyeon/core` dispatcher registry 정착, AGGREGATOR 분기를 manifest dispatch 로 교체) 한 commit 마감. ADR-022 7원칙 #4 "컨슈머 추가는 코드 수정 0줄" 의 cron 레이어 현실화. PLUGIN-MIG-3/4 는 다음 세션 권장 (PR 게이트 #4 live test 필수, 묶어서 한 chunk 처리 권장).

## 대화 다이제스트

### 토픽 1: 후속 chunk 진입 결정 — 다른 터미널과 영역 분리

> **사용자**: "다른 터미널에서 세션 종료 진행중이라서 이 터미널은 남은 단계 진행 바람."

베이스라인 검증 즉시 적용 (`feedback_concurrent_terminal_overlap`):
- `git log --oneline -10` + `git status --short` 로 다른 터미널의 commit `727bb24` (docs S98 마감) + `b5bed64` (CK memory) 가 origin push 완료 확인
- HEAD = `b5bed64`, tree = local PLUGIN-MIG-2/5 작업분 잔존
- 영역 분리: 다른 터미널 = docs/ 영역 / 이 터미널 = src/ + packages/ — 충돌 0

**결론**: PLUGIN-MIG-2~5 4 phase 진행. 우선순위 평가:
- MIG-2 (핸들러 추출) + MIG-5 (cron runner generic dispatch) = tightly coupled functional unit
- MIG-3 (라우트 이전) = 단독 시 functional 변화 0 (Next.js App Router 파일 시스템 기반)
- MIG-4 (Prisma fragment + RLS) = PR 게이트 #4 live non-BYPASSRLS 테스트 필수, 가장 위험

→ **MIG-2/5 한 commit 마감, MIG-3/4 다음 세션** 결정.

### 토픽 2: PLUGIN-MIG-2 — 6 almanac 핸들러 본체 추출

기존 구조: `src/lib/aggregator/runner.ts:runAggregatorModule(ctx, payload)` 가 payload.module 별로 6 almanac 핸들러 + 1 messenger 핸들러로 분기 (private helper 함수 호출).

추출 설계 결정:
- **handlers/**: 6 almanac 핸들러 진입점 (rss-fetcher / html-scraper / api-poller / classifier / promoter / cleanup)
- **lib/fetcher-pipeline.ts**: RSS/HTML/API 3 fetcher 가 공유하는 logic — runFetchersByKind + processSingleSource + markSourceFailure + buildPendingRow
- **support libs (dedupe/fetchers/llm/promote/cleanup) 잔존**: 5 Content* Prisma 모델이 글로벌 schema 잔존이라 PLUGIN-MIG-4 와 동시 이동이 import path 1번에 정리됨. PLUGIN-MIG-1 의 .gitkeep 안내가 "전체 이동" 으로 forecast 했지만 incremental 분리 채택 (CLAUDE.md 의 "기존 동작 100% 유지, 점진적 적용" 원칙 정합).
- **messenger-attachments-deref 분리**: almanac 외 도메인 (messenger 는 모든 tenant 에 공통) → core handler 로 분리 (MIG-5 에서 처리)

**시그니처 차이 → adapter 패턴**:
- 기존 `runAggregatorModule(ctx, payload) → AggregatorRunResult({ status: "SUCCESS"|"FAILURE"|"TIMEOUT", durationMs, message? })`
- manifest 의 `TenantCronHandler(payload, ctx) → TenantCronResult({ ok, processedCount?, errorMessage? })`
- manifest.ts 안의 `adapt(fn)` 헬퍼: `status === "SUCCESS" → ok=true`, 그 외 `errorMessage = message`. processedCount 는 message 가 freeform 이라 안전한 파싱 어려움 → undefined (향후 enhancement).

**결론**: 6 handler + fetcher-pipeline.ts 신설 (~280 LOC). manifest.ts = `enabled: true`, todoHandler stub → 실제 handler invoke. src/lib/aggregator/runner.ts 326 → 97줄 (thin dispatcher, messenger-attachments-deref 잔존).

### 토픽 3: PLUGIN-MIG-5 — cron runner generic dispatch + globalThis singleton registry

기존 cron/runner.ts 의 `dispatchAggregatorOnMain` 이 `payload.module` 을 알고 있어 aggregator 도메인-coupled. PLUGIN-MIG-5 는 이를 generic 으로 교체.

설계:
- `packages/core/src/tenant/dispatcher.ts` 신설 — 3축 API:
  - `registerTenant(manifest)` / `registerCoreHandler(name, handler)` (부팅 시)
  - `getTenantManifest(id)` / `getCoreHandler(name)` (조회 — 디버깅/관측)
  - `dispatchTenantHandler(name, payload, ctx)` (cron runner 진입점)
- **registry = globalThis 싱글턴** (memory rule `project_workspace_singleton_globalthis` 정합) — Turbopack chunk 복제 환경에서 dispatch 가 서로 다른 registry 를 보지 않도록 globalThis 한 자리에서 관리. cron registry / Prisma client 의 기존 패턴과 동일.
- **dispatchTenantHandler 우선순위**: (1) core handler map → (2) tenant manifest cronHandlers → (3) ok=false + 에러 메시지. 동일 모듈 이름 충돌 시 core 우선 (운영-level cron 보장).

bootstrap:
- `src/lib/tenant-bootstrap.ts` 신설 — import 시 side-effect 로 almanac manifest + messenger-attachments-deref core handler 등록.
- cron/runner.ts top-level `import "@/lib/tenant-bootstrap"` 1줄로 dispatcher 진입 전 등록 보장.

cron/runner.ts 변경:
- `dispatchAggregatorOnMain(payload, tenantId, started)` → `dispatchTenantHandlerOnMain(payload, tenantId, started)` (generic)
- 내부 = payload.module 추출 + `dispatchTenantHandler(name, payload, { tenantId })` 호출 + TenantCronResult → CronRunResult 매핑 (ok=true → SUCCESS, ok=false → FAILURE, processedCount → "processed=N" 메시지)
- AGGREGATOR string label 만 보존 (DB cron_jobs.kind 컬럼). 향후 "TENANT" rename 가능 (별도 ADR + DB 마이그레이션 영역).

**결론**: cron/runner.ts 가 더 이상 aggregator 도메인 / module 이름 모름. 향후 jobboard 추가 시 cron/runner.ts 변경 0줄 — `tenant-bootstrap.ts` 에 register 1-2줄 + jobboard manifest 정의만.

### 토픽 4: 테스트 갱신 + boundary 이동

- **dispatcher.test.ts 신규 11 케이스**: registerTenant + getTenantManifest 라이프사이클 (4) / registerCoreHandler 라이프사이클 (2) / dispatchTenantHandler 우선순위 (5: core 우선 / tenant 미등록 / disabled / handler 미등록 / 정상 dispatch).
- **cron-aggregator-dispatch.test.ts 갱신**: mock boundary `@/lib/aggregator/runner` → `@yangpyeon/core` dispatchTenantHandler 로 이동.
  - **importOriginal 부분 mock 패턴**: `@yangpyeon/core` 의 dispatchTenantHandler 만 mock, 나머지(defineTenant/registerTenant/registerCoreHandler)는 actual 유지 — bootstrap chain 의 import-time side-effect 가 깨지지 않음.
  - 5 testcase 보존 (모듈 dispatch / module 누락 / tenantId 전달 / payload 전달 / FAILURE 매핑).
- **manifest.test.ts 갱신**: enabled=true 반영 + handler invoke 검증 (mock 으로 DB 의존 회피, 6 핸들러 모두 vi.mock 처리). 테스트 6개로 +1 증가 (FAILURE adapter 케이스 추가).

**결론**: vitest **821 PASS / 94 skip / 0 회귀** (직전 baseline 810 → +11 신규).

### 토픽 5: 검증 + commit & push

- vitest 4.1.4: 821 PASS / 94 skipped / 73 test files (66 passed + 7 skipped).
- tsc --noEmit: 0 errors (S82 이후 깨끗 상태 유지).
- PR 게이트 5항목 자동 통과:
  1. 신규 모델 = N/A (모델 변경 0)
  2. 신규 라우트 = N/A (라우트는 PLUGIN-MIG-3)
  3. Prisma 호출 = tenantPrismaFor closure 패턴 보존
  4. non-BYPASSRLS 라이브 = N/A (DB 변경 0)
  5. timezone = 변경 0
- commit `f7a0253` 19 files +1030/-413 → push 성공 (b5bed64 → f7a0253).

### 토픽 6: PLUGIN-MIG-3 단독 가치 평가

5 almanac 라우트 (categories / sources / today-top / items / contents) + catch-all = 928줄. 단독 이전 시:
- Next.js App Router 가 파일 시스템 기반이라 src/app/api/v1/t/[tenant]/ 위치는 라우트 등록 필수 — 옮겨도 thin re-export 만 남기는 식
- 모델은 글로벌 schema 잔존이라 packages/tenant-almanac/src/routes/ 라도 import 는 `@/generated/prisma/client`
- functional 변화 0 = 회귀 위험만 존재

→ PLUGIN-MIG-4 (Prisma fragment + tenantId backfill + RLS) 와 묶어 "모델 이동 시 라우트 자연 동반" 패턴이 변경 1번에 정리. **다음 세션 권장**.

### 토픽 7: PLUGIN-MIG-4 위험 평가

PR 게이트 #4 = non-BYPASSRLS 라이브 테스트 필수. 5 Content* 모델 → fragment + tenantId backfill + RLS 정책 + 마이그레이션 deploy + 운영 DB 검증. 단계별 위험:
- 모델 fragment 분리: tsc/Prisma generate 영향 광범위
- tenantId backfill: 기존 row 의 tenantId 값 결정 — `'default'` sentinel 사용 (memory rule `project_tenant_default_sentinel`)
- RLS 정책 추가: 5 모델 × 4 op (SELECT/INSERT/UPDATE/DELETE) = 20 정책
- 마이그레이션 deploy: `wsl -- prisma migrate deploy` 직접 적용 (memory rule `feedback_migration_apply_directly`)
- 운영 DB 검증: app_admin GRANT 도 검증 필수 (S88 4 latent bug 패턴, memory rule `feedback_grant_check_for_bypassrls_roles`)

→ **본 세션 보류 = 가장 위험한 단계**, 다음 세션에서 신중히.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | MIG-2/5 한 commit, MIG-3/4 다음 세션 | (A) 4 phase 일괄 / (B) 2+2 분리 / (C) 단계별 separate commit | (B) — MIG-2/5 tightly coupled, MIG-3 단독 functional 변화 0, MIG-4 PR 게이트 #4 live test 필요 = 가장 위험 |
| 2 | support libs 잔존 (PLUGIN-MIG-4 까지) | (A) 전체 이동 (.gitkeep forecast) / (B) 입구만 이동 | (B) — 5 Content* 모델 글로벌 schema 잔존, MIG-4 와 동시 이동이 import path 1번 정리 (CLAUDE.md "점진적 적용" 정합) |
| 3 | messenger-attachments-deref core handler 분리 | (A) almanac 안에 둠 / (B) core handler map 분리 | (B) — messenger 는 tenant 비특정, almanac 도메인 아님. 분리하지 않으면 잘못된 매니페스트 의존성 |
| 4 | registry = globalThis 싱글턴 | (A) module-local Map / (B) globalThis 싱글턴 | (B) — Turbopack chunk 복제 환경에서 분기 방지 (memory rule `project_workspace_singleton_globalthis`). 기존 cron registry / Prisma client 패턴과 동일 |
| 5 | bootstrap = import 시 side-effect | (A) 명시적 init() 호출 / (B) side-effect import | (B) — cron/runner.ts top-level 1줄 import 으로 보장. 새 컨슈머 추가 = bootstrap.ts 1-2줄 |
| 6 | 부분 mock = importOriginal 패턴 | (A) 전체 export 직접 mock / (B) importOriginal spread | (B) — bootstrap chain 의 import-time side-effect 보존. defineTenant/registerTenant 등은 actual 유지, dispatchTenantHandler 만 mock |

## 수정 파일 (19개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `packages/core/src/tenant/dispatcher.ts` | (신규) globalThis 싱글턴 registry + dispatchTenantHandler |
| 2 | `packages/core/src/tenant/dispatcher.test.ts` | (신규) 11 testcase — registry 라이프사이클 + 우선순위 |
| 3 | `packages/core/src/tenant/index.ts` | dispatcher API 9개 export 추가 |
| 4 | `packages/core/src/index.ts` | dispatcher API 9개 re-export 추가 |
| 5 | `packages/tenant-almanac/manifest.ts` | enabled=true + 6 handler wire-up + adapt 헬퍼 |
| 6 | `packages/tenant-almanac/src/index.ts` | 6 handler export 추가 |
| 7 | `packages/tenant-almanac/src/manifest.test.ts` | enabled=true + handler invoke 검증으로 갱신 (+1 testcase) |
| 8 | `packages/tenant-almanac/src/handlers/rss-fetcher.ts` | (신규) runRssFetcher = runFetchersByKind(ctx, ["RSS"]) |
| 9 | `packages/tenant-almanac/src/handlers/html-scraper.ts` | (신규) runHtmlScraper = runFetchersByKind(ctx, ["HTML"]) |
| 10 | `packages/tenant-almanac/src/handlers/api-poller.ts` | (신규) runApiPoller = runFetchersByKind(ctx, ["API","FIRECRAWL"]) |
| 11 | `packages/tenant-almanac/src/handlers/classifier.ts` | (신규) runClassifierHandler — pending → ready, batch 인자 |
| 12 | `packages/tenant-almanac/src/handlers/promoter.ts` | (신규) runPromoterHandler → promotePending(ctx, batch) |
| 13 | `packages/tenant-almanac/src/handlers/cleanup.ts` | (신규) runCleanupHandler → runCleanup(ctx) |
| 14 | `packages/tenant-almanac/src/lib/fetcher-pipeline.ts` | (신규) runFetchersByKind + processSingleSource + markSourceFailure + buildPendingRow |
| 15 | `packages/tenant-almanac/src/handlers/.gitkeep` | (삭제) PLUGIN-MIG-1 골격 placeholder 더 이상 불필요 |
| 16 | `src/lib/aggregator/runner.ts` | 326 → 97줄 thin dispatcher (almanac 핸들러 위임 + messenger-attachments-deref 잔존) |
| 17 | `src/lib/cron/runner.ts` | dispatchAggregatorOnMain → dispatchTenantHandlerOnMain (generic). top-level `import "@/lib/tenant-bootstrap"` 1줄 |
| 18 | `src/lib/tenant-bootstrap.ts` | (신규) almanac manifest + messenger-attachments-deref core handler 등록 |
| 19 | `tests/cron/cron-aggregator-dispatch.test.ts` | mock boundary `@/lib/aggregator/runner` → `@yangpyeon/core`. importOriginal 부분 mock 채택 |

## 상세 변경 사항

### 1. dispatcher.ts — globalThis 싱글턴 registry

3축 API:
- `registerTenant(manifest)` / `unregisterTenant(id)` / `getTenantManifest(id)` / `listTenantManifests()`
- `registerCoreHandler(name, handler)` / `unregisterCoreHandler(name)` / `getCoreHandler(name)`
- `clearTenantRegistry()` (테스트용 — 운영 코드 사용 금지)
- `dispatchTenantHandler(moduleName, payload, ctx)` — 우선순위 lookup

state() 함수가 `globalThis.__yangpyeonTenantRegistry` 를 lazy 초기화 (Maps × 2).

### 2. tenant-bootstrap.ts — import 시 side-effect 등록

```ts
import { registerTenant, registerCoreHandler } from "@yangpyeon/core";
import { manifest as almanacManifest } from "@yangpyeon/tenant-almanac";
import { runMessengerAttachmentCleanup } from "@/lib/messenger/attachment-cleanup";

registerTenant(almanacManifest);

const messengerAttachmentsDerefHandler: TenantCronHandler = async (_, ctx) => {
  const result = await runMessengerAttachmentCleanup(ctx);
  return { ok: true, processedCount: result.dereferenced };
};
registerCoreHandler("messenger-attachments-deref", messengerAttachmentsDerefHandler);
```

cron/runner.ts top-level `import "@/lib/tenant-bootstrap"` 1줄로 dispatcher 진입 전 등록 보장.

### 3. cron/runner.ts dispatchTenantHandlerOnMain — generic

```ts
async function dispatchTenantHandlerOnMain(payload, tenantId, started): Promise<CronRunResult> {
  const moduleName = typeof payload.module === "string" ? payload.module : null;
  if (!moduleName) return failure(started, "payload.module 누락");

  const result = await dispatchTenantHandler(moduleName, payload, { tenantId });

  if (result.ok) {
    return {
      status: "SUCCESS",
      durationMs: Date.now() - started,
      message: typeof result.processedCount === "number" ? `processed=${result.processedCount}` : undefined,
    };
  }
  return { status: "FAILURE", durationMs: Date.now() - started, message: result.errorMessage };
}
```

aggregator 도메인 / module 이름 모름. AGGREGATOR string label 만 보존.

### 4. manifest.ts — adapt 헬퍼

```ts
function adapt(
  fn: (ctx: TenantContext, payload?: Record<string, unknown>) => Promise<AggregatorRunResult>,
): TenantCronHandler {
  return async (payload, ctx) => {
    const result = await fn(ctx, payload);
    return {
      ok: result.status === "SUCCESS",
      errorMessage: result.status === "SUCCESS" ? undefined : result.message,
    };
  };
}

export default defineTenant({
  id: "almanac",
  enabled: true,
  cronHandlers: {
    "rss-fetcher": adapt(runRssFetcher),
    "html-scraper": adapt(runHtmlScraper),
    ...
  },
  ...
});
```

### 5. fetcher-pipeline.ts — RSS/HTML/API 공유

src/lib/aggregator/runner.ts 의 private helper (runFetchersByKind / processSingleSource / markSourceFailure / buildPendingRow) 를 동일 로직 그대로 이전. 외부 의존 (fetchSource / dedupeAgainstDb / urlHash) 은 PLUGIN-MIG-4 까지 src/lib/aggregator/ 잔존이라 그대로 import.

`startedAt` 인자 제거 (handler 분리 후 단일 진입점 = 함수 안에서 `Date.now()` 캡처).

### 6. dispatcher.test.ts — 11 testcase

- registerTenant + getTenantManifest 라이프사이클 (4): 등록 후 조회 / unregister / list / 동일 id 재등록 덮어쓰기
- registerCoreHandler 라이프사이클 (2)
- dispatchTenantHandler 우선순위 (5): core 우선 / tenant 미등록 / disabled / handler 미등록 / 정상 dispatch

beforeEach `clearTenantRegistry()` 로 글로벌 싱글턴 격리.

## 검증 결과

- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — **821 PASS / 94 skipped / 0 failed** (직전 baseline 810 → +11 신규, 0 회귀)
- `git push origin spec/aggregator-fixes` — 성공 (b5bed64 → f7a0253, 1 commit ahead → 0 commit ahead)

## 터치하지 않은 영역

- **PLUGIN-MIG-3** (5 라우트 928줄) — 다음 세션, MIG-4 와 묶어 권장 (모델 이동 시 라우트 자연 동반)
- **PLUGIN-MIG-4** (Prisma fragment + tenantId backfill + RLS) — PR 게이트 #4 live test 필수, 가장 위험 — 단독 chunk 권장
- `src/lib/aggregator/{dedupe,fetchers,llm,promote,cleanup,types}.ts` — PLUGIN-MIG-4 에서 모델 이동과 동시 처리
- FILE-UPLOAD-MIG sweep (~30분)
- 사용자 carry-over (S88-USER-VERIFY 휴대폰 + S86-SEC-1 GitHub Settings)
- 운영자 carry-over (S87-RSS-ACTIVATE + S87-TZ-MONITOR + cron MA-ENABLE)
- 다른 터미널의 docs S98 마감 commit `727bb24` + CK memory `b5bed64` (영역 분리 보존)

## 알려진 이슈

- 없음 (PLUGIN-MIG-2/5 정착 + 0 회귀 + 0 tsc errors)

## 다음 작업 제안

**S99 진입 시 우선순위**:

1. **PLUGIN-MIG-3 + 4 묶음 chunk** (~2-4일, P0): 5 Content* 모델 fragment 분리 + tenantId backfill + RLS 정책 + 5 라우트 + support libs 동시 이전. PR 게이트 #4 live non-BYPASSRLS 테스트 통과 필수. **단계별 commit 권장** = (a) Prisma fragment 분리 + tenantId backfill / (b) RLS 정책 + 마이그레이션 deploy + 라이브 검증 / (c) 라우트 + support libs 이동 / (d) src/app/ thin re-export.
2. **FILE-UPLOAD-MIG sweep** (~30분, P3): filebox file-upload-zone.tsx → attachment-upload utility 통합. INFRA-2 인프라 활용 가능.
3. **사용자 carry-over** (1.5분, P0 사용자): S88-USER-VERIFY 휴대폰 1분 + S86-SEC-1 GitHub Settings 30초.
4. **운영자 carry-over** (P2): S87-RSS-ACTIVATE + S87-TZ-MONITOR + cron MA-ENABLE.

**S99 진입 시 첫 행동**:
1. `git status --short` + `git log --oneline -10` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (다른 터미널 commit 가능성)
3. 자율 실행 메모리 적용 — DECISION 분기 질문 X, 권장 순서대로 진입.

## 저널 참조

- [docs/logs/journal-2026-05-10.md](../logs/journal-2026-05-10.md) — 본 세션 [10]~[15] 토픽 기록 (대화 다이제스트 원본)

---

[← handover/_index.md](./_index.md)
