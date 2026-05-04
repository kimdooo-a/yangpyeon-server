---
title: tsx CLI script — .env 자동 로드 안 함, PowerShell `$env:DATABASE_URL` 우회 패턴
date: 2026-05-04
session: 86
tags: [tsx, dotenv, environment, powershell, scripts]
category: pattern
confidence: high
---

## 동기

S86 메인 후속 chunk 에서 `npx tsx scripts/b8-runnow.ts almanac-cleanup` 실행 시 `DATABASE_URL` 미설정 에러. tsx 가 `.env` 자동 로드 안 함을 확인하고 PowerShell 환경변수 export 패턴으로 우회.

## 1. 증상

```powershell
> npx tsx scripts/b8-runnow.ts almanac-cleanup
PrismaClientInitializationError: 
Invalid `prisma.cronJob.findMany()` invocation:
error: Environment variable not found: DATABASE_URL.
```

`.env` 에 `DATABASE_URL` 명시되어 있음에도 발생.

## 2. 원인

`tsx` 는 TypeScript 실행기 (esbuild + node) — Node.js 본연의 환경변수 자동 로드 없음. Next.js 가 dev 시 `.env`/`.env.local` 자동 로드하는 건 Next.js framework 가 추가한 기능 (dotenv-flow). tsx CLI 단독 실행은 plain node 와 동일.

## 3. 우회 패턴

### 3.1 PowerShell — 1회성 export

```powershell
$env:DATABASE_URL = (Get-Content .env | Select-String '^DATABASE_URL=').ToString() -replace '^DATABASE_URL="?', '' -replace '"$', ''
npx tsx scripts/b8-runnow.ts almanac-cleanup
```

특정 키만 export. 한 줄 안에 처리 가능.

### 3.2 PowerShell — 다중 키 export (.env 전체)

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#=][^=]*)=(.*)$') {
    $env:($matches[1]) = $matches[2] -replace '^"', '' -replace '"$', ''
  }
}
npx tsx scripts/<script>.ts
```

여러 키 의존 스크립트.

### 3.3 dotenv-cli (devDep 도입)

```bash
npm i -D dotenv-cli
npx dotenv -e .env -- tsx scripts/b8-runnow.ts almanac-cleanup
```

장점: 한 번 설치 후 어떤 스크립트든 동일 패턴. 단점: deps +1, dev only.

### 3.4 tsx 자체 dotenv 통합 (스크립트 내부)

```ts
// scripts/b8-runnow.ts 첫 줄
import "dotenv/config";  // dotenv 가 이미 prisma 의존성으로 설치됨
```

장점: 외부 패키지 추가 불필요 (dotenv 는 prisma 내부 의존성). 단점: 스크립트마다 추가 필요.

## 4. 권고

| 상황 | 권고 |
|---|---|
| **1~2회성 ad-hoc 실행** | 3.1 PowerShell 1줄 export |
| **자주 실행하는 ops 스크립트** | 3.4 `import "dotenv/config"` 추가 |
| **CI/CD + 다중 환경** | 3.3 dotenv-cli (`-e .env.test` 등 명시적 분리) |

## 5. 함정

- ❌ **`bash` 의 `source .env` 패턴은 PowerShell 미작동** — `source` 는 bash builtin
- ❌ `.env` 의 quote (`KEY="value"`) 처리 누락 시 quote 문자 포함된 값 export
- ❌ `.env.local` 만 있고 `.env` 가 없으면 위 PowerShell 패턴 fail (Get-Content `.env` 가 NotFound throw)
- ❌ `WSL → wsl --` 통과 시 PowerShell `$env:` 가 WSL 안에 propagate 안 됨 (S82 메모) → bash 측에서 별도 export 필요

## 6. memory 룰 후보

```
feedback_tsx_no_dotenv_autoload.md
- Rule: `npx tsx <script>` 는 .env 자동 로드 안 함. ad-hoc 실행은 PowerShell `$env:` export, 자주 쓰는 스크립트는 `import "dotenv/config"` 첫 줄.
- Why: tsx = plain node + esbuild, framework (Next.js) 가 추가하는 dotenv 자동 로드 없음.
- How to apply: 신규 ops 스크립트 작성 시 첫 줄 `import "dotenv/config";` 추가하면 사용자 실수 자동 차단.
```

## 7. 관련 자산

- `scripts/b8-runnow.ts`, `scripts/b8-check.ts`, `scripts/b8-list.ts` 등 모두 영향 범위
- `memory/feedback_no_secret_defaults_in_scripts.md` (env-only 강제 룰) 와 동행 — fallback default 금지 + .env 자동 로드 명시 → 시크릿이 코드/기본값에 들어가지 않음을 보장
