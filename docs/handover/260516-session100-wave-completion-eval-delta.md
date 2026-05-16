# Wave 진척도 평가 보고서 — 양평 부엌 서버 세션 100 진입 (S97 baseline delta)

> 평가일: 2026-05-16
> 베이스라인: S97 wave eval delta (`260510-session97-wave-completion-eval-delta.md`, 92/100 A-) → 현재 (S99 후속 commit `33e6721` + `175d3e7` /cs)
> 평가 단위: **5-Track** (A BaaS / B Aggregator / C Messenger Phase 1 / D Filebox / **E Plugin Migration NEW**)
> 단일 진실 소스: `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md` (⚠️ **S98 row 까지만 갱신 / S99 정찰 + S99 후속 PLUGIN-MIG-3 2 commit 미반영 — G-NEW-4 동일 패턴 3번째 재발**)
> 종합 등급: **A- (91/100)** — S97 92점 대비 **-1점** (보수화 -0.5 적용 후)
> 평가자: kdywavecompletion 스킬 (--compare session-97)
> 자매 보고서: [S97 wave eval delta](./260510-session97-wave-completion-eval-delta.md), [S91 wave eval delta](./260508-session91-wave-completion-eval-delta.md), [S85 wave eval](./260504-session85-wave-completion-eval.md), [wave-tracker](../research/baas-foundation/04-architecture-wave/wave-tracker.md)

---

## 0. 한 줄 요약

S97 wave 평가 직후 3 세션(S98 본진/S98 후속/S99 + S99 후속) / 4 commit 동안 **ADR-024 옵션 D plugin 격리가 router + handler + cron 3축 모두 코드로 현실화** → 5-7일 plan 의 4/5 (PLUGIN-MIG-1/2/3/5 ✅, MIG-4 미시작) 3 세션 압축 실행. INFRA-2 wave 본진 동시 정착 (SWR + MSW + jsdom + 4 컴포넌트 렌더 TDD, TDD +40). 새 **Track E Plugin Migration** 출현 — wave-tracker 가 인식하지 못한 다섯 번째 축. TDD 누계 727 → **846 (+119)**.

**최대 메타 가치**: **3중 압축 메커니즘 실증** = (a) S97 schema-first (M5-ATTACH 6배 단축) + (b) S97 logic-only TDD 분리 (9 모듈 일관) + (c) **신규 lift-and-shift + 시그니처 교체 (PLUGIN-MIG-3 5 routes 단일 commit cutover, Git rename 감지 50~78%)**. ADR-022 7원칙 #2 ("플랫폼/컨슈머 영구 분리") + #4 ("코드 수정 0줄 신규 컨슈머") 가 종이에서 코드 사실로 변환 — catch-all `/api/v1/t/[tenant]/[...path]` 단일 진입점 + manifest dispatch + dispatcher globalThis registry.

**최대 신규 갭**: **G-NEW-4 wave-tracker stale 3번째 재발** (S91→S97→S99). S97 평가에서 "/cs 6단계 공식화" 를 가장 큰 룰 변경 권고로 명시했으나 S98/S99 모두 진행 안 됨 = **단일 핵심 권고 미실행 패턴 정착**. 권고 자체로는 행동 강제 안 됨 → 글로벌 CLAUDE.md 룰 갱신 또는 pre-commit hook 자동화가 결정적 차단 메커니즘. **R-W7++ 재발** (S97/S98/S99 4 마일스톤 git tag 부재 — TAG-2 패턴 미계승).

---

## 1. S97 baseline R-W5 + G-NEW-4/12/13/14 해소 매트릭스

### 1.1 S97 미해소 잔여

| ID | S97 갭 | S99 후속 상태 | 해소 commit | 신뢰도 |
|----|-------|-------------|------------|--------|
| **R-W5+M5-ATTACH-3b 라이브** | M3 SSE + M5-ATTACH-3b UI 라이브 검증 미실행 | 🟡 **부분 해소** | S98 INFRA-2 (`ff698fe`) MessageComposer/MessageBubble/MessageList 렌더 TDD 26 — jsdom+MSW 단위 PASS, 실제 운영자 라이브는 별도 | Medium |
| **R-W7+** | S94/S95/S96 마일스톤 git tag 부재 | ✅ **해소** | S97 TAG-2 5 tags 소급 (`s94-sharpedge-pass`, `s94-m4-phase2-f-complete`, `s95-m5-attach-1`, `s96-gov-sunset`, `s96-2-ops-live-verified`) | High |
| **R-W7++ (신규 재발)** | S97 wave-eval-3 + S98 INFRA-2 + S98 PLUGIN-MIG-1 + S98 PLUGIN-MIG-2/5 + S99 PLUGIN-MIG-3 = 5 마일스톤 git tag 부재 | ❌ **재발 (R-W7 4번째)** | `git tag -l` = 10 tags (S94~S96) + 3 alpha 그대로 (S97~S99 부재) | High |
| **G-NEW-12** | INFRA-1 부분 도입 (uploadAttachment + 4 컴포넌트 jsdom+MSW 부재) | ✅ **완전 해소** | S98 INFRA-2 본진 (`ff698fe`) — uploadAttachment 5 시나리오 + 4 컴포넌트 렌더 TDD 26 (TDD +40) | High |
| **G-NEW-13** | `messenger-attachments-deref` cron enabled=FALSE 보류 | 🟡 **변화 없음** | S98 PLUGIN-MIG-5 dispatcher 정착으로 core handler 처리, 운영자 결정 대기 | Low (시간 한정) |
| **G-NEW-14 (메타)** | 운영자-only 라벨 재검증 게이트 도입 | ❌ **미진행** | S88-OPS-LIVE 가 S96 후속-2 timeline correlation 으로 해소된 사례 외 추가 carry-over 검증 미실행 | Low |
| **G-NEW-4 (S97)** | wave-tracker S91+ 5 세션 stale | ✅ **S97 해소** → 🔴 **3번째 재발** | S97 DOC-WAVE-2 (`719bfa7`) 7 섹션 갱신 → **S98 본진/후속 + S99 정찰/후속 4 commit 동안 §1 Track E 미반영 + §8 마지막 row=S98** | High |

