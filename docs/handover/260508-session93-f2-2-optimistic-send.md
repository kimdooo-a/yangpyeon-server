# 인수인계서 — 세션 93 (M4 Phase 2 F2-2 — 낙관적 송신, TDD 17, commit `b750186`)

> 작성일: 2026-05-09 (작업일 2026-05-08, /cs 시점 자정 직후)
> 직전 세션: [session 92 — wave eval delta + F2-1](./260508-session92-wave-eval-delta-f2-1.md)
> 자매 보고서: [세션 91 wave eval delta](./260508-session91-wave-completion-eval-delta.md)
> 저널 원본: [journal-2026-05-08.md `## 세션 93` 섹션](../logs/journal-2026-05-08.md)

---

## 작업 요약

S92 F2-1 (composer + UUIDv7 + Enter 송신) 위에서 **F2-2 낙관적 송신 도입** — pure logic 모듈 `optimistic-messages.ts` 8 함수 + TDD 17 / `useMessages` hook 에 `sendOptimistic` 확장 / `MessageList` props lift / `MessageBubble` pending/failed 시각 분기 / `page.tsx` wiring. 단일 commit `b750186` (6 files +603/-69), 회귀 0 (vitest 619 PASS = 602 + 17). 거버넌스 단언 §31 "Phase 2 진행 중 자연 발생한 dependency" 예외 자동 적용으로 사용자 추가 승인 면제 자연 진입. **G-NEW-3 (M4 Phase 2 6 세션 정체) 1/14 → 2/14 commit 진척**.

---

## 대화 다이제스트

### 토픽 1: 세션 진입 + 베이스라인 검증

> **사용자**: "다음작업 진행 ... ● 모든 task 완료. 최종 요약 보고합니다." (S91/S92 종료 요약 표 첨부)

memory `feedback_concurrent_terminal_overlap` 적용 — `git status --short` + `git log --oneline -7` 사전 점검:
- working tree: 2 leftover (`docs/status/current.md` M / `260508-session92-wave-eval-delta-f2-1.md` ??) — S91 close 시 누락된 docs
- latest commit: `ac09ebd` F2-1
- 1단계 docs `b77cdcc` (sweep + 거버넌스)

`docs/handover/next-dev-prompt.md` 정독 → S91 wave eval §7.1 commit 시퀀스 표 = S91 F2-1 ✅ → S91 F2-2 (낙관적 업데이트 TDD ~12) 가 자연 진입.

**결론**: F2-2 = S91 wave eval 권고 commit 시퀀스 2번째. 거버넌스 단언 §31 "M4 Phase 2 진행 중 자연 발생한 dependency" 예외 정확 해당 (사용자 명시 승인 면제). 즉시 진입.

### 토픽 2: F2-2 작업 분해 + 관련 파일 병렬 read

TaskCreate 6:
1. `src/lib/messenger/optimistic-messages.ts` pure logic + TDD ~12
2. `useMessages` 에 `sendOptimistic` 추가
3. `[id]/page.tsx` `handleSend` 낙관적 송신으로 교체
4. `MessageList` props lift + `MessageBubble` pending/failed 시각 표식
5. vitest + tsc 회귀 0 검증
6. commit

병렬 read 8 파일: MessageComposer.tsx (F2-1) + useMessages.ts (Phase 1 fetch) + page.tsx (F2-1 통합 단순 POST) + POST /messages/route.ts (server) + messages.ts 헬퍼 + composer-logic.ts + MessageBubble.tsx + schemas/messages.ts.

**핵심 발견**: server 가 이미 멱등성 보장 (`(tenantId, conversationId, clientGeneratedId)` UNIQUE 인덱스 + UNIQUE_VIOLATION race catch + `fetchByCgid` fallback). 클라이언트 측 dedup 코드 0, 단순 prepend/replace 만으로 충분.

### 토픽 3: optimistic-messages.ts pure logic 8 함수

**설계 패턴 — `_optimistic` discriminator**:
- server fetch 메시지 → `_optimistic` 필드 없음
- optimistic prepend 후 응답 전 → `_optimistic.status='pending'`
- 4xx/5xx/네트워크 실패 → `_optimistic.status='failed'` + error
- server swap 시 → `_optimistic` 제거 (`delete cleaned._optimistic`)

