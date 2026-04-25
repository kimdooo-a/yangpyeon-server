# 14 카테고리 구현 우선순위 확정

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 3 — M3 산출물 2/2  
> 작성: 2026-04-18 (세션 26)  
> 근거: [README.md](../README.md) · [_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md)  
> 상위: [00-vision/](.)

---

## 1. 우선순위 기준

14 카테고리의 구현 순서를 결정하는 4가지 기준.

### 기준 1: 의존성 (Dependency Weight: 40%)

다른 카테고리의 **선행 조건**이 되는 카테고리는 먼저 구현해야 한다. 의존성이 높은 카테고리를 늦게 구현하면 그에 의존하는 카테고리들도 지연된다.

- **의존성 점수 5**: 4개 이상 카테고리의 선행 조건
- **의존성 점수 4**: 3개 카테고리의 선행 조건
- **의존성 점수 3**: 2개 카테고리의 선행 조건
- **의존성 점수 2**: 1개 카테고리의 선행 조건
- **의존성 점수 1**: 독립적 (다른 카테고리 의존 없음)

### 기준 2: 현재 갭 크기 (Gap Size Weight: 30%)

현재 점수와 100점의 차이. 갭이 클수록 먼저 해결할 필요가 있다. 단, 갭이 크더라도 의존성 충족 전에 구현할 수 없는 경우는 의존성 기준이 우선한다.

| 현재 점수 | 갭 크기 | 갭 점수 |
|----------|--------|--------|
| 15점 | 85점 | 5 |
| 40-45점 | 55-60점 | 4 |
| 55-65점 | 35-45점 | 3 |
| 70-75점 | 25-30점 | 2 |
| 80점 이상 | 20점 이하 | 1 |

### 기준 3: Wave 1 채택안 구현 리스크 (Risk Weight: 20%)

Wave 1/2에서 결정된 채택안의 구현 리스크. 리스크가 낮은 카테고리는 초기에 배치해 빠른 점수 확보를 노린다.

- **리스크 5 (매우 낮음)**: 기존 자산 활용, 표준 라이브러리
- **리스크 4 (낮음)**: 검증된 패턴, 스파이크 완료
- **리스크 3 (중간)**: 일부 미검증 영역
- **리스크 2 (높음)**: 복잡한 통합, 1인 운영 부담
- **리스크 1 (매우 높음)**: 신기술, 미검증 아키텍처

### 기준 4: 1인 운영 가능성 (Operability Weight: 10%)

구현 후 운영 부담. 배포 자동화, 모니터링, 장애 대응 난이도.

- **운영성 5**: 완전 자동화 가능, PM2로 충분
- **운영성 4**: 대부분 자동화, 월 1회 이하 수동 개입
- **운영성 3**: 주 1회 이하 모니터링 필요
- **운영성 2**: 일 1회 확인 필요
- **운영성 1**: 상시 모니터링 필요

---

## 2. 카테고리 종속성 그래프

### 2.1 선행 관계 정의

| 카테고리 | 선행 필요 카테고리 | 이유 |
|---------|-----------------|------|
| Auth Advanced | Auth Core | JWT/Session 기반 위에 MFA 계층 |
| Schema Visualizer | Table Editor | RLS 정책 UI가 테이블 에디터 컴포넌트 공유 |
| Edge Functions | Storage | Function 내부에서 Storage 버킷 접근 패턴 |
| Data API (구독) | Realtime | Realtime CDC 채널을 Data API가 활용 |
| Auth Advanced | Observability | JWKS 엔드포인트가 MFA 토큰 검증에 필요 |
| Auth Core | Observability | MASTER_KEY 기반 Vault가 JWT 서명 보호 |
| Operations | 전체 배포 | 카나리 배포 및 롤백이 모든 기능 배포의 안전망 |

### 2.2 의존성 다이어그램

