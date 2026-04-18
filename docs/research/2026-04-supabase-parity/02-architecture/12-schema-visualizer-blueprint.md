# 12. Schema Visualizer Blueprint — 양평 부엌 서버 대시보드

> Wave 4 · Tier 2 · B6 (DB 관리 클러스터) 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-B6)
> 작성자: Claude Sonnet 4.6 — Wave 4 Agent B6
> 카테고리: 3 — Schema Visualizer
> 상위: [02-architecture/](./) → [CLAUDE.md](../../../../CLAUDE.md)
> 연관: [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md) · [../00-vision/02-functional-requirements.md](../00-vision/02-functional-requirements.md)
> 입력 문서: [../01-research/03-schema-visualizer/](../01-research/03-schema-visualizer/) 4개 문서

---

## 1. 요약 (Executive Summary)

### 1.1 현황 및 목표

| 항목 | 현재 | 목표 |
|------|------|------|
| 카테고리 점수 | **65점** | **95점** |
| 갭 | 30점 | — |
| ADR 기준 | ADR-004 (Accepted) | 동일 유지 |
| 예상 공수 | — | **~50시간** (Phase 20) |
| 신규 라우트 | 없음 | `/database/policies`, `/database/functions`, `/database/triggers` |

Schema Visualizer는 14 카테고리 중 **Level 4 (고급 기능)** 에 속하며, Table Editor(Level 3)에 선행 의존한다. Phase 20에서 65 → 95점 달성을 목표로 한다.

### 1.2 결론 3줄

1. **채택안 확정**: `@xyflow/react + elkjs` 기반 SchemaCanvas + schemalint 커스텀 룰 엔진 + 자체 RLS/Function/Trigger Monaco UI. Prisma Studio 및 drizzle-kit Studio는 임베드 거부, 패턴만 흡수.
2. **신규 라우트 3개**: `/database/policies` (RLS 정책 편집), `/database/functions` (PL/pgSQL 편집), `/database/triggers` (Trigger 토글+편집).
3. **DQ 8건 전부 답변 완료**: DQ-3.1 ~ DQ-3.15 중 Wave 4 할당 8건을 본 문서 §10에서 확정한다.

---

## 2. Wave 1-2 채택안 확인

Wave 1-2 리서치에서 확정된 기술 스택을 그대로 인수한다. 이 결정들은 ADR-004로 확정되어 있으며 재검토 트리거 없이는 변경하지 않는다.

### 2.1 Wave 1 채택안 (점수 기준)

| 기술 | Wave 1 점수 | 채택 여부 | 역할 |
|------|-------------|----------|------|
| schemalint (커스텀 룰) | **4.42/5** | 채택 | 스키마 컨벤션 린터 (CI/cron) |
| 자체 RLS 시각 편집기 | **4.18/5** | 채택 | RLS 정책 CRUD UI |
| Trigger/Function 편집기 (Monaco) | **4.31/5** | 채택 | PL/pgSQL 편집 + 버전관리 |
| Prisma Studio 패턴 흡수 | 3.41/5 | 흡수 | 외래키 picker 패턴 |
| drizzle-kit studio 패턴 흡수 | 3.78/5 | 흡수 | 카디널리티·스키마 그룹 패턴 |
| Prisma Studio 임베드 | 3.05/5 | 거부 | 임베드 시 CSP·RBAC·Audit 계약 파괴 |
| drizzle-kit Studio 임베드 | 2.75/5 | 거부 | 외부 도메인 fetch → CSP 위반 |

### 2.2 Wave 2 매트릭스 재확인 (ADR-004)

Wave 2 Agent B가 10차원 × 7후보 스코어링으로 채택안 4.30/5 확정. 핵심 근거:

- **INTEG10 = 5.0/5**: 외부 도메인 fetch 0건, NextAuth 세션 직결, CSP `default-src 'self'` 완전 준수
- **SECURITY10 = 4.5/5**: DDL SAVEPOINT dry-run + audit_log 자동 기록 + Phase 14b RBAC 매트릭스 통합
- **DX14 = 4.5/5**: react-hook-form + zod + Phase 14b `table-policy.ts` 자산 직결

### 2.3 임베드 거부 재확인

Prisma Studio / drizzle-kit Studio 임베드가 거부된 기술적 이유 4가지:

1. **낙관적 잠금 계약 파괴**: Prisma Studio는 `expected_updated_at` CAS(Compare-And-Swap) 미지원 → last-write-wins 방식으로 동시 편집 시 데이터 유실 위험.
2. **RBAC 부재**: Phase 14b의 `FULL_BLOCK` / `DELETE_ONLY` / `READ_ONLY` 매트릭스를 Prisma Studio가 인식하지 못함.
3. **audit_log 연결 불가**: `writeAuditLog()` 호출이 iframe 경계를 넘지 못함.
4. **단일 도메인 CSP 위반**: drizzle-kit studio가 `local.drizzle.studio` 외부 fetch → CSP `default-src 'self'` 위반.

---

## 3. 컴포넌트 아키텍처

### 3.1 컴포넌트 트리

