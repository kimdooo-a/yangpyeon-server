# Spike 008 — wal2json × PostgreSQL 버전 호환 매트릭스

- 작성일: 2026-04-18
- 상태: Planned
- 스택: PostgreSQL 14/15/16/17 × wal2json 2.5.x × pg_logical / Docker / WSL2
- 관련 Phase: Realtime Phase 19 진입 전 사전 검증
- 기간: 1일 (8h)
- 담당 에이전트: kdywave Wave 5 S2
- kdyspike 명령: `/kdyspike --full wal2json-pg-matrix --max-hours 8`

## 1. 목적

PostgreSQL 메이저 업그레이드 시 wal2json 확장 비호환으로 인한 Realtime CDC 계층 중단 리스크를 Phase 19 착수 **이전에** 제거한다.

양평 부엌 서버 대시보드 Realtime Blueprint(ADR-010)는 wal2json을 CDC 계층의 핵심 "수도관"으로 채택했다. 그러나 PostgreSQL 메이저 버전이 올라갈수록 내부 WAL 포맷 및 확장 ABI가 변경되어 wal2json 빌드가 실패하거나 페이로드 필드 누락이 발생할 수 있다. 운영 중 PG 업그레이드가 Realtime 전체 중단으로 이어지는 최악 시나리오를 막기 위해, 현 시점(PG 14 기준)부터 17 alpha까지 4개 메이저 버전 전수 검증이 필요하다.

**구체적 문제 진술**:

1. wal2json은 C 언어 확장으로 PostgreSQL 서버 헤더(pg_config)에 의존 컴파일. PG 메이저 업 시 재컴파일 필수.
2. PG 17에서 `XLogData` 구조체 및 logical replication 콜백 API 변경 예고 — wal2json 2.x 호환 여부 미확인.
3. pg_logical은 wal2json 대체 폴백 후보이나, 출력 JSON 스키마가 달라 어댑터 비용 불명확.
4. replication slot 생성 절차 및 `pg_logical_slot_get_changes()` 함수 시그니처도 PG 버전별 차이 가능.

---

## 2. 배경 및 컨텍스트

### 2.1 ADR-010 채택안 요약

ADR-010(Realtime Blueprint §1.2): **CDC 계층 = wal2json**, Channel 계층 = supabase-realtime 포팅.

wal2json 채택 근거:
- JSON 페이로드 직접 출력 → Node.js 파싱 코드 최소화
- `replication_slot_changes()` 폴링 또는 streaming replication 방식 모두 지원
- `include_xids`, `include_timestamp`, `add_tables` 파라미터로 필터링 가능
- `format-version: 2`에서 컬럼 타입 정보 포함 → 클라이언트 타입 캐스팅 불필요

### 2.2 연관 DQ / TD

| ID | 내용 | 상태 |
|----|------|------|
| DQ-1.5 | wal2json PG 버전 호환 범위 | 확정 필요 (본 스파이크) |
| DQ-RT-6 | PG 18 도입 시 wal2json 재검토 시점 | 미확정 |
| TD-006 | wal2json 2.5.x 설치 절차 표준화 | 해소 예정 |

### 2.3 현재 운영 환경

```
OS: WSL2 Ubuntu 22.04
PostgreSQL: 14.x (현재 운영)
wal2json: 2.5.x (설치 예정)
wal_level: logical (스파이크에서 설정 완료)
```

---

## 3. 가설

### H1: wal2json 2.x는 PG 14/15/16 모두에서 정상 작동한다

**근거**: wal2json 공식 저장소(github.com/eulerto/wal2json)의 CI 매트릭스가 PG 14/15/16을 명시적으로 지원. pg_logical 내부 API 변경은 PG 14-16 범위 내에서 안정적.

**반증 조건**: 어느 버전에서라도 replication slot 생성 실패 또는 JSON 페이로드 필드 누락 발생 시 H1 기각.

### H2: PG 17 alpha/beta에서 wal2json API 변경이 없다

**근거**: PG 17의 주요 변경은 parallel query, vacuum 최적화 등 실행 계획 레이어에 집중. logical replication API(`LogicalDecodingContext`, `OutputPlugin*` 콜백)는 PG 11 이후 안정화.

