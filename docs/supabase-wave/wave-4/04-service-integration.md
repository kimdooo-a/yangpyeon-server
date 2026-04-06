# Supabase 서비스간 연동 설계

> Wave 4 — 서비스간 연동 아키텍처  
> 작성일: 2026-04-06  
> 대상: 양평 부엌 서버 대시보드 (stylelucky4u.com)

---

## 목차

1. [Auth → Database 연동](#1-auth--database-연동)
   - 1.1 auth.uid() 기반 RLS 정책 체인
   - 1.2 사용자 생성 시 프로필 자동 생성 트리거
   - 1.3 역할 기반 접근 제어 (RBAC) 구현
2. [Database → Realtime 연동](#2-database--realtime-연동)
   - 2.1 Postgres Changes 구독 개요
   - 2.2 실시간 대시보드 업데이트 파이프라인
   - 2.3 채널 관리 및 필터링
3. [Database → Edge Functions 연동](#3-database--edge-functions-연동)
   - 3.1 Database Webhook → Edge Function 트리거
   - 3.2 pg_cron + pg_net → Edge Function 스케줄링
   - 3.3 DB 트리거 기반 이벤트 처리
4. [Auth → Storage 연동](#4-auth--storage-연동)
   - 4.1 인증된 사용자만 파일 접근
   - 4.2 사용자별 파일 격리
   - 4.3 서버 사이드 업로드 (Service Role)
5. [Edge Functions → 외부 서비스 연동](#5-edge-functions--외부-서비스-연동)
   - 5.1 Slack 알림 연동
   - 5.2 Discord Webhook 연동
   - 5.3 이메일 발송 (Resend)
   - 5.4 외부 API 프록시 패턴
6. [전체 이벤트 흐름 다이어그램](#6-전체-이벤트-흐름-다이어그램)
   - 6.1 전체 아키텍처 ASCII 다이어그램
   - 6.2 이벤트 플로우별 시퀀스 다이어그램

---

## 1. Auth → Database 연동

### 1.1 auth.uid() 기반 RLS 정책 체인

Supabase Auth와 Database의 연동 핵심은 `auth.uid()` 함수다.
사용자가 로그인하면 JWT 토큰이 발급되고, 데이터베이스는 이 토큰에서 사용자 ID를 추출하여
행 단위 접근 제어(RLS)를 수행한다.

**auth.uid() 동작 원리**
```sql
-- auth.uid()는 현재 요청의 JWT에서 'sub' 클레임을 추출
-- Supabase가 자동으로 주입하는 내장 함수
SELECT auth.uid();  -- 반환: UUID 또는 NULL (미인증)
SELECT auth.role(); -- 반환: 'authenticated', 'anon', 'service_role'
SELECT auth.jwt();  -- 반환: 전체 JWT 페이로드 (JSONB)
```

**RLS 정책 체인 패턴**

RLS 정책은 단순한 `auth.uid()` 검사부터 복잡한 조인 기반 역할 검사까지 체인으로 연결할 수 있다.

```sql
-- ============================================
-- 패턴 1: 기본 인증 확인 (가장 단순)
-- ============================================
CREATE POLICY "인증된 사용자만 조회"
  ON public.pm2_snapshots
  FOR SELECT
  TO authenticated          -- authenticated 역할에게만 적용
  USING (true);             -- 인증되었으면 모든 행 허용

-- ============================================
-- 패턴 2: 자신의 데이터만 접근
-- ============================================
CREATE POLICY "자신의 프로필만 조회"
  ON public.admin_profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);
  -- (select auth.uid()) = id: 현재 사용자 UUID와 행의 id가 일치할 때만

-- ============================================
-- 패턴 3: 역할 기반 정책 체인 (조인 활용)
-- ============================================

-- admin_profiles에서 역할 조회 후 권한 부여
CREATE POLICY "admin 이상만 감사 로그 조회"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles
      WHERE id = (select auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  );

-- super_admin만 특정 테이블 삭제 가능
CREATE POLICY "super_admin만 알림 이벤트 삭제"
  ON public.alert_events
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_profiles
      WHERE id = (select auth.uid())
        AND role = 'super_admin'
    )
  );

-- ============================================
-- 패턴 4: JWT 커스텀 클레임 활용 (고급)
-- ============================================
-- JWT에 role을 직접 포함시키면 서브쿼리 없이 역할 확인 가능 (성능 향상)

-- Supabase Auth Hook에서 JWT에 custom claim 추가:
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims JSONB;
  user_role TEXT;
BEGIN
  -- admin_profiles에서 역할 조회
  SELECT role INTO user_role
  FROM public.admin_profiles
  WHERE id = (event->>'user_id')::UUID;

  claims := event->'claims';
  -- JWT에 user_role 클레임 추가
  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(user_role, 'viewer')));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Hook 등록 후 RLS에서 JWT 클레임으로 역할 확인
CREATE POLICY "JWT role 클레임으로 admin 확인"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->'user_role')::TEXT IN ('"admin"', '"super_admin"')
  );
```

**RLS 성능 최적화: `(select auth.uid())` vs `auth.uid()`**

```sql
-- 비효율적: auth.uid()를 행마다 호출 (함수 호출 오버헤드)
USING (auth.uid() = user_id);

-- 효율적: (select auth.uid())로 한 번만 호출 후 재사용
USING ((select auth.uid()) = user_id);

-- 실제 실행 계획 차이:
EXPLAIN SELECT * FROM audit_logs;
-- 비효율: InitPlan 없이 매 행 평가
-- 효율적: InitPlan 1 (subquery 한 번 실행 후 캐시)
```

### 1.2 사용자 생성 시 프로필 자동 생성 트리거

`auth.users` 테이블에 신규 사용자 등록 시 `admin_profiles`를 자동으로 생성한다.

```sql
-- ============================================
-- 프로필 자동 생성 함수
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- 함수 소유자(postgres) 권한으로 실행
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_profiles (id, display_name, role, last_login)
  VALUES (
    NEW.id,
    -- 표시 이름 우선순위: full_name → display_name → 이메일 로컬 파트
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    -- 첫 번째 사용자는 super_admin, 이후는 admin
    CASE
      WHEN (SELECT COUNT(*) FROM public.admin_profiles) = 0 THEN 'super_admin'
      ELSE 'admin'
    END,
    now()
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- 이미 프로필이 있는 경우 무시 (멱등성 보장)
    RETURN NEW;
END;
$$;

-- auth.users INSERT 후 트리거
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 로그인 시간 업데이트 트리거
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_profiles
  SET last_login = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_login();
```

**트리거 테스트**
```sql
-- 테스트: 신규 사용자 생성 시 프로필 자동 생성 확인
DO $$
DECLARE
  test_user_id UUID := gen_random_uuid();
BEGIN
  -- auth.users에 직접 삽입 (테스트 환경만)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (test_user_id, 'test@stylelucky4u.com', 'hashed', now(), now(), now());

  -- 트리거 동작 확인
  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = test_user_id) THEN
    RAISE NOTICE '성공: 프로필 자동 생성됨';
  ELSE
    RAISE EXCEPTION '실패: 프로필 미생성';
  END IF;

  -- 롤백
  DELETE FROM auth.users WHERE id = test_user_id;
END;
$$;
```

### 1.3 역할 기반 접근 제어 (RBAC) 구현

양평부엌 대시보드는 3단계 역할 계층을 사용한다.

**역할 정의**

```
super_admin
    │ 모든 권한: 조회/수정/삭제/알림 설정/사용자 관리
    ▼
admin
    │ 일반 권한: 조회/PM2 제어/로그 조회
    ▼
viewer
    │ 읽기 전용: 대시보드 조회만 가능
```

**RBAC 구현 전략: 데이터베이스 레벨 + 애플리케이션 레벨 이중 검증**

```sql
-- 역할별 테이블 접근 권한 매트릭스

-- pm2_snapshots: 모든 인증 사용자 조회 가능 (PM2 제어는 앱 레벨 검증)
CREATE POLICY "viewer 이상 스냅샷 조회"
  ON public.pm2_snapshots FOR SELECT TO authenticated USING (true);

-- audit_logs: admin 이상만 조회 가능
CREATE POLICY "admin 이상 감사 로그 조회"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    (select auth.jwt()->>'user_role') IN ('admin', 'super_admin')
  );

-- admin_profiles: super_admin은 전체, 나머지는 자신만
CREATE POLICY "프로필 조회 정책"
  ON public.admin_profiles FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR (select auth.jwt()->>'user_role') = 'super_admin'
  );

-- alert_events 설정 변경: super_admin만 가능
CREATE POLICY "super_admin만 알림 설정 변경"
  ON public.alert_events FOR UPDATE TO authenticated
  USING ((select auth.jwt()->>'user_role') = 'super_admin')
  WITH CHECK ((select auth.jwt()->>'user_role') = 'super_admin');
```

**Next.js 애플리케이션 레벨 RBAC**

```typescript
// src/lib/rbac.ts
import { supabaseAdmin } from '@/lib/supabase';

export type UserRole = 'super_admin' | 'admin' | 'viewer';

export const ROLE_PERMISSIONS = {
  super_admin: ['view', 'pm2:control', 'audit:read', 'alert:manage', 'user:manage'],
  admin: ['view', 'pm2:control', 'audit:read'],
  viewer: ['view'],
} as const;

export async function getUserRole(userId: string): Promise<UserRole> {
  const { data, error } = await supabaseAdmin
    .from('admin_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return 'viewer';
  return data.role as UserRole;
}

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission as never);
}

// API Route에서 권한 검증
// src/app/api/pm2/restart/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: '인증 필요' }, { status: 401 });
  }

  const role = await getUserRole(user.id);
  if (!hasPermission(role, 'pm2:control')) {
    return Response.json({ error: '권한 없음' }, { status: 403 });
  }

  // PM2 재시작 로직...
}
```

---

## 2. Database → Realtime 연동

### 2.1 Postgres Changes 구독 개요

Supabase Realtime은 PostgreSQL의 논리적 복제(Logical Replication)를 활용하여
테이블 변경 사항을 WebSocket으로 클라이언트에 실시간 전달한다.

**동작 원리**
```
PostgreSQL WAL (Write-Ahead Log)
       │ 변경 발생 (INSERT/UPDATE/DELETE)
       ▼
Supabase Realtime 서버
       │ PostgreSQL 논리 복제 구독
       ▼
Realtime Channel (WebSocket)
       │ JSON 페이로드 전송
       ▼
브라우저 클라이언트
       │ 상태 업데이트
       ▼
React 컴포넌트 리렌더링
```

**Postgres Changes 이벤트 형식**
```typescript
interface PostgresChangesPayload {
  schema: string;       // 'public'
  table: string;        // 'pm2_snapshots'
  commit_timestamp: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>; // INSERT/UPDATE 시 새 데이터
  old: Record<string, unknown>; // UPDATE/DELETE 시 기존 데이터
  errors: string[] | null;
}
```

### 2.2 실시간 대시보드 업데이트 파이프라인

현재 3초 폴링 → Realtime 구독으로 전환하는 완전한 파이프라인을 설계한다.

**데이터 흐름**
```
[WSL2 데이터 수집 워커]
       │ 30초마다 PM2/시스템 데이터 수집
       ▼
[Supabase PostgreSQL]
  pm2_snapshots INSERT
       │ WAL 로그 생성
       ▼
[Supabase Realtime 서버]
  postgres_changes 이벤트 생성
       │ WebSocket 브로드캐스트
       ▼
[브라우저 구독자들]
  대시보드 상태 업데이트 (즉시)
```

**Next.js 대시보드 Realtime 구독 구현**

```typescript
// src/hooks/useRealtimeDashboard.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabaseClient } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Pm2Snapshot {
  id: number;
  process_name: string;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
  collected_at: string;
}

export function useRealtimePm2() {
  const [snapshots, setSnapshots] = useState<Pm2Snapshot[]>([]);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // 초기 데이터 로드
  const loadInitialData = useCallback(async () => {
    const { data, error } = await supabaseClient
      .from('pm2_snapshots')
      .select('*')
      .order('collected_at', { ascending: false })
      .limit(50); // 최신 50건

    if (!error && data) {
      setSnapshots(data);
    }
  }, []);

  useEffect(() => {
    loadInitialData();

    // Realtime 채널 구독
    const channel = supabaseClient
      .channel('pm2-realtime', {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pm2_snapshots',
        },
        (payload) => {
          const newSnapshot = payload.new as Pm2Snapshot;
          setSnapshots(prev => {
            // 같은 프로세스의 최신 스냅샷으로 교체
            const filtered = prev.filter(
              s => s.process_name !== newSnapshot.process_name
            );
            return [newSnapshot, ...filtered].slice(0, 50);
          });
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabaseClient.removeChannel(channelRef.current);
      }
    };
  }, [loadInitialData]);

  return { snapshots, connected };
}
```

**연결 상태 표시 컴포넌트**
```tsx
// src/components/dashboard/realtime-indicator.tsx
interface RealtimeIndicatorProps {
  connected: boolean;
}

export function RealtimeIndicator({ connected }: RealtimeIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      {connected ? '실시간' : '연결 중...'}
    </div>
  );
}
```

### 2.3 채널 관리 및 필터링

여러 컴포넌트에서 같은 채널을 중복 구독하지 않도록 채널을 관리한다.

```typescript
// src/lib/realtime-manager.ts — 채널 싱글턴 관리

import { supabaseClient } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

class RealtimeManager {
  private channels = new Map<string, RealtimeChannel>();

  getOrCreateChannel(name: string): RealtimeChannel {
    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }
    const channel = supabaseClient.channel(name);
    this.channels.set(name, channel);
    return channel;
  }

  removeChannel(name: string): void {
    const channel = this.channels.get(name);
    if (channel) {
      supabaseClient.removeChannel(channel);
      this.channels.delete(name);
    }
  }
}

export const realtimeManager = new RealtimeManager();
```

**프로세스별 필터링 구독**
```typescript
// 특정 프로세스만 구독 (필터 활용)
const channel = supabaseClient
  .channel('pm2-luckystyle4u')
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE 모두
      schema: 'public',
      table: 'pm2_snapshots',
      filter: 'process_name=eq.luckystyle4u-dashboard', // 특정 프로세스만
    },
    handleChange
  )
  .subscribe();
```

**alert_events 실시간 구독 (경보 즉시 표시)**
```typescript
// 새 경보 발생 시 즉시 브라우저 알림
const alertChannel = supabaseClient
  .channel('alert-events')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'alert_events',
      filter: 'severity=eq.critical', // critical만 구독
    },
    (payload) => {
      const alert = payload.new;
      // 브라우저 알림 (Notification API)
      if (Notification.permission === 'granted') {
        new Notification('양평 부엌 서버 경보', {
          body: alert.message as string,
          icon: '/favicon.ico',
        });
      }
    }
  )
  .subscribe();
```

---

## 3. Database → Edge Functions 연동

### 3.1 Database Webhook → Edge Function 트리거

Supabase Database Webhooks는 테이블 변경 이벤트를 HTTP POST로 Edge Function에 전달한다.
이는 트리거 + pg_net의 상위 레벨 추상화다.

**Database Webhook 설정 (Supabase Dashboard)**
```
Supabase Dashboard → Database → Webhooks → Create Webhook

이름: alert-on-critical-event
테이블: public.alert_events
이벤트: INSERT
URL: https://[project-ref].functions.supabase.co/handle-alert
HTTP 헤더:
  Authorization: Bearer [SUPABASE_SERVICE_ROLE_KEY]
  Content-Type: application/json
```

**Edge Function에서 Webhook 수신**
```typescript
// supabase/functions/handle-alert/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: number;
    event_type: string;
    severity: 'info' | 'warning' | 'critical';
    process_name: string | null;
    metric_value: number | null;
    threshold: number | null;
    message: string;
    notified: boolean;
    created_at: string;
  };
  schema: string;
  old_record: null | Record<string, unknown>;
}

serve(async (req: Request) => {
  // Webhook 인증 검증
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const payload: WebhookPayload = await req.json();
  const { record } = payload;

  // critical 이벤트만 즉시 알림 발송
  if (record.severity === 'critical' && !record.notified) {
    await sendNotification(record.message, record.event_type);

    // 알림 발송 완료 표시
    await supabase
      .from('alert_events')
      .update({
        notified: true,
        notified_at: new Date().toISOString(),
      })
      .eq('id', record.id);
  }

  return new Response(JSON.stringify({ processed: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function sendNotification(message: string, eventType: string) {
  const slackUrl = Deno.env.get('SLACK_WEBHOOK_URL');
  if (!slackUrl) return;

  await fetch(slackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🔴 *양평 부엌 서버 경보*`,
      attachments: [{
        color: 'danger',
        text: message,
        footer: `이벤트: ${eventType} | ${new Date().toLocaleString('ko-KR')}`,
      }],
    }),
  });
}
```

### 3.2 pg_cron + pg_net → Edge Function 스케줄링

`pg_cron`으로 주기적 작업을 예약하고, `pg_net`으로 Edge Function을 HTTP 호출한다.

```sql
-- ============================================
-- pg_net + pg_cron 기반 스케줄링
-- ============================================

-- 매 5분마다 서버 상태 체크 Edge Function 호출
SELECT cron.schedule(
  'health-check-every-5min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://[project-ref].functions.supabase.co/health-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'check_type', 'routine',
        'timestamp', now()
      )
    );
  $$
);

