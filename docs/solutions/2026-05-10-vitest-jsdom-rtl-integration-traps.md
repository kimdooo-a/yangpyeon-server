---
title: vitest + jsdom + @testing-library/react 통합 시 자가 발견 함정 2건 (cleanup + scrollIntoView)
date: 2026-05-10
session: 98
tags: [vitest, jsdom, testing-library, react, cleanup, scrollIntoView, INFRA-2]
category: tooling
confidence: high
---

## 문제

S98 INFRA-2 wave 진입 시 jsdom 환경 컴포넌트 렌더 TDD 작성 — 4 컴포넌트 26 test. 첫 GREEN 시도에서 **다음 두 함정 자가 발견**:

### 함정 1: 테스트 간 DOM 누적 (RTL auto-cleanup 미동작)

```
× MessageAttachment renders multiple images in 2-col grid
  AssertionError: expected [ <img>, ... ] to have a length of 3 but got 4

× MessageAttachment recalled=true shows placeholder, hides real attachments
  TestingLibraryElementError: Found multiple elements with the role "img"

× MessageAttachment sorts by displayOrder asc regardless of input order
  AssertionError: expected '/api/v1/filebox/files/img-1' to be '/api/v1/filebox/files/img-2'

× MessageBubble recalled message hides reply button
  expected document not to contain element, found <button aria-label="답장">
```

증상: `getAllByRole`/`queryByRole` 가 이전 테스트의 잔존 DOM 까지 매칭. 4 fail (out of 14).

### 함정 2: jsdom 29 의 `scrollIntoView` 미구현

```
× MessageList loading state shows skeleton with aria-busy
  TypeError: bottomRef.current?.scrollIntoView is not a function
  ❯ src/components/messenger/MessageList.tsx:51:26
       49|   useEffect(() => {
       50|     if (!loading && messages.length > 0) {
       51|       bottomRef.current?.scrollIntoView({ behavior: "auto" });
```

증상: useEffect 안의 scrollIntoView 호출이 throw. 4 fail (out of 7).

## 원인

### 함정 1 — RTL auto-cleanup 의 globals 의존성

`@testing-library/react` v9+ 는 자동 cleanup 을 제공하지만 **테스트 프레임워크의 글로벌 afterEach 가 정의되어 있을 때만 동작**. 공식 문서:

> "If you are using a test framework with afterEach hooks (e.g. mocha v4+, Jest 27+, or any framework with afterEach), then cleanup is automatic when @testing-library/react is imported."

vitest 는 `afterEach` 를 글로벌로 노출하지 **않는다 (기본 globals=false)**. `vitest.config.ts` 에 `test.globals: true` 가 설정되지 않으면 RTL 의 자동 cleanup 코드가 글로벌 `afterEach` 를 못 찾고 silent skip → 테스트 간 mounted DOM 이 누적.

### 함정 2 — jsdom 29 가 scrollIntoView 미구현

jsdom 은 layout 엔진이 없어 `scrollIntoView` 같은 layout-dependent API 를 구현하지 않는다. 현실 DOM 에서는 항상 정의되어 있어 production 코드 (`src/components/messenger/MessageList.tsx`) 가 안전하게 호출하지만, jsdom 에서는 `Element.prototype.scrollIntoView` 자체가 undefined → `?.` optional chaining 이 short-circuit 하지 않고 (메서드 access 는 OK) 호출 시점에 throw.

## 해결

두 함정 모두 **vitest setupFile 의 jsdom 분기에 흡수** — 향후 hook/component test 작성 시 자동 적용.

`src/test/setup.ts`:

```ts
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  // 함정 1 — globals=false 에서는 RTL auto-cleanup 미동작.
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
  // 함정 2 — jsdom 29 미구현 layout API.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
```

`vitest.config.ts`:
```ts
test: {
  environment: "node",  // 글로벌 default
  setupFiles: ["./src/test/setup.ts"],
  // ... // @vitest-environment jsdom 으로 파일 단위 opt-in
}
```

각 hook/component test 파일 최상단:
```ts
// @vitest-environment jsdom
```

## 교훈

- **vitest globals 결정은 setupFile 설계 결정** — globals=false 유지 (다른 테스트 import 명시 보존) 시 RTL 의 auto-cleanup 같은 "글로벌 afterEach 의존" 라이브러리는 명시 등록 필요. 향후 다른 testing-library family (testing-library/jest-dom 의 일부 query) 도입 시 동일 함정 가능성.
- **jsdom 미구현 layout API 는 polyfill 우선** — production 코드의 `scrollIntoView` / `getBoundingClientRect` / `IntersectionObserver` 등 호출이 jsdom 에서 throw 하면 컴포넌트 자체를 mock 하는 것보다 **setup.ts 에서 prototype 을 noop polyfill** 하는 것이 코드 무손상 + 테스트 의도 보존. (단, 실제 layout 행동을 검증해야 한다면 Playwright e2e 로 분리.)
- **두 함정 모두 setup.ts 에 흡수 → 향후 hook/component test 작성 자동 적용**: 이번 chunk 의 인프라 결정이 다음 chunk (PLUGIN-MIG-2+ 의 admin UI 등) 의 진입 비용을 더 낮춤.

## 관련 파일

- `src/test/setup.ts` — 두 함정 모두 흡수
- `src/test/msw/server.ts` — MSW v2 setupServer
- `vitest.config.ts` — setupFiles + .test.tsx include
- `src/components/messenger/{MessageAttachment,MessageBubble,MessageList,MessageComposer}.test.tsx` — 함정 회피 후 GREEN 26 test
- INFRA-2 commit `ff698fe`
