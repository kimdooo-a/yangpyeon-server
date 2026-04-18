# 01. ADR 누적 로그 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> Wave 4 · Tier 1 (A1) 산출물 — kdywave W4-A1 (Agent Architecture-1)
> 작성일: 2026-04-18 (세션 27/28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [02-data-model-erd.md](./02-data-model-erd.md) · [../00-vision/](../00-vision/)

---

## 0. 문서 목적 및 ADR 표준

### 0.1 이 문서의 역할

Wave 1~3에서 암묵·명시적으로 내려진 모든 의사결정을 **ADR(Architecture Decision Record) 형식으로 누적**한 문서. 양평 대시보드의 Wave 4(본 세션)·Wave 5(로드맵)·그 이후 구현 단계에서 "왜 이렇게 결정했는가"를 거슬러 참조할 단일 출처(single source of truth of decisions)이다.

Michael Nygard의 ADR 원형을 따르되, **Wave 컨텍스트와 재검토 트리거(정량 조건)를 추가**한 확장 포맷을 사용한다.

### 0.2 ADR 포맷 표준

각 ADR은 다음 9개 필드를 반드시 포함:

```markdown
### ADR-NNN: {제목}

- **상태**: Proposed / Accepted / Deprecated / Superseded by ADR-MMM
- **날짜**: YYYY-MM-DD (Wave N, 세션 M)
- **결정자**: 프로젝트 오너 (1인 운영) 또는 에이전트 W{n}-{Xn}
- **컨텍스트**: 결정이 필요했던 배경 (2-4단락)
- **결정**: 무엇을 결정했는가 (1-2단락, 명확한 선언문)
- **고려한 대안**: 대안 목록 + 각각 거부 사유
- **결과**: 긍정적/부정적 영향 + 트레이드오프
- **근거 문서**: Wave 1-3 구체 경로 + 섹션 인용 (§ 단위)
- **재검토 트리거**: 이 결정을 재검토할 정량 조건
```

### 0.3 ADR 상태 정의

- **Proposed**: 초안, 아직 확정 안 됨
- **Accepted**: 확정되어 구현 지침으로 사용
- **Deprecated**: 더 이상 유효하지 않음 (하지만 기록은 유지 — 역사 삭제 금지 원칙)
- **Superseded by ADR-MMM**: 다른 ADR로 대체됨 (하지만 기록 유지)

### 0.4 현재 ADR 상태 요약

| ADR | 제목 | 상태 | Phase |
|-----|------|------|-------|
| ADR-001 | Multi-tenancy 의도적 제외 | Accepted | 전 단계 |
| ADR-002 | Table Editor TanStack v8 자체구현 | Accepted | 18 |
| ADR-003 | SQL Editor supabase-studio 패턴 차용 + 3중 흡수 | Accepted | 18 |
| ADR-004 | Schema Viz schemalint + 자체 RLS UI | Accepted | 20 |
| ADR-005 | DB Ops node-cron + wal-g (pg_cron 거부) | Accepted | 20 |
| ADR-006 | Auth Core jose JWT + Lucia/Auth.js 패턴 15개 차용 | Accepted | 17 |
| ADR-007 | Auth Advanced TOTP+WebAuthn+Rate Limit 동시 채택 | Accepted | 15 |
| ADR-008 | Storage SeaweedFS 단독 + B2 오프로드 (MinIO 배제) | Accepted | 17 |
| ADR-009 | Edge Functions 3층 하이브리드 (isolated-vm + Deno + Sandbox) | Accepted | 19 |
| ADR-010 | Realtime wal2json + supabase-realtime 포팅 하이브리드 (계층 분리) | Accepted | 19 |
| ADR-011 | Advisors 3-Layer (schemalint + squawk + splinter Node 포팅) | Accepted | 20 |
| ADR-012 | Data API REST 강화 + pgmq + pg_graphql 보류 | Accepted | 21 |
| ADR-013 | Observability node:crypto AES-256-GCM envelope + MASTER_KEY 위치 | Accepted | 16 |
| ADR-014 | UX Quality Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP | Accepted | 21 |
| ADR-015 | Operations Capistrano-style + PM2 cluster:4 + canary 서브도메인 | Accepted | 16 |
| ADR-016 | pg_graphql 수요 트리거 4 정량화 | Accepted | 21+ |
| ADR-017 | OAuth Providers Phase 18+ 조건부 도입 | Accepted | 18+ |
| ADR-018 | System Overview 9-레이어 구조 및 의존 규칙 | Accepted | Wave 4 |

---

## 1. ADR 본문

---

### ADR-001: Multi-tenancy 의도적 제외

- **상태**: Accepted
- **날짜**: 2026-04-06 (프로젝트 시작 시) · 최종 검토 2026-04-18 (Wave 3, 세션 26)
- **결정자**: 프로젝트 오너 (1인 운영)

- **컨텍스트**:
Supabase Cloud는 Organization → Project 2계층 Multi-tenancy를 전제한다. 양평 대시보드는 Supabase Cloud를 자체호스팅 환경에서 대체하는 관리 대시보드이므로, Multi-tenancy를 그대로 이식할지 결정해야 한다. 그러나 양평 대시보드는 1인 운영 + 단일 팀 + WSL2 단일 서버 전제이므로 Multi-tenancy 도입 시 아키텍처 복잡도(스키마 테이블 +1 컬럼, RLS 정책 × 테넌트, 마이그레이션 롤아웃 × 테넌트) 대비 이득이 0이다.

- **결정**:
**양평 부엌 서버 대시보드는 Multi-tenancy를 지원하지 않는다.** 단일 워크스페이스 + 단일 DB + 단일 도메인. 테이블에 `tenant_id` 컬럼 추가 금지. RLS는 user-level 분리만 사용. 이는 "현재 지원 불가"가 아닌 **명시적 설계 결정**이다.

- **고려한 대안**:
  - Alt-1 (Row-level tenant_id): 모든 테이블 `tenant_id` + RLS 격리 — **거부**: 구현 복잡도 30-40% 증가, 실수 시 데이터 유출 위험.
  - Alt-2 (Schema per tenant): PostgreSQL 스키마 별도 생성 — **거부**: Prisma 7이 멀티 스키마 마이그레이션 미지원(prisma/prisma#1175).
  - Alt-3 (DB per tenant): 테넌트마다 별도 PostgreSQL 인스턴스 — **거부**: 1인 환경 WSL2에서 다중 PG 관리 과부하, 인스턴스당 메모리 100-500MB 추가.
  - Alt-4 (경량 워크스페이스): 논리적 그룹화만 — **거부**: 실질적 격리 없음, "가짜 격리" 위험, 1인 운영자에게 UX 가치 없음.

- **결과**:
  - **긍정**: 구현 공수 30-40% 절감(~70h, Wave 3 `09-multi-tenancy-decision.md §4.1.3`). 테넌트 크로스 리크 버그 클래스 구조적 제거. 1인 운영 부담 대폭 감소. Prisma 7 호환성 유지.
  - **부정**: Supabase Cloud `/v1/organizations`, `/v1/projects` API 엔드포인트는 고정값 응답(`"default"`, `"yangpyeong"`). 향후 B2B 전환 시 100-120h 재설계 비용 예상. 동일 서버에서 두 독립 조직 운영 불가.

- **근거 문서**: `00-vision/09-multi-tenancy-decision.md` §1~§7 전체 (621줄)

- **재검토 트리거**:
  1. 사용자 2명+ 이상 6개월 지속 (월별 사용자 기록 기준)
  2. "외부 고객에게 SaaS로 제공" 명시적 비즈니스 전환 결정
  3. "독립 팀 관리" 기능이 FR로 신규 추가 (`02-functional-requirements.md` 개정 시)
  4. GDPR/PIPA 법적 데이터 격리 요건 발생

---

### ADR-002: Table Editor — TanStack v8 자체구현 (AG Grid/Glide 거부)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 1, 세션 12; Wave 2 A 재검증, 세션 25)
- **결정자**: Agent W1-A + W2-A

- **컨텍스트**:
Supabase Studio의 Table Editor는 월간 대량 CRUD UI를 제공한다. 양평에서 동등 기능을 구현하려면 테이블 컴포넌트 라이브러리 선택이 선결 과제다. 상용 AG Grid($999+/개발자), Glide Data Grid(GPL), 그리고 TanStack Table v8(MIT, 헤드리스) 3개가 후보.

- **결정**:
**TanStack Table v8 (헤드리스) 기반 자체구현**. 14c-α 단계는 이미 기초 구현된 자산 위에 14c-β(RLS UI), 14d(외래키 그래프), 14e(Realtime 연동) 3단계로 100점까지 도달.

- **고려한 대안**:
  - AG Grid: 상용 라이선스 $999/개발자 — **거부**: CON-7 라이선스(오픈소스만) + CON-9 비용 상한 위반.
  - Glide Data Grid: GPL 라이선스 — **거부**: CON-7 GPL 거부 원칙.
  - Supabase Studio Table Editor 임베드: Apache-2.0이지만 Supabase 내부 상태 관리(meta, gotrue-js)에 강하게 결합 — **거부**: 마이그레이션 비용 > 이점.

- **결과**:
  - **긍정**: MIT 라이선스, 헤드리스이므로 shadcn/ui 디자인 토큰 완전 통합 가능, TypeScript 네이티브, 1MB 이하 번들. Wave 1 점수 4.6/5, Wave 2 A 매트릭스 4.54/5.
  - **부정**: UI 구현 공수 약 60h(14c-α→β→d→e 전체). Column virtualization은 자체 구현 필요.

- **근거 문서**: `01-research/01-table-editor/01-deep-tanstack.md` (957줄), `01-research/01-table-editor/02-deep-aggrid.md` (829줄), `01-research/01-table-editor/03-deep-glide.md` (827줄), Wave 2 A 매트릭스 568줄

- **재검토 트리거**:
  1. 테이블 row 수 100만 초과 + p95 > 1.2s (현재 목표 800ms, 여유 50%)
  2. TanStack Table v9 major release로 v8 ABI 깨짐
  3. 데이터 그리드 전용 저명 OSS 라이브러리 등장 (MIT/Apache-2.0)

---

### ADR-003: SQL Editor — supabase-studio 패턴 차용 + Outerbase/sqlpad 3중 흡수

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 A 재검증, 세션 25)
- **결정자**: Agent W1-F + W2-A

- **컨텍스트**:
SQL Editor는 14 카테고리 중 공수 최대(40일 ≈ 320h)이며 Supabase Cloud 핵심 기능이다. Monaco 에디터를 기반으로 자동완성, 실행 히스토리, AI 보조, Plan Visualizer까지 100점 청사진을 완성해야 한다. supabase-studio(Apache-2.0), Outerbase(자체 서비스), sqlpad(MIT, 2024 아카이브 예정) 3개 참조 후보.

- **결정**:
**supabase-studio Apache-2.0 패턴 직접 포팅 + Outerbase 공개 문서 참조 + sqlpad 히스토리 UX 회귀 흡수** 3중 전략. 라이브러리 임베드 금지, **패턴만 흡수**하여 Next.js 16 App Router 네이티브로 재구현.

- **고려한 대안**:
  - supabase-studio 전체 임베드: Apache-2.0이지만 내부 상태 관리가 Supabase 인프라에 결합 — **거부**.
  - sqlpad 포크: MIT이지만 2024 아카이브 예정 — **거부**, 패턴만 흡수.
  - Outerbase 서비스 직접 임베드: 자체 호스팅 불가 — **거부**.
  - Jupyter-style 노트북 UX: 복잡도 과다 — **거부**.

- **결과**:
  - **긍정**: Wave 2 A 매트릭스 4.70/5 (전체 1위). Apache-2.0 라이선스 헤더 보존하여 법적 안전. 패턴 15+개(탭 관리, 위험 쿼리 확인, EXPLAIN Visualizer, AI Assist) 흡수.
  - **부정**: 40일 공수. supabase-studio upstream 변경 모니터링 필요.

- **근거 문서**: `01-research/02-sql-editor/01-deep-supabase-studio.md`, `01-research/02-sql-editor/02-deep-outerbase.md`, `01-research/02-sql-editor/03-deep-sqlpad.md`, Wave 2 A 1:1 비교 1,015줄

- **재검토 트리거**:
  1. supabase-studio 라이선스 변경 (Apache-2.0 → AGPL/BSL 전환 시)
  2. Monaco Editor v0.50+에서 API breaking change
  3. Next.js 16 App Router의 Server Component 내 Monaco 인스턴스화 호환성 손실

---

### ADR-004: Schema Viz — schemalint 커스텀 룰 + 자체 RLS UI (Prisma Studio/drizzle-kit Studio 임베드 거부)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 B 재검증)
- **결정자**: Agent W1-G + W2-B

- **컨텍스트**:
Schema Visualizer는 ERD + 정책/함수/트리거 관리 + 스키마 컨벤션 검사를 통합한다. Supabase Studio의 스키마 뷰, Prisma Studio, drizzle-kit Studio 모두 후보. Schema Visualizer의 점수 4.30/5, 하이브리드 필수형.

- **결정**:
**schemalint 규칙 엔진(TS 포팅) + @xyflow/react + elkjs 자동 레이아웃 + 자체 RLS Monaco 편집 UI** 조합. Prisma Studio와 drizzle-kit Studio는 **임베드 거부**, UX 패턴만 흡수. `/database/policies`, `/database/functions`, `/database/triggers` 3개 페이지 신설.

- **고려한 대안**:
  - Prisma Studio 임베드: 가능하지만 편집 UX가 양평 컨벤션과 불일치, 다크 테마 호환 부족 — **거부**.
  - drizzle-kit Studio: 커뮤니티 주도, 안정성 낮음 — **거부**.
  - Chart.js 기반 ERD: 관계 엣지 렌더링 성능 제약 — **거부**.
  - d3.js 자체 그래프: elkjs 레이아웃 계산 대비 구현 공수 과다 — **거부**.

- **결과**:
  - **긍정**: Wave 2 B 매트릭스 4.30/5. 기존 자산(xyflow, elkjs) 재활용. 50h로 완성 예상.
  - **부정**: 대형 스키마(100 테이블+)에서 elkjs 레이아웃 연산 >1.5s 가능. 대응: 뷰포트 기반 lazy loading.

- **근거 문서**: `01-research/03-schema-visualizer/01-deep-schemalint.md`, `01-research/03-schema-visualizer/02-deep-prisma-studio.md`, Wave 2 B 매트릭스 577줄

- **재검토 트리거**:
  1. 스키마 테이블 200개 초과 + 레이아웃 p95 > 3s
  2. schemalint TS 포팅에서 룰 엔진 breaking change
  3. Prisma Studio가 임베드 가능한 공식 헤드리스 모드 제공 시

---

### ADR-005: DB Ops — node-cron 자체 + wal-g 백업 (pg_cron 거부)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 B 재검증)
- **결정자**: Agent W1-G + W2-B

- **컨텍스트**:
주기 작업 스케줄링과 PITR 백업은 Supabase DB Ops의 핵심. PostgreSQL 확장 pg_cron, Node.js node-cron, wal-g(백업), pgBackRest(백업) 4개 후보. RPO 60s, RTO 30m 목표.

- **결정**:
**주기 작업 = node-cron (Node.js TypeScript 네이티브)**, **백업 = wal-g + Backblaze B2**. pg_cron 거부, pgBackRest 거부.

- **고려한 대안**:
  - pg_cron: PostgreSQL 확장 — **거부**. 1인 환경에서 PG 확장 의존성 증가는 CON-4 원칙(단순성) 위반. Node 핸들러 80% 차지하므로 pg_cron은 큐 역할만 수행하게 됨. Wave 1 패턴 3.
  - pgBackRest: 단일 노드 과잉, wal-g보다 설정 복잡 — **거부**.
  - Supabase 관리형 백업 방식 모방: Supabase 내부가 비공개 — **참조만**.

- **결과**:
  - **긍정**: Wave 2 B 매트릭스 4.36/5. node-cron은 Next.js 16 + PM2 단일 프로세스(fork 모드)에서 중복 방지 쉽고, TypeScript strict 타입 지원. wal-g는 Backblaze B2(S3 호환)에 직접 업로드, 비용 월 $0.3 미만.
  - **부정**: PM2 cluster 모드 아닌 fork 모드 필수(cron 중복 방지). 워커는 `cron-worker` 별도 PM2 앱으로 분리.

- **근거 문서**: `01-research/04-db-ops/01-deep-node-cron.md`, `01-research/04-db-ops/02-deep-wal-g.md`, Wave 2 B 1:1 비교 716줄

- **재검토 트리거**:
  1. Cron 작업 수 > 50개 + 정확도 문제 발생
  2. wal-g major version 호환성 break
  3. Backblaze B2 가격 인상 > $1/월
  4. PostgreSQL 17+에서 pg_cron이 기본 탑재 되는 경우

---

### ADR-006: Auth Core — jose JWT + Lucia/Auth.js 패턴 15개 차용 (라이브러리 거부)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 C 재검증)
- **결정자**: Agent W1-H + W2-C

- **컨텍스트**:
Auth Core는 JWT, 세션 관리, 패스워드 해시, RBAC를 포함. Lucia(경량, TS-first), Auth.js(이전 NextAuth, Next.js 친화), 자체 jose JWT 3개 경로. 양평은 이미 jose + bcrypt + Prisma `User` 자산이 있음.

- **결정**:
**jose JWT ES256을 기반으로 유지 + Lucia/Auth.js 패턴 15개 차용** (세션 테이블 SHA-256 해시 저장, Refresh Token 회전 시 Reuse Detection, CSRF double-submit, 세션 `revokedAt`, 디바이스 관리 등). **라이브러리는 채용하지 않는다**.

- **고려한 대안**:
  - Lucia 채용: 경량이지만 기존 jose + Prisma 자산 마이그레이션 30-40h — **거부**, 패턴만 차용.
  - Auth.js 채용: Next.js 생태계 성숙하지만 Auth.js v5(NextAuth.js) OAuth Provider 모듈 무거움, Session adapter 계층 추가 — **거부**, 패턴만 차용.
  - Supabase GoTrue 포팅: Go 기반 포팅 공수 과다 — **거부**.

- **결과**:
  - **긍정**: Wave 2 C 매트릭스 4.08/5 (3.48→4.08 패턴 차용 15개 구체화로 상승). 기존 자산 보존. 1인 운영자가 "Auth가 어떻게 동작하는지" 전부 이해 가능(블랙박스 없음).
  - **부정**: OAuth Providers는 Phase 18에서 직접 구현 필요(Google/GitHub). 15h 추가.

- **근거 문서**: `01-research/05-auth-core/01-deep-lucia.md`, `01-research/05-auth-core/02-deep-authjs.md`, Wave 2 C 1:1 비교 784줄

- **재검토 트리거**:
  1. Node 24 LTS에서 jose breaking change
  2. OAuth Provider 수 > 5개로 증가 (Apple, Microsoft, Naver, Kakao 등 추가 시) — Auth.js 재고 가능
  3. WebAuthn/Passkey 단독 인증만 지원 (비밀번호 폐기) 전환 시

---

### ADR-007: Auth Advanced — TOTP + WebAuthn + Rate Limit 동시 채택

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 1, 세션 12; Wave 2 C 재검증)
- **결정자**: Agent W1-D + W2-C

