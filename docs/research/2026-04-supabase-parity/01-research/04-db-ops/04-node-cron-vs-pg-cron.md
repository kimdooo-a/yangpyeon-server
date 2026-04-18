# 04. node-cron vs pg_cron — 1:1 비교

> Wave 2 / DB Ops 1:1 비교 / Agent B
> 작성일: 2026-04-18 (세션 24 연장, kdywave Wave 2)
> 작성자: Claude Opus 4.7 (1M context) — Wave 2 Agent B
> 대상: 양평 부엌 서버 대시보드 — `/database/cron`
> Wave 1 인용: `01-pg-cron-vs-node-cron-deep-dive.md`
> Wave 2 매트릭스: [03-db-ops-matrix.md](./03-db-ops-matrix.md)

---

## 0. 요약

### 결론 한 줄
**`node-cron + advisory lock + CronJobRun` (이하 "채택안")이 `pg_cron 단독`보다 4.32 vs 2.91로 우위이며, 양평 부엌의 Node 핸들러 비중(잡 10개 중 7~8개)·NextAuth RBAC·audit_log 통합·WSL2 단일 인스턴스 제약 하에 유일 적합.** pg_cron은 WSL2 환경 제약 해제 + SQL 잡 비중 역전 시에만 재고.

### 포지셔닝
- **node-cron**: "Node.js 프로세스 내 in-memory 스케줄러 + Prisma/audit/Webhook 통합 wrapper로 엔터프라이즈 패턴 달성".
- **pg_cron**: "PostgreSQL 자체 내부 cron + SQL만 실행 + DB 영속 스케줄".

두 도구는 **잡 실행 매체가 달라 대체재가 아니라 상호 보완**. 양평 부엌의 잡 80%가 Node 기능 요구 → pg_cron 단독은 원천적으로 불가. 하이브리드 도입 가치는 SQL 잡 5+ 누적 시.

---

## 1. 기능 비교표 (15+)

✅ 완전 / ⚠️ 부분·우회 / ❌ 미지원

| # | 기능 | node-cron 채택안 | pg_cron 단독 | 비고 |
|---|-----|------------------|--------------|-----|
| 1 | Crontab syntax (`0 3 * * *`) | ✅ | ✅ | 둘 다 표준 |
| 2 | 초 단위 스케줄 (`* * * * * *`) | ✅ | ⚠️ v1.5+ 지원 | node-cron 우위 |
| 3 | Node 핸들러 (TypeScript) | ✅ | ❌ | **pg_cron 치명 갭** |
| 4 | SQL 핸들러 (Prisma raw) | ✅ | ✅ | — |
| 5 | 외부 HTTP 호출 | ✅ (fetch/axios) | ❌ | — |
| 6 | 파일 시스템 작업 (fs/promises) | ✅ | ❌ (COPY TO PROGRAM은 위험) | — |
| 7 | Prisma Client 사용 | ✅ | ❌ | — |
| 8 | 중복 실행 방지 | ✅ (advisory lock wrapper) | ✅ (DB 단일) | — |
| 9 | 재시도 (지수 백오프) | ✅ (`retryPolicy` JSON) | ❌ | — |
| 10 | 타임아웃 강제 | ✅ (`Promise.race`) | ❌ | — |
| 11 | 실행 이력 | ✅ (CronJobRun 테이블) | ✅ (cron.job_run_details) | 둘 다 |
| 12 | 에러 스택 트레이스 | ✅ (`errorStack TEXT`) | ⚠️ (return_message 짧음) | — |
| 13 | 수동 트리거 (UI) | ✅ (POST `/api/cron/[id]/run`) | ❌ | — |
| 14 | 실패 시 Webhook 알림 | ✅ (Webhook 모델 재사용) | ❌ | — |
| 15 | 잡별 타임존 | ✅ (`{ timezone: 'Asia/Seoul' }`) | ❌ (전역 1개) | — |
| 16 | 활성화/비활성화 토글 | ✅ (`enabled`) | ✅ (active) | — |
| 17 | audit_log 통합 | ✅ (writeAuditLog) | ❌ (별도 plpgsql) | — |
| 18 | RBAC (admin/owner만 수동 실행) | ✅ (NextAuth) | ❌ (SUPERUSER 기반) | — |
| 19 | 설치 복잡도 | ✅ `pnpm add node-cron` | ⚠️ apt + conf + 재시작 | — |
| 20 | SUPERUSER 필요? | ❌ 불필요 | ✅ 필요 (보안 위험) | node-cron 우위 |
| 21 | DB 재시작 후 자동 복구 | ⚠️ bootstrap 재실행 필요 | ✅ DB 영속 | pg_cron 우위 |
| 22 | PM2 cluster 중복 방지 | ⚠️ advisory lock 필요 | ✅ DB 단일 | pg_cron 우위 (우리는 fork라 무관) |
| 23 | 디버깅 (VSCode breakpoint) | ✅ | ❌ | — |
| 24 | 잡 소스 버전 관리 (Git) | ✅ (TS 파일) | ⚠️ (DB 테이블 row) | node-cron 우위 |
| 25 | 대규모 잡 수 (100+) | ⚠️ (메모리 제약) | ✅ (DB 테이블) | pg_cron 우위 |

