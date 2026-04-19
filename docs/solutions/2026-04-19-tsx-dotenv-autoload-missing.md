---
title: tsx 는 .env 를 자동 로드하지 않는다 — set -a; source .env 패턴
date: 2026-04-19
session: 48
tags: [tsx, dotenv, env, migration-script, wsl, node]
category: pattern
confidence: high
---

## 문제

WSL 에서 `npx tsx scripts/migrate-env-to-vault.ts` 실행 시:

```json
{"error":"MASTER_KEY file not found at /etc/luckystyle4u/secrets.env: ENOENT ..."}
```

스크립트 코드는 `const keyPath = process.env.MASTER_KEY_PATH ?? "/etc/luckystyle4u/secrets.env";` 로, `.env` 에 `MASTER_KEY_PATH=/home/smart/.luckystyle4u/secrets.env` 가 있는데도 **기본 경로**로 fallback 해서 파일을 찾지 못했다.

## 원인

`tsx` (esbuild 기반 TS 런타임) 는 Next.js / Prisma 와 달리 **`.env` 를 자동 로드하지 않는다**. tsx 는 단순 TS → JS 실행기일 뿐 dotenv 통합이 없다.

- Next.js: `next dev` / `next start` 가 framework 수준에서 `.env` 자동 로드
- Prisma: `prisma.config.ts` 에 `import "dotenv/config"` 로 명시 로드
- tsx: 아무 자동 로드 없음 — 순수 Node runtime 확장만

그래서 `npx tsx` 로 실행되는 일회성 스크립트는 `.env` 값을 전혀 보지 못한다.

## 해결

3가지 옵션, 상황별 선택:

### (A) bash export 패턴 — 즉시 사용, 스크립트 수정 불필요 ⭐ 권장

```bash
cd ~/dashboard
set -a
source .env
set +a
npx tsx scripts/migrate-env-to-vault.ts
```

`set -a` = 이후 정의된 모든 변수를 자동 export (환경변수로 승격). `source .env` 가 `KEY=VALUE` 형태를 읽어 shell 변수로 정의 → `set -a` 덕분에 그대로 export → 자식 프로세스(`tsx`)가 env 로 볼 수 있음. 완료 후 `set +a` 로 해제.

**장점**: 스크립트 소스 무수정 / 멱등 / 여러 스크립트 연속 실행 가능 / `.env` 를 소스 컨트롤 밖에 두는 정책과 일관.

### (B) Node `--env-file` 플래그 — Node 20+

```bash
node --env-file=.env --import tsx scripts/migrate-env-to-vault.ts
```

Node 20 의 공식 `--env-file` 플래그 사용. 단, `npx tsx` 단축 형식에서는 바로 안 먹히므로 `node --import tsx` 형태로 풀어야 함. 가독성이 낮음.

### (C) 스크립트에 `import "dotenv/config"` 명시

```typescript
// scripts/migrate-env-to-vault.ts 최상단
import "dotenv/config";
```

장점: 실행 커맨드 단순화. 단점: `dotenv` 가 devDep 이어야 하고, 스크립트가 `.env` 경로 가정을 내부에 가짐.

프로젝트 상황: `dotenv` 는 이미 devDep (prisma.config.ts 경유 설치). 추가 부담 없음. 다만 이미 작성된 스크립트 수정 번거로움이 있어 현재는 (A) 패턴으로 처리.

## 교훈

- tsx/ts-node 등 TS 런타임은 framework 가 아니므로 `.env` 자동 로드 없음 — 배포 스크립트 작성 시 **첫 줄에 `import "dotenv/config"`** 습관화 권장.
- 운영 스크립트가 환경변수에 의존할 때, **스크립트 단독 실행 path 를 문서화** 필수 (사용법에 `set -a; source .env; set +a;` 또는 `NODE_OPTIONS="--env-file=.env"` 명시).
- Next.js 가 자동 로드한다고 해서 tsx 도 로드할 거라 가정하지 말 것 — framework 의존 기능과 런타임 기능을 혼동하면 배포 시점에 드러나는 실패 발생.

## 관련 파일

- `scripts/migrate-env-to-vault.ts` (세션 48 Task 48-4 산출물)
- 유사 리스크 있는 일회성 TS 스크립트들:
  - `scripts/session43-parsing-repro.ts`
  - `scripts/session45-active-sessions.cjs` (cjs — 별도)

## 관련 세션

- 세션 48 (2026-04-19): Phase 16a Vault 배포 시 초기 실패 → (A) 패턴으로 해결.
