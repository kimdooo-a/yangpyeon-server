# Spike 010 — pgmq vs BullMQ 처리량 비교 (DQ-4.3 Redis 도입 트리거 정량화)

- 작성일: 2026-04-18
- 상태: Planned
- 스택: pgmq (PostgreSQL) vs BullMQ (Redis 7) / Node.js 24 / WSL2 / k6
- 관련 Phase: Data API Phase 21 착수 전 + DQ-4.3 답변 확정
- 기간: 1일 (8h)
- 담당 에이전트: kdywave Wave 5 S2
- kdyspike 명령: `/kdyspike --full pgmq-vs-bullmq --max-hours 8`

## 1. 목적

pgmq + advisory lock 패턴 vs BullMQ(Redis)의 **실 부하에서 처리량·지연·리소스 소비를 정량 비교**하여 "Redis 도입이 합리적인 시점"의 수치 트리거 4건을 확정한다.

양평 부엌 서버 대시보드는 ADR-005/ADR-012/ADR-016에 따라 pgmq를 기본 메시지 큐로 채택했다. 그러나 DQ-4.3은 "BullMQ를 언제 도입해야 하는가?"를 미결 상태로 남겨 두었다. 실 부하 데이터 없이 이 트리거를 설정하면:
- 너무 이르면: Redis 운영 부담(100MB+ 메모리, 인프라 추가)을 불필요하게 조기 도입.
- 너무 늦으면: PG IOPS 한계 도달 후 긴급 마이그레이션 발생 → 서비스 불안정.

이 스파이크는 실측 데이터로 "pgmq → BullMQ" 이전 트리거 4건을 정량화하여 ADR-005/012를 강화한다.

**구체적 문제 진술**:

1. pgmq의 실제 최대 처리량(jobs/s)이 이론값과 다를 수 있음 — Advisory Lock 경합, PG vacuum, replication lag 등 복합 요인.
2. BullMQ의 Redis 메모리 소비가 jobs/s에 비례하는지, 큐 깊이에 비례하는지 미확인.
3. pgmq + 50 워커 환경에서 PG connection pool 고갈 시점 미확인.
4. pgmq 백업(wal-g) 시 큐 데이터가 정상적으로 포함되는지 검증 필요.
5. BullMQ visibility timeout과 pgmq advisory lock의 장애 복구 정확성 비교 필요.

---

## 2. 배경 및 컨텍스트

### 2.1 ADR-005/ADR-012/ADR-016 채택안 요약

| ADR | 결정 | 근거 |
|-----|------|------|
| ADR-005 | pgmq를 Outbox 워커로 채택 | Redis 미도입 (현 운영 복잡도) |
| ADR-012 | Data API Phase 21 — pgmq Outbox 워커 구현 | REST 강화 + pgmq = 최적해 86.84점 |
| ADR-016 | pg_graphql 수요 트리거 4건 정량화 | 조건부 도입 기준 명시 |

pgmq 채택 근거 (ADR-005):
- PostgreSQL에 설치하는 확장 — 별도 인프라 없음
- wal-g 백업에 큐 데이터 자동 포함
- MVCC 기반 at-least-once 보장
- advisory lock으로 중복 처리 방지

### 2.2 DQ-4.3 내용

```
DQ-4.3: BullMQ 재검토 시점은?
현재 답변: 미확정 — "pgmq 한계 도달 시"
목표: 4개 정량 트리거로 확정 (본 스파이크)
```

### 2.3 현재 운영 환경

```
OS: WSL2 Ubuntu 22.04
PostgreSQL: 14.x
pgmq: 미설치 (Phase 21 예정)
Redis: 미설치
Node.js: 24.x
PM2 워커 수: 현재 단일 (확장 예정)
```

---

## 3. 가설

### H1: pgmq + advisory lock은 100 jobs/s까지 안정 처리한다

**근거**: pgmq 공식 벤치마크(github.com/tembo-io/pgmq)에서 PG 14 기준 150+ msgs/s 보고. Advisory lock 경합은 50 워커 미만에서 무시 가능.

**반증 조건**: 50 jobs/s에서 `pgmq_dequeue` advisory lock 타임아웃 또는 처리량 p50 < 요청 속도 × 0.9 시 H1 기각.

### H2: BullMQ는 1,000 jobs/s까지 처리한다 (Redis 메모리 의존)

**근거**: BullMQ 공식 벤치마크 — Redis 7 단일 노드에서 10,000+ ops/s 가능. jobs/s 1,000은 Redis 초당 2,000 ops(enqueue + dequeue) → 여유.