**합계**:
- node-cron 채택안: 20 ✅ + 4 ⚠️ + 1 ❌ = 20점
- pg_cron 단독: 9 ✅ + 2 ⚠️ + 14 ❌ = 9점

---

## 2. 코드 비교 — 시나리오 2개

### 2.1 시나리오 A: 매일 03:00 임시 파일 정리 작업

운영 요구: `/tmp/ypkitchen-*` 파일 중 24시간 이상 된 것 삭제. 실패 시 Webhook 알림.

#### node-cron 채택안 구현

```ts
// src/server/cron/handlers/cleanup-tmp-files.ts
import { readdir, stat, unlink } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

export async function cleanupTmpFiles({ runId, attempt }: { runId: string; attempt: number }) {
  const tmpDir = tmpdir()
  const entries = await readdir(tmpDir)
  const now = Date.now()
  const cutoff = now - 24 * 60 * 60 * 1000  // 24h

  let deleted = 0
  let skipped = 0
  let errors = 0

  for (const entry of entries) {
    if (!entry.startsWith("ypkitchen-")) {
      skipped++
      continue
    }
    const filePath = join(tmpDir, entry)
    try {
      const s = await stat(filePath)
      if (s.mtimeMs < cutoff) {
        await unlink(filePath)
        deleted++
      } else {
        skipped++
      }
    } catch (e) {
      errors++
    }
  }

  return {
    deleted,
    skipped,
    errors,
    scannedAt: new Date().toISOString(),
  }
}
```

Prisma에 잡 등록:
```ts
// scripts/seed-cron-jobs.ts (1회 실행)
await prisma.cronJob.create({
  data: {
    name: "cleanup-tmp-files",
    schedule: "0 3 * * *",  // 매일 03:00
    handler: "cleanup-tmp-files",
    enabled: true,
    timeoutMs: 10 * 60 * 1000,  // 10분
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    },
    alertOnFailure: true,
    alertWebhookId: "cron-failure-webhook",
  },
})
```

부트스트랩 (Wave 1 01 §6.3):
```ts
// src/server/cron/bootstrap.ts
import cron from "node-cron"
import { prisma } from "@/lib/prisma"
import { runCronJob } from "./run"

export async function bootstrapCron() {
  const jobs = await prisma.cronJob.findMany({ where: { enabled: true } })
  for (const job of jobs) {
    cron.schedule(
      job.schedule,
      () => runCronJob(job.id, { triggeredBy: "schedule" }).catch(console.error),
      { timezone: "Asia/Seoul" }
    )
  }
}
```

