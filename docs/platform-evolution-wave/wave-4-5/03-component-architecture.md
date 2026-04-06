# Wave 4+5 — UI 컴포넌트 아키텍처

> 문서 번호: 03  
> 작성일: 2026-04-06  
> 스택: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui  
> 대상 브랜치: wave-4-5 (shadcn/ui 통합 + 페이지 확장)

---

## 1. 개요

현재 대시보드는 직접 구현한 커스텀 컴포넌트(StatCard, MiniChart, Sidebar 등)로 구성되어 있다.  
Wave 4+5에서는 **shadcn/ui**를 기반 컴포넌트 라이브러리로 도입하고, 사이드바 메뉴를 4개에서 8개 섹션으로 확장한다.  
Supabase 대시보드의 UI/UX 패턴을 롤모델로 삼아, 데이터 탐색과 관리 기능을 위한 컴포넌트 체계를 수립한다.

### 1.1 현재 상태

```
현재 페이지
├── / (대시보드 홈)
├── /processes (PM2 프로세스)
├── /logs (로그 뷰어)
├── /network (네트워크)
└── /login

현재 사이드바 메뉴: 4개
- 대시보드
- 프로세스
- 로그
- 네트워크
```

### 1.2 목표 상태

```
목표 페이지 구조
├── / (대시보드 홈)
├── /monitoring
│   ├── /monitoring/metrics (시스템 메트릭)
│   ├── /monitoring/processes (PM2 프로세스)
│   └── /monitoring/network (네트워크)
├── /data
│   ├── /data/tables (테이블 에디터)
│   └── /data/sql (SQL 에디터)
├── /logs
│   ├── /logs/realtime (실시간 로그)
│   └── /logs/audit (감사 로그)
├── /storage (파일 스토리지)
├── /auth (인증/사용자 관리)
├── /settings (설정)
└── /login
```

---

## 2. 사이드바 네비게이션 진화

### 2.1 목표 사이드바 구조

```
┌─────────────────────┐
│  ⚡ 양평 부엌         │  ← 로고 + 프로젝트명
│  stylelucky4u.com   │
├─────────────────────┤
│                     │
│  📊 대시보드          │  ← 홈 (/)
│                     │
│  모니터링            │  ← 섹션 라벨 (클릭 불가)
│    ■ 시스템 메트릭   │
│    ■ 프로세스        │
│    ■ 네트워크        │
│                     │
│  데이터              │
│    ■ 테이블 에디터   │
│    ■ SQL 에디터      │
│                     │
│  로그               │
│    ■ 실시간 로그     │
│    ■ 감사 로그       │
│                     │
│  ■ 스토리지          │
│  ■ 인증/사용자       │
│  ■ 설정             │
│                     │
├─────────────────────┤
│  👤 admin           │  ← 현재 사용자 + 로그아웃
└─────────────────────┘
```

### 2.2 Sidebar 컴포넌트 상세 사양

```typescript
// src/components/layout/sidebar.tsx

interface SidebarProps {
  className?: string
}

interface NavSection {
  label: string           // 섹션 라벨 (예: "모니터링")
  items: NavItem[]
}

interface NavItem {
  href: string            // 라우트 경로
  label: string           // 메뉴 표시 이름
  icon: LucideIcon        // Lucide 아이콘
  badge?: string | number // 배지 (예: 알림 수)
  disabled?: boolean      // 비활성화 여부
}

// 네비게이션 구조 정의
const NAV_SECTIONS: NavSection[] = [
  {
    label: "모니터링",
    items: [
      { href: "/monitoring/metrics", label: "시스템 메트릭", icon: Activity },
      { href: "/monitoring/processes", label: "프로세스", icon: Cpu },
      { href: "/monitoring/network", label: "네트워크", icon: Network },
    ]
  },
  {
    label: "데이터",
    items: [
      { href: "/data/tables", label: "테이블 에디터", icon: Table2 },
      { href: "/data/sql", label: "SQL 에디터", icon: Code2 },
    ]
  },
  {
    label: "로그",
    items: [
      { href: "/logs/realtime", label: "실시간 로그", icon: ScrollText },
      { href: "/logs/audit", label: "감사 로그", icon: Shield },
    ]
  }
]

const NAV_BOTTOM: NavItem[] = [
  { href: "/storage", label: "스토리지", icon: HardDrive },
  { href: "/auth", label: "인증/사용자", icon: Users },
  { href: "/settings", label: "설정", icon: Settings },
]
```

