# 00 — 1인 운영자 N=20 운영 시나리오 검증

- 상태: ACCEPTED (2026-04-26 세션 58 후속, validation Wave)
- 작성: BaaS Foundation 04-validation Sub-agent
- 작성일: 2026-04-26
- 전제 결정 (잠금):
  - ADR-022: 옵션 A (1인-N프로젝트 closed multi-tenant BaaS)
  - ADR-023: 옵션 B (shared schema + RLS + Prisma Client Extensions)
  - ADR-024: 옵션 D (Hybrid — Complex=workspace / Simple=manifest)
  - ADR-025: 옵션 A (단일 인스턴스, Phase 4 옵션 D 진화)
  - ADR-026: 옵션 C (Hybrid — TS manifest.ts + DB 운영 토글)
  - ADR-027: 옵션 A (URL path `/api/v1/t/<tenant>/...`) + K3 (3중 검증)
  - ADR-028: 옵션 D (worker_threads pool → pg-boss 단계적)
  - ADR-029: M1+L1+T3 (SQLite-only) + Operator Console
- 목적: ADR-022~029 결정의 종합 결과로 "1인 운영자가 N=20 컨슈머를 운영할 수 있는가"를 시나리오 기반으로 검증
- 산출물 위치: `docs/research/baas-foundation/04-architecture-wave/04-validation/00-operations-scenarios.md`

---

## 0. 검증 결론 (TL;DR)

| 항목 | 결과 |
|------|------|
| **N=2 (현재 + Almanac) 가능?** | ✅ — 주 2시간, 자동화 없이도 운영 가능 |
| **N=5 가능?** | ✅ — 주 5시간, Operator Console 필수 |
| **N=10 가능?** | ✅ 조건부 — 주 12시간, 자동화 5종 모두 필수, Phase 4 진화 트리거 |
| **N=20 가능?** | ✅ 조건부 — 주 25시간 (한계점), 자동화 5종 + 셀프서비스 관리 도구 + tenant onboarding 스크립트 |
| **N=20 불가능 조건** | 자동화 누락 시 주 50h+ 폭증, 1인 한계 명백 초과 |
| **핵심 자동화 5종** | (1) Operator Console, (2) SLO+알림, (3) circuit breaker, (4) RLS e2e 테스트, (5) tenant onboarding 스크립트 |

본 문서는 위 결론을 "운영 부담 차원 정의 → N단계별 시나리오 → 일상 시나리오 10개 → 자동화 5종 → 한계 측정 지표" 5단계로 검증한다.

---

## 1. 운영 부담 차원

1인 운영자의 시간 소비를 4 시간 척도로 분해한다. 각 차원은 **자동화로 흡수되는 부분**과 **사람만 할 수 있는 부분**을 구분한다.

### 1.1 시간당 (Hourly cadence)

| 활동 | 사람 필요? | 시간 |
|------|----------|------|
| Cron tick 자체 처리 | ❌ 자동 (node-cron + worker pool) | 0초 (background) |
| Cron 실행 결과 audit log 기록 | ❌ 자동 (ADR-021 fail-soft + ADR-029 tenant_id) | 0초 |
| Operator Console refresh | △ 운영자 자발적 모니터링 | 0~30초 (alert 없으면 0) |
| Audit-failure 카운터 모니터링 | ❌ 자동 (ADR-021 §amendment-1) | 0초 |

**결론**: 시간당 사람 부담 ~0. 단, alert가 발생하면 §3 시나리오로 즉시 응답 필요.

### 1.2 일별 (Daily cadence)

| 활동 | 사람 필요? | 시간/일 |
|------|----------|--------|
| Operator Console 1회 점검 (BAD/WRN tenant 확인) | ✅ | 5~10분 |
| 알림 응답 (Telegram/이메일) | ✅ (alert 발생 시) | 알림 1건당 5~15분 |
| audit_logs 이상 패턴 검토 (`cross_tenant_attempt` 등) | △ (이상 패턴 발견 시만) | 0~10분 |
| 미해결 cron 실패 재시도 결정 | ✅ | 0~5분 |

**결론**: alert 0건 / 평온한 날 = ~10분. alert 1건 = +15분.

### 1.3 주별 (Weekly cadence)

| 활동 | 사람 필요? | 시간/주 |
|------|----------|--------|
| 새 컨슈머 onboarding (있으면) | ✅ | 30분(자동화 후 5분) |
| 코드 패치 배포 (ADR-020 standalone) | ✅ | 15~30분 (build+rsync+pm2 reload) |
| 주간 SLO 리포트 검토 | ✅ | 15~30분 |
| ADR-021 빌드 게이트 위반 점검 | ✅ | 5~10분 |
| Operator Console 주간 추세 점검 | ✅ | 15~30분 |
| Cron 실패 재발 패턴 분석 | △ | 0~30분 |

**결론**: 주 1.5~2.5시간 (consumer onboarding 1건/주 가정).

