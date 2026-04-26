# 05 — ADR-026 (TS+DB Hybrid Manifest) Implementation Spec

> **상태**: DRAFT (2026-04-26)
> **Wave**: 04 architecture
> **Source ADR**: `docs/research/baas-foundation/01-adrs/ADR-026-tenant-manifest-schema.md` (옵션 C ACCEPTED, 8 부속 결정 모두 권고대로 확정)
> **목적**: ADR-026 옵션 C(Hybrid TS manifest.ts + DB 운영 토글)를 코드/DB 레벨에서 즉시 구현 가능하도록 스키마·헬퍼·effective config·마이그레이션 절차를 동결.

---

## 1. 결정 요약 (8 부속 결정)

ADR-026 §7에서 ACCEPTED된 8 부속 결정을 본 spec의 입력 계약으로 고정한다.

| # | 결정 항목 | 동결값 | 본 spec 매핑 |
|---|-----------|--------|--------------|
| 1 | 모델 선택 | 옵션 C — TS manifest.ts(정의) + DB tenants 테이블(운영 토글) | §2 (TS) + §4 (DB) |
| 2 | manifest 위치 | `packages/tenant-<id>/manifest.ts` | §3 + §6 |
| 3 | TenantManifestSchema 정의 | ADR-026 §5.1 그대로 | §2 (Zod 스키마 전문 이식) |
| 4 | Tenant Prisma 모델 | ADR-026 §5.2 그대로 | §4 (확장 + 인덱스 보강) |
| 5 | effective config 산출 함수 | ADR-026 §5.3 그대로 | §5 (시그니처 + 구현) |
| 6 | Almanac manifest 위치 | `packages/tenant-almanac/manifest.ts` | §6 (완전 예시) |
| 7 | 글로벌 cron_jobs/edge_functions 모델 | ADR-026 §8 마이그레이션 | §8 (단계별 절차) |
| 8 | manifest 변경 시 deploy 절차 | ADR-026 §9 | §7 (TS/DB 2 트랙) |

**핵심 1줄 요약**: "정의는 코드(manifest.ts), 토글은 DB(tenants row)" — 두 진실 소스를 책임 분리 매트릭스(ADR-026 §4.2)로 명확히 가른다.

---

## 2. TenantManifest TypeScript 타입 (Zod)

### 2.1 책임 7가지 매핑 표

| # | 책임 | Zod 필드 | 검증 규칙 핵심 | 예시 값 |
|---|------|----------|----------------|---------|
| 1 | 신원 | `id`, `name`, `owner`, `createdAt`, `description?` | id는 url-safe slug, owner.userId는 UUID v4 | `id: "almanac"` |
| 2 | 데이터 | `data.schemas[]`, `data.isolation`, `data.schemaName?` | isolation enum 4종(ADR-023), schema-per-tenant 시 schemaName 필수 | `isolation: "schema-per-tenant"` |
| 3 | Cron | `cron[]` | id slug 유일, schedule node-cron 표현식, handler 함수 ref | `schedule: "*/15 * * * *"` |
| 4 | Routes | `routes[]` | path 절대경로 슬러그, auth 4종, rateLimit optional | `auth: "publishable"` |
| 5 | Permissions | `permissions{role: string[]}` | role 이름 → glob 패턴 배열 | `["read:contents"]` |
| 6 | Quota | `quota.{rateLimit,storage?,cronTicks?,llm?,fetch?}` | rateLimit 필수, 나머지 optional | `withApiKey: 600` |
| 7 | Hooks | `hooks?.{onProvision?,onUpgrade?,onDecommission?}` | 함수 ref, 모두 optional | `onProvision: async () => {}` |

### 2.2 Zod 스키마 전문

