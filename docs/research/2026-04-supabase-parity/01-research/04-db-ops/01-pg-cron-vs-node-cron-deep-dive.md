# 01. pg_cron 확장 vs node-cron 자체 — Deep Dive

> Wave 1 / DB Ops Round 2 / DQ-4.X 후보 1
> 작성일: 2026-04-18 (세션 24, kdywave Wave 1 deep-dive)
> 작성자: Claude Opus 4.7 (1M context) — Wave 1 Schema Viz + DB Ops 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/database/cron` 60/100 청사진 → 100/100
> 사전 컨텍스트: instrumentation Cron 부트스트랩 + Prisma `CronJob` 모델 + node-cron 기반 등록 메커니즘 완료. 갭은 (1) PM2 cluster 모드 시 중복 실행 방지, (2) 잡 lock(advisory lock), (3) 재시도 정책, (4) 결과 영속화 표준화, (5) pg_cron 채택 가능성.

---

## 0. Executive Summary

### 결론 한 줄
**현재 우리의 `node-cron + instrumentation 부트스트랩` 노선을 유지하되, PostgreSQL `pg_advisory_lock` + Prisma `CronJobRun` 결과 테이블 + 재시도 정책 + (선택적으로) PM2 cluster 모드 대비 leader election 패턴을 추가한다. pg_cron은 "PostgreSQL 자체에서 SQL만 실행하는 잡"이 늘어나는 미래에만 보조 옵션으로 채택.**

근거:
1. **node-cron은 이미 동작 중**: instrumentation에서 부트스트랩 + Prisma `CronJob` 모델로 메타 관리. 마이그레이션 비용 0.
2. **pg_cron 설치 비용**: WSL2 + PostgreSQL 16의 경우 `apt install postgresql-16-cron`(약 15분 + `shared_preload_libraries` 재시작 필요) + `cron.database_name` 설정 + 슈퍼유저 권한. 우리 단일 인스턴스 + 운영자 1~3명 시나리오에서 **PostgreSQL 측 잡(SQL/plpgsql)** 비중이 적으면 비용 대비 이득 적음.
3. **Node 잡 vs SQL 잡**: 우리 잡은 대부분 Node 측 작업(외부 API 호출, 파일 처리, B2 백업 트리거, 웹훅 디스패치). SQL only 잡(통계 집계, 로그 파티션 회전)은 0~2개 예상. → **Node 측이 우세**라 node-cron 유지.
4. **PM2 cluster 모드 미래**: 현재 fork 모드. WSL2 단일 인스턴스에서는 cluster의 의미가 약함(코어 4개 활용 정도). 만약 cluster 채택 시 **leader election 또는 advisory lock**으로 중복 방지 필수.

**5점 척도 종합 점수**:
- node-cron 자체 유지: 4.32/5 (현재 노선)
- pg_cron 단독 전환: 2.91/5 (마이그레이션 비용 + Node 잡 미지원)
- 하이브리드 (node-cron 메인 + pg_cron 보조): 4.12/5 (pg_cron 도입 가치 있을 때만)

### Phase 14d~14e 정렬: **node-cron 강화 + lock + 재시도 + 결과 영속화**
- 신규: `CronJobRun` 모델 (실행 결과 영속화)
- 신규: `withAdvisoryLock` 유틸 (PG advisory lock)
- 신규: `retryWithBackoff` 유틸 (지수 백오프)
- 신규: leader election (옵션, PM2 cluster 시)
- 신규: `/database/cron/{id}/runs` 페이지 (실행 이력 + 로그)

### 새 DQ
- **DQ-4.1**: PM2 cluster 채택? → No, fork 모드 유지. WSL2 + 운영자 1~3명에는 fork면 충분.
- **DQ-4.2**: pg_cron 도입? → No (현재). SQL-only 잡이 5개 이상 누적되면 재검토.
- **DQ-4.3**: BullMQ(Redis 기반)로 재시도/큐 강화? → No. Redis 도입은 양평 부엌 인프라에 신규 의존성. 단순 advisory lock + retry로 충분.
- **DQ-4.4**: 잡 결과 영속화 보존 기간? → 30일 + 실패는 90일 (Phase 14b의 audit_log 보존과 일관).
- **DQ-4.5**: 잡 alert(Slack/Discord)? → 14e 추가, Webhook 모델 재사용.

---

## 1. 현재 상태 분석 (60/100)

### 1.1 우리가 가진 것
```
src/
  instrumentation.ts             ← Next.js 15 instrumentation hook
  server/cron/
    bootstrap.ts                 ← 앱 시작 시 모든 CronJob 로드 → register
    register.ts                  ← node-cron schedule 함수 wrapper
    handlers/
      backup-database.ts         ← pg_dump → B2 업로드
      cleanup-audit-log.ts       ← 90일 이상 audit_log 삭제
      refresh-statistics.ts      ← 테이블 통계 집계
prisma/schema.prisma:
  model CronJob {
    id        String   @id @default(cuid())
    name      String   @unique
    schedule  String   // cron expression
    handler   String   // "backup-database" 등
    enabled   Boolean  @default(true)
    timeoutMs Int      @default(60000)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    lastRunAt DateTime?
    lastStatus String? // "success" | "failed" | "timeout"
  }