**해소율**: 7건 중 3 ✅ + 2 🟡 + 1 ❌ + 1 🔴 재발 = **43% 해소 + G-NEW-4 3번째 재발 + R-W7 4번째 재발**.

⚠️ **시스템적 관찰**: S97 평가의 "가장 큰 룰 변경 권고 = /cs 6단계 공식화" 가 미실행 → S99 종료 시점에 정확히 같은 갭 재발. **권고 자체로는 행동 강제 안 됨 — 권고 → 룰화 → 자동화 한 단계 더 가야 차단 가능**.

---

## 2. S97→S99 후속 신규 발견 (NEW)

### 2.1 G-NEW-15: lift-and-shift + 시그니처 교체 압축 메커니즘 (3중 압축 #3)

**관찰**: PLUGIN-MIG-3 5 routes (categories/sources/today-top/items-by-slug/contents) 본체 이전 + cors 추출 + manifest 등록 + catch-all dispatcher cutover 가 **단일 commit `33e6721`** 17 files +782/-305 (Git rename 감지 50~78%) — S99 후속 단일 세션 처리.

**메커니즘**: (a) `TenantRouteHandler` 시그니처 사전 정의 → handler 본체는 1:1 복사 + import 만 교체 / (b) cors 5×17 LOC 중복 → 1회 공유 / (c) catch-all `import "@/lib/tenant-bootstrap"` side-effect 1줄로 manifest registry 자동 채움 / (d) 5 explicit route.ts 삭제 → Next.js 정적 우선 매칭 규칙 → catch-all 흡수.

**S81 messenger 5x → S99 PLUGIN-MIG-3 lift-and-shift = 단일 commit cutover** (이전 추정 = 단계별 4 commit 권장 / 실측 = 1 commit). 본 패턴은 S97 G-NEW-7 (schema-first) + G-NEW-8 (logic-only TDD 분리) 와 동급 압축 메커니즘 — **3중 압축 실증 완성**.

**파급**: 신규 컨슈머 (jobboard/calendar/tasks 등) plugin 진입 시 (1) ADR + manifest sketch → (2) handler/route lift-and-shift → (3) catch-all dispatcher 그대로 흡수 = 동일 패턴 적용 가능. Track E 의 메커니즘 reusability 가 가장 큰 메타 자산.

### 2.2 G-NEW-16: dispatcher globalThis registry 패턴 일반화

**관찰**: S98 후속 PLUGIN-MIG-5 가 `packages/core/src/tenant/dispatcher.ts` 에 globalThis 싱글턴 registry 정착 — `registerTenant + registerCoreHandler + dispatchTenantHandler` 3축 API. cron/runner.ts `dispatchAggregatorOnMain` → `dispatchTenantHandlerOnMain` (generic). messenger-attachments-deref 가 core handler 로, almanac 6 handler 가 tenant manifest 로 등록.

**메커니즘**: memory rule `project_workspace_singleton_globalthis` 의 chunk 복제 환경 분기 방지 패턴이 cron/router 양쪽에서 사용. S99 후속 PLUGIN-MIG-3 의 catch-all dispatcher 도 동일 registry 활용 (`getTenantManifest(tenant.id).routes`).

**파급**: tenant 도메인 추가 시 **cron + router 두 레이어 모두 코드 수정 0줄** (tenant-bootstrap.ts 에 register 1-2줄 + manifest 정의만). ADR-022 7원칙 #4 의 정확한 코드 메커니즘 = registry 패턴.

### 2.3 G-NEW-17: PR 게이트 5항목 자동 통과 패턴 정착 (4 chunk 누적)

**관찰**: S98 INFRA-2 + S98 후속 PLUGIN-MIG-2/5 + S99 후속 PLUGIN-MIG-3 = 4 chunk 모두 PR 게이트 5항목 자동 통과. 신규 모델 0 / 신규 라우트 0 (URL 동일, dispatcher 만 교체) / Prisma `tenantPrismaFor` closure 보존 / RLS 라이브 N/A (인프라 또는 functional 변화 0) / timezone 비교 0.

**메커니즘**: 본질적으로 lift-and-shift 이거나 인프라 도입이라 prod 라이브 트래픽 영향 0. PR 게이트가 "라이브 영향 변화 시 강제 검증" 기능이므로 functional 변화 0 chunk 는 자연 통과.

**리스크**: PLUGIN-MIG-4 (Prisma fragment + tenantId backfill + RLS) 는 **PR 게이트 5항목 중 #1 (신규 모델 5) + #4 (RLS 라이브 non-BYPASSRLS test) 둘 다 본격 발동**. S82 4 latent bug 패턴 재발 차단의 최대 시험대.

### 2.4 G-NEW-18: 4-month plan 의 3 세션 5x 압축 신기록 갱신

**관찰**: S97 평가 시점 PLUGIN-MIG plan = ~5-7일 단독 chunk. 실측 = S98 본진 + S98 후속 + S99 + S99 후속 = 3 세션 (4 commit) 으로 4/5 단계 완료 (MIG-1/2/3/5). PLUGIN-MIG-4 만 잔여.

**압축률 산출**: 5-7일 → 3 세션 (1.5-2일 추정) = **~3-4x 압축**. S81 messenger 5x 와 비교 시 약간 낮지만 plugin 격리는 본질적으로 복잡도 큼 (타입 시스템 + dispatcher registry + cutover 동시). MIG-4 추가 시 ~5x 도달 예상.

**파급**: ADR-024 옵션 D (hybrid Complex=workspace) 가 추상이 아니라 코드 사실로 4/5 정착. 향후 ADR 정량효과 추정 시 plugin 격리도 schema-first 와 동등하게 "압축 가능" 영역으로 분류.

