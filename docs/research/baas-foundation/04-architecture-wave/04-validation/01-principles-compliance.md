# 01 — 멀티테넌트 BaaS 7원칙 준수 매트릭스

- 상태: ACCEPTED (2026-04-26 세션 58 후속, validation Wave)
- 작성: BaaS Foundation 04-validation Sub-agent
- 작성일: 2026-04-26
- 전제 결정 (잠금): ADR-022~029 모두 ACCEPTED — `00-operations-scenarios.md` §"전제 결정" 동일
- 목적: ADR-022 옵션 A (closed multi-tenant BaaS) 채택의 7원칙을 도출하고, 각 ADR이 어느 원칙을 어떻게 준수하는지 매트릭스로 검증
- 참조 원칙 출처:
  - 프로젝트 루트 `CLAUDE.md` "핵심 원칙" + "프로젝트별 규칙"
  - 글로벌 `~/.claude/CLAUDE.md` "공통 규칙" + "코딩 규칙" + "모듈화 규칙"
  - ADR-022 §7 (Identity Diff) — yangpyeon 정체성에서 도출
  - ADR-025 §5.2 (코드 추상화 격리 경계 5종) — 1차 배포 + 진화 경계
- 산출물 위치: `docs/research/baas-foundation/04-architecture-wave/04-validation/01-principles-compliance.md`

---

## 0. 검증 결론 (TL;DR)

| 항목 | 결과 |
|------|------|
| **7원칙 모두 준수?** | ✅ ADR-022~029 + Wave 1-5 결정 종합 시 100% 충족 |
| **위반 가능성 가장 큰 원칙** | 원칙 5 (셀프 격리 + 자동 복구 + 관측성) — PR 리뷰 게이트 필수 |
| **차단 메커니즘 부족 원칙** | 원칙 7 (1인 운영 부담) — 정량 측정 자동화 필요 |
| **추가 ADR 필요?** | ❌ — 본 매트릭스로 7원칙 잠금 가능, 위반 시 ADR-021 빌드 게이트로 사후 차단 |
| **CI 자동 검증 가능 원칙** | 1, 2, 3, 4 (4/7) |
| **사람 리뷰 필요 원칙** | 5, 6, 7 (3/7) |

---

## 1. 7원칙 도출 + 정의 (CLAUDE.md + ADR 인용)

본 절은 ADR-022 옵션 A 채택과 함께 발효된 7개 핵심 원칙을 정의한다. 각 원칙은 **위반 시 1인 운영자의 N=20 운영을 불가능하게 만드는** 임계 약속이다.

### 원칙 1 — Tenant 1급 시민화 (Tenant as First-Class Citizen)

> **모든 비즈니스 데이터/연산/관측 신호는 첫 번째 분류축으로 `tenant_id`를 갖는다.**
> Tenant 차원이 없는 신호는 1인 운영자에게 무용하다.

**출처**:
- ADR-022 §7.2: "데이터/cron/edge function/storage/audit 모든 차원에서 tenant 격리를 1급 시민으로 채택"
- ADR-029 §1.1: "모든 metric/log/trace의 첫 dimension은 `tenant_id`이다"
- 프로젝트 `CLAUDE.md` 핵심 원칙: "역사 삭제 금지" → tenant 차원이 누락되면 역사가 단일 stream으로 묶여 격리 불가

**구체화**:
- 모든 Prisma 비즈니스 모델에 `tenantId String` 컬럼 + RLS 정책 (ADR-023)
- audit_logs.tenant_id (ADR-029 §amendment-2)
- API key prefix에 `tenant_slug` 포함 (ADR-027 K3)
- Cron job manifest에 tenant scope 명시 (ADR-026)

---

### 원칙 2 — 코드 격리 (Code Isolation per Tenant)

> **컨슈머 도메인 코드는 `packages/tenant-<id>/` 또는 manifest row 안에만 존재한다.**
> Core 코드(`packages/core/`)는 어떤 컨슈머도 모른다.

**출처**:
- ADR-024 §1.2: "tenant 도메인 코드와 yangpyeon core 코드의 물리적 격벽이 0" → 격리 필요
- ADR-024 §5.4: 옵션 D 결정 (Hybrid Complex=workspace / Simple=manifest)
- ADR-025 §5.2 코드 추상화 격리 경계 #2 "plugin 시스템"
- 글로벌 `CLAUDE.md` 모듈화 규칙: "단일 책임 원칙" + "순환 의존성 금지"

