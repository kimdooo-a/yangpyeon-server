# Supabase Client SDKs & API

> 작성일: 2026-04-06 | Wave 1 리서치 문서

---

## 목차

1. [SDK 생태계 전체 맵](#1-sdk-생태계-전체-맵)
2. [JavaScript SDK 상세 (@supabase/supabase-js)](#2-javascript-sdk-상세-supabasesupabase-js)
3. [Server-side SDK (@supabase/ssr)](#3-server-side-sdk-supabasessr)
4. [PostgREST API 직접 사용](#4-postgrest-api-직접-사용)
5. [GraphQL API (pg_graphql)](#5-graphql-api-pg_graphql)
6. [Management API](#6-management-api)
7. [타입 안전성 (TypeScript)](#7-타입-안전성-typescript)

---

## 1. SDK 생태계 전체 맵

### 공식 SDK 목록

| 언어/플랫폼 | 패키지명 | 버전 | 상태 |
|------------|---------|-----|------|
| **JavaScript/TypeScript** | `@supabase/supabase-js` | v2.x | 안정 (공식) |
| **Flutter/Dart** | `supabase_flutter` | v2.x | 안정 (공식) |
| **Swift (iOS/macOS)** | `supabase-swift` | v2.x | 안정 (공식) |
| **Kotlin (Android)** | `supabase-kt` | v3.x | 안정 (공식) |
| **Python** | `supabase-py` | v2.x | 안정 (공식) |
| **C#** | `supabase-csharp` | v1.x | 안정 (커뮤니티) |
| **Go** | `supabase-go` | v1.x | 커뮤니티 |
| **Ruby** | `supabase-rb` | v1.x | 커뮤니티 |
| **GDScript (Godot)** | `supabase-gdscript` | - | 커뮤니티 |

### SDK 기능 지원 매트릭스

| 기능 | JS | Flutter | Swift | Kotlin | Python |
|------|----|---------|----|--------|--------|
| **데이터베이스 CRUD** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RPC (Functions)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **인증** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **소셜 로그인** | ✅ | ✅ | ✅ | ✅ | 제한 |
| **스토리지** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Realtime** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Edge Functions** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **TypeScript 타입** | ✅ | - | - | - | - |
| **SSR 지원** | ✅ (@supabase/ssr) | - | - | - | - |

### 언어별 설치

**JavaScript/TypeScript**:
```bash
npm install @supabase/supabase-js
# 또는
yarn add @supabase/supabase-js
# 또는
pnpm add @supabase/supabase-js
```

**Flutter/Dart**:
```yaml
# pubspec.yaml
dependencies:
  supabase_flutter: ^2.0.0
```

**Swift (SPM)**:
```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0")
]
```

**Kotlin (Gradle)**:
```kotlin
// build.gradle.kts
dependencies {
    implementation("io.github.jan-tennert.supabase:postgrest-kt:3.0.0")
    implementation("io.github.jan-tennert.supabase:auth-kt:3.0.0")
    implementation("io.github.jan-tennert.supabase:realtime-kt:3.0.0")
    implementation("io.github.jan-tennert.supabase:storage-kt:3.0.0")
    implementation("io.ktor:ktor-client-android:2.3.0")
}
```

**Python**:
```bash
pip install supabase
# 또는
poetry add supabase
```

---

## 2. JavaScript SDK 상세 (@supabase/supabase-js)

### 2.1 초기화 및 설정

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// 기본 초기화 (클라이언트 컴포넌트용)
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 커스텀 옵션 포함 초기화
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: customStorageAdapter,  // 커스텀 세션 스토리지
      storageKey: 'my-app-auth',
      flowType: 'pkce',  // PKCE 플로우 (더 안전)
    },
    global: {
      headers: { 'x-my-custom-header': 'my-app' },
      fetch: customFetch,  // 커스텀 fetch 함수
    },
    db: {
      schema: 'public',  // 기본 스키마
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      }
    }
  }
)
```

### 2.2 데이터베이스 쿼리 빌더

#### SELECT (읽기)

```typescript
// 기본 전체 조회
const { data, error } = await supabase
  .from('posts')
  .select('*')

// 특정 컬럼 선택
const { data } = await supabase
  .from('posts')
  .select('id, title, created_at')

// 관계 데이터 포함 (JOIN)
const { data } = await supabase
  .from('posts')
  .select(`
    id,
    title,
    content,
    author:profiles (
      id,
      username,
      avatar_url
    ),
    categories (
      id,
      name
    )
  `)

// 중첩 관계
const { data } = await supabase
  .from('users')
  .select(`
    id,
    email,
    posts (
      id,
      title,
      comments (
        id,
        content
      )
    )
  `)

// 집계 함수
const { count } = await supabase
  .from('posts')
  .select('*', { count: 'exact', head: true })

// count와 데이터 동시 조회
const { data, count } = await supabase
  .from('posts')
  .select('*', { count: 'exact' })
  .eq('published', true)
```

#### 필터링

```typescript
// 동등 비교
.eq('status', 'active')

// 부정 비교
.neq('status', 'deleted')

// 숫자 범위
.gt('age', 18)        // greater than
.gte('age', 18)       // greater than or equal
.lt('price', 100)     // less than
.lte('price', 100)    // less than or equal

// 범위 (between)
.gte('created_at', '2024-01-01').lte('created_at', '2024-12-31')

// NULL 체크
.is('deleted_at', null)       // IS NULL
.not('deleted_at', 'is', null)  // IS NOT NULL

// 배열 내 값 포함
.in('status', ['active', 'pending'])

// 배열 필드에 값 포함 여부
.contains('tags', ['typescript', 'supabase'])
.containedBy('tags', ['typescript', 'supabase', 'nextjs'])

// 텍스트 검색
.like('title', '%supabase%')      // LIKE (대소문자 구분)
.ilike('title', '%supabase%')     // ILIKE (대소문자 무시)

// 정규식
.match({ username: '^[a-z]+$' })

// 전문 검색
.textSearch('content', 'supabase postgresql', {
  type: 'websearch',   // 또는 'plainto', 'phrase', 'tsquery'
  config: 'english'
})

// 복합 조건 (OR)
.or('status.eq.active,status.eq.pending')
.or('title.ilike.%supabase%,content.ilike.%supabase%')

// 중첩 AND/OR
.or(`status.eq.active,and(status.eq.pending,priority.gt.5)`)
```

#### 정렬 및 페이지네이션

```typescript
// 정렬
.order('created_at', { ascending: false })
.order('title', { ascending: true, nullsFirst: false })

// 다중 정렬
.order('status').order('created_at', { ascending: false })

// 페이지네이션 (offset 방식)
.range(0, 9)       // 첫 10개 (0-based)
.range(10, 19)     // 두 번째 10개

// limit만 사용
.limit(10)

// 커서 기반 페이지네이션 (성능 우수)
const { data: firstPage } = await supabase
  .from('posts')
  .select('*')
  .order('id')
  .limit(10)

const lastId = firstPage?.[firstPage.length - 1]?.id
const { data: nextPage } = await supabase
  .from('posts')
  .select('*')
  .order('id')
  .gt('id', lastId)
  .limit(10)
```

#### INSERT (생성)

```typescript
// 단일 행 삽입
const { data, error } = await supabase
  .from('posts')
  .insert({
    title: '새 포스트',
    content: '내용',
    author_id: userId,
  })
  .select()  // 삽입된 데이터 반환
  .single()  // 단일 행으로 반환

// 다중 행 삽입
const { data, error } = await supabase
  .from('posts')
  .insert([
    { title: '포스트 1', author_id: userId },
    { title: '포스트 2', author_id: userId },
    { title: '포스트 3', author_id: userId },
  ])
  .select()
```

#### UPDATE (수정)

```typescript
// 조건부 업데이트
const { data, error } = await supabase
  .from('posts')
  .update({
    title: '수정된 제목',
    updated_at: new Date().toISOString(),
  })
  .eq('id', postId)
  .select()
  .single()

// 다중 행 업데이트
const { data, error } = await supabase
  .from('posts')
  .update({ published: true })
  .eq('author_id', userId)
  .select()
```

#### DELETE (삭제)

```typescript
// 조건부 삭제
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId)

// Soft Delete 패턴
const { data, error } = await supabase
  .from('posts')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', postId)
  .select()
  .single()
```

#### UPSERT (삽입 또는 업데이트)

```typescript
// upsert: 존재하면 업데이트, 없으면 삽입
const { data, error } = await supabase
  .from('profiles')
  .upsert({
    id: userId,
    username: 'newname',
    updated_at: new Date().toISOString(),
  })
  .select()
  .single()

// 충돌 컬럼 지정
const { data, error } = await supabase
  .from('user_settings')
  .upsert(
    { user_id: userId, key: 'theme', value: 'dark' },
    { onConflict: 'user_id,key' }
  )
  .select()
```

#### RPC (Stored Functions 호출)

```typescript
// PostgreSQL 함수 호출
const { data, error } = await supabase
  .rpc('get_user_stats', {
    user_id: userId
  })

// 함수 결과 타입 지정
const { data } = await supabase
  .rpc<{ post_count: number; comment_count: number }[]>(
    'get_user_stats',
    { user_id: userId }
  )

// 스칼라 반환 함수
const { data: count } = await supabase
  .rpc('count_active_users')
  // data는 number 타입
```

### 2.3 인증 API

#### 회원가입/로그인

```typescript
// 이메일 + 비밀번호 회원가입
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure_password',
  options: {
    data: {           // 사용자 메타데이터
      full_name: '홍길동',
      username: 'honggildong',
    },
    emailRedirectTo: 'https://yourdomain.com/auth/callback',
  }
})

