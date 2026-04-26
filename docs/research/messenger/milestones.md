# Milestones — Yangpyeong Messenger Phase 1

> **소스**: 세션 63 (2026-04-26) PRD §14 보강
> **사용처**: 주차별 머지 게이트, 진척 측정, 다음 세션 인수인계서 기준

---

## 1. 사전 작업 — M0 (현 세션 + 다음 1~2 세션)

### M0.1 ADR-030 작성 ✓ (세션 63 완료)
- 위치: `docs/research/baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md`
- 상태: ACCEPTED 2026-04-26
- 옵션 비교 4가지 + 결정 (옵션 C — 코어 임베디드 P1 → Plugin P2)
- 부속 결정 7건 (cross-tenant 차단, in-memory bus 유지 등)

### M0.2 docs/research/messenger/ 6개 산출물 ✓ (세션 63 완료)
- `_index.md`, `PRD-v1.md`, `personas-scenarios.md`, `line-kakao-feature-matrix.md`, `wireframes.md`, `data-model.md`, `api-surface.md`, `milestones.md`

### M0.3 kdyspike #1 — PG NOTIFY + SSE 정합성 (다음 세션, 30분)
- **목표**: Phase 2 백본 후보(PG LISTEN/NOTIFY)의 한계 사전 측정
- **검증 항목**:
  1. NOTIFY payload 8KB 한계 — 메시지 메타만(`{convId, messageId, kind}`) 보내고 본문은 fetch하는 패턴 유효성
  2. Cloudflare Tunnel 장기 connection drop 빈도 — 1시간 idle 후 재연결 정책
  3. 다중 채널 동시 LISTEN 시 connection pool 누수 (10/100/200 채널 시나리오)
- **산출물**: `docs/research/spikes/spike-006-pg-notify-sse.md` + 결과 표
- **결과 활용**: Phase 2 진입 시 ADR-031 작성 자료. 결과가 부정적이면 Redis Pub/Sub 검토 ADR 추가.

### M0.4 (선택) Phase 1 시작 전 디자인 리뷰
- `wireframes.md` ASCII 와이어를 Figma 또는 Excalidraw에 옮겨 디자인 시스템 호환 검증
- `kdydesignreview` 스킬 활용 가능 (7차원 평가)
- 게이트가 아닌 권장 단계

### M0 완료 기준
- ADR-030 ACCEPTED ✓
- docs/research/messenger/ 8개 파일 모두 작성 ✓ (이 milestones 포함)
- kdyspike #1 결과 작성 (다음 세션)

---

## 2. Phase 1 — M1~M6 (4-6주)

### M1 (W1) — 데이터 모델
**목표**: prisma 모델 11종 + 마이그 6건 적용 + RLS 정책 활성화

**작업**:
1. `prisma/schema.prisma`에 enum 6종 + 모델 11종 추가 (`data-model.md` 정확 복사)
2. User 모델에 backref 관계 추가 (12개 relation)
3. 마이그 작성 (`milestones.md` §3 참조 — 헤더/RLS/grants 일괄)
4. **Claude 직접 deploy** — 단계별 1개씩 + RLS 검증 쿼리
5. Prisma client regenerate (`npx prisma generate`)
6. RLS 단위 테스트 작성:
   - 다른 tenant 컨텍스트로 conversation SELECT → 0 rows
   - tenant_id 미주입 시 INSERT 실패 (`current_setting` ERROR)

**산출물**:
- `prisma/schema.prisma` 변경
- `prisma/migrations/20260501*` 6건
- `tests/messenger/rls.test.ts`

