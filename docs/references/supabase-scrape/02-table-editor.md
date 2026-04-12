---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: table-editor
---

# 02. Table Editor

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Table Editor

schema

public


New table
Search tables
Search tables...

Create a table
Design and create a new database table

Recent items
No recent items yet

Items will appear here as you browse through your project

Background pattern

New
name·where id = 10
Red
Blue
Queue row edits in Table Editor

Batch multiple row edits and review them before saving to your database
```

## 드러난 UI / 기능 목록

- 왼쪽 패널: **Schema 선택 드롭다운** (default: `public`) + **Search tables** + **New table** 버튼
- 메인 영역: 빈 상태(No recent items yet) — 테이블 목록이 비면 플레이스홀더 노출
- `Create a table` 카드 — 스키마 디자이너 진입
- `Background pattern` — 시각 스타일 UI 옵션
- 샘플 배지: `New`, `name·where id = 10`, `Red`, `Blue` — 셀 편집/필터 표시 시각
- **Queue row edits**: 여러 row 수정을 큐에 쌓고 일괄 저장(Batch edit) 기능

## 추론되는 기술 스택

- **DDL 어시스턴트**: 테이블 생성 폼(컬럼/제약/FK/기본값/PK) → SQL 생성 → `postgres-meta` 또는 `information_schema` 기반
- **스키마 탐색**: `pg_catalog.pg_namespace` + `pg_tables`에서 스키마/테이블 목록
- **row 편집 큐**: 프론트 상태에 낙관적 변경 누적 → `BEGIN; UPDATE...; COMMIT;` 트랜잭션 일괄 실행
- **셀 편집 UX**: `TanStack Table` 또는 `AG Grid` 기반 인라인 편집
- **필터 문법**: `where id = 10` 같은 칼럼·연산자·값 UI → SQL WHERE 절로 변환
- **프로젝트 격리**: `schema=public` 외에도 `auth`, `storage`, `realtime` 등 내부 스키마가 존재 (권한별 노출)
