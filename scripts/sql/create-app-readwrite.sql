-- Phase 14b: Table Editor CRUD용 PG 롤
-- 적용 (WSL2 peer auth):
--   wsl -d Ubuntu -u postgres -- psql -d luckystyle4u \
--     -f /mnt/e/00_develop/260406_luckystyle4u_server/scripts/sql/create-app-readwrite.sql
-- 검증:
--   wsl -d Ubuntu -u postgres -- psql -d luckystyle4u -c "\du app_readwrite"

-- LOGIN 불가, 세션에서 SET LOCAL ROLE로만 전환 가능
CREATE ROLE app_readwrite NOLOGIN;

GRANT USAGE ON SCHEMA public TO app_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_readwrite;

-- postgres(앱 연결 계정)가 SET LOCAL ROLE로 전환 가능하도록
GRANT app_readwrite TO postgres;
