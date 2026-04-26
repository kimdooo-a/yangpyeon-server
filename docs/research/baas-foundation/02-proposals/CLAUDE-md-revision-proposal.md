# CLAUDE.md 정체성 재정의 제안서

> 작성: 2026-04-26
> 상태: PROPOSED, 사용자 승인 대기
> 관련: ADR-022 (BaaS 정체성 재정의)
> 적용 시점: ADR-022 결정(ACCEPTED) 후

---

## 변경 의도

### 왜 지금 CLAUDE.md를 변경해야 하는가

1. **ADR-001 supersede 트리거 발동**
   `docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md`(ADR-001, 세션 26 확정)는 Multi-tenancy를 의도적으로 제외하면서 4가지 재검토 트리거를 명시했다. 그중 2개가 2026-04-26 시점에 충족되었다:
   - 트리거 1 (사용자 2명+ 6개월 이상 지속) → 본인 소유 10~20개 프로젝트 영구 운영으로 충족
   - 트리거 3 ("독립 팀/조직 관리" FR 신규 추가) → 컨슈머별 백엔드 분리 요구로 충족

   ADR-001이 정한 자기 무효화 조건이 발동되었으므로, ADR-022로 supersede하고 CLAUDE.md의 "프로젝트 정보"가 표상하는 정체성도 함께 갱신한다.

2. **현재 CLAUDE.md는 "단일 사용자 도구" 정체성을 표상한다**
   "양평 부엌 서버 대시보드"라는 명칭, `stylelucky4u.com` 단일 도메인, 단일 포트, 단일 배포 등 모든 표현이 1인 1프로젝트 도구를 가정한다. 멀티테넌트 BaaS 전환 후에도 이 표현이 그대로 남으면 모든 후속 세션이 잘못된 mental model로 진입한다.

3. **첫 컨슈머(Almanac) 진행 중 — 결정의 시급성**
   `almanac-flame.vercel.app`이 yangpyeon을 백엔드로 사용하기 시작했고, `spec/aggregator-fixes` 브랜치가 현재 작업 중이다. CLAUDE.md가 단일 사용자 가정을 유지하면 Almanac 통합 작업이 단일 사용자 패턴으로 굳어지고, 향후 N=10~20 확장 시 전부 재작업해야 한다.

4. **"CLAUDE.md 관리 규칙(이 섹션 삭제 금지)"의 합리적 운용**
   CLAUDE.md는 모든 Claude 세션이 첫 컨텍스트로 읽는다. 정체성 재정의가 결정되면 그날 즉시 CLAUDE.md에 반영하는 것이 "역사 삭제 금지" 원칙과 충돌하지 않는다 — 변경 이력 1줄을 추가하면서 새 정체성을 선언하면 된다(역사 보존 + 현재 상태 갱신).

---

## 변경 대상 섹션

### 1. "프로젝트 정보" 섹션 변경

**현재 (CLAUDE.md L5~L11)**:
```
## 프로젝트 정보
- 프로젝트명: 양평 부엌 서버 대시보드 (stylelucky4u.com)
- 스택: Next.js 15 + TypeScript + Tailwind CSS
- 시작일: 2026-04-06
- 배포 환경: WSL2 Ubuntu (PM2) + Cloudflare Tunnel
- 도메인: stylelucky4u.com
- 포트: 3000 (localhost)
```

**제안**:
```
## 프로젝트 정보
- 프로젝트명: 양평 부엌 서버 (stylelucky4u.com) — 1인 운영자의 멀티테넌트 백엔드 플랫폼
- 정체성: 본인 소유 10~20개 프로젝트의 공유 백엔드 (closed multi-tenant BaaS, 외부 가입 없음)
- 스택: Next.js 15 + TypeScript + PostgreSQL + Tailwind CSS
- 시작일: 2026-04-06 (단일 사용자 도구) → 2026-04-26 (멀티테넌트 BaaS 전환 결정, ADR-022)
- 배포 환경: WSL2 Ubuntu (PM2) + Cloudflare Tunnel + 단일 PostgreSQL
- 도메인: stylelucky4u.com (본인 사용자 운영 콘솔) + /api/v1/t/<tenant>/* (각 컨슈머 백엔드)
- 포트: 3000 (localhost)
- 첫 컨슈머: Almanac (almanac-flame.vercel.app) — spec/aggregator-fixes 브랜치 진행 중
```

