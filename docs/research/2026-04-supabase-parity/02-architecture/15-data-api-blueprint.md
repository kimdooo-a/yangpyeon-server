# 15. Data API Blueprint — 카테고리 11

> **Wave 4 · Tier 2 · B5 Data Delivery 클러스터 (Agent B5-DAPI)**
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md) · [11-realtime-blueprint.md](./11-realtime-blueprint.md)
> ADR: ADR-012 (REST 강화 + pgmq 메인 + pg_graphql 보류), ADR-016 (pg_graphql 수요 트리거 4 정량화)
> DQ 답변 대상: DQ-1.25, DQ-1.26, DQ-1.27, DQ-1.31, DQ-1.32, DQ-11.1, DQ-11.3 (7건)
> Phase: 21 (4주, ~25h)

---

## 0. 문서 목적

### 0.1 이 문서의 역할

양평 부엌 서버 대시보드 Data API 카테고리(카테고리 11)의 **구현 청사진**. Wave 1~2 리서치 결론(ADR-012, ADR-016)을 기반으로 REST 강화, pgmq Outbox 워커, 조건부 pg_graphql의 3축 설계를 컴포넌트·데이터 흐름·WBS로 전환한다.

**목표**: 현재 45점 → Phase 21 완료 시 85점. (GraphQL 수요 트리거 충족 시 추가 +15점 → 100점)

### 0.2 현재 상태 (45점)

| 구분 | 세부 | 점수 |
|------|------|:----:|
| REST 기본 CRUD | `/api/v1/data/[table]` GET/POST/PATCH/DELETE | 20 |
| 쿼리 연산자 | `eq`, `in`, `like` 일부만 지원 | 8 |
| API 키 인증 | `api_keys` 테이블 (v1) 기본 구현 | 5 |
| pgmq | 미설치 | 0 |
| GraphQL | 미구현 | 0 |
| 낙관적 락 | 미구현 | 0 |
| OpenAPI 스펙 | 미구현 | 0 |
| pgmq dead-letter 알림 | 미구현 | 0 |
| **합계** | | **45** |

### 0.3 85점 도달 경로

```
현재 45점
  │
  ├─ Phase 21-A (REST 강화): operator parser + 낙관적 락 + OpenAPI  +20점 → 65점
  │
  ├─ Phase 21-B (pgmq): 워커 + archive 정리 + dead-letter 알림      +15점 → 80점
  │
  ├─ Phase 21-C (API Keys v2): rate limit + scope + UI              +5점  → 85점
  │
  └─ Phase 21-D (pg_graphql, 조건부): 트리거 2+ 충족 시만           +15점 → 100점
```

---

## 1. Wave 1~2 채택안 (의사결정 기록)

### 1.1 7후보 매트릭스 요약

Wave 2 `01-research/11-data-api/04-data-api-matrix.md` 가중 점수 (100점 환산):

| 후보 | 점수 | 채택 여부 |
|------|:----:|---------|
| A: REST Route Handler 강화 (자체) | 81.76 | **즉시 채택** |
| **A + C: REST + pgmq** | **86.84** | **즉시 채택 (최적해)** |
| A + B + C: REST + pg_graphql + pgmq | 88.40 (컨텍스트 -2 → 86.40) | 조건부 채택 |
| E: PostGraphile v5 | 86.40 | 조건부 (Subscription 수요 시) |
| F: Hasura CE | 81.74 | 미채택 (Docker + metadata DB 부담) |
| G: tRPC | — | 원천 제외 (공개 API 호환 불가) |

**최종 결정 (ADR-012)**:
- **즉시 착수**: A + C (REST 강화 + pgmq) → 80~85/100
- **조건부 도입**: pg_graphql (4 수요 트리거 중 2+ 충족 시, ADR-016)
- **원천 제외**: Hasura(Docker), tRPC(공개 API 불가)

### 1.2 A+C 조합이 최적해인 이유

```
A REST 강화 + C pgmq = 86.84점
vs
A + B + C (pg_graphql 포함) = 86.40점 (컨텍스트 가중 차감 후)

→ pg_graphql 선제 도입 시 오히려 점수가 낮아지는 역설:
  - pgrx ABI 재빌드 위험 (MAINT -0.5)
  - 스키마 자동 노출 보안 부담 (SECURITY -0.2)
  - 수요 없는 GraphQL 운영 의례 (DX -0.1)
```

### 1.3 tRPC 원천 제외 근거 (재확인)

tRPC는 "클라이언트와 서버가 같은 TypeScript 프로젝트일 때 타입을 무비용으로 공유"하는 것이 핵심 가치. 양평 대시보드는 다음 클라이언트를 가지거나 가질 수 있다:
1. Next.js 내부 (tRPC 적합)
2. Playwright E2E — curl 가능해야 함 (tRPC 부적합)
3. Capacitor 모바일 — 공개 스키마 필요 (tRPC 부적합)
4. 외부 BI/파트너 도구 (tRPC 부적합)
5. `secret_key` 발급 외부 자동화 스크립트 (tRPC 부적합)

5개 중 4개가 tRPC 부적합 → 공개 API 표면 별도 운영 필요 → MAINT 2배 → **원천 제외**.

---

## 2. 컴포넌트 전체 구성도