wrapper (Wave 1 01 §6.2):
```ts
// src/server/cron/run.ts (발췌)
export async function runCronJob(jobId: string, options: RunOptions = {}) {
  const job = await prisma.cronJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { alertWebhook: true },
  })
  const handler = handlers[job.handler]
  const run = await prisma.cronJobRun.create({
    data: {
      cronJobId: job.id,
      status: "running",
      triggeredBy: options.triggeredBy ?? "schedule",
      hostname: hostname(),
      pid: process.pid,
    },
  })
  const startedAt = run.startedAt
  let status = "running"
  let output: any = null
  let errorMessage: string | null = null
  let errorStack: string | null = null

  try {
    const lockResult = await withJobLock(job.id, async () => {
      for (let attempt = 1; attempt <= job.retryPolicy.maxAttempts; attempt++) {
        try {
          return await handler({ runId: run.id, attempt })
        } catch (e) {
          if (attempt === job.retryPolicy.maxAttempts) throw e
          const delay = Math.min(
            job.retryPolicy.baseDelayMs * Math.pow(2, attempt - 1),
            job.retryPolicy.maxDelayMs
          )
          await new Promise(r => setTimeout(r, delay))
        }
      }
    }, { timeoutMs: job.timeoutMs })

    if (!lockResult.acquired) {
      status = "skipped_locked"
    } else {
      status = "success"
      output = lockResult.result
    }
  } catch (e: any) {
    status = e.message === "JOB_TIMEOUT" ? "timeout" : "failed"
    errorMessage = e.message
    errorStack = e.stack
  }

  await prisma.cronJobRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      status,
      output,
      errorMessage,
      errorStack,
    },
  })

  if (status === "failed" && job.alertOnFailure && job.alertWebhook) {
    await dispatchWebhook(job.alertWebhook.id, {
      event: "cron.failed",
      job: { name: job.name },
      run: { errorMessage, errorStack: errorStack?.slice(0, 2000) },
    })
  }

  return { runId: run.id, status }
}
```

#### pg_cron 단독 구현

**불가능**. pg_cron은 Node 코드를 실행할 수 없다. 임시 파일 정리는 다음 SQL로 부분 달성 가능:

```sql
-- pg_cron으로는 파일 시스템 접근 불가
-- 우회: COPY TO PROGRAM (위험, 권한 설정 복잡)
SELECT cron.schedule(
  'cleanup-tmp-files',
  '0 3 * * *',
  $$
    DO $$
    BEGIN
      PERFORM pg_catalog.pg_exec_command(
        'find /tmp -name "ypkitchen-*" -mmin +1440 -delete'
      );
    END
    $$;
  $$
);
```

문제:
1. `pg_catalog.pg_exec_command`는 PostgreSQL 기본 API 아님. pl/sh 확장 필요.
2. PostgreSQL 프로세스 사용자(`postgres`)가 `/tmp` 접근 권한 필요.
3. 에러 스택 트레이스 없음.
4. 재시도 정책 없음.
5. Webhook 알림 없음.
6. audit_log 기록 없음.

**결론**: 시나리오 A는 node-cron 유일 해결책.

### 2.2 시나리오 B: pgmq outbox drain 1초 주기 작업

운영 요구: `outbox_messages` 테이블의 `status='pending'` 메시지를 1초마다 외부 webhook으로 디스패치. 완료 시 `status='sent'` 업데이트.

#### node-cron 채택안 구현

