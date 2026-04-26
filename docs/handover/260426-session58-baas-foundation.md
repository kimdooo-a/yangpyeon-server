# 세션 58 인수인계 — BaaS Foundation 멀티테넌트 BaaS 전환 설계

> 날짜: 2026-04-26
> 세션: 58
> 다음 세션: 59 (kdywave Phase 1 본격 아키텍처 wave)
> 상위: [CLAUDE.md](../../CLAUDE.md) → [current.md](../status/current.md) → 여기

---

## 한 줄 요약

ADR-001 (Multi-tenancy 의도적 제외)의 재검토 트리거 1+3이 사용자 요구로 발동되어, **yangpyeon을 closed multi-tenant BaaS (1인 운영자의 N=10~20 프로젝트 공유 백엔드)로 정체성 재정의**. ADR-022~029 8건 + spike 2건 + CLAUDE.md 4개 섹션 갱신 완료. ACCEPTED.

---

## 핵심 결정 (8개 ADR ACCEPTED, 모두 2026-04-26 세션 58)

| ADR | 주제 | 채택 옵션 |
|-----|------|----------|
| **ADR-022** | BaaS 정체성 재정의 | **옵션 A** — closed multi-tenant BaaS. ADR-001 부분 supersede |
| **ADR-023** | 데이터 격리 모델 | **옵션 B** — shared schema + RLS. spike-baas-001로 권고 변경 (옵션 A 사실상 불가) |
| **ADR-024** | Plugin/Tenant 코드 격리 | **옵션 D** — hybrid (Complex=workspace, Simple=manifest). pnpm + turborepo |
| **ADR-025** | 인스턴스 모델 | **옵션 A** — 단일 인스턴스 (Phase 1~3). Phase 4 진화 결정 보류 |
| **ADR-026** | Tenant Manifest 스키마 | **옵션 C** — TS manifest.ts + DB 운영 토글 |
| **ADR-027** | Multi-tenant Router + API key | **옵션 A + K3** — `/api/v1/t/<tenant>/*` + prefix+FK+검증 3중 |
| **ADR-028** | Cron Worker Pool + isolation | **옵션 D** — worker_threads pool (Phase 1) → pg-boss (Phase 3) |
| **ADR-029** | Per-tenant Observability | **M1+L1+T3** (SQLite) → Phase 4 OTel 진화 |

---

## 산출물 인벤토리 (총 6,879줄, 14개 파일)

```
docs/research/baas-foundation/
├── README.md                                      ← 인덱스 (사용자 결정 요청 → 모두 ACCEPTED)
├── 00-context/
│   ├── README.md
│   ├── 01-existing-decisions-audit.md            ← Wave 1~5 + ADR + Spike 통합 감사
│   └── 02-current-code-audit.md                  ← 현재 코드 단일테넌트 가정 매핑 (~30 파일)
├── 01-adrs/
│   ├── ADR-022-baas-identity-redefinition.md             (526줄, ACCEPTED 옵션 A)
│   ├── ADR-023-tenant-data-isolation-model.md            (432줄, ACCEPTED 옵션 B ⚠️ 권고 변경)
│   ├── ADR-024-tenant-plugin-code-isolation.md           (612줄, ACCEPTED 옵션 D)
│   ├── ADR-025-instance-deployment-model.md              (365줄, ACCEPTED 옵션 A)
│   ├── ADR-026-tenant-manifest-schema.md                 (555줄, ACCEPTED 옵션 C)
│   ├── ADR-027-multi-tenant-router-and-api-key-matching.md (713줄, ACCEPTED A+K3)
│   ├── ADR-028-cron-worker-pool-and-per-tenant-isolation.md (587줄, ACCEPTED 옵션 D)
│   └── ADR-029-per-tenant-observability.md               (664줄, ACCEPTED M1+L1+T3)
├── 02-proposals/
│   └── CLAUDE-md-revision-proposal.md            ← 적용 완료 (CLAUDE.md 4개 섹션 갱신)
└── 03-spikes/
    ├── spike-baas-001-prisma-schema-per-tenant.md  (480줄) ← ADR-023 권고 변경 트리거
    └── spike-baas-002-worker-pool-isolation.md     (663줄) ← ADR-028 권고 강화 + 부수 발견 3건
```

---

## ⚠️ Spike-baas-001의 게임 체인저

ADR-023 초안은 옵션 A (schema-per-tenant)를 권고했으나, spike-baas-001 결과로 **옵션 B (shared+RLS)로 변경**:

| 발견 | 영향 |
|------|------|
| Prisma 7.6도 동적 schema-per-tenant 1급 미지원 (issue #24794 still open) | 옵션 A 핵심 가정 무효 |
| `SET search_path` 패턴은 prepared statement caching과 silent 충돌 | **데이터 유출 위험** (cross-tenant) |
| PrismaClient-pool 패턴: N=20 × 9 = 180 connection 즉시 max_connections(100) 초과 | PgBouncer 1.21+ 필수 |
| Almanac plugin 모델(ADR-024/026)은 옵션 A와 본질적 충돌 | runtime plugin vs build-time generate |
| Prisma 공식 권장 = 옵션 B (`prisma-client-extensions/row-level-security`) | 공식 reference 일치 |

**옵션 B 채택의 조건**: ~28h 추가 공수
- `withTenant()` 래퍼 (모든 query에 tenant_id WHERE 자동 추가)
- ESLint custom rule (raw SQL의 tenant_id 누락 검출)
- RLS 정책 e2e 테스트 (cross-tenant leak 자동 검증)
- PostgreSQL `app.tenant_id` session variable 패턴

---

## ⚠️ Spike-baas-002 부수 발견 (즉시 적용 트리거)

ADR-028 결정과 무관하게 **즉시 fix 가능한 3건**:

1. **`src/lib/cron/runner.ts:72`** — WEBHOOK fetch에 AbortController 누락 → 60초+ hang 위험. AGGREGATOR_FETCH_TIMEOUT (60s 기본) 필수.
2. **`src/lib/cron/registry.ts:135`** — runJob catch가 `// 무시` → 실패 추적 불가. CK-38 audit silent failure 패턴 적용 (structured log).
3. **`src/lib/cron/runner.ts:21`** — DEFAULT_ALLOWED_FETCH 하드코딩 → tenant manifest의 allowedFetchHosts로 이전 (ADR-024 의존).

→ Phase 0 또는 Phase 1 초반에 처리.

---

## CLAUDE.md 변경 사항 (적용 완료)

1. **프로젝트 정보**: "양평 부엌 서버 대시보드" → "양평 부엌 서버 — 1인 운영자의 멀티테넌트 백엔드 플랫폼"
2. **문서 체계 트리**: `docs/research/baas-foundation/` 항목 추가 (8 ADR 1줄씩)
3. **핵심 원칙**: "멀티테넌트 BaaS 핵심 7원칙" 신설 섹션 추가
4. **프로젝트별 규칙**: "멀티테넌트 BaaS 운영 규칙" 5개 항목 추가

→ commit 대기 (사용자 승인 필요).

---

## ⚠️ Almanac spec 영향

현재 `spec/aggregator-fixes` 브랜치(다른 터미널)에서 Almanac aggregator 통합 작업 진행 중. ADR 결정으로 영향:

| ADR | Almanac 영향 |
|-----|-------------|
| ADR-023 옵션 B | content_* 테이블 모두 tenant_id 컬럼 + RLS 정책 추가 (출시 후 마이그레이션 시) |
| ADR-024 옵션 D | aggregator 코드를 `packages/tenant-almanac/`로 재구조화 (출시 후) |
| ADR-027 옵션 A | `/api/v1/almanac/*` → `/api/v1/t/almanac/*` 변경 (출시 후) |

**처리 결정**: Almanac v1.0 그대로 출시 (충돌 회피) → 출시 게이트 통과 후 plugin 마이그레이션 (~5~7일 추가).

---

## 다음 세션 (59) 우선 작업

### P0: kdywave Phase 1 본격 아키텍처 wave
- 결정된 8 ADR 위에서 Phase 1~3 상세 plan + 구현 task DAG 산출
- 입력: docs/research/baas-foundation/ 전체 (6,879줄)
- 예상: 3~5시간, 산출물 다수 (architecture diagrams, ADR-022~029 implementation specs, sprint plan)
- 산출 위치: `docs/research/baas-foundation/04-architecture-wave/` (신설)

### P1: spike-baas-002 부수 발견 3건 즉시 fix
- `src/lib/cron/runner.ts:21, 72`
- `src/lib/cron/registry.ts:135`
- 단독 PR 또는 Phase 1 첫 작업으로

### P2 (S57 이월): Almanac aggregator spec 적용 진행 상태 확인
- spec/aggregator-fixes 브랜치 상태 점검
- v1.0 출시 게이트 진행 중인지 확인

### P3 (S56 이월): cleanup cron 결과 확인
- `wsl -- bash -lic 'pm2 logs ypserver --lines 80 --nostream | grep -A2 "audit log write failed"'`
- §보완 1 카운터 확인

### P4 (S56 이월): ADR-021 placeholder 충돌 6 위치 cascade 정정 (세션 56 §보완 2 §D 표 참조)

---

## 핵심 산출물 (5종)

1. `docs/research/baas-foundation/README.md` — 인덱스
2. `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` — 통합 감사
3. `docs/research/baas-foundation/00-context/02-current-code-audit.md` — 코드 매핑
4. `docs/research/baas-foundation/01-adrs/ADR-022~029` (8건)
5. `docs/research/baas-foundation/03-spikes/spike-baas-001~002` (2건)

---

## 운영 부담 (Phase 별 추정)

| Phase | 작업 | 공수 |
|-------|------|------|
| Phase 0 (1~2주) | kdywave + CLAUDE.md commit + Almanac spec v1.1 패치 (선택) | 10~20h |
| Phase 1 (4~6주) | Tenant 1급 시민화 + multi-tenant router + API key + worker pool + Almanac MVP | 120~160h |
| Phase 2 (4~6주) | Plugin system 1.0 + 2번째 컨슈머 manifest만으로 추가 (게이트) | 100~140h |
| Phase 3 (4~6주) | Self-service + Operator Console + SLO | 80~120h |
| Phase 4 (가변) | DB tier 분리, worker tier 분리, VIP 옵션 | 50~80h |
| **총합** | | **360~520h (15~22주)** |

기존 Phase 15~22 (870h) + 본 추가 = **~1,230~1,390h (50~70주)** (1인 운영자 페이스)

---

## 변경 이력

- 2026-04-26 (세션 58, v1.0 ACCEPTED): ADR-022~029 8건 ACCEPTED. CLAUDE.md 4개 섹션 갱신. spike-baas-001 결과로 ADR-023 권고 옵션 A → B 변경. spike-baas-002 부수 발견 3건 즉시 fix 트리거. 다음 세션(59) kdywave Phase 1.
