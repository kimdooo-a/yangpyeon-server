---
title: Spec port-time bug 4건 누적 패턴 — TDD 가 매번 RED phase 에서 표면화
date: 2026-05-02
session: 80 (3차 정합화 시점)
tags: [tdd, spec-port, korean-i18n, regex-boundary, slug-normalization, atom-xml, multi-value-query]
category: pattern
confidence: high
---

## 문제

세션 80 안에서 Almanac aggregator spec (10 모듈 1,891 LOC) 을 multi-tenant 적응으로 이식하는 동안, **단일 세션에서 spec 동결판 자체의 bug 4건이 모두 TDD RED phase 에서 발견**됨:

| # | commit | 모듈 | 증상 | 운영 환경 영향 |
|---|---|---|---|---|
| 1 | B2 `a121289` | dedupe.ts | `?tag=b&tag=a` 정규화 → expected `?tag=a&tag=b` / 실제 `?tag=a&tag=a&tag=b&tag=b` (multi-value duplication) | dedupe 가 같은 multi-value tag query string 을 별개 URL 로 처리 → 중복 콘텐츠 promote |
| 2 | B3 `e74f3ef` | classify.ts | `compilePattern` 의 `\b` boundary 가 한글 키워드 매처에서 사실상 비기능 | spec 의 모든 한글 키워드 (TRACK_RULES + 서브카테고리) 가 production 에서 매치 0건 → 한국어 콘텐츠 모두 미분류 |
| 3 | B4 `100ae5c` | fetchers/api.ts | ArXiv link regex `<link[^>]*rel="alternate"[^>]*href="..."/>` 가 attribute 순서 의존 (`rel` 이 `href` 앞일 때만) | 실제 ArXiv API 가 attribute 순서 변경 시 silent → 0 items 반환 → cron consecutive failures 5 → active=false 자동 비활성 |
| 4 | B5 `58a526a` | promote.ts | slugify `normalize("NFKD")` 가 한글 음절 (가-힣 U+AC00~U+D7A3) 을 jamo (U+1100~U+11FF) 로 분해 → 이후 `[^a-z0-9가-힣]+` regex 가 jamo 매치 실패 | 한글 제목 카드 모두 `slug = "item-<urlHash>"` 형태로 promote → 의미 없는 URL + slug 충돌 가능 |

## 원인 — 메타 패턴

**Spec 동결판은 single-environment-tested + happy-path-only-tested**.

근본 분류:

1. **언어 환경 가정 누락** (B3 한글 boundary, B5 NFKD-Hangul):
   - JS `\b` 는 ASCII `\w` (= [A-Za-z0-9_]) 전용. 한글/CJK 는 non-word 로 취급.
   - Unicode normalize NFKD 는 라틴 diacritic 분리 의도 (é → e + combining mark) 였지만, Hangul 도 분해 (도 → ㄷ + ㅗ).
   - **공통**: spec 가 ASCII 환경에서만 unit test 됐으면 silent regression.

2. **데이터 형식 가정 의존** (B1 multi-value, B4 attribute order):
   - `URLSearchParams.keys()` 는 multi-value 키 (`tag=a&tag=b`) 를 별도 entry 로 노출. 의도와 어긋날 수 있음.
   - HTML/XML attribute 순서는 표준상 무관하지만 정규식이 순서 가정.
   - **공통**: spec 가 happy-path (single-value query, attribute 순서 고정) 에서만 검증.

3. **Production 환경에서의 silent failure**:
   - 4건 모두 throw 하지 않고 잘못된 결과 (빈 슬러그 / 중복 URL / 미분류 / 0 items) 반환.
   - cron consecutiveFailures 가 자동 active=false 로 차단하지만, **운영자가 이상 감지 후 dashboard 들여다봐야 발견** (24h+ 지연 가능).

## 해결 — 4건 fix 요약

```ts
// B2: keepKeys 중복 제거
const keepKeys = Array.from(new Set(keepKeys));

// B3: ASCII + 한글 통합 word-class
const pattern = `(?<![\\w가-힣])(?:${keyword})(?![\\w가-힣])`;

// B4: attribute 순서 무관 link 추출
function extractAlternateLink(entry: string): string | undefined {
  const linkTagRegex = /<link\b[^>]*\/?>/gi;
  for (const tag of entry.match(linkTagRegex) ?? []) {
    if (!/\brel="alternate"/i.test(tag)) continue;
    const hrefMatch = tag.match(/\bhref="([^"]+)"/i);
    if (hrefMatch) return hrefMatch[1];
  }
  return undefined;
}

// B5: NFKD 후 NFC 재결합 (Latin diacritic 효과 보존 + 한글 음절 복원)
input
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[̀-ͯ]/g, "")
  .normalize("NFC") // ← B5 fix
  .replace(/[^a-z0-9가-힣]+/g, "-")
```

## 교훈

1. **Spec 동결판도 source of truth 아님**. spec port 시 "그대로 복사" 의 함정. spec 의 의도 (주석) ≠ spec 의 코드 (실제 동작) 일 때 TDD 가 차이를 즉시 표면화.
2. **TDD RED phase 의 immediate ROI**: 4건 모두 RED phase 에서 발견 + 동일 commit 안에서 fix. 운영 활성화 후 24h+ 지연 발견 시 cron 부하 + 운영자 디버깅 부담을 사전 차단.
3. **언어 환경 + 데이터 형식 가정 케이스 강제 포함**: spec 의 unit test 가 ASCII + happy-path 만 검증했는지 항상 의심. **port 측 TDD 는 한글/CJK + multi-value + attribute order 케이스 강제 포함**.
4. **silent failure 검증 우선**: 응답 status 가 아니라 데이터 일치 검증. 자매 메모리 룰 `feedback_verification_scope_depth.md` (auth-gate ping ≠ actual flow). 본 패턴은 그 룰의 "single-call-site" 변형 — `extractAlternateLink` 가 throw 하지 않고 `undefined` 반환 → caller 가 entry skip → 0 items.

## 관련 파일

- `src/lib/aggregator/dedupe.ts` (B2 multi-value fix)
- `src/lib/aggregator/classify.ts` (B3 한글 boundary fix)
- `src/lib/aggregator/fetchers/api.ts` (B4 ArXiv link order fix)
- `src/lib/aggregator/promote.ts` (B5 slugify NFC fix)
- `tests/aggregator/dedupe.test.ts` (case 12)
- `tests/aggregator/classify.test.ts` (12 한글 케이스)
- `tests/aggregator/fetchers.test.ts` (test 27 ArXiv)
- `tests/aggregator/promote.test.ts` (test 6 한글 slugify)

## 자매 CK

- `2026-05-02-spec-port-tdd-multivalue-bug.md` (B2 단독 사례)
- `2026-05-02-classify-korean-boundary-spec-bug.md` (B3 단독 사례)
- `2026-05-01-verification-scope-depth-auth-gate-only-insufficient.md` (검증 깊이 메타 패턴)
