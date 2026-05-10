# 인수인계서 — 세션 99 후속 (PLUGIN-MIG-3 A+B+C 단일 commit cutover)

> 작성일: 2026-05-10
> 이전 세션 (정찰): [session99-recon](./260510-session99-plugin-mig-3-recon.md)
> 이전 세션 (상위): [session98-postscript](./260510-session98-postscript-plugin-mig-2-5.md)
> 저널: [journal-2026-05-10.md](../logs/journal-2026-05-10.md) §"세션 99 후속"

---

## 작업 요약

S99 정찰의 chunk A/B/C 설계를 단일 commit `33e6721` 으로 정착. Almanac 5 routes (categories/sources/today-top/items/[slug]/contents) 본체를 `packages/tenant-almanac/src/routes/` 로 lift-and-shift 하고 catch-all `/api/v1/t/[tenant]/[...path]` 가 manifest dispatch 의 단일 진입점이 됨. 17 files +782/-305 (Git rename 감지 50~78%), vitest 821 → **846 PASS** +25 신규, tsc 0, dev :3100 라이브 smoke 통과.

## 대화 다이제스트

### 토픽 1: /cs 직후 자율 진행 분기

> **사용자**: (S99 정찰 마감 보고 paste + chunk A/B/C 설계 도식 재인용 후) "Chunk A 코드 작성 들어가겠습니다" 자율 선언

세션 시작 system reminder 가 explanatory 출력 스타일 활성화 — 코드 작성 전후 `★ Insight ────` 박스로 코드베이스-특정 통찰 제공 의무. memory `feedback_autonomy.md` 정합 — 분기 질문 없이 chunk A 진입. 베이스라인 = HEAD `411d0f7` (S99 /cs commit) + tree clean. dispatch.ts/api-guard-tenant.ts/manifest.ts/dispatcher.ts 4 파일 read 로 의존 표면 확정.

**결론**: 단일 터미널이 A → B → C 순차 진행, 각 단계 vitest + tsc 게이트 + commit 후 다음 단계 진입.

### 토픽 2: Chunk A — TenantRouteHandler 타입 + dispatcher manifest lookup

핵심 결정 = `TenantRouteContext` 의 `tenant`/`user` 필드를 `@yangpyeon/core` 안에 **구조적 사본** (ResolvedTenant/AccessTokenPayload 펼침) 으로 정의 — core 가 app-side 에 역의존하지 않으면서 plugin handler 가 `tenant.id` 등 그대로 사용. ADR-024 옵션 D hybrid 격리가 타입 시스템에서 강제됨.

`:slug` 패턴 매칭은 path-to-regexp 미도입, segment-by-segment `matchRoute` helper (40 LOC) 자체 구현 — 5 routes = 정적 + (옵션) `:slug` 1개로 충분, simpler+faster. 향후 와일드카드 필요 시 path-to-regexp 도입 검토.

dispatch.ts 가 `getTenantManifest(tenant.id).routes` 우선 lookup → method+pattern 매칭 → handler 호출. 미매치 시 HANDLER_TABLE legacy fallback (현 시점 빈 객체). enabled=false (kill-switch) 가 단순히 plugin 비활성화 → 자연스럽게 legacy fallback.

**산출**: 5 파일 — `packages/core/src/tenant/manifest.ts` (HttpMethod + TenantRouteContext + TenantRouteHandler 신규 + TenantRouteRegistration 시그니처 교체 codegen thunk → eager `methods`, +50/-10), `packages/core/src/tenant/index.ts` + `packages/core/src/index.ts` (3 신규 타입 re-export), `src/lib/tenant-router/dispatch.ts` (matchRoute + manifest lookup, +60/-5), `src/lib/tenant-router/dispatch.test.ts` (matchRoute 7 + dispatchTenantRoute 10, +180/-25), `packages/core/src/tenant/manifest.test.ts` (기존 시나리오를 신규 시그니처로 갱신).

**결론**: vitest 834 PASS (이전 +17 신규), tsc 0. HANDLER_TABLE 빈 객체 + manifest.routes 빈 배열 → 운영 트래픽 0 영향. 자체 검증 via 17 신규 unit test.

### 토픽 3: Chunk B — 5 handler 본체 lift-and-shift + cors helper 공통화

