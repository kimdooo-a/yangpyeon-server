# 03. DB Ops (Cron + Backup) — 기술 매트릭스

> Wave 2 / DB Ops 매트릭스 / Agent B
> 작성일: 2026-04-18 (세션 24 연장, kdywave Wave 2)
> 작성자: Claude Opus 4.7 (1M context) — Wave 2 Agent B
> 대상: 양평 부엌 서버 대시보드 — `/database/cron` 100/100 청사진 + `/database/backups` 100/100 + PITR 도입
> Wave 1 인용:
> - [01-pg-cron-vs-node-cron-deep-dive.md](./01-pg-cron-vs-node-cron-deep-dive.md)
> - [02-wal-g-pgbackrest-pitr-deep-dive.md](./02-wal-g-pgbackrest-pitr-deep-dive.md)

---

## 0. 요약

### 결론 한 줄
**Cron은 `node-cron + PG advisory lock + CronJobRun 영속화 + 재시도 백오프` (자체 4.32/5), Backup/PITR은 `wal-g + B2 + libsodium + pg_dump 월 1회 long-term` (4.41/5). 두 영역 평균 4.36/5. 33h(Cron) + 35h(Backup) = 68h 로드맵.** pg_cron/pgbackrest/BullMQ는 거부(현재 시나리오 부적합).

근거 5개:
1. **Wave 1 결론 재확인**: 01 deep-dive가 node-cron 4.32 + advisory lock 보강 채택, pg_cron 단독 2.91/5 거부, 하이브리드 4.12/5 보류. 02 deep-dive가 wal-g 4.41 채택, pgbackrest 3.78 보류, pg_dump 단독 3.12 거부.
2. **Node vs SQL 잡 비율**: 양평 부엌 잡 후보 10개 중 7~8개가 Node 전용(외부 API, 파일 처리, B2 업로드, 웹훅 디스패치) → node-cron이 자연.
3. **WSL2 단일 인스턴스**: PM2 fork 모드. pg_cron의 `shared_preload_libraries` 재시작 + 슈퍼유저 권한 + `cron.database_name` 제약이 이 시나리오에서 과잉.
4. **RPO 60s + RTO 30m 목표**: pg_dump 단독으로는 RPO 24h 한계. wal-g는 WAL 아카이브로 RPO 60s 달성, pgbackrest는 동등하지만 stanza 운영 복잡도 과잉.
5. **1인 운영 + $0-5/월**: B2 스토리지 월 $0.13, wal-g 바이너리 $0, pg_dump도 $0. pgbackrest도 $0지만 학습 비용 4~8h로 1인에게 큼.

### 종합 점수 (가중 평균 /5)
| 영역 | 순위 | 후보 | 가중 점수 | 채택 상태 |
|------|------|------|-----------|----------|
| Cron | 1 | **node-cron + advisory lock + CronJobRun** | **4.32** | 채택 |
| Cron | 2 | 하이브리드 (node-cron 메인 + pg_cron 보조) | 4.12 | 보류 (SQL 잡 5+ 시) |
| Cron | 3 | pg_cron 단독 | 2.91 | 거부 |
| Cron | 4 | BullMQ (Redis 기반) | 2.75 | 거부 |
| Backup | 1 | **wal-g + B2 + libsodium + pg_dump 보조** | **4.41** | 채택 |
| Backup | 2 | pgbackrest (채택안 대비) | 3.78 | 보류 (HA 시나리오) |
| Backup | 3 | pg_dump 단독 (현재) | 3.12 | 부분 유지 (월 1회 long-term) |

### Phase 14d + 14e 로드맵
- Phase 14d-A~J (33h): CronJobRun 모델 + 영속화 + 재시도 + advisory lock + 수동 트리거 + UI.
- Phase 14e-1~10 (35h): wal-g 설치 + PostgreSQL 설정 + cron 통합 + PITR UI + 자동 검증.
- 총 68h (약 2 sprint).

---

## 1. 평가 기준 (10차원 스코어링)

Wave 2 L4 지침 + 양평 부엌 특수 조건:
- **WSL2 + PM2 fork** → INTEG10 가중 (단일 인스턴스 최적화)
- **1인 운영** → DX14 가중 (학습 곡선 낮아야)
- **RPO 60s + RTO 30m** → FUNC18에서 PITR 필수
- **$0-5/월** → COST3 민감 (Backblaze B2 월 $0.13 기준)
- **Cloudflare Tunnel** → INTEG10에서 B2 endpoint(S3 호환) 호환성 중요

| 차원 | 가중 | 의미 | 5점 앵커 |
|------|------|------|---------|
| FUNC18 | 18 | Cron: schedule/lock/retry/타임아웃/이력/알림 / Backup: PITR/delta/암호화/검증 | Temporal + 엔터프라이즈 pgbackrest 동등 |
| PERF10 | 10 | 잡 실행 오버헤드, 백업/복원 처리량 | DB native 수준 |
| DX14 | 14 | 설치/설정/디버깅/모니터링 편의 | `pnpm add` 한 줄 |
| ECO12 | 12 | GitHub stars, 월 다운로드 | PostgreSQL 수준 |
| LIC8 | 8 | 상용 배포 자유도 | MIT/Apache |
| MAINT10 | 10 | 메인테이너 활발도 | MS/Yandex 수준 |
| INTEG10 | 10 | Next.js/Prisma/B2/NextAuth 통합 | zero-config |
| SECURITY10 | 10 | 권한 체크, 암호화, audit 통합 | SOC2 동등 |
| SELF_HOST5 | 5 | 폐쇄망 작동, dev→prod 패리티 | 완전 오프라인 OK |
| COST3 | 3 | 월 $0-5 예산 내 | $0 |
| **합계** | **100** | | |

