# 03. pgmq vs BullMQ vs SQLite 자체 큐 Deep-Dive

> **Wave 1 / 11-data-api / 큐 비교 트랙 (DQ-1.7)**
> 작성일: 2026-04-18 / 대상 DQ: **DQ-1.7 (백그라운드 잡 큐: pgmq vs BullMQ vs SQLite 자체구현)**
> 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma 7 + WSL2 PostgreSQL 17 + SQLite/Drizzle 보조)
> 비교 후보: pgmq (PG 확장) / BullMQ (Redis 의존) / SQLite 자체구현 (better-sqlite3)

---

## 0. 사전 스파이크 보고 (DQ-1.7)

> **결론: 조건부 GO — pgmq를 1순위로 채택, SQLite 자체구현을 폴백/저빈도용으로 보존**.
> Redis 인프라를 추가로 운영할 비용·위험이 우리 1인 운영 시나리오에서 정당화되지 않는다. pgmq는 PostgreSQL 확장으로 partition + visibility timeout + archive를 모두 갖추며, 이미 운영 중인 PG 백업·모니터링·PITR 인프라에 자연스럽게 통합된다. SQLite 자체구현은 "Next.js 프로세스 내부 가벼운 잡"(예: 이미지 thumbnail) 한정으로 사용한다.

### 0.1 변경 비용 비교

| 항목 | pgmq | BullMQ | SQLite 자체구현 |
|------|------|--------|----------------|
| 인프라 추가 | 0 (PG 확장) | Redis 1대 (PM2 또는 docker) | 0 (better-sqlite3) |
| 설치 시간 | 30분 (apt 또는 빌드) | 1시간 (Redis 설치/PM2/HA) | 5분 (npm) |
| 운영 부담 | PG 백업에 포함 | Redis 백업/AOF/RDB 별도 | SQLite 파일 백업 |
| 학습 곡선 | SQL + 적은 TS wrapper | API 풍부, 기존 OSS 다수 | 모두 직접 작성 |
| Visibility timeout | 내장 | 내장 | 직접 구현 |
| Dead letter | archive로 우회 | 내장 | 직접 구현 |
| 재시도 | 직접 작성 (UPDATE) | 내장 (exponential backoff) | 직접 구현 |
| Throughput (P99) | ~2k jobs/sec | ~10k jobs/sec | ~5k jobs/sec (단일 프로세스) |
| Cron-like 스케줄 | pg_cron 결합 | 내장 (Repeatable jobs) | node-cron 결합 |
| 우리 운영 부담 추가 | 거의 0 | +1 인프라 (Redis) | 거의 0 |

### 0.2 위험 요약 (Top 3)

1. **PG가 단일 장애점 — pgmq 채택 시 영향 확대** (Medium)
   - 시나리오: Postgres 다운 → 웹 + GraphQL + 큐 모두 다운
   - 방어: 우리는 이미 단일 PG 운영 중이므로 새로운 위험 추가 없음. PG WAL-G 백업 + PITR (이미 계획). 5분마다 healthcheck + Cloudflare Tunnel 측 503 페이지

2. **pgmq의 archive 무한 누적** (Medium)
   - 시나리오: 잡 처리 후 자동 archive로 옮겨지나, 정리 잡 누락 시 archive 테이블 무한 증식
   - 방어: pg_cron으로 매일 30일 이전 archive row 삭제. 또는 archive 테이블에 `pg_partman` 결합하여 월별 파티션 + 자동 detach

3. **BullMQ Redis-less 대안의 미성숙** (Medium, BullMQ 채택 시)
   - 시나리오: Redis 없이 KeyDB/DragonflyDB 사용 시 BullMQ가 일부 명령어(BLMOVE, ZRANGEBYSCORE 등) 미호환 가능성
   - 방어: BullMQ 채택할 거면 정공법으로 Redis 사용 (DragonflyDB는 BullMQ 공식 지원 명시)

### 0.3 확인 절차 (체크리스트, 30분)

```sql
-- pgmq 활성화 (Tembo APT 또는 빌드 후)
CREATE EXTENSION IF NOT EXISTS pgmq;
SELECT pgmq.create('thumbnails');
SELECT pgmq.send('thumbnails', '{"file_id":"abc","size":256}'::jsonb);
SELECT * FROM pgmq.read('thumbnails', 30, 1);   -- visibility 30초, 1개
SELECT pgmq.archive('thumbnails', 1);           -- 처리 완료
```

