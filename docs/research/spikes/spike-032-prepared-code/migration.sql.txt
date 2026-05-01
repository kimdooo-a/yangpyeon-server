-- Phase 17a — File.storageType 컬럼 추가 (ADR-032 V1 옵션 A)
-- additive, NOT NULL + default 'local' → 기존 row 100% 호환

ALTER TABLE "files"
  ADD COLUMN "storage_type" TEXT NOT NULL DEFAULT 'local';

-- 인덱스 (R2 row 빠른 조회용 — quota 계산 시 사용)
CREATE INDEX "files_tenant_id_storage_type_idx" ON "files"("tenant_id", "storage_type");

-- 검증: 모든 기존 row 'local' 확인
DO $$
DECLARE
  non_local_count INT;
BEGIN
  SELECT COUNT(*) INTO non_local_count FROM "files" WHERE "storage_type" != 'local';
  IF non_local_count > 0 THEN
    RAISE EXCEPTION 'storage_type backfill 실패: % rows non-local', non_local_count;
  END IF;
END $$;
