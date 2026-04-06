# Supabase 도입 단계별 로드맵 (Phase 1–4)

> **대상 프로젝트**: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> **스택**: Next.js 15 + TypeScript + Tailwind CSS + WSL2 Ubuntu (PM2) + Cloudflare Tunnel
> **작성일**: 2026-04-06
> **Wave**: Wave-4 (의사결정 & 전략)

---

## 목차

1. [개요 및 전제 조건](#1-개요-및-전제-조건)
2. [Phase 1: 탐색 & PoC (1–2주)](#2-phase-1-탐색--poc-12주)
3. [Phase 2: MVP 통합 (2–4주)](#3-phase-2-mvp-통합-24주)
4. [Phase 3: 고급 기능 (4–8주)](#4-phase-3-고급-기능-48주)
5. [Phase 4: 운영 안정화 (지속)](#5-phase-4-운영-안정화-지속)
6. [의사결정 체크포인트 (Go/No-Go)](#6-의사결정-체크포인트-gono-go)
7. [리스크 관리](#7-리스크-관리)
8. [전체 타임라인 요약](#8-전체-타임라인-요약)

---

## 1. 개요 및 전제 조건

### 1.1 로드맵의 목적

이 로드맵은 Supabase를 처음 도입하는 팀이 검증된 단계적 접근법으로 리스크를 최소화하며
프로덕션 수준의 백엔드 인프라를 구축하도록 안내한다.

각 Phase는 독립적인 **성공 기준(Definition of Done)** 을 갖추며,
이전 Phase가 완료되어야 다음 Phase로 진행한다.

### 1.2 현재 프로젝트 맥락

- 양평 부엌 서버 대시보드는 현재 PM2 + Cloudflare Tunnel로 WSL2 위에서 운영 중
- 기존 백엔드 인프라: 없음 (또는 최소한) — Supabase 신규 도입
- 목표: 서버 모니터링 데이터 저장, 사용자 인증, 실시간 대시보드

### 1.3 전제 조건 체크리스트

도입 시작 전 아래 항목을 모두 확인한다:

```
[ ] Node.js 20 이상 설치 확인
[ ] Docker Desktop (또는 Docker Engine on WSL2) 설치 확인
[ ] Supabase 계정 생성 (app.supabase.com)
[ ] GitHub 계정 (Supabase 소셜 로그인 연동 또는 CLI OAuth)
[ ] .env.local 파일 gitignore 등록 확인
[ ] 프로젝트 루트에 supabase/ 폴더 gitignore 미포함 확인 (CLI 생성 파일은 커밋 가능)
```

### 1.4 환경 변수 관리 원칙

Supabase 도입 시 다음 환경 변수 규칙을 반드시 준수한다:

| 변수명 | 위치 | 노출 가능 여부 | 용도 |
|--------|------|---------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | .env.local | 클라이언트 노출 가능 | 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | .env.local | 클라이언트 노출 가능 (RLS 필수) | 익명 접근 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | .env.local | **서버 사이드 전용** | 관리자 권한 |
| `SUPABASE_DB_PASSWORD` | .env.local | 서버 사이드 전용 | DB 직접 연결 |

> **경고**: `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트 번들에 포함하지 않는다.
> `NEXT_PUBLIC_` 접두사 사용 금지.

---

## 2. Phase 1: 탐색 & PoC (1–2주)

### 2.1 Phase 1 목표

> "Supabase가 이 프로젝트에 적합한지 검증한다"

프로덕션 코드 한 줄도 건드리지 않고, **격리된 PoC 환경**에서 핵심 기능 3종
(Auth + DB + RLS)이 동작하는지 확인한다.

---

### 2.2 Week 1: 환경 설정 및 Free 플랜 온보딩

#### 2.2.1 Supabase 프로젝트 생성

```bash
# 1. app.supabase.com 접속 → "New Project" 클릭
# 2. 프로젝트명: yangpyeong-poc (PoC 전용)
# 3. 데이터베이스 비밀번호: 강력한 랜덤 비밀번호 생성 (저장 필수)
# 4. 리전: Northeast Asia (Seoul) — ap-northeast-2
# 5. Plan: Free
```

**Free 플랜 제공 리소스 (2026 기준):**

| 리소스 | Free 플랜 한도 |
|--------|---------------|
| 프로젝트 수 | 2개 |
| 데이터베이스 용량 | 500 MB |
| 월간 활성 사용자 (MAU) | 50,000명 |
| 파일 스토리지 | 1 GB |
| DB Egress | 5 GB/월 |
| Storage Egress | 5 GB/월 |
| Edge Functions 호출 | 500,000회/월 |
| 백업 | 없음 |
| 비활성 일시정지 | 7일 비활성 시 자동 정지 |

#### 2.2.2 Supabase CLI 설치 (로컬 개발 환경)

```bash
# Windows (Scoop 사용)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 또는 WSL2/Ubuntu
brew install supabase/tap/supabase

# 버전 확인
supabase --version
# 예상 출력: 1.x.x
```

#### 2.2.3 로컬 프로젝트 초기화

```bash
# 프로젝트 루트에서 실행
supabase init

# 이후 생성되는 파일:
# supabase/
# ├── config.toml       ← 로컬 설정 (커밋 가능)
# ├── migrations/       ← 마이그레이션 파일 (커밋 가능)
# └── seed.sql          ← 시드 데이터 (커밋 가능)
```

#### 2.2.4 로컬 Supabase 스택 시작

```bash
# Docker가 실행 중이어야 함
supabase start

# 성공 시 출력 예시:
# Started supabase local development setup.
#
#          API URL: http://127.0.0.1:54321
#      GraphQL URL: http://127.0.0.1:54321/graphql/v1
#           DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
#       Studio URL: http://127.0.0.1:54323
#     Inbucket URL: http://127.0.0.1:54324   ← 이메일 테스트
#         anon key: eyJ...
#  service_role key: eyJ...
```

로컬 스택이 시작되면 `.env.local`에 환경 변수를 저장한다:

```env
# .env.local (gitignore에 포함되어 있어야 함)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # supabase start 출력값
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # supabase start 출력값
```

---

### 2.3 Week 1: 핵심 기능 프로토타이핑

#### 2.3.1 Supabase JS 클라이언트 설치

```bash
npm install @supabase/supabase-js @supabase/ssr
```

#### 2.3.2 클라이언트 유틸리티 생성

**파일 구조:**

```
src/lib/supabase/
├── client.ts       ← 브라우저 클라이언트
├── server.ts       ← 서버 컴포넌트/액션 클라이언트
└── middleware.ts   ← 미들웨어 클라이언트
```

**`src/lib/supabase/client.ts`:**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`src/lib/supabase/server.ts`:**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서는 쿠키 쓰기 무시
          }
        },
      },
    }
  )
}
```

#### 2.3.3 기본 CRUD 테이블 생성 (PoC용)

Supabase Studio (http://127.0.0.1:54323)에서 SQL Editor를 열고 실행:

```sql
-- PoC용 간단한 서버 로그 테이블
CREATE TABLE server_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message     TEXT NOT NULL,
  metadata    JSONB,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS 활성화
ALTER TABLE server_logs ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자만 자신의 로그 조회 가능
CREATE POLICY "인증된 사용자는 자신의 로그를 볼 수 있다"
  ON server_logs FOR SELECT
  USING (auth.uid() = user_id);

-- 인증된 사용자만 로그 삽입 가능
CREATE POLICY "인증된 사용자는 로그를 삽입할 수 있다"
  ON server_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

#### 2.3.4 인증 기능 PoC

```typescript
// src/app/auth/test/page.tsx (PoC 전용, 프로덕션 제거 필요)
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function AuthTestPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const supabase = createClient()

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) console.error('가입 실패:', error.message)
    else console.log('가입 성공 — Inbucket에서 이메일 확인')
  }

  async function signIn() {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) console.error('로그인 실패:', error.message)
    else console.log('로그인 성공:', data.user?.email)
  }

  return (
    <div>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="이메일" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" />
      <button onClick={signUp}>가입</button>
      <button onClick={signIn}>로그인</button>
    </div>
  )
}
```

---

### 2.4 Week 2: RLS 검증 및 PoC 완성

#### 2.4.1 RLS 동작 검증 체크리스트

```
[ ] 비인증 상태에서 server_logs SELECT → 0행 반환 확인
[ ] 로그인 후 자신의 데이터만 조회되는지 확인
[ ] 다른 사용자의 row_id로 접근 시 거부 확인
[ ] service_role_key로 RLS 우회 가능한지 확인 (서버 사이드 관리 작업용)
```

#### 2.4.2 타입 자동 생성

```bash
# 원격 프로젝트 연결
supabase link --project-ref <your-project-ref>

# 타입 생성
supabase gen types typescript --linked > src/types/supabase.ts
```

생성된 타입을 활용해 타입 안전성 확보:

```typescript
import type { Database } from '@/types/supabase'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient<Database>(url, key)

// 이제 자동완성 및 타입 체크 가능
const { data } = await supabase
  .from('server_logs')
  .select('*')
  .eq('level', 'error')
// data는 Database['public']['Tables']['server_logs']['Row'][] 타입
```

---

### 2.5 Phase 1 성공 기준 (Definition of Done)

| 항목 | 성공 조건 |
|------|----------|
| **환경 설정** | `supabase start`로 로컬 스택 정상 기동 |
| **인증** | 이메일/비밀번호 회원가입 + 로그인 동작 |
| **CRUD** | server_logs 테이블 INSERT/SELECT 동작 |
| **RLS** | 비인증 사용자 접근 차단 확인 |
| **타입 안전성** | `supabase gen types` 생성 파일 import 성공 |
| **로컬 vs 원격** | 로컬 스택과 원격 Free 플랜 모두 동작 확인 |

**Go 판정 기준**: 위 6개 항목 중 5개 이상 충족
**No-Go 판정 기준**: 인증 또는 RLS 실패 → 원인 분석 후 1주 연장

---

## 3. Phase 2: MVP 통합 (2–4주)

### 3.1 Phase 2 목표

> "인증된 사용자가 대시보드 데이터를 실제로 CRUD할 수 있는 MVP를 구축한다"

Phase 1의 PoC를 기반으로 프로덕션 코드베이스에 Supabase를 통합한다.

---

### 3.2 Week 3–4: 데이터베이스 스키마 설계 및 마이그레이션

#### 3.2.1 스키마 설계 원칙

양평 부엌 서버 대시보드의 도메인을 분석하여 다음 테이블을 설계한다:

```sql
-- 마이그레이션 파일: supabase/migrations/20260406000001_initial_schema.sql

-- 1. 서버 프로세스 스냅샷 테이블
CREATE TABLE process_snapshots (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  process_name TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('online', 'stopped', 'errored', 'launching')),
  pid          INTEGER,
  cpu_usage    DECIMAL(5,2),   -- 백분율
  memory_mb    DECIMAL(10,2),  -- MB 단위
  uptime_sec   BIGINT,
  restarts     INTEGER DEFAULT 0,
  raw_data     JSONB           -- PM2 원본 데이터
);

-- 2. 시스템 메트릭 테이블
CREATE TABLE system_metrics (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  cpu_total    DECIMAL(5,2),
  memory_total_mb  DECIMAL(10,2),
  memory_used_mb   DECIMAL(10,2),
  disk_total_gb    DECIMAL(10,2),
  disk_used_gb     DECIMAL(10,2),
  load_avg_1m      DECIMAL(8,4),
  load_avg_5m      DECIMAL(8,4),
  load_avg_15m     DECIMAL(8,4)
);

-- 3. 감사 로그 테이블
CREATE TABLE audit_logs (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  resource     TEXT,
  details      JSONB,
  ip_address   INET,
  user_agent   TEXT
);

-- 인덱스 (쿼리 성능 최적화)
CREATE INDEX idx_process_snapshots_created_at ON process_snapshots(created_at DESC);
CREATE INDEX idx_process_snapshots_process_name ON process_snapshots(process_name);
CREATE INDEX idx_system_metrics_created_at ON system_metrics(created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

#### 3.2.2 마이그레이션 워크플로우

```bash
# 새 마이그레이션 파일 생성
supabase migration new initial_schema

# 로컬에 마이그레이션 적용
supabase db reset  # 전체 초기화 후 재적용 (개발 중)

# 또는 증분 적용
supabase migration up

# 원격 DB에 적용 (주의: 프로덕션 영향)
supabase db push
```

#### 3.2.3 RLS 정책 설계

```sql
-- 마이그레이션 파일: supabase/migrations/20260406000002_rls_policies.sql

-- process_snapshots: 인증된 사용자 읽기 가능, 서비스 롤만 쓰기 가능
ALTER TABLE process_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "인증된 사용자는 프로세스 스냅샷 조회 가능"
  ON process_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- system_metrics: 인증된 사용자 읽기 가능
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "인증된 사용자는 시스템 메트릭 조회 가능"
  ON system_metrics FOR SELECT
  TO authenticated
  USING (true);

-- audit_logs: 사용자는 자신의 로그만, 서비스 롤은 전체
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자는 자신의 감사 로그만 조회 가능"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

---

### 3.3 Week 3–4: Next.js 인증 통합 (SSR + Middleware)

#### 3.3.1 미들웨어 설정

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 보호된 경로: 인증 필요
  const protectedPaths = ['/dashboard', '/processes', '/logs', '/settings']
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // 이미 로그인된 사용자가 로그인 페이지 접근 시 대시보드로 리다이렉트
  if (request.nextUrl.pathname.startsWith('/auth') && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

#### 3.3.2 로그인 페이지 구현

```typescript
// src/app/auth/login/page.tsx
import { login, signup } from './actions'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900 p-8">
        <h1 className="mb-6 text-2xl font-bold text-white">양평 부엌 서버</h1>
        <form className="space-y-4">
          <div>
            <label className="text-sm text-gray-400">이메일</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400">비밀번호</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
            />
          </div>
          <button formAction={login} className="w-full rounded bg-emerald-600 py-2 text-white hover:bg-emerald-700">
            로그인
          </button>
          <button formAction={signup} className="w-full rounded border border-gray-700 py-2 text-gray-300 hover:bg-gray-800">
            가입
          </button>
        </form>
      </div>
    </div>
  )
}
```

```typescript
// src/app/auth/login/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    redirect('/auth/login?error=' + encodeURIComponent(error.message))
  }

  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    redirect('/auth/login?error=' + encodeURIComponent(error.message))
  }

  redirect('/auth/login?message=이메일을 확인해주세요')
}
```

---

### 3.4 Week 4–5: 핵심 기능 구현 (대시보드 데이터 CRUD)

#### 3.4.1 API 라우트 — 메트릭 수집

```typescript
// src/app/api/metrics/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// 서버 사이드 전용: Service Role Key 사용
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // RLS 우회 (서비스 레이어)
)

