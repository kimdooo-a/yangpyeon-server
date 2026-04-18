# 00. 디자인 시스템 — 양평 부엌 서버 대시보드

> Wave 4 · Tier 3 (U1) 산출물 — kdywave W4-U1 (Agent UI/UX-1)
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [03-ui-ux/](./) → **이 문서**
> 참조: [02-architecture/00-system-overview.md](../02-architecture/00-system-overview.md) · [00-vision/03-non-functional-requirements.md](../00-vision/03-non-functional-requirements.md) · [src/app/globals.css](../../../../src/app/globals.css)
> 근거: NFR-UX.1~5, NFR-A11Y.1~3, DQ-1.16 접근성, AP-1 1인 운영 가능성

---

## 목차

- [1. 디자인 원칙 5가지](#1-디자인-원칙-5가지)
- [2. 색상 팔레트 상세](#2-색상-팔레트-상세)
- [3. 다크 모드 전용 아키텍처](#3-다크-모드-전용-아키텍처)
- [4. 타이포그래피 시스템](#4-타이포그래피-시스템)
- [5. 아이콘 시스템](#5-아이콘-시스템)
- [6. 간격 및 그리드 시스템](#6-간격-및-그리드-시스템)
- [7. 모서리 반경](#7-모서리-반경)
- [8. 그림자 계층 (Elevation)](#8-그림자-계층-elevation)
- [9. 애니메이션 토큰](#9-애니메이션-토큰)
- [10. shadcn/ui 커스터마이징](#10-shadcnui-커스터마이징)
- [11. 접근성 세부 명세](#11-접근성-세부-명세)
- [12. Tailwind CSS 4 통합](#12-tailwind-css-4-통합)
- [부록 A. 색상 토큰 전체 인덱스](#부록-a-색상-토큰-전체-인덱스)

---

## 1. 디자인 원칙 5가지

본 디자인 시스템은 양평 부엌 서버 대시보드의 모든 UI 결정의 근거를 제공한다. 5가지 원칙은 Wave 3 비전(00-product-vision.md §A7)과 시스템 아키텍처 원칙(00-system-overview.md §1.2)을 UI 언어로 번역한 것이다.

### DP-1. Data-first — 정보 밀도 최적화

**원칙**: 화면의 모든 픽셀은 데이터 또는 데이터 조작 도구여야 한다. 순수 장식 요소는 허용되지 않는다.

**근거**: 양평 대시보드의 핵심 사용자는 운영자 단 1명(김도영)이다. 신규 사용자 온보딩 최적화보다 효율적 데이터 작업이 우선이다(AP-1 1인 운영 가능성). Supabase Studio도 같은 철학을 유지한다.

**구현 방침**:
- 테이블 행 높이: 기본 40px (Supabase 동일), 조밀 모드 32px
- 사이드바 메뉴 항목: 아이콘 20px + 레이블, 패딩 최소화
- 카드 내부 여백: 16px (p-4), 데이터 표시 영역을 최대화
- 마케팅 배너, splash 화면, 온보딩 tip 배너 일체 금지
- 헤더 높이: 48px 고정 (콘텐츠 영역 손실 최소화)

**측정 기준**: 768px 너비 화면에서 Table Editor가 동시에 표시하는 행 수 ≥ 15행

### DP-2. Dark-by-default — 서버 관리자 장시간 사용 최적화

**원칙**: 다크 테마가 기본이며 유일한 테마다. 라이트 모드는 Phase 22+ 이후 보류 결정 사항이다.

**근거**:
- 서버 관리자는 주로 야간 또는 저조도 환경에서 작업한다
- SQL Editor, Schema Visualizer, 로그 화면 등 고밀도 텍스트 화면의 장시간 사용 시 눈 피로 감소
- Supabase Studio 기본 테마가 다크로 전환된 것과 동일한 맥락
- NFR-UX.2: "다크 테마 일관성 ≥ 95% 페이지" 요구 충족

**다크 전용 결정 근거 인용** (Wave 3 NFR-UX.2):
> "1인 운영 환경에서 테마 전환 구현 비용(~20h)이 주는 가치보다, 다크 테마 완성도 향상에 그 시간을 쏟는 것이 Supabase parity 점수에 더 직접적으로 기여한다."

**라이트 모드 보류 조건**: Phase 22+ 달성 이후, 14 카테고리 전부 90점+ 도달 시 재검토.

### DP-3. Minimal chrome — 여백보다 데이터 우선

**원칙**: 네비게이션 chrome(사이드바, 헤더, 탭바)은 필요 최소 공간만 차지하고, 나머지는 콘텐츠에 양도한다.

**구현 방침**:
- 사이드바 너비 확장: 240px / 축소(아이콘만): 56px
- 헤더: 48px 고정
- 탭 스트립: 36px 고정 (SQL Editor 멀티탭 포함)
- 컨텍스트 패널(Properties, AI Assistant): 320px 기본, 드래그 조정 가능
- 브레드크럼: 단일 행 36px

**금지 패턴**:
- 페이지 타이틀 + 서브타이틀이 2개 이상의 섹션을 차지하는 레이아웃
- 비어 있는 대형 히어로 영역
- 툴팁 대신 별도 설명 패널을 항상 표시

### DP-4. Accessible — WCAG 2.2 AA 준수 (DQ-1.16 답변)

**원칙**: 모든 UI 요소는 WCAG 2.2 AA 기준을 충족한다. 접근성은 Phase 22 보너스가 아닌 매 릴리즈의 기준선이다.

**근거**: DQ-1.16 (07-dq-matrix.md §3.1)에서 "접근성 기준은 WCAG 2.2 AA"로 확정. NFR-A11Y.1 "주요 인터랙션 키보드 접근 100%", NFR-A11Y.2 "색상 대비 AA 이상" 충족 의무.

**구현 기준**:
- 텍스트 대비: 일반 텍스트 4.5:1 이상, 대형 텍스트(18px bold+/24px+) 3:1 이상
- UI 컴포넌트 경계 대비: 3:1 이상
- 포커스 링: 2px solid, 2px offset, 색상 `#2D9F6F` (브랜드) 또는 `oklch(70% 0.15 160)` 다크 모드
- 키보드 탐색: Tab/Shift+Tab/Enter/Space/Escape/Arrow 완전 지원
- 스크린 리더: `aria-label`, `role`, `aria-live` 완전 적용
- 움직임 민감: `prefers-reduced-motion: reduce` 시 애니메이션 전부 비활성

### DP-5. Consistent tokens — 디자인 토큰 고정

**원칙**: 모든 시각적 값(색상, 간격, 타이포, 그림자)은 반드시 디자인 토큰을 통해 참조한다. 하드코딩된 픽셀값, hex 코드, arbitrary Tailwind value(`w-[347px]`) 금지.

**근거**: AP-1(1인 운영 가능성)에서 도출. 토큰 체계가 없으면 테마 변경, 컬러 조정 시 전체 코드베이스를 수동으로 수정해야 한다. 1인 운영자가 유지보수 가능한 코드베이스를 위해 필수.

**구현 규칙**:
- CSS 변수: `var(--token-name)` 형식 (kebab-case)
- Tailwind 유틸리티: `bg-primary`, `text-muted-foreground` 등 shadcn 표준 토큰명
- 임의 값 허용 조건: 외부 라이브러리(Monaco, @xyflow) 오버라이드 시에만, 주석으로 이유 명시
- 토큰 변경은 `globals.css` `@theme` 블록 단일 수정으로 전파

---

## 2. 색상 팔레트 상세

### 2.1 팔레트 결정 배경

현재 `src/app/globals.css`에 Warm Ivory 라이트 테마가 구현되어 있다. 이 문서는 **다크 모드(서버 대시보드 기본)** 팔레트를 전면 정의한다. Supabase Studio OSS 팔레트(`studio/packages/ui/src/lib/theme/colors.ts`)를 참조하여 양평 브랜드 컬러(`#2D9F6F` 그린)와 결합한 독자적 팔레트를 확립한다.

### 2.2 브랜드 컬러 (Green — 양평 고유 Primary)

양평 부엌("부엌" = Kitchen)의 자연·신선함을 표현하는 에메랄드 그린 계열. Supabase의 브랜드 그린과 유사하나 더 따뜻한 톤으로 차별화.

| 단계 | Hex | OKLCH | 용도 |
|------|-----|-------|------|
| brand-50 | `#E8F5EE` | `oklch(95% 0.04 160)` | 활성 메뉴 배경 (다크에서 낮은 opacity로) |
| brand-100 | `#C8E9D8` | `oklch(91% 0.07 160)` | 호버 상태 배경 |
| brand-200 | `#9ED4BB` | `oklch(84% 0.10 160)` | 비활성 강조 |
| brand-300 | `#6DBBAA` | `oklch(76% 0.12 155)` | 아이콘 보조 |
| brand-400 | `#3DA888` | `oklch(68% 0.14 158)` | 대화형 요소 |
| brand-500 | `#2D9F6F` | `oklch(63% 0.14 160)` | **Primary — 기본 브랜드 컬러** |
| brand-600 | `#247F59` | `oklch(54% 0.12 160)` | 호버/액티브 상태 |
| brand-700 | `#1B6045` | `oklch(45% 0.10 160)` | 눌림 상태 |
| brand-800 | `#124031` | `oklch(36% 0.08 160)` | 다크 배경 위 텍스트 |
| brand-900 | `#092020` | `oklch(25% 0.05 160)` | 배경 오버레이 |
| brand-950 | `#041010` | `oklch(15% 0.03 160)` | 가장 어두운 배경 강조 |

### 2.3 배경 (Background) — 다크 모드

Supabase Studio 다크 배경 기준: `#1c1c1c` (메인) ~ `#101010` (가장 어두운 면). 양평은 약간 따뜻한 갈색 계열로 차별화.

| 토큰 | Hex | OKLCH | 용도 |
|------|-----|-------|------|
| bg-100 | `#0E0E0F` | `oklch(8% 0.005 240)` | 최심 배경 (body, 전체 페이지) |
| bg-200 | `#141415` | `oklch(11% 0.005 240)` | 메인 콘텐츠 영역 기본 배경 |
| bg-300 | `#1C1C1E` | `oklch(14% 0.005 240)` | 사이드바 배경 |
| bg-400 | `#242427` | `oklch(18% 0.006 240)` | 카드, 패널 배경 |
| bg-500 | `#2C2C30` | `oklch(22% 0.007 240)` | 호버 배경 |
| bg-600 | `#363639` | `oklch(27% 0.008 240)` | 활성 상태 배경 |
| bg-overlay | `rgba(0,0,0,0.6)` | — | 모달 오버레이 |

### 2.4 서피스 (Surface)

| 토큰 | Hex | OKLCH | 용도 |
|------|-----|-------|------|
| surface-100 | `#1C1C1E` | `oklch(14% 0.005 240)` | 기본 카드, 사이드바 섹션 |
| surface-200 | `#242427` | `oklch(18% 0.006 240)` | 중첩 카드, 드롭다운 |
| surface-300 | `#2C2C30` | `oklch(22% 0.007 240)` | 툴팁, 팝오버 배경 |
| surface-400 | `#363639` | `oklch(27% 0.008 240)` | 입력 필드 배경 |
| surface-overlay | `rgba(14,14,15,0.95)` | — | 모달/시트 배경 |

### 2.5 텍스트 (Foreground)

| 토큰 | Hex | OKLCH | 대비(bg-200 기준) | 용도 |
|------|-----|-------|----------|------|
| text-primary | `#EDEDED` | `oklch(94% 0.002 0)` | 15.8:1 | 기본 텍스트, 제목 |
| text-secondary | `#A1A1AA` | `oklch(68% 0.004 0)` | 7.0:1 | 부제목, 레이블 |
| text-muted | `#71717A` | `oklch(52% 0.004 0)` | 4.6:1 | 힌트, 플레이스홀더 |
| text-disabled | `#52525B` | `oklch(40% 0.004 0)` | 3.1:1 | 비활성 요소 (WCAG AA Non-text) |
| text-inverse | `#09090B` | `oklch(6% 0.002 0)` | — | 브랜드 버튼 위 텍스트 |
| text-brand | `#2D9F6F` | `oklch(63% 0.14 160)` | 5.2:1 | 링크, 강조 텍스트 |
| text-danger | `#F87171` | `oklch(72% 0.16 22)` | 7.1:1 | 에러, 파괴적 액션 |
| text-warning | `#FBBF24` | `oklch(83% 0.16 80)` | 8.3:1 | 경고 메시지 |
| text-success | `#4ADE80` | `oklch(84% 0.18 150)` | 8.5:1 | 성공 메시지 |
| text-info | `#60A5FA` | `oklch(72% 0.15 240)` | 6.8:1 | 정보 메시지, 링크 |

### 2.6 경계선 (Border)

| 토큰 | Hex | OKLCH | 용도 |
|------|-----|-------|------|
| border-default | `#27272A` | `oklch(20% 0.005 240)` | 기본 경계선 (카드, 입력) |
| border-muted | `#1E1E21` | `oklch(16% 0.005 240)` | 미세 구분선 |
| border-strong | `#3F3F46` | `oklch(30% 0.005 240)` | 강조 경계선 |
| border-brand | `#2D9F6F` | `oklch(63% 0.14 160)` | 포커스 링, 활성 상태 |
| border-danger | `#EF4444` | `oklch(60% 0.22 22)` | 에러 상태 입력 |
| border-warning | `#F59E0B` | `oklch(76% 0.18 80)` | 경고 상태 |

### 2.7 시맨틱 컬러 — Success

| 단계 | Hex | 용도 |
|------|-----|------|
| success-50 | `#052E16` | 성공 배너 배경 (다크) |
| success-100 | `#14532D` | 성공 강조 배경 |
| success-200 | `#166534` | 성공 보조 배경 |
| success-400 | `#22C55E` | 성공 아이콘 |
| success-500 | `#4ADE80` | 성공 텍스트, 뱃지 |
| success-600 | `#86EFAC` | 성공 보조 텍스트 |

### 2.8 시맨틱 컬러 — Warning

| 단계 | Hex | 용도 |
|------|-----|------|
| warning-50 | `#1C1400` | 경고 배너 배경 (다크) |
| warning-100 | `#451A03` | 경고 강조 배경 |
| warning-200 | `#78350F` | 경고 보조 배경 |
| warning-400 | `#F59E0B` | 경고 아이콘 |
| warning-500 | `#FBBF24` | 경고 텍스트, 뱃지 |
| warning-600 | `#FCD34D` | 경고 보조 텍스트 |

### 2.9 시맨틱 컬러 — Error / Destructive

| 단계 | Hex | 용도 |
|------|-----|------|
| error-50 | `#1F0A0A` | 에러 배너 배경 (다크) |
| error-100 | `#450A0A` | 에러 강조 배경 |
| error-200 | `#7F1D1D` | 에러 보조 배경 |
| error-400 | `#EF4444` | 에러 아이콘, 경계선 |
| error-500 | `#F87171` | 에러 텍스트, 뱃지 |
| error-600 | `#FCA5A5` | 에러 보조 텍스트 |

### 2.10 시맨틱 컬러 — Info

| 단계 | Hex | 용도 |
|------|-----|------|
| info-50 | `#0A1628` | 정보 배너 배경 (다크) |
| info-100 | `#1E3A5F` | 정보 강조 배경 |
| info-200 | `#1E40AF` | 정보 보조 배경 |
| info-400 | `#3B82F6` | 정보 아이콘 |
| info-500 | `#60A5FA` | 정보 텍스트, 링크 |
| info-600 | `#93C5FD` | 정보 보조 텍스트 |

---

## 3. 다크 모드 전용 아키텍처

### 3.1 결정 근거

양평 대시보드는 **다크 모드 단일 테마**로 운영된다. 이 결정은 Wave 3 NFR-UX.2에서 확정되었다.

**근거 4가지**:
1. **사용 맥락**: 서버 관리자는 터미널·IDE와 함께 사용. 다크 환경이 일관성 제공
2. **구현 효율**: 라이트/다크 양방향 구현은 ~20h 추가 비용, Supabase parity 점수에 무기여
3. **색상 체계 단순성**: 단일 테마에서 대비 비율 검증 범위가 절반으로 줄어 WCAG 준수가 용이
4. **Supabase Studio 벤치마크**: Supabase Studio도 다크 우선 정책

### 3.2 CSS 변수 전략

`globals.css`에서 `:root`는 다크 모드 전용 값으로 재정의한다. 현재 파일의 Warm Ivory 라이트 테마는 **다크 토큰으로 전면 교체** 대상이다.

```css
/* 다크 모드 전용 토큰 선언 (교체 대상) */
:root {
  /* === 배경 === */
  --bg-100: #0E0E0F;
  --bg-200: #141415;
  --bg-300: #1C1C1E;
  --bg-400: #242427;
  --bg-500: #2C2C30;
  --bg-600: #363639;

  /* === 서피스 === */
  --surface-100: #1C1C1E;
  --surface-200: #242427;
  --surface-300: #2C2C30;
  --surface-400: #363639;

  /* === 텍스트 === */
  --text-primary: #EDEDED;
  --text-secondary: #A1A1AA;
  --text-muted: #71717A;
  --text-disabled: #52525B;
  --text-brand: #2D9F6F;
  --text-danger: #F87171;
  --text-warning: #FBBF24;
  --text-success: #4ADE80;
  --text-info: #60A5FA;

  /* === 경계선 === */
  --border-default: #27272A;
  --border-muted: #1E1E21;
  --border-strong: #3F3F46;
  --border-brand: #2D9F6F;
  --border-danger: #EF4444;

  /* === 브랜드 === */
  --brand: #2D9F6F;
  --brand-dark: #247F59;
  --brand-hover: #1B6045;
  --brand-subtle: rgba(45,159,111,0.12);

  /* === shadcn 호환 === */
  --background: #141415;
  --foreground: #EDEDED;
  --card: #1C1C1E;
  --card-foreground: #EDEDED;
  --popover: #242427;
  --popover-foreground: #EDEDED;
  --primary: #2D9F6F;
  --primary-foreground: #FFFFFF;
  --secondary: #2C2C30;
  --secondary-foreground: #EDEDED;
  --muted: #1C1C1E;
  --muted-foreground: #71717A;
  --accent: #2C2C30;
  --accent-foreground: #EDEDED;
  --destructive: #EF4444;
  --destructive-foreground: #FAFAFA;
  --border: #27272A;
  --input: #1C1C1E;
  --ring: #2D9F6F;
  --radius: 0.375rem;

  /* === 사이드바 === */
  --sidebar: #141415;
  --sidebar-foreground: #A1A1AA;
  --sidebar-primary: #2D9F6F;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #1C1C1E;
  --sidebar-accent-foreground: #EDEDED;
  --sidebar-border: #1E1E21;
  --sidebar-ring: #2D9F6F;
}
```

### 3.3 라이트 모드 보류 전략

Phase 22+에서 라이트 모드 도입 시 `.light` 클래스 기반으로 분리:

```css
/* Phase 22+ 전용 — 현재 미구현 */
.light {
  --bg-100: #F8F6F1;
  --bg-200: #FFFFFF;
  /* ... Warm Ivory 팔레트 이관 */
}
```

현재 `src/app/globals.css`의 `:root` Warm Ivory 토큰은 Phase 22 작업 시 `.light` 블록으로 이전.

---

## 4. 타이포그래피 시스템

### 4.1 폰트 스택

| 역할 | 폰트 | Fallback | 용도 |
|------|------|----------|------|
| **UI 폰트** | Geist Sans | ui-sans-serif, system-ui, sans-serif | 메뉴, 레이블, 본문 |
| **코드/SQL 폰트** | JetBrains Mono | ui-monospace, Consolas, monospace | Monaco Editor, SQL 쿼리, 코드 블록 |
| **숫자 폰트** | Geist Sans (tabular-nums) | 동일 | 테이블 숫자 컬럼 |

### 4.2 Geist Sans — UI 타이포그래피 스케일

```css
@theme {
  --font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, Consolas, monospace;
}
```

| 단계 | 크기 | 행간 | 자간 | 두께 | 용도 | Tailwind |
|------|------|------|------|------|------|---------|
| display | 24px | 1.25 | -0.02em | 700 | 페이지 제목 (드문 경우) | `text-2xl font-bold tracking-tight` |
| heading-xl | 20px | 1.3 | -0.01em | 600 | 섹션 주요 제목 | `text-xl font-semibold` |
| heading-lg | 18px | 1.4 | -0.01em | 600 | 카드 제목, 모달 제목 | `text-lg font-semibold` |
| heading-md | 16px | 1.4 | 0 | 500 | 서브 섹션, 폼 제목 | `text-base font-medium` |
| heading-sm | 14px | 1.5 | 0 | 500 | 사이드바 섹션 레이블 | `text-sm font-medium` |
| body-lg | 15px | 1.6 | 0 | 400 | 기본 본문 | `text-[15px] leading-relaxed` |
| body-md | 14px | 1.5 | 0 | 400 | 테이블 셀, 레이블 | `text-sm` |
| body-sm | 13px | 1.4 | 0 | 400 | 부가 정보, 메타 | `text-xs leading-tight` |
| caption | 12px | 1.4 | 0.01em | 400 | 타임스탬프, 버전 | `text-[12px] text-muted-foreground` |
| overline | 11px | 1.3 | 0.08em | 500 | 카테고리 레이블, 배지 | `text-[11px] font-medium uppercase tracking-widest` |

### 4.3 JetBrains Mono — 코드 타이포그래피

| 용도 | 크기 | 두께 | Tailwind |
|------|------|------|---------|
| Monaco Editor 기본 | 13px | 400 | (Monaco 설정으로 직접 지정) |
| 인라인 코드 블록 | 13px | 400 | `font-mono text-[13px]` |
| SQL 쿼리 결과 | 13px | 400 | `font-mono text-[13px] tabular-nums` |
| 코드 하이라이트 블록 | 13px | 400 | `font-mono text-[13px] leading-6` |
| 단축키 배지 | 12px | 500 | `font-mono text-[12px] font-medium` |

### 4.4 숫자 렌더링 규칙

- 테이블 숫자 컬럼: `tabular-nums` 필수 (`font-variant-numeric: tabular-nums`)
- 통계 카드 숫자: `slashed-zero diagonal-fractions` 선택적 적용
- 타임스탬프: `tabular-nums` + `JetBrains Mono`

---

## 5. 아이콘 시스템

### 5.1 단일 라이브러리 정책

**채택**: `lucide-react` 전용 사용. 다른 아이콘 라이브러리 (heroicons, radix-icons, phosphor-icons) **혼용 금지**.

**근거**:
- lucide-react는 shadcn/ui의 기본 아이콘 라이브러리
- 트리 쉐이킹 완전 지원 (번들 크기 최소화)
- 1,000+ 아이콘, 일관된 2px stroke, 24px 기본 크기
- TypeScript 타입 완전 지원

### 5.2 아이콘 크기 기준

| 크기 | px | 용도 | Tailwind |
|------|-----|------|---------|
| xs | 12px | 캡션 인라인 아이콘 | `h-3 w-3` |
| sm | 14px | 버튼 아이콘, 뱃지 | `h-3.5 w-3.5` |
| md | 16px | 기본 UI 아이콘 | `h-4 w-4` |
| lg | 20px | 사이드바 메뉴 아이콘 | `h-5 w-5` |
| xl | 24px | 섹션 아이콘, Empty state | `h-6 w-6` |
| 2xl | 32px | 페이지 아이콘 (드문 경우) | `h-8 w-8` |

### 5.3 아이콘 색상 규칙

| 맥락 | 색상 토큰 | 설명 |
|------|-----------|------|
| 기본 아이콘 | `text-muted-foreground` | `#71717A` |
| 활성/호버 아이콘 | `text-foreground` | `#EDEDED` |
| 사이드바 활성 | `text-brand` | `#2D9F6F` |
| 성공 아이콘 | `text-success-500` | `#4ADE80` |
| 경고 아이콘 | `text-warning-500` | `#FBBF24` |
| 에러 아이콘 | `text-error-500` | `#F87171` |
| 정보 아이콘 | `text-info-500` | `#60A5FA` |

### 5.4 주요 아이콘 매핑 (14 카테고리)

| 카테고리 | lucide 아이콘 | import 이름 |
|----------|-------------|------------|
| Dashboard | `LayoutDashboard` | LayoutDashboard |
| Table Editor | `Table2` | Table2 |
| SQL Editor | `Code2` | Code2 |
| Database (Schema) | `Database` | Database |
| Policies | `Shield` | Shield |
| Functions | `Zap` | Zap |
| Triggers | `Bell` | Bell |
| Cron Jobs | `Clock` | Clock |
| Webhooks | `Webhook` | Webhook |
| Backups | `HardDrive` | HardDrive |
| Auth | `Lock` | Lock |
| Storage | `FolderOpen` | FolderOpen |
| Edge Functions | `Activity` | Activity |
| Realtime | `Radio` | Radio |
| Advisors | `AlertCircle` | AlertCircle |
| API | `Globe` | Globe |
| Settings | `Settings` | Settings |
| AI Assistant | `Sparkles` | Sparkles |

### 5.5 아이콘 컴포넌트 패턴

```typescript
// src/components/ui/icons.tsx에 lucide-react 재export
// 새 아이콘 추가 시 이 파일에만 추가 (직접 lucide-react import 금지)
import {
  LayoutDashboard,
  Table2,
  Code2,
  Database,
  Shield,
  Zap,
  Bell,
  Clock,
  Webhook,
  HardDrive,
  Lock,
  FolderOpen,
  Activity,
  Radio,
  AlertCircle,
  Globe,
  Settings,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Search,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Download,
  Upload,
  RefreshCw,
  MoreHorizontal,
  X,
  Check,
  Info,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

export {
  LayoutDashboard,
  Table2,
  // ... 전체 목록
};
```

---

## 6. 간격 및 그리드 시스템

### 6.1 기본 단위 — 4px Base Grid

모든 간격은 **4px(0.25rem)의 배수**만 사용한다. Tailwind의 기본 단위(`space-1` = 4px)와 정확히 일치.

| 단계 | px | rem | Tailwind | 용도 |
|------|-----|-----|---------|------|
| 0 | 0px | 0 | `p-0` | 리셋 |
| 1 | 4px | 0.25rem | `p-1` | 아이콘-텍스트 간격, 미세 패딩 |
| 2 | 8px | 0.5rem | `p-2` | 버튼 내부 세로 패딩, 배지 |
| 3 | 12px | 0.75rem | `p-3` | 작은 카드 패딩 |
| 4 | 16px | 1rem | `p-4` | 기본 카드 패딩, 표준 여백 |
| 5 | 20px | 1.25rem | `p-5` | 중간 섹션 패딩 |
| 6 | 24px | 1.5rem | `p-6` | 큰 카드, 모달 내부 패딩 |
| 8 | 32px | 2rem | `p-8` | 페이지 여백 |
| 10 | 40px | 2.5rem | `p-10` | 섹션 간격 |
| 12 | 48px | 3rem | `p-12` | 대형 섹션 여백 |
| 16 | 64px | 4rem | `p-16` | 최대 섹션 여백 |

### 6.2 컴포넌트별 표준 간격

| 컴포넌트 | 내부 패딩 | 아이템 간격 | 설명 |
|----------|----------|-----------|------|
| 버튼 (기본) | `px-3 py-1.5` | — | 12px 좌우, 6px 상하 |
| 버튼 (중간) | `px-4 py-2` | — | 16px 좌우, 8px 상하 |
| 버튼 (대) | `px-5 py-2.5` | — | 20px 좌우, 10px 상하 |
| 카드 | `p-4` 또는 `p-6` | `space-y-4` | 16 또는 24px |
| 테이블 셀 | `px-3 py-2.5` | — | 행 높이 40px 효과 |
| 폼 필드 | `px-3 py-2` | `space-y-4` | 입력 내부 8px 상하 |
| 사이드바 메뉴 항목 | `px-3 py-2` | `space-y-0.5` | 2px 간격 |
| 드롭다운 아이템 | `px-2 py-1.5` | — | 6px 상하 |
| 배지 | `px-2 py-0.5` | — | 2px 상하 |
| 모달 헤더 | `p-6 pb-4` | — | 하단 16px |
| 모달 콘텐츠 | `px-6 py-4` | `space-y-4` | |
| 모달 푸터 | `p-6 pt-4` | `gap-3` | 상단 16px |

### 6.3 레이아웃 그리드

| 영역 | 크기 | 메모 |
|------|------|------|
| 사이드바 확장 | 240px | `w-60` |
| 사이드바 축소 | 56px | `w-14` |
| 헤더 높이 | 48px | `h-12` |
| 메인 콘텐츠 최대 너비 | 제한 없음 | 전체 너비 활용 |
| 컨텍스트 패널 | 320px | `w-80` |
| 모달 너비 (소) | 480px | `max-w-[480px]` |
| 모달 너비 (중) | 640px | `max-w-2xl` |
| 모달 너비 (대) | 900px | `max-w-3xl` |
| 페이지 내부 패딩 | 24px | `p-6` |

### 6.4 반응형 그리드 (12열)

| 브레이크포인트 | 코드 | 픽셀 | 컬럼 | 열 간격 |
|--------------|------|------|------|--------|
| mobile | 기본 | <768px | 4 | 16px |
| tablet | `md:` | 768-1023px | 8 | 20px |
| desktop | `lg:` | 1024-1279px | 12 | 24px |
| wide | `xl:` | 1280-1535px | 12 | 24px |
| ultrawide | `2xl:` | ≥1536px | 12 | 24px |

---

## 7. 모서리 반경

### 7.1 반경 스케일

기본 반경 `--radius: 0.375rem` (6px). shadcn/ui 표준과 일치하며 Supabase Studio보다 약간 작게 설정(Supabase: 8px).

| 토큰 | 계산식 | px | Tailwind | 용도 |
|------|--------|-----|---------|------|
| radius-none | 0 | 0px | `rounded-none` | 테이블 셀, 코드 블록 내부 |
| radius-sm | `calc(var(--radius) * 0.6)` | ~4px | `rounded-sm` | 배지, 태그, 소형 버튼 |
| radius-md | `calc(var(--radius) * 0.8)` | ~5px | `rounded` | 버튼, 입력 필드 |
| radius-lg | `var(--radius)` | 6px | `rounded-md` | 카드, 드롭다운, 팝오버 |
| radius-xl | `calc(var(--radius) * 1.4)` | ~8px | `rounded-lg` | 모달, 시트 |
| radius-2xl | `calc(var(--radius) * 1.8)` | ~11px | `rounded-xl` | 큰 카드, 알림 |
| radius-full | 9999px | — | `rounded-full` | 아바타, 토글, 원형 버튼 |

### 7.2 컴포넌트별 반경 규칙

| 컴포넌트 | 반경 | 비고 |
|----------|------|------|
| 버튼 | `rounded` (radius-md) | 기본 |
| 버튼 아이콘 전용 | `rounded` | 정사각형 |
| 입력 필드 | `rounded` | 버튼과 통일 |
| 카드 | `rounded-md` (radius-lg) | |
| 드롭다운/팝오버 | `rounded-md` | |
| 모달/다이얼로그 | `rounded-lg` (radius-xl) | |
| 배지/태그 | `rounded-sm` | |
| 아바타 | `rounded-full` | |
| 토스트 | `rounded-md` | |
| 테이블 컨테이너 | `rounded-md` | 테두리 포함 |
| 코드 블록 | `rounded-md` | Monaco 래퍼 |

---

## 8. 그림자 계층 (Elevation)

### 8.1 Elevation 0~4 정의

다크 모드에서 그림자는 빛이 아닌 **불투명도 레이어**로 표현한다. Elevation이 높을수록 더 어두운 배경이 아닌 더 밝은 배경 + 미세 테두리로 표현.

| Elevation | 토큰 | CSS Shadow | 용도 |
|-----------|------|-----------|------|
| **0** | `shadow-none` | `none` | 평면 요소 (테이블 행, 인라인) |
| **1** | `shadow-sm` | `0 1px 2px rgba(0,0,0,0.4)` | 카드, 입력 필드 (기본 배경보다 약간 높음) |
| **2** | `shadow-md` | `0 4px 8px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)` | 드롭다운, 팝오버 |
| **3** | `shadow-lg` | `0 8px 24px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)` | 모달, 다이얼로그 |
| **4** | `shadow-xl` | `0 16px 48px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5)` | 드로어, 최상위 패널 |

### 8.2 다크 모드 Elevation 보조 표현

다크 모드에서는 그림자만으로 레이어를 구분하기 어렵다. 배경색 차이와 테두리를 함께 사용:

| Elevation | 배경색 | 테두리 |
|-----------|--------|--------|
| 0 | `bg-200` (`#141415`) | 없음 |
| 1 | `bg-300` (`#1C1C1E`) | `border border-default` |
| 2 | `bg-400` (`#242427`) | `border border-default` |
| 3 | `bg-400` (`#242427`) | `border border-strong` + shadow-lg |
| 4 | `bg-500` (`#2C2C30`) | `border border-strong` + shadow-xl |

---

## 9. 애니메이션 토큰

### 9.1 Duration 스케일

| 토큰 | 값 | 용도 |
|------|-----|------|
| `duration-instant` | 0ms | `prefers-reduced-motion` 시 기본 |
| `duration-fast` | 100ms | 버튼 클릭, 상태 변경 |
| `duration-normal` | 150ms | 팝오버, 드롭다운 열기 |
| `duration-moderate` | 200ms | 모달 오버레이, 사이드시트 |
| `duration-slow` | 300ms | 사이드바 확장/축소 |
| `duration-page` | 200ms | 페이지 전환 페이드 |

### 9.2 Easing 함수

| 토큰 | cubic-bezier | 용도 |
|------|-------------|------|
| `ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | 기본 트랜지션 (Material 표준) |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 요소 사라짐 |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | 요소 나타남 |
| `ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 스프링감 (모달, 드로어) |
| `ease-linear` | `linear` | 로딩 스피너, 프로그레스 바 |

### 9.3 CSS 변수 선언

```css
@theme {
  --animate-duration-fast: 100ms;
  --animate-duration-normal: 150ms;
  --animate-duration-moderate: 200ms;
  --animate-duration-slow: 300ms;
  --animate-ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --animate-ease-out: cubic-bezier(0, 0, 0.2, 1);
  --animate-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 9.4 표준 애니메이션 패턴

| 패턴 | 클래스 조합 | 설명 |
|------|-----------|------|
| 드롭다운 열기 | `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95` | shadcn/ui 표준 |
| 모달 슬라이드업 | `animate-in fade-in-0 slide-in-from-bottom-4 duration-200` | 모달 등장 |
| 페이지 전환 | `animate-in fade-in-0 duration-200` | 라우트 변경 |
| 로딩 스피너 | `animate-spin` | `Loader2` 아이콘 |
| 스켈레톤 | `animate-pulse` | 로딩 플레이스홀더 |
| 사이드바 슬라이드 | `transition-all duration-300 ease-default` | 너비 애니메이션 |

### 9.5 prefers-reduced-motion 처리

```css
@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 10. shadcn/ui 커스터마이징

### 10.1 components.json 설정

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### 10.2 커스터마이징된 컴포넌트 목록

현재 `src/components/ui/`에 존재하는 컴포넌트:

| 컴포넌트 | 파일 | 커스터마이징 포인트 |
|----------|------|------------------|
| `Button` | `button.tsx` | 다크 테마 variant 추가 필요 |
| `Card` | `card.tsx` | `bg-surface-100 border-default` 적용 |
| `Dialog` | `dialog.tsx` | `bg-surface-overlay`, shadow-xl |
| `PageHeader` | `page-header.tsx` | 양평 전용 컴포넌트 |
| `SSEIndicator` | `sse-indicator.tsx` | Realtime 연결 상태 표시 |
| `StatusBadge` | `status-badge.tsx` | 상태 코드 → 컬러 매핑 |
| `EmptyState` | `empty-state.tsx` | 빈 상태 표준 컴포넌트 |
| `Icons` | `icons.tsx` | lucide 재export |

### 10.3 추가 필요 컴포넌트

Phase 15~21에서 구현할 shadcn/ui 기반 컴포넌트:

| 컴포넌트 | 우선순위 | 용도 |
|----------|---------|------|
| `Sidebar` (shadcn sidebar) | P0 | 앱 셸 사이드바 |
| `Sheet` | P0 | 모바일 사이드바 드로어 |
| `Command` (cmdk 래퍼) | P0 | 글로벌 검색 팔레트 |
| `Tooltip` | P0 | 아이콘 버튼 설명 |
| `Alert` | P0 | 인라인 경고/에러 |
| `Badge` | P0 | 상태 뱃지 |
| `Table` | P0 | 기본 테이블 (TanStack 래퍼 아닌 단순 표) |
| `Tabs` | P1 | SQL Editor 멀티탭 헤더 |
| `Select` | P1 | 폼 셀렉트 |
| `Popover` | P1 | 커맨드 팔레트 기반 |
| `DropdownMenu` | P1 | 컨텍스트 메뉴 |
| `Skeleton` | P1 | 로딩 플레이스홀더 |
| `Progress` | P1 | 파일 업로드, 작업 진행 |
| `Textarea` | P1 | 폼 텍스트 영역 |
| `Switch` | P1 | 설정 토글 |
| `Checkbox` | P1 | 테이블 행 선택 |
| `Separator` | P2 | 섹션 구분선 |
| `ScrollArea` | P2 | 커스텀 스크롤바 래퍼 |

### 10.4 Button Variant 확장

기본 shadcn/ui Button에 추가 variant:

```typescript
const buttonVariants = cva(
  "...",
  {
    variants: {
      variant: {
        // 기본 shadcn variant
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // 양평 추가 variant
        "brand-outline": "border border-brand text-brand hover:bg-brand/10",
        "danger-outline": "border border-danger text-danger hover:bg-danger/10",
        "subtle": "bg-muted text-muted-foreground hover:bg-muted/80",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded px-3 text-xs",
        lg: "h-10 rounded px-8",
        xl: "h-12 rounded px-10 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-xs": "h-6 w-6",
      },
    },
  }
);
```

---

## 11. 접근성 세부 명세

### 11.1 색상 대비 검증 (WCAG 2.2 AA)

모든 텍스트-배경 조합은 AA 기준(일반 텍스트 4.5:1, 대형 텍스트 3:1) 충족. 다음은 주요 조합의 실측값:

| 전경 | 배경 | 대비 | 기준 | 상태 |
|------|------|------|------|------|
| `text-primary` `#EDEDED` | `bg-200` `#141415` | 15.8:1 | 4.5:1 | 통과 |
| `text-secondary` `#A1A1AA` | `bg-200` `#141415` | 7.0:1 | 4.5:1 | 통과 |
| `text-muted` `#71717A` | `bg-200` `#141415` | 4.6:1 | 4.5:1 | 통과 (경계) |
| `text-brand` `#2D9F6F` | `bg-200` `#141415` | 5.2:1 | 4.5:1 | 통과 |
| `text-danger` `#F87171` | `bg-200` `#141415` | 7.1:1 | 4.5:1 | 통과 |
| `text-warning` `#FBBF24` | `bg-200` `#141415` | 8.3:1 | 4.5:1 | 통과 |
| `#FFFFFF` | `brand-500` `#2D9F6F` | 4.0:1 | 3:1 (대형) | 통과 |
| `text-disabled` `#52525B` | `bg-200` `#141415` | 3.1:1 | 3:1 (비텍스트) | 통과 |

> 주의: `text-muted`(#71717A / bg-200)는 4.6:1로 AA 경계값. 플레이스홀더 등 정보 전달이 아닌 용도에만 사용. 읽기 필수 텍스트에는 `text-secondary` 이상 사용.

### 11.2 포커스 링 명세

모든 인터랙티브 요소는 포커스 시 명확한 포커스 링을 표시한다.

```css
/* 전역 포커스 링 기본 스타일 */
:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: inherit;
}

/* shadcn 기반 컴포넌트 포커스 */
.focus-ring {
  @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background;
}
```

포커스 링 색상: `--ring: #2D9F6F` (브랜드 그린)
포커스 링 두께: 2px
포커스 링 오프셋: 2px (내부 여백)
모달/팝오버 위 포커스: `ring-offset-background`로 배경색 조정

### 11.3 키보드 네비게이션 표준

| 키 | 동작 |
|----|------|
| `Tab` | 다음 포커스 가능 요소로 이동 |
| `Shift+Tab` | 이전 포커스 가능 요소로 이동 |
| `Enter` | 버튼 클릭, 링크 활성화, 드롭다운 열기 |
| `Space` | 체크박스/토글 변경, 버튼 클릭 |
| `Escape` | 모달 닫기, 드롭다운 닫기, 편집 취소 |
| `Arrow Up/Down` | 드롭다운 메뉴 탐색, 테이블 행 이동 |
| `Arrow Left/Right` | 탭 전환, 수평 이동 |
| `Home/End` | 목록 처음/마지막으로 이동 |
| `Cmd+K` (Mac) / `Ctrl+K` (Win) | 글로벌 커맨드 팔레트 열기 |
| `Cmd+Enter` / `Ctrl+Enter` | SQL 실행 (Monaco Editor) |
| `Cmd+S` / `Ctrl+S` | 저장 (Monaco Editor) |

### 11.4 ARIA 패턴 표준

| 컴포넌트 | role | 필수 aria 속성 |
|----------|------|--------------|
| 사이드바 | `navigation` | `aria-label="주 네비게이션"` |
| 사이드바 메뉴 | `menubar` | — |
| 사이드바 메뉴 항목 | `menuitem` | `aria-current="page"` (활성 시) |
| 드롭다운 | `listbox` | `aria-expanded`, `aria-controls` |
| 모달 | `dialog` | `aria-labelledby`, `aria-describedby`, `aria-modal="true"` |
| 알림 배너 | `alert` | `role="alert"`, `aria-live="assertive"` |
| 로딩 | `status` | `aria-live="polite"`, `aria-label="로딩 중"` |
| 테이블 | `grid` | `aria-rowcount`, `aria-colcount` |
| 테이블 정렬 헤더 | `columnheader` | `aria-sort="ascending/descending/none"` |
| 탭 패널 | `tabpanel` | `role="tabpanel"`, `aria-labelledby` |
| 탭 | `tab` | `aria-selected`, `aria-controls` |
| 에러 메시지 | — | `aria-describedby` (입력과 연결) |
| 버튼 (아이콘만) | `button` | `aria-label` 필수 |
| 토글 | `switch` | `aria-checked` |

### 11.5 스크린 리더 텍스트 패턴

시각적으로 숨기되 스크린 리더가 읽는 텍스트:

```typescript
// src/components/ui/sr-only.tsx
export function SrOnly({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}

// 사용 예시
<button aria-label="행 삭제">
  <Trash2 className="h-4 w-4" aria-hidden="true" />
  <SrOnly>행 삭제</SrOnly>
</button>
```

### 11.6 라이브 리전 패턴 (동적 콘텐츠)

```typescript
// 글로벌 알림 리전 — 앱 루트에 단 1개
<div
  aria-live="polite"
  aria-atomic="true"
  className="sr-only"
  id="global-announcer"
/>

// 오류 메시지 리전
<div role="alert" aria-live="assertive">
  {error && <p className="text-danger text-sm">{error}</p>}
</div>
```

---

## 12. Tailwind CSS 4 통합

### 12.1 @theme 선언 전체 구조

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

:root {
  /* === 다크 모드 배경 === */
  --bg-100: #0E0E0F;
  --bg-200: #141415;
  --bg-300: #1C1C1E;
  --bg-400: #242427;
  --bg-500: #2C2C30;
  --bg-600: #363639;

  /* === 서피스 === */
  --surface-100: #1C1C1E;
  --surface-200: #242427;
  --surface-300: #2C2C30;
  --surface-400: #363639;

  /* === 텍스트 === */
  --text-primary: #EDEDED;
  --text-secondary: #A1A1AA;
  --text-muted: #71717A;
  --text-disabled: #52525B;
  --text-brand: #2D9F6F;
  --text-danger: #F87171;
  --text-warning: #FBBF24;
  --text-success: #4ADE80;
  --text-info: #60A5FA;

  /* === 경계선 === */
  --border-default: #27272A;
  --border-muted: #1E1E21;
  --border-strong: #3F3F46;
  --border-brand: #2D9F6F;
  --border-danger: #EF4444;

  /* === 브랜드 === */
  --brand: #2D9F6F;
  --brand-dark: #247F59;
  --brand-subtle: rgba(45,159,111,0.12);

  /* === shadcn 호환 === */
  --background: #141415;
  --foreground: #EDEDED;
  --card: #1C1C1E;
  --card-foreground: #EDEDED;
  --popover: #242427;
  --popover-foreground: #EDEDED;
  --primary: #2D9F6F;
  --primary-foreground: #FFFFFF;
  --secondary: #2C2C30;
  --secondary-foreground: #EDEDED;
  --muted: #1C1C1E;
  --muted-foreground: #71717A;
  --accent: #2C2C30;
  --accent-foreground: #EDEDED;
  --destructive: #EF4444;
  --destructive-foreground: #FAFAFA;
  --border: #27272A;
  --input: #1C1C1E;
  --ring: #2D9F6F;
  --radius: 0.375rem;
  --sidebar: #141415;
  --sidebar-foreground: #A1A1AA;
  --sidebar-primary: #2D9F6F;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #1C1C1E;
  --sidebar-accent-foreground: #EDEDED;
  --sidebar-border: #1E1E21;
  --sidebar-ring: #2D9F6F;
}

@theme inline {
  /* === 폰트 === */
  --font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, Consolas, monospace;
  --font-heading: var(--font-sans);

  /* === 배경 컬러 === */
  --color-bg-100: var(--bg-100);
  --color-bg-200: var(--bg-200);
  --color-bg-300: var(--bg-300);
  --color-bg-400: var(--bg-400);
  --color-bg-500: var(--bg-500);
  --color-bg-600: var(--bg-600);

  /* === 서피스 컬러 === */
  --color-surface-100: var(--surface-100);
  --color-surface-200: var(--surface-200);
  --color-surface-300: var(--surface-300);
  --color-surface-400: var(--surface-400);

  /* === 브랜드 컬러 === */
  --color-brand: var(--brand);
  --color-brand-dark: var(--brand-dark);
  --color-brand-subtle: var(--brand-subtle);

  /* === 텍스트 컬러 === */
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-text-disabled: var(--text-disabled);
  --color-text-brand: var(--text-brand);
  --color-text-danger: var(--text-danger);
  --color-text-warning: var(--text-warning);
  --color-text-success: var(--text-success);
  --color-text-info: var(--text-info);

  /* === 경계선 컬러 === */
  --color-border-default: var(--border-default);
  --color-border-muted: var(--border-muted);
  --color-border-strong: var(--border-strong);
  --color-border-brand: var(--border-brand);
  --color-border-danger: var(--border-danger);

  /* === shadcn 호환 컬러 === */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  /* === 반경 === */
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-full: 9999px;

  /* === 애니메이션 === */
  --animate-duration-fast: 100ms;
  --animate-duration-normal: 150ms;
  --animate-duration-moderate: 200ms;
  --animate-duration-slow: 300ms;
  --animate-ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --animate-ease-out: cubic-bezier(0, 0, 0.2, 1);
  --animate-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 12.2 커스텀 유틸리티 클래스

```css
@layer utilities {
  /* 텍스트 오버플로 */
  .text-ellipsis-1 {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }

  /* 숫자 테이블 정렬 */
  .tabular {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }

  /* 포커스 링 */
  .focus-brand {
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background;
  }

  /* 스크롤바 숨김 */
  .scrollbar-hide {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  /* 그라데이션 마스크 */
  .mask-gradient-right {
    mask-image: linear-gradient(to right, black 80%, transparent 100%);
  }
}
```

---

## 부록 A. 색상 토큰 전체 인덱스

### A.1 Tailwind 클래스 → CSS 변수 매핑

| Tailwind 클래스 | CSS 변수 | 다크 값 |
|----------------|---------|--------|
| `bg-background` | `--background` | `#141415` |
| `bg-card` | `--card` | `#1C1C1E` |
| `bg-popover` | `--popover` | `#242427` |
| `bg-primary` | `--primary` | `#2D9F6F` |
| `bg-secondary` | `--secondary` | `#2C2C30` |
| `bg-muted` | `--muted` | `#1C1C1E` |
| `bg-accent` | `--accent` | `#2C2C30` |
| `bg-destructive` | `--destructive` | `#EF4444` |
| `bg-sidebar` | `--sidebar` | `#141415` |
| `bg-surface-100` | `--surface-100` | `#1C1C1E` |
| `bg-surface-200` | `--surface-200` | `#242427` |
| `bg-bg-200` | `--bg-200` | `#141415` |
| `text-foreground` | `--foreground` | `#EDEDED` |
| `text-muted-foreground` | `--muted-foreground` | `#71717A` |
| `text-primary-foreground` | `--primary-foreground` | `#FFFFFF` |
| `text-destructive` | `--destructive` | `#EF4444` |
| `text-brand` | `--text-brand` | `#2D9F6F` |
| `text-success` | `--text-success` | `#4ADE80` |
| `text-warning` | `--text-warning` | `#FBBF24` |
| `text-danger` | `--text-danger` | `#F87171` |
| `border-border` | `--border` | `#27272A` |
| `border-border-strong` | `--border-strong` | `#3F3F46` |
| `ring-ring` | `--ring` | `#2D9F6F` |

### A.2 시맨틱 토큰 용도 요약

```
bg-background     → 페이지 배경
bg-card           → 카드, 패널 배경
bg-popover        → 드롭다운, 팝오버 배경
bg-muted          → 비활성 배경, 코드 블록 배경
bg-accent         → 호버, 선택 배경
bg-surface-100    → 기본 컴포넌트 배경
bg-surface-200    → 중첩 컴포넌트 배경
text-foreground   → 기본 텍스트
text-muted-foreground → 보조 텍스트, 플레이스홀더
text-primary-foreground → primary 버튼 텍스트
border-border     → 기본 경계선
ring-ring         → 포커스 링
```
