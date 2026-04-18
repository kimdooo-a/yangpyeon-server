# 07. 성공 지표 KPI — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> Wave 5 · R4 에이전트 산출물
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 참조: [00-product-vision.md](../00-vision/00-product-vision.md) · [03-non-functional-requirements.md](../00-vision/03-non-functional-requirements.md) · [05-100점-definition.md](../00-vision/05-100점-definition.md) · [10-14-categories-priority.md](../00-vision/10-14-categories-priority.md)

---

## 목차

- [§1. KPI 프레임워크 — 4계층 피라미드](#1-kpi-프레임워크--4계층-피라미드)
- [§2. North Star Metric 정의](#2-north-star-metric-정의)
- [§3. Phase별 KPI 목표 테이블](#3-phase별-kpi-목표-테이블-phase-15--22)
- [§4. 14 카테고리별 KPI 매트릭스](#4-14-카테고리별-kpi-매트릭스)
- [§5. NFR 기반 정량 KPI](#5-nfr-기반-정량-kpi)
- [§6. Leading Indicators — 실시간 대시보드](#6-leading-indicators--실시간-대시보드-adminkpi-dashboard)
- [§7. Lagging Indicators — 분기 리포트](#7-lagging-indicators--분기-리포트)
- [§8. 사용자 만족도 측정](#8-사용자-만족도-측정)
- [§9. 비용 KPI](#9-비용-kpi)
- [§10. 보안 KPI](#10-보안-kpi)
- [§11. 100점 도달 최종 검증 프로토콜](#11-100점-도달-최종-검증-프로토콜-phase-22)
- [§12. KPI 거버넌스](#12-kpi-거버넌스)

---

## §1. KPI 프레임워크 — 4계층 피라미드

### 1.1 피라미드 구조

```
                    ┌──────────────────────┐
                    │   North Star Metric   │  ← 14 카테고리 가중 평균 점수 (목표: 100)
                    └──────────────────────┘
                  ┌──────────────────────────┐
                  │     Success Metrics       │  ← Phase별 달성 점수 (분기 리포트)
                  └──────────────────────────┘
               ┌──────────────────────────────┐
               │      Leading Indicators       │  ← 실시간 관측 지표 (주간 대시보드)
               └──────────────────────────────┘
            ┌──────────────────────────────────┐
            │       Lagging Indicators          │  ← 결과 지표 (분기 리포트)
            └──────────────────────────────────┘
```

### 1.2 계층별 정의

| 계층 | 설명 | 측정 주기 | 담당 |
|------|------|---------|------|
| **North Star** | 단일 핵심 건강 지표. 모든 KPI의 방향이 이 숫자를 향함 | 월 1회 | 운영자(김도영) |
| **Success Metrics** | Phase 단위 목표 달성률. 분기 OKR 역할 | Phase 완료 시 + 분기 1회 | 운영자 |
| **Leading Indicators** | 현재 시스템 건강을 실시간으로 반영하는 측정 가능 지표. 성과 예측 | 실시간/일간/주간 | Prometheus + 자동 수집 |
| **Lagging Indicators** | 결과를 사후 평가하는 지표. 추세 분석용 | 분기 1회 | 운영자 + 자동 집계 |

### 1.3 KPI 총 목록 요약

| 계층 | 개수 |
|------|------|
| North Star Metric | 1 |
| Success Metrics (Phase별) | 40 (Phase 15~22, 각 5개) |
| Leading Indicators | 25 |
| Lagging Indicators | 12 |
| NFR 기반 정량 KPI | 38 |
| 비용 KPI | 5 |
| 보안 KPI | 6 |
| **총합** | **127 KPI** |

---

## §2. North Star Metric 정의

### 2.1 North Star: Supabase 동등성 가중 평균 점수

**정의**: 14 카테고리 각각에 대해 0~100점을 부여하고, 아래 가중치로 가중 평균을 산출한 단일 점수.

**목표**: Phase 22 완료 시 **100점**

### 2.2 가중치 및 현재 점수

| 순서 | 카테고리 | 가중치 (W) | 현재 점수 (S) | 가중 기여 (W×S/100) | 목표 점수 |
|------|---------|----------|------------|-------------------|---------|
| 1 | Table Editor | 7% | 75 | 5.25 | 100 |
| 2 | SQL Editor | 7% | 70 | 4.90 | 100 |
| 3 | Schema Visualizer | 6% | 65 | 3.90 | 100 |
| 4 | DB Ops | 6% | 60 | 3.60 | 100 |
| 5 | Auth Core | 9% | 70 | 6.30 | 100 |
| 6 | Auth Advanced | 9% | 15 | 1.35 | 100 |
| 7 | Storage | 6% | 40 | 2.40 | 100 |
| 8 | Edge Functions | 7% | 45 | 3.15 | 100 |
| 9 | Realtime | 7% | 55 | 3.85 | 100 |
| 10 | Advisors | 6% | 65 | 3.90 | 100 |
| 11 | Data API | 7% | 45 | 3.15 | 100 |
| 12 | Observability | 7% | 65 | 4.55 | 100 |
| 13 | UX Quality | 7% | 75 | 5.25 | 100 |
| 14 | Operations | 7% | 80 | 5.60 | 100 |
| **합계** | | **100%** | **현재 평균 57.0** | **57.15** | **100** |

> 가중치 배분 근거: `_CHECKPOINT_KDYWAVE.md` 스코어링 프레임워크 (FUNC 18% / PERF 10% / DX 14% / ECO 12% / LIC 8% / MAINT 10% / INTEG 10% / SECURITY 10% / SELF_HOST 5% / COST 3%) 를 14개 카테고리에 재매핑. Auth(Core+Advanced)에 합산 18% 배정 (보안 최우선), 각 9%씩 분배.

### 2.3 4단계 달성 기준

`05-100점-definition.md` 직접 인용:

| 단계 | 점수 범위 | 의미 |
|------|---------|------|
| 기반 | 0~60점 | 핵심 기능만 구현, UI 부족, 자주 쓰는 기능 누락 |
| 실용 | 61~80점 | 일상 업무 가능, 고급 기능 미비 |
| 동등 | 81~95점 | Supabase Cloud 95% 대체 가능, 엣지 케이스 미흡 |
| 완전 | 96~100점 | Cloud 동등 + 양평 특화 기능 포함 |

### 2.4 계산 공식 (자동화)

```typescript
// weekly-ci/score-calculator.ts 의사 코드
interface CategoryScore {
  id: number;
  name: string;
  weight: number;   // 소수점, 합계 = 1.0
  score: number;    // 0~100
}

function computeNorthStar(categories: CategoryScore[]): number {
  return categories.reduce((sum, cat) => sum + (cat.weight * cat.score), 0);
}

// 측정 데이터 소스:
// - 기능 커버리지: 체크리스트 YAML (docs/kpi-reports/checklists/*.yml)
// - 성능 KPI: Prometheus 쿼리 (http_request_duration_seconds 등)
// - 테스트 통과율: Vitest --coverage JSON 출력
// - 출력: docs/kpi-reports/YYYY-MM/north-star.json
```

### 2.5 자동 측정 스크립트 (weekly CI 아이디어)

```yaml
# .github/workflows/weekly-kpi.yml
name: Weekly KPI Score
on:
  schedule:
    - cron: '0 9 * * 1'  # 매주 월요일 09:00 KST
  workflow_dispatch:

jobs:
  compute-kpi:
    runs-on: self-hosted  # WSL2 self-hosted runner
    steps:
      - name: 테스트 커버리지 수집
        run: pnpm vitest run --coverage --reporter=json > /tmp/coverage.json
      - name: Prometheus 지표 스냅샷
        run: curl -s http://localhost:9090/api/v1/query?query=... > /tmp/metrics.json
      - name: 체크리스트 YAML 파싱
        run: node scripts/parse-checklist.mjs > /tmp/checklist.json
      - name: North Star 점수 산출
        run: node scripts/compute-north-star.mjs
      - name: KPI 리포트 저장
        run: cp /tmp/kpi-report.json docs/kpi-reports/$(date +%Y-%m)/weekly-$(date +%d).json
```

---

## §3. Phase별 KPI 목표 테이블 (Phase 15 ~ 22)

### 3.1 Phase 15 — Auth Advanced (TOTP/WebAuthn/Rate Limit)

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 57.2 | **61.3** | +4.1 |
| Auth Advanced | 15 | 60 | +45 |
| 기타 카테고리 | 동결 | 동결 | — |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P15-1 TOTP 설정 성공률 | ≥ 99% | `audit_log WHERE action='totp_setup'` 성공/실패 비율 | 주간 |
| KPI-P15-2 WebAuthn 인증 성공률 | ≥ 99% | `audit_log WHERE action='webauthn_auth'` 성공 비율 | 주간 |
| KPI-P15-3 Rate Limit 응답 시간 | ≤ 10ms (429 응답) | Pino 로그 `duration` 필드 p95 | 실시간 |
| KPI-P15-4 MFA 미설정 Admin 로그인 차단율 | 100% | `audit_log WHERE role='admin' AND mfa=null AND result='blocked'` | 일간 |
| KPI-P15-5 공수 대비 갭 해소율 | ≥ 2.05점/h | (달성 갭 점수) / (실투입 시간h) | Phase 완료 시 |

---

### 3.2 Phase 16 — Observability 강화 + Operations 보강

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 61.3 | **64.8** | +3.5 |
| Observability | 65 | 85 | +20 |
| Operations | 80 | 95 | +15 |
| 기타 카테고리 | 동결 | 동결 | — |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P16-1 Vault 암호화 커버리지 | 100% (전 시크릿 AES-256-GCM) | `vault_secrets WHERE encryption_version IS NULL` = 0건 | 일간 |
| KPI-P16-2 JWKS 키 회전 준수율 | 100% (≤ 24h 간격) | `jwks_key_rotations.rotated_at` 최신 row vs 현재 시각 | 실시간 |
| KPI-P16-3 Canary 배포 자동 롤백 발동률 | 측정 기준 확립 (에러율 > 1% 시 발동) | `deploy_events WHERE rollback_triggered=true` | 배포 시 |
| KPI-P16-4 symlink 롤백 소요 시간 | ≤ 5초 | `deploy_events.rollback_duration_ms` p95 | 배포 시 |
| KPI-P16-5 PM2 자동 재시작 복구 시간 | ≤ 3초 | PM2 `pm2_restart_duration_ms` 메트릭 | 실시간 |

---

### 3.3 Phase 17 — Auth Core 완성 + Storage (SeaweedFS)

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 64.8 | **72.3** | +7.5 |
| Auth Core | 70 | 90 | +20 |
| Storage | 40 | 90 | +50 |
| 기타 카테고리 | 동결 | 동결 | — |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P17-1 Auth Core 세션 관리 완성도 | 100% (Session 테이블 + Refresh Token + 디바이스 목록 UI 모두 작동) | E2E 체크리스트 3항목 통과 | Phase 완료 시 |
| KPI-P17-2 Storage 파일 업로드 처리량 | ≥ 80 MB/s (100MB 파일 기준, Hot write) | `seaweedfs-benchmark` 결과 p95 | Phase 완료 시 |
| KPI-P17-3 Storage API 응답 | p95 ≤ 300ms (10MB 이하 파일 GET) | Prometheus `http_request_duration_seconds{path="/api/storage"}` p95 | 실시간 |
| KPI-P17-4 B2 오프로드 지연 | ≤ 10분 (SeaweedFS → B2 async replication) | `rclone` 복제 지연 로그 평균 | 일간 |
| KPI-P17-5 익명(Anonymous) 역할 접근 차단율 | 100% (보호 리소스 접근 시 401) | Playwright E2E 익명 접근 시나리오 통과 | Phase 완료 시 |

---

### 3.4 Phase 18 — SQL Editor 고도화 + Table Editor 완성

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 72.3 | **78.9** | +6.6 |
| SQL Editor | 70 | 95 | +25 |
| Table Editor | 75 | 95 | +20 |
| 기타 카테고리 | 동결 | 동결 | — |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P18-1 SQL Editor EXPLAIN 응답 | p95 ≤ 500ms (EXPLAIN 단독) | Pino 로그 `explain_duration_ms` p95 | 주간 |
| KPI-P18-2 AI SQL 생성 정확도 | ≥ 80% (실행 성공률) | `ai_sql_requests WHERE execution_success=true` 비율 | 주간 |
| KPI-P18-3 AI 비용 (월간) | ≤ $5 | Anthropic API usage 집계 | 월간 |
| KPI-P18-4 Table Editor 100만 행 정렬 응답 | p95 ≤ 1.2s (end-to-end) | Playwright E2E 타임스탬프 측정 | Phase 완료 시 |
| KPI-P18-5 RLS 정책 UI 생성 성공률 | ≥ 99% | `schema_viz_events WHERE action='rls_create'` 성공 비율 | 주간 |

---

### 3.5 Phase 19 — Edge Functions (3층) + Realtime (CDC)

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 78.9 | **85.4** | +6.5 |
| Edge Functions | 45 | 92 | +47 |
| Realtime | 55 | 100 | +45 |
| 기타 카테고리 | 동결 | 동결 | — |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P19-1 Realtime wal2json 지연 | p95 ≤ 200ms (end-to-end) | Canary 테이블 `rt_probe` INSERT → 수신 ΔT 24h 평균 | 실시간 |
| KPI-P19-2 Edge Functions cold start (isolated-vm) | p95 ≤ 50ms | 10분 idle 후 첫 invocation 타임스탬프 계측 1000회 | 주간 |
| KPI-P19-3 Edge Functions warm invocation | p95 ≤ 5ms | 연속 invocation 타임스탬프 평균 | 주간 |
| KPI-P19-4 decideRuntime() 라우팅 정확도 | ≥ 99% (의도 레이어로 라우팅) | `edge_fn_executions.layer` 분포 vs 기대값 | 주간 |
| KPI-P19-5 Realtime 채널 Presence 정확도 | ≥ 99.5% (온라인 사용자 목록 일치) | Playwright E2E 다중 탭 시나리오 | Phase 완료 시 |

---

### 3.6 Phase 20 — Schema Viz + DB Ops + Advisors

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 85.4 | **90.8** | +5.4 |
| Schema Visualizer | 65 | 95 | +30 |
| DB Ops | 60 | 95 | +35 |
| Advisors | 65 | 95 | +30 |
| 기타 카테고리 | 동결 | 동결 | — |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P20-1 Schema Viz 렌더링 (테이블 50개) | p95 ≤ 1.5s (레이아웃 + 첫 페인트) | Chrome DevTools Performance 5회 중앙값 | Phase 완료 시 |
| KPI-P20-2 WAL 아카이빙 RPO | ≤ 60초 | `pg_stat_archiver.last_archived_time` vs 현재 시각 | 실시간 |
| KPI-P20-3 wal-g 복구 RTO | ≤ 30분 (10GB 기준) | 분기 DR 리허설 실측 | 분기 |
| KPI-P20-4 Advisors 3-Layer 룰 총 개수 | ≥ 50룰 (schemalint + squawk + splinter 합산) | `advisor_rules WHERE enabled=true` 카운트 | 월간 |
| KPI-P20-5 splinter 포팅 완성도 | ≥ 38룰 Node TS 구현 | `splinter_rules WHERE ported_at IS NOT NULL` 카운트 | Phase 완료 시 |

---

### 3.7 Phase 21 — Data API 완성 + UX Quality

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 90.8 | **94.1** | +3.3 |
| Data API | 45 | 85 | +40 |
| UX Quality | 75 | 95 | +20 |
| 기타 카테고리 | 동결 | 동결 | — |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P21-1 REST API p95 응답 | ≤ 300ms (단순 select/insert) | Prometheus `http_request_duration_seconds{quantile="0.95"}` | 실시간 |
| KPI-P21-2 pgmq 잡 큐 enqueue→실행 SLA | ≤ 30초 | `queue_lag_seconds` 메트릭 | 실시간 |
| KPI-P21-3 PostgREST 호환 쿼리 패턴 지원률 | ≥ 80% (select/insert/update/delete/RPC) | 호환성 매트릭스 E2E 테스트 | Phase 완료 시 |
| KPI-P21-4 AI Assistant 월 요청 수 | ≥ 1,000회 | AI SDK v6 `usage.requests` 집계 | 월간 |
| KPI-P21-5 UI 문자열 한국어 커버리지 | 100% | ESLint `no-hardcoded-strings` 위반 0건 | 주간 |

---

### 3.8 Phase 22 — 100점 완성 (보너스 기능·잔여 갭)

| 항목 | 시작 | 종료 | 변화 |
|------|------|------|------|
| **가중 평균 (North Star)** | 94.1 | **100** | +5.9 |
| 전 카테고리 | 85~95 | 100 | 각 +5~15 |

**핵심 KPI 5개**:

| KPI | 목표치 | 측정 방법 | 측정 주기 |
|-----|--------|---------|---------|
| KPI-P22-1 14 카테고리 전체 90점 이상 달성 | 14개 모두 ≥ 90 | 카테고리별 체크리스트 최종 통과 | Phase 완료 시 |
| KPI-P22-2 전체 통합 E2E 테스트 통과 | 100% (커버 기능 전체) | Playwright E2E suite 통과율 | Phase 완료 시 |
| KPI-P22-3 Supabase 공식 기능 1:1 대조 | ≥ 20개 기능 체크리스트 통과 | Supabase docs vs 양평 기능 대조 수동 감사 | Phase 완료 시 |
| KPI-P22-4 DQ 64건 전수 답변 완료 | 64건 중 64건 | `dq_matrix.md` 미답변 건수 = 0 | Phase 완료 시 |
| KPI-P22-5 재검토 트리거 45건 처리 | 45건 중 45건 적용 또는 명시 유예 | `adr-log.md` 트리거 현황 | Phase 완료 시 |

---

## §4. 14 카테고리별 KPI 매트릭스

> 각 카테고리의 60/80/95/100 단계 정의는 `05-100점-definition.md`에서 직접 인용.

### 4.1 Table Editor (현재: 75점)

| 단계 | 점수 | 기준 (05-100점-definition.md 인용) | 검증 방법 | Leading Indicator |
|------|------|-----------------------------------|---------|-----------------|
| 기반 | 60 | TanStack Table v8 기본 설정 + 기본 CRUD | Playwright E2E 기본 5개 시나리오 통과 | 테이블 로딩 시간 |
| 실용 | 80 | 14c-α 완료: 인라인 편집, 멀티필터, 페이지네이션, CSV 내보내기 | E2E 14c-α 체크리스트 통과 | 편집 성공률 |
| 동등 | 95 | 14c-β 완료: RLS 정책 UI, 정책 시뮬레이터, JSON 셀 뷰어 | `/database/policies` 라우트 E2E | RLS 생성 성공률 |
| 완전 | 100 | 14e 완료: 낙관적 업데이트 + 실시간 변경 감지(Realtime 연계) | Realtime 연동 멀티 탭 동기화 테스트 | WebSocket 연결 수 |

**Leading Indicators 3개**:
- `table_edit_success_rate`: 인라인 편집 성공 / 전체 편집 시도 (목표 ≥ 99%)
- `table_load_p95_ms`: 테이블 초기 로딩 p95 (목표 ≤ 500ms)
- `rls_ui_error_rate`: RLS 정책 생성 실패율 (목표 ≤ 0.5%)

---

### 4.2 SQL Editor (현재: 70점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | Monaco + pg 읽기전용 기초, 구문 강조, 실행 히스토리 | Monaco 로딩 + 기본 쿼리 실행 E2E | Monaco 로드 시간 |
| 실용 | 80 | 즐겨찾기 쿼리, 탭 관리, 결과 CSV, Supabase Studio 패턴 흡수 | 탭 + 즐겨찾기 기능 E2E | 히스토리 저장 성공률 |
| 동등 | 95 | AI 어시스턴트(BYOK), 자연어 → SQL, Explain Plan 시각화, Persisted Query | AI 생성 SQL 실행 성공률 ≥ 80% | AI 요청 지연 p95 |
| 완전 | 100 | Plan Visualizer(그래픽), 팀 스니펫 공유, 파라미터 바인딩 UI | Plan Visualizer 전체 기능 E2E | EXPLAIN 실행 p95 |

**Leading Indicators 3개**:
- `sql_explain_p95_ms`: EXPLAIN 실행 p95 (목표 ≤ 500ms, NFR-PERF.2)
- `ai_sql_success_rate`: AI 생성 SQL 실행 성공률 (목표 ≥ 80%)
- `persisted_query_count`: SQLite 저장 쿼리 누적 수 (참고 지표)

---

### 4.3 Schema Visualizer (현재: 65점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | xyflow 정적 ERD, 관계선, 줌/패닝 | xyflow 렌더링 E2E | 렌더링 시간 |
| 실용 | 80 | schemalint 통합, elkjs 자동 레이아웃, 뷰/함수/트리거 목록 | schemalint 룰 적용 E2E | schemalint 스캔 시간 |
| 동등 | 95 | RLS 정책 UI `/database/policies`, 함수 편집기, 트리거 관리 | 각 신설 라우트 E2E | 정책 편집 성공률 |
| 완전 | 100 | 인터랙티브 관계 편집, 마이그레이션 diff 뷰, AI ERD 생성 | 전체 기능 통합 E2E | AI ERD 생성 지연 |

**Leading Indicators 2개**:
- `schema_viz_render_p95_ms`: ERD 렌더링 p95 (목표 ≤ 1,500ms, NFR-PERF.7)
- `schemalint_warning_count`: 주간 신규 스키마 경고 건수 (임계: > 10건/주)

---

### 4.4 DB Ops (현재: 60점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | node-cron 기반 예약 작업, 기본 wal-g 백업 | cron 실행 로그 확인 | 백업 성공률 |
| 실용 | 80 | UI 기반 Cron 관리, 웹훅 UI, 백업 목록 표시 | 각 UI 기능 E2E | 백업 목록 로딩 |
| 동등 | 95 | RPO 60초 WAL 아카이빙, B2 원격 백업, 복원 드릴 자동화 | DR 리허설 RTO ≤ 30분 실측 | `last_archived_time` 지연 |
| 완전 | 100 | 백업 무결성 자동 검증, 드리프트 감지, 감사 로그 연계 | 자동 복원 테스트 스크립트 통과 | 무결성 체크 성공률 |

**Leading Indicators 3개**:
- `wal_archive_lag_seconds`: WAL 마지막 아카이빙 후 경과 시간 (임계: > 60초, NFR-REL.1)
- `backup_success_rate_7d`: 7일 백업 성공률 (목표 100%, `wal-g` 실패 > 0건 → 즉시 인시던트)
- `b2_replication_lag_minutes`: B2 async 복제 지연 (임계: > 10분)

---

### 4.5 Auth Core (현재: 70점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | 이메일/패스워드 + bcrypt + JWT 발급, 세션 관리 | 기본 로그인 E2E | 로그인 성공률 |
| 실용 | 80 | 사용자 관리 UI, Anonymous 역할, 패스워드 정책 (Lucia 패턴 15개) | 사용자 목록 + 역할 변경 E2E | 사용자 관리 오류율 |
| 동등 | 95 | 로그인 감사 로그, 디바이스 목록, 세션 강제 종료 UI | 감사 로그 append-only 검증 | 감사 로그 지연 |
| 완전 | 100 | 이메일 템플릿 커스터마이징, Impersonation, 계정 삭제 플로우 | 전체 Auth 기능 E2E | Impersonation 로그율 |

**Leading Indicators 3개**:
- `jwt_issuance_rate_rpm`: JWT 발급 rpm (참고 지표, 급증 시 brute-force 의심)
- `session_active_count`: 현재 활성 세션 수 (참고 지표)
- `login_failure_rate`: 로그인 실패율 (임계: > 5%, NFR-SEC.4 연계)

---

### 4.6 Auth Advanced (현재: 15점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 40 | Rate Limit (DB 기반, IP + 계정), 로그인 실패 차단 | k6 부하 테스트로 429 응답 확인 | Rate Limit 발동률 |
| 실용 | 60 | TOTP(otplib) + WebAuthn(simplewebauthn) 동시 지원, Admin MFA 강제 | MFA 등록 + 인증 E2E (TOTP + WebAuthn) | MFA 성공률 |
| 동등 | 80 | OAuth Providers (GitHub, Google), PKCE 플로우 | OAuth 인증 E2E | OAuth 콜백 성공률 |
| 완전 | 100 | 세션 관리 대시보드, 디바이스 목록, MFA 정책 강제(per role) | 전체 Auth Advanced E2E | MFA 강제 적용률 |

**Leading Indicators 3개**:
- `mfa_activation_rate`: Admin 계정 중 MFA 활성화 비율 (목표 100%, NFR-SEC.3)
- `rate_limit_trigger_rate_rpm`: Rate Limit 발동 rpm (임계: 급증 시 공격 의심)
- `webauthn_attestation_success_rate`: WebAuthn attestation 검증 성공률 (목표 ≥ 99%)

---

### 4.7 Storage (현재: 40점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | SeaweedFS 설치, 기본 PUT/GET API | SeaweedFS 상태 확인 + 기본 업로드 E2E | SeaweedFS 헬스 |
| 실용 | 80 | 버킷 관리 UI, 파일 브라우저, 다운로드/삭제, 용량 표시 | 버킷 생성 + 파일 업로드 전체 E2E | 업로드 성공률 |
| 동등 | 95 | 이미지 변환(sharp), Presigned URL, B2 원격 백업, 멀티파트 업로드 | 100MB 멀티파트 업로드 E2E + B2 복제 확인 | 처리량 MB/s |
| 완전 | 100 | Resumable upload(tus 호환), CDN 캐시 통합, 스토리지 통계 대시보드 | tus 재시작 재개 E2E | 스토리지 사용량 |

**Leading Indicators 3개**:
- `storage_upload_throughput_mbs`: 업로드 처리량 (목표 ≥ 80 MB/s, NFR-PERF.6)
- `storage_upload_success_rate`: 업로드 성공률 (목표 ≥ 99.9%)
- `seaweedfs_disk_used_gb`: SeaweedFS 디스크 사용량 (임계: > 40GB 시 B2 오프로드 트리거)

---

### 4.8 Edge Functions (현재: 45점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | isolated-vm v6 L1 기본 실행, JS 샌드박스 | isolated-vm 기본 실행 E2E | L1 cold start 시간 |
| 실용 | 80 | L1 완성(시크릿 주입, 타임아웃, 메모리 제한), UI 에디터 + 배포 UI | L1 전체 기능 E2E + 배포 UI 확인 | 메모리 한계 위반율 |
| 동등 | 95 | Deno 사이드카 L2(npm import), Sandbox 위임 L3, 로그 스트리밍 | 3층 각각 별도 E2E + 로그 스트리밍 확인 | 레이어별 실행 분포 |
| 완전 | 100 | `decideRuntime()` 자동 라우팅, 함수 버전 관리, 지역 실행 통계 | `decideRuntime()` 단위 테스트 100% + 통합 E2E | 라우팅 정확도 |

**Leading Indicators 2개**:
- `edge_fn_cold_start_p95_ms`: cold start p95 (목표 ≤ 50ms, NFR-PERF.4)
- `edge_fn_error_rate`: Edge Function 실행 오류율 (임계: > 0.1%)

---

### 4.9 Realtime (현재: 55점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | wal2json CDC 기반 Postgres 변경 캡처 | wal2json 설치 + 기본 이벤트 수신 E2E | CDC 이벤트 수신율 |
| 실용 | 80 | supabase-realtime 포팅 Channel API, 필터링, 재연결 자동화 | Channel subscribe/unsubscribe + 재연결 E2E | WebSocket 연결 수 |
| 동등 | 95 | Presence + Broadcast, 채널 관리 UI, 연결 상태 모니터링 | Presence 정확도 E2E + 채널 UI 확인 | Presence 정확도 |
| 완전 | 100 | Edge Function 트리거(Realtime → Edge 함수), 이벤트 재생 | 전체 통합 E2E (CDC → Channel → Edge Fn 연쇄) | 이벤트 재생 지연 |

**Leading Indicators 3개**:
- `realtime_wal2json_lag_p95_ms`: wal2json end-to-end 지연 p95 (목표 ≤ 200ms, NFR-PERF.3)
- `realtime_ws_connection_count`: 현재 WebSocket 연결 수 (참고 지표)
- `realtime_reconnect_rate`: 자동 재연결 발생율 (임계: > 5%/시간)

---

### 4.10 Advisors (현재: 65점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | schemalint 컨벤션 검사 통합, 기본 인덱스 제안 | schemalint 실행 + 결과 UI 표시 확인 | schemalint 스캔 시간 |
| 실용 | 80 | 3-Layer Advisor UI (schemalint + squawk + splinter TS 포팅) | 3계층 통합 UI E2E | 룰 커버리지 |
| 동등 | 95 | squawk DDL 검사 CI 연동, 룰 음소거 UI, splinter 38룰 포팅 완성 | splinter 38룰 전체 실행 E2E | 미음소거 경고 수 |
| 완전 | 100 | AI 기반 쿼리 최적화 제안, 커스텀 룰 작성 UI, 역사 트렌드 그래프 | AI 제안 + 커스텀 룰 E2E | AI 제안 수용률 |

**Leading Indicators 2개**:
- `advisor_warning_count_weekly`: 주간 신규 Advisor 경고 건수 (임계: > 10건/주, 품질 저하 신호)
- `rls_disabled_table_count`: RLS 비활성 테이블 수 (목표 ≤ 5%, NFR-SEC.7)

---

### 4.11 Data API (현재: 45점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | REST API 기초(Prisma 기반), 단순 CRUD | 기본 CRUD E2E | API 오류율 |
| 실용 | 80 | REST 강화(OpenAPI 자동생성), pgmq 큐 관리 UI, PostgREST 호환 필터 | PostgREST 호환 쿼리 20개 E2E | API p95 응답 |
| 동등 | 90 | pgmq Archive UI, 웹훅 Outbox 패턴, API 키 관리 | pgmq + Outbox 전체 E2E | pgmq 큐 깊이 |
| 완전 | 100 | pg_graphql(수요 트리거 2개+ 충족 시), Realtime 구독 통합 | GraphQL E2E (조건부) | GraphQL 쿼리 지연 |

**Leading Indicators 3개**:
- `api_p95_response_ms`: REST API p95 응답 (목표 ≤ 300ms, NFR-PERF.5)
- `pgmq_queue_depth`: pgmq 큐 적재 건수 (임계: > 1,000건)
- `pgmq_lag_seconds`: pgmq enqueue → 실행 개시 지연 (목표 ≤ 30초, NFR-PERF.5)

---

### 4.12 Observability (현재: 65점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | Vault(node:crypto AES-256-GCM) 기초, JWKS 엔드포인트 | Vault 암호화 + JWKS 조회 E2E | JWKS 응답 시간 |
| 실용 | 80 | Vault UI, JWKS 자동 갱신, 인프라 상태 페이지 SSE | JWKS 자동 회전 E2E + 인프라 SSE 확인 | KEK 회전 주기 |
| 동등 | 95 | 로그 뷰어 UI, 쿼리 성능 그래프(Recharts), MASTER_KEY 회전 UI | 로그 필터 E2E + 성능 그래프 렌더 확인 | 로그 적재 지연 |
| 완전 | 100 | AI 이상 탐지, 슬랙/이메일 알림, SLA 대시보드 | AI 탐지 + 알림 전송 E2E | SLA 달성률 |

**Leading Indicators 3개**:
- `jwks_rotation_age_hours`: 마지막 JWKS 회전 후 경과 시간 (임계: > 24h, NFR-SEC.1)
- `vault_kek_rotation_age_days`: KEK 마지막 회전 후 경과일 (임계: > 365일, NFR-SEC.2)
- `infra_sse_latency_ms`: 인프라 SSE 이벤트 지연 (목표 ≤ 5,000ms)

---

### 4.13 UX Quality (현재: 75점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | 기본 다크 테마, 한국어 UI, Sonner 알림 | 다크 테마 렌더 + 한국어 문자열 커버리지 | UI 문자열 누락 수 |
| 실용 | 80 | AI SDK v6 + Anthropic BYOK 통합, 자연어 쿼리 생성 | AI Assistant 기본 기능 E2E | AI 응답 지연 |
| 동등 | 95 | MCP 서버 `mcp-luckystyle4u` 구현, AI 비용 투명성 대시보드 | MCP 연결 테스트 + 비용 그래프 확인 | AI 비용 일간 |
| 완전 | 100 | 모바일 반응형, PWA, 접근성 WCAG 2.1 AA | Lighthouse accessibility ≥ 90, WCAG 2.2 AA 수동 감사 | LCP p95 |

**Leading Indicators 2개**:
- `lcp_p95_seconds`: 대시보드 LCP p95 (목표 ≤ 1.8s, NFR-PERF.8)
- `ai_cost_daily_usd`: AI API 일별 지출 (임계: > $0.5/일, NFR-COST.2 연계)

---

### 4.14 Operations (현재: 80점)

| 단계 | 점수 | 기준 | 검증 방법 | Leading Indicator |
|------|------|------|---------|-----------------|
| 기반 | 60 | PM2 cluster:4, Cloudflare Tunnel, 기본 배포 스크립트 | PM2 상태 + Tunnel 연결 확인 | PM2 재시작 횟수 |
| 실용 | 80 | Capistrano-style 배포, symlink 롤백, 헬스체크 자동화 | 배포 E2E + 롤백 5초 E2E | 배포 성공률 |
| 동등 | 95 | Canary 배포(canary.stylelucky4u.com), GitHub Actions CI | Canary 자동 롤백 E2E + CI 통과 확인 | Canary 오류율 |
| 완전 | 100 | 배포 히스토리 UI, 롤백 버튼, 환경변수 관리 UI, Zero-downtime 검증 | 배포 이력 UI E2E + 롤백 버튼 E2E | 배포 다운타임 |

**Leading Indicators 2개**:
- `pm2_restart_count_24h`: 24시간 PM2 재시작 횟수 (임계: > 10회 → 관리자 알림, NFR-REL.3)
- `deploy_success_rate`: 배포 성공률 (목표 ≥ 99%, 실패 시 자동 롤백)

---

## §5. NFR 기반 정량 KPI

> `03-non-functional-requirements.md` 38 NFR 전수 매핑. 모든 항목에 측정 방법·데이터 소스·임계치·초과 시 조치를 포함한다.

### 5.1 NFR-PERF (성능) — 8개

| NFR ID | KPI 이름 | 목표치 | 데이터 소스 | 임계치 | 초과 시 조치 |
|--------|---------|--------|-----------|--------|-----------|
| NFR-PERF.1 | Table Editor 100만 행 정렬 응답 | p95 ≤ 1,200ms (E2E) | Playwright E2E 타임스탬프 | > 1,500ms | PG 인덱스 점검, TanStack 가상화 적용 |
| NFR-PERF.2 | SQL Editor EXPLAIN 실행 시간 | p95 ≤ 500ms (EXPLAIN 단독) | Pino 로그 `explain_duration_ms` | > 750ms | 쿼리 캐시 점검, PG explain 옵션 최적화 |
| NFR-PERF.3 | Realtime wal2json 지연 | p95 ≤ 200ms (E2E) | Canary 테이블 ΔT 측정 24h | > 400ms | wal2json 버퍼 설정 점검, 백프레셔 적용 |
| NFR-PERF.4 | Edge Function cold start | p95 ≤ 50ms | isolated-vm 타임스탬프 1000회 | > 100ms | Isolate 풀링 검토, 스크립트 사전 컴파일 |
| NFR-PERF.5 | API p95 응답 | p95 ≤ 300ms (단순 select/insert) | Prometheus `http_request_duration_seconds{quantile="0.95"}` | > 500ms | Prisma N+1 점검, PG 실행계획 확인 |
| NFR-PERF.5b | pgmq 잡 큐 SLA | enqueue→실행 ≤ 30초 | Prometheus `queue_lag_seconds` | > 60초 | 워커 수 증가, pgmq 우선순위 설정 |
| NFR-PERF.6 | Storage 업로드 처리량 | ≥ 80 MB/s (100MB 파일, Hot write) | `seaweedfs-benchmark` 주간 | < 50 MB/s | SeaweedFS 볼륨 서버 재구성, WSL2 디스크 I/O 점검 |
| NFR-PERF.7 | Schema Viz 렌더링 | p95 ≤ 1,500ms (50테이블) | Chrome DevTools Performance 5회 중앙값 | > 2,000ms | xyflow 뷰포트 기반 lazy 렌더링 적용 |
| NFR-PERF.8 | 대시보드 초기 LCP | p95 ≤ 1,800ms | Lighthouse `largest-contentful-paint` | > 2,500ms | Next.js 번들 분석, 초기 청크 ≤ 250KB(gzip) 점검 |

### 5.2 NFR-SEC (보안) — 10개

| NFR ID | KPI 이름 | 목표치 | 데이터 소스 | 임계치 | 초과 시 조치 |
|--------|---------|--------|-----------|--------|-----------|
| NFR-SEC.1 | JWT JWKS 회전 주기 준수율 | 100% (≤ 24h 간격) | `jwks_key_rotations.rotated_at` vs 현재 시각 | > 24h 미회전 | 즉시 수동 회전 + 원인 분석 |
| NFR-SEC.2 | KEK 회전 주기 준수율 | 100% (≤ 365일) | `vault_kek_rotations.rotated_at` vs 현재 날짜 | > 365일 | 즉시 KEK 회전 + DEK 재암호화 |
| NFR-SEC.3 | Admin MFA 적용률 | 100% | `audit_log WHERE role='admin' AND mfa_method IS NULL` = 0건 | 1건 이상 감지 | 해당 Admin 로그인 즉시 차단 |
| NFR-SEC.4 | Rate Limit 응답 속도 | 429 응답 ≤ 10ms | Pino 로그 `duration` 필드 p95 | > 50ms | DB 인덱스 `rate_limit_bucket` 점검 |
| NFR-SEC.5 | 공용 IP 포트 차단 준수율 | 100% (3000/tcp = filtered) | 주간 `nmap` 외부 스캔 | 1건 이상 오픈 | UFW 규칙 즉시 적용 + PM2 바인딩 재확인 |
| NFR-SEC.6 | Raw SQL 코드베이스 건수 | 0건 | ESLint `no-raw-sql` 리포트 | 1건 이상 | PR 차단, 즉시 파라미터화 |
| NFR-SEC.7 | RLS 활성화 테이블 비율 | ≥ 95% | `pg_class.relrowsecurity` 통계 쿼리 | < 90% | Advisor 경고 + 즉시 RLS 활성화 요청 |
| NFR-SEC.8 | OWASP ZAP baseline scan HIGH | 0건 | OWASP ZAP CI integration 월간 | 1건 이상 | 즉시 취약점 패치 + 릴리스 차단 |
| NFR-SEC.9 | CORS 와일드카드 허용 건수 | 0건 (`Access-Control-Allow-Origin: *` 금지) | E2E 악의 origin 테스트 + 미들웨어 로그 | 1건 이상 | 즉시 CORS 정책 수정 |
| NFR-SEC.10 | Audit Log 불변성 검증 | UPDATE/DELETE 0건 | `audit_log` 대상 DML 트리거 RAISE EXCEPTION 테스트 | 트리거 비작동 | 즉시 트리거 재적용 |

### 5.3 NFR-UX (사용성) — 5개

| NFR ID | KPI 이름 | 목표치 | 데이터 소스 | 임계치 | 초과 시 조치 |
|--------|---------|--------|-----------|--------|-----------|
| NFR-UX.1 | 5대 태스크 평균 완료 시간 | ≤ 2시간 (1인 오너 + 외부 2명) | 수동 시나리오 테스트 + 화면 녹화 | > 3시간 | UX 병목 구간 개선, 온보딩 문서 추가 |
| NFR-UX.2 | 한국어 UI 문자열 커버리지 | 100% | ESLint `no-hardcoded-strings` + kdyi18n 스캔 | < 98% | 누락 문자열 즉시 번역 |
| NFR-UX.3 | WCAG AA 대비비 | ≥ 4.5:1 | Lighthouse accessibility + DevTools Contrast 체커 | < 4.5:1 | 색상 토큰 조정 |
| NFR-UX.4 | 글로벌 단축키 개수 | ≥ 10개 | 수동 체크리스트 + Playwright 키보드 E2E | < 10개 | 단축키 추가 구현 |
| NFR-UX.5 | 에러 메시지 3요소 포함률 | ≥ 95% | `lib/errors/messages.ts` 리뷰 + 수동 샘플링 | < 90% | 에러 메시지 레지스트리 업데이트 |

### 5.4 NFR-REL (신뢰성) — 5개

| NFR ID | KPI 이름 | 목표치 | 데이터 소스 | 임계치 | 초과 시 조치 |
|--------|---------|--------|-----------|--------|-----------|
| NFR-REL.1 | RPO | ≤ 60초 | `pg_stat_archiver.last_archived_time` vs 현재 시각 | > 120초 | `wal-g` 프로세스 재시작 + 원인 분석 |
| NFR-REL.2 | RTO | ≤ 30분 (10GB 기준) | 분기 DR 리허설 실측 타임스탬프 | > 45분 | 복구 스크립트 최적화 + DR 사전 준비물 점검 |
| NFR-REL.3 | PM2 워커 크래시 복구 | ≤ 3초 | PM2 `pm2_restart_duration_ms` 메트릭 | > 10초 | PM2 ecosystem.config 재점검, 메모리 한계 상향 |
| NFR-REL.4 | Canary 롤백 개시 시간 | ≤ 60초 (에러율 > 1% 감지 후) | `deploy_events.rollback_triggered_at` - `canary_start_at` | > 120초 | 모니터링 인터벌 단축 |
| NFR-REL.5 | SPOF 자동 복구 스크립트 | ≥ 4개 컴포넌트 (PG/Next.js/cloudflared/SeaweedFS) | `docs/runbooks/` 스크립트 존재 여부 + 실행 테스트 | < 4개 | 누락 컴포넌트 런북 즉시 작성 |

### 5.5 NFR-MNT (유지보수성) — 4개

| NFR ID | KPI 이름 | 목표치 | 데이터 소스 | 임계치 | 초과 시 조치 |
|--------|---------|--------|-----------|--------|-----------|
| NFR-MNT.1 | 신규 환경 Setup 시간 | ≤ 15분 | WSL2 clean install 타이머 | > 30분 | README quickstart 단계 최적화 |
| NFR-MNT.2 | 수동 SQL 실행 건수 | 0건 (`_prisma_migrations` 외부 SQL 금지) | `audit_log WHERE action='manual_sql'` 카운트 | 1건 이상 | 위반 사유 기록 + 마이그레이션 파일로 전환 |
| NFR-MNT.3 | 테스트 커버리지 (pure 함수) | ≥ 90% (line coverage) | `vitest run --coverage` JSON 출력 | < 80% | PR 차단, 누락 테스트 즉시 추가 |
| NFR-MNT.4 | 문서화 커버리지 | 공개 API docstring 100%, dead link 0건 | TypeDoc 리포트 + `lychee` link checker | dead link 1건 이상 | 즉시 링크 수정 |

### 5.6 NFR-CMP (호환성) — 4개

| NFR ID | KPI 이름 | 목표치 | 데이터 소스 | 임계치 | 초과 시 조치 |
|--------|---------|--------|-----------|--------|-----------|
| NFR-CMP.1 | PostgREST 쿼리 패턴 지원률 | ≥ 80% (기본 패턴) | 호환성 매트릭스 E2E 포팅 테스트 | < 70% | 누락 패턴 구현 우선순위 상향 |
| NFR-CMP.2 | PostgreSQL 버전 지원 | 15, 16, 17 모두 통과 | CI matrix build (`pg_extension` 로딩 테스트) | 1개 버전 실패 | 해당 버전 확장 호환성 수정 |
| NFR-CMP.3 | Node.js 버전 고정 | 24 LTS (`package.json engines.node` 강제) | CI `node --version` 체크 | 24 미만 | `package.json engines` 강제 + 설치 실패 안내 |
| NFR-CMP.4 | WSL2 Ubuntu 22.04 호환 | `linux/amd64` 고정 | `uname -m` 검증 + WSL2 I/O 벤치마크 | ARM64 로드 감지 | 아키텍처 가드 추가 |

### 5.7 NFR-COST (비용) — 2개

| NFR ID | KPI 이름 | 목표치 | 데이터 소스 | 임계치 | 초과 시 조치 |
|--------|---------|--------|-----------|--------|-----------|
| NFR-COST.1 | 월 운영비 | ≤ $10 | Cloudflare + Backblaze billing 대시보드 분기 리뷰 | > $15 | 비용 원인 분석 + B2 스토리지 정리 |
| NFR-COST.2 | 월 AI 비용 | ≤ $5 | AI SDK v6 `usage` 로그 집계 월간 리포트 | > $7 | Haiku 라우팅 비율 강제 상향, Sonnet 사용 제한 |

---

## §6. Leading Indicators — 실시간 대시보드 (`/admin/kpi-dashboard`)

### 6.1 대시보드 설계

**URL**: `/admin/kpi-dashboard`
**갱신 방식**: SSE(Server-Sent Events) + 5초 폴링 혼합
**구성**: 상단 North Star 게이지 + 하단 지표 그리드 (4열 × N행)

### 6.2 실시간 지표 20개+ 목록

| # | 지표명 | 단위 | 목표 | 임계치 | 데이터 소스 | 갱신 주기 |
|---|--------|------|------|--------|----------|---------|
| LI-01 | API 응답 지연 P50 | ms | ≤ 150 | > 300 | Prometheus `http_request_duration_seconds{quantile="0.5"}` | 실시간 |
| LI-02 | API 응답 지연 P95 | ms | ≤ 300 | > 500 | Prometheus `http_request_duration_seconds{quantile="0.95"}` | 실시간 |
| LI-03 | API 응답 지연 P99 | ms | ≤ 800 | > 1,500 | Prometheus `http_request_duration_seconds{quantile="0.99"}` | 실시간 |
| LI-04 | RPS (요청/초) | req/s | 참고 | 급증 감지 | Prometheus `rate(http_requests_total[1m])` | 실시간 |
| LI-05 | API 오류율 (5xx) | % | ≤ 0.1 | > 1.0 | Prometheus `rate(http_requests_total{status=~"5.."}[5m])` / 전체 | 실시간 |
| LI-06 | WebSocket 연결 수 | 개 | 참고 | > 100 | SSE `/api/realtime/stats` 연결 카운트 | 5초 |
| LI-07 | wal2json 지연 P95 | ms | ≤ 200 | > 400 | Canary 테이블 `rt_probe` ΔT 이동 평균 | 30초 |
| LI-08 | pgmq 큐 깊이 | 건 | ≤ 100 | > 1,000 | pgmq `pgmq_metrics()` 쿼리 | 30초 |
| LI-09 | pgmq 처리 지연 | 초 | ≤ 30 | > 60 | Prometheus `queue_lag_seconds` | 실시간 |
| LI-10 | JWT 발급률 | req/min | 참고 | 급증 시 브루트포스 의심 | `audit_log WHERE action='jwt_issued'` 1분 집계 | 1분 |
| LI-11 | Rate Limit 발동률 | req/min | ≤ 10 | > 50 | `rate_limit_bucket.hit_count` 1분 집계 | 1분 |
| LI-12 | PM2 재시작 횟수 (24h) | 회 | ≤ 3 | > 10 | PM2 `pm2_restart_count` | 5분 |
| LI-13 | WAL 아카이빙 지연 | 초 | ≤ 60 | > 120 | `pg_stat_archiver.last_archived_time` vs NOW() | 30초 |
| LI-14 | SeaweedFS 디스크 사용량 | GB | ≤ 40 | > 45 | `df -h /opt/seaweedfs/vol` + SeaweedFS API | 5분 |
| LI-15 | JWKS 마지막 회전 경과 | 시간 | ≤ 24 | > 24 | `jwks_key_rotations.rotated_at` vs NOW() | 5분 |
| LI-16 | 로그인 실패율 | % | ≤ 5 | > 10 | `audit_log WHERE action='login_failed'` 비율 | 5분 |
| LI-17 | Edge Fn cold start P95 | ms | ≤ 50 | > 100 | isolated-vm 타임스탬프 집계 | 5분 |
| LI-18 | 대시보드 LCP P95 | 초 | ≤ 1.8 | > 2.5 | Lighthouse 주간 자동 실행 + 캐시 | 주간 |
| LI-19 | AI API 일별 지출 | USD | ≤ 0.5 | > 0.8 | Anthropic API `usage.cost` 일별 집계 | 일간 |
| LI-20 | RLS 비활성 테이블 수 | 개 | 0 | ≥ 1 | `SELECT count(*) FROM pg_class WHERE relrowsecurity = false AND relkind = 'r'` | 일간 |
| LI-21 | Canary 오류율 | % | ≤ 1.0 | > 1.0 (→ 자동 롤백) | `deploy_events.canary_error_rate` | 배포 시 |
| LI-22 | B2 복제 지연 | 분 | ≤ 10 | > 15 | `rclone` 복제 지연 로그 | 30분 |
| LI-23 | MFA 미설정 Admin 수 | 명 | 0 | ≥ 1 | `users WHERE role='admin' AND mfa_enabled=false` | 일간 |
| LI-24 | 활성 세션 수 | 개 | 참고 | 급증 시 공유 계정 의심 | `sessions WHERE expires_at > NOW()` 카운트 | 5분 |
| LI-25 | 주당 대시보드 세션 수 | 회 | ≥ 5 | < 5 (관심도 저하 경고) | `audit_log WHERE action='dashboard_visit'` 주간 집계 | 주간 |

### 6.3 Prometheus-like 쿼리 예시 (의사 코드)

```typescript
// src/lib/metrics/queries.ts 의사 코드

// LI-02: API p95 응답
const API_P95_QUERY = `
  SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
  FROM request_logs
  WHERE created_at > NOW() - INTERVAL '5 minutes'
`;

// LI-07: wal2json 지연 이동 평균
const WAL2JSON_LAG_QUERY = `
  SELECT AVG(receive_ts - insert_ts) AS avg_lag_ms,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY receive_ts - insert_ts) AS p95_lag_ms
  FROM rt_probe
  WHERE insert_ts > NOW() - INTERVAL '24 hours'
`;

// LI-08: pgmq 큐 깊이
const PGMQ_DEPTH_QUERY = `SELECT * FROM pgmq.metrics('default_queue')`;

// LI-20: RLS 비활성 테이블
const RLS_INACTIVE_QUERY = `
  SELECT count(*) as cnt
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relkind = 'r'
    AND c.relrowsecurity = false
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', '_prisma_migrations')
`;
```

### 6.4 알림 임계치 및 채널

| 심각도 | 조건 | 알림 채널 | 자동 조치 |
|-------|------|---------|---------|
| CRITICAL | `wal-g` 실패, JWKS 24h 미회전, MFA 미설정 Admin 감지 | 브라우저 알림 + 이메일 | 없음 (수동 대응 필수) |
| WARNING | API 오류율 > 1%, pgmq 큐 > 1,000건, PM2 재시작 > 10회/24h | 대시보드 배너 | Canary 에러율 > 1% → 자동 롤백 |
| INFO | 지출 > $0.5/일, SeaweedFS 45GB 초과 | 대시보드 카드 색상 변경 | 없음 |

---

## §7. Lagging Indicators — 분기 리포트

**저장 위치**: `docs/kpi-reports/YYYY-QN/lagging-report.md`
**작성 주기**: 분기 1회 (3개월 말)
**담당**: 운영자(김도영) 직접 작성

### 7.1 분기 리포트 12개 지표

| # | 지표명 | 단위 | 측정 방법 | 목표 기준 |
|---|--------|------|---------|---------|
| LA-01 | North Star 점수 분기 추이 | 점 | 분기 초 vs 분기 말 North Star 산출 | 분기당 +5점 이상 |
| LA-02 | 카테고리별 점수 추이 (14개) | 점 | 카테고리 체크리스트 자가 평가 | 후퇴 카테고리 0개 |
| LA-03 | 기술 부채 건수 변화 | 건 | GitHub Issues `label:tech-debt` 오픈/클로즈 차이 | 분기 순감소 |
| LA-04 | 발견된 보안 취약점 건수 | 건 | OWASP ZAP 보고서 + CVE 모니터링 | HIGH 0건, MEDIUM ≤ 3건 |
| LA-05 | 패치 적용 평균 지연 | 일 | CVE 발표 날짜 → 패치 커밋 날짜 차이 평균 | HIGH CVE ≤ 7일, MEDIUM ≤ 30일 |
| LA-06 | MTTR (평균 복구 시간) | 분 | 인시던트 로그 집계 (`docs/incidents/`) | ≤ 30분 |
| LA-07 | 월 다운타임 평균 | 분 | Cloudflare Tunnel uptime 리포트 + 자체 측정 | ≤ 5분/월 |
| LA-08 | 실제 TCO vs 예측 | USD | 청구서 합산 vs 분기 초 예측 | ≤ 110% (예측의 110% 이하) |
| LA-09 | 운영 실투입 시간 | h/주 | 자체 타임 로그 (`docs/kpi-reports/time-log.md`) | ≤ 1h/주 |
| LA-10 | DR 리허설 실시 횟수 | 회 | `docs/kpi-reports/dr-drills/` 리허설 기록 | ≥ 1회/분기 |
| LA-11 | Vitest 커버리지 추이 | % | `vitest run --coverage` 분기 스냅샷 | ≥ 90% (pure 함수) |
| LA-12 | Phase 목표 달성률 | % | Phase 계획 대비 실제 완료 KPI 비율 | ≥ 80% |

---

## §8. 사용자 만족도 측정

> 1인 운영 환경에서 "사용자 = 운영자 본인"이므로, 자가 평가와 사용 패턴 로그로 측정한다.

### 8.1 Self-NPS (자가 평가, 주 1회)

**측정 방법**: 매주 월요일, 운영자가 `docs/kpi-reports/self-nps/YYYY-WW.md`에 직접 기록.

**질문 4개**:

| 질문 | 척도 | 목표 |
|------|------|------|
| "이 대시보드를 다른 1인 개발자에게 추천하겠는가?" | 0~10점 | ≥ 8 |
| "오늘 업무 중 대시보드 때문에 막힌 적 있는가?" | 0=없음, 1=한번, 2=여러번 | ≤ 0.5 평균 |
| "이 대시보드가 없으면 다시 Supabase Cloud로 돌아갈 것인가?" | Yes/No | No 유지 |
| "이번 주 대시보드 사용 만족도는?" | 1~5점 | ≥ 4 |

**임계치**: Self-NPS가 3주 연속 7점 이하 → 해당 카테고리 긴급 개선 검토.

### 8.2 기능 사용 빈도 로그

**측정 방법**: `audit_log WHERE action LIKE 'dashboard_%'` 주간 집계.

| 기능 | 지표 | 목표 |
|------|------|------|
| Table Editor 방문 | 주간 방문 수 | ≥ 10회/주 |
| SQL Editor 쿼리 실행 | 주간 실행 수 | ≥ 20회/주 |
| Advisors 확인 | 주간 방문 수 | ≥ 3회/주 |
| 백업 상태 확인 | 주간 방문 수 | ≥ 1회/주 |

**해석**: 특정 기능 방문 수가 0으로 떨어지면 해당 기능 UX 문제 또는 불필요성 신호.

### 8.3 에러 경험 빈도

**측정 방법**: `audit_log WHERE action='user_error_encountered'` + Sonner 알림 표시 횟수.

| 지표 | 목표 | 임계치 |
|------|------|--------|
| 주간 사용자 노출 에러 수 | ≤ 5건/주 | > 20건/주 → UX 긴급 점검 |
| "Unknown error" 류 에러 비율 | ≤ 1% | > 3% → 에러 레지스트리 보완 |

### 8.4 "다시 Supabase로 갈까?" 결심 트래킹

**측정 방법**: 월 1회 `docs/kpi-reports/YYYY-MM/supabase-comparison.md` 작성.

| 항목 | 기록 내용 |
|------|---------|
| 이번 달 Supabase Cloud에서 못한 일 | 양평에서 대신 처리한 것 목록 |
| 양평에서 오히려 더 편했던 것 | 긍정 경험 목록 |
| Supabase Cloud가 앞선 기능 | 아직 미구현 갭 추적 |
| "다시 돌아갈 생각이 있는가" | Yes/No + 이유 |

**목표**: 매월 "No" 유지. 12개월 연속 No → 100점 달성의 비화폐적 증거.

---

## §9. 비용 KPI

### 9.1 비용 KPI 5개

| # | KPI 이름 | 목표치 | 데이터 소스 | 측정 주기 | 임계치 | 초과 시 조치 |
|---|---------|--------|-----------|---------|--------|-----------|
| COST-1 | 월 실제 총 지출 | ≤ $10 | Cloudflare billing + Backblaze billing + Anthropic billing 합산 | 월간 | > $15 | 항목별 원인 분석 + B2 정리 또는 AI 다운그레이드 |
| COST-2 | AI API 일별 지출 | ≤ $0.5/일 | Anthropic API usage 대시보드 일별 집계 | 일간 | > $0.8/일 | Sonnet 라우팅 비율 0%로 강제 하향 |
| COST-3 | B2 스토리지 사용량 | ≤ 100GB | Backblaze B2 Storage 콘솔 | 주간 | > 80GB | 오래된 백업 자동 삭제 정책 트리거 |
| COST-4 | 예산 대비 실제 지출 비율 | ≤ 110% | (실제 월 지출) / (분기 초 예측 월 예산) × 100 | 분기 | > 150% | 지출 원인 분석 + 다음 분기 예산 조정 |
| COST-5 | 3년 누적 TCO | ≤ $250 (전기+B2+AI, 서버 하드웨어 제외) | 월간 지출 × 36개월 누적 합산 | 분기 | > $400 | 비용 구조 재검토 |

### 9.2 비용 분기 리포트 양식

`docs/kpi-reports/YYYY-QN/cost-report.md`에 다음 항목 기록:

```markdown
## YYYY-QN 비용 리포트

| 항목 | 이번 분기 | 전분기 | 변화 | 연간 환산 |
|------|---------|--------|------|---------|
| Cloudflare (도메인) | $X | $X | ±$ | $X |
| Backblaze B2 | $X | $X | ±$ | $X |
| Anthropic AI API | $X | $X | ±$ | $X |
| 기타 | $0 | $0 | $0 | $0 |
| **합계** | **$X** | **$X** | **±$** | **$X** |

예산 대비: X% (목표 ≤ 110%)
특이사항: ...
```

---

## §10. 보안 KPI

### 10.1 보안 KPI 6개

| # | KPI 이름 | 목표치 | 데이터 소스 | 측정 주기 | 임계치 | 초과 시 조치 |
|---|---------|--------|-----------|---------|--------|-----------|
| SEC-1 | JWT 토큰 회전 주기 준수율 | 100% (≤ 24h 간격) | `jwks_key_rotations` 테이블 + 자동 감시 스크립트 | 실시간 | > 24h 미회전 감지 | 즉시 수동 회전 + CRITICAL 알림 발송 |
| SEC-2 | 패치 적용 지연 (HIGH CVE) | ≤ 7일 | CVE 발표일 vs GitHub 커밋 날짜 차이 | 이슈 발생 시 | > 14일 | 긴급 패치 작업 시작 + 리스크 기록 |
| SEC-3 | 실패 로그인 비율 | ≤ 5% | `audit_log WHERE action='login_failed'` / 전체 로그인 시도 | 5분 | > 10% (15분 지속) | IP 차단 + Rate Limit 강화 |
| SEC-4 | MFA 활성 비율 (Admin) | 100% | `users WHERE role='admin' AND mfa_enabled=false` = 0건 | 일간 | ≥ 1건 | 해당 Admin 로그인 즉시 차단 + 알림 |
| SEC-5 | RLS 활성화 테이블 비율 | ≥ 95% | `pg_class.relrowsecurity` 통계 | 주간 | < 90% | Advisor 경고 + 비활성 테이블 opt-out 이유 기록 |
| SEC-6 | OWASP ZAP HIGH 취약점 | 0건 | OWASP ZAP 월간 baseline scan | 월간 | 1건 이상 | 즉시 패치 + 릴리스 차단 |

### 10.2 보안 분기 감사 체크리스트

`docs/security/quarterly-audit-YYYY-QN.md`에 다음 항목 기록:

```markdown
## 보안 분기 감사

- [ ] OWASP ZAP baseline scan 실행 → HIGH 0건, MEDIUM ≤ 3건
- [ ] JWKS 회전 이력 확인 → 분기 중 ≥ 3회 회전
- [ ] KEK 회전 예정일 확인 → 다음 회전까지 남은 일수
- [ ] 실패 로그인 패턴 검토 → 비정상 IP 블랙리스트 업데이트
- [ ] npm audit 실행 → CRITICAL 0건, HIGH 즉시 패치
- [ ] `/etc/luckystyle4u/secrets.env` 권한 확인 → 0640 root:ypb-runtime
- [ ] Cloudflare Tunnel 설정 확인 → 외부 포트 노출 0건
- [ ] audit_log 불변성 테스트 → UPDATE/DELETE 트리거 작동 확인
```

---

## §11. 100점 도달 최종 검증 프로토콜 (Phase 22)

### 11.1 공식 판정 기준 — 모두 충족 시 "100점 달성" 선언

**체크리스트 A: 카테고리 점수**

```
□ A-01 Table Editor    ≥ 95점 (자가 평가 체크리스트 통과)
□ A-02 SQL Editor      ≥ 95점
□ A-03 Schema Viz      ≥ 95점
□ A-04 DB Ops          ≥ 95점
□ A-05 Auth Core       ≥ 95점
□ A-06 Auth Advanced   ≥ 95점
□ A-07 Storage         ≥ 95점
□ A-08 Edge Functions  ≥ 92점 (3층 하이브리드 상한)
□ A-09 Realtime        ≥ 95점
□ A-10 Advisors        ≥ 95점
□ A-11 Data API        ≥ 85점 (GraphQL 조건부 미도입 시 최대치)
□ A-12 Observability   ≥ 95점
□ A-13 UX Quality      ≥ 95점
□ A-14 Operations      ≥ 95점
□ A-15 가중 평균 ≥ 95.0점 (§2 공식 산출)
```

**체크리스트 B: P0 기능 요구사항 구현**

```
□ B-01 FR-5 Auth Core 전 P0 FR 구현 완료
□ B-02 FR-6 Auth Advanced 전 P0 FR 구현 완료 (MFA 강제, Rate Limit)
□ B-03 FR-7 Storage P0 FR 구현 완료 (버킷 관리, 업로드 API)
□ B-04 FR-9 Realtime P0 FR 구현 완료 (CDC + Channel)
□ B-05 FR-12 Observability P0 FR 구현 완료 (Vault + JWKS)
□ B-06 FR-14 Operations P0 FR 구현 완료 (Canary + 롤백)
```

**체크리스트 C: NFR 전체 충족**

```
□ C-01 NFR-PERF 8개 전부 통과 (측정 결과 임계치 이하)
□ C-02 NFR-SEC 10개 전부 통과 (OWASP ZAP HIGH 0건 포함)
□ C-03 NFR-UX 5개 전부 통과 (WCAG AA 포함)
□ C-04 NFR-REL 5개 전부 통과 (RPO ≤ 60초, RTO ≤ 30분 DR 리허설 실증)
□ C-05 NFR-MNT 4개 전부 통과 (테스트 커버리지 ≥ 90%)
□ C-06 NFR-CMP 4개 전부 통과 (PG 15/16/17 CI 통과)
□ C-07 NFR-COST 2개 전부 통과 (월 ≤ $10)
```

**체크리스트 D: DQ 및 재검토 트리거**

```
□ D-01 DQ 64건 전수 답변 완료 (07-dq-matrix.md 미답변 = 0건)
□ D-02 재검토 트리거 45건 전부 적용 완료 또는 "현재 조건 미충족 — 유예" 명시
□ D-03 ADR-001~018 모든 결정 재검토 완료 (변경 필요 시 신규 ADR 등록)
```

**체크리스트 E: 외부 검증 — Supabase 공식 기능 1:1 대조**

아래 20개+ 기능에 대해 Supabase Cloud 공식 문서와 양평 대시보드를 1:1로 대조하고, 각 항목에 "동등 / 동등 미만 5% 이내 / 미구현" 중 하나 판정:

```
□ E-01 Table Editor: 인라인 편집 (Supabase vs 14c-α)
□ E-02 Table Editor: RLS 정책 UI (Supabase vs 14c-β)
□ E-03 SQL Editor: Monaco + AI 어시스턴트 (Supabase vs 양평 AI SDK)
□ E-04 SQL Editor: EXPLAIN Plan Visualizer (Supabase vs 양평 그래픽 뷰)
□ E-05 Schema: ERD 뷰어 (Supabase vs xyflow/elkjs)
□ E-06 Schema: 함수/트리거 관리 (Supabase vs 자체 UI)
□ E-07 DB Ops: Cron 예약 작업 UI (Supabase vs node-cron UI)
□ E-08 DB Ops: 백업/복원 (Supabase PITR vs wal-g + B2)
□ E-09 Auth: 이메일/패스워드 (Supabase gotrue vs jose + bcrypt)
□ E-10 Auth: MFA TOTP (Supabase vs otplib)
□ E-11 Auth: MFA WebAuthn (Supabase vs simplewebauthn)
□ E-12 Auth: 세션 관리 UI (Supabase vs 자체 sessions 테이블 UI)
□ E-13 Storage: 파일 업로드 (Supabase S3 vs SeaweedFS)
□ E-14 Storage: 이미지 변환 (Supabase imgproxy vs sharp)
□ E-15 Storage: Presigned URL (Supabase vs 자체 구현)
□ E-16 Edge Functions: JS 실행 (Supabase Deno vs isolated-vm L1)
□ E-17 Edge Functions: npm 패키지 (Supabase Deno npm vs Deno L2)
□ E-18 Realtime: Postgres Changes (Supabase wal vs wal2json)
□ E-19 Realtime: Presence (Supabase vs 자체 구현)
□ E-20 Realtime: Broadcast (Supabase vs 자체 구현)
□ E-21 Advisors: 인덱스 제안 (Supabase vs schemalint + squawk)
□ E-22 Data API: REST PostgREST 호환 (Supabase vs 자체 REST 강화)
□ E-23 Observability: 로그 뷰어 (Supabase vs 자체 로그 UI)
□ E-24 Observability: 쿼리 성능 (Supabase vs Recharts 그래프)
```

**판정 기준**:
- "동등": 기능 동일 또는 양평이 오히려 우위
- "동등 미만 5% 이내": 사소한 차이, 운영 지장 없음
- "미구현": 해당 기능 부재 — 100점 선언 불가

**100점 선언 조건**: E-01~E-24 중 "미구현" 0건, "동등 미만 5% 이내" ≤ 5건.

### 11.2 100점 선언 이후 관리

```
100점 달성 선언 후:
1. docs/kpi-reports/100-point-declaration.md 작성
2. 분기별 유지 점검 (점수 후퇴 ≤ 3점 허용, 이하 즉시 재작업)
3. Wave 1-2 채택안 재검토 (2년 주기): 기술 부채 정리
4. 오픈소스 릴리스 검토 (24M 목표): MIT/Apache-2.0 이중 라이선스
```

---

## §12. KPI 거버넌스

### 12.1 리뷰 리듬

| 주기 | 활동 | 담당 | 산출물 |
|------|------|------|--------|
| **실시간** | Leading Indicators 모니터링 (`/admin/kpi-dashboard`) | 자동 (SSE + Prometheus) | 대시보드 알림 |
| **일간** | JWKS 회전 확인, WAL 아카이빙 상태, MFA 미설정 Admin | 자동 cron (07:00 KST) | Sonner 알림 |
| **주간** | North Star 점수 계산, 테스트 커버리지, 보안 스캔 | GitHub Actions (`weekly-kpi.yml`) | `docs/kpi-reports/YYYY-MM/weekly-WW.json` |
| **Phase 완료 시** | Phase KPI 달성 여부 판정 | 운영자(김도영) | Phase 완료 보고서 |
| **월간** | 비용 리포트, AI 비용 집계, Self-NPS 집계 | 운영자 | `docs/kpi-reports/YYYY-MM/monthly.md` |
| **분기** | Lagging Indicators 집계, DR 리허설, 보안 감사, 분기 OKR 점검 | 운영자 | `docs/kpi-reports/YYYY-QN/` 전체 |

### 12.2 책임자

1인 운영 체계이므로 모든 KPI의 책임자는 **운영자(김도영)** 단독.

단, 자동화 도구가 다음 역할을 대신:
- Prometheus + Pino: 실시간 지표 수집
- GitHub Actions: 주간 KPI 계산 + 리포트 생성
- ESLint + Vitest: 코드 품질 지표 자동 측정
- OWASP ZAP: 보안 취약점 자동 스캔

### 12.3 기록 위치

```
docs/kpi-reports/
├── checklists/          ← 카테고리별 체크리스트 YAML
│   ├── 01-table-editor.yml
│   ├── 02-sql-editor.yml
│   └── ... (14개)
├── YYYY-QN/             ← 분기 리포트
│   ├── lagging-report.md
│   ├── cost-report.md
│   ├── security-audit.md
│   └── dr-drill.md
├── YYYY-MM/             ← 월간 리포트
│   ├── monthly.md
│   ├── weekly-WW.json   ← GitHub Actions 산출
│   └── north-star.json
├── self-nps/            ← 주간 자가 평가
│   └── YYYY-WW.md
└── 100-point-declaration.md  ← Phase 22 완료 후 작성
```

### 12.4 KPI 변경 프로세스

KPI 수치 변경이 필요할 경우 (예: NFR 재조정, 기술 환경 변화):

1. `docs/research/decisions/` ADR 등록 (ADR-019+)
2. 이 문서(`07-success-metrics-kpi.md`) 해당 섹션 업데이트
3. `docs/kpi-reports/checklists/` YAML 업데이트
4. 변경 이력 아래 표에 기록

### 12.5 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|-------|---------|
| 1.0 | 2026-04-18 | Wave 5 · R4 에이전트 (Sonnet 4.6) | 초안 작성 — 전 섹션 §1~§12 완성, KPI 127개 |

---

> **산출물 끝.** Wave 5 · R4 · 2026-04-18 · 양평 부엌 서버 대시보드 — Supabase 100점 동등성 KPI 문서.
> 다음 문서: `05-roadmap/` 다른 Wave 5 산출물 (R1~R3, S1~S2, A1)