### 1.4 월별 (Monthly cadence)

| 활동 | 사람 필요? | 시간/월 |
|------|----------|--------|
| 비용/리소스 검토 (PG 디스크, SeaweedFS, 트래픽) | ✅ | 30~60분 |
| ADR 갱신/추가 (필요 시) | ✅ | 1~3시간 |
| 7원칙 위반 자동 리포트 검토 | ✅ | 30분 |
| 보안 패치/의존성 업데이트 (`pnpm update`) | ✅ | 30~60분 |
| Tenant manifest 정합성 점검 (DB row vs `packages/tenant-*/`) | ✅ | 30분 |
| Backup 무결성 검증 (`pg_dump --schema=public` + restore test) | ✅ | 30~60분 |

**결론**: 월 4~8시간.

### 1.5 차원 종합 — 평상시 (alert 없는 경우)

```
시간당 ×24h ×7day = 0h
일별   ×7day        = 1.2h
주별                 = 2.0h
월별/4(주)          = 1.5h
─────────────────────────
주 합계              ≈ 4.7h (N=2~3 평상시)
```

이 베이스라인 위에 **N이 증가하면서 추가되는 부담**을 §2에서 단계별로 측정한다.

---

## 2. N=2 / 5 / 10 / 20 단계별 시나리오

각 단계는 (a) 인프라 구성, (b) 주간 운영 부담, (c) 새로 발생하는 부담, (d) 1인 가능 여부를 정리한다.

### 2.1 N=2 (현재 + Almanac, Phase 1~2)

**구성** (ADR-025 옵션 A 그대로):
- 단일 PM2 fork, 단일 PostgreSQL, 단일 SeaweedFS, 단일 Cloudflare Tunnel
- Tenant: `default` (yangpyeon-default 운영자 작업) + `almanac` (Complex workspace, ADR-024)
- Cron: 5~10개 (Almanac 5 + default 2~3)
- 트래픽: ~1k req/일

**주간 운영 부담**: **~2~3시간**

| 항목 | 시간 |
|------|------|
| 평상시 일별/주별/월별 (§1.5) | 4.7h |
| -- 단, N=2이므로 onboarding/주간 SLO 검토 비중 낮음 | -2h |
| 합계 | **~2.7h/주** |

**주요 작업**:
- Almanac cron 5개 정상 작동 확인 (Operator Console 1일 1회)
- 주간 RSS/HTML 신규 소스 추가 (필요 시)
- 알림 거의 없음

**1인 가능?**: ✅ 매우 여유. **자동화 5종 미도입 상태에서도 운영 가능**.

**Wave 1-5 결정과의 정합**:
- ADR-025 옵션 A: 현재 인프라 그대로
- ADR-021 fail-soft + 빌드 게이트: 변경 없음
- ADR-029 Operator Console: Phase 14.5 도입 권고이지만 N=2까지는 미도입도 가능

---

### 2.2 N=5 (Phase 3 진입, 4개월 후 가정)

**구성**:
- 단일 PM2 fork → cluster:4 진입 검토 (SP-010 임계값 도달 시)
- Tenant: `default`, `almanac`, `kdy-blog`, `recipe`, `memo` 가정
- Cron: ~25개 (5 tenant × 평균 5)
- 트래픽: ~10k req/일

**주간 운영 부담**: **~5~6시간**

| 항목 | 시간 |
|------|------|
| 평상시 베이스라인 (§1.5) | 4.7h |
| + tenant 5개 Operator Console 점검 (5분 × 7일) | 0.6h |
| + 새 tenant 1개/2주 onboarding 평균 | 0.3h |
| + N개 cron 실패 패턴 분석 | 0.4h |
| 합계 | **~6.0h/주** |

**새 부담**:
- Operator Console 빨간 ROW 발생 빈도 ↑ (월 2~5건)
- audit_logs grep 시 tenant_id 차원 분리 필수 → ADR-029 Phase 1 (18h) 완료 가정
- API key 발급/회전 작업 발생 (월 1~2회)
- RLS 정책 검증 자동 e2e 테스트 매주 1회 수동 트리거 또는 CI

**1인 가능?**: ✅ — 단, **자동화 5종 중 (1) Operator Console, (4) RLS e2e 테스트 도입 필수**.

**Phase 16 진입 트리거 검토**:
- p95 응답 지연 > 200ms? → 아직 미도달일 가능성 높음 (트래픽 10k/일)
- 503 에러율 > 0.1%? → 모니터링 필요

---

### 2.3 N=10 (Phase 4 진입, 8개월 후 가정)

**구성**:
- PM2 cluster:4 진입 (SP-010 임계값 도달 가정) 또는 옵션 D (worker pool) 검토
- Tenant: 10개 (Complex 4 + Simple 6 가정 — ADR-024 옵션 D 분포)
- Cron: ~50개 (10 tenant × 평균 5)
- 트래픽: ~50k req/일

**주간 운영 부담**: **~12~14시간**

