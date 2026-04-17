# Phase 14c-α: 인라인 셀 편집 + 낙관적 잠금 — 설계 스펙

> **생성일**: 2026-04-18 (세션 24)
> **저자**: Claude (브레인스토밍 세션)
> **상태**: DRAFT → 사용자 승인 대기 (자율 실행 모드: 명시적 중단 없으면 writing-plans로 전환)
> **선행 의존**: 세션 23 `@default(now()) @updatedAt` 마이그레이션 (`20260417140000_add_updated_at_default`)

---

## 1. 목적

Phase 14b에서 완성된 `RowFormModal` 기반 행 편집을 **셀 단위 인라인 편집**으로 확장하고, 동시 편집 충돌을 `updated_at` 비교 기반 **낙관적 잠금(optimistic locking)** 으로 감지한다. 목표는 Supabase Table Editor 수준의 편집 UX를 유지하면서 Phase 14b의 3상태 입력 모델과 감사 로그·policy·fail-closed 보안을 재사용하는 것이다.

## 2. 범위

### 2.1 In Scope
- 단일 컬럼 PK 테이블의 셀 단위 `UPDATE`
- `expected_updated_at` 기반 서버 낙관적 잠금
- 409 CONFLICT 응답 + 현재 행(`current`) 동봉
- 클라이언트 Sonner 토스트 기반 충돌 해결 UX (3 액션)
- 기존 `RowFormModal` 입력 컨트롤의 `EditableCell` 재사용
- readonly 매트릭스: PK, `created_at`/`updated_at`, FULL_BLOCK 테이블, DELETE_ONLY 테이블

### 2.2 Out of Scope
- **복합 PK 지원** — 별도 spec `β` (다음 사이클)
- **VIEWER 테스트 계정 + 권한 매트릭스 E2E** — 별도 spec `γ` (다음 사이클)
- 인라인 `CREATE` / `DELETE` (모달·confirm UX 유지)
- 실시간 presence/lock 표시 (두 사용자가 동시에 편집 중임을 WebSocket으로 노출)
- 일괄 편집 / 셀 복사 붙여넣기
- Undo/Redo 스택

### 2.3 대상 테이블 (세션 23 기준)
- **편집 허용 (α 대상)**: Folder, File, SqlQuery, EdgeFunction, Webhook, CronJob, LogDrain (7 테이블)
- **FULL_BLOCK (전면 차단)**: User, ApiKey, _prisma_migrations (3)
- **DELETE_ONLY**: EdgeFunctionRun (UPDATE 금지 유지) (1)
- 전체 11 테이블 중 α 편집 경로는 7 테이블. `updated_at` 컬럼 부재 케이스는 없음 (EdgeFunctionRun은 DELETE_ONLY라 무관).

## 3. 아키텍처

### 3.1 데이터 흐름
```
[셀 클릭]
  └→ EditableCell 포커스 → 입력 → Enter
     └→ useInlineEditMutation(...)
        └→ PATCH /api/v1/tables/<table>/<pk>
           body: { values: { <col>: {action:"set", value:<v>} },
                   expected_updated_at: "<ISO>" }
        └→ API:
           - table-policy UPDATE 체크
           - introspect → PK, colTypeMap
           - coerce 검증
           - UPDATE ... SET ... WHERE pk=$N AND (expected_updated_at 제공 시) updated_at=$M RETURNING *
           - rowCount 분기:
             · 1 → 200 success + 감사 로그 TABLE_ROW_UPDATE (locked:true|false)
             · 0 → 재SELECT로 존재 확인
                   · 존재 → 409 CONFLICT + current + 감사 로그 TABLE_ROW_UPDATE_CONFLICT
                   · 부재 → 404
        └→ 클라:
           · 200 → 로컬 행 치환, 토스트 OK
           · 409 → 토스트 "누군가 먼저 수정했습니다" + [덮어쓰기 | 유지 | 취소]
           · 400/403/404/500 → 토스트 + 셀 롤백
```

### 3.2 컴포넌트 목록

