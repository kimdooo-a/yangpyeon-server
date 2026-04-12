---
title: 현 프로젝트 vs Supabase 기능 갭 분석
source: derived-from-supabase-scrape
captured: 2026-04-12
session: 14
---

# \_PROJECT\_VS\_SUPABASE\_GAP — 갭 분석 매트릭스

상위: [\_index.md](./_index.md) → **여기**

"양평 부엌 서버 대시보드" (Next.js 16 + Prisma 7 + PostgreSQL + WSL2/PM2) 현재 상태와 Supabase 13개 모듈 기능을 대조해 이식 우선순위를 확정한다.

## 현 프로젝트 기구현 요약 (세션 1~13)

- **라우트**: `/`, `/login`, `/processes`(PM2), `/filebox`, `/members`, `/audit`, `/metrics`(SSE), `/logs`, `/network`, `/settings/{env,ip-whitelist,users}`
- **DB**: PostgreSQL (Prisma, 모델 `User`/`Folder`/`File` + Role enum `ADMIN|MANAGER|USER`) + SQLite 보조(Drizzle, `auditLogs`/`metricsHistory`/`ipWhitelist`)
- **인증**: `jose` JWT + `bcrypt` + `withAuth`/`withRole` 래퍼
- **UI**: shadcn/ui + TanStack Table + recharts + Sonner, "Warm Ivory" 라이트 테마
- **배포**: WSL2 Ubuntu + PM2 + Cloudflare Tunnel
- **없음(신규 설치 필요)**: `@monaco-editor/react`, `@xyflow/react`, `elkjs`, `isolated-vm` (이번 Phase B에서 추가)

## 매트릭스

| Supabase 기능 | 현 프로젝트 상태 | 우선순위 | DAG 레이어 | 구현 전략 |
|---|---|---|---|---|
| **Organization / Projects** | 단일 프로젝트, 조직 없음 | P2 | — | 단일 조직 가정. RBAC로 대체. |
| **Project Overview (지표 카드)** | `/` + `/metrics` 분산 | P1 | L3 | 기존 대시보드에 "DB/Auth/Storage/Realtime 요청수" 카드 4개 추가 |
| **Table Editor** | 없음 | P1 | L2 | 읽기전용 뷰만 — Data API 완성 후 파생 |
| **SQL Editor** | 없음 | **P0** | L2 | monaco + `pg` 읽기전용 풀. `src/app/sql-editor/`, `SqlQuery` 모델 |
| **Schema Visualizer** | 없음 | **P0** | L2 | `@xyflow/react` + Prisma DMMF + information_schema. `src/app/database/schema/` |
| **Database / Tables·Functions·Triggers…** | Prisma schema로 관리 | P2 | — | Prisma가 전담, 개별 UI 불필요 |
| **Database Webhooks** | 없음 | **P0** | L2 | Prisma 모델 `Webhook` + 트리거 소스 선택 + 실행 로그 |
| **Database Roles** | PG 롤 2개(app, app_readonly) | L1 | L1 | SQL Editor를 위한 `app_readonly` 롤 생성 (L0에서 준비) |
| **Database Policies (RLS)** | 없음(애플리케이션 레벨 RBAC) | P2 | — | 현 RBAC 유지. RLS는 필요 시 P2. |
| **Database Replication** | 없음 | P2 | — | 단일 DB. 후속 Task. |
| **Database Backups / PITR** | 없음(UI) | **P0** | L2 | `pg_dump` 래퍼 + 파일 저장 + 다운로드. dev DB 한정 |
| **Database Migrations** | Prisma migrate | 기구현 | — | Prisma가 전담 |
| **Database Wrappers (FDW)** | 없음 | P2 | — | 요구 없음 |
| **Authentication Users** | `/members` 기구현 | 기구현 | — | — |
| **Authentication OAuth Apps** | 없음 | P1 | — | 후속 |
| **Authentication Policies/Providers** | 이메일+비번 단일 | P1 | — | Google OAuth 정도만 후속 |
| **Authentication MFA** | 없음 | P1 | — | TOTP (`otplib`) |
| **Authentication Rate Limits / Attack Protection** | IP whitelist만 | P1 | — | per-email 카운터(Redis 없으면 DB) |
| **Authentication Audit Logs** | `/audit` 기구현 | 기구현 | — | — |
| **Storage Buckets** | 로컬 폴더트리(`/filebox`) | 기구현(차이) | — | Supabase 방식 미이식. MIME 제한만 P2. |
| **Storage Policies** | RBAC로 대체 | 기구현 | — | — |
| **Edge Functions** | 없음 | **P0** | L2 | `worker_threads` + `node:vm` lite. `src/app/functions/`, `EdgeFunction` 모델 |
| **Edge Functions Secrets** | `/settings/env` 기구현 | 기구현 | — | 연결만 |
| **Realtime Channels + Inspector** | SSE만 있음 | **P0** | L2 | EventEmitter 기반 채널 + Inspector UI. `src/app/realtime/` |
| **Realtime Policies** | RBAC로 대체 | P2 | — | — |
| **Advisors Security** | 없음 | **P0** | L2 | splinter 포팅 TS 규칙 5개. `src/app/advisors/security/` |
| **Advisors Performance** | 없음 | **P0** | L2 | `pg_stat_statements` + FK 인덱스 검사. `src/app/advisors/performance/` |
| **Query Performance** | 없음 | P1 | — | Advisors 일부로 포함 |
| **Observability API Gateway** | `/network` 기구현(유사) | 기구현 | — | — |
| **Observability 서비스별 메트릭** | `/metrics` 단일 | P1 | — | 후속 |
| **Observability Requests by Geography** | 없음 | P2 | — | GeoIP 추가 비용 |
| **Observability Custom Reports** | 없음 | P2 | — | Widget Builder 요구 미검증 |
| **Logs Collections (9종)** | `/logs` 단일 소스 | P1 | — | audit/metrics/sse-logs/nginx 통합 뷰 P1 |
| **Log Drains** | 없음 | **P0** | L2 | HTTP + Loki 어댑터. `src/app/settings/log-drains/`, `LogDrain` 모델 |
| **Integrations Cron** | 없음 | **P0** | L2 | `src/app/database/cron/`, `CronJob` 모델, `node-cron` 레지스트리 |
| **Integrations Queues** | 없음 | P1 | — | DB 기반 간이 큐 후속 |
| **Integrations Data API (PostgREST)** | 없음 | **P0** | L2 | Prisma DMMF + 동적 [table] 라우트. `src/app/data-api/` |
| **Integrations GraphQL** | 없음 | P1 | — | 후속 |
| **Integrations Vault** | 없음 | P1 | — | 간이 암호화 저장 후속 |
| **Settings General** | `/settings/*` 분산 | 기구현(일부) | — | 프로젝트명·ID 보기 페이지 P1 |
| **Settings Compute & Disk** | 없음 | P2 | — | 단일 서버, 티어 선택 불가 |
| **Settings Infrastructure** | 없음 | P1 | — | Node/Next/Prisma/PG 버전 표시 페이지 후속 |
| **Settings Integrations (GitHub/Vercel)** | 없음 | P2 | — | 자체 호스팅, 불필요 |
| **Settings API Keys** | JWT 수동 | **P0** | L2 | publishable/secret 이중화 + 해시 저장. `src/app/settings/api-keys/`, `ApiKey` 모델 |
| **Settings JWT Keys / Signing** | Legacy single secret | **P0** | L2 | Signing key 로테이션 지원. `src/lib/auth/signing.ts` |
| **Settings Add-ons (IPv4/PITR/Custom Domain)** | Cloudflare Tunnel | P2 | — | 현 구성 충분 |
| **Settings Data API toggle** | 없음 | P0 파생 | L2 | Data API 페이지 내 on/off 스위치로 |
| **Settings Vault** | 없음 | P1 | — | 후속 |
| **Settings Billing / Usage** | 없음 | P2 | — | 자체 호스팅, 불필요 |

