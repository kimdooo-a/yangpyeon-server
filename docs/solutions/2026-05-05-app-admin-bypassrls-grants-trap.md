---
title: "PostgreSQL `BYPASSRLS=t ≠ 모든 권한` — RLS 우회 role 에 GRANT 누락 시 latent broken"
date: 2026-05-05
session: 88
tags: [postgresql, rls, grants, bypassrls, multi-tenant, prisma, ops-console, latent-bug, systematic-debugging]
category: bug-fix
confidence: high
---

## 문제

운영 콘솔 (operator-only) 라우트의 PostgreSQL 호출이 모두 다음 에러로 실패:

```
Error [DriverAdapterError]: permission denied for table sticky_notes
  originalCode: '42501'
  kind: 'postgres'
  severity: 'ERROR'
```

같은 에러가 동시에 여러 테이블에서 발생:
- `sticky_notes` (12건)
- `webhooks` (3건)
- `sql_queries` (3건)
- `cron_jobs` (3건)

증상:
- `/notes` 페이지가 데스크톱 + 모바일 모두 동일하게 빈 화면 또는 "메모 불러오는 중…" 영구 표시 (silent catch 가 fetch 에러 삼킴)
- PM2 stderr 에는 명확한 42501 메시지가 떨어지지만 UI 단에는 단서 없음
- 4개월간 prod 에서 hidden latent — 사용자가 도달하지 않은 다른 ops 콘솔 (Webhooks/SQL Editor/Cron 등) 도 동일 함정 잠재

## 원인

**한 줄**: PostgreSQL 의 `BYPASSRLS=t` 는 RLS 정책만 우회한다. ACL (Table-level GRANT) 검사는 **RLS 보다 먼저** 일어나며 BYPASSRLS 와 무관하게 적용된다.

### 권한 검사 순서

PostgreSQL 의 SELECT (또는 INSERT/UPDATE/DELETE) 처리 순서:

1. **ACL 검사** (Table-level GRANT) — `has_table_privilege(role, oid, 'SELECT')`
2. **RLS 정책 검사** — `BYPASSRLS=t` 면 SKIP, 아니면 USING/WITH CHECK 표현식 평가
3. **Column-level ACL** (사용 중인 경우)
4. 실제 행 반환

`BYPASSRLS=t + zero GRANT` 조합 = "RLS 는 모두 통과시키지만 모든 테이블 액세스를 거부" — 가장 모순적인 상태.

### 본 사고의 정확한 메커니즘

이 프로젝트의 멀티테넌트 BaaS 아키텍처는 두 경로:

| 경로 | 역할 | 실행 role | RLS | ACL |
|------|------|----------|-----|-----|
| 일반 컨슈머 라우트 | tenant-scoped 호출 | `app_runtime` (BYPASSRLS=f) | `tenant_isolation` 정책 적용 | GRANT 부여됨 ✓ |
| 운영 콘솔 라우트 | operator (BaaS 본인) | `app_admin` (BYPASSRLS=t) | bypass | **GRANT 누락 ✗** |

운영 콘솔 라우트는 `tenantPrismaFor({tenantId, bypassRls: true})` 호출 → Prisma extension 이 `$transaction` 안에서:

```ts
// src/lib/db/prisma-tenant-client.ts:187-188
if (ctx.bypassRls) {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
}
```

이 시점에 session 의 current_user 가 `postgres` → `app_admin` 으로 전환. 이후 query 가 `app_admin` 의 권한으로 실행 → ACL 검사 = `app_admin` 에게 SELECT 권한 없음 → 42501.

**postgres role (BYPASSRLS=t + 모든 권한)** 은 같은 connection 의 transaction 시작 전 까지만 의미. SET LOCAL ROLE 이후로는 app_admin 이 모든 결정권을 가짐.

### Role 생성 마이그레이션의 누락

이 프로젝트의 app_admin role 생성 마이그레이션은:
- ✅ `CREATE ROLE app_admin BYPASSRLS`
- ❌ GRANT 단계 누락
- ❌ DEFAULT PRIVILEGES 누락

같은 마이그레이션 라인업의 `app_runtime` 은 GRANT 가 부여되어 있어 (다른 multi-tenant 테이블 ACL 에 `app_runtime=arwd` 표시) 정상 작동. **app_admin 만 single point of failure** 였고, 운영 콘솔 라우트가 처음 호출되는 순간부터 latent broken.

