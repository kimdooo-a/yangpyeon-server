# 02. 스파이크 우선 세트 — Phase 15~17 MVP 블로킹 검증

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · P1 산출물 · 작성일: 2026-04-18
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [06-prototyping/](./) → **이 문서**
> 연관: [01-spike-portfolio.md](./01-spike-portfolio.md) · [04-spike-execution-protocol.md](./04-spike-execution-protocol.md)
> 참조: [02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) · [00-vision/07-dq-matrix.md](../00-vision/07-dq-matrix.md)

---

## 0. 우선 세트 정의

우선 세트는 **Phase 15~17 MVP 착수 전 반드시 완료**해야 하는 스파이크 7건이다.

선정 기준:
1. Phase 15~17 구현이 해당 스파이크 결과 없이는 시작될 수 없는 경우 (MVP 블로킹)
2. 스파이크 실패 시 ADR·Blueprint 전면 재설계가 필요한 경우 (재설계 위험 고)
3. 4주 이내 완수 가능한 공수 범위 (우선 세트 총합 35h 이하)

선정된 7건: **SP-010, SP-011, SP-012, SP-013, SP-014, SP-015, SP-016**

---

## 1. 우선 세트 실행 요약

| ID | 제목 | 관련 DQ/ADR | 공수(h) | Phase 블로킹 |
|----|------|------------|---------|------------|
| SP-010 | PM2 cluster:4 vs fork 벤치마크 | DQ-4.1 / ADR-015 | 4 | Phase 16 Operations |
| SP-011 | argon2id 마이그레이션 경로 | DQ-AC-1 / ADR-006 | 3 | Phase 17 Auth Core |
| SP-012 | isolated-vm v6 WSL2 ABI | ADR-009 재검토 | 4 | Phase 19 준비 (사전 확인) |
| SP-013 | wal2json 슬롯 수 + recovery | DQ-RT-3, RT-5 / ADR-010 | 5 | Phase 19 준비 |
| SP-014 | JWKS 캐시 3분 grace 효과 | DQ-12.4 / ADR-013 | 3 | Phase 16 Observability |
| SP-015 | Session 인덱스 최적화 | DQ-AC-2 / ADR-006 | 2 | Phase 17 Auth Core |
| SP-016 | SeaweedFS 50GB 부하 테스트 | ADR-008 ASM-4 | 8 | Phase 17 Storage |

**총 공수**: 29h / **목표 기간**: 4주 (Phase 14 완료 ~ Phase 15 시작 전)

---

## 2. SP-010: PM2 cluster:4 vs single-process 벤치마크

### 2.1 질문과 배경

**핵심 질문**: PM2 cluster:4 모드에서 node-cron 중복 실행, SQLite WAL 충돌, wal2json 슬롯 관리가 실제로 문제를 일으키는가? 현재 아키텍처(ADR-015)는 fork 단일 프로세스를 선택했지만, Phase 16에서 Operations 강화 시 cluster:4가 필요하다.

**배경 및 Blueprint 유래**:
- ADR-015: "PM2 cluster:4 + Capistrano-style symlink 배포" — Operations 카테고리 핵심 결정
- Wave 1 DB Ops §35: "fork 모드 유지. WSL2 + 운영자 1~3명에는 fork면 충분"
- DQ-4.1: "PM2 fork 모드에서 cluster 모드로 전환?" — Wave 5 스파이크 대상
- spike-001-sqlite: "PM2 단일 인스턴스 모드 호환, 클러스터 모드는 읽기만 안전" — 검증됨
- ADR-005: "node-cron은 PM2 단일 프로세스(fork 모드)에서 중복 방지 쉬움"
- ADR-015 §결과 부정: "수평 확장 필요 시 재설계"

**불확실성**: cluster:4에서 (a) node-cron 중복 방지 advisory lock이 실제 동작하는지, (b) SQLite WAL이 4 worker 간 쓰기 충돌 없이 동작하는지, (c) 처리량이 fork 대비 얼마나 향상되는지 실측되지 않음.

### 2.2 실험 범위

**실험 환경**:
- WSL2 Ubuntu 24.04 + Node 20 LTS (현행)
- PM2 v5 최신
- 테스트 앱: Next.js 16 App Router + SQLite(better-sqlite3) + node-cron

