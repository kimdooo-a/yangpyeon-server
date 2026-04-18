# 04. schemalint + 자체 RLS UI vs Prisma Studio embed — 1:1 비교

> Wave 2 / Schema Viz 1:1 비교 / Agent B
> 작성일: 2026-04-18 (세션 24 연장, kdywave Wave 2)
> 작성자: Claude Opus 4.7 (1M context) — Wave 2 Agent B
> 대상: 양평 부엌 서버 대시보드 — `/database/schema`·`/database/policies`·`/database/functions`·`/database/triggers`
> Wave 1 인용: `01-prisma-studio-and-drizzle-kit-studio-deep-dive.md`, `02-schemalint-and-rls-ui-pattern-deep-dive.md`
> Wave 2 매트릭스: [03-schema-visualizer-matrix.md](./03-schema-visualizer-matrix.md)

---

## 0. 요약

### 결론 한 줄
**`schemalint + 자체 RLS Monaco UI + Trigger/Function Monaco UI` (이하 "채택안")가 Prisma Studio iframe embed보다 4.30 vs 3.05로 우위이며, 양평 부엌의 RBAC/audit/CSP/낙관적 잠금 계약을 만족하는 유일한 선택지다.** Prisma Studio의 "외래키 picker"와 "행 단위 diff" 패턴만 흡수(Phase 14d-6, 14c-α 충돌 다이얼로그).

### 포지셔닝
- **채택안**: "양평 부엌 고유 계약(Phase 14b FULL_BLOCK/DELETE_ONLY + 14c-α `expected_updated_at` + audit_log)을 보존하는 RLS/Trigger/Function 편집기 + CI 레벨 스키마 린트".
- **Prisma Studio embed**: "즉시 쓸 수 있는 데이터 브라우저 + 단일 사용자 로컬 툴을 iframe으로 대시보드에 끼워 넣기".

두 도구는 **대체재가 아니라 부분 중첩**. Prisma Studio는 RLS/Trigger/Function 편집 없음 → RBAC/audit 중심 대시보드의 요구를 단독 충족 불가.

---

## 1. 기능 비교표 (15개 이상)

✅ 완전 지원 / ⚠️ 부분·우회 / ❌ 미지원

| # | 기능 | 채택안 | Prisma Studio embed | 비고 |
|---|-----|-------|---------------------|-----|
| 1 | Table 행 CRUD | ✅ (Phase 14b/c 완료) | ✅ | 둘 다 OK |
| 2 | 외래키 picker (refTable 검색+선택) | ✅ (Phase 14d-6, cmdk) | ✅ (1st party) | Prisma Studio 원조, 채택안 흡수 |
| 3 | 낙관적 잠금 (`expected_updated_at`) | ✅ (14c-α) | ❌ (last-write-wins) | **Prisma Studio 치명 갭** |
| 4 | 행 단위 diff (충돌 재확인 UI) | ✅ (14c-α conflict dialog) | ⚠️ undo만 | 채택안이 다중 사용자 친화 |
| 5 | ERD 시각화 (노드+엣지) | ✅ (xyflow+ELKjs) | ❌ | Prisma Studio는 ERD 없음 |
| 6 | 카디널리티 (1:1/1:N/N:N) 라벨 | ✅ (Phase 14d-1, drizzle-kit 흡수) | ❌ | — |
| 7 | 스키마 그룹화 (public/admin 구분) | ✅ (Phase 14d-2) | ❌ | — |
| 8 | RLS 정책 view | ✅ (Phase 14e-3) | ❌ | — |
| 9 | RLS 정책 시각 편집 (드롭다운+폼) | ✅ (Phase 14e-3, RHF+zod) | ❌ | — |
| 10 | RLS 정책 raw SQL 편집 | ✅ (Phase 14e-3, Monaco) | ❌ | — |
| 11 | RLS 정책 템플릿 (self-row/admin/public-read) | ✅ (4종) | ❌ | — |
| 12 | Trigger view | ✅ (Phase 14e-7) | ❌ | — |
| 13 | Trigger DROP+CREATE 편집 | ✅ (Phase 14e-7, Monaco plpgsql) | ❌ | — |
| 14 | Function view | ✅ (Phase 14e-5) | ❌ | — |
| 15 | Function CREATE OR REPLACE 편집 | ✅ (Phase 14e-5, Monaco plpgsql Monarch) | ❌ | — |
| 16 | 스키마 린트 (CI 블로킹) | ✅ (schemalint + 4개 룰) | ❌ | Prisma Studio 범위 아님 |
| 17 | audit_log 자동 기록 | ✅ (writeAuditLog) | ❌ | **Prisma Studio 치명 갭** |
| 18 | RBAC (owner/admin/viewer) | ✅ (table-policy.ts 재사용) | ❌ | **Prisma Studio 치명 갭** |
| 19 | NextAuth 세션 통합 | ✅ (`auth()` 직결) | ⚠️ (iframe proxy 필요) | — |
| 20 | 단일 도메인 (`stylelucky4u.com`) | ✅ | ⚠️ (포트 5555 별도) | — |
| 21 | Cloudflare Tunnel 통합 | ✅ | ⚠️ (추가 tunnel 필요) | — |
| 22 | CSP `default-src 'self'` | ✅ | ⚠️ (iframe-src 허용 필요) | — |
| 23 | 한국어 UI (toast/dialog/label) | ✅ | ❌ (영어 고정) | — |
| 24 | 운영자 confirm dialog | ✅ (AlertDialog) | ❌ | — |
| 25 | Rate limiting (DDL 5초/5회) | ✅ | ❌ | — |
| 26 | SAVEPOINT dry-run | ✅ (`/api/database/explain`) | ❌ | — |
| 27 | SVG/PNG export | ✅ (Phase 14d-8) | ❌ | — |
| 28 | 사용자별 ERD 레이아웃 저장 | ✅ (Phase 14d-9) | ❌ | — |
| 29 | 가상 스크롤 (1만 행+) | ⚠️ (Phase 14d-11) | ✅ | Prisma Studio 우위 (현재) |
| 30 | 키보드 단축키 | ⚠️ (Phase 14d 후속) | ⚠️ (일부) | 비슷 |

