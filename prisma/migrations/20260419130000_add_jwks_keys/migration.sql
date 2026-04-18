-- Phase 15 Auth Advanced — JWKS 키 저장소 (ES256 비대칭 서명)
-- 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md §7.2.1
-- SP-014 조건부 Go: endpoint-side grace 운용 정책

-- CreateEnum
CREATE TYPE "JwksStatus" AS ENUM ('CURRENT', 'RETIRED');

-- CreateTable
CREATE TABLE "jwks_keys" (
    "id" TEXT NOT NULL,
    "kid" TEXT NOT NULL,
    "alg" TEXT NOT NULL DEFAULT 'ES256',
    "public_jwk" JSONB NOT NULL,
    "private_jwk" JSONB NOT NULL,
    "status" "JwksStatus" NOT NULL DEFAULT 'CURRENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3),
    "retire_at" TIMESTAMP(3),

    CONSTRAINT "jwks_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jwks_keys_kid_key" ON "jwks_keys"("kid");

-- CreateIndex
CREATE INDEX "jwks_keys_status_idx" ON "jwks_keys"("status");

-- CreateIndex
CREATE INDEX "jwks_keys_retire_at_idx" ON "jwks_keys"("retire_at");