```
Level 0 (기반 인프라 — 모든 것의 전제)
┌─────────────────────────────────────────────────┐
│  Observability (Vault/JWKS)  │  Operations (배포) │
│  현재: 65점 → 목표: 95점       │  현재: 80점 → 95점  │
└─────────────────────────────────────────────────┘
              │                        │
              ▼                        ▼
Level 1 (보안 핵심 — 기반 위에 구축)
┌─────────────────────────────────────────────────┐
│         Auth Core (JWT/Session/RLS)              │
│         현재: 70점 → 목표: 95점                   │
└─────────────────────────────────────────────────┘
              │
              ▼
Level 2 (보안 고급 — Auth Core 의존)
┌─────────────────────────────────────────────────┐
│    Auth Advanced (TOTP / WebAuthn / Rate Limit)  │
│    현재: 15점 → 목표: 100점 (최대 갭)             │
└─────────────────────────────────────────────────┘

Level 3 (데이터 계층 — 독립적이나 Auth 선행 권장)
┌────────────────────────────────────────────────────────────┐
│  Table Editor (CRUD UI)  │  Storage (SeaweedFS)            │
│  현재: 75점 → 95점        │  현재: 40점 → 95점              │
└────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
Level 4 (고급 기능 — Level 3 의존)
┌────────────────────────────────────────────────────────────┐
│  Schema Visualizer      │  Edge Functions (3층 하이브리드)  │
│  현재: 65점 → 95점       │  현재: 45점 → 95점               │
└────────────────────────────────────────────────────────────┘

Level 5 (통합 계층 — 여러 카테고리 의존)
┌────────────────────────────────────────────────────────────┐
│  SQL Editor  │  Realtime (CDC)  │  DB Ops  │  Advisors    │
│  70점 → 100  │  55점 → 100      │  60점→95 │  65점→95      │
└────────────────────────────────────────────────────────────┘
         │              │
         ▼              ▼
Level 6 (최종 통합)
┌────────────────────────────────────────────────────────────┐
│  Data API (REST+GraphQL+pgmq)  │  UX Quality (AI SDK v6)  │
│  현재: 45점 → 90점              │  현재: 75점 → 95점         │
└────────────────────────────────────────────────────────────┘
```

### 2.3 역방향 의존성 (무엇이 무엇에 의존하는가)

```
Observability → Auth Core → Auth Advanced
             └→ Edge Functions
             └→ Realtime

Operations → 모든 카테고리 (배포 안전망)

Auth Core → Auth Advanced
         └→ Table Editor (인증 컨텍스트)
         └→ SQL Editor (인증 컨텍스트)

Storage → Edge Functions

Table Editor → Schema Visualizer
Realtime → Data API (구독 통합)
SQL Editor → Data API (쿼리 빌더 공유)
```

---

## 3. 카테고리별 우선순위 점수 매트릭스

| # | 카테고리 | 현재 | 갭 | 의존성(40%) | 갭점수(30%) | 리스크(20%) | 운영성(10%) | 종합점수 | 구현순서 |
|---|---------|------|-----|-----------|-----------|-----------|-----------|---------|--------|
| 12 | Observability | 65 | 35 | 5×0.4=2.0 | 3×0.3=0.9 | 4×0.2=0.8 | 5×0.1=0.5 | **4.2** | **1위** |
| 14 | Operations | 80 | 20 | 5×0.4=2.0 | 1×0.3=0.3 | 5×0.2=1.0 | 5×0.1=0.5 | **3.8** | **2위** |
| 5 | Auth Core | 70 | 30 | 4×0.4=1.6 | 2×0.3=0.6 | 4×0.2=0.8 | 4×0.1=0.4 | **3.4** | **3위** |
| 7 | Storage | 40 | 60 | 2×0.4=0.8 | 4×0.3=1.2 | 3×0.2=0.6 | 4×0.1=0.4 | **3.0** | **4위** |
| 6 | Auth Advanced | 15 | 85 | 1×0.4=0.4 | 5×0.3=1.5 | 4×0.2=0.8 | 4×0.1=0.4 | **3.1** | **5위** |
| 4 | DB Ops | 60 | 40 | 2×0.4=0.8 | 3×0.3=0.9 | 4×0.2=0.8 | 4×0.1=0.4 | **2.9** | **6위** |
| 2 | SQL Editor | 70 | 30 | 2×0.4=0.8 | 2×0.3=0.6 | 4×0.2=0.8 | 4×0.1=0.4 | **2.6** | **7위** |
| 1 | Table Editor | 75 | 25 | 2×0.4=0.8 | 2×0.3=0.6 | 5×0.2=1.0 | 5×0.1=0.5 | **2.9** | **6위 (동점)** |
| 3 | Schema Viz | 65 | 35 | 1×0.4=0.4 | 3×0.3=0.9 | 4×0.2=0.8 | 4×0.1=0.4 | **2.5** | **8위** |
| 10 | Advisors | 65 | 35 | 1×0.4=0.4 | 3×0.3=0.9 | 3×0.2=0.6 | 4×0.1=0.4 | **2.3** | **9위** |
| 8 | Edge Functions | 45 | 55 | 1×0.4=0.4 | 4×0.3=1.2 | 2×0.2=0.4 | 3×0.1=0.3 | **2.3** | **9위 (동점)** |
| 9 | Realtime | 55 | 45 | 2×0.4=0.8 | 3×0.3=0.9 | 2×0.2=0.4 | 3×0.1=0.3 | **2.4** | **8위 (동점)** |
| 11 | Data API | 45 | 55 | 1×0.4=0.4 | 4×0.3=1.2 | 3×0.2=0.6 | 4×0.1=0.4 | **2.6** | **7위 (동점)** |
| 13 | UX Quality | 75 | 25 | 1×0.4=0.4 | 2×0.3=0.6 | 4×0.2=0.8 | 5×0.1=0.5 | **2.3** | **9위 (동점)** |

