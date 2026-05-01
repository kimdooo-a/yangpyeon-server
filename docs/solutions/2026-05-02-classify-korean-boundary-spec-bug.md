---
title: spec 의 \b boundary 가 한글 키워드를 매치하지 못하는 함정
date: 2026-05-02
session: 80
tags: [spec-port, tdd, regex, word-boundary, korean, hangul, lookbehind, defensive-testing, silent-regression]
category: pattern
confidence: high
---

## 문제

spec 동결판의 classify.ts (Track B aggregator T4) 를 multi-tenant 적응으로 이식하면서 TDD 40 케이스 작성. 한글 케이스 12개 (test 18/22/25/26/27/28/30/31/33/34/36/37/38) 강제 포함. spec 그대로 포팅 시 한글 케이스 다수 FAIL 예상되는 상황을 RED phase 에서 차단하기 위함.

검증 결과 = spec 의 모든 한글 키워드가 `\b` boundary 미동작으로 production 에서 매치되지 않는 silent regression. 예:

- TRACK_RULES hustle 의 `"수익화", "부업", "사이드프로젝트", "창업", "1인기업", ...` 9개 한글 키워드
- TRACK_RULES build 의 `"오픈소스", "모델", "인프라", "개발자", "릴리즈", "벤치마크", "파인튜닝"` 7개
- TRACK_RULES learn 의 `"튜토리얼", "강의", "학습", "논문", "리서치", "해설", "분석", "가이드", "입문"` 9개
- TRACK_RULES community 의 `"채용", "구조조정", "해고", "커뮤니티", "컨퍼런스", "해커톤", "모임"` 7개
- 서브카테고리 매처의 한글 키워드 다수

= **40+ 한글 키워드 silent regression**.

## 원인

spec compilePattern 의 코드:

```ts
const REGEX_META = /[.*+?^$(){}|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(REGEX_META, "\\$&");
}

function compilePattern(terms: string[]): RegExp {
  const escaped = terms.map(escapeRegex).join("|");
  return new RegExp(`\\b(?:${escaped})\\b`, "i");
}
```

**근본 원인**: JS regex 의 `\b` 는 ASCII `\w` (=[A-Za-z0-9_]) 전용 boundary. 가-힣 (Hangul Syllables U+AC00–U+D7A3) 은 `\w` 외부 → non-word 로 취급.

`\b` 매치 정의: **word char ↔ non-word char 의 전환점**. 한글 양쪽이 모두 non-word 이거나, 한글이 공백/구두점에 인접하면 양쪽 모두 non-word → boundary 미발생.

검증 (Node 24 inline):

```js
> /\b수익화\b/i.test("부업 수익화 가이드")
false  // 매치 안 됨!
```

text "부업 수익화 가이드" 에서 "수익화" 위치:
- 직전 char = " " (non-word)
- 직후 char = " " (non-word)
- 양쪽 모두 non-word → `\b` 미발생 → 매치 실패

`u` (Unicode) flag 도 도움 안 됨 — `\w` 정의가 ASCII 그대로 (backwards compat).

## 해결

`compilePattern` 을 lookbehind/lookahead 로 교체 — 가-힣 을 `\w` 와 통합 word-class 정의:

```ts
function compilePattern(terms: string[]): RegExp {
  const escaped = terms.map(escapeRegex).join("|");
  return new RegExp(
    `(?<![\\w가-힣])(?:${escaped})(?![\\w가-힣])`,
    "i",
  );
}
```

매치 동작:
- ASCII 키워드 `"openai"` → 양쪽이 `\w/한글` 이 아닐 때만 매치 = 기존 `\b` 동작 동일
- 한글 키워드 `"수익화"` → 양쪽이 `\w/한글` 이 아닐 때 매치. "부업 수익화 가이드" 에서 "수익화" 양쪽이 공백 → `[\\w가-힣]` 부재 → 매치 ✓
- 단어 일부 매치 차단: "수익화의" 의 "수익화" → 직후 char "의" (한글) → `[\\w가-힣]` 존재 → 매치 X (의도대로)

검증:

```js
> /(?<![\w가-힣])수익화(?![\w가-힣])/i.test("부업 수익화 가이드")
true  ✓
> /(?<![\w가-힣])수익화(?![\w가-힣])/i.test("수익화의 비밀")
false  ✓
> /(?<![\w가-힣])openai(?![\w가-힣])/i.test("OpenAI announces")
true  ✓
> /(?<![\w가-힣])openai(?![\w가-힣])/i.test("MyOpenAIBot")
false  ✓
```

ASCII 동작 동일 + 한글 정확. 분기 0 (ASCII/한글 키워드 한 매처에서 통합 처리).

iteration order 부수효과: 한글 fix 후 '인프라' 같은 일반 한글 키워드가 양쪽 매처(korean-tech, infrastructure)에 동시 노출되어 first-match-wins 룰에서 한국 회사명 텍스트가 한국 매처를 우선 채택 안 되는 경우 발생 가능. 해결 = `SUBCATEGORY_RULES` 순서를 `... korean-tech → infrastructure ...` 로 배치 (한국 특화 매처를 일반 매처보다 앞에). test 22 ("네이버 카카오 AI 모델 출시 / 라인 우아한 인프라" → korean-tech) 가 강제 검증.

## 교훈

1. **JS `\b` 는 ASCII 전용 함정**. CJK (한글/한자/일본어) 키워드를 다루는 모든 regex 에서 silent regression 위험. 일반화: regex 작성 시 `\w`/`\b` 가 사용된다면 ASCII 환경 외 검증 필수.

2. **spec 동결판은 single-environment-tested 일 가능성**. 본 세션에서 두 번째 spec port-time bug 차단 (B2 multi-value + B3 한글 boundary). spec 작성자가 한글 케이스를 unit test 안 했거나 production 에서 한글 콘텐츠가 적었을 가능성. 자매 CK = `2026-05-02-spec-port-tdd-multivalue-bug.md`.

3. **TDD 의 도메인-aware 케이스 강제 포함이 silent regression 차단**. 한글 12 케이스 강제 포함이 있었기에 RED phase 에서 즉시 표면화. 만약 ASCII 케이스만 있었다면 B4~B7 의 production 통합 단계 가서야 발견됐을 잠재 회귀 (24h+ 운영 후 "한글 콘텐츠가 분류 안됨" 형태로).

4. **`pit of success` 적용**: 매처 코드 단일 (분기 0) + 한글 keyword 작성자가 boundary 신경 안 써도 정확 동작. 라이브러리 함수 (`compilePattern`) 한 번 fix → caller (TRACK_RULES + SUBCATEGORY_RULES) 전부 자동 보호.

## 관련 파일

- `src/lib/aggregator/classify.ts` (308 LOC, B3 commit `e74f3ef`)
- `tests/aggregator/classify.test.ts` (40 케이스, RED → GREEN)
- `docs/research/baas-foundation/05-aggregator-migration/slug-mapping-db-vs-spec.md` (DB 시드 매핑 표)
- `docs/solutions/2026-05-02-spec-port-tdd-multivalue-bug.md` (자매 CK, B2 multi-value bug)
- `docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/classify.ts` (spec 원본, `\b` 사용)
