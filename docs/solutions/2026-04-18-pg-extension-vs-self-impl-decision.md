---
title: PostgreSQL 확장 채택 vs Node 자체구현 — 7건 결정 일관 기준
date: 2026-04-18
session: 25
tags: [postgres, extension, architecture, decision-framework, supabase-parity, self-host]
category: architecture
confidence: high
---

## 문제

PostgreSQL을 메인 DB로 쓰는 자체호스팅 환경에서 *Supabase가 PG 확장으로 해결한 기능*(realtime/cron/queue/graphql/vault/cdc/advisors)을 우리도 PG 확장으로 가져갈 것인가, Node 런타임에서 자체구현할 것인가 — 카테고리마다 답이 다르다. 일관된 결정 기준 없이 매번 비교하면 결정 비용이 누적되고, 일부는 잘못된 선택이 운영 부담으로 돌아온다 (예: pgsodium 설치 → SUPERUSER 권한 + 소스 빌드 + Prisma 비호환).

## 원인

kdywave Wave 1에서 7개 카테고리에 대해 "PG 확장 vs Node 자체구현" 결정을 동시 내려본 결과, **3개 차원의 가드레일**이 일관되게 작동했다.

### 7건 결정 결과 매트릭스

| # | 카테고리 | Supabase 사용 확장 | 우리 결정 | 근거 차원 |
|---|---------|------------------|----------|----------|
| 1 | Realtime CDC | wal2json | **wal2json (확장 채택)** | 표준화·검증 |
| 2 | Vault | pgsodium | **node:crypto 자체** | SUPERUSER + 빌드 + 비호환 |
| 3 | Cron | pg_cron | **node-cron 자체** | 1인 환경 과한 의존성 |
| 4 | Queue | pgmq | **pgmq (확장 채택)** | Outbox 패턴 + 트랜잭션 일관성 |
| 5 | GraphQL | pg_graphql | **pg_graphql (확장 채택, 도입은 보류)** | Prisma 호환 + 수요 트리거 시 |
| 6 | Backup | (Supabase 자체 PITR) | **wal-g (외부 도구)** | pgbackrest 단일 노드 과잉 |
| 7 | Advisors | splinter (PL/pgSQL) | **splinter 포팅 (Node TS)** | PL/pgSQL 직접 실행 의존 회피 |

확장 채택 = 3건 (wal2json, pgmq, pg_graphql)  
자체/포팅 = 4건 (node:crypto, node-cron, splinter port, wal-g 외부)

### 3 차원 가드레일

#### 차원 1: SUPERUSER / 빌드 부담

```
PG 확장 채택 = SUPERUSER 권한 필요 OR 패키지 매니저 부재 OR 소스 빌드 강제
→ 자체구현 우위
```

| 확장 | SUPERUSER | 패키지 | 빌드 | 결정 |
|------|----------|--------|------|------|
| wal2json | ✅ apt 1줄 | ✅ debian/ubuntu pkg | 불필요 | 채택 |
| pgsodium | ⚠️ SUPERUSER 강제 | ❌ apt 없음 | 소스 빌드 | **거부** |
| pg_cron | ⚠️ shared_preload_libraries | ✅ apt | 불필요 | **거부** (1인 과잉) |
| pgmq | ✅ no SUPERUSER | ✅ apt | 불필요 | 채택 |
| pg_graphql | ✅ no SUPERUSER | ✅ supabase apt | 불필요 | 채택 (보류) |
| pgbackrest | — (외부 도구) | ✅ apt | 불필요 | **거부** (단일 노드 과잉) |

#### 차원 2: ORM/타입스택 호환

```
PG 확장 = ORM 인트로스펙션 비호환 OR 별도 마이그레이션 흐름 강제
→ 자체구현 우위
```

| 확장 | Prisma DMMF 호환 | drizzle-kit 호환 | 결정 |
|------|-----------------|-----------------|------|
| pgsodium | ❌ bytea 컬럼만 노출, 키 메타 미반영 | ❌ | **거부** |
| pg_graphql | ✅ 별도 schema 인트로스펙션 | ✅ | 채택 |
| pgmq | ✅ pgmq.q_<name> 테이블 | ✅ | 채택 |
| pg_cron | ✅ cron.job 테이블 | ✅ | 거부 (다른 차원) |

#### 차원 3: 운영 단순도 / 단일 환경 적합성

```
PG 확장 = 단일 노드 운영에서 *과잉 기능* (멀티노드/스케일아웃 전제)
→ 자체구현/외부 도구 우위
```

| 확장 | 단일 노드 적합 | 결정 |
|------|--------------|------|
| pg_cron | 멀티 노드 잡 분산 가정 → 1 노드에서 advisory lock 불필요 | **거부** (node-cron 충분) |
| pgbackrest | 멀티 노드 backup 오케스트레이션 → 1 노드는 wal-g 충분 | **거부** |
| splinter (PL/pgSQL) | DB 안에서 룰 실행 → 알림/대시보드 통합 비용 큼 | **거부** (Node 포팅) |

