---
title: iOS Safari User-Agent regex — "Version/N ... Safari/N" 사이 Mobile/ 토큰 끼임 함정
date: 2026-04-19
session: 38
tags: [regex, user-agent, ios-safari, mobile-safari, webkit, parseUserAgent]
category: bug-fix
confidence: high
---

## 문제

`parseUserAgent` 구현 중 iOS Safari UA 테스트 케이스가 단독 실패:

```
AssertionError: expected '기타 브라우저 · iOS' to be 'Safari 17 · iOS'

UA: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)
     AppleWebKit/605.1.15 (KHTML, like Gecko)
     Version/17.0 Mobile/15E148 Safari/604.1"
```

동일 로직이 macOS Safari (`Version/17.1 Safari/605.1.15`) 에서는 성공하는데 iOS 만 실패.

## 원인

**초기 regex**:
```typescript
const safariVersion = raw.match(/Version\/(\d+)[^\s]*\s+Safari/);
```

이 패턴은 `Version/N<주석>공백+Safari` 를 기대한다. 그러나 iOS Safari UA 에서는 `Version/` 과 `Safari/` 사이에 `Mobile/15E148` 같은 **중간 토큰이 하나 더 끼어 있다**:

| 위치 | macOS Safari | iOS Safari |
|------|--------------|------------|
| Version/ 뒤 | `Safari/` 바로 옴 | `Mobile/15E148` 먼저 |
| 공백 수 | 1 | 2 |
| regex 결과 | 매치 ✓ | 매치 실패 ❌ |

`[^\s]*` 는 공백 이외를 탐욕적으로 먹지만 `\s+Safari` 경계에서 멈추므로 중간에 다른 토큰이 끼면 전체 패턴이 깨진다.

## 해결

Version 과 Safari 토큰의 **인접 의존성을 제거**하고, 대신 **exclusion 조건** 으로 Safari 를 식별:

```typescript
const edge    = raw.match(/Edg\/(\d+)/);
const chrome  = !edge ? raw.match(/Chrome\/(\d+)/) : null;
const firefox = raw.match(/Firefox\/(\d+)/);

// Safari: "Safari/" 토큰 존재 + Chrome/Edge 부재 (Chrome 도 Safari/ 포함하지만 Chrome/ 이 있음)
const hasSafari      = !chrome && !edge && /Safari\//.test(raw);
const safariVersion  = hasSafari ? raw.match(/Version\/(\d+)/) : null;
```

**핵심 변경**:
1. Version 과 Safari 의 **공간 관계 해제** — 같은 문자열 안 어디든 있으면 됨
2. **negative gate**: Chrome/Edge UA 에도 `Safari/537.36` 가 있으므로 Chrome/Edge 먼저 배제
3. Version 매치는 그 다음 단순 `Version\/(\d+)` — `[^\s]*\s+` 접두 불필요

## 교훈

1. **브라우저 UA 는 조합 가변성이 높음** — iOS Safari / iPadOS Safari / watchOS Safari 는 모두 `Safari/` 포함하지만 중간 토큰 구성이 다르다. 선행/후행 토큰 **인접을 가정한 regex 는 fragile**.
2. **positive + negative 조합 게이트가 더 견고** — "Safari/ 토큰 존재 + Chrome/Edge 부재" 같은 이중 조건이 순수 positive matching 보다 오탐 적음. Chrome UA 에 `Safari/537.36` 가 있는 WebKit 역사적 잔재를 자연스럽게 제거.
3. **UA 파싱 테스트는 실제 사용자 UA 를 fixture 로 써야 한다** — 합성 UA 로 테스트하면 실제 Mobile/ 같은 중간 토큰을 놓친다. `caniuse.com/user-agent` / DevTools 의 실제 dump 가 더 안전.
4. **ua-parser-js 같은 라이브러리 도입 판단 기준**: 식별 대상이 "주류 브라우저 + curl" 정도면 자체 regex 로 충분하지만, 봇/크롤러/WebView 까지 커버하면 ua-parser-js (~20KB) 가 경제적. 범위 확장 시 재평가 조건.

## 관련 파일

- `src/lib/sessions/activity.ts` — `parseUserAgent` 최종 구현
- `src/lib/sessions/activity.test.ts` — iOS Safari fixture 를 포함한 14 파싱 테스트 (총 25 중)
- `src/app/(protected)/account/security/page.tsx` — 라벨 표시 지점 (raw UA 는 title 툴팁 보존)