```typescript
// packages/yangpyeon-core/src/manifest/schema.ts
// (ADR-026 §5.1 ACCEPTED — 본 spec에서는 검증 보강만 추가)
import { z } from "zod";

// ─────────────────────────────────────────────────────────
// (1) 보조 enum/regex 상수
// ─────────────────────────────────────────────────────────
const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;          // tenant id, cron id 공통
const TENANT_ID_RE = /^[a-z][a-z0-9-]{2,30}$/;     // tenant id 더 짧게
const ROUTE_PATH_RE = /^\/[a-z0-9/_:-]*$/;         // 절대경로 슬러그
const CRON_EXPR_RE = /^[*/0-9 ,\-]+$/;             // node-cron 단순 검증

const IsolationEnum = z.enum([
  "schema-per-tenant",   // ADR-023 옵션 A — PG schema 분리
  "row-level-rls",       // ADR-023 옵션 B — RLS
  "db-per-tenant",       // ADR-023 옵션 C — 인스턴스 분리
  "shared-schema",       // 공유 (개발/임시)
]);

const HttpMethodEnum = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const AuthScopeEnum = z.enum([
  "public",              // 무인증 (allow-list 차단 가능)
  "publishable",         // PUBLISHABLE API key
  "secret",              // SECRET API key
  "admin",               // 관리자 세션 (대시보드)
]);

// ─────────────────────────────────────────────────────────
// (2) Cron / Route / Quota 서브 스키마
// ─────────────────────────────────────────────────────────
const CronSpec = z.object({
  id: z.string().regex(SLUG_RE, "cron id must be slug"),
  schedule: z.string().regex(CRON_EXPR_RE, "invalid cron expression"),
  handler: z.function(),                           // (payload) => Promise<void>
  payload: z.unknown().optional(),
  timeoutMs: z.number().int().positive().default(30_000),
  description: z.string().max(200).optional(),
});

const RouteSpec = z.object({
  method: HttpMethodEnum,
  path: z.string().regex(ROUTE_PATH_RE, "path must be slug-style absolute"),
  handler: z.function(),                           // Next.js Route Handler
  auth: AuthScopeEnum,
  rateLimit: z.object({
    rpm: z.number().int().positive(),
    burst: z.number().int().positive().optional(),
  }).optional(),
  cors: z.object({
    allowOrigins: z.array(z.string().url()).min(1),
  }).optional(),
});

const QuotaSpec = z.object({
  rateLimit: z.object({
    anonymous: z.number().int().positive(),         // /min/IP
    withApiKey: z.number().int().positive(),        // /min/key
  }),
  storage: z.object({
    maxBytes: z.number().int().positive(),
  }).optional(),
  cronTicks: z.object({
    dailyBudget: z.number().int().positive(),
  }).optional(),
  llm: z.object({
    dailyTokens: z.number().int().positive(),
    providers: z.array(z.string()).optional(),
  }).optional(),
  fetch: z.object({
    allowedHosts: z.array(z.string().min(1)).min(1), // SSRF 방어
  }).optional(),
});

// ─────────────────────────────────────────────────────────
// (3) TenantManifest 본체
// ─────────────────────────────────────────────────────────
export const TenantManifestSchema = z.object({
  // 1. 신원
  id: z.string().regex(TENANT_ID_RE),
  name: z.string().min(1).max(100),
  owner: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
  }),
  createdAt: z.string().date(),                     // ISO date "YYYY-MM-DD"
  description: z.string().max(500).optional(),

  // 2. 데이터 정의
  data: z.object({
    schemas: z.array(z.string().min(1)).min(1),
    isolation: IsolationEnum,
    schemaName: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/).optional(),
  }).superRefine((d, ctx) => {
    if (d.isolation === "schema-per-tenant" && !d.schemaName) {
      ctx.addIssue({
        code: "custom",
        message: "schemaName is required when isolation=schema-per-tenant",
        path: ["schemaName"],
      });
    }
  }),

  // 3. Cron 정의
  cron: z.array(CronSpec)
    .default([])
    .refine(
      (arr) => new Set(arr.map((c) => c.id)).size === arr.length,
      { message: "cron[].id must be unique within tenant" },
    ),

  // 4. Route 정의
  routes: z.array(RouteSpec)
    .default([])
    .refine(
      (arr) => new Set(arr.map((r) => `${r.method} ${r.path}`)).size === arr.length,
      { message: "(method,path) must be unique within tenant" },
    ),

  // 5. Permissions/Scopes
  permissions: z.record(
    z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),    // role 이름
    z.array(z.string().regex(/^[a-z*]+:[a-z*_-]+$/))  // "read:contents", "write:*"
  ).default({}),

  // 6. Quota
  quota: QuotaSpec,

  // 7. Lifecycle hooks
  hooks: z.object({
    onProvision: z.function().optional(),
    onUpgrade: z.function().optional(),
    onDecommission: z.function().optional(),
  }).optional(),
});

export type TenantManifest = z.infer<typeof TenantManifestSchema>;
```

### 2.3 검증 규칙 보강 (ADR-026 § 5.1 대비 추가분)

| 규칙 | 의도 | 위치 |
|------|------|------|
| `cron[].id` 유일성 | 동일 tenant 내 cron id 중복 시 registry 충돌 방지 | `cron.refine(...)` |
| `(method, path)` 유일성 | router 등록 충돌 방지 | `routes.refine(...)` |
| `schemaName` 조건 필수 | schema-per-tenant 채택 시 PG schema 이름 누락 방지 | `data.superRefine(...)` |
| `permissions` 패턴 검증 | `"read:contents"` 같은 glob 형식 강제 | `permissions` value regex |
| `cors.allowOrigins[]` URL | 잘못된 origin 입력 차단 | `RouteSpec.cors` |