-- 매일 오전 9시 일간 리포트 Edge Function 호출
SELECT cron.schedule(
  'daily-report-9am',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url := 'https://[project-ref].functions.supabase.co/send-daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'report_date', CURRENT_DATE::TEXT
      )
    );
  $$
);
```

**일간 리포트 Edge Function**
```typescript
// supabase/functions/send-daily-report/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  const { report_date } = await req.json();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 전날 서버 상태 요약 조회
  const { data: stats } = await supabase
    .from('pm2_hourly_stats')  // 집계 뷰
    .select('*')
    .gte('hour', `${report_date}T00:00:00Z`)
    .lt('hour', `${report_date}T24:00:00Z`);

  // 전날 보안 이벤트 조회
  const { data: securityEvents } = await supabase
    .from('daily_security_events')
    .select('*')
    .eq('day', report_date);

  const reportText = formatDailyReport(stats, securityEvents, report_date);

  // Slack으로 리포트 발송
  await sendSlackMessage(reportText);

  return new Response(JSON.stringify({ sent: true }));
});

function formatDailyReport(
  stats: unknown[] | null,
  events: unknown[] | null,
  date: string
): string {
  return `
*📊 양평 부엌 서버 일간 리포트 — ${date}*

${stats?.length ? `프로세스 평균 CPU/메모리 정보 수집됨` : '데이터 없음'}
${events?.length ? `보안 이벤트: ${events.length}건 탐지` : '보안 이벤트: 없음'}
  `.trim();
}

