---
title: Supabase 페이지 → OSS/표준 기술 매핑
source: derived-from-supabase-scrape
captured: 2026-04-12
session: 14
---

# \_SUPABASE\_TECH\_MAP — 페이지별 기술 추론 매핑

상위: [\_index.md](./_index.md) → **여기**

Supabase 대시보드 13개 페이지(→ [`supabase-scrape/`](./supabase-scrape/_index.md))를 관통하는 OSS/표준 기술을 식별하고, 1차(GitHub) → 2차(공식 docs) → 3차(자체 구현) 경로를 정리한 매핑표입니다.

## 1. 매핑 개요

| # | 페이지 | 핵심 기술 | 라이선스 / 언어 | 현 프로젝트 매핑 전략 |
|---|--------|----------|----------------|---------------------|
| 00 | Organization / Projects | multi-tenancy 패턴 | — | 단일 조직, `User.role` RBAC로 단순화 |
| 01 | Project Overview | 메트릭 집계 + sparkline | — | 기존 `/metrics` SSE 확장 |
| 02 | Table Editor | `postgres-meta`, TanStack Table | Apache-2.0 / Node | P1 — 읽기 전용 뷰만 먼저 |
| 03 | SQL Editor | `monaco-editor` + `pg` | MIT / TS | **P0** — spike-005-sql-editor |
| 04 | Database | `@xyflow/react` + `pg_catalog` | MIT / TS | **P0** — spike-005-schema-visualizer |
| 05 | Authentication | `supabase/auth` (GoTrue) | Apache-2.0 / Go | 자체 `jose`+bcrypt 완료, MFA/Hooks P1 |
| 06 | Storage | `supabase/storage-api` + S3 | Apache-2.0 / Node | 로컬 파일시스템 유지, MIME 제한 추가 P2 |
| 07 | Edge Functions | `supabase/edge-runtime` (Deno) | Apache-2.0 / Rust | **P0** — Node worker_threads lite (spike-005-edge-functions) |
| 08 | Realtime | `supabase/realtime` (Phoenix) | Apache-2.0 / Elixir | 기존 SSE 확장 (Channel 관리 UI 추가) |
| 09 | Advisors | `supabase/splinter` | Apache-2.0 / PL/pgSQL | **P0** — TS 포팅 (spike-005-advisors) |
| 10 | Observability | 자체 집계 + GeoIP | — | 현 `/metrics`+`/network` 확장 |
| 11 | Logs & Analytics | `Logflare` + BigQuery | Apache-2.0 / Elixir | 현 `/logs` 유지 + **Log Drains UI 신규** |
| 12 | Integrations | PostgREST / pg_graphql / pgmq / pg_cron / Wrappers | 다양 | **P0** Data API / Webhooks / Cron, P1 GraphQL / Queues, P2 Wrappers |
| 13 | Settings | Stripe Billing / JWKS / pgsodium | 다양 | **P0** API Keys / JWT Signing Keys / Log Drains / Backups UI |

## 2. 상세 기술별 레퍼런스