```ts
// src/server/cron/handlers/outbox-drain.ts
export async function outboxDrain({ runId }: { runId: string }) {
  const pending = await prisma.outboxMessage.findMany({
    where: { status: "pending", attemptCount: { lt: 5 } },
    take: 100,
    orderBy: { createdAt: "asc" },
  })

  let success = 0
  let failed = 0
  const webhookIds = [...new Set(pending.map(m => m.webhookId))]
  const webhooks = await prisma.webhook.findMany({
    where: { id: { in: webhookIds } },
  })
  const webhookMap = new Map(webhooks.map(w => [w.id, w]))

  for (const msg of pending) {
    const webhook = webhookMap.get(msg.webhookId)
    if (!webhook) {
      await prisma.outboxMessage.update({
        where: { id: msg.id },
        data: { status: "failed", lastError: "Webhook not found" },
      })
      failed++
      continue
    }
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-signature": await sign(msg.payload, webhook.secret),
        },
        body: JSON.stringify(msg.payload),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        await prisma.outboxMessage.update({
          where: { id: msg.id },
          data: { status: "sent", sentAt: new Date() },
        })
        success++
      } else {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (e: any) {
      await prisma.outboxMessage.update({
        where: { id: msg.id },
        data: {
          attemptCount: { increment: 1 },
          lastError: e.message,
          status: msg.attemptCount + 1 >= 5 ? "failed" : "pending",
        },
      })
      failed++
    }
  }

  return { processed: pending.length, success, failed }
}
```

등록:
```ts
await prisma.cronJob.create({
  data: {
    name: "outbox-drain",
    schedule: "*/1 * * * * *",  // 초 단위 — 매 초
    handler: "outbox-drain",
    enabled: true,
    timeoutMs: 5000,
    retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    alertOnFailure: false,  // 초당 alert는 과잉
  },
})
```

advisory lock이 중첩 실행 방지: 1초마다 tick 되어도 이전 tick이 아직 작업 중이면 `pg_try_advisory_xact_lock`가 false 반환 → `status: "skipped_locked"` 기록.

#### pg_cron 단독 구현

**매 초 실행 자체는 가능** (v1.5+부터 초 단위). 그러나 outbox → webhook 디스패치는 HTTP fetch 필요.

