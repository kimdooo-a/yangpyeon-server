# Phase 14c-β: 복합 PK 지원 — 설계 스펙

> **생성일**: 2026-04-18 (세션 24 연장 — α 완료 후 β 진입)
> **저자**: Claude (자율 실행 모드)
> **상태**: DRAFT → 자율 모드(명시적 중단 없으면 writing-plans로 전환)
> **선행**: Phase 14c-α(`expected_updated_at` + auto-bump + `EditableCell`)

---

## 1. 목적

Phase 14b/α가 단일 컬럼 PK에만 동작하고, 복합 PK 테이블은 API가 `COMPOSITE_PK_UNSUPPORTED` 400으로 차단하던 제약을 해제한다. 현재 프로덕션에 복합 PK 테이블이 0개 → 기능 자체는 speculative(YAGNI 경계)지만, 제약 코드를 제거하고 패턴을 준비해둠으로써 향후 복합 PK 테이블 추가 시 즉시 사용 가능한 경로를 제공한다.

## 2. 범위

### 2.1 In Scope
- 복합 PK 테이블에 대한 `PATCH` / `DELETE` API (신규 엔드포인트 `/_composite`)
- Schema 응답에 `compositePkColumns: string[]` 추가 (순서 있음 = `pg_index.indkey` 순)
- UI가 schema.compositePk 분기로 URL과 바디 형태 자동 선택
- page.tsx의 "복합 PK 미지원" 경고 제거 및 조건부 CTA 허용
- α 낙관적 잠금(`expected_updated_at`) + auto-bump 그대로 승계

### 2.2 Out of Scope
- **복합 PK INSERT** — `POST /api/v1/tables/[table]`의 기존 동작 유지 (INSERT는 이미 임의 컬럼 지정이므로 복합 PK 자연 지원)
- **단일 행 GET** — 현재 미구현 상태 유지
- **자동 Playwright 테스트 확장** — γ에서 Playwright 설치 후 E2E 자동화(지금은 curl)
- **영구 복합 PK 테스트 테이블 유지** — 검증 후 DROP

### 2.3 테스트 대상
프로덕션 10 테이블 중 복합 PK **0개**. 검증용 임시 테이블 `_test_composite` 스크립트 상에서 생성→검증→DROP.

```sql
CREATE TABLE IF NOT EXISTS _test_composite (
  tenant_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (tenant_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON _test_composite TO app_readwrite;
GRANT SELECT ON _test_composite TO app_readonly;
```

## 3. 아키텍처

### 3.1 API 경로 분리

```
단일 PK (α, 불변):
  PATCH/DELETE /api/v1/tables/[table]/[pk]
    - URL [pk]에 PK 값
    - body: { values, expected_updated_at? }

복합 PK (β, 신규):
  PATCH/DELETE /api/v1/tables/[table]/_composite
    - URL [table]만. PK는 body로
    - body: { pk_values: {col1: v1, col2: v2}, values, expected_updated_at? }
```

**분리 근거**: URL catch-all은 (a) 특수문자/UTF-8 인코딩 복잡, (b) 컬럼 순서 의존 취약, (c) α 경로 회귀 위험. 별도 엔드포인트는 두 경로를 독립 검증/롤백 가능.

### 3.2 데이터 흐름 (β PATCH)

```
클라이언트 (Grid)
  └─ schema.compositePk === true → URL = /_composite, body pk_values 사용
  
서버 (/_composite PATCH)
  1. withRole(["ADMIN","MANAGER"]) 가드
  2. checkTablePolicy (α와 동일 매트릭스)
  3. introspect(table) → compositePk=true 및 pkColumns[] 확보
     - pkColumns.length < 2 → 400 NOT_COMPOSITE (잘못된 엔드포인트 호출)
  4. body.pk_values 검증:
     - 모든 pkColumns이 pk_values에 있어야 함 → 누락 시 400 PK_VALUES_INCOMPLETE
     - 각 값 coerce (단일 PK와 동일)
  5. body.values 검증 (α와 동일)
  6. expected_updated_at 검증 (α와 동일)
  7. SQL 빌드:
     SET clause — α auto-bump 포함
     WHERE clause — `col1=$N AND col2=$M` + optional `AND updated_at=$K`
  8. runReadwrite → rowCount 분기 → 409 재SELECT / 404 / 200 (α와 동일)
  9. 감사 로그: pk 부분을 `{col1:v1, col2:v2}` JSON 문자열로 기록
```

