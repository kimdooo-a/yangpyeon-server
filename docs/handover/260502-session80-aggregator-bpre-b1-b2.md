# 인수인계서 — 세션 80 (Track B Aggregator B-pre + B1 + B2 + B3)

> 작성일: 2026-05-02 (B-pre+B1+B2 1차 작성, B3 후기 동일일 추가)
> 이전 세션: [session79](./260501-session79-multipart-body-truncation-fix.md)
> ⚠️ **본 인수인계서는 2회 작성됨**: 다른 터미널이 b46918c 로 1차 /cs 처리 후, 같은 세션 80 에서 B3 (e74f3ef) 가 추가됨. 본 파일 끝 `## 후기 — 동일 세션 B3 추가` 섹션 참조.

---

## 작업 요약

Track B (Almanac aggregator P0 본진, ~28h) 첫 진입. wave 진행도 plan 작성 → 베이스라인 검증으로 plan 가정 3건 정정 → s79 leftover 회복 2 commit + B-pre + B1 + B2 = **소계 5 commit (b46918c /cs 의식 포함 6 commit)**. 동일 세션에 **B3 (classify.ts port + TDD 40 케이스, e74f3ef) 추가** = 총 **7 commits / +2,835 LOC**. spec port-time bug 2건 TDD 로 발견 + fix (dedupe multi-value, classify 한글 \\b boundary).

## 대화 다이제스트

### 토픽 1: wave 기반 진행도 분석 + 작업 계획 수립

> **사용자**: "wave 기반 구현 진행도와 현재까지의 세션 진행 현황을 분석해서 앞으로 진행해야될 작업에 대해서 계획 수립."

Plan mode 진입. 핵심 상태 파일 3종 read (current.md 92K 토큰 초과 → 부분 read) 후 3 Explore 에이전트 병렬 발사하여 Track A (BaaS Phase 0~4) + Track B (Aggregator T1~T9) + Track C (Messenger M0~M6) 코드 실태 동시 검증.

**검증 결과**:
- Track A: Phase 1 ~85% (T1.1/1.2/1.3/1.4 ✅, T1.5 worker pool 구현 미완 / T1.6 schema OK 데이터 backfill 자연 충족 / T1.7 미확인)
- Track B: 0% — `src/lib/aggregator/` 디렉토리 부재. 단 5 endpoint + RLS 마이그 적용
- Track C: M1 완료 + M2 도메인 헬퍼 + Zod 완료, M2 19 라우트 미작성
- Track D Filebox: S77~S79 stabilized

Plan 에이전트 1개로 시퀀싱 설계 → Track B 우선, Track C 병행은 세션 86~. plan 파일 `wave-wiggly-axolotl.md` 작성 (10K+ 토큰).

**결론**: ExitPlanMode 승인. 세션 80~84 = B-pre~B7 직진, 85 = 24h 관찰, 86~ = Track C M2 19 라우트.

### 토픽 2: B-pre 베이스라인 검증으로 plan 가정 3건 정정

Plan 가정 검증을 위해 `audit-metrics.ts` + 시드 SQL + `prisma-tenant-client.ts` 를 직접 read.

**발견 1: T1.7 audit-metrics tenant 차원 이미 구현됨**. Phase 1.7 byTenant Map + AuditMetricsTenant 타입 + 6 단위 테스트 모두 존재. 초기 Explore grep 한계로 missed (`grep -l "audit.*metric"` 매치는 했으나 파일 내용 검증 누락).

**발견 2: R1 withTenantTx 존재**. `src/lib/db/prisma-tenant-client.ts:188`. plan 의 "정의 위치 미확인" 잘못된 정보.

**발견 3: R2 슬러그 — "3개 부족" 아닌 "완전 컨벤션 차이"**:
- DB 시드 37 vs spec 40, **정확 매치 단 8개**
- 단/복수 (tutorials↔tutorial), 명시 정도 (ai-funding↔funding), 한국 특화 (korean-tech), 신규 항목 (DB: data-science/system-design / spec: model-releases/fine-tuning)
- **결정**: DB 시드 = source of truth. T1.6 마이그(`20260427140000`) 가 RLS+dbgenerated+composite unique 활성 → spec slug 강행 시 promote.ts FK violation → cron consecutiveFailures 임계 → 자동 비활성화.
- 매핑표 `docs/research/baas-foundation/05-aggregator-migration/slug-mapping-db-vs-spec.md` 신규 (440 LOC).

**결론**: plan 갱신 + B-pre 코드 변경 0 (모두 문서). 발견 사항을 plan 본문 + 매핑 doc 에 baked-in.

### 토픽 3: s79 leftover 회복 + B-pre commit

git status 점검 시 `docs/logs/journal-2026-05-01.md` (188줄) + `docs/logs/2026-05.md` (55줄) 가 ff05a07 commit 시점 staging 누락 발견. 다른 터미널이 `0647b14` (s79 /cs handover + _index + CK) 를 동시 push 하여 race 발생했으나 폴더 충돌 0.

