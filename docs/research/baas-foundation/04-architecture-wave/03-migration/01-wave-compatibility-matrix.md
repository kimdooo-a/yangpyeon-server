# 01 — Wave 1~5 호환성 매트릭스

> 작성: 2026-04-26 (BaaS Foundation Architecture Wave Sub-wave C)
> 위치: `docs/research/baas-foundation/04-architecture-wave/03-migration/01-wave-compatibility-matrix.md`
> 자매 문서: [00-migration-strategy.md](./00-migration-strategy.md)
> 입력: [supabase-parity Wave 1~5 README](../../../2026-04-supabase-parity/README.md), [00-context/01-existing-decisions-audit.md](../../00-context/01-existing-decisions-audit.md), [01-adrs/ADR-022~029](../../01-adrs/)
> 목적: Wave 1~5 (123 문서 / 106,588줄 / 8 spike) 산출물이 멀티테넌트 BaaS 전환 후 어디까지 그대로 유효하고, 어디가 retrofit 필요한지 점검.

---

## 0. 한 줄 요약

Wave 1~5 산출물 **123개 중 100% 점수·아키텍처 결정 보존**. 멀티테넌트 영향은 (a) ADR 5건 amendment, (b) Phase 14.5 신규 삽입 (~80~120h), (c) 7개 Blueprint에 tenant 차원 주입 절(節) 추가, (d) 6개 spike 결과의 'tenant 차원' 주석. **역방향 폐기는 0건** — 14 카테고리 점수 그대로 유지.

---

## 1. 기존 Wave 1~5 산출물 (123 문서, 106,588줄) 호환성 점검

### 1.1 Wave별 누적 점검표

| Wave | 핵심 결정 | 멀티테넌트 영향 | retrofit 필요? |
|------|----------|----------------|---------------|
| **Wave 1** (33 문서, 26,941줄) | 14 카테고리 1순위 채택 + 9 spike GO | 점수 무영향 — **모든 1순위 기술이 멀티테넌트와 직교**. 단 Wave 1 deep-dive 일부에 "단일 사용자 가정" 표현 잔재. | **NO** (점수) / **YES** (표현 1줄 패치) |
| **Wave 2** (28 문서, 18,251줄) | 매트릭스 1:1 비교 (역할 분담 결론) | 비교 결론은 100% 유효. "wal2json vs supabase-realtime = 역할 분담"은 멀티테넌트에서 더 강해짐 (per-tenant slot 분리 가능). | **NO** |
| **Wave 3** (11 문서, 8,350줄) | Vision + FR/NFR + ADR-001 (single-tenant 의도적 제외) | **ADR-001이 ADR-022로 supersede**. FR 55개 중 **0개 폐기**. 페르소나 3에 "1인 운영 + N 컨슈머" 1줄 추가 (단일 사용자 페르소나 자체는 유지 — 컨슈머별로는 단일 사용자). | **YES (ADR-001 supersede header)** |
| **Wave 4** (26 문서, 32,918줄) | 14 Blueprint + 5 ADR 원칙 + 9-레이어 | ADR-018 9-레이어는 **L1/L2/L3에 tenant 차원만 주입** — 구조 무변경. Blueprint 7건에 "per-tenant 절" 추가 필요 (DB ops, observability, edge fn, realtime, storage, cron, audit). | **PARTIAL (7 Blueprint 절 추가)** |
| **Wave 5** (25 문서, 20,128줄) | 로드맵 Phase 15-22 + 31 spike 포트폴리오 + 127 KPI | Phase 15-22 순서 유지, **Phase 14.5 신규 삽입** (멀티테넌트 마이그레이션 80~120h). KPI 127건은 'per-tenant breakdown' 차원만 추가 — 폐기 0. | **PARTIAL (Phase 14.5 + KPI per-tenant 차원)** |

### 1.2 누적 합계
- **무수정 보존**: 105 문서 (85.4%)
- **헤더/표현 1~3줄 patch**: 12 문서 (9.8%)
- **절(節) 추가**: 6 문서 (4.9%)
- **폐기**: 0 문서 (0%)

---

## 2. 영향 받는 기존 ADR (ADR-001~021)

ADR 21건 중 5건 retrofit 필요. 나머지 16건은 100% 유효.

### 2.1 Retrofit 대상 5건