| 파일 | 역할 | 상태 |
|------|------|------|
| `src/components/table-editor/editable-cell.tsx` | 셀 내부 입력 컨트롤 (타입별 분기), 포커스/블러/키보드 처리 | **신규** |
| `src/components/table-editor/use-inline-edit-mutation.ts` | PATCH 호출, 낙관적 로컬 갱신, 409 핸들링 훅 | **신규** |
| `src/components/table-editor/table-data-grid.tsx` | 컬럼 `cell` 렌더러를 `EditableCell`로 치환, readonly 매트릭스 전달 | **수정** |
| `src/components/table-editor/row-form-modal.tsx` | 3상태 입력 컨트롤을 `editable-cell-inputs.tsx`로 추출 후 재수입 | **수정 (리팩토링)** |
| `src/components/table-editor/editable-cell-inputs.tsx` | boolean/number/datetime-local/textarea/text 컨트롤 집합 (RowFormModal·EditableCell 공용) | **신규 (추출)** |
| `src/app/api/v1/tables/[table]/[pk]/route.ts` | PATCH 바디에 `expected_updated_at` 지원, WHERE 확장, 409 분기, 감사 로그 2종 | **수정** |
| `src/app/(protected)/tables/[table]/page.tsx` | `userRole`·`policy`·`primaryKey` 이미 Grid에 넘김 → `systemColumns` prop 추가 | **수정 (소폭)** |

### 3.3 API 계약 변경

**Before (Phase 14b)**
```http
PATCH /api/v1/tables/<table>/<pk>
{
  "values": {
    "name": { "action": "set", "value": "new name" }
  }
}
→ 200 { success:true, data:{ row:{...} } }
→ 404 NOT_FOUND (행 없음)
```

**After (α)**
```http
PATCH /api/v1/tables/<table>/<pk>
{
  "values": {
    "name": { "action": "set", "value": "new name" }
  },
  "expected_updated_at": "2026-04-17T23:41:00.000Z"    // OPTIONAL
}
→ 200 { success:true, data:{ row:{...} } }                 // 정상
→ 409 {
    success:false,
    error:{
      code:"CONFLICT",
      message:"행이 다른 세션에서 수정되었습니다",
      current:{ id:..., name:"...", updated_at:"..." }     // 최신 행 동봉
    }
  }
→ 404 NOT_FOUND (행 없음 — 재확인 후)
```

**후방 호환**: `expected_updated_at` 누락 시 WHERE 절 확장 생략. 기존 curl/레거시 클라 동작 동일.

### 3.4 감사 로그 스키마 확장

| action | metadata 추가 필드 | 발생 조건 |
|--------|-------------------|-----------|
| `TABLE_ROW_UPDATE` (기존) | `locked: true\|false` (expected_updated_at 제공 여부) | 정상 UPDATE |
| `TABLE_ROW_UPDATE_CONFLICT` (신규) | `expected: "<ISO>"`, `actual: "<ISO>"` | 409 발생 |

detail 문자열은 기존 포맷 유지(`redactSensitiveValues` 적용 후 JSON).

## 4. 엣지케이스 및 결정 사항

| 케이스 | 결정 |
|--------|------|
| `expected_updated_at` 파싱 실패 (malformed ISO) | 400 `INVALID_EXPECTED_UPDATED_AT` |
| `expected_updated_at` 제공했으나 테이블에 `updated_at` 컬럼 부재 | 400 `UPDATED_AT_NOT_SUPPORTED` (α 대상에서는 발생 불가, 방어적 체크) |
| 서버·클라 시간 불일치 | 서버의 `updated_at`이 유일한 소스. 클라는 표시만 보유, 비교는 서버가 수행 |
| 재시도(덮어쓰기) | UI가 `expected_updated_at = response.current.updated_at`으로 교체해 재호출 |
| 같은 사용자가 여러 탭에서 편집 | 동일 로직 적용. 자기 자신과의 충돌도 정상 감지 (UX 일관성) |
| 동일 `updated_at` 타임스탬프 내 2 연속 UPDATE (밀리초 미만) | PG `now()`는 트랜잭션 시작 시각 고정 — 별도 트랜잭션이면 다른 값. 같은 트랜잭션 내 연속 UPDATE는 외부에서 발생할 수 없으므로 무시 |
| PK 컬럼 편집 시도 | EditableCell readonly — UI 차단. 서버는 방어적으로 400 `PK_READONLY` |
| `created_at`/`updated_at` 편집 시도 | 동일 — readonly UI + 400 `SYSTEM_COLUMN_READONLY` |
| 낙관적 로컬 업데이트 후 서버 실패 | 이전 값으로 롤백 (훅이 원본 보존) + 토스트 |
| Tab 키로 다음 편집 셀 이동 | pending 변경 자동 커밋 후 다음 셀 포커스. 실패 시 현재 셀 유지 |

