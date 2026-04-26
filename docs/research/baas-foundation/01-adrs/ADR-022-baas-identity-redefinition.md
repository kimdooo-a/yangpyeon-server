# ADR-022: BaaS 정체성 재정의 — 1인 운영자의 N-프로젝트 공유 백엔드 플랫폼

- 상태: ACCEPTED
- 작성일: 2026-04-26
- 결정자: 사용자 (kimdooo-a) — 2026-04-26 세션 58
- 작성: baas-foundation 워크스트림 (ADR 시리즈 #1/8 — 마스터 정체성 ADR)
- Supersedes (부분): **ADR-001 (Multi-tenancy 의도적 제외)** — §3.1 핵심 결정 + §3.2.1~3.2.5 + §6 재검토 트리거 1·3 부분만
- Related:
  - ADR-002 (Supabase 적응 전략 — 선별 OSS 채택, 보존)
  - ADR-018 (9-레이어 아키텍처 — 보존, 멀티테넌트 추가 시 L1/L2/L3에 tenant 차원 주입)
  - ADR-020 (standalone + rsync + pm2 reload — 보존, 멀티테넌트와 직교)
  - ADR-021 (감사 로그 cross-cutting fail-soft — 보존, audit_logs에 tenant_id 추가는 ADR-029에서)
  - ADR-023~029 (멀티테넌트 BaaS 시리즈 — **본 ADR의 옵션 A 채택 가정 위에 작성됨**)
- 참조 문서:
  - `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md`
  - `docs/research/baas-foundation/00-context/02-current-code-audit.md`
  - `docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md` (ADR-001 본문)
  - `docs/research/2026-04-supabase-parity/README.md` (Wave 1-5 완료 현황 + 14 카테고리 점수표)

---

## 1. 컨텍스트 (Context)

### 1.1 ADR-001의 핵심 가정

ADR-001 (`docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md`, 세션 26 확정)은 양평 부엌 서버 대시보드를 다음과 같이 정의했다:

> "양평 부엌 서버 대시보드는 **1인 운영 + 단일 팀 사용**을 전제로 설계된 자체호스팅 Supabase 호환 관리 대시보드이다." (ADR-001 §2.1)

> "양평 부엌 서버 대시보드는 Multi-tenancy를 지원하지 않는다. 이 결정은 '현재 지원 불가'가 아니라 **의도적이고 명시적인 설계 결정**이다." (ADR-001 §3.1)

이 결정은 Wave 3 시점(2026-04-18)에서 다음 데이터로 정당화되었다 (ADR-001 §2.4):

| 지표 | 당시 값 | 재검토 임계값 |
|------|--------|--------------|
| 실제 조직 수 | 1개 | 2개 이상 |
| 동시 사용 팀 수 | 1개 | 2개 이상 |
| 월간 활성 사용자 | 1명 | **2명 이상 6개월 지속** |
| B2B SaaS 전환 계획 | 없음 | 명시적 결정 |
| 데이터 격리 법적 요건 | 없음 | GDPR/PIPA 등 |

### 1.2 재검토 트리거 발동 사실

ADR-001 §6은 4가지 재검토 트리거를 정의했다. 그 중 **2개가 2026-04-26 시점에 충족**되었다 (`01-existing-decisions-audit.md` §1.1 참조):

#### 트리거 1: 지속적 다중 사용자 — **충족**
> ADR-001 원문: "조건: 프로젝트 사용자 수 > 2명이 6개월 이상 지속"

사용자가 본인 소유의 10~20개 프로젝트(영구 운영 의도)에 대한 공유 백엔드로 yangpyeon을 사용하기로 결정함. 각 프로젝트는 자체 사용자/데이터 흐름을 가지므로, **"단일 사용자 = 단일 organization"** 전제가 깨진다. 6개월 지속 조건은 **영구 운영 결정**으로 자동 충족.

#### 트리거 3: 팀 멤버 관리 기능 요건 추가 — **충족**
> ADR-001 원문: "FR(Functional Requirements)에 '별도 팀/조직 관리' 기능이 추가되는 경우"

10~20개 프로젝트 각각이 독립된 데이터/cron/edge function/storage 경계를 가져야 하므로, "별도 프로젝트 관리"라는 신규 FR이 사실상 필수가 된다. (단, 사용자가 "팀"이 아니라 "프로젝트"로 정의했으므로 정확한 명칭은 ADR-026에서 확정)

#### 트리거 2/4: 미충족 (보존)
- 트리거 2 (B2B SaaS 전환): **미발동**. 사용자가 "외부 가입/판매 없음"을 명시.
- 트리거 4 (법적 격리 요건): **미발동**. 본인 소유 프로젝트들이므로 GDPR/PIPA 요건 없음.

### 1.3 사용자 발언 (직접 인용)

> 본인 소유 10~20개 프로젝트의 **공유 백엔드**로 yangpyeon을 사용하겠다.
> 외부 가입/판매는 없다. 모든 컨슈머는 운영자 본인 소유.
> 1인 운영을 유지하면서도 N=20까지 확장 가능해야 한다.

이 발언은 ADR-001의 "1인 운영 + 단일 팀" 전제 중 **"단일 팀" 부분만** 반증한다. **"1인 운영"은 유지된다**.

### 1.4 깨지지 않은 ADR-001 가정 (보존 영역)

ADR-001의 다음 항목은 본 ADR로 영향받지 않으며 **그대로 유효**하다:

- **자체 호스팅 + 단일 물리 서버 (단일 PM2 + 단일 Postgres)** — ADR-025에서 재검토하되, "single-instance multi-tenant"가 기본
- **Supabase Cloud의 Org/Project 2단계 계층 미도입** (양평은 더 단순한 구조 채택) — ADR-026에서 "1단계 tenant"로 재정의
- **선별 OSS 채택 전략** (ADR-002) — 100% 보존
- **9-레이어 아키텍처** (ADR-018) — 100% 보존, tenant 차원만 주입
- **standalone + rsync + pm2 reload** (ADR-020) — 100% 보존
- **감사 로그 cross-cutting fail-soft** (ADR-021) — 100% 보존, tenant_id 컬럼만 추가

### 1.5 현 상태의 갭 (코드 측면)

`02-current-code-audit.md`에 따르면 현재 코드는 단일 테넌트 가정 위에 30+ 파일이 작성되어 있다:

- 모든 Prisma 모델: `tenant_id` 컬럼 부재 (User/Folder/File/ApiKey/SqlQuery/EdgeFunction/CronJob/Webhook/MfaEnrollment/Session/JwksKey/RateLimitBucket/SecretItem)
- JWT payload: `aud`/`tenantId` 클레임 없음
- API 라우트: `/api/v1/*` 단일 패턴, tenant context 추출 로직 부재
- Cron registry: `globalThis` 싱글톤
- Audit log: tenant 차원 없음
- Rate limit bucket key: tenant 차원 없음

따라서 본 ADR의 결정은 **단순 정책 변경이 아니라 후속 7개 ADR (023~029) + 30~40개 파일 수정 + 마이그레이션**으로 이어진다.

---

## 2. 결정해야 할 것 (Decision Required)

yangpyeon의 정체성을 다음 4가지 중 어느 것으로 정의할 것인가?

### 옵션 A: "1인-N프로젝트 공유 백엔드" (closed multi-tenant BaaS) — **권고안**

#### 정의
1인 운영자가 자기 소유 10~20개 프로젝트의 공유 백엔드 플랫폼. **외부 가입/판매 없음**. 모든 컨슈머(=tenant)는 운영자 본인 소유.

#### 핵심 변화
- **데이터 모델**: 모든 비즈니스 모델에 `tenantId` FK 추가 + `Tenant` 모델 신설 (ADR-023)
- **인증/JWT**: payload에 `tenantId` + `aud` 클레임 추가 (ADR-027)
- **라우팅**: `/api/v1/t/<tenant>/...` 또는 JWT 기반 자동 추출 (ADR-027)
- **Cron**: registry를 `Map<tenantId, RegistryState>`로 격리 + advisory lock key를 `<tenantId>:<jobName>` 합성 (ADR-028)
- **Storage**: SeaweedFS 버킷/경로 prefix에 tenantId 분리 (ADR-023)
- **JWKS**: 단일 키셋 공유 (옵션) 또는 tenant별 키셋 (격리 강) — ADR-027에서 결정
- **UI**: tenant 선택/전환 UX 추가 (ADR-026 결정 후 UI 청사진 amendment)
- **API 키/Edge Fn 정책/Rate Limit**: tenant 차원으로 분리

#### 공수
- 기존 Wave 5 로드맵: **Phase 15-22 = 870h** (50주)
- 멀티테넌트 추가: **+380~480h** (`01-existing-decisions-audit.md` §5 기준)
- **총합: ~1,250~1,350h (70주)**

#### 운영 부담
1인 운영자가 N=20까지 운영 가능 목표. 단, 다음 자동화/도구가 필요:
- Tenant 프로비저닝 자동화 (1 command로 새 tenant 생성)
- Tenant별 모니터링 대시보드 (yangpyeon 자체 UI)
- Cron/Edge Fn 격리 — 한 tenant 장애가 다른 tenant 영향 차단
- Per-tenant 백업/복구 (단일 PG + tenantId 필터 기반)

#### 장점
1. **사용자 명시 요구와 정확히 일치** — "10~20개 프로젝트 공유 백엔드, 외부 가입 없음"
2. **Wave 1-5 호환성 유지** — 14 카테고리 1순위 채택 기술 100% 보존, 점수표 무효화 없음
3. **단일 인스턴스 단순성 유지** — ADR-025에서 single-instance multi-tenant 채택 가능 (DB-per-tenant 회피)
4. **데이터 주권 100% 유지** — 본인 소유 프로젝트만이므로 외부 격리 법적 부담 없음
5. **점진적 확장 가능** — N=2부터 시작해서 N=20까지 검증하며 확장
6. **빌드 비용 명확** — +380~480h로 정량화됨 (`01-existing-decisions-audit.md` §5)

#### 단점
1. **공수 +44%** (870h → 1,250~1,350h) — 50주 → 70주
2. **30~40개 파일 수정** + 마이그레이션 16~17개 파일 추가 (`02-current-code-audit.md` §7)
3. **버그 위험 신규 도입** — 테넌트 크로스 리크 (ADR-001 §4.1.5에서 "구조적으로 불가능"이라 했던 버그 클래스가 다시 가능해짐)
4. **JWKS/Vault 회전 복잡도 증가** — tenant별 키셋 시 운영 부담
5. **MVP 일정 지연** — Phase 15 (Auth Advanced 22h) 진입 전 ADR-023~029 + 데이터 모델 마이그레이션 우선 필요

#### Wave 1-5 영향
- **14 카테고리 점수표**: **변경 없음** (1순위 기술 100% 유지)
- **9-레이어 아키텍처**: 변경 없음 (각 레이어에 tenant 차원만 주입)
- **재검토 필요 ADR**: ADR-001 (부분 supersede), ADR-003~006 (amendment, tenant 필터 추가), ADR-015 (advisory lock key amendment), ADR-021 (audit_logs.tenantId 추가)
- **신규 ADR**: ADR-023~029 (7개)
- **로드맵 영향**: Phase 15-22 모두 +5~15h씩 (cumulative +380~480h)
- **MVP 영향**: Phase 15 진입 전 "Phase 14.5: 멀티테넌트 기반 마이그레이션" 신설 권고 (~80~120h)

---

### 옵션 B: "공개 SaaS BaaS" (open multi-tenant)

#### 정의
외부 사용자 가입 가능. Stripe billing, SLA, support, T&C/PP, 결제 환불 시스템 포함. Vercel/Render/Supabase Cloud와 직접 경쟁.

#### 핵심 변화
- 옵션 A의 모든 변화 + 다음:
- 결제 시스템 (Stripe + Webhook + Invoice)
- Onboarding 자동화 + 이메일 verification
- SLA 모니터링 + uptime 보장 (99.9% target)
- Support ticket 시스템 + on-call rotation
- 법적 문서 (T&C, Privacy Policy, DPA, GDPR Article 28)
- 결제 실패/dunning 처리
- 사용량 기반 rate limit + 과금
- Multi-region 배포 (latency 보장)

#### 공수
- 옵션 A (1,250~1,350h) + SaaS 운영 인프라 **추가 1,500~2,500h**
- **총합: ~2,750~3,850h (12~24개월)**

#### 운영 부담
**1인 운영 불가능**. 최소 필요 인력:
- 백엔드 개발자 1명
- DevOps/SRE 1명 (on-call)
- Customer Success 1명
- (선택) 디자이너/PM 0.5명

#### 장점
1. 수익화 가능 (B2B SaaS 모델)
2. 시장 검증된 패턴 (Supabase 자체가 이 모델)

#### 단점
1. **사용자 명시 거부** — "외부 가입/판매 없음" 직접 명시
2. **1인 운영 불가** — 사용자 "1인 운영 유지" 요구와 정면 충돌
3. **Wave 1-5 일부 무효화** — Auth Core, Storage, Observability 청사진이 SaaS 요건 미반영
4. **자본/시간 투자 막대** — 1.5~2.5배 추가 공수
5. **법적 리스크** — GDPR/PIPA 격리 요건 발동, 트리거 4 발동

#### 추천 여부: ❌ **거부 권고**
사용자 요구와 명백히 불일치. 본 ADR에서는 옵션으로만 기록하고 채택하지 않음.

---

### 옵션 C: "단일 사용자 도구 유지" (현 상태 유지, 패치만)

#### 정의
ADR-001을 그대로 유지. 외부 컨슈머(예: Almanac 같은 다른 프로젝트)가 yangpyeon을 사용하려고 하면 다음 중 하나로 대응:
- (a) 별도 yangpyeon 인스턴스 배포 (per-consumer instance)
- (b) "특수 케이스 spec/브랜치"로 격리 — 컨슈머 코드/데이터를 yangpyeon 단일 인스턴스 내 별도 prefix로 패치
- (c) 컨슈머가 자체 백엔드 유지

#### 핵심 변화
- 코드 변경 거의 없음
- 컨슈머 추가 시마다 spec/브랜치 fork (~15일/컨슈머)
- 또는 별도 인스턴스 배포 (~3~5일 + 인프라 비용/컨슈머)

#### 공수
- 컨슈머당 **~15일** (브랜치 패턴) 또는 **~3~5일 + 인프라** (인스턴스 패턴)
- N=20일 때:
  - 브랜치 패턴: **300일 (~14개월)** + 영원한 머지 지옥
  - 인스턴스 패턴: **60~100일** + N=20 인프라 운영 부담 (메모리 20×500MB = 10GB, 백업 20세트, 모니터링 20×)

#### 운영 부담
- N=2~3까지: 가능
- N=5+: 인스턴스 패턴이라도 1인 운영 한계 도달
- N=10~20: **현실적으로 불가능** — 모든 인스턴스 동시 업그레이드/패치 불가, drift 발생, 디버깅 시 "어느 인스턴스?" 추적 비용

#### 장점
1. 단기 코드 변경 없음 (ADR-022~029 작성 회피 가능)
2. 현 코드의 "tenant 크로스 리크 버그 0" 특성 유지

#### 단점
1. **N=10~20에서 비용 폭발** — 위 공수 계산 참조
2. **사용자 요구와 불일치** — "공유 백엔드"라는 핵심 요구를 거부
3. **장기적으로 더 비쌈** — 컨슈머 추가될 때마다 누적 비용 증가, 옵션 A의 1회 480h를 5~10년에 걸쳐 분할 지불하는 셈
4. **장기 일관성 상실** — 인스턴스/브랜치마다 버전 drift, 보안 패치 누락 위험

#### 추천 여부: ❌ **거부 권고**
N=2~3 한정으로는 합리적이나, 사용자가 N=10~20을 명시했으므로 부적합.

---

### 옵션 D: "하이브리드" (yangpyeon = 운영 콘솔, 데이터는 진짜 Supabase Cloud)

#### 정의
- 인증/cron/audit/admin/UI = yangpyeon (자체)
- 데이터/RLS/Storage/Realtime = Supabase Cloud (매니지드)
- yangpyeon이 Supabase Management API를 호출해서 프로젝트 생성/관리

#### 핵심 변화
- yangpyeon 코드는 옵션 C와 유사하게 단순 유지
- Supabase Cloud SDK 통합 + Management API 클라이언트 작성
- 데이터/RLS/스토리지 결정을 Supabase Cloud에 위임

#### 공수
- 통합 ~3~6개월 (Supabase Management API 학습 + 통합)
- 단, **Wave 1-5의 14 카테고리 청사진 중 8~10개가 무효화** (Storage/Realtime/Edge Fn/Data API/DB Ops 등)

#### 운영 부담
- yangpyeon: 1인 운영
- Supabase Cloud: 매니지드 (실질 운영 부담 0)
- **2개 시스템이지만 1개는 매니지드**

#### 장점
1. yangpyeon 자체 복잡도 최소
2. Supabase Cloud의 검증된 멀티테넌트 인프라 활용
3. 단기 구현 빠름

#### 단점
1. **사용자 명시적 거부** — "자체 구축 결정" 명시
2. **데이터 주권 상실 (부분)** — 본인 데이터가 Supabase 인프라에 저장됨
3. **비용 증가** — Supabase Cloud Pro $25/월 × 20 프로젝트 = $500/월 (vs ADR-001 §7.4의 양평 $250/년)
4. **Wave 1-5 대규모 폐기** — Storage(SeaweedFS), Realtime(wal2json), Edge Fn(isolated-vm), DB Ops(node-cron+wal-g), Data API(REST+pgmq) 청사진 무효화
5. **Vendor lock-in** — Supabase 가격 변동/정책 변경에 종속

#### 추천 여부: ❌ **거부 권고**
사용자가 자체 구축을 명시. 옵션으로만 기록하고 채택하지 않음.

---

## 3. 옵션 비교 매트릭스

| 차원 | A (closed MT) | B (open SaaS) | C (single-user) | D (hybrid) |
|------|---------------|---------------|-----------------|------------|
| **사용자 요구 부합** | ✅ 정확 일치 | ❌ 외부 가입 거부 | ❌ 공유 거부 | ❌ 자체 구축 거부 |
| **1인 운영 가능** | ✅ N=20까지 | ❌ 불가 | △ N≤3 한정 | ✅ |
| **N=20 확장** | ✅ | ✅ | ❌ | ✅ |
| **데이터 주권** | ✅ | △ multi-region | ✅ | ❌ Supabase 종속 |
| **공수 (총)** | 중 (~1,300h) | 대 (~3,300h) | 소~중 (15일×N) | 소 (~600h) |
| **Wave 1-5 호환** | ✅ 점수 보존 | ⚠️ 일부 폐기 | ✅ 100% | ❌ 8~10 청사진 폐기 |
| **MVP 영향** | +Phase 14.5 80~120h | 전면 재설계 | 영향 없음 | 청사진 절반 폐기 |
| **장기 비용 (5년)** | 1× 480h 일회성 | 운영비 막대 | N×15일 누적 | $500/월 × 60개월 |
| **버그 위험** | tenant 크로스 리크 | 동일 + SaaS 위험 | 0 | Supabase 의존 |
| **법적 리스크** | 없음 (본인 소유) | GDPR/PIPA | 없음 | DPA 필요 |
| **자체 호스팅** | ✅ | ✅ | ✅ | ❌ 부분 |

---

## 4. 권고 (Recommendation)

### 4.1 권고안: **옵션 A (closed multi-tenant BaaS)**

#### 이유 (3가지)
1. **사용자 명시 요구와 유일하게 정확히 일치**
   - "10~20개 프로젝트 공유 백엔드" = closed multi-tenant
   - "외부 가입/판매 없음" = closed (not open SaaS)
   - "1인 운영 유지" = single-instance + automation 가능 (N=20까지)
   - "자체 구축" = hybrid 거부

2. **Wave 1-5 호환성 — 14 카테고리 점수표 100% 보존**
   - 1순위 기술 (TanStack/Monaco/SeaweedFS/wal2json/isolated-vm/jose/AI SDK 등) 모두 그대로 유지
   - 9-레이어 아키텍처 보존, 각 레이어에 tenant 차원만 주입
   - 870h 로드맵 무효화 없음, +380~480h **추가**만

3. **장기 비용이 가장 명확하고 낮음**
   - 옵션 A: 1회 480h 추가 (~6개월)
   - 옵션 B: 영구 운영 인력 비용 (월 $10~20k)
   - 옵션 C: N×15일 누적 (~5년 후 옵션 A 비용 초과)
   - 옵션 D: 월 $500 × 60개월 = $30,000 + vendor lock-in

#### 권고 신뢰도
**높음 (90%)** — 사용자 요구가 4가지 옵션 중 옵션 A에만 부합. 단, 공수 추정(+380~480h)은 ADR-023~029 작성 후 ±20% 범위로 정밀화 필요.

### 4.2 채택 시 즉시 후속 작업
1. ADR-023~029 (7개 자매 ADR) 작성 — 본 ADR ACCEPTED 가정 위에 일괄 진행 (ACCEPTED 가정 발효: 2026-04-26)
2. Phase 14.5 신설 제안: "멀티테넌트 기반 마이그레이션" (~80~120h, Phase 15 진입 전)
3. ADR-001 본문에 "**§3.1, §3.2.1~3.2.5, §6.1, §6.3은 ADR-022로 supersede됨**" 헤더 추가 (별도 sub-agent)
4. CLAUDE.md "프로젝트 정보" 섹션에 1줄 추가 (별도 sub-agent, §6 참조)

---

## 5. 결정 (Decision)

**ACCEPTED (2026-04-26): 옵션 A — closed multi-tenant BaaS**

사용자 결정 근거: "나혼자 나의 프로젝트 10~20개를 운영하고자하며, 그 백엔드로 이 프로젝트를 사용하려고해. 그래서 개발 부담이 있더라도 이 프로젝트가 내가 사용하고 운영하는 프로젝트들의 백엔드로서 계속적인 확장이 가능하도록 근본적인 설계방향이 필요해." (2026-04-26)

> 본 ADR은 2026-04-26 세션 58에서 사용자가 옵션 A를 채택하여 ACCEPTED 상태로 확정되었다.
> ADR-023~029의 가정이 확정되며, ADR-001 §3.1, §3.2.1~3.2.5, §6.1, §6.3의 supersede 범위가 발효된다.

---

## 6. 결정 시 영향 (Impact if Adopted — Option A 기준)

### 6.1 영향 받는 기존 ADR

| ADR | 영향 종류 | 변경 내용 |
|-----|----------|----------|
| **ADR-001** | 부분 supersede | §3.1 핵심 결정 + §3.2.1~3.2.5 + §6 트리거 1·3 부분만 supersede. §3.2.4(워크스페이스), §3.3(API 호환)은 ADR-026에서 재정의. §4.1(이점)은 옵션 A 채택 시 무효화되는 부분만 명시. |
| **ADR-002** | 영향 없음 | 선별 OSS 채택 전략 100% 보존 |
| **ADR-003~006** | amendment | Table Editor CRUD/권한 정책에 tenant 필터 추가 (ADR-023 amendment로 처리) |
| **ADR-015** | amendment | PM2 cluster advisory lock key를 `<tenantId>:<jobName>`으로 변경 (ADR-028에서 처리) |
| **ADR-018** | 영향 없음 | 9-레이어 아키텍처 보존, 각 레이어에 tenant 차원만 주입 |
| **ADR-020** | 영향 없음 | standalone + rsync + pm2 reload 100% 보존 |
| **ADR-021** | amendment | audit_logs 테이블에 `tenant_id` 컬럼 추가 (ADR-029에서 처리), safeAudit 11개 콜사이트는 변경 불필요 (자동 주입) |

### 6.2 영향 받는 Phase (Wave 5 로드맵)

| Phase | 기존 공수 | +tenant 추가 | 변경 후 |
|-------|----------|-------------|--------|
| **Phase 14.5 (신규)** | — | 80~120h | tenant 모델 + 마이그레이션 + JWT/route 기반 작업 |
| Phase 15 (Auth Adv) | 22h | +6h | tenant 인식 MFA/Rate Limit |
| Phase 16 (Obs/Ops) | 40h | +12h | per-tenant 메트릭/audit |
| Phase 17 (Auth Core/Storage) | 60h | +24h | tenant 인식 Auth + SeaweedFS prefix |
| Phase 18 (Editors) | 400h | +60h | tenant 컨텍스트 SQL/Table 필터 |
| Phase 19 (Edge/Realtime) | 75h | +50h | tenant별 isolated-vm 정책 + Realtime 채널 분리 |
| Phase 20 (DB mgmt) | 198h | +80h | tenant별 cron/backup/advisor |
| Phase 21 (API/UX) | 40h | +18h | tenant 인식 REST + UI |
| Phase 22 (마무리) | 35h | +30h | E2E 테넌트 격리 테스트 |
| **합계** | **870h** | **+360~480h** | **~1,250~1,350h (70주)** |

### 6.3 다음 ADR 트리거

본 ADR에서 옵션 A가 채택되면 다음 7개 ADR이 자동으로 옵션 A 가정 위에 작성된다:

| ADR | 주제 | 본 ADR과의 의존성 |
|-----|------|------------------|
| ADR-023 | 데이터 격리 모델 (RLS / schema-per-tenant / DB-per-tenant) | 옵션 A 가정: tenant 1급 시민화 |
| ADR-024 | Plugin/도메인 코드 격리 (Edge Fn/Cron 정책 분리) | 옵션 A 가정: tenant당 정책 분기 |
| ADR-025 | 인스턴스 모델 (single vs Tier vs per-consumer) | 옵션 A 가정: 1인 운영 가능 모델 |
| ADR-026 | Tenant Manifest/Registry 설계 | 옵션 A 가정: tenant 메타데이터 관리 |
| ADR-027 | Multi-tenant Router 패턴 (subdomain vs JWT vs path) | 옵션 A 가정: 라우팅 차원 추가 |
| ADR-028 | Cron Worker Pool / Per-tenant Isolation | 옵션 A 가정: cron registry 격리 |
| ADR-029 | Per-tenant Observability (metrics/logs/traces) | 옵션 A 가정: audit_logs.tenant_id |

---

## 7. 정체성 변경의 구체적 표현 (Identity Diff)

### 7.1 Before (ADR-001 §3.1, §1 메타)

> ADR-001 §3.1 (현재):
> "양평 부엌 서버 대시보드는 Multi-tenancy를 지원하지 않는다."
>
> ADR-001 §2.1 (현재):
> "양평 부엌 서버 대시보드는 1인 운영 + 단일 팀 사용을 전제로 설계된 자체호스팅 Supabase 호환 관리 대시보드이다."

### 7.2 After (ADR-022, 옵션 A 채택 시)

> "양평 부엌 서버는 **1인 운영자가 자기 소유 10~20개 프로젝트의 공유 백엔드 플랫폼**이다.
> 외부 가입/판매 없는 closed multi-tenant BaaS이며, 모든 컨슈머(=tenant)는 운영자 본인 소유다.
> 자체 호스팅 + 단일 PM2 인스턴스 + 단일 PostgreSQL을 유지하면서, 데이터/cron/edge function/storage/audit 모든 차원에서 tenant 격리를 1급 시민으로 채택한다.
> Wave 1-5에서 확정된 14 카테고리 1순위 기술과 9-레이어 아키텍처는 100% 유지하며, 각 레이어에 tenant 차원만 주입한다."

### 7.3 보존되는 정체성 표현

다음 표현은 옵션 A 채택 후에도 그대로 유효:
- "자체 호스팅 Supabase 호환 관리 대시보드" — 보존
- "WSL2 Ubuntu + PM2 + Cloudflare Tunnel 단일 서버" — 보존 (ADR-025에서 재확인)
- "Next.js 통합 단일 앱" — 보존
- "데이터 주권 100%" — 강화 (본인 소유 N개 프로젝트 모두 본인 인프라)
- "1인 운영" — **보존** (자동화/툴링 보강 필요)

---

## 8. CLAUDE.md 변경 제안 (참고용 — 별도 sub-agent가 처리)

본 ADR은 정체성 변경 결정이므로, 채택 시 프로젝트 루트 CLAUDE.md의 "프로젝트 정보" 섹션을 갱신해야 한다. 다음은 변경안 초안 (실제 적용은 별도 sub-agent가 수행):

### 8.1 추가 제안 (CLAUDE.md "프로젝트 정보" 섹션)

```diff
 ## 프로젝트 정보
 - 프로젝트명: 양평 부엌 서버 대시보드 (stylelucky4u.com)
+- 정체성: 1인 운영자의 N=10~20 프로젝트 공유 백엔드 (closed multi-tenant BaaS, ADR-022)
 - 스택: Next.js 15 + TypeScript + Tailwind CSS
 - 시작일: 2026-04-06
 - 배포 환경: WSL2 Ubuntu (PM2) + Cloudflare Tunnel
 - 도메인: stylelucky4u.com
 - 포트: 3000 (localhost)
```

### 8.2 삭제 제안 (없음)

ADR-022는 ADR-001의 일부만 supersede하므로 CLAUDE.md에서 삭제할 항목은 없다. 추가만.

---

## 9. 재검토 트리거 (이 ADR 자체의)

본 ADR에서 옵션 A가 채택되더라도, 다음 조건에서 옵션 A를 재검토한다:

### 9.1 트리거 A1: 컨슈머 수 폭증
```
조건: 활성 tenant 수가 N=20을 6개월 이상 초과 (예: N=30+)
측정: yangpyeon 자체 메트릭 (Tenant 테이블 count + 활성도)
재검토: 옵션 A → 옵션 A' (tier 분리) 또는 옵션 B (open SaaS)로 전환 검토
```

### 9.2 트리거 A2: 단일 PostgreSQL 리소스 한계
```
조건: 단일 PG의 connection pool 80% 초과 OR p95 쿼리 시간 200ms 초과 (sustained 1주)
측정: pg_stat_activity, Phase 16 KPI
재검토: ADR-025 인프라 분리 (tier별 PG 인스턴스) 검토 — 옵션 A 내부 진화
```

### 9.3 트리거 A3: 외부 사용자 노출
```
조건: 한 tenant의 컨슈머가 외부 사용자에게 공개 SaaS로 노출하기로 결정
측정: 비즈니스 의사결정 (코드로 측정 불가)
재검토: 해당 tenant만 옵션 B 부분 도입 (per-tenant SaaS 모드) 검토
```

### 9.4 트리거 A4: 데이터 격리 법적 요건 발생
```
조건: 본인 소유 프로젝트 중 어느 하나가 GDPR/PIPA 격리 요건 발동
측정: 법률 검토
재검토: 해당 tenant DB-per-tenant 격리 (ADR-023 재검토)
```

### 9.5 트리거 A5: 옵션 A 공수 추정 +50% 초과
```
조건: ADR-023~029 작성 후 정밀 산정 결과가 +480h 초과 (예: +600h+)
측정: ADR-023~029 완료 시점
재검토: 옵션 A의 전체 공수가 기존 870h 대비 +60%(=522h) 초과 시 비용/효익 재평가
대응: 기능 우선순위 조정 또는 옵션 D(hybrid) 부분 도입 재검토
```

---

## 10. 명시적으로 결정하지 않은 것 (Out of Scope)

본 ADR은 **정체성 결정**만 다룬다. 다음 항목은 자매 ADR에서 결정:

| 항목 | 위임 ADR |
|------|---------|
| 데이터 격리 방식 (RLS / schema / DB) | ADR-023 |
| Tenant 단위 명칭 (tenant / project / workspace / consumer) | ADR-026 |
| Tenant Router 패턴 (subdomain / JWT / path) | ADR-027 |
| Cron 격리 구체 방안 | ADR-028 |
| Per-tenant 메트릭 차원 정의 | ADR-029 |
| Tenant 프로비저닝 자동화 도구 | ADR-024 |
| 인프라 분리 시점/조건 | ADR-025 |
| MFA 시드 tenant별 분리 여부 | ADR-027 (JWT 결정에 종속) |
| JWKS tenant별 키셋 vs 공유 | ADR-027 |
| API 키 tenant 차원 추가 | ADR-026 (Tenant Registry 설계에 종속) |

---

## 11. 참고 (References)

### 11.1 인용 문서

- **ADR-001 본문**: `docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md`
  - §1 메타 (L10~22): 결정 메타데이터
  - §2.1 (L29~38): "1인 운영 + 단일 팀" 정의
  - §2.4 (L70~78): 정량 임계값 (재검토 트리거)
  - §3.1 (L83~87): 핵심 결정 본문
  - §3.2.1~3.2.5 (L91~169): 구체적 결정 5항목
  - §6.1, §6.3 (L451~480): 트리거 1·3 정의 (본 ADR로 발동)

- **기존 결정 감사**: `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md`
  - §1.1 (L10~19): 트리거 발동 사실 정리
  - §3 (L93~100): 충돌 ADR 목록
  - §4 (L104~114): 신규 ADR 8개 정의
  - §5 (L131~143): 공수 재산정 (+380~480h)
  - §6 (L146~157): ADR 작성자 체크리스트

- **현 코드 감사**: `docs/research/baas-foundation/00-context/02-current-code-audit.md`
  - §1 (L7~25): 데이터 모델 단일테넌트 가정 (12개 모델)
  - §2 (L28~48): 인증 흐름 가정 (JWT/JWKS/API Key)
  - §3 (L51~64): 라우트 패턴 단일성
  - §4 (L66~85): Cron 모델 globalThis
  - §7 (L135~163): 영향 파일 ~30개 (Critical/High/Medium)

- **Wave 1-5 점수표**: `docs/research/2026-04-supabase-parity/README.md`
  - L75~94 (14 카테고리 점수): **본 ADR로 영향 없음** (옵션 A 채택 시)
  - L121~127 (Wave 1-5 완료 현황): 123 문서, 106,588줄, Phase 15-22 870h 50주

### 11.2 ADR-001 §6.5 "재검토 시 예상 작업량" 대조

ADR-001 §6.5는 트리거 발동 시 100~120h를 추정했다. 본 ADR은 이를 +380~480h로 갱신한다. 차이의 이유:

| ADR-001 §6.5 (당시 추정) | ADR-022 (현재 추정) |
|-------------------------|--------------------|
| 스키마 마이그레이션: 30~50h | + Cron registry 격리: 30~40h |
| Auth 미들웨어: 20h | + Edge Fn 정책 DB 조회: 20~30h |
| API 라우트 수정: 20h | + Storage prefix 분리: 15~25h |
| UI 재설계: 15h | + Audit/Rate Limit 차원 추가: 25~35h |
| 테스트 재작성: 15h | + JWKS tenant 분리(옵션): 20~30h |
| **합계: 100~120h** | + Tenant 프로비저닝 자동화: 30~50h |
|                         | + per-tenant 모니터링 UI: 25~35h |
|                         | + 통합 테스트 (E2E 격리): 30~50h |
|                         | + ADR 작성 + 마이그레이션 16~17 파일: 35~45h |
|                         | **합계: 380~480h** |

ADR-001 §6.5는 "최소 스키마 변경" 시나리오였고, 본 ADR은 "1인 운영 + N=20" 시나리오의 자동화/모니터링/격리까지 포함하므로 4배 증가한다.

### 11.3 코드 위치 참조 (옵션 A 채택 시 수정 대상)

`02-current-code-audit.md` §7 Critical/High에서 식별된 30+ 파일은 ADR-023~029에서 모듈별로 재인용된다. 본 ADR에서는 영향 규모만 명시:

- **Critical (반드시 수정, 7개 파일)**: prisma/schema.prisma, src/lib/auth.ts, src/lib/jwt-v1.ts, src/lib/api-guard.ts, src/lib/cron/registry.ts, src/lib/cron/runner.ts, src/lib/rate-limit-db.ts
- **High (12개 파일)**: jwks/store, auth/keys, runner/isolated, audit-log, audit-log-db, auth/login, members, api-keys, functions/run, sql/execute, cron/run, pg/pool
- **Medium/Low (10+ 파일)**: danger-check, secret store, 기타

---

## 12. 요약 (Summary)

| 항목 | 내용 |
|------|------|
| **결정 요청** | yangpyeon 정체성을 옵션 A/B/C/D 중 1개로 확정 |
| **권고안** | **옵션 A: closed multi-tenant BaaS (1인-N프로젝트 공유 백엔드)** |
| **근거** | 사용자 요구 정확 일치 + Wave 1-5 호환 + 1인 N=20 운영 가능 + 장기 비용 최저 |
| **공수 (옵션 A)** | +380~480h (기존 870h → 1,250~1,350h, 50주 → 70주) |
| **Supersede 범위** | ADR-001 §3.1, §3.2.1~3.2.5, §6.1, §6.3만 (다른 결정은 보존) |
| **자매 ADR** | ADR-023~029 (7개) — 옵션 A 가정 위에 동시 작성 |
| **재검토 트리거** | A1~A5 (5개) — N=30+, PG 한계, 외부 노출, 법적 요건, 공수 +50% |
| **결정 상태** | **ACCEPTED (2026-04-26 세션 58): 옵션 A** |

---

> 작성: baas-foundation 워크스트림 ADR Sub-agent #1/8
> 다음 ADR (옵션 A 채택 가정): ADR-023 (데이터 격리 모델) → ADR-024~029 병렬 작성 가능
> 본 ADR 채택 후 별도 sub-agent: ADR-001 §3.1에 supersede 헤더 추가 + CLAUDE.md "프로젝트 정보" 섹션 1줄 추가

---

## 변경 이력 (Change Log)

- 2026-04-26 (세션 58, v0.1 PENDING 작성): baas-foundation 워크스트림 ADR Sub-agent #1/8가 옵션 A/B/C/D 비교 매트릭스와 함께 결정 요청 문서로 작성.
- 2026-04-26 (세션 58, v1.0 ACCEPTED): 사용자가 옵션 A 채택. ADR-001 §3.1, §3.2.1~3.2.5, §6.1, §6.3 부분 supersede 발효. 자매 ADR-023~029는 ACCEPTED 가정 위에 진행.
