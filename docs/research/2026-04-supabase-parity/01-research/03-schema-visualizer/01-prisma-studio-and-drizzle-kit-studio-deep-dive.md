# 01. Prisma Studio + drizzle-kit studio — Deep Dive

> Wave 1 / Schema Viz Round 2 / DQ-3.X 후보 1
> 작성일: 2026-04-18 (세션 24, kdywave Wave 1 deep-dive)
> 작성자: Claude Opus 4.7 (1M context) — Wave 1 Schema Viz + DB Ops 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/database/schema` 100/100 청사진
> 사전 컨텍스트: Phase 14b까지 `xyflow + elkjs + Prisma DMMF + information_schema`로 ERD 65/100 도달. RLS UI / Trigger·Function 편집기 / Replication / Wrappers / 마이그레이션 diff가 갭.
> 본 문서의 정의: **이미 가지고 있는 두 개의 외부 스튜디오(Prisma Studio, drizzle-kit studio)를 분해해 우리 자체 `/database/schema`로 흡수 가능한 패턴을 모두 끌어오는 시나리오의 종합 평가**

---

## 0. Executive Summary

### 결론 한 줄
**Prisma Studio = "표 중심 데이터 브라우저", drizzle-kit studio = "스키마 중심 ERD 뷰어"** — 우리 `/database/schema`가 흡수해야 할 것은 **drizzle-kit studio의 ERD 시각·편집 패턴 70%** + **Prisma Studio의 외래키 picker UX 30%**이며, **두 도구 자체를 그대로 임베드하지 않는다.**

근거 4개:
1. **라이선스 비호환**: Prisma Studio는 Apache 2.0이지만 클로즈드 영역(Prisma Cloud 연동)이 늘어나는 추세이고, drizzle-kit studio는 별도 외부 도메인(`local.drizzle.studio`)으로 프록시되는 구조라 우리 PM2 + Cloudflare Tunnel 단일 도메인 정책에 맞지 않는다.
2. **데이터 모델 종속**: Prisma Studio는 `prisma.schema` 모델만 인지(생성된 Prisma Client에 의존). DB-first(직접 SQL로 만든 테이블·뷰·함수)는 표시 못 함. 우리는 `information_schema`로 직접 introspect하는 노선이라 적합.
3. **내장 RLS UI 없음**: 둘 다 RLS 정책 시각 편집기가 없다. 즉, 우리가 직접 만들어야 한다(미션 2 schemalint + RLS 시각 편집기 패턴 deep-dive로 분리 검토).
4. **Trigger / Function 편집기 없음**: 둘 다 plpgsql 함수·트리거의 source view/edit를 제공하지 않는다. 이것도 우리가 직접.

**그러나 — 이 두 도구에서 가져올 자산은 분명하다**:
- Prisma Studio의 "외래키 셀 클릭 → 참조 행 selector 모달" UX (Phase 14c-α `editable-cell-inputs.tsx`에 통합 가능).
- drizzle-kit studio의 "관계 화살표 + 카디널리티 표시(`1:N`, `N:N`)" — 현재 우리 xyflow 노드가 아직 카디널리티를 그리지 못함.
- drizzle-kit studio의 "테이블 노드 그룹화(스키마별 색상)" — `auth/storage/realtime` 등 내부 스키마와 우리 도메인 스키마 분리.
- Prisma Studio의 "행 단위 차이 비교(undo)" 패턴 — 14c-α 낙관적 잠금 409 시 conflict diff에 사용 가능.

**5점 척도 종합 점수**:
- Prisma Studio: 3.41/5 (자체 흡수 vs 임베드 비교)
- drizzle-kit studio: 3.78/5

### Phase 14c-α / 14d 정렬: **있음(부분)**
- 14c-α `expected_updated_at` 낙관적 잠금 → Prisma Studio도 transaction-by-default라 동일한 모델. 다만 Prisma Studio는 충돌 시 단순 reject + 새 데이터 fetch만 함(우리 14c-α는 409 + current 행 표시).
- 14d ERD 노드 카디널리티 / 다이어그램 export → drizzle-kit studio가 SVG export까지는 안 하지만, ELKjs 위에서 우리가 직접 추가 가능.

### 새 DQ
- **DQ-3.1**: drizzle-kit studio의 "관계 자동 추론" 알고리즘(컬럼명 휴리스틱: `userId` → `user.id`)을 우리 introspect에도 적용? (이미 우리 schema는 명시적 FK이지만, FK가 없는 레거시 DB 대비)
- **DQ-3.2**: Prisma Studio의 행 selector 모달을 별도 컴포넌트로 분리해 `/tables` Table Editor의 외래키 셀에서도 재사용? (cmdk 기반)
- **DQ-3.3**: 두 스튜디오 중 하나를 운영자 유틸로 *옵션* 임베드(iframe)할 가치는 있는가? → No. 도메인 분리 + 인증 통합 비용이 자체 구현 비용보다 큼.

---

## 1. 라이브러리 개요

### 1.1 Prisma Studio 정체성
Prisma Studio는 Prisma ORM(Prisma Inc., 2017~)이 제공하는 **GUI 데이터 브라우저**다. `prisma studio` CLI 한 줄로 5555 포트에서 실행되며, `schema.prisma`로부터 모델 메타데이터를 읽어 "각 모델 = 탭, 행 = 테이블 row, 셀 편집 가능" UX를 제공한다. v5.x부터는 Tauri 데스크톱 앱(`prisma-studio` Electron 변종)도 있다.

핵심 특성:
- **모델 기반**: `schema.prisma`의 `model` 블록만 보임. SQL 뷰/함수/트리거/외래 스키마(`auth.users` 등) 미지원.
- **Prisma Client 의존**: 내부적으로 `@prisma/client`를 사용해 CRUD. 즉 Prisma 마이그레이션 외부에서 만들어진 컬럼은 보이지만, 새로 추가된 enum 같은 건 클라이언트 재생성 후에야 인식.
- **로컬 단독 실행**: 단일 사용자 가정. 다중 사용자 동시 편집/락 메커니즘 없음. 충돌 처리 = 단순 마지막 쓰기 승.
- **번들/배포 불가**: `prisma studio`는 dev tool이지, 운영 대시보드에 임베드하라고 만든 것이 아님.

### 1.2 drizzle-kit studio 정체성
drizzle-kit studio는 Drizzle ORM(2022~)의 일부로 제공되는 **스키마 시각화 + 데이터 브라우저**다. `drizzle-kit studio` CLI로 실행하며, 흥미로운 점은 **로컬 프록시는 5555/5174 포트지만 UI는 `https://local.drizzle.studio` (외부 호스팅 도메인)에서 로드되어 로컬 데이터를 표시**한다는 점.