**반증 조건**: BullMQ 1,000 jobs/s에서 Redis CPU > 80% 또는 jobs 유실 발생 시 H2 기각.

### H3: pgmq는 50 동시 워커, BullMQ는 200 동시 워커까지 확장된다

**근거**:
- pgmq: PG connection pool 기본값 100 → 50 워커는 50 connections. Advisory lock 경합은 워커당 1 lock.
- BullMQ: Redis pub/sub 기반 — connection 분리. 워커당 독립 connection 가능.

**반증 조건**: pgmq 51번째 워커에서 `connection pool exhausted` 또는 BullMQ 201번째 워커에서 Redis 연결 오류.

### H4: pgmq 큐 깊이 10k 도달 시 PG IOPS 한계에 근접한다

**근거**: pgmq는 PG 테이블 기반 — 큐 깊이 = 테이블 row 수. MVCC dead tuple 누적 → vacuum 부하. 10k rows에서 단일 HDD WSL2 환경 IOPS 한계 근접 예상.

**반증 조건**: 큐 깊이 10k에서 `pg_stat_io` hits/reads 비율 < 0.5 (캐시 히트율 50% 미만) 시 H4 기각 (예상보다 이른 한계).

### H5: 단순 jobs(5/s 미만)에서 BullMQ는 과한 의존성이다

**근거**: 현재 양평 부엌 서버의 예상 job 발생량 = 파일 처리 큐, 이메일 알림 등 1-3/s 수준. Redis 100MB+ + 운영 비용이 이 규모에서 ROI 불합리.

**반증 조건**: pgmq가 5 jobs/s에서도 불안정 → H5 기각 → BullMQ 즉시 도입 권고.

---

## 4. 실험 계획

### 4.0 환경 구성

**PostgreSQL + pgmq 설치**:

```sql
-- pgmq 확장 설치 (PGDG or Tembo package)
CREATE EXTENSION pgmq;

-- 테스트 큐 생성
SELECT pgmq.create('spike_queue');

-- Advisory lock 지원 확인
SELECT pgmq.read('spike_queue', 30, 1);  -- 30초 VT, 1 message
```

**Redis + BullMQ 설정**:

```
Redis 7: WSL2 Ubuntu apt-get install redis-server
BullMQ: npm install bullmq
Redis 설정: maxmemory 512mb, maxmemory-policy allkeys-lru
```

**공통 JobPayload 인터페이스**:

```typescript
interface JobPayload {
  id: string;
  type: string;
  data: Record<string, unknown>;
  enqueuedAt: number;
}

interface WorkerMetric {
  jobId: string;
  processedAt: number;
  latencyMs: number;  // enqueuedAt → processedAt
}
```

**pgmq 워커 핵심 로직** (의사 코드):

```typescript
// pgmq 워커 — advisory lock 패턴
// pool.connect() → pgmq.read() → 5ms 처리 → pgmq.delete() → pool.release()
// 큐 비어있을 때: 100ms 폴링 대기
// 연결 관리: PG Pool max=100, 워커당 1 connection
```

**BullMQ 워커 핵심 로직** (의사 코드):

```typescript
// BullMQ 워커 — Worker 클래스 패턴
// new Worker('spike-queue', async(job) => { 5ms 처리 }, { concurrency: 10 })
// 연결 관리: IORedis, maxRetriesPerRequest: null
```

### 4.1 실험 1 — pgmq 처리량 측정 (1/10/100/1000 jobs/s)

**목표**: H1 검증 — pgmq 안정 처리 임계점 확인.

**부하 프로필**:

| 단계 | 목표 jobs/s | 지속 시간 | 총 jobs |
|------|-----------|---------|--------|
| 1 | 1 | 60s | 60 |
| 2 | 10 | 60s | 600 |
| 3 | 100 | 60s | 6,000 |
| 4 | 1,000 | 30s | 30,000 |

**k6 부하 스크립트 패턴** (pgmq):

```javascript
// k6 시나리오: constant-arrival-rate
// executor: constant-arrival-rate
// rate: 100  (jobs/s)
// timeUnit: 1s
// duration: 60s
// preAllocatedVUs: 20
//
// 각 VU: pgmq.send('spike_queue', payload::jsonb) 실행
// payload: { id, type, enqueuedAt: Date.now() }
```

**pgmq 큐 상태 확인**:

```sql
-- pgmq 전용 메트릭 함수
SELECT * FROM pgmq.metrics('spike_queue');
-- 반환: queue_name, queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages
```

**측정 지표**:
- enqueue p50/p95/p99 (ms)
- dequeue p50/p95/p99 (ms)
- 큐 깊이 (처리 속도 < 생성 속도일 때 누적)
- 처리 누락 건수 (lost jobs)
- PG connection 사용률 (`SELECT count(*) FROM pg_stat_activity`)

**결과 표 템플릿**:

| jobs/s | enqueue p50 | dequeue p50 | 큐 깊이 | 누락 | PG conn % |
|--------|------------|------------|--------|------|----------|
| 1 | | | | | |
| 10 | | | | | |
| 100 | | | | | |
| 1000 | | | | | |

**예상 소요**: 2h

### 4.2 실험 2 — BullMQ 처리량 측정 (동일 프로필)

**목표**: H2 검증 — BullMQ 처리량 + Redis 리소스 소비.

**부하 프로필**: 실험 1과 동일 (1/10/100/1,000 jobs/s × 60s).

**Redis 모니터링 명령**:

```bash
# Redis 메모리 사용량
redis-cli MEMORY USAGE bull:spike-queue:wait
redis-cli INFO memory | grep used_memory_human

# Redis latency 히스토리 (1초 간격)
redis-cli --latency-history -i 1

# BullMQ 큐 상태
redis-cli LLEN bull:spike-queue:wait
redis-cli LLEN bull:spike-queue:active
```

**측정 지표**:
- enqueue p50/p95/p99 (ms)
- dequeue p50/p95/p99 (ms)
- Redis used_memory (MB) — jobs/s 구간별
- Redis CPU 사용률 (%)
- 처리 누락 건수

**결과 표 템플릿**:

| jobs/s | enqueue p50 | dequeue p50 | Redis mem | Redis CPU | 누락 |
|--------|------------|------------|----------|----------|------|
| 1 | | | | | |
| 10 | | | | | |
| 100 | | | | | |
| 1000 | | | | | |

**예상 소요**: 1.5h

### 4.3 실험 3 — 동시 워커 확장 비교 (pgmq 50워커 vs BullMQ 200워커)

**목표**: H3 검증 — 워커 수 한계 + 리소스/처리량 비교.

**pgmq 워커 확장 프로필**:

```
워커 수 단계: 5 → 10 → 25 → 50 → 75 (한계 탐색)
고정 부하: 50 jobs/s
측정: PG connection 사용률, 처리량, advisory lock 대기 시간
```

**BullMQ 워커 확장 프로필**:

```
워커 수 단계: 10 → 50 → 100 → 200 → 300 (한계 탐색)
고정 부하: 200 jobs/s
측정: Redis connection 수, 처리량, Event loop lag
```

**비교 결과 표**:

| 워커 수 | pgmq 처리량 (jobs/s) | pgmq PG conn | BullMQ 처리량 | BullMQ Redis conn |
|--------|-------------------|------------|------------|----------------|
| 10 | | | | |
| 50 | | | | |
| 100 | | N/A | | |
| 200 | | N/A | | |

**예상 소요**: 1.5h

### 4.4 실험 4 — 큐 깊이 부하 측정 (1k / 10k / 100k pending jobs)

**목표**: H4 검증 — pgmq 큐 깊이 10k 시 PG IOPS 상태.

**큐 깊이 조성 방법**:

```
전략: 빠른 생산자 + 느린 소비자로 큐 깊이 누적
  - 생산자: 1000 jobs/s
  - 소비자: 10 jobs/s (의도적으로 느리게)
  - 목표 깊이 도달 시 생산자 중단
  - 소비자를 정상 속도로 전환하여 소진 측정
```

**PG I/O 측정**:

```sql
-- PG 16+: pg_stat_io
SELECT backend_type, object, context, reads, writes, hits
FROM pg_stat_io
WHERE object = 'relation';

-- PG 14/15 대안: pg_statio_all_tables
SELECT relname,
       heap_blks_read,
       heap_blks_hit,
       heap_blks_hit::float / NULLIF(heap_blks_hit + heap_blks_read, 0) AS cache_hit_rate
FROM pg_statio_all_tables
WHERE relname LIKE 'pgmq_%';
```

**큐 깊이별 측정 결과 표**:

