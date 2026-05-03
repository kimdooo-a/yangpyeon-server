# 세션 84 인수인계서 — M4 UI 보드 Phase 1 (다른 터미널 작업)

> 작성일: 2026-05-03 (세션 84, 다른 터미널)
> 영역: Track C Messenger Phase 1 — M4 UI 보드 첫 chunk
> 충돌 영역: 0% (메인 터미널 = `lib/aggregator/dedupe` + `CLAUDE.md` PR 룰 + `wave-tracker.md`, 본 세션 = `src/app/(protected)/messenger/*` + `src/components/messenger/*` + `src/hooks/messenger/*` + `sidebar.tsx` 1 그룹 추가)
> 단일 commit 예정 (다음 단계).

---

## 0. 컨텍스트

세션 80~82 에서 backend (M1 데이터 모델 + M2 17 라우트 + M3 SSE conv 8 + user 4 이벤트 + 통합 테스트 32 라이브 PASS) 완성. 세션 83 에서 SSE 라이브 활성화 + S82 follow-up 6 task 압축.

**M4 UI 보드 = 5~7 작업일 chunk** (PRD `docs/research/messenger/wireframes.md` §1~§5). 본 세션은 그 첫 단일 세션 분량 = **Phase 1**. 위임 프롬프트 (`docs/handover/s84-parallel-prompt-m4-ui-phase1.md`, commit `0bcc283`) 정독 후 진행.

진입 시점 backend 라이브 상태:
- PM2 ypserver pid 252403 (↺=21), 17 라우트 + SSE events route 정상.
- 운영 콘솔(stylelucky4u.com) 본인 접근 = `'default'` tenant (memory `project_tenant_default_sentinel`).

---

## 1. 산출물 — 13 파일 (12 신규 + 1 수정)

### 1.1 사이드바 (1 수정)
- `src/components/layout/sidebar.tsx` — "커뮤니케이션" 그룹 신설 ("콘텐츠" 다음). 4 항목:
  - `/messenger` (대화, MessageCircle, 인증 사용자)
  - `/messenger/settings` (알림 설정, Bell, 인증 사용자, Phase 2 활성)
  - `/admin/messenger/moderation` (신고/차단 운영, ShieldCheck, **MANAGER_PLUS_PATHS** 추가)
  - `/admin/messenger/health` (메신저 헬스, Activity, **ADMIN_ONLY_PATHS** 추가)
- `GROUP_ORDER` 에 "커뮤니케이션" 삽입 (콘텐츠 다음).
- lucide-react `MessageCircle` / `Bell` / `Activity` 신규 import.

### 1.2 시각 분류 헬퍼 + 단위 테스트 (4 파일, **8 PASS**)
- `src/components/messenger/lib/item-classes.ts` — `getConversationItemClasses(input)` 순수 함수. (active container / unread badge / muted body / mention mark) 5 출력 필드.
- `src/components/messenger/lib/bubble-variant.ts` — `getMessageBubbleVariant(input)` 순수 함수. 4 variant 분류 (own/other/system/recalled, recalled 가 kind 우선).
- `src/components/messenger/lib/item-classes.test.ts` — 4 케이스 (active state / unread badge / muted state / mention mark with unread guard).
- `src/components/messenger/lib/bubble-variant.test.ts` — 4 케이스 (own bg-brand / other bg-surface-200 / system center / recalled italic + 본인/상대 정렬 보존).

**TDD 전략 결정**: vitest config `environment: "node"` + include `src/**/*.test.ts` (.tsx 미포함) + `@testing-library/react` 미설치 환경. 위임 프롬프트의 "props/렌더 4 케이스" 정신을 유지하면서 인프라 변경 회피 → **시각 분류 로직을 순수 함수로 추출**, .test.ts 로 PASS. 컴포넌트 자체는 헬퍼 호출만. 시각 fidelity 검증은 Phase 2 `kdydesignaudit` / `chrome-devtools-mcp`.

