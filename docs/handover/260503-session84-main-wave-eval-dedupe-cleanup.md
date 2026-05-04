# 인수인계서 — 세션 84 (메인 터미널) wave 평가 + S84-D dedupe Fix A/B + cleanup cron 부채 해소 + wave-tracker 영속화

> 작성일: 2026-05-03 (commit timestamp), 종료 의식: 2026-05-04
> 이전 세션: [session83](./260502-session83-timezone-audit-source-expand-cron-cleanup.md)
> 자매 (다른 터미널, 동일 세션 84 동시 진행): [session84 M4 UI Phase 1](./260503-session84-m4-ui-phase1.md)
> 충돌 영역: 0% (영역 분리 — 메인 = backend/docs, 다른 터미널 = frontend)
> 산출물 분리:
> - 메인 commits: `da39576` `0bcc283` `f4bdf8f` `f8caa26` (4개)
> - 다른 터미널 commit: `f3bf611` (1개)

---

## 작업 요약

세션 시작 시 사용자가 "wave 기반 개발 진척도 평가" 요청 → 4-Track 매트릭스 + 압축 실행 통계 + S82 4 latent bug 분석 + 잔여 작업 종합 보고. 이후 사용자 "최대한 자율 진행" 지시 → (1) 다른 터미널 위임 프롬프트 작성, (2) wave 영속화 + PR 리뷰 게이트 룰 정착, (3) S84-D dedupe 진단 + Fix A 코드 + Fix B 데이터 마이그레이션, (4) cleanup cron 부채 해소 (AGGREGATOR module=cleanup) 4 단계 직진.

**산출 핵심 4건**:
1. wave-tracker.md (외부 plan 영속화) + PR 리뷰 게이트 룰 5 항목 (CLAUDE.md)
2. dedupe Fix A (코드 explicit tenantId) + Fix B (130 default → almanac UPDATE)
3. cleanup 모듈 (SQL→AGGREGATOR 이전, 라이브 검증 PASS, 배포 대기)
4. M4 UI Phase 1 위임 프롬프트 (다른 터미널이 그대로 실행하여 frontend chunk 동시 완성)

---

## 대화 다이제스트

### 토픽 1: wave 기반 개발 진척도 평가 (사용자 요청)

> **사용자**: "wave 기반 개발 진척도 (지난 세션 기록에 의한 수정내용 확인) 평가"

다층 산출물 (MASTER-DEV-PLAN + 외부 plan `~/.claude/plans/wave-wiggly-axolotl.md` + 핸드오버 + git log) + 실제 코드 변경분 교차 검증 수행. **4-Track 매트릭스 도출**:

| Track | 영역 | 진척도 | 마지막 마일스톤 |
|---|---|---|---|
| A | BaaS Foundation | ~95% | S82 라이브 검증 4 latent bug fix |
| B | Almanac Aggregator | 100% | S81 첫 라이브 카드 50개 |
| C | Messenger Phase 1 | 60% (M3까지) | S82 M3 user 채널 4 이벤트 |
| D | Filebox | stabilized | S83 multipart cleanup cron |

**압축 실행 통계**: S81 = 5x (5 마일스톤 단일 세션), S80 = 2.3x (7 단계 단일). 압축 가능 3 조건 = 헬퍼/스키마 사전 완비 + 단일 패턴 + runNow 결정적 검증.

**S82 4 latent bug 분류** (Prisma extension RLS escape, PrismaPg timezone shift, AbuseReport @map 누락, 5 fixture/test) — 모두 prod BYPASSRLS + 양방향 timezone cancel 로 가려져 있던 부채.

**잔여 우선순위 도출**: M4 UI 보드 (5~7일 chunk) = 다음 단일 가장 큰 가치.

**결론**: 보고서 형태 종합 평가 + 권고 5건 (timezone fix 적용 / wave 문서 영속화 / PR 리뷰 게이트 / RLS+tenantPrismaFor closure 강제 / non-BYPASSRLS 라이브 테스트 머지 게이트).