```
/database/schema (SchemaPage — Server Component)
├── SchemaCanvas          ← @xyflow/react + elkjs ERD 렌더링
│   ├── TableNode         ← 테이블 노드 (컬럼 목록 + 카디널리티)
│   ├── EdgeLabel         ← FK 관계 엣지 (1:1/1:N/N:N)
│   ├── GroupNode         ← 스키마 그룹 (public/admin)
│   ├── ViewportLazyLoader ← 100+ 테이블 뷰포트 lazy loading
│   └── CanvasToolbar     ← Fit/Zoom/Export/Layout 버튼
│       └── LayoutSelector ← ELK 알고리즘 선택 (MRTREE/LAYERED)
│
├── SchemalintRunner      ← schemalint 커스텀 룰 실행 결과 패널
│   ├── RuleViolationList ← 위반 목록 (severity × 테이블)
│   └── CIStatusBadge     ← CI 통과/실패 배지
│
└── SchemaInfoPanel       ← 우측 사이드 패널
    ├── TableDetail        ← 선택된 테이블 컬럼 상세
    ├── RlsPolicySummary   ← 연결된 RLS 정책 요약
    └── TriggerSummary     ← 연결된 Trigger 요약

/database/policies (PoliciesPage — Server Component)
├── PolicyTable           ← 전체 정책 카탈로그 (테이블 × 정책명)
│   ├── PolicyStatusBadge  ← USING()/WITH CHECK() 상태
│   └── EmptyPolicyWarning ← RLS 미설정 테이블 경고 (FR-3.2 §2)
│
├── PolicyEditor          ← 정책 생성/편집 폼
│   ├── PolicyVisualBuilder ← 드롭다운 + 빌더 (70% 시나리오)
│   │   ├── OperationSelector ← SELECT/INSERT/UPDATE/DELETE/ALL
│   │   ├── RoleSelector      ← PUBLIC/authenticated/admin
│   │   └── ExpressionHelper  ← using_expr / check_expr 도우미
│   ├── PolicyRawEditor   ← Monaco SQL 편집기 (raw 모드)
│   └── DependencyAnalyzer ← 정책 삭제 전 의존성 검사 (DQ-3.11)
│
└── ForeignKeyRowSelector ← 재사용 cmdk 컴포넌트 (DQ-3.2)

/database/functions (FunctionsPage — Server Component)
├── FunctionList          ← PL/pgSQL 함수 카탈로그
│   ├── FunctionStatusBadge ← 언어/인자/반환타입
│   └── VersionHistory    ← 버전 관리 목록
│
├── FunctionEditor        ← Monaco plpgsql 편집기
│   ├── RenameHandler     ← ALTER FUNCTION RENAME (DQ-3.10)
│   ├── SaveHandler       ← CREATE OR REPLACE FUNCTION
│   └── AuditLogger       ← audit_log 자동 기록
│
└── FunctionDiffViewer    ← 이전 버전 diff 표시

/database/triggers (TriggersPage — Server Component)
├── TriggerList           ← Trigger 카탈로그 (테이블 × 이벤트)
│   └── TriggerToggle     ← 활성/비활성 토글 + audit log (DQ-3.9)
│
└── TriggerEditor         ← Monaco plpgsql + Trigger 메타 폼
    ├── EventSelector     ← BEFORE/AFTER/INSTEAD OF × INSERT/UPDATE/DELETE
    ├── LevelSelector     ← ROW/STATEMENT
    └── FunctionLinker    ← 연결할 FUNCTION 선택
```

### 3.2 서버/클라이언트 경계

| 컴포넌트 | Server Component | Client Component | 이유 |
|---------|:---:|:---:|------|
| SchemaPage | ✅ | | 초기 ERD 데이터 서버 fetch |
| SchemaCanvas | | ✅ | @xyflow/react 인터랙티브 |
| PolicyEditor | | ✅ | react-hook-form 상태 |
| FunctionEditor | | ✅ | Monaco 인스턴스 |
| TriggerToggle | | ✅ | 클릭 이벤트 |
| SchemalintRunner | ✅ | | 서버에서 lint 결과 집계 |

---

## 4. SchemaCanvas 설계 — 100+ 테이블 최적화

### 4.1 기술 스택

```typescript
// 의존성 선언
import ReactFlow, { useReactFlow, useViewport } from '@xyflow/react' // MIT
import ELK from 'elkjs/lib/elk.bundled.js'                            // EPL-2.0

// ELK 레이아웃 설정
const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.edgeRouting': 'ORTHOGONAL',
}
```

### 4.2 뷰포트 Lazy Loading (100+ 테이블 지원)

100개 이상 테이블이 있을 때 elkjs 레이아웃 연산이 1.5s+ 걸리는 문제를 해결하기 위해 뷰포트 기반 lazy loading을 구현한다.

```typescript
// src/components/schema-canvas/viewport-lazy-loader.tsx
'use client'

import { useViewport, useStoreApi } from '@xyflow/react'
import { useMemo } from 'react'

const PADDING = 200  // 뷰포트 밖으로 200px 여유분 렌더

export function useVisibleNodes(allNodes: SchemaNode[]) {
  const { x, y, zoom } = useViewport()
  const store = useStoreApi()

  return useMemo(() => {
    const { width, height } = store.getState()

    // 현재 뷰포트 범위 계산 (화면 좌표 → 플로우 좌표 역변환)
    const viewLeft   = (-x - PADDING) / zoom
    const viewTop    = (-y - PADDING) / zoom
    const viewRight  = (width  - x + PADDING) / zoom
    const viewBottom = (height - y + PADDING) / zoom

    return allNodes.filter(node => {
      const nx = node.position.x
      const ny = node.position.y
      const nw = (node.measured?.width  ?? 200)
      const nh = (node.measured?.height ?? 100)
      return (
        nx + nw >= viewLeft &&
        nx      <= viewRight &&
        ny + nh >= viewTop  &&
        ny      <= viewBottom
      )
    })
  }, [allNodes, x, y, zoom, store])
}
```

**성능 목표**: 100 테이블 기준 초기 레이아웃 연산 p95 ≤ 2s (NFR-PERF 기준), 뷰포트 이동 시 렌더 추가 지연 없음.

### 4.3 ELK 레이아웃 Worker 분리

elkjs 연산을 Web Worker로 분리하여 메인 스레드 블록을 방지한다.

```typescript
// src/lib/schema-viz/elk-worker.ts (Web Worker)
import ELK from 'elkjs/lib/elk-worker.min.js'
const elk = new ELK()

self.onmessage = async (event: MessageEvent<ElkLayoutRequest>) => {
  const { graph, options } = event.data
  try {
    const result = await elk.layout(graph, { layoutOptions: options })
    self.postMessage({ type: 'success', result })
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
  }
}
```

```typescript
// src/hooks/use-elk-layout.ts
export function useElkLayout(nodes: SchemaNode[], edges: SchemaEdge[]) {
  const [layoutedNodes, setLayoutedNodes] = useState<SchemaNode[]>([])
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker('/elk-worker.js')
    }

    const worker = workerRef.current
    worker.postMessage({ graph: buildElkGraph(nodes, edges), options: ELK_OPTIONS })
    worker.onmessage = (e) => {
      if (e.data.type === 'success') {
        setLayoutedNodes(applyElkPositions(nodes, e.data.result))
      }
    }
  }, [nodes, edges])

  return layoutedNodes
}
```

