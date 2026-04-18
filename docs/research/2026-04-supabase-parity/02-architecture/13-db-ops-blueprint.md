# 13. DB Ops Blueprint — 양평 부엌 서버 대시보드

> Wave 4 · Tier 2 · B6 (DB 관리 클러스터) 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-B6)
> 작성자: Claude Sonnet 4.6 — Wave 4 Agent B6
> 카테고리: 4 — DB Ops (Cron + Backups + Webhooks)
> 상위: [02-architecture/](./) → [CLAUDE.md](../../../../CLAUDE.md)
> 연관: [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md) · [../00-vision/02-functional-requirements.md](../00-vision/02-functional-requirements.md)
> 입력 문서: [../01-research/04-db-ops/](../01-research/04-db-ops/) 4개 문서

---

## 1. 요약 (Executive Summary)

### 1.1 현황 및 목표

| 항목 | 현재 | 목표 |
|------|------|------|
| 카테고리 점수 | **60점** | **95점** |
| 갭 | 35점 | — |
| ADR 기준 | ADR-005 (Accepted) | 동일 유지 |
| 예상 공수 | — | **~68시간** (Phase 20) |
| RPO 목표 | 24h (pg_dump 현재) | **60초** |
| RTO 목표 | 미정 | **30분** |

DB Ops는 14 카테고리 중 **Level 5 (통합 계층)** 에 속하며 다른 카테고리와 독립적으로 구현 가능하다. Phase 20에서 60 → 95점 달성을 목표로 한다.

### 1.2 결론 3줄

1. **채택안 확정**: Cron = `node-cron + PG advisory lock + CronJobRun 영속화`; Backup = `wal-g + Backblaze B2 + libsodium 암호화`. pg_cron 및 pgBackRest 거부 (ADR-005 유지).
2. **Cron은 PM2 fork 모드 전용 앱으로 분리**: `cron-worker` 프로세스를 별도 PM2 entry로 관리하여 cluster 모드에서의 중복 실행을 구조적으로 방지.
3. **DQ 8건 전부 답변 완료**: DQ-4.5, DQ-4.9, DQ-4.11, DQ-4.18, DQ-4.19, DQ-4.20, DQ-4.21, DQ-4.23을 본 문서 §10에서 확정한다.

---

## 2. Wave 1-2 채택안 확인

### 2.1 Wave 1 채택안 (점수 기준)

| 기술 | Wave 1/2 점수 | 채택 여부 | 역할 |
|------|--------------|----------|------|
| node-cron + advisory lock + CronJobRun | **4.32/5** | 채택 | 스케줄 작업 오케스트레이터 |
| wal-g + B2 + libsodium + pg_dump 보조 | **4.41/5** | 채택 | PITR 백업 + WAL 아카이빙 |
| 하이브리드 (node-cron + pg_cron 보조) | 4.12/5 | 보류 | SQL 잡 5개+ 시 재검토 |
| pg_cron 단독 | 2.91/5 | 거부 | WSL2 단일 인스턴스 + Node 잡 비율 70%+ |
| BullMQ (Redis) | 2.75/5 | 거부 | Redis 추가 의존성, advisory lock으로 충분 |
| pgBackRest | 3.78/5 | 보류 | HA 시나리오, 현재 단일 노드 과잉 |

### 2.2 ADR-005 핵심 결정 재확인

**pg_cron 거부 기술적 이유 4가지**:

1. **Node 잡 비율 70~80%**: 양평 부엌 잡 후보 10개 중 7~8개가 Node TypeScript 전용(B2 업로드, 외부 API 호출, 웹훅 디스패치 등). pg_cron은 SQL 잡에 특화 → Node 잡마다 `pg_notify` + Node 핸들러 추가 필요. 구조적 불일치.
2. **WSL2 단일 인스턴스 과잉**: `shared_preload_libraries`에 `pg_cron` 추가 → PostgreSQL 재시작 필요. 단일 DB에 SUPERUSER 권한 요구. 1인 운영 환경에서 불필요한 관리 부담.
3. **advisory lock으로 충분**: PM2 cluster → fork 모드로 전환 + advisory lock으로 중복 실행 방지. pg_cron의 DB 내 잠금과 동등한 보장.
4. **TypeScript 네이티브**: node-cron은 `pnpm add node-cron`으로 즉시 사용, Prisma/Zod와 자연 통합.

---

## 3. 컴포넌트 아키텍처

### 3.1 컴포넌트 트리

```
src/lib/db-ops/
├── cron/
│   ├── cron-orchestrator.ts     ← node-cron 인스턴스 관리자
│   ├── lock-manager.ts          ← PG advisory lock (SHA-256 기반)
│   ├── job-registry.ts          ← 잡 정의 카탈로그
│   ├── job-runner.ts            ← 단일 잡 실행 + output 캡처
│   ├── retry-handler.ts         ← 지수 백오프 재시도
│   └── cron-worker-entry.ts     ← PM2 fork 진입점 (cluster 분리)
│
├── webhook/
│   ├── webhook-dispatcher.ts    ← HTTP 발송 + retry
│   ├── dead-letter-handler.ts   ← DLQ 처리
│   ├── hmac-signer.ts           ← HMAC-SHA256 서명 (secret 기반)
│   └── notification/
│       ├── slack-notifier.ts    ← Slack webhook 알림
│       └── discord-notifier.ts  ← Discord webhook 알림
│
├── backup/
│   ├── backup-service.ts        ← wal-g 래퍼 (full/incremental/WAL)
│   ├── restore-service.ts       ← wal-g restore + staging 검증
│   ├── backup-scheduler.ts      ← 자동 백업 cron 연결
│   └── wal-archiver.ts          ← WAL 아카이빙 (archive_command)
│
└── ui/
    ├── cron-dashboard/          ← /dashboard/database/cron
    ├── webhook-dashboard/       ← /dashboard/database/webhooks
    └── backup-dashboard/        ← /dashboard/database/backups
```

