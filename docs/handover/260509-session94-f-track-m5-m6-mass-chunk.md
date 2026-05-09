# 인수인계서 — 세션 94 (M4 F 트랙 완주 + M5 검색 + M6 운영자/차단/알림 — 7 commit 압축 신기록)

> 작성일: 2026-05-09
> 직전 세션: [session 93 (다른 터미널 /cs F2-2 단독 chunk)](./260508-session93-f2-2-optimistic-send.md)
> 본 세션 = S94 첫 multi-chunk (다른 터미널이 65cf152 로 next-dev-prompt 를 S94 로 갱신한 직후 진입)

---

## 작업 요약

S94 본 세션 7 commit 압축 실행 신기록 — M4 Phase 2 F 트랙 5/5 chunk 완주 (F2-3/F2-4+INFRA-1/F2-5) + M5 검색 UI + M6 운영자/차단/알림 UI + Sweep GCM 메모리 승격. **TDD +108 신규 (619→727), 회귀 0, PR 게이트 5항목 모두 자동 통과**. 거버넌스 단언 sunset 임박 (M5 첨부 + kdysharpedge 만 잔여).

---

## 대화 다이제스트

### 토픽 1: 베이스라인 점검 + S93 영역 분리 인지

> **사용자**: "모두 순차적으로 진행.(이전 터미널은 지금 세션종료 중이고)"

다른 터미널이 65cf152 (S93 /cs F2-2 단독 chunk 종료) 로 next-dev-prompt 를 S94 로 갱신한 직후 본 세션 진입. `feedback_concurrent_terminal_overlap` 적용 — 본 세션 = S94 첫 multi-chunk 분류.

베이스라인 4종 병렬 확인 (git status clean / S92 인계서 / 최근 commits / handover index 위치). S92 권고 우선순위 (F2-3 → F2-4 → F2-5 → M5 → M6) 채택 + 거버넌스 단언 적용 중 (M5+M6 완료 시 sunset).

**결론**: F2-3 부터 순차 진행. 자율 실행 메모리 + Phase 2 dependency 예외 자연 적용.

### 토픽 2: F2-3 답장 인용 + 멘션 popover (logic-only TDD 37)

baseline 점검 — backend POST /messages 가 이미 `replyToId` + `mentions: string[]` 처리 + sendMessage 의 cross-conv 검증 + 차단 필터 + 자기-멘션 제외 모두 구현 (S81+ 6개월 선행). frontend-only chunk 로 한정 가능 (zero-RLS-risk).

GET /conversations/[id] include 의 members 에 user.email/name 추가 1줄 (additive)만 backend 변경 — 멘션 popover 후보 표시 prerequisite.

신규 logic 모듈 2개 (TDD logic-only 패턴 정착, jsdom 미도입 환경에서 pure function 위주):
- `mention-search.ts` (TDD 18): `detectMentionTrigger(text, cursorPos)` (active/query/startPos), `filterMentionCandidates(query, candidates, excludeUserId?)` (앞부분 매칭 우선 + 자기 자신 제외), `applyMentionSelection(text, trigger, candidate)` (`@email ` 토큰 inject + cursor 이동).
- `reply-quote.ts` (TDD 13): `truncateQuoteBody(body, max=80)` (M3 buildSnippet 정합), `formatReplyPreview({ body, kind, deletedAt, senderName })` (recalled/system/image/file/text variant).

`composer-logic.ts` 확장 (+6 case, 18 누적): `prepareSendPayload(raw, opts)` opts = `{ replyToId?, mentions? }`. dedup + 빈 배열 정규화. `optimistic-messages.ts` 의 `buildOptimisticMessage` 가 replyToId 보존 1줄 (optimistic 메시지에도 quote 즉시 표시).