### 4.4 사용자별 레이아웃 저장

DQ-3.4에 따라 ERD 레이아웃은 `user_preferences` 별도 테이블에 저장한다 (User 테이블 오염 방지, RLS 분리).

```typescript
// 레이아웃 저장 API: POST /api/database/schema/layout
// scope: 'schema-viz', resourceKey: 'default'
// data: { nodes: [{ id, x, y }], zoom, viewport }

export async function saveErdLayout(userId: string, layout: ErdLayout) {
  await prisma.userPreference.upsert({
    where: {
      userId_scope_resourceKey: {
        userId,
        scope: 'schema-viz',
        resourceKey: 'default',
      },
    },
    update: { data: layout },
    create: {
      userId,
      scope: 'schema-viz',
      resourceKey: 'default',
      data: layout,
    },
  })
}
```

**RLS 정책**:
```sql
-- user_preferences는 각 사용자 본인 행만 접근 가능
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_preferences_own ON user_preferences
  FOR ALL USING (user_id = current_setting('app.current_user_id')::uuid);
```

---

## 5. RLS Policy UI — Monaco 언어서버 + 의존성 분석

### 5.1 PolicyVisualBuilder 구현

시각 편집 모드는 70% 시나리오(단순 정책)를 커버한다. 복잡한 정책은 Monaco raw 모드 탭으로 전환.

```typescript
// src/components/policy-editor/policy-visual-builder.tsx
'use client'

import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const PolicySchema = z.object({
  policyName: z.string().min(1).max(63),
  tableName:  z.string().min(1),
  operation:  z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']),
  roles:      z.array(z.string()).min(1),
  usingExpr:  z.string().optional(),   // USING 절
  checkExpr:  z.string().optional(),   // WITH CHECK 절
  permissive: z.boolean().default(true),  // PERMISSIVE vs RESTRICTIVE
})

type PolicyFormData = z.infer<typeof PolicySchema>

export function PolicyVisualBuilder({ tableName, onSubmit }: PolicyVisualBuilderProps) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<PolicyFormData>({
    resolver: zodResolver(PolicySchema),
    defaultValues: { tableName, operation: 'SELECT', roles: ['authenticated'], permissive: true },
  })

  const operation = watch('operation')

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* 정책명 */}
      <PolicyNameInput {...register('policyName')} error={errors.policyName?.message} />

      {/* 작업 선택 */}
      <OperationSelector {...register('operation')} />

      {/* 역할 선택 (다중) */}
      <RoleMultiSelect {...register('roles')} availableRoles={['PUBLIC', 'authenticated', 'admin']} />

      {/* USING 절 — SELECT/UPDATE/DELETE 공통 */}
      {['SELECT', 'UPDATE', 'DELETE', 'ALL'].includes(operation) && (
        <ExpressionHelper
          label="USING 절"
          placeholder="auth.uid() = user_id"
          name="usingExpr"
          register={register}
        />
      )}

      {/* WITH CHECK 절 — INSERT/UPDATE 전용 */}
      {['INSERT', 'UPDATE', 'ALL'].includes(operation) && (
        <ExpressionHelper
          label="WITH CHECK 절"
          placeholder="auth.uid() = user_id"
          name="checkExpr"
          register={register}
        />
      )}

      {/* 정책 타입 토글 */}
      <PermissiveToggle {...register('permissive')} />

      {/* SQL 미리보기 */}
      <SqlPreview formData={watch()} />

      <Button type="submit">정책 저장</Button>
    </form>
  )
}
```

### 5.2 Monaco RLS 편집기

raw SQL 모드에서 Monaco Editor를 통해 직접 편집한다. SQL Editor와 동일한 Monaco 인스턴스 설정을 재사용한다.

```typescript
// src/components/policy-editor/policy-raw-editor.tsx
'use client'

import Editor, { Monaco } from '@monaco-editor/react'
import { useRef } from 'react'

const RLS_AUTOCOMPLETE_KEYWORDS = [
  'auth.uid()', 'auth.role()', 'current_user', 'session_user',
  'current_setting(', 'USING', 'WITH CHECK', 'PERMISSIVE', 'RESTRICTIVE',
]

export function PolicyRawEditor({ value, onChange }: PolicyRawEditorProps) {
  const monacoRef = useRef<Monaco | null>(null)

  function handleEditorDidMount(editor: unknown, monaco: Monaco) {
    monacoRef.current = monaco

    // RLS 전용 자동완성 제공자 등록
    monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['a', 'c', 's'],
      provideCompletionItems(model, position) {
        return {
          suggestions: RLS_AUTOCOMPLETE_KEYWORDS.map(kw => ({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: kw,
          })),
        }
      },
    })
  }

  return (
    <Editor
      height="300px"
      language="sql"
      theme="vs-dark"
      value={value}
      onChange={val => onChange(val ?? '')}
      onMount={handleEditorDidMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        lineNumbers: 'on',
      }}
    />
  )
}
```

### 5.3 정책 삭제 의존성 분석

DQ-3.11, DQ-3.15에 따라 정책 삭제 전 의존성 검사 및 경고를 표시한다.

```typescript
// src/lib/schema-viz/policy-dependency-analyzer.ts

interface PolicyDependencyResult {
  isLastPermissivePolicy: boolean   // DQ-3.15
  affectedUserCount: number         // DQ-3.11
  dependentPolicies: string[]       // 같은 테이블의 다른 정책
  recommendation: 'safe' | 'warn' | 'danger'
}

export async function analyzePolicyDependency(
  tableName: string,
  policyName: string,
): Promise<PolicyDependencyResult> {
  // 같은 테이블의 PERMISSIVE 정책 수 조회
  const permissivePolicies = await db.query(`
    SELECT policyname
    FROM pg_policies
    WHERE tablename = $1
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('SELECT', 'ALL')
  `, [tableName])

  const isLastPermissivePolicy =
    permissivePolicies.rows.length === 1 &&
    permissivePolicies.rows[0].policyname === policyName

  // 이 정책에 의해 접근 가능한 사용자 수 추정 (role 기반)
  const affectedUserCount = await estimateAffectedUsers(tableName, policyName)

  return {
    isLastPermissivePolicy,
    affectedUserCount,
    dependentPolicies: permissivePolicies.rows
      .map(r => r.policyname)
      .filter(n => n !== policyName),
    recommendation: isLastPermissivePolicy ? 'danger'
      : affectedUserCount > 0 ? 'warn'
      : 'safe',
  }
}
```