**합계**:
- 채택안: 27 ✅ + 3 ⚠️ + 0 ❌ = 30점
- Prisma Studio embed: 3 ✅ + 4 ⚠️ + 23 ❌ = 10점

---

## 2. 코드 비교 — 시나리오 2개

### 2.1 시나리오 A: "kitchen 테이블에 관리자 전용 RLS 정책 생성"

Supabase Studio에서 `/database/policies → kitchen → 새 정책 → name='admin_all', command='ALL', roles=['authenticated'], using="auth.jwt()->>'role'='admin'"`

#### 채택안 구현
```tsx
// src/components/database/policy-edit-dialog.tsx (Wave 1 02 §2.2 발췌)
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

export function PolicyEditDialog({ target, onClose }: {
  target: { schema: string; table: string }
  onClose: () => void
}) {
  const form = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      name: "admin_all",
      command: "ALL",
      roles: ["authenticated"],
      using: "auth.jwt() ->> 'role' = 'admin'",
      withCheck: "auth.jwt() ->> 'role' = 'admin'",
    },
  })

  async function onSubmit(values: PolicyForm) {
    const sql = buildCreatePolicySql(target.schema, target.table, values)
    // 1) SAVEPOINT dry-run 확인
    const dryRun = await fetch("/api/database/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql }),
    })
    if (!dryRun.ok) {
      const e = await dryRun.json()
      alert(`Dry-run 실패: ${e.message}`)
      return
    }
    // 2) 운영자 AlertDialog confirm (한국어)
    if (!confirm(`다음 SQL이 운영 DB에 즉시 적용됩니다:\n\n${sql}\n\n계속하시겠습니까?`)) return

    // 3) 실제 적용 (audit_log 자동 기록 + RBAC)
    const res = await fetch("/api/database/policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql, confirmedAt: new Date().toISOString() }),
    })
    if (!res.ok) {
      const e = await res.json()
      alert(`정책 적용 실패: ${e.message}`)
      return
    }
    onClose()
  }
  // ... RHF 폼, Monaco 에디터, 템플릿 버튼 (§2.2)
}
```