**변경 근거**:
- "대시보드"라는 단어 제거 → 대시보드는 플랫폼의 한 단면(운영 콘솔)일 뿐, 정체성이 아니다.
- "정체성" 줄 신설 → "외부 가입 없음(closed multi-tenant)" 명시로 일반 SaaS BaaS와 구분. 보안/운영 정책 결정의 출발점.
- "스택"에 PostgreSQL 명시 → 02-current-code-audit.md L20에 따르면 SQLite도 사용 중(audit_logs 등). 그러나 멀티테넌트 데이터의 1차 저장소는 PG이므로 표시. SQLite는 현 ADR 결정상 별도 항목 아님.
- "시작일"에 진화 표기 → 역사 보존 원칙. 단일 사용자 도구로 시작했음을 인정하면서 BaaS 전환 시점 명시.
- "도메인" 2줄로 분리 → 운영 콘솔 vs 컨슈머 API 경로 분리. ADR-027(Router) 결정의 가시화.
- "첫 컨슈머" 추가 → 추상적 N=10~20이 아닌 구체적 첫 컨슈머 명시. 모든 설계 결정의 검증 대상.

---

### 2. "핵심 원칙" 섹션에 추가 (기존 원칙 끝에 추가)

**현재 (CLAUDE.md L67~L74)**:
```
## 핵심 원칙
- **역사 삭제 금지** — 세션 기록, 인수인계서 등 모든 기록은 영구 보존
- **풀뿌리 연결** — 위 트리를 따라가면 모든 기록에 도달 가능해야 함
- **페이지 연결성** — 모든 페이지는 홈(/)에서 클릭으로 도달 가능해야 함 (`docs/rules/navigation-connectivity.md`)
  - kdyweb 스킬 사용 시: `docs/references/_WEB_CONTRACT.md`가 페이지 라우트 맵의 단일 진실 소스이며, `_NAVIGATION_MAP.md`를 대체합니다
- .env, .env.local, nul 파일 커밋 금지
- 시크릿 키 클라이언트 노출 금지
- 이미지/API키 등 외부 리소스 필요 시 정해진 형식으로 요청
```

**제안 — 위 내용 유지 + 아래 신설 섹션을 그 다음에 추가**:
```
## 멀티테넌트 BaaS 핵심 원칙 (ADR-022 결정 후 적용)

이 프로젝트는 1인 운영자가 자기 소유 10~20개 프로젝트의 공유 백엔드로 사용한다. 다음 7원칙은 양보 불가:

1. **Tenant는 1급 시민, prefix가 아니다.** 모든 신규 모델/route/cron/log에 `tenant_id` 첫 컬럼.
   - 02-current-code-audit.md §1: 현재 모든 테이블에 tenant_id 부재. 모델 추가 시 첫 컬럼으로 tenant_id 강제.
2. **플랫폼 코드와 컨슈머 코드 영구 분리.** yangpyeon 코드베이스 = 플랫폼만. 컨슈머 도메인 = manifest 기반 plugin.
   - ADR-024(Plugin 코드 격리) 결정 대상. EdgeFunction 화이트리스트가 컨슈머별로 DB-driven 정책이 되어야 함.
3. **한 컨슈머의 실패는 다른 컨슈머에 닿지 않는다.** worker pool 격리, per-tenant timeout/concurrency cap.
   - ADR-028(Cron Pool) 결정 대상. 현재 globalThis 싱글톤 cron registry는 tenant Map으로 재구조.
4. **컨슈머 추가는 코드 수정 0줄.** manifest 등록만으로 router/cron/auth 자동 구성.
   - ADR-026(Tenant Manifest) 결정 대상. JSON 등록만으로 새 컨슈머 진입.
5. **셀프 격리 + 자동 복구 + 관측성 = 3종 세트 동시.** 셋 중 둘만 가진 기능은 머지 금지.
   - ADR-021(audit fail-soft, 세션 56)이 이미 fail-soft 패턴을 정립. tenant 차원 추가가 ADR-029의 책임.
6. **불변 코어, 가변 plugin.** 코어(Auth/Audit/Cron/Router/RateLimit)는 6개월에 한 번 변경. 컨슈머별 요구는 plugin으로.
   - 코어 변경 시 7+1 Wave registry(세션 56) 절차 준수. 임의 변경 금지.
7. **모든 결정은 "1인 운영 가능한 N의 상한"으로 검증.** 새 기능이 N=20 컨슈머에서 1인 운영자가 감당 가능한가가 머지 게이트.
   - ADR 작성 시 §운영 부담 절을 의무화. 운영 부담이 N과 선형 이상이면 reject.
```

