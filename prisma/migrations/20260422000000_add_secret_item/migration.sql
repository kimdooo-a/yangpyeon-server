-- Phase 16a Vault — SecretItem (envelope 암호화 시크릿 저장소)
-- ADR-020: spec docs/superpowers/specs/2026-04-19-phase-16-design.md §16a
-- SP-017 PASS 실측 근거: IV 1M/충돌 0, GCM tamper throw, 100 DEK rotate 1.18ms

CREATE TABLE "secret_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encrypted_value" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "tag" BYTEA NOT NULL,
    "kek_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(3),

    CONSTRAINT "secret_items_pkey" PRIMARY KEY ("id")
);

-- Unique by name (single version per key)
CREATE UNIQUE INDEX "secret_items_name_key" ON "secret_items"("name");

-- Explicit index mirrors plan §48-1 (redundant with UNIQUE — cleanup 후보, S48 handover 이슈로 기록)
CREATE INDEX "secret_items_name_idx" ON "secret_items"("name");
