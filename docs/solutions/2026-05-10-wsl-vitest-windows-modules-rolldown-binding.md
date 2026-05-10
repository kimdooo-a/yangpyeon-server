---
title: WSL ↔ Windows 경계 4-stage 함정 — vitest 라이브 통합 테스트의 WSL 빌드 미러 우회
date: 2026-05-10
session: 95
tags: [wsl, vitest, postgres, integration-test, rolldown, native-binding, env-interop, messenger]
category: workaround
confidence: high
---

## 문제

Windows 작업 디렉토리(`E:\00_develop\260406_luckystyle4u_server`) 에서 vitest 라이브 통합 테스트(`bash scripts/run-integration-tests.sh tests/messenger/...`) 를 실행하려 할 때, WSL postgres 와 Windows node 가 만나는 경계에서 **4-stage 함정**이 차례대로 발생한다.

| Stage | 시도 경로 | 실패 증상 |
|---|---|---|
| 1 | PowerShell `npx vitest run --no-file-parallelism tests/messenger/...` | `Error: connect ECONNREFUSED ::1:5432` / `127.0.0.1:5432` — Windows host 에서 WSL 내부 postgres 미접근 |
| 2 | `wsl -d Ubuntu -- bash -lc 'bash scripts/run-integration-tests.sh ...'` (Windows 측 npx 사용) | scripts/run-integration-tests.sh §13-16 함정: env URL 의 `?`/`%`/`=` 문자가 WSL→Windows interop 경계에서 손실 → `HAS_DB=false` → 13 tests 모두 skipped (76 skip + 16 pass 패턴, env-gate 비활성) |
| 3 | `wsl -- bash -lc 'source ~/.nvm/nvm.sh && bash scripts/run-integration-tests.sh ...'` (WSL Linux node + Windows node_modules) | `Cannot find module '@rolldown/binding-linux-x64-gnu'` — Windows 측 `npm install` 이 Linux native binding 을 install 하지 않음. rolldown(vitest 5 의 transformer) 이 native binary 부재로 startup 실패 |
| 4 (성공) | WSL 빌드 미러 cp + 거기서 실행 | 13/13 PASS (850ms) |

scripts 헤더(§13-24)에는 옵션 1 (PowerShell 직접) + 옵션 2 (WSL 내 Linux Node nvm install) 가 회피책으로 명시돼 있으나, **PowerShell 도 WSL postgres 미접근으로 1차 실패**한다 — 즉 헤더 권장 회피책이 본 환경에서는 부분적으로만 유효. Linux Node 회피책(§24)도 Windows 측 node_modules 의 native binding 부재로 추가 실패.

## 원인

### Stage 1 (ECONNREFUSED)
- WSL2 의 default 네트워크 모드는 NAT. WSL 내부 `localhost:5432` 와 Windows `localhost:5432` 는 별개. Windows host 에서 WSL postgres 에 접근하려면 WSL distro IP (가변) 또는 listen_address=0.0.0.0 + Windows 측 포트포워딩 설정 필요.
- 양 환경에서 ypserver PM2 가 WSL 내부에서만 운영되도록 의도된 구성 — Windows 측에서 직접 접근하는 케이스 자체가 비표준.

### Stage 2 (env URL 손실)
- WSL bash 가 Windows 측 npx (`/mnt/c/Program Files/nodejs/npx`) 를 호출하면 Windows interop 가 발동. 이 경계에서 환경변수 값의 일부 특수문자 (`?`, `%`, `=`) 가 escape/encoding 처리되어 변형되거나 손실.
- scripts/run-integration-tests.sh 가 export 한 `RLS_TEST_DATABASE_URL=postgresql://app_test_runtime:...@localhost:5432/luckystyle4u_test?options=-c%20TimeZone%3DUTC` 의 `?options=-c%20TimeZone%3DUTC` 부분이 vitest 시점에 빈 문자열로 도착 → tests/messenger/_fixtures.ts 의 `HAS_DB = !!process.env.RLS_TEST_DATABASE_URL` 가 false → `it.skipIf(!fx.hasDb)` 모두 skip.

