---
title: Supabase 대시보드 스크랩 원본 색인
source: user-provided-scrape
captured: 2026-04-12
session: 14
---

# Supabase 대시보드 스크랩 — 색인

상위: [../\_index.md](../_index.md) → **여기**

사용자가 Supabase 대시보드 각 페이지를 드래그로 긁어 제공한 원본 텍스트입니다. 이 프로젝트(`양평 부엌 서버 대시보드`)의 프로젝트 관리 체계를 Supabase 스타일로 이식하기 위한 레퍼런스입니다.

**원본은 가공하지 않고 보존합니다.** 추론과 매핑은 별도 문서에서 수행합니다:
- [`../_SUPABASE_TECH_MAP.md`](../_SUPABASE_TECH_MAP.md) — 각 UI 기능의 추정 OSS 기술 스택
- [`../_PROJECT_VS_SUPABASE_GAP.md`](../_PROJECT_VS_SUPABASE_GAP.md) — 현 프로젝트 상태 vs Supabase 갭 분석
- [`../../research/decisions/ADR-002-supabase-adaptation-strategy.md`](../../research/decisions/ADR-002-supabase-adaptation-strategy.md) — 이식 전략 결정
- `../../research/spikes/spike-005-*.md` — 모듈별 리서치

## 14개 문서

| # | 파일 | 모듈 | 요약 |
|---|------|------|------|
| 00 | [00-organization-projects.md](./00-organization-projects.md) | Organization / Projects | 조직 → 프로젝트 리스트, Vercel Marketplace 연계 |
| 01 | [01-project-overview.md](./01-project-overview.md) | Project Overview | Status, Last migration, Total Requests 대시보드 |
| 02 | [02-table-editor.md](./02-table-editor.md) | Table Editor | GUI DB 편집, Batch edit 큐 |
| 03 | [03-sql-editor.md](./03-sql-editor.md) | SQL Editor | 쿼리 저장/공유, Primary DB 선택, role 선택 |
| 04 | [04-database.md](./04-database.md) | Database | Schema/Tables/Functions/Triggers/Enums/Extensions/Indexes/Roles/Policies/Replication/Backups/Migrations/Wrappers/Webhooks/Advisors |
| 05 | [05-authentication.md](./05-authentication.md) | Authentication | Users/OAuth/Providers/Sessions/MFA/Rate Limits/Attack Protection/Hooks/Audit |
| 06 | [06-storage.md](./06-storage.md) | Storage | Buckets, MIME/크기 제한, S3 호환 |
| 07 | [07-edge-functions.md](./07-edge-functions.md) | Edge Functions | 서버리스 함수 배포, 11개 템플릿 |
| 08 | [08-realtime.md](./08-realtime.md) | Realtime | Channels/Broadcast/RLS/Inspector |
| 09 | [09-advisors.md](./09-advisors.md) | Advisors | Security/Performance/Query Performance Linter |
| 10 | [10-observability.md](./10-observability.md) | Observability | API Gateway, Query Perf, Geo, Custom Reports |
| 11 | [11-logs-analytics.md](./11-logs-analytics.md) | Logs & Analytics | Collections, Log Drains, BigQuery-like 쿼리 |
| 12 | [12-integrations.md](./12-integrations.md) | Integrations | Wrappers(30+), Cron/Queues/Data API/GraphiQL/Vault |
| 13 | [13-settings.md](./13-settings.md) | Settings | General/Compute/Infra/Integrations/API Keys/JWT/Log Drains/Add-ons |

## 역링크
- [../\_index.md](../_index.md) — references 전체 색인
- [../../../CLAUDE.md](../../../CLAUDE.md) — 문서 체계 루트
