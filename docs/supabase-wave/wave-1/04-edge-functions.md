# Supabase Edge Functions 심층 분석

> Wave 1 리서치 문서 | 작성일: 2026-04-06
> 참고: 공식 Supabase 문서 + GitHub 저장소 기준 (Deno 2.x 기준, 최신 상태)

---

## 목차

1. [개요](#1-개요)
2. [Deno Runtime 환경 및 제약](#2-deno-runtime-환경-및-제약)
3. [로컬 개발 및 디버깅](#3-로컬-개발-및-디버깅)
4. [환경변수 및 시크릿 관리](#4-환경변수-및-시크릿-관리)
5. [Database / Auth / Storage 연동](#5-database--auth--storage-연동)
6. [Webhook 처리](#6-webhook-처리)
7. [스케줄링 (pg_cron 연동)](#7-스케줄링-pgcron-연동)
8. [CORS 처리](#8-cors-처리)
9. [npm 패키지 호환성](#9-npm-패키지-호환성)
10. [내부 아키텍처 상세](#10-내부-아키텍처-상세)
11. [제한사항 및 플랜별 차이](#11-제한사항-및-플랜별-차이)
12. [보안 가이드](#12-보안-가이드)
13. [운영 — 배포, 버전 관리, 로깅, 에러 처리](#13-운영--배포-버전-관리-로깅-에러-처리)
14. [Vercel / Cloudflare Workers와 비교](#14-vercel--cloudflare-workers와-비교)

---

## 1. 개요

### 1.1 Supabase Edge Functions란?

Supabase Edge Functions는 **Deno 기반의 서버리스 함수**로, 전 세계 엣지 노드에 배포되어
사용자와 가까운 위치에서 TypeScript 코드를 실행한다. Supabase 백엔드 서비스(Database,
Auth, Storage, Realtime)와 긴밀하게 통합되어 있어 별도 서버 없이 풀스택 기능을 구현할 수 있다.

**핵심 특성:**
- TypeScript / JavaScript 기본 지원 (트랜스파일 불필요)
- WebAssembly(WASM) 지원
- 전 세계 엣지 네트워크에 자동 배포
- 각 요청마다 독립된 V8 Isolate에서 실행
- 콜드 스타트: 수 밀리초 수준 (ESZip 번들 포맷 덕분)

### 1.2 주요 사용 사례

| 사용 사례 | 설명 |
|----------|------|
| 인증된 HTTP 엔드포인트 | JWT 검증 + RLS 기반 데이터 접근 |
| Webhook 수신 | Stripe, GitHub, Slack 이벤트 처리 |
| AI 인퍼런스 오케스트레이션 | OpenAI, Anthropic API 프록시 |
| 이메일 발송 | Resend, SendGrid 연동 |
| 이미지 동적 생성 | OG 이미지, 썸네일 온-더-플라이 생성 |
| 메시징 봇 | Telegram, Discord 봇 핸들러 |
| 스케줄 작업 | pg_cron + pg_net으로 주기적 실행 |
| 커스텀 인증 플로우 | 소셜 로그인 확장, MFA 커스터마이징 |

### 1.3 기본 함수 구조

```typescript
// supabase/functions/hello-world/index.ts

Deno.serve(async (req: Request) => {
  // 모든 요청은 표준 Web API의 Request 객체
  const { name } = await req.json()

  const data = {
    message: `안녕하세요, ${name}!`,
    timestamp: new Date().toISOString(),
  }

  return new Response(
    JSON.stringify(data),
    {
      headers: {
        'Content-Type': 'application/json',
        // CORS 헤더는 별도로 추가 (8장 참고)
      },
    }
  )
})
```

---

## 2. Deno Runtime 환경 및 제약

### 2.1 Deno 2.x 런타임

2025년부터 모든 Edge Function 리전에서 **Deno 2.x** (현재 2.1.4)가 실행된다.

**Deno의 주요 특징:**
- TypeScript 네이티브 지원 (빌드 단계 불필요)
- 표준 Web API (fetch, Request, Response, URL, crypto 등) 내장
- Node.js 호환 레이어 (node: 접두사로 Node 내장 모듈 사용)
- npm 패키지 직접 임포트 (`npm:` 접두사)
- JSR (JavaScript Registry) 지원

### 2.2 사용 가능한 API

```typescript
// 표준 Web API (모두 사용 가능)
const response = await fetch('https://api.example.com/data')
const hash = await crypto.subtle.digest('SHA-256', data)
const timer = setTimeout(() => {}, 1000)
const url = new URL('https://example.com/path?query=value')
const encoder = new TextEncoder()

// Deno 전용 API
const envVar = Deno.env.get('MY_SECRET')
const fileContent = await Deno.readTextFile('/tmp/file.txt')  // 제한적
Deno.serve(handler)  // 메인 서버 진입점

// Node.js 호환 API (node: 접두사 필수)
import process from 'node:process'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import path from 'node:path'
```

### 2.3 미지원 기능 및 제약

```typescript
// ❌ 미지원 API
// - Web Worker API (멀티스레딩 불가)
// - Node.js vm 모듈
// - 파일 시스템 영구 쓰기 (각 실행은 Stateless)
// - 멀티스레딩 라이브러리
// - 아웃바운드 포트 25, 587 차단 (직접 SMTP 불가)

// ⚠️ 로컬 파일은 /tmp 에만 임시 쓰기 가능
// 단, 함수 실행 종료 후 초기화됨 — 영구 저장은 Storage 사용

// ⚠️ 외부 HTTP 연결
// - 대부분의 아웃바운드 연결 허용
// - 포트 25, 587 차단 (SendGrid, Resend 등 HTTPS API 사용 권장)

// ✅ PostgreSQL 직접 연결
import { createClient } from 'npm:@supabase/supabase-js@2'
// Supabase SDK를 통한 DB 접근은 완전 지원
```

### 2.4 함수 디렉토리 구조

```
supabase/
├── functions/
│   ├── _shared/              ← 공유 유틸리티 (함수명 앞 _는 배포 제외)
│   │   ├── cors.ts
│   │   ├── supabase-client.ts
│   │   └── helpers.ts
│   ├── hello-world/
│   │   ├── index.ts          ← 함수 진입점
│   │   └── deno.json         ← 의존성 및 설정 (함수별)
│   ├── send-email/
│   │   ├── index.ts
│   │   └── deno.json
│   └── process-payment/
│       ├── index.ts
│       └── deno.json
├── .env                      ← 로컬 개발용 환경변수
└── config.toml               ← Supabase 프로젝트 설정
```

> **규칙**: `_` 로 시작하는 폴더(예: `_shared`)는 독립 함수로 배포되지 않는다.
> 공유 유틸리티를 이 폴더에 배치하면 다른 함수에서 상대 경로로 임포트 가능.

---

## 3. 로컬 개발 및 디버깅

### 3.1 Supabase CLI 설치 및 초기화

```bash
# CLI 설치 (npm 방식)
npm install -g supabase

# 또는 scoop (Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 프로젝트 초기화 (기존 Supabase 프로젝트 연결)
supabase init
supabase link --project-ref [your-project-ref]
```

### 3.2 로컬 실행

```bash
# 전체 Supabase 스택 로컬 시작 (Docker 필요)
supabase start

# 특정 함수만 서빙
supabase functions serve hello-world

# 환경 변수 파일 지정
supabase functions serve hello-world --env-file .env.local

# 모든 함수 동시 서빙
supabase functions serve

# 로컬 함수 URL: http://localhost:54321/functions/v1/[function-name]
```

### 3.3 로컬 테스트 (curl)

```bash
# 기본 POST 요청
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/hello-world' \
  --header 'Authorization: Bearer [SUPABASE_ANON_KEY]' \
  --header 'Content-Type: application/json' \
  --data '{"name":"테스터"}'

# 인증 토큰 포함
curl -i --location \
  'http://localhost:54321/functions/v1/protected-endpoint' \
  --header "Authorization: Bearer ${USER_ACCESS_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"query":"test"}'
```

### 3.4 디버깅

```typescript
// 1. console.log 활용 (로컬 및 대시보드 로그에 표시)
Deno.serve(async (req) => {
  console.log('요청 수신:', req.method, req.url)
  console.log('헤더:', Object.fromEntries(req.headers.entries()))

  try {
    const body = await req.json()
    console.log('요청 바디:', body)
    // ... 처리 로직
  } catch (error) {
    console.error('처리 실패:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// 2. 로컬 개발 시 Supabase URL 오버라이드
// Docker 내부에서 localhost는 실제 호스트 접근 불가
// 대신 host.docker.internal 또는 Supabase가 제공하는 내부 URL 사용
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'http://localhost:54321'
```

### 3.5 Deno 개발 환경 설정 (VS Code)

```json
// .vscode/settings.json
{
  "deno.enable": true,
  "deno.importMap": "./supabase/functions/import_map.json",
  "editor.defaultFormatter": "denoland.vscode-deno",
  "[typescript]": {
    "editor.defaultFormatter": "denoland.vscode-deno"
  }
}
```

```json
// supabase/functions/deno.json (전역 설정, 함수별 deno.json 우선)
{
  "compilerOptions": {
    "lib": ["deno.window"]
  },
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2"
  }
}
```

---

## 4. 환경변수 및 시크릿 관리

### 4.1 자동 제공되는 기본 시크릿

Edge Functions 실행 시 자동으로 주입되는 환경변수:

| 변수명 | 설명 | 보안 등급 |
|--------|------|-----------|
| `SUPABASE_URL` | 프로젝트 API Gateway URL | 공개 가능 |
| `SUPABASE_ANON_KEY` | 익명 키 (RLS 적용) | 공개 가능 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 역할 키 (RLS 우회) | 서버 전용 |
| `SUPABASE_DB_URL` | PostgreSQL 직접 연결 URL | 서버 전용 |
| `SB_REGION` | 함수 실행 리전 | 공개 가능 |
| `SB_EXECUTION_ID` | 함수 인스턴스 UUID | 공개 가능 |
| `DENO_DEPLOYMENT_ID` | 함수 코드 버전 식별자 | 공개 가능 |

### 4.2 시크릿 설정 방법

```bash
# 방법 1: CLI — 개별 설정
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxxx
supabase secrets set SENDGRID_API_KEY=SG.xxxxxx
supabase secrets set OPENAI_API_KEY=sk-proj-xxxxxx

# 방법 2: CLI — .env 파일 일괄 적용
supabase secrets set --env-file .env.production

# 목록 조회 (값은 마스킹됨)
supabase secrets list

# 삭제
supabase secrets unset STRIPE_SECRET_KEY

# 주의: 시크릿 이름 규칙
# - SUPABASE_ 접두사 사용 불가 (예약됨)
# - 최대 256자
# - 최대 크기: 48 KiB
# - 프로젝트당 최대 100개
```

### 4.3 로컬 개발용 환경변수

```bash
# supabase/functions/.env (로컬 전용, .gitignore 필수)
STRIPE_SECRET_KEY=sk_test_xxxxxx
OPENAI_API_KEY=sk-test-xxxxxx
CUSTOM_API_URL=https://api.example.com
```

### 4.4 함수에서 환경변수 사용

```typescript
// supabase/functions/process-payment/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@14'

Deno.serve(async (req) => {
  // 기본 제공 시크릿
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 사용자 정의 시크릿
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) {
    return new Response('서버 설정 오류', { status: 500 })
  }

  // RLS를 적용하는 클라이언트 (사용자 인증 토큰 기반)
  const authHeader = req.headers.get('Authorization')!
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  })

  // RLS를 우회하는 관리자 클라이언트 (서버 사이드에서만)
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' })

  // ... 결제 처리 로직
})
```

---

## 5. Database / Auth / Storage 연동

### 5.1 데이터베이스 연동 (RLS 적용)

```typescript
// 사용자 컨텍스트로 DB 쿼리 (RLS 정책 적용)
Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')

  // auth 컨텍스트를 SDK에 전달 → RLS 자동 적용
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader! } } }
  )

  // 현재 사용자 정보 조회
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: '인증 필요' }), { status: 401 })
  }

  // RLS 정책이 적용된 쿼리 (user_id = auth.uid() 조건 자동 적용)
  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, title, content, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw error

  return new Response(JSON.stringify(posts), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### 5.2 관리자 권한 DB 작업

```typescript
// Service Role Key로 RLS 우회 (관리 작업)
Deno.serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // RLS 우회
  )

  // 모든 사용자 데이터 집계 (관리자 전용)
  const { data: stats } = await supabaseAdmin
    .from('orders')
    .select('status, amount')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())

  // 사용자 계정 강제 비활성화
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: 'none'  // 또는 '24h', '168h' 등
  })
})
```

### 5.3 Auth 연동

```typescript
// JWT Claims 검증
Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '인증 토큰 없음' }), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')

  // 방법 1: getUser() — 항상 서버 검증 (보안 강함)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return new Response(JSON.stringify({ error: '유효하지 않은 토큰' }), { status: 401 })
  }

  // 방법 2: getClaims() — JWT Claims 직접 파싱
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token)
  const userEmail = claims?.claims?.email
  const userRole = claims?.claims?.user_metadata?.role

  // 커스텀 Claims 확인 (예: Supabase Auth Hook으로 주입된 Claims)
  const orgId = claims?.claims?.app_metadata?.organization_id
})
```

### 5.4 Storage 연동

```typescript
// Edge Function에서 Storage 파일 처리
Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 파일 다운로드 및 처리
  const { data: fileBlob, error } = await supabase.storage
    .from('uploads')
    .download('processing/input.csv')

  if (error) throw error

  // CSV 파싱 처리
  const csvText = await fileBlob.text()
  const rows = csvText.split('\n').map(row => row.split(','))

  // 처리 결과를 Storage에 저장
  const processedData = JSON.stringify(rows)
  await supabase.storage
    .from('processed')
    .upload(`results/${Date.now()}.json`, processedData, {
      contentType: 'application/json',
    })
})
```

---

## 6. Webhook 처리

### 6.1 기본 Webhook 수신

```typescript
// supabase/functions/stripe-webhook/index.ts
import Stripe from 'npm:stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

