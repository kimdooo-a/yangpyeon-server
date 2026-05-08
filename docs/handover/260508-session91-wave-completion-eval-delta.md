# Wave 진척도 평가 보고서 — 양평 부엌 서버 세션 91 진입 (S85 baseline delta)

> 평가일: 2026-05-08
> 베이스라인: S85 wave eval 보고서 (`260504-session85-wave-completion-eval.md`) → 현재(S90 commit `2120769`)
> 평가 단위: 4-Track (A BaaS / B Aggregator / C Messenger Phase 1 / D Filebox)
> 단일 진실 소스: `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md` (⚠️ 4 세션 stale)
> 종합 등급: **B+ (82/100)** — S85 87점 대비 **-5점 회귀** (보수화 -0.5 적용)
> 평가자: kdywavecompletion 스킬 (--compare session-85 모드)
> 자매 보고서: [세션 85 wave 평가](./260504-session85-wave-completion-eval.md), [wave-tracker](../research/baas-foundation/04-architecture-wave/wave-tracker.md)

---

## 0. 한 줄 요약

S85 평가 후 6 세션(S85→S90) / 14 commit 동안 **계획된 P0 가치(M4 UI Phase 2~6 + M5 + M6 = 14 commit 시퀀스) 0건 진행**, 대신 **반응적 긴급 fix가 100% 대역 점유** — secret recovery (S85), app_admin GRANT 4개월 prod latent 차단(S88), silent catch 30 후보 sweep(S89~S90). **Track A/B는 부수 가치 ↑(R-W1/R-W3/R-W4 해소), Track C는 정체.** 다음 단일 가장 큰 가치 = **M4 UI Phase 2 단독 chunk 진입 (5~7 작업일, 더는 미룰 수 없음)**.

**최대 신규 발견**: **S82 4 latent → S88 1 systemic (5번째 latent 클래스)** — RLS+ACL 검사 순서(ACL 가 RLS 보다 먼저 실행)가 BYPASSRLS=t 운영 role 의 GRANT 누락을 4개월 가렸음. PR 게이트 룰 #4가 BYPASSRLS=t 라이브 SET ROLE 검증으로 확장됨.

---

## 1. S85 baseline R-W1~R-W7 해소 매트릭스

| ID | S85 갭 | S90 시점 상태 | 해소 commit | 신뢰도 |
|----|-------|--------------|-------------|--------|
| **R-W1** | aggregator TDD 32 case 미달 (llm 13/27, promote 14/27, runner 10/15) | ✅ **완전 해소** | S87 `effd6fa` "TDD 81→100% 보강 (llm +14 / promote +13 / runner +5 = 32 case)" — 코드 검증: 실측 27/27/15 정확 일치 | High |
| **R-W2** | wave-tracker "11 모델" 주장 vs 실측 9 모델 + 6 enum | ❌ **미해소** | wave-tracker.md 갱신일 2026-05-04 (S84+) 그대로, S85~S90 4 세션 row 미반영 | — |
| **R-W3** | prod DATABASE_URL TimeZone=UTC 미적용 | ✅ **완전 해소 (S91 검증)** | 운영 `~/ypserver/.env` DATABASE_URL 에 `options=-c TimeZone%3DUTC` URL-encoded 적용 확인 (S86 `c0624d3` 흔적 + S91 라이브 grep 검증) | High |
| **R-W4** | cleanup 모듈 prod 배포 미완료 | ✅ **코드 정착** | `scripts/seed-aggregator-cron.ts:89` `name: "almanac-cleanup", kind: "AGGREGATOR", payload: { module: "cleanup" }` — DB seed 실제 적용 여부는 별도 검증 필요 | Medium-High |
| **R-W5** | M3 SSE browser e2e 라이브 검증 미실행 | ⚪ **계속 대기** | M4 Phase 2 진입 시 자연 검증 예정 — Phase 2 미진입 → 검증 미실행 | — |
| **R-W6** | Messenger ops 카운트 정확도 (19 ops vs 17 파일) | ❌ **미해소** | api-surface.md cross-check 미실행 | — |
| **R-W7** | S81 첫 라이브 마일스톤 git 태그 부재 | ❌ **미해소** | `git tag` 적용 흔적 0 | — |

