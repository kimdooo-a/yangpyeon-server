# ADR-026 — Tenant Manifest 스키마 정의

> **상태**: ACCEPTED (2026-04-26)
> **작성일**: 2026-04-26
> **결정자**: 김도영 (1인 운영자) — 세션 58 확정
> **Supersedes**: 없음 (신규)
> **Superseded-by**: 없음
> **Related**: ADR-022 (BaaS 정체성 재정의), ADR-023 (데이터 격리 모델), ADR-024 (Plugin 코드 격리)

---

## 1. 컨텍스트

### 1.1 문제 정의

ADR-022~024가 어떤 격리 옵션을 채택하든, **각 컨슈머(tenant)가 yangpyeon에 자신의 정의를 "등록"해야 한다**.
"정의"는 다음 7가지를 포함한다:

1. **신원** — `tenant_id`, 표시명, 소유자, 상태(active/suspended/archived)
2. **데이터 정의** — Prisma 스키마 또는 SQL DDL (테이블, 인덱스, 관계)
3. **Cron 정의** — 주기 실행 작업 목록 (이름, 스케줄, 모듈 ref, payload)
4. **Route 정의** — 외부 노출 API 라우트 (path pattern, handler ref, auth scope, rate limit)
5. **Permissions/Scopes** — 이 tenant의 API key가 가질 수 있는 권한 범위
6. **Quota** — rate limit, storage, cron tick budget, LLM 호출 한도
7. **Lifecycle hooks** — onProvision, onUpgrade, onDecommission

### 1.2 왜 지금 결정해야 하는가

- **Almanac 사례 임박**: `docs/assets/yangpyeon-aggregator-spec/01-overview.md`가 yangpyeon에 `AGGREGATOR` cron kind 추가 + `/api/v1/almanac/*` 라우트 5개 + content_* 테이블 6개를 등록하려 한다.
- 이를 "그냥 코드에 추가" 방식으로 처리하면 **모든 미래 컨슈머마다 src/**에 뿌려진다 → 분리 격리 불가.
- 등록 양식(=manifest)을 먼저 결정해야 ADR-023(데이터)·024(코드)·028(cron pool)이 그 양식을 참조 구현할 수 있다.

### 1.3 기존 결정과의 관계

- **ADR-001 §3.2.4 (재검토 트리거 발동)**: "단순한 워크스페이스 모델" 정신을 유지한다.
  - 즉 **조직 3단계 계층(Org → Project → Tenant)을 도입하지 않는다**.
  - tenant 1개 = 워크스페이스 1개 = 격리 단위 1개. 끝.
- **ADR-022 (BaaS 정체성)**: 1인 운영 N개 BaaS 컨슈머. tenant ≈ "Almanac 같은 외부/내부 서비스 1개".
- **ADR-023 (데이터 격리)**: schema-per-tenant / RLS / DB-per-tenant 중 어느 것을 채택해도 manifest는 데이터 위치를 선언만 하면 된다 — manifest는 격리 메커니즘과 직교(orthogonal).
- **ADR-024 (코드 격리)**: tenant 코드를 별도 디렉토리/패키지로 둘 때 manifest가 "어디에 있는지" 선언.

### 1.4 단일테넌트 시절 코드의 현재 상태 (참조: `02-current-code-audit.md`)

- `prisma/schema.prisma`: 모든 모델에 tenant 차원 부재
- `src/lib/cron/registry.ts`: `globalThis.__cronRegistry` 싱글톤
- `src/app/api/v1/**`: 라우트가 `user.sub` 글로벌 identity 가정
- `RateLimitBucket.bucketKey`: `"v1Login:ip:1.2.3.4"` — tenant 차원 없음

→ Manifest는 이 모든 차원에 **새로운 첫번째 분류축(tenant)을 도입**한다.

---

## 2. 옵션 비교

### 옵션 A — JSON 파일 + Zod 검증

**구조**:
```
packages/tenant-almanac/
├── manifest.json           ← 진실 소스
├── schema.prisma           ← 데이터 정의 (별도)
└── handlers/
    ├── contents.ts
    └── ...
```

**작동 방식**:
- yangpyeon core가 startup 시 `packages/tenant-*/manifest.json` glob 로드
- Zod 스키마로 검증 → 실패 시 startup abort
- registry/router에 등록

**장점**:
- 정적 검증 (startup 시점)
- IDE 자동완성 (JSON Schema 연동)
- git diff 가독성 우수
- 동적 코드 실행 위험 없음

**단점**:
- 동적 변경 불가 → 모든 변경이 코드 push + restart
- handler/cron module ref가 string → 컴파일 타임 검증 불가 ("./handlers/contents.ts" 오타 시 startup error)
- 환경별 차이(dev/prod URL 등) 처리 어색

**1인 운영 적합도**: ✅ — 변경 빈도 낮음 (Almanac 배포 후 cron 추가는 월 1회 이하)

---

### 옵션 B — DB 저장 (Tenant 테이블 + Manifest JSON 컬럼)

**구조**:
```sql
CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,        -- 'almanac'
  name        TEXT NOT NULL,
  owner_id    UUID NOT NULL,
  status      TEXT NOT NULL,           -- active|suspended|archived
  manifest    JSONB NOT NULL,          -- 전체 정의 통째로
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