- **컨텍스트**:
현재 Auth Advanced 점수 15점(14 카테고리 중 최저). MFA가 전무한 상태. TOTP(otplib), WebAuthn(@simplewebauthn), Rate Limit(DB 기반 또는 Redis) 3개 선택지. Phase 15에서 먼저 도입 결정(`10-14-categories-priority.md §5.1`).

- **결정**:
**TOTP + WebAuthn + Rate Limit 3종 전부 동시 채택**. 하나만 선택하지 않음. TOTP는 otplib, WebAuthn은 @simplewebauthn/server + /browser, Rate Limit은 PostgreSQL `rate_limit_events` 테이블(Redis 미도입).

- **고려한 대안**:
  - TOTP만: 저사양 공격자에 효과, 피싱 취약 — **거부**, 완전한 보안 안 됨.
  - WebAuthn만: 피싱 저항적이지만 Safari iOS 16 이전 미지원 — **거부**, 단일 수단은 위험.
  - Redis Rate Limit: Upstash Redis $0/월 무료 플랜 가능하지만 네트워크 RTT, 추가 장애 지점 — **거부**, PG counter 테이블로 충분(NFR-SEC.4).
  - Cloudflare Turnstile만: CAPTCHA는 보조, MFA 대체 불가 — **거부**.

