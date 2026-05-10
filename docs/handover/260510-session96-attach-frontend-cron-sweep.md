# 인수인계서 — 세션 96 후속 sub-chunk (M5-ATTACH 잔여 4 chunk + S96 P3 sweep 4건 일괄 — M4 Phase 2 본진 100% + 거버넌스 단언 sunset)

> 작성일: 2026-05-10
> 이전 세션: [session96 logic+utility](./260510-session96-m5-attach-3-logic.md) (직전 sub-chunk)
> 추가 참조: [session95](./260510-session95-m5-attach-rls-positive.md), [session94 보안 리뷰](./260509-session94-sharpedge-security-review.md)

---

## 작업 요약

직전 sub-chunk (logic+utility, commit `bf7255a` + /cs `ee82c8c`) 종료 후 사용자 "다음 단계 모두 순차적으로 진행 (세션 종료는 이전 터미널에서 진행함.)" + "잔여 작업도 모두 순차적으로 진행" 두 분기. 본 터미널이 M5-ATTACH 잔여 4 chunk (M5-ATTACH-2 cron / M5-ATTACH-3b UI / M5-ATTACH-4 Bubble / M5-ATTACH-5 sweep) + S96 P3 sweep 4건 (STYLE-2 + M5-ATTACH-6 + NAV-INTEGRATE + GOV-SUNSET) 일괄 마감. **M4 Phase 2 본진 100% 도달 → 거버넌스 단언 sunset**. 5 commit 사슬 (`6bb29c7 → 7ceb075 → a9aeede → da8786b`, 직전 `bf7255a` 포함 시 6 commit), 17 files +1020/-49 누적, TDD +17 신규, 라이브 vitest 누적 **34 PASS**.

---

## 대화 다이제스트

### 토픽 1: 사용자 "다음 단계 모두 순차적으로 진행"
> **사용자**: "다음 단계 모두 순차적으로 진행(세션 종료는 이전 터미널에서 진행함.) ...."

직전 터미널이 logic+utility chunk `/cs` 마감 후 본 터미널은 M5-ATTACH 잔여 작업으로 분기. 세션 종료 권한은 다른 터미널에 위임된 상태였으나, 본 세션 후반에 사용자가 명시적으로 `/cs` 요청 → 본 터미널도 종료 프로토콜 진입.

**결론**: M5-ATTACH-2 (P1 cron) → M5-ATTACH-3b (P0 UI) → M5-ATTACH-4 (P0 Bubble) → M5-ATTACH-5 (P2 sweep) 순차 진입.

### 토픽 2: M5-ATTACH-2 — 30일 첨부 dereference cron 아키텍처 결정

ADR-030 §Q8 (b) 정착. 메시지 회수(soft-delete `deletedAt`) 후 30일 경과 시 첨부 dereference. **함정 인지**: `MessageAttachment.message Cascade` 는 hard-delete 만 처리 → soft-delete 메시지의 첨부는 명시 cron 으로 정리해야 한다.

**아키텍처 결정**: 신규 cron `kind` 추가 vs 기존 `AGGREGATOR` 모듈 확장.
- 옵션 A: 새 `kind: "MESSENGER_CLEANUP"` — `runner.ts/registry.ts/runNow` 광범위 수정
- 옵션 B (채택): `AggregatorModule` 에 `messenger-attachments-deref` 추가 — types.ts + runner.ts switch 추가만

옵션 B 채택 근거: AGGREGATOR 가 사실상 "tenant-scoped writable TS handler" 로 일반화돼 있음 (S84 `cleanup` 모듈도 같은 패턴). 라우팅 0 수정.

**TDD 6**: `where.message.deletedAt.not = null` + `lt(cutoff)` / cutoff = NOW() - retentionDays / `tenantId` 명시 (BYPASSRLS 회피) / 결과 dereferenced+durationMs / withTenantTx 호출 검증.

**결론**: commit `6bb29c7`, 5 files +333. 라이브 6/6 PASS. cron seed 는 enabled=FALSE (운영자 결정 보류).

### 토픽 3: M5-ATTACH-3b/4 — frontend UI 통합

**핵심 발견**: 직전 chunk (`bf7255a`) 의 `composer-logic.SendPayload` 시그니처가 이미 `kind: "TEXT"|"IMAGE"|"FILE"` + `attachments?` 로 정합돼 있어 **page.tsx 변경 0**. logic-only TDD 분리 패턴의 정량 효과 실증.