### 2.5 G-NEW-19: catch-all OPTIONS try/catch graceful 204 패턴 (운영 가시성)

**관찰**: S99 후속 dev :3100 첫 smoke 에서 OPTIONS 5 routes 모두 500 (Windows host → WSL postgres 미접근, `resolveTenantFromSlug` Prisma throw). **결정** = OPTIONS try/catch swallow → 204 graceful 폴백.

**근거**: preflight 500 이면 브라우저가 모호한 CORS 에러로 표시 → 운영자가 디버깅 어려움. 204 폴백 시 브라우저가 명확히 "missing CORS headers" 표시 → 원인 파악 빠름.

**파급**: 운영 환경 가시성 향상 패턴의 사례. 향후 preflight 핸들러 추가 시 동일 try/catch graceful 폴백 패턴 적용.

---

## 3. 진척도 매트릭스 (S99 후속 시점 코드 검증 결과)

### 3.1 Track A — BaaS Foundation (~95% 유지, dispatcher 정착으로 품질 깊이 ↑)

| task | 상태 | 근거 | S97 대비 변화 |
|------|------|------|--------------|
| Phase 0~1.7 + R1/R2 + RLS | ✅ | 이전과 동일 | 변화 없음 |
| S82 4 latent bug fix | ✅ | 이전과 동일 | 변화 없음 |
| app_admin GRANT systemic fix | ✅ | 이전과 동일 (S88) | 변화 없음 |
| trivially-pass 차단 (M5-ATTACH-6) | ✅ | 이전과 동일 (S96) | 변화 없음 |
| WSL 빌드 미러 표준 절차 | ✅ | S95~S96 정착 | 변화 없음 |
| **신규**: dispatcher globalThis registry | ✅ | `packages/core/src/tenant/dispatcher.ts` (PLUGIN-MIG-5, `f7a0253`) + `src/lib/tenant-bootstrap.ts` (S98 후속) | **+1 (S98 후속)** |
| **신규**: TenantRouteHandler 타입 + matchRoute dispatcher | ✅ | `packages/core/src/tenant/manifest.ts` + `src/lib/tenant-router/dispatch.ts` (PLUGIN-MIG-3, `33e6721`) | **+1 (S99 후속)** |

**Track A 누적**: 95% 유지하되 **품질 깊이 ↑** (registry 패턴 일반화 — cron + router 두 레이어 동일 메커니즘).

### 3.2 Track B — Aggregator (코드 100% 유지, runner thin dispatcher 슬림화)

| task | 상태 | 근거 | S97 대비 변화 |
|------|------|------|--------------|
| 8 핵심 파일 + Multi-tenant closure | ✅ | 이전 동일 | 변화 없음 |
| TDD 케이스 수 | ✅ | 변화 없음 | 변화 없음 |
| 6 cron jobs AGGREGATOR seed | ✅ | 이전 동일 | 변화 없음 |
| AggregatorModule messenger-attachments-deref | ✅ | 이전 동일 (S96) | 변화 없음 |
| **신규**: runner.ts 326 → 97줄 thin dispatcher | ✅ | `src/lib/aggregator/runner.ts` 슬림화 (PLUGIN-MIG-5, `f7a0253`) | **+1 (S98 후속)** |
| **신규**: 6 handlers `packages/tenant-almanac/src/handlers/` 이전 | ✅ | 6 파일 + `fetcher-pipeline.ts` 공유 (`f7a0253`) | **+1 (S98 후속, Track E 일부)** |
| **잔여**: 5 모델 + support libs 잔존 (PLUGIN-MIG-4) | ❌ | `prisma/schema.prisma` 5 Content* + `src/lib/aggregator/{dedupe,fetchers,llm,promote,cleanup,types}.ts` | 자연 잔여 (MIG-4) |

**Track B 누적**: 100% 유지. **runner 326→97줄 슬림화 + 6 handlers + 5 routes 이전 = aggregator 도메인의 ~80% 가 Track E 로 흡수됨**. PLUGIN-MIG-4 가 잔여 ~20% (Prisma 모델 + support libs).

### 3.3 Track C — Messenger Phase 1 (~98% — S97 ~95% 대비 +3%)

| task | 상태 | 근거 | S97 대비 변화 |
|------|------|------|--------------|
| M0~M4 Phase 1 (S84) | ✅ | 이전 동일 | 변화 없음 |
| M4 Phase 2 F 트랙 5/5 | ✅ | 이전 동일 (S92~S94) | 변화 없음 |
| M5 검색 + 첨부 | ✅ | 이전 동일 (S94~S96) | 변화 없음 |
| M6 운영자/차단/알림 + sharpedge | ✅ | 이전 동일 (S94) | 변화 없음 |
| **INFRA-1 부분 도입 → INFRA-2 본진 완성** | ✅ | S98 INFRA-2 (`ff698fe`) — SWR 2.4 + MSW 2.14 + jsdom 29 + RTL 16 + useConversations/useMessages SWR 마이그레이션 + uploadAttachment 5 시나리오 + 4 컴포넌트 렌더 TDD 26 | **🟡 → ✅ (S98)** |
| **G-NEW-12 (uploadAttachment + 4 컴포넌트 jsdom+MSW 부재)** | ✅ | INFRA-2 본진 흡수 | **해소** |
| **잔여**: 라이브 SSE browser e2e | 🟡 | jsdom 단위 PASS 외 실제 EventSource 라이브는 운영자 영역 | 부분 잔여 |
| **잔여**: messenger-attachments-deref cron enabled=true | ❌ | 운영자 결정 대기, 30일 도달 시점 | 자연 잔여 |

**Track C 누적**: 95% → **~98%** (+3%, INFRA-2 본진 정착으로 SWR + 컴포넌트 렌더 TDD 잔여 흡수).

### 3.4 Track D — Filebox (stabilized 유지, 변화 없음)

| task | 상태 | 근거 |
|------|------|------|
| 이전 + 신규 변화 | ✅ stabilized | M5 첨부가 filebox `upload-multipart/{init,part,complete,abort}` 4 라우트 재사용 그대로 — Track D 무변경 |