async function sendSlackMessage(text: string) {
  const url = Deno.env.get('SLACK_WEBHOOK_URL');
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}
```

### 3.3 DB 트리거 기반 이벤트 처리

`pg_net`을 사용해 PostgreSQL 트리거에서 직접 Edge Function을 호출한다.
이는 Database Webhook보다 낮은 레벨이지만 더 세밀한 제어가 가능하다.

```sql
-- ============================================
-- PM2 프로세스 상태 변경 감지 트리거
-- ============================================

-- 프로세스가 errored 상태로 변경될 때 즉시 알림
CREATE OR REPLACE FUNCTION notify_process_error()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 이전: online → 현재: errored
  IF NEW.status = 'errored' AND (OLD.status IS NULL OR OLD.status != 'errored') THEN
    -- alert_events 테이블에 기록 (이것이 Database Webhook을 트리거)
    INSERT INTO public.alert_events (
      event_type,
      severity,
      process_name,
      message
    ) VALUES (
      'process_down',
      'critical',
      NEW.process_name,
      format('프로세스 %s 가 errored 상태로 변경되었습니다', NEW.process_name)
    );

    -- pg_net으로 직접 Edge Function 호출 (즉시 알림)
    PERFORM net.http_post(
      url := current_setting('app.edge_function_url') || '/handle-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'process_error',
        'process_name', NEW.process_name,
        'severity', 'critical'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER pm2_process_error_alert
  AFTER INSERT OR UPDATE ON public.pm2_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION notify_process_error();

-- ============================================
-- 임계치 초과 감지 트리거
-- ============================================
CREATE OR REPLACE FUNCTION check_metric_thresholds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- CPU 90% 초과
  IF NEW.cpu > 90 THEN
    INSERT INTO public.alert_events (event_type, severity, process_name, metric_value, threshold, message)
    VALUES (
      'high_cpu', 'critical', NEW.process_name, NEW.cpu, 90,
      format('프로세스 %s CPU %s%% 초과 (임계치: 90%%)', NEW.process_name, NEW.cpu)
    )
    ON CONFLICT DO NOTHING; -- 중복 삽입 방지 (실제로는 시간 윈도우 기반 중복 제거 필요)
  END IF;

  -- 메모리 1GB 초과 (1073741824 bytes)
  IF NEW.memory > 1073741824 THEN
    INSERT INTO public.alert_events (event_type, severity, process_name, metric_value, threshold, message)
    VALUES (
      'high_memory', 'warning', NEW.process_name, NEW.memory / 1048576.0, 1024,
      format('프로세스 %s 메모리 %sMB 초과 (임계치: 1024MB)', NEW.process_name, (NEW.memory / 1048576)::INT)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER pm2_metric_threshold_check
  AFTER INSERT ON public.pm2_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION check_metric_thresholds();
```

---

## 4. Auth → Storage 연동

### 4.1 인증된 사용자만 파일 접근

Storage 버킷에 RLS와 유사한 정책(Storage Policies)을 적용한다.

```sql
-- ============================================
-- Storage 버킷 생성
-- ============================================

-- Supabase Dashboard 또는 SQL로 버킷 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'server-logs',
  'server-logs',
  false,          -- 비공개 버킷 (직접 URL 접근 불가)
  52428800,       -- 50MB 제한
  ARRAY['text/plain', 'application/gzip', 'application/x-gzip']
);

-- ============================================
-- Storage 정책: 인증된 사용자만 접근
-- ============================================

-- 인증된 사용자만 파일 목록 조회
CREATE POLICY "인증된 사용자 파일 목록 조회"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'server-logs');

