// =============================================================================
// 모듈: aggregator/fetchers/api
// 역할: 외부 API 5종 어댑터 — HN Algolia / Reddit / Product Hunt / ArXiv / Firecrawl
// 정책:
//   - parserConfig.adapter 키로 어댑터 분기
//   - 모든 응답을 RawItem[] 으로 정규화
//   - 토큰/키는 환경변수 또는 parserConfig 에서 조회 (소스별 우선)
//   - 타임아웃 15초, 최대 항목 수 AGGREGATOR_MAX_ITEMS_PER_SOURCE
// =============================================================================

import type { ContentSource } from "@/generated/prisma/client";
import type { RawItem } from "../types";

const DEFAULT_USER_AGENT = "YangpyeongBot/1.0 (+https://yangpyeong.app; api poller)";
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ITEMS = 20;

function getUserAgent(): string {
  return process.env.AGGREGATOR_BOT_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function getMaxItems(): number {
  const raw = process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE;
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_ITEMS;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ITEMS;
}

/** parserConfig 안전 캐스팅 */
function getConfig(source: ContentSource): Record<string, unknown> {
  const raw = source.parserConfig;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/**
 * API 어댑터 디스패처 — parserConfig.adapter 키로 분기.
 * 알 수 없는 adapter 면 명시적으로 throw.
 */
export async function fetchApi(source: ContentSource): Promise<RawItem[]> {
  const config = getConfig(source);
  const adapter = String(config.adapter ?? "").toLowerCase();
  switch (adapter) {
    case "hn":
    case "hn-algolia":
      return fetchHnAlgolia(source);
    case "reddit":
      return fetchReddit(source);
    case "product-hunt":
    case "producthunt":
      return fetchProductHunt(source);
    case "arxiv":
      return fetchArxiv(source);
    case "firecrawl":
      return fetchFirecrawl(source);
    default:
      throw new Error(`알 수 없는 API adapter: "${adapter}" (source #${source.id})`);
  }
}

// ----------------------------------------------------------------------------
// 1) Hacker News Algolia
// ----------------------------------------------------------------------------

interface HnHit {
  objectID?: string;
  url?: string | null;
  title?: string | null;
  story_text?: string | null;
  author?: string | null;
  created_at?: string | null;
}

export async function fetchHnAlgolia(source: ContentSource): Promise<RawItem[]> {
  const config = getConfig(source);
  const query = typeof config.query === "string" ? config.query : "";
  const tags = typeof config.tags === "string" ? config.tags : "story";
  const max = getMaxItems();

  const url = `https://hn.algolia.com/api/v1/search?tags=${encodeURIComponent(tags)}&query=${encodeURIComponent(query)}&hitsPerPage=${max}`;
  const data = await fetchJson<{ hits?: HnHit[] }>(url);

  const items: RawItem[] = [];
  for (const hit of data.hits ?? []) {
    const link = hit.url ?? (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : null);
    if (!link || !hit.title) continue;
    items.push({
      url: link,
      title: hit.title,
      summary: hit.story_text ?? undefined,
      author: hit.author ?? undefined,
      publishedAt: hit.created_at ? new Date(hit.created_at) : undefined,
      raw: { hnObjectID: hit.objectID },
    });
  }
  return items;
}

// ----------------------------------------------------------------------------
// 2) Reddit JSON
// ----------------------------------------------------------------------------

interface RedditChild {
  data?: {
    title?: string;
    url?: string;
    permalink?: string;
    selftext?: string;
    author?: string;
    created_utc?: number;
    thumbnail?: string;
  };
}

export async function fetchReddit(source: ContentSource): Promise<RawItem[]> {
  const max = getMaxItems();
  // source.url 이 이미 https://www.reddit.com/r/foo/new 형태라고 가정
  const baseUrl = source.url.replace(/\/+$/, "");
  const url = `${baseUrl}.json?limit=${max}`;

  const data = await fetchJson<{ data?: { children?: RedditChild[] } }>(url);
  const items: RawItem[] = [];
  for (const child of data.data?.children ?? []) {
    const d = child.data;
    if (!d?.title) continue;
    const link = d.url && /^https?:\/\//.test(d.url) ? d.url
      : d.permalink ? `https://www.reddit.com${d.permalink}` : null;
    if (!link) continue;
    const thumb = d.thumbnail && /^https?:\/\//.test(d.thumbnail) ? d.thumbnail : undefined;
    items.push({
      url: link,
      title: d.title,
      summary: d.selftext?.slice(0, 500) || undefined,
      author: d.author,
      imageUrl: thumb,
      publishedAt: d.created_utc ? new Date(d.created_utc * 1000) : undefined,
    });
  }
  return items;
}

// ----------------------------------------------------------------------------
// 3) Product Hunt GraphQL
// ----------------------------------------------------------------------------

interface PhPostNode {
  id?: string;
  name?: string;
  tagline?: string;
  url?: string;
  website?: string;
  createdAt?: string;
  thumbnail?: { url?: string } | null;
  user?: { name?: string } | null;
}

export async function fetchProductHunt(source: ContentSource): Promise<RawItem[]> {
  const config = getConfig(source);
  const token =
    (typeof config.token === "string" ? config.token : "") ||
    process.env.PUBLIC_PH_TOKEN ||
    process.env.PRODUCT_HUNT_TOKEN ||
    "";
  if (!token) throw new Error("Product Hunt 토큰이 없습니다 (parserConfig.token 또는 PRODUCT_HUNT_TOKEN)");

  const max = getMaxItems();
  const query = `query { posts(first: ${max}, order: NEWEST) { edges { node { id name tagline url website createdAt thumbnail { url } user { name } } } } }`;

  const data = await fetchJson<{ data?: { posts?: { edges?: Array<{ node?: PhPostNode }> } } }>(
    "https://api.producthunt.com/v2/api/graphql",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );

  const items: RawItem[] = [];
  for (const edge of data.data?.posts?.edges ?? []) {
    const n = edge.node;
    if (!n?.name) continue;
    const link = n.url ?? n.website;
    if (!link) continue;
    items.push({
      url: link,
      title: n.name,
      summary: n.tagline ?? undefined,
      imageUrl: n.thumbnail?.url ?? undefined,
      author: n.user?.name ?? undefined,
      publishedAt: n.createdAt ? new Date(n.createdAt) : undefined,
      raw: { phId: n.id },
    });
  }
  return items;
}

// ----------------------------------------------------------------------------
// 4) ArXiv API (Atom XML)
// ----------------------------------------------------------------------------

export async function fetchArxiv(source: ContentSource): Promise<RawItem[]> {
  const config = getConfig(source);
  const searchQuery =
    typeof config.searchQuery === "string" ? config.searchQuery : "cat:cs.AI";
  const max = getMaxItems();
  const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`;

  const xml = await fetchText(url, { Accept: "application/atom+xml" });
  return parseArxivAtom(xml);
}

/** ArXiv 응답은 Atom — rss-parser 가 처리하지만 여기서는 가벼운 파서로 직접 처리 */
function parseArxivAtom(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const entryRegex = /<entry\b[\s\S]*?<\/entry>/g;
  const entries = xml.match(entryRegex) ?? [];
  for (const entry of entries) {
    const title = matchTag(entry, "title")?.replace(/\s+/g, " ").trim();
    const summary = matchTag(entry, "summary")?.replace(/\s+/g, " ").trim();
    const published = matchTag(entry, "published");
    // <link href="..." rel="alternate" /> 우선
    const linkMatch = entry.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i)
      ?? entry.match(/<id>([^<]+)<\/id>/);
    const link = linkMatch?.[1];
    const author = matchTag(entry, "author")?.replace(/<name>|<\/name>/g, "").trim();
    if (!title || !link) continue;
    items.push({
      url: link,
      title,
      summary,
      author,
      publishedAt: published ? new Date(published) : undefined,
    });
  }
  return items;
}

function matchTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : undefined;
}

// ----------------------------------------------------------------------------
// 5) Firecrawl (단일 URL 스크랩 — 동적 페이지에 사용)
// ----------------------------------------------------------------------------

interface FirecrawlScrapeResp {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      description?: string;
      author?: string;
      ogImage?: string;
      sourceURL?: string;
      publishedTime?: string;
    };
  };
}

export async function fetchFirecrawl(source: ContentSource): Promise<RawItem[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY 가 설정되지 않았습니다");

  const config = getConfig(source);
  const url = typeof config.url === "string" ? config.url : source.url;

  const data = await fetchJson<FirecrawlScrapeResp>("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });

  if (!data.success || !data.data) return [];
  const meta = data.data.metadata ?? {};
  const title = meta.title ?? url;
  const summary = (meta.description ?? data.data.markdown ?? "").slice(0, 1000) || undefined;

  return [
    {
      url: meta.sourceURL ?? url,
      title,
      summary,
      author: meta.author ?? undefined,
      imageUrl: meta.ogImage ?? undefined,
      publishedAt: meta.publishedTime ? new Date(meta.publishedTime) : undefined,
    },
  ];
}

// ----------------------------------------------------------------------------
// HTTP 유틸 — 타임아웃 + UA + JSON / 텍스트 분기
// ----------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": getUserAgent(),
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API 호출 실패: ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": getUserAgent(), ...headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API 호출 실패: ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