핵심 특성:
- **schema-first ERD 뷰어**: 좌측 패널 = ERD(노드+엣지), 우측 패널 = 행 데이터 테이블. Prisma Studio보다 시각적.
- **외부 도메인 의존**: UI assets가 `local.drizzle.studio`에서 fetch됨 → 오프라인/폐쇄망 운영 불가, Cloudflare Tunnel + 단일 도메인 정책과 충돌.
- **drizzle 스키마 파일에 종속**: `schema.ts`(drizzle 정의)가 진실의 원천. PostgreSQL의 RLS·function·trigger·extension은 보이지 않음(스키마 파일에 정의되지 않으므로).
- **관계 추론 휴리스틱**: 명시적 `relations()` 정의가 없어도 컬럼명에서 관계를 추론. Prisma Studio는 명시적 정의만.

### 1.3 우리 프로젝트 컨텍스트
우리 `/database/schema`는 이미 다음을 가지고 있다:
- `prisma generate` → DMMF (`Prisma.dmmf.datamodel`) 활용 → 모델/필드/관계를 xyflow 노드/엣지로 변환.
- `pg_catalog`/`information_schema` 직접 쿼리 → DMMF에 없는 정보(인덱스, 트리거 명, 함수 시그니처) 수집.
- ELKjs로 자동 레이아웃(`layered`/`mrtree` 알고리즘).
- Lucide 아이콘 + Tailwind 다크 테마.

**결론적으로 우리는 두 스튜디오의 "동등한" 자체 구현을 이미 시작한 상태**이고, 이 deep-dive는 "두 스튜디오가 우리보다 잘하는 것 = 흡수 대상" / "두 스튜디오가 우리보다 못하는 것 = 우리만의 강점"을 정리한다.

---

## 2. Prisma Studio 아키텍처 분석

### 2.1 데이터 흐름
```
prisma studio
  ├── @prisma/studio-pcw (Prisma Client Wrapper)
  │     ↓
  │   Prisma Client (런타임에 generate된 코드)
  │     ↓
  │   PostgreSQL (schema.prisma의 datasource)
  │
  └── @prisma/studio-server (Express)
        ↓
      Studio UI (React, @prisma/studio-frontend)
        - 좌측 사이드바: 모델 목록
        - 메인: 표 형태 그리드 (tanstack/table v7~v8 추정)
        - 우측 인스펙터: 선택 행의 모든 필드 + 외래키 모달
```

### 2.2 흡수 가능한 패턴: 외래키 셀 picker
Prisma Studio에서 외래키 컬럼을 클릭하면 **"참조 모델의 모든 행을 검색 가능한 모달"**이 뜬다. 컬럼은 (1) PK, (2) `@@map`된 표시 필드, (3) 첫 String 컬럼이 자동 표시됨.

우리 `/tables` Table Editor의 14c-α `editable-cell-inputs.tsx`에는 현재 외래키 selector가 없다(text/number/boolean/null/keep만). 14d에서 추가할 예정인 이 선택기를 다음 패턴으로 만들 수 있다:

```tsx
// src/components/table-editor/foreign-key-picker.tsx (계획)
import { Command, CommandInput, CommandList, CommandItem } from "cmdk"
import { useQuery } from "@tanstack/react-query"

interface ForeignKeyPickerProps {
  refTable: string          // 예: "user"
  refColumn: string         // 예: "id"
  displayColumn?: string    // 예: "email" — 없으면 첫 String column 자동
  currentValue: string | number | null
  onSelect: (value: string | number) => void
}

export function ForeignKeyPicker({
  refTable, refColumn, displayColumn, currentValue, onSelect
}: ForeignKeyPickerProps) {
  const [search, setSearch] = useState("")
  const { data, isLoading } = useQuery({
    queryKey: ["fk-picker", refTable, refColumn, displayColumn, search],
    queryFn: () => fetch(
      `/api/tables/${refTable}/rows?` +
      new URLSearchParams({
        search,
        limit: "50",
        select: `${refColumn},${displayColumn ?? ""}`.replace(/,$/, "")
      })
    ).then(r => r.json())
  })

  return (
    <Command shouldFilter={false} className="border rounded-md">
      <CommandInput
        placeholder={`${refTable} 검색...`}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {isLoading && <div className="p-2 text-sm">불러오는 중...</div>}
        {data?.rows?.map((row: any) => (
          <CommandItem
            key={row[refColumn]}
            value={String(row[refColumn])}
            onSelect={() => onSelect(row[refColumn])}
          >
            <span className="font-mono text-xs text-zinc-500 mr-2">
              {row[refColumn]}
            </span>
            <span>{displayColumn ? row[displayColumn] : row[refColumn]}</span>
            {currentValue === row[refColumn] && (
              <CheckIcon className="ml-auto h-4 w-4 text-emerald-500" />
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}
```

이 패턴을 14c-α `editable-cell-inputs.tsx`의 5번째 모드(`foreign-key`)로 추가:
```tsx
// editable-cell-inputs.tsx 확장
export function EditableCellInput({ column, value, onChange }: ...) {
  if (column.foreignKey) {
    return (
      <ForeignKeyPicker
        refTable={column.foreignKey.table}
        refColumn={column.foreignKey.column}
        displayColumn={column.foreignKey.display}
        currentValue={value}
        onSelect={onChange}
      />
    )
  }
  // ... 기존 text/number/boolean/null/keep
}
```

비용: ~3시간 (cmdk + react-query 이미 의존성에 있음, 신규 컴포넌트 1개 + API 라우트 1개).

