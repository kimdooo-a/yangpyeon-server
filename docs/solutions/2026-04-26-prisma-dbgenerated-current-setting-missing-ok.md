---
title: Prisma dbgenerated current_setting + missing_ok + COALESCE — RLS 환경에서 base prisma INSERT 안전 fallback
date: 2026-04-26
session: 65
tags: [prisma, dbgenerated, current_setting, missing_ok, rls, multi-tenant, coalesce, postgresql]
category: pattern
confidence: high
---

## 문제

T1.4 RLS Stage 3 적용 후 운영 콘솔 라우트(filebox / cron / sql / members / log-drains 등)에서 INSERT 시 500 에러.

직접 SQL 시뮬레이션 결과:

```sql
INSERT INTO folders (id, name, owner_id) VALUES (gen_random_uuid()::text, 'test', '<userId>');
-- ERROR:  unrecognized configuration parameter "app.tenant_id"
```

영향 범위: prismaWithTenant 미통과 = base prisma 호출 사이트 전반.

## 원인

T1.4 마이그레이션이 모든 tenant_id 컬럼에 다음 default를 설정:

```prisma
tenantId String @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
```

→ SQL로 변환 시 컬럼 default = `(current_setting('app.tenant_id'))::uuid`.

PostgreSQL `current_setting(setting_name [, missing_ok])`:
- 두 번째 인자 **`missing_ok` 누락** 또는 `false` → 변수 부재 시 ERROR (`unrecognized configuration parameter`)
- `missing_ok = true` → 변수 부재 시 NULL 반환

T1.4의 의도는 "모든 INSERT는 prismaWithTenant + SET LOCAL 후" 였으나, 운영 콘솔 라우트의 base prisma 호출은 SET LOCAL 없이 진입 → INSERT 시 default 평가 실패.

## 해결

모든 tenant_id 컬럼의 DEFAULT를 **COALESCE 패턴**으로 변경 — SET 없으면 default tenant fallback:

```sql
ALTER TABLE <table> ALTER COLUMN tenant_id SET DEFAULT
  COALESCE(
    (current_setting('app.tenant_id', true))::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
```

핵심:
- `missing_ok = true` (두 번째 인자) → 변수 부재 시 NULL 반환 (에러 미발생)
- `COALESCE(NULL, default_uuid)` → default tenant 사용
- `prismaWithTenant + SET LOCAL` 호출은 그대로 정상 (variable 우선)

마이그레이션 (전체 21 테이블 일괄):

```sql
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'api_keys', 'content_categories', 'content_ingested_items',
    'content_item_metrics', 'content_items', 'content_sources',
    'cron_jobs', 'edge_function_runs', 'edge_functions',
    'files', 'folders', 'log_drains',
    'mfa_enrollments', 'mfa_recovery_codes', 'rate_limit_buckets',
    'sessions', 'sql_queries', 'sticky_notes',
    'users', 'webauthn_authenticators', 'webhooks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT '
        'COALESCE((current_setting(''app.tenant_id'', true))::uuid, '
        '''00000000-0000-0000-0000-000000000000''::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
```

검증:

```sql
INSERT INTO folders (id, name, owner_id) VALUES (gen_random_uuid()::text, 'test', '<userId>')
  RETURNING id, tenant_id;
-- 결과: tenant_id = '00000000-0000-0000-0000-000000000000' (default tenant)
```

## 교훈

- **Prisma `dbgenerated()` 안의 SQL은 그대로 PG에 전달** — current_setting 두 번째 인자 항상 명시.
- **RLS 환경의 default**는 "context 있을 때 + 없을 때" 두 시나리오 모두 안전해야 함. COALESCE fallback이 표준.
- 운영 콘솔 = base prisma + default tenant, 컨슈머 라우트 = prismaWithTenant + SET LOCAL — 두 호출 사이트가 공존하는 multi-tenant BaaS 패턴에서 default 정의가 핵심.
- T1.4 spec(02-adr-023-impl-spec.md)에서 미명시된 함정 — spec 갱신 권장.

## 관련 파일

- `prisma/migrations/20260427110000_phase1_4_rls_stage3/migration.sql` — 결함 default 정의
- `prisma/migrations/20260428100000_fix_dbgenerated_missing_ok/migration.sql` — 정정 마이그레이션
- `prisma/schema.prisma` — 모든 모델의 `tenantId @default(dbgenerated(...))` 정의
- commit `f8ef8a7` — fix(migration): T1.4 dbgenerated default 결함 정정
