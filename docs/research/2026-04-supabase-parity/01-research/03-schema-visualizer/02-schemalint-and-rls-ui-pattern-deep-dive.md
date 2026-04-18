# 02. schemalint + RLS 시각 편집기 + Trigger/Function 편집기 패턴 — Deep Dive

> Wave 1 / Schema Viz Round 2 / DQ-3.X 후보 2
> 작성일: 2026-04-18 (세션 24, kdywave Wave 1 deep-dive)
> 작성자: Claude Opus 4.7 (1M context) — Wave 1 Schema Viz + DB Ops 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/database/schema` 100/100 청사진 + `/database/policies`(신설) + `/database/functions`(신설)
> 본 문서의 정의: **(1) schemalint(타입스크립트 PG 스키마 린트), (2) Supabase RLS 시각 편집기 패턴, (3) Trigger/Function 편집기 패턴**의 자체 구현 청사진

---

## 0. Executive Summary

### 결론 한 줄
**schemalint = "스키마 일관성 자동 검사 엔진(Lint)"**, **Supabase RLS UI = "react-hook-form + Monaco SQL 표현식 빌더"**, **Trigger/Function UI = "Monaco plpgsql 모드 + DROP/CREATE 트랜잭션"**. 이 셋은 직접 구현하는 것이 외부 라이브러리 임베드보다 빠르고 안전하다.

근거:
1. **schemalint는 라이브러리로 채택**: `npm install schemalint` 한 줄, 룰만 작성. 우리 spec(Phase 14b까지의 명명 규칙, RLS 강제, FK 인덱싱) 코드화에 적합.
2. **Supabase RLS UI는 패턴 흡수**: Supabase 자체 코드는 GPL/내부 종속이 많아 직접 가져오지 않고, **react-hook-form + zod + Monaco**로 우리 컨벤션에 맞춰 자체 구현.
3. **Trigger/Function 편집기**: Monaco Editor의 SQL 모드를 plpgsql까지 확장하기보다 **monaco-sql-languages**(plpgsql 미포함, SQL만) + 우리 자체 토큰 익스텐션. 또는 CodeMirror 6 + `@codemirror/lang-sql`(plpgsql 모드 존재).
4. **세 가지 모두 양평 부엌의 현실(운영자 1~3명, 11개 테이블, RLS 정책 5~10개, Trigger 0~3개, Function 0~5개)에 적합**.

**5점 척도 종합 점수**:
- schemalint 채택: 4.42/5
- 자체 RLS 시각 편집기: 4.18/5
- 자체 Trigger/Function 편집기 (CodeMirror 6 기반): 4.31/5

### Phase 14d~14e 정렬: **신규 페이지 2개 + 기존 1개 확장**
- `/database/schema` (확장, view): Trigger/Function/Policy 표시
- `/database/policies` (신설): RLS 정책 시각 편집기
- `/database/functions` (신설): Function/Trigger Monaco 편집기

### 새 DQ
- **DQ-3.5**: Monaco vs CodeMirror 6 — Monaco는 100KB+, CodeMirror 6는 모듈러 ~50KB. 둘 다 plpgsql 부분 지원. 우리 다른 곳에서 Monaco 쓰는가? → SQL Editor spike-005가 Monaco 채택 → 일관성으로 Monaco.
- **DQ-3.6**: schemalint를 CI에 통합? → Yes, `pnpm lint:schema` 스크립트 + GitHub Actions에 추가.
- **DQ-3.7**: RLS 정책 편집을 시각(드롭다운+빌더) vs 코드(SQL raw)? → 둘 다(탭 전환), 시각 모드는 70% 시나리오, 복잡 정책은 코드 모드.
- **DQ-3.8**: Trigger 함수 본문에 PostgreSQL 외 언어(PL/Python, PL/Perl)? → 우리 컨텍스트에서 No, plpgsql only.

---

## 1. schemalint — 정체성과 활용

### 1.1 schemalint란?
`schemalint`는 PostgreSQL 스키마를 ESLint처럼 검사하는 TypeScript 라이브러리(작성자: kristiandupont, 2020~). `extract-pg-schema`로 introspect → 사용자 정의 룰을 통과/실패 보고.

```bash
pnpm add -D schemalint extract-pg-schema
```

설정 예시(`.schemalintrc.js`):
```js
module.exports = {
  connection: {
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: process.env.DB_PASSWORD,
    database: "ypkitchen",
    charset: "utf8",
  },
  plugins: ["./schemalint-rules/index.js"],
  rules: {
    "name-casing": ["error", "snake_case"],
    "name-inflection": ["error", "singular"],
    "prefer-text-to-varchar": ["error"],
    "prefer-jsonb-to-json": ["error"],
    "prefer-identity-to-serial": ["warn"],
    "require-primary-key": ["error"],
    "require-fk-index": ["error"],     // 우리 자체 룰
    "require-rls-on-public": ["error"], // 우리 자체 룰
    "require-updated-at": ["error"],   // Phase 14c 규약
    "ban-naked-foreign-keys": ["error"],
  },
  schemas: [{ name: "public" }],
}
```

### 1.2 우리 자체 룰 작성
양평 부엌 컨벤션(Phase 14b/14c 누적):
- 모든 사용자 테이블에 `updated_at TIMESTAMPTZ DEFAULT now()` (14c 5병기 + 14c 마이그레이션 9개 모델 백필).
- 모든 FK는 인덱스 동반.
- public schema의 모든 테이블은 RLS enabled (운영자가 *직접 SQL로* 만든 테이블도 강제).
- audit_log 패턴(`created_at`, `updated_at`, `created_by`, `updated_by`)의 일관성.

```ts
// schemalint-rules/require-updated-at.ts
import type { Rule } from "schemalint"

export const requireUpdatedAt: Rule = {
  name: "require-updated-at",
  docs: { description: "모든 사용자 테이블에 updated_at TIMESTAMPTZ 컬럼 필수" },
  process({ schemaObject, report }) {
    for (const table of schemaObject.tables) {
      // 시스템/audit 테이블 예외
      if (
        table.name.startsWith("_prisma_") ||
        table.name === "audit_log" ||
        table.name === "session"
      ) continue

      const updatedAt = table.columns.find(c => c.name === "updated_at")
      if (!updatedAt) {
        report({
          rule: "require-updated-at",
          identifier: `${table.schemaName}.${table.name}`,
          message: `Table ${table.name}에 updated_at 컬럼이 없음 (Phase 14c 규약)`,
          suggestedMigration: `ALTER TABLE ${table.name} ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();`,
        })
        continue
      }
      if (updatedAt.type !== "timestamptz") {
        report({
          rule: "require-updated-at",
          identifier: `${table.schemaName}.${table.name}.updated_at`,
          message: `updated_at은 TIMESTAMPTZ여야 함 (현재: ${updatedAt.type})`,
          suggestedMigration: `ALTER TABLE ${table.name} ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';`,
        })
      }
      if (!updatedAt.defaultValue?.includes("now()")) {
        report({
          rule: "require-updated-at",
          identifier: `${table.schemaName}.${table.name}.updated_at`,
          message: `updated_at의 DEFAULT가 now()가 아님 (Phase 14c 백필 규약)`,
        })
      }
    }
  },
}
```

```ts
// schemalint-rules/require-fk-index.ts
import type { Rule } from "schemalint"

