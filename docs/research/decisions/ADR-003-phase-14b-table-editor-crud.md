# ADR-003 — Phase 14b Table Editor CRUD 설계

> 상위: [CLAUDE.md](../../../CLAUDE.md) → [research/_SPIKE_CLEARANCE.md](../_SPIKE_CLEARANCE.md) → **여기**
> 관련 인수인계: [세션 18](../../handover/260412-session18-auth-refactor.md) · [Phase 14b 프롬프트](../../handover/phase-14b-crud-prompt.md)
> 작성일: 2026-04-12
> 상태: **승인 (Approved)** — 구현 착수 전

## 맥락

세션 18에서 Phase 14a 읽기 전용 Table Editor가 완성됐다. `GET /api/v1/tables`,
`GET /api/v1/tables/[table]`, `GET /api/v1/tables/[table]/schema`가 `app_readonly`
PG 롤 + `BEGIN READ ONLY` 이중 방어로 동작 중이며, TanStack Table v8 기반의 UI가
11개 public 테이블을 카드 그리드 + 페이지네이션으로 노출한다.

Phase 14b는 이 위에 **INSERT / UPDATE / DELETE**를 얹는다. 비가역 변경이 포함되므로
설계 결정 5건(D1~D5) + 추가 판단 3건(민감 테이블 범위, CRUD UI 범위, 감사 로그 경로,
롤 부재 정책, 폼 NULL/default 처리)을 **구현 전** 확정해야 한다.

## 결정

### D1. PK 감지 전략 — 단일 PK만 지원
- `information_schema.table_constraints` + `key_column_usage`로 단일 PK 조회
- 복합 PK → `400 COMPOSITE_PK_UNSUPPORTED`
- PK 없음 → `400 NO_PK_UNSUPPORTED`, UI에서 행 추가 버튼 비활성
- 이유: 현 DB 11개 public 테이블 전부 단일 uuid PK. 복합 PK는 Phase 14c 이후 재검토.

### D2. PG 타입별 값 coercion — 서버 사이드 전담
```
int2/int4/int8   → Number(String(raw)) + Number.isFinite 검증
numeric          → 문자열 그대로 전달 (정밀도 보존)
bool             → ["true","1",true] → true, 나머지 false (명시적 화이트리스트)
timestamptz/date → new Date(raw).toISOString(), Invalid Date → 400
uuid             → /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i
json/jsonb       → JSON.parse 시도, 실패 시 400
text/varchar     → String(raw)
```
실패 시 `CoercionError { column, reason }` throw → 400 `COERCE_FAILED` 응답.
응답 payload에 어느 컬럼이 실패했는지 포함.

### D3. 파라미터 바인딩 vs 식별자 escape
- **식별자 (테이블명·컬럼명·PK명)**: 정규식 `^[a-zA-Z_][a-zA-Z0-9_]*$` 검증 + DB
  대조(information_schema) + `quoteIdent`(이중따옴표 이스케이프)로 수동 처리.
- **값**: 반드시 `$1, $2…` 파라미터 바인딩. 문자열 보간 0건.

### D4. 감사 로그 페이로드 + 경로
- 경로: **Drizzle SQLite `audit_logs` 테이블 (`src/lib/audit-log-db.ts`)**
  영속 기록. 인메모리 버퍼(`audit-log.ts`)는 사용 안 함.
- 스키마:
  ```ts
  {
    timestamp: ISO,
    method: "POST"|"PATCH"|"DELETE",
    path: `/api/v1/tables/${table}/${pk ?? ""}`,
    ip: request 헤더에서 추출,
    action: "TABLE_ROW_INSERT"|"TABLE_ROW_UPDATE"|"TABLE_ROW_DELETE",
    detail: `${user.email} → ${table}${pk ? `(pk=${pk})` : ""}: ${JSON.stringify(diff)}`
  }
  ```
- 민감 테이블(`users`/`api_keys`)은 `detail`의 값 부분을 `[REDACTED]`로 대체하고
  컬럼명만 기록. 단, D5로 인해 해당 테이블은 CRUD 자체가 차단되므로 안전 보강 목적.

### D5. 권한 매트릭스 (실 DB 기반)

| 테이블 | INSERT | UPDATE | DELETE |
|---|---|---|---|
| `folders`, `files`, `sql_queries`, `edge_functions`, `webhooks`, `cron_jobs`, `log_drains` | MANAGER+ | MANAGER+ | ADMIN |
| `edge_function_runs` | ❌ | ❌ | ADMIN (로그 정리 목적만) |
| `users` | ❌ | ❌ | ❌ (별도 `/members`) |
| `api_keys` | ❌ | ❌ | ❌ (별도 `/settings/api-keys`) |
| `_prisma_migrations` | ❌ | ❌ | ❌ (Prisma 메타 보호) |