**반증 조건**: wal2json의 `OutputPluginCallbacks` 빌드 오류 또는 segfault 발생 시 H2 기각.

### H3: pg_logical은 wal2json 폴백으로 동등한 CDC 기능을 제공한다

**근거**: pg_logical은 wal2json과 동일하게 PostgreSQL logical decoding을 사용. 출력 포맷만 다를 뿐 이벤트 완전성(INSERT/UPDATE/DELETE/DDL)은 동일.

**반증 조건**: pg_logical 출력에서 컬럼 값 누락(old row 값 없음 등) 또는 lag > wal2json × 2 이상 시 H3 기각.

### H4: replication slot 재생성 절차(PG 업그레이드 시)는 5분 이내 완료 가능하다

**근거**: `pg_create_logical_replication_slot()` → `pg_drop_replication_slot()` 절차는 DDL 수준 단순 명령. WAL 버퍼 재설정 불필요.

**반증 조건**: 업그레이드 후 slot 재생성 시 `ERROR: could not find slot` 또는 WAL 손상으로 5분 초과 시 H4 기각.

### H5: replication lag p95는 10k events 기준 1초 이내다

**근거**: wal2json 폴링 방식(`pg_logical_slot_get_changes` 100ms 인터벌)에서 단일 배치 1000 row 기준 실측 lag 약 200-400ms 보고(PostgreSQL wiki).

**반증 조건**: p95 > 1,000ms (10k events) 또는 p99 > 3,000ms 시 H5 기각 → 백프레셔 정책 재설계 필요.

---

## 4. 실험 계획

### 4.0 환경 구성

Docker 기반 PG 4종 컨테이너 병렬 기동 — 각 컨테이너는 `wal_level=logical`, `max_replication_slots=5`로 초기화:

| 컨테이너 | 이미지 | 포트 |
|---------|--------|------|
| pg14 | postgres:14-alpine | 5414 |
| pg15 | postgres:15-alpine | 5415 |
| pg16 | postgres:16-alpine | 5416 |
| pg17 | postgres:17-alpine | 5417 |

wal2json 소스 빌드 방법 (각 컨테이너 내부):

```
저장소: https://github.com/eulerto/wal2json
태그: wal2json_2_5
빌드: USE_PGXS=1 make install
의존: git, make, gcc, musl-dev (alpine), pg_config
```

### 4.1 실험 1 — wal2json 설치 + Replication Slot 생성 (4버전 순차)

**목표**: 4 PG 버전 × wal2json 2.5.x 설치 성공 여부 확인.

**SQL 절차** (각 PG 버전에서 실행):

```sql
-- 1단계: 확장 설치
CREATE EXTENSION wal2json;

-- 2단계: 슬롯 생성
SELECT pg_create_logical_replication_slot(
  'spike_test_slot',
  'wal2json'
);

-- 3단계: 슬롯 확인
SELECT slot_name, plugin, slot_type, active
FROM pg_replication_slots
WHERE slot_name = 'spike_test_slot';
```

**측정 항목**:
- 빌드 오류 유무 (stdout/stderr 전문 기록)
- `CREATE EXTENSION` 성공/실패
- 슬롯 생성 성공/실패
- 에러 메시지 전문 기록 (실패 시)

**결과 기록 양식**:

| PG 버전 | 빌드 결과 | 슬롯 생성 | 오류 내용 |
|---------|----------|----------|----------|
| 14.x | | | |
| 15.x | | | |
| 16.x | | | |
| 17.x | | | |

**예상 소요**: 1h

### 4.2 실험 2 — 1,000 Events 변경 + JSON 페이로드 무결성 검증

**목표**: 각 PG 버전에서 1,000 DML 이벤트의 wal2json 출력 완전성 확인.

**테스트 테이블**:

```sql
CREATE TABLE spike_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**DML 시나리오**: 400 INSERT + 300 UPDATE + 300 DELETE = 총 1,000 이벤트.

**wal2json 페이로드 수집 쿼리**:

```sql
SELECT data
FROM pg_logical_slot_get_changes(
  'spike_test_slot', NULL, NULL,
  'format-version', '2',
  'include-timestamp', 'true',
  'include-xids', 'true'
);
```

**검증 로직** (TypeScript 의사 코드):

```typescript
interface Wal2jsonEvent {
  action: 'I' | 'U' | 'D';
  schema: string;
  table: string;
  columns?: Array<{ name: string; type: string; value: unknown }>;
  timestamp: string;
  xid: number;
}

function validatePayloads(events: Wal2jsonEvent[]): void {
  // 수량 검증
  const insertCount = events.filter(e => e.action === 'I').length;
  const updateCount = events.filter(e => e.action === 'U').length;
  const deleteCount = events.filter(e => e.action === 'D').length;

  if (insertCount !== 400) throw new Error(`INSERT 400 기대, 실제 ${insertCount}`);
  if (updateCount !== 300) throw new Error(`UPDATE 300 기대, 실제 ${updateCount}`);
  if (deleteCount !== 300) throw new Error(`DELETE 300 기대, 실제 ${deleteCount}`);

  // format-version 2 필드 완전성 검증
  for (const event of events.filter(e => e.action === 'I')) {
    if (!event.schema) throw new Error('schema 필드 누락');
    if (!event.table) throw new Error('table 필드 누락');
    if (!Array.isArray(event.columns)) throw new Error('columns 배열 누락');
    if (!event.timestamp) throw new Error('timestamp 누락');
    if (event.xid === undefined) throw new Error('xid 누락');
  }
}
```

**PG 버전별 페이로드 스키마 차이 기록표**:

| 필드명 | PG 14 | PG 15 | PG 16 | PG 17 | 비고 |
|--------|-------|-------|-------|-------|------|
| action | I/U/D | | | | |
| schema | | | | | |
| table | | | | | |
| columns | | | | | |
| timestamp | | | | | |
| xid | | | | | |

**예상 소요**: 1.5h

### 4.3 실험 3 — Replication Lag 측정 (10k / 100k Events)

**목표**: H5 검증 — p95 lag ≤ 1초 (10k) 확인.

**부하 생성**: k6 + k6/x/sql 확장으로 분당 이벤트 목표치 달성.

```
k6 실행 프로필:
  Phase 1 (30s): vus=50  → 목표 10k events
  Phase 2 (60s): vus=200 → 목표 100k events
```

**Lag 측정 방식** (100ms 폴링):

```sql
-- WAL LSN 기반 lag 계산
SELECT
  pg_current_wal_lsn() AS current_lsn,
  confirmed_flush_lsn AS slot_lsn,
  pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
FROM pg_replication_slots
WHERE slot_name = 'spike_test_slot';
```

lag_bytes를 ms로 근사 변환: `lag_ms ≈ lag_bytes / 8192 * 8` (8KB 페이지 경험 공식, 실제 I/O 속도로 보정 필요).

**측정 지표 계산**:

```typescript
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p / 100);
  return sorted[idx];
}