**상태 관리**:
- `usePathname()` (Next.js) 으로 현재 활성 메뉴 결정
- 사이드바 접기/펼치기 상태: `useState<boolean>` + `localStorage` 영속화
- 모바일: Sheet (shadcn/ui) 로 오버레이

**반응형 동작**:
- 데스크톱 (≥1024px): 고정 사이드바 (240px 너비)
- 태블릿 (768–1023px): 아이콘만 표시 (64px), 호버 시 툴팁
- 모바일 (<768px): 숨김, 햄버거 버튼으로 Sheet 오픈

**접근성**:
- `role="navigation"` + `aria-label="메인 네비게이션"`
- 활성 항목: `aria-current="page"`
- 비활성 항목: `aria-disabled="true"`
- 키보드: Tab으로 순회, Enter/Space로 이동

---

## 3. 컴포넌트 계층 구조

```
src/components/
├── layout/
│   ├── sidebar.tsx          ← 사이드바 네비게이션
│   ├── header.tsx           ← 상단 헤더 (Breadcrumb + 사용자 메뉴)
│   ├── breadcrumb.tsx       ← 경로 표시
│   ├── command-menu.tsx     ← Cmd+K 글로벌 검색
│   └── shell.tsx            ← 레이아웃 조합 컴포넌트
│
├── dashboard/
│   ├── stat-card.tsx        ← 수치 카드 (기존 개선)
│   ├── mini-chart.tsx       ← 인라인 스파크라인 차트
│   ├── metric-gauge.tsx     ← CPU/메모리 게이지
│   └── activity-feed.tsx   ← 최근 활동 피드
│
├── data-table/
│   ├── data-table.tsx       ← TanStack Table 래퍼
│   ├── data-table-toolbar.tsx  ← 검색/필터/컬럼 토글
│   ├── data-table-pagination.tsx ← 페이지네이션
│   ├── data-table-column-header.tsx ← 정렬 가능한 컬럼 헤더
│   └── data-table-row-actions.tsx  ← 행 액션 메뉴
│
├── editors/
│   ├── sql-editor.tsx       ← Monaco 기반 SQL 에디터
│   ├── inline-cell-editor.tsx ← 테이블 인라인 편집
│   └── json-viewer.tsx      ← JSON 값 표시
│
├── forms/
│   ├── modal-form.tsx       ← Dialog 기반 폼
│   ├── slideover-panel.tsx  ← Sheet 기반 사이드 패널
│   └── filter-bar.tsx       ← 테이블 필터 폼
│
├── feedback/
│   ├── status-badge.tsx     ← 상태 배지 (online/offline/error 등)
│   ├── skeleton-card.tsx    ← 로딩 스켈레톤
│   ├── empty-state.tsx      ← 데이터 없음 상태
│   └── error-boundary.tsx  ← React 에러 경계
│
├── navigation/
│   ├── tab-group.tsx        ← 탭 네비게이션
│   ├── tree-view.tsx        ← 폴더/파일 트리
│   └── timeline-item.tsx   ← 타임라인 항목
│
└── ui/                      ← shadcn/ui 컴포넌트 (자동 생성)
    ├── button.tsx
    ├── dialog.tsx
    ├── table.tsx
    ├── tabs.tsx
    ├── toast.tsx
    ├── command.tsx
    ├── sheet.tsx
    ├── badge.tsx
    ├── input.tsx
    ├── label.tsx
    ├── select.tsx
    ├── separator.tsx
    ├── skeleton.tsx
    ├── tooltip.tsx
    └── dropdown-menu.tsx
```