export async function POST(request: Request) {
  const body = await request.json()

  const { error } = await supabase
    .from('system_metrics')
    .insert({
      cpu_total: body.cpu,
      memory_total_mb: body.memTotal,
      memory_used_mb: body.memUsed,
      disk_total_gb: body.diskTotal,
      disk_used_gb: body.diskUsed,
      load_avg_1m: body.loadAvg[0],
      load_avg_5m: body.loadAvg[1],
      load_avg_15m: body.loadAvg[2],
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

#### 3.4.2 Server Component에서 데이터 조회

```typescript
// src/app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 최근 메트릭 조회
  const { data: metrics, error } = await supabase
    .from('system_metrics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60) // 최근 60개 (1시간 데이터)

  if (error) {
    return <div>데이터를 불러올 수 없습니다: {error.message}</div>
  }

  return (
    <div>
      {/* 메트릭 렌더링 */}
    </div>
  )
}
```

---

### 3.5 Phase 2 성공 기준 (Definition of Done)

| 항목 | 성공 조건 |
|------|----------|
| **스키마** | 3개 테이블 마이그레이션 파일 커밋 완료 |
| **인증 흐름** | 미들웨어 보호 → 로그인 → 리다이렉트 정상 동작 |
| **데이터 조회** | Server Component에서 인증된 사용자의 메트릭 데이터 표시 |
| **데이터 수집** | `/api/metrics` POST 엔드포인트로 데이터 삽입 성공 |
| **RLS 검증** | 비인증 상태에서 모든 테이블 접근 차단 확인 |
| **타입 안전성** | 모든 Supabase 쿼리에 생성된 타입 적용 |

**Go 판정 기준**: 위 6개 항목 중 5개 이상 충족
**No-Go 판정 기준**: 인증 흐름 또는 데이터 조회 실패 → 원인 분석

---

## 4. Phase 3: 고급 기능 (4–8주)

### 4.1 Phase 3 목표

> "프로덕션 수준의 기능을 완성한다: 실시간, 파일, 비동기 처리"

---

### 4.2 Realtime — 실시간 대시보드

#### 4.2.1 Realtime 기본 개념

Supabase Realtime은 PostgreSQL의 WAL(Write-Ahead Log)을 통해 변경 이벤트를
웹소켓으로 브라우저에 전달한다. 3가지 채널 타입을 제공한다:

| 채널 타입 | 용도 | 비용 |
|----------|------|------|
| **Postgres Changes** | DB 변경 이벤트 구독 | 메시지 당 과금 |
| **Broadcast** | 사용자 간 메시지 전달 | 메시지 당 과금 |
| **Presence** | 온라인 사용자 추적 | 메시지 당 과금 |

**Free/Pro 플랜 포함량**: 2백만 Realtime 메시지/월

#### 4.2.2 실시간 메트릭 컴포넌트

```typescript
// src/components/dashboard/realtime-metrics.tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { Database } from '@/types/supabase'

type SystemMetric = Database['public']['Tables']['system_metrics']['Row']

export function RealtimeMetrics({ initialData }: { initialData: SystemMetric[] }) {
  const [metrics, setMetrics] = useState(initialData)
  const supabase = createClient()

  useEffect(() => {
    // Postgres Changes 구독
    const channel = supabase
      .channel('system-metrics-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'system_metrics',
        },
        (payload) => {
          // 새 메트릭 데이터 추가 (최근 60개 유지)
          setMetrics(prev => [payload.new as SystemMetric, ...prev].slice(0, 60))
        }
      )
      .subscribe()

    // 컴포넌트 언마운트 시 구독 해제 (비용 절감)
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">실시간 시스템 메트릭</h2>
      {/* 메트릭 렌더링 */}
    </div>
  )
}
```

> **비용 최적화 포인트**: 컴포넌트 언마운트 시 반드시 `removeChannel()` 호출.
> 구독이 쌓이면 불필요한 메시지 과금 발생.

#### 4.2.3 Realtime 활성화 설정

Supabase Studio → Table Editor → `system_metrics` 테이블 → Enable Realtime 토글 ON

또는 마이그레이션으로:

```sql
-- supabase/migrations/20260406000003_enable_realtime.sql
ALTER PUBLICATION supabase_realtime ADD TABLE system_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE process_snapshots;
```

---

### 4.3 Storage — 파일 업로드

#### 4.3.1 스토리지 버킷 생성

```sql
-- 마이그레이션 또는 Studio에서
INSERT INTO storage.buckets (id, name, public)
VALUES ('server-logs', 'server-logs', false); -- 비공개 버킷

INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', false);
```

#### 4.3.2 스토리지 RLS 정책

```sql
-- 인증된 사용자만 자신의 파일 접근 가능
CREATE POLICY "인증된 사용자는 자신의 파일 업로드 가능"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'server-logs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "인증된 사용자는 자신의 파일 조회 가능"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'server-logs' AND auth.uid()::text = (storage.foldername(name))[1]);
```

#### 4.3.3 파일 업로드 구현

```typescript
// src/lib/storage.ts
import { createClient } from '@/lib/supabase/server'

export async function uploadLogFile(file: File, userId: string) {
  const supabase = await createClient()

  const filePath = `${userId}/${Date.now()}-${file.name}`

  const { data, error } = await supabase.storage
    .from('server-logs')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (error) throw error

  return data.path
}

export async function getLogFileUrl(path: string) {
  const supabase = await createClient()

  const { data } = await supabase.storage
    .from('server-logs')
    .createSignedUrl(path, 3600) // 1시간 유효

  return data?.signedUrl
}
```

---

### 4.4 Edge Functions — Webhook 및 스케줄링

#### 4.4.1 Edge Function 생성

```bash
# Edge Function 생성
supabase functions new collect-metrics

# 생성 위치: supabase/functions/collect-metrics/index.ts
```

```typescript
// supabase/functions/collect-metrics/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Webhook 페이로드 처리
  const body = await req.json()

  const { error } = await supabase
    .from('process_snapshots')
    .insert({
      process_name: body.name,
      status: body.pm2_env.status,
      pid: body.pid,
      cpu_usage: body.monit?.cpu,
      memory_mb: body.monit?.memory ? body.monit.memory / 1024 / 1024 : null,
      uptime_sec: body.pm2_env.pm_uptime
        ? Math.floor((Date.now() - body.pm2_env.pm_uptime) / 1000)
        : null,
      restarts: body.pm2_env.restart_time ?? 0,
      raw_data: body,
    })

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
```

#### 4.4.2 Edge Function 배포

```bash
# 로컬 테스트
supabase functions serve collect-metrics

# 원격 배포
supabase functions deploy collect-metrics

# 환경 변수 설정 (자동 주입: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
supabase secrets set EXTERNAL_WEBHOOK_SECRET=your-secret
```

#### 4.4.3 pg_cron으로 스케줄 작업 (Edge Function 대체)

단순 DB 정리 작업은 Edge Function 호출 대신 DB 내장 스케줄러를 사용해 비용 절감:

```sql
-- pg_cron 확장 활성화 (Studio에서)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 7일 이상 된 메트릭 데이터 자동 삭제 (매일 자정)
SELECT cron.schedule(
  'cleanup-old-metrics',
  '0 0 * * *',
  $$DELETE FROM system_metrics WHERE created_at < now() - interval '7 days'$$
);

-- 30일 이상 된 감사 로그 자동 삭제
SELECT cron.schedule(
  'cleanup-old-audit-logs',
  '0 1 * * *',
  $$DELETE FROM audit_logs WHERE created_at < now() - interval '30 days'$$
);
```

---

### 4.5 성능 최적화

#### 4.5.1 커넥션 풀링 설정

```
# Supabase 대시보드 → Settings → Database → Connection pooling
# 
# Transaction mode (권장: 서버리스/Next.js API Routes)
# Pool size: 10-20 (코어 수 × 2 + 1)
# 
# 연결 URL 형식:
# postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
```

Next.js API Routes에서 항상 Pooler URL 사용:

```typescript
// next.config.ts
const nextConfig = {
  env: {
    // Transaction mode pooler URL (6543 포트)
    DATABASE_URL: process.env.DATABASE_URL, // pooler URL
  }
}
```

#### 4.5.2 쿼리 최적화 체크리스트

```sql
-- 느린 쿼리 탐지
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 미사용 인덱스 탐지
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename;

-- 테이블 크기 확인
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

---

### 4.6 Phase 3 성공 기준 (Definition of Done)

| 항목 | 성공 조건 |
|------|----------|
| **Realtime** | 새 메트릭 삽입 시 브라우저 UI 1초 내 자동 갱신 |
| **Storage** | 파일 업로드 + Signed URL 발급 + 다운로드 동작 |
| **Edge Function** | `/collect-metrics` 엔드포인트 배포 및 데이터 삽입 확인 |
| **스케줄링** | pg_cron으로 오래된 데이터 자동 정리 동작 |
| **성능** | 대시보드 주요 쿼리 응답시간 200ms 이하 |
| **연결 풀링** | Transaction mode pooler URL 적용 |

**Go 판정 기준**: 위 6개 항목 중 4개 이상 충족
**No-Go 판정 기준**: Realtime 또는 Edge Function 미동작 → 2주 연장

---

## 5. Phase 4: 운영 안정화 (지속)

### 5.1 Phase 4 목표

> "장기 운영에서 안정성, 보안, 비용 효율을 유지한다"

---

### 5.2 모니터링 & 알림 설정

#### 5.2.1 Supabase 내장 모니터링

Supabase 대시보드 → Reports에서 제공하는 기본 모니터링:

| 지표 | 위치 | 알림 임계값 권장 |
|------|------|----------------|
| DB CPU 사용률 | Reports → Database | 80% 이상 |
| DB 연결 수 | Reports → Database | 최대 연결의 80% |
| Storage 사용량 | Reports → Storage | 한도의 80% |
| Edge Function 오류율 | Reports → Edge Functions | 5% 이상 |
| Auth 실패율 | Logs → Auth | 10% 이상 |

#### 5.2.2 외부 알림 연동 (선택적)

```typescript
// supabase/functions/alert-webhook/index.ts
// Supabase Webhook → Edge Function → 텔레그램/슬랙 알림

Deno.serve(async (req) => {
  const payload = await req.json()

  // 심각한 오류 감지 시 알림 발송
  if (payload.type === 'INSERT' && payload.table === 'audit_logs') {
    const log = payload.record
    if (log.action === 'error' || log.action === 'critical') {
      await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Deno.env.get('TELEGRAM_CHAT_ID'),
          text: `[양평 부엌 서버] 오류 발생: ${log.details?.message ?? '알 수 없는 오류'}`,
        }),
      })
    }
  }

  return new Response('ok')
})
```

---

### 5.3 백업 & DR 계획

#### 5.3.1 Free 플랜의 백업 한계

Free 플랜은 자동 백업을 제공하지 않는다.
아래 수동 백업 전략을 구현한다:

```bash
# 수동 DB 덤프 (로컬 실행)
# supabase db dump를 이용한 스키마 + 데이터 백업

