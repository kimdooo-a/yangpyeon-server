---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: sql-editor
---

# 03. SQL Editor

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
SQL Editor
Search queries
Search queries...

Shared
Favorites
PRIVATE (5)
Community

View running queries

New
1
Hit CTRL+K to generate query or just start typing

Results
Explain
Chart

Source
Primary database

Role
postgres

Run
Ctrl ↵
Click Run to execute your query.
```

## 드러난 UI / 기능 목록

- 왼쪽: 쿼리 탐색 패널
  - 검색: `Search queries`
  - 그룹: **Shared / Favorites / PRIVATE (카운트) / Community**
  - `View running queries` — 실행 중인 쿼리 목록
  - `New` 쿼리 생성 버튼
- 에디터 영역:
  - 라인 번호
  - `Hit CTRL+K to generate query or just start typing` — AI 쿼리 생성 트리거
- 하단 결과 패널 탭: **Results / Explain / Chart**
- **실행 대상 선택**:
  - `Source`: `Primary database` (+ 읽기 복제본 가능성 암시)
  - `Role`: `postgres` (다른 role로 실행 가능)
- 실행: `Run` 버튼 + `Ctrl ↵` 단축키

## 추론되는 기술 스택

- **에디터**: `monaco-editor` (VSCode 엔진) + PostgreSQL 언어 서버(syntax highlight, autocomplete)
- **AI 쿼리 생성**: 자연어 → SQL 변환 LLM(schema 컨텍스트 주입) — `Ctrl+K` 트리거
- **쿼리 저장소**: DB 테이블(예: `saved_queries`) — 필드: owner, scope(shared/favorite/private/community), content, lastRun
- **실행 경로 격리**: `SET ROLE ...` + 연결 풀에서 읽기/쓰기 라우팅(Primary vs Read Replica)
- **Explain 탭**: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 결과 시각화 — flame-graph like(`pg-flame`, `pev2`)
- **Chart 탭**: SELECT 결과의 열을 X/Y/시리즈로 매핑하는 빠른 차트
- **Running queries**: `pg_stat_activity` 폴링 + kill 버튼
- **Community**: 공개 쿼리 리포지터리(Supabase 커뮤니티 컨텐츠)