> 동점 해결: 갭 크기 우선 → 리스크 낮은 것 우선

---

## 4. Phase 매핑 Preview (Wave 5에서 확정)

Wave 5에서 정밀 로드맵 확정 전, 현재 시점의 Phase 매핑 preview를 제시한다.

### 4.1 Phase 매핑 테이블

| Phase | 기간 | 주요 카테고리 | 시작점 | 목표점 | 예상 공수 |
|-------|------|------------|--------|--------|---------|
| 현재 상태 | — | 14개 전체 | (아래 참조) | — | — |
| **Phase 15** | 4주 | Auth Advanced (TOTP, WebAuthn, Rate Limit) | 15 | 60 | ~22h |
| **Phase 16** | 6주 | Observability 강화 + Operations 보강 | 65/80 | 85/95 | ~40h |
| **Phase 17** | 8주 | Auth Core 완성 + Storage (SeaweedFS) | 70/40 | 90/90 | ~60h |
| **Phase 18** | 8주 | SQL Editor 고도화 + Table Editor 완성 | 70/75 | 95/95 | ~80h |
| **Phase 19** | 6주 | Edge Functions (3층) + Realtime (CDC) | 45/55 | 92/100 | ~70h |
| **Phase 20** | 6주 | Schema Viz + DB Ops + Advisors | 65/60/65 | 95/95/95 | ~60h |
| **Phase 21** | 4주 | Data API 완성 + UX Quality | 45/75 | 85/95 | ~40h |
| **Phase 22** | — | 100점 완성 (보너스 기능, 잔여 갭 처리) | 전체 | 100 | ~30h |

**총 예상 공수**: Wave 1 추정 270h + SQL 320h + Phase 15~22 신규 ~402h = **약 992h**

> Phase 15~22의 정밀 공수는 Wave 4 카테고리별 청사진 완성 후 Wave 5에서 확정.

### 4.2 현재 상태 스냅샷 (Wave 2 최종)

| # | 카테고리 | 현재 점수 | Phase 15 이후 목표 |
|---|---------|---------|-----------------|
| 1 | Table Editor | 75 | 100 (Phase 18) |
| 2 | SQL Editor | 70 | 100 (Phase 18) |
| 3 | Schema Visualizer | 65 | 95 (Phase 20) |
| 4 | DB Ops | 60 | 95 (Phase 20) |
| 5 | Auth Core | 70 | 90 (Phase 17) |
| 6 | Auth Advanced | 15 | 60→100 (Phase 15→22) |
| 7 | Storage | 40 | 90 (Phase 17) |
| 8 | Edge Functions | 45 | 92 (Phase 19) |
| 9 | Realtime | 55 | 100 (Phase 19) |
| 10 | Advisors | 65 | 95 (Phase 20) |
| 11 | Data API | 45 | 85 (Phase 21) |
| 12 | Observability | 65 | 85 (Phase 16) |
| 13 | UX Quality | 75 | 95 (Phase 21) |
| 14 | Operations | 80 | 95 (Phase 16) |