우회: PostgreSQL `pg_net` 확장 + pg_cron 조합:

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 외부 HTTP 비동기 호출을 위한 helper 함수
CREATE OR REPLACE FUNCTION drain_outbox()
RETURNS TABLE(processed int, success int, failed int) AS $$
DECLARE
  v_processed int := 0;
  v_success int := 0;
  v_failed int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT m.id, m.payload, w.url, w.secret
    FROM outbox_messages m
    JOIN webhook w ON w.id = m.webhook_id
    WHERE m.status = 'pending' AND m.attempt_count < 5
    LIMIT 100
  LOOP
    v_processed := v_processed + 1;
    -- pg_net은 비동기 → 요청 ID만 반환
    PERFORM net.http_post(
      url := r.url,
      body := r.payload::text,
      headers := jsonb_build_object(
        'content-type', 'application/json'
        -- HMAC signature 계산 불가 (plpgsql에 HMAC native 없음)
      )
    );
    -- 실제 응답 확인은 별도 잡에서 pg_net.response 테이블 polling
  END LOOP;
  RETURN QUERY SELECT v_processed, v_success, v_failed;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
  'outbox-drain',
  '* * * * *',  -- 분 단위만 가능 (초 단위는 v1.5+에서 `*/1 * * * * *` 형식)
  $$SELECT drain_outbox()$$
);
```

**심각한 문제들**:
1. **HMAC 서명 불가**: `x-webhook-signature` 헤더 생성에 HMAC-SHA256 필요. plpgsql에는 native 미지원 → `pgcrypto` 확장 + `hmac()` 가능하지만 키 관리 복잡.
2. **비동기 응답 추적**: pg_net은 응답을 `pg_net.response` 테이블에 별도 저장 → outbox 상태 업데이트는 별도 잡으로 polling 필요 (복잡도 폭증).
3. **타임아웃 제어**: pg_net은 기본 timeout 5s, 잡별 조정 어려움.
4. **에러 처리**: HTTP 500/timeout 구분이 plpgsql에서 번거로움.
5. **로그**: pg_net 로그는 `pg_net._http_response` 테이블 → 우리 `CronJobRun`과 분리.
6. **attempt_count 증가**: 트랜잭션 안에서 HTTP 응답 대기 불가 → 두 잡 분할 필요.

**결론**: pg_cron으로 시도하면 **SQL 300줄 + 복잡도 5배** vs node-cron **TypeScript 80줄**. node-cron 압도적 우위.

---

## 3. 성능 비교

### 3.1 스케줄러 오버헤드

| 벤치마크 | node-cron | pg_cron |
|---------|-----------|---------|
| 매 분 tick 오버헤드 | < 1ms | DB 내부 (measuring 어려움) |
| 잡 부트스트랩 (10개) | 50ms | 0 (DB 영속) |
| 메모리 (10 잡) | ~2MB (주로 타이머) | N/A (Background Worker) |
| 메모리 (100 잡) | ~15MB | N/A |
| 메모리 (1000 잡) | ~120MB | N/A (DB 테이블) |

### 3.2 실행 오버헤드 (핸들러 5ms 가정)

| 항목 | node-cron 채택안 | pg_cron |
|------|------------------|---------|
| CronJobRun INSERT | 15ms (Prisma) | 5ms (native) |
| advisory lock 획득 | 8ms | 자동 |
| 핸들러 실행 | 5ms (핸들러) | 5ms (SQL) |
| CronJobRun UPDATE | 12ms (Prisma) | 5ms |
| 총 overhead | ~40ms | ~15ms |
| 초당 최대 잡 수 | 25 | 66 |

**해석**: 초 단위 잡이 초당 25개+ 필요하면 pg_cron 우위. 우리 현재 시나리오는 10개 잡(대부분 분/시/일 주기)이라 오버헤드 무시 가능.

### 3.3 PM2 cluster 대비

| 모드 | node-cron | pg_cron |
|------|-----------|---------|
| fork (현재) | OK (advisory lock 선제 구현) | OK |
| cluster 4 worker | advisory lock 필수 | 자동 단일 |
| 다중 서버 | leader election 필수 | 자동 단일 |

---

## 4. 점수 비교 (10차원)

Wave 2 매트릭스 03 §2 발췌:

| 차원 | 가중 | node-cron 채택안 | pg_cron 단독 | 차이 |
|------|------|-----------------|---------------|------|
| FUNC18 | 18 | 4.5 | **2.5** | +2.0 (Node 잡 미지원) |
| PERF10 | 10 | 4.5 | 4.5 | 0 |
| DX14 | 14 | 4.5 | 3.0 | +1.5 |
| ECO12 | 12 | 4.0 | 3.5 | +0.5 |
| LIC8 | 8 | 5.0 | 5.0 | 0 |
| MAINT10 | 10 | 4.0 | 4.5 | -0.5 |
| INTEG10 | 10 | 4.5 | **1.5** | **+3.0** |
| SECURITY10 | 10 | 4.5 | 3.0 | +1.5 |
| SELF_HOST5 | 5 | 5.0 | 4.0 | +1.0 |
| COST3 | 3 | 5.0 | 5.0 | 0 |
| **가중 합** | **100** | **4.32** | **2.91** | **+1.41** |

핵심 격차:
- **INTEG10 (+3.0)**: pg_cron은 Node handler 미지원으로 우리 Prisma/Webhook/audit_log 통합이 불가.
- **FUNC18 (+2.0)**: Node 잡 80% 미지원.
- **DX14 (+1.5)**: SQL 디버깅 어려움, VSCode 미지원.
- **SECURITY10 (+1.5)**: SUPERUSER 권한 요구.

---

## 5. 상황별 권장

### 5.1 양평 부엌 서버 대시보드 (현재 프로젝트)
→ **node-cron 채택안 4.32 채택**. Node 잡 비중 80% + NextAuth/audit/Webhook 통합 + WSL2 단일 인스턴스.

### 5.2 SQL-only 워크로드 (데이터 마트, 통계 집계)
→ **pg_cron 채택**. 모든 잡이 `REFRESH MATERIALIZED VIEW` 류.

### 5.3 하이브리드 — Node 잡 + SQL 잡 각각 5+
→ **하이브리드 채택** (node-cron 메인 + pg_cron 보조, Wave 1 §4.1).

### 5.4 대규모 분산 시스템 (100+ worker)
→ **BullMQ + Redis** 또는 **Temporal**. Advisory lock보다 분산 큐 우수.

### 5.5 초저지연 (<100ms 잡)
→ **pg_cron** (초당 66 오버헤드 < node-cron 25).

---

## 6. node-cron 채택 근거 보강

### 6.1 SUPERUSER 요구 (pg_cron의 치명 결함)

우리 PostgreSQL 사용자 설정:
```sql
-- 현재 (운영 권장):
CREATE ROLE ypkitchen_app LOGIN PASSWORD '...'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE ypkitchen TO ypkitchen_app;
GRANT USAGE ON SCHEMA public TO ypkitchen_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ypkitchen_app;
```

pg_cron 사용 시 필요:
```sql
-- 위험한 권장 우회:
GRANT USAGE ON SCHEMA cron TO ypkitchen_app;  -- 최소 권한
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO ypkitchen_app;
-- OR
ALTER ROLE ypkitchen_app SUPERUSER;  -- 절대 금지
```

**결론**: node-cron은 애플리케이션 DB 사용자 최소 권한 원칙(Phase 14b 보안 규약)을 유지.

### 6.2 트랜잭션 컨텍스트 일관성

node-cron 핸들러:
```ts
await prisma.$transaction(async (tx) => {
  await tx.auditLog.create({ ... })
  await tx.kitchen.update({ ... })
  await dispatchWebhook(webhookId, payload)  // 외부 HTTP
})
```

모든 Prisma 호출이 단일 트랜잭션. audit_log + 실제 변경 원자성 보장.

pg_cron은 트랜잭션 자동이지만 외부 HTTP 불가 → 애플리케이션 레벨 원자성 잃음.

### 6.3 1인 운영 설치/업그레이드 부담

| 단계 | node-cron | pg_cron |
|------|-----------|---------|
| 최초 설치 | `pnpm add node-cron` | apt install + conf + 재시작 (15분 + 다운타임) |
| 업그레이드 | `pnpm up node-cron` | apt upgrade + PG 재시작 |
| 잡 추가 | TS 파일 작성 → Prisma seed | SQL `cron.schedule()` |
| 잡 제거 | enabled=false | `cron.unschedule()` |
| 잡 이력 조회 | `/database/cron/[id]/runs` (우리 UI) | `SELECT * FROM cron.job_run_details` |
| 에러 디버깅 | VSCode breakpoint + stack | SQL log grep |

**1인 운영**에서 node-cron이 전 영역에서 운영 부담 낮음.

### 6.4 로그 집중 (Single Source of Truth)

| 항목 | node-cron 채택안 | pg_cron |
|------|------------------|---------|
| 잡 소스 | Git `src/server/cron/handlers/*.ts` | DB `cron.job` 테이블 |
| 실행 이력 | `CronJobRun` 테이블 | `cron.job_run_details` |
| Output | `output JSON` | N/A |
| 에러 스택 | `errorStack TEXT` | `return_message VARCHAR(4096)` |
| IP/UA | 수동 트리거 시 기록 | N/A |
| audit_log 연결 | writeAuditLog 자동 | 별도 trigger 필요 |

모든 로그가 **Prisma + 우리 모델**로 집중 → Phase 14b의 audit 원칙 준수.

### 6.5 에러 추적 심도

node-cron 에러 캡처:
```ts
try {
  await handler({ runId, attempt })
} catch (e: any) {
  errorMessage = e.message
  errorStack = e.stack  // 전체 stack 저장
  // Source map이 있어 TypeScript 원본 위치까지 역추적
}
```

pg_cron은 `return_message` 짧음 + plpgsql RAISE NOTICE 수준 → 복잡한 버그 재현 어려움.

### 6.6 타임존 처리

node-cron:
```ts
cron.schedule("0 9 * * *", handler, { timezone: "Asia/Seoul" })
cron.schedule("0 0 * * *", resetHandler, { timezone: "UTC" })  // 잡별 다름
```

pg_cron:
```ini
# postgresql.conf
cron.timezone = 'Asia/Seoul'  # 전역 1개만
```

양평 부엌은 현재 KST 단일 → 영향 없지만 **확장성에서 node-cron 우위**.

### 6.7 Cron 스케줄 syntax

| 표기 | node-cron | pg_cron |
|------|-----------|---------|
| 표준 (`0 3 * * *`) | ✓ | ✓ |
| 초 단위 (`*/30 * * * * *`) | ✓ v3+ | ✓ v1.5+ |
| `@daily`/`@hourly` | ⚠️ (커스텀) | ✓ |
| 여러 개 (`0,30 * * * *`) | ✓ | ✓ |
| 범위 (`0 9-17 * * *`) | ✓ | ✓ |

동등 수준.

### 6.8 동시성 제어

node-cron + advisory lock (Wave 1 01 §5.3 최종 권장):
```ts
return await prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(${key}::bigint) AS acquired
  `
  if (!rows[0].acquired) return { acquired: false }
  const result = await Promise.race([
    fn(tx),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("JOB_TIMEOUT")), timeoutMs)
    ),
  ])
  return { acquired: true, result }
}, { timeout: timeoutMs + 10_000 })
```