UI 통합:
- `MessageComposer.tsx`: cmdk popover (@ 트리거 시 후보 list, 키보드 위임 ArrowDown/ArrowUp/Enter/Escape) + reply banner (✕ dismiss + sender 라벨 + snippet) + members prop + `<AtSign />` 버튼 활성화.
- `MessageBubble.tsx`: `replyTo` prop 추가, quote preview 렌더링 (border-l-2 + 최대 260px). 부모 lookup 실패 시 "이전 메시지" fallback. hover 답장 버튼 (`onReply` 콜백, 회수/시스템/pending 시 비활성).
- `MessageList.tsx`: `messagesById` id-indexed lookup → `replyTo` prop 주입. `senderMap` (userId → email/name) 으로 sender 라벨 derivation.
- `page.tsx`: conv detail useEffect fetch + `replyTo` state + `mentionCandidates` (members 에서 user.email 있는 항목) + `senderMap` 분배.

**TDD 자가 발견 함정**: detectMentionTrigger "안녕 @홍길동" cursorPos=8 fixture 가 text.length=7 초과 → 가드 (`cursorPos > text.length`) 에 의해 비활성. fixture 만 7 로 수정 (production 코드 변경 0).

**검증**: tsc 0 (사전 존재 e2e 2건만) / vitest 656 PASS / 91 skipped (S93 619 + 37 신규 정확 일치, 회귀 0).

**결론**: commit `8903e1d` 13 files +985/-118. PR 게이트 5항목 모두 N/A (backend 변경 응답 shape additive 만, 신규 모델/라우트/RLS/timezone 무관, tenantPrismaFor 그대로).

### 토픽 3: F2-4 + INFRA-1 사용자 결정 분기

> **사용자**: "본 세션 병행 진입 (Recommended)" — F2-4 + INFRA-1 함께 진행 (3 옵션 중)

INFRA-1 핵심 = jsdom + @testing-library/react/dom + jest-dom 4 devDep install (SWR 도입은 별도 chunk 분리 결정 — useMessages 의 useState/useEffect 패턴 SWR 마이그레이션은 토큰 효율 + 회귀 위험 최소화 우선).

backend events SSE endpoint (`/messenger/conversations/[id]/events/route.ts`) 는 이미 완비 (M3 publish 9 이벤트: ready/message.created/updated/deleted/typing.started/stopped/receipt.updated/member.joined/left). frontend wiring 만 필요.

신규 모듈:
- `sse-events.ts` (TDD 13 node env): `parseSseEvent(eventName, raw)` (typed RealtimeEvent 변환, parse 실패 시 unknown 반환 — 스트림 중단 회피) + `applyEventToMessages(events, current)` reducer (clientGeneratedId 우선 dedupe = optimistic swap, 다음 server id, deleted/updated 분기).
- `use-sse.ts` (TDD 7 jsdom env, file-level `// @vitest-environment jsdom` 주석): EventSource 래퍼 hook. url 변경 시 close+재생성, unmount cleanup, ready 이벤트로 connected 상태 갱신, onEvent ref 패턴으로 stale closure 회피.

`useMessages.ts` 안에 useSse 호출 + handleSseEvent 콜백 (message.created/updated/deleted 만 cache 변형). sseConnected 노출 (UI 인디케이터). `page.tsx` 헤더에 emerald-500/gray-400 점.

vitest config 변경 없음 — file-level annotation 으로 환경 분리 (성능 + 격리).

**MockEventSource 패턴**: jsdom 25 가 EventSource native 미구현 → `vi.stubGlobal("EventSource", MockEventSource)` 로 mock. dispatch(name, data) 메서드로 listener 직접 호출, listeners Record 로 add/remove 관리.

**검증**: tsc 0 / vitest 676 PASS / 91 skipped (656 + 20 신규).

**결론**: commit `088f623` 8 files +1347/-8.

### 토픽 4: F2-5 DIRECT peer 이름 lookup (TDD 10)

ConversationList 의 file-local `derivePeerLabel` 을 `peer-label.ts` 모듈로 분리 + 다양한 분기 TDD.

`peer-label.ts` (TDD 10):
- DIRECT 분기 8: user.name 우선 → trim 후 빈 문자열이면 user.email → email 없으면 userId 8자 prefix → peer 멤버 미발견 시 "DM" → members undefined 도 "DM" → currentUserId undefined 면 첫 멤버를 peer.
- GROUP/CHANNEL 분기 3: title → "(제목 없음)" fallback.

