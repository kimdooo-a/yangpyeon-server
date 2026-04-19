# SP-018 Result — Symlink Atomic Swap + PM2 Reload Downtime

**Status:** PASS (symlink atomicity) + CONDITIONAL (PM2 fork 모드 reload 600ms gap — Phase 16c cluster 전환 정당화)
**Date:** 2026-04-19 (S47)
**Environment:** WSL2 Ubuntu (Linux 6.6.87.2-microsoft-standard-WSL2), PM2 6.0.14, Node v24.14.1
**Wave 근거:** `docs/research/2026-04-supabase-parity/05-roadmap/01-milestones-wbs.md §4.3` (16b 배포 자동화)

## Goal

Phase 16b Capistrano 스타일 배포의 두 가지 핵심 가정 검증:

1. `ln -sfn` 이 정말로 **atomic** 한가 — 동시 reader 가 실패하지 않는가?
2. 현재 fork 모드 PM2 reload 다운타임 — Phase 16c (cluster:4 전환) 의 정량적 근거가 있는가?

## Results

### Step 1. Symlink atomic swap — PASS

- 실험: 1000 연속 read + 100 symlink 교체 (10ms 간격, a↔b 토글)
- 결과:
  ```json
  {"test":"symlink_swap","total_reads":1000,"fails":0,"version_a":496,"version_b":504,"pass":true}
  ```
- 해석:
  - **fails = 0** → `ln -sfn` 은 Linux 커널 수준에서 atomic. 중간 상태 (`No such file`) 노출 없음.
  - `version_a: 496` + `version_b: 504` → swap 이 실제로 발생했고 reader 가 각 버전을 섞어 읽음 → "읽기 중 swap" 시나리오가 실측됨.
  - Capistrano 스타일 `current → releases/<ts>` 교체가 프로덕션 request 를 깨뜨리지 않는다는 OS 수준 보장 확보.

### Step 3. PM2 reload 다운타임 측정 — CONDITIONAL

- 실험: 50 curls × 0.2s interval (총 10s) 중 `pm2 reload dashboard` 1회 실행
- 결과:
  ```
  reload_duration_ms=239
  total=50 ok307=47 timeouts=3 errors=0
  ```
- 해석:
  - PM2 내부 reload 명령 자체는 **239 ms** 에 완료
  - 클라이언트 관측 다운타임: **3 sample × 200ms = 약 600ms 구간** TIMEOUT
  - 원인: **현재 fork 모드 (instances=1)** — 단일 프로세스가 shutdown → Next.js listen 재시작 동안 gap 발생
  - 5xx 에러 0: graceful shutdown 단계에서 커넥션 closure 는 잘 되지만, 새 listen 이전의 SYN 은 TCP 차단 (TIMEOUT 으로 나타남)

## Decision

**GO — 16b 배포 자동화 (atomic swap 부분)** 는 계획 그대로 `ln -sfn` 사용.

**GO — 16c PM2 cluster:4 전환 근거 강화됨**. 현재 fork 모드의 600ms 다운타임이 계획을 정당화한다:
- cluster:4 + PM2 rolling reload 시 workers 를 순차 교체 → 기대 다운타임 ~0 (다음 worker 가 요청 수신)
- 세션 50 에서 동일 실험을 cluster 모드로 재수행하여 0-timeout 확인 필수 (phase16-cluster-verify.sh 회귀 가드 포함)

## Artifacts

- `experiment.sh` — symlink swap 스크립트 (chmod +x 완료)
- 실행 명령: `wsl -e bash -c "/mnt/e/00_develop/260406_luckystyle4u_server/spikes/sp-018-symlink-swap/experiment.sh"`
- PM2 reload 측정: inline WSL bash (본 문서 Step 3 섹션 참조)

## Gotchas

1. **WSL nvm PATH**: `wsl -e bash -c` 서브셸에서 `pm2` 명령을 호출하려면 `PATH=/home/smart/.nvm/versions/node/v<ver>/bin:$PATH pm2 ...` prefix 필수 (nvm 은 interactive shell 에서만 초기화). 세션 50 scripts/deploy.sh 에서도 동일 주의.
2. **`pm2 reload` vs `pm2 restart`**: reload 는 graceful (cluster 모드에서만 zero-downtime), restart 는 무조건 kill→spawn. 배포 스크립트는 `reload` 고정.
3. **fork 모드 600ms gap 은 정상**: 단일 프로세스에서 다운 없이 재시작은 OS/런타임적으로 불가능 — cluster 가 유일한 해법.

## References

- PM2 cluster mode: https://pm2.keymetrics.io/docs/usage/cluster-mode/
- Linux `rename` syscall atomicity (POSIX): symlink 교체 기반
- Phase 16 spec: `docs/superpowers/specs/2026-04-19-phase-16-design.md` §4.3 / §4.4
- Phase 16 plan: `docs/superpowers/plans/2026-04-19-phase-16-plan.md` §세션 49, §세션 50