**해소율**: 3/7 완전 해소(R-W1, R-W3, R-W4) + 4/7 미해소(R-W2, R-W5, R-W6, R-W7 — 모두 sweep level cosmetic).

---

## 2. S85→S90 신규 갭 (NEW)

### 2.1 G-NEW-1: 5번째 4개월 prod latent (S88 systemic GRANT 누락)

**발견 경위**: 사용자 보고 "iPhone Safari + 데스크톱 모두 /notes 미작동" → systematic-debugging Phase 1~4 → root cause = `app_admin` PostgreSQL role 의 BYPASSRLS=t + zero GRANT (4개월 prod hidden).

**스코프**: sticky_notes/webhooks/sql_queries/cron_jobs 외 **public schema 전 37 테이블** 모두 latent broken. 단지 운영자가 그 이후로 운영 콘솔 5~7 메뉴를 ops 콘솔용 `bypassRls=true` 경로로 클릭한 적이 없어 PM2 stderr 의 PG 42501 만 산발 출현.

**메커니즘**: PG ACL 검사가 RLS 보다 먼저 실행 → BYPASSRLS=t 만으로는 ACL 우회 안 됨. `app_admin` 가 처음부터 GRANT 받은 적이 없는 시스템 결함.

**해소**: `prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql` 직접 적용 + ALTER DEFAULT PRIVILEGES (postgres role 의 향후 객체 자동 GRANT) + 검증 블록 (37/37 ALL ✅).

**파급 룰**: CLAUDE.md PR 게이트 룰 #4 확장 — "BYPASSRLS=t 운영 role 도 라이브 SET ROLE 테스트 통과". memory `feedback_grant_check_for_bypassrls_roles.md` 신설.

**잔여 위험**: 다른 ops 콘솔 (Webhooks/SQL Editor/Cron 등) 라이브 호출 미실행 — systemic fix 가 막지만 라이브 검증 미완 (S88-OPS-LIVE P1).

### 2.2 G-NEW-2: silent catch 가 디버깅 비용 9배 증폭한 메타 갭

**발견 경위**: S88 sticky-board.tsx:35 `} catch { /* 무시 */ }` 가 PM2 stderr 의 명백한 42501 을 UI 단에서 차단 → 사용자는 "안 열림"만 인지. 만약 toast.error 였다면 1 round 에 root cause 단서.

**스코프 측정 (S89~S90)**: components/ 7 파일 11 catch + protected/ 23 파일 30+ catch = 30+ 후보. 위험도×UX 매트릭스 분류:
- HIGH 위험 (silent fail UI): 1 (command-menu.tsx PM2 restart)
- primary content (user-blocking): 2 (filebox/processes detail)
- secondary content: 2
- polling (toast spam 위험): 1
- 합리적 skip: 23 (JSON parse fallback / capability fallback / polling 재시도 / re-throw / UI state error)

**해소**: S89 commit `d10b5e9` (sticky-board + filebox 2 위치) + S90 commit `5f64675` (5 추가 fix) = 8 위치 차등 적용.

**파급 룰**: silent catch sweep 의 차등 적용 패턴 정착 — "무조건 표면화" 단순 룰의 함정 회피 (polling spam + JSON parse fallback 의도 함정 23건 정확 분류).

### 2.3 G-NEW-3: 6 세션 / 14 commit 구조적 정체 패턴

**관찰**: S85 wave eval 의 commit 시퀀스 (DEPLOY/A1/F2-1~5/INFRA-1/M5-1~2/M6-1~4 = 14 commit) 중 **0건 진행**.

**대신 진행된 것** (S85~S90 14 commit):
| 분류 | commit 수 | 비중 |
|------|----------|------|
| 반응적 긴급 fix (secret recovery, app_admin GRANT, silent catch sweep) | 6 | 43% |
| 부수 sweep (TDD 보강, hook 추가, audit 스크립트) | 4 | 29% |
| docs/cs (handover, journal, wave-tracker 갱신 X) | 4 | 28% |
| 계획된 M4~M6 진행 | **0** | **0%** |