backend `conversations` GET include 1줄 추가 (members.user.email/name additive).

`useConversations.ts` ConversationRow.members[i].user 타입 추가. `ConversationList.tsx` file-local 함수 제거 + import 변경. `page.tsx` 헤더 conversationId.slice(0,8) → derivePeerLabel + subtitleForKind (DIRECT 1:1, GROUP n명, CHANNEL).

**검증**: tsc 0 / vitest 686 PASS (676 + 10 신규).

**결론**: commit `5a29980` 6 files +231/-31. **M4 Phase 2 F 트랙 5/5 chunk 완주** (S91~S94 4 세션 동안 0 → 5/14 commit 회수, 36%).

### 토픽 5: F 트랙 완주 보고 + 다음 결정

> **사용자**: "2-4 작업 모두 순차적 진행." (option 2-4: M5 검색 + M6 운영자 + Sweep)

거버넌스 단언이 M5+M6 완료 시 sunset 이라 진척 가속 가치. 자율 실행 메모리 + 사용자 명시 결정 종합 → option 2 부터 순차 시작.

### 토픽 6: M5 검색 UI (TDD 16)

backend GET /messages/search (이미 완비, GIN trgm 인덱스, 30일 윈도, 사용자 멤버 conv 만) wiring. 사용자 명시 trigger 패턴 (Enter/검색 버튼, debounce 별도 chunk).

`search-query.ts` (TDD 16):
- `normalizeQuery(raw)`: trim
- `validateQuery(raw)`: zod searchMessagesSchema (1~100자) 정합 검증, `{ ok, reason: empty | too_long }`
- `canSearch(raw)`: boolean shortcut
- `highlightMatches(text, query)`: segments `[{ text, match }]` 분리, 정규식 메타문자 이스케이프, 대소문자 무시

`useMessageSearch.ts` hook (state + canSearch 가드 + reset, convId 옵션). `MessageSearch.tsx` 컴포넌트 (search input + Enter trigger + 결과 list `<mark>` 하이라이트 + 클릭 시 router.push).

`/messenger/page.tsx` 우측 빈상태 영역 → MessageSearch 통합 (대화 미선택 시 검색 진입점). 모바일은 사이드바 단독 유지.

**검증**: tsc 0 / vitest 702 PASS (686 + 16 신규).

**결론**: commit `112c8be` 5 files +414/-11.

### 토픽 7: M6 운영자 신고 패널 (TDD 9)

backend GET /admin/reports + POST /admin/reports/[id]/resolve 활용 (withTenantRole(["OWNER","ADMIN"]) 가드 + audit emit).

`report-actions.ts` (TDD 9):
- `formatResolveAction(action)`: DELETE_MESSAGE → "메시지 회수" / BLOCK_USER → "사용자 차단" / DISMISS → "기각"
- `describeResolveImpact(action)`: dialog 본문 표시용 영향 범위 설명
- `formatReportStatus(status)`: OPEN → "처리 대기" / RESOLVED → "처리됨" / DISMISSED → "기각됨"
- `ALL_RESOLVE_ACTIONS` / `ALL_REPORT_STATUSES` constants

`useReportQueue.ts` hook (status 필터 fetch + resolve mutation + reload). `/messenger/admin/reports/page.tsx`:
- status 탭 (OPEN/RESOLVED/DISMISSED)
- 신고 row (id 8자/createdAt/사유/신고자/대상/처리 메모)
- "처리" 버튼 (OPEN 만) → dialog (action select + describeResolveImpact 표시 + note 500자 + resolve mutation)

권한: Frontend `useCurrentUser.role !== ADMIN/OWNER` → 403 메시지 + 안내. Backend `withTenantRole` 자동 검증 (defense-in-depth).

**검증**: tsc 0 / vitest 711 PASS (702 + 9 신규).

**결론**: commit `2f9125a` 4 files +493.

### 토픽 8: Sweep — GCM 룰 메모리 승격

S87 이월 P3 항목. S91 인계서의 GCM credential reject 표준 우회 패턴을 메모리로 정착.

