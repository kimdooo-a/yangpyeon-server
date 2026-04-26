# 01 — ADR-022 (BaaS Identity) Implementation Spec

> 작성: 2026-04-26 (Architecture Wave Phase 1)
> 대상 ADR: [ADR-022 BaaS 정체성 재정의](../../01-adrs/ADR-022-baas-identity-redefinition.md) — ACCEPTED 옵션 A
> 입력 문서: ADR-022 본문, [CLAUDE-md-revision-proposal.md](../../02-proposals/CLAUDE-md-revision-proposal.md), [CLAUDE.md (반영 완료)](../../../../../CLAUDE.md)
> 위치: `docs/research/baas-foundation/04-architecture-wave/01-architecture/01-adr-022-impl-spec.md`
> 다음 spec: `02-adr-023-impl-spec.md` (데이터 격리 RLS 옵션 B 코드 적용)

---

## 1. 결정 요약 (ADR-022 인용)

ADR-022는 양평 부엌 서버의 정체성을 다음과 같이 재정의했다 (옵션 A, ACCEPTED 2026-04-26):

> "양평 부엌 서버는 **1인 운영자가 자기 소유 10~20개 프로젝트의 공유 백엔드 플랫폼**이다.
> 외부 가입/판매 없는 closed multi-tenant BaaS이며, 모든 컨슈머(=tenant)는 운영자 본인 소유다.
> 자체 호스팅 + 단일 PM2 인스턴스 + 단일 PostgreSQL을 유지하면서, 데이터/cron/edge function/storage/audit 모든 차원에서 tenant 격리를 1급 시민으로 채택한다.
> Wave 1-5에서 확정된 14 카테고리 1순위 기술과 9-레이어 아키텍처는 100% 유지하며, 각 레이어에 tenant 차원만 주입한다." (ADR-022 §7.2)

**Supersede 범위**: ADR-001 §3.1 핵심 결정 + §3.2.1~3.2.5 + §6.1·§6.3 (재검토 트리거 1·3 부분만). 자세한 §-수준 매핑은 본 spec §6 참조.

**본 spec의 책임**: ADR-022가 결정한 정체성이 **(a) 어디에 (b) 무엇으로 (c) 언제 (d) 누구에 의해** 코드/문서/운영에 구체화되는지 정의. ADR-023~029의 기술 결정은 후속 spec에서 다룬다 — 본 spec은 정체성 결정의 **표면화**만 담당.

---

## 2. 적용 영역 (3개)

ADR-022 결정은 다음 3개 영역에서 동시에 표면화된다. 셋 중 하나라도 누락되면 "정체성이 일부에만 적용된 부정합 상태"가 되므로 일괄 적용 필요.

### 2.1 문서/메타데이터 영역

CLAUDE.md, README, package.json 등 **세션 시작 시 또는 외부에서 프로젝트를 식별할 때 읽히는 표면**. 이 영역의 표현이 단일 사용자 도구를 가정하면 모든 후속 의사결정이 잘못된 mental model에서 출발.

- **이미 적용**: `CLAUDE.md` (revision proposal 반영 완료, L1·L6·L7·L11·L92~L102·L111~L116)
- **본 spec에서 추가 권고**: `package.json` description, `standalone/README.md` 헤더, `README.md` (있다면) 헤더

### 2.2 운영 정책 영역

PR 게이트, Phase exit criteria, 머지 규칙 등 **개발자가 일상 작업에서 따르는 규칙**. 이 영역은 ADR-022의 7원칙(CLAUDE.md L92~L102)을 자동화·강제화하는 메커니즘.

- pre-commit hook: prisma 모델 추가 시 `tenantId` 강제 검사
- PR 본문 템플릿: 장애 격리 증명 섹션 추가
- CI 검사: 글로벌 라우트 신설 차단 (운영 콘솔 전용 path 화이트리스트)

### 2.3 사용자 경험 영역

admin UI 레이블, 에러 메시지, 로그 포맷 등 **운영자(=사용자 본인)가 시스템과 상호작용할 때 보이는 표면**. 이 영역의 표현이 "양평 부엌 서버 대시보드 (단일 사용자)"로 남으면, 1인 운영자가 N=20 컨슈머를 관리할 때 mental model 충돌.