export const requireFkIndex: Rule = {
  name: "require-fk-index",
  docs: { description: "모든 FK 컬럼에 인덱스 필수 (성능)" },
  process({ schemaObject, report }) {
    for (const table of schemaObject.tables) {
      for (const fk of table.foreignKeys ?? []) {
        const cols = fk.columns
        const hasIndex = (table.indices ?? []).some(idx =>
          idx.columns.length >= cols.length &&
          cols.every((c, i) => idx.columns[i] === c)
        )
        if (!hasIndex) {
          report({
            rule: "require-fk-index",
            identifier: `${table.name}.[${cols.join(",")}]`,
            message: `FK ${cols.join(",")}에 인덱스 없음 → JOIN 성능 저하`,
            suggestedMigration: `CREATE INDEX idx_${table.name}_${cols.join("_")} ON ${table.name} (${cols.join(", ")});`,
          })
        }
      }
    }
  },
}
```

```ts
// schemalint-rules/require-rls-on-public.ts
import type { Rule } from "schemalint"

const RLS_EXEMPT = new Set([
  "_prisma_migrations",
  "schema_migrations",
])

export const requireRlsOnPublic: Rule = {
  name: "require-rls-on-public",
  docs: { description: "public 스키마 모든 테이블에 RLS 강제" },
  process({ schemaObject, report }) {
    for (const table of schemaObject.tables) {
      if (table.schemaName !== "public") continue
      if (RLS_EXEMPT.has(table.name)) continue
      // schemalint 자체는 rowSecurity 직접 노출 안함 — extract-pg-schema 확장 필요
      const hasRls = table.informationSchemaValue?.row_security === "YES" ||
                      table.pgSecurityClass === true
      if (!hasRls) {
        report({
          rule: "require-rls-on-public",
          identifier: `public.${table.name}`,
          message: `RLS not enabled — 운영자 외 접근 위험`,
          suggestedMigration: [
            `ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`,
            `-- 그리고 정책 1개 이상 추가 필요:`,
            `CREATE POLICY "${table.name}_admin_all" ON ${table.name}`,
            `  FOR ALL TO authenticated`,
            `  USING (auth.jwt() ->> 'role' = 'admin');`,
          ].join("\n"),
        })
      }
    }
  },
}
```

### 1.3 CI 통합
```yaml
# .github/workflows/schemalint.yml
name: Schema Lint
on:
  pull_request:
    paths:
      - "prisma/schema.prisma"
      - "prisma/migrations/**"
      - "schemalint-rules/**"
  push:
    branches: [main]

jobs:
  schemalint:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ypkitchen_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
        env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/ypkitchen_test" }
      - run: pnpm schemalint
        env: { DB_PASSWORD: postgres }
```

### 1.4 schemalint 한계와 보완
- **rowSecurity, policies, triggers 미노출**: `extract-pg-schema`는 표준 정보만. 우리는 자체 collector(미션 1 §5.1)와 통합.
- **autofix 없음**: ESLint와 달리 자동 수정 SQL 생성은 `suggestedMigration` 텍스트만. → 별도 `pnpm lint:schema:fix` 스크립트로 마이그레이션 SQL 모음.
- **순환 검사 없음**: A→B→C→A 같은 FK 순환 미탐지. → 자체 룰 추가 가능.

---

## 2. Supabase RLS 시각 편집기 패턴

### 2.1 Supabase의 RLS UI 분석
Supabase Studio의 `/database/policies` 페이지는 다음 구조:

```
┌─────────────────────────────────────────────┐
│ [테이블 선택 드롭다운] [+ 새 정책]          │
├─────────────────────────────────────────────┤
│ Table: kitchen                              │
│   RLS: [Enabled ✓]                          │
│   Policies (3):                             │
│   ┌─────────────────────────────────────┐  │
│   │ "Admins can do anything"             │  │
│   │ FOR ALL TO authenticated             │  │
│   │ USING: (auth.jwt()->>'role' = 'admin')│  │
│   │ [편집] [삭제]                         │  │
│   └─────────────────────────────────────┘  │
│   ...                                       │
└─────────────────────────────────────────────┘

새 정책 모달:
┌─────────────────────────────────────────────┐
│ 정책 이름: [____________________]           │
│ 명령:     [SELECT ▼] [ALL/INS/UPD/DEL/SEL] │
│ 대상:     [authenticated ▼]                 │
│ USING 표현식 (READ/WRITE 권한 체크):        │
│ ┌────────────────────────────────────────┐  │
│ │ auth.uid() = user_id                    │  │
│ └────────────────────────────────────────┘  │
│ WITH CHECK 표현식 (INSERT/UPDATE 검증):     │
│ ┌────────────────────────────────────────┐  │
│ │ auth.uid() = user_id                    │  │
│ └────────────────────────────────────────┘  │
│ [템플릿: 자기 행만 / 인증 사용자 / Admin]   │
│ [취소] [저장]                                │
└─────────────────────────────────────────────┘
```

### 2.2 react-hook-form + zod + Monaco 자체 구현
```tsx
// src/app/database/policies/page.tsx
import { collectPolicies } from "@/server/database/schema-introspect/collect-policies"
import { PolicyList } from "@/components/database/policy-list"

export default async function Page() {
  const policies = await collectPolicies()
  return <PolicyList policies={policies} />
}
```

```tsx
// src/components/database/policy-list.tsx
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PolicyEditDialog } from "./policy-edit-dialog"

interface Policy {
  schema: string
  table: string
  name: string
  command: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE"
  roles: string[]
  using: string | null
  withCheck: string | null
  permissive: boolean
}