### 토픽 2: 자율 실행 모드 진입 + 다른 터미널 위임

> **사용자**: "1. 최대한 너가 모든 것을 종합적으로 검토후 최적의 결정으로 진행하도록. 다른 터미널에서 병렬로 진행해도 되는 부분에 대해서 먼저 상세 프롬프트를 만들어 주고 너의 작업분량을 진행 (최대한 많이 진행 바람)"

**병렬 영역 분리 설계**:
- 다른 터미널 = M4 UI Phase 1 (frontend-only, `src/app/messenger/*` + `src/components/messenger/*` + `src/hooks/messenger/*` 신규 + sidebar.tsx 1줄)
- 메인 터미널 = wave 영속화 + PR 리뷰 룰 + S84-D dedupe 진단 + cleanup cron (모두 backend/docs)
- 충돌 영역 0% 보장

**위임 프롬프트 작성**: `docs/handover/s84-parallel-prompt-m4-ui-phase1.md` (151 줄). 와이어프레임 + PRD + API 17 엔드포인트 + SSE 키 빌더 + 디자인 토큰 + TDD 8 + 머지 게이트 5 항목 모두 명시. 다른 터미널이 새 세션 열 때 이 파일을 첫 입력으로 사용.

**결론**: 다른 터미널 즉시 시작 가능 + 메인 터미널은 S84-D 등 backend 작업 직진.

### 토픽 3: wave 영속화 + PR 리뷰 게이트 룰 정착

외부 plan (`~/.claude/plans/wave-wiggly-axolotl.md`, S80 작성) 가 git 추적 밖에 있어 다음 세션 컨텍스트 손실 위험 식별. 핵심 매트릭스를 git tracked 영역으로 이식.

**산출**:
- `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md` (4-Track 매트릭스 + 압축 실행 통계 + 잔여 + 갱신 이력 정책)
- `CLAUDE.md` doc tree 에 wave-tracker 라인 추가
- `CLAUDE.md` 신규 섹션 "PR 리뷰 게이트 룰 (S82 4 latent bug 재발 차단)" — 5 필수 항목:
  1. 신규 모델 = `tenantId` 첫 컬럼 + RLS + composite unique
  2. 신규 라우트 = `withTenant()` + cross-tenant 격리 테스트
  3. Prisma 호출 = `tenantPrismaFor(ctx)` closure 패턴
  4. **non-BYPASSRLS role 라이브 테스트 1회 통과** (`scripts/run-integration-tests.sh`)
  5. timezone-sensitive 비교 = round-trip cancel 또는 raw SQL workaround 명시

**결론**: 향후 모든 backend PR 본문에 5 항목 필수 명시. S82 부채 패턴 재발 자동 차단.

### 토픽 4: S84-D dedupe 진단 + Fix A 코드 + Fix B 데이터

S83 의 "inserted=0 duplicates=130" 원인 추적. **3 단계 진단**:

**1차 — 진단 스크립트** (`scripts/b8-dedupe-diagnose.ts` 신규, 영구 정착): 소스별 ingested 분포 + cross-source collision + status 분포 + tenant 분포.

**2차 — 충격적 발견**: ContentIngestedItem 분포가 `default tenant=130 + almanac=1`. 그런데 ContentItem 131 모두 almanac. 그 중 130 의 `ingestedItemId` FK 가 default tenant 의 ingested 를 가리킴 → **cross-tenant FK 부정합**.

**3차 — Root cause 3중 분석**:
1. **dedupe.ts WHERE 절에 explicit tenantId 누락** — RLS 의존
2. **prod = postgres BYPASSRLS** — RLS 행 필터링 효과 없음
3. **130 legacy default-tenant rows** — S82 Prisma extension fix 이전 fetcher 작업 잔재. dbgenerated `COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-0000-0000-0000-000000000000')` 가 SET LOCAL 미적용 시 default sentinel 로 fallback.