| 항목 | 시간 |
|------|------|
| 평상시 베이스라인 (§1.5) | 4.7h |
| + Operator Console 일일 점검 강화 (10분 × 7일) | 1.2h |
| + 새 tenant 1~2개/월 onboarding (자동화 후) | 0.5h |
| + cron 실패 회로 차단 응답 (월 5~8건) | 1.5h |
| + API key 회전/발급 (월 4~6건) | 1.0h |
| + RLS 정책 검토 + e2e 결과 분석 | 1.0h |
| + 주간 SLO 리포트 검토 (자동 생성) | 1.0h |
| + 패치 배포 (월 3~5회) | 1.0h |
| 합계 | **~12.0h/주** |

**새 부담**:
- ADR-028 옵션 D (worker_threads pool) 진입 — Phase 4 진화 트리거
- ADR-025 §5.2 코드 추상화 격리 경계 5종 모두 가동 중 (즉시 도입은 옵션 A 채택 시)
- ADR-029 Phase 4 (OTel 도입) 진입 검토 트리거 (트리거 D)
- Tenant 등록/등록 해제 자동화 스크립트 필수
- pg-boss 도입 검토 (ADR-028 Phase 3, 200 jobs/min 임계 근접)

**1인 가능?**: ✅ — 단, **자동화 5종 모두 도입 필수**. 누락 시 주 25h로 폭증 위험.

**Phase 4 진화 트리거 검토 게이트**:
- N=10 도달 시 본 ADR-025/028 재검토 의무
- 옵션 D (worker pool) vs 옵션 B (Tier 분리) 결정 데이터 수집 시작

---

### 2.4 N=20 (Phase 5+, 12~18개월 후 가정 — 1인 한계점)

**구성**:
- PM2 cluster:4 + worker_threads pool (ADR-028 옵션 D Phase 1 가동) 또는 pg-boss (Phase 3 가동)
- Tenant: 20개 (Complex 6~8 + Simple 12~14 가정)
- Cron: ~100~150개 (20 tenant × 평균 5~7)
- 트래픽: ~200k req/일
- ADR-029 Phase 4 OTel 가동 (트리거 D 발동)

**주간 운영 부담**: **~25시간 (1인 한계점)**

| 항목 | 시간 |
|------|------|
| 평상시 베이스라인 (§1.5) | 4.7h |
| + Operator Console 일일 강화 점검 (15분 × 7일) | 1.8h |
| + 새 tenant 1~3개/월 onboarding | 1.0h |
| + cron 실패 회로 차단 응답 (월 15~25건) | 4.0h |
| + cross-tenant 침범 시도 알림 응답 (월 5~10건) | 1.5h |
| + API key 회전/발급 (월 10~15건) | 2.0h |
| + RLS 정책 검토 + e2e 결과 분석 (월 4회 + 신규 모델) | 2.0h |
| + 주간 SLO 리포트 검토 + breach 대응 | 2.0h |
| + 패치 배포 (월 8~12회) | 2.0h |
| + 인시던트 응답 (SEV2~3, 월 2~4건) | 2.5h |
| + 비용/리소스 검토 (PG 디스크 회전 정책 등) | 1.5h |
| 합계 | **~25.0h/주** |

**한계 신호 (1인 운영 가능 vs 불가능 경계)**:
- 주 25h ≈ 일 평균 3.6h — 본업이 다른 1인 운영자에게 **상한**
- 자동화 5종 누락 시 주 50h+ 폭증 → **1인 운영 불가능**
- N=25+ 진입 시 옵션 B (Tier 분리) 또는 옵션 C (per-consumer) 검토 의무 (ADR-025 §6 재검토 트리거 3)

**자동화 효과 측정 (자동화 도입 전 vs 후)**:

| 시나리오 | 자동화 X | 자동화 O |
|---------|---------|---------|
| 새 tenant onboarding | 30분/건 | 5분/건 |
| Cron 실패 응답 | 20분/건 (수동 진단) | 5분/건 (Operator Console 즉시 식별) |
| Cross-tenant 알림 | 30분/건 (audit log grep) | 5분/건 (자동 alert + drill-down URL) |
| 패치 배포 | 60분/건 (수동 build/rsync/reload) | 15~30분/건 (`ypserver` 스킬 자동화) |
| RLS 검증 | 60분/건 (수동 SQL) | 5분/건 (CI e2e 자동) |

**1인 가능?**: ✅ 조건부 — 자동화 5종 100% 도입 + 주 25h 투입 가능 시.

---

### 2.5 N=20 한계 폭주 시나리오 (참고)

다음 조건 중 2개 이상이 동시 발생하면 N=20도 1인 운영 불가능:
1. SEV1 인시던트 발생 (cross-tenant 데이터 유출, PG 다운 등) — 단일 사건이 주 20h+ 소모
2. ADR-029 트리거 C (cardinality 폭주) — sampling 정책 즉시 강화 필요
3. 트래픽 급증 (1 tenant가 일일 100k req → 옆 tenant 영향)
4. Cloudflare Tunnel 장애 (외부 의존 — 1~2h 다운타임은 운영자 대응 불요)