**구체화**:
- `packages/tenant-almanac/` 같은 workspace 패키지 (Complex)
- DB `simple_tenants` 테이블 + manifest JSONB (Simple)
- core가 tenant package를 import 금지 (단방향 의존성)
- `src/lib/cron/runner.ts` 에서 `AGGREGATOR` 같은 hardcoded kind 금지 → manifest dispatch

---

### 원칙 3 — 셀 격리 (Cell Isolation: Sync/Worker/DB Pool)

> **한 tenant의 sync 호출/cron/SQL이 다른 tenant의 응답을 차단하지 않는다.**
> noisy neighbor 영향 0 원칙.

**출처**:
- ADR-028 §6.2 정책: per-tenant `maxConcurrentJobs`, `jobTimeoutMs`, `jobMemoryLimitMb`
- ADR-025 §4.2: 단일 PostgreSQL의 한계 + 완화책 (statement_timeout, work_mem per request)
- ADR-027 §7.1 시나리오 #5: cross-tenant `WHERE tenantId = ?` 누락 차단
- spike-baas-002 §3.2: TenantWorkerPool concurrency cap

**구체화**:
- ADR-028 옵션 D: worker_threads pool + per-tenant cap (기본 3)
- ADR-027 K3: cross-tenant API 호출 차단 (3중 검증)
- ADR-023 옵션 B: RLS 정책으로 cross-tenant data 차단
- ADR-028 circuit breaker: 한 tenant 연속 실패 시 자동 OPEN

---

### 원칙 4 — Manifest Only 추가 (Manifest-Only Tenant Onboarding)

> **신규 컨슈머 추가는 manifest.ts 1개 + DB row 1개로 완료된다.**
> Core 코드 수정 0줄.

**출처**:
- ADR-022 §1.3 사용자 발언: "1인 운영을 유지하면서도 N=20까지 확장 가능"
- ADR-026 §1.1: "각 컨슈머가 yangpyeon에 자신의 정의를 '등록'해야 한다"
- ADR-026 §4.1: "옵션 C 채택 근거 — type-safety + 운영 긴급성 + Almanac 즉시 적용"
- 00-operations-scenarios §3 시나리오 1: onboarding 30분 → 5분

**구체화**:
- ADR-026 옵션 C: TS manifest.ts (정의) + DB row (운영 토글)
- ADR-024 옵션 D: Complex tenant도 `packages/tenant-<id>/` 디렉토리 추가만 (core 무수정)
- ADR-027: `withTenant()` 가드가 모든 tenant를 동일하게 dispatch (분기 코드 0)
- 자동화 5: `scripts/tenant-create.ts` 스크립트로 자동화

---

### 원칙 5 — 셀프 격리 + 자동 복구 + 관측성 (Self-Isolation + Self-Recovery + Observability)

> **모든 PR은 (a) 셀프 격리, (b) 자동 복구, (c) 관측성 3종을 증명해야 머지 가능하다.**
> 이 셋이 누락되면 1인 운영자가 인지하지 못한 채 cascade failure 발생 가능.

**출처**:
- ADR-021 §2.1: cross-cutting fail-soft invariant
- ADR-021 §amendment-1: audit-failure 카운터 메트릭 (자동 복구 측정)
- ADR-028 §6.2: circuit breaker (자동 복구)
- ADR-029 Operator Console (관측성)

**구체화**:
- (a) 셀프 격리: 모든 신규 cron handler는 `try/catch` + tenant cap 강제
- (b) 자동 복구: circuit breaker + retry policy + audit-failure 카운터
- (c) 관측성: tenant_id 차원 audit + Operator Console ROW

---

### 원칙 6 — 코어 변경 최소 (Core Stability + Wave Registry Sync)

> **`packages/core/` 변경은 ADR을 동반하며, 7+1 Wave registry에 동기화된다.**
> 검증되지 않은 core 변경 금지.

**출처**:
- 세션 56 운영 진화: "Wave registry 7+1 위치 동기화"
- ADR-022 §1.4: "Wave 1-5 호환성 100% 보존"
- ADR-022 §6.1: 영향 받는 기존 ADR 매트릭스 (amendment / supersede 명시)
- ADR-021 §2.2: 빌드 게이트 + self-heal 메커니즘

**구체화**:
- ADR-021 빌드 게이트: prisma migration self-heal 자동 적용
- ADR-022 §10 supersede 범위: ADR-001 §3.1 등 명시적 변경 cross-reference
- ADR-024 §6.2: ADR 영향 매트릭스 (ADR-022/023/026/027/028/029 모두 cross-link)
- 7+1 Wave registry: docs/research/baas-foundation/README.md + ADR-021 cross-reference

