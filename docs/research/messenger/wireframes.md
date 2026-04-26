# 화면 와이어프레임 + 데이터 흐름 시퀀스

> **소스**: 세션 63 (2026-04-26) PRD §3 / §7 보강
> **사용처**: 디자인 리뷰(M4 게이트), Playwright E2E 셀렉터 작성, 컴포넌트 props 정합성 확인

---

## 1. 데스크톱 메인 — 3-column 레이아웃 (≥1024px)

```
┌──────────┬─────────────────────────────────────────────┬──────────────────┐
│ 양평 부엌 │  ┌─ 김철수 (DM) ─────────────────  [⚙ ⓘ] ┐ │ ▼ 정보 패널      │
│          │  │ ┌──────────┐                            │ │                  │
│ 운영     │  │ │ 김철수   │  안녕하세요!               │ │ ┌─김철수────────┐│
│ ├ 대시보드│  │ │ avatar   │  내일 미팅 시간 잠깐 변경  │ │ │ avatar 96px   ││
│ ├ 프로세스│  │ └──────────┘  되었습니다.              │ │ │ 김철수        ││
│ ├ 로그   │  │            오후 2:14            안 읽음 │ │ │ MEMBER        ││
│ ├ 네트워크│  │                                         │ │ │ 마지막 접속   ││
│ └ 메트릭 │  │  ┌─ 답장 인용 ─────────────┐            │ │ │ 5분 전         ││
│          │  │  │ 김철수: 내일 미팅...     │            │ │ ├───────────────┤│
│ 커뮤니케이션│  │  └──────────────────────┘            │ │ │ 첨부 갤러리   ││
│ ├ ▷ 대화 │  │  ┌──────────────────────┐              │ │ │ ┌─┐┌─┐┌─┐    ││
│ │         │  │  │ 어떤 시간으로?       │ 본인 (브랜드)│ │ │ │ ││ ││ │    ││
│ │         │  │  └──────────────────────┘             │ │ │ └─┘└─┘└─┘    ││
│ ├ 연락처  │  │                          오후 2:15  ✓ │ │ ├───────────────┤│
│ ├ 알림설정│  │                                         │ │ │ 핀 메시지      ││
│ │         │  │  ┌──────────┐                          │ │ │ • 회의록 공유  ││
│ │         │  │  │ 김철수   │  3시 어떠세요?           │ │ └───────────────┘│
│ │         │  │  │ avatar   │                          │ │                  │
│ │         │  │  └──────────┘ 오후 2:16   안 읽은 0   │ │                  │
│ 콘텐츠   │  │                                         │ │                  │
│ ├ 파일박스│  │  💬 김철수 입력 중...                  │ │                  │
│ └ 메모   │  ├─────────────────────────────────────────┤ │                  │
│          │  │ [📎] [😊] [@] ┃ 메시지 입력...          │ │                  │
│ 데이터베이스│  │              ┃                  [전송] │ │                  │
│ ├ 테이블 │  └─────────────────────────────────────────┘ └──────────────────┘
│ ├ SQL... │
│          │  좌(320px)        중(flex-1)             우(320px, 토글)
└──────────┘
   사이드바
   (224px)
```

**레이아웃 토큰**:
- 사이드바 224px (`w-56` 기존), 대화목록 320px (`w-80`), 정보패널 320px
- 채팅창 = 헤더 56px (PageHeader 패턴) + 메시지 영역 flex-1 (overflow-y-auto) + composer 80px (auto-grow)
- 모든 색상은 `globals.css` 토큰 — surface-100/200/300, brand #2D9F6F, text-primary #1A1815
- 폰트: Geist 14px 본문, 11px 메타

---

## 2. 데스크톱 — 대화목록 (좌측 320px 상세)

