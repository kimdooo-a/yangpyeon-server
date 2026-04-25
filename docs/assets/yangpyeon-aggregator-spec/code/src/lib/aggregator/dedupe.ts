// =============================================================================
// 모듈: aggregator/dedupe
// 역할: URL 정규화(canonicalize) + sha256 해시 + DB 일괄 중복 제거
// 핵심 정책:
//   - UTM/fbclid/gclid 등 트래킹 파라미터 제거
//   - fragment(#...) 제거
//   - 호스트 lowercase + trailing slash 제거(루트는 보존)
//   - 정렬된 query string 으로 안정적 해시 생성
// =============================================================================

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { RawItem } from "./types";

/** 트래킹 파라미터 prefix/이름 — canonicalize 단계에서 모두 제거 */
const TRACKING_PARAMS: ReadonlyArray<string> = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_reader",
  "utm_brand",
  "utm_social",
  "utm_social-type",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "yclid",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "spm",
];

/** 위 리스트에 더해 prefix 매칭으로 제거할 패턴 */
const TRACKING_PREFIXES: ReadonlyArray<string> = ["utm_", "vero_", "_ga"];

/**
 * URL 을 표준 형식으로 정규화한다.
 * 잘못된 URL 은 원문을 trim 만 해서 그대로 반환 (해시는 어차피 안정적).
 */
export function canonicalizeUrl(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }

  // 호스트 lowercase + IDN punycode 자동 처리는 URL 객체가 수행
  u.hostname = u.hostname.toLowerCase();

  // fragment 제거
  u.hash = "";

  // 트래킹 파라미터 제거 (정렬된 키 순회 → 안정적 직렬화)
  const params = u.searchParams;
  const keepKeys: string[] = [];
  for (const key of Array.from(params.keys())) {
    const lower = key.toLowerCase();
    const isTracking =
      TRACKING_PARAMS.includes(lower) ||
      TRACKING_PREFIXES.some((p) => lower.startsWith(p));
    if (!isTracking) keepKeys.push(key);
  }
  // 중복 키 보호: 한 번에 다 비우고 정렬 순으로 다시 set
  const kept: Array<[string, string]> = [];
  for (const k of keepKeys) {
    for (const v of params.getAll(k)) kept.push([k, v]);
  }
  // 모든 키 제거
  for (const k of Array.from(params.keys())) params.delete(k);
  // 정렬해 다시 추가 → 동일 URL 의 순서 차이가 다른 해시를 만들지 않게
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  for (const [k, v] of kept) params.append(k, v);

  // trailing slash 정규화: 루트("/")는 보존, 그 외 path 끝 "/" 는 제거
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  // 기본 포트 제거 (http:80, https:443)
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }

  return u.toString();
}

/** sha256(canonicalize(url)) 을 hex 문자열로 반환 */
export function urlHash(input: string): string {
  const canon = canonicalizeUrl(input);
  return crypto.createHash("sha256").update(canon).digest("hex");
}

/**
 * RawItem 배열에 대해 DB 의 content_ingested_items.urlHash 와 비교하여
 * 신규(=DB에 없는) 항목만 반환한다. 함수 내부에서 dedup 도 같이 수행.
 */
export async function dedupeAgainstDb(items: RawItem[]): Promise<{
  fresh: RawItem[];
  duplicates: number;
}> {
  if (items.length === 0) return { fresh: [], duplicates: 0 };

  // 1) 동일 batch 내 중복 제거 (같은 fetch에서 동일 URL 두 번 등장)
  const seenInBatch = new Set<string>();
  const batchUnique: Array<{ item: RawItem; hash: string }> = [];
  for (const item of items) {
    const hash = urlHash(item.url);
    if (seenInBatch.has(hash)) continue;
    seenInBatch.add(hash);
    batchUnique.push({ item, hash });
  }

  // 2) DB 와 비교 — 일괄 SELECT
  const hashes = batchUnique.map((x) => x.hash);
  const existing = await prisma.contentIngestedItem.findMany({
    where: { urlHash: { in: hashes } },
    select: { urlHash: true },
  });
  const existingSet = new Set(existing.map((r) => r.urlHash));

  const fresh: RawItem[] = [];
  let duplicates = 0;
  for (const { item, hash } of batchUnique) {
    if (existingSet.has(hash)) {
      duplicates += 1;
    } else {
      fresh.push(item);
    }
  }
  // batch 내부 중복도 합산
  duplicates += items.length - batchUnique.length;

  return { fresh, duplicates };
}