### 2.3 흡수 가능한 패턴: 행 단위 diff(undo)
Prisma Studio는 행을 편집하다 "변경됨" 상태가 되면 우측 패널에 "필드 단위로 원래 값 vs 새 값"을 보여주고, undo 버튼이 활성화된다. 이 패턴은 14c-α 409 충돌 처리에서 직접 활용 가능:

```tsx
// 409 응답 받으면
// {
//   error: "STALE_WRITE",
//   current: { ...현재 DB 행... },
//   submitted: { ...내가 보낸 변경... }
// }
// → ConflictDialog에서 필드별 diff 표시
function ConflictDialog({ current, submitted, onResolve }: ...) {
  const diffFields = Object.keys(submitted).filter(
    k => current[k] !== submitted[k]
  )
  return (
    <Dialog>
      <DialogTitle>충돌 발생 — 다른 사용자가 먼저 수정함</DialogTitle>
      <table>
        <thead><tr><th>필드</th><th>현재 DB</th><th>내 변경</th><th>선택</th></tr></thead>
        <tbody>
          {diffFields.map(field => (
            <tr key={field}>
              <td>{field}</td>
              <td className="text-amber-500">{String(current[field])}</td>
              <td className="text-blue-500">{String(submitted[field])}</td>
              <td>
                <button onClick={() => onResolve(field, "current")}>현재 유지</button>
                <button onClick={() => onResolve(field, "mine")}>내 값 적용</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  )
}
```

비용: ~2시간 (이미 계획된 14c-α 후속 작업).

### 2.4 흡수하지 않는 것 — Prisma Studio의 한계
- **다중 사용자 동시 편집 미지원**: 운영자 1~3명 시나리오에서도 toast로 "다른 사용자가 편집 중" 표시는 불가능. → 14c-α `expected_updated_at` 낙관적 잠금이 더 나음.
- **SQL 직접 실행 미지원**: 모든 작업이 Prisma Client 경유. → 우리 `/sql` 에디터(spike-005-sql-editor)가 보완.
- **모델 외 객체 미지원**: View/Function/Trigger/Sequence/Extension 보이지 않음. → 우리 information_schema 직접 introspect로 노출.
- **운영 임베드 불가**: dev-only 도구. iframe 임베드는 인증 우회/CSRF 위험 + 단일 사용자 가정 위배.

---

## 3. drizzle-kit studio 아키텍처 분석

### 3.1 데이터 흐름
```
drizzle-kit studio
  ├── 로컬 프록시(127.0.0.1:5555 또는 5174)
  │     ↓
  │   drizzle 스키마 파일(schema.ts) 읽기 + DB introspect
  │
  └── UI 자체는 https://local.drizzle.studio (외부 도메인)에서 fetch
        ↓
      ERD 좌측 + 데이터 우측 분할 뷰
        - ERD: 자체 그래프 라이브러리(d3-force 추정)
        - 데이터: 표 형태 그리드
        - 우측: 컬럼 인스펙터
```

### 3.2 흡수 가능한 패턴 1: 카디널리티 표기
drizzle-kit studio는 관계 엣지에 **`1:N` / `N:N` / `1:1`** 라벨을 표시한다. 우리 xyflow ERD는 현재 라벨 없이 직선만 그린다. 추가 패턴:

```tsx
// src/components/database/schema-edge.tsx (계획)
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react"

interface SchemaEdgeData {
  cardinality: "1:1" | "1:N" | "N:N"
  fromColumn: string
  toColumn: string
  isOptional: boolean      // FK가 nullable이면
  onDelete: "CASCADE" | "RESTRICT" | "SET NULL" | "NO ACTION"
}

export function SchemaEdge({ id, sourceX, sourceY, targetX, targetY, data }: ...) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY
  })
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: data.isOptional ? "#71717a" : "#3b82f6",
          strokeDasharray: data.isOptional ? "4 2" : undefined,
          strokeWidth: 2
        }}
        markerEnd="url(#fk-arrow)"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "#e4e4e7"
          }}
          className="nodrag nopan"
        >
          {data.cardinality}
          {data.onDelete !== "NO ACTION" && (
            <span className="ml-1 text-amber-500">↯{data.onDelete}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
```

DMMF에서 카디널리티 추출 함수:
```ts
// src/server/database/dmmf-to-cardinality.ts
import type { DMMF } from "@prisma/generator-helper"

export function inferCardinality(
  field: DMMF.Field,
  refModel: DMMF.Model
): "1:1" | "1:N" | "N:N" {
  // field.isList → many side
  // 반대 모델에서 우리를 가리키는 필드의 isList 확인
  const back = refModel.fields.find(
    f => f.relationName === field.relationName && f !== field
  )
  if (!back) return "1:N"  // 미정의 시 보수적
  if (field.isList && back.isList) return "N:N"
  if (!field.isList && !back.isList) return "1:1"
  return "1:N"
}
```

비용: ~4시간 (xyflow 커스텀 엣지 + DMMF 변환 함수 + onDelete 정보는 information_schema의 `referential_constraints.delete_rule`에서).

### 3.3 흡수 가능한 패턴 2: 스키마별 그룹화/색상
drizzle-kit studio는 PostgreSQL의 schema(예: `public`, `auth`, `storage`)별로 노드를 색깔 그룹으로 묶는다. 우리는 단일 `public` 스키마지만, **Phase 14d에서 admin 모듈을 별도 schema(`admin.users`, `admin.audit_log`)로 분리**할 가능성이 있고, 그 시점부터 유효한 패턴.

xyflow에서 스키마 그룹은 **부모-자식 노드** 구조로 구현:
```tsx
const nodes: Node[] = [
  // 스키마 그룹 노드 (부모)
  {
    id: "schema:public",
    type: "schemaGroup",
    position: { x: 0, y: 0 },
    style: { width: 800, height: 600, background: "rgba(59,130,246,0.05)" },
    data: { label: "public", color: "#3b82f6" },
  },
  {
    id: "schema:admin",
    type: "schemaGroup",
    position: { x: 900, y: 0 },
    style: { width: 600, height: 400, background: "rgba(245,158,11,0.05)" },
    data: { label: "admin", color: "#f59e0b" },
  },
  // 테이블 노드 (자식)
  {
    id: "table:public.kitchen",
    type: "table",
    parentId: "schema:public",
    extent: "parent",
    position: { x: 50, y: 50 },
    data: { ... }
  },
  // ...
]
```