**실험 1: 처리량 비교**

fork 모드와 cluster:4 모드 각각 기동 후, wrk 벤치마크 도구로 30초간 50 동시 연결 부하를 가해 p50/p95/p99 응답 시간, CPU 사용률, 메모리 사용량을 측정한다.

**실험 2: node-cron 중복 방지**

advisory lock 방식으로 cluster:4에서 동일 잡이 4번 실행되는지 확인한다. DB 기반 advisory lock을 통해 획득 실패 시 잡을 건너뛰는 방어 코드를 작성하고 중복 실행 건수를 기록한다.

**실험 3: SQLite WAL 충돌**

cluster:4에서 동시 쓰기 부하(50 concurrent writes/s) 시 `SQLITE_BUSY` 오류 발생율을 측정한다. 허용 기준은 오류율 0.1% 미만이다.

### 2.3 성공 기준 (Go)

```
[Go 조건 — 전체 충족 시]
1. cluster:4 처리량이 fork 대비 ≥ 30% 향상 (RPS 기준)
2. node-cron 중복 실행 0건 (advisory lock으로 방지)
3. SQLite SQLITE_BUSY 오류율 < 0.1%
4. 메모리 사용량 증가 < 4× (worker당 추가 250MB 허용)

[No-Go — 하나라도 해당 시]
- cluster:4 처리량이 fork 대비 < 10% 향상 (오버헤드만 증가)
- node-cron 중복 실행 ≥ 1건 (advisory lock 실패)
- SQLite SQLITE_BUSY > 0.5%
```

### 2.4 결과 분석 및 반영 위치

**Go 시 반영**:
- ADR-015 §결정 보완: "cluster:4 허용 조건 구체화"
- `02-architecture/13-db-ops-blueprint.md` §PM2 설정에 cluster:4 권장 구성 추가
- ecosystem.config.js 업데이트

**No-Go 시 대안**:
- fork 모드 유지 (ADR-015 현상 유지)
- node-cron 중복 방지를 pm2-cron-restart-policy로 강화
- SQLite → PG 전환 일정을 Phase 17에서 앞당기는 검토 착수

**실패 영향 ADR**: ADR-005 (node-cron 중복 방지 전략 보완), ADR-015 (cluster 미채택 확정)

### 2.5 kdyspike 명령어

```bash
# 마이크로 사전 확인 (30분)
/kdyspike --micro "PM2 cluster:4에서 node-cron advisory lock 중복 방지가 WSL2에서 동작하는가?"

# 풀 스파이크 (4h)
/kdyspike --full "PM2 cluster:4 vs fork 벤치마크 — 처리량/cron 중복/SQLite WAL" \
  --max-hours 4 \
  --output "docs/research/spikes/spike-010-pm2-cluster-result.md"
```

---

## 3. SP-011: argon2id 패스워드 마이그레이션 경로

### 3.1 질문과 배경

**핵심 질문**: 현행 bcryptjs에서 `@node-rs/argon2` (argon2id)로 마이그레이션하는 경로는 무엇인가? Phase 17 Auth Core 완성 전에 마이그레이션 비용과 위험을 측정해야 한다.

**배경 및 Blueprint 유래**:
- ADR-006: "jose JWT ES256 유지 + Lucia/Auth.js 패턴 15개 차용" — bcrypt 현행 자산 유지
- DQ-AC-1: "bcryptjs → @node-rs/argon2 교체 시점? 성능 5×, native 모듈 부담" — Wave 5 미답변
- ADR-022 예상: "argon2 전환 시점 — CON-10 재평가 결과" (Wave 5 결정 대기)
- CON-10: native 모듈 의존성 제한 (WSL2 환경 native 빌드 복잡성)
- NFR-SEC.10: 패스워드 해시 알고리즘 강도 요건

**불확실성**:
1. `@node-rs/argon2`가 WSL2 Ubuntu 24.04에서 빌드되는가? (native addon)
2. 기존 bcrypt 해시를 argon2로 점진 마이그레이션할 때 "로그인 시 자동 재해시" 방식이 Prisma 7 스키마와 호환되는가?
3. PM2 reload 시 native 모듈 ABI 문제가 없는가?

### 3.2 실험 범위

**실험 환경**:
- WSL2 Ubuntu 24.04 + Node 20 LTS
- `@node-rs/argon2` 최신