**Fix A 코드** (`da39576`):
```ts
// dedupe.ts:157
where: { tenantId: ctx.tenantId, urlHash: { in: hashes } },
```
TDD 신규 케이스 26 추가 (`expect(callArgs.where.tenantId).toBe(...)`). 26/26 PASS, 회귀 0.

**Fix B 데이터** (직접 SQL):
- 사전 검증 `default ↔ almanac urlHash 충돌 = 0`
- `UPDATE content_ingested_items SET tenant_id = almanac WHERE tenant_id = default` (130 rows)
- 사후 cross-tenant FK = 0 검증
- 결과: ingested=131 / items=131 / cross-tenant FK 0

**산출**: `docs/solutions/2026-05-03-dedupe-cross-tenant-collision-root-cause.md` (Fix A + Fix B 양쪽 적용 완료 status).

**결론**: BYPASSRLS prod role + RLS 의존 코드 = 침묵 cross-tenant data leak 의 거의 확실한 레시피. 이 패턴이 PR 리뷰 게이트 룰 #2 의 unit test 모범으로 baked-in.

### 토픽 5: cleanup cron read-only transaction 부채 해소

S84-D 진단 도중 발견: `almanac-cleanup` 가 매일 03:00 KST 마다 FAILURE — `cannot execute DELETE in a read-only transaction`.

**Root cause**: SQL kind cron 핸들러 (`src/lib/cron/runner.ts:46-65`) 가 의도적으로 `runReadonly` 풀 사용 (07-adr-028-impl-spec §2.3 — connection 안정성). DELETE payload SQL 이면 read-only transaction 에서 거부.

**Fix 옵션 비교** → 옵션 (b) AGGREGATOR module=cleanup 선택 (일관성 + tenant 격리 + Fix A 의 explicit tenantId 룰 자연 적용).

**산출** (`f4bdf8f`):
- `src/lib/aggregator/cleanup.ts` 신설 — `runCleanup(ctx, options)` withTenantTx + deleteMany WHERE status IN (rejected, duplicate) + fetchedAt < cutoff (default 30일) + tenantId 명시
- `tests/aggregator/cleanup.test.ts` TDD 6 PASS
- `AggregatorModule` union 에 "cleanup" 추가
- `runner.ts` switch case "cleanup" + `runCleanupModule` 호출
- `seed-aggregator-cron.ts` SQL→AGGREGATOR 이전

**DB 적용** (CLAUDE.md "마이그레이션 작성 = 즉시 적용"):
- `UPDATE cron_jobs SET kind='AGGREGATOR', payload='{"module":"cleanup"}', consecutive_failures=0 WHERE name='almanac-cleanup'` (1 row)
- b8-runnow 라이브 검증 = `SUCCESS 23ms deleted=0` (현재 rejected/duplicate 0건 정상)

**prod 배포 보류**: 다른 터미널 M4 UI Phase 1 WIP 가 transient state (ConversationList.tsx 가 useConversations 미작성 import → next build type-check 차단). 다른 터미널 commit 후 운영자 또는 다음 세션이 배포.

**결론**: 코드 + DB row 정합 + 라이브 검증 완료. 배포만 운영자/다음 세션. 자연 cron tick 24h 추가 fail 가능성 (failure mode 만 변경 — "알 수 없는 module: cleanup", 기능 영향 0).

### 토픽 6: 다른 터미널 컨텍스트 손실 + 사용자 회신 작성

> **사용자**: "뭐라고 답해야되? [다른 터미널이 'wave-tracker.md untracked 상태' + '메인 터미널 3 sub-task 가 뭔지' 질문]"

다른 터미널이 새 세션 시작했지만 `git pull` 전이라 메인 commits 안 보임. 그래서 stale state (wave-tracker.md 가 untracked 처럼 보임) 으로 질문한 것. 답변 = `git pull` 받으면 모두 해소.

