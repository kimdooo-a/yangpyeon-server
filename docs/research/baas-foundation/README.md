# BaaS Foundation — 멀티테넌트 백엔드 플랫폼 전환 설계

> 작성: 2026-04-26 / 상태: **사용자 결정 대기 (ADR-022~029)**
> 트리거: 사용자가 "본인 소유 10~20개 프로젝트의 공유 백엔드"로 yangpyeon 사용 결정 → ADR-001 Multi-tenancy 의도적 제외 결정의 재검토 트리거 1+3 발동

---

## TL;DR

- **목표**: yangpyeon을 **closed multi-tenant BaaS** (1인 운영자, N=10~20 자기 프로젝트 공유 백엔드)로 전환
- **산출물 (이번 세션)**:
  - 사전 분석 2건 (기존 결정 + 코드 단일테넌트 가정 매핑)
  - ADR 8건 (모두 PROPOSED, [PENDING DECISION])
  - CLAUDE.md 정체성 재정의 제안서 1건
  - 기술 스파이크 2건 (Prisma + Worker pool)
- **결정 요청**: 사용자가 ADR-022, 023, 024, 025 4건을 우선 결정 → 나머지 4건은 의존
- **spike-001 결과로 ADR-023 권고 변경**: 옵션 A(schema-per-tenant) → 옵션 B(shared+RLS)
- **다음 단계**: 사용자 결정 → kdywave 본격 아키텍처 wave → kdyswarm 구현

---

## 디렉토리 구조

```
docs/research/baas-foundation/
├── README.md                                    ← 이 파일 (인덱스 + 사용자 결정 요청)
│
├── 00-context/                                  ← 사전 분석 (ADR 작성자가 먼저 읽음)
│   ├── README.md
│   ├── 01-existing-decisions-audit.md          ← 기존 ADR/Wave/Spike 통합 감사
│   └── 02-current-code-audit.md                ← 현재 코드 단일테넌트 가정 매핑
│
├── 01-adrs/                                     ← 8개 ADR 결정 문서 (모두 PENDING)
│   ├── ADR-022-baas-identity-redefinition.md           (526줄)
│   ├── ADR-023-tenant-data-isolation-model.md          (432줄)
│   ├── ADR-024-tenant-plugin-code-isolation.md         (612줄)
│   ├── ADR-025-instance-deployment-model.md            (365줄)
│   ├── ADR-026-tenant-manifest-schema.md               (555줄)
│   ├── ADR-027-multi-tenant-router-and-api-key-matching.md (713줄)
│   ├── ADR-028-cron-worker-pool-and-per-tenant-isolation.md (587줄)
│   └── ADR-029-per-tenant-observability.md             (664줄)
│
├── 02-proposals/                                ← 변경 제안 (사용자 승인 후 적용)
│   └── CLAUDE-md-revision-proposal.md          (250줄)
│
└── 03-spikes/                                   ← 기술 검증 보고서
    ├── spike-baas-001-prisma-schema-per-tenant.md  (480줄) ← ADR-023 권고 변경 트리거
    └── spike-baas-002-worker-pool-isolation.md     (663줄) ← ADR-028 권고 강화
```

총 ~5,847줄 (8 ADR + 1 제안서 + 2 spike + 컨텍스트 2건).

---

## 8개 ADR 한눈에 보기

| ADR | 주제 | 권고 옵션 | 결정 | spike 영향 |
|-----|------|-----------|------|-----------|
| **ADR-022** | BaaS 정체성 재정의 (1인-N프로젝트 closed multi-tenant) | A: closed multi-tenant | [PENDING] | — |
| **ADR-023** | 데이터 격리 모델 | ~~A: schema-per-tenant~~ → **B: shared+RLS** | [PENDING] | **spike-001로 권고 변경** |
| **ADR-024** | Plugin/Tenant 코드 격리 | D: hybrid (workspace + manifest) | [PENDING] | — |
| **ADR-025** | 인스턴스 모델 | A: 단일 인스턴스 (Phase 1~3) → 데이터 보고 진화 | [PENDING] | — |
| **ADR-026** | Tenant Manifest 스키마 | C: hybrid (TS manifest + DB 운영토글) | [PENDING] | — |
| **ADR-027** | Multi-tenant Router + API key 매칭 | A(URL path) + K3(prefix+FK+검증) | [PENDING] | — |
| **ADR-028** | Cron Worker Pool + per-tenant isolation | D: hybrid (worker_threads + pg-boss) | [PENDING] | spike-002로 권고 강화 |
| **ADR-029** | Per-tenant Observability | M1+L1+T3 (SQLite-only) → Phase 4 OTel | [PENDING] | — |

---

## 사용자 결정 요청

### 결정 1순위: ADR-022 (정체성 재정의)
**이 결정이 나머지 7개의 전제**입니다.

옵션:
- **A. closed multi-tenant BaaS** (권고) — 본인 소유 10~20개 프로젝트만, 외부 가입 없음
- B. open SaaS BaaS — 외부 사용자, billing, SLA (단독 운영 불가)
- C. 현 상태 유지 — N=2~3 한계
- D. hybrid (Supabase + yangpyeon) — 사용자 명시적 거부

**결정 영향**: 옵션 A 채택 시 ADR-001 부분 supersede. Wave 1~5 호환성 100%. 공수 +44% (380~480h 추가).

### 결정 2순위: ADR-023 (데이터 격리 모델) ⚠️ spike 권고 변경
옵션:
- ~~A. schema-per-tenant~~ (Prisma 미지원으로 사실상 불가)
- **B. shared schema + RLS** (Supabase 방식, 권고)
- C. DB-per-tenant (운영 부담 N배)