UI 가 `m._optimistic?.status` 로 분기 + helper `isOptimisticPending` / `isOptimisticFailed` 로 의도 명확화.

**8 함수**:
| 함수 | 책임 | 멱등/protect 패턴 |
|------|------|----|
| `buildOptimisticMessage({payload, senderId, now})` | MessageRow 생성 | id=clientGeneratedId — UUIDv7 sortable, server swap 까지 React key 안정 |
| `findByClientGeneratedId(messages, cgid)` | match 조회 | 단순 find, null 반환 |
| `prependOptimistic(messages, optimistic)` | head 에 push | 같은 cgid 존재 시 동일 참조 반환 (멱등) |
| `replaceOptimisticWithServer(messages, cgid, server)` | 같은 index 자리 swap | match 없으면 defensive prepend, `_optimistic` 제거 |
| `markOptimisticFailed(messages, cgid, error)` | status='failed' 전환 | server 메시지 (`_optimistic` 없음) protect — 변경 안 함 |
| `removeOptimistic(messages, cgid)` | filter out | server 메시지 protect — 실수 production row 삭제 차단 |
| `isOptimisticPending(m)` / `isOptimisticFailed(m)` | discriminator | — |

**TDD 17**: build 2 + find 2 + prepend 3 + replace 2 + markFailed 3 + remove 3 + discriminator 2.

**자가 발견 함정**: `markOptimisticFailed` server protect 케이스 작성 시 `expect(next).toBe([server])` → 새 배열 리터럴은 영원히 참조 비교 실패. 즉시 수정 = `const arr = [server]; expect(next).toBe(arr)` (변수 캐싱 후 참조 비교 정확히 가능). 17/17 GREEN 즉시 통과.

### 토픽 4: useMessages hook 확장 — sendOptimistic + 타입 단일 source

**MessageRow 타입 SOT 이동**:
- 기존: `useMessages.ts` 안에 정의
- 변경: `optimistic-messages.ts` 단일 source + `useMessages.ts` 가 `export type { MessageRow } from "@/lib/messenger/optimistic-messages"` re-export
- 효과: 기존 import 경로 (`@/hooks/messenger/useMessages`) 유지하면서 SOT 일원화

**`sendOptimistic(payload, senderId)` 시퀀스**:
1. `buildOptimisticMessage` 빌드
2. `setMessages(prev => prependOptimistic(prev, optimistic))` 즉시 UI 반영
3. POST `/api/v1/t/default/messenger/conversations/{id}/messages` fetch
4. `!res.ok || !json?.success` → `markOptimisticFailed` + return `{ok: false, error}`
5. server 응답 누락 (`!serverMsg`) → 동일 fail 처리
6. 성공 → `replaceOptimisticWithServer(prev, cgid, json.data.message)` + return `{ok: true}`
7. catch (네트워크 실패) → 동일 fail 처리

**Retry 정책**: 클라이언트 retry UI 미도입 (F2-3+). 같은 cgid 로 재호출 시 server 멱등성 (UNIQUE 인덱스 + race catch) 위임 → `replaceOptimisticWithServer` 가 자연 멱등 swap.

### 토픽 5: MessageList props lift + MessageBubble pending/failed 시각 분기

**MessageList 변경 (props lift)**:
- 기존: 내부에서 `useMessages(conversationId)` 호출
- 변경: `messages`/`loading`/`error`/`currentUserId` props 받음
- 효과: page 의 `useMessages` 인스턴스 1개 → cache 공유로 sendOptimistic 와 자동 연동

각 `MessageBubble` 에 `pending=isOptimisticPending(msg)` + `failed=isOptimisticFailed(msg)` + `failureReason=msg._optimistic?.error` 전달.

**MessageBubble 변경**:
- `pending` prop 추가 → `wrapperClass` 에 `opacity-60` (서버 ack 전 시각 차이) + `data-status="pending"`
- `failed` prop 추가 → time row 옆에 빨간 `⚠ 실패` + `title=failureReason` 툴팁
- `aria-label` 부가 텍스트: "(전송 중)" / "(전송 실패)"