### Stage 3 (rolldown native binding 부재)
- vitest 5 가 transformer 로 rolldown 사용. rolldown 은 platform-specific native binding (`@rolldown/binding-{platform}-{arch}-{libc}.node`) 을 npm optional dependency 로 install.
- Windows 측 `npm install` 시 npm 은 host platform (Windows x64-msvc) 의 binding 만 install 하고 Linux x64-gnu binding 은 skip — `Cannot find module '@rolldown/binding-linux-x64-gnu'`.
- 이는 npm 의 알려진 issue (https://github.com/npm/cli/issues/4828): optional dependencies 가 lockfile 에 platform 별로 구분 install 되지 않음.

### Stage 4 (성공 경로 — WSL 빌드 미러)
- 본 프로젝트는 `~/dev/ypserver-build/` 에 WSL ext4 네이티브 빌드 미러를 운영 (CLAUDE.md §"운영 환경 및 마이그레이션 정책"). `wsl-build-deploy.sh` 가 매 배포 시 Windows 측 → WSL 측 rsync + `npm ci` 수행 → Linux native modules + `.env.test.local` 모두 정착.
- 이 미러에서 WSL 내부 bash + WSL Linux node + WSL postgres 가 모두 정합 → env interop 경계 0, native binding 정합, postgres 직접 도달.

## 해결

신규 messenger 도메인 라이브 테스트를 추가했을 때, **Windows 측에서 작성 → WSL 빌드 미러에 cp → 거기서 실행** 의 3단계 절차를 사용한다.

```bash
wsl -d Ubuntu -- bash -lc '
  cp /mnt/e/00_develop/260406_luckystyle4u_server/tests/messenger/messages.test.ts \
     ~/dev/ypserver-build/tests/messenger/messages.test.ts
  source ~/.nvm/nvm.sh
  cd ~/dev/ypserver-build
  bash scripts/run-integration-tests.sh tests/messenger/messages.test.ts
'
```

이 절차의 핵심:
1. **변경분만 cp** — 전체 rsync (`wsl-build-deploy.sh`) 는 PM2 deploy 까지 트리거하므로 라이브 테스트만 검증할 때는 과한 작업. 단일 파일 cp 가 충분.
2. **WSL 내부 bash 사용** — env interop 경계 회피. `~/.nvm/nvm.sh` 로 Linux node v24 PATH 활성.
3. **WSL 내부 working dir 사용** — Windows mount (`/mnt/e/...`) 가 아닌 ext4 (`~/dev/ypserver-build/`) — Linux native modules 정합.
4. **scripts/run-integration-tests.sh 그대로 사용** — `.env.test.local` source + URL 조립 + vitest 호출 일관.

다른 messenger 테스트 파일을 변경했을 때도 동일 패턴. 다음 commit 또는 deploy 시점에 `wsl-build-deploy.sh` 가 정상 rsync 로 sync 회복 → 일시 분기 상태 자연 해소.

## 교훈

- **scripts 헤더의 회피책은 환경 가정에 따라 partial**: §19-23 "PowerShell 권장" 은 Windows postgres 가 listen 중일 때만 유효. WSL postgres-only 환경에서는 §24 "WSL 내 Linux Node" 도 추가 함정 (rolldown native binding) 발생. 본 프로젝트는 Stage 4 (빌드 미러) 가 가장 안전.
- **npm optional dependencies 의 platform-specific install 함정**: cross-platform 개발 환경에서 한 OS 에서 install 하고 다른 OS 에서 import 하면 native binding 부재 폭발. 다른 OS 측에서는 별도 `npm install` 또는 미러 빌드 디렉토리 운영이 표준.
- **interop 경계의 보이지 않는 변환**: WSL bash → Windows npx 의 환경변수 전달은 visible 한 escape 보다 더 미묘하게 손실 (URL `?`/`%`). 손실 증상은 "빈 값" 인데 export 단계에서 `echo` 하면 정상으로 보임 → 디버깅 시 child process 가 받는 값을 직접 출력해야 발견.

## 관련 파일

- `scripts/run-integration-tests.sh` — 헤더 §13-24 회피책 명시, 본 사례는 §24 의 추가 함정 (rolldown native binding) 표면화
- `~/dev/ypserver-build/` — WSL ext4 네이티브 빌드 미러 (`wsl-build-deploy.sh` 가 rsync 운영)
- `tests/messenger/_fixtures.ts` — `HAS_DB = !!process.env.RLS_TEST_DATABASE_URL` env-gate 패턴
- `tests/messenger/messages.test.ts` — 본 세션 신규 positive 첨부 테스트 (commit `652ff88`)
- `CLAUDE.md` §"운영 환경 및 마이그레이션 정책" — WSL 빌드 미러 운영 정책
- `memory/feedback_grant_check_for_bypassrls_roles.md` — PR 게이트 #4 라이브 테스트 룰