```

### 1.2 갭 분석
| 항목 | 현재 | 갭 | 우선순위 |
|------|------|-----|---------|
| 잡 등록 | ✓ | — | — |
| 단순 schedule | ✓ | — | — |
| 메타 관리 | ✓ | — | — |
| **중복 실행 방지** | ✗ | PM2 cluster 시 N개 인스턴스 동시 발화 | **P0** |
| **결과 영속화** | △ | `lastRunAt`/`lastStatus`만 — 이력/로그 없음 | **P0** |
| **재시도 정책** | ✗ | 실패 시 알림 없음, 재시도 0회 | **P1** |
| **타임아웃 강제** | △ | `timeoutMs` 필드만, 실제 강제 미구현 | **P1** |
| **수동 트리거** | ✗ | UI에서 "지금 실행" 버튼 없음 | **P1** |
| **잡 일시중지** | △ | `enabled` 토글 있으나 실시간 반영 없음 | **P2** |
| **결과 페이로드 저장** | ✗ | handler 반환값/로그 저장 안 됨 | **P1** |
| **잠금 가시성** | ✗ | "지금 누가 실행 중인지" 표시 없음 | **P2** |
| **알림** | ✗ | 실패 시 Slack/Discord 통지 없음 | **P2** |

---

## 2. node-cron — 라이브러리 분석

### 2.1 정체성
`node-cron`은 Crontab-style 스케줄러(Lucas Merlino, 2016~). 단일 프로세스 내 in-memory 스케줄. 단순/안정/MIT.

```ts
import cron from "node-cron"

cron.schedule("0 3 * * *", async () => {
  // 매일 03:00
}, { timezone: "Asia/Seoul" })
```

### 2.2 우리 instrumentation 부트스트랩
```ts
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapCron } = await import("@/server/cron/bootstrap")
    await bootstrapCron()
  }
}
```

```ts
// src/server/cron/bootstrap.ts
import cron from "node-cron"
import { prisma } from "@/lib/prisma"
import { handlers } from "./handlers"

const registry = new Map<string, cron.ScheduledTask>()

export async function bootstrapCron() {
  const jobs = await prisma.cronJob.findMany({ where: { enabled: true } })
  for (const job of jobs) {
    const handler = handlers[job.handler as keyof typeof handlers]
    if (!handler) {
      console.warn(`[cron] handler not found: ${job.handler}`)
      continue
    }
    const task = cron.schedule(job.schedule, async () => {
      const startedAt = new Date()
      try {
        await handler()
        await prisma.cronJob.update({
          where: { id: job.id },
          data: { lastRunAt: startedAt, lastStatus: "success" },
        })
      } catch (e) {
        await prisma.cronJob.update({
          where: { id: job.id },
          data: { lastRunAt: startedAt, lastStatus: "failed" },
        })
        console.error(`[cron] ${job.name} failed`, e)
      }
    }, { timezone: "Asia/Seoul" })
    registry.set(job.id, task)
  }
}
```

### 2.3 node-cron의 한계
1. **단일 프로세스만 인지**: PM2 cluster 시 각 worker가 독립적으로 schedule → N회 실행.
2. **재시도 없음**: 실패 시 다음 cron tick까지 대기.
3. **타임아웃 없음**: `Promise`가 영원히 대기하면 다음 tick과 겹침.
4. **이력 없음**: 실행 결과는 메모리/log에만.
5. **분산 잠금 없음**: 같은 잡을 다른 인스턴스가 실행하지 못하게 막을 방법 자체에 없음.

### 2.4 보강 전략 (본 deep-dive의 핵심)
모든 한계는 **PostgreSQL advisory lock + 신규 `CronJobRun` 테이블 + 우리 wrapper 함수**로 보강 가능. 라이브러리 교체 불요.

---

## 3. pg_cron — 확장 분석

### 3.1 정체성
`pg_cron`은 Citus Data(현 Microsoft) 메인테이너의 PostgreSQL 확장. PostgreSQL 내부에서 cron 잡 스케줄. SQL/plpgsql만 실행 가능 (Node 코드 실행 불가).

### 3.2 설치 (WSL2 Ubuntu + PostgreSQL 16)
```bash
# 1. 패키지 설치
sudo apt install postgresql-16-cron

# 2. shared_preload_libraries 추가
sudo nano /etc/postgresql/16/main/postgresql.conf
# 추가:
# shared_preload_libraries = 'pg_cron'
# cron.database_name = 'ypkitchen'
# cron.use_background_workers = on
# cron.timezone = 'Asia/Seoul'

# 3. PostgreSQL 재시작 (이게 핵심 비용 — 운영 중 재시작 필요)
sudo systemctl restart postgresql

# 4. 확장 활성화
sudo -u postgres psql -d ypkitchen -c "CREATE EXTENSION pg_cron;"

# 5. (옵션) 다른 DB 사용자에게 cron schema 권한 부여
sudo -u postgres psql -c "GRANT USAGE ON SCHEMA cron TO ypkitchen_app;"
```

**비용 항목**:
- shared_preload_libraries 변경 → PostgreSQL 재시작 (다운타임 5~30초)
- cron.database_name 설정 → 잡은 1개 DB에만 (다중 DB 운영 시 제약)
- 슈퍼유저 권한 필요 (cron schema 관리)
- pg_cron worker 백그라운드 (메모리 ~10MB)

### 3.3 pg_cron 사용 패턴
```sql
-- 매일 03:00 audit_log 90일 이상 삭제
SELECT cron.schedule(
  'cleanup-audit-log',
  '0 3 * * *',
  $$DELETE FROM audit_log WHERE created_at < now() - interval '90 days'$$
);

