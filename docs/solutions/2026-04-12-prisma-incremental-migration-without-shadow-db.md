---
title: Prisma 7.x — shadow DB 없이 증분 마이그레이션 생성하기
date: 2026-04-12
session: 16
tags: [prisma, migration, shadow-database, wsl2, postgresql]
category: workaround
confidence: high
---

## 문제
`prisma migrate diff`로 증분 SQL을 생성해 기존 마이그레이션 위에 얹으려 했으나 연속 실패:

```
$ npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --script
Error: You must pass the `--shadow-database-url` flag or set `datasource.shadowDatabaseUrl` in your `prisma.config.ts` if you want to diff a migrations directory.

$ npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema ./prisma/schema.prisma --script
Error: `--from-url` was removed. Please use `--[from/to]-config-datasource`

$ npx prisma migrate diff --from-config-datasource --to-schema ./prisma/schema.prisma --script
Error: P1001 Can't reach database server at `localhost:5432`
```

3가지 경로 모두 차단:
- `--from-migrations`: shadow DB 필수
- `--from-url`: Prisma 7.x에서 제거됨
- `--from-config-datasource`: WSL2에 있는 PG에 Windows에서 접근 불가 (네트워크 분리)

## 원인
- **Prisma 7.x의 API 변경**: `--from-url` → `--from-config-datasource`로 리네임
- **Shadow DB 요구**: `migrate diff`가 마이그레이션 디렉토리를 파싱해 가상 스키마를 만들려면 임시 DB가 필요. `DATABASE_URL` 유저가 `CREATE DATABASE` 권한을 가져야 자동 생성됨
- **WSL2 네트워크 격리**: Windows의 `localhost:5432`는 WSL2 내부 PG에 도달하지 않음 (WSL2는 NAT 또는 `wsl.localhost` mirror 필요)

## 해결
**수동 증분 SQL 작성 + `prisma migrate deploy`로 적용**:

1. **전체 스키마 스냅샷 생성** (empty → target):
   ```bash
   npx prisma migrate diff --from-empty --to-schema ./prisma/schema.prisma --script > all_tables_from_empty.sql
   ```
   이건 shadow DB 없이도 작동 (migrations 디렉토리를 건드리지 않으므로)

2. **기존 적용분 파악** (applied migrations 스캔):
   ```bash
   ls prisma/migrations  # → init_users, add_filebox
   cat prisma/migrations/*/migration.sql  # 이 둘이 생성한 enum/table/index/FK 목록화
   ```

3. **증분만 추출**: `all_tables_from_empty.sql`에서 기존 적용분 제거 → 신규 증분 `session_14_incremental.sql` 작성

4. **Prisma 마이그레이션 폴더로 승격**:
   ```bash
   MIG=20260412120000_supabase_clone_session_14
   mkdir -p prisma/migrations/$MIG
   cp session_14_incremental.sql prisma/migrations/$MIG/migration.sql
   ```

5. **적용**:
   ```bash
   npx prisma migrate status   # → "Following migration have not yet been applied: ..."
   npx prisma migrate deploy   # → transaction-wrapped, auto-rollback on failure
   ```

## 교훈
- Prisma 7.x에서 `migrate diff`의 `--from-url` 삭제를 몰랐다면 쉽게 막힌다 — 에러 메시지가 친절해서 구제됨
- **수동 증분 SQL + `migrate deploy`는 shadow DB 의존성을 우회하는 가장 견고한 경로**. `migrate dev`는 dev-only + shadow 필수라 프로덕션/제한환경에선 부적합
- WSL2에서 PG 운영 시 Windows 쪽 Prisma 명령은 DB에 닿지 못함을 항상 가정. 라이브 DB 연산은 WSL2 쉘에서 실행
- 증분을 수동 작성할 땐 "기존 적용분 목록 → 제거" 대신 "full schema → applied migrations diff"의 **반대 방향 비교**도 가능. 아무튼 한 번 만들어두면 `migrate deploy`가 `_prisma_migrations` 기록까지 자동으로 남겨준다

## 관련 파일
- `prisma/migrations/20260412120000_supabase_clone_session_14/migration.sql` (승격된 증분)
- `prisma/migrations-draft/session_14_incremental.sql` (생성 시 중간 산물)
- `prisma.config.ts` (datasource 연결, shadow DB 미설정)