```
┌──────────────────────────────────────────────────────────────────────┐
│  클라이언트 (브라우저/curl/모바일/BI 도구)                            │
│                                                                      │
│  REST: GET/POST/PATCH/DELETE /api/v1/data/{table}?filter=...        │
│  GraphQL: POST /api/graphql (조건부, pg_graphql 도입 시)             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ HTTPS (Cloudflare Tunnel)
                       │
┌──────────────────────▼───────────────────────────────────────────────┐
│  Next.js 16 App Router (ypb-app PM2)                                │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  RestAPIController                                           │    │
│  │    /api/v1/data/[table]                                      │    │
│  │    ├─ OperatorParser (eq/gt/lt/gte/lte/neq/in/nin/         │    │
│  │  │                     like/ilike/is/not/jsonb_path)        │    │
│  │    ├─ OrderByParser                                          │    │
│  │    ├─ CursorPaginator                                        │    │
│  │    ├─ OptimisticLockGuard (If-Match 헤더 + updated_at)       │    │
│  │    ├─ TableAccessRLS (3롤: admin/editor/viewer)              │    │
│  │    └─ OpenApiEmitter (DMMF → OpenAPI 3.1 spec)              │    │
│  │                                                              │    │
│  │  PersistedQueryRegistry (조건부, GraphQL 도입 시)             │    │
│  │    └─ /api/graphql (pg_graphql $queryRaw 래퍼)               │    │
│  │                                                              │    │
│  │  GraphqlRouter (조건부, pg_graphql 수요 트리거 2+ 시)          │    │
│  │    ├─ Persisted Query 검증 (프로덕션 PQ-only)                 │    │
│  │    ├─ Introspection 제어 (개발만 허용)                         │    │
│  │    └─ Realtime Subscription 위임 (→ /realtime/v1)           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  PgmqWorker (별도 PM2 프로세스 또는 Next.js fork)             │    │
│  │    ├─ 큐 목록: thumbnail / email / pdf / cache-bust /        │    │
│  │  │            webhook                                        │    │
│  │    ├─ 단일 워커: queue length ≤ 100                          │    │
│  │    ├─ 워커 N+1 증설: queue length > 100 (DQ-11.3 답변)       │    │
│  │    ├─ archive 정리: node-cron 일 1회 (pg_cron 거부)           │    │
│  │    └─ dead-letter 알림: Slack webhook + dashboard           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  IntrospectionCI                                                     │
│    └─ Prisma pull + pg_graphql introspection diff (CI 자동화)        │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ Prisma 7 + $queryRaw
                       │
┌──────────────────────▼───────────────────────────────────────────────┐
│  PostgreSQL 15                                                       │
│    ├─ pgmq 확장 (CREATE EXTENSION pgmq)                              │
│    ├─ pg_graphql 확장 (조건부, CREATE EXTENSION pg_graphql)           │
│    └─ 비즈니스 테이블 (menu, orders, inventory, ...)                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 컴포넌트 상세 명세

### 3.1 RestAPIController — operator parser 확장

**역할**: PostgREST 80% 호환 REST 엔드포인트. Prisma 7 `where` 절로 변환.

**파일 위치**: `src/server/data-api/operator-parser.ts`

**지원 연산자 (완전 목록)**:

```typescript
// src/server/data-api/operator-parser.ts
export const OPERATORS = {
  eq:         (col: string, val: string) => ({ [col]: { equals: parseValue(val) } }),
  neq:        (col: string, val: string) => ({ [col]: { not: parseValue(val) } }),
  gt:         (col: string, val: string) => ({ [col]: { gt: parseValue(val) } }),
  gte:        (col: string, val: string) => ({ [col]: { gte: parseValue(val) } }),
  lt:         (col: string, val: string) => ({ [col]: { lt: parseValue(val) } }),
  lte:        (col: string, val: string) => ({ [col]: { lte: parseValue(val) } }),
  like:       (col: string, val: string) => ({ [col]: { contains: val } }),
  ilike:      (col: string, val: string) => ({ [col]: { contains: val, mode: 'insensitive' } }),
  in:         (col: string, val: string) => ({ [col]: { in: val.split(',').map(parseValue) } }),
  nin:        (col: string, val: string) => ({ [col]: { notIn: val.split(',').map(parseValue) } }),
  is:         (col: string, val: string) => ({ [col]: val === 'null' ? null : Boolean(val) }),
  not:        (col: string, val: string) => ({ [col]: { not: parseValue(val) } }),
  // DQ-11.1 답변 — JSONB path filter (Prisma 7 JsonFilter 호환)
  json_path:  (col: string, val: string) => {
    // 'nutrition.calories=gte.300' 파싱
    const eqIdx = val.lastIndexOf('=');
    const pathStr = val.substring(0, eqIdx);
    const rest = val.substring(eqIdx + 1);
    const path = pathStr.split('.');
    const [op, filterVal] = rest.split('.');
    const ops: Record<string, string> = {
      eq: 'equals', gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte'
    };
    return { [col]: { path, [ops[op] ?? 'equals']: parseValue(filterVal) } };
  },
} as const;
```

**쿼리 파라미터 파싱 예시**:
```
GET /api/v1/data/menu?filter[price][gt]=5000&filter[name][ilike]=찌개&orderBy=price.asc&cursor=eyJpZCI6MTB9&limit=20

→ Prisma where: { price: { gt: 5000 }, name: { contains: '찌개', mode: 'insensitive' } }
→ Prisma orderBy: { price: 'asc' }
→ Prisma cursor: { id: 10 }
→ Prisma take: 20
```

**JSONB path filter (DQ-11.1, Prisma 7 JsonFilter 매핑)**:
```
GET /api/v1/data/menu?filter[meta][json_path]=nutrition.calories=gte.300

→ Prisma where: { meta: { path: ['nutrition', 'calories'], gte: 300 } }
→ SQL: WHERE meta #>> '{nutrition,calories}' >= '300'
```

**낙관적 락 (Optimistic Locking)**:
```typescript
// PATCH 요청 시 If-Match 헤더 필수 확인
async function handlePatch(req: NextRequest, table: string, id: string) {
  const ifMatch = req.headers.get('If-Match');
  if (!ifMatch) {
    return NextResponse.json({ error: 'If-Match 헤더 필수' }, { status: 428 });
  }

  // 현재 updated_at 조회
  const current = await (prisma as any)[table].findUnique({
    where: { id },
    select: { updatedAt: true },
  });
  const currentEtag = generateEtag(current.updatedAt);

  if (currentEtag !== ifMatch) {
    return NextResponse.json(
      { error: '낙관적 락 충돌 — 최신 데이터 재조회 필요' },
      { status: 412 }
    );
  }

  // 업데이트 진행
  const body = await req.json();
  const updated = await (prisma as any)[table].update({ where: { id }, data: body });
  return NextResponse.json(updated, {
    headers: { ETag: generateEtag(updated.updatedAt) },
  });
}
```

### 3.2 PgmqWorker — 큐 워커 스케일링

**역할**: pgmq 확장 기반 비동기 작업 처리. Outbox 패턴으로 트랜잭션 일관성.

**파일 위치**: `src/server/queue/pgmq-worker.ts`

#### pgmq 테이블 구조 (CREATE 예시)

pgmq 확장 설치 후 자동 생성되는 테이블 구조:

```sql
-- pgmq 확장 설치
CREATE EXTENSION IF NOT EXISTS pgmq;

-- 큐 생성 (pgmq 함수 사용)
SELECT pgmq.create('thumbnail');
SELECT pgmq.create('email');
SELECT pgmq.create('pdf');
SELECT pgmq.create('cache_bust');
SELECT pgmq.create('webhook');

-- pgmq가 자동 생성하는 테이블 구조 (참조용)
-- CREATE TABLE pgmq.q_{queue_name} (
--   msg_id         BIGSERIAL PRIMARY KEY,
--   read_ct        INT       DEFAULT 0,
--   enqueued_at    TIMESTAMPTZ DEFAULT NOW(),
--   vt             TIMESTAMPTZ NOT NULL,        -- Visibility Timeout
--   message        JSONB     NOT NULL
-- );
--
-- CREATE TABLE pgmq.a_{queue_name} (
--   msg_id         BIGINT,
--   read_ct        INT,
--   enqueued_at    TIMESTAMPTZ,
--   archived_at    TIMESTAMPTZ DEFAULT NOW(),
--   vt             TIMESTAMPTZ,
--   message        JSONB
-- );

-- 큐 상태 조회 (Inspector UI에서 사용)
SELECT * FROM pgmq.metrics_all();
--   queue_name, queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages, scrape_time

-- 큐 길이 조회 (워커 스케일링 판단 기준)
SELECT queue_name, queue_length FROM pgmq.metrics_all()
WHERE queue_name = 'thumbnail';
```

#### Prisma로 pgmq 접근

```typescript
// src/server/queue/pgmq-client.ts
import { PrismaClient, Prisma } from '@prisma/client';

export interface PgmqMessage {
  msg_id:      bigint;
  read_ct:     number;
  enqueued_at: Date;
  vt:          Date;
  message:     Record<string, unknown>;
}