-- 인증된 사용자만 파일 다운로드
CREATE POLICY "인증된 사용자 파일 다운로드"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'server-logs'
    AND (select auth.uid()) IS NOT NULL
  );

-- 업로드는 서버 사이드(Service Role)만 가능 — 클라이언트 업로드 차단
CREATE POLICY "anon 업로드 차단"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (false);

-- admin 이상만 파일 삭제 가능
CREATE POLICY "admin 이상만 파일 삭제"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'server-logs'
    AND EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE id = (select auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  );
```

### 4.2 사용자별 파일 격리

멀티 관리자 시나리오에서 사용자별 개인 파일 공간을 격리한다.

```sql
-- 버킷 구조: server-logs/{user_id}/{파일명}
-- 자신의 폴더만 접근 가능

CREATE POLICY "사용자별 파일 격리"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'server-logs'
    AND (storage.foldername(name))[1] = (select auth.uid())::TEXT
  )
  WITH CHECK (
    bucket_id = 'server-logs'
    AND (storage.foldername(name))[1] = (select auth.uid())::TEXT
  );

-- super_admin은 전체 접근 가능
CREATE POLICY "super_admin 전체 파일 접근"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'server-logs'
    AND EXISTS (
      SELECT 1 FROM public.admin_profiles
      WHERE id = (select auth.uid()) AND role = 'super_admin'
    )
  );
