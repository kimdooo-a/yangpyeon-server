# RLS e2e 테스트 (Phase 1.4 / T1.4)

본 디렉토리는 ADR-023 §7 의 cross-tenant leak 방어 검증 e2e 테스트를 담는다.

## 배경

ESLint custom rule (`tenant/no-raw-prisma-without-tenant`) 은 정적 분석으로 raw prisma 호출을 차단하지만 함수 분리 시 false-negative 가능 (spec §6.3). 따라서 실제 PostgreSQL RLS 정책이 작동하는지 동적으로 검증하는 e2e 테스트가 필요하다.

## 실행 환경

본 테스트는 **실제 PostgreSQL 인스턴스**를 요구한다. 기본 vitest 실행에서는 환경변수 누락 시 모든 테스트가 자동 skip 된다 — CI/일반 개발 워크플로우는 영향 없음.

### 필수 환경변수

| 변수 | 용도 |
|------|------|
| `RLS_TEST_DATABASE_URL` | 일반 핸들러 connection (app_runtime, RLS 적용) |
| `RLS_TEST_ADMIN_DATABASE_URL` | bootstrap/seed connection (app_migration 또는 BYPASSRLS role) |

### 사전 작업

1. 별도 테스트 DB 인스턴스 (예: docker `postgres:16`).
2. `prisma migrate deploy` 로 모든 마이그레이션 적용 (Stage 1 + Phase 1.5 + Stage 3 RLS 포함).
3. RLS Stage 3 마이그레이션이 `app_migration` / `app_runtime` / `app_admin` role 을 생성한 상태.
4. `app_migration` 의 패스워드 placeholder 를 실제 값으로 교체.

### 실행 명령

```bash
# 실제 검증
RLS_TEST_DATABASE_URL='postgres://app_runtime:PASS@localhost:5432/yangpyeon_test' \
RLS_TEST_ADMIN_DATABASE_URL='postgres://app_migration:PASS@localhost:5432/yangpyeon_test' \
  pnpm vitest tests/rls/

# 기본 skip 확인
pnpm vitest tests/rls/
# → "skipped" 표시
```

## 테스트 시나리오

| ID | 시나리오 | 기대 |
|----|----------|------|
| T1 | tenant_a context 에서 tenant_b user 조회 | 0 row |
| T2 | tenant_a context 에서 tenant_b row UPDATE | 0 row affected |
| T3 | tenant_a context 에서 tenant_b row DELETE | 0 row affected |
| T4 | tenant_a context 에서 tenant_b 의 tenant_id INSERT | exception (WITH CHECK 위반) |
| T5 | tenant context 미설정 + raw 조회 | 0 row |
| T6 | bypassRls=true 모드 (admin role) | 모든 tenant 가시 (Phase 4 deferred) |
| T7 | 9 개 모델 일괄 cross-tenant 침투 | 모두 0 row |

## 알려진 한계

- **T6 deferred**: `app_admin` role 의 grant 정책이 Phase 4 ops 결정 대기. 현 단계는 it.skip.
- **dynamic backstop only**: SAST/단위 테스트가 아님 — 실제 PG 행동 검증.
- **격리 보장**: `beforeEach` 가 매 테스트 전 user 테이블 reseed. tenants 행은 영구 (충돌 무시).

## 후속 작업 (Phase 1.4 후속)

- [ ] T6 활성화 — `app_admin` role grant 정책 확정.
- [ ] CI (GitHub Actions) 통합 — postgres service 컨테이너 + `prisma migrate deploy`.
- [ ] `pg_policies` 일일 cron — 새 테이블에 정책 누락 시 Slack 알림 (spec §7.3).
