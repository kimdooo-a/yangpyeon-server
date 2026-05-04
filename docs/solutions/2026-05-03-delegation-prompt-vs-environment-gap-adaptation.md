---
title: 위임 프롬프트와 실제 환경 갭 적응 패턴 — 단일 진실 소스 정독으로 사전 발견 + 인프라 변경 회피 + 정신 유지
date: 2026-05-03
session: 84
tags: [multi-terminal, parallel-development, delegation, baseline-check, infrastructure-avoidance, tdd-pure-function, memory-feedback-baseline-check-before-swarm]
category: pattern
confidence: high
---

## 문제

다른 터미널이 작성한 위임 프롬프트(`docs/handover/s84-parallel-prompt-m4-ui-phase1.md`)에 명시된 기술 스택/규약과 **현재 코드베이스의 실제 상태가 어긋나는** 경우, 어떻게 적응해야 하는가?

본 세션에서 발견된 갭 4건:

| # | 위임 프롬프트 명세 | 실제 환경 | 영향 |
|---|---|---|---|
| 1 | 페이지 위치 `src/app/messenger/` | 모든 페이지 `src/app/(protected)/` 그룹 안 (Next.js App Router route group + auth layout) | 위치 변경 안 하면 auth layout 미상속 |
| 2 | SWR fetch 패턴 | `package.json` 에 `swr` 미설치 | SWR 도입 = npm install + 빌드 + 배포 영향 |
| 3 | `__tests__/*.test.tsx` 렌더 4 케이스 | vitest `environment: "node"` + `include: src/**/*.test.ts` (.tsx 제외) + `@testing-library/react` 미설치 | jsdom + testing-library 도입 = 인프라 PR 규모 |
| 4 | lucide-react `MessageCircle` `Bell` import | `lucide-react@1.7.0` 정상 export | 영향 없음 |

**가능한 함정**:
- (a) 위임 프롬프트 100% 추종 → SWR 설치 + jsdom 설치 + testing-library 설치 = Phase 1 단일 세션 chunk 가 인프라 PR 로 변질, 배포 영향 비대.
- (b) 위임 프롬프트 무시 + 자체 판단으로 진행 → 위임 의도 (TDD 8 PASS, 컴포넌트 분리 책임) 와 어긋남, 다른 터미널 후속 작업 충돌.
- (c) 사용자에게 갭 4건 모두 확인 질문 → 위임 프롬프트의 자율 진행 의도 위반 (`feedback_autonomy` 룰).

## 원인

**위임 프롬프트 작성 시점과 실행 시점 사이의 환경 표류**. 위임 프롬프트는 PRD/wireframes/api-surface 등 **설계 산출물 기반** 으로 작성되는 경우가 많으며, 그 산출물의 가정 (예: SWR 도입, testing-library 설치, 페이지 위치 컨벤션) 과 **실제 코드베이스 상태** 가 항상 일치하는 것은 아니다.

특히 **다른 터미널 (또는 새 세션) 이 위임 프롬프트만 보고 진입** 하면, 작성자는 "당연히 갖춰져 있다고 가정" 한 인프라가 부재한 상황에 노출된다.

본 사례의 위임 프롬프트는 다음 4 가정을 했음:
- 페이지가 그룹 분리 안 됨 (실제는 `(protected)/` 그룹 안에 모두 위치)
- SWR 이 표준 패턴 (실제는 `useState + useEffect + fetch` 패턴이 표준)
- 컴포넌트 렌더 테스트 가능 환경 (실제는 vitest node-only)
- lucide 정상 (실제도 정상 — 유일하게 일치)

## 해결

**3 단계 적응 절차**:

### 1단계 — 단일 진실 소스 정독으로 사전 발견 (정찰)

위임 프롬프트의 §"단일 진실 소스 (반드시 정독)" 섹션이 가리키는 7~10 개 파일을 **한 라운드에 모두 읽음** (Opus 4.7 §1.1 1M context + cache). 정찰 단계에서 갭을 발견해야 적응 결정의 근거가 된다.

본 세션의 정독 7 파일:
- `wireframes.md` / `PRD-v1.md` / `api-surface.md` (3 단일 진실 — 위임 의도)
- `src/lib/messenger/sse.ts` (백엔드 인터페이스)
- `src/components/layout/sidebar.tsx` (수정 대상 + 패턴)
- `src/app/(protected)/page.tsx` (실제 페이지 패턴 — `(protected)` 그룹 발견 + `useState+useEffect+fetch` 패턴 발견)
- `src/app/globals.css` (디자인 토큰)