**page.tsx handleSend 변경**:
- 기존: 단순 POST + sonner toast
- 변경: `sendOptimistic(payload, user.sub)` 호출 → `{ok: false}` 인 경우만 toast.error (cache 의 빨간 점이 1차 노출, toast 는 보조 — 다른 대화 보고 있을 때 알림용)

**page.tsx useMessages page 레벨 lift**:
- 기존: MessageList 가 내부 호출
- 변경: page 가 호출 → MessageList 에 props 주입 → cache 공유 자연 정합

### 토픽 6: 검증 + commit

- `npx vitest run src/lib/messenger/optimistic-messages.test.ts` → **17/17 PASS, 154ms**
- `npx vitest run` (전체) → **619 PASS / 91 skipped** (S92 baseline 602 + 17 신규 정확 일치, 회귀 0)
- `npx tsc --noEmit` → 사전 존재 `phase-14c-alpha-ui.spec.ts:19/20` 2 errors (S85 secret recovery 도입, 본 변경 무관). F2-2 영역 grep 검증 → 0 errors.

**영역 분리 (memory `feedback_concurrent_terminal_overlap`)**: `docs/status/current.md` (M, S92 row 92 추가분) + `docs/handover/260508-session92-wave-eval-delta-f2-1.md` (??, S92 handover) 는 S91 close 시 누락된 docs — 본 commit 에 섞지 않고 명시 staging (F2-2 6 files 만).

**commit `b750186`**: 6 files +603/-69, GCM credential 워크어라운드 미발동 (commit 만, push 미실행).

### 토픽 7: /cs 진입 — S92 leftover docs 2건 통합 처리

S91 close 시 누락된 leftover 2건 (`current.md` row 92 + S92 handover) 이 본 세션 시작 시 있었음. 이들은 S92 chunk closure 의 정상 산출물이지만 미커밋 상태로 본 세션에 인계 — /cs docs commit 에 묶어 흡수.

**메타 가치**: G-NEW-3 (M4 Phase 2 6 세션 정체) 진척 = 1/14 → **2/14 commit**. 거버넌스 단언이 첫 자율 적용 — F2-2 가 §31 dependency 예외 정확히 해당하여 사용자 추가 승인 없이 자연 진입. Sunset (M5+M6 완료 시) 까지 패턴 정착.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | F2-2 진입 = 자율 (사용자 추가 승인 면제) | (a) 사용자 명시 승인 후 진입 (b) 거버넌스 §31 dependency 예외로 자율 진입 | (b) — F2-2 는 F2-1 의 자연 dependency (낙관적 업데이트가 composer 송신과 분리 불가). 거버넌스 단언 §31 "Phase 2 진행 중 자연 발생한 dependency" 예외 정확 해당. memory `feedback_autonomy.md` (분기 질문 금지) 정합. |
| 2 | MessageRow 타입 SOT = `optimistic-messages.ts` | (a) `useMessages.ts` (기존) (b) `optimistic-messages.ts` (logic 모듈) | (b) — pure logic 이 type 의 invariant 를 정의 (`_optimistic` discriminator). hook 은 logic 사용자 → SOT 는 logic 쪽. `useMessages.ts` 는 re-export 로 backward compat. |
| 3 | `_optimistic` 필드 위치 = MessageRow 직접 (separate type 아님) | (a) `OptimisticMessageRow extends MessageRow` 별도 타입 (b) MessageRow 에 optional 필드 직접 | (b) — UI 컴포넌트가 server/optimistic 모두 동일 prop 으로 받아야 함 (배열 안 섞여 있음). 별도 타입은 type guard 강제 필요 → 실수로 `_optimistic` 무시 위험. optional 필드가 implicit 안전. |
| 4 | server 메시지 protect (markFailed/remove 의 invariant) | (a) cgid 매치 시 무조건 변경 (b) `_optimistic` 있을 때만 변경 | (b) — 미래 retry/dedupe 구현 시 server cgid 매칭이 발생할 수 있음. server 메시지를 실수로 markFailed 하면 production row 가 빨간 점으로 노출. 명시적 protect 로 invariant 강제. |
| 5 | retry UI 미도입 (실패 메시지에 재시도 버튼 X) | (a) F2-2 안에 retry 버튼 (b) F2-3+ 으로 이월 | (b) — F2-2 = "낙관적 송신 표시" 까지. retry 트리거 UI 는 composer 통합 (F2-3 답장+멘션 chunk) 또는 message context menu (F2-5+). 본 commit 범위 최소화. |
| 6 | MessageList props lift = 부모 주입 | (a) 내부 호출 유지 + 부모는 별도 hook 호출 → 두 인스턴스 (b) 부모 1개 인스턴스 + props 주입 | (b) — 두 인스턴스는 cache 공유 X → optimistic 송신 후 MessageList 가 안 보임. SWR 도입 (S87-INFRA-1) 후 SWR 가 cache 공유 자연 처리하지만 본 commit 은 INFRA-1 미진입 → props lift 가 가장 단순. |
| 7 | unrelated leftover 2건 별도 commit | (a) F2-2 commit 에 흡수 (b) /cs docs commit 에 흡수 | (b) — F2-2 commit 의 의미적 일관성 보존 (코드 6 files = 의도된 변경). leftover 는 S92 chunk closure 의 정상 산출물 → /cs 가 자연 흡수. |
| 8 | tsc 사전 존재 e2e 2 errors 처리 안 함 | (a) 본 commit 에 fix 동봉 (b) 무시, 별도 PR 권고 | (b) — `phase-14c-alpha-ui.spec.ts` 는 S85 secret recovery 시 도입 (`process.env.X ?? "literal"` → 명시적 throw 패턴 변경 후 type narrowing 누락). 본 chunk 무관. fix 는 sweep PR 또는 e2e 정비 별도 chunk. |

