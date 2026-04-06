# Next.js + Supabase 통합 아키텍처

> Wave 4 / Document 2 — Next.js 15 App Router 기반 Supabase 완전 통합 가이드

---

## 목차

1. [아키텍처 설계 원칙](#1-아키텍처-설계-원칙)
2. [프로젝트 구조](#2-프로젝트-구조)
3. [Supabase 클라이언트 설정](#3-supabase-클라이언트-설정)
4. [인증 통합](#4-인증-통합)
5. [데이터 패턴](#5-데이터-패턴)
6. [파일 업로드 통합](#6-파일-업로드-통합)
7. [Realtime 통합](#7-realtime-통합)
8. [배포 설정](#8-배포-설정)
9. [성능 최적화](#9-성능-최적화)
10. [보안 체크리스트](#10-보안-체크리스트)

---

## 1. 아키텍처 설계 원칙

### 1.1 Next.js 15 + Supabase 권장 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Next.js 15 App Router                               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     서버 레이어                                     │ │
│  │                                                                    │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │ │
│  │  │  Server          │  │  Server Actions  │  │  Route Handlers  │  │ │
│  │  │  Components      │  │  (뮤테이션)      │  │  (API 엔드포인트) │  │ │
│  │  │  (데이터 패칭)   │  │                  │  │                  │  │ │
│  │  │                  │  │  'use server'    │  │  GET/POST/...    │  │ │
│  │  │  createServer    │  │  createServer    │  │  createServer    │  │ │
│  │  │  Client()        │  │  Client()        │  │  Client()        │  │ │
│  │  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │ │
│  │           │                     │                      │            │ │
│  │           └─────────────────────┼──────────────────────┘            │ │
│  │                                 │ 서버에서만 실행                    │ │
│  └─────────────────────────────────┼────────────────────────────────────┘ │
│                                    │                                     │
│  ┌─────────────────────────────────┼────────────────────────────────────┐ │
│  │                     클라이언트 레이어            │                   │ │
│  │                                 ▼                                   │ │
│  │  ┌─────────────────┐  ┌─────────────────┐                          │ │
│  │  │  Client          │  │  middleware.ts   │                          │ │
│  │  │  Components      │  │  (토큰 갱신)     │                          │ │
│  │  │                  │  │                  │                          │ │
│  │  │  'use client'    │  │  createServer    │                          │ │
│  │  │  createBrowser   │  │  Client()        │                          │ │
│  │  │  Client()        │  │                  │                          │ │
│  │  └──────────────────┘  └──────────────────┘                          │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                     HTTPS 요청 (REST / WebSocket)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Supabase 백엔드                                      │
│  Kong → GoTrue / PostgREST / Realtime / Storage / Edge Functions       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 렌더링 전략별 Supabase 클라이언트 선택

| 실행 환경 | 클라이언트 함수 | 사용 시점 |
|-----------|----------------|-----------|
| Server Component | `createServerClient()` | 초기 데이터 로드, SEO 필요 데이터 |
| Server Action | `createServerClient()` | 폼 제출, 데이터 변경 |
| Route Handler | `createServerClient()` | Webhook 수신, 외부 API 연동 |
| middleware.ts | `createServerClient()` | 세션 갱신, 인증 보호 |
| Client Component | `createBrowserClient()` | 실시간 구독, 인터랙티브 쿼리 |

### 1.3 API Route vs Server Action vs Edge Function 역할 분담

```
Server Action 사용:
✅ 폼 데이터 처리 (할일 생성, 프로필 업데이트)
✅ 단순 CRUD 뮤테이션
✅ revalidatePath/revalidateTag와 연계
✅ 파일 업로드 (FormData)
❌ 긴 실행 시간 작업
❌ WebSocket 지속 연결

API Route Handler 사용:
✅ 외부 서비스 Webhook 수신 (Stripe, Slack)
✅ 3rd party OAuth 콜백 처리
✅ 파일 다운로드 스트리밍
✅ 캐시 무효화 엔드포인트
❌ 단순 DB 쿼리 (Server Component/Action 권장)

Edge Function (Supabase) 사용:
✅ DB 이벤트 트리거 (pg_net Webhook)
✅ 이메일 발송 (Resend, SendGrid 연동)
✅ 결제 처리 (Stripe 로직)
✅ 외부 API 프록시 (API 키 숨김)
✅ 스케줄링 (pg_cron 연동)
```

---

## 2. 프로젝트 구조

### 2.1 권장 폴더 구조

```
my-app/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 루트 레이아웃
│   │   ├── page.tsx                  # 홈 (공개)
│   │   ├── (auth)/                   # 인증 라우트 그룹
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── callback/route.ts     # OAuth 콜백 처리
│   │   ├── (protected)/              # 인증 필요 라우트 그룹
│   │   │   ├── layout.tsx            # 인증 체크 레이아웃
│   │   │   ├── dashboard/page.tsx
│   │   │   └── profile/page.tsx
│   │   └── api/                      # Route Handlers
│   │       ├── webhooks/
│   │       │   └── stripe/route.ts
│   │       └── cron/
│   │           └── route.ts
│   │
│   ├── components/
│   │   ├── ui/                       # Shadcn UI 등 기본 컴포넌트
│   │   ├── auth/                     # 인증 관련 컴포넌트
│   │   │   ├── LoginForm.tsx
│   │   │   ├── SignupForm.tsx
│   │   │   └── AuthProvider.tsx
│   │   └── [feature]/                # 기능별 컴포넌트
│   │
│   ├── lib/
│   │   └── supabase/                 # Supabase 유틸리티 (핵심!)
│   │       ├── client.ts             # createBrowserClient
│   │       ├── server.ts             # createServerClient
│   │       └── middleware.ts         # 미들웨어용 클라이언트
│   │
│   ├── actions/                      # Server Actions
│   │   ├── auth.ts
│   │   ├── todos.ts
│   │   └── profile.ts
│   │
│   ├── hooks/                        # 클라이언트 커스텀 훅
│   │   ├── useUser.ts
│   │   ├── useRealtimeTodos.ts
│   │   └── useSupabase.ts
│   │
│   ├── types/
│   │   ├── database.types.ts         # Supabase CLI 자동 생성
│   │   └── index.ts
│   │
│   └── middleware.ts                 # Next.js 미들웨어 (루트 또는 src/)
│
├── supabase/
│   ├── config.toml                   # Supabase 로컬 설정
│   ├── migrations/                   # DB 마이그레이션
│   │   └── 20250101000000_init.sql
│   ├── functions/                    # Edge Functions
│   │   └── send-email/index.ts
│   └── seed.sql                      # 시드 데이터
│
├── .env.local                        # 로컬 환경변수 (Git 제외!)
├── .env.example                      # 환경변수 템플릿
└── next.config.ts
```

### 2.2 환경변수 설정

```bash
# .env.local (절대 Git 커밋 금지)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 서버 전용 (NEXT_PUBLIC_ 접두사 없음 - 클라이언트에 노출 안 됨)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# .env.example (Git에 포함 가능)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 3. Supabase 클라이언트 설정

### 3.1 패키지 설치

```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 3.2 브라우저 클라이언트 (Client Components용)

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### 3.3 서버 클라이언트 (Server Components / Server Actions / Route Handlers용)

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch (error) {
            // Server Component에서는 쿠키 설정 불가 (무시)
            // 미들웨어가 실제 쿠키 갱신 담당
          }
        },
      },
    }
  )
}

// 관리자 작업용 (RLS 우회) - 서버 전용, 절대 클라이언트에 노출 금지
export async function createAdminClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role key 사용
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {}
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
```

### 3.4 미들웨어 클라이언트

```typescript
// src/lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database.types'

export function createClient(request: NextRequest, response: NextResponse) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 요청 쿠키 설정 (Server Components에서 읽기 위해)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // 응답 쿠키 설정 (브라우저에 전달)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### 3.5 타입 생성 (Supabase CLI)

```bash
# Supabase CLI 설치
npm install -g supabase

# 로그인
supabase login

# 타입 자동 생성 (로컬 Supabase)
supabase gen types typescript --local > src/types/database.types.ts

# 클라우드 프로젝트에서 타입 생성
supabase gen types typescript \
  --project-id your-project-id \
  > src/types/database.types.ts
```

생성된 타입 파일 구조:
```typescript
// src/types/database.types.ts (자동 생성 - 수동 편집 금지)
export type Database = {
  public: {
    Tables: {
      todos: {
        Row: {
          id: string
          title: string
          completed: boolean
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          completed?: boolean
          user_id?: string
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          completed?: boolean
          user_id?: string
          created_at?: string
        }
      }
    }
    Views: { ... }
    Functions: { ... }
    Enums: { ... }
  }
}

// 편의 타입 (src/types/index.ts에 추가)
import type { Database } from './database.types'
export type Todo = Database['public']['Tables']['todos']['Row']
export type NewTodo = Database['public']['Tables']['todos']['Insert']
```

---

## 4. 인증 통합

### 4.1 middleware.ts (세션 갱신 핵심)

```typescript
// src/middleware.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // 응답 객체 생성 (쿠키 수정 가능하도록)
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createClient(request, supabaseResponse)

  // ⚠️ 중요: getUser()를 반드시 호출해야 함
  // - getSession()은 로컬 캐시만 확인 → 보안 취약
  // - getUser()는 Supabase Auth 서버에 실제 검증 요청 → 안전
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 인증이 필요한 경로 보호
  const protectedPaths = ['/dashboard', '/profile', '/settings']
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !user) {
    // 미인증 사용자 → 로그인 페이지로 리디렉션
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // 이미 로그인된 사용자가 로그인/회원가입 페이지 접근 시
  const authPaths = ['/login', '/signup']
  const isAuthPath = authPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isAuthPath && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // 갱신된 세션 쿠키가 포함된 응답 반환 (필수!)
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * 다음 경로는 제외:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico
     * - 공개 파일 (public/)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### 4.2 인증 보호 레이아웃

```typescript
// src/app/(protected)/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return (
    <div>
      {/* 인증된 사용자에게만 표시되는 레이아웃 */}
      {children}
    </div>
  )
}
```

### 4.3 이메일/비밀번호 인증 (Server Actions)

```typescript
// src/actions/auth.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signUp({
    ...data,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  // 이메일 확인 필요 메시지 표시
  redirect('/signup/check-email')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
```

### 4.4 OAuth 인증 (Google/GitHub)

```typescript
// src/actions/auth.ts에 추가
export async function signInWithOAuth(provider: 'google' | 'github') {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      queryParams: {
        // Google 전용: 항상 계정 선택 화면 표시
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  // OAuth Provider URL로 리디렉션
  if (data.url) {
    redirect(data.url)
  }
}
```

```typescript
// src/app/(auth)/callback/route.ts
// OAuth 인증 완료 후 콜백 처리
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // 성공: 대시보드로 리디렉션
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // 실패: 오류 페이지로 리디렉션
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
```

### 4.5 서버 컴포넌트에서 사용자 정보 접근

```typescript
// src/app/(protected)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 서버에서 안전하게 사용자 정보 조회
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 사용자 데이터와 함께 DB 쿼리 (RLS 자동 적용)
  const { data: todos, error } = await supabase
    .from('todos')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1>안녕하세요, {user.email}!</h1>
      {todos?.map(todo => (
        <div key={todo.id}>{todo.title}</div>
      ))}
    </div>
  )
}
```

### 4.6 클라이언트 컴포넌트 인증 컨텍스트

```typescript
// src/components/auth/AuthProvider.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // 초기 세션 로드
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // 인증 상태 변경 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다')
  }
  return context
}
```

---

## 5. 데이터 패턴

### 5.1 Server Component에서 직접 데이터 Fetching

```typescript
// src/app/(protected)/todos/page.tsx
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { TodoList } from '@/components/todos/TodoList'
import { TodoListSkeleton } from '@/components/todos/TodoListSkeleton'

