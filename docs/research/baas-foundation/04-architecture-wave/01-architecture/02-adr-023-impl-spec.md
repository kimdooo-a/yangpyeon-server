# 02 — ADR-023 (shared+RLS) Implementation Spec

> 작성: 2026-04-26 (Wave 04 Architecture)
> 상위 결정: ADR-023 (옵션 B ACCEPTED, 2026-04-26 세션 58)
> 입력 자료: spike-baas-001 (Prisma 7 schema-per-tenant 한계), 02-current-code-audit (현재 11 모델)
> 출력 대상: prisma/schema.prisma, src/lib/db/, src/lib/api-guard.ts, eslint.config.mjs, tests/rls/
> 후속 ADR: ADR-026 (Manifest), ADR-027 (Router), ADR-028 (Cron Pool), ADR-029 (Observability)

---

## 1. 결정 요약

### 1.1 한 줄 요약

PostgreSQL 단일 인스턴스 위에서 N=10~20 컨슈머(Tenant)를 **shared schema + Row-Level Security (RLS) + PG session variable `app.tenant_id`** 패턴으로 격리한다. Prisma 7 Client Extension + AsyncLocalStorage 기반 `withTenant()` 래퍼를 강제하고, ESLint custom rule + RLS e2e 테스트로 검증 자동화한다.

### 1.2 채택 근거 (spike-baas-001 결과)