// 이메일 + 비밀번호 로그인
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure_password',
})

// 소셜 로그인 (OAuth)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',  // github, kakao, apple, discord 등
  options: {
    redirectTo: 'https://yourdomain.com/auth/callback',
    scopes: 'email profile',
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    }
  }
})

// 매직 링크 (Passwordless)
const { error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
  options: {
    emailRedirectTo: 'https://yourdomain.com/auth/callback',
    shouldCreateUser: false,  // 기존 사용자만 허용
  }
})

// OTP (SMS)
const { error } = await supabase.auth.signInWithOtp({
  phone: '+821012345678',
})

// OTP 인증
const { data, error } = await supabase.auth.verifyOtp({
  phone: '+821012345678',
  token: '123456',
  type: 'sms',
})

// 익명 로그인
const { data, error } = await supabase.auth.signInAnonymously()

// 로그아웃
await supabase.auth.signOut()

// 전체 기기에서 로그아웃
await supabase.auth.signOut({ scope: 'global' })
```

#### 사용자 및 세션 관리

```typescript
// 현재 사용자 가져오기 (서버에서 검증)
const { data: { user }, error } = await supabase.auth.getUser()

// 현재 세션 가져오기 (로컬 캐시)
const { data: { session } } = await supabase.auth.getSession()

