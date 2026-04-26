/**
 * keys-tenant.ts — ApiKey K3 매칭 (prefix + DB FK + 2중 cross-validation).
 *
 * Phase 1.3 (T1.3) 산출. ADR-027 §5.3 IMPL-SPEC 준수.
 *
 * 역할:
 *   - 컨슈머 라우트(`/api/v1/t/<tenant>/...`) 진입 시 Bearer 토큰 검증.
 *   - 3중 방어: ① prefix slug 형식 검증 → ② DB lookup + bcrypt 해시 검증
 *     → ③ prefix slug ↔ DB tenant.slug 일치 + path tenant ↔ DB tenant.slug 일치.
 *   - cross-tenant 침범(시나리오 1·4)을 즉시 차단하고 reason 코드를 호출자(가드 레이어)에
 *     반환하여 ADR-021 audit fail-soft 이벤트 발행을 유도한다.
 *
 * 본 모듈은 글로벌 키 검증(`src/lib/auth/keys.ts`) 과 별도로 공존한다.
 * 글로벌 키(`sb_publishable_*` / `sb_secret_*`)는 `verifyApiKey()` 가 담당,
 * tenant 키(`pub_<slug>_*` / `srv_<slug>_*`)만 본 모듈이 담당.
 *
 * 7-시나리오 매트릭스 (ADR-027 §8) 와 1:1 매핑되는 단위 테스트가 동봉된다 (`keys-tenant.test.ts`).
 */
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import type { ApiKey, Tenant } from "@/generated/prisma/client";

/**
 * ADR-027 §5.1 ApiKey 토큰 형식 정규식.
 *   `pub_<slug>_<random_base64url_32>` 또는 `srv_<slug>_<random_base64url_32>`
 *   - slug: 소문자 영숫자 + `-`, 길이 2~31 (manifest immutable 규칙 ADR-026)
 *   - random: base64url 32자 (24바이트)
 */
export const KEY_RE =
  /^(pub|srv)_([a-z0-9][a-z0-9-]{1,30})_([A-Za-z0-9_-]{32})$/;

/**
 * verifyApiKeyForTenant 가 받는 path tenant 식별자.
 * Phase 1 의 tenant-router/types 모듈이 도입되기 전까지는 본 최소 인터페이스로 충분하다
 * (verifyApiKeyForTenant 가 사용하는 필드는 `slug` 뿐). 향후 ResolvedTenant 로 확장될 때
 * 본 인터페이스를 구조적으로 만족하므로 호출부 호환성이 유지된다.
 */
export interface TenantIdentity {
  /** Tenant.id (UUID, ADR-026). */
  id?: string;
  /** Tenant.slug (URL path, immutable). cross-validation 의 핵심 키. */
  slug: string;
}

/**
 * verifyApiKeyForTenant 의 결과 타입 — 성공 1종 / 실패 6종 discriminated union.
 *
 * 실패 reason 코드는 ADR-027 §8 7-시나리오 매트릭스와 1:1 대응:
 *   - INVALID_FORMAT          : 시나리오 0 (정규식 불일치) — 일반 401
 *   - NOT_FOUND               : 시나리오 2 (slug 위조, prefix DB miss) — 일반 401
 *   - INVALID_HASH            : 시나리오 3 (random 추측 실패) — 일반 401
 *   - REVOKED                 : 폐기된 키 — 일반 401
 *   - TENANT_MISMATCH_INTERNAL: 시나리오 4 (DB 위조, prefix vs FK 불일치) — 401 + audit high
 *   - CROSS_TENANT_FORBIDDEN  : 시나리오 1 (정상 키의 cross-tenant) — 403 + audit medium
 */
export type VerifyResult =
  | {
      ok: true;
      key: ApiKey;
      tenant: Tenant;
      scope: "pub" | "srv";
    }
  | {
      ok: false;
      reason: "INVALID_FORMAT" | "NOT_FOUND";
    }
  | {
      ok: false;
      reason: "INVALID_HASH" | "REVOKED";
      keyId: string;
    }
  | {
      ok: false;
      reason: "TENANT_MISMATCH_INTERNAL";
      keyId: string;
      keyTenantSlug?: string;
    }
  | {
      ok: false;
      reason: "CROSS_TENANT_FORBIDDEN";
      keyId: string;
      keyTenantSlug: string;
    };

