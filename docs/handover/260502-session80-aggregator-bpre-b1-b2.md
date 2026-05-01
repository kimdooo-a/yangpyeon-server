# 인수인계서 — 세션 80 (Track B Aggregator B-pre + B1 + B2)

> 작성일: 2026-05-02
> 이전 세션: [session79](./260501-session79-multipart-body-truncation-fix.md)

---

## 작업 요약

Track B (Almanac aggregator P0 본진, ~28h) 첫 진입. wave 진행도 plan 작성 → 베이스라인 검증으로 plan 가정 3건 정정 → s79 leftover 회복 2 commit + B-pre + B1 + B2 = 총 5 commit. spec dedupe.ts 의 multi-value bug 1건 TDD 로 발견 + fix.

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
[← handover/_index.md](./_index.md)