---

## 3. defineTenant() 헬퍼

### 3.1 시그니처

```typescript
// packages/yangpyeon-core/src/manifest/define.ts
import { TenantManifestSchema, type TenantManifest } from "./schema";

/**
 * 빌드 타임 + 런타임 양쪽에서 manifest를 검증하는 type-safe factory.
 *
 * - 빌드 타임: TS 컴파일러가 핸들러 시그니처 mismatch를 잡음 (옵션 D 효과)
 * - 런타임: TenantManifestSchema.parse 가 의미 검증 (cron id 유일성, isolation/schemaName 짝)
 * - IDE: TenantManifest 타입에서 autocomplete + F12 jump
 *
 * 호출 예: `export default defineTenant({ id: "almanac", ... })`
 */
export function defineTenant<T extends TenantManifest>(manifest: T): T {
  // parse 는 새 객체를 반환하지만 함수 ref(handler) 등은 보존됨.
  // T extends TenantManifest 제너릭으로 호출자 타입 정밀도 유지.
  const parsed = TenantManifestSchema.parse(manifest);
  return parsed as T;
}
```

### 3.2 빌드 타임 vs 런타임 검증 책임 분리

| 단계 | 검증 항목 | 도구 |
|------|-----------|------|
| TS 컴파일 (`pnpm build`) | handler 시그니처, payload 타입, enum 오타, optional/required | tsc --noEmit |
| `defineTenant()` 호출 (모듈 로드 시) | regex, slug 유일성, isolation/schemaName 짝, cron 표현식 형태 | Zod |
| 통합 테스트 (`pnpm test:manifest`) | 실제 cron 파서 검증, route handler 호출 가능성 | vitest + node-cron parser |
| 부팅 시 (`loadAllTenants()`) | tenant id가 DB tenants row와 매칭되는지 | runtime + Prisma |

---

## 4. Prisma Tenant 모델 (DB)

ADR-026 §5.2를 본 spec에서 인덱스/관계를 보강한 형태로 동결한다. 기존 `prisma/schema.prisma` 패턴(`@map("..."), @db.Timestamptz(3), enum 정의 위치` 등)을 그대로 따른다.

### 4.1 Tenant 모델 + enum

```prisma
// prisma/schema.prisma 추가

/// ADR-026 — 1 tenant = 1 격리 워크스페이스 (조직 3계층 도입 금지).
/// "정의(스키마/cron/route)는 코드(manifest.ts), 운영 토글(status/quota)은 DB"라는 책임 분리.
/// manifestSnapshot: 마지막 빌드 시점 manifest 직렬화 사본 (감사/디버깅용, 결정 진실은 코드).
/// status: 동적 토글 — suspended 즉시 cron 정지 + route 503.
model Tenant {
  id                String         @id                                  // manifest.id 와 동일 (FK 키)
  name              String
  ownerId           String         @map("owner_id")
  owner             User           @relation("UserTenants", fields: [ownerId], references: [id])
  status            TenantStatus   @default(active)

  // 코드 manifest의 직렬화 스냅샷 (handler 함수는 string ref로 치환).
  // 부팅 시 코드 manifest와 비교 → drift 감지 (§5.3).
  manifestSnapshot  Json           @map("manifest_snapshot")
  manifestVersion   Int            @default(1) @map("manifest_version") // 빌드마다 증가
  manifestSyncedAt  DateTime?      @map("manifest_synced_at") @db.Timestamptz(3)

  // 운영 토글 (manifest 값을 override) — JSON shape 은 §5.2 참조
  cronOverrides     Json           @default("{}") @map("cron_overrides")
  quotaOverrides    Json           @default("{}") @map("quota_overrides")
  routeOverrides    Json           @default("{}") @map("route_overrides")  // { "GET /contents": { rpm: 1200 } }

  // 관계 (ADR-023 멀티테넌트 backfill 후 모든 도메인 모델에 tenantId FK 추가)
  apiKeys           ApiKey[]       @relation("TenantApiKeys")
  cronJobs          CronJob[]      @relation("TenantCronJobs")
  edgeFunctions     EdgeFunction[] @relation("TenantEdgeFunctions")
  webhooks          Webhook[]      @relation("TenantWebhooks")

  createdAt         DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime       @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
  archivedAt        DateTime?      @map("archived_at") @db.Timestamptz(3)

  @@index([status])
  @@index([ownerId, status])
  @@map("tenants")
}

enum TenantStatus {
  active        // 정상 운영
  suspended     // 일시 정지 (cron/route 모두 차단, kill switch)
  archived      // 영구 종료 (데이터 보존, 신규 요청 차단)
}
```