---

## 4. 주요 컴포넌트 상세 사양

### 4.1 DataTable 컴포넌트

TanStack Table v8 기반의 범용 데이터 테이블.

```typescript
// src/components/data-table/data-table.tsx

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]  // 컬럼 정의
  data: TData[]                         // 테이블 데이터
  loading?: boolean                     // 로딩 상태
  pagination?: {                        // 서버사이드 페이지네이션
    pageIndex: number
    pageSize: number
    pageCount: number
    onPageChange: (page: number) => void
    onPageSizeChange: (size: number) => void
  }
  sorting?: {                           // 서버사이드 정렬
    sortBy: string
    sortOrder: "asc" | "desc"
    onSortChange: (sort: SortingState) => void
  }
  selection?: {                         // 행 선택
    enabled: boolean
    onSelectionChange: (rows: TData[]) => void
  }
  onRowClick?: (row: TData) => void    // 행 클릭 핸들러
  toolbar?: React.ReactNode            // 커스텀 툴바
  emptyMessage?: string               // 빈 상태 메시지
  className?: string
}
```

**상태 관리**:
- 정렬, 필터, 페이지네이션 상태는 URL 쿼리 파라미터와 동기화 (`useSearchParams`)
- 컬럼 가시성은 `localStorage` 영속화
- 선택 상태는 컴포넌트 내부 `useState`

**반응형 동작**:
- 모바일: 가로 스크롤 + 고정 컬럼 (첫 번째 컬럼)
- 태블릿: 일부 컬럼 숨김 (`hideBelow: "md"` 컬럼 옵션)
- 데스크톱: 전체 컬럼 표시

**접근성**:
- `role="grid"` + `aria-rowcount`
- 정렬 버튼: `aria-sort="ascending|descending|none"`
- 로딩 상태: `aria-busy="true"`

### 4.2 StatCard 컴포넌트

```typescript
// src/components/dashboard/stat-card.tsx

interface StatCardProps {
  title: string                        // 카드 제목
  value: string | number               // 표시 값
  unit?: string                        // 단위 (%, MB, ms 등)
  change?: {                           // 변화율
    value: number                      // 변화 수치
    type: "increase" | "decrease" | "neutral"
    label?: string                     // "지난 1시간 대비"
  }
  chart?: {                            // 스파크라인 차트
    data: number[]
    color?: string
  }
  status?: "normal" | "warning" | "critical"  // 상태 색상
  icon?: LucideIcon                    // 아이콘
  loading?: boolean                    // 로딩 스켈레톤
  onClick?: () => void                 // 클릭 시 드릴다운
  className?: string
}
```

**상태 관리**: 무상태 (presentational 컴포넌트)

**반응형 동작**:
- 그리드 레이아웃: 모바일 1열 → 태블릿 2열 → 데스크톱 4열
- 카드 높이 고정 (120px)

**접근성**:
- `role="article"` + `aria-label="{title}: {value}{unit}"`
- 변화율: `aria-label="전월 대비 {change.value}% {type}"`

### 4.3 CommandMenu 컴포넌트

Cmd+K 글로벌 검색 팔레트 (Supabase 스타일).

```typescript
// src/components/layout/command-menu.tsx

interface CommandMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CommandItem {
  id: string
  label: string
  description?: string
  icon?: LucideIcon
  shortcut?: string[]               // ["⌘", "K"]
  action: () => void
  group: "navigation" | "actions" | "settings"
}

// 제공 명령어 목록
const COMMAND_ITEMS: CommandItem[] = [
  // 네비게이션
  { id: "goto-dashboard", label: "대시보드로 이동", group: "navigation", ... },
  { id: "goto-tables", label: "테이블 에디터 열기", group: "navigation", ... },
  { id: "goto-sql", label: "SQL 에디터 열기", group: "navigation", ... },
  // 액션
  { id: "new-query", label: "새 SQL 쿼리", group: "actions", ... },
  { id: "refresh-metrics", label: "메트릭 새로고침", group: "actions", ... },
  // 설정
  { id: "open-settings", label: "설정 열기", group: "settings", ... },
]
```