**3 sub-task 의 실제 정체** (다른 터미널이 추정한 것 vs 실제):
- "MASTER-DEV-PLAN 부록" → 실제는 별도 파일 wave-tracker.md
- "CLAUDE.md 신규 룰" → PR 리뷰 게이트 룰 5 항목
- "dedupe.ts 분석" → S84-D 진단 + Fix A + Fix B (둘 다 적용 완료)

다른 터미널 답변 메시지 작성 (사용자가 그대로 복사해서 다른 터미널 입력). 포함: pull 명령 + 받게 될 commits 예상 + 3 sub-task 실제 결과 + 다른 터미널 작업 (M4 UI Phase 1) 위치.

**결론**: 다른 터미널이 pull 후 즉시 M4 작업 시작. 본 메인 터미널은 cleanup cron fix 자율 진행 결정.

### 토픽 7: cleanup cron fix 진행 + /cs

> **사용자**: "시작"

cleanup 부채 해소 진행 (위 토픽 5 참조). 이후 사용자 `/cs` 요청.

**결론**: 본 인수인계서 작성 + commit + push.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | wave 영속화 = 별도 wave-tracker.md (MASTER-DEV-PLAN 부록 X) | 부록 vs 별도 파일 | MASTER-DEV-PLAN 비대화 회피 + 갱신 정책 ("세션 종료마다 row") 명시 가능 + 다른 wave 와 분리 (Supabase Wave 1~5 = `01-wave-compatibility-matrix.md`, 본 wave = `wave-tracker.md`) |
| 2 | 다른 터미널 위임 = M4 UI Phase 1 단일 chunk | M4 전체 (5~7일) / Phase 1 만 / 더 작게 | "한 세션 짧은 작업 경향" 사용자 발언 + Phase 1 = 단일 세션 chunk + backend 완성으로 frontend 단독 진입 가능 (충돌 0) |
| 3 | dedupe Fix B 자율 적용 (사용자 의사결정 미요청) | 사용자 승인 후 적용 / 자율 적용 | 사용자 메모리 `feedback_autonomy` (분기 질문 금지) + 사전 검증 0 충돌 + reversible (UPDATE) + 트래픽 영향 0 + cross-tenant FK 회복 |
| 4 | cleanup cron fix = 옵션 (b) AGGREGATOR module=cleanup | (a) SQL writable opt-in / (b) AGGREGATOR / (c) MAINTENANCE 신규 | 일관성 (이미 AGGREGATOR dispatch 패턴 정착) + tenant 격리 자연 적용 + Fix A 의 explicit tenantId 룰 자동 적용 |
| 5 | cleanup 배포 보류 (다른 터미널 WIP 안정화 대기) | 즉시 deploy / 다른 터미널 stash / 배포 보류 | 다른 터미널 transient state 가 next build 차단 + cleanup 자체는 라이브 검증 PASS = 배포만 미적용 + 24h fail 영향 0 (rejected/duplicate 0 행) |
| 6 | git commit 단위 = 메인 4 commits 분할 | 단일 / 분할 | "기능 단위 commit" CLAUDE.md 규칙 — code/docs/cleanup/wave-tracker 4 단위 분리 |

---

## 수정 파일 (메인 터미널 산출 8개 신규 + 3개 수정)