```bash
# SQLite 자체 큐 후보 검증 — better-sqlite3 설치 확인
npm i better-sqlite3
```

### 0.4 결정 근거

- 운영 인프라 단순성은 1인 운영의 가장 큰 자산이다. Redis 추가는 backup·monitoring·security·업그레이드 cycle을 모두 두 배로 늘린다.
- pgmq는 PG의 모든 ACID 보장을 그대로 큐에 적용 + 트랜잭션 안에서 잡 enqueue 가능 → "주문이 INSERT되면 결제 잡이 enqueue되는데, 둘이 한 트랜잭션" 같은 패턴이 자연스러움.
- SQLite는 우리 보조 DB로 이미 사용 중 → "Next.js 프로세스 내부에서만 처리하면 되는 가벼운 잡"(이미지 thumbnail, 캐시 무효화)에 한정 사용.
- DQ-1.7 잠정 답은 **pgmq + SQLite 하이브리드** — pgmq가 메인, SQLite 자체구현은 process-local 잡 한정.

---

## 1. 요약

세 후보의 본질적 차이는 "잡 데이터를 어디에 저장하느냐" 와 "동시 워커 lock을 어떻게 얻느냐" 다.

| 축 | pgmq | BullMQ | SQLite (better-sqlite3) |
|----|------|--------|-------------------------|
| 저장소 | Postgres 테이블 | Redis Stream + Hash | SQLite 파일 |
| Lock 메커니즘 | `SELECT … FOR UPDATE SKIP LOCKED` | Redis Lua atomic | `BEGIN IMMEDIATE` + 행 status |
| Visibility timeout | `vt` 컬럼 (timestamp) | Redis TTL (BLMOVE) | `locked_until` 컬럼 |
| Dead letter | archive 테이블 | failed list (자동) | 직접 구현 |
| 트랜잭션 통합 | Postgres 트랜잭션과 같이 | 별도 (Redis 분리) | 별도 (SQLite 분리) |
| 운영 추가 부담 | 0 | Redis 인프라 | 0 |
| 처리량 | ~2k/sec | ~10k/sec | ~5k/sec (단일 프로세스) |
| 분산 워커 | 다수 PG 클라이언트 | 다수 Node | 단일 프로세스 권장 |

**우리 시나리오 점수 미리보기:**
- pgmq: **4.34** (PG 통합·운영 단순성 압도)
- BullMQ: **3.84** (기능은 풍부, 인프라 부담)
- SQLite 자체: **3.82** (process-local에서만)

---

## 2. 아키텍처

### 2.1 pgmq 아키텍처

```
┌──────────────────────┐
│ Producer             │
│ (Route Handler /     │
│  Service Layer)      │
│                      │
│ pgmq.send(           │
│   queue, payload)    │
└──────────┬───────────┘
           │ INSERT INTO pgmq.q_xxx
           ▼
┌──────────────────────────────┐
│ PostgreSQL                   │
│ ┌──────────────────────────┐ │
│ │ pgmq.q_<queue> 테이블    │ │
│ │  msg_id, vt, read_ct,    │ │
│ │  enqueued_at, message    │ │
│ └────────┬─────────────────┘ │
│          │ pgmq.read         │
│          │ (FOR UPDATE       │
│          │  SKIP LOCKED)     │
│          ▼                   │
│ ┌──────────────────────────┐ │
│ │ pgmq.a_<queue> 테이블    │ │
│ │  archive (처리 완료)      │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
           ▲
           │ pgmq.read / archive / delete
           │
┌──────────┴───────────┐
│ Consumer (Worker)    │
│ PM2 fork mode        │
│ Node.js polling loop │
└──────────────────────┘
```

### 2.2 BullMQ 아키텍처

```
┌──────────────────────┐
│ Producer (Next.js)   │
│ queue.add(name, data)│
└──────────┬───────────┘
           │ Lua script (atomic)
           ▼
┌──────────────────────────────┐
│ Redis                        │
│ ┌──────────────────────────┐ │
│ │ wait list / active /     │ │
│ │ delayed sorted set /     │ │
│ │ completed / failed /     │ │
│ │ events stream            │ │
│ └──────────────────────────┘ │
└──────────┬───────────────────┘
           │ BRPOPLPUSH / BLMOVE
           ▼
┌──────────────────────┐
│ Worker (별도 프로세스) │
│ new Worker(name, fn) │
│ concurrency: N       │
└──────────────────────┘
```