**원인 가설**:
1. **반응적 긴급 fix 의 자연 우선순위 함정** — 사용자 보고 (S88) + 보안 사고 (S85 GitGuardian) 가 제출되면 다른 모든 우선순위 일시 정지됨
2. **M4 Phase 2 chunk 가 5-7 작업일 단독 chunk 라 진입 진입 임계 높음** — 작은 sweep 들이 계속 자연 우선
3. **next-dev-prompt 의 P0 messenger 가 "S85-F2 단독 chunk" 로 표기되어 S86~S90 진입 시마다 회피 가능**

**파급**: M4 Phase 2~6 + M5 + M6 (~14 작업일) 본진이 6 세션 동안 정체. **사용자 가치 (1인 운영자의 멀티테넌트 메신저 출시) 차단일 = 6+ 세션** 으로 누적.

### 2.4 G-NEW-4: wave-tracker.md 4 세션 stale

**관찰**: `wave-tracker.md` §8 갱신 이력 마지막 row = 2026-05-04 (S84+). 본 평가 시점 2026-05-08 / S90 → 4 세션 / 14 commit 미반영.

**S85 평가 보고서 자체에 자매 정정 권고 (R-W7)** 가 있었으나 미실행 — wave-tracker 가 SOT 라고 정책상 천명되었지만 정책-실행 갭 발생.

**파급**: 신규 합류자 또는 평가자가 wave-tracker 의 "60% Track C" 또는 "100% Track B (코드)" 를 신뢰할 경우 S87 TDD 보강(R-W1 해소) / S88 systemic GRANT fix / silent catch sweep 미인지.

### 2.5 G-NEW-5: 4 unpushed commits (사용자 결정 영역)

**관찰**: S90 handover 마지막에 "4 unpushed commits — 사용자 push 명령 시 4 commits push" 명시. 본 평가 시점 `git log origin/...` 는 ref 미존재로 정확 카운트 불가.

**파급**: prod 배포 (특히 S88 GRANT migration 은 이미 직접 psql 적용으로 활성화됨, 그 외 silent catch fix + cleanup module 코드는 prod 배포 미완료) 누적.

---

## 3. 진척도 매트릭스 (S90 시점 코드 검증 결과)

### 3.1 Track A — BaaS Foundation (~95% 유지)

| task | 상태 | 근거 | S85 대비 변화 |
|------|------|------|--------------|
| Phase 0~1.7 + R1/R2 + RLS | ✅ | 이전과 동일 | 변화 없음 |
| S82 4 latent bug fix | ✅ | 이전과 동일 | 변화 없음 |
| **신규**: app_admin GRANT systemic fix | ✅ | `prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql` 적용 + 37/37 ALL 검증 | **+1 systemic fix (S88)** |
| **신규**: secret-scan pre-commit hook | ✅ | S87 `b46bf2e` chore | **+1 (S87)** |
| **신규**: silent catch sweep 표면화 (8 위치) | ✅ | S89~S90 commit `d10b5e9` + `5f64675` | **+1 (S89~S90)** |
| **잔여**: prod TimeZone=UTC | 🟡 | S86 진행 흔적 — 운영 .env 직접 확인 필요 | 부분 해소 |

**Track A 누적**: 갭 0 + 신규 systemic fix 3 (보안/RLS+ACL/UI debug 가시성). 95% 유지하되 **품질 깊이 ↑**.

### 3.2 Track B — Aggregator (코드 100% / TDD 100% — S85 대비 +19%)