**상태 관리**:
- `open` 상태: 부모(Header)에서 관리
- 키보드 단축키: `useEffect`로 `Cmd+K` / `Ctrl+K` 리스너 등록

### 4.4 SQLEditor 컴포넌트

Monaco Editor 기반 SQL 에디터.

```typescript
// src/components/editors/sql-editor.tsx

interface SQLEditorProps {
  value: string                        // SQL 쿼리 텍스트
  onChange: (value: string) => void    // 변경 핸들러
  onExecute: (query: string) => void   // 실행 핸들러 (Ctrl+Enter)
  schema?: TableSchema[]               // 자동완성용 스키마 정보
  loading?: boolean                    // 실행 중 상태
  readOnly?: boolean                   // 읽기 전용
  height?: string | number             // 에디터 높이
}

interface TableSchema {
  tableName: string
  columns: { name: string; type: string }[]
}
```

**Monaco 설정**:
- 언어: `sql`
- 테마: `vs-dark` (현재 다크 테마와 일치)
- 자동완성: 스키마 기반 테이블명/컬럼명 제안
- 단축키: `Ctrl+Enter` → 실행, `Ctrl+/` → 주석 토글

**상태 관리**:
- 쿼리 히스토리: `localStorage` (최근 20개)
- 실행 결과: 부모 컴포넌트(`/data/sql` 페이지)에서 관리

### 4.5 StatusBadge 컴포넌트

```typescript
// src/components/feedback/status-badge.tsx

type StatusType =
  | "online"      // 초록
  | "offline"     // 회색
  | "error"       // 빨강
  | "warning"     // 노랑
  | "running"     // 파랑 (애니메이션)
  | "stopped"     // 회색
  | "pending"     // 노랑 (깜빡임)

interface StatusBadgeProps {
  status: StatusType
  label?: string                       // 기본값: status 한국어 변환
  size?: "sm" | "md" | "lg"
  pulse?: boolean                      // 펄스 애니메이션
  className?: string
}

// 상태 → 한국어 + 색상 매핑
const STATUS_MAP: Record<StatusType, { label: string; color: string }> = {
  online:  { label: "온라인",  color: "bg-emerald-500" },
  offline: { label: "오프라인", color: "bg-zinc-500" },
  error:   { label: "오류",    color: "bg-red-500" },
  warning: { label: "경고",    color: "bg-yellow-500" },
  running: { label: "실행 중", color: "bg-blue-500" },
  stopped: { label: "중지됨",  color: "bg-zinc-500" },
  pending: { label: "대기 중", color: "bg-yellow-500" },
}
```

### 4.6 SlideoverPanel 컴포넌트

```typescript
// src/components/forms/slideover-panel.tsx

interface SlideoverPanelProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: "sm" | "md" | "lg" | "xl"   // 너비: 400/560/720/960px
  footer?: React.ReactNode            // 하단 버튼 영역
  children: React.ReactNode
}
```

**용도**:
- 행 상세 정보 표시 (읽기 전용)
- 행 편집 폼
- 파일 업로드 패널
- 사용자 권한 편집

---

## 5. shadcn/ui 도입 전략

### 5.1 도입할 컴포넌트 목록