export class PgmqClient {
  constructor(private prisma: PrismaClient) {}

  // 메시지 전송 (Outbox 패턴)
  async send(queue: string, message: Record<string, unknown>, delaySeconds = 0): Promise<bigint> {
    const result = await this.prisma.$queryRaw<[{ send: bigint }]>`
      SELECT pgmq.send(
        queue_name => ${queue}::text,
        msg        => ${message}::jsonb,
        delay      => ${delaySeconds}::integer
      )
    `;
    return result[0].send;
  }

  // 트랜잭션 내 Outbox 패턴
  async sendInTransaction(
    tx: Prisma.TransactionClient,
    queue: string,
    message: Record<string, unknown>,
  ): Promise<bigint> {
    const result = await tx.$queryRaw<[{ send: bigint }]>`
      SELECT pgmq.send(${queue}::text, ${message}::jsonb)
    `;
    return result[0].send;
  }

  // 메시지 수신 (워커에서 사용)
  async read(queue: string, visibilityTimeoutSeconds = 30, batchSize = 10): Promise<PgmqMessage[]> {
    return this.prisma.$queryRaw<PgmqMessage[]>`
      SELECT * FROM pgmq.read(
        queue_name => ${queue}::text,
        vt         => ${visibilityTimeoutSeconds}::integer,
        qty        => ${batchSize}::integer
      )
    `;
  }

  // 처리 완료 → archive
  async archive(queue: string, msgId: bigint): Promise<void> {
    await this.prisma.$queryRaw`
      SELECT pgmq.archive(${queue}::text, ${msgId}::bigint)
    `;
  }

  // 큐 길이 조회 (스케일링 판단)
  async queueLength(queue: string): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ queue_length: bigint }]>`
      SELECT queue_length FROM pgmq.metrics(${queue}::text)
    `;
    return Number(result[0]?.queue_length ?? 0);
  }

  // dead-letter 큐로 이동 (최대 재시도 초과 시)
  async moveToDeadLetter(queue: string, msgId: bigint): Promise<void> {
    const dlqName = `${queue}_dlq`;
    await this.prisma.$transaction([
      this.prisma.$queryRaw`
        SELECT pgmq.send(
          ${dlqName}::text,
          (SELECT message FROM pgmq.q_thumbnail WHERE msg_id = ${msgId}::bigint)::jsonb
        )
      `,
      this.prisma.$queryRaw`
        SELECT pgmq.archive(${queue}::text, ${msgId}::bigint)
      `,
    ]);
  }
}
```

#### 워커 스케일링 (DQ-11.3 답변)

```typescript
// src/server/queue/pgmq-worker.ts
const SCALE_UP_THRESHOLD   = 100;  // queue length > 100 → 워커 증설
const SCALE_DOWN_THRESHOLD = 10;   // queue length < 10  → 워커 축소
const MAX_WORKERS          = 5;
const MIN_WORKERS          = 1;
const CHECK_INTERVAL_MS    = 30_000;

export class PgmqScalingWorker {
  private workerCount = 0;
  private timers: NodeJS.Timeout[] = [];
  private scaleTimer?: NodeJS.Timeout;

  constructor(
    private queue: string,
    private handler: (msg: PgmqMessage) => Promise<void>,
    private client: PgmqClient,
  ) {}

  start() {
    // 최초 1개 워커 시작
    this.spawnWorker();

    // 30초마다 큐 길이 확인 → 스케일 조정
    this.scaleTimer = setInterval(async () => {
      try {
        const length = await this.client.queueLength(this.queue);

        if (length > SCALE_UP_THRESHOLD && this.workerCount < MAX_WORKERS) {
          console.log(`[PgmqWorker:${this.queue}] 큐 길이 ${length} > ${SCALE_UP_THRESHOLD} → 워커 증설 (현재: ${this.workerCount})`);
          this.spawnWorker();
        } else if (length < SCALE_DOWN_THRESHOLD && this.workerCount > MIN_WORKERS) {
          console.log(`[PgmqWorker:${this.queue}] 큐 길이 ${length} < ${SCALE_DOWN_THRESHOLD} → 워커 축소 (현재: ${this.workerCount})`);
          this.terminateWorker();
        }
      } catch (err) {
        console.error(`[PgmqWorker:${this.queue}] 스케일 체크 오류:`, err);
      }
    }, CHECK_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.scaleTimer);
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.workerCount = 0;
  }

  private spawnWorker() {
    // 5초마다 메시지 polling
    const timer = setInterval(async () => {
      try {
        const messages = await this.client.read(this.queue, 30, 10);
        for (const msg of messages) {
          await this.handler(msg);
          await this.client.archive(this.queue, msg.msg_id);
        }
      } catch (err) {
        console.error(`[PgmqWorker:${this.queue}] 처리 오류:`, err);
      }
    }, 5000);

    this.timers.push(timer);
    this.workerCount++;
  }

  private terminateWorker() {
    const timer = this.timers.pop();
    if (timer) clearInterval(timer);
    this.workerCount--;
  }
}
```

**DQ-11.3 확정 답변**: queue length > 100 시 워커 증설 (최대 5개), < 10 시 축소 (최소 1개). PM2 fork mode 고정 인스턴스보다 동적 스케일링이 우위 — 평상시 CPU/메모리 절약.

#### archive 정리 (DQ-1.31 답변 — node-cron, pg_cron 거부)

```typescript
// src/server/queue/pgmq-archive-cleaner.ts
import cron from 'node-cron';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

const QUEUES = ['thumbnail', 'email', 'pdf', 'cache_bust', 'webhook'] as const;
const RETENTION_DAYS = 7;

// 매일 02:00 KST (UTC 17:00) archive 정리
export function startArchiveCleaner() {
  cron.schedule('0 17 * * *', async () => {
    for (const queue of QUEUES) {
      try {
        // Prisma $executeRaw로 안전한 파라미터 바인딩
        const deleted = await prisma.$executeRaw(
          Prisma.sql`
            DELETE FROM pgmq.${Prisma.raw(`a_${queue}`)}
            WHERE archived_at < NOW() - INTERVAL '${Prisma.raw(String(RETENTION_DAYS))} days'
          `
        );
        console.log(`[ArchiveCleaner] ${queue}: ${deleted}건 정리`);
      } catch (err) {
        console.error(`[ArchiveCleaner] ${queue} 정리 오류:`, err);
      }
    }
  });
}
```

**DQ-1.31 확정 답변**: pg_cron 거부 (ADR-005: Node.js 핸들러가 80% 이상이므로 pg_cron은 큐 역할만 수행하게 됨 — 거부), pg_partman 거부 (추가 PG 확장 의존성, 단순성 원칙 위반). **node-cron 일 1회 직접 DELETE** 채택.

#### dead-letter 알림 (DQ-1.32 답변)

```typescript
// src/server/queue/dead-letter-handler.ts
import { RealtimeClient } from '@supabase/realtime-js';

interface DeadLetterPayload {
  queue:       string;
  msgId:       bigint;
  message:     Record<string, unknown>;
  readCt:      number;
  enqueuedAt:  Date;
}

export class DeadLetterHandler {
  private readonly MAX_RETRIES = 3;

