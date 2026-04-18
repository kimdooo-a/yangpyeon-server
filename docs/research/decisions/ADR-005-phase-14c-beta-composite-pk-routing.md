# ADR-005: Phase 14c-β 복합 PK 라우팅 — 바디 기반 `_composite` 엔드포인트

- **상태**: Accepted
- **날짜**: 2026-04-18
- **세션**: 24 연장

## 컨텍스트

Phase 14b/α가 단일 컬럼 PK에만 동작. 복합 PK 테이블은 `COMPOSITE_PK_UNSUPPORTED` 400으로 차단. 프로덕션에 복합 PK 테이블 0개지만 코드 seam을 제거하고 향후 테이블 추가 시 즉시 사용 가능한 경로를 준비할 필요.

## 결정

1. **엔드포인트 분리**: 신규 `/api/v1/tables/[table]/_composite` (PATCH, DELETE). 기존 `/[pk]` 불변.
2. **PK 전달**: 바디 `pk_values: Record<string, unknown>` map. 컬럼명 키 → URL 인코딩·순서 의존 제거.
3. **순서 보존**: Schema 응답의 `compositePkColumns`가 `pg_index.indkey` 순. WHERE 절 파라미터 순서에 사용.
4. **α 자산 승계**: `expected_updated_at` 낙관적 잠금, `updated_at = NOW()` auto-bump, 409 CONFLICT, 감사 로그 2종(`TABLE_ROW_UPDATE_CONFLICT` + `locked:bool` 메타) 동일 적용.
5. **UI 분기 위치**: `useInlineEditMutation` 훅 내부. 컴포넌트는 "어느 URL인지" 모름 — schema 메타가 훅에 주입됨.
6. **단일 PK `/[pk]` 호출 시 복합 PK 테이블**: 기존 400 `COMPOSITE_PK_UNSUPPORTED` 유지 → 명확한 라우팅 오류 신호.

## 대안

- **URL catch-all `[...pk]`**: 특수문자/UTF-8 인코딩 복잡, 컬럼 순서 암묵 의존 취약. 기각.
- **기존 `[pk]` 확장(바디 우선)**: 두 경로 오버로드로 가드 로직 복잡, 롤백 단위 불명확. 기각.

## 결과

- **장점**: 단일 PK 경로(α) 100% 회귀 위험 0. 롤백 단위 1파일 제거. 타입/정책/감사 로그 일관.
- **단점**: 두 라우트 핸들러에 공통 로직 중복(coerce, introspect, 감사 로그 조립). 향후 순수 함수 추출 리팩토링 여지 (Phase 14d 이상).
- **후속**: γ에서 권한 매트릭스 E2E로 복합 PK 경로의 role 차등 검증.

## 참고

- Spec: `docs/superpowers/specs/2026-04-18-phase-14c-beta-composite-pk-design.md`
- Plan: `docs/superpowers/plans/2026-04-18-phase-14c-beta-composite-pk-plan.md`
- 선행: ADR-004 (α 낙관적 잠금), 세션 24 `00d4e79` (raw UPDATE auto-bump)