| task | 상태 | 근거 | S85 대비 변화 |
|------|------|------|--------------|
| 8 핵심 파일 + Multi-tenant closure | ✅ | 이전 동일 | 변화 없음 |
| **TDD 케이스 수** | ✅ | dedupe 26 / classify 40 / fetchers 30(추정 — 검증 미실행) / cleanup 6 / **llm 27 / promote 27 / runner 15** | **🎯 R-W1 완전 해소 (+32 case, 약속 정확 일치)** |
| 6 cron jobs AGGREGATOR seed | ✅ | `scripts/seed-aggregator-cron.ts:57-94` cleanup 포함 | 변화 없음 (cleanup module S84+ 작성, prod seed 적용 여부 별도) |
| anthropic-news source URL fix | ✅ | S85 `ce50988` Olshansk/rss-feeds | **+1 (S85)** |
| runNow recordResult 추가 | ✅ | S85 `3ae830f` cron P2 fix | **+1 (S85)** |

**Track B 누적**: 코드 100% / **TDD 100% (S85 81% 대비 +19%)**. **R-W1 완전 해소.**

### 3.3 Track C — Messenger Phase 1 (M0~M4 Phase 1 70% — S85 대비 변화 없음)

| task | 상태 | 근거 | S85 대비 변화 |
|------|------|------|--------------|
| M0~M4 Phase 1 (S84) | ✅ | components/messenger/{ConversationList, ConversationListItem, MessageBubble, MessageList}.tsx + use-sse.ts | 변화 없음 |
| **M4 Phase 2** (composer + clientGeneratedId UUIDv7 + 답장 + 멘션 + use-sse 운영) | ❌ **0% 진행** | composer/textarea/MentionPopover/ReplyPreview 컴포넌트 부재 — Phase 1 산출만 존재 | **6 세션 정체 ❌** |
| M5 (첨부+답장+멘션+검색) | ❌ | 코드 0 | 변화 없음 (계획대로) |
| M6 (알림+차단/신고+운영자) | 🟡 | UserBlock + AbuseReport 모델/라우트만 존재, UI/패널 미시작 | 변화 없음 |

**Track C 누적**: 70% 그대로. **G-NEW-3 가 가장 큰 갭 — M4 Phase 2 본진 정체.**

### 3.4 Track D — Filebox (stabilized 유지)

| task | 상태 | 근거 |
|------|------|------|
| 이전 + 신규 변화 | ✅ stabilized | 변화 없음 |

### 3.5 누적 % 산출 (가중치: A=30%, B=30%, C=30%, D=10%)

| Track | S85 코드 % | S90 코드 % | S85 TDD % | S90 TDD % | 종합 | 가중 |
|-------|-----------|-----------|----------|----------|------|------|
| A | 100 | 100 | 100 | 100 | 100 | 30.0 |
| B | 100 | 100 | 81 | **100** | 100 | 30.0 |
| C | 70 | 70 | 100 | 100 | 70 | 21.0 |
| D | 100 | 100 | 100 | 100 | 100 | 10.0 |
| **종합** | — | — | — | — | — | **91.0** |

S85 88.3 → S90 91.0 (+2.7) — Track B TDD 보강 + Track A systemic fix 의 가중. **하지만 품질 ≠ 가치 진척**.

**보수화 (-0.5) + Track C 정체 추가 가중 (-3) → 종합 87.5점**.

⚠️ **Track C 가치 정체 페널티 추가 -5 → 최종 82/100 (B+)**.

S85 87 → S90 82 (-5) — **계획된 P0 가치(M4 Phase 2) 0% 진행 + 1 NEW systemic latent 발견 + wave-tracker stale** 3중 페널티.

---

## 4. 6차원 평가 등급