```
┌──────────────────────────────────┐
│ 대화                       [⊕]  │  ← PageHeader (h-14)
├──────────────────────────────────┤
│ 🔍 메시지 검색...                │  ← 상단 fixed search bar
├──────────────────────────────────┤
│ [전체] [읽지 않음(3)] [핀] [봇] │  ← FilterTabs
├──────────────────────────────────┤
│ ┌─┐ 김철수                14:16 │  ← active (border-l-2 brand)
│ │○│ 3시 어떠세요?           ●3 │     unread badge
│ └─┘                              │
├──────────────────────────────────┤
│ ┌─┐ 양평 백엔드팀         11:42 │  ← group, 멘션 표식
│ │양│ 박영희: @김도영 PR 리뷰..●1│
│ └─┘                              │
├──────────────────────────────────┤
│ 📌 │ 운영 알림 시스템       어제│  ← pinned + bot 아이콘
│ 🤖 │ 배포 #421 완료              │
├──────────────────────────────────┤
│ ┌─┐ 박영희 (DM)        2026-04-25│  ← 일반
│ │박│ 감사합니다!                │     unread 0이면 본문 회색
│ └─┘                              │
├──────────────────────────────────┤
│ 🔇 │ 마케팅 채널         2026-04-22│  ← muted (회색 + 자물쇠)
│    │ 새 캠페인 결과...           │
└──────────────────────────────────┘
       각 행 height 64px, hover bg-surface-300
```

**ConversationListItem props**:
```ts
{
  conversation: { id, kind, title, lastMessage, lastMessageAt },
  unreadCount: number,
  isPinned: boolean,
  isMuted: boolean,
  isActive: boolean,
  hasMention: boolean,
  onClick: () => void,
}
```

---

## 3. 모바일 — 1-column stack (<768px)

```
화면 1: /messenger              화면 2: /messenger/[id]         화면 3: /messenger/[id]/info
┌──────────────────┐            ┌──────────────────┐            ┌──────────────────┐
│☰ 대화      [⊕]   │            │← 김철수    [⋮ ⓘ] │            │← 정보            │
├──────────────────┤            ├──────────────────┤            ├──────────────────┤
│🔍 검색...        │            │                  │            │ ┌──────┐         │
├──────────────────┤            │ ┌─┐ 안녕하세요   │            │ │avatar│         │
│┌─┐ 김철수    14:16│            │ │○│ 미팅 시간   │            │ │  96  │         │
││○│ 3시... ●3      │            │ └─┘ 변경되어    │            │ └──────┘         │
│└─┘                │            │     14:14       │            │ 김철수           │
├──────────────────┤            │                  │            │ MEMBER           │
│┌─┐ 양평팀  11:42  │            │  어떤 시간으로? │            │                  │
│   ●1 멘션         │            │       14:15  ✓✓│            │ ───              │
├──────────────────┤            │                  │            │ 첨부 갤러리      │
│ ...               │            │ ┌─┐ 3시?        │            │ ┌──┐┌──┐┌──┐    │
│                   │            │ │○│ 어떠세요    │            │ │  ││  ││  │    │
│                   │            │ └─┘ 14:16  안0  │            │ └──┘└──┘└──┘    │
├──────────────────┤            ├──────────────────┤            │ ───              │
│  대화 / 연락처    │            │📎😊@│ 입력... 전송│            │ 알림 끄기 [□]    │
│       알림  설정  │            └──────────────────┘            │ 채팅방 나가기    │
└──────────────────┘             route push (history.back)       │ 사용자 차단      │
   탭바 (h-14)                                                    └──────────────────┘
```

**전환 규칙**:
- 대화목록 → 채팅창: route push (`router.push(/messenger/${id})`)
- 채팅창 → 정보패널: route push (`/messenger/${id}/info`)
- 헤더 ← 화살표: `router.back()` — URL 의미론 유지 (PWA 백버튼 호환)

---

## 4. 메시지 버블 종류

### 4.1 텍스트 (본인 / 상대)

```
본인 (오른쪽 정렬):                 상대 (왼쪽 정렬):
                                    ┌─┐
        ┌──────────────┐            │○│ ┌──────────────┐
        │ 안녕하세요   │            └─┘ │ 안녕하세요   │
        │ 반갑습니다   │ brand bg       │ 반갑습니다   │ surface-200
        └──────────────┘                └──────────────┘
                  14:16  ✓✓             14:16   안 읽음 1
```

