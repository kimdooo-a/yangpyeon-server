/**
 * tests/aggregator/fetchers.test.ts
 *
 * Track B / B4 commit — aggregator fetchers TDD (30 케이스).
 *
 * 분류:
 *   - rss.ts (7) — rss-parser Parser 모킹
 *   - html.ts (8) — fetch + cheerio (실제 cheerio 사용, fetch 만 모킹)
 *   - fetchers/index.ts (2) — kind 디스패처
 *   - api.ts (13) — fetch 모킹 (HN 3 + Reddit 2 + ProductHunt 3 + ArXiv 2 + Firecrawl 2 + 어댑터 1)
 *
 * Multi-tenant 적응 = 0 (fetcher 는 외부 HTTP 만 — DB 미터치).
 * Spec: docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md §6 T5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1) rss-parser 모킹 — Parser 인스턴스의 parseURL 만 사용. 외부 HTTP 차단.
//    arrow function 은 `new` 호출 불가 → function expression 으로 wrap.
// ─────────────────────────────────────────────────────────────────────────────
const parseURLMock = vi.fn();
vi.mock("rss-parser", () => ({
  default: vi.fn(function MockRssParser() {
    return { parseURL: parseURLMock };
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// 2) 모킹 적용 후 import (Vitest 가 호이스팅하지만 명시 순서 유지)
// ─────────────────────────────────────────────────────────────────────────────
import {
  fetchRss,
  fetchHtml,
  fetchSource,
  fetchApi,
  fetchHnAlgolia,
  fetchReddit,
  fetchProductHunt,
  fetchArxiv,
  fetchFirecrawl,
} from "@yangpyeon/tenant-almanac/lib/fetchers";
import type { ContentSource } from "@/generated/prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// 3) Helper — ContentSource 최소 fixture
// ─────────────────────────────────────────────────────────────────────────────
function makeSource(overrides: Partial<ContentSource> = {}): ContentSource {
  return {
    id: 1,
    tenantId: "00000000-0000-0000-0000-000000000001",
    slug: "test-source",
    name: "Test Source",
    url: "https://example.com/feed",
    kind: "RSS",
    defaultTrack: null,
    defaultCategoryId: null,
    country: null,
    parserConfig: {},
    active: true,
    consecutiveFailures: 0,
    lastFetchedAt: null,
    lastSuccessAt: null,
    lastError: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ContentSource;
}

const fetchMock = vi.fn();

beforeEach(() => {
  parseURLMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE;
  delete process.env.AGGREGATOR_BOT_USER_AGENT;
  delete process.env.PRODUCT_HUNT_TOKEN;
  delete process.env.PUBLIC_PH_TOKEN;
  delete process.env.FIRECRAWL_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// =============================================================================
// rss.ts (7 케이스)
// =============================================================================

describe("fetchRss — RSS/Atom 피드 수집", () => {
  it("1. parser.parseURL 가 source.url 로 호출된다", async () => {
    parseURLMock.mockResolvedValue({ items: [] });
    const source = makeSource({ url: "https://blog.example.com/rss" });

    await fetchRss(source);

    expect(parseURLMock).toHaveBeenCalledWith("https://blog.example.com/rss");
  });

  it("2. items 가 RawItem 으로 매핑된다 (title/url/summary/imageUrl/publishedAt/raw)", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          link: "https://example.com/post-1",
          title: "  포스트 1  ",
          contentSnippet: "요약",
          content: "<p>본문</p>",
          isoDate: "2026-05-02T10:00:00.000Z",
          enclosure: { url: "https://example.com/img.jpg" },
          creator: "Alice",
          guid: "guid-1",
        },
      ],
    });

    const items = await fetchRss(makeSource());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: "https://example.com/post-1",
      title: "포스트 1",
      summary: "요약",
      contentHtml: "<p>본문</p>",
      imageUrl: "https://example.com/img.jpg",
      author: "Alice",
    });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-05-02T10:00:00.000Z");
    expect(items[0].raw).toMatchObject({ guid: "guid-1" });
  });

  it("3. AGGREGATOR_MAX_ITEMS_PER_SOURCE 적용 (env=3 → 3개만)", async () => {
    process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE = "3";
    parseURLMock.mockResolvedValue({
      items: Array.from({ length: 10 }, (_, i) => ({
        link: `https://example.com/p${i}`,
        title: `Post ${i}`,
      })),
    });

    const items = await fetchRss(makeSource());

    expect(items).toHaveLength(3);
  });

  it("4. url 또는 title 비어있는 항목은 제외된다", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        { link: "", title: "no url" },
        { link: "https://example.com/ok", title: "OK" },
        { link: "https://example.com/no-title", title: "" },
      ],
    });

    const items = await fetchRss(makeSource());

    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://example.com/ok");
  });

  it("5. AGGREGATOR_BOT_USER_AGENT 존재 시 Parser 헤더에 반영된다", async () => {
    process.env.AGGREGATOR_BOT_USER_AGENT = "CustomBot/2.0";
    parseURLMock.mockResolvedValue({ items: [] });
    const Parser = (await import("rss-parser")).default as unknown as ReturnType<typeof vi.fn>;
    Parser.mockClear();

    await fetchRss(makeSource());

    expect(Parser).toHaveBeenCalled();
    const ctorArgs = Parser.mock.calls[Parser.mock.calls.length - 1]?.[0] as {
      headers?: Record<string, string>;
    };
    expect(ctorArgs?.headers?.["User-Agent"]).toBe("CustomBot/2.0");
  });

  it("6. publishedAt — isoDate 우선, pubDate fallback, 둘 다 없으면 undefined", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        { link: "https://example.com/a", title: "A", isoDate: "2026-05-02T00:00:00.000Z" },
        { link: "https://example.com/b", title: "B", pubDate: "Fri, 02 May 2026 12:00:00 GMT" },
        { link: "https://example.com/c", title: "C" },
      ],
    });

    const items = await fetchRss(makeSource());

    expect(items[0].publishedAt?.toISOString()).toBe("2026-05-02T00:00:00.000Z");
    expect(items[1].publishedAt?.toISOString()).toBe("2026-05-02T12:00:00.000Z");
    expect(items[2].publishedAt).toBeUndefined();
  });

  it("7. imageUrl — enclosure 우선, media:content fallback, 본문 첫 <img> fallback", async () => {
    parseURLMock.mockResolvedValue({
      items: [
        {
          link: "https://example.com/a",
          title: "A",
          enclosure: { url: "https://example.com/enc.jpg" },
        },
        {
          link: "https://example.com/b",
          title: "B",
          "media:content": { $: { url: "https://example.com/mc.jpg" } },
        },
        {
          link: "https://example.com/c",
          title: "C",
          content: '<p>hi</p><img src="https://example.com/inline.jpg" alt=""/>',
        },
      ],
    });

    const items = await fetchRss(makeSource());

    expect(items[0].imageUrl).toBe("https://example.com/enc.jpg");
    expect(items[1].imageUrl).toBe("https://example.com/mc.jpg");
    expect(items[2].imageUrl).toBe("https://example.com/inline.jpg");
  });
});

// =============================================================================
// html.ts (8 케이스)
// =============================================================================

describe("fetchHtml — cheerio 셀렉터 기반 스크랩", () => {
  it("8. parserConfig 누락 또는 형식 오류 시 throw", async () => {
    const source = makeSource({ kind: "HTML", parserConfig: {} as object });

    await expect(fetchHtml(source)).rejects.toThrow(/parserConfig/);
  });

  it("9. fetch 가 source.url + User-Agent 헤더로 호출된다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html><body></body></html>",
    });
    const source = makeSource({
      kind: "HTML",
      url: "https://blog.example.com/list",
      parserConfig: {
        listSelector: "article",
        titleSel: "h2",
        linkSel: "a@href",
      } as object,
    });

    await fetchHtml(source);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://blog.example.com/list");
    const headers = calledInit?.headers as Record<string, string>;
    expect(headers?.["User-Agent"]).toBeTruthy();
  });

  it("10. listSelector 매칭된 요소들에서 title/link 추출", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<html><body>
          <article><h2>Title 1</h2><a href="https://example.com/1">link</a></article>
          <article><h2>Title 2</h2><a href="https://example.com/2">link</a></article>
        </body></html>`,
    });
    const source = makeSource({
      kind: "HTML",
      url: "https://example.com",
      parserConfig: {
        listSelector: "article",
        titleSel: "h2",
        linkSel: "a@href",
      } as object,
    });

    const items = await fetchHtml(source);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: "https://example.com/1", title: "Title 1" });
    expect(items[1]).toMatchObject({ url: "https://example.com/2", title: "Title 2" });
  });

  it("11. \"selector@attr\" 표기로 속성 추출 (img@src)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<article>
           <h2>Post</h2>
           <a href="https://example.com/p">link</a>
           <img src="https://cdn.example.com/thumb.jpg" alt=""/>
         </article>`,
    });
    const source = makeSource({
      kind: "HTML",
      url: "https://example.com",
      parserConfig: {
        listSelector: "article",
        titleSel: "h2",
        linkSel: "a@href",
        imageSel: "img@src",
      } as object,
    });

    const items = await fetchHtml(source);

    expect(items[0].imageUrl).toBe("https://cdn.example.com/thumb.jpg");
  });

  it("12. 상대 URL 은 source.url 기준 absolute 로 변환된다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<article><h2>P</h2><a href="/post/123">link</a></article>`,
    });
    const source = makeSource({
      kind: "HTML",
      url: "https://blog.example.com/section/",
      parserConfig: {
        listSelector: "article",
        titleSel: "h2",
        linkSel: "a@href",
      } as object,
    });

    const items = await fetchHtml(source);

    expect(items[0].url).toBe("https://blog.example.com/post/123");
  });

  it("13. AGGREGATOR_MAX_ITEMS_PER_SOURCE 적용 (env=2 → 2개만)", async () => {
    process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE = "2";
    const articles = Array.from({ length: 5 }, (_, i) =>
      `<article><h2>T${i}</h2><a href="https://example.com/${i}">x</a></article>`,
    ).join("");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<body>${articles}</body>`,
    });
    const source = makeSource({
      kind: "HTML",
      url: "https://example.com",
      parserConfig: {
        listSelector: "article",
        titleSel: "h2",
        linkSel: "a@href",
      } as object,
    });

    const items = await fetchHtml(source);

    expect(items).toHaveLength(2);
  });

  it("14. title 또는 link 비어있는 element 는 제외된다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<body>
           <article><h2></h2><a href="https://example.com/no-title">x</a></article>
           <article><h2>OK</h2><a href="https://example.com/ok">x</a></article>
           <article><h2>No Link</h2><a href="">x</a></article>
         </body>`,
    });
    const source = makeSource({
      kind: "HTML",
      url: "https://example.com",
      parserConfig: {
        listSelector: "article",
        titleSel: "h2",
        linkSel: "a@href",
      } as object,
    });

    const items = await fetchHtml(source);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("OK");
  });

  it("15. dateFormat=\"epoch_s\" 는 초 단위 정수를 *1000 ms 로 해석", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `<article>
           <h2>P</h2>
           <a href="https://example.com/p">link</a>
           <time>1746000000</time>
         </article>`,
    });
    const source = makeSource({
      kind: "HTML",
      url: "https://example.com",
      parserConfig: {
        listSelector: "article",
        titleSel: "h2",
        linkSel: "a@href",
        dateSel: "time",
        dateFormat: "epoch_s",
      } as object,
    });

    const items = await fetchHtml(source);

    expect(items[0].publishedAt?.getTime()).toBe(1746000000 * 1000);
  });
});

// =============================================================================
// fetchers/index.ts (2 케이스) — kind 디스패처
// =============================================================================

describe("fetchSource — ContentSource.kind 디스패처", () => {
  it("16. kind=RSS 면 fetchRss (parser.parseURL) 가 호출된다", async () => {
    parseURLMock.mockResolvedValue({ items: [] });

    await fetchSource(makeSource({ kind: "RSS", url: "https://x.com/rss" }));

    expect(parseURLMock).toHaveBeenCalledWith("https://x.com/rss");
  });

  it("17. 알 수 없는 kind 면 빈 배열 반환 (throw 하지 않음)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const source = makeSource({ kind: "UNKNOWN" as ContentSource["kind"] });

    const result = await fetchSource(source);

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// api.ts (13 케이스)
// =============================================================================

describe("fetchHnAlgolia — Hacker News Algolia 어댑터", () => {
  it("18. URL 이 query/tags/hitsPerPage 를 인코딩하여 호출된다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hits: [] }),
    });
    process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE = "10";
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "hn", query: "rust async", tags: "story" } as object,
    });

    await fetchHnAlgolia(source);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("https://hn.algolia.com/api/v1/search");
    expect(calledUrl).toContain("tags=story");
    expect(calledUrl).toContain("query=rust%20async");
    expect(calledUrl).toContain("hitsPerPage=10");
  });

  it("19. hit.url 이 없으면 objectID 기반 HN 페이지 URL 로 fallback", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        hits: [
          { objectID: "12345", url: null, title: "Ask HN: foo", author: "alice" },
        ],
      }),
    });
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "hn", query: "" } as object,
    });

    const items = await fetchHnAlgolia(source);

    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://news.ycombinator.com/item?id=12345");
    expect(items[0].title).toBe("Ask HN: foo");
    expect(items[0].author).toBe("alice");
  });

  it("20. hits 가 빈 배열이면 빈 결과", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hits: [] }),
    });
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "hn" } as object,
    });

    const items = await fetchHnAlgolia(source);

    expect(items).toEqual([]);
  });
});

describe("fetchReddit — Reddit JSON 어댑터", () => {
  it("21. URL 의 trailing slash 제거 후 .json + limit 추가", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { children: [] } }),
    });
    process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE = "5";
    const source = makeSource({
      kind: "API",
      url: "https://www.reddit.com/r/programming/new///",
      parserConfig: { adapter: "reddit" } as object,
    });

    await fetchReddit(source);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe("https://www.reddit.com/r/programming/new.json?limit=5");
  });

  it("22. d.url 이 http(s) 아니면 permalink 기반 URL 로 fallback", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          children: [
            {
              data: {
                title: "Post",
                url: "/r/programming/comments/abc/post",
                permalink: "/r/programming/comments/abc/post",
                selftext: "본문",
                author: "alice",
                created_utc: 1746000000,
              },
            },
          ],
        },
      }),
    });
    const source = makeSource({
      kind: "API",
      url: "https://www.reddit.com/r/programming/new",
      parserConfig: { adapter: "reddit" } as object,
    });

    const items = await fetchReddit(source);

    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://www.reddit.com/r/programming/comments/abc/post");
    expect(items[0].publishedAt?.getTime()).toBe(1746000000 * 1000);
  });
});

describe("fetchProductHunt — Product Hunt GraphQL 어댑터", () => {
  it("23. 토큰 없으면 throw", async () => {
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "product-hunt" } as object,
    });

    await expect(fetchProductHunt(source)).rejects.toThrow(/Product Hunt/);
  });

  it("24. POST + Authorization Bearer + GraphQL body 로 호출된다", async () => {
    process.env.PRODUCT_HUNT_TOKEN = "ph_test_token";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { posts: { edges: [] } } }),
    });
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "producthunt" } as object,
    });

    await fetchProductHunt(source);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://api.producthunt.com/v2/api/graphql");
    expect(calledInit?.method).toBe("POST");
    const headers = calledInit?.headers as Record<string, string>;
    expect(headers?.Authorization).toBe("Bearer ph_test_token");
    expect(headers?.["Content-Type"]).toBe("application/json");
    const body = calledInit?.body as string;
    expect(body).toContain("posts(first:");
  });

  it("25. edges.node → RawItem (url 우선, website fallback, thumbnail 매핑)", async () => {
    process.env.PRODUCT_HUNT_TOKEN = "tok";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          posts: {
            edges: [
              {
                node: {
                  id: "p1",
                  name: "Tool A",
                  tagline: "neat",
                  url: "https://producthunt.com/posts/tool-a",
                  createdAt: "2026-05-02T00:00:00Z",
                  thumbnail: { url: "https://cdn.ph/a.jpg" },
                  user: { name: "Alice" },
                },
              },
              {
                node: {
                  id: "p2",
                  name: "Tool B",
                  website: "https://toolb.com",
                  createdAt: "2026-05-02T01:00:00Z",
                },
              },
            ],
          },
        },
      }),
    });
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "product-hunt" } as object,
    });

    const items = await fetchProductHunt(source);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: "https://producthunt.com/posts/tool-a",
      title: "Tool A",
      summary: "neat",
      imageUrl: "https://cdn.ph/a.jpg",
      author: "Alice",
    });
    expect(items[1].url).toBe("https://toolb.com");
  });
});

describe("fetchArxiv — ArXiv Atom XML 어댑터", () => {
  it("26. searchQuery 미설정 시 기본 cat:cs.AI 사용", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<feed></feed>",
    });
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "arxiv" } as object,
    });

    await fetchArxiv(source);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("search_query=cat%3Acs.AI");
    expect(calledUrl).toContain("export.arxiv.org/api/query");
  });

  it("27. Atom <entry> 요소들이 RawItem 으로 파싱된다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<feed>
        <entry>
          <title>Paper One</title>
          <summary>Abstract one.</summary>
          <published>2026-05-02T00:00:00Z</published>
          <link href="http://arxiv.org/abs/2605.0001" rel="alternate"/>
          <author><name>Alice</name></author>
        </entry>
        <entry>
          <title>Paper Two</title>
          <summary>Abstract two.</summary>
          <published>2026-05-01T00:00:00Z</published>
          <link href="http://arxiv.org/abs/2605.0002" rel="alternate"/>
          <author><name>Bob</name></author>
        </entry>
      </feed>`,
    });
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "arxiv" } as object,
    });

    const items = await fetchArxiv(source);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Paper One",
      url: "http://arxiv.org/abs/2605.0001",
      summary: "Abstract one.",
      author: "Alice",
    });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });
});

describe("fetchFirecrawl — Firecrawl 단일 URL 스크랩", () => {
  it("28. FIRECRAWL_API_KEY 누락 시 throw", async () => {
    const source = makeSource({
      kind: "FIRECRAWL",
      url: "https://spa.example.com",
      parserConfig: {} as object,
    });

    await expect(fetchFirecrawl(source)).rejects.toThrow(/FIRECRAWL_API_KEY/);
  });

  it("29. data.success=true 면 metadata 기반 1개 RawItem 반환", async () => {
    process.env.FIRECRAWL_API_KEY = "fc_test";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          markdown: "# Hello",
          metadata: {
            title: "Hello SPA",
            description: "스파 콘텐츠 요약",
            author: "Carol",
            ogImage: "https://cdn.spa/og.jpg",
            sourceURL: "https://spa.example.com/x",
            publishedTime: "2026-05-02T00:00:00Z",
          },
        },
      }),
    });
    const source = makeSource({
      kind: "FIRECRAWL",
      url: "https://spa.example.com",
      parserConfig: {} as object,
    });

    const items = await fetchFirecrawl(source);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Hello SPA",
      url: "https://spa.example.com/x",
      summary: "스파 콘텐츠 요약",
      author: "Carol",
      imageUrl: "https://cdn.spa/og.jpg",
    });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });
});

describe("fetchApi — 어댑터 디스패처", () => {
  it("30. 알 수 없는 adapter 는 throw with adapter 이름", async () => {
    const source = makeSource({
      kind: "API",
      parserConfig: { adapter: "myspace-2007" } as object,
    });

    await expect(fetchApi(source)).rejects.toThrow(/myspace-2007/);
  });
});