### 4.2 운영 토글 JSON shape

| 필드 | 타입 | 예시 | 적용 위치 |
|------|------|------|-----------|
| `cronOverrides` | `Record<cronId, { enabled?: boolean; payloadOverride?: unknown }>` | `{"rss-fetch": {"enabled": false}}` | cron registry 등록 시 enabled 결정 |
| `quotaOverrides` | `Record<dotPath, number>` | `{"rateLimit.withApiKey": 1200, "llm.dailyTokens": 500000}` | computeEffectiveConfig deep merge |
| `routeOverrides` | `Record<"<METHOD> <path>", { rpm?: number; disabled?: boolean }>` | `{"GET /contents": {"rpm": 1200}}` | router 등록 시 rate limit override |

### 4.3 User 측 역관계 추가

```prisma
model User {
  // 기존 필드 ...
  tenants          Tenant[]            @relation("UserTenants")
}
```

### 4.4 기존 운영 메타 모델 tenant FK 추가

ADR-026 §8.1 마이그레이션 정신에 따라 `CronJob`/`EdgeFunction`/`Webhook`/`ApiKey`에 `tenantId` 추가 (정의는 manifest로 이주, DB는 운영 메타만 보유).

```prisma
model CronJob {
  // 기존: name @unique, schedule, kind, payload  → 정의 컬럼은 manifest로 이주
  id              String   @id @default(uuid())
  tenantId        String   @map("tenant_id")
  tenant          Tenant   @relation("TenantCronJobs", fields: [tenantId], references: [id], onDelete: Cascade)
  manifestCronId  String   @map("manifest_cron_id")     // manifest.cron[].id 참조
  enabled         Boolean  @default(true)
  lastRunAt       DateTime? @map("last_run_at") @db.Timestamptz(3)
  lastStatus      String?  @map("last_status")
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@unique([tenantId, manifestCronId])
  @@index([tenantId, enabled])
  @@map("cron_jobs")
}

model ApiKey {
  // 기존: prefix @unique, keyHash @unique, type, scopes
  id          String     @id @default(uuid())
  tenantId    String     @map("tenant_id")
  tenant      Tenant     @relation("TenantApiKeys", fields: [tenantId], references: [id], onDelete: Cascade)
  // 이하 동일 ...
  @@index([tenantId, type, revokedAt])
  @@map("api_keys")
}
```

(EdgeFunction/Webhook 도 동일 패턴 — §8.2 마이그레이션 단계에서 일괄 변경)

---

## 5. effective config 산출 함수

### 5.1 시그니처

```typescript
// packages/yangpyeon-core/src/runtime/effective-config.ts
import type { Tenant } from "@/generated/prisma";
import type { TenantManifest } from "@yangpyeon/core/manifest/schema";

export type EffectiveCron = TenantManifest["cron"][number] & {
  enabled: boolean;
  effectivePayload: unknown;
};
export type EffectiveRoute = TenantManifest["routes"][number] & {
  disabled: boolean;
  effectiveRateLimit: { rpm: number; burst?: number } | undefined;
};

export interface EffectiveConfig {
  manifest: TenantManifest;
  status: "active" | "suspended" | "archived";
  cron: EffectiveCron[];
  routes: EffectiveRoute[];
  quota: TenantManifest["quota"];   // override deep merge 적용 후
  driftWarnings: string[];          // §5.3 manifest snapshot drift
}

/**
 * 부팅 시 + 토글 변경 감지 시 호출. cron registry / router / rate limiter
 * 모두 이 결과를 단일 입력으로 사용해야 한다 (다른 경로로 manifest 직접 접근 금지).
 */
export function computeEffectiveConfig(
  manifest: TenantManifest,
  tenantRow: Pick<Tenant, "status" | "cronOverrides" | "quotaOverrides" | "routeOverrides" | "manifestSnapshot">
): EffectiveConfig;
```

### 5.2 구현 골격