**작동 방식**:
- 관리자 UI 또는 `POST /admin/tenants` 로 등록/수정
- yangpyeon core가 startup + 변경 감지 시 reload
- Zod 검증은 write 시점

**장점**:
- 동적 등록 — restart 없이 신규 tenant 추가
- 셀프서비스 가능 (미래에 외부 사용자가 직접 등록)
- 관리자 UI 자연스럽게 결합

**단점**:
- "schema migration이 데이터인가 코드인가" 모호
  - manifest.cron[].module = "./cron/foo.ts" 라는 string이 DB에 저장되는데, 정작 그 파일은 코드베이스에 있음 → **두 진실이 어긋날 위험**
- 검증이 런타임 (startup 시점에야 잘못 발견)
- git diff로 변경 추적 불가 → 별도 audit log 필요
- TypeScript type-safe 불가 (`manifest.routes[].handler` 가 `unknown`)

**1인 운영 적합도**: ✅ but 위험 — 1인이 셀프서비스 UI 만들 시간이 없음. 실질적으로 DB row를 SQL로 직접 편집하게 됨 → 옵션 A보다 더 번거로움

---

### 옵션 C — 하이브리드 (코드는 manifest.ts, 운영 토글은 DB)

**구조**:
```
packages/tenant-almanac/
└── manifest.ts             ← 정의 (schema/cron/route 코드 ref)

DB:
tenants 테이블               ← 운영 메타 (status/quota/api_keys 발급)
```

**작동 방식**:
- **정의**(스키마/cron/route): 코드 manifest.ts에 type-safe로 선언
- **운영 토글**(status, quota, key 발급): DB에서 동적 변경
- yangpyeon core: manifest.ts(정적) + DB row(동적) merge → 최종 effective config

**장점**:
- 정의는 안전(코드/git), 운영은 유연(DB)
- 1인 운영자: "Almanac을 잠시 정지" → DB에서 status='suspended'로 토글 (코드 변경 없음)
- "rate limit 1.5배" → DB에서 quota.rateLimit.withApiKey += 300 (코드 변경 없음)
- handler/module ref는 type-safe (TS 컴파일 타임 검증)

**단점**:
- 두 진실 소스 → 조정 필요 (어느 필드가 코드, 어느 필드가 DB?)
- 부팅 순서: 코드 manifest 먼저 로드 → DB 토글 적용 → effective config 산출

**1인 운영 적합도**: ✅✅ — 평소엔 한 곳만 보면 되고(코드), 긴급 상황에 다른 곳을 쓴다(DB)