## 5. 에러 처리 매트릭스

| HTTP | code | UI 동작 |
|------|------|---------|
| 200 | — | 셀 값 치환, dirty 클리어, 성공 토스트 생략 (spammy) |
| 400 COERCE_FAILED | 셀 하단 적색 메시지, 포커스 유지, dirty 유지 |
| 400 EMPTY_PAYLOAD | (발생 불가 — UI가 변경 감지 후만 호출) |
| 400 INVALID_EXPECTED_UPDATED_AT | 개발자 콘솔 경고 + 토스트 "요청 형식 오류" |
| 403 OPERATION_DENIED | 토스트 "권한 없음", 셀 롤백 |
| 404 NOT_FOUND | 토스트 "행이 삭제되었습니다", 그리드 새로고침 |
| 409 CONFLICT | 토스트 3액션 (아래 참조), 셀 유지 |
| 500 QUERY_FAILED | 토스트 "서버 오류", 셀 롤백 |

### 5.1 409 토스트 액션

| 액션 | 동작 |
|------|------|
| **덮어쓰기** | `expected_updated_at` ← `current.updated_at`로 교체 후 재호출. 성공 시 로컬 갱신. |
| **내 변경 유지** | 셀 dirty 유지 (포커스 해제되었다면 재포커스). 사용자 수동 재시도 유도. |
| **취소** | 로컬 행을 `current`로 치환, dirty 해제. |

## 6. 테스트 계획

### 6.1 API — curl 스크립트 (세션 22 Compound Knowledge 레시피 재사용)

`scripts/e2e/phase-14c-alpha-inline-edit.sh`:
- **C1 정상 PATCH (락 일치)**: Folder INSERT → SELECT updated_at → PATCH with matching expected → 200, 새 updated_at 확인
- **C2 CONFLICT**: 같은 row에 expected=구 timestamp로 PATCH → 409 + current 포함
- **C3 NOT_FOUND**: 존재하지 않는 PK → 404
- **C4 LEGACY (무잠금)**: expected_updated_at 생략 → 200 (후방 호환 증명)
- **C5 MALFORMED EXPECTED**: expected_updated_at = "not-iso" → 400 INVALID_EXPECTED_UPDATED_AT
- **C6 감사 로그 확인**: SQLite `audit_logs` 테이블에서 TABLE_ROW_UPDATE (locked=true), TABLE_ROW_UPDATE_CONFLICT 각 1건 이상

### 6.2 UI — Playwright 프로덕션 E2E

`scripts/e2e/phase-14c-alpha-ui.spec.ts`:
- **E1 셀 편집 해피패스**: /tables/folders 진입 → name 셀 클릭 → 값 입력 → Enter → 토스트 없음, 값 반영, updated_at 변경
- **E2 Tab 이동**: name 편집 중 Tab → description 셀로 포커스 이동 + pending 커밋
- **E3 Esc 취소**: 입력 중 Esc → 원본 복원, dirty 해제
- **E4 동시 편집 시뮬레이션**: 두 context(브라우저 세션) — 탭1이 row 1 편집 → 탭2가 같은 row 편집 → 탭2에 409 토스트 → "덮어쓰기" 클릭 → 저장 성공
- **E5 readonly**: PK 컬럼 클릭 시 포커스 진입 불가 (cursor default), `created_at`/`updated_at` 동일
- **E6 FULL_BLOCK 테이블 (users)**: /tables/users 진입 → 모든 컬럼 readonly

### 6.3 DOD (Definition of Done)
- C1~C6 전부 PASS
- E1~E6 전부 PASS
- 프로덕션(PM2) 배포 완료 + 재현 가능한 스크립트 기록
- 감사 로그 audit_logs 테이블에 2종 action 영속 확인: `TABLE_ROW_UPDATE (locked:true/false 각 1건 이상)`, `TABLE_ROW_UPDATE_CONFLICT (1건 이상)`
- handover + current.md + next-dev-prompt 갱신
- tsc --noEmit EXIT 0, lint 경고 0

