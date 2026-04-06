# 09. Supabase 스케일링 전략 & 한계점 대응

> 작성일: 2026-04-06  
> 대상 독자: Supabase 기반 서비스를 프로덕션 규모로 운영하려는 개발자/아키텍트  
> Wave: 4/4 — 전략 종합  
> 참고: [Supabase Compute & Disk 공식 문서](https://supabase.com/docs/guides/platform/compute-and-disk) · [Read Replicas 공식 문서](https://supabase.com/docs/guides/platform/read-replicas)

---

## 목차

1. [수직 스케일링: 인스턴스 크기 관리](#1-수직-스케일링-인스턴스-크기-관리)
2. [수평 스케일링: 읽기 복제본과 글로벌 분산](#2-수평-스케일링-읽기-복제본과-글로벌-분산)
3. [데이터베이스 레이어 스케일링](#3-데이터베이스-레이어-스케일링)
4. [서비스별 한계점과 대응 전략](#4-서비스별-한계점과-대응-전략)
5. [탈출 전략: Supabase 너머로 나아갈 때](#5-탈출-전략-supabase-너머로-나아갈-때)
6. [스케일링 의사결정 플로우](#6-스케일링-의사결정-플로우)

---

## 1. 수직 스케일링: 인스턴스 크기 관리

### 1.1 인스턴스 티어 전체 스펙표

Supabase는 2026년 현재 총 11개 컴퓨트 티어를 제공한다. 아래 표는 공식 문서 기준 정확한 사양이다.

| 티어 | vCPU | RAM | 코어 유형 | DB 커넥션 | 풀러 커넥션 | 월 가격 |
|------|------|-----|-----------|-----------|-------------|---------|
| **Nano** | 공유 | 0.5 GB | 공유 버스트 | 60 | 200 | Free 전용 |
| **Micro** | 2코어 ARM | 1 GB | 공유 버스트 | 60 | 200 | ~$12 |
| **Small** | 2코어 ARM | 2 GB | 공유 버스트 | 90 | 400 | ~$24 |
| **Medium** | 2코어 ARM | 4 GB | 공유 버스트 | 120 | 600 | ~$48 |
| **Large** | 2코어 ARM | 8 GB | **전용 코어** | 160 | 800 | ~$96 |
| **XL** | 4코어 ARM | 16 GB | 전용 코어 | 240 | 1,200 | ~$192 |
| **2XL** | 8코어 ARM | 32 GB | 전용 코어 | 380 | 2,400 | ~$384 |
| **4XL** | 16코어 ARM | 64 GB | 전용 코어 | 480 | 4,800 | ~$768 |
| **8XL** | 32코어 ARM | 128 GB | 전용 코어 | 490 | 9,600 | ~$1,870 |
| **12XL** | 48코어 ARM | 192 GB | 전용 코어 | 500 | 12,000 | ~$2,800 |
| **16XL** | 64코어 ARM | 256 GB | 전용 코어 | 500 | 12,000 | ~$3,730 |

> **핵심 아키텍처 분기점**: Large 티어가 "공유 버스트"에서 "전용 전용 코어"로 넘어가는 경계선이다. Nano~Medium은 동일 물리 서버의 다른 프로젝트가 CPU를 많이 쓰면 영향을 받는다. Large부터는 예측 가능한 일정 수준의 성능이 보장된다.

### 1.2 티어별 성능 특성 상세

#### Nano / Micro (Free / $12) — 개인 프로젝트, 프로토타입
- **적합**: MAU 1,000 미만, 동시 사용자 10명 이하
- **CPU**: 공유 ARM 코어. 타 프로젝트의 부하에 따라 응답시간이 수십 ms ~ 수백 ms로 변동
- **메모리**: 0.5~1 GB. PostgreSQL 공유 버퍼(shared_buffers)가 128~256 MB 수준에 불과해 큰 테이블 풀스캔 시 I/O 병목 발생
- **커넥션**: 60개. Supavisor 풀러를 반드시 사용해야 하며, 직접 연결은 즉시 한계에 도달

#### Small / Medium ($24~$48) — 초기 스타트업, 사이드 프로젝트 수익화 단계
- **적합**: MAU 5,000~20,000, 동시 API 요청 초당 50~200건
- **CPU**: 공유 버스트. 순간적인 트래픽 스파이크(예: SNS 공유로 인한 폭발적 유입)에 일시적으로 대응하지만, 지속적인 고부하에서는 조절(throttle)됨
- **메모리**: 2~4 GB. 중간 규모 조인 쿼리와 인덱스 캐시에 충분하지만, 대용량 분석 쿼리는 디스크 I/O 의존
- **주의**: shared_buffers가 작으므로 인덱스 설계가 특히 중요. 풀스캔을 유발하는 쿼리 패턴은 반드시 제거

#### Large ($96) — 핵심 전환점, 프로덕션 입문
- **적합**: MAU 20,000~100,000, 동시 요청 초당 200~500건
- **CPU**: 2코어 전용. 타 프로젝트의 영향을 받지 않아 p99 응답시간이 안정화됨
- **메모리**: 8 GB. shared_buffers를 2 GB로 설정 가능, 대부분의 워킹 셋을 메모리에 유지
- **DB 커넥션**: 160개 직접 + 800개 풀러. 일반적인 웹앱에서 커넥션 부족을 거의 경험하지 않음
- **권고**: "제대로 된 프로덕션"을 운영한다면 최소 Large 이상을 권장

#### XL / 2XL ($192~$384) — 중규모 SaaS, 데이터 집약적 서비스
- **적합**: MAU 100,000~500,000, 대용량 리포팅, 복잡한 조인 쿼리
- **CPU**: 4~8 전용 코어. 병렬 쿼리 실행(parallel query) 효과가 발휘됨
- **메모리**: 16~32 GB. 웬만한 OLTP 워크로드의 전체 인덱스 + 주요 테이블을 메모리에 수용
- **병렬 쿼리**: PostgreSQL의 max_parallel_workers_per_gather를 늘려 대형 집계 쿼리 가속 가능

#### 4XL ~ 16XL ($768~$3,730) — 대규모 기업급
- **적합**: MAU 1,000,000+, 수십억 행 규모 데이터, 복잡한 분석 쿼리
- **16코어~64코어 전용**: OLAP 쿼리에서 선형에 가까운 성능 향상
- **메모리**: 64~256 GB. pgvector 임베딩 테이블, 대규모 Materialized View를 완전히 메모리에 수용
- **현실적 조언**: 이 크기까지 도달했다면 Read Replica와 파티셔닝을 동시에 적용해야 비용 효율이 나온다

### 1.3 업그레이드 시점 판단 기준

수직 스케일링 결정은 **세 가지 신호** 중 하나라도 임계값을 초과하면 즉시 검토해야 한다.

#### CPU 사용률 임계값

```
경보 레벨    CPU 사용률    조치
───────────────────────────────────
정상         < 60%        현상 유지
주의         60-75%       쿼리 최적화 우선 검토
위험         75-85%       1단계 업그레이드 계획 수립
긴급         > 85%        즉시 업그레이드 또는 스케일아웃
```

> Supabase 대시보드 → Reports → Database에서 CPU 사용률 추이를 확인할 수 있다. Grafana 대시보드가 더 세밀한 시계열을 제공한다.

#### 메모리 사용률 임계값

```
경보 레벨    사용률        조치
───────────────────────────────────
정상         < 70%        현상 유지
주의         70-85%       인덱스 사용률 검토, work_mem 조정
위험         > 85%        OOM 리스크. 즉시 대응 필요
```

- 메모리 사용률이 높으면 PostgreSQL이 캐시를 제대로 활용하지 못하고 디스크 I/O가 증가한다
- 쿼리마다 생성되는 임시 정렬 메모리(work_mem)가 누적되면 급격히 상승하므로, 복잡한 ORDER BY + JOIN 쿼리 패턴을 점검해야 한다

#### 커넥션 포화도 임계값

```
경보 레벨    활성 커넥션/한계   조치
──────────────────────────────────────
정상         < 70%             현상 유지
주의         70-85%            Supavisor 풀러 설정 최적화
위험         > 85%             즉시 인스턴스 업그레이드
```

- Supavisor 풀러를 이미 사용 중이라면 DB 직접 커넥션 수보다 클라이언트 풀러 커넥션 수를 우선 모니터링한다
- 커넥션 포화는 CPU/메모리보다 더 즉각적으로 서비스 장애(500 에러)로 이어진다

### 1.4 무중단 업그레이드 절차

Supabase의 컴퓨트 업그레이드는 **짧은 재시작**을 수반한다. 완전한 제로 다운타임은 아니지만, 다음 절차를 따르면 영향을 최소화할 수 있다.

```
1단계: 사전 준비 (업그레이드 전날)
  ├── 피크 트래픽 시간대 파악 (Grafana 대시보드 활용)
  ├── 업그레이드 예정 시간: 새벽 2~4시 (최저 트래픽)
  └── 팀 알림 및 상태 페이지 준비

2단계: 클라이언트 측 resilience 확인
  ├── 연결 재시도 로직 구현 여부 확인
  │   예) exponential backoff with jitter
  ├── 연결 풀러(Supavisor) 사용 여부 확인
  └── API 레이어의 타임아웃 설정 검토 (권장: 30초)

3단계: 업그레이드 실행
  ├── Supabase Dashboard → Project Settings → Compute
  ├── 목표 티어 선택 후 "Upgrade" 클릭
  ├── 예상 다운타임: 20초~2분 (티어에 따라 다름)
  └── 업그레이드 완료 후 자동 재연결 확인

4단계: 업그레이드 후 검증
  ├── pg_stat_activity로 커넥션 수 확인
  ├── EXPLAIN ANALYZE로 주요 쿼리 성능 재측정
  ├── Grafana에서 메모리/CPU 베이스라인 재설정
  └── 알림 임계값 조정 (새 티어 기준)

5단계: PostgreSQL 파라미터 최적화
  ├── shared_buffers: RAM의 25% (Large에서 2 GB)
  ├── work_mem: 개별 쿼리 정렬 메모리 (64~256 MB)
  ├── max_parallel_workers_per_gather: vCPU의 50%
  └── effective_cache_size: RAM의 75%
```

> **중요**: 업그레이드는 **다운그레이드보다 훨씬 빠르다**. 다운그레이드는 데이터 마이그레이션이 필요한 경우도 있어 더 긴 작업 시간이 소요된다.

---

## 2. 수평 스케일링: 읽기 복제본과 글로벌 분산

### 2.1 Read Replica 아키텍처

Supabase Read Replica는 프라이머리 데이터베이스와 동기화 상태를 유지하는 **별도의 읽기 전용 PostgreSQL 인스턴스**다. 2025년 4월부터 지오 라우팅(geo-routing) 방식으로 전환되어, 단순 로드 밸런싱을 넘어 지리적 지연시간 최소화 역할도 수행한다.

```
                    ┌─────────────────────────┐
                    │   Supabase Load Balancer │
                    │   (지오 라우팅 엔진)       │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
    ┌─────────▼──────┐ ┌────────▼───────┐ ┌───────▼────────┐
    │  Primary DB    │ │  Replica (US)  │ │  Replica (EU)  │
    │  (Seoul)       │ │  us-east-1     │ │  eu-central-1  │
    │  읽기+쓰기      │ │  읽기 전용     │ │  읽기 전용     │
    └────────────────┘ └────────────────┘ └────────────────┘
           │                  ▲                  ▲
           └──── 스트리밍 복제 ┘──────────────────┘
```

#### 라우팅 규칙 (2025년 4월 이후)

| 요청 유형 | 라우팅 대상 | 이유 |
|-----------|-------------|------|
| `GET` (Data API) | 가장 가까운 Replica | 지오 라우팅, 낮은 지연시간 |
| `POST/PUT/PATCH/DELETE` | Primary | 쓰기는 반드시 Primary |
| Auth 요청 전체 | Primary | 일관성 보장 |
| Storage 요청 | Primary | 메타데이터 일관성 |
| Realtime 구독 | Primary | 변경 스트림 소스 |

#### 지원 플랜

- **Pro, Team, Enterprise** 플랜에서 사용 가능 (Free 플랜 미지원)
- 각 Replica는 프라이머리와 동일한 컴퓨트 티어로 프로비저닝됨
- **요금**: Replica 인스턴스의 컴퓨트 비용 + 리전 간 데이터 전송 비용 별도 청구

### 2.2 Read Replica 활용 시나리오

#### 시나리오 A: 글로벌 사용자 대상 서비스
```
목표: 미국, 유럽 사용자의 읽기 지연시간 < 50ms

구성:
  Primary: ap-northeast-1 (Seoul)
  Replica 1: us-east-1 (Virginia)
  Replica 2: eu-central-1 (Frankfurt)

결과: 아시아 사용자는 Seoul Primary, 미국은 Virginia, 유럽은 Frankfurt로 자동 라우팅
기대 효과: 읽기 지연시간 150~300ms → 20~50ms (60~85% 개선)
```

#### 시나리오 B: 분석/리포팅 쿼리 격리
```
목표: 무거운 집계 쿼리가 프로덕션 OLTP에 영향 주지 않도록

구성:
  Primary: 프로덕션 CRUD 트래픽 전용
  Replica (전용 연결 문자열): 리포팅 대시보드, 배치 분석 쿼리

코드 예시 (TypeScript):
  // 프로덕션 클라이언트 (Primary/로드 밸런서)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  // 분석 전용 클라이언트 (Replica 직접 연결)
  const analyticsClient = createClient(
    process.env.SUPABASE_REPLICA_URL,  // Replica 전용 URL
    process.env.SUPABASE_ANON_KEY
  )
```

#### 시나리오 C: 인스턴스 업그레이드 전 부하 분산
```
상황: Medium 인스턴스에서 읽기 부하 70%에 도달했지만, 쓰기는 10%만 사용

분석:
  - 업그레이드(Medium → Large): +$48/월
  - Replica 추가(Medium 복제본): +$48/월
  - 비용은 동일하지만 Replica는 지리적 분산 + 부하 격리까지 제공

결론: 읽기 비율이 높은 서비스라면 수직 업그레이드보다 Replica 추가가 더 효율적
```

### 2.3 Supavisor 연결 풀러 라우팅 전략

Supavisor는 Supabase의 연결 풀러로, Read Replica에도 각각 별도의 Supavisor 엔드포인트가 제공된다.

```
# 연결 문자열 구조
Primary Supavisor:  postgresql://[user]:[pass]@[project-ref].pooler.supabase.com:6543/postgres
Replica Supavisor:  postgresql://[user]:[pass]@[replica-ref].pooler.supabase.com:6543/postgres

# 트랜잭션 모드 vs 세션 모드
- 트랜잭션 모드 (포트 6543): 권장. 커넥션 재사용률 최대화
- 세션 모드 (포트 5432): SET 커맨드, Prepared Statement 필요 시
```

### 2.4 Edge Functions 글로벌 배포

Edge Functions는 Deno Deploy 인프라를 기반으로 **자동으로 글로벌 엣지 노드에 배포**된다. 별도의 설정 없이 사용자와 가장 가까운 엣지 노드에서 실행된다.

```
글로벌 배포 현황 (2026년 기준):
  - 북미: us-east-1, us-west-1
  - 유럽: eu-central-1, eu-west-1
  - 아시아: ap-northeast-1, ap-southeast-1
  - 기타: 12개+ 추가 리전

콜드 스타트 최적화:
  - ESZip 포맷으로 번들링되어 콜드 스타트 200~400ms
  - 지속적으로 트래픽이 있는 함수는 워밍 상태 유지
  - 타임아웃: CPU 시간 2초, 벽시계 시간 400초(유료), 유휴 타임아웃 150초
```

---

## 3. 데이터베이스 레이어 스케일링

### 3.1 파티셔닝 전략

PostgreSQL 파티셔닝은 **수십억 행 규모의 테이블**에서 쿼리 성능과 유지보수 효율을 동시에 높이는 핵심 기법이다.

#### 범위 파티셔닝 (Range Partitioning) — 시계열 데이터

```sql
-- 예시: 로그 테이블을 월별로 파티셔닝
CREATE TABLE logs (
  id          bigserial,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,
  action      text,
  metadata    jsonb
) PARTITION BY RANGE (created_at);

-- 파티션 생성 (수동 또는 pg_cron으로 자동화)
CREATE TABLE logs_2026_01 PARTITION OF logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE logs_2026_02 PARTITION OF logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 각 파티션에 독립적인 인덱스
CREATE INDEX logs_2026_01_user_idx ON logs_2026_01 (user_id);
CREATE INDEX logs_2026_02_user_idx ON logs_2026_02 (user_id);
```

**효과**:
- `WHERE created_at >= '2026-03-01'` 쿼리 시 파티션 프루닝(Partition Pruning)으로 해당 파티션만 스캔
- 오래된 파티션을 `DETACH PARTITION`으로 즉시 제거 (VACUUM 불필요)
- 각 파티션을 별도 테이블스페이스로 이동해 콜드/핫 데이터 분리 가능

#### 해시 파티셔닝 (Hash Partitioning) — 균등 분산

```sql
-- 예시: user_id 기반 해시 파티셔닝 (8개 파티션)
CREATE TABLE user_events (
  id      bigserial,
  user_id uuid NOT NULL,
  event   text,
  ts      timestamptz DEFAULT now()
) PARTITION BY HASH (user_id);

CREATE TABLE user_events_0 PARTITION OF user_events
  FOR VALUES WITH (MODULUS 8, REMAINDER 0);
-- ... user_events_1 ~ user_events_7
```

**적합한 경우**: 특정 user_id의 이벤트만 조회하는 패턴이 지배적인 경우

#### 목록 파티셔닝 (List Partitioning) — 카테고리 분리

```sql
-- 예시: 지역별 파티셔닝
CREATE TABLE orders (
  id     bigserial,
  region text NOT NULL,
  ...
) PARTITION BY LIST (region);

CREATE TABLE orders_kr PARTITION OF orders FOR VALUES IN ('KR');
CREATE TABLE orders_us PARTITION OF orders FOR VALUES IN ('US', 'CA');
CREATE TABLE orders_eu PARTITION OF orders FOR VALUES IN ('DE', 'FR', 'GB');
```

#### 파티셔닝 자동화 (pg_cron 활용)

```sql
-- 매월 1일에 다음 달 파티션 자동 생성
SELECT cron.schedule(
  'create-monthly-partition',
  '0 0 25 * *',  -- 매월 25일 자정
  $$
  DO $$
  DECLARE
    next_month date := date_trunc('month', now() + interval '1 month');
    partition_name text := 'logs_' || to_char(next_month, 'YYYY_MM');
    start_date text := to_char(next_month, 'YYYY-MM-DD');
    end_date text := to_char(next_month + interval '1 month', 'YYYY-MM-DD');
  BEGIN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF logs FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
  END;
  $$ LANGUAGE plpgsql;
  $$
);
```

### 3.2 아카이빙 전략 (콜드 데이터 분리)

데이터를 무한정 프라이머리 인스턴스에 쌓으면 비용과 성능 모두 악화된다. 아카이빙 전략은 **핫 데이터**는 빠른 접근이 가능한 프라이머리에, **콜드 데이터**는 저렴한 저장소로 이동시키는 것이다.

#### 전략 1: 파티션 분리 + Foreign Data Wrapper (FDW)

```sql
-- 아카이브 전용 별도 Supabase 프로젝트 또는 외부 PostgreSQL
-- FDW로 연결하여 투명하게 접근

CREATE EXTENSION postgres_fdw;

CREATE SERVER archive_server
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'archive-db.example.com', port '5432', dbname 'archive');

-- 오래된 파티션을 FDW 테이블로 교체
ALTER TABLE logs DETACH PARTITION logs_2025_01;
-- logs_2025_01을 아카이브 DB로 pg_dump/pg_restore
-- 이후 FDW 테이블로 재연결하면 애플리케이션 코드 변경 없이 접근 가능
```

#### 전략 2: Supabase Storage를 Cold Storage로 활용

```typescript
// 오래된 데이터를 JSONL 파일로 Supabase Storage에 보관
async function archiveOldLogs(olderThanDays: number) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)

  // 1. 아카이빙할 데이터 조회
  const { data: oldLogs } = await supabase
    .from('logs')
    .select('*')
    .lt('created_at', cutoff.toISOString())
    .order('created_at')

  // 2. JSONL 형식으로 직렬화
  const jsonl = oldLogs.map(row => JSON.stringify(row)).join('\n')
  const blob = new Blob([jsonl], { type: 'application/jsonl' })

  // 3. Storage에 업로드
  const archiveKey = `archives/logs/${cutoff.toISOString().slice(0, 7)}.jsonl`
  await supabase.storage.from('data-archives').upload(archiveKey, blob)

  // 4. 원본 데이터 삭제
  await supabase
    .from('logs')
    .delete()
    .lt('created_at', cutoff.toISOString())

  console.log(`아카이빙 완료: ${oldLogs.length}건 → ${archiveKey}`)
}
```

#### 전략 3: pg_partman + pg_cron 자동 보존 정책

```sql
-- pg_partman 확장으로 보존 기간 자동 관리
-- (Supabase Enterprise 또는 self-hosted에서 pg_partman 활성화 필요)

-- 보존 정책: 최근 12개월만 유지, 이전 파티션은 DROP
UPDATE partman.part_config
SET retention = '12 months',
    retention_keep_table = false  -- 파티션 드롭 허용
WHERE parent_table = 'public.logs';

-- pg_cron으로 매일 자정 실행
SELECT cron.schedule('cleanup-old-partitions', '0 2 * * *',
  'SELECT partman.run_maintenance()');
```

### 3.3 Materialized View 활용

집계가 무거운 대시보드 쿼리를 매 요청마다 실행하면 CPU와 I/O를 낭비한다. Materialized View는 결과를 **미리 계산해서 저장**한다.

```sql
-- 예시: 일별 통계 Materialized View
CREATE MATERIALIZED VIEW daily_stats AS
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(*)                       AS total_orders,
  SUM(amount)                    AS revenue,
  AVG(amount)                    AS avg_order_value,
  COUNT(DISTINCT user_id)        AS unique_customers
FROM orders
WHERE created_at >= now() - interval '90 days'
GROUP BY 1
ORDER BY 1 DESC;

-- 인덱스로 빠른 조회
CREATE UNIQUE INDEX daily_stats_day_idx ON daily_stats (day);

-- 자동 갱신 (pg_cron)
SELECT cron.schedule(
  'refresh-daily-stats',
  '5 0 * * *',  -- 매일 새벽 0시 5분
  'REFRESH MATERIALIZED VIEW CONCURRENTLY daily_stats'
);
```

**`CONCURRENTLY` 옵션**: 갱신 중에도 이전 데이터를 읽을 수 있어 사용자 경험 저하 없음. 단, Unique Index가 반드시 존재해야 한다.

### 3.4 인덱스 최적화

인덱스는 올바르게 설계하면 쿼리 성능을 100배 이상 향상시키지만, 과도한 인덱스는 쓰기 성능을 저하시키고 저장 공간을 낭비한다.

#### 필수 인덱스 전략

```sql
-- 1. 부분 인덱스 (Partial Index): 자주 필터링하는 조건에
CREATE INDEX orders_pending_idx ON orders (created_at)
  WHERE status = 'pending';
-- 전체 orders 대신 pending 상태만 인덱싱 → 크기 대폭 감소

-- 2. 복합 인덱스: 쿼리 패턴에 맞게
-- "특정 user_id의 최근 orders" 쿼리가 많다면
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);

-- 3. BRIN 인덱스: 시계열 데이터에서 B-Tree 대안
-- 물리적 순서와 논리적 순서가 일치하는 컬럼에 효과적 (created_at 등)
CREATE INDEX logs_created_brin ON logs USING BRIN (created_at);
-- B-Tree 대비 크기 1/100, 삽입 속도 수배 빠름, 범위 쿼리에 충분

-- 4. GIN 인덱스: JSONB, 배열, 전문 검색
CREATE INDEX products_metadata_gin ON products USING GIN (metadata jsonb_path_ops);

-- 5. 미사용 인덱스 탐지 및 정리
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,          -- 인덱스 스캔 횟수
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0     -- 한 번도 사용되지 않은 인덱스
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## 4. 서비스별 한계점과 대응 전략

### 4.1 단일 PostgreSQL 인스턴스의 한계

#### 한계: 쓰기 처리량

PostgreSQL은 단일 인스턴스에서 초당 수천~수만 건의 쓰기를 처리할 수 있지만, **지속적으로 초당 10,000건 이상**의 쓰기가 발생하면 WAL(Write-Ahead Log) I/O가 병목이 된다.

```
쓰기 병목 징후:
  - pg_stat_activity에서 waiting = true인 트랜잭션 증가
  - WAL sender lag 지속 증가
  - IOPS가 인스턴스 한계에 도달

대응 방법:
  1. 배치 쓰기: 건별 INSERT 대신 bulk INSERT 사용
     INSERT INTO events (data) VALUES ($1), ($2), ... ($1000)
  
  2. 비동기 쓰기: Supabase Queue(pgmq)를 버퍼로 활용
     클라이언트 → Queue → Worker → DB (백프레셔 제어)
  
  3. 파티셔닝: 쓰기를 여러 파티션에 분산
  
  4. 비정규화: 집계 카운터를 별도 테이블에 관리
     (이벤트 소싱 패턴)
```

#### 한계: 연결 수

PostgreSQL의 커넥션은 프로세스 기반이라 연결 하나당 ~5~10 MB 메모리를 소비한다. 직접 연결 한계(16XL 기준 500개)를 초과하면 새 연결이 거부된다.

```
대응: Supavisor 풀러를 반드시 경유
  - 트랜잭션 풀링: 최대 12,000 클라이언트 → 최대 500 DB 연결
  - 사용 후 즉시 커넥션 반환으로 효율 극대화

코드 패턴 (서버사이드 환경):
  // ❌ 잘못된 패턴: 요청마다 새 클라이언트 생성
  const client = createClient(url, key)
  
  // ✅ 올바른 패턴: 모듈 레벨에서 싱글톤 클라이언트
  // 또는 Supavisor 트랜잭션 풀 모드 사용
```

### 4.2 Realtime 동시 접속 한계

#### 플랜별 한계

| 플랜 | 동시 접속 | 초당 메시지 | 채널당 Presence |
|------|-----------|-------------|-----------------|
| Free | 200 | 100 | 100명 |
| Pro | 500 | 500 | 100명 |
| Pro (지출 한도 해제) | 10,000 | 2,500 | 1,000명 |
| Team | 10,000 | 2,500 | 1,000명 |
| Enterprise | 10,000+ | 2,500+ | 커스텀 |

#### Pro 500 커넥션 한계 돌파 방법

```typescript
// 방법 1: 지출 한도(Spend Cap) 해제
// Dashboard → Billing → Spend Cap 비활성화
// Pro Plan에서 10,000 커넥션까지 자동 확장
// 추가 비용: $10 / 1,000 peak connections

// 방법 2: 채널 설계 최적화
// ❌ 비효율: 사용자마다 별도 채널 구독
const channel = supabase.channel(`user-${userId}`)

// ✅ 효율: 공통 채널 + 클라이언트 필터링
const channel = supabase.channel('global-updates')
channel.on('broadcast', { event: 'data' }, (payload) => {
  if (payload.userId === myUserId) {
    handleUpdate(payload)
  }
})

// 방법 3: Presence 대신 DB 폴링
// 소규모 실시간 기능은 Realtime 대신
// setInterval + Supabase DB 쿼리로 처리
// (채널 수 절감, 더 안정적)

// 방법 4: 메시지 집계 (fan-out 패턴)
// 고빈도 이벤트는 클라이언트 단에서 디바운스 처리
const debouncedSend = debounce((data) => {
  channel.send({ type: 'broadcast', event: 'update', payload: data })
}, 100)
```

#### 10,000 커넥션 초과 시

Supabase Realtime의 단일 프로젝트 한계를 초과할 경우:

1. **Enterprise 플랜 + 커스텀 할당량 협의**: Supabase 영업팀 문의
2. **샤딩**: 여러 Supabase 프로젝트로 사용자를 분산 (user_id 기준 해시)
3. **자체 실시간 인프라**: Ably, Pusher, 또는 직접 구현한 WebSocket 서버로 전환

### 4.3 Storage 대역폭 한계

#### 플랜별 Storage 포함량 및 초과 요금

| 항목 | Free | Pro | Team |
|------|------|-----|------|
| 용량 | 1 GB | 100 GB | 100 GB |
| 대역폭 | 2 GB/월 | 200 GB/월 | 200 GB/월 |
| 초과 대역폭 | 불가 | $0.09/GB | $0.09/GB |
| CDN | 기본 | 기본 | 기본 |

#### 대역폭 최적화 전략

```typescript
// 1. 이미지 변환 API로 크기 최적화
// 원본 이미지 대신 적절한 크기로 변환하여 전송
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl('user-avatar.jpg', {
    transform: {
      width: 200,
      height: 200,
      quality: 80,
      format: 'webp'  // WebP로 변환 (30~40% 크기 감소)
    }
  })

// 2. 서명된 URL에 캐시 제어 헤더 설정
const { data: signedUrl } = await supabase.storage
  .from('documents')
  .createSignedUrl('file.pdf', 3600, {
    download: false
  })
// Cache-Control 설정은 Storage 버킷 레벨에서 구성

// 3. Cloudflare를 앞단에 배치
// Supabase Storage URL을 Cloudflare Workers로 프록시하면
// Cloudflare의 글로벌 CDN 캐시 활용 → 대역폭 대폭 절감
```

#### 대역폭 급증 시나리오 대응

대용량 파일 다운로드나 바이럴 콘텐츠로 인한 대역폭 급증이 예상될 때:

1. **Cloudflare R2로 대용량 파일 이동**: R2는 egress 요금이 없어 대역폭 비용 제로
2. **서명된 URL 만료 시간 최소화**: 장기 캐싱 대신 짧은 만료 + CDN 레이어 캐싱
3. **파일 업로드 크기 제한 강화**: 클라이언트와 서버 양쪽에서 검증

### 4.4 Edge Functions 동시성 한계

#### 현재 한계 (2026년 기준)

| 항목 | 한계값 | 비고 |
|------|--------|------|
| CPU 시간/요청 | 2초 | 비동기 I/O는 포함되지 않음 |
| 벽시계 시간 | 400초(유료), 150초(Free) | 유휴 타임아웃과 별개 |
| 유휴 타임아웃 | 150초 | 응답 없으면 504 |
| 메모리/인스턴스 | 256 MB | |
| 함수 번들 크기 | 20 MB | 번들링 후 기준 |
| 중첩 함수 호출 | 5,000/분 | 2026년 3월 도입된 제한 |
| 배포 가능 함수 수 | 100(Free) / 500(Pro) / 1,000(Team) | |

#### 동시성 한계 대응

```typescript
// 1. CPU 집약적 작업은 Edge Functions에서 분리
// ❌ Edge Function에서 무거운 이미지 처리, 암호화 연산
// ✅ Supabase Queue → 별도 백엔드 Worker로 처리

// 2. 콜드 스타트 최소화
// 의존성을 최소화하고 ESM import 최적화
// import { createClient } from 'jsr:@supabase/supabase-js'  // Deno ESM
// 번들 크기가 클수록 콜드 스타트 증가

// 3. 타임아웃 문제 해결: 긴 작업은 비동기로 분리
// 즉시 202 Accepted 응답 반환 후 백그라운드에서 처리
Deno.serve(async (req) => {
  // 백그라운드 태스크 시작
  EdgeRuntime.waitUntil(processAsync(req.clone()))
  
  // 즉시 응답
  return new Response(JSON.stringify({ status: 'accepted' }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

---

## 5. 탈출 전략: Supabase 너머로 나아갈 때

### 5.1 탈출 신호 감지

아래 조건 중 3개 이상 해당하면 Supabase 의존도를 재검토할 시점이다.

```
체크리스트:
  □ 월 비용이 $3,000 초과 (16XL 인스턴스 수준)
  □ 16XL 인스턴스에서도 CPU/메모리가 포화 상태
  □ Realtime이 10,000 커넥션을 지속적으로 초과
  □ 특수 PostgreSQL 확장이나 커스텀 설정이 필요한데 불가
  □ 데이터 레지던시 규정이 Supabase 제공 리전 외를 요구
  □ 멀티 리전 쓰기(Multi-Master) 기능이 필요
  □ Supabase 서비스 중단으로 인한 비즈니스 영향이 임계값 초과
```

### 5.2 탈출 전략 1: PostgreSQL 직접 운영

Supabase의 가장 큰 장점은 PostgreSQL 표준을 그대로 사용하므로, 탈출이 상대적으로 용이하다는 점이다.

```
마이그레이션 경로:
  Supabase Managed
    → AWS RDS Aurora PostgreSQL
    → Google Cloud SQL for PostgreSQL
    → Azure Database for PostgreSQL
    → 자체 서버 (EC2/GCE + PostgreSQL)

데이터 이전:
  1. pg_dump로 논리적 백업
     pg_dump --format=custom \
       postgresql://[supabase-connection-string] \
       > backup.dump
  
  2. 대상 서버에 pg_restore
     pg_restore --format=custom \
       --host=new-db.example.com \
       -d mydb backup.dump

손실되는 Supabase 전용 기능:
  - PostgREST (REST API 자동 생성) → PostgREST 직접 배포
  - GoTrue (Auth) → Auth0, Clerk, 또는 GoTrue 직접 배포
  - Realtime → Ably, Pusher, 또는 자체 WebSocket
  - Storage → AWS S3, Cloudflare R2
  - Studio (GUI) → pgAdmin, TablePlus 등 대체 가능
  - Edge Functions → AWS Lambda, Cloudflare Workers

예상 전환 비용:
  - 엔지니어링: 2~8주
  - 인프라 셋업: AWS 기준 $200~2,000/월 (규모에 따라)
  - 유지보수 인력: DevOps 0.5~1 FTE 추가
```

### 5.3 탈출 전략 2: 마이크로서비스로 분리

Supabase를 한 번에 버리는 대신, **가장 부하가 큰 기능만 분리**하는 점진적 전략이다.

```
단계별 분리 예시:

단계 1: Storage 분리 (즉시 비용 절감)
  Supabase Storage → Cloudflare R2
  - 이유: R2는 egress 무료, 대역폭 비용 제로
  - 작업: 기존 파일 마이그레이션 + 업로드 엔드포인트 교체
  - 기간: 1~2주

단계 2: Realtime 분리 (동시 접속 문제 해결)
  Supabase Realtime → Ably 또는 직접 WebSocket
  - 이유: 10,000+ 커넥션, 복잡한 채널 토폴로지 요구
  - 기간: 2~4주

단계 3: Auth 분리 (엔터프라이즈 요구사항)
  Supabase Auth → Clerk 또는 Auth0
  - 이유: SAML SSO, 조직 관리, 복잡한 권한 체계
  - 기간: 3~6주

단계 4: Edge Functions 분리 (성능 집약적 로직)
  Supabase Edge Functions → Cloudflare Workers
  - 이유: 더 많은 CPU 시간, 더 큰 메모리, KV Store 통합
  - 기간: 2~4주
```

### 5.4 탈출 전략 3: 하이브리드 아키텍처

Supabase의 Database와 일부 서비스는 유지하면서, 한계에 도달한 부분만 외부로 교체하는 **장기적으로 가장 현실적인 전략**이다.

```
하이브리드 아키텍처 예시 (MAU 500,000 규모):

             [클라이언트]
                  │
         ┌────────┴────────┐
         │                 │
    [Cloudflare]      [Supabase Auth]
    [Workers]         (소셜 로그인,
    (API 게이트웨이,    JWT 발급)
     엣지 캐싱,             │
     Rate Limiting)         │
         │                 │
    ┌────┴────────────────┐ │
    │                     │ │
[Supabase DB]      [Ably]  │
(핵심 비즈니스     (실시간  │
 데이터, RLS)      채팅,    │
                   알림)   │
    │                     │
[Cloudflare R2]   [외부    │
(미디어 파일,      메일)    │
 대용량 데이터)             │
```

---

## 6. 스케일링 의사결정 플로우

### 6.1 단계별 스케일링 가이드

```
트래픽/데이터 증가 감지
         │
         ▼
[성능 지표 확인]
  - CPU > 75%?
  - 메모리 > 85%?
  - 커넥션 > 85%?
  - 응답시간 p99 > 500ms?
         │
         ├── NO → 현상 유지 (모니터링 계속)
         │
         └── YES → 원인 분석
                    │
          ┌─────────┼─────────┐
          │         │         │
         CPU      메모리    커넥션
          │         │         │
          ▼         ▼         ▼
       쿼리 최적화  인덱스   Supavisor
       (EXPLAIN)   리뷰     풀러 확인
          │         │         │
          └────┬────┘─────────┘
               │
        최적화로 해결되지 않으면
               │
               ▼
    [읽기 vs 쓰기 비율 분석]
               │
    ┌──────────┴──────────┐
    │                     │
읽기 > 80%           쓰기 증가세
    │                     │
    ▼                     ▼
Read Replica 추가    수직 업그레이드
(비용 효율적)        (즉각적 효과)
    │                     │
    └──────────┬──────────┘
               │
        $3,000/월 초과 시
               │
               ▼
     탈출 전략 검토 (섹션 5)
```

### 6.2 비용-성능 최적화 매트릭스

| 상황 | 권장 전략 | 예상 비용 | 효과 |
|------|-----------|-----------|------|
| CPU 70~85%, 읽기 과부하 | Read Replica 추가 | +$96/월 (Large 복제본) | 읽기 부하 50% 분산 |
| CPU 85%+, 쓰기 과부하 | 수직 업그레이드 | +$48~192/월 | 즉각적인 성능 향상 |
| 메모리 부족 | 인스턴스 업그레이드 | +$48~/월 | 캐시 히트율 향상 |
| Realtime 500 초과 | 지출 한도 해제 | $10/1,000 커넥션 | 최대 10,000까지 |
| Storage 대역폭 과다 | Cloudflare R2 마이그레이션 | ~$0 (egress 무료) | 대역폭 비용 제거 |
| 쿼리 느림 | 파티셔닝 + 인덱스 | 개발 비용만 | 쿼리 속도 10~100x |
| 콜드 데이터 누적 | 아카이빙 전략 | 스토리지 비용 감소 | 인스턴스 크기 축소 가능 |

---

## 요약

Supabase 스케일링은 **"최적화 → 수직 → 수평 → 분리"** 순서로 접근하는 것이 비용 효율적이다.

1. **먼저 최적화**: 인덱스, 쿼리, 파티셔닝으로 현재 인스턴스를 최대한 활용
2. **수직 업그레이드**: Micro → Large 전환이 가장 큰 성능 도약 (공유 → 전용 코어)
3. **읽기 분산**: Read Replica로 읽기 부하 격리 및 지리적 분산
4. **서비스별 분리**: 한계에 도달한 특정 서비스(Storage, Realtime)만 교체
5. **탈출**: 월 $3,000+ 수준에서 PostgreSQL 직접 운영 또는 하이브리드 검토

Supabase의 가장 큰 스케일링 장점은 **PostgreSQL 표준 완벽 지원** — 어떤 단계에서도 축적한 데이터와 스키마를 그대로 가지고 나올 수 있다는 점이다.

---

*다음 문서: [10. 최종 의사결정 요약 & 권장사항](./10-final-decision-summary.md)*
