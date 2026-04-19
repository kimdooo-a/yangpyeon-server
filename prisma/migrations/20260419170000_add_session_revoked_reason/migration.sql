-- 세션 37 — Session.revokedReason 추가 (reuse 탐지 의도-혼동 버그 수정).
-- 기존 행은 NULL. 향후 rotate/revoke/logout 경로에서 값 설정.

ALTER TABLE "sessions" ADD COLUMN "revoked_reason" TEXT;