---

### 옵션 D — TypeScript-first (manifest.ts에서 type-safe로)

**구조**:
```typescript
// packages/tenant-almanac/manifest.ts
import { defineTenant } from "@yangpyeon/core/manifest";
import * as contentsHandler from "./routes/contents";
import { rssFetcher } from "./cron/rss-fetcher";

export default defineTenant({
  id: "almanac",
  // ...
  cron: [
    { id: "rss-fetch", schedule: "*/15 * * * *", handler: rssFetcher, payload: {} },
  ],
  routes: [
    { method: "GET", path: "/contents", handler: contentsHandler.GET, auth: "publishable", rateLimit: { rpm: 600 } },
  ],
});
```

**작동 방식**:
- yangpyeon core가 startup 시 `packages/tenant-*/manifest.ts` 동적 import
- handler/cron이 함수 ref로 직접 전달 → string ref 없음
- TypeScript 컴파일 타임에 모든 검증

**장점**:
- 최강 type-safety (handler 시그니처 mismatch도 컴파일 에러)
- IDE 점프(F12)로 handler 정의 즉시 이동
- Zod 검증 부분만 — 나머지는 TS가 다 잡음
- 디버깅 쉬움

**단점**:
- 동적 변경 절대 불가 (코드 push + restart 필수)
- TS-only — 외부 사용자가 manifest 작성하려면 TS 알아야 함
- 옵션 A보다 셀프서비스 기능 더 멀어짐
- 동적 import 시 hot-reload 처리 복잡

**1인 운영 적합도**: ✅✅ — 1인 자체가 모든 컨슈머 작성자라면 type-safety 효과 극대화

---

## 3. 비교 매트릭스

| 차원 | A: JSON+Zod | B: DB | C: Hybrid | D: TS-first |
|------|-------------|-------|-----------|-------------|
| 정적 검증 | ✅ (Zod startup) | ❌ (런타임만) | △ (코드 부분만) | ✅✅ (TS 컴파일) |
| 동적 변경 | ❌ (restart) | ✅ (즉시) | △ (운영 토글만) | ❌ (restart) |
| 셀프서비스 | ❌ | ✅ | ✅ | ❌ |
| 1인 운영 적합 | ✅ | ✅ (위험) | ✅✅ | ✅✅ |
| 디버깅 (F12 jump) | △ (string ref) | ❌ | △ | ✅✅ (함수 ref) |
| Git diff 추적 | ✅ | ❌ | ✅ (정의는) | ✅✅ |
| Hot-reload | ❌ | ✅ | △ | ❌ |
| Almanac 즉시 적용 비용 | 중 (Zod 작성) | 고 (UI 또는 SQL 운영) | 중 | 저 (TS만) |
| 미래 외부 컨슈머 수용 | △ (JSON 작성 가능) | ✅ | ✅ | ❌ (TS 필수) |
| ADR-001 정신 (단순 워크스페이스) | ✅ | ✅ | ✅ | ✅ |

**가중치 (1인 운영자 관점)**:
- 정적 검증 + 디버깅: 30%
- 1인 운영 적합 + 즉시 적용 비용: 30%
- 동적 변경 (운영 긴급 토글): 20%
- 미래 외부 수용: 10%
- 그 외: 10%

**점수**:
- A: 6.5
- B: 5.0
- C: **8.5** (권고)
- D: 8.0

---

## 4. 권고 — 옵션 C (Hybrid: TS manifest.ts + DB 운영 토글)

### 4.1 선택 근거

1. **type-safety 확보** (옵션 D 장점 흡수)
2. **운영 긴급성 대응** (옵션 B 장점 부분 흡수)
3. **두 진실 소스를 명확히 분리** — "정의는 코드, 토글은 DB"라는 한 문장으로 외울 수 있음
4. **Almanac 즉시 적용 가능** — manifest.ts 1개 + Tenant row 1개

