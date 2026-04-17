---
title: information_schema 제약 뷰가 제한 롤에서 0행 반환 — PK 쿼리 회귀
date: 2026-04-17
session: 21
tags: [postgresql, app_readonly, information_schema, pg_catalog, phase-14a, phase-14b, table-editor]
category: bug-fix
confidence: high
---

## 문제

Phase 14b 구현 후 프로덕션 브라우저 E2E에서 `/tables/folders` 페이지가 "PK 없는 테이블 — 편집 불가" 메시지를 표시. `/api/v1/tables/folders/schema` 응답을 확인하니:

```json
{
  "success": true,
  "data": {
    "columns": [{"name":"id","isPrimaryKey":false}, ...],
    "primaryKey": null,
    "compositePk": false
  }
}
```

`folders` 테이블은 명백히 `id` 컬럼에 PRIMARY KEY가 있음 (`\d folders` 출력으로 확인). 그럼에도 `isPrimaryKey: false` + `primaryKey: null`.

추가 추적: psql에서 직접 쿼리 실행 결과 비교:
```sql
-- superuser (postgres) 역할
SET ROLE postgres;
SELECT kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_name = 'folders';
-- → 'id' 반환

-- app_readonly 롤
SET ROLE app_readonly;
-- 동일 쿼리
-- → 0행 반환
RESET ROLE;
```

## 원인

PostgreSQL `information_schema` 뷰는 **현재 사용자의 privilege를 기반으로 필터링**하는 구조로 설계됨. 특히 `table_constraints`와 `key_column_usage`는 해당 constraint를 "볼 수 있는" 권한(ownership 또는 references)이 있어야 행을 반환.

`app_readonly` 롤은 `GRANT SELECT ON ALL TABLES` 만 보유 — 테이블에 대한 **REFERENCES/OWNERSHIP이 없어** constraint 메타 뷰 결과가 비게 됨.

세션 17 Phase 14a 구현 시 이 쿼리가 schema/route.ts에 도입됐으나, 당시 E2E 검증이 "타입 배지 렌더링"과 "컬럼 수" 중심이어서 **PK 배지가 조용히 사라진 상태로 세션 17~20 동안 프로덕션에 존재**. Phase 14b에서 PK 정보를 UI policy의 필수 입력으로 사용하면서 비로소 드러남.

## 해결

`pg_catalog`의 `pg_index` + `pg_attribute`로 전환 — SELECT 권한만으로 작동하며 regclass 캐스트로 테이블 존재 검증도 겸함.

**Before (정보 스키마, 권한 필터 영향):**
```sql
SELECT kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema    = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema    = 'public'
  AND tc.table_name      = $1
```

**After (pg_catalog, 롤 무관):**
```sql
SELECT a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_index i
JOIN pg_attribute a
  ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE i.indrelid = ('public.' || quote_ident($1))::regclass
  AND i.indisprimary
```

수정 커밋: `f288c88` (schema/route.ts + [pk]/route.ts 동시 수정).

## 교훈

1. **제한 롤로 쿼리하는 introspection 코드는 `pg_catalog`를 1차 선택**으로 고려 — `information_schema`는 SQL 표준이지만 privilege 기반 필터링이 내재된 뷰라서 NOLOGIN/SELECT-only 롤에서 예상과 다른 빈 결과를 반환.
2. **UI에 정보가 "표시되지 않음"은 "존재하지 않음"과 구별되는 테스트 케이스가 돼야 함** — Phase 14a E2E는 "렌더링 성공"을 확인했지만 "PK 배지가 실제 표시됐는가"를 확인하지 않아 회귀가 묻혔음.
3. **introspection 쿼리는 최고 권한 롤에서 돌리는 것이 일반적** — 필요하다면 `runReadonly` 호출 시 `useReadonlyRole: false` 옵션을 넘기거나, introspection 전용 헬퍼를 분리해 BEGIN READ ONLY + statement_timeout만 적용.

## 관련 파일

- `src/app/api/v1/tables/[table]/schema/route.ts` (수정)
- `src/app/api/v1/tables/[table]/[pk]/route.ts` (수정, introspect 함수)
- `src/lib/pg/pool.ts` (runReadonly의 app_readonly 롤 스위치 위치)
- `scripts/sql/create-app-readonly.sql` (세션 16) — GRANT 범위 참고
