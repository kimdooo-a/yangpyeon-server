# 03 — ADR-024 (Hybrid Plugin) Implementation Spec

| 항목 | 값 |
|------|-----|
| 상태 | DRAFT (Wave 4 §01-architecture) |
| 작성 | 2026-04-26 (세션 58, sub-agent 산출물) |
| 근거 ADR | [ADR-024 ACCEPTED 옵션 D](../../01-adrs/ADR-024-tenant-plugin-code-isolation.md) |
| 영향 범위 | 저장소 레이아웃 / 빌드 / Prisma / Cron / Admin UI / CI |
| 1.0 마감 | Almanac v1.0 출시 직후 (Phase 16) |

---

## 1. 결정 요약 + 7개 부속 결정 인용

ADR-024 §5.4의 ACCEPTED 결정을 본 spec의 출발점으로 인용한다.

| # | 결정 항목 | 채택 값 | 본 spec 반영 절 |
|---|-----------|---------|-----------------|
| 1 | 채택 옵션 | **옵션 D** (Complex=workspace, Simple=manifest) | §3, §4, §10 |
| 2 | Almanac 마이그레이션 시점 | **v1.0 출시 후** (Phase 16) | §9 |
| 3 | 모노레포 도구 | **pnpm + turborepo** | §2 |
| 4 | Prisma schema 병합 | **스크립트 기반 append** (multiSchema preview 모니터링) | §5 |
| 5 | Admin UI 통합 | **route group + manifest codegen** | §7 |
| 6 | Cron registry 변경 | **TENANT kind 신설 + manifest dispatch** | §6 |
| 7 | Simple manifest 활성화 | **첫 사례 등장 시** (모델/loader 골격은 미리 준비) | §10 |

본 spec은 위 7개 결정을 코드 레벨에서 어떻게 실현할지를 한 곳에 모은다. 절차적 순서(누가 먼저, 무엇을 산출)는 §02 sprint-plan에서, 실제 코드 이전 매핑은 §03 migration에서 보강한다.

### 1.1 핵심 인터페이스 (한 줄 요약)

```ts
// packages/core가 외부에 노출하는 핵심 타입 (구체 정의는 §3, §4 참조)
export interface TenantManifest {
  id: string;                                     // "almanac"
  version: string;                                // "1.0.0"
  cronHandlers: Record<string, CronHandler>;      // module → fn
  routes: TenantRoute[];                          // codegen 대상
  adminPages: TenantAdminPage[];                  // codegen 대상
  prismaFragmentPath?: string;                    // 상대경로
  envVarsRequired: string[];                      // 부팅 검증
  dataApiAllowlist?: DataApiAllowlistEntry[];     // ADR-026 통합
}
```

---

## 2. 모노레포 도입 — pnpm + turborepo

### 2.1 신규 루트 파일

#### `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
  - "packages/tenant-*"   # 명시 (와일드카드 우선순위)
  - "apps/*"