**3 commits 분리** (CLAUDE.md "기능 단위 commit"):
1. `046fce8 docs(s79-recovery): journal-2026-05-01 세션 79 entries 누락분 commit`
2. `6a8a9eb docs(s79-recovery-2): logs/2026-05.md 세션 79 entry 누락분 commit`
3. `c20d90d docs(s80-bpre): aggregator T1~T9 plan 단일 진실 소스 + 슬러그 매핑 분석`

**결론**: 단일 commit 으로 묶지 않은 이유 = git log 자기 설명. 회복 2건은 s79 의도, B-pre 는 s80 의도.

### 토픽 4: B1 의존성 + 3곳 .env 동기화

> **사용자**: "다음 액선 까지 마무리."

`npm install rss-parser cheerio @google/genai` 실행:
- rss-parser@3.13.0 (MIT)
- cheerio@1.2.0 (MIT)
- **@google/genai@1.51.0** (Apache-2.0) — plan §4 의 `^0.X` 가정과 달리 1.51.0 latest. peer 충돌 0 (R4 위험 해소).
- 55 패키지 추가 (transitive 포함)

`.env.example` + 3곳 실 .env 에 6 vars 추가 (메모리 룰 `feedback_env_propagation.md` 적용):
- windows .env (E:\\.env)
- ~/dev/ypserver-build/.env
- ~/ypserver/.env (exclude 보호)

secret 4개는 빈 값 (운영자 직접 채움), defaults 있는 2개는 명시값.

**검증**: tsc exit 0.

**결론**: commit `0d9a225 chore(aggregator): rss-parser/cheerio/@google/genai + .env.example 6 vars (B1)` (656 insertions).

### 토픽 5: B2 types + dedupe TDD — spec bug 1건 발견 + fix

spec types.ts (94 LOC) + dedupe.ts (151 LOC) 를 `src/lib/aggregator/` 에 이식. 핵심 변경:
- `import { prisma }` → `tenantPrismaFor(ctx)` (메모리 룰 `project_workspace_singleton_globalthis.md` 적용 — Prisma 7 ALS propagation 회피)
- `dedupeAgainstDb` 시그니처 +`ctx: TenantContext`

**TDD 25 케이스**: canonicalizeUrl 12 + urlHash 5 + dedupeAgainstDb 8.

1차 실행 24/25 PASS, 1 fail:
- 케이스 12 (`tag=b&tag=a`) → expected `?tag=a&tag=b` / 실제 `?tag=a&tag=a&tag=b&tag=b`
- 진단: spec 의 `URLSearchParams.keys()` 가 동일 키 multi-value 를 별도 entry 로 노출 → keepKeys 중복 → getAll() N×N 복제. spec 주석 "중복 키 보호" 와 정반대 동작 = spec bug.

**Fix**: `Array.from(new Set(keepKeys))` 로 키 unique 화 후 getAll 1회만 호출. 2차 실행 25/25 PASS.

**검증**:
- `npx vitest run tests/aggregator/dedupe.test.ts`: 25/25 PASS
- 전체 397/457 pass (60 skip env-gated)
- tsc exit 0

**결론**: commit `a121289 feat(aggregator): port types + dedupe with multi-tenant prisma (TDD, B2)` (545 insertions).

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | Track 우선순위 = B (Aggregator) > C (Messenger) > A sweep | Track A sweep 우선 / Track C 병렬 / Track B 직진 | 사용자 가치 (첫 카드 가시화) + 누적 차단일 (4개월 P0) + 7원칙 §2/§3/§4 첫 실증 |
| 2 | B-pre 코드 변경 0 (모두 문서) | 추가 sweep 코드 변경 / 발견사항 plan 만 baked-in | T1.7 이미 구현 + R1 존재 + R2 컨벤션 차이는 T4 commit 시 적용 |
| 3 | DB 시드 = 슬러그 source of truth | spec slug 사용 (DB 시드 마이그레이션) / classify.ts 슬러그 정정 / 하이브리드 매핑 | DB 가 운영 적용 + RLS+dbgenerated+composite unique 활성 / spec 변경 비용 0 / DB 변경 비용 ~2h |
| 4 | s79 leftover 회복은 별도 2 commit (B-pre 와 분리) | 단일 commit 묶기 / 분리 | git log 자기 설명 보장 (s79 의도 vs s80 의도) |
| 5 | tenantPrismaFor closure 패턴 강제 (prismaWithTenant 비사용) | prismaWithTenant 사용 / tenantPrismaFor 사용 | 메모리 룰 `project_workspace_singleton_globalthis.md` — Prisma 7 ALS propagation 깨짐 (commit `9621480` 사고) 회피 |
| 6 | spec dedupe.ts multi-value bug fix (TDD 가 발견) | spec 그대로 + 테스트 expected 정정 / spec fix | spec 주석 "중복 키 보호" 의도와 코드가 어긋남 = spec 자체 버그. 코드를 fix 하는 게 의도 정합 |
| 7 | dedupeAgainstDb 시그니처 +ctx 명시 (ALS 의존 X) | ctx 명시 / ALS 의존 (getCurrentTenant) | caller (runner.ts) 가 명시 전달이 ALS propagation 깨짐 시에도 안전 |

## 수정 파일 (5 commits)

