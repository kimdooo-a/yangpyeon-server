---
title: wsl-build-deploy.sh `[1/8]` sync가 windows측 .env로 build측 .env를 덮어쓴다
date: 2026-05-01
session: 72
tags: [wsl, rsync, env, deployment, multi-env, root-cause]
category: workaround
confidence: high
---

## 문제

신규 운영 환경변수(예: `R2_*` 4개)를 `~/ypserver/.env` + `~/dev/ypserver-build/.env` 두 곳에 추가한 직후 `wsl-build-deploy.sh` 1회 실행 → build측 .env에서 신규 키가 사라짐. 같은 빌드의 PoC 스크립트(`node scripts/r2-poc.mjs`)가 환경변수 누락으로 실패:

```
Error: R2 환경변수 누락
    at file:///home/smart/dev/ypserver-build/scripts/r2-poc.mjs:29:9
```

`grep -nE "^R2_" ~/dev/ypserver-build/.env` → 매칭 0건. `~/ypserver/.env` 는 무사.

## 원인

`wsl-build-deploy.sh` 의 두 rsync 단계가 비대칭으로 설계됨:

| 단계 | 대상 | `/.env` exclude | 결과 |
|------|------|-----------------|------|
| `[1/8]` Windows → WSL build (소스 sync) | `~/dev/ypserver-build/` | **없음** | windows측 .env가 build측 .env를 덮음 |
| `[5/8]` WSL build → ypserver (배포 sync) | `~/ypserver/` | **있음** (`--exclude '/.env'`) | ypserver측 .env 보호됨 |

[1/8]의 의도는 "windows측 코드를 build측으로 동기화" 인데, `.env` 도 같은 디렉토리에 있어 함께 덮임. windows측 `.env` 가 운영 키 결여 상태(개발용 또는 빈 파일)면 build측이 그 상태로 회귀.

[5/8]은 ypserver측 운영 .env를 보호해야 하므로 exclude 명시. [1/8]은 누락된 채 작성됨.

**왜 즉시 표면화되지 않았는가**: standalone 빌드는 런타임 .env가 ypserver측에서만 로드됨 (`PM2 → server.js → ~/ypserver/.env`). build 단계의 .env는 `prisma migrate` 등 빌드 타임 도구만 사용. R2 키는 NEXT_PUBLIC_ 아니라 빌드 산출물에 inline 안 됨 → build측 .env 결여가 빌드 자체는 깨뜨리지 않음. **빌드 디렉토리에서 직접 node 스크립트를 돌렸을 때만 노출됨.**

## 해결

세 가지 경로 중 1번 권장 (1인 운영자 컨텍스트, 메모리 룰 보강 효과 유지):

### 1. windows측 + build측 + ypserver측 3곳 동기화 (운영 정책 — 채택)

```bash
# Windows측 .env (gitignore 됨)
echo "R2_ACCOUNT_ID=..." >> /mnt/e/00_develop/260406_luckystyle4u_server/.env
echo "R2_BUCKET=..." >> /mnt/e/00_develop/260406_luckystyle4u_server/.env

# WSL build측 — 다음 wsl-build-deploy 실행 시 windows측이 덮으니 일관성 확보
echo "R2_ACCOUNT_ID=..." >> ~/dev/ypserver-build/.env

# WSL 운영측 — [5/8] /.env exclude 보호
echo "R2_ACCOUNT_ID=..." >> ~/ypserver/.env
```

장점: 운영 truth source 명시 (windows측 git working tree). 단점: 1키 = 3곳 수동 추가.

### 2. wsl-build-deploy.sh `[1/8]` rsync에 `/.env` exclude 추가 (스크립트 패치)

```diff
 rsync -a --delete \
+  --exclude '/.env' \
   --exclude 'node_modules/' \
   --exclude '.next/' \
   ...
   "$REPO_WIN_PATH/" "$WSL_BUILD_DIR/"
```

장점: build측 .env 독립. 단점: build측 .env가 별도 truth source가 되어 windows측과 분기 가능 (1인 운영 1머신 환경에서는 별 의미 없지만 정책 일관성 손상).

### 3. windows측 .env 만 truth source (build측 .env 제거)

build측에서 `~/dev/ypserver-build/.env -> /mnt/e/.../.env` symlink. 단점: rsync `--delete` 와 충돌 가능 + 다른 머신 운영 시 의존성 폭발.

**채택**: 1번. 운영 키 추가 절차에 "3곳 동기화" 포함. 메모리 룰 `feedback_env_propagation.md` 로 강제.

## 검증

```bash
wsl -- bash -lic '
grep -nE "^R2_" /mnt/e/00_develop/260406_luckystyle4u_server/.env  # windows측
grep -nE "^R2_" ~/dev/ypserver-build/.env                          # build측
grep -nE "^R2_" ~/ypserver/.env                                    # 운영측
'
```

→ 세 곳 모두 매칭 4건 (R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).

`wsl-build-deploy.sh` 1회 실행 후 재검증 → 매칭 유지.

## 교훈

- **build/run 단계 분리된 시스템에서 `.env` 위치 비대칭은 silent 함정**. 빌드는 통과하는데 build dir 직접 실행 시에만 표면화.
- 운영 키 추가는 **반드시 truth source(windows측)에서 시작**. 그러지 않으면 다음 sync에서 회귀.
- rsync `--exclude` 정책은 양방향에서 일관성 검증 필수. 한쪽만 보호하면 다른 쪽이 누설 통로.
- **메모리에 정책으로 등록**해야 향후 신규 키 추가 시점에서 동일 함정 재현 차단 가능 (운영자 1인 + 머신 1대 + 6개월 후 기억 손실 시나리오).

## 관련 파일

- `scripts/wsl-build-deploy.sh` (line 53-65 [1/8] rsync, line 106-110 [5/8] rsync)
- `~/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_env_propagation.md` (메모리 룰)
- `docs/handover/260501-session72-r2-v1-applied.md` §토픽 6 (1차 PoC 실패 진단 과정)