### 1.3 컴포넌트 4종 (4 파일)
- `src/components/messenger/ConversationListItem.tsx` — 64px row + 아바타 placeholder + displayName + lastMessageSnippet + 시간 + unread badge + muted/mention 아이콘. 헬퍼 `getConversationItemClasses` 호출. role=button + aria-label + Enter/Space 키보드.
- `src/components/messenger/ConversationList.tsx` — `useConversations()` SWR-like fetch. 로딩 (skeleton 4행) / 에러 (다시 시도 버튼) / 빈 상태 (💬 + "새 대화 시작") / 목록 (divide-y) 4 분기. DIRECT 의 peer label = 첫 8자 prefix (Phase 2 = User name lookup).
- `src/components/messenger/MessageBubble.tsx` — 헬퍼 `getMessageBubbleVariant` 호출 + 본문 분기 (recalled = "🚫 회수된 메시지입니다") + 시간 (HH:MM) + aria-label.
- `src/components/messenger/MessageList.tsx` — `useMessages(convId)` fetch + 첫 로드 시 맨 아래 자동 스크롤 + role=log + aria-live=polite. backend desc(createdAt) → 컴포넌트 reverse 로 화면 asc.

### 1.4 데이터 fetch hook 2종 (2 파일)
- `src/hooks/messenger/useConversations.ts` — `useState + useEffect + fetch` 패턴 (SWR 미설치). `/api/v1/t/default/messenger/conversations`. reload() 트리거. `ConversationRow` 인터페이스 export (id/kind/title/lastMessageAt/archivedAt/members[]).
- `src/hooks/messenger/useMessages.ts` — 동일 패턴. `/api/v1/t/default/messenger/conversations/:id/messages?limit=30`. `MessageRow` 인터페이스 (kind/body/senderId/replyToId/clientGeneratedId/editedAt/editCount/deletedAt/deletedBy/createdAt/attachments/mentions). `hasMore` 노출 (Phase 2 loadOlder 진입점).

### 1.5 라우트 2종 (2 파일)
- `src/app/(protected)/messenger/page.tsx` — 데스크톱 ≥lg: 좌 320px 대화목록 + 우 빈상태 (💬). 모바일 <lg: 대화목록 전체 폭. 새 대화 버튼 disabled (Phase 2).
- `src/app/(protected)/messenger/[id]/page.tsx` — 데스크톱 ≥lg: 좌 320px 대화목록 (active 강조) + 우 채팅창. 모바일 <lg: 채팅창만 + ← 뒤로가기. 채팅창 헤더 h-14 (avatar placeholder + 대화 ID prefix + ⋮ + ⓘ disabled). MessageList + composer placeholder (📎/😊/@/textarea/전송 모두 disabled, "Phase 2 (S84-G) 활성화 예정" 안내).

**위치 결정 = `(protected)/messenger/`**: 위임 프롬프트는 `src/app/messenger/` 라고 했지만 실제 모든 페이지가 `src/app/(protected)/` 그룹 안에 위치 (auth layout 상속). protected 그룹에 넣어 인증/RBAC layout 자동 적용.

---

## 2. 검증 결과

