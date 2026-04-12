---
title: Turbopack NFT "Encountered unexpected file" — 동적 fs 라우트의 구조적 한계
date: 2026-04-12
session: 19
tags: [turbopack, nextjs, nft, file-tracing, cosmetic-warning, backup]
category: workaround
confidence: high
---

## 문제

Next.js 16 Turbopack 빌드 시 다음 경고가 발생하며 `outputFileTracingExcludes` / `/*turbopackIgnore: true*/` 주석 / 동적 import 모든 시도가 실패한다:

```
Turbopack build encountered 1 warnings:
Encountered unexpected file in NFT list
A file was traced that indicates that the whole project was traced unintentionally.
Import trace:
  App Route:
    ./next.config.ts
    ./src/lib/backup/pgdump.ts
    ./src/app/api/v1/backups/route.ts
```

빌드는 성공하고 런타임도 정상이지만 경고 출력이 남는다.

## 원인

Turbopack의 NFT(Node File Tracing) 정적 분석은 다음을 "프로젝트 전체 트레이스 필요" 신호로 간주한다:
- `fs.readdir`, `fs.mkdir`, `fs.stat`, `path.join(..., userInput)` 등 동적 파일시스템 연산
- `spawn(bin)` 처럼 바이너리 경로가 정적으로 특정 불가한 호출
- `process.cwd()` 기반 경로 조립

DB 백업(`pg_dump` 스폰 + 디렉터리 순회 + 가변 파일명 `.sql.gz` 생성)은 이 세 요소를 **모두 동시에** 갖는다 — 이는 Turbopack NFT가 애초에 안전하게 tree-shake할 수 없는 경계이며, 아래 우회책이 모두 실패한다:

| 시도 | 결과 | 이유 |
|---|---|---|
| `/*turbopackIgnore: true*/ process.cwd()` | ❌ | process.cwd() 하나를 억제해도 나머지 fs 호출이 여전히 트레이스 유발 |
| `paths.ts`로 경량 유틸 분리 | ⚠️ 부분 성공 | paths.ts만 import하는 라우트(download)는 범위 축소. 실제 fs 수행 라우트(list/create)는 여전 |
| 동적 `await import("pgdump")` | ❌ | Turbopack이 청크로 flatten하여 결국 정적 트레이스 대상에 포함 |
| `bundler: 'webpack'` | 미시도 | 작동은 하나 Turbopack 이점(HMR/빌드 속도) 포기 — 과도 |

## 해결

**Cosmetic 경고로 수용한다.** 단, 번들 크기는 `outputFileTracingExcludes`로 정리한다:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // 백업 라우트에서 pg_dump 바이너리/Prisma 엔진을 번들에서 제외
  // (NFT cosmetic 경고는 잔존 — Turbopack이 동적 fs 연산을 보수적으로 추적하는 구조적 한계)
  outputFileTracingExcludes: {
    "/api/v1/backups": ["**/pg_dump*", "**/node_modules/@prisma/engines/**"],
    "/api/v1/backups/[filename]/download": ["**/pg_dump*"],
  },
};
```

**경량 유틸 분리**로 읽기 전용 라우트는 경고 범위에서 제외:

```ts
// src/lib/backup/paths.ts — fs/spawn 전혀 import 안 함
import path from "node:path";

export function getBackupsDir(): string {
  return path.resolve(process.cwd(), "backups");
}
export function sanitizeBackupFilename(name: string): string | null { ... }
```

```ts
// download/route.ts — paths.ts만 import (NFT 경고 미발생)
import { getBackupsDir, sanitizeBackupFilename } from "@/lib/backup/paths";
```

```ts
// pgdump.ts — 실제 무거운 작업. paths.ts 재노출로 기존 import 경로 호환
export { getBackupsDir, sanitizeBackupFilename } from "./paths";
```

## 교훈

- Turbopack NFT 경고는 "확인 권유" 메시지이며 빌드/런타임을 차단하지 않는다. 우회가 불가능한 경우 `outputFileTracingExcludes`로 번들만 정리하고 수용한다.
- 동적 fs 연산이 필요한 모듈은 **경량 read-only 유틸 레이어와 heavy write 레이어를 물리적으로 분리**하면 경고 범위를 축소할 수 있다.
- `turbopackIgnore` 주석은 **하나의 호출 지점**만 억제한다. 모듈 전체를 트레이스에서 제외하는 플래그는 아님.

## 관련 파일

- `next.config.ts` — outputFileTracingExcludes
- `src/lib/backup/paths.ts` — 경량 유틸
- `src/lib/backup/pgdump.ts` — 실제 백업 작업
- `src/app/api/v1/backups/route.ts` — list/create
- `src/app/api/v1/backups/[filename]/download/route.ts` — 다운로드
- Next.js 공식: https://nextjs.org/docs/app/api-reference/config/next-config-js/output#outputfiletracingexcludes