---

## 수정/신규 파일 (12개)

### commit `b750186` (F2-2 = 낙관적 송신) 6 files

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/messenger/optimistic-messages.ts` | (신규, 140 lines) pure logic 8 함수 + MessageRow/OptimisticMeta 타입 — `_optimistic` discriminator 패턴, server protect invariant |
| 2 | `src/lib/messenger/optimistic-messages.test.ts` | (신규, 159 lines) TDD 17 — build 2 + find 2 + prepend 3 + replace 2 + markFailed 3 + remove 3 + discriminator 2 |
| 3 | `src/hooks/messenger/useMessages.ts` | `sendOptimistic(payload, senderId)` 추가 + MessageRow re-export (SOT = optimistic-messages) |
| 4 | `src/components/messenger/MessageList.tsx` | props lift — `messages`/`loading`/`error`/`currentUserId` 부모 주입. optimistic 메시지에 pending/failed 분기 전달 |
| 5 | `src/components/messenger/MessageBubble.tsx` | `pending`/`failed`/`failureReason` props 추가 — opacity-60 + 빨간 ⚠ 실패 + title 툴팁, aria-label 부가 텍스트 |
| 6 | `src/app/(protected)/messenger/[id]/page.tsx` | `useMessages(conversationId)` page 레벨 lift, sendOptimistic 으로 handleSend 교체, MessageList 에 props 주입 |

### 본 /cs commit (docs)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 7 | `docs/handover/260508-session93-f2-2-optimistic-send.md` | (신규, 본 인계서) |
| 8 | `docs/handover/_index.md` | 2026-05-08 그룹 row 93 추가 |
| 9 | `docs/status/current.md` | row 93 추가 (S92 leftover row 92 + 본 row 93 동봉 commit) |
| 10 | `docs/logs/2026-05.md` | row 93 entry |
| 11 | `docs/logs/journal-2026-05-08.md` | 세션 93 섹션 append (7 토픽) |
| 12 | `docs/handover/next-dev-prompt.md` | S94 진입 우선순위 갱신 (F2-3 P0 + 거버넌스 단언 적용 + 잔여 carry-over) |

---

## 상세 변경 사항

### 1. optimistic-messages.ts (140 lines, 8 pure functions)

**`_optimistic` discriminator 패턴**:
```typescript
export interface OptimisticMeta {
  status: "pending" | "failed";
  error?: string; // failed 시 사용자 노출용
}

