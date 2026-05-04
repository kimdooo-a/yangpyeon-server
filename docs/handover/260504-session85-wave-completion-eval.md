# Wave 진척도 평가 보고서 — 양평 부엌 서버 세션 85 진입

> 평가일: 2026-05-04
> 베이스라인: master-dev-plan(2026-04-06) 작성 시점 → 현재(S84+ commit `9957798`)
> 평가 단위: 4-Track (A BaaS / B Aggregator / C Messenger Phase 1 / D Filebox)
> 단일 진실 소스: `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md`
> 종합 등급: **A- (87/100)** — 보수화(-0.5) 적용
> 평가자: kdywavecompletion 스킬 + 3 병렬 Explore 에이전트 (Track A/B/C)
> 자매 보고서: [세션 84 메인 wave 평가](./260503-session84-main-wave-eval-dedupe-cleanup.md)

---

## 0. 한 줄 요약

S58~S84 27 세션 동안 Phase 18~20(BaaS + Messenger) 본진 99% 완주. **Track A 95%(검증 PASS) / Track B 100% 코드 + 81% TDD / Track C 70% 실측(60% 주장 보수적) / Track D stabilized**. 다음 단일 가장 큰 가치 = **Track C M4 UI Phase 2~6 + M5 + M6** (~15 작업일 chunk).

**최대 발견 갭**: Track B "100%" 주장은 **코드 100% 기준이며 TDD는 81%**(170 약속 → 139 실측, llm/promote/runner 32 case 미달). PR 게이트 룰 #4(non-BYPASSRLS 라이브 테스트)가 적용되지 않은 영역.

---

## 1. 진척도 매트릭스 (Phase 3 코드 검증 결과)

### 1.1 Track A — BaaS Foundation (~95% 주장)

| task | 상태 | 근거 | 계획 vs 실측 갭 |
|------|------|------|----------------|
| Phase 0 ADR-022~029 ACCEPTED | ✅ | 9 파일(022~030) Status: ACCEPTED 명시, 헤더 일치 | 갭 0 (실측 9 = 계획 8 + ADR-030 보너스) |
| Phase 1.1~1.4 Prisma multi-tenant + RLS | ✅ | `prisma/schema.prisma` 36 모델 모두 tenantId 첫/2번째 컬럼 + dbgenerated default | 갭 0 |
| Phase 1.5 Worker pool 격리 | ✅ | `src/lib/cron/runner.ts` dispatchSqlOnMain(L51) / dispatchFunctionOnMain(L71) / dispatchWebhookOnMain(L100) / dispatchAggregatorOnMain(L165) | 갭 0 |
| Phase 1.6 Aggregator schema | ✅ | `prisma/migrations/20260427140000_t1_6_aggregator_with_tenant` + `_seed_almanac_tenant` | 갭 0 |
| Phase 1.7 audit-metrics tenant 차원 | ✅ | `src/lib/audit-metrics.ts:42` byTenant Map + ensureTenantState(L70) + MAX_TENANTS=50 / MAX_BUCKETS_PER_TENANT=100 | 갭 0 |
| R1 withTenantTx | ✅ | `src/lib/db/prisma-tenant-client.ts:242` + getExtendedClient L76 (재진입 방지) | 갭 0 |
| R2 DB 시드 = 슬러그 SOT | ✅ | `slug-mapping-db-vs-spec.md` 결정 + DB 시드 37 슬러그 | 갭 0 |
| S82 4 latent bug fix (commit `8bef896`) | ✅ | tenantPrismaFor closure 패턴 + Prisma extension fix(L91-104) + AbuseReport @map(schema.prisma:1073) | 갭 0 |
| S82 인프라 (테스트 정착) | ✅ | `scripts/setup-test-db-role.sh` + `scripts/run-integration-tests.sh` + `.env.test.example` 3 파일 | 갭 0 |
| S84-D dedupe Fix A (commit `da39576`) | ✅ | `src/lib/aggregator/dedupe.ts:165` WHERE { tenantId: ctx.tenantId, ... } + L156 주석 "S84-D defense-in-depth" | 갭 0 |
| **잔여**: prod TimeZone=UTC | ⚪ | 운영자 의사결정 대기 (S84-A P1) | — |