---

## 5. 우선순위 정당화

각 Phase의 순서를 결정한 이유를 상세히 설명한다.

### 5.1 왜 Auth Advanced가 Phase 15 (1순위)인가?

**현황**: 현재 점수 15점 — 14개 카테고리 중 압도적 최하위. 갭 85점.

**정당화**:

1. **보안 기반 — 다른 기능의 신뢰성 전제**
   - MFA(TOTP/WebAuthn) 없는 관리 대시보드는 보안 취약. Auth Advanced는 전체 시스템의 신뢰성을 결정
   - Rate Limit 없이는 Brute-force 공격에 노출
   - 이 보안 기반이 없으면 Storage, Edge Functions 등 민감 기능을 "안전하게" 구현했다고 볼 수 없음

2. **Wave 1/2 스파이크 검증 완료**
   - TOTP(otplib), WebAuthn(SimpleWebAuthn), Rate Limit(DB 기반) 모두 "조건부 GO" 결론
   - 구현 리스크 낮음 — 검증된 라이브러리 활용

3. **빠른 ROI**
   - 15→60점 = 45점 향상, 22h 공수
   - 시간당 갭 해소율: 2.05점/h (가장 높음)

4. **Auth Core 의존 아님**
   - Auth Advanced는 Auth Core 위에 구축되지만, 현재 Auth Core(70점)는 기본 기능 작동 중
   - Phase 15에서 Auth Advanced의 MFA 계층만 추가 → Phase 17에서 Auth Core 완성

5. **Wave 2 확인**: Auth Advanced 4.59/5 점수 — 14개 카테고리 중 채택안 신뢰도 최고

### 5.2 왜 Observability/Operations가 Phase 16 (2순위)인가?

**현황**: Observability 65점, Operations 80점.

**정당화**:

1. **JWKS 기반 시스템이 없으면 Auth의 완전한 기능 불가**
   - Auth Advanced Phase 15 완료 후, JWKS 엔드포인트가 MFA 토큰 검증에 필요
   - `jose JWKS ES256` 미구현 상태에서는 일부 토큰 검증 경로가 불완전

2. **node:crypto Vault 없이는 시크릿 관리 불안전**
   - MASTER_KEY 기반 AES-256-GCM envelope 구현 전까지는 시크릿이 평문에 가까운 상태
   - Phase 17 이후 Storage/Auth Core 시크릿이 증가하므로 그 전에 완성 필요

3. **Operations Capistrano-style 롤백은 모든 기능 배포의 안전망**
   - Phase 17 이후부터 대규모 기능(Storage, Auth Core)이 배포됨
   - 배포 안전망 없이 대규모 기능 배포 = 고위험
   - Capistrano 5초 롤백 구현으로 Phase 17+ 배포 안전 확보

4. **공수 효율**: Observability + Operations 합산 40h, 두 카테고리 동시 진행 가능

### 5.3 왜 Auth Core + Storage가 Phase 17 (3순위)인가?

**현황**: Auth Core 70점, Storage 40점.

**정당화**:

1. **Auth Core는 Auth Advanced(Phase 15)의 완전한 기반**
   - Phase 15에서 MFA 계층 추가 → Phase 17에서 Auth Core 자체 완성 (Session 관리, 패스워드 해시, Anonymous role 등)
   - 이 순서 역전 불가: MFA는 기본 Auth 위에 쌓이는 것

2. **Storage(SeaweedFS)는 갭이 60점으로 매우 큼**
   - 40→90점 = 50점 향상
   - SeaweedFS 단일 채택으로 90~95점 도달 가능 (단순 높은 ROI)
   - Wave 1 스파이크 "조건부 GO" 완료

3. **Storage 이후 Edge Functions 가능**
   - Phase 19 Edge Functions 구현에서 Storage 접근 패턴 필요
   - Storage 미완성 상태에서 Edge Functions 구현 = 불완전한 통합

4. **병렬 실행 가능**: Auth Core와 Storage는 상호 의존 없음 → Wave 4에서 병렬 구현

### 5.4 왜 SQL Editor + Table Editor가 Phase 18 (4순위)인가?

**현황**: SQL Editor 70점, Table Editor 75점.

**정당화**:

