---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: integrations
---

# 12. Integrations

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Integrations
Explore
All
Wrappers
Postgres Modules
Installed
Cron
Data API
GraphiQL
GraphQL
Vault
beta
Extend your database
Extensions and wrappers that add functionality to your database and connect to external services.

Installed
Cron — Schedule recurring Jobs in Postgres
Data API — Auto-generate an API directly from your database schema
GraphiQL / GraphQL — Run GraphQL queries through our interactive in-browser IDE
Vault (beta) — Application level encryption for your project

Available Wrappers (partial list)
Airtable / Auth0 / BigQuery / Cal.com / Calendly / Clerk / ClickHouse
Cloudflare D1 / Cognito / Firebase / HubSpot / Iceberg / Logflare
Microsoft SQL Server / Notion / Orb / Paddle / Redis
S3 / S3 Vectors / Slack / Snowflake
Stripe Sync Engine (alpha) / Stripe Wrapper

Queues — Lightweight message queue in Postgres
Database Webhooks — Send real-time data when a table event occurs
```

## 드러난 UI / 기능 목록

- 카테고리 탭: **All / Wrappers / Postgres Modules / Installed**
- **Installed 상태**: Cron, Data API, GraphiQL+GraphQL, Vault(beta)
- **Wrappers (FDW) 30+종**: Airtable, Auth0, BigQuery, Clerk, ClickHouse, Cloudflare D1, Cognito, Firebase, HubSpot, Iceberg, Logflare, MSSQL, Notion, Orb, Paddle, Redis, S3(+Vectors), Slack, Snowflake, Stripe 등
- **Postgres Modules**: Cron, Queues, Database Webhooks 등 내장 확장
- **Stripe Sync Engine**(alpha) — Stripe → PG 연속 동기화

## 추론되는 기술 스택

- **Cron**: `pg_cron` 확장 — `cron.schedule('*/1 * * * *', $$ SQL $$)`
- **Data API**: **PostgREST** (Haskell) — DB 스키마에서 REST 자동 생성 + `?col=eq.value` 필터 DSL
- **GraphQL**: `pg_graphql` (Rust 확장)
- **Vault** (beta): `supabase/vault` + `pgsodium` (Authenticated Encryption)
- **Queues**: `pgmq` (메시지 큐 PG 확장)
- **Wrappers (FDW)**: `supabase/wrappers` (Rust) — Airtable/Stripe/S3/Firebase 등에 대한 Foreign Data Wrapper
- **Database Webhooks**: PG 트리거 + `pg_net` → 외부 HTTP
- **Stripe Sync Engine**: 별도 워커가 Stripe API 이벤트를 PG로 미러링
- **이 프로젝트로의 이식 우선순위**:
  - P0: Database Webhooks, Cron Jobs UI, Data API 자체 버전
  - P1: Queues(간단 큐), GraphQL
  - P2: Wrappers(FDW) — 외부 통합 수요 불명