// 사용자 정보 업데이트
const { data, error } = await supabase.auth.updateUser({
  email: 'newemail@example.com',
  password: 'new_password',
  data: {
    full_name: '새이름',
    avatar_url: 'https://...',
  }
})

// 비밀번호 리셋 이메일
await supabase.auth.resetPasswordForEmail('user@example.com', {
  redirectTo: 'https://yourdomain.com/auth/reset-password',
})

// 세션 갱신
const { data, error } = await supabase.auth.refreshSession()

// Auth 상태 변화 구독
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {
    console.log(event)  // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
    console.log(session)
  }
)

// 구독 해제 (컴포넌트 언마운트 시)
subscription.unsubscribe()
```

#### MFA (다중 인증)

```typescript
// TOTP 등록 시작
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  issuer: 'MyApp',
  friendlyName: 'My Authenticator'
})

// QR 코드 URL과 시크릿 코드 반환
const { totp: { qr_code, secret, uri } } = data

// TOTP 인증 챌린지
const { data: challenge } = await supabase.auth.mfa.challenge({
  factorId: data.id
})

// TOTP 코드 검증
const { data: verifyData } = await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challenge.id,
  code: '123456'
})

// 등록된 MFA 인증 수단 목록
const { data: factors } = await supabase.auth.mfa.listFactors()
```

### 2.4 스토리지 API

```typescript
// 버킷 생성 (서비스 롤 필요)
const { data, error } = await supabase.storage
  .createBucket('avatars', {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    fileSizeLimit: '5MB'
  })