| ADR | 충돌 | 처리 |
|-----|-----|------|
| **ADR-001** (Multi-tenancy 의도적 제외) | 정면 충돌 — single-tenant 결정 | **ADR-022로 부분 supersede** — §3.1·§3.2.1~3.2.5·§6.1·§6.3만. 자체 호스팅·Supabase Org/Project 2단계 미도입·9-레이어 등은 보존 |
| **ADR-005** (Cron + PG advisory lock) | advisory lock key가 단일 (`'cleanup-sessions-job'` BIGINT 고정) — 멀티테넌트에서 한 tenant 큰 job이 다른 tenant 동일 jobName lock 점유 가능 | **ADR-028 amendment** (lock key per-tenant: `hash(tenantId, jobId)` 복합 BIGINT) |
| **ADR-015** (PM2 cluster:4 advisory lock) | cluster:4 4개 worker 모두 동일 advisory lock 경쟁 — single key 가정. 멀티테넌트 worker_threads pool 도입과 상호작용 | **ADR-028 amendment** (cluster + worker_threads 2층 advisory lock 분리: cluster는 tenant scope, worker_threads는 jobId scope) |
| **ADR-021** (audit_logs cross-cutting fail-soft) | audit_logs 테이블에 tenant_id 컬럼 부재 | **ADR-029 amendment-2** (tenant_id 컬럼 추가 + safeAudit 자동 주입 — 11개 콜사이트 시그니처 무변경) |
| **ADR-018** (9-레이어 아키텍처) | 단일 tenant 가정. L1 (인증), L2 (라우팅), L3 (도메인) 모두 tenant 차원 부재 | **ADR-022 §7.2가 보존 명시** + **각 ADR 022~029의 spec이 L1·L2·L3에 tenant 차원만 주입**. 9-레이어 구조 자체는 무수정 |

### 2.2 무수정 보존 16건

| ADR | 주제 | 멀티테넌트 영향 | 보존 이유 |
|-----|-----|---------------|---------|
| ADR-002 | Supabase OSS 선별 채택 전략 | 없음 | 14 카테고리 1순위 기술은 모두 멀티테넌트와 직교 |
| ADR-003 | Table Editor (TanStack v8 자체구현) | 표시 차원만 — UI 컴포넌트는 tenantId props 추가 | UI는 controller 호출 결과를 표시. 멀티테넌트 격리는 controller 책임 |
| ADR-004 | SQL Editor (supabase-studio 패턴 + monaco) | runReadonly()에 tenantId 인자 추가 (spec 변경 0줄, 호출자 책임) | 정책은 ADR-027 catch-all router에서 강제 |
| ADR-006 | Auth Core (jose JWT + Lucia 패턴) | JWT payload에 tenantId 추가 (ADR-027) | jose 라이브러리 무수정 |
| ADR-007 | Auth Advanced (TOTP + WebAuthn + Rate Limit) | rate limit bucket key에 tenantId 추가 (Stage 1 additive) | TOTP/WebAuthn은 user 차원 — tenant 차원 필요 시 user.tenantId로 자연 분리 |
| ADR-008 | Storage (SeaweedFS) | 버킷 또는 path prefix per-tenant | SeaweedFS 내부 무수정 — 양평 레이어가 path 라우팅 |
| ADR-009 | Edge Functions (isolated-vm v6 + Deno 사이드카) | ALLOWED_FETCH_HOSTS → DB `tenant_function_policies` | 3층 아키텍처 무수정 |
| ADR-010 | Realtime (wal2json + 포팅) | replication slot 1개 vs N개 — Stage 5에서 결정 | wal2json은 단일 slot에 모든 tenant CDC 포함. publication WHERE tenant_id로 분리 가능 |
| ADR-011 | Advisors (3-Layer schemalint+squawk+splinter) | 룰 적용은 PG 글로벌 — 멀티테넌트 무영향 | 룰 자체가 schema 차원 |
| ADR-012 | Data API (REST + pgmq) | path에 tenantId 자동 (ADR-027) | REST 라우터 무수정 |
| ADR-013 | Observability (node:crypto envelope + JWKS) | KEK/DEK는 글로벌 (ADR-029 옵션 M1: SQLite metrics tenant_id 컬럼만) | 암호화 자체는 tenant 비종속 |
| ADR-014 | UX Quality (AI SDK v6 + Anthropic BYOK + MCP) | tenant별 BYOK 키 보관 (Stage 5) | AI SDK는 키만 다르면 무수정 동작 |
| ADR-016 | Operations (standalone + rsync + pm2 reload) | snapshot에 모든 tenant 포함 — 분리 백업/복원은 tenant별 manifest 추가 (Stage 5) | standalone 자체 무수정 |
| ADR-017 | OAuth 보류 결정 | tenant당 OAuth 미해당 — 운영자 1명만 OAuth 사용 (closed) | 보류 결정 그대로 유효 |
| ADR-019 | Capistrano-style 배포 | ADR-020이 supersede됨 (이미 처리) | 멀티테넌트 무영향 |
| ADR-020 | standalone + rsync + pm2 reload | snapshot에 tenants 테이블 포함 — Stage 4 split 시 안전망으로 직접 활용 | **본 마이그레이션의 핵심 안전망** |

