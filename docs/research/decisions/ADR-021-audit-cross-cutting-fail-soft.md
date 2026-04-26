# ADR-021: 감사 로그 — Cross-cutting Fail-Soft + 마이그레이션 자가치유

- **상태**: Accepted
- **날짜**: 2026-04-25 (세션 56)
- **결정자**: 프로젝트 오너
- **상위 ADR 로그**: [docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md](../2026-04-supabase-parity/02-architecture/01-adr-log.md) (ADR-001~020 누적)

---

## 1. 컨텍스트

세션 56 로그인 장애로 노출된 4층 결함:

| 층 | 결함 | 표면 영향 |
|---|------|----------|
| L1 전술 | `dashboard.db` 빈 파일 — drizzle 마이그레이션 미적용 | `SqliteError: no such table: audit_logs` |
| L2 프로세스 | `wsl-build-deploy.sh` 6단계에 마이그레이션/스키마 검증 부재 | 빈 DB 로 traffic 수락 |
| L3 아키텍처 | `writeAuditLogDb` 가 동기 throw + 도메인 라우트가 `await/try-catch` 없이 호출 | audit DB 한 테이블 누락 → 로그인 자체 500 |
| L4 메타 | 세션 54 silent-failure 진단 패턴이 `cleanup-scheduler` 1곳에만 적용, 11개 도메인 콜사이트 누락 | 동일 함정 반복 가능 |

배경:
- 양평 대시보드는 Postgres(Prisma) + SQLite(drizzle) 하이브리드 — 사용자/세션은 Postgres, 감사 로그는 SQLite. 의도: 감사 트래픽 격리, 별도 백업.
- 세션 50 standalone 패키징 도입 후 운영 DB 가 새로 생성되는 케이스가 발생 → 빈 DB 로 가동되는 시나리오 노출.
- `pack-standalone.sh` 가 prisma 마이그레이션은 동봉하지만 drizzle 마이그레이션은 누락 — 운영 환경이 자기 스키마를 만들 수단 자체 부재.

## 2. 결정

### 2.1 불변식 — Cross-cutting fail-soft (L3)

**감사 로그는 cross-cutting 관심사이며, 도메인 임계 경로(인증/세션/CRUD)의 응답을 절대 깨뜨리지 않는다.**

- 모든 도메인 라우트는 `safeAudit(entry, context?)` 만 사용 (`src/lib/audit-log-db.ts`).
- `writeAuditLogDb` 는 internal 으로 마킹 — 직접 호출 금지 (테스트/CLI 제외).
- 실패 시 `console.warn` 으로 err 객체(message/stack) 노출 + 호출자에게는 throw 안 함.

### 2.2 빌드 게이트 + 운영 self-heal (L1·L2)

**스키마 정합성은 빌드타임에 1차 보장하고, 운영 기동 시 2차 자가치유한다.**

- `scripts/wsl-build-deploy.sh` 단계 [6/8] [7/8] 추가:
  - `node scripts/run-migrations.cjs` — drizzle migrate 적용
  - `node scripts/verify-schema.cjs` — 필수 테이블 부재 시 PM2 reload 차단 (fail-fast)
- `pack-standalone.sh` 가 `src/lib/db/migrations/` → `<bundle>/db-migrations/` 동봉.
- `src/instrumentation.ts` 가 `applyPendingMigrations()` 를 부팅 시 호출 (자가치유). 실패해도 부팅은 계속 (warn-only) — 빌드 게이트가 1차이고 instrumentation 은 2차.

### 2.3 패턴 sweep (L4)

**세션 54 진단 패턴을 11개 도메인 콜사이트에 전수 적용.**

| 콜사이트 | 변경 |
|---|------|
| `src/lib/sessions/login-finalizer.ts` | `writeAuditLogDb` → `safeAudit` |
| `src/app/api/v1/auth/{login,logout,refresh,sessions/[id],sessions/revoke-all}/route.ts` | 동일 |
| `src/app/api/admin/users/[id]/sessions/route.ts` | 동일 |
| `src/app/api/v1/tables/[table]{,/[pk],/composite}/route.ts` | 동일 (총 7건) |
| `src/lib/cleanup-scheduler.ts` | 세션 54 수동 try/catch 제거 + `safeAudit(..., context)` 로 통일 |

### 2.4 SQLite vs Postgres 통합 — 보류