**삭제 경고 UI**:
```typescript
// DQ-3.11: "이 정책 삭제 시 N개 사용자가 {table} 테이블 접근 불가"
// DQ-3.15: "이 테이블의 마지막 허용(PERMISSIVE) SELECT 정책입니다. 삭제 시 모든 사용자 접근 차단"
```

> **DQ-3.11 상태**: 의존성 분석 로직은 본 Blueprint에서 설계하나, 정밀한 사용자 영향 추산은 Phase 14e 후속 deep-dive(스파이크)로 분리. Phase 20에서는 "마지막 허용 정책 여부"만 정확히 구현, 사용자 수 추산은 best-effort.

---

## 6. Function/Trigger UI — PL/pgSQL 편집 + 버전 관리

### 6.1 FunctionEditor 핵심 구현

```typescript
// src/components/function-editor/function-editor.tsx
'use client'

import Editor from '@monaco-editor/react'
import { useState, useCallback } from 'react'

// PL/pgSQL Monarch 언어 정의 (Monaco 기본 SQL 확장)
const PLPGSQL_MONARCH_CONFIG = {
  keywords: [
    'DECLARE', 'BEGIN', 'END', 'EXCEPTION', 'RAISE', 'RETURN',
    'IF', 'THEN', 'ELSIF', 'ELSE', 'LOOP', 'EXIT', 'WHILE', 'FOR',
    'LANGUAGE', 'PLPGSQL', 'RETURNS', 'TRIGGER', 'NEW', 'OLD',
    'TG_OP', 'TG_TABLE_NAME', 'TG_WHEN',
  ],
}

export function FunctionEditor({ functionDef, onSave }: FunctionEditorProps) {
  const [code, setCode] = useState(functionDef.definition)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      // SAVEPOINT dry-run 먼저 실행
      const dryRunResult = await fetch('/api/database/functions/validate', {
        method: 'POST',
        body: JSON.stringify({ sql: code }),
      })
      if (!dryRunResult.ok) {
        const err = await dryRunResult.json()
        throw new Error(err.message)
      }

      // 실제 저장
      await fetch(`/api/database/functions/${functionDef.oid}`, {
        method: 'PUT',
        body: JSON.stringify({ definition: code }),
      })

      // RLS 정책 변경 후 ERD 새로고침 (DQ-3.12 패턴 재사용)
      // await revalidatePath('/database/schema') — 서버 Action에서 호출
      onSave()
    } catch (err) {
      // Sonner 토스트로 에러 표시
      toast.error(`함수 저장 실패: ${String(err)}`)
    } finally {
      setIsSaving(false)
    }
  }, [code, functionDef.oid, onSave])

  return (
    <div className="flex flex-col gap-4">
      <FunctionMetaForm functionDef={functionDef} />
      <Editor
        height="500px"
        language="sql"   // plpgsql 토큰 주입
        theme="vs-dark"
        value={code}
        onChange={val => setCode(val ?? '')}
        options={{ minimap: { enabled: false }, fontSize: 14 }}
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => setCode(functionDef.definition)}>
          원래대로
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? '저장 중...' : '함수 저장'}
        </Button>
      </div>
    </div>
  )
}
```

### 6.2 Function Rename — ALTER FUNCTION RENAME (DQ-3.10)

```typescript
// src/app/api/database/functions/[oid]/rename/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import db from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: { oid: string } },
) {
  const session = await auth()
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { newName, schema } = await req.json()

  // 기존 함수 정보 조회
  const funcInfo = await db.query(
    'SELECT proname, pronamespace::regnamespace FROM pg_proc WHERE oid = $1',
    [params.oid],
  )
  if (funcInfo.rows.length === 0) {
    return NextResponse.json({ error: '함수를 찾을 수 없음' }, { status: 404 })
  }

  const oldName = funcInfo.rows[0].proname

  // DQ-3.10: DROP+CREATE 대신 ALTER FUNCTION RENAME 사용 (참조 무결성 보존)
  // 이유: DROP+CREATE는 Trigger 등 함수 참조를 끊음
  await db.query(
    `ALTER FUNCTION ${schema}.${oldName}(${getArgTypes(params.oid)}) RENAME TO ${newName}`,
  )

  // audit_log 기록
  await writeAuditLog({
    userId: session.user.id,
    action: 'function.rename',
    resourceType: 'function',
    resourceId: params.oid,
    details: { oldName, newName, schema },
  })

  return NextResponse.json({ success: true, newName })
}
```

> **DQ-3.10 근거**: `ALTER FUNCTION ... RENAME TO`는 OID를 유지한 채 이름만 변경한다. 반면 `DROP + CREATE`는 OID가 바뀌어 기존 Trigger의 `tgfoid` 참조가 깨질 수 있다. PostgreSQL 문서 §43.3.1 참조.

### 6.3 Function 버전 관리

함수 저장 시 이전 버전을 `function_versions`(SQLite 저장)에 스냅샷. 롤백 기능 제공.