### 3.2 서비스 경계

```
┌─────────────────────────────────────────────────────────┐
│ Next.js 16 (PM2 fork, port 3000)                        │
│  ├── App Router (UI + Server Actions)                    │
│  └── Route Handlers (/api/cron, /api/backups, ...)      │
└───────────────────────────────────────────────────────── ┘
               ↕ Prisma 7 (PG 연결)
┌─────────────────────────────────────────────────────────┐
│ cron-worker (PM2 fork, 별도 프로세스)                   │
│  ├── CronOrchestrator (node-cron 인스턴스)               │
│  ├── LockManager (PG advisory lock)                      │
│  └── BackupScheduler (wal-g 트리거)                      │
└─────────────────────────────────────────────────────────┘
               ↕ pg 드라이버 직접 (advisory lock)
┌─────────────────────────────────────────────────────────┐
│ PostgreSQL 17 (WAL 아카이빙 활성)                       │
│  archive_command = wal-g wal-push %p                    │
└─────────────────────────────────────────────────────────┘
               ↕ wal-g 바이너리
┌─────────────────────────────────────────────────────────┐
│ Backblaze B2 (S3 호환, $0.006/GB)                       │
│  ├── base-backups/                                       │
│  └── wal-archive/                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Cron 구조 — PM2 cluster:4 단일 실행 보장

### 4.1 PM2 ecosystem 설정

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'yangpyeong-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 4,           // cluster 모드 (웹 서버)
      exec_mode: 'cluster',
      env: { PORT: 3000, NODE_ENV: 'production' },
    },
    {
      name: 'cron-worker',
      script: 'dist/lib/db-ops/cron/cron-worker-entry.js',
      instances: 1,           // 반드시 단일 인스턴스 (fork 모드)
      exec_mode: 'fork',      // ADR-005: fork 필수 (cron 중복 방지)
      env: { NODE_ENV: 'production' },
      watch: false,
      restart_delay: 5000,    // 재시작 간격 5초 (advisory lock 해제 대기)
    },
  ],
}
```

> **왜 fork 모드인가**: cluster 모드에서 cron-worker가 N개 복제되면 같은 잡이 N번 실행된다. fork 모드(instances: 1)로 단일 프로세스만 실행하여 이를 구조적으로 방지한다.

### 4.2 LockManager — Advisory Lock (SHA-256)

```typescript
// src/lib/db-ops/cron/lock-manager.ts
import crypto from 'node:crypto'
import type { Pool } from 'pg'

export class LockManager {
  constructor(private pool: Pool) {}

  /**
   * DQ-4.20: advisory lock key = SHA-256(jobName) 하위 64비트
   * SHA-256은 256비트이지만 PG advisory lock은 bigint(64비트) 사용.
   * 하위 8바이트를 BigInt로 변환. 충돌 확률: 2^32 잡까지 ~0%.
   *
   * 근거: birthday paradox 공식 P(collision) ≈ n²/2^64
   * n=100 잡: P ≈ 100²/2^64 ≈ 5.4×10^-16 (무시 가능)
   */
  private static keyFromJobName(jobName: string): bigint {
    const hash = crypto.createHash('sha256').update(jobName).digest()
    // 하위 8바이트(64비트) → BigInt
    return hash.readBigInt64LE(24)
  }

  async tryAcquire(jobName: string): Promise<boolean> {
    const key = LockManager.keyFromJobName(jobName)
    const client = await this.pool.connect()
    try {
      const result = await client.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [key.toString()],
      )
      return result.rows[0].acquired === true
    } finally {
      client.release()
    }
  }

  async release(jobName: string): Promise<void> {
    const key = LockManager.keyFromJobName(jobName)
    const client = await this.pool.connect()
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [key.toString()])
    } finally {
      client.release()
    }
  }

  async withLock<T>(
    jobName: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const acquired = await this.tryAcquire(jobName)
    if (!acquired) {
      // 다른 인스턴스가 이미 실행 중 — 정상 건너뜀
      return null
    }
    try {
      return await fn()
    } finally {
      await this.release(jobName)
    }
  }
}
```

### 4.3 CronOrchestrator