- 본인: brand #2D9F6F 배경, white text, 12px radius (꼬리 없음)
- 상대: surface-200 배경, text-primary, 12px radius
- 1분 묶음: 같은 분 내 연속 메시지는 시간 표시 1번만 (마지막 메시지 옆)
- 그룹: 상대 메시지 위 이름 표시 (그룹 첫 메시지에만)

### 4.2 답장 인용 카드

```
┌─ 답장: 김철수 ─────────────┐
│ 내일 미팅 시간 잠깐 변경... │  ← 인용 (배경 살짝 어둡게, brand 좌측 라인)
└─────────────────────────────┘
┌──────────────────────────────┐
│ 어떤 시간으로?              │  ← 본문
└──────────────────────────────┘
                    14:15   ✓✓
```

- 인용 카드 클릭 → 원본 메시지로 스크롤 + 1초 하이라이트
- 원본 회수된 경우: "원본이 삭제되었습니다" (회색 italic)

### 4.3 첨부 (이미지 / 파일)

```
이미지 (단일):                          이미지 (복수, ≤4):
┌──────────────────┐                    ┌────┬────┐
│                  │                    │ 1  │ 2  │
│   [thumbnail]    │ 클릭 시 lightbox   ├────┼────┤
│   max 320×240    │                    │ 3  │ 4  │
│                  │                    └────┴────┘
└──────────────────┘                    그리드 2×2

이미지 (5+ 장):                         일반 파일:
┌────┬────┬────┐                        ┌────────────────────────┐
│ 1  │ 2  │ 3  │                        │ 📄 회의록.pdf  2.1MB   │
├────┼────┼────┤                        │            [다운로드 ↓]│
│ 4  │ +N │ ·· │                        └────────────────────────┘
└────┴────┴────┘
+N 클릭 → 갤러리 모달
```

### 4.4 시스템 메시지

```
            ─── 김철수님이 입장했습니다 ───
            ─────── 2026-04-26 ───────
```
- 중앙 정렬, 회색 11px, 양옆 hr
- kind=SYSTEM, sender=null, body=고정 템플릿

### 4.5 회수된 메시지 (deleted_at IS NOT NULL)

```
        ┌──────────────────────────────┐
        │ 🚫 회수된 메시지입니다       │ italic, 회색
        └──────────────────────────────┘
                                14:16
```
- admin 회수 시: "운영자에 의해 회수된 메시지"

---

## 5. Composer (메시지 입력창)

```
┌─────────────────────────────────────────────────────────────┐
│ ┌─ 답장: 김철수 ──────────────────────────────────[X]──────┐│ ← replyPreview (있을 때만)
│ │ 내일 미팅 시간 잠깐 변경되었습니다                       ││
│ └──────────────────────────────────────────────────────────┘│
│ ┌─ 첨부 미리보기 ──────────────────────────────────────────┐│ ← attachmentPreview (있을 때만)
│ │ ┌──┐ ┌──┐ ┌──────────┐                                  ││
│ │ │  │ │  │ │ 회의.pdf │ [+]                              ││
│ │ │  │ │  │ │ 2.1MB    │                                  ││
│ │ └──┘ └──┘ └──────────┘                                  ││
│ └──────────────────────────────────────────────────────────┘│
│ ┌────┬────┬────┬─────────────────────────────────────┬────┐│
│ │ 📎 │ 😊 │ @  │ 메시지 입력...                       │전송││ ← 메인 행
│ └────┴────┴────┴─────────────────────────────────────┴────┘│
└─────────────────────────────────────────────────────────────┘
   클립  이모지 멘션         textarea (auto-grow, max 6lines)  버튼
```

**키보드 단축키**:
- Enter = 송신, Shift+Enter = 줄바꿈
- @ → MentionPopover 자동 트리거
- Ctrl/⌘+K = 대화 검색 (전역)
- Esc = 답장/첨부 취소