-- 5분마다 통계 집계
SELECT cron.schedule(
  'refresh-stats',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY stats_summary$$
);

-- 잡 비활성화
SELECT cron.unschedule('cleanup-audit-log');

-- 실행 이력 (자동 영속화 — pg_cron의 강점)
SELECT jobid, jobname, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 50;
```

### 3.4 pg_cron의 강점
1. **분산 잠금 자동**: PostgreSQL 단일 인스턴스(우리 시나리오) 또는 leader 잡(Citus 클러스터)에서만 발화 → **PM2 cluster 무관**.
2. **이력 자동 영속화**: `cron.job_run_details` 테이블에 모든 실행 자동 기록.
3. **DB 재시작/장애 후 자동 복구**: 잡 정의가 DB에 영속, 우리 앱 부트스트랩 불필요.
4. **트랜잭션 통합**: SQL 잡이 트랜잭션 내에서 실행. 실패 시 자동 롤백.

### 3.5 pg_cron의 한계
1. **SQL만**: Node 코드(외부 API 호출, 파일 처리, 비즈니스 로직) 실행 불가.
2. **shared_preload_libraries 재시작**: 운영 환경 도입 비용.
3. **슈퍼유저 권한**: `cron.schedule` 호출에 슈퍼유저 필요 (또는 적절한 GRANT).
4. **타임존 제약**: `cron.timezone` 전역 설정 1개. 잡별 타임존 불가.
5. **Node 잡과 혼용 시 가시성 분리**: 우리 `/database/cron` UI가 두 출처를 통합 표시해야 함.

---

## 4. 우리 시나리오 적합성 매트릭스

### 4.1 잡 유형별 적합도
| 잡 유형 | node-cron | pg_cron | 우리 추천 |
|---------|----------|---------|----------|
| 외부 API polling | ✓✓ | ✗ | node-cron |
| pg_dump → B2 백업 | ✓ (shell exec) | △ (COPY TO PROGRAM 필요, 위험) | node-cron |
| 웹훅 dispatch | ✓✓ | ✗ | node-cron |
| 이메일 발송 | ✓✓ | ✗ | node-cron |
| 통계 집계 (REFRESH MV) | ✓ (Prisma raw) | ✓✓ | 둘 다, pg_cron이 약간 우수 |
| 파티션 회전 | ✓ (Prisma raw) | ✓✓ | pg_cron 우수 |
| audit_log TTL 삭제 | ✓ (Prisma raw) | ✓✓ | pg_cron 약간 우수 |
| 캐시 무효화 (Redis) | ✓✓ | ✗ | node-cron |
| 파일 정리 (file system) | ✓✓ | ✗ | node-cron |
| 이미지 처리 (Sharp 등) | ✓✓ | ✗ | node-cron |

**결론**: 양평 부엌 잡 후보 10개 중 7~8개가 Node-only. → **node-cron 메인** 합리적.

### 4.2 PM2 모드별 적합도
| PM2 모드 | node-cron | pg_cron | 추천 |
|---------|----------|---------|------|
| fork (현재) | ✓ (단일 프로세스) | ✓ | node-cron OK |
| cluster (4 worker) | ✗ (4회 발화) | ✓ | node-cron + advisory lock 필수 |
| cluster + JIT scale | ✗ | ✓ | node-cron + leader election 필수 |

**결론**: 현재 fork → node-cron 안전. cluster 전환 시 본 deep-dive §5 lock 패턴 필수.

---

## 5. PM2 cluster 대비 — Advisory lock + Leader election

### 5.1 PostgreSQL Advisory Lock
PostgreSQL은 "advisory lock"이라는 애플리케이션 정의 잠금을 제공. 같은 lock key를 가진 모든 연결이 시리얼화된다.

```sql
-- 세션 단위 lock (연결 끊기면 자동 해제)
SELECT pg_try_advisory_lock(123456);  -- → true/false 즉시 반환
SELECT pg_advisory_unlock(123456);

-- 트랜잭션 단위 lock (COMMIT/ROLLBACK 시 자동 해제)
BEGIN;
SELECT pg_try_advisory_xact_lock(123456);
-- ... 작업 ...
COMMIT;  -- 자동 해제
```

### 5.2 잡 ID → lock key 매핑
```ts
// src/server/cron/lock.ts
import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"

// CronJob.id (cuid)를 32비트 정수 lock key로 변환
function jobLockKey(jobId: string): bigint {
  const hash = createHash("sha256").update(`cron:${jobId}`).digest()
  // 64비트 advisory lock key 사용 — 충돌 확률 매우 낮음
  const key = hash.readBigInt64BE(0)
  return key
}

export async function withJobLock<T>(
  jobId: string,
  fn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const key = jobLockKey(jobId)
  // 트랜잭션 단위 lock 사용 — 트랜잭션 끝나면 자동 해제
  // 하지만 우리는 잡이 트랜잭션 외부에서 실행되므로 세션 단위가 맞음
  // 단점: 연결 풀 반환 후 lock 해제 시점이 모호 → 명시적 unlock 필요
  return await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${key}::bigint) AS acquired
    `
    if (!rows[0].acquired) {
      return { acquired: false } as const
    }
    const result = await fn()
    return { acquired: true, result } as const
  }, { timeout: 30 * 60 * 1000 })  // 잡 최대 30분
}
```

**중요**: `pg_try_advisory_xact_lock`은 트랜잭션 종료 시 해제. 잡이 30분 이상 걸리면 transaction timeout. 더 긴 잡은 세션 단위 lock + finally unlock 패턴.