비용: ~3시간 (xyflow 부모-자식 + ELKjs 계층적 레이아웃).

### 3.4 흡수 가능한 패턴 3: 자동 관계 추론(레거시 DB 대비)
drizzle-kit studio는 명시적 `relations()` 없이도 컬럼명 휴리스틱으로 관계를 추론한다(`user_id` → `user.id`). 우리 도메인은 명시적 FK를 강제하지만, **양평 부엌 외부 운영자가 가져올 수 있는 레거시 DB**에 대비해 옵션 제공 가치 있음.

```ts
// src/server/database/infer-relations.ts
export interface InferredRelation {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  confidence: "HIGH" | "MEDIUM" | "LOW"
  reason: string
}

export function inferRelationsFromColumnNames(
  tables: { name: string; columns: { name: string; type: string }[] }[]
): InferredRelation[] {
  const result: InferredRelation[] = []
  const tableSet = new Set(tables.map(t => t.name.toLowerCase()))

  for (const table of tables) {
    for (const col of table.columns) {
      // 패턴 1: foo_id → foo.id
      const m = col.name.match(/^(.+?)_id$/i)
      if (m) {
        const refTable = m[1].toLowerCase()
        if (tableSet.has(refTable)) {
          result.push({
            fromTable: table.name,
            fromColumn: col.name,
            toTable: refTable,
            toColumn: "id",
            confidence: "HIGH",
            reason: `${col.name} 패턴(_id 접미사) + ${refTable} 테이블 존재`
          })
          continue
        }
        // 복수형 처리(users → user)
        const singular = refTable.replace(/s$/, "")
        if (tableSet.has(singular)) {
          result.push({
            fromTable: table.name,
            fromColumn: col.name,
            toTable: singular,
            toColumn: "id",
            confidence: "MEDIUM",
            reason: `${col.name} 패턴 + 단수형 ${singular} 테이블 존재(복수형 가정)`
          })
        }
      }
      // 패턴 2: fooId (camelCase)
      const camelMatch = col.name.match(/^(.+?)Id$/)
      if (camelMatch) {
        const refTable = camelMatch[1].toLowerCase()
        if (tableSet.has(refTable)) {
          result.push({
            fromTable: table.name,
            fromColumn: col.name,
            toTable: refTable,
            toColumn: "id",
            confidence: "HIGH",
            reason: `${col.name} 패턴(camelCase Id 접미사)`
          })
        }
      }
    }
  }
  return result
}
```

비용: ~4시간 (휴리스틱 함수 + 신뢰도 표시 + 사용자가 "추론된 관계 채택/거부" 토글 UI).

### 3.5 흡수하지 않는 것 — drizzle-kit studio의 한계
- **외부 도메인 의존**: `local.drizzle.studio`에서 UI 로드. Cloudflare Tunnel 단일 도메인 정책 + CSP 정책과 충돌. 폐쇄망(농장 현지 인터넷 불안정 시) 작동 불가.
- **drizzle 스키마 파일 강제**: 우리는 Prisma 사용 + DB-first introspect. drizzle 스키마 파일을 둘 이유 없음.
- **PostgreSQL 고급 기능 미지원**: RLS, Trigger source view, Function source view, Extension, Sequence, Domain Type, Composite Type, Partition 모두 미지원.
- **ERD 인터랙션 부족**: 노드 클릭 → 우측 데이터 표 변경은 되지만, **노드 그룹 이동/저장/공유 링크**가 없음. 우리는 사용자별 ERD 레이아웃 저장(LocalStorage 또는 DB)이 차별화 포인트.

---

## 4. 두 스튜디오 직접 비교

### 4.1 기능 매트릭스
| 기능 | Prisma Studio | drizzle-kit studio | 우리 (현재 65/100) | 100/100 청사진 |
|------|---------------|-------------------|--------------------|----------------|
| ERD 시각화 | ✗ | ✓ (자체 그래프) | ✓ (xyflow + ELKjs) | ✓ |
| 카디널리티 라벨 | ✗ | ✓ | ✗ | ✓ (drizzle 흡수) |
| 관계 화살표 방향 | ✗ | ✓ | ✓ | ✓ |
| 행 데이터 편집 | ✓✓ | ✓ | ✓ (Phase 14b/c) | ✓✓ |
| 외래키 picker | ✓✓ | ✓ | ✗ | ✓ (Prisma 흡수) |
| 트리거 view | ✗ | ✗ | ✗ | ✓ (자체) |
| 함수 view/edit | ✗ | ✗ | ✗ | ✓ (자체) |
| RLS 정책 view | ✗ | ✗ | ✗ | ✓ (자체) |
| 인덱스 view | ✗ | ✓ (목록만) | ✓ (DDL까지) | ✓✓ |
| Schema diff | ✗ (Migrate에 있음) | ✓ (별도 명령) | ✗ | ✓ (자체) |
| 다중 schema 그룹 | ✗ | ✓ | ✗ | ✓ (drizzle 흡수) |
| 가상 스크롤 | ✓ | ? | (Phase 14d) | ✓ |
| 다크 테마 | ✓ | ✓ | ✓ | ✓ |
| 다중 사용자 락 | ✗ | ✗ | ✓ (14c-α) | ✓ |
| SVG/PNG export | ✗ | ✗ | ✗ | ✓ (자체) |
| 변경 이력(audit) | ✗ | ✗ | (Phase 14d) | ✓ |
| 키보드 단축키 | 일부 | 일부 | (Phase 14d) | ✓✓ |