### 4.2 책임 분리 매트릭스

| 항목 | 코드 (manifest.ts) | DB (tenants 테이블) |
|------|--------------------|---------------------|
| `id` | ✅ 진실 | ❌ 참조만 (FK) |
| `name`, `owner` | ✅ 진실 | ❌ |
| `status` | ❌ | ✅ 진실 (동적 토글) |
| `data.schemas`, `data.isolation` | ✅ 진실 | ❌ (격리 메커니즘은 ADR-023) |
| `cron[].schedule`, `cron[].handler` | ✅ 진실 | ❌ |
| `cron[].enabled` | ❌ | ✅ 진실 (per-job 토글) |
| `routes[]` 정의 | ✅ 진실 | ❌ |
| `permissions` 정의 | ✅ 진실 | ❌ |
| `quota` 기본값 | ✅ 진실 | △ (기본값) |
| `quota` override | ❌ | ✅ 진실 (동적 토글) |
| `apiKeys` 발급 | ❌ | ✅ 진실 (DB row) |
| `hooks` | ✅ 진실 | ❌ |

---

## 5. 스키마 정의

### 5.1 코드: `manifest.ts`

```typescript
// @yangpyeon/core/manifest.ts (라이브러리 측 export)
import { z } from "zod";

export type TenantManifest = z.infer<typeof TenantManifestSchema>;

export const TenantManifestSchema = z.object({
  // 1. 신원
  id: z.string().regex(/^[a-z][a-z0-9-]{2,30}$/),  // url-safe slug
  name: z.string().min(1).max(100),
  owner: z.object({
    userId: z.string().uuid(),
    email: z.string().email(),
  }),
  createdAt: z.string().date(),                    // ISO date
  description: z.string().optional(),

  // 2. 데이터 정의
  data: z.object({
    schemas: z.array(z.string()),                  // ["./prisma/schema.prisma"]
    isolation: z.enum([
      "schema-per-tenant",                         // ADR-023 옵션 A
      "row-level-rls",                             // ADR-023 옵션 B
      "db-per-tenant",                             // ADR-023 옵션 C
      "shared-schema",                             // 공유 (개발용)
    ]),
    schemaName: z.string().optional(),             // schema-per-tenant 시 PG schema 이름
  }),

  // 3. Cron 정의
  cron: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,40}$/),
    schedule: z.string(),                          // node-cron 표현식 (예: "*/15 * * * *")
    handler: z.function(),                         // (payload) => Promise<void>
    payload: z.unknown().optional(),
    timeoutMs: z.number().int().positive().default(30_000),
    description: z.string().optional(),
  })).default([]),

  // 4. Route 정의
  routes: z.array(z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().regex(/^\/[a-z0-9/_:-]*$/),   // 상대 경로 ("/contents")
    handler: z.function(),                         // Next.js Route Handler
    auth: z.enum([
      "public",                                    // 무인증
      "publishable",                               // PUBLISHABLE API key
      "secret",                                    // SECRET API key
      "admin",                                     // 관리자 세션 (대시보드)
    ]),
    rateLimit: z.object({
      rpm: z.number().int().positive(),
      burst: z.number().int().positive().optional(),
    }).optional(),
    cors: z.object({
      allowOrigins: z.array(z.string()),
    }).optional(),
  })).default([]),

  // 5. Permissions/Scopes
  permissions: z.record(
    z.string(),                                    // role 이름 (publishable, admin 등)
    z.array(z.string())                            // 권한 패턴 ("read:contents", "write:*")
  ).default({}),

  // 6. Quota
  quota: z.object({
    rateLimit: z.object({
      anonymous: z.number().int().positive(),     // /min 익명 IP
      withApiKey: z.number().int().positive(),    // /min API key
    }),
    storage: z.object({
      maxBytes: z.number().int().positive(),
    }).optional(),
    cronTicks: z.object({
      dailyBudget: z.number().int().positive(),   // 일일 cron 실행 횟수 한도
    }).optional(),
    llm: z.object({
      dailyTokens: z.number().int().positive(),
      providers: z.array(z.string()).optional(),  // 허용 LLM 공급자
    }).optional(),
    fetch: z.object({
      allowedHosts: z.array(z.string()),          // EdgeFunction 화이트리스트 대체
    }).optional(),
  }),

  // 7. Lifecycle hooks
  hooks: z.object({
    onProvision: z.function().optional(),
    onUpgrade: z.function().optional(),
    onDecommission: z.function().optional(),
  }).optional(),
});

// helper: type-safe factory
export function defineTenant<T extends TenantManifest>(manifest: T): T {
  return TenantManifestSchema.parse(manifest) as T;
}
```