| # | 파일 | 변경 | commit |
|---|------|------|--------|
| 1 | `src/lib/aggregator/dedupe.ts` | WHERE 절 explicit tenantId 추가 (Fix A) | `da39576` |
| 2 | `tests/aggregator/dedupe.test.ts` | 신규 케이스 26 (cross-tenant 격리) | `da39576` |
| 3 | `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md` | 신규 (4-Track 매트릭스 영속화) | `0bcc283` `f8caa26` |
| 4 | `CLAUDE.md` | doc tree wave-tracker 라인 + PR 리뷰 게이트 룰 5 항목 신규 섹션 | `0bcc283` |
| 5 | `docs/solutions/2026-05-03-dedupe-cross-tenant-collision-root-cause.md` | 신규 (Fix A + Fix B 보고서) | `0bcc283` |
| 6 | `scripts/b8-dedupe-diagnose.ts` | 신규 (소스별 ingested + cross-source collision 진단) | `0bcc283` |
| 7 | `docs/handover/s84-parallel-prompt-m4-ui-phase1.md` | 신규 (다른 터미널 위임) | `0bcc283` |
| 8 | `src/lib/aggregator/cleanup.ts` | 신규 (cleanup 모듈) | `f4bdf8f` |
| 9 | `tests/aggregator/cleanup.test.ts` | 신규 (TDD 6) | `f4bdf8f` |
| 10 | `src/lib/aggregator/types.ts` | AggregatorModule union 에 "cleanup" 추가 | `f4bdf8f` |
| 11 | `src/lib/aggregator/runner.ts` | switch case "cleanup" + runCleanupModule | `f4bdf8f` |
| 12 | `scripts/seed-aggregator-cron.ts` | almanac-cleanup SQL→AGGREGATOR | `f4bdf8f` |

DB 변경:
- `UPDATE content_ingested_items SET tenant_id = almanac WHERE tenant_id = default` (130 rows, Fix B)
- `UPDATE cron_jobs SET kind='AGGREGATOR', payload='{"module":"cleanup"}', consecutive_failures=0 WHERE name='almanac-cleanup'` (1 row)

---

## 검증 결과