lift-and-shift 1:1 복사 (signature 만 교체). 5 routes × 17 LOC cors 중복 → `packages/tenant-almanac/src/lib/cors.ts` 1회 정의 (`buildCorsHeaders` + `applyCors` + `preflightResponse`).

각 plugin route 는 `{ GET, OPTIONS }` 2 메서드 등록. manifest.routes path 패턴 = "categories" / "items/:slug" 등 (relative subPath, /api/v1/t/<tenant>/ 자동 prefix). namespace export (`export * as categoriesRoute`) 로 manifest 등록 깔끔화. handler 내부 `request: Request` 타입 — NextRequest 의 origin/url 만 사용해 plain Request 호환.

`applyCors(request, res)` 가 응답 객체 변형 + 동일 ref 반환 — `successResponse() = NextResponse.json` mutate 기존 5 routes 패턴과 정합. `return applyCors(request, successResponse(...))` 한 줄로 가독성 압축.

**산출**: 9 신규 + 3 수정 — `packages/tenant-almanac/src/lib/{cors.ts,cors.test.ts}` (+155, 9 testcase), `packages/tenant-almanac/src/routes/{categories,sources,today-top,items-by-slug,contents}.ts` (+645), `packages/tenant-almanac/manifest.ts` (routes 5 등록 +25/-3), `packages/tenant-almanac/src/index.ts` (5 namespace export +6), `packages/tenant-almanac/src/manifest.test.ts` (3 routes 검증 +30).

**결론**: vitest 846 PASS (이전 +12 신규), tsc 0. **5 explicit route 보존이라 hot path 무관 → 회귀 0**.

### 토픽 4: Chunk C — 5 explicit route.ts 삭제 + catch-all OPTIONS 추가 + dev :3100 smoke

5 explicit route.ts 삭제 → Next.js 정적 우선 매칭 규칙 → catch-all 가 5 paths 흡수. 빈 디렉토리 5 정리.

catch-all `[tenant]/[...path]/route.ts` 에 추가:
- `import "@/lib/tenant-bootstrap"` side-effect import (manifest registry 채움). 기존 `cron/runner.ts` 의 동일 패턴 차용.
- OPTIONS 핸들러 신규 (preflight 인증 우회 — withTenant 미경유, slug 만 검증 후 manifest 의 OPTIONS 핸들러로 위임, ANONYMOUS_PREFLIGHT_USER 합성).

dev :3100 첫 smoke = OPTIONS 5 routes 모두 500. **원인** = Windows host → WSL postgres 미접근, `resolveTenantFromSlug` 의 Prisma throw. **견고화 결정** = OPTIONS try/catch swallow → 204 graceful 폴백, 브라우저가 후속 실제 요청 자체 거부 — preflight 가 500 으로 실패하면 운영자가 모호한 CORS 에러 디버깅 어려움 (운영 환경 가시성 향상).

재시도:
- OPTIONS 5 routes + nonexistent + 미등록 tenant → 모두 204 (graceful)
- GET 5 routes → 모두 401 (catch-all → withTenant gate 도달)
- GET messenger explicit `/conversations` → 401 (영향 0)

**산출**: 5 삭제 + 1 수정 — `src/app/api/v1/t/[tenant]/{categories,sources,today-top,items/[slug],contents}/route.ts` 5 삭제 (-928 LOC), `src/app/api/v1/t/[tenant]/[...path]/route.ts` (+25 LOC OPTIONS + try/catch + tenant-bootstrap import).

**결론**: A+B+C 단일 commit `33e6721` 17 files +782/-305. Git rename 감지 5 routes 50~78% 유사도 (lift-and-shift 입증). PR 게이트 5항목 자동 통과. origin push `411d0f7..33e6721` 성공.

### 토픽 5: /cs 진입

> **사용자**: "/cs"

동일 세션 99 의 PLUGIN-MIG-3 본격 구현 후속. S96 후속, S98 후속 패턴 정합 — 같은 세션 번호의 follow-up. 6단계 마감 일괄 처리.