```typescript
// src/lib/schema-viz/function-versioning.ts

interface FunctionVersion {
  id: number
  functionOid: string
  functionName: string
  definition: string
  createdAt: Date
  createdBy: string  // User.id
  changeNote: string
}

export async function snapshotFunctionVersion(
  oid: string,
  definition: string,
  userId: string,
  note: string,
): Promise<void> {
  await sqliteDb.insert(functionVersions).values({
    functionOid: oid,
    functionName: await getFunctionName(oid),
    definition,
    createdAt: new Date(),
    createdBy: userId,
    changeNote: note,
  })
}

// 최근 N개 버전만 보관 (기본 20개)
export async function pruneOldVersions(oid: string, keepCount = 20): Promise<void> {
  const versions = await sqliteDb
    .select({ id: functionVersions.id })
    .from(functionVersions)
    .where(eq(functionVersions.functionOid, oid))
    .orderBy(desc(functionVersions.createdAt))
    .offset(keepCount)

  if (versions.length > 0) {
    await sqliteDb
      .delete(functionVersions)
      .where(inArray(functionVersions.id, versions.map(v => v.id)))
  }
}
```

### 6.4 Trigger 비활성화 토글 — Audit Log 필수 (DQ-3.9)

```typescript
// src/app/api/database/triggers/[name]/toggle/route.ts

export async function POST(
  req: NextRequest,
  { params }: { params: { name: string } },
) {
  const session = await auth()
  if (!session || !['ADMIN', 'MANAGER'].includes(session.user.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const { tableName, enable } = await req.json()

  // DQ-3.9: Trigger 토글은 반드시 audit log에 기록
  const action = enable ? 'ENABLE' : 'DISABLE'
  await db.query(
    `ALTER TABLE ${tableName} ${action} TRIGGER ${params.name}`,
  )

  // audit_log 필수 기록
  await writeAuditLog({
    userId: session.user.id,
    action: `trigger.${action.toLowerCase()}`,
    resourceType: 'trigger',
    resourceId: `${tableName}.${params.name}`,
    details: {
      tableName,
      triggerName: params.name,
      previousState: !enable,
      newState: enable,
      reason: `수동 ${action} by ${session.user.email}`,
    },
  })

  return NextResponse.json({ success: true, enabled: enable })
}
```

---

## 7. schemalint — 커스텀 룰 엔진 + Fixture Test

### 7.1 커스텀 룰 엔진 구조

```
src/lib/schemalint/
├── config/
│   └── .schemalintrc.ts      ← 룰 설정
├── rules/
│   ├── index.ts              ← 룰 집합 (플러그인 등록)
│   ├── require-updated-at.ts ← 필수 updated_at 룰
│   ├── require-fk-index.ts   ← FK 인덱스 필수 룰
│   ├── require-rls.ts        ← public 스키마 RLS 필수 룰
│   ├── require-audit-columns.ts ← audit 컬럼 패턴 검사
│   └── ban-varchar.ts        ← TEXT 대신 VARCHAR 사용 금지
├── runner/
│   ├── schemalint-runner.ts  ← CLI + API 실행 진입점
│   └── finding-reporter.ts   ← AdvisorFinding 저장 연동
└── tests/
    └── fixtures/             ← shadow DB fixture 테스트 (DQ-ADV-7)
```

```typescript
// src/lib/schemalint/rules/require-rls.ts
import type { Rule, SchemaObject } from 'schemalint'

export const requireRls: Rule = {
  name: 'require-rls-on-public',
  docs: {
    description: 'public 스키마의 모든 테이블에 RLS(Row Level Security) 활성화 필수',
    url: 'https://supabase.com/docs/guides/database/postgres/row-level-security',
  },
  process({ schemaObject, report }: { schemaObject: SchemaObject; report: Function }) {
    for (const table of schemaObject.tables) {
      // Prisma 내부 테이블 및 감사 테이블 제외
      if (
        table.name.startsWith('_prisma_') ||
        table.name.startsWith('_drizzle_') ||
        ['audit_log', 'function_versions'].includes(table.name)
      ) continue

      // pg_class.relrowsecurity 확인
      if (!table.isRowLevelSecurityEnabled) {
        report({
          rule: 'require-rls-on-public',
          identifier: `${table.schemaName}.${table.name}`,
          message: `테이블 "${table.name}"에 RLS가 비활성화되어 있습니다. ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY 실행 필요.`,
          suggestedMigration: `ALTER TABLE "${table.schemaName}"."${table.name}" ENABLE ROW LEVEL SECURITY;`,
        })
      }
    }
  },
}
```

### 7.2 CI 통합 설정

```typescript
// src/lib/schemalint/config/.schemalintrc.ts
import type { SchemaLintConfig } from 'schemalint'
import { requireUpdatedAt } from '../rules/require-updated-at'
import { requireFkIndex } from '../rules/require-fk-index'
import { requireRls } from '../rules/require-rls'
import { requireAuditColumns } from '../rules/require-audit-columns'
import { banVarchar } from '../rules/ban-varchar'

const config: SchemaLintConfig = {
  connection: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432'),
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? '',
    database: process.env.DATABASE_NAME ?? 'ypkitchen',
  },
  plugins: [
    requireUpdatedAt,
    requireFkIndex,
    requireRls,
    requireAuditColumns,
    banVarchar,
  ],
  rules: {
    'require-updated-at': ['error'],
    'require-fk-index': ['error'],
    'require-rls-on-public': ['error'],
    'require-audit-columns': ['warn'],
    'ban-varchar': ['warn'],
    'name-casing': ['error', 'snake_case'],
    'name-inflection': ['error', 'singular'],
    'prefer-text-to-varchar': ['error'],
    'prefer-jsonb-to-json': ['error'],
    'prefer-identity-to-serial': ['warn'],
    'require-primary-key': ['error'],
  },
  schemas: [{ name: 'public' }],
}

export default config
```

### 7.3 Fixture Test — pgsql-ast-parser (DQ-ADV-7)