Deno.serve(async (req) => {
  // Stripe webhook은 POST만 허용
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('서명 누락', { status: 400 })
  }

  // Stripe 서명 검증 (위조 방지)
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook 서명 검증 실패:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  // 이벤트 타입별 처리
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      await supabase
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('stripe_payment_intent_id', paymentIntent.id)
      break
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('stripe_subscription_id', subscription.id)
      break
    }
    default:
      console.log(`미처리 이벤트 타입: ${event.type}`)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### 6.2 Webhook 함수 JWT 검증 비활성화

Stripe, GitHub 등의 Webhook은 Supabase JWT를 포함하지 않으므로 JWT 검증을 비활성화:

```toml
# supabase/config.toml
[functions.stripe-webhook]
verify_jwt = false  # Webhook 함수는 JWT 검증 불필요
                    # 대신 제공자별 서명 검증 코드로 보안 유지
```

### 6.3 GitHub Webhook

```typescript
// supabase/functions/github-webhook/index.ts
import { createHmac } from 'node:crypto'

const GITHUB_SECRET = Deno.env.get('GITHUB_WEBHOOK_SECRET')!

function verifyGitHubSignature(payload: string, signature: string): boolean {
  const hmac = createHmac('sha256', GITHUB_SECRET)
  hmac.update(payload)
  const digest = `sha256=${hmac.digest('hex')}`
  // 타이밍 공격 방지를 위한 상수 시간 비교
  return digest.length === signature.length &&
    digest.split('').every((char, i) => char === signature[i])
}

Deno.serve(async (req) => {
  const body = await req.text()
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  const event = req.headers.get('x-github-event') ?? ''

  if (!verifyGitHubSignature(body, signature)) {
    return new Response('서명 검증 실패', { status: 401 })
  }

  const payload = JSON.parse(body)

  if (event === 'push') {
    console.log(`레포지토리 ${payload.repository.name}에 푸시 발생:`, payload.ref)
    // 배포 트리거 등 작업 수행
  }

  return new Response('OK', { status: 200 })
})
```