**Track A 누적 ✅: 10/10 (100% 완료) + ⚪ 1건 사용자 의사결정 대기**

### 1.2 Track B — Almanac Aggregator (100% 주장)

| task | 상태 | 근거 | 계획 vs 실측 갭 |
|------|------|------|----------------|
| 8 핵심 파일 | ✅ | types/dedupe/classify/cleanup/llm/promote/runner.ts + fetchers/index.ts (firecrawl 통합) | 파일 구조 일관 (firecrawl은 api.ts 내 통합 — 의도된 설계) |
| Multi-tenant closure 패턴 | ✅ | dedupe(L163) / promote(L69, L111) / runner(L109, L162, L171, L221, L251, L273) / cleanup(L49) 일관 적용 | 갭 0 |
| **TDD 케이스 수 (vitest 실측)** | **🟡** | **dedupe 26✅ / classify 40✅ / fetchers 30✅ / cleanup 6✅ / llm 13❌ / promote 14❌ / runner 10❌ — 합계 139** | **약속 170 → 실측 139 (32 case 미달, 19% 갭)** |
| 6 cron jobs AGGREGATOR | ✅ | `scripts/seed-aggregator-cron.ts:57-94` 모두 kind=AGGREGATOR (rss-fetch/html-scrape/api-poll/classify/promote/cleanup) | 갭 0 |
| B8 보조 스크립트 5 | ✅ | b8-{activate, check, dedupe-diagnose, list-sources, runnow}.ts | 갭 0 |
| cleanup 모듈 (S84+) | ✅ | `src/lib/aggregator/cleanup.ts:49` withTenantTx + deleteMany 패턴 | 갭 0 (단, **prod 배포 미완료**) |
| 9 RSS sources 라이브 (S81) | ✅ | runNow 검증 PASS, anthropic-news 격리 실증 | 갭 0 |
| 10 commit 모두 git log 존재 | ✅ | c20d90d/0d9a225/a121289/e74f3ef/100ae5c/58a526a/7c50c9f/ffdd2dd/da39576/f4bdf8f | 갭 0 |
| **잔여**: TDD 32 case 보강 + prod 배포 + 24h 관찰 후 14 sources | ❌🟡⚪ | llm +14 / promote +13 / runner +5 보강 필요 | — |

**Track B 누적**: 코드 ✅ 9/9 (100%) / **TDD 81%** (139/170) / 운영 잔여 3건

### 1.3 Track C — Messenger Phase 1 (60% 주장 → 실측 70%)

| task | 상태 | 근거 | 계획 vs 실측 갭 |
|------|------|------|----------------|
| M0 PRD + ADR-030 + wireframes | ✅ | `docs/research/messenger/` 9 파일(_index, PRD-v1, personas-scenarios, line-kakao-feature-matrix, wireframes, data-model, api-surface, milestones, m2-detailed-plan) + ADR-030 ACCEPTED | 갭 0 |
| **M1 데이터 모델** | ⚠️ | prisma/schema.prisma 9 모델 (Conversation, ConversationMember, Message, MessageAttachment, MessageMention, MessageReceipt, UserBlock, AbuseReport, NotificationPreference) + 6 enum | **wave-tracker "11 모델" 주장 vs 실측 9 모델 + 6 enum** (도메인 모델 9 + enum 6 = 15? wave-tracker 오기 또는 재카운트 필요) |
| **M2 17 라우트** | ✅ | `src/app/api/v1/t/[tenant]/messenger/` 17 route.ts 파일 (conversations + members + messages + receipts + typing + events + abuse-reports + admin/reports + user-blocks + notification-preferences + messages/search) + 4 도메인 헬퍼 + route-utils 37 코드 매핑 | wave-tracker "23 ops 19 라우트" — 라우트 파일 수 17개, **ops 카운트(GET/POST/PATCH/DELETE 단위)는 별도 산출 필요** |
| M3 SSE conv 8 + user 4 + bus + 헬퍼 | ✅ | `src/lib/messenger/sse.ts` publishConvEvent/publishUserEvent/encodeSseEvent/encodeSseComment + 채널 키 빌더 + 8+4 이벤트 publish | 갭 0 |
| M3 통합 테스트 32 + S82 fix | ✅ | `tests/messenger/m2-integration.test.ts` describe 12 + it 12 (env-gated) + `tests/messenger/sse.test.ts` 28 it | 갭 0 (테스트 카운트 일치) |
| M4 UI Phase 1 (S84 commit `f3bf611`) | ✅ | `(protected)/messenger/page.tsx` + `[id]/page.tsx` + 4 컴포넌트 + 2 hooks + 8 TDD | 갭 0 (다른 터미널 산출 정확) |
| 사이드바 통합 | ✅ | `src/components/layout/sidebar.tsx` "커뮤니케이션" 그룹 신설 | 갭 0 |
| AbuseReport @map | ✅ | `prisma/schema.prisma:1073` `targetKind @map("target_kind")` (S82 fix 흔적) | 갭 0 |
| **M5 (첨부+답장+멘션+검색)** | ❌ | 코드 0 (단, `messages/search/route.ts` 1 파일은 존재 — 부분 진입?) | M5 정식 미시작 (계획대로) |
| **M6 (알림+차단/신고+운영자)** | 🟡 | 차단/신고 도메인은 M2에 흡수 (UserBlock + AbuseReport 모델/라우트 존재). 운영자 패널 + in-app 알림 종 + NotificationPreference 페이지 미시작 | 도메인 모델만 완료, UI/패널 미시작 |