| 큐 깊이 | pgmq 추가 메모리 | PG 캐시 히트율 | vacuum 발생 | dequeue p95 |
|--------|---------------|-------------|-----------|------------|
| 0 (기준) | | | | |
| 1k | | | | |
| 10k | | | | |
| 100k | | | | |

**BullMQ 큐 깊이 비교**:

```bash
# Redis 메모리 — 큐 깊이별 측정
redis-cli MEMORY USAGE bull:spike-queue:wait  # 각 깊이에서 실행
```

**예상 소요**: 1h

### 4.5 실험 5 — 장애 복구 정확성 비교

**목표**: pgmq advisory lock vs BullMQ visibility timeout 장애 복구 정확성.

**pgmq 장애 시나리오**:

```
시나리오: 워커가 처리 중 강제 종료 (advisory lock 미해제)
절차:
  1. pgmq.read() 호출 → advisory lock 획득
  2. 워커 프로세스 강제 종료 (SIGKILL)
  3. 30초 VT(visibility timeout) 경과 대기
  4. 메시지 자동 재가시성 확인
  5. 다른 워커가 재처리하는지 확인
기대: 30s 후 자동 재처리, 중복 처리 없음
```

**BullMQ 장애 시나리오**:

```
시나리오: Worker 강제 종료 (lockDuration 미해제)
절차:
  1. Worker가 job 획득 → lock 설정
  2. Worker 프로세스 강제 종료 (SIGKILL)
  3. lockDuration (30s) 경과 대기
  4. job 자동 재큐잉 확인
기대: 30s 후 stalled job으로 분류 → 재처리
```

**복구 비교 측정**:

| 항목 | pgmq | BullMQ |
|------|------|--------|
| 장애 후 재처리 지연 (s) | | |
| 중복 처리 발생 여부 | | |
| 자동 복구 성공률 (10회 시험) | | |
| 수동 개입 필요 여부 | | |

**예상 소요**: 0.5h

### 4.6 실험 6 — wal-g 백업 + pgmq 큐 데이터 포함 여부

**목표**: pgmq 큐 테이블이 wal-g PITR 대상에 포함되는가.

**검증 절차**:

```sql
-- 1단계: pgmq 큐에 10개 메시지 삽입
SELECT pgmq.send('spike_queue', '{"test": true}'::jsonb)
FROM generate_series(1, 10);

-- 2단계: WAL LSN 기록
SELECT pg_current_wal_lsn() AS lsn_before_backup;
```

```bash
# 3단계: wal-g 백업 실행
wal-g backup-push /var/lib/postgresql/14/main

# 4단계: 복원 (별도 PG 인스턴스에서)
wal-g backup-fetch /tmp/restore LATEST
```

```sql
-- 5단계: 복원 후 큐 데이터 존재 여부 확인
SELECT * FROM pgmq.read('spike_queue', 1, 10);
-- 기대: 10/10개 메시지 존재
```

**판정**: 복원 후 큐 메시지 10/10개 존재 → wal-g 호환 확인 (ADR-005 근거 강화).

**예상 소요**: 0.5h

---

## 5. 측정 도구

| 도구 | 용도 | 명령/쿼리 예시 |
|------|------|--------------|
| **k6** | jobs/s 부하 생성 | `k6 run --vus 50 k6-pgmq-load.js` |
| **pg_stat_io** | PG I/O 통계 (PG 16+) | `SELECT * FROM pg_stat_io WHERE object = 'relation';` |
| **pg_statio_all_tables** | PG 14/15 캐시 히트율 | `SELECT heap_blks_hit, heap_blks_read FROM pg_statio_all_tables;` |
| **pg_stat_activity** | PG connection 사용률 | `SELECT count(*) FROM pg_stat_activity;` |
| **pgmq.metrics()** | pgmq 큐 상태 (길이, age) | `SELECT * FROM pgmq.metrics('spike_queue');` |
| **redis-cli MEMORY USAGE** | Redis 큐 메모리 측정 | `redis-cli MEMORY USAGE bull:spike-queue:wait` |
| **redis-cli INFO memory** | Redis 전체 메모리 | `redis-cli INFO memory \| grep used_memory_human` |
| **redis-cli --latency** | Redis latency 히스토리 | `redis-cli --latency-history -i 1` |
| **docker stats** | 컨테이너 CPU/메모리 | `docker stats pg14 redis7 --no-stream` |
| **Node.js process.hrtime** | 정밀 latency (나노초) | `const [s, ns] = process.hrtime(); ms = s*1000 + ns/1e6` |

---