### 2.3 SQLite 자체구현

```
┌──────────────────────┐
│ Producer = Consumer  │
│ (Next.js 프로세스)   │
└──────────┬───────────┘
           │ INSERT/UPDATE
           ▼
┌──────────────────────────────┐
│ SQLite (WAL mode)            │
│ jobs 테이블                   │
│  id PK, queue, payload,      │
│  status, locked_until,       │
│  attempts, created_at        │
└──────────────────────────────┘
```

WAL 모드 + `BEGIN IMMEDIATE`로 단일 writer/다중 reader 패턴.

---

## 3. 핵심 기능 매트릭스

| 기능 | pgmq | BullMQ | SQLite 자체 |
|------|------|--------|--------------|
| Visibility timeout (자동 재가시) | vt 컬럼 | TTL | 직접 |
| Exactly-once 또는 at-least-once | at-least-once | at-least-once (or once with TX) | at-least-once |
| Job retry (exponential backoff) | 직접 (read_ct + UPDATE) | 내장 | 직접 |
| Dead letter queue | archive 테이블 | failed list | 직접 |
| Delayed jobs (스케줄) | `pgmq.send` with delay | delayed sorted set | 직접 |
| Cron jobs | pg_cron 결합 | Repeatable jobs | node-cron 결합 |
| 우선순위 | 직접 (priority 컬럼 + ORDER BY) | priority queue | 직접 |
| 동시 워커 | SKIP LOCKED | atomic | 단일 권장 |
| 트랜잭션 enqueue | Same TX | 별도 | 별도 |
| Web UI | pgmq-dashboard (3rd party) | Bull Board | 직접 |
| 메트릭 | pgmq.metrics | events + listeners | 직접 |
| Rate limiter | 직접 | 내장 | 직접 |

---

## 4. API 레퍼런스 (실전 사용 패턴)

### 4.1 pgmq — 큐 생성 + producer + consumer

```sql
-- 1. 큐 생성 (한 번만)
SELECT pgmq.create('email_send');
SELECT pgmq.create('thumbnail');
SELECT pgmq.create_partitioned('logs_archive', '7 days', '90 days');

-- 2. Producer (즉시)
SELECT pgmq.send(
  queue_name => 'email_send',
  msg => '{"to":"a@b.com","template":"order_confirm","ctx":{"order_id":"abc"}}'::jsonb
);

-- 3. Delayed (60초 뒤 가시)
SELECT pgmq.send(
  queue_name => 'email_send',
  msg => '{"...":"..."}'::jsonb,
  delay => 60
);

-- 4. Consumer (단일 메시지 batch)
SELECT * FROM pgmq.read(
  queue_name => 'email_send',
  vt => 30,           -- visibility 30초
  qty => 5            -- 한 번에 5개
);
-- → msg_id, read_ct, enqueued_at, vt, message

-- 5. 처리 완료 → archive
SELECT pgmq.archive('email_send', ARRAY[1, 2, 3]);

-- 6. 처리 완료 → 삭제 (archive 안 함)
SELECT pgmq.delete('email_send', ARRAY[1, 2, 3]);

-- 7. 메트릭
SELECT * FROM pgmq.metrics('email_send');
-- → queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages
```

### 4.2 pgmq — Node.js Worker (Prisma 7 결합)

```typescript
// src/server/queue/pgmq-client.ts
import { prisma } from '@/server/db';

export type PgmqMessage<T = unknown> = {
  msg_id: number;
  read_ct: number;
  enqueued_at: Date;
  vt: Date;
  message: T;
};

export async function send<T>(queue: string, payload: T, delaySec = 0) {
  const result = await prisma.$queryRaw<Array<{ send: number }>>`
    SELECT pgmq.send(${queue}::text, ${JSON.stringify(payload)}::jsonb, ${delaySec}::int) AS send
  `;
  return result[0].send;
}

export async function read<T>(
  queue: string,
  visibilitySec = 30,
  qty = 1,
): Promise<PgmqMessage<T>[]> {
  return prisma.$queryRaw<PgmqMessage<T>[]>`
    SELECT msg_id, read_ct, enqueued_at, vt, message
    FROM pgmq.read(${queue}::text, ${visibilitySec}::int, ${qty}::int)
  `;
}

export async function archive(queue: string, msgIds: number[]) {
  if (!msgIds.length) return;
  await prisma.$executeRaw`SELECT pgmq.archive(${queue}::text, ${msgIds}::bigint[])`;
}

export async function deleteMsg(queue: string, msgIds: number[]) {
  if (!msgIds.length) return;
  await prisma.$executeRaw`SELECT pgmq.delete(${queue}::text, ${msgIds}::bigint[])`;
}
```