audit_logs 를 Postgres 로 통합하는 안은 본 ADR 범위에서 **결정 보류**. 사유: 하이브리드 구조의 의도(감사 트래픽 격리, 운영 백업 분리)가 ADR-013/021 운영 노트에 명시되어 있고, 통합 시 백업/리텐션 정책 재설계 필요. 통합 트리거(아래) 발동 시 별도 ADR 신설.

## 3. 고려한 대안

| Alt | 내용 | 거부 사유 |
|-----|------|----------|
| A1 | 운영 DB 마이그레이션만 1회 실행 (Step 1 단독) | L2/L3/L4 잔존 → 다음 standalone 재배포에서 동일 사고 재발 |
| A2 | `writeAuditLogDb` 자체에 try/catch 매립 | 테스트가 throw 검증을 못 함, "audit 실패를 의도적으로 노출하고 싶은" 케이스(테스트/관리자 도구) 차단 |
| A3 | audit 를 fire-and-forget 비동기 큐로 이전 (outbox 패턴) | 본 사고 직접 원인이 아님, 오버엔지니어링 — 추후 트래픽 증가 시 재검토 |
| A4 | audit_logs 즉시 Postgres 로 통합 | 백업/리텐션 정책 재설계 미완 — §2.4 보류 |

## 4. 결과

### 긍정
- 도메인 임계 경로(로그인 등)가 audit DB 결함과 분리됨 — observability 가 도메인을 인질로 잡지 않음.
- 빌드 + 기동 두 지점에 게이트 → "빈 DB 로 traffic 수락" 시나리오 구조적 제거.
- 11개 콜사이트 일괄 sweep → 동일 패턴 재발 방지.

### 부정 / 트레이드오프
- `safeAudit` 실패는 warn 로그로만 남음 → audit 누락이 모니터링 없이 조용히 누적될 가능성. **완화책**: 차후 audit-failure 카운터 메트릭 + 알림 (별도 트랙).
- instrumentation self-heal 이 부팅 시 SQLite 잠금 가능성 — 기존 PM2 인스턴스가 떠 있는 상태에서 reload 시 공존 윈도우. WAL 모드라 락 충돌 확률 낮으나 모니터링 필요.

## 5. 트리거 — Audit 통합 재검토 (§2.4 후속)

다음 중 하나 이상 충족 시 audit_logs Postgres 통합 ADR 신설:

1. SQLite WAL 락 / busy_timeout 초과로 audit 실패율 > 0.1%/일 (3일 연속)
2. 감사 보관 기간이 3개월 초과 → 단일 SQLite 파일 크기 1GB+ → 백업/회전 운영 부담 가시화
3. Postgres 측 트랜잭션 안에서 audit 와 도메인 쓰기를 함께 묶어야 하는 신규 요구 (예: 컴플라이언스 대응)

## 6. 근거

- 세션 54 인수인계서: silent-failure 진단 패턴 정의 (`docs/handover/260425-session54-audit-silent-failure-diagnostic.md`)
- 세션 56 진단 4층 분석 (본 ADR §1)
- PM2 에러 로그 `2026-04-25 12:52:52 SqliteError: no such table: audit_logs` — 인과 사슬 직접 증거
- 변경 파일: `src/lib/audit-log-db.ts`, `src/lib/sessions/{cleanup,login-finalizer}.ts`, `src/lib/cleanup-scheduler.ts`, `src/lib/db/migrate.ts` (신규), `src/instrumentation.ts`, 9 도메인 라우트, `scripts/{run-migrations,verify-schema}.cjs` (신규), `scripts/{pack-standalone,wsl-build-deploy}.sh`

## 7. 재검토 트리거

- §5 audit 통합 트리거 발동
- `safeAudit` 호출자가 100건 초과 → audit 발생량 메트릭/샘플링 정책 필요
- 새 storage 백엔드(Postgres/Loki/etc.) 도입 시 cross-cutting 추상화 재설계

---

## §amendment-1 (2026-04-25, 세션 56 §보완) — Audit-Failure 카운터 메트릭

### 컨텍스트

§4 결과·부정에서 명시했던 잔류 위험: "safeAudit 실패는 warn 로그로만 남음 → audit 누락이 모니터링 없이 조용히 누적될 가능성." 본 amendment 는 이를 1차 가시성 도구로 완화한다.

### 결정

`safeAudit` 호출 결과(성공/실패) 를 in-process 카운터로 누적하고 admin 전용 endpoint 로 노출한다.

