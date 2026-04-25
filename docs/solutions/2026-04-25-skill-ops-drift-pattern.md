---
title: 글로벌 스킬 vs 운영 진화 drift — 사용자 직감 트리거와 갱신-우선 배포 순서
date: 2026-04-25
session: 55
tags: [claude-code-skill, ops-drift, deployment, defense-in-depth, user-instinct]
category: pattern
confidence: high
---

## 문제

Claude Code의 **글로벌 스킬**(`~/.claude/skills/<name>/SKILL.md`)은 한 번 작성되면 운영 변경을 자동으로 따라가지 않는다. 본 세션(55)에서 발견된 케이스:

- `ypserver` 스킬 v1: 세션 31 시점 가정으로 작성 — `WSL_DEPLOY=~/dashboard`, `PM2_NAME=dashboard`, Phase 1 Windows `next build`, Phase 2 수기 6단계
- 운영 진화 (세션 50~52, 6일간):
  - 세션 50: Next.js standalone 재도입, `pack-standalone.sh` 생성, 배포 경로 `~/dashboard` → `~/ypserver`
  - 세션 52: NFT cross-platform 함정 진단(Windows 빌드의 `.next/node_modules/<hash>/`에 Windows DLL 번들 → Linux dlopen 실패), `wsl-build-deploy.sh` 단일 파이프라인 신설, PM2 시작 모드를 `pm2 start npm` → `pm2 start ecosystem.config.cjs`(standalone)로 전환
- **결과**: 스킬과 운영이 6일간 분기. 사용자 직감(`"지난 세션에서 wsl 관련 문제로..."`)이 없었다면 v1 그대로 호출 시 사고:
  - Phase 1 Windows next build → NFT 함정으로 부적합(빌드 자체는 성공해도 산출물이 Linux에서 dlopen 실패)
  - Phase 2 성공해도 `~/dashboard`에 별도 배포 → 포트 3000 충돌(`ypserver`가 점유 중) → 듀얼 디플로이
  - `install-native-linux.sh` 미호출 → ELF 회귀 위험
  - PM2에 `dashboard` 신규 등록되며 운영의 `ypserver`와 무관한 좀비 프로세스 생성

## 원인

### 1. 글로벌 스킬은 단일 진실 소스가 아님

스킬 본문은 *"작성 시점의 운영 가정"*을 코드화한다. 운영이 진화하면 스킬은 자동으로 stale해지지만, 다음 호출자(에이전트 또는 사용자) 입장에선 그 stale함이 *시각적으로 보이지 않는다*. CLAUDE.md / 핸드오버 / 메모리는 모두 갱신됐는데 스킬만 옛 가정을 들고 있는 비대칭 상태.

### 2. 메모리만으로는 신호가 약함

본 케이스에서 `project_standalone_reversal.md` 메모리(2026-04-19)가 단서를 제공했지만 그 자체로는 *"스킬도 갱신됐을 거다"*라는 추론을 강제하지 못함. 결정적인 건 사용자의 경험적 회상("지난 세션에서 wsl 관련 문제로 wsl에서의 서버 실행을 진행했던것 같은데"). **메모리는 사실의 정적 스냅샷**이지만, **사용자 직감은 그 사실의 *함의*에 대한 동적 신호**.

### 3. 스킬은 자기 갱신 트리거가 없음

운영 변경(예: 배포 스크립트 신설, 경로 이동, 프로세스명 변경)이 일어났을 때 *"이 변경이 어떤 스킬을 stale하게 만드는가"*를 자동 검증하는 메커니즘이 부재. 핸드오버에 "이월" 항목으로도 명시되지 않음.

## 해결

### 즉시 해결 — 갱신-우선 배포 순서

```
1. 스킬 호출 직후 인터럽트 (사용자 직감 또는 메모리 단서)
2. 핸드오버 N개 정독 (최근 운영 변경 확인)
3. 스킬 본문 vs 운영 산출물(스크립트/메모리/핸드오버) 매칭
4. 분기 발견 시 스킬 전면 리팩터
5. 갱신된 스킬로 정식 배포 (갱신이 자연 검증됨)
```