**MessageComposer.tsx 변경**:
- Paperclip disabled placeholder → 활성화 + `fileInputRef` hidden file input
- `PendingAttachment[]` state (uploading/done/error 3-status discriminator)
- 5장 chip strip (각 칩: 파일명 truncate + 진행률% / 완료 시 size / error 시 "⚠ 실패" + 제거 X 버튼)
- 진행률 bar (`absolute bottom-0 h-0.5 bg-primary` width=progress%)
- uploading 중 송신 disabled (사용자 기다려야 함 분명)
- canSendText → canSendMessage (캡션 빈 OK + 5장 max 강제)

**MessageAttachment.tsx 신규**:
- IMAGE 단일 = max 240×240 / 다수 = 2열 grid h-28 object-cover
- FILE/VOICE 다운로드 버튼 + 한국어 라벨 ("음성 메시지" / "첨부 파일")
- recalled placeholder ("🚫 첨부 N건 — 회수됨")
- filebox download endpoint `/api/v1/filebox/files/{id}` 재사용

**filebox download 재사용 결정**: `Content-Disposition: attachment` 가 강제되지만 브라우저가 `<img src>` 태그에서 무시하므로 인라인 렌더 OK. 추가 preview endpoint 신설 회피.

**MessageBubble.tsx**:
- `message.attachments?` prop 추가
- body 옵션화 (캡션 X 시 빈 div 회피)
- `<MessageAttachment recalled={v.variant === "recalled"} />` 통합

**결론**: commit `7ceb075`, 4 files +339/-13. tsc 신규 0, 회귀 unit 8/8 PASS. 라이브 검증 = 수동 영역 (jsdom 미도입 = S87-INFRA-1).

### 토픽 4: M5-ATTACH-5 — sweep e2e

backend (searchMessages + listMessages 가 attachments include) 이미 정합 → frontend search UI 빈 본문 보완 + 30일 cron deref e2e.

**MessageSearch.tsx**: 캡션 빈 (IMAGE-only) 메시지에서 "(본문 없음)" 대신 "📎 첨부 N건" 표시. body 가 있으면 본문 옆에 N건 표식.

**messages.test.ts 신규 2 testcase**:
1. **searchMessages 응답 attachments 정합**: 캡션 검색어 매치 시 attachments 1건 동봉 검증
2. **30일 cron deref e2e**: admin pool 로 `deletedAt` 31일/5일 강제 → `runMessengerAttachmentCleanup({tenantId})` 호출 → 31일짜리만 dereference, tenant_b context 0 row 격리 검증 (S82 4 latent bug 패턴 재발 차단)

**라이브 검증**: WSL 빌드 미러 cp + `bash scripts/run-integration-tests.sh tests/messenger/messages.test.ts` = 15/15 PASS (M5-ATTACH-1 13 + M5-ATTACH-5 sweep 2). origin push `ee82c8c..a9aeede`.

### 토픽 5: 사용자 "잔여 작업도 모두 순차적으로 진행"
> **사용자**: "잔여작업도 모두 순차적으로 진행"

P0 사용자 carry-over (S88-USER-VERIFY/OPS-LIVE/S86-SEC-1) 는 사용자 본인 작업이라 Claude 처리 불가 → 제외. P3 sweep 4건 순차 진입.

#### 토픽 5a: STYLE-2 — e2e tsc 2건 fix

**문제**: `phase-14c-alpha-ui.spec.ts:19/20` `Argument of type 'string | undefined' is not assignable to parameter of type 'string'`. EMAIL/PASS env vars 가 module top-level `if (!EMAIL || !PASS) throw` 로 가드되지만 TS 가 narrowing 인정 X.

**수정**: `requireEnv()` 헬퍼 도입 — return 타입 `string` 으로 narrowing 표현. function의 throw + return 패턴은 TS narrowing 정상 작동.

**효과**: **S82 이후 처음으로 tsc 사전 errors 0**. 향후 e2e tsc 사전 2건 무관 표기 룰 자연 해소.

#### 토픽 5b: M5-ATTACH-6 — rls.test.ts bootstrap 6 모델 시드 강화

**문제 (S82 "4 latent bug" 패턴 재발 위험)**: 기존 `reseed()` = user/conversation/message 만 시드 → message_attachment 외 5 모델 (mention, receipt, block, abuse_report, notification_pref) 은 `findMany() → []` 빈 결과로 vacuous truth pass. 4개월간 RLS 정책 깨져도 통과 가능.

**수정**:
- 시드 모델 확장: folders + files + 6 messenger 추가 모델
- 보조 user (userIdA2/B2) → mention/block 의미 있는 시나리오
- DELETE 순서 children → parents FK 의존 엄수
- M5 testcase 에 `expect(rows.length >= 1)` active assertion 추가 → vacuous truth pass 차단