```typescript
// src/lib/db-ops/cron/cron-orchestrator.ts
import cron from 'node-cron'
import { prisma } from '@/lib/prisma'
import { LockManager } from './lock-manager'
import { JobRunner } from './job-runner'
import { RetryHandler } from './retry-handler'

export class CronOrchestrator {
  private scheduledTasks = new Map<string, cron.ScheduledTask>()
  private lockManager: LockManager
  private jobRunner: JobRunner

  constructor() {
    this.lockManager = new LockManager(pgPool)
    this.jobRunner = new JobRunner()
  }

  async loadAndScheduleAll(): Promise<void> {
    // DB에서 활성 잡 목록 로드
    const jobs = await prisma.cronJob.findMany({
      where: { enabled: true },
    })

    for (const job of jobs) {
      this.scheduleJob(job)
    }
  }

  scheduleJob(job: CronJobRecord): void {
    if (this.scheduledTasks.has(job.id)) {
      this.scheduledTasks.get(job.id)!.destroy()
    }

    const task = cron.schedule(
      job.schedule,
      async () => {
        await this.lockManager.withLock(job.name, async () => {
          await this.executeJob(job)
        })
      },
      {
        scheduled: true,
        timezone: 'Asia/Seoul',   // DQ-4.8: Asia/Seoul 강제
      },
    )

    this.scheduledTasks.set(job.id, task)
  }

  private async executeJob(job: CronJobRecord): Promise<void> {
    const run = await prisma.cronJobRun.create({
      data: {
        jobId: job.id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    })

    const startTime = Date.now()

    try {
      const output = await this.jobRunner.run(job, {
        timeout: job.timeoutMs ?? 30_000,   // DQ-4.9: 통합 timeout
      })

      // DQ-4.19: output 10KB 초과 시 truncate + S3 링크
      const { storedOutput, s3Link } = await this.handleOutputStorage(output, run.id)

      await prisma.cronJobRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          output: storedOutput,
          outputS3Link: s3Link,
          durationMs: Date.now() - startTime,
          finishedAt: new Date(),
        },
      })

      await prisma.cronJob.update({
        where: { id: job.id },
        data: { lastRunAt: new Date(), lastStatus: 'SUCCESS' },
      })

    } catch (err) {
      const errorMessage = String(err)

      await prisma.cronJobRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMessage,
          durationMs: Date.now() - startTime,
          finishedAt: new Date(),
        },
      })

      await prisma.cronJob.update({
        where: { id: job.id },
        data: { lastRunAt: new Date(), lastStatus: 'FAILED' },
      })

      // DQ-4.5: 잡 실패 알림 (Slack webhook)
      await this.notifyFailure(job, errorMessage)

      // RetryHandler로 재시도 예약
      await RetryHandler.scheduleRetry(job, run.id, errorMessage)
    }
  }

  // DQ-4.19: output 10KB 초과 처리
  private async handleOutputStorage(
    output: string | null,
    runId: bigint,
  ): Promise<{ storedOutput: string | null; s3Link: string | null }> {
    if (!output) return { storedOutput: null, s3Link: null }

    const OUTPUT_LIMIT = 10 * 1024  // 10KB
    const encoder = new TextEncoder()

    if (encoder.encode(output).length <= OUTPUT_LIMIT) {
      return { storedOutput: output, s3Link: null }
    }

    // 10KB 초과: DB에는 앞 10KB만 저장, 전체는 B2에 업로드
    const truncated = output.slice(0, OUTPUT_LIMIT) + '\n[...truncated — see S3 link]'
    const s3Key = `cron-outputs/${runId}.txt`

    await uploadToB2(s3Key, output)
    const s3Link = `b2://${process.env.B2_BUCKET_NAME}/${s3Key}`

    return { storedOutput: truncated, s3Link }
  }

  private async notifyFailure(job: CronJobRecord, errorMessage: string): Promise<void> {
    // DQ-4.5: Slack webhook 알림
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) return

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `❌ Cron 잡 실패: *${job.name}*\n에러: \`${errorMessage.slice(0, 500)}\``,
      }),
    })
  }
}
```

### 4.4 RetryHandler — 지수 백오프

```typescript
// src/lib/db-ops/cron/retry-handler.ts

const RETRY_DELAYS_MS = [30_000, 60_000, 300_000, 900_000, 1_800_000]
// 30초, 1분, 5분, 15분, 30분 (최대 5회)

export class RetryHandler {
  static async scheduleRetry(
    job: CronJobRecord,
    failedRunId: bigint,
    reason: string,
  ): Promise<void> {
    const existingRetries = await prisma.cronJobRun.count({
      where: { jobId: job.id, status: 'FAILED', id: { gte: failedRunId } },
    })

    if (existingRetries >= RETRY_DELAYS_MS.length) {
      // 최대 재시도 초과 → DLQ에 기록
      await prisma.cronJobRun.update({
        where: { id: failedRunId },
        data: { status: 'DEAD_LETTER' },
      })
      return
    }

    const delayMs = RETRY_DELAYS_MS[existingRetries]
    const retryAt = new Date(Date.now() + delayMs)

    // node-cron one-shot 스케줄로 재시도 예약
    const dateSpec = cronExpressionFromDate(retryAt)
    cron.schedule(dateSpec, async () => {
      await orchestrator.lockManager.withLock(job.name, async () => {
        await orchestrator.executeJob(job)
      })
    }, { scheduled: true, timezone: 'Asia/Seoul' })
  }
}
```

---

## 5. Webhook — 재시도(지수 백오프) + Dead-Letter + Slack/Discord 알림

### 5.1 WebhookDispatcher

```typescript
// src/lib/db-ops/webhook/webhook-dispatcher.ts
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'

interface DispatchOptions {
  webhookId: string
  eventType: string
  payload: Record<string, unknown>
}

export class WebhookDispatcher {
  static readonly MAX_ATTEMPTS = 5
  static readonly BACKOFF_MS = [1_000, 5_000, 30_000, 300_000, 1_800_000]

  async dispatch(opts: DispatchOptions): Promise<void> {
    const webhook = await prisma.webhook.findUniqueOrThrow({
      where: { id: opts.webhookId },
    })

    if (!webhook.enabled) return

    await this.attemptDelivery(webhook, opts, 1)
  }