| Commit | 영역 | 파일 | 변경 |
|---|---|---|---|
| `046fce8` | s79 recovery | `docs/logs/journal-2026-05-01.md` | +188 |
| `6a8a9eb` | s79 recovery | `docs/logs/2026-05.md` | +55 |
| `c20d90d` | B-pre | `docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md` (staging) + `slug-mapping-db-vs-spec.md` (신규 440 LOC) | +622 |
| `0d9a225` | B1 | `package.json` (+3 deps) + `package-lock.json` (+55 packages) + `.env.example` (+27) + 3곳 .env (memory rule sync) | +656 |
| `a121289` | B2 | `src/lib/aggregator/types.ts` (95 신규) + `src/lib/aggregator/dedupe.ts` (158 신규, multi-value bug fix) + `tests/aggregator/dedupe.test.ts` (TDD 25 신규) | +545 |

## 상세 변경 사항

### 1. B-pre — slug-mapping-db-vs-spec.md (440 LOC 신규)

DB 시드 (`prisma/seeds/almanac-aggregator-categories.sql`) 37 슬러그 ↔ spec classify.ts 40 슬러그 매핑 표. Track 별 (hustle 6/work 6/build 7/invest 6/learn 6/community 6 = 37) 결정 매트릭스 + T4 commit 시 적용 정책 + 검증 게이트 (RLS 통합 테스트로 FK 사전 차단) + 위험 4건 (S1~S4) + 결정 근거.

**핵심 결정**: DB = source of truth (운영 적용 + 변경 비용 비대칭). classify.ts SUBCATEGORY_RULES.slug 필드는 DB 슬러그 사용. `getAvailableCategorySlugs()` ↔ DB `content_categories` 동기화 통합 테스트 필수.

### 2. B1 — package.json + .env.example + 3곳 .env

**의존성 3 신규**:
- `rss-parser ^3.13` (MIT) — RSS/Atom 피드 파싱 (T5 fetchers/rss.ts 진입점)
- `cheerio ^1.0` (MIT) — HTML 스크래핑 (T5 fetchers/html.ts 진입점)
- `@google/genai ^1.0` (Apache-2.0) — Gemini Flash 클라이언트 (T6 llm.ts 진입점). plan `^0.X` 가정 정정.

**환경변수 6 신규** (`.env.example` + 3곳 실 .env):
- `GEMINI_API_KEY` (★★ secret) — 미설정 시 graceful (LLM 보강 skip)
- `AGGREGATOR_LLM_DAILY_BUDGET=200` — Gemini 일일 한도, 자정 KST 리셋
- `AGGREGATOR_BOT_USER_AGENT="YangpyeongBot/1.0 (+...)"` — fetcher UA
- `AGGREGATOR_MAX_ITEMS_PER_SOURCE=20` — 소스 1회 fetch 상한
- `FIRECRAWL_API_KEY` (★ secret) — kind=FIRECRAWL 소스 사용 시
- `PRODUCT_HUNT_TOKEN` (△ secret) — parserConfig.token 폴백

3곳 동기화 정책 (메모리 룰 `feedback_env_propagation.md`): windows + build + ypserver. 기본값은 명시, secret 은 빈 값.

### 3. B2 — types.ts + dedupe.ts + dedupe.test.ts

**types.ts (95 LOC)**: spec 그대로 (DB 의존 0). RawItem / EnrichedItem / FetchReport / AggregatorModule / AggregatorRunResult / RuleClassifyResult.

**dedupe.ts (158 LOC, multi-tenant 적응 + spec bug fix)**:
- `tenantPrismaFor(ctx)` closure 패턴
- `dedupeAgainstDb(items, ctx: TenantContext)` 시그니처
- canonicalizeUrl: keepKeys unique 화 (spec multi-value bug fix)
- urlHash: 동일

**dedupe.test.ts (TDD 25 케이스)**:
- canonicalizeUrl 12: trim/fragment/UTM/fbclid/_ga/IDN/trailing slash/포트/sort/multi-value
- urlHash 5: 안정성/distinct/canonicalize 흡수/대소문자/trailing slash
- dedupeAgainstDb 8: empty/all-fresh/all-dup/partial/batch 중복/canonicalize 영향/closure/SELECT 정확

`vi.mock("@/lib/db/prisma-tenant-client")` 로 prisma 격리. ALS 의존 0.

## 검증 결과

- `npx tsc --noEmit` — exit 0
- `npx vitest run tests/aggregator/dedupe.test.ts` — 25/25 PASS
- `npx vitest run` (전체) — 397/457 pass (60 skip env-gated DB 통합)
- `npm install` — 55 packages, 12 moderate vulns (전부 transitive, audit fix 차후)
- 3곳 .env 신규 키 6개 sync 확인
- git status clean (의도된 untracked + .claude/settings.json 제외)

## 터치하지 않은 영역

- **Track A sweep**: T1.5 worker pool 구현 (Phase 3 미루기), T1.6 데이터 backfill (aggregator 자연 충족)
- **Track C Messenger**: M2 19 라우트 (세션 86+ 진입 예정)
- **Track D Filebox 후속**: S78-D 폰 모바일 드래그 (P1 5분 보너스 — 본 세션 미진행), S78-H multipart cleanup cron (P1 ~30분 — 세션 82 B5 와 같은 사이클로 묶기 예정)
- 다른 터미널의 s79 /cs commit `0647b14` 영역 (handover/_index/solutions 신규)