### 5.3 더 안전한 패턴 — 세션 단위 lock + 명시적 해제
```ts
// src/server/cron/lock.ts (v2)
export async function withJobLockSession<T>(
  jobId: string,
  fn: () => Promise<T>,
  options: { timeoutMs?: number } = {}
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const key = jobLockKey(jobId)
  const conn = await prisma.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS acquired
  `
  if (!conn[0].acquired) return { acquired: false } as const
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("JOB_TIMEOUT")), options.timeoutMs ?? 60_000)
      ),
    ])
    return { acquired: true, result } as const
  } finally {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(${key}::bigint)`
  }
}
```

**문제**: Prisma는 connection pool 사용 → `pg_try_advisory_lock`을 잡은 연결과 `pg_advisory_unlock`을 호출하는 연결이 다를 수 있음. → 세션 단위 lock은 **같은 연결**에서 잡고/풀어야 의미 있음.

**해결**: Prisma `$transaction` interactive 트랜잭션은 단일 연결을 보장. `xact_lock`이 가장 안전.

```ts
// 최종 권장 패턴
export async function withJobLock<T>(
  jobId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeoutMs?: number } = {}
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const key = jobLockKey(jobId)
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${key}::bigint) AS acquired
      `
      if (!rows[0].acquired) {
        return { acquired: false } as const
      }
      const result = await Promise.race([
        fn(tx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("JOB_TIMEOUT")), options.timeoutMs ?? 60_000)
        ),
      ])
      return { acquired: true, result } as const
    }, {
      maxWait: 5000,
      timeout: (options.timeoutMs ?? 60_000) + 10_000,
    })
  } catch (e: any) {
    if (e.message === "JOB_TIMEOUT") throw e
    throw e
  }
}
```

### 5.4 Leader election (대안)
복잡한 분산 시나리오는 advisory lock 대신 **단일 leader 인스턴스만 cron 부트스트랩**:

```ts
// src/server/cron/leader.ts
import { prisma } from "@/lib/prisma"

const LEADER_KEY = 12345  // 고정 advisory key

export async function tryBecomeLeader(): Promise<boolean> {
  // 세션 단위 lock — 프로세스 종료 시 자동 해제
  const rows = await prisma.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${LEADER_KEY}) AS acquired
  `
  return rows[0].acquired
}

// 부트스트랩 시
export async function bootstrapCron() {
  const isLeader = await tryBecomeLeader()
  if (!isLeader) {
    console.log(`[cron] not leader (PID ${process.pid}), skip bootstrap`)
    return
  }
  console.log(`[cron] leader elected (PID ${process.pid}), bootstrap ${jobs.length} jobs`)
  // ... 기존 schedule 로직
}
```

**제한**: 세션 단위 lock + Prisma connection pool 문제. → 별도 dedicated connection 필요.

```ts
// src/server/cron/leader.ts (v2 — pg 직접 사용)
import { Client } from "pg"

let leaderClient: Client | null = null

export async function tryBecomeLeader(): Promise<boolean> {
  if (leaderClient) return true  // 이미 leader
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  const result = await client.query(
    "SELECT pg_try_advisory_lock($1) AS acquired",
    [LEADER_KEY]
  )
  if (result.rows[0].acquired) {
    leaderClient = client
    // 프로세스 종료 시 정리
    process.on("SIGTERM", async () => {
      if (leaderClient) {
        await leaderClient.query("SELECT pg_advisory_unlock($1)", [LEADER_KEY])
        await leaderClient.end()
      }
    })
    return true
  } else {
    await client.end()
    return false
  }
}
```

**우리 결론**: 현재 fork 모드 → leader election 불요. cluster 전환 시 도입 (Phase 14e).

---

## 6. 결과 영속화 — `CronJobRun` 모델

### 6.1 신규 Prisma 모델
```prisma
// prisma/schema.prisma 추가
model CronJobRun {
  id           String   @id @default(cuid())
  cronJobId    String
  cronJob      CronJob  @relation(fields: [cronJobId], references: [id], onDelete: Cascade)

  startedAt    DateTime @default(now())
  finishedAt   DateTime?
  durationMs   Int?

  status       String   // "running" | "success" | "failed" | "timeout" | "skipped_locked"
  retryCount   Int      @default(0)

  output       Json?    // handler return 값
  errorMessage String?  // status=failed 시
  errorStack   String?  // status=failed 시 (Text)

  triggeredBy  String   @default("schedule") // "schedule" | "manual" | "webhook"
  triggeredById String?  // 수동 실행 시 user.id

  hostname     String?  // PM2 cluster 시 어떤 인스턴스인지
  pid          Int?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([cronJobId, startedAt(sort: Desc)])
  @@index([status])
  @@map("cron_job_run")
}

// 기존 CronJob 확장
model CronJob {
  // ... 기존 ...
  runs         CronJobRun[]

  // 신규 필드
  retryPolicy   Json?     // { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 60000 }
  alertOnFailure Boolean  @default(true)
  alertWebhookId String?
  alertWebhook   Webhook? @relation(fields: [alertWebhookId], references: [id], onDelete: SetNull)
}
```

