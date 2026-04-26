-- Phase 1.6 (T1.6) — 'almanac' tenant 시드
-- 작성: 2026-04-27
-- 트리거: ADR-022 §컨슈머 추가 = 코드 수정 0줄 (DB row 추가만)
--
-- almanac UUID: '00000000-0000-0000-0000-000000000001'
--   → 'default' (000...0000) 다음 번호로 순서 보존.
--
-- ON CONFLICT DO NOTHING: idempotent — 재실행 안전.
-- ────────────────────────────────────────────────────────────

INSERT INTO "tenants" ("id", "slug", "display_name", "status", "created_at", "updated_at")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'almanac',
  'Almanac',
  'active',
  NOW(),
  NOW()
)
ON CONFLICT ("slug") DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 검증 쿼리 (운영자 수동 실행)
-- ────────────────────────────────────────────────────────────
-- SELECT id, slug, display_name, status FROM tenants WHERE slug = 'almanac';
-- → 1 row: id='00000000-0000-0000-0000-000000000001', slug='almanac', status='active'
-- ────────────────────────────────────────────────────────────
