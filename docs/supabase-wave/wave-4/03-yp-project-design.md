# 양평부엌 프로젝트 Supabase 적용 설계

> Wave 4 — 프로젝트 실전 적용 설계  
> 작성일: 2026-04-06  
> 대상: stylelucky4u.com (양평 부엌 서버 대시보드)

---

## 목차

1. [현재 아키텍처 분석](#1-현재-아키텍처-분석)
   - 1.1 기술 스택 개요
   - 1.2 배포 환경
   - 1.3 현재 인증 구조
   - 1.4 현재 데이터 관리 방식
   - 1.5 현재 아키텍처의 한계
2. [Supabase 도입 설계](#2-supabase-도입-설계)
   - 2.1 도입 범위 결정 (전체 vs 선택적)
   - 2.2 Database: 영속 데이터 저장
   - 2.3 Auth: 관리자 인증 고도화
   - 2.4 Realtime: 실시간 모니터링
   - 2.5 Edge Functions: 서버 알림/스케줄링
   - 2.6 Storage: 로그 아카이빙
3. [데이터베이스 스키마 설계](#3-데이터베이스-스키마-설계)
   - 3.1 프로세스 스냅샷 테이블
   - 3.2 감사 로그 테이블
   - 3.3 알림 이벤트 테이블
   - 3.4 사용자/관리자 프로필 테이블
   - 3.5 RLS 정책 설계
4. [Managed vs Self-hosted 결정](#4-managed-vs-self-hosted-결정)
   - 4.1 의사결정 기준
   - 4.2 비용 분석 (Free 티어 검토)
   - 4.3 최종 권장 방식
5. [Cloudflare Tunnel + Supabase 통합](#5-cloudflare-tunnel--supabase-통합)
   - 5.1 현재 네트워크 구조
   - 5.2 Supabase 추가 후 네트워크 구조
   - 5.3 환경변수 설정

---

## 1. 현재 아키텍처 분석

### 1.1 기술 스택 개요

양평부엌 서버 대시보드(stylelucky4u.com)는 가정용 서버(WSL2 Ubuntu)를 원격으로 모니터링하고
제어하기 위한 관리용 웹 애플리케이션이다.

| 계층 | 기술 | 비고 |
|------|------|------|
| 프론트엔드 | Next.js 15 (App Router) | React Server Components + Client Components 혼용 |
| 스타일링 | Tailwind CSS | 다크 테마, Supabase 대시보드 스타일 |
| 언어 | TypeScript | 전체 타입 안정성 |
| 인증 | JWT (jose 라이브러리) | 커스텀 구현, 쿠키 기반 세션 |
| API | Next.js Route Handlers | `/api/*` 엔드포인트 |
| 미들웨어 | Next.js Middleware | 인증, Rate Limiting, CORS/CSRF |
| 프로세스 관리 | PM2 (WSL2 Ubuntu) | Node.js 프로세스 관리 |
| 배포 | PM2 + Cloudflare Tunnel | 외부 접근 경로 |

현재 프론트엔드/API 서버는 단일 Next.js 15 애플리케이션으로 구성되어 있으며,
모든 서버 사이드 로직이 Next.js Route Handlers에 포함되어 있다.

### 1.2 배포 환경

```
인터넷 사용자
       │
       ▼
Cloudflare (DNS + CDN + Tunnel)
       │ HTTPS 443
       ▼
Cloudflare Tunnel 클라이언트 (WSL2 Ubuntu에서 실행)
       │ HTTP (내부)
       ▼
Next.js 15 앱 (PM2 관리, localhost:3000)
       │
       ├── /api/system   ← 시스템 리소스 조회 (os 모듈)
       ├── /api/pm2      ← PM2 프로세스 목록/제어
       ├── /api/pm2/logs ← PM2 로그 파일 읽기
       └── /api/audit    ← 감사 로그 조회 (인메모리)
```

배포 환경의 핵심 특징:
- **WSL2 Ubuntu**: Windows Host의 Linux 서브시스템에서 실행. 로컬 파일 시스템 접근 가능
- **PM2**: Node.js 프로세스 매니저. 자동 재시작, 로그 관리, 클러스터 모드 지원
- **Cloudflare Tunnel**: 공인 IP 없이 외부 접근 가능. HTTPS 자동 처리
- **단일 서버**: 개인 가정용 서버. 고가용성 불필요

### 1.3 현재 인증 구조

```typescript
// src/lib/auth.ts — 현재 인증 구현

// 단일 비밀번호 방식: 환경변수에 하드코딩된 비밀번호
export function verifyPassword(input: string): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  // 타이밍 공격 방지: 고정 시간 비교
  if (input.length !== password.length) return false;
  let result = 0;
  for (let i = 0; i < input.length; i++) {
    result |= input.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return result === 0;
}

// JWT 세션 발급 (24시간 유효)
export async function createSession(): Promise<string> {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
  return token;
}
```

현재 인증 방식의 특징:
- **단일 비밀번호**: 사용자 계정 개념 없음. `DASHBOARD_PASSWORD` 환경변수 하나로 인증
- **JWT 세션**: `jose` 라이브러리로 직접 구현. `dashboard_session` 쿠키에 저장
- **미들웨어 보호**: 모든 페이지/API가 미들웨어에서 JWT 검증
- **Rate Limiting**: 로그인 5회/분, API 60회/분 제한 (인메모리 슬라이딩 윈도우)

### 1.4 현재 데이터 관리 방식

현재 프로젝트에는 **영속 데이터 저장소가 없다**. 모든 데이터는 다음 두 가지 방식으로 처리된다:

**실시간 조회 (폴링 기반)**
```typescript
// src/app/page.tsx — 3초마다 API 폴링
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 3000);
  return () => clearInterval(interval);
}, [fetchData]);
```

- `/api/system`: Node.js `os` 모듈로 CPU, 메모리, 디스크, 업타임 조회
- `/api/pm2`: PM2 SDK로 프로세스 목록, CPU, 메모리 상태 조회
- `/api/pm2/logs`: 파일 시스템에서 PM2 로그 파일 직접 읽기

**인메모리 버퍼 (감사 로그)**
```typescript
// src/lib/audit-log.ts — 인메모리 버퍼
const MAX_ENTRIES = 500;
const buffer: AuditEntry[] = [];

export function writeAuditLog(entry: AuditEntry): void {
  buffer.push({ ...entry, timestamp: entry.timestamp || new Date().toISOString() });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}
```

감사 로그는 메모리에만 저장되므로 **서버 재시작 시 초기화**된다.

**인메모리 Rate Limiter**
```typescript
// src/lib/rate-limit.ts — Map 기반 인메모리 저장
const store = new Map<string, RateLimitEntry>();
```

Rate Limit 상태도 서버 재시작 시 초기화된다.

### 1.5 현재 아키텍처의 한계

현재 아키텍처는 1인 개발, 소규모 사용 환경에 최적화되어 있지만, 다음과 같은 한계를 가진다:

| 한계 | 영향 | Supabase 해결 가능성 |
|------|------|---------------------|
| 감사 로그 휘발성 | 재시작 시 보안 이벤트 기록 손실 | Database로 영속화 |
| 단일 비밀번호 인증 | 계정 관리 불가, 비밀번호 변경 복잡 | Auth 서비스 활용 |
| 폴링 기반 모니터링 | 불필요한 API 요청, 지연 발생 | Realtime으로 대체 |
| 히스토리 데이터 없음 | 과거 서버 상태 조회 불가 | Database 시계열 저장 |
| 단일 관리자만 가능 | 다른 기기/사용자 추가 불가 | Auth 다중 사용자 |
| Rate Limit 서버간 공유 불가 | 수평 확장 시 제한 우회 가능 | Redis 또는 DB로 대체 |

---

## 2. Supabase 도입 설계

### 2.1 도입 범위 결정 (전체 vs 선택적)

양평부엌 대시보드는 **1인 개발, 가정용 서버, 소규모 트래픽**이라는 맥락에서 전체 Supabase 도입보다는
**필요한 서비스만 선택적으로 도입**하는 전략이 적합하다.

**도입 우선순위 결정 매트릭스**

| 서비스 | 현재 필요도 | 구현 복잡도 | 권장 여부 |
|--------|------------|-------------|---------|
| Database | 높음 (감사 로그 영속화, 히스토리) | 낮음 | **Phase 1 도입** |
| Auth | 중간 (현재 JWT 커스텀 구현 동작 중) | 낮음 | **Phase 2 도입** |
| Realtime | 중간 (폴링 → 실시간 개선) | 중간 | **Phase 2 도입** |
| Edge Functions | 낮음 (알림, 스케줄링) | 중간 | Phase 3 고려 |
| Storage | 낮음 (로그 아카이빙) | 낮음 | Phase 3 고려 |
| Vector/AI | 없음 | 높음 | 미도입 |

**Phase 1 (즉시 도입)**: Database만
- 감사 로그 영속화: 보안 이벤트 기록 유지
- PM2 프로세스 상태 히스토리: 성능 분석
- 구현 코드 최소 변경

**Phase 2 (안정화 후 도입)**: Auth + Realtime
- Auth: 현재 커스텀 JWT를 Supabase Auth로 교체
- Realtime: 3초 폴링을 실시간 구독으로 변경

**Phase 3 (확장 시 도입)**: Edge Functions + Storage
- 이상 탐지 알림 (Slack/Discord)
- 로그 파일 주기적 아카이빙

### 2.2 Database: PM2 프로세스 모니터링 데이터, 감사 로그 저장

Database는 Supabase의 핵심이며, 가장 먼저 도입할 서비스다.

**도입 목적**
1. 현재 인메모리 감사 로그(`MAX_ENTRIES = 500`)를 PostgreSQL로 영속화
2. PM2 프로세스 상태 스냅샷을 주기적으로 저장 (트렌드 분석)
3. 서버 메트릭 히스토리 저장 (CPU, 메모리 시계열)

**Supabase 클라이언트 초기화**
```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// 서버 사이드 전용 (Service Role Key 사용)
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // 절대 클라이언트에 노출 금지
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// 클라이언트 사이드 (Anon Key 사용)
export const supabaseClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

**감사 로그 저장 예시**
```typescript
// src/lib/audit-log.ts — Supabase 저장 추가
import { supabaseAdmin } from '@/lib/supabase';

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  // 기존 인메모리 버퍼 유지 (Edge Runtime 호환)
  buffer.push({ ...entry, timestamp: entry.timestamp || new Date().toISOString() });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }

  // Supabase에 영속화 (Node.js Runtime에서만)
  if (typeof process !== 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await supabaseAdmin.from('audit_logs').insert({
        method: entry.method,
        path: entry.path,
        ip: entry.ip,
        status: entry.status,
        action: entry.action,
        created_at: entry.timestamp,
      });
    } catch (error) {
      // DB 저장 실패 시 인메모리 버퍼로 폴백 (서비스 중단 없음)
      console.error('감사 로그 DB 저장 실패:', error);
    }
  }
}
```

### 2.3 Auth: 대시보드 접근 제어 (관리자 인증)

현재 단일 비밀번호 JWT 방식을 Supabase Auth로 교체하면 다음 이점이 생긴다:

**현재 방식 vs Supabase Auth**

| 항목 | 현재 (커스텀 JWT) | Supabase Auth |
|------|-----------------|---------------|
| 사용자 계정 | 단일 비밀번호 | 이메일/비밀번호 계정 |
| 비밀번호 변경 | 환경변수 변경 + 재배포 | 웹 UI에서 즉시 변경 |
| 소셜 로그인 | 불가 | GitHub, Google 등 지원 |
| MFA | 불가 | TOTP 지원 |
| 세션 관리 | 24시간 고정 | 자동 갱신, 멀티 세션 |
| Refresh Token | 없음 | 자동 처리 |

**Supabase Auth 기반 로그인 구현**
```typescript
// src/app/api/auth/login/route.ts — Supabase Auth 방식
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: '로그인 실패' }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
```

**미들웨어에서 Supabase 세션 검증**
```typescript
// src/middleware.ts — Supabase Auth 통합
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createMiddlewareClient({ req: request, res: response });

  // 세션 자동 갱신
  const { data: { session } } = await supabase.auth.getSession();

  if (!session && !isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}
```

> **이행 전략**: Phase 2에서 전환 시 기존 커스텀 JWT와 Supabase Auth를 병렬 운영하다가 점진적으로 전환한다.
> 현재 환경변수(`DASHBOARD_PASSWORD`, `AUTH_SECRET`)는 Supabase Auth 완전 전환 전까지 유지한다.

### 2.4 Realtime: 실시간 서버 모니터링 데이터 업데이트

현재 3초 폴링 방식을 Supabase Realtime으로 교체하면 네트워크 효율이 크게 향상된다.

**현재 폴링 방식의 문제**
```typescript
// 현재: 변경 없어도 3초마다 전체 데이터 재요청
const interval = setInterval(fetchData, 3000);
// 동시 접속자 N명 × 3초 = N번의 API 호출/초
```

**Realtime 구독 방식 (목표)**
```typescript
// src/app/page.tsx — Realtime 구독으로 교체
import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabase';

function DashboardPage() {
  const [processes, setProcesses] = useState([]);

  useEffect(() => {
    // 초기 데이터 로드
    fetchCurrentProcesses();

    // pm2_snapshots 테이블 변경 구독
    const subscription = supabaseClient
      .channel('pm2-monitor')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pm2_snapshots',
        },
        (payload) => {
          // 새 스냅샷 수신 시 상태 업데이트
          updateProcessFromSnapshot(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(subscription);
    };
  }, []);
}
```

**백그라운드 수집 에이전트**

Realtime을 활용하려면 PM2 데이터를 주기적으로 DB에 저장하는 에이전트가 필요하다.
이 역할은 별도 Next.js Cron Route 또는 PM2 워커 프로세스가 담당한다:

```typescript
// src/app/api/cron/collect-pm2/route.ts
// Vercel Cron / 또는 PM2 woker 대안
export async function GET() {
  const pm2Data = await fetchPm2Processes();

  await supabaseAdmin.from('pm2_snapshots').insert(
    pm2Data.map(proc => ({
      process_name: proc.name,
      pm_id: proc.pm_id,
      status: proc.status,
      cpu: proc.cpu,
      memory: proc.memory,
      uptime: proc.uptime,
      restarts: proc.restarts,
      collected_at: new Date().toISOString(),
    }))
  );

  return Response.json({ ok: true });
}
```

### 2.5 Edge Functions: 서버 상태 체크, 알림 발송

Edge Functions는 서버 이상 탐지 및 알림 발송에 활용한다.

**활용 시나리오**

1. **이상 탐지 알림**: CPU 90% 이상, 디스크 80% 이상 등 임계치 초과 시 Slack 알림
2. **PM2 프로세스 다운 알림**: 프로세스 `errored` 상태 감지 시 즉시 알림
3. **일간 리포트**: 매일 오전 9시 서버 상태 요약 이메일 발송

**CPU 임계치 초과 알림 Edge Function**
```typescript
// supabase/functions/alert-high-cpu/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(async (req: Request) => {
  const payload = await req.json();
  const { record } = payload; // DB Webhook에서 수신

  if (record.cpu > 90) {
    await sendSlackAlert({
      text: `⚠️ 양평 부엌 서버 CPU 경고`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*CPU 사용률 ${record.cpu}%* 초과 감지\n프로세스: ${record.process_name}\n시각: ${record.collected_at}`,
          },
        },
      ],
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function sendSlackAlert(message: object) {
  await fetch(Deno.env.get('SLACK_WEBHOOK_URL')!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}
```

### 2.6 Storage: 로그 파일 아카이빙

Supabase Storage를 활용해 PM2 로그 파일을 주기적으로 아카이빙한다.

**활용 시나리오**
- PM2 로그 파일이 누적되어 디스크를 차지하는 문제 해결
- 로그를 Storage에 업로드 후 로컬 파일 삭제 (디스크 절약)
- 브라우저에서 아카이브 로그 조회 가능

```typescript
// supabase/functions/archive-logs/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 로그 파일 목록 조회 (API 경유)
  const logFiles = await getOldLogFiles(); // PM2 로그 경로에서

  for (const file of logFiles) {
    const content = await Deno.readFile(file.path);
    const archiveName = `logs/${new Date().toISOString().slice(0, 10)}/${file.name}`;

    await supabase.storage
      .from('server-logs')
      .upload(archiveName, content, {
        contentType: 'text/plain',
        upsert: true,
      });
  }

  return new Response(JSON.stringify({ archived: logFiles.length }));
});
```

---

## 3. 데이터베이스 스키마 설계

### 3.1 프로세스 스냅샷 테이블

PM2 프로세스 상태를 주기적으로 저장하여 히스토리를 유지한다.

```sql
-- 프로세스 상태 스냅샷 (시계열)
CREATE TABLE public.pm2_snapshots (
  id            BIGSERIAL    PRIMARY KEY,
  process_name  TEXT         NOT NULL,
  pm_id         INTEGER      NOT NULL,
  status        TEXT         NOT NULL CHECK (status IN ('online', 'stopped', 'errored', 'launching', 'one-launch-status', 'deletion')),
  cpu           NUMERIC(5,2) NOT NULL DEFAULT 0,
  memory        BIGINT       NOT NULL DEFAULT 0, -- bytes
  uptime        BIGINT       NOT NULL DEFAULT 0, -- milliseconds
  restarts      INTEGER      NOT NULL DEFAULT 0,
  exec_mode     TEXT,
  instances     INTEGER,
  collected_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 조회 최적화 인덱스
CREATE INDEX idx_pm2_snapshots_name_time
  ON public.pm2_snapshots (process_name, collected_at DESC);

CREATE INDEX idx_pm2_snapshots_collected_at
  ON public.pm2_snapshots (collected_at DESC);

-- 오래된 데이터 자동 삭제 (30일 보관)
-- pg_cron으로 매일 실행
SELECT cron.schedule(
  'cleanup-old-snapshots',
  '0 2 * * *', -- 매일 새벽 2시
  $$
    DELETE FROM public.pm2_snapshots
    WHERE collected_at < now() - INTERVAL '30 days';
  $$
);
```

**시계열 집계 뷰 (대시보드용)**
```sql
-- 1시간 단위 평균 CPU/메모리
CREATE VIEW public.pm2_hourly_stats AS
SELECT
  process_name,
  date_trunc('hour', collected_at) AS hour,
  AVG(cpu)::NUMERIC(5,2)          AS avg_cpu,
  MAX(cpu)::NUMERIC(5,2)          AS max_cpu,
  AVG(memory)::BIGINT             AS avg_memory,
  MAX(memory)::BIGINT             AS max_memory,
  MAX(restarts)                   AS max_restarts
FROM public.pm2_snapshots
GROUP BY process_name, date_trunc('hour', collected_at)
ORDER BY hour DESC;
```

### 3.2 감사 로그 테이블

현재 인메모리 버퍼(`MAX_ENTRIES = 500`)를 영속화한다.

```sql
-- 감사 로그 (보안 이벤트 영구 기록)
CREATE TABLE public.audit_logs (
  id         BIGSERIAL   PRIMARY KEY,
  method     TEXT        NOT NULL,
  path       TEXT        NOT NULL,
  ip         TEXT        NOT NULL,
  status     INTEGER,
  action     TEXT,        -- 'PM2_CONTROL', 'RATE_LIMITED', 'CORS_BLOCKED', 'CSRF_BLOCKED', 'LOGIN', 'LOGOUT'
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 조회 최적화 인덱스
CREATE INDEX idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

CREATE INDEX idx_audit_logs_ip
  ON public.audit_logs (ip);

CREATE INDEX idx_audit_logs_action
  ON public.audit_logs (action)
  WHERE action IS NOT NULL;

-- 오래된 보안 로그 보관 (90일)
SELECT cron.schedule(
  'cleanup-old-audit-logs',
  '0 3 * * *', -- 매일 새벽 3시
  $$
    DELETE FROM public.audit_logs
    WHERE created_at < now() - INTERVAL '90 days';
  $$
);
```

**보안 이벤트 요약 뷰**
```sql
-- 일별 보안 이벤트 카운트
CREATE VIEW public.daily_security_events AS
SELECT
  date_trunc('day', created_at)::DATE AS day,
  action,
  COUNT(*)                            AS count,
  COUNT(DISTINCT ip)                  AS unique_ips
FROM public.audit_logs
WHERE action IN ('RATE_LIMITED', 'CORS_BLOCKED', 'CSRF_BLOCKED')
GROUP BY date_trunc('day', created_at)::DATE, action
ORDER BY day DESC;
```

### 3.3 알림 이벤트 테이블

서버 상태 이상 탐지 및 알림 발송 이력을 기록한다.

```sql
-- 알림 이벤트 (이상 탐지 + 발송 이력)
CREATE TABLE public.alert_events (
  id           BIGSERIAL   PRIMARY KEY,
  event_type   TEXT        NOT NULL, -- 'high_cpu', 'process_down', 'high_disk', 'high_memory'
  severity     TEXT        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  process_name TEXT,                  -- 해당하는 경우
  metric_value NUMERIC,               -- 트리거된 메트릭 값
  threshold    NUMERIC,               -- 임계치
  message      TEXT        NOT NULL,
  notified     BOOLEAN     NOT NULL DEFAULT false, -- 알림 발송 여부
  notified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 미발송 알림 조회 인덱스
CREATE INDEX idx_alert_events_pending
  ON public.alert_events (created_at DESC)
  WHERE notified = false;
```

### 3.4 사용자/관리자 프로필 테이블

Supabase Auth 도입 시 `auth.users`와 연결하는 프로필 테이블.

```sql
-- 관리자 프로필 (auth.users와 1:1 연결)
CREATE TABLE public.admin_profiles (
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'admin'
                           CHECK (role IN ('super_admin', 'admin', 'viewer')),
  last_login   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 신규 사용자 생성 시 프로필 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.admin_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

### 3.5 RLS 정책 설계

양평부엌 대시보드는 관리자 전용 도구이므로, RLS 정책이 단순하다.
핵심 원칙: **인증된 사용자만 모든 데이터에 접근 가능**

```sql
-- ============================================
-- pm2_snapshots: 인증된 사용자만 읽기/쓰기
-- ============================================
ALTER TABLE public.pm2_snapshots ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 조회 가능
CREATE POLICY "인증된 관리자는 스냅샷 조회 가능"
  ON public.pm2_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

-- 서버 사이드(Service Role)만 삽입 가능 (클라이언트 직접 삽입 차단)
-- Service Role은 RLS를 우회하므로 별도 정책 불필요
-- 단, anon 역할의 삽입 차단을 명시적으로:
CREATE POLICY "anon은 스냅샷 삽입 불가"
  ON public.pm2_snapshots
  FOR INSERT
  TO anon
  USING (false);

-- ============================================
-- audit_logs: 인증된 사용자만 읽기, 삽입은 서버만
-- ============================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "인증된 관리자는 감사 로그 조회 가능"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- alert_events: 인증된 사용자만 접근
-- ============================================
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "인증된 관리자는 알림 이벤트 조회 가능"
  ON public.alert_events
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- admin_profiles: 자신의 프로필만 조회/수정
-- ============================================
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "자신의 프로필 조회"
  ON public.admin_profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "자신의 프로필 수정"
  ON public.admin_profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- super_admin은 모든 프로필 조회 가능
CREATE POLICY "super_admin은 모든 프로필 조회"
  ON public.admin_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE id = (select auth.uid())
        AND role = 'super_admin'
    )
  );
```

**RLS 정책 검증 쿼리**
```sql
-- RLS 활성화 여부 확인
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('pm2_snapshots', 'audit_logs', 'alert_events', 'admin_profiles');

-- 특정 사용자 역할로 정책 테스트
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub": "test-user-id"}';
SELECT COUNT(*) FROM public.pm2_snapshots; -- 결과: 0 또는 실제 데이터 수
RESET ROLE;
```

---

## 4. Managed vs Self-hosted 결정

### 4.1 의사결정 기준

양평부엌 프로젝트의 특성을 기준으로 Managed Supabase(supabase.com)와
Self-hosted Supabase(Docker Compose) 중 하나를 선택해야 한다.

**프로젝트 특성 분석**

| 요소 | 값 | Self-hosted 영향 |
|------|-----|----------------|
| 개발자 수 | 1인 | 운영 부담 큼 |
| 트래픽 | 1인 가정용 | 소규모 |
| 데이터 민감도 | 서버 모니터링 데이터 | 낮음 |
| 인프라 경험 | 있음 (WSL2, PM2, Cloudflare) | Self-hosted 가능 |
| 현재 서버 사양 | 가정용 PC | 리소스 제약 있음 |
| 컴플라이언스 요구 | 없음 | Managed 선택 유리 |

### 4.2 비용 분석 (Free 티어 검토)

**Supabase Free 티어 한도 (2025-2026 기준)**

| 리소스 | Free 티어 한도 | 양평부엌 예상 사용량 | 충분 여부 |
|--------|---------------|---------------------|---------|
| Database 스토리지 | 500MB | ~50MB/월 (스냅샷+로그) | 충분 |
| 월간 API 요청 | 5억 건 | ~86,400건/일 (1초당 1건) | 충분 |
| 동시 접속 | 최대 200개 | 1-2개 | 충분 |
| Auth 사용자 | 50,000명 | 1-3명 | 충분 |
| Storage | 1GB | ~100MB/월 | 충분 |
| Edge Functions 호출 | 500,000건/월 | ~30,000건/월 (알림) | 충분 |
| Realtime 접속 | 200 동시 | 1-2개 | 충분 |
| 백업 | 없음 (Pro부터 제공) | PITR 불필요 | 주의 필요 |

**예상 데이터 증가량 계산**

pm2_snapshots 테이블 기준:
- 3초마다 스냅샷 수집 × 프로세스 5개 = 분당 100건
- 일 144,000건 × 행당 약 200바이트 = 약 27MB/일
- 월 약 810MB → **Free 티어 초과 위험**

해결책: 수집 주기를 30초로 늘리면 월 약 81MB로 Free 티어 내에서 운영 가능

```sql
-- 30초 수집 주기 예시 (pg_cron)
SELECT cron.schedule(
  'collect-pm2-snapshot',
  '*/1 * * * *', -- 1분마다
  $$ SELECT collect_pm2_snapshot(); $$
);
-- 단: 이 방식은 1분 해상도 / 더 세밀한 해상도는 Node.js 워커 사용
```

**Pro 티어 비용 ($25/월)이 필요한 시점**
- Database 500MB 초과
- 자동 백업(PITR) 필요
- SLA 보장 필요 (99.9%)
- 팀 협업 기능 필요

결론: **현재 1인 가정용 서버 수준에서는 Free 티어로 충분**

### 4.3 최종 권장 방식: Managed Supabase (Free 티어)

**Managed Supabase 선택 근거**

1. **운영 부담 최소화**: Self-hosted Supabase는 10개 이상의 Docker 컨테이너 필요.
   가정용 PC에서 Supabase + Next.js 대시보드를 동시에 운영하면 리소스 부족 위험.

2. **가정용 PC 리소스 절약**:
   ```
   Self-hosted Supabase 최소 요구사항:
   - RAM: 4GB (권장 8GB)
   - vCPU: 2코어
   - 스토리지: 10GB 이상
   
   현재 Next.js 대시보드만으로도 메모리 사용 중.
   동시 운영은 부담.
   ```

3. **무료로 충분**: 1인 관리자, 소규모 트래픽에서 Free 티어 한도 초과 없음.

4. **Cloudflare와 연동**: Managed Supabase는 전 세계 CDN 경유. WSL2 내부에서 Supabase API 호출 시 레이턴시 10-50ms 수준으로 충분.

5. **백업은 별도 관리**: Free 티어 자동 백업 없음 → 중요한 감사 로그는 별도 주기적 SQL 덤프 스크립트로 보완.

```bash
# 주간 백업 스크립트 (cron으로 등록)
#!/bin/bash
# /home/user/scripts/backup-supabase.sh
BACKUP_DIR="/home/user/backups/supabase"
DATE=$(date +%Y%m%d)

pg_dump "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" \
  --table=audit_logs \
  --table=pm2_snapshots \
  -f "${BACKUP_DIR}/backup_${DATE}.sql"

# 30일 이상 된 백업 삭제
find "${BACKUP_DIR}" -name "backup_*.sql" -mtime +30 -delete
```

---

## 5. Cloudflare Tunnel + Supabase 통합

### 5.1 현재 네트워크 구조

```
[브라우저]
    │ HTTPS (443)
    ▼
[Cloudflare CDN / Edge]
    │ Cloudflare Tunnel (암호화된 outbound 연결)
    ▼
[WSL2 Ubuntu — 가정용 PC]
    │
    ├── [Cloudflare Tunnel 클라이언트 (cloudflared)]
    │       ↕ (localhost:3000으로 프록시)
    ├── [PM2] → [Next.js 앱 (port 3000)]
    │               │
    │               ├── /api/system  → os 모듈
    │               ├── /api/pm2     → PM2 SDK
    │               └── /api/audit   → 인메모리 버퍼
    └── [기타 PM2 프로세스들]
```

### 5.2 Supabase 추가 후 네트워크 구조

```
[브라우저]
    │ HTTPS (443)
    ▼
[Cloudflare CDN / Edge]
    │ Cloudflare Tunnel
    ▼
[WSL2 Ubuntu — 가정용 PC]
    │
    ├── [PM2] → [Next.js 앱 (port 3000)]
    │               │
    │               ├── /api/system   → os 모듈
    │               ├── /api/pm2      → PM2 SDK
    │               ├── /api/audit    → Supabase DB (audit_logs) ──────────┐
    │               └── /api/...                                           │
    │                                                                      │ HTTPS (443)
    └── [PM2 데이터 수집 워커]                                              │
            │ 30초마다 스냅샷 저장 ──────────────────────────────────────→ │
                                                                           ▼
                                                              [Supabase Cloud]
                                                              ├── PostgreSQL DB
                                                              │   ├── pm2_snapshots
                                                              │   ├── audit_logs
                                                              │   └── alert_events
                                                              ├── Auth
                                                              ├── Realtime
                                                              │   └── WebSocket 채널
                                                              ├── Edge Functions
                                                              └── Storage
                                                                  └── server-logs/

[브라우저] ←── WebSocket (Realtime) ────── [Supabase Cloud]
  실시간 모니터링 업데이트
```

Cloudflare Tunnel은 **아웃바운드(outbound) 전용** 연결이므로, Supabase Cloud에서 WSL2 서버로 직접 연결하는 구조는 불가능하다. 따라서:

- WSL2 → Supabase: HTTP/WebSocket 아웃바운드 연결 (정상 동작)
- 브라우저 → Supabase Realtime: 직접 WebSocket 연결 (Cloudflare Tunnel 경유 불필요)
- Supabase Edge Functions → WSL2: 직접 연결 불가 (Cloudflare Tunnel을 통해 stylelucky4u.com 도메인으로 HTTP 요청해야 함)

### 5.3 환경변수 설정

```bash
# .env.local (커밋 금지)

# 기존 환경변수 유지
DASHBOARD_PASSWORD=강한_비밀번호_여기에
AUTH_SECRET=32자_이상_랜덤_시크릿_키

# Supabase 환경변수 추가
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...  # 클라이언트용 (공개 가능)
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...       # 서버 전용 (절대 클라이언트 노출 금지)

# 알림 (선택)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ALERT_EMAIL=admin@example.com
```

**환경변수 보안 체크리스트**

- `NEXT_PUBLIC_` 접두사는 클라이언트 번들에 포함됨 → Anon Key는 공개해도 안전 (RLS가 보안 담당)
- `SUPABASE_SERVICE_ROLE_KEY`는 `NEXT_PUBLIC_` 없이 서버에서만 사용
- `AUTH_SECRET`, `DASHBOARD_PASSWORD`는 Phase 2(Auth 전환) 전까지 유지
- `.env.local`은 `.gitignore`에 이미 포함 확인 필수

```typescript
// src/lib/env.ts — 환경변수 검증
export function validateEnv() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`필수 환경변수 누락: ${key}`);
    }
  }

  // Service Role Key가 클라이언트에 노출되지 않도록 확인
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두사 없이 사용해야 합니다');
  }
}
```

---

## 부록: 도입 체크리스트

### Phase 1: Database 도입 (즉시)

- [ ] Supabase 프로젝트 생성 (Free 티어)
- [ ] 환경변수 설정 (`.env.local`)
- [ ] `src/lib/supabase.ts` 클라이언트 초기화 코드 작성
- [ ] `pm2_snapshots` 테이블 생성 + RLS 설정
- [ ] `audit_logs` 테이블 생성 + RLS 설정
- [ ] `src/lib/audit-log.ts` Supabase 저장 추가
- [ ] PM2 스냅샷 수집 워커 구현
- [ ] 30일/90일 자동 삭제 pg_cron 설정
- [ ] 타입 생성: `npx supabase gen types typescript`

### Phase 2: Auth + Realtime 도입 (2-4주 후)

- [ ] Supabase Auth 관리자 계정 생성
- [ ] `admin_profiles` 테이블 생성 + 트리거
- [ ] 미들웨어 Supabase Auth 통합
- [ ] 로그인 페이지 교체
- [ ] 폴링 → Realtime 구독 전환
- [ ] 기존 JWT 방식 폴백 제거

### Phase 3: Edge Functions + Storage (필요 시)

- [ ] Supabase CLI 설치 + 로컬 개발 환경
- [ ] CPU/메모리 임계치 알림 Edge Function
- [ ] Slack/Discord Webhook 연동
- [ ] 로그 아카이빙 Edge Function
- [ ] Storage 버킷 생성 + 정책 설정