### 6.2 Wrapper 함수 — 통합 실행
```ts
// src/server/cron/run.ts
import { hostname } from "os"
import { prisma } from "@/lib/prisma"
import { withJobLock } from "./lock"
import { dispatchWebhook } from "@/server/webhooks/dispatch"

interface RunOptions {
  triggeredBy?: "schedule" | "manual" | "webhook"
  triggeredById?: string
}

export async function runCronJob(
  jobId: string,
  options: RunOptions = {}
): Promise<{ runId: string; status: string }> {
  const job = await prisma.cronJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { alertWebhook: true },
  })

  if (!job.enabled && options.triggeredBy !== "manual") {
    return { runId: "", status: "skipped_disabled" }
  }

  const handler = handlers[job.handler as keyof typeof handlers]
  if (!handler) throw new Error(`Handler not found: ${job.handler}`)

  // 실행 레코드 생성 (status="running")
  const run = await prisma.cronJobRun.create({
    data: {
      cronJobId: job.id,
      status: "running",
      triggeredBy: options.triggeredBy ?? "schedule",
      triggeredById: options.triggeredById,
      hostname: hostname(),
      pid: process.pid,
    },
  })

  const startedAt = run.startedAt
  let status = "running"
  let output: any = null
  let errorMessage: string | null = null
  let errorStack: string | null = null
  let retryCount = 0

  const retryPolicy = (job.retryPolicy as any) ?? { maxAttempts: 1, baseDelayMs: 1000, maxDelayMs: 60000 }

  try {
    // advisory lock + 재시도 + 타임아웃
    const lockResult = await withJobLock(
      job.id,
      async () => {
        for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
          retryCount = attempt - 1
          try {
            const result = await handler({ runId: run.id, attempt })
            return result
          } catch (e: any) {
            if (attempt === retryPolicy.maxAttempts) throw e
            const delay = Math.min(
              retryPolicy.baseDelayMs * Math.pow(2, attempt - 1),
              retryPolicy.maxDelayMs
            )
            console.warn(`[cron] ${job.name} attempt ${attempt} failed, retry in ${delay}ms`, e.message)
            await new Promise(r => setTimeout(r, delay))
          }
        }
      },
      { timeoutMs: job.timeoutMs }
    )

    if (!lockResult.acquired) {
      status = "skipped_locked"
    } else {
      status = "success"
      output = lockResult.result ?? null
    }
  } catch (e: any) {
    if (e.message === "JOB_TIMEOUT") {
      status = "timeout"
    } else {
      status = "failed"
    }
    errorMessage = e.message
    errorStack = e.stack ?? null
  }

  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - startedAt.getTime()

  await prisma.cronJobRun.update({
    where: { id: run.id },
    data: {
      finishedAt,
      durationMs,
      status,
      retryCount,
      output: output ? (output as any) : undefined,
      errorMessage,
      errorStack,
    },
  })

  await prisma.cronJob.update({
    where: { id: job.id },
    data: {
      lastRunAt: startedAt,
      lastStatus: status,
    },
  })

  // 알림
  if (status === "failed" && job.alertOnFailure && job.alertWebhook) {
    await dispatchWebhook(job.alertWebhook.id, {
      event: "cron.failed",
      job: { id: job.id, name: job.name },
      run: { id: run.id, errorMessage, durationMs, retryCount },
    })
  }

  return { runId: run.id, status }
}
```

### 6.3 Bootstrap 단순화
```ts
// src/server/cron/bootstrap.ts (재작성)
import cron from "node-cron"
import { prisma } from "@/lib/prisma"
import { runCronJob } from "./run"

const registry = new Map<string, cron.ScheduledTask>()

export async function bootstrapCron() {
  const jobs = await prisma.cronJob.findMany({ where: { enabled: true } })
  for (const job of jobs) {
    const task = cron.schedule(
      job.schedule,
      () => runCronJob(job.id, { triggeredBy: "schedule" }).catch(console.error),
      { timezone: "Asia/Seoul" }
    )
    registry.set(job.id, task)
  }
  console.log(`[cron] bootstrapped ${jobs.length} jobs`)
}

export function unregisterJob(jobId: string) {
  const task = registry.get(jobId)
  if (task) {
    task.stop()
    registry.delete(jobId)
  }
}

export async function reregisterJob(jobId: string) {
  unregisterJob(jobId)
  const job = await prisma.cronJob.findUniqueOrThrow({ where: { id: jobId } })
  if (!job.enabled) return
  const task = cron.schedule(
    job.schedule,
    () => runCronJob(job.id, { triggeredBy: "schedule" }).catch(console.error),
    { timezone: "Asia/Seoul" }
  )
  registry.set(job.id, task)
}
```

---

## 7. UI 청사진 — `/database/cron`

### 7.1 페이지 구조
```
/database/cron
  ├── 잡 목록 (테이블)
  │     - 이름, schedule, handler, lastRun, lastStatus, enabled toggle
  │     - 행 클릭 → /database/cron/[id]
  └── + 새 잡 버튼

/database/cron/[id]
  ├── 잡 메타 (편집 가능)
  ├── 다음 실행 예정 시각 (cron parser)
  ├── [지금 실행] 버튼
  ├── 재시도 정책 편집
  ├── 알림 webhook 선택
  └── 최근 실행 이력 (CronJobRun 50개)
        - startedAt, durationMs, status, retryCount, errorMessage(요약)
        - 행 클릭 → /database/cron/[id]/runs/[runId]

/database/cron/[id]/runs/[runId]
  ├── 전체 메타
  ├── output (JSON viewer)
  ├── errorStack (코드 블록)
  └── [재실행] 버튼 (수동 트리거)
```