- **결과**:
  - **긍정**: Wave 2 C 매트릭스 4.59/5 (전체 중 Wave 2에서 최고점). 15→60점은 22h(Phase 15~17 1순위). WebAuthn이 대부분 브라우저 지원 + TOTP 백업 경로 확보.
  - **부정**: MFA 3종 UI 공수 증가(백업 코드, 디바이스 관리 포함). 테스트 복잡도 증가.

- **근거 문서**: `01-research/06-auth-advanced/01-deep-webauthn.md`, `01-research/06-auth-advanced/02-deep-totp.md`, `01-research/06-auth-advanced/03-deep-rate-limit.md`, Wave 2 C 매트릭스 624줄

- **재검토 트리거**:
  1. Safari iOS 26+가 WebAuthn 안정화 시 TOTP 의무화 해제 검토
  2. Rate Limit PG counter의 QPS > 1000 → Redis 이전 고려
  3. Passkey(FIDO 2) 단일 인증 표준화 시 비밀번호 폐기 고려

---

### ADR-008: Storage — SeaweedFS 단독 + B2 오프로드 (MinIO 아카이브/AGPL 거부, Garage 재평가 3조건)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 1, 세션 12; Wave 2 D 재검증)
- **결정자**: Agent W1-A + W2-D

- **컨텍스트**:
Storage는 S3 호환 객체 저장소가 필요하다. MinIO(Go, 최대 점유율), Garage(Rust, BSD), SeaweedFS(Go, Apache-2.0), Ceph(C++, 대규모) 4개 후보. 2026-02-12 MinIO AGPL VC 아카이빙 이슈가 있음.