### "왜 4개월간 발견 안 됐는가" — S82 4 latent bug 패턴 5번째

CLAUDE.md 의 PR 리뷰 게이트 룰 #4:
> **non-BYPASSRLS role 로 라이브 테스트 1회 통과** — `bash scripts/run-integration-tests.sh tests/<domain>/`. prod 가 BYPASSRLS postgres 사용해서 가려지는 RLS bug 차단.

이 룰은 **non-BYPASSRLS** 영역만 게이트화. `app_admin` (BYPASSRLS=t) 영역은 자동으로 빠짐. 결과 = 운영 콘솔 라우트가 한 번도 라이브 테스트 게이트를 통과하지 않은 채로 4개월 prod. 사용자가 도달한 4 테이블만 노출되고 나머지 33 테이블 + 1 시퀀스는 hidden.

## 해결

### 1. 마이그레이션 — systemic GRANT + DEFAULT PRIVILEGES

`prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql`:

```sql
-- 1. role 존재 가드
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
        RAISE EXCEPTION 'app_admin role 이 존재하지 않습니다.';
    END IF;
END $$;

-- 2. 기존 객체 일괄 GRANT
GRANT USAGE ON SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_admin;

-- 3. DEFAULT PRIVILEGES — 향후 신설 객체 자동 GRANT (재발 차단)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO app_admin;

-- 4. 검증 블록 — 실패 시 RAISE EXCEPTION → 자동 rollback
DO $$
DECLARE
    total_tables INT;
    granted_tables INT;
BEGIN
    SELECT count(*) INTO total_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '\_prisma%' ESCAPE '\';

    SELECT count(*) INTO granted_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '\_prisma%' ESCAPE '\'
      AND has_table_privilege('app_admin', c.oid, 'SELECT')
      AND has_table_privilege('app_admin', c.oid, 'INSERT')
      AND has_table_privilege('app_admin', c.oid, 'UPDATE')
      AND has_table_privilege('app_admin', c.oid, 'DELETE');

    IF granted_tables <> total_tables THEN
        RAISE EXCEPTION 'app_admin GRANT 검증 실패: %/% 테이블만 ALL 권한', granted_tables, total_tables;
    END IF;
END $$;
```

### 2. 적용 — psql 직접 (cross-mount 안정성)

`prisma migrate deploy` 가 Windows 소스 ↔ WSL postgres cross-mount 에서 node 실행 안정성 의심 → psql `--single-transaction -f` 로 직접 적용 + `_prisma_migrations` 메타 row 수동 삽입:

```bash
CHECKSUM=$(sha256sum migration.sql | awk '{print $1}')
MIG_ID=$(uuidgen)

psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f migration.sql

psql "$DB_URL" -c "
  INSERT INTO _prisma_migrations
    (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
  VALUES
    ('$MIG_ID', '$CHECKSUM', '20260505000000_grant_app_admin_all_public', now(), now(), 1);
"
```

다음 prisma migrate deploy 시 checksum 일치로 idempotent 인식.

### 3. 검증 (immediate + observational)

```sql
-- A. 라이브 SET ROLE 시뮬레이션
BEGIN;
SET LOCAL ROLE app_admin;
SELECT count(*) FROM sticky_notes;  -- 이전엔 42501, 지금은 정상 카운트
ROLLBACK;

-- B. 전수 검증
SELECT
  count(*) FILTER (WHERE has_table_privilege('app_admin', c.oid, 'SELECT')) AS granted,
  count(*) AS total
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '\_prisma%' ESCAPE '\';
-- 결과: granted=37, total=37
```

```bash
# C. PM2 stderr 30s 모니터 — 새 42501 0건
LINES_BEFORE=$(wc -l < ~/ypserver/logs/ypserver-err.log)
sleep 30
LINES_AFTER=$(wc -l < ~/ypserver/logs/ypserver-err.log)
echo "new lines: $((LINES_AFTER - LINES_BEFORE))"  # 0
```

### 4. PM2 restart 불필요

