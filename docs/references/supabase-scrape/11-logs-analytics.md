---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: logs-analytics
---

# 11. Logs & Analytics

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Logs & Analytics
Coming soon
New logs
Get early access

Early access
Search collections
Search collections...

Templates

Collections
API Gateway
Postgres
PostgREST
Pooler
Auth
Storage
Realtime
Edge Functions
Cron

Database operations
Postgres Version Upgrade

Queries
No queries created yet

Create and save your queries to use them in the explorer

Create query
Capture your logs
Send logs to your preferred observability or storage platform.

Go to Log Drains

Insert source

Templates

Last hour

Field Reference
12345
select
  cast(timestamp as datetime) as timestamp,
  event_message, metadata 
from edge_logs 
limit 5

Results

Save query
Run
```

## 드러난 UI / 기능 목록

- 상단: `Coming soon` / `New logs` — 새 로그 플랫폼 early access
- **Collections (로그 소스 9종)**:
  - API Gateway / Postgres / PostgREST / Pooler / Auth / Storage / Realtime / Edge Functions / Cron
- **Database operations**: `Postgres Version Upgrade` 같은 플랫폼 이벤트
- **Queries**: BigQuery-like SQL 쿼리로 로그 탐색 ("Create and save your queries")
- **Log Drains**: 외부 관측 플랫폼(Datadog/Loki/Sentry/custom)으로 전송
- **Insert source / Templates** — 새 컬렉션 추가 or 템플릿 사용
- **Field Reference** — 필드 스키마 자동완성
- **쿼리 예시**:
  ```sql
  select
    cast(timestamp as datetime) as timestamp,
    event_message, metadata
  from edge_logs
  limit 5
  ```
- **Results / Save query / Run** — 실행 + 저장

## 추론되는 기술 스택

- **Logflare** (Supabase 자회사, Elixir) — 로그 수집/쿼리 엔진
- **BigQuery**-like 인터페이스 — 실제 백엔드는 Logflare가 BigQuery 또는 ClickHouse에 저장
- **Collections**: 서비스별 표준 로그 스키마(`edge_logs`, `postgres_logs`, `auth_logs` 등)
- **Log Drains**: HTTP POST(Datadog/Loki), Syslog, Vector 프로토콜
- **SQL 필드 자동완성**: `monaco-editor` + 컬럼 메타데이터
- **이 프로젝트로의 이식**:
  - 이미 `/logs`(SSE 기반 tail) 구현 완료 — 단일 소스
  - 이식할 것: **Log Drains 설정 UI**(현 프로젝트에서는 audit log 외부 전송 미구현) — DB 모델 `LogDrain`(type: http/loki/webhook, url, authHeaders, filters), 주기적 batch 전송
  - "Collections" 개념은 audit/metrics/sse-logs/nginx 등 여러 소스를 통합 뷰로 제공
