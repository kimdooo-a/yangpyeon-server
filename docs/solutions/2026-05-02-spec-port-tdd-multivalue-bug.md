---
title: spec port 시 TDD 가 spec 자체의 multi-value bug 발견
date: 2026-05-02
session: 80
tags: [spec-port, tdd, urlsearchparams, multi-value, dedupe, defensive-testing]
category: pattern
confidence: high
---

## 문제

spec 동결판의 코드를 multi-tenant 적응으로 이식 (Track B aggregator T3) 하면서 dedupe.ts 의 25 케이스 TDD 작성. 1차 실행 24/25 PASS 후 1 fail 발생:

```
Test: 12. 동일 키 다중 값은 보존 (정렬 안정성)
Expected: "https://example.com/?tag=a&tag=b"
Received: "https://example.com/?tag=a&tag=a&tag=b&tag=b"
```

입력 `https://example.com/?tag=b&tag=a` 가 정규화 후 4중복 query string 으로 변환됨.

## 원인

spec dedupe.ts:78~80 의 코드:

```ts
const keepKeys: string[] = [];
for (const key of Array.from(params.keys())) {
  // ... tracking 필터링 후
  if (!isTracking) keepKeys.push(key);
}
// "중복 키 보호: 한 번에 다 비우고 정렬 순으로 다시 set"
const kept: Array<[string, string]> = [];
for (const k of keepKeys) {
  for (const v of params.getAll(k)) kept.push([k, v]);
}
```

**근본 원인**: `URLSearchParams.keys()` 는 동일 키 multi-value 를 **별도 entry** 로 노출한다. `?tag=b&tag=a` 의 keys() 는 `['tag', 'tag']` (2개) 반환 — Map 의 keys() 와는 동작 다름.

따라서:
1. `keepKeys = ['tag', 'tag']`
2. `for (const k of keepKeys)` 가 두 번 실행됨
3. 매번 `params.getAll('tag')` 가 `['b', 'a']` 반환
4. 결과: `kept = [['tag','b'], ['tag','a'], ['tag','b'], ['tag','a']]` (4개)
5. sort 후 `[['tag','a'], ['tag','a'], ['tag','b'], ['tag','b']]` 4개 entry → query string `?tag=a&tag=a&tag=b&tag=b`

**spec 의 주석** ("중복 키 보호: 한 번에 다 비우고 정렬 순으로 다시 set") 과 **실제 동작** (multi-value 가 N×N 배 복제) 이 정반대. spec 자체의 버그 — 단일 값만 있는 일반 케이스에서는 표면화 안 되어 spec 작성/리뷰 시 누락된 것으로 추정.

## 해결

`Array.from(new Set(keepKeys))` 로 키 unique 화 후 getAll 1회만 호출:

```ts
// 중복 키 보호: keepKeys 자체가 동일 키 multi-value 를 별도 entry 로 노출하므로
// (URLSearchParams.keys() 동작) 키 자체를 unique 화 후 getAll 1회만 호출.
// spec dedupe.ts:78~80 의 주석 의도 ("한 번에 다 비우고 정렬 순으로 다시 set") 와 일치.
const keepKeysUnique = Array.from(new Set(keepKeys));
const kept: Array<[string, string]> = [];
for (const k of keepKeysUnique) {
  for (const v of params.getAll(k)) kept.push([k, v]);
}
```

`getAll(key)` 는 동일 키의 모든 값을 한 번에 반환하므로 키별 1회 호출이면 충분. 정렬 안정성도 동일하게 보장됨 (동일 키의 값 순서는 입력 순서 보존).

**검증**: 케이스 12 expected `https://example.com/?tag=a&tag=b` (2개) → 통과.

## 교훈

1. **Spec 동결판도 source of truth 아님**: spec port 는 "naive copy + 적응" 이 아니라 "검증된 동작 이식" 이어야 함. spec 의 버그가 ported code 에 그대로 들어가면 운영 단계 회귀로 표면화. 본 케이스는 multi-value query 가 흔하지 않아 commit 단계에서 발견됐지만, spec 의 6 fetcher × 4 외부 API 통합 후 표면화됐다면 실제 운영 데이터 손실 가능.

2. **TDD 의 즉시 ROI**: 25 케이스 중 정확히 1건이 spec bug 를 잡음. 케이스 12 자체는 "동일 키 multi-value (정렬 안정성)" 라는 평이한 검증 의도였으나, spec 동작과 의도된 동작 차이를 자연 표면화. **Spec 의 의도 (주석) ≠ Spec 의 코드 (실제 동작)** 일 때 TDD 가 차이를 즉시 잡는다.

3. **"이상하면 의심"**: 케이스 12 fail 후 첫 반응은 "테스트 expected 가 잘못됐나" 였으나, spec 의 주석 ("중복 키 보호") 과 실제 동작 ("4중복 복제") 이 정반대인 것을 확인하면서 spec bug 로 결론. 코멘트 vs 코드 의도 일치 검증이 spec port 시 표준 단계가 되어야 함.

4. **`URLSearchParams.keys()` 의 동작 함정**: Web 표준 spec (WHATWG URL) 상 keys() 는 모든 entry 의 키를 iterate (Map 과 다름). MDN 문서 명시되어 있으나 spec 작성자가 놓침. 동일 키 multi-value 처리 시 항상 `new Set()` unique 화 또는 `getAll()` 1회 호출 패턴 사용.

## 관련 파일

- `src/lib/aggregator/dedupe.ts` (158 LOC, B2 commit `a121289`)
- `tests/aggregator/dedupe.test.ts` (25 케이스, B2 commit)
- `docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/dedupe.ts` (spec 동결판, multi-value bug 잔존)
- 자매 CK: `2026-05-01-verification-scope-depth-auth-gate-only-insufficient.md` (verification depth — auth-gate ping ≠ flow 검증)
- 자매 메모리: `feedback_baseline_check_before_swarm.md` (plan 가정 검증 패턴)