```

### 4.3 서버 사이드 업로드 (Service Role)

로그 아카이빙은 서버 사이드에서 Service Role Key를 사용해 업로드한다.

```typescript
// src/app/api/logs/archive/route.ts
import { supabaseAdmin } from '@/lib/supabase';
import { readFile } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  const { logFile } = await request.json();

  // 로그 파일 읽기
  const logPath = path.join('/home/user/.pm2/logs', logFile);
  let content: Buffer;
  try {
    content = await readFile(logPath);
  } catch {
    return Response.json({ error: '로그 파일 읽기 실패' }, { status: 404 });
  }

  // Supabase Storage에 업로드 (Service Role — RLS 우회)
  const archiveName = `logs/${new Date().toISOString().slice(0, 10)}/${logFile}`;

  const { data, error } = await supabaseAdmin.storage
    .from('server-logs')
    .upload(archiveName, content, {
      contentType: 'text/plain',
      upsert: true, // 같은 날 중복 업로드 허용
    });

  if (error) {
    return Response.json({ error: '업로드 실패', details: error.message }, { status: 500 });
  }

  return Response.json({ path: data.path });
}

// 클라이언트에서 파일 목록 조회 (인증 필요)
// src/app/api/logs/archived/route.ts
export async function GET() {
  const { data, error } = await supabaseAdmin.storage
    .from('server-logs')
    .list('logs', {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) return Response.json({ error }, { status: 500 });
  return Response.json({ files: data });
}
```

**클라이언트에서 인증된 파일 URL 생성**
```typescript
// 서명된 URL (만료 시간 포함, 인증 불필요한 일시적 URL)
const { data } = await supabaseClient.storage
  .from('server-logs')
  .createSignedUrl('logs/2026-04-06/app-out.log', 3600); // 1시간 유효

// data.signedUrl: https://[project-ref].supabase.co/storage/v1/object/sign/...
```

---

## 5. Edge Functions → 외부 서비스 연동

### 5.1 Slack 알림 연동

서버 이상 탐지 시 Slack 채널에 구조화된 알림을 발송한다.

```typescript
// supabase/functions/shared/slack.ts — 공유 유틸리티
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: {
    color: string;
    text: string;
    fields?: { title: string; value: string; short?: boolean }[];
    footer?: string;
  }[];
}