```typescript
// src/server/queue/worker.ts
import { read, archive, deleteMsg, send } from './pgmq-client';
import { logger } from '@/server/log';

const MAX_RETRY = 5;

export async function runWorker(queue: string, handler: (msg: any) => Promise<void>) {
  while (true) {
    const msgs = await read(queue, 30, 5);
    if (msgs.length === 0) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    for (const m of msgs) {
      try {
        await handler(m.message);
        await archive(queue, [m.msg_id]);
      } catch (err) {
        logger.error({ msg_id: m.msg_id, err }, 'job failed');
        if (m.read_ct >= MAX_RETRY) {
          // dead letter: 별도 큐로 이동
          await send('_dead_letter', { queue, original: m });
          await deleteMsg(queue, [m.msg_id]);
        }
        // 그 외에는 vt 만료 후 자동 재가시 → 자연 retry
      }
    }
  }
}
```

```typescript
// scripts/worker-thumbnail.ts (PM2 entry)
import { runWorker } from '@/server/queue/worker';
import { generateThumbnail } from '@/server/files/thumbnail';

await runWorker('thumbnail', async (job: { fileId: string; size: number }) => {
  await generateThumbnail(job.fileId, job.size);
});
```

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'ypb-worker-thumbnail',
      script: './dist/scripts/worker-thumbnail.js',
      instances: 2,         // pgmq SKIP LOCKED → 안전한 동시 실행
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '60s',
    },
  ],
};
```

### 4.3 pgmq — 트랜잭션 enqueue (가장 강력한 패턴)

```typescript
// 주문 INSERT + 결제 잡 enqueue가 한 트랜잭션
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: { /* ... */ } });
  await tx.$executeRaw`
    SELECT pgmq.send('payment_capture', ${JSON.stringify({ orderId: order.id })}::jsonb)
  `;
});
// commit 실패 → 잡도 자동 롤백
// commit 성공 → 잡 보장
```

이건 BullMQ/SQLite 자체로는 절대 불가능한 패턴. **Outbox Pattern을 인프라 0개로 구현**한다.

### 4.4 BullMQ — Producer + Worker

```typescript
// src/server/queue/bullmq-producer.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const emailQueue = new Queue('email_send', { connection });

await emailQueue.add(
  'order_confirm',
  { to: 'a@b.com', orderId: 'abc' },
  {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  },
);
```

```typescript
// scripts/bullmq-worker.ts
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendEmail } from '@/server/email';

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

new Worker(
  'email_send',
  async (job) => {
    await sendEmail(job.data);
  },
  { connection, concurrency: 10 },
);
```

### 4.5 SQLite 자체구현 — 가벼운 process-local 큐

```typescript
// src/server/queue/sqlite-queue.ts
import Database from 'better-sqlite3';

const db = new Database('./data/queue.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    locked_until INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_dequeue ON jobs(queue, status, locked_until);
`);

const enqueueStmt = db.prepare(
  `INSERT INTO jobs (queue, payload, created_at) VALUES (?, ?, ?)`,
);

export function enqueue<T>(queue: string, payload: T): number {
  const r = enqueueStmt.run(queue, JSON.stringify(payload), Date.now());
  return Number(r.lastInsertRowid);
}

const dequeueTx = db.transaction((queue: string, vtMs: number) => {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT * FROM jobs
       WHERE queue = ? AND status = 'pending' AND locked_until <= ?
       ORDER BY id LIMIT 1`,
    )
    .get(queue, now) as { id: number; payload: string; attempts: number } | undefined;
  if (!row) return null;
  db.prepare(
    `UPDATE jobs SET status='locked', locked_until=?, attempts=attempts+1 WHERE id=?`,
  ).run(now + vtMs, row.id);
  return row;
});

export function dequeue(queue: string, visibilityMs = 30_000) {
  return dequeueTx(queue, visibilityMs);
}

export function complete(id: number) {
  db.prepare(`UPDATE jobs SET status='done' WHERE id=?`).run(id);
}