### 3.3 컴포넌트 변경

| 파일 | 상태 | 변경 내용 |
|------|------|-----------|
| `src/app/api/v1/tables/[table]/_composite/route.ts` | **신규** | PATCH, DELETE 핸들러. α 로직을 복합 PK로 일반화 |
| `src/app/api/v1/tables/[table]/schema/route.ts` | **수정** | `compositePkColumns: string[]` (신규 필드) + 기존 `compositePk:bool` 유지 |
| `src/app/api/v1/tables/[table]/[pk]/route.ts` | **불변** | 단일 PK 전용. 현재의 `compositePk` 분기에서 400 반환은 유지 (명확한 라우팅 오류 신호) |
| `src/components/table-editor/use-inline-edit-mutation.ts` | **수정** | 훅 시그니처에 `compositePkColumns?: string[]` 추가. 있으면 `_composite` URL + `pk_values` 바디 |
| `src/components/table-editor/table-data-grid.tsx` | **수정** | fetchSchema에서 `compositePkColumns` 저장. 훅 호출 시 전달. readonly 매트릭스는 모든 PK 컬럼에 적용 |
| `src/app/(protected)/tables/[table]/page.tsx` | **수정** | "복합 PK 미지원" 경고 제거. canInsert/canUpdate/canDelete 조건에서 `!compositePk` 제거 |

### 3.4 DELETE 동작

PATCH와 동일한 PK 전달 방식, values/expected_updated_at 없음.

```
body: { pk_values: {col1: v1, col2: v2} }
```

감사 로그: `TABLE_ROW_DELETE` action, detail에 pk_values 포함.

## 4. 엣지케이스

| 케이스 | 결정 |
|--------|------|
| 단일 PK 테이블에 `_composite` 호출 | 400 NOT_COMPOSITE (라우팅 오류) |
| 복합 PK 테이블에 `[pk]` 호출 | 기존 400 COMPOSITE_PK_UNSUPPORTED 유지 (명확한 신호) |
| `pk_values`에 일부 컬럼 누락 | 400 PK_VALUES_INCOMPLETE + 누락 컬럼명 |
| `pk_values`에 여분 컬럼 | 400 UNKNOWN_PK_COLUMN + 컬럼명 |
| `pk_values` 값 타입 오류 | 400 COERCE_FAILED (단일 PK와 동일 에러 코드) |
| 복합 PK 테이블이 `updated_at` 없음 | `UPDATED_AT_NOT_SUPPORTED` 400 (α 규칙 승계) |
| composite-PK 테이블이 FULL_BLOCK / DELETE_ONLY 매트릭스에 등재 | table-policy가 먼저 차단 (403) |

## 5. 감사 로그

| action | detail 포맷 |
|--------|-------------|
| `TABLE_ROW_UPDATE` | `${email} → ${table}(pk={col1:v1,col2:v2}) [locked=${bool}]: ${JSON diff}` |
| `TABLE_ROW_UPDATE_CONFLICT` | `${email} → ${table}(pk={col1:v1,col2:v2}): expected=${iso}, actual=${iso}` |
| `TABLE_ROW_DELETE` | `${email} → ${table}(pk={col1:v1,col2:v2})` |

단일 PK의 `pk=${scalar}`와 일관되도록 복합은 JSON 문자열 사용.

## 6. 테스트 전략

### 6.1 Setup (E2E 스크립트 내부)

```bash
# 임시 테이블 생성 (psql 직접, app_readwrite 롤 grant 포함)
wsl -u postgres psql -d luckystyle4u <<'SQL'
CREATE TABLE IF NOT EXISTS _test_composite (
  tenant_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (tenant_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON _test_composite TO app_readwrite;
GRANT SELECT ON _test_composite TO app_readonly;
SQL
```

### 6.2 curl 매트릭스