// p50, p95, p99 계산
const p50 = percentile(lagSamples, 50);
const p95 = percentile(lagSamples, 95);
const p99 = percentile(lagSamples, 99);
```

**PG 버전별 비교 표** (실험 전 템플릿):

| PG 버전 | 10k p50 (ms) | 10k p95 (ms) | 100k p50 (ms) | 100k p95 (ms) | S2 통과 |
|---------|-------------|-------------|--------------|--------------|---------|
| 14.x | TBD | TBD | TBD | TBD | |
| 15.x | TBD | TBD | TBD | TBD | |
| 16.x | TBD | TBD | TBD | TBD | |
| 17.x | TBD | TBD | TBD | TBD | |

**예상 소요**: 2h

### 4.4 실험 4 — pg_logical 폴백 비교 (이벤트 호환율 측정)

**목표**: H3 검증 — pg_logical 이벤트 타입 호환율 ≥ 95%.

**pg_logical 설치**:

```
패키지: postgresql-{버전}-pglogical (PGDG repo)
슬롯 플러그인: pgoutput 프로토콜
슬롯명: pglogical_test_slot
```

**정규화 이벤트 인터페이스**:

```typescript
interface NormalizedCdcEvent {
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  columns: Record<string, { value: unknown; type: string }>;
  timestamp: string;
  xid: number;
}
```

**어댑터 설계**:
- `fromWal2json(raw)` → `NormalizedCdcEvent` (action: I→INSERT, U→UPDATE, D→DELETE)
- `fromPgLogical(raw)` → `NormalizedCdcEvent` (type: insert/update/delete 매핑)

**호환율 계산**:

```typescript
function calcCompatRate(
  wal: NormalizedCdcEvent[],
  pg: NormalizedCdcEvent[]
): number {
  let match = 0;
  const len = Math.min(wal.length, pg.length);
  for (let i = 0; i < len; i++) {
    if (wal[i].action === pg[i].action && wal[i].table === pg[i].table) {
      match++;
    }
  }
  return match / wal.length;  // 목표: ≥ 0.95
}
```

**예상 필드명 차이 목록** (어댑터 비용 계산용):

| 필드 | wal2json | pg_logical | 어댑터 필요 |
|------|----------|-----------|------------|
| 이벤트 타입 | `action: 'I'` | `type: 'insert'` | 예 |
| 컬럼 이름 | `columns[].name` | `columns[].attname` | 예 |
| XID | `xid` | `xid` | 아니오 (예상) |
| 스키마 | `schema` | `schema` | 아니오 (예상) |

**예상 소요**: 2h

### 4.5 실험 5 — PG 메이저 업그레이드 시뮬레이션 (14→15→16)

**목표**: H4 검증 — 슬롯 재생성 절차 5분 이내.

**시뮬레이션 절차**:

```
1단계 (사전): PG 14 컨테이너에서 슬롯 활성 확인
  쿼리: SELECT slot_name, active FROM pg_replication_slots;

2단계 (업그레이드): PG 14 중지 → PG 15 컨테이너로 전환

3단계 (슬롯 재생성): 소요 시간 측정
  시작 시각 = NOW()
  SELECT pg_create_logical_replication_slot('spike_test_slot', 'wal2json');
  완료 시각 = NOW()
  소요 = 완료 - 시작

4단계 (검증): 재생성 후 100 이벤트 정상 수집
5단계 (반복): 15→16 업그레이드 동일 절차
```

**업그레이드 표준 SOP 초안** (TD-006 해소용):

```
[사전 작업 — 다운타임 0]
□ 기존 슬롯 목록 백업
  SELECT * FROM pg_replication_slots;
□ wal_level=logical 확인
  SHOW wal_level;
□ WALConsumer 일시 중지 (pm2 stop wal-consumer)

[업그레이드 실행 — 목표 5분 이내]
□ PG 버전 업그레이드 (pg_upgrade 또는 컨테이너 교체)
□ wal2json 재컴파일 설치 (USE_PGXS=1 make install)
□ 슬롯 재생성
  SELECT pg_create_logical_replication_slot('spike_test_slot', 'wal2json');
□ WALConsumer 재시작 (pm2 start wal-consumer)