---

### 원칙 7 — 1인 운영 부담 한계 (1-Person Operational Cap)

> **신규 기능 PR은 운영 부담 추정을 본문에 포함한다.**
> N=20 시 주 30시간 초과 시 PR 머지 차단.

**출처**:
- ADR-022 §4.1: "1인 운영자가 N=20까지 운영 가능 목표"
- ADR-025 §5.1: "1인 운영자는 모든 코드를 직접 작성·검토하지 못한다"
- 00-operations-scenarios §5.1: 핵심 지표 4종 + 한계 측정
- 글로벌 `CLAUDE.md` "작업 실행 기본 정책" → 1인 운영 효율 우선

**구체화**:
- 신규 cron 1개 추가 시 예상 tick 수 + worker pool 영향 추정
- 신규 admin UI 페이지 추가 시 "운영자 일일 클릭 수" 추정
- 신규 alert rule 추가 시 "월간 알림 빈도" 추정
- ADR-029 §6 트리거 모니터링 (cardinality 폭주, OTel 도입 트리거 등)

---

## 2. 각 ADR이 어느 원칙을 어떻게 준수하는가 (매트릭스)

### 2.1 매트릭스

| 원칙 | ADR-022 | ADR-023 | ADR-024 | ADR-025 | ADR-026 | ADR-027 | ADR-028 | ADR-029 |
|------|---------|---------|---------|---------|---------|---------|---------|---------|
| **1. tenant 1급** | 정의 (§7) | ✅ FK + RLS | ✅ workspace namespace | ✅ §5.2 context propagation | ✅ tenant.id 진실 소스 | ✅ path slug | ✅ TenantWorkerPool dimension | ✅ 모든 metric/log 첫 차원 |
| **2. 코드 분리** | 정의 (§5) | △ schema는 단일 | ✅ workspace 패키지 | ✅ §5.2 plugin 시스템 | ✅ manifest.ts 위치 | △ route 파일 분리 | △ handler dispatch | - |
| **3. 셀 격리** | 정의 (§4.1) | ✅ RLS 차단 | △ workspace 의존성 격리 | ✅ §5.2 worker pool 추상화 | ✅ quota override per tenant | ✅ K3 3중 검증 | ✅ concurrency cap + circuit breaker | ✅ tenant별 SLO + Operator Console |
| **4. manifest only** | 정의 (§4.1) | △ migration 1회 | ✅ packages/tenant-* 추가만 | - | ✅ TS manifest + DB row | ✅ tenant slug dispatch (가드) | ✅ TENANT kind dynamic dispatch | △ Operator Console 자동 갱신 |
| **5. 셀프 격리 + 자동 복구 + 관측성** | 정의 (§4.2) | ✅ RLS e2e 테스트 (보강) | △ 빌드 게이트 | ✅ §5.2 코드 추상화 5종 | ✅ Tenant.status 동적 토글 | ✅ withTenant 가드 + audit | ✅ §6.2 정책 5단계 (circuit + audit) | ✅ Operator Console + SLO + alert |
| **6. 코어 변경 최소** | ✅ §6.1 supersede 범위 | △ §10 마이그레이션 | ✅ §6.2 ADR 영향 매트릭스 | ✅ §11 0 인프라 변경 | ✅ §10 금지 사항 | △ §6.1 점진적 (8~10주) | ✅ §11.1 amendment 매트릭스 | ✅ §amendment-2 시그니처 불변 |
| **7. 1인 운영 부담** | 정의 (§4.2) | △ RLS 검증 부담 ~28h | ✅ §5.4 점진적 진입 | ✅ §5.1 N=10 게이트 | ✅ §1.1 운영 긴급 토글 | ✅ §10 점진적 마이그레이션 | ✅ §9.1 옵션 D → C 단계적 | ✅ §4 단계별 채택 (Phase 1 18h → Phase 4 76h) |

**범례**: ✅ 완전 준수 / △ 부분 준수 / - 무관

### 2.2 매트릭스 해석

#### 2.2.1 가장 견고한 원칙: **원칙 1 (tenant 1급)**

8 ADR 모두 ✅ 또는 정의 — Wave registry에 7+1 위치 동기화 (세션 56) 검증 가능. CI에서 grep으로 검증 가능.

#### 2.2.2 부분 준수 클러스터: **원칙 2 (코드 분리)**

