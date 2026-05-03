/**
 * tests/aggregator/dedupe.test.ts
 *
 * Track B / B2 commit — aggregator dedupe TDD (25 케이스).
 *
 * 분류:
 *   - canonicalizeUrl 순수 함수 (12) — DB 의존 0
 *   - urlHash 순수 함수 (5) — DB 의존 0
 *   - dedupeAgainstDb (8) — tenantPrismaFor mocked
 *
 * spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §6 T3
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1) tenantPrismaFor 모킹 — dedupeAgainstDb 가 호출하는 외부 의존만 격리.
// ─────────────────────────────────────────────────────────────────────────────
const findManyMock = vi.fn();

vi.mock("@/lib/db/prisma-tenant-client", () => ({
  tenantPrismaFor: vi.fn(() => ({
    contentIngestedItem: { findMany: findManyMock },
  })),
}));

// ─────────────────────────────────────────────────────────────────────────────
// 2) 순수 함수 import — 모킹 적용 후 import 해야 vi.mock 이 발동
// ─────────────────────────────────────────────────────────────────────────────
import {
  canonicalizeUrl,
  urlHash,
  dedupeAgainstDb,
} from "@/lib/aggregator/dedupe";
import type { RawItem } from "@/lib/aggregator/types";

const FAKE_TENANT_CTX = {
  tenantId: "00000000-0000-0000-0000-000000000001",
};

beforeEach(() => {
  findManyMock.mockReset();
});

// =============================================================================
// canonicalizeUrl (12 케이스) — 순수 함수
// =============================================================================

describe("canonicalizeUrl — 순수 정규화", () => {
  it("1. 빈 문자열 → 빈 문자열", () => {
    expect(canonicalizeUrl("")).toBe("");
  });

  it("2. 잘못된 URL → trim 만 한 원문 반환", () => {
    expect(canonicalizeUrl("  not-a-url  ")).toBe("not-a-url");
  });

  it("3. fragment 제거", () => {
    expect(canonicalizeUrl("https://example.com/post#top")).toBe(
      "https://example.com/post",
    );
  });

  it("4. utm_source/utm_medium 제거", () => {
    const result = canonicalizeUrl(
      "https://example.com/a?utm_source=newsletter&utm_medium=email&id=123",
    );
    expect(result).toBe("https://example.com/a?id=123");
  });

  it("5. fbclid / gclid / msclkid / yclid 제거", () => {
    const result = canonicalizeUrl(
      "https://example.com/a?fbclid=ABC&gclid=DEF&msclkid=GHI&yclid=JKL",
    );
    expect(result).toBe("https://example.com/a");
  });

  it("6. _ga / vero_* prefix 제거", () => {
    const result = canonicalizeUrl(
      "https://example.com/?_ga=2.1234&vero_id=abc&keep=ok",
    );
    expect(result).toBe("https://example.com/?keep=ok");
  });

  it("7. 호스트 lowercase + IDN punycode 자동 처리", () => {
    expect(canonicalizeUrl("HTTPS://EXAMPLE.COM/path")).toBe(
      "https://example.com/path",
    );
  });

  it("8. trailing slash 제거 (path) — 루트는 보존", () => {
    expect(canonicalizeUrl("https://example.com/post/")).toBe(
      "https://example.com/post",
    );
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("9. 기본 포트 제거 (http:80 / https:443)", () => {
    expect(canonicalizeUrl("http://example.com:80/x")).toBe(
      "http://example.com/x",
    );
    expect(canonicalizeUrl("https://example.com:443/x")).toBe(
      "https://example.com/x",
    );
  });

  it("10. 비표준 포트는 보존", () => {
    expect(canonicalizeUrl("https://example.com:8080/x")).toBe(
      "https://example.com:8080/x",
    );
  });

  it("11. query 파라미터 정렬 → 동일 URL 의 순서 차이를 흡수", () => {
    const a = canonicalizeUrl("https://example.com/?b=2&a=1");
    const b = canonicalizeUrl("https://example.com/?a=1&b=2");
    expect(a).toBe(b);
  });

  it("12. 동일 키 다중 값은 보존 (정렬 안정성)", () => {
    const result = canonicalizeUrl("https://example.com/?tag=b&tag=a");
    // 정렬 후 a, b 순으로 다시 추가
    expect(result).toBe("https://example.com/?tag=a&tag=b");
  });
});

// =============================================================================
// urlHash (5 케이스) — sha256 안정성
// =============================================================================

describe("urlHash — 동일 URL 안정 해시", () => {
  it("13. 동일 URL 두 번 → 동일 해시", () => {
    const h1 = urlHash("https://example.com/post");
    const h2 = urlHash("https://example.com/post");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("14. 다른 URL → 다른 해시", () => {
    expect(urlHash("https://example.com/a")).not.toBe(
      urlHash("https://example.com/b"),
    );
  });

  it("15. fragment / utm 차이는 동일 해시 (canonicalize 흡수)", () => {
    const h1 = urlHash("https://example.com/post#top");
    const h2 = urlHash("https://example.com/post?utm_source=x");
    const h3 = urlHash("https://example.com/post");
    expect(h1).toBe(h3);
    expect(h2).toBe(h3);
  });

  it("16. 호스트 대소문자 차이는 동일 해시", () => {
    expect(urlHash("HTTPS://EXAMPLE.COM/x")).toBe(
      urlHash("https://example.com/x"),
    );
  });

  it("17. trailing slash 차이는 동일 해시 (path)", () => {
    expect(urlHash("https://example.com/x/")).toBe(
      urlHash("https://example.com/x"),
    );
  });
});

// =============================================================================
// dedupeAgainstDb (8 케이스) — tenantPrismaFor mocked
// =============================================================================

describe("dedupeAgainstDb — DB 일괄 dedupe (mocked)", () => {
  function makeItem(url: string, title?: string): RawItem {
    return { url, title: title ?? url };
  }

  it("18. 빈 배열 → fresh=[], duplicates=0, DB 호출 0", async () => {
    const result = await dedupeAgainstDb([], FAKE_TENANT_CTX);
    expect(result.fresh).toEqual([]);
    expect(result.duplicates).toBe(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("19. DB 에 0건 매치 → 모두 fresh", async () => {
    findManyMock.mockResolvedValueOnce([]);
    const items = [
      makeItem("https://a.com/1"),
      makeItem("https://a.com/2"),
    ];
    const result = await dedupeAgainstDb(items, FAKE_TENANT_CTX);
    expect(result.fresh).toHaveLength(2);
    expect(result.duplicates).toBe(0);
  });

  it("20. DB 에 모두 매치 → fresh=[], duplicates=N", async () => {
    const items = [
      makeItem("https://a.com/1"),
      makeItem("https://a.com/2"),
    ];
    const hashes = items.map((x) => urlHash(x.url));
    findManyMock.mockResolvedValueOnce(
      hashes.map((h) => ({ urlHash: h })),
    );
    const result = await dedupeAgainstDb(items, FAKE_TENANT_CTX);
    expect(result.fresh).toHaveLength(0);
    expect(result.duplicates).toBe(2);
  });

  it("21. DB 에 일부 매치 → fresh + duplicates 올바른 분리", async () => {
    const items = [
      makeItem("https://a.com/1"),
      makeItem("https://a.com/2"),
      makeItem("https://a.com/3"),
    ];
    const dupHash = urlHash("https://a.com/2");
    findManyMock.mockResolvedValueOnce([{ urlHash: dupHash }]);
    const result = await dedupeAgainstDb(items, FAKE_TENANT_CTX);
    expect(result.fresh).toHaveLength(2);
    expect(result.fresh.map((x) => x.url)).toEqual([
      "https://a.com/1",
      "https://a.com/3",
    ]);
    expect(result.duplicates).toBe(1);
  });

  it("22. batch 내 중복은 1회만 SELECT 에 포함 + duplicates 합산", async () => {
    const items = [
      makeItem("https://a.com/x"),
      makeItem("https://a.com/x"), // batch 내부 중복
      makeItem("https://a.com/y"),
    ];
    findManyMock.mockResolvedValueOnce([]);
    const result = await dedupeAgainstDb(items, FAKE_TENANT_CTX);
    // batch dedupe 후 unique = 2 (x, y), 모두 fresh
    expect(result.fresh).toHaveLength(2);
    // duplicates = batch 내부 중복 1
    expect(result.duplicates).toBe(1);
    // SELECT 는 unique 만 조회
    const callArgs = findManyMock.mock.calls[0][0];
    expect(callArgs.where.urlHash.in).toHaveLength(2);
  });

  it("23. canonicalize 가 dedupe 단위에 반영 — UTM 다른 URL 도 batch 내 중복", async () => {
    const items = [
      makeItem("https://a.com/post"),
      makeItem("https://a.com/post?utm_source=x"), // canonicalize 후 동일
    ];
    findManyMock.mockResolvedValueOnce([]);
    const result = await dedupeAgainstDb(items, FAKE_TENANT_CTX);
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("24. tenantPrismaFor 가 ctx 와 함께 호출됨 (closure 캡처 검증)", async () => {
    findManyMock.mockResolvedValueOnce([]);
    const { tenantPrismaFor } = await import(
      "@/lib/db/prisma-tenant-client"
    );
    await dedupeAgainstDb([makeItem("https://a.com/1")], FAKE_TENANT_CTX);
    expect(tenantPrismaFor).toHaveBeenCalledWith(FAKE_TENANT_CTX);
  });

  it("25. SELECT where.urlHash.in 이 ctx 의 hash 와 정확히 일치", async () => {
    const items = [
      makeItem("https://example.com/a"),
      makeItem("https://example.com/b"),
    ];
    const expectedHashes = items.map((x) => urlHash(x.url));
    findManyMock.mockResolvedValueOnce([]);
    await dedupeAgainstDb(items, FAKE_TENANT_CTX);
    const callArgs = findManyMock.mock.calls[0][0];
    expect(new Set(callArgs.where.urlHash.in)).toEqual(
      new Set(expectedHashes),
    );
    expect(callArgs.select).toEqual({ urlHash: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // S84-D 진단 후속 — cross-tenant collision 차단 (BYPASSRLS prod 회피)
  // ─────────────────────────────────────────────────────────────────────────
  // 원인: prod = postgres BYPASSRLS → SET LOCAL app.tenant_id 가 RLS 회피로 인해
  // SELECT 필터링 효과 없음. dedupe 가 RLS 에만 의존하면 다른 tenant 의 동일
  // urlHash 행을 "existing" 으로 오인 → over-aggressive duplicate flagging.
  // 2026-05-02 21:00 runNow: 130 fetched 가 default tenant 의 legacy 130 행과
  // collision 되어 inserted=1 duplicates=129 (사실 신규 130 모두 fresh 였음).
  // 수정: WHERE 절에 ctx.tenantId 명시 (defense-in-depth).
  it("26. SELECT where 에 ctx.tenantId 가 명시되어야 함 (BYPASSRLS 회피)", async () => {
    findManyMock.mockResolvedValueOnce([]);
    await dedupeAgainstDb([makeItem("https://a.com/1")], FAKE_TENANT_CTX);
    const callArgs = findManyMock.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe(FAKE_TENANT_CTX.tenantId);
  });
});