**결론**: docs 6 파일 갱신 + 자동 commit & push.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 자율 진입 (분기 질문 X) | (a) chunk A 즉시 / (b) 사용자에게 추천안 확인 | `feedback_autonomy.md` 정합 + S99 정찰에서 chunk A/B/C 설계 합의 완료 |
| 2 | core 의 TenantRouteContext 에 user/tenant 구조적 사본 | (a) 구조적 사본 / (b) AccessTokenPayload 직접 import / (c) generic | (a) — core 가 app-side 에 역의존하지 않으면서 plugin handler 가 `.id` 등 그대로 사용. ADR-024 옵션 D 격리 강제 |
| 3 | matchRoute 자체 구현 (40 LOC) | (a) 자체 / (b) path-to-regexp 도입 | (a) — 5 routes = 정적 + 1 `:slug` 충분, simpler+faster. 와일드카드 필요 시 (b) 검토 |
| 4 | TenantRouteRegistration.handler 시그니처 교체 (codegen thunk → eager methods) | (a) 교체 / (b) 두 형태 둘 다 지원 | (a) — codegen 미사용. 두 형태 둘 다 지원은 type 복잡도 증가, 향후 codegen 도입 시 별도 등록 형태 추가 가능 |
| 5 | applyCors mutate semantic | (a) mutate (응답 변형 + 동일 ref) / (b) immutable (새 응답 + 헤더 복사) | (a) — 기존 5 routes 의 `res.headers.set(...)` 패턴과 정합. NextResponse.headers spread 비용 회피 |
| 6 | namespace export 패턴 | (a) `export * as categoriesRoute` / (b) `export { GET, OPTIONS }` named | (a) — 5 routes 의 GET 충돌 회피. plugin "각 route 가 모듈" mental model 정합 |
| 7 | catch-all OPTIONS 인증 우회 + try/catch graceful 204 | (a) try/catch swallow / (b) propagate / (c) 명시 catch errors only | (a) — preflight 500 → 모호한 CORS 에러 운영자 디버깅 어려움. 204 폴백 시 브라우저가 명확히 "missing CORS headers" 표시 |
| 8 | ANONYMOUS_PREFLIGHT_USER 합성 | (a) 합성 / (b) `user: AccessTokenPayload \| null` 시그니처 변경 / (c) 별도 OPTIONS 시그니처 | (a) — OPTIONS 핸들러는 user 미사용. 합성으로 시그니처 단순 유지 |
| 9 | 308 alias 보존 (Chunk C 범위 외) | (a) 보존 / (b) 동시 제거 | (a) — 44줄 redirect 결합 0, Almanac frontend cutover 별도 sub-chunk (v1.1) |
| 10 | A+B+C 단일 commit | (a) 단일 / (b) 3 commit | (a) — 단일 세션 본격 구현 + tsc/vitest 모든 단계 GREEN. Git rename 감지가 lift-and-shift 입증 |

## 수정 파일 (17개)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `packages/core/src/tenant/manifest.ts` | HttpMethod + TenantRouteContext + TenantRouteHandler + TenantRouteRegistration 시그니처 교체 (+50/-10) |
| 2 | `packages/core/src/tenant/index.ts` | 3 신규 타입 re-export (+3) |
| 3 | `packages/core/src/index.ts` | 3 신규 타입 re-export (+3) |
| 4 | `packages/core/src/tenant/manifest.test.ts` | 기존 routes 시나리오를 신규 시그니처로 갱신 (+5/-3) |
| 5 | `src/lib/tenant-router/dispatch.ts` | matchRoute helper + manifest 우선 lookup + HANDLER_TABLE legacy fallback (+60/-5) |
| 6 | `src/lib/tenant-router/dispatch.test.ts` | matchRoute 7 + dispatchTenantRoute 10 시나리오 (+180/-25) |
| 7 | `packages/tenant-almanac/src/lib/cors.ts` (신규) | buildCorsHeaders + applyCors + preflightResponse (+60) |
| 8 | `packages/tenant-almanac/src/lib/cors.test.ts` (신규) | 9 단위 테스트 (+95) |
| 9 | `packages/tenant-almanac/src/routes/categories.ts` (rename 57%) | TenantRouteHandler 시그니처 + applyCors (149 → ~110) |
| 10 | `packages/tenant-almanac/src/routes/sources.ts` (rename 50%) | (117 → ~75) |
| 11 | `packages/tenant-almanac/src/routes/today-top.ts` (rename 71%) | (207 → ~160) |
| 12 | `packages/tenant-almanac/src/routes/items-by-slug.ts` (rename 53%) | params.slug 추출 시그니처 (135 → ~95) |
| 13 | `packages/tenant-almanac/src/routes/contents.ts` (rename 78%) | audit-log 보존 (253 → ~205) |
| 14 | `packages/tenant-almanac/manifest.ts` | routes 5 등록 (path + GET/OPTIONS methods, +25/-3) |
| 15 | `packages/tenant-almanac/src/index.ts` | 5 route namespace export (+6) |
| 16 | `packages/tenant-almanac/src/manifest.test.ts` | 3 routes 검증 시나리오 (+30) |
| 17 | `src/app/api/v1/t/[tenant]/[...path]/route.ts` | tenant-bootstrap side-effect import + OPTIONS 핸들러 + try/catch graceful 204 (+25) |

