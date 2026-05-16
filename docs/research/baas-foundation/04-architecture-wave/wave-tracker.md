# Wave Tracker — Post-BaaS 5-Track 진척도 (S100 Track E 출현)

> 작성: 2026-05-03 (세션 84)
> 위치: `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md`
> 출처: `wave-wiggly-axolotl.md` (외부 plan, S80 작성) + 세션 80~83 실측
> 자매: [01 Wave 호환성 매트릭스](./03-migration/01-wave-compatibility-matrix.md) (Supabase Wave 1~5)
> 갱신 정책: **세션 종료 시 진행도 row 갱신**. 외부 plan 파일 (`~/.claude/plans/wave-wiggly-axolotl.md`) 의 영구 사본 역할.

---

## 0. 한 줄 요약

S80~S83 4 세션 동안 wave-wiggly-axolotl 시퀀스(원래 5 세션 분량)가 5x 압축 실행됨. **(S96 시점) Track A ~95% (품질 깊이 ↑↑) / Track B 100% / Track C ~95% (본진 100% 도달) / Track D stabilized**. 다음 단일 가장 큰 가치 = **Almanac plugin 마이그레이션 (ADR-024 옵션 D, ~5-7일 단독 chunk)** 또는 INFRA-2 wave (SWR + MSW, ~3-4h).

**S85~S91 갱신 (2026-05-08)**: Track A 품질 깊이 ↑ (S88 systemic GRANT fix 4-month prod latent 차단 + S89~S90 silent catch sweep 8 위치 표면화 + S91 origin push 해소) / Track B TDD 81→100% (R-W1 해소, llm 27/promote 27/runner 15) / Track C **M4 Phase 2 0% 진행 (6 세션 정체, G-NEW-3 거버넌스 단언 정착)** / Track D 변화 없음. 종합 등급 S85 87/100 → S91 82/100 (-5, Track C 정체 페널티). 상세: [S91 wave eval delta](../../../handover/260508-session91-wave-completion-eval-delta.md).

**S97~S100 갱신 (2026-05-16, S100 wave eval delta + 다른 터미널 PLUGIN-MIG-4 흡수)**: **Track E Plugin Migration 출현 + 본진 5/5 100% 정착 (4 세션 압축, ADR-024 옵션 D 완전 코드 사실화)** — S98 본진 INFRA-2 wave (SWR + MSW + jsdom + 4 컴포넌트 렌더 TDD, TDD +40) + PLUGIN-MIG-1 골격 + S98 후속 PLUGIN-MIG-2/5 (6 handlers 이전 + dispatcher globalThis registry, TDD +11) + S99 정찰 + S99 후속 PLUGIN-MIG-3 lift-and-shift cutover (5 routes 단일 commit, Git rename 50~78%, TDD +25) + **S100 PLUGIN-MIG-4 (`67091d4`, ~3h 실측 vs 추정 16h, ~5x 압축)** = Prisma 7 multi-file schema GA 활용 (`prisma.config.ts` 디렉토리 모드 + `assemble-schema.mjs`) + 5 Content* 모델 + 3 enum fragment.prisma 이전 + support libs 8 파일 packages 이전 + `tests/almanac/` 8/8 라이브 RLS PASS (T1.6 RLS production-equivalent 증명). 누계 TDD 727 → 846+ (+119+). **4중 압축 메커니즘 완성** = schema-first (M5-ATTACH) + logic-only TDD 분리 (9 모듈) + lift-and-shift + 시그니처 교체 (PLUGIN-MIG-3) + **multi-file schema GA + T1.6 사전 적용 (PLUGIN-MIG-4 ~5x 압축, G-NEW-23 신규)**. ADR-022 7원칙 #2 + #4 router/handler/cron/schema 4축 코드 현실화 + ADR-024 옵션 D Hybrid 완전 정착. 종합 등급 S96 92/100 → **S100 ~93/100 (-0 ~ +1, Track E 5/5 100% 흡수로 -1 페널티 상쇄)**. **S100 본 row 갱신 = CLAUDE-MD-CS-6 글로벌+프로젝트 룰화로 G-NEW-4 4번째 재발 차단** (글로벌 5→6단계, 프로젝트 4→5단계, "wave-tracker.md 갱신 강제" 단계 추가) — **본 갱신이 첫 실제 적용 사례 + 다른 터미널과 본 터미널 동시 갱신 정합 (`feedback_concurrent_terminal_overlap` 정합)**. 상세: [S100 wave eval delta](../../../handover/260516-session100-wave-completion-eval-delta.md) + [S100 PLUGIN-MIG-4 인수인계서](../../../handover/260516-session100-plugin-mig-4.md) + [Prisma multi-file schema 솔루션](../../../solutions/2026-05-16-prisma-multi-file-schema-tenant-fragment.md).

**S92~S96 갱신 (2026-05-10, S97 wave eval delta)**: **G-NEW-3 극적 해소 (M4 Phase 2 0/14 → 12/14, 86% 회복)** — 거버넌스 단언이 5 세션 16 commit 동안 효력 발휘 → S92 F2-1 + S93 F2-2 + S94 F2-3/F2-4+INFRA-1/F2-5 + M5 검색 + M6 운영자/차단/알림 + S94 sharpedge PASS + S95 M5-ATTACH-1 + S96 M5-ATTACH-2/3a/3c/3b/4/5 + S96 sweep 4건 (STYLE-2 + M5-ATTACH-6 trivially-pass 차단 + NAV-INTEGRATE + GOV-SUNSET) + S96 후속-2 OPS-LIVE PM2 log timeline correlation PASS. **거버넌스 단언 [SUNSET 2026-05-10/S96] 표식 + 역사 보존** 자연 해소. Track C 70% → **~95%** (본진 100% 도달, SWR + 라이브 e2e 5% 잔여). 종합 등급 S91 82/100 → **S96 92/100 (+10, A-)**. **G-NEW-4 wave-tracker stale 재발 (S91+ 이후 5 세션 stale, 본 row 가 첫 갱신)** + R-W7+ S94/S95/S96 마일스톤 git tag 부재 (TAG-2 권고). 상세: [S97 wave eval delta](../../../handover/260510-session97-wave-completion-eval-delta.md).