## 알려진 이슈

- **B3 진입 시 R2 슬러그 매핑 적용 강제**: classify.ts SUBCATEGORY_RULES.slug 필드는 spec 그대로 복사 금지 — 매핑표 (`slug-mapping-db-vs-spec.md`) 의 결정에 따라 DB 슬러그 사용. RLS 통합 테스트로 FK 사전 차단.
- **Track A T1.5 worker pool 미완**: aggregator 는 main thread 동작 (ADR-028 §2.3 결정). cron AGGREGATOR 분기 (B6) 진입 시 worker pool 사용 불필요. Phase 3 진입 시점에 본 sweep 재개 권고.
- **다른 터미널 동시 작업 가능성**: 본 세션 중 `0647b14` (s79 /cs) push 발견. 메모리 룰 `feedback_concurrent_terminal_overlap.md` 룰 적용 — 매 commit 직전 `git log --oneline -5` + `git status --short` 점검 필수.
- **@google/genai 1.51.0 vs spec ^0.X 가정 차이**: API 호환성 spec 시점 (~v0.X) 과 다를 수 있음. T6 (llm.ts port) 진입 시 GoogleGenAI 클래스 시그니처 재확인 필수.

## 다음 작업 제안

### 세션 81 첫 작업 (B3 — classify.ts port)

**Plan**: `docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md` §6 T4. 매핑표: `slug-mapping-db-vs-spec.md`.

**작업 단위**:
1. `src/lib/aggregator/classify.ts` — spec 317 LOC 이식 + SUBCATEGORY_RULES.slug 필드 DB 슬러그로 정정 (매핑표 §1 적용)
2. work 트랙 신규 매처 2개 추가 (no-code, remote-work — DB 에만 있고 spec 에 없음)
3. invest/learn/community 트랙 신규 매처 5개 추가 (market-analysis/macro-economy/data-science/system-design/career-growth/discussion/korean-community)
4. `getAvailableCategorySlugs()` 유지 (DB 슬러그 노출)
5. `tests/aggregator/classify.test.ts` — TDD 40 케이스 (트랙 7 + 서브카테고리 슬러그 별 1~2 케이스 + 한국어 mix)
6. **RLS 통합 테스트** — `getAvailableCategorySlugs()` ↔ DB content_categories.slug 동기화 검증 (FK 사전 차단)

**예상 commit**: 1건 (classify.ts + tests, ~750 LOC).

### 후속 작업 (세션 82~85)

| 세션 | commit | 내용 |
|---|---|---|
| 82 | B4 | `feat(aggregator): port 4 fetchers (rss/html/api/firecrawl, mocked 30 케이스)` |
| 82 | S78-H | `feat(filebox): multipart cleanup cron 주 1회` (B7 사이클로 묶기) |
| 82 | B5 | `feat(aggregator): port llm + promote with multi-tenant tx (27 케이스)` |
| 83 | B6 | `feat(aggregator): port runner + cron AGGREGATOR dispatcher (kind union 확장 + RLS 통합 15 케이스)` |
| 84 | B7 | `feat(aggregator): seed 6 cron jobs (disabled) + production deploy` |
| 84 | B8 | `feat(aggregator): enable first 5 sources + 6 cron jobs (almanac launch)` |
| 85 | (관찰) | 24h 관찰 + Almanac 첫 카드 가시화 검증 |

### 운영자 검토 필요 항목

- `GEMINI_API_KEY` 발급 (Google AI Studio) — B5 (llm.ts) 진입 전 필요. 미설정 시 LLM 보강 skip 으로 graceful 동작하나 분류 품질 저하.
- `FIRECRAWL_API_KEY` — Firecrawl kind 소스 활성화 시 (현재 60 소스 모두 active=false 라 즉시 불필요).

## 저널 참조

- `docs/logs/journal-2026-05-02.md` — 본 세션 6 토픽 상세 (베이스라인 검증 / s79 recovery / B1 / B2 spec bug 발견 / /cs)

## 관련 파일

### 신규 (B-pre + B1 + B2)
- `docs/research/baas-foundation/05-aggregator-migration/slug-mapping-db-vs-spec.md` (440 LOC, T4 진입 게이트)
- `src/lib/aggregator/types.ts` (95 LOC)
- `src/lib/aggregator/dedupe.ts` (158 LOC, multi-value bug fix)
- `tests/aggregator/dedupe.test.ts` (TDD 25 케이스)
- `docs/solutions/2026-05-02-spec-port-tdd-multivalue-bug.md` (CK 신규)

### 수정 (B1)
- `package.json` (+3 deps)
- `package-lock.json` (+55 packages)
- `.env.example` (+27)
- (저장소 외) windows .env / ypserver-build/.env / ypserver/.env

### 회복 (s79 leftover)
- `docs/logs/journal-2026-05-01.md` (+188)
- `docs/logs/2026-05.md` (+55)

---

## 후기 — 동일 세션 B3 추가 (e74f3ef)