// 파일 업로드
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.jpg`, file, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: true  // 덮어쓰기 허용
  })

// 공개 URL 가져오기
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${userId}/avatar.jpg`)

// 이미지 변환 URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${userId}/avatar.jpg`, {
    transform: {
      width: 200,
      height: 200,
      resize: 'cover',
      format: 'webp',
      quality: 80
    }
  })

// 서명된 URL (비공개 파일 임시 접근)
const { data } = await supabase.storage
  .from('private-docs')
  .createSignedUrl(`${userId}/document.pdf`, 3600)  // 1시간 유효
// data.signedUrl

// 다중 서명 URL
const { data } = await supabase.storage
  .from('private-docs')
  .createSignedUrls([
    `${userId}/doc1.pdf`,
    `${userId}/doc2.pdf`,
  ], 3600)

// 파일 다운로드
const { data: blob } = await supabase.storage
  .from('avatars')
  .download(`${userId}/avatar.jpg`)

// 파일 삭제
const { error } = await supabase.storage
  .from('avatars')
  .remove([`${userId}/avatar.jpg`])

// 파일 이동/복사
await supabase.storage
  .from('avatars')
  .move('old-path/avatar.jpg', 'new-path/avatar.jpg')

await supabase.storage
  .from('avatars')
  .copy('template/default.jpg', `${userId}/avatar.jpg`)

// 파일 목록
const { data: files } = await supabase.storage
  .from('avatars')
  .list(userId, {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' }
  })

// 버킷 목록
const { data: buckets } = await supabase.storage.listBuckets()
```

### 2.5 Realtime 구독

```typescript
// 채널 기반 API

// 1. Postgres 변경사항 구독
const channel = supabase
  .channel('posts-changes')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',        // INSERT, UPDATE, DELETE, * (모두)
      schema: 'public',
      table: 'posts',
      filter: `author_id=eq.${userId}`  // 필터 가능
    },
    (payload) => {
      console.log('새 포스트:', payload.new)
      // payload.old (이전 값), payload.new (새 값), payload.eventType
    }
  )
  .subscribe()

// 2. Broadcast (채널 메시지)
const channel = supabase
  .channel('game-room-1')
  .on(
    'broadcast',
    { event: 'cursor-move' },
    (payload) => {
      updateCursor(payload.x, payload.y)
    }
  )
  .subscribe()

// 메시지 전송
await channel.send({
  type: 'broadcast',
  event: 'cursor-move',
  payload: { x: 100, y: 200 }
})

// 3. Presence (온라인 사용자 추적)
const channel = supabase.channel('chat-room', {
  config: {
    presence: { key: userId }
  }
})

channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    console.log('현재 사용자들:', state)
  })
  .on('presence', { event: 'join' }, ({ key, newPresences }) => {
    console.log('참여:', key, newPresences)
  })
  .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    console.log('퇴장:', key, leftPresences)
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        user_id: userId,
        username: 'user123',
        online_at: new Date().toISOString(),
      })
    }
  })