```typescript
// src/lib/schemalint/tests/fixtures/require-rls.test.ts
import { describe, it, expect } from 'vitest'
import { parse } from 'pgsql-ast-parser'
import { requireRls } from '../../rules/require-rls'

describe('require-rls-on-public 룰', () => {
  it('RLS 비활성 테이블에서 위반 보고', () => {
    // pgsql-ast-parser로 AST 생성 (shadow DB 없이 단위 테스트)
    const schemaObject = buildMockSchemaObject({
      tables: [
        {
          name: 'users',
          schemaName: 'public',
          isRowLevelSecurityEnabled: false,
        },
      ],
    })

    const findings: SchemaLintFinding[] = []
    requireRls.process({
      schemaObject,
      report: (finding: SchemaLintFinding) => findings.push(finding),
    })

    expect(findings).toHaveLength(1)
    expect(findings[0].identifier).toBe('public.users')
    expect(findings[0].message).toContain('RLS가 비활성화')
  })

  it('_prisma_ 내부 테이블은 검사 제외', () => {
    const schemaObject = buildMockSchemaObject({
      tables: [
        {
          name: '_prisma_migrations',
          schemaName: 'public',
          isRowLevelSecurityEnabled: false,
        },
      ],
    })

    const findings: SchemaLintFinding[] = []
    requireRls.process({
      schemaObject,
      report: (finding: SchemaLintFinding) => findings.push(finding),
    })

    expect(findings).toHaveLength(0)
  })
})
```

> **DQ-ADV-7 근거**: `pgsql-ast-parser`는 실제 PostgreSQL DB 없이 SQL AST를 생성하여 단위 테스트 가능. shadow DB 방식(실제 DB 필요)보다 CI 속도가 빠르고 CI 환경 의존성이 없다. 단, pgsql-ast-parser가 커버하지 못하는 런타임 상태(RLS 활성 여부)는 shadow DB 통합 테스트로 보완.

---

## 8. 데이터 모델

### 8.1 신규 테이블 요약 (이 카테고리 담당)

| 테이블 | 저장소 | Phase | 근거 |
|--------|--------|-------|------|
| `user_preferences` | PostgreSQL | 20 | DQ-3.4 — 별도 테이블, RLS 분리 |
| `schemalint_rules` | PostgreSQL | 20 | 커스텀 룰 카탈로그 (Advisors와 공유 — §8.3) |
| `schemalint_findings` | PostgreSQL | 20 | 린트 결과 영속화 |
| `function_versions` | SQLite | 20 | 버전 이력 (재생성 가능, PG 불필요) |

### 8.2 `user_preferences` 상세 (DQ-3.4)

`02-data-model-erd.md §3.10.1`에서 제안된 스키마를 그대로 채용한다.

```prisma
/// 사용자별 UI preference. ERD 레이아웃, 테이블 컬럼 순서 등.
model UserPreference {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scope        String   // 'schema-viz' | 'table-editor' | 'sql-editor'
  resourceKey  String   @map("resource_key")  // ERD = 'default' | table = 'users'
  data         Json     // scope별 payload (레이아웃 좌표 등)
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@unique([userId, scope, resourceKey])
  @@index([userId, scope])
  @@map("user_preferences")
}
```

**ERD 레이아웃 payload 예시**:
```json
{
  "nodes": [{ "id": "users", "x": 100, "y": 200 }],
  "zoom": 0.8,
  "viewport": { "x": 0, "y": 0 }
}
```

**DQ-3.4 결정 근거**:
- User 테이블에 `preferences JSON` 컬럼 추가 시 → RLS 정책이 User 전체에 적용, 사용자 정보와 UI 설정이 결합
- 별도 `user_preferences` 테이블 → scope별 독립 RLS, 확장 시 User 마이그레이션 불필요
- 추후 `table-editor`, `sql-editor` preference 추가 시 컬럼 추가 없이 scope만 추가

### 8.3 `schemalint_rules` / `schemalint_findings`

schemalint 결과를 Advisors 시스템(카테고리 10)과 공유한다. 이 두 테이블은 `02-architecture/14-advisors-blueprint.md §8`의 `advisor_rules` / `advisor_findings`에 통합된다.

- `schemalint_rules` → `advisor_rules` (layer = 'SCHEMALINT')
- `schemalint_findings` → `advisor_findings` (ruleId가 schemalint 룰을 참조)

### 8.4 `function_versions` (SQLite)

```typescript
// src/lib/db/schema.ts (Drizzle SQLite 추가)
export const functionVersions = sqliteTable('function_versions', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  functionOid:  text('function_oid').notNull(),
  functionName: text('function_name').notNull(),
  definition:   text('definition').notNull(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`unixepoch()`),
  createdBy:    text('created_by').notNull(),  // User.id
  changeNote:   text('change_note').notNull().default(''),
})
```

---

## 9. UI 라우트 상세

### 9.1 라우트 구조

```
app/
└── (dashboard)/
    └── database/
        ├── schema/
        │   └── page.tsx          ← SchemaPage (ERD + schemalint 요약)
        ├── policies/
        │   ├── page.tsx          ← PoliciesPage (정책 카탈로그)
        │   └── [policyId]/
        │       └── page.tsx      ← PolicyEditPage (단일 정책 편집)
        ├── functions/
        │   ├── page.tsx          ← FunctionsPage (함수 카탈로그)
        │   └── [oid]/
        │       └── page.tsx      ← FunctionEditPage (함수 편집 + 버전)
        └── triggers/
            └── page.tsx          ← TriggersPage (트리거 목록 + 토글)
```

### 9.2 각 페이지 설명

| 라우트 | 기능 | FR 매핑 |
|--------|------|---------|
| `/database/schema` | xyflow ERD + schemalint 결과 + 관계 탐색 | FR-3.1, FR-3.4 |
| `/database/policies` | RLS 정책 카탈로그 + 편집 + 삭제 경고 | FR-3.2 |
| `/database/functions` | PL/pgSQL 편집 + 버전관리 + rename | FR-3.3 |
| `/database/triggers` | Trigger 목록 + 활성/비활성 토글 | FR-3.3 |

### 9.3 RLS 저장 후 ERD 자동 새로고침 (DQ-3.12)

```typescript
// src/app/api/database/policies/route.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function createOrUpdatePolicy(formData: PolicyFormData) {
  // ... 정책 저장 로직

  // DQ-3.12: 정책 저장 후 ERD 페이지 캐시 무효화 → 자동 새로고침
  revalidatePath('/database/schema')
  revalidatePath('/database/policies')
}
```

---

## 10. Wave 4 할당 DQ 답변 (8건)

### DQ-3.1 — 관계 자동 추론 휴리스틱