---

## 3. spike-010~016 결과 호환성

Wave 5 우선 세트 spike 7건 (SP-010~016) 중 단일테넌트 가정 위에서 검증된 것들의 멀티테넌트 변환 영향:

| Spike | 단일 테넌트 가정 | 멀티 변환 시 | 재검증 필요? |
|-------|---------------|------------|-----------|
| **SP-010** PM2 cluster:4 vs fork | advisory lock 단일 key (`hash('cleanup-sessions')`) | `hash(tenantId, jobId)` 복합 BIGINT — lock 경합 N배 증가 가능. SP-010 결과(+39.9% throughput)는 **N=20 시 +25~30%로 추정** (lock contention 증가) | **YES** — Phase 14.5 후 재실측 권장 (1h) |
| **SP-011** argon2id vs bcrypt | hash는 user 차원 — tenant 무관 | 변경 없음 (argon2id 13배 빠름 그대로) | NO |
| **SP-012** isolated-vm v6 Node v24 | cold start p95 0.9ms — 단일 tenant 함수 isolate | per-tenant function pool 도입 시 **N=20 × 평균 5 functions = 100 isolates** — RSS 추가 ~200MB 추정 | **YES** — Phase 19 진입 전 재실측 (2h) |
| **SP-013** wal2json 슬롯 (Pending) | 단일 slot으로 전체 CDC | 옵션 1: 단일 slot + publication WHERE tenant_id; 옵션 2: per-tenant slot (slot 수 증가 → PG max_replication_slots 제한) | **YES** — 옵션 결정 후 재설계 |
| **SP-014** JWKS 캐시 3분 grace | 단일 키셋 hit 99% | per-tenant 키셋 도입 시 cache key per-tenant — hit rate 동일 (각 tenant 캐시 독립) | NO (옵션 채택만 결정) |
| **SP-015** Session 인덱스 | `(userId, expiresAt)` PG p95 0.048ms | `(tenantId, userId, revoked_at, expires_at)` 복합 인덱스 재설계 | **YES** — Stage 1에서 새 인덱스로 SP-015 재실측 (1h) |
| **SP-016** SeaweedFS 50GB (Pending) | 버킷 1개 또는 path 1개 | per-tenant path prefix (`/yp-storage/<tenantId>/...`) | **YES** — Stage 5 직전 재검증 |

### 3.1 신규 spike 추천 (멀티테넌트 전환 검증용)

| Spike | 주제 | 공수 | 트리거 |
|-------|-----|------|------|
| **SP-baas-001** | Prisma Client Extension RLS GUC 설정 정확성 | 6h | Stage 1 진입 전 |
| **SP-baas-002** | worker_threads + pg-boss vs node:cron 격리 비교 | 8h | Stage 4 진입 전 |
| **SP-baas-003** | per-tenant audit_logs SQLite 인덱스 효율 (N=20) | 4h | Stage 3 진입 전 |
| **SP-baas-004** | catch-all router /api/v1/t/<tenant>/... 성능 오버헤드 | 4h | Stage 3 진입 전 |
| **SP-baas-005** | Cross-tenant leak fuzz test (N=20 × 100 random query) | 12h | Stage 4 완료 후 |

**신규 spike 합계**: 34h. 본 spike는 `docs/research/baas-foundation/03-spikes/`에 등록.

---

## 4. 14 카테고리 점수 (Wave 1) 영향

### 4.1 점수 변동 — 0건 (모두 유지)

ADR-022 §7.4 (Wave 1 점수표 무효화 금지) 권고대로:

| # | 카테고리 | Wave 1 점수 | Wave 2 점수 | 멀티테넌트 후 점수 | 변동 |
|---|---------|------------|------------|-----------------|------|
| 1 | Table Editor | 4.6/5 | 4.54/5 | 4.54/5 | = |
| 2 | SQL Editor | 4.07/5 | 4.70/5 | 4.70/5 | = |
| 3 | Schema Visualizer | 4.30/5 | 4.30/5 | 4.30/5 | = |
| 4 | DB Ops | 4.36/5 | 4.36/5 | 4.36/5 | = |
| 5 | Auth Core | 3.48/5 | 4.08/5 | 4.08/5 | = |
| 6 | Auth Advanced | 4.59/5 | 4.59/5 | 4.59/5 | = |
| 7 | Storage | 4.25/5 | 4.25/5 | 4.25/5 | = |
| 8 | Edge Functions | 4.22/5 | 4.22/5 | 4.22/5 | = |
| 9 | Realtime | 4.05/5 | 4.05/5 | 4.05/5 | = |
| 10 | Advisors | 3.94/5 | 3.95/5 | 3.95/5 | = |
| 11 | Data API | 4.29/5 | 4.29/5 | 4.29/5 | = |
| 12 | Observability | 0.87 권고도 | 0.87 권고도 | **0.89 권고도** | **+0.02** (per-tenant audit으로 SEC NFR 강화) |
| 13 | UX Quality | 0.84 권고도 | 0.84 권고도 | 0.84 권고도 | = |
| 14 | Operations | 0.87 권고도 | 0.87 권고도 | **0.89 권고도** | **+0.02** (snapshot당 N tenant 보존으로 RTO/RPO 개선) |

### 4.2 가중치 조정 가능 (선택)

ADR-022 §7.4: "14 카테고리 점수 무효화 금지 (가중치만 변경 가능)". 본 마이그레이션 후 권장 가중치:

| 카테고리 | 기존 가중치 | 권장 변경 | 이유 |
|---------|-----------|---------|------|
| Observability | 1.0 | **1.2** | per-tenant 운영 가시성이 N=20 운영의 일상적 의사결정 빈도 증가 |
| Operations | 1.0 | **1.2** | per-tenant rollback / snapshot 복원 빈도 증가 |
| Auth Advanced | 1.0 | 1.0 | 변경 없음 (TOTP/WebAuthn은 user 차원) |
| 나머지 11개 | 1.0 | 1.0 | 변경 없음 |

가중치 조정은 Phase 14.5 진입 시점에 사용자 승인 필요 (현재는 권고 보류).

---

## 5. Phase 15~22 로드맵 변경

### 5.1 기존 Phase 15-22 (Wave 5 정본, 870h)

| Phase | 주제 | 공수 | 주요 산출물 |
|-------|-----|------|-----------|
| 15 | Auth Advanced (TOTP + WebAuthn) | 22h | MFA enrollment + WebAuthn ceremony |
| 16 | Observability (envelope + JWKS) + Operations (cluster:4 + canary) | 40h | KEK/DEK + JWKS 회전 |
| 17 | Auth Core + Storage MVP | 60h | jose 마이그레이션 + SeaweedFS 통합 |
| 18 | SQL/Table Editor (14c-α~e) | 400h | monaco + TanStack v8 + RLS UI |
| 19 | Edge Functions + Realtime | 75h | isolated-vm 3층 + wal2json CDC |
| 20 | Schema Viz + DB Ops + Advisors | 198h | schemalint + node-cron + 3-Layer |
| 21 | Data API + UX Quality | 40h | REST + pgmq + AI SDK v6 |
| 22 | 마이그레이션 정리 + 인수인계 | 35-39h | Cleanup + handoff |
| **합계** | | **870h** | |

### 5.2 Phase 14.5 신규 삽입 (멀티테넌트 마이그레이션)

