# Yangpyeong Messenger — PRD v1.0

> **Owner**: 김도영 (1인 운영자) · **소스**: 세션 63 (2026-04-26) · **승인**: ADR-030 ACCEPTED
> **유효 기간**: Phase 1 마일스톤 6주 + Phase 2 진입 결정까지
> **분할 산출물 색인**: `_index.md`

---

## 1. Vision & Positioning

### 1.1 Mission (한 줄)
> **"양평 BaaS 위에서, tenant별로 완벽 격리된 라인-급 협업 메신저를 1인 운영자가 손가락 하나로 켜고 끌 수 있게 한다."**

### 1.2 라인/카카오와의 차별화 4축

| 차원 | LINE | KakaoTalk | **Yangpyeong Messenger** |
|---|---|---|---|
| 호스트 모델 | 글로벌 SaaS, single tenant | 글로벌 SaaS, single tenant | **Closed multi-tenant BaaS, tenant=consumer project** |
| 격리 | 없음 | 없음 | **DB row-level (RLS) + tenant_id 첫 컬럼 강제 (ADR-022)** |
| 운영 주체 | 라인주식회사 | 카카오 | **단일 운영자 + Claude(자동화)** |
| 확장 모델 | SDK + Mini-app | 챗봇 + 비즈채널 | **Plugin manifest (`packages/tenant-*`) + cron/quota 격리** |

### 1.3 Phase별 출시 전략 (ADR-030 옵션 C)

```
Phase 1 (4-6주, 양평 콘솔 내장 코어)
  └─ 같은 tenant 내 사용자 간 1:1, 그룹, 답장, 멘션, 첨부, 검색
       │
       ▼ 모델 검증 + DAU≥30 또는 컨슈머 앱 요구
Phase 2 (Plugin 분리 + 풍부 표현)
  └─ packages/tenant-messenger/ 분리. 별도 메신저 앱 컨슈머의 백엔드 호스트
       │
       ▼ WAU 1000+ + 통화 비즈니스 케이스 명확
Phase 3 (고급 기능)
  └─ WebRTC 통화, E2E 암호화, 다중 디바이스 sync, 챗봇 SDK
```

### 1.4 비목표 (Non-goals)

- **Phase 1**: 통화, E2E, 다중 디바이스 sync, 챗봇 SDK, 외부 webhook 수신, 메시지 FTS, GIF 검색, OCR, 백업/복원, IAP/스티커샵
- **Phase 2까지 보류**: 채널 모더레이션 큐, fwd-to-LINE/Kakao, 캘린더 통합
- **영구 제외**: 광고 모듈, 광고 ID 추적, 위치 공유(개인정보 리스크), 송금

근거: 1인 운영자가 6주 내 안정 운영 가능한 절대 최소 표면.

---

## 2. 페르소나 & 시나리오 요약

상세는 `personas-scenarios.md` 참조. 4개 페르소나 (P1 운영자 / P2 협업자 / P3 컨슈머 사용자 / P4 봇), Phase 1 시나리오 12건 + Phase 2 12건.

핵심:
- **P1 운영자**: 신고 큐 1클릭 차단, p95 SLO 알림, quota 80% 자동 throttle
- **P2 협업자**: 새 동료 검색(cross-tenant 차단), 답장/멘션, 5장 drag&drop, 오프라인 재시도
- **P3 컨슈머 사용자** (Phase 2+): QR 친구추가, 알림 끄기, 차단/신고
- **P4 봇** (Phase 2+): idempotent 송신, slash command

---

## 3. 정보 구조(IA) & 사이드바

### 3.1 신규 사이드바 그룹 — **"커뮤니케이션"**
사이드바 두 번째 위치(운영 그룹 아래). 향후 공지/이메일/푸시 캠페인 자연 확장 그룹.

| 아이콘 | 라벨 | 경로 | 권한 |
|---|---|---|---|
| MessageCircle | 대화 | `/messenger` | 인증 사용자 |
| Users | 연락처 | `/messenger/contacts` | 인증 사용자 |
| Bell | 알림 설정 | `/messenger/settings` | 인증 사용자 |
| Shield | 신고/차단 운영 | `/admin/messenger/moderation` | MANAGER_PLUS |
| Activity | 메신저 헬스 | `/admin/messenger/health` | OWNER/ADMIN |

