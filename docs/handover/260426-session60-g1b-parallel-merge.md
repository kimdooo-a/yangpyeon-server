# 인수인계서 — 세션 60 (G1b 4 agent 병렬 발사 + Phase 1 본진 일괄 통합)

> 작성일: 2026-04-26
> 이전 세션: [session59](./260426-session59-phase0-foundation.md)
> 다음 세션 진입: [next-dev-prompt.md](./next-dev-prompt.md)

---

## 작업 요약

세션 59 handover의 권고대로 `/kdyswarm --tasks T1.2,T1.3,T1.5,T1.7 --strategy parallel`을 실행해 Phase 1 본진 4 task를 worktree 격리로 병렬 발사 + DAG 순서 통합. 9 commits, 신규 34 파일 / 수정 11 파일, vitest 285→355(+70 신규, +24%), tsc/build/prisma validate 전부 PASS. M3 게이트(2번째 컨슈머 가동)까지 남은 크리티컬 패스에서 ~64h 분량을 단일 세션으로 통합 완료.

---

## 대화 다이제스트

### 토픽 1: 진입점 확인
> **사용자**: "다음 작업 진행 ..." (직전 세션 59 cs 보고를 본 직후)

세션 59가 종료된 시점에서 handover의 next-dev-prompt.md는 이미 G1b 4 agent 병렬 발사 권고(`/kdyswarm --tasks T1.2,T1.3,T1.5,T1.7 --strategy parallel`)를 명시. memory `feedback_autonomy`("분기 질문 금지, 권장안 즉시 채택")까지 합쳐 즉시 실행 결정.

**결론**: kdyswarm Skill 호출 + 7 Phase 흐름 따라 병렬 발사 진행.

### 토픽 2: kdyswarm Phase 0~3 (컨텍스트 + 설계 + Pre-Flight)
세션 시작 시 git 상태(`spec/aggregator-fixes` clean except `M standalone/README.md`), packages/core 골격(T1.1 TenantContext만 존재), prisma/schema.prisma(T0.3 stage 1 18 모델 nullable tenantId 추가됨, ApiKey/CronJob에 relation 부재, TenantCronPolicy/TenantMembership 부재)를 병렬 확인.

ADR-027/028/029 impl-spec 4종(약 4,000줄)을 1M 컨텍스트로 일괄 적재 → schema 충돌 surface 분석:
- T1.5만 prisma/schema.prisma 수정(TenantCronPolicy + relations + circuit breaker cols)
- T1.7만 drizzle src/lib/db/schema.ts 수정(audit_logs.trace_id + tenant_metrics_history)
- T1.3은 schema 무수정(ApiKey relation을 T1.5에 위임 + 2-query 우회)
- T1.2는 schema 무수정 + T1.3 stub 자체 생성

**Pre-Flight 체크**: 대상 경로 기추적 0(packages/core/src/cron, /auth, /audit), `.kdyswarm/` 비어있음(lock 충돌 없음), untracked 1(`standalone/README.md` — 별개).

**결론**: schema 단독 소유권 + stub 인터페이스 분리 패턴으로 4 agent 동시 발사 안전성 확보. Pre-Flight PASS.

### 토픽 3: 4 agent 병렬 발사 (Phase 4)
Agent tool × 4 (subagent_type=general-purpose, isolation=worktree, run_in_background=true) 단일 메시지 동시 호출. 각 agent에 자체 worktree 격리 + impl-spec 직접 읽기 권장 + commit 형식 + 검증 게이트 + 5줄 리포트 형식 명시.

agent 4개 모두 시작 시 worktree base 불일치(847dbe3 vs 현재 7871aa6) 자율 발견 → `git rebase` 또는 `git merge --ff-only spec/aggregator-fixes`로 정정.

