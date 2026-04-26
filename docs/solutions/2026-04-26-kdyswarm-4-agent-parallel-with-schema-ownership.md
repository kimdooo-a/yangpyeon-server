---
title: kdyswarm 4-agent 병렬 발사 + DAG 통합 — schema 단독 소유권 + stub 인터페이스 분리 패턴
date: 2026-04-26
session: 60
tags: [kdyswarm, parallel-agents, worktree, schema-ownership, stub-interface, monorepo, prisma-migration, tdd]
category: pattern
confidence: high
---

## 문제

대규모 기능을 다수 agent가 worktree 격리로 동시 작성할 때, **schema 파일(prisma/schema.prisma 등)** 과 **모듈 간 의존성**이 자연스러운 머지 충돌 surface가 된다. 충돌이 발생하면:

1. agent 산출물의 가치가 통합 비용에 잠식되어 병렬 발사 효익이 소실
2. 하나의 agent가 다른 agent의 모듈을 import해야 하면 한쪽이 완성되기까지 다른 쪽은 컴파일 불가 → 병렬 가능 가짜 의존
3. 동일 schema 파일에 다른 모델 추가 작업이 분산되면 머지 시 줄 단위 충돌

세션 60에서 G1b 4 agent(T1.2 router / T1.3 ApiKey K3 / T1.5 TenantWorkerPool / T1.7 audit-metrics)를 동시 발사할 때, 위 문제가 다음과 같이 표면화될 수 있었다:

- prisma/schema.prisma: T1.3(ApiKey relation) + T1.5(CronJob relation + TenantCronPolicy 신규) 양쪽이 동일 파일 수정
- T1.2의 withTenant 가드가 T1.3의 verifyApiKeyForTenant를 import — T1.3이 완성될 때까지 T1.2 컴파일 불가

## 원인

병렬 발사의 본질적 어려움은 두 가지로 환원된다:

1. **공유 가변 자원** — schema 파일, ts barrel exports, package.json
2. **인터페이스 부재** — 한 agent가 다른 agent의 함수를 호출해야 하는 경우, 함수 시그니처가 미정이면 import 불가

기존 kdyswarm은 worktree 격리로 (1)을 줄이지만 *완전히 제거하지는 못한다*. 4 agent가 모두 같은 prisma/schema.prisma를 수정하면 worktree에서 머지 시 충돌. 그리고 (2)를 위한 인터페이스는 명시적으로 설계해야 한다.

## 해결

세 가지 패턴을 결합:

### 1. Schema 단독 소유권 (Schema Ownership)

각 schema 파일에 대해 **단 하나의 agent**만 수정 권한을 부여. 충돌 표면이 0으로 환원됨.

본 세션 적용:
- `prisma/schema.prisma` → T1.5 단독 소유 (TenantCronPolicy 신규 + Tenant↔CronJob/ApiKey relations + circuit breaker 4 cols)
- `src/lib/db/schema.ts` (drizzle) → T1.7 단독 소유 (audit_logs.trace_id + tenant_metrics_history)
- 다른 agent는 schema 미수정. 의존이 필요하면 다른 agent의 schema 변경을 가정하고 코드 작성, 통합 시 wiring.

### 2. Stub 인터페이스 분리 (Stub Interface Separation)

병렬 발사 중 한 agent가 다른 agent의 함수를 import해야 하면, **호출자 agent가 자체 stub 모듈을 작성**. 통합 단계에서 stub을 실 모듈 import로 교체.

본 세션 적용 (T1.2 → T1.3):

```typescript
// T1.2가 자체 작성: src/lib/auth/keys-tenant.stub.ts
// 항상 INVALID_FORMAT 반환 — API key 경로 차단으로 안전성 보장
export async function verifyApiKeyForTenant(
  _rawKey: string,
  _pathTenant: ResolvedTenant,
): Promise<VerifyResult> {
  return { ok: false, reason: "INVALID_FORMAT" };
}

// T1.2가 import: src/lib/api-guard-tenant.ts
import { verifyApiKeyForTenant } from "@/lib/auth/keys-tenant.stub";  // 통합 시 → /keys-tenant
```

T1.3이 완성한 실 모듈 시그니처가 stub과 **구조적 호환**(Structural compat)이면 통합 시 import 1줄 변경 + stub 파일 삭제만으로 끝남. 본 세션에서는 ResolvedTenant(T1.2) vs TenantIdentity {id?, slug}(T1.3)가 구조적으로 호환되어 호출부 무수정.

