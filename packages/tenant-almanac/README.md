# @yangpyeon/tenant-almanac

> ADR-024 옵션 D (Complex tenant = workspace) 의 첫 적용 사례. **PLUGIN-MIG-1 (S98) 골격 단계.**

## 개요

| 항목 | 값 |
|------|-----|
| Tenant ID | `almanac` |
| 등급 | Complex (workspace) |
| 도메인 | RSS / HTML / API 어그리게이터 + LLM 분류 + 게시 |
| Prisma 모델 수 | 5 (ContentCategory, ContentSource, ContentIngestedItem, ContentItem, ContentItemMetric) |
| Cron 핸들러 수 | 6 (rss-fetcher, html-scraper, api-poller, classifier, promoter, cleanup) |
| 외부 dep | `rss-parser`, `cheerio`, `@google/genai` (현재 root package.json) |
| 첫 컨슈머 진입 | spec/aggregator-fixes 브랜치 v1.0 출시 후 (ADR-024 §4.3 충돌 회피) |

## 마이그레이션 단계 (5 chunk)

| 단계 | 범위 | 산출물 | 차단 사항 |
|------|------|--------|-----------|
| **PLUGIN-MIG-1** ✅ S98 | 골격 + manifest schema-first | 본 디렉토리 + `@yangpyeon/core` 의 `TenantManifest` 인터페이스 | 없음 |
| **PLUGIN-MIG-2** | 핸들러 본체 이전 | `src/lib/aggregator/*` → `packages/tenant-almanac/src/handlers/*` | apps/web 빌드 분리 (Next.js entry 점검 필요) |
| **PLUGIN-MIG-3** | REST 라우트 + admin UI 신설 | `src/routes/*`, `src/admin/*` + apps/web codegen 등록 | manifest dispatch 가 cron runner 의 AGGREGATOR 분기 대체 가능해야 |
| **PLUGIN-MIG-4** | Prisma fragment + tenantId backfill + RLS | `prisma/fragment.prisma` 활성 + `scripts/assemble-schema.ts` | ADR-023 옵션 B (shared+RLS) 정착 + ContentXxx 5 모델 backfill |
| **PLUGIN-MIG-5** | cron runner 의 AGGREGATOR 분기 제거 → manifest dispatch | `src/lib/cron/runner.ts` 단순화 | PLUGIN-MIG-2~4 모두 완료 |

## 현재 상태 (S98)

**골격만 정착**. 핸들러 본체 / 라우트 / admin / Prisma 분리는 모두 placeholder. cron runner 는 여전히 `src/lib/aggregator/runner.ts:runAggregatorModule` 직접 호출.

| 파일 | 상태 |
|------|------|
| `manifest.ts` | ✅ TenantManifest 정합, 모든 cronHandler 는 todoHandler stub |
| `package.json` | ✅ peer-dep `@yangpyeon/core`, private |
| `tsconfig.json` | ✅ extends ../core/tsconfig.json |
| `src/index.ts` | ✅ manifest re-export |
| `src/handlers/` | 📌 .gitkeep + 이전 매핑 표 (PLUGIN-MIG-2) |
| `src/routes/` | 📌 .gitkeep + 이전 매핑 표 (PLUGIN-MIG-3) |
| `src/admin/` | 📌 .gitkeep + 이전 매핑 표 (PLUGIN-MIG-3) |
| `prisma/fragment.prisma` | 📌 placeholder + PLUGIN-MIG-4 단계 명시 |

## 호출 흐름 (목표 구조)

```
apps/web (Next.js)
  ↓ cron runner kind="TENANT"
packages/core/src/cron/dispatch.ts
  ↓ tenantRegistry.get("almanac").cronHandlers["rss-fetcher"]
packages/tenant-almanac/manifest.ts
  ↓ 핸들러 import
packages/tenant-almanac/src/handlers/rss-fetcher.ts
  ↓ Prisma ops (tenantPrismaFor(ctx))
packages/core 가 export 한 PrismaClient (병합 schema 기반)
```

현재 (PLUGIN-MIG-1 만):
```
apps/web
  ↓ cron runner kind="AGGREGATOR" (직접 분기)
src/lib/aggregator/runner.ts:runAggregatorModule
  ↓
src/lib/aggregator/{rss,html,api,classify,llm,promote,cleanup}.ts
```

## 검증

- `npx vitest run packages/core/src/tenant/manifest.test.ts` — TenantManifest 타입 + defineTenant helper (3 PASS)
- `npx tsc --noEmit` — manifest.ts 가 TenantManifest satisfies (root tsc include 는 packages/** 제외, packages/tenant-almanac/tsconfig.json 별도 build)
- `npx vitest run` 전체 — 0 회귀 (본 골격이 app side 영향 0)

## 참고

- ADR-024 옵션 D §4.1 — Almanac 마이그레이션 매핑 (현재 위치 → 목표 위치)
- ADR-024 §6.1 — 코드 영향 (turbo.json / pnpm-workspace.yaml 도입은 별도 결정)
- ADR-022 — BaaS 정체성 재정의 (1인 N프로젝트)
- ADR-023 옵션 B — shared+RLS 데이터 격리 (PLUGIN-MIG-4 의 backfill 정합)
