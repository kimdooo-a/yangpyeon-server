-- ============================================================
-- Migration: messenger_phase1_enums
-- ADR: ADR-030 (Messenger Domain & Phasing) — ACCEPTED 2026-04-26
-- 부속: ADR-022 §1 (tenant_id 1급), ADR-029 (RLS), ADR-024 (코어 임베디드 P1)
-- 작성: Claude Code 세션 64 (2026-04-26)
-- Stage: additive (no data change). 6 enum types only.
-- 후속 마이그: 20260501010000 ~ 20260501050000
-- ============================================================

-- 대화 종류
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP', 'CHANNEL');

-- 대화 멤버 역할
CREATE TYPE "ConversationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- 메시지 종류
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'VOICE', 'STICKER', 'SYSTEM');

-- 첨부 종류 (files.id 와 별개로 메신저 측 분기 힌트)
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'FILE', 'VOICE');

-- 신고 처리 상태
CREATE TYPE "AbuseReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- 신고 대상 종류
CREATE TYPE "AbuseReportTargetKind" AS ENUM ('MESSAGE', 'USER');