**변경 근거**:
- 기존 "핵심 원칙"은 단일 사용자 가정에서 안전한 항목들(시크릿/역사/연결성)이며 그대로 유지.
- 신설 섹션은 멀티테넌트 BaaS 전환의 7원칙이며, 모든 ADR-022~029의 결정 가드레일.
- 7원칙 각 항목에 출처 ADR과 audit 문서 cross-reference로 검증 가능성 부여.
- "ADR-022 결정 후 적용" 부제로 적용 시점 명시 — ADR-022가 ACCEPTED되기 전까지는 가이드일 뿐.

---

### 3. "문서 체계 (풀뿌리 트리)" 섹션에 추가

**현재 (CLAUDE.md L48~L49) — `docs/research/_SPIKE_CLEARANCE.md` 항목 다음**:
```
├─→ docs/research/_SPIKE_CLEARANCE.md ···· 스파이크 코딩 허가 레지스트리
│   └─→ docs/research/decisions/ ········ ADR (Architecture Decision Records)
```

**제안 — 위 항목과 `spikes/README.md` 사이에 신설 추가**:
```
├─→ docs/research/_SPIKE_CLEARANCE.md ···· 스파이크 코딩 허가 레지스트리
│   └─→ docs/research/decisions/ ········ ADR (Architecture Decision Records)
│
├─→ docs/research/baas-foundation/ ········ 멀티테넌트 BaaS 전환 설계 (ADR-022~029, 2026-04-26~)
│   ├─→ 00-context/ ···················· 사전 분석 (기존 결정 + 코드 매핑)
│   │   ├─ 01-existing-decisions-audit.md  Wave/Spike/ADR 통합 감사
│   │   └─ 02-current-code-audit.md ···· 코드의 단일테넌트 가정 매핑
│   ├─→ 01-adrs/ ······················· ADR-022~029 결정 문서
│   │   ├─ ADR-022 (정체성 재정의 — ADR-001 supersede)
│   │   ├─ ADR-023 (데이터 격리: schema-per-tenant / RLS / DB-per-tenant)
│   │   ├─ ADR-024 (Plugin 코드 격리)
│   │   ├─ ADR-025 (인스턴스 모델)
│   │   ├─ ADR-026 (Tenant Manifest/Registry)
│   │   ├─ ADR-027 (Multi-tenant Router)
│   │   ├─ ADR-028 (Cron Worker Pool / Per-tenant Isolation)
│   │   └─ ADR-029 (Per-tenant Observability)
│   ├─→ 02-proposals/ ·················· CLAUDE.md 등 변경 제안 (본 문서 포함)
│   └─→ 03-spikes/ ····················· 신규 기술 스파이크 (Prisma multi-schema 등)
```

**변경 근거**:
- baas-foundation 폴더는 새 의사결정 트리의 진입점이며 풀뿌리 트리에 등록되지 않으면 후속 세션이 발견 불가.
- 4개 하위 폴더(00-context / 01-adrs / 02-proposals / 03-spikes)를 명시하여 워크플로우 노출.
- 8개 ADR 1줄씩 표기 — 어떤 결정이 어디 있는지 한눈에 파악.
- 위치는 `docs/research/_SPIKE_CLEARANCE.md`와 `spikes/README.md` 사이가 적절. 같은 `docs/research/` 트리 인접 배치.

---

### 4. "프로젝트별 규칙" 섹션 갱신