| 차원 | S85 | S90 | 변화 | 코멘트 |
|------|-----|-----|------|--------|
| **D1 Wave 산출** | A | **B+** | -1 | wave-tracker 4 세션 stale (R-W2/R-W7 미해소). next-dev-prompt 정착이 자기 보고 SOT 의 갱신을 압도. |
| **D2 Phase 실행** | A- | **B** | -1 | M4 Phase 2 6 세션 정체. 반응적 fix 100% 대역 점유. 단, 품질 깊이는 ↑(R-W1 해소, systemic fix 1건 추가). |
| **D3 코드 정합성** | B+ | **A-** | +1 | R-W1 완전 해소 + R-W4 코드 정착. wave-tracker stale (R-W2 미해소) 만 -1. |
| **D4 ADR 정합성** | A | A | 0 | ADR drift 0 그대로. |
| **D5 거버넌스** | A- | A- | 0 | PR 게이트 룰 #4 BYPASSRLS=t 확장 + memory `feedback_grant_check_for_bypassrls_roles` 신설 + secret-scan hook 정착 → 거버넌스 ↑. 단, R-W7 git tag 미부여 / wave-tracker 갱신 정책-실행 갭. |
| **D6 7원칙 게이트** | A | A | 0 | 변화 없음. S88 systemic fix 가 PR 게이트 룰 #4 의 정확한 진화. |

**가중 평균**: (3.3 + 3.0 + 3.7 + 4.0 + 3.7 + 4.0) / 6 = 3.62 → **B+** (보수화 -0.5 = **82/100**).

---

## 5. 갭/위험 매트릭스 (S90 시점)

### 5.1 미해소 잔여 (S85 기원)

| ID | 갭 | 심각도 | 영향 | 대응 (소요) |
|----|---|--------|------|------|
| R-W2 | wave-tracker "11 모델" 주장 vs 실측 9+6 enum | Low | 신규 합류자 오정보 | wave-tracker §4.1 row 정정 (5분, P3) |
| ~~R-W3~~ | ~~prod DATABASE_URL TimeZone=UTC 적용 검증~~ | ✅ | S91 운영 .env grep 검증 PASS | — |
| R-W5 | M3 SSE browser e2e 라이브 | Low | M4 Phase 2 진입 시 자연 흡수 | M4 Phase 2 (P0) |
| R-W6 | Messenger ops 카운트 정확도 | Low | 진척도 산출 부정확 | api-surface.md cross-check (5분, P3) |
| R-W7 | S81 첫 라이브 git 태그 | Low | 회고 시점 추정 어려움 | `git tag` 소급 부여 (5분, P3) |

### 5.2 신규 갭 (S85→S90)

| ID | 갭 | 심각도 | 영향 | 대응 |
|----|---|--------|------|------|
| **G-NEW-1** | 다른 ops 콘솔 (Webhooks/SQL Editor/Cron 등) 라이브 검증 미실행 | **Medium** | systemic fix 가 막지만 라이브 검증 미완 — 드러나지 않은 다른 broken 시그널 가능성 | S88-OPS-LIVE 운영자 5~7 메뉴 클릭 + PM2 stderr 모니터 (~30분, P1) |
| G-NEW-2 | silent catch 잔여 1건 (sticky-note-card.tsx:107 paired capability fallback) | **Low** | logical 동등 sibling — 스타일 정합 cosmetic | 주석 정합 (5분, P3) |
| **G-NEW-3** | **M4 Phase 2 6 세션 정체 (구조적 패턴)** | **High** | **사용자 가치 차단일 누적, M4~M6 ~14 작업일 본진 미진입** | **다음 세션 즉시 단독 chunk 진입 (5~7 작업일)** |
| **G-NEW-4** | wave-tracker 4 세션 stale | Medium | 자기 보고 SOT 신뢰도 ↓ | wave-tracker.md row 추가 (S85~S90 4 row) + R-W2/R-W6 정정 (~15분, P2) |
| ~~G-NEW-5~~ | ~~unpushed commits~~ | ✅ S91 해소 | **다른 터미널 commit `899090b` `e33a318..2120769` fast-forward + GCM credential reject 우회 패턴 정착** (CK `2026-05-08-gcm-multi-account-credential-rejected-trap.md`) | — |
| G-NEW-6 | 반응적 긴급 fix 자연 우선순위 함정 (구조적) | **High** | 큰 가치 chunk 가 작은 sweep 에 계속 우선 양보됨 | 다음 세션 = 무조건 M4 Phase 2 단독 chunk 진입 (CLAUDE.md 룰 또는 next-dev-prompt 단언) |