- 사이드바 헤더: "양평 부엌 서버" + 현재 선택된 tenant 표시
- Tenant 전환 UI: top-bar dropdown (ADR-026 manifest 기반)
- 에러 메시지: `tenantId` 컨텍스트 포함 (예: "tenant=almanac, error=...")
- 로그 prefix: `[tenant=<id>]` 자동 주입

---

## 3. 구체적 변경 항목 표

각 항목은 **위치 / 변경 / 시점 / 담당**으로 분해된다. 시점 기준은 다음 4단계:
- **T0 = 즉시** (ADR-022 ACCEPTED 직후, 즉 본 Architecture Wave 종료 시)
- **T1 = Phase 14.5 진입 시** (멀티테넌트 기반 마이그레이션, ~80~120h)
- **T2 = Phase 15 진입 시** (Auth Advanced + tenant 인식)
- **T3 = 첫 컨슈머 plugin 마이그레이션 시** (Almanac v1.0 출시 후)

### 3.1 문서/메타데이터 영역

| 위치 | 변경 | 시점 | 담당 |
|------|------|------|------|
| `CLAUDE.md` L1 | 헤더: "양평 부엌 서버 — 1인 운영자의 멀티테넌트 백엔드 플랫폼" | T0 (완료) | revision-proposal sub-agent |
| `CLAUDE.md` L6~L13 | 프로젝트 정보 8줄 갱신 (정체성 / 첫 컨슈머 / 도메인 분리) | T0 (완료) | revision-proposal sub-agent |
| `CLAUDE.md` L92~L102 | "멀티테넌트 BaaS 핵심 7원칙" 섹션 신설 | T0 (완료) | revision-proposal sub-agent |
| `CLAUDE.md` L111~L116 | "멀티테넌트 BaaS 운영 규칙" 섹션 신설 | T0 (완료) | revision-proposal sub-agent |
| `package.json` `description` | "Yangpyeon kitchen server — closed multi-tenant BaaS for 1 operator × N projects" 수정 | T0 | 본 spec 후속 PR |
| `standalone/README.md` 헤더 | 한 줄 정체성 명시 추가 ("ADR-022 기반 멀티테넌트 BaaS standalone build") | T0 | 본 spec 후속 PR |
| `docs/MASTER-DEV-PLAN.md` Phase 표 | Phase 14.5 신설 행 추가 (~80~120h) + Phase 15-22 +tenant 공수 반영 (+360~480h) | T0 | 본 spec 후속 |
| `docs/status/current.md` 세션 요약표 | 세션 58 행 추가: "ADR-022~029 ACCEPTED, BaaS 정체성 재정의" | T0 (`/cs` 종료 시) | 세션 종료 sub-agent |
| `docs/handover/<날짜>-baas-foundation.md` | baas-foundation 워크스트림 인수인계서 작성 | T0 (`/cs` 종료 시) | 세션 종료 sub-agent |
| `docs/handover/next-dev-prompt.md` | "다음 세션은 Phase 14.5 멀티테넌트 마이그레이션 진입" | T0 (`/cs` 종료 시) | 세션 종료 sub-agent |
| `docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md` | §3.1 상단에 supersede 헤더 추가 ("§3.1, §3.2.1~3.2.5, §6.1, §6.3은 ADR-022로 supersede됨 — 2026-04-26") | T0 | ADR-022 §4.2-③ 별도 sub-agent |

### 3.2 운영 정책 영역

| 위치 | 변경 | 시점 | 담당 |
|------|------|------|------|
| `.github/PULL_REQUEST_TEMPLATE.md` (또는 신설) | "장애 격리 증명" 섹션 추가 — cross-tenant 전파 없음을 테스트 또는 설계 근거로 명시 | T0 | 본 spec 후속 PR |
| `.husky/pre-commit` (또는 lefthook) | `prisma/schema.prisma` 변경 시 신규 model에 `tenantId` 필드 존재 검사 | T1 | Phase 14.5 sub-agent |
| `scripts/check-tenant-id.mjs` (신설) | Prisma DMMF 파싱 → 신규 model에 tenantId 누락 시 exit 1 | T1 | Phase 14.5 sub-agent |
| `scripts/check-route-path.mjs` (신설) | `src/app/api/v1/**/route.ts` 신규 추가 시 `t/[tenant]/` 또는 운영 콘솔 화이트리스트 매칭 검사 | T1 | Phase 14.5 sub-agent |
| `.github/workflows/ci.yml` | 위 두 스크립트를 PR 게이트에 추가 (lint/type 단계 후) | T1 | Phase 14.5 sub-agent |
| `docs/rules/coding-stacks/typescript-react.md` | "신규 모델/route 추가 시 tenant 차원 필수" 섹션 추가 | T0 | 본 spec 후속 PR |
| `docs/rules/_index.md` | `multi-tenant-rules.md` 신규 룰 파일 추가 (7원칙 운영 정책 버전) | T0 | 본 spec 후속 PR |
| `docs/research/_SPIKE_CLEARANCE.md` | spike-baas-001 (Prisma multi-schema), spike-baas-002 (worker pool) 등록 | T0 | 본 spec 후속 PR |