export async function sendSlack(
  webhookUrl: string,
  message: SlackMessage
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack API 오류: ${response.status}`);
  }
}

// 서버 경보 메시지 포맷터
export function formatServerAlert(params: {
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  processName?: string;
  metricValue?: number;
  threshold?: number;
  message: string;
}): SlackMessage {
  const severityEmoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🔴',
  }[params.severity];

  const severityColor = {
    info: 'good',
    warning: 'warning',
    critical: 'danger',
  }[params.severity];

  return {
    text: `${severityEmoji} 양평 부엌 서버 알림`,
    attachments: [{
      color: severityColor,
      text: params.message,
      fields: [
        { title: '심각도', value: params.severity.toUpperCase(), short: true },
        { title: '이벤트', value: params.eventType, short: true },
        ...(params.processName ? [{ title: '프로세스', value: params.processName, short: true }] : []),
        ...(params.metricValue !== undefined ? [
          { title: '현재 값', value: String(params.metricValue), short: true },
          { title: '임계치', value: String(params.threshold), short: true },
        ] : []),
      ],
      footer: `stylelucky4u.com | ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    }],
  };
}
```

**실제 알림 Edge Function에서 사용**
```typescript
// supabase/functions/handle-alert/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { sendSlack, formatServerAlert } from '../shared/slack.ts';

serve(async (req: Request) => {
  const payload = await req.json();
  const { record } = payload;

  const slackMessage = formatServerAlert({
    eventType: record.event_type,
    severity: record.severity,
    processName: record.process_name,
    metricValue: record.metric_value,
    threshold: record.threshold,
    message: record.message,
  });

  await sendSlack(Deno.env.get('SLACK_WEBHOOK_URL')!, slackMessage);

  return new Response(JSON.stringify({ sent: true }));
});
```

### 5.2 Discord Webhook 연동

Slack 대신 또는 추가로 Discord 채널에 알림을 발송한다.

```typescript
// supabase/functions/shared/discord.ts
export async function sendDiscord(
  webhookUrl: string,
  params: {
    content: string;
    embeds?: {
      title: string;
      description: string;
      color: number; // 0xRRGGBB
      fields?: { name: string; value: string; inline?: boolean }[];
      timestamp?: string;
    }[];
  }
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Discord Webhook 오류: ${response.status}`);
  }
}

// 서버 경보 Discord 포맷터
export function formatDiscordAlert(params: {
  severity: 'info' | 'warning' | 'critical';
  processName?: string;
  message: string;
  eventType: string;
}) {
  const colors = { info: 0x5865F2, warning: 0xFEE75C, critical: 0xED4245 };

  return {
    content: params.severity === 'critical' ? '@here' : '',
    embeds: [{
      title: `양평 부엌 서버 ${params.severity.toUpperCase()} 알림`,
      description: params.message,
      color: colors[params.severity],
      fields: [
        { name: '이벤트', value: params.eventType, inline: true },
        ...(params.processName
          ? [{ name: '프로세스', value: params.processName, inline: true }]
          : []),
      ],
      timestamp: new Date().toISOString(),
    }],
  };
}
```

### 5.3 이메일 발송 (Resend)

Resend API를 활용해 중요 알림을 이메일로 발송한다.

```typescript
// supabase/functions/shared/email.ts
interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: EmailParams): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY 미설정');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'server-alert@stylelucky4u.com', // 도메인 인증 필요
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Resend API 오류: ${JSON.stringify(error)}`);
  }
}

// 일간 리포트 이메일 템플릿
export function buildDailyReportHtml(params: {
  date: string;
  avgCpu: number;
  maxCpu: number;
  securityEvents: number;
}): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>양평 부엌 서버 일간 리포트 — ${params.date}</h2>
  <table border="1" cellpadding="8" style="width: 100%; border-collapse: collapse;">
    <tr>
      <th>평균 CPU</th>
      <td>${params.avgCpu.toFixed(1)}%</td>
    </tr>
    <tr>
      <th>최대 CPU</th>
      <td>${params.maxCpu.toFixed(1)}%</td>
    </tr>
    <tr>
      <th>보안 이벤트</th>
      <td>${params.securityEvents}건</td>
    </tr>
  </table>
  <p><a href="https://stylelucky4u.com">대시보드 확인</a></p>
</body>
</html>
  `.trim();
}
```

### 5.4 외부 API 프록시 패턴

Edge Function을 API 프록시로 사용해 민감한 API 키를 서버 사이드에만 유지한다.