**머지 게이트**:
- [ ] 6개 마이그 모두 적용, RLS 검증 쿼리 통과
- [ ] RLS 단위 테스트 통과 (vitest)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npx eslint src/lib/messenger` 0 errors (신규 디렉토리)

**소요**: 5 작업일

---

### M2 (W2) — API CRUD + 멱등성 + 권한
**목표**: 19개 API 라우트 작성 + 통합 테스트 80%+

**작업**:
1. `src/lib/messenger/` 도메인 헬퍼 작성:
   - `conversations.ts` (페어 멱등, member 검증)
   - `messages.ts` (clientGeneratedId 멱등, edit/delete window)
   - `blocks.ts` (양방향 차단 검증)
   - `reports.ts` (UNIQUE 중복)
2. `src/lib/schemas/messenger/` Zod 스키마 작성 (request body 검증)
3. API 라우트 19개 작성 (`api-surface.md` §2)
4. 통합 테스트 (vitest + 실제 DB):
   - DM 페어 멱등
   - clientGeneratedId 중복 → 200 동일 응답
   - cross-tenant 침투 시도 → 403
   - 차단된 사용자 송신 → 403
   - 편집 15분 한도 초과 → 409
   - 회수 24h 한도 초과 → 409
   - 그룹 100명 초과 → 422

**산출물**:
- `src/app/api/v1/conversations/**` (5 라우트)
- `src/app/api/v1/conversations/[id]/messages/**` (4 라우트)
- `src/app/api/v1/conversations/[id]/{members,typing,receipts}/**`
- `src/app/api/v1/messages/search/route.ts`
- `src/app/api/v1/{user-blocks,abuse-reports,notification-preferences}/**`
- `src/app/api/v1/admin/messenger/**`
- `tests/messenger/{conversations,messages,blocks,reports}.test.ts`

**머지 게이트**:
- [ ] 모든 API 통합 테스트 통과
- [ ] 커버리지 80%+ on `src/lib/messenger/**` 및 `src/app/api/v1/conversations/**`
- [ ] 멱등성 테스트 (clientGeneratedId 동시성 시뮬레이션)
- [ ] OpenAPI 스펙 자동 생성 (옵션, Phase 2 미루기)
- [ ] tsc/eslint 0 errors
- [ ] audit_logs 이벤트 5종(`message_sent`, `member_added`, `member_removed`, `message_edited`, `message_deleted`) 발화 확인

**소요**: 5-6 작업일

---

### M3 (W3) — SSE 실시간
**목표**: bus 채널 14종 + 권한 검증 subscribe + 200 동시 connection 부하 테스트

**작업**:
1. `src/lib/realtime/bus.ts` fan-out 채널 키 추가 (`conv:`, `user:`, `presence:`)
2. `src/app/api/sse/realtime/channel/[channel]/route.ts` 권한 검증 게이트 추가:
   - `conv:<id>` → ConversationMember 검증
   - `user:<id>:notif` → self 검증
   - `presence:<id>` → TenantMembership 검증
3. fan-out 패턴 적용 (메시지 송신/편집/삭제 후 publish)
4. presence 추적 (Map<tenantId, Map<userId, count>>)
5. SSE 부하 테스트:
   - artillery/k6 스크립트 작성 (`tests/load/messenger-sse.js`)
   - tenant 1개에 200 SSE connection + 분당 1000 메시지
   - 측정: send p95 < 200ms, connection drop < 1%, 메모리 증가 < 100MB

**산출물**:
- `src/lib/realtime/bus.ts` 변경
- `src/app/api/sse/realtime/channel/[channel]/route.ts` 변경
- `src/lib/messenger/presence.ts`
- `tests/load/messenger-sse.js`

**머지 게이트**:
- [ ] 14종 이벤트 publish/subscribe 단위 테스트 통과
- [ ] 권한 검증 거부 테스트 (cross-tenant subscribe → 403)
- [ ] 부하 테스트 200 conn + 1000 msg/min 통과
- [ ] presence 추적 정확성 (PC+모바일 동시 접속 시 user.online 1번만)
- [ ] kdyspike #1 결과 반영 (단일 노드 한계 명시 또는 NOTIFY 전환 검토)

**소요**: 5-6 작업일

---

### M4 (W4) — UI 보드
**목표**: 대화목록 + 채팅창 + composer 기본 UI + 디자인 리뷰 통과

**작업**:
1. `src/components/messenger/` 트리 작성 (`wireframes.md` §1, PRD §9 참조)
2. `src/app/(protected)/messenger/` 라우트 작성:
   - `layout.tsx` (3-column shell, MediaQuery 분기)
   - `page.tsx` (대화목록 + EmptyState)
   - `[conversationId]/page.tsx` (채팅창)
3. `src/components/layout/sidebar.tsx`에 "커뮤니케이션" 그룹 신설
4. SWR + SSE 통합 hook (`useConversation`, `useMessages`)
5. 디자인 리뷰 (`kdydesignreview` 스킬 7차원 평가)
6. axe-core CI 통합 + 0 violation 확인

**산출물**:
- `src/components/messenger/` 전체 (~15 컴포넌트)
- `src/app/(protected)/messenger/` 4 페이지
- `src/components/layout/sidebar.tsx` 수정
- `src/hooks/messenger/` (5 hooks)

**머지 게이트**:
- [ ] 디자인 리뷰 통과 (라인+카카오 절충안 정합성)
- [ ] axe-core 0 violation
- [ ] 키보드 only navigation E2E (Playwright)
- [ ] 데스크톱/태블릿/모바일 3 layout 시각 회귀 테스트
- [ ] LCP < 1500ms (cold), < 500ms (cached)

**소요**: 5-7 작업일

---

### M5 (W5) — 첨부 + 답장 + 멘션 + 검색
**목표**: filebox 통합 + cmdk 멘션 popover + 검색 페이지

**작업**:
1. AttachmentPicker (filebox 업로드 통합, drag&drop)
2. AttachmentPreview (5장 thumbnail strip)
3. ReplyPreview (composer 상단 인용 카드)
4. MentionPopover (cmdk 패턴, TenantMembership 캐시)
5. 메시지 검색 페이지 (`/messenger/search?q=...`)
6. E2E 시나리오 5건 (P2 협업자, `personas-scenarios.md` §3):
   - S2.1 새 동료 검색 (cross-tenant 차단)
   - S2.2 답장 인용 카드
   - S2.3 @멘션 popover
   - S2.4 이미지 5장 drag&drop
   - S2.6 본문 검색

**산출물**:
- `src/components/messenger/composer/{AttachmentPicker,AttachmentPreview,ReplyPreview,MentionPopover}.tsx`
- `src/app/(protected)/messenger/search/page.tsx`
- `tests/e2e/messenger/{p2-collab-1.spec.ts ... p2-collab-5.spec.ts}`

**머지 게이트**:
- [ ] E2E 5건 모두 통과 (Playwright headless + headed)
- [ ] 첨부 5장 동시 업로드 정상 (병렬 + 순차 fallback)
- [ ] cross-tenant 멤버 검색 결과 0 (cross-tenant 누출 0 검증)
- [ ] 검색 LIKE p95 < 800ms (테스트 데이터 10k 메시지)
- [ ] Q1 (Web Push 방식) 결정

**소요**: 5-7 작업일

---

### M6 (W6) — 알림 + 차단/신고 + 운영자 패널
**목표**: SSE in-app 알림 + 신고 큐 + audit 10종 + kdysharpedge 보안 리뷰

**작업**:
1. in-app 알림 (우상단 종 아이콘) — SSE `user:<id>:notif` 구독
2. NotificationPreference 페이지 (mute/dnd/push 토글)
3. 차단 dialog (BlockUserDialog)
4. 신고 dialog (ReportMessageDialog) — 사유 선택 + 사유 입력
5. 운영자 패널 (`/admin/messenger/moderation`):
   - 신고 큐 페이지 + 1클릭 액션 (회수/차단/무시)
6. 운영자 헬스 (`/admin/messenger/health`):
   - tenant별 카드 + SLO 색상
7. 운영자 quota (`/admin/messenger/quota`):
   - tenant별 quota + 변경 폼
8. audit_logs 이벤트 10종 발화 확인 (E2E 또는 수동)
9. **kdysharpedge 보안 리뷰**:
   - DOMPurify XSS 검증
   - 첨부 MIME 화이트리스트 검증
   - RLS cross-tenant 프로빙 자동화
10. P1 운영자 시나리오 6건 통과 (`personas-scenarios.md` §2)

**산출물**:
- `src/components/messenger/dialogs/{BlockUserDialog,ReportMessageDialog}.tsx`
- `src/app/(protected)/messenger/settings/page.tsx`
- `src/app/(protected)/admin/messenger/{moderation,health,quota}/page.tsx`
- `tests/e2e/messenger/{p1-operator-1.spec.ts ... p1-operator-6.spec.ts}`
- 보안 리뷰 보고서 (`docs/research/messenger/security-review-2026-MM.md`)

**머지 게이트**:
- [ ] P1 운영자 시나리오 6건 모두 통과
- [ ] kdysharpedge 보안 리뷰 PASS (또는 모든 H/M 이슈 해결)
- [ ] audit 이벤트 10종 발화 확인
- [ ] Q4 (프로필 사진), Q7 (iOS Safari Web Push), Q8 (회수 첨부 cleanup) 결정
- [ ] Phase 2 진입 트리거 정의 명문화 (`docs/research/messenger/phase2-trigger.md`)

**소요**: 5-7 작업일

---

## 3. 마이그레이션 SQL — 6건 헤더/패턴

### 마이그 #1 — `20260501000000_messenger_phase1_enums`
```sql
-- ============================================================
-- Migration: messenger_phase1_enums
-- ADR: ADR-030 (Messenger Domain), ADR-022 (tenant_id), ADR-029 (RLS)
-- Authored: Claude Code (세션 63 산출, 2026-04-26)
-- Stage: additive (no data change)
-- Rollback: 20260501000000_rollback.sql
-- ============================================================

CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP', 'CHANNEL');
CREATE TYPE "ConversationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'VOICE', 'STICKER', 'SYSTEM');
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'FILE', 'VOICE');
CREATE TYPE "AbuseReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TYPE "AbuseReportTargetKind" AS ENUM ('MESSAGE', 'USER');
```

### 마이그 #2 — `20260501010000_messenger_phase1_conversations`
- conversations 테이블 + members 테이블 생성
- FK: createdById, conversationId, userId, lastReadMessageId
- 인덱스: 4종 (lastMessageAt desc, kind, archivedAt, members UNIQUE)

### 마이그 #3 — `20260501020000_messenger_phase1_messages`
- messages, message_attachments, message_mentions, message_receipts 4 테이블
- FK: conversationId, senderId, replyToId(self), messageId, mentionedUserId, lastReadMessageId
- 인덱스: UNIQUE clientGeneratedId, createdAt desc, mentionedUserId desc

### 마이그 #4 — `20260501030000_messenger_phase1_safety`
- user_blocks, abuse_reports, notification_preferences 3 테이블
- 인덱스: UNIQUE blocker+blocked, UNIQUE reporter+target, PK tenantId+userId

### 마이그 #5 — `20260501040000_messenger_phase1_indexes_partial`
- partial index: messages_active_idx WHERE deleted_at IS NULL
- GIN trigram: messages_search_gin (`pg_trgm` 확장 enable + body trgm_ops)

### 마이그 #6 — `20260501050000_messenger_phase1_grants`
- DO $$ FOREACH 9개 테이블 ENABLE/FORCE ROW LEVEL SECURITY + tenant_isolation policy
- GRANT SELECT/INSERT/UPDATE/DELETE TO app_runtime
- GRANT ALL TO app_migration

---

## 4. Phase 2 트리거 — 명문화

### 4.1 진입 조건 (둘 중 빠른 쪽)
- **DAU per tenant ≥ 30** (default tenant 기준, 2주 연속)
- **컨슈머 메신저 앱 출시 일정 확정**

### 4.2 Phase 2 진입 시 작업 (1주)
1. ADR-031 작성 (Realtime 백본 PG LISTEN/NOTIFY 전환)
   - kdyspike #1 결과 첨부
2. ADR-032 작성 (Messenger Plugin Manifest 스키마)
   - ADR-026 옵션 C 패턴 상속
3. `packages/tenant-messenger/` 신설
4. 코드 이동 매핑 (`PRD-v1.md` §11.4 참조):
   - `src/app/api/v1/conversations/**` → `packages/tenant-messenger/src/routes/`
   - `src/components/messenger/**` → `packages/tenant-messenger/src/components/`
   - prisma 11모델 → `packages/tenant-messenger/src/prisma.fragment.prisma`
5. Prisma fragment merge script 작성 (`scripts/merge-prisma-fragments.ts`)
6. 양평 콘솔은 plugin import wrapper만 유지

**소요**: 5-8 작업일 (Almanac 5작업일 패턴 + 메신저 모델 더 많음)

### 4.3 Phase 2 추가 기능 (2-3주)
- 마이그 #8 (push_subscriptions), #9 (reactions + bookmarks), #10 (NOTIFY 트리거)
- 이모지 반응 전체, 스티커 (filebox 폴더), GIF 검색
- 음성 메모 (WebAudio→ogg/opus)
- 채널 (1:N broadcast)
- QR 친구 추가
- PG LISTEN/NOTIFY 백본 전환

---

## 5. Phase 3 트리거 — 명문화

### 5.1 진입 조건
- **WAU 누적 1000+** (메신저 앱 컨슈머 가입자 기준)
- **통화 비즈니스 케이스 명확** (운영자 결정)

### 5.2 Phase 3 작업 (3-6개월)
- ADR-033+ (WebRTC TURN 호스팅, E2E Signal Protocol, 다중 디바이스 sync, FTS engine)
- WebRTC 통화 (1:1, 그룹)
- E2E 암호화 (libsignal-client)
- 다중 디바이스 sync
- 백업/복원 (tenant 단위 export)
- 챗봇 SDK + 슬래시 명령
- 메시지 FTS (tsvector → Meilisearch)

---

## 6. Open Questions — 결정 시점 매핑

| Q# | 질문 | 결정 시점 | 책임자 |
|---|---|---|---|
| Q1 | Web Push 방식 (VAPID self-host 권장) | M5 시작 전 | 운영자 |
| Q2 | 메시지 검색 엔진 단계 | Phase 2 진입 시 | 운영자 |
| Q3 | 봇 SDK 형태 | Phase 3 직전 | 운영자 |
| Q4 | 프로필 사진 처리 | M4 시작 전 | 운영자 |
| Q5 | 그룹 인원 한도 (100 → 500/1000) | 부하 테스트 후 | 운영자 |
| Q6 | typing indicator 저장 (무저장 권장) | M3 | 운영자 |
| Q7 | iOS Safari Web Push | M6 | 운영자 |
| Q8 | 회수 첨부 cleanup (30일 cron 권장) | M5 | 운영자 |
| Q9 | Phase 2 plugin 분리 시점 | DAU 측정 데이터 기반 | 운영자 |
| Q10 | E2E 채택 시 검색 호환 | Phase 3 직전 | 운영자 |

---

## 7. 진척 측정 지표

### 7.1 코드 산출 KPI
| 메트릭 | M1 | M2 | M3 | M4 | M5 | M6 | 합계 |
|---|---|---|---|---|---|---|---|
| 신규 파일 (개) | 8 | 22 | 5 | 18 | 12 | 10 | ~75 |
| 신규 LOC | 800 | 2500 | 600 | 2000 | 1500 | 1200 | ~8500 |
| 테스트 LOC | 400 | 1500 | 400 | 800 | 1000 | 600 | ~4700 |
| 마이그 (개) | 6 | — | — | — | — | — | 6 |
| API 라우트 (개) | — | 19 | — | — | — | — | 19 |
| UI 컴포넌트 (개) | — | — | — | 15 | 4 | 4 | 23 |

### 7.2 SLO 측정 (M3 이후 측정 시작)
- 송신 p95 ≤ 200ms
- 채팅 진입 LCP ≤ 1500ms (cold) / 500ms (cached)
- 검색 p95 ≤ 800ms
- SSE 동시 connection ≤ tenant당 200
- 첨부 업로드 실패율 ≤ 1%

### 7.3 진척 보고
- 매주 금요일 — `docs/status/current.md`에 1행 추가 (W1, W2, ..., W6)
- 매 마일스톤 종료 — `docs/handover/2026-MM-DD-messenger-mX-handover.md`
- M6 완료 — `docs/handover/next-dev-prompt.md` 갱신 + Phase 2 진입 검토

---

## 8. 결정 근거 한 줄

1. **6주 직진 (M1-M6)** — 4-6주 계획 보수적 + 1인 운영 부담 고려
2. **마이그 단계별 적용** — 6건 분할로 RLS 검증 명확
3. **kdyspike #1 사전** — Phase 1 도중 백본 한계 발견 비용 회피
4. **kdysharpedge M6** — 출시 직전 보안 리뷰 의무화
5. **부하 테스트 M3** — UI 작업(M4) 전 백본 검증 완료
6. **Phase 2 진입 트리거 명문화** — 의사결정 기준 단일화 (DAU 또는 컨슈머 요구)
7. **Q1-Q10 결정 시점 매핑** — 결정 미루기 방지
8. **운영자 시나리오 P1.1-P1.6 M6 게이트** — 출시 후 1인 운영 가능성 검증
9. **E2E playwright 5건 M5 게이트** — 협업자 핵심 시나리오 회귀 방지
10. **audit 10종 발화 의무** — 1인 운영 디버깅 단일 진실 소스