1. **이미 높은 점수 — 증분 개선이 목표**
   - 70/75점 → 95점 = 20-25점 향상 (갭이 작음)
   - 강력한 의존성 없어 시스템 안정 후 여유 있게 진행 가능

2. **Wave 1/2 채택안 신뢰도 높음**
   - SQL Editor: supabase-studio 패턴 4.70/5 (전체 최고점)
   - Table Editor: TanStack v8 + 14c-α 4.54/5
   - 두 카테고리 모두 "알려진 경로" — 구현 리스크 낮음

3. **공수 최대 (SQL Editor 40일 ≈ 320h)**
   - 전체 14 카테고리 중 SQL Editor가 공수 최대
   - 다른 카테고리들이 안정된 후, 충분한 시간을 확보해 구현

4. **Schema Visualizer 선행 요건 충족**
   - Phase 18에서 Table Editor 완성 → Phase 20에서 Schema Visualizer 구현 시 RLS UI 컴포넌트 공유 가능

### 5.5 왜 Edge Functions + Realtime이 Phase 19 (5순위)인가?

**현황**: Edge Functions 45점, Realtime 55점.

**정당화**:

1. **복잡도 높음 — 기초 시스템 안정 후 구축 권장**
   - Edge Functions 3층 하이브리드(isolated-vm v6 + Deno 사이드카 + Sandbox 위임)는 전체 14 카테고리 중 가장 복잡한 아키텍처
   - Realtime(wal2json + supabase-realtime 포팅 하이브리드)은 PostgreSQL WAL 접근 + 채널 관리 동시 필요

2. **Storage 의존성 (Edge Functions)**
   - Phase 17 Storage 완성 후 Edge Functions에서 버킷 접근 패턴 구현 가능

3. **Realtime은 Data API 통합의 전제 (Phase 21)**
   - Realtime CDC 채널이 Data API 구독 기능에 사용됨
   - Phase 19 Realtime 완성 → Phase 21 Data API에서 통합

4. **두 카테고리 동시 진행 가능**
   - Edge Functions와 Realtime은 직접 의존 없음
   - 독립적 팀으로 병렬 진행 (Wave 4 청사진에서 상세 계획)

### 5.6 왜 Schema Viz + DB Ops + Advisors가 Phase 20인가?

**현황**: Schema Viz 65점, DB Ops 60점, Advisors 65점.

**정당화**:

1. **Schema Visualizer는 Table Editor(Phase 18) 완성 후 구현**
   - RLS 정책 UI가 Table Editor 컴포넌트 공유
   - Phase 18 완성 없이는 Schema Viz 통합이 불완전

2. **DB Ops는 기초 시스템 안정 후 심화**
   - node-cron Webhook + wal-g Backup은 이미 기본 구현 존재
   - Phase 20에서 RPO 60s, RTO 30m 목표 달성을 위한 심화 구현

3. **Advisors는 SQL Editor/Table Editor 연동 의존**
   - splinter 38룰 + squawk DDL 검사는 SQL Editor 쿼리 컨텍스트 활용
   - Phase 18 SQL Editor 완성 후 통합 구현이 자연스러움

4. **세 카테고리 독립적 — 병렬 진행 최적**
   - Schema Viz, DB Ops, Advisors는 상호 의존 없음
   - Wave 4에서 3개 서브 청사진을 병렬로 작성하고 Phase 20에서 동시 구현

### 5.7 왜 Data API + UX Quality가 Phase 21 (최후)인가?

**현황**: Data API 45점, UX Quality 75점.

**정당화**:

1. **Data API는 Realtime(Phase 19) + SQL Editor(Phase 18) 의존**
   - pgmq + REST 강화 = 즉시 구현 가능 (Phase 17~18 중 일부 가능)
   - GraphQL(pg_graphql) = 4개 수요 트리거 중 2개+ 충족 시 도입 → 최후에 배치

2. **UX Quality(AI SDK v6)는 기능 완성 후 DX 개선**
   - AI Assistant, MCP `mcp-luckystyle4u` 등은 전체 기능 안정 후 UX 향상 레이어
   - 기능 불완전한 상태에서 AI Assistant 추가 = 불안정한 UX