옵션 A (schema-per-tenant) 거부 사유:
1. Prisma 7.6 동적 schema 1급 미지원 (issue #24794 still open)
2. `SET search_path` + prepared statement caching = silent cross-tenant 유출 위험
3. PrismaClient pool N×9 = 180 connection → max_connections(100) 즉시 초과
4. Almanac plugin 동적 활성화(ADR-024/026) ↔ Prisma build-time generate 본질적 충돌
5. Prisma 공식 multi-tenant 가이드 = 옵션 B (`prisma-client-extensions/row-level-security`)

옵션 B 채택 조건 (필수 보강 ~28h):
- `withTenant()` 래퍼 (4h)
- ESLint custom rule (8h)
- RLS e2e 테스트 (16h)
- PG `app.tenant_id` session variable 패턴 (포함)

### 1.3 본 spec의 범위

- 데이터 모델 변경 (11개 + 신규 Tenant 모델)
- RLS 정책 SQL (테이블별 USING/WITH CHECK)
- PG session variable 주입 패턴
- `withTenant()` TS 구현 sketch
- ESLint rule 정의 sketch
- Vitest e2e 테스트 양식
- 마이그레이션 단일→멀티 3-phase 전략
- Almanac (단일 tenant default) 처리
- PgBouncer 검토 (Phase 4 deferred)
- Open Questions

### 1.4 본 spec이 다루지 않는 것

- Tenant 식별 방법 (subdomain/path/JWT) → ADR-027
- Tenant 등록 자동화 (manifest) → ADR-026
- Cron worker isolation → ADR-028
- Audit log 위치 → ADR-029, 본 spec §11
- JWKS 키셋 격리 → 본 spec §11

---

## 2. Prisma 모델 변경 (11개 + 신규 Tenant)

### 2.1 신규 Tenant 모델 정의

```prisma
/// Multi-tenant BaaS — Tenant (조직/워크스페이스) 레지스트리
/// 참조: ADR-022 (1인-N프로젝트 정체성), ADR-023 (shared+RLS 격리)
/// slug: URL/path/JWT 식별자 (kebab-case, lowercase, 영숫자+hyphen).
/// status: ACTIVE / SUSPENDED / DELETING. SUSPENDED 시 모든 요청 차단 (ADR-027).
/// migrationVersion: 본 tenant에 적용된 최신 schema migration 버전 (단순 정수, ADR-026과 정합).
/// plan: FREE / PRO / ENTERPRISE — quota/policy 차원 (ADR-029 future).
model Tenant {
  id               String       @id @default(uuid()) @db.Uuid
  slug             String       @unique
  name             String
  status           TenantStatus @default(ACTIVE)
  plan             String       @default("FREE")
  migrationVersion Int          @default(0) @map("migration_version")
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt        DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt        DateTime?    @map("deleted_at") @db.Timestamptz(3)

  @@index([status])
  @@map("tenants")
}

enum TenantStatus {
  ACTIVE
  SUSPENDED
  DELETING
}
```

### 2.2 모든 비즈니스 모델에 `tenantId` 추가 양식

기본 패턴 (반복 적용):

```prisma
model <ModelName> {
  // ... 기존 필드들 ...
  tenantId  String   @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid

  // 기존 unique/index에 tenant_id 합성
  @@unique([tenantId, <기존 unique 필드>])
  @@index([tenantId, <기존 index 필드>])
}
```

### 2.3 11개 모델 개별 변경 spec

#### 2.3.1 User
```prisma
model User {
  // ... 기존 필드 유지 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid

  // ⚠ email @unique → (tenantId, email) @unique
  @@unique([tenantId, email])
  @@index([tenantId])
  @@map("users")
}
```
- **breaking**: `email @unique` 제거 → `(tenantId, email) @unique`. 동일 email이 tenant별 독립 사용자 가능.

#### 2.3.2 Session
```prisma
model Session {
  // ... 기존 필드 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid

  // ⚠ tokenHash @unique 유지 (글로벌 hash 충돌 0 가정 — SHA-256)
  @@index([tenantId, userId, revokedAt, expiresAt])
  @@map("sessions")
}
```
- 기존 `(userId, revokedAt, expiresAt)` 인덱스 → `(tenantId, userId, revokedAt, expiresAt)` 재설계 (SP-015 재실측 대상, ADR-023 §3.3).

#### 2.3.3 Folder
```prisma
model Folder {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid

  @@unique([tenantId, parentId, name, ownerId])  // 기존 (parentId, name, ownerId)
  @@index([tenantId])
}
```

#### 2.3.4 File
```prisma
model File {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid

  @@index([tenantId, folderId])
  // storedName @unique 유지 (UUID 기반 무충돌)
}
```

#### 2.3.5 ApiKey
```prisma
model ApiKey {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid

  // ⚠ prefix @unique → 글로벌 유지 (prefix 충돌 시 발급 단계에서 회피)
  @@index([tenantId, ownerId])
}
```

#### 2.3.6 SqlQuery / EdgeFunction / EdgeFunctionRun
```prisma
model SqlQuery {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  @@index([tenantId, ownerId, scope])
}

model EdgeFunction {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  // ⚠ name @unique → (tenantId, name) @unique
  @@unique([tenantId, name])
  @@index([tenantId, ownerId])
}

model EdgeFunctionRun {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  @@index([tenantId, functionId, startedAt])
}
```

#### 2.3.7 CronJob / Webhook
```prisma
model CronJob {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  // ⚠ name @unique → (tenantId, name) @unique
  @@unique([tenantId, name])
  @@index([tenantId])
}

model Webhook {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  @@index([tenantId, sourceTable, event])
}
```

#### 2.3.8 MfaEnrollment / MfaRecoveryCode / WebAuthnAuthenticator / WebAuthnChallenge
- `userId`가 이미 `User`로 cascade되므로 tenant_id는 User 따라간다.
- 그래도 정책 단순화를 위해 `tenantId` 컬럼 추가 + RLS 활성화.
```prisma
model MfaEnrollment {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
}

model MfaRecoveryCode {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  @@index([tenantId, userId, usedAt])
}

model WebAuthnAuthenticator {
  // ... 기존 ...
  tenantId  String  @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  // credentialId @unique 유지 (RP 글로벌 ID)
  @@index([tenantId, userId])
}

model WebAuthnChallenge {
  // ... 기존 ...
  tenantId  String? @map("tenant_id") @db.Uuid  // nullable: 등록 직전 tenant 미확정 케이스
}
```

#### 2.3.9 RateLimitBucket
```prisma
model RateLimitBucket {
  // bucketKey @id 유지하되 키 형식에 tenantId 포함:
  //   "<tenantId>:<scope>:<dimension>:<value>"
  // 즉 컬럼 추가 없이 키 namespacing으로 격리.
  bucketKey String   @id @map("bucket_key")
  tenantId  String   @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  hits        Int      @default(1)
  windowStart DateTime @default(now()) @map("window_start") @db.Timestamptz(3)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@index([tenantId, windowStart])
}
```

### 2.4 Tenant-bypass 모델 (RLS 적용 안 함)

다음 모델은 시스템 전역으로 유지:

| 모델 | 사유 |
|------|------|
| `Tenant` | 레지스트리 자체 |
| `JwksKey` | 단일 키셋 + JWT의 `tenant` claim으로 식별 (§11 Open Question) |
| `SecretItem` | MFA_MASTER_KEY 등 환경 전역 (Phase 4에서 tenant 차원 추가 검토) |

### 2.5 신규 Audit 모델 (참조용, ADR-029 확정 대기)

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  tenantId  String?  @map("tenant_id") @db.Uuid  // nullable: 시스템 작업은 NULL
  userId    String?  @map("user_id")
  method    String
  path      String
  ip        String?
  status    Int?
  action    String?
  detail    Json?
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@map("audit_logs")
}
```
→ RLS 정책은 `BYPASS RLS` admin role 또는 `tenantId IS NULL OR tenantId = current_setting('app.tenant_id')::uuid` (Open Question §11).

---

## 3. PostgreSQL RLS 정책

### 3.1 모든 비즈니스 테이블 일괄 패턴

```sql
-- 11개 비즈니스 테이블 각각에 적용 (users, sessions, folders, files,
--  api_keys, sql_queries, edge_functions, edge_function_runs, cron_jobs,
--  webhooks, mfa_enrollments, mfa_recovery_codes, webauthn_authenticators,
--  rate_limit_buckets)

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;  -- table owner도 RLS 적용 (superuser만 BYPASS)

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

