---
title: WSL2 외부 호출에서 background 분리 실패 — `setsid + nohup + disown` 모두 SIGHUP
date: 2026-05-04
session: 86
tags: [wsl2, background, sighup, deployment, build, automation]
category: pattern
confidence: high
---

## 동기

S86 메인 후속 chunk 에서 WSL 빌드+배포 (`scripts/wsl-build-deploy.sh`, ~3분) 를 background 로 등록하려 시도. 3중 분리 패턴 모두 SIGHUP 으로 즉시 종료. 단일 foreground 호출이 가장 단순하면서 확실한 패턴으로 표준화.

## 1. 시도 → 결과

### 1.1 1차: 단순 nohup + & + tail

```bash
wsl -d Ubuntu -- bash -lc "nohup bash /mnt/e/.../wsl-build-deploy.sh > /tmp/build.log 2>&1 &"
```

→ 외부 wsl 호출 종료 시점에 child rsync 가 **`received SIGINT, SIGTERM, or SIGHUP (code 20)`** 즉시 종료.

### 1.2 2차: setsid + nohup + disown

```bash
wsl -d Ubuntu -- bash -lc "setsid nohup bash /mnt/e/.../wsl-build-deploy.sh > /tmp/build.log 2>&1 < /dev/null &
disown -a"
```

→ 다음 wsl 외부 호출 (예: `wsl pgrep -f wsl-build-deploy`) 직후 또 SIGHUP. process group 분리 + tty detach + disown 모두 적용에도 살아남지 못함.

### 1.3 3차 (성공): 단일 foreground wsl 호출 + Bash tool timeout

```bash
wsl -d Ubuntu -- bash -lc "bash /mnt/e/.../wsl-build-deploy.sh 2>&1 | tail -80"
# Bash tool timeout: 600000ms (10분)
```

→ 빌드 완료 + 배포 + PM2 restart 통합 ~3분. 출력 마지막 80줄만 회수해 컨텍스트 보호.

## 2. 추정 원인

WSL2 의 HCS (Host Compute Service) 가 **`wsl.exe` 호출마다 새 session/instance 를 생성** → 호출 종료 시 그 session 의 모든 프로세스 (disown 되어도) 에 SIGHUP 발사. WSL1 의 lxss 와 다른 동작.

검증 가설:
- 같은 wsl distro 내에서 systemd-run 으로 service 등록 시는 분리 가능 (별도 검증 필요)
- WSL 외부 → WSL 내부 long-running task 는 instance 수명에 묶임

## 3. 표준 패턴

| 작업 유형 | 패턴 |
|---|---|
| **장시간 작업** (빌드/배포/마이그레이션, 1~10분) | 단일 foreground `wsl ... -- bash -lc "..."` + Bash tool `timeout: 600000` |
| **PM2 데몬화 작업** | WSL 내부 PM2 가 이미 systemd-controlled → wsl 호출 종료 무관 |
| **systemd service** (장기) | WSL 안에서 `sudo systemctl enable --now <service>` (별도 systemd 활성화 필요) |
| **단순 query** (psql, ls 등, 수초) | 단일 foreground 호출이 최적 |

## 4. 안티패턴

- ❌ `wsl ... "nohup ... &"` — child SIGHUP
- ❌ `wsl ... "setsid nohup ... & disown"` — child SIGHUP (다음 wsl 호출 직후)
- ❌ Bash tool `run_in_background: true` 후 `wsl pgrep` 폴링 — 두 wsl 호출이 분리되어 첫 호출이 종료되며 child kill

## 5. 적용 사례

- S86 wsl-build-deploy.sh — 단일 foreground 호출로 [1/8]~[8/8] 통합 ~3분 완주
- 향후 적용: WSL 내부 long-running scrape/migration/import 모두 동일 패턴

## 6. 관련 자산

- `scripts/wsl-build-deploy.sh` — 단일 호출로 8 단계 통합 실행
- `memory/feedback_concurrent_terminal_overlap.md` — 동시 터미널 작업 중복 방지 (Bash tool timeout 결정 시 참고)

## 7. Compound Knowledge 위치

본 패턴은 향후 어떤 자동화 (kdyswarm, 다중 prod 배포, 마이그레이션 자동화 등) 에서도 재발 가능. 메모리 룰로 승격 후보:

```
feedback_wsl2_single_foreground_call.md
- Rule: WSL 외부에서 호출하는 long-running task 는 단일 foreground wsl 호출 + Bash tool timeout 으로 처리. background 분리 (`nohup`, `setsid`, `disown`) 는 SIGHUP 으로 실패.
- Why: WSL2 HCS 가 wsl.exe 호출마다 session 생성 + 종료 시 모든 child SIGHUP.
- How to apply: 빌드/배포/마이그레이션 등 1분+ 작업은 `wsl ... -- bash -lc "..."` 단일 호출 + `timeout: 600000ms` 내 완료.
```
