---
title: Git Bash → WSL 인자 전달 시 자동 PATH 변환 함정 (MSYS_NO_PATHCONV=1)
date: 2026-04-25
session: 53
tags: [git-bash, wsl, msys, path-conversion, interop, devops, claude-code-environment]
category: tooling
confidence: high
---

## 문제

Claude Code의 Bash 도구(Windows에서 Git Bash 위에서 실행)에서 `wsl bash ...` 형태로 WSL 명령을 호출할 때, 인자에 `/` 가 포함되면 Git Bash가 그 인자를 Windows 경로로 자동 변환하여 전달함. 결과는 다음 시그니처들 중 하나:

1. **UNC 경로 충돌**: `wsl bash -lc 'cd ~/ypserver && npx prisma migrate deploy'`
   ```
   '\\wsl.localhost\Ubuntu\home\smart\ypserver'
   현재 디렉터리로 시작하여 CMD.EXE를 시작하였습니다. UNC 경로는 지원하지 않습니다.
   'prisma' is not recognized ...
   ```
   원인: WSL 안에서 npx를 호출했지만 PATH에서 Windows nodejs `/mnt/c/Program Files/nodejs/npx`가 먼저 발견되어 Windows CMD가 받음 → UNC.

2. **PATH 형식 인자가 Windows 경로로 변환**:
   ```bash
   wsl bash -c "PATH=/home/smart/.nvm/versions/node/v24.14.1/bin:/usr/local/bin:/usr/bin:/bin; cd ..."
   # 결과:
   bash: line 1: FilesGithomesmart.nvmversionsnodev24.14.1bin: command not found
   bash: line 1: C:Program: command not found
   bash: cd: homesmartdevypserver-build: No such file or directory
   ```
   원인: Git Bash가 `/home/smart/...:/usr/local/...` 같은 PATH 문자열을 Windows 디렉토리 목록으로 인식해서 슬래시를 제거 + `C:\Program Files\Git`을 prefix로 prepend.

3. **`/mnt/e/...` Windows-mounted 경로가 Git Bash prefix로 변환**:
   ```bash
   wsl bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/_tmp.sh
   # 결과:
   bash: C:/Program Files/Git/mnt/e/00_develop/260406_luckystyle4u_server/scripts/_tmp.sh: No such file or directory
   ```

## 원인

**Git Bash(MSYS2 기반)의 자동 POSIX→Windows 경로 변환** — Git Bash는 native Windows 프로그램(`wsl.exe` 포함)에 인자를 넘길 때 `/`로 시작하는 인자를 Windows 경로 또는 옵션 plus 경로로 추정하고 자동 변환을 시도함. 이는 일반 Unix 프로그램 사용 시는 편리하지만 WSL interop에서는 정반대로 작동 — WSL 측은 그 인자를 Linux 경로 그대로 받아야 하므로 변환된 결과가 무효.

세부 변환 규칙:
- `/foo/bar` → `C:/Program Files/Git/foo/bar` (Git 설치 prefix prepend)
- `/foo:/bar:/baz` → `foobarbaz` (PATH 형식으로 인식하여 슬래시 제거 + Windows backslash 결합)
- single quote 안의 `$VAR`는 유지되지만 `;` 또는 `&&` 다음 명령에서 변수 expansion 가시성이 깨질 수 있음 (관찰: `NVM_DIR=/home/smart/.nvm; . "$NVM_DIR/nvm.sh"` 에서 `$NVM_DIR`가 빈 값으로 평가)

## 해결

**환경 변수 `MSYS_NO_PATHCONV=1` 을 명령 prefix로 박아서 Git Bash의 경로 변환을 비활성화**:

```bash
# ✗ 깨지는 패턴
wsl bash -lc 'cd ~/ypserver && npx prisma migrate deploy'
wsl bash /mnt/e/path/to/script.sh

# ✓ 작동하는 패턴
MSYS_NO_PATHCONV=1 wsl bash -lc 'cd ~/ypserver && npx prisma migrate deploy'
MSYS_NO_PATHCONV=1 wsl bash /mnt/e/path/to/script.sh
```

추가 안전 패턴:

1. **임시 wrapper script를 Windows 측에 작성하고 `/mnt/e/...`로 호출**: heredoc/quoting 이슈를 모두 우회. 본 세션의 `scripts/_tmp_migrate_deploy.sh` 패턴.

   ```typescript
   // Write tool로 작성
   // file_path: E:\path\to\_tmp_wrapper.sh
   // content: 모든 명령을 평범한 bash 스크립트로 작성
   ```
   
   ```bash
   MSYS_NO_PATHCONV=1 wsl bash /mnt/e/path/to/_tmp_wrapper.sh
   ```

2. **wrapper 안에서 nvm 명시적 source**: PowerShell/Git Bash → wsl 경로에서는 `bash -lc`도 nvm 자동 로드를 보장하지 않음. wrapper 내부에서 절대 경로로 source:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   export NVM_DIR="/home/smart/.nvm"
   . "$NVM_DIR/nvm.sh"
   # 이후 npm/node/npx 정상 동작
   ```

3. **결과 검증 시점**: `which node`로 PATH 우선순위가 nvm 측인지 확인 (`/mnt/c/Program Files/nodejs/npx`가 먼저 잡히면 Windows nodejs 경유 → UNC 충돌 재발).

## 교훈

- Claude Code가 Windows에서 동작할 때 Bash 도구는 Git Bash이며, **WSL을 호출할 때 MSYS의 자동 경로 변환이 보안/유틸리티 의도와 정반대로 작동**한다. 한 번 막히면 quoting을 아무리 다듬어도 같은 에러가 반복되므로, **wsl 호출 명령에 `MSYS_NO_PATHCONV=1` 을 디폴트로 prefix하는 것이 가장 비용이 낮은 회피책**이다.
- 시행착오 4회의 비용을 줄이는 휴리스틱: WSL 명령이 처음 실패하면 `MSYS_NO_PATHCONV=1` 추가, 그래도 안되면 즉시 Windows 측에 wrapper script를 Write로 작성 후 `MSYS_NO_PATHCONV=1 wsl bash /mnt/...` 호출 패턴으로 전환. quoting 디버깅에 더 시간 쓰지 말 것.
- nvm 환경은 `bash -lc`로도 자동 로드되지 않을 수 있다 — wrapper 내부에서 명시적으로 source.

## 관련 파일

- `scripts/wsl-build-deploy.sh` (세션 52) — `MSYS_NO_PATHCONV=1 wsl bash -c "bash /mnt/e/.../scripts/wsl-build-deploy.sh"` 호출 패턴 정착
- `scripts/_tmp_migrate_deploy.sh` (세션 53 임시) — wrapper 패턴 사례 (실행 후 삭제)
- `docs/handover/260425-session53-priority-0-2-cascade.md` — 본 세션 §토픽 7 (본 터미널 후속 실행)