- **신규 모듈** `src/lib/audit-metrics.ts`
  - `recordAuditOutcome(success, context, error?)` — 절대 throw 하지 않음 (cross-cutting 의 cross-cutting)
  - `getAuditMetrics(): AuditMetricsSnapshot` — total + byBucket(첫 2 segment 정규화) + uptimeSeconds
  - `MAX_BUCKETS = 200` 캡 + FIFO evict — 카디널리티 폭주 방지 (cleanup-scheduler 의 entry-id 같은 high-cardinality 차단)
  - `resetAuditMetrics()` — 테스트 전용
- **safeAudit 통합** — try/catch 양 분기에서 `recordAuditOutcome` 호출
- **신규 endpoint** `GET /api/admin/audit/health` — `withRole(["ADMIN"])` 가드, `Cache-Control: no-store`
- **테스트 9 신규** — 초기 상태 / 카운트 / context 정규화 / 정렬 / 비-Error throw / never-throw invariant / failureRate 0&1 경계 / reset

### 의도된 한계 (의식적 보류)

- **PM2 reload 시 리셋** — 누적 추세는 audit_logs 테이블 자체가 source of truth, 본 카운터는 "지금 이 순간" 진단용
- **외부 스크래퍼(prometheus/loki) 미통합** — 1인 운영 인프라에 prometheus 부재. JSON endpoint 가 즉시 가치를 충족, 차후 텍스트 포맷 익스포터 추가 가능
- **알림 미통합** — 임계값 초과 시 자동 알림은 별도 트랙. 1차는 "필요 시 GET" 풀(pull) 모델

### 결과

- audit 실패가 발생해도 도메인 흐름 무관 + 발생 사실은 카운터로 즉시 집계 → "silent" 의 정의 자체가 해소됨 (warn 로그 + 카운터 양면 노출)
- failureRate 가 0 이 아니면 즉시 알 수 있음 (admin 단일 GET)
- byBucket 으로 어느 도메인 라우트가 실패하는지 즉시 파악

### 검증

- `vitest run audit-metrics.test.ts` — 9/9 PASS
- `vitest run cleanup-scheduler.test.ts` — 13/13 PASS (회귀 0)
- `tsc --noEmit` — 0 errors
- 운영 배포 후 `GET /api/admin/audit/health` 401 (인증 가드 동작 확인) — 인증된 결과 측정은 차후 ADMIN 토큰으로

### 후속 트리거

- failureRate > 0.001/일 (1만건 중 10건 실패) → 5초 락이나 SQLite 디스크 풀 등 인프라 조사
- 카운터가 PM2 reload 사이에 의미 있는 추세 식별 어려워질 때 → audit_logs 에서 SESSION_LOGIN/이후 빠진 SESSION_LOGIN_FAIL 등 결손 패턴 직접 쿼리 또는 별도 audit_failures 테이블 신설 검토
- 외부 스크래퍼 도입 시 → `/api/admin/audit/health` 를 prometheus 텍스트 포맷으로도 직렬화 (JSON 과 병기 또는 별도 endpoint)

### 변경 파일

- 신규: `src/lib/audit-metrics.ts` / `src/lib/audit-metrics.test.ts` / `src/app/api/admin/audit/health/route.ts`
- 수정: `src/lib/audit-log-db.ts` (safeAudit 에 `recordAuditOutcome` 통합)

---

## §amendment-2 (2026-04-26, 세션 59 Phase 0.4) — Audit Tenant 차원 도입 (Stage 1 additive)

### 컨텍스트

세션 58 ADR-022~029 8건 ACCEPTED 로 yangpyeon 정체성이 "닫힌 멀티테넌트 BaaS (1인 N=10~20 컨슈머)" 로 재정의됨. 이에 따라 cross-cutting audit 도 tenant 차원을 가져야 한다 — 어느 컨슈머의 라우트/cron 에서 발생한 audit 인지 dashboard에서 즉시 식별 필요. 그러나 §amendment-1 이 정한 "safeAudit 시그니처 불변" 원칙(11 콜사이트 무수정)을 깨면 cross-cutting 의 본질적 이점 (도메인 코드 invariant 보존) 이 훼손된다.

본 amendment 는 그 두 요구를 동시에 만족시킨다:
- **tenant 차원 도입** — audit_logs/metrics_history/ip_whitelist 에 `tenant_id` 컬럼 추가.
- **시그니처 불변 보장** — safeAudit 호출자는 변경 0줄. AsyncLocalStorage 자동 주입은 Phase 1.7 에서 활성화.