### 3.2 정책 설계 원칙

1. **`current_setting('app.tenant_id', true)`** — 두 번째 인자 `true` = missing_ok. 미설정 시 NULL 반환 → 정책이 모든 row 차단 (안전 기본값).
2. **`USING` + `WITH CHECK` 동시 정의** — SELECT/UPDATE/DELETE는 USING, INSERT/UPDATE 신규값은 WITH CHECK. 둘 다 같은 조건이면 cross-tenant write 차단.
3. **`FORCE ROW LEVEL SECURITY`** — table owner에게도 정책 적용. 마이그레이션 시 `BYPASS RLS` 권한 보유 role만 우회.
4. **단일 정책 명 `tenant_isolation`** — 일관성. `pg_policies` 점검 시 grep 용이.

### 3.3 마이그레이션 SQL 템플릿

```sql
-- prisma/migrations/<timestamp>_enable_rls/migration.sql

DO $$
DECLARE
  tbl TEXT;
  business_tables TEXT[] := ARRAY[
    'users', 'sessions', 'folders', 'files', 'api_keys',
    'sql_queries', 'edge_functions', 'edge_function_runs',
    'cron_jobs', 'webhooks', 'mfa_enrollments', 'mfa_recovery_codes',
    'webauthn_authenticators', 'rate_limit_buckets'
  ];
BEGIN
  FOREACH tbl IN ARRAY business_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $pol$, tbl);
  END LOOP;
END $$;

-- BYPASSRLS 전용 role (마이그레이션 runner 전용)
CREATE ROLE app_migration BYPASSRLS LOGIN PASSWORD '...';
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_migration;

-- 일반 app role (RLS 적용)
CREATE ROLE app_runtime LOGIN PASSWORD '...';
REVOKE BYPASSRLS FROM app_runtime;  -- 명시적
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
```

### 3.4 audit_logs 정책 (Open Question §11)

```sql
-- 옵션 (a): admin role BYPASSRLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (
    tenant_id IS NULL  -- 시스템 작업 row는 모든 tenant에서 가시
    OR tenant_id = current_setting('app.tenant_id', true)::uuid
  )
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 운영자 전용 admin role 별도
CREATE ROLE app_admin BYPASSRLS LOGIN PASSWORD '...';
```

---

## 4. PG session variable 패턴

### 4.1 핵심 원칙

매 요청 = 매 트랜잭션 시작 시 `SET LOCAL app.tenant_id = '<uuid>'` 주입. `SET LOCAL`은 트랜잭션 종료(COMMIT/ROLLBACK) 시 자동 reset → connection pool 재사용 안전.

### 4.2 `pg_options` 사전 등록 불필요

PostgreSQL `app.*` namespace는 custom GUC로 사전 선언 없이 사용 가능 (PostgreSQL 9.2+). `current_setting('app.tenant_id', true)` 두 번째 인자 `true`로 missing_ok 처리.

### 4.3 Prisma middleware/extension에서 주입

다음 §5 `withTenant()` 래퍼가 매 트랜잭션 진입 시 자동 주입한다.

### 4.4 raw SQL (SQL Editor) 케이스

```typescript
// src/lib/pg/pool.ts (확장)
export async function runReadonly(
  sql: string,
  params: unknown[],
  options: { timeoutMs: number },
  tenantId: string  // ⚠ 신규 필수 인자
): Promise<QueryResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    await client.query(`SET LOCAL statement_timeout = $1`, [options.timeoutMs]);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

---

## 5. `withTenant()` 래퍼 구현

### 5.1 AsyncLocalStorage 기반 context

```typescript
// src/lib/db/tenant-context.ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  tenantId: string;
  /** 운영자 BYPASS_RLS 모드 (admin 전용) */
  bypassRls?: boolean;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenant(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error(
      "Tenant context missing. Did you wrap your handler in withTenant()?"
    );
  }
  return ctx;
}