3. **UX Quality의 운영 비용 관리**
   - AI SDK v6 + Anthropic BYOK ~$5/월
   - 전체 시스템 안정화 후 비용 효율 극대화 시점에 도입

---

## 6. 리스크 평가 매트릭스

| 카테고리 | 구현 리스크 | 리스크 원인 | 완화 전략 |
|---------|-----------|-----------|---------|
| **Edge Functions** | 🔴 고 | 3층 하이브리드 미검증 통합, isolated-vm v6 API 변경 가능 | Phase 19 전 스파이크-005-edge-functions 심화, 단계적 롤아웃 (layer 1 먼저) |
| **Realtime** | 🟠 중상 | wal2json PostgreSQL 버전 의존, supabase-realtime 포팅 복잡도 | Phase 19 전 50GB+ WAL 부하 테스트, 백프레셔 구현 우선 |
| **Storage (SeaweedFS)** | 🟠 중 | 50GB+ 운영 미검증, 메모리 사용량 불확실 | Phase 17 전 스파이크-007 50GB 부하 테스트, B2 오프로드 전략 |
| **Auth Advanced** | 🟡 낮음 | WebAuthn 브라우저 호환성 (Safari), TOTP 시드 보안 | SimpleWebAuthn 라이브러리 (검증됨), TOTP 시드 Vault 저장 |
| **SQL Editor** | 🟡 낮음 | supabase-studio 의존성 업스트림 변경 | Apache-2.0 포크 유지, upstream 변경 모니터링 |
| **Observability** | 🟡 낮음 | node:crypto AES-256-GCM → KEK 회전 복잡도 | DQ-12.3 확정 경로 (MASTER_KEY=/etc/luckystyle4u/secrets.env) |
| **Data API** | 🟡 낮음 | pg_graphql 수요 트리거 미충족 시 GraphQL 배제 | REST+pgmq 선 구현, GraphQL 조건부 도입 |
| **Realtime (백프레셔)** | 🟠 중 | 고속 CDC 이벤트 클라이언트 과부하 | 큐 기반 버퍼링, 클라이언트별 메시지 제한 |
| **Auth Core** | 🟢 매우 낮음 | jose JWT 기존 자산 + Lucia/Auth.js 패턴 15개 확정 | 기존 jose 코드 재활용, 패턴 차용만 |
| **Table Editor** | 🟢 매우 낮음 | TanStack v8 안정적, 14c-α 이미 일부 구현 | 기존 14c-α 자산 연속 개발 |
| **Schema Visualizer** | 🟡 낮음 | @xyflow + elkjs 레이아웃 성능 (대형 스키마) | 100+ 테이블 lazy loading, 뷰포트 기반 렌더링 |
| **DB Ops** | 🟡 낮음 | wal-g 복구 절차 실수 위험 | 복구 드릴 정기화, restore audit 자동화 |
| **Advisors** | 🟡 낮음 | splinter 38룰 Node TS 포팅 완성도 | squawk/schemalint 우선 도입, splinter 점진 포팅 |
| **Operations** | 🟢 매우 낮음 | PM2 cluster:4 이미 운영 중, Capistrano 패턴 명확 | symlink 롤백 테스트 자동화 |
| **UX Quality** | 🟢 매우 낮음 | AI SDK v6 안정적, MCP 표준화됨 | Anthropic BYOK 비용 모니터링 ($5/월 상한) |

### 6.1 리스크 히트맵

```
발생 가능성 높음
        │  Realtime     Edge Functions
        │  (복잡 통합)   (3층 아키텍처)
 높음   │
        │  Storage      Schema Viz
 영향도 │  (부하 테스트) (대형 스키마)
        │
 낮음   │  Auth Adv     DB Ops
        │  (라이브러리)  (복구 드릴)
        │
        └──────────────────────────────
           낮음    중간    높음
                발생 가능성
```

### 6.2 TOP 3 리스크 상세 완화 계획

**리스크 1: Edge Functions 3층 통합 실패**

```
현상: isolated-vm v6 + Deno 사이드카 + Sandbox 위임의 라우팅 로직 버그
결과: Edge Functions 전체 비작동
완화:
  1. Phase 19 전 스파이크-005 심화 (Layer 1만 먼저 검증)
  2. decideRuntime() 함수 단위 테스트 100% 커버리지
  3. Layer 1 (isolated-vm) 단독 배포 → 안정화 후 Layer 2 (Deno) 추가
  4. 장애 시 폴백: isolated-vm 단독 운영 (Layer 1 only mode)
```