- **결정**:
**SeaweedFS 단독 + Backblaze B2 오프로드**. filer + volume 1 노드 배치. Hot 30일은 SeaweedFS, Cold는 B2로 자동 이전. 권장 상한 50GB(ASM-4 검증 필요).

- **고려한 대안**:
  - MinIO: 2026-02-12 AGPL 전환 VC backed pivoting — **거부** (CON-11 AGPL 금지). SigV4 호환성도 MinIO 단점 점차 부각.
  - Garage: BSD 라이선스 안전하지만 커뮤니티 규모 작음 — **조건부 보류**. SeaweedFS 문제 발생 시 백업안.
  - Ceph: 대규모 분산 파일시스템, 1인 운영 부적합 — **거부**.
  - AWS S3: CON-2(Cloudflare Tunnel) + CON-12(데이터 주권) 위반 — **거부**.

- **결과**:
  - **긍정**: Wave 2 D 매트릭스 4.25/5. Apache-2.0 라이선스 안전. 90~95점 단일 채택으로 도달.
  - **부정**: SeaweedFS 50GB+ 운영 데이터 부족(ASM-4 검증 필요). 대응: Phase 17 전 스파이크-007 50GB 부하 테스트.

- **근거 문서**: `01-research/07-storage/01-deep-seaweedfs.md`, `01-research/07-storage/05-seaweedfs-vs-garage.md`, Wave 2 D 1:1 비교 741줄

- **재검토 트리거 (Garage 재평가 3조건)**:
  1. SeaweedFS restart failure > 1건/주 (ASM-4 EWI)
  2. SeaweedFS 파일 손상 1건 이상 (무결성 이슈)
  3. SeaweedFS 커뮤니티 이탈 (예: major contributor 회사 AGPL 전환)

---

### ADR-009: Edge Functions — 3층 하이브리드 (isolated-vm v6 + Deno 사이드카 + Vercel Sandbox 위임)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 1, 세션 12; Wave 2 D 재검증)
- **결정자**: Agent W1-A + W2-D

- **컨텍스트**:
Supabase Edge Functions는 Deno 전용. 양평에서는 격리(sandbox)와 npm 호환 + 비용 효율을 모두 충족해야 한다. Deno embed, isolated-vm v6, Vercel Sandbox 3개 후보.

- **결정**:
**3층 하이브리드 아키텍처**. L1 = isolated-vm v6 (짧은 JS, cold start 50ms), L2 = Deno 사이드카 (npm 호환, 긴 수명), L3 = Vercel Sandbox 위임 (고비용 장시간, 선택적). `decideRuntime()` 라우터가 코드 분석 또는 사용자 지정 선택.

- **고려한 대안**:
  - Deno 단독: npm 호환이지만 단일 프로세스 격리로 한계, 양평 Next.js 16과 이중 런타임 부담 — **부분 채용(L2)**.
  - isolated-vm 단독: 격리 강력하지만 npm 미지원, 짧은 스니펫만 — **부분 채용(L1)**.
  - Vercel Sandbox 단독: 비용 과다(매 invocation 과금), 이ntegration latency — **조건부(L3)**.
  - AWS Lambda: AP-5 비용 위반 — **거부**.

- **결과**:
  - **긍정**: Wave 2 D 매트릭스 4.22/5. 세 런타임의 강점만 취합 — cold start 50ms, npm 호환, 고비용 격리 모두 달성. 100점 청사진 달성 가능.
  - **부정**: `decideRuntime()` 구현 복잡도, 3 런타임 모니터링/디버깅 공수 증가. Phase 19에서 80h.

- **근거 문서**: `01-research/08-edge-functions/01-deep-isolated-vm.md`, `01-research/08-edge-functions/02-deep-deno.md`, `01-research/08-edge-functions/03-deep-vercel-sandbox.md`, Wave 2 D 1:1 비교 1,143줄

- **재검토 트리거**:
  1. isolated-vm v6 Node 24 ABI 호환 깨짐 (ASM-5 EWI)
  2. Deno 2.x 에서 Next.js 통합 공식 지원 시 L2 단독 고려
  3. Edge function invocation 월 > 10만 → Vercel Sandbox 비용 재평가

---

### ADR-010: Realtime — wal2json + supabase-realtime 포팅 하이브리드 (계층 분리: CDC vs Channel)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 1, 세션 12; Wave 2 E 재검증)
- **결정자**: Agent W1-A + W2-E

- **컨텍스트**:
Supabase Realtime은 PostgreSQL 변경을 실시간 브로드캐스트. wal2json(CDC 캡처), ElectricSQL(동기화 엔진), supabase-realtime 포팅(Elixir→Node) 3개 후보. Wave 2 E에서 "경쟁이 아니라 역할 분담" 결론.

- **결정**:
**계층 분리 하이브리드**. CDC 계층(WAL → 내부 이벤트 버스) = **wal2json** 확장. Channel 계층(구독 관리/백프레셔/presence) = **supabase-realtime 포팅**. 두 계층이 독립 컴포넌트로 동작.

- **고려한 대안**:
  - wal2json만: CDC 캡처는 되지만 구독 관리 없음 — **L5 CDC만 담당**.
  - ElectricSQL: 클라이언트 동기화 지향, 서버 브로드캐스트 외 범위 — **거부**.
  - Realtime 풀 폴링: 1-5초 간격, p95 200ms 달성 불가 — **거부**.

- **결과**:
  - **긍정**: Wave 2 E 매트릭스 4.05/5. 두 계층 분리로 각자 최적화 가능 (wal2json = CDC 검증, supabase-realtime 포팅 = channel API 호환). 100점 청사진.
  - **부정**: 구현 공수 70h. supabase-realtime Elixir→Node 포팅 자체가 복잡.

- **근거 문서**: `01-research/09-realtime/01-deep-wal2json.md`, `01-research/09-realtime/02-deep-supabase-realtime.md`, `01-research/09-realtime/03-deep-electricsql.md`, Wave 2 E 매트릭스 323줄

- **재검토 트리거**:
  1. PostgreSQL 18+에서 wal2json 비호환 발생 (ASM-6 EWI)
  2. pgoutput 네이티브가 wal2json 수준의 JSON 출력 제공 시 전환
  3. supabase-realtime 포팅에서 복잡도 > 허용 한계 시 폴백(폴링 5초)

---

### ADR-011: Advisors — 3-Layer (schemalint 컨벤션 + squawk DDL + splinter 38룰 Node 포팅)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 E 재검증)
- **결정자**: Agent W1-H + W2-E