// 데이터 패칭 함수 분리 (재사용 가능)
async function getTodos() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('todos')
    .select(`
      id,
      title,
      completed,
      created_at,
      user_id,
      category:categories(id, name, color)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data
}

// 페이지 컴포넌트
export default async function TodosPage() {
  const todosPromise = getTodos()

  return (
    <main>
      <h1>내 할일 목록</h1>
      <Suspense fallback={<TodoListSkeleton />}>
        <TodoListWrapper todosPromise={todosPromise} />
      </Suspense>
    </main>
  )
}

// Promise를 받아 use()로 처리하는 패턴 (Next.js 15)
async function TodoListWrapper({
  todosPromise,
}: {
  todosPromise: ReturnType<typeof getTodos>
}) {
  const todos = await todosPromise
  return <TodoList initialTodos={todos} />
}
```

### 5.2 Server Actions로 뮤테이션

```typescript
// src/actions/todos.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

// Zod 스키마 검증
const CreateTodoSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요').max(200, '제목이 너무 깁니다'),
  categoryId: z.string().uuid().optional(),
})

type CreateTodoState = {
  errors?: { title?: string[]; categoryId?: string[] }
  message?: string
  success?: boolean
}

export async function createTodo(
  prevState: CreateTodoState,
  formData: FormData
): Promise<CreateTodoState> {
  const supabase = await createClient()

  // 인증 확인
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { message: '로그인이 필요합니다' }
  }

  // 입력 검증
  const validatedFields = CreateTodoSchema.safeParse({
    title: formData.get('title'),
    categoryId: formData.get('categoryId') || undefined,
  })

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    }
  }

  // DB 삽입 (RLS가 user_id 자동 검증)
  const { error } = await supabase.from('todos').insert({
    title: validatedFields.data.title,
    category_id: validatedFields.data.categoryId,
    user_id: user.id,
  })

  if (error) {
    return { message: '할일 생성 중 오류가 발생했습니다' }
  }

  // 캐시 무효화 (해당 페이지 재생성)
  revalidatePath('/todos')
  revalidateTag('todos')

  return { success: true }
}

export async function toggleTodo(id: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('인증 필요')

  // 현재 상태 조회
  const { data: todo } = await supabase
    .from('todos')
    .select('completed')
    .eq('id', id)
    .single()

  if (!todo) throw new Error('할일을 찾을 수 없습니다')

  // 토글
  const { error } = await supabase
    .from('todos')
    .update({ completed: !todo.completed })
    .eq('id', id)

  if (error) throw error

  revalidatePath('/todos')
}

export async function deleteTodo(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('todos')
    .delete()
    .eq('id', id)

  if (error) throw error

  revalidatePath('/todos')
}
```

### 5.3 Client Component에서 React Query + Supabase

```typescript
// src/hooks/useTodos.ts
'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Todo, NewTodo } from '@/types'

const supabase = createClient()

// 쿼리 키 팩토리 (캐시 관리 용이)
export const todoKeys = {
  all: ['todos'] as const,
  lists: () => [...todoKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...todoKeys.lists(), filters] as const,
  detail: (id: string) => [...todoKeys.all, 'detail', id] as const,
}

// 할일 목록 조회 훅
export function useTodos(options?: UseQueryOptions<Todo[]>) {
  return useQuery({
    queryKey: todoKeys.lists(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    staleTime: 1000 * 60,  // 1분 동안 신선한 데이터
    ...options,
  })
}

// 할일 생성 뮤테이션
export function useCreateTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newTodo: Pick<NewTodo, 'title'>) => {
      const { data, error } = await supabase
        .from('todos')
        .insert(newTodo)
        .select()
        .single()

      if (error) throw error
      return data
    },
    // 낙관적 업데이트 (UI 즉시 반영)
    onMutate: async (newTodo) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.lists() })

      const previousTodos = queryClient.getQueryData<Todo[]>(todoKeys.lists())

      queryClient.setQueryData<Todo[]>(todoKeys.lists(), (old = []) => [
        {
          id: 'temp-' + Date.now(),
          title: newTodo.title,
          completed: false,
          user_id: '',
          created_at: new Date().toISOString(),
        },
        ...old,
      ])

      return { previousTodos }
    },
    onError: (_err, _newTodo, context) => {
      // 오류 시 롤백
      if (context?.previousTodos) {
        queryClient.setQueryData(todoKeys.lists(), context.previousTodos)
      }
    },
    onSettled: () => {
      // 완료 후 서버 데이터로 동기화
      queryClient.invalidateQueries({ queryKey: todoKeys.lists() })
    },
  })
}

// 할일 삭제 뮤테이션
export function useDeleteTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('todos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoKeys.lists() })
    },
  })
}
```

### 5.4 캐싱 전략

```typescript
// src/app/(protected)/todos/page.tsx
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 정적 데이터 캐싱 (카테고리 목록 등)
const getCachedCategories = unstable_cache(
  async () => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('categories')
      .select('id, name, color')
      .order('name')

    return data ?? []
  },
  ['categories'],  // 캐시 키
  {
    revalidate: 3600,  // 1시간마다 재검증
    tags: ['categories'],
  }
)

// 사용자별 데이터는 캐싱 주의 (개인정보!)
// fetch() 기반 캐싱 활용
export async function getUserTodos(userId: string) {
  const supabase = await createClient()

  // Next.js 15: fetch() 호출 시 자동 캐싱
  // supabase는 내부적으로 fetch 사용
  const { data } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)

  return data ?? []
}
```

### 5.5 Supabase Cache Helpers (React Query 연동)

```typescript
// React Query + Supabase Cache Helpers 활용
// npm install @supabase-cache-helpers/postgrest-react-query

import { useQuery } from '@supabase-cache-helpers/postgrest-react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// 자동 캐시 키 관리
export function useCachedTodos() {
  return useQuery(
    supabase.from('todos').select('id, title, completed').order('created_at')
  )
}
```

---

## 6. 파일 업로드 통합

### 6.1 서버 액션으로 파일 업로드

```typescript
// src/actions/storage.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: '인증이 필요합니다' }

  const file = formData.get('avatar') as File

  // 서버 사이드 검증
  if (!file || file.size === 0) {
    return { error: '파일을 선택해주세요' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { error: '파일 크기는 5MB 이하여야 합니다' }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: '지원하지 않는 파일 형식입니다 (JPEG, PNG, WebP, GIF만 가능)' }
  }

  const fileExt = file.name.split('.').pop()
  const fileName = `${user.id}/avatar.${fileExt}`

  // Supabase Storage 업로드
  const { error: uploadError } = await supabase.storage
    .from('avatars')  // 버킷 이름
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,  // 기존 파일 덮어쓰기
    })

  if (uploadError) {
    return { error: uploadError.message }
  }

  // 공개 URL 생성
  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName)

  // 프로필 테이블 업데이트
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: urlData.publicUrl })
    .eq('id', user.id)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/profile')
  return { success: true, url: urlData.publicUrl }
}
```

### 6.2 클라이언트 사이드 직접 업로드 (대용량 파일)

```typescript
// src/components/FileUploader.tsx
'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface FileUploaderProps {
  bucketName: string
  onUploadComplete: (url: string) => void
}

export function FileUploader({ bucketName, onUploadComplete }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const supabase = createClient()

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    setProgress(0)

    try {
      const fileName = `${Date.now()}-${file.name}`

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          // 업로드 진행 상황 콜백
          onUploadProgress: (progress) => {
            const percentage = Math.round(
              (progress.loaded / progress.total) * 100
            )
            setProgress(percentage)
          },
        })

      if (error) throw error

      const { data } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName)

      onUploadComplete(data.publicUrl)
    } catch (err) {
      console.error('업로드 오류:', err)
    } finally {
      setUploading(false)
    }
  }, [bucketName, onUploadComplete, supabase])

  return (
    <div>
      <input
        type="file"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
        }}
      />
      {uploading && (
        <div>
          <progress value={progress} max={100} />
          <span>{progress}%</span>
        </div>
      )}
    </div>
  )
}
```

### 6.3 Next.js Image 컴포넌트와 Supabase Storage 연동

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      // Self-hosted
      {
        protocol: 'https',
        hostname: 'your-domain.com',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
```

```typescript
// src/components/OptimizedAvatar.tsx
import Image from 'next/image'

interface OptimizedAvatarProps {
  url: string | null
  name: string
  size?: number
}

// Supabase Storage 이미지 변환 URL 생성
function getTransformedUrl(
  url: string,
  width: number,
  height: number,
  format: 'webp' | 'origin' = 'webp'
) {
  // Supabase Storage 이미지 변환 파라미터
  const params = new URLSearchParams({
    width: width.toString(),
    height: height.toString(),
    resize: 'cover',
    format,
  })

  // /object/public/ → /render/image/public/ 로 변환
  const renderUrl = url.replace('/object/public/', '/render/image/public/')
  return `${renderUrl}?${params.toString()}`
}

export function OptimizedAvatar({
  url,
  name,
  size = 48,
}: OptimizedAvatarProps) {
  if (!url) {
    // 기본 아바타 (이니셜)
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-gray-300 flex items-center justify-center"
      >
        <span className="text-sm font-medium">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <Image
      src={getTransformedUrl(url, size * 2, size * 2)}  // 2x DPR
      alt={`${name}의 프로필 사진`}
      width={size}
      height={size}
      className="rounded-full object-cover"
      loading="lazy"
    />
  )
}
```

---

## 7. Realtime 통합

### 7.1 SSR 환경에서의 Realtime 초기화 패턴

```typescript
// src/hooks/useRealtimeTodos.ts
'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Todo } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimeTodos(initialTodos: Todo[]) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createClient()

  useEffect(() => {
    // Realtime 채널 설정 (컴포넌트 마운트 시)
    const channel = supabase
      .channel('todos-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'todos',
        },
        (payload) => {
          setTodos((prev) => [payload.new as Todo, ...prev])
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'todos',
        },
        (payload) => {
          setTodos((prev) =>
            prev.map((todo) =>
              todo.id === payload.new.id ? (payload.new as Todo) : todo
            )
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'todos',
        },
        (payload) => {
          setTodos((prev) =>
            prev.filter((todo) => todo.id !== payload.old.id)
          )
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime 구독 시작')
        }
      })

    channelRef.current = channel

    // 컴포넌트 언마운트 시 구독 해제 (메모리 누수 방지)
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [supabase])

  return todos
}
```

### 7.2 Server Component + Client Realtime 하이브리드 패턴

```typescript
// src/app/(protected)/todos/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server'
import { RealtimeTodoList } from '@/components/todos/RealtimeTodoList'

export default async function TodosPage() {
  const supabase = await createClient()

  // 서버에서 초기 데이터 로드 (SSR)
  const { data: initialTodos } = await supabase
    .from('todos')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <main>
      {/* 초기 데이터를 클라이언트 컴포넌트에 전달 */}
      <RealtimeTodoList initialTodos={initialTodos ?? []} />
    </main>
  )
}
```

```typescript
// src/components/todos/RealtimeTodoList.tsx (Client Component)
'use client'

