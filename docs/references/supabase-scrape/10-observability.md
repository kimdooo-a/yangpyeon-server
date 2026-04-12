---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: observability
---

# 10. Observability

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Observability
GENERAL
Query Performance
API Gateway
PRODUCT
Database
Data API
Auth
Edge Functions
Storage
Realtime
Custom Reports
No custom reports yet

Create and save custom reports to track your project metrics

New custom report
API Gateway

Last 60 minutes
All Requests
Add filter
Requests by Geography

Total Requests
5
```

## 드러난 UI / 기능 목록

- **GENERAL 섹션**:
  - Query Performance — DB 쿼리 레벨 메트릭
  - API Gateway — 모든 클라이언트 요청의 진입점
- **PRODUCT 섹션(서비스별 메트릭)**:
  - Database
  - Data API (PostgREST)
  - Auth (GoTrue)
  - Edge Functions
  - Storage
  - Realtime
- **Custom Reports** 빌더: 위젯 조합으로 대시보드 생성
- API Gateway 뷰:
  - 시간 범위 선택(`Last 60 minutes`)
  - `All Requests` + `Add filter`
  - **Requests by Geography** 지도 차트
  - Total Requests 카운트(5)

## 추론되는 기술 스택

- **API Gateway**: 모든 Supabase 트래픽을 Kong(legacy) 또는 envoy/자체 게이트웨이가 수신 → 로깅 + 라우팅
- **서비스별 메트릭 소스**:
  - Database: `pg_stat_database`, `pg_stat_activity`
  - PostgREST: 액세스 로그
  - Auth: GoTrue 메트릭(HTTP)
  - Edge Functions: Deno 런타임 메트릭
  - Storage: storage-api 액세스 로그
  - Realtime: Elixir BEAM VM 메트릭
- **Geography 지도**: GeoIP DB(MaxMind) + 세계지도 컴포넌트(`react-simple-maps` 또는 deck.gl)
- **Custom Reports**: `react-grid-layout` + 위젯 템플릿(Query/Chart/Counter)
- **이 프로젝트와의 차이**: 현재 `/metrics`(CPU/Mem 히스토리 차트), `/logs`, `/network`, `/audit`만 구현. 서비스별 분할 + Custom Reports 빌더 미구현. 우선순위 P2.