**질문**: drizzle-kit studio의 "관계 자동 추론" 알고리즘(컬럼명 휴리스틱: `userId` → `user.id`)을 자체 introspect에도 적용?

**답변**: **명시 FK 우선, 휴리스틱은 레거시 DB 옵션으로 분리**

- **기본 동작**: `information_schema.referential_constraints` + `information_schema.key_column_usage` 에서 명시적 FK 관계만 추출. 이것이 Prisma 7 스키마와 완전히 일치하며 100% 정확도 보장.
- **레거시 DB 옵션**: 환경 설정(`SCHEMA_VIZ_HEURISTIC_FK=true`)으로 컬럼명 패턴 매칭(`*_id` suffix → 타깃 테이블 추정)을 활성화 가능. 단, 추론된 관계는 UI에서 점선(dashed) 엣지로 표시하여 명시적 FK(실선)와 시각적 구분.
- **이유**: 양평 부엌 현재 스키마는 Prisma에 의해 모든 FK가 명시됨. 휴리스틱 기본 활성화 시 오탐(false positive) 발생 위험. 레거시 DB 마이그레이션 시나리오에서만 옵션으로 사용.

```typescript
// src/lib/schema-viz/relationship-extractor.ts
export async function extractRelationships(
  schemaName: string,
  opts: { heuristicFk?: boolean } = {},
): Promise<SchemaRelationship[]> {
  // 1단계: 명시적 FK (항상 실행)
  const explicitFks = await getExplicitForeignKeys(schemaName)

  if (!opts.heuristicFk) {
    return explicitFks
  }

  // 2단계: 휴리스틱 FK (옵션 활성 시만)
  const allColumns = await getAllColumns(schemaName)
  const heuristicFks = inferFksByColumnNamePattern(allColumns, explicitFks)
    .map(fk => ({ ...fk, inferred: true }))  // 추론됨 표시

  return [...explicitFks, ...heuristicFks]
}
```

---

### DQ-3.2 — 행 Selector 재사용

**질문**: Prisma Studio의 행 selector 모달을 별도 컴포넌트로 분리해 `/tables` Table Editor 외래키 셀에서도 재사용?

**답변**: **Yes — `ForeignKeyRowSelector` 독립 컴포넌트로 분리, 두 곳에서 재사용**