| 컴포넌트 | 용도 | 우선순위 |
|---------|------|---------|
| `button` | 모든 버튼 | 1 (즉시) |
| `input` | 모든 입력 필드 | 1 (즉시) |
| `label` | 폼 레이블 | 1 (즉시) |
| `dialog` | 모달 폼, 확인 다이얼로그 | 1 (즉시) |
| `sheet` | 사이드 패널, 모바일 사이드바 | 1 (즉시) |
| `table` | 데이터 테이블 기반 | 1 (즉시) |
| `tabs` | 페이지 내 탭 전환 | 1 (즉시) |
| `badge` | 상태 배지 | 1 (즉시) |
| `skeleton` | 로딩 스켈레톤 | 1 (즉시) |
| `toast` | 알림 메시지 (Sonner) | 1 (즉시) |
| `command` | Cmd+K 팔레트 | 2 (Wave 4) |
| `tooltip` | 아이콘 툴팁 | 2 (Wave 4) |
| `select` | 드롭다운 선택 | 2 (Wave 4) |
| `dropdown-menu` | 행 액션 메뉴 | 2 (Wave 4) |
| `separator` | 구분선 | 2 (Wave 4) |
| `card` | 카드 래퍼 | 2 (Wave 4) |
| `scroll-area` | 커스텀 스크롤바 | 3 (Wave 5) |
| `resizable` | 패널 크기 조절 | 3 (Wave 5) |
| `collapsible` | 접을 수 있는 섹션 | 3 (Wave 5) |

### 5.2 기존 컴포넌트 전환 계획

```
전환 대상 (현재 커스텀 → shadcn/ui)

1. src/components/dashboard/stat-card.tsx
   - Card 컴포넌트 기반으로 내부 구조 변경
   - 외부 인터페이스(props) 유지 → 사용처 변경 없음

2. src/components/layout/sidebar.tsx
   - Sheet 컴포넌트 활용 (모바일 오버레이)
   - NavigationMenu 패턴 참고
   - 외부 인터페이스 유지

3. 신규 toast 시스템
   - 현재: 없음 (alert() 사용 가능성)
   - 목표: Sonner (shadcn/ui 권장) 도입
   - layout.tsx에 Toaster 추가
```

### 5.3 테마 커스터마이징

현재 다크 테마를 유지하면서 shadcn/ui 테마 변수를 덮어씌운다.

```css
/* src/app/globals.css */

:root {
  --background: 0 0% 8%;         /* 현재 #141414 */
  --foreground: 0 0% 95%;        /* 밝은 텍스트 */
  --card: 0 0% 10%;              /* 카드 배경 */
  --card-foreground: 0 0% 95%;
  --popover: 0 0% 12%;
  --popover-foreground: 0 0% 95%;
  --primary: 142 71% 45%;        /* 초록 (Supabase 브랜드 색) */
  --primary-foreground: 0 0% 0%;
  --secondary: 0 0% 15%;
  --secondary-foreground: 0 0% 80%;
  --muted: 0 0% 13%;
  --muted-foreground: 0 0% 55%;
  --accent: 0 0% 18%;
  --accent-foreground: 0 0% 95%;
  --destructive: 0 84% 60%;      /* 빨강 */
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 18%;
  --input: 0 0% 15%;
  --ring: 142 71% 45%;
  --radius: 0.375rem;
}
```

---

## 6. 페이지별 와이어프레임 (ASCII)

### 6.1 대시보드 홈 (/)

```
┌──────────────────────────────────────────────────────────┐
│ [≡] 양평 부엌                    🔍 검색 (Cmd+K)  [👤]  │ ← Header
├──────────┬───────────────────────────────────────────────┤
│          │  대시보드                                      │ ← Breadcrumb
│  대시보드 │  ─────────────────────────────────────────── │
│          │                                               │
│  모니터링 │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──┐│ ← StatCard ×4
│  시스템   │  │ CPU 사용  │ │ 메모리   │ │ 디스크   │ │네││
│  프로세스 │  │  23%     │ │  67%     │ │  45%     │ │트││
│  네트워크 │  │ ▲ 2%     │ │  ───→    │ │  ───→    │ │워││
│          │  └──────────┘ └──────────┘ └──────────┘ └──┘│
│  데이터   │                                               │
│  테이블   │  ┌────────────────────────┐ ┌───────────────┐│
│  SQL      │  │  시스템 메트릭 (1시간)  │ │  PM2 프로세스  ││
│          │  │  ████████████           │ │  ● luckystyle ││
│  로그     │  │  CPU ──────────        │ │  ● nginx      ││
│  실시간   │  │  MEM ──────────        │ │  ○ backup     ││
│  감사     │  └────────────────────────┘ └───────────────┘│
│          │                                               │
│  스토리지 │  ┌────────────────────────────────────────┐  │
│  인증     │  │  최근 감사 로그                          │  │
│  설정     │  │  2026-04-06 09:12  admin  PM2 restart  │  │
│          │  │  2026-04-06 09:10  admin  로그인         │  │
├──────────┤  └────────────────────────────────────────┘  │
│  👤 admin │                                               │
└──────────┴───────────────────────────────────────────────┘
```