---

## 7. 스케줄링 (pg_cron 연동)

### 7.1 개요

Supabase Edge Functions를 주기적으로 실행하려면 **pg_cron** + **pg_net** 확장을 조합한다:
- `pg_cron`: PostgreSQL 내장 크론 스케줄러
- `pg_net`: PostgreSQL에서 HTTP 요청을 보내는 확장

### 7.2 설정 단계

```sql
-- 1단계: pg_cron, pg_net 확장 활성화 (대시보드 또는 SQL)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2단계: 함수 URL과 인증 키를 Vault에 안전하게 저장
SELECT vault.create_secret(
  'https://[project-ref].supabase.co',
  'project_url'
);
SELECT vault.create_secret(
  '[SUPABASE_ANON_KEY]',
  'anon_key'
);
```

### 7.3 스케줄 등록 예제

```sql
-- 매 분마다 실행 (cron 표현식)
SELECT cron.schedule(
  'sync-user-stats-every-minute',   -- 잡 이름
  '* * * * *',                       -- 매 분
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/sync-user-stats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'anon_key'
      )
    ),
    body := jsonb_build_object('triggered_at', now()::text)
  ) AS request_id;
  $$
);

-- 매일 새벽 3시 (UTC) 실행
SELECT cron.schedule(
  'daily-cleanup-job',
  '0 3 * * *',   -- 매일 03:00 UTC
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/cleanup-expired-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 매주 월요일 오전 9시 실행
SELECT cron.schedule(
  'weekly-report',
  '0 9 * * 1',  -- 매주 월요일 09:00 UTC
  $$SELECT net.http_post(...);$$
);

-- 스케줄 목록 확인
SELECT * FROM cron.job;

-- 스케줄 삭제
SELECT cron.unschedule('daily-cleanup-job');
```