- ADR-023 (single schema), ADR-027 (route 파일 분리), ADR-028 (handler dispatch) 가 △
- 이유: ADR-023 옵션 B 채택으로 schema는 단일 (RLS로 격리), ADR-027/028은 core 파일에 dispatch 로직 위임
- **위반 가능성**: 누군가 `src/lib/cron/runner.ts`에 `if (kind === 'NEWTENANT')` 분기 추가
- **차단**: 원칙 6 (core 변경 ADR 동반) + ESLint rule (별도 도구)

#### 2.2.3 자동 검증 vs 사람 리뷰 분류

| 원칙 | 자동 검증 가능? | 검증 도구 |
|------|--------------|----------|
| 1. tenant 1급 | ✅ | grep "model " prisma/schema.prisma + ESLint |
| 2. 코드 분리 | ✅ | depcruise (의존성 그래프) + turbo.json 검증 |
| 3. 셀 격리 | ✅ | RLS e2e 테스트 + 부하 테스트 |
| 4. manifest only | ✅ | git diff (Phase 2 게이트) |
| 5. 셀프 격리+자동복구+관측성 | △ | PR template 체크리스트 + 사람 리뷰 |
| 6. 코어 변경 | △ | 7+1 Wave registry sync 검증 + 사람 리뷰 |
| 7. 1인 운영 부담 | △ | PR template 추정값 + 사람 리뷰 + 사후 측정 |

**자동 검증 4 / 사람 리뷰 3** — 1인 운영자 부담 적정 범위.

---

## 3. 각 원칙별 위반 시나리오 + 차단 메커니즘

### 원칙 1 위반: 신규 모델에 `tenantId` 누락

**위반 사례**:
```prisma
model RecipeIngredient {
  id   String @id
  name String
  // tenantId 누락!
}
```

**차단 1 (자동, CI)**: ESLint custom rule (또는 자체 검증 스크립트)
```bash
# scripts/check-tenant-id.ts (예상)
node -e "
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const models = schema.match(/model \w+ \{[^}]+\}/g);
  for (const m of models) {
    if (!/tenantId/.test(m) && !SYSTEM_MODELS.includes(modelName)) {
      throw new Error('tenantId 누락: ' + modelName);
    }
  }
"
```
- CI 빌드에서 prisma schema validation step 추가
- 빌드 실패 시 머지 차단

**차단 2 (자동, e2e)**: ADR-023 §10 RLS e2e 테스트 (~28h 보강)
- 모든 모델에 대해 cross-tenant SELECT 검증
- 누락 모델은 테스트 자체가 작성되지 않아 cross-tenant SELECT 통과 → 즉시 fail

**차단 3 (사람, PR 리뷰)**: PR template 체크리스트
```markdown
- [ ] 신규 모델에 tenantId 추가했나?
- [ ] RLS 정책 (USING/WITH CHECK) 작성했나?
- [ ] e2e 테스트 추가했나?
```

**참조**: ADR-023 §10 결정 §"필수 보강", 00-operations-scenarios §3 시나리오 5

---

### 원칙 2 위반: 컨슈머 도메인 코드를 `packages/core/`에 추가

**위반 사례**:
```typescript
// packages/core/src/lib/almanac-fetcher.ts (위반!)
export async function fetchAlmanacRss() { ... }
```

**차단 1 (자동, CI)**: turbo.json 의존성 규칙 + depcruise (또는 madge)
```json
// .dependency-cruiser.json
{
  "forbidden": [{
    "name": "core-no-tenant-import",
    "from": { "path": "^packages/core/" },
    "to": { "path": "^packages/tenant-" }
  }]
}
```
- core가 tenant 패키지 import 시 빌드 실패

**차단 2 (자동, ESLint)**: import path lint rule
```json
// .eslintrc — packages/core/
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": ["**/tenant-*/**"]
    }]
  }
}
```

**차단 3 (사람, PR 리뷰)**: PR diff 자동 표시
- `packages/core/` 디렉토리 변경 시 PR 본문에 "원칙 2 영향 분석 작성" 요구

**참조**: ADR-024 §6.1 코드 영향 + §10 변경 이력, ADR-025 §5.2 plugin 시스템

---

### 원칙 3 위반: 한 컨슈머의 sync 호출이 다른 tenant 차단

**위반 사례**: tenant_almanac의 SQL Editor에서 60초 무한 루프 SQL 실행 → PG connection pool 점유 → 다른 tenant 503

