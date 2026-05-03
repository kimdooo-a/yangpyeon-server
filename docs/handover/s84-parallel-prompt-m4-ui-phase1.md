# 다른 터미널 병렬 작업 프롬프트 — S84-F1 (M4 UI 보드 Phase 1)

> 작성일: 2026-05-03 (세션 84)
> 작성자: 메인 터미널 (Claude Opus 4.7 1M)
> 대상: 다른 터미널의 새 세션 (frontend-only chunk)
> 충돌 영역: **0%** (메인 터미널은 docs + CLAUDE.md + lib/aggregator 진단만)

---

## 컨텍스트 요약

**프로젝트**: 양평 부엌 서버 (`E:\00_develop\260406_luckystyle4u_server`, branch `spec/aggregator-fixes`)

**현재 상태** (세션 83 종료):
- **Track C Messenger Phase 1 백엔드 완성**: M1 데이터 모델 + M2 17 라우트 + M3 SSE conv 8 + user 4 이벤트 + 통합 테스트 32 라이브 PASS.
- **Frontend 미진입**: `src/app/messenger/*` 디렉토리 부재. 사이드바에 "커뮤니케이션" 그룹 미등록.
- **Backend가 이미 라이브**: PM2 ypserver pid 252403 (↺=21), `/api/v1/t/almanac/messenger/...` 17 엔드포인트 정상.

**본 작업의 본질**: backend 가 4개월간 빌드된 Track C Phase 1 의 사용자 가시화 진입. M4 UI 보드 5~7 작업일 chunk 의 **첫 단일 세션 분량** (= Phase 1).

---

## 작업 범위 (Phase 1, 단일 세션 chunk)

### 포함

1. **사이드바 "커뮤니케이션" 그룹 추가** (`src/components/layout/sidebar.tsx`)
   - `{ href: "/messenger", label: "대화", icon: <MessageCircle size={18} />, group: "커뮤니케이션" }`
   - `GROUP_ORDER` 배열에 "커뮤니케이션" 삽입 위치 = "콘텐츠" 다음
   - lucide-react `MessageCircle`, `Bell` 추가 import

2. **`/messenger` 라우트 진입점** (`src/app/messenger/page.tsx`)
   - 데스크톱 ≥1024px: 3-column 레이아웃 (사이드바는 shell, 대화목록 320px + 채팅창 flex-1)
   - 모바일 <768px: 1-column 대화목록 (채팅창은 `/messenger/[id]` 별도 페이지)
   - 빈 상태: "대화를 선택해주세요" 일러스트 + 새 대화 버튼

3. **`/messenger/[id]` 라우트** (`src/app/messenger/[id]/page.tsx`)
   - 채팅창 헤더 (h-14, PageHeader 패턴) — 상대 이름 + avatar + ⋮ 메뉴 + ⓘ 정보
   - 메시지 영역 (flex-1, overflow-y-auto)
   - composer **자리만** (Phase 2 에서 인터랙티브 구현, Phase 1 은 disabled placeholder)

4. **컴포넌트 4종** (`src/components/messenger/*` 신규 디렉토리)
   - `ConversationList.tsx` — 대화목록 컨테이너 (SWR fetch + 실시간 SSE 통합 자리만)
   - `ConversationListItem.tsx` — 개별 행 (avatar + 제목 + 마지막 메시지 + unread badge + 시각)
   - `MessageBubble.tsx` — 텍스트 버블 (본인 brand bg / 상대 surface-200, 1분 묶음)
   - `MessageList.tsx` — 메시지 영역 컨테이너 (역방향 무한스크롤 자리만)

5. **데이터 fetch hook 2종** (`src/hooks/messenger/*` 신규)
   - `useConversations.ts` — SWR `/api/v1/t/<tenantSlug>/messenger/conversations` 조회 + key 이벤트 SSE invalidate (Phase 1 = SWR only, SSE wiring 은 Phase 2)
   - `useMessages.ts` — SWR `/api/v1/t/<tenantSlug>/messenger/conversations/[id]/messages` (cursor-based)

6. **테스트** (`src/components/messenger/__tests__/*.test.tsx` 신규)
   - ConversationListItem props/렌더 4 케이스 (active state, unread badge, muted state, mention 표식)
   - MessageBubble 본인/상대/시스템/회수 4 케이스
   - 최소 PASS 8개

### 제외 (Phase 2 이후)

- composer 인터랙티브 (입력 / 첨부 / 답장 / 멘션) → S84-G (M5)
- SSE 실시간 wiring (메시지 도착 시 SWR invalidate) → Phase 2
- 정보 패널 (`/messenger/[id]/info`) → Phase 2
- 검색 페이지, 알림 종, 차단/신고 다이얼로그 → S84-G/H

---

## 단일 진실 소스 (반드시 정독)

