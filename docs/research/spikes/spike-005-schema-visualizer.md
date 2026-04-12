# Spike 005 — Schema Visualizer (DB ERD 그래프)

- 작성일: 2026-04-12
- 담당: 기술 리서치 (Claude)
- 상태: 리서치 완료, 결정 대기
- 관련: `prisma/schema.prisma`, `src/generated/prisma/`, 향후 `/api/v1/schema/introspect`

---

## 1. 목적

Supabase Studio 스타일의 **DB ERD 그래프** 를 현재 프로젝트(Next.js 15 + Prisma + Drizzle 혼용)에 이식한다. 관리자가 대시보드에서 클릭 한 번으로 테이블 구조와 관계를 시각적으로 확인할 수 있게 한다.

대상 테이블:
- Prisma: `User` / `Folder` / `File` (FK: Folder.parentId→Folder.id, Folder.ownerId→User.id, File.folderId→Folder.id, File.ownerId→User.id)
- Drizzle: `auditLogs`, `metricsHistory`, `ipWhitelist` (독립 또는 User 참조)

---

## 2. GitHub 레퍼런스

| 레퍼런스 | URL | 재사용 가능 부분 |
|---|---|---|
| **supabase/supabase (Studio)** | https://github.com/supabase/supabase/tree/master/apps/studio | `apps/studio` 내 schema graph 구현. React Flow 기반. 레이아웃/노드 스타일링 참고. (단 AGPL/Apache 혼용 — 직접 복붙 대신 패턴 학습 용도) |
| **zernonia/supabase-schema** | https://github.com/zernonia/supabase-schema | 단일 페이지 Supabase Schema Visualizer. Vue 기반이지만 **information_schema 쿼리 패턴** 과 노드 배치 로직이 명료 |
| **keonik/prisma-erd-generator** | https://github.com/keonik/prisma-erd-generator | `prisma generate` 시 DMMF → Mermaid ERD 변환. `generate.ts` 의 **DMMF 파싱 로직** 재사용 가능 (model.fields + relation 추출) |
| **azimuttapp/azimutt** | https://github.com/azimuttapp/azimutt | MIT 라이선스. 대규모 스키마 레이아웃/필터 UX 레퍼런스. 단 Elixir+Elm 스택이라 코드 직접 이식 불가, **UX 패턴** 참조 |
| **xyflow/xyflow** | https://github.com/xyflow/xyflow | `@xyflow/react` 본체. `examples/` 에 DB 테이블 노드 샘플 존재 |

> 결론: 코드 직접 복사는 **prisma-erd-generator** 의 DMMF 파서와 **xyflow 공식 examples** 두 곳만. 나머지는 패턴 학습.

---

## 3. 공식 docs

### 3-1. `@xyflow/react` (구 react-flow)
- 홈: https://reactflow.dev/
- 커스텀 노드: https://reactflow.dev/learn/customization/custom-nodes — React 컴포넌트만 만들면 됨. `NodeProps<Node<DataShape>>` 타입 제네릭 제공.
- 커스텀 엣지: https://reactflow.dev/examples/edges/custom-edges — `BaseEdge`, `getStraightPath`, `EdgeProps` 사용.
- API 레퍼런스: https://reactflow.dev/api-reference/react-flow
- TypeScript: https://reactflow.dev/learn/advanced-use/typescript

핵심 API:
- `<ReactFlow nodes={} edges={} nodeTypes={} edgeTypes={} fitView />`
- `Handle` (type="source"|"target", position=Position.Left|Right) — 컬럼별 핸들 부착 가능
- `useNodesState`, `useEdgesState` — 드래그 상태 관리

### 3-2. Prisma Introspection
- `prisma db pull`: 기존 DB → schema.prisma 역생성
- **DMMF (Data Model Meta Format)**: `src/generated/prisma/` 에서 `Prisma.dmmf` 로 접근 가능. `datamodel.models[].fields[]` 에 `relationName`, `relationFromFields`, `relationToFields` 메타 포함 → FK 추론 가능.

### 3-3. PostgreSQL information_schema
- https://www.postgresql.org/docs/current/infoschema-key-column-usage.html
- FK 추출 쿼리 패턴 (3-way join):
  ```sql
  SELECT tc.table_name, kcu.column_name,
         ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY';
  ```
- 컬럼 전체: `information_schema.columns` (data_type, is_nullable, column_default)
- 테이블: `information_schema.tables` (table_schema='public' 필터)

---

## 4. 자체 구현 난이도

| 항목 | 난이도 | 근거 |
|---|---|---|
| DMMF → 노드/엣지 변환 | ★★☆☆☆ (쉬움) | Prisma DMMF는 이미 구조화됨. `model.fields.filter(f => f.relationName)` 로 FK 추출 |
| Drizzle 스키마 파싱 | ★★★☆☆ (중간) | Drizzle은 DMMF가 없음 → `information_schema` 쿼리로 우회 필요 |
| 두 소스 병합(Prisma+Drizzle) | ★★★☆☆ (중간) | 테이블명 기준 merge, 중복 제거. `users` 는 Prisma가 우선 |
| xyflow 노드/엣지 렌더 | ★★☆☆☆ (쉬움) | 공식 examples 패턴 그대로 |
| 자동 레이아웃 | ★★★☆☆ (중간) | **dagre** or **elkjs** 통합 필요. 그래프 6~10노드 수준이면 elkjs 추천 |
| 드래그+저장 | ★★☆☆☆ (쉬움) | `onNodesChange` 이벤트 + localStorage/DB 저장 |
| 테이블 상세 패널 | ★★☆☆☆ (쉬움) | 노드 클릭 → 사이드 Drawer 열기 |