### 6.2 테이블 에디터 (/data/tables)

```
┌──────────────────────────────────────────────────────────┐
│ [≡] 양평 부엌         데이터 > 테이블 에디터   🔍  [👤] │
├──────────┬───────────────────────────────────────────────┤
│          │  테이블 에디터                                  │
│  ...사이드│  ─────────────────────────────────────────── │
│  바 동일  │                                               │
│          │  ┌─────────────────┐  ┌─────────────────────┐│
│          │  │  테이블 목록     │  │  users              ││ ← 선택된 테이블
│          │  │  ─────────────  │  │  ─────────────────  ││
│          │  │  📋 users       │  │  [+ 행 추가] [필터▼] ││
│          │  │  📋 sessions    │  │                      ││
│          │  │  📋 audit_logs  │  │  id │ name │ role    ││
│          │  │  📋 settings    │  │  ───┼──────┼───────  ││
│          │  │                 │  │   1 │admin │admin    ││
│          │  │  [+ 새 테이블]  │  │   2 │ ...  │user     ││
│          │  └─────────────────┘  │                      ││
│          │                       │  ← 1-10 / 24 →       ││
│          │                       └─────────────────────┘│
│          │                                               │
└──────────┴───────────────────────────────────────────────┘
```

### 6.3 SQL 에디터 (/data/sql)

```
┌──────────────────────────────────────────────────────────┐
│ [≡] 양평 부엌         데이터 > SQL 에디터     🔍  [👤]  │
├──────────┬───────────────────────────────────────────────┤
│          │  SQL 에디터                                    │
│  ...사이드│  ─────────────────────────────────────────── │
│  바 동일  │                                               │
│          │  ┌──────────────────────────────────────────┐ │
│          │  │  SELECT * FROM users                     │ │ ← Monaco 에디터
│          │  │  WHERE role = 'admin'                    │ │
│          │  │  LIMIT 10;                               │ │
│          │  │                                          │ │
│          │  │                                          │ │
│          │  └──────────────────────────────────────────┘ │
│          │  [▶ 실행 Ctrl+Enter]  [히스토리▼]  [저장]      │
│          │  ─────────────────────────────────────────── │
│          │  결과 (1행, 0.3ms)                            │
│          │  ┌────┬───────┬───────┐                      │
│          │  │ id │ name  │ role  │                      │
│          │  ├────┼───────┼───────┤                      │
│          │  │  1 │ admin │ admin │                      │
│          │  └────┴───────┴───────┘                      │
│          │  [CSV 내보내기]                               │
└──────────┴───────────────────────────────────────────────┘
```

### 6.4 실시간 로그 (/logs/realtime)

```
┌──────────────────────────────────────────────────────────┐
│ [≡] 양평 부엌         로그 > 실시간 로그      🔍  [👤]  │
├──────────┬───────────────────────────────────────────────┤
│          │  실시간 로그                                   │
│  ...사이드│  ─────────────────────────────────────────── │
│  바 동일  │  프로세스: [luckystyle4u ▼]  레벨: [전체 ▼]  │
│          │  [■ 일시정지]  [🗑 지우기]  ● 연결됨 (SSE)    │
│          │  ─────────────────────────────────────────── │
│          │  ┌──────────────────────────────────────────┐ │
│          │  │09:15:23 [INFO]  서버 시작됨 port 3000    │ │
│          │  │09:15:24 [INFO]  DB 연결 성공             │ │
│          │  │09:15:25 [WARN]  메모리 사용 70% 초과     │ │
│          │  │09:15:26 [ERROR] 요청 처리 실패 /api/x    │ │
│          │  │                                          │ │
│          │  │                          ← 자동 스크롤 ↓ │ │
│          │  └──────────────────────────────────────────┘ │
└──────────┴───────────────────────────────────────────────┘
```

