// =============================================================================
// 모듈: aggregator/fetchers/rss
// 역할: rss-parser 기반 RSS/Atom 피드 수집
// 출처: docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/fetchers/rss.ts
// 변경 (multi-tenant 적응):
//   - DB 의존 0 → spec 그대로 복사 (변경 0)
//   - source 객체는 caller(runner.ts)가 RLS 컨텍스트에서 fetch 한 결과를 받음
// =============================================================================

import Parser from "rss-parser";
import type { ContentSource } from "@/generated/prisma/client";
import type { RawItem } from "../types";

/** rss-parser 는 광범위한 Item shape 를 반환 — 스펙이 사용하는 키만 정의 */
type FeedItem = {
  link?: string;
  guid?: string;
  title?: string;
  contentSnippet?: string;
  summary?: string;
  content?: string;
  isoDate?: string;
  pubDate?: string;
  creator?: unknown;
  enclosure?: { url?: string };
  "media:content"?: { $?: { url?: string } };
  author?: unknown;
};

const DEFAULT_USER_AGENT = "YangpyeongBot/1.0 (+https://stylelucky4u.com; news ingest)";
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ITEMS = 20;

function getUserAgent(): string {
  return process.env.AGGREGATOR_BOT_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function getMaxItemsPerSource(): number {
  const raw = process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE;
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_ITEMS;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ITEMS;
}

function buildParser(): Parser {
  return new Parser({
    timeout: FETCH_TIMEOUT_MS,
    headers: {
      "User-Agent": getUserAgent(),
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });
}

/**
 * RSS/Atom 피드를 가져와 RawItem 배열로 변환.
 * - 에러는 그대로 throw → caller(runner)가 catch
 * - 최대 항목 수는 AGGREGATOR_MAX_ITEMS_PER_SOURCE 적용
 */
export async function fetchRss(source: ContentSource): Promise<RawItem[]> {
  const parser = buildParser();
  const feed = await parser.parseURL(source.url);

  const max = getMaxItemsPerSource();
  const slice: FeedItem[] = ((feed.items ?? []) as FeedItem[]).slice(0, max);

  const items: RawItem[] = slice.map((item: FeedItem) => {
    const link = (item.link ?? item.guid ?? "").trim();
    const title = (item.title ?? "(제목 없음)").trim();

    const summary =
      item.contentSnippet?.trim() ||
      item.summary?.trim() ||
      stripHtml(item.content ?? "").slice(0, 500) ||
      undefined;

    const enclosure = item.enclosure;
    const mediaContent = item["media:content"];
    const imageUrl =
      enclosure?.url ?? mediaContent?.$?.url ?? extractFirstImage(item.content ?? "") ?? undefined;

    const publishedAtIso = item.isoDate ?? toIso(item.pubDate);
    const publishedAt = publishedAtIso ? new Date(publishedAtIso) : undefined;

    return {
      url: link,
      title,
      summary,
      contentHtml: typeof item.content === "string" ? item.content : undefined,
      author: coerceAuthor(item.creator ?? item.author) ?? undefined,
      imageUrl,
      publishedAt,
      raw: { guid: item.guid, isoDate: item.isoDate },
    };
  });

  return items.filter((i) => i.url && i.title);
}

// ----------------------------------------------------------------------------
// 내부 유틸
// ----------------------------------------------------------------------------

function coerceAuthor(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw.trim() || null;
  if (Array.isArray(raw)) return raw.map(coerceAuthor).filter(Boolean).join(", ") || null;
  if (typeof raw === "object") {
    const obj = raw as { name?: unknown };
    if (typeof obj.name === "string") return obj.name.trim() || null;
  }
  return null;
}

function toIso(date: string | undefined | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function extractFirstImage(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}