---

## 1. 5-Track 매트릭스 (S100 Track E 출현, 가중치 25/20/25/5/25 재조정)

| Track | 영역 | 시퀀스 | 완료 % | 마지막 마일스톤 (commit) |
|---|---|---|---|---|
| **A** | BaaS Foundation | Phase 0~4 (T1.1~T1.7 + R1/R2 + RLS) + dispatcher registry | **~95% (품질 깊이 ↑↑↑)** | (S91~S96 이전 마일스톤 유지) + **S98 후속 dispatcher globalThis registry 정착** (`f7a0253` `packages/core/src/tenant/dispatcher.ts` + `src/lib/tenant-bootstrap.ts`, registerTenant/registerCoreHandler/dispatchTenantHandler 3축 API) + **S99 후속 TenantRouteHandler + matchRoute dispatcher** (`33e6721` `src/lib/tenant-router/dispatch.ts`, 정적+`:param` segment-by-segment, manifest 우선 lookup). cron + router 두 레이어 동일 registry 패턴 일반화. |
| **B** | Almanac Aggregator | T1~T9 (B-pre + B1~B8) + thin dispatcher | **100% (TDD 100%, runner 슬림화)** | (S96 messenger-attachments-deref 추가 유지) + **S98 후속 runner.ts 326 → 97줄 thin dispatcher** (`f7a0253`) + **S98 후속 6 handlers `packages/tenant-almanac/src/handlers/` 이전** (`f7a0253`, fetcher-pipeline.ts 공유) + **S99 후속 5 routes `packages/tenant-almanac/src/routes/` 이전** (`33e6721`). aggregator 도메인 ~80% 가 Track E 로 흡수, 잔여 ~20% (5 Content* 모델 + support libs = PLUGIN-MIG-4). |
| **C** | Messenger Phase 1 | M0~M6 (PRD + 9 모델 + 6 enum + 17 라우트 + SSE + UI + 안전 + 알림 + 첨부) + INFRA-2 본진 | **~98% (INFRA-2 본진 정착)** | (S94~S96 본진 마일스톤 유지) + **S98 INFRA-2 wave 본진** (`ff698fe` 16 files +1346/-170 TDD +40) — SWR 2.4 + MSW 2.14 + jsdom 29 + RTL 16 인프라 + useConversations/useMessages SWR 마이그레이션 (page.tsx 변경 0, dedup TDD RED→GREEN) + uploadAttachment 본체 jsdom+MSW 5 시나리오 (G-NEW-12 갭 해소) + 4 컴포넌트 렌더 TDD 26 (MessageAttachment 7 + MessageBubble 7 + MessageList 7 + MessageComposer 5). **§6 가정 정정** "M4 UI = TDD 압축 적용 불가" 무너짐. 잔여 ~2% = 라이브 SSE EventSource (운영자 영역) + cron enable (운영자 결정). |
| **D** | Filebox | R2→SeaweedFS pivot + multipart + body limit | **stabilized** | S79 Next.js 16 standalone 100mb fix. S83 multipart cleanup cron. **M5 첨부가 `upload-multipart/{init,part,complete,abort}` 4 라우트 재사용 — Track D 자체 무변경 + 재사용 증명**. |
| **E (NEW)** | Plugin Migration (ADR-024 옵션 D Hybrid Complex=workspace) | PLUGIN-MIG-1~5 (골격 → 핸들러 → 라우트 → 모델+RLS → cron generic) | **100% (5/5 단계 정착, 4 세션 압축)** | **PLUGIN-MIG-1 골격** (`4840fa6` 16 files +499 TDD +8, S98 본진) — TenantManifest 6 필드 interface + defineTenant + `packages/tenant-almanac/` 골격 + alias `@yangpyeon/tenant-almanac`. **PLUGIN-MIG-2 핸들러 본체 이전** (`f7a0253`, S98 후속) — 6 handlers (rss-fetcher/html-scraper/api-poller/classifier/promoter/cleanup) + fetcher-pipeline.ts 공유 + manifest invoke + AggregatorRunResult→TenantCronResult adapter, enabled=true. **PLUGIN-MIG-3 5 routes manifest dispatch 전환** (`33e6721` 17 files +782/-305 TDD +25, S99 후속) — lift-and-shift 1:1 (Git rename 50~78%) + cors 추출 9 testcase + catch-all `[tenant]/[...path]/route.ts` 단일 진입점 + OPTIONS try/catch graceful 204 + dev :3100 smoke 통과 + S100 production 라이브 검증 (PM2 ↺=26). **PLUGIN-MIG-5 cron runner generic dispatch** (`f7a0253` 같은 commit, S98 후속) — dispatcher globalThis registry 3축 API. **PLUGIN-MIG-4 schema 분리 + libs 이전 + 라이브 RLS test** (`67091d4` 36 files +908/-276 TDD +8 라이브, S100 후속) — Prisma 7 multi-file schema GA 활용 (`prisma.config.ts` 디렉토리 모드 + `scripts/assemble-schema.mjs` ASCII-only) + 5 Content* 모델 + 3 enum schema.prisma → fragment.prisma (1108→891줄 -217) + 8 support libs `src/lib/aggregator/*` → `packages/tenant-almanac/src/lib/` (git rename + import 16건) + `tests/almanac/` 신설 (8/8 라이브 PASS, T1.6 RLS production-equivalent 증명). 가이드 외 추정 16h → 실제 ~3h (T1.6 마이그레이션이 이미 tenantId/RLS/composite unique 5/5 적용 → 본 작업 실질 = schema 파일 위치 분리 + plugin 격리). |