- **컨텍스트**:
Advisors는 성능/보안/컨벤션 조언. Supabase의 splinter는 PL/pgSQL 38룰을 DB 내부에서 실행. schemalint(정적 컨벤션), squawk(DDL 위험 검사) 추가 후보.

- **결정**:
**3-Layer Advisor**. Layer 1: schemalint (TS 포팅, 스키마 정적 컨벤션). Layer 2: squawk (CI 단계 DDL 위험 검사). Layer 3: splinter 38룰 Node TS 포팅 (런타임 RLS 누락/느린 쿼리/인덱스 제안).

- **고려한 대안**:
  - splinter PL/pgSQL 직접 실행: PG SUPERUSER 필요 + 다중 DB 버전 호환 어려움 — **Node 포팅 선택**.
  - squawk만: DDL 단계만 커버, 런타임 경고 없음 — **보조**.
  - schemalint만: 네이밍 컨벤션만 — **보조**.

- **결과**:
  - **긍정**: Wave 2 E 매트릭스 3.95/5. 3 계층이 시점(정적/DDL/런타임) 분리되어 자연스러운 역할 분담.
  - **부정**: 총 공수 80h(Wave 1 산정). splinter 38룰 포팅 점진적 병합 필요.

- **근거 문서**: `01-research/10-advisors/01-deep-splinter.md`, `01-research/10-advisors/02-deep-squawk.md`, Wave 2 E 1:1 비교 589줄

- **재검토 트리거**:
  1. splinter 룰 추가 업스트림 (> 50룰) → 포팅 비용 재평가
  2. DB 내부 실행이 더 빠른 특정 룰 발견 시 일부 PL/pgSQL 유지 검토

---

### ADR-012: Data API — REST 강화 + pgmq + pg_graphql 보류 (4 수요 트리거 중 2+ 시 도입)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 F 재검증)
- **결정자**: Agent W1-I + W2-F

- **컨텍스트**:
Supabase Data API는 REST(PostgREST 생성) + GraphQL(pg_graphql) + Realtime WebSocket. 양평에서는 REST 기본, GraphQL은 수요 기반 도입. pgmq로 Outbox 패턴 구현.

- **결정**:
**REST 강화(PostgREST 호환 80%) + pgmq + SQLite 보조**를 즉시 채택. **pg_graphql은 4개 수요 트리거 중 2개+ 충족 시 Phase 21+에 도입**. 현재는 보류.

- **고려한 대안**:
  - GraphQL 즉시 도입: 수요 불명확 시 과잉 투자 — **거부**, 조건부 보류.
  - PostGraphile: pg_graphql보다 성숙하지만 Node 서버 전환 부담 — **거부**.
  - REST만: Supabase 호환성 부족 — **부분 채용(즉시)**.

- **결과**:
  - **긍정**: Wave 2 F 매트릭스 4.29/5. 즉시 80~85점 달성. pgmq로 Outbox 트랜잭션 일관성.
  - **부정**: pg_graphql 도입 시점이 운영자 판단에 달림. Wave 5에서 4 수요 트리거 상태 정기 리뷰 필요.

- **근거 문서**: `01-research/11-data-api/01-deep-pgmq.md`, `01-research/11-data-api/02-deep-pg-graphql.md`, `01-research/11-data-api/03-deep-postgraphile.md`, Wave 2 F 1:1 비교 751줄

- **재검토 트리거** (ADR-016 상세화):
  - 아래 4 중 2+ 충족 시 pg_graphql 도입:
  1. 팀 > 1명 (CON-3 변경)
  2. 모바일 클라이언트 추가
  3. 프론트엔드 팀이 GraphQL 요청
  4. 쿼리 복잡도가 REST로 표현 어려움 (예: 3-hop nested join)

---

### ADR-013: Observability — node:crypto AES-256-GCM envelope + MASTER_KEY=/etc/luckystyle4u/secrets.env

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 F DQ-12.3 확정)
- **결정자**: Agent W1-J + W2-F

- **컨텍스트**:
Vault는 시크릿 저장의 핵심. Supabase는 pgsodium 사용 (PG 확장, SUPERUSER 필요, Prisma 비호환). 양평은 1인 + Prisma 전제. DQ-12.3 "MASTER_KEY 위치"가 Wave 2 F에서 확정.

