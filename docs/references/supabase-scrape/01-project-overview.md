---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: project-overview
---

# 01. Project Overview

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Crypto Chart Analysi
nano
https://enksnhshciyvllwfiwrm.supabase.co

Copy

Status
Healthy
Last migration
blog_content_to_html

Last backup
No backups

Recent branch
No branches

0
Total Requests

Last 60 minutes
Database requests
0
No data for selected period

Auth requests
0
No data for selected period

Storage requests
0
No data for selected period

Realtime requests
0
No data for selected period


Advisor found no issues

Ask Assistant
No security or performance errors found

Reports

Add block
Build a custom report
Keep track of your most important metrics
```

## 드러난 UI / 기능 목록

- 프로젝트 상단 고정 배너: 프로젝트명, compute tier(`nano`), API base URL(`<project-ref>.supabase.co`) + **Copy** 버튼
- 네비게이션 지속 표시: `main | Production` (브랜치 선택)
- 상단 빠른 액션: `Connect`, `Feedback`, 검색(`Ctrl K`), `Upgrade to Pro`
- **헬스 카드 4종**:
  - `Status`: Healthy
  - `Last migration`: 이름(`blog_content_to_html`)
  - `Last backup`: 값 또는 `No backups`
  - `Recent branch`: 값 또는 `No branches`
- **총 요청 수 대시보드 (최근 60분)**: `Database / Auth / Storage / Realtime` 각 서비스별 카운트
- **Advisor 요약**: `Advisor found no issues` / `No security or performance errors found`
- **Ask Assistant** — AI 어시스턴트 호출
- **Custom Reports 빌더**: `Add block`, `Build a custom report`

## 추론되는 기술 스택

- **단일 진입 대시보드**: 5~6개 핵심 지표 카드 + 4개 서비스 메트릭 라인차트
- **미니 차트**: `recharts`, `visx`, `apache-echarts` 등으로 sparkline/area 차트 렌더
- **Advisor summary**: 별도 Linter 결과를 요약 호출(추후 09번 참조)
- **브랜치 시스템**: DB 스키마 브랜치(미리보기 환경) — `supabase branches`, 백엔드는 logical replication + schema clone
- **"Last migration" 필드**: 마이그레이션 추적 테이블(예: `supabase_migrations.schema_migrations`)
- **AI Assistant**: Supabase Assistant(예: Claude/GPT 래핑) — 프로젝트 컨텍스트를 주입받은 LLM 챗
- **Custom Report Builder**: 위젯 드래그앤드롭(예: `react-grid-layout`) + 데이터 쿼리 빌더