### 3.2 화면 레이아웃 분기
| 화면폭 | 레이아웃 | 근거 |
|---|---|---|
| ≥1024px | **3-column**: 좌 320 대화목록 + 중 채팅 + 우 320 정보패널(토글) | 데이터-heavy 페이지 일관성 |
| 768~1023px | **2-column**: 좌 280 + 우 채팅. 정보패널 drawer overlay | `lg` 브레이크포인트 |
| <768px | **1-column stack**: 라우트 단위 push | 라인 모바일 패턴 (URL 의미론) |

상세 와이어는 `wireframes.md`.

### 3.3 라인 vs 카카오 시각 절충 (양평 brand)
| 요소 | 채택 | 근거 |
|---|---|---|
| 본인 버블 | brand #2D9F6F | 양평 일관성 |
| 상대 버블 | surface-200 | 다크 호환 |
| 모서리 | 12px radius (꼬리 없음) | 라인의 미니멀 |
| 시간 표시 | 1분 묶음 그룹화 | 카카오식 (정보 밀도) |
| 읽음 표시 | 안 읽은 N명 숫자 | 카카오식 (그룹 우월) |
| 답장 UI | 메시지 위 인용 카드 | 라인식 (시각 분리) |
| 이모지 반응 | P1=6종 고정, P2=전체 | 라인 패턴 |

---

## 4. 핵심 기능 (Phase별 요약)

### 4.1 Phase 1 MVP — 17개 기능
1:1 DM, 그룹 채팅 ≤100명, 메시지 송수신, 읽음 표시, 타이핑 인디케이터, 첨부(이미지/파일), 답장, 편집(15분), 회수(24h self / admin 무제한), 멘션(@), 본문 검색(LIKE 30일), 핀/뮤트, 차단, 신고, in-app 알림, Web Push(P1.5), 프로필.

각 기능의 (UX/API/DB/실시간/엣지케이스)는 `api-surface.md` + `data-model.md` 참조.

### 4.2 Phase 2 — Plugin 분리 + 풍부 표현
- packages/tenant-messenger/ 분리
- 이모지 반응 전체, 스티커, GIF, 음성 메모(WebAudio→ogg/opus)
- 채널(1:N), 회수 15분 전체회수, 즐겨찾기/북마크, QR 친구 추가
- PG LISTEN/NOTIFY 백본 전환 (ADR-031)

### 4.3 Phase 3 — 고급
WebRTC + TURN, Signal Protocol E2E, 다중 디바이스 sync, 백업/복원, 챗봇/슬래시, 메시지 FTS.

---

## 5. 데이터 모델 (요약)

상세는 `data-model.md`. 핵심:
- **enum 6종**: ConversationKind, ConversationMemberRole, MessageKind, AttachmentKind, AbuseReportStatus, AbuseReportTargetKind
- **Phase 1 모델 11종**: Conversation, ConversationMember, Message, MessageAttachment, MessageMention, MessageReceipt, UserBlock, AbuseReport, NotificationPreference, (P1.5) PushSubscription, (P1.5) Notification
- **Phase 2 추가**: MessageReaction, MessageBookmark
- 모든 테이블 `tenantId` 첫 컬럼 + dbgenerated default + RLS `tenant_isolation` (ADR-022 §1, ADR-029)
- 첨부는 기존 `File` 모델 FK 재사용 (filebox)

---

## 6. API 설계 (요약)

상세는 `api-surface.md`. 핵심:
- Phase 1: `/api/v1/conversations[/:id[/messages|members|typing|receipts]]`, `/api/v1/messages/search`, `/api/v1/user-blocks`, `/api/v1/abuse-reports`, `/api/v1/notification-preferences`, `/api/v1/admin/messenger/reports`
- Phase 2: `/api/v1/t/<tenant>/messenger/...` (withTenant 가드)
- Keyset pagination (cursor=base64 of `{createdAt,id}`), 기본 limit 30, max 100
- clientGeneratedId 멱등 (UNIQUE 제약 위반 시 기존 fetch return)

