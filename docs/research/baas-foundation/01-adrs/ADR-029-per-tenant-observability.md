# ADR-029: Per-tenant Observability — tenant_id 1급 차원 + 단계적 SQLite→OTel 진화

- **상태**: ACCEPTED (2026-04-26)
- **작성일**: 2026-04-26
- **결정자**: 사용자 (kimdooo-a) — 2026-04-26 세션 58
- **작성**: baas-foundation 워크스트림 (ADR 시리즈 #8/8 — 관측성)
- **Supersedes**: 없음 (ADR-021을 amendment로 확장)
- **Related**:
  - **ADR-021** (audit cross-cutting fail-soft) — **amendment 필요** (audit_logs.tenantId 컬럼 추가). safeAudit 11개 콜사이트는 자동 주입(인증 컨텍스트)이므로 시그니처 변경 불요
  - **ADR-022** (BaaS 정체성 재정의) — 옵션 A 채택 가정 위에 작성
  - **ADR-026** (Tenant Manifest/Registry) — tenant_id 발급/해석 메커니즘이 본 ADR의 기본 차원
  - **ADR-028** (Cron Worker Pool / Per-tenant Isolation) — cron 메트릭 차원과 통합
  - **ADR-002** (Supabase 적응 — 의존성 최소 원칙) — OpenTelemetry 도입 비용과 trade-off
  - **ADR-013** (envelope encryption) — 본 ADR과 직교 (Vault/JWKS 회전)
- **참조 문서**:
  - `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` §1.7
  - `docs/research/baas-foundation/00-context/02-current-code-audit.md` §6
  - `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md` (감사 fail-soft 정식화 + §amendment-1 audit-failure 카운터)
  - `docs/research/2026-04-supabase-parity/02-architecture/04-observability-blueprint.md` (Phase 16 청사진, ~20h)
  - 코드: `src/lib/audit-log-db.ts`, `src/lib/audit-metrics.ts`, `src/lib/metrics-collector.ts`, `src/lib/db/schema.ts`, `src/app/api/admin/audit/health/route.ts`

---

## 1. 컨텍스트 (Context)

### 1.1 1인 운영자 N=10~20 tenant 시나리오

ADR-022 옵션 A 채택 시 yangpyeon은 1인 운영자가 자기 소유 10~20개 프로젝트의 공유 백엔드가 된다. 운영의 일상은 다음 질문으로 압축된다:

> **"지금 어느 tenant가 아픈가? 30초 안에 답할 수 있는가?"**

이 질문에 답할 수 없으면 N=20 운영은 사실상 불가능하다 — 한 tenant의 cron 실패가 다른 tenant까지 전파됐는지, 단일 tenant의 quota 폭주인지, 인프라 전반(PG/PM2/디스크)의 문제인지 즉시 분리해야 한다.

따라서 본 ADR의 **first-class invariant**는:

> **모든 metric/log/trace의 첫 dimension은 `tenant_id`이다.** Tenant 차원이 없는 신호는 1인 운영자에게 무용하다.

### 1.2 현 상태 — Observability 단편화

`02-current-code-audit.md` §6과 코드 직접 검증:

| 신호 종류 | 현재 구현 | tenant 차원 |
|----------|----------|------------|
| **Audit log** | SQLite `audit_logs` (Drizzle, ADR-021 fail-soft) | ❌ 없음 (`detail` 텍스트에 user.email 평문) |
| **Audit metrics** | in-process counter (`src/lib/audit-metrics.ts`, MAX_BUCKETS=200) | ❌ 없음 (context 첫 2 segment만 버킷화) |
| **System metrics** | SQLite `metrics_history` (cpu/memory, 1분 간격, 30일 retention) | ❌ 없음 (전역 시스템 metric만) |
| **Application logs** | `console.warn`/`console.log` (구조화 없음, Pino 미도입) | ❌ |
| **Traces** | 없음 | ❌ |
| **Rate limit metrics** | `rate_limit_buckets` (PG, key 기반) | ❌ (bucketKey가 ip/email — 다른 tenant 동일 email 충돌) |
| **Cron metrics** | 없음 (status 텍스트만, history 없음) | ❌ |

ADR-021 §amendment-1로 audit-failure 카운터(`/api/admin/audit/health`)는 도입됐으나, **단일 테넌트 가정 위**에서 동작한다. tenant 차원 추가 없이는 N=10~20 운영자에게 "어느 tenant?"를 답할 수 없다.

### 1.3 현 metrics 인프라 정확한 위치

| 위치 | 내용 | 본 ADR과의 관계 |
|------|------|---------------|
| `src/lib/db/schema.ts` (drizzle SQLite) | `auditLogs`, `metricsHistory`, `ipWhitelist` 3개 테이블 | tenant_id 컬럼 추가 대상 (ADR-021 amendment + 본 ADR §2) |
| `src/lib/metrics-collector.ts` | `collectOnce()` 1분 간격 cpu/mem 수집, `pruneOldData()` 30일 자동 삭제 | tenant 차원 직교 (시스템 신호) — 별도 per-tenant collector 신설 |
| `src/lib/audit-metrics.ts` | in-process FIFO Map, MAX_BUCKETS=200 카디널리티 캡 | bucketName 함수에 tenant prefix 추가 (cardinality 영향 §3 분석) |
| `src/lib/audit-log-db.ts` | `safeAudit(entry, context?)` — fail-soft 단일 진입점 | AuditEntry에 tenantId 추가 + writeAuditLogDb에 자동 주입 |
| `src/app/api/admin/audit/health/route.ts` | ADMIN-only JSON endpoint | tenant filter 쿼리 파라미터 추가 + Operator Console 재활용 |

**핵심 발견**: 인프라는 이미 있다 (SQLite + audit + metrics 카운터 + admin endpoint). **tenant 차원 1개 추가 + Operator Console 1개 추가**로 N=20까지 1차 가시성 확보 가능.

### 1.4 ADR-021과의 호환성 검토 (필수 분석)

ADR-021은 다음 invariant를 정식화:

> "감사 로그는 cross-cutting 관심사이며, 도메인 임계 경로(인증/세션/CRUD)의 응답을 절대 깨뜨리지 않는다."

본 ADR은 **이 invariant를 100% 보존**한다. tenant_id 추가는 다음 두 변경만 요구:

1. **Schema amendment** — `audit_logs.tenant_id` (TEXT, nullable) + `idx_audit_logs_tenant_time` 인덱스. drizzle migration 추가 (ADR-021 §2.2 self-heal 메커니즘이 그대로 적용 — `applyPendingMigrations()`).
2. **safeAudit 자동 주입** — 호출자(11개 콜사이트) 시그니처는 변경하지 않는다. `safeAudit(entry, context?)` 내부에서 인증 컨텍스트(JWT 또는 cookie session)에서 tenantId를 읽어 entry.tenantId에 자동 주입. tenantId 부재 시(미인증/시스템 cron) `"_system"` sentinel 값.

**11개 콜사이트 영향**: 0건. 시그니처 불변 + 자동 주입 → ADR-021 §2.3 sweep된 11개 라우트는 변경 불요. 단, ADR-027(JWT) + ADR-026(Tenant Registry)이 먼저 결정되어야 자동 주입 메커니즘이 가능 — **본 ADR은 ADR-026/027 결정 후 구현 단계 진입**.

### 1.5 OpenTelemetry 도입 비용 (필수 분석 — ADR-002 trade-off)

ADR-002는 "선별 OSS 채택 + 의존성 최소" 전략. OpenTelemetry SDK는:

| 차원 | 비용 |
|------|------|
| **의존성 추가** | `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, exporter 1개 → 4개 패키지, ~15MB node_modules |
| **런타임 오버헤드** | auto-instrumentation은 모든 HTTP/PG/SQLite 호출 wrap → p99 +5~10ms (Phase 16 KPI p95 200ms 기준 2.5~5%) |
| **collector 인프라** | OTel collector 별도 프로세스 또는 stdout exporter. WSL2 단일 서버에서 collector를 PM2 별도 앱으로 운영 (~50MB RSS 추가) |
| **학습 곡선** | TraceContext 전파, span 수동 계측, sampling 정책 — 1인 운영자가 운영하면서 학습 가능한 수준이지만 즉시 채택 시 디버깅 비용 |
| **장점** | 표준 protocol — 향후 SaaS(Grafana Cloud, Datadog, Honeycomb) 무중단 전환 가능. trace correlation으로 cross-tenant 유출 디버깅 강력 |

**ADR-002 trade-off 결론**: Phase 1~3에서 OTel 도입은 **과잉**. 현재 audit/metrics 인프라가 이미 있고, tenant 차원만 추가하면 1차 가시성 충족. **Phase 4(N=10 도달 또는 trace correlation 필요 시점)에 OTel SDK + collector 도입**을 트리거 기반으로 예약 (§6 트리거 D).

### 1.6 Multi-tenant cardinality 실제 부담 (필수 분석)

**산정 근거**: N=20 tenant × 100 metric × 100 series = **200,000 series** (요구 사항 산정).

이는 Prometheus on disk 기준 200KB/series × 200K = 40MB (현재 구조 기준). 그러나 yangpyeon의 실제 부담은 다르다:

#### 1.6.1 SQLite metrics_history 부담

현재 `metrics_history`: cpu/mem 2 metric × 1분 간격 × 30일 = 86,400 row. tenant 차원 추가 시:
- N=20 × 86,400 = **1,728,000 row/30일** — SQLite WAL 모드에서 충분히 처리 가능 (벤치 1M row 쿼리 ~50ms p95)
- 단, **현 metrics-collector는 시스템 전역 신호** (process 단위 cpu/mem) — tenant당 process 분리 없음. 본 ADR은 **per-tenant application metric**(API 호출 수, 쿼리 시간, cron 성공률) 신규 테이블 신설 제안

#### 1.6.2 Audit-metrics in-process 카운터 부담

`audit-metrics.ts` MAX_BUCKETS=200 캡. tenant 차원 추가 시:
- bucketName: `<tenantId>:<context_first_2_seg>` → N=20 × 평균 context 50 = 1,000 bucket → **MAX_BUCKETS 200 초과**
- **대응**: MAX_BUCKETS를 1,000으로 상향 + tenant 차원 분리(`byTenant` Map + `byTenantBucket` 중첩 Map). PM2 reload 시 어차피 리셋되는 in-process 카운터이므로 메모리 부담 미미 (2KB/bucket × 1,000 = 2MB)

#### 1.6.3 Audit_logs 테이블 부담

현재 audit_logs는 단일 테이블. N=20 tenant × 평균 일 1,000 entry = 20,000 entry/day → **6.0M entry/회전 90일**. SQLite로 충분 (인덱스 `(tenant_id, timestamp DESC)` 추가 시 tenant별 조회 p95 ~10ms).

#### 1.6.4 결론 — SQLite로 N=20까지 가능

200,000 series가 Prometheus 가정이라면, SQLite에서는 **1.7M row/30일**이 실측 부담. 이는 WAL+인덱스로 충분히 견딘다. **N=20까지 SQLite 단독 가능**. **N=50+ 또는 series cardinality 폭증 시 Prometheus 전환** (§6 트리거 C).

### 1.7 Wave 4 04-observability-blueprint.md와의 호환

Phase 16 청사진(20h)은:
- VaultService (envelope encryption)
- JWKSService (ES256)
- LoggingService (Pino)
- MetricsService (SQLite metrics_history 5초)
- Infrastructure 페이지 (PM2/PG/디스크/Tunnel SSE)

본 ADR은 Phase 16 청사진의 **MetricsService를 per-tenant로 확장 + LoggingService에 tenantId 차원 추가**. Vault/JWKS는 직교 (tenant 격리는 ADR-027). **청사진 폐기 없음 + 12h 추가** (Phase 16 합계 32h).

---

## 2. 결정해야 할 것 (Decision Required)

3 pillars(Metrics / Logs / Traces) 각각에 대해 옵션을 선택하고, 단계별 진화 경로를 확정한다.

### 2.1 Metrics 옵션

#### 옵션 M1: SQLite 자체 — 현재 metrics.sqlite 패턴 확장 + tenant_id 컬럼

**구체화**:
- 기존 `metrics_history` 테이블에 `tenant_id` 컬럼 추가 (시스템 전역 metric은 `_system`)
- 신규 테이블 `tenant_metrics_history`: tenant당 application metric (api_calls, query_p95, cron_success_rate, edge_fn_invocations, error_count)
- 1분 aggregate 우선, raw event는 별도 테이블 7일 retention
- 인덱스: `(tenant_id, metric_name, timestamp DESC)`

**장점**: 인프라 추가 0, ADR-002 호환, drizzle 마이그레이션 1개로 끝, ADR-021 self-heal 메커니즘 재사용
**단점**: 표준 PromQL 부재, Grafana 직결 불가 (자체 UI만), N=50+에서 SQLite 한계
**N=20 cardinality**: △ (1.7M row/30일 — 가능하지만 인덱스 신중 설계 필요)
**1인 운영 적합**: ✅

#### 옵션 M2: Prometheus + Grafana 자체 호스팅

**구체화**:
- Prometheus 1개 + Grafana 1개를 PM2 별도 앱(또는 docker-compose)으로 운영
- yangpyeon에 `/metrics` endpoint (prom-client 라이브러리) 추가
- tenant_id를 metric label로

**장점**: 표준 PromQL, Grafana 대시보드 풍부, alerting 표준 (Alertmanager)
**단점**: 인프라 +2개 프로세스 (PM2 luckystyle4u-server + Prometheus + Grafana = 3개), ADR-001 §3.2의 "단일 PM2" 가정과 충돌, 운영 부담 +30%
**N=20 cardinality**: ✅ (Prom 본업)
**1인 운영 적합**: △ (운영 부담)

#### 옵션 M3: OpenTelemetry SDK + 자체 collector (PG/SQLite 저장)

**구체화**:
- `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http`
- OTel collector PM2 별도 앱 (혹은 Next.js 동일 프로세스 내장)
- exporter는 PG 또는 SQLite custom exporter

**장점**: 표준 protocol, 향후 SaaS 무중단 전환 가능, trace correlation
**단점**: 의존성 4개 추가 (~15MB), p99 +5~10ms, 학습 곡선
**N=20 cardinality**: ✅
**1인 운영 적합**: ✅ (collector를 단일 프로세스로 통합 시)

#### 옵션 M4: 외부 SaaS (Datadog / Grafana Cloud / Honeycomb)

**구체화**:
- OTel SDK + SaaS exporter (Datadog API key 등)
- yangpyeon은 코드 변경만, 인프라 0

**장점**: 운영 부담 0 (매니지드), 즉시 가시성, alerting/대시보드 완성품
**단점**: 비용 (Grafana Cloud Free tier 10K series, Datadog $15/host/mo+), 데이터 주권 일부 외부 위탁 (ADR-022 §1.4 "데이터 주권 100%" 보존 약화)
**N=20 cardinality**: ✅ (SaaS 본업)
**1인 운영 적합**: ✅ (비용 OK 시 최단 경로)

### 2.2 Logs 옵션

#### 옵션 L1: 현재 audit_logs (Drizzle SQLite) 확장 — tenant_id 컬럼

**구체화**:
- audit_logs.tenant_id 컬럼 추가 + idx_audit_logs_tenant_time
- safeAudit 내부 자동 주입 (시그니처 불변)
- ADR-021 fail-soft 100% 보존
- application log는 별도 — 본 옵션은 audit/security log만

**장점**: 인프라 0, ADR-021 amendment로 처리 가능, 11개 콜사이트 변경 0
**단점**: application log(stdout/stderr) 미포함 — 디버깅 시 PM2 logs grep
**N=20 cardinality**: ✅ (6M entry/90일 SQLite OK)
**1인 운영 적합**: ✅

#### 옵션 L2: file-based + Vector/Fluentbit 수집

**구체화**:
- Pino → JSON Lines file (`/var/log/yangpyeon/<tenant_id>/app.log`)
- Vector(Rust, ~10MB) → SQLite 또는 Loki 전송

**장점**: 표준 collector, 향후 Loki 전환 용이
**단점**: 인프라 +1 (Vector 프로세스), 디스크 회전 정책 운영, ADR-002 위배
**N=20 cardinality**: ✅
**1인 운영 적합**: △

#### 옵션 L3: PG audit_logs 테이블 (별도 schema)

**구체화**:
- audit_logs를 PG로 마이그레이션 (ADR-021 §2.4가 보류한 옵션)
- tenant_id를 RLS 차원으로 활용 가능

**장점**: ADR-023(데이터 격리)과 통합 가능, RLS 무료, 트랜잭션 안의 audit (컴플라이언스)
**단점**: ADR-021 §2.4가 명시적으로 보류 (백업/리텐션 정책 재설계 필요), SQLite 격리 의도 폐기
**N=20 cardinality**: ✅
**1인 운영 적합**: △ (재설계 부담)

### 2.3 Traces 옵션

#### 옵션 T1: 없음 (현재)

**장점**: 비용 0
**단점**: cross-tenant 유출 디버깅 불가능, p99 latency root cause 추적 불가
**1인 운영 적합**: ✅ (Phase 1~3 한정)

#### 옵션 T2: OpenTelemetry SDK + Jaeger/Tempo

**장점**: 표준, 강력한 디버깅 도구
**단점**: 인프라 +1 (Jaeger 또는 Tempo), 학습 곡선
**1인 운영 적합**: △

#### 옵션 T3: 자체 trace ID + correlation ID 패턴

**구체화**:
- `x-request-id` header에서 추출 또는 server-side `crypto.randomUUID()`
- 모든 audit log + console.log + DB 쿼리에 traceId 주입
- traceId로 PG/SQLite/PM2 logs를 grep 가능

**장점**: 의존성 0, ADR-002 호환, 즉시 효과 (correlation만으로도 디버깅 70% 해결)
**단점**: distributed trace의 timeline 시각화 부재
**1인 운영 적합**: ✅

### 2.4 Cardinality 폭주 방지 (필수 결정)

tenant_id를 첫 dimension으로 추가하면 series cardinality가 N=20배 증가. 다음 정책을 본 ADR로 확정:

#### 정책 C1: Metric label cardinality 한도

```yaml
limits:
  per_tenant_per_metric_max_series: 100   # tenant 1개당 metric 1종류 최대 100 unique label combo
  global_max_unique_metrics: 50            # 전체 metric 종류 50개 (예: api_calls, query_duration, ...)
  effective_cap: 20 (tenant) × 50 (metric) × 100 (series) = 100,000 series
```

audit-metrics.ts의 MAX_BUCKETS=200을 다음으로 확장:
```ts
const MAX_TENANTS = 50;            // tenant slot
const MAX_BUCKETS_PER_TENANT = 100;
// 총 5,000 bucket 가능, 메모리 ~10MB
```

#### 정책 C2: 자동 sampling (tenant별 quota)

per-tenant 호출량이 임계 초과 시 raw event sampling:
```yaml
sampling:
  default_rate: 1.0              # 100% sampling
  high_volume_rate: 0.1          # tenant 호출량 > 10K/min 시 10%로 down-sample
  threshold_calls_per_min: 10000
```

#### 정책 C3: aggregate 우선 + raw event 단기 보존

| 종류 | retention | 저장소 |
|------|-----------|--------|
| Raw event (audit log row) | **90일** | SQLite audit_logs (ADR-021 보존) |
| Per-minute aggregate (metric) | **30일** | SQLite tenant_metrics_history (1분 bucket) |
| Per-hour aggregate | **1년** | SQLite tenant_metrics_aggregates_hourly |
| Per-day aggregate | **5년** | SQLite tenant_metrics_aggregates_daily |

raw event 폭주는 retention 단축으로 흡수, 장기 추세는 aggregate로 보존.

### 2.5 SLO 정의 패턴 (필수 결정)

per-tenant SLO를 코드로 표현 가능한 양식 채택:

```yaml
# /config/slos/<tenant>.yml (또는 DB tenant_slos 테이블)
tenant: almanac
slos:
  - name: api-availability
    target: 99.5%
    indicator: success_rate
    window: 30d
    breach_alert: warn       # warn | page | none
  - name: cron-success-rate
    target: 95%
    indicator: cron_job_success / cron_job_total
    window: 7d
    breach_alert: warn
  - name: api-latency-p95
    target: 200ms
    indicator: api_duration_p95
    window: 7d
    breach_alert: page
  - name: edge-fn-error-rate
    target: <1%
    indicator: edge_fn_error / edge_fn_total
    window: 1d
    breach_alert: warn
```

SLO 위반 시:
- `breach_alert: warn` — Operator Console에 빨간 ROW + audit_logs 기록
- `breach_alert: page` — (Phase 4) 외부 알림 (Slack/Telegram webhook)

### 2.6 Operator Console 1순위 화면 (필수 결정)

`/dashboard/operator/health` (ADMIN-only):

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  TENANT HEALTH OVERVIEW                                Last refresh: 12:34:56  │
├─────────┬────────┬───────────┬────────────┬──────────────┬──────────────────────┤
│ tenant  │ status │ err_rate  │ p95_lat    │ cron_success │ last_error           │
│         │        │ (1h)      │ (1h)       │ (24h)        │                      │
├─────────┼────────┼───────────┼────────────┼──────────────┼──────────────────────┤
│ almanac │ 🔴 BAD │ 12.3%     │ 1,200ms    │ 78%          │ 12:30 cron timeout   │
│ kdy     │ 🟢 OK  │ 0.1%      │ 45ms       │ 100%         │ -                    │
│ blog    │ 🟡 WRN │ 0.8%      │ 230ms      │ 100%         │ 11:45 SQL slow query │
│ shop    │ 🟢 OK  │ 0.0%      │ 38ms       │ 100%         │ -                    │
│ ...     │        │           │            │              │                      │
└─────────┴────────┴───────────┴────────────┴──────────────┴──────────────────────┘

Summary: 1 BAD / 1 WRN / 18 OK    [Click 🔴 ROW → tenant detail]
```

**필수 요건**:
- 모든 tenant ROW 한 페이지 (10~20 ROW)
- 각 ROW 5초 SSE refresh
- status 색깔: BAD(빨강) — SLO 위반 ≥1, WRN(노랑) — SLO 임계값 80%~100%, OK(초록) — 정상
- ROW 클릭 → `/dashboard/operator/tenants/<tenant_id>` (drill-down)
- **빨간 ROW가 자동 상단 정렬** — 운영자가 30초 안에 "어느 tenant?" 답 가능

**구현 비용**: ~12h (Phase 16 추가) — 기존 metrics_history + audit_logs + SLO 양식 활용

### 2.7 Tenant Console (옵션, Phase 3 도입)

컨슈머가 자기 tenant 상태를 직접 볼 수 있는 페이지:
- URL: `https://stylelucky4u.com/t/<tenant>/observability`
- 권한: 해당 tenant의 멤버만 (ADR-026 멤버십 모델 종속)
- 표시: 자기 tenant의 SLO + 최근 24h 오류 + cron 이력
- **운영자 본인 소유 N개 프로젝트만 사용한다면 본 옵션은 Phase 3까지 보류 가능**. 단, 디버깅 시 운영자도 tenant 시점으로 보고 싶을 때 유용.

---

## 3. 옵션 비교 매트릭스 (3 pillars 종합)

| 조합 | 인프라 추가 | 구현 부담 | N=20 cardinality | 1인 운영 적합 | 비용/월 |
|-----|-----------|---------|------------------|--------------|--------|
| **M1+L1+T3 (SQLite-only)** | 없음 | **저** | △ (1.7M row OK) | ✅ | $0 |
| M1+L1+T2 (SQLite + Jaeger) | 중 (Jaeger 1) | 중 | △ | △ | $0 |
| **M3+L1+T2 (OTel collector)** | 중 (collector 1) | 중 | ✅ | ✅ | $0 |
| M2+L2+T2 (Prom+Grafana+Vector+Jaeger) | **고 (3+)** | 고 | ✅ | △ | $0 |
| **M4 (SaaS Datadog/Grafana Cloud)** | 없음 | 저 | ✅ | ✅ (비용 OK 시) | $15~50/월 |
| M4 (Grafana Cloud Free) | 없음 | 저 | △ (Free 10K series) | ✅ | $0 |

### 3.1 권고

**Phase 1~3 (현재~N=10 진입 직전): M1+L1+T3 (SQLite-only)**
- 인프라 0, ADR-021 amendment + Operator Console 12h로 구현 가능
- 현재 audit/metrics 인프라 100% 재활용
- 1인 운영 즉시 가능

**Phase 4 (N=10 도달 또는 trace correlation 필요 시): M3+L1+T2 (OTel + Jaeger)**
- 표준 protocol로 진화 — 향후 SaaS 무중단 전환 가능
- collector를 단일 프로세스로 통합하면 운영 부담 +1만

**비용 OK 시 즉시 옵션 (대안)**: **M4 (Grafana Cloud Free / Datadog)** — 가장 빠른 가시성, 1인 운영 부담 최소. 단 ADR-022 §1.4 "데이터 주권 100%" 보존이 약화되므로 운영자 결정 필요.

---

## 4. 단계별 채택 경로 (Phased Adoption)

### Phase 1 (즉시 — Phase 14.5 내, ~16h)

**범위**: M1+L1+T3 + Operator Console 1순위 화면

| 작업 | 공수 |
|------|------|
| 1. drizzle migration: audit_logs.tenant_id 컬럼 추가 + 인덱스 | 1h |
| 2. ADR-021 §amendment-2: safeAudit 내부 tenantId 자동 주입 (시그니처 불변) | 2h |
| 3. tenant_metrics_history 테이블 신설 + drizzle migration | 2h |
| 4. metrics-collector.ts 확장: per-tenant API call/query/cron metric 수집 | 4h |
| 5. audit-metrics.ts 확장: byTenant 차원 추가 (MAX_TENANTS=50, MAX_BUCKETS_PER_TENANT=100) | 2h |
| 6. `/api/admin/audit/health` 확장: tenant query param 지원 | 1h |
| 7. `/api/admin/operator/health` 신규 endpoint (전체 tenant aggregate) | 2h |
| 8. `/dashboard/operator/health` UI (10~20 ROW) | 4h (대시보드 부분) |
| **합계** | **~18h** |

→ Phase 16 청사진(20h) + 본 ADR Phase 1(18h) = **Phase 16 합계 38h**

### Phase 2 (~Phase 17 내, ~12h)

**범위**: SLO 양식 + breach detection + correlation ID

| 작업 | 공수 |
|------|------|
| 1. tenant_slos 테이블 + CRUD endpoint | 3h |
| 2. SLO breach detection cron (1분 간격) | 4h |
| 3. correlation ID 미들웨어 (모든 request에 x-request-id 주입) | 2h |
| 4. audit-logs.trace_id 컬럼 추가 + safeAudit 자동 주입 | 2h |
| 5. Operator Console: SLO breach 표시 + drill-down | 1h |
| **합계** | **~12h** |

### Phase 3 (~Phase 19~20 내, ~16h, 선택)

**범위**: Tenant Console + raw log search

| 작업 | 공수 |
|------|------|
| 1. `/t/<tenant>/observability` UI (tenant 멤버 권한) | 6h |
| 2. audit_logs 텍스트 검색 endpoint (FTS5 인덱스) | 3h |
| 3. tenant 멤버 알림 (slack webhook 등록) | 4h |
| 4. retention 정책 자동화 (aggregate roll-up cron) | 3h |
| **합계** | **~16h** |

### Phase 4 (트리거 D 발동 시 — N=10 또는 trace 필요, ~30h)

**범위**: OpenTelemetry SDK + collector + Jaeger

| 작업 | 공수 |
|------|------|
| 1. `@opentelemetry/sdk-node` + auto-instrumentation 도입 | 4h |
| 2. OTel collector PM2 앱 또는 내장 모드 결정 + 구성 | 6h |
| 3. SQLite custom exporter (또는 Jaeger 도입) | 8h |
| 4. tenant_id를 ResourceAttribute로 주입 | 3h |
| 5. 기존 audit-metrics를 OTel metric으로 마이그레이션 (병기 → 전환) | 6h |
| 6. operator console에서 OTel data source 통합 | 3h |
| **합계** | **~30h** |

### 4.1 단계별 누적 공수

| 단계 | Phase | 누적 시간 | 누적 인프라 추가 |
|------|-------|----------|---------------|
| Phase 1 | Phase 14.5/16 | 18h | 0 (SQLite 재사용) |
| Phase 2 | Phase 17 | 30h | 0 |
| Phase 3 | Phase 19~20 | 46h | 0 (Tenant Console만) |
| Phase 4 | 트리거 D | 76h | +1 (OTel collector or Jaeger) |

ADR-022 §6.2의 Phase 16 +12h 추정과 본 ADR Phase 1(18h) 차이 +6h는 Operator Console 비용. 합리적 범위 내.

---

## 5. 결정 (Decision)

**ACCEPTED (2026-04-26 세션 58): M1+L1+T3 + Phase 4 OTel 진화**

**Phase 1~3 (즉시)**:
- M1: SQLite metrics 확장 (현재 metrics-collector.ts + audit-metrics.ts 패턴) + tenant_id 차원
- L1: ADR-021 audit_logs (Drizzle) + tenant_id 컬럼 amendment-2 (safeAudit 시그니처 불변, 11개 콜사이트 변경 0건)
- T3: 자체 trace ID + correlation ID 패턴 (X-Request-Id 헤더 + AsyncLocalStorage)

**Phase 4 (N=10 도달 또는 incident 트리거)**:
- M3: OpenTelemetry SDK + collector
- T2: Jaeger/Tempo (분산 trace)
- L1 유지 (audit는 SQLite 계속)

**Cardinality 정책 (즉시)**:
- C1: per_tenant_per_metric 100 series 한도
- C2: 자동 sampling (tenant별 quota 초과 시)
- C3: aggregate 우선 (raw event 단기 보존, aggregate 장기)

**SLO 양식**:
- yaml 정의 + `tenant_slos` 테이블 (Drizzle)
- 예: api-availability 99.5% / cron-success-rate 95%

**Operator Console (Phase 14.5 즉시 18h)**:
- 모든 tenant health 한눈에 (10~20 ROW)
- error rate 1h, p95 latency, cron success rate, last_error
- 30초 안에 "지금 어느 tenant가 아픈가" 답 가능

**ADR-021 amendment-2 트리거**: audit_logs 테이블에 tenant_id 컬럼 추가. safeAudit() 시그니처 불변, 내부 자동 주입. 11개 콜사이트 변경 0건. ADR-021 본문에 §amendment-2 1줄 추가 필요.

---

## 6. 재검토 트리거

### 6.1 트리거 A: SQLite metrics 한계 도달

```
조건: tenant_metrics_history row 수 > 5M OR p95 쿼리 > 100ms (sustained 1주)
측정: SQLite EXPLAIN QUERY PLAN + slow query log
대응: aggregate 정책 강화 (raw retention 단축) → 미해결 시 Phase 4 OTel/Prometheus 전환 가속
```

### 6.2 트리거 B: in-process audit-metrics 카운터 메모리 초과

```
조건: audit-metrics state 메모리 > 50MB OR PM2 RSS 증가율 > 10%/주
측정: process.memoryUsage().heapUsed
대응: MAX_TENANTS/MAX_BUCKETS_PER_TENANT 캡 강화 + FIFO evict 전략 검토
```

### 6.3 트리거 C: Cardinality 폭주

```
조건: 단일 tenant의 unique series 수 > 200 (정책 C1 위반) 발생률 > 1회/주
측정: audit-metrics state.byTenant[<id>].size
대응: bucketName 정규화 강화 (segment 1개로 축약) → 미해결 시 Prometheus 전환
```

### 6.4 트리거 D: Trace correlation 필요성 증가

```
조건: 다음 중 하나
  (a) cross-tenant 유출 의심 인시던트 발생 (N=1+)
  (b) p99 latency 디버깅에서 root cause 식별 실패가 월 3회+
  (c) tenant 수 N ≥ 10 도달
측정: 인시던트 로그, 디버깅 세션 기록
대응: Phase 4 (OpenTelemetry SDK + Jaeger) 즉시 진입
```

### 6.5 트리거 E: SaaS 비용 정당화

```
조건: 1인 운영 시간 비용이 SaaS 비용 초과
측정: 본 ADR Phase 4 OTel 자체 운영 30h × 시급 vs Datadog $15/host/mo × 12 = $180/년
대응: 비용 비교가 명확히 SaaS 우위 시 옵션 M4 즉시 전환 (코드는 OTel 표준이므로 exporter만 교체)
```

---

## 7. 영향 (Impact)

### 7.1 ADR-021 amendment 필요 사항 (필수)

ADR-021 본문 §2.1에 `tenantId` 자동 주입 amendment 추가:

```diff
 ### 2.1 불변식 — Cross-cutting fail-soft (L3)

 **감사 로그는 cross-cutting 관심사이며, 도메인 임계 경로(인증/세션/CRUD)의 응답을 절대 깨뜨리지 않는다.**

 - 모든 도메인 라우트는 `safeAudit(entry, context?)` 만 사용 (`src/lib/audit-log-db.ts`).
 - `writeAuditLogDb` 는 internal 으로 마킹 — 직접 호출 금지 (테스트/CLI 제외).
 - 실패 시 `console.warn` 으로 err 객체(message/stack) 노출 + 호출자에게는 throw 안 함.
+- **(ADR-029 §amendment-2)** safeAudit 내부에서 인증 컨텍스트로부터 `tenantId` 자동 주입.
+  미인증 또는 시스템 cron 호출 시 `"_system"` sentinel. 11개 콜사이트 시그니처 불변.
```

§2.2 빌드 게이트는 영향 없음 (drizzle migration 1개만 추가, self-heal 메커니즘 그대로).

### 7.2 영향 받는 코드 파일

| 파일 | 변경 종류 | 변경 내용 |
|------|---------|---------|
| `src/lib/db/schema.ts` | amendment | audit_logs.tenantId, metrics_history.tenantId, 신규 tenant_metrics_history, tenant_slos |
| `src/lib/audit-log.ts` | amendment | AuditEntry interface에 tenantId 추가 |
| `src/lib/audit-log-db.ts` | amendment | safeAudit 내부 tenantId 자동 주입 + writeAuditLogDb에 컬럼 매핑 |
| `src/lib/audit-metrics.ts` | amendment | byTenant Map 추가 + MAX_TENANTS/MAX_BUCKETS_PER_TENANT 캡 |
| `src/lib/metrics-collector.ts` | extend | per-tenant API/query/cron metric 수집 함수 추가 |
| `src/app/api/admin/audit/health/route.ts` | extend | tenant query param 지원 |
| `src/app/api/admin/operator/health/route.ts` | **신규** | 전체 tenant aggregate endpoint |
| `src/app/dashboard/operator/health/page.tsx` | **신규** | Operator Console 1순위 화면 |
| `src/lib/db/migrations/00xx_audit_tenant.sql` | **신규** | audit_logs.tenant_id 추가 |
| `src/lib/db/migrations/00xx_tenant_metrics.sql` | **신규** | tenant_metrics_history 테이블 |

### 7.3 SLO 양식 결정 시 추가 파일

- `src/lib/db/schema.ts`: tenantSlos 테이블
- `src/app/api/admin/tenants/[id]/slos/route.ts`: SLO CRUD
- `src/lib/cron/slo-breach-detector.ts`: 1분 간격 SLO 위반 검사
- `src/lib/db/migrations/00xx_tenant_slos.sql`

### 7.4 ADR-022 Phase 16 공수 영향

ADR-022 §6.2는 Phase 16 +12h 추정. 본 ADR Phase 1은 18h → **+6h 차이**. 구체화하면 Operator Console UI 비용. 운영 가치 (30초 안에 "어느 tenant?" 답) 대비 합리적.

---

## 8. 보존되는 ADR-021 invariant (재확인)

본 ADR이 도입한 변경이 ADR-021 invariant를 위배하지 않음을 명시:

| ADR-021 항목 | 본 ADR 영향 | 보존 여부 |
|-------------|------------|---------|
| §2.1 cross-cutting fail-soft | safeAudit 내부 tenantId 자동 주입 시 throw 가능성? | ✅ 보존 — 자동 주입 실패 시 `"_system"` fallback, throw 금지 |
| §2.2 빌드 게이트 + self-heal | drizzle migration 1개 추가 | ✅ 보존 — `applyPendingMigrations()` 자동 적용 |
| §2.3 패턴 sweep 11 콜사이트 | 시그니처 불변 (자동 주입) | ✅ 보존 — 11 콜사이트 변경 0 |
| §2.4 SQLite vs PG 보류 | 본 ADR도 SQLite 유지 | ✅ 보존 — §6 트리거에서 PG 전환은 별도 ADR |
| §amendment-1 audit-failure 카운터 | byTenant 차원 추가 | ✅ 강화 — tenant별 failureRate 식별 가능 |

---

## 9. 명시적으로 결정하지 않은 것 (Out of Scope)

| 항목 | 위임 |
|------|------|
| Tenant 단위 명칭 (tenant / project / workspace) | ADR-026 |
| Tenant 인증 메커니즘 (JWT aud / cookie context) | ADR-027 |
| RLS 통한 tenant 격리 | ADR-023 |
| Cron 격리 시 cron metric 차원 정의 | ADR-028 (본 ADR과 통합 — cron job 메트릭에 tenant_id) |
| Edge Function 정책 차원 (per-tenant fetch host whitelist) | ADR-024 |
| 알림 채널 (Slack/Telegram/Email) 구체 통합 | Phase 3+ 별도 결정 |
| Distributed tracing의 cross-process 전파 (PM2 cluster:4 도입 시) | Phase 4 OTel 도입 시 결정 |
| Tenant별 백업/복구 전략 | ADR-025 (인스턴스 모델) |

---

## 10. 참고 (References)

### 10.1 인용 문서

- **ADR-021 본문**: `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md`
  - §2.1 (L29~34): cross-cutting fail-soft invariant
  - §2.2 (L38~46): 빌드 게이트 + self-heal
  - §2.3 (L49~57): 11개 콜사이트 sweep
  - §2.4 (L59~60): SQLite vs PG 보류
  - §amendment-1 (L105~152): audit-failure 카운터 메트릭

- **기존 결정 감사**: `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md`
  - §1.7 (L51~54): 현 audit 단일 테넌트 가정
  - §3 (L100): ADR-021 amendment 필요 명시

- **현 코드 감사**: `docs/research/baas-foundation/00-context/02-current-code-audit.md`
  - §6 (L113~133): audit/rate-limit 차원 부재 분석

- **ADR-022**: `docs/research/baas-foundation/01-adrs/ADR-022-baas-identity-redefinition.md`
  - §6.2 Phase 16 +12h 추정 (본 ADR Phase 1 18h로 확대)

- **Wave 4 Observability Blueprint**: `docs/research/2026-04-supabase-parity/02-architecture/04-observability-blueprint.md`
  - §1.3 Phase 16 MVP 범위 (~20h) — 본 ADR이 +18h 확장
  - §3.4 LoggingService Pino — 본 ADR Phase 2 correlation ID 통합 대상
  - §3.5 MetricsService SQLite — 본 ADR Phase 1 per-tenant 확장 기반

### 10.2 코드 위치 (수정 대상)

- `src/lib/db/schema.ts` — drizzle SQLite 스키마 3 테이블 (audit_logs, metrics_history, ip_whitelist)
- `src/lib/audit-log.ts` (L4~13) — AuditEntry interface
- `src/lib/audit-log-db.ts` (L85~100) — safeAudit 단일 진입점
- `src/lib/audit-metrics.ts` (L13, L37) — MAX_BUCKETS=200 + freshState
- `src/lib/metrics-collector.ts` (L29~48) — collectOnce()
- `src/app/api/admin/audit/health/route.ts` — ADMIN endpoint

### 10.3 외부 표준 참고

- **OpenTelemetry Semantic Conventions for Tenancy**: `tenant.id` resource attribute (Phase 4 도입 시 채택)
- **Prometheus best practices on cardinality**: tenant_id를 label로 추가 시 series 수 = base × N
- **Grafana Cloud Free tier**: 10,000 series, 50GB log, 50GB trace (M4 옵션 검토 시 참고)

---

## 11. 요약 (Summary)

| 항목 | 내용 |
|------|------|
| **결정 요청** | 3 pillars 옵션 조합 + cardinality 정책 + SLO 양식 + Operator Console 채택 |
| **권고안 (Phase 1~3)** | **M1+L1+T3 (SQLite-only) + Operator Console 즉시 구축** |
| **권고안 (Phase 4)** | 트리거 D 발동 시 **M3+L1+T2 (OTel SDK + collector + Jaeger)** 진화 |
| **대안 (비용 OK 시)** | M4 (Grafana Cloud Free / Datadog) — 가장 빠른 가시성, 데이터 주권 약화 |
| **공수 (Phase 1)** | **18h** (Phase 14.5 또는 Phase 16 내) — ADR-022 추정 +12h 대비 +6h |
| **공수 (총 4 phase)** | 76h (Phase 1: 18h + Phase 2: 12h + Phase 3: 16h + Phase 4: 30h) |
| **ADR-021 영향** | **§amendment-2 추가 필요** (tenantId 자동 주입). invariant 100% 보존, 11 콜사이트 변경 0 |
| **신규 테이블** | tenant_metrics_history, tenant_slos (Phase 2) |
| **인프라 추가 (Phase 1~3)** | **0** (SQLite 재사용) |
| **인프라 추가 (Phase 4)** | +1 (OTel collector or Jaeger) |
| **Cardinality 한도** | per_tenant_per_metric 100 series / global metric 50 종 / 총 100K series |
| **Operator Console** | 10~20 ROW 1페이지, 5초 SSE, BAD/WRN/OK 색깔, 빨간 ROW 자동 상단 정렬 |
| **30초 안에 답할 수 있는가?** | ✅ Operator Console만으로 Phase 1부터 가능 |
| **결정 상태** | **ACCEPTED (2026-04-26 세션 58)** |

---

> 작성: baas-foundation 워크스트림 ADR Sub-agent #8/8
> 본 ADR은 ADR-022 옵션 A 채택 + ADR-026/027 결정을 가정 (tenantId 발급/해석 메커니즘 종속)
> 채택 시 즉시 후속: ADR-021 §amendment-2 작성 + drizzle migration 2개 + Operator Console 18h 구현