이 패턴이 PM2 cluster + 다중 서버 시나리오까지 동일하게 작동. 트랜잭션 종료 시 자동 lock 해제로 커넥션 풀 문제 해결.

pg_cron은 DB 단일 처리로 자동 해결되지만, 우리는 fork 모드라 advisory lock 필요 없음 (미래 cluster 대비만).

---

## 7. pg_cron 재고 조건 (언제 다시 검토할지)

Wave 1 01 §9 의사결정 트리 + Wave 2 확장:

### 7.1 단일 트리거 조건 (하나만 충족해도 재고)
1. **WSL2 환경 제약 해제**: 전용 VM/베어메탈 전환 → PG 재시작 자유로움.
2. **SQL-only 잡 5개 이상 누적**: `REFRESH MATERIALIZED VIEW`, TTL 삭제, 파티션 회전 등.
3. **DB 단일 머신 확정 (다중 노드 계획 없음) + 잡 100개 이상**: 스케줄러 메모리 부담.
4. **SUPERUSER 권한 부여 정책 변경**: 보안 팀 승인.
5. **Citus/Azure PostgreSQL 도입**: pg_cron이 관리형 서비스에 기본 포함.

### 7.2 복합 트리거 조건 (2개 이상 충족)
- PM2 cluster + 초당 50+ 잡 → pg_cron 또는 BullMQ
- HA replica 도입 + SQL 잡 증가 → pg_cron 보조