| 검증 | 결과 |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run tests/aggregator/` | 139/139 PASS (회귀 0, 신규 6 cleanup + 1 dedupe case 26) |
| Fix B 사전 충돌 검증 | 0 conflicts |
| Fix B 사후 cross-tenant FK | 0 잔재 |
| `b8-runnow.ts almanac-cleanup` (라이브) | SUCCESS 23ms deleted=0 |
| `b8-check.ts` 사후 | ingested=131 items=131 (정합) |

---

## 터치하지 않은 영역

- **prod 배포** (cleanup 모듈) — 다른 터미널 WIP 안정화 후 운영자 또는 다음 세션. 24h 자연 fail 영향 0.
- **prod TimeZone=UTC 적용** (S84-A) — 사용자 의사결정 대기.
- **24h+ 관찰 + 추가 5 sources 확장** (S84-C) — 자연 cron tick 안정성 시간 필요.
- **M3 SSE browser publish/subscribe e2e** — 운영자 본인 (auth cookie + 실 conversation).
- **totp.test.ts AES-GCM tamper flake fix** (S84-I) — P2, 다음 세션.
- **Windows port 3000 leftover node.exe (pid 6608) 정리** (S84-K) — P3, 5분 작업.
- **Phase 2 plugin 마이그레이션** (S84-J) — DAU 임계 도달 시.
- **anthropic-news 대체 endpoint 탐색** — 운영자 본인.

---

## 알려진 이슈

- **cleanup 모듈 prod 배포 미완료** — 다른 터미널 M4 Phase 1 commit (`f3bf611`) 후 다음 자연 배포 또는 운영자 배포 시 흡수. 현재 03:00 KST 자연 fire = "알 수 없는 module: cleanup" 으로 fail (rejected/duplicate 0 행이라 기능 영향 0).
- **PrismaPg -9h shift prod 발현 지속** — audit §4.1 권고 대기 (S84-A).
- **dedupe Fix A + Fix B 적용 후 향후 자연 cron tick** — 130 URL 이 almanac scope 에서 정상 dup 처리 (이전 = cross-tenant 부정합 dup). ContentItem 중복 생성 0 보장.

---

## 다음 작업 제안

### P0 운영자 (사용자 의사결정)
- **S84-A** prod DATABASE_URL `?options=-c TimeZone=UTC` 적용 (트래픽 저점 KST 03:00~05:00, 영향 = 재로그인 1회)
- **S84-L** Almanac Vercel `ALMANAC_TENANT_KEY` env + redeploy

### P0 다음 세션 (즉시 실행 가능)
- **S85-DEPLOY** WSL 빌드+배포 (cleanup 모듈 prod 활성화) — 다른 터미널 commit `f3bf611` 흡수 + 메인 4 commits 흡수. `wsl-build-deploy.sh` 1회.
- **S85-F2** M4 UI Phase 2 (composer 인터랙티브 + SSE wiring + User name lookup) — 5-6 작업일 chunk

### P1
- **S84-C** 24h+ 관찰 후 sources 14 확장 (9 → 14)
- **S84-E** M3 SSE browser e2e — 운영자 본인 또는 M4 진입 시 자연 검증
- **S85-INFRA-1** SWR + jsdom + @testing-library/react 도입 — 컴포넌트 렌더 테스트 인프라

### P2
- **S84-I** totp.test.ts AES-GCM tamper flake fix (~30분)
- **S84-J** Phase 2 plugin (`packages/tenant-almanac/`) — DAU 임계 도달 시
- **S84-K** Windows port 3000 leftover node.exe 정리

---

## 본 세션 교훈

- **양 터미널 영역 분리 설계가 핵심**: 위임 프롬프트가 frontend 영역 (`src/app/messenger/*`, `src/components/messenger/*`, `src/hooks/messenger/*`) 을 prefix 단위 명시 → 머지 충돌 0 보장. 메인 터미널은 backend (`src/lib/aggregator/*`) + docs 영역만 손댐.
- **다른 터미널 컨텍스트 손실 패턴**: 새 세션 열면 git pull 안 받은 상태에서 stale 정보로 질문. 답변은 항상 "pull 먼저 → 후속 작업" 패턴.
- **prod BYPASSRLS = RLS 의존 코드의 침묵 데이터 누수 레시피**: S82 의 4 latent bug 와 S84-D 의 130 default-tenant 행 모두 동일 패턴. PR 리뷰 게이트 룰 5 항목 (특히 #2 cross-tenant 격리 테스트 + #4 non-BYPASSRLS 라이브 테스트) 가 그 전수 차단 메커니즘.
- **dbgenerated COALESCE fallback 의 함정**: `COALESCE(current_setting('app.tenant_id', true)::uuid, '00000000-...000000')` 는 SET LOCAL 미적용 시 default sentinel 로 silently fallback. 코드 레벨에서 SET LOCAL 보장 깨지면 (예: Prisma extension escape) 데이터가 default tenant 로 잘못 저장됨. 신규 모델 schema 작성 시 이 default 의도 재검토 필요.
- **TDD + 라이브 데이터 양립**: dedupe 케이스 26 (mock) 와 Fix B (실제 130 row 마이그레이션) 가 동시에 진행됨. mock 검증으로 logic 정합 + 라이브 검증으로 prod state 정합 — 둘 다 필요.
- **cleanup 부채 해소의 프로세스 가치**: 단일 cron 의 daily failure 가 "기능 영향 0" 인 상태로 누적되더라도 alarm fatigue 의 시작점. AGGREGATOR module 이전이 코드 일관성 + tenant 격리 + 룰 적용 (Fix A explicit tenantId) 자연 흡수 = 부채 해소 + 인프라 개선 동시 달성.

---

## 참조

- 자매 (다른 터미널): [session84 M4 UI Phase 1](./260503-session84-m4-ui-phase1.md)
- 진단 보고서: [2026-05-03 dedupe cross-tenant collision root cause](../solutions/2026-05-03-dedupe-cross-tenant-collision-root-cause.md)
- wave 진척도: [wave-tracker.md](../research/baas-foundation/04-architecture-wave/wave-tracker.md)
- 다른 터미널 위임 프롬프트: [s84-parallel-prompt-m4-ui-phase1.md](./s84-parallel-prompt-m4-ui-phase1.md)

---
[← handover/_index.md](./_index.md)