```typescript
export function computeEffectiveConfig(manifest, tenantRow): EffectiveConfig {
  const cronOv = tenantRow.cronOverrides as Record<string, { enabled?: boolean; payloadOverride?: unknown }>;
  const routeOv = tenantRow.routeOverrides as Record<string, { rpm?: number; burst?: number; disabled?: boolean }>;
  const quotaOv = tenantRow.quotaOverrides as Record<string, number>;

  const effectiveCron: EffectiveCron[] = manifest.cron.map((job) => {
    const ov = cronOv[job.id] ?? {};
    return {
      ...job,
      enabled: ov.enabled ?? true,
      effectivePayload: ov.payloadOverride ?? job.payload,
    };
  });

  const effectiveRoutes: EffectiveRoute[] = manifest.routes.map((rt) => {
    const key = `${rt.method} ${rt.path}`;
    const ov = routeOv[key] ?? {};
    const baseRl = rt.rateLimit;
    return {
      ...rt,
      disabled: ov.disabled ?? false,
      effectiveRateLimit:
        ov.rpm !== undefined
          ? { rpm: ov.rpm, burst: ov.burst ?? baseRl?.burst }
          : baseRl,
    };
  });

  return {
    manifest,
    status: tenantRow.status,
    cron: effectiveCron,
    routes: effectiveRoutes,
    quota: applyQuotaOverrides(manifest.quota, quotaOv),
    driftWarnings: detectDrift(manifest, tenantRow.manifestSnapshot),
  };
}

// dot-path 기반 quota override (예: "rateLimit.withApiKey": 1200)
function applyQuotaOverrides(base, ov): TenantManifest["quota"] {
  const out = structuredClone(base);
  for (const [path, value] of Object.entries(ov)) {
    setByPath(out, path.split("."), value);
  }
  return out;
}
```

### 5.3 Drift 감지

manifest 코드와 DB 스냅샷이 어긋나면 (예: 새 cron 추가 후 빌드 누락) `driftWarnings[]`에 기록 + 부팅 후 어드민 알림.

```typescript
function detectDrift(code: TenantManifest, dbSnapshot: unknown): string[] {
  const out: string[] = [];
  const snap = dbSnapshot as { cron?: { id: string }[]; routes?: { method: string; path: string }[] } | null;
  if (!snap) {
    out.push("manifest snapshot is empty — initial sync required");
    return out;
  }
  const codeCronIds = new Set(code.cron.map((c) => c.id));
  const dbCronIds = new Set((snap.cron ?? []).map((c) => c.id));
  for (const id of codeCronIds) if (!dbCronIds.has(id)) out.push(`cron added in code, not in DB snapshot: ${id}`);
  for (const id of dbCronIds) if (!codeCronIds.has(id)) out.push(`cron removed in code, still in DB snapshot: ${id}`);
  // routes 동일 패턴 ...
  return out;
}
```

### 5.4 부팅 진입점

```typescript
// src/lib/manifest/load.ts (부팅 시 1회 + DB poll 60초 주기)
import { prisma } from "@/lib/prisma";
import { computeEffectiveConfig } from "@yangpyeon/core/runtime/effective-config";

const cache = new Map<string, EffectiveConfig>();

export async function getEffectiveConfig(tenantId: string): Promise<EffectiveConfig> {
  // 1) 코드 manifest (정적 import — packages/tenant-<id>/manifest.ts)
  const manifest = await loadManifestModule(tenantId);     // dynamic import 1회 캐시
  // 2) DB 운영 토글
  const tenantRow = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  // 3) merge
  const cfg = computeEffectiveConfig(manifest, tenantRow);
  cache.set(tenantId, cfg);
  return cfg;
}

export async function refreshAllTenants() {
  const tenants = await prisma.tenant.findMany({ where: { status: { not: "archived" } } });
  for (const t of tenants) await getEffectiveConfig(t.id);
}
```

---

## 6. Almanac manifest.ts 완전한 예시

ADR-026 §6의 Almanac 예시를 본 spec의 schema 보강에 맞춰 동결한다.