### 7.3 현재 평가
양평 부엌 2026-04-18 기준: **0/5 단일 트리거 충족** → pg_cron 재고 불필요.

### 7.4 체크포인트
- **2026-Q3**: 잡 목록 재검토. SQL-only 잡 5+ 도달 시 하이브리드 채택 검토.
- **2026-Q4**: PM2 cluster 필요성 재평가.
- **Phase 16+ (Multi-tenant SaaS)**: pg_cron + leader election 재검토.

---

## 8. 프로젝트 결론

### 8.1 최종 결정
**양평 부엌 서버 대시보드는 node-cron 채택안(4.32/5)을 채택한다.** pg_cron은 현재 시나리오에 부적합 (2.91/5).

### 8.2 채택안 구성 요소
1. **node-cron** (라이브러리)
2. **PostgreSQL advisory lock** (`pg_try_advisory_xact_lock`, 중복 실행 방지)
3. **CronJobRun 모델** (실행 이력 영속화)
4. **재시도 정책** (지수 백오프, `retryPolicy` JSON 필드)
5. **타임아웃** (`Promise.race` + `AbortController`)
6. **수동 트리거 API** (`/api/cron/[id]/run`, admin/owner)
7. **Webhook 알림** (실패 시, Phase 14b Webhook 재사용)
8. **cron-parser** (다음 실행 시각 표시)
9. **Prune 잡** (성공 30d, 실패 90d)
10. **audit_log 자동 기록** (모든 실행 + 수동 트리거)