**실험 1: 빌드 및 설치 가능 여부**

WSL2 환경에서 `npm install @node-rs/argon2` 성공 여부 + 설치 소요 시간을 측정한다. native addon이므로 node-gyp 빌드 성공이 필수이다.

**실험 2: 성능 비교**

bcrypt(cost=12)와 argon2id(기본 파라미터) 각각 100회 해시 생성 시간을 측정한다. 단일 해시 생성 시간 + 병렬 20회 동시 측정.

**실험 3: 점진 마이그레이션 시뮬레이션**

로그인 시 bcrypt 접두사(`$2`) 감지 → argon2id 재해시 저장 → 다음 로그인부터 argon2id 검증 흐름을 1000 사용자 시뮬레이션으로 검증한다. 오류 건수 기록.

**실험 4: PM2 reload ABI 검증**

`pm2 reload all` 후 argon2 native 모듈 재로드 성공 여부를 확인한다.

### 3.3 성공 기준 (Go)

```
[Go 조건 — 전체 충족 시]
1. WSL2 Ubuntu 24.04에서 npm install 성공 (빌드 오류 없음)
2. argon2id 해시 생성 시간 < 200ms (bcrypt cost=12 기준 동등 보안)
3. 점진 마이그레이션 오류율 = 0% (1000 사용자 시뮬레이션)
4. PM2 reload 후 native 모듈 정상 동작

[No-Go — 하나라도 해당 시]
- WSL2 빌드 실패 (node-gyp 오류 해결 불가)
- 해시 생성 > 500ms (성능 저하 > 2.5×)
- 마이그레이션 오류 ≥ 1건
- PM2 reload 후 모듈 로드 실패
```

### 3.4 결과 분석 및 반영 위치

**Go 시 반영**:
- ADR-022 신규 등록: "argon2id 전환 확정 — Phase 17 Auth Core 완성 시 점진 마이그레이션"
- `02-architecture/03-auth-advanced-blueprint.md` §패스워드 해시 전략에 마이그레이션 패턴 추가
- User 모델 스키마 변경 불필요 (passwordHash 필드 유지, 접두사로 알고리즘 구분)

**No-Go 시 대안**:
- bcrypt 유지 (cost factor 12→14 상향으로 보완)
- ADR-006 §재검토 트리거에 argon2 미전환 확정 기록

### 3.5 kdyspike 명령어

```bash
/kdyspike --micro "WSL2 Ubuntu 24.04 Node 20에서 @node-rs/argon2 npm install 성공하는가?"

/kdyspike --full "argon2id vs bcrypt 성능 비교 + 점진 마이그레이션 경로 검증" \
  --max-hours 3 \
  --output "docs/research/spikes/spike-011-argon2-result.md"
```

---

## 4. SP-012: isolated-vm v6 WSL2 호환성 + ABI 검증

### 4.1 질문과 배경

**핵심 질문**: `isolated-vm` v6이 WSL2 Ubuntu 24.04 + Node 22 LTS(예정) 환경에서 빌드되고 정상 동작하는가? spike-005-edge에서 v5 + Node 20 조합이 Go였지만, Phase 19 Edge Functions 구현 시 Node 22 전환이 예상됨.

**배경 및 Blueprint 유래**:
- ADR-009: "3층 하이브리드 — L1 = isolated-vm v6 (cold start 50ms)"
- ADR-009 §재검토 트리거 1: "isolated-vm v6 Node 24 ABI 호환 깨짐 (ASM-5 EWI)"
- spike-005-edge: "isolated-vm v5 Node 20 LTS 호환, v6 Node 24 호환성 재검증 필요"
- `02-architecture/10-edge-functions-blueprint.md`: Phase 19 구현 전제가 v6
- DQ 매핑: ADR-009 ASM-5 검증 항목

**불확실성**:
1. isolated-vm v6이 Node 22 LTS에서 ABI break 없이 동작하는가?
2. WSL2 환경에서 v8 snapshot 생성이 정상 작동하는가?
3. cold start 50ms 목표가 WSL2에서 달성 가능한가?

### 4.2 실험 범위

**실험 환경**:
- WSL2 Ubuntu 24.04
- Node 22 LTS (nvm으로 설치)
- `isolated-vm` v6 최신