```typescript
// supabase/functions/api-proxy/index.ts
// 목적: 외부 API 키를 클라이언트에 노출하지 않고 요청 프록시

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ALLOWED_TARGETS = new Set([
  'api.ipinfo.io',     // IP 정보 조회
  'api.weather.gov',   // 날씨 (서버실 온도 알림용)
]);

serve(async (req: Request) => {
  // 인증 확인 (Supabase JWT)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { target, path: urlPath, params } = await req.json();

  // 허용된 대상만 프록시
  if (!ALLOWED_TARGETS.has(target)) {
    return new Response('Forbidden target', { status: 403 });
  }

  const url = new URL(`https://${target}${urlPath}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, String(value))
    );
  }

  // API 키는 서버(Edge Function)에서만 보유
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${Deno.env.get('EXTERNAL_API_KEY')}`,
    },
  });

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## 6. 전체 이벤트 흐름 다이어그램

### 6.1 전체 아키텍처 ASCII 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                         브라우저 클라이언트                           │
│  Next.js 페이지 (React)                                              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │   대시보드 페이지                 프로세스 페이지             │   │
│  │   useRealtimePm2()                폴링 (5초)                │   │
│  │   WebSocket 구독                  fetch /api/pm2            │   │
│  └─────────┬──────────────────────────────────────────────────┘   │
│            │ WebSocket                │ HTTPS                      │
└────────────┼──────────────────────────┼────────────────────────────┘
             │                          │
             │                          │ Cloudflare Tunnel
             │                          ▼
             │             ┌────────────────────────────┐
             │             │  WSL2 Ubuntu               │
             │             │  Next.js (PM2 port:3000)    │
             │             │                            │
             │             │  /api/system ──→ os 모듈   │
             │             │  /api/pm2    ──→ PM2 SDK   │
             │             │  /api/audit  ──→ Supabase DB│
             │             │                    │       │
             │             │  [수집 워커 PM2]   │       │
             │             │    30초마다 ───────┤       │
             │             └─────────────────────┼───────┘
             │                                   │ HTTPS
             │                                   ▼
             │             ┌──────────────────────────────────────────┐
             │             │           Supabase Cloud                  │
             │             │                                          │
             │   WebSocket │  ┌─────────────────────────────────┐    │
             └─────────────┼─→│  Realtime 서버                   │    │
                           │  │  채널: pm2-realtime               │    │
                           │  └─────────────┬───────────────────┘    │
                           │                │ 변경 이벤트               │
                           │  ┌─────────────▼───────────────────┐    │
                           │  │  PostgreSQL                      │    │
                           │  │  ├── pm2_snapshots (시계열)       │    │
                           │  │  ├── audit_logs (보안 이벤트)    │    │
                           │  │  ├── alert_events (경보)         │    │
                           │  │  └── admin_profiles (사용자)     │    │
                           │  └─────────┬────────┬──────────────┘    │
                           │            │        │                    │
                           │     트리거  │        │ Database Webhook   │
                           │            │        ▼                    │
                           │  ┌─────────▼────────────────────────┐   │
                           │  │  Edge Functions                   │   │
                           │  │  ├── handle-alert (경보 처리)     │   │
                           │  │  ├── send-daily-report (리포트)   │   │
                           │  │  └── archive-logs (로그 보관)     │   │
                           │  └──────────┬────────────────────────┘   │
                           │             │                            │
                           │  ┌──────────▼────────────────────────┐  │
                           │  │  Storage (server-logs 버킷)        │  │
                           │  │  logs/YYYY-MM-DD/app-out.log      │  │
                           │  └───────────────────────────────────┘  │
                           │                                          │
                           └──────────────────────────────────────────┘
                                              │
                                              │ Slack/Discord/Email
                                              ▼
                                    ┌─────────────────┐
                                    │   외부 알림 서비스 │
                                    │  Slack           │
                                    │  Discord         │
                                    │  Resend (이메일)  │
                                    └─────────────────┘
```

### 6.2 이벤트 플로우별 시퀀스 다이어그램

**[플로우 1] 로그인 및 세션 생성**
```
브라우저          Next.js          Supabase Auth      DB (admin_profiles)
   │                  │                  │                    │
   ├──POST /login────→│                  │                    │
   │  {email, pass}   │                  │                    │
   │                  ├──signIn──────────→│                   │
   │                  │                  ├── JWT 발급         │
   │                  │                  │   (user_role 포함) │
   │                  │←── JWT ──────────┤                    │
   │                  │                  │                    │
   │                  │                  ├── last_login 갱신 ─→│
   │                  │                  │   (트리거)          │
   │←── 쿠키 Set ─────┤                  │                    │
   │   (세션 토큰)     │                  │                    │
```

**[플로우 2] PM2 프로세스 상태 수집 및 Realtime 업데이트**
```
[PM2 수집 워커]    Supabase DB       Realtime 서버      브라우저
      │                │                   │                │
      ├── 30초 간격    │                   │                │
      ├──INSERT pm2_snapshots──────────────→│               │
      │                │                   │               │
      │                ├── WAL 변경 감지    │               │
      │                ├────────────────────→│              │
      │                │                   ├── WebSocket ──→│
      │                │                   │  INSERT 이벤트  │
      │                │                   │                ├── 상태 업데이트
      │                │                   │                │   (즉시 리렌더링)
      │                │                   │                │
      │                │                   │                │
      │                ├── 트리거: check_metric_thresholds  │
      │                │   CPU 90% 초과 시                  │
      │                ├──INSERT alert_events─────────────→ │
      │                │                   ├── WebSocket ──→│
      │                │                   │  경보 이벤트   │
      │                │                   │               ├── 브라우저 알림 표시
```