// 구독 해제
await supabase.removeChannel(channel)
await supabase.removeAllChannels()
```

### 2.6 Edge Functions 호출

```typescript
// Edge Function 호출
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { name: 'World' },
  headers: {
    'x-custom-header': 'value'
  }
})

// 응답 타입 지정
const { data } = await supabase.functions.invoke<{ message: string }>(
  'hello-world',
  { body: { name: 'World' } }
)

// 파일 업로드를 포함한 호출
const formData = new FormData()
formData.append('file', file)
formData.append('userId', userId)

const { data } = await supabase.functions.invoke('process-upload', {
  body: formData,
})
```

---

## 3. Server-side SDK (@supabase/ssr)

### 3.1 개요

`@supabase/ssr`은 Next.js, SvelteKit, Remix 등 서버 사이드 렌더링 프레임워크에서 쿠키 기반 세션 관리를 위한 패키지다. 기존 `@supabase/auth-helpers-nextjs`를 대체한다.

```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 3.2 Next.js App Router 통합

#### 클라이언트 유틸리티 함수 설정

```typescript
// utils/supabase/client.ts
// 클라이언트 컴포넌트용

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// utils/supabase/server.ts
// 서버 컴포넌트, Server Actions, Route Handlers용

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서는 쿠키 쓰기 불가
            // Middleware에서 처리됨
          }
        },
      },
    }
  )
}
```

#### Middleware 설정 (세션 갱신)

```typescript
// middleware.ts

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
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 갱신 (만료된 토큰 자동 리프레시)
  const { data: { user } } = await supabase.auth.getUser()

  // 인증 필요 페이지 보호
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
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

#### Server Component에서 활용

```typescript
// app/dashboard/page.tsx

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 사용자 확인 (서버에서 JWT 검증)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // DB 조회 (RLS 자동 적용)
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*, profiles(username)')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1>대시보드 - {user.email}</h1>
      {posts?.map(post => (
        <div key={post.id}>{post.title}</div>
      ))}
    </div>
  )
}
```

#### Server Actions에서 활용

```typescript
// app/posts/actions.ts
'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const CreatePostSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
})

export async function createPost(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const validated = CreatePostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })

  if (!validated.success) {
    return { error: validated.error.flatten() }
  }

  const { error } = await supabase
    .from('posts')
    .insert({
      ...validated.data,
      author_id: user.id,
    })

  if (error) {
    return { error: { message: error.message } }
  }

  revalidatePath('/posts')
  redirect('/posts')
}
```

#### Route Handlers에서 활용

```typescript
// app/api/posts/route.ts

import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 10
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('published', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil((count || 0) / limit)
    }
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const { data, error } = await supabase
    .from('posts')
    .insert({ ...body, author_id: user.id })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

### 3.3 클라이언트 컴포넌트에서 활용

```typescript
// components/auth/LoginForm.tsx
'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogin(formData: FormData) {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.get('email') as string,
        password: formData.get('password') as string,
      })

      if (error) throw error

      router.push('/dashboard')
      router.refresh()  // 서버 캐시 갱신
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form action={handleLogin}>
      <input type="email" name="email" required />
      <input type="password" name="password" required />
      <button type="submit" disabled={loading}>
        {loading ? '로그인 중...' : '로그인'}
      </button>
    </form>
  )
}
```

---

## 4. PostgREST API 직접 사용

### 기본 엔드포인트

```
기본 URL: https://[project-ref].supabase.co/rest/v1/

헤더:
  apikey: [anon key 또는 service role key]
  Authorization: Bearer [JWT token]
  Content-Type: application/json
  Prefer: return=representation  (응답에 데이터 포함)
```

### REST 엔드포인트 패턴