**실험 1: 설치 및 기본 동작**

Node 22 LTS 환경에서 npm install isolated-vm@6 실행 후, Isolate를 생성하고 단순 산술식을 실행하여 결과가 정상 반환되는지 확인한다.

**실험 2: cold start 측정**

100회 반복으로 Isolate 생성부터 컨텍스트 준비까지의 시간을 측정한다. p50/p95/p99 통계를 산출하고 목표인 p95 50ms와 비교한다.

**실험 3: 메모리 격리**

memoryLimit을 32MB로 제한한 Isolate에서 무한 배열 할당 코드를 실행하여 RangeError로 격리 종료되는지 확인한다. 호스트 프로세스에 영향이 없어야 한다.

**실험 4: 장시간 실행 누수**

10분간 100회/분으로 Isolate 생성 및 폐기를 반복한다. 호스트 메모리 증가량이 10MB 미만이어야 한다.

### 4.3 성공 기준 (Go)

```
[Go 조건 — 전체 충족 시]
1. Node 22 LTS에서 npm install 성공 + 기본 실행 정상 동작
2. cold start p95 ≤ 50ms (WSL2 환경)
3. 메모리 격리 — 호스트 프로세스 영향 없음
4. 10분 수명 테스트 — 메모리 누수 < 10MB

[No-Go — 하나라도 해당 시]
- npm install 실패 (ABI 호환성 없음)
- cold start p95 > 150ms (3배 초과)
- 메모리 격리 실패 (호스트 OOM 유발)
- 메모리 누수 ≥ 50MB/10분
```

### 4.4 결과 분석 및 반영 위치

**Go 시 반영**:
- ADR-009 §재검토 트리거 1 해소 기록 (ASM-5 클리어)
- `10-edge-functions-blueprint.md` §런타임 선택 확정: "v6 + Node 22 LTS"
- `spikes/README.md` 업데이트

**No-Go 시 대안**:
- **대안 A**: isolated-vm v5 고정 + Node 20 LTS 연장 지원 (2026년 4월까지)
- **대안 B**: `workerd` (Cloudflare Workers 런타임) 재검토 — ADR-009 수정 필요
- ADR-009 상태를 "재검토 중"으로 변경, ADR-019 신규 등록으로 workerd 결정 기록

### 4.5 kdyspike 명령어

```bash
/kdyspike --micro "isolated-vm v6 npm install Node 22 LTS WSL2 성공 여부"

/kdyspike --full "isolated-vm v6 Node 22 WSL2 ABI 호환성 + cold start + 메모리 격리" \
  --max-hours 4 \
  --output "docs/research/spikes/spike-012-isolated-vm-v6-result.md"
```

---

## 5. SP-013: wal2json 슬롯 수 한도 + recovery 테스트

### 5.1 질문과 배경

**핵심 질문**: wal2json 복제 슬롯을 1개(공유)와 2개(분리) 운용 시 실제 슬롯 한도, WAL 적체 속도, 슬롯 손상 recovery 절차를 실측한다.

**배경 및 Blueprint 유래**:
- ADR-010: "계층 분리 하이브리드 — wal2json(CDC) + supabase-realtime 포팅(채널)"
- DQ-RT-3: "`@supabase/realtime-js`의 `presence_diff` 메시지 구조 정확도 검증 필요" — Wave 5
- DQ-RT-5: "하이브리드 구성에서 Slot 1개 공유 vs 2개 분리" — Wave 4 미답변 → Wave 5 연장
- ADR-010 §재검토 트리거 1: "PostgreSQL 18+에서 wal2json 비호환 발생"
- `02-architecture/11-realtime-blueprint.md` §CDC 설정: `max_replication_slots` 기본값 10

**불확실성**:
1. `max_replication_slots=10`에서 슬롯 2개가 실제로 WAL 파일 과적체를 유발하는가?
2. 슬롯 Consumer가 다운될 때 WAL 무제한 누적 문제가 얼마나 빠르게 발생하는가?
3. 슬롯 손상(slot invalidated) 발생 시 recovery 시간은?

### 5.2 실험 범위

**실험 환경**:
- PostgreSQL 16 (현행 WSL2)
- wal2json 확장 설치
- `max_replication_slots = 10` (기본값)

**실험 1: 슬롯 생성 및 WAL 추적**

