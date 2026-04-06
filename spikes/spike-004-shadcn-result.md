# SPIKE-04: shadcn/ui 호환 검증 결과

## 결과: 성공

### 검증 항목
1. shadcn init: **성공** — `npx shadcn@latest init --defaults` 정상 실행
2. tailwind.config.ts 충돌: **없음** — shadcn이 파일을 수정하지 않음 (Tailwind CSS 4에서는 globals.css의 `@theme inline`으로 관리)
3. globals.css 충돌: **있음 (해결됨)** — shadcn이 CSS 변수 + `@layer base` 추가. 기존 커스텀 변수(--bg-primary 등)는 보존됨. `.dark` 블록의 색상을 기존 테마에 맞게 수정 필요했음
4. 기존 커스텀 컴포넌트 공존: **가능** — StatCard, StatusBadge, PageHeader 모두 빌드 성공
5. Next.js build: **성공** — 24개 라우트 전체 빌드 통과 (0 에러)

### 설치된 shadcn 컴포넌트
- Button (`src/components/ui/button.tsx`)
- Card (`src/components/ui/card.tsx`)
- Dialog (`src/components/ui/dialog.tsx`)
- 유틸리티: `cn()` 함수 (`src/lib/utils.ts`)

### shadcn이 추가한 의존성
- `@base-ui/react` — shadcn v4 기본 프리미티브
- `class-variance-authority` — 컴포넌트 변형 관리
- `clsx` + `tailwind-merge` — 클래스 병합 유틸
- `lucide-react` — 아이콘
- `tw-animate-css` — 애니메이션
- `shadcn` — CLI

### 다크 테마 호환
- CSS 변수 충돌: **있었음 (해결됨)**
  - shadcn 기본 `.dark` 블록은 oklch 색상 사용 → 기존 hex 기반 커스텀 테마와 불일치
  - `.dark` 블록 색상을 기존 surface/brand/border 색상으로 재매핑하여 해결
- 커스텀 brand/surface 색상 유지: **예**
  - `tailwind.config.ts`의 `brand`, `surface-*`, `border` 색상 100% 유지
  - globals.css의 `--bg-primary`, `--brand` 등 CSS 변수 100% 유지

### 수행한 조정 사항

#### 1. `.dark` CSS 변수 재매핑 (globals.css)
```css
/* shadcn 기본값 → 기존 테마 매핑 */
--background: #171717;        /* surface-100 = --bg-primary */
--foreground: #ededed;         /* --text-primary */
--card: #1c1c1c;               /* surface-200 */
--popover: #232323;            /* surface-300 */
--primary: #3ECF8E;            /* brand */
--secondary: #282828;          /* surface-400 */
--muted: #232323;              /* surface-300 */
--muted-foreground: #a0a0a0;   /* --text-secondary */
--border: #2e2e2e;             /* 기존 border */
--ring: #3ECF8E;               /* brand 포커스 링 */
```

#### 2. `@layer base` body 스타일 (globals.css)
- shadcn 기본: `@apply bg-background text-foreground`
- 변경: `background: var(--bg-primary); color: var(--text-primary);`
- 이유: 기존 커스텀 CSS 변수와의 일관성 유지

### 발견 사항
- shadcn v4 (base-nova 스타일)은 `@base-ui/react` 프리미티브를 사용
- Tailwind CSS 4 환경에서 `tailwind.config.ts` 대신 `globals.css`의 `@theme inline` 블록으로 테마 확장
- shadcn 컴포넌트가 `src/components/ui/`에 설치되어 기존 커스텀 컴포넌트(`status-badge.tsx`, `page-header.tsx`)와 같은 디렉토리에 공존
- `components.json` 생성됨 — shadcn CLI 설정 파일

### 아키텍처 참고
```
src/components/
├── ui/                    ← shadcn + 커스텀 공존
│   ├── button.tsx         ← shadcn
│   ├── card.tsx           ← shadcn
│   ├── dialog.tsx         ← shadcn
│   ├── status-badge.tsx   ← 커스텀 (기존)
│   └── page-header.tsx    ← 커스텀 (기존)
├── dashboard/
│   └── stat-card.tsx      ← 커스텀 (기존)
└── layout/
    └── sidebar.tsx        ← 커스텀 (기존)
```

### 결론
shadcn/ui는 기존 다크 테마 + 커스텀 컴포넌트와 **완전 호환**된다.
`.dark` CSS 변수를 기존 색상 체계에 맞게 재매핑하면 shadcn 컴포넌트가 기존 다크 테마에 자연스럽게 통합된다.
향후 shadcn 컴포넌트 추가 시 `npx shadcn@latest add [컴포넌트명]`으로 바로 사용 가능.