---

## 2. Track A — BaaS Foundation 상세

### 2.1 Phase 별 진척

| Phase | 항목 | 상태 | 검증 |
|---|---|---|---|
| 0 | ADR-022~029 8건 ACCEPTED | ✅ S58 | `01-adrs/` |
| 1.1~1.4 | Prisma multi-tenant + RLS + tenant_memberships | ✅ S60~S62 | `prisma/schema.prisma`, `app_*` role |
| 1.5 | Worker pool 격리 (ADR-028) | ✅ hybrid (per-tenant retry/backoff) | `src/lib/cron/runner.ts` |
| 1.6 | Aggregator schema (slug FK + RLS + composite unique) | ✅ S61 마이그 `20260427140000_t1_6_aggregator_with_tenant` | DB 시드 37 슬러그 |
| 1.7 | audit-metrics tenant 차원 (ADR-029 M1) | ✅ S62 | `src/lib/audit-metrics.ts:42` byTenant Map |
| R1 | withTenantTx 헬퍼 | ✅ | `src/lib/db/prisma-tenant-client.ts:188` |
| R2 | DB 시드 = 슬러그 source of truth | ✅ S80 결정 | `slug-mapping-db-vs-spec.md` |

### 2.2 S82 라이브 검증 노출 4 latent bug

| # | 문제 | 차단 | 비고 |
|---|---|---|---|
| A.1 | 5건 fixture/test (constraint 명, cascade, lastReadAt, composite PK, regex) | ✅ S82 fix | 라이브 한 번도 안 돌아서 통과한 채 머지된 흔적 |
| A.2 | AbuseReport.targetKind @map 누락 | ✅ S82 fix | S80 Track C M2 머지 시점 누락 |
| **A.3** | **Prisma extension `query(args)` escape — RLS 우회** | ✅ S82 fix | **prod BYPASSRLS 가 4개월 가려놓던 부채** |
| **A.4** | **PrismaPg + Asia/Seoul -9h shift** | ⚠️ **권고 대기** (P1) | `?options=-c TimeZone=UTC` 적용 |

### 2.3 잔여

- [x] **prod DATABASE_URL TimeZone=UTC 적용** ✅ S91 운영 `~/ypserver/.env` grep 검증.
- [x] **PR 리뷰 게이트 룰 정착** (RLS + tenantPrismaFor closure + non-BYPASSRLS test) ✅ + S88 후속 #4 BYPASSRLS=t 라이브 SET ROLE 게이트 확장.
- [x] **`app_admin` GRANT systemic fix** ✅ S88 — 마이그레이션 직접 적용 + ALTER DEFAULT PRIVILEGES + 37/37 ALL 검증.
- [x] **silent catch 30 후보 sweep** ✅ S89~S90 + S91+ STYLE-1 — 9 위치 차등 fix + 합리적 skip 23건 보존.
- [x] **origin push 4 commits** ✅ S91 — GCM credential reject 우회 패턴 정착 → S94 memory 룰 승격 (`reference_gcm_credential_reject.md`).
- [x] **trivially-pass 차단 메커니즘 정착** ✅ S96 M5-ATTACH-6 (`da8786b`) — `tests/messenger/rls.test.ts` 6 모델 시드 + `expect(rows.length >= 1)` active assertion. S82 "4 latent bug 4개월 hidden" 패턴 재발 차단.
- [x] **WSL 빌드 미러 우회 4-stage 표준 절차** ✅ S95~S96 — solution 문서 + 라이브 누적 47 PASS.
- [x] **OPS-LIVE PM2 timeline correlation 검증** ✅ S96 후속-2 — 5일+ 0 errors. solution `2026-05-10-ops-live-verification-by-pm2-log-correlation.md`.

---

## 3. Track B — Aggregator 상세 (완료)

### 3.1 B-pre ~ B8 시퀀스

| 단계 | 작업 | commit | LOC | TDD |
|---|---|---|---|---|
| B-pre | 베이스라인 검증 + slug-mapping | `c20d90d` | +622 | — |
| B1 | 의존성 + .env 6 vars 3곳 동기 | `0d9a225` | +656 | — |
| B2 | types + dedupe (multi-value spec bug fix) | `a121289` | +545 | 25 |
| B3 | classify (한글 \b boundary spec bug fix) | `e74f3ef` | +769 | 40 |
| B4 | 4 fetchers (ArXiv link spec bug fix) | `100ae5c` | +1,200 | 30 |
| B5 | llm + promote (NFKD jamo 분해 spec bug fix) | `58a526a` | +1,100 | 27 |
| B6 | port runner + cron AGGREGATOR dispatcher | `7c50c9f` | +900 | 15 |
| B7 | seed 6 cron jobs + WSL 빌드+배포 | `ffdd2dd` | +477 | — |
| B8 | 5 RSS sources 활성화 + runNow 라이브 검증 | `ffdd2dd` (포함) | — | — |

**누계**: 9 단계 / +6,269 LOC / TDD 137 케이스 / spec port-time bug 4건 차단.