공유 방식(슬롯 1개)과 분리 방식(슬롯 2개)으로 각각 논리 복제 슬롯을 생성하고, pg_replication_slots 뷰를 통해 WAL lag 추적 쿼리를 준비한다.

**실험 2: Consumer 다운 시 WAL 적체**

Consumer를 정지한 상태에서 30분간 DML을 지속 주입하며 `pg_wal_lsn_diff`를 통해 누적 WAL 크기를 5분 간격으로 측정한다. 500MB 임계값 기반 경보 조건을 검증한다.

**실험 3: 슬롯 손상 recovery**

`pg_ctl stop -m immediate`로 PostgreSQL을 즉각 종료 후 재시작하여 슬롯 상태를 확인한다. 손상 슬롯을 DROP 후 재생성하는 recovery 절차 소요 시간을 측정한다.

**실험 4: presence_diff 메시지 구조 확인**

`@supabase/realtime-js` 클라이언트로 채널에 연결한 뒤 presence 이벤트를 구독하여 실제 `presence_diff` 페이로드 구조를 캡처하고 예상 구조(`joins`, `leaves` 키)와 비교한다.

### 5.3 성공 기준 (Go)

```
[Go 조건 — 전체 충족 시]
1. 슬롯 2개 분리 시 WAL lag < 100MB/30분 (Consumer 다운 상황)
2. 슬롯 손상 recovery 시간 < 2분
3. presence_diff 구조 = { joins: {...}, leaves: {...} } (예상 구조 일치)
4. max_replication_slots 10개 중 2개 사용 — 경보 불필요

[No-Go — 하나라도 해당 시]
- WAL lag > 1GB/30분 (디스크 포화 위험)
- 슬롯 recovery > 10분 (RTO 위반)
- presence_diff 구조 불일치 (포팅 코드 전면 수정 필요)
```

### 5.4 결과 분석 및 반영 위치

**Go 시 반영**:
- DQ-RT-5 답변 확정: 슬롯 분리/공유 결정 기록
- `11-realtime-blueprint.md` §슬롯 운용 가이드에 WAL lag 모니터링 쿼리 추가
- ADR-010 §결과 보완

**No-Go 시 대안**:
- pgoutput 네이티브로 전환 (wal2json 제거)
- 슬롯 Consumer 감시 cron 1분 주기로 강화 + 자동 DROP 알림
- ADR-010 재검토 착수

### 5.5 kdyspike 명령어

```bash
/kdyspike --full "wal2json 복제 슬롯 2개 분리 운용 WAL 적체 + recovery 테스트" \
  --max-hours 5 \
  --output "docs/research/spikes/spike-013-wal2json-slot-result.md"
```

---

## 6. SP-014: JWKS 캐시 3분 grace 실제 효과 측정

### 6.1 질문과 배경

**핵심 질문**: JWKS 엔드포인트에 Next.js 캐시 3분 grace를 적용했을 때, JWT 검증 지연(p95)이 실제로 개선되는가? Cloudflare Workers 앞단 캐시 추가가 필요한가?

**배경 및 Blueprint 유래**:
- ADR-013: "jose ES256 키쌍 + JWKS 엔드포인트 `/api/.well-known/jwks.json`"
- DQ-12.4: "JWKS endpoint를 Cloudflare Workers 앞단 캐시로 둘지? (P2 대기)" — Wave 5
- `02-architecture/03-auth-advanced-blueprint.md` §JWKS: "3분 캐시 grace" 설계
- NFR-PERF.9: JWKS 조회 지연 < 50ms p95 목표

**불확실성**:
1. `jose.createRemoteJWKSet` 의 cacheMaxAge 설정 시 실제 캐시 Hit율은?
2. JWKS 키 회전 시 캐시 grace 3분 동안 구/신 키 전환 오류가 발생하는가?
3. Cloudflare Tunnel 경유 시 JWKS 조회 RTT가 얼마나 되는가?

### 6.2 실험 범위

**실험 1: JWKS 엔드포인트 기준 지연**

캐시 없이 매 요청마다 JWKS를 fetch하는 상황에서 100회 JWT 검증 시간을 측정한다. p50/p95를 기준값으로 기록.

**실험 2: cacheMaxAge 3분 적용**