**stub의 안전성 정책**: 항상 fail-closed (가장 보수적인 결과). 본 세션에서는 INVALID_FORMAT 반환으로 API key 경로가 모든 요청에 401. 정상 트래픽 차단되지만 데이터 유출은 0.

### 3. DAG 순서 통합 (DAG-ordered Merge)

머지 순서를 DAG로 정의 — 의존성 역순으로 머지. 본 세션 순서:

```
T1.5 (schema 소유, 다른 agent의 의존 대상) →
T1.7 (drizzle schema, T1.5와 별도 ORM) →
T1.3 (코드 only, T1.5 schema 활용 가능) →
T1.2 (T1.3 import — 통합 시 stub → real 교체)
```

각 머지는 `git merge --no-ff <agent-branch>`로 통합 commit 생성. 'ort' 전략으로 깔끔하게 머지(실 충돌 0).

마지막 통합 commit에서 stub 제거 + import 교체 + 부수 정리(예: tsconfig exclude 추가).

## 교훈

1. **schema 파일은 1 agent 1 schema 원칙** — 동일 schema에 여러 agent가 손대면 worktree 격리도 머지 충돌을 막지 못한다. 발사 전 schema 소유권 명시 필수.
2. **stub 모듈은 fail-closed로 작성** — 통합 전 실수로 production 트래픽이 stub을 거치더라도 데이터 유출 0이어야 함. 항상 가장 보수적인 분기(401/403/null) 반환.
3. **구조적 타이핑 활용으로 호환 보장** — stub과 real의 시그니처를 정확히 일치시키지 않아도 TS의 structural compat이 흡수해줌. interface 최소 필드만 맞추면 충분(본 세션: TenantIdentity는 `slug` 필드만 요구, ResolvedTenant는 그 외 4 필드 추가).
4. **agent prompt에 schema 소유권을 명시** — "DO NOT touch prisma/schema.prisma" 같은 negative instruction이 가장 효과적. positive(누가 무엇을 하는지)도 함께 적되, prohibition이 충돌 회피의 1순위 보장.
5. **integration commit은 별도 커밋** — agent 산출물(merge commit)과 통합 부채 정리(stub 제거 등)를 분리. git history가 깔끔해지고, 통합 부채가 시각적으로 추적됨.
6. **agent 자율 의사결정 인정 + 메모리화** — agent가 spec과 다른 결정을 내리면(본 세션 sentinel `'default'` vs `'_system'`) 무시하지 말고 invariant 보존 의도를 메모리에 기록. 다음 세션에서 일관성 유지.
7. **worktree base 명시** — Agent tool의 worktree isolation은 base를 자동 결정하는데, 메인 브랜치가 빠르게 진행되면 base가 낙후될 수 있음. 모든 agent prompt에 "branch from spec/aggregator-fixes (latest commit)" 명시 권장. 본 세션 4 agent 모두 자율 발견 + 정정했지만 명시가 더 안전.

## 적용 효과 (정량)

세션 60 G1b:
- **공수 분배**: 64h on-paper(T1.2 16 + T1.3 12 + T1.5 22 + T1.7 6 + 통합 ~3h) → 단일 세션(~3h 실제)
- **머지 충돌**: 0건 (4 agent x prisma/drizzle 동시 작업)
- **테스트 증가**: 285 → 355 (+70, +24%)
- **TS 에러**: agent 작업 영역 0 (standalone exclude로 pre-existing 차단)
- **빌드/검증**: tsc 0 / vitest 355/355 / build PASS / prisma validate PASS

## 관련 파일

- `docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md` — 9 그룹(G0a~G3b) 병렬 발사 설계
- `~/.claude/skills/kdyswarm/SKILL.md` — 본 패턴이 Phase 5 (통합) 표준화 권장
- `prisma/schema.prisma` — T1.5 단독 소유의 결과
- `src/lib/auth/keys-tenant.stub.ts` (삭제됨) — stub 인터페이스 분리의 사례
- `src/lib/api-guard-tenant.ts:31` — import 교체 위치 (commit `6c9f631`)
- 메모리: `~/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/project_tenant_default_sentinel.md` — agent 자율 의사결정 사례

## 후속 작업

- kdyswarm SKILL.md에 본 패턴(schema ownership + stub interface) 명시화 — 향후 다른 G 그룹 발사 시 같은 패턴 자동 적용
- agent prompt template에 "schema ownership rules" + "stub creation guideline" 섹션 추가
- worktree base 명시화 룰 (prompt에 "branch from spec/aggregator-fixes HEAD" 명시)