| Agent | Task | Commit | 신규/수정 | Tests | 자율 결정 |
|-------|------|--------|----------|-------|----------|
| A1 | T1.2 router | `cb7e298` | 11/0 (895줄) | 9 | `auditLogSafe` 어댑터 신설(시그니처 충돌 해결), 상대경로 import |
| A2 | T1.3 K3 | `6645f28` | 3/0 (614줄) | 13 | bcrypt 먼저(timing 보호), 2-query 우회, NULL tenantId도 MISMATCH 흡수 |
| A3 | T1.5 WorkerPool | `2bc35da` | 13/6 (1,351줄) | 29 | sha256 BIGINT advisory lock 전략 채택, packages/core path alias 추가 |
| A4 | T1.7 audit-metrics | `3714073` | 7/9 (988줄) | 28 | sentinel `'default'` 유지(spec 정정), migration 번호 0002/0003 |

**결론**: 4 agent 모두 PASS, 머지 충돌 0 예상. 자율 의사결정의 품질이 인상적(특히 A2 timing-channel 보호, A4 sentinel invariant 보존).

### 토픽 4: DAG 순서 통합 (Phase 5)
schema 충돌 회피 위해 T1.5 → T1.7 → T1.3 → T1.2 순으로 `git merge --no-ff` 진행. 모두 'ort' 전략으로 깔끔하게 머지 (실 충돌 0).

**결론**: 머지 commit 4개 생성. spec/aggregator-fixes는 7871aa6 → 46d43f9으로 진행.

### 토픽 5: 통합 부채 정리 (chore commit)
T1.2가 T1.3 병렬 진행 중 만든 stub `src/lib/auth/keys-tenant.stub.ts`(47줄)와 `src/lib/api-guard-tenant.ts:31`의 import을 실 모듈로 전환:
- ResolvedTenant(T1.2) ↔ TenantIdentity {id?, slug}(T1.3) **구조적 호환** 확인 → import 1줄 교체로 컴파일 PASS
- VerifyResult 타입은 stub이 더 느슨(optional fields), real이 더 엄격(discriminated union) — T1.2 사용 코드는 모두 호환

`npx tsc --noEmit` 첫 실행 시 standalone/src/lib/cron/registry.ts에서 T2403/T2353/T2322 에러 6건 발생. 원인: T1.5가 `RegistryState` 타입을 jobsByTenant Map 차원으로 변경했으나 standalone은 WSL 배포용 패킹 복사본(`pack-standalone.sh`이 재생성). tsconfig.json exclude에 `standalone/**` 추가 → tsc PASS.

**결론**: 통합 commit `6c9f631` (3-fold: stub 삭제 + import 교체 + tsconfig exclude). prisma generate 후 전체 검증 PASS.

### 토픽 6: 검증 게이트 + sentinel 메모리
- `npx tsc --noEmit` 0 에러
- `npx tsc -p packages/core` 0 에러
- `npx vitest run` **355/355 PASS** (27 파일, 1.31초)
- `npm run build` Compiled successfully, `/api/v1/t/[tenant]/[...path]` ƒ 등록
- `npx prisma validate` PASS
- ADR-021 invariant 11 콜사이트 변경 0건 검증

A4의 sentinel 결정(`'default'` vs `'_system'`)은 향후 코드 작성 시 일관성 위해 기록 가치 있다고 판단 → memory `project_tenant_default_sentinel.md` 신설.

**결론**: G1b 통합 완전 종료. 통합 부채 3건은 다음 세션 P0로 위임.

---

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|------------|----------|
| D-1 | 4 agent worktree 동시 발사 + DAG 통합 | 순차 (안전 우선) / 2-2 분할 | handover의 `--strategy parallel` + schema 단독 소유권 패턴이 충돌 surface를 0으로 환원, run_in_background로 메인 세션 비차단 |
| D-2 | Phase 1 코드는 src/(apps/web) 우선, packages/core는 pure logic만 | 모두 packages/core (task-dag 표면적 권고) | Prisma 의존 코드는 packages/core의 0-deps 원칙 위배. 이전은 별도 PR(T2.5 Almanac 마이그레이션과 함께) |
| D-3 | sentinel `'default'` 유지 (spec의 `'_system'` 채택 안 함) | impl-spec 그대로 채택 | T0.4 실제 코드 invariant 보존 → 회귀 0 + dashboard slug 일관성. memory +1로 다음 세션 보장 |
| D-4 | tsconfig.json exclude에 `standalone/**` 추가 | standalone 수동 동기화 / 패킹 스크립트로 자동 갱신 | standalone은 pack-standalone.sh의 산출물(deploy artifact). 본 트리에서 tsc 검증 대상이 아님 — exclude가 정답 |
| D-5 | TenantMembership 모델 추가는 다음 세션 위임 | 본 세션에서 함께 처리 | T1.5 agent prompt에 명시되지 않은 scope. 추가 시 schema + migration + wiring 4h 추가 — 본 세션 통합 + cs 시간 압박. fail-closed 기본 모드(항상 403)로 안전성은 확보됨 |