→ 이 경우 ADR-025 §6 재검토 트리거에 따라 옵션 B/C/D 진화 의무.

---

## 3. 일상 운영 시나리오 10개

본 절은 1인 운영자가 N=10~20 환경에서 마주칠 구체적 상황을 시나리오로 풀어 검증한다. 각 시나리오는 (감지 → 진단 → 수정 → 검증) 4단계.

### 시나리오 1: 새 컨슈머 onboarding

**작업**:
1. (Complex) `packages/tenant-<id>/manifest.ts` 작성 (ADR-024 옵션 D, ADR-026 §6 양식)
2. (Simple) DB `tenants` row INSERT + `cronOverrides`/`quotaOverrides` 기본값
3. `prisma migrate dev` (스키마 변경 있으면) — RLS 정책 자동 적용
4. API key 발급 (`pub_<slug>_<rand>`, `srv_<slug>_<rand>`)
5. `withTenant()` 가드가 etenant slug 인식하는지 e2e 테스트
6. tenant 멤버십 row INSERT (운영자 본인)
7. Operator Console에 ROW 표시 확인

**예상 시간**: 30분 (수동) → 5분 (자동화 후)

**자동화 형태**:
```bash
pnpm tenant:create --slug=newproject --type=complex
# → manifest.ts 템플릿 생성 + DB row + API key 발급 + e2e 테스트 + Operator Console 등록
```

**검증 게이트**:
- API key로 `/api/v1/t/newproject/health` 200 응답
- audit_logs에 첫 호출 row + tenant_id='newproject'
- Operator Console에 ROW (status=OK)

---

### 시나리오 2: 한 컨슈머의 cron 장애

**상황**: Almanac의 `rss-fetch` cron이 RSS feed 응답 60초+ 지연 → timeout 반복

**감지** (30초 ~ 1분):
- ADR-028 §6.2 정책 step 5: `consecutiveFailures` 카운터가 임계(5) 도달
- circuit breaker `OPEN` 상태로 전환
- audit_logs `cron.circuit.opened` 이벤트 기록 + ADR-029 Operator Console에 빨간 ROW
- Telegram 알림 발송 (ADR-029 Phase 3 도입 시)

**진단** (5분):
- Operator Console drill-down → `/dashboard/operator/tenants/almanac`
- audit_logs 최근 24h `cron.timeout` 5건 확인
- 원인: RSS feed `geeknews.com` 응답 60s+
- 다른 cron(`api-poll`, `classify`)은 정상 → almanac 격리 작동 확인

**수정** (5분):
- 옵션 A: Almanac manifest에서 해당 RSS source 비활성 (DB `cronOverrides`로 즉시 토글)
- 옵션 B: cron `timeoutMs` 증가 + retry policy 조정 (코드 변경 + reload)
- 옵션 C: circuit breaker cooldown 5분 후 자동 `HALF_OPEN` 시도 → 운영자 대기

**격리 검증**:
- 다른 19개 tenant의 Operator Console ROW 모두 OK 유지
- ADR-028 worker pool: tenant_almanac 슬롯만 점유, 다른 tenant 슬롯 영향 없음
- ADR-023 RLS: cross-tenant query 0건 (audit_logs `cross_tenant_attempt` 없음)

**총 응답 시간**: 10분 (감지 1분 + 진단 5분 + 수정 5분 — Operator Console + circuit breaker 자동화 효과)

---

### 시나리오 3: 한 컨슈머의 트래픽 폭증

**상황**: `kdy-blog` tenant가 SNS 바이럴로 1분당 5,000 req (평소 50 req)

**감지** (1분):
- ADR-029 per-tenant metric: `kdy-blog.api_calls_per_min` > 4,000 → SLO breach `api-availability`
- Operator Console `kdy-blog` ROW에 `err_rate=2.1%` 노란 WRN

**진단** (3분):
- Cardinality 폭주 정책 C2: 자동 sampling 0.1로 down (raw event 부담 완화)
- Operator Console에서 `kdy-blog`만 영향, 다른 tenant 정상 확인
- ADR-028 worker pool: tenant cap 3 도달 → 4번째 요청부터 503

**수정** (5분):
- 즉시: rate limit 임시 1.5배 (DB `quotaOverrides`로 즉시 적용, restart 불요)
- 단기: `kdy-blog` cron 일부 임시 비활성으로 PG 부담 완화
- 장기: ADR-025 옵션 B (vip Tier) 진화 검토 — 본 ADR-025 §6 트리거 2 발동 후보

**격리 검증**:
- 다른 19개 tenant의 p95 latency ≤ 50ms 유지
- ADR-028 advisory lock + concurrency cap이 cross-tenant 영향 차단

---

### 시나리오 4: API key 회전

