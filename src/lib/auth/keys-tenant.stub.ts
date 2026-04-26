/**
 * auth/keys-tenant.stub — T1.3 verifyApiKeyForTenant 의 임시 인터페이스.
 *
 * T1.2 (api-guard-tenant) 와 T1.3 (keys-tenant) 가 병렬 진행되는 동안 본 스텁이
 * 컴파일 타임 의존성을 제공한다. T1.3 통합 시 본 파일은 삭제되고
 * `@/lib/auth/keys-tenant` import 로 일괄 치환된다.
 *
 * 시그니처/타입 형태는 ADR-027 §5.3 (verifyApiKeyForTenant) 와 동일하게 유지.
 *
 * TODO(T1.3 통합): 본 파일 삭제 + api-guard-tenant.ts 의 import 경로 교체.
 */
import type { ResolvedTenant } from "@/lib/tenant-router/types";

/**
 * ADR-027 §5.3 verifyApiKeyForTenant 결과 타입.
 *
 * ok: true → key/scope 반환. 본 스텁은 ApiKey 의 형태를 모르므로 unknown 으로 노출.
 * ok: false → 차단 사유 + 부가 정보 (audit 용).
 */
export type VerifyResult =
  | { ok: true; scope: "pub" | "srv"; keyId: string; tenantId: string }
  | {
      ok: false;
      reason:
        | "INVALID_FORMAT"
        | "NOT_FOUND"
        | "INVALID_HASH"
        | "REVOKED"
        | "TENANT_MISMATCH_INTERNAL"
        | "CROSS_TENANT_FORBIDDEN";
      keyId?: string;
      keyTenantSlug?: string;
    };

/**
 * Phase 1.2 스텁 — T1.3 가 정식 구현으로 대체.
 *
 * 본 스텁은 항상 INVALID_FORMAT 으로 reject 하여 API key 경로가 통과되지 않게
 * 한다. 실제 검증은 T1.3 의 verifyApiKeyForTenant 가 책임진다.
 */
export async function verifyApiKeyForTenant(
  _rawKey: string,
  _pathTenant: ResolvedTenant,
): Promise<VerifyResult> {
  // TODO(T1.3): @/lib/auth/keys-tenant 가 도착하면 본 함수는 사용되지 않는다.
  return { ok: false, reason: "INVALID_FORMAT" };
}