**Track C 누적**: M0~M4 Phase 1 ✅ 5/6 (실제 70%) / M5 ❌ / M6 🟡 / **wave-tracker "60% 주장은 보수적**(M4 진입 가중치를 작게 잡음)

### 1.4 Track D — Filebox (stabilized)

| task | 상태 | 근거 |
|------|------|------|
| ADR-033 SeaweedFS pivot | ✅ | `docs/research/decisions/ADR-033-seaweedfs-self-hosted-object-storage.md` ACCEPTED |
| S78 multipart upload X1 server proxy | ✅ | commit `963eba5` |
| S79 Next.js 16 standalone proxy 100mb fix | ✅ | commit `fd4d666` `next.config.ts` proxyClientMaxBodySize |
| S83 multipart cleanup cron | ✅ | `scripts/seaweedfs-clean-multipart.sh` + crontab `0 4 * * 0` |

**Track D 누적: 4/4 (100%, 안정화 완료)**

### 1.5 누적 % 산출 (가중치: A=30%, B=30%, C=30%, D=10%)

| Track | 코드 % | TDD/검증 % | 종합 % | 가중 점수 |
|-------|-------|-----------|--------|----------|
| A | 100 | 100 | 100 | 30.0 |
| B | 100 | 81 | 91 | 27.3 |
| C | 70 | 100 (M0~M4 범위) | 70 | 21.0 |
| D | 100 | 100 | 100 | 10.0 |
| **종합** | — | — | — | **88.3** |

보수화(-0.5) 적용 → **87/100**

---

## 2. 6차원 평가 등급

| 차원 | 등급 | 코멘트 |
|------|------|--------|
| **D1 Wave 산출** | A | wave-tracker.md 갱신 정책 명시 + 4-Track 매트릭스 + 압축 통계 + S82 4 latent bug 분류. ADR 9건 + spike 14+9건. 정교함은 최상위 수준. |
| **D2 Phase 실행** | A- | S81 5x 압축, S80 2.3x 압축. 4개월 P0 본진(Almanac aggregator) 완주. M4 Phase 1 다른 터미널 동시 진행. 단, M5/M6는 다음 6 세션+ 필요. |
| **D3 코드 정합성** | **B+** | Track A/D 갭 0 / Track C 모델 수 주장 부정확(11 vs 9) / **Track B TDD 32 case 미달**(약속 170 → 실측 139). PR 게이트 룰 #4가 비-aggregator 영역에서 적용 안 된 흔적. |
| **D4 ADR 정합성** | A | ADR-022~030 9건 ACCEPTED, 코드 반영 완료. ADR-033 SeaweedFS pivot도 코드 매핑. ADR drift 0건. |
| **D5 거버넌스** | A- | PR 리뷰 게이트 룰 5 항목 정착(CLAUDE.md), wave-tracker.md 영속화, 세션 종료마다 row 갱신 정책. 단, git 태그가 본진 마일스톤(S81 첫 라이브)에 없음. |
| **D6 7원칙 게이트** | A | 4 latent bug 동시 fix 후 RLS+tenantPrismaFor closure 패턴 + non-BYPASSRLS 라이브 테스트 머지 게이트 정착. 7원칙 §3 격리 anthropic-news 404 production 실증. |