```typescript
// src/components/shared/foreign-key-row-selector.tsx
// Table Editor (FR-TE.6)와 Policy Editor (RLS USING 절 도우미)에서 공유 사용

interface ForeignKeyRowSelectorProps {
  targetTable: string
  targetColumn: string    // 표시할 컬럼 (보통 name/title)
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
}

export function ForeignKeyRowSelector({
  targetTable, targetColumn, value, onChange, placeholder,
}: ForeignKeyRowSelectorProps) {
  // cmdk 기반 팝오버 (기존 패턴 재사용, DQ-2.1 확정)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">{value ?? placeholder ?? '선택...'}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder={`${targetTable} 검색...`} />
          <CommandList>
            <FkRowList table={targetTable} column={targetColumn} onSelect={onChange} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

재사용 위치:
- Table Editor `FkCell` (FR-TE.6 외래키 셀 편집)
- Policy Editor `ExpressionHelper` (USING 절 user_id 선택 도우미)

---

### DQ-3.4 — ERD 레이아웃 저장 스키마

**질문**: 사용자별 ERD 레이아웃 저장 — User 테이블 `preferences JSON` 컬럼 추가 vs 별도 `user_preferences` 테이블?

**답변**: **별도 `user_preferences` 테이블** (§8.2에서 상세 구현)

근거:
- User 테이블 오염 방지 (단일 책임 원칙)
- scope별 독립 RLS 적용 가능
- 향후 `table-editor`, `sql-editor` preference 추가 시 마이그레이션 없이 scope 값만 추가

---

### DQ-3.9 — Trigger 비활성화 토글 UI

**질문**: Trigger 비활성화 토글(`ALTER TABLE x DISABLE TRIGGER y`)을 UI에서 1클릭으로 노출?

**답변**: **Yes + audit log 필수** (§6.4에서 구현)

- UI: TriggerList의 각 행에 토글 스위치 제공
- 토글 클릭 시 확인 dialog("트리거를 비활성화하면 해당 이벤트 시 트리거 함수가 실행되지 않습니다. 계속하시겠습니까?")
- API: `POST /api/database/triggers/[name]/toggle`
- **audit_log 필수**: action = `trigger.enable` 또는 `trigger.disable`, 이유 자동 기록

---

### DQ-3.10 — Function Rename 방식

**질문**: Function rename을 별도 ALTER FUNCTION 분기 처리 vs DROP+CREATE?

**답변**: **ALTER FUNCTION ... RENAME TO 사용** (§6.2에서 구현)

근거:
- `ALTER FUNCTION RENAME`은 OID 유지 → Trigger의 `tgfoid` 참조 보존
- `DROP + CREATE`는 신규 OID 부여 → 기존 Trigger와 FK 뷰가 함수를 참조 불가

---

### DQ-3.11 — Policy 삭제 경고

**질문**: Policy 삭제 시 "이 정책 삭제하면 N개 사용자가 X 테이블에 접근 못할 수 있음" 경고 표시?

**답변**: **Yes, 의존성 분석 구현 — 단, Phase 20에서는 "마지막 허용 정책 여부" 정확 구현, 사용자 수 추산은 Phase 14e 후속 deep-dive**

- Phase 20: 삭제 전 `pg_policies` 쿼리 → 같은 테이블 PERMISSIVE SELECT 정책 수 확인 → 마지막이면 'danger' 경고
- Phase 14e(후속): 역할-사용자 매핑 분석으로 영향 사용자 수 추산 deep-dive 별도 진행
- 구현: §5.3 `DependencyAnalyzer` 참조

---

### DQ-3.12 — RLS 저장 후 ERD 새로고침

**질문**: Phase 14e-3 `/database/policies`의 정책 적용 후 ERD가 자동 새로고침되는가?

**답변**: **Yes — `revalidatePath('/database/schema')` 사용** (§9.3에서 구현)

- Server Action에서 정책 저장 완료 후 `revalidatePath('/database/schema')` 호출
- Next.js 16 App Router가 해당 페이지 캐시를 무효화 → 사용자가 ERD 페이지 재방문 시 최신 정책 상태 반영
- 실시간 자동 갱신(WebSocket)은 Phase 19(Realtime) 완성 후 선택적 추가

---

### DQ-3.15 — 마지막 허용 정책 삭제 경고

**질문**: 정책 삭제 전 "이 정책이 마지막 허용 정책입니까?" 경고 표시?

**답변**: **Yes, Phase 14e-9 구현** (§5.3 `isLastPermissivePolicy` 플래그)

```typescript
// DQ-3.15 구현 요약
if (dependencyResult.isLastPermissivePolicy) {
  // AlertDialog로 강력 경고
  return (
    <AlertDialog>
      <AlertDialogContent className="border-destructive">
        <AlertDialogTitle>⚠️ 접근 차단 경고</AlertDialogTitle>
        <AlertDialogDescription>
          "{policyName}"은 "{tableName}" 테이블의 **마지막 허용(PERMISSIVE) SELECT 정책**입니다.
          이 정책을 삭제하면 모든 사용자가 이 테이블에 접근할 수 없게 됩니다.
          정말 삭제하시겠습니까?
        </AlertDialogDescription>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive"
          onClick={handleDeleteConfirmed}
        >
          삭제 확인
        </AlertDialogAction>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## 11. Phase 20 WBS — Schema Visualizer (~50h)

### 11.1 작업 분해

| Task ID | 작업 내용 | 예상 시간 | 의존 Task | FR 매핑 |
|---------|----------|----------|----------|---------|
| SV-01 | elkjs Worker 분리 + 뷰포트 lazy loading 구현 | 4h | — | FR-3.1 |
| SV-02 | 카디널리티 엣지 레이블 (1:1/1:N/N:N) 추가 | 3h | SV-01 | FR-3.1 |
| SV-03 | 스키마 그룹 노드 (GroupNode) 구현 | 2h | SV-01 | FR-3.1 |
| SV-04 | `user_preferences` 테이블 마이그레이션 작성 | 1h | — | DQ-3.4 |
| SV-05 | ERD 레이아웃 저장/복원 API 구현 | 3h | SV-04 | FR-3.1 |
| SV-06 | SVG/PNG export 기능 추가 | 2h | SV-01 | FR-3.1 |
| SV-07 | schemalint 커스텀 룰 5개 구현 + fixture test | 6h | — | FR-3.4 |
| SV-08 | schemalint CI 통합 (`pnpm lint:schema`) | 2h | SV-07 | FR-3.4 |
| SV-09 | `/database/policies` 페이지 + PolicyTable | 4h | — | FR-3.2 |
| SV-10 | PolicyVisualBuilder 구현 (드롭다운+폼) | 4h | SV-09 | FR-3.2 |
| SV-11 | PolicyRawEditor (Monaco) 구현 | 3h | SV-09 | FR-3.2 |
| SV-12 | `DependencyAnalyzer` 구현 (DQ-3.11, DQ-3.15) | 3h | SV-09 | DQ-3.11 |
| SV-13 | `/database/functions` 페이지 + FunctionList | 3h | — | FR-3.3 |
| SV-14 | FunctionEditor (Monaco) + rename API | 4h | SV-13 | FR-3.3 |
| SV-15 | 함수 버전관리 (SQLite) 구현 | 3h | SV-13 | FR-3.3 |
| SV-16 | `/database/triggers` 페이지 + TriggerToggle | 3h | — | FR-3.3 |
| SV-17 | `ForeignKeyRowSelector` 독립 컴포넌트 분리 | 2h | — | DQ-3.2 |
| SV-18 | 전체 통합 테스트 + audit_log 연결 검증 | 3h | 전체 | — |
| **합계** | | **~55h** | | |

> 50h 목표 대비 55h로 약간 초과. SV-12(의존성 분석)와 SV-18(통합 테스트) 병렬 진행으로 50h 내 달성 가능.

### 11.2 Phase 20 내 우선순위

```
Sprint A (25h): SV-01~08 — ERD Canvas 완성 + schemalint CI
Sprint B (25h): SV-09~18 — 신규 3개 페이지 + 통합
```

### 11.3 목표 점수 달성 경로

| 구간 | 완료 조건 | 예상 점수 |
|------|----------|----------|
| Phase 20 Sprint A 완료 | ERD 100+ 테이블 지원 + schemalint CI | 75점 |
| Phase 20 Sprint B 완료 | 3개 신규 페이지 완성 + DQ 전 답변 | **95점** |

---

## 부록 A. 기술 결정 요약

| 결정 | 선택 | 거부 | 이유 |
|------|------|------|------|
| ERD 라이브러리 | @xyflow/react + elkjs | d3.js 자체 그래프 | elkjs 레이아웃 계산 재사용, 기존 자산 |
| 편집기 | Monaco (SQL) | CodeMirror 6 | SQL Editor와 Monaco 인스턴스 일관성 (DQ-3.5 확정) |
| RLS 편집 UX | 시각 빌더 + 코드 탭 | 둘 중 하나만 | 70% 시나리오(빌더) + 100% 시나리오(raw) |
| Function rename | ALTER FUNCTION RENAME | DROP+CREATE | OID 유지, Trigger 참조 무결성 (DQ-3.10) |
| 레이아웃 저장 | user_preferences 별도 테이블 | User.preferences JSON | RLS 분리, 확장성 (DQ-3.4) |
| 버전 관리 저장소 | SQLite | PostgreSQL | 재생성 가능 데이터, PG 부하 분산 |
| Trigger 토글 | UI 노출 + audit log | 숨김 | 운영 편의 + 감사 추적 (DQ-3.9) |

---

> **Blueprint 끝.** Wave 4 · B6 · Schema Visualizer · 2026-04-18
> 연관 Blueprint: [13-db-ops-blueprint.md](./13-db-ops-blueprint.md) · [14-advisors-blueprint.md](./14-advisors-blueprint.md)
> 총 공수: **~50h** (Phase 20)