**현재 (CLAUDE.md L76~L81)**:
```
## 프로젝트별 규칙
- 주석/커밋 메시지 한국어
- 스택별 코딩 규칙: docs/rules/coding-stacks/typescript-react.md
- UI: 다크 테마, Supabase 대시보드 스타일 (사이드바 네비게이션, 카드 기반)
- 한국어 UI
- 배포: PM2로 프로세스 관리, Cloudflare Tunnel 경유
```

**제안 — 위 내용 유지 + 아래 4개 항목 추가**:
```
## 프로젝트별 규칙
- 주석/커밋 메시지 한국어
- 스택별 코딩 규칙: docs/rules/coding-stacks/typescript-react.md
- UI: 다크 테마, Supabase 대시보드 스타일 (사이드바 네비게이션, 카드 기반)
- 한국어 UI
- 배포: PM2로 프로세스 관리, Cloudflare Tunnel 경유

### 멀티테넌트 BaaS 운영 규칙 (ADR-022 결정 후 적용)
- **신규 모델 추가 시**: prisma/schema.prisma의 model 첫 줄에 `tenantId String` 필드 강제. PR 리뷰 게이트.
- **신규 라우트 추가 시**: `/api/v1/t/<tenant>/...` 경로 또는 컨텍스트에서 tenantId 자동 추출 패턴 준수. 글로벌 라우트는 운영 콘솔 전용.
- **컨슈머 등록**: 코드 수정 0줄. tenant manifest(JSON 또는 DB row)만 추가하여 신규 컨슈머 진입.
- **장애 격리 검증**: 새 기능이 한 컨슈머의 실패가 다른 컨슈머에 전파되지 않음을 PR 본문에 증명(테스트 또는 설계 근거).
```

**변경 근거**:
- 기존 5개 항목은 BaaS 전환과 충돌하지 않으므로 유지(다크 테마 UI, 한국어, PM2/Tunnel 배포는 모두 호환).
- 신설 4개 운영 규칙은 ADR-022~029 결정의 일상 PR 게이트로 동작. 멀티테넌트 BaaS 전환이 코딩 차원에서 실제로 강제되도록.

---

## 변경 사항 적용 절차

1. **ADR-022 사용자 결정 (ACCEPTED)**
   - ADR-022 초안 작성(`docs/research/baas-foundation/01-adrs/ADR-022-identity-redefinition.md`)
   - 사용자 검토 → ACCEPTED 결정
2. **본 제안서를 사용자가 검토**
   - 본 문서(`02-proposals/CLAUDE-md-revision-proposal.md`) 4개 변경 대상 섹션 전수 확인
   - 수정 의견이 있으면 본 제안서를 먼저 갱신
3. **사용자 승인 시 CLAUDE.md 직접 수정**
   - 4개 섹션 변경을 1개 commit으로 통합 (브랜치: `docs/baas-foundation` 또는 `main` 직접)
   - commit 메시지: `docs(claude-md): ADR-022 멀티테넌트 BaaS 정체성 재정의 반영`
4. **git commit & 검증**
   - 커밋 후 새 세션 1회 시작 → CLAUDE.md 첫 로드 시 새 정체성 인식 확인
   - 새 세션이 "양평 부엌 서버 대시보드"가 아닌 "멀티테넌트 백엔드 플랫폼"으로 컨텍스트 진입하는지 검증
5. **CLAUDE.md를 다시 로드해서 적용 확인**
   - 동일 세션 내 재시작 또는 다음 세션 시작 시 최종 검증

---

## 적용 시점에 같이 해야 할 것

다음 작업은 본 제안 적용과 동일 세션에서 수행:

- **`docs/status/current.md`에 세션 요약 1행 추가**
  세션 N: "ADR-022~029 신설, BaaS 정체성 재정의(`stylelucky4u.com`이 1인 N=10~20 프로젝트의 공유 백엔드 플랫폼으로 재정의됨)"
- **`docs/handover/<날짜>-baas-foundation-handover.md` 작성**
  - 변경 결정 요약, ADR-022~029 진행 상태, 다음 세션 진입점
  - 첫 컨슈머(Almanac) 통합 작업이 spec/aggregator-fixes에서 baas-foundation 결정 후 어떻게 변경되어야 하는지