- **결정**:
**Vault = node:crypto AES-256-GCM envelope (KEK→DEK)**. KEK=MASTER_KEY, DEK=per-secret 생성. **MASTER_KEY 위치 = `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640 mode)**. PM2 `env_file`로만 주입. JWKS는 jose ES256 키쌍 사용.

- **고려한 대안**:
  - pgsodium: SUPERUSER 필요, Prisma 비호환 — **거부**.
  - AWS KMS: 외부 의존, 월 $1+ — **거부** (AP-5).
  - 평문 환경변수: 보안 부족 — **거부**.
  - Vault by HashiCorp: 별도 프로세스 + 유지보수 부담 — **거부**.

- **결과**:
  - **긍정**: Wave 2 F 매트릭스 0.87 권고도. 92.54/94.20 가중 점수로 KMS 대비 14~16점 우위. 월 $0.
  - **부정**: MASTER_KEY 관리가 운영자 개인 책임. 디스크 손상 시 KEK 손실 위험 → 대응: MASTER_KEY 백업본(인쇄/GPG 암호화 USB).

- **근거 문서**: `01-research/12-observability/01-deep-node-crypto.md`, `01-research/12-observability/02-deep-jose-jwks.md`, Wave 2 F 매트릭스 676줄 + DQ-12.3 확정 메모

- **재검토 트리거**:
  1. MASTER_KEY 유출 의심 시 (즉시 회전)
  2. DEK 회전 주기 365일 도래
  3. HashiCorp Vault 자체호스팅 도커 이미지 단일 바이너리화 시 재고

---

### ADR-014: UX Quality — Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP `mcp-luckystyle4u` (LangChain 거부)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 G 재검증)
- **결정자**: Agent W1-J + W2-G

- **컨텍스트**:
UX Quality의 핵심은 AI Assistant(자연어 쿼리, 쿼리 설명, 최적화 제안). AI SDK v6(Vercel), LangChain, OpenAI SDK 직접 3개 후보. 비용 관리 필수(NFR-COST.2 월 $5 이하).

- **결정**:
**Vercel AI SDK v6 + Anthropic Claude Haiku(기본) + Sonnet(조건부 승격) + 자체 MCP `mcp-luckystyle4u`**. LangChain 거부. BYOK(사용자 API 키) 기본.

- **고려한 대안**:
  - LangChain: 추상화 과다, 번들 크기, 오버헤드 — **거부** (AI SDK v6 대비 33% 무거움, Wave 2 G 확인).
  - OpenAI SDK 직접: Anthropic 사용 불가 — **거부**.
  - Claude Desktop / API only: Next.js 통합 부족 — **부분 채용**(API).
  - Supabase AI 임베드: Supabase Cloud 의존 — **거부** (AP-2).

- **결과**:
  - **긍정**: Wave 2 G 매트릭스 0.84 권고도, 87.2점. 월 $2.5~5, LangChain 대비 33% 경량. MCP는 자체 호스팅이라 Cursor/Claude Code 등 모든 MCP 클라이언트와 호환.
  - **부정**: AI SDK v6 major version 업그레이드 때 API 변경 가능성. Anthropic API 가격 인상 시 직접 영향.

- **근거 문서**: `01-research/13-ux-quality/01-deep-ai-sdk.md`, Wave 2 G 매트릭스 276줄

- **재검토 트리거**:
  1. AI 월 비용 > $8 지속 2개월 (ASM-10 EWI)
  2. AI SDK v7 breaking change
  3. Anthropic Haiku 가격 2배 인상
  4. 대체 AI 공급자(예: Claude Sonnet 대체 가능 모델 출시)

---

### ADR-015: Operations — Capistrano-style symlink + PM2 cluster:4 + canary.stylelucky4u.com (Docker 거부 조건 0개 충족)

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 1 Round 2, 세션 14; Wave 2 G 재검증)
- **결정자**: Agent W1-J + W2-G

- **컨텍스트**:
자체호스팅 배포 방식. Docker Compose, Kubernetes, 네이티브 systemd + PM2 3개 후보. 카나리 배포 방식도 필요.

- **결정**:
**네이티브 PM2 cluster:4 + Capistrano-style symlink 배포**. Docker 미사용(조건 0개 충족). 카나리는 `canary.stylelucky4u.com` 서브도메인 + localhost:3002 별도 PM2 앱. 5초 롤백(symlink 되돌리기), 다운타임 0(PM2 graceful reload).

- **고려한 대안**:
  - Docker Compose 8~10 컨테이너: Supabase Self-Hosted 스타일, 1인 부담 — **거부**. 조건 0개 충족 (AP-1 1인 운영, NFR-MNT.1 setup 15분).
  - Kubernetes: 수평 확장 필요 없음 — **거부** (AP-1).
  - systemd 단일 프로세스: PM2 cluster 기능 부재 — **거부** (NFR-REL.3 cluster:4 요구).

- **결과**:
  - **긍정**: Wave 2 G 매트릭스 0.87 권고도, 89.0점. 롤백 5초, 다운타임 0. 현 운영 구조 유지.
  - **부정**: 수평 확장 필요 시 재설계. ASM-9 트래픽 급증 시 PM2 cluster:8+ 조정만 가능.

- **근거 문서**: `01-research/14-operations/01-deep-capistrano.md`, Wave 2 G 매트릭스 268줄

- **재검토 트리거 (Docker 이행 조건)**:
  1. 월간 트래픽 > 100만 요청 (ASM-9 EWI)
  2. 팀 > 2명 (CON-3 변경)
  3. 다중 환경 필요 (dev/stg/prod 3단계)
  4. 외부 고객에게 서비스 제공 (B2B SaaS 전환)

---

### ADR-016: pg_graphql 수요 트리거 4 정량화

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 2 F)
- **결정자**: Agent W2-F

- **컨텍스트**:
ADR-012에서 pg_graphql 도입을 "수요 트리거 시" 조건부 보류. 그러나 "수요 트리거"가 주관적이면 재검토가 계속 지연됨. 정량화 필요.

- **결정**:
**pg_graphql 도입 = 아래 4개 중 2개 이상 충족 시 Phase 21+에 도입**:
  1. **팀 > 1명**: CON-3(1인 운영)이 변경되어 팀원이 추가된 경우
  2. **모바일 클라이언트 추가**: Capacitor/Expo/Native 모바일 앱이 공식 지원 대상이 된 경우
  3. **프론트엔드 팀이 GraphQL 요청**: 프론트엔드 팀의 선호도가 명시적으로 표명된 경우
  4. **쿼리 복잡도가 REST로 표현 어려움**: 3-hop nested join이 프로덕션 코드에 3건 이상 등장

- **고려한 대안**:
  - 단일 트리거: 과민반응 — **거부**, 2개+ 요구.
  - 4개 전체: 과보수 — **거부**.
  - 관리자 판단: 비정량 — **거부**.

- **결과**:
  - **긍정**: 재검토 시점 명확. 불필요한 pg_graphql 도입 지연.
  - **부정**: 4 조건 측정 자체가 운영 부담 (Wave 5 로드맵에서 월간 체크리스트 포함 필요).

- **근거 문서**: Wave 2 F 결론 문단 4 ("pg_graphql 4개 수요트리거 중 2개+ 조건부")

- **재검토 트리거**: 연 1회 정기 리뷰 (매년 4월) 또는 위 4 중 어느 하나 충족 시 즉시

---

### ADR-017: OAuth Providers Phase 18+ 조건부 도입

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 2 C)
- **결정자**: Agent W2-C

- **컨텍스트**:
Auth Core(ADR-006)는 이메일/패스워드 + MFA만 지원. OAuth Providers(Google, GitHub 등) 도입 시점이 불명확. 현재 사용자 1명(김도영)이 이메일 로그인으로 충분.

- **결정**:
**OAuth Providers는 Phase 18 이후 조건부 도입**. 도입 전제: (a) Phase 15~17 MVP 완료 (Auth Advanced 안정), (b) 사용자 추가(팀 확장) 또는 외부 인증 필요성. 도입 시 Google + GitHub 2개 먼저, Microsoft/Apple/Naver/Kakao는 수요 트리거.

- **고려한 대안**:
  - Phase 15 즉시 도입: 1인 단일 사용자 상황에서 과잉 — **거부**.
  - 영구 보류: 향후 팀 확장 시 공수 문제 — **거부**.

- **결과**:
  - **긍정**: MVP 공수 절감. 사용자 수 증가 시 즉시 착수.
  - **부정**: 실제 도입 시 JWT 클레임 구조 재조정 필요할 수 있음(provider_id 추가).

- **근거 문서**: Wave 2 C 결론 + Wave 3 `00-product-vision.md §A3.1` (김도영 1인)

- **재검토 트리거**:
  1. 외부 사용자(팀원) 첫 가입 요청
  2. Anonymous role과 OAuth 통합 필요
  3. SSO(SAML) 기업 사용자 요청 (2028+)

---

### ADR-018: System Overview 9-레이어 구조 및 의존 규칙

- **상태**: Accepted
- **날짜**: 2026-04-18 (Wave 4 Tier 1, 세션 27)
- **결정자**: Agent W4-A1

- **컨텍스트**:
Wave 1~3 리서치 결과 72 문서/53,542줄이 누적. Tier 2/3가 Blueprint를 작성할 때 공통 구조 기준이 없으면 카테고리 간 일관성 손실 위험. 레이어 구조 정립 필요.

- **결정**:
**9-레이어 구조 확정** (L0 인프라 → L1 관측/운영 → L2 Auth Core/Vault → L3 Auth Advanced → L4 저장 → L5 Compute → L6 Dev Tools → L7 Data API → L8 UX). **상향 의존 금지**, **같은 레이어 수평 허용**, **스킵 의존 허용**. `00-system-overview.md §2`에 상세.

- **고려한 대안**:
  - 3-tier (DB/App/UI): 너무 거침 — **거부**.
  - 7-레이어 OSI 모방: 관련 없음 — **거부**.
  - 카테고리별 독립 (레이어 없음): Blueprint 충돌 빈발 — **거부**.

- **결과**:
  - **긍정**: Blueprint 작성 시 공통 매핑. NFR 매핑 명확화. 역방향 피드백 절차 표준화(§7).
  - **부정**: 일부 카테고리가 여러 레이어에 걸침(Auth, DB Ops) — "주 레이어 + 보조" 표기로 해결.

- **근거 문서**: `00-system-overview.md §2`, Wave 1 Compound Knowledge "하이브리드 9 : 단일 5" 분류

- **재검토 트리거**:
  1. Tier 2 Blueprint 3개 이상이 레이어 경계를 벗어나는 설계 제안 (→ 레이어 구조 재설계)
  2. 신규 카테고리 추가 (현재 14에서 15로 증가 시)

---

## 2. ADR 간 의존/대체 관계 그래프

```
ADR-018 (레이어 구조)
   │ 모든 ADR의 배치 기준
   ▼
