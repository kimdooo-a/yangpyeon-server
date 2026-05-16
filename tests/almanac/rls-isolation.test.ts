/**
 * tests/almanac/rls-isolation.test.ts
 *
 * PLUGIN-MIG-4 (S100) — Almanac 5 모델 cross-tenant RLS 격리 검증.
 *
 * PR 게이트 #4 (CLAUDE.md): non-BYPASSRLS role 로 라이브 통과 — `bash scripts/run-integration-tests.sh tests/almanac/`.
 *
 * 시나리오:
 *   1. ContentCategory — tenant a 에 seed → tenant b runtime context 에서 0 rows
 *   2. ContentSource — 동일 패턴
 *   3. ContentIngestedItem — 동일 패턴
 *   4. ContentItem — 동일 패턴
 *   5. ContentItemMetric — 동일 패턴
 *
 * 본 테스트가 통과한다는 것 = T1.6 마이그레이션의 RLS 정책이 production-equivalent
 * 환경에서 정확히 작동함을 증명. S82 4 latent bug 패턴 재발 차단.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  TENANTS,
  setupAlmanacFixtures,
  createCategory,
  createSource,
  createItem,
  getAdminPool,
} from "./_fixtures";

describe("almanac/rls-isolation (env-gated)", () => {
  const fx = setupAlmanacFixtures();

  it.skipIf(!fx.hasDb)(
    "ContentCategory: tenant a seed 는 tenant b runtime 에서 0 rows",
    async () => {
      const { prismaWithTenant, runWithTenant } = await fx.modules();
      const slug = `cat-${randomUUID().slice(0, 8)}`;
      await createCategory({
        tenantId: TENANTS.a,
        track: "hustle",
        slug,
        name: "Tenant A AI",
      });

      // tenant a context 에서는 1건 조회
      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const rows = await prismaWithTenant.contentCategory.findMany({
          where: { slug },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.name).toBe("Tenant A AI");
      });

      // tenant b context 에서는 RLS 가 차단 → 0 rows
      await runWithTenant({ tenantId: TENANTS.b }, async () => {
        const rows = await prismaWithTenant.contentCategory.findMany({
          where: { slug },
        });
        expect(rows).toHaveLength(0);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "ContentSource: tenant a seed 는 tenant b runtime 에서 0 rows",
    async () => {
      const { prismaWithTenant, runWithTenant } = await fx.modules();
      const slug = `src-${randomUUID().slice(0, 8)}`;
      await createSource({
        tenantId: TENANTS.a,
        slug,
        name: "Tenant A Source",
        url: "https://example.com/rss",
        kind: "RSS",
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const rows = await prismaWithTenant.contentSource.findMany({
          where: { slug },
        });
        expect(rows).toHaveLength(1);
      });
      await runWithTenant({ tenantId: TENANTS.b }, async () => {
        const rows = await prismaWithTenant.contentSource.findMany({
          where: { slug },
        });
        expect(rows).toHaveLength(0);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "ContentIngestedItem: tenant a seed 는 tenant b runtime 에서 0 rows",
    async () => {
      const { prismaWithTenant, runWithTenant } = await fx.modules();
      const source = await createSource({
        tenantId: TENANTS.a,
        slug: `src-i-${randomUUID().slice(0, 8)}`,
        name: "S",
        url: "https://example.com/rss",
        kind: "RSS",
      });
      const urlHash = `hash-${randomUUID().slice(0, 12)}`;
      const pool = await getAdminPool();
      await pool.query(
        `INSERT INTO content_ingested_items (id, tenant_id, source_id, url_hash, url, title, fetched_at, raw_json, status, ai_tags, quality_flag)
         VALUES ($1, $2, $3, $4, 'https://x.com/a', 't', NOW(), '{}'::jsonb, 'pending', '{}', 'auto_ok'::"ContentQualityFlag")`,
        [`ing-${randomUUID().slice(0, 12)}`, TENANTS.a, source.id, urlHash],
      );

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const rows = await prismaWithTenant.contentIngestedItem.findMany({
          where: { urlHash },
        });
        expect(rows).toHaveLength(1);
      });
      await runWithTenant({ tenantId: TENANTS.b }, async () => {
        const rows = await prismaWithTenant.contentIngestedItem.findMany({
          where: { urlHash },
        });
        expect(rows).toHaveLength(0);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "ContentItem: tenant a seed 는 tenant b runtime 에서 0 rows",
    async () => {
      const { prismaWithTenant, runWithTenant } = await fx.modules();
      const source = await createSource({
        tenantId: TENANTS.a,
        slug: `src-it-${randomUUID().slice(0, 8)}`,
        name: "S",
        url: "https://example.com/rss",
        kind: "RSS",
      });
      const slug = `item-${randomUUID().slice(0, 8)}`;
      await createItem({
        tenantId: TENANTS.a,
        sourceId: source.id,
        track: "hustle",
        slug,
        title: "Tenant A Item",
        url: "https://x.com/a",
      });

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const rows = await prismaWithTenant.contentItem.findMany({
          where: { slug },
        });
        expect(rows).toHaveLength(1);
      });
      await runWithTenant({ tenantId: TENANTS.b }, async () => {
        const rows = await prismaWithTenant.contentItem.findMany({
          where: { slug },
        });
        expect(rows).toHaveLength(0);
      });
    },
  );

  it.skipIf(!fx.hasDb)(
    "ContentItemMetric: tenant a seed 는 tenant b runtime 에서 0 rows",
    async () => {
      const { prismaWithTenant, runWithTenant } = await fx.modules();
      const source = await createSource({
        tenantId: TENANTS.a,
        slug: `src-m-${randomUUID().slice(0, 8)}`,
        name: "S",
        url: "https://example.com/rss",
        kind: "RSS",
      });
      const item = await createItem({
        tenantId: TENANTS.a,
        sourceId: source.id,
        track: "hustle",
        slug: `m-${randomUUID().slice(0, 8)}`,
        title: "M",
        url: "https://x.com/m",
      });
      const pool = await getAdminPool();
      const date = "2026-05-16";
      await pool.query(
        `INSERT INTO content_item_metrics (tenant_id, item_id, date, views, clicks)
         VALUES ($1, $2, $3::date, 10, 2)`,
        [TENANTS.a, item.id, date],
      );

      await runWithTenant({ tenantId: TENANTS.a }, async () => {
        const rows = await prismaWithTenant.contentItemMetric.findMany({
          where: { itemId: item.id },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.views).toBe(10);
      });
      await runWithTenant({ tenantId: TENANTS.b }, async () => {
        const rows = await prismaWithTenant.contentItemMetric.findMany({
          where: { itemId: item.id },
        });
        expect(rows).toHaveLength(0);
      });
    },
  );
});