  private async attemptDelivery(
    webhook: WebhookRecord,
    opts: DispatchOptions,
    attempt: number,
  ): Promise<void> {
    const body = JSON.stringify({
      type: opts.eventType,
      table: webhook.sourceTable,
      record: opts.payload,
      timestamp: new Date().toISOString(),
    })

    // HMAC-SHA256 서명 생성
    const signature = webhook.secret
      ? crypto.createHmac('sha256', webhook.secret).update(body).digest('hex')
      : undefined

    let responseStatus: number | null = null
    let responseBody: string | null = null
    let succeeded = false

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': opts.eventType,
          'X-Webhook-Timestamp': String(Date.now()),
          ...(signature ? { 'X-Webhook-Signature': `sha256=${signature}` } : {}),
          ...parseJsonHeaders(webhook.headers),
        },
        body,
        signal: AbortSignal.timeout(30_000),   // 30초 타임아웃
      })

      responseStatus = response.status
      responseBody = (await response.text()).slice(0, 4096)  // 4KB 제한
      succeeded = response.ok

    } catch (err) {
      responseStatus = null
      responseBody = String(err).slice(0, 4096)
    }

    // WebhookDelivery 기록
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        eventType: opts.eventType,
        responseStatus,
        responseBody,
        attempt,
        succeeded,
        deliveredAt: new Date(),
      },
    })

    if (!succeeded) {
      await this.handleFailure(webhook, opts, attempt, responseStatus, responseBody)
    }
  }

  private async handleFailure(
    webhook: WebhookRecord,
    opts: DispatchOptions,
    attempt: number,
    status: number | null,
    body: string | null,
  ): Promise<void> {
    // failureCount 증가
    await prisma.webhook.update({
      where: { id: webhook.id },
      data: { failureCount: { increment: 1 } },
    })

    if (attempt < WebhookDispatcher.MAX_ATTEMPTS) {
      // 재시도 예약
      const delay = WebhookDispatcher.BACKOFF_MS[attempt - 1]
      setTimeout(
        () => this.attemptDelivery(webhook, opts, attempt + 1),
        delay,
      )
    } else {
      // Dead-letter: Slack 알림
      await this.notifyDeadLetter(webhook, opts, status, body)
    }
  }

  private async notifyDeadLetter(
    webhook: WebhookRecord,
    opts: DispatchOptions,
    status: number | null,
    body: string | null,
  ): Promise<void> {
    const slackUrl = process.env.SLACK_WEBHOOK_URL
    if (!slackUrl) return

    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: [
          `🚨 Webhook Dead-Letter: *${webhook.name}*`,
          `URL: \`${webhook.url}\``,
          `이벤트: ${opts.eventType}`,
          `최종 상태: HTTP ${status ?? 'timeout'}`,
          `응답: \`${String(body).slice(0, 200)}\``,
        ].join('\n'),
      }),
    })
  }
}
```

---

## 6. Backup 흐름 — wal-g full + incremental + WAL 아카이빙

### 6.1 wal-g 설정

```bash
# /etc/wal-g/wal-g.env (PM2 env_file과 별도 관리)

# B2 (S3 호환) 설정
AWS_S3_FORCE_PATH_STYLE=true
AWS_ENDPOINT=https://s3.us-west-002.backblazeb2.com
AWS_ACCESS_KEY_ID=<B2_KEY_ID>
AWS_SECRET_ACCESS_KEY=<B2_APPLICATION_KEY>
WALG_S3_PREFIX=s3://luckystyle4u-backups/wal-g

# 압축 + 암호화
WALG_COMPRESSION_METHOD=brotli
WALG_LIBSODIUM_KEY=<LIBSODIUM_KEY_HEX>   # DQ-4.15: 3중 보관

# PostgreSQL 연결
PGHOST=/var/run/postgresql
PGPORT=5432
PGDATABASE=ypkitchen
PGUSER=postgres

# 보존 정책 (DQ-4.12: 베이스 7개 + WAL 14일)
WALG_RETAIN_FULL_COUNT=7
```

### 6.2 PostgreSQL WAL 아카이빙 설정

```sql
-- postgresql.conf 설정 (DQ-4.16: archive_timeout = 60s for RPO 60s)
wal_level = replica
archive_mode = on
archive_command = 'wal-g wal-push %p'
archive_timeout = 60           -- RPO 60초 보장: 최대 60초마다 WAL 세그먼트 강제 전환
restore_command = 'wal-g wal-fetch %f %p'
```

> **DQ-4.16 근거**: `archive_timeout = 60`은 활동이 적은 시간대에도 최대 60초마다 WAL 세그먼트를 B2로 아카이빙한다. 결과적으로 RPO = 60초 보장. 디스크 I/O는 약간 증가하지만 WSL2 로컬 디스크 기준 무시 가능한 수준.

### 6.3 BackupService — wal-g 래퍼

```typescript
// src/lib/db-ops/backup/backup-service.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { prisma } from '@/lib/prisma'

const execFileAsync = promisify(execFile)

type BackupKind = 'BASE' | 'WAL_SEGMENT' | 'MANUAL'

export class BackupService {
  // wal-g 환경변수 로드 경로
  private static readonly WAL_G_ENV_FILE = '/etc/wal-g/wal-g.env'

  /**
   * BASE 백업 실행 (일요일 02:00 cron)
   * wal-g backup-push: PostgreSQL base backup을 B2에 업로드
   */
  async runFullBackup(): Promise<string> {
    const backupRecord = await prisma.backup.create({
      data: {
        kind: 'BASE',
        status: 'IN_PROGRESS',
        storageLocation: `b2://${process.env.B2_BUCKET_NAME}/wal-g`,
        startedAt: new Date(),
      },
    })

    try {
      const { stdout } = await execFileAsync('wal-g', ['backup-push', '/var/lib/postgresql/data'], {
        env: { ...process.env, ...this.loadEnv() },
        timeout: 3600_000,  // 1시간 타임아웃
      })

      // wal-g backup-list --json으로 최신 백업 메타 조회
      const meta = await this.getLatestBackupMeta()

      await prisma.backup.update({
        where: { id: backupRecord.id },
        data: {
          status: 'SUCCESS',
          startLsn: meta.start_lsn,
          endLsn: meta.end_lsn,
          sizeBytes: BigInt(meta.uncompressed_size ?? 0),
          compressedBytes: BigInt(meta.compressed_size ?? 0),
          checksum: meta.file_name,
          finishedAt: new Date(),
        },
      })

      return backupRecord.id

    } catch (err) {
      await prisma.backup.update({
        where: { id: backupRecord.id },
        data: { status: 'FAILED', errorMessage: String(err), finishedAt: new Date() },
      })
      throw err
    }
  }