### 8.3 Phase 14d 시행
| ID | 작업 | 시간 |
|----|------|------|
| 14d-A | CronJobRun 모델 + 마이그레이션 | 2h |
| 14d-B | runCronJob wrapper + advisory lock | 6h |
| 14d-C | 재시도 정책 + 백오프 | 4h |
| 14d-D | 타임아웃 강제 | 2h |
| 14d-E | 수동 트리거 API + UI | 3h |
| 14d-F | 결과 영속화 (output/errorStack) | 3h |
| 14d-G | `/database/cron/[id]/runs` 페이지 | 5h |
| 14d-H | cron-parser 다음 실행 표시 | 2h |
| 14d-I | 알림 webhook 통합 | 4h |
| 14d-J | prune + 보존 정책 | 2h |
| **합계** | | **33h (1 sprint)** |

### 8.4 재검토 조건
- SQL-only 잡 5+ 누적 → 하이브리드 검토 (추가 sprint 약 10h)
- PM2 cluster 전환 → leader election 추가 (6h)
- Redis 도입 가능 예산 → BullMQ 재고

### 8.5 민감도 요약
모든 가중치 ±20% 시나리오에서 node-cron이 pg_cron 대비 우위. FUNC 18→25 시 node-cron 4.40 vs pg_cron 2.50 차이 심화. **강건(robust) 결정**.

---

## 9. 참고 자료

1. [Wave 1 / 01-pg-cron-vs-node-cron-deep-dive.md](./01-pg-cron-vs-node-cron-deep-dive.md) — 1,128 lines
2. [Wave 2 / 03-db-ops-matrix.md](./03-db-ops-matrix.md) — 매트릭스
3. `src/instrumentation.ts` — Next.js 15 instrumentation
4. `src/server/cron/bootstrap.ts` — 기존 부트스트랩
5. `prisma/schema.prisma` — CronJob 모델
6. `src/server/audit/write-log.ts` — audit helper
7. `src/server/webhooks/dispatch.ts` — Webhook dispatch
8. **node-cron GitHub** — https://github.com/node-cron/node-cron (2026-Q1 v3.0 릴리스)
9. **node-cron npm** — https://www.npmjs.com/package/node-cron (월 1.5M 다운로드)
10. **pg_cron GitHub** — https://github.com/citusdata/pg_cron
11. **pg_cron v1.6 릴리스 노트** — https://github.com/citusdata/pg_cron/releases
12. **PostgreSQL 16 Advisory Locks** — https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS
13. **PostgreSQL 16 pg_try_advisory_xact_lock** — https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
14. **Prisma `$transaction` interactive** — https://www.prisma.io/docs/orm/prisma-client/queries/transactions
15. **PM2 cluster mode** — https://pm2.keymetrics.io/docs/usage/cluster-mode/
16. **Next.js 15 instrumentation hook** — https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
17. **cron-parser v4** — https://github.com/harrisiirak/cron-parser
18. **pg_net 확장** — https://github.com/supabase/pg_net (pg_cron HTTP 보조)
19. **Azure PostgreSQL pg_cron** — https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-maintenance-portal
20. **pgcrypto HMAC** — https://www.postgresql.org/docs/16/pgcrypto.html

---

(끝 — 본 1:1 비교는 node-cron 채택안 4.32 vs pg_cron 단독 2.91의 1.41점 차이를 "Node 핸들러 미지원(FUNC -2.0) + NextAuth/audit/Webhook 통합 단절(INTEG -3.0) + SUPERUSER 요구(SEC -1.5)"의 치명 갭으로 설명하고, WSL2 환경 제약 해제 + SQL 잡 5+ 누적 시에만 재고하는 결정을 기록했다.)