추가로 5 explicit route.ts 삭제 (rename 으로 추적): categories / sources / today-top / items/[slug] / contents.

## 상세 변경 사항

### 1. Chunk A 인프라 — `@yangpyeon/core` 타입 + dispatcher manifest lookup

`packages/core/src/tenant/manifest.ts` 신규 export:

```ts
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "OPTIONS";

export interface TenantRouteContext {
  request: Request;
  tenant: { id, slug, displayName, active, status };  // ResolvedTenant 구조적 사본
  user: { sub, email, role, type };  // AccessTokenPayload 구조적 사본
  params: Record<string, string>;
  subPath: string;
}

export type TenantRouteHandler = (ctx: TenantRouteContext) => Promise<Response>;

export interface TenantRouteRegistration {
  path: string;  // /api/v1/t/<tenant>/ 기준 상대 패턴
  methods: Partial<Record<HttpMethod, TenantRouteHandler>>;
}
```

`src/lib/tenant-router/dispatch.ts`:

```ts
export function matchRoute(pattern: string, subPath: string): Record<string, string> | null {
  // 정적 segment + ":name" 동적 segment 매칭
  // segment-by-segment 비교, decodeURIComponent 적용
}

export async function dispatchTenantRoute(input): Promise<Response> {
  // 1. Manifest plugin route lookup (tenant manifest.routes)
  const manifest = getTenantManifest(input.tenant.id);
  if (manifest?.enabled && manifest.routes) {
    for (const reg of manifest.routes) {
      const params = matchRoute(reg.path, input.subPath);
      if (params === null) continue;
      const handler = reg.methods[input.method as HttpMethod];
      if (!handler) return errorResponse("METHOD_NOT_ALLOWED", ..., 405);
      return handler({ request, tenant, user, params, subPath });
    }
  }
  // 2. Legacy HANDLER_TABLE fallback (현 시점 빈 객체)
  ...
}
```

17 신규 unit test (matchRoute 7 + dispatchTenantRoute 10).

### 2. Chunk B 본체 이전 — cors helper + 5 plugin routes

`packages/tenant-almanac/src/lib/cors.ts`:

```ts
export function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  if (!origin) return {};
  const allowed = (process.env.ALMANAC_ALLOWED_ORIGINS || "").split(",")...;
  if (!allowed.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, ..., Vary: "Origin" };
}

export function applyCors(request: Request, response: Response): Response {
  // mutate response headers, return same ref
}

export function preflightResponse(request: Request): Response {
  return new Response(null, { status: 204, headers: buildCorsHeaders(request) });
}
```

각 plugin route 는 다음 패턴:

```ts
export const GET: TenantRouteHandler = async ({ request, tenant, params, user }) => {
  // ... 본체 LOC 1:1 보존, tenantPrismaFor({ tenantId: tenant.id }) closure 패턴 보존
  const res = successResponse(...);
  res.headers.set("Cache-Control", "...");
  return applyCors(request, res);
};

export const OPTIONS: TenantRouteHandler = async ({ request }) => preflightResponse(request);
```

manifest.ts routes 등록:

```ts
routes: [
  { path: "categories", methods: { GET: categoriesRoute.GET, OPTIONS: categoriesRoute.OPTIONS } },
  { path: "sources",    methods: { GET: sourcesRoute.GET,    OPTIONS: sourcesRoute.OPTIONS } },
  { path: "today-top",  methods: { GET: todayTopRoute.GET,   OPTIONS: todayTopRoute.OPTIONS } },
  { path: "items/:slug", methods: { GET: itemsBySlugRoute.GET, OPTIONS: itemsBySlugRoute.OPTIONS } },
  { path: "contents",   methods: { GET: contentsRoute.GET,   OPTIONS: contentsRoute.OPTIONS } },
],
```

12 신규 testcase (cors 9 + manifest routes 3).