```typescript
// packages/tenant-almanac/manifest.ts
import { defineTenant } from "@yangpyeon/core/manifest/define";

// Cron handlers (직접 import — type-safe, F12 jump 가능)
import { rssFetcher }   from "./cron/rss-fetcher";
import { htmlScraper }  from "./cron/html-scraper";
import { apiPoller }    from "./cron/api-poller";
import { classifier }   from "./cron/classifier";
import { promoter }     from "./cron/promoter";

// Route handlers (Next.js Route Handler shape)
import * as contentsRoute    from "./routes/contents";
import * as categoriesRoute  from "./routes/categories";
import * as sourcesRoute     from "./routes/sources";
import * as todayTopRoute    from "./routes/today-top";
import * as itemsRoute       from "./routes/items";

export default defineTenant({
  // ── 1. 신원 ──────────────────────────────────────────
  id: "almanac",
  name: "Almanac Content Aggregator",
  owner: {
    userId: "00000000-0000-0000-0000-000000000001",   // admin user UUID
    email: "smartkdy7@naver.com",
  },
  createdAt: "2026-04-26",
  description: "RSS/HTML/API 60+ 소스 수집 + Gemini Flash 분류 + Almanac UI 노출",

  // ── 2. 데이터 정의 ──────────────────────────────────
  data: {
    schemas: ["./prisma/schema.prisma"],
    isolation: "schema-per-tenant",                   // ADR-023 옵션 A 가정
    schemaName: "tenant_almanac",
  },

  // ── 3. Cron (5개) ───────────────────────────────────
  cron: [
    { id: "rss-fetch",   schedule: "*/15 * * * *", handler: rssFetcher,  payload: {},          timeoutMs: 5 * 60_000, description: "RSS 60+ 소스 fetch → ingested INSERT" },
    { id: "html-scrape", schedule: "*/30 * * * *", handler: htmlScraper, payload: {},          timeoutMs: 5 * 60_000, description: "한국 6사 HTML 셀렉터 스크래핑" },
    { id: "api-poll",    schedule: "*/10 * * * *", handler: apiPoller,   payload: {},          timeoutMs: 2 * 60_000, description: "HN/Reddit/PH/ArXiv API polling" },
    { id: "classify",    schedule: "*/5 * * * *",  handler: classifier,  payload: { batch: 50 }, timeoutMs: 4 * 60_000, description: "pending → Gemini Flash → ready 전이" },
    { id: "promote",     schedule: "*/5 * * * *",  handler: promoter,    payload: {},          timeoutMs: 60_000,     description: "ready → content_items UPSERT (slug 생성)" },
  ],

  // ── 4. Routes (5개) ─────────────────────────────────
  routes: [
    { method: "GET", path: "/contents",    handler: contentsRoute.GET,    auth: "publishable", rateLimit: { rpm: 600 } },
    { method: "GET", path: "/categories",  handler: categoriesRoute.GET,  auth: "publishable", rateLimit: { rpm: 60 } },
    { method: "GET", path: "/sources",     handler: sourcesRoute.GET,     auth: "publishable", rateLimit: { rpm: 60 } },
    { method: "GET", path: "/today-top",   handler: todayTopRoute.GET,    auth: "publishable", rateLimit: { rpm: 300 } },
    { method: "GET", path: "/items/:slug", handler: itemsRoute.GET,       auth: "publishable", rateLimit: { rpm: 600 } },
  ],

  // ── 5. Permissions ──────────────────────────────────
  permissions: {
    publishable: ["read:contents", "read:categories", "read:sources"],
    admin:       ["read:*", "write:contents", "write:categories", "write:sources", "manage:cron"],
  },

  // ── 6. Quota ────────────────────────────────────────
  quota: {
    rateLimit:  { anonymous: 60, withApiKey: 600 },
    storage:    { maxBytes: 50 * 1024 * 1024 * 1024 },           // 50GB
    cronTicks:  { dailyBudget: 1000 },                            // 5 cron × 288tick/day = 1440, 보수 1000
    llm:        { dailyTokens: 200_000, providers: ["gemini"] },
    fetch: {
      allowedHosts: [                                             // SSRF 방어 화이트리스트
        "*.openai.com", "*.a16z.com", "*.huggingface.co",
        "geeknews.com", "yozm.wishket.com", "d2.naver.com",
        "tech.kakao.com", "brunch.co.kr", "velog.io",
        "hn.algolia.com", "www.reddit.com", "api.producthunt.com",
        "export.arxiv.org", "api.firecrawl.dev",
        "generativelanguage.googleapis.com",
      ],
    },
  },

  // ── 7. Hooks (optional) ─────────────────────────────
  hooks: {
    onProvision: async () => {
      // schema-per-tenant: PG schema 생성 + initial migration 적용
      // (ADR-023 구현 단계에서 채워질 예정)
    },
  },
});
```

대응 DB row:

```sql
INSERT INTO tenants (id, name, owner_id, status, manifest_snapshot, manifest_version)
VALUES (
  'almanac',
  'Almanac Content Aggregator',
  '00000000-0000-0000-0000-000000000001',
  'active',
  '{ "id":"almanac", "cron":[{"id":"rss-fetch"},...], "routes":[...] }'::jsonb,
  1
);
```

---

## 7. Manifest 변경 시 deploy 절차

### 7.1 트랙 A — TS 정의 변경 (cron 추가, route 변경, schema 수정)