### 결정

#### D-1. SQLite 스키마 — 3 테이블에 tenant_id 추가 (Stage 1 additive)

`src/lib/db/schema.ts` 에 다음 컬럼을 일괄 추가:

```ts
tenantId: text('tenant_id').default('default'),
```

대상 테이블:
- `audit_logs` — 모든 도메인 발생 이벤트
- `metrics_history` — 시스템 자원 측정 (per-tenant 분리는 Phase 3 ADR-029 결정)
- `ip_whitelist` — IP 기반 접근 통제 (per-tenant 가능성, Phase 3 결정)

마이그레이션 `src/lib/db/migrations/0001_add_tenant_id.sql`:
```sql
ALTER TABLE `audit_logs` ADD `tenant_id` text DEFAULT 'default';
ALTER TABLE `metrics_history` ADD `tenant_id` text DEFAULT 'default';
ALTER TABLE `ip_whitelist` ADD `tenant_id` text DEFAULT 'default';
```

`_journal.json` 엔트리 추가 (idx 1, tag `0001_add_tenant_id`). 본 ADR 의 §amendment-1 self-heal 메커니즘 (`src/lib/db/migrate.ts`) 이 부팅 시 자동 적용.

#### D-2. tenant_id 식별자 규약 — Slug (TEXT)

audit_logs.tenant_id 는 **slug** ('default' / 'almanac' / ...) 를 저장한다. PG Tenant.id (UUID) 와 의도적으로 별개.

| 측면 | PG Tenant.id (UUID) | audit_logs.tenant_id (TEXT slug) |
|------|---------------------|--------------------------------|
| 형식 | `00000000-0000-0000-0000-000000000000` | `default` |
| 용도 | 트랜잭션 GUC `app.tenant_id`, RLS 정책 | dashboard 표시, 필터, byBucket 키 |
| 가독성 | 운영자에게 불투명 | 즉시 인식 가능 |
| JOIN 비용 | 없음 (직접 매칭) | slug → UUID 변환 필요 (드물게) |

**근거**: audit dashboard 는 사람이 읽는다. Per-tenant audit failure rate 를 보면서 `default` 와 `almanac` 을 즉시 구분할 수 있어야 한다. UUID 는 PG 트랜잭션 컨텍스트의 GUC 값으로만 사용되며 사용자에게 노출되지 않음.

#### D-3. safeAudit 시그니처 불변 — Phase 1.7 에서 AsyncLocalStorage 자동 주입

```ts
// 본 amendment 시점 (Phase 0.4) — 시그니처 변경 0
export function safeAudit(entry: AuditEntry, context?: string): void { ... }

// Phase 1.7 (TenantContext 활성화 후) — 시그니처 동일, 내부에서 자동 주입
export function safeAudit(entry: AuditEntry, context?: string): void {
  const ctx = context ?? entry.action ?? `${entry.method} ${entry.path}`;
  const tenantId = getCurrentTenant()?.slug ?? 'default'; // ← 자동 주입
  try {
    writeAuditLogDb({ ...entry, tenantId });               // ← 컬럼 채움
    recordAuditOutcome(true, ctx);
  } catch (err) {
    recordAuditOutcome(false, ctx, err);
    console.warn("[audit] write failed", { context: ctx, error: ... });
  }
}
```

11 도메인 콜사이트 (cleanup-scheduler / login-finalizer / cleanup / 9 routes) 는 Phase 0.4 ~ Phase 1.7 사이에 **무수정**으로 동작한다. 이 기간 동안 tenant_id 는 DEFAULT 'default' 로 채워진다 (단일테넌트 시절과 동일 의미).

#### D-4. Audit-metrics 의 cardinality cap 유지

§amendment-1 의 `MAX_BUCKETS = 200` 캡은 tenant 차원 도입 후에도 유지한다.

- N=20 컨슈머 × 평균 6 버킷 액션 = 120 series — 200 미만으로 안전
- Phase 3.4 (cardinality 자동 정책, ADR-029 §2.4) 에서 180/200 임계 도달 시 자동 cap 강화 + Operator Console 경고
- N=30 도달 시 OTel 도입 검토 (ADR-029 §6 트리거 B)

bucketName 함수는 §amendment-1 의 "첫 2 segment 정규화" 그대로. tenant 차원 추가는 byBucket 의 키에 prefix 형태로:

```ts
// Phase 1.7 활성화 후
function bucketName(action: string, tenantId: string): string {
  const segments = action.split('.').slice(0, 2).join('.');
  return `${tenantId}:${segments}`;
}
// 예: "almanac:cron.runjob.failure", "default:session.login"
```

### 의도된 한계 (의식적 보류)

- **Phase 0.4 시점 자동 주입 미활성** — TenantContext (AsyncLocalStorage) 자체가 Phase 1.1 에서 도입. Phase 0.4 는 컬럼 추가 + DEFAULT 'default' 만. Phase 1.7 까지 모든 audit 행은 tenant_id='default' 로 자동 채워짐.
- **safeAudit signature 보강 보류** — `entry.tenantId` 파라미터를 추가하지 않음. AsyncLocalStorage 자동 주입이 더 안전 (콜사이트 누락 시 컴파일 에러 대신 default fallback).
- **per-tenant audit-failure 카운터 분리 보류** — Phase 3 ADR-029 M1 도입 시 `audit_failures_<tenant_slug>` 카운터 분리 검토. 현재는 글로벌 카운터에 byBucket 으로 tenant prefix 만.
- **PG-SQLite 식별자 통일 보류** — slug vs UUID 의도적 분리 (D-2). 통일은 next-gen audit 백엔드 (ClickHouse/OpenSearch 등) 도입 시 재검토.

### 결과

- audit_logs 의 tenant 차원 도입 완료 — Stage 3 enforce 시 RLS 정책 추가하면 cross-tenant audit 누설 0 보장
- safeAudit 11 콜사이트 무수정 — cross-cutting invariant 100% 보존
- AsyncLocalStorage 자동 주입은 Phase 1.7 에서 활성화 → 콜사이트 변경 0 으로 멀티테넌트 audit 완성
- Phase 1.7 활성화 전까지 모든 audit 행이 'default' 로 채워짐 → 단일테넌트 모드 보존 (회귀 0)

### 검증

#### Phase 0.4 시점 (본 amendment 적용)
- `npx tsc --noEmit` — src/ 영역 0 에러
- 마이그레이션 스크립트 dry-run — 3 ALTER 문 모두 SQLite 호환 (TEXT DEFAULT)
- 기존 audit-metrics.test.ts 9/9 PASS (tenant 차원 추가 영향 0)
- 부팅 시 `applyPendingMigrations` 가 0001 자동 적용 (self-heal §amendment-1 메커니즘)

#### Phase 1.7 시점 (자동 주입 활성화)
- 새 테스트: `safeAudit("auth.login")` 호출 시 tenantId='almanac' 컨텍스트 → DB row 의 tenant_id='almanac'
- `getAuditMetrics().byBucket` 에 `almanac:auth`, `default:cron` 등 prefix 분리 확인
- cross-tenant 누수 e2e: tenant=almanac 사용자가 default 의 audit 조회 시도 → 0 row (Phase 3 RLS 정책 + Operator Console 가드)

### 후속 트리거

- **Phase 1.7 활성화 시점 재방문** — AsyncLocalStorage 도입 후 본 amendment 의 D-3 코드 적용
- N=15 도달 → byBucket cardinality 측정. 180/200 도달 시 Phase 3.4 자동 정책 활성화 또는 cap 상향
- ADR-029 OTel 도입 결정 시 → audit-metrics 미러링 + tenant_id 를 trace attribute 로 전파

### 변경 파일

- 신규: `src/lib/db/migrations/0001_add_tenant_id.sql`
- 수정: `src/lib/db/schema.ts` (3 테이블 tenantId 추가), `src/lib/db/migrations/meta/_journal.json` (entry idx 1 추가)
- Phase 1.7 예정 수정: `src/lib/audit-log-db.ts` (safeAudit 의 자동 주입), `src/lib/audit-metrics.ts` (bucketName tenant prefix)

### 호환성

- ADR-022 §1 (Tenant 1급 시민) ✓ — audit 도 tenant 차원 1급
- ADR-023 옵션 B (shared+RLS) ✓ — Phase 3 에서 audit_logs RLS 정책 추가 가능
- ADR-029 M1+L1+T3 ✓ — per-tenant metrics/logs/traces 정합 시작점
- §amendment-1 ✓ — MAX_BUCKETS=200 cap 유지, recordAuditOutcome never-throw invariant 보존