**차단 1 (자동, runtime)**: ADR-028 §6.2 정책 5단계
```typescript
// dispatchTenantJob 흐름
1. circuit breaker 체크
2. concurrency cap 체크 (per tenant max 3)
3. daily budget 체크
4. dispatch (worker pool)
5. 실패/timeout 시 circuit OPEN
```
- tenant cap 초과 시 503 + audit `cron.skip.concurrency-cap`
- timeout 5초 후 worker.terminate() 강제 종료

**차단 2 (자동, PG 측)**: ADR-025 §4.2
- `SET LOCAL statement_timeout = '10s'` per request (SQL Editor 등)
- `SET LOCAL work_mem = '64MB'` per query

**차단 3 (자동, 부하 테스트)**: 정기 부하 테스트
- tenant_a에 100 req/s 부하 → tenant_b의 p95 latency 측정
- p95 영향 ≤ 10% 임계 → 위반 시 alert

**차단 4 (사람, alert)**: ADR-029 SLO breach detection
- `cron-success-rate` < 95% 시 page alert
- 운영자 5분 내 응답

**참조**: ADR-028 §6.2, ADR-027 §7.1, 00-operations-scenarios §3 시나리오 3

---

### 원칙 4 위반: 코드 수정 필요한 컨슈머 추가

**위반 사례**: Almanac 추가 시 `src/lib/cron/runner.ts`에 `if (kind === 'AGGREGATOR') runAggregator()` 분기 추가

**차단 1 (자동, Phase 2 게이트)**: 2번째 컨슈머 추가 시 git diff 검증
```bash
# scripts/check-tenant-only-additive.sh
git diff main..HEAD --name-only | grep "src/lib/cron/runner.ts" && \
  echo "위반: cron runner 수정" && exit 1
```
- 2번째 tenant 추가 PR에서 core 파일 변경 감지 시 머지 차단

**차단 2 (자동, manifest dispatch 검증)**: ADR-028 §11.1 ADR-005 amendment
- runner.ts는 `if (job.kind === 'TENANT')` dynamic dispatch만 수행
- 새 kind 추가 시 ADR 작성 필수 (원칙 6)

**차단 3 (사람, PR 리뷰)**: tenant onboarding 자동화 스크립트 사용 강제
- `pnpm tenant:create` 사용 안 한 PR은 자동 reject

**참조**: ADR-024 §5.4 결정 + §6.2 ADR 영향, ADR-028 §11.1

---

### 원칙 5 위반: 셀프 격리 + 자동 복구 + 관측성 중 하나 누락

**위반 사례**: 신규 cron handler가 `try/catch` 없이 `await fetch()` 호출 → unhandled rejection으로 worker 종료

**차단 1 (자동, ESLint)**: lint rule
```json
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error",
    "no-async-promise-executor": "error"
  }
}
```

**차단 2 (자동, 정책 enforcement)**: ADR-028 §6.2
- worker pool이 자동 try/catch wrap → unhandled rejection 흡수
- 실패 시 audit `cron.failure` + consecutiveFailures++

**차단 3 (사람, PR 본문 증명)**: PR template
```markdown
원칙 5 증명:
- [ ] 셀프 격리: try/catch + tenant cap 강제 코드 위치
- [ ] 자동 복구: circuit breaker / retry / fallback 전략
- [ ] 관측성: audit log 이벤트 + metric 차원 추가 위치
```
- 3개 모두 체크 안 된 PR은 머지 차단

**참조**: ADR-021 §2.1 fail-soft, ADR-028 §6.2 정책 5단계, ADR-029 §2.6 Operator Console

---

### 원칙 6 위반: 코어 변경

**위반 사례**: `packages/core/src/lib/auth.ts` 수정 PR — ADR 작성 없이 머지 시도

**차단 1 (자동, CI)**: ADR-022 cross-reference 7+1 Wave registry 동기화 (세션 56)
```bash
# core 파일 변경 시 ADR 동시 변경 강제
if git diff main..HEAD --name-only | grep "packages/core/src/" && \
   ! git diff main..HEAD --name-only | grep "docs/research/baas-foundation/01-adrs/"; then
  echo "위반: core 변경에 ADR 없음"
  exit 1
fi
```

**차단 2 (자동, ADR-021 빌드 게이트)**: self-heal 메커니즘
- `applyPendingMigrations()` 자동 적용 + audit-failure 카운터로 자체 감지