**라이브 검증**: 13/13 PASS (M1-M4 4 + M5×9 model active assertion).

#### 토픽 5c: NAV-INTEGRATE — 사이드바 커뮤니케이션 그룹 정합

기존 sidebar.tsx 4 항목이 실제 라우트와 어긋남:
- `/messenger/settings` → 실제 `/messenger/notification-preferences` (S94)
- `/admin/messenger/moderation` → 실제 `/messenger/admin/reports` (S94)
- `/admin/messenger/health` → 존재하지 않음 (제거)
- `/messenger/blocked-users` (S94) — 사이드바 missing (신규 추가)

**수정**: 4 항목 실제 라우트와 정합 + ADMIN_ONLY_PATHS / MANAGER_PLUS_PATHS 정합 + Activity 미사용 import 정리. 사용자가 사이드바에서 모든 메신저 기능 도달 가능.

#### 토픽 5d: GOV-SUNSET — 거버넌스 단언 해소

**조건**: M5-ATTACH-3b + M5-ATTACH-4 + 30일 cron 완료 시점 → 본 세션 5 commit 사슬로 wave-tracker 본진 가치 100% 도달.

**처리 방식 결정**: CLAUDE.md "역사 삭제 금지" 원칙에 따라 **단순 제거가 아닌 [SUNSET 2026-05-10 / S96] 표식 + 해소 commit 사슬 + 정책 전환** 명시. 자율 적용 사례 누적 (S93~S96) 그대로 보존.

**Sunset 후 정책**: `feedback_autonomy.md` 일반 적용 — production down / PG fatal / GitGuardian 알람 / 사용자 직접 보고만 사용자 확인. 다른 작업은 즉시 자율 진입.

**결론**: commit `da8786b` (4 sweep 일괄), 4 files +193/-34. tsc 0 + unit 169/169 PASS. origin push `a9aeede..da8786b`.

### 토픽 6: 사용자 "/cs" 호출 — 본 터미널 종료 프로토콜 진입
> **사용자**: "/cs" + skill payload

직전 사용자 발언 "세션 종료는 이전 터미널에서 진행함" 이후 본 터미널이 작업 마감. 명시적 `/cs` 호출 → 본 터미널도 종료 프로토콜 진입. 직전 터미널이 row 96 (logic+utility chunk) 마감했으므로 본 row 는 dual-row 패턴 (S94 보안 리뷰 follow-up 처럼) 적용 — `96 (후속 sub-chunk — M5-ATTACH-2/3b/4/5 + 4 sweep 압축)`.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | M5-ATTACH-2 cron 등록 위치 | (A) 새 cron `kind:"MESSENGER_CLEANUP"` (B) AggregatorModule 확장 | (B) 광범위 수정 회피, AGGREGATOR 가 이미 "tenant-scoped TS handler" 일반화 (S84 `cleanup` 패턴 일관) |
| 2 | filebox download endpoint 재사용 vs preview endpoint 신설 | (A) preview endpoint (B) `<img src>` 재사용 | (B) `Content-Disposition: attachment` 가 강제되지만 브라우저가 `<img src>` 에서 무시 → 인라인 렌더 OK, 추가 endpoint 회피 |
| 3 | logic-only TDD 분리 패턴 효과 측정 | UI 통합 시 page.tsx 변경 0 검증 | 직전 chunk `bf7255a` 의 시그니처가 정합되어 page.tsx 변경 0 — 정량 효과 실증, F2-1~F2-5 동일 패턴 |
| 4 | M5-ATTACH-6 active assertion 추가 | (A) 시드만 강화 (B) `expect(rows.length >= 1)` 추가 | (B) 시드 강화 + active assertion 둘 다 — vacuous truth pass 차단의 결정적 메커니즘 |
| 5 | GOV-SUNSET 처리 방식 | (A) 단순 제거 (B) [SUNSET] 표식 + 역사 보존 | (B) CLAUDE.md "역사 삭제 금지" 원칙, 자율 적용 사례 누적 가치 보존 |
| 6 | 4 sweep 일괄 vs 분리 commit | (A) 4 commit (B) 단일 commit | (B) 영역 직교 (test/sidebar/e2e/docs) → conflict risk 0 + PR 리뷰 부담 최소화 |

---