### 7.4 Supabase Cron 모듈 (신규)

2024년 말 Supabase는 별도 **Supabase Cron** 모듈을 발표했다. 대시보드 UI에서 크론 잡을
직접 생성·관리·모니터링할 수 있다.

```sql
-- Supabase Cron 모듈로 Edge Function 트리거
SELECT supabase_functions.http_request(
  'POST',
  '/functions/v1/my-scheduled-function',
  jsonb_build_object('Content-Type', 'application/json'),
  '{"scheduled": true}'::jsonb,
  5000  -- 타임아웃 (ms)
);
```

**운영 권장 사항:**
- 동시 실행 잡: **8개 이하**
- 각 잡 최대 실행 시간: **10분 이하**
- 긴 작업은 pgmq(메시지 큐)와 조합하여 청크로 분할 처리

---

## 8. CORS 처리

### 8.1 왜 CORS를 수동으로 처리해야 하는가?

Supabase의 REST API나 Auth API와 달리, Edge Functions는 완전히 커스터마이징 가능한
서버 함수이기 때문에 CORS 헤더를 개발자가 직접 추가해야 한다.

### 8.2 권장 패턴 (SDK v2.95.0+)

```typescript
// SDK v2.95.0 이상: corsHeaders를 SDK에서 직접 임포트
// → SDK 업데이트 시 자동으로 새 헤더 반영
import { corsHeaders } from '@supabase/supabase-js/cors'

Deno.serve(async (req) => {
  // CORS Preflight 요청 처리 (반드시 최상단에 위치)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const data = { message: 'Hello!' }
    return new Response(
      JSON.stringify(data),
      {
        headers: {
          ...corsHeaders,                          // CORS 헤더 포함
          'Content-Type': 'application/json',
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,                          // 에러 응답에도 CORS 헤더 필수
          'Content-Type': 'application/json',
        }
      }
    )
  }
})
```

