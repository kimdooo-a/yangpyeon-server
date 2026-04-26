# @yangpyeon/core

> 양평 부엌 서버 멀티테넌트 BaaS 플랫폼 코어. Phase 0.2 (T0.2) 골격 신설.

---

## 위치

5-Plane 시스템의 **② Platform Core**. ADR-024 옵션 D (hybrid plugin) 채택에 따라 yangpyeon 코드베이스는 두 영역으로 영구 분리:

| 영역 | 위치 | 목적 |
|------|------|------|
| **Platform Core** | `packages/core/` (본 패키지) | 모든 컨슈머가 의존하는 불변 인터페이스 (6개월 주기 변경) |
| **Tenant Plugin** | `packages/tenant-<id>/` | 컨슈머별 도메인 코드 (자유 변경) |

---

## 4 불변 인터페이스

| 인터페이스 | 위치 (Phase 1+) | 책임 |
|-----------|-----------------|------|
| `withTenant(handler)` | `./tenant/with-tenant.ts` | Route → tenant 컨텍스트 주입 |
| `withTenantTx(fn)` | `./tenant/with-tenant-tx.ts` | 트랜잭션 + RLS `SET LOCAL` |
| `dispatchTenantJob(payload)` | `./cron/dispatch.ts` | cron worker pool 위임 |
| `computeEffectiveConfig(tenantId)` | `./tenant/effective-config.ts` | manifest + DB override 병합 |

이 4종은 **불변** — 시그니처 변경 시 ADR amendment 필수 + 모든 컨슈머 영향 분석.

---

## 진행 단계

| Phase | 추가 모듈 | 의존 |
|-------|----------|------|
| 0.2 | `index.ts` stub (현재) | — |
| 1.1 | `tenant/context.ts` (AsyncLocalStorage) | T0.3 (Tenant Prisma 모델) |
| 1.2 | `tenant/with-tenant.ts` (HOC) | 1.1 |
| 1.3 | `auth/api-key.ts` (K3 매칭) | 1.1 |
| 1.4 | `db/with-tenant.ts` (Prisma extension) | 1.1, RLS SQL |
| 1.5 | `cron/worker-pool.ts` (TenantWorkerPool) | 1.1 |
| 1.7 | `audit/metrics.ts` (per-tenant bucketName) | 1.1, T0.4 |
| 2.1 | `tenant/manifest.ts` (Zod schema + defineTenant) | 1.2, 1.4 |

---

## 호환성 메모

- **루트 npm 빌드**: 본 패키지는 워크스페이스 멤버이지만 루트의 `npm run build` 에 영향 없음 (현재 stub 만)
- **Next.js 통합**: Phase 1+ 에서 `apps/web/` 으로 src/ 이동 후 `import { ... } from "@yangpyeon/core"` 로 사용
- **현재 src/lib/ 코드**: Phase 1.x 에서 본 패키지로 점진 이전, 이전 시 src/lib/ 의 동일 파일 삭제

---

## 참조

- [System Overview 5-Plane](../../docs/research/baas-foundation/04-architecture-wave/01-architecture/00-system-overview-5-plane.md)
- [ADR-024 Plugin/Tenant 격리](../../docs/research/baas-foundation/01-adrs/ADR-024-tenant-plugin-code-isolation.md)
- [Sprint Plan §0.2](../../docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/00-roadmap-overview.md)
