# SP-019 Result — PM2 cluster:4 + better-sqlite3 호환성

**Status:** CONDITIONAL PASS (SQLite WAL concurrent writes 완벽, instrumentation 중복 실행 확정 — scheduler fork 분리 필수)
**Date:** 2026-04-19 (S47)
**Environment:** WSL2 Ubuntu, PM2 6.0.14, Node v24.14.1, better-sqlite3 12.8
**Wave 근거:** `docs/research/2026-04-supabase-parity/05-roadmap/01-milestones-wbs.md §4.4` (16c PM2 cluster:4 + Canary)

## Goal

Phase 16c PM2 cluster:4 전환 전 3가지 리스크 검증:
1. **SQLite writer 경합** — 4 worker 동시 쓰기 시 `SQLITE_BUSY` 발생률
2. **Instrumentation 중복 실행** — cluster 에서 cron/scheduler 코드가 worker 별 독립 실행되는지
3. **PM2 v6.0.14 delete 버그** — 세션 30 `default` namespace 사고의 재현 가능성

## Results

### 1. SQLite WAL concurrent writes — ✅ PASS (예상 외 완벽)

- 실험: 4 worker × 5ms interval × 25초 = 약 19,465 insert 시도
- 설정: `journal_mode = WAL`, `busy_timeout = 5000`
- 결과:
  | Worker | count | busy | other | duration_ms |
  |--------|-------|------|-------|-------------|
  | 0      | 4875  | 0    | 0     | 25005       |
  | 1      | 4853  | 0    | 0     | 25003       |
  | 2      | 4875  | 0    | 0     | 25002       |
  | 3      | 4862  | 0    | 0     | 25004       |
  | **합계** | **19,465** | **0** | **0** | — |

- 해석: **SQLITE_BUSY 0건**. WAL 모드 + 5초 busy_timeout 조합으로 4-way concurrent writes 가 아무 경합 없이 동작. 예상보다 훨씬 안정적.
- 함의: Phase 16c 에서 `dashboard` cluster:4 worker 들이 `audit_log` 테이블에 동시 쓰기해도 문제 없음. Prisma 대상 PostgreSQL 은 별개 문제 — SQLite 는 로컬 메타/캐시용으로 한정되어 있음을 전제.

### 2. Instrumentation 중복 실행 — ⚠️ CONFIRMED

- 실험: 각 worker 에서 `globalThis.__spike019Scheduler` 존재 여부 확인
- 결과:
  ```
  {"worker":0,"type":"instrumentation_init","id":"scheduler-w0-1776599004033"}
  {"worker":1,"type":"instrumentation_init","id":"scheduler-w1-1776599004042"}
  {"worker":2,"type":"instrumentation_init","id":"scheduler-w2-1776599004047"}
  {"worker":3,"type":"instrumentation_init","id":"scheduler-w3-1776599004071"}
  ```
- 해석:
  - 4 worker 가 **각자 독립 V8 heap** 을 가짐 — 모두 `instrumentation_init` 발생 (no "duplicate" message)
  - timestamps 40ms 범위 내 밀집 → 거의 동시 시작
  - **cron/scheduler 코드를 dashboard cluster 내부에 두면 4회 실행된다**
  - Phase 16c 설계 결정 확정: `cleanup-scheduler` / `canary-router` 같은 singleton 동작은 **별도 fork 프로세스로 분리** (세션 50 Task 50-1 의 `3 앱 구조` 중 `cleanup-scheduler: fork × 1` 는 필수)

### 3. PM2 v6.0.14 delete 버그 — ✅ NOT REPRODUCED (이름 기반 삭제)

- 실험: `pm2 delete spike019-app` (이름 기반)
- 결과:
  - spike019 namespace 4개 워커 정확히 제거
  - `default` namespace (dashboard, cloudflared) **완벽 보존**
- 해석:
  - v6.0.14 에서 **이름 기반 delete 는 버그 없음**
  - 세션 30 사고는 `pm2 delete all` 또는 다른 wildcard 형태일 가능성 — 정확한 재현 명령어 미상
  - 방어 원칙: **프로덕션 환경에서 `pm2 delete all` / `pm2 kill` / `--namespace <>` 패턴은 스킬에서 금지**, 반드시 정확한 이름으로만 삭제

## Decision

**CONDITIONAL GO** — Phase 16c PM2 cluster:4 진행, 단 아래 3가지 조건 충족 시:

1. **Scheduler 분리 필수** — `cleanup-scheduler`, `canary-router` 등 singleton 코드는 반드시 `exec_mode: fork`, `instances: 1` 별도 프로세스로 배치. 계획 세션 50 Task 50-1 의 3-앱 구조 유지.
2. **WAL + busy_timeout 5000ms 고정** — SQLite 를 사용하는 경우 반드시 PRAGMA 2종 설정. 현재 dashboard 에서 더블체크 필요.
3. **PM2 delete 제한** — 운영 스크립트 (`/ypserver`, `scripts/deploy.sh`) 에서 `pm2 delete <정확한 이름>` 만 허용, wildcard/namespace 삭제 금지.

## Artifacts

- `ecosystem-spike.config.js` — cluster 4 instances ecosystem (namespace 격리)
- `write-contention-test.js` — JS 변환본 (PM2 cluster 는 tsx interpreter 없이 안정)
- 실행 명령 (재현):
  ```bash
  wsl -e bash -c 'mkdir -p ~/dashboard/spikes/sp-019-pm2-cluster && \
    cp /mnt/e/.../spikes/sp-019-pm2-cluster/*.js ~/dashboard/spikes/sp-019-pm2-cluster/ && \
    cd ~/dashboard/spikes/sp-019-pm2-cluster && \
    export PATH=/home/smart/.nvm/versions/node/v24.14.1/bin:$PATH && \
    pm2 start ecosystem-spike.config.js'
  # 25초 대기 후
  # pm2 logs spike019-app --nostream
  # pm2 delete spike019-app
  ```

## Gotchas

1. **tsx 는 cluster 모드 interpreter 로 취약** — TS 를 그대로 돌리려 하면 fork 로 fallback 되거나 ESM/CJS 혼용 오류 발생. 프로덕션 cluster 는 **컴파일된 JS 만** (Next.js `.next/standalone` 빌드가 표준).
2. **better-sqlite3 네이티브 바이너리는 WSL/Windows 별개** — Windows 호스트의 `node_modules` 를 WSL PM2 에서 공유할 수 없음. `/mnt/e/...` 경로에 있는 node_modules 로는 실행 불가. 배포 시 WSL 빌드 필요 (`ypserver` 스킬이 이미 이렇게 동작).
3. **`pm2 delete all` 금지** — v6.0.14 버그든 정상 동작이든, 전체 삭제는 운영 프로세스를 위협함.

## References

- better-sqlite3 WAL mode: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#propertiesmap--journal_mode-mode
- PM2 cluster mode: https://pm2.keymetrics.io/docs/usage/cluster-mode/
- 세션 30 PM2 사고: `docs/logs/` (구체적 명령 불명확)
- Phase 16 spec: `docs/superpowers/specs/2026-04-19-phase-16-design.md` §4.4
- Phase 16 plan: `docs/superpowers/plans/2026-04-19-phase-16-plan.md` §세션 50