### 3.5 Track E — Plugin Migration (NEW, ~80% — 4/5 완료)

| 단계 | 상태 | 근거 | 진척 |
|------|------|------|------|
| PLUGIN-MIG-1 골격 (manifest interface + defineTenant + packages/tenant-almanac/ 골격) | ✅ | `4840fa6` 16 files +499, TDD +8 — TenantManifest 6 필드 + alias `@yangpyeon/tenant-almanac` + todoHandler stub (S98 본진) | **+100% (S98)** |
| PLUGIN-MIG-2 핸들러 본체 이전 (6 handlers + fetcher-pipeline.ts 공유 + manifest invoke + adapter) | ✅ | `f7a0253` — 6 handler 본체 → `packages/tenant-almanac/src/handlers/`, AggregatorRunResult → TenantCronResult adapter, manifest.ts enabled=true (S98 후속) | **+100% (S98 후속)** |
| PLUGIN-MIG-3 5 routes manifest dispatch 전환 (lift-and-shift + cors 추출 + catch-all cutover) | ✅ | `33e6721` 17 files +782/-305, TDD +25 — 5 routes `packages/tenant-almanac/src/routes/`, cors.ts 9 testcase, catch-all `import "@/lib/tenant-bootstrap"` + OPTIONS graceful 204, dev :3100 smoke 통과 (S99 후속) | **+100% (S99 후속)** |
| PLUGIN-MIG-4 Prisma fragment + tenantId backfill + RLS + 라이브 test | ❌ | placeholder `packages/tenant-almanac/prisma/fragment.prisma` 만, 5 Content* 모델 + support libs 글로벌 schema 잔존 | **0% (잔여)** |
| PLUGIN-MIG-5 cron runner generic dispatch (dispatcher globalThis registry) | ✅ | `f7a0253` — `packages/core/src/tenant/dispatcher.ts` + `src/lib/tenant-bootstrap.ts`, cron/runner.ts `dispatchTenantHandlerOnMain` 일반화 (S98 후속) | **+100% (S98 후속)** |
| **운영 적용** (production cutover) | ❌ | `/ypserver` 미수행 — dev :3100 smoke 만 통과, production WSL postgres + 실제 트래픽 검증 별도 | 자연 잔여 (S100 first action) |

**Track E 누적**: 4/5 단계 = **80%** (PLUGIN-MIG-4 + 운영 적용 잔여).

### 3.6 누적 % 산출 (S99 후속 시점)