### 5.2 DB: `tenants` 테이블

```prisma
// prisma/schema.prisma 추가
model Tenant {
  id          String       @id                          // manifest.id와 일치 (FK)
  status      TenantStatus @default(active)
  ownerId     String       @map("owner_id")             // FK → User
  owner       User         @relation("UserTenants", fields: [ownerId], references: [id])

  // 운영 토글 (manifest.ts 값을 override)
  cronOverrides Json @default("{}") @map("cron_overrides")  // { "rss-fetch": { enabled: false } }
  quotaOverrides Json @default("{}") @map("quota_overrides") // { "rateLimit.withApiKey": 1200 }

  // 메타
  apiKeys     ApiKey[]     @relation("TenantApiKeys")
  cronJobs    CronJob[]    @relation("TenantCronJobs")
  // 이외 모든 모델에 tenantId FK 추가 (ADR-023 책임)

  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)
  archivedAt  DateTime?    @map("archived_at") @db.Timestamptz(3)

  @@map("tenants")
}

enum TenantStatus {
  active        // 정상 운영
  suspended     // 일시 정지 (cron/route 모두 차단)
  archived      // 영구 종료 (데이터 보존, 조회 차단)
}
```

### 5.3 effective config 산출 (런타임)

```typescript
// @yangpyeon/core/runtime/effective-config.ts
import type { TenantManifest } from "../manifest";
import type { Tenant } from "@prisma/client";

export interface EffectiveConfig {
  manifest: TenantManifest;
  status: "active" | "suspended" | "archived";
  cron: Array<TenantManifest["cron"][number] & { enabled: boolean }>;
  quota: TenantManifest["quota"];                    // override 적용 후
}

export function computeEffectiveConfig(
  manifest: TenantManifest,
  tenantRow: Tenant
): EffectiveConfig {
  const cronOverrides = tenantRow.cronOverrides as Record<string, { enabled?: boolean }>;
  const quotaOverrides = tenantRow.quotaOverrides as Record<string, number>;

  return {
    manifest,
    status: tenantRow.status,
    cron: manifest.cron.map(job => ({
      ...job,
      enabled: cronOverrides[job.id]?.enabled ?? true,
    })),
    quota: applyQuotaOverrides(manifest.quota, quotaOverrides),
  };
}
```

---

## 6. Almanac 적용 예시 (구체적 manifest)

