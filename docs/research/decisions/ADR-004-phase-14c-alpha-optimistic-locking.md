# ADR-004: Phase 14c-α 인라인 편집 낙관적 잠금

- **상태**: Accepted
- **날짜**: 2026-04-18
- **세션**: 24

## 컨텍스트

Phase 14b로 RowFormModal 기반 CRUD가 완성되었다. 사용자 UX를 Supabase Table Editor 수준으로 끌어올리려면 셀 단위 인라인 편집이 필요하다. 동시에 여러 관리자(ADMIN/MANAGER)가 같은 행을 편집할 가능성이 있어 충돌 감지가 필수다. 세션 23에서 9개 테이블에 `updated_at DEFAULT now() @updatedAt`을 배선했기 때문에 낙관적 잠금의 기반이 이미 존재한다.

## 결정

1. **낙관적 잠금 전달**: 바디 필드 `expected_updated_at` (선택적 ISO 타임스탬프). 누락 시 기존 Phase 14b 동작 유지.
2. **충돌 응답**: HTTP 409 + `{error: {code:"CONFLICT", message, current: <row>}}`. current에는 서버 최신 행 전체 포함.
3. **충돌 UX**: Sonner 토스트 3액션 — 덮어쓰기(expected를 current로 교체해 재호출), 내 변경 유지(셀 dirty 유지), 취소(로컬을 current로 치환).
4. **readonly 매트릭스**: PK 컬럼 + `["created_at", "updated_at"]` 시스템 컬럼 + `policy.canUpdate=false` + primaryKey 부재.
5. **inline CREATE/DELETE 미지원**: 셀 단위에서 PK/NOT NULL 검증 UX가 어색. 기존 모달 경로 유지.
6. **Composite PK/VIEWER는 범위 밖**: 별도 spec (β/γ)으로 분리.
7. **감사 로그**: `TABLE_ROW_UPDATE_CONFLICT` 신규 action + 기존 `TABLE_ROW_UPDATE`에 `locked:bool` 메타.

## 대안

- **비관적 lock (SELECT FOR UPDATE)**: 동시 편집자 수가 소규모(관리자 1~3명)라 오버엔지니어링. 락 타임아웃·유휴 세션 청소 복잡도 추가.
- **ETag + `If-Match` 헤더**: 더 RESTful하지만 body 3상태 포맷과 일관성 낮음. CSRF·프록시 계층 헤더 처리 오버헤드.
- **Last-write-wins (잠금 없음)**: Phase 14b 동작. 동시 편집에서 silent 덮어쓰기 발생 — 관리자 실수 복구가 어려움.

## 결과

- **장점**: 세션 23 자산 즉시 활용 (추가 마이그레이션 불요). 서버는 단일 UPDATE 쿼리로 감지. 클라 UX는 토스트 기반으로 가볍다.
- **단점**: `updated_at` 컬럼 없는 테이블은 지원 불가 (현재는 EdgeFunctionRun 1개 — DELETE_ONLY라 무관). 동일 트랜잭션 내 연속 UPDATE는 감지 불가 (PG `now()`는 트랜잭션 시작 시각 고정).
- **후속**: β spec(복합 PK) 진행 시 `expected_updated_at` 동일 패턴 재사용.

## 참고

- Spec: `docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md`
- Plan: `docs/superpowers/plans/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-plan.md`
- 선행: 세션 23 마이그레이션 `20260417140000_add_updated_at_default`
