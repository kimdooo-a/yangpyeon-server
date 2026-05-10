# 인수인계서 — 세션 99 (PLUGIN-MIG-3 정찰 + chunk A/B/C 설계)

> 작성일: 2026-05-10
> 이전 세션: [session 98 후속 (PLUGIN-MIG-2 + 5)](./260510-session98-postscript-plugin-mig-2-5.md)
> 저널: [journal-2026-05-10.md](../logs/journal-2026-05-10.md) §세션 99

---

## 작업 요약

S98 후속 commit `f7a0253` (PLUGIN-MIG-2 + 5) 직후 새 세션 진입. 사용자 "새로운 새션 시작" + S98 후속 마감 보고 paste → next-dev-prompt 의 S99 P0 우선순위 = PLUGIN-MIG-3 (5 라우트 928줄 이전 + 308 alias) 자율 진입.

**본 세션 = 정찰 + 설계만, 코드 변경 0.** PLUGIN-MIG-3 본격 구현 직전에 사용자가 `/cs` 호출. 정찰 결과를 인수인계서로 보존 (다음 세션 재진입 시 task 재등록 비용 회피).

핵심 산출물:
- 5 routes + 308 alias + catch-all dispatcher 정밀 정찰 (행 단위 read)
- TenantRouteRegistration 시그니처 검증 (PLUGIN-MIG-1 에서 정의된 인터페이스 — route registry/dispatch lookup 은 미구현)
- chunk A/B/C 분할 설계 (회귀 위험 분리)
- 308 alias 보존 결정 (44줄 redirect, 결합 0, v1.1 cutover 시 별도 chunk)
- `withTenant` 단일 위치 전환 설계 (catch-all 측 단일 적용 → plugin handler signature 단순화)
- TaskCreate 7 (#1 정찰 완료, #2-#7 세션 종료 시 deleted — 다음 세션 재발급)

## 대화 다이제스트

### 토픽 1: 새 세션 시작 + S98 후속 마감 보고 paste

> **사용자**: "새로운 새션 시작 ... ● Push 성공 (b5bed64 → f7a0253). 세션 마감 보고: PLUGIN-MIG-2/5 완료 ..."

사용자가 직전 세션의 마감 보고를 그대로 paste. 세션 시작 프로토콜 (CLAUDE.md) 적용:
- `git status --short` + `git log --oneline -10` (memory `feedback_concurrent_terminal_overlap`)
- HEAD = `f7a0253`, origin = `f7a0253`, working tree clean
- next-dev-prompt.md (S99 prompt) + handover/260510-session98-infra-2-plugin-mig-1.md + S98 후속 handover 모두 확인

**결론**: 베이스라인 검증 완료. next-dev-prompt 의 S99 P0 = PLUGIN-MIG-3 자율 진입 (분기 질문 금지 메모리 적용).

### 토픽 2: PLUGIN-MIG-3 정찰 — 대상 5 routes 위치 정정

> manifest.ts 주석: "src/app/api/v1/t/[tenant]/{categories,sources,today-top,items,contents}/route.ts → packages/tenant-almanac/src/routes/*"

Glob 결과:
- `src/app/api/v1/t/[tenant]/categories/route.ts` (149줄)
- `src/app/api/v1/t/[tenant]/sources/route.ts` (117줄)
- `src/app/api/v1/t/[tenant]/today-top/route.ts` (207줄)
- `src/app/api/v1/t/[tenant]/items/[slug]/route.ts` (135줄)
- `src/app/api/v1/t/[tenant]/contents/route.ts` (253줄)
- `src/app/api/v1/almanac/[...path]/route.ts` (44줄, 308 alias)
- `src/app/api/v1/t/[tenant]/[...path]/route.ts` (67줄, catch-all dispatcher)

합 = 5 explicit route 928줄 + 2 dispatcher 111줄.

**결론**: 5 routes + 2 dispatcher 모두 정찰 완료.

### 토픽 3: 5 routes 본체 read + 공통 패턴 추출

5 route 파일 모두 읽음 (병렬). **공통 패턴**:
- `withTenant` 가드 (각자 적용)
- `runtime = "nodejs"`
- `buildCorsHeaders(request)` — `ALMANAC_ALLOWED_ORIGINS` env 의존, 5×17줄 중복
- `tenantPrismaFor({ tenantId: tenant.id })` — Prisma client (RLS 자동 적용, ALS propagation 회피 패턴)
- `successResponse` / `errorResponse` from `@/lib/api-response`
- `OPTIONS` handler (CORS preflight, 5×6줄 중복)

**개별 차이**:
- categories: byTrack 그룹화 + count groupBy (단순)
- sources: kind/country query, `Prisma.ContentSourceWhereInput` (단순)
- today-top: score 알고리즘 (boostThreshold 1.5x freshness boost), 두 번 Prisma 호출 (metric + items, 중간)
- items/[slug]: URL param `slug` (catch-all 에서 추출 필요), `tenantId_slug` composite unique, fire-and-forget viewCount increment (중간)
- contents: 7 query params, base64 cursor pagination, `writeAuditLog({ action: "ALMANAC_CONTENTS_LIST" })` audit 의존 (복잡)

**결론**: 5 routes refactor 시 cors helper + OPTIONS 공통화로 ~85줄 자연 압축. handler 본체는 functional 로직 보존.

### 토픽 4: TenantRouteRegistration 시그니처 검증 (PLUGIN-MIG-1 골격)

`packages/core/src/tenant/manifest.ts` 의 `TenantRouteRegistration`:
```ts
{
  path: string;          // 예: "/api/v1/almanac/contents"
  handler: () => Promise<{ GET?, POST?, PATCH?, DELETE? }>;
}
```

이 시그니처는 PLUGIN-MIG-1 (S98) 에서 정의됨. 단, route registry / dispatch lookup 은 **미구현**:
- `packages/core/src/tenant/dispatcher.ts` (S99 PLUGIN-MIG-5 신설) = cron handler 만 처리 (registerCoreHandler / registerTenant + dispatchTenantHandler). route 측 미구현.
- `src/lib/tenant-router/dispatch.ts` (Phase 1.2 T1.2) = `HANDLER_TABLE` 빈 객체, 모든 path → 404 ROUTE_NOT_FOUND.
- 현재 5 explicit route 가 Next.js static-first match 로 catch-all 앞에서 흡수 중.

PLUGIN-MIG-3 에서 추가 작업 필요:
1. `TenantRouteHandler` 타입 신설 (`(req, user, tenant, params) => Promise<Response>`)
2. `TenantRouteRegistration.path` 의미 재정의 — "tenant subPath pattern" (예 `contents`, `items/:slug`) 으로 변경, dispatcher 측 catch-all 과 정합
3. `TenantRouteRegistration.handler` 시그니처 강화 — `unknown` → `TenantRouteHandler` strict typing
4. `src/lib/tenant-router/dispatch.ts` 가 registry (`getTenantManifest(tenant.id)`) lookup → routes 매칭 → dynamic import → handler 호출
5. `:slug` 동적 param 매칭 + params 추출

**결론**: PLUGIN-MIG-1 골격은 codegen 모델로 작성됐으나 PLUGIN-MIG-3 은 runtime catch-all dispatch 로 구현 (S99 PLUGIN-MIG-5 cron 패턴과 정합). 시그니처 보강 필요.

### 토픽 5: chunk A/B/C 분할 설계 (회귀 위험 분리)

PLUGIN-MIG-3 단일 commit 으로 묶을 수 있으나 회귀 추적 용이성을 위해 분할 권장:

| Chunk | 변경 | LOC | 회귀 위험 |
|-------|------|-----|----------|
| **A: 인프라** | TenantRouteHandler 타입 + dispatcher route registry + dispatch.ts manifest lookup + dispatch.test.ts 갱신 | ~150 신규 | 0 (5 explicit route 가 흡수 중이라 catch-all 변경 영향 없음) |
| **B: 본체 이전** | 5 handler packages/tenant-almanac/src/routes/ + cors helper 공통화 + manifest.routes 등록 | ~700 이전 | 0 (5 explicit route 보존 시 catch-all 미사용 — hot path 무관) |
| **C: cutover** | 5 explicit route.ts 삭제 + 회귀 테스트 + commit + push | -928 | 라이브 회귀 검증 필요 |

`★ Insight ─────────────────────────────────────`
- **A→B→C 분할의 핵심**: A 는 "기능 추가 + 사용 안함" 이라 0 회귀. B 는 "코드 이전 + 등록만" 으로 5 explicit route 가 그대로 hot path. **C 만 "삭제 + cutover" 라 라이브 회귀 위험** — vitest + 수동 curl smoke (5 routes × GET) 를 게이트로 두면 즉시 감지.
- **Next.js static-first match 의 자동 흡수**: 5 explicit route.ts 를 삭제하면 Next.js 가 자동으로 catch-all 로 라우팅 → `dispatchTenantRoute` 가 manifest.routes lookup → plugin 핸들러 호출. **route 등록을 코드 변경 0줄로** 가 ADR-022 7원칙 #4 의 router 측 현실화.
- **packages → app 역방향 import 정책**: PLUGIN-MIG-2 의 manifest.ts 가 이미 `@/lib/aggregator/types` import — 역방향 허용 상태. PLUGIN-MIG-3 도 packages/tenant-almanac/src/routes/ 가 `@/lib/api-response`, `@/lib/db/prisma-tenant-client`, `@/lib/audit-log`, `@/generated/prisma/client` import 가능. 진정한 격리는 PLUGIN-MIG-4+ (5 Content* 모델 + audit-log + api-response 의 packages 화 동반).
`─────────────────────────────────────────────────`

**결론**: A → B → C 단계별 commit. 각 단계에서 vitest 회귀 0 검증 후 진행.

### 토픽 6: 308 alias 보존 결정

next-dev-prompt 의 PLUGIN-MIG-3 설명에 "(308 alias 제거)" 포함되어 있으나:
- `src/app/api/v1/almanac/[...path]/route.ts` = 44줄 단순 redirect
- 결합 = 0 (catch-all 과 별개 진입점)
- 308 = Permanent + 메서드 보존 → 클라이언트가 새 URL 캐싱
- 주석: "Almanac v1.0 출시 기간 동안만 유지 (plugin 마이그레이션 후 제거 예정)"

**결정**: 본 PLUGIN-MIG-3 chunk 에서는 보존. Almanac frontend (almanac-flame.vercel.app) 가 `/api/v1/t/almanac/*` 직접 사용 확인 후 별도 sub-chunk 로 제거 (v1.1 cutover 시점).

**결론**: 308 alias 제거는 PLUGIN-MIG-3 scope 외.

### 토픽 7: withTenant 단일 위치 전환 설계

현재 5 explicit route 각각 `withTenant` 데코레이터 적용:
```ts
export const GET = withTenant(async (request, _user, tenant) => { ... });
```

cutover 후에는 catch-all `[tenant]/[...path]/route.ts` 가 `withTenant` 단일 적용. plugin handler 는 `withTenant` 미경유, signature 단순:
```ts
export const GET: TenantRouteHandler = async (req, user, tenant, params) => { ... };
```

이점:
- plugin 코드가 host app 의 `withTenant` 의존성 0
- K3 cross-validation (`dbTenant.slug === pathTenant.slug`) 도 catch-all 한 곳에서 강제 — plugin handler 가 잘못 작성돼도 K3 가 플랫폼 측에서 보장
- ADR-022 7원칙 #3 "한 컨슈머 실패는 다른 컨슈머에 닿지 않는다" 의 router 레이어 현실화

**결론**: handler signature = `(req, user, tenant, params) => Promise<Response>` 채택.

### 토픽 8: TaskCreate 7 등록 + #1 완료 + /cs 시점 #2-#7 deleted

7 task 등록 (chunk A/B/C 의 단계별 작업):
- #1 정찰 — TenantRoute 타입 + 잔여 3 route + dispatch.test.ts ✅ (본 세션 완료)
- #2 5 route handler 본체 packages/tenant-almanac/src/routes/ 이전
- #3 manifest.ts routes 배열 등록 + dispatcher route registry lookup
- #4 5 explicit route.ts 삭제 — catch-all 자동 흡수
- #5 dispatch.ts + manifest TDD — registry lookup + params 추출
- #6 vitest 821→ + tsc 0 errors 확인 + commit + push
- #7 next-dev-prompt.md S100 entry 갱신

`/cs` 호출 시점에 #2-#7 모두 pending. 다음 세션이 이 인수인계서를 읽고 task 재등록 가능 → 본 세션 종료 시 deleted 마킹.

**결론**: 정찰만 완료, 본격 구현은 S100.

### 토픽 9: /cs 진입

> **사용자**: "/cs"

PLUGIN-MIG-3 본격 구현 (chunk A/B/C, ~1-2일) 직전에 사용자가 세션 종료 결정. 정찰 + 설계 가치를 인수인계서에 보존하여 S100 재진입 시 비용 회피.

**결론**: 6단계 /cs 워크플로우 (저널 append + current.md S99 row + 2026-05.md log + handover 파일 + _index row + next-dev-prompt S100 prompt + commit & push).

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | PLUGIN-MIG-3 진입 vs 다른 우선순위 | (a) PLUGIN-MIG-3 (next-dev-prompt P0) (b) FILE-UPLOAD-MIG sweep (~30분) (c) 사용자 carry-over | (a) — next-dev-prompt 가 P0 우선순위로 명시. 자율 실행 메모리 적용 |
| 2 | 본격 구현 진입 vs 정찰만 | (a) chunk A 즉시 구현 (b) 정찰 후 사용자 confirm (c) 정찰만 | (c) — 사용자 /cs 호출로 강제 결정. 정찰 가치를 handover 보존 |
| 3 | TaskCreate 7 처리 | (a) deleted (b) pending 보존 | (a) — 다음 세션이 handover 읽고 재등록 가능, task 는 세션 ephemeral |
| 4 | chunk 분할 vs 단일 commit | (a) 단일 (b) A/B/C 분할 | (b) — A 0 회귀 / B 0 회귀 (5 explicit 보존) / C 만 cutover 위험. 회귀 추적 용이 |
| 5 | 308 alias 처리 | (a) 본 chunk 제거 (b) 보존 (c) v1.1 별도 chunk | (b)+(c) — 44줄 redirect 결합 0, frontend 직접 호출 검증 후 v1.1 cutover 시점 제거 |
| 6 | handler signature | (a) Next.js (req, context) 표준 (b) (req, user, tenant, params) 단순화 | (b) — withTenant 단일 위치 적용, plugin 코드 host app 의존성 0, ADR-022 #3 router 측 현실화 |
| 7 | path matching | (a) 절대 Next.js path "/api/v1/almanac/contents" (b) 상대 subPath pattern "contents", "items/:slug" | (b) — catch-all dispatcher 와 정합, `:slug` 동적 param 매칭 자연 |

## 수정 파일 (0개)

본 세션은 정찰 + 설계만 — 코드 변경 0. 산출물은 본 인수인계서 + 저널 append.

## 검증 결과

- `npx vitest run` — 미실행 (코드 변경 0)
- `npx tsc --noEmit` — 미실행 (코드 변경 0)
- baseline 보존: HEAD `f7a0253`, vitest 821 PASS / 94 skip (S98 후속 baseline 그대로)

## 터치하지 않은 영역

- PLUGIN-MIG-3 본격 구현 (chunk A/B/C, ~1-2일, S100 진입)
- PLUGIN-MIG-4 (Prisma fragment + tenantId backfill + RLS, PR 게이트 #4 live test 필수, S100/S101 분리 또는 묶음)
- 308 alias 제거 (Almanac v1.1 cutover 시점)
- FILE-UPLOAD-MIG sweep (~30분)
- 사용자 P0 carry-over (S88-USER-VERIFY 휴대폰 + S86-SEC-1 GitHub Settings)
- 운영자 P2 carry-over (S87-RSS-ACTIVATE + S87-TZ-MONITOR + cron MA-ENABLE)

## 알려진 이슈

- **다른 터미널이 PLUGIN-MIG-3 chunk A 를 병렬 진행 중** (memory rule `feedback_concurrent_terminal_overlap` 정확 재현): 본 /cs 시점 `git status` 결과 packages/core/src/tenant/{manifest,index,manifest.test}.ts + packages/core/src/index.ts + src/lib/tenant-router/{dispatch,dispatch.test}.ts 6 파일 modified (+383줄). manifest.ts diff 에 "PLUGIN-MIG-3 (S99)" 주석 + `TenantRouteHandler`/`TenantRouteContext`/`HttpMethod` 타입 신설 + `TenantRouteRegistration.handler` thunk → `methods` Partial Record 시그니처 변경 = **chunk A 의 인프라 작업 그 자체**. 본 세션은 docs 만 stage/commit, 다른 터미널의 chunk A 코드 변경은 그 터미널의 /cs 또는 commit 이 처리할 영역. 영역 분리 정합 (docs vs src). S100 진입 시 `git pull` 후 chunk A 가 origin 반영됐는지 확인 → 반영됐다면 S100 작업 = chunk B 부터 (~1시간) + C (~30분).

## 다음 작업 제안 (S100)

### 1순위: PLUGIN-MIG-3 본격 구현

**chunk A → B → C 단계별 commit** (각 단계 vitest 회귀 0 검증 후 진행):

**Chunk A (인프라, ~30분, 0 회귀):**
1. `packages/core/src/tenant/manifest.ts` — `TenantRouteHandler` 타입 신설, `TenantRouteRegistration.path` 의미 재정의 (subPath pattern), `TenantRouteRegistration.handler` strict typing
2. `packages/core/src/tenant/dispatcher.ts` — route registry 함수 추가 (manifest.routes 활용 또는 별도 `registerTenantRoutes`)
3. `src/lib/tenant-router/dispatch.ts` — `HANDLER_TABLE` 제거, `getTenantManifest(tenant.id).routes` lookup → method+pattern 매칭 → dynamic import → handler 호출. `:slug` 동적 param 추출
4. `src/lib/tenant-router/dispatch.test.ts` — 신규 케이스 (registered tenant + 매칭 / unmatched resource 404 / unmatched method 405 / `:slug` param 추출)

**Chunk B (본체 이전, ~1시간, 0 회귀):**
1. `packages/tenant-almanac/src/lib/cors.ts` — `buildCorsHeaders` + OPTIONS factory 공통화 (5 routes 중복 ~85줄 흡수)
2. `packages/tenant-almanac/src/routes/categories.ts` — handler 본체 이전 (149 → ~80줄, withTenant + cors helper 흡수)
3. `packages/tenant-almanac/src/routes/sources.ts` — 117 → ~70줄
4. `packages/tenant-almanac/src/routes/today-top.ts` — 207 → ~150줄
5. `packages/tenant-almanac/src/routes/items.ts` — 135 → ~90줄 (params.slug 추출 시그니처)
6. `packages/tenant-almanac/src/routes/contents.ts` — 253 → ~190줄 (audit-log 의존 보존)
7. `packages/tenant-almanac/manifest.ts` — `routes: []` → 5 entry 등록 (path: "categories" / "sources" / "today-top" / "items/:slug" / "contents")

**Chunk C (cutover, ~30분, 라이브 검증 필요):**
1. 5 explicit route.ts 삭제: `src/app/api/v1/t/[tenant]/{categories,sources,today-top,items/[slug],contents}/route.ts`
2. `npx vitest run` — 821 → 같거나 + 신규 (회귀 0 확인)
3. `npx tsc --noEmit` — 0 errors 확인
4. 라이브 smoke (선택): WSL 빌드 + curl 5 routes × GET (ALMANAC_ALLOWED_ORIGINS 헤더 검증)
5. commit `feat(plugin-mig-3): Almanac 5 라우트 본체 이전 + dispatch registry`
6. PR 게이트 5 항목 본문 명시 (신규 모델 0 / withTenant 가드 catch-all 단일 적용 / Prisma tenantPrismaFor 패턴 보존 / RLS 변경 0 / timezone 0)
7. `git push origin spec/aggregator-fixes`

### 2순위: PLUGIN-MIG-4 (PR 게이트 #4 live test 필수)

PLUGIN-MIG-3 완료 후 자연 후보. 5 Content* 모델 fragment 활성 + tenantId backfill SQL + RLS 정책 마이그레이션. **PR 게이트 #4** (live non-BYPASSRLS 테스트) 필수 — `bash scripts/run-integration-tests.sh tests/almanac/` (PowerShell 권장 = WSL→Win cross-OS env 손실 회피).

### 사용자/운영자 carry-over (병렬 가능)

- **P0 사용자**: S88-USER-VERIFY 휴대폰 stylelucky4u.com/notes 재검증 (1분) + S86-SEC-1 GitHub repo public/private 확인 (30초)
- **P2 운영자**: S87-RSS-ACTIVATE anthropic-news 대체 endpoint + S87-TZ-MONITOR 24h+ TimeZone=UTC 모니터링 + `messenger-attachments-deref` cron enabled=true (30일 도달 시점)

### sweep (P3)

- FILE-UPLOAD-MIG (filebox file-upload-zone → attachment-upload utility 통합, ~30분)
- STYLE-3 (sticky-note-card.tsx:114 endDrag stale closure, ~15분)
- DEBOUNCE-1 (M5 검색 300ms debounce, ~30분)
- NEW-BLOCK-UI (대화 화면 hover → 차단 진입 메뉴, ~30분)

### S100+ wave 평가 권장 시점

`kdywavecompletion --compare session-96` — PLUGIN-MIG-3 + 4 완료 후 (~S101+). Track C 인프라 보강 효과 + plugin 격리 정량화 + ADR-022 7원칙 #4 router 레이어 현실화 검증.

---

[← handover/_index.md](./_index.md)
