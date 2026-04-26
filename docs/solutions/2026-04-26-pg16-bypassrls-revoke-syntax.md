---
title: PostgreSQL 16 — REVOKE BYPASSRLS 구문 함정과 ALTER ROLE NOBYPASSRLS 정답
date: 2026-04-26
session: 65
tags: [postgresql, postgres-16, rls, bypassrls, role-attribute, prisma-migrate, p3018]
category: bug-fix
confidence: high
---

## 문제

T1.4 RLS Stage 3 마이그레이션을 운영 적용 중 P3018 발생:

```
Error: P3018
Database error code: 42704
Database error: ERROR: role "bypassrls" does not exist
```

해당 마이그레이션의 SQL:

```sql
-- app_runtime: 일반 핸들러 — RLS 적용. BYPASSRLS 명시 REVOKE.
REVOKE BYPASSRLS FROM app_runtime;
```

PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) 환경.

## 원인

PostgreSQL 16의 `REVOKE` 파서는 `REVOKE <privilege_or_role> FROM <role>` 형식을 기본으로 해석한다.
`BYPASSRLS`는 **role attribute**(SUPERUSER, BYPASSRLS, LOGIN 등의 카테고리)로 `CREATE ROLE` / `ALTER ROLE` 절에서만 유효한 키워드.

`REVOKE BYPASSRLS FROM app_runtime`은 파서가 BYPASSRLS를 **role name**으로 해석 → `pg_roles`에서 `bypassrls` role을 찾으려 시도 → "role does not exist" 에러.

이는 PG 9.5(BYPASSRLS 도입) 이후 모든 버전에 해당하나, 일부 사례 / 가짜 문서 / LLM이 만든 SQL에서 자주 발견되는 함정.

## 해결

**Role attribute 변경은 항상 `ALTER ROLE`을 사용.**

```sql
-- 잘못된 구문 (P3018 발생)
REVOKE BYPASSRLS FROM app_runtime;

-- 정답
ALTER ROLE app_runtime NOBYPASSRLS;
```

마이그레이션 SQL 수정 후 `prisma migrate resolve --rolled-back <name>` → `prisma migrate deploy` 재실행.

같은 카테고리에 속하는 attribute (모두 `ALTER ROLE` 전용):
- `SUPERUSER` / `NOSUPERUSER`
- `CREATEDB` / `NOCREATEDB`
- `CREATEROLE` / `NOCREATEROLE`
- `INHERIT` / `NOINHERIT`
- `LOGIN` / `NOLOGIN`
- `REPLICATION` / `NOREPLICATION`
- `BYPASSRLS` / `NOBYPASSRLS`
- `CONNECTION LIMIT n`
- `PASSWORD '<pw>'`

`REVOKE`/`GRANT`로 처리하는 것은 **권한** (SELECT/INSERT/USAGE/...) 또는 **role 멤버십** (`GRANT app_admin TO app_runtime`).

## 교훈

- **role attribute** ≠ **권한** — 키워드만 보고 REVOKE/GRANT를 쓰면 안 됨.
- BYPASSRLS는 role attribute이므로 ALTER ROLE만 사용.
- LLM이 RLS 마이그레이션 SQL을 작성할 때 자주 함정 — 사전에 lint 또는 사전 적용 테스트 필수.
- Prisma `migrate dev` 환경(shadow DB)에서는 PG 버전이 다를 수 있어 발견 못할 수 있으나, 운영 적용 시점에 P3018으로 드러남.

## 관련 파일

- `prisma/migrations/20260427110000_phase1_4_rls_stage3/migration.sql`
- commit `f0d4443` — fix(migration/t1.4): PG 16 호환성 + 운영 DB drift 대응