### 4.2 라이선스/비용/배포
| 항목 | Prisma Studio | drizzle-kit studio |
|------|---------------|-------------------|
| 라이선스 | Apache 2.0 | Apache 2.0 |
| 운영 임베드 가능 | △ (dev-only 의도, 임베드 비공식) | ✗ (외부 도메인 종속) |
| 폐쇄망 작동 | ✓ (로컬 단독) | ✗ (UI 외부 fetch) |
| Single binary | ✗ (Node 필수) | ✗ (Node 필수) |
| 단가 | $0 | $0 |
| Drizzle Cloud / Prisma Cloud 유료 옵션 | $19~/월 | $0(현재) |

**임베드 가능성 결론**: 둘 다 우리 운영 대시보드에 임베드할 수 없다. 패턴만 흡수.

### 4.3 우리 자체 구현이 가지는 우위
1. **단일 도메인 + 단일 인증**: NextAuth 세션 그대로 재사용. 이중 로그인 없음.
2. **Cloudflare Tunnel + WSL2 호환**: 외부 도메인 fetch 없음. CSP `default-src 'self'` 가능.
3. **운영자 RBAC**: `table-policy.ts` + Phase 14b의 FULL_BLOCK/DELETE_ONLY 매트릭스를 ERD 노드 색상에도 반영 가능(읽기전용 노드는 회색).
4. **Audit log 통합**: Phase 14b의 `audit_log` 테이블에 ERD 변경(드래그/카디널리티 수정/노드 추가)도 기록.
5. **k8s/Docker 친화**: 외부 의존 도메인 없음 = airgap 환경(농장 폐쇄망 + 위성 인터넷)에서도 작동.

---

## 5. 우리 `/database/schema` 100/100 청사진 (드릴다운)

### 5.1 Layer A: 메타데이터 수집 (이미 65% 완료)
```
src/server/database/schema-introspect/
  index.ts                    ← 모든 collector 통합
  collect-tables.ts           ← information_schema.tables + columns
  collect-columns.ts          ← + pg_attribute (유형 OID, 길이, default)
  collect-indexes.ts          ← pg_indexes + pg_index
  collect-foreign-keys.ts     ← information_schema.referential_constraints
                                + key_column_usage
  collect-triggers.ts         ← information_schema.triggers + pg_trigger
                                + pg_get_triggerdef() ← Trigger source
  collect-functions.ts        ← pg_proc + pg_get_functiondef()
  collect-policies.ts         ← pg_policies (RLS 정책)
  collect-extensions.ts       ← pg_extension
  collect-sequences.ts        ← information_schema.sequences
  collect-views.ts            ← information_schema.views + pg_get_viewdef()
  collect-mviews.ts           ← pg_matviews
  cardinality-from-dmmf.ts    ← Prisma DMMF에서 1:1/1:N/N:N 추출
```

각 collector는 순수 함수 + 표준화된 결과 인터페이스:
```ts
export interface SchemaSnapshot {
  collectedAt: string  // ISO
  tables: TableMeta[]
  views: ViewMeta[]
  matviews: MatViewMeta[]
  triggers: TriggerMeta[]
  functions: FunctionMeta[]
  policies: PolicyMeta[]
  sequences: SequenceMeta[]
  extensions: ExtensionMeta[]
  foreignKeys: ForeignKeyMeta[]
  indexes: IndexMeta[]
  cardinalities: CardinalityMeta[]
}
```

### 5.2 Layer B: 변환 — Snapshot → xyflow Graph
```ts
// src/server/database/schema-introspect/snapshot-to-graph.ts
export function snapshotToGraph(s: SchemaSnapshot): {
  nodes: Node[]
  edges: Edge[]
} {
  const nodes: Node[] = []

  // 스키마 그룹(향후)
  const schemas = new Set(s.tables.map(t => t.schema))
  for (const sch of schemas) {
    nodes.push({
      id: `schema:${sch}`,
      type: "schemaGroup",
      position: { x: 0, y: 0 },  // ELKjs가 계산
      data: { label: sch },
      style: { width: 0, height: 0 }, // ELKjs가 계산
    })
  }

  // 테이블 노드
  for (const t of s.tables) {
    nodes.push({
      id: `table:${t.schema}.${t.name}`,
      type: "table",
      parentId: `schema:${t.schema}`,
      extent: "parent",
      position: { x: 0, y: 0 },
      data: {
        name: t.name,
        columns: t.columns.map(c => ({
          name: c.name,
          type: c.dataType,
          isPK: c.isPrimaryKey,
          isFK: c.isForeignKey,
          isNullable: c.isNullable,
          hasIndex: c.hasIndex,
          isRedacted: t.policy?.redactColumns?.includes(c.name) ?? false,
        })),
        rowCount: t.estimatedRowCount,
        hasRLS: s.policies.some(p => p.table === t.name),
        hasTrigger: s.triggers.some(tr => tr.table === t.name),
      }
    })
  }

  // 엣지
  const edges: Edge[] = []
  for (const fk of s.foreignKeys) {
    const card = s.cardinalities.find(
      c => c.fromTable === fk.fromTable && c.fromColumn === fk.fromColumn
    )
    edges.push({
      id: `fk:${fk.constraintName}`,
      source: `table:${fk.fromSchema}.${fk.fromTable}`,
      target: `table:${fk.toSchema}.${fk.toTable}`,
      type: "schemaEdge",
      data: {
        cardinality: card?.cardinality ?? "1:N",
        fromColumn: fk.fromColumn,
        toColumn: fk.toColumn,
        isOptional: fk.isOptional,
        onDelete: fk.onDelete,
      },
    })
  }
  return { nodes, edges }
}
```