jose의 `createRemoteJWKSet`에 `cacheMaxAge: 180_000`을 적용한 뒤 100회 연속 검증 시간을 측정한다. 첫 번째 요청만 fetch 발생, 이후는 캐시 hit이어야 한다.

**실험 3: 키 회전 시 grace 오류**

새 키쌍으로 JWKS를 교체한 직후, 구 키로 서명된 토큰을 3분 이내에 검증 시도한다. grace 기간 동안 구 키 검증이 성공하는지 확인한다.

**실험 4: Cloudflare Tunnel RTT**

stylelucky4u.com 도메인을 통해 JWKS 엔드포인트를 100회 fetch하고 RTT 평균/p95를 측정한다. 직접 localhost와 비교하여 Tunnel 오버헤드를 산출.

### 6.3 성공 기준 (Go — Cloudflare Workers 캐시 불필요)

```
[Go 조건 — 전체 충족 시]
1. 캐시 적용 후 JWKS 조회 p95 < 5ms (캐시 hit 기준)
2. 키 회전 grace 3분 내 구 키 검증 성공 (0 오류)
3. Cloudflare Tunnel RTT p95 < 100ms (캐시 miss 기준)
4. 캐시 hit율 ≥ 95% (100회 연속 검증 기준)

[No-Go — Cloudflare Workers 캐시 필요]
- 캐시 hit율 < 70% (캐시 무효화 버그)
- 키 회전 시 grace 오류 ≥ 1건
- Tunnel RTT p95 > 300ms
```

### 6.4 결과 분석 및 반영 위치

**Go 시 반영**:
- DQ-12.4 답변 확정: "Cloudflare Workers 캐시 불필요 — Next.js cacheMaxAge 3분으로 충분"
- `03-auth-advanced-blueprint.md` §JWKS 캐시 구성 확정
- ADR-013 §결과 보완: "JWKS 3분 캐시 성능 검증 완료"

**No-Go 시 대안**:
- Cloudflare Workers 앞단 캐시 도입 (P2 → P1 격상)
- Edge Config 또는 KV 사용 (Cloudflare 유료 플랜 필요)

### 6.5 kdyspike 명령어

```bash
/kdyspike --micro "jose createRemoteJWKSet cacheMaxAge 180s 캐시 hit율 측정"

/kdyspike --full "JWKS 3분 캐시 효과 + 키 회전 grace + Tunnel RTT 측정" \
  --max-hours 3 \
  --output "docs/research/spikes/spike-014-jwks-cache-result.md"
```

---

## 7. SP-015: Session 인덱스 최적화 쿼리 플랜 분석

### 7.1 질문과 배경

**핵심 질문**: Session 테이블을 SQLite(현행)에서 PostgreSQL로 이전할 때, 인덱스 전략을 어떻게 달리 해야 하는가? Phase 17 Auth Core 완성 전에 인덱스 설계를 확정해야 Prisma 마이그레이션이 가능하다.

**배경 및 Blueprint 유래**:
- ADR-006: "jose JWT + Lucia 패턴 15개 차용" — 세션 테이블 SHA-256 해시 저장
- DQ-AC-2: "Session 테이블을 SQLite(현행) → Postgres로 이전 시 인덱스 전략 차이?" — Wave 5
- spike-001-sqlite: "PM2 cluster 모드는 읽기만 안전" — 쓰기 충돌 위험
- `02-architecture/03-auth-advanced-blueprint.md` §세션 테이블: `(userId, expiresAt)` 복합 인덱스 설계

**불확실성**:
1. SQLite의 COVERING INDEX와 PG의 INDEX INCLUDE가 동일 쿼리 성능을 제공하는가?
2. SHA-256 해시(32바이트) 기반 기본키 vs UUID v7 기본키 — PG에서 어느 쪽이 BTree 효율적?
3. Session 만료(`expiresAt < now()`) 인덱스가 PG에서 partial index로 최적화 가능한가?

### 7.2 실험 범위

**실험 1: 기본 쿼리 EXPLAIN 비교**

SQLite와 PostgreSQL 각각에서 Session 테이블 기본 조회 쿼리의 실행 계획을 EXPLAIN으로 분석한다. Index scan 사용 여부, 행 추정 정확도를 비교한다.

**실험 2: Partial Index 효과**

