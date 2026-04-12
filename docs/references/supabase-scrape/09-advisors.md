---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: advisors
---

# 09. Advisors

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Advisors
New
Moving to the toolbar
Advisors are now available in the top toolbar for quicker access across the dashboard.

Try it now
Advisors
Security Advisor
Performance Advisor
Query Performance
Configuration
Settings
Security Advisor
Docs

Errors
0 errors

Warnings
5 warnings

Info
0 suggestions
Filter

Refresh

Export

Reset suggestions
Consider resetting the analysis after making any changes

Rerun linter
How are these suggestions generated?
```

## 드러난 UI / 기능 목록

- **Advisors 3종**: Security Advisor / Performance Advisor / Query Performance
- **Configuration / Settings** 서브 항목
- 공통 UI 요소:
  - 심각도 카운터: **Errors / Warnings / Info**
  - 필터 드롭다운
  - Refresh, Export 버튼
  - **Reset suggestions** — 수정 후 재실행 권장
  - **Rerun linter** — 규칙 재실행
  - "How are these suggestions generated?" — 규칙 설명 링크
- 최상단 상시 노출 (툴바로 이동)

## 추론되는 기술 스택

- **Security/Performance Advisor**: `supabase/splinter`(PL/pgSQL 기반 규칙셋)
  - `auth_rls_initplan` (RLS가 각 row마다 함수 호출 — perf)
  - `function_search_path_mutable` (함수 search_path 고정 권장 — security)
  - `no_primary_key` (PK 누락)
  - `unindexed_foreign_keys` (FK에 인덱스 없음)
  - 그 외 다수
- **Query Performance**: `pg_stat_statements` + `pg_stat_user_indexes` + `pg_stat_activity`
- 결과 포맷: `{rule_id, severity(error/warn/info), description, remediation_sql}`
- **이 프로젝트로의 이식**:
  - `src/lib/advisors/rules/*.ts` 모듈화(TS 규칙) — PL/pgSQL 대신
  - 결과 캐시(`unstable_cache` + `revalidateTag`)
  - `/api/v1/advisors/{security,performance,query-performance}` + ADMIN 가드
  - 상세는 [spike-005-advisors.md](../../research/spikes/spike-005-advisors.md)