---

## 6. 우선순위 결정 (Track 비교)

| 차원 | Track A | Track B | Track C | Track D |
|------|---------|---------|---------|---------|
| 잔여 가치 | timezone 검증 + ops 콘솔 라이브 (운영 품질) | 운영 (sources 14 확장) | **M4 Phase 2~6 + M5 + M6** (사용자 가치 본진) | 안정화 |
| **누적 차단일** | 0 | 0 | **6+ 세션 정체** | 0 |
| 의존성 | 운영자 의사결정 | 24h 관찰 후 | backend 모두 GO | — |
| 코드량 | <50 LOC | <30 LOC | **~5,000 LOC** | 0 |
| 1인 운영자 부담 | 낮음 | 낮음 | **중간 (chunk 분할 필수)** | 낮음 |
| **결정** | sweep (P1) | sweep (P2) | **P0 단독 chunk** | maintenance |

**결론**: **S91 = M4 Phase 2 단독 chunk 진입** 외 다른 선택지 없음. 작은 sweep 모두 sweep 세션으로 분리. 6 세션 정체 패턴 재발 방지 = next-dev-prompt 에 "M4 Phase 2 진입 전 다른 sweep 진입 금지" 단언 룰 도입.

---

## 7. 다음 액션 (commit 시퀀스)

### 7.1 S91 — M4 Phase 2 단독 chunk 진입 (P0, 5-7 작업일 분할)

**전제**: S85 wave eval 의 commit 시퀀스 (DEPLOY/A1/F2-1~5/INFRA-1/M5-1~2/M6-1~4) 그대로 유효 + DEPLOY 는 R-W3/R-W4/silent catch fix 에 흡수.

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| **S91** | **PRE** | (≤30분) `git status` + `git pull` + 운영 .env TimeZone=UTC 직접 확인 (R-W3 final) + 4 unpushed commit prod 배포 (`wsl-build-deploy.sh` 1회) | 1 |
| **S91** | **F2-1** | feat(messenger): M4 Phase 2 — composer textarea autosize + Enter 송신 + clientGeneratedId UUIDv7 (TDD ~10) | 2 |
| **S91** | **F2-2** | feat(messenger): M4 Phase 2 — 낙관적 업데이트 (POST /messages → 즉시 반영, 실패 시 rollback) (TDD ~12) | 3 |
| **S92** | **F2-3** | feat(messenger): M4 — 답장 인용 카드 + 멘션 popover cmdk (TDD ~15) | 4 |
| **S92** | **F2-4** | feat(messenger): M4 — use-sse hook 운영 wiring (conv/user 채널 구독 + SWR 캐시 invalidate) (TDD ~10) | 5 |
| **S93** | **F2-5** | feat(messenger): M4 — DIRECT peer name lookup + User profile cache (TDD ~8) | 6 |
| **S93** | **INFRA-1** | chore: SWR + jsdom + @testing-library/react 도입 + vitest config 분기 (TDD ~30 컴포넌트 렌더) | 7 |

### 7.2 S94~S96 — M5 + M6 (P1)

| 세션 | commit | 내용 | 누적 |
|------|--------|------|------|
| S94 | M5-1 | feat(messenger): M5 — AttachmentPicker (filebox 통합) + 답장 wiring (TDD ~15) | 8 |
| S94 | M5-2 | feat(messenger): M5 — 멘션 popover 운영 + 검색 페이지 (PG GIN trgm index) (TDD ~12) | 9 |
| S95 | M6-1 | feat(messenger): M6 — in-app 알림 종 + NotificationPreference 페이지 (TDD ~10) | 10 |
| S95 | M6-2 | feat(messenger): M6 — BlockUserDialog + ReportMessageDialog (TDD ~8) | 11 |
| S96 | M6-3 | feat(messenger): M6 — admin/messenger/{moderation, health, quota} 패널 (TDD ~15) | 12 |
| S96 | M6-4 | security: kdysharpedge 보안 리뷰 + sweep PR | 13 |

### 7.3 Sweep (병렬 가능, 어느 세션 짬에 처리)