**상황**: tenant `recipe`의 `srv_recipe_<rand>` 키가 외부 누출 의심

**감지**:
- ADR-027 §7.1 시나리오 #3: hash 위조 시도 audit log 발견
- 또는 운영자가 GitHub/공개 저장소에서 키 발견

**작업** (5분, 자동화 후):
1. 새 키 발급 (`pub_recipe_<new_rand>`, `srv_recipe_<new_rand>`)
2. 컨슈머 SDK/.env 업데이트 통보 (운영자 본인 소유 → 즉시 가능)
3. 예전 키 `revoked_at` 설정 (즉시 401 응답)
4. audit_logs `api_key.rotated` 이벤트 기록

**격리 검증**:
- 예전 키로 호출 시 ADR-027 K3 step 2 (DB lookup): `NOT_FOUND` 401
- 예전 키가 다른 tenant 데이터 접근 불가 (K3 cross-validation)

---

### 시나리오 5: RLS 정책 위반 감지

**상황**: 신규 모델 `RecipeIngredient` 추가 시 `tenantId` 컬럼 누락 — RLS 정책 미적용

**감지**:
- ADR-023 §10 결정 §"필수 보강": ESLint custom rule + RLS e2e 테스트
- CI 빌드 실패: `prisma/schema.prisma` 모델 검증 → tenant_id 누락 모델 탐지
- 또는 e2e 테스트: tenant_a 사용자가 tenant_b 데이터에 SELECT → 데이터 반환 시 실패

**진단** (10분):
- `prisma/schema.prisma` git diff 확인
- 누락 모델: `RecipeIngredient`
- 잠재 영향: 미배포 (CI에서 차단됨)

**수정** (15분):
1. `model RecipeIngredient` 에 `tenantId String @map("tenant_id") @db.Uuid` 추가
2. RLS 정책 SQL 추가:
   ```sql
   ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
   ALTER TABLE recipe_ingredients FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON recipe_ingredients
     USING (tenant_id = current_setting('app.tenant_id')::uuid);
   ```
3. `prisma migrate dev` → 마이그레이션 자동 생성
4. e2e 테스트 재실행 → 통과 확인

**격리 검증**:
- ESLint rule이 PR 머지 차단 (사후 보수)
- e2e 테스트 cross-tenant SELECT 0건 확인

---

### 시나리오 6: DB 마이그레이션 (모든 tenant)

**상황**: `users` 테이블에 `phone_number` 컬럼 추가 (모든 tenant 공통)

**ADR-023 옵션 B 채택의 핵심 이점**:
- 단일 schema → `prisma migrate deploy` 1회 → 모든 tenant 자동 적용
- 옵션 A (schema-per-tenant)였다면 N=20 schema에 순차 마이그레이션 (수 분 소요)

**작업** (10분):
1. `prisma/schema.prisma` 수정 + `prisma migrate dev` (개발)
2. CI에서 e2e 테스트 (RLS 영향 검증)
3. ADR-020 standalone 배포 (`ypserver` 스킬)
4. Operator Console에서 모든 tenant ROW 확인 (status=OK)

**격리 검증**:
- 마이그레이션 후 모든 tenant 정상 작동
- audit_logs에 마이그레이션 이벤트 + tenant_id='_system' 기록

---

### 시나리오 7: 컨슈머 archive (data retention)

**상황**: tenant `old-project`을 더 이상 운영하지 않음 (90일 retention 후 영구 삭제)

**작업**:
1. DB `tenants.status = 'archived'` 설정 (cron 정지, route 410 응답)
2. 90일 대기 (data retention 정책)
3. 90일 후:
   - tenant 데이터 export (`pg_dump --where="tenant_id=..."` 자체 스크립트, ADR-023 §3.4 단점)
   - tenant 멤버십 row 삭제
   - tenant 데이터 CASCADE DELETE (모든 테이블 × tenant_id)
   - audit_logs는 보존 (90일 더)
4. `packages/tenant-old-project/` 디렉토리 제거 + Almanac 같은 Complex tenant는 git 보존

**예상 시간**: 30분 (자동화 후)

**격리 검증**:
- 다른 tenant 데이터 영향 0
- audit_logs `tenant.archived` + `tenant.deleted` 이벤트 기록

---

### 시나리오 8: ADR 갱신

**상황**: Phase 4 진입으로 ADR-025 옵션 A → 옵션 D 진화 결정

**작업** (1~3시간, 월 1~2회):
1. ADR-025 본문에 §변경 이력 추가 + supersede 헤더
2. 새 ADR-030 (옵션 D worker pool 채택) 작성
3. ADR-022 §6.2 Phase 16 공수 재산정
4. CLAUDE.md 풀뿌리 트리에 ADR-030 노드 추가
5. `docs/status/current.md` 세션 요약표 업데이트

**검증 게이트**:
- ADR-021 빌드 게이트 (다른 ADR과 cross-reference 정확)
- 7+1 Wave registry 동기화 (세션 56 진화)