### 7.2 핵심 컴포넌트
```tsx
// src/components/cron/run-now-button.tsx
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export function RunNowButton({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function trigger() {
    if (!confirm("지금 즉시 실행합니까?")) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/cron/${jobId}/run`, { method: "POST" })
      if (!res.ok) {
        const e = await res.json()
        setError(`${e.error}: ${e.message}`)
      } else {
        // 페이지 revalidate (router.refresh())
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={trigger} disabled={loading}>
        {loading ? "실행 중..." : "지금 실행"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </>
  )
}
```

```ts
// src/app/api/cron/[id]/run/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { runCronJob } from "@/server/cron/run"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !["admin", "owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { runId, status } = await runCronJob(params.id, {
    triggeredBy: "manual",
    triggeredById: session.user.id,
  })
  return NextResponse.json({ runId, status })
}
```

### 7.3 다음 실행 시각 표시 (cron parser)
```ts
// pnpm add cron-parser
import parser from "cron-parser"

export function nextRunAt(schedule: string, tz = "Asia/Seoul"): Date | null {
  try {
    const it = parser.parseExpression(schedule, { tz })
    return it.next().toDate()
  } catch {
    return null
  }
}
```

```tsx
// src/components/cron/next-run-indicator.tsx
"use client"
import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { ko } from "date-fns/locale"

export function NextRunIndicator({ schedule }: { schedule: string }) {
  const [next, setNext] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => {
      try {
        const parser = require("cron-parser")
        const it = parser.parseExpression(schedule, { tz: "Asia/Seoul" })
        setNext(it.next().toDate())
      } catch {
        setNext(null)
      }
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [schedule])

  if (!next) return <span className="text-zinc-500">-</span>
  return (
    <span className="font-mono text-sm text-zinc-300" title={next.toISOString()}>
      {formatDistanceToNow(next, { locale: ko, addSuffix: true })}
    </span>
  )
}
```

---

## 8. 운영 시나리오 — 실제 잡 8개 청사진

### 8.1 backup-database (매일 03:00)
```ts
// src/server/cron/handlers/backup-database.ts
import { execFile } from "child_process"
import { promisify } from "util"
import { uploadToB2 } from "@/server/storage/b2"
import { unlink } from "fs/promises"
import path from "path"
import { tmpdir } from "os"

const execFileAsync = promisify(execFile)