### 8.3 레거시 패턴 (직접 정의)

```typescript
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}
```

### 8.4 특정 도메인만 허용 (Production 보안 강화)

```typescript
const ALLOWED_ORIGINS = [
  'https://your-app.com',
  'https://www.your-app.com',
  'http://localhost:3000',  // 로컬 개발
]

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ... 처리 로직
})
```

---

## 9. npm 패키지 호환성

### 9.1 지원되는 패키지 유형

Deno 2.x는 다음 패키지 소스를 지원한다:

```typescript
// 1. npm 패키지 (npm: 접두사)
import Stripe from 'npm:stripe@14'
import { Resend } from 'npm:resend@3'
import OpenAI from 'npm:openai@4'
import { z } from 'npm:zod@3'

// 2. JSR (JavaScript Registry) — 타입 안전
import { assertEquals } from 'jsr:@std/assert'
import { join } from 'jsr:@std/path'

// 3. Node.js 내장 모듈 (node: 접두사)
import { createHash } from 'node:crypto'
import process from 'node:process'
import { Buffer } from 'node:buffer'

// 4. Deno 표준 라이브러리
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

// 5. Supabase 공식 SDK
import { createClient } from 'npm:@supabase/supabase-js@2'
```

### 9.2 의존성 관리 (deno.json)

```json
// supabase/functions/my-function/deno.json (함수별 독립 설정 권장)
{
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2.39.0",
    "stripe": "npm:stripe@14.14.0",
    "resend": "npm:resend@3.2.0",
    "openai": "npm:openai@4.28.4",
    "zod": "npm:zod@3.22.4"
  },
  "compilerOptions": {
    "lib": ["deno.window"],
    "strict": true
  }
}
```

**함수별 독립 deno.json 사용 이유:**
- 한 함수의 의존성 업데이트가 다른 함수를 깨뜨리지 않음
- 각 함수의 번들 크기 최소화
- 명확한 버전 고정으로 예측 가능한 동작

### 9.3 비공개 npm 패키지

```bash
# 함수 디렉토리에 .npmrc 파일 생성
# supabase/functions/my-function/.npmrc
@my-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}

# 배포 시 .npmrc 파일 포함 + NPM_TOKEN을 시크릿으로 설정
supabase secrets set NPM_TOKEN=ghp_xxxxx
supabase functions deploy my-function
```

### 9.4 호환성 제한

일부 npm 패키지는 Deno 환경에서 완전히 동작하지 않을 수 있다:

```typescript
// ❌ 작동 안 되는 경우
// - Node.js 전용 API에 강하게 의존하는 패키지
// - native addon(N-API) 사용 패키지
// - Web Worker, SharedArrayBuffer 의존 패키지
// - 멀티스레딩 라이브러리 (worker_threads 기반)

// ✅ 대부분의 순수 JS/TS 라이브러리 정상 동작
// - Stripe, OpenAI, Resend, Zod 등 주요 라이브러리 공식 지원
// - @supabase/* 패키지 완전 지원
```

---

## 10. 내부 아키텍처 상세

### 10.1 V8 Isolate 기반 실행 모델

각 Edge Function 호출은 독립된 **V8 Isolate** 에서 실행된다:

```
HTTP 요청 도착
      │
      ▼
┌──────────────────────────────────┐
│        Global API Gateway         │
│  (요청자 IP → 가장 가까운 엣지)   │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│     Supabase Edge Runtime         │  ← GitHub: supabase/edge-runtime
│                                   │     (Deno 기반 웹 서버)
│  ┌────────────────────────────┐  │
│  │       Main Runtime          │  │  ← 요청 프록시 + 인증 사전 처리
│  │  (Gateway/Auth 레이어)      │  │
│  └───────────┬────────────────┘  │
│              │ 검증 통과          │
│              ▼                   │
│  ┌────────────────────────────┐  │
│  │       User Runtime          │  │  ← 실제 사용자 코드 실행
│  │  ┌──────────────────────┐  │  │
│  │  │    V8 Isolate          │  │  │  ← 격리된 실행 환경
│  │  │  (함수 코드 + ESZip)   │  │  │  - 독립적 메모리
│  │  │                        │  │  │  - 함수간 격리
│  │  └──────────────────────┘  │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### 10.2 ESZip 번들 포맷

```
배포 과정:
1. supabase functions deploy 실행
2. CLI → 함수 코드 + 모든 의존성 번들링
3. ESZip 파일 생성 (완전한 모듈 그래프 포함)
4. ESZip → 모든 엣지 노드에 자동 배포
5. 요청 시 ESZip에서 빠른 로딩 (콜드 스타트 최소화)
```

**ESZip의 장점:**
- 완전한 모듈 그래프를 하나의 파일로 압축
- 런타임에 npm 다운로드 불필요 → 콜드 스타트 단축
- 결정적 실행 (동일 번들 = 동일 동작)

### 10.3 콜드 스타트 vs 웜 스타트

| 구분 | 소요 시간 | 발생 조건 |
|------|----------|-----------|
| 콜드 스타트 | 수십~200ms | 첫 요청, 오랫동안 비활성 후 |
| 웜 스타트 | 수 ms | Isolate가 아직 활성 상태 |

**콜드 스타트 최소화 전략:**
```typescript
// 1. 무거운 초기화를 함수 최상위에 배치
// (Isolate 재사용 시 재실행 안 됨)
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)  // 상단 선언
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