---

## 7. 실시간 아키텍처 (요약)

### 7.1 Phase 1 — In-memory EventEmitter (`src/lib/realtime/bus.ts`)
채널 키:
- `conv:<convId>` (ConversationMember 권한): message.created/updated/deleted, receipt.updated, typing, member.joined/left
- `user:<userId>:notif` (self only): mention.received, dm.received, report.resolved
- `presence:<tenantId>` (tenant member): user.online/offline

Subscribe 검증은 `src/app/api/sse/realtime/channel/[channel]/route.ts`에서 channel key 파싱 + 권한 확인 게이트.

### 7.2 Phase 2 — PG LISTEN/NOTIFY (ADR-031, kdyspike #1 결과 첨부)
- Trigger: 다중 노드 또는 SSE 200+ 도달
- NOTIFY는 메타만(8KB 회피), SSE handler가 본문 fetch
- LISTEN 전용 dedicated connection 1개

---

## 8. 마이그레이션 전략 (요약)

상세는 `milestones.md`. 마이그 10건, 단계별 1개씩 deploy + RLS 검증 쿼리 자동 실행. CLAUDE.md 운영 정책에 따라 Claude가 직접 적용.

```
20260501000000_messenger_phase1_enums              # additive
20260501010000_messenger_phase1_conversations      # + RLS
20260501020000_messenger_phase1_messages           # + RLS
20260501030000_messenger_phase1_safety             # + RLS
20260501040000_messenger_phase1_indexes_partial    # GIN trgm
20260501050000_messenger_phase1_grants             # app_runtime/migration
20260501060000_messenger_phase1_seed_admin_conv    # (선택)
20260508000000_messenger_phase15_push              # push_subscriptions
20260515000000_messenger_phase15_reactions         # reactions + bookmarks
20260601000000_messenger_phase2_listen_notify      # NOTIFY 트리거
```

---

## 9. UI 컴포넌트 트리 (요약)

```
src/components/messenger/
├── conversation-list/
├── conversation-view/   (MessageStream 가상 스크롤)
├── composer/            (Mention popover = cmdk)
├── info-panel/
├── dialogs/             (@base-ui/react)
└── hooks/               (useConversation, useMessages, useTyping, useReadReceipt, usePresence)
```

상세 props 시그니처는 `api-surface.md` §UI Hook 섹션.

---

## 10. 비기능 요구 (NFR)

| 차원 | 목표 (Phase 1) |
|---|---|
| 송신 p95 | < 200ms |
| 채팅 진입 LCP | <500ms cached / <1500ms cold |
| 검색 | <800ms (LIKE 30일, 10k msg) |
| 동시성 | tenant당 SSE 200, 분당 메시지 1000 |
| MIME | filebox 화이트리스트 상속 |
| XSS | render 시 DOMPurify |
| 접근성 | WCAG 2.1 AA, aria-live=polite |
| 오프라인 | composer LocalStorage queue + clientGeneratedId flush |

---

## 11. 관측성 / KPI

### 11.1 KPI (3개월)
- DAU/tenant ≥ 60% 활성 사용자
- Messages/day/tenant ≥ 200 평균
- 송신 성공률 ≥ 99.5%
- p50/p95 송신 latency ≤ 100/200ms

### 11.2 Audit 이벤트 카탈로그 (10종)
`messenger.conversation_created` / `member_added` / `member_removed` / `message_sent` / `message_edited` / `message_deleted` / `user_blocked` / `report_filed` / `report_resolved` / `quota_warning`

### 11.3 Prometheus 메트릭 (Phase 1.5)
- `messenger_messages_sent_total{tenant, kind}`
- `messenger_sse_connections{tenant}` (gauge)
- `messenger_attachment_upload_failures_total{tenant, reason}`
- `messenger_message_send_duration_seconds` (histogram)

---

## 12. 마일스톤 / 게이트 (Phase 1 6주)