### 2.1 SQL Editor
- **1차 GitHub**:
  - [`supabase/supabase` studio](https://github.com/supabase/supabase/tree/master/apps/studio/components/interfaces/SQLEditor) — 구조 학습 (AGPL 주의)
  - [`sqlpad/sqlpad`](https://github.com/sqlpad/sqlpad) — self-hosted SQL GUI
  - [`outerbase/studio`](https://github.com/outerbase/studio) — Next.js 기반
  - [`DTStack/monaco-sql-languages`](https://github.com/DTStack/monaco-sql-languages) — monaco PG 하이라이트
- **2차 docs**: [`@monaco-editor/react`](https://www.npmjs.com/package/@monaco-editor/react), [node-postgres transactions](https://node-postgres.com/features/transactions), [Prisma Raw queries](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries)
- **3차 자체 구현**: 난이도 **M**. 읽기 전용 PG role(`app_readonly`) + `BEGIN READ ONLY` + `statement_timeout` + 키워드 블랙리스트. Prisma `$queryRawUnsafe` 금지, `pg` 풀 분리.
- 상세: [spike-005-sql-editor.md](../research/spikes/spike-005-sql-editor.md)

### 2.2 Schema Visualizer
- **1차 GitHub**:
  - [`xyflow/xyflow`](https://github.com/xyflow/xyflow) — React Flow 공식 (MIT)
  - [`keonik/prisma-erd-generator`](https://github.com/keonik/prisma-erd-generator) — DMMF 파서 (MIT)
  - [`azimuttapp/azimutt`](https://github.com/azimuttapp/azimutt) — ERD 에디터
  - [`zernonia/supabase-schema`](https://github.com/zernonia/supabase-schema) — Supabase 스키마 시각화
- **2차 docs**: [React Flow Custom Nodes](https://reactflow.dev/learn/customization/custom-nodes), [PostgreSQL key_column_usage](https://www.postgresql.org/docs/current/infoschema-key-column-usage.html)
- **3차 자체 구현**: 난이도 **S**(1일). Prisma DMMF + `information_schema` 조인 → `@xyflow/react` 렌더 + `elkjs` 레이아웃.
- 상세: [spike-005-schema-visualizer.md](../research/spikes/spike-005-schema-visualizer.md)

### 2.3 Advisors (Security / Performance)
- **1차 GitHub**:
  - [`supabase/splinter`](https://github.com/supabase/splinter) — PL/pgSQL Lint (Apache-2.0)
  - [`sbdchd/squawk`](https://github.com/sbdchd/squawk) — DDL 린트
  - [`kristiandupont/schemalint`](https://github.com/kristiandupont/schemalint) — JS 린트
- **2차 docs**: [Supabase Database Advisors](https://supabase.com/docs/guides/database/database-advisors), [`pg_stat_statements`](https://www.postgresql.org/docs/current/pgstatstatements.html), [PostgreSQL Monitoring Stats](https://www.postgresql.org/docs/current/monitoring-stats.html)
- **3차 자체 구현**: 난이도 **M**. TS 규칙 모듈화(`src/lib/advisors/rules/*.ts`) + `pg_stat_statements` 확장 활성화 선결.
- 상세: [spike-005-advisors.md](../research/spikes/spike-005-advisors.md)

### 2.4 Edge Functions (Lite)
- **1차 GitHub**:
  - [`laverdet/isolated-vm`](https://github.com/laverdet/isolated-vm) — V8 격리 (권장 v2)
  - [`vercel/sandbox`](https://vercel.com/docs/sandbox) — microVM (원격 오프로드 v3)
  - vm2 → **DEPRECATED + 취약**, 사용 금지
- **2차 docs**: [`node:worker_threads`](https://nodejs.org/api/worker_threads.html), [`node:vm`](https://nodejs.org/api/vm.html)
- **3차 자체 구현**: v1 lite — `worker_threads` + `node:vm` + `resourceLimits` + safeFetch 화이트리스트 + ADMIN 전용. 외부 미노출.
- 상세: [spike-005-edge-functions.md](../research/spikes/spike-005-edge-functions.md)

### 2.5 Data API (Auto-generate REST)
- **1차 GitHub**:
  - [`PostgREST/postgrest`](https://github.com/PostgREST/postgrest) — Haskell 공식
  - [`chax-at/prisma-filter`](https://github.com/chax-at/prisma-filter) — URL → Prisma where
  - `subzerocloud` — PostgREST 엔진 포팅
- **2차 docs**: [PostgREST](https://docs.postgrest.org/), [Prisma DMMF](https://github.com/prisma/prisma/blob/main/packages/generator-helper/src/dmmf.ts)
- **3차 자체 구현**: 난이도 **M**(1.5일). Prisma DMMF + Next.js `[table]` 동적 라우트 + operator parser(eq/neq/gt/gte/lt/lte/like/ilike/in) + allowlist(passwordHash 영구 제외) + Prisma `where` 주입으로 RLS 대체.
- 상세: [spike-005-data-api.md](../research/spikes/spike-005-data-api.md)

### 2.6 Auth (GoTrue) — 참조만, 자체 구현 유지
- **1차**: [`supabase/auth`](https://github.com/supabase/auth) (GoTrue)
- 현 프로젝트: `jose`(JWT) + `bcrypt` + Prisma User 모델 — **이미 구현 완료**. 추가로 P1: MFA(TOTP `otplib`), Rate Limits, Attack Protection.

### 2.7 Storage (storage-api) — 로컬 유지
- **1차**: [`supabase/storage`](https://github.com/supabase/storage)
- 현 프로젝트: 로컬 파일시스템 + Prisma Folder/File 트리. MIME/크기 제한만 P2 추가.

### 2.8 Realtime (Elixir/Phoenix) — SSE 확장
- **1차**: [`supabase/realtime`](https://github.com/supabase/realtime)
- 현 프로젝트: SSE 기반 `/api/sse/logs`, `/api/metrics/stream`. Realtime "Channels" 개념을 EventEmitter + 채널 필터로 구현.

### 2.9 Webhooks / Cron / Queues / GraphQL
- **1차 GitHub**: [`citusdata/pg_cron`](https://github.com/citusdata/pg_cron), [`tembo-io/pgmq`](https://github.com/tembo-io/pgmq), [`supabase/pg_graphql`](https://github.com/supabase/pg_graphql)
- 현 프로젝트: Node `node-cron` 또는 자체 setInterval 레지스트리 사용(PG 확장 없이).

### 2.10 Vault (pgsodium)
- **1차**: [`supabase/vault`](https://github.com/supabase/vault), [`michelp/pgsodium`](https://github.com/michelp/pgsodium)
- 현 프로젝트: P1 — 환경변수 저장용 간이 Vault(`crypto.createCipheriv` + master key in env).

### 2.11 Wrappers (FDW)
- **1차**: [`supabase/wrappers`](https://github.com/supabase/wrappers)
- 현 프로젝트: **우선순위 P2 이하**. 자체 호스팅이므로 실제 외부 서비스 연동 필요도가 낮음.

### 2.12 Log Drains
- **1차**: [`vectordotdev/vector`](https://github.com/vectordotdev/vector), [`fluent/fluent-bit`](https://github.com/fluent/fluent-bit)
- 현 프로젝트: P0 — HTTP webhook drain + Loki drain 어댑터. `LogDrain` Prisma 모델 + batch 전송 워커.

## 3. 우선순위 요약

| 우선순위 | 대상 |
|---------|------|
| **P0** (이번 시즌 Phase B) | SQL Editor, Schema Visualizer, Advisors, Edge Functions(lite), Realtime Channels UI, Data API, Database Webhooks, Cron Jobs UI, API Keys/JWT Signing Keys, Backups UI(dev DB), Log Drains UI |
| **P1** (다음 시즌) | MFA, Rate Limits, Attack Protection, GraphQL 엔드포인트, Queues, Vault, Table Editor 읽기뷰, Compute/Infrastructure 메트릭 탭 |
| **P2** (보류) | Storage 버킷(S3 호환), Wrappers(FDW), Custom Reports Builder, Community 쿼리, AI Assistant |

## 역링크
- [../\_index.md](./_index.md)
- [./\_PROJECT\_VS\_SUPABASE\_GAP.md](./_PROJECT_VS_SUPABASE_GAP.md)
- [../research/decisions/ADR-002-supabase-adaptation-strategy.md](../research/decisions/ADR-002-supabase-adaptation-strategy.md)