### 6.5 감사 로그 (/logs/audit)

```
┌──────────────────────────────────────────────────────────┐
│ [≡] 양평 부엌         로그 > 감사 로그        🔍  [👤]  │
├──────────┬───────────────────────────────────────────────┤
│          │  감사 로그                                     │
│  ...사이드│  ─────────────────────────────────────────── │
│  바 동일  │  [기간 선택▼]  [액션 유형▼]  [사용자▼]  [검색]│
│          │  ─────────────────────────────────────────── │
│          │  ┌─────────────┬──────┬────────────┬────────┐│
│          │  │  시각        │ 사용자│  액션      │  결과  ││
│          │  ├─────────────┼──────┼────────────┼────────┤│
│          │  │2026-04-06..│admin │ 로그인      │  성공  ││
│          │  │2026-04-06..│admin │ PM2 restart │  성공  ││
│          │  │2026-04-06..│admin │ SQL 실행    │  성공  ││
│          │  └─────────────┴──────┴────────────┴────────┘│
│          │  ← 1 2 3 ... 24 →    [CSV 내보내기]           │
└──────────┴───────────────────────────────────────────────┘
```

### 6.6 스토리지 (/storage)

```
┌──────────────────────────────────────────────────────────┐
│ [≡] 양평 부엌         스토리지               🔍  [👤]   │
├──────────┬───────────────────────────────────────────────┤
│          │  스토리지                                      │
│  ...사이드│  ─────────────────────────────────────────── │
│  바 동일  │  ┌───────────────────────────────────────────┐│
│          │  │  📁 backups                               ││ ← 버킷 목록
│          │  │  📁 uploads                               ││
│          │  │  📁 exports                               ││
│          │  │  [+ 새 버킷]                              ││
│          │  └───────────────────────────────────────────┘│
│          │                                               │
│          │  backups/ ← 1.2 GB / 5.0 GB                  │
│          │  ┌──────────────┬──────┬─────────┬─────────┐ │
│          │  │  파일명       │ 크기  │ 수정일   │  액션  │ │
│          │  ├──────────────┼──────┼─────────┼─────────┤ │
│          │  │  db-240406   │512MB │04-06    │[↓][🗑] │ │
│          │  └──────────────┴──────┴─────────┴─────────┘ │
│          │  [📤 파일 업로드]                              │
└──────────┴───────────────────────────────────────────────┘
```

### 6.7 설정 (/settings)

```
┌──────────────────────────────────────────────────────────┐
│ [≡] 양평 부엌         설정                   🔍  [👤]   │
├──────────┬───────────────────────────────────────────────┤
│          │  설정                                          │
│  ...사이드│  ─────────────────────────────────────────── │
│  바 동일  │  [일반] [보안] [알림] [백업]                  │ ← Tabs
│          │  ─────────────────────────────────────────── │
│          │  일반 설정                                    │
│          │                                               │
│          │  서버 이름                                    │
│          │  ┌──────────────────────────────────────────┐ │
│          │  │  양평 부엌 서버                           │ │
│          │  └──────────────────────────────────────────┘ │
│          │                                               │
│          │  메트릭 수집 간격 (초)                        │
│          │  ┌──────────────────────────────────────────┐ │
│          │  │  30                                      │ │
│          │  └──────────────────────────────────────────┘ │
│          │                                               │
│          │  [저장]                                       │
└──────────┴───────────────────────────────────────────────┘
```

---