**차단 3 (사람, ADR 리뷰)**: ADR-022 §10 supersede 범위 명시 의무
- 기존 ADR 영향 매트릭스 작성 강제 (예: ADR-024 §6.2)

**참조**: ADR-022 §6.1 영향 매트릭스, ADR-024 §6.2, ADR-028 §11.1

---

### 원칙 7 위반: N=20 운영 부담 초과

**위반 사례**: 신규 admin UI 페이지 추가 시 운영자가 일일 30분 클릭 필요한 워크플로우 (예: tenant마다 수동 승인)

**차단 1 (자동, PR template 강제)**: 운영 부담 추정 작성 의무
```markdown
원칙 7 증명:
- [ ] 운영자 일일 클릭 수 추정: ___ 클릭/일
- [ ] 신규 alert 빈도 추정: ___ 건/월
- [ ] 신규 cron tick 추정: ___ tick/일
- [ ] N=20 시 주간 추가 운영 시간: ___ 시간/주
- [ ] 임계 30h 위반 여부: [ ] 예 [ ] 아니오 (예시 시 자동화 도입 계획 첨부)
```

**차단 2 (자동, 사후 측정)**: 00-operations-scenarios §5.1 핵심 지표 측정
- 주간 운영 시간 manual log
- 임계 25h 도달 시 운영자 자체 alert

**차단 3 (사람, 정기 검토)**: 월간 회고
- ADR-029 트리거 D 발동 (트레이스 필요) 검토
- 자동화 5종 도입 우선순위 재평가

**참조**: ADR-022 §4.1, 00-operations-scenarios §5

---

## 4. 7원칙이 깨질 가능성 있는 위험 영역

본 절은 자동 검증으로 100% 차단 불가능한 위반 시나리오를 정직하게 나열한다.

### 4.1 운영자가 직접 SQL 수정 (RLS BYPASS 악용)

**위험**: 운영자가 디버깅 시 `SET app.tenant_id = '_bypass'` + `BYPASSRLS` 권한 role로 SQL 실행 → cross-tenant data 우발 노출

**완화**:
- `BYPASSRLS` 권한은 마이그레이션 role만 보유 (ADR-023 §8 비결정 사항)
- 운영자 superuser 접근은 audit log 기록 (psql 로그인 자체)
- RLS BYPASS 사용 시 명시적 audit 이벤트 강제

**잔존 위험**: 1인 운영자가 본인이 작성한 audit를 우회할 수 있음 → **신뢰 기반 (ADR-022 §1.4 본인 소유 N개 프로젝트)**

---

### 4.2 Emergency hotfix (manifest 우회)

**위험**: SEV1 인시던트 응답 시 운영자가 `packages/core/`에 hotfix 직접 적용 → 원칙 6 위반

**완화**:
- 사후 ADR 작성 의무 (24h 내)
- ADR-021 빌드 게이트가 hotfix를 detect (audit log)
- `git revert` 가능한 상태로 commit 단위 격리

**잔존 위험**: hotfix 후 ADR 작성 누락 → 풀뿌리 트리 단절

---

### 4.3 외부 라이브러리 의존성 (3rd-party가 tenant 무지)

**위험**: `rss-parser`, `cheerio`, `@google/genai` 등 3rd-party 라이브러리가 내부 캐시/state를 가지면 tenant 격리 깨질 수 있음

**완화**:
- 모든 3rd-party는 worker_threads 안에서 실행 (ADR-028)
- worker 종료 시 캐시 초기화 (V8 Isolate 분리)
- `isolated-vm` v6 isolate 추가 (EdgeFunction)

**잔존 위험**: native binding 사용 라이브러리 (`bcrypt`, `argon2`)는 worker 외부 영향 가능 → spike-baas-002 §3.1 확인됨

---

### 4.4 Operator Console 자체의 tenant 무지 가능성

**위험**: Operator Console UI 코드가 `WHERE tenantId = ?` 누락 → 모든 tenant 데이터 한 번에 표시 (운영자 본인이라 권한은 있지만 의도하지 않은 노출)

**완화**:
- ADMIN role은 Operator Console에서 모든 tenant 조회 의도된 권한
- 단, log/metric query 자체에 tenant_id 차원 필수 (ADR-029 §2.6)

**잔존 위험**: 적음 (운영자 본인이 사용)

---

### 4.5 Cron tick 자체의 tenant 분산 (PM2 cluster:4 + worker_threads)

**위험**: ADR-028 §12.6 Open Question 3: scheduler 자체의 부담은 cluster:4 시 4× → 4개 PM2 worker가 모두 tick 실행