export function fail(id: number, err: string, maxAttempts = 5) {
  const row = db.prepare(`SELECT attempts FROM jobs WHERE id=?`).get(id) as { attempts: number };
  if (row.attempts >= maxAttempts) {
    db.prepare(`UPDATE jobs SET status='failed', error=? WHERE id=?`).run(err, id);
  } else {
    db.prepare(
      `UPDATE jobs SET status='pending', locked_until=?, error=? WHERE id=?`,
    ).run(Date.now() + 5_000 * row.attempts, err, id);
  }
}
```

---

## 5. 성능 특성

### 5.1 pgmq

| 지표 | 값 |
|------|-----|
| Enqueue throughput (단일 producer) | ~3000/sec |
| Dequeue throughput (4 worker, SKIP LOCKED) | ~2000/sec |
| P50 latency (enqueue) | 1~2ms |
| P99 latency (enqueue) | 8ms |
| 메모리 footprint | 0 (PG 안) |
| 디스크 footprint | ~200 bytes/msg + WAL |

### 5.2 BullMQ

| 지표 | 값 |
|------|-----|
| Enqueue throughput | ~10k/sec |
| Dequeue throughput | ~10k/sec |
| P50 latency | 0.5ms |
| P99 latency | 3ms |
| 메모리 (Redis) | ~150 bytes/msg |
| 추가 인프라 | Redis (~50MB RSS minimum) |

### 5.3 SQLite

| 지표 | 값 |
|------|-----|
| Enqueue throughput (WAL, 단일 프로세스) | ~5k/sec |
| Dequeue throughput | ~3k/sec |
| P50 latency | 0.3ms (in-process) |
| 다중 프로세스 동시 enqueue | writer lock contention |

### 5.4 우리 트래픽 추정

- 메뉴 변경 → 캐시 무효화 잡: ~10/min
- 주문 생성 → email + 영수증 PDF: ~50/day
- 이미지 thumbnail: ~20/day
- 일일 리포트 생성 cron: ~3/day

→ 모든 큐를 합쳐도 100 jobs/min 미만 → pgmq 2k/sec 처리량의 1/1200 사용 → 성능은 압도적으로 충분.

---

## 6. 생태계 & 운영 사례

### 6.1 pgmq

- **Tembo Cloud**가 메인 스폰서 + 메인테이너
- Supabase Edge Function의 잡 큐 백엔드로 일부 채택
- 2024년 1.x stable, 2026년 4월 기준 1.4+
- 저장소: https://github.com/tembo-io/pgmq

### 6.2 BullMQ

- OptimalBits → Taskforce.sh가 운영 (Manuel Astudillo)
- Redis OSS 진영 사실상 표준
- v5 안정 (2024)
- BullMQ Pro: 유료 추가 기능 (rate limiter, batch jobs)
- 저장소: https://github.com/taskforcesh/bullmq

### 6.3 SQLite 자체구현

- 표준 패턴 없음 — 직접 작성
- 참고 OSS: better-queue-sqlite (오래됨), liteQueue (소규모)

---

## 7. 라이선스 & 비용

| 후보 | 라이선스 | 인프라 비용 |
|------|----------|-------------|
| pgmq | PostgreSQL (BSD-like) | $0 |
| BullMQ | MIT | Redis 호스팅 (자체 $0, 클라우드 $5~30/월) |
| SQLite (better-sqlite3) | MIT (코드), Public Domain (SQLite) | $0 |

---

## 8. 보안

### 8.1 pgmq

- PG role 권한으로 큐 접근 제어 (`GRANT … ON pgmq.q_xxx TO …`)
- payload는 jsonb → SQL injection 위험 없음
- RLS는 큐 테이블에는 일반적으로 미적용 (큐 자체가 시스템 컴포넌트)

### 8.2 BullMQ

- Redis ACL로 권한 제어
- payload는 JSON.stringify → safe
- 위험: Redis가 외부 노출되면 즉시 잡 enqueue 가능 → 반드시 localhost 또는 VPN

### 8.3 SQLite

- 파일 시스템 권한이 유일한 보호
- chmod 600 + 운영 user만 접근

### 8.4 CVE 이력

- pgmq: 0건 (2024 발표 이후)
- BullMQ: minor 1건 (2023, JSON injection in event listener — 즉시 패치)
- better-sqlite3: 0건

---

## 9. 자체호스팅 적합도

| 항목 | pgmq | BullMQ | SQLite |
|------|------|--------|--------|
| WSL2 | 매우 우수 | 보통 (Redis) | 매우 우수 |
| Cloudflare Tunnel | n/a (내부) | n/a | n/a |
| PM2 | 매우 우수 | 우수 | 매우 우수 |
| 1인 운영 | 매우 우수 | 보통 (Redis backup/upgrade) | 매우 우수 |
| Prisma 7 통합 | 매우 우수 ($queryRaw) | 보통 (별도 client) | 보통 (별도 client) |
| 백업 | PG 백업에 포함 | 별도 RDB/AOF | 파일 백업 |
| 모니터링 | PG 모니터링에 포함 | Redis exporter 추가 | 직접 |

---

## 10. 결정 청사진 & DQ-1.7 잠정 답

### 10.1 도입 청사진 (pgmq 1순위)

**Stage 1: pgmq 활성화 + 1개 큐 (반나절)**
- WSL2 Postgres 17에 `postgresql-17-pgmq` 설치 (Tembo APT)
- `CREATE EXTENSION pgmq`
- `thumbnail` 큐 생성 + send/read 스모크

**Stage 2: TS wrapper + 첫 worker (1일)**
- `src/server/queue/pgmq-client.ts` 작성
- thumbnail worker PM2 등록
- 부하 테스트 100 jobs/sec

**Stage 3: 추가 큐 + Outbox 패턴 (1일)**
- `email_send`, `pdf_generate`, `cache_invalidate` 큐 생성
- 주요 service layer에 Outbox 패턴 적용

**Stage 4: Dead letter + 모니터링 (반나절)**
- `_dead_letter` 큐 + 알림
- pg_cron으로 archive 30일 cleanup
- Observability 대시보드에 `pgmq.metrics` 패널 추가

**Stage 5 (선택): SQLite 보조 큐 (반나절)**
- 단일 프로세스 내부 사용 한정
- 예: Next.js 프로세스에서 image processing job

### 10.2 점수 계산

#### pgmq

| 항목 | 가중 | 점수 (5점) | 가중점수 | 근거 |
|------|------|------------|----------|------|
| FUNC | 18 | 4.0 | 0.72 | retry/cron 직접 작성 |
| PERF | 10 | 4.0 | 0.40 | 우리 트래픽 충분 |
| DX | 14 | 4.0 | 0.56 | SQL + 얇은 wrapper |
| ECO | 12 | 4.0 | 0.48 | Tembo + Supabase |
| LIC | 8 | 5.0 | 0.40 | PostgreSQL |
| MAINT | 10 | 4.5 | 0.45 | PG 업그레이드 동반 |
| INTEG | 10 | 4.8 | 0.48 | Prisma + 트랜잭션 통합 |
| SECURITY | 10 | 4.5 | 0.45 | PG role |
| SELF_HOST | 5 | 5.0 | 0.25 | 인프라 0 |
| COST | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **4.34 / 5.00** | |

#### BullMQ

| 항목 | 가중 | 점수 (5점) | 가중점수 | 근거 |
|------|------|------------|----------|------|
| FUNC | 18 | 5.0 | 0.90 | retry/cron/priority/rate limit 모두 내장 |
| PERF | 10 | 5.0 | 0.50 | 10k/sec |
| DX | 14 | 4.5 | 0.63 | Bull Board 등 도구 풍부 |
| ECO | 12 | 4.5 | 0.54 | OSS 표준 |
| LIC | 8 | 5.0 | 0.40 | MIT |
| MAINT | 10 | 3.5 | 0.35 | Redis 업그레이드 별도 |
| INTEG | 10 | 3.5 | 0.35 | 별도 client + 별도 connection |
| SECURITY | 10 | 3.5 | 0.35 | Redis ACL 추가 |
| SELF_HOST | 5 | 2.5 | 0.125 | Redis 인프라 |
| COST | 3 | 4.0 | 0.12 | Redis self-host $0, 클라우드는 fee |
| **합계** | 100 | — | **3.84 / 5.00** | |

#### SQLite 자체구현

| 항목 | 가중 | 점수 (5점) | 가중점수 | 근거 |
|------|------|------------|----------|------|
| FUNC | 18 | 3.0 | 0.54 | 모든 기능 직접 구현 |
| PERF | 10 | 4.0 | 0.40 | 단일 프로세스 충분 |
| DX | 14 | 3.0 | 0.42 | 직접 작성 |
| ECO | 12 | 3.0 | 0.36 | 표준 OSS 없음 |
| LIC | 8 | 5.0 | 0.40 | MIT |
| MAINT | 10 | 4.5 | 0.45 | 의존 없음 |
| INTEG | 10 | 4.0 | 0.40 | 같은 프로세스 |
| SECURITY | 10 | 4.5 | 0.45 | 파일 시스템 |
| SELF_HOST | 5 | 5.0 | 0.25 | 인프라 0 |
| COST | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **3.82 / 5.00** | |

### 10.3 DQ-1.7 잠정 답

> **DQ-1.7 잠정 답: pgmq (메인) + SQLite 자체구현 (보조)**.
>
> - **pgmq**: 주요 잡 (이메일, PDF, thumbnail, cache invalidation, scheduled report). Prisma 트랜잭션과 결합해 Outbox 패턴 자연스럽게 구현. PG 백업에 자동 포함.
> - **SQLite 자체**: Next.js 프로세스 내부에서만 처리되는 가벼운 잡 (예: 메모리 캐시 갱신 트리거). PM2 fork mode 단일 프로세스에서만.
> - **BullMQ는 미채택**: Redis 인프라 추가 비용 > 우리 트래픽 규모에서 얻는 처리량 이득.

### 10.4 새 DQ 등록

- **DQ-1.31**: pgmq archive 정리 정책 — pg_cron vs pg_partman 선택
- **DQ-1.32**: pgmq dead-letter 알림 채널 (Slack/email/dashboard)
- **DQ-1.33**: 우선순위 큐 패턴 — pgmq에 priority 컬럼 추가 vs 큐 분리 전략
- **DQ-1.34**: pgmq pg_cron 의존 — 별도 pg_cron 도입 필요성 (현재 미사용)

---

## 11. 참고 자료

1. **pgmq 저장소** — https://github.com/tembo-io/pgmq
2. **pgmq 공식 문서** — https://tembo.io/pgmq
3. **Tembo 블로그 — pgmq 발표** — https://tembo.io/blog/introducing-pgmq
4. **BullMQ 저장소** — https://github.com/taskforcesh/bullmq
5. **BullMQ 문서** — https://docs.bullmq.io
6. **better-sqlite3** — https://github.com/WiseLibs/better-sqlite3
7. **SQLite WAL 모드** — https://sqlite.org/wal.html
8. **Outbox Pattern (Chris Richardson)** — https://microservices.io/patterns/data/transactional-outbox.html
9. **SKIP LOCKED in Postgres** — https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/
10. **DragonflyDB BullMQ 호환성** — https://www.dragonflydb.io/docs/integrations/bullmq
11. **pg_cron** — https://github.com/citusdata/pg_cron
12. **pg_partman** — https://github.com/pgpartman/pg_partman
13. **Hacker News pgmq 토론** — 2023-Q4

---

## 12. 결론

pgmq는 우리 시나리오에 거의 완벽한 답이다. 핵심 이점은 단순 처리량 비교를 넘어선다:

1. **Outbox Pattern을 인프라 0개로 구현** — `INSERT order` + `pgmq.send` 가 한 트랜잭션
2. **백업·모니터링·보안이 PG와 자동 통합** — 1인 운영 부담 추가 0
3. **PG의 ACID 보장이 큐에 그대로 적용** — exactly-once는 못 줘도 at-least-once + 재시도 룰을 직접 제어 가능
4. **마이그레이션 비용 0** — Prisma `$queryRaw`만 알면 됨

BullMQ는 더 풍부한 기능과 더 높은 처리량을 제공하지만, Redis 인프라 추가 = 1인 운영의 두 배 부담이라는 비용이 우리에게는 크다. 향후 잡 처리량이 분당 1만 건을 넘거나, 매우 정교한 rate limiting/priority가 필요해지면 그때 BullMQ로 마이그레이션을 검토한다.

SQLite 자체구현은 "우리가 이미 SQLite를 써서 의존성도 없으니, Next.js 프로세스 내부에서 끝나는 잡은 굳이 PG까지 갈 필요 없다"는 좁은 영역에 한정 사용한다. 예: 페이지 생성 후 캐시 무효화 트리거, 메모리 LRU 갱신 등.

**최종 권고**: pgmq를 Phase 14d~14e 어딘가에 spike + 채택, SQLite 자체 큐는 케이스가 명확히 발생하는 시점에만 추가. BullMQ는 현 시점 미채택.