```

#### `turbo.json` (핵심 task만)

```jsonc
{
  "tasks": {
    "build": {
      "dependsOn": ["^build", "schema:assemble", "tenants:assemble"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**", "generated/**"],
      "inputs": ["src/**", "manifest.ts", "prisma/**", "package.json", "tsconfig.json"]
    },
    "schema:assemble":  { "outputs": ["apps/web/prisma/schema.prisma"], "inputs": ["packages/*/prisma/**", "scripts/assemble-schema.ts"] },
    "tenants:assemble": { "outputs": ["apps/web/app/(tenant-*)/**", "packages/core/src/tenants/.generated/**"] },
    "prisma:generate":  { "dependsOn": ["schema:assemble"], "outputs": ["apps/web/generated/prisma/**"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "dev":  { "cache": false, "persistent": true }
  }
}
```

루트 `package.json`은 `workspaces: ["packages/*", "apps/*"]`, `packageManager: "pnpm@10"`, scripts는 `turbo run <task>` 위임. devDeps: `turbo`, `tsx`, `typescript`. 기존 `next`, `react`, `prisma`, `@prisma/client` 등은 §2.2 S5에서 packages/core 또는 apps/web 으로 이전.

### 2.2 단일 패키지 → packages/core/ + apps/web/ 재구조화 절차

현재 구조(루트 `src/`, `prisma/`, `public/`, `package.json`)를 다음 5단계로 분해한다.

| 단계 | 작업 | 산출 | 검증 |
|------|------|------|------|
| **S1: 루트 백업 + 브랜치** | `git checkout -b chore/monorepo-split`, 루트에 `pnpm-workspace.yaml`/`turbo.json` 추가 (빈 packages/) | 워크스페이스 인식 가능 상태 | `pnpm -r ls` 실행 시 0개 패키지 응답 |
| **S2: packages/core 생성** | `packages/core/package.json` (`name: "@yangpyeon/core"`, `private: true`), 빈 `src/index.ts` | Empty workspace 패키지 1개 | `pnpm --filter @yangpyeon/core run typecheck` |
| **S3: 코드 git mv** | 기존 `src/` → `packages/core/src/`, `prisma/` → `packages/core/prisma/`, `public/` → `apps/web/public/` (Next.js 정적 자산은 web 진입점으로) | core 패키지에 본체 코드 입주 | `pnpm install` + `pnpm --filter @yangpyeon/core build` 통과 |
| **S4: apps/web 진입점** | `apps/web/package.json` (`dependencies: {"@yangpyeon/core": "workspace:*"}`), `apps/web/next.config.ts`, `apps/web/app/` 생성. App Router의 `app/` 디렉토리는 web 측에 두고, core는 라이브러리·route handler만 export | Next.js 빌드 진입점 | `pnpm --filter web dev` 후 localhost:3000 200 응답 |
| **S5: 의존성 재배치** | 루트 `package.json` dependencies → packages/core 또는 apps/web 으로 이전. `next`/`react`/`react-dom`은 apps/web, `@prisma/client`/`zod`/`jose`는 core | 루트 dependencies는 빌드 도구만 (turbo, tsx, typescript) | `pnpm dedupe` + `pnpm audit` 통과 |

**중요**: S3는 반드시 `git mv`로 수행 (history 보존). filter-branch는 §11 Open Questions에서 별도 검토.

#### 디렉토리 트리 (목표 상태)

```
yangpyeon-monorepo/
├── pnpm-workspace.yaml, turbo.json, package.json, tsconfig.base.json
├── scripts/
│   ├── assemble-schema.ts                  # §5 — fragment 병합
│   ├── codegen-routes.ts                   # §7 — apps/web 라우트 자동생성
│   ├── codegen-admin.ts                    # §7 — apps/web admin 페이지 자동생성
│   └── codegen-tenant-registry.ts          # §6 — workspace-loader 정적 import
├── packages/
│   ├── core/                               # @yangpyeon/core
│   │   ├── prisma/schema.prisma            # core 모델만
│   │   └── src/{index.ts, lib/{auth,router,cron,audit,api-guard,prisma}/, tenants/{manifest-types,workspace-loader,manifest-loader,registry,define}.ts}
│   └── tenant-almanac/                     # Phase 16에서 신설
│       ├── manifest.ts, package.json, prisma/fragment.prisma
│       └── src/{cron,routes,admin,lib,seed}/
└── apps/
    └── web/                                # Next.js 진입점
        ├── package.json                    # next, react, all tenants
        ├── next.config.ts                  # transpilePackages: ["@yangpyeon/*"]
        ├── prisma/schema.prisma            # ⚠️ codegen — git ignored
        ├── generated/prisma/               # ⚠️ codegen — git ignored
        └── app/{(core)/, (tenant-*)/, api/v1/}    # (tenant-*)/, api/v1/almanac/는 codegen
```

---

## 3. packages/core/ 구조 (Platform Core)

### 3.1 책임 경계

`@yangpyeon/core`는 다음만 책임진다.

| 영역 | 모듈 | tenant-aware 변환 포인트 |
|------|------|-------------------------|
| 인증 | `lib/auth/{jwt,api-key,webauthn,totp}` | API key는 `tenantId` claim 옵션 추가 (현재 user 단일) |
| 라우팅 가드 | `lib/api-guard/{withAuth,withRole,withApiKey}` | `withTenantApiKey(tenantId)` 신설 — manifest에서 등록한 라우트만 호출 |
| Cron | `lib/cron/{registry,runner,worker}` | `TENANT` kind 분기 (§6) |
| Audit | `lib/audit/{writer,query}` | `tenantId` 컬럼 추가 (ADR-021/023과 정합) |
| Prisma | `lib/prisma/client.ts` | core+tenant 통합 PrismaClient를 re-export |
| Tenant Registry | `lib/tenants/{workspace-loader,manifest-loader,registry}` | **신설** |

### 3.2 공개 API (`packages/core/src/index.ts`)

tenant 패키지가 import할 수 있는 표면 — barrel export로 명시적 제어:

| Export | 출처 |
|--------|------|
| `prisma` (PrismaClient instance) | `./lib/prisma/client` |
| Prisma model types (`ContentItem`, `User`, `AuditLog`, ...) | `apps/web/generated/prisma/client` (codegen이 type re-export 채움) |
| `withAuth`, `withRole`, `withApiKey`, `withTenantApiKey` | `./lib/api-guard` |
| `writeAuditLog`, `extractClientIp` | `./lib/audit` |
| `successResponse`, `errorResponse`, `paginatedResponse` | `./lib/api-response` |
| `CronHandler`, `CronContext`, `CronResult` types | `./lib/cron/types` |
| `TenantManifest`, `TenantRoute`, `TenantAdminPage`, `DataApiAllowlistEntry` types | `./lib/tenants/manifest-types` |
| `defineTenant<M>(m): M` (identity helper for type inference) | `./lib/tenants/define` |

### 3.3 단방향 의존성 강제

`packages/core/src/**`은 `packages/tenant-*` import 금지. ESLint `import/no-restricted-paths` 규칙으로 차단 (zones: target=core, from=tenant-*, message="core는 tenant를 import 금지 — registry는 dynamic import"). core가 tenant 핸들러 호출 시 항상 **registry lookup → dynamic dispatch**, 빌드 시 정적 import 금지.

---

## 4. packages/tenant-<id>/ 구조

### 4.1 디렉토리 layout

```
packages/tenant-almanac/
├── manifest.ts                        # 진입점 — defineTenant({...}) export default
├── package.json                       # name: @yangpyeon/tenant-almanac
├── tsconfig.json                      # extends ../../tsconfig.base.json
├── prisma/
│   └── fragment.prisma                # ContentSource, ContentItem, ContentCategory ...
├── src/
│   ├── cron/                          # cron handlers (manifest.cronHandlers에서 참조)
│   │   ├── rss-fetcher.ts             # export async function run(payload, ctx)
│   │   ├── html-scraper.ts
│   │   ├── api-poller.ts
│   │   ├── classifier.ts
│   │   └── promoter.ts
│   ├── routes/                        # API route handlers
│   │   ├── contents.ts                # export const GET, POST = ...
│   │   ├── categories.ts
│   │   ├── sources.ts
│   │   ├── items.ts
│   │   └── today-top.ts
│   ├── admin/                         # admin UI fragments (Server Components)
│   │   ├── sources/page.tsx
│   │   ├── categories/page.tsx
│   │   ├── items/page.tsx
│   │   └── dashboard/page.tsx
│   ├── lib/                           # tenant 내부 lib (외부 미공개)
│   │   ├── fetchers/{rss,html,api}.ts
│   │   ├── dedupe.ts
│   │   ├── classify.ts
│   │   ├── llm.ts
│   │   └── promote.ts
│   └── seed.ts                        # 초기 데이터 (tenant CLI에서 호출)
└── tests/
    └── ...
```

### 4.2 `manifest.ts` 형식 (ADR-026 정합)

```ts
// packages/tenant-almanac/manifest.ts (발췌)
import { defineTenant } from "@yangpyeon/core";
import * as rssFetcher  from "./src/cron/rss-fetcher";
import * as classifier  from "./src/cron/classifier";
// ... promoter, htmlScraper, apiPoller

export default defineTenant({
  id: "almanac",
  version: "1.0.0",
  cronHandlers: {
    "rss-fetcher":  rssFetcher.run,
    "html-scraper": htmlScraper.run,
    "api-poller":   apiPoller.run,
    "classifier":   classifier.run,
    "promoter":     promoter.run,
  },
  routes: [
    { method: "GET",  path: "/api/v1/almanac/contents",   module: "./src/routes/contents",   export: "GET",  guards: ["publishable-key", "rate-limit:60/m"] },
    { method: "GET",  path: "/api/v1/almanac/categories", module: "./src/routes/categories", export: "GET",  guards: ["publishable-key"] },
    { method: "GET",  path: "/api/v1/almanac/sources",    module: "./src/routes/sources",    export: "GET",  guards: ["admin"] },
    // ... +3 routes (POST sources, items, today-top)
  ],
  adminPages: [
    { path: "/admin/almanac/sources",    module: "./src/admin/sources/page",    title: "소스 관리" },
    { path: "/admin/almanac/categories", module: "./src/admin/categories/page", title: "카테고리" },
    { path: "/admin/almanac/items",      module: "./src/admin/items/page",      title: "아이템" },
    { path: "/admin/almanac/dashboard",  module: "./src/admin/dashboard/page",  title: "대시보드" },
  ],
  prismaFragmentPath: "./prisma/fragment.prisma",
  envVarsRequired: ["GEMINI_API_KEY", "ALMANAC_ALLOWED_ORIGINS"],
  dataApiAllowlist: [
    { table: "ContentItem",   columns: ["id", "title", "url", "track", "subcategory", "publishedAt"] },
    { table: "ContentSource", columns: ["id", "name", "kind"], readOnly: true },
  ],
});
```

### 4.3 `package.json` 컨벤션

```jsonc
{
  "name": "@yangpyeon/tenant-almanac", "private": true, "version": "1.0.0",
  "main": "./manifest.ts", "types": "./manifest.ts",
  "exports": { ".": "./manifest.ts", "./cron/*": "./src/cron/*.ts", "./routes/*": "./src/routes/*.ts", "./admin/*": "./src/admin/*.tsx" },
  "dependencies": {
    "@yangpyeon/core": "workspace:*",
    "rss-parser": "^3.13", "cheerio": "^1.0", "@google/genai": "^1.50"
  },
  "scripts": { "build": "tsc -p tsconfig.json --noEmit", "test": "vitest run" }
}
```

---

## 5. Prisma schema 병합 스크립트

### 5.1 동작 개요

빌드 시 다음 흐름:

```
packages/core/prisma/schema.prisma                ──┐
packages/tenant-almanac/prisma/fragment.prisma    ──┤  scripts/assemble-schema.ts
packages/tenant-jobboard/prisma/fragment.prisma   ──┤  → apps/web/prisma/schema.prisma
... (모든 packages/tenant-*/prisma/fragment.prisma) ─┘
                                                       ↓
                                           pnpm prisma generate --schema=apps/web/prisma/schema.prisma
                                                       ↓
                                           apps/web/generated/prisma/client
```

병합 산출 schema와 generated client는 **git ignored** (빌드 산출물).

### 5.2 스크립트 sketch (`scripts/assemble-schema.ts`)

```ts
// 핵심 흐름만 요약 (전체 ~80줄)
const ROOT = path.resolve(__dirname, "..");
const fragments = await glob("packages/tenant-*/prisma/fragment.prisma", { cwd: ROOT });
const coreBody = await fs.readFile(`${ROOT}/packages/core/prisma/schema.prisma`, "utf8");

// 1) 충돌 검사: model/enum 이름 중복 시 throw (owner 추적)
checkConflicts(coreBody, fragments);  // model/enum regex 매칭 → Map<name, owner>

// 2) 병합: banner + core + fragment(주석 헤더 포함)
const merged = banner + coreBody + fragments.map(f =>
  `// ───── tenant: ${f.tenantId} ─────\n${f.body}`
).join("\n\n");

// 3) 산출: apps/web/prisma/schema.prisma (git ignored)
await fs.writeFile(`${ROOT}/apps/web/prisma/schema.prisma`, merged);
```

규칙: fragment에 `datasource`/`generator` 발견 시 throw. 산출 파일은 `git ignored`.

### 5.3 fragment 작성 규칙

| 규칙 | 강제 방법 |
|------|-----------|
| `datasource`/`generator` 블록 금지 (core에만 있음) | assemble 스크립트가 fragment에서 발견 시 throw |
| 모델·enum 이름은 `<TenantId>_` prefix 권장 (충돌 회피) | 린트 경고 (강제 X) |
| relation은 fragment 내부에서만 (cross-tenant relation 금지) | §11 Open Questions §3 |
| `@@schema("tenant_<id>")` 적용 (Prisma 7 multiSchema 활용) | core schema의 `previewFeatures = ["multiSchema"]` 활성 |

### 5.4 fragment.prisma 예시 (Almanac, 발췌)

```prisma
// packages/tenant-almanac/prisma/fragment.prisma — datasource/generator 없음
model ContentSource {
  id String @id @default(cuid())
  name String
  kind String           // "rss" | "html" | "api" | "firecrawl"
  url String
  enabled Boolean @default(true)
  ingestedItems ContentIngestedItem[]
  @@schema("tenant_almanac")
}

model ContentIngestedItem {
  id String @id @default(cuid())
  sourceId String
  source ContentSource @relation(fields: [sourceId], references: [id])
  urlHash String @unique
  status String @default("pending")     // pending | ready | promoted | rejected
  @@schema("tenant_almanac")
}

// ContentItem, ContentCategory, ContentItemMetric — 생략 (총 6 모델)
```

---

## 6. Cron registry — TENANT kind 신설

### 6.1 Prisma enum 변경 (core schema)

```prisma
// packages/core/prisma/schema.prisma
enum CronKind {
  SQL         // 기존
  FUNCTION    // 기존 (Edge Function)
  WEBHOOK     // 기존
  TENANT      // 신규 — manifest dispatch
}

model CronJob {
  id        String   @id @default(cuid())
  name      String   @unique
  kind      CronKind
  schedule  String                       // cron expression
  payload   Json                         // TENANT kind: { tenantId, module, args? }
  enabled   Boolean  @default(true)
  lastRunAt DateTime?
  // ...
}
```

### 6.2 dispatch 패턴 (ADR-028 통합)

```ts
// packages/core/src/lib/cron/runner.ts — TENANT case 발췌
case "TENANT": {
  const { tenantId, module, args } = job.payload as TenantCronPayload;
  const tenant = tenantRegistry.get(tenantId);
  if (!tenant) return failure(ctx, `tenant ${tenantId} not in registry`);
  const handler = tenant.cronHandlers[module];
  if (!handler) return failure(ctx, `tenant=${tenantId} module=${module} 핸들러 없음`);
  // ADR-028 advisory lock: key = hash(tenantId + module)
  return await withAdvisoryLock(`tenant:${tenantId}:${module}`, () => handler(args ?? {}, ctx));
}
```

`TenantCronPayload = { tenantId: string; module: string; args?: Record<string, unknown> }`. SQL/FUNCTION/WEBHOOK은 기존 분기 그대로 유지.

### 6.3 registry + workspace-loader (개념)

`TenantRegistry`는 (1) workspace tenants를 부팅 시 1회, (2) simple tenants를 매분 reload하는 캐시. 메서드 표면은 `ensureLoaded()` / `get(id)` / `list()` 3개. 구현은 `Map<string, TenantManifest>` 1개로 충분.

**중요**: workspace-loader는 직접 `glob` + dynamic import 금지 (Next.js 번들러가 추적 불가). 빌드 시 **registry 자체를 codegen**:

```ts
// scripts/codegen-tenant-registry.ts (개념, ~30줄)
const tenants = glob("packages/tenant-*/manifest.ts");
const body = `
${tenants.map((t, i) => `import t${i} from "@yangpyeon/${t.match(/tenant-[^/]+/)![0]}";`).join("\n")}
export async function loadWorkspaceTenants() { return [${tenants.map((_, i) => `t${i}`).join(", ")}]; }`;
fs.writeFileSync("packages/core/src/tenants/.generated/workspace-loader.ts", body);
```

이 codegen은 `tenants:assemble` turbo task로 schema:assemble과 같은 시점에 실행.

---

## 7. Admin UI 통합 (Next.js App Router)

### 7.1 route group + codegen 전략

각 tenant의 `manifest.adminPages` 선언을 빌드 시 읽어 `apps/web/app/(tenant-<id>)/` 디렉토리를 자동 생성한다.

```
apps/web/app/
├── (core)/
│   ├── admin/settings/page.tsx
│   ├── admin/users/page.tsx
│   └── admin/audit-logs/page.tsx
├── (tenant-almanac)/                    # ⚠️ codegen — git ignored
│   ├── admin/almanac/sources/page.tsx
│   ├── admin/almanac/categories/page.tsx
│   ├── admin/almanac/items/page.tsx
│   └── admin/almanac/dashboard/page.tsx
└── api/
    ├── v1/...                           # core api
    └── v1/almanac/                      # ⚠️ codegen — git ignored
        ├── contents/route.ts
        ├── categories/route.ts
        └── ...
```

### 7.2 codegen 스크립트 (`scripts/codegen-admin.ts`)

각 tenant manifest의 `adminPages[]`를 순회하며 `apps/web/app/(tenant-<id>)<path>/page.tsx` 파일을 생성. 본문은 단순 re-export 1줄: `export { default } from "@yangpyeon/tenant-<id>/<module>";`. 산출 파일은 git ignored.

route handler (`route.ts`)도 동일 패턴으로 `scripts/codegen-routes.ts`가 생성. 둘 다 turbo `tenants:assemble` task에 묶여 실행.

### 7.3 `next.config.ts` (transpilePackages)

```ts
// apps/web/next.config.ts
export default {
  transpilePackages: ["@yangpyeon/core", "@yangpyeon/tenant-almanac"],  // codegen으로 자동 채움
  experimental: { typedRoutes: true },
};
```

`transpilePackages`도 `scripts/codegen-tenant-list.ts`가 채운다 (수동 관리 금지).

### 7.4 사이드바 네비게이션 (런타임)

route group은 정적이지만, 사이드바 메뉴는 런타임 `tenantRegistry.list()`에서 동적 구성. core가 tenant manifest의 `adminPages[].title`을 읽어 `<TenantSection>` 컴포넌트를 렌더 — 새 tenant 추가 시 코드 수정 없이 메뉴 자동 등록.

---

## 8. CI/CD — turborepo pipeline

### 8.1 GitHub Actions 구성 (`.github/workflows/ci.yml`)

핵심 step: `actions/checkout@v4 with fetch-depth: 0` (turbo의 main 비교용) → pnpm install --frozen-lockfile → `pnpm turbo run build test lint --filter='...[origin/main]' --cache-dir=.turbo` → `actions/cache@v4`로 `.turbo` 캐시 저장. node 22, pnpm 10.

### 8.2 영향 범위 자동 감지 매트릭스

| 변경 위치 | 빌드/테스트 대상 |
|-----------|------------------|
| `packages/core/**` | core + 모든 tenant + apps/web (전부) |
| `packages/tenant-almanac/**` | tenant-almanac + apps/web (core skip) |
| `packages/tenant-jobboard/**` | tenant-jobboard + apps/web (core, almanac skip) |
| `apps/web/**` | apps/web only |
| `scripts/assemble-schema.ts` | apps/web (schema 재조립 트리거) |

`turbo --filter='...[origin/main]'`이 위 표를 자동 처리.

### 8.3 캐시 무효화 함정

- `manifest.ts` 변경 → tenant 빌드 invalidate ✓
- `manifest.ts`에서 새 cronHandler 추가 → core가 dispatch 변경 안 됨 (registry는 런타임) → core 빌드 skip 의도됨
- ⚠️ **codegen 산출(routes, admin pages)이 turbo input에 포함**되어야 cache hit 정확. `inputs: ["src/**", "manifest.ts"]`에 manifest 명시 (위 §2.1 turbo.json에 반영됨)

---

## 9. Almanac 마이그레이션 시나리오

ADR-024 §4.1 표를 본 spec의 코드 경로로 정밀화.

### 9.1 파일 매핑 (현재 spec/aggregator-fixes 브랜치 → packages/tenant-almanac/)

| # | From (spec/aggregator-fixes) | To (monorepo) | 비고 |
|---|-------------------------------|----------------|------|
| 1 | `prisma/schema.prisma` 의 6개 모델 (ContentSource, ContentItem, ContentIngestedItem, ContentCategory, ContentItemMetric, RateLimitBucket) | `packages/tenant-almanac/prisma/fragment.prisma` | RateLimitBucket은 core로 (공통 인프라) |
| 2 | `src/lib/aggregator/fetchers/{rss,html,api}.ts` | `packages/tenant-almanac/src/lib/fetchers/{rss,html,api}.ts` | 내부 lib (외부 미공개) |
| 3 | `src/lib/aggregator/{dedupe,classify,llm,promote}.ts` | `packages/tenant-almanac/src/lib/{dedupe,classify,llm,promote}.ts` | |
| 4 | `src/lib/aggregator/runner.ts` | `packages/tenant-almanac/src/cron/{rss-fetcher,html-scraper,api-poller,classifier,promoter}.ts` (5개로 split) | manifest.cronHandlers의 entry 단위로 분할 |
| 5 | `src/lib/cron/runner.ts` 의 `AGGREGATOR` kind 분기 | `packages/core/src/lib/cron/runner.ts` 의 `TENANT` kind 분기 | 단일 kind로 일반화 |
| 6 | `src/app/api/v1/almanac/contents/route.ts` 등 5개 | `packages/tenant-almanac/src/routes/{contents,categories,sources,items,today-top}.ts` + codegen으로 `apps/web/app/api/v1/almanac/*/route.ts` 생성 | route handler는 tenant 패키지에, route 파일은 codegen |
| 7 | `src/app/admin/aggregator/{sources,categories,items,dashboard}/page.tsx` | `packages/tenant-almanac/src/admin/{sources,categories,items,dashboard}/page.tsx` + codegen으로 `apps/web/app/(tenant-almanac)/admin/almanac/*/page.tsx` 생성 | 경로 prefix가 `/admin/aggregator/` → `/admin/almanac/`로 변경 (URL breaking) — 리디렉트 추가 |
| 8 | `package.json` 의 rss-parser, cheerio, @google/genai | `packages/tenant-almanac/package.json` 의 dependencies | 루트에서 제거 |
| 9 | `src/lib/data-api/allowlist.ts` 의 Almanac 부분 | `packages/tenant-almanac/manifest.ts` 의 `dataApiAllowlist` 필드 | core build 시 통합 |
| 10 | `prisma/seed.ts` 의 ContentSource 시드 | `packages/tenant-almanac/src/seed.ts` | tenant-level seed |

### 9.2 작업량 추정 (5~7 작업일)

| Day | 작업 | 산출 |
|-----|------|------|
| **D1** | 모노레포 split (S1~S5, §2.2) | core 패키지 + apps/web 분리, 기존 기능 회귀 0 |
| **D2** | tenant-almanac 패키지 골격 + manifest.ts 작성 + 코드 mv (§9.1 #2~#4) | `pnpm --filter tenant-almanac build` 통과 |
| **D3** | Prisma fragment 분리 (§9.1 #1) + assemble-schema 스크립트 가동 (§5) | `pnpm prisma generate` 통과, type 회귀 0 |
| **D4** | TENANT cron kind + dispatch (§6) + DB seed로 cron 5개 등록 변환 (`AGGREGATOR` → `TENANT { tenantId: "almanac", module: "..." }`) | 5개 cron 정상 실행, audit log 일치 |
| **D5** | Routes + Admin codegen (§7) + URL 리디렉트 `/admin/aggregator/* → /admin/almanac/*` | 모든 라우트 200, e2e 통과 |
| **D6 (buffer)** | data-api allowlist 통합 + Almanac 외부 클라이언트 smoke test | Almanac.app fetch 정상 |
| **D7 (buffer)** | turborepo CI 가동 + 캐시 hit 검증 | tenant 변경 시 core skip 확인 |

### 9.3 출시 충돌 회피

- ADR-024 §5.4 결정: **Almanac v1.0 출시 후 Phase 16에서 마이그레이션**
- spec/aggregator-fixes 브랜치는 현재 패턴 유지 (직접 `src/lib/aggregator/`)
- Phase 16 진입 시 본 spec의 §9.1 매핑표로 일괄 이전, single PR로 머지

---

## 10. Simple manifest 활성화 시점 정의

ADR-024 §5.4 부속결정 #7: **첫 사례 등장 시 활성화**. 단, 골격은 미리 준비.

### 10.1 사전 준비 (Phase 16과 동시)

#### Prisma 모델 (core schema에 추가, 빈 테이블)

```prisma
// packages/core/prisma/schema.prisma
model SimpleTenant {
  id            String   @id                       // "statusping"
  name          String
  enabled       Boolean  @default(true)
  cronHandlers  Json     // { "module-name": "<handler code string>" }
  routes        Json     // [{path, method, handlerCode}]
  envVars       Json?    // { KEY: "value" }  ⚠️ 시크릿은 별도 vault
  createdBy     String   // ADMIN user id
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@schema("public")
}
```

#### Loader 골격 (`packages/core/src/lib/tenants/manifest-loader.ts`)

핵심 흐름: `prisma.simpleTenant.findMany({where: {enabled: true}})` → `toManifest(row)`로 변환 → ADR-002 **isolated-vm v6에서 handler 문자열 evaluate**. 첫 사례 등장 전까지 `compileHandlers`는 `throw new Error("not yet activated")` 상태로 유지 (interface만 잠금).

### 10.2 활성화 트리거 정의

다음 4개 조건을 **모두 만족**하는 컨슈머 등장 시 활성화: (1) npm dependency 추가 불필요, (2) Prisma model 0~1개, (3) cron handler 코드 줄 수 ≤ 100, (4) admin UI 페이지 0개.

가상 첫 사례: **StatusPing** (단일 URL HEAD → 응답 시간 기록). row 예: `cronHandlers: {"ping": "async function({url}, ctx){ const t0=Date.now(); const r=await fetch(url,{method:'HEAD'}); ctx.metric('latency', Date.now()-t0); return {status:r.status}; }"}`.

### 10.3 보안 가드 (활성화 시 필수)

- SimpleTenant CRUD는 **ADMIN role 한정** (`withRole("ADMIN")`) + audit log 기록 (ADR-021)
- isolated-vm v6 메모리/CPU 제한: 256MB / 5초 wall clock
- handler 문자열 길이 ≤ 8KB
- Prisma client는 proxy로 화이트리스트 메서드만 노출 (`findMany`/`create`/`update` + tenant 자기 row 한정)

상세 spec은 첫 사례 등장 시 별도 작성.

---

## 11. Open Questions

ADR-024 §7.2의 미해결 질문 5개를 본 spec 관점에서 재정리.

### 11.1 모노레포 변환 시 git history 보존

| 옵션 | 장점 | 단점 | 권장 |
|------|------|------|------|
| **`git mv`** | 단순, history 보존 (단일 커밋 내) | rename detection 한계 (-M50%), file 수 많으면 누락 가능 | **채택** (Phase 16 split) |
| `git filter-repo --path-rename` | 정확한 path 변경 | 새 SHA, 협업자 재clone 필요. 1인 운영자에겐 무관 | 보류 (mv로 충분) |
| `git filter-branch` | filter-repo 부재 시 fallback | 매우 느림, 비추 | 비추 |

**결정**: `git mv` + 단일 커밋. 변경 후 `git log --follow` 로 검증.

### 11.2 VS Code workspace 설정

`.vscode/yangpyeon.code-workspace` — folders 4개 (루트 + packages/core + packages/tenant-almanac + apps/web), settings: `typescript.tsdk: "node_modules/typescript/lib"`, `eslint.workingDirectories: [{mode: "auto"}]`, `prisma.fileWatcher: true`.

### 11.3 TypeScript path aliases

`tsconfig.base.json` (루트) `compilerOptions.paths`:

```jsonc
{
  "@yangpyeon/core":           ["./packages/core/src/index.ts"],
  "@yangpyeon/core/*":         ["./packages/core/src/*"],
  "@yangpyeon/tenant-almanac": ["./packages/tenant-almanac/manifest.ts"],
  "@yangpyeon/tenant-*":       ["./packages/tenant-*/manifest.ts"]
}
```

각 패키지의 `tsconfig.json`은 `extends: "../../tsconfig.base.json"`. apps/web은 추가로 `jsx: "preserve"`, Next.js plugin.

### 11.4 ADR-024 §7.2 미해결 질문 — 본 spec 추적

| ADR-024 §7.2 # | 질문 | 본 spec 답 | 후속 작업 |
|----------------|------|-----------|-----------|
| 1 | tenant 패키지 publish 가치 | 1인 운영 단계에서는 **불필요**. 외부 협력자 등장 시 §6 ADR-024 옵션 B로 부분 전환 | — |
| 2 | Schema fragment 충돌 처리 | §5.2 `checkConflicts` + §5.3 `@@schema("tenant_<id>")` 권장 | Prisma 7 multiSchema 검증 PoC |
| 3 | Tenant disable 동작 | manifest registry에서 제외 → cron job/route 자동 비활성. 라우트는 410 Gone | codegen에서 disabled tenant skip 룰 |
| 4 | Cross-tenant 데이터 참조 | **금지** (relation 정의를 fragment 내부로 한정). 필요 시 core가 중재 API 제공 | 명문화 필요 (tenant-author guide) |
| 5 | Hot reload (next dev) | Next.js 16 + transpilePackages 동작 확인 필요 | PoC-1과 통합 (1일) |

---

## 12. 검증 계획 (PoC)

ADR-024 §8의 5개 PoC를 본 spec 기준으로 재배치.

| PoC | 산출 | Go 기준 | 책임 절 |
|-----|------|---------|--------|
| PoC-1 pnpm-workspace + turborepo 셋업 | 빈 packages/core + apps/web 빌드 | `next build` 성공 | §2 |
| PoC-2 schema 병합 + type export | dummy fragment 1개 → ContentItem type export 검증 | `import { ContentItem } from "@yangpyeon/core"` 컴파일 OK | §5 |
| PoC-3 TENANT cron dispatch | dummy manifest 1개로 cron 실행 + audit log | tick에서 dummy handler 호출 | §6 |
| PoC-4 Admin UI codegen | dummy admin page → `/admin/(dummy)/test` 200 | 페이지 200 응답 | §7 |
| PoC-5 turborepo --filter CI | tenant 1개 변경 시 core skip | cache hit 메트릭 노출 | §8 |

총 4 작업일, 전부 Go 시 본 spec 옵션 D 가동 확정.

---

## 13. 변경 이력

- **2026-04-26 (v1.0, 세션 58)**: 초안. ADR-024 옵션 D 코드 레벨 spec.