┌─────────────────────────────────────────────────────────┐
│ ADR-001 Multi-tenancy 제외 ─── 전체 범위 영향             │
│                                                          │
│ ADR-013 Vault/MASTER_KEY ◄──── ADR-006 Auth Core        │
│                           ◄──── ADR-007 Auth Advanced   │
│                                                          │
│ ADR-015 Operations ◄──── ADR-005 DB Ops (백업)           │
│                    ◄──── ADR-013 시크릿 관리              │
│                                                          │
│ ADR-010 Realtime (wal2json + 포팅)                       │
│   │                                                      │
│   ▼ CDC 소비                                             │
│ ADR-012 Data API (pgmq)                                  │
│   │                                                      │
│   ▼ 조건부                                               │
│ ADR-016 pg_graphql 수요 트리거                           │
│                                                          │
│ ADR-009 Edge Fn 3층 ─── 격리 요구 ─── ADR-007 Auth Adv  │
│                                                          │
│ ADR-008 Storage (SeaweedFS) ◄──── ADR-009 Edge Fn 접근  │
│                                                          │
│ ADR-002 Table Editor ◄──── ADR-004 Schema Viz (RLS UI)  │
│ ADR-003 SQL Editor ◄──── ADR-011 Advisors (splinter 연동)│
│                                                          │
│ ADR-017 OAuth Providers ◄──── ADR-006 Auth Core 확장    │
│                                                          │
│ ADR-014 UX Quality (AI SDK)                              │
└─────────────────────────────────────────────────────────┘
```

---

## 3. ADR 작성/수정 절차 (Wave 4+ 추가 ADR 대비)

### 3.1 신규 ADR 추가 규칙

새로운 아키텍처 결정이 필요할 때:

1. 이 파일 `01-adr-log.md`에 **다음 ADR 번호를 할당** (현재 019부터)
2. Wave 번호 + 세션 번호 + 담당 에이전트 명시
3. 9개 필드 전부 기재 (상태/날짜/결정자/컨텍스트/결정/대안/결과/근거/재검토 트리거)
4. `00-system-overview.md`의 관련 §에 ADR 참조 추가 (예: "본 결정은 ADR-019를 따른다")
5. 이 파일 §0.4 요약 테이블 업데이트

### 3.2 기존 ADR 변경 규칙

기존 ADR이 더 이상 유효하지 않으면:
- 상태를 `Deprecated` 또는 `Superseded by ADR-XXX`로 변경
- **ADR 본문은 절대 삭제하지 않음** (역사 삭제 금지 원칙)
- 대체 ADR이 있으면 Forward reference 추가

### 3.3 ADR 리뷰 케이던스

- **즉시 리뷰**: 재검토 트리거 충족 시 (각 ADR의 트리거 참조)
- **월간**: 모든 ADR 상태 확인, 재검토 트리거 근접 여부 체크
- **분기별**: Wave 5 로드맵과 연계하여 대기 중 ADR 재평가
- **연간 (4월)**: ADR-016 (pg_graphql 트리거) 등 조건부 ADR 정기 리뷰

---

## 4. ADR 통계

### 4.1 카테고리별 ADR 수

| 카테고리 | ADR 번호 |
|---------|----------|
| Table Editor | ADR-002 |
| SQL Editor | ADR-003 |
| Schema Visualizer | ADR-004 |
| DB Ops | ADR-005 |
| Auth Core | ADR-006, ADR-017 |
| Auth Advanced | ADR-007 |
| Storage | ADR-008 |
| Edge Functions | ADR-009 |
| Realtime | ADR-010 |
| Advisors | ADR-011 |
| Data API | ADR-012, ADR-016 |
| Observability | ADR-013 |
| UX Quality | ADR-014 |
| Operations | ADR-015 |
| 전 카테고리 | ADR-001 (Multi-tenancy), ADR-018 (레이어 구조) |

### 4.2 상태별 분포

- **Accepted**: 18건 (100%)
- **Proposed**: 0건
- **Deprecated**: 0건
- **Superseded**: 0건

### 4.3 Phase 매핑

| Phase | 관련 ADR |
|-------|----------|
| 15 (Auth Advanced) | ADR-007 |
| 16 (Observability + Operations) | ADR-013, ADR-015 |
| 17 (Auth Core + Storage) | ADR-006, ADR-008 |
| 18 (SQL + Table Editor) | ADR-002, ADR-003, ADR-017 |
| 19 (Edge Fn + Realtime) | ADR-009, ADR-010 |
| 20 (Schema Viz + DB Ops + Advisors) | ADR-004, ADR-005, ADR-011 |
| 21 (Data API + UX Quality) | ADR-012, ADR-014, ADR-016 |
| 전 Phase | ADR-001, ADR-018 |

### 4.4 재검토 트리거 수

18 ADR × 평균 2.5 트리거 = **약 45개 재검토 조건** 등록. 이 조건들이 충족되면 ADR 재평가 착수.

---

## 5. Wave 5에 대한 ADR 입력 (향후 예상)

Wave 5 로드맵 작성 시 다음 ADR 후보가 추가될 가능성:

- **ADR-019 (예상)**: Prisma 7 → Prisma 8 업그레이드 타이밍 — ASM-11 검증 결과 기반
- **ADR-020 (예상)**: 마이그레이션 롤백 5초 구현 패턴 — Phase 16 Operations 스파이크 결과
- **ADR-021 (예상)**: Next.js 16 → 17 업그레이드 전략 — 릴리스 시점 기반
- **ADR-022 (예상)**: argon2 전환 시점 — CON-10 재평가 결과
- **ADR-023 (예상)**: Capacitor 모바일 클라이언트 지원 여부 — DQ-14.x 답변

Wave 5에서 위 ADR 중 필요한 것을 추가한다.

---

## 부록 Z. 근거 인덱스

### Z.1 이 문서가 인용하는 Wave 문서 요약

| ADR | 핵심 근거 문서 경로 |
|-----|-------------------|
| ADR-001 | `00-vision/09-multi-tenancy-decision.md` (621줄) |
| ADR-002 | `01-research/01-table-editor/01~03` + Wave 2 A 매트릭스 |
| ADR-003 | `01-research/02-sql-editor/01~03` + Wave 2 A 1:1 비교 |
| ADR-004 | `01-research/03-schema-visualizer/01~02` + Wave 2 B 매트릭스 |
| ADR-005 | `01-research/04-db-ops/01~02` + Wave 2 B 1:1 비교 |
| ADR-006 | `01-research/05-auth-core/01~02` + Wave 2 C 1:1 비교 |
| ADR-007 | `01-research/06-auth-advanced/01~03` + Wave 2 C 매트릭스 |
| ADR-008 | `01-research/07-storage/01, 05` + Wave 2 D 1:1 비교 |
| ADR-009 | `01-research/08-edge-functions/01~03` + Wave 2 D 1:1 비교 |
| ADR-010 | `01-research/09-realtime/01~03` + Wave 2 E 매트릭스 |
| ADR-011 | `01-research/10-advisors/01~02` + Wave 2 E 1:1 비교 |
| ADR-012 | `01-research/11-data-api/01~03` + Wave 2 F 1:1 비교 |
| ADR-013 | `01-research/12-observability/01~02` + Wave 2 F 매트릭스 (DQ-12.3 확정) |
| ADR-014 | `01-research/13-ux-quality/01` + Wave 2 G 매트릭스 |
| ADR-015 | `01-research/14-operations/01` + Wave 2 G 매트릭스 |
| ADR-016 | Wave 2 F 결론 (pg_graphql 트리거 정량화) |
| ADR-017 | Wave 2 C 결론 + Wave 3 페르소나 분석 |
| ADR-018 | Wave 4 Tier 1 자체 판단 (레이어 구조 정립) |

### Z.2 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent A1 (Opus 4.7 1M) | Wave 4 Tier 1 초안 — ADR-001~018 18건 |

### Z.3 후속 Wave 4/5 산출물 연결

- → `02-data-model-erd.md` (Tier 1, 다음 문서): ADR-013(Vault) + ADR-007(MFA) + ADR-010(Realtime) 의 스키마 영향
- → Wave 4 Tier 2 Blueprint 14개: 각 Blueprint §3에서 해당 ADR 인용 필수
- → Wave 5 로드맵: Phase별로 ADR 구현 순서 + 재검토 트리거 체크

### Z.4 ADR 간 트레이드오프 요약 표

각 ADR의 "결과" 섹션에서 거론된 긍정/부정을 한눈에:

| ADR | 긍정 핵심 | 부정 핵심 | 완화/대응 |
|-----|----------|-----------|----------|
| ADR-001 | 공수 70h 절감, 크로스 리크 버그 제거 | Supabase API 일부 고정값, B2B 전환 100-120h 비용 | 재검토 트리거 4개 정량화 |
| ADR-002 | MIT, 헤드리스, shadcn 토큰 통합 | UI 공수 60h | 14c-α 기존 자산 재활용 |
| ADR-003 | Wave 2 최고점 4.70 | 40일 공수, upstream 모니터링 | Apache-2.0 패턴만 차용 |
| ADR-004 | 기존 xyflow/elkjs 재활용 | 100+ 테이블 성능 우려 | 뷰포트 lazy loading |
| ADR-005 | TS 네이티브, B2 월 $0.3 | PM2 fork 모드 필수(cron-worker 별도) | 별도 앱 분리 |
| ADR-006 | 자산 보존, 블랙박스 없음 | OAuth 15h 추가 | ADR-017 조건부 도입 |
| ADR-007 | Wave 2 최고점 4.59, 22h로 15→60 | MFA 3종 UI 공수 | 백업 코드 + 디바이스 관리 UI |
| ADR-008 | Apache-2.0, 단독 채택 90+점 | 50GB+ 미검증 | ASM-4 50GB 부하 테스트 |
| ADR-009 | 3층 강점 취합 | `decideRuntime()` 복잡도 | Phase 19 단계적 롤아웃 |
| ADR-010 | 계층 분리 최적화 | 포팅 공수 70h | 폴백(폴링 5초) 설계 |
| ADR-011 | 시점 분리 자연스러움 | 80h 공수 | 점진 머지 |
| ADR-012 | 즉시 80~85점 | pg_graphql 미사용 시 갭 | ADR-016 트리거 정량화 |
| ADR-013 | KMS 대비 14~16점 우위, 월 $0 | MASTER_KEY 운영자 책임 | 백업본(인쇄/GPG USB) |
| ADR-014 | 월 $2.5~5, 경량 | AI SDK 업그레이드 리스크 | Anthropic BYOK 승격 가드 |
| ADR-015 | 5초 롤백, 다운타임 0 | 수평 확장 재설계 필요 | Docker 이행 트리거 4개 |
| ADR-016 | 재검토 시점 명확 | 4 조건 측정 부담 | 연 1회 정기 리뷰 |
| ADR-017 | MVP 공수 절감 | JWT 클레임 구조 재조정 가능성 | 사용자 가입 시 착수 |
| ADR-018 | Blueprint 일관성 | 여러 레이어 걸침 카테고리 | "주+보조" 표기 |

### Z.5 Wave 3 `07-dq-matrix.md` DQ ↔ ADR 매핑

Wave 3에서 등록된 DQ 64건 중 Wave 4로 재분배된 28건은 Blueprint(Tier 2)가 답변하되, 구조적 결정은 ADR로 승격된다:

| DQ | 승격 예정 ADR (Wave 4/5) | 비고 |
|----|-------------------------|------|
| DQ-1.1 ~ 1.9 (Wave 1 잠정 답변) | ADR-007~010, ADR-013 | 이미 ADR화 완료 |
| DQ-1.10 ~ 1.11 (Realtime 백프레셔) | ADR-019 (예상) | Wave 5 스파이크 결과 |
| DQ-1.12 ~ 1.14 (isolated-vm 한계) | ADR-009 상세화 | Blueprint B3 §5 |
| DQ-1.15 ~ 1.17 (SeaweedFS 부하) | ADR-008 재검토 | ASM-4 검증 결과 |
| DQ-2.x (SQL Editor) | Blueprint B4 §5 답변 후 ADR 후보 | 공수 트리거에 따라 |
| DQ-12.3 (MASTER_KEY 위치) | ADR-013에 포함 확정 | 이미 Wave 2 F 완료 |
| DQ-14.x (Capacitor 모바일) | ADR-020~023 (예상) | Wave 5 결정 |

### Z.6 변경 이력 (Wave 5 대비)

향후 이 ADR Log는 각 ADR의 상태 변화와 신규 ADR 추가로 지속 갱신된다. 변경 이력 기록 원칙:

1. **절대 삭제 금지** — 기존 ADR 본문은 상태 변경만 허용 (역사 삭제 금지)
2. **슈퍼시드 체인** — ADR-M이 ADR-N으로 대체되면 두 ADR 모두 유지, 상호 참조
3. **세션별 추적** — 각 Wave/Phase 세션 종료 시 이 파일을 갱신 대상으로 체크
4. **정량 트리거** — 재검토 트리거는 추후 측정 가능하도록 정량 조건만 기재

### Z.7 관련 스킬과 자동화

프로젝트의 `kdyswarm`, `kdywave`, `kdyinvestigate` 스킬은 ADR 재검토 트리거 충족 시 자동 발동 가능성 고려:
- Prometheus alert `seaweedfs_restart > 1/week` → ADR-008 재검토 발동
- AI 비용 > $8/월 2개월 → ADR-014 재검토 발동
- 월간 트래픽 > 100만 → ADR-015 재검토 발동

이 자동화는 Wave 5 Observability 구현에서 `kdyobserve` 스킬 + Prometheus alertmanager 규칙으로 구체화한다.

---

> **ADR 로그 끝.** Wave 4 · A1 · 2026-04-18 · 양평 부엌 서버 대시보드 — 18 ADR × 45 재검토 트리거 누적.