/**
 * tenant 키 K3 검증 — ADR-027 §5.3.
 *
 * 6단계 순차 실행:
 *   1. KEY_RE 정규식으로 prefix 파싱 (scope, prefixSlug, random)
 *   2. DB prefix unique lookup — T1.5 relation 활용 — 단일 query 통합
 *      (`include: { tenant: true }` 으로 ApiKey + Tenant 를 한 번에 조회)
 *   3. bcrypt.compare(rawKey, key.keyHash) — random 부분 위조 차단 (시나리오 3)
 *   4. revokedAt 검사 — 폐기 키 차단
 *   5. cross-validation 1: dbTenant.slug === prefixSlug — DB 위조 차단 (시나리오 4)
 *   6. cross-validation 2: dbTenant.slug === pathTenant.slug — cross-tenant 차단 (시나리오 1)
 *   7. lastUsedAt fire-and-forget 갱신 (실패 무시)
 */
export async function verifyApiKeyForTenant(
  rawKey: string,
  pathTenant: TenantIdentity,
): Promise<VerifyResult> {
  // ─── 1. Prefix 파싱 ───
  const m = rawKey.match(KEY_RE);
  if (!m) return { ok: false, reason: "INVALID_FORMAT" };
  const [, scopeStr, prefixSlug, random] = m;
  const scope = scopeStr as "pub" | "srv";
  const dbPrefix = `${scope}_${prefixSlug}_${random.slice(0, 8)}`;

  // ─── 2. DB lookup (prefix unique) — T1.5 relation 활용 — 단일 query 통합 ───
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- ApiKey K3 매칭 자체가 tenant 결정 단계 — self-referential, base prisma 정당 (membership.ts 동일 패턴)
  const dbKey = await prisma.apiKey.findUnique({
    where: { prefix: dbPrefix },
    include: { tenant: true },
  });
  if (!dbKey) return { ok: false, reason: "NOT_FOUND" };

  // ─── 3. Hash 검증 (시나리오 3 차단) ───
  // bcrypt 는 ADR-019/SP-011 에 따라 차후 argon2id 마이그레이션 예정이나, ApiKey 는 평문이
  // 길어 해시 비용보다 lookup 안전성이 우선이므로 본 모듈에서는 bcrypt 유지.
  const hashOk = await bcrypt.compare(rawKey, dbKey.keyHash);
  if (!hashOk) {
    return { ok: false, reason: "INVALID_HASH", keyId: dbKey.id };
  }

  // ─── 4. Revoked 검사 ───
  // 해시 검증 후에 revoked 를 확인해 키 존재 자체를 timing 채널로 누설하지 않는다.
  if (dbKey.revokedAt) {
    return { ok: false, reason: "REVOKED", keyId: dbKey.id };
  }

  // ─── 5. Cross-validation 1: DB tenant 무결성 ───
  // relation 미존재(FK violation 방어) 또는 slug 불일치 시 위변조 의심.
  // T1.5 schema 에서 tenantId NOT NULL + FK Cascade 로 전환됐으나 defense in depth.
  const dbTenant = dbKey.tenant;
  if (!dbTenant || dbTenant.slug !== prefixSlug) {
    return {
      ok: false,
      reason: "TENANT_MISMATCH_INTERNAL",
      keyId: dbKey.id,
      keyTenantSlug: dbTenant?.slug,
    };
  }

  // ─── 6. Cross-validation 2: path tenant 일치 ───
  if (dbTenant.slug !== pathTenant.slug) {
    return {
      ok: false,
      reason: "CROSS_TENANT_FORBIDDEN",
      keyId: dbKey.id,
      keyTenantSlug: dbTenant.slug,
    };
  }

  // ─── 7. lastUsedAt fire-and-forget 갱신 ───
  // 실패해도 검증 결과에는 영향 없음 — Promise rejection 은 swallow.
  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- ApiKey K3 매칭 단계의 부수적 lastUsedAt 갱신, self-referential 컨텍스트
  prisma.apiKey
    .update({ where: { id: dbKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, key: dbKey, tenant: dbTenant, scope };
}