**리스크 2: Realtime wal2json PostgreSQL 버전 의존**

```
현상: PostgreSQL 업그레이드 시 wal2json 확장 비호환
결과: CDC 이벤트 중단, Realtime 전체 비작동
완화:
  1. wal2json 버전 매트릭스 테스트 (PG 14/15/16)
  2. pg_logical 대안 경로 사전 문서화
  3. PostgreSQL 업그레이드 전 wal2json 호환 확인 체크리스트
  4. Realtime 비작동 시 폴링 폴백 (5초 간격 REST API 폴링)
```

**리스크 3: Storage SeaweedFS 대용량 운영 미검증**

```
현상: 50GB+ 데이터 시 SeaweedFS 메모리 부족 또는 GC 지연
결과: 파일 업로드/다운로드 지연, OOM 가능
완화:
  1. Phase 17 전 50GB 부하 테스트 스파이크 (spikes/spike-007-seaweedfs-50gb.md)
  2. B2 오프로드 자동화 (스토리지 티어링: Hot→B2 Cold)
  3. SeaweedFS 메모리 한계 명시 (docs에 "권장 최대 50GB")
  4. 초과 시 경보: `df -h` + PM2 메트릭 모니터링
```

---

## 7. MVP 범위 정의

### 7.1 3단계 릴리스 계획

```
MVP (Minimum Viable Product)
= Phase 15 + Phase 16 + Phase 17 완료
= Auth Advanced + Observability/Operations + Auth Core + Storage

완료 기준:
✅ MFA (TOTP + WebAuthn) 작동
✅ JWKS + Vault 기반 시크릿 관리
✅ Capistrano-style 롤백 (5초 다운타임)
✅ Auth Core 90점 달성
✅ SeaweedFS 기반 파일 관리 90점

예상 시점: Phase 17 완료 기준 (약 4+6+8 = 18주)
시스템 신뢰도: "운영 가능한 보안 기반"

────────────────────────────────────────────

Beta (베타 버전)
= MVP + Phase 18 + Phase 19 완료
= SQL/Table Editor + Edge Functions + Realtime

완료 기준:
✅ SQL Editor 95점 (Monaco + 실행 + AI 보조)
✅ Table Editor 95점 (TanStack 14c-β/14d 완성)
✅ Edge Functions 92점 (3층 하이브리드 안정)
✅ Realtime 100점 (CDC + 채널 + 구독)

예상 시점: Phase 19 완료 기준 (MVP + 8+6 = +14주)
시스템 신뢰도: "Supabase 핵심 기능 동등"

────────────────────────────────────────────

v1.0 (정식 버전)
= Beta + Phase 20 + Phase 21 + Phase 22 완료
= 전체 14 카테고리 100점

완료 기준:
✅ 14개 카테고리 전부 90점 이상
✅ Schema Viz, DB Ops, Advisors 95점
✅ Data API 85점 (REST + pgmq, GraphQL 조건부)
✅ UX Quality 95점 (AI Assistant + MCP)
✅ 전체 통합 E2E 테스트 통과

예상 시점: Phase 22 완료 기준 (Beta + 6+4+~ = +10주~)
시스템 신뢰도: "Supabase Self-Hosted 100점 동등"
```

### 7.2 MVP 구현 체크리스트

```
Phase 15 (Auth Advanced):
□ otplib TOTP 시드 생성 + QR 코드 UI
□ SimpleWebAuthn 등록 + 인증 플로우
□ DB 기반 Rate Limit (IP + 사용자별)
□ MFA 강제 정책 (Admin 설정)
□ MFA 백업 코드 (8개 일회용)

Phase 16 (Observability + Operations):
□ node:crypto AES-256-GCM envelope 구현
□ MASTER_KEY /etc/luckystyle4u/secrets.env
□ jose JWKS ES256 엔드포인트 (/auth/.well-known/jwks.json)
□ Capistrano symlink 배포 구조
□ 5초 롤백 스크립트 + PM2 cluster:4

Phase 17 (Auth Core + Storage):
□ Session 테이블 + 디바이스 관리
□ 패스워드 정책 (bcrypt + 복잡도 규칙)
□ Anonymous role 구현
□ SeaweedFS 단일 인스턴스 배포
□ 파일 업로드 API (10MB 제한)
□ 버킷 생성/삭제 UI
□ B2 오프로드 설정
```

