# ADR-024 — Tenant/Plugin 코드 격리 모델

| 항목 | 값 |
|------|-----|
| 상태 | **PROPOSED** |
| 결정 | **ACCEPTED (2026-04-26, 옵션 D)** |
| 작성 | 2026-04-26 (세션 57, ADR sub-agent #4 산출물) |
| 작성자 | Claude (1인 운영 BaaS 컨텍스트) |
| Supersedes | — (신설) |
| Related | ADR-022 (정체성 재정의), ADR-023 (데이터 격리), ADR-026 (Manifest), ADR-002 (Yangpyeon 정체성), ADR-027 (Router) |
| 영향 범위 | 저장소 구조 / 빌드 / Cron / Edge Functions / Prisma / Admin UI / CI 파이프라인 전반 |
| 결정 마감 | ADR-022 결정 직후 (Almanac 통합 차단 요인) |

---

## 1. 컨텍스트

### 1.1 트리거 — N=10~20 컨슈머 프로젝트의 도메인 코드 적재

ADR-022(정체성 재정의)에서 yangpyeon-server를 "1인 운영 N-프로젝트 BaaS"로 재정의하면서, 각 컨슈머 프로젝트(이하 "tenant")가 자신의 **도메인 고유 코드**를 yangpyeon에 추가해야 하는 요구가 발생했다.

| 컨슈머 (tenant) | 도메인 코드 예시 | 복잡도 |
|------|------------------|--------|
| **Almanac** (RSS 어그리게이터) | RSS fetcher, HTML scraper(cheerio), classifier(LLM), promoter, dedupe, 6 cron job, 5 REST 라우트, 4 admin 페이지, 6 Prisma 모델 | **고** (15 작업일) |
| **(가상) JobBoard** | 채용공고 스크레이퍼, slug 생성, 공유 카드 OG 이미지 | 중 |
| **(가상) DailyBriefing** | 메일 발송 worker, 템플릿 엔진 | 중 |
| **(가상) StatusPing** | 단순 HTTP poll → DB row update | 저 |
| **(가상) FormCollector** | webhook 수신 → 정규화 → 저장 | 저 |
| **(가상) PriceWatcher** | 단일 URL fetch + diff | 저 |
| ... × N (10~20개) | | |

**문제**: 이 코드를 yangpyeon 코드베이스에 어떻게 격리할 것인가?

### 1.2 현재 상태 — Almanac이 첫 번째 사례

Almanac 통합은 이미 spec/aggregator-fixes 브랜치에서 진행 중이다 (`docs/assets/yangpyeon-aggregator-spec/`). 현재 적용 패턴은:

```
yangpyeon-server/
├── prisma/
│   └── schema.prisma  ← Almanac 6개 모델을 직접 append
├── src/
│   ├── lib/
│   │   ├── aggregator/  ← Almanac 도메인 코드가 src/lib/ 직속에 위치
│   │   │   ├── fetchers/{rss,html,api}.ts
│   │   │   ├── dedupe.ts
│   │   │   ├── classify.ts
│   │   │   ├── llm.ts
│   │   │   ├── promote.ts
│   │   │   └── runner.ts
│   │   └── cron/
│   │       └── runner.ts  ← AGGREGATOR kind 분기 직접 추가
│   └── app/
│       ├── api/v1/almanac/  ← Almanac 도메인 라우트
│       └── admin/aggregator/  ← Almanac 도메인 admin UI
└── package.json  ← rss-parser, cheerio, @google/genai 직접 추가
```

**의미**: tenant 도메인 코드와 yangpyeon core 코드의 **물리적 격벽이 0**. N=20으로 확장 시 src/ 하위가 20개 도메인의 잡탕이 된다.

### 1.3 현재 yangpyeon 저장소 구조 확인

`package.json` (라인 1~68) 확인 결과:

- `"name": "yangpyeon-dashboard"`, `"private": true`
- **`workspaces` 필드 없음** → **단일 패키지 (non-monorepo)**
- 모든 의존성이 루트 `package.json`에 평탄하게 나열
- `src/` 단일 트리, Next.js 16 App Router 전형 구조
- 빌드 도구: `next dev` / `next build` 직접 호출, turborepo/nx 없음

→ 모노레포 도구 도입은 **신규 결정**이며, 본 ADR이 그 결정의 근거가 된다.

### 1.4 ADR-001/ADR-002 상속 사실

- ADR-001: "Plugin/도메인 코드 격리 = 단일 Next.js 인스턴스" (의도적 결정, 단일 테넌트 가정 위에서)
- ADR-002: Supabase OSS 스택 선별 재현, **EdgeFunction = isolated-vm v6 + Deno 사이드카** (이 결정은 본 ADR의 옵션 C에서 언급되지만 변경하지 않음)

ADR-001은 ADR-022가 supersede 했으므로 격리 모델 재검토는 정당하다.

### 1.5 본 ADR이 답해야 할 질문

1. tenant 도메인 코드를 yangpyeon 저장소 안의 어떤 단위로 격리하는가?
2. tenant 코드가 yangpyeon core(Prisma client, api-guard, cron registry)를 어떻게 import 하는가?
3. tenant Prisma schema fragment가 core schema와 어떻게 합쳐지는가?
4. tenant admin UI 페이지가 core admin UI에 어떻게 등록되는가?
5. tenant cron handler가 core cron registry에 어떻게 등록되는가?
6. CI/CD가 변경된 tenant만 빌드/테스트할 수 있는가?
7. Almanac이 현재의 직접 통합 패턴에서 본 ADR로 어떻게 마이그레이션 되는가?

---

## 2. 옵션 분석

### 2.1 옵션 A — In-Repo Workspace (pnpm/turborepo monorepo)

#### 구조

```
yangpyeon-server/  (모노레포 루트, pnpm-workspace.yaml)
├── pnpm-workspace.yaml
├── turbo.json
├── packages/
│   ├── core/                     ← 기존 yangpyeon 본체 이전
│   │   ├── prisma/schema.prisma  ← core 모델만 (User, Session, ApiKey, ...)
│   │   ├── src/
│   │   │   ├── lib/{auth,cron,api-guard,...}/
│   │   │   ├── app/api/v1/{auth,api-keys,members,sql,functions,cron,...}
│   │   │   └── app/admin/{settings,users,...}
│   │   └── package.json  (name: "@yangpyeon/core")
│   ├── tenant-almanac/           ← Almanac 도메인 패키지
│   │   ├── manifest.ts           ← cron handlers, routes, admin pages, deps 선언
│   │   ├── prisma/fragment.prisma  ← ContentSource, ContentItem, ...
│   │   ├── src/
│   │   │   ├── handlers/{rss,html,api,classify,promote}.ts
│   │   │   ├── routes/{contents,categories,sources,items,today-top}/
│   │   │   ├── admin/{sources,categories,items,dashboard}/
│   │   │   └── seed.ts
│   │   └── package.json  (name: "@yangpyeon/tenant-almanac",
│                          dependencies: {"@yangpyeon/core": "workspace:*",
│                                         "rss-parser": "^3.13",
│                                         "cheerio": "^1.0",
│                                         "@google/genai": "^1.50"})
│   ├── tenant-jobboard/  (가상)
│   ├── tenant-statusping/  (가상)
│   └── ...
└── apps/
    └── web/                      ← Next.js 빌드 진입점
        ├── app/                  ← core + 모든 tenant route 머지
        ├── prisma/schema.prisma  ← core + tenant fragment 합쳐서 생성됨
        └── package.json  (dependencies: 모든 tenant 패키지 + core)
```

#### Prisma 통합 방법

Prisma는 단일 schema 파일을 요구하므로(7.x 시점 multi-file은 preview), **빌드 전 schema 병합 단계**가 필요:

```bash
# packages/core/prisma/schema.prisma + packages/tenant-*/prisma/fragment.prisma
#   → apps/web/prisma/schema.prisma (자동 생성)
pnpm tenant:assemble-schema
pnpm prisma generate
```

`tenant:assemble-schema` 스크립트는 모든 `packages/tenant-*/prisma/fragment.prisma`를 읽어 core schema 끝에 append (선언적 병합 + 충돌 검출). 산출 schema는 git ignored, 빌드 산출물.

→ tenant 패키지는 Prisma client를 `@yangpyeon/core`에서 re-export 받아 사용:
```ts
// packages/core/src/lib/prisma.ts
export { PrismaClient, type ContentSource, ... } from "@/generated/prisma/client";
```
이러면 tenant 코드가 `import { prisma, type ContentItem } from "@yangpyeon/core"` 한 줄로 type-safe 접근 가능.

#### Admin UI 통합 (Next.js App Router)

각 tenant 패키지는 자기 admin 페이지를 export하고, `apps/web/app/admin/`에서 **route group**으로 마운트:

```
apps/web/app/admin/
├── (core)/        ← yangpyeon core admin (settings, users, audit-logs)
├── (almanac)/     ← @yangpyeon/tenant-almanac/admin/* re-export
│   ├── sources/page.tsx     → "use server"; export { default } from "@yangpyeon/tenant-almanac/admin/sources"
│   ├── categories/page.tsx
│   ├── items/page.tsx
│   └── dashboard/page.tsx
├── (jobboard)/
└── ...
```

route group `(name)`은 URL에 노출되지 않으므로 `/admin/sources` 처럼 깔끔. 또는 tenant prefix 강제 시 `apps/web/app/admin/[tenant]/sources/page.tsx` 동적 라우트로 라우팅.

**Manifest 자동 등록 (옵션 D와 통합 시)**: tenant 패키지의 manifest.ts에 admin route 메타데이터를 선언하고, 빌드 시 `apps/web/app/admin/` 디렉토리를 codegen으로 생성 — 수동 re-export 페이지 작성 불필요.

#### Cron 등록

tenant 패키지의 `manifest.ts`:

```ts
// packages/tenant-almanac/manifest.ts
import type { TenantManifest } from "@yangpyeon/core";
import { runRssFetcher } from "./src/handlers/rss";
import { runClassifier } from "./src/handlers/classify";
// ...

export default {
  id: "almanac",
  version: "1.0.0",
  cronHandlers: {
    "rss-fetcher": runRssFetcher,
    "html-scraper": runHtmlScraper,
    "api-poller": runApiPoller,
    "classifier": runClassifier,
    "promoter": runPromoter,
  },
  routes: [
    { path: "/api/v1/almanac/contents", handler: () => import("./src/routes/contents") },
    // ...
  ],
  prismaFragment: "./prisma/fragment.prisma",
  envVarsRequired: ["GEMINI_API_KEY", "ALMANAC_ALLOWED_ORIGINS"],
} satisfies TenantManifest;
```

core의 `src/lib/cron/runner.ts`는 `AGGREGATOR` kind 하드코딩 분기 대신 manifest registry에서 dynamic dispatch:

```ts
// packages/core/src/lib/cron/runner.ts (개념)
import { tenantRegistry } from "@/lib/tenants";

if (job.kind === "TENANT") {
  const { tenantId, module } = payload;
  const handler = tenantRegistry.get(tenantId)?.cronHandlers[module];
  if (!handler) return failure(started, `tenant=${tenantId} module=${module} 핸들러 없음`);
  return await handler(payload, ctx);
}
```

#### CI/CD

turborepo의 `--filter` + remote cache로 변경된 패키지만 빌드/테스트:

```bash
turbo build --filter='...[origin/main]'  # main 대비 변경된 패키지 + 의존 패키지만
turbo test --filter='@yangpyeon/tenant-almanac'  # Almanac만 테스트
```

#### 장점

- **통합 IDE 경험**: 단일 VSCode 워크스페이스에서 core + 모든 tenant 동시 탐색
- **디버깅 용이**: tenant 코드에서 core 함수로 직접 점프 (Go to Definition), breakpoint 자유
- **Prisma type 공유**: core가 export한 type을 tenant가 import. type 변경 즉시 컴파일 에러로 노출
- **단일 git history**: tenant 변경과 core 변경이 같은 커밋에 묶일 수 있음 (atomic refactor)
- **빌드 캐시**: turborepo가 변경 안 된 패키지는 캐시 hit
- **ADR-022/023 (테넌트 ID 차원 추가)와 자연스럽게 결합**: tenant 패키지가 자기 모델에 tenantId를 박아두는 패턴 강제 가능
- **권한 분리 가능**: pnpm의 `publish: false` + `private: true`로 외부 노출 차단

#### 단점

- **모노레포 도구 학습**: pnpm-workspace, turborepo 설정/디버깅 (~3~5 작업일)
- **빌드 설정 복잡도**: schema 병합 스크립트, manifest codegen, Next.js의 transpilePackages 설정
- **모든 컨슈머 코드가 같은 저장소**: tenant A 작성자가 tenant B 코드를 git log에서 보게 됨 (1인 운영자에겐 무관)
- **Next.js의 단일 빌드**: tenant 1개 변경에도 apps/web 전체 next build 재실행 (turborepo 캐시로 완화 가능하지만 0은 아님)
- **Prisma 단일 client**: 모든 tenant 모델이 같은 PrismaClient 인스턴스에 들어감. 메모리·startup time이 tenant 수에 비례
- **마이그레이션 충돌**: tenant A와 tenant B가 같은 시점에 schema 추가 시 마이그레이션 파일 순서 충돌 가능

#### 1인 운영 적합도

**높음**. 1인이 모든 코드에 접근 가능해야 하므로 단일 저장소가 자연스럽다. 모노레포 도구 학습이 진입 비용이지만 한 번 배우면 N개 tenant 추가 비용이 선형.

---

### 2.2 옵션 B — 외부 npm 패키지 (`@yangpyeon/tenant-almanac`)

#### 구조

```
# 별도 git 저장소 1개당 tenant 1개
github.com/kdy/yangpyeon-tenant-almanac
├── src/
├── prisma/fragment.prisma
├── manifest.ts
└── package.json  (name: "@yangpyeon/tenant-almanac",
                   publishConfig: {registry: "https://npm.pkg.github.com"})

# yangpyeon-server (메인 저장소)
github.com/kdy/yangpyeon-server
├── package.json  (dependencies: {"@yangpyeon/tenant-almanac": "^1.0"})
├── src/lib/tenants.ts  ← npm 의존성으로부터 자동 등록
└── ... (core만 유지)
```

발행 흐름:
1. tenant 저장소에서 코드 변경 → `pnpm publish` (GitHub Packages 또는 private npm)
2. yangpyeon-server에서 `pnpm update @yangpyeon/tenant-almanac`
3. yangpyeon-server 빌드 → 배포

#### 장점

- **진정한 격리**: tenant 저장소의 권한·git history·CI 완전 분리
- **컨슈머별 버전 관리**: tenant A는 v2.0, tenant B는 v0.5 식으로 독립 진화. yangpyeon이 stable 버전만 install
- **권한 분리**: tenant 저장소를 외부 협력자에게 위임 가능 (yangpyeon core는 보호)
- **저장소 크기 분산**: 메인 저장소가 N개 tenant 코드로 비대해지지 않음

#### 단점

- **운영 복잡도 폭증 (1인 운영 치명적)**: tenant 코드 수정 시 publish → update → 빌드의 3단계. 한 줄 버그 수정에도 npm publish가 필요. 디버깅 시 `pnpm link` / `unlink` 반복.
- **로컬 개발 마찰**: tenant 코드 수정 후 즉시 yangpyeon에서 보려면 `pnpm link`. link 상태와 install 상태가 서로 다른 동작 → 환각 디버깅 함정
- **Prisma type 공유 어려움**: tenant package가 core PrismaClient의 type을 어떻게 받는가? peer dependency로 `@yangpyeon/core` 선언 → 버전 미스매치 시 type 오류 폭증
- **Schema fragment 통합 복잡**: tenant가 npm으로 install되는 시점에 fragment가 어디 있나? `node_modules/@yangpyeon/tenant-*/prisma/fragment.prisma`를 빌드 스크립트가 모두 수집해야 함. 옵션 A와 동일하지만 경로가 node_modules 안.
- **Admin UI 통합**: npm 패키지가 React 컴포넌트를 export하면 yangpyeon이 Next.js page에서 import. 가능하지만 transpilePackages 설정 필수
- **N=20 시점 운영 비용**: 20개 tenant 저장소의 publish 자동화·CI·종속성 업데이트 추적이 1인에게 과중
- **GitHub Packages 비용/권한**: private package 사용 시 토큰 관리, CI 인증 추가

#### 1인 운영 적합도

**낮음**. publish/install 분리는 다인 팀·외부 컨슈머가 있을 때 가치가 있으나, 1인이 모든 tenant를 작성하는 시나리오에서는 순수 오버헤드.

---

### 2.3 옵션 C — 동적 Manifest Only (코드 인터프리터)

#### 구조

tenant를 DB row 1개로 정의:

```sql
INSERT INTO tenants (id, name, manifest) VALUES (
  'almanac',
  'Almanac Aggregator',
  '{
    "cronHandlers": {
      "rss-fetcher": "async function(){ const r = await fetch(...); ... }"
    },
    "routes": [...],
    "prismaFragment": "model ContentSource { ... }"
  }'::jsonb
);
```

yangpyeon core는 런타임에 manifest를 읽고, handler 코드 문자열을 isolated-vm v6에서 evaluate.

#### 장점

- **컨슈머 추가 = DB row 1개**: 빌드/배포 없이 운영자 콘솔에서 tenant 등록
- **hot reload**: 코드 수정 즉시 반영 (재시작 불필요)
- **tenant 격리 강함**: isolated-vm 메모리/CPU 격리

#### 단점

- **TypeScript 안전성 상실**: 핸들러 코드가 문자열이므로 컴파일 시점 type check 불가. tenant가 잘못된 ContentSource 필드명을 써도 런타임에 발견
- **디버깅 지옥**: stack trace가 isolated-vm 내부 좌표. source map 없음. console.log → 별도 채널로 흘려야 보임
- **보안 표면 폭증**: tenant 정의 = 권한 있는 사용자가 임의 코드 실행 가능 (RCE 표면). 입력 검증·권한 가드를 tenant 등록 라우트에 매우 엄격히 걸어야 함
- **Prisma 사용 불가**: isolated-vm에 Prisma client를 통째로 넘기면 격리가 깨짐. proxy로 화이트리스트 메서드만 노출하는 별도 ABI 설계 필요 → 사실상 새 ORM 발명
- **Almanac 같은 복잡한 도메인은 표현 불가**: cheerio, rss-parser, @google/genai 같은 npm 의존성이 isolated-vm 안에서 동작하려면 별도 번들링 — 더 이상 "DB row 1개"가 아님
- **운영자 1인의 인지 부담**: 5천 줄 도메인 코드를 manifest JSON으로 관리?

#### ADR-002와의 관계

ADR-002에서 EdgeFunction = isolated-vm v6 + Deno 사이드카로 결정됨. 본 옵션 C는 그 인프라를 tenant 격리에 재사용하자는 제안이나, **본 ADR은 ADR-002의 기술 선택을 변경하지 않는다**. 옵션 C가 채택되더라도 "isolated-vm v6 위에서 동작"이라는 제약은 유지된다.

#### 1인 운영 적합도

**낮음**. 표면적으로는 가벼워 보이지만 디버깅·type 안전성 비용이 1인 운영자의 최약점(컨텍스트 유지 능력)을 직격.

---

### 2.4 옵션 D — Hybrid (단순 = manifest, 복잡 = workspace)

#### 정의

tenant를 두 등급으로 구분:

| 등급 | 정의 | 격리 방식 | 예시 |
|------|------|-----------|------|
| **Simple** | URL/엔드포인트 정의 + 100줄 미만 handler + Prisma 모델 0~1개 | DB의 manifest row + isolated-vm v6 (옵션 C) | StatusPing, PriceWatcher, FormCollector |
| **Complex** | RSS 파서/LLM/cheerio 등 npm 의존성 + 다수 cron + 다수 라우트 + 6+ Prisma 모델 + admin UI | workspace 패키지 (옵션 A) | Almanac, JobBoard, DailyBriefing |

진입 기준 (Complex로 분류):
- npm dependency 1개 이상 추가 필요
- Prisma model 2개 이상
- handler 합 코드 줄 수 ≥ 200
- admin UI 페이지 ≥ 1개

위 4개 중 하나라도 해당하면 Complex(workspace), 모두 해당 안 되면 Simple(manifest).

#### 구조

옵션 A의 monorepo 구조를 그대로 채택하되, `packages/tenant-*/` 외에 추가로:

```
packages/core/
└── src/lib/tenants/
    ├── workspace-loader.ts  ← packages/tenant-*/manifest.ts 빌드 시 import
    └── manifest-loader.ts   ← DB의 simple_tenants 테이블에서 매분 reload
```

DB:
```prisma
// core schema
model SimpleTenant {
  id           String   @id
  name         String
  enabled      Boolean  @default(true)
  cronHandlers Json     // { "module-name": "async function() { ... }" }
  routes       Json     // [{path, handlerCode}]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

#### 장점

- **점진적 진입**: 첫 tenant(Almanac)는 workspace로 가되, "URL 1개 + 카운터 증가" 같은 단순 tenant는 빌드 없이 운영
- **각 모델의 단점 회피**: 복잡 도메인은 workspace로 type 안전, 단순 도메인은 manifest로 운영 민첩성
- **N=20 확장 현실적**: 20개 중 5~7개는 Complex(workspace), 나머지는 Simple(manifest)이라는 가정 하에 저장소 비대화 완화

#### 단점

- **두 모델 동시 유지**: cron runner가 workspace handler와 manifest handler 둘 다 dispatch해야 함 → registry 코드가 둘로 분기
- **분류 기준 흔들림**: "지금은 simple인데 나중에 complex로 승격"하는 마이그레이션 흐름 정의 필요
- **manifest 부분의 보안 표면**: 옵션 C의 보안 단점이 부분적으로 잔존 (다만 Simple은 권한 있는 사용자가 직접 작성하므로 RCE 위험은 운영자 자기 책임 영역)

#### 1인 운영 적합도

**높음**. 옵션 A의 안전망 + 단순 사례의 민첩성. "모든 것을 workspace로"가 과잉인 경우(예: cron 1개짜리 ping)에 출구를 제공.

---

## 3. 비교 매트릭스

| 차원 | A workspace | B npm 외부 | C manifest | D hybrid |
|------|-------------|------------|------------|----------|
| **격리 강도** | 중 (저장소 동일, 빌드 분리) | 강 (저장소·publish 분리) | 약~중 (런타임 격리, 코드 노출) | 중 (A=중, C 부분=약) |
| **디버깅 용이** | OK (단일 IDE, source map) | △ (link/unlink) | NG (isolated-vm trace) | OK (Complex만 디버깅 대상) |
| **1인 운영** | OK (단일 저장소·단일 명령) | NG (publish 흐름 과중) | NG (디버깅 비용) | OK (점진적) |
| **N=20 확장** | OK (turborepo cache) | OK (분리 강함) | △ (manifest 관리 한계) | OK |
| **TypeScript 안전** | OK (workspace 의존성으로 type 공유) | OK (peer dep) | NG (문자열 코드) | OK (Complex만 typed) |
| **학습 비용** | 중 (pnpm-workspace, turborepo, schema 병합) | 저 (npm publish는 흔함) | 저 (DB row 1개) | 중 (A 전부 + manifest 일부) |
| **빌드 시간** | 중 (turborepo 캐시 hit 시 짧음) | 저 (각 tenant 독립 빌드) | 저 (빌드 없음) | 중 |
| **배포 흐름** | 단일 (apps/web 1회 빌드) | N단계 (publish → update → 빌드) | DB write 1회 | 단일 + DB write |
| **Prisma 통합** | schema 병합 스크립트 | schema 병합 + node_modules 수집 | 별도 ABI 필요 | A와 동일 |
| **Admin UI 통합** | route group + re-export | transpilePackages | 동적 라우트 + 코드 평가 | A와 동일 |
| **CI/CD 선택 빌드** | OK (turborepo --filter) | OK (저장소 별로 자연스러움) | N/A | OK |
| **Almanac 마이그레이션 비용** | 중 (~5일, 코드 이전 + manifest 작성) | 고 (~10일, 별도 저장소 셋업·publish 자동화) | 적용 불가 | 중 (~5일, Almanac은 Complex 분류) |
| **ADR-022 테넌트 ID 강제력** | 강 (workspace 컨벤션으로) | 강 (peer dep) | 중 (런타임 검증) | 강 |
| **롤백 단위** | 패키지 단위 git revert | npm version pin | manifest row UPDATE | A + DB row |

### 정량 점수 (1=최악, 5=최선, 가중치 ×W)

| 차원 | W | A | B | C | D |
|------|---|---|---|---|---|
| 1인 운영 부담 | 3 | 4 | 1 | 2 | 5 |
| 디버깅 용이 | 3 | 5 | 3 | 1 | 5 |
| TypeScript 안전 | 3 | 5 | 5 | 1 | 5 |
| N=20 확장성 | 2 | 4 | 5 | 2 | 5 |
| 학습/도입 비용 | 2 | 3 | 4 | 4 | 3 |
| 격리 강도 | 1 | 3 | 5 | 3 | 4 |
| Almanac 마이그레이션 | 2 | 4 | 2 | 1 | 4 |
| **가중 합** | | **63** | **52** | **30** | **72** |

→ **D > A >> B > C** (정량 기준)

---

## 4. Almanac 적용 시나리오

### 4.1 옵션 A 채택 시 Almanac 재구조화

현재 spec/aggregator-fixes 브랜치의 작업물을 다음과 같이 이동:

| 현재 위치 (spec/aggregator-fixes) | 목표 위치 (옵션 A) |
|-----------------------------------|---------------------|
| `prisma/schema.prisma` 끝의 6개 모델 | `packages/tenant-almanac/prisma/fragment.prisma` |
| `src/lib/aggregator/**` | `packages/tenant-almanac/src/handlers/**` |
| `src/lib/cron/runner.ts`의 `AGGREGATOR` 분기 | `packages/core/src/lib/cron/runner.ts`에 `TENANT` kind 추가 + `packages/tenant-almanac/manifest.ts`의 cronHandlers |
| `src/app/api/v1/almanac/**` | `packages/tenant-almanac/src/routes/**` + `apps/web/app/api/v1/almanac/**` (re-export 또는 manifest codegen) |
| `src/app/admin/aggregator/**` | `packages/tenant-almanac/src/admin/**` + `apps/web/app/admin/(almanac)/**` |
| `package.json`의 rss-parser, cheerio, @google/genai | `packages/tenant-almanac/package.json` |
| `src/lib/data-api/allowlist.ts` 머지 분 | `packages/tenant-almanac/manifest.ts`의 `dataApiAllowlist` 필드 + core 빌드 시 통합 |

마이그레이션 작업량 추정: **5 작업일** (코드 이동 2일 + workspace 셋업 1일 + Prisma 병합 스크립트 1일 + smoke test 1일)

### 4.2 옵션 D 채택 시 (저자 권고 안)

Almanac은 Complex로 분류되므로 옵션 A와 동일하게 workspace 패키지로 이동.

추가로 packages/core/는 `SimpleTenant` 모델만 신설(빈 테이블로 시작). 나중에 단순한 tenant가 등장할 때 manifest로 등록.

### 4.3 Almanac spec과의 충돌 명시

> **Almanac 통합 작업이 spec/aggregator-fixes 브랜치에서 진행 중이며, 위 ADR이 결정되기 전까지 현재 패턴(직접 src/ 통합)으로 계속된다.**
>
> ADR-024가 옵션 A 또는 D로 결정되면, Almanac 코드를 packages/tenant-almanac/로 재구조화해야 한다. 이는 약 5 작업일의 추가 작업이며, Almanac 1.0 출시 게이트(`docs/assets/yangpyeon-aggregator-spec/README.md` §4)와 충돌하지 않도록 다음 중 하나를 선택:
>
> 1. **Almanac 1.0 출시 후 재구조화** — 1.0 가동 검증 완료 후 Phase 16에서 마이그레이션. 1인 운영 부담 최소.
> 2. **출시 전 재구조화** — ADR 결정 즉시 Almanac을 workspace로 이전, 출시 일정 +5일.
>
> 본 ADR은 결정만 하고, 마이그레이션 일정은 ADR-022/026 결정 시점에 통합 결정한다.

---

## 5. 권고 (ACCEPTED 2026-04-26)

### 5.1 1순위: 옵션 D (Hybrid)

**근거**:
- 정량 점수 최고 (72/85)
- Almanac 같은 복잡 도메인은 옵션 A의 type 안전·디버깅 이점을 받음
- 향후 등장할 단순 tenant(StatusPing류)에 manifest 출구 제공
- 1인 운영자가 모든 tenant를 직접 작성하는 시나리오에 가장 적합

### 5.2 2순위: 옵션 A (workspace only)

**근거**:
- 옵션 D보다 단순 (manifest 분기 없음)
- "단순 tenant도 workspace로" 통일성. 학습 곡선 1회성
- N=20 시점에 simple tenant도 5~10개씩 추가하면 옵션 A의 저장소 비대 우려가 현실화 가능 (이때 D로 점진 전환)

### 5.3 권장 결정 흐름

1. **ADR-022/026이 먼저 결정**: 정체성 재정의 + manifest 데이터 구조가 본 ADR보다 상위 결정
2. **본 ADR은 옵션 D 채택 권고**, 단 첫 tenant(Almanac) 마이그레이션 시점에는 workspace 부분만 가동, manifest 부분(SimpleTenant 모델)은 빈 테이블로 신설만 하고 첫 simple tenant 등장 시 활성화
3. **Almanac 마이그레이션은 1.0 출시 후**: spec/aggregator-fixes 브랜치 작업을 방해하지 않음. Phase 16에서 packages/tenant-almanac/로 이전

### 5.4 결정 (ACCEPTED 2026-04-26)

| 결정 항목 | 값 |
|-----------|-----|
| 채택 옵션 | **ACCEPTED — 옵션 D (hybrid: Complex=workspace, Simple=manifest)** |
| Almanac 마이그레이션 시점 | ACCEPTED — v1.0 출시 후 (충돌 회피) |
| 모노레포 도구 | ACCEPTED — pnpm + turborepo |
| Prisma schema 병합 방식 | ACCEPTED — 스크립트 기반 append (multiSchema preview 모니터링) |
| Admin UI 통합 방식 | ACCEPTED — route group + manifest codegen |
| Cron registry 변경 | ACCEPTED — TENANT kind 신설 + manifest dispatch |
| Simple tenant manifest 활성화 시점 | ACCEPTED — 첫 사례 등장 시 |

---

## 6. 결정 시 즉시 영향 받는 작업

### 6.1 코드 영향 (옵션 A/D 채택 시)

| 파일 | 변경 유형 |
|------|-----------|
| **루트 `package.json`** | workspaces 필드 추가, scripts 재작성 |
| **신규 `pnpm-workspace.yaml`, `turbo.json`** | 모노레포 설정 |
| **`packages/core/`** | 기존 src/, prisma/, public/ 이전 |
| **`apps/web/`** | Next.js 빌드 진입점 신설, prisma/schema.prisma는 codegen |
| **`packages/core/src/lib/cron/runner.ts`** | `TENANT` kind 분기 추가, hardcoded `AGGREGATOR` 분기 제거 |
| **`packages/core/src/lib/tenants/`** | 신규 — workspace-loader, manifest-loader, registry |
| **`packages/core/prisma/schema.prisma`** | core 모델만, fragment 병합 대상 |
| **신규 `scripts/assemble-schema.ts`** | tenant fragment 수집 → apps/web/prisma/schema.prisma 생성 |
| **`packages/tenant-almanac/`** | (Almanac 마이그레이션 시) 신규 |
| **`.github/workflows/*.yml`** | turborepo --filter 적용, tenant별 테스트 매트릭스 |

### 6.2 ADR 영향

| ADR | 영향 |
|-----|------|
| ADR-022 | "1인 N프로젝트 BaaS" 정의에 "tenant = workspace 패키지 또는 SimpleTenant row" 명시 필요 |
| ADR-023 | 데이터 격리(tenant_id 컬럼 vs schema 분리)가 packages/tenant-*/prisma/fragment.prisma 컨벤션과 정합 필요 |
| ADR-026 | Manifest 스키마(cronHandlers, routes, prismaFragment, envVarsRequired, dataApiAllowlist 등)가 본 ADR의 manifest.ts 인터페이스와 일치해야 함 |
| ADR-027 | Router 패턴(subdomain vs JWT vs path)이 manifest의 routes 등록 방식과 통합 필요 |
| ADR-028 | Cron Worker Pool이 TENANT kind를 인식, advisory lock key에 tenantId 포함 |
| ADR-029 | Observability가 tenant 차원으로 metrics/logs/traces 분리 |

### 6.3 운영 영향 (1인)

- **신규 학습**: pnpm-workspace, turborepo (~3일), Next.js transpilePackages, manifest 패턴 설계 (~2일)
- **마이그레이션 1회 비용**: yangpyeon core를 packages/core/로 이전 (~3일)
- **첫 tenant 마이그레이션 (Almanac)**: ~5일
- **이후 tenant 추가 한계 비용**: complex tenant ~2일/개, simple tenant ~30분/개 (manifest row)

---

## 7. 리스크 및 미해결 질문

### 7.1 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| **Prisma 7.x multiSchema 미성숙** | schema 병합 스크립트 유지 부담 | Prisma 8 출시 시 multiSchema 마이그레이션 검토 |
| **Next.js의 transpilePackages 학습 곡선** | apps/web에서 workspace 패키지 import 실패 | 옵션 A 도입 전 PoC 1일 |
| **turborepo cache invalidation 오류** | 변경 안 했는데 재빌드 또는 변경했는데 캐시 hit | turbo.json의 inputs/outputs 정확 정의, CI에서 cache miss 메트릭 추적 |
| **Almanac 마이그레이션 중 main 충돌** | spec/aggregator-fixes 머지 → ADR-024 적용 사이의 windows | 마이그레이션을 별도 PR로 격리, 머지 직전 rebase |
| **manifest의 보안 가드 미흡** (옵션 D) | RCE 표면 | SimpleTenant 등록을 ADMIN role 강제 + audit log 필수 (ADR-021 활용) |
| **packages/core의 단방향 의존성 위반** | tenant 패키지가 core를 import하지만 core가 tenant를 import하면 순환 | manifest registry는 core가 런타임에 dynamic import — 빌드 시 의존 금지 (ESLint 규칙 추가) |

### 7.2 미해결 질문

1. **Tenant 패키지 publish 옵션**: 옵션 A에서도 tenant 패키지를 GitHub Packages에 publish할 가치가 있나? (외부 tenant 작성자 등장 시)
2. **Schema fragment 충돌 처리**: tenant A와 tenant B가 같은 enum 이름을 정의하면? (네임스페이스 강제? Prisma `@@schema` 활용?)
3. **Tenant disable 동작**: tenant_almanac을 manifest registry에서 제외하면 cron job/route가 자동으로 사라지는가? 또는 410 Gone 응답?
4. **Tenant 간 데이터 참조**: tenant_almanac의 ContentItem이 tenant_dailybriefing의 EmailTemplate을 참조해야 한다면? (현재로선 금지가 합리적이지만 명문화 필요)
5. **Hot reload 가능성**: 개발 시 tenant 코드 수정에 next dev가 반응하는가? (Next.js 16 + transpilePackages 동작 확인)

---

## 8. 결정 시 검증 계획

본 ADR이 옵션 A 또는 D로 결정되면 다음 PoC로 검증:

| PoC | 산출물 | 작업량 | Go 기준 |
|-----|--------|--------|---------|
| **PoC-1: pnpm-workspace + turborepo 셋업** | 빈 packages/core + apps/web 빌드 성공 | 1일 | next build 성공 |
| **PoC-2: Prisma schema 병합 스크립트** | core + dummy fragment 1개 → 단일 client 생성, type export 검증 | 1일 | tenant 패키지에서 `import { ContentItem } from "@yangpyeon/core"` 컴파일 OK |
| **PoC-3: TENANT cron kind dispatch** | dummy tenant manifest 1개로 cron 실행 + audit log 기록 | 0.5일 | tick에서 dummy handler 호출 확인 |
| **PoC-4: Admin UI route group 통합** | dummy admin page 1개를 apps/web에서 렌더 | 0.5일 | /admin/(dummy)/test 200 응답 |
| **PoC-5: turborepo --filter CI** | tenant 1개 변경 시 core 빌드 skip 확인 | 1일 | turbo run build --filter='...[HEAD~1]' cache hit |

총 PoC 작업량: **4일**. 전부 Go 시 본 ADR 옵션 A/D 채택 확정.

---

## 9. 참고

- ADR-001 (Multi-tenancy 의도적 제외) — supersede 대상, ADR-022로 갱신
- ADR-002 (Yangpyeon 정체성, isolated-vm v6 결정) — 본 ADR 옵션 C에서 언급, **기술 선택 변경 없음**
- ADR-022 (정체성 재정의 — 1인 N프로젝트 BaaS) — 본 ADR의 상위 결정
- ADR-023 (데이터 격리) — schema fragment 통합과 정합 필요
- ADR-026 (Manifest 설계) — 본 ADR의 manifest.ts 인터페이스 정의 위치
- ADR-027 (Router 패턴) — routes 등록 방식 통합
- ADR-028 (Cron Worker Pool) — TENANT kind dispatch
- 00-context/01-existing-decisions-audit.md §1.2, §4(b)
- 00-context/02-current-code-audit.md §3, §4, §7
- docs/assets/yangpyeon-aggregator-spec/01-overview.md, README.md (Almanac spec 전체)
- spike-010 (PM2 cluster:4) — TENANT cron dispatch 시 advisory lock key 설계에 영향

---

## 10. 변경 이력

- **2026-04-26 (v1.0, 세션 57)**: 초안. PROPOSED, [PENDING DECISION]. 옵션 A/B/C/D 분석, D 권고. Almanac 마이그레이션 충돌 명시.
- 2026-04-26 (세션 58, v1.1 ACCEPTED): 옵션 D 채택. 7개 부속 결정 모두 권고대로 확정.