> 프롬프트 원안의 `audit_logs`는 Drizzle SQLite 쪽이라 PG Table Editor에 노출되지 않음 → 목록 제외.

### 추가 결정 A — CRUD UI 범위
모달 집중. **신규·수정 겸용 `RowFormModal`** + 행 오른쪽 삭제 버튼. 인라인 셀
편집은 Phase 14c로 분리 (낙관적 잠금과 묶음).

### 추가 결정 B — `runReadwrite` 롤 부재 정책
**Fail-closed.** `SET LOCAL ROLE app_readwrite` 실패 시 트랜잭션 ROLLBACK + 500
전파. `runReadonly`의 관대 정책(READ ONLY가 2차 방어)과 대비.

### 추가 결정 C — 폼 모달 NULL/default 처리
**3상태** — 각 컬럼 입력에 `action: "set" | "null" | "keep"` 플래그. 서버는
`keep`인 컬럼을 payload에서 제외 → INSERT는 DB default 적용, UPDATE는 해당 컬럼
SET 절 생략.

## 아키텍처 (4 레이어)

```
DB Role  ── app_readwrite (NOLOGIN, CRUD 권한)
  ↓
Library  ── pool.runReadwrite / table-policy / identifier / coerce / audit-log-db
  ↓
API      ── POST/PATCH/DELETE + schema(PK 확장)
  ↓
UI       ── RowFormModal (신규·수정 겸용) + 삭제 버튼
```

### 구성 요소 · 파일 매트릭스

| 파일 | 상태 | 책임 |
|---|---|---|
| `scripts/sql/create-app-readwrite.sql` | 신규 | NOLOGIN 롤 + 권한 + default privileges + postgres GRANT |
| `src/lib/pg/pool.ts` | 확장 | `runReadwrite` 추가 (fail-closed) |
| `src/lib/db/table-policy.ts` | 신규 | `{allowed, reason?}` 정책 엔진 |
| `src/lib/db/identifier.ts` | 신규 | `isValidIdentifier` + `quoteIdent` |
| `src/lib/db/coerce.ts` | 신규 | PG 타입별 coercion + `CoercionError` |
| `src/lib/audit-log-db.ts` | 확장 | `TABLE_ROW_*` 액션 + 민감 테이블 REDACT |
| `src/app/api/v1/tables/[table]/route.ts` | 확장 | POST 추가 |
| `src/app/api/v1/tables/[table]/[pk]/route.ts` | 신규 | PATCH + DELETE |
| `src/app/api/v1/tables/[table]/schema/route.ts` | 확장 | `primaryKey` 필드 응답 |
| `src/components/table-editor/row-form-modal.tsx` | 신규 | 3상태 입력 폼 |
| `src/components/table-editor/table-data-grid.tsx` | 확장 | 행 action 버튼(편집/삭제) |
| `src/app/(protected)/tables/[table]/page.tsx` | 확장 | "행 추가" CTA |

## 데이터 흐름 (UPDATE 예)

```
사용자 → 행 편집 클릭
  → GET /schema (PK, 타입 메타 포함) — 이미 캐시된 경우 재사용
  → RowFormModal 초기값에 현재 행 값 주입, action="keep"
  → 사용자 수정: 변경 컬럼만 action="set"|"null"
  → PATCH /api/v1/tables/[table]/[pk] {values}
     ↓
     [API 서버]
     ├ withRole(["ADMIN","MANAGER"])
     ├ identifier 정규식 + schema introspect (컬럼 + PK 화이트리스트)
     ├ table-policy.check(table, "UPDATE", user.role)
     ├ payload 컬럼 = 화이트리스트 ∩ action≠"keep"
     ├ coerce(col.dataType, value) 컬럼별
     ├ runReadwrite(
     │    `UPDATE "<ident>" SET "<col>"=$1,... WHERE "<pk>"=$N RETURNING *`,
     │    [...values, pk])
     ├ audit-log-db insert(action:"TABLE_ROW_UPDATE", detail: 민감 테이블이면 [REDACTED])
     └ return updated row
     ↓
  → 성공: 모달 닫고 re-fetch (보수적 UI)
  → 실패: 모달 안 에러 표시 (컬럼 단위 강조)
```

## 에러 매핑