### 3.3 사용자 경험 영역

| 위치 | 변경 | 시점 | 담당 |
|------|------|------|------|
| `src/components/layout/Sidebar.tsx` (또는 동급) | 헤더 "양평 부엌 서버" + 현재 tenant 배지 (`[tenant=<id>]`) | T2 | Phase 15 UI sub-agent |
| `src/components/layout/TenantSwitcher.tsx` (신설) | top-bar dropdown — manifest 기반 tenant 전환 (ADR-026) | T2 | Phase 15 UI sub-agent |
| `src/lib/audit-log.ts` 콜사이트 | error context에 `tenantId` 자동 주입 (ADR-021 fail-soft 패턴 보존) | T1 | Phase 14.5 audit sub-agent |
| `src/lib/logger.ts` (또는 pino config) | log entry prefix에 `[tenant=<id>]` 자동 주입 (AsyncLocalStorage 기반) | T1 | Phase 14.5 logger sub-agent |
| `src/app/(dashboard)/page.tsx` (홈) | 다중 tenant 요약 카드 (각 tenant의 헬스/cron/audit 한눈 표시) | T2 | Phase 15 UI sub-agent |
| `src/app/error.tsx` 등 에러 boundary | 에러 메시지에 tenantId 표시 ("문제가 발생했습니다 (tenant=<id>)") | T2 | Phase 15 UI sub-agent |
| 로그인 후 진입 화면 | "운영 콘솔 — 양평 부엌 서버 (1인 N=N 컨슈머)" 안내 텍스트 | T2 | Phase 15 UI sub-agent |
| Almanac plugin UI 마이그레이션 | `packages/tenant-almanac/` 신설 + 기존 admin UI에서 tenant context로 격리 | T3 | Almanac plugin sub-agent |

---

## 4. PR 게이트 (자동화)

ADR-022 7원칙 중 1번 (Tenant 1급 시민)·4번 (코드 수정 0줄 등록)·6번 (불변 코어)을 PR 단계에서 자동으로 강제하는 4개 검사. T1 (Phase 14.5)에 일괄 도입.

### 4.1 검사 1 — `tenantId` 컬럼 누락 (Prisma 모델)

```
스크립트: scripts/check-tenant-id.mjs
입력: prisma/schema.prisma
검사: DMMF 파싱 → 신규 model 중 tenantId 필드 미존재 항목 추출
화이트리스트: Tenant 모델 자체, Session/JwksKey 등 cross-tenant 자원 (yaml 별도 관리)
실패 출력: "model X에 tenantId 필드가 없습니다. ADR-022 §7원칙-1 위반."
exit code: 1
```

### 4.2 검사 2 — 글로벌 라우트 신설 차단

```
스크립트: scripts/check-route-path.mjs
입력: git diff --name-only HEAD~1 (또는 PR base)
검사: 신규 src/app/api/v1/**/route.ts 파일 경로 매칭
허용 패턴 1: src/app/api/v1/t/[tenant]/...  (컨슈머 백엔드)
허용 패턴 2: src/app/api/v1/admin/...       (운영 콘솔 전용)
허용 패턴 3: src/app/api/v1/_meta/...        (헬스/메트릭 등 cross-tenant 인프라)
실패 출력: "신규 route X가 글로벌 path입니다. /t/[tenant]/ 또는 /admin/ 또는 /_meta/ 중 선택. ADR-022 §7원칙-1 위반."
exit code: 1
```

### 4.3 검사 3 — Plugin 분리 위반 (코어 vs plugin)