PostgreSQL ACL 은 매 query catalog lookup 이라 prepared statement plan 에 hardcode 안 됨 → connection pool 재시작 없이 다음 query 부터 즉시 적용. 동시 실행 중이던 query 가 transaction 안에 있으면 그 transaction 끝까지 옛 ACL snapshot 사용 — 보통 ms 단위.

CLAUDE.md "PM2 운영 서버 임의 종료 금지" 룰과 정합 — 이 변경은 catalog-only 라 restart 가 필요 없음.

## 교훈

1. **`BYPASSRLS=t` 는 "RLS 정책만" 우회**. ACL 검사는 항상 적용. role 생성 마이그레이션에서 `CREATE ROLE ... BYPASSRLS` 직후 반드시 GRANT 단계 동반 — 빠뜨리면 가장 모순적인 상태가 4개월 latent.

2. **DEFAULT PRIVILEGES 는 단순 GRANT 보다 systemic**. 단순 GRANT 만이면 향후 신설 객체에 또 누락 가능. `ALTER DEFAULT PRIVILEGES FOR ROLE <table-creator>` 가 마이그레이션 추가될 때마다 자동 GRANT — 동일 latent 재발 차단 단일 지점.

3. **silent catch 는 디버깅 비용 증폭기**. `} catch { /* 무시 */ }` 가 PM2 stderr 의 명백한 에러를 UI 에서 차단하면 가설 thrashing 불가피. 대안 = `toast.error` + `console.error(err)` 최소 한 줄. 다음 사고 시 1 round 에 root cause 단서.

4. **PR 게이트 룰의 적용 영역 명시 필요**. CLAUDE.md PR 게이트 룰 #4 ("non-BYPASSRLS role 로 라이브 테스트") 가 이 프로젝트의 핵심 안전망인데 운영 콘솔 (BYPASSRLS=t) 영역이 빠져 있었음. 룰 자체를 "BYPASSRLS=t 영역도 라이브 테스트 게이트화" 로 확장 PR 권고.

5. **systematic-debugging Phase 2 (Pattern Analysis) 가 첫 가설 자가 반박의 결정적 지점**. 1차 가설 "GRANT 누락" 을 곧장 수용했다면 ACL 만 noisy 만들고 root cause 그대로 지속. working tables 와 broken tables ACL 이 완전 동일하다는 발견 = "단순 누락 아님" 확정 → SET ROLE 가설로 자연스럽게 이동.

## 관련 파일

- 마이그레이션: [`prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql`](../../prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql)
- 적용 스크립트: [`scripts/apply-migration-grant-app-admin.sh`](../../scripts/apply-migration-grant-app-admin.sh)
- 진단 스크립트: [`scripts/diag-app-admin-grants.sh`](../../scripts/diag-app-admin-grants.sh) / [`diag-app-admin-missing.sh`](../../scripts/diag-app-admin-missing.sh) / [`diag-sticky-notes-grants.sh`](../../scripts/diag-sticky-notes-grants.sh) / [`diag-app-runtime-test.sh`](../../scripts/diag-app-runtime-test.sh) / [`diag-monitor-stderr-30s.sh`](../../scripts/diag-monitor-stderr-30s.sh)
- 사용자 측 코드: [`src/lib/db/prisma-tenant-client.ts:187-188`](../../src/lib/db/prisma-tenant-client.ts) — `bypassRls=true → SET LOCAL ROLE app_admin`
- 사용 사이트 예: [`src/app/api/v1/sticky-notes/route.ts:11`](../../src/app/api/v1/sticky-notes/route.ts) — `OPS_CTX = { bypassRls: true }`
- silent catch 후속 PR 대상: [`src/components/sticky-notes/sticky-board.tsx:35`](../../src/components/sticky-notes/sticky-board.tsx)
- 인수인계서: [`docs/handover/260505-session88-app-admin-grants-fix.md`](../handover/260505-session88-app-admin-grants-fix.md)
- 관련 룰: CLAUDE.md "PR 리뷰 게이트 룰" #3 + #4, "PM2 운영 서버 임의 종료 금지"
- 관련 메모리: `feedback_verification_scope_depth` `feedback_migration_apply_directly` `feedback_pm2_servers_no_stop`
- 동일 패턴 자매 사고: S82 4 latent bug (Prisma extension RLS escape, PrismaPg timezone shift, AbuseReport @map 누락, 5 fixture/test) — 본 사고가 5번째 사례