본 세션 적용 — `~/.claude/skills/ypserver/SKILL.md` v1 → v2:
- 경로/이름 일괄 갱신 (`~/dashboard` → `~/ypserver`, `dashboard` → `ypserver`)
- Phase 1 Windows next build **삭제** (NFT cross-platform 함정으로 근본 부적합 — 옵션화 가치 없음. v1의 `--skip-win-build` 패턴은 진단 전 worldview의 잔재)
- Phase 2 수기 6단계 → `scripts/wsl-build-deploy.sh` 단일 호출 위임
- `pm2 start npm -- start` → `pm2 start ecosystem.config.cjs` (standalone)
- 인수 신설 `--migrate` (prisma deploy) / `--quick` (rsync·npm ci 스킵)
- 회귀 탐지 시그니처 추가 (`ERR_DLOPEN_FAILED`, `PrismaClientInitializationError`, `EADDRINUSE`)
- §4 PM2 safeguard 보존 (세션 30 사고 가드, 프로세스명만 갱신)
- 변경 이력 섹션 신설 (v1 vs v2)

### Drift 진단 3단계 절차 (재사용 가능)

스킬 호출 직전 의심이 들거나 사용자 직감 신호가 있을 때:

1. **핸드오버 정독**: 직전 N개 핸드오버(N=호출 빈도에 따라 3~7) 작업 요약 확인. 스킬 영역(배포/CI/DB 등)과 직접 관련된 변경 여부.
2. **메모리 vs 스킬 가정 비교**: `~/.claude/projects/<project>/memory/` 모든 `*.md` 읽고 스킬 frontmatter `description` + 본문 `## 고정 경로` 같은 가정 섹션과 충돌 여부.
3. **운영 산출물과 스킬 매칭**: `scripts/`, `package.json`의 `scripts`, `Makefile`, `ecosystem.config.*` 같은 운영 진실 소스가 스킬 본문에 인용되어 있는지. 인용이 stale하면 분기 신호.

### 방어적 갱신 트리거

운영 변경 PR/커밋 시 *"이 변경이 영향 줄 글로벌 스킬"* 1줄 체크리스트를 핸드오버 §이월 또는 커밋 메시지에 명시:
```
운영 영향: ~/.claude/skills/ypserver/SKILL.md (경로/PM2명 갱신 필요)
```

다음 세션 시작 시 이 줄이 보이면 스킬 갱신을 선제로 처리.

## 교훈

1. **사용자 직감 > 메모리 > 스킬**: 우선순위 신호. 메모리가 단서를 주지만 사용자의 경험적 회상이 그 단서의 함의를 *행동 가능한 결론*으로 전환.
2. **글로벌 스킬은 코드처럼 버전 관리해야**: 스킬 본문에 변경 이력 섹션을 두고, 운영 변경 시 스킬도 함께 갱신하는 습관. 본 세션의 SKILL.md v2에 변경 이력 섹션을 처음 도입.
3. **Worldview 잔재 옵션은 위험**: `--skip-win-build`처럼 *"문제를 옵션으로 우회"*하는 패턴은 후속 세션에서 다시 활성화될 위험. 근본 부적합으로 판명되면 옵션이 아니라 *완전 삭제*.
4. **갱신-우선 배포 순서는 자연 검증을 부른다**: 스킬 갱신 → 갱신된 스킬로 운용 → 갱신이 정식 배포에서 즉시 검증. 갱신 후 별도 검증 단계가 불필요.
5. **이 패턴은 ypserver만의 문제가 아님**: 같은 drift 가능성이 `kdyship`, `kdydeploy`, `kdycicd` 등 운영 의존 글로벌 스킬에 잠재. 본 CK는 일반화 패턴이며 후속 세션에서 다른 스킬 audit 시 재참조.

## 관련 파일

- `~/.claude/skills/ypserver/SKILL.md` (v1 → v2 전면 리팩터, 본 CK의 적용 사례)
- `~/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/project_standalone_reversal.md` (메모리 단서 사례)
- `docs/handover/260425-session52-wsl-build-pipeline.md` (운영 진화 직전 세션 — 스킬 갱신 트리거였어야 함)
- `docs/handover/260425-session55-ypserver-skill-v2-deploy.md` (본 CK가 적용된 세션)
- `scripts/wsl-build-deploy.sh` (운영 진실 소스 — v2 스킬이 위임하는 단일 명령 파이프라인)
- `docs/solutions/2026-04-25-nft-native-binary-platform-mismatch.md` (CK-36, 본 drift를 유발한 운영 진화의 근본 원인)