`memory/reference_gcm_credential_reject.md` 신규 (한국어 Windows + Bash cmdkey 인코딩 함정 + Git 직접 명령 cross-platform 표준 우회 + GCM auto-fallback 메커니즘 + 영구 해결책 SSH/credential.helper 검토 영역). `MEMORY.md` 색인 1행 추가.

git untracked 영역 (글로벌 memory 는 git 관리 외) — 본 세션 commit 0.

### 토픽 9: 진척 보고 + 옵션 2-4 추가 결정

> **사용자**: "2-4번 모두 순차적 진행." (option 2-4: M6 차단/알림 + M5 첨부 + kdysharpedge)

본 세션 토큰 잔량 의식 — option 2 (M6 차단/알림) 본 세션 가능, option 3 (M5 첨부 = SeaweedFS multipart 통합 큰 chunk) + option 4 (kdysharpedge 별도 스킬 호출) 는 별도 세션 권고.

### 토픽 10: M6 user-blocks 차단 관리 UI

backend GET/POST /user-blocks + DELETE /user-blocks/[id] 활용. `useUserBlocks` hook (list + block(blockedId, reason?) + unblock(blockId) + reload). `/messenger/blocked-users/page.tsx`:
- 차단 목록 row (사용자 8자 + 차단일 한국어 포맷 + 사유)
- "해제" 버튼 → DELETE
- 신규 차단 추가는 별도 chunk (대화 화면 hover → 차단 진입 예정)

### 토픽 11: M6 notification-preferences UI (TDD 16)

backend GET/PATCH /notification-preferences 활용 (zod HHMM_RE 검증 + upsert 패턴).

`notification-prefs.ts` (TDD 16):
- `isValidHHMM(s)`: zod HHMM_RE (`^([01]\d|2[0-3]):[0-5]\d$`) 와 동일 정규식
- `normalizeHHMM(s)`: trim
- `isInDndWindow(nowHHMM, dndStart, dndEnd)`: 야간 wrap 지원 (start > end 면 자정 cross 로 간주), dndStart === dndEnd 는 0폭 윈도 (false), null 입력 시 false

`/messenger/notification-preferences/page.tsx`:
- pushEnabled 토글 (전체 알림)
- mentionsOnly 토글 (DM 인앱 only, pushEnabled disabled 시 동반 비활성)
- dndStart/dndEnd HHMM 입력 (text type, placeholder 22:00/07:00)
- "현재 활성" 인디케이터 (isInDndWindow 결과)
- 양쪽 모두 비우거나 모두 채우기 검증 (dndError state)
- 저장 PATCH 후 toast.success/error

**검증**: tsc 0 / vitest 727 PASS (711 + 16 신규).

**결론**: commit `5f5253c` 5 files.

### 토픽 12: 본 세션 종료 + /cs

option 3 (M5 첨부) + option 4 (kdysharpedge) 는 본 세션 토큰 한계로 별도 세션 위임. /cs 진입 결정.