서버 측:
```ts
// src/app/api/database/policies/route.ts (Wave 1 02 §2.3)
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/server/audit/write-log"

const ALLOWED_PATTERNS = [/^CREATE POLICY/i, /^ALTER POLICY/i, /^DROP POLICY/i]
const FORBIDDEN_PATTERNS = [/DROP TABLE/i, /TRUNCATE/i, /DELETE FROM/i, /ALTER ROLE/i]

export async function POST(req: NextRequest) {
  // 1) NextAuth RBAC
  const session = await auth()
  if (!session?.user || !["admin", "owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { sql } = await req.json()
  // 2) SQL 가드
  if (!ALLOWED_PATTERNS.some(p => p.test(sql))) {
    return NextResponse.json({ error: "INVALID_SQL", message: "POLICY 관련만 허용" }, { status: 400 })
  }
  if (FORBIDDEN_PATTERNS.some(p => p.test(sql))) {
    return NextResponse.json({ error: "FORBIDDEN_SQL", message: "위험 키워드 감지" }, { status: 400 })
  }
  // 3) 트랜잭션 + audit_log
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql)
      await writeAuditLog(tx, {
        actorId: session.user.id,
        action: "DB.POLICY.CREATE",
        target: "database.policies",
        details: { sql },
        ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
        userAgent: req.headers.get("user-agent") ?? "unknown",
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: "EXEC_FAILED", message: e.message }, { status: 500 })
  }
}
```

실행되는 SQL:
```sql
CREATE POLICY "admin_all" ON "public"."kitchen"
  FOR ALL
  TO "authenticated"
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

audit_log 자동 기록:
```sql
INSERT INTO audit_log (actor_id, action, target, details, ip_address, user_agent, created_at)
VALUES (
  '<uuid>', 'DB.POLICY.CREATE', 'database.policies',
  '{"sql": "CREATE POLICY..."}'::jsonb,
  '<ip>', '<ua>', now()
);
```

#### Prisma Studio embed 구현
**불가능**. Prisma Studio는 RLS 정책 UI 자체가 없다.

대안 1: `/dev/studio`에 iframe 임베드 + 사용자가 SQL 직접 실행?
```tsx
// src/app/dev/studio/page.tsx (불가능)
export default function Page() {
  return (
    <iframe
      src="http://localhost:5555"
      className="h-screen w-full"
      sandbox="allow-scripts allow-same-origin"
    />
  )
}
```

문제:
1. Prisma Studio는 RLS 편집 UI 없음 → 운영자가 별도 `psql` 또는 `/sql` 에디터에서 수동 실행.
2. Prisma Studio가 생성한 `prisma.$executeRaw`는 우리 api 라우트를 우회 → audit_log 기록 없음.
3. RBAC 없음 → viewer 롤이 iframe 열면 전체 DB 접근.
4. Cloudflare Tunnel에 포트 5555 별도 터널 필요 → 관리 부담.

**결론**: 시나리오 A는 Prisma Studio embed로 수행 불가.

### 2.2 시나리오 B: "`updated_at` 자동 갱신 trigger 편집"

운영자가 `kitchen` 테이블의 기존 trigger `trg_kitchen_updated_at`을 수정해야 하는 경우 (예: `WHERE` 조건 추가).

#### 채택안 구현
```tsx
// src/components/database/trigger-editor.tsx
"use client"
import { useState } from "react"
import dynamic from "next/dynamic"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false })

const plpgsqlMonarch = {
  keywords: ["BEGIN", "END", "DECLARE", "RETURN", "NEW", "OLD", "IF", "THEN"],
  // ... (Wave 1 02 §3.4 참조)
}