  constructor(
    private pgmqClient: PgmqClient,
    private realtimeClient: RealtimeClient,
    private slackWebhookUrl: string,
  ) {}

  async processWithRetry(queue: string, msg: PgmqMessage): Promise<void> {
    if (msg.read_ct >= this.MAX_RETRIES) {
      // dead-letter 큐로 이동
      await this.pgmqClient.moveToDeadLetter(queue, msg.msg_id);

      // 알림 발송
      await this.notifyDeadLetter({
        queue,
        msgId:      msg.msg_id,
        message:    msg.message,
        readCt:     msg.read_ct,
        enqueuedAt: msg.enqueued_at,
      });
      return;
    }

    // 재시도 대기 (pgmq visibility timeout이 자동으로 메시지를 재노출)
    throw new Error(`재시도 예정 (read_ct: ${msg.read_ct}/${this.MAX_RETRIES})`);
  }

  private async notifyDeadLetter(payload: DeadLetterPayload) {
    // 알림 1: Slack webhook (fetch 사용 — child_process 미사용)
    await fetch(this.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[Dead Letter] 큐: ${payload.queue} | msg_id: ${payload.msgId}`,
        attachments: [{
          color: 'danger',
          fields: [
            { title: '큐',       value: payload.queue,              short: true  },
            { title: 'msg_id',   value: String(payload.msgId),      short: true  },
            { title: '재시도 횟수', value: String(payload.readCt),  short: true  },
            { title: '메시지',   value: JSON.stringify(payload.message).slice(0, 200), short: false },
          ],
        }],
      }),
    });

    // 알림 2: 대시보드 알림 (Realtime Channel Broadcast)
    await this.realtimeClient
      .channel('realtime:admin:notifications')
      .send({
        type: 'broadcast',
        event: 'dead_letter',
        payload: {
          queue:       payload.queue,
          msg_id:      String(payload.msgId),
          message:     payload.message,
          read_ct:     payload.readCt,
          enqueued_at: payload.enqueuedAt.toISOString(),
        },
      });
  }
}
```

**DQ-1.32 확정 답변**: Slack webhook + dashboard 알림(Realtime Channel Broadcast) 이중 알림. email은 별도 `email` 큐 워커로 처리 가능하나 dead-letter 자체 알림은 실시간성이 중요하므로 Slack + Realtime 우선.

### 3.3 GraphqlRouter (조건부 — pg_graphql 수요 트리거 2+ 시)

**역할**: pg_graphql 확장 기반 GraphQL 엔드포인트. Persisted Query 전용 (프로덕션).

**파일 위치**: `src/server/graphql/graphql-router.ts`

#### pg_graphql 수요 트리거 현황 (ADR-016)

4개 트리거 중 2개 이상 충족 시 도입:

| # | 트리거 | 현재 상태 | 충족 여부 |
|---|--------|----------|---------|
| 1 | 팀 > 1명 (CON-3 변경) | 1인 운영 중 | 미충족 |
| 2 | 모바일 클라이언트 추가 | 계획 없음 | 미충족 |
| 3 | 프론트엔드 팀이 GraphQL 요청 | 해당 없음 | 미충족 |
| 4 | 3-hop nested join 3건+ 등장 | 현재 0건 | 미충족 |

**현재 0/4 → 도입 보류**. 그러나 도입 24시간 내 가능 상태로 준비는 완료.

#### pg_graphql 도입 시 Route Handler 구조

```typescript
// src/app/api/graphql/route.ts (조건부)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PersistedQueryRegistry } from '@/server/graphql/persisted-query-registry';

const pqRegistry = new PersistedQueryRegistry();

export async function POST(req: NextRequest) {
  const body = await req.json();

  // DQ-1.25 답변: 프로덕션은 Persisted Query만 허용
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev && !body.extensions?.persistedQuery) {
    return NextResponse.json(
      { errors: [{ message: 'Persisted Query만 허용됩니다' }] },
      { status: 400 }
    );
  }

  // Persisted Query 검증
  const query: string | null = isDev
    ? (body.query as string)
    : await pqRegistry.resolve(body.extensions.persistedQuery.sha256Hash as string);

  if (!query) {
    return NextResponse.json(
      { errors: [{ message: 'Persisted Query를 찾을 수 없습니다' }] },
      { status: 404 }
    );
  }

  // pg_graphql 실행
  const result = await prisma.$queryRaw<[{ resolve: unknown }]>`
    SELECT graphql.resolve(
      query           => ${query}::text,
      variables       => ${JSON.stringify(body.variables ?? {})}::jsonb,
      "operationName" => ${body.operationName ?? null}::text
    )
  `;

  return NextResponse.json(result[0].resolve);
}
```

### 3.4 PersistedQueryRegistry (조건부)

**역할**: 사전 등록된 GraphQL 쿼리 해시 → 쿼리 문자열 매핑 저장소.

```typescript
// src/server/graphql/persisted-query-registry.ts
import { prisma } from '@/lib/db';

export class PersistedQueryRegistry {
  private cache = new Map<string, string>(); // in-memory 캐시

  async resolve(hash: string): Promise<string | null> {
    if (this.cache.has(hash)) return this.cache.get(hash)!;

    const pq = await prisma.pgGraphqlPersistedQuery.findUnique({
      where: { hash },
    });

    if (pq) {
      this.cache.set(hash, pq.query);
      return pq.query;
    }
    return null;
  }

  async register(hash: string, query: string, name?: string): Promise<void> {
    await prisma.pgGraphqlPersistedQuery.upsert({
      where:  { hash },
      create: { hash, query, name },
      update: { query, name },
    });
    this.cache.set(hash, query);
  }
}
```

### 3.5 IntrospectionCI (조건부 — pg_graphql 도입 시)

**역할**: Prisma 스키마와 pg_graphql introspection 간 드리프트 자동 감지. Node.js 네이티브 API만 사용 (child_process 미사용).

**파일 위치**: `scripts/introspection-ci.ts`

```typescript
// DQ-1.27 답변: Prisma DMMF + pg_graphql introspection diff 자동화
import { getDMMF } from '@prisma/sdk';
import { prisma } from '../src/lib/db';
import { readFileSync } from 'node:fs';

async function runIntrospectionCI() {
  // 1. Prisma DMMF에서 모델 이름 추출 (파일 읽기만 — child_process 미사용)
  const schemaPath = './prisma/schema.prisma';
  const schemaStr = readFileSync(schemaPath, 'utf-8');
  const dmmf = await getDMMF({ datamodelPath: schemaPath });
  const prismaModels = dmmf.datamodel.models.map(m => m.name);

  // 2. pg_graphql introspection (DB 직접 쿼리 — child_process 미사용)
  const result = await prisma.$queryRaw<[{ resolve: unknown }]>`
    SELECT graphql.resolve(
      query => '{ __schema { types { name kind } } }'::text
    )
  `;

  const schema = result[0].resolve as { data?: { __schema?: { types?: Array<{ name: string; kind: string }> } } };
  const graphqlTypes = (schema.data?.__schema?.types ?? [])
    .filter(t => t.kind === 'OBJECT' && !t.name.startsWith('__'))
    .map(t => t.name);

  // 3. 차이 감지
  // pg_graphql은 PascalCase 타입명을 Prisma 모델명과 동일하게 생성
  const missing = prismaModels.filter(m => !graphqlTypes.includes(m));
  const extra   = graphqlTypes
    .filter(t => !['Query', 'Mutation', 'PageInfo', 'Edge', 'Connection'].some(k => t.includes(k)))
    .filter(t => !prismaModels.includes(t));

  if (missing.length > 0 || extra.length > 0) {
    console.error('[IntrospectionCI] Drift 감지:');
    if (missing.length) console.error('  Prisma에만 있음:', missing);
    if (extra.length)   console.error('  pg_graphql에만 있음:', extra);
    process.exit(1); // CI 실패
  }

  console.log('[IntrospectionCI] OK — Prisma ↔ pg_graphql 동기화 확인');
  await prisma.$disconnect();
}

runIntrospectionCI().catch(async (err) => {
  console.error('[IntrospectionCI] 오류:', err);
  await prisma.$disconnect();
  process.exit(1);
});
```

---

## 4. REST 강화 상세 — PostgREST 호환 operator

### 4.1 지원 연산자 완전 목록

| 연산자 | URL 예시 | Prisma 매핑 | 설명 |
|--------|----------|------------|------|
| `eq` | `?filter[price][eq]=5000` | `{ price: { equals: 5000 } }` | 같음 |
| `neq` | `?filter[status][neq]=inactive` | `{ status: { not: 'inactive' } }` | 다름 |
| `gt` | `?filter[price][gt]=5000` | `{ price: { gt: 5000 } }` | 초과 |
| `gte` | `?filter[price][gte]=5000` | `{ price: { gte: 5000 } }` | 이상 |
| `lt` | `?filter[price][lt]=10000` | `{ price: { lt: 10000 } }` | 미만 |
| `lte` | `?filter[price][lte]=10000` | `{ price: { lte: 10000 } }` | 이하 |
| `like` | `?filter[name][like]=찌개` | `{ name: { contains: '찌개' } }` | 포함 (대소문자 구분) |
| `ilike` | `?filter[name][ilike]=찌개` | `{ name: { contains: '찌개', mode: 'insensitive' } }` | 포함 (대소문자 무시) |
| `in` | `?filter[id][in]=1,2,3` | `{ id: { in: [1,2,3] } }` | 목록 내 포함 |
| `nin` | `?filter[status][nin]=inactive,deleted` | `{ status: { notIn: [...] } }` | 목록 외 |
| `is` | `?filter[deleted_at][is]=null` | `{ deletedAt: null }` | null 체크 |
| `not` | `?filter[price][not]=0` | `{ price: { not: 0 } }` | 부정 |
| `json_path` | `?filter[meta][json_path]=nutrition.calories=gte.300` | `{ meta: { path: ['nutrition', 'calories'], gte: 300 } }` | **JSONB path (DQ-11.1)** |

### 4.2 Prisma 7 JsonFilter 호환성 (DQ-11.1)

**질문**: operator parser에서 JSONB path(`filter[meta.key]=value`) 지원 여부 — Prisma 7 JsonFilter 호환성 검증.

**답변**: **지원. Prisma 7 JsonFilter `path` + 비교 연산자로 완전 매핑 가능.**

```typescript
// Prisma 7 JsonFilter 사용 예시
const result = await prisma.menu.findMany({
  where: {
    meta: {
      path: ['nutrition', 'calories'],
      gte: 300,
    },
  },
});
// 생성 SQL: WHERE meta #>> '{nutrition,calories}' >= '300'
```

### 4.3 Cursor Pagination

```typescript
// src/server/data-api/cursor-paginator.ts
export function parseCursor(cursor: string): Record<string, unknown> {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
  return JSON.parse(decoded);
}

export function encodeCursor(record: Record<string, unknown>): string {
  const payload = JSON.stringify({ id: record['id'], createdAt: record['createdAt'] });
  return Buffer.from(payload).toString('base64url');
}

// GET /api/v1/data/menu?cursor=eyJpZCI6MTB9&limit=20&orderBy=created_at.asc
// → Prisma: { cursor: { id: 10 }, take: 20, orderBy: { createdAt: 'asc' }, skip: 1 }
```

---

## 5. pgmq 구조 상세

### 5.1 큐 목록과 워커

| 큐 이름 | 처리 내용 | 우선순위 | 평균 처리 시간 |
|--------|----------|---------|-------------|
| `thumbnail` | 이미지 리사이즈 + WebP 변환 | P0 | ~500ms |
| `email` | 이메일 발송 (nodemailer) | P0 | ~200ms |
| `pdf` | PDF 생성 (puppeteer) | P1 | ~2000ms |
| `cache_bust` | 캐시 무효화 신호 처리 | P0 | ~10ms |
| `webhook` | 외부 webhook 전송 (최대 3회 재시도) | P1 | ~300ms |

### 5.2 Outbox 패턴 구현

```typescript
// 트랜잭션 내에서 비즈니스 로직 + 큐 삽입 원자성 보장
const order = await prisma.$transaction(async (tx) => {
  // 1. 비즈니스 데이터 저장
  const newOrder = await tx.order.create({ data: orderData });

  // 2. 같은 트랜잭션에 pgmq 메시지 삽입 (Outbox)
  const jobPayload = {
    orderId:  newOrder.id,
    imageUrl: newOrder.imageUrl,
    sizes:    [100, 300, 800],
  };
  await tx.$queryRaw`
    SELECT pgmq.send('thumbnail', ${jobPayload}::jsonb)
  `;

  // 3. 트랜잭션 커밋 시 DB 쓰기와 큐 삽입이 원자적으로 완료
  return newOrder;
});
// 트랜잭션 실패 시 큐 메시지도 롤백 → 중복 처리 없음
```

### 5.3 워커 스케일링 결정 (DQ-11.3 확정)

```
단일 워커 유지 (기본 상태):
  queue_length ≤ 100
  → CPU/메모리 최소 사용
  → 5초 polling 인터벌 1개

워커 증설 트리거:
  queue_length > 100
  → PgmqScalingWorker가 감지 (30초 주기)
  → worker count +1 (최대 5)
  → 로그: "[PgmqWorker:thumbnail] 큐 길이 130 > 100 → 워커 증설"

워커 축소 트리거:
  queue_length < 10
  → worker count -1 (최소 1)
```

**DQ-11.3 최종 답변**: "PM2 fork mode 2개 고정" 대신 **동적 스케일링** 채택. 이유: 평상시 큐가 비어있는 경우가 대부분인데 2개 워커를 항상 유지하면 리소스 낭비. queue length > 100 임계값은 일반적인 배치 처리 부하에서 충분한 버퍼.

---

## 6. pg_graphql 수요 트리거 상세 (ADR-012, ADR-016 인용)

### 6.1 4 수요 트리거 정량화 (ADR-016 재확인)

pg_graphql 도입 = 아래 4개 중 **2개 이상** 충족 시 Phase 21+ 도입:

| 트리거 | 정량 기준 | 측정 방법 |
|--------|----------|----------|
| T1. 팀 > 1명 | CON-3 변경 확인 | 수동 기록 |
| T2. 모바일 클라이언트 | Capacitor/Expo 앱 PoC 시작 | 프로젝트 파일 생성 여부 |
| T3. 프론트엔드 팀 GraphQL 요청 | 명시적 요청 기록 | 이슈/슬랙 기록 |
| T4. 3-hop nested join 3건+ | `prisma.findMany({ include: { a: { include: { b: true } } } })` | 코드 grep |

**현재 상태**: 0/4 충족 → pg_graphql 도입 보류.

### 6.2 Persisted Query 허용 범위 (DQ-1.25)

**답변**: **프로덕션은 PQ-only. 개발 환경은 ad-hoc 허용.**

| 환경 | 쿼리 허용 범위 | 이유 |
|------|-------------|------|
| Production | **Persisted Query만** | 스키마 자동 노출 방지, SQL 인젝션 표면 최소화, 불필요한 introspection 차단 |
| Development | ad-hoc + Introspection | DX, 디버깅 편의 |
| Staging | Persisted Query만 | 프로덕션과 동일 검증 |

### 6.3 GraphQL + Realtime 통합 endpoint (DQ-1.26)

**답변**: **unified /graphql(Query/Mutation) + subscription은 Realtime 채널 위임.**

```
통합 설계:
  Query/Mutation  → /api/graphql (pg_graphql)
  Subscription    → /realtime/v1 WebSocket (Realtime Channel)

설계 근거:
  pg_graphql은 PostgreSQL 내부 SQL 함수로 실행됨
  → HTTP GraphQL만 처리 가능
  → WebSocket subscription 구조적 미지원
  Supabase도 동일 분리 구조 채택 (pg_graphql + Realtime 서버)
```

### 6.4 Introspection CI 자동화 (DQ-1.27)

**답변**: **Prisma DMMF(파일 읽기) + pg_graphql introspection(DB 직접 쿼리) diff 자동화 (CI 단계, pg_graphql 도입 시에만).**

(`§3.5` IntrospectionCI 구현 상세 참조)

---

## 7. 데이터 모델

### 7.1 api_keys_v2 테이블 (기존 v1 확장)

**목적**: rate limit per key + scope 추가.

```sql
-- 기존 api_keys 테이블 확장 (v2 신규 마이그레이션)
CREATE TABLE api_keys_v2 (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_prefix      TEXT        NOT NULL,               -- 'ypb_' + 8자 식별자
  key_hash        TEXT        NOT NULL UNIQUE,         -- SHA-256 해시 (Lucia 패턴)
  name            TEXT        NOT NULL,               -- 사용자 지정 이름
  scopes          TEXT[]      NOT NULL DEFAULT '{}',   -- 예: ['read:menu', 'write:orders']
  rate_limit_rpm  INT         NOT NULL DEFAULT 100,    -- 분당 요청 한계
  rate_limit_rph  INT         NOT NULL DEFAULT 1000,   -- 시간당 요청 한계
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                         -- NULL = 영구
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,                         -- NULL = 활성
  metadata        JSONB
);

-- 인덱스
CREATE INDEX idx_api_keys_v2_user_id    ON api_keys_v2(user_id);
CREATE INDEX idx_api_keys_v2_key_hash   ON api_keys_v2(key_hash);
CREATE INDEX idx_api_keys_v2_expires_at ON api_keys_v2(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_api_keys_v2_revoked    ON api_keys_v2(revoked_at) WHERE revoked_at IS NULL;
```

**Prisma 모델**:
```prisma
model ApiKeyV2 {
  id           BigInt    @id @default(autoincrement())
  userId       BigInt    @map("user_id")
  keyPrefix    String    @map("key_prefix")
  keyHash      String    @unique @map("key_hash")
  name         String
  scopes       String[]
  rateLimitRpm Int       @default(100)  @map("rate_limit_rpm")
  rateLimitRph Int       @default(1000) @map("rate_limit_rph")
  lastUsedAt   DateTime? @map("last_used_at")
  expiresAt    DateTime? @map("expires_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  revokedAt    DateTime? @map("revoked_at")
  metadata     Json?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([keyHash])
  @@map("api_keys_v2")
}
```

### 7.2 pg_graphql_persisted_queries 테이블 (조건부)

```sql
-- pg_graphql 도입 시에만 생성
CREATE TABLE pg_graphql_persisted_queries (
  hash        TEXT        PRIMARY KEY,     -- SHA-256 해시 (Apollo APQ 호환)
  query       TEXT        NOT NULL,        -- GraphQL 쿼리 문자열
  name        TEXT,                        -- 선택적 명칭
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  BIGINT      REFERENCES users(id)
);
```

**Prisma 모델 (조건부)**:
```prisma
model PgGraphqlPersistedQuery {
  hash      String    @id
  query     String
  name      String?
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt      @map("updated_at")
  createdBy BigInt?   @map("created_by")

  @@map("pg_graphql_persisted_queries")
}
```

---

## 8. UI — /dashboard/api

### 8.1 페이지 구조

```
/dashboard/api
├─ API Keys 탭
│   ├─ 키 목록 (prefix, name, scopes, rate limit, last_used_at)
│   ├─ 신규 키 발급 (name + scope 선택 + rate limit 설정)
│   ├─ 키 Revoke (revokedAt 갱신)
│   └─ 키 사용량 차트 (RPM/RPH 시계열, 최근 24h)
│
├─ 큐 상태 탭 (pgmq)
│   ├─ 큐별 length/oldest_msg_age/total_messages
│   ├─ 워커 현황 (active_workers per queue)
│   ├─ Dead Letter 목록 (queue_name, msg_id, read_ct, message 미리보기)
│   └─ 수동 재시도 버튼 (DLQ 메시지 → 원본 큐로 이동)
│
└─ GraphQL 탭 (조건부, pg_graphql 도입 시)
    ├─ 수요 트리거 현황 (0/4, 각 조건 충족 여부)
    ├─ Persisted Query 목록 (hash, name, 등록일)
    ├─ 신규 PQ 등록 (hash + query 입력)
    └─ Introspection 결과 미리보기 (개발 환경만)
```

### 8.2 Rate Limit 구현 (API Keys v2)

```typescript
// src/server/data-api/api-key-rate-limiter.ts
// in-memory sliding window (1인 운영 단일 프로세스 — Redis 미도입)
const rpmCounters = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(keyId: string, rpm: number): boolean {
  const now = Date.now();
  const windowMs = 60_000; // 1분

  const counter = rpmCounters.get(keyId);
  if (!counter || now - counter.windowStart > windowMs) {
    rpmCounters.set(keyId, { count: 1, windowStart: now });
    return true; // 통과
  }

  if (counter.count >= rpm) {
    return false; // 429 Too Many Requests
  }

  counter.count++;
  return true;
}
```

---

## 9. 통합 — 다른 카테고리와의 연결

### 9.1 Realtime(카테고리 9)와의 통합

- GraphQL Subscription → Realtime Channel 위임 (DQ-1.26, §6.3)
- pgmq `cache_bust` 워커가 Realtime Broadcast로 캐시 무효화 알림 전달

```typescript
// pgmq cache_bust 워커
async function processCacheBust(msg: PgmqMessage) {
  const { table, key } = msg.message as { table: string; key: unknown };

  // 1. 서버 캐시 무효화 (Next.js revalidateTag)
  // revalidateTag(`${table}:${key}`);

  // 2. 클라이언트 캐시 무효화 (Realtime Broadcast)
  await realtimeClient.channel('realtime:admin:cache').send({
    type: 'broadcast',
    event: 'cache_bust',
    payload: { table, key },
  });

  await pgmqClient.archive('cache_bust', msg.msg_id);
}
```

### 9.2 Auth Core(카테고리 5)와의 통합

- `api_keys_v2.key_hash` 인증: API 요청 시 `Authorization: Bearer ypb_xxxx` 헤더 검증
- scope 체크: `scopes` 배열 vs 요청 경로 매핑 (`read:menu` → `GET /api/v1/data/menu`)
- rate limit: in-memory sliding window, PM2 fork mode 단일 프로세스 전제

---

## 10. Wave 4 할당 DQ 답변 (7건)

### 10.1 DQ-1.25: Persisted Query 허용 범위

**답변**: **프로덕션은 PQ-only. 개발 환경은 ad-hoc 허용.**

근거: 스키마 자동 노출 차단, SQL 인젝션 표면 최소화. 개발 DX는 ad-hoc 허용으로 보완. (`§6.2` 상세 참조)

---

### 10.2 DQ-1.26: GraphQL + Realtime 통합 endpoint

**답변**: **unified /graphql(Query/Mutation) + subscription은 Realtime 채널 위임.**

근거: pg_graphql은 HTTP GraphQL만 처리 가능. WebSocket subscription은 Realtime Channel이 담당. 두 엔드포인트 분리가 각 컴포넌트 책임을 명확히 함. (`§6.3` 상세 참조)

---

### 10.3 DQ-1.27: Introspection CI 자동화

**답변**: **Prisma DMMF(파일 읽기) + pg_graphql introspection(DB 직접 쿼리) diff 자동화 (CI 단계, pg_graphql 도입 시에만).**

근거: 두 스키마 소스가 독립적으로 변경될 수 있어 drift 발생 가능. CI에서 자동 감지 → 빌드 실패로 강제. child_process 미사용, Node.js 네이티브 파일 읽기 + Prisma DB 직접 쿼리. (`§3.5` 상세 참조)

---

### 10.4 DQ-1.31: pgmq archive 정리

**답변**: **node-cron 일 1회 직접 DELETE. pg_cron 거부, pg_partman 거부.**

근거:
- pg_cron 거부: ADR-005 결정 — Node.js 핸들러가 80% 이상이므로 pg_cron은 큐 역할만 수행하게 됨. 단순성 원칙 위반.
- pg_partman 거부: 추가 PG 확장 의존성. 7일 TTL archive 정리에는 단순 DELETE로 충분.
- node-cron: 기존 `cron-worker` PM2 앱에 추가하면 관리 오버헤드 0.

```
정리 정책: archive 테이블에서 7일 이상 된 레코드 일 1회 02:00 KST 삭제
```

---

### 10.5 DQ-1.32: pgmq dead-letter 알림

**답변**: **Slack webhook + dashboard 알림(Realtime Channel Broadcast) 이중 알림.**

근거:
- Slack webhook: 운영자 즉시 인지 (모바일 알림)
- Realtime Channel Broadcast: 대시보드 접속 중 실시간 배지 표시
- 최대 재시도 3회 후 dead-letter 이동 + 양쪽 알림 동시 발송

(`§3.2` dead-letter 구현 상세 참조)

---

### 10.6 DQ-11.1: JSONB path filter

**답변**: **지원. Prisma 7 JsonFilter `path` + 비교 연산자로 완전 매핑.**

근거: Prisma 7 `JsonFilter` 타입이 `path: string[]` + 비교 연산자(`gte`, `lte`, `gt`, `lt`, `equals`)를 지원. URL 파라미터 `filter[meta][json_path]=nutrition.calories=gte.300`을 파싱하여 Prisma 쿼리로 변환. (`§4.1`, `§4.2` 상세 참조)

---

### 10.7 DQ-11.3: pgmq worker 스케일링

**답변**: **queue length > 100 시 worker 증설 (최대 5개), < 10 시 축소 (최소 1개). PM2 고정 인스턴스 대신 동적 스케일링.**

근거: 평상시 큐 비어있는 경우가 대부분 → 2개 고정은 리소스 낭비. 30초 주기 체크로 오버헤드 최소. 최대 5개는 WSL2 환경 단일 CPU 4코어 기준 여유 한계.

(`§5.3` 상세 참조)

---

## 11. Phase 21 WBS (~25h)

### 11.1 Phase 21-A: REST 강화 (8h)

| 작업 | 공수 | 산출물 |
|------|:----:|--------|
| OperatorParser 확장 (12 연산자 + json_path) | 2h | `src/server/data-api/operator-parser.ts` |
| OrderByParser + CursorPaginator | 1.5h | `src/server/data-api/cursor-paginator.ts` |
| OptimisticLockGuard (If-Match 헤더) | 1.5h | `src/server/data-api/optimistic-lock-guard.ts` |
| OpenAPI 3.1 자동 생성 스크립트 (DMMF 기반) | 2h | `scripts/openapi-emit.ts` |
| `/api/v1/__meta__/schema` 엔드포인트 | 1h | `src/app/api/v1/__meta__/schema/route.ts` |

### 11.2 Phase 21-B: pgmq (10h)

| 작업 | 공수 | 산출물 |
|------|:----:|--------|
| pgmq 확장 설치 + 5개 큐 생성 SQL | 0.5h | `prisma/migrations/pgmq-setup.sql` |
| PgmqClient 구현 (send/read/archive) | 2h | `src/server/queue/pgmq-client.ts` |
| PgmqScalingWorker 구현 (동적 스케일링) | 2h | `src/server/queue/pgmq-worker.ts` |
| 5개 큐 워커 핸들러 구현 | 2h | `src/server/queue/handlers/*.ts` |
| archive 정리 node-cron (일 1회) | 0.5h | `src/server/queue/pgmq-archive-cleaner.ts` |
| dead-letter 알림 (Slack fetch + Realtime) | 1.5h | `src/server/queue/dead-letter-handler.ts` |
| pgmq 통합 테스트 (send → receive → archive) | 1.5h | `*.integration.test.ts` |

### 11.3 Phase 21-C: API Keys v2 + UI (5h)

| 작업 | 공수 | 산출물 |
|------|:----:|--------|
| api_keys_v2 테이블 마이그레이션 | 0.5h | Prisma migration |
| API Key 인증 미들웨어 (scope + rate limit) | 1.5h | `src/middleware/api-key-auth.ts` |
| `/dashboard/api` 페이지 (키 목록 + 큐 상태) | 2h | `src/app/dashboard/api/page.tsx` |
| 사용량 차트 컴포넌트 (Recharts) | 1h | `src/components/data-api/api-key-usage-chart.tsx` |

### 11.4 Phase 21-D: pg_graphql (조건부, +0h 현재)

| 작업 | 공수 | 산출물 | 트리거 조건 |
|------|:----:|--------|------------|
| pg_graphql 확장 설치 + GraphqlRouter | 2h | `src/app/api/graphql/route.ts` | 4 트리거 중 2+ 충족 |
| PersistedQueryRegistry + DB 테이블 | 1h | PQ Registry | 동일 |
| IntrospectionCI 스크립트 + CI 연동 | 1h | `scripts/introspection-ci.ts` | 동일 |
| GraphQL 탭 UI | 1h | dashboard UI | 동일 |
| **조건부 합계** | **5h** | | |

### 11.5 WBS 요약

| Phase | 작업 구분 | 공수 | 누적 점수 |
|-------|----------|:----:|:--------:|
| 21-A | REST 강화 (operator + 낙관적 락 + OpenAPI) | 8h | 65점 |
| 21-B | pgmq (워커 + archive + dead-letter) | 10h | 80점 |
| 21-C | API Keys v2 + UI | 5h | **85점** |
| 21-D | pg_graphql (조건부) | 5h (트리거 시) | 100점 |
| **합계 (즉시)** | | **23h** | **85점** |
| **합계 (조건부 포함)** | | **28h** | **100점** |

---

## 부록 A. 환경 변수

```env
# .env.local
PGMQ_ENABLED=true
PGMQ_ARCHIVE_RETENTION_DAYS=7
PGMQ_MAX_RETRIES=3
PGMQ_SCALE_UP_THRESHOLD=100
PGMQ_SCALE_DOWN_THRESHOLD=10
PGMQ_MAX_WORKERS=5
PGMQ_CHECK_INTERVAL_MS=30000

# dead-letter 알림
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx

# GraphQL (조건부)
PG_GRAPHQL_ENABLED=false
PG_GRAPHQL_ALLOW_ADHOC=false

# API Keys v2
API_KEY_RATE_LIMIT_RPM_DEFAULT=100
API_KEY_RATE_LIMIT_RPH_DEFAULT=1000
```

---

## 부록 B. 위험 등록부

| ID | 리스크 | 확률 | 영향 | 완화 |
|----|--------|:---:|:---:|------|
| R-DA-1 | pgmq apt 패키지 부재 → pgrx 소스 빌드 필요 | 중 | 중 | Tembo APT 리포지토리 추가 (공식 설치 가이드 따름) |
| R-DA-2 | PG 마이너 업그레이드 후 pgmq ABI 불일치 | 저 | 고 | `dpkg --hold postgresql-15`, 업그레이드 전 스테이징 dry-run |
| R-DA-3 | OperatorParser IDOR/SQLi | 저 | 치명 | Prisma parametrize 강제 + zod 검증 + 화이트리스트 컬럼만 허용 |
| R-DA-4 | pgmq archive 무한 누적 → 디스크 폭증 | 중 | 중 | node-cron 일 1회 DELETE + 디스크 사용량 경고 알림 |
| R-DA-5 | GraphQL 선제 도입 후 미사용 표면만 노출 | 중 | 고 | 수요 트리거 2+ 충족 전 도입 금지 (코드 배포 금지) |
| R-DA-6 | JSONB path filter deep nesting 의도치 않은 조회 | 저 | 중 | 최대 depth 3 제한, 실행 계획 확인 (`EXPLAIN ANALYZE`) |

---

## 부록 C. 테스트 전략

### C.1 단위 테스트 (Vitest)

```typescript
// OperatorParser — 모든 13 연산자 검증
describe('OperatorParser', () => {
  it('eq 연산자', () => {
    expect(parseOperator('price', 'eq', '5000')).toEqual({ price: { equals: 5000 } });
  });
  it('json_path 연산자 — Prisma 7 JsonFilter 호환', () => {
    expect(parseOperator('meta', 'json_path', 'nutrition.calories=gte.300')).toEqual({
      meta: { path: ['nutrition', 'calories'], gte: 300 },
    });
  });
  it('in 연산자 — 배열 파싱', () => {
    expect(parseOperator('id', 'in', '1,2,3')).toEqual({ id: { in: [1, 2, 3] } });
  });
  it('SQL 인젝션 차단 — 컬럼 화이트리스트', () => {
    expect(() => parseOperator("1=1;DROP TABLE menu;--", 'eq', '1')).toThrow('허용되지 않은 컬럼');
  });
});
```

### C.2 통합 테스트

```typescript
it('menu POST → pgmq thumbnail 큐에 메시지 삽입', async () => {
  const res = await fetch('/api/v1/data/menu', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testApiKey}`,
    },
    body: JSON.stringify({ name: '테스트메뉴', price: 9000, imageUrl: 'https://example.com/img.jpg' }),
  });
  expect(res.status).toBe(201);

  const msgs = await pgmqClient.read('thumbnail', 30, 1);
  expect(msgs[0]?.message['imageUrl']).toBe('https://example.com/img.jpg');
});