**가중 평균**: (4.0 + 3.7 + 3.3 + 4.0 + 3.7 + 4.0) / 6 = 3.78 → **A-** (보수화 -0.5 → 87/100)

---

## 3. 갭/위험 매트릭스

| ID | 갭 | 심각도 | 영향 | 대응 |
|----|---|--------|------|------|
| **R-W1** | Track B aggregator TDD 32 case 미달 (llm 13/27, promote 14/27, runner 10/15) | **High** | "100% 주장" 신뢰 저하 + 향후 회귀 차단 약화 + PR 게이트 룰 #4 적용 누락 영역 | llm +14 / promote +13 / runner +5 보강 (총 ~3h, P2 sweep) |
| **R-W2** | Track C wave-tracker "11 모델" 주장 vs 실측 9 모델 + 6 enum | Low | 신규 합류자 오정보 + 진척도 산출 부정확 | wave-tracker §4.1 row 정정 (5분, P2 sweep) |
| **R-W3** | prod DATABASE_URL TimeZone=UTC 미적용 (S84-A) | **Medium** | PrismaPg shift 신규 코드 유입 시 latent bug 재발 위험 (S82 4 latent 패턴) | 트래픽 저점(KST 03:00~05:00) 적용 — 운영자 의사결정 대기 |
| **R-W4** | cleanup 모듈 prod 배포 미완료 | Low | 매일 03:00 KST cron "알 수 없는 module: cleanup" fail (기능 영향 0) | S85-DEPLOY 1회로 흡수 (P0, ~10분) |
| **R-W5** | M3 SSE browser publish/subscribe e2e 라이브 검증 미실행 | Low | unit test 32 + sse wire format 자동 검증 통과로 risk 부분 차단됨. M4 Phase 2 진입 시 자연 검증 | M4 Phase 2 진입 시 자연 흡수 (P1) |
| **R-W6** | Messenger ops 카운트 정확도 (wave-tracker 19 ops vs 라우트 17 파일) | Low | 라우트 파일 수와 ops(HTTP method) 단위 불일치 — 파일당 다중 op 가능 | api-surface.md 와 cross-check (5분, P2) |
| **R-W7** | S81 첫 라이브 카드 50개 마일스톤에 git 태그 없음 | Low | 진척도 추적용 태그 부재 — 회고/감사 시 시점 위치 추정 어려움 | `git tag s81-first-cards-live <ffdd2dd>` 소급 부여 (5분, P3) |

---

## 4. 우선순위 결정 (Track 비교)

| 차원 | Track A | Track B | Track C | Track D |
|------|---------|---------|---------|---------|
| 잔여 가치 | timezone fix (운영) | TDD 보강 (품질 유지) | **M4 Phase 2~6 + M5 + M6** (큰 가치) | 안정화 완료 |
| 누적 차단일 | 0일 | 0일 | M5/M6 미진입 (~6 세션 잔여) | 0 |
| 의존성 | 사용자 의사결정 | 독립 | backend 완성 (✅ 모두 GO) | — |
| 코드량 | <100 LOC | ~400 LOC TDD | ~5,000 LOC (M4 Phase 2 + M5 + M6) | 0 |
| 1인 운영자 부담 | 낮음 | 낮음 | 중간 (UI 단일 패턴 X, chunk 분할 필수) | 낮음 |
| **결정** | 사용자 옵션 (A1) | sweep (P2 병행) | **선두 (P0)** | maintenance |

**결론**: S85 진입 시 (1) S85-DEPLOY 1회 → (2) S85-F2 (M4 UI Phase 2) chunk 진입. Track B TDD 보강은 sweep (P2) 으로 병행 또는 별도 세션.

---

## 5. 다음 액션 (commit 시퀀스)