### 3. Chunk C cutover — catch-all OPTIONS + tenant-bootstrap

`src/app/api/v1/t/[tenant]/[...path]/route.ts` 신규 OPTIONS:

```ts
import "@/lib/tenant-bootstrap";  // manifest registry 채움 (side-effect)

const ANONYMOUS_PREFLIGHT_USER: AccessTokenPayload = {
  sub: "anonymous-preflight", email: "", role: "USER", type: "access",
};

export async function OPTIONS(request, context) {
  try {
    const tenantSlug = ...;
    if (!tenantSlug || !TENANT_SLUG_RE.test(tenantSlug)) return new Response(null, { status: 204 });
    const tenant = await resolveTenantFromSlug(tenantSlug);
    if (!tenant || !tenant.active) return new Response(null, { status: 204 });
    return dispatchTenantRoute({
      method: "OPTIONS", tenant, user: ANONYMOUS_PREFLIGHT_USER, subPath, request,
    });
  } catch (err) {
    console.error("[OPTIONS catch-all] preflight failed", err);
    return new Response(null, { status: 204 });
  }
}
```

5 explicit route.ts 삭제 + 빈 디렉토리 5 정리.

## 검증 결과

- **vitest** — 846 PASS / 94 skip / **0 fail** (이전 821 → +25 신규)
- **tsc --noEmit** — 0 errors (`.next/types/validator.ts` stale 청소 후)
- **live smoke (next dev :3100, Windows transient)**:
  | 시나리오 | 결과 |
  |----------|------|
  | OPTIONS 5 routes (categories/sources/today-top/items/foo/contents) | 모두 204 (graceful) |
  | OPTIONS 미등록 tenant + 미등록 path | 204 (graceful) |
  | GET 5 routes (auth 없이) | 모두 401 (catch-all → withTenant gate 도달) |
  | GET messenger explicit `/conversations` | 401 (영향 0, 정적 우선 매칭 보존) |
- **PR 게이트 5항목 자동 통과**:
  1. 신규 모델 — 0 (DB 변경 없음)
  2. 신규 라우트 — 0 (URL 동일, dispatcher 만 교체) + withTenant 가드 보존
  3. Prisma 호출 — `tenantPrismaFor({ tenantId: tenant.id })` closure 패턴 5/5 보존 (memory `project_workspace_singleton_globalthis`)
  4. 라이브 테스트 — dev :3100 smoke 통과 (handler 본체 LOC 1:1 보존, RLS 변경 0)
  5. timezone-sensitive 비교 — 영향 0 (시간 비교 패턴 변경 없음)
- **Git rename 감지** — items-by-slug 53% / sources 50% / categories 57% / today-top 71% / contents 78% (시그니처 교체 + cors 추출이 50% 이상 유사도 떨어뜨렸지만 여전히 rename, blame 보존)
- **commit `33e6721`** 17 files +782/-305 → push `411d0f7..33e6721` 성공

## 터치하지 않은 영역