export interface MessageRow {
  // ... server 메시지와 동일 필드 ...
  _optimistic?: OptimisticMeta; // server fetch 시 undefined
}
```

**핵심 invariant — server protect**:
```typescript
export function markOptimisticFailed(messages, cgid, error) {
  const idx = messages.findIndex(m => m.clientGeneratedId === cgid);
  if (idx < 0) return messages;
  const target = messages[idx];
  if (!target._optimistic) return messages; // ← server 메시지 protect
  // ...
}

export function removeOptimistic(messages, cgid) {
  const target = findByClientGeneratedId(messages, cgid);
  if (!target || !target._optimistic) return messages; // ← server 메시지 protect
  return messages.filter(m => m.clientGeneratedId !== cgid);
}
```

`_optimistic` 가 type-level encoding 으로 invariant 강제 — 미래 retry/dedupe 구현 시 server cgid 매칭이 발생해도 production row 안전.

### 2. useMessages.ts — sendOptimistic 시퀀스

```typescript
const sendOptimistic = useCallback(async (payload, senderId) => {
  const optimistic = buildOptimisticMessage({ payload, senderId });
  setMessages(prev => prependOptimistic(prev, optimistic));
  try {
    const res = await fetch(`/api/v1/t/${TENANT_SLUG}/.../messages`, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      const errMsg = json?.error?.message ?? `송신 실패 (HTTP ${res.status})`;
      setMessages(prev => markOptimisticFailed(prev, payload.clientGeneratedId, errMsg));
      return { ok: false, error: errMsg };
    }
    const serverMsg = json.data?.message;
    if (!serverMsg) {
      // ...fail path...
    }
    setMessages(prev => replaceOptimisticWithServer(prev, payload.clientGeneratedId, serverMsg));
    return { ok: true };
  } catch (err) {
    // ...fail path...
  }
}, [conversationId]);
```

server 멱등성 (`(tenantId, conversationId, clientGeneratedId)` UNIQUE) 위임으로 retry 시 자연 swap.

### 3. MessageBubble.tsx — pending/failed 시각 표식

```tsx
const wrapperClass = `${v.containerClass} px-3 py-1${pending ? " opacity-60" : ""}`;
// ...
{failed && (
  <span className="ml-1.5 text-red-400" title={failureReason ?? "전송 실패"}
        aria-label={`전송 실패: ${failureReason ?? ""}`}>
    ⚠ 실패
  </span>
)}
```

opacity-60 = 서버 ack 전 시각 차이 (fade-in 효과 미도입 = 본 chunk 범위 최소화).

### 4. page.tsx — useMessages page lift + sendOptimistic 통합

```tsx
const { messages, loading, error, sendOptimistic } = useMessages(conversationId);