---

## 수정 파일 (45개, 9 commits)

### 신규 (34개)

**packages/core/src/cron/** (T1.5):
- `lock-key.ts` (34줄), `lock-key.test.ts` (62줄)
- `circuit-breaker-state.ts` (130줄), `circuit-breaker-state.test.ts` (186줄)
- `index.ts` (22줄)

**src/lib/cron/** (T1.5):
- `policy.ts` (69줄), `lock.ts` (33줄), `circuit-breaker.ts` (167줄)
- `worker-pool.ts` (261줄), `worker-script.ts` (189줄)
- `circuit-breaker.test.ts` (200줄), `worker-pool.test.ts` (185줄)

**src/lib/auth/** (T1.3):
- `keys-tenant.ts` (171줄), `keys-tenant-issue.ts` (83줄), `keys-tenant.test.ts` (360줄)

**src/lib/tenant-router/** (T1.2):
- `types.ts` (28줄), `manifest.ts` (41줄), `dispatch.ts` (66줄), `dispatch.test.ts` (52줄)
- `membership.ts` (43줄, fail-closed stub), `roles.ts` (15줄)

**src/lib/audit/** (T1.2):
- `safe.ts` (68줄, ADR-027 §9 도메인 이벤트 어댑터)

**src/lib/** (T1.2/T1.7):
- `api-guard-tenant.ts` (209줄), `api-guard-tenant.test.ts` (259줄)
- `request-context.ts` (65줄), `request-context.test.ts` (139줄)
- `with-request-context.ts` (78줄)
- `cardinality-guard.ts` (85줄), `cardinality-guard.test.ts` (97줄)

**src/app/api/v1/t/[tenant]/[...path]/route.ts** (T1.2, 67줄)

**migrations**:
- `prisma/migrations/20260427100000_phase1_5_tenant_cron_isolation/migration.sql` (T1.5, 99줄)
- `src/lib/db/migrations/0002_tenant_metrics.sql` (T1.7, 22줄)
- `src/lib/db/migrations/0003_audit_trace.sql` (T1.7, 15줄)

### 수정 (11개)

| 파일 | 변경 |
|------|------|
| `prisma/schema.prisma` | T1.5: CronJob +4 cols + Tenant relation, ApiKey +Tenant relation + indexes, Tenant +backrefs, TenantCronPolicy 신규 |
| `src/lib/cron/registry.ts` | T1.5: state.jobsByTenant Map 차원, advisory lock + circuit breaker 통합 tick, runJob 시그니처 |
| `src/lib/cron/runner.ts` | T1.5: dispatchCron(job, tenantId), SQL은 main thread, FUNCTION/WEBHOOK은 worker pool |
| `src/lib/audit-log.ts` | T1.7: AuditEntry +tenantId?/+traceId? |
| `src/lib/audit-log-db.ts` | T1.7: safeAudit 자동 주입(getRequestContext) + writeAuditLogDb 컬럼 매핑 |
| `src/lib/audit-metrics.ts` | T1.7: byTenant 차원(MAX_TENANTS=50, MAX_BUCKETS_PER_TENANT=100, FIFO evict) |
| `src/lib/audit-metrics.test.ts` | T1.7: 6 신규 byTenant 케이스 |
| `src/lib/metrics-collector.ts` | T1.7: collectOnce(tenantId) + recordTenantMetric() + cardinality guard |
| `src/lib/db/schema.ts` | T1.7: audit_logs.traceId + 인덱스, metrics_history 인덱스, tenant_metrics_history 신규 테이블 |
| `src/lib/db/migrate.ts` | T1.7: REQUIRED_TABLES에 tenant_metrics_history 추가 |
| `src/lib/db/migrations/meta/_journal.json` | T1.7: idx 2/3 추가 |
| `scripts/verify-schema.cjs` | T1.7: tenant_metrics_history + 컬럼 화이트리스트 검증 |
| `packages/core/src/index.ts` | T1.5: cron pure logic re-export |
| `tsconfig.json` | T1.5(path alias), 통합(`standalone/**` exclude) |
| `vitest.config.ts` | T1.5: `@yangpyeon/core/*` path alias |
| `.gitignore` | T1.5: `packages/*/dist/` |
| `src/lib/api-guard-tenant.ts` | 통합: import 경로 stub → real |

### 삭제 (1개)
- `src/lib/auth/keys-tenant.stub.ts` (통합 시점, 47줄)

---

## 상세 변경 사항

### 1. T1.2 router + withTenant 가드
- `/api/v1/t/[tenant]/[...path]/route.ts` Next.js catch-all (GET/POST/PATCH/PUT/DELETE 5메서드)
- `withTenant(handler)`: URL slug 추출 + 정규식 검증 + Tenant 조회 + active 토글 + 인증 경로별 cross-validation(Bearer pub_/srv_ → K3, Cookie/JWT → membership) + `runWithTenant({tenantId})` 진입
- `withTenantRole(roles, handler)`: K3 통과 시 ADMIN 가정, Cookie 경로는 membership.role 검증
- `auditLogSafe` 어댑터: 기존 access-log 모델(`safeAudit({entry: AuditEntry})`)과 ADR-027 §9 도메인 이벤트 모델(`auditLogSafe({event, actor, details})`) 시그니처 충돌 해결, ADR-021 fail-soft 보장

### 2. T1.3 ApiKey K3 매칭
- `KEY_RE` `/^(pub|srv)_([a-z0-9][a-z0-9-]{1,30})_([A-Za-z0-9_-]{32})$/`
- `verifyApiKeyForTenant(rawKey, pathTenant: TenantIdentity)`:
  1. KEY_RE 정규식 파싱
  2. DB lookup (prefix unique, `<scope>_<slug>_<random.slice(0,8)>`)
  3. **bcrypt.compare 먼저** (timing-channel 보호)
  4. revokedAt 검사
  5. cross-validation 1: dbTenant.slug === prefixSlug (DB 위조 차단, NULL tenantId도 MISMATCH로 흡수 — Stage 1 nullable 호환 + Stage 3 NOT NULL 자동 흡수)
  6. cross-validation 2: dbTenant.slug === pathTenant.slug (cross-tenant 차단)
  7. lastUsedAt fire-and-forget 갱신
- 7 시나리오 매트릭스 + 보강 = 13 vitest

### 3. T1.5 TenantWorkerPool + circuit breaker
- `tenantJobLockKey(tenantId, jobId): bigint` — sha256 BIGINT 전략 1 (충돌 ~10⁻¹⁵)
- `decideTransition(state, success, failures, threshold)` — pure 상태 머신 (CLOSED↔OPEN↔HALF_OPEN)
- `TenantWorkerPool` 클래스 — global cap 8, per-tenant cap from policy, per-job worker 생성, resourceLimits, parentPort 메시지, 1차 graceful shutdown → 5s 후 worker.terminate(). **lock holder = main thread** (spike-baas-002 §3.7)
- `worker-script.ts` — runWebhook(AbortController + AGGREGATOR_FETCH_TIMEOUT), runFunction TODO(Phase 1.6+ isolated-vm 통합)
- `registry.ts` refactor — jobsByTenant Map 차원, runJob 시그니처
- prisma schema +TenantCronPolicy 모델 + Tenant↔ApiKey/CronJob relations + indexes

### 4. T1.7 audit-metrics tenant 차원 + request-context (T3)
- `RequestContext { traceId, tenantId?, userId?, startedAt }` AsyncLocalStorage
- `withRequestContext(handler)` API Route 래퍼 (X-Request-Id 헤더 발급/전파)
- `safeAudit` 자동 주입 — 11 콜사이트 변경 0 (ADR-021 §amendment-2 invariant)
- `audit-metrics.ts` byTenant 차원 — MAX_TENANTS=50, MAX_BUCKETS_PER_TENANT=100, FIFO evict
- `cardinality-guard.ts` — C1(100 series cap) + C2(10K/min sampling 10%) + drop counter
- drizzle migration 0002 (tenant_metrics_history 신규), 0003 (audit_logs.trace_id)

---

## 검증 결과

| 게이트 | 결과 |
|--------|------|
| `npx tsc --noEmit` | 0 에러 (standalone 제외) |
| `npx tsc -p packages/core` | 0 에러 |
| `npx vitest run` | **355/355 PASS** (27 파일, 1.31초) |
| `npm run build` | Compiled successfully in 6.0s — `/api/v1/t/[tenant]/[...path]` ƒ 등록 |
| `npx prisma validate` | PASS |
| ADR-021 invariant | 11 콜사이트 변경 0건 (`git diff` 검증) |
| 머지 충돌 | 0건 |

테스트 증가: 285 → 355 (+70, +24%). 신규 분포: T1.2 9 / T1.3 13 / T1.5 29 / T1.7 28 (일부 audit-metrics.test.ts 기존 합산).

---

## 터치하지 않은 영역

- **TenantMembership prisma 모델** — 부재. `src/lib/tenant-router/membership.ts`는 fail-closed 모드(항상 null) → cookie 인증 경로 항상 403. 다음 세션 P0.
- `src/lib/auth/keys-tenant.ts` 2-query 분리 — T1.5의 ApiKey↔Tenant relation을 활용해 `include: { tenant: true }` 단일 query로 통합 가능 (30분 작업).
- `src/lib/with-request-context.ts.resolveTenantId()` — stub 상태. T1.2 path 추출 결과와 wiring 필요 (1h).
- 4 worktree branch (`worktree-agent-{4개 ID}`) — 통합 완료 후에도 lock 상태 유지. 시스템 자동 정리 대기 또는 수동 `git worktree remove --force` (4건).
- `standalone/` 패킹 복사본 — pack-standalone.sh 재실행 필요 (다음 배포 시 자동).
- Almanac spec 적용 (S57 이월): `npm install rss-parser cheerio @google/genai` + shadcn 9종 + Prisma migrate + 코드 cp.
- 03:00 KST cleanup cron 결과 (S56 이월): 다음 03:00 KST에 audit log write failed 0건 확인 필요.
- ADR-021 placeholder cascade 6위치 (S56 이월).
- 글로벌 스킬 drift 점검 (S55 이월).
- S54·53 잔존 6항.

---

## 알려진 이슈

- **TenantMembership 모델 부재** — Phase 1.2 cookie 인증 경로가 항상 403. 운영자 본인이 컨슈머 라우트에 cookie로 접근하려면 즉시 차단됨. 다음 세션 P0(3-4h).
- **TS 에러 59건** — pre-existing, T1.x agent 작업과 무관. Prisma generated client 미생성 잔존 환경 + filebox null assignability 등. 본 세션은 standalone 제외만 처리.
- **isolated-vm runFunction TODO** — Phase 1.6+ 후속. T1.5의 worker-script.ts에 의도적 throw "isolated-vm 통합은 별도 PR" 명시.
- **PM2 cluster leader election** — ADR-028 §10.2 Open Q. Phase 1 후반 결정.
- **TenantCronPolicy 시드** — 운영 콘솔 컨슈머 등록 시 1회 INSERT. Phase 2 운영 콘솔 작업과 함께.

---

## 다음 작업 제안 (우선순위 순)

### P0 — 통합 부채 정리 (~5h)
1. **TenantMembership 모델 + migration + wiring** (3-4h):
   - prisma/schema.prisma에 TenantMembership 모델 추가 (ADR-027 §6.1 참조)
   - enum TenantRole {OWNER, ADMIN, MEMBER, VIEWER} (또는 prisma enum vs TS union 결정)
   - migration `20260427_add_tenant_membership/migration.sql`
   - `src/lib/tenant-router/membership.ts` 본문을 `prisma.tenantMembership.findUnique`로 교체
2. **keys-tenant.ts 단일 query 통합** (30분):
   - `prisma.apiKey.findUnique({ include: { tenant: true } })` 1회로 합치기 (T1.5 relation 활용)
   - 기존 2-query 우회 코드 + 주석 제거
3. **with-request-context.resolveTenantId() wiring** (1h):
   - T1.2 path `/api/v1/t/[tenant]/...`에서 tenant slug 추출
   - resolveTenantFromSlug 호출 → tenantId 반환
   - observability traceId + tenantId 자동 주입 활성화

### P1 — Phase 1 마무리 (~28h)
4. **T1.4 RLS 정책 단일 'default' tenant** (18h):
   - ADR-023 옵션 B + Prisma client extension (Phase 1.4 Stage 3 enforce)
   - RLS 정책 SQL × 18 모델
   - Prisma extension `withRls()` 미들웨어 — `getCurrentTenant().tenantId`로 SET LOCAL
   - e2e 테스트 5건: cross-tenant SELECT 차단, INSERT tenantId 자동 채움, UPDATE tenantId 변경 차단, DELETE 다른 tenant row 0 영향, JOIN 격리
5. **T1.6 Almanac backfill** (10h):
   - content_* 테이블 tenant_id='almanac' migration
   - alias `/api/v1/almanac/*` → `/api/v1/t/almanac/*` (6개월 grace)

### P2 — M2 게이트 + Phase 2 진입
6. **M2 게이트 검증**:
   - `curl -sf http://localhost:3000/api/v1/t/almanac/health` → 200
   - `sqlite3 audit.db "SELECT COUNT(*) FROM audit_logs WHERE tenant_id IS NULL"` → 0
   - `pm2 logs ypserver | grep "worker.dispatch"` → tenantId 라벨 포함 확인
7. **Phase 2 진입** — T2.1 TenantManifestSchema (14h, ADR-026)

### 이월
- Almanac spec 적용 (npm/shadcn/Prisma/cp/머지)
- 03:00 KST cleanup cron 결과 점검
- ADR-021 placeholder cascade 6위치 정정
- 글로벌 스킬 drift 점검
- 4 worktree 정리 (수동 또는 시스템 자동)
- S54·53 6항

---

## 참조 저널

- [docs/logs/journal-2026-04-26.md](../logs/journal-2026-04-26.md) — 세션 58/59/60 토픽별 누적 기록
- 본 세션은 cs 시점에 별도 journal append 생략 (단일 토픽 흐름 = G1b 발사·통합).

---

## 참조 commits (9건)

```
6c9f631 chore(integrate): G1b 통합 — T1.2 stub → T1.3 실 모듈 import 교체 + standalone tsc exclude
46d43f9 merge(T1.2): withTenant 가드 + catch-all router /api/v1/t/[tenant] — Phase 1.2 통합
416c10f merge(T1.3): ApiKey K3 매칭 (prefix + FK + 2중 cross-validation) — Phase 1.3 통합
0487e45 merge(T1.7): audit-metrics byTenant + request-context + cardinality guard — Phase 1.7 통합
7cdd5c3 merge(T1.5): TenantWorkerPool + circuit breaker + TenantCronPolicy — Phase 1.5 통합
2bc35da feat(cron): T1.5 TenantWorkerPool + circuit breaker + TenantCronPolicy — Phase 1.5
3714073 feat(observability): T1.7 audit-metrics byTenant + request-context (T3) + cardinality guard — Phase 1.7
cb7e298 feat(router): T1.2 withTenant 가드 + catch-all router /api/v1/t/[tenant] — Phase 1.2
6645f28 feat(auth): T1.3 ApiKey K3 매칭 (prefix + FK + 2중 cross-validation) — Phase 1.3
```

---
[← handover/_index.md](./_index.md)