| 문서 | 위치 | 핵심 |
|---|---|---|
| 와이어프레임 | `docs/research/messenger/wireframes.md` | §1 데스크톱 3-column, §2 대화목록 320px, §3 모바일 stack, §4 메시지 버블 5종 |
| PRD | `docs/research/messenger/PRD-v1.md` | §3 핵심 화면, §7 데이터 흐름 시퀀스 |
| API 표면 | `docs/research/messenger/api-surface.md` | 17 엔드포인트 응답 스키마 |
| SSE 키 빌더 | `src/lib/messenger/sse.ts` | `convChannelKey`, `userChannelKey`, 12 이벤트 union |
| 디자인 토큰 | `src/app/globals.css` | surface-100/200/300, brand `#2D9F6F`, text-primary `#1A1815` |
| 사이드바 패턴 | `src/components/layout/sidebar.tsx:48-87` | navItems 배열 + GROUP_ORDER + 권한 경로 |
| PageHeader 패턴 | `src/components/layout/` 또는 기존 `/processes/page.tsx` | h-14 헤더 컨벤션 |

---

## 기술 결정 (사전 합의)

| 항목 | 결정 | 근거 |
|---|---|---|
| 데이터 fetch | **SWR** | 기존 프로젝트 패턴 (`src/hooks/` 다수 SWR 사용) |
| 상태 관리 | **SWR cache + useState** | redux/zustand 도입 X (Phase 1 단순) |
| URL 파라미터 | `[tenant]` slug — 운영 콘솔 본인 접근은 `'default'` sentinel | `memory/project_tenant_default_sentinel.md` |
| Tenant 슬러그 추출 | `useCurrentUser` hook 의 `defaultTenantSlug` 또는 `'almanac'` 하드코드 (Phase 1 한정) | 운영 콘솔용 generic UI 는 Phase 3 |
| SSR vs CSR | **CSR (`"use client"`)** | SWR + EventSource 클라이언트 의존 |
| Tailwind class | 기존 토큰 `bg-surface-200`, `text-primary`, `text-brand` 우선 | 임의 색상 금지 |
| 접근성 | aria-live=polite (메시지 영역) + role=button (대화 행) + 한국어 lang | `kdya11y` 통과 목표는 Phase 2 |

---

## 진입 시 첫 행동 (반드시)

1. **베이스라인 점검** (memory `feedback_concurrent_terminal_overlap`):
   ```powershell
   git status --short
   git log --oneline -5
   git pull origin spec/aggregator-fixes
   ```

2. **메인 터미널과의 충돌 0 확인**:
   - 메인 터미널 작업 영역 = `docs/MASTER-DEV-PLAN.md` 부록 + `CLAUDE.md` 신규 룰 섹션 + `src/lib/aggregator/dedupe.ts` 분석
   - 본 터미널 = `src/app/messenger/*` (신규) + `src/components/messenger/*` (신규) + `src/hooks/messenger/*` (신규) + `src/components/layout/sidebar.tsx` (한 줄 추가)
   - 겹치는 파일 = sidebar.tsx 1개. **본 터미널이 sidebar 변경 commit 시점에 메인 터미널은 sidebar 미수정** (충돌 0).

3. **TDD 게이트** (memory `feedback_baseline_check_before_swarm` 자매 룰):
   - 컴포넌트 4종 각각 RED → GREEN 순서.
   - 시각적 픽셀 정확도 검증은 Phase 2 (kdydesignaudit 또는 chrome-devtools-mcp).

4. **빌드 검증**:
   - `npx tsc --noEmit` 0 errors
   - `npm run build` 통과 (production build, standalone 모드)
   - `npx vitest run src/components/messenger/__tests__/` PASS

5. **세션 종료 (`/cs`)**:
   - 인수인계서 `docs/handover/260503-session84-m4-ui-phase1.md`
   - `docs/handover/_index.md` row 추가
   - `docs/handover/next-dev-prompt.md` 갱신 (S84-F2 Phase 2 = composer + SSE wiring)
   - `docs/status/current.md` 세션 요약표 1행 추가
   - 단일 commit `feat(messenger): M4 UI 보드 Phase 1 — 사이드바 + 대화목록 + 채팅창 기본 (TDD 8)`

---

## 머지 게이트 (PR 본문 필수 체크리스트)

- [ ] 모든 신규 컴포넌트가 함수 컴포넌트 + TypeScript strict
- [ ] 색상은 globals.css 토큰만 사용 (#FFFFFF 등 hex 직접 X)
- [ ] 17 backend 엔드포인트 중 사용한 것을 PR 본문에 명시
- [ ] backend `tenantSlug` 추출 방식 (`useCurrentUser` 또는 하드코드 `'almanac'`) 명시
- [ ] sidebar.tsx 변경이 ADMIN_ONLY_PATHS / MANAGER_PLUS_PATHS 권한 매트릭스에 영향 없음 확인
- [ ] WSL 빌드+배포는 본 세션 종료 시 SKIP (다음 세션 또는 운영자 본인). PR 머지 후 배포.

---

## 추가 컨텍스트

- 기존 frontend 패턴 참고: `src/app/filebox/page.tsx` (라우트 진입점 + 컴포넌트 분리 + SWR + Toast 통합)
- 다크 테마 일관성: 모든 색상 토큰 기반, `dark:` 변형 자동
- 한국어 UI 강제 (CLAUDE.md 프로젝트 규칙)
- 모든 주석 한국어
- 커밋 메시지 한국어 (예: `feat(messenger): M4 UI 보드 Phase 1 ...`)

---

## 본 프롬프트의 위치

`E:\00_develop\260406_luckystyle4u_server\docs\handover\s84-parallel-prompt-m4-ui-phase1.md`

세션 종료 시 이 파일을 별도 commit 하거나, 인수인계서에 흡수 후 삭제해도 무방.