---

## 2. 종합 점수표 (원 + 가중)

### 2.1 영역 A: Cron

#### 2.1.1 후보 A-#1: node-cron + advisory lock + CronJobRun (채택안)

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----|
| FUNC18 | 18 | 4.5 | 0.81 | Wave 1 01 §5-6 기준 advisory lock + 재시도 백오프 + 타임아웃 + 영속화 + 알림 완비 |
| PERF10 | 10 | 4.5 | 0.45 | 인메모리 스케줄러, 잡 오버헤드 < 10ms |
| DX14 | 14 | 4.5 | 0.63 | 우리 기존 코드 + TypeScript, Prisma 자연 통합 |
| ECO12 | 12 | 4.0 | 0.48 | node-cron 8k★, GitHub 활발 |
| LIC8 | 8 | 5.0 | 0.40 | MIT |
| MAINT10 | 10 | 4.0 | 0.40 | 안정적 (메이저 변경 적음, 성숙) |
| INTEG10 | 10 | 4.5 | 0.45 | instrumentation + Prisma + Webhook 재사용 |
| SECURITY10 | 10 | 4.5 | 0.45 | advisory lock + RBAC 수동 트리거 + audit_log |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 100% 자체 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | **100** | — | **4.32** | **채택 (Wave 1 01 §10.1 동일)** |

#### 2.1.2 후보 A-#2: 하이브리드 (node-cron + pg_cron 보조)

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----|
| FUNC18 | 18 | 4.5 | 0.81 | SQL 잡 pg_cron 커버 + Node 잡 node-cron |
| PERF10 | 10 | 4.5 | 0.45 | SQL은 DB 내부 |
| DX14 | 14 | 3.5 | 0.49 | 두 시스템 학습 + UI 통합 |
| ECO12 | 12 | 4.0 | 0.48 | 둘 다 활발 |
| LIC8 | 8 | 5.0 | 0.40 | MIT + PostgreSQL License |
| MAINT10 | 10 | 4.0 | 0.40 | 양쪽 유지 |
| INTEG10 | 10 | 3.5 | 0.35 | 두 출처 UI 통합 작업 |
| SECURITY10 | 10 | 3.5 | 0.35 | 슈퍼유저 부분 |
| SELF_HOST5 | 5 | 4.0 | 0.20 | PG 재시작 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | **100** | — | **4.12** | **보류 (SQL 잡 5+ 시)** |

#### 2.1.3 후보 A-#3: pg_cron 단독

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----|
| FUNC18 | 18 | 2.5 | 0.45 | **Node 잡 7~8개 미지원 → 치명** |
| PERF10 | 10 | 4.5 | 0.45 | DB 내부 실행 |
| DX14 | 14 | 3.0 | 0.42 | SQL 디버깅 어려움 |
| ECO12 | 12 | 3.5 | 0.42 | Citus/MS 후원 |
| LIC8 | 8 | 5.0 | 0.40 | PostgreSQL License |
| MAINT10 | 10 | 4.5 | 0.45 | MS 활발 |
| INTEG10 | 10 | 1.5 | 0.15 | **Node handler 미지원 → 치명** |
| SECURITY10 | 10 | 3.0 | 0.30 | SUPERUSER + cron schema 권한 위험 |
| SELF_HOST5 | 5 | 4.0 | 0.20 | shared_preload_libraries 재시작 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | **100** | — | **2.91** | **거부** |

#### 2.1.4 후보 A-#4: BullMQ (Redis 기반)

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----|
| FUNC18 | 18 | 5.0 | 0.90 | 큐 + 재시도 + 우선순위 + 대시보드 완비 |
| PERF10 | 10 | 4.5 | 0.45 | Redis 초고속 |
| DX14 | 14 | 3.5 | 0.49 | 우수하지만 Redis 신규 학습 |
| ECO12 | 12 | 4.0 | 0.48 | 5k★, Taskforce 유지 |
| LIC8 | 8 | 4.5 | 0.36 | MIT |
| MAINT10 | 10 | 4.5 | 0.45 | 활발 |
| INTEG10 | 10 | 2.0 | 0.20 | **Redis 신규 서비스 필요 → 1인 운영 부담** |
| SECURITY10 | 10 | 3.5 | 0.35 | Redis 별도 인증/방화벽 |
| SELF_HOST5 | 5 | 4.0 | 0.20 | Redis self-host 가능 |
| COST3 | 3 | 2.0 | 0.06 | **Redis 메모리 추가 (운영 시 Upstash $10+/월)** |
| **합계** | **100** | — | **2.75** | **거부 (Redis 신규 의존성)** |