# 스키마만 백업
supabase db dump --schema-only -f schema-backup-$(date +%Y%m%d).sql

# 데이터 포함 백업
pg_dump postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres \
  --no-acl --no-owner \
  -f full-backup-$(date +%Y%m%d).sql
```

주간 자동 백업 스크립트 (cron):

```bash
# /etc/cron.weekly/supabase-backup (WSL2)
#!/bin/bash
BACKUP_DIR="/mnt/d/supabase-backups"
DATE=$(date +%Y%m%d)

pg_dump "$DATABASE_URL" \
  --no-acl --no-owner \
  -f "${BACKUP_DIR}/backup-${DATE}.sql"

# 30일 이상 된 백업 삭제
find "$BACKUP_DIR" -name "backup-*.sql" -mtime +30 -delete
```

#### 5.3.2 Pro 플랜 업그레이드 시 백업 자동화

Pro 플랜으로 전환 시 자동 일일 백업 활성화:
- 보존 기간: 7일 (Pro), 14일 (Team)
- PITR(Point-in-Time Recovery): 애드온 추가 필요

---

### 5.4 보안 감사

#### 5.4.1 정기 보안 체크리스트 (월 1회)

```
[ ] RLS 정책 검토 — 모든 테이블 RLS 활성화 확인
[ ] 서비스 롤 키 노출 여부 확인 — GitHub 코드 스캔
[ ] ANON 키 권한 범위 확인 — 최소 권한 원칙
[ ] 비활성 사용자 계정 검토
[ ] Edge Function 시크릿 순환 (3개월마다)
[ ] pg_audit 로그 검토 (비정상 쿼리 패턴)
[ ] CORS 설정 검토 — 허용 도메인 최소화
```

#### 5.4.2 API 키 순환 절차

```bash
# 새 API 키 발급 (Supabase 대시보드 → Settings → API)
# 1. 새 키 발급
# 2. 환경 변수 업데이트 (.env.local)
# 3. PM2 재시작: pm2 restart all
# 4. 이전 키 폐기
```

#### 5.4.3 입력값 검증 (Zod 스키마)

```typescript
// src/lib/validation.ts
import { z } from 'zod'