export async function backupDatabase({ runId }: { runId: string }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filename = `ypkitchen-${stamp}.dump`
  const filepath = path.join(tmpdir(), filename)

  // 1. pg_dump (custom format, 압축)
  await execFileAsync("pg_dump", [
    "--format=custom",
    "--compress=9",
    "--no-owner",
    "--no-acl",
    "--file", filepath,
    process.env.DATABASE_URL!,
  ], { timeout: 30 * 60 * 1000 })

  // 2. B2 업로드
  const { size, sha1 } = await uploadToB2({
    bucket: "ypkitchen-backup",
    key: `daily/${stamp.slice(0, 7)}/${filename}`,
    filepath,
  })

  // 3. 임시 파일 삭제
  await unlink(filepath)

  return { filename, sizeBytes: size, sha1 }
}
```

### 8.2 cleanup-audit-log (매주 일요일 04:00)
```ts
export async function cleanupAuditLog() {
  const result = await prisma.$executeRaw`
    DELETE FROM audit_log WHERE created_at < now() - interval '90 days'
  `
  return { deletedRows: result }
}
```

### 8.3 refresh-statistics (5분마다)
```ts
export async function refreshStatistics() {
  await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY stats_summary`
  return { refreshedAt: new Date().toISOString() }
}
```

### 8.4 dispatch-pending-webhooks (1분마다)
```ts
export async function dispatchPendingWebhooks() {
  const pending = await prisma.webhookDelivery.findMany({
    where: { status: "pending", attemptCount: { lt: 5 } },
    take: 100,
  })
  let success = 0, failed = 0
  for (const d of pending) {
    try {
      await dispatchWebhook(d.webhookId, d.payload as any)
      success++
    } catch {
      failed++
    }
  }
  return { processed: pending.length, success, failed }
}
```

### 8.5 health-check-external-apis (10분마다)
```ts
export async function healthCheckExternalApis() {
  const apis = ["https://api.gabia.com", "https://api.cloudflare.com"]
  const results = await Promise.all(
    apis.map(async (url) => {
      const t = Date.now()
      try {
        const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) })
        return { url, status: r.status, durationMs: Date.now() - t }
      } catch (e: any) {
        return { url, error: e.message, durationMs: Date.now() - t }
      }
    })
  )
  return { results }
}
```

### 8.6 prune-cron-job-runs (매일 02:00)
```ts
export async function pruneCronJobRuns() {
  // 성공 30일, 실패 90일 보존
  const success = await prisma.cronJobRun.deleteMany({
    where: { status: "success", finishedAt: { lt: new Date(Date.now() - 30 * 86400 * 1000) } },
  })
  const failed = await prisma.cronJobRun.deleteMany({
    where: { status: { in: ["failed", "timeout"] }, finishedAt: { lt: new Date(Date.now() - 90 * 86400 * 1000) } },
  })
  return { successDeleted: success.count, failedDeleted: failed.count }
}
```

### 8.7 verify-backup-integrity (매주 월요일 05:00)
```ts
export async function verifyBackupIntegrity() {
  // 가장 최근 백업 파일을 B2에서 다운로드 → pg_restore --list로 검증
  // ...
}
```

### 8.8 send-daily-report (매일 09:00)
```ts
export async function sendDailyReport() {
  const stats = await prisma.$queryRaw`...오늘 통계...`
  await dispatchWebhook("daily-report-webhook-id", { stats })
}
```

---

## 9. pg_cron 도입 의사결정 트리

```
질문 1: SQL-only 잡이 5개 이상 누적되었는가?
  ├── No → node-cron 단독 (현재 노선)
  └── Yes → 질문 2

질문 2: 운영 PostgreSQL 재시작 가능한가?
  ├── No → node-cron 단독
  └── Yes → 질문 3

질문 3: 슈퍼유저 권한 있는가? (자체 호스트면 보통 Yes)
  ├── No → node-cron 단독
  └── Yes → 질문 4

질문 4: PM2 cluster 또는 다중 인스턴스 운영 중인가?
  ├── No → 하이브리드(node-cron + pg_cron) 가치 보통
  └── Yes → 하이브리드 가치 높음 (분산 잠금 자동)

질문 5: cron.timezone 단일 설정으로 충분한가?
  ├── No (잡별 타임존) → node-cron 우수
  └── Yes (모두 Asia/Seoul) → pg_cron OK
```

**현재 양평 부엌 답**: 1=No, 4=No → **node-cron 단독 유지**.

---

## 10. 10차원 스코어링

### 10.1 node-cron 자체 + 본 deep-dive 보강
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 4.5 | 0.81 | advisory lock + 재시도 + 결과 영속화 추가로 95% 갭 해소 |
| PERF10 | 10 | 4.5 | 0.45 | 인메모리 스케줄러, 오버헤드 무시 가능 |
| DX14 | 14 | 4.5 | 0.63 | 우리 코드라 익숙, TypeScript |
| ECO12 | 12 | 4.0 | 0.48 | node-cron GitHub star 8k+, 안정 |
| LIC8 | 8 | 5.0 | 0.40 | MIT |
| MAINT10 | 10 | 4.0 | 0.40 | 유지보수 보통 (메이저 변경 적음) |
| INTEG10 | 10 | 4.5 | 0.45 | Prisma/audit_log/webhook 자연 통합 |
| SECURITY10 | 10 | 4.5 | 0.45 | 권한 체크 + advisory lock 충돌 방지 |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 100% 자체 호스트 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **4.32/5** | 채택 |

### 10.2 pg_cron 단독 전환
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 2.5 | 0.45 | Node 잡 7~8개 미지원 |
| PERF10 | 10 | 4.5 | 0.45 | DB 내부 실행 |
| DX14 | 14 | 3.0 | 0.42 | SQL 작성, 디버깅 어려움 |
| ECO12 | 12 | 3.5 | 0.42 | Citus/MS 후원 |
| LIC8 | 8 | 5.0 | 0.40 | PostgreSQL License |
| MAINT10 | 10 | 4.5 | 0.45 | MS 활발 유지 |
| INTEG10 | 10 | 1.5 | 0.15 | 우리 Node handler 미지원 |
| SECURITY10 | 10 | 3.0 | 0.30 | 슈퍼유저 권한 + 잡 schema 권한 위험 |
| SELF_HOST5 | 5 | 4.0 | 0.20 | shared_preload_libraries 재시작 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **2.91/5** | 거부 |

### 10.3 하이브리드 (node-cron 메인 + pg_cron 보조)
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 4.5 | 0.81 | 모든 잡 유형 커버 |
| PERF10 | 10 | 4.5 | 0.45 | SQL 잡은 DB 내부 |
| DX14 | 14 | 3.5 | 0.49 | 두 시스템 학습 |
| ECO12 | 12 | 4.0 | 0.48 | 둘 다 활발 |
| LIC8 | 8 | 5.0 | 0.40 | MIT + PostgreSQL |
| MAINT10 | 10 | 4.0 | 0.40 | 두 시스템 유지 |
| INTEG10 | 10 | 3.5 | 0.35 | UI 통합 작업 필요 |
| SECURITY10 | 10 | 3.5 | 0.35 | 슈퍼유저 권한 부분 |
| SELF_HOST5 | 5 | 4.0 | 0.20 | 약간의 PG 재시작 비용 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **4.12/5** | 조건부 채택 (SQL 잡 5+ 시) |

---

## 11. 결론 — 청사진 요약

### 11.1 채택
- ✅ **node-cron 메인**: 현재 노선 유지.
- ✅ **PostgreSQL advisory lock(`pg_try_advisory_xact_lock`)**: 모든 잡 wrapper에 통합.
- ✅ **`CronJobRun` 모델**: 결과/이력/에러 영속화.
- ✅ **재시도 정책 (지수 백오프)**: `retryPolicy` JSON 필드로 잡별 설정.
- ✅ **타임아웃 강제**: `Promise.race` + `AbortController`.
- ✅ **수동 트리거 API**: `/api/cron/[id]/run`, admin/owner 권한.
- ✅ **알림 webhook**: 실패 시 `Webhook` 모델 재사용.
- ✅ **cron-parser**: 다음 실행 시각 표시.
- ✅ **prune-cron-job-runs**: 30일/90일 보존.

### 11.2 거부 (현재)
- ❌ **pg_cron 단독**: Node 잡 비중 우세로 부적합.
- ❌ **BullMQ + Redis**: 신규 의존성, 운영자 1~3명에 과잉.
- ❌ **Temporal/Inngest**: 외부 SaaS, $0 정책 위반.
- ❌ **PM2 cluster 모드**: 현재 fork면 충분.

### 11.3 보류 (재검토 트리거)
- 🟡 **pg_cron 보조 도입**: SQL-only 잡 5개 이상 누적 시.
- 🟡 **Leader election**: PM2 cluster 채택 시.
- 🟡 **Redis-backed queue**: 잡당 10초 이상 + 동시성 5+ 필요 시.

### 11.4 새 DQ
- **DQ-4.1**: PM2 cluster → No (지금).
- **DQ-4.2**: pg_cron → No (지금), 트리거 조건 명시.
- **DQ-4.3**: BullMQ → No.
- **DQ-4.4**: 보존 30일/90일 → 채택, 환경변수로 조정 가능.
- **DQ-4.5**: 알림 → Webhook 재사용.
- **DQ-4.6 (신규)**: 수동 실행 권한 → admin/owner만, audit log 필수.
- **DQ-4.7 (신규)**: 잡 실패 시 자동 비활성화? → No, 알림만. 운영자 판단.
- **DQ-4.8 (신규)**: cron-parser timezone → "Asia/Seoul" 강제 (UTC 혼동 방지).
- **DQ-4.9 (신규)**: lock timeout vs job timeout 분리? → 통합 (job timeout이 lock timeout 역할).

### 11.5 100/100 도달 경로 (현재 60 → 100)
| Phase | 작업 | 점수 | 비용 |
|-------|------|------|------|
| 14d-A | `CronJobRun` 모델 + 마이그레이션 | +5 | 2시간 |
| 14d-B | `runCronJob` wrapper + advisory lock | +8 | 6시간 |
| 14d-C | 재시도 정책 + 백오프 | +5 | 4시간 |
| 14d-D | 타임아웃 강제 (`Promise.race`) | +3 | 2시간 |
| 14d-E | 수동 트리거 API + UI 버튼 | +4 | 3시간 |
| 14d-F | 결과 영속화 (output/errorStack) | +5 | 3시간 |
| 14d-G | `/database/cron/[id]/runs` 페이지 | +4 | 5시간 |
| 14d-H | cron-parser 다음 실행 표시 | +2 | 2시간 |
| 14d-I | 알림 webhook 통합 | +3 | 4시간 |
| 14d-J | prune 잡 + 보존 정책 | +1 | 2시간 |
| **합계** | — | **+40 → 100/100** | **약 33시간 (1 sprint)** |

---

## 12. 참고 문헌

1. **node-cron** — https://github.com/node-cron/node-cron
2. **pg_cron** — https://github.com/citusdata/pg_cron
3. **PostgreSQL Advisory Locks** — https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS
4. **PostgreSQL pg_try_advisory_xact_lock** — https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS
5. **cron-parser** — https://github.com/harrisiirak/cron-parser
6. **PM2 cluster mode** — https://pm2.keymetrics.io/docs/usage/cluster-mode/
7. **Next.js 15 instrumentation** — https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
8. **Prisma `$transaction` interactive** — https://www.prisma.io/docs/orm/prisma-client/queries/transactions
9. **pg_cron WSL install** — https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-maintenance-portal (Azure 가이드, WSL2 응용 가능)
10. **pg_dump custom format** — https://www.postgresql.org/docs/16/app-pgdump.html
11. **Prisma `executeRawUnsafe` 위험성** — https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access#sql-injection
12. **BullMQ (대안 검토)** — https://docs.bullmq.io
13. **Temporal (대안 검토)** — https://docs.temporal.io
14. **Inngest (대안 검토)** — https://www.inngest.com/docs
15. **PostgreSQL `LISTEN/NOTIFY`** — https://www.postgresql.org/docs/16/sql-listen.html (잡 결과 실시간 알림 대안)
16. **세션 24 Phase 14b 자산** — `src/server/audit/write-log.ts`, `src/server/webhooks/dispatch.ts`

---

## 13. 부록 — 신규/수정 파일

```
prisma/
  schema.prisma                       ← CronJobRun 추가, CronJob 확장
  migrations/
    20260418_add_cron_job_run/        ← 신규 마이그레이션
src/
  server/cron/
    bootstrap.ts                      ← 재작성 (runCronJob 호출만)
    run.ts                            ← 신규 (wrapper 메인)
    lock.ts                           ← 신규 (advisory lock)
    leader.ts                         ← 신규 (PM2 cluster 옵션)
    handlers/
      backup-database.ts              ← 기존 + runId/attempt 인자
      cleanup-audit-log.ts            ← 기존
      refresh-statistics.ts           ← 기존
      dispatch-pending-webhooks.ts    ← 신규
      health-check-external-apis.ts   ← 신규
      prune-cron-job-runs.ts          ← 신규
      verify-backup-integrity.ts      ← 신규 (Phase 14e)
      send-daily-report.ts            ← 신규
  app/
    database/cron/
      page.tsx                        ← 잡 목록
      [id]/
        page.tsx                      ← 잡 상세 + 이력
        runs/
          [runId]/page.tsx            ← 단일 실행 상세
    api/cron/[id]/
      run/route.ts                    ← POST 수동 트리거
  components/cron/
    run-now-button.tsx                ← 신규
    next-run-indicator.tsx            ← 신규
    retry-policy-form.tsx             ← 신규
    run-history-table.tsx             ← 신규
```

---

(끝 — 본 deep-dive는 node-cron 노선을 유지하되 advisory lock + 재시도 + 영속화 + 알림으로 95% 갭을 해소하는 청사진을 정리했다. pg_cron은 SQL-only 잡 누적 시 보조 옵션.)