---

### 시나리오 9: 인시던트 응답 (SEV2 — 일부 tenant 영향)

**상황**: PG advisory lock 충돌 빈발 → cron 일부 누락 (5 tenant 영향)

**감지** (1분):
- Operator Console: 5개 tenant ROW가 동시 노란 WRN
- ADR-029 SLO breach: `cron-success-rate` 95% 임계 → 87%

**진단** (15분):
- audit_logs `cron.skip.budget` / `cron.skip.concurrency-cap` grep
- ADR-028 §5.2 advisory lock key 충돌 가능성 검토 (`hashToBigInt` 충돌)
- 또는 worker pool size 부족 (8 worker, 5 tenant × 동시 실행 cap 3 = 15 > 8)

**수정** (30분):
- 단기: worker pool size 8 → 12로 증가 (ADR-028 §5.2 BIGINT 공간 충돌 완화)
- 장기: ADR-028 옵션 C (pg-boss 도입) Phase 3 진화 가속

**격리 검증**:
- circuit breaker가 영향 받은 cron만 OPEN, 다른 tenant cron 정상 작동
- audit_logs cross-tenant 영향 0건

**SEV1 케이스 (참고)**: cross-tenant 데이터 유출 발생 시 — Operator Console + ADR-027 K3 audit가 즉시 감지 → 5분 내 응답.

---

### 시나리오 10: 비용/리소스 리뷰 (월간)

**작업** (60분/월):
1. PG 디스크 사용량 (`du -sh /var/lib/postgresql/`)
2. SeaweedFS 사용량 (per-tenant prefix 기준)
3. SQLite `audit_logs` 회전 정책 검증 (90일 retention)
4. ADR-029 cardinality 정책 C1 위반 여부 (per_tenant_per_metric 100 series 한도)
5. Cloudflare Tunnel 트래픽 분석 (월간 무료 100GB 한도 — 본 프로젝트 ~1GB로 여유)

**검증 게이트**:
- 월 운영비 ≤ $10 (NFR-COST.1) 유지
- ADR-022 §1.4 "데이터 주권 100%" 보존 (외부 SaaS 미도입)

---

## 4. 자동화 필수 항목 5종

§3 시나리오에서 반복적으로 등장하는 자동화 5종을 정리한다. **이 5종이 모두 도입되지 않으면 N=10+ 운영은 1인에게 불가능**.

### 자동화 1: Operator Console (실시간 health)

- **출처**: ADR-029 Phase 1 (18h)
- **위치**: `/dashboard/operator/health`
- **기능**:
  - 모든 tenant ROW 한 페이지 (10~20)
  - 5초 SSE refresh
  - `err_rate` / `p95_lat` / `cron_success_rate` / `last_error` 표시
  - BAD/WRN/OK 색깔 자동 분류
  - 빨간 ROW 자동 상단 정렬
- **운영 가치**: "30초 안에 어느 tenant?" 답 가능 → 시나리오 2/3/9 핵심
- **누락 시 영향**: 진단 시간 5분 → 30분+ (audit_logs 수동 grep)

### 자동화 2: SLO + 알림 (Telegram/이메일)

- **출처**: ADR-029 Phase 2 (12h) + Phase 3 (16h)
- **위치**: `tenant_slos` 테이블 + cron breach detector
- **기능**:
  - per-tenant SLO yaml 정의 (api-availability 99.5%, cron-success-rate 95% 등)
  - 1분 간격 breach detection
  - `breach_alert: page` 시 Telegram webhook
  - `breach_alert: warn` 시 Operator Console 표시 + audit log
- **운영 가치**: alert 부재 = 평온 = 0분 부담 / alert 1건 = 즉시 응답
- **누락 시 영향**: 운영자 본인이 매 시간 Operator Console 확인 의무 → 일 0.5h+ 추가

### 자동화 3: Circuit breaker (cron auto-disable)

- **출처**: ADR-028 §6.2 정책 5단계
- **위치**: `src/lib/cron/circuit-breaker.ts` + DB `consecutive_failures` 컬럼
- **기능**:
  - tenant cron 연속 실패 5회 → `OPEN` 자동 전환
  - 5분 cooldown 후 `HALF_OPEN` 1회 시도
  - 성공 시 `CLOSED` 복귀
  - audit_logs `cron.circuit.opened` 이벤트
- **운영 가치**: 한 tenant 장애가 다른 tenant cron tick을 막지 않음 → 시나리오 2 격리
- **누락 시 영향**: 한 cron 60s timeout이 worker pool 점유 → 다른 tenant cron 누락 → cascade failure

### 자동화 4: RLS e2e 테스트 (cross-tenant leak 자동 검증)