**MentionPopover** (cmdk 패턴):
```
┌─────────────────────────────┐
│ @kim                        │
├─────────────────────────────┤
│ ▶ ┌─┐ 김철수                │  ← 화살표키 선택
│   │○│ kim.cs@example.com    │
│   └─┘                       │
├─────────────────────────────┤
│   ┌─┐ 김영희                │
│   │○│ kim.yh@example.com    │
│   └─┘                       │
└─────────────────────────────┘
   max-height 240px, scroll
```

---

## 6. 운영자 패널 — 신고 큐 (`/admin/messenger/moderation`)

```
┌────────────────────────────────────────────────────────────┐
│ 신고 큐                                       [필터: 전체▼]│
├────────────────────────────────────────────────────────────┤
│ 상태: 미처리(5)  처리됨(123)  무시(8)                      │
├────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐│
│ │ 🚨 사용자 X — 음란 메시지        2026-04-26 14:30      ││
│ │ "..." (메시지 내용 미리보기)                            ││
│ │ 신고자: 김철수 (kim.cs@...)                             ││
│ │ tenant: default                                         ││
│ │                  [메시지 회수] [사용자 차단] [무시]    ││
│ └────────────────────────────────────────────────────────┘│
│ ┌────────────────────────────────────────────────────────┐│
│ │ ⚠ 사용자 Y — 스팸                  2026-04-26 13:15    ││
│ │ ...                                                      ││
│ └────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

**Moderation actions**:
- "메시지 회수" → DELETE message + audit `messenger.message_deleted by_admin`
- "사용자 차단" → 운영자 본인이 X 차단 + (옵션) tenant-wide 차단 (별도 권한)
- "무시" → status=DISMISSED + audit

---

## 7. 운영자 패널 — 헬스 (`/admin/messenger/health`)

```
┌────────────────────────────────────────────────────────────────────┐
│ 메신저 헬스                                  [⟳ 자동 새로고침 5s] │
├────────────────────────────────────────────────────────────────────┤
│ 전체 SLO                                                           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│ │ 송신 p95 │ │ SSE conn │ │ 첨부 실패│ │ 신고 큐  │               │
│ │  142 ms  │ │  87 / 200│ │  0.3 %   │ │  5 미처리│               │
│ │   ✓      │ │   ✓      │ │   ✓      │ │   ⚠     │               │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
├────────────────────────────────────────────────────────────────────┤
│ Tenant별 (5×4 그리드, N=20 가정)                                   │
│ ┌────────┬────────┬────────┬────────┬────────┐                    │
│ │default │almanac │tenant-c│tenant-d│tenant-e│                    │
│ │msg/min │msg/min │msg/min │msg/min │msg/min │                    │
│ │  142   │   23   │    0   │   88   │   12   │                    │
│ │ p95 ✓ │ p95 ✓ │ idle  │ p95 ✓ │ p95 ⚠ │   ← 빨강/노랑/초록 │
│ │ 23 SSE│  8 SSE │  0 SSE │ 31 SSE │  4 SSE │                    │
│ │ q 30% │ q 5%   │ q 0%   │ q 12% │ q 78% │   ← quota 사용률    │
│ └────────┴────────┴────────┴────────┴────────┘                    │
│ ...                                                                │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8. 데이터 흐름 시퀀스 — 메시지 송신 (Phase 1)