### 3.2 §3 격리 첫 production 실증

S81 anthropic-news 404 → consecutiveFailures=1, 다른 4 소스 fetch 차단 0. ADR-022 §3 "한 컨슈머 실패 격리" 가 종이가 아닌 코드 검증된 사실이 됨.

### 3.3 잔여 (운영)

- [ ] 24h+ 관찰 후 추가 5 sources 확장 (9 → 14, S84-C)
- [x] **inserted=0 dedupe 진단 (S84-D)** — 2026-05-03 완료. root cause = `dedupe.ts` WHERE 절 tenantId 누락 + prod BYPASSRLS + 레거시 130 default-tenant 행. **Fix A** (코드 explicit tenantId 필터) + **Fix B** (130 default → almanac UPDATE, cross-tenant FK 0). `docs/solutions/2026-05-03-dedupe-cross-tenant-collision-root-cause.md`
- [ ] anthropic-news 대체 endpoint 탐색
- [x] **almanac-cleanup cron FAILURE 해소** (S84+, 2026-05-03) — SQL kind 의 readonly 풀 한계 회피. AGGREGATOR module=cleanup 신설 (`src/lib/aggregator/cleanup.ts`, TDD 6 PASS). DB row `kind:SQL→AGGREGATOR, payload:{module:"cleanup"}` 적용 + b8-runnow 라이브 검증 SUCCESS deleted=0. **prod 배포는 다른 터미널 M4 UI Phase 1 WIP 안정화 후** (현재 transient import 미완성 — `ConversationList.tsx` 가 미작성 hook 참조).

---

## 4. Track C — Messenger Phase 1 상세 (60%)

### 4.1 M0~M6 진척

| 마일스톤 | 영역 | 상태 | 진입 세션 |
|---|---|---|---|
| M0 | PRD + ADR-030 + wireframes + data-model + api-surface | ✅ | S58 (ADR) + S64 (PRD) |
| M1 | **9 데이터 모델 + 6 enum** + 마이그레이션 | ✅ (R-W2 정정 정착) | S67 |
| M2 | 도메인 헬퍼 + Zod + **17 라우트 파일** (R-W6 정정 정착, 본 평가 코드 검증 1:1 매치) | ✅ | S67~S68 helpers, S81 17 ops 4 그룹 라우트 |
| M3 | SSE conv 8 + user 4 이벤트 + bus + wire format 헬퍼 | ✅ | S81 conv, S82 user + 헬퍼 추출 |
| M3 라이브 e2e | 통합 테스트 32 + 4 latent bug fix + events route 라이브 | ✅ unit / 🟡 browser e2e (S94 F2-4 use-sse hook 도입으로 부분 해소, 실제 EventSource 라이브는 운영자 영역) | S82 + S83 빌드+배포 + **S94 F2-4 jsdom 단위 PASS** |
| **M4 Phase 1** | UI 보드 (사이드바 + 대화목록 + 채팅창 기본) | ✅ S84 (`f3bf611`) | S84 |
| **M4 Phase 2** | Composer + UUIDv7 + 낙관적 업데이트 + 답장 + 멘션 + use-sse 운영 + DIRECT peer 이름 lookup | ✅ **F 트랙 5/5 완주 (S92~S94)** — `ac09ebd` F2-1 + `b750186` F2-2 + `8903e1d` F2-3 + `088f623` F2-4+INFRA-1 + `5a29980` F2-5. SWR 마이그레이션 잔여 (INFRA-2 wave). | S92~S94 |
| M5 검색 | 본문 30일 윈도 검색 (GIN trgm) | ✅ S94 (`112c8be`, TDD 16) | S94 |
| **M5 첨부** | filebox `upload-multipart` 재사용 + composer chip + Bubble 렌더 + 30일 cron deref | ✅ **S95~S96** — `652ff88` 백엔드 RLS positive + `bf7255a` logic+utility (TDD 26) + `6bb29c7` 30일 cron (TDD 6, 라이브 6/6) + `7ceb075` frontend UI + `a9aeede` sweep e2e + M5-ATTACH-6 trivially-pass 차단. **사전 추정 5-6일 → 실측 1-2일 압축** (schema-first 정량 효과). | S95~S96 |
| M6 | 알림 + 차단/신고 + 운영자 패널 + kdysharpedge 보안 리뷰 | ✅ **S94** — `2f9125a` 운영자 신고 패널 (TDD 9) + `5f5253c` 차단/알림 UI (TDD 16) + `8f873c3` sharpedge PASS (CRITICAL/HIGH/MEDIUM 0, LOW 3 + INFO 2). | S94 |

### 4.2 백엔드 라이브 인프라

- 17 엔드포인트 PM2 ypserver 라이브 (`/api/v1/t/<tenant>/messenger/...`)
- SSE events route + 25s keepalive + 멤버 검증 + tenant 격리
- 통합 테스트 32 + SSE wire format 7 + listener-throw 패턴 (brittle test 회피)
- DB role `app_test_runtime` non-BYPASSRLS + `scripts/setup-test-db-role.sh` + `scripts/run-integration-tests.sh`

### 4.3 잔여 (S96 시점)

- [x] **M4 UI 보드 Phase 1** ✅ S84 (`f3bf611`)
- [x] **M4 Phase 2 F 트랙 5/5** ✅ S92~S94 (composer 인터랙티브 + SSE wiring 완주)
- [x] **M5 검색** ✅ S94 (`112c8be`)
- [x] **M5 첨부** ✅ S95~S96 (backend + 30일 cron + frontend + sweep)
- [x] **M6 알림/차단/신고/운영자/보안 리뷰** ✅ S94
- [ ] **INFRA-2** (SWR + MSW 도입 + 컴포넌트 렌더 TDD 보강) — INFRA wave 별도 chunk (~3-4h)
- [ ] **라이브 e2e** (M3 SSE EventSource + M5-ATTACH-3b UI 통합) — 운영자 영역 또는 INFRA wave 흡수
- [ ] `messenger-attachments-deref` cron enabled=true (운영자 결정, 30일 도달 시점)