## 7. 마이그레이션

없음. 세션 23의 `20260417140000_add_updated_at_default`로 9개 테이블이 이미 `updated_at DEFAULT now()`를 보유. 스키마 변경 필요 없음.

## 8. 롤백 전략

- **API**: 변경이 후방 호환. 문제 발생 시 `expected_updated_at` 처리 블록만 제거하면 Phase 14b 동작으로 복귀 (1 커밋 revert).
- **UI**: `EditableCell`을 읽기 전용 `<span>`으로 치환하는 1라인 패치로 즉시 읽기 모드 복귀. RowFormModal CRUD 경로는 유지되므로 사용자 영향 최소.
- **마이그레이션 롤백 불필요**: 스키마 변경 없음.

## 9. 커밋 경계 (5개)

| D# | 제목 | 범위 |
|----|------|------|
| D1 | `feat(api): PATCH expected_updated_at 낙관적 잠금 + 409 CONFLICT 응답` | `[pk]/route.ts` PATCH 확장 + 감사 로그 2종 |
| D2 | `feat(ui): EditableCell + useInlineEditMutation (인라인 편집 기본기)` | 신규 컴포넌트·훅, RowFormModal 리팩토링(입력 컨트롤 추출) |
| D3 | `feat(ui): TableDataGrid 인라인 편집 통합 + readonly 매트릭스` | Grid `cell` 렌더러 교체, page.tsx systemColumns prop |
| D4 | `docs(14c-α): ADR-004 + handover 갱신` | ADR-004 (낙관적 잠금 설계 결정), solutions 폴더 엔트리 |
| D5 | `test(14c-α): curl C1~C6 + Playwright E1~E6 DOD 실수행` | scripts/e2e/ 추가, 실행 결과 handover 기록 |

## 10. 관련 자산

- 세션 23 마이그레이션 `20260417140000_add_updated_at_default`
- Phase 14b `RowFormModal` 3상태 입력 (set/null/keep)
- Phase 14b `table-policy.ts` FULL_BLOCK / DELETE_ONLY 매트릭스
- Phase 14b `redactSensitiveValues` 감사 로그 마스킹
- Phase 11b Sonner 토스트
- Compound Knowledge `docs/solutions/2026-04-17-curl-e2e-recipe-dashboard.md` (CSRF + 쿠키 스크립트 레시피)

## 11. 결정 로그 (brainstorm 자율 실행)

| 결정 | 선택 | 사유 |
|------|------|------|
| 잠금 전달 방식 | 바디 필드 `expected_updated_at` | 기존 body 3상태 포맷과 일관. ETag/`If-Match` 헤더는 에지케이스(빈 헤더·인코딩) 대비 오버헤드. |
| 낙관적 vs 비관적 | 낙관적 | 대시보드 동시 편집자 수 소규모(관리자 1~3명). 비관적 lock은 UX 오버엔지니어링. |
| 충돌 UI | Sonner 토스트 3 액션 | diff 모달은 Phase 14d 이상의 스코프. 토스트로 즉시 의사결정 가능. |
| 인라인 CREATE 지원 | 제외 | PK 검증·NOT NULL 검증 UX가 셀 단위로 어색. 모달 유지. |
| Undo 스택 | 제외 | YAGNI. 히스토리 요구가 생기면 별도 spec. |
| Tab 동작 | 다음 편집 가능 셀로 이동 + pending 자동 커밋 | 스프레드시트 관습. 실패 시 현재 셀 유지. |
| readonly 결정 위치 | 클라(UX) + 서버(방어) 이중 | 서버는 최종 권한. 클라는 조기 차단으로 요청 수 절감. |

---

## 12. 다음 단계

1. **사용자 검토** (자율 실행 모드: 명시적 중단 요청 없으면 생략)
2. **writing-plans 스킬 호출** → Task 단위 실행 계획 작성 (`docs/superpowers/plans/2026-04-18-phase-14c-alpha-plan.md`)
3. **subagent-driven-development** 로 D1~D5 실행
4. 완료 후 α spec 상태 `IMPLEMENTED`로 전환, β spec 시작