### 결정 트리 (요약)

```
START
  │
  ├─ SUPERUSER 강제? OR 소스 빌드? ──── YES ─→ 자체구현
  │
  ├─ ORM 인트로스펙션 비호환? ───────── YES ─→ 자체구현
  │
  ├─ 단일 노드에서 과잉 기능? ────────── YES ─→ 자체구현 또는 외부 도구
  │
  ├─ 표준 프로토콜·포맷이 PG 안에 있어 NO ─→ 확장 채택 ★
  │  (CDC=WAL, Queue=Outbox, GraphQL=schema)
  │
  └─ 그 외 ────────────────────────────────→ 매트릭스 점수 4.2+ 시 채택
```

★ = wal2json/pgmq/pg_graphql이 채택된 경로 — *PG 안에 표준 프로토콜이 있을 때*만 확장 채택의 운영 부담이 정당화됨

## 해결

### 신규 카테고리에서 PG 확장 vs 자체구현 결정 절차

1. **차원 1 체크 (10분)**: `apt search pg-<extension>` + GitHub README의 "Installation" 절 → SUPERUSER/소스 빌드 강제 여부
2. **차원 2 체크 (15분)**: Prisma DMMF 또는 drizzle-kit introspection으로 확장 스키마가 정상 노출되는가, 마이그레이션 흐름이 별도인가
3. **차원 3 체크 (20분)**: README/GitHub Issues에서 "single node" 검색 → 단일 노드 사용 사례 있는가, advisory lock/노드 분산 전제가 있는가
4. **둘 이상 차원 위반 → 자체구현**
5. **모두 통과 + 표준 프로토콜이 PG 안에 → 확장 채택**
6. **모두 통과 + 표준 프로토콜이 PG 안에 없음 → 매트릭스 점수 4.2+ 게이트**

### 채택 후 안전 가드 (3건 모두 적용)

```typescript
// 1. wal2json (Realtime CDC)
//    가드: max_slot_wal_keep_size = 2GB + cron idle slot drop 1h
//    근거: replication slot 누수 시 디스크 폭증 (Postgres 17 미지원 idle_replication_slot_timeout 폴백)

// 2. pgmq (Queue)
//    가드: pg_partman 또는 pg_cron archive 정책 + dead-letter 알림
//    근거: pgmq archive 누적 → 디스크 압박

// 3. pg_graphql (Data API, 도입 보류)
//    가드: Persisted Operations CI/CD + Prisma↔pg_graphql introspection 동기화 검증
//    근거: ad-hoc 쿼리 = N+1 폭발 위험 + 스키마 drift
```

## 교훈

- **"Supabase가 확장으로 해결했으니 우리도 확장"은 잘못된 출발점** — Supabase는 *멀티테넌트 클라우드*라 SUPERUSER 자유와 멀티노드를 가정한다. 1인 자체호스팅은 그 가정 두 가지 모두 거짓.
- **표준 프로토콜이 PG 안에 존재할 때만 확장이 정당화된다** — WAL(CDC), Outbox 패턴(Queue), GraphQL schema 같은 *PG 본질에 가까운 기능*은 외부 구현이 더 비싸다. AES 암호화·cron·DDL 린트 같은 *PG 외에서도 표준이 있는 기능*은 외부 구현이 운영 단순.
- **확장 채택의 진짜 비용은 "장기 마이그레이션 경로"** — pg_graphql 도입 후 pg_graphql 메인테이너가 떠나면 자체 포팅 비용이 폭증. 매트릭스 ECO/MAINT 차원에 *bus factor* 점검 필수.

## 관련 파일

- `docs/research/2026-04-supabase-parity/01-research/09-realtime/01-wal2json-logical-replication-deep-dive.md` (확장 채택 ★)
- `docs/research/2026-04-supabase-parity/01-research/11-data-api/01-pg-graphql-deep-dive.md` (확장 채택 ★, 보류)
- `docs/research/2026-04-supabase-parity/01-research/11-data-api/03-pgmq-vs-bullmq-vs-sqlite-queue-deep-dive.md` (확장 채택 ★)
- `docs/research/2026-04-supabase-parity/01-research/12-observability/01-pgsodium-vs-node-crypto-vault-deep-dive.md` (확장 거부)
- `docs/research/2026-04-supabase-parity/01-research/04-db-ops/01-pg-cron-vs-node-cron-deep-dive.md` (확장 거부)
- `docs/research/2026-04-supabase-parity/01-research/04-db-ops/02-wal-g-pgbackrest-pitr-deep-dive.md` (외부 채택)
- `docs/research/2026-04-supabase-parity/01-research/10-advisors/01-splinter-full-port-deep-dive.md` (PL/pgSQL → TS 포팅)
- `docs/solutions/2026-04-18-kdywave-hybrid-vs-monolithic-pattern.md` (보조 패턴)
