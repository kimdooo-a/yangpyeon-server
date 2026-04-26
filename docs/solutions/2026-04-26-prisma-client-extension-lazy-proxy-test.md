---
title: Prisma Client Extension의 모듈-load 시점 $extends 호출과 vi.mock 충돌 — lazy Proxy 패턴
date: 2026-04-26
session: 61
tags: [prisma, prisma-extension, vitest, vi.mock, proxy, multi-tenant, rls]
category: pattern
confidence: high
---

## 문제

T1.4 (RLS Stage 3) 통합 단계에서 `vi.mock("@/lib/prisma")` 를 사용하는 테스트 1건이 새 Prisma Extension 도입으로 일괄 실패:

```typescript
// src/lib/api-guard-tenant.test.ts (Phase 1.2 T1.2 도입)
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
```

```
TypeError: prisma.$extends is not a function
 ❯ src/lib/db/prisma-tenant-client.ts:70
   export const prismaWithTenant = (basePrisma as PrismaClient).$extends({...});
```

증상: 테스트 파일 자체에서 `prismaWithTenant` 를 직접 import 하지 않더라도, `api-guard-tenant.ts` 가 `re-export { prismaWithTenant } from "@/lib/db/prisma-tenant-client"` 를 추가하면서 모듈 그래프상 import 가 발생 → `prisma-tenant-client.ts` module-load 시점에 `(basePrisma).$extends(...)` 즉시 호출 → mock 객체에 `$extends` 부재로 TypeError.

## 원인

Prisma Client Extension의 권장 패턴 (ADR-023 §5.2):

```typescript
import { prisma as basePrisma } from "@/lib/prisma";

// 모듈-load 시점에 즉시 호출 — 정상 환경에서는 OK
export const prismaWithTenant = basePrisma.$extends({...});
```

이 패턴은 *실제* PrismaClient 가 import 되었을 때만 작동. `vi.mock` 으로 mock 객체로 대체된 환경에서는 mock이 `$extends` 를 가지지 않으므로 module evaluation 단계에서 실패.

`vi.mock` 을 모든 테스트에 일괄 추가하여 mock에 `$extends: vi.fn().mockReturnThis()` 를 포함시키면 해결되지만:
- 모든 테스트 mock 시그니처를 변경하는 거대 sweep 필요
- 향후 새 테스트 작성 시 매번 mock에 `$extends` 추가 잊기 쉬움
- mock fidelity 가 낮음 ($extends 의 실제 chain semantics 미반영)

## 해결

`prismaWithTenant` 를 lazy Proxy로 wrap — `$extends` 호출을 첫 property 접근 시점까지 지연. 기존 `src/lib/prisma.ts` 의 lazy proxy 패턴과 일관:

```typescript
// src/lib/db/prisma-tenant-client.ts
import { prisma as basePrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

let _extendedClient: ReturnType<PrismaClient["$extends"]> | null = null;
function getExtendedClient() {
  if (!_extendedClient) {
    _extendedClient = (basePrisma as PrismaClient).$extends({
      name: "tenant-rls",
      query: {
        $allOperations: async (params) => { /* SET LOCAL app.tenant_id */ },
      },
    });
  }
  return _extendedClient;
}

// 타깃을 PrismaClient 로 캐스트 — typed surface 유지 (test 의 prismaWithTenant.user.findMany() 도 typed).
export const prismaWithTenant = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getExtendedClient() as any, prop);
  },
});
```

핵심 포인트:
1. **모듈-load 시점에는 Proxy 생성만** — `$extends` 미호출
2. **첫 property 접근 시 lazy init** — `prismaWithTenant.user.findMany()` 가 첫 접근이면 그 시점에 `$extends` 호출 + 캐싱
3. **타깃을 `{} as PrismaClient`** — TypeScript 가 `prismaWithTenant.user`, `prismaWithTenant.$executeRawUnsafe` 등을 typed로 인식 (Proxy의 빈 타깃은 type-only 마커)
4. **vi.mock 호환** — 테스트가 prismaWithTenant 를 직접 사용하지 않으면 lazy init 미트리거 → mock 객체의 $extends 부재가 무관해짐

## 부수 발견 — vitest path alias 서브패스 누락

Prisma Extension 모듈이 `@yangpyeon/core/tenant/context` 를 import 할 때 vitest 가 미해결:

```typescript
// vitest.config.ts (수정 전)
resolve: {
  alias: {
    "@": resolve(__dirname, "./src"),
    "@yangpyeon/core": resolve(__dirname, "./packages/core/src/index.ts"),
    // ↑ bare-name만 매칭 → @yangpyeon/core/tenant/context 미해결
  },
},
```

해결 — array form + regex wildcard 우선:

```typescript
resolve: {
  alias: [
    { find: "@", replacement: resolve(__dirname, "./src") },
    { find: /^@yangpyeon\/core\/(.*)$/, replacement: resolve(__dirname, "./packages/core/src") + "/$1" },
    { find: "@yangpyeon/core", replacement: resolve(__dirname, "./packages/core/src/index.ts") },
  ],
},
```

`tsconfig.json` 의 `paths` 는 wildcard `@yangpyeon/core/*` 가 정의되어 있으나 vitest는 자체 alias 설정이 별도 필요 — 두 곳을 항상 동기화.

## 교훈

- Prisma Client Extension 을 모듈-load 시점에 호출하는 코드는 `vi.mock` 적용 테스트 환경에서 fragile. lazy Proxy 패턴이 default.
- 이미 `src/lib/prisma.ts` 가 lazy Proxy 를 쓰고 있다면 wrap 모듈도 동일 패턴 적용 — 일관성 + 테스트 안전성.
- TypeScript Proxy의 타깃 타입은 Proxy 의 typed surface 결정 — `{} as PrismaClient` 패턴이 type-only 마커로 충분.
- 새 path alias 추가 시 `tsconfig.json` 과 `vitest.config.ts` 양쪽 동시 갱신 — wildcard 서브패스 매칭은 vitest 에서 array form + regex 가 표준.

## 관련 파일

- `src/lib/db/prisma-tenant-client.ts:70` (lazy Proxy 적용 위치)
- `src/lib/prisma.ts` (기존 lazy proxy 패턴 — 참조 모델)
- `src/lib/api-guard-tenant.ts:225-230` (re-export 트리거)
- `src/lib/api-guard-tenant.test.ts:18-23` (vi.mock 적용 위치)
- `vitest.config.ts:5-13` (alias array form)
- `tsconfig.json` `paths.@yangpyeon/core/*` (정합 대상)
- `docs/research/baas-foundation/04-architecture-wave/01-architecture/02-adr-023-impl-spec.md` §5.2 (Extension 권장 패턴)