## P0 11개 모듈 최종 확정 (Phase B 대상)

1. **SQL Editor** — `/sql-editor/`
2. **Schema Visualizer** — `/database/schema/`
3. **Advisors (Security + Performance)** — `/advisors/security/`, `/advisors/performance/`
4. **Edge Functions (lite)** — `/functions/`
5. **Realtime Channels** — `/realtime/`
6. **Data API (auto-gen REST)** — `/data-api/` + `/api/v1/data/[table]`
7. **Database Webhooks** — `/database/webhooks/`
8. **Cron Jobs** — `/database/cron/`
9. **API Keys (publishable/secret)** — `/settings/api-keys/`
10. **Backups (UI, dev DB 한정)** — `/database/backups/`
11. **Log Drains** — `/settings/log-drains/`

## DAG 계층

```
L0 (계약 — 순차):
  - prisma/schema.prisma 모델 6개 추가 (SqlQuery, EdgeFunction, Webhook, CronJob, ApiKey, LogDrain)
  - src/lib/types/supabase-clone.ts (공용 타입)
  - src/components/layout/sidebar.tsx 네비 스캐폴드 (플레이스홀더)
  - PG 롤 app_readonly 생성 스크립트(수동 실행 안내)

L1 (기반 — 2 병렬):
  - src/lib/pg/introspect.ts (Schema Viz + Data API + Advisors 공유)
  - src/lib/runner/isolated.ts (Edge Functions + Cron 공유)

L2 (구현 — 최대 8 병렬):
  11개 P0 모듈

L3 (통합 — 순차):
  - RBAC 가드 일관 적용
  - 사이드바 최종 그룹핑
  - Prisma migrate dev --create-only 드래프트 생성
```

## 역링크
- [../\_index.md](./_index.md)
- [./\_SUPABASE\_TECH\_MAP.md](./_SUPABASE_TECH_MAP.md)
- [../research/decisions/ADR-002-supabase-adaptation-strategy.md](../research/decisions/ADR-002-supabase-adaptation-strategy.md)