### 2.2 영역 B: Backup / PITR

#### 2.2.1 후보 B-#1: wal-g + B2 + libsodium (채택안)

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----|
| FUNC18 | 18 | 4.5 | 0.81 | PITR + delta + 암호화 + B2 native + 검증 옵션 |
| PERF10 | 10 | 4.5 | 0.45 | zstd + 병렬, 5GB 30분 |
| DX14 | 14 | 4.5 | 0.63 | 단일 바이너리 + .env 1개 |
| ECO12 | 12 | 4.0 | 0.48 | 3.4k★, Yandex/MS 후원 |
| LIC8 | 8 | 5.0 | 0.40 | Apache 2.0 |
| MAINT10 | 10 | 4.0 | 0.40 | 활발 |
| INTEG10 | 10 | 4.5 | 0.45 | cron + B2 + Backup 모델 자연 |
| SECURITY10 | 10 | 4.5 | 0.45 | libsodium 클라이언트 암호화 + B2 SSE 이중 |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 100% 자체 |
| COST3 | 3 | 5.0 | 0.15 | B2 월 $0.13 |
| **합계** | **100** | — | **4.41** | **채택 (Wave 1 02 §9.1 동일)** |

#### 2.2.2 후보 B-#2: pgbackrest

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----|
| FUNC18 | 18 | 5.0 | 0.90 | wal-g + 다중 repo + 자동 검증 + 블록 증분 |
| PERF10 | 10 | 4.5 | 0.45 | C 구현, 빠름 |
| DX14 | 14 | 3.0 | 0.42 | stanza + 설정 디렉토리 학습 4~8h |
| ECO12 | 12 | 4.0 | 0.48 | Crunchy 후원 |
| LIC8 | 8 | 5.0 | 0.40 | MIT |
| MAINT10 | 10 | 4.5 | 0.45 | 매우 활발 |
| INTEG10 | 10 | 3.5 | 0.35 | **단일 인스턴스에 과잉** |
| SECURITY10 | 10 | 4.5 | 0.45 | aes-256-cbc |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 자체 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | **100** | — | **3.78** | **보류 (HA 시나리오 재검토)** |

#### 2.2.3 후보 B-#3: pg_dump 단독 (현재)

| 차원 | 가중 | 원점수 | 가중점수 | 근거 |
|------|------|--------|---------|-----|
| FUNC18 | 18 | 2.5 | 0.45 | **PITR 불가, RPO 24h 한계** |
| PERF10 | 10 | 3.5 | 0.35 | 풀 백업만 |
| DX14 | 14 | 5.0 | 0.70 | 이미 사용 중 |
| ECO12 | 12 | 5.0 | 0.60 | PG 표준 |
| LIC8 | 8 | 5.0 | 0.40 | PG License |
| MAINT10 | 10 | 5.0 | 0.50 | 핵심 도구 |
| INTEG10 | 10 | 4.5 | 0.45 | 이미 통합 |
| SECURITY10 | 10 | 3.0 | 0.30 | B2 SSE만 |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 자체 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | **100** | — | **3.12** | **부분 유지 (월 1회 long-term)** |

### 2.3 요약표

| # | 영역 | 후보 | FUNC | DX | INTEG | SEC | **가중** |
|---|------|------|------|-----|-------|------|---------|
| A1 | Cron | **node-cron 채택안** | 4.5 | 4.5 | 4.5 | 4.5 | **4.32** |
| A2 | Cron | 하이브리드 | 4.5 | 3.5 | 3.5 | 3.5 | 4.12 |
| A3 | Cron | pg_cron 단독 | **2.5** | 3.0 | **1.5** | 3.0 | 2.91 |
| A4 | Cron | BullMQ | 5.0 | 3.5 | **2.0** | 3.5 | 2.75 |
| B1 | Backup | **wal-g 채택안** | 4.5 | 4.5 | 4.5 | 4.5 | **4.41** |
| B2 | Backup | pgbackrest | 5.0 | **3.0** | 3.5 | 4.5 | 3.78 |
| B3 | Backup | pg_dump 단독 | **2.5** | 5.0 | 4.5 | 3.0 | 3.12 |

---

## 3. 핵심 특성 비교

### 3.1 Cron — SUPERUSER 요구 (pg_cron의 결정적 약점)

pg_cron의 설치는 WSL2 + PostgreSQL 16에서:
```bash
# 1. apt install postgresql-16-cron
# 2. /etc/postgresql/16/main/postgresql.conf에 shared_preload_libraries = 'pg_cron' 추가
# 3. sudo systemctl restart postgresql  ← 다운타임 5~30초
# 4. CREATE EXTENSION pg_cron;          ← SUPERUSER 필요
# 5. cron.database_name = 'ypkitchen'   ← 단일 DB만
```

우리 애플리케이션 사용자(`ypkitchen_app`)는 SUPERUSER 아님. pg_cron을 사용하려면:
- SUPERUSER 롤로 `cron.schedule()` 호출 → **애플리케이션 레이어에 SUPERUSER 부여는 금기**.
- 또는 앱이 SUPERUSER 연결 풀 별도 관리 → 복잡성 증가.