## 6. 성공 기준 (재검토 트리거 정량화)

### 6.1 "pgmq → BullMQ 이전" 트리거 4건 정량화

| 트리거 | 정량 목표 (예비) | 측정 방법 | 실험 | 안전 마진 |
|--------|--------------|----------|------|---------|
| **T1** 처리량 | 100 jobs/s 지속 1주일 | 실측 임계점 × 0.7 | 실험 1 | 30% |
| **T2** 큐 깊이 | 10k 평균 초과 | `pgmq.metrics()` queue_length | 실험 4 | 30% |
| **T3** 동시 워커 | 50개 초과 필요 | connection pool 고갈 시점 × 0.7 | 실험 3 | 30% |
| **T4** PG IOPS | 캐시 히트율 < 70% | pg_stat_io / pg_statio | 실험 4 | 버퍼 없음 |

**트리거 확정 공식**:
- T1 = 실험 1에서 pgmq 안정 처리량 × 0.7
- T2 = 실험 4에서 캐시 히트율 80% 미만 첫 큐 깊이 × 0.7
- T3 = 실험 3에서 pgmq connection 80% 초과 첫 워커 수 × 0.7
- T4 = pg_stat_io reads/(reads+hits) > 30% 임계

### 6.2 부가 성공 기준

| ID | 기준 | 목표값 | 측정 방법 |
|----|------|--------|----------|
| **S1** | pgmq p95 latency (100 jobs/s) | ≤ 500ms | 실험 1 percentile(95) |
| **S2** | BullMQ p95 latency (100 jobs/s) | ≤ 50ms | 실험 2 percentile(95) |
| **S3** | pgmq 50워커 PG connection | < 80% pool | 실험 3 |
| **S4** | 큐 깊이 1k에서 PG 캐시 히트율 | ≥ 90% | 실험 4 |
| **S5** | 장애 복구 자동 성공 (30s VT) | 중복 없이 재처리 10/10 | 실험 5 |
| **S6** | wal-g 복원 후 pgmq 큐 데이터 | 10/10개 존재 | 실험 6 |
| **S7** | BullMQ Redis mem (100 jobs/s) | ≤ 50MB | 실험 2 |

---

## 7. 실패 기준 및 대응

| 실패 조건 | 영향 | 즉각 대응 |
|-----------|------|----------|
| **F1** pgmq 50 jobs/s 불안정 (누락 > 1%) | pgmq 도입 불가 | BullMQ 즉시 도입 권고. ADR-005/012 수정 |
| **F2** pgmq 장애 후 중복 처리 | at-least-once 보장 실패 | VT 단축 + 멱등성 키 강제 적용 |
| **F3** wal-g 복원 후 큐 데이터 유실 | PITR 신뢰성 하락 | pgmq archive 테이블 별도 백업 + wal-g 설정 점검 |
| **F4** pgmq 100k 큐에서 PG 크래시 | 운영 위험 | archive 정리 주기 단축 (1h → 15m) |
| **F5** BullMQ Redis mem > 200MB (100 jobs/s) | 운영 부담 예상 초과 | BullMQ 도입 트리거 상향 조정 |

---

## 8. 결과 분기 (결정 트리)

```
실험 1 결과 (pgmq 안정 처리량)
├─ 안정 처리량 ≥ 150 jobs/s
│   → T1 트리거 = 105 jobs/s (150 × 0.7)
│     ADR-005/012 강화: "105 jobs/s 초과 1주일 지속 시 BullMQ"
│     현재 운영 규모(1-3/s) 대비 충분한 여유 → pgmq 유지
│
├─ 50 ≤ 안정 처리량 < 150 jobs/s
│   → T1 트리거 = 안정처리량 × 0.7
│     ADR 주의사항 추가: "급격한 성장 시 BullMQ 마이그레이션 준비"
│
└─ 안정 처리량 < 50 jobs/s (F1 실패)
    → BullMQ 즉시 도입 권고
      ADR-005/012/016 수정: "pgmq → BullMQ로 교체"
      Phase 22 일정 앞당김

실험 4 결과 (큐 깊이 × IOPS)
├─ 10k에서 캐시 히트율 ≥ 70% → T2 트리거 = 10k 유지
├─ 10k에서 캐시 히트율 50-70% → T2 트리거 = 5k로 하향
└─ 5k 이하에서 이미 한계 → archive 설정 강화 + T2 = 3k

실험 6 결과 (wal-g 호환)
├─ 큐 데이터 포함 → "pgmq 백업 완전 호환" ADR-005 강화
└─ 큐 데이터 유실 → 별도 큐 백업 전략 추가 (F3 대응)
```