```
스크립트: scripts/check-core-purity.mjs
입력: git diff --name-only HEAD~1
검사: src/lib/{auth,audit,cron,router,rate-limit}/** 변경이 있고
      동시에 packages/tenant-*/** 변경이 있는 경우
판정: 코어와 plugin을 1 PR에 혼재 → reject (ADR-022 §7원칙-6)
완화: PR 본문에 "core change 사유" 명시 + reviewer 명시적 승인 시 통과
실패 출력: "코어와 plugin이 한 PR에 혼재. 코어 변경은 별도 PR로 분리. ADR-022 §7원칙-6 위반."
exit code: 1
```

### 4.4 검사 4 — 장애 격리 증명 섹션 누락 (PR 본문)

```
스크립트: scripts/check-pr-isolation-proof.mjs (GH Action)
입력: gh pr view --json body
검사: PR 본문에 "## 장애 격리 증명" 섹션 존재
      섹션 내용 ≥ 50자 (테스트 링크 또는 설계 근거)
실패 출력: "PR 본문에 장애 격리 증명 섹션이 누락. ADR-022 §7원칙-3 위반."
exit code: 1
완화: 라벨 `no-tenant-impact` 부착 시 통과 (인프라 PR 등)
```

### 4.5 자동화 도입 단계

| 단계 | 시점 | 검사 1 | 검사 2 | 검사 3 | 검사 4 |
|------|------|--------|--------|--------|--------|
| **soft (warn only)** | T0~T1 | warn | warn | off | warn |
| **enforce (error)** | T1 종료 | error | error | warn | warn |
| **strict (error all)** | T2 진입 | error | error | error | error |

T0 시점에는 검사 4 (PR template) 만 즉시 도입. 1~3은 Phase 14.5 sub-agent가 스크립트 작성 후 점진 적용.

---

## 5. 정체성 검증 시나리오

ADR-022 정체성이 **새 세션의 mental model에 실제로 주입되는지** 자동/수동으로 검증하는 5개 시나리오.

### 5.1 시나리오 V1 — CLAUDE.md 첫 로드 인식 검증 (수동, T0)

**절차**:
1. 새 Claude Code 세션 시작 (현재 세션 종료 후)
2. 사용자 첫 질문: "양평 부엌 서버는 무엇인가?"
3. 답변에 다음 4개 키워드가 포함되는지 확인:
   - "1인 운영자" 또는 "1인 운영"
   - "10~20개 프로젝트" 또는 "N=10~20"
   - "멀티테넌트" 또는 "multi-tenant" 또는 "BaaS"
   - "외부 가입 없음" 또는 "closed"

**합격 기준**: 4개 중 3개 이상 포함. 누락 시 → CLAUDE.md L1·L6·L7 표현이 약함 → 보강 PR.

### 5.2 시나리오 V2 — ADR-022 supersede 인식 검증 (수동, T0)

**절차**:
1. 새 세션에 질문: "ADR-001과 ADR-022의 관계는?"
2. 답변에 다음 키워드 확인:
   - "supersede" 또는 "부분 대체"
   - "ADR-001 §3.1, §3.2.1~3.2.5, §6.1, §6.3" (정확한 §-수준)

**합격 기준**: supersede 관계 정확히 인식. 누락 시 → ADR-001 본문에 supersede 헤더 추가 (§3 표 마지막 행).

### 5.3 시나리오 V3 — 신규 모델 추가 시 tenantId 자동 인식 (자동, T1)

**절차**:
1. PR이 `prisma/schema.prisma`에 새 모델 추가 (tenantId 누락)
2. CI에서 `scripts/check-tenant-id.mjs` 실행
3. PR이 RED 상태로 차단되는지 확인

**합격 기준**: PR 차단 + 메시지에 "ADR-022 §7원칙-1 위반" 포함.

### 5.4 시나리오 V4 — Almanac 통합 작업 mental model 검증 (수동, T3 직전)

**절차**:
1. 새 세션에 질문: "Almanac을 yangpyeon에 어떻게 연결하나?"
2. 답변에 다음 키워드 확인:
   - "tenant" 또는 "packages/tenant-almanac/"
   - "/api/v1/t/almanac/" 또는 "tenant path"
   - "manifest" 또는 "ADR-026"

**합격 기준**: 단일 사용자 도구가 아닌 **컨슈머 plugin 추가**로 mental model 인식.

### 5.5 시나리오 V5 — 7원칙 PR 게이트 동작 검증 (자동, T2 진입 시)