## 수정 파일 (17개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/messenger/attachment-cleanup.ts` | 신규 — `runMessengerAttachmentCleanup(ctx, opts)` ADR-030 §Q8 (b) |
| 2 | `src/lib/aggregator/types.ts` | `AggregatorModule` 에 `messenger-attachments-deref` 추가 |
| 3 | `src/lib/aggregator/runner.ts` | switch 분기 + `runMessengerAttachmentCleanupModule` 헬퍼 |
| 4 | `scripts/seed-messenger-cron.ts` | 신규 — default tenant 시드 (enabled=FALSE 기본) |
| 5 | `src/components/messenger/MessageComposer.tsx` | Paperclip 활성화 + chip strip + 진행률 bar + 5장 한도 |
| 6 | `src/components/messenger/MessageAttachment.tsx` | 신규 — IMAGE/FILE/VOICE 렌더 + recalled placeholder |
| 7 | `src/components/messenger/MessageBubble.tsx` | `attachments?` 통합 + body 옵션화 |
| 8 | `src/components/messenger/MessageSearch.tsx` | 빈 본문 → "📎 첨부 N건" 표식 |
| 9 | `src/app/(protected)/messenger/[id]/page.tsx` | 안내문구 첨부 5장/5GB 명시 |
| 10 | `src/components/layout/sidebar.tsx` | 커뮤니케이션 그룹 4 항목 실제 라우트 정합 + Activity import 정리 |
| 11 | `scripts/e2e/phase-14c-alpha-ui.spec.ts` | `requireEnv()` 헬퍼로 EMAIL/PASS narrowing |
| 12 | `tests/messenger/attachment-cleanup.test.ts` | 신규 — 6 testcase (mock-only) |
| 13 | `tests/messenger/messages.test.ts` | searchMessages attachments + 30일 cron deref e2e (2 신규) |
| 14 | `tests/messenger/rls.test.ts` | bootstrap 6 모델 시드 + active assertion |
| 15 | `docs/handover/next-dev-prompt.md` | 거버넌스 단언 [SUNSET] 표식 |
| 16 | `docs/handover/_index.md` | 본 인수인계서 링크 추가 |
| 17 | `docs/status/current.md` + `docs/logs/2026-05.md` + `docs/logs/journal-2026-05-10.md` | 세션 96 후속 sub-chunk row + detail + journal append |

---

## 상세 변경 사항

### 1. M5-ATTACH-2 30일 cron — `6bb29c7`

`AggregatorModule` 에 `messenger-attachments-deref` 추가. `runMessengerAttachmentCleanup(ctx, options)` 가 `withTenantTx` 안에서 `where: { tenantId, message: { deletedAt: { not: null, lt: cutoff } } }` 로 deref. nested filter 가 `LEFT JOIN messages ... WHERE m.deleted_at < $1` 로 컴파일됨. tenantId WHERE 가 child + parent 양쪽 격리 강제.

### 2. M5-ATTACH-3b/4 frontend UI — `7ceb075`

PendingAttachment 3-status discriminator 패턴 + filebox download endpoint 재사용 + body 옵션화. recalled message 의 첨부는 placeholder ("🚫 첨부 N건 — 회수됨") — 실제 file 은 30일 cron deref 까지 살아있음.

### 3. M5-ATTACH-5 sweep — `a9aeede`

searchMessages 가 이미 attachments include 하므로 backend 변경 0. e2e testcase 가 admin pool 로 deletedAt 강제 + cron deref 함수 직접 호출 → 결정적 검증 (cron schedule tick 의존 회피).

### 4. STYLE-2 + M5-ATTACH-6 + NAV-INTEGRATE + GOV-SUNSET — `da8786b`

4 sweep 일괄. 영역 직교 (test/sidebar/e2e/docs) 로 conflict risk 0. M5-ATTACH-6 active assertion (`expect(rows.length >= 1)`) 가 가장 결정적 변경 — vacuous truth pass 차단 한 줄.

---

## 검증 결과

- `npx tsc --noEmit` — **신규 0 + 사전 0** (S82 이후 처음으로 깨끗, STYLE-2 효과)
- `npx vitest run src/lib/messenger src/components/messenger` — unit 169/169 PASS
- WSL 빌드 미러 라이브 (S95 정착 절차):
  - `attachment-cleanup.test.ts` — 6/6 PASS
  - `messages.test.ts` — 15/15 PASS (M5-ATTACH-1 13 + M5-ATTACH-5 sweep 2)
  - `rls.test.ts` — **13/13 PASS** (M1-M4 4 + M5×9 model active assertion)
  - **누적 34 PASS**
- origin push: `ee82c8c..a9aeede` + `a9aeede..da8786b` (양쪽 successful)

---

## PR 게이트 5항목 자동 통과