**[플로우 3] 임계치 초과 → 알림 발송**
```
PostgreSQL        DB Webhook         Edge Function       Slack
     │                 │                   │               │
     │ alert_events    │                   │               │
     │ INSERT ─────────→│                  │               │
     │ (critical)       ├── HTTP POST ─────→│              │
     │                  │                  │               │
     │                  │                  ├── 메시지 포맷  │
     │                  │                  ├── HTTP POST ──→│
     │                  │                  │               ├── 채널에 알림 표시
     │                  │                  │               │
     │                  │                  ├── UPDATE audit_events.notified = true
     │                  │                  │
     │←────────────────────────────────────┤
```

**[플로우 4] 로그 아카이빙**
```
PM2 워커/스케줄러  Next.js API       Supabase Storage    브라우저
      │                │                   │                │
      │ 일일 새벽 2시   │                   │                │
      ├──POST /api/logs/archive────────────→│               │
      │                │                   │               │
      │                ├── readFile (WSL2)  │               │
      │                ├── supabaseAdmin.storage.upload ───→│
      │                │                   │               │
      │                │                   ├── 파일 저장    │
      │                │←── {path} ────────┤               │
      │←── {path} ─────┤                   │               │
      │                │                   │               │
      │ (사용자 요청)   │                   │               │
      │                │←──GET /api/logs/archived──────────┤
      │                ├── supabaseAdmin.storage.list() ───→│
      │                │←── 파일 목록 ─────┤               │
      │                │                   │               │
      │                │──── createSignedUrl ────────────── │
      │                │                   │               │
      │                ├──────────────────────── 파일 목록 ─→│
      │                │                   │           ├── 다운로드 링크 표시
```

**[플로우 5] 감사 로그 이중 저장 (인메모리 + DB)**
```
미들웨어           audit-log.ts       Supabase DB
    │                   │                 │
    │ POST /api/pm2/restart               │
    ├── writeAuditLog() ─→│               │
    │                   ├── buffer.push() │ (Edge Runtime 호환)
    │                   ├── supabaseAdmin.from('audit_logs').insert() ─→│
    │                   │                 ├── 영속화 저장               │
    │                   │                 │                             │
    │ (서버 재시작)      │                 │                             │
    │                   ├── buffer: []    │ (인메모리 초기화)             │
    │                   │                 │                             │
    │ GET /api/audit    │                 │                             │
    ├── getAuditLogs() ─→│               │                             │
    │                   ├── buffer 조회 (최근 데이터) + DB 조회 (과거) ─→│
    │←── 통합 결과 ──────┤               │                             │
```

---

## 부록: 서비스간 연동 구현 체크리스트

### Database ↔ Auth 연동

- [ ] `handle_new_user()` 트리거 함수 생성
- [ ] `on_auth_user_created` 트리거 등록
- [ ] `handle_user_login()` 트리거 함수 생성
- [ ] `custom_access_token_hook` 함수 생성 + Dashboard에서 Auth Hook 등록
- [ ] JWT 커스텀 클레임 `user_role` 동작 확인
- [ ] RLS 정책에서 `auth.jwt()->>'user_role'` 활용

### Database ↔ Realtime 연동

- [ ] `pm2_snapshots` 테이블 Realtime 활성화 (Dashboard → Database → Replication)
- [ ] `alert_events` 테이블 Realtime 활성화
- [ ] 클라이언트 `postgres_changes` 구독 코드 작성
- [ ] 채널 싱글턴 관리 (`RealtimeManager`) 구현
- [ ] 연결 상태 표시 컴포넌트 추가

### Database ↔ Edge Functions 연동

- [ ] `pg_net` 확장 활성화 확인
- [ ] `pg_cron` 확장 활성화 확인
- [ ] Database Webhook 설정 (alert_events INSERT)
- [ ] `handle-alert` Edge Function 배포
- [ ] `send-daily-report` Edge Function 배포
- [ ] `notify_process_error()` 트리거 함수 생성
- [ ] `check_metric_thresholds()` 트리거 함수 생성

### Auth ↔ Storage 연동

- [ ] `server-logs` 버킷 생성 (비공개)
- [ ] Storage 정책 설정 (인증된 사용자 조회/다운로드)
- [ ] 서버 사이드 업로드 API 구현 (`/api/logs/archive`)
- [ ] 서명된 URL 생성 로직 구현

### Edge Functions ↔ 외부 서비스 연동

- [ ] Slack Webhook URL 발급 + `SLACK_WEBHOOK_URL` 시크릿 등록
- [ ] Discord Webhook URL 발급 + `DISCORD_WEBHOOK_URL` 시크릿 등록
- [ ] Resend API Key 발급 + `RESEND_API_KEY` 시크릿 등록
- [ ] 발신 도메인 `stylelucky4u.com` Resend에서 인증
- [ ] Edge Function 시크릿: `supabase secrets set SLACK_WEBHOOK_URL=...`

### 통합 테스트

- [ ] 로그인 → 프로필 자동 생성 확인
- [ ] PM2 스냅샷 INSERT → Realtime 이벤트 수신 확인
- [ ] CPU 90% 시뮬레이션 → alert_events INSERT → Slack 알림 수신 확인
- [ ] 로그 파일 업로드 → Storage에서 다운로드 확인
- [ ] viewer 역할로 audit_logs 접근 차단 확인 (RLS)