---

## 9. 산출물 목록

| # | 산출물 | 형식 | 용도 |
|---|--------|------|------|
| 1 | `pgmq-load-results.csv` | CSV | 실험 1 전 구간 측정값 |
| 2 | `bullmq-load-results.csv` | CSV | 실험 2 전 구간 측정값 |
| 3 | `worker-scaling-matrix.md` | 표 | 실험 3 워커 수 × 처리량 |
| 4 | `queue-depth-iops.md` | 표 | 실험 4 큐 깊이 × IOPS |
| 5 | `trigger-thresholds.md` | 결정 문서 | DQ-4.3 트리거 4건 확정값 |
| 6 | `spike-010-result.md` | Markdown | 최종 결과 + ADR 갱신 권고 |

---

## 10. 일정 (8h 세부)

| 시간대 | 작업 | 병렬 가능 | 산출물 |
|--------|------|----------|--------|
| 0-0.5h | 환경 구성 (pgmq 설치 + Redis 기동 + k6 준비) | — | 환경 확인 |
| 0.5-2.5h | 실험 1: pgmq 처리량 측정 4단계 | — | pgmq-load-results.csv |
| 2.5-4h | 실험 2: BullMQ 처리량 측정 4단계 | 실험 1과 환경 독립 | bullmq-load-results.csv |
| 4-5.5h | 실험 3: 워커 확장 비교 | pgmq/BullMQ 병렬 | worker-scaling-matrix.md |
| 5.5-6.5h | 실험 4: 큐 깊이 부하 | pgmq 집중 | queue-depth-iops.md |
| 6.5-7h | 실험 5 + 6: 장애 복구 + wal-g 검증 | 순차 | 결과 메모 |
| 7-8h | 결과 정리 + 트리거 4건 확정 | — | trigger-thresholds.md + spike-010-result.md |

---

## 11. 관련 문서 및 ADR

| 문서/ADR | 관계 |
|---------|------|
| `02-architecture/15-data-api-blueprint.md` | 본 스파이크 결과 → §pgmq 트리거 섹션에 반영 |
| `02-architecture/01-adr-log.md §ADR-005` | pgmq 채택 근거 — 본 스파이크로 처리량 한계 수치 추가 |
| `02-architecture/01-adr-log.md §ADR-012` | Data API Phase 21 — pgmq Outbox 공수 재확인 |
| `01-research/04-db-ops/` | pgmq deep-dive 원본 |
| `01-research/11-data-api/` | Data API 리서치 원본 (pgmq 포함) |
| DQ-4.3 | BullMQ 재검토 시점 — 본 스파이크로 정량 확정 |
| TD-011 | pgmq dead-letter 알림 구현 — Phase 21-B |

---

## 12. kdyspike 연계

```bash
# 전체 스파이크 실행
/kdyspike --full pgmq-vs-bullmq --max-hours 8

# 부분 실행 (처리량 측정만)
/kdyspike --experiment 1,2 --max-hours 4

# 트리거 확정 보고
/kdyspike --summarize pgmq-vs-bullmq --output trigger-thresholds.md
```

에이전트 병렬 실행 가능 단위:
- 실험 1 (pgmq) + 실험 2 (BullMQ): 환경 독립 → 병렬 가능
- 실험 3: pgmq 워커 확장 + BullMQ 워커 확장 병렬 가능
- 실험 4: 실험 1 완료 후 pgmq 환경 재사용 (순차)
- 실험 5 + 6: 소규모 순차

---

## 13. 다음 TODO (스파이크 완료 후)

- [ ] `trigger-thresholds.md` 작성 (T1-T4 수치 확정)
- [ ] ADR-005 §처리량 한계 섹션 갱신 (실측 기반)
- [ ] ADR-012 §pgmq Outbox Phase 21-B 공수 재확인
- [ ] DQ-4.3 답변 업데이트: "BullMQ 이전 트리거 T1-T4" (`01-adr-log.md`)
- [ ] TD-011 pgmq dead-letter 알림 구현 계획 구체화
- [ ] Phase 21 착수 (분기 A: pgmq 유지 + 트리거 모니터링 / 분기 실패: BullMQ 도입 일정)
- [ ] pgmq 큐 깊이 모니터링 대시보드 카드 추가 (T2 트리거 알림 연동)