export function getCurrentTenantOrNull(): TenantContext | null {
  return tenantStorage.getStore() ?? null;
}

export function runWithTenant<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run(ctx, fn);
}
```

### 5.2 Prisma Client Extension

```typescript
// src/lib/db/prisma-client.ts
import { PrismaClient } from "@/generated/prisma";
import { getCurrentTenant } from "./tenant-context";

const basePrisma = new PrismaClient();

/**
 * tenant-scoped Prisma client.
 * - 모든 read/write가 자동으로 SET LOCAL app.tenant_id
 * - $allOperations에서 transaction wrapping
 * - read-only access 단발 query도 동일 보장
 */
export const prisma = basePrisma.$extends({
  query: {
    $allOperations: async ({ args, query, model, operation }) => {
      const ctx = getCurrentTenant();

      // 이미 transaction 내부면 GUC가 이미 설정되어 있다 (중복 SET 회피).
      // Prisma는 client.$transaction() 내부 호출인지 알기 어려우므로
      // 항상 transactional wrapper로 감싸 멱등 SET 적용.
      return basePrisma.$transaction(async (tx) => {
        if (ctx.bypassRls) {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
        } else {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.tenant_id = '${ctx.tenantId}'`
          );
        }
        // query 함수 재호출 — 이 호출은 Extension 재진입 없음
        return query(args);
      });
    }
  }
});

export type AppPrismaClient = typeof prisma;
```

> ⚠ **주의**: `query(args)` 호출 시 Prisma 6+는 동일 Extension 재진입을 자동 회피한다. 단 deep transaction은 지원되지 않으므로 핸들러에서 직접 `prisma.$transaction()` 호출 시 충돌 가능. → 핸들러에서 multi-statement transaction이 필요할 땐 `withTenantTx()` (§5.3) 사용.

### 5.3 핸들러용 `withTenant` / `withTenantTx`

```typescript
// src/lib/api-guard.ts (확장)
import { runWithTenant } from "@/lib/db/tenant-context";
import { prisma } from "@/lib/db/prisma-client";

/**
 * API handler용 helper.
 * - 1) JWT/cookie/header에서 tenantId 추출 (ADR-027)
 * - 2) AsyncLocalStorage에 등록
 * - 3) 핸들러 내부의 모든 prisma.* 호출이 자동 tenant-scoped
 */
export function withTenant<T>(
  request: Request,
  fn: (tenantId: string) => Promise<T>
): Promise<T> {
  const tenantId = extractTenantIdFromRequest(request);  // ADR-027 §4
  if (!tenantId) {
    throw new Error("Tenant identifier missing in request");
  }
  return runWithTenant({ tenantId }, () => fn(tenantId));
}

/**
 * Multi-statement transaction이 필요할 때.
 * - 1개 SET LOCAL로 전체 트랜잭션 커버
 * - 핸들러 내부에서 prisma.* 호출 시 Extension은 SET 재실행 (멱등)
 */
export function withTenantTx<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return runWithTenant({ tenantId }, () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
      return fn(tx as unknown as PrismaClient);
    })
  );
}
```

### 5.4 핸들러 사용 예

```typescript
// src/app/api/v1/files/route.ts
import { withAuth, withTenant } from "@/lib/api-guard";
import { prisma } from "@/lib/db/prisma-client";

export const GET = withAuth(async (request, user) => {
  return withTenant(request, async (tenantId) => {
    // ⬇ tenant_id WHERE 자동 주입, RLS 추가 보호
    const files = await prisma.file.findMany({
      where: { ownerId: user.sub }
    });
    return Response.json({ files });
  });
});
```

---

## 6. ESLint custom rule

### 6.1 Rule 정의 sketch

```typescript
// eslint-rules/no-raw-prisma-without-tenant.ts
import type { Rule } from "eslint";

export const noRawPrismaWithoutTenant: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "raw prisma 호출은 withTenant/withTenantTx 안에서만 허용",
      recommended: true
    },
    schema: []
  },
  create(context) {
    let insideWithTenant = false;

    function isWithTenantCall(node: any): boolean {
      return (
        node?.callee?.name === "withTenant" ||
        node?.callee?.name === "withTenantTx" ||
        node?.callee?.name === "runWithTenant"
      );
    }

    return {
      "CallExpression": (node: any) => {
        if (isWithTenantCall(node)) {
          insideWithTenant = true;
        }
      },
      "CallExpression:exit": (node: any) => {
        if (isWithTenantCall(node)) {
          insideWithTenant = false;
        }
      },
      // prisma.<model>.<op>() 패턴 검출
      "MemberExpression[object.name='prisma']": (node: any) => {
        if (insideWithTenant) return;

        // 예외: src/lib/db/, scripts/migration/ 안에서는 허용
        const filename = context.getFilename();
        if (
          filename.includes("/lib/db/") ||
          filename.includes("/scripts/migration/") ||
          filename.includes("/tests/")
        ) {
          return;
        }

        context.report({
          node,
          message:
            "prisma.* 직접 호출 금지 — withTenant() 또는 withTenantTx() 안에서만 사용 가능 (cross-tenant leak 방지). " +
            "system 작업이라면 src/lib/db/ 또는 scripts/migration/ 안에서 호출하세요."
        });
      },
      // raw SQL ($queryRaw, $executeRaw, $executeRawUnsafe) 도 차단
      "MemberExpression[property.name=/^\\$(queryRaw|executeRaw|executeRawUnsafe)/]": (node: any) => {
        if (insideWithTenant) return;
        const filename = context.getFilename();
        if (filename.includes("/lib/db/")) return;

        context.report({
          node,
          message: "raw SQL은 withTenant() 안에서만 호출 가능. tenant_id WHERE 누락 시 cross-tenant 유출 위험."
        });
      }
    };
  }
};
```

### 6.2 eslint.config.mjs 등록

```javascript
import { noRawPrismaWithoutTenant } from "./eslint-rules/no-raw-prisma-without-tenant.js";

export default [
  {
    plugins: {
      tenant: { rules: { "no-raw-prisma-without-tenant": noRawPrismaWithoutTenant } }
    },
    rules: {
      "tenant/no-raw-prisma-without-tenant": "error"
    }
  }
];
```

### 6.3 한계

- AST 기반 정적 분석은 함수 분리 시 false-negative 가능. 예: `function loadFiles() { return prisma.file.findMany(); }`을 핸들러에서 호출하면 검출 불가.
- → §7 RLS e2e 테스트가 backstop.

---

## 7. RLS e2e 테스트

### 7.1 테스트 시나리오

| ID | 시나리오 | 기대 |
|----|----------|------|
| T1 | tenant_a context에서 tenant_b row 조회 | 0 row |
| T2 | tenant_a context에서 tenant_b row UPDATE | 0 row affected |
| T3 | tenant_a context에서 tenant_b row DELETE | 0 row affected |
| T4 | tenant_a context에서 tenant_b의 tenant_id로 INSERT | exception (WITH CHECK 위반) |
| T5 | tenant context 미설정 + raw query | 0 row 또는 exception (안전 기본값) |
| T6 | bypassRls=true 모드 (admin role) | 모든 tenant row 가시 |
| T7 | 11개 모든 model 일괄 cross-tenant 침투 | 모두 0 row |

### 7.2 Vitest 양식

```typescript
// tests/rls/cross-tenant-leak.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { runWithTenant } from "@/lib/db/tenant-context";
import { prisma } from "@/lib/db/prisma-client";

const TENANTS = {
  a: "11111111-1111-1111-1111-111111111111",
  b: "22222222-2222-2222-2222-222222222222"
};

beforeAll(async () => {
  // app_runtime role (RLS 적용)로 bootstrap
  // tenant_a, tenant_b 각각 1개 user 생성 (BYPASS role로)
  const adminPool = new Pool({ user: "app_admin" });
  await adminPool.query(`
    INSERT INTO tenants (id, slug, name) VALUES
      ($1, 'a', 'Tenant A'), ($2, 'b', 'Tenant B')
  `, [TENANTS.a, TENANTS.b]);
  await adminPool.query(`
    INSERT INTO users (id, tenant_id, email, password_hash) VALUES
      (gen_random_uuid(), $1, 'a@x.com', 'h'),
      (gen_random_uuid(), $2, 'b@x.com', 'h')
  `, [TENANTS.a, TENANTS.b]);
  await adminPool.end();
});

describe("RLS cross-tenant isolation", () => {
  it("T1: tenant_a context는 tenant_b user 조회 불가", async () => {
    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      const users = await prisma.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0].tenantId).toBe(TENANTS.a);
    });
  });

  it("T2: tenant_a context의 UPDATE는 tenant_b row에 영향 없음", async () => {
    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      const result = await prisma.user.updateMany({
        where: { email: "b@x.com" },  // 의도적 누락 시뮬레이션
        data: { name: "hacked" }
      });
      expect(result.count).toBe(0);
    });
  });

  it("T4: WITH CHECK — tenant_a context에서 tenant_b의 tenant_id INSERT 차단", async () => {
    await expect(
      runWithTenant({ tenantId: TENANTS.a }, async () => {
        await prisma.$executeRawUnsafe(
          `INSERT INTO users (id, tenant_id, email, password_hash)
           VALUES (gen_random_uuid(), '${TENANTS.b}', 'evil@x.com', 'h')`
        );
      })
    ).rejects.toThrow(/row-level security/i);
  });

  it("T5: tenant context 미설정 시 raw 조회 0 row", async () => {
    // AsyncLocalStorage 외부에서 GUC 미설정 connection 사용
    const pool = new Pool({ user: "app_runtime" });
    const result = await pool.query("SELECT * FROM users");
    expect(result.rowCount).toBe(0);
    await pool.end();
  });

  it.each([
    "user", "session", "folder", "file", "apiKey",
    "sqlQuery", "edgeFunction", "cronJob", "webhook"
  ])("T7-%s: cross-tenant leak 0 (모든 model)", async (model) => {
    await runWithTenant({ tenantId: TENANTS.a }, async () => {
      // @ts-expect-error dynamic
      const rows = await prisma[model].findMany();
      for (const row of rows) {
        expect(row.tenantId).toBe(TENANTS.a);
      }
    });
  });
});
```

### 7.3 CI 통합

- GitHub Actions / PM2 deploy 전 `pnpm test:rls` 강제
- 실패 시 deploy abort
- 추가: `pg_policies` 일일 cron — 새 테이블에 정책 누락 시 Slack 알림

---

## 8. Almanac 모델 영향

### 8.1 영향 모델 5개

Almanac (첫 컨슈머) 도메인이 도입할 모델:
- `content_items`
- `content_categories`
- `content_tags` (또는 `content_tag_links`)
- `content_revisions`
- `content_ingested_items` 또는 `content_item_metrics`

### 8.2 처리 방침

```prisma
model ContentItem {
  id        String   @id @default(uuid())
  tenantId  String   @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  // ... 도메인 필드 ...

  @@index([tenantId, /* 기존 정렬 필드 */])
}
// 11개 비즈니스 테이블과 동일 RLS 정책 적용
```

### 8.3 Almanac은 단일 tenant — default 'almanac'

- Almanac은 ADR-022 시점에 "유일 컨슈머"이므로, bootstrap 시 다음 row를 미리 생성:
  ```sql
  INSERT INTO tenants (id, slug, name)
    VALUES ('00000000-0000-0000-0000-000000000001', 'almanac', 'Almanac (Default)');
  ```
- `default 'default'` 컬럼 패턴 (§9 Phase 1)에서 모든 기존 row가 이 tenant로 backfill.
- 추후 N=20 컨슈머 추가 시 새로운 tenant row INSERT만으로 확장.

### 8.4 Almanac plugin loader 통합

ADR-024 (plugin) + ADR-026 (manifest)와의 연계:
- plugin manifest 등록 시 → tenant row 생성 + plugin 모델 RLS 정책 활성화 (DDL은 단일 schema이므로 마이그레이션 1회)
- runtime plugin code는 자체적으로 `withTenant()` wrapper 사용 강제

---

## 9. 마이그레이션 전략 (단일→멀티)

### 9.1 Phase 1 — 컬럼 추가 (nullable + default 'default')

목표: 코드 무중단으로 `tenant_id` 컬럼 도입.

```sql
-- prisma/migrations/<ts>_phase1_add_tenant_id/migration.sql

-- 1. tenants 테이블 신규 + default tenant
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  ...
);
INSERT INTO tenants (id, slug, name)
  VALUES ('00000000-0000-0000-0000-000000000001', 'default', 'Default');

-- 2. 모든 비즈니스 테이블에 nullable tenant_id (default = default tenant)
ALTER TABLE users ADD COLUMN tenant_id UUID
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE sessions ADD COLUMN tenant_id UUID
  DEFAULT '00000000-0000-0000-0000-000000000001';
-- ... 11개 테이블 반복
```

이 시점:
- 신규 INSERT는 default tenant 자동 부여
- 기존 row는 NULL (Phase 2에서 backfill)
- RLS 미활성 → 코드 변경 0
- 배포 안전

### 9.2 Phase 2 — Backfill

```sql
-- 모든 기존 row에 default tenant 채우기
UPDATE users SET tenant_id = '00000000-0000-0000-0000-000000000001'
  WHERE tenant_id IS NULL;
-- ... 11개 테이블 반복

-- 확인
SELECT COUNT(*) FROM users WHERE tenant_id IS NULL;  -- 0이어야 함
```

### 9.3 Phase 3 — NOT NULL + RLS 활성화

```sql
-- 1. NOT NULL 강제
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
-- ... 11개 반복

-- 2. dbgenerated default로 변경 (current_setting 기반)
ALTER TABLE users ALTER COLUMN tenant_id
  SET DEFAULT (current_setting('app.tenant_id'))::uuid;

-- 3. RLS 활성화 (§3.3 SQL 실행)

-- 4. unique 재설계
ALTER TABLE users DROP CONSTRAINT users_email_key;
ALTER TABLE users ADD CONSTRAINT users_tenant_email_key UNIQUE (tenant_id, email);
-- ... 비슷한 케이스 반복

-- 5. app_runtime role로 connection string 전환
```

이 시점부터:
- 모든 핸들러는 `withTenant()` 강제 (ESLint rule 활성화)
- 신규 tenant 추가 = `INSERT INTO tenants (...)` 1줄

### 9.4 Phase 4 — 운영 도구

- `pg_policies` 일일 점검 cron + Slack 알림
- 자체 export 도구 (tenant 1개 dump, JSON)
- 자체 PITR 도구 (tenant 1개 시점 복원, 논리적 복원)
- PgBouncer 검토 (다음 §10)

### 9.5 Rollback 전략

- Phase 1 rollback: `ALTER TABLE ... DROP COLUMN tenant_id` (안전)
- Phase 3 rollback: RLS 정책 DROP + NOT NULL 해제 (역순 SQL 보관)
- 데이터 무손실 — backfill된 default tenant row는 그대로 유지

---

## 10. PgBouncer 검토

### 10.1 현재 상황

- 옵션 B (단일 schema + 단일 PrismaClient)는 PgBouncer 없이 max_connections OK.
- WSL2 4 vCPU = Prisma 기본 connection_limit 9 × 1 = 9 connection.
- N=20 컨슈머가 모두 active해도 단일 PrismaClient pool 9 → PG max_connections(100) 충분히 여유.

### 10.2 PgBouncer가 필요해지는 시점

| 트리거 | 대응 |
|--------|------|
| 동시 active 사용자 ≥ 100 | PgBouncer transaction-mode 도입 |
| Long-running query 빈발 (≥ 1s) | 별도 PG read-replica + pgBouncer routing |
| Prisma raw SQL 폭주 (SQL Editor) | SQL Editor 전용 read-only role + 별도 pool |

### 10.3 spike-baas-001 결과 인용

> N=20 컨슈머 × Prisma connection_limit=9 = 180 connection → PG max_connections(100) 즉시 초과.

이는 **옵션 A** (PrismaClient per tenant) 시나리오. **옵션 B**는 단일 PrismaClient이므로 connection_limit 9개로 N개 tenant 공유 → 압박 없음.

### 10.4 결정

**Phase 4 deferred**. 다음 조건 발동 시 도입:
- 평균 동시 active connection > 50 (PG 모니터링)
- Prisma `pool_timeout` 에러 빈발 (Sentry alarm)

도입 시:
- PgBouncer 1.21+ (prepared statement 지원)
- transaction-pooling mode
- Prisma `?pgbouncer=true` query string

---

## 11. Open Questions

### 11.1 JWKS 키셋 격리 — tenant별 vs 공유

| 옵션 | 장점 | 단점 |
|------|------|------|
| **단일 키셋 + JWT `tenant` claim** | 운영 단순, 키 회전 1회 | tenant 키 유출 시 모든 tenant 영향 |
| **tenant별 키셋 (JwksKey에 tenantId)** | 격리 강 | 회전 N배, JWKS endpoint 다중화 (`/.well-known/jwks.json/<tenant>`) |

**ADR-029 (Auth multi-tenant) 결정 의존**. 본 spec §2.4에서는 일단 "단일 키셋 + JWT claim" 가정 (운영 단순 우선). 향후 변경 시 마이그레이션 cost = 새 컬럼 + 회전 cron.

### 11.2 audit_logs RLS — 운영자 모든 tenant 조회

| 옵션 | 구현 |
|------|------|
| (a) BYPASSRLS admin role | `app_admin` role 보유자만 cross-tenant 조회. 일반 핸들러는 자신의 tenant만. |
| (b) 정책 분기 | `USING (tenant_id IS NULL OR tenant_id = current_setting...)` — 운영자 권한 체크는 코드 레벨 |
| (c) audit_logs는 RLS 적용 안 함 | tenant_id 컬럼만 두고 정책 미적용. 코드에서 `WHERE tenant_id = ...` 명시 |

**ADR-029에서 최종 결정**. 권고 = (a). 운영자 admin tooling은 명시적 role switch 강제.

### 11.3 SecretItem 격리

- 현재 `MFA_MASTER_KEY` 등 환경 전역.
- tenant별 분리 시 `(tenantId, name)` 조합 unique로 재설계.
- Phase 4 검토 — Almanac 단일 tenant 동안은 변경 불필요.

### 11.4 Prisma `dbgenerated` 안정성

- `dbgenerated("(current_setting('app.tenant_id'))::uuid")` 패턴은 Prisma 6+에서 공식 example로 검증됨 (`prisma-client-extensions/row-level-security`).
- 단, `prisma db push --accept-data-loss` 시 column default 재계산 시점에 `app.tenant_id` 미설정이면 ERROR. → 마이그레이션은 `prisma migrate deploy` (raw SQL)로 우회.

### 11.5 Realtime CDC (wal2json) 정합

- ADR-010 (wal2json) + 본 spec: CDC 출력에 `tenant_id` 컬럼 그대로 포함.
- consumer가 `tenant_id` 기준 fan-out → tenant별 realtime channel 분리 (ADR-029 future).

---

## 12. 작업 시간 추정 (~28h 보강 도구 breakdown)

| 작업 | 시간 | 비고 |
|------|------|------|
| `withTenant()` / `withTenantTx()` 래퍼 + AsyncLocalStorage | 4h | §5 |
| Prisma Client Extension (`$allOperations`) | 4h | §5.2 — 멱등 SET 검증 포함 |
| ESLint custom rule + 테스트 | 8h | §6 — false-positive 튜닝 시간 포함 |
| RLS 정책 SQL 마이그레이션 (11개 + audit) | 4h | §3.3 |
| Vitest e2e 테스트 (T1~T7) | 16h | §7 — pg_policies cron 도구 4h 포함 |
| Phase 1~3 마이그레이션 작성 + 테스트 | 8h | §9 |
| Almanac default tenant bootstrap | 2h | §8.3 |
| **합계 (Critical Path)** | **~46h** | spike-baas-001 §6.4 P0 28h + 본 spec 추가 18h |

> **참고**: spike-baas-001 §6.4의 ~28h는 P0 도구 (withTenant + ESLint + RLS test)만 포함. 본 spec은 마이그레이션 작성 + Almanac bootstrap + 정책 SQL 작성 등 18h 추가하여 총 ~46h.

---

## 13. 변경 이력

| 일자 | 작성자 | 내용 |
|------|--------|------|
| 2026-04-26 | Wave 04 Architecture | 초안 — ADR-023 옵션 B 채택 결정의 코드 레벨 spec. 11 모델 변경, RLS 정책, withTenant 래퍼, ESLint rule, RLS e2e test, 3-phase 마이그레이션. |

---

## 14. 후속 산출물

- [ ] `prisma/schema.prisma` 1차 변경 PR (Phase 1, nullable tenant_id)
- [ ] `src/lib/db/tenant-context.ts` 신규
- [ ] `src/lib/db/prisma-client.ts` Extension 추가
- [ ] `src/lib/api-guard.ts` `withTenant`/`withTenantTx` 추가
- [ ] `eslint-rules/no-raw-prisma-without-tenant.ts` 신규
- [ ] `tests/rls/cross-tenant-leak.test.ts` 신규
- [ ] `prisma/migrations/<ts>_phase1_add_tenant_id/migration.sql`
- [ ] `prisma/migrations/<ts>_phase2_backfill/migration.sql`
- [ ] `prisma/migrations/<ts>_phase3_enable_rls/migration.sql`
- [ ] ADR-026 (Manifest) 입력 — tenant 등록 자동화
- [ ] ADR-027 (Router) 입력 — tenant 식별 (subdomain/JWT)
- [ ] ADR-028 (Cron Pool) 입력 — advisory lock key `<tenantId>:<jobId>`
- [ ] ADR-029 (Observability) 입력 — audit_logs 정책 + JWKS 격리 결정

---

## 15. 참조

- `docs/research/baas-foundation/01-adrs/ADR-023-tenant-data-isolation-model.md` (ACCEPTED 옵션 B)
- `docs/research/baas-foundation/03-spikes/spike-baas-001-prisma-schema-per-tenant.md` (옵션 A 거부 근거)
- `docs/research/baas-foundation/00-context/02-current-code-audit.md` (현재 11 모델)
- `prisma/schema.prisma` (현재 schema)
- Prisma 공식 example: [prisma-client-extensions/row-level-security](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security)
- Prisma docs: [Client extensions / Multi-tenant](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
- Supabase RLS 패턴: https://supabase.com/docs/guides/database/postgres/row-level-security