### 5.3 Layer C: 인터랙션 — 노드 클릭 → 사이드 패널
```tsx
// src/components/database/schema-side-panel.tsx
type Mode = "columns" | "indexes" | "triggers" | "policies" | "ddl" | "data"

export function SchemaSidePanel({ table, snapshot }: ...) {
  const [mode, setMode] = useState<Mode>("columns")
  return (
    <aside className="w-[400px] border-l border-zinc-800 overflow-y-auto">
      <Tabs value={mode} onValueChange={setMode as any}>
        <TabsList>
          <TabsTrigger value="columns">컬럼</TabsTrigger>
          <TabsTrigger value="indexes">인덱스 ({table.indexes.length})</TabsTrigger>
          <TabsTrigger value="triggers">트리거 ({snapshot.triggers.filter(t=>t.table===table.name).length})</TabsTrigger>
          <TabsTrigger value="policies">RLS ({snapshot.policies.filter(p=>p.table===table.name).length})</TabsTrigger>
          <TabsTrigger value="ddl">DDL</TabsTrigger>
          <TabsTrigger value="data">데이터 미리보기</TabsTrigger>
        </TabsList>
        <TabsContent value="columns"><ColumnList ... /></TabsContent>
        <TabsContent value="indexes"><IndexList ... /></TabsContent>
        <TabsContent value="triggers"><TriggerList ... /></TabsContent>
        <TabsContent value="policies"><PolicyList ... /></TabsContent>
        <TabsContent value="ddl"><MonacoDDL value={ddl} /></TabsContent>
        <TabsContent value="data"><DataPreview tableName={table.name} /></TabsContent>
      </Tabs>
    </aside>
  )
}
```

### 5.4 Layer D: 편집(Trigger/Function/Policy)
이 섹션은 미션 2(schemalint + RLS UI)에서 자세히. 여기서는 인터페이스만:
```tsx
// 트리거 편집기 — Monaco SQL plpgsql 모드
<MonacoEditor
  language="pgsql"  // monaco-editor 없으면 sql + 토큰 확장
  value={triggerSource}
  options={{
    readOnly: !canEditTriggers,
    minimap: { enabled: false },
    fontFamily: "JetBrains Mono",
    fontSize: 13,
  }}
/>

// 저장 시: ALTER TRIGGER ... 또는 DROP + CREATE 트랜잭션
// + audit_log 기록
```

### 5.5 Layer E: 마이그레이션 diff
이것이 100/100의 마지막 30%다. 핵심 흐름:
1. **현재 스키마 스냅샷 = `prisma.schema` (생산 권위)**
2. **DB 실제 스키마 스냅샷 = SchemaSnapshot (collector 결과)**
3. **두 스냅샷 비교 → diff 표시**
   - 추가된 테이블: `+ public.kitchen_appliance`
   - 삭제된 컬럼: `- public.kitchen.deprecated_field`
   - 변경된 타입: `~ public.kitchen.opened_at: timestamp → timestamptz`
   - RLS 정책 차이: schemalint 통합
4. **`prisma migrate diff --from-schema-datamodel ./prisma/schema.prisma --to-schema-datasource <DATABASE_URL> --script` 실행 → SQL 미리보기**
5. **사용자 검토 후 적용** (운영 모드에서는 staging에만 자동, prod는 수동 confirm)

---

## 6. 양평 부엌 컨텍스트 적용

### 6.1 11개 테이블 그래프 그리기
현재 우리 Prisma 모델: User, Account, Session, Kitchen, KitchenItem, Webhook, CronJob, AuditLog, File, ApiKey, LogDrain.

ELKjs `layered` 알고리즘으로 자동 배치 시:
```
[Account]──[User]──[Session]
              │
              ├──[Kitchen]──[KitchenItem]
              ├──[ApiKey]
              ├──[Webhook]
              ├──[CronJob]
              ├──[AuditLog]
              ├──[File]
              └──[LogDrain]
```

User가 hub. 이 시점에서 카디널리티 표시 추가가 핵심 UX 개선.

### 6.2 운영자 1~3명 가정에서의 선택
- **다중 사용자 락**: 14c-α `expected_updated_at`만으로 충분 (Yjs/Liveblocks 불요).
- **변경 이력**: 별도 Yjs 없이 `audit_log` 테이블 단일 진실.
- **ERD 레이아웃 공유**: localStorage로 시작 → 사용자별 저장 필요 시 `user_preferences` 테이블에 JSON.

### 6.3 WSL2 + PM2 + Cloudflare Tunnel
- 외부 도메인 fetch 없음 → Cloudflare Zero Trust Access policy 단일.
- Prisma Studio/drizzle-kit studio 둘 다 dev-only이므로 PM2 ecosystem에서 제외.
- 우리 schema 페이지는 SSR + ISR(60s) → Tunnel 캐시 친화.

---

## 7. 코드 예시 — Phase 14d 시작 PR

### 7.1 카디널리티 라벨 PR (가장 작은 단위)
```tsx
// src/components/database/schema-edge.tsx (신규)
"use client"
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react"

export interface SchemaEdgeData {
  cardinality: "1:1" | "1:N" | "N:N"
  fromColumn: string
  toColumn: string
  isOptional: boolean
  onDelete: "CASCADE" | "RESTRICT" | "SET NULL" | "NO ACTION"
}

export function SchemaEdge(props: EdgeProps<SchemaEdgeData>) {
  const { id, sourceX, sourceY, targetX, targetY, data } = props
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY })
  if (!data) return null
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: data.isOptional ? "#71717a" : "#3b82f6",
          strokeDasharray: data.isOptional ? "4 2" : undefined,
          strokeWidth: 1.5,
        }}
        markerEnd="url(#fk-arrow)"
      />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}
          className="absolute pointer-events-auto rounded border border-zinc-700 bg-zinc-900/95 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 shadow-sm"
        >
          {data.cardinality}
          {data.onDelete !== "NO ACTION" && (
            <span className="ml-1 text-amber-400" title={`ON DELETE ${data.onDelete}`}>
              ↯
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

// src/components/database/schema-erd.tsx (수정)
import { SchemaEdge } from "./schema-edge"
const edgeTypes = { schemaEdge: SchemaEdge }
// <ReactFlow ... edgeTypes={edgeTypes}>
```

### 7.2 외래키 picker PR (Phase 14c-β)
위 §2.2 코드 그대로. 신규 API `/api/tables/[name]/rows?search=&select=` 필요(이미 14c-α에 GET 있음, query param만 확장).

