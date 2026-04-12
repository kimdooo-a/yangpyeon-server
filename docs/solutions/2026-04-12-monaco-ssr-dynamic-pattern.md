---
title: Monaco Editor SSR 회피 + 초기 번들 분리 패턴
date: 2026-04-12
session: 17
tags: [monaco-editor, nextjs, dynamic-import, ssr, client-component]
category: pattern
confidence: high
---

## 문제
Next.js App Router의 `"use client"` 컴포넌트에서 `@monaco-editor/react`를 직접 import하면 SSR 단계에서 `window is not defined` 참조 오류 위험 + 초기 라우트 JS에 Monaco 전체(수 MB)가 포함되어 첫 페인트가 느려진다.

## 원인
- `@monaco-editor/react` 내부가 `window` 및 브라우저 전역 DOM을 전제로 동작
- `"use client"` 선언만으로는 컴포넌트가 여전히 서버에서 prerender 단계를 거치므로 import 자체는 평가됨
- Static prerender(`○`) 라우트의 경우 특히 직접 import가 빌드 실패의 원인이 되기 쉬움

## 해결
`next/dynamic`의 `ssr: false`로 감싸 클라이언트 전용 chunk로 분리:

```tsx
"use client";

import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-lg border border-border bg-surface-200 text-xs text-gray-500">
      에디터 로딩 중...
    </div>
  ),
});
```

사용 시 주의:
- **컨테이너 높이 고정 필수** — `h-64` 같은 명시적 px/rem. Monaco `height="100%"` + `automaticLayout: true`로 리사이즈 대응
- `onChange(value)` 시그니처가 `(string | undefined) => void` — 반드시 `value ?? ""`로 undefined 방어
- 커스텀 단축키: `onMount`에서 `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, handler)`. 이 DSL로 비트OR 조합을 사용해야 함 (KeyboardEvent가 아님)

실행 버튼과 단축키를 연결하려면 버튼에 고정 id를 부여하고 `document.getElementById(id)?.click()`로 우회하면 state 클로저 참조 문제 없이 최신 handler가 실행됨.

## 교훈
- `"use client"` ≠ "SSR 안 함". Next.js는 여전히 prerender 단계를 거친다. 브라우저 전용 라이브러리는 반드시 dynamic import로 격리할 것.
- 에디터/차트/지도 등 무거운 클라이언트 전용 위젯은 초기 번들 분리 목적으로도 dynamic 가치가 있음.
- Monaco 커스텀 커맨드는 DOM 이벤트 레벨이 아니라 Monaco 내부 커맨드 레지스트리에 등록되므로 외부 버튼과의 상태 동기화는 id 참조 트릭이 가장 단순·안전.

## 관련 파일
- `src/app/sql-editor/page.tsx` — 적용 사례