PG에서 활성 세션(`expiresAt > NOW()`)만 대상으로 하는 partial index를 생성하고 동일 쿼리의 cost를 재측정한다. 전체 인덱스 대비 partial index의 크기와 cost 차이를 기록한다.

**실험 3: 대용량 성능 테스트**

100만 행 Session 데이터를 삽입한 뒤, 50 동시 연결에서 세션 조회 p95 응답 시간을 측정한다. SQLite(예상 p95 < 5ms)와 PG(예상 p95 < 2ms) 비교.

### 7.3 성공 기준 (Go)

```
[Go 조건]
1. PG partial index 적용 후 세션 조회 p95 < 2ms (100만 행, 50 동시)
2. 인덱스 설계 확정 (SQLite-PG 차이 명문화)
3. Prisma 마이그레이션 스크립트 초안 작성 가능

[No-Go]
- PG partial index에도 p95 > 10ms (인덱스 설계 재검토 필요)
- SHA-256 기반 기본키에서 sequential scan 발생
```

### 7.4 결과 분석 및 반영 위치

**Go 시 반영**:
- DQ-AC-2 답변 확정: "PG partial index + INCLUDE로 SQLite covering index 대체"
- `03-auth-advanced-blueprint.md` §세션 스키마 PG 인덱스 설계 확정
- Phase 17 마이그레이션 스크립트에 index DDL 포함

**No-Go 시 대안**:
- SQLite 유지 + Phase 17 이후 PG 이전 지연
- UUID v7 기반키로 전환 후 재측정

### 7.5 kdyspike 명령어

```bash
/kdyspike --full "Session 테이블 SQLite vs PG 인덱스 전략 쿼리 플랜 분석" \
  --max-hours 2 \
  --output "docs/research/spikes/spike-015-session-index-result.md"
```

---

## 8. SP-016: SeaweedFS 50GB 부하 테스트

### 8.1 질문과 배경

**핵심 질문**: SeaweedFS filer + volume 1 노드 구성에서 50GB 파일 업로드/다운로드 시 성능·안정성이 ADR-008의 요건(Hot 30일 상한 50GB)을 충족하는가?

**배경 및 Blueprint 유래**:
- ADR-008: "SeaweedFS 단독 + Backblaze B2 오프로드 — 권장 상한 50GB(ASM-4 검증 필요)"
- ADR-008 §결과 부정: "SeaweedFS 50GB+ 운영 데이터 부족(ASM-4 검증 필요)"
- `02-architecture/07-storage-blueprint.md`: Hot storage 상한 50GB, Cold 자동 이전 30일
- ADR-008 §재검토 트리거(Garage 재평가 3조건): SeaweedFS restart failure > 1건/주

**불확실성**:
1. WSL2 단일 volume 서버에서 50GB 파일 분산 시 메모리 사용량은?
2. 대용량 파일(1GB+) 업로드 시 filer의 청크 메타데이터 저장 오버헤드는?
3. 50GB 도달 후 B2 오프로드 자동 이전이 S3 API 호환으로 정상 동작하는가?
4. SeaweedFS 프로세스 재시작 후 파일 무결성은?

### 8.2 실험 범위

**실험 환경**:
- WSL2 Ubuntu 24.04 (실제 운영 환경)
- SeaweedFS 최신 stable (`weed` binary)
- filer(sqlite) + 1 volume server 구성

**실험 1: 기본 동작 확인**

master, volume, filer 3개 프로세스를 순서대로 기동한 뒤 소규모 파일 업로드/다운로드를 검증한다.

**실험 2: 50GB 부하 테스트**

100MB 크기 파일 500개(총 50GB)를 filer API를 통해 업로드한다. vmstat으로 메모리/CPU를 5분 간격으로 모니터링하며 피크 메모리, 업로드 처리량, 성공율을 기록한다.

**실험 3: 재시작 후 무결성**

50GB 업로드 완료 후 SeaweedFS를 강제 종료(SIGKILL)하고 재시작한다. 임의 파일 10개를 다운로드하여 md5sum을 업로드 전 체크섬과 비교한다. 손상 파일 0건이 목표.

**실험 4: B2 오프로드 테스트**

filer.toml에 Backblaze B2 S3 호환 설정을 추가하고, filer remote sync 기능을 통해 파일이 B2 버킷으로 자동 이전되는지 확인한다. B2 콘솔에서 파일 존재 여부 및 크기를 검증.