```bash
# GET 전체 목록
GET /rest/v1/posts

# GET 필터
GET /rest/v1/posts?published=eq.true&author_id=eq.uuid

# GET 특정 컬럼
GET /rest/v1/posts?select=id,title,created_at

# GET 관계 데이터
GET /rest/v1/posts?select=id,title,profiles(username,avatar_url)

# GET 단일 행 (헤더 추가)
GET /rest/v1/posts?id=eq.1
헤더: Accept: application/vnd.pgrst.object+json

# POST 생성
POST /rest/v1/posts
Body: {"title": "새 포스트", "content": "내용"}
헤더: Prefer: return=representation

# PATCH 부분 수정
PATCH /rest/v1/posts?id=eq.1
Body: {"title": "수정된 제목"}

# DELETE 삭제
DELETE /rest/v1/posts?id=eq.1
```

### 필터 연산자 참조

```bash
# 비교 연산자
?field=eq.value        # 동등
?field=neq.value       # 부정
?field=gt.100          # 크다
?field=gte.100         # 크거나 같다
?field=lt.100          # 작다
?field=lte.100         # 작거나 같다

# 문자열
?field=like.*pattern*  # LIKE
?field=ilike.*pattern* # ILIKE (대소문자 무시)

# NULL
?field=is.null         # IS NULL
?field=not.is.null     # IS NOT NULL

# 배열
?field=in.(val1,val2)  # IN

# 복합 조건 (OR)
?or=(status.eq.active,status.eq.pending)

# 정렬
?order=created_at.desc

# 페이지네이션
?offset=0&limit=10

# 범위 조회 (헤더 방식)
헤더: Range: 0-9     (첫 10개)
```

### curl 예시

```bash
# 환경변수 설정
export SUPABASE_URL="https://xxxx.supabase.co"
export ANON_KEY="your-anon-key"
export USER_JWT="user-jwt-token"

# 전체 목록 조회
curl "$SUPABASE_URL/rest/v1/posts?select=*" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"

# 필터 + 관계 + 정렬
curl "$SUPABASE_URL/rest/v1/posts?published=eq.true&select=id,title,profiles(username)&order=created_at.desc&limit=10" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"

# 생성
curl -X POST "$SUPABASE_URL/rest/v1/posts" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"title": "새 포스트", "content": "내용"}'

# RPC 호출
curl -X POST "$SUPABASE_URL/rest/v1/rpc/get_user_stats" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "uuid-here"}'
```

---

## 5. GraphQL API (pg_graphql)

### 개요

Supabase는 `pg_graphql` PostgreSQL 확장을 통해 자동으로 GraphQL API를 생성한다. 별도 서버 없이 데이터베이스 스키마에서 GraphQL 스키마를 자동 생성한다.

### 엔드포인트

```
POST https://[project-ref].supabase.co/graphql/v1

헤더:
  apikey: [anon key]
  Authorization: Bearer [JWT token]
  Content-Type: application/json
```

### 기본 쿼리

```graphql
# 목록 조회
query GetPosts {
  postsCollection(
    first: 10
    orderBy: [{ createdAt: DescNullsLast }]
    filter: { published: { eq: true } }
  ) {
    edges {
      node {
        id
        title
        content
        createdAt
        profiles {
          username
          avatarUrl
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}

# 단일 항목 조회
query GetPost($id: BigInt!) {
  postsCollection(filter: { id: { eq: $id } }) {
    edges {
      node {
        id
        title
        content
        published
      }
    }
  }
}

# 생성 Mutation
mutation CreatePost($title: String!, $content: String!) {
  insertIntoPostsCollection(
    objects: [{ title: $title, content: $content, published: false }]
  ) {
    records {
      id
      title
      content
    }
    affectedCount
  }
}

# 수정 Mutation
mutation UpdatePost($id: BigInt!, $title: String!) {
  updatePostsCollection(
    set: { title: $title, updatedAt: "now()" }
    filter: { id: { eq: $id } }
  ) {
    records {
      id
      title
      updatedAt
    }
    affectedCount
  }
}

# 삭제 Mutation
mutation DeletePost($id: BigInt!) {
  deleteFromPostsCollection(filter: { id: { eq: $id } }) {
    records {
      id
    }
    affectedCount
  }
}
```