**총평**: 1~2일 풀 스파이크. Prisma DMMF 만 쓰면 반나절. Drizzle 까지 통합하려면 1일.

---

## 5. 권장 아키텍처

```
┌──────────────────────────────────────────┐
│ GET /api/v1/schema/introspect            │
│  1) Prisma.dmmf.datamodel.models 순회    │
│     → { name, fields, relations } 추출   │
│  2) pg.query(information_schema)         │
│     → Drizzle 테이블 + FK 보강           │
│  3) Merge (name 기준, Prisma 우선)       │
│  4) JSON 반환                            │
│     { tables: [...], relations: [...] }  │
└──────────────────────────────────────────┘
                 ↓
┌──────────────────────────────────────────┐
│ /admin/schema (클라이언트 페이지)         │
│  - SWR 로 introspect 호출                │
│  - toReactFlow(tables, relations)        │
│    → { nodes, edges }                    │
│  - elkjs 로 초기 레이아웃 계산           │
│  - <ReactFlow> 렌더                      │
│  - 노드 클릭 → <SchemaDrawer> (컬럼 표시)│
└──────────────────────────────────────────┘
```

### 파일 구조 제안
```
src/
├── app/api/v1/schema/introspect/route.ts   ← GET 핸들러
├── app/(admin)/schema/page.tsx             ← ReactFlow 페이지 ('use client')
├── lib/schema/
│   ├── prisma-dmmf-extractor.ts            ← DMMF → SchemaTable[]
│   ├── pg-information-schema.ts            ← Drizzle 테이블 보강
│   └── to-react-flow.ts                    ← SchemaTable[] → {nodes, edges}
└── components/schema/
    ├── table-node.tsx                      ← 커스텀 노드 (테이블 헤더+컬럼)
    ├── relation-edge.tsx                   ← 커스텀 엣지
    └── schema-drawer.tsx                   ← 상세 패널
```

### 주요 의존성
- `@xyflow/react` (필수)
- `elkjs` 또는 `dagre` (레이아웃)
- 기존 Prisma Client (DMMF 접근)
- `pg` (이미 사용 중, information_schema 쿼리용)

### 런타임 주의
- `/api/v1/schema/introspect` 는 **Node.js runtime** 강제 (`export const runtime = 'nodejs'`) — Prisma Client Edge 미지원
- 페이지는 `'use client'` 필수 (xyflow는 클라이언트 전용)
- 관리자 전용 라우트: ADMIN role 가드 미들웨어 적용

---

## 6. 결정

**GO.** 풀 스파이크(1일)로 진행.

근거:
1. Prisma DMMF가 이미 구조화되어 있어 DB 쿼리 없이도 최소 MVP 가능
2. `@xyflow/react` 는 안정적이고 문서 풍부
3. 관리자 운영 도구로 가치 높음 (신규 개발자 온보딩 + 스키마 드리프트 감지)
4. 재사용 가능 — 향후 다른 프로젝트에도 이식 가능

**라이선스**: supabase/supabase 코드는 **직접 복사 금지** (AGPL 영향 범위 불확실). 패턴 학습만 허용.

---

## 7. 다음 TODO

1. [ ] 의존성 설치: `npm i @xyflow/react elkjs`
2. [ ] `lib/schema/prisma-dmmf-extractor.ts` 작성 + 단위 테스트
3. [ ] `/api/v1/schema/introspect` 라우트 핸들러 (Prisma 3개 모델만 우선)
4. [ ] `(admin)/schema/page.tsx` 스켈레톤 + ReactFlow 기본 렌더
5. [ ] `table-node.tsx` 커스텀 노드 (헤더 + 컬럼 리스트 + 핸들)
6. [ ] elkjs 자동 레이아웃 통합
7. [ ] Drizzle 테이블 보강 (information_schema join)
8. [ ] 노드 위치 저장 (localStorage → 추후 DB)
9. [ ] ADMIN 가드 확인

---

## 참고 링크 (전부 실존 확인 완료)

- React Flow: https://reactflow.dev/
- xyflow GitHub: https://github.com/xyflow/xyflow
- prisma-erd-generator: https://github.com/keonik/prisma-erd-generator
- Azimutt: https://github.com/azimuttapp/azimutt
- Supabase Studio: https://github.com/supabase/supabase/tree/master/apps/studio
- zernonia/supabase-schema: https://github.com/zernonia/supabase-schema
- PG key_column_usage: https://www.postgresql.org/docs/current/infoschema-key-column-usage.html