### 8.3 성공 기준 (Go)

```
[Go 조건 — 전체 충족 시]
1. 50GB 업로드 완료 (100MB × 500) 성공율 = 100%
2. 피크 메모리 사용량 < 2GB (WSL2 8GB 기준 25% 이하)
3. 재시작 후 파일 무결성 — 체크섬 일치 100% (손상 0건)
4. B2 오프로드 자동 이전 성공 (S3 호환 API 정상 동작)
5. 업로드 처리량 ≥ 50MB/s (filer 경유)

[No-Go — Garage 재평가 3조건 발동]
- 재시작 실패 ≥ 1건 (조건 1)
- 파일 손상 ≥ 1건 (조건 2)
- 처리량 < 10MB/s 또는 메모리 > 4GB
```

### 8.4 결과 분석 및 반영 위치

**Go 시 반영**:
- ADR-008 §결과 보완: "ASM-4 검증 완료 — 50GB 상한 확인"
- `07-storage-blueprint.md` §운영 가이드에 실측 메모리/처리량 수치 추가
- Phase 17 Storage 구현 착수 승인

**No-Go 시 대안 (Garage 재평가)**:
- Garage (Rust, BSD-3-Clause) 즉시 PoC 착수
- ADR-008 상태를 "재검토 중"으로 변경
- SeaweedFS → Garage 마이그레이션 ADR 초안 작성

### 8.5 kdyspike 명령어

```bash
/kdyspike --full "SeaweedFS 50GB 부하 테스트 — 업로드 성공율 + 무결성 + B2 오프로드" \
  --max-hours 8 \
  --output "docs/research/spikes/spike-016-seaweedfs-50gb-result.md"
```

---

## 9. 우선 세트 실행 순서 (4주 계획)

```
Week 1 (Phase 14 완료 직후)
  월: SP-014 JWKS 캐시 (3h) — 가장 빠른 확인, 독립 실행
  화: SP-010 PM2 cluster (4h) — 독립 실행
  수: SP-011 argon2id (3h) — 독립 실행
  목: 결과 분석 + ADR 업데이트

Week 2
  월-화: SP-015 Session 인덱스 (2h) — SP-011 완료 후 의존
  수-금: SP-012 isolated-vm v6 (4h) — 독립 실행

Week 3
  월-화: SP-013 wal2json 슬롯 (5h) — SP-010 결과 반영
  수-금: 결과 분석 + DQ 답변 확정

Week 4
  월-목: SP-016 SeaweedFS 50GB (8h) — SP-010 결과 반영
  금: 우선 세트 최종 리뷰 + Go/No-Go 보고서 작성
```

**병렬 실행 가능 묶음**:
- SP-014 + SP-010 + SP-011: 1주차 동시 진행 (서로 독립)
- SP-015: SP-011 완료 후 즉시 착수
- SP-012 + SP-013: SP-010 결과 대기 후 SP-013, SP-012는 독립

---

## 10. 우선 세트 공수 합산

| 스파이크 | 공수(h) | 주요 환경 | 병렬 그룹 |
|---------|---------|---------|---------|
| SP-014 JWKS 캐시 | 3 | Next.js + jose | A |
| SP-010 PM2 cluster | 4 | PM2 + WSL2 | A |
| SP-011 argon2id | 3 | Node native | B |
| SP-015 Session 인덱스 | 2 | SQLite + PG | B (SP-011 후) |
| SP-012 isolated-vm v6 | 4 | Node 22 + WSL2 | C |
| SP-013 wal2json 슬롯 | 5 | PG + wal2json | C (SP-010 후) |
| SP-016 SeaweedFS 50GB | 8 | SeaweedFS + B2 | D (SP-010 후) |
| **합계** | **29h** | | |

실제 소요: 순수 실험 시간 29h + 결과 분석/문서화 약 6h = **총 35h 이내**

4주 × 5일 × 1.5h/일 = 30h 예산 내 완수 가능 (1인 운영 기준, 기능 개발과 병행)

---

> **우선 세트 끝.** Wave 5 · P1 · 2026-04-18
> SP-010 ~ SP-016 · 7건 · 29h · Phase 15 MVP 블로킹 해소 목표