| commit | 내용 | 갭 |
|--------|------|-----|
| **DOC-WAVE** | docs(wave-tracker): S85~S90 4 row 추가 + R-W2 "11 모델" 정정 + R-W6 ops 카운트 정정 | G-NEW-4, R-W2, R-W6 |
| **TAG-1** | git tag s81-first-cards-live ffdd2dd + s84-m4-phase1-live `f3bf611` 등 마일스톤 소급 | R-W7 |
| **STYLE-1** | style: sticky-note-card.tsx:107 paired capability fallback 주석 정합 | G-NEW-2 |
| **OPS-LIVE** | (운영자) Webhooks/SQL Editor/Cron 콘솔 5~7 메뉴 라이브 클릭 + PM2 stderr 모니터 | G-NEW-1 |

---

## 8. 권장 거버넌스 조치 (G-NEW-3, G-NEW-6 재발 방지)

| 갭 유형 | 권장 조치 |
|---------|----------|
| **G-NEW-3 / G-NEW-6 재발 방지** | next-dev-prompt 최상단에 "**M4 Phase 2 진입 전 다른 sweep / 긴급 fix 진입 시 반드시 사용자 승인 명시**" 단언. 또는 CLAUDE.md "세션 운영" 섹션에 "5+ 세션 정체 P0 chunk 가 있을 경우 다음 세션은 자동으로 그 chunk 진입" 룰 추가 |
| **R-W2 / G-NEW-4 wave-tracker stale** | wave-tracker 갱신 정책 강화 — `/cs` 스킬 5단계 (next-dev-prompt 갱신) 직후 6단계로 "wave-tracker.md row 추가 (Track 별 변화 1행)" 추가. 자동화 옵션: pre-commit hook 으로 docs/handover/ 신규 파일 + wave-tracker.md row 추가 동시 강제 |
| **G-NEW-1 ops 콘솔 라이브 미검증** | 운영자 직접 5~7 메뉴 클릭 + PM2 stderr 모니터 — Sweep 항목으로 분리 (다음 세션 사용자 직접 시간 확보) |
| **R-W3 timezone 검증** | S91-PRE 단계로 흡수 (운영 .env grep + 라이브 재검증) |
| **다음 wave 평가** | `kdywavecompletion --compare session-90` 을 매 5 세션마다 (S95+) 실행 — delta 평가로 정체/회귀 조기 발견 |

---

## 9. 검증 게이트 (각 commit 통과 기준)

| 단계 | 명령 | PASS 기준 |
|------|------|----------|
| Pre-commit | `npx tsc --noEmit && npx vitest run` | 0 errors / S87 baseline 회귀 0 (현재 585 PASS / 91 skipped) |
| 통합 (라이브) | `bash scripts/run-integration-tests.sh tests/messenger/` | 신규 + 회귀 0 fail (non-BYPASSRLS) |
| BYPASSRLS=t 라이브 | `bash scripts/diag-app-admin-grants.sh` (신규 모델 추가 시 GRANT 자동 적용 확인) | 모든 신규 테이블 ALL ✅ |
| Multi-tenant 격리 | 다른 tenant id 조회 시 0 rows or 403 | 검증 PASS |
| Pre-deploy (WSL) | `bash scripts/wsl-build-deploy.sh` | 빌드 + 마이그레이션 + PM2 restart PASS |
| Post-deploy | `pm2 status ypserver` + `curl /api/health` + b8-runnow 1회 | 200 + audit error=0 + cron SUCCESS |

---

## 10. 본 평가의 한계