// 2. 관련 기능은 하나의 큰 함수로 통합
// (함수 수 감소 → 콜드 스타트 확률 감소)
Deno.serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname

  // 내부 라우팅
  if (path === '/process') return handleProcess(req)
  if (path === '/status') return handleStatus(req)
  if (path === '/cancel') return handleCancel(req)

  return new Response('Not Found', { status: 404 })
})
```

### 10.4 글로벌 리전 배치

```
클라이언트 (서울)
      │
      ▼  IP 기반 라우팅
┌─────────────────┐
│  Global API GW   │
│  (IP 분석)       │
└────────┬────────┘
         │ 가장 가까운 엣지로 라우팅
         ▼
┌─────────────────┐
│  ap-northeast-1  │  ← 도쿄 / 서울 엣지 노드
│  (최근접 리전)   │
└─────────────────┘
```

지원 리전: 미국(동/서부), 유럽, 아시아 태평양, 남미 등 주요 리전

---

## 11. 제한사항 및 플랜별 차이

### 11.1 실행 제한

| 제한 항목 | 값 | 비고 |
|-----------|-----|------|
| 최대 메모리 | 256 MB | 함수당 |
| CPU 시간 제한 | 2초 / 요청 | I/O 대기 시간 제외 |
| Wall Clock (Free) | 150초 | 504 Gateway Timeout 후 종료 |
| Wall Clock (Paid) | 400초 | Pro Plan 이상 |
| 번들 크기 | 20 MB | CLI 번들링 후 기준 |
| 요청 Hard Limit | 30초 | 빠른 단기 작업에 적합 |

### 11.2 함수 수 제한

| 플랜 | 프로젝트당 함수 수 |
|------|------------------|
| Free | 100 |
| Pro | 500 |
| Team | 1,000 |
| Enterprise | 무제한 |

### 11.3 시크릿 제한

| 항목 | 제한 |
|------|------|
| 프로젝트당 시크릿 수 | 100개 |
| 시크릿 이름 최대 길이 | 256자 |
| 시크릿 최대 크기 | 48 KiB |
| 금지 접두사 | `SUPABASE_` |

### 11.4 로그 제한

| 항목 | 제한 |
|------|------|
| 메시지 최대 길이 | 10,000자 |
| 최대 이벤트 속도 | 100건 / 10초 |

### 11.5 네트워크 제한

| 항목 | 제한 |
|------|------|
| 아웃바운드 포트 25 | 차단 |
| 아웃바운드 포트 587 | 차단 |
| 재귀 호출 | ~5,000 req/min |
| 인바운드 요청 페이로드 | 사실상 제한 없음 (메모리 내) |

### 11.6 미지원 기능

- Web Worker API
- Node.js `vm` 모듈
- 멀티스레딩 (SharedArrayBuffer, Atomics 미지원)
- 영구 파일 시스템 쓰기

---

## 12. 보안 가이드

### 12.1 JWT 인증 검증

```typescript
// 권장 패턴: 함수 내에서 직접 검증
Deno.serve(async (req) => {
  // Authorization 헤더 추출
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: '인증 헤더 없음' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const token = authHeader.substring(7)

  // Supabase Auth로 토큰 서버 검증 (비대칭 키 서명 검증)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: '유효하지 않은 토큰' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 이후 로직에서 user 사용
  console.log('인증된 사용자:', user.id, user.email)
})
```

### 12.2 입력 검증 (Zod)

```typescript
import { z } from 'npm:zod@3'

const RequestSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  currency: z.enum(['KRW', 'USD', 'EUR']),
  description: z.string().max(500).optional(),
})

Deno.serve(async (req) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: '잘못된 JSON' }), { status: 400 })
  }

  // Zod 스키마 검증
  const result = RequestSchema.safeParse(body)
  if (!result.success) {
    return new Response(
      JSON.stringify({ error: '입력 검증 실패', details: result.error.issues }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { userId, amount, currency } = result.data
  // 검증된 데이터 사용
})
```

### 12.3 서비스 역할 키 보안

```typescript
// ✅ 올바른 패턴: 서비스 역할 키는 서버 사이드에서만
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ❌ 절대 금지: 클라이언트 응답에 서비스 역할 키 포함
// return new Response(JSON.stringify({
//   serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  // 절대 금지!
// }))

// ✅ RLS 적용 클라이언트는 사용자 토큰으로 생성
const supabaseUser = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authHeader! } } }
)
```

### 12.4 Rate Limiting

```typescript
// 함수 내 자체 Rate Limiting (간단한 예시)
// 본격적인 Rate Limiting은 Upstash Redis 또는 DB 기반 구현 권장

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(identifier: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}