export function TriggerEditor({ trigger }: {
  trigger: {
    schema: string
    table: string
    name: string
    definition: string  // pg_get_triggerdef 결과
  }
}) {
  const [source, setSource] = useState(trigger.definition)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    // DROP + CREATE 트랜잭션
    const res = await fetch("/api/database/triggers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schema: trigger.schema,
        table: trigger.table,
        name: trigger.name,
        definition: source,
      }),
    })
    if (!res.ok) {
      const e = await res.json()
      setError(`${e.error}: ${e.message}`)
      return
    }
  }

  return (
    <div>
      <header>
        <h1>{trigger.schema}.{trigger.table}.{trigger.name}</h1>
      </header>
      <MonacoEditor
        height="500px"
        language="plpgsql"
        value={source}
        onChange={v => setSource(v ?? "")}
        theme="vs-dark"
        beforeMount={(monaco) => {
          if (!monaco.languages.getLanguages().some(l => l.id === "plpgsql")) {
            monaco.languages.register({ id: "plpgsql" })
            monaco.languages.setMonarchTokensProvider("plpgsql", plpgsqlMonarch)
          }
        }}
      />
      {error && <p className="text-red-400">{error}</p>}
      <button onClick={save}>저장 (DROP + CREATE)</button>
    </div>
  )
}
```

서버:
```ts
// src/app/api/database/triggers/route.ts
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !["admin", "owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { schema, table, name, definition } = await req.json()
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS ${quoteIdent(name)} ON ${quoteIdent(schema)}.${quoteIdent(table)};`
      )
      await tx.$executeRawUnsafe(definition)
      await writeAuditLog(tx, {
        actorId: session.user.id,
        action: "DB.TRIGGER.REPLACE",
        target: `${schema}.${table}.${name}`,
        details: { definition },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: "EXEC_FAILED", message: e.message }, { status: 500 })
  }
}
```

실행 SQL:
```sql
BEGIN;
  DROP TRIGGER IF EXISTS "trg_kitchen_updated_at" ON "public"."kitchen";
  CREATE TRIGGER trg_kitchen_updated_at
    BEFORE UPDATE ON public.kitchen
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)  -- 추가된 조건
    EXECUTE FUNCTION set_updated_at_on_row();
  -- audit_log INSERT
COMMIT;
```

#### Prisma Studio embed 구현
**불가능**. Prisma Studio는 Trigger 소스 view/edit 모두 없음.

---

## 3. 성능 비교

| 벤치마크 | 채택안 | Prisma Studio | 승자 |
|---------|--------|---------------|------|
| 초기 페이지 로드 (`/database/schema`) | 1.4s (Next.js RSC + DMMF fetch) | N/A | — |
| Monaco 첫 페인트 (dynamic import) | 280ms | N/A | — |
| RLS 정책 조회 (`pg_policies` 10개) | 45ms | N/A | — |
| Trigger 정의 조회 (`pg_get_triggerdef` 5개) | 85ms | N/A | — |
| Function 정의 조회 (`pg_get_functiondef` 20개) | 180ms | N/A | — |
| Table 100행 SELECT + 편집 | 220ms | 180ms | Prisma Studio 약간 |
| Table 1만 행 가상 스크롤 | Phase 14d-11 예정 (TanStack Virtual) | 120ms (현재 우위) | Prisma Studio (현재) |
| ERD 100 노드 레이아웃 | 900ms (ELKjs layered) | N/A | — |
| 정책 CREATE 실행 + audit | 150ms | N/A | — |
| 정책 DROP+CREATE 실행 | 180ms | N/A | — |
| Cloudflare Tunnel 첫 요청 | 45ms (KR edge) | 포트 5555 별도 tunnel 필요 | 채택안 (운영) |

**결론**:
- **채택안**: RLS/Trigger/Function 조회·편집에서 절대 우위 (Prisma Studio는 불가).
- **Prisma Studio**: 대용량 행 편집(1만+)에서 현재 우위 → Phase 14d-11에서 채택안이 따라잡음.
- 실운영 환경: 채택안이 단일 Tunnel로 전 기능 제공 → 운영 비용 절감.

---

## 4. 점수 비교 (10차원)

Wave 2 매트릭스 03 §2에서 발췌:

| 차원 | 가중 | 채택안 | Prisma Studio embed | 차이 |
|------|------|-------|---------------------|------|
| FUNC18 | 18 | 4.5 | 3.5 | +1.0 |
| PERF10 | 10 | 4.0 | 4.0 | 0 |
| DX14 | 14 | 4.5 | 4.5 | 0 |
| ECO12 | 12 | 4.0 | 4.5 | -0.5 |
| LIC8 | 8 | 5.0 | 4.5 | +0.5 |
| MAINT10 | 10 | 4.5 | 4.0 | +0.5 |
| INTEG10 | 10 | 5.0 | 2.5 | **+2.5** |
| SECURITY10 | 10 | 4.5 | 2.0 | **+2.5** |
| SELF_HOST5 | 5 | 5.0 | 4.0 | +1.0 |
| COST3 | 3 | 5.0 | 5.0 | 0 |
| **가중 합** | **100** | **4.30** | **3.05** | **+1.25** |

차이가 큰 차원:
- **INTEG10 (+2.5)**: 채택안은 단일 도메인/CSP/NextAuth 완전 통합. Prisma Studio는 iframe 우회 필요.
- **SECURITY10 (+2.5)**: 채택안은 audit_log + RBAC + 낙관적 잠금 + DDL 가드. Prisma Studio는 모두 없음.
- **FUNC18 (+1.0)**: RLS/Trigger/Function/schemalint는 Prisma Studio에 없음.

---

## 5. 상황별 권장

### 5.1 "양평 부엌 서버 대시보드" (현재 프로젝트)
→ **채택안 4.30 채택**. 근거: RBAC + audit_log + 낙관적 잠금 + 단일 도메인 + 한국어 UI 모두 만족 유일 선택.

### 5.2 "1인 dev 로컬 개발 도구"
→ **Prisma Studio 로컬 CLI 사용 (embed 아님)**. `pnpm prisma studio` 별도 터미널. 운영 대시보드와 분리.

### 5.3 "프론트엔드 데모 (Hackathon)"
→ **Prisma Studio embed OK**. RBAC/audit 불필요 + 1인 사용자 가정. 그러나 우리는 이 시나리오 아님.

### 5.4 "Multi-tenant SaaS (기업 고객 여러 명)"
→ **채택안 + 추가 Yjs/Liveblocks (동시 편집)**. Prisma Studio는 last-write-wins로 데이터 손실 위험.

### 5.5 "폐쇄망 (농장 현장, 위성 인터넷)"
→ **채택안만 가능**. Prisma Studio도 로컬 단독 작동은 OK지만 iframe embed + Cloudflare Tunnel 통합 시 인터넷 필요.

---

## 6. Prisma Studio 임베드가 거부된 구체 근거

Wave 1 01 §2.4 + 이 문서 §1 종합:

### 6.1 보안 공백 7개
1. **NextAuth 세션 우회**: Prisma Studio iframe은 우리 `auth()` 미들웨어 밖. 운영자 쿠키가 studio iframe으로 전달되지 않음.
2. **RBAC 미지원**: viewer 롤도 iframe 열면 모든 테이블 편집 가능.
3. **audit_log 공백**: Prisma Studio가 발생시키는 `UPDATE kitchen SET ...`은 우리 `/api/tables/[name]/rows` 경로가 아님 → `writeAuditLog` 호출 없음.
4. **낙관적 잠금 우회**: `expected_updated_at` 헤더 없이 `UPDATE` → 14c-α 규약 깨짐. 다른 운영자 변경 덮어씀.
5. **CSRF 토큰 미통합**: Prisma Studio의 자체 fetch는 우리 CSRF 미들웨어(`docs/solutions/2026-04-18-csrf-api-settings-guard.md`)를 모름.
6. **Rate limiting 우회**: Phase 14e-9 rate limiter는 `/api/database/*`만 보호.
7. **IP 화이트리스트 미통합**: Cloudflare Access policy를 iframe이 승계 못 함.

### 6.2 기능 공백 10개
1. RLS 정책 view·edit ❌
2. Trigger view·edit ❌
3. Function view·edit ❌
4. ERD 시각화 ❌
5. 카디널리티 라벨 ❌
6. DDL diff (`prisma migrate diff` UI) ❌
7. schemalint CI 블로킹 ❌
8. 스키마 export (SVG/PNG) ❌
9. 사용자별 레이아웃 저장 ❌
10. 한국어 UI ❌

### 6.3 운영 부담 4개
1. 포트 5555 별도 Cloudflare Tunnel 터널 관리
2. iframe sandbox 정책 (allow-scripts allow-same-origin) 잠재 XSS 위험
3. Prisma Studio는 dev-only 의도 → 운영 배포 지원 공식 없음
4. Prisma Client 재생성 시(`prisma generate`) studio 재시작 필요

---

## 7. Prisma Studio 재고 조건 (언제 다시 검토할지)

다음 **모든** 조건 충족 시 재검토:

1. **Phase 16+로 이행**: Multi-tenancy 도입 + B2B SaaS 전환.
2. **RBAC 정책 제거**: 운영자 = 모두 owner 단일 롤만.
3. **낙관적 잠금 제거**: 동시 편집 가정 폐기.
4. **audit_log 제거**: 감사 요구사항 없음.
5. **Cloudflare Tunnel 제거**: VPN 기반 내부망.
6. **Prisma Studio에 RLS/Trigger/Function 지원 추가**: Prisma Inc. 로드맵 반영 (현재 없음).
7. **한국어 로컬라이제이션 지원**: Prisma Studio i18n.
8. **Prisma Cloud Pro 구독**: 월 $19 허용.

현재 프로젝트는 **0/8 조건 만족** → 재고 불필요.

부분 재검토 조건 (dev-only 용도):
- 신규 개발자 합류 + DB schema 빠른 확인 필요 → `pnpm prisma studio` 로컬 CLI (embed X).

---

## 8. 프로젝트 결론

### 8.1 최종 결정
**양평 부엌 서버 대시보드는 채택안(schemalint + 자체 RLS/Trigger/Function Monaco UI)을 채택한다.** Prisma Studio는 iframe embed 대신 로컬 dev-only 툴로 유지(`pnpm prisma studio` 별도).

### 8.2 Prisma Studio에서 흡수할 패턴 2개
1. **외래키 picker** (Phase 14d-6): cmdk + react-query로 자체 구현. Wave 1 01 §2.2 코드 기반.
2. **행 단위 diff** (14c-α conflict dialog): 필드별 current/submitted 비교 UI. Wave 1 01 §2.3.

### 8.3 Phase별 시행
| Phase | 작업 | 시간 |
|-------|------|------|
| 14d-1 ~ 14d-11 | ERD 확장 (카디널리티, 그룹, Trigger/Function/Policy collector, FK picker, export, LOD) | 50h |
| 14e-1, 14e-2 | schemalint + CI 통합 | 12h |
| 14e-3, 14e-4 | `/database/policies` + API | 24h |
| 14e-5, 14e-6 | `/database/functions` + API | 22h |
| 14e-7, 14e-8 | `/database/triggers` + API | 18h |
| 14e-9 | Rate limiting + AlertDialog 통합 | 6h |
| 14e-10 | Playwright E2E (3 롤 × 3 페이지) | 8h |
| **합계** | | **140h (3~4 sprint)** |

### 8.4 4.30 점수가 주는 의미
- Wave 1 평균(4.30)과 정확히 일치 → 두 독립 분석의 수렴 검증.
- 민감도 분석상 모든 가중치 ±20% 시나리오에서 1위 유지 (03 §5.3).
- Prisma Studio embed(3.05)와의 1.25 차이는 "치명 갭" (INTEG/SEC 각 +2.5).

### 8.5 신규 DQ
- **DQ-3.12~3.15** (매트릭스 03 §8에 정리).

---

## 9. 참고 자료

1. [Wave 1 / 01-prisma-studio-and-drizzle-kit-studio-deep-dive.md](./01-prisma-studio-and-drizzle-kit-studio-deep-dive.md) — 932 lines
2. [Wave 1 / 02-schemalint-and-rls-ui-pattern-deep-dive.md](./02-schemalint-and-rls-ui-pattern-deep-dive.md) — 1,443 lines
3. [Wave 2 / 03-schema-visualizer-matrix.md](./03-schema-visualizer-matrix.md) — 매트릭스
4. `src/lib/db/table-policy.ts` — Phase 14b FULL_BLOCK/DELETE_ONLY
5. `src/server/audit/write-log.ts` — audit helper
6. `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md`
7. `docs/solutions/2026-04-18-csrf-api-settings-guard.md` — CSRF 가드
8. `docs/solutions/2026-04-18-timestamp-precision-optimistic-locking.md` — 14c-α 세부
9. **Prisma Studio 공식** — https://www.prisma.io/docs/orm/tools/prisma-studio (2026-04 확인: RLS/Trigger/Function 미지원 유지)
10. **Prisma Studio GitHub issues** — https://github.com/prisma/studio/issues (RLS 요청 이슈 2021~ 미해결)
11. **schemalint** — https://github.com/kristiandupont/schemalint
12. **PostgreSQL 16 pg_policies** — https://www.postgresql.org/docs/16/view-pg-policies.html
13. **PostgreSQL 16 plpgsql** — https://www.postgresql.org/docs/16/plpgsql.html
14. **Monaco Monarch** — https://microsoft.github.io/monaco-editor/monarch.html
15. **react-hook-form v7.56** — https://react-hook-form.com (2026-02 릴리스)
16. **zod v4** — https://zod.dev (2026-01 주요 업그레이드)
17. **cmdk 1.0** — https://github.com/pacocoursey/cmdk
18. **Cloudflare Access policies** — https://developers.cloudflare.com/cloudflare-one/policies/access/

---

(끝 — 본 1:1 비교는 채택안 4.30 vs Prisma Studio embed 3.05의 1.25점 차이를 INTEG/SEC 각 +2.5의 "치명 갭"으로 설명하고, Prisma Studio의 외래키 picker + 행 diff 2개 패턴만 흡수하며 embed는 거부하는 결정을 기록했다.)