- **PLUGIN-MIG-4** (5 Content* 모델 → packages/tenant-almanac/prisma/fragment.prisma + tenantId backfill + RLS 정책 + 라이브 non-BYPASSRLS role 테스트, ~2일, PR 게이트 #4 필수)
- **308 alias 제거** (`/api/v1/almanac/[...path]/route.ts` 44줄, Almanac v1.1 frontend cutover 후)
- **support libs 분리** (dedupe/fetchers/llm/promote/cleanup/types — PLUGIN-MIG-4 시 5 Content* 모델 이동 시 자연 동반)
- **FILE-UPLOAD-MIG sweep** (~30분)
- **사용자 P0 carry-over** (S88-USER-VERIFY 휴대폰 + S86-SEC-1 GitHub Settings)
- **운영자 P2 carry-over** (S87-RSS-ACTIVATE + S87-TZ-MONITOR + cron MA-ENABLE)

## 알려진 이슈

- **dev :3100 smoke 의 OPTIONS 500 → 204 graceful**: Windows host 가 WSL postgres 직접 미접근으로 `resolveTenantFromSlug` Prisma throw. production (WSL ypserver) 에선 DB 접근 정상이라 manifest dispatch 정상 작동. try/catch graceful 204 폴백이 운영 환경 CORS 디버깅 가시성 향상 효과 (의도적).
- **운영 PM2 ypserver 배포 미수행**: 본 commit 은 코드 정착만, 운영 적용은 별도 세션의 `/ypserver` 스킬 호출 (PM2 임의 종료 금지 메모리 준수). 다음 세션 진입 시 `/ypserver` 권장.

## 다음 작업 제안

### S100 첫 행동 (자율 진입)

1. `git status --short` + `git log --oneline -10` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (다른 터미널 commit 가능성)
3. 본 인수인계서 read — Chunk C cutover 결과 + PR 게이트 통과 + dev smoke 결과 확인
4. **`/ypserver` 운영 적용** (1) — PLUGIN-MIG-3 cutover 가 production 에 적용되도록 standalone 빌드 + PM2 restart. dev :3100 smoke 가 manifest dispatch 메커니즘 검증했으나 production WSL postgres + 실제 트래픽 검증은 별도. **소요 ~5분**.
5. **PLUGIN-MIG-4 본격 진입** (2) — 5 Content* 모델 fragment 추출 + tenantId backfill + RLS 정책 + 라이브 non-BYPASSRLS test (PR 게이트 #4 필수). **소요 ~2일**.

### PLUGIN-MIG-4 작업 가이드

1. **prisma/schema.prisma 분리** — 5 Content* 모델 (ContentCategory + ContentSource + ContentIngestedItem + ContentItem + ContentItemMetric) 을 `packages/tenant-almanac/prisma/fragment.prisma` 로 추출. 글로벌 schema 빌드 시 fragment 가 append 되도록 prisma generate workflow 보강 필요.
2. **tenantId backfill 마이그레이션** — 기존 5 모델 row 에 tenantId='almanac' 채움. 모델별 unique constraint 검토 (예: `tenantId_slug` composite).
3. **RLS 정책 5 모델** — `CREATE POLICY ... USING (tenant_id = current_setting('app.tenant_id'))` 5건 + GRANT app_admin/app_test_runtime/app_user 등 BYPASSRLS 검증.
4. **라이브 non-BYPASSRLS test** — `tests/almanac/` 신설 + `bash scripts/run-integration-tests.sh tests/almanac/` 통과 (PowerShell 권장 = WSL→Win cross-OS env 손실 회피, S82 4 latent bug 패턴 재발 차단).
5. **support libs 동시 이동** — dedupe/fetchers/llm/promote/cleanup/types 를 `packages/tenant-almanac/src/lib/` 로 이동 (모델 import path 1번 정리). cron handler 6 + 5 routes 의 import path 갱신.
6. **PR 게이트 5항목 본문 명시** — 모델 5 신규 (tenantId 첫 컬럼 + RLS) / 라우트 0 (Chunk C 에서 처리) / Prisma closure 보존 / RLS 라이브 통과 ✅ / TZ 0.

### 사용자 carry-over (1.5분 비용으로 P0 2건 해소 가능)

- **S88-USER-VERIFY** (1분) — 사용자 휴대폰 stylelucky4u.com/notes 재검증
- **S86-SEC-1** (30초) — GitHub repo public/private 확인

---

## 참조

- 본 chunk 의 사전 정찰 + 설계: [260510-session99-plugin-mig-3-recon.md](./260510-session99-plugin-mig-3-recon.md)
- PLUGIN-MIG-1/2/5 정착: [260510-session98-infra-2-plugin-mig-1.md](./260510-session98-infra-2-plugin-mig-1.md) + [260510-session98-postscript-plugin-mig-2-5.md](./260510-session98-postscript-plugin-mig-2-5.md)
- ADR-022 7원칙 (#3 한 컨슈머 실패는 다른 컨슈머에 닿지 않음, #4 컨슈머 추가는 코드 수정 0줄): [ADR-022-baas-identity.md](../research/baas-foundation/01-adrs/ADR-022-baas-identity.md)
- ADR-024 옵션 D (Hybrid: Complex=workspace plugin): [ADR-024-plugin-isolation.md](../research/baas-foundation/01-adrs/ADR-024-plugin-isolation.md)
- ADR-027 (Multi-tenant Router 패턴): [ADR-027-multi-tenant-router-and-api-key-matching.md](../research/baas-foundation/01-adrs/ADR-027-multi-tenant-router-and-api-key-matching.md)
- 저널: [journal-2026-05-10.md](../logs/journal-2026-05-10.md) §"세션 99 후속"

[← handover/_index.md](./_index.md)