---

## 5. Track D — Filebox 상세 (stabilized)

S77~S79 stabilization 시퀀스:
- ADR-033 ACCEPTED — R2 → SeaweedFS pivot (자가호스팅)
- S78 multipart upload X1 server proxy (CK `2026-05-01-verification-scope-depth`)
- S79 Next.js 16 standalone proxyClientMaxBodySize 100mb fix (`fd4d666`, CK `2026-05-01-nextjs16-standalone-proxy-body-truncation`)
- S83 `scripts/seaweedfs-clean-multipart.sh` + crontab `0 4 * * 0 ...` (S78-H 부채 해소)

향후: filer leveldb 전환 (50만 entry 도달 시), Phase 2 plugin 분리 (DAU 임계 도달 시).

---

## 6. 압축 실행 통계 (계획 vs 실측)

| 세션 | wave-wiggly-axolotl plan | 실측 | 압축률 | LOC |
|---|---|---|---|---|
| S80 | B-pre + B1 + B2 (3 단계) | B-pre+B1+B2+B3+B4+B5+B6 (7 단계) | 2.3x | +6,112 |
| S81 | B3 또는 B4 시작 | B7+B8+Track C M2 17 ops+M3 SSE+M2 통합 32 (5 마일스톤) | 5x | +3,164 |
| S82 | (plan 외 — Track C 본격 진입) | M3 user 채널 + M2 라이브 + 4 latent fix + SSE wire format | — | +625 |
| S83 | (plan 외 — 운영 follow-up) | timezone audit P1 + sources 9개 + multipart cron + SSE 라이브 | — | (코드 0, 운영 액션) |

**압축이 가능했던 3 조건** (S81 교훈 baked-in):
1. 헬퍼/스키마 사전 완비 (S67~S68 가 이미 끝나 있음)
2. 단일 패턴 (M2 라우트 = 가드+Zod+helper+audit+errorMap 단일 패턴)
3. cron 라이브 검증 = runNow 결정적 압축 (24h 자연 tick 대기 회피)

**압축 적용 불가 영역**: M4 UI 보드 — 위 3 조건 충족 X (UI는 단일 패턴 X, 와이어프레임마다 다름). plan 의 5~7 작업일 chunk 그대로 잡아야 함.

---

## 7. 다음 세션 게이트

### S97+ 우선순위 (next-dev-prompt.md 단일 진실, S84~S96 완료분 [SUNSET])

| # | 작업 | 우선 | 위치 |
|---|---|---|---|
| S97-DOC-WAVE-2 | wave-tracker S91+~S96 row 갱신 (G-NEW-4 재발 차단) | P1 본 chunk | **본 세션 진행** ✅ (본 갱신 자체) |
| S97-TAG-2 | s94/s95/s96/sunset 4 마일스톤 git tag 소급 | P3 | 본 세션 |
| S97-USER-VERIFY | 사용자 휴대폰 stylelucky4u.com/notes 재검증 | P0 사용자 | 사용자 직접 |
| S97-SEC-1 | GitHub repo public/private 확인 | P0 사용자 | 사용자 직접 |
| S98-INFRA-2 | SWR + MSW 도입 + 컴포넌트 렌더 TDD 보강 | P2 | 단독 chunk ~3-4h |
| S99~S100-ALMANAC-PLUGIN | Almanac → `packages/tenant-almanac/` plugin 마이그레이션 (ADR-024 옵션 D) | P0~P1 | 단독 chunk ~5-7일 |
| 정책 전환 | 거버넌스 단언 [SUNSET 2026-05-10/S96] → `feedback_autonomy.md` 일반 적용 | — | 정착 |

### 머지 게이트 룰 (CLAUDE.md 신규 섹션 동기 정착)

S82 4 latent bug 재발 차단을 위한 PR 본문 필수 체크리스트:
1. 신규 모델 = `tenantId` 첫 컬럼 + RLS 정책
2. 신규 라우트 = `withTenant()` 가드 + cross-tenant 격리 테스트
3. Prisma 호출 = `tenantPrismaFor(ctx)` closure 패턴 (ALS 의존 X)
4. **non-BYPASSRLS role 로 라이브 테스트 1회 통과** (`scripts/run-integration-tests.sh`)
5. timezone-sensitive 비교 = Prisma round-trip cancel 패턴 또는 raw SQL workaround 명시

---

## 8. 갱신 이력