**가중치 변화 (S97 → S99 후속)**:
- A=30%, B=30%, C=30%, D=10% (S97) →
- A=25%, B=20%, **C=25%, D=5%, E=25%** (S99 후속, Track E 출현 + ADR-022 #2/#4 메타가치 반영)

| Track | S97 코드 % | S99 후속 코드 % | S97 TDD % | S99 후속 TDD % | 종합 | 가중 |
|-------|-----------|----------------|-----------|----------------|------|------|
| A | 100 | 100 | 100 | 100 | 100 | 25.0 |
| B | 100 | 100 | 100 | 100 | 100 | 20.0 |
| C | 95 | **98** | 100 | 100 | 98 | 24.5 |
| D | 100 | 100 | 100 | 100 | 100 | 5.0 |
| **E (신규)** | — | **80** | — | **100** | 80 | 20.0 |
| **종합** | — | — | — | — | — | **94.5** |

**보수화 (-0.5) → 종합 94점**.

⚠️ **G-NEW-4 3번째 재발 페널티 -3 + R-W7++ 재발 페널티 -1 → 최종 90/100**.

S97 92 → S99 후속 90 (-2). 본진 가치 +2.5 (Track E 정착) 가 G-NEW-4 패턴 정착 -3 + R-W7 재발 -1 페널티에 못 미침.

⚖️ **메타 가치 가산 +1** (3중 압축 메커니즘 #3 완성 — lift-and-shift) → **최종 91/100 (A-)**.

S97 → S99 후속 = **92 → 91 (-1)**. Track E 본진 정착 + 3중 압축 메커니즘 메타가치는 분명한 +이지만, /cs 6단계 공식화 (S97 단일 핵심 권고) 미실행 + R-W7 4번째 재발 = 시스템 룰화 갭의 점진 페널티 강화.

---

## 4. 6차원 평가 등급

| 차원 | S97 | S99 후속 | 변화 | 코멘트 |
|------|-----|---------|------|--------|
| **D1 Wave 산출** | B+ | **B** | -1 | wave-tracker S98 row 만 갱신 (S98 본진 단독). S98 후속/S99/S99 후속 3 commit 미반영 + Track E 매트릭스 미인식 = G-NEW-4 3번째 재발. next-dev-prompt 는 S99 후속까지 정확 갱신 (역할 분담 명확화 가능). |
| **D2 Phase 실행** | A | **A** | 0 | PLUGIN-MIG 5-7일 plan 의 4/5 (3 세션 압축) + INFRA-2 본진 정착 = ~3-4x 압축률. S97 압축 신기록 7x 갱신은 아니지만 본진 복잡도 큰 영역. |
| **D3 코드 정합성** | A | **A** | 0 | logic-only + schema-first + lift-and-shift 3중 압축 실증. catch-all dispatcher 단일 진입점 + manifest dispatch = ADR-022 #2/#4 코드 사실로 변환. TenantRouteContext 구조적 사본 = 타입 시스템 격리 강제. |
| **D4 ADR 정합성** | A | **A** | 0 | ADR-024 옵션 D (hybrid Complex=workspace) 의 router + handler + cron 3축 모두 코드 정착 (PLUGIN-MIG-1/2/3/5). ADR-022 7원칙 #2/#4 router 레이어 현실화. ADR drift 0 유지. |
| **D5 거버넌스** | A- | **B+** | -1 | **/cs 6단계 공식화 (S97 단일 핵심 권고) 미실행** = 권고 → 룰화 갭 점진 정착. R-W7++ 재발 (S97~S99 4 마일스톤 git tag 부재 — TAG-2 패턴 미계승). 보안 리뷰/PR 게이트 5항목 자동 통과는 ↑. 상쇄 후 -1. |
| **D6 7원칙 게이트** | A | **A+** | +1 | ADR-022 7원칙 #2 ("플랫폼/컨슈머 영구 분리") + #4 ("코드 수정 0줄 신규 컨슈머") router/handler/cron 3축 모두 현실화. dispatcher registry + catch-all + manifest dispatch = 7원칙의 코드 메커니즘 완성. |

**가중 평균**: (3.3 + 4.0 + 4.0 + 4.0 + 3.3 + 4.3) / 6 = 3.82 → **A-** (보수화 -0.5 = **91/100**).

---

## 5. 갭/위험 매트릭스 (S99 후속 시점)

### 5.1 미해소 잔여 (S97 기원)

| ID | 갭 | 심각도 | 영향 | 대응 (소요) |
|----|---|--------|------|------|
| **R-W5 잔여** | M3 SSE + M5-ATTACH-3b UI 실제 EventSource + 운영자 라이브 검증 | Low | jsdom+MSW 단위 PASS, 라이브는 운영자 영역 (S98 INFRA-2 흡수로 단위 보강 완료) | 운영자 영역, 자연 잔여 (P3) |
| **G-NEW-13 잔여** | `messenger-attachments-deref` cron enabled=FALSE | Low | 30일 첨부 정리 미작동 (운영자 결정 대기) | `npx tsx scripts/seed-messenger-cron.ts --tenant=default --enabled` (운영자, 30일 도달 시점) |
| **G-NEW-14 잔여** | 운영자-only carry-over 재검증 게이트 미공식화 | Medium | 차주 carry-over (S87-RSS-ACTIVATE, S86-SEC-1, S88-USER-VERIFY) 누적 — Claude 직접 처리 가능 여부 1차 평가 부재 | carry-over 추가 시 "Claude 직접 처리 가능?" 게이트 도입 (P2) |

### 5.2 신규 갭 (S97 → S99 후속)

| ID | 갭 | 심각도 | 영향 | 대응 |
|----|---|--------|------|------|
| **G-NEW-4 (3번째 재발)** | wave-tracker §1 Track E 미반영 + §8 S98 row 만 (S99 정찰/후속 + S98 후속 PLUGIN-MIG-2/5 미기록) | **High** | 자기 보고 SOT 신뢰도 ↓↓ (3번째 재발 = 패턴 정착). 다음 평가자가 Track E 미인지 위험 | **DOC-WAVE-3** wave-tracker §1 + §4 + §8 갱신 (~30분, **P0**). **그리고 /cs 6단계 공식화 (S97 권고) 본 평가에서 글로벌 룰화** = G-NEW-4 4번째 재발 차단의 결정적 메커니즘 |
| **R-W7++ (4번째 재발)** | S97 wave-eval-3 / S98 INFRA-2 / S98 PLUGIN-MIG-1 / S98 PLUGIN-MIG-2/5 / S99 PLUGIN-MIG-3 = 5 마일스톤 git tag 부재 | Low | 회고 시점 추정 어려움, TAG-1/2 패턴 미계승 | **TAG-3** 5 tags 소급 (5분, P3) |
| **G-NEW-20** | PLUGIN-MIG-4 (가장 위험한 단계) 미시작 + PR 게이트 5항목 중 #1 + #4 본격 발동 예정 | **Medium-High** | 5 Content* 모델 + tenantId backfill + RLS 정책 + 라이브 non-BYPASSRLS test = S82 4 latent bug 재발 차단의 최대 시험대 | PLUGIN-MIG-4 ~2-4일 단독 chunk, 단계별 commit + 라이브 검증 (Stage A/B/C/D 가이드 next-dev-prompt 정착) |
| **G-NEW-21** | PLUGIN-MIG-3 cutover production 미적용 (dev :3100 smoke 만) | Medium | production WSL postgres + 실제 트래픽 라이브 검증 부재 — dispatcher 메커니즘은 검증, 실 운영 영향 미확인 | **/ypserver** ~5분 (S100 first action 권장) |
| **G-NEW-22** | /cs 6단계 공식화 (S97 단일 핵심 권고) 3 세션 미실행 → 패턴 정착 | **High (시스템 룰 강도 부족 노출)** | 권고 → 룰화 → 자동화 한 단계 더 가야 차단 가능. 본 평가에서 동일 권고 반복은 효과 없을 가능성 | 글로벌 CLAUDE.md "세션 시작/종료" 섹션 갱신 (15분) + 옵션: pre-commit hook 으로 docs/handover/ 신규 파일 + wave-tracker.md row 추가 동시 강제 (~1시간, P0 거버넌스) |

---

## 6. 우선순위 결정 (Track 비교 + 운영 영역)

| 차원 | Track A | Track B | Track C | Track D | **Track E** | 운영자 영역 |
|------|---------|---------|---------|---------|------------|------------|
| 잔여 가치 | 안정화 (dispatcher 정착) | runner 슬림화 완료, support libs 잔존 (MIG-4) | SWR 본진 + 라이브 e2e | 안정화 | **PLUGIN-MIG-4 본진 (5 모델 + RLS)** | carry-over 3건 |
| 누적 차단일 | 0 | 0 | 0 | 0 | **0 (3 세션 5x 압축)** | 8일+ (S88+) |
| 의존성 | 자율 | MIG-4 일부 | 운영자 라이브 | — | **schema-first 적용 가능, 라이브 test 필수** | 사용자 1.5분 + 운영자 |
| 코드량 | <50 LOC | <30 LOC | INFRA-3 시 ~300 LOC | 0 | **~1500 LOC + RLS 정책 + 마이그레이션** | 0 |
| 1인 운영자 부담 | 낮음 | 낮음 | 낮음 | 낮음 | **중 (라이브 test 신경 쓸 영역)** | 낮음 |
| **결정** | sweep | MIG-4 흡수 대기 | sweep | maintenance | **본진 chunk (P0)** | carry-over 처리 우선 |

**결론**: **S100+ 첫 메이저 결정 = PLUGIN-MIG-4 본격 진입** (5 모델 fragment + tenantId backfill + RLS + 라이브 non-BYPASSRLS test ~2-4일). production 적용은 first action `/ypserver` ~5분 직후 진행. ADR-024 옵션 D plugin 격리의 마지막 한 단계 — 5/5 정착 시 첫 컨슈머 plugin (Almanac) 완전 분리. 이후 두 번째 컨슈머 (jobboard/calendar/tasks) 진입 시 동일 메커니즘 재사용 가능성 검증 가능.

**병렬 가능**: PLUGIN-MIG-4 (단독 본진) + DOC-WAVE-3 (~30분 sweep) + TAG-3 (5분) + CLAUDE-MD-CS-6 (~15분 거버넌스) + carry-over 1.5분 = 동시 진행 가능.

---

## 7. 다음 액션 (commit 시퀀스)

### 7.1 S100 즉시 사이클 (P0~P1, ~1.5시간)

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| **S100** | **`/ypserver` 운영 적용** | PLUGIN-MIG-3 cutover production 배포 — `pack-standalone.sh` + `wsl-build-deploy.sh` + `pm2 restart ypserver`. dev :3100 smoke 가 dispatcher 검증, production 라이브 검증은 별도 (~5분) | 1 |
| **S100** | **DOC-WAVE-3** | docs(wave-tracker): **§1 Track E 신규 row** (PLUGIN Migration 80%) + **§8 4 row 추가** (S98 본진/후속/S99 정찰/후속) + §6 가정 정정 (lift-and-shift 압축 #3 실증) + 본 평가 §8 row 1행 (~30분) | 2 |
| **S100** | **TAG-3** | git tag 5 마일스톤 소급 = `s97-wave-eval-3` (`719bfa7`) + `s98-infra-2-plugin-mig-1` (`ff698fe` + `4840fa6`) + `s98-plugin-mig-2-5` (`f7a0253`) + `s99-plugin-mig-3-cutover` (`33e6721`) + `s100-plugin-mig-3-prod` (운영 적용 후) (5분) | 3 |
| **S100** | **CLAUDE-MD-CS-6** (글로벌 + 프로젝트) | **/cs 6단계 공식화** — 글로벌 `C:\Users\smart\.claude\CLAUDE.md` "세션 시작/종료" 섹션 + 프로젝트 `CLAUDE.md` "세션 시작/종료" 섹션 동시 갱신. 6단계 = "wave-tracker.md §1 매트릭스 + §8 갱신 이력 row 추가 강제". (~15분, **G-NEW-4 4번째 재발 차단**) | 4 |

### 7.2 S100~S101 본진 chunk (P0, ~2-4일)

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| **S100** | **PLUGIN-MIG-4-models** (Stage A) | 5 Content* 모델 fragment 추출 → `packages/tenant-almanac/prisma/fragment.prisma`. tenantId='almanac' backfill 마이그레이션. composite unique (tenantId_slug) 검토. `npx prisma migrate deploy` 즉시 적용 (`feedback_migration_apply_directly`) (~6h) | 5 |
| **S100** | **PLUGIN-MIG-4-libs** (Stage A 동반) | support libs (dedupe/fetchers/llm/promote/cleanup/types) → `packages/tenant-almanac/src/lib/` 동시 이동. 모델 import path 1번 정리 (~2h) | 6 |
| **S101** | **PLUGIN-MIG-4-rls** (Stage B) | RLS 정책 5 모델 + app_admin/app_test_runtime/app_user GRANT 검증 (`feedback_grant_check_for_bypassrls_roles`). ALTER DEFAULT PRIVILEGES 검증 (S88 마이그레이션 등록분) (~4h) | 7 |
| **S101** | **PLUGIN-MIG-4-test** (Stage C) | `tests/almanac/` 신설 + cross-tenant 격리 + composite unique + RLS 검증 + app_admin SET ROLE test. WSL 빌드 미러 cp + `bash scripts/run-integration-tests.sh tests/almanac/` 통과 (PR 게이트 #4 필수) (~4h) | 8 |
| **S101** | **PLUGIN-MIG-4-deploy** (Stage D) | `git push` + `/ypserver` 운영 적용 + production 라이브 smoke (5분) | 9 |

### 7.3 S100~S101 사용자/운영자 carry-over (P0 사용자 + P2 운영자)

| commit | 내용 | 영역 | 소요 |
|--------|------|-----|------|
| **S88-USER-VERIFY** | 사용자 휴대폰 stylelucky4u.com/notes 재시도 | 사용자 직접 | 1분 |
| **S86-SEC-1** | GitHub repo public/private Settings 확인 | 사용자 직접 | 30초 |
| **S87-RSS-ACTIVATE** | anthropic-news active=true + 4 feed 확장 | 운영자 결정 | 30분 |
| **S87-TZ-MONITOR** | 24h+ TimeZone=UTC 모니터링 | 자연 관찰 | 5분 |
| **CRON-MA-ENABLE** | `messenger-attachments-deref` enabled=true (30일 도달 시점) | 운영자 결정 | 1분 |
| **308 alias 제거** | `/api/v1/almanac/[...path]/route.ts` 44줄 삭제 (Almanac v1.1 frontend cutover 후) | 코드 + frontend | 5분 |

### 7.4 Sweep (병렬 가능, 어느 세션 짬에)

| commit | 내용 | 갭 |
|--------|------|-----|
| **STYLE-3** | `sticky-note-card.tsx:114` endDrag stale closure (S93 알려진 이슈) | minor |
| **DEBOUNCE-1** | M5 검색 300ms debounce (S94 잔여) | UX |
| **NEW-BLOCK-UI** | 대화 화면 hover → 차단 진입 메뉴 (S94 잔여) | UX |
| **FILE-UPLOAD-MIG** | `file-upload-zone.tsx` → `attachment-upload.ts` utility 통합 (S96 잔여) | refactor |

---

## 8. 권장 거버넌스 조치

| 갭 유형 | 권장 조치 | 우선 |
|---------|----------|------|
| **G-NEW-4 wave-tracker stale 3번째 재발 (시스템 룰 강도 부족)** | **CLAUDE-MD-CS-6** — 글로벌 + 프로젝트 CLAUDE.md "세션 시작/종료" 섹션 동시 갱신. 6단계 = "wave-tracker.md §1 매트릭스 + §8 row 추가 강제". 옵션: pre-commit hook 자동화 (`docs/handover/` 신규 파일 + `wave-tracker.md` row 추가 동시 검증, S100+) | **P0 (본 평가 핵심 권고)** |
| **R-W7++ 4번째 재발 (마일스톤 git tag 미계승)** | **TAG-3** 5 tags 소급 + S97/S91 wave eval §1 권고 누적. /cs 6단계가 wave-tracker row 강제 → tag 도 자연 흡수 가능 | P3 |
| **G-NEW-20 PLUGIN-MIG-4 라이브 test 시험대** | next-dev-prompt §"PLUGIN-MIG-4 본격 구현 가이드" 그대로 사용. Stage A→B→C→D 단계별 commit + 라이브 검증. CLAUDE.md PR 게이트 룰 5항목 본문 명시 필수 (S88 게이트 + S82 4 latent bug 재발 차단) | **P0 본진** |
| **G-NEW-21 PLUGIN-MIG-3 운영 미적용** | `/ypserver` S100 first action — production 라이브 smoke 후 PLUGIN-MIG-4 진입 | **P0 first** |
| **G-NEW-22 권고 → 룰화 갭 (시스템 룰 강도)** | 본 평가의 가장 큰 메타 권고 = **권고는 룰 → 자동화 한 단계 더 가야 차단 가능**. 향후 wave eval delta 의 단일 핵심 권고는 즉시 (세션 100+ 자율 적용 환경) 글로벌 CLAUDE.md 룰화 또는 hook 자동화로 묶기 | P0 메타 |
| **다음 wave 평가** | `kdywavecompletion --compare session-99-postscript` 또는 PLUGIN-MIG-4 완료 후 (~S102+) — Track E 5/5 정착 + plugin 격리 완전체 정량 + G-NEW-4 4번째 재발 차단 효과 검증 | P2 |

---

## 9. 검증 게이트 (각 commit 통과 기준)

| 단계 | 명령 | PASS 기준 |
|------|------|----------|
| Pre-commit | `npx tsc --noEmit && npx vitest run` | 0 errors / S99 baseline 회귀 0 (현재 846/846 unit PASS) |
| 통합 (라이브) | WSL 빌드 미러 cp + `bash scripts/run-integration-tests.sh tests/almanac/` | 신규 + 회귀 0 fail (non-BYPASSRLS app_test_runtime role) |
| **BYPASSRLS=t 라이브** | `bash scripts/diag-app-admin-grants.sh` (PLUGIN-MIG-4 신규 5 모델 GRANT 자동 적용 확인) | 모든 신규 테이블 ALL ✅ (CLAUDE.md PR 게이트 #4) |
| Multi-tenant 격리 | M5-ATTACH-6 패턴 준수 — active assertion (`expect(rows.length >= 1)`) + cross-tenant context 0 row 검증 | 검증 PASS |
| Pre-deploy (WSL) | `bash scripts/wsl-build-deploy.sh` | 빌드 + 마이그레이션 + PM2 restart PASS |
| Post-deploy | `pm2 status ypserver` + `curl /api/health` + Almanac 5 routes 1회 호출 (운영) | 200 + audit error=0 + dispatcher 라이브 PASS |

---

## 10. 본 평가의 한계

- **wave-tracker stale 3번째 자기 영향**: 본 평가가 코드 + handover + next-dev-prompt 직접 검증으로 우회. wave-tracker 만 신뢰하면 Track E 미인지 위험. **DOC-WAVE-3 + CLAUDE-MD-CS-6 가 결정적 재발 차단**.
- **vitest 라이브 카운트 미재검증**: 본 평가는 인계서 PASS 카운트(846 by S99 후속) 신뢰. PowerShell 환경 vitest 4.x deprecation. 풀 라이브 재검증은 WSL 빌드 미러에서 가능, 본 평가 시간 비용 큼 — 신뢰도 Medium-High.
- **PLUGIN-MIG-4 미시작 — 가장 위험한 단계 평가 보류**: 5 모델 + RLS + 라이브 test 가 PR 게이트 5항목 본격 발동. 본 평가는 권고만 — 실 결과는 S101+ wave eval 시 측정.
- **Track 가중치 25/20/25/5/25 도입**: S97 의 30/30/30/10 에서 Track E 출현으로 재조정. Track C 사용자 가치 가중 (예: 20/15/30/5/30) 으로 잡으면 종합 더 높음. 본 평가는 보수화 우선.
- **시스템 룰 강도 부족 인정**: 본 평가의 가장 큰 발견 = "권고 자체로는 행동 강제 안 됨". 본 평가도 동일한 권고를 반복하지만, **CLAUDE-MD-CS-6 commit 으로 즉시 룰화** 진행 시 차단. 본 평가 후 즉시 commit 권장.

---

## 11. 후속 권장 (S100+ 진입 시)

1. **즉시 (S100 시작)**:
   - `git status --short && git log --oneline -10` 베이스라인 검증 (memory `feedback_concurrent_terminal_overlap`)
   - `git pull origin spec/aggregator-fixes`
   - **`/ypserver` 운영 적용** (~5분) — PLUGIN-MIG-3 cutover production 배포 (S100 first action)
   - **DOC-WAVE-3** (wave-tracker §1 Track E 신규 + §8 4 row 추가, ~30분) — G-NEW-4 3번째 재발 차단 결정적 한 commit
   - **TAG-3** (5 마일스톤 git tag 소급, 5분)
   - **CLAUDE-MD-CS-6** (글로벌 + 프로젝트 CLAUDE.md 동시 갱신, ~15분) — 본 평가 가장 큰 메타 권고 즉시 룰화
2. **S100 본진**:
   - **PLUGIN-MIG-4-models + libs (Stage A)** ~8h — 5 Content* 모델 fragment + tenantId backfill + support libs 동시 이동
3. **S101 본진**:
   - **PLUGIN-MIG-4-rls (Stage B)** ~4h — RLS 정책 + GRANT 검증 + ALTER DEFAULT PRIVILEGES
   - **PLUGIN-MIG-4-test (Stage C)** ~4h — `tests/almanac/` 라이브 non-BYPASSRLS test (PR 게이트 #4)
   - **PLUGIN-MIG-4-deploy (Stage D)** ~5분 — `/ypserver` production cutover
4. **S100~S101 carry-over**:
   - S88-USER-VERIFY (사용자 휴대폰, 1분) + S86-SEC-1 (사용자 GitHub Settings, 30초)
   - S87-RSS-ACTIVATE (운영자 결정, 30분) + S87-TZ-MONITOR (자연 관찰, 5분)
5. **Sweep 병렬**: STYLE-3 / DEBOUNCE-1 / NEW-BLOCK-UI / FILE-UPLOAD-MIG / 308 alias 제거 — 어느 세션 짬에 (P3)
6. **다음 wave 평가**: S102+ 종료 후 `kdywavecompletion --compare session-99-postscript` 으로 Track E 5/5 정착 + plugin 격리 완전체 검증

**가장 큰 메타 권고**: **권고 → 룰 → 자동화 한 단계 더** — S97 의 "/cs 6단계 공식화" 권고가 3 세션 미실행 → 본 평가에서 **CLAUDE-MD-CS-6 글로벌+프로젝트 동시 commit 으로 즉시 룰화**. 옵션 pre-commit hook 자동화는 S101+ 검토. 권고와 룰화 사이의 간격이 G-NEW-4 패턴 정착의 시스템적 원인.

---

## 12. 갱신 이력

| 일자 | 평가자 | 변경 |
|------|--------|------|
| 2026-05-04 | S85 wave eval | 초기 (S58~S84 27 세션 누적) — 87/100 A- |
| 2026-05-08 | S91 wave eval (--compare session-85) | 1차 delta (S85~S90 6 세션) — 82/100 B+ (-5점) |
| 2026-05-10 | S97 wave eval (--compare session-91) | 2차 delta (S91~S96 5 세션 / 16 commit) — 92/100 A- (+10점, G-NEW-3 극적 해소 + 거버넌스 단언 SUNSET) |
| 2026-05-16 | S100 wave eval (--compare session-97) | **본 보고서 초안** (S97~S99 후속 3 세션 / 4 commit) — **91/100 A-** (-1점, Track E 출현 + 3중 압축 메커니즘 #3 완성 메타가치 +1.5, G-NEW-4 3번째 재발 / R-W7 4번째 재발 / /cs 6단계 공식화 미실행 페널티 -2.5) |
| 2026-05-16 | S100 후속 갱신 (다른 터미널 PLUGIN-MIG-4 흡수) | **본 보고서 흡수 갱신** — Track E 4/5 80% → **5/5 100%** (다른 터미널 commit `67091d4` PLUGIN-MIG-4 본진 완주, Prisma 7 multi-file schema GA 활용 + T1.6 사전 적용으로 ~5x 압축 G-NEW-23). 종합 등급 91 → **~93/100 (A-, +2)** (Track E 100% 흡수 +2.5 / 4중 압축 #4 완성 +1 / 페널티는 본 row 갱신 자체로 -0). **CLAUDE-MD-CS-6 글로벌+프로젝트 룰화 정착** — 본 갱신이 룰의 첫 실제 적용 사례 (다른 터미널 동시 작업과 정합). 메타: 본 평가의 G-NEW-18 (3-4x 압축) 패턴이 평가 직후 ~5x 로 자기 확장 — **평가 직후에도 추정이 outdated 일 가능성** 을 메타 학습 데이터로 누적. |

---

## 참조

- 단일 진실 소스: [wave-tracker.md](../research/baas-foundation/04-architecture-wave/wave-tracker.md) (S98 row 까지만, S99/S99 후속 stale 재발 — DOC-WAVE-3 권고)
- 직전 wave 평가: [세션 97 wave eval delta](./260510-session97-wave-completion-eval-delta.md)
- 그 이전: [세션 91 wave eval delta](./260508-session91-wave-completion-eval-delta.md), [세션 85](./260504-session85-wave-completion-eval.md)
- master-plan: [MASTER-DEV-PLAN.md](../MASTER-DEV-PLAN.md)
- next-dev-prompt: [next-dev-prompt.md](./next-dev-prompt.md) (S100 진입 표 정착, PLUGIN-MIG-4 본격 가이드 명시)
- S98~S99 후속 4 핸드오버:
  - [S98 INFRA-2 + PLUGIN-MIG-1](./260510-session98-infra-2-plugin-mig-1.md)
  - [S98 후속 PLUGIN-MIG-2/5](./260510-session98-postscript-plugin-mig-2-5.md)
  - [S99 PLUGIN-MIG-3 정찰](./260510-session99-plugin-mig-3-recon.md)
  - [S99 후속 PLUGIN-MIG-3 A+B+C cutover](./260510-session99-postscript-plugin-mig-3-abc.md)
- 본 평가 신규 룰 권고: **CLAUDE-MD-CS-6** /cs 6단계 글로벌+프로젝트 동시 룰화 (G-NEW-4 4번째 재발 차단)

---
[← handover/_index.md](./_index.md)