[검증 — 10분]
□ lag p95 ≤ 1,000ms 10분간 모니터링
□ CDC 이벤트 100개 이상 수신 확인 (로그)
```

**소요 시간 기록**:

| 업그레이드 경로 | 시작 → 완료 | 소요 (ms) | H4 통과 |
|----------------|-----------|----------|---------|
| 14 → 15 | | | |
| 15 → 16 | | | |

**예상 소요**: 1h

---

## 5. 측정 도구

| 도구 | 용도 | 명령/쿼리 예시 |
|------|------|--------------|
| **k6** | DML 부하 생성 | `k6 run --vus 50 k6-wal2json-load.js` |
| **pg_stat_replication** | lag bytes 실시간 조회 | `SELECT * FROM pg_stat_replication;` |
| **pg_replication_slots** | 슬롯 상태 + confirmed_flush_lsn | `SELECT slot_name, confirmed_flush_lsn FROM pg_replication_slots;` |
| **pg_wal_lsn_diff()** | WAL 위치 차이 계산 | `SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn);` |
| **pg_stat_io** | PG I/O 통계 (PG 16+) | `SELECT * FROM pg_stat_io WHERE backend_type = 'walsummarizer';` |
| **docker stats** | 컨테이너 CPU/메모리 | `docker stats pg14 pg15 pg16 pg17 --no-stream` |
| **Node.js assert** | 페이로드 무결성 자동 검증 | `assert(insertCount === 400, msg)` |
| **pg_config** | PG 버전 헤더 경로 확인 | `pg_config --includedir-server` |

---

## 6. 성공 기준

| ID | 기준 | 목표값 | 측정 방법 |
|----|------|--------|----------|
| **S1** | PG 4버전 × 1,000 events 100% 출력 | 4,000/4,000 이벤트 완전 수집 | 실험 2 assert |
| **S2** | replication lag p95 (10k events) | ≤ 1,000ms | 실험 3 percentile(95) |
| **S3** | replication lag p95 (100k events) | ≤ 5,000ms | 실험 3 percentile(95) |
| **S4** | pg_logical 이벤트 호환율 | ≥ 95% | 실험 4 calcCompatRate() |
| **S5** | 슬롯 재생성 소요 시간 | ≤ 5분 | 실험 5 시간 측정 |
| **S6** | PG 17 wal2json 2.5.x 빌드 성공 | 빌드 오류 없음 | 실험 1 |
| **S7** | format-version 2 필드 완전성 | schema/table/columns/timestamp/xid 모두 존재 | 실험 2 필드 검증 |

---

## 7. 실패 기준 및 대응

| 실패 조건 | 영향 | 즉각 대응 |
|-----------|------|----------|
| **F1** 어떤 PG 버전 wal2json crash 또는 슬롯 생성 실패 | Realtime Blueprint 수정 필요 | 실패 버전 제외 + PG 14-16만 공식 지원 명시. DQ-RT-6 갱신 |
| **F2** p95 lag > 5,000ms (10k events) | 실시간성 SLA 위반 | 폴링 인터벌 50ms 단축 + 배치 크기 500 조정 + 백프레셔 재설계 |
| **F3** pg_logical 호환율 < 95% | 폴백 전략 무효화 | 어댑터 복잡도 상향 평가. 대안 폴백 탐색 |
| **F4** PG 17 빌드 실패 | PG 17 도입 불가 | PG 14-16 전용 지원. wal2json 2.6+ 릴리스 추적 |
| **F5** 슬롯 재생성 > 15분 | 운영 다운타임 위험 | 블루/그린 슬롯 전략 (신규 슬롯 선생성 후 원자 전환) |

---

## 8. 결과 분기 (결정 트리)

```
실험 1 결과
├─ PG 14/15/16/17 모두 성공
│   → [분기 A] 전 버전 승인
│     · Realtime Blueprint §PG호환: "PG 14-17 검증 완료"
│     · ADR-010에 PG 17 사전 승인 추가
│     · DQ-RT-6: "PG 18 검토 시점 = PG 17 GA + 12개월"
│     · Phase 19 즉시 착수 가능
│
├─ PG 14/15/16 성공, PG 17 실패
│   → [분기 B] PG 14-16 공식 지원
│     · Realtime Blueprint 주의사항: "PG 17은 wal2json 2.6+ 후 재검증"
│     · pg_logical을 PG 17 폴백으로 사전 구현
│     · Phase 19 착수 시 PG 14 기준으로 시작
│
└─ PG 14/15/16 중 1개 이상 실패
    → [분기 C] pg_logical 폴백 우선
      · CdcBus 어댑터 인터페이스 추가 (Phase 19 공수 +4h)
      · 실패 버전 = wal2json 미지원 공식 명시