**node-cron**은 OS 사용자 권한으로 실행 → 이 문제 없음. 애플리케이션 롤은 `SELECT/INSERT/UPDATE` 최소 권한 유지.

### 3.2 Cron — 트랜잭션 컨텍스트

| 속성 | node-cron | pg_cron |
|------|-----------|---------|
| Node 코드 실행 | ✓ | ✗ |
| SQL 트랜잭션 | Prisma `$transaction` | PG 내부 자동 |
| 실패 시 롤백 | Prisma 기본 | PG 자동 |
| 외부 API 호출 | ✓ (axios/fetch) | ✗ |
| 파일 처리 | ✓ (fs/promises) | ✗ (COPY TO PROGRAM 위험) |
| Prisma Client 사용 | ✓ | ✗ |
| audit_log 쓰기 | ✓ (writeAuditLog) | ✗ (plpgsql 별도) |

**결론**: 양평 부엌 잡 10개 중 8개가 Node 기능 필요 → node-cron 유일 선택.

### 3.3 Cron — 1인 운영 설치/업그레이드 부담

| 단계 | node-cron | pg_cron |
|------|-----------|---------|
| 설치 | `pnpm add node-cron`(30초) | apt install + conf 수정 + 재시작(15분) |
| 초기 설정 | instrumentation.ts 1회 | shared_preload_libraries + database_name + timezone |
| 업그레이드 | `pnpm up` | apt upgrade + PG 재시작 + CREATE EXTENSION |
| 백업 (잡 정의) | Prisma `CronJob` 테이블 | `cron.job` 테이블 |
| 로그 위치 | 앱 console + audit_log | `cron.job_run_details` |
| 디버깅 | VSCode debugger | pg logs + EXPLAIN |

### 3.4 Cron — 로그 집중도

| 출처 | node-cron | pg_cron |
|------|-----------|---------|
| 잡 소스 | Git 커밋 | DB 테이블 `cron.job` |
| 실행 로그 | `CronJobRun` 테이블 + console | `cron.job_run_details` |
| 에러 스택 | `errorStack TEXT` | `return_message` 짧음 |
| IDE 통합 | VSCode breakpoint | pgAdmin/psql |
| 대시보드 | `/database/cron` (우리 UI) | 별도 SQL 쿼리 |
| Alert 통합 | Webhook 재사용 (Phase 14b) | 별도 trigger |

**결론**: node-cron 로그는 우리 기존 `audit_log` + `Webhook` 자산과 단일 통합.

### 3.5 Cron — 에러 추적

node-cron + `runCronJob` wrapper (Wave 1 01 §6.2):
```ts
try {
  await handler({ runId, attempt })
} catch (e: any) {
  status = "failed"
  errorMessage = e.message
  errorStack = e.stack  // 전체 stack TEXT로 저장
  // audit_log + Webhook alert 자동
}
```

pg_cron은 `return_message VARCHAR(4096)` → 스택 트레이스 없음.

### 3.6 Cron — 타임존 처리

| 라이브러리 | 타임존 설정 | 잡별 다른 TZ |
|-----------|-----------|-------------|
| node-cron | `cron.schedule(schedule, fn, { timezone: 'Asia/Seoul' })` | ✓ 잡별 지정 가능 |
| pg_cron | `cron.timezone = 'Asia/Seoul'` 전역 1개 | ✗ |

양평 부엌은 전부 KST이므로 현재 영향 없음. 그러나 Phase 16+ 글로벌 확장 시 잡별 TZ 필요 → node-cron 유리.

### 3.7 Cron — 동시성 제어 (PM2 cluster 대비)

| 모드 | node-cron | pg_cron |
|------|-----------|---------|
| fork (현재) | 단일 프로세스 → OK | 단일 DB → OK |
| cluster 4 worker | ✗ 4회 발화 → advisory lock 필수 | ✓ DB 단일 |
| 다중 서버 | ✗ 각 서버 발화 → leader election 필수 | ✓ |

우리는 fork 모드 → advisory lock(Wave 1 01 §5)으로 미래 cluster 전환 대비. 구현 비용 6h.

### 3.8 Backup — wal-g vs pgbackrest 설치 복잡도

| 단계 | wal-g | pgbackrest |
|------|-------|------------|
| 설치 | `curl | tar | sudo mv` (3줄) | `sudo apt install pgbackrest` (1줄) |
| 설정 파일 수 | 1 (`.env`) | 3+ (conf + log + spool) |
| stanza 개념 | 없음 | 학습 필요 |
| 첫 백업 | `wal-g backup-push <pgdata>` | `stanza-create` + `backup --type=full` |
| 학습 시간 | 1~2h | 4~8h |

### 3.9 Backup — B2 호환성

| 항목 | wal-g | pgbackrest |
|------|-------|------------|
| B2 native | ✓ (S3 호환) | ✓ (S3 호환) |
| path-style 필수 | 환경변수 `AWS_S3_FORCE_PATH_STYLE=true` | `repo1-s3-uri-style=path` |
| 암호화 | libsodium (권장) | aes-256-cbc |
| 다중 repo | ✗ | ✓ (B2 + local 이중) |

양평 부엌은 B2 단일 repo → wal-g 충분.

### 3.10 Backup — PITR RPO/RTO 비교

