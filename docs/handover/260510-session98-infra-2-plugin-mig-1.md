# 인수인계서 — 세션 98 (INFRA-2 SWR + jsdom MSW 컴포넌트 TDD + Almanac plugin schema-first 골격)

> 작성일: 2026-05-10
> 이전 세션: [session97 (wave eval 3차)](./260510-session97-wave-completion-eval-delta.md)
> 저널: [journal-2026-05-10.md](../logs/journal-2026-05-10.md) §세션 98

---

## 작업 요약

S97 사용자 결정 ("1, 2 순차적으로 진행") 직후 자율 실행 진입. INFRA-2 4 task (SWR + MSW + uploadAttachment 본체 + 컴포넌트 렌더 TDD) 와 PLUGIN-MIG-1 1 task (Almanac plugin schema-first 골격) 완수. 2 commit (`ff698fe` INFRA-2 +1346/-170 / `4840fa6` PLUGIN-MIG-1 +499) origin push 대기. **vitest 761 → 809 PASS (+48), 회귀 0, tsc 0 errors**.

## 대화 다이제스트

### 토픽 1: 사용자 결정 "1, 2 순차적으로 진행"

> **사용자**: "1,2 순차적으로 진행."

S97 마지막 권고 표 (1 = P2 INFRA-2 ~3-4h ~500 LOC / 2 = Almanac plugin 마이그레이션 ~5-7일 schema-first 1-2일 단축 가능). 본 세션이 두 chunk 모두 완수.

**결론**: 자율 실행 메모리 적용. 베이스라인 검증 (HEAD=719bfa7 + tree clean) + 5 task 분해 + TDD 스킬 로드.

### 토픽 2: INFRA-2 Task #1 — SWR + MSW + jsdom 인프라

`npm install swr@2.4.1 msw@2.14.5`. 결정: 글로벌 env=node 유지 + `// @vitest-environment jsdom` 파일 단위 opt-in (속도 회귀 0).

msw-smoke.test.ts 가 `./msw/server` import 실패 RED → src/test/{msw/server.ts, msw/handlers.ts, setup.ts} 생성 + vitest.config setupFiles → 2/2 GREEN (transform 54ms, env 577ms).

vitest 4.x `--reporter=basic` deprecated 재확인 (S97 wave eval 발견과 일치).

**결론**: 인프라 정착, 누구나 `// @vitest-environment jsdom` 으로 hook/component test 작성 가능.

### 토픽 3: Task #2 — useConversations + useMessages SWR 마이그레이션 (TDD dedup RED→GREEN)

외부 행동 보존 테스트 3 PASS 즉시 (loading/error/reload). 진짜 RED 확보를 위해 SWR-specific dedup 테스트 추가 — 같은 key 다중 hook 호출 = fetch 1회. 현 fetch+useState 패턴 = 3 fetches → RED.

useConversations: `useSWR<ConversationRow[]>(CONVERSATIONS_KEY, fetcher)` + `mutate()` → reload(). 시그니처 보존 → page.tsx 변경 0.

useMessages: `useSWR<MessagesCache>` + `withItems(updater)` helper 로 sendOptimistic happy/5xx + SSE applyEventToMessages 모두 `mutate(updater, { revalidate: false })` 통일. SSE = vi.mock useSse 격리.

**결론**: useConversations 4/4 + useMessages 5/5 PASS. page.tsx 변경 0.

### 토픽 4: Task #3 — uploadAttachment 본체 jsdom+MSW 5 시나리오

기존 9 test 는 classifyAttachmentKind pure logic 만. 본체 (XHR + multipart) 미커버. 핵심 기법: `Object.defineProperty(file, "size", ...)` 로 file.size mock → 5GB cap / multipart partCount=1 happy / complete 실패 시 abort 호출 검증. MSW v2 가 XHR + fetch 모두 가로챔.

**결론**: 5 PASS — local happy / 4xx server error / 5GB cap (handler hits=0) / multipart happy / multipart abort fallback. **G-NEW-12 갭 해소 시작**.

### 토픽 5: Task #4 — 4 컴포넌트 렌더 TDD (cleanup + scrollIntoView 함정 자가 발견)