import { useRealtimeTodos } from '@/hooks/useRealtimeTodos'
import type { Todo } from '@/types'

interface RealtimeTodoListProps {
  initialTodos: Todo[]
}

export function RealtimeTodoList({ initialTodos }: RealtimeTodoListProps) {
  // SSR 초기 데이터 + 실시간 업데이트
  const todos = useRealtimeTodos(initialTodos)

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          <span className={todo.completed ? 'line-through' : ''}>
            {todo.title}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

### 7.3 Broadcast (채널 간 메시지)

```typescript
// src/hooks/usePresence.ts
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PresenceState {
  userId: string
  username: string
  onlineAt: string
}

export function usePresence(roomId: string, userId: string, username: string) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([])
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>()
        const users = Object.values(state).flat()
        setOnlineUsers(users)
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('입장:', newPresences)
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('퇴장:', leftPresences)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // 자신의 존재 알림
          await channel.track({
            userId,
            username,
            onlineAt: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, userId, username, supabase])

  return onlineUsers
}
```

---

## 8. 배포 설정

### 8.1 Vercel + Supabase (권장 조합)

```bash
# 1. Vercel CLI 설치
npm install -g vercel

# 2. Vercel 로그인 및 프로젝트 연결
vercel login
vercel link

# 3. Supabase Vercel 통합 설치
# Vercel 대시보드 → Storage → Browse Marketplace → Supabase
# → 자동으로 환경변수 동기화

# 4. 수동 환경변수 설정 (통합 미사용 시)
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production

# 5. 배포
vercel deploy --prod
```

```typescript
// next.config.ts (Vercel 배포 최적화)
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Vercel Edge Runtime 활용
  experimental: {
    // PPR (Partial Prerendering) - Next.js 15
    ppr: true,
  },
  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
```

**Vercel Preview 배포 설정 (중요!):**
```
Supabase Dashboard → Authentication → URL Configuration

Site URL: https://your-project.vercel.app

Redirect URLs (모두 추가):
- https://your-project.vercel.app/**
- https://*-your-team.vercel.app/**   ← Preview URL 와일드카드
- http://localhost:3000/**             ← 로컬 개발
```

### 8.2 Self-hosted Next.js + Supabase

```dockerfile
# Dockerfile (Next.js standalone 모드)
FROM node:20-alpine AS base

# 의존성 설치
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 빌드
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 빌드 시 환경변수 (public만 노출 가능)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

# 프로덕션 이미지
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml (Next.js + Supabase 통합)
version: '3.8'

services:
  nextjs:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    ports:
      - "3000:3000"
    environment:
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    restart: unless-stopped
```

### 8.3 PM2 + Cloudflare Tunnel (이 프로젝트 환경)

```bash
# ecosystem.config.js (PM2 설정)
module.exports = {
  apps: [
    {
      name: 'nextjs-app',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 'max',       // CPU 코어 수만큼 인스턴스
      exec_mode: 'cluster',   // 클러스터 모드
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // 로그 설정
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // 재시작 정책
      max_memory_restart: '1G',
      restart_delay: 4000,
    },
  ],
}
```

```bash
# 배포 스크립트
#!/bin/bash
echo "의존성 설치..."
npm ci --production=false

echo "빌드..."
npm run build

echo "PM2 재시작..."
pm2 reload ecosystem.config.js --update-env

echo "배포 완료!"
pm2 status
```

---

## 9. 성능 최적화

### 9.1 데이터 패칭 최적화

```typescript
// src/app/(protected)/dashboard/page.tsx
// 병렬 데이터 패칭 (Promise.all)
export default async function DashboardPage() {
  const supabase = await createClient()

  // ❌ 순차 실행 (느림)
  // const { data: todos } = await supabase.from('todos').select('*')
  // const { data: profile } = await supabase.from('profiles').select('*')

  // ✅ 병렬 실행 (빠름)
  const [todosResult, profileResult, statsResult] = await Promise.all([
    supabase.from('todos').select('*').limit(10),
    supabase.from('profiles').select('*').single(),
    supabase.from('todos').select('count', { count: 'exact' }),
  ])

  return (
    <div>
      <DashboardStats count={statsResult.count ?? 0} />
      <UserProfile profile={profileResult.data} />
      <RecentTodos todos={todosResult.data ?? []} />
    </div>
  )
}
```

### 9.2 연결 재사용 패턴

```typescript
// src/lib/supabase/singleton.ts
// 클라이언트 컴포넌트에서 Supabase 인스턴스 싱글톤
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

let supabaseInstance: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return supabaseInstance
}
```

### 9.3 선택적 컬럼 쿼리

```typescript
// ❌ 불필요한 데이터 포함
const { data } = await supabase.from('todos').select('*')

// ✅ 필요한 컬럼만 선택
const { data } = await supabase
  .from('todos')
  .select('id, title, completed, created_at')

// ✅ 관련 데이터 조인 (N+1 문제 방지)
const { data } = await supabase
  .from('todos')
  .select(`
    id,
    title,
    completed,
    category:categories(id, name, color),
    user:profiles(id, username, avatar_url)
  `)
```

### 9.4 페이지네이션 패턴

```typescript
// src/hooks/useInfiniteTodos.ts
'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Todo } from '@/types'

const PAGE_SIZE = 20

export function useInfiniteTodos() {
  const supabase = createClient()

  return useInfiniteQuery({
    queryKey: ['todos', 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await supabase
        .from('todos')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error
      return { data: data ?? [], count: count ?? 0 }
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce(
        (sum, page) => sum + page.data.length,
        0
      )
      if (totalFetched >= (lastPage.count ?? 0)) return undefined
      return allPages.length
    },
    initialPageParam: 0,
  })
}
```

---

## 10. 보안 체크리스트

### 10.1 클라이언트 보안

```typescript
// ✅ NEXT_PUBLIC_ 환경변수 사용 범위 확인
// anon key → NEXT_PUBLIC_ OK (Kong에서 RLS로 보호)
// service_role key → NEXT_PUBLIC_ 절대 금지!

// ❌ 금지
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!  // 노출됨!
)

// ✅ service_role은 서버에서만
// src/lib/supabase/server.ts의 createAdminClient() 사용
```

### 10.2 RLS 정책 검증 체크리스트

```sql
-- 1. 모든 사용자 테이블에 RLS 활성화 확인
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;  -- 결과가 없어야 함

-- 2. 정책 없는 테이블 확인 (RLS 활성화되어도 정책 없으면 모두 차단)
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND p.policyname IS NULL;

-- 3. service_role이 우회하는지 확인
-- FORCE ROW LEVEL SECURITY를 설정하지 않은 경우
-- 테이블 소유자(postgres)도 RLS 우회 가능
ALTER TABLE public.sensitive_data FORCE ROW LEVEL SECURITY;
```

### 10.3 Server Action 보안 패턴

```typescript
// src/actions/todos.ts
'use server'

// ✅ 모든 Server Action에서 인증 확인
export async function deleteAllTodos() {
  const supabase = await createClient()

  // 반드시 서버 측 인증 확인 (클라이언트 전달값 신뢰 금지)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('인증이 필요합니다')
  }

  // 권한 확인 (역할 체크)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw new Error('관리자 권한이 필요합니다')
  }

  // 실제 작업 수행
  const { error } = await supabase
    .from('todos')
    .delete()
    .eq('user_id', user.id)  // RLS 추가 보호

  if (error) throw error
}
```

### 10.4 보안 체크리스트 요약

```
인증 보안:
□ middleware.ts에서 getUser() 사용 (getSession() 금지)
□ 보호된 라우트에 인증 레이아웃 적용
□ OAuth callback에서 code 검증
□ 이메일 확인 활성화

데이터 보안:
□ 모든 사용자 테이블 RLS 활성화
□ 기본 거부(Deny All) 정책 후 허용 정책 추가
□ service_role key 서버 전용 사용
□ Zod 등으로 서버 입력값 검증

파일 보안:
□ 파일 타입/크기 서버 사이드 검증
□ Storage RLS 정책 설정
□ 민감한 파일은 비공개 버킷 + Signed URL 사용

환경변수:
□ .env.local Git 제외 (.gitignore)
□ SUPABASE_SERVICE_ROLE_KEY에 NEXT_PUBLIC_ 접두사 없음
□ Vercel Secrets에 안전하게 저장
□ 프리뷰/스테이징 환경에 별도 Supabase 프로젝트 사용
```

---

## 참고 자료

- [Supabase + Next.js SSR 공식 가이드](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase 클라이언트 생성 가이드](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Next.js 15 App Router 공식 문서](https://nextjs.org/docs/app)
- [Vercel + Supabase 통합](https://supabase.com/blog/using-supabase-with-vercel)
- [React Query + Next.js App Router + Supabase](https://supabase.com/blog/react-query-nextjs-app-router-cache-helpers)
- [Supabase Auth 아키텍처](https://supabase.com/docs/guides/auth/architecture)

---

> Wave 4 / Document 2 작성 완료
> Wave 4 전체 완료 — Supabase 완전 분석 프로젝트 (Wave 1~4) 종료
