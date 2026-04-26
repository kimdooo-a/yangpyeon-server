-- P0-membership (세션 61) — TenantMembership 신설.
-- 트리거: T1.2 router 의 cookie 인증 경로가 fail-closed stub 로 항상 403 반환.
--   (membership.ts 가 항상 null 반환 → withTenant() cookie 분기 = 미멤버 = 403)
-- 본 마이그레이션이 그 stub 의 빈자리를 메운다.
--
-- 본 마이그레이션이 하는 일:
--   1. tenant_memberships 테이블 신설 (Tenant-bypass — RLS 미적용).
--   2. (tenant_id, user_id) 합성 unique + (user_id) index.
--   3. FK 양방향 ON DELETE CASCADE.
--   4. 'default' tenant + 기존 OWNER 후보 사용자에 대한 OWNER 멤버십 시드 (운영자 본인).
--      → 운영자 본인이 콘솔 로그인 후 cookie 경로(/api/v1/t/default/*) 접근 가능.
--
-- Tenant-bypass 이유 (T1.4 spec §2.4 카테고리):
--   - 멤버십 조회는 *tenant context 결정 전* 단계에서 발생 — RLS USING 절이 app.tenant_id 를
--     요구하면 self-defeating (어느 tenant 에 속하는지 본 query 가 판정 중).
--   - (tenant_id, user_id) 양쪽 모두 명시 bind parameter 로 들어가므로 cross-tenant 안전.

-- ────────────────────────────────────────────────────────────
-- 1. tenant_memberships 신설
-- ────────────────────────────────────────────────────────────
CREATE TABLE "tenant_memberships" (
    "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id"  UUID NOT NULL,
    "user_id"    TEXT NOT NULL,
    "role"       TEXT NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),

    CONSTRAINT "tenant_memberships_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "tenant_memberships_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- 2. Unique + Index
-- ────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key"
    ON "tenant_memberships"("tenant_id", "user_id");

CREATE INDEX "tenant_memberships_user_id_idx"
    ON "tenant_memberships"("user_id");

-- ────────────────────────────────────────────────────────────
-- 3. RLS 미적용 (Tenant-bypass) — 명시적 ENABLE 생략.
--    참고: 향후 Phase 4 에서 멤버십 자체 가시성 정책 (사용자가 자신의 멤버십만 조회)
--    검토 시 RLS 추가 가능. 현재는 application-layer 에서 (tenantId, userId) 명시.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 4. 시드 — 'default' tenant 의 모든 활성 사용자를 OWNER 로 등록.
--    이유: 본 프로젝트는 1인 운영자(OWNER) 모델이므로 기존 사용자 = OWNER 후보.
--    Phase 1.5+ 에서 사용자별 role 세분화 (multi-admin 시나리오) 시 별도 운영 작업.
--    멱등: ON CONFLICT DO NOTHING.
-- ────────────────────────────────────────────────────────────
INSERT INTO "tenant_memberships" ("id", "tenant_id", "user_id", "role")
SELECT
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    "users"."id",
    'OWNER'
FROM "users"
WHERE "users"."is_active" = true
ON CONFLICT ("tenant_id", "user_id") DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 검증 쿼리 (운영자 수동)
-- ────────────────────────────────────────────────────────────
-- 1) 시드 결과 확인
-- SELECT count(*) FROM tenant_memberships WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
-- → 활성 사용자 수와 동일이어야 함.
--
-- 2) FK CASCADE 동작 확인 (테스트 환경에서만)
-- DELETE FROM users WHERE id = '<test-user-id>';
-- SELECT count(*) FROM tenant_memberships WHERE user_id = '<test-user-id>';
-- → 0 (CASCADE).
--
-- ────────────────────────────────────────────────────────────
-- Rollback: migration_rollback.sql 참조.
-- ────────────────────────────────────────────────────────────
