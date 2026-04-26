/**
 * keys-tenant-issue.ts — tenant ApiKey 발급기.
 *
 * Phase 1.3 (T1.3) 산출. ADR-027 §5.4 IMPL-SPEC 준수.
 *
 * 토큰 형식 (ADR-027 §5.1):
 *   `<scope>_<tenant_slug>_<random_base64url_32>`
 *   - scope: "pub" (publishable, 브라우저 노출 허용) | "srv" (server, 백엔드 전용)
 *   - tenant_slug: ADR-026 manifest 의 immutable slug
 *   - random: crypto.randomBytes(24).toString("base64url") = 32자
 *
 * DB prefix 컬럼 (ADR-027 §5.2):
 *   `<scope>_<tenant_slug>_<random.slice(0, 8)>`  ← 빠른 lookup + 운영자 식별 용이
 *
 * keyHash: bcrypt(plaintext, 10).
 *
 * 평문은 본 함수의 반환값에만 1회 노출. DB 에는 해시만 저장된다.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import type { ApiKey } from "@/generated/prisma/client";

const BCRYPT_ROUNDS = 10;
const RANDOM_BYTES = 24; // base64url encode 결과 32자

export interface IssueTenantKeyInput {
  /** Tenant.id (UUID, FK). */
  tenantId: string;
  /** Tenant.slug (URL path, immutable). 평문 prefix 에 직접 임베드. */
  tenantSlug: string;
  /** "pub" = PUBLISHABLE / "srv" = SECRET. */
  scope: "pub" | "srv";
  /** 키 표시 이름 (운영 콘솔 UI 라벨). */
  name: string;
  /** 권한 스코프 배열 (예: ["read:contents", "write:contents"]). */
  scopes: string[];
  /** 발급 운영자 User.id. */
  ownerId: string;
}

export interface IssueTenantKeyResult {
  /** 1회 노출되는 평문. 호출자(운영 콘솔)가 사용자에게 표시 후 폐기해야 한다. */
  plaintext: string;
  /** DB 저장본. id, prefix, tenantId, createdAt 등 비밀이 아닌 메타데이터만 포함. */
  apiKey: Pick<ApiKey, "id" | "prefix" | "tenantId" | "createdAt">;
}

/**
 * tenant ApiKey 발급. ADR-027 §5.4 — 평문/prefix/해시 동시 생성.
 *
 * NOTE: tenant slug 는 ADR-026 에 의해 immutable 로 보장되어야 본 prefix 가 영구 유효하다.
 * slug 가 변경되면 기존 키는 verifyApiKeyForTenant §5 단계에서 TENANT_MISMATCH_INTERNAL 로
 * 자동 거부된다.
 */
export async function issueTenantApiKey(
  input: IssueTenantKeyInput,
): Promise<IssueTenantKeyResult> {
  const random = randomBytes(RANDOM_BYTES).toString("base64url"); // 32자
  const plaintext = `${input.scope}_${input.tenantSlug}_${random}`;
  const prefix = `${input.scope}_${input.tenantSlug}_${random.slice(0, 8)}`;
  const keyHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);

  const created = await prisma.apiKey.create({
    data: {
      name: input.name,
      prefix,
      keyHash,
      type: input.scope === "pub" ? "PUBLISHABLE" : "SECRET",
      scopes: input.scopes,
      ownerId: input.ownerId,
      tenantId: input.tenantId, // ADR-027 K3 의 핵심 FK
    },
    select: {
      id: true,
      prefix: true,
      tenantId: true,
      createdAt: true,
    },
  });

  return { plaintext, apiKey: created };
}
