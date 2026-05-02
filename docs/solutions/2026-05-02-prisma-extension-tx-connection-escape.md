---
title: Prisma extension 의 query(args) 가 $transaction connection 으로 escape — RLS SET LOCAL 무효화
date: 2026-05-02
session: 82
tags: [prisma, prisma-extension, rls, transaction, set-local, postgres, tenant-isolation]
category: bug-fix
confidence: high
---

## 문제

Prisma client extension 의 `$allOperations` 콜백 내부에서 `basePrisma.$transaction(async tx => { tx.$executeRawUnsafe('SET LOCAL app.tenant_id = ...'); return query(args); })` 패턴 사용 시:

- 운영 환경 (postgres BYPASSRLS superuser) — 외관상 정상 동작 (RLS 우회)
- 테스트 환경 (`app_test_runtime` 비-bypass role + RLS 활성) — 모든 SELECT 가 0 rows 반환, INSERT/UPDATE 도 RLS 정책 위반 시 실패

증상 예시:
```
expected [] to have a length of 5 but got +0
expected [] to have a length of 1 but got +0
```

admin pool (raw pg) 로 INSERT 한 row 가 동일 tenant_id context 에서 Prisma 로 read 시 0 rows.

## 원인

Prisma extension API 의 `params.query(args)` 콜백은 우리가 연 `$transaction` 의 tx connection 을 **사용하지 않고** base client 의 새 connection 으로 escape 한다. 결과:

1. `tx.$executeRawUnsafe('SET LOCAL app.tenant_id = X')` — connection A 에 적용
2. `query(args)` — connection B 에서 실행 (SET LOCAL 적용 안 됨)
3. RLS 정책 `USING (tenant_id = current_setting('app.tenant_id')::uuid)` — connection B 의 GUC 가 NULL/empty → 모든 row 차단

prod 가 `postgres` superuser (BYPASSRLS=t) 사용 시 RLS 자체가 무시되어 SET LOCAL 무효 여부와 무관하게 모든 row 반환 → **버그 가시화 안 됨**. 다중 테넌트 격리는 Prisma 의 `dbgenerated` default 가 INSERT 시 GUC 를 읽는 흐름으로 보장된 것처럼 보였으나, 실제로는 BYPASSRLS 의존이었다.

## 해결

extension 내부에서 tx 의 model delegate 를 직접 호출하도록 라우팅:

```ts
// src/lib/db/prisma-tenant-client.ts
$allOperations: async (params) => {
  const { args, model, operation } = params;
  return basePrisma.$transaction(async (tx: any) => {
    if (ctx.bypassRls) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
    } else {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${safeUuid}'`);
    }
    if (!model) {
      // raw operation ($executeRawUnsafe / $queryRawUnsafe 등)
      const rawFn = (tx as any)[operation];
      if (typeof rawFn === 'function') {
        if (Array.isArray(args)) return rawFn.apply(tx, args);  // variadic spread
        return rawFn.call(tx, args);
      }
      return params.query(args);  // fallback
    }
    // model operation — PascalCase → camelCase ("Message" → "message")
    const camel = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (tx as any)[camel];
    return delegate[operation].call(delegate, args);
  });
}
```

핵심:
- `query(args)` 호출 회피 — base client 로 escape 하는 원인.
- 대신 `tx[modelCamel][operation](args)` 직접 호출 — tx connection 보장.
- raw operation 은 `args` array spread 로 variadic 지원 (`$executeRawUnsafe(query, ...values)`).

## 교훈

- **Prisma extension 의 `query(args)` 는 우리 transaction 안에 있어도 새 connection 을 사용한다** — Prisma 7.7.0 시점. 향후 버전에서 수정될 수 있음.
- **BYPASSRLS 운영 + 비-bypass 테스트의 비대칭** 이 latent bug 를 가린다. role 분리 없이 prod 검증하는 모든 RLS 시스템에 동일 함정 가능.
- **라이브 통합 테스트 부재 = 회귀 누적**. 본 케이스는 T1.4 PRISMA Client Extension (commit `e283b53`, 세션 ?) 부터 잠재. session 82 에서 첫 라이브 시도 시 노출.
- 회귀 차단 위해 **CI 에서 RLS_TEST_DATABASE_URL 활성** + 비-bypass role 사용 필수.

## 관련 파일

- `src/lib/db/prisma-tenant-client.ts` — `tenantPrismaFor` + `prismaWithTenant` 양쪽 fix 적용
- `tests/messenger/_fixtures.ts` — admin pool BYPASSRLS + runtime client 비-bypass 분리 패턴
- `scripts/setup-test-db-role.sh` — `app_test_runtime` (비-bypass) 셋업 스크립트
- commit `8bef896 fix(messenger,db): M2 통합 테스트 32 라이브 PASS — Prisma extension + RLS 함정 4건 동시 fix`
