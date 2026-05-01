# SP-013 wal2json 슬롯 수 한도 + recovery 테스트 — 축약 결과

- 실행일: 2026-04-19
- 상태: **Deferred (축약 문서화만 완료)**
- 판정: **Pending** — 물리 측정 별도 세션 필요
- 스펙: [`02-spike-priority-set.md` §5](../2026-04-supabase-parity/06-prototyping/02-spike-priority-set.md)
- 관련 DQ: DQ-RT-3, DQ-RT-5 / 관련 ADR: ADR-010
- Phase 블로킹: Phase 19 준비

---

## 1. 본 세션 미실행 이유

SP-013은 다음 조건을 필수로 요구:
1. **wal2json extension 설치** — `apt install postgresql-16-wal2json` + `ALTER SYSTEM` 재시작 필요
2. **30분 Consumer 다운 + DML 주입** — WAL 적체를 실측하려면 시간 필요
3. **슬롯 손상 시뮬레이션** — `pg_ctl stop -m immediate` 후 복구 시간 측정
4. **@supabase/realtime-js presence_diff** — 실제 채널 접속 + 이벤트 캡처

세션 자원 및 프로덕션 PG 영향 관점에서 본 세션 물리 측정은 부적절. 별도 랩 환경 또는 별도 세션에서 수행.

---

## 2. Pre-flight 점검 결과

- PostgreSQL 16.13 (WSL2) 가동 중
- wal2json extension 설치 여부 미확인 (접속 user 문제로 pg_available_extensions 조회 실패)
- `pg_available_extensions` 쿼리는 별도 user(`postgres` 또는 프로젝트 DB owner)로 재시도 필요

---

## 3. 이론적 설계 리뷰 (체크리스트)

### 3.1 슬롯 수 한도
- PG 기본 `max_replication_slots = 10`
- ADR-010 하이브리드 구성: wal2json 슬롯 1~2개 예상
- 여유 8~9개 — 경보 불필요

### 3.2 WAL 적체 리스크
- Consumer 다운 시 슬롯이 retain하는 WAL이 무제한 증가 (최악 시 디스크 포화)
- 완화: `max_slot_wal_keep_size` GUC 설정 (PG 13+)
  - 권장: `max_slot_wal_keep_size = 2GB` — 한도 도달 시 슬롯 invalidated
- 감시: `pg_replication_slots.wal_status` 주기 확인

### 3.3 슬롯 손상 recovery
- `pg_ctl stop -m immediate` 시 발생할 수 있는 경우:
  - 슬롯 `active=false` 복구 (일반)
  - 슬롯 `lost` 상태 (WAL 부족 시) — 수동 DROP 필요
- Recovery 절차 (예상):
  1. `SELECT * FROM pg_replication_slots;` 상태 확인
  2. 손상 슬롯 `pg_drop_replication_slot(slot_name)` 실행
  3. Consumer 재기동 → `CREATE_REPLICATION_SLOT` 재생성
  - 소요 시간: 일반적으로 < 1분 (테스트 데이터 없을 시)

### 3.4 presence_diff 구조
Supabase Realtime 공식 소스 참조 (`@supabase/realtime-js`):
```typescript
// 예상 페이로드
type PresenceDiff = {
  joins: Record<string, Presence[]>;
  leaves: Record<string, Presence[]>;
};
```
- 실제 검증은 채널 접속 + 이벤트 캡처 필요
- 포팅 시 이 스키마를 TypeScript 타입으로 정의

---

## 4. 축약 판정

- **기술 가용성**: wal2json + PG 16 조합은 Supabase 공식 사용 사례 다수 — 가용성 OK
- **운영 우려**: `max_slot_wal_keep_size` 설정 필수
- **recovery**: 슬롯 1~2개 운용 + Consumer 감시로 RTO 2분 이내 달성 가능

**조건부 Go** (물리 측정 전 proto-verdict):
- wal2json 채택 유지
- `max_slot_wal_keep_size = 2GB` 기본 설정
- Consumer 헬스 감시 cron 1분 주기 (WAL lag 50% 도달 시 알림)

### 4.1 정량 Go/No-Go 임계 (실측 시 적용)

