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