  /**
   * DQ-4.21: wal-g backup-verify 실행 (토요일 03:00)
   * 백업 무결성 검증: 복원 가능한지 헤더/체크섬 확인
   */
  async verifyLatestBackup(): Promise<boolean> {
    const { stdout, stderr } = await execFileAsync(
      'wal-g',
      ['backup-verify', '--verify-integrity'],
      { env: { ...process.env, ...this.loadEnv() }, timeout: 1800_000 },
    )

    const passed = !stderr.includes('ERROR')

    // 검증 결과 audit_log에 기록
    await writeAuditLog({
      userId: 'system',
      action: 'backup.verify',
      resourceType: 'backup',
      resourceId: 'latest',
      details: { passed, stdout: stdout.slice(0, 2000) },
    })

    return passed
  }

  private loadEnv(): Record<string, string> {
    // /etc/wal-g/wal-g.env 파일 파싱
    return parseEnvFile(BackupService.WAL_G_ENV_FILE)
  }

  private async getLatestBackupMeta(): Promise<WalGBackupMeta> {
    const { stdout } = await execFileAsync(
      'wal-g', ['backup-list', '--json', '--detail'],
      { env: { ...process.env, ...this.loadEnv() } },
    )
    const list: WalGBackupMeta[] = JSON.parse(stdout)
    return list[list.length - 1]
  }
}
```

### 6.4 백업 cron 스케줄

```typescript
// src/lib/db-ops/backup/backup-scheduler.ts

export function registerBackupSchedules(orchestrator: CronOrchestrator): void {
  // 일요일 02:00: full base backup
  orchestrator.scheduleBuiltIn({
    name: '__system_backup_full',
    schedule: '0 2 * * 0',    // 매주 일요일 02:00
    handler: async () => {
      await backupService.runFullBackup()
    },
  })

  // 월~토 02:00: incremental WAL 확인 (WAL은 archive_command로 실시간 아카이빙)
  orchestrator.scheduleBuiltIn({
    name: '__system_backup_verify_sat',
    schedule: '0 3 * * 6',   // 매주 토요일 03:00 (DQ-4.21)
    handler: async () => {
      const passed = await backupService.verifyLatestBackup()
      if (!passed) {
        await notifySlack('⚠️ wal-g backup-verify 실패 — 즉시 확인 필요')
      }
    },
  })

  // 매월 1일 01:00: pg_dump long-term (12개월 보관, DQ-4.14)
  orchestrator.scheduleBuiltIn({
    name: '__system_backup_monthly_dump',
    schedule: '0 1 1 * *',   // 매월 1일 01:00
    handler: async () => {
      await runPgDump()
    },
  })
}
```

---

## 7. Restore 검증 — Staging Container 자동 검증

### 7.1 RestoreService

```typescript
// src/lib/db-ops/backup/restore-service.ts