**spike-001 핵심 발견**:
- Prisma 7.6도 동적 schema-per-tenant 1급 미지원 (issue #24794)
- `SET search_path`는 prepared statement caching과 silent 충돌 → **데이터 유출 위험**
- PrismaClient-pool 패턴은 N=20 × 9 = 180 connection 즉시 max_connections(100) 초과
- Almanac plugin (ADR-024/026의 동적 등록)은 옵션 A와 본질적 충돌
- Prisma 공식 권장 = 옵션 B (`prisma-client-extensions/row-level-security`)

**보안 보강 필수**: 옵션 B 채택 시 `withTenant` 래퍼 + ESLint rule + RLS e2e 테스트 (~28h)

### 결정 3순위: ADR-024 (Plugin 코드 격리)
옵션:
- A. in-repo workspace (pnpm + turborepo)
- B. 외부 npm package
- C. 동적 manifest only
- **D. hybrid (Complex=workspace, Simple=manifest)** — 권고

**현재 상태 확인**: package.json에 workspaces 필드 **없음** → 모노레포 도입 필요.

### 결정 4순위: ADR-025 (인스턴스 모델)
옵션:
- **A. 단일 인스턴스 (Phase 1~3)** (권고) → Phase 4에서 데이터 보고 D(worker pool) 또는 B(Tier) 진화
- B. Tier 분리
- C. 컨슈머별 인스턴스
- D. 단일 + worker pool

**핵심**: 옵션 A 결정이 "단일 인스턴스 영구 락인"이 아니라 **"코드 추상화 격리 경계의 하한"**. ADR-024/028 plugin/worker pool 인터페이스가 미래 진화를 가능케 함.

### 결정 5~8순위 (1~4 결정 후 자동 또는 가벼운 검토)
- **ADR-026, 027, 028, 029** — 1~4 결정 후 옵션 자동 좁아짐. 가벼운 검토만.

---

## ⚠️ Almanac spec과의 충돌 처리

현재 **`spec/aggregator-fixes` 브랜치에서 Almanac 통합이 진행 중**입니다 (다른 터미널). ADR 결정으로 Almanac spec이 영향 받습니다:

| ADR 결정 | Almanac spec 영향 |
|---------|-------------------|
| ADR-023 옵션 B (RLS) | content_* 테이블 모두 tenant_id 컬럼 + RLS 정책 추가 |
| ADR-024 옵션 D | aggregator 코드를 `packages/tenant-almanac/`로 재구조화 |
| ADR-027 옵션 A | `/api/v1/almanac/*` → `/api/v1/t/almanac/*` 변경 |

**권고**:
1. Almanac spec v1.0 그대로 출시 게이트 통과 (충돌 회피)
2. 출시 후 ADR-022~029 결정에 따라 Almanac을 plugin으로 마이그레이션
3. 또는 사용자 결정 즉시 Almanac spec을 v1.1로 패치 (tenant_id 씨앗 끼워넣기)

---

## 다음 단계 (사용자 결정 후)

### Phase 0 (즉시, 1~2주)
1. **사용자 ADR-022~025 결정**
2. **kdywave 호출** — 결정된 옵션 위에서 본격 아키텍처 설계 wave (3~5시간 소요, 산출물 다수)
3. **CLAUDE.md 정체성 재정의 적용** (제안서 승인 후)
4. **Almanac spec v1.1 패치** (tenant_id 씨앗)

### Phase 1 (4~6주)
- Tenant 1급 시민화 (모든 모델/route/cron/log에 tenant_id)
- Multi-tenant router (`/api/v1/t/<tenant>/*`)
- API key tenant 매칭
- Worker pool per-tenant isolation
- Almanac MVP 정식 가동

### Phase 2 (4~6주)
- Plugin system 1.0 (manifest 기반)
- 2번째 컨슈머를 코드 수정 0줄로 추가 (게이트)

### Phase 3 (4~6주)
- Self-service + Operator Console + SLO

### Phase 4 (가변, N=10 도달 시)
- DB tier 분리, worker tier 분리, VIP 인스턴스 옵션

**총 공수**: 기존 Phase 15~22 (870h) + 멀티테넌트 추가 (380~480h) = **~1,250~1,350h (50~70주)**

---

## 04-architecture-wave/ 추가 (2026-04-26 세션 58, kdywave 완료)

8 ADR ACCEPTED 직후 kdywave 호출 → 4 sub-wave × 12 sub-agent 병렬 발사 → 15 파일, 9,761줄 산출.

| Sub-wave | 산출물 | 핵심 결과 |
|----------|--------|----------|
| A. Architecture | 5-Plane Overview + 8 ADR 구현 specs (9 파일, 6,503줄) | 4 인터페이스 (withTenant/withTenantTx/dispatchTenantJob/computeEffectiveConfig) |
| B. Sprint Plan | Phase 0~4 + Task DAG (982줄) | 크리티컬 패스 178h(병렬 156h), kdyswarm 9 그룹 |
| C. Migration | 5 Stage 전략 + Wave 호환성 (948줄) | retrofit ADR-001/005/015/021/018 |
| D. Validation | N=20 운영 시나리오 + 7원칙 (1,328줄) | N=20 한계 주 25h, 자동화 5종 필수 |

**상세**: docs/research/baas-foundation/04-architecture-wave/README.md

## 변경 이력

- 2026-04-26 v0.1: 초안 작성 (ADR 8건 + 제안서 1건 + spike 2건). 사용자 결정 대기.
- 2026-04-26 v1.0 (세션 58): 사용자 권고대로 진행 결정 → 8 ADR ACCEPTED + CLAUDE.md 정체성 재정의 적용 + kdywave 4 sub-wave × 12 sub-agent 병렬 → 04-architecture-wave/ 신설 (15 파일, 9,761줄). 누적 31 파일, 16,826줄. 다음: Phase 0 진입 (kdyswarm).