## 7. 컴포넌트 개발 우선순위 및 의존성

### 7.1 Phase 1 (Wave 4): 기반 컴포넌트

```
의존성 순서:
1. shadcn/ui 설치 및 테마 설정
   ↓
2. layout/shell.tsx (사이드바 + 헤더 조합)
   ↓
3. layout/sidebar.tsx (메뉴 확장)
   ↓
4. feedback/status-badge.tsx
5. feedback/skeleton-card.tsx
6. feedback/empty-state.tsx
   ↓
7. data-table/data-table.tsx (TanStack Table)
   ↓
8. 페이지 구현: /data/tables, /logs/audit
```

### 7.2 Phase 2 (Wave 5): 고급 컴포넌트

```
1. editors/sql-editor.tsx (Monaco)
   ↓
2. /data/sql 페이지
   ↓
3. layout/command-menu.tsx (Cmd+K)
   ↓
4. /storage 페이지
5. /auth 페이지
```

---

## 8. 코딩 규칙 및 패턴

### 8.1 컴포넌트 파일 구조

```typescript
// 1. import 순서: React → Next.js → 외부 라이브러리 → 내부
import React, { useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import { LucideIcon, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { NavItem } from "@/types/navigation"

// 2. 타입 정의 (파일 상단)
interface MyComponentProps { ... }

// 3. 상수 (컴포넌트 외부)
const MY_CONSTANT = "value"

// 4. 컴포넌트 (named export 권장)
export function MyComponent({ prop }: MyComponentProps) {
  // 5. 훅
  const [state, setState] = useState(false)
  
  // 6. 이벤트 핸들러 (useCallback)
  const handleClick = useCallback(() => { ... }, [])
  
  // 7. 파생 값
  const derivedValue = state ? "a" : "b"
  
  // 8. JSX
  return (
    <div className={cn("base-class", derivedValue)}>
      ...
    </div>
  )
}
```

### 8.2 cn() 유틸리티 사용

```typescript
// shadcn/ui 패턴: clsx + tailwind-merge
import { cn } from "@/lib/utils"

// 조건부 클래스
<div className={cn(
  "base-styles",
  isActive && "active-styles",
  variant === "primary" && "primary-styles",
  className  // 항상 마지막에 외부 className 병합
)} />
```

### 8.3 서버 컴포넌트 vs 클라이언트 컴포넌트

```
서버 컴포넌트 (기본):
- 정적 레이아웃 (shell.tsx의 구조)
- 데이터 패칭 (async 컴포넌트)
- 민감 데이터 처리

클라이언트 컴포넌트 ("use client"):
- 인터랙션 필요 (onClick, onChange 등)
- useEffect, useState 사용
- Browser API 사용 (localStorage 등)
- 실시간 업데이트 (SSE 수신)
```

---

## 9. 접근성 체크리스트

- [ ] 모든 인터랙티브 요소에 키보드 포커스 가능
- [ ] 색상만으로 정보를 전달하지 않음 (텍스트 레이블 함께 제공)
- [ ] 아이콘 버튼에 `aria-label` 또는 스크린리더용 텍스트 포함
- [ ] 테이블에 `<caption>` 또는 `aria-label` 제공
- [ ] 모달/다이얼로그 열릴 때 포커스 이동, 닫힐 때 원래 위치로 복귀
- [ ] 에러 메시지와 입력 필드 `aria-describedby`로 연결
- [ ] 로딩 상태: `aria-busy="true"` + 스크린리더용 "로딩 중" 텍스트
- [ ] 색상 대비비: 일반 텍스트 4.5:1 이상, 큰 텍스트 3:1 이상

---

## 10. 참고 자료

- shadcn/ui 공식 문서: https://ui.shadcn.com
- TanStack Table v8: https://tanstack.com/table
- Lucide 아이콘: https://lucide.dev
- Monaco Editor React: https://github.com/suren-atoyan/monaco-react
- Supabase 대시보드 디자인 참고: https://supabase.com/dashboard
