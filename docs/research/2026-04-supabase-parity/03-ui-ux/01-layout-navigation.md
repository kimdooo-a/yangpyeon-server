# 01. 레이아웃 및 네비게이션 — 양평 부엌 서버 대시보드

> Wave 4 · Tier 3 (U1) 산출물 — kdywave W4-U1 (Agent UI/UX-1)
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [03-ui-ux/](./) → **이 문서**
> 참조: [02-architecture/00-system-overview.md](../02-architecture/00-system-overview.md) · [00-design-system.md](./00-design-system.md) · [00-vision/01-user-stories.md](../00-vision/01-user-stories.md)
> 근거: NFR-UX.1~3, NFR-CMP.1~2, AP-3 단일 코드베이스 원칙

---

## 목차

- [1. 앱 셸 구조 (3-pane)](#1-앱-셸-구조-3-pane)
- [2. 사이드바 네비게이션](#2-사이드바-네비게이션)
- [3. 반응형 동작](#3-반응형-동작)
- [4. 헤더 구조](#4-헤더-구조)
- [5. 브레드크럼 규칙](#5-브레드크럼-규칙)
- [6. 전역 단축키 — Cmd+K 커맨드 팔레트](#6-전역-단축키--cmdk-커맨드-팔레트)
- [7. 페이지 전환 애니메이션](#7-페이지-전환-애니메이션)
- [8. Next.js 16 App Router 매핑](#8-nextjs-16-app-router-매핑)
- [9. Route 그룹 레이아웃](#9-route-그룹-레이아웃)
- [10. 사이드바 상태 관리](#10-사이드바-상태-관리)
- [부록 B. 전체 라우트 트리](#부록-b-전체-라우트-트리)

---

## 1. 앱 셸 구조 (3-pane)

### 1.1 전체 레이아웃 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER (h-12, 48px)                                                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ [로고] [환경배지]        [전역검색] [알림] [사용자메뉴]        │   │
│  └──────────────────────────────────────────────────────────────┘   │
├──────────┬──────────────────────────────────────┬──────────────────┤
│ SIDEBAR  │ MAIN CONTENT                         │ CONTEXT PANEL    │
│ (240px   │                                      │ (320px, 조건부)  │
│  또는    │  [브레드크럼]                         │                  │
│  56px    │  ┌──────────────────────────────┐    │  [Properties]    │
│  아이콘) │  │                              │    │  또는            │
│          │  │  페이지 콘텐츠               │    │  [AI Assistant]  │
│ [메뉴1]  │  │  (TanStack Table,            │    │                  │
│ [메뉴2]  │  │   Monaco Editor,             │    │                  │
│ [메뉴3]  │  │   Schema Canvas 등)          │    │                  │
│  ...     │  │                              │    │                  │
│          │  └──────────────────────────────┘    │                  │
│ [설정]   │                                      │                  │
└──────────┴──────────────────────────────────────┴──────────────────┘
```

### 1.2 Pane 역할 정의

| Pane | 너비 | 컴포넌트 | 조건 |
|------|------|---------|------|
| **Sidebar** | 240px (확장) / 56px (축소) | `AppSidebar` | 항상 표시 (mobile: drawer) |
| **Main Content** | flex-1 (나머지 전체) | `<main>` | 항상 표시 |
| **Context Panel** | 320px (기본) | `PropertiesPanel` / `AIAssistantPanel` | 조건부 (페이지 요청 시) |

### 1.3 레이아웃 컴포넌트 계층

```
src/app/(dashboard)/layout.tsx
└── DashboardLayout
    ├── AppSidebar          ← 사이드바 (shadcn Sidebar 컴포넌트 기반)
    ├── SidebarInset        ← 메인 영역 래퍼
    │   ├── AppHeader       ← 헤더
    │   ├── main            ← 페이지 콘텐츠
    │   │   └── {children}  ← 각 페이지 Server Component
    │   └── (StatusBar)     ← 선택적 상태 바 (SQL Editor 등)
    └── ContextPanel        ← 우측 패널 (조건부)
```

### 1.4 레이아웃 CSS 구조

```tsx
// src/app/(dashboard)/layout.tsx
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

---

## 2. 사이드바 네비게이션

### 2.1 전체 메뉴 구조 (14 카테고리)

```
AppSidebar
│
├── [로고 영역]
│   └── "양평 부엌" + 버전 배지
│
├── [환경 배지]
│   └── 개발(dev) / 스테이징(staging) / 프로덕션(prod)
│
├── [주 네비게이션 그룹]
│   │
│   ├── 📊 Dashboard              /dashboard
│   │
│   ├── [Editor 그룹]
│   │   ├── 📋 Table Editor        /database/tables
│   │   └── 💻 SQL Editor          /database/sql
│   │
│   ├── [Database 그룹]
│   │   ├── 🗄  Schema Visualizer  /database/schema
│   │   ├── 🛡  Policies           /database/policies
│   │   ├── ⚡ Functions           /database/functions
│   │   ├── 🔔 Triggers            /database/triggers
│   │   ├── ⏰ Cron Jobs           /database/cron
│   │   ├── 🔗 Webhooks            /database/webhooks
│   │   └── 💾 Backups             /database/backups
│   │
│   ├── 🔐 Auth                   /auth
│   ├── 📁 Storage                /storage
│   ├── 🚀 Edge Functions         /edge-functions
│   ├── 📡 Realtime               /realtime
│   ├── 🔍 Advisors               /advisors
│   └── 🌐 API                    /api-docs
│
├── [하단 그룹]
│   └── ⚙ Settings                /settings
│       ├── Infrastructure         /settings/infrastructure
│       ├── Vault                  /settings/vault
│       ├── JWKS                   /settings/jwks
│       ├── Deployments            /settings/deployments
│       ├── Security               /settings/security
│       └── AI                     /settings/ai
│
└── [사용자 영역]
    └── 아바타 + 이름 + 역할 배지
```

### 2.2 사이드바 컴포넌트 구조

```tsx
// src/components/layout/app-sidebar.tsx

const NAVIGATION_ITEMS: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    group: null,
  },
  {
    group: 'Editor',
    items: [
      { title: 'Table Editor', href: '/database/tables', icon: Table2 },
      { title: 'SQL Editor', href: '/database/sql', icon: Code2 },
    ],
  },
  {
    group: 'Database',
    items: [
      { title: 'Schema Visualizer', href: '/database/schema', icon: Database },
      { title: 'Policies', href: '/database/policies', icon: Shield },
      { title: 'Functions', href: '/database/functions', icon: Zap },
      { title: 'Triggers', href: '/database/triggers', icon: Bell },
      { title: 'Cron Jobs', href: '/database/cron', icon: Clock },
      { title: 'Webhooks', href: '/database/webhooks', icon: Webhook },
      { title: 'Backups', href: '/database/backups', icon: HardDrive },
    ],
  },
  { title: 'Auth', href: '/auth', icon: Lock, group: null },
  { title: 'Storage', href: '/storage', icon: FolderOpen, group: null },
  { title: 'Edge Functions', href: '/edge-functions', icon: Activity, group: null },
  { title: 'Realtime', href: '/realtime', icon: Radio, group: null },
  { title: 'Advisors', href: '/advisors', icon: AlertCircle, group: null },
  { title: 'API', href: '/api-docs', icon: Globe, group: null },
];

const SETTINGS_ITEMS: NavItem[] = [
  { title: 'Infrastructure', href: '/settings/infrastructure', icon: Server },
  { title: 'Vault', href: '/settings/vault', icon: KeyRound },
  { title: 'JWKS', href: '/settings/jwks', icon: Key },
  { title: 'Deployments', href: '/settings/deployments', icon: GitBranch },
  { title: 'Security', href: '/settings/security', icon: ShieldCheck },
  { title: 'AI', href: '/settings/ai', icon: Sparkles },
];
```

### 2.3 사이드바 메뉴 항목 스타일

**기본 상태**:
```
배경: 투명
텍스트: text-muted-foreground (#A1A1AA)
아이콘: text-muted-foreground
패딩: px-3 py-2
```

**호버 상태**:
```
배경: bg-sidebar-accent (#1C1C1E)
텍스트: text-sidebar-accent-foreground (#EDEDED)
아이콘: text-sidebar-accent-foreground
전환: transition-colors duration-100
```

**활성(current page) 상태**:
```
배경: bg-sidebar-accent (#1C1C1E)
텍스트: text-sidebar-primary-foreground (#FFFFFF)
아이콘: text-sidebar-primary (#2D9F6F)
왼쪽 강조선: border-l-2 border-sidebar-primary
```

**그룹 레이블**:
```
텍스트: text-[11px] font-medium uppercase tracking-widest text-muted-foreground
패딩: px-3 py-1 mt-4 mb-1
```

### 2.4 Settings 서브메뉴 동작

Settings 항목은 클릭 시 아코디언으로 확장:

```
⚙ Settings                    ← 클릭 시 펼침
   ├── Infrastructure
   ├── Vault
   ├── JWKS
   ├── Deployments
   ├── Security
   └── AI
```

- 확장/축소: `shadcn Collapsible` 컴포넌트 사용
- 서브메뉴 항목은 `pl-9` (36px 들여쓰기)
- 현재 페이지가 서브메뉴 내부면 Settings 항목도 활성 스타일 적용

### 2.5 사이드바 헤더 (로고 영역)

```tsx
<SidebarHeader className="h-12 border-b border-sidebar-border">
  <div className="flex items-center gap-2 px-3">
    <div className="h-6 w-6 rounded bg-brand flex items-center justify-center">
      <span className="text-[10px] font-bold text-white">양</span>
    </div>
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-foreground">양평 부엌</span>
      <span className="text-[10px] text-muted-foreground">stylelucky4u.com</span>
    </div>
  </div>
</SidebarHeader>
```

### 2.6 환경 배지

헤더 상단 또는 사이드바 로고 우측에 현재 환경 표시:

```tsx
const ENV_BADGE = {
  development: { label: 'dev', color: 'bg-warning/20 text-warning border-warning/30' },
  staging: { label: 'staging', color: 'bg-info/20 text-info border-info/30' },
  production: { label: 'prod', color: 'bg-success/20 text-success border-success/30' },
};

// 환경: process.env.NODE_ENV 또는 NEXT_PUBLIC_ENV
<Badge
  variant="outline"
  className={cn(
    "text-[10px] font-medium px-1.5 py-0",
    ENV_BADGE[env].color
  )}
>
  {ENV_BADGE[env].label}
</Badge>
```

---

## 3. 반응형 동작

### 3.1 브레이크포인트 정의

| 이름 | 크기 | Tailwind | 설명 |
|------|------|---------|------|
| **mobile** | < 768px | 기본 | 스마트폰, 소형 태블릿 (세로) |
| **tablet** | 768px ~ 1023px | `md:` | 태블릿, 노트북 소형 |
| **desktop** | 1024px ~ 1279px | `lg:` | 노트북, 데스크톱 |
| **wide** | 1280px ~ 1535px | `xl:` | 대형 모니터 |
| **ultrawide** | ≥ 1536px | `2xl:` | 울트라와이드 |

### 3.2 mobile (< 768px) — Drawer 모드

```
┌─────────────────────────────┐
│ HEADER (h-12)               │
│ [≡ 메뉴] [로고] [사용자]     │
├─────────────────────────────┤
│                             │
│  MAIN CONTENT (전체 너비)   │
│                             │
│  Context Panel: 숨김        │
│  (필요 시 Bottom Sheet)     │
│                             │
└─────────────────────────────┘

사이드바: Drawer (좌측 슬라이드)
  - 햄버거 버튼으로 토글
  - 오버레이 클릭 시 닫힘
  - 너비: 80vw (최대 320px)
  - 전환: translate-x 300ms ease-out
```

구현:
```tsx
// mobile에서 SidebarProvider가 Sheet로 전환
<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
  <SheetContent side="left" className="w-[80vw] max-w-[320px] p-0">
    <AppSidebar />
  </SheetContent>
</Sheet>
```

### 3.3 tablet (768px ~ 1023px) — 아이콘 전용 모드

```
┌──────┬─────────────────────────────────────┐
│ SB   │ HEADER (h-12)                       │
│ 56px │                                     │
│      ├─────────────────────────────────────┤
│ [아] │                                     │
│ [이] │  MAIN CONTENT (flex-1)              │
│ [콘] │                                     │
│      │  Context Panel: 숨김                │
│ ...  │  (요청 시 오버레이 패널)             │
│      │                                     │
│ [⚙] │                                     │
└──────┴─────────────────────────────────────┘

사이드바: 56px (아이콘만)
  - 텍스트 레이블 숨김
  - 툴팁으로 레이블 표시 (마우스오버)
  - 확장 버튼 없음 (자동 축소)
```

### 3.4 desktop (≥ 1024px) — 전체 3-pane 모드

```
┌────────┬───────────────────────────────┬─────────┐
│ SB     │ HEADER                        │ (CP)    │
│ 240px  │                               │ 320px   │
│        ├───────────────────────────────┤ 조건부  │
│ 전체   │ MAIN CONTENT                  │         │
│ 메뉴   │                               │ Props   │
│        │                               │ 또는    │
│        │                               │ AI      │
└────────┴───────────────────────────────┴─────────┘
```

### 3.5 Context Panel 조건

Context Panel은 다음 조건에서만 표시:

| 페이지 | 표시 조건 | 내용 |
|--------|---------|------|
| `/database/tables/[table]` | 셀 선택 또는 행 선택 시 | 행 상세 (Properties) |
| `/database/schema` | 테이블 노드 클릭 시 | 테이블 정보, RLS 정책 |
| `/database/sql` | AI Assistant 열기 | AI 대화 패널 |
| `/dashboard/assistant` | 항상 | AI 대화 전용 |
| 기타 페이지 | 사용자 명시적 열기 | AI Assistant |

---

## 4. 헤더 구조

### 4.1 헤더 레이아웃

```
┌─────────────────────────────────────────────────────────────────────┐
│ h-12 (48px)   bg-sidebar border-b border-sidebar-border             │
│                                                                     │
│ [사이드바 토글] [브레드크럼]           [검색] [알림] [사용자]         │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 헤더 컴포넌트

```tsx
// src/components/layout/app-header.tsx
export function AppHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      {/* 사이드바 토글 버튼 */}
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* 브레드크럼 */}
      <AppBreadcrumb />

      {/* 오른쪽 영역 */}
      <div className="ml-auto flex items-center gap-2">
        {/* 전역 검색 */}
        <GlobalSearchButton />

        {/* AI Assistant 토글 */}
        <AIAssistantToggle />

        {/* 사용자 메뉴 */}
        <UserMenu />
      </div>
    </header>
  );
}
```

### 4.3 전역 검색 버튼

```tsx
// Cmd+K 또는 클릭 시 커맨드 팔레트 열기
function GlobalSearchButton() {
  return (
    <Button
      variant="outline"
      className="h-8 w-[200px] justify-between text-muted-foreground text-sm"
      onClick={() => setCommandOpen(true)}
    >
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5" />
        <span>검색...</span>
      </div>
      <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] opacity-100 sm:flex">
        <span>⌘</span>K
      </kbd>
    </Button>
  );
}
```

### 4.4 사용자 메뉴 (DropdownMenu)

```
[아바타 (initials)] ← 클릭 시 드롭다운
└── 이름 (admin@양평)
    역할 배지 (ADMIN / MANAGER / USER)
    ──────────
    ⚙ 프로필 설정
    🔐 보안 (MFA 설정)
    ──────────
    🚪 로그아웃
```

---

## 5. 브레드크럼 규칙

### 5.1 브레드크럼 구조

```tsx
// src/components/layout/app-breadcrumb.tsx
// Next.js App Router의 현재 경로를 읽어 자동 생성
```

### 5.2 경로 → 브레드크럼 매핑

| 경로 | 브레드크럼 |
|------|-----------|
| `/dashboard` | Dashboard |
| `/database/tables` | Database / Tables |
| `/database/tables/users` | Database / Tables / users |
| `/database/sql` | Database / SQL Editor |
| `/database/schema` | Database / Schema |
| `/database/policies` | Database / Policies |
| `/database/functions` | Database / Functions |
| `/database/triggers` | Database / Triggers |
| `/database/cron` | Database / Cron Jobs |
| `/database/webhooks` | Database / Webhooks |
| `/database/backups` | Database / Backups |
| `/auth` | Auth |
| `/auth/users` | Auth / Users |
| `/auth/sessions` | Auth / Sessions |
| `/storage` | Storage |
| `/storage/buckets` | Storage / Buckets |
| `/edge-functions` | Edge Functions |
| `/realtime` | Realtime |
| `/advisors` | Advisors |
| `/api-docs` | API |
| `/settings` | Settings |
| `/settings/infrastructure` | Settings / Infrastructure |
| `/settings/vault` | Settings / Vault |
| `/settings/ai` | Settings / AI |

### 5.3 브레드크럼 컴포넌트

```tsx
export function AppBreadcrumb() {
  const pathname = usePathname();
  const segments = generateBreadcrumbs(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => (
          <React.Fragment key={segment.href}>
            {index > 0 && (
              <BreadcrumbSeparator>
                <ChevronRight className="h-3.5 w-3.5" />
              </BreadcrumbSeparator>
            )}
            <BreadcrumbItem>
              {index === segments.length - 1 ? (
                <BreadcrumbPage className="text-foreground">
                  {segment.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={segment.href} className="text-muted-foreground hover:text-foreground">
                  {segment.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

---

## 6. 전역 단축키 — Cmd+K 커맨드 팔레트

### 6.1 cmdk 기반 커맨드 팔레트

```
┌─────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────┐  │
│  │ 🔍  검색 또는 명령...                          │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  최근 방문                                          │
│  ├── 📋 Table Editor — users                        │
│  ├── 💻 SQL Editor — 최근 쿼리                      │
│  └── 🗄  Schema Visualizer                          │
│                                                     │
│  페이지 이동                                        │
│  ├── Dashboard                         Alt+1        │
│  ├── Table Editor                      Alt+2        │
│  ├── SQL Editor                        Alt+3        │
│  ├── Auth                              Alt+4        │
│  └── ...                                            │
│                                                     │
│  액션                                               │
│  ├── 새 SQL 쿼리 작성...                            │
│  ├── 테이블 생성...                                  │
│  ├── 백업 실행...                                   │
│  └── 로그아웃                                       │
└─────────────────────────────────────────────────────┘
```

### 6.2 단축키 등록

```tsx
// src/components/layout/command-palette.tsx
// cmdk의 Command 컴포넌트 래퍼

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);

  // Cmd+K / Ctrl+K 전역 등록
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="검색 또는 명령 입력..." />
      <CommandList>
        <CommandEmpty>결과 없음</CommandEmpty>

        <CommandGroup heading="최근 방문">
          {recentPages.map((page) => (
            <CommandItem
              key={page.href}
              onSelect={() => {
                router.push(page.href);
                setOpen(false);
              }}
            >
              <page.icon className="mr-2 h-4 w-4" />
              {page.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="페이지 이동">
          {NAVIGATION_ITEMS.flatMap(item =>
            item.items || [item]
          ).map((navItem) => (
            <CommandItem
              key={navItem.href}
              onSelect={() => {
                router.push(navItem.href);
                setOpen(false);
              }}
            >
              <navItem.icon className="mr-2 h-4 w-4" />
              {navItem.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="액션">
          <CommandItem onSelect={handleNewSqlQuery}>
            <Plus className="mr-2 h-4 w-4" />
            새 SQL 쿼리 작성
          </CommandItem>
          <CommandItem onSelect={handleCreateTable}>
            <Plus className="mr-2 h-4 w-4" />
            테이블 생성
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

### 6.3 전역 단축키 레지스트리

| 단축키 | 동작 | 범위 |
|--------|------|------|
| `Cmd+K` / `Ctrl+K` | 커맨드 팔레트 열기 | 전역 |
| `Cmd+Enter` / `Ctrl+Enter` | SQL 실행 | SQL Editor |
| `Cmd+S` / `Ctrl+S` | 쿼리/스니펫 저장 | SQL Editor |
| `Cmd+/` / `Ctrl+/` | 줄 주석 토글 | Monaco Editor |
| `Cmd+Shift+F` / `Ctrl+Shift+F` | 포맷 SQL | SQL Editor |
| `Alt+1~9` | 해당 번호 탭 전환 | SQL Editor 멀티탭 |
| `Escape` | 모달/팝오버 닫기, 편집 취소 | 전역 |
| `F5` | SQL 실행 (대안) | SQL Editor |

---

## 7. 페이지 전환 애니메이션

### 7.1 Next.js 16 App Router 전환

Next.js 16 App Router에서는 내장 `<ViewTransition>` API를 활용한다.

```tsx
// src/app/(dashboard)/layout.tsx
// Next.js 16 View Transitions API 활성화
import { unstable_ViewTransition as ViewTransition } from 'next';

// page 컴포넌트에 ViewTransition 적용
export default function Page() {
  return (
    <ViewTransition name="page">
      <div className="animate-in fade-in-0 duration-200">
        {/* 페이지 콘텐츠 */}
      </div>
    </ViewTransition>
  );
}
```

### 7.2 전환 애니메이션 규칙

| 전환 유형 | 애니메이션 | 시간 |
|---------|---------|------|
| 사이드바 메뉴 클릭 → 페이지 | `fade-in-0` | 200ms |
| 모달 열기 | `fade-in-0 slide-in-from-bottom-4` | 200ms |
| 드롭다운 열기 | `zoom-in-95 fade-in-0` | 150ms |
| 사이드바 확장/축소 | `transition-[width]` | 300ms |
| 토스트 알림 등장 | Sonner 기본 | 150ms |
| 스켈레톤 → 콘텐츠 | `animate-pulse` 제거 | 0ms |

### 7.3 로딩 상태 처리

페이지 전환 중 로딩은 Next.js 16 `loading.tsx` 파일로 처리:

```tsx
// src/app/(dashboard)/database/tables/loading.tsx
export default function TableEditorLoading() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}
```

스켈레톤 컴포넌트 스타일:
```
bg-muted animate-pulse rounded-md
```

---

## 8. Next.js 16 App Router 매핑

### 8.1 디렉토리 구조 전체

```
src/app/
├── (auth)/                       ← 인증 그룹
│   ├── layout.tsx                ← 인증 전용 레이아웃 (사이드바 없음)
│   ├── login/
│   │   ├── page.tsx              ← 로그인 페이지
│   │   └── loading.tsx
│   ├── mfa/
│   │   └── page.tsx              ← MFA 챌린지 페이지
│   └── reset-password/
│       └── page.tsx              ← 비밀번호 재설정
│
├── (dashboard)/                  ← 대시보드 그룹 (인증 필요)
│   ├── layout.tsx                ← 3-pane 레이아웃
│   │
│   ├── dashboard/
│   │   ├── page.tsx              ← 대시보드 홈
│   │   └── loading.tsx
│   │
│   ├── database/
│   │   ├── tables/
│   │   │   ├── page.tsx          ← 테이블 목록
│   │   │   ├── [table]/
│   │   │   │   ├── page.tsx      ← 테이블 데이터 (Table Editor)
│   │   │   │   └── loading.tsx
│   │   │   └── loading.tsx
│   │   ├── sql/
│   │   │   ├── page.tsx          ← SQL Editor
│   │   │   └── loading.tsx
│   │   ├── schema/
│   │   │   └── page.tsx          ← Schema Visualizer
│   │   ├── policies/
│   │   │   ├── page.tsx          ← RLS 정책 목록
│   │   │   └── [table]/
│   │   │       └── page.tsx      ← 테이블별 정책 편집
│   │   ├── functions/
│   │   │   ├── page.tsx          ← Functions 목록
│   │   │   └── [function]/
│   │   │       └── page.tsx      ← Function 편집 (Monaco)
│   │   ├── triggers/
│   │   │   └── page.tsx          ← Triggers 관리
│   │   ├── cron/
│   │   │   └── page.tsx          ← Cron Jobs
│   │   ├── webhooks/
│   │   │   └── page.tsx          ← Webhooks
│   │   └── backups/
│   │       └── page.tsx          ← Backup 관리
│   │
│   ├── auth/
│   │   ├── page.tsx              ← Auth 개요
│   │   ├── users/
│   │   │   ├── page.tsx          ← 사용자 목록
│   │   │   └── [id]/
│   │   │       └── page.tsx      ← 사용자 상세
│   │   ├── sessions/
│   │   │   └── page.tsx          ← 활성 세션 (ActiveSessionsPanel)
│   │   └── mfa/
│   │       └── page.tsx          ← MFA 설정 (MFASetupWizard)
│   │
│   ├── storage/
│   │   ├── page.tsx              ← 스토리지 개요
│   │   └── buckets/
│   │       ├── page.tsx          ← 버킷 목록
│   │       └── [bucket]/
│   │           └── page.tsx      ← 버킷 파일 탐색기
│   │
│   ├── edge-functions/
│   │   ├── page.tsx              ← Edge Functions 목록
│   │   └── [name]/
│   │       └── page.tsx          ← Function 편집 (Monaco)
│   │
│   ├── realtime/
│   │   └── page.tsx              ← Realtime 채널 모니터
│   │
│   ├── advisors/
│   │   └── page.tsx              ← Advisors 분석 리포트
│   │
│   ├── api-docs/
│   │   └── page.tsx              ← API 문서 (Data API)
│   │
│   ├── settings/
│   │   ├── page.tsx              ← 설정 개요
│   │   ├── infrastructure/
│   │   │   └── page.tsx
│   │   ├── vault/
│   │   │   └── page.tsx
│   │   ├── jwks/
│   │   │   └── page.tsx
│   │   ├── deployments/
│   │   │   └── page.tsx
│   │   ├── security/
│   │   │   └── page.tsx
│   │   └── ai/
│   │       └── page.tsx          ← AI BYOK 설정, 비용 가드
│   │
│   └── assistant/
│       └── page.tsx              ← AI Assistant 전용 페이지
│
└── api/                          ← API Route Handlers
    ├── auth/
    ├── v1/
    │   ├── tables/
    │   ├── sql/
    │   ├── storage/
    │   └── ...
    ├── ai/
    │   ├── chat/route.ts         ← Vercel AI SDK useChat 엔드포인트
    │   └── generate/route.ts     ← generateObject 엔드포인트
    └── sse/
        └── route.ts              ← SSE 실시간 이벤트
```

### 8.2 레이아웃 계층

| 레이아웃 | 파일 | 포함 요소 |
|---------|------|---------|
| 루트 레이아웃 | `src/app/layout.tsx` | `<html>`, `<body>`, 폰트, 글로벌 Provider |
| Auth 레이아웃 | `src/app/(auth)/layout.tsx` | 인증 배경, 로고 (사이드바 없음) |
| Dashboard 레이아웃 | `src/app/(dashboard)/layout.tsx` | AppSidebar + AppHeader + 3-pane |

### 8.3 미들웨어 인증 가드

```typescript
// src/middleware.ts
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // (auth) 그룹은 통과
  if (pathname.startsWith('/login') || pathname.startsWith('/reset-password')) {
    return NextResponse.next();
  }

  // 세션 쿠키 검증
  const session = request.cookies.get('ypb_session');
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 9. Route 그룹 레이아웃

### 9.1 (auth) 그룹 레이아웃

```tsx
// src/app/(auth)/layout.tsx
// 사이드바 없음, 중앙 정렬 카드 레이아웃

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-100 flex items-center justify-center">
      <div className="w-full max-w-[420px] px-4">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand mb-4">
            <span className="text-lg font-bold text-white">양</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">양평 부엌</h1>
          <p className="text-sm text-muted-foreground mt-1">서버 대시보드</p>
        </div>
        {/* 인증 카드 */}
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### 9.2 (dashboard) 그룹 레이아웃

```tsx
// src/app/(dashboard)/layout.tsx
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 서버 컴포넌트에서 세션 검증
  const session = await getServerSession();
  if (!session) redirect('/login');

  return (
    <SidebarProvider
      defaultOpen={true}
      style={{
        '--sidebar-width': '240px',
        '--sidebar-width-mobile': '80vw',
      } as React.CSSProperties}
    >
      <AppSidebar user={session.user} />
      <SidebarInset>
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 p-6 overflow-auto">
          {children}
        </main>
      </SidebarInset>
      {/* 글로벌 커맨드 팔레트 */}
      <CommandPalette />
      {/* 글로벌 토스트 */}
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
  );
}
```

### 9.3 (public) 그룹 레이아웃

공유 링크, Anonymous 접근 경로:

```tsx
// src/app/(public)/layout.tsx
// 최소 레이아웃 — 사이드바 없음, 읽기 전용 표시

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-100">
      <header className="h-12 border-b border-border flex items-center px-4 gap-2">
        <div className="h-6 w-6 rounded bg-brand flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">양</span>
        </div>
        <span className="text-sm font-medium">양평 부엌 — 공유 뷰</span>
        <Badge variant="outline" className="ml-auto text-xs">
          읽기 전용
        </Badge>
      </header>
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}
```

---

## 10. 사이드바 상태 관리

### 10.1 localStorage 저장 전략

사이드바 확장/축소 상태는 `localStorage`에 저장되어 페이지 새로고침 후에도 유지된다.

```typescript
// src/hooks/use-sidebar-state.ts
const SIDEBAR_STATE_KEY = 'ypb:sidebar:open';
const SIDEBAR_WIDTH_KEY = 'ypb:sidebar:width';

export function useSidebarState() {
  const [isOpen, setIsOpen] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  const toggle = React.useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STATE_KEY, String(next));
      return next;
    });
  }, []);

  return { isOpen, toggle };
}
```

### 10.2 사이드바 너비 조정 (드래그)

desktop 모드에서 사이드바 너비를 드래그로 조정 가능:

- 최소 너비: 56px (아이콘만)
- 기본 너비: 240px
- 최대 너비: 320px
- 조정 핸들: 사이드바 우측 가장자리 4px 드래그 핸들
- 조정 후 localStorage에 저장

```typescript
// 너비 범위 상수
const SIDEBAR_MIN_WIDTH = 56;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 320;
const SIDEBAR_ICON_BREAKPOINT = 100; // 100px 미만 시 아이콘 전용
```

### 10.3 Settings 서브메뉴 상태

Settings 아코디언 열림/닫힘 상태도 localStorage에 저장:

```typescript
const SETTINGS_OPEN_KEY = 'ypb:sidebar:settings-open';
```

---

## 부록 B. 전체 라우트 트리

### B.1 라우트 정규식 패턴

| 패턴 | 설명 |
|------|------|
| `/dashboard` | 대시보드 홈 |
| `/database/tables` | 테이블 목록 |
| `/database/tables/:table` | 테이블 데이터 편집 |
| `/database/sql` | SQL Editor |
| `/database/sql/:id` | 특정 쿼리 열기 |
| `/database/schema` | Schema Visualizer |
| `/database/policies` | RLS 정책 목록 |
| `/database/policies/:table` | 테이블별 정책 편집 |
| `/database/functions` | 함수 목록 |
| `/database/functions/:name` | 함수 편집 |
| `/database/triggers` | 트리거 목록 |
| `/database/cron` | Cron Jobs |
| `/database/webhooks` | Webhooks |
| `/database/backups` | 백업 관리 |
| `/auth` | Auth 개요 |
| `/auth/users` | 사용자 목록 |
| `/auth/users/:id` | 사용자 상세 |
| `/auth/sessions` | 활성 세션 |
| `/auth/mfa` | MFA 설정 (MFASetupWizard) |
| `/storage` | 스토리지 개요 |
| `/storage/buckets` | 버킷 목록 |
| `/storage/buckets/:bucket` | 버킷 파일 탐색 |
| `/edge-functions` | Edge Functions 목록 |
| `/edge-functions/:name` | Function 편집 |
| `/realtime` | Realtime 모니터 |
| `/advisors` | Advisors 리포트 |
| `/api-docs` | API 문서 |
| `/settings` | 설정 홈 |
| `/settings/infrastructure` | 인프라 설정 |
| `/settings/vault` | Vault (시크릿 관리) |
| `/settings/jwks` | JWKS 관리 |
| `/settings/deployments` | 배포 관리 |
| `/settings/security` | 보안 감사 |
| `/settings/ai` | AI BYOK 설정 |
| `/assistant` | AI Assistant 전용 |

### B.2 페이지 연결성 검증

모든 라우트는 홈(`/dashboard`)에서 사이드바 탐색 또는 커맨드 팔레트를 통해 최대 2회 클릭으로 도달 가능해야 한다. 고아 페이지(orphan page) 금지 규칙은 `docs/rules/navigation-connectivity.md`를 따른다.

| 깊이 | 도달 방법 | 라우트 예시 |
|------|---------|----------|
| 1클릭 | 사이드바 메뉴 | `/database/tables`, `/auth`, `/storage` |
| 2클릭 | 사이드바 → 목록 내 항목 | `/database/tables/users`, `/auth/users/123` |
| 커맨드 팔레트 | Cmd+K → 검색 | 모든 라우트 직접 접근 가능 |