| 상황 | HTTP | 코드 |
|---|---|---|
| 식별자 위반 | 400 | `INVALID_TABLE` / `INVALID_COLUMN` |
| coerce 실패 | 400 | `COERCE_FAILED` (column, reason) |
| policy 위반 | 403 | `OPERATION_DENIED` |
| 권한 부족 | 403 | `FORBIDDEN` |
| 테이블/행 미존재 | 404 | `NOT_FOUND` |
| 복합 PK | 400 | `COMPOSITE_PK_UNSUPPORTED` |
| PK 없음 | 400 | `NO_PK_UNSUPPORTED` |
| 롤 부재 / 쿼리 실패 | 500 | `QUERY_FAILED` |

## 보안 체크리스트

- [ ] 식별자 항상 정규식 + DB 대조 + `quoteIdent`
- [ ] 값 항상 `$1, $2…` 파라미터 바인딩 (보간 0건)
- [ ] INSERT/UPDATE/DELETE는 `BEGIN` + `SET LOCAL ROLE app_readwrite` 래핑
- [ ] DELETE는 ADMIN 전용, `confirm()` 필수
- [ ] `users`/`api_keys`/`_prisma_migrations` — policy에서 전면 차단
- [ ] `edge_function_runs` — INSERT/UPDATE 차단, DELETE ADMIN only
- [ ] 모든 변경 → `audit-log-db`에 영속 기록
- [ ] 민감 테이블 `detail` 값 `[REDACTED]`
- [ ] UPDATE/DELETE는 PK WHERE 강제 (`LIMIT 1` 대체)
- [ ] 롤 부재 시 fail-closed (500)

## 테스트 계획

- **단위** (Vitest): `identifier`, `coerce`, `table-policy` — 경계·인젝션 케이스
- **통합** (curl): 권한 매트릭스 전수 + `'; DROP TABLE users; --` 등 인젝션
- **E2E** (브라우저, 수동): 로그인 → `/tables/folders` → 행 추가/수정/삭제 → `/audit`에서 로그 확인

## 커밋 단위

| # | 제목 | 경계 |
|---|---|---|
| C1 | `feat(db): app_readwrite PG 롤 SQL 스크립트` | `scripts/sql/create-app-readwrite.sql` + README 메모 |
| C2 | `feat(db): CRUD 라이브러리 레이어` | `pool.runReadwrite` + `table-policy`/`identifier`/`coerce` + 유닛 테스트 |
| C3 | `feat(api): 테이블 CRUD API 3종 + 스키마 PK 확장` | API 3개 + schema 확장 + curl 통합 테스트 |
| C4 | `feat(ui): 행 추가/편집/삭제 UI` | `RowFormModal` + grid 액션 + page CTA |
| C5 | `docs(14b): E2E 가이드 + 세션 종료 4단계` | `tables-e2e-manual.md` S8~S11, current.md, logs, handover, next-dev-prompt |

## 배포 특이사항

- **배포 순서 강제**: C1 SQL 스크립트 **WSL2 psql 수동 적용 → C2~C5 순**. 코드가
  먼저 나가면 `runReadwrite` fail-closed로 500.
- **Windows 빌드 불가**: WSL2 `npm run build`만 진실 소스.
- **proxy.ts 불침범**: 세션 18 구조 유지.
- **브라우저 E2E 수동**: Playwright 자동화는 Phase 14c/후속.

## 대안 및 기각 사유

| 대안 | 기각 이유 |
|---|---|
| 인라인 셀 편집 (원안 B) | JSON/timestamptz/textarea 엣지케이스 폭주 — Phase 14c로 분리 |
| 빈 입력 = NULL (B안) | PG의 default 의미 상실, UPDATE에서 변경 의도 없는 컬럼 NULL 덮어쓰기 |
| 롤 부재 시 fail-open | 슈퍼유저 권한 쓰기가 조용히 실행 — 비가역 변경에 경계 느슨화 불가 |
| 인메모리 감사 로그만 사용 | PM2 재시작 시 소실, DOD 6번(영구 추적) 미충족 |
| `audit_logs` 테이블도 차단 대상 포함 | PG에 없음(Drizzle SQLite) — 목록이 혼동만 초래 |

## 참고

- 세션 18 인수인계 — `docs/handover/260412-session18-auth-refactor.md`
- Phase 14b 프롬프트 — `docs/handover/phase-14b-crud-prompt.md`
- Phase 14a 코드 — `src/app/api/v1/tables/**`, `src/lib/pg/pool.ts`
- api-guard — `src/lib/api-guard.ts` (Bearer + 쿠키 fallback, resolveCookieSession)