```
P2 협업자                Browser                Server (Next.js Route)        DB (Postgres)            SSE Bus              Other clients
──────                   ───────                ─────────────────────────       ────────────              ────────              ─────────────

1. composer 입력
2. Enter
   │
   ├──> POST /api/v1/conversations/:id/messages
   │      body: { kind:'TEXT', body:'안녕', clientGeneratedId:'uuid-7' }
   │
   │                     ├──> withAuth + withRole + ConversationMember 검증
   │                     │
   │                     ├──> withTenantTx(tenantId, async tx => {
   │                     │       SET LOCAL app.tenant_id = '<uuid>'
   │                     │       INSERT INTO messages (...)
   │                     │       UPDATE conversations SET last_message_at = now()
   │                     │       INSERT INTO message_mentions (...)  -- if mentions
   │                     │     })
   │                     │                                      ├──> RLS 통과 (tenant 일치)
   │                     │                                      ├──> UNIQUE(tenantId, convId, clientGeneratedId) 검증
   │                     │
   │                     ├──> auditLogSafe('messenger.message_sent', ...)
   │                     │
   │                     ├──> publish('conv:<convId>', 'message.created', payload)
   │                     │                                                            ├──> EventEmitter
   │                     │                                                            │   .emit(channelEvent)
   │                     │                                                            │
   │                     │                                                            │     ├──> SSE handler 1 (P2 본인 다른 탭)
   │                     │                                                            │     ├──> SSE handler 2 (수신자 김철수 PC)
   │                     │                                                            │     └──> SSE handler 3 (수신자 김철수 모바일)
   │                     │                                                            │
   │                     ├──> mentions.forEach(uid =>
   │                     │       publish('user:<uid>:notif', 'mention.received', ...)
   │                     │     )
   │                     │
   │                     └──< 201 { message: {id, ...} }
   │
   ├──< { success: true, data: { message: {id, ...} } }
   │
   └─> UI: 메시지 추가 (낙관적 업데이트, 이미 client에서 임시 표시 중이면 dedupe)
```

**오프라인 재시도 (S2.5)**:
```
Browser (offline)                                Server
─────────────────                                ──────
1. composer Enter
2. fetch() throws (network error)
3. LocalStorage.queue.push({ url, body })  ← clientGeneratedId 포함
4. UI: "전송 실패, 재시도 중..." 상태

(재접속)
5. queue flush (병렬 N개)
   ├──> POST /messages (req 1, clientGeneratedId='uuid-7')
   │                                              ├──> INSERT 성공
   │                                              └──< 201
   ├──> POST /messages (req 1 재시도, 같은 clientGeneratedId)
   │                                              ├──> UNIQUE 위반
   │                                              ├──> SELECT 기존 메시지
   │                                              └──< 200 (멱등 동일 응답)
6. UI: "전송됨" 상태 전이 (양쪽 응답 모두 동일 messageId)
```

---

## 9. 데이터 흐름 시퀀스 — SSE 구독

```
Browser EventSource                Next.js SSE Route                       SSE Bus
───────────────────                ─────────────────                       ───────

1. new EventSource('/api/sse/realtime/channel/conv:<id>')
   │
   ├──> GET /api/sse/realtime/channel/conv:abc123
   │       Headers: Cookie (auth), Last-Event-ID (catchup)
   │
   │                     ├──> withRequestContext + withAuth
   │                     ├──> channel key 파싱: kind='conv', id='abc123'
   │                     ├──> ConversationMember 검증 (DB query)
   │                     │       (tenantId, conversationId, userId) 일치?
   │                     │       NO → 403 Forbidden, 종료
   │                     │       YES → 진행
   │                     │
   │                     ├──> SSE response stream 시작
   │                     │       headers: text/event-stream, no-cache, keep-alive
   │                     │
   │                     ├──> bus.subscribe('conv:abc123', cb)
   │                     │                                                ├──> emitter.on(...)
   │                     │                                                └──> subscribers.set('conv:abc123', N+1)
   │                     │
   │                     ├──> ping every 25s (keep-alive)
   │                     │
   │                     ├──< 다른 사용자가 메시지 송신 → publish
   │                     │                                                ├──> emitter.emit
   │                     │                     ├──< cb(message)            │
   │                     ├──< write(`data: ${JSON.stringify(message)}\n\n`)│
   │
   ├──< event: message.created
   │     data: { conversationId, messageId, kind, body, senderId, ... }
   │
   └─> UI: messages.push(...), 자동 스크롤 (사용자가 맨 아래 있을 때만)


(재연결 시)
2. EventSource 자동 재연결 + Last-Event-ID 헤더
   │
   ├──> GET /api/sse/realtime/channel/conv:abc123
   │       Last-Event-ID: 1714123456-789
   │
   │                     ├──> Phase 1.5: ring buffer last 100에서 catchup
   │                     ├──> 누락 메시지 N건 순차 write
   │                     └──> 이후 새 메시지 stream
```

---

