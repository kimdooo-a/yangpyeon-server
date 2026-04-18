# ADR-006: Phase 14c-γ 권한 매트릭스 E2E 검증 범위

- **상태**: Accepted
- **날짜**: 2026-04-18
- **세션**: 24 연장

## 컨텍스트

Phase 14b/α/β 완료로 3롤(ADMIN/MANAGER/USER) × 4작업 권한 게이트가 2계층으로 구성됨: withRole(라우트) + checkTablePolicy(INSERT/UPDATE/DELETE). 세션 24 handover에서 "VIEWER 계정 + 권한 매트릭스 E2E"를 γ 우선순위로 기록.

## 결정

1. **USER = "no tables access"로 검증**: Role enum에 VIEWER 추가하지 않음. 현재 USER는 `/api/v1/tables/*` 전 체 경로에서 403 `FORBIDDEN` — 이 gating을 그대로 검증.
2. **USER-as-VIEWER(SELECT 허용)는 별도 spec**: 민감 테이블(`users`, `api_keys`, `_prisma_migrations`)의 SELECT 정책 재설계 필요. 현재 GET 경로에는 table-policy 미적용 → USER SELECT를 열면 모든 테이블 읽기 가능 → 민감 정보 노출 위험. 별도 설계 사이클에서 처리.
3. **테스트 계정 seed 경로**: `/api/settings/users` POST (ADMIN 토큰) — 비밀번호 해시 로직 재사용, 표준 플로우.
4. **Teardown 정책**: `isActive=false` (PATCH). 삭제가 아닌 비활성 → 감사 로그 FK 연결 보존.
5. **writing-plans 생략**: 순수 검증 스크립트(코드 변경 없음) + 실행 + DOD 기록이라 α/β 수준 plan 오버헤드 불필요. 단일 커밋.

## 대안

- **Role enum에 VIEWER 추가** (DB migration): 기각 — USER를 SELECT 허용으로 확장하는 것이 더 간단하고 일관적. 단 이는 별도 보안 설계 필요.
- **UI Playwright E2E**: 기각 — Playwright 미설치 유지. API 매트릭스가 권한 게이트의 진실 소스.
- **모든 테이블 × 모든 롤 전수 검증**: YAGNI. `folders`(일반 업무) 하나면 게이트 로직 충분 검증.

## 결과

- **장점**: 코드 변경 0, 순수 검증. 향후 권한 게이트 회귀 감지 스크립트 확보. CI에 추가 가능.
- **단점**: USER의 실용성은 여전히 "읽기조차 불가" — 대시보드 viewer 기능은 후속 작업.
- **후속 권장**: "VIEWER 역할 재설계" spec — 민감 테이블 SELECT gate 포함.

## 참고

- Spec: `docs/superpowers/specs/2026-04-18-phase-14c-gamma-permission-matrix-design.md`
- 선행: ADR-003(Phase 14b 보안), ADR-004(α), ADR-005(β)
- `/api/settings/users` POST: `src/app/api/settings/users/route.ts`
- 권한 정책: `src/lib/db/table-policy.ts`