상세는 `milestones.md`. 핵심:
- M0 (사전): ADR-030 작성 ✓ + kdyspike #1 (PG NOTIFY+SSE)
- M1 (W1): 데이터 모델, 마이그 #1~6
- M2 (W2): API CRUD + 멱등성 + 권한
- M3 (W3): SSE 실시간, 200 동시 connection 부하 테스트
- M4 (W4): UI 보드 (디자인 리뷰, axe-core 0)
- M5 (W5): 첨부+답장+멘션+검색 (E2E playwright 5건)
- M6 (W6): 알림+차단/신고+운영자 패널 (kdysharpedge 보안 리뷰)

---

## 13. Open Questions

| # | 미결정 | 권장 | 결정 기한 |
|---|---|---|---|
| Q1 | Web Push 방식 | VAPID self-host | M5 |
| Q2 | 메시지 검색 엔진 | LIKE→tsvector→Meilisearch 단계적 | Phase 2 |
| Q3 | 봇 SDK 형태 | Edge Function | Phase 3 |
| Q4 | 프로필 사진 처리 | filebox 그대로 | M4 |
| Q5 | 그룹 인원 한도 | 100 시작 | 부하 테스트 후 |
| Q6 | typing indicator 저장 | 무저장 publish only | M3 |
| Q7 | iOS Safari Web Push | PWA 설치 강제 | M6 |
| Q8 | 회수 시 첨부 cleanup | 30일 cron | M5 |
| Q9 | Phase 2 plugin 분리 시점 | DAU≥30 또는 컨슈머 요구 | DAU 측정 후 |
| Q10 | E2E 채택 시 검색 호환 | server-side 포기 | Phase 3 직전 |

---

## 14. 리스크 & 완화

| Risk | 확률 | 영향 | 완화 |
|---|---|---|---|
| In-memory bus 단일 노드 한계 | 중 | 다중 인스턴스 메시지 누락 | ADR-025 명시, P2 NOTIFY 전환 ADR 사전 |
| 첨부 폭주 → 디스크 폭발 | 중 | 운영비 + 가용성 | tenant 단위 quota, 매일 알림 |
| 악의적 신고 폭주 | 저 | 운영자 큐 마비 | 신고 rate-limit, 동일 사용자 UNIQUE 거부 |
| 메시지 검색 LIKE N×M | 고 | 응답 지연 | 30일 윈도 강제 + GIN trgm |
| 신규 테이블 RLS 누락 | 저 | 치명적 — cross-tenant 노출 | CI lint: prisma diff → RLS policy presence |
| clientGeneratedId 중복 race | 중 | 같은 메시지 2번 | DB UNIQUE + 충돌 시 fetch return |
| SSE connection leak | 중 | 메모리 누수 | bus.subscribers 모니터링, 30분 idle 강제 종료 |
| LINE/Kakao UI 유사성 | 저 | 법적 (희박) | 명시적 시각 차별화, 비공개 BaaS 한정 |

---

## 15. 결정 근거 한 줄 요약

1. **In-memory bus 유지 (P1)** — ADR-025 단일 노드, 신규 인프라 0
2. **filebox 재사용** — tenant_id RLS 자동 상속
3. **clientGeneratedId 멱등** — 라인 LocalMessageId, 오프라인 안전
4. **Phase 1 임베디드 → P2 plugin 분리** — premature abstraction 회피, ADR-024 §4.2 패턴
5. **그룹 100명 시작** — 부하 테스트 후 확장
6. **이모지 6종 P1** — 라인식, 캐싱·UI 단순
7. **통화/E2E P3 보류** — 1인 운영 부담 비대칭
8. **카카오식 읽음 숫자 + 라인식 답장 카드** — best-of-both
9. **검색 LIKE→tsvector→engine** — 데이터량 따라 진화
10. **사이드바 "커뮤니케이션" 신설** — 향후 공지/이메일/푸시 자연 확장
11. **kdyspike #1 사전** — Phase 1 도중 백본 한계 발견 비용 회피
12. **마이그 단계별 1개씩 deploy** — 분할 적용 + RLS 검증
13. **ADR-030 사전 작성** — 6개월 후 plugin 분리 시 결정 추적