## 10. 데이터 흐름 시퀀스 — 첨부 업로드

```
Browser                   Filebox API              Messages API           DB
───────                   ───────────              ────────────           ──

1. drag&drop 5장
2. 병렬 업로드 (Promise.all):
   ├──> POST /api/v1/filebox/files (img1.jpg)
   ├──> POST /api/v1/filebox/files (img2.jpg)
   ├──> POST /api/v1/filebox/files (img3.jpg)
   ├──> POST /api/v1/filebox/files (img4.jpg)
   └──> POST /api/v1/filebox/files (img5.jpg)
        │
        ├──> withAuth + MIME 화이트리스트 검증
        ├──> 디스크 저장 (storedName=uuid)
        ├──> INSERT INTO files (originalName, storedName, mimeType, size, ownerId, ...)
        │                                                              ├──> tenant_id default current_setting
        │                                                              └──> 5 rows
        └──< { fileId: uuid }

3. UI: 5 thumbnail strip 표시, "송신" 버튼 활성화

4. 송신:
   POST /api/v1/conversations/:id/messages
     body: {
       kind: 'IMAGE',
       body: '',
       attachments: [{fileId:1, kind:'IMAGE'}, ..., {fileId:5, kind:'IMAGE'}],
       clientGeneratedId: 'uuid-7'
     }
   │
   │                                          ├──> withTenantTx
   │                                          ├──> INSERT messages
   │                                          ├──> INSERT message_attachments × 5
   │                                          │       FK: messageId, fileId(→ files.id)
   │                                          ├──> publish('conv:<id>', 'message.created', ...)
   │                                          └──< 201
```

**첨부 cleanup (Q8 결정 — 권장 30일 cron)**:
- 메시지 회수 시 즉시 첨부 삭제 X
- 30일 cron이 `SELECT files WHERE id NOT IN (SELECT fileId FROM message_attachments WHERE deletedAt IS NULL)` 으로 dereference된 파일 정리

---

## 11. 화면 상태별 안전 표시 (Edge Cases)

### 11.1 빈 상태 (EmptyState)
```
┌──────────────────────────────────┐
│                                  │
│           💬                     │
│                                  │
│      대화가 없습니다             │
│                                  │
│   "+ 새 대화" 버튼으로 시작      │
│   해 보세요.                     │
│                                  │
│      [+ 새 대화 시작]            │
│                                  │
└──────────────────────────────────┘
```

### 11.2 로딩 (Skeleton)
```
┌──────────────────────────────────┐
│ ┌──┐ ▓▓▓▓▓▓▓▓▓▓▓▓     ▓▓▓▓     │
│ │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         │
│ └──┘                              │
├──────────────────────────────────┤
│ ┌──┐ ▓▓▓▓▓▓▓▓▓▓▓▓     ▓▓▓▓     │
└──────────────────────────────────┘
```

### 11.3 네트워크 오류
```
┌──────────────────────────────────┐
│ ⚠ 연결이 끊어졌습니다.           │
│   재연결 시도 중...              │  ← SSE reconnect, EventSource 자동
└──────────────────────────────────┘
```

### 11.4 권한 거부 (cross-tenant 차단 시도 등)
```
┌──────────────────────────────────┐
│ 🔒 이 대화에 접근할 권한이       │
│    없습니다.                     │
│                                  │
│    [대화 목록으로]               │
└──────────────────────────────────┘
```

---

## 12. 접근성 (a11y) 체크포인트

- 모든 메시지 버블에 `aria-label="<sender>님: <body 100자 발췌>, <time> <읽음 상태>"`
- 새 메시지 도착 시 `aria-live="polite"` 영역에 announce
- composer textarea `aria-label="메시지 입력"`
- MentionPopover는 cmdk 기본 키보드 접근성 (화살표/Tab/Enter/Esc)
- 전송 버튼 disabled 상태에 `aria-disabled="true"` + 사유 tooltip
- 색상만으로 상태 표현 금지 (읽음=초록 + 체크 아이콘 ✓✓ 동시)

axe-core CI 0 violation 게이트 (M4).