const handleSend = useCallback(async (payload: SendPayload) => {
  if (!user?.sub) {
    toast.error("로그인 정보가 없어 송신할 수 없습니다");
    return;
  }
  const result = await sendOptimistic(payload, user.sub);
  if (!result.ok) {
    toast.error(result.error ?? "송신 실패");
  }
}, [sendOptimistic, user?.sub]);
```

`MessageList` 에 `messages`/`loading`/`error`/`currentUserId` props 주입 — cache 공유 자연 정합.

---

## 검증 결과

- `npx vitest run src/lib/messenger/optimistic-messages.test.ts` — **17/17 PASS, 154ms**
- `npx vitest run` (전체) — **619 PASS / 91 skipped** (S92 baseline 602 + 17 신규 정확 일치, 회귀 0)
- `npx tsc --noEmit` — 사전 존재 `phase-14c-alpha-ui.spec.ts:19/20` 2 errors (S85 secret recovery, 본 변경 무관). F2-2 영역 grep 검증 → 0 errors.
- `git status --short` post-commit — leftover 2건만 (S92 close 산출물, 본 /cs 에 흡수).
- `git log --oneline -3` — `b750186 F2-2` / `ac09ebd F2-1` / `b77cdcc S91 wave eval`.

---

## 터치하지 않은 영역

- F2-3 (답장 인용 카드 + 멘션 popover, S94 이월)
- F2-4 (use-sse hook 운영 wiring + SWR 캐시 invalidate, S94 이월)
- F2-5 (DIRECT peer name lookup + User profile cache, S95 이월)
- INFRA-1 (SWR + jsdom + @testing-library/react, S95 이월 — F2-2 는 INFRA-1 없이 props lift 로 우회)
- M5 (첨부 + 검색, S96 이월) / M6 (알림 + 차단/신고 + 운영자, S97~S98 이월)
- pending 메시지 page reload 시 손실 (브라우저 storage 미도입, F2-5 검토)
- retry 트리거 UI (failed 메시지에 재시도 버튼, F2-3 composer 통합 또는 F2-5+ context menu)
- e2e 사전 존재 tsc 2 errors (`phase-14c-alpha-ui.spec.ts:19/20`, 별도 sweep PR)
- PM2 운영 서버 4종 (CLAUDE.md 임의 종료 금지)
- 다른 터미널 commits (현재 동시 진행 없음, 본 세션 단독)
- DB password 회전 / S86-SEC-1 GitHub repo 가시성 / S87-RSS-ACTIVATE / S87-TZ-MONITOR / GCM credential 룰 메모리 승격 (S87 이월 그대로)

---

## 알려진 이슈

- **GCM credential default token 미확정**: 직전 세션 91 의 GCM workaround 후 default token 이 `aromaseoro-lab` 인지 `kimdooo-a` 인지 미확인. 본 /cs 에서 push 시도 시 403 재발 가능 — 재발 시 reject 1회 추가 또는 SSH 전환 검토. (S91 CK `2026-05-08-gcm-multi-account-credential-rejected-trap.md` 참조)
- **pending 메시지 reload 손실**: 송신 도중 브라우저 새로고침 시 optimistic 메시지가 cache 에서 사라짐. 사용자 인지 후 재송신 가능. localStorage drafts 도입은 F2-5+ 검토.
- **retry UI 부재**: failed 메시지에 빨간 점만 노출, 클릭 재시도 버튼 미도입. 사용자가 같은 텍스트 직접 재입력 + 재전송 → server 멱등성 동작 안 함 (cgid 가 다름) → 새 row 생성. retry 시 같은 cgid 유지 = F2-3+ 작업.

---

## 다음 작업 제안 (S94+)

- **P0 F2-3** (답장 인용 카드 + 멘션 popover cmdk, TDD ~15) — 같은 logic-only 분리 패턴 적용 가능 (replyTo 검증 + mention parse pure logic). composer 통합으로 retry UI 자연 동봉 검토.
- **P0 F2-4** (use-sse hook 운영 wiring + SWR 캐시 invalidate, TDD ~10) — SSE message.created 이벤트 수신 시 `setMessages` 에 dedup prepend (cgid 매치 = optimistic swap 등가).
- **P1 F2-5** (DIRECT peer name lookup + User profile cache, TDD ~8) — peer 정보 패널 시동.
- **P2 INFRA-1** (SWR + jsdom + @testing-library/react, ~3h 단독 chunk) — F2-3 또는 F2-4 직전/동시 도입 가치. SWR 도입 시 useMessages 가 `mutate(cgid, server, false)` 패턴으로 더 단순.
- **P3 carry-over**: S88-USER-VERIFY (사용자 폰) / S88-OPS-LIVE (운영자) / S86-SEC-1 (운영자) / S87-RSS-ACTIVATE / S87-TZ-MONITOR / GCM 룰 메모리 승격 / sticky-note-card.tsx:114 endDrag stale closure / e2e tsc 2 errors sweep.

### 진척도 메타

- M4 Phase 2 commit 시퀀스 진척: F2-1 (S92, ✅) + F2-2 (S93, ✅) = **2/14**
- 거버넌스 단언 effective: 1 자율 적용 사례 (F2-2 dependency 예외, S93). M5+M6 완료 시 sunset.
- 다음 wave eval 권장 시점: S95 (`kdywavecompletion --compare session-92`) — F2-3/F2-4 완료 후 Track C 가치 진척 측정.

---

[← handover/_index.md](./_index.md)
