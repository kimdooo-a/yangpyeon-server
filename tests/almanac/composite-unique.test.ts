/**
 * tests/almanac/composite-unique.test.ts
 *
 * PLUGIN-MIG-4 (S100) — Almanac 5 모델 composite unique 검증.
 *
 * T1.6 마이그레이션이 적용한 composite unique 정책:
 *   - content_categories (tenant_id, slug) UNIQUE — cross-tenant slug 충돌 없어야 함
 *   - content_sources (tenant_id, slug) UNIQUE
 *   - content_items (tenant_id, slug) UNIQUE
 *   - content_ingested_items (tenant_id, url_hash) UNIQUE
 *
 * 시나리오:
 *   1. ContentCategory — tenant a/b 양쪽이 동일 slug 사용 가능 (cross-tenant 비충돌)
 *   2. ContentCategory — 같은 tenant 안에서 중복 slug 는 UniqueConstraintViolation
 *   3. ContentSource — tenant a/b 양쪽이 동일 slug 사용 가능
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  TENANTS,
  setupAlmanacFixtures,
  createCategory,
  createSource,
} from "./_fixtures";

describe("almanac/composite-unique (env-gated)", () => {
  const fx = setupAlmanacFixtures();

  it.skipIf(!fx.hasDb)(
    "ContentCategory: tenant a/b 양쪽이 동일 slug 가능 (cross-tenant 비충돌)",
    async () => {
      const slug = `dup-${randomUUID().slice(0, 8)}`;
      const a = await createCategory({
        tenantId: TENANTS.a,
        track: "hustle",
        slug,
        name: "A side",
      });
      const b = await createCategory({
        tenantId: TENANTS.b,
        track: "hustle",
        slug,
        name: "B side",
      });
      expect(a.tenantId).toBe(TENANTS.a);
      expect(b.tenantId).toBe(TENANTS.b);
      expect(a.id).not.toBe(b.id);
    },
  );

  it.skipIf(!fx.hasDb)(
    "ContentCategory: 같은 tenant 안에서 중복 slug 는 unique 위반",
    async () => {
      const slug = `dupin-${randomUUID().slice(0, 8)}`;
      await createCategory({
        tenantId: TENANTS.a,
        track: "hustle",
        slug,
        name: "first",
      });
      await expect(
        createCategory({
          tenantId: TENANTS.a,
          track: "hustle",
          slug,
          name: "second",
        }),
      ).rejects.toThrow(/(unique|duplicate)/i);
    },
  );

  it.skipIf(!fx.hasDb)(
    "ContentSource: tenant a/b 양쪽이 동일 slug 가능 (cross-tenant 비충돌)",
    async () => {
      const slug = `dups-${randomUUID().slice(0, 8)}`;
      const a = await createSource({
        tenantId: TENANTS.a,
        slug,
        name: "A",
        url: "https://example.com/a",
        kind: "RSS",
      });
      const b = await createSource({
        tenantId: TENANTS.b,
        slug,
        name: "B",
        url: "https://example.com/b",
        kind: "RSS",
      });
      expect(a.tenantId).toBe(TENANTS.a);
      expect(b.tenantId).toBe(TENANTS.b);
      expect(a.id).not.toBe(b.id);
    },
  );
});