### 5.1 S85 — 즉시 실행 가능 (P0)

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| **S85** | **DEPLOY** | wsl-build-deploy.sh 1회 — cleanup 모듈 + M4 Phase 1 동시 활성화 (5 commits 흡수) | 1 |
| **S85** | **A1** | (사용자 의사결정 시) prod DATABASE_URL TimeZone=UTC 적용 + 24h 모니터 | 2 |
| **S85** | **F2-1** | feat(messenger): M4 UI Phase 2 — composer textarea autosize + Enter 송신 (TDD ~10) | 3 |
| **S85** | **F2-2** | feat(messenger): M4 UI Phase 2 — clientGeneratedId UUIDv7 + 낙관적 업데이트 (TDD ~12) | 4 |

### 5.2 S86~S87 — M4 Phase 2 완성 (P0)

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| S86 | F2-3 | feat(messenger): M4 — 답장 인용 카드 + 멘션 popover cmdk (TDD ~15) | 5 |
| S86 | F2-4 | feat(messenger): M4 — use-sse hook + conv/user 채널 구독 + 캐시 invalidate (TDD ~10) | 6 |
| S87 | F2-5 | feat(messenger): M4 — DIRECT peer name lookup + User profile cache (TDD ~8) | 7 |
| S87 | INFRA-1 | chore: SWR + jsdom + @testing-library/react 도입 + vitest config 분기 (TDD ~30 컴포넌트 렌더) | 8 |

### 5.3 S88~S90 — M5 + M6 (P1)

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| S88 | M5-1 | feat(messenger): M5 — AttachmentPicker (filebox 통합) + 답장 wiring (TDD ~15) | 9 |
| S88 | M5-2 | feat(messenger): M5 — 멘션 popover 운영 + 검색 페이지 (PG GIN trgm index) (TDD ~12) | 10 |
| S89 | M6-1 | feat(messenger): M6 — in-app 알림 종 + NotificationPreference 페이지 (TDD ~10) | 11 |
| S89 | M6-2 | feat(messenger): M6 — BlockUserDialog + ReportMessageDialog (TDD ~8) | 12 |
| S90 | M6-3 | feat(messenger): M6 — admin/messenger/{moderation, health, quota} 패널 (TDD ~15) | 13 |
| S90 | M6-4 | security: kdysharpedge 보안 리뷰 + sweep PR | 14 |

### 5.4 Sweep (병렬 가능, P2)

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| 어느 세션 | B-tdd-1 | test(aggregator): llm.test.ts 14 case 보강 (getLlmStats / prompt assembly / token edge cases) | — |
| 어느 세션 | B-tdd-2 | test(aggregator): promote.test.ts 13 case 보강 (upsert tx / batch pagination / error recovery) | — |
| 어느 세션 | B-tdd-3 | test(aggregator): runner.test.ts 5 case 보강 (5 dispatcher 통합 / multi-tenant context propagation) | — |
| 어느 세션 | DOC-1 | docs(wave-tracker): "11 모델" → "9 모델 + 6 enum" 정정 (R-W2) | — |
| 어느 세션 | TAG-1 | git tag s81-first-cards-live ffdd2dd (R-W7 소급 부여) | — |

---

## 6. 권장 거버넌스 조치

| 갭 유형 | 권장 조치 | 도구 |
|---------|----------|------|
| R-W1 TDD 미달 | 비-aggregator 영역에서도 PR 게이트 룰 #4 적용 강제. backend PR 본문에 "TDD 케이스 수 vs 약속" 비교 1행 의무화 | CLAUDE.md "PR 리뷰 게이트 룰" §6 항목 추가 |
| R-W2 모델 수 부정확 | wave-tracker.md §4.1 row "11 모델" → "9 모델 + 6 enum" 정정 + 자동 검증 cron(매주 schema.prisma 모델 수 vs wave-tracker row 비교) | 수동 + 자동화 후속 |
| R-W3 timezone fix | 사용자 의사결정 후 적용 — 트래픽 저점 + 영향 분석(재로그인 1회) 사전 공지 | 운영자 |
| R-W4 cleanup 배포 | S85-DEPLOY 1회로 흡수 | `wsl-build-deploy.sh` |
| R-W5 SSE e2e | M4 Phase 2 진입 시 자연 검증 — 별도 세션 불필요 | M4 chunk |
| R-W6 ops 카운트 | api-surface.md 의 op 단위 정의를 wave-tracker §4.1 row 와 cross-check + 정정 | 수동 |
| R-W7 git 태그 부재 | S81 / S82 / S84 마일스톤에 소급 태그 부여 | `git tag` |
| **신규**: 다음 wave 평가 자동화 | `kdywavecompletion --compare session-84` 로 delta 평가를 매 5 세션마다 실행 권장 | `/kdywavecompletion` 스킬 |