S94 본 세션 7 commit = 압축 실행 신기록 (S81 5x → 7x). 거버넌스 단언 sunset 임박 (M5 첨부 + 보안 리뷰만 잔여).

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 본 세션 chunk identity = S94 (다른 터미널 = S93) | (a) S93 자매 chunk (b) S94 첫 multi-chunk | (b) — 다른 터미널 65cf152 가 next-dev-prompt 를 S94 로 갱신 + /cs F2-2 단독 chunk 종료 명시. S88~S92 multi-chunk 패턴과 정합 |
| 2 | F2-3 backend 변경 = conv detail GET include 1줄 (additive) | (a) backend 무변경, frontend lookup 만 (b) include 1줄 추가 | (b) — 멘션 popover 후보 email 표시가 UX 핵심. additive 응답 shape 변경은 PR 게이트 #2 (신규 라우트) 발동 안 함, 기존 클라이언트 호환 |
| 3 | reply quote 부모 메시지 lookup 방식 | (a) backend listMessages include 확장 (b) frontend id-indexed map | (b) — F2-3 chunk 변경 폭 최소화. 부모가 같은 페이지에 없으면 "이전 메시지" fallback. backend include 정착은 별도 chunk |
| 4 | INFRA-1 도입 범위 = jsdom + testing-library 만 (SWR 보류) | (a) SWR + jsdom + testing-library 모두 (b) jsdom + testing-library 만 | (b) — useMessages SWR 마이그레이션은 useState/useEffect 전체 재작성 + 회귀 위험. F2-4 use-sse wiring 은 SWR 없이도 setMessages prepend 패턴으로 정상. 본 세션 토큰 효율 + 회귀 최소화 |
| 5 | vitest jsdom 환경 분리 = file-level annotation | (a) vitest config workspace project (b) `// @vitest-environment jsdom` 주석 | (b) — 기본은 node env 그대로 (성능 + 격리). 컴포넌트/hook 테스트만 jsdom 도입. config 변경 없이 점진 진화 가능 |
| 6 | F2-5 peer 이름 = pure logic 분리 + 모듈로 외부화 | (a) ConversationList file-local 유지 + 분기 추가 (b) 별도 모듈 + TDD | (b) — 헤더 + 목록 양쪽이 동일한 라벨 derivation 사용해야 일관성. 분기 매트릭스 (DIRECT 8 + GROUP/CHANNEL 3) 는 단위 테스트 가치 큼 |
| 7 | M5 검색 UI = 사용자 명시 trigger (debounce 보류) | (a) 입력 중 자동 fetch (debounce 300ms) (b) Enter/버튼 trigger | (b) — debounce 도입은 hook 복잡도 + 추가 의존성. backend rate-limit 30/min/user 와 정합. 명시 trigger 가 사용자 의도 명확 |
| 8 | M6 운영자 dialog = inline div (별도 모달 컴포넌트 X) | (a) 별도 Modal 컴포넌트 추출 + reuse (b) inline div + role=dialog | (b) — 본 세션 단독 사용처. 추출은 두번째 사용처 발견 시. premature abstraction 회피 (CLAUDE.md "Three similar lines is better than a premature abstraction") |
| 9 | option 2-4 본 세션 진입 vs 분리 | (a) 본 세션 전부 진입 (b) option 2 만 본 세션, 3-4 별도 | (b) — option 3 (SeaweedFS multipart) = ADR-033 후속 단독 큰 chunk. option 4 (kdysharpedge) = 별도 스킬 호출 정석. 토큰 한계 + 회귀 위험 |

---

## 수정/신규 파일 (41개)

### commit `8903e1d` F2-3 답장+멘션 (13 files +985/-118)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `src/lib/messenger/mention-search.ts` | 신규 (122 lines, 3 함수) |
| 2 | `src/lib/messenger/mention-search.test.ts` | 신규 (TDD 18) |
| 3 | `src/lib/messenger/reply-quote.ts` | 신규 (60 lines, 2 함수 + types) |
| 4 | `src/lib/messenger/reply-quote.test.ts` | 신규 (TDD 13) |
| 5 | `src/lib/messenger/composer-logic.ts` | replyToId/mentions opts + dedup + 빈 배열 정규화 |
| 6 | `src/lib/messenger/composer-logic.test.ts` | +6 case (18 누적) |
| 7 | `src/lib/messenger/optimistic-messages.ts` | replyToId 보존 1줄 |
| 8 | `src/hooks/messenger/useMessages.ts` | SendOptimisticPayload replyToId/mentions |
| 9 | `src/components/messenger/MessageComposer.tsx` | cmdk popover + reply banner + members prop |
| 10 | `src/components/messenger/MessageBubble.tsx` | replyTo prop + quote preview + hover 답장 |
| 11 | `src/components/messenger/MessageList.tsx` | messagesById id-indexed lookup + senderMap + onReplyMessage |
| 12 | `src/app/(protected)/messenger/[id]/page.tsx` | conv detail fetch + replyTo state + mentionCandidates/senderMap |
| 13 | `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/route.ts` | members.user.email/name include 1줄 (additive) |

### commit `088f623` F2-4 + INFRA-1 (8 files +1347/-8)