**절차**:
1. 의도적으로 글로벌 route 추가 PR 작성 (`src/app/api/v1/users/route.ts`)
2. CI에서 검사 2 (글로벌 라우트 차단) 동작 확인
3. RED 상태 + 안내 메시지 확인

**합격 기준**: 자동 차단 + 7원칙 §-수준 인용 메시지 출력.

---

## 6. ADR-001 supersede 처리

ADR-022는 ADR-001을 **전체 supersede가 아닌 부분 supersede**로 처리한다. 다음 표는 ADR-001의 어느 §이 어떻게 처리되는지 정확히 정의.

### 6.1 §-수준 supersede 매핑

| ADR-001 § | 원문 핵심 (요약) | ADR-022 처리 | 후속 ADR |
|----------|----------------|-------------|---------|
| §1 메타 | 결정 메타데이터 (세션 26 확정) | **보존** + supersede 헤더 추가 | — |
| §2.1 (L29~38) | "1인 운영 + 단일 팀 사용 전제" | **부분 supersede** — "단일 팀"만 무효, "1인 운영"은 보존 | ADR-022 §1.4 |
| §2.2~2.3 | 배경/Wave 1-3 분석 | **보존** (역사적 컨텍스트) | — |
| §2.4 (L70~78) | 정량 임계값 (재검토 트리거) | **보존** + 트리거 1·3 발동 사실 cross-ref | ADR-022 §1.2 |
| **§3.1 (L83~87)** | "Multi-tenancy를 지원하지 않는다 (의도적 결정)" | **SUPERSEDE** | ADR-022 §5 |
| **§3.2.1 (L91~)** | 단일 organization 가정 | **SUPERSEDE** | ADR-026 (Tenant Manifest) |
| **§3.2.2** | tenant_id 컬럼 부재 정당화 | **SUPERSEDE** | ADR-023 (RLS 옵션 B) |
| **§3.2.3** | API path 단일성 (`/api/v1/*`) | **SUPERSEDE** | ADR-027 (URL path A + K3) |
| **§3.2.4** | 워크스페이스 미도입 | **SUPERSEDE** (재정의) | ADR-026 |
| **§3.2.5** | 단일 인증 컨텍스트 | **SUPERSEDE** | ADR-027 (JWT tenantId 클레임) |
| §3.3 | API 호환성 정책 | **부분 supersede** — Supabase 호환 표면은 보존, 단 path만 `/t/<tenant>/` 추가 | ADR-027 |
| §4.1 (이점 5종) | "tenant 크로스 리크 버그 0" 등 | **부분 무효** — 옵션 A 채택 시 해당 이점 일부 소실 (ADR-022 §4.1-3 단점에서 언급) | — |
| §4.2 (단점) | 멀티테넌트 미지원 단점 | **보존** — 본 ADR로 단점이 모두 해소됨 | — |
| §5 (재검토 조건) | "트리거 발동 시 100~120h" | **갱신** — 본 ADR이 +380~480h로 갱신 | ADR-022 §11.2 |
| **§6.1** (L451~) | 트리거 1: 사용자 2명+ 6개월 | **SUPERSEDE** (트리거 자체 발동) | ADR-022 §1.2 |
| §6.2 | 트리거 2: B2B SaaS 전환 | **보존** (미발동) | — |
| **§6.3** (L~480) | 트리거 3: 팀/조직 관리 FR 추가 | **SUPERSEDE** (트리거 자체 발동) | ADR-022 §1.2 |
| §6.4 | 트리거 4: 법적 격리 요건 | **보존** (미발동) | — |
| §6.5 | 재검토 시 예상 작업량 100~120h | **갱신** — ADR-022 §11.2가 380~480h로 갱신 | ADR-022 §11.2 |
| §7 (참고) | 인용 문서 목록 | **보존** | — |

### 6.2 ADR-001 본문 추가 작업 (T0)

ADR-022 §4.2-③에 따라 별도 sub-agent가 다음을 수행 (본 spec과 별도 PR):