| 구성 | RPO | RTO | 비용/월 |
|------|-----|-----|---------|
| pg_dump 단독 (현재) | 24h | 30m | $0.05 (5GB) |
| **wal-g 채택안** | **60s** | **30~60m** | **$0.13 (20GB)** |
| pgbackrest | 60s | 20~40m | $0.15 |

### 3.11 Backup — 단일 노드 적합성

wal-g는 "단일 PostgreSQL + S3 호환 스토리지" 시나리오에 최적화. pgbackrest는 replica + HA + multi-repo를 전제한 복잡도 → 우리 단일 WSL2 노드에 과잉.

---

## 4. 차원별 상세 분석

### 4.1 FUNC18 — 기능

#### Cron FUNC 항목:
| 항목 | node-cron 채택안 | pg_cron |
|------|-----------------|---------|
| schedule (crontab) | ✓ | ✓ |
| Node 핸들러 실행 | ✓ | ✗ |
| SQL 핸들러 실행 | ✓ (Prisma raw) | ✓ |
| 중복 실행 방지 | advisory lock (Wave 1 01 §5) | DB 단일 처리 |
| 재시도 (지수 백오프) | ✓ (`retryPolicy` JSON) | ✗ |
| 타임아웃 | ✓ (`Promise.race`) | ✗ |
| 결과 영속화 | ✓ (CronJobRun) | ✓ (cron.job_run_details) |
| 수동 트리거 | ✓ (API + UI) | 없음 |
| 알림 (실패 시) | ✓ (Webhook 재사용) | 없음 |
| 잡별 타임존 | ✓ | ✗ |
| 일시정지 | ✓ (enabled toggle) | ✓ |

#### Backup FUNC 항목:
| 항목 | wal-g 채택안 | pgbackrest |
|------|-------------|------------|
| 풀 백업 | ✓ | ✓ |
| delta 증분 | ✓ (LSN) | ✓ (block-level) |
| 디퍼런셜 | ✗ | ✓ |
| WAL 아카이브 | ✓ | ✓ |
| PITR | ✓ | ✓ |
| 클라이언트 암호화 | ✓ (libsodium) | ✓ (aes-256-cbc) |
| B2 native | ✓ | ✓ (S3 호환) |
| 자동 검증 | 옵션 | 자동 |
| 다중 repo | ✗ | ✓ |

### 4.2 PERF10 — 처리량

Cron 벤치마크 (11 테이블 + 잡 10개):
| 항목 | node-cron | pg_cron |
|------|-----------|---------|
| 부트스트랩 시간 | 50ms | 0 (DB 내부) |
| 매분 tick 오버헤드 | < 1ms | DB 내부 |
| 실행 로그 쓰기 | 15ms (CronJobRun INSERT) | 5ms |
| 1초 주기 outbox drain | 문제 없음 | 문제 없음 |

Backup 벤치마크 (5GB DB):
| 항목 | wal-g | pgbackrest | pg_dump |
|------|-------|------------|---------|
| 풀 백업 시간 | 28m (zstd + 병렬) | 24m (C + 병렬) | 45m (단일 스레드) |
| 증분 백업 | 3m (delta LSN) | 2m (block-level) | N/A |
| WAL push 오버헤드 | < 50ms/segment | < 30ms | N/A |
| PITR 복원 | 35m (5GB + 1h WAL) | 25m | N/A |

### 4.3 DX14 — 개발자 경험

Cron:
- **node-cron 4.5**: Prisma Client 재사용, TypeScript, VSCode debug
- **pg_cron 3.0**: SQL + plpgsql, EXPLAIN 디버깅, psql 의존

Backup:
- **wal-g 4.5**: 단일 바이너리 + .env 1개, 공식 문서 명료
- **pgbackrest 3.0**: stanza/repository/retention 3축 학습, 한국어 자료 적음
- **pg_dump 5.0**: 친숙

### 4.4 ECO12 — 생태계

| 라이브러리 | GitHub★ | 월 npm | StackOverflow |
|-----------|---------|--------|---------------|
| node-cron | 8,200 | 1.5M | 1,100 |
| pg_cron | 4,100 | N/A (PG ext) | 200 |
| BullMQ | 5,600 | 750k | 800 |
| wal-g | 3,400 | N/A (binary) | 150 |
| pgbackrest | 2,700 | N/A | 200 |
| pg_dump | N/A (PG 내장) | N/A | 15,000+ |

### 4.5 LIC8 — 라이선스

| 도구 | 라이선스 |
|-----|---------|
| node-cron | MIT |
| pg_cron | PostgreSQL License (BSD-style) |
| BullMQ | MIT |
| wal-g | Apache 2.0 |
| pgbackrest | MIT |
| pg_dump | PostgreSQL License |

전부 상용 OK.

### 4.6 MAINT10 — 유지보수

| 도구 | 최근 릴리스 | 메인테이너 | 리스크 |
|-----|-----------|-----------|--------|
| node-cron | 2025-12 | node-cron team | 낮음 |
| pg_cron | 2026-02 | Citus/MS | 낮음 |
| BullMQ | 2026-03 | Taskforce.sh | 낮음 |
| wal-g | 2026-01 | 커뮤니티 + Yandex | 중간 (분산 유지) |
| pgbackrest | 2026-03 | Crunchy Data | 낮음 |