| 일자 | 세션 | 변경 |
|---|---|---|
| 2026-05-03 | S84 | 초기 작성 (S80~S83 실측 흡수) |
| 2026-05-04 | S84+ | almanac-cleanup AGGREGATOR module 이전 (`f4bdf8f` + `f8caa26`) |
| 2026-05-04 | S84+ | totp.test.ts AES-GCM tamper P2 flake 결정적 fix (`66689e9`, S82~83 누적 P2, base64url 패딩 비트 함정 root cause + 50/50 통과 검증) |
| 2026-05-04 | S85 | wave eval 1차 (87/100 A-, 7 갭 R-W1~R-W7 식별) + 시크릿 회수 + history purge (`5c56676` `626068e`) + Anthropic RSS URL fix (`ce50988`) + cron runNow recordResult (`3ae830f`) |
| 2026-05-04 | S86 | cron runnow + anthropic-news + timezone prod 흔적 (`c0624d3`) |
| 2026-05-05 | S87 | **R-W1 완전 해소** — aggregator TDD 81→100% (`effd6fa`, +32 case) + cleanup pre-commit hook + secret-scan hook (`b46bf2e` `8bc785b`) |
| 2026-05-05 | S88 | **5번째 4개월 prod latent fix** — `app_admin` BYPASSRLS=t + zero GRANT systemic 회복 (`d18154e` `e33a318` + `prisma/migrations/20260505000000_grant_app_admin_all_public/`) + ALTER DEFAULT PRIVILEGES |
| 2026-05-05 | S89~S90 | silent catch 30 후보 sweep + PR 게이트 룰 #4 BYPASSRLS=t 확장 (`d10b5e9` `5f64675` `67461da` `2120769`) — 8 위치 fix + 23 합리적 skip 보존 |
| 2026-05-08 | S91 | origin push 4 commits + GCM credential reject 우회 패턴 정착 (`899090b`) — G-NEW-5 자연 해소 |
| 2026-05-08 | S91+ | **wave eval 2차 (delta, 82/100 B+ -5점)** — R-W1/R-W3/R-W4 해소 + G-NEW-1~6 신규 갭 + M4 Phase 2 6 세션 정체 진단 → 거버넌스 단언 정착 |
| 2026-05-08 | S92 | **M4 Phase 2 F2-1** (`ac09ebd`) — Composer + UUIDv7 + Enter 송신 + IME composing 가드 (TDD 17, logic-only 분리 패턴 첫 적용). 거버넌스 단언 첫 자율 적용 사례 (Phase 2 1/14). |
| 2026-05-08 | S93 | **M4 Phase 2 F2-2** (`b750186`) — 낙관적 송신 + `_optimistic` discriminator + server protect invariant (TDD 17). 거버넌스 단언 §31 dependency 예외 자율 적용 (Phase 2 2/14). |
| 2026-05-09 | S94 | **F 트랙 완주 + M5 검색 + M6 운영자/차단/알림 + sharpedge PASS** — 7 commit 압축 신기록 (S81 5x → 7x): F2-3 (`8903e1d`) + F2-4+INFRA-1 (`088f623`) + F2-5 (`5a29980`) + M5 검색 (`112c8be`) + M6 운영자 (`2f9125a`) + M6 차단/알림 (`5f5253c`) + sharpedge PASS (`8f873c3`). TDD +108 (619→727), G-NEW-3 0/14 → 5/14. |
| 2026-05-10 | S95 | **M5-ATTACH-1 백엔드 갭 폐쇄** (`652ff88`) — positive 첨부 flow + cross-tenant RLS 격리 (TDD 1, 라이브 13/13 PASS). 사전 추정 5-6일 → 실측 1-2일 압축 (schema-first 정량 효과). WSL 빌드 미러 우회 4-stage 표준 절차 정착. |
| 2026-05-10 | S96 (logic+utility) | **M5-ATTACH-3a/3c** (`bf7255a`) — composer-logic kind 분기 + attachment-upload XHR/multipart utility (TDD 26). page.tsx 변경 0 (logic-only 정량 효과). |
| 2026-05-10 | S96 (잔여+sweep) | **M5-ATTACH-2/3b/4/5 + sweep 4건 일괄** — 30일 cron (`6bb29c7`) + frontend UI (`7ceb075`) + sweep e2e (`a9aeede`) + STYLE-2 + M5-ATTACH-6 trivially-pass 차단 + NAV-INTEGRATE + GOV-SUNSET (`da8786b`). **거버넌스 단언 [SUNSET 2026-05-10/S96] 자연 해소** + S82 이후 처음으로 tsc errors 0. |
| 2026-05-10 | S96 (후속-2) | **OPS-LIVE PM2 timeline correlation PASS** — 마지막 ACL 에러 5/5 08:51:58 KST → S88 migration 적용 5/5 08:57:15 KST → 5일+ 0 errors. 4 latent bug 시그 무발생. solution `2026-05-10-ops-live-verification-by-pm2-log-correlation.md` (Compound Knowledge: 라이브 호출 없이 timeline 검증 패턴). G-NEW-1 자연 해소 + 운영자-only 라벨 재검증 권고. |
| 2026-05-10 | S97 | **wave eval 3차 (delta, 92/100 A- +10점)** — G-NEW-3 극적 해소 (0/14 → 12/14, 86%) + 거버넌스 단언 SUNSET + G-NEW-7~11 신규 발견 (schema-first 정량효과 + logic-only 9 모듈 일관 + WSL 빌드 미러 표준 + active assertion + SUNSET 표식 패턴) + **G-NEW-4 wave-tracker stale 재발 (본 row 가 첫 갱신, /cs 6단계 공식화 권고)** + R-W7+ 마일스톤 git tag 부재 (TAG-2 권고). 상세: [S97 wave eval delta](../../../handover/260510-session97-wave-completion-eval-delta.md). |
| 2026-05-10 | S98 후속 | **PLUGIN-MIG-2 + 5 본격 이전** (`f7a0253` 19 files +1030/-413 TDD +11). PLUGIN-MIG-2 = 6 almanac handlers → `packages/tenant-almanac/src/handlers/` + fetcher-pipeline.ts 공유 + manifest.ts handler invoke + AggregatorRunResult→TenantCronResult adapter + enabled=true + runner.ts 326→97줄 thin dispatcher. PLUGIN-MIG-5 = `packages/core/src/tenant/dispatcher.ts` globalThis 싱글턴 registry (registerTenant + registerCoreHandler + dispatchTenantHandler 3축 API, memory rule `project_workspace_singleton_globalthis` 정합) + `src/lib/tenant-bootstrap.ts` side-effect import + cron/runner.ts `dispatchTenantHandlerOnMain` generic 일반화. messenger-attachments-deref 는 core handler 로, almanac 6 handler 는 tenant manifest 로 등록. importOriginal 부분 mock 패턴 채택. ADR-022 7원칙 #4 cron 레이어 현실화 — 향후 jobboard 추가 시 cron/runner.ts 변경 0줄, tenant-bootstrap.ts register 1-2줄 + manifest 정의만. PR 게이트 5항목 자동 통과. vitest 810 → 821 PASS / tsc 0 / origin push 성공. |
| 2026-05-10 | S99 | **PLUGIN-MIG-3 정찰 + chunk A/B/C 설계** (`411d0f7` 6 docs) — 5 routes (`categories`/`sources`/`today-top`/`items-by-slug`/`contents`) + dispatcher (`src/lib/tenant-router/dispatch.ts` + `api-guard-tenant.ts`) + manifest (`packages/core/src/tenant/manifest.ts`) + dispatcher registry (`packages/core/src/tenant/dispatcher.ts`) 정찰. chunk A 인프라 (TenantRouteHandler 타입 + matchRoute helper) / chunk B 본체 이전 (lift-and-shift + cors 추출) / chunk C cutover (5 explicit route 삭제 + catch-all OPTIONS 추가) 3 단계 설계. |
| 2026-05-10 | S99 후속 | **PLUGIN-MIG-3 A+B+C 단일 commit cutover** (`33e6721` 17 files +782/-305 TDD +25). Chunk A 5 파일 = `HttpMethod` + `TenantRouteContext` (구조적 사본, core 가 app-side 역의존 없이 plugin handler `tenant.id` 사용, ADR-024 격리 타입 시스템 강제) + `TenantRouteHandler` + `TenantRouteRegistration` 시그니처 교체 (codegen thunk → eager methods), `dispatch.ts` matchRoute helper (40 LOC, segment-by-segment, path-to-regexp 미도입) + manifest 우선 lookup, 17 신규 unit test (matchRoute 7 + dispatchTenantRoute 10). Chunk B 9 신규 + 3 수정 = `packages/tenant-almanac/src/lib/cors.ts` 1회 정의 (buildCorsHeaders + applyCors + preflightResponse, 5×17 LOC 중복 압축) + 5 routes (categories/sources/today-top/items-by-slug/contents) lift-and-shift (Git rename 감지 50~78%) + manifest.routes 5 등록 + namespace export + 12 신규 testcase. Chunk C 1 수정 + 5 삭제 = 5 explicit route.ts 삭제 (-928 LOC) + catch-all `[tenant]/[...path]/route.ts` `import "@/lib/tenant-bootstrap"` side-effect + OPTIONS try/catch graceful 204 폴백 (preflight 500 → 모호한 CORS 에러 회피, 운영 가시성 향상). dev :3100 smoke 통과 (OPTIONS 5 routes + GET 5 routes 401 catch-all → withTenant gate 도달, messenger explicit 영향 0). PR 게이트 5항목 자동 통과 (URL 동일, dispatcher 만 교체). vitest 821 → 846 PASS / tsc 0 / origin push 성공. ADR-022 #3 ("한 컨슈머 실패 격리") router 레이어 현실화 + #4 ("코드 수정 0줄 신규 컨슈머") manifest.routes 등록만으로 신규 컨슈머 라우트. |
| 2026-05-16 | S100 | **wave eval 4차 (delta, 91/100 A- -1점) + CLAUDE-MD-CS-6 룰화 + DOC-WAVE-3 + TAG-3** — `kdywavecompletion --compare session-97` 평가 산출 (`docs/handover/260516-session100-wave-completion-eval-delta.md`, 92→91 -1, Track E 본진 +2.5 / 3중 압축 #3 메타가치 +1 / G-NEW-4 3번째 재발 + R-W7 4번째 재발 + /cs 6단계 미실행 -4.5). **CLAUDE-MD-CS-6 글로벌+프로젝트 동시 룰화** = `~/.claude/CLAUDE.md` 5→6단계 + 프로젝트 `CLAUDE.md` 4→5단계, "wave-tracker.md 갱신 강제" 단계 추가, G-NEW-4 4번째 재발 차단 결정적 메커니즘. **DOC-WAVE-3** 본 row 갱신 자체 = §0 + §1 Track E 신규 row + §8 4 row 추가. **TAG-3** 5 마일스톤 git tag 소급 (`s97-wave-eval-3` + `s98-infra-2-plugin-mig-1` + `s98-plugin-mig-2-5` + `s99-plugin-mig-3-cutover` + `s100-plugin-mig-3-prod` 또는 wave-eval-4). |
| 2026-05-16 | S100 후속 | **PLUGIN-MIG-4 schema 분리 + libs 이전 + 라이브 RLS test = Track E 100% 완성** (`67091d4` 36 files +908/-276 TDD +8 라이브). 다른 터미널의 wave eval delta(`260516-session100-wave-completion-eval-delta.md`) 작성 중 본 터미널이 자율 진입 (영역 분리). **/kdynext 7차원 진단** = 건강 등급 A (위생 결함 사실상 0) → 사용자 "/ypserver → PLUGIN-MIG-4 자율" 선택. **/ypserver 운영 적용 (PM2 ↺=26, HTTP 307, 에러 0)** = PLUGIN-MIG-3 manifest dispatcher cutover production 라이브 검증 완료. **Step A 인프라**: Prisma 7 multi-file schema GA v6.7.0+ 활용 (`prisma.config.ts` 디렉토리 모드 + `scripts/assemble-schema.mjs` 60줄 ASCII-only Node 24 인코딩 함정 회피 + `.gitignore` `/prisma/*.prisma` + `!/prisma/schema.prisma` + `package.json` prebuild hook). cross-file 모델 참조 자동 머지 검증 (`Tenant.contentCategories[]` ↔ ContentCategory). **Step B 모델 이전**: schema.prisma 1108→891줄 (-217, 5 model + 3 enum) → fragment.prisma 본체 + assemble-schema cp → prisma/almanac.prisma (build artifact). T1.6 마이그레이션 (2026-04-27) 이 이미 tenantId 첫 컬럼 + composite unique + RLS ENABLE+FORCE 5/5 모델 적용 — 본 작업 실질은 schema 파일 위치 분리만 (가이드 추정 16h → 실제 ~3h). **Step C support libs**: 8 파일 `git mv` (classify/cleanup/dedupe/fetchers/llm/promote/types) → `packages/tenant-almanac/src/lib/` + import 16건 갱신 (`@/lib/aggregator/X` → `@yangpyeon/tenant-almanac/lib/X`) + runner.ts 잔존 (runner.test.ts 17 시나리오 백업). **Step D**: manifest.ts `prismaFragment` 이미 등록 (자연 활성화). **Step E tests/almanac/ 신설** (8 testcase): _fixtures.ts (261줄, messenger 패턴 fork, TENANTS aaaa.../bbbb... 별도 UUID, admin pool BYPASSRLS seed + runtime pool app_test_runtime 검증) + rls-isolation.test.ts (5 모델 cross-tenant) + composite-unique.test.ts (3 케이스). **Step F 라이브 검증** WSL native env 채택 (3 시도 = WSL bash → rolldown native binding 함정 + PowerShell → ECONNREFUSED 127.0.0.1:5432 WSL postgres only listen → **WSL ypserver-build rsync + bash scripts/run-integration-tests.sh tests/almanac/** = **8/8 PASS** in 852ms). PR 게이트 5항목 자동 통과 + #4 라이브 통과. **검증**: prisma validate (multi-file) + prisma generate (198ms) + tsc 0 + vitest dev 846 PASS / 102 skip (+8 신규 skipIf). **ADR-022 7원칙 #2/#4 schema 레이어 현실화** — 향후 신규 컨슈머 (jobboard 등) 는 `packages/tenant-<id>/prisma/fragment.prisma` 만 추가하면 자동 머지 (코드 수정 0줄 검증 가능 상태). **메타 가치**: 가이드 outdated 인식 → ~8h 재산정 → 실제 ~3h 완료 (T1.6 선제 적용 발견 + Prisma 7 GA 다단계 활용 + WSL native env 함정 회피). solution `docs/solutions/2026-05-16-prisma-multi-file-schema-tenant-fragment.md` 신설 (Compound Knowledge: Prisma 7 multi-file 패턴 + assemble-schema 빌드 스크립트 + ADR-022 #4 코드 사실화). 상세: [S100 PLUGIN-MIG-4 인수인계서](../../../handover/260516-session100-plugin-mig-4.md). |
| 2026-05-10 | S98 | **INFRA-2 wave 본진 + PLUGIN-MIG-1 골격** (`ff698fe` INFRA-2 16 files +1346/-170 TDD +40, `4840fa6` PLUGIN-MIG-1 16 files +499 TDD +8). **INFRA-2**: SWR 2.4 + MSW 2.14 + jsdom 29 인프라 (per-file env opt-in) + setup.ts (jest-dom + RTL cleanup + scrollIntoView polyfill) + useConversations + useMessages SWR 마이그레이션 (TDD dedup RED→GREEN, page.tsx 변경 0) + uploadAttachment 본체 5 시나리오 jsdom+MSW (G-NEW-12 갭 해소) + 4 컴포넌트 렌더 TDD (MessageAttachment 7 + MessageBubble 7 + MessageList 7 + MessageComposer 5 = 26 — **wave-tracker §6 가정 정정** "M4 UI = 압축 적용 불가" 무너짐). **PLUGIN-MIG-1** (ADR-024 옵션 D Hybrid: Complex=workspace): TenantManifest interface (cronHandlers + routes + adminPages + prismaFragment + envVarsRequired + dataApiAllowlist 6 필드) + defineTenant helper + packages/tenant-almanac/{manifest.ts (6 todoHandler stub = ok=false + PLUGIN-MIG-2 안내), package.json, tsconfig, prisma/fragment.prisma placeholder, src/{handlers,routes,admin}/.gitkeep + 이전 매핑 표, README 5단계 마이그레이션}. tsconfig + vitest 양쪽에 `@yangpyeon/tenant-almanac` alias. **메타 가치**: ADR-022 7원칙 #4 "코드 수정 0줄 신규 컨슈머" 토대 + todoHandler stub 의 ok=false 메시지가 PLUGIN-MIG-2~5 진척도 자동 노출 + S97 G-NEW-7 (schema-first 6배 압축) 의 작동 메커니즘. **G-NEW-12 갭 해소** (uploadAttachment 본체 + 4 컴포넌트 렌더). **검증**: vitest 761 → 809 PASS (+48), 회귀 0 / tsc 0 errors / PR 게이트 5항목 자동 통과. 상세: [S98 인수인계서](../../../handover/260510-session98-infra-2-plugin-mig-1.md). |