```typescript
// packages/tenant-almanac/manifest.ts
import { defineTenant } from "@yangpyeon/core/manifest";

// Cron handlers (직접 import — type-safe)
import { rssFetcher } from "./cron/rss-fetcher";
import { htmlScraper } from "./cron/html-scraper";
import { apiPoller } from "./cron/api-poller";
import { classifier } from "./cron/classifier";
import { promoter } from "./cron/promoter";

// Route handlers
import * as contentsRoute from "./routes/contents";
import * as categoriesRoute from "./routes/categories";
import * as sourcesRoute from "./routes/sources";
import * as todayTopRoute from "./routes/today-top";
import * as itemsRoute from "./routes/items";

export default defineTenant({
  id: "almanac",
  name: "Almanac Content Aggregator",
  owner: {
    userId: "00000000-0000-0000-0000-000000000001",   // 실제 admin user UUID
    email: "smartkdy7@naver.com",
  },
  createdAt: "2026-04-26",
  description: "RSS/HTML/API 60+ 소스 수집 + Gemini Flash 분류 + Almanac UI 노출",

  data: {
    schemas: ["./prisma/schema.prisma"],
    isolation: "schema-per-tenant",                   // ADR-023 결정 가정 (옵션 A)
    schemaName: "tenant_almanac",
  },

  cron: [
    {
      id: "rss-fetch",
      schedule: "*/15 * * * *",                       // 매 15분
      handler: rssFetcher,
      payload: {},
      timeoutMs: 5 * 60_000,                          // 5분 (RSS 60개 fetch는 1분+ 소요)
      description: "RSS 60+ 소스 fetch → content_ingested_items INSERT",
    },
    {
      id: "html-scrape",
      schedule: "*/30 * * * *",                       // 매 30분
      handler: htmlScraper,
      payload: {},
      timeoutMs: 5 * 60_000,
      description: "한국 6사 HTML 셀렉터 기반 스크래핑",
    },
    {
      id: "api-poll",
      schedule: "*/10 * * * *",                       // 매 10분
      handler: apiPoller,
      payload: {},
      timeoutMs: 2 * 60_000,
      description: "HN/Reddit/PH/ArXiv API polling",
    },
    {
      id: "classify",
      schedule: "*/5 * * * *",                        // 매 5분
      handler: classifier,
      payload: { batch: 50 },
      timeoutMs: 4 * 60_000,
      description: "pending 50건 → Gemini Flash 분류 → ready 전이",
    },
    {
      id: "promote",
      schedule: "*/5 * * * *",
      handler: promoter,
      payload: {},
      timeoutMs: 60_000,
      description: "ready → content_items UPSERT (slug 생성)",
    },
  ],

  routes: [
    { method: "GET", path: "/contents",     handler: contentsRoute.GET,     auth: "publishable", rateLimit: { rpm: 600 } },
    { method: "GET", path: "/categories",   handler: categoriesRoute.GET,   auth: "publishable", rateLimit: { rpm: 60 } },
    { method: "GET", path: "/sources",      handler: sourcesRoute.GET,      auth: "publishable", rateLimit: { rpm: 60 } },
    { method: "GET", path: "/today-top",    handler: todayTopRoute.GET,     auth: "publishable", rateLimit: { rpm: 300 } },
    { method: "GET", path: "/items/:slug",  handler: itemsRoute.GET,        auth: "publishable", rateLimit: { rpm: 600 } },
  ],

  permissions: {
    publishable: [
      "read:contents",
      "read:categories",
      "read:sources",
    ],
    admin: [
      "read:*",
      "write:contents",
      "write:categories",
      "write:sources",
      "manage:cron",
    ],
  },

  quota: {
    rateLimit: {
      anonymous: 60,                                  // /min/IP
      withApiKey: 600,                                // /min/key
    },
    storage: {
      maxBytes: 50 * 1024 * 1024 * 1024,             // 50GB (overview.md §7)
    },
    cronTicks: {
      dailyBudget: 1000,                              // 5 cron × 288tick/day = 1440, 여유분 1000 보수적
    },
    llm: {
      dailyTokens: 200_000,                           // Gemini Flash RPD 200 × 평균 1k tokens
      providers: ["gemini"],
    },
    fetch: {
      allowedHosts: [                                 // SSRF 방지
        "*.openai.com",
        "*.a16z.com",
        "*.huggingface.co",
        "geeknews.com",
        "yozm.wishket.com",
        "d2.naver.com",
        "tech.kakao.com",
        "brunch.co.kr",
        "velog.io",
        "hn.algolia.com",
        "www.reddit.com",
        "api.producthunt.com",
        "export.arxiv.org",
        "api.firecrawl.dev",
        "generativelanguage.googleapis.com",
      ],
    },
  },

  hooks: {
    // optional — 향후 확장
  },
});
```