- **출처**: ADR-023 §10 결정 §"필수 보강" (~28h)
- **위치**: `__tests__/integration/rls-isolation.spec.ts`
- **기능**:
  - 모든 비즈니스 모델에 대해 cross-tenant SELECT 시도
  - tenant_a context로 tenant_b 데이터 조회 → 0건 반환 검증
  - INSERT/UPDATE/DELETE 모두 검증
  - CI 빌드 게이트 (실패 시 머지 차단)
- **운영 가치**: 시나리오 5 (RLS 위반) 사전 차단 — 데이터 유출 사고 방지
- **누락 시 영향**: 신규 모델 추가 시마다 수동 검증 필요 (월 1~2회 × 60분)

### 자동화 5: Tenant onboarding 스크립트 (manifest.ts 템플릿 + DB row + API key)

- **출처**: ADR-024 §6 + ADR-026 §9 + ADR-027 §9.3 F-2
- **위치**: `scripts/tenant-create.ts` (pnpm script)
- **기능**:
  - `pnpm tenant:create --slug=foo --type=simple|complex`
  - Complex: `packages/tenant-<slug>/` 디렉토리 생성 + manifest.ts 템플릿
  - Simple: DB `tenants` row INSERT + manifest 토글 활성
  - API key 자동 발급 (pub_/srv_) + ADR-027 K3 cross-validation 자동 등록
  - tenant 멤버십 row INSERT (운영자 본인 ADMIN role)
  - Operator Console에 즉시 표시
  - e2e 테스트 1건 자동 실행 (`/api/v1/t/<slug>/health` 200 검증)
- **운영 가치**: 시나리오 1 (onboarding) 30분 → 5분
- **누락 시 영향**: 신규 tenant 1개당 30분 × N=20 분포 시 운영자 부담 폭증

---

## 5. 1인 운영 한계 측정 지표

본 절은 N=20 운영 가능 여부를 **객관적으로 측정**할 지표를 정의한다.

### 5.1 핵심 지표 4종

| 지표 | 임계 | 측정 방법 | 초과 시 대응 |
|------|------|---------|-----------|
| **주간 운영 시간** | < 30h | 운영자 manual log (1시간 단위) | 자동화 5종 점검, 누락 시 즉시 도입 |
| **인시던트 응답 시간 (SEV1)** | < 5분 | Operator Console alert → 운영자 응답 timestamp | Telegram 알림 도입, on-call 시간대 정의 |
| **새 컨슈머 onboarding 시간** | < 10분 | tenant onboarding 스크립트 측정 | 자동화 5 (onboarding 스크립트) 미도입 시 즉시 구축 |
| **야간 호출 빈도** | < 월 1회 | Telegram alert log (00:00~07:00) | SLO 임계 완화 검토 또는 야간 자동 회로 차단 cooldown 연장 |

### 5.2 보조 지표 6종

| 지표 | 임계 | 측정 방법 | 의미 |
|------|------|---------|------|
| Cron 실패율 (전체) | < 5%/주 | audit_logs `cron.complete` vs `cron.timeout` | ADR-028 worker pool 정책 정합 |
| Cross-tenant 침범 시도 | 0건/일 | audit_logs `cross_tenant_attempt` | ADR-027 K3 보안 작동 검증 |
| Operator Console 응답 시간 | < 1초 | SSE refresh 측정 | ADR-029 SQLite 쿼리 성능 |
| ADR-021 audit-failure 카운터 | < 0.1%/일 | `/api/admin/audit/health` | fail-soft 자체 작동 |
| pg max_connections 점유율 | < 70% | `pg_stat_activity` | ADR-023 옵션 B 단일 pool 부담 |
| 월 운영비 | ≤ $10 | 인프라 비용 (PG/SeaweedFS/Tunnel) | NFR-COST.1 (ADR-002) |

### 5.3 한계 도달 신호 (3종 동시 충족 시 옵션 B/D 진화 의무)

1. 주간 운영 시간 ≥ 30h (4주 연속)
2. SEV1 응답 시간 ≥ 10분 (월 1회+ 발생)
3. p95 latency ≥ 200ms (1주 지속)

→ ADR-025 §6 재검토 트리거 1 (cluster:4 부족) + 트리거 2 (VIP 분리) 동시 발동 → ADR-030 (옵션 D 또는 B 채택) 작성 의무.

### 5.4 1인 운영 종료 신호 (3종 중 1종 충족 시)

1. 주간 운영 시간 ≥ 50h (2주 연속) — 본업과 양립 불가
2. SEV1 인시던트가 월 3회 초과 — 단순 자동화로 해결 불가
3. 운영자 본인이 ADR-022 §6.2 Phase 16 공수 추정의 50% 초과 시간 소비 (예: Phase 16 32h를 48h+ 소비)

→ ADR-022 옵션 A → 옵션 B (open SaaS, 인력 고용) 또는 옵션 C (per-consumer 분리) 검토 의무.

---

## 6. 결론

### 6.1 1인 운영 N=20 가능성 종합 판정