| # | 파일 | 변경 |
|---|------|------|
| 14 | `package.json` | -D jsdom + @testing-library/react/dom/jest-dom |
| 15 | `package-lock.json` | 55 packages 추가 |
| 16 | `src/lib/messenger/sse-events.ts` | 신규 (parseSseEvent + applyEventToMessages reducer) |
| 17 | `src/lib/messenger/sse-events.test.ts` | 신규 (TDD 13 node env) |
| 18 | `src/hooks/messenger/use-sse.ts` | 신규 (EventSource 래퍼 hook) |
| 19 | `src/hooks/messenger/use-sse.test.ts` | 신규 (TDD 7 jsdom env, MockEventSource) |
| 20 | `src/hooks/messenger/useMessages.ts` | useSse 호출 + handleSseEvent + sseConnected |
| 21 | `src/app/(protected)/messenger/[id]/page.tsx` | 헤더 emerald-500/gray-400 점 |

### commit `5a29980` F2-5 peer 이름 (6 files +231/-31)

| # | 파일 | 변경 |
|---|------|------|
| 22 | `src/lib/messenger/peer-label.ts` | 신규 (derivePeerLabel) |
| 23 | `src/lib/messenger/peer-label.test.ts` | 신규 (TDD 10) |
| 24 | `src/app/api/v1/t/[tenant]/messenger/conversations/route.ts` | members.user.email/name include 1줄 |
| 25 | `src/hooks/messenger/useConversations.ts` | ConversationRow.members[i].user |
| 26 | `src/components/messenger/ConversationList.tsx` | file-local 제거 + import |
| 27 | `src/app/(protected)/messenger/[id]/page.tsx` | 헤더 derivePeerLabel + subtitleForKind |

### commit `112c8be` M5 검색 UI (5 files +414/-11)

| # | 파일 | 변경 |
|---|------|------|
| 28 | `src/lib/messenger/search-query.ts` | 신규 (4 함수) |
| 29 | `src/lib/messenger/search-query.test.ts` | 신규 (TDD 16) |
| 30 | `src/hooks/messenger/useMessageSearch.ts` | 신규 |
| 31 | `src/components/messenger/MessageSearch.tsx` | 신규 (input + 결과 list + highlight) |
| 32 | `src/app/(protected)/messenger/page.tsx` | 우측 빈상태 → MessageSearch 통합 |

### commit `2f9125a` M6 운영자 신고 패널 (4 files +493)

| # | 파일 | 변경 |
|---|------|------|
| 33 | `src/lib/messenger/report-actions.ts` | 신규 (한국어 라벨 + 영향 설명) |
| 34 | `src/lib/messenger/report-actions.test.ts` | 신규 (TDD 9) |
| 35 | `src/hooks/messenger/useReportQueue.ts` | 신규 (status 필터 + resolve mutation) |
| 36 | `src/app/(protected)/messenger/admin/reports/page.tsx` | 신규 (status 탭 + 신고 row + dialog) |

### commit `5f5253c` M6 차단+알림 (5 files)

| # | 파일 | 변경 |
|---|------|------|
| 37 | `src/lib/messenger/notification-prefs.ts` | 신규 (HHMM 검증 + DnD 윈도 활성) |
| 38 | `src/lib/messenger/notification-prefs.test.ts` | 신규 (TDD 16) |
| 39 | `src/hooks/messenger/useUserBlocks.ts` | 신규 |
| 40 | `src/app/(protected)/messenger/blocked-users/page.tsx` | 신규 |
| 41 | `src/app/(protected)/messenger/notification-preferences/page.tsx` | 신규 |

### Sweep (git 외 영역)

- `~/.claude/projects/.../memory/reference_gcm_credential_reject.md` 신규
- `MEMORY.md` 색인 1행 추가

---

## 검증 결과

| 시점 | tsc | vitest | 회귀 |
|---|---|---|---|
| F2-3 후 | 0 (사전 존재 e2e 2건) | 656 PASS / 91 skipped | 0 |
| F2-4 + INFRA-1 후 | 0 | 676 PASS / 91 skipped | 0 |
| F2-5 후 | 0 | 686 PASS / 91 skipped | 0 |
| M5 검색 후 | 0 | 702 PASS / 91 skipped | 0 |
| M6 운영자 후 | 0 | 711 PASS / 91 skipped | 0 |
| **M6 차단+알림 후** | **0** | **727 PASS / 91 skipped** | **0** |