Deno.serve(async (req) => {
  const clientIp = req.headers.get('x-forwarded-for') ?? 'unknown'

  if (!checkRateLimit(clientIp, 100, 60_000)) {  // 분당 100회 제한
    return new Response(
      JSON.stringify({ error: '요청 한도 초과' }),
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }
  // ... 처리 로직
})
```

---

## 13. 운영 — 배포, 버전 관리, 로깅, 에러 처리

### 13.1 배포

```bash
# 단일 함수 배포
supabase functions deploy hello-world

# 모든 함수 일괄 배포
supabase functions deploy

# JWT 검증 비활성화 함수 배포 (Webhook 등)
supabase functions deploy stripe-webhook --no-verify-jwt

# 함수 목록 확인
supabase functions list

# 함수 삭제
supabase functions delete old-function

# 함수 로그 실시간 확인
supabase functions log --function hello-world --tail
```

### 13.2 config.toml 함수 설정

```toml
# supabase/config.toml

[functions.hello-world]
verify_jwt = true       # 기본값: JWT 검증 활성화
enabled = true

[functions.stripe-webhook]
verify_jwt = false      # Webhook: JWT 검증 비활성화

[functions.scheduled-task]
verify_jwt = false      # pg_cron으로 호출: 내부 인증만 사용
```

### 13.3 버전 관리 전략

```typescript
// 함수 내 버전 헤더 반환 (디버깅용)
Deno.serve(async (req) => {
  const version = Deno.env.get('DENO_DEPLOYMENT_ID') ?? 'local'

  // ... 처리 로직

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'X-Function-Version': version,
    }
  })
})
```

**Git 태그 기반 배포 예시 (CI/CD):**
```yaml
# .github/workflows/deploy.yml
name: Deploy Edge Functions

on:
  push:
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### 13.4 구조화된 로깅

```typescript
// 로그 레벨별 구조화 출력
function log(level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    executionId: Deno.env.get('SB_EXECUTION_ID'),
    region: Deno.env.get('SB_REGION'),
    ...(data ? { data } : {}),
  }
  // 10,000자 제한에 주의
  const logStr = JSON.stringify(entry).substring(0, 9000)

  if (level === 'error') {
    console.error(logStr)
  } else if (level === 'warn') {
    console.warn(logStr)
  } else {
    console.log(logStr)
  }
}

Deno.serve(async (req) => {
  const start = Date.now()
  log('info', '요청 시작', { method: req.method, url: req.url })

  try {
    const result = await processRequest(req)
    log('info', '요청 완료', { duration: Date.now() - start })
    return result
  } catch (error) {
    log('error', '처리 실패', {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - start,
    })
    throw error
  }
})
```

### 13.5 에러 처리 패턴

```typescript
// 포괄적인 에러 처리 래퍼
async function withErrorHandling(
  req: Request,
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  try {
    return await handler(req)
  } catch (error) {
    console.error('처리되지 않은 에러:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    })

    // 에러 타입별 상태 코드 매핑
    const statusCode = (() => {
      if (error.name === 'ValidationError') return 422
      if (error.name === 'NotFoundError') return 404
      if (error.name === 'UnauthorizedError') return 401
      if (error.name === 'ForbiddenError') return 403
      return 500  // 기본: 서버 에러
    })()

    return new Response(
      JSON.stringify({
        error: statusCode >= 500 ? '서버 오류가 발생했습니다.' : error.message,
        ...(Deno.env.get('DENO_ENV') !== 'production' ? { stack: error.stack } : {}),
      }),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,  // CORS 헤더 에러 응답에도 포함
        },
      }
    )
  }
}

// 커스텀 에러 클래스
class ValidationError extends Error {
  name = 'ValidationError' as const
  constructor(message: string) { super(message) }
}

class NotFoundError extends Error {
  name = 'NotFoundError' as const
  constructor(message: string) { super(message) }
}

Deno.serve((req) => withErrorHandling(req, async (req) => {
  // ... 비즈니스 로직
  throw new NotFoundError('요청한 리소스를 찾을 수 없습니다.')
}))
```

### 13.6 Datadog / OpenTelemetry 연동 (2026)

```typescript
// 실험적 OTLP 통합 (2026년 지원 발표)
// supabase/functions/_shared/telemetry.ts
export function createSpan(name: string, attributes?: Record<string, string>) {
  return {
    name,
    startTime: Date.now(),
    attributes,
    end() {
      const duration = Date.now() - this.startTime
      console.log(JSON.stringify({
        span: this.name,
        duration,
        ...this.attributes,
      }))
    }
  }
}
```