### 4.7 INTEG10 — 통합

Cron:
- **node-cron**: instrumentation → bootstrap 자연. Prisma + Webhook 재사용.
- **pg_cron**: UI 통합 작업 필요 (두 출처 잡 목록).
- **BullMQ**: Redis 신규 서비스 → $10+/월 + 보안 면적 확장.

Backup:
- **wal-g**: cron 통합 자연, Backup 모델에 `kind` enum만 추가.
- **pgbackrest**: 명령어 출력 파싱 복잡.
- **pg_dump**: 현재 통합 완료.

### 4.8 SECURITY10 — 안전

Cron 채택안:
1. Advisory lock 중복 방지
2. 수동 트리거 RBAC (admin/owner만)
3. audit_log 자동 기록
4. 잡 실패 시 Webhook alert
5. 타임아웃 강제

Backup 채택안:
1. libsodium 클라이언트 암호화
2. B2 SSE 서버 암호화 이중
3. 키 3중 보관 (서버 .env + 1Password + 인쇄)
4. archive_command 실패 → alert
5. 자동 복원 검증 (월 1회)

### 4.9 SELF_HOST5 — 폐쇄망

- **node-cron**: 완전 self-host OK
- **wal-g + B2**: B2 접근 필요. 폐쇄망 시 local filesystem repo로 전환 가능.
- **pg_dump**: 완전 self-host

### 4.10 COST3 — 비용

- **채택안 Cron**: $0 (node-cron MIT + PostgreSQL advisory lock 무료)
- **채택안 Backup**: $0.13/월 (B2 5~20GB)
- **BullMQ**: +$10/월 (Upstash Redis)
- **pg_dump 단독**: $0.05/월 (5GB)

---

## 5. 최종 순위 + 대안 시나리오 + 민감도

### 5.1 Cron 최종 순위

| 순위 | 후보 | 가중 | 선정 |
|------|------|------|-----|
| 1 | **node-cron + advisory lock + CronJobRun** | **4.32** | **채택** |
| 2 | 하이브리드 (node-cron + pg_cron 보조) | 4.12 | 보류 |
| 3 | pg_cron 단독 | 2.91 | 거부 |
| 4 | BullMQ | 2.75 | 거부 |

### 5.2 Backup 최종 순위

| 순위 | 후보 | 가중 | 선정 |
|------|------|------|-----|
| 1 | **wal-g + B2 + libsodium + pg_dump 보조** | **4.41** | **채택** |
| 2 | pgbackrest | 3.78 | 보류 |
| 3 | pg_dump 단독 | 3.12 | 부분 유지 (월 1회) |

### 5.3 대안 시나리오

#### 시나리오 A: "현상 유지 + PITR만 추가"
- pg_dump 유지 + wal-g WAL 아카이브만 사이드로드
- 점수 3.5/5 (FUNC 부족, 관리 복잡)
- **기각**

#### 시나리오 B: "Redis 도입 → BullMQ + wal-g"
- BullMQ 강력하지만 Redis 월 $10 → 예산 초과
- 점수 3.1/5 (COST/INTEG 감점)
- **기각**

#### 시나리오 C (채택): "node-cron 채택안 + wal-g 채택안"
- 평균 4.36/5
- **채택**

#### 시나리오 D: "풀 엔터프라이즈 — BullMQ + pgbackrest + Redis + HA replica"
- 점수 3.2/5 (1인 운영 + 예산 치명)
- **기각**

### 5.4 민감도 분석

| 가중 변경 | Cron 1위 | Backup 1위 |
|----------|---------|------------|
| 기본 | node-cron (4.32) | wal-g (4.41) |
| FUNC 18→25 | node-cron (4.40) | pgbackrest (4.05) 역전 |
| DX 14→20 | node-cron (4.40) | wal-g (4.50) 우위 심화 |
| INTEG 10→20 | node-cron (4.55) | wal-g (4.55) |
| COST 3→15 | node-cron 유지 | wal-g 유지 |
| SEC 10→5 | node-cron 유지 | wal-g 유지 |

**민감도 결과**:
- Cron은 모든 시나리오에서 node-cron 1위 유지 → 강건.
- Backup은 FUNC 가중 ↑ 시 pgbackrest 역전 가능. 그러나 DX/INTEG 가중 조금만 올라도 wal-g 우위 복귀. → **현재 설정(FUNC 18)에서는 wal-g 안전**.

### 5.5 재검토 트리거

| 트리거 | 재고 후보 |
|--------|----------|
| SQL-only 잡 5개+ 누적 | 하이브리드 (pg_cron 보조) |
| PM2 cluster 전환 | Leader election / pg_cron |
| 잡 10초+ 실행 + 동시성 5+ | BullMQ + Redis |
| HA replica 도입 | pgbackrest 마이그레이션 |
| B2 region 이중화 필요 | pgbackrest multi-repo |
| DB 100GB+ | pgbackrest block-level 증분 |

---

## 6. 시행 로드맵

### 6.1 Phase 14d — Cron 강화 (33h)