export class RestoreService {
  /**
   * DQ-4.11: 매월 1일 staging container 자동 복원 검증
   * Docker 없는 환경 → wsltempdb 별도 소켓으로 임시 PG 인스턴스 생성
   */
  async runMonthlyVerification(): Promise<RestoreVerificationResult> {
    const backupId = await this.getLatestSuccessfulBackupId()
    const restoreRecord = await prisma.backupRestore.create({
      data: {
        backupId,
        targetEnvironment: 'staging',
        restoreReason: '매월 1일 자동 복원 검증',
        performedBy: 'system',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    })

    try {
      // 임시 데이터 디렉토리에 복원
      const tmpDataDir = `/tmp/pg-verify-${Date.now()}`
      await execFileAsync('wal-g', ['backup-fetch', tmpDataDir, 'LATEST'], {
        env: { ...process.env, ...walGEnv },
        timeout: 1800_000,  // 30분 타임아웃 (NFR-REL.2: RTO 30분)
      })

      // 임시 PG 인스턴스 시작 (포트 5433)
      await this.startTempPostgres(tmpDataDir, 5433)

      // 주요 테이블 row count 비교 (±1% 허용, FR-4.4)
      const verificationResult = await this.verifyRowCounts(5433)

      await prisma.backupRestore.update({
        where: { id: restoreRecord.id },
        data: {
          status: 'SUCCESS',
          verificationPassed: verificationResult.passed,
          finishedAt: new Date(),
        },
      })

      // DQ-4.18: restore-event audit log 기록
      await writeAuditLog({
        userId: 'system',
        action: 'backup.restore',
        resourceType: 'backup_restore',
        resourceId: restoreRecord.id,
        details: {
          backupId,
          environment: 'staging',
          verificationPassed: verificationResult.passed,
          rowCountDiffs: verificationResult.diffs,
        },
      })

      // 결과 웹훅 발송 (DQ-4.11)
      await this.sendVerificationWebhook(verificationResult)

      return verificationResult

    } catch (err) {
      await prisma.backupRestore.update({
        where: { id: restoreRecord.id },
        data: { status: 'FAILED', finishedAt: new Date() },
      })
      throw err

    } finally {
      // 임시 PG 인스턴스 정리
      await this.stopTempPostgres(5433)
    }
  }

  private async verifyRowCounts(port: number): Promise<RowCountVerificationResult> {
    const prodCounts = await getRowCounts(5432)   // 프로덕션 PG
    const restoreCounts = await getRowCounts(port)  // 복원된 PG

    const diffs: Record<string, number> = {}
    let passed = true

    for (const [table, prodCount] of Object.entries(prodCounts)) {
      const restoreCount = restoreCounts[table] ?? 0
      const diff = Math.abs(prodCount - restoreCount) / Math.max(prodCount, 1)
      diffs[table] = diff

      if (diff > 0.01) {  // ±1% 초과 시 실패
        passed = false
      }
    }

    return { passed, diffs }
  }
}
```

### 7.2 Restore Audit Log (DQ-4.18)

복원 이벤트는 별도 `backup_restores` 테이블(ERD §3.6.4)과 `audit_log` 테이블에 이중 기록한다.

```typescript
// 복원 후 audit_log에 'restore-event' 기록
await writeAuditLog({
  userId: performedBy,
  action: 'backup.restore',
  resourceType: 'backup_restore',
  resourceId: restoreRecord.id,
  details: {
    backupId,
    targetEnvironment,     // 'staging' | 'production'
    targetTimestamp,       // PITR 타깃 (null = latest)
    verificationPassed,
    reason: restoreReason,
  },
})
```

---

## 8. 데이터 모델

### 8.1 신규 테이블 요약 (이 카테고리 담당)

| 테이블 | 저장소 | Phase | 근거 | ERD 참조 |
|--------|--------|-------|------|---------|
| `cron_job_runs` | PostgreSQL | 20 | CronJob 전수 실행 기록 | §3.6.1 |
| `webhook_deliveries` | PostgreSQL | 20 | Webhook 전송 이력 | §3.6.2 |
| `backups` | PostgreSQL | 20 | wal-g 백업 메타 (ADR-005) | §3.6.3 |
| `backup_restores` | PostgreSQL | 20 | 복원 감사 로그 (DQ-4.18) | §3.6.4 |

모든 테이블 스키마는 `02-data-model-erd.md §3.6`의 제안을 그대로 채용한다. Phase 20에서 Prisma 마이그레이션 파일 1개로 4개 테이블을 한 번에 추가한다.

### 8.2 `cron_job_runs` 핵심 컬럼

```prisma
model CronJobRun {
  id           BigInt   @id @default(autoincrement())
  jobId        String   @map("job_id") @db.Uuid
  job          CronJob  @relation(fields: [jobId], references: [id], onDelete: Cascade)
  status       RunStatus  // RUNNING | SUCCESS | FAILED | DEAD_LETTER | TIMEOUT
  startedAt    DateTime @default(now()) @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  durationMs   Int?     @map("duration_ms")
  output       String?  // 최대 10KB (DQ-4.19)
  outputS3Link String?  @map("output_s3_link")   // 10KB 초과 시 B2 링크
  errorMessage String?  @map("error_message")
  triggeredBy  String?  @map("triggered_by") @db.Uuid   // null=예약, UUID=수동 트리거

  @@index([jobId, startedAt])
  @@index([status])
  @@map("cron_job_runs")
}
```

**보존 정책**: 성공 실행 30일, 실패 실행 90일 후 자동 정리 cron 잡 등록 (DQ-4.4 일관).

### 8.3 `backups` kind 타입 (DQ-4.23)

```typescript
// DQ-4.23: Backup kind를 enum 대신 string literal union으로 정의
type BackupKind = 'BASE' | 'WAL_SEGMENT' | 'MANUAL'

// 이유:
// - Prisma enum은 PostgreSQL enum 타입 생성 → 나중에 값 추가 시 ALTER TYPE 마이그레이션 필요
// - string literal union은 TEXT 컬럼으로 저장 → 값 추가 시 코드 변경만으로 충분
// - 단점: 런타임 타입 체크는 Zod enum 스키마로 보완

const BackupKindSchema = z.enum(['BASE', 'WAL_SEGMENT', 'MANUAL'])
```

---

## 9. UI — 대시보드 페이지

### 9.1 라우트 구조

```
app/
└── (dashboard)/
    └── database/
        ├── cron/
        │   ├── page.tsx           ← CronDashboard (잡 목록 + 실행 이력)
        │   ├── new/page.tsx       ← CronJobForm (신규 잡 생성)
        │   └── [id]/page.tsx      ← CronJobDetail (단일 잡 상세)
        ├── webhooks/
        │   ├── page.tsx           ← WebhookDashboard (웹훅 목록)
        │   └── [id]/page.tsx      ← WebhookDetail (전송 이력)
        └── backups/
            ├── page.tsx           ← BackupDashboard (백업 목록 + RPO/RTO 상태)
            └── restore/page.tsx   ← RestorePage (복원 폼 + 이력)
```

### 9.2 CronDashboard 주요 기능

| 기능 | 구현 | FR 매핑 |
|------|------|---------|
| 잡 목록 (이름/schedule/마지막 실행/상태) | Server Component + TanStack Table | FR-4.1 |
| 잡 활성/비활성 토글 | Client Component + Server Action | FR-4.1 |
| 수동 실행 트리거 | POST /api/cron/[id]/trigger (admin only) | FR-4.1, DQ-4.6 |
| 실행 이력 (CronJobRun 목록) | 페이지네이션 + 상태 필터 | FR-4.1 |
| 실행 output 보기 (10KB + S3 링크) | 아코디언 + 링크 | DQ-4.19 |
| cron expression 파서 (다음 실행 시각) | `cronstrue` 라이브러리 | FR-4.1 |

### 9.3 BackupDashboard 주요 기능

| 기능 | 구현 | FR 매핑 |
|------|------|---------|
| RPO/RTO 현황 카드 | 마지막 WAL 아카이브 시각 표시 | FR-4.2 |
| 백업 목록 (kind/상태/크기/시간) | Server Component | FR-4.2 |
| PITR 복원 폼 (target timestamp 선택) | DateTimePicker + confirm dialog | FR-4.2 |
| 복원 리허설 결과 (매월 1일) | PASS/FAIL 배지 + diff 표 | FR-4.4, DQ-4.11 |
| backup-verify 마지막 실행 결과 | 토요일 03:00 결과 표시 | DQ-4.21 |

---

## 10. Wave 4 할당 DQ 답변 (8건)

### DQ-4.5 — 잡 알림 채널

**질문**: 잡 실패 알림을 Slack/Discord webhook으로 보낼지?

**답변**: **Slack webhook 기본 + Discord 선택 지원, Phase 14e(DB Ops) 구현**

- 환경변수 `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL` 설정 시 자동 활성
- `WebhookDispatcher` 와 별도로 `SlackNotifier` / `DiscordNotifier` 구현 (Webhook 모델 재사용하지 않음 — 시스템 알림과 사용자 정의 웹훅을 분리)
- 알림 조건: 잡 실패 즉시 + dead-letter 진입 시
- §4.3 `notifyFailure()` 메서드 참조

---

### DQ-4.9 — lock timeout vs job timeout 분리

**질문**: lock timeout과 job timeout을 분리 관리할지?

**답변**: **통합 — job timeout이 lock timeout 역할을 겸한다**

```typescript
// job timeout = 작업 전체 소요 시간 상한 (기본 30초, 잡별 설정 가능)
// advisory lock은 job 실행 중 계속 보유 → job timeout 초과 시 프로세스 강제 종료 → lock 자동 해제

const controller = new AbortController()
const timer = setTimeout(() => {
  controller.abort('job_timeout')
}, job.timeoutMs ?? 30_000)

try {
  await runJobWithSignal(job, controller.signal)
} finally {
  clearTimeout(timer)
  // advisory lock은 여기서 명시적 해제 (finally 보장)
  await lockManager.release(job.name)
}
```

분리하지 않는 이유: lock wait timeout(잠금 획득 대기)은 `pg_try_advisory_lock` (즉시 실패) 방식이므로 별도 설정 불필요. job timeout만으로 전체 제어 충분.

---

### DQ-4.11 — 복원 환경 자동 검증

**질문**: 복원 환경(staging container)을 cron으로 매주 자동 검증?

**답변**: **매월 1일 03:00 자동 검증 + 결과 webhook 발송**

- 스케줄: `0 3 1 * *` (매월 1일 03:00, §6.4 등록)
- 방법: 임시 PostgreSQL 인스턴스(포트 5433)에 LATEST 백업 복원 → 주요 테이블 row count ±1% 비교
- 결과: `backup_restores` 테이블 + `audit_log` 이중 기록
- 알림: Slack webhook으로 PASS/FAIL 발송 (DQ-4.11)
- 구현: §7.1 `RestoreService.runMonthlyVerification()` 참조

---

### DQ-4.18 — 복원 후 audit log 보관

**질문**: 복원 후 audit_log를 별도 보관? restore-event 기록

**답변**: **Yes — `backup_restores` 테이블 + `audit_log` 이중 기록**

- `backup_restores`: 복원 메타데이터 (backupId, targetEnvironment, targetTimestamp, verificationPassed 등)
- `audit_log`: action = 'backup.restore', resourceType = 'backup_restore', details에 전체 맥락
- 이유: `backup_restores`는 복원 이력 검색 최적화, `audit_log`는 감사 불변성 보장 (NFR-SEC.10: UPDATE/DELETE 금지 트리거)
- 구현: §7.1 `writeAuditLog()` 호출 참조

---

### DQ-4.19 — CronJobRun output 크기 제한

**질문**: CronJobRun의 `output: Json?` 크기 제한은?

**답변**: **10KB 한도, 초과 시 truncate + B2 S3 링크 저장**

```
output 크기 ≤ 10KB → DB에 그대로 저장
output 크기 > 10KB → 앞 10KB만 DB 저장 + '[...truncated]' 접미사
                      전체 output → B2 업로드 (cron-outputs/{runId}.txt)
                      outputS3Link 컬럼에 B2 경로 저장
```

UI에서는 10KB output은 인라인 표시, S3 링크가 있으면 "전체 출력 보기" 링크 노출.

근거: PostgreSQL JSONB는 row 크기 제한이 있고, 대형 output이 쌓이면 테이블 bloat 발생. 10KB는 대부분의 cron output을 커버하면서 DB 부하를 방지하는 균형점.

---

### DQ-4.20 — advisory lock key 충돌 확률

**질문**: advisory lock key 충돌 확률은 허용 가능한가?

**답변**: **SHA-256 하위 64비트 사용 → 2^32 잡까지 충돌 확률 ~0%**

```
충돌 확률 계산 (birthday paradox):
P(n개 잡에서 충돌) ≈ n² / 2^64

n = 100 잡:  P ≈ 100² / 2^64 = 10,000 / 1.8×10^19 ≈ 5.4×10^-16
n = 1,000 잡: P ≈ 10^6 / 1.8×10^19 ≈ 5.4×10^-14
n = 10,000 잡: P ≈ 10^8 / 1.8×10^19 ≈ 5.4×10^-12

현실적 최대 잡 수: 양평 부엌 운영 컨텍스트 상 50~100개 예상
→ 충돌 확률 ≈ 5.4×10^-16 (무시 가능 수준)
```

구현: §4.2 `LockManager.keyFromJobName()` SHA-256 하위 64비트 추출 참조.

---

### DQ-4.21 — wal-g backup-verify 주기

**질문**: wal-g `backup-verify`를 언제 실행?

**답변**: **토요일 03:00** (cron `0 3 * * 6`)

- 일요일 02:00: full base backup → 토요일 03:00: 직전 주 백업 검증 (6일 후 검증)
- 시간대: Asia/Seoul (DQ-4.8)
- 검증 내용: `wal-g backup-verify --verify-integrity` (헤더 + 체크섬 검사)
- 결과 기록: `audit_log` action = 'backup.verify'
- 구현: §6.3 `BackupService.verifyLatestBackup()` 참조

---

### DQ-4.23 — Backup kind enum 확장성

**질문**: Backup 모델의 `kind` 필드를 enum으로 정의할지, string literal union으로 정의할지?

**답변**: **string literal union** (`'BASE' | 'WAL_SEGMENT' | 'MANUAL'`)

근거:
- PostgreSQL enum 타입은 값 추가 시 `ALTER TYPE ... ADD VALUE` 마이그레이션 필요 (rollback 불가)
- Prisma enum도 동일하게 마이그레이션 파일 생성
- `TEXT` + Zod 런타임 검증으로 동등한 타입 안전성 달성, 마이그레이션 비용 0

```typescript
// src/lib/schemas/backup.ts
import { z } from 'zod'

export const BackupKindSchema = z.enum(['BASE', 'WAL_SEGMENT', 'MANUAL'])
export type BackupKind = z.infer<typeof BackupKindSchema>

// API 요청 시 Zod로 검증
const body = BackupKindSchema.parse(req.json().kind)
```

---

## 11. Phase 20 WBS — DB Ops (~68h)

### 11.1 작업 분해

| Task ID | 작업 내용 | 예상 시간 | 의존 Task | FR 매핑 |
|---------|----------|----------|----------|---------|
| **Cron 영역 (~33h)** | | | | |
| DO-01 | LockManager (SHA-256 advisory lock) 구현 + 단위 테스트 | 4h | — | FR-4.1, DQ-4.20 |
| DO-02 | CronOrchestrator 핵심 구현 (schedule/execute/lock) | 6h | DO-01 | FR-4.1 |
| DO-03 | `cron_job_runs` 마이그레이션 + CronJobRun 모델 | 2h | — | DQ-4.19 |
| DO-04 | output 크기 제한 + B2 업로드 구현 | 3h | DO-03 | DQ-4.19 |
| DO-05 | RetryHandler (지수 백오프 5단계) 구현 | 3h | DO-02 | FR-4.1 |
| DO-06 | cron-worker PM2 entry + ecosystem.config.js 분리 | 2h | DO-02 | ADR-005 |
| DO-07 | SlackNotifier + DiscordNotifier 구현 | 2h | — | DQ-4.5 |
| DO-08 | /dashboard/database/cron 페이지 구현 | 5h | DO-02 | FR-4.1 |
| DO-09 | cron 수동 실행 API + RBAC 검증 | 2h | DO-08 | DQ-4.6 |
| DO-10 | 전체 Cron 통합 테스트 | 4h | DO-01~09 | — |
| **Webhook 영역 (~10h)** | | | | |
| DO-11 | `webhook_deliveries` 마이그레이션 | 1h | — | FR-4.3 |
| DO-12 | WebhookDispatcher (지수 백오프 + HMAC) 구현 | 4h | DO-11 | FR-4.3 |
| DO-13 | /dashboard/database/webhooks 페이지 | 3h | DO-12 | FR-4.3 |
| DO-14 | dead-letter Slack 알림 구현 | 2h | DO-12 | FR-4.3 |
| **Backup 영역 (~25h)** | | | | |
| DO-15 | wal-g 설치 + PostgreSQL archive_command 설정 | 3h | — | FR-4.2 |
| DO-16 | `backups` + `backup_restores` 마이그레이션 | 2h | — | DQ-4.23, DQ-4.18 |
| DO-17 | BackupService 구현 (runFullBackup + verifyLatestBackup) | 5h | DO-15 | FR-4.2, DQ-4.21 |
| DO-18 | backup-scheduler cron 등록 (일요일/토요일/매월) | 2h | DO-17 | FR-4.2 |
| DO-19 | RestoreService 구현 (PITR + staging 검증) | 6h | DO-16 | FR-4.4, DQ-4.11 |
| DO-20 | /dashboard/database/backups 페이지 | 5h | DO-17 | FR-4.2 |
| DO-21 | restore-event audit_log 연결 검증 | 2h | DO-19 | DQ-4.18 |
| **합계** | | **~68h** | | |

### 11.2 Phase 20 내 우선순위

```
Sprint A (34h): DO-01~10 — Cron 완전 구현 (RPO/RTO와 무관, 독립 가능)
Sprint B (34h): DO-11~21 — Webhook + Backup PITR 구현
```

### 11.3 목표 점수 달성 경로

| 구간 | 완료 조건 | 예상 점수 |
|------|----------|----------|
| Sprint A 완료 | node-cron advisory lock + CronJobRun UI | 75점 |
| Sprint B 완료 | wal-g PITR + 복원 검증 + Webhook DLQ | **95점** |

---

## 부록 A. 기술 결정 요약

| 결정 | 선택 | 거부 | 이유 |
|------|------|------|------|
| Cron 스케줄러 | node-cron + PG advisory lock | pg_cron, BullMQ | Node 잡 70%, WSL2 단일 인스턴스 (ADR-005) |
| PM2 모드 | fork 1인스턴스 (cron-worker) | cluster 다인스턴스 | 중복 실행 방지 |
| 백업 도구 | wal-g + B2 | pgBackRest | RPO 60s, 단일 노드 적합, $0.13/월 |
| Backup kind 타입 | string literal union + Zod | Prisma enum | 마이그레이션 비용 0, 런타임 검증 동등 (DQ-4.23) |
| output 크기 | 10KB DB + B2 overflow | 무제한 DB | 테이블 bloat 방지 (DQ-4.19) |
| lock key 해시 | SHA-256 하위 64비트 | 순번 int | 충돌 확률 5.4×10^-16, 잡명 기반 결정론적 (DQ-4.20) |
| 복원 검증 주기 | 매월 1일 + 토요일 verify | 매주 | 1인 운영 부담 vs 검증 품질 균형 |
| 알림 채널 | Slack webhook + Discord 선택 | 이메일, SMS | 운영자 주 사용 채널 + 0원 (DQ-4.5) |

---

> **Blueprint 끝.** Wave 4 · B6 · DB Ops · 2026-04-18
> 연관 Blueprint: [12-schema-visualizer-blueprint.md](./12-schema-visualizer-blueprint.md) · [14-advisors-blueprint.md](./14-advisors-blueprint.md)
> 총 공수: **~68h** (Phase 20)