DB row 예시:
```sql
INSERT INTO tenants (id, status, owner_id) VALUES
  ('almanac', 'active', '<admin-uuid>');
```

---

## 7. 결정사항 (ACCEPTED 2026-04-26)

| # | 항목 | 권고안 | 사용자 확정 |
|---|------|--------|-------------|
| 1 | 모델 선택 | **옵션 C (Hybrid: TS manifest.ts + DB 운영 토글)** | ACCEPTED |
| 2 | manifest 위치 | `packages/tenant-<id>/manifest.ts` | ACCEPTED |
| 3 | TenantManifestSchema 정의 | §5.1 그대로 | ACCEPTED |
| 4 | `Tenant` Prisma 모델 추가 | §5.2 그대로 | ACCEPTED |
| 5 | effective config 산출 함수 | §5.3 그대로 | ACCEPTED |
| 6 | Almanac manifest 위치 | `packages/tenant-almanac/manifest.ts` | ACCEPTED |
| 7 | 기존 cron_jobs/edge_functions 등 글로벌 모델은 어떻게? | §8 마이그레이션 참조 | ACCEPTED |
| 8 | manifest 변경 시 deploy 절차 | §9 참조 | ACCEPTED |

---

## 8. 마이그레이션 영향

### 8.1 기존 `CronJob` / `EdgeFunction` / `Webhook` 모델

현재 단일테넌트의 `cron_jobs` 테이블은 **운영 메타(lastRunAt, lastStatus)** 만 보유하면 된다.
- 정의(name, schedule, kind, payload)는 manifest.ts로 이주
- DB row는 `tenantId` + `manifestCronId` (manifest의 cron[].id 참조) 만 유지

```prisma
model CronJob {
  id            String   @id @default(uuid())
  tenantId      String   @map("tenant_id")
  tenant        Tenant   @relation("TenantCronJobs", fields: [tenantId], references: [id])
  manifestCronId String  @map("manifest_cron_id")           // manifest의 cron[].id
  // 정의는 manifest에서 — name/schedule/kind/payload 컬럼 제거
  enabled       Boolean  @default(true)
  lastRunAt     DateTime? @map("last_run_at") @db.Timestamptz(3)
  lastStatus    String?  @map("last_status")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@unique([tenantId, manifestCronId])
  @@map("cron_jobs")
}
```

`EdgeFunction`/`Webhook`도 동일 패턴 (정의는 manifest, DB는 운영 메타만).

### 8.2 단일테넌트 → 멀티테넌트 전환 절차

1. `tenants` 테이블 생성, default tenant `'yangpyeon-default'` 1건 INSERT
2. 모든 기존 row에 `tenantId = 'yangpyeon-default'` backfill
3. `packages/tenant-yangpyeon-default/manifest.ts` 작성 (현재 cron/edge_function/webhook 정의 이주)
4. yangpyeon core가 manifest 로딩 코드 추가
5. 새 컨슈머(예: Almanac)는 처음부터 manifest로 등록

---

## 9. Deploy 절차

### 9.1 manifest 변경 시
1. `packages/tenant-<id>/manifest.ts` 수정
2. `pnpm build` (TS 컴파일 — 타입 검증)
3. `pnpm test:manifest` (Zod parse 검증)
4. git commit + push
5. PM2 reload (또는 ADR-020 standalone 배포 절차)

### 9.2 운영 토글 변경 시 (restart 불필요)
1. 관리자 UI 또는 SQL로 `tenants.status` / `cron_overrides` / `quota_overrides` 변경
2. yangpyeon core가 매 N분(예: 60초) DB poll → effective config 갱신
3. cron/route는 다음 tick부터 새 설정 적용

### 9.3 emergency kill switch
```sql
UPDATE tenants SET status = 'suspended' WHERE id = 'almanac';
```
→ 60초 내 cron 정지, route 503 응답.