```
B1 정상 PATCH (락 일치): /_composite PATCH → 200 + updated_at bump
B2 CONFLICT: expected 불일치 → 409 + current 포함
B3 NOT_FOUND: 존재하지 않는 pk_values → 404
B4 PK_VALUES_INCOMPLETE: 일부 컬럼 누락 → 400
B5 UNKNOWN_PK_COLUMN: 존재하지 않는 pk 컬럼 → 400
B6 NOT_COMPOSITE: 단일 PK 테이블(folders)에 /_composite 호출 → 400
B7 LEGACY GUARD: 복합 PK 테이블에 /[pk] 호출 → 400 COMPOSITE_PK_UNSUPPORTED (α 가드 유지 증명)
B8 DELETE: /_composite DELETE → 200 (deleted:true)
B9 감사 로그: TABLE_ROW_UPDATE / UPDATE_CONFLICT / DELETE 각 1건 이상 영속
```

### 6.3 Teardown

```bash
wsl -u postgres psql -d luckystyle4u -c "DROP TABLE _test_composite;"
```

### 6.4 UI 검증

Playwright 미설치라 수동 UI DOD 위임. 권장: 임시 테이블을 `_test_composite`로 유지한 상태에서 브라우저로 `/tables/_test_composite` 방문해 Grid 렌더링/셀 편집 확인 (PK 2컬럼 readonly, value 컬럼 편집 가능).

## 7. 마이그레이션

없음. 스키마 변경 0, 임시 테스트 테이블은 E2E 안에서 생성·DROP.

## 8. 롤백 전략

- `_composite` 엔드포인트는 신규 라우트 → 해당 파일 1개 삭제로 Phase 14c-α 동작 완전 복귀
- schema 응답의 `compositePkColumns` 추가 필드 → 클라이언트 미사용 시 무시(후방 호환)
- UI 변경(경고 제거, 훅 분기) → 한 파일씩 revert

## 9. 커밋 경계 (5개)

| D# | 제목 |
|----|------|
| D1 | `feat(api): schema 응답에 compositePkColumns 필드 추가` |
| D2 | `feat(api): POST /_composite 엔드포인트 — 복합 PK PATCH/DELETE` |
| D3 | `feat(ui): TableDataGrid·useInlineEditMutation 복합 PK 분기` |
| D4 | `docs(14c-β): ADR-005 — 복합 PK 경로 분리 결정` |
| D5 | `test(14c-β): curl B1~B9 + 임시 테스트 테이블 setup/teardown` |

## 10. 관련 자산 + 결정 기록

- α 자산: `EditableCell`, `TypedInputControl`, `useInlineEditMutation` → 복합 PK 대응만 추가
- API 패턴: α의 auto-bump, 409 CONFLICT, 감사 로그 2종 승계
- Compound Knowledge 후보(세션 중 추출): `docs/solutions/2026-04-18-composite-pk-body-routing.md`

## 11. 결정 로그

| 결정 | 선택 | 사유 |
|------|------|------|
| PK 전달 방식 | 바디 `pk_values` map | URL catch-all의 인코딩·순서 복잡도 회피, 단일 PK 회귀 위험 제거 |
| 엔드포인트 분리 vs 오버로드 | 분리 (`_composite` 신규) | 롤백 단위 분리, 가드 로직 단순, tsc 타입 명확 |
| UI URL 분기 위치 | 훅(`useInlineEditMutation`) | 컴포넌트는 "어느 URL인지" 모름 → 훅이 schema 메타 받아 결정 |
| 테스트 테이블 | 임시 `_test_composite` + E2E 내부 setup/teardown | YAGNI — 영구 테스트 인프라 배제. 실제 복합 PK 테이블 생기면 재활성 |
| α 가드 유지 여부 | `[pk]`에서 compositePk 시 400 유지 | 명확한 라우팅 오류 신호. β 엔드포인트와 역할 분리 |

---

## 12. 다음 단계

자율 모드: 명시적 중단 요청 없으면 `writing-plans` 스킬 호출 → Task 단위 실행 계획(`docs/superpowers/plans/2026-04-18-phase-14c-beta-composite-pk-plan.md`).