> b46918c "/cs 의식" (다른 터미널) 처리 후 같은 세션 80 안에서 B3 (classify.ts port) 가 추가됨. 본 섹션이 정합화 후기.

### 토픽 6: B3 진입 — classify.ts port (TDD 40 + 한글 \\b boundary spec bug 차단)

> **사용자**: "b3 진행"

본 인수인계서가 1차 작성된 직후, 같은 conversation 에서 사용자가 B3 작업을 즉시 지시. 메모리 룰 `feedback_concurrent_terminal_overlap` 적용 — `git log --oneline -5` 점검 시 HEAD=`b46918c` (다른 터미널이 작성한 next-dev-prompt 가 "B3 = 세션 81 첫 작업" 으로 표시 중). 같은 세션에서 B3 진행하기로 결정 (작업 단위는 이미 plan 에 명시되어 있고 ~3h 추정으로 적당).

**B3-1 (RED, TDD 40 케이스 작성)**:
- `tests/aggregator/classify.test.ts` 신규 (40 케이스 9 그룹):
  - A. getAvailableCategorySlugs DB 시드 37 슬러그 정합 (5)
  - B. classifyItem 트랙 매처 (10)
  - C. 서브카테고리 build 7 (8 — rag-agents 병합 2건 포함)
  - D. work 6 (3) / E. hustle 6 (2) / F. invest 6 (3) / G. learn 6 (3) / H. community 6 (3)
  - I. 한국어 + matched 배열 (3)
- 한글 케이스 12개 강제 포함 (test 18/22/25/26/27/28/30/31/33/34/36/37/38).
- 1차 RED: classify.ts 미존재 → import 실패 (기대대로 RED).

**B3-2 (GREEN, classify.ts port + 41 항목 매핑 변경)**:

`src/lib/aggregator/classify.ts` 신규 (308 LOC, spec 317 LOC).

DB 시드 매핑 적용 (`slug-mapping-db-vs-spec.md` 기준, **41 항목 변경**):
- **drop 14**: marketing-growth, automation, model-releases, fine-tuning, ai-safety, benchmarks, valuation, earnings, courses, guides, case-studies, explainers, meetups, open-positions
- **단/복수 정정 7**: side-project, indie-hacker, tutorial, deep-dive, conference, hackathon, layoff-restructure
- **의미 정정 7**: saas-bootstrap (← saas-business), productivity (← productivity-tools), team-ops (← team-collaboration), ai-workflow (← ai-at-work), knowledge-mgmt (← knowledge-management), infrastructure (← ai-infrastructure), funding (← ai-funding), paper-summary (← research-papers)
- **병합 3**: rag-agents (rag-vector + agents 통합), public-markets (← earnings 흡수), layoff-restructure (← layoffs 정정 + 정리해고/구조조정 병합)
- **DB 신규 11**: no-code, remote-work, korean-tech, data-science, system-design, career-growth, discussion, korean-community, macro-economy, market-analysis, research-paper

**한글 \\b boundary spec bug 차단** (B2 multi-value bug 자매):

spec 의 `compilePattern` 이 `\\b` 사용. JS 의 `\\b` 는 `\\w` (=[A-Za-z0-9_]) 전용 ASCII boundary. 가-힣 음절은 non-word 로 취급되어 한글 키워드 양쪽 boundary 가 잡히지 않음 → spec 의 모든 한글 키워드 (TRACK_RULES 6+ + 서브카테고리 매처 다수) 가 production 에서 매치되지 않을 silent regression.

**fix**: `compilePattern` 을 lookbehind/lookahead 로 교체 — `(?<![\\w가-힣])(?:키워드)(?![\\w가-힣])`. ASCII/한글 통합 word-class 정의. 한글 12개 케이스 강제로 검증.

**iteration order 결정**: 한글 fix 적용 시 '인프라' 같은 일반 한글 키워드가 양쪽 매처(korean-tech, infrastructure)에 동시 노출. first-match-wins 룰에서 한국 회사명 텍스트가 한국 매처를 우선 채택하도록 build 트랙 SUBCATEGORY 순서를 `open-source-llm → ai-companies → korean-tech → infrastructure → rag-agents → devtools → research-paper` 로 결정. test 22 ("네이버 카카오 AI 모델 출시 / 라인 우아한 인프라" → korean-tech) 가 강제 검증.

**B3-3 (검증 + commit)**:
- `npx tsc --noEmit` exit 0
- `npx vitest run tests/aggregator/classify.test.ts` 40/40 PASS
- `npx vitest run` (전체) **437/497 pass** (B2 397 + B3 40, 회귀 0)
- `b46918c` 다른 터미널 commit 의 산출물 (docs only) 과 충돌 0 — B3 코드 (classify.ts/.test.ts) 는 신규 코드 2 파일

**Commit**: `e74f3ef feat(aggregator): port classify with DB slug mapping (TDD 40, B3)` — 769 insertions (308 + 461 LOC).

### 토픽 7: /cs 정합화