| 단계 | 명령 | 검증 대상 |
|------|------|-----------|
| 1 | `packages/tenant-<id>/manifest.ts` 편집 | TS lint/format |
| 2 | `pnpm build` | tsc 컴파일 (handler 시그니처) |
| 3 | `pnpm test:manifest` | Zod parse + drift 시뮬레이션 |
| 4 | git commit + push | git diff 검토 |
| 5 | PM2 reload (또는 ADR-020 standalone 배포) | 부팅 시 manifest snapshot DB 업데이트 |
| 6 | `/admin/tenants/<id>/manifest-sync` 확인 | drift warnings 0 |

### 7.2 트랙 B — DB 운영 토글 변경 (status, quota override, route override)

| 단계 | 명령 | 적용 시점 |
|------|------|-----------|
| 1 | 관리자 UI 또는 SQL 실행 | 즉시 row 갱신 |
| 2 | 코어 60초 주기 DB poll | 다음 tick부터 effective config 갱신 |
| 3 | cron registry / router 자동 재반영 | restart 불필요 |

### 7.3 트랙 C — 긴급 kill switch

```sql
UPDATE tenants SET status = 'suspended' WHERE id = 'almanac';
```

→ 60초 내 cron 정지, route 503 응답 (`status` 변경 즉시 effective config의 모든 cron `enabled=false`, route `disabled=true` 강제).

### 7.4 manifestSnapshot 동기화 책임

- 빌드 산출물: `dist/tenant-<id>/manifest.snapshot.json` (handler ref는 string으로 치환)
- 부팅 진입점: 코드 manifest 로드 → DB `manifest_snapshot` 비교 → 다르면 UPDATE + `manifest_version++` + `manifest_synced_at=NOW()`
- drift warnings: 부팅 후 `/admin/health/manifest-drift`로 노출

---

## 8. 마이그레이션 (기존 단일테넌트 → 멀티테넌트)

### 8.1 단계 0 — 사전 준비

- 백업: `pg_dump` 전체 DB
- 가드: `MULTITENANT_ENABLED=false` env로 readiness 게이트

### 8.2 단계 1 — Tenant 테이블 + default tenant

```sql
-- 마이그레이션 1
CREATE TABLE tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active',
  manifest_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  manifest_version int NOT NULL DEFAULT 1,
  manifest_synced_at timestamptz,
  cron_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  quota_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  route_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  archived_at timestamptz
);
CREATE INDEX tenants_status_idx ON tenants(status);
CREATE INDEX tenants_owner_status_idx ON tenants(owner_id, status);

INSERT INTO tenants (id, name, owner_id, status)
VALUES ('yangpyeon-default', 'Yangpyeon Default Workspace',
        (SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1),
        'active');
```

### 8.3 단계 2 — 도메인 모델에 tenant_id 추가 + backfill

```sql
-- 마이그레이션 2 (반복 패턴: cron_jobs / api_keys / edge_functions / webhooks 모두)
ALTER TABLE cron_jobs ADD COLUMN tenant_id text REFERENCES tenants(id) ON DELETE CASCADE;
UPDATE cron_jobs SET tenant_id = 'yangpyeon-default' WHERE tenant_id IS NULL;
ALTER TABLE cron_jobs ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX cron_jobs_tenant_enabled_idx ON cron_jobs(tenant_id, enabled);

-- manifest_cron_id 추가 (정의 컬럼 제거 전 단계)
ALTER TABLE cron_jobs ADD COLUMN manifest_cron_id text;
UPDATE cron_jobs SET manifest_cron_id = name;       -- 기존 name 을 임시 매핑
```

### 8.4 단계 3 — `packages/tenant-yangpyeon-default/manifest.ts` 작성

기존 `cron_jobs` row 4개(예시), `edge_functions` row N개를 manifest로 이주.

### 8.5 단계 4 — 코어가 manifest 로딩 코드 도입

`src/lib/cron/registry.ts` 등 globalThis 싱글톤을 tenant-aware로 수정 — 별도 ADR-024/028 spec 책임.

### 8.6 단계 5 — 정의 컬럼 제거 (clean-up)

```sql
-- 마이그레이션 N (manifest 이주 완료 검증 후)
ALTER TABLE cron_jobs DROP COLUMN schedule;
ALTER TABLE cron_jobs DROP COLUMN kind;
ALTER TABLE cron_jobs DROP COLUMN payload;
ALTER TABLE cron_jobs DROP COLUMN name;
ALTER TABLE cron_jobs ADD CONSTRAINT cron_jobs_tenant_manifest_uk UNIQUE (tenant_id, manifest_cron_id);
```

### 8.7 단계 6 — 신규 컨슈머(예: Almanac)는 처음부터 manifest로

`packages/tenant-almanac/manifest.ts` + `INSERT INTO tenants ...` 1쌍으로 시작 (코드 수정 0줄).

