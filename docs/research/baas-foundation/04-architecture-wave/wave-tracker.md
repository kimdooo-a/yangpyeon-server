# Wave Tracker — Post-BaaS 4-Track 진척도

> 작성: 2026-05-03 (세션 84)
> 위치: `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md`
> 출처: `wave-wiggly-axolotl.md` (외부 plan, S80 작성) + 세션 80~83 실측
> 자매: [01 Wave 호환성 매트릭스](./03-migration/01-wave-compatibility-matrix.md) (Supabase Wave 1~5)
> 갱신 정책: **세션 종료 시 진행도 row 갱신**. 외부 plan 파일 (`~/.claude/plans/wave-wiggly-axolotl.md`) 의 영구 사본 역할.

---

## 0. 한 줄 요약

S80~S83 4 세션 동안 wave-wiggly-axolotl 시퀀스(원래 5 세션 분량)가 5x 압축 실행됨. **Track A ~95% / Track B 100% / Track C 60% / Track D stabilized**. 다음 단일 가장 큰 가치 = **Track C M4 UI 보드 (5~7 작업일 chunk)**.

**S85~S91 갱신 (2026-05-08)**: Track A 품질 깊이 ↑ (S88 systemic GRANT fix 4-month prod latent 차단 + S89~S90 silent catch sweep 8 위치 표면화 + S91 origin push 해소) / Track B TDD 81→100% (R-W1 해소, llm 27/promote 27/runner 15) / Track C **M4 Phase 2 0% 진행 (6 세션 정체, G-NEW-3 거버넌스 단언 정착)** / Track D 변화 없음. 종합 등급 S85 87/100 → S91 82/100 (-5, Track C 정체 페널티). 상세: [S91 wave eval delta](../../../handover/260508-session91-wave-completion-eval-delta.md).

---

## 1. 4-Track 매트릭스

| Track | 영역 | 시퀀스 | 완료 % | 마지막 마일스톤 (commit) |
|---|---|---|---|---|
| **A** | BaaS Foundation | Phase 0~4 (T1.1~T1.7 + R1/R2 + RLS) | **~95% (품질 깊이 ↑)** | S88 `app_admin` GRANT systemic fix 4개월 prod latent (`d18154e`) + S89~S90 silent catch 8 위치 표면화 (`d10b5e9` `5f64675`) + S91 origin push 해소 (`899090b`). prod TimeZone=UTC 운영 .env 검증 PASS (S91). |
| **B** | Almanac Aggregator | T1~T9 (B-pre + B1~B8) | **100% (TDD 100%, R-W1 해소)** | S81 첫 라이브 카드 50개 (`ffdd2dd`). S83 9 RSS active. **S87 TDD 81→100% (`effd6fa`, llm 27/promote 27/runner 15 = +32 case 정확 일치)**. |
| **C** | Messenger Phase 1 | M0~M6 (PRD + 9 모델 + 6 enum + 17 라우트 + SSE + UI + 안전 + 알림) | **70% (M4 Phase 2 정체)** | S84 M4 UI Phase 1 라이브 (`f3bf611`). **M4 Phase 2 6 세션 정체 (S85~S91 = 0건 진행, G-NEW-3 거버넌스 단언 정착)**. M5/M6 미시작. |
| **D** | Filebox | R2→SeaweedFS pivot + multipart + body limit | **stabilized** | S79 Next.js 16 standalone 100mb fix (`fd4d666`). S83 multipart cleanup cron. 변화 없음. |

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