export const MetricsSchema = z.object({
  cpu: z.number().min(0).max(100),
  memTotal: z.number().positive(),
  memUsed: z.number().positive(),
  diskTotal: z.number().positive(),
  diskUsed: z.number().positive(),
  loadAvg: z.array(z.number()).length(3),
})

export const ProcessSnapshotSchema = z.object({
  name: z.string().min(1).max(255),
  status: z.enum(['online', 'stopped', 'errored', 'launching']),
  pid: z.number().int().optional(),
  cpu: z.number().min(0).max(100).optional(),
  memory: z.number().positive().optional(),
})
```

---

### 5.5 비용 최적화 지속 관리

#### 5.5.1 월간 사용량 리뷰

매월 1일, Supabase 대시보드 → Billing에서 아래 항목을 점검한다:

| 점검 항목 | 임계값 | 조치 |
|----------|--------|------|
| DB 용량 | Free: 400MB, Pro: 7GB | 오래된 데이터 정리 |
| MAU | Free: 40K | 비활성 사용자 분석 |
| Egress | Free: 4GB | 캐싱 레이어 추가 |
| Edge Function 호출 | Free: 400K | DB 함수로 마이그레이션 |

#### 5.5.2 Pro 플랜 업그레이드 판단 기준

아래 중 2개 이상 해당 시 Pro 플랜 ($25/월) 업그레이드 고려:

```
[ ] DB 용량이 400MB (Free 한도의 80%) 초과
[ ] MAU가 40,000명 (Free 한도의 80%) 초과
[ ] 7일 비활성 정지로 서비스 중단 경험
[ ] 자동 일일 백업이 필요해진 경우
[ ] 팀원이 2명 이상으로 늘어난 경우
[ ] 이미지 변환 기능이 필요한 경우
```

---

### 5.6 Phase 4 성공 기준 (지속적 운영 KPI)

| KPI | 목표값 |
|-----|--------|
| 서비스 가용성 | 99.5% 이상 |
| 평균 응답 시간 | 200ms 이하 |
| DB 용량 증가율 | 월 50MB 이하 (Free 유지 시) |
| 보안 인시던트 | 0건 |
| 월 비용 | Free 플랜 유지 또는 Pro $25 이내 |

---

## 6. 의사결정 체크포인트 (Go/No-Go)

### 6.1 Phase 1 → Phase 2 전환 판단

**시점**: Phase 1 완료 후 (1–2주 후)

| 판단 항목 | Go 기준 | No-Go 기준 |
|----------|---------|------------|
| PoC 기능 동작 | 6개 중 5개 이상 | 4개 이하 |
| 팀 학습 곡선 | 주요 개념 이해 완료 | CLI/타입 사용 어려움 |
| 성능 | 로컬 쿼리 100ms 이하 | 500ms 이상 |
| 보안 | RLS 정상 동작 | RLS 우회 가능 |

**No-Go 시 대안**: 1주 연장 학습, 또는 대안 백엔드(Firebase, PocketBase) 재평가

### 6.2 Phase 2 → Phase 3 전환 판단

**시점**: Phase 2 완료 후 (4–5주 후)

| 판단 항목 | Go 기준 | No-Go 기준 |
|----------|---------|------------|
| MVP 기능 완성도 | 6개 중 5개 이상 | 4개 이하 |
| 인증 안정성 | 로그인/로그아웃 100% 성공 | 세션 만료 버그 존재 |
| 데이터 정합성 | RLS 정책 완전 적용 | 데이터 누락 또는 권한 오류 |
| 성능 | 대시보드 로드 1초 이하 | 3초 이상 |

**No-Go 시 조치**: Phase 2 항목 재작업, Realtime 도입 지연 고려

### 6.3 Phase 3 → Phase 4 전환 판단

**시점**: Phase 3 완료 후 (8–10주 후)

| 판단 항목 | Go 기준 | No-Go 기준 |
|----------|---------|------------|
| 고급 기능 완성도 | 6개 중 4개 이상 | 3개 이하 |
| Realtime 안정성 | 연결 끊김 자동 복구 | 수동 재연결 필요 |
| Edge Function 신뢰성 | 오류율 1% 미만 | 5% 이상 |
| 비용 | Free 플랜 내 유지 | 예기치 않은 과금 |

**No-Go 시 조치**: 문제 기능 격리 또는 대안 구현 탐색

### 6.4 Free → Pro 플랜 업그레이드 판단

**핵심 질문**: "$25/월이 현재 비용으로 정당화되는가?"

| 상황 | 권장 |
|------|------|
| 개인 프로젝트, 소규모 트래픽 | Free 유지 |
| 7일 비활성 정지가 문제가 된 경우 | Pro 업그레이드 |
| DB 용량 300MB 초과 | Pro 검토 |
| 자동 백업이 비즈니스 필수인 경우 | Pro 즉시 업그레이드 |
| 팀원 2명 이상 공동 개발 | Pro 고려 |

---

## 7. 리스크 관리

### 7.1 Phase 1 리스크

| 리스크 | 확률 | 영향도 | 완화 전략 |
|--------|------|--------|----------|
| Docker 설치/설정 문제 | 중 | 중 | WSL2에서 Docker Engine 직접 설치 가이드 준비 |
| CLI 버전 호환성 문제 | 저 | 중 | `npx supabase@latest` 사용으로 항상 최신 버전 |
| 학습 곡선 (RLS 개념) | 고 | 중 | Supabase 공식 튜토리얼 완주 후 시작 |
| 로컬 포트 충돌 | 저 | 저 | `supabase/config.toml`에서 포트 커스텀 설정 |

### 7.2 Phase 2 리스크

| 리스크 | 확률 | 영향도 | 완화 전략 |
|--------|------|--------|----------|
| Next.js 15 App Router + SSR 쿠키 처리 버그 | 중 | 고 | `@supabase/ssr` 최신 버전 사용 + 공식 예제 준수 |
| 마이그레이션 충돌 | 저 | 고 | 개발/스테이징 환경 분리 + `supabase db reset` 활용 |
| RLS 정책 누락으로 데이터 노출 | 저 | 매우 고 | 모든 테이블 RLS 기본 ON + 정책 없으면 전체 차단 |
| 서비스 롤 키 실수로 클라이언트 노출 | 저 | 매우 고 | 코드 리뷰 필수 + `NEXT_PUBLIC_` 접두사 금지 규칙 |

### 7.3 Phase 3 리스크

| 리스크 | 확률 | 영향도 | 완화 전략 |
|--------|------|--------|----------|
| Realtime 연결 불안정 | 중 | 중 | 자동 재연결 로직 구현 + 폴백 폴링 준비 |
| Edge Function 콜드 스타트 지연 | 중 | 저 | 크리티컬 경로에 Edge Function 미사용 |
| Storage 비용 예상 초과 | 저 | 중 | 파일 크기 제한 + 고아 파일 정리 자동화 |
| Free 플랜 한도 초과 | 중 | 중 | 사용량 알림 설정 + 자동 정리 스크립트 |

### 7.4 Phase 4 리스크 (운영 중)

| 리스크 | 확률 | 영향도 | 완화 전략 |
|--------|------|--------|----------|
| Free 플랜 7일 비활성 정지 | 고 | 고 | Health check 엔드포인트 + 외부 핑 서비스 |
| Supabase 서비스 장애 | 저 | 고 | 정적 캐시 레이어 + 장애 상태 페이지 |
| 데이터 손실 (백업 없음) | 저 | 매우 고 | 주간 수동 백업 스크립트 실행 필수 |
| 비용 급증 (실수로 Pro 전환 후 과다 사용) | 저 | 중 | Spend Cap 활성화 유지 |

### 7.5 공통 리스크 완화: 비활성 정지 방지

Free 플랜의 7일 비활성 정지는 운영 중 가장 빈번한 문제다.

```bash
# 해결책 1: 외부 핑 서비스 (UptimeRobot 등 무료 플랜)
# - 매 5분마다 https://your-domain.com/api/health 핑