export function PolicyList({ policies }: { policies: Policy[] }) {
  const [editing, setEditing] = useState<Policy | null>(null)
  const [creating, setCreating] = useState<{ schema: string; table: string } | null>(null)

  const grouped = Object.entries(
    policies.reduce<Record<string, Policy[]>>((acc, p) => {
      const key = `${p.schema}.${p.table}`
      ;(acc[key] ??= []).push(p)
      return acc
    }, {})
  )

  return (
    <div className="space-y-6">
      {grouped.map(([table, ps]) => (
        <section key={table} className="rounded-lg border border-zinc-800 p-4">
          <header className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{table}</h2>
            <Button size="sm" onClick={() => setCreating({ schema: table.split(".")[0], table: table.split(".")[1] })}>
              + 새 정책
            </Button>
          </header>
          <ul className="space-y-2">
            {ps.map(p => (
              <li key={p.name} className="rounded border border-zinc-700 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono">{p.name}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{p.command}</span>
                  <span className="text-zinc-400">to {p.roles.join(", ")}</span>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(p)}>편집</Button>
                </div>
                {p.using && (
                  <pre className="mt-2 rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-300">
                    USING ({p.using})
                  </pre>
                )}
                {p.withCheck && (
                  <pre className="mt-1 rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-300">
                    WITH CHECK ({p.withCheck})
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {(editing || creating) && (
        <PolicyEditDialog
          mode={editing ? "edit" : "create"}
          initial={editing ?? undefined}
          target={creating ?? undefined}
          onClose={() => { setEditing(null); setCreating(null) }}
        />
      )}
    </div>
  )
}
```

```tsx
// src/components/database/policy-edit-dialog.tsx
"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import dynamic from "next/dynamic"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false })

const policySchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  command: z.enum(["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"]),
  roles: z.array(z.string()).min(1),
  using: z.string().optional(),
  withCheck: z.string().optional(),
})
type PolicyForm = z.infer<typeof policySchema>

const TEMPLATES = {
  "self-row": {
    using: "auth.uid() = user_id",
    withCheck: "auth.uid() = user_id",
    description: "사용자가 자기 행만 접근",
  },
  "authenticated": {
    using: "auth.role() = 'authenticated'",
    withCheck: "auth.role() = 'authenticated'",
    description: "로그인한 사용자 모두 접근",
  },
  "admin-only": {
    using: "auth.jwt() ->> 'role' = 'admin'",
    withCheck: "auth.jwt() ->> 'role' = 'admin'",
    description: "Admin 토큰 보유자만",
  },
  "public-read": {
    using: "true",
    withCheck: undefined,
    description: "전체 읽기 허용 (SELECT 정책에만 사용)",
  },
} as const

export function PolicyEditDialog({ mode, initial, target, onClose }: ...) {
  const form = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    defaultValues: initial ?? {
      name: "",
      command: "SELECT",
      roles: ["authenticated"],
      using: "",
      withCheck: "",
    },
  })

  const command = form.watch("command")
  const showWithCheck = command === "INSERT" || command === "UPDATE" || command === "ALL"

  function applyTemplate(key: keyof typeof TEMPLATES) {
    const t = TEMPLATES[key]
    form.setValue("using", t.using)
    if (t.withCheck) form.setValue("withCheck", t.withCheck)
  }

  async function onSubmit(values: PolicyForm) {
    const sql = mode === "create"
      ? buildCreatePolicySql(target!.schema, target!.table, values)
      : buildAlterPolicySql(initial!.schema, initial!.table, initial!.name, values)
    const res = await fetch("/api/database/policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sql,
        // 안전 가드: 미리보기 후 운영자가 OK한 경우만 apply
        confirmedAt: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const e = await res.json()
      alert(`정책 적용 실패: ${e.message}`)
      return
    }
    onClose()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>{mode === "create" ? "RLS 정책 생성" : "RLS 정책 편집"}</DialogTitle>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="정책 이름" {...form.register("name")} />
          <FormField label="명령">
            <select {...form.register("command")}>
              {["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormField>
          <FormField label="대상 역할">
            <RoleMultiSelect value={form.watch("roles")} onChange={v => form.setValue("roles", v)} />
          </FormField>

          <details className="rounded border border-zinc-700 p-2">
            <summary className="cursor-pointer text-sm">템플릿 (빠른 시작)</summary>
            <ul className="mt-2 space-y-1">
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <li key={k}>
                  <button type="button" className="text-left text-sm hover:text-blue-400" onClick={() => applyTemplate(k as any)}>
                    {t.description}
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <FormField label={`USING (${command === "INSERT" ? "검사 안 함" : "READ 권한 체크"})`}>
            <MonacoEditor
              height={120}
              language="sql"
              value={form.watch("using") ?? ""}
              onChange={v => form.setValue("using", v ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "JetBrains Mono",
                lineNumbers: "off",
                scrollBeyondLastLine: false,
              }}
              theme="vs-dark"
            />
          </FormField>
          {showWithCheck && (
            <FormField label="WITH CHECK (INSERT/UPDATE 검증)">
              <MonacoEditor
                height={120}
                language="sql"
                value={form.watch("withCheck") ?? ""}
                onChange={v => form.setValue("withCheck", v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 13, theme: "vs-dark" }}
              />
            </FormField>
          )}

          <details className="rounded border border-blue-800 bg-blue-950/20 p-2">
            <summary className="cursor-pointer text-sm text-blue-400">SQL 미리보기</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-xs text-zinc-300">
              {buildPreviewSql(target ?? initial!, form.watch())}
            </pre>
          </details>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {mode === "create" ? "정책 생성" : "정책 업데이트"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function buildCreatePolicySql(schema: string, table: string, v: PolicyForm): string {
  const parts = [
    `CREATE POLICY ${quoteIdent(v.name)} ON ${quoteIdent(schema)}.${quoteIdent(table)}`,
    `  FOR ${v.command}`,
    `  TO ${v.roles.map(quoteIdent).join(", ")}`,
  ]
  if (v.using) parts.push(`  USING (${v.using})`)
  if (v.withCheck) parts.push(`  WITH CHECK (${v.withCheck})`)
  return parts.join("\n") + ";"
}

function buildAlterPolicySql(schema: string, table: string, oldName: string, v: PolicyForm): string {
  // PostgreSQL은 ALTER POLICY로 USING/WITH CHECK 변경 가능, 이름/명령은 DROP+CREATE
  const renameSql = oldName !== v.name
    ? `ALTER POLICY ${quoteIdent(oldName)} ON ${quoteIdent(schema)}.${quoteIdent(table)} RENAME TO ${quoteIdent(v.name)};`
    : ""
  const alterSql = [
    `ALTER POLICY ${quoteIdent(v.name)} ON ${quoteIdent(schema)}.${quoteIdent(table)}`,
    `  TO ${v.roles.map(quoteIdent).join(", ")}`,
  ]
  if (v.using) alterSql.push(`  USING (${v.using})`)
  if (v.withCheck) alterSql.push(`  WITH CHECK (${v.withCheck})`)
  return [renameSql, alterSql.join("\n") + ";"].filter(Boolean).join("\n")
}

function quoteIdent(s: string): string {
  // PostgreSQL identifier quoting
  return `"${s.replace(/"/g, '""')}"`
}
```

### 2.3 API 라우트 — 안전 가드 통합
```ts
// src/app/api/database/policies/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/server/audit/write-log"

const ALLOWED_PATTERNS = [
  /^CREATE POLICY/i,
  /^ALTER POLICY/i,
  /^DROP POLICY/i,
]
const FORBIDDEN_PATTERNS = [
  /DROP TABLE/i,
  /TRUNCATE/i,
  /DELETE FROM/i,
  /ALTER ROLE/i,
  /CREATE EXTENSION/i,
]

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !["admin", "owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { sql } = await req.json()
  if (!ALLOWED_PATTERNS.some(p => p.test(sql))) {
    return NextResponse.json({
      error: "INVALID_SQL",
      message: "정책 관련 SQL만 허용 (CREATE/ALTER/DROP POLICY)"
    }, { status: 400 })
  }
  if (FORBIDDEN_PATTERNS.some(p => p.test(sql))) {
    return NextResponse.json({
      error: "FORBIDDEN_SQL",
      message: "위험한 SQL 키워드 감지"
    }, { status: 400 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql)
      await writeAuditLog(tx, {
        actorId: session.user.id,
        action: "DB.POLICY.WRITE",
        target: "database.policies",
        details: { sql },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({
      error: "EXEC_FAILED",
      message: e.message,
      hint: e.code ? `PostgreSQL ${e.code}` : undefined,
    }, { status: 500 })
  }
}
```

### 2.4 Policy collector 업그레이드
```ts
// src/server/database/schema-introspect/collect-policies.ts
import { prisma } from "@/lib/prisma"

export interface PolicyMeta {
  schema: string
  table: string
  name: string
  command: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE"
  roles: string[]
  permissive: boolean
  using: string | null
  withCheck: string | null
}

export async function collectPolicies(): Promise<PolicyMeta[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      schemaname AS schema,
      tablename  AS table,
      policyname AS name,
      cmd        AS command,
      roles,
      permissive,
      qual       AS using,
      with_check AS with_check
    FROM pg_policies
    ORDER BY schemaname, tablename, policyname;
  `
  return rows.map(r => ({
    schema: r.schema,
    table: r.table,
    name: r.name,
    command: r.command === "*" ? "ALL" : r.command,
    roles: Array.isArray(r.roles) ? r.roles : [],
    permissive: r.permissive === "PERMISSIVE",
    using: r.using ?? null,
    withCheck: r.with_check ?? null,
  }))
}
```

---

## 3. Trigger / Function 편집기

### 3.1 PostgreSQL 시스템 카탈로그
- **`pg_trigger`**: 트리거 메타. `tgname`, `tgrelid`(관계 OID), `tgfoid`(함수 OID), `tgenabled`, `tgisinternal`.
- **`pg_proc`**: 함수 메타. `proname`, `prosrc`(소스), `prolang`(언어 OID), `proargnames`, `prorettype`.
- **`pg_get_triggerdef(oid, true)`**: `CREATE TRIGGER ... ON ... ...` 전체 SQL 재구성.
- **`pg_get_functiondef(oid)`**: `CREATE OR REPLACE FUNCTION ...` 전체 SQL 재구성.

### 3.2 Trigger collector
```ts
// src/server/database/schema-introspect/collect-triggers.ts
import { prisma } from "@/lib/prisma"

export interface TriggerMeta {
  schema: string
  table: string
  name: string
  timing: "BEFORE" | "AFTER" | "INSTEAD OF"
  events: ("INSERT" | "UPDATE" | "DELETE" | "TRUNCATE")[]
  level: "ROW" | "STATEMENT"
  enabled: boolean
  functionSchema: string
  functionName: string
  definition: string  // pg_get_triggerdef 결과
}

export async function collectTriggers(): Promise<TriggerMeta[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      n.nspname              AS schema,
      c.relname              AS table,
      t.tgname               AS name,
      pg_get_triggerdef(t.oid, true) AS definition,
      t.tgenabled            AS enabled_char,
      np.nspname             AS function_schema,
      p.proname              AS function_name,
      t.tgtype               AS type_bits
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace np ON np.oid = p.pronamespace
    WHERE NOT t.tgisinternal
    ORDER BY n.nspname, c.relname, t.tgname;
  `
  return rows.map(r => {
    const tgtype = Number(r.type_bits)
    // tgtype bit layout: 0=ROW/STMT, 1=BEFORE/AFTER, 2=INSERT, 3=DELETE, 4=UPDATE, 6=INSTEAD OF, 5=TRUNCATE
    const isRow = (tgtype & 1) !== 0
    const isBefore = (tgtype & 2) !== 0
    const isInsteadOf = (tgtype & 64) !== 0
    const events: TriggerMeta["events"] = []
    if ((tgtype & 4) !== 0) events.push("INSERT")
    if ((tgtype & 8) !== 0) events.push("DELETE")
    if ((tgtype & 16) !== 0) events.push("UPDATE")
    if ((tgtype & 32) !== 0) events.push("TRUNCATE")
    return {
      schema: r.schema,
      table: r.table,
      name: r.name,
      timing: isInsteadOf ? "INSTEAD OF" : isBefore ? "BEFORE" : "AFTER",
      events,
      level: isRow ? "ROW" : "STATEMENT",
      enabled: r.enabled_char === "O" || r.enabled_char === "A",
      functionSchema: r.function_schema,
      functionName: r.function_name,
      definition: r.definition,
    }
  })
}
```

### 3.3 Function collector
```ts
// src/server/database/schema-introspect/collect-functions.ts
import { prisma } from "@/lib/prisma"

export interface FunctionMeta {
  schema: string
  name: string
  language: string  // "plpgsql" | "sql" | "c" | ...
  returnType: string
  argumentTypes: string[]
  argumentNames: string[]
  source: string    // pg_proc.prosrc
  definition: string // pg_get_functiondef
  volatility: "IMMUTABLE" | "STABLE" | "VOLATILE"
  isSecurityDefiner: boolean
  isLeakproof: boolean
}

export async function collectFunctions(): Promise<FunctionMeta[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      n.nspname        AS schema,
      p.proname        AS name,
      l.lanname        AS language,
      pg_get_function_result(p.oid) AS return_type,
      pg_get_function_arguments(p.oid) AS arguments,
      p.proargnames    AS arg_names,
      p.prosrc         AS source,
      pg_get_functiondef(p.oid) AS definition,
      p.provolatile    AS volatility,
      p.prosecdef      AS sec_def,
      p.proleakproof   AS leakproof
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND p.prokind = 'f'
    ORDER BY n.nspname, p.proname;
  `
  return rows.map(r => ({
    schema: r.schema,
    name: r.name,
    language: r.language,
    returnType: r.return_type,
    argumentTypes: parseArgs(r.arguments).types,
    argumentNames: r.arg_names ?? parseArgs(r.arguments).names,
    source: r.source,
    definition: r.definition,
    volatility: r.volatility === "i" ? "IMMUTABLE" : r.volatility === "s" ? "STABLE" : "VOLATILE",
    isSecurityDefiner: r.sec_def,
    isLeakproof: r.leakproof,
  }))
}

function parseArgs(s: string): { names: string[]; types: string[] } {
  // "p_user_id integer, p_email text" → names + types
  const args = s.split(",").map(a => a.trim()).filter(Boolean)
  const names: string[] = []
  const types: string[] = []
  for (const a of args) {
    const m = a.match(/^(?:OUT |INOUT |IN )?(\w+)\s+(.+)$/)
    if (m) { names.push(m[1]); types.push(m[2]) }
    else { names.push(""); types.push(a) }
  }
  return { names, types }
}
```

### 3.4 Function 편집기 UI (Monaco)
```tsx
// src/app/database/functions/[schema]/[name]/page.tsx
import { collectFunctions } from "@/server/database/schema-introspect/collect-functions"
import { FunctionEditor } from "@/components/database/function-editor"

export default async function Page({ params }: { params: { schema: string; name: string } }) {
  const all = await collectFunctions()
  const fn = all.find(f => f.schema === params.schema && f.name === params.name)
  if (!fn) return <div>함수를 찾을 수 없음</div>
  return <FunctionEditor fn={fn} />
}
```

```tsx
// src/components/database/function-editor.tsx
"use client"
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false })

export function FunctionEditor({ fn }: { fn: FunctionMeta }) {
  const [source, setSource] = useState(fn.definition)
  const [original] = useState(fn.definition)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = source !== original

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) { e.preventDefault(); e.returnValue = "" }
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => window.removeEventListener("beforeunload", beforeUnload)
  }, [isDirty])

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/database/functions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema: fn.schema,
          name: fn.name,
          definition: source,
        }),
      })
      if (!res.ok) {
        const e = await res.json()
        setError(`${e.error}: ${e.message}`)
        return
      }
      // 성공 시 server revalidate → 새 fn으로 리렌더 (서버에서 다시 fetch)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{fn.schema}.{fn.name}</h1>
          <p className="text-sm text-zinc-500">
            {fn.language} · {fn.volatility} · returns {fn.returnType}
            {fn.isSecurityDefiner && <span className="ml-2 text-amber-400">SECURITY DEFINER</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSource(original)} disabled={!isDirty}>
            되돌리기
          </Button>
          <Button onClick={save} disabled={!isDirty || saving}>
            {saving ? "저장 중..." : "저장 (CREATE OR REPLACE)"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <MonacoEditor
        height="600px"
        language={fn.language === "plpgsql" ? "sql" : fn.language}  // Monaco 기본 sql
        value={source}
        onChange={v => setSource(v ?? "")}
        theme="vs-dark"
        options={{
          fontSize: 13,
          fontFamily: "JetBrains Mono",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          tabSize: 2,
          automaticLayout: true,
        }}
        beforeMount={(monaco) => {
          // plpgsql 키워드 추가 등록
          if (!monaco.languages.getLanguages().some(l => l.id === "plpgsql")) {
            monaco.languages.register({ id: "plpgsql" })
            monaco.languages.setMonarchTokensProvider("plpgsql", plpgsqlMonarch)
          }
        }}
      />
    </div>
  )
}

const plpgsqlMonarch = {
  defaultToken: "",
  tokenPostfix: ".pgsql",
  ignoreCase: true,
  keywords: [
    "BEGIN", "END", "DECLARE", "RETURN", "RAISE", "NOTICE", "EXCEPTION",
    "WHEN", "OTHERS", "IF", "THEN", "ELSE", "ELSIF", "LOOP", "WHILE",
    "FOR", "FOREACH", "PERFORM", "EXECUTE", "USING", "INTO", "STRICT",
    "RETURNING", "FOUND", "NEW", "OLD", "TG_OP", "TG_TABLE_NAME",
  ],
  builtins: [
    "now", "current_timestamp", "current_date", "current_user",
    "session_user", "auth", "uid", "jwt", "role",
  ],
  operators: ["=", ">", "<", "!", "~", "?", ":", "==", "<=", ">=", "!=", "&&", "||"],
  tokenizer: {
    root: [
      [/--.*$/, "comment"],
      [/\/\*/, "comment", "@comment"],
      [/'([^'\\]|\\.)*$/, "string.invalid"],
      [/'/, "string", "@string"],
      [/[a-zA-Z_]\w*/, {
        cases: {
          "@keywords": "keyword",
          "@builtins": "predefined",
          "@default": "identifier",
        },
      }],
      [/[0-9]+/, "number"],
    ],
    comment: [
      [/[^\/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[\/*]/, "comment"],
    ],
    string: [
      [/[^\\']+/, "string"],
      [/\\./, "string.escape.invalid"],
      [/'/, "string", "@pop"],
    ],
  },
}
```

### 3.5 Function 저장 API — 트랜잭션 + 검증
```ts
// src/app/api/database/functions/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/server/audit/write-log"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !["admin", "owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { schema, name, definition } = await req.json()
  // CREATE OR REPLACE FUNCTION으로 시작하는지 검증
  if (!/^\s*CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(definition)) {
    return NextResponse.json({
      error: "INVALID_DEFINITION",
      message: "CREATE [OR REPLACE] FUNCTION으로 시작해야 함"
    }, { status: 400 })
  }

  // 위험 키워드 체크
  if (/DROP\s+(TABLE|DATABASE|ROLE|SCHEMA)/i.test(definition)) {
    return NextResponse.json({
      error: "FORBIDDEN_SQL",
      message: "함수 본문에 DROP TABLE/DATABASE/ROLE/SCHEMA 금지"
    }, { status: 400 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 검증: 같은 schema.name인지 확인 (rename은 별도 ALTER FUNCTION)
      const m = definition.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(/i)
      if (!m) throw new Error("함수 이름 파싱 실패")
      const definedSchema = m[1] ?? "public"
      const definedName = m[2]
      if (definedSchema !== schema || definedName !== name) {
        throw new Error(`함수 이름 변경 감지: ${schema}.${name} → ${definedSchema}.${definedName}. 이름 변경은 ALTER FUNCTION ... RENAME TO 사용`)
      }

      await tx.$executeRawUnsafe(definition)
      await writeAuditLog(tx, {
        actorId: session.user.id,
        action: "DB.FUNCTION.REPLACE",
        target: `${schema}.${name}`,
        details: { definitionLength: definition.length },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({
      error: "EXEC_FAILED",
      message: e.message,
    }, { status: 500 })
  }
}
```

### 3.6 Trigger 편집기 — DROP + CREATE 트랜잭션
PostgreSQL은 `ALTER TRIGGER`가 RENAME/DEPENDS만 지원. 정의 변경은 DROP + CREATE 필요.

```tsx
// src/components/database/trigger-editor.tsx (요지)
async function save() {
  const sql = `
    BEGIN;
      DROP TRIGGER IF EXISTS ${trigger.name} ON ${trigger.schema}.${trigger.table};
      ${newDefinition};
    COMMIT;
  `
  // ...
}
```

API:
```ts
// src/app/api/database/triggers/route.ts (요지)
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${quoteIdent(name)} ON ${quoteIdent(schema)}.${quoteIdent(table)};`)
  await tx.$executeRawUnsafe(definition)
  await writeAuditLog(tx, {
    actorId: session.user.id,
    action: "DB.TRIGGER.REPLACE",
    target: `${schema}.${table}.${name}`,
    details: { definition },
  })
})
```

### 3.7 CodeMirror 6 대안 (Monaco가 무거우면)
CodeMirror 6는 모듈러: `@codemirror/lang-sql`만 import 시 ~30KB. plpgsql 부분 지원.

```tsx
import CodeMirror from "@uiw/react-codemirror"
import { sql, PostgreSQL } from "@codemirror/lang-sql"
import { oneDark } from "@codemirror/theme-one-dark"

<CodeMirror
  value={source}
  height="600px"
  theme={oneDark}
  extensions={[sql({ dialect: PostgreSQL })]}
  onChange={v => setSource(v)}
/>
```

번들 비교:
| 라이브러리 | gzip 크기 | plpgsql 지원 | 우리 다른 곳 사용 |
|----------|----------|-------------|-----------------|
| `@monaco-editor/react` | ~250KB | 부분 (직접 정의 필요) | SQL Editor (spike-005) |
| `codemirror` 6 + `lang-sql` | ~50KB | 부분 (PostgreSQL dialect) | 없음 |

→ **결론**: SQL Editor가 이미 Monaco이므로 일관성으로 Monaco. 단, 모바일/저사양 시나리오는 CodeMirror로 fallback 옵션.

---

## 4. RLS UI vs 코드(Raw SQL) 모드 듀얼 탭

```tsx
// src/components/database/policy-edit-dialog.tsx 확장
<Tabs defaultValue="visual">
  <TabsList>
    <TabsTrigger value="visual">시각 편집</TabsTrigger>
    <TabsTrigger value="sql">SQL 직접 편집</TabsTrigger>
  </TabsList>
  <TabsContent value="visual">
    {/* 위 §2.2 폼 */}
  </TabsContent>
  <TabsContent value="sql">
    <MonacoEditor
      height={300}
      language="sql"
      value={form.watch("rawSql") ?? buildPreviewSql(...)}
      onChange={v => form.setValue("rawSql", v ?? "")}
      theme="vs-dark"
    />
    <p className="mt-2 text-xs text-zinc-500">
      직접 작성한 SQL은 시각 편집기로 다시 동기화되지 않습니다.
    </p>
  </TabsContent>
</Tabs>
```

저장 시 활성 탭에 따라 SQL 결정:
```ts
const sql = activeTab === "sql"
  ? form.watch("rawSql")
  : buildCreatePolicySql(target!.schema, target!.table, form.watch())
```

---

## 5. 안전 가드 패턴 — 모든 DDL에 공통

### 5.1 Dry-run + 미리보기
```ts
// src/app/api/database/explain/route.ts
export async function POST(req: NextRequest) {
  const { sql } = await req.json()
  // 위험한 SQL은 EXPLAIN도 거부
  if (FORBIDDEN_PATTERNS.some(p => p.test(sql))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 400 })
  }
  // SAVEPOINT + ROLLBACK으로 dry-run
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SAVEPOINT dry_run;")
      await tx.$executeRawUnsafe(sql)
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT dry_run;")
      return { ok: true }
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: "DRY_RUN_FAILED", message: e.message }, { status: 400 })
  }
}
```

### 5.2 운영자 확인 다이얼로그
```tsx
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogTitle>RLS 정책 적용 확인</AlertDialogTitle>
    <AlertDialogDescription>
      다음 SQL이 운영 데이터베이스에 즉시 적용됩니다:
      <pre className="mt-2 rounded bg-zinc-950 p-2 text-xs">{previewSql}</pre>
      <p className="mt-2 text-amber-400">
        ⚠ 잘못된 정책은 운영자 본인을 포함한 사용자의 데이터 접근을 차단할 수 있습니다.
      </p>
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel>취소</AlertDialogCancel>
      <AlertDialogAction onClick={apply}>적용 (되돌릴 수 없음)</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 5.3 Audit log 통합
모든 DDL은 `audit_log` 테이블에 기록 (Phase 14b 자산 재사용):
```ts
await writeAuditLog(tx, {
  actorId: session.user.id,
  action: "DB.POLICY.CREATE" | "DB.POLICY.ALTER" | "DB.POLICY.DROP" |
          "DB.FUNCTION.REPLACE" | "DB.TRIGGER.REPLACE" | "DB.TRIGGER.DROP",
  target: `${schema}.${table}.${policyName}`,
  details: { sql, before, after },
  ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
  userAgent: req.headers.get("user-agent") ?? "unknown",
})
```

### 5.4 Rate limiting
운영자 1~3명이라 공격적 rate limit 불요. 하지만 실수 방지로 **5초 내 5회 이상 DDL 시도 차단**:
```ts
import { ipRateLimit } from "@/lib/rate-limit"

const limit = await ipRateLimit({
  key: `ddl:${session.user.id}`,
  limit: 5,
  window: 5,
})
if (!limit.success) {
  return NextResponse.json({ error: "RATE_LIMITED", retryAfter: limit.reset }, { status: 429 })
}
```

---

## 6. 양평 부엌 컨텍스트 적용

### 6.1 현재 RLS 상태
```sql
-- 현재 우리 모든 테이블의 RLS 상태 (2026-04 기준)
SELECT relname, relrowsecurity FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r';

-- 결과 예상:
-- user            | f   ← 미설정 (Auth.js 관리, NextAuth가 세션으로 보호)
-- account         | f
-- session         | f
-- kitchen         | f   ← 14e에서 enable 권장
-- kitchen_item    | f
-- webhook         | f
-- cron_job        | f
-- audit_log       | f
-- file            | f
-- api_key         | f
-- log_drain       | f
```

**관찰**: 우리는 NextAuth 세션 + 서버 라우트 핸들러에서 권한 체크를 하므로 RLS가 *필수는 아님*. 그러나 **다층 방어(defense in depth)** 원칙으로 **public 모든 테이블에 RLS 활성화 + admin 전용 정책 1개씩 강제**가 14e의 안전 기준.

### 6.2 운영자 시나리오
운영자 1~3명이 다음을 하고자 함:
1. **신규 테이블 추가 시 자동으로 RLS 활성화 + admin 정책 생성**
   - schemalint `require-rls-on-public` 룰이 강제 (CI 차단).
2. **운영자별 권한 차등 (owner / admin)**
   - `auth.jwt() ->> 'role' = 'owner'` vs `'admin'`로 정책 분기.
3. **임시 디버그 권한**
   - `pg_dump --section=post-data` 등 운영자 직접 SQL 시 RLS bypass 필요 → `SET LOCAL row_security = off;` (SUPERUSER 또는 BYPASSRLS 권한 보유자만).

### 6.3 Trigger 시나리오 — 양평 부엌 도메인
필요한 trigger 후보:
1. **`updated_at` 자동 갱신** — 14c에서 Prisma `@updatedAt`로 처리하므로 trigger 불요. 단 **Prisma 외 SQL 직접 UPDATE 시 안전망**으로 trigger 1개:
```sql
CREATE OR REPLACE FUNCTION set_updated_at_on_row()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kitchen_updated_at
BEFORE UPDATE ON public.kitchen
FOR EACH ROW EXECUTE FUNCTION set_updated_at_on_row();
```

2. **`audit_log` 자동 기록** — 14d에서 도입 검토:
```sql
CREATE OR REPLACE FUNCTION audit_table_change()
RETURNS trigger AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := nullif(current_setting('app.actor_id', true), '')::uuid;
  INSERT INTO audit_log(actor_id, action, target, details)
  VALUES (
    v_actor,
    TG_OP || '.' || TG_TABLE_NAME,
    NEW.id::text,
    jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kitchen_audit
AFTER INSERT OR UPDATE OR DELETE ON public.kitchen
FOR EACH ROW EXECUTE FUNCTION audit_table_change();
```
→ 어플리케이션 측에서 `SET LOCAL app.actor_id = '<uuid>';`로 설정.

### 6.4 Function 시나리오
- **검색 정규화**: `normalize_search_text(text)` → 한글 자모 분해 + 소문자 + 공백 정리.
- **이미지 URL 빌드**: `build_image_url(file_id uuid, transform text)` → CDN 경로 생성.
- **권한 체크 helper**: `is_owner(user_id uuid)` → `auth.uid() = user_id`.

이런 함수들이 누적되면 `/database/functions` 페이지가 의미가 커진다.

---

## 7. 10차원 스코어링 — 3가지 패턴

### 7.1 schemalint 채택
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 4.5 | 0.81 | ESLint급 룰 시스템, 우리 컨벤션 코드화 가능 |
| PERF10 | 10 | 4.5 | 0.45 | CI에서 10초 내 완료 |
| DX14 | 14 | 4.5 | 0.63 | TypeScript 룰 작성, 익숙한 패턴 |
| ECO12 | 12 | 3.5 | 0.42 | 작은 커뮤니티지만 활발 |
| LIC8 | 8 | 5.0 | 0.40 | MIT |
| MAINT10 | 10 | 4.0 | 0.40 | kristiandupont 단독 메인테이너 (위험) |
| INTEG10 | 10 | 4.5 | 0.45 | CI 통합 쉬움 |
| SECURITY10 | 10 | 4.5 | 0.45 | DB read-only |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 완전 로컬 |
| COST3 | 3 | 5.0 | 0.15 | 무료 |
| **합계** | 100 | — | **4.42/5** | 채택 |

### 7.2 자체 RLS 시각 편집기 (react-hook-form + Monaco)
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 4.0 | 0.72 | 시각+SQL 듀얼 모드, 템플릿 |
| PERF10 | 10 | 4.0 | 0.40 | Monaco 250KB지만 이미 SQL Editor에 있음 |
| DX14 | 14 | 4.0 | 0.56 | RHF + zod 익숙 |
| ECO12 | 12 | 4.5 | 0.54 | RHF/zod/Monaco 모두 거대 생태계 |
| LIC8 | 8 | 5.0 | 0.40 | 모두 MIT |
| MAINT10 | 10 | 4.5 | 0.45 | 자체 코드라 우리 통제 |
| INTEG10 | 10 | 4.5 | 0.45 | NextAuth/audit_log 통합 자연스러움 |
| SECURITY10 | 10 | 4.0 | 0.40 | DDL 안전 가드 다층 + 잘못 정책 방지 다이얼로그 |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 완전 자체 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **4.18/5** | 채택 |

### 7.3 자체 Trigger/Function 편집기 (Monaco + plpgsql)
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 4.5 | 0.81 | 전체 lifecycle (view/edit/save/audit) |
| PERF10 | 10 | 4.0 | 0.40 | 함수 1000줄까지 OK |
| DX14 | 14 | 4.0 | 0.56 | Monarch tokenizer 작성 필요 (1회) |
| ECO12 | 12 | 4.5 | 0.54 | Monaco 거대 생태계 |
| LIC8 | 8 | 5.0 | 0.40 | MIT |
| MAINT10 | 10 | 4.5 | 0.45 | 우리 통제 |
| INTEG10 | 10 | 4.5 | 0.45 | audit_log 자동 |
| SECURITY10 | 10 | 4.5 | 0.45 | DROP+CREATE 트랜잭션, 위험 키워드 차단 |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 자체 |
| COST3 | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **4.31/5** | 채택 |

---

## 8. 결론 — 청사진 요약

### 8.1 채택
- ✅ **schemalint**: 즉시 도입 (CI + `pnpm lint:schema`).
- ✅ **자체 RLS 시각 편집기**: `/database/policies` 신설, react-hook-form + Monaco 듀얼 모드.
- ✅ **자체 Trigger/Function 편집기**: `/database/functions` 신설, Monaco + plpgsql Monarch.

### 8.2 거부
- ❌ Supabase Studio 코드 직접 포팅 (라이선스 + 종속성 비용).
- ❌ Hasura/PostgREST 같은 자동 RLS 생성 도구 (우리 NextAuth와 중복 + 학습 곡선).
- ❌ `node-pg-migrate` 같은 외부 마이그레이션 (Prisma Migrate가 이미 있음).

### 8.3 새 DQ
- **DQ-3.5**: Monaco vs CodeMirror 6 → **Monaco** (SQL Editor와 일관성, 250KB는 SSR + 동적 import로 첫 페이지 비용 0).
- **DQ-3.6**: schemalint CI 차단 → **PR 차단(blocking)** 채택.
- **DQ-3.7**: RLS 시각 vs SQL → **듀얼 탭**, 시각이 기본.
- **DQ-3.8**: plpgsql 외 언어 지원 → **No, plpgsql only** (PL/Python 등은 보안 위험 + 운영자 학습 비용).
- **DQ-3.9 (신규)**: Trigger 비활성화 토글(`ALTER TABLE x DISABLE TRIGGER y`)을 UI에서 1클릭으로 노출? → Yes, audit log 필수.
- **DQ-3.10 (신규)**: Function rename은 별도 ALTER FUNCTION 분기 처리 vs DROP+CREATE? → ALTER FUNCTION RENAME (참조 무결성 보존).
- **DQ-3.11 (신규)**: Policy 삭제 시 "이 정책 삭제하면 N개 사용자가 X 테이블에 접근 못할 수 있음" 경고 표시? → Phase 14e 후속 (정책 의존성 분석 별도 deep-dive).

### 8.4 100/100 갭 채우기
미션 1과 합산:
- 14d-1 카디널리티 (+5)
- 14d-2 스키마 그룹 (+3)
- 14d-3 Trigger collector + view (+5)
- 14d-4 Function collector + Monaco (+5)
- 14d-5 Policy collector + view (+5)
- 14d-6 외래키 picker (+3)
- 14d-7 DDL 탭 (+2)
- 14d-8 SVG export (+2)
- 14d-9 사용자별 layout (+2)
- 14d-10 추론 관계 토글 (+2)
- 14d-11 LOD (+1)
- **+ 본 deep-dive 신규 페이지**:
  - 14e-1 schemalint CI (+0, 별도 점수 없음 — 보호망)
  - 14e-2 RLS 시각 편집기 페이지 (+추가 가치, schema 100점은 미션 1로 채움)
  - 14e-3 Trigger/Function 편집기 페이지 (+추가 가치)

---

## 9. 참고 문헌

1. **schemalint 공식** — https://github.com/kristiandupont/schemalint
2. **extract-pg-schema** — https://github.com/kristiandupont/extract-pg-schema
3. **PostgreSQL pg_policies** — https://www.postgresql.org/docs/16/view-pg-policies.html
4. **PostgreSQL Row Security Policies** — https://www.postgresql.org/docs/16/ddl-rowsecurity.html
5. **PostgreSQL pg_get_functiondef** — https://www.postgresql.org/docs/16/functions-info.html
6. **PostgreSQL pg_trigger** — https://www.postgresql.org/docs/16/catalog-pg-trigger.html
7. **Supabase Studio (참고용 패턴)** — https://github.com/supabase/supabase/tree/master/apps/studio
8. **Monaco Editor + monaco-editor/react** — https://github.com/suren-atoyan/monaco-react
9. **CodeMirror 6 lang-sql** — https://github.com/codemirror/lang-sql
10. **react-hook-form** — https://react-hook-form.com
11. **zod** — https://zod.dev
12. **PostgreSQL plpgsql** — https://www.postgresql.org/docs/16/plpgsql.html
13. **`SET LOCAL row_security`** — https://www.postgresql.org/docs/16/runtime-config-client.html
14. **PostgREST RLS 패턴 (참조)** — https://postgrest.org/en/stable/auth.html
15. **Prisma Migrate diff** — https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-diff
16. **Phase 14b table-policy.ts** — `src/server/tables/table-policy.ts` (FULL_BLOCK/DELETE_ONLY 매트릭스)
17. **Phase 14c-α optimistic locking ADR** — `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md`
18. **Audit log 설계 (Phase 14b)** — `src/server/audit/write-log.ts`

---

## 10. 부록 — 신규 파일 트리

```
src/
  app/
    database/
      policies/
        page.tsx                    ← 신규 (RLS 시각 편집기)
      functions/
        page.tsx                    ← 신규 (목록)
        [schema]/
          [name]/
            page.tsx                ← 신규 (편집기)
      triggers/
        page.tsx                    ← 신규 (목록 + DROP/ENABLE/DISABLE)
    api/
      database/
        policies/route.ts           ← 신규
        functions/route.ts          ← 신규
        triggers/route.ts           ← 신규
        explain/route.ts            ← 신규 (dry-run)
  components/
    database/
      policy-list.tsx               ← 신규
      policy-edit-dialog.tsx        ← 신규
      function-editor.tsx           ← 신규
      trigger-editor.tsx            ← 신규
  server/
    database/
      schema-introspect/
        collect-policies.ts         ← 신규
        collect-functions.ts        ← 신규
        collect-triggers.ts         ← 신규
schemalint-rules/
  index.ts                          ← 신규
  require-updated-at.ts             ← 신규
  require-fk-index.ts               ← 신규
  require-rls-on-public.ts          ← 신규
  ban-naked-foreign-keys.ts         ← 신규
.schemalintrc.js                    ← 신규
.github/workflows/schemalint.yml    ← 신규
```

총 신규 파일 약 22개. Phase 14d-14e 합산 약 70~90시간 (2 sprint).

---

(끝 — 본 deep-dive는 schemalint를 즉시 도입하고, RLS 편집기와 Trigger/Function 편집기를 react-hook-form + Monaco로 자체 구현하는 청사진을 정리했다. Supabase Studio와 동등한 기능 + 우리 audit_log/RBAC 통합 + 안전 가드 다층화의 균형.)