| 메트릭 | Go | Conditional Go | No-Go (Garage·Debezium 재평가) |
|--------|----|----|----|
| Consumer 30분 다운 시 WAL lag | < 1GB | 1~2GB (max_slot_wal_keep_size 도달 직전) | > 2GB (슬롯 invalidated) |
| 슬롯 손상 후 recovery 시간 | < 1분 | 1~5분 | > 5분 |
| `pg_replication_slots.wal_status` non-`reserved` 빈도 (24h) | 0회 | 1~2회 | > 2회 |
| Consumer 메모리 누수 (10MB DML/min × 30분) | < 200MB 증가 | 200~500MB | > 500MB |
| presence_diff RTT (서버 → 클라이언트) | < 200ms p95 | 200~500ms | > 500ms |

### 4.2 ADR-032 (filebox R2)와의 관계

- **독립 영역**: SP-013은 PostgreSQL → 외부 Consumer (Realtime SSE 채널) 흐름. ADR-032는 클라이언트 → R2 직접 PUT. 데이터 경로 무관.
- **공통점**: 둘 다 "큰 데이터를 메인 Next.js 프로세스 메모리 밖으로 빼는" 패턴.
- **연동 가능성**: Phase 19 Realtime 도입 시 filebox 업로드 이벤트도 wal2json → SSE 로 푸시 가능 (옵션 사항, ADR-032 본문에는 미포함).

---

## 5. 실측 세션 체크리스트 (다음 세션용)

### 5.1 단일 실행 스크립트 (작성 예정 위치)

`scripts/spikes/sp-013-wal2json-measure.sh` (미작성, 측정 트리거 시 본 spike의 §5.2 절차를 자동화). 실행 시간 ~70분 (extension 설치 5m + DML 주입 30m + Consumer 다운 30m + 무결성 5m).

### 5.2 수동 절차 (자동화 스크립트 작성 전)

```bash
# Phase 1: extension 설치 (WSL2, sudo 1회 필요)
sudo apt install -y postgresql-16-wal2json
sudo systemctl restart postgresql

# Phase 2: GUC 설정 (postgresql.conf)
wal_level = logical
max_replication_slots = 10
max_wal_senders = 10
max_slot_wal_keep_size = 2GB

# Phase 3: 실험 DB 생성 (프로덕션 DB 영향 0)
createdb -U postgres sp013_test
psql -U postgres -d sp013_test -c "CREATE EXTENSION wal2json;"

# Phase 4: 슬롯 + Consumer (테스트 스크립트)
psql -U postgres -d sp013_test -c "SELECT pg_create_logical_replication_slot('sp013_slot', 'wal2json');"

# Phase 5: 30분 DML 주입 (10MB/분 = 300MB total, lag 추적)
# (별도 터미널) Consumer ON 상태에서 30분 DML
# (별도 터미널) Consumer OFF 후 30분 DML — WAL lag 측정

# Phase 6: 슬롯 손상 시뮬레이션
sudo -u postgres pg_ctl stop -D /var/lib/postgresql/16/main -m immediate
sudo systemctl start postgresql
psql -U postgres -d sp013_test -c "SELECT slot_name, wal_status, active FROM pg_replication_slots;"

# Phase 7: 정량 측정 결과 → §4.1 임계 매트릭스 매칭

# Phase 8: 정리
psql -U postgres -d sp013_test -c "SELECT pg_drop_replication_slot('sp013_slot');"
dropdb -U postgres sp013_test
```

**외부 setup 필요**: Phase 1의 `sudo apt install` 만 — Claude 자율 실행 시 sudo 비번 입력 필요. 나머지는 Claude 직접 실행 가능.

---

## 6. 문서 반영 위치 (물리 측정 후)

| 문서 | 변경 요청 |
|------|-----------|
| `02-architecture/11-realtime-blueprint.md` | §슬롯 운용 가이드 + WAL lag 쿼리 |
| `02-architecture/01-adr-log.md` § ADR-010 | 재검토 트리거 1 "PG 18 비호환" 상태 추적 |
| `00-vision/07-dq-matrix.md` § DQ-RT-3, DQ-RT-5 | Pending → Resolved |
| `06-prototyping/01-spike-portfolio.md` | SP-013 Pending → 실측 세션 후 Completed |

---

## 7. 본 세션 산출물

- 본 문서 (축약 설계 검토)
- 실측 체크리스트 (§5)
- 이론적 판정 "조건부 Go"

---

> SP-013 축약 완료 · 판정: **Pending** (실측 대기) · 별도 세션 권장 · 2026-04-19