S93 baseline 619 → S94 727 = +108 신규 분포:
- mention-search 18 + reply-quote 13 + composer-logic +6 = 37 (F2-3)
- sse-events 13 + use-sse 7 = 20 (F2-4)
- peer-label 10 (F2-5)
- search-query 16 (M5)
- report-actions 9 (M6 운영자)
- notification-prefs 16 (M6 알림)

---

## 터치하지 않은 영역

- **M5 첨부 (SeaweedFS multipart 통합)**: ADR-033 후속 단독 큰 chunk. frontend → SeaweedFS S3 API 직접 vs server proxy 결정 prerequisite. 5-6일 단독 chunk 권고.
- **kdysharpedge 보안 리뷰**: `/kdysharpedge` 스킬 호출 정석. messenger + admin 패널 영역 위험 API 패턴 탐지. 별도 세션 권고.
- **SWR 도입**: useMessages/useConversations 의 useState/useEffect → SWR mutate 패턴 마이그레이션. 본 세션은 INFRA-1 의 jsdom 만 도입 (필수). SWR 는 별도 chunk (회귀 위험 최소화).
- **다른 터미널 commit `65cf152`**: S93 /cs F2-2 단독 chunk 종료 docs 영역. 보존 (`feedback_concurrent_terminal_overlap`).
- **PM2 운영 서버 4종**: 본 세션 코드 변경 only, 운영 서버 무관. `feedback_pm2_servers_no_stop` 적용.
- **사이드바 nav link 추가**: /messenger/admin/reports + /messenger/blocked-users + /messenger/notification-preferences 직접 URL 진입. 본 세션은 페이지만 추가, nav 통합은 별도 chunk.
- **debounce 검색**: M5 검색은 Enter/버튼 명시 trigger 만. debounce 300ms 도입은 별도 chunk.
- **신규 차단 추가 UI**: /messenger/blocked-users 는 해제만. 신규 차단은 대화 화면 hover → 차단 메뉴 진입 예정 (별도 chunk).
- **운영 .env DB password 회전**: GitGuardian S85 후속, 운영자 결정 영역.
- **S88-USER-VERIFY / S88-OPS-LIVE**: 사용자 휴대폰 + 운영자 직접 영역.

---

## 알려진 이슈

- **e2e tsc 사전 존재 2건** (`scripts/e2e/phase-14c-alpha-ui.spec.ts:19/20`): S85 secret recovery 시 `process.env.X ?? "literal"` → 명시적 throw 패턴 변경 후 type narrowing 누락. 본 세션 변경 무관, S94 도 그대로. 별도 sweep PR (STYLE-2).
- **MessageBubble reply quote 부모 lookup fail-soft**: 부모 메시지가 같은 페이지에 없으면 "이전 메시지" fallback 표시. 향후 backend listMessages 의 replyTo include 정착 시 자연 해소 (별도 chunk).
- **F2-4 SSE wiring 라이브 검증 미수행**: vitest jsdom 환경 단위 테스트만 통과. 실제 EventSource 연결은 운영 콘솔 라이브 (브라우저 + 다른 terminal 발신) 검증 잔여 — F2-1~F2-3 의 manual 검증과 함께 운영자 영역.
- **GCM credential 잔재 위험**: S91 인계서 명시. 다음 push 시 재발 가능. SSH 전환 영구 해결책 검토 영역.
- **사이드바 nav 미통합**: 신규 3 페이지 (admin/reports + blocked-users + notification-preferences) 직접 URL 진입만 가능. 별도 chunk 에서 sidebar.tsx 의 "커뮤니케이션" 그룹 확장 권고.

---

## 다음 작업 제안 (S95+)

거버넌스 단언이 M5 (검색 ✅, 첨부 ❌) + M6 (운영자 ✅, 차단 ✅, 알림 ✅, 보안 리뷰 ❌) 까지 도달. M5 첨부 + 보안 리뷰 완료 시 sunset.