본 인수인계서 + 다른 터미널이 작성한 6 파일 (`current.md` row 80, `logs/2026-05.md` s80 entry, `journal-2026-05-02.md`, `next-dev-prompt.md`, `_index.md`, `2026-05-02-spec-port-tdd-multivalue-bug.md`) 모두 "B-pre+B1+B2 만 완료" 가정으로 작성됨. B3 추가에 따라 ~7 파일 갱신 필요:
- 본 파일 (## 후기 섹션 — 본 섹션)
- `docs/logs/journal-2026-05-02.md` 끝에 [7]/[8] entry append
- `docs/logs/2026-05.md` s80 entry 갱신 (5 commits → 6 commits, 검증 결과 397→437, 토픽 6/7/8 추가)
- `docs/status/current.md` row 80 정정 (5 commits → 6 commits)
- `docs/handover/_index.md` row 80 정정
- `docs/handover/next-dev-prompt.md` (B3 ✅ 완료 마킹, B4 가 세션 81 첫 작업으로 승격)
- `docs/solutions/2026-05-02-classify-korean-boundary-spec-bug.md` (CK 신규, B3 한글 boundary fix)

## 후기 의사결정 (B3)

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|-------------|----------|
| 8 | spec `\\b` boundary → lookbehind/lookahead 로 교체 | A. spec 그대로 + 한글 keywords drop / B. spec 그대로 + 한글 keywords 만 별도 regex / C. lookbehind+lookahead `[\\w가-힣]` (선택) | 한글 keywords 보존 + ASCII keywords 동작 동일 + Node 24 lookbehind 지원 + 매처 코드 단일 (분기 0). 메모리 룰 `feedback_baseline_check_before_swarm` 정신 (한글 케이스가 spec 검증 범위 밖일 가능성을 사전 탐지). |
| 9 | SUBCATEGORY_RULES build 순서 = `... korean-tech → infrastructure ...` | A. 알파벳 순 / B. 추가 순서 / C. 일반→특수 / D. 특수→일반 (선택) | 한글 fix 부수효과 회피. '인프라' 같은 일반 한글 키워드가 양쪽 매처에 노출될 때 한국 회사명 우선 채택. test 22 가 강제 검증. |
| 10 | 같은 세션에서 B3 진행 (다른 터미널 /cs 후) | A. 세션 81 로 연기 / B. 같은 세션 진행 + 후기 정합화 (선택) | B3 작업 단위 명확 (~3h plan), 사용자 명시 지시 ("b3 진행"). 정합화 비용 (~7 파일) 감수. 메모리 룰 `feedback_concurrent_terminal_overlap` 후속 강화 사례. |

## 후기 검증 결과 (B3)

- `npx tsc --noEmit` exit 0
- `npx vitest run tests/aggregator/classify.test.ts` — 40/40 PASS
- `npx vitest run` (전체) — 437/497 pass (60 skip env-gated DB), B2 397 + B3 40 = 437, 회귀 0
- git status clean (의도된 untracked + .claude/settings.json drift 제외)
- `b46918c` 다른 터미널 commit 과 파일 충돌 0

## 후기 다음 작업 제안 (B3 완료 → B4 우선)

**세션 81 첫 작업** = **B4 4 fetchers port** (rss/html/api/firecrawl, ~5h, P0 다음).
- spec `src/lib/aggregator/{rss,html,api,firecrawl}-fetcher.ts` 4 파일 이식
- nock/msw mock 패턴 (외부 HTTP 호출 격리)
- TDD ~30 케이스 (fetcher 별 7~8 케이스: happy path / 빈 응답 / 잘못된 형식 / 인코딩 / 타임아웃 / 한글 title)
- 한글 fix 후속 효과: fetcher 측 source title/summary 한글 처리도 자동 정상 (classify 가 매치하므로)

---

## 후속 후기 — B4 + B5 + B6 (동일 세션 80, 0ad2f9a 정합화 후 추가)

> 0ad2f9a B3 정합화 직후 사용자 "b4 진행 / b5,b6 도 진행" 요청으로 P0 본진의 나머지 3 commit 추가. Track B 의 코드 본진 6 모듈 (types/dedupe/classify/fetchers/llm/promote/runner + cron AGGREGATOR dispatcher) **모두 완료**. 잔여 = B7 시드+배포 / B8 활성화.

### 토픽 9 — B4: 4 fetchers (rss/html/api/firecrawl) port + TDD 30

> **사용자**: "b4 진행 ...."

next-dev-prompt vs 직전 assistant 메시지 정의 충돌 해소 (assistant 가 B4/B6 혼동) — `wave-wiggly-axolotl.md` + `next-dev-prompt` 모두 일관되게 fetchers 가리킴. **baseline 검증 룰이 정확히 이런 케이스 회피**.

spec 4 파일 (706 LOC) → src/lib/aggregator/fetchers/ 이식. **DB 미터치 → multi-tenant 적응 0줄**. fetcher 는 외부 HTTP only.

**TDD 30 케이스**: rss(7) + html(8) + index(2) + api(13: HN+Reddit+ProductHunt+ArXiv+Firecrawl). 1차 21/30 PASS, 2 distinct issues:
1. **vi.fn(arrow) `new` 호출 불가** (rss-parser mock 7건): function expression 으로 변경
2. **B4 spec port-time bug — ArXiv link regex 순서 의존**: `rel="alternate"` 가 `href` 앞에 있을 때만 매치. 양 순서 처리하는 `extractAlternateLink()` 신규.

추가 1 fix: `cheerio.AnyNode` import 경로 변경 (cheerio 1.x → `domhandler` 직접).

**검증**: 30/30 PASS / tsc 0 / 전체 467/527 (B3 437 + B4 30, 회귀 0).

**Commit**: `100ae5c feat(aggregator): port 4 fetchers ... (B4)` — 5 파일 +1,481 LOC.

### 토픽 10 — B5: llm + promote multi-tenant tx + TDD 27

> **사용자**: "b4 끝나고 B5, b6도 진행."

**llm.ts** (DB 미터치 → spec 그대로): Gemini Flash 래퍼, 6.5초 throttle, 일일 한도 200, 모든 실패 graceful (ruleResult only).

**promote.ts** (multi-tenant 적응 2건):
- `promotePending(ctx, batch?)` 시그니처 (ctx 첫 인자)
- findMany 2건 → `tenantPrismaFor(ctx)` / upsert + update → `withTenantTx(ctx.tenantId, fn)` 1 transaction

**TDD 27 (2 파일)**: llm 13 + promote 14. 1차: llm 13/13 ✓ / promote 0/14 (vi.mock 호이스팅 fail).

**fix 1 — vi.hoisted 패턴**: factory 가 outer mock 인스턴스 직접 참조 → 호이스팅 시 const 미초기화. `vi.hoisted(() => {...})` 로 mock 묶음. dedupe 패턴 (closure 안 참조) 과의 차이 = assertion 위해 mock instance reference 필요할 때만.

**fix 2 — B5 spec port-time bug — slugify NFKD**: `'AI 도구 소개'` → expected `ai-도구-소개-<hash8>` / 실제 `ai-<hash8>`. spec slugify 의 `normalize("NFKD")` 가 한글 음절 (가-힣) 을 jamo (U+1100~U+11FF) 로 분해 → 이후 `[^a-z0-9가-힣]` 가 jamo 매치 실패 → 한글이 모두 hyphen → 빈 슬러그. **fix**: NFKD 후 NFC 재결합. Latin diacritic 제거 효과는 보존.

**운영 함정**: 운영 발견 시 한글 카드 모두 `slug = "item-<urlHash>"` → 의미 없는 URL + slug 충돌 가능.

**검증**: 27/27 PASS / tsc 0 / 전체 494/554 (B4 467 + B5 27, 회귀 0).

**Commit**: `58a526a feat(aggregator): port llm + promote with multi-tenant tx (TDD 27, B5)` — 4 파일 +981 LOC.

### 토픽 11 — B6: runner + cron AGGREGATOR dispatcher + kind union 확장 + TDD 15

**4 파일 동시 수정 — 단일 commit 필수** (TS 컴파일 차단 회피):
- `src/lib/types/supabase-clone.ts`: CronKindPayload 에 AGGREGATOR variant
- `src/lib/cron/registry.ts`: ScheduledJob.kind union + 2 cast 모두 4-value
- `src/lib/cron/runner.ts`: dispatchCron job.kind + 신규 `dispatchAggregatorOnMain`
- `src/app/api/v1/cron/{,[id]/}route.ts`: z.enum 4-value

**runner.ts 신규** (multi-tenant 적응 + 5 sub-runner):
- `runAggregatorModule(ctx, {module, batch?})` — ctx 첫 인자
- 5 sub-runner: rss-fetcher / html-scraper / api-poller / classifier / promoter
- processSingleSource: cross-source 격리 (소스 try-catch). 성공 시 consecutiveFailures=0 + lastSuccessAt
- markSourceFailure: 5 도달 시 active=false 자동 비활성

**cron AGGREGATOR**: `dispatchAggregatorOnMain(payload, tenantId, started)` — payload.module 검증 + ctx={tenantId} wrap.

**TDD 15 (2 파일)**: runner 10 (module dispatch 5 + 알 수 없는 module + processSingleSource success/failure/임계/cross-source 격리) + cron-aggregator-dispatch 5 (kind=AGGREGATOR / module 누락 / tenantId / batch / 결과 반환).

**1차 RED → GREEN 단번에 15/15 PASS** (vi.hoisted 패턴 사전 적용 효과). spec port-time bug 추가 0건.

**검증**: 15/15 PASS / tsc 0 / 전체 509/569 (B5 494 + B6 15, 회귀 0).

**Commit**: `7c50c9f feat(aggregator): port runner + cron AGGREGATOR dispatcher (TDD 15, B6)` — 8 파일 +815/-12 LOC.

### 토픽 12 — 사용자 질문: "B작업은 몇번까지 있어?"

전체 시퀀스 매핑 보고: B-pre + B1~B8 = **9개**. 완료 7개 (B-pre/B1/B2/B3/B4/B5/B6) / 남음 2개 (B7 시드+배포 ~3h / B8 활성화 ~2h). 후속 = 세션 85 24h 관찰, 86~ Track C M2 19 라우트.

### 토픽 13 — /cs 의식 — 세션 80 3차 정합화

세션 80 안에서 /cs 가 3회 처리 (b46918c B-pre+B1+B2 / 0ad2f9a B3 정합화 / 본 conversation B4+B5+B6 정합화). 산출 ~9 파일.

---

## 후속 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 9 | B4 정의 = 4 fetchers (assistant 혼동 정정) | A. fetchers (next-dev-prompt) / B. runner+cron (assistant) | A — wave plan + handover 모두 일관, baseline 검증 룰 적용 |
| 10 | vi.mock 호이스팅 — vi.hoisted 패턴 | A. inline closure (dedupe) / B. vi.hoisted | B — assertion 위해 mock instance reference 필요한 promote/runner test 에서만 |
| 11 | NFKD slugify 한글 fix | A. NFC 재결합 (선택) / B. NFKD 제거 (Latin diacritic 효과 손실) / C. 정규식에 jamo 추가 (복잡) | A — Latin diacritic 효과 보존 + 한글 음절 복원 |
| 12 | B6 kind union 4 파일 단일 commit | A. 단일 (선택) / B. 분할 | A — TS literal union 부분 commit 시 타입 cascade |
| 13 | 같은 세션 안 /cs 3회 정합화 | A. 매번 정합화 (선택) / B. 마지막 1회만 | A — 다른 터미널 작업물 (b46918c, 0ad2f9a) 이 이미 docs 갱신 → 추가 작업도 누적 정합화 필요 |

## 후속 수정 파일 (17개)

| # | 파일 | 변경 |
|---|------|------|
| 1 | src/lib/aggregator/fetchers/index.ts | 신규 (53 LOC) — kind 디스패처 |
| 2 | src/lib/aggregator/fetchers/rss.ts | 신규 (130 LOC) — rss-parser |
| 3 | src/lib/aggregator/fetchers/html.ts | 신규 (191 LOC) — cheerio + AnyNode from domhandler |
| 4 | src/lib/aggregator/fetchers/api.ts | 신규 (351 LOC) — 5 어댑터 + extractAlternateLink (B4 fix) |
| 5 | tests/aggregator/fetchers.test.ts | 신규 (TDD 30) |
| 6 | src/lib/aggregator/llm.ts | 신규 (213 LOC) — spec 그대로 |
| 7 | src/lib/aggregator/promote.ts | 신규 (134 LOC) — multi-tenant tx + slugify NFC fix (B5) |
| 8 | tests/aggregator/llm.test.ts | 신규 (TDD 13, vi.hoisted + resetModules) |
| 9 | tests/aggregator/promote.test.ts | 신규 (TDD 14, vi.hoisted) |
| 10 | src/lib/aggregator/runner.ts | 신규 (273 LOC) — 5 sub-runner + cross-source 격리 |
| 11 | src/lib/cron/runner.ts | dispatchCron + dispatchAggregatorOnMain |
| 12 | src/lib/cron/registry.ts | ScheduledJob.kind + 2 cast 4-value |
| 13 | src/lib/types/supabase-clone.ts | CronKindPayload + AGGREGATOR variant |
| 14 | src/app/api/v1/cron/route.ts | z.enum 4-value |
| 15 | src/app/api/v1/cron/[id]/route.ts | z.enum 4-value |
| 16 | tests/aggregator/runner.test.ts | 신규 (TDD 10) |
| 17 | tests/cron/cron-aggregator-dispatch.test.ts | 신규 (TDD 5) |

## 후속 검증 결과

- `npx tsc --noEmit` — 에러 0
- `npx vitest run`(전체) — 509/569 (B6 15 신규 + 회귀 0)
- B4 30/30 / B5 27/27 / B6 15/15 = 신규 72 PASS

## 후속 알려진 이슈

- 없음. B7 진입 차단 사항 0.

## 후속 다음 작업 제안

1. **B7 시드 + 배포** (~3h, 세션 81 첫 작업) — `scripts/seed-aggregator-cron.ts` 작성. cron_jobs 6 row INSERT (enabled=FALSE):
   - almanac-rss-fetch (every 30m, AGGREGATOR module=rss-fetcher)
   - almanac-html-scrape (every 1h, html-scraper)
   - almanac-api-poll (every 1h, api-poller)
   - almanac-classify (every 15m, classifier batch=50)
   - almanac-promote (every 30m, promoter batch=50)
   - almanac-cleanup (daily 04:00, ???)
   - **마이그레이션 0건** (DDL 변경 X). `feedback_migration_apply_directly` 메모리 룰 = Claude 직접 시드 실행 책임.
2. **B8 5 소스 점진 활성화** (~2h, B7 직후) — content_sources 60 중 5 active=TRUE + cron_jobs 6 enabled=TRUE → 24h 관찰 윈도우.
3. **운영자 발급 대기**: GEMINI_API_KEY (B5 graceful 가능 — 누락 시 ruleResult only). FIRECRAWL_API_KEY (선택, Firecrawl 어댑터만 영향). PRODUCT_HUNT_TOKEN (선택, ProductHunt 어댑터만).
4. **세션 85 관찰 SQL** 준비: `SELECT COUNT(*) FROM content_items WHERE tenant_id='almanac'` + cron_jobs.consecutiveFailures + Gemini quota.

---
[← handover/_index.md](./_index.md)
