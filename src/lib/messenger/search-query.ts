/**
 * Search query pure logic — M5 검색 (Phase 2 후속).
 *
 * Backend zod `searchMessagesSchema` (`src/lib/schemas/messenger/messages.ts`)
 * 와 정합 — q: trim 후 1~100자.
 */

const MAX_LEN = 100;

export function normalizeQuery(raw: string): string {
  return raw.trim();
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_long" };

export function validateQuery(raw: string): ValidateResult {
  const q = normalizeQuery(raw);
  if (q.length === 0) return { ok: false, reason: "empty" };
  if (q.length > MAX_LEN) return { ok: false, reason: "too_long" };
  return { ok: true };
}

export function canSearch(raw: string): boolean {
  return validateQuery(raw).ok;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * 본문에서 query 매칭을 segments 로 분리. 대소문자 무시.
 *
 * 정규식 메타문자는 이스케이프 처리 — query 가 사용자 입력이라 안전성 우선.
 * 빈 query 또는 매칭 없음 → 단일 segment 반환.
 */
export function highlightMatches(text: string, rawQuery: string): HighlightSegment[] {
  const q = normalizeQuery(rawQuery);
  if (q.length === 0) {
    return [{ text, match: false }];
  }
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(regex)) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), match: false });
    }
    segments.push({ text: m[0], match: true });
    lastIndex = start + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false });
  }
  if (segments.length === 0) {
    return [{ text, match: false }];
  }
  return segments;
}