- [x] **prod DATABASE_URL TimeZone=UTC 적용** ✅ S91 운영 `~/ypserver/.env` grep 검증 — `options=-c TimeZone%3DUTC` URL-encoded 적용 확인.
- [x] **PR 리뷰 게이트 룰 정착** (RLS + tenantPrismaFor closure + non-BYPASSRLS test) ✅ + S88 후속 #4 BYPASSRLS=t 라이브 SET ROLE 게이트 확장 (`d10b5e9`).
- [x] **`app_admin` GRANT systemic fix** ✅ S88 — `prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql` 직접 적용 + ALTER DEFAULT PRIVILEGES 3종 + 37/37 ALL 검증.
- [x] **silent catch 30 후보 sweep** ✅ S89~S90 — 8 위치 fix (HIGH/primary `console+toast` / secondary/polling `console만` 차등) + 합리적 skip 23건 보존.
- [x] **origin push 4 commits** ✅ S91 — `899090b` `e33a318..2120769` fast-forward + GCM credential reject 우회 패턴 정착.

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
| M1 | **9 데이터 모델 + 6 enum** + 마이그레이션 | ✅ (R-W2 정정 — wave-tracker 기존 "11 모델" 오기, 실측 9 모델 + 6 enum) | S67 |
| M2 | 도메인 헬퍼 + Zod + **17 라우트 파일** (다중 HTTP method 포함, route.ts 단위 카운트) | ✅ (R-W6 정정 — wave-tracker 기존 "23 ops 19 라우트" 는 ops 단위 추정, 실측 route.ts 17 파일) | S67~S68 helpers, **S81 17 ops 4 그룹 라우트** |
| M3 | SSE conv 8 + user 4 이벤트 + bus + wire format 헬퍼 | ✅ | S81 conv, **S82 user + 헬퍼 추출** |
| M3 라이브 e2e | 통합 테스트 32 + 4 latent bug fix + events route 라이브 | ✅ unit / ⚠️ browser e2e 운영자 본인 | S82 + S83 빌드+배포 |
| **M4 Phase 1** | **UI 보드 (사이드바 + 대화목록 + 채팅창 기본)** | ✅ S84 다른 터미널 (`f3bf611`) | S84 |
| **M4 Phase 2** | **Composer + clientGeneratedId UUIDv7 + 낙관적 업데이트 + 답장 + 멘션 + use-sse 운영 + DIRECT peer 이름 lookup + SWR** | **❌ 6 세션 정체 (S85~S91 = 0건 진행, G-NEW-3)** | **S92+ 무조건 단독 chunk 진입** |
| M5 | 첨부 + 답장 + 멘션 + 검색 (filebox 통합 + cmdk + GIN trgm) | ❌ | M4 Phase 2 후속 |
| M6 | 알림 + 차단/신고 + 운영자 패널 + kdysharpedge 보안 리뷰 | 🟡 모델만 (UserBlock + AbuseReport M2 흡수), UI/패널 미시작 | M5 후속 |

### 4.2 백엔드 라이브 인프라

- 17 엔드포인트 PM2 ypserver 라이브 (`/api/v1/t/<tenant>/messenger/...`)
- SSE events route + 25s keepalive + 멤버 검증 + tenant 격리
- 통합 테스트 32 + SSE wire format 7 + listener-throw 패턴 (brittle test 회피)
- DB role `app_test_runtime` non-BYPASSRLS + `scripts/setup-test-db-role.sh` + `scripts/run-integration-tests.sh`

### 4.3 잔여

- [ ] **M4 UI 보드 Phase 1** (S84-F1, 단일 세션 chunk = 사이드바 + 라우트 + 대화목록 + 채팅창 기본)
  - 다른 터미널 위임 프롬프트: `docs/handover/s84-parallel-prompt-m4-ui-phase1.md`
- [ ] M4 UI 보드 Phase 2 (composer 인터랙티브 + SSE wiring)
- [ ] M5 (첨부 + 답장 + 멘션 + 검색)
- [ ] M6 (알림 + 차단/신고 + 운영자 패널)

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

### S84+ 우선순위 (next-dev-prompt.md 단일 진실)

| # | 작업 | 우선 | 위치 |
|---|---|---|---|
| S84-A | prod TimeZone=UTC 적용 | P1 사용자 의사결정 | 메인 터미널 |
| S84-C | 24h+ 관찰 후 sources 14 확장 | P1 | 메인 터미널 |
| S84-D | inserted=0 dedupe 진단 | P1 | **본 세션 진행** |
| **S84-F1** | **M4 UI Phase 1** (사이드바 + 대화목록 + 채팅창 기본) | **P0 messenger** | **다른 터미널 위임** |
| S84-G | M5 (첨부 + 답장 + 멘션 + 검색) | P1 messenger | S85+ |
| S84-H | M6 (알림 + 차단/신고 + 운영자 패널 + 보안 리뷰) | P1 messenger | S86+ |

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