# 해결책 2: cron으로 주기적 DB 쿼리 (WSL2 크론탭)
# crontab -e
# */60 * * * * curl -s https://xxxx.supabase.co/rest/v1/system_metrics?limit=1 \
#   -H "apikey: $ANON_KEY" > /dev/null 2>&1
```

---

## 8. 전체 타임라인 요약

```
주차  1    2    3    4    5    6    7    8    9   10+
     |    |    |    |    |    |    |    |    |    |
     [====Phase 1: 탐색 & PoC====]
          [============Phase 2: MVP 통합============]
                              [============Phase 3: 고급 기능============]
                                                        [====Phase 4: 운영 안정화 (계속)====→
```

| Phase | 기간 | 핵심 산출물 |
|-------|------|------------|
| Phase 1 | 1–2주 | PoC 앱 (로컬), RLS 검증 완료 |
| Phase 2 | 2–4주 | MVP 배포, 인증 통합, 기본 CRUD |
| Phase 3 | 4–8주 | Realtime 대시보드, Storage, Edge Functions |
| Phase 4 | 8주+ | 모니터링, 백업, 보안 감사, 비용 최적화 |

---

> **참고**: 이 로드맵은 양평 부엌 서버 대시보드 프로젝트 기준으로 작성되었다.
> 각 Phase의 기간은 1인 개발자 기준이며, 팀 규모에 따라 조정한다.

**출처:**
- [Supabase 공식 문서 — 로컬 개발 CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase + Next.js 퀵스타트](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase 가격 정책](https://supabase.com/pricing)
- [Supabase 빌링 가이드](https://supabase.com/docs/guides/platform/billing-on-supabase)