MessageAttachment 7 RED — 4 fail. 분석: 테스트 간 DOM 누적 → `@testing-library/react` auto-cleanup 미동작 (vitest globals=false 일 때 비활성). setup.ts jsdom 분기에 `afterEach(cleanup)` 명시 등록 → GREEN.

MessageList 7 RED — `scrollIntoView` jsdom 미구현 throw. polyfill 추가 (Element.prototype.scrollIntoView = ()=>{}). GREEN.

MessageComposer 5 — vi.mock uploadAttachment + Object.defineProperty file.files 로 file input change 시뮬레이션. chip add/remove + uploading 중 send disabled + 완료 후 send enabled.

**결론**: 25 컴포넌트 test PASS. **wave-tracker §6 가정 정정**: "M4 UI = TDD 압축 적용 불가" 무너짐 — logic-only 와 동일 분량/시간 압축률 (G-NEW-12 갭 해소).

### 토픽 6: INFRA-2 commit `ff698fe`

전체 회귀 = 801 PASS / 94 skip (S97 baseline 761 → +40, 0 회귀). tsc 0 errors. PR 게이트 5항목 자동 통과. 다른 터미널 fe8ea02 (S97 /cs docs 마감) 영역 분리 명시 commit 메시지 — feedback_concurrent_terminal_overlap 정합.

**결론**: INFRA-2 본진 commit 정착, FILE-UPLOAD-MIG sweep 만 잔여.

### 토픽 7: PLUGIN-MIG-1 — ADR-024 옵션 D schema-first 골격

ADR-024 옵션 D 정합 = Almanac 은 Complex tenant → workspace 패키지. packages/core/ 이미 존재 (tenant/cron/audit subpath). TenantManifest 인터페이스 신설 (cronHandlers + routes + adminPages + prismaFragment + envVarsRequired + dataApiAllowlist 6 필드). defineTenant identity helper. 본체 마이그레이션은 PLUGIN-MIG-2~5 (Phase 16+) 로 분리.

골격 단계 = manifest.ts (todoHandler stub 6개 = ok=false + PLUGIN-MIG-2 안내 메시지) + 빈 src/{handlers,routes,admin}/.gitkeep + prisma/fragment.prisma placeholder + README 5단계 마이그레이션 표.

**결론**: tsconfig + vitest 양쪽에 `@yangpyeon/tenant-almanac` alias 정착.

### 토픽 8: PLUGIN-MIG-1 commit `4840fa6`

회귀 = 809 PASS (S98 INFRA-2 baseline 801 → +8, 0 회귀). tsc 0 errors. 본 commit 영역 = packages/core (manifest 인터페이스) + packages/tenant-almanac/ (전체 골격) + alias 2 파일.