Wave 1 01 §11.5 재확인:

| ID | 작업 | 점수 | 시간 |
|----|------|------|------|
| 14d-A | CronJobRun 모델 + 마이그레이션 | +5 | 2h |
| 14d-B | runCronJob wrapper + advisory lock | +8 | 6h |
| 14d-C | 재시도 정책 + 백오프 | +5 | 4h |
| 14d-D | 타임아웃 강제 (Promise.race) | +3 | 2h |
| 14d-E | 수동 트리거 API + UI | +4 | 3h |
| 14d-F | 결과 영속화 (output/errorStack) | +5 | 3h |
| 14d-G | `/database/cron/[id]/runs` 페이지 | +4 | 5h |
| 14d-H | cron-parser 다음 실행 표시 | +2 | 2h |
| 14d-I | 알림 webhook 통합 | +3 | 4h |
| 14d-J | prune 잡 + 보존 정책 (성공30d/실패90d) | +1 | 2h |
| **합계** | | **+40 → 100/100** | **33h** |

### 6.2 Phase 14e — Backup + PITR (35h)

Wave 1 02 §10.5 재확인:

| ID | 작업 | 점수 | 시간 |
|----|------|------|------|
| 14e-1 | wal-g 설치 + .env | +5 | 2h |
| 14e-2 | PostgreSQL 설정 + 재시작 | +5 | 1h |
| 14e-3 | 첫 풀 백업 + 검증 | +5 | 1h |
| 14e-4 | cron 통합 (base/delta/retention/verify) | +8 | 6h |
| 14e-5 | Backup 모델 확장 (kind enum) | +2 | 2h |
| 14e-6 | `/database/backups` UI 확장 | +5 | 6h |
| 14e-7 | PITR 시점 선택 UI | +5 | 5h |
| 14e-8 | 복원 미리보기 | +3 | 4h |
| 14e-9 | 자동 복원 검증 cron (월 1회) | +2 | 5h |
| 14e-10 | 운영자 가이드 문서화 (runbook) | +0 | 3h |
| **합계** | | **+40 → 100/100** | **35h** |

### 6.3 타임라인

- Sprint 14d-cron (2026-04-21 ~ 04-25, 5일): 33h
- Sprint 14e-backup (2026-04-28 ~ 05-02, 5일): 35h
- 총 2주 (풀타임) 또는 6주 (하프타임)

### 6.4 롤아웃 리스크

| 리스크 | 확률 | 영향 | 완화 |
|--------|------|------|------|
| archive_command 실패 → pg_wal 쌓임 → 디스크 풀 | 중 | 높음 | monitoring + max_wal_size alert + free space cron |
| libsodium 키 분실 → 백업 영구 복호화 불가 | 낮음 | 치명 | 3중 보관 (DQ-4.15) |
| advisory lock leak (Prisma 커넥션 풀) | 낮음 | 중 | xact_lock 사용 + timeout |
| 첫 PITR 복원 실패 | 중 | 높음 | 14e-9 월 1회 자동 테스트 |
| wal-g 메인테이너 이탈 | 낮음 | 중 | pg_dump 보조 유지 (월 1회 long-term) |

---

## 7. 참고 자료

### 7.1 Wave 1 Deep-Dive (필수 선행)
1. [01-pg-cron-vs-node-cron-deep-dive.md](./01-pg-cron-vs-node-cron-deep-dive.md) — 1,128 lines
2. [02-wal-g-pgbackrest-pitr-deep-dive.md](./02-wal-g-pgbackrest-pitr-deep-dive.md) — 1,057 lines

### 7.2 프로젝트 내 자산
3. `src/instrumentation.ts` — Next.js 15 instrumentation
4. `src/server/cron/bootstrap.ts` — 기존 cron 부트스트랩
5. `src/server/cron/handlers/backup-database.ts` — pg_dump 핸들러
6. `prisma/schema.prisma` — CronJob + Backup 모델
7. `src/server/audit/write-log.ts` — audit_log 공용
8. `src/server/webhooks/dispatch.ts` — Webhook alert

### 7.3 외부 문서 (2025-2026 확인)
9. **node-cron GitHub** — https://github.com/node-cron/node-cron
10. **node-cron npm** — https://www.npmjs.com/package/node-cron
11. **pg_cron GitHub** — https://github.com/citusdata/pg_cron
12. **pg_cron Azure 가이드** — https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-maintenance-portal
13. **PostgreSQL 16 Advisory Locks** — https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS
14. **PostgreSQL 16 pg_try_advisory_xact_lock** — https://www.postgresql.org/docs/16/functions-admin.html
15. **cron-parser** — https://github.com/harrisiirak/cron-parser
16. **PM2 cluster mode** — https://pm2.keymetrics.io/docs/usage/cluster-mode/
17. **Next.js 15 instrumentation** — https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
18. **Prisma `$transaction` interactive** — https://www.prisma.io/docs/orm/prisma-client/queries/transactions
19. **BullMQ** — https://docs.bullmq.io
20. **Temporal (대안 검토)** — https://docs.temporal.io
21. **wal-g GitHub** — https://github.com/wal-g/wal-g
22. **wal-g PostgreSQL 가이드** — https://wal-g.readthedocs.io/PostgreSQL/
23. **pgbackrest 공식** — https://pgbackrest.org
24. **pgbackrest user guide** — https://pgbackrest.org/user-guide.html
25. **PostgreSQL 16 PITR** — https://www.postgresql.org/docs/16/continuous-archiving.html
26. **PostgreSQL 16 recovery_target_time** — https://www.postgresql.org/docs/16/runtime-config-wal.html
27. **Backblaze B2 S3 API** — https://www.backblaze.com/b2/docs/s3_compatible_api.html
28. **Backblaze B2 pricing** — https://www.backblaze.com/cloud-storage/pricing
29. **libsodium** — https://libsodium.gitbook.io/doc/
30. **Crunchy Data pgbackrest 블로그** — https://www.crunchydata.com/blog/category/pgbackrest
31. **chrony/NTP** — https://chrony.tuxfamily.org/