---

## 7. 검증 게이트 (각 commit 통과 기준)

| 단계 | 명령 | PASS 기준 |
|------|------|----------|
| Pre-commit | `npx tsc --noEmit && npx vitest run` | 0 errors / 회귀 0 |
| 통합 (라이브) | `bash scripts/run-integration-tests.sh tests/messenger/` 또는 `tests/aggregator/` | 신규 + 회귀 0 fail (non-BYPASSRLS role) |
| Multi-tenant 격리 | 테스트 케이스 1건 = "다른 tenant id로 조회 시 0 rows or 403" | 검증 PASS |
| Pre-deploy (WSL) | `bash scripts/wsl-build-deploy.sh` | 빌드 + 마이그레이션 + PM2 restart PASS |
| Post-deploy | `pm2 status ypserver` + `curl /api/health` + 라이브 cron `b8-runnow` 1회 | 200 + audit error=0 + cron SUCCESS |

---

## 8. 본 평가의 한계 (자기 평가)

- **자기 평가 낙관 편향**: wave-tracker 자체가 본 프로젝트의 산출물이므로 "100% 주장" 등이 자체 정의로 측정됨. 외부 감사가 추가되면 D3 등급은 더 보수화될 가능성.
- **TDD ≠ 통합 검증**: vitest 139 PASS 가 production 회귀 0 을 보장하지 않음. PR 게이트 룰 #4의 라이브 통합 테스트가 진짜 머지 게이트.
- **Phase 18~22 master-plan 매핑 부정확**: master-dev-plan(2026-04-06) 작성 시점에 BaaS+Messenger 영역(Phase 18~22)의 시간 추정은 6~14 세션이었으나 실측 27 세션 사용. 추정 정확도 ~50% (master-plan 자체가 후속 진화의 결과 흡수 미흡).
- **Track 가중치 30/30/30/10 임의**: 실제 사용자 가치 차원에서는 Track C 메신저가 더 높을 수 있음. ARR 영향이 명시되지 않은 상태.

---

## 9. 후속 권장 (S85+ 진입 시)

1. **즉시**: S85-DEPLOY 1회 실행 → cleanup 모듈 + M4 Phase 1 prod 활성화
2. **단기 (S85~S87)**: M4 Phase 2 chunk 5 commit 진행 (`/kdyswarm` 위임 가능 — Phase 2 가 5 commit ≥ 임계 + frontend 단일 영역)
3. **중기 (S88~S90)**: M5 + M6 진행 (~6 commit, M5/M6 그룹별 1 세션씩)
4. **sweep (병렬)**: Track B TDD 32 case 보강 + R-W2 wave-tracker 정정 + R-W7 git 태그 소급
5. **다음 wave 평가**: S90 종료 후 `/kdywavecompletion --compare session-84` 로 delta 평가 (M4~M6 진척 검증 + Phase 2 plugin 트리거 여부)

---

## 10. 갱신 이력

| 일자 | 평가자 | 변경 |
|------|--------|------|
| 2026-05-04 | kdywavecompletion 스킬 + 3 Explore 에이전트 | 초기 작성 (S58~S84 27 세션 누적 평가) |

---

## 참조

- 단일 진실 소스: [wave-tracker.md](../research/baas-foundation/04-architecture-wave/wave-tracker.md)
- master-plan: [MASTER-DEV-PLAN.md](../MASTER-DEV-PLAN.md)
- next-dev-prompt: [next-dev-prompt.md](./next-dev-prompt.md)
- 직전 세션: [세션 84 메인](./260503-session84-main-wave-eval-dedupe-cleanup.md), [세션 84 다른 터미널 M4 Phase 1](./260503-session84-m4-ui-phase1.md)

---
[← handover/_index.md](./_index.md)