**결론**: ADR-022 7원칙 #4 "코드 수정 0줄 신규 컨슈머" 토대 마련. todoHandler stub 의 ok=false 메시지가 PLUGIN-MIG-2~5 진척도 자동 노출 메커니즘.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | jsdom 적용 범위 | (a) 글로벌 env=jsdom (b) per-file `// @vitest-environment jsdom` opt-in | (b) — 기존 169 unit test 속도 회귀 0, DOM 필요 파일만 jsdom 비용 부담 |
| 2 | SWR 진짜 RED 확보 | (a) 외부 행동만 (loading/error/reload) (b) dedup 추가 | (b) — SWR-specific 행동 (3 fetches → 1 fetch) 만이 진짜 RED. 외부 행동만은 기존 fetch+useState 도 통과 |
| 3 | sendOptimistic state 패턴 | (a) optimisticData option (b) mutate(updater, revalidate=false) | (b) — withItems helper 로 SSE applyEventToMessages 와 동일 패턴 통일. ok/error 반환 closure 단순. |
| 4 | RTL cleanup 등록 | (a) globals=true 전역 enable (b) afterEach(cleanup) 명시 등록 | (b) — globals 영향이 다른 테스트에 미칠 수 있음, jsdom 분기에만 등록이 안전 |
| 5 | uploadAttachment 본체 multipart 테스트 | (a) 실제 60MB+ 파일 생성 (b) Object.defineProperty file.size mock | (b) — 메모리 무겁지 않음, partCount=1 시나리오로도 init+part+complete 흐름 검증 가능 |
| 6 | PLUGIN-MIG-1 본체 이전 시점 | (a) 본 세션 (b) 별도 chunk (PLUGIN-MIG-2+) | (b) — schema-first 정착 후 본체 이전이 mechanical. apps/web 빌드 entry 분리는 별도 결정 필요 (모노레포 도구 채택) |
| 7 | manifest.ts 핸들러 본체 | (a) src/lib/aggregator/* import (b) todoHandler stub | (b) — packages → app 역방향 import 회피. ok=false + PLUGIN-MIG-2 안내 메시지가 진척도 자동 노출 |

## 수정 파일 (32개)

### INFRA-2 commit `ff698fe` (16 files)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `package.json` + `package-lock.json` | swr@2.4.1 + msw@2.14.5 추가 |
| 2 | `vitest.config.ts` | setupFiles + .test.tsx include |
| 3 | `src/test/msw/server.ts` (신규) | setupServer (msw/node) |
| 4 | `src/test/msw/handlers.ts` (신규) | defaultHandlers 빈 배열 |
| 5 | `src/test/setup.ts` (신규) | MSW 라이프사이클 + jsdom 분기 (jest-dom + cleanup + scrollIntoView polyfill) |
| 6 | `src/test/msw-smoke.test.ts` (신규) | 인프라 검증 2 test |
| 7 | `src/hooks/messenger/useConversations.ts` | useState/fetch → useSWR |
| 8 | `src/hooks/messenger/useConversations.test.tsx` (신규) | loading/error/dedup/reload 4 test |
| 9 | `src/hooks/messenger/useMessages.ts` | useState/fetch → useSWR + withItems helper |
| 10 | `src/hooks/messenger/useMessages.test.tsx` (신규) | mount/empty conv/sendOptimistic happy/5xx/dedup 5 test |
| 11 | `src/lib/messenger/attachment-upload-body.test.ts` (신규) | 5 시나리오 |
| 12 | `src/components/messenger/MessageAttachment.test.tsx` (신규) | 7 test |
| 13 | `src/components/messenger/MessageBubble.test.tsx` (신규) | 7 test |
| 14 | `src/components/messenger/MessageList.test.tsx` (신규) | 7 test |
| 15 | `src/components/messenger/MessageComposer.test.tsx` (신규) | 5 test |

### PLUGIN-MIG-1 commit `4840fa6` (16 files)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `packages/core/src/tenant/manifest.ts` (신규) | TenantManifest interface + defineTenant helper + 5 type |
| 2 | `packages/core/src/tenant/manifest.test.ts` (신규) | 3 test |
| 3 | `packages/core/src/tenant/index.ts` | manifest re-export |
| 4 | `packages/core/src/index.ts` | manifest re-export |
| 5 | `packages/tenant-almanac/package.json` (신규) | private + peer-dep @yangpyeon/core |
| 6 | `packages/tenant-almanac/tsconfig.json` (신규) | extends ../core/tsconfig.json |
| 7 | `packages/tenant-almanac/manifest.ts` (신규) | 6 todoHandler + 5 dataApiAllowlist + envVarsRequired |
| 8 | `packages/tenant-almanac/src/index.ts` (신규) | manifest re-export |
| 9 | `packages/tenant-almanac/src/{handlers,routes,admin}/.gitkeep` (신규) | 이전 매핑 표 |
| 10 | `packages/tenant-almanac/src/manifest.test.ts` (신규) | 5 test (id/cron/stub/allowlist/envVars) |
| 11 | `packages/tenant-almanac/prisma/fragment.prisma` (신규) | 5 ContentXxx 모델 PLUGIN-MIG-4 placeholder |
| 12 | `packages/tenant-almanac/README.md` (신규) | 5 단계 마이그레이션 표 + 호출 흐름 |
| 13 | `tsconfig.json` | @yangpyeon/tenant-almanac alias |
| 14 | `vitest.config.ts` | @yangpyeon/tenant-almanac alias |

## 상세 변경 사항

### 1. SWR 마이그레이션 — useConversations + useMessages

useConversations: 단일 SWR key (`/api/v1/t/default/messenger/conversations`) + fetcher 가 `json.data?.conversations ?? []` 추출. `data ?? []` / `isLoading` / `error?.message` / `mutate()` 매핑.

useMessages: SWR data 단위 = `MessagesCache { items, nextCursor, hasMore }` 구조. `withItems(updater)` 가 items 만 변형하는 reducer 를 SWR mutate 에 전달. sendOptimistic 4 분기 (prepend / 5xx / 응답 누락 / catch) 모두 동일 패턴.

### 2. MSW v2 + jsdom 인프라

- setupFiles 가 한 번에 MSW + jest-dom + RTL cleanup + scrollIntoView polyfill 모두 처리
- onUnhandledRequest=error 정책 → mocking 누락 = 테스트 실패
- Per-file env opt-in (`// @vitest-environment jsdom`)

### 3. PLUGIN-MIG-1 골격 (ADR-024 옵션 D)

- TenantManifest interface = 6 필드 (cronHandlers + routes + adminPages + prismaFragment + envVarsRequired + dataApiAllowlist)
- defineTenant identity helper (type 추론 보강)
- todoHandler stub = ok=false + PLUGIN-MIG-2 안내 (rss-fetcher 본체 미이전 같은 메시지)
- README 5 단계 (MIG-1 ~ MIG-5) 표 + 현재 vs 목표 호출 흐름

## 검증 결과

- `npx vitest run` — 809 PASS / 94 skip (S97 baseline 761 → +48 신규, 0 회귀)
- `npx tsc --noEmit` — 0 errors
- PR 게이트 5항목 자동 통과 (신규 모델 0 / 라우트 0 / Prisma 호출 변경 0 / RLS N/A / timezone 0)

## 터치하지 않은 영역

- PLUGIN-MIG-2~5 (Phase 16+ 단독 chunk, 각 1-2일)
- FILE-UPLOAD-MIG (filebox file-upload-zone → attachment-upload utility, 별도 sweep ~30분)
- 사용자 P0 carry-over (S88-USER-VERIFY 휴대폰 + S86-SEC-1 GitHub Settings)
- 운영자 P2 carry-over (S87-RSS-ACTIVATE + S87-TZ-MONITOR + `messenger-attachments-deref` cron enable 30일 도달 시점)
- sweep 4건 (STYLE-3 / DEBOUNCE-1 / NEW-BLOCK-UI)
- M4 UI 잔여 라이브 e2e (jsdom 도입으로 자동 회귀 가능, 별도 chunk)

## 알려진 이슈

- vitest 4.x `--reporter=basic` deprecated — default reporter 사용 권장 (S97 wave eval 에서 이미 발견)
- 본 commit 2건 origin push 대기 (/cs 5단계가 자동 push)
- packages/tenant-almanac 의 핸들러 본체는 todoHandler stub (PLUGIN-MIG-2 시점에 본체 이전 필수)

## 다음 작업 제안

### 다음 큰 가치 (사용자 결정 영역)

| 옵션 | 작업 | 소요 | 차단 사항 |
|------|------|------|-----------|
| A | PLUGIN-MIG-2 (`src/lib/aggregator/*` → `packages/tenant-almanac/src/handlers/*`) | ~1일 | apps/web 빌드 entry 분리 (Next.js) — 모노레포 도구 채택 (turborepo / pnpm-workspace) 필요 |
| B | PLUGIN-MIG-3 (정식 REST 라우트 + admin UI 신설, 308 alias 제거) | ~1-2일 | manifest dispatch 가 cron runner AGGREGATOR 분기 대체 가능 (PLUGIN-MIG-5 의존성) |
| C | FILE-UPLOAD-MIG (filebox file-upload-zone → attachment-upload utility 통합) | ~30분 | sweep 단독 chunk, 결합 0 유지 |
| D | M4 UI 잔여 라이브 e2e (M5-ATTACH-3b/4 자동 회귀) | ~1일 | INFRA-2 정착 직후 자연 후보 |
| E | 사용자 P0 carry-over | 5분 + 30초 | 사용자 직접 행동 |

권장 순서: **C (~30분 sweep) → A (PLUGIN-MIG-2 본체 이전) → B (PLUGIN-MIG-3 라우트) → D 또는 E**.

### 다음 wave 평가 시점

S101+ (S97 wave eval 권고). PLUGIN-MIG-2+ 가 본격 진행되면 S99 또는 S100 시점에 wave-tracker §0 갱신 + 잔여 평가.

---

[← handover/_index.md](./_index.md)