**핵심**: `package.json` 도 정찰 대상에 포함 (SWR / testing-library / jsdom 설치 여부 확인) + `vitest.config.ts` 도 (environment / include 패턴).

### 2단계 — 갭 분류 + 적응 결정

각 갭에 대해:

| 갭 종류 | 적응 결정 |
|---|---|
| **단일 진실 = 실제 코드** (예: 페이지 위치) | 즉시 변경. 위임 프롬프트의 명세는 outdated. |
| **인프라 변경 = 큰 영향** (예: SWR / jsdom / testing-library 설치) | 회피 + 인프라 PR 후보로 이월. Phase 1 단일 세션 chunk 정신 유지. |
| **무영향** (예: lucide 정상) | 그대로 진행. |

핵심 룰: **인프라 변경(npm install / config 분기 / 빌드 환경 변경) 은 본 chunk 가 책임지지 않음**. 별도 인프라 PR 으로 이월. Phase 1 의 정신 = "작은 진입, 빠른 PASS, 회귀 0".

### 3단계 — 위임 프롬프트의 정신 유지 변환

위임 프롬프트가 명시한 **정신** (예: "props/렌더 4 케이스 8 테스트 PASS") 을 인프라 변경 없이 만족시킬 변환 패턴 발굴.

본 사례의 변환:
- **위임**: ConversationListItem `.test.tsx` props/렌더 4 케이스 (active/unread/muted/mention)
- **변환**: 시각 분류 책임 (className 매핑 + 플래그 결정) 을 순수 함수로 추출 → `getConversationItemClasses(input)` → `.test.ts` 4 케이스로 분류 책임 검증. 컴포넌트는 헬퍼 호출만.

이 변환의 미덕:
- 단일 세션 효율 + 인프라 변경 회피 + TDD 정신 유지 + 향후 컴포넌트 (ComposerVariant / AttachmentVariant / TypingVariant) 도 동일 패턴 재활용.
- **시각 fidelity 검증** (실제 픽셀이 wireframe 과 일치하는지) 은 Phase 2 `kdydesignaudit` / `chrome-devtools-mcp` 로 위임. 본 chunk 는 분류 책임만.

### 4단계 — 인수인계서에 갭 4건 + 적응 결정 명시

다음 세션 (또는 다른 터미널 작성자) 이 본 적응 결정을 추적할 수 있도록 handover 에 §"위임 프롬프트 vs 실제 환경 차이 4건" 표 명시.

## 교훈

1. **위임 프롬프트는 실행 시점의 환경 검증을 보장하지 않는다** — 작성자가 가정한 인프라가 실제 코드베이스에 없을 수 있다. 다른 터미널 진입 직후 단일 진실 소스 정독은 의무이며, **`package.json` + `vitest.config.ts` 같은 인프라 파일도 정독 대상에 포함**.
2. **인프라 변경(npm install / config 분기) 은 본 chunk 책임 아님** — Phase 1 단일 세션 chunk 정신 = "작은 진입, 빠른 PASS, 회귀 0". 인프라 PR 으로 이월하고 본 chunk 는 정신 유지 변환 (예: 순수 함수 추출 + .test.ts) 으로 만족.
3. **memory `feedback_baseline_check_before_swarm` 자매 룰 적용 범위 확대** — 본 룰은 kdyswarm 발사 전 baseline 점검을 강제. 본 사례는 같은 정신을 "다른 터미널 위임 프롬프트 진입 시" 로 확대 적용. 추후 룰 텍스트 업데이트 후보.

## 관련 파일

- `docs/handover/s84-parallel-prompt-m4-ui-phase1.md` — 위임 프롬프트 (commit `0bcc283`).
- `docs/handover/260503-session84-m4-ui-phase1.md` — 본 chunk 인수인계서 (§3 차이 4건 표 + §4 머지 게이트 자체 점검).
- `src/components/messenger/lib/item-classes.ts` + `.test.ts` — 시각 분류 책임 추출 패턴 (재활용 시 참조).
- `src/components/messenger/lib/bubble-variant.ts` + `.test.ts` — 동일.
- `memory/feedback_baseline_check_before_swarm.md` — 자매 룰.
- `memory/feedback_concurrent_terminal_overlap.md` — 자매 룰 (다른 터미널 진입 전 git log/status 점검).
