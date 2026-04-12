# Spike-005: Security / Performance / Query Advisors 자체 구현

- 작성일: 2026-04-12
- 대상: Next.js 15 + Prisma + PostgreSQL (양평 부엌 서버 대시보드)
- 상태: Draft → 결정 대기

## 1. 목적

Supabase Studio의 **Security Advisor** + **Performance Advisor** + **Query Performance** 패널을 자체 대시보드에 이식한다. 외부 SaaS 의존 없이 PostgreSQL 카탈로그(`pg_catalog`, `information_schema`)와 확장(`pg_stat_statements`, `pg_stat_user_indexes`, `pg_locks`)만으로 린트 규칙을 실행하고, 규칙별 심각도/원인/처방 리포트를 API로 노출하는 것이 목표.

## 2. GitHub 레퍼런스 (URL 검증 완료)

### 2.1 supabase/splinter — 본 스파이크의 핵심 레퍼런스
- URL: https://github.com/supabase/splinter
- 언어: PL/pgSQL 89.6%, PostgreSQL 15+ 요구
- 구조: `/lints/<rule_name>/<rule>.sql` 단위 모듈화, 루트 `splinter.sql`이 최신 규칙 집합
- 표준 출력 스키마: `name, title, level(ERROR|WARN|INFO), facing(EXTERNAL|INTERNAL), categories(SECURITY|PERFORMANCE), description, detail, remediation, metadata, cache_key`
- 실 규칙 예시 (레포 `/lints/`):
  - `auth_rls_initplan` — RLS 정책에서 `auth.uid()`를 `(select auth.uid())`로 감싸지 않아 행마다 재평가되는 케이스
  - `function_search_path_mutable` — `SECURITY DEFINER` 함수에 `search_path` 고정이 없어 탈취 가능
  - `no_primary_key` — public 테이블에 PK 부재
  - `unindexed_foreign_keys` — FK 컬럼에 인덱스 없음 (JOIN/DELETE 성능 저하)
  - `rls_disabled_in_public` — public 스키마 테이블인데 RLS 미활성

### 2.2 sbdchd/squawk — 마이그레이션 DDL 린트
- URL: https://github.com/sbdchd/squawk
- Rust 기반, DDL 파일 정적 분석 전용 (런타임 스키마 분석 아님)
- 대표 규칙: `require-concurrent-index`, `prefer-identity`, `ban-char-field`, `adding-required-field`
- 본 프로젝트에서는 **CI 훅**(Prisma migration SQL 검사)으로 병용 권장

### 2.3 기타 후보
- `kristiandupont/schemalint` — JS 기반, 네이밍/컬럼 패턴 규칙 커스터마이징 용이
- `dalibo/pgBadger` — 로그 기반 쿼리 분석 (pg_stat_statements 대안)
- `pg_querystats` / pganalyze 오픈 파츠 — 참고용, 유료 SaaS

결론: **splinter를 포팅 기준선으로 채택**, squawk는 CI 단계 보조.

## 3. 공식 docs

- `pg_stat_statements`: https://www.postgresql.org/docs/current/pgstatstatements.html
  - 핵심 컬럼: `queryid, query, calls, total_exec_time, mean_exec_time, rows, shared_blks_hit/read`
  - 활성화: `shared_preload_libraries = 'pg_stat_statements'`, `CREATE EXTENSION pg_stat_statements;`
- `pg_stat_user_indexes`: https://www.postgresql.org/docs/current/monitoring-stats.html
  - 핵심 컬럼: `idx_scan`(=0이면 미사용), `idx_tup_read`, `last_idx_scan`
- `pg_locks`: https://www.postgresql.org/docs/current/view-pg-locks.html
  - `pg_stat_activity` JOIN → 장기 `waiting` 세션 탐지
- Supabase Advisors 공식: https://supabase.com/docs/guides/database/database-advisors
- 보조: https://supabase.com/blog/security-performance-advisor

## 4. 자체 구현 난이도 — 우선순위 TOP 5

프로젝트는 Prisma 단일 스키마 기반이므로 RLS보다는 **인덱스/제약 위생**이 더 큰 이득.

| # | 규칙 | 심각도 | 탐지 SQL 스니펫 |
|---|---|---|---|
| 1 | **FK에 인덱스 없음** (`unindexed_foreign_keys`) | WARN | 아래 §4.1 |
| 2 | **public 테이블 RLS 미적용** (`rls_disabled_in_public`) | ERROR | 아래 §4.2 |
| 3 | **이메일 대소문자 구분 유니크 제약** (`email_case_sensitive_unique`) | WARN | 아래 §4.3 |
| 4 | **장기 실행 쿼리** (`long_running_query`) | INFO | 아래 §4.4 |
| 5 | **미사용 인덱스** (`unused_index`) | INFO | 아래 §4.5 |

