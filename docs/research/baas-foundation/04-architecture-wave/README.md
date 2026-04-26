# 04 — Architecture Wave (BaaS Foundation 본격 아키텍처 설계)

> 작성: 2026-04-26 세션 58
> 트리거: 8개 ADR (ADR-022~029) ACCEPTED + 2 spike 검증 완료 → kdywave 호출
> 입력: docs/research/baas-foundation/00-context/ (사전 분석) + 01-adrs/ (8 ACCEPTED) + 03-spikes/ (2건)
> 산출물: 본 디렉토리 14개 파일 (~6,000~9,000줄 예상)

---

## Wave 구성 — 압축형 4 sub-wave (M 규모, Wave 4+5만)

**왜 압축형인가**: kdywave 표준은 5-Wave (deep-dive → comparison → vision → architecture → roadmap) 이지만, 본 작업은:
- Wave 1 (deep-dive): 이미 완료 (supabase-parity Wave 1~5, 123 문서, 106,588줄)
- Wave 2 (comparison): 이미 ADR-022~029 8건 ACCEPTED
- Wave 3 (vision/requirements): ADR-022가 정체성 정의, FR/NFR은 supabase-parity Wave 3에 있음
- **Wave 4 (architecture)**: ★ 본 작업
- **Wave 5 (roadmap)**: ★ 본 작업

따라서 Wave 4+5에 해당하는 **architecture + sprint plan + migration + validation** 4 sub-wave로 압축.

---

## 4 Sub-wave 구조

| Sub-wave | 주제 | 산출물 위치 | 예상 줄 수 |
|----------|------|-----------|----------|
| **A. Architecture** | 5-Plane 시스템 개요 + 8 ADR 구현 specs | `01-architecture/` | ~3,500줄 |
| **B. Sprint Plan** | Phase 0~4 sprint plan + task DAG | `02-sprint-plan/` | ~1,500줄 |
| **C. Migration** | 단일→멀티테넌트 마이그레이션 전략 + Wave 1~5 호환성 | `03-migration/` | ~1,500줄 |
| **D. Validation** | 1인 N=20 운영 시나리오 + 7원칙 준수 | `04-validation/` | ~1,000줄 |

---

## Sub-wave A — Architecture (9 agent 병렬)

| Agent | 산출물 | 주제 |
|-------|-------|------|
| A1 | `01-architecture/00-system-overview-5-plane.md` | 5-Plane 통합 다이어그램 + 시스템 개요 |
| A2 | `01-architecture/01-adr-022-impl-spec.md` | 정체성 재정의 구현 spec |
| A3 | `01-architecture/02-adr-023-impl-spec.md` | shared+RLS 구현 spec (Prisma extension + ESLint + e2e) |
| A4 | `01-architecture/03-adr-024-impl-spec.md` | hybrid plugin 구현 spec (pnpm workspace) |
| A5 | `01-architecture/04-adr-025-impl-spec.md` | 단일 인스턴스 + 추상화 5종 spec |
| A6 | `01-architecture/05-adr-026-impl-spec.md` | TS+DB hybrid manifest 스키마 spec |
| A7 | `01-architecture/06-adr-027-impl-spec.md` | path router + K3 매칭 spec |
| A8 | `01-architecture/07-adr-028-impl-spec.md` | worker_threads + pg-boss spec |
| A9 | `01-architecture/08-adr-029-impl-spec.md` | M1+L1+T3 + Operator Console spec |

## Sub-wave B/C/D (각 1 agent)

| Agent | 산출물 |
|-------|-------|
| B | `02-sprint-plan/00-roadmap-overview.md` + `01-task-dag.md` |
| C | `03-migration/00-migration-strategy.md` + `01-wave-compatibility-matrix.md` |
| D | `04-validation/00-operations-scenarios.md` + `01-principles-compliance.md` |

---

## 진행 상태 대시보드 — ✅ 전체 완료 (2026-04-26)

| Sub-wave | Agent | 산출물 | 줄 수 | 상태 |
|----------|-------|--------|-------|------|
| A1 | System Overview | 00-system-overview-5-plane.md | 736 | ✅ |
| A2 | ADR-022 spec | 01-adr-022-impl-spec.md | 382 | ✅ |
| A3 | ADR-023 spec | 02-adr-023-impl-spec.md | 1,005 | ✅ |
| A4 | ADR-024 spec | 03-adr-024-impl-spec.md | 618 | ✅ |
| A5 | ADR-025 spec | 04-adr-025-impl-spec.md | 492 | ✅ |
| A6 | ADR-026 spec | 05-adr-026-impl-spec.md | 740 | ✅ |
| A7 | ADR-027 spec | 06-adr-027-impl-spec.md | 744 | ✅ |
| A8 | ADR-028 spec | 07-adr-028-impl-spec.md | 1,053 | ✅ |
| A9 | ADR-029 spec | 08-adr-029-impl-spec.md | 733 | ✅ |
| B | Sprint Plan | 02-sprint-plan/00 + 01 | 982 | ✅ |
| C | Migration | 03-migration/00 + 01 | 948 | ✅ |
| D | Validation | 04-validation/00 + 01 | 1,328 | ✅ |
| **합계** | **12 agent** | **15 파일** | **9,761** | ✅ |