```diff
파일: docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md

L1 부근 (메타 블록 위) 신설:
+ ---
+ > ⚠️ **부분 SUPERSEDED**: 본 문서의 §3.1, §3.2.1~3.2.5, §6.1, §6.3은
+ > [ADR-022 (BaaS 정체성 재정의)](../../baas-foundation/01-adrs/ADR-022-baas-identity-redefinition.md)
+ > 에 의해 2026-04-26 (세션 58) 부로 supersede되었다.
+ > 자세한 §-수준 매핑은 ADR-022 §6.1 + Implementation Spec §6.1 참조.
+ ---

§3.1 본문 위 신설:
+ > **SUPERSEDED by ADR-022 (옵션 A) 2026-04-26**: 본 §은 "멀티테넌트 1급 시민화"로 재정의됨.

§3.2.1~3.2.5 각 항목 위 신설:
+ > **SUPERSEDED by ADR-022 + ADR-{023|026|027} 2026-04-26**: 자세한 후속 결정은 해당 ADR 참조.

§6.1, §6.3 본문 위 신설:
+ > **TRIGGERED + SUPERSEDED by ADR-022 2026-04-26**: 본 트리거가 발동되어 ADR-022로 흡수됨.
```

### 6.3 본문 변경 안 함 (역사 보존)

다음 항목은 supersede되더라도 **본문 텍스트는 그대로 보존** (헤더만 추가):

- ADR-001의 모든 §의 원문 — 역사 보존 원칙 (CLAUDE.md L84)
- ADR-001의 결정 신뢰도 표·당시 데이터 — 의사결정 컨텍스트
- ADR-001의 §3.1 "의도적 결정" 표현 — 당시의 정직한 기록

이는 CLAUDE.md L84 "역사 삭제 금지" 원칙과 정합. **supersede = 무효화가 아니라 효력 정지 + 컨텍스트 보존**.

---

## 7. Open Questions

본 spec을 닫기 전에 후속 spec 또는 사용자 결정으로 해소되어야 할 6개 질문.

### Q1 — Tenant ID 표기법 (slug vs UUID)

CLAUDE.md L11·L114에서 `<tenant>`로 표기. 실제 식별자는?
- **옵션 a**: human-readable slug (예: `almanac`, `kitchen`) — URL 가독성 ↑
- **옵션 b**: UUID (예: `8f3a-...`) — 식별자 충돌 0
- **옵션 c**: hybrid — DB는 UUID, URL은 slug (별도 unique slug 컬럼)

**위임**: ADR-026 (Tenant Manifest) — 본 spec에서 결정 X. 단, PR 게이트 검사 2 (route path)에서 정규식이 옵션에 따라 달라지므로 ADR-026 ACCEPTED 후 즉시 검사 2 정규식 확정 필요.

### Q2 — 운영 콘솔 path prefix (`/admin/` vs `/console/` vs 루트)

CLAUDE.md L11에서 "stylelucky4u.com (본인 사용자 운영 콘솔)"로 정의. 실제 path는?
- **옵션 a**: 루트 (`stylelucky4u.com/` = 운영 콘솔, `/api/v1/t/<tenant>/` = 컨슈머 API)
- **옵션 b**: `stylelucky4u.com/admin/` = 콘솔, `stylelucky4u.com/` = 컨슈머 진입 또는 빈 페이지
- **옵션 c**: subdomain 분리 (`admin.stylelucky4u.com` vs `api.stylelucky4u.com/t/<tenant>/`)

**위임**: ADR-027 (Multi-tenant Router). 본 spec §4.2 검사 2의 화이트리스트는 옵션 a 가정으로 작성. ADR-027 결정 시 화이트리스트 갱신 필요.

### Q3 — Almanac plugin 마이그레이션 시점 (T3) 정밀화

CLAUDE.md L13·L116에서 "Almanac v1.0 출시 후 plugin 마이그레이션"으로 명시. 정확한 v1.0 정의는?
- **옵션 a**: spec/aggregator-fixes 머지 + 첫 production 배포
- **옵션 b**: Almanac 자체 v1.0 태그 (Almanac 리포의 git tag)
- **옵션 c**: 사용자 명시적 "v1.0 selesai" 선언

**위임**: 사용자 결정 — 본 spec 후속 인수인계서에서 질문 항목으로 등록.

### Q4 — Phase 14.5 vs Phase 15 진입 순서 결정

ADR-022 §4.2-② "Phase 14.5 신설 권고 (~80~120h)". MASTER-DEV-PLAN 갱신 시 다음 중 선택:
- **옵션 a**: Phase 14.5를 Phase 15 직전에 삽입 (순차)
- **옵션 b**: Phase 14.5와 Phase 15를 병렬 (다른 sub-agent 풀)
- **옵션 c**: Phase 14.5의 일부(데이터 모델만)를 먼저, 나머지(JWT/route)는 Phase 15 내부로 분산