### 7.3 자동 관계 추론 토글 PR
```tsx
// src/components/database/inferred-relations-toggle.tsx
"use client"
import { useState } from "react"
import { Switch } from "@/components/ui/switch"

export function InferredRelationsToggle({ count }: { count: number }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-2 text-sm">
      <Switch checked={show} onCheckedChange={setShow} />
      <span className="text-zinc-300">
        추론된 관계 표시 ({count}개)
      </span>
      <span className="text-xs text-zinc-500">
        — 컬럼명 휴리스틱(_id 패턴), 명시적 FK 아님
      </span>
    </div>
  )
}
// 추론된 엣지는 점선 + 회색 + 신뢰도 색상으로
```

---

## 8. 리스크 / 트레이드오프

### 8.1 DMMF 종속 리스크
Prisma의 DMMF 형식은 마이너 버전마다 변경 가능성이 있다. 우리는 `@prisma/generator-helper` 타입을 직접 import하므로 Prisma 7→8 업그레이드 시 변환 함수 손볼 가능성.

완화책:
- DMMF → 우리 `SchemaSnapshot` 변환 함수에 단위 테스트 (스냅샷 비교).
- `pnpm-lock.yaml`로 정확한 Prisma 버전 고정.

### 8.2 information_schema의 한계
`information_schema`는 ANSI 표준이라 PostgreSQL 고유 정보(예: `pg_get_functiondef()`, `pg_indexes.indexdef`)는 `pg_catalog`를 직접 쿼리해야 한다. 권한이 부족하면 `pg_proc`/`pg_trigger` 일부 컬럼이 NULL.

완화책:
- 운영 DB 사용자는 `pg_read_server_files` 또는 최소한 `pg_monitor` 롤 부여 검토.
- 권한 부족 시 grafical 표시는 "권한 없음" 명시 + 설치 가이드 링크.

### 8.3 ERD 노드 수 폭증
대규모 SaaS는 100개 테이블도 흔하다. 양평 부엌은 11개로 시작하지만, 외부 운영자 DB 시각화 옵션을 만들면 100+도 가능.

완화책:
- ELKjs `layered` 알고리즘은 100개까지 OK. 200+에서는 `force` + 클러스터링 필요.
- 노드 LOD(Level of Detail): 100% 줌에서는 컬럼 표시, 50%에서는 이름만, 20%에서는 그룹 박스만.
- 검색 필드(cmdk) → 노드 강조 + 자동 fit.

### 8.4 스튜디오 임베드 유혹
"개발자 편의로 Prisma Studio를 admin /dev/studio에 iframe으로 올릴까?" 라는 충동.

답: **No**. 이유 4개:
1. CSRF: Prisma Studio는 자체 토큰 체계 없음 → next-auth 세션 우회 가능.
2. 비-RBAC: 운영자 권한과 무관하게 모든 DB 행을 노출.
3. 단일 사용자 가정: 동시 편집 시 데이터 손상.
4. 14c-α 낙관적 잠금 우회: `expected_updated_at` 안 보내고 무조건 덮어씀 → 운영자 안전성 깨짐.

대안: **dev-only로 PM2 ecosystem 외부에서 `pnpm prisma studio`를 별도 터미널에서 띄우고, Cloudflare Access로 IP 화이트리스트만 허용.**

---

## 9. 10차원 스코어링 (Prisma Studio 흡수 가치)

| 차원 | 가중치 | 점수(/5) | 가중점수 | 근거 |
|------|--------|----------|----------|------|
| FUNC18 | 18 | 3.5 | 0.63 | 외래키 picker + 행 diff는 강력하지만 RLS/Trigger/Function 미지원 |
| PERF10 | 10 | 4.0 | 0.40 | 행 1만까지 부드러움, 그 이상은 가상화 미지원 |
| DX14 | 14 | 4.5 | 0.63 | `prisma studio` 한 줄, 학습 곡선 0 |
| ECO12 | 12 | 4.5 | 0.54 | Prisma 생태계 거대, GitHub star 41k+ |
| LIC8 | 8 | 4.5 | 0.36 | Apache 2.0, 임베드 자유 |
| MAINT10 | 10 | 4.0 | 0.40 | 활발 유지보수, 분기 메이저 릴리스 |
| INTEG10 | 10 | 2.5 | 0.25 | 임베드는 비공식, 단일 도메인 정책과 충돌 |
| SECURITY10 | 10 | 2.0 | 0.20 | 자체 인증 없음 + 단일 사용자 가정 |
| SELF_HOST5 | 5 | 4.0 | 0.20 | 로컬 단독 가능, 완전 폐쇄망 OK |
| COST3 | 3 | 5.0 | 0.15 | 무료, Prisma Cloud 옵션은 별개 |
| **합계** | **100** | — | **3.76/5** | (점수 환산) **3.41/5** (가중평균) |

### Prisma Studio "임베드" 시나리오: **3.41/5 — 비채택**
### Prisma Studio "패턴 흡수" 시나리오: **4.6/5 — 채택**

## 9b. 10차원 스코어링 (drizzle-kit studio 흡수 가치)

| 차원 | 가중치 | 점수(/5) | 가중점수 | 근거 |
|------|--------|----------|----------|------|
| FUNC18 | 18 | 4.0 | 0.72 | ERD + 카디널리티 + 그룹화는 우리에게 부족한 자산 |
| PERF10 | 10 | 3.5 | 0.35 | 그래프 라이브러리 자체 — 100+ 노드 시 느림 |
| DX14 | 14 | 4.0 | 0.56 | `drizzle-kit studio` 한 줄, 명료 |
| ECO12 | 12 | 3.5 | 0.42 | drizzle 생태계 성장 중(GitHub star 23k+) |
| LIC8 | 8 | 4.5 | 0.36 | Apache 2.0 |
| MAINT10 | 10 | 4.0 | 0.40 | 활발 |
| INTEG10 | 10 | 1.5 | 0.15 | **외부 도메인 종속 = 임베드 불가, 단일 도메인 정책 위반** |
| SECURITY10 | 10 | 2.5 | 0.25 | UI를 외부에서 fetch하므로 CSP/Audit 어려움 |
| SELF_HOST5 | 5 | 2.0 | 0.10 | UI 외부 fetch로 폐쇄망 작동 불가 |
| COST3 | 3 | 5.0 | 0.15 | 무료 |
| **합계** | **100** | — | **3.46/5** | (점수 환산) **3.78/5** (가중평균) |