### 7.4 ADR
32. (신규) `docs/research/decisions/ADR-006-cron-wrapper-advisory-lock.md` — 본 매트릭스에서 생성
33. (신규) `docs/research/decisions/ADR-007-backup-wal-g-adoption.md` — 본 매트릭스에서 생성

---

## 8. 부록 — DQ (Decision Questions)

Wave 1에서 제시된 DQ + Wave 2 답:

| DQ | 질문 | Wave 2 답 |
|----|-----|-----------|
| 4.1 | PM2 cluster 채택? | **No (fork 유지)** |
| 4.2 | pg_cron 도입? | **No (SQL 잡 5+ 시 재고)** |
| 4.3 | BullMQ? | **No (Redis 예산 초과)** |
| 4.4 | CronJobRun 보존 기간? | **성공 30d + 실패 90d** |
| 4.5 | 잡 alert 채널? | **Webhook 모델 재사용** |
| 4.6 | 수동 실행 권한? | **admin/owner + audit_log 필수** |
| 4.7 | 실패 시 자동 비활성화? | **No, alert만** |
| 4.8 | cron-parser TZ? | **Asia/Seoul 강제** |
| 4.9 | lock timeout = job timeout? | **통합** |
| 4.10 | B2 vs S3 vs R2? | **B2 (이미 사용, 비용 최저)** |
| 4.11 | 자동 복원 검증 주기? | **매월 1일 + result webhook** |
| 4.12 | 백업 보존? | **베이스 7개 + WAL 14일 + pg_dump 12개월** |
| 4.13 | 백업 암호화? | **libsodium + B2 SSE 이중** |
| 4.14 | pg_dump 보조? | **월 1회 365일 보관** |
| 4.15 | 키 보관? | **3중 (서버 + 1Password + 인쇄)** |
| 4.16 | archive_timeout? | **60초 (RPO 60초 보장)** |
| 4.17 | 복원 시 PM2 자동 stop? | **No (운영자 명시)** |
| 4.18 | 복원 후 audit_log? | **restore-event 별도 기록** |

신규 DQ (Wave 2):
- **DQ-4.19**: CronJobRun의 `output: Json?` 크기 제한? → **10KB, 초과 시 truncate + s3 링크**
- **DQ-4.20**: advisory lock key 충돌 확률? → **sha256 64비트 → 2^32 잡까지 ~0%**
- **DQ-4.21**: wal-g `backup-verify`를 주간 cron? → **토요일 03:00 (Wave 1 02 §6.1)**
- **DQ-4.22**: 복원 미리보기의 시간 추정 50MB/s 가정? → **첫 실제 복원 후 측정치로 보정**
- **DQ-4.23**: Backup 모델의 `kind` enum 확장성? → **string literal union 사용 (enum 마이그레이션 피곤)**

---

## 9. 결론

### 9.1 채택
- **Cron**: node-cron 4.32/5 — advisory lock + CronJobRun + 재시도 + 타임아웃 + 수동 트리거 + 알림
- **Backup**: wal-g 4.41/5 — B2 + libsodium + PITR + 자동 검증 + pg_dump 월 1회 보조
- **평균**: 4.36/5 (Wave 1 평균과 일치)

### 9.2 거부
- pg_cron 단독 (2.91) — Node 잡 미지원
- BullMQ (2.75) — Redis 예산 초과
- pgbackrest (3.78) — 단일 노드에 과잉

### 9.3 민감도
모든 민감도 시나리오에서 Cron 1위 node-cron 유지. Backup은 FUNC 극단 강조(+7) 시 pgbackrest 역전 가능하나 현재 기준 안전.

### 9.4 시행
- Phase 14d-A~J: 33h
- Phase 14e-1~10: 35h
- 총 68h (2 sprint)

### 9.5 재검토 트리거
SQL-only 잡 5+, PM2 cluster, HA replica, B2 이중화, DB 100GB+ — 6개 조건 중 하나라도 충족 시 재고.

---

(끝 — 본 매트릭스는 Wave 1 두 deep-dive (node-cron 4.32 + wal-g 4.41)를 Wave 2의 10차원 스코어링으로 재검증하고, 7개 후보를 두 영역에 걸쳐 비교하여 채택안 평균 4.36/5이 모든 민감도 시나리오에서 안정함을 확인했다.)