- **wave-tracker stale 자기 영향**: 본 평가가 코드 + handover 직접 검증으로 우회했지만, wave-tracker 의 "60% C / 100% B 코드" 주장은 4 세션 늦은 정보. 다음 평가자가 wave-tracker 만 신뢰하면 R-W1 해소 / G-NEW-1/2/3 미인지 위험.
- **`git log origin/...` ref 미존재**: unpushed 정확 카운트 미확정 — handover 의 "4 commits ahead" 주장만 신뢰.
- **prod 배포 라이브 검증 미실행**: 본 평가는 코드 commit / 마이그레이션 적용 흔적 + handover 의 "fix 적용" 주장 신뢰. 실제 prod ops 콘솔 5~7 메뉴 라이브 클릭 미실행 (G-NEW-1).
- **G-NEW-3 구조적 패턴 진단 약함**: "반응적 fix 100%" 의 원인 가설 3건 제시했지만 검증 X — 다음 세션 시작 시 사용자와 동의 필요.
- **Track 가중치 30/30/30/10 임의 유지**: Track C 사용자 가치 가중을 더 크게 (예: A=20%, B=20%, C=50%, D=10%) 잡으면 종합 점수 더 보수적 (~75점) 가능.

---

## 11. 후속 권장 (S91+ 진입 시)

1. **즉시 (S91 시작)**:
   - `git status --short && git log --oneline -10` 베이스라인 검증
   - `git pull origin spec/aggregator-fixes` (다른 터미널 commit 가능성)
   - **S91-PRE 1회**: 운영 .env TimeZone=UTC 직접 확인 + unpushed commits 배포 (`wsl-build-deploy.sh`)
2. **S91 (Phase 2 진입)**:
   - F2-1 + F2-2 (composer + 낙관적 업데이트, ~2 commit)
   - kdyswarm 위임 가능 (Phase 2 = 5 commit ≥ 임계 + frontend 단일 영역)
3. **S92~S93 (Phase 2 완성)**: F2-3 ~ F2-5 + INFRA-1
4. **S94~S96 (M5 + M6)**: 6 commit
5. **Sweep 병렬**: DOC-WAVE / TAG-1 / STYLE-1 / OPS-LIVE — 어느 세션 짬에 (P2~P3)
6. **다음 wave 평가**: S95+ 종료 후 `/kdywavecompletion --compare session-90` 으로 delta 검증

**가장 큰 룰 변경 권고**: next-dev-prompt 에 단언 추가 — "**M4 Phase 2 진입 전 다른 작업 진입 금지** (긴급 fix 발견 시 사용자 명시 승인 필수, 자율 실행 메모리 적용 안 함)". 5번째 latent 클래스 발견은 6 세션 정체와 무관한 외부 사고였지만, 그게 끝나면 **반드시** Phase 2 진입.

---

## 12. 갱신 이력

| 일자 | 평가자 | 변경 |
|------|--------|------|
| 2026-05-04 | S85 wave eval | 초기 (S58~S84 27 세션 누적) |
| 2026-05-08 | S91 wave eval (--compare session-85) | 본 보고서 (S85~S90 6 세션 delta + R-W1~R-W7 해소 + G-NEW-1~6 신규 갭) |

---

## 참조

- 단일 진실 소스: [wave-tracker.md](../research/baas-foundation/04-architecture-wave/wave-tracker.md) (4 세션 stale, 갱신 권고)
- 직전 wave 평가: [세션 85](./260504-session85-wave-completion-eval.md)
- master-plan: [MASTER-DEV-PLAN.md](../MASTER-DEV-PLAN.md)
- next-dev-prompt: [next-dev-prompt.md](./next-dev-prompt.md)
- S85→S90 6 세션 핸드오버:
  - [S85 보조 시크릿](./260504-session85-secret-recovery-history-purge.md)
  - [S86 cron+timezone](./260504-session86-cron-runnow-anthropic-timezone-prod.md)
  - [S87 cleanup+TDD](./260505-session87-cron-verify-cleanup-ck-hook-tdd.md)
  - [S88 GRANT systemic](./260505-session88-app-admin-grants-fix.md)
  - [S89 silent catch + PR룰](./260505-session89-s88-followup.md)
  - [S90 silent catch sweep cont](./260505-session90-silent-catch-sweep-cont.md)
- 본 평가 신규 룰: memory `feedback_grant_check_for_bypassrls_roles.md` (S88 정착)

---
[← handover/_index.md](./_index.md)
