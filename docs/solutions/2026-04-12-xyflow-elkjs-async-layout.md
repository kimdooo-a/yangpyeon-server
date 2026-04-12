---
title: xyflow v12 + elkjs 비동기 layered 레이아웃 패턴
date: 2026-04-12
session: 17
tags: [xyflow, react-flow, elkjs, layout, erd, diagram]
category: pattern
confidence: high
---

## 문제
`@xyflow/react`에 ELK의 layered 알고리즘을 붙여 Prisma 스키마 기반 ER 다이어그램(테이블 노드 + FK 엣지)을 렌더하려 할 때:
1. `elk.layout()`은 비동기라 초기 렌더 시 노드 position을 채울 수 없음
2. 노드마다 컬럼 수가 다른데 ELK에 고정 height를 넘기면 엣지/노드가 겹침
3. v12부터 CSS 미import 시 아무것도 보이지 않음 (디버깅 시간 낭비)
4. `ReactFlow` 컨테이너가 높이 0이면 노드가 그려져도 보이지 않음

## 원인
- ELK는 Java → JS 포팅이라 동기 API가 없음 (Promise 기반)
- xyflow v12가 내부 CSS를 패키지에 포함하되 자동 주입하지 않음 — consumer가 `@xyflow/react/dist/style.css` 명시 import 필요
- `ReactFlow`는 절대 위치 기반 렌더라 부모 컨테이너 명시적 높이 필수

## 해결

### 1. 초기 마운트 → 비동기 레이아웃 주입 패턴
```tsx
useEffect(() => {
  let cancelled = false;
  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: nodeHeight(n.columns.length),  // 컬럼 수에 비례
    })),
    edges: edges.map((e, i) => ({ id: `e-${i}`, sources: [e.source], targets: [e.target] })),
  };
  elk.layout(elkGraph).then((laid) => {
    if (cancelled) return;
    setNodes(prev => prev.map(n => ({
      ...n,
      position: {
        x: laid.children?.find(c => c.id === n.id)?.x ?? 0,
        y: laid.children?.find(c => c.id === n.id)?.y ?? 0,
      },
    })));
  });
  return () => { cancelled = true; };
}, [graph]);
```

`cancelled` 플래그로 언마운트/graph 변경 시 레이스 방지.

### 2. 가변 높이 ERD 노드
```ts
const HEADER = 44, ROW = 22, FOOTER = 8;
const nodeHeight = (cols: number) => HEADER + cols * ROW + FOOTER;
```
행당 22px로 통일된 리스트를 ELK에 정확히 보고 → 이웃 노드와 엣지가 겹치지 않는 레이아웃이 나옴.

### 3. 필수 Import & 컨테이너
```tsx
import "@xyflow/react/dist/style.css";
// ...
<div className="h-[640px] overflow-hidden rounded-lg border">
  <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView
             proOptions={{ hideAttribution: true }} minZoom={0.2} maxZoom={1.5}>
    <Background gap={20} size={1} color="#e5e7eb" />
    <Controls position="bottom-right" />
    <MiniMap pannable zoomable position="bottom-left" />
  </ReactFlow>
</div>
```

### 4. ELK 싱글턴 + module-scope 인스턴스화
```ts
import ELK from "elkjs/lib/elk.bundled.js";
const elk = new ELK();
```
컴포넌트 내부에서 `new ELK()`를 리렌더마다 만들면 Worker/WASM 초기화 비용이 반복됨.

## 교훈
- 비동기 레이아웃 라이브러리는 "초기엔 0,0 → Promise 완료 후 setNodes" 패턴으로 통합하는 게 가장 깔끔.
- ERD/다이어그램에서는 **노드 높이를 콘텐츠에 정확히 맞춰 레이아웃 엔진에 보고**해야 엣지 겹침이 사라짐. 고정값 쓰면 "가끔 겹침" 버그가 상시 발생.
- xyflow v12: CSS import와 컨테이너 명시 높이는 두 대표 함정. 최초 구현부터 포함할 것.
- `fitView`는 초기 마운트 시 1회만 동작. 동적으로 노드 추가 시 `useReactFlow().fitView()`를 수동 호출해야 뷰가 맞춰짐.

## 관련 파일
- `src/app/database/schema/SchemaFlow.tsx` — 구현체
- `src/app/database/schema/page.tsx` — 래퍼 페이지
- `src/lib/types/supabase-clone.ts` — `SchemaGraph` 타입(edges.sourceColumn/targetColumn)