---

## 14. Vercel / Cloudflare Workers와 비교

### 14.1 런타임 비교 요약

| 항목 | Supabase Edge Functions | Vercel Edge Functions | Cloudflare Workers |
|------|------------------------|----------------------|-------------------|
| 런타임 | Deno 2.x (커스텀) | V8 (Node.js 호환) | V8 (독자 구현) |
| 언어 | TypeScript / JS / WASM | TypeScript / JS | TypeScript / JS / WASM |
| 인프라 | Supabase 자체 (Deno Deploy 기반) | Cloudflare Workers | Cloudflare |
| 콜드 스타트 | 수십~200ms | ~50ms | ~5ms |
| 메모리 | 256 MB | 128 MB | 128 MB |
| CPU 제한 | 2초 (I/O 제외) | 50ms (벽시계) | 10ms (CPU 시간) |
| 실행 제한 | 150s / 400s (플랜별) | 30s | 30s |
| 리전 | 전 세계 자동 | 전 세계 자동 | 전 세계 300+ |
| DB 통합 | 네이티브 (PostgreSQL) | Neon / KV / 별도 | D1 / KV / R2 |
| 가격 (무료) | 500k 호출/월 | 100k 호출/일 | 100k 요청/일 |

### 14.2 Supabase Edge Functions의 강점

**1. Supabase 생태계와 네이티브 통합**
```typescript
// 코드 몇 줄로 Auth + DB + Storage 모두 접근
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authHeader! } } }
)

// RLS 자동 적용으로 보안 강화
const { data } = await supabase.from('orders').select('*')
```

**2. PostgreSQL 직접 접근**
```typescript
// pg_cron과 연동한 스케줄 실행
// pg_net으로 DB에서 직접 함수 호출
// 복잡한 트랜잭션 로직을 DB Function과 조합
```

**3. Deno의 보안 모델**
```typescript
// TypeScript 네이티브 지원 (빌드 불필요)
// 표준 Web API 기반 (이식성 높음)
// 명시적 권한 모델
```

### 14.3 Vercel Edge Functions의 강점

- Next.js와 완전 통합 (미들웨어, Route Handlers)
- 가장 빠른 콜드 스타트 (~50ms)
- 풍부한 프레임워크 생태계 지원

### 14.4 Cloudflare Workers의 강점

- 가장 낮은 콜드 스타트 (~5ms)
- 300+ 글로벌 리전
- KV, R2, D1, Queue 등 풍부한 엣지 서비스
- 성숙한 Workers 생태계

### 14.5 선택 가이드

| 상황 | 권장 |
|------|------|
| Supabase 이미 사용 중 | **Supabase Edge Functions** |
| Next.js + Vercel 사용 중 | **Vercel Edge Functions** |
| 초저지연이 최우선 | **Cloudflare Workers** |
| 글로벌 엣지 최대 활용 | **Cloudflare Workers** |
| 백엔드 통합 (Auth/DB/Storage) 중심 | **Supabase Edge Functions** |
| 프론트엔드 미들웨어 | **Vercel Edge Functions** |

**결론**: Supabase를 이미 사용하는 프로젝트라면 **Supabase Edge Functions가 최적의 선택**이다.
DB, Auth, Storage와 SDK 레벨에서 긴밀하게 통합되어 있어 별도 서버 없이 복잡한 백엔드
로직을 안전하게 구현할 수 있다. 초저지연이 필요하거나 Cloudflare 생태계를 활용하려면
Cloudflare Workers를 검토한다.

---

## 참고 자료

- [Supabase Edge Functions 공식 문서](https://supabase.com/docs/guides/functions)
- [Edge Functions 아키텍처](https://supabase.com/docs/guides/functions/architecture)
- [Edge Functions 제한사항](https://supabase.com/docs/guides/functions/limits)
- [환경변수 및 시크릿 관리](https://supabase.com/docs/guides/functions/secrets)
- [CORS 처리](https://supabase.com/docs/guides/functions/cors)
- [Edge Functions 보안](https://supabase.com/docs/guides/functions/auth)
- [스케줄링 — pg_cron 연동](https://supabase.com/docs/guides/functions/schedule-functions)
- [의존성 관리](https://supabase.com/docs/guides/functions/dependencies)
- [GitHub: supabase/edge-runtime](https://github.com/supabase/edge-runtime)
- [Edge Functions + Deno 2.1 배포 블로그](https://supabase.com/blog/supabase-edge-functions-deploy-dashboard-deno-2-1)
- [Edge Runtime 셀프 호스팅 블로그](https://supabase.com/blog/edge-runtime-self-hosted-deno-functions)
- [Deno 2.0 지원 논의](https://github.com/orgs/supabase/discussions/29552)
- [Supabase Cron 모듈](https://supabase.com/modules/cron)
- [대용량 작업 처리 — Edge Functions + Cron + Queue](https://supabase.com/blog/processing-large-jobs-with-edge-functions)