**위임**: 사용자 결정 (스코프/일정 trade-off). 본 spec §3.1에서는 옵션 a 가정.

### Q5 — Almanac 외 미래 컨슈머 N의 구체적 후보

CLAUDE.md L7에서 "10~20개 프로젝트". 현재 명시된 컨슈머는 Almanac 1개. 나머지 9~19개의 후보는?
- 영향: ADR-026 manifest 스키마 설계 시 컨슈머 다양성 가정 (정적 사이트 vs dynamic vs cron-only)이 달라짐.
- 영향: ADR-029 per-tenant 메트릭 차원 정의 시 비즈니스 메트릭 vs 인프라 메트릭 균형이 달라짐.

**위임**: 사용자 결정 — 본 spec 후속 인수인계서에서 "다음 3~5개 컨슈머 후보 목록" 작성 요청.

### Q6 — ADR-022 §11.2의 380~480h 추정의 ±20% 정밀화 시점

ADR-022 §4.1 권고 신뢰도 90% — "공수 추정은 ADR-023~029 작성 후 ±20% 범위로 정밀화 필요". ADR-023~029가 ACCEPTED된 현 시점에서 정밀화는 언제?
- **옵션 a**: Phase 14.5 진입 직전 (T1 시점) 정밀화
- **옵션 b**: 본 Architecture Wave 종료 시 (T0+1주 내)
- **옵션 c**: Almanac plugin 마이그레이션 후 retrospective (T3 후)

**위임**: 본 Architecture Wave 후속 spec (`02-roadmap-impact.md` 또는 등급) — 본 spec §3.1 표는 ADR-022 §6.2의 +360~480h 수치를 그대로 인용.

---

## 부록 A — 본 spec과 후속 spec의 관계

본 spec(`01-adr-022-impl-spec.md`)은 Architecture Wave Phase 1의 **첫 spec**이며, ADR-022 정체성 결정의 표면화만 담당. ADR-023~029의 기술 결정은 다음 spec에서 다룬다:

| spec | 대상 ADR | 책임 |
|------|---------|------|
| `01-adr-022-impl-spec.md` (본 spec) | ADR-022 | 정체성 표면화 (문서/운영/UX) |
| `02-adr-023-impl-spec.md` | ADR-023 | RLS 옵션 B 구체 적용 (Prisma + pg_policy) |
| `03-adr-024-impl-spec.md` | ADR-024 | Plugin hybrid 옵션 D (`packages/tenant-*/`) |
| `04-adr-025-impl-spec.md` | ADR-025 | 단일 인스턴스 모델 운영 정책 |
| `05-adr-026-impl-spec.md` | ADR-026 | TS+DB hybrid manifest 스키마 + 런타임 |
| `06-adr-027-impl-spec.md` | ADR-027 | URL path A + JWT 클레임 K3 라우터 |
| `07-adr-028-impl-spec.md` | ADR-028 | Cron worker pool hybrid 옵션 D |
| `08-adr-029-impl-spec.md` | ADR-029 | M1+L1+T3 메트릭/로그/트레이스 (Phase 4 OTel) |

본 spec은 §3·§4의 표가 **ADR-023~029 spec과 cross-reference 관계**임을 전제. 표의 "후속 ADR" 열에서 명시된 ADR이 자체 spec에서 코드/스키마/스크립트의 구체 형태를 정의.

---

## 부록 B — 변경 이력

- 2026-04-26 (세션 58, v0.1): Architecture Wave Phase 1 sub-agent #1이 ADR-022 ACCEPTED 직후 본 spec을 작성. CLAUDE.md revision-proposal이 이미 적용된 상태(L1·L6·L7·L11·L92~L102·L111~L116)를 전제. ADR-022 §4.2-③의 "ADR-001 supersede 헤더 추가" 작업과 본 spec §3.1·§6.2가 동일 PR 또는 별도 PR로 분리될지는 후속 인수인계 결정.

---

> 본 spec의 신뢰도: **85%** — ADR-022 본문, CLAUDE-md-revision-proposal, CLAUDE.md 현 상태 3개 문서를 직접 인용. 단, 후속 ADR(023~029) spec과의 cross-ref 정확성은 그 spec 작성 시 재검증 필요.
> 다음 작업: `02-adr-023-impl-spec.md` 작성 (RLS 옵션 B 구체화) — 별도 sub-agent.
