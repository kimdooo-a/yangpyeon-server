# 01. PostgreSQL 확장 통합 — wal2json · pgmq · pg_graphql (조건부)

> **Wave 4 · Tier 3 · I1 Integration 클러스터 (Agent I1-A)**
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [04-integration/](./) → **이 문서**
> 연관: [02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) · [02-architecture/11-realtime-blueprint.md](../02-architecture/11-realtime-blueprint.md) · [02-architecture/13-db-ops-blueprint.md](../02-architecture/13-db-ops-blueprint.md) · [02-architecture/15-data-api-blueprint.md](../02-architecture/15-data-api-blueprint.md)
> ADR: ADR-005 (node-cron, pg_cron 거부), ADR-010 (wal2json 채택), ADR-012 (pgmq 채택, pg_graphql 조건부), ADR-016 (pg_graphql 수요 트리거 4 정량화)
> DQ 답변: DQ-1.25, DQ-1.26, DQ-1.27, DQ-1.31, DQ-RT-5

---

## 목차

- [0. 문서 목적](#0-문서-목적)
- [1. PostgreSQL 버전 고정 및 호환 매트릭스](#1-postgresql-버전-고정-및-호환-매트릭스)
- [2. wal2json 통합 (Realtime CDC)](#2-wal2json-통합-realtime-cdc)
- [3. pgmq 통합 (Data API Outbox)](#3-pgmq-통합-data-api-outbox)
- [4. pg_graphql 통합 (조건부)](#4-pg_graphql-통합-조건부)
- [5. 거부된 확장 — pg_cron · pgsodium · pg_partman](#5-거부된-확장--pg_cron--pgsodium--pg_partman)
- [6. 백업 시 확장 보존](#6-백업-시-확장-보존)
- [7. 복구 드릴 — 확장 재설치 자동화](#7-복구-드릴--확장-재설치-자동화)
- [8. 성능 영향 분석](#8-성능-영향-분석)
- [9. 보안 경계](#9-보안-경계)
- [10. 운영 체크리스트](#10-운영-체크리스트)
- [부록 Z. 근거 인덱스](#부록-z-근거-인덱스)

---

## 0. 문서 목적

### 0.1 이 문서의 역할

양평 부엌 서버 대시보드에서 채택한 PostgreSQL 확장 **3종(wal2json 채택, pgmq 채택, pg_graphql 조건부)**의 설치·설정·운영 계약을 정의한다. 각 확장의 설치 명령, 설정 파일 변경, 권한 스코프, 성능 영향, 복구 절차를 구체적인 SQL·셸 명령어와 함께 기술한다.

거부된 확장(pg_cron, pgsodium, pg_partman)의 거부 근거도 재확인하여, 미래 운영자(미래의 김도영 포함)가 "왜 이 확장이 없는가"를 즉시 파악할 수 있도록 한다.

### 0.2 적용 범위

| 확장 | 상태 | 사용 카테고리 | 도입 Phase |
|------|------|------------|-----------|
| wal2json | 채택 (Accepted) | Realtime (9) | Phase 19 |
| pgmq | 채택 (Accepted) | Data API (11) | Phase 21 |
| pg_graphql | 조건부 (4 트리거 중 2+) | Data API (11) | Phase 21+ |
| pg_cron | 거부 (ADR-005) | — | 해당 없음 |
| pgsodium | 거부 (ADR-013) | — | 해당 없음 |
| pg_partman | 거부 (이 문서 §5.3) | — | 해당 없음 |

---

## 1. PostgreSQL 버전 고정 및 호환 매트릭스

### 1.1 PostgreSQL 15 고정 근거

양평 대시보드는 **PostgreSQL 15.x**를 고정한다. 버전 선택의 근거:

1. **wal2json 호환성**: wal2json v2.5+는 PG 10~17 지원. PG 15에서 검증된 안정 빌드 존재 (`apt-get install postgresql-15-wal2json` on Ubuntu 22.04).
2. **pgmq 호환성**: pgmq 1.4+는 PG 13~17 지원. PG 15에서 `pgrx` 기반 빌드 검증됨.
3. **pg_graphql 조건부**: pg_graphql 1.5+는 PG 13~16 지원(PG 17 지원은 1.5.7+ 기준). PG 15에서 안정적.
4. **Prisma 7 호환성**: Prisma 7은 PG 9.6~17 지원. PG 15에서 공식 테스트 완료.
5. **WSL2 Ubuntu 22.04 패키지 가용성**: `apt.postgresql.org` 저장소에서 PG 15 패키지 + 확장 패키지 모두 가용.

**버전 업그레이드 전 검토 필수**: PG 16, 17로의 업그레이드 전에 아래 호환 매트릭스를 재확인해야 한다.

### 1.2 확장 버전 호환 매트릭스

| 확장 | 최소 버전 | PG 14 | PG 15 | PG 16 | PG 17 | 설치 방법 |
|------|---------|:-----:|:-----:|:-----:|:-----:|---------|
| wal2json | v2.5 | 지원 | **지원 (채택)** | 지원 | 지원 | apt 패키지 |
| wal2json | v2.6 | 지원 | 지원 | 지원 | 지원 | apt 패키지 |
| pgmq | 1.4.0 | 지원 | **지원 (채택)** | 지원 | 지원 | pgrx 빌드 또는 Docker 레이어 |
| pgmq | 1.4.4 | 지원 | 지원 | 지원 | 지원 | pgrx 빌드 |
| pg_graphql | 1.4.0 | 지원 | **지원 (조건부)** | 지원 | 미지원 | pgrx 빌드 |
| pg_graphql | 1.5.7+ | 지원 | 지원 | 지원 | 지원 | pgrx 빌드 |
| pg_cron | 1.6 | 지원 | 지원 | 지원 | 지원 | **거부** (ADR-005) |
| pgsodium | 3.0 | 지원 | 지원 | 지원 | 미지원 | **거부** (ADR-013) |

**중요**: PG 15 → PG 16 업그레이드 시 pg_graphql 1.4.x 미지원 → 1.5.7+로 업그레이드 필수. 업그레이드 전 introspection diff CI 실행 필수 (DQ-1.27).

### 1.3 현재 설치 상태 확인 SQL

```sql
-- 현재 설치된 확장 목록 조회
SELECT name, default_version, installed_version, comment
FROM pg_available_extensions
WHERE name IN ('wal2json', 'pgmq', 'pg_graphql', 'pg_cron', 'pgsodium')
ORDER BY name;

-- 활성화된 확장만 조회
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('wal2json', 'pgmq', 'pg_graphql')
ORDER BY extname;
```

---

## 2. wal2json 통합 (Realtime CDC)

### 2.1 wal2json 역할 (ADR-010 요약)

wal2json은 PostgreSQL Logical Replication의 출력 플러그인이다. WAL(Write-Ahead Log)에서 DML 변경(INSERT/UPDATE/DELETE)을 JSON 형식으로 디코딩하여 Node.js WALConsumer에 전달한다. 이것이 Realtime CDC 계층의 핵심이다 (ADR-010 "wal2json은 수도관").

wal2json 단독으로는 Realtime 55점 이상을 달성할 수 없다. Channel 계층(supabase-realtime 포팅)과 결합해야 100점에 도달한다 (`11-realtime-blueprint.md §1.2`).

### 2.2 설치 절차 (WSL2 Ubuntu 22.04)

#### Step 1. PostgreSQL apt 저장소 확인

```bash
# apt.postgresql.org 저장소 추가 (이미 추가된 경우 생략)
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list'
sudo apt update
```

#### Step 2. wal2json 패키지 설치

```bash
# PG 15 전용 wal2json 패키지 설치
sudo apt install -y postgresql-15-wal2json

# 설치 확인
apt show postgresql-15-wal2json 2>/dev/null | grep -E "Package|Version"
# 예상 출력: Package: postgresql-15-wal2json / Version: 2.5-1.pgdg22.04+1

# 플러그인 파일 위치 확인
ls -la /usr/lib/postgresql/15/lib/wal2json.so
```

#### Step 3. wal2json은 `CREATE EXTENSION` 없이 사용

wal2json은 Logical Replication의 **출력 플러그인**이므로 `CREATE EXTENSION`을 실행하지 않는다. `.so` 파일이 PG lib 경로에 있으면 자동으로 사용 가능하다.

```sql
-- wal2json 플러그인 사용 가능 여부 확인 (에러 없으면 성공)
SELECT pg_create_logical_replication_slot('test_slot', 'wal2json');
SELECT pg_drop_replication_slot('test_slot');
```

### 2.3 postgresql.conf 수정

`/etc/postgresql/15/main/postgresql.conf`에 다음 설정을 추가한다.

```ini
# wal2json Logical Replication 필수 설정
# 기본값은 'replica', logical로 변경 필요 — PG 재시작 필요
wal_level = logical

# Replication Slot 최대 수: wal2json 2개 (DQ-RT-5 슬롯 분리) + 여유 1개
max_replication_slots = 5

# WAL Sender 프로세스 최대 수 (슬롯 수 이상으로 설정)
max_wal_senders = 5

# 슬롯 WAL 보관 상한: 2GB (디스크 폭발 방지)
# DQ-RT-5: ypb_cdc_slot 지연 최대 2GB까지 허용
max_slot_wal_keep_size = 2GB

# WAL 압축 (PG 14+): 디스크 사용 최적화
wal_compression = on

# 1인 운영: synchronous_commit은 local 유지 (성능 vs 내구성 균형)
synchronous_commit = local
```

**변경 후 PG 재시작**:
```bash
sudo systemctl restart postgresql@15-main

# 재시작 후 wal_level 확인
psql -U postgres -c "SHOW wal_level;"
# 출력: logical
```

### 2.4 Replication Slot 생성 SQL (DQ-RT-5: 2개 분리)

DQ-RT-5는 "단일 슬롯 vs 복수 슬롯" 질문에 대해 **2개 분리**를 답변한다:
- `ypb_cdc_slot`: Node.js WALConsumer (Realtime 서비스)
- `ypb_ops_slot`: DB Ops 모니터링 전용 (wal-g WAL 아카이브 검증)

```sql
-- WALConsumer 전용 슬롯 생성 (Realtime 서비스)
SELECT pg_create_logical_replication_slot(
  'ypb_cdc_slot',     -- 슬롯 이름
  'wal2json'          -- 출력 플러그인
);

-- DB Ops 모니터링 전용 슬롯 (선택적, wal-g 아카이브 검증용)
SELECT pg_create_logical_replication_slot(
  'ypb_ops_slot',
  'wal2json'
);

-- 슬롯 상태 확인
SELECT slot_name, plugin, slot_type, active, restart_lsn, confirmed_flush_lsn,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag
FROM pg_replication_slots;
```

**PUBLICATION 생성** (Realtime 대상 테이블 정의):

```sql
-- 모든 테이블의 INSERT/UPDATE/DELETE를 CDC 대상으로 등록
-- PUBLICATION은 트리거가 아닌 WAL 레벨 설정
CREATE PUBLICATION ypb_pub FOR ALL TABLES
  WITH (publish = 'insert,update,delete');

-- 또는 특정 테이블만 (보안 강화 시)
-- CREATE PUBLICATION ypb_pub FOR TABLE menu, orders, inventory, users;

-- PUBLICATION 확인
SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete
FROM pg_publication;
```

### 2.5 연결 인증 (pg_hba.conf)

`/etc/postgresql/15/main/pg_hba.conf`에 Replication 연결 허용 행 추가:

```
# wal2json WALConsumer 전용 사용자 replication 연결 허용
# TYPE    DATABASE        USER            ADDRESS         METHOD
local     replication     ypb_cdc         127.0.0.1/32    scram-sha-256
host      replication     ypb_cdc         127.0.0.1/32    scram-sha-256
```

**WALConsumer 전용 사용자 생성**:

```sql
-- Replication 전용 사용자 (슈퍼유저 아님, 최소 권한)
CREATE USER ypb_cdc
  WITH REPLICATION
  PASSWORD 'strong_password_here'
  CONNECTION LIMIT 5;

-- Vault에 비밀번호 저장 필수 (ADR-013)
-- INSERT INTO vault_secrets (name, secret) VALUES ('pg_cdc_password', ...);

-- 사용자 권한 확인
SELECT usename, userepl FROM pg_user WHERE usename = 'ypb_cdc';
```

**pg_hba.conf 리로드** (PG 재시작 불필요):
```bash
sudo -u postgres psql -c "SELECT pg_reload_conf();"
```

### 2.6 Node.js WALConsumer 연결 설정

```typescript
// src/lib/realtime/wal-consumer.ts
import { LogicalReplicationService, Wal2JsonPlugin } from 'pg-logical-replication';
import { getVaultSecret } from '@/lib/observability/vault-service';

export async function createWALConsumer() {
  const password = await getVaultSecret('pg_cdc_password');

  const service = new LogicalReplicationService({
    host: '127.0.0.1',
    port: 5432,
    database: 'luckystyle4u',
    user: 'ypb_cdc',
    password,
  }, {
    acknowledge: { auto: false, timeoutSeconds: 10 },
  });

  const plugin = new Wal2JsonPlugin({
    includeTimestamp: true,
    includeTypes: true,
    includeTypmod: true,
    // 변경 타입: INSERT, UPDATE, DELETE 모두 포함
    actions: ['insert', 'update', 'delete'],
  });

  return { service, plugin };
}
```

### 2.7 버전 업그레이드 절차

PG 15 → PG 16 업그레이드 시 wal2json 재설치 절차:

```bash
# Step 1. 기존 슬롯 삭제 (업그레이드 전 반드시 실행)
psql -U postgres -c "SELECT pg_drop_replication_slot('ypb_cdc_slot');"
psql -U postgres -c "SELECT pg_drop_replication_slot('ypb_ops_slot');"

# Step 2. PG 15 중지
sudo systemctl stop postgresql@15-main

# Step 3. pg_upgrade 실행 (PG 16 설치 후)
sudo -u postgres /usr/lib/postgresql/16/bin/pg_upgrade \
  -b /usr/lib/postgresql/15/bin \
  -B /usr/lib/postgresql/16/bin \
  -d /var/lib/postgresql/15/main \
  -D /var/lib/postgresql/16/main \
  -o '-c config_file=/etc/postgresql/15/main/postgresql.conf' \
  -O '-c config_file=/etc/postgresql/16/main/postgresql.conf'

# Step 4. PG 16용 wal2json 패키지 설치
sudo apt install -y postgresql-16-wal2json

# Step 5. PG 16 시작 + 설정 재적용
sudo systemctl start postgresql@16-main

# Step 6. Replication Slot 재생성 (§2.4 SQL 재실행)
psql -U postgres -f scripts/db/create-replication-slots.sql
```

---

## 3. pgmq 통합 (Data API Outbox)

### 3.1 pgmq 역할 (ADR-012 요약)

pgmq는 PostgreSQL 위에서 동작하는 **메시지 큐 확장**이다. Data API의 Outbox 패턴 구현에 사용된다. 비동기 작업(썸네일 생성, 이메일 발송, PDF 생성, 캐시 무효화, Webhook 발송)을 트랜잭션 일관성을 유지하면서 큐에 넣고, PgmqWorker가 소비한다.

pgmq를 선택한 이유:
1. **동일 트랜잭션 내 메시지 발행**: `INSERT INTO menu ... ; SELECT pgmq.send('thumbnail', ...)` — 메뉴 저장과 썸네일 요청이 한 트랜잭션으로 묶임. 메뉴 저장 실패 시 큐 메시지도 자동 롤백.
2. **PostgreSQL 내장**: Redis 등 별도 브로커 불필요 (AP-5, CON-9)
3. **at-least-once 보장**: visibility timeout 기반, 워커 실패 시 메시지 자동 재노출

### 3.2 pgmq 설치

pgmq는 `pgrx` 기반 확장이므로 빌드하거나 빌드된 패키지를 사용한다.

#### 옵션 A: Trunk (권장, 빌드 불필요)

```bash
# trunk: PostgreSQL extension 패키지 관리자
# https://pgt.dev/extensions/pgmq
cargo install pg-trunk

# pgmq 1.4.4 설치 (PG 15 기준)
trunk install pgmq --pg-config /usr/lib/postgresql/15/bin/pg_config
```

#### 옵션 B: apt 패키지 (Supabase 공식 저장소)

```bash
# Supabase 제공 패키지 (Ubuntu 22.04 + PG 15)
curl -sL https://apt.supabase.io/setup.sh | sudo bash
sudo apt install -y postgresql-15-pgmq
```

#### 옵션 C: 소스 빌드 (최후 수단)

```bash
# Rust + pgrx 환경 필요
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --locked cargo-pgrx
cargo pgrx init --pg15 /usr/lib/postgresql/15/bin/pg_config

git clone https://github.com/tembo-io/pgmq.git
cd pgmq
cargo pgrx install --pg-config /usr/lib/postgresql/15/bin/pg_config
```

#### pgmq 확장 활성화

```sql
-- pgmq는 shared_preload_libraries 없이도 동작 (pg_cron과 차이점!)
CREATE EXTENSION IF NOT EXISTS pgmq;

-- 설치 확인
SELECT extname, extversion FROM pg_extension WHERE extname = 'pgmq';
```

### 3.3 Queue 생성 SQL + 권한

```sql
-- pgmq 큐 5개 생성 (Data API Blueprint §3.2 참조)
SELECT pgmq.create('thumbnail');
SELECT pgmq.create('email');
SELECT pgmq.create('pdf');
SELECT pgmq.create('cache-bust');
SELECT pgmq.create('webhook');

-- 큐 목록 확인
SELECT queue_name, is_unlogged, is_partitioned, created_at
FROM pgmq.list_queues();

-- 큐 통계 조회
SELECT queue_name, queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages
FROM pgmq.metrics_all();
```

**권한 설정** (최소 권한 원칙):

```sql
-- 애플리케이션 사용자: 큐 발행/소비만 허용
GRANT EXECUTE ON FUNCTION pgmq.send(text, jsonb) TO ypb_app;
GRANT EXECUTE ON FUNCTION pgmq.send(text, jsonb, integer) TO ypb_app;
GRANT EXECUTE ON FUNCTION pgmq.read(text, integer, integer) TO ypb_app;
GRANT EXECUTE ON FUNCTION pgmq.delete(text, bigint) TO ypb_app;
GRANT EXECUTE ON FUNCTION pgmq.archive(text, bigint) TO ypb_app;
GRANT EXECUTE ON FUNCTION pgmq.pop(text) TO ypb_app;

-- 큐 테이블 접근 권한
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA pgmq TO ypb_app;
GRANT USAGE ON SCHEMA pgmq TO ypb_app;

-- 관리자만 큐 생성/삭제 가능
REVOKE EXECUTE ON FUNCTION pgmq.create(text) FROM ypb_app;
REVOKE EXECUTE ON FUNCTION pgmq.drop_queue(text) FROM ypb_app;
```

### 3.4 메시지 발행 및 소비 패턴

```typescript
// src/lib/data-api/pgmq/queue-client.ts
import { prisma } from '@/lib/prisma';

export class PgmqClient {
  // 단일 메시지 발행
  async send(queue: string, msg: Record<string, unknown>, delaySeconds = 0): Promise<bigint> {
    const result = await prisma.$queryRaw<[{ send: bigint }]>`
      SELECT pgmq.send(${queue}, ${JSON.stringify(msg)}::jsonb, ${delaySeconds}::integer)
    `;
    return result[0].send;
  }

  // 배치 발행 (트랜잭션 내 사용 권장)
  async sendBatch(queue: string, msgs: Record<string, unknown>[]): Promise<bigint[]> {
    const jsonMsgs = msgs.map(m => JSON.stringify(m));
    const result = await prisma.$queryRaw<[{ send_batch: bigint[] }]>`
      SELECT pgmq.send_batch(${queue}, ARRAY[${jsonMsgs.map(m => `${m}::jsonb`).join(',')}]::jsonb[])
    `;
    return result[0].send_batch;
  }

  // 메시지 읽기 (visibility timeout: 30초)
  async read(queue: string, vt = 30, qty = 1) {
    return prisma.$queryRaw<Array<{
      msg_id: bigint;
      read_ct: number;
      enqueued_at: Date;
      vt: Date;
      message: Record<string, unknown>;
    }>>`
      SELECT * FROM pgmq.read(${queue}, ${vt}, ${qty})
    `;
  }

  // 처리 완료 후 삭제
  async delete(queue: string, msgId: bigint): Promise<boolean> {
    const result = await prisma.$queryRaw<[{ delete: boolean }]>`
      SELECT pgmq.delete(${queue}, ${msgId}::bigint)
    `;
    return result[0].delete;
  }

  // 처리 완료 후 archive (나중에 감사 목적 조회 가능)
  async archive(queue: string, msgId: bigint): Promise<boolean> {
    const result = await prisma.$queryRaw<[{ archive: boolean }]>`
      SELECT pgmq.archive(${queue}, ${msgId}::bigint)
    `;
    return result[0].archive;
  }
}
```

**트랜잭션 내 Outbox 패턴 (핵심 사용 패턴)**:

```typescript
// 메뉴 저장 + 썸네일 생성 요청을 하나의 트랜잭션으로
async function createMenuWithThumbnail(data: MenuCreateInput) {
  return prisma.$transaction(async (tx) => {
    // 1. 메뉴 저장
    const menu = await tx.menu.create({ data });

    // 2. 같은 트랜잭션 내 썸네일 큐 발행
    await tx.$queryRaw`
      SELECT pgmq.send(
        'thumbnail',
        ${JSON.stringify({ menuId: menu.id, imageUrl: menu.imageUrl })}::jsonb
      )
    `;

    return menu;
  });
  // 메뉴 저장 실패 시 큐 발행도 자동 롤백 — Outbox 패턴 핵심
}
```

### 3.5 archive 정리 (node-cron 주기, DQ-1.31)

DQ-1.31은 "pgmq archive 테이블 정리를 어떻게 하는가?" 질문. **pg_cron 거부(ADR-005)**로 인해 node-cron으로 대체한다.

```typescript
// src/lib/db-ops/cron/job-registry.ts (일부)
export const CRON_JOBS = [
  // ...기존 잡...

  {
    id: 'pgmq-archive-cleanup',
    schedule: '0 3 * * *', // 매일 03:00 KST
    description: 'pgmq archive 테이블 30일 이전 메시지 정리',
    handler: async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // 각 큐의 archive 테이블 정리
      const queues = ['thumbnail', 'email', 'pdf', 'cache-bust', 'webhook'];
      for (const queue of queues) {
        const deleted = await prisma.$queryRaw<[{ count: bigint }]>`
          DELETE FROM pgmq.a_${queue}
          WHERE archived_at < ${cutoff}
          RETURNING COUNT(*) as count
        `;
        logger.info({ job: 'pgmq-archive-cleanup', queue, deleted: deleted[0].count.toString() });
      }
    },
  },
] satisfies CronJob[];
```

**pg_cron을 사용하지 않는 이유** (ADR-005 재확인):
- `pg_cron`은 `shared_preload_libraries`에 등록 필요 → PG 재시작 필요
- `SUPERUSER` 권한 요구
- Node.js 핸들러(B2 업로드, 웹훅 발송 등)를 pg_cron에서 직접 호출 불가 → `pg_notify` 중간 계층 추가 → 구조적 과잉

### 3.6 dead-letter 테이블 구성

pgmq 1.4+는 dead-letter 큐를 직접 지원하지 않는다. `read_ct` (재읽기 횟수)를 기준으로 dead-letter를 직접 구현한다.

```sql
-- dead-letter 보관 테이블
CREATE TABLE IF NOT EXISTS pgmq_dead_letters (
  id          BIGSERIAL PRIMARY KEY,
  queue_name  TEXT NOT NULL,
  msg_id      BIGINT NOT NULL,
  read_ct     INTEGER NOT NULL,
  payload     JSONB NOT NULL,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX idx_pgmq_dead_letters_queue ON pgmq_dead_letters(queue_name, created_at DESC);
```

```typescript
// src/lib/data-api/pgmq/dead-letter-handler.ts
const MAX_RETRY_COUNT = 3;

export async function processMessageWithDLQ(
  queue: string,
  handler: (msg: Record<string, unknown>) => Promise<void>
) {
  const messages = await pgmqClient.read(queue, 30, 1);
  if (!messages.length) return;

  const [msg] = messages;

  if (msg.read_ct > MAX_RETRY_COUNT) {
    // Dead-letter로 이동
    await prisma.pgmqDeadLetters.create({
      data: {
        queueName: queue,
        msgId: msg.msg_id,
        readCt: msg.read_ct,
        payload: msg.message,
        lastError: `최대 재시도 초과 (${msg.read_ct}회)`,
      },
    });
    await pgmqClient.delete(queue, msg.msg_id);

    // EVT-013 발행 (누적 10건 감시는 별도 모니터링)
    logger.warn({ dlq: { queue, msgId: msg.msg_id.toString(), readCt: msg.read_ct } });
    return;
  }

  try {
    await handler(msg.message);
    await pgmqClient.archive(queue, msg.msg_id);
  } catch (err) {
    logger.error({ queue, msgId: msg.msg_id.toString(), error: String(err) });
    // visibility timeout 만료 후 자동 재노출 (재시도)
  }
}
```

### 3.7 워커 스케일링 (DQ-11.3)

DQ-11.3은 "큐 길이 급증 시 워커를 어떻게 증설하는가?" 질문.

**설계**: 큐 길이 > 100 시 N+1 워커 동적 생성.

```typescript
// src/lib/data-api/pgmq/worker-scaler.ts
export class PgmqWorkerScaler {
  private workers: Map<string, NodeJS.Timeout> = new Map();

  async checkAndScale(queue: string) {
    const metrics = await prisma.$queryRaw<[{
      queue_length: bigint;
      total_messages: bigint;
    }]>`
      SELECT queue_length, total_messages
      FROM pgmq.metrics(${queue})
    `;

    const queueLength = Number(metrics[0].queue_length);

    if (queueLength > 100 && !this.workers.has(`${queue}-extra`)) {
      // 추가 워커 시작 (최대 3개)
      const extraWorker = setInterval(
        () => processMessageWithDLQ(queue, getQueueHandler(queue)),
        500 // 0.5초 간격
      );
      this.workers.set(`${queue}-extra`, extraWorker);
      logger.info({ scale: 'up', queue, queueLength });
    } else if (queueLength < 10 && this.workers.has(`${queue}-extra`)) {
      // 큐 정상화 시 추가 워커 중지
      clearInterval(this.workers.get(`${queue}-extra`)!);
      this.workers.delete(`${queue}-extra`);
      logger.info({ scale: 'down', queue, queueLength });
    }
  }
}
```

---

## 4. pg_graphql 통합 (조건부)

### 4.1 도입 트리거 4개 정량화 (ADR-012, ADR-016)

pg_graphql은 **현재 보류** 상태다. 다음 4개 트리거 중 **2개 이상** 충족 시에만 도입한다.

| # | 트리거 조건 | 측정 방법 | 현재 상태 |
|---|-----------|---------|---------|
| T1 | 팀 > 1명 (CON-3 변경) | auth.users 수 > 1, 6개월 지속 | 미충족 (1인: 김도영) |
| T2 | 모바일 클라이언트 추가 | Capacitor/Expo 앱 스토어 배포 또는 개발 착수 | 미충족 |
| T3 | 프론트엔드 팀이 GraphQL 요청 | 명시적 요청 메모 (GitHub Issue 또는 docs) | 미충족 |
| T4 | 3-hop nested join이 REST로 불편 | 프로덕션 코드에 3-hop Prisma include 3건+ 존재 | 미측정 (Phase 21 이후) |

**정기 리뷰 일정**: 매년 4월 (ADR-016 §재검토 트리거). 2027-04 첫 번째 리뷰.

### 4.2 설치 절차 (트리거 충족 시)

트리거 2개 이상 충족이 확인된 경우에만 아래 절차를 실행한다.

#### Step 1. pg_graphql 빌드 준비

```bash
# pgrx 환경 설정 (Rust 필요)
cargo install --locked cargo-pgrx@0.11.4
cargo pgrx init --pg15 /usr/lib/postgresql/15/bin/pg_config

# pg_graphql 소스 클론
git clone https://github.com/supabase/pg_graphql.git
cd pg_graphql

# PG 15 기준 빌드
cargo pgrx install --pg-config /usr/lib/postgresql/15/bin/pg_config

# 빌드 확인
ls /usr/share/postgresql/15/extension/ | grep graphql
# 예상: pg_graphql--1.5.7.sql  pg_graphql.control
```

#### Step 2. pg_graphql 활성화

```sql
-- pg_graphql 활성화 (SUPERUSER 필요)
CREATE EXTENSION IF NOT EXISTS pg_graphql;

-- 확인
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_graphql';
```

**주의**: pg_graphql은 스키마를 자동으로 introspect하여 GraphQL 타입을 생성한다. 설치 직후 모든 테이블이 GraphQL 스키마에 노출된다. 노출 제어는 §4.5에서 설명한다.

#### Step 3. postgresql.conf 추가 설정 (선택)

```ini
# pg_graphql은 shared_preload_libraries 불필요
# 단, GraphQL 응답 크기 제한 권장
# 기본 max_rows: 无制限 → 명시 제한 권장
pg_graphql.max_rows = 1000
```

### 4.3 introspection CI (DQ-1.27: Prisma DB pull + pg_graphql 자동 비교)

DQ-1.27은 "Prisma 스키마와 pg_graphql introspection이 불일치할 때 어떻게 감지하는가?" 질문.

**자동 diff 스크립트**:

```bash
#!/usr/bin/env bash
# scripts/ci/pg-graphql-introspection-diff.sh

set -e

echo "=== Prisma DB Pull ==="
npx prisma db pull --force
npx prisma generate

echo "=== pg_graphql introspection 조회 ==="
PG_GRAPHQL_TYPES=$(psql -U ypb_app -d luckystyle4u -t -A -c "
  SELECT graphql.resolve('\$\$
    {
      __schema {
        types {
          name
          fields {
            name
            type { name kind }
          }
        }
      }
    }
  \$\$');
")

echo "=== Prisma 모델 추출 ==="
PRISMA_MODELS=$(node -e "
  const { getDMMF } = require('@prisma/internals');
  getDMMF({ datamodelPath: './prisma/schema.prisma' }).then(dmmf => {
    const models = dmmf.datamodel.models.map(m => m.name).sort();
    console.log(JSON.stringify(models));
  });
")

echo "=== Diff 비교 ==="
node scripts/ci/compare-graphql-prisma.js \
  --graphql-types "$PG_GRAPHQL_TYPES" \
  --prisma-models "$PRISMA_MODELS"

echo "=== introspection CI 완료 ==="
```

**CI 파이프라인 통합** (GitHub Actions 예시):

```yaml
# .github/workflows/pg-graphql-ci.yml (pg_graphql 도입 후 활성화)
name: pg_graphql introspection diff

on:
  push:
    paths:
      - 'prisma/schema.prisma'
      - 'migrations/**'

jobs:
  graphql-diff:
    runs-on: ubuntu-22.04
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4
      - name: 확장 설치 및 diff 실행
        run: bash scripts/ci/pg-graphql-introspection-diff.sh
```

### 4.4 Persisted Query 화이트리스트 (DQ-1.25)

DQ-1.25는 "GraphQL introspection을 프로덕션에서 차단하는 방법?" 질문. Persisted Query(PQ) 패턴으로 해결한다.

**Persisted Query 등록 및 검증**:

```typescript
// src/server/data-api/graphql/persisted-query-registry.ts
import { createHash } from 'node:crypto';

// 허가된 쿼리 화이트리스트 (SHA-256 해시 기반)
const ALLOWED_QUERIES = new Map<string, string>([
  // [SHA-256 해시, 쿼리 이름]
  ['abc123...', 'GetMenuList'],
  ['def456...', 'GetOrderDetails'],
  // ... 추가 쿼리
]);

export function validatePersistedQuery(hash: string, query?: string): string | null {
  if (process.env.NODE_ENV === 'development') {
    // 개발 환경: 모든 쿼리 + introspection 허용
    return query ?? null;
  }

  // 프로덕션: 화이트리스트만 허용
  if (!ALLOWED_QUERIES.has(hash)) {
    throw new Error(`GraphQL 쿼리 미등록: ${hash}. 허가된 쿼리만 실행 가능.`);
  }
  return ALLOWED_QUERIES.get(hash)!;
}

export function hashQuery(query: string): string {
  return createHash('sha256').update(query.trim()).digest('hex');
}
```

**pg_graphql Route Handler**:

```typescript
// src/app/api/graphql/route.ts
import { prisma } from '@/lib/prisma';
import { validatePersistedQuery } from '@/server/data-api/graphql/persisted-query-registry';
import { getSessionFromRequest } from '@/server/auth-core/session';

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: '인증 필요' }, { status: 401 });

  const body = await req.json();
  const { query, variables, extensions } = body;

  // Persisted Query 검증 (DQ-1.25)
  const persistedHash = extensions?.persistedQuery?.sha256Hash;
  const validatedQuery = persistedHash
    ? validatePersistedQuery(persistedHash, query)
    : (() => { throw new Error('Persisted Query 해시 필수'); })();

  // pg_graphql 실행
  const result = await prisma.$queryRaw`
    SELECT graphql.resolve(${validatedQuery}, ${JSON.stringify(variables ?? {})}::jsonb)
  `;

  return Response.json(result);
}
```

### 4.5 스키마 노출 제어

pg_graphql은 `comment on table`을 통해 노출 여부를 제어한다.

```sql
-- 내부 메타 테이블 숨기기 (GraphQL 스키마에서 제외)
COMMENT ON TABLE pgmq_dead_letters IS '@graphql({"totalCount": {"enabled": false}})';
COMMENT ON TABLE query_history IS '@graphql({"totalCount": {"enabled": false}})';
COMMENT ON TABLE audit_log IS '@graphql({"totalCount": {"enabled": false}})';
COMMENT ON TABLE cron_job_runs IS '@graphql({"totalCount": {"enabled": false}})';
COMMENT ON TABLE vault_secrets IS '@graphql({"totalCount": {"enabled": false}})';

-- 또는 스키마 수준 제외
COMMENT ON SCHEMA pgmq IS E'@graphql({"inflect_names": false})';
```

---

## 5. 거부된 확장 — pg_cron · pgsodium · pg_partman

### 5.1 pg_cron 거부 (ADR-005)

**거부 결정**: Phase 20(DB Ops) 이전 단계부터 확정. ADR-005 Accepted.

**거부 근거 4가지**:

1. **Node 잡 비율 70~80%**: 양평의 잡 10개 중 7~8개가 TypeScript 전용 — B2 업로드, 외부 API 호출, Slack Webhook 발송, wal-g 실행. pg_cron은 SQL 잡 전용으로 이 잡들을 실행할 수 없다. 결국 pg_cron(`SQL 잡`) + pg_notify → Node 핸들러 패턴이 되어 구조적으로 복잡해진다.

2. **shared_preload_libraries 의존**: pg_cron은 `shared_preload_libraries = 'pg_cron'` 설정 후 **PostgreSQL 재시작** 필수. WSL2 단일 인스턴스에서 PG 재시작은 Realtime CDC 슬롯 재초기화, 연결 풀 재설정 등 연쇄 다운타임 유발.

3. **SUPERUSER 요구**: `cron.schedule()` 함수 실행에 SUPERUSER 필요. 최소 권한 원칙(AP-2 보안) 위반.

4. **node-cron으로 완전 대체 가능**: node-cron + PM2 advisory lock으로 "한 번에 하나의 인스턴스에서만 실행" 보장. 추가 PG 확장 없이 동일한 스케줄 보장 달성.

**pg_cron 재도입 조건** (ADR-005 §재검토 트리거):
- Cron 작업 수 > 50개 + 정확도 문제 발생
- PostgreSQL 17+에서 pg_cron이 기본 탑재되는 경우

### 5.2 pgsodium 거부 (ADR-013)

**거부 결정**: Phase 16(Observability) 이전 확정. ADR-013 Accepted.

**거부 근거 3가지**:

1. **SUPERUSER + shared_preload_libraries**: pgsodium도 PG 재시작 필요, SUPERUSER 필수. pg_cron과 동일한 관리 부담.

2. **Prisma 7 비호환**: pgsodium은 `vault` 스키마를 생성하는데, Prisma 7의 DMMF가 이 스키마를 인식하지 못한다. Schema Visualizer(ADR-004)가 Prisma DMMF를 기반으로 하므로 pgsodium 설치 시 Schema Viz에 알 수 없는 스키마가 나타난다.

3. **규모 부적절**: pgsodium은 수만 건의 시크릿을 PG 내부에서 관리하는 대규모 아키텍처 전제. 양평의 시크릿은 ~200건 이하. node:crypto AES-256-GCM envelope(코드 200줄 미만)으로 충분.

**pgsodium 재도입 조건**: 없음 (의도적 완전 거부). node:crypto envelope으로 영구 대체.

### 5.3 pg_partman 거부 (이 문서 최초 기록)

**거부 근거**: pg_partman은 파티셔닝 자동화 확장이다. 양평의 현재 최대 테이블 규모가 파티셔닝이 필요한 수준이 아니다.

1. **규모 불필요**: audit_log, query_history 등 대용량 테이블도 90일 보존 정책 + node-cron 정리로 충분. 파티셔닝이 이점을 가지는 기준(수천만 row 이상)에 도달하지 않음.

2. **pg_cron 의존성**: pg_partman의 자동 유지보수 기능이 pg_cron을 권장한다. pg_cron이 거부(ADR-005)된 환경에서 pg_partman의 자동화 기능을 완전히 활용할 수 없다.

3. **Prisma 마이그레이션 복잡성**: pg_partman이 생성하는 파티션 테이블을 Prisma 7이 DMMF로 인식하는 방식이 복잡. 마이그레이션 롤백 시 파티션 구조 복구 절차가 추가된다.

**pg_partman 재도입 조건**:
- audit_log 테이블 row 수 > 1천만 (보존 정책 이후에도)
- pg_cron 재도입 (ADR-005 트리거 충족 후)
- 그 시점에 Prisma 7의 파티션 테이블 지원 공식화

---

## 6. 백업 시 확장 보존

### 6.1 wal-g 백업에서 확장 정의 포함 여부

wal-g는 PostgreSQL WAL 스트리밍 + 베이스 백업을 B2에 업로드한다. 베이스 백업(`pg_basebackup` 기반)에는 다음이 포함된다:

- **포함**: PostgreSQL 데이터 파일, WAL 파일, `postgresql.conf`, `pg_hba.conf`
- **포함**: `pg_extension` 시스템 카탈로그 (설치된 확장 목록)
- **포함**: 확장이 생성한 테이블과 함수의 데이터
- **미포함**: 확장 `.so` 바이너리 파일 (`/usr/lib/postgresql/15/lib/`)

**실질적 의미**: 복구 후 `.so` 파일이 없으면 확장이 로드되지 않는다.

```sql
-- 백업 시 확장 상태 스냅샷 저장 (scripts/backup/pre-backup-snapshot.sql)
COPY (
  SELECT extname, extversion, extrelocatable, extnamespace::regnamespace
  FROM pg_extension
  ORDER BY extname
) TO '/tmp/extensions_snapshot.csv' WITH CSV HEADER;
```

### 6.2 확장 바이너리 보존 전략

```bash
# scripts/backup/backup-extensions.sh
# wal-g 백업 전에 실행하여 확장 바이너리를 B2에 별도 보관

# 설치된 PG 확장 패키지 목록 저장
dpkg -l | grep "postgresql-15-" > /tmp/pg-extensions-packages.txt

# wal2json .so 파일 백업
tar czf /tmp/pg-extension-libs.tar.gz \
  /usr/lib/postgresql/15/lib/wal2json.so \
  /usr/share/postgresql/15/extension/wal2json* \
  /usr/lib/postgresql/15/lib/pgmq.so \
  /usr/share/postgresql/15/extension/pgmq* 2>/dev/null || true

# B2에 업로드 (wal-g와 같은 버킷, 별도 prefix)
aws s3 cp /tmp/pg-extension-libs.tar.gz \
  s3://luckystyle4u-backup/extensions/pg15-extensions-$(date +%Y%m%d).tar.gz \
  --endpoint-url https://s3.us-west-004.backblazeb2.com
```

---

## 7. 복구 드릴 — 확장 재설치 자동화

### 7.1 복구 시나리오 및 확장 재설치 스크립트

새 서버(또는 WSL2 재설치)에서 복구 시 확장 재설치가 필요하다.

```bash
#!/usr/bin/env bash
# scripts/restore/reinstall-pg-extensions.sh
# 복구 드릴 시 이 스크립트를 실행하여 확장 환경 재구성

set -e

echo "=== PostgreSQL 15 확장 재설치 시작 ==="

# 1. apt 저장소 설정
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list'
sudo apt update

# 2. wal2json 재설치 (apt 패키지)
sudo apt install -y postgresql-15-wal2json
echo "✓ wal2json 설치 완료"

# 3. pgmq 재설치 (Supabase 저장소 또는 trunk)
curl -sL https://apt.supabase.io/setup.sh | sudo bash 2>/dev/null || true
if sudo apt install -y postgresql-15-pgmq 2>/dev/null; then
  echo "✓ pgmq (apt) 설치 완료"
else
  # apt 실패 시 trunk로 폴백
  cargo install pg-trunk
  trunk install pgmq --pg-config /usr/lib/postgresql/15/bin/pg_config
  echo "✓ pgmq (trunk) 설치 완료"
fi

# 4. postgresql.conf 복원 (wal-g 베이스 백업에서)
# 이미 wal-g 복구가 완료된 후 실행 가정
sudo systemctl start postgresql@15-main
sleep 3

# 5. wal_level 확인
WAL_LEVEL=$(psql -U postgres -t -c "SHOW wal_level;" | tr -d ' ')
if [ "$WAL_LEVEL" != "logical" ]; then
  echo "ERROR: wal_level이 logical이 아닙니다: $WAL_LEVEL"
  echo "postgresql.conf를 확인하고 PG를 재시작하세요."
  exit 1
fi
echo "✓ wal_level = logical 확인"

# 6. 확장 활성화 (DB 내부)
psql -U postgres -d luckystyle4u <<EOF
CREATE EXTENSION IF NOT EXISTS pgmq;
EOF
echo "✓ pgmq CREATE EXTENSION 완료"

# 7. Replication Slot 재생성
psql -U postgres -d luckystyle4u -f scripts/db/create-replication-slots.sql
echo "✓ Replication Slot 재생성 완료"

# 8. 큐 재생성 (data가 복구된 경우 이미 존재할 수 있음)
psql -U postgres -d luckystyle4u <<EOF
DO \$\$
BEGIN
  PERFORM pgmq.create('thumbnail') WHERE NOT EXISTS (
    SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'thumbnail'
  );
  PERFORM pgmq.create('email') WHERE NOT EXISTS (
    SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'email'
  );
  PERFORM pgmq.create('pdf') WHERE NOT EXISTS (
    SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'pdf'
  );
  PERFORM pgmq.create('cache-bust') WHERE NOT EXISTS (
    SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'cache-bust'
  );
  PERFORM pgmq.create('webhook') WHERE NOT EXISTS (
    SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'webhook'
  );
END
\$\$;
EOF
echo "✓ pgmq 큐 재생성 완료"

echo "=== 확장 재설치 완료 ==="
```

### 7.2 pg_graphql 조건부 재설치 (트리거 충족 시)

```bash
#!/usr/bin/env bash
# scripts/restore/reinstall-pg-graphql.sh
# pg_graphql 트리거 충족 후 도입 및 복구 시 사용

set -e

echo "=== pg_graphql 재설치 ==="

# pgrx + pg_graphql 빌드
cargo install --locked cargo-pgrx@0.11.4
cargo pgrx init --pg15 /usr/lib/postgresql/15/bin/pg_config

# 버전: 복구 전 스냅샷에서 확인한 버전 사용
PG_GRAPHQL_VERSION=${1:-"1.5.7"}
git clone --depth 1 --branch "v${PG_GRAPHQL_VERSION}" \
  https://github.com/supabase/pg_graphql.git /tmp/pg_graphql_build

cd /tmp/pg_graphql_build
cargo pgrx install --pg-config /usr/lib/postgresql/15/bin/pg_config

# 활성화
psql -U postgres -d luckystyle4u -c "CREATE EXTENSION IF NOT EXISTS pg_graphql;"

# introspection diff 검증
bash scripts/ci/pg-graphql-introspection-diff.sh

echo "✓ pg_graphql ${PG_GRAPHQL_VERSION} 재설치 완료"
```

### 7.3 복구 드릴 실행 스케줄

| 드릴 종류 | 주기 | 담당 | 소요 시간 | 기록 위치 |
|---------|------|------|---------|---------|
| 전체 복구 드릴 (B2 복원 + 확장 재설치) | 분기 1회 | 김도영 | ~2h | audit_log + docs/guides/ |
| 확장 재설치 단독 드릴 | 반기 1회 | 김도영 | ~30m | audit_log |
| Slot 재생성 드릴 | 연 1회 | 김도영 | ~10m | audit_log |

---

## 8. 성능 영향 분석

### 8.1 wal2json WAL 부하

wal2json은 PostgreSQL Logical Replication을 사용하므로 WAL 쓰기 부하가 증가한다.

**부하 요인**:

| 설정 | 영향 | 수치 |
|------|------|------|
| `wal_level = logical` | 기본 `replica` 대비 WAL 추가 기록 | +10~30% WAL 크기 (DML 빈도 의존) |
| Logical Replication Slot | WAL 보관 증가 (슬롯 소비 전까지) | max_slot_wal_keep_size = 2GB 상한 |
| JSON 직렬화 | CPU 오버헤드 (change당) | ~50μs/change (PG 15 벤치마크 기준) |

**양평 예상 DML 빈도**:
- 영업 중 피크: ~50 DML/초 (주문 입력, 재고 변경)
- 일평균: ~10 DML/초
- WAL 추가 기록: 1MB/분 미만 (예상)

**모니터링 쿼리**:

```sql
-- WAL 생성 속도 모니터링
SELECT pg_size_pretty(pg_wal_lsn_diff(
  pg_current_wal_lsn(),
  '0/0'
)) AS total_wal_generated;

-- Replication Slot 지연 (이 값이 지속 증가하면 EVT-008 기준 접근)
SELECT slot_name,
       pg_size_pretty(pg_wal_lsn_diff(
         pg_current_wal_lsn(),
         confirmed_flush_lsn
       )) AS lag_size
FROM pg_replication_slots
WHERE slot_name IN ('ypb_cdc_slot', 'ypb_ops_slot');
```

### 8.2 pgmq 트랜잭션 오버헤드

pgmq 메시지 발행은 PostgreSQL 트랜잭션 내에서 실행되므로 추가 쓰기 오버헤드가 있다.

**부하 요인**:

| 연산 | 추가 오버헤드 | 수치 (PG 15, SSD) |
|------|------------|-----------------|
| `pgmq.send()` (단일) | 1 INSERT into pgmq 테이블 | ~0.5ms/호출 |
| `pgmq.read()` (단일) | 1 SELECT + 1 UPDATE (vt 갱신) | ~0.3ms/호출 |
| `pgmq.delete()` | 1 DELETE | ~0.2ms/호출 |
| `pgmq.archive()` | 1 INSERT (archive) + 1 DELETE | ~0.6ms/호출 |

**Outbox 패턴 트랜잭션 오버헤드**:
```
메뉴 INSERT(10ms) + pgmq.send(0.5ms) = 10.5ms (약 5% 증가)
```

**큐 길이와 성능**: pgmq의 내부 구조는 테이블 기반이므로 큐 길이가 1만 건을 초과하면 `pgmq.read()` 성능이 저하될 수 있다. archive 정리 주기(매일)로 이를 방지한다.

### 8.3 pg_graphql 오버헤드 (조건부)

pg_graphql은 설치 시 다음 오버헤드가 발생한다:

| 영역 | 오버헤드 | 수치 |
|------|---------|------|
| PostgreSQL 시작 시 스키마 캐싱 | 1회 | ~50ms (테이블 200개 기준) |
| GraphQL 쿼리 파싱 + 플래닝 | 쿼리당 | ~2ms (단순 쿼리) |
| Introspection 쿼리 | 쿼리당 | ~100ms (전체 스키마) |
| WAL 영향 | 없음 | pg_graphql은 읽기 전용 |

**프로덕션 Introspection 차단**(Persisted Query만 허용, §4.4)으로 introspection 오버헤드를 0으로 만든다.

---

## 9. 보안 경계

### 9.1 확장별 권한 스코프

| 확장 | 설치 권한 | 사용 권한 | SUPERUSER 요구 | 비고 |
|------|---------|---------|:------------:|------|
| wal2json | SUPERUSER | REPLICATION role | 설치 불필요 | `.so` 바이너리만 필요 |
| pgmq | SUPERUSER | EXECUTE on pgmq.* (세밀하게 부여 가능) | 설치만 | `CREATE EXTENSION` 시 1회 |
| pg_graphql | SUPERUSER | EXECUTE on graphql.resolve() | 설치만 | `CREATE EXTENSION` 시 1회 |

**중요**: SUPERUSER는 설치 시 1회만 필요하다. 애플리케이션 사용자(`ypb_app`)는 SUPERUSER 권한 없이 각 확장의 함수를 사용한다.

### 9.2 wal2json 보안 경계

**위협 모델**: wal2json Logical Replication 연결을 통해 전체 WAL 스트림에 접근 가능.

**완화 조치**:

```sql
-- WALConsumer 전용 사용자: REPLICATION 권한만
CREATE USER ypb_cdc WITH REPLICATION;

-- PUBLICATION 필터: 필요한 테이블만 노출
-- 내부 메타 테이블(audit_log, vault_secrets 등) 제외
CREATE PUBLICATION ypb_pub
  FOR TABLE menu, orders, order_items, inventory, users, customers;

-- PUBLICATION에 민감 테이블 포함 여부 확인
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'ypb_pub'
ORDER BY tablename;
```

**vault_secrets 테이블이 wal2json에 노출되면 안 된다**:

```sql
-- vault_secrets는 PUBLICATION에서 명시적 제외
ALTER PUBLICATION ypb_pub DROP TABLE IF EXISTS vault_secrets;
ALTER PUBLICATION ypb_pub DROP TABLE IF EXISTS jwks_keys;
ALTER PUBLICATION ypb_pub DROP TABLE IF EXISTS rate_limit_events;
```

### 9.3 pgmq 보안 경계

**위협 모델**: 권한 없는 사용자가 큐에 임의 메시지를 삽입하여 워커를 공격.

**완화 조치**:

```sql
-- pgmq 큐 직접 쓰기 차단 (테이블 수준)
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgmq FROM PUBLIC;

-- ypb_app만 pgmq.send() 함수를 통해서만 발행 가능
GRANT EXECUTE ON FUNCTION pgmq.send(text, jsonb) TO ypb_app;
GRANT EXECUTE ON FUNCTION pgmq.send(text, jsonb, integer) TO ypb_app;
-- 나머지 함수는 §3.3의 권한 설정 참조
```

**메시지 페이로드 검증** (Server Action 단에서):

```typescript
import { z } from 'zod';

// 큐별 페이로드 스키마 정의
const ThumbnailMessageSchema = z.object({
  menuId: z.string().uuid(),
  imageUrl: z.string().url(),
  size: z.number().positive().max(10 * 1024 * 1024), // 10MB 이하
});

export async function enqueueThumbnail(menuId: string, imageUrl: string, size: number) {
  // 페이로드 검증 후 발행
  const payload = ThumbnailMessageSchema.parse({ menuId, imageUrl, size });
  return pgmqClient.send('thumbnail', payload);
}
```

### 9.4 pg_graphql 보안 경계 (조건부)

**위협 모델**:
1. Introspection으로 전체 스키마 노출 → 공격자 정보 수집
2. 비인가 GraphQL 쿼리로 민감 데이터 대량 추출
3. GraphQL injection (SQL injection과 다름 — pg_graphql은 parameterized query 사용)

**완화 조치**:
- Introspection: 프로덕션에서 완전 차단 (§4.4 Persisted Query)
- 민감 테이블 숨기기: §4.5의 `@graphql({ "totalCount": {"enabled": false} })` 주석
- Rate Limit: Auth Advanced Rate Limit과 연동 (I-16, §3.7)
- 최대 행 수 제한: `pg_graphql.max_rows = 1000` 설정

---

## 10. 운영 체크리스트

### 10.1 Phase 17 (wal2json 사전 검증)

Phase 17(Auth Core + Storage 구현) 시작 전에 wal2json CDC 계층이 안정적인지 사전 검증한다. Phase 19(Realtime 구현)에서 WALConsumer를 풀가동하기 전 기반 작업.

```
[ ] wal2json 패키지 설치 확인 (§2.2)
[ ] postgresql.conf wal_level=logical + max_replication_slots=5 적용 확인 (§2.3)
[ ] pg_hba.conf ypb_cdc replication 행 추가 확인 (§2.5)
[ ] ypb_cdc 사용자 생성 + Vault 비밀번호 저장 확인 (§2.5)
[ ] ypb_cdc_slot + ypb_ops_slot 생성 확인 (§2.4)
[ ] PUBLICATION ypb_pub 생성 + 민감 테이블 제외 확인 (§9.2)
[ ] WALConsumer 연결 테스트 (pg_create_logical_replication_slot 성공)
[ ] 슬롯 지연 모니터링 쿼리 결과 0 확인
[ ] 확장 바이너리 백업 스크립트 실행 (§6.2)
```

### 10.2 Phase 19 (pgmq 도입)

Phase 19(Edge Functions + Realtime) 구현과 병행하여 pgmq를 설치한다.

```
[ ] pgmq 패키지 설치 확인 (§3.2)
[ ] CREATE EXTENSION pgmq 실행 확인 (§3.2)
[ ] 큐 5개 생성 확인 (thumbnail, email, pdf, cache-bust, webhook)
[ ] ypb_app 권한 설정 확인 (§3.3)
[ ] Outbox 패턴 트랜잭션 테스트 (메뉴 INSERT + pgmq.send 롤백 확인)
[ ] Dead-letter 테이블 생성 확인 (§3.6)
[ ] node-cron archive 정리 잡 등록 확인 (§3.5)
[ ] pgmq_dead_letters 테이블 읽기 권한 확인
[ ] EVT-013 (dead-letter 누적 10건) 알림 테스트
```

### 10.3 Phase 21 (pg_graphql 조건부)

ADR-016 트리거 2개 이상 충족 시에만 실행. 연간 리뷰(매년 4월)에서 판단.

```
[ ] ADR-016 트리거 2개 이상 충족 공식 확인 (docs/handover/에 기록)
[ ] pg_graphql 빌드 환경 준비 (Rust + pgrx 설치)
[ ] pg_graphql 빌드 + 설치 (§4.2)
[ ] CREATE EXTENSION pg_graphql 실행 (§4.2)
[ ] 민감 테이블 GraphQL 노출 제외 설정 (§4.5)
[ ] Persisted Query 화이트리스트 초기화 (§4.4)
[ ] introspection CI 첫 실행 + 기준선 저장 (§4.3)
[ ] 프로덕션 introspection 차단 확인 (§4.4)
[ ] pg_graphql 바이너리 백업 (§6.2 업데이트)
[ ] 복구 드릴 스크립트에 pg_graphql 재설치 추가 (§7.2)
```

### 10.4 정기 운영 체크리스트 (월간)

```
[ ] Replication Slot 지연 확인: pg_replication_slots 조회, 지연 < 100MB
[ ] pgmq 큐 길이 확인: pgmq.metrics_all(), 각 큐 < 1000
[ ] dead_letter 테이블 확인: pgmq_dead_letters, 최근 7일 신규 건수
[ ] archive 테이블 정리 확인: node-cron pgmq-archive-cleanup 최근 실행 로그
[ ] wal2json 버전 보안 공지 확인: GitHub releases 체크
[ ] pgmq 버전 보안 공지 확인: tembo-io/pgmq releases 체크
[ ] 확장 바이너리 백업 최신화 확인: B2 extensions/ prefix 업로드 날짜
```

---

## 부록 Z. 근거 인덱스

### Z.1 이 문서가 인용하는 Wave 문서

| 섹션 | 근거 문서 |
|------|---------|
| §1 버전 고정 | `00-vision/04-constraints-assumptions.md CON-4 (PostgreSQL만)` |
| §2 wal2json | `02-architecture/01-adr-log.md ADR-010`, `02-architecture/11-realtime-blueprint.md §1~§2` |
| §3 pgmq | `02-architecture/01-adr-log.md ADR-012`, `02-architecture/15-data-api-blueprint.md §3.2` |
| §4 pg_graphql | `02-architecture/01-adr-log.md ADR-012, ADR-016`, `02-architecture/15-data-api-blueprint.md §4` |
| §5.1 pg_cron 거부 | `02-architecture/01-adr-log.md ADR-005`, `02-architecture/13-db-ops-blueprint.md §2.2` |
| §5.2 pgsodium 거부 | `02-architecture/01-adr-log.md ADR-013`, `02-architecture/04-observability-blueprint.md §2.1` |
| §8 성능 | `02-architecture/11-realtime-blueprint.md §4` (wal2json 부하), `02-architecture/15-data-api-blueprint.md §5` (pgmq 부하) |
| §10 체크리스트 | `00-vision/10-14-categories-priority.md §4.1 (Phase 매핑)` |

### Z.2 DQ 답변 매핑

| DQ | 답변 위치 |
|----|---------|
| DQ-1.25 (Persisted Query 화이트리스트) | §4.4 |
| DQ-1.26 (pg_graphql 도입 기준) | §4.1 |
| DQ-1.27 (introspection CI) | §4.3 |
| DQ-1.31 (pgmq archive 정리) | §3.5 |
| DQ-RT-5 (Replication Slot 2개 분리) | §2.4 |

### Z.3 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent I1-A (Claude Sonnet 4.6) | Wave 4 Tier 3 초안 — wal2json/pgmq/pg_graphql 설치·운영·보안 계약 전체 |

### Z.4 후속 Wave 4/5 산출물 연결

- → `02-architecture/11-realtime-blueprint.md §2`: wal2json WALConsumer 상세 구현 (이 문서의 §2는 설치·설정에 집중, 구현은 Blueprint)
- → `02-architecture/15-data-api-blueprint.md §3`: pgmq PgmqWorker 구현 (이 문서의 §3은 DB 레벨 설정)
- → Wave 5 `06-prototyping/spike-007-storage-50gb.md`: ASM-4 부하 테스트에서 wal2json 슬롯 지연 측정
- → Wave 5 `06-prototyping/spike-pg-graphql.md` (예상): ADR-016 트리거 충족 시 스파이크

---

> **PostgreSQL 확장 통합 끝.** Wave 4 · I1 · 2026-04-18 · 양평 부엌 서버 대시보드 — wal2json(채택) + pgmq(채택) + pg_graphql(조건부) + 거부 3종 + 복구 드릴 + 성능·보안 분석.