---

## 8. 14 카테고리 전체 현황 요약

| # | 카테고리 | 현재 | Wave 1 채택안 | 채택안 점수 | MVP 포함 | 최종 목표 | Phase |
|---|---------|------|-------------|-----------|---------|---------|-------|
| 1 | Table Editor | 75 | TanStack v8 + 14c-α 자체구현 | 4.54/5 | ❌ | 100 | 18 |
| 2 | SQL Editor | 70 | supabase-studio 패턴 3중 흡수 | 4.70/5 | ❌ | 100 | 18 |
| 3 | Schema Visualizer | 65 | schemalint + 자체 RLS + Trigger | 4.30/5 | ❌ | 95 | 20 |
| 4 | DB Ops | 60 | node-cron 자체 + wal-g | 4.36/5 | ❌ | 95 | 20 |
| 5 | Auth Core | 70 | jose JWT + Lucia 패턴 차용 | 4.08/5 | ✅ MVP | 90 | 17 |
| 6 | Auth Advanced | 15 | TOTP + WebAuthn + Rate Limit 동시 | 4.59/5 | ✅ MVP | 100 | 15 |
| 7 | Storage | 40 | SeaweedFS 단독 + B2 | 4.25/5 | ✅ MVP | 90 | 17 |
| 8 | Edge Functions | 45 | 3층 하이브리드 | 4.22/5 | ❌ | 92 | 19 |
| 9 | Realtime | 55 | wal2json + supabase-realtime 포팅 | 4.05/5 | ❌ | 100 | 19 |
| 10 | Advisors | 65 | 3-Layer (schemalint+squawk+splinter) | 3.95/5 | ❌ | 95 | 20 |
| 11 | Data API | 45 | REST 강화 + pgmq + pg_graphql 조건부 | 4.29/5 | ❌ | 85 | 21 |
| 12 | Observability | 65 | node:crypto envelope + jose JWKS | 0.87 권고도 | ✅ MVP | 85 | 16 |
| 13 | UX Quality | 75 | AI SDK v6 + Anthropic BYOK + MCP | 0.84 권고도 | ❌ | 95 | 21 |
| 14 | Operations | 80 | Capistrano-style + PM2 cluster:4 | 0.87 권고도 | ✅ MVP | 95 | 16 |

**MVP 카테고리**: Auth Advanced(6), Observability(12), Operations(14), Auth Core(5), Storage(7) — 5개  
**Beta 추가**: Table Editor(1), SQL Editor(2), Edge Functions(8), Realtime(9) — 4개  
**v1.0 추가**: Schema Viz(3), DB Ops(4), Advisors(10), Data API(11), UX Quality(13) — 5개

---

## 9. Wave 4 청사진 예고

Wave 4에서 각 카테고리별 청사진(Blueprint) 문서를 작성할 때, 이 우선순위 문서를 근거로 다음을 결정한다:

| 청사진 문서 | 참조 이유 |
|-----------|---------|
| 02-architecture/ 카테고리별 설계 | Phase 순서에 따라 의존성 인터페이스 먼저 정의 |
| 03-ui-ux/ 컴포넌트 설계 | MVP Phase (15-17) 컴포넌트 먼저 설계 |
| 04-integration/ 통합 설계 | Level 0-1 (Observability, Auth Core) 인터페이스 고정 후 나머지 설계 |

Wave 4에서 각 Phase별 세부 태스크 분해(WBS), 정밀 공수 산정, 의존성 인터페이스 계약이 이루어진다.

Wave 5에서 이 Preview를 기반으로 정밀 Phase 로드맵이 확정된다.

---

> 작성: Wave 3 M3 에이전트  
> 근거 문서: README.md (Wave 1+2 완료, 14 카테고리 채택안 + 현재 점수)  
> 이전 문서: [09-multi-tenancy-decision.md](./09-multi-tenancy-decision.md)  
> 다음: Wave 4 — 카테고리별 아키텍처 청사진 (02-architecture/)