`SELECT *` 경고는 런타임 쿼리 텍스트(`pg_stat_statements.query`) 정규식이라 False Positive가 많아 **후순위**.

### 4.1 FK 미인덱스
```sql
SELECT c.conrelid::regclass AS table, a.attname AS column
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
      AND i.indkey[0] = a.attnum
  );
```

### 4.2 RLS 미적용
```sql
SELECT n.nspname, c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity;
```

### 4.3 이메일 유니크가 `lower()` 인덱스가 아닌 경우
```sql
SELECT t.relname
FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
WHERE a.attname = 'email' AND i.indisunique
  AND pg_get_indexdef(i.indexrelid) NOT ILIKE '%lower(%';
```

### 4.4 장기 실행 쿼리 (>5초, 현재 active)
```sql
SELECT pid, now()-query_start AS runtime, state, query
FROM pg_stat_activity
WHERE state='active' AND now()-query_start > interval '5 seconds';
```

### 4.5 미사용 인덱스 (7일 이상)
```sql
SELECT schemaname, relname, indexrelname
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND (last_idx_scan IS NULL OR last_idx_scan < now() - interval '7 days');
```

**난이도 평가**: 1·2·5번은 `pg_catalog` 조회라 즉시 구현 가능 (1일). 3번은 커스텀. 4번은 `pg_stat_statements` 확장 선활성화 필요 — WSL2 PostgreSQL `postgresql.conf` 수정 + 재시작 1회.

## 5. 권장 아키텍처

```
src/lib/advisors/
├── types.ts                # AdvisorFinding, Severity, Category
├── registry.ts             # 모든 rule 모듈 import & 배열 export
├── runner.ts               # Prisma $queryRaw로 각 rule 실행 + 집계
└── rules/
    ├── unindexed-foreign-keys.ts
    ├── rls-disabled-in-public.ts
    ├── email-case-sensitive-unique.ts
    ├── long-running-query.ts
    └── unused-index.ts
```

각 rule 모듈 표준 인터페이스:
```ts
export const rule: AdvisorRule = {
  id: 'unindexed_foreign_keys',
  category: 'PERFORMANCE',
  severity: 'WARN',
  title: 'FK 컬럼에 인덱스 없음',
  sql: /* 위 §4.1 */,
  toFinding: (row) => ({ rule_id, severity, description, detail, remediation }),
};
```

API 라우트 (Next.js 15 App Router, Node runtime 고정):
- `GET /api/v1/advisors/security` — category=SECURITY rule만 실행
- `GET /api/v1/advisors/performance` — category=PERFORMANCE
- `GET /api/v1/advisors/query-performance` — `pg_stat_statements` TOP-N

응답 포맷 (splinter 호환):
```json
{ "findings": [
  { "rule_id": "unindexed_foreign_keys",
    "severity": "WARN",
    "description": "...", "detail": "table=orders column=user_id",
    "remediation": "CREATE INDEX ON orders(user_id);"
  }
]}
```

ADMIN 권한 가드 + 5분 `unstable_cache` 적용, 수동 새로고침 버튼은 `revalidateTag('advisors')`.

## 6. 결정

- **채택**: splinter 규칙 표준을 TS로 포팅. 단, PL/pgSQL 함수가 아닌 **TS rule 모듈 + `$queryRawUnsafe`** 조합으로 배포 단순화.
- **보류**: 실시간 알림/슬랙 통합은 v2 이후.
- **필수 선작업**: WSL2 PostgreSQL에 `pg_stat_statements` 활성화 (`shared_preload_libraries`).

## 7. 다음 TODO

1. [ ] WSL2 PostgreSQL `postgresql.conf`에 `shared_preload_libraries = 'pg_stat_statements'` 추가 후 재시작
2. [ ] `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` Prisma migration 작성
3. [ ] `src/lib/advisors/` 스캐폴드 + `types.ts` + `runner.ts` 구현
4. [ ] TOP 5 규칙 중 §4.1, §4.2, §4.5 먼저 구현 (확장 불필요)
5. [ ] `/api/v1/advisors/{security,performance}` 라우트 + ADMIN 가드
6. [ ] 대시보드 UI: `/admin/advisors` 페이지 (심각도 필터, 규칙별 상세 모달)
7. [ ] 스파이크 승인 후 ADR `docs/research/decisions/` 기록