## 주요 결정 사항 (Sub-wave 산출물 종합)

### 5-Plane 인터페이스 (A1)
- ① **Manifest Registry**: TS+DB hybrid (defineTenant + Tenant 모델)
- ② **Platform Core**: withTenant / withTenantTx / dispatchTenantJob / computeEffectiveConfig (불변 4 인터페이스)
- ③ **Tenant Plugin**: packages/tenant-<id>/ 구조 (manifest + prisma fragment + cron + routes + admin)
- ④ **Data Plane**: shared schema + RLS (FORCE ROW LEVEL SECURITY) + dbgenerated tenant_id
- ⑤ **Operations Plane**: Operator Console (18h) + circuit breaker + SLO

### 크리티컬 패스 (B)
T0.2 모노레포 → T0.3 Tenant 모델 → T1.1 ALS → T1.2 router → T1.4 RLS → T1.6 Almanac backfill → T2.1 ManifestSchema → T2.2 loader → T2.5 패키지 마이그레이션 → **T2.6 M3 게이트** → T3.5 ESLint+e2e
- **178h** (병렬 단축 시 156h)

### 5 Stage 마이그레이션 (C)
1. Stage 1 additive (16h) — tenant_id nullable + default 'default'
2. Stage 2 backfill (6h) — 모든 row UPDATE
3. Stage 3 enforce (32h) — NOT NULL + RLS + withTenant
4. Stage 4 split (40h) — Almanac 'default'→'almanac'
5. Stage 5 scale (4h × 19) — manifest only N=2~20

### N=20 운영 한계 (D)
- 주 25h (한계점)
- 자동화 5종 (Operator Console + SLO 알림 + circuit breaker + RLS e2e + onboarding 스크립트, 누적 ~84h) **100% 도입 필수**
- 누락 시 주 50h+ → 1인 불가능
- N=25+: ADR-025 옵션 B/C/D 진화 의무

### 7원칙 위반 차단 (D)
- 자동 검증 4원칙 (1·2·3·4): ESLint + RLS e2e + depcruise + git diff M3 게이트
- 사람 리뷰 3원칙 (5·6·7): PR template 강제

## 의사결정 질문 (DQ) 답변

| DQ# | 질문 | 답변 | 출처 |
|-----|------|------|------|
| DQ-A.1 | 5-Plane 경계? | A1 §2 (책임/데이터/인터페이스/의존성) | A1 |
| DQ-A.2 | 각 ADR 코드 인터페이스? | A2~A9 (8 spec) | A2~A9 |
| DQ-B.1 | Phase 0~4 exit criteria? | M1~M8 마일스톤 | B |
| DQ-B.2 | 크리티컬 패스? | 178h (병렬 156h) | B |
| DQ-C.1 | 마이그레이션 순서? | 5 Stage | C |
| DQ-C.2 | retrofit ADR? | ADR-001/005/015/021/018 5건 | C |
| DQ-D.1 | 1인 N=20 가능? | YES, 단 자동화 5종 100% 필수 | D |
| DQ-D.2 | 7원칙 위반 시나리오? | 자동 4 + 사람 3 차단 매트릭스 | D |

## 다음 단계

1. **즉시 commit**: 본 wave 산출물 (31 파일, 16,826줄)
2. **Phase 0 진입** (Sprint Plan §00 참조):
   - spike-baas-002 부수 fix 3건 (runner.ts:21,72 / registry.ts:135) — 즉시 PR
   - 모노레포 변환 (pnpm + turborepo) — 1주
   - Tenant Prisma 모델 + 마이그레이션 (Stage 1 additive)
   - ADR-021 amendment-2 (audit_logs.tenant_id)
3. **kdyswarm 발사 그룹** (B § 9개 그룹 G0a~G3b 참조):
   - Phase 0 Group G0a (독립 task) 병렬 발사
4. **M3 게이트** (Phase 2 종료): 2번째 컨슈머가 코드 0줄 추가로 가동 → closed multi-tenant 정체성 입증

---

## 의사결정 질문 (DQ)

| DQ# | 질문 | 답변 Wave |
|-----|------|----------|
| DQ-A.1 | 5-Plane 경계는 어떻게 정의되는가? | A1 |
| DQ-A.2 | 각 ADR의 코드 레벨 인터페이스는? | A2~A9 |
| DQ-B.1 | Phase 0~4 각각의 exit criteria? | B |
| DQ-B.2 | task DAG의 크리티컬 패스는? | B |
| DQ-C.1 | 영향 받는 ~30개 파일을 어떤 순서로 마이그레이션? | C |
| DQ-C.2 | 기존 Wave 1~5 결과 중 retrofit 필요한 항목? | C |
| DQ-D.1 | 1인 운영자가 N=20을 견디는가? 어디가 한계? | D |
| DQ-D.2 | 7원칙 위반이 어디서 발생할 수 있는가? | D |

---

## 다음 단계

1. 12 sub-agent 병렬 발사 (Phase 2)
2. 결과 수집 + Phase 3 검증 (DQ 답변 확정 + 일관성 점검)
3. Phase 4 통합 + 마스터 README 완성
4. 사용자 최종 보고 → kdyswarm 구현 진입 가능
