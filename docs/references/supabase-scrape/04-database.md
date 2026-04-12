---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: database
---

# 04. Database

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Database
Database Management
Schema Visualizer
Tables
Functions
Triggers
Enumerated Types
Extensions
Indexes
Publications
Configuration
Roles
Policies
Settings
Platform
Replication
Backups
Migrations
Wrappers
Database Webhooks
Tools
Security Advisor
Performance Advisor
Query Performance

schema

public

Copy as SQL
Auto layout
```

## 드러난 UI / 기능 목록

- **Database Management 섹션**:
  - Schema Visualizer — ERD 그래프 (`Auto layout`, `Copy as SQL`)
  - Tables — 테이블 목록
  - Functions — 저장 함수(Postgres)
  - Triggers — 트리거
  - Enumerated Types — 커스텀 ENUM
  - Extensions — PG 확장 관리(pgcrypto, pg_cron, pgvector 등)
  - Indexes — 인덱스 관리
  - Publications — 논리 복제 publication
- **Configuration 섹션**:
  - Roles — DB 롤 관리
  - Policies — RLS 정책
  - Settings — 일반 DB 설정
- **Platform 섹션**:
  - Replication — 논리 복제 / Read Replica
  - Backups — 백업 관리
  - Migrations — 마이그레이션 이력
  - Wrappers — 외부 데이터 래퍼(FDW)
  - Database Webhooks — DB 이벤트 → HTTP 훅
- **Tools 섹션**:
  - Security Advisor
  - Performance Advisor
  - Query Performance
- 스키마 선택 드롭다운 `public`

## 추론되는 기술 스택

- **Schema Visualizer**: `@xyflow/react` + `elkjs`(자동 레이아웃) + `pg_catalog` + `information_schema`
- **Functions/Triggers/Enums/Extensions/Indexes**: 전부 `pg_proc`, `pg_trigger`, `pg_type`, `pg_extension`, `pg_indexes` 조회 + DDL 템플릿 생성
- **Publications**: `pg_publication`, `CREATE PUBLICATION ... FOR TABLE ...`
- **Roles**: `pg_roles` + `CREATE ROLE` / `ALTER ROLE` + 소유권/grant 매트릭스
- **Policies (RLS)**: `pg_policies` + `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ...`
- **Replication**: logical replication slots, PITR
- **Backups**: Supabase 자체 daily backup + PITR(WAL)
- **Migrations**: `supabase_migrations.schema_migrations` 테이블 + Supabase CLI
- **Wrappers (FDW)**: `supabase/wrappers`(Rust) — Airtable/Stripe/S3 등 30+
- **Database Webhooks**: PG 트리거 → `pg_net` HTTP call → 외부 URL
- **Advisors**: `supabase/splinter`(PL/pgSQL 규칙) + `pg_stat_statements`