| Phase | 주제 | 공수 | 산출물 |
|-------|-----|------|-------|
| **14.5-A** | Stage 1 (additive) — schema + extension | 16h | prisma migrate + tenant-context.ts |
| **14.5-B** | Stage 2 (backfill) + Stage 3 (enforce) — RLS + 가드 + jwt | 38h | RLS 정책 + withTenant + catch-all router |
| **14.5-C** | Stage 4 (Almanac split) | 40h | packages/tenant-almanac/ 분리 + cron pool refactor |
| **신규 spike** | SP-baas-001~005 | 34h | RLS GUC + worker pool + cross-tenant leak fuzz |
| **검증/인수인계** | E2E 자동화 + handover | 12h | tests/migration/* + docs/handover/ |
| **합계** | | **140h** | |

### 5.3 Phase 15-22 + tenant 차원 주입 (기존 공수 +10~15%)

| Phase | 기존 | tenant 추가 | 신규 공수 |
|-------|-----|-----------|---------|
| 15 (Auth Adv) | 22h | +4h (MFA enroll에 tenantId) | 26h |
| 16 (Obs/Ops) | 40h | +12h (per-tenant metrics + snapshot 분리) | 52h |
| 17 (Auth Core/Storage) | 60h | +14h (login tenant 결정 + SeaweedFS path) | 74h |
| 18 (Editors) | 400h | +50h (RLS UI + tenant 선택기) | 450h |
| 19 (Edge Fn/Realtime) | 75h | +20h (function policy DB + per-tenant slot 결정) | 95h |
| 20 (Schema/DB Ops/Advisors) | 198h | +24h (cron pool + per-tenant backup) | 222h |
| 21 (Data API/UX) | 40h | +6h (path scope + AI BYOK per-tenant) | 46h |
| 22 (정리) | 35-39h | +12h (per-tenant 인수인계 N=2 검증) | 47-51h |
| **합계** | **870h** | **+142h** | **~1,012h** |

### 5.4 새 누적 공수

| 항목 | 공수 |
|------|------|
| 기존 Wave 5 Phase 15-22 | 870h |
| Phase 14.5 (멀티테넌트 마이그레이션) | 140h |
| Phase 15-22 + tenant 차원 추가 (+142h) | (위 합산에 포함) |
| ADR-022~029 작성 (완료) | 60h |
| Stage 5 per-tenant 추가 (N=2 → N=20, 4h × 18) | 72h |
| **합계 (Wave 1~5 + 멀티테넌트)** | **~1,142h** (95% CI: 1,050~1,250h) |

`existing-decisions-audit.md` §5의 "870h + 380~480h = ~1,250~1,350h" 추정 대비 약 10% 정밀화 (스파이크 결과 반영 + 부분 보존 비율 상향).

### 5.5 진입 순서 (강제)

```
Phase 14 (현재 위치, 세션 56까지 완료)
   ↓
Phase 14.5-A (Stage 1, 16h) ← 본 마이그레이션 시작
   ↓
Phase 14.5-B (Stage 2+3, 38h)
   ↓
Phase 14.5-C (Stage 4 Almanac split, 40h) ← Almanac v1.0 출시 후
   ↓
Phase 15 (Auth Advanced, 26h) ← tenant 차원 위에서
   ↓
... Phase 16-22
```

---

## 6. 역방향 피드백 항목

Wave 1~5 산출물을 본 마이그레이션 결정에 따라 갱신해야 할 항목:

| Wave | 문서 | 갱신 필요 사항 | 갱신 형태 |
|------|-----|---------------|---------|
| Wave 3 | `00-vision/00-product-vision.md` | "단일 사용자 도구" 표현 → "1인 운영자가 N 컨슈머 호스팅" | 헤더 1줄 + 본문 2줄 |
| Wave 3 | `00-vision/06-operational-persona.md` | 페르소나 3에 "운영자" + "컨슈머 사용자"(per-tenant) 분리 | 절 1개 추가 |
| Wave 3 | `00-vision/09-multi-tenancy-decision.md` (ADR-001 본문) | §3.1 + §3.2.1~3.2.5 + §6.1 + §6.3 상단에 supersede 헤더 | 헤더 추가 (ADR-022 §4.2-③) |
| Wave 3 | `00-vision/02-functional-requirements.md` | FR 55개 중 0개 폐기. 단 "FR 추가": "FR-tenant-1 신규 컨슈머 등록 (Stage 5 per consumer)" 등 5건 | 신규 FR 5건 추가 |
| Wave 3 | `00-vision/03-non-functional-requirements.md` | NFR-SEC.X "tenant cross-leak 0%" 추가, NFR-PERF.X "N=20 시 p95 +20% 이내" 추가 | NFR 3건 추가 |
| Wave 4 | `02-architecture/00-system-overview.md` | 9-레이어 다이어그램 L1/L2/L3에 "tenant 차원" 라벨 | 다이어그램 갱신 + 본문 1절 |
| Wave 4 | `02-architecture/02-data-model-erd.md` | 모든 테이블에 tenant_id 컬럼 표시 + tenants 테이블 신규 | ERD 갱신 (모든 박스에 tenant_id) |
| Wave 4 | `02-architecture/04-observability-blueprint.md` | per-tenant metrics 절 추가 (ADR-029 §3) | 절 1개 추가 (200~300줄) |
| Wave 4 | `02-architecture/05-operations-blueprint.md` | snapshot에 N tenants 포함 명시 + per-tenant rollback | 절 1개 추가 (150~200줄) |
| Wave 4 | `02-architecture/07-storage-blueprint.md` | path prefix `/yp-storage/<tenantId>/...` | 절 1개 추가 (100줄) |
| Wave 4 | `02-architecture/10-edge-functions-blueprint.md` | DB tenant_function_policies 테이블 | 절 1개 추가 (150줄) |
| Wave 4 | `02-architecture/11-realtime-blueprint.md` | publication WHERE tenant_id 또는 per-tenant slot 결정 | 절 1개 추가 (200줄) |
| Wave 4 | `02-architecture/13-db-ops-blueprint.md` | cron pool refactor (ADR-028) + per-tenant backup | 절 1개 추가 (150줄) |
| Wave 5 | `05-roadmap/00-roadmap-overview.md` | Phase 14.5 신규 삽입 + Phase 15-22 공수 +142h 반영 | 표 갱신 + 다이어그램 갱신 |
| Wave 5 | `05-roadmap/02-milestones.md` | M1.5 신규 milestone (tenant scaffold) | milestone 1건 추가 |
| Wave 5 | `05-roadmap/03-mvp-scope.md` | MVP에 default tenant + Almanac 분리까지 포함 (Stage 4까지) | 범위 명시 갱신 |
| Wave 5 | `05-roadmap/03-risk-register.md` | R-tenant-1 (cross-tenant leak), R-tenant-2 (cron pool 격리 실패), R-tenant-3 (RLS 정책 버그) 3건 추가 | 리스크 3건 추가 |
| Wave 5 | `05-roadmap/05-rollout-strategy.md` | per-tenant canary (한 tenant만 새 버전 라우팅) | 전략 1건 추가 |
| Wave 5 | `05-roadmap/07-success-metrics-kpi.md` | KPI 127개 모두 'per-tenant breakdown' 차원 추가 + 신규 KPI 5건 (tenant onboarding time, leak detection rate 등) | KPI 5건 추가 + 차원 표 갱신 |
| Wave 5 | `06-prototyping/01-spike-portfolio.md` | SP-baas-001~005 신규 등록 | spike 5건 추가 |
| Wave 5 | `07-appendix/01-glossary.md` | tenant, manifest, withTenant, RLS, BYPASSRLS 등 용어 추가 | 용어 ~15건 추가 |

**합계**: 21 문서 갱신, 추가/갱신 줄 수 약 2,000~2,500줄 (기존 106,588줄 대비 +2.0~2.3%).

---

## 7. _CHECKPOINT_KDYWAVE.md §보완 추가 항목

`docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md`에 본 BaaS Foundation Wave를 신규 등록.

### 7.1 신규 등록 항목

```markdown
## B-04 (2026-04-26 BaaS Foundation Wave)

### 트리거
- ADR-001 §6 재검토 트리거 1·3 충족 (사용자 결정 2026-04-26)
- 사용자 발언: "본인 소유 10~20개 프로젝트의 공유 백엔드로 yangpyeon을 사용"

### 산출물 (압축형 4 sub-wave)
| Sub-wave | 산출물 | 줄 수 |
|----------|-------|------|
| 사전 분석 | 00-context/01-existing-decisions-audit.md, 02-current-code-audit.md | ~1,000 |
| 결정 | 01-adrs/ADR-022~029 (8 ADR ACCEPTED) | ~7,500 |
| 사전 spike | 03-spikes/ (2건 완료) | ~500 |
| Architecture | 04-architecture-wave/01-architecture/ (9 spec) | ~3,500 |
| Sprint Plan | 04-architecture-wave/02-sprint-plan/ (2 문서) | ~1,500 |
| Migration | 04-architecture-wave/03-migration/ (00, 01) | ~1,500 |
| Validation | 04-architecture-wave/04-validation/ (2 문서) | ~1,000 |
| **합계** | **약 30 문서** | **~16,500** |

### 5 핵심 산출물 cross-reference (Wave registry 7+1 위치 동기화)
1. ADR-022 (정체성 재정의) — 1인-N프로젝트 BaaS
2. ADR-023 (옵션 B shared+RLS) — 데이터 격리
3. ADR-027 (path 라우터 + K3 매칭) — 라우팅 + API key 매칭
4. ADR-028 (옵션 D worker_threads + pg-boss) — cron pool
5. ADR-029 (M1+L1+T3 + Operator Console) — per-tenant 관측성

### 영향 받는 기존 ADR
- ADR-001 (부분 supersede), ADR-005/015 (amendment), ADR-018 (보존), ADR-021 (amendment-2)

### 새 Phase
- Phase 14.5 (멀티테넌트 마이그레이션, 140h) 신규 삽입
- Phase 15-22 +142h tenant 차원 추가 → 누적 ~1,142h

### 14 카테고리 점수 영향
- 0건 폐기, Observability/Operations +0.02 권고도 향상

### Compound Knowledge
- "5 Stage 마이그레이션은 단일 → 멀티 전환의 표준 패턴" — 다른 BaaS 전환 프로젝트에서 재사용 가능
- "ADR-020 standalone snapshot이 마이그레이션의 마지막 안전망" — Stage 4 split 시 정합성 손실 6h 이내 복원
- "Wave 1~5 산출물 100% 점수 보존 + retrofit 21건만" — 사전 검증된 아키텍처는 멀티테넌트 추가에도 안정적
```

### 7.2 Wave registry 7+1 위치 동기화

기존 7 카테고리 (Wave 1, 2, 3, 4, 5, A-시리즈, B-01~03) + 본 B-04 = 8 위치.

`_CHECKPOINT_KDYWAVE.md`의 다음 위치 모두 동기 갱신:
1. 헤더 진행 상태 표 (Wave 1~5 + B-01~04)
2. 카테고리별 누적 줄 수 (106,588 + 16,500 = ~123,000)
3. 14 카테고리 점수 표 (Observability/Operations 권고도 갱신)
4. 5 핵심 산출물 cross-reference 표
5. 다음 작업 섹션 (Phase 14.5 진입)
6. Compound Knowledge 누적
7. 미해결 DQ (BaaS 관련 신규 0건 — ADR로 모두 해결)

---

## 8. 본 매트릭스 사용 가이드

### 8.1 ADR-022~029 spec 작성자에게

각 spec은 본 매트릭스의 §2 (영향 ADR), §3 (영향 spike), §6 (역방향 피드백)을 참조하여 retrofit 책임 자동 식별.

### 8.2 마이그레이션 실행자(Stage 1~5)에게

본 매트릭스는 [00-migration-strategy.md](./00-migration-strategy.md)와 한 쌍. 각 Stage 진입 시:
- §3 spike 재검증 필요 항목 확인
- §6 역방향 피드백 갱신 항목을 같은 PR에 포함

### 8.3 Wave 1~5 문서 갱신자에게

§6 표를 단일 진실 소스로 사용. 임의 갱신 금지.

### 8.4 다음 kdywave 호출자에게

본 매트릭스의 §7 신규 항목 패턴은 향후 다른 ADR 시리즈가 Wave 1~5에 영향을 줄 때도 동일 양식으로 등록.

---

## 9. 본 문서가 다루지 않는 것 (out of scope)

- 5 Stage 마이그레이션의 SQL/코드 수준 상세 → [00-migration-strategy.md](./00-migration-strategy.md)
- ADR-022~029 spec 본문 → `01-architecture/01~08-adr-*-impl-spec.md`
- spike SP-baas-001~005 상세 — 별도 spike 문서 (`03-spikes/spike-baas-*.md`)
- Wave 1~5 문서 갱신 PR 작성 — 본 매트릭스 §6 기반으로 별도 sub-agent 발사

---

> 본 문서 신뢰도: 95% (Wave 1~5 산출물 직접 인용 100%, ADR-022~029 ACCEPTED 결정 인용 100%, retrofit 추정 90%).
> 다음 단계: §7 _CHECKPOINT_KDYWAVE.md 갱신 sub-agent 발사 + §6 역방향 피드백 21건 PR sub-agent 분기.