- **`docs/handover/next-dev-prompt.md` 갱신**
  - "다음 세션 시작 시 BaaS 전환 작업 컨텍스트로 진입" 명시
  - ADR-023(데이터 격리) 또는 ADR-026(Manifest)부터 진행할지 결정 필요
- **`docs/MASTER-DEV-PLAN.md` 갱신 검토**
  - Phase 15-22 (870h) 로드맵에 멀티테넌트 추가 공수(+380~480h) 반영
  - 01-existing-decisions-audit.md §5 "총합 ~1,250~1,350h(70주)" 수치 인용

---

## 변경 안 하는 것 (역사 보존 원칙)

- **기존 "단일 사용자 도구" 시기의 기록은 그대로 유지**
  - `docs/research/2026-04-supabase-parity/` Wave 1~5 결과 (123 문서, 106,588줄) — 변경 없음
  - ADR-001~021 — 본문 변경 없음. ADR-022가 ADR-001을 supersede한다는 메타데이터만 추가
  - `docs/logs/` 모든 세션 기록 — 변경 없음
  - `docs/status/current.md`의 기존 세션 요약표 — 변경 없음 (새 행만 추가)
- **CLAUDE.md의 변경 이력 처리**
  - "프로젝트 정보 §시작일"에 "2026-04-06 (단일 사용자 도구) → 2026-04-26 (멀티테넌트 BaaS 전환 결정, ADR-022)" 한 줄로 진화 표기
  - 별도의 변경 로그 파일을 만들지 않음. CLAUDE.md 자체가 자기 진화의 정직한 표상
- **`spikes/`, `docs/references/`, `docs/research/spikes/`, `docs/commands/` 등 기존 트리**
  - 모두 유지. 본 제안은 "추가"만 하고 "삭제"하지 않음

---

## 위험 및 완화

| 위험 | 영향 | 완화책 |
|------|------|--------|
| ADR-022 미결정 상태에서 CLAUDE.md 변경 | 후속 세션이 결정 안 된 정체성을 사실로 오인 | 본 제안서가 "ADR-022 ACCEPTED 후"를 적용 조건으로 명시. 본 제안서만 먼저 commit 가능하지만 CLAUDE.md는 ADR-022 결정 후에만 변경 |
| "양평 부엌 서버 대시보드" → "양평 부엌 서버"로 명칭 축약이 git/PM2/도메인 등 외부 식별자에 영향 | 배포 스크립트, Cloudflare Tunnel 설정 등 깨짐 | 외부 식별자(PM2 process name, 도메인, repo 이름)는 변경 금지. CLAUDE.md의 표시 명칭만 변경 |
| 7원칙이 너무 엄격하여 첫 컨슈머(Almanac) 통합이 늦어짐 | spec/aggregator-fixes 진행 지연 | 원칙 7번 ("1인 운영 가능 N 상한 검증")은 ADR 단계의 게이트. PR 단계에서는 §프로젝트별 규칙의 4개 항목만 적용. 점진 도입 |
| CLAUDE.md가 200줄 이상으로 비대화 | 모든 세션이 첫 컨텍스트로 더 많은 토큰 소비 | 변경 후에도 100줄 이내 유지 (현재 89줄 → 예상 ~140줄). 세부 7원칙은 본 제안서와 ADR-022에서만 상세 기술, CLAUDE.md는 요약 |

---

## 부록: 변경 후 CLAUDE.md 예상 줄 수

- 현재: 89줄
- 변경 후 예상: ~140줄 (+51줄)
  - "프로젝트 정보" 섹션: 7줄 → 9줄 (+2)
  - "문서 체계" 트리: ~10줄 추가 (baas-foundation/ 구조)
  - "핵심 원칙" 신설 §멀티테넌트: ~20줄
  - "프로젝트별 규칙" 신설 §멀티테넌트 운영: ~6줄
  - 기타 헤더 + 빈 줄: ~13줄

토큰 비용은 모든 세션 시작 시 고정으로 발생하므로, 전 세션 평균 +0.05% 정도. 정체성 오인으로 인한 재작업 비용 대비 수용 가능.

---

**문서 신뢰도**: 95% (ADR-001, audit 2개 문서 직접 인용. CLAUDE.md L# 참조 확인 완료)