it('API Key rate limit 초과 시 429 반환', async () => {
  // RPM=1로 제한된 테스트 키 사용
  await fetch('/api/v1/data/menu', { headers: { Authorization: `Bearer ${lowRpmKey}` } });
  const res = await fetch('/api/v1/data/menu', { headers: { Authorization: `Bearer ${lowRpmKey}` } });
  expect(res.status).toBe(429);
});

it('Outbox 패턴 — 트랜잭션 롤백 시 큐 메시지도 롤백', async () => {
  await expect(
    prisma.$transaction(async (tx) => {
      await pgmqClient.sendInTransaction(tx, 'thumbnail', { test: true });
      throw new Error('강제 롤백');
    })
  ).rejects.toThrow('강제 롤백');

  const msgs = await pgmqClient.read('thumbnail', 30, 1);
  expect(msgs.find(m => (m.message as any).test === true)).toBeUndefined();
});
```

---

## 부록 Z. 근거 인덱스

| 섹션 | 근거 문서 |
|------|----------|
| §1 채택안 | `01-research/11-data-api/04-data-api-matrix.md` §12 |
| §1 ADR-012 | `02-architecture/01-adr-log.md §ADR-012` |
| §1 ADR-016 | `02-architecture/01-adr-log.md §ADR-016` |
| §3.2 pgmq | `01-research/11-data-api/03-pgmq-vs-bullmq-vs-sqlite-queue-deep-dive.md` |
| §3.3 pg_graphql | `01-research/11-data-api/01-pg-graphql-deep-dive.md` |
| §4 REST operator | `01-research/11-data-api/04-data-api-matrix.md §2` |
| §5 pgmq 큐 구조 | `01-research/11-data-api/04-data-api-matrix.md §16` |
| §6 수요 트리거 | `00-vision/07-dq-matrix.md §3.10` |
| §10 DQ 답변 | `00-vision/07-dq-matrix.md §3.10 (DQ-1.25~1.32, DQ-11.1~11.3)` |
| §11 WBS | `00-vision/10-14-categories-priority.md §4.1 (Phase 21)` |

### Z.1 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent W4-B5-DAPI (Sonnet 4.6) | Wave 4 Tier 2 초안 — Phase 21 청사진 완성 |

---

> **문서 끝.** Wave 4 · B5 Data Delivery · Data API Blueprint · 2026-04-18 · 45점 → 85점(즉시)/100점(조건부) · Phase 21 · ~25h(즉시)/~28h(조건부)