| 단계 | 판정 |
|------|------|
| **N=2~5 (Phase 1~3)** | ✅ **무조건 가능** (자동화 부분 도입으로 충분) |
| **N=10 (Phase 4 진입)** | ✅ **조건부 가능** (자동화 5종 모두 도입 + Phase 4 진화 트리거 검토) |
| **N=20 (Phase 5+)** | ✅ **한계점 — 가능** (자동화 5종 100% + 주 25h 투입 + 인시던트 ≤ 월 2건) |
| **N=25+** | ❌ **1인 한계 초과** — ADR-025 옵션 B/C/D 진화 또는 ADR-022 옵션 B (인력 고용) 검토 |

### 6.2 ADR-022 옵션 A 채택의 정당성 검증

ADR-022 §4.2 권고 신뢰도 90%는 다음 근거로 본 검증에서 강화됨:
- §2.4 N=20 시나리오에서 주 25h가 한계점이지만 **달성 가능**
- 자동화 5종 ~76h(ADR-029 Phase 1~4) + ~28h(ADR-023 RLS 보강) + onboarding 스크립트 ~10h = **~114h 추가 투자**로 N=20 운영 가능
- ADR-022 §6.2 Phase 14.5~22 +380~480h 추정에 자연스럽게 흡수됨

### 6.3 자동화 5종 누적 공수

| 자동화 | 출처 ADR | 공수 |
|--------|---------|------|
| 1. Operator Console | ADR-029 Phase 1 | 18h |
| 2. SLO + 알림 | ADR-029 Phase 2 + 3 | 28h |
| 3. Circuit breaker | ADR-028 옵션 D Phase 1 | ADR-028의 40h에 포함 |
| 4. RLS e2e 테스트 | ADR-023 옵션 B 보강 | 28h |
| 5. Tenant onboarding 스크립트 | ADR-024/026/027 | 10h |
| **합계** | | **~84h (Phase 14.5~16 분산)** |

### 6.4 다음 ADR 트리거

본 검증으로 도출된 후속 결정:
- **재검토 트리거 (자동)**: §5.3 한계 도달 3종 신호 모니터링 의무 — Operator Console에 표시
- **신규 ADR 후보**: ADR-030 (Phase 4 옵션 D worker pool 진화) — N=10 도달 + p95 200ms 조건부 작성

### 6.5 본 검증의 한계 (정직)

- 본 검증은 ADR 결정과 spike 결과 + Wave 1-5 운영 경험 기반 **추정**. 실제 N=20 운영은 가동 후 측정 데이터로 재검증 필요.
- 주 25h는 운영자 본인이 본업과 병행 가능한 상한이며, 인시던트 폭주 시 즉시 초과 가능.
- 자동화 5종 ~84h 공수는 ADR-022 §6.2 +380~480h에 포함되므로 별도 추가 부담 아님.

---

## 7. 참조

### 7.1 인용 ADR/spike

- **ADR-022** §1, §4.1, §6.2: 정체성 + 권고 + Phase 16 +12h
- **ADR-023** §10 결정 (옵션 B) + §"필수 보강" 28h
- **ADR-024** §5.4 결정 (옵션 D) + §6 영향 파일
- **ADR-025** §5 결정 (옵션 A) + §5.2 코드 추상화 5종 + §6 재검토 트리거
- **ADR-026** §7 결정 (옵션 C) + §9 deploy 절차
- **ADR-027** §10 결정 (옵션 A + K3) + §7 cross-tenant 차단 시나리오
- **ADR-028** §10 결정 (옵션 D) + §6.2 정책 5단계 + §11.1 후속 amendment
- **ADR-029** §5 결정 (M1+L1+T3) + §2.6 Operator Console + §4 단계별 공수
- spike-baas-001 §1.1: ADR-023 옵션 B 권고 변경 근거
- spike-baas-002 §3.1~3.2: worker_threads 격리 능력 + concurrency cap 패턴

### 7.2 코드 위치 (자동화 5종 구현 대상)

- `src/app/dashboard/operator/health/page.tsx` (자동화 1, 신규)
- `src/lib/slo/breach-detector.ts` (자동화 2, 신규)
- `src/lib/cron/circuit-breaker.ts` (자동화 3, 신규)
- `__tests__/integration/rls-isolation.spec.ts` (자동화 4, 신규)
- `scripts/tenant-create.ts` (자동화 5, 신규)

### 7.3 운영 도구 (현재 가동 중)

- ADR-020 standalone + rsync + pm2 reload
- ADR-021 audit fail-soft + §amendment-1 audit-failure 카운터
- 세션 56 wsl-build-deploy.sh 8단계 파이프라인
- ypserver 스킬 (세션 52 NFT 네이티브 모듈 정합)

---

## 8. 변경 이력

- 2026-04-26 (validation Wave Sub-agent): 초안. ADR-022~029 결정 + spike-baas-001/002 결과 종합. N=2/5/10/20 4단계 검증 + 일상 시나리오 10개 + 자동화 5종 + 한계 측정 지표 4+6종 정의.
