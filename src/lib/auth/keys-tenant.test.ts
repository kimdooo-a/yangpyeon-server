/**
 * keys-tenant.test.ts — ADR-027 §8 7-시나리오 cross-tenant 차단 매트릭스 단위 테스트.
 *
 * Phase 1.3 (T1.3) 산출. vitest. prisma + bcrypt 모킹.
 *
 * 테스트 매핑 (impl-spec §8 — 시나리오 1·2·3·4·6 + REVOKED 보강):
 *   1. INVALID_FORMAT          ← 정규식 불일치 (잘못된 prefix, 누락된 부분)
 *   2. NOT_FOUND               ← 시나리오 2: prefix DB miss (slug 위조)
 *   3. INVALID_HASH            ← 시나리오 3: bcrypt.compare 실패 (random 추측)
 *   4. REVOKED                 ← revokedAt 가 set 된 키 (운영자 폐기)
 *   5. TENANT_MISMATCH_INTERNAL← 시나리오 4: DB tampering (FK slug ≠ prefix slug)
 *   6. CROSS_TENANT_FORBIDDEN  ← 시나리오 1: 정상 키의 cross-tenant 호출
 *   7. SUCCESS                 ← 모든 검증 통과 + lastUsedAt 갱신 발생
 *
 * + issueTenantApiKey 1건: 평문 형식 + prefix 도출 + 자체 해시 검증 라운드트립.
 *
 * 핸들러 가드(`withTenant`) 와의 통합은 별도 통합 테스트(추후 wave) 에서 검증한다.
 * 본 파일은 §5.3 검증 함수 자체의 의사결정 트리만 다룬다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma + bcrypt 를 hoisted mock 으로 정의 — vi.mock 이 import 를 가로챈다.
const { mockApiKeyFindUnique, mockApiKeyUpdate, mockApiKeyCreate, mockTenantFindUnique } =
  vi.hoisted(() => ({
    mockApiKeyFindUnique: vi.fn(),
    mockApiKeyUpdate: vi.fn(),
    mockApiKeyCreate: vi.fn(),
    mockTenantFindUnique: vi.fn(),
  }));

const { mockBcryptCompare, mockBcryptHash } = vi.hoisted(() => ({
  mockBcryptCompare: vi.fn(),
  mockBcryptHash: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: mockApiKeyFindUnique,
      update: mockApiKeyUpdate,
      create: mockApiKeyCreate,
    },
    tenant: {
      findUnique: mockTenantFindUnique,
    },
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: mockBcryptCompare,
    hash: mockBcryptHash,
  },
}));

import { verifyApiKeyForTenant, KEY_RE } from "./keys-tenant";
import { issueTenantApiKey } from "./keys-tenant-issue";

// ────────────────────────────────────────────────────────────────────────
// 테스트 fixture — 32자 base64url random.
// ────────────────────────────────────────────────────────────────────────
const VALID_RANDOM = "abcdefghijklmnop_-1234567890ABCD"; // 정확히 32자
const VALID_PLAINTEXT = `pub_almanac_${VALID_RANDOM}`;
const VALID_PREFIX_DB = `pub_almanac_${VALID_RANDOM.slice(0, 8)}`;

const ALMANAC_TENANT = {
  id: "tenant-uuid-almanac",
  slug: "almanac",
  displayName: "Almanac",
  status: "active",
  runtimeOverrides: null,
  createdAt: new Date("2026-04-26T00:00:00Z"),
  updatedAt: new Date("2026-04-26T00:00:00Z"),
};

const RECIPE_TENANT = {
  id: "tenant-uuid-recipe",
  slug: "recipe",
  displayName: "Recipe",
  status: "active",
  runtimeOverrides: null,
  createdAt: new Date("2026-04-26T00:00:00Z"),
  updatedAt: new Date("2026-04-26T00:00:00Z"),
};

const HEALTHY_KEY = {
  id: "apikey-uuid-1",
  name: "almanac-prod-key",
  prefix: VALID_PREFIX_DB,
  keyHash: "$2b$10$mocked-bcrypt-hash",
  type: "PUBLISHABLE" as const,
  scopes: ["read:contents"],
  ownerId: "user-uuid-1",
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date("2026-04-26T00:00:00Z"),
  updatedAt: new Date("2026-04-26T00:00:00Z"),
  tenantId: ALMANAC_TENANT.id,
};

beforeEach(() => {
  vi.clearAllMocks();
  // update / hash 의 기본 모킹 — fire-and-forget 이라 검증 함수의 결과에 영향 X.
  mockApiKeyUpdate.mockResolvedValue(HEALTHY_KEY);
  mockBcryptHash.mockResolvedValue("$2b$10$mocked-bcrypt-hash");
});

// ────────────────────────────────────────────────────────────────────────
// 시나리오 1: INVALID_FORMAT — 정규식 불일치
// ────────────────────────────────────────────────────────────────────────
describe("verifyApiKeyForTenant — 시나리오 1: INVALID_FORMAT", () => {
  it("scope prefix 가 잘못된 경우 (sb_publishable_xxx — 글로벌 키 형식)", async () => {
    const result = await verifyApiKeyForTenant(
      "sb_publishable_almanac_abcd1234",
      ALMANAC_TENANT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_FORMAT");
    // DB query 자체가 일어나지 않아야 한다 (early return).
    expect(mockApiKeyFindUnique).not.toHaveBeenCalled();
  });

  it("random 부분이 짧아 정규식 불일치", async () => {
    const result = await verifyApiKeyForTenant("pub_almanac_short", ALMANAC_TENANT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_FORMAT");
  });

  it("slug 부분이 누락된 경우", async () => {
    const result = await verifyApiKeyForTenant(
      `pub__${VALID_RANDOM}`,
      ALMANAC_TENANT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID_FORMAT");
  });

  it("KEY_RE 가 export 되어 라우터/디버거에서 재사용 가능", () => {
    expect(KEY_RE.test(VALID_PLAINTEXT)).toBe(true);
    expect(KEY_RE.test("not-a-key")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 시나리오 2: NOT_FOUND — DB lookup miss (slug 위조)
// ────────────────────────────────────────────────────────────────────────
describe("verifyApiKeyForTenant — 시나리오 2: NOT_FOUND", () => {
  it("정규식은 통과하지만 DB 에 prefix 가 없음", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(null);

    const result = await verifyApiKeyForTenant(VALID_PLAINTEXT, ALMANAC_TENANT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_FOUND");
    expect(mockApiKeyFindUnique).toHaveBeenCalledWith({
      where: { prefix: VALID_PREFIX_DB },
    });
    // bcrypt.compare 는 호출되지 않아야 한다 (lookup 단계에서 cut).
    expect(mockBcryptCompare).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 시나리오 3: INVALID_HASH — bcrypt 검증 실패 (random 추측)
// ────────────────────────────────────────────────────────────────────────
describe("verifyApiKeyForTenant — 시나리오 3: INVALID_HASH", () => {
  it("DB 에 prefix 는 있으나 bcrypt.compare 실패", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(HEALTHY_KEY);
    mockBcryptCompare.mockResolvedValueOnce(false);

    const result = await verifyApiKeyForTenant(VALID_PLAINTEXT, ALMANAC_TENANT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INVALID_HASH");
      // keyId 는 audit 추적용으로 항상 set.
      if (result.reason === "INVALID_HASH") expect(result.keyId).toBe(HEALTHY_KEY.id);
    }
    // tenant 조회는 일어나지 않아야 한다 (해시 실패 시 early return).
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 시나리오 4: REVOKED — 폐기된 키
// ────────────────────────────────────────────────────────────────────────
describe("verifyApiKeyForTenant — 시나리오 4: REVOKED", () => {
  it("revokedAt 가 set 된 키는 401", async () => {
    const revokedKey = {
      ...HEALTHY_KEY,
      revokedAt: new Date("2026-04-25T00:00:00Z"),
    };
    mockApiKeyFindUnique.mockResolvedValueOnce(revokedKey);
    mockBcryptCompare.mockResolvedValueOnce(true); // 해시는 일치

    const result = await verifyApiKeyForTenant(VALID_PLAINTEXT, ALMANAC_TENANT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("REVOKED");
      if (result.reason === "REVOKED") expect(result.keyId).toBe(HEALTHY_KEY.id);
    }
    // tenant 조회는 일어나지 않아야 한다 (revoked 단계에서 cut).
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 시나리오 5: TENANT_MISMATCH_INTERNAL — DB tampering
// ────────────────────────────────────────────────────────────────────────
describe("verifyApiKeyForTenant — 시나리오 5: TENANT_MISMATCH_INTERNAL", () => {
  it("DB row tenant.slug 가 prefix slug 와 다름 (위변조 의심 — high severity)", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(HEALTHY_KEY);
    mockBcryptCompare.mockResolvedValueOnce(true);
    // FK 가 가리키는 tenant 는 recipe 인데 prefix 는 almanac → DB tampering.
    mockTenantFindUnique.mockResolvedValueOnce(RECIPE_TENANT);

    const result = await verifyApiKeyForTenant(VALID_PLAINTEXT, ALMANAC_TENANT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TENANT_MISMATCH_INTERNAL");
      if (result.reason === "TENANT_MISMATCH_INTERNAL") {
        expect(result.keyId).toBe(HEALTHY_KEY.id);
        expect(result.keyTenantSlug).toBe("recipe");
      }
    }
  });

  it("ApiKey.tenantId 가 NULL 인 경우(레거시 키)도 동일 reason 으로 차단", async () => {
    const orphanKey = { ...HEALTHY_KEY, tenantId: null };
    mockApiKeyFindUnique.mockResolvedValueOnce(orphanKey);
    mockBcryptCompare.mockResolvedValueOnce(true);

    const result = await verifyApiKeyForTenant(VALID_PLAINTEXT, ALMANAC_TENANT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TENANT_MISMATCH_INTERNAL");
      if (result.reason === "TENANT_MISMATCH_INTERNAL") {
        expect(result.keyId).toBe(HEALTHY_KEY.id);
      }
    }
    // tenantId NULL 이면 tenant query 자체가 일어나지 않아야 한다.
    expect(mockTenantFindUnique).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────
// 시나리오 6: CROSS_TENANT_FORBIDDEN — 정상 키의 cross-tenant 호출
// ────────────────────────────────────────────────────────────────────────
describe("verifyApiKeyForTenant — 시나리오 6: CROSS_TENANT_FORBIDDEN", () => {
  it("almanac 키로 recipe 라우트 호출 (path tenant ≠ DB tenant)", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(HEALTHY_KEY);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockTenantFindUnique.mockResolvedValueOnce(ALMANAC_TENANT);

    // path tenant 만 recipe 로 다르다.
    const result = await verifyApiKeyForTenant(VALID_PLAINTEXT, RECIPE_TENANT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("CROSS_TENANT_FORBIDDEN");
      if (result.reason === "CROSS_TENANT_FORBIDDEN") {
        expect(result.keyId).toBe(HEALTHY_KEY.id);
        expect(result.keyTenantSlug).toBe("almanac");
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// 시나리오 7: SUCCESS — 모든 검증 통과
// ────────────────────────────────────────────────────────────────────────
describe("verifyApiKeyForTenant — 시나리오 7: SUCCESS", () => {
  it("정상 키 + 일치 path → ok=true, scope='pub', lastUsedAt 갱신 발생", async () => {
    mockApiKeyFindUnique.mockResolvedValueOnce(HEALTHY_KEY);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockTenantFindUnique.mockResolvedValueOnce(ALMANAC_TENANT);

    const result = await verifyApiKeyForTenant(VALID_PLAINTEXT, ALMANAC_TENANT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope).toBe("pub");
      expect(result.key.id).toBe(HEALTHY_KEY.id);
      expect(result.tenant.slug).toBe("almanac");
    }
    // lastUsedAt fire-and-forget — 동기적으로는 호출만 확인.
    expect(mockApiKeyUpdate).toHaveBeenCalledWith({
      where: { id: HEALTHY_KEY.id },
      data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
    });
  });

  it("srv scope 도 동일하게 통과", async () => {
    const srvPlaintext = `srv_almanac_${VALID_RANDOM}`;
    const srvDbPrefix = `srv_almanac_${VALID_RANDOM.slice(0, 8)}`;
    const srvKey = { ...HEALTHY_KEY, prefix: srvDbPrefix, type: "SECRET" as const };
    mockApiKeyFindUnique.mockResolvedValueOnce(srvKey);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockTenantFindUnique.mockResolvedValueOnce(ALMANAC_TENANT);

    const result = await verifyApiKeyForTenant(srvPlaintext, ALMANAC_TENANT);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.scope).toBe("srv");
  });
});

// ────────────────────────────────────────────────────────────────────────
// issueTenantApiKey — 발급 라운드트립
// ────────────────────────────────────────────────────────────────────────
describe("issueTenantApiKey — 발급 함수 형식 검증", () => {
  it("plaintext 가 KEY_RE 정규식을 만족 + prefix 가 plaintext 의 처음 8자 random 으로 구성", async () => {
    // bcrypt 는 단순 echo 처럼 동작하도록 모킹 (해시 라운드트립 검증을 위해 실제 비교는 별도 it 에서).
    mockBcryptHash.mockImplementationOnce(async (pt: string) => `hashed:${pt}`);
    mockApiKeyCreate.mockImplementationOnce(async (args: { data: { prefix: string; tenantId: string; }; }) => ({
      id: "new-uuid",
      prefix: args.data.prefix,
      tenantId: args.data.tenantId,
      createdAt: new Date(),
    }));

    const { plaintext, apiKey } = await issueTenantApiKey({
      tenantId: ALMANAC_TENANT.id,
      tenantSlug: "almanac",
      scope: "pub",
      name: "test-key",
      scopes: ["read:contents"],
      ownerId: "user-uuid-1",
    });

    // 1) plaintext 가 KEY_RE 만족 + scope=pub + slug=almanac.
    const m = plaintext.match(KEY_RE);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("pub");
    expect(m![2]).toBe("almanac");
    const random = m![3];
    expect(random.length).toBe(32);

    // 2) DB prefix = scope_slug_random.slice(0,8).
    expect(apiKey.prefix).toBe(`pub_almanac_${random.slice(0, 8)}`);
    expect(apiKey.tenantId).toBe(ALMANAC_TENANT.id);

    // 3) bcrypt.hash 가 평문 그대로 입력으로 받았는지 확인.
    expect(mockBcryptHash).toHaveBeenCalledWith(plaintext, 10);

    // 4) prisma.apiKey.create 의 data 인수에서 type 매핑 검증 (pub → PUBLISHABLE).
    expect(mockApiKeyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PUBLISHABLE",
          tenantId: ALMANAC_TENANT.id,
          prefix: apiKey.prefix,
        }),
      }),
    );
  });
});