### S95 첫 행동

1. `git status --short` + `git log --oneline -8` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (다른 터미널 commit 가능성)
3. **M5 첨부** P0 — SeaweedFS multipart 통합 단독 chunk (5-6일):
   - ADR-033 후속 결정 (frontend S3 API 직접 vs server proxy)
   - SP-024 또는 신규 spike 권고
   - `<MessageAttachment>` 컴포넌트 + 30일 cron deref + 미리보기
4. **kdysharpedge 보안 리뷰** P1 — `/kdysharpedge` 스킬 호출 (messenger + admin 패널 영역)
5. **사이드바 nav 통합** P2 — admin/reports + blocked-users + notification-preferences 메뉴 추가
6. **거버넌스 단언 sunset 결정** P3 — M5 첨부 + 보안 리뷰 완료 시 next-dev-prompt 상단 단언 제거

### Sweep 병렬 가능

- **STYLE-2** P3 — e2e 사전 존재 tsc 2 errors fix
- **debounce 검색** P3 — M5 검색에 300ms debounce 도입
- **신규 차단 진입 UI** P2 — 대화 화면 hover → 차단 메뉴

### 다음 wave 평가

- S96+ (M5 첨부 완료 후) `kdywavecompletion --compare session-92` 으로 delta 평가 — Track C M4+M5+M6 진척 측정. 거버넌스 단언 효과 정량화.

---

## 영구 룰 (S94 정착)

### 1. logic-only TDD 분리 패턴 = 5 chunk 일관 적용

backend zero-or-additive + frontend pure logic 분리 + UI 통합 패턴이 F2-3/F2-4/F2-5/M5/M6 5 chunk 모두 적용 가능. PR 게이트 5항목 자동 통과 (신규 모델/라우트 0, RLS 라이브 N/A, timezone 비교 0). messenger 도메인 외에도 적용 가능.

### 2. file-level vitest environment annotation

`// @vitest-environment jsdom` 주석으로 환경 분리 = config 변경 없이 점진 진화. 기본은 node env (성능 + 격리), 컴포넌트/hook 테스트만 jsdom.

### 3. EventSource MockEventSource 패턴

`vi.stubGlobal("EventSource", MockClass)` + `dispatch(name, data)` 메서드 + `listeners Record` 로 add/remove 관리. jsdom native 미구현 EventSource 의 표준 mock 패턴.

### 4. 압축 실행 적용 영역 분류 변경

wave-tracker §6 의 "M4 UI 보드 = 압축 적용 불가" 와 정반대 — F2 이후 messenger UI 영역은 압축 가능 영역. 조건 = backend 선행 완비 + logic-only 분리 패턴 + frontend-only chunk.

### 5. backend 응답 shape additive 확장 = PR 게이트 #2 미발동

기존 라우트의 include/select 확장 (응답 필드 추가) 은 신규 라우트 가 아니므로 라이브 RLS 테스트 게이트 무관. tenantPrismaFor 패턴만 유지하면 zero-RLS-risk.

---

## 저널 참조

본 세션 누적 저널: [`docs/logs/journal-2026-05-09.md`](../logs/journal-2026-05-09.md) — 세션 94 12 토픽.

---

## 관련 자료

- 직전 세션 (다른 터미널 /cs): [260508-session93-f2-2-optimistic-send.md](./260508-session93-f2-2-optimistic-send.md)
- S92 baseline: [260508-session92-wave-eval-delta-f2-1.md](./260508-session92-wave-eval-delta-f2-1.md)
- S91 wave eval delta: [260508-session91-wave-completion-eval-delta.md](./260508-session91-wave-completion-eval-delta.md)
- wave-tracker SOT: [wave-tracker.md](../research/baas-foundation/04-architecture-wave/wave-tracker.md)
- 관련 룰: CLAUDE.md "PR 리뷰 게이트 룰" 5 항목, `feedback_concurrent_terminal_overlap` / `feedback_autonomy` / `feedback_baseline_check_before_swarm` / `reference_gcm_credential_reject` (본 세션 신규)

---
[← handover/_index.md](./_index.md)