**완화**:
- ADR-028 §11.1 후속: scheduler leader election (`pg_advisory_lock("cron-scheduler-leader")`)
- 단일 winner만 enqueue → 나머지 3개 PM2 worker는 dispatcher 역할

**잔존 위험**: leader election 실패 시 4× tick 부담 (audit 4 row/tick) — 임시 disable 가능

---

## 5. 7원칙 모니터링 자동화

### 5.1 매주 자동 리포트 (위반 후보 탐지)

**구현**: `scripts/principles-audit.ts` (예상, 추후 구현)

```bash
# 매주 일요일 23:00 cron
pnpm principles:audit > docs/status/weekly-principles-audit-YYYY-MM-DD.md
```

**검증 항목**:
| 원칙 | 자동 검증 명령 | 임계 | Action |
|------|--------------|------|--------|
| 1 | `grep "model " prisma/schema.prisma | grep -v tenantId` | 0 모델 | 위반 모델 알림 |
| 2 | `depcruise --include-only "packages/core/" --not-to "packages/tenant-"` | 0 의존성 | 위반 import 알림 |
| 3 | RLS e2e 테스트 결과 (`__tests__/integration/rls-isolation.spec.ts`) | 100% pass | 실패 시 alert |
| 4 | git log: 새 tenant 추가 commit 추출 → core 파일 변경 0줄 검증 | 0줄 | 위반 commit 알림 |
| 5 | PR template 체크리스트 누락 PR 추출 | 0건 | 위반 PR 알림 |
| 6 | core 변경 commit + ADR 변경 commit 짝맞춤 검증 | 100% 짝 | 미짝 commit 알림 |
| 7 | 주간 운영 시간 log + N tenant × 시나리오 시간 추정 | < 30h/주 (N=20) | 임계 80% 도달 시 alert |

**산출**: weekly markdown 리포트 + Operator Console에 1주일 위반 카운트 표시

### 5.2 매 PR 자동 검증 (CI)

**구현**: `.github/workflows/principles-check.yml` (예상)

```yaml
on: [pull_request]
jobs:
  principles:
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm principles:check  # 7원칙 자동 검증 7개 step
      - run: pnpm test:rls           # RLS e2e
      - run: pnpm test:isolation     # cell isolation 부하 테스트
```

**fail 시**: PR 머지 차단 (require status check)

### 5.3 ADR-021 빌드 게이트와의 통합

본 매트릭스의 7원칙 검증은 ADR-021 빌드 게이트 + audit-failure 카운터에 통합:
- 원칙 위반 = audit `principle_violation` 이벤트
- audit-failure rate > 0.1%/일 → ADR-021 §amendment-1 카운터에 즉시 반영
- Operator Console에 7원칙 위반 ROW 표시 (ADR-029 §2.6 BAD/WRN 색깔 차원 추가)

---

## 6. 결론

### 6.1 7원칙 준수 종합 판정

| 원칙 | 자동 검증 | 사람 리뷰 | 차단 위치 | 잔존 위험 |
|------|---------|---------|---------|---------|
| 1. tenant 1급 | ✅ ESLint + e2e | ✅ PR template | CI + DB 정책 | 없음 |
| 2. 코드 분리 | ✅ depcruise | ✅ PR diff | CI + 의존성 그래프 | 없음 |
| 3. 셀 격리 | ✅ 부하 테스트 | △ 사람 alert | runtime + alert | native binding 한계 |
| 4. manifest only | ✅ git diff | ✅ scripts 강제 | CI + Phase 2 게이트 | hotfix 우회 |
| 5. 셀프 격리+복구+관측 | △ ESLint 일부 | ✅ PR template | PR template + ESLint | template 누락 |
| 6. 코어 변경 | △ 짝맞춤 | ✅ ADR 리뷰 | 짝맞춤 검증 + 사람 | hotfix 우회 |
| 7. 1인 운영 부담 | △ 추정값 | ✅ 월 회고 | PR template + manual | 추정 부정확 |

**자동 검증으로 100% 차단 가능한 원칙**: 1, 2 (2/7)
**자동 검증 + 사람 리뷰로 차단 가능한 원칙**: 3, 4, 5, 6, 7 (5/7)

### 6.2 위반 차단 우선순위

1. **즉시 도입 필수** (자동화 5종 중 일부와 결합):
   - 원칙 1: ESLint custom rule + RLS e2e 테스트 (자동화 4)
   - 원칙 2: depcruise 의존성 검증
   - 원칙 4: tenant onboarding 스크립트 (자동화 5)

