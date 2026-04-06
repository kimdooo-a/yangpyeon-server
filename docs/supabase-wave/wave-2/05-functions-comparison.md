# 서버리스 함수 플랫폼 비교: Supabase Edge Functions vs Vercel Serverless vs Cloudflare Workers

> Wave-2 리서치 문서 | 작성일: 2026-04-06  
> 대상 독자: 풀스택 개발자, 백엔드 아키텍트  
> 목적: 프로젝트 요구사항에 맞는 서버리스 함수 플랫폼 선택 가이드

---

## 목차

1. [런타임 아키텍처](#1-런타임-아키텍처)
2. [성능: 콜드 스타트·실행 제한·자원](#2-성능-콜드-스타트실행-제한자원)
3. [배포: CLI·Git 연동·엣지 네트워크](#3-배포-cligit-연동엣지-네트워크)
4. [통합: 데이터베이스·인증·스토리지](#4-통합-데이터베이스인증스토리지)
5. [가격 구조](#5-가격-구조)
6. [개발자 경험 (DX)](#6-개발자-경험-dx)
7. [의사결정 가이드](#7-의사결정-가이드)
8. [7항목 스코어링](#8-7항목-스코어링)

---

## 1. 런타임 아키텍처

서버리스 함수 플랫폼의 런타임 선택은 성능, 호환성, 개발 방식 전반에 걸쳐 광범위한 영향을 미친다. 세 플랫폼은 각각 Deno, Node.js, V8 Isolates라는 서로 다른 런타임 모델을 채택하고 있다.

---

### 1.1 Supabase Edge Functions — Deno 런타임

Supabase Edge Functions는 Deno를 런타임으로 채택했다. Deno는 Node.js 창시자 Ryan Dahl이 "Node.js의 실수를 되돌리기 위해" 만든 JavaScript/TypeScript 런타임으로, 보안 우선 설계와 TypeScript 네이티브 지원을 핵심으로 한다.

**런타임 특성:**
```
Supabase Edge Functions 런타임 스택
┌─────────────────────────────────────┐
│  TypeScript / JavaScript 코드        │
│  (트랜스파일 불필요 — 네이티브 TS)   │
├─────────────────────────────────────┤
│  Deno 런타임 (V8 엔진 기반)          │
│  - 표준 Web API (fetch, URL, crypto) │
│  - npm 패키지 지원 (npm: 프리픽스)   │
│  - 보안 샌드박스 (명시적 권한 필요)  │
├─────────────────────────────────────┤
│  Supabase Edge Runtime              │
│  (Deno 호환 커스텀 런타임)           │
└─────────────────────────────────────┘
```

**언어 지원:**
- TypeScript: 네이티브 지원 (별도 컴파일 단계 없음, `tsc` 불필요)
- JavaScript: 지원
- WebAssembly: 지원
- npm 패키지: `npm:` 접두사로 사용 가능 (예: `import { stripe } from 'npm:stripe'`)

**주요 Web API 호환성:**

| API | 지원 여부 |
|-----|---------|
| `fetch` | 예 (네이티브) |
| `URL` / `URLSearchParams` | 예 |
| `Request` / `Response` | 예 |
| `Headers` | 예 |
| `crypto` | 예 (Web Crypto API) |
| `WebSocket` | 예 |
| `ReadableStream` / `WritableStream` | 예 |
| `Blob` / `File` | 예 |

**Node.js 호환성 주의사항:**
Deno는 Node.js가 아니다. `fs`, `path`, `http` 같은 Node.js 내장 모듈은 `node:` 접두사로 일부 접근 가능하지만, Node.js에서 사용하던 모든 라이브러리가 그대로 작동하지는 않는다.

```typescript
// Supabase Edge Function 기본 구조
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const { name } = await req.json()
  const responseData = { message: `안녕하세요 ${name}님!` }

  return new Response(JSON.stringify(responseData), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**보안 모델:**
Deno의 기본 보안 샌드박스는 명시적 권한 없이는 파일 시스템, 네트워크, 환경변수에 접근하지 못한다. Supabase Edge Functions는 이 보안 모델을 완화하여 일반적인 웹 서비스 개발에 필요한 권한을 기본 허용한다.

---

### 1.2 Vercel Serverless Functions — Node.js 런타임

Vercel은 Node.js를 기본 런타임으로 사용하는 전통적인 서버리스 함수 환경을 제공한다. Next.js 생태계와 가장 긴밀하게 통합되어 있으며, Node.js 개발자에게 가장 친숙한 환경이다.

**런타임 구조:**
```
Vercel Functions 런타임 스택
┌─────────────────────────────────────┐
│  TypeScript / JavaScript 코드        │
│  (Next.js API Route 또는 독립 함수) │
├─────────────────────────────────────┤
│  Node.js 런타임 (현재 20.x LTS)     │
│  - 전체 Node.js API 사용 가능       │
│  - npm 패키지 완전 호환              │
│  - CommonJS 및 ESM 지원              │
├─────────────────────────────────────┤
│  Lambda 기반 실행 환경               │
│  (AWS Lambda / Lambda-like 격리)     │
└─────────────────────────────────────┘
```

**또한 Vercel Edge Functions 존재:**
Vercel은 전통적인 Node.js 서버리스 함수 외에 "Edge Functions"도 제공한다. 이는 Cloudflare Workers를 기반으로 구축되어 있으며 V8 Isolates로 실행된다. 단, Vercel Edge Functions는 Node.js 런타임을 사용하지 않으므로 Node.js 전용 API는 사용할 수 없다.

```typescript
// Next.js API Route (Node.js 런타임) — App Router
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db' // Drizzle, Prisma 등 사용 가능

export async function GET(request: NextRequest) {
  const users = await db.query.users.findMany()
  return NextResponse.json(users)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const newUser = await db.insert(users).values(body).returning()
  return NextResponse.json(newUser[0], { status: 201 })
}
```

**언어 지원:**
- TypeScript: 완전 지원 (빌드 시 트랜스파일)
- JavaScript (ESM, CJS): 완전 지원
- Python: 실험적 지원 (Vercel Functions Beta)
- Go: 실험적 지원
- Ruby: 레거시 지원

**Node.js 버전:**
- 현재 기본: Node.js 20.x LTS
- 지원: 18.x, 20.x, 22.x
- 설정: `package.json`의 `engines.node` 또는 `vercel.json`에서 지정

**호환성 강점:**
npm 생태계의 모든 패키지를 제약 없이 사용 가능하다. Prisma, Drizzle, Sequelize 같은 ORM, Sharp 같은 이미지 처리 라이브러리, 네이티브 Node.js 모듈을 요구하는 패키지도 그대로 작동한다.

---

### 1.3 Cloudflare Workers — V8 Isolates

Cloudflare Workers는 브라우저 Chrome의 V8 JavaScript 엔진을 사용하여 경량 Isolates 방식으로 코드를 실행한다. 전통적인 컨테이너나 가상 머신이 아닌 완전히 다른 실행 모델이다.

**V8 Isolates 실행 모델:**
```
Cloudflare Workers 실행 모델
┌─────────────────────────────────────┐
│  TypeScript / JavaScript 코드        │
│  (Wrangler로 번들링)                 │
├─────────────────────────────────────┤
│  V8 Isolate (격리 실행 컨텍스트)     │
│  - 브라우저 V8 엔진과 동일           │
│  - Node.js 없음 (Node.js ≠ V8)     │
│  - Web API 중심                      │
├─────────────────────────────────────┤
│  Cloudflare Workers Runtime         │
│  (단일 프로세스, 수천 Isolate 동시)  │
│  - Cloudflare 글로벌 네트워크        │
│  - 330+ 데이터센터 동시 배포         │
└─────────────────────────────────────┘
```

**핵심 차이: V8 Isolate vs 컨테이너:**
- 전통적 서버리스(Lambda 등): 각 함수 인스턴스 = 별도 컨테이너/OS 프로세스
- V8 Isolates: 단일 V8 프로세스 내에서 수천 개의 격리된 Isolate가 동시 실행
- 결과: 메모리 사용량 1/10 이하, 콜드 스타트 ~5ms (컨테이너 대비 100배 빠름)

```typescript
// Cloudflare Workers 기본 구조
export interface Env {
  MY_BUCKET: R2Bucket       // R2 바인딩
  MY_KV: KVNamespace        // KV 스토리지 바인딩
  MY_DB: D1Database         // D1 SQLite 바인딩
  API_KEY: string           // Secrets
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // R2 파일 서빙 (네트워크 없이 직접 바인딩)
    if (url.pathname.startsWith('/files/')) {
      const key = url.pathname.slice(7)
      const object = await env.MY_BUCKET.get(key)
      if (!object) return new Response('Not Found', { status: 404 })
      return new Response(object.body, {
        headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
      })
    }

    return new Response('Hello from the Edge!', { status: 200 })
  },
}
```

**Node.js 호환성 레이어 (2024년 이후):**
Cloudflare는 Node.js 호환성을 꾸준히 확대하고 있다. `wrangler.toml`에 `compatibility_flags = ["nodejs_compat"]`를 추가하면 많은 Node.js 내장 모듈(`crypto`, `buffer`, `stream`, `util` 등)을 사용할 수 있다. 단, `fs`(파일 시스템) 등 일부는 여전히 미지원.

**언어 지원:**
- TypeScript: Wrangler가 esbuild로 자동 번들링
- JavaScript (ESM): 지원
- Python: Cloudflare Workers for Python (Beta) — `import requests` 스타일
- WebAssembly: 완전 지원 (Rust, C/C++ 컴파일 가능)
- Rust: `wasm-pack`으로 컴파일하여 Workers에서 실행 가능

---

### 1.4 런타임 호환성 비교 요약

| 항목 | Supabase Edge Functions | Vercel Serverless | Cloudflare Workers |
|------|------------------------|-------------------|-------------------|
| 런타임 | Deno (V8 기반) | Node.js 20 LTS | V8 Isolates |
| TypeScript | 네이티브 (컴파일 불필요) | 빌드 시 컴파일 | Wrangler 번들링 |
| npm 패키지 | `npm:` 접두사 필요, 일부 제한 | 완전 호환 | 대부분 호환 (일부 Node.js API 제한) |
| Node.js 내장 모듈 | `node:` 접두사로 일부 지원 | 완전 지원 | `nodejs_compat` 플래그 필요, 일부 미지원 |
| Web API (fetch 등) | 완전 지원 | 지원 | 완전 지원 |
| WebAssembly | 지원 | 지원 (일부 제한) | 완전 지원 |
| 파일 시스템 접근 | 제한적 (읽기 전용, /tmp) | 제한적 (/tmp) | 지원 안 함 |
| 환경변수 | Supabase Secrets | Vercel 환경변수 | Workers Secrets / wrangler.toml vars |

---

## 2. 성능: 콜드 스타트·실행 제한·자원

### 2.1 콜드 스타트 (Cold Start)

콜드 스타트는 함수 인스턴스가 처음 초기화되거나 오랫동안 미사용 후 재시작될 때 발생하는 지연이다. 사용자 경험에 직결되는 지표로, 특히 대화형 API에서 중요하다.

**콜드 스타트 발생 원인별 비교:**

| 항목 | Supabase Edge Functions | Vercel Serverless | Cloudflare Workers |
|------|------------------------|-------------------|-------------------|
| 콜드 스타트 시간 | 200-400ms | 100-3,000ms | ~5ms |
| 콜드 스타트 원인 | Deno 런타임 초기화 | 컨테이너 프로비저닝 | Isolate 생성 (극소) |
| Warm 인스턴스 유지 | 일정 시간 후 종료 | 자동 (트래픽 기반) | 항상 Warm (V8 Isolate) |
| 웜업 전략 | 주기적 호출로 Warm 유지 | 예약된 함수로 웜업 | 불필요 |

**Cloudflare Workers의 콜드 스타트 제거 원리:**

V8 Isolate는 운영체제 수준 프로세스가 아니므로 OS 부팅, 컨테이너 초기화, Node.js 시작 과정이 없다. V8 엔진 내에서 새 Isolate 컨텍스트를 생성하는 데 약 5ms면 충분하다. 또한 Cloudflare는 2023년부터 "스마트 라우팅"을 통해 이미 Warm 상태인 Isolate로 트래픽을 우선 라우팅하여 사실상 콜드 스타트를 제거했다.

**Vercel의 콜드 스타트 최소화 전략:**
- Vercel Fluid Compute: CPU 활성 시간 기반 과금으로 인스턴스 공유 최적화
- Pro 플랜 이상에서 함수 예열(warming) 옵션 일부 제공
- Next.js App Router의 Server Components는 함수 크기 축소로 콜드 스타트 감소

---

### 2.2 실행 시간 제한 (Execution Time Limits)

| 항목 | Supabase Edge Functions | Vercel Serverless (Node.js) | Cloudflare Workers |
|------|------------------------|-----------------------------|--------------------|
| **기본 실행 시간 제한** | 150초 (request idle timeout) | 10초 (Hobby) / 60초 (Pro) | 30초 (기본) |
| **CPU 시간 제한** | 2초/요청 | Active CPU 기준 과금 | 10ms (무료) / 30초 (유료) |
| **최대 확장 가능** | 변경 불가 | Enterprise에서 최대 900초 | 유료 플랜에서 300초 |
| **I/O 대기 시간** | CPU 한도에 미포함 | CPU 활성 시간에 미포함 | CPU 한도에 미포함 |

**CPU 시간 vs 전체 실행 시간의 차이:**

```
요청 처리 타임라인 예시
┌──────────────────────────────────────────────┐
│                                              │
│  전체 실행 시간: 5,000ms                      │
│  ┌────┐        ┌──────┐    ┌─────┐           │
│  │CPU │  I/O   │ CPU  │    │ CPU │  응답      │
│  │50ms│ 3,500ms│100ms │    │100ms│  반환       │
│  └────┘ 대기   └──────┘    └─────┘           │
│         (DB/API 응답 대기)                    │
│                                              │
│  CPU 활성 시간: 250ms (과금 기준)             │
│  I/O 대기 시간: 4,750ms (과금 미포함)         │
└──────────────────────────────────────────────┘
```

Cloudflare Workers와 Vercel 모두 I/O 대기 시간은 CPU 제한 및 과금에서 제외된다. 이는 외부 API 호출, 데이터베이스 쿼리 대기 시간이 많은 함수의 비용을 대폭 절감한다.

---

### 2.3 메모리 및 CPU 할당

| 항목 | Supabase Edge Functions | Vercel Serverless | Cloudflare Workers |
|------|------------------------|-------------------|--------------------|
| **메모리 한도** | ~512MB | 1GB (기본), 3GB (설정 가능) | 128MB per Isolate |
| **CPU** | 공유 (단일 코어) | 공유 vCPU | V8 엔진 공유 |
| **동시 실행** | 제한 없음 (Supabase 관리) | 무제한 (수평 확장) | 무제한 (수평 확장) |
| **최대 요청 크기** | 제한 문서화 없음 | 4.5MB (body) | 100MB (요청 본문) |
| **최대 응답 크기** | 제한 문서화 없음 | 제한 없음 (스트리밍) | 제한 없음 (스트리밍) |

**Cloudflare Workers 메모리 128MB 제약의 의미:**
128MB는 이미지 처리, 대용량 JSON 파싱, 머신러닝 추론 등 메모리 집약적 작업에는 부족할 수 있다. Cloudflare는 메모리 한계 도달 시 인플라이트 요청을 완료한 후 새 Isolate를 생성하는 방식으로 처리한다.

**실용적 제약 시나리오:**
- 비디오 처리, 이미지 리사이징: Workers 부적합 → Supabase 또는 Vercel 권장
- 수백 MB의 학습 모델 로딩: Workers 부적합
- 일반적인 API 로직, 데이터 변환: 세 플랫폼 모두 충분

---

## 3. 배포: CLI·Git 연동·엣지 네트워크

### 3.1 CLI 배포

#### Supabase CLI

```bash
# 설치
npm install -g supabase

# 로컬 개발 시작
supabase start

# 함수 생성
supabase functions new hello-world

# 로컬 함수 서빙
supabase functions serve hello-world --env-file .env.local

# 배포
supabase functions deploy hello-world

# 전체 함수 배포
supabase functions deploy

# 환경변수(Secret) 설정
supabase secrets set MY_API_KEY=your-key
supabase secrets list

# 로그 확인
supabase functions logs hello-world --tail
```

**로컬 개발 플로우:**
```
supabase start
  → PostgreSQL (Docker)
  → Edge Functions 런타임 (Docker)
  → Studio (http://localhost:54323)
  → API (http://localhost:54321)
```

#### Vercel CLI

```bash
# 설치
npm install -g vercel

# 로그인
vercel login

# 개발 서버
vercel dev

# 프리뷰 배포
vercel

# 프로덕션 배포
vercel --prod

# 환경변수 설정
vercel env add MY_API_KEY
vercel env ls
vercel env pull .env.local  # 로컬로 환경변수 다운로드

# 로그 확인
vercel logs [deployment-url]
```

#### Wrangler (Cloudflare Workers CLI)

```bash
# 설치
npm install -g wrangler

# 로그인
wrangler login

# 프로젝트 초기화
wrangler init my-worker

# 로컬 개발
wrangler dev

# 배포
wrangler deploy

# Secrets 설정
wrangler secret put MY_API_KEY
wrangler secret list

# 로그 스트리밍 (실시간)
wrangler tail my-worker

# KV 네임스페이스 관리
wrangler kv:namespace create MY_KV
```

---

### 3.2 Git 연동 및 CI/CD

| 항목 | Supabase Edge Functions | Vercel | Cloudflare Workers |
|------|------------------------|--------|--------------------|
| GitHub 자동 배포 | GitHub Actions 필요 | 네이티브 Git 통합 | GitHub Actions 또는 Cloudflare Pages 통합 |
| PR 프리뷰 배포 | 수동 스크립트 필요 | 자동 생성 | Workers 이름 변경으로 가능 |
| 브랜치별 환경 | 수동 관리 | 자동 (Preview Deployments) | 수동 관리 |
| 배포 롤백 | 이전 버전으로 수동 재배포 | 대시보드에서 원클릭 롤백 | `wrangler rollback` |
| 배포 시간 | ~10-30초 | ~30-90초 (빌드 포함) | ~5-15초 |

**Vercel Git 통합의 강점:**
Vercel의 GitHub/GitLab/Bitbucket 통합은 업계 최고 수준이다. PR을 생성하면 자동으로 프리뷰 URL이 생성되어 팀이 변경사항을 실제 환경과 동일한 조건에서 검토할 수 있다. 머지 시 자동 프로덕션 배포.

---

### 3.3 엣지 네트워크 분산

| 항목 | Supabase Edge Functions | Vercel Edge | Cloudflare Workers |
|------|------------------------|-------------|-------------------|
| 엣지 PoP 수 | 세계 주요 리전 | Vercel 엣지 네트워크 (전 세계) | 330개+ 데이터센터 |
| 배포 방식 | 단일 리전 (프로젝트 리전) | 전역 엣지 배포 | 모든 PoP에 동시 배포 |
| 리전 선택 | 프로젝트 리전 고정 | 자동 (가장 가까운 엣지) | 자동 (글로벌 Any-Cast) |
| 한국 리전 지원 | 싱가포르(ap-southeast-1) 인접 | 있음 | 있음 (서울 PoP) |

**중요한 차이: Supabase의 리전 제한**

Supabase Edge Functions는 기본적으로 프로젝트가 위치한 리전에서 실행된다 (예: 한국에서 ap-southeast-1 싱가포르 선택 시, 함수도 싱가포르에서 실행). Cloudflare Workers나 Vercel Edge Functions처럼 전 세계 엣지에서 동시 실행되지 않는다.

단, 이것이 데이터베이스 지연을 줄이는 장점이기도 하다 — 함수와 DB가 같은 리전에 있으므로 DB 쿼리 왕복 시간이 최소화된다.

---

## 4. 통합: 데이터베이스·인증·스토리지

### 4.1 데이터베이스 연동

#### Supabase Edge Functions + PostgreSQL

Supabase의 가장 강력한 장점은 함수와 데이터베이스가 동일 플랫폼에 있다는 점이다. 함수에서 DB에 접근할 때 네트워크 왕복 없이 내부 연결을 사용한다.

```typescript
// Supabase Edge Function에서 DB 접근
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')!

  // 서버 사이드 클라이언트 (Service Role Key)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 또는 사용자 컨텍스트 (RLS 적용)
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  // RLS가 적용된 사용자 데이터 쿼리
  const { data: profiles, error } = await userClient
    .from('profiles')
    .select('*')
    .eq('user_id', 'user-uuid')

  return new Response(JSON.stringify(profiles), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**DB 연결 풀링 주의사항:**
Edge Functions는 서버리스 환경이므로 각 요청마다 새 DB 연결을 맺는 것은 비효율적이다. Supabase는 Supavisor 연결 풀러를 제공하므로 반드시 풀링 모드 연결을 사용해야 한다.

#### Vercel Functions + 다양한 DB

Vercel은 특정 DB에 종속되지 않는다. Node.js 런타임이므로 사실상 모든 DB 드라이버를 사용할 수 있다.

```typescript
// Vercel Functions + Drizzle + PostgreSQL
import { db } from '@/lib/db'
import { users } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, params.id),
  })

  if (!user) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  return NextResponse.json(user)
}
```

**Vercel의 네이티브 DB 통합:**
- **Vercel Postgres**: Neon 기반 서버리스 PostgreSQL
- **Vercel KV**: Upstash Redis 기반 키-값 스토어
- **Vercel Blob**: 파일 스토리지
- **Vercel Edge Config**: 엣지에서 읽는 초저지연 설정 스토어

```typescript
// Vercel KV (Redis) 예시
import { kv } from '@vercel/kv'

export async function GET(request: Request) {
  const cached = await kv.get('my-cache-key')
  if (cached) return Response.json(cached)

  const data = await fetchExpensiveData()
  await kv.set('my-cache-key', data, { ex: 300 }) // 5분 캐시
  return Response.json(data)
}
```

#### Cloudflare Workers + DB 바인딩

Cloudflare Workers는 바인딩(Binding) 시스템을 통해 외부 네트워크 없이 Cloudflare 서비스에 직접 접근할 수 있다.

```typescript
// wrangler.toml 바인딩 설정
// [[d1_databases]]
// binding = "DB"
// database_name = "my-app-db"
// database_id = "..."

// [[kv_namespaces]]
// binding = "KV"
// id = "..."

// Workers 코드에서 직접 사용
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // D1 SQLite 직접 쿼리 (네트워크 없이)
    const { results } = await env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind('user-123').all()

    // KV 스토어 직접 접근
    const cached = await env.KV.get('cache-key', 'json')

    return Response.json(results)
  },
}
```

**D1 (Cloudflare SQLite) vs PostgreSQL 트레이드오프:**
- D1은 엣지에서 제로 지연으로 읽기 가능하지만 SQLite 기반
- PostgreSQL 기능(저장 프로시저, 고급 인덱싱, 전문 검색, 완전한 동시 쓰기)이 필요하다면 외부 PostgreSQL(Neon, Supabase 등) 연결 필요

---

### 4.2 인증 통합

#### Supabase Edge Functions + Auth

```typescript
// JWT 자동 검증 (기본 활성화)
Deno.serve(async (req) => {
  // Authorization 헤더의 JWT를 자동 검증
  // 검증 실패 시 401 반환
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')

  // 사용자 정보 추출
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  console.log('현재 사용자:', user?.id)

  // JWT 검증 없이 공개 엔드포인트로 사용하려면:
  // supabase functions deploy my-func --no-verify-jwt
})
```

#### Vercel Functions + Auth.js (NextAuth)

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }

// 미들웨어로 보호
// middleware.ts
import { withAuth } from 'next-auth/middleware'
export default withAuth({
  matcher: ['/api/protected/:path*'],
})
```

#### Cloudflare Workers + JWT 수동 처리

```typescript
// Workers에서 JWT 검증 (jose 라이브러리 사용)
import { jwtVerify } from 'jose'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const token = request.headers.get('Authorization')?.split(' ')[1]
    if (!token) return new Response('Unauthorized', { status: 401 })

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(env.JWT_SECRET)
      )
      // 검증 성공
      console.log('사용자 ID:', payload.sub)
    } catch {
      return new Response('Invalid token', { status: 401 })
    }

    return new Response('OK')
  },
}
```

---

### 4.3 스토리지 통합

| 항목 | Supabase Edge Functions | Vercel Functions | Cloudflare Workers |
|------|------------------------|------------------|--------------------|
| 네이티브 스토리지 | Supabase Storage (동일 플랫폼) | Vercel Blob | Cloudflare R2 (직접 바인딩) |
| AWS S3 연동 | AWS SDK via npm: | AWS SDK v3 | AWS SDK (S3 호환) |
| 파일 처리 | 스트리밍 지원 | 스트리밍 지원 | 스트리밍 지원 |
| 임시 파일 저장 | 제한적 | /tmp (512MB) | 지원 안 함 |
| 대용량 파일 처리 | 가능 (스트림) | 가능 (스트림) | 128MB 메모리 제한 주의 |

---

## 5. 가격 구조

### 5.1 무료 티어 비교

| 항목 | Supabase Edge Functions | Vercel (Hobby) | Cloudflare Workers (Free) |
|------|------------------------|----------------|--------------------------|
| **월 요청 수** | 500,000회 | 무제한 (제한 있음) | 100,000회/일 |
| **실행 시간** | - | 10초 (함수당) | 10ms CPU/요청 |
| **함수 수** | 무제한 | 무제한 | 무제한 |
| **용량 제한** | 10MB per 함수 | 250MB (배포 전체) | 1MB per Worker |
| **프로젝트/환경** | 2개 프로젝트 | 무제한 개인 프로젝트 | 무제한 |
| **특이사항** | 7일 미활동 시 프로젝트 일시 중단 | 팀 협업 불가 | 상업적 사용 제한 없음 |

**무료 티어의 함정:**
- Supabase Free: 7일 미활동 시 프로젝트(DB 포함) 일시 중단 → 프로덕션 불가
- Vercel Hobby: 상업적 사용 제한 (개인 프로젝트만)
- Cloudflare Free: 100,000 요청/일 = 월 약 300만 요청, 소규모 앱에 충분

---

### 5.2 유료 플랜 가격

#### Supabase Edge Functions 가격

Supabase Edge Functions는 플랫폼 플랜 내에 포함된다.

| 플랜 | 월 기본 요금 | Edge Functions 포함량 | 초과 비용 |
|------|------------|---------------------|----------|
| Free | $0 | 500,000회/월 | - |
| Pro | $25 | 2,000,000회/월 | $2/100만 회 추가 |
| Team | $599 | 포함 (대용량) | - |

**Edge Functions 컴퓨트 비용:** 요청 횟수 외에 CPU 사용 시간(GB-hours)도 과금 기준이 된다. Pro 플랜에는 GB-hours 기본 할당량이 포함되며 초과 시 추가 과금.

#### Vercel Functions 가격

Vercel의 함수 가격은 2024년 "Fluid Compute" 모델로 개편되었다.

| 플랜 | 월 기본 요금 | 함수 포함량 | 초과 비용 |
|------|------------|-----------|----------|
| Hobby | $0 | 제한적 | 구매 불가 |
| Pro | $20/멤버 | GB-시간 포함 | $0.18/GB-시간 |
| Enterprise | 협의 | 무제한 | 협의 |

**Fluid Compute 과금 모델:**
- **활성 CPU 시간 기준**: I/O 대기 시간은 과금에서 제외
- **프로비저닝 메모리 시간**: 메모리 × 실행 시간으로 계산
- Pro 플랜 기준 기본 포함 GB-시간 있음, 초과 시 $0.18/GB-시간

```
비용 계산 예시:
함수 메모리: 1GB
활성 CPU 시간: 500ms (0.5초)
월 100만 요청

월 비용 = 1GB × 0.5s × 1,000,000 요청 / 3,600s
        = 138.9 GB-시간
        = 138.9 × $0.18 = $25.00/월
```

#### Cloudflare Workers 가격

| 플랜 | 월 기본 요금 | 포함량 | 초과 비용 |
|------|------------|-------|----------|
| Free | $0 | 100K 요청/일, 10ms CPU/요청 | 구매 불가 |
| Workers Paid | $5 | 10M 요청 + 30M CPU-ms | $0.30/M 요청 + $0.02/M CPU-ms |
| Workers for Platforms | $0.02/M 요청 | - | - |

```
비용 계산 예시:
월 5,000만 요청, 평균 CPU 5ms/요청

요청 비용 = (50M - 10M) × $0.30/M = $12.00
CPU 비용 = (50M × 5ms - 30M ms) × $0.02/M ms
         = (250M - 30M) × $0.02/M = $4.40

월 총비용 = $5 (기본) + $12 + $4.40 = $21.40
```

---

### 5.3 비용 시나리오 비교

**소규모 API (월 100만 요청, 평균 50ms CPU):**

| 플랫폼 | 월 비용 |
|--------|--------|
| Supabase (Pro 플랜, DB/Auth 포함) | $25 (함수 포함) |
| Vercel (Pro, 함수만) | ~$9 (Pro 기본 포함 내) |
| Cloudflare Workers | $5 (기본) |

**중규모 API (월 5,000만 요청, 평균 20ms CPU):**

| 플랫폼 | 월 비용 |
|--------|--------|
| Supabase | $25 + 초과 과금 (~$96) = **~$121** |
| Vercel Pro | ~$10 기본 + ~$25 (함수 사용) = **~$35** |
| Cloudflare Workers | **~$21.40** |

**대규모 API (월 10억 요청, 평균 10ms CPU):**

| 플랫폼 | 월 비용 |
|--------|--------|
| Supabase | **매우 고가** (Supabase 스케일 한계) |
| Vercel Enterprise | 협의 필요 |
| Cloudflare Workers | $5 + $291 (요청) + $192 (CPU) = **~$488** |

---

## 6. 개발자 경험 (DX)

### 6.1 로컬 개발 환경

#### Supabase — 완전한 로컬 환경

```bash
# 완전한 Supabase 스택 로컬 실행 (Docker 필요)
supabase start

# 실행 서비스:
# - PostgreSQL (포트 54322)
# - Edge Functions 런타임 (포트 54321)
# - Supabase Studio UI (포트 54323)
# - Inbucket 이메일 (포트 54324)
# - pgMeta API (포트 54325)

# 함수 로컬 실행 (핫 리로드 지원)
supabase functions serve --env-file .env.local
```

**장점:** DB, Auth, Storage, Functions가 모두 로컬에서 실행되어 완전히 격리된 개발 환경 제공. 프로덕션과 동일한 환경에서 테스트 가능.

**단점:** Docker 필요, 초기 이미지 다운로드에 시간 소요, 메모리 사용량 높음(~2GB).

#### Vercel — 빠른 로컬 개발

```bash
# Next.js 개발 서버 (함수 포함)
vercel dev
# 또는
next dev

# 환경변수 로컬 동기화
vercel env pull .env.local

# 로컬 개발 서버에서 API Route 자동 처리
# http://localhost:3000/api/users → app/api/users/route.ts
```

**장점:** `next dev`로 즉시 시작, TypeScript 자동 타입 체킹, Next.js DevTools 통합.

**단점:** DB는 별도 로컬 설정 필요 (Docker Postgres 등), 프리뷰 배포와 완전히 동일하지 않을 수 있음.

#### Cloudflare Workers — Wrangler Dev

```bash
# 로컬 Wrangler Dev (실제 Workers 환경 시뮬레이션)
wrangler dev

# --local 플래그: 실제 Cloudflare 네트워크 없이 완전 로컬
wrangler dev --local

# 원격 Cloudflare 환경에서 실행 (실제 KV, R2 등 사용)
wrangler dev --remote

# Miniflare: 완전 로컬 Workers 런타임 (테스트용)
npx miniflare
```

**장점:** V8 Isolates 환경을 로컬에서 정확히 재현, 바인딩(KV, R2, D1)도 로컬 시뮬레이션.

**단점:** Node.js 개발과 다른 디버깅 경험, 일부 Node.js API 사용 불가로 기존 코드 이식 시 수정 필요.

---

### 6.2 디버깅 및 로깅

| 항목 | Supabase Edge Functions | Vercel | Cloudflare Workers |
|------|------------------------|--------|--------------------|
| 로컬 로그 | `console.log` → 터미널 출력 | `console.log` → 터미널 출력 | `console.log` → `wrangler dev` 출력 |
| 프로덕션 로그 | Supabase 대시보드 로그 탭 | Vercel 대시보드 → Runtime Logs | Cloudflare 대시보드 → Logs |
| 실시간 로그 스트리밍 | `supabase functions logs --tail` | `vercel logs --follow` | `wrangler tail` |
| 에러 추적 | Supabase Logs (기본) | Vercel Error Tracking (통합) | Cloudflare Workers Analytics |
| 외부 APM | Sentry 수동 통합 | Sentry, DataDog 통합 용이 | Sentry 통합 가능 |
| 로그 보존 기간 | 제한적 (플랜별) | 제한적 (1-7일) | 제한적 (수일) |
| 구조화된 로그 | JSON console.log | JSON console.log | JSON console.log |

**Cloudflare Workers 로그 특이사항:**
Workers의 `console.log`는 전통적인 서버 로그와 다르게 동작한다. Workers 런타임이 로그를 버퍼링하는 방식이 약간 다르며, 스택 트레이스가 소스맵 없이는 알아보기 어려울 수 있다. `wrangler tail`로 실시간 스트리밍 시에는 실제 Cloudflare 네트워크로 요청이 흘러야 한다.

---

### 6.3 타입 지원

| 항목 | Supabase Edge Functions | Vercel | Cloudflare Workers |
|------|------------------------|--------|--------------------|
| TypeScript 기본 지원 | 예 (Deno 네이티브) | 예 (tsconfig.json) | 예 (Wrangler + esbuild) |
| 자동 타입 생성 | `supabase gen types typescript` | - | `wrangler types` (Env 인터페이스) |
| DB 스키마 타입 | 자동 생성 지원 | Drizzle/Prisma로 생성 | D1 → Drizzle로 생성 |
| API 응답 타입 | 수동 정의 | 수동 정의 | 수동 정의 |

**Supabase 자동 타입 생성:**
```bash
# DB 스키마에서 TypeScript 타입 자동 생성
supabase gen types typescript --local > src/types/supabase.ts

# 생성된 타입 사용 예시
import type { Database } from '@/types/supabase'
type Profile = Database['public']['Tables']['profiles']['Row']
```

---

### 6.4 프레임워크 통합

| 프레임워크 | Supabase Edge Functions | Vercel | Cloudflare Workers |
|-----------|------------------------|--------|--------------------|
| **Next.js** | 독립 배포 (별도 Supabase CLI) | 최고 수준 통합 | Cloudflare Pages로 배포 가능 |
| **SvelteKit** | 독립 배포 | 공식 어댑터 지원 | 공식 어댑터 지원 |
| **Nuxt.js** | 독립 배포 | Vercel 어댑터 | Cloudflare Pages 어댑터 |
| **Astro** | 독립 배포 | Vercel 어댑터 | Cloudflare 어댑터 |
| **Remix** | 독립 배포 | 공식 지원 | 공식 어댑터 |

**Next.js + Vercel 조합의 독보적 장점:**
Vercel은 Next.js 개발사(Vercel Inc.)가 만든 플랫폼이다. Server Components, Streaming, Partial Prerendering 등 최신 Next.js 기능이 Vercel에서 가장 먼저, 가장 완전하게 작동한다. Cloudflare Pages의 Next.js 지원은 일부 기능에서 제한이 있다.

---

## 7. 의사결정 가이드

### 7.1 주요 질문 트리

```
Q1: Supabase DB/Auth를 이미 사용 중인가?
  └─ 예 → Supabase Edge Functions 우선 고려
  └─ 아니오 → Q2

Q2: Next.js 앱이고 Vercel에 배포 예정인가?
  └─ 예 → Vercel Functions (API Routes) 자연스러운 선택
  └─ 아니오 → Q3

Q3: 전 세계 초저지연 응답이 핵심인가?
  └─ 예 → Cloudflare Workers
  └─ 아니오 → Q4

Q4: 비용이 최우선이고 트래픽이 많은가?
  └─ 예 → Cloudflare Workers
  └─ 아니오 → 현재 스택에 맞는 플랫폼 선택
```

### 7.2 사용 사례별 최적 선택

| 사용 사례 | 최적 선택 | 이유 |
|-----------|----------|------|
| Supabase 앱의 Webhook 처리 | Supabase Edge Functions | 동일 플랫폼, DB 직접 접근 |
| Next.js 앱의 API 엔드포인트 | Vercel (API Routes) | 프레임워크 완전 통합 |
| 전 세계 사용자 대상 A/B 테스트 | Cloudflare Workers | 글로벌 엣지, 초저지연 |
| 이미지/미디어 처리 API | Vercel Functions | 메모리 1GB, Node.js sharp 사용 |
| JWT 검증 미들웨어 | Cloudflare Workers | 5ms 콜드 스타트, 높은 처리량 |
| 서드파티 Stripe 웹훅 | Supabase Edge Functions | 내장 JWT 스킵, DB 연동 간편 |
| 대용량 파일 업/다운 프록시 | Vercel Functions | 스트리밍 지원, 큰 메모리 |
| 실시간 가격 계산기 (엣지) | Cloudflare Workers | 전 세계 330+ PoP에서 실행 |
| GraphQL API 서버 | Vercel Functions | Apollo Server Node.js 완전 호환 |
| SMS/이메일 알림 트리거 | Supabase Edge Functions | DB 트리거와 자연스러운 연동 |

### 7.3 안티패턴 주의

**Cloudflare Workers에서 피해야 할 것:**
- 메모리 집약적 이미지 처리 (128MB 한계)
- Node.js 전용 npm 패키지 사용 (호환성 불완전)
- 복잡한 PostgreSQL 쿼리 (D1은 SQLite, 외부 DB는 네트워크 지연 발생)
- 세션 기반 상태 저장 (무상태 설계 필수)

**Supabase Edge Functions에서 피해야 할 것:**
- CPU 집약적 작업 (2초 CPU 제한)
- 단독 API 서버로의 전용 (Supabase 없이 단독 사용 시 비효율)
- 자주 변경되는 글로벌 캐시 (단일 리전 실행으로 글로벌 일관성 어려움)

**Vercel Functions에서 피해야 할 것:**
- Hobby 플랜에서 상업적 사용
- 10초 이상 장시간 실행 작업 (Hobby 티어)
- 대용량 배포 (250MB 전체 제한)

---

## 8. 7항목 스코어링

> 10점 만점, 일반적인 웹 애플리케이션 API 기준.

| 항목 | 가중치 | Supabase Edge Functions | Vercel Serverless | Cloudflare Workers |
|------|--------|:---:|:---:|:---:|
| **1. 성능 (콜드 스타트/처리량)** | 20% | 6 | 7 | **10** |
| **2. 개발자 경험 (DX)** | 20% | 8 | **10** | 7 |
| **3. 생태계 통합** | 15% | **10** | 9 | 7 |
| **4. 비용 효율성** | 15% | 7 | 7 | **10** |
| **5. 확장성** | 15% | 6 | 8 | **10** |
| **6. 디버깅 / 관측성** | 10% | 7 | **9** | 7 |
| **7. 런타임 호환성** | 5% | 6 | **10** | 7 |

**가중 합산 점수:**

| 서비스 | 가중 점수 |
|--------|----------|
| Supabase Edge Functions | **7.45** |
| Vercel Serverless | **8.35** |
| Cloudflare Workers | **8.70** |

### 항목별 상세 근거

**성능 (콜드 스타트/처리량):**
- Cloudflare(10): ~5ms 콜드 스타트, V8 Isolates로 높은 처리량, 전 세계 엣지
- Vercel(7): 100-3,000ms 콜드 스타트, Fluid Compute로 개선 중
- Supabase(6): 200-400ms 콜드 스타트, 단일 리전 실행으로 글로벌 지연

**개발자 경험 (DX):**
- Vercel(10): GitHub 통합, PR 프리뷰, Next.js 완전 통합, 최고의 대시보드 UX
- Supabase(8): Supabase 스택 내에서는 최고, `supabase start`로 완전한 로컬 환경
- Cloudflare(7): Wrangler 강력하지만 V8 환경 차이로 학습 곡선 있음

**생태계 통합:**
- Supabase(10): DB + Auth + Storage + Functions 일체형, RLS 통합 탁월
- Vercel(9): Next.js 완전 통합, Vercel Postgres/KV/Blob 네이티브 연동
- Cloudflare(7): R2/KV/D1 바인딩 우수, 외부 DB 연동 시 지연 발생

**비용 효율성:**
- Cloudflare(10): CPU 시간 기반 과금 + 가장 저렴한 대규모 처리 비용
- Vercel/Supabase(7): 소규모에서는 합리적, 대규모에서 비용 급증 가능

**확장성:**
- Cloudflare(10): 초당 수십억 요청 처리 가능, 무한 수평 확장
- Vercel(8): 대규모 확장 가능하지만 비용 증가 폭 큼
- Supabase(6): 프로젝트 단위 제약, 함수 실행 한계가 있음

**디버깅 / 관측성:**
- Vercel(9): 대시보드 로그 UI 우수, Error Tracking, Analytics 통합
- Supabase/Cloudflare(7): 기본 로깅 제공, 외부 APM 통합 가능

**런타임 호환성:**
- Vercel(10): Node.js LTS, 완전한 npm 생태계 호환
- Cloudflare(7): nodejs_compat 플래그로 많은 패키지 지원, 일부 제한
- Supabase(6): Deno 런타임, npm: 접두사 필요, 일부 패키지 미지원

---

## 요약

| 시나리오 | 최종 추천 |
|---------|---------|
| Supabase 스택 내 비즈니스 로직 | Supabase Edge Functions |
| Next.js 앱 API 엔드포인트 | Vercel (API Routes) |
| 전 세계 초저지연 엣지 로직 | Cloudflare Workers |
| 대규모 트래픽 + 비용 최적화 | Cloudflare Workers |
| Node.js 라이브러리 의존성 높음 | Vercel Functions |
| 복잡한 DB 연산 | Supabase Edge Functions (또는 Vercel) |
| 이미지/파일 처리 | Vercel Functions (메모리 1GB) |
| 정적 사이트 + 간단한 API | Cloudflare Workers |

---

## 참고 자료

- [Supabase Edge Functions 공식 문서](https://supabase.com/docs/guides/functions)
- [Supabase Edge Functions 아키텍처](https://supabase.com/docs/guides/functions/architecture)
- [Supabase Edge Functions 가격](https://supabase.com/docs/guides/functions/pricing)
- [Supabase Edge Functions 한계](https://supabase.com/docs/guides/functions/limits)
- [Vercel Functions 공식 문서](https://vercel.com/docs/functions)
- [Vercel Functions 가격](https://vercel.com/docs/functions/usage-and-pricing)
- [Vercel Functions 제한](https://vercel.com/docs/functions/limitations)
- [Cloudflare Workers 공식 문서](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers 한계](https://developers.cloudflare.com/workers/platform/limits/)
- [How Workers Works (V8 Isolates)](https://developers.cloudflare.com/workers/reference/how-workers-works/)
- [Edge Functions vs Traditional Serverless 2026](https://www.codercops.com/blog/edge-functions-vs-serverless-2026)