실험 3 결과 (lag 측정) 별도 분기
├─ p95 ≤ 1,000ms (10k) → 백프레셔 불필요, Phase 19-A 그대로
├─ 1,000ms < p95 ≤ 5,000ms → 폴링 인터벌 50ms + 배치 500
└─ p95 > 5,000ms → WAL streaming 방식 전환 검토 (pg_recvlogical 기반)
```

---

## 9. 산출물 목록

| # | 산출물 | 형식 | 용도 |
|---|--------|------|------|
| 1 | `pg-version-matrix.md` | 표 | PG 4버전 × 5실험 결과 매트릭스 |
| 2 | `wal2json-payloads/pg{14-17}.json` | JSON 4개 | 각 버전 1,000 이벤트 샘플 |
| 3 | `lag-measurements.csv` | CSV | p50/p95/p99 측정값 전체 |
| 4 | `upgrade-sop.md` | 체크리스트 | 운영 표준 절차서 (TD-006 해소) |
| 5 | `pglogical-adapter-draft.ts` | TypeScript | 어댑터 초안 |
| 6 | `spike-008-result.md` | Markdown | 최종 결과 + 분기 결정 문서 |

---

## 10. 일정 (8h 세부)

| 시간대 | 작업 | 병렬 가능 | 산출물 |
|--------|------|----------|--------|
| 0-1h | 환경 구성 (Docker 4 컨테이너 + wal2json 빌드) | 4 컨테이너 병렬 | 컨테이너 기동 확인 |
| 1-2h | 실험 1: 슬롯 생성 4버전 검증 | 포트별 병렬 | pg-version-matrix §설치 행 |
| 2-3.5h | 실험 2: 1,000 events 무결성 검증 | 4 버전 병렬 | wal2json-payloads/ (JSON 4개) |
| 3.5-5.5h | 실험 3: lag 측정 (10k → 100k) | 순차 (부하 누적) | lag-measurements.csv |
| 5.5-7h | 실험 4: pg_logical 폴백 비교 | 실험 1 완료 후 병렬 | pglogical-adapter-draft.ts |
| 7-7.5h | 실험 5: 업그레이드 시뮬 14→15→16 | 순차 | upgrade-sop.md |
| 7.5-8h | 결과 정리 + 분기 결정 | — | spike-008-result.md |

---

## 11. 관련 문서 및 ADR

| 문서/ADR | 관계 |
|---------|------|
| `02-architecture/11-realtime-blueprint.md` | 본 스파이크 결과가 §PG 호환성 섹션에 반영됨 |
| `02-architecture/01-adr-log.md §ADR-010` | wal2json CDC 계층 채택 근거 — 본 스파이크로 PG 버전 범위 확정 |
| `01-research/09-realtime/` (3 deep-dive) | Wave 1~2 리서치 원본 (wal2json + supabase-realtime + ElectricSQL) |
| DQ-RT-6 | PG 18 도입 검토 — 본 스파이크 결과에 따라 타임라인 조정 |
| DQ-1.5 | wal2json PG 버전 호환 범위 — 본 스파이크로 확정 |
| TD-006 | wal2json 설치 표준화 — upgrade-sop.md 로 해소 |

---

## 12. kdyspike 연계

```bash
# 전체 스파이크 실행 (8h 자동 타임박스)
/kdyspike --full wal2json-pg-matrix --max-hours 8

# 부분 실행 (특정 실험만)
/kdyspike --experiment 3 --pg-version 17 --max-hours 2

# 결과 통합
/kdyspike --summarize wal2json-pg-matrix --output spike-008-result.md
```

에이전트 병렬 실행 가능 단위:
- 실험 1~2: PG 14/15/16/17 컨테이너 병렬 (독립)
- 실험 3: 10k → 100k 순차 (부하 누적)
- 실험 4: 실험 1 완료 후 병렬 가능
- 실험 5: 실험 1~2 완료 후 순차

---

## 13. 다음 TODO (스파이크 완료 후)

- [ ] `spike-008-result.md` 작성 (결과 매트릭스 확정)
- [ ] ADR-010 §PG 버전 범위 섹션 갱신
- [ ] Realtime Blueprint §5 WBS — Phase 19-A 선행조건 해제
- [ ] DQ-RT-6 답변 업데이트 (`01-adr-log.md §DQ-RT-6`)
- [ ] TD-006 해소 표시 (`upgrade-sop.md` 링크 추가)
- [ ] Phase 19 착수 (분기 A: 즉시 / 분기 B: PG 14 기반)