### 필터 타입

```graphql
# 문자열 필터
filter: {
  title: {
    eq: "exact match",
    neq: "not this",
    like: "%pattern%",
    ilike: "%case insensitive%",
    startsWith: "prefix",
    endsWith: "suffix",
    is: NULL
  }
}

# 숫자 필터
filter: {
  age: {
    eq: 25,
    gt: 18,
    gte: 18,
    lt: 100,
    lte: 100,
    in: [18, 21, 25]
  }
}

# 복합 필터
filter: {
  and: [
    { published: { eq: true } }
    { createdAt: { gte: "2024-01-01" } }
  ]
}

filter: {
  or: [
    { authorId: { eq: "uuid1" } }
    { authorId: { eq: "uuid2" } }
  ]
}
```

### JavaScript에서 GraphQL 사용

```typescript
// fetch로 직접 호출
async function querySupabaseGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/graphql/v1`,
    {
      method: 'POST',
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    }
  )

  const { data, errors } = await response.json()
  if (errors) throw new Error(errors[0].message)
  return data
}

// 사용 예
const { postsCollection } = await querySupabaseGraphQL<{
  postsCollection: {
    edges: Array<{ node: { id: number; title: string } }>
  }
}>(`
  query {
    postsCollection(first: 10) {
      edges {
        node {
          id
          title
        }
      }
    }
  }
`)
```

---

## 6. Management API

### 개요

Supabase Management API는 프로젝트, 조직, 데이터베이스 설정을 프로그래매틱하게 관리하는 REST API다.

```
기본 URL: https://api.supabase.com/v1/

인증:
  Authorization: Bearer [Personal Access Token]
  (supabase.com/account/tokens에서 생성)
```

### 주요 엔드포인트

```bash
export MGMT_TOKEN="your-personal-access-token"

# 프로젝트 목록
curl "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $MGMT_TOKEN"

# 프로젝트 생성
curl -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-new-project",
    "organization_id": "org-id",
    "plan": "free",
    "region": "ap-northeast-2",
    "db_pass": "secure_password"
  }'

# DB 마이그레이션 실행
curl -X POST "https://api.supabase.com/v1/projects/{ref}/database/migrations" \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT);"
  }'

# 시크릿 설정 (Edge Functions)
curl -X POST "https://api.supabase.com/v1/projects/{ref}/secrets" \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name": "MY_SECRET", "value": "secret_value"}]'

# 브랜치 목록 (Branching 기능)
curl "https://api.supabase.com/v1/projects/{ref}/branches" \
  -H "Authorization: Bearer $MGMT_TOKEN"

# Edge Function 배포
curl -X POST "https://api.supabase.com/v1/projects/{ref}/functions" \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-function",
    "name": "My Function",
    "verify_jwt": true,
    "body": "base64-encoded-function-code"
  }'
```

---

## 7. 타입 안전성 (TypeScript)

### 타입 생성 및 활용

```typescript
// 자동 생성된 Database 타입 구조 활용

// Row 타입 (SELECT 결과)
type Post = Database['public']['Tables']['posts']['Row']

// Insert 타입 (INSERT 입력)
type PostInsert = Database['public']['Tables']['posts']['Insert']

// Update 타입 (UPDATE 입력)
type PostUpdate = Database['public']['Tables']['posts']['Update']

// Enum 타입
type UserRole = Database['public']['Enums']['user_role']

// RPC 함수 인자/반환 타입
type GetUserStatsArgs = Database['public']['Functions']['get_user_stats']['Args']
type GetUserStatsReturns = Database['public']['Functions']['get_user_stats']['Returns']
```

### Helper 타입 유틸리티

```typescript
// utils/supabase-types.ts

