-- S49 이월 정리 (2026-04-25, 세션 52): secret_items.name 의 중복 인덱스 제거
-- 사유: name 컬럼은 이미 UNIQUE INDEX(secret_items_name_key) 보유 — secret_items_name_idx 는 동일 컬럼 단순 인덱스로 PostgreSQL/Prisma 양측에서 redundant.
-- 영향: lookup 비용 동일 (UNIQUE INDEX 가 그대로 사용됨), write 비용 감소 (인덱스 1개 ↓), disk 점유 감소.
-- 출처: 20260422000000_add_secret_item/migration.sql §22 "redundant with UNIQUE — cleanup 후보, S48 handover 이슈로 기록"
DROP INDEX IF EXISTS "secret_items_name_idx";