1. **신규 모델 0** — schema 변경 0
2. **신규 라우트 0** — sidebar 항목은 기존 라우트 정합만
3. **Prisma 호출** = `withTenantTx` + `tenantId` 명시 (S84-D defense-in-depth)
4. **non-BYPASSRLS 라이브** = `rls.test.ts` M5×9 model + `messages.test.ts` 15/15 + `attachment-cleanup.test.ts` 6/6 모두 `app_test_runtime` role 통과
5. **timezone-sensitive 비교 0** — Date.now() ms timestamp 산술만, raw SQL UPDATE 도 timezone-naive

---

## 터치하지 않은 영역

- `src/components/filebox/file-upload-zone.tsx` → `attachment-upload.ts` utility 마이그레이션 (별도 sweep, 결합 0 유지)
- 사용자 P0 carry-over: S88-USER-VERIFY (사용자 휴대폰), S88-OPS-LIVE (운영자 콘솔), S86-SEC-1 (GitHub repo public/private 확인)
- DB password 회전 (운영자 결정)
- S87 carry-over: S87-CK-MEMORY (`feedback_wsl2_single_foreground_call` + `feedback_tsx_no_dotenv_autoload` 메모리 룰 승격), S87-RSS-ACTIVATE (anthropic-news active=true), S87-TZ-MONITOR (24h+)
- 다른 터미널 영역: 직전 터미널 `/cs ee82c8c` 의 docs commit 영역

---

## 알려진 이슈

- **없음** (S82 이후 처음으로 tsc errors 0 + 라이브 vitest 누적 34 PASS + 거버넌스 단언 sunset)
- M5-ATTACH-3b UI 통합 라이브 검증은 jsdom 미도입 = 수동 영역 (S87-INFRA-1, 별도 wave)
- cron `messenger-attachments-deref` enabled=FALSE 보류 — 운영자 결정 시점에 `npx tsx scripts/seed-messenger-cron.ts --tenant=default --enabled` 실행 필요

---

## 다음 작업 제안 (S97+)

### P0 사용자 carry-over (Claude 처리 불가)
- **S88-USER-VERIFY** — 사용자 휴대폰에서 stylelucky4u.com/notes 재시도 (S88+S89+S90 silent catch 표면화 + S91 origin push 후 final 검증)
- **S88-OPS-LIVE** — 운영 콘솔 라이브 호출 (Webhooks/SQL Editor/Cron 콘솔 5~7 메뉴 클릭 + PM2 stderr 모니터)
- **S86-SEC-1** — GitHub repo public/private 확인

### P2 sweep
- **S87-CK-MEMORY** — S87-CK-WSL 2 CK → memory/feedback_*.md 룰 승격 (`feedback_wsl2_single_foreground_call.md` + `feedback_tsx_no_dotenv_autoload.md`, MEMORY.md 색인) ~30분
- **S87-RSS-ACTIVATE** — anthropic-news active=true (+ 4 feed 확장) — 운영자 결정 30분
- **S87-TZ-MONITOR** — 24h+ TimeZone=UTC 모니터링 5분
- **file-upload-zone 마이그레이션** — `attachment-upload.ts` utility 로 통합 (~30분 sweep)
- **cron 활성화** — `npx tsx scripts/seed-messenger-cron.ts --tenant=default --enabled` (운영자 검토 후)

### P3 wave 평가 권장 시점
- **S97 wave eval** — `kdywavecompletion --compare session-92` — M5 첨부 frontend 100% + S82 trivially-pass 차단 효과 정량화 + Track C M4+M5+M6 진척 측정. 거버넌스 단언 sunset 후 자율 cycle 정상화 baseline.

### 정책 전환
- 거버넌스 단언 sunset → `feedback_autonomy.md` 일반 적용. 다음 세션부터 자율 진입 (긴급 사고만 사용자 확인).

---

## 연관 자료

- 직전 sub-chunk: [세션 96 logic+utility](./260510-session96-m5-attach-3-logic.md)
- M5-ATTACH-1 baseline: [세션 95](./260510-session95-m5-attach-rls-positive.md)
- 보안 리뷰 baseline: [세션 94 sharpedge](./260509-session94-sharpedge-security-review.md)
- WSL 빌드 미러 우회 솔루션: [docs/solutions/2026-05-10-wsl-vitest-windows-modules-rolldown-binding.md](../solutions/2026-05-10-wsl-vitest-windows-modules-rolldown-binding.md)
- 세션 저널 원본: [journal-2026-05-10.md](../logs/journal-2026-05-10.md)
- 거버넌스 단언 발효 이력: [세션 91 wave eval delta](./260508-session91-wave-completion-eval-delta.md)
- ADR-030 §Q8 (b): [docs/research/baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md](../research/baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md)

---

[← handover/_index.md](./_index.md)