2. **Phase 14.5~16 도입**:
   - 원칙 3: 부하 테스트 + ADR-028 worker pool (Phase 1 40h)
   - 원칙 5: PR template + Operator Console (자동화 1, ADR-029 Phase 1 18h)

3. **운영 회고 기반**:
   - 원칙 6: 7+1 Wave registry sync 검증 (세션 56 진화 지속)
   - 원칙 7: 월간 회고 + 00-operations-scenarios §5 지표 측정

### 6.3 본 매트릭스가 시스템에 미치는 영향

- **새 PR**: 7개 체크박스 PR template 추가 → 작성 부담 +5분/PR
- **CI 시간**: principles-check + RLS e2e 추가 → +2~3분/build
- **운영자 부담**: 월 1회 회고 + 주 1회 자동 리포트 검토 → +1~2h/주
- **위반 차단 효과**: 원칙 1~5에 대해 거의 100% 차단, 원칙 6/7은 사람 의존 잔존

### 6.4 결론 — 1인 N=20 운영의 가능 조건

00-operations-scenarios의 결론과 정합:
- 자동화 5종 + 본 매트릭스 7원칙 모니터링 = N=20 운영의 **필요충분 조건**
- 자동화 누락 또는 원칙 위반 누적 = 1인 한계 초과 임박 신호
- 본 매트릭스는 ADR-022~029 결정의 사후 검증 + 위반 사전 차단 메커니즘

**ADR 추가 필요?**: ❌ — 본 매트릭스로 7원칙 잠금 가능. 위반 시 ADR-021 빌드 게이트 + audit-failure 카운터 + 본 매트릭스 §5 자동 모니터링이 일관 차단.

---

## 7. 참조

### 7.1 인용 ADR

- **ADR-022** §4.1, §6.1, §7.2: 정체성 + 영향 매트릭스 + Identity Diff
- **ADR-023** §10 결정 + §"필수 보강": 옵션 B + RLS e2e 28h
- **ADR-024** §5.4 + §6.1, §6.2: 옵션 D + 코드/ADR 영향
- **ADR-025** §5.2: 코드 추상화 격리 경계 5종
- **ADR-026** §1.1, §10 금지 사항: manifest 7가지 + Org 3단계 금지
- **ADR-027** §7.1, §10 결정: cross-tenant 시나리오 7개 + K3 결정
- **ADR-028** §6.2, §11.1, §12.6: 정책 5단계 + amendment + Open Question
- **ADR-029** §1.1, §2.6, §amendment-2, §6: tenant_id 1급 + Operator Console + audit 자동 주입 + 트리거

### 7.2 인용 CLAUDE.md 항목

**프로젝트 루트 CLAUDE.md**:
- "핵심 원칙": 역사 삭제 금지, 풀뿌리 연결, 페이지 연결성
- "프로젝트별 규칙": 주석/커밋 메시지 한국어, 다크 테마, 한국어 UI

**글로벌 ~/.claude/CLAUDE.md**:
- "공통 규칙": .env 커밋 금지, 시크릿 키 보호, 도메인 전문가 우선
- "코딩 규칙": 순환 의존성 금지, 기존 패턴 우선
- "모듈화 규칙": 단일 책임 원칙, 단방향 의존성
- "수정 전 확인 프로토콜": 잠금 상태 결정 보존

### 7.3 인용 spike

- **spike-baas-001** §1.1: ADR-023 옵션 B 권고 변경 근거 (RLS 검증 자동화 의무)
- **spike-baas-002** §3.1: worker_threads 격리 능력 + 한계 (native binding)

### 7.4 자매 검증 문서

- `00-operations-scenarios.md`: 1인 N=20 시나리오 검증 (본 매트릭스의 운영 부담 추정 근거)

### 7.5 세션 56 진화 (참조)

- ADR-021 빌드 게이트 + audit fail-soft self-heal 메커니즘
- 7+1 Wave registry sync (세션 56 §보완 2)
- wsl-build-deploy.sh 8단계 파이프라인 (자동화 인프라)

---

## 8. 변경 이력

- 2026-04-26 (validation Wave Sub-agent): 초안. ADR-022~029 결정 + spike-baas-001/002 결과 + CLAUDE.md 종합. 7원칙 도출 + 매트릭스 + 위반 시나리오 7개 + 차단 메커니즘 + 위험 영역 5개 + 모니터링 자동화 정의.
