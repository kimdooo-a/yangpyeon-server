// =============================================================================
// 모듈: aggregator/fetchers/html
// 역할: cheerio 기반 HTML 페이지 스크래핑
// 정책:
//   - parserConfig 에서 셀렉터 명세 읽음 (listSelector, titleSel, linkSel ...)
//   - "selector@attr" 표기로 속성 추출 지원 (예: "img@src", "time@datetime")
//   - 상대 URL 은 source.url 기준 absolute 로 변환
//   - 본문은 textContent 만 추출 (HTML 그대로 저장 금지)
// =============================================================================

import * as cheerio from "cheerio";
import type { ContentSource } from "@/generated/prisma/client";
import type { RawItem } from "../types";

const DEFAULT_USER_AGENT = "YangpyeongBot/1.0 (+https://yangpyeong.app; html scraper)";
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ITEMS = 20;

/** parserConfig 스키마 */
interface HtmlParserConfig {
  /** 항목 컨테이너 (e.g. "article.post") */
  listSelector: string;
  /** 제목 셀렉터 */
  titleSel: string;
  /** 링크 셀렉터 — 보통 "a@href" 형태 */
  linkSel: string;
  /** 요약 셀렉터 (옵션) */
  summarySel?: string;
  /** 이미지 셀렉터 (옵션) — "img@src" 등 */
  imageSel?: string;
  /** 작성자 셀렉터 (옵션) */
  authorSel?: string;
  /** 날짜 셀렉터 (옵션) — 보통 "time@datetime" */
  dateSel?: string;
  /** 날짜 포맷 힌트: "iso" | "epoch_s" | "epoch_ms" (기본 iso) */
  dateFormat?: "iso" | "epoch_s" | "epoch_ms";
}

function getUserAgent(): string {
  return process.env.AGGREGATOR_BOT_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function getMaxItemsPerSource(): number {
  const raw = process.env.AGGREGATOR_MAX_ITEMS_PER_SOURCE;
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_ITEMS;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ITEMS;
}

/**
 * HTML 페이지를 fetch 한 후 parserConfig 에 따라 RawItem[] 추출.
 * 셀렉터 명세가 부실하면 빈 배열 반환 (예외는 fetch 실패시에만 발생).
 */
export async function fetchHtml(source: ContentSource): Promise<RawItem[]> {
  const config = parseConfig(source.parserConfig);
  if (!config) {
    throw new Error(`HTML 소스 #${source.id} parserConfig 누락 또는 형식 오류`);
  }

  const html = await fetchText(source.url);
  const $ = cheerio.load(html);

  const max = getMaxItemsPerSource();
  const elements = $(config.listSelector).slice(0, max).toArray();

  const items: RawItem[] = [];
  for (const el of elements) {
    const $el = $(el);

    const title = readSelector($, $el, config.titleSel)?.trim();
    const link = readSelector($, $el, config.linkSel)?.trim();
    if (!title || !link) continue;

    const absoluteUrl = toAbsoluteUrl(link, source.url);
    if (!absoluteUrl) continue;

    const summary = config.summarySel
      ? readSelector($, $el, config.summarySel)?.trim()
      : undefined;
    const imageRaw = config.imageSel ? readSelector($, $el, config.imageSel)?.trim() : undefined;
    const imageUrl = imageRaw ? toAbsoluteUrl(imageRaw, source.url) ?? undefined : undefined;
    const author = config.authorSel ? readSelector($, $el, config.authorSel)?.trim() : undefined;

    const dateRaw = config.dateSel ? readSelector($, $el, config.dateSel)?.trim() : undefined;
    const publishedAt = parseDate(dateRaw, config.dateFormat);

    items.push({
      url: absoluteUrl,
      title,
      summary,
      contentHtml: undefined, // HTML 본문 저장 금지
      author,
      imageUrl,
      publishedAt,
    });
  }

  return items;
}

// ----------------------------------------------------------------------------
// 내부 유틸
// ----------------------------------------------------------------------------

function parseConfig(raw: unknown): HtmlParserConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.listSelector !== "string") return null;
  if (typeof obj.titleSel !== "string") return null;
  if (typeof obj.linkSel !== "string") return null;
  return {
    listSelector: obj.listSelector,
    titleSel: obj.titleSel,
    linkSel: obj.linkSel,
    summarySel: typeof obj.summarySel === "string" ? obj.summarySel : undefined,
    imageSel: typeof obj.imageSel === "string" ? obj.imageSel : undefined,
    authorSel: typeof obj.authorSel === "string" ? obj.authorSel : undefined,
    dateSel: typeof obj.dateSel === "string" ? obj.dateSel : undefined,
    dateFormat:
      obj.dateFormat === "epoch_s" || obj.dateFormat === "epoch_ms" || obj.dateFormat === "iso"
        ? obj.dateFormat
        : "iso",
  };
}

/** "selector@attr" 표기 분해 */
function splitAttr(spec: string): { selector: string; attr?: string } {
  const at = spec.lastIndexOf("@");
  if (at < 0) return { selector: spec };
  return { selector: spec.slice(0, at), attr: spec.slice(at + 1) };
}

function readSelector(
  $: cheerio.CheerioAPI,
  $scope: cheerio.Cheerio<any>,
  spec: string,
): string | undefined {
  const { selector, attr } = splitAttr(spec);
  const $found = selector ? $scope.find(selector).first() : $scope;
  if ($found.length === 0) return undefined;
  if (attr) {
    const v = $found.attr(attr);
    return typeof v === "string" ? v : undefined;
  }
  return $found.text();
}

function toAbsoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function parseDate(raw: string | undefined, format?: string): Date | undefined {
  if (!raw) return undefined;
  if (format === "epoch_s") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return undefined;
    return new Date(n * 1000);
  }
  if (format === "epoch_ms") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return undefined;
    return new Date(n);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": getUserAgent(),
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTML fetch 실패: ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