### drizzle-kit studio "임베드" 시나리오: **불가능 (외부 도메인)**
### drizzle-kit studio "패턴 흡수" 시나리오: **4.7/5 — 채택**

---

## 10. 결론 — 청사진 요약

### 10.1 채택/거부
- **Prisma Studio 임베드**: ❌ 거부 (보안/RBAC/단일사용자 한계)
- **drizzle-kit studio 임베드**: ❌ 거부 (외부 도메인 종속)
- **Prisma Studio 패턴 흡수**: ✅ 외래키 picker(14c-β), 행 단위 diff(14c-α 충돌 다이얼로그)
- **drizzle-kit studio 패턴 흡수**: ✅ 카디널리티 라벨(14d), 스키마 그룹화(향후), 자동 관계 추론(옵션)

### 10.2 100/100 도달 경로 (현재 65 → 100)
| Phase | 작업 | 점수 증가 | 비용 |
|-------|------|----------|------|
| 14d-1 | 카디널리티 라벨 + onDelete 표시 | +5 | 4시간 |
| 14d-2 | 스키마 그룹화(부모-자식 노드) | +3 | 3시간 |
| 14d-3 | Trigger collector + side panel view | +5 | 6시간 |
| 14d-4 | Function collector + Monaco view | +5 | 6시간 |
| 14d-5 | Policy(RLS) collector + side panel view | +5 | 6시간 (편집은 미션 2 별도) |
| 14d-6 | 외래키 picker + 14c-β 통합 | +3 | 4시간 |
| 14d-7 | DDL 탭 + Monaco SQL highlighting | +2 | 3시간 |
| 14d-8 | SVG/PNG export | +2 | 4시간 |
| 14d-9 | 사용자별 ERD 레이아웃 저장 | +2 | 4시간 |
| 14d-10 | 추론된 관계 토글(레거시 DB 옵션) | +2 | 4시간 |
| 14d-11 | 노드 LOD + 100+ 노드 가상 컬링 | +1 | 6시간 |
| **합계** | — | **+35 → 100/100** | **약 50시간 (1.5 sprint)** |

### 10.3 새 DQ
- **DQ-3.1**: 카디널리티 라벨 14d-1을 14c-β와 묶어 단일 PR로? 또는 단독으로? → 단독 PR 권장 (xyflow custom edge 학습 곡선 격리).
- **DQ-3.2**: Trigger/Function의 *편집*은 100/100에 포함하나? → 본 deep-dive 범위는 **view까지만**. 편집은 미션 2 별도 deep-dive 결과로.
- **DQ-3.3**: SVG export는 xyflow의 `toImg()` API로 충분한가, html2canvas 추가 필요한가? → toImg가 SVG 직접 추출, PNG는 html2canvas 별도 권장 (4시간 견적에 포함).
- **DQ-3.4**: 사용자별 ERD 레이아웃 저장 — User 테이블에 `preferences JSON` 컬럼 추가 vs 별도 `user_preferences` 테이블? → 별도 테이블 권장 (preferences가 늘어나도 User 변경 없음, RLS 분리).

---

## 11. 참고 문헌 (10+)

1. **Prisma Studio 공식 문서** — https://www.prisma.io/docs/orm/tools/prisma-studio (2026-04 확인).
2. **Prisma Studio GitHub** — https://github.com/prisma/studio.
3. **drizzle-kit studio 공식 문서** — https://orm.drizzle.team/drizzle-studio/overview.
4. **drizzle-kit studio 호스팅 모델** — https://orm.drizzle.team/docs/drizzle-kit-studio (외부 도메인 프록시 설명).
5. **Prisma DMMF 구조** — https://github.com/prisma/prisma/blob/main/packages/generator-helper/src/dmmf.ts.
6. **PostgreSQL information_schema** — https://www.postgresql.org/docs/16/information-schema.html.
7. **PostgreSQL pg_catalog** — https://www.postgresql.org/docs/16/catalogs.html.
8. **xyflow 커스텀 엣지** — https://reactflow.dev/api-reference/types/edge-props.
9. **xyflow 부모-자식 노드** — https://reactflow.dev/learn/layouting/sub-flows.
10. **ELKjs `layered` 알고리즘** — https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html.
11. **cmdk(Command Palette)** — https://github.com/pacocoursey/cmdk.
12. **@tanstack/react-query** — https://tanstack.com/query/latest.
13. **`pg_get_triggerdef`/`pg_get_functiondef`** — https://www.postgresql.org/docs/16/functions-info.html.
14. **`pg_policies` 시스템 카탈로그** — https://www.postgresql.org/docs/16/view-pg-policies.html.
15. **Supabase RLS 시각 편집기 패턴** (Wave 1 미션 2 deep-dive로 분리).
16. **Cloudflare Tunnel 단일 도메인 + CSP** — https://developers.cloudflare.com/cloudflare-one/policies/access/.

---

## 12. 부록 — 기존 65/100 산출물 위치

```
src/
  app/database/schema/
    page.tsx                  ← Server Component, snapshotToGraph 호출
    schema-erd-client.tsx     ← "use client", xyflow Provider
  components/database/
    schema-erd.tsx            ← <ReactFlow> + ELKjs layout
    schema-table-node.tsx     ← 테이블 노드 컴포넌트
    schema-side-panel.tsx     ← (현재 columns 탭만)
  server/database/
    schema-introspect/
      collect-tables.ts       ← 완료
      collect-columns.ts      ← 완료
      collect-foreign-keys.ts ← 완료 (cardinality 미흡)
      collect-indexes.ts      ← 완료
      collect-triggers.ts     ← 미작성 (14d-3)
      collect-functions.ts    ← 미작성 (14d-4)
      collect-policies.ts     ← 미작성 (14d-5)
docs/research/
  spike-005-schema-visualizer.md ← 65/100 도달 기록
```

---

(끝 — 본 deep-dive는 두 외부 스튜디오의 패턴 흡수 vs 자체 구현의 균형을 정리하고, 우리 `/database/schema` 100/100 청사진의 35점 추가 경로를 제시했다.)
