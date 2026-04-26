---
title: pnpm-workspace 환경에서 node_modules/@prisma/client/ 빈 디렉토리화
date: 2026-04-26
session: 61
tags: [prisma, pnpm-workspace, node_modules, hoisting, vitest]
category: bug-fix
confidence: medium
---

## 문제

세션 60(`d24ea37`)에서 pnpm-workspace.yaml + turbo.json + packages/core/ 골격을 추가한 후 (npm 빌드 호환 보존), 세션 61 통합 단계에서 vitest 5개 파일 일괄 실패:

```
Cannot find package '@prisma/client/runtime/client' imported from
src/generated/prisma/internal/class.ts:14:1
```

증상:
- `npx tsc --noEmit` → 41 errors (Prisma 7 generated client의 외부 import 미해결)
- `npx vitest run` → 5 test files failed (worker-pool, audit-metrics 등 prisma 의존)
- `npm run build` → 동일 오류
- `find` 결과: `standalone/node_modules/@prisma/client/runtime/client.js` 정상 존재 / 메인 `node_modules/@prisma/client/` 빈 디렉토리 (`.` `..` 만)
- `mtime`: `Apr 26 12:01` (당일 — 트리거 미파악)
- 베이스라인 commit `6c9f631` 에서도 동일 41 errors → T1.4 회귀가 아닌 환경 이슈

## 원인

pnpm-workspace 도입 후 npm/pnpm 패키지 매니저가 동시 사용되는 환경에서 메인 `node_modules/@prisma/client/` 디렉토리가 빈 상태로 남는 호이스팅 잔재. 정확한 트리거 미파악(가능 후보: pnpm dedupe / standalone 패킹 / 다른 작업의 부수 효과).

Prisma 7의 새 generated client (`provider = "prisma-client"`, output `src/generated/prisma`)는 import 경로 `@prisma/client/runtime/client` 를 사용한다 — 이 파일은 `node_modules/@prisma/client/runtime/client.{js,mjs,d.ts}` 에 있어야 한다. 빈 디렉토리면 module resolution 실패.

`standalone/node_modules` 하위에는 Next.js standalone 빌드 산출물의 일부로 정상 존재 — 빌드 산출물에 한정된 파일 손실이며, 메인 dev 환경만 영향.

## 해결

```bash
# 1. 빈 디렉토리 확인
ls -la node_modules/@prisma/client/
# total 8
# drwxr-xr-x ... .
# drwxr-xr-x ... ..

# 2. 다른 곳에 정상 존재하는지 비교
find . -path "*/node_modules/@prisma/client/runtime/client*" 2>/dev/null

# 3. 복구
npm install --no-audit --no-fund --silent

# 4. Prisma client 재생성
npx prisma generate

# 5. 검증
ls node_modules/@prisma/client/runtime/  # client.{js,mjs,d.ts} 존재
npx tsc --noEmit                          # 0 errors
npx vitest run                            # 모든 파일 통과
```

## 교훈

- pnpm-workspace 도입 환경에서는 `node_modules` 디렉토리 *수* 만으로 정상 여부 판단 불가 — 디렉토리는 존재하지만 비어있을 수 있음.
- T0.2 (incremental monorepo) 후 검증 절차에 `ls node_modules/@prisma/client/runtime/` 1줄 추가 필요. 향후 worker-pool/audit-metrics 등 Prisma 의존 vitest가 실패 시 1차 진단 포인트.
- 재발 시 `npm install` 1회로 즉시 복구 — 데이터 손실 없음.
- 워크트리 격리 환경 (`.claude/worktrees/agent-*/node_modules`)에도 동일 문제 발생 가능 — agent dispatch 시 environment 검증 단계 포함 권장.

## 관련 파일

- `node_modules/@prisma/client/` (재발 시 점검)
- `package.json` `@prisma/client@^7.6.0`
- `pnpm-workspace.yaml` (T0.2 도입)
- `prisma.config.ts` (Prisma 7 설정)
- `src/generated/prisma/internal/class.ts:14` (의존 import)