---

## 9. 7원칙 매핑

본 spec이 baas-foundation 7원칙을 어떻게 충족하는지 명시.

| 원칙 | 충족 방식 |
|------|-----------|
| 원칙 1 (1 tenant = 1 격리 워크스페이스) | `Tenant.id` PK + ADR-001 §3.2.4 정신 유지 — 조직 3계층 도입 금지 §10 |
| 원칙 2 (BaaS 정체성: 1인 N개 컨슈머) | `defineTenant()` 1 호출 + 1 DB row = Almanac 같은 컨슈머 1개 |
| 원칙 3 (데이터/코드/cron/route 격리) | manifest의 7 책임 필드가 격리 메커니즘과 직교(orthogonal) — ADR-023/024/028이 이 manifest 입력으로 격리 강제 |
| **원칙 4 (코드 수정 0줄로 신규 컨슈머 추가)** | **`packages/tenant-<new>/manifest.ts` 신규 + `tenants` DB row 1개**로 충족. 코어 src/** 변경 불필요 |
| 원칙 5 (Type-safety) | `defineTenant<T>()` + Zod + handler 함수 ref 직접 import → IDE F12 jump |
| 원칙 6 (운영 긴급 대응) | DB `status='suspended'` 토글로 60초 내 kill switch (트랙 C) |
| 원칙 7 (단일 진실 소스) | 책임 분리 매트릭스 (ADR-026 §4.2) — 정의=코드, 토글=DB. drift 감지 §5.3로 강제 |

---

## 10. Open Questions

| # | 질문 | 후보 답안 | 영향 ADR |
|---|------|-----------|----------|
| 1 | manifest snapshot vs 코드 drift가 발생하면? | 부팅 시 자동 UPDATE + warning. 단 drift 항목 ≥ 5건이면 부팅 abort 옵션 검토 | ADR-026 §11 Q1 |
| 2 | Tenant `archived` 시 데이터 보존 정책? | 90일 보존 후 hard delete? 또는 무기한 보존 + 신규 요청만 차단? | ADR-029 보안/감사 |
| 3 | manifest의 handler가 다른 tenant의 데이터에 접근하면? | Prisma client wrapper로 tenant 컨텍스트 강제 (ADR-023 책임) | ADR-023 |
| 4 | `routes[].path` → 최종 URL 패턴은? | `/api/v1/t/<tenant.id>/<path>` 또는 subdomain — ADR-027에서 결정 | ADR-027 |
| 5 | manifest 한 파일이 너무 커지면? (cron 50+, route 100+) | hub 모듈 분할 허용 (`cron/index.ts` 등). 단 단일 `defineTenant()` 호출 유지 | ADR-026 §11 Q5 |
| 6 | `permissions` glob 패턴 문법 상세? | `read:*`, `write:contents`, `manage:cron` 등 — ADR-029에서 정의 | ADR-029 |
| 7 | `hooks.onProvision` 실행 시점 정확히? | 신규 tenant row INSERT 직후, 첫 cron tick 이전. schema-per-tenant 시 schema 생성 + initial migration | ADR-026 §11 Q7 |
| 8 | manifest snapshot에 handler 함수 직렬화 시 식별자는? | `<file path>::<exported name>` (예: `"./cron/rss-fetcher.ts::rssFetcher"`) | 본 spec 후속 |
| 9 | DB poll 주기 60초의 타당성? | suspended 긴급성 vs DB 부하 트레이드오프. 향후 LISTEN/NOTIFY로 push 전환 검토 | ADR-028 cron pool |

---

## 11. 참고 문서

- `docs/research/baas-foundation/01-adrs/ADR-026-tenant-manifest-schema.md` — 본 spec의 입력 ADR
- `docs/research/baas-foundation/00-context/02-current-code-audit.md` — 단일테넌트 가정 매핑
- `prisma/schema.prisma` — 본 spec이 확장하는 기존 스키마
- `docs/assets/yangpyeon-aggregator-spec/01-overview.md` — Almanac 케이스 원본
- ADR-023 (데이터 격리), ADR-024 (코드 격리), ADR-027 (Multi-tenant Router), ADR-028 (Cron Pool) — 본 spec의 후속 의존자

---

**문서 신뢰도**: 92% (ADR-026 8 부속 결정 100% 반영 + 기존 prisma 스타일 일치 확인 완료. handler 함수 직렬화 식별자 §10 Q8 등 후속 결정 잔존)

**다음 spec**: ADR-027 Multi-tenant Router — manifest.routes[].path → 실제 URL 매핑 구현 spec.