| 단계 | 결과 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run src/components/messenger/lib/` | **8 PASS / 0 fail** (신규 헬퍼) |
| `npx vitest run` (전체 회귀) | 547 pass + 91 skip / 41 file pass + 7 skip (회귀 0, 신규 8 추가) |
| `npm run build` (production) | PASS, `/messenger` (ƒ Dynamic) + `/messenger/[id]` (ƒ Dynamic) 등록 확인 |

WSL 빌드+배포 = 본 세션 SKIP (위임 프롬프트 명시, 다음 세션 또는 운영자가 PR 머지 후 진행).

---

## 3. 위임 프롬프트 vs 실제 환경 차이 4건

| # | 프롬프트 명세 | 실제 환경 | 채택 |
|---|---|---|---|
| 1 | 페이지 위치 `src/app/messenger/` | 모든 페이지 `src/app/(protected)/` 그룹 안 | `(protected)/messenger/` 로 변경 — auth layout 상속 |
| 2 | SWR fetch | `package.json` 에 `swr` 미설치 | `useState + useEffect + fetch` (use-current-user 패턴) |
| 3 | `__tests__/*.test.tsx` 렌더 테스트 | vitest `environment: "node"` + include `**/*.test.ts` (.tsx 제외) + `@testing-library/react` 미설치 | 시각 분류 로직 순수 함수 추출 + `.test.ts` 8 케이스 |
| 4 | lucide-react `MessageCircle` `Bell` import | `lucide-react@1.7.0` 정상 export | 그대로 + `Activity` `ShieldCheck` `Plus` `ChevronLeft` `MoreVertical` `Info` `Paperclip` `Smile` `AtSign` `BellOff` 추가 |

차이 #1 #2 #3 은 **인프라 변경 회피 결정** — Phase 1 단일 세션 chunk 의 정신 (작은 진입, 빠른 PASS) 유지. SWR 도입과 jsdom + testing-library 설치는 별도 인프라 PR 후보 (Phase 2 진입 직전).

---

## 4. PR 머지 게이트 (위임 프롬프트 §"머지 게이트") 자체 점검

- [x] 모든 신규 컴포넌트가 함수 컴포넌트 + TypeScript strict (`tsc --noEmit` exit 0).
- [x] 색상은 globals.css 토큰만 사용 (bg-brand, bg-surface-100/200/300, text-gray-500/800, border-border, brand/5 등). hex 직접 사용 0건 grep 확인.
- [x] 17 backend 엔드포인트 중 사용한 것 = `GET /api/v1/t/default/messenger/conversations` (1) + `GET /api/v1/t/default/messenger/conversations/:id/messages` (1) = **2종**. 나머지 15 종 (POST 송신/편집/회수/typing/receipts/members/blocks/reports/preferences/admin) 은 Phase 2.
- [x] tenantSlug 추출 방식 = `'default'` 하드코드 (운영 콘솔 본인 접근 = default tenant, memory `project_tenant_default_sentinel`). Phase 3 = 컨슈머별 generic UI.
- [x] sidebar.tsx 변경이 권한 매트릭스에 영향 0 — 신규 4 path 중 2 (`/admin/messenger/moderation`, `/admin/messenger/health`) 만 MANAGER_PLUS / ADMIN_ONLY 추가, 기존 경로 영향 없음.
- [x] WSL 빌드+배포 SKIP (위임 프롬프트 명시).

---

## 5. 이월 (S85+ 우선순위)

### P0 (Phase 2 진입 단일 chunk = M4 UI Phase 2, 5~6 작업일)
1. **Composer 인터랙티브** — textarea autosize / Enter 송신 + Shift+Enter 줄바꿈 / clientGeneratedId UUIDv7 / 낙관적 업데이트 / 답장 인용 카드 / 멘션 popover (cmdk).
2. **SSE wiring** — `useSse({ url: /api/sse/realtime/channel/conv:<id> })` 로 conv 채널 구독 → message.created/updated/deleted 캐시 invalidate. user 채널 구독으로 mention/dm 알림 종 활성화.
3. **User name lookup** — DIRECT peer name + GROUP member 표시. 별도 `/api/v1/t/<tenant>/users?ids=...` 신규 또는 backend conversations include 확장 결정.

### P1 (M4 UI Phase 3)
4. **정보 패널** (`/messenger/[id]/info`) — 우 320px (lg only). 첨부 갤러리 + 핀 메시지 + 알림 끄기 + 차단/신고.
5. **검색** (`/messenger/search?q=...`) — 30일 윈도, conv 필터 + Cmd+K 진입.
6. **컨슈머 generic UI** — `'default'` 하드코드를 `useCurrentUser` 의 `defaultTenantSlug` 또는 URL 파라미터 (`/t/<slug>/messenger/...`) 로 일반화 (Phase 3 plugin 마이그레이션 대비).

### P2 (인프라 PR 후보)
7. **SWR 도입** — invalidate / 캐시 동기화 / 자동 재시도 표준화. 현재 `useState + useEffect + fetch` 는 Phase 1 한정.
8. **jsdom + @testing-library/react 도입** — vitest config 환경 분기 (server lib 는 node, ui 는 jsdom). 컴포넌트 렌더 테스트로 시각 fidelity 검증 자동화.
9. **모바일 사이드바 메뉴 전환** — 모바일 햄버거 메뉴에서 "커뮤니케이션" 그룹 가시성.

### P2 (운영 + 회귀)
10. **WSL 빌드+배포** — PR 머지 후 `/ypserver` 스킬로 배포. PM2 ypserver 재시작 → `/messenger` 라이브 진입 검증 + 사이드바 신규 그룹 노출 확인.
11. **시각 fidelity 검증** — `kdydesignaudit` 또는 `chrome-devtools-mcp` 로 wireframe §1~§5 정확도 측정.
12. **a11y 게이트** — `kdya11y` 로 WCAG 2.2 AA 통과 확인 (현재 aria-label/role/keyboard 기본만).
13. **컨슈머 가입자 수 분기** — 첫 컨슈머 Almanac (almanac-flame.vercel.app) 가 메신저를 사용한다면 `/api/v1/t/almanac/messenger/...` 직접 호출. 운영 콘솔의 'default' 와 분리.

---

## 6. 검증 사슬 (참고)

- `wireframes.md` §1 데스크톱 3-column → 라우트 2종 + ConversationList 320px + 채팅창 flex-1.
- `wireframes.md` §2 대화목록 64px row + active border-l-2 brand → ConversationListItem + getConversationItemClasses.
- `wireframes.md` §3 모바일 stack → page.tsx 의 `lg:` 분기 + `[id]/page.tsx` 의 ChevronLeft 뒤로가기.
- `wireframes.md` §4.1/4.4/4.5 텍스트/시스템/회수 버블 → MessageBubble + getMessageBubbleVariant 4 variant.
- `wireframes.md` §11.1 빈 상태 / §11.2 skeleton / §11.3 네트워크 오류 → ConversationList 4 분기.
- `wireframes.md` §12 a11y → role=button/log + aria-label/aria-current/aria-live=polite/aria-busy + Enter/Space 키보드.
- `PRD-v1.md` §3.1 신규 사이드바 그룹 "커뮤니케이션" → sidebar.tsx 4 항목 (대화/알림설정/신고운영/헬스).
- `PRD-v1.md` §9 UI 컴포넌트 트리 → src/components/messenger/{ConversationList,ConversationListItem,MessageList,MessageBubble} + src/hooks/messenger/{useConversations,useMessages}.
- `api-surface.md` §2.1 conversations + §2.3 messages → useConversations + useMessages.
- `sse.ts` 채널 키 빌더 → Phase 2 wiring 진입점 확정 (본 세션 미사용).

---

## 7. 본 세션 교훈

- **위임 프롬프트와 실제 환경의 갭 4건**을 사전에 7개 single source 정독으로 발견 → 인프라 변경 회피 + 정신 유지 결정. 만약 SWR/jsdom 설치까지 진입했다면 Phase 1 단일 세션 chunk 가 무너짐 (배포 + 회귀 책임 비대).
- **TDD GREEN 단계 = 헬퍼 + 테스트 일괄 작성 후 한 번에 PASS** — 단일 세션 효율과 RED→GREEN 정신 양립.
- **컴포넌트 시각 분류 로직을 순수 함수로 격리** — vitest "environment: node" 환경에서도 단위 테스트 가능. 이 패턴은 향후 모든 messenger 컴포넌트 (Phase 2 의 ComposerVariant, AttachmentVariant 등) 에 재활용.
- 메모리 룰 신규 후보 = 없음 (기존 `feedback_baseline_check_before_swarm` + `feedback_concurrent_terminal_overlap` 가 그대로 적용됨).

---

## 8. 다음 세션 단일 진입점

`docs/handover/next-dev-prompt.md` § "S85 첫 작업 우선순위" 갱신 (다음 단계).
