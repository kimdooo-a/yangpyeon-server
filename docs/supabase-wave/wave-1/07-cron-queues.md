# Supabase Cron & Queues 심층 가이드

> **대상**: Supabase의 비동기 작업 처리(pg_cron + pgmq) 전반을 이해하고 싶은 개발자  
> **최종 업데이트**: 2026-04-06  
> **공식 문서**: https://supabase.com/docs/guides/cron · https://supabase.com/docs/guides/queues

---

## 목차

1. [개요: Supabase 비동기 작업 처리 아키텍처](#1-개요)
2. [pg_cron 상세](#2-pg_cron-상세)
3. [pgmq (메시지 큐) 상세](#3-pgmq-메시지-큐-상세)
4. [실전 사용 패턴](#4-실전-사용-패턴)
5. [제한사항 및 주의사항](#5-제한사항-및-주의사항)
6. [외부 큐 서비스 비교](#6-외부-큐-서비스-비교)

---

## 1. 개요

### 1.1 Supabase 비동기 작업 처리의 철학

Supabase는 "Postgres를 플랫폼으로" 라는 철학 아래, 비동기 작업 처리 역시 Postgres 생태계 안에서 해결하도록 설계되어 있다. 별도의 외부 서비스(Redis, RabbitMQ, SQS 등)를 추가하지 않고도 데이터베이스 안에서 직접 스케줄링과 큐 처리를 수행할 수 있다는 점이 핵심이다.

이를 구성하는 두 가지 핵심 Postgres 익스텐션은 다음과 같다:

| 익스텐션 | 역할 | 공식 Supabase 모듈 |
|---------|------|------------------|
| **pg_cron** | 크론 기반 반복 작업 스케줄러 | Supabase Cron |
| **pgmq** | Postgres 네이티브 메시지 큐 | Supabase Queues |

### 1.2 두 컴포넌트의 관계

pg_cron과 pgmq는 독립적으로도 사용 가능하지만, 조합하면 완전한 비동기 파이프라인을 구축할 수 있다.

```
[트리거/이벤트]
      |
      v
[pg_cron: 정기 스케줄]  ──→  [pgmq: 메시지 발행]  ──→  [Edge Function: 소비/처리]
      |                                                          |
      v                                                          v
[직접 SQL 실행]                                          [외부 서비스 연동]
```

예를 들어, pg_cron이 1분마다 실행되어 미처리 주문을 pgmq 큐에 넣고, Edge Function이 큐를 폴링하여 이메일을 발송하는 구조가 전형적인 패턴이다.

### 1.3 Supabase Cron 공식 출시 (2024년 12월)

Supabase Cron은 2024년 12월 공식 출시되었다. 기존 pg_cron 익스텐션을 직접 사용하던 방식에서 발전하여, Supabase Dashboard에서 GUI로 크론 잡을 생성·관리·모니터링할 수 있게 되었다.

### 1.4 Supabase Queues 공식 출시

Supabase Queues 역시 2024년 공식 발표되었으며, pgmq 익스텐션 위에 Supabase의 인증·보안 레이어를 추가하여 REST API로도 접근 가능한 메시지 큐 시스템이 되었다.

---

## 2. pg_cron 상세

### 2.1 pg_cron이란?

pg_cron은 Postgres 내부에서 동작하는 크론 기반 작업 스케줄러다. 일반적인 cron 데몬과 달리, Postgres 백그라운드 워커로 실행되므로 별도의 OS 서비스 없이 데이터베이스 안에서 완결된다.

**주요 특징:**
- Postgres 트랜잭션 컨텍스트에서 SQL 실행
- 초 단위까지 세밀한 스케줄 지정 가능 (최소 1초)
- 최대 32개 동시 잡 실행 지원
- 작업 이력이 `cron.job_run_details` 테이블에 자동 기록

### 2.2 활성화 방법

Supabase Dashboard에서 활성화하는 방법:

```
Dashboard → Database → Extensions → pg_cron 검색 → Enable
```

또는 SQL로 활성화:

```sql
-- pg_cron 익스텐션 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_net도 함께 활성화 (HTTP 요청에 필요)
CREATE EXTENSION IF NOT EXISTS pg_net;
```

### 2.3 크론 표현식 문법

pg_cron은 표준 Unix cron 문법을 따른다. 5개의 필드로 구성된다:

```
┌──────────── 분 (0-59)
│  ┌─────────── 시 (0-23)
│  │  ┌────────── 일 (1-31)
│  │  │  ┌───────── 월 (1-12 또는 Jan-Dec)
│  │  │  │  ┌──────── 요일 (0-7, 0과 7 모두 일요일, 또는 Sun-Sat)
│  │  │  │  │
*  *  *  *  *
```

**자주 쓰는 표현식 예시:**

| 표현식 | 의미 |
|--------|------|
| `* * * * *` | 매 분마다 |
| `0 * * * *` | 매 시간 정각 |
| `0 0 * * *` | 매일 자정 |
| `0 9 * * 1` | 매주 월요일 오전 9시 |
| `0 0 1 * *` | 매월 1일 자정 |
| `*/5 * * * *` | 5분마다 |
| `0 9-18 * * 1-5` | 평일 오전 9시~오후 6시 매 시간 |
| `30 23 L * *` | 매월 마지막 날 23:30 |

**sub-minute(1초~59초) 스케줄:**

```sql
-- 30초마다 실행 (pg_cron 1.5+ 이상 필요)
SELECT cron.schedule('30-seconds-job', '30 seconds', $$SELECT 1$$);

-- 5초마다 실행
SELECT cron.schedule('5-seconds-job', '5 seconds', $$CALL my_procedure()$$);
```

**자연어(Natural Language) 스케줄:**

Supabase Dashboard에서는 자연어로도 스케줄을 지정할 수 있다:
- `"every 5 minutes"` → `*/5 * * * *`
- `"every hour"` → `0 * * * *`
- `"every day at midnight"` → `0 0 * * *`
- `"every monday at 9am"` → `0 9 * * 1`

### 2.4 기본 SQL 함수 스케줄링

#### 단순 SQL 스니펫 실행

```sql
-- 매일 자정에 30일 이상된 로그 삭제
SELECT cron.schedule(
  'cleanup-old-logs',           -- 잡 이름 (유니크해야 함)
  '0 0 * * *',                  -- 크론 표현식
  $$DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days'$$
);
```

#### Postgres 함수 실행

```sql
-- 먼저 함수 정의
CREATE OR REPLACE FUNCTION generate_daily_report()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO daily_reports (report_date, total_users, total_orders)
  SELECT 
    CURRENT_DATE - 1,
    COUNT(DISTINCT user_id),
    COUNT(*)
  FROM orders
  WHERE created_at::date = CURRENT_DATE - 1;
END;
$$;

-- 매일 오전 2시에 리포트 생성
SELECT cron.schedule(
  'daily-report-job',
  '0 2 * * *',
  'SELECT generate_daily_report()'
);
```

#### Stored Procedure 실행

```sql
-- 프로시저 정의
CREATE OR REPLACE PROCEDURE process_pending_emails()
LANGUAGE plpgsql
AS $$
DECLARE
  email_record RECORD;
BEGIN
  FOR email_record IN 
    SELECT * FROM email_queue WHERE status = 'pending' LIMIT 100
  LOOP
    -- 이메일 처리 로직
    UPDATE email_queue SET status = 'processing' WHERE id = email_record.id;
    -- 실제 발송은 별도 서비스에서 처리
  END LOOP;
END;
$$;

-- 1분마다 이메일 큐 처리
SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  'CALL process_pending_emails()'
);
```

### 2.5 Edge Functions 트리거

pg_cron + pg_net 조합으로 Supabase Edge Functions를 정기적으로 호출할 수 있다.

#### 기본 Edge Function 호출 패턴

```sql
-- Edge Function을 5분마다 호출하는 크론 잡
SELECT cron.schedule(
  'invoke-edge-function',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/my-function',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'timestamp', NOW(),
      'source', 'cron'
    )
  )
  $$
);
```

#### 환경 변수를 활용한 안전한 호출

```sql
-- Vault에 저장된 시크릿 키를 사용하는 더 안전한 방법
SELECT cron.schedule(
  'secure-edge-function-call',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/hourly-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{"triggered_by": "cron"}'::jsonb
  )
  $$
);
```

### 2.6 HTTP 호출 스케줄링 (pg_net 연동)

pg_net은 Postgres 내에서 비동기 HTTP 요청을 보낼 수 있게 해주는 익스텐션이다. pg_cron과 결합하면 주기적으로 외부 서비스를 호출할 수 있다.

#### GET 요청

```sql
SELECT cron.schedule(
  'health-check',
  '*/10 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://my-service.example.com/health',
    headers := '{"X-API-Key": "my-api-key"}'::jsonb
  )
  $$
);
```

#### POST 요청 (웹훅 발송)

```sql
SELECT cron.schedule(
  'daily-webhook',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hooks.example.com/daily-trigger',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event', 'daily_trigger',
      'timestamp', extract(epoch from NOW())
    )
  )
  $$
);
```

#### pg_net 응답 확인

pg_net의 HTTP 요청은 비동기로 처리되며, `net._http_response` 테이블에서 결과를 확인할 수 있다:

```sql
-- 최근 HTTP 요청 결과 확인
SELECT 
  id,
  status_code,
  content,
  created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;

-- 실패한 요청만 조회
SELECT *
FROM net._http_response
WHERE status_code >= 400 OR error_msg IS NOT NULL
ORDER BY created DESC;
```

### 2.7 잡 관리 (CRUD)

#### 잡 목록 조회

```sql
-- 등록된 모든 크론 잡 조회
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  active
FROM cron.job
ORDER BY jobname;
```

#### 잡 비활성화/활성화

```sql
-- 잡 일시 정지
UPDATE cron.job SET active = false WHERE jobname = 'cleanup-old-logs';

-- 잡 재활성화
UPDATE cron.job SET active = true WHERE jobname = 'cleanup-old-logs';
```

#### 잡 삭제

```sql
-- 이름으로 잡 삭제
SELECT cron.unschedule('cleanup-old-logs');

-- ID로 잡 삭제
SELECT cron.unschedule(1);
```

#### 잡 스케줄 변경 (삭제 후 재등록)

```sql
-- 기존 잡 삭제
SELECT cron.unschedule('daily-report-job');

-- 새 스케줄로 재등록
SELECT cron.schedule(
  'daily-report-job',
  '0 3 * * *',  -- 오전 2시 → 오전 3시로 변경
  'SELECT generate_daily_report()'
);
```

### 2.8 모니터링 및 로깅

#### 실행 이력 조회

모든 잡 실행 결과는 `cron.job_run_details` 테이블에 기록된다:

```sql
-- 최근 실행 이력 조회
SELECT 
  jrd.jobid,
  j.jobname,
  jrd.start_time,
  jrd.end_time,
  jrd.status,
  jrd.return_message,
  EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time)) AS duration_seconds
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
ORDER BY jrd.start_time DESC
LIMIT 50;
```

#### 실패한 잡 조회

```sql
-- 실패한 실행만 조회
SELECT 
  j.jobname,
  jrd.start_time,
  jrd.status,
  jrd.return_message
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE jrd.status = 'failed'
ORDER BY jrd.start_time DESC;
```

#### 잡별 성공/실패 통계

```sql
SELECT 
  j.jobname,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE jrd.status = 'succeeded') AS success_count,
  COUNT(*) FILTER (WHERE jrd.status = 'failed') AS failure_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE jrd.status = 'succeeded') / COUNT(*),
    2
  ) AS success_rate_pct,
  AVG(EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time))) AS avg_duration_sec
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
GROUP BY j.jobname
ORDER BY failure_count DESC;
```

### 2.9 실패 처리 및 재시도

pg_cron은 **자체적인 재시도 메커니즘을 내장하지 않는다.** 잡이 실패하면 다음 예정 실행 시간까지 기다린다. 재시도 로직은 별도로 구현해야 한다.

#### 재시도 패턴 1: 별도 재시도 테이블 활용

```sql
-- 재시도 큐 테이블 생성
CREATE TABLE IF NOT EXISTS job_retry_queue (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 재시도 처리 함수
CREATE OR REPLACE FUNCTION process_retry_queue()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  job RECORD;
BEGIN
  FOR job IN 
    SELECT * FROM job_retry_queue
    WHERE next_retry_at <= NOW()
      AND attempts < max_attempts
    ORDER BY next_retry_at
    LIMIT 10
  LOOP
    BEGIN
      -- 실제 작업 처리 (job_type에 따라 분기)
      CASE job.job_type
        WHEN 'send_email' THEN
          PERFORM send_email_internal(job.payload);
        WHEN 'sync_data' THEN
          PERFORM sync_data_internal(job.payload);
      END CASE;
      
      -- 성공 시 삭제
      DELETE FROM job_retry_queue WHERE id = job.id;
      
    EXCEPTION WHEN OTHERS THEN
      -- 실패 시 재시도 카운터 증가, 지수 백오프 적용
      UPDATE job_retry_queue
      SET 
        attempts = attempts + 1,
        last_error = SQLERRM,
        next_retry_at = NOW() + (INTERVAL '1 minute' * POWER(2, attempts))
      WHERE id = job.id;
    END;
  END LOOP;
END;
$$;

-- 1분마다 재시도 큐 처리
SELECT cron.schedule(
  'process-retry-queue',
  '* * * * *',
  'SELECT process_retry_queue()'
);
```

#### 재시도 패턴 2: pgmq와 결합

pgmq의 가시성 타임아웃(Visibility Timeout)을 활용하면 자연스러운 재시도가 가능하다. 자세한 내용은 3섹션에서 다룬다.

### 2.10 job_run_details 테이블 정리

pg_cron을 고빈도(1분 이하)로 운영하면 `cron.job_run_details` 테이블이 급격히 커진다. 정기적인 정리가 필요하다:

```sql
-- 7일 이상된 실행 이력 삭제하는 잡 등록
SELECT cron.schedule(
  'cleanup-job-history',
  '0 0 * * *',  -- 매일 자정
  $$
  DELETE FROM cron.job_run_details 
  WHERE end_time < NOW() - INTERVAL '7 days'
  $$
);
```

---

## 3. pgmq (메시지 큐) 상세

### 3.1 pgmq란?

pgmq는 "PostgreSQL Message Queue"의 약자로, AWS SQS에서 영감을 받아 설계된 Postgres 네이티브 메시지 큐 익스텐션이다. Redis나 RabbitMQ 같은 별도 인프라 없이 Postgres 안에서 내구성 있는 메시지 큐를 구현한다.

**핵심 특성:**
- **정확히 한 번(at-least-once) 전달**: 가시성 타임아웃 내 정확히 하나의 컨슈머에게 전달
- **내구성**: 메시지는 Postgres 테이블에 저장되므로 DB 레벨 영속성 보장
- **아카이빙**: 처리된 메시지를 별도 아카이브 테이블에 보관 가능
- **REST API 접근**: Supabase Queues를 통해 HTTP/REST로도 접근 가능

### 3.2 큐 생성 및 관리

#### 익스텐션 활성화

```sql
CREATE EXTENSION IF NOT EXISTS pgmq;
```

#### 일반 큐(Logged Queue) 생성

```sql
-- 내구성 큐 생성 (WAL 로그 기록, 크래시 후 복구 가능)
SELECT pgmq.create('my_queue');

-- 이메일 발송 큐
SELECT pgmq.create('email_notifications');

-- 주문 처리 큐
SELECT pgmq.create('order_processing');
```

#### 비로그 큐(Unlogged Queue) 생성

```sql
-- 비로그 큐 생성 (성능 우선, 크래시 시 메시지 손실 가능)
-- 임시 데이터나 중요도 낮은 작업에 적합
SELECT pgmq.create_unlogged('temp_notifications');
```

**일반 큐 vs 비로그 큐 비교:**

| 특성 | 일반 큐(Logged) | 비로그 큐(Unlogged) |
|------|----------------|---------------------|
| 내구성 | 높음 (WAL 기록) | 낮음 (크래시 시 손실) |
| 성능 | 보통 | 높음 |
| 아카이브 | 아카이브 테이블도 로그됨 | 활성 테이블만 비로그, 아카이브는 로그됨 |
| 적합한 사용처 | 중요 작업, 결제, 이메일 | 캐시 갱신, 통계 업데이트 |

#### 큐 목록 및 정보 조회

```sql
-- 생성된 큐 목록 조회
SELECT * FROM pgmq.list_queues();

-- 특정 큐의 메시지 수 조회
SELECT pgmq.queue_depth('email_notifications');

-- 큐 삭제 (메시지도 함께 삭제)
SELECT pgmq.drop_queue('my_queue');

-- 큐 삭제 (아카이브 테이블도 함께 삭제)
SELECT pgmq.drop_queue('my_queue', true);
```

### 3.3 메시지 발행 (Send)

#### 단일 메시지 발행

```sql
-- 단일 메시지 발행 (메시지 ID 반환)
SELECT pgmq.send(
  'email_notifications',
  '{"to": "user@example.com", "subject": "Hello", "body": "World"}'::jsonb
);

-- 지연 발행 (30초 후에 소비 가능하도록)
SELECT pgmq.send(
  'email_notifications',
  '{"to": "user@example.com", "subject": "Delayed"}'::jsonb,
  30  -- delay in seconds
);
```

#### 배치 메시지 발행

```sql
-- 여러 메시지를 한 번에 발행
SELECT pgmq.send_batch(
  'order_processing',
  ARRAY[
    '{"order_id": 1001, "action": "confirm"}'::jsonb,
    '{"order_id": 1002, "action": "confirm"}'::jsonb,
    '{"order_id": 1003, "action": "confirm"}'::jsonb
  ]
);
```

#### 애플리케이션에서 발행 (JavaScript/TypeScript)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 큐에 메시지 발행
async function sendToQueue(queueName: string, message: object) {
  const { data, error } = await supabase.schema('pgmq_public').rpc('send', {
    queue_name: queueName,
    message: message,
    sleep_seconds: 0
  })
  
  if (error) throw error
  return data  // 메시지 ID 반환
}

// 사용 예시
await sendToQueue('email_notifications', {
  to: 'user@example.com',
  subject: '주문 확인',
  template: 'order_confirmed',
  data: { orderId: 1001 }
})
```

### 3.4 메시지 소비 (Read)

#### 기본 읽기

```sql
-- 1개 메시지 읽기 (가시성 타임아웃 30초)
SELECT * FROM pgmq.read(
  'email_notifications',
  30,   -- visibility timeout (초)
  1     -- 읽을 메시지 수
);

-- 읽기 결과 컬럼: msg_id, read_ct, enqueued_at, vt, message
```

#### 배치 읽기

```sql
-- 한 번에 10개 메시지 읽기
SELECT * FROM pgmq.read(
  'email_notifications',
  60,   -- 60초 가시성 타임아웃
  10    -- 최대 10개 읽기
);
```

#### Pop (읽기 + 즉시 삭제)

```sql
-- 읽는 즉시 큐에서 제거 (at-most-once 의미론)
SELECT * FROM pgmq.pop('email_notifications');
```

**주의**: `pop()`은 메시지를 읽는 즉시 삭제하므로, 처리 도중 실패하면 메시지가 영구 손실된다. 중요한 작업에는 `read()` + 확인 후 `delete()`/`archive()` 패턴을 권장한다.

### 3.5 가시성 타임아웃 (Visibility Timeout)

가시성 타임아웃(VT, Visibility Timeout)은 pgmq의 핵심 개념이다.

**동작 원리:**

```
[메시지 발행] → [큐에서 대기]
                      |
                      v
           [컨슈머 A: read(vt=30)]
                      |
                      v
         [30초 동안 다른 컨슈머에게 보이지 않음]
                      |
              ┌───────┴────────┐
              v                v
         [처리 성공]         [처리 실패/타임아웃]
              |                |
              v                v
         [delete/archive]  [30초 후 다시 보임]
                               |
                               v
                    [다른 컨슈머가 재처리 가능]
```

**가시성 타임아웃 조정:**

```sql
-- 긴 처리 시간이 필요한 경우 가시성 타임아웃 연장
-- 처리 중 VT를 300초로 연장 (메시지 ID 기준)
SELECT pgmq.set_vt('order_processing', 42, 300);
-- 인자: (큐 이름, 메시지 ID, 새 VT 초)
```

**적절한 VT 설정 가이드:**

| 작업 유형 | 권장 VT |
|-----------|---------|
| 이메일 발송 | 30-60초 |
| 이미지 처리 | 120-300초 |
| 데이터 동기화 | 60-180초 |
| 외부 API 호출 | 30-120초 |
| 대용량 파일 처리 | 600초 이상 |

### 3.6 메시지 삭제 및 아카이빙

#### 단일 메시지 삭제

```sql
-- 메시지 영구 삭제
SELECT pgmq.delete('email_notifications', 42);  -- 42는 msg_id
```

#### 배치 삭제

```sql
-- 여러 메시지 한 번에 삭제
SELECT pgmq.delete('email_notifications', ARRAY[42, 43, 44]);
```

#### 아카이빙 (처리 이력 보존)

```sql
-- 메시지를 삭제하지 않고 아카이브 테이블로 이동
SELECT pgmq.archive('email_notifications', 42);

-- 배치 아카이빙
SELECT pgmq.archive('email_notifications', ARRAY[42, 43, 44]);
```

아카이브된 메시지는 `pgmq.a_<queue_name>` 테이블에서 조회 가능:

```sql
-- 아카이브된 이메일 메시지 조회
SELECT * FROM pgmq.a_email_notifications
ORDER BY archived_at DESC;
```

### 3.7 Dead Letter Queue (DLQ)

pgmq는 DLQ를 네이티브로 지원하지 않지만, 별도의 큐와 애플리케이션 로직으로 구현할 수 있다.

#### DLQ 구현 패턴

```sql
-- DLQ 전용 큐 생성
SELECT pgmq.create('email_notifications_dlq');

-- 재시도 횟수를 추적하는 래퍼 함수
CREATE OR REPLACE FUNCTION consume_with_retry(
  queue_name TEXT,
  dlq_name TEXT,
  max_retries INT DEFAULT 3
) RETURNS TABLE(msg_id BIGINT, message JSONB, attempts INT)
LANGUAGE plpgsql
AS $$
DECLARE
  msg RECORD;
  retry_count INT;
BEGIN
  -- 메시지 읽기
  SELECT * INTO msg FROM pgmq.read(queue_name, 30, 1);
  
  IF msg IS NULL THEN RETURN; END IF;
  
  -- 재시도 횟수 추출 (메시지에 포함된 경우)
  retry_count := COALESCE((msg.message->>'_retry_count')::INT, 0);
  
  IF retry_count >= max_retries THEN
    -- 최대 재시도 초과 시 DLQ로 이동
    PERFORM pgmq.send(
      dlq_name,
      msg.message || jsonb_build_object(
        '_original_queue', queue_name,
        '_failed_at', NOW(),
        '_retry_count', retry_count
      )
    );
    PERFORM pgmq.delete(queue_name, msg.msg_id);
    RETURN;
  END IF;
  
  RETURN QUERY SELECT msg.msg_id, msg.message, retry_count + 1;
END;
$$;
```

#### TypeScript에서 DLQ 패턴 구현

```typescript
const MAX_RETRIES = 3

async function processQueueWithDLQ(
  queueName: string,
  dlqName: string,
  processor: (message: any) => Promise<void>
) {
  // 메시지 읽기 (VT: 60초)
  const { data: messages } = await supabase
    .schema('pgmq_public')
    .rpc('read', { queue_name: queueName, sleep_seconds: 60, n: 1 })
  
  if (!messages || messages.length === 0) return
  
  const msg = messages[0]
  const retryCount = msg.message._retry_count || 0
  
  try {
    await processor(msg.message)
    // 성공 시 아카이브
    await supabase.schema('pgmq_public')
      .rpc('archive', { queue_name: queueName, msg_id: msg.msg_id })
  } catch (error) {
    if (retryCount >= MAX_RETRIES) {
      // DLQ로 이동
      await supabase.schema('pgmq_public').rpc('send', {
        queue_name: dlqName,
        message: {
          ...msg.message,
          _retry_count: retryCount,
          _error: String(error),
          _failed_at: new Date().toISOString()
        }
      })
      await supabase.schema('pgmq_public')
        .rpc('delete', { queue_name: queueName, msg_id: msg.msg_id })
    } else {
      // 재시도 카운터 증가하여 다시 발행
      await supabase.schema('pgmq_public').rpc('send', {
        queue_name: queueName,
        message: { ...msg.message, _retry_count: retryCount + 1 },
        sleep_seconds: Math.pow(2, retryCount) * 60  // 지수 백오프
      })
      await supabase.schema('pgmq_public')
        .rpc('delete', { queue_name: queueName, msg_id: msg.msg_id })
    }
  }
}
```

### 3.8 배치 처리

#### 배치 처리 패턴

```sql
-- 한 번에 여러 메시지를 읽어 배치로 처리
CREATE OR REPLACE FUNCTION process_email_batch()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  messages RECORD;
  processed_count INT := 0;
  msg_ids BIGINT[] := '{}';
BEGIN
  -- 배치로 10개 읽기
  FOR messages IN 
    SELECT * FROM pgmq.read('email_notifications', 120, 10)
  LOOP
    -- 여기에 실제 처리 로직 (예: pgmq로 이메일 발송 큐에 재발행)
    -- 또는 별도 테이블에 일괄 삽입
    INSERT INTO email_send_log (msg_id, payload, status)
    VALUES (messages.msg_id, messages.message, 'processing');
    
    msg_ids := array_append(msg_ids, messages.msg_id);
    processed_count := processed_count + 1;
  END LOOP;
  
  -- 처리된 메시지 일괄 아카이빙
  IF array_length(msg_ids, 1) > 0 THEN
    PERFORM pgmq.archive('email_notifications', msg_ids);
  END IF;
  
  RETURN processed_count;
END;
$$;

-- 30초마다 배치 처리
SELECT cron.schedule(
  'process-email-batch',
  '30 seconds',
  'SELECT process_email_batch()'
);
```

### 3.9 Supabase Queues REST API

Supabase Queues는 pgmq 위에 REST API 레이어를 추가하여, 클라이언트 애플리케이션에서 직접 큐를 다룰 수 있다.

```typescript
// Supabase 클라이언트를 통한 큐 사용
const supabase = createClient(url, anonKey)

// 메시지 발행 (pgmq_public 스키마 사용)
const { data, error } = await supabase
  .schema('pgmq_public')
  .rpc('send', {
    queue_name: 'my_queue',
    message: { key: 'value' },
    sleep_seconds: 0
  })

// 메시지 읽기
const { data: messages } = await supabase
  .schema('pgmq_public')
  .rpc('read', {
    queue_name: 'my_queue',
    sleep_seconds: 30,
    n: 5
  })

// 메시지 삭제
await supabase
  .schema('pgmq_public')
  .rpc('delete', {
    queue_name: 'my_queue',
    msg_id: messageId
  })
```

---

## 4. 실전 사용 패턴

### 4.1 정기 리포트 생성

```sql
-- 매주 월요일 오전 8시 주간 리포트 생성
CREATE OR REPLACE FUNCTION generate_weekly_report()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  report_start DATE := date_trunc('week', CURRENT_DATE - INTERVAL '7 days')::date;
  report_end DATE := date_trunc('week', CURRENT_DATE)::date - 1;
BEGIN
  INSERT INTO weekly_reports (
    period_start, period_end, total_revenue, total_orders, new_users
  )
  SELECT
    report_start,
    report_end,
    COALESCE(SUM(amount), 0),
    COUNT(*),
    (SELECT COUNT(*) FROM auth.users WHERE created_at::date BETWEEN report_start AND report_end)
  FROM orders
  WHERE created_at::date BETWEEN report_start AND report_end;
  
  -- 리포트 생성 완료 알림을 큐에 발행
  PERFORM pgmq.send(
    'notifications',
    jsonb_build_object(
      'type', 'weekly_report_ready',
      'period_start', report_start,
      'period_end', report_end,
      'notify_emails', ARRAY['admin@example.com']
    )
  );
END;
$$;

SELECT cron.schedule('weekly-report', '0 8 * * 1', 'SELECT generate_weekly_report()');
```

### 4.2 데이터 정리 (Data Cleanup)

```sql
-- 매일 자정 데이터 정리 잡
SELECT cron.schedule(
  'daily-data-cleanup',
  '0 0 * * *',
  $$
  DO $$
  BEGIN
    -- 30일 이상된 알림 삭제
    DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- 만료된 세션 삭제
    DELETE FROM user_sessions WHERE expires_at < NOW();
    
    -- 90일 이상된 감사 로그는 아카이브 테이블로 이동
    INSERT INTO audit_logs_archive
    SELECT * FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
    
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- pg_cron 실행 이력 정리
    DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '7 days';
  END;
  $$ LANGUAGE plpgsql;
  $$
);
```

### 4.3 이메일 발송 파이프라인

```
[주문 완료 이벤트]
       |
       v
[DB 트리거: pgmq에 메시지 발행]
       |
       v
[pgmq 큐: email_notifications]
       |
       v
[pg_cron: 1분마다 폴링]
       |
       v
[Edge Function: 이메일 실제 발송 (Resend/SendGrid)]
       |
       v
[pgmq 아카이브 or DLQ]
```

```sql
-- 주문 완료 시 자동으로 큐에 이메일 발송 요청 추가하는 트리거
CREATE OR REPLACE FUNCTION enqueue_order_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    PERFORM pgmq.send(
      'email_notifications',
      jsonb_build_object(
        'type', 'order_confirmed',
        'order_id', NEW.id,
        'user_id', NEW.user_id,
        'total_amount', NEW.total_amount
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_status_email_trigger
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION enqueue_order_email();
```

### 4.4 이벤트 처리 및 웹훅

```sql
-- 5분마다 미전송 웹훅 처리
CREATE OR REPLACE FUNCTION process_webhooks()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  msg RECORD;
BEGIN
  FOR msg IN SELECT * FROM pgmq.read('webhook_events', 60, 20)
  LOOP
    -- pg_net으로 웹훅 발송
    PERFORM net.http_post(
      url := (msg.message->>'endpoint_url')::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Webhook-Secret', msg.message->>'webhook_secret'
      ),
      body := (msg.message->'payload')::jsonb
    );
    
    PERFORM pgmq.archive('webhook_events', msg.msg_id);
  END LOOP;
END;
$$;

SELECT cron.schedule('process-webhooks', '*/5 * * * *', 'SELECT process_webhooks()');
```

---

## 5. 제한사항 및 주의사항

### 5.1 스케줄 정밀도

- **최소 간격**: 1초 (sub-minute 스케줄 지원, pg_cron 1.5+)
- **정밀도**: 크론은 초 단위 정밀도가 보장되지 않는다. 시스템 부하나 DB 커넥션 상태에 따라 수 초의 지연이 발생할 수 있다
- **Time Zone**: pg_cron은 기본적으로 UTC로 동작한다. 한국 시간(KST, UTC+9)을 기준으로 스케줄을 설정하려면 9시간을 빼야 한다 (오전 9시 KST = 0시 UTC)

### 5.2 동시 실행 제한

- pg_cron은 최대 **32개 동시 잡**을 실행할 수 있다
- 각 동시 잡은 DB 커넥션 1개를 사용
- Supabase 권고사항: **동시에 최대 8개 잡**
- 각 잡의 실행 시간: **최대 10분 이내** 권고
- 잡이 겹치면(이전 실행이 끝나기 전에 다음 실행 시작) 두 인스턴스가 **동시에 실행된다** — 멱등성 확보 필요

### 5.3 플랜별 제한

| 제한 항목 | Free | Pro | Team | Enterprise |
|-----------|------|-----|------|------------|
| pg_cron 활성화 | 가능 | 가능 | 가능 | 가능 |
| 잡 수 제한 | 없음* | 없음* | 없음* | 없음* |
| 최소 스케줄 간격 | 제한 없음** | 제한 없음** | 제한 없음** | 제한 없음** |
| pgmq 큐 수 | 없음 | 없음 | 없음 | 없음 |

*실질적 제한은 DB 리소스(CPU/메모리/스토리지)로 결정된다  
**고빈도 스케줄은 DB 리소스와 `cron.job_run_details` 테이블 크기에 의해 제한된다

### 5.4 pg_cron 알려진 한계

- **멱등성 보장 없음**: 잡이 실패해도 자동 재시도 없음 — 앱 레벨에서 구현 필요
- **분산 실행 불가**: 단일 Postgres 인스턴스에서만 동작
- **크론 표현식 검증 제한**: 잘못된 표현식이 등록되면 런타임에서 에러 발생
- **time zone 지원**: pg_cron 1.4.2+에서 `cron.schedule_in_database` 활용 가능

### 5.5 pgmq 제한사항

- **메시지 크기**: 이론적 제한 없음 (JSONB 저장), 실용적으로는 1MB 이하 권장
- **순서 보장**: 큐 내 순서가 엄격히 보장되지 않음 (FIFO에 가깝지만 완전 보장 아님)
- **파티셔닝 없음**: 단일 테이블 기반으로, 수백만 건 이상에서는 성능 저하 가능
- **우선순위 큐 미지원**: 우선순위 기반 처리는 별도 구현 필요

---

## 6. 외부 큐 서비스 비교

### 6.1 종합 비교표

| 항목 | Supabase (pg_cron+pgmq) | BullMQ | RabbitMQ | AWS SQS |
|------|------------------------|--------|----------|---------|
| **인프라 추가** | 불필요 (Postgres 내장) | Redis 필요 | 별도 서버 | AWS 계정 |
| **언어 지원** | SQL/HTTP | Node.js 주력 | 다언어 | 다언어 |
| **메시지 순서** | 근사 FIFO | 정확한 FIFO (옵션) | 큐별 FIFO | FIFO 큐 지원 |
| **재시도 메커니즘** | 앱 레벨 구현 | 내장 (백오프 포함) | 내장 | 가시성 타임아웃 |
| **지연 메시지** | 지원 (초 단위) | 지원 (ms 단위) | 플러그인 필요 | 최대 15분 |
| **DLQ** | 앱 레벨 구현 | 내장 | 내장 | 내장 |
| **모니터링** | Supabase Dashboard | Bull Board | RabbitMQ Management UI | AWS Console/CloudWatch |
| **스케일링** | Postgres 수평 제한 | Redis 수평 확장 | 클러스터링 | 자동 (완전 관리형) |
| **비용 (월)** | Supabase 요금에 포함 | Redis 비용 별도 | 인프라 비용 | $0.40/100만 메시지 |
| **at-least-once** | 지원 | 지원 | 지원 | 지원 |
| **exactly-once** | 미지원 | 미지원 | 미지원 | FIFO 큐에서 지원 |

### 6.2 BullMQ vs Supabase Queues

**BullMQ 장점:**
- 정교한 작업 의존성 그래프 지원 (Flow, Parent-Child Job)
- ms 단위 지연 스케줄
- 내장 재시도 로직 (지수 백오프, 최대 재시도 횟수)
- 작업 진행률(progress) 추적
- 풍부한 이벤트 훅
- Bull Board 등 성숙한 모니터링 도구

**BullMQ 단점:**
- Redis 인프라 별도 필요 (비용, 관리 복잡성)
- Node.js 생태계에 최적화 (Python/Elixir 클라이언트 있으나 주력은 Node.js)
- Supabase 데이터와 트랜잭션 일관성 없음

**Supabase Queues 장점:**
- DB 트랜잭션 안에서 메시지 발행 가능 (원자성)
- 별도 인프라 불필요
- Postgres Row Level Security(RLS) 적용 가능
- Supabase Dashboard에서 통합 관리

### 6.3 RabbitMQ vs Supabase Queues

**RabbitMQ 장점:**
- 복잡한 라우팅 (Exchange, Binding, Routing Key)
- Pub/Sub, Point-to-Point, Topic 교환기 지원
- 프로토콜 지원 다양 (AMQP, MQTT, STOMP)
- 성숙한 클러스터링 및 미러링

**RabbitMQ 단점:**
- 별도 서버 관리 필요
- 러닝 커브 높음
- 관리형 서비스(CloudAMQP, Amazon MQ) 사용 시 비용 발생

### 6.4 AWS SQS vs Supabase Queues

**AWS SQS 장점:**
- 완전 관리형 (운영 부담 없음)
- 거의 무제한 처리량
- Lambda, EC2, ECS 등 AWS 서비스와 긴밀한 통합
- FIFO 큐에서 exactly-once 지원
- 최대 14일 메시지 보존

**AWS SQS 단점:**
- AWS 종속성
- 메시지당 비용 발생 ($0.40/100만 건)
- Supabase DB와 트랜잭션 일관성 없음 (2PC 필요)

### 6.5 언제 무엇을 선택할까?

**Supabase Cron + Queues를 선택:**
- 이미 Supabase를 사용 중이고 인프라 추가 없이 비동기 처리가 필요할 때
- DB 트랜잭션과 메시지 발행의 원자성이 필요할 때 (주문 생성과 동시에 큐에 발행)
- 규모가 크지 않은 작업 (시간당 수천 건 이하)
- 팀 규모가 작아 인프라 관리 부담을 최소화하고 싶을 때

**BullMQ를 선택:**
- Node.js/TypeScript 프로젝트이며 정교한 작업 의존성이 필요할 때
- 이미 Redis를 사용 중일 때
- 작업 진행률 추적이 필요할 때

**RabbitMQ를 선택:**
- 복잡한 메시지 라우팅이 필요할 때
- 여러 프로그래밍 언어의 컨슈머가 공존할 때
- 높은 처리량이 요구될 때

**AWS SQS를 선택:**
- AWS 생태계에 이미 깊이 통합되어 있을 때
- 수백만~수십억 건의 메시지를 처리해야 할 때
- 운영 부담을 완전히 없애고 싶을 때

---

## 참고 자료

- [Supabase Cron 공식 문서](https://supabase.com/docs/guides/cron)
- [Supabase Queues 공식 문서](https://supabase.com/docs/guides/queues)
- [pg_cron 익스텐션 문서](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [pgmq 익스텐션 문서](https://supabase.com/docs/guides/database/extensions/pgmq)
- [pg_net 익스텐션 문서](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Edge Functions 스케줄링](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase Cron 블로그 포스트](https://supabase.com/blog/supabase-cron)
- [Supabase Queues 블로그 포스트](https://supabase.com/blog/supabase-queues)
- [대용량 작업 처리 가이드](https://supabase.com/blog/processing-large-jobs-with-edge-functions)
- [pg_cron 디버깅 가이드](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz)