import type { Database } from '@/types/supabase'

// 테이블 Row 타입
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

// 테이블 Insert 타입
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

// 테이블 Update 타입
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// Enum 타입
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

// 사용 예
type Post = Tables<'posts'>
type PostInsert = TablesInsert<'posts'>
type UserRole = Enums<'user_role'>
```

### 관계 데이터 타입 처리

```typescript
// 관계가 포함된 쿼리의 타입 처리

// Supabase가 자동으로 타입을 추론함
const { data: postsWithAuthor } = await supabase
  .from('posts')
  .select(`
    id,
    title,
    profiles (
      username,
      avatar_url
    )
  `)

// postsWithAuthor의 타입:
// Array<{
//   id: number
//   title: string
//   profiles: {
//     username: string | null
//     avatar_url: string | null
//   } | null
// }> | null

// 배열 관계 타입 (1:N)
const { data: usersWithPosts } = await supabase
  .from('profiles')
  .select(`
    id,
    username,
    posts (
      id,
      title
    )
  `)
// posts는 배열로 반환됨

// 타입 유틸리티로 관계 타입 추출
import { PostgrestBuilder } from '@supabase/postgrest-js'

// 쿼리 결과 타입 추출 (v2.x)
type PostWithAuthor = Awaited<ReturnType<typeof getPostWithAuthor>>['data']

async function getPostWithAuthor(id: number) {
  return supabase
    .from('posts')
    .select(`
      id, title, content,
      profiles (username, avatar_url)
    `)
    .eq('id', id)
    .single()
}
```

### Zod를 활용한 런타임 검증

```typescript
import { z } from 'zod'
import type { TablesInsert } from '@/utils/supabase-types'

// Zod 스키마 정의 (DB Insert 타입과 호환되도록)
const PostCreateSchema = z.object({
  title: z.string().min(1, '제목을 입력하세요').max(255),
  content: z.string().min(10, '내용은 10자 이상이어야 합니다'),
  published: z.boolean().default(false),
  tags: z.array(z.string()).max(10).default([]),
}) satisfies z.ZodType<Partial<TablesInsert<'posts'>>>

type PostCreateInput = z.infer<typeof PostCreateSchema>

// Server Action에서 사용
export async function createPost(formData: FormData) {
  const parsed = PostCreateSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published') === 'true',
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('posts')
    .insert({ ...parsed.data, author_id: user!.id })
    .select()
    .single()

  return { data, error }
}
```

### 타입 안전한 Realtime

```typescript
// Realtime 페이로드 타입 처리

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { Tables } from '@/utils/supabase-types'

type Post = Tables<'posts'>

const channel = supabase
  .channel('posts')
  .on<Post>(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'posts' },
    (payload: RealtimePostgresChangesPayload<Post>) => {
      if (payload.eventType === 'INSERT') {
        // payload.new는 Post 타입
        addPost(payload.new)
      } else if (payload.eventType === 'UPDATE') {
        // payload.old와 payload.new 모두 Post 타입
        updatePost(payload.new)
      } else if (payload.eventType === 'DELETE') {
        // payload.old는 Post 타입
        removePost(payload.old.id)
      }
    }
  )
  .subscribe()
```

---

## 참고 자료

- [JavaScript SDK 공식 문서](https://supabase.com/docs/reference/javascript)
- [supabase-js GitHub](https://github.com/supabase/supabase-js)
- [@supabase/ssr 문서](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Next.js + Supabase 설정 가이드](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Client Libraries 개요](https://supabase.com/docs/guides/api/rest/client-libs)
- [GraphQL API 문서](https://supabase.com/docs/guides/graphql)
- [pg_graphql 공식 문서](https://supabase.github.io/pg_graphql/)
- [Management API 문서](https://supabase.com/docs/reference/management-api)
- [PostgREST 필터 레퍼런스](https://supabase.com/docs/reference/javascript/filter)