---

## 10. 금지 사항 (재확인)

- ❌ **조직 3단계(Org/Project/Tenant) 도입 금지** — ADR-001 §3.2.4 정신 유지. tenant 1개 = 최상위 격리 단위 1개.
- ❌ **manifest.ts에 비즈니스 로직 작성 금지** — manifest는 선언적이어야 함. 로직은 handler에.
- ❌ **DB tenants.manifest 컬럼에 정의 통째로 저장 금지** — 옵션 B 채택 안 함. DB는 운영 메타만.
- ❌ **runtime에 manifest 동적 변경 금지** — handler/cron 정의가 바뀌려면 코드 push + reload.
- ❌ **결정 칸 ACCEPTED 2026-04-26 (세션 58)** — 사용자 확정 완료, 본 결정사항은 잠금 상태.

---

## 11. 미해결 질문 (사용자 검토 요청)

1. **Q1**: ADR-023이 "shared-schema"를 채택하면 manifest의 `data.isolation` 값이 어떻게 되는가?
   → 권고: shared-schema도 명시적 enum 값으로 허용. tenant_id 컬럼이 격리 책임.

2. **Q2**: `manifest.routes[].path`의 최종 URL 패턴은?
   → ADR-027 (Multi-tenant Router) 결정에 따름. 현재 가정: `/api/v1/t/<tenant.id>/<path>` 또는 subdomain 경로.

3. **Q3**: manifest.ts의 handler가 다른 tenant의 데이터에 접근하면?
   → 격리 메커니즘(ADR-023) + Prisma client wrapper로 차단. manifest는 선언만 하고 강제는 런타임 가드 책임.

4. **Q4**: Almanac이 yangpyeon에 등록되기 전에는 어떻게 운영하는가?
   → 현재 단일테넌트 상태로 임시 운영. ADR-022~029 + Phase 16b 구현 후 manifest로 전환.

5. **Q5**: manifest 한 파일이 너무 커지면? (cron 50개, route 100개 등)
   → 분할 가능: `manifest.ts`가 `cron/index.ts`, `routes/index.ts` 등 hub 모듈을 import. 단 단일 `defineTenant()` 호출은 유지.

6. **Q6**: `permissions` 필드의 패턴 문법은?
   → 권고: glob-like (`read:*`, `write:contents`, `manage:cron`). 별도 ADR-029 (Authorization)에서 상세화.

7. **Q7**: `hooks.onProvision`은 언제 실행?
   → 신규 tenant row INSERT 직후, 첫 cron tick 이전. schema-per-tenant 시 schema 생성 + initial migration 실행 책임.

---

## 12. 참고 문서

- `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` — ADR-022~029 컨텍스트
- `docs/research/baas-foundation/00-context/02-current-code-audit.md` — 단일테넌트 가정 매핑
- `prisma/schema.prisma` — 현재 모델 패턴 (User/CronJob/ApiKey 등)
- `docs/assets/yangpyeon-aggregator-spec/01-overview.md` — Almanac 등록 케이스
- `docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md` — ADR-001 원본
- `docs/research/decisions/ADR-002-supabase-adaptation-strategy.md` — 기존 Supabase 적응 전략

---

## 13. 변경 이력

| 날짜 | 세션 | 변경 내용 |
|------|------|-----------|
| 2026-04-26 | 세션 58 | ACCEPTED — 옵션 C 채택, 8개 부속 결정 모두 권고대로 확정 |

---

**문서 신뢰도**: 90% (옵션 C/D 권고는 1인 운영 가정 + Almanac 사례 기반. 외부 컨슈머 N=10 이상 시 옵션 B 가중치 재검토 필요)

**다음 ADR**: ADR-027 (Multi-tenant Router 패턴) — manifest.routes[]의 path가 실제 URL로 어떻게 매핑되는지 결정.
