# 01. 용어집 (Glossary) — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · Tier 2 (A1) 산출물 — kdywave W5-A1 (Agent Appendix-1)
> 작성일: 2026-04-18 (세션 28+)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [07-appendix/](./) → **이 문서**
> 연관: [README.md](../README.md) · [02-dq-final-resolution.md](./02-dq-final-resolution.md) · [03-genesis-handoff.md](./03-genesis-handoff.md)

---

## 목차

- [1. 용어집 사용 가이드](#1-용어집-사용-가이드)
- [2. 프로젝트 고유 용어](#2-프로젝트-고유-용어)
- [3. 14 카테고리별 용어 인덱스](#3-14-카테고리별-용어-인덱스)
- [4. 기술 스택 용어](#4-기술-스택-용어)
- [5. OSS / 라이브러리 용어](#5-oss--라이브러리-용어)
- [6. 아키텍처 용어](#6-아키텍처-용어)
- [7. 보안 용어](#7-보안-용어)
- [8. 운영 용어](#8-운영-용어)
- [9. 데이터 용어 (PG / SQLite / SeaweedFS)](#9-데이터-용어)
- [10. UI/UX 용어](#10-uiux-용어)
- [11. 약어 인덱스](#11-약어-인덱스)
- [12. 용어 간 관계 그래프](#12-용어-간-관계-그래프)

---

## 1. 용어집 사용 가이드

### 1.1 분류 원칙

본 용어집은 **카테고리별 > 알파벳순**의 2단 분류를 사용한다. 각 용어는 하나의 1차 카테고리(§2~§10)에 배치되며, 약어가 있는 경우 §11에서 중복 인덱싱된다.

- **프로젝트 고유 용어 (§2)**: 양평 · luckystyle4u · kdywave 등 본 프로젝트 또는 상위 운영 스킬에서 고유하게 정의된 이름
- **14 카테고리별 용어 (§3)**: Wave 1에서 확정된 14 카테고리 각각의 핵심 기술/개념
- **기술 스택 / OSS / 라이브러리 (§4, §5)**: Wave 1-2에서 검토된 모든 외부 기술 항목
- **아키텍처 / 보안 / 운영 / 데이터 / UI/UX (§6~§10)**: Wave 4 청사진에서 등장하는 구조적 용어

### 1.2 용어 형식

각 항목은 다음 형식을 따른다.

```markdown
### 용어명 (Term Name) [약어]

**정의**: 한 줄 정의.
**맥락**: 이 프로젝트에서 어떻게 등장·사용되는가.
**관련**: 다른 용어와의 상호참조 (→ 다른 용어).
**출처**: Wave 1-4 문서 경로 (있으면).
```

### 1.3 약어 규칙

약어는 ":letter" 표기(예: `[MFA]`)로 첫 등장 시 병기한다. 약어 전용 인덱스는 §11 참조.

### 1.4 수록 범위

본 용어집은 Wave 1-5(통합 86,460+줄 / 98+ 문서)에서 실제로 등장하는 용어만 수록한다. 등장 빈도 2회 이상 + 프로젝트 정책·결정에 직접 영향을 미치는 항목을 기준으로 선별하였다.

**수록 통계**:
- 프로젝트 고유 용어: 12건
- 카테고리별 핵심 용어: 14 × 평균 5건 = 약 70건
- 기술 스택: 18건
- OSS/라이브러리: 약 35건
- 아키텍처: 18건
- 보안: 15건
- 운영: 14건
- 데이터: 15건
- UI/UX: 12건
- 약어: 30건
- **합계 약 200+ 항목**

---

## 2. 프로젝트 고유 용어

### 양평 (Yangpyeong)

**정의**: 본 프로젝트의 한국어 내부 코드네임. 운영자 김도영의 지역 이름에서 유래.
**맥락**: `yangpyeong-dashboard-supabase-parity`가 kdywave 프로파일의 공식 프로젝트명. 내부 문서는 "양평" 약칭 사용.
**관련**: → luckystyle4u, → stylelucky4u.com
**출처**: `_CHECKPOINT_KDYWAVE.md` §프로젝트 프로필

### luckystyle4u / stylelucky4u

**정의**: 양평 대시보드의 소유자 브랜드명이자 운영 도메인. 외부로 노출되는 공식 서비스 이름이다.
**맥락**: 운영 도메인 = `stylelucky4u.com`. 시크릿 파일 경로 `/etc/luckystyle4u/secrets.env`, 자체 MCP 서버 이름 `mcp-luckystyle4u` 등에 일관적으로 사용.
**관련**: → MASTER_KEY, → mcp-luckystyle4u, → canary.stylelucky4u.com
**출처**: ADR-013, `00-product-vision.md §A1.1`

### kdywave

**정의**: "Wave 방식 다단계 리서치+설계" 오케스트레이션 스킬의 이름. 본 산출물 전체(98+ 문서)가 kdywave 실행 결과다.
**맥락**: Wave 1(리서치) → Wave 2(비교) → Wave 3(비전/요구사항) → Wave 4(아키텍처) → Wave 5(로드맵) 5단계 구성.
**관련**: → kdyspike, → kdyswarm, → kdygenesis, → Compound Knowledge
**출처**: `_CHECKPOINT_KDYWAVE.md` 전체

### kdyspike

**정의**: "난이도 높은 기능 구현 전 사전 연구 강제" 스킬. 마이크로(30분) / 풀(1-2일) 2트랙.
**맥락**: 본 프로젝트는 Phase 15 진입 전 우선 세트 스파이크 SP-010~016을 kdyspike로 수행 예정.
**관련**: → spike-005 (Edge Fn 심화), → spike-007 (SeaweedFS 50GB), → kdywave
**출처**: `docs/research/_SPIKE_CLEARANCE.md`, `spikes/README.md`

### kdyswarm

**정의**: N-에이전트 DAG 병렬 오케스트레이션 스킬. 독립 작업을 서브에이전트 다수에 분배.
**맥락**: Phase 15의 TOTP/WebAuthn/Rate Limit 3 트랙을 kdyswarm으로 병렬화 계획.
**관련**: → kdywave, → kdygenesis
**출처**: 글로벌 CLAUDE.md "작업 실행 기본 정책"

### kdygenesis

**정의**: "프로젝트 제네시스" 스킬. 기획 → 청사진 → 연쇄 실행 → 풀뿌리 확산까지 자동 수행.
**맥락**: Wave 5 완료 후 `kdygenesis`가 Wave 1-5 산출물을 `_PROJECT_GENESIS.md`로 압축해 실제 구현으로 전환한다.
**관련**: → 03-genesis-handoff.md, → kdywave
**출처**: `07-appendix/03-genesis-handoff.md`

### Compound Knowledge

**정의**: 여러 Wave에서 독립 수행된 리서치가 서로 교차 검증되며 도출되는 "누적 지식". 본 프로젝트에서는 "하이브리드 필수형 9 : 단일 솔루션형 5" 분류가 대표 예.
**맥락**: Wave 1 Round 2 종결 시점에 패턴 1(분류), 패턴 2(라이브러리 vs 패턴), 패턴 3(확장 vs 자체구현) 3개 Compound Knowledge가 확정.
**관련**: → 하이브리드 필수형, → 단일 솔루션형
**출처**: `README.md §Wave 1 Compound Knowledge`

### 14c-α / 14c-β / 14d / 14e / 14f

**정의**: Table Editor의 4단계 증분 버전 레이블. 14c-α=기본 CRUD, 14c-β=RLS UI, 14d=외래키 그래프, 14e=Realtime 연동, 14f=SQL Editor 보너스 기능.
**맥락**: 기존 자산 번호(14a/14b)에서 이어지는 연속 버전. 각 단계가 별도 점수(85→93→99→100)로 매핑.
**관련**: → Table Editor, → TanStack Table v8
**출처**: ADR-002, Blueprint 09 (Table Editor)

### 하이브리드 필수형 (Hybrid-Required)

**정의**: 어떤 단일 OSS로도 100점 달성 불가능한 9개 카테고리. 패턴 차용 + 자체 결합이 필수.
**맥락**: Table Editor / SQL Editor / Schema Viz / Auth Core / Auth Advanced / Edge Functions / Realtime / Data API / Advisors가 이 분류.
**관련**: → 단일 솔루션형, → Compound Knowledge
**출처**: `README.md §Wave 1 Compound Knowledge — 패턴 1`

### 단일 솔루션형 (Single-Solution)

**정의**: 단일 OSS 채택 + 보조 도구 1개로 90+ 도달 가능한 5개 카테고리.
**맥락**: Storage(SeaweedFS) / DB Ops(node-cron+wal-g) / Observability(node:crypto) / UX(AI SDK v6) / Operations(자체 Capistrano).
**관련**: → 하이브리드 필수형
**출처**: `README.md §Wave 1 Compound Knowledge — 패턴 1`

### Phase 15-22

**정의**: 구현 단계 번호. Phase 14까지는 기존 프로젝트 번호. Phase 15부터 Wave 4-5 산출물을 구현 시작.
**맥락**: 15=Auth Advanced, 16=Observability+Operations, 17=Auth Core+Storage, 18=SQL+Table Editor, 19=Edge Fn+Realtime, 20=Schema Viz+DB Ops+Advisors, 21=Data API+UX, 22=통합.
**관련**: → MVP, → Phase 15, → 10-14-categories-priority.md
**출처**: `00-vision/10-14-categories-priority.md §5`

### MVP (Minimum Viable Product)

**정의**: 양평 대시보드의 "최소 가치 인도 가능 범위". 본 프로젝트는 **Phase 15-17**을 MVP로 정의.
**맥락**: Auth Advanced + Observability/Operations + Auth Core/Storage = 전체 112h (총 870h의 12.9%).
**관련**: → Phase 15, → 100점-definition.md
**출처**: `README.md §Wave 3 핵심 발견 #2`

---

## 3. 14 카테고리별 용어 인덱스

### 3.1 Table Editor

- **TanStack Table v8**: 헤드리스 테이블 라이브러리 (MIT). 14c-α 기본 엔진. ADR-002.
- **Column Virtualization**: 열 가상화. TanStack Virtual로 구현. 10만 행 이상 시 필수.
- **cmdk**: Command Menu UI 라이브러리. FK 셀렉터의 기본 컴포넌트.
- **Papa Parse**: CSV 파서 (MIT). 14d에서 메인 스레드, 14e에서 Workers 모드 전환.
- **FK 셀렉터 (Foreign Key Selector)**: 외래키 값 선택 UI. cmdk 기반 Combobox로 구현.

### 3.2 SQL Editor

- **Monaco Editor**: VS Code 기반 코드 에디터 (MIT). SQL 에디팅의 기본 엔진. Blueprint 08.
- **supabase-studio 패턴**: Supabase 공식 대시보드의 Apache-2.0 코드 패턴 차용(임베드 아님). ADR-003.
- **EXPLAIN Visualizer**: 쿼리 실행 계획 시각화. DQ-2.4에서 자체 d3 트리 방식 채택.
- **sql-formatter**: SQL 자동 포맷팅 라이브러리 (MIT). 서버 사이드 `/api/sql/format` 라우트에서 실행 (DQ-2.5).
- **Plan Visualizer**: EXPLAIN 결과를 노드 트리로 표시. pev2 대신 자체 구현 (의존성 경감).
- **14f 보너스**: 4단계(14c~14f) 중 최종 단계. 고급 AI 통합 + 노트북 모드.

### 3.3 Schema Visualizer

- **@xyflow/react**: 노드 그래프 렌더링 라이브러리(MIT). ERD 렌더링 엔진.
- **elkjs**: 자동 레이아웃 계산 라이브러리(EPL-2.0). @xyflow와 결합.
- **schemalint**: 스키마 컨벤션 검사 도구(MIT). TS 포팅하여 Layer 1 Advisor로 배치. ADR-011.
- **RLS UI**: Row-Level Security 정책을 Monaco 기반 에디터로 편집. `/database/policies` 페이지.
- **DMMF (Data Model Meta Format)**: Prisma 7의 런타임 스키마 메타포맷. Schema Viz 자동 ERD 생성의 입력.

### 3.4 DB Ops (Webhooks / Cron / Backups)

- **node-cron**: Node.js cron 스케줄러 (MIT). ADR-005에서 pg_cron 대신 채택.
- **wal-g**: PostgreSQL WAL 아카이빙 도구 (Apache-2.0). PITR 백업 메인 도구.
- **pg_cron**: PostgreSQL 확장으로 작성된 cron. **거부**(ADR-005). 재검토: PG 17+ 기본 탑재 시.
- **pgBackRest**: 엔터프라이즈 PG 백업 도구. **거부** (단일 노드 과잉).
- **archive_timeout**: PostgreSQL WAL 강제 전환 간격. RPO 60초 보장을 위해 60초로 설정(DQ-4.16).
- **Backblaze B2**: S3 호환 오브젝트 스토리지. 백업/콜드 스토리지용. 월 $0.005/GB.
- **advisory lock**: PG의 응용 수준 락. cron 중복 방지에 사용.

### 3.5 Auth Core

- **jose**: JWT/JWS/JWE/JWK Node.js 라이브러리 (MIT). JWT ES256 서명·검증의 기반.
- **bcrypt / bcryptjs**: 패스워드 해싱. 현행 기본. argon2id로의 전환은 Phase 17에서 검토(DQ-AC-1).
- **argon2 / @node-rs/argon2**: bcrypt 대체 해시 함수. 5배 빠른 네이티브 구현. ADR-022 예상 후보.
- **Lucia 패턴 (Lucia Auth v4)**: TypeScript-first 경량 Auth 라이브러리의 UX 패턴. **라이브러리 미채용, 패턴만 차용** (ADR-006).
- **Auth.js v6 (NextAuth.js)**: Next.js 친화 Auth 라이브러리. 마찬가지로 **패턴만 차용**.
- **Session 테이블**: Lucia 패턴. SHA-256 해시로 DB 저장(DQ-AC-6), `revokedAt` 컬럼 + UNIQUE `tokenFamily` (DQ-AA-8).
- **RBAC (Role-Based Access Control)**: 권한 제어 모델. STAFF / ADMIN / OWNER / GUEST(신규) 역할.
- **Anonymous Role**: 비로그인 접근 역할. DQ-AC-3에서 GUEST 신규 추가 결정.

### 3.6 Auth Advanced (MFA + Rate Limit)

- **TOTP (Time-based One-Time Password)**: 6자리 일회용 패스워드. RFC 6238. otplib 구현.
- **otplib**: TOTP/HOTP Node.js 라이브러리 (MIT). Authenticator 앱 호환.
- **WebAuthn**: 웹 브라우저 공인 표준 인증 API(W3C). 패스키의 기반 프로토콜.
- **Passkey**: WebAuthn + 플랫폼 인증기 결합. 비밀번호 없는 로그인.
- **@simplewebauthn/server & /browser**: WebAuthn 서버/클라이언트 라이브러리 (MIT).
- **FIDO MDS (Metadata Service)**: FIDO Alliance의 인증기 메타데이터 서비스. DQ-AA-3에서 Phase 17 이후 통합.
- **Conditional UI**: WebAuthn의 autofill UI. 지원 브라우저에서 로그인 폼에 자동 표시(DQ-AA-9).
- **Rate Limit**: 요청 빈도 제한. PG `rate_limit_events` 테이블 기반. Redis 미도입.
- **rate-limiter-flexible**: Rate limiting 라이브러리 (MIT). DB/Redis 스토어 지원.
- **Backup Code**: MFA 백업용 일회용 코드. 한 번만 표시, 재생성만 허용(DQ-AA-10).
- **Cloudflare Turnstile**: Cloudflare의 CAPTCHA 서비스 (무료). 로그인 페이지에 적용(DQ-AA-7).

### 3.7 Storage

- **SeaweedFS**: Go 기반 S3 호환 오브젝트 스토리지 (Apache-2.0). 메인 스토리지.
- **Filer + Volume**: SeaweedFS의 2계층 아키텍처. Filer는 메타데이터, Volume은 바이너리.
- **Garage**: Rust 기반 S3 호환 스토리지 (BSD). **조건부 보류** (SeaweedFS 백업안).
- **MinIO**: Go 기반 S3 호환 (AGPL 전환으로 **거부**, ADR-008).
- **SigV4 (Signature Version 4)**: AWS S3 인증 프로토콜. SeaweedFS의 `decideRuntime` 라우팅 기준.
- **Hot / Cold 분리**: Hot 30일은 SeaweedFS, Cold는 B2로 자동 이전.

### 3.8 Edge Functions

- **isolated-vm v6**: V8 격리 VM 라이브러리 (MIT). L1(짧은 JS, cold start 50ms) 런타임.
- **Deno**: TypeScript-first JS 런타임. L2(npm 호환, 긴 수명) 사이드카로 배치.
- **Vercel Sandbox**: Vercel의 원격 실행 환경. L3(고비용/장시간) 선택 경로.
- **decideRuntime()**: 3층 라우팅 함수. 코드 분석 또는 사용자 지정으로 L1/L2/L3 선택.
- **Deno embed**: Deno 런타임을 Node 프로세스에 임베드하는 패턴.
- **workerd**: Cloudflare의 오픈 런타임. DQ-1.5 폐기 대상 (3층에서 흡수).

### 3.9 Realtime

- **wal2json**: PostgreSQL logical replication 확장 (Apache-2.0). CDC 이벤트 JSON 스트리밍.
- **logical replication slot**: PG의 논리 복제 슬롯. wal2json이 소비. DQ-RT-5에서 2개 분리 결정.
- **pgoutput**: wal2json의 경쟁 기본 출력 포맷. 재검토 트리거: JSON 지원 개선 시.
- **supabase-realtime (Elixir→Node 포팅)**: Supabase의 Phoenix Channel 서버. Node.js TypeScript로 포팅.
- **Phoenix Channel**: Elixir Phoenix 프레임워크의 pub/sub 프로토콜. Channel 계층 API 호환.
- **presence / presence_diff**: Phoenix Presence 패턴. 온라인 사용자 추적(DQ-RT-3).
- **pg_notify / pg_listen**: PG의 내장 이벤트 알림. 캐시 버스트 시그널로 사용(DQ-RT-4).
- **ElectricSQL**: 클라이언트 동기화 엔진. **거부**(ADR-010).
- **CDC (Change Data Capture)**: DB 변경 이벤트 캡처 패턴.

### 3.10 Advisors

- **splinter**: Supabase의 PL/pgSQL 38룰 어드바이저. **Node TS 포팅** (ADR-011).
- **squawk**: DDL 안전성 검사기 (MIT). CI 단계에서 PR 차단용.
- **schemalint**: 스키마 정적 컨벤션 검사기(MIT). Layer 1.
- **3-Layer Advisor**: Layer 1(schemalint/정적) + Layer 2(squawk/DDL) + Layer 3(splinter/런타임).
- **pgsql-ast-parser**: PL/pgSQL AST 파서. schemalint 커스텀 룰 unit test에 사용(DQ-ADV-7).

### 3.11 Data API + Integrations

- **PostgREST**: PostgreSQL → REST 자동 생성 도구 (MIT). Supabase Data API의 원형. 방언 80% 호환.
- **pg_graphql**: PG 확장 기반 GraphQL. ADR-016으로 **4 수요 트리거 중 2+** 충족 시 도입.
- **PostGraphile v5**: 별도 Node 서버 기반 GraphQL. **거부**(ADR-012).
- **pgmq (PostgreSQL Message Queue)**: PG 확장 큐 시스템. Outbox 패턴 구현.
- **BullMQ**: Redis 기반 큐 라이브러리. **거부**(DQ-4.3).
- **Persisted Query**: 사전 등록된 GraphQL 쿼리만 허용하는 방식. DoS 방지(DQ-1.25).
- **Outbox 패턴**: 트랜잭션 내에 메시지를 DB에 쓴 뒤 외부로 발송하는 신뢰성 보장 패턴.
- **dead-letter queue**: 처리 실패 메시지 대기열.

### 3.12 Observability + Settings

- **node:crypto**: Node.js 내장 암호화 모듈. AES-256-GCM envelope 구현의 기반.
- **envelope 암호화 (KEK/DEK)**: 2계층 키 암호화 구조. KEK(Key Encryption Key)로 DEK(Data Encryption Key) 암호화.
- **MASTER_KEY**: KEK 역할. 파일 `/etc/luckystyle4u/secrets.env` 저장(0640 root:ypb-runtime).
- **Vault**: 양평의 자체 시크릿 저장소. node:crypto + Prisma `SecretItem` 테이블 기반.
- **JWKS (JSON Web Key Set)**: 공개키 세트를 공개하는 표준. jose 기반.
- **ES256**: ECDSA P-256 + SHA-256 JWT 서명 알고리즘. 양평 JWT 기본.
- **JWKS grace TTL**: 키 회전 시 이전 키 유지 기간. 3분(DQ-12.4).
- **pgsodium**: Supabase의 PG 확장 암호화. **거부** (SUPERUSER + Prisma 비호환, ADR-013).

### 3.13 UX Quality

- **Vercel AI SDK v6**: AI 챗 UI + 스트리밍 라이브러리 (Apache-2.0). UX 카테고리 메인.
- **Anthropic BYOK (Bring Your Own Key)**: 사용자가 Anthropic API 키를 직접 제공하는 방식. 월 비용 제어.
- **useChat()**: AI SDK v6 훅. 챗 상태 관리.
- **mcp-luckystyle4u**: 양평 자체 MCP 서버. Claude Code/Cursor 등 외부 MCP 클라이언트와 호환.
- **MCP (Model Context Protocol)**: Anthropic 표준 도구 프로토콜.
- **LangChain**: 대체 AI 프레임워크. **거부** (33% 무거움, ADR-014).

### 3.14 Operations

- **Capistrano-style**: Ruby 세계의 symlink 기반 배포 방식. PM2와 결합하여 양평 채택(ADR-015).
- **PM2**: Node.js 프로세스 관리자(MIT). cluster:4 모드로 운영.
- **PM2 cluster 모드 vs fork 모드**: cluster는 worker 복제 + 롤링 재시작 지원, fork는 단일 프로세스.
- **canary.stylelucky4u.com**: 카나리 서브도메인. localhost:3002 별도 PM2 앱으로 트래픽 분리.
- **5초 롤백**: symlink을 이전 배포로 되돌리는 수동 롤백 SLA.
- **Graceful Shutdown**: PM2 signal → Node 프로세스 drain + close. 다운타임 0.
- **Docker Compose**: 거부 대안. 이행 트리거 4개 모두 미충족.

---

## 4. 기술 스택 용어

### Next.js 16

**정의**: React 기반 풀스택 프레임워크. App Router + Server Components + Server Actions 아키텍처.
**맥락**: 양평의 단일 코드베이스 기반. DB 접근은 Server Component가 Prisma를 직접 호출(RPC-less).
**관련**: → Server Component, → App Router, → Turbopack
**출처**: AP-4 (`00-system-overview.md §1.2`)

### TypeScript

**정의**: 정적 타입 JavaScript 수퍼셋. 양평 전 코드가 TS strict 모드.
**맥락**: Prisma 7의 DMMF와 AI SDK v6의 타입 스트리밍이 모두 TS 네이티브.

### Tailwind CSS v4

**정의**: 유틸리티-퍼스트 CSS 프레임워크. v4는 CSS 변수 기반 토큰 시스템 대폭 강화.
**맥락**: shadcn/ui의 스타일 엔진.
**관련**: → shadcn/ui

### shadcn/ui

**정의**: 복사/붙여넣기식 React 컴포넌트 모음(MIT). Tailwind + Radix UI 조합.
**맥락**: 양평 UI 기본. 다크 테마 토큰(`--background`, `--foreground`, `--primary` 등) 맞춤.
**출처**: `03-ui-ux/00-design-system.md`

### PostgreSQL 17

**정의**: 오픈소스 관계형 데이터베이스. 현재 안정 버전 17. 향후 18로 업그레이드 예정(DQ-RT-6).
**맥락**: 양평의 메인 DB. `/var/lib/postgresql/17/main` 경로.

### Prisma 7

**정의**: 차세대 TypeScript ORM. DMMF(Data Model Meta Format) 런타임 노출.
**맥락**: 양평 PG 접근의 기본. Prisma 8 업그레이드는 ADR-019(예상).
**관련**: → DMMF, → PostGraphile

### SQLite

**정의**: 임베디드 SQL 데이터베이스. WAL 모드 사용.
**맥락**: 양평의 관측/메타데이터 저장소. 파일 `./data/metrics.sqlite`.
**관련**: → Drizzle ORM

### Drizzle ORM

**정의**: TypeScript-first 경량 ORM. SQLite와 PG 모두 지원.
**맥락**: 양평 SQLite 접근 도구.

### WSL2 Ubuntu

**정의**: Windows Subsystem for Linux v2 + Ubuntu. 양평 배포 환경.
**맥락**: 단일 VM, PM2 + PostgreSQL + SeaweedFS 공존.

### PM2

**정의**: Node.js 프로덕션 프로세스 관리자. cluster 모드로 cluster:4 구성.
**관련**: → cluster 모드, → graceful reload

### Cloudflare Tunnel (cloudflared)

**정의**: Cloudflare의 역방향 터널. WSL2 내부에서 공인 IP 없이 서비스 공개.
**맥락**: 양평의 유일한 외부 진입점. IPv4/IPv6 듀얼스택, QUIC → HTTP/2 fallback.
**출처**: `04-integration/02-cloudflare-deployment-integration.md`

### jose

**정의**: JWT/JWS/JWE/JWK Node.js 라이브러리 (MIT). ES256 서명.
**관련**: → JWT, → JWKS

### node:crypto

**정의**: Node.js 내장 암호화 모듈. AES-256-GCM + SHA-256 + HMAC.
**관련**: → envelope, → MASTER_KEY

### AI SDK v6

**정의**: Vercel의 AI 챗 SDK. 스트리밍 + 도구 사용 + 구조화된 출력.
**관련**: → Anthropic BYOK, → useChat, → MCP

### Monaco

**정의**: VS Code 기반 브라우저 에디터 엔진 (MIT). SQL/RLS 편집기.
**관련**: → Monaco Editor, → CodeMirror 6 (거부된 대안)

### xyflow / elkjs / Recharts

**정의**: 그래프 (xyflow) + 레이아웃 (elkjs) + 차트 (Recharts). ERD · 메트릭 대시보드용.

### Sonner

**정의**: React 토스트 라이브러리(MIT). shadcn/ui 기본 알림.

### TanStack Table v8

**정의**: 헤드리스 테이블 라이브러리. ADR-002.
**관련**: → TanStack Virtual, → 14c-α

---

## 5. OSS / 라이브러리 용어

### SeaweedFS

**정의**: Go 기반 분산 객체 스토리지. S3 호환 API. Apache-2.0.
**출처**: ADR-008

### Garage

**정의**: Rust 기반 S3 호환 스토리지. BSD 3-Clause. 커뮤니티 작음.

### MinIO

**정의**: Go 기반 S3 호환. 2026-02-12 AGPL 전환으로 **본 프로젝트 거부**.
**관련**: → SigV4

### wal2json

**정의**: PostgreSQL logical replication JSON 출력 확장. Apache-2.0.

### ElectricSQL

**정의**: 클라이언트-서버 동기화 엔진. 본 프로젝트 **거부**.

### isolated-vm (v2, v6)

**정의**: V8 격리 VM npm 모듈. Node.js 네이티브 모듈. v6은 Node 24 ABI 대응 버전.

### Deno

**정의**: TypeScript-first JS 런타임. npm 호환성 강화된 2.x.

### pgmq

**정의**: PostgreSQL 확장 기반 메시지 큐.

### pg_graphql

**정의**: PostgreSQL 확장으로 GraphQL 스키마 자동 생성.

### PostGraphile

**정의**: 별도 Node 서버 기반 GraphQL. v5 최신.

### splinter

**정의**: Supabase의 PL/pgSQL 38룰 어드바이저.

### schemalint

**정의**: 스키마 정적 컨벤션 검사기. JS/TS 모두 지원.

### squawk

**정의**: DDL 안전성 검사기. CI에서 PR 차단용.

### wal-g

**정의**: WAL 아카이빙 + PITR 복원 도구. Go. Apache-2.0.

### node-cron

**정의**: Node.js cron 스케줄러.

### Monaco Editor

**정의**: VS Code 코드 에디터의 웹 임베드 버전.

### TanStack Table v8

**정의**: 헤드리스 테이블 라이브러리.

### @xyflow/react

**정의**: React 노드 그래프 렌더링. MIT.

### elkjs

**정의**: Eclipse ELK 그래프 자동 레이아웃의 JS 포팅.

### Recharts

**정의**: React 차트 라이브러리(MIT).

### Sonner

**정의**: React 토스트 라이브러리.

### AI SDK v6

**정의**: Vercel 공식 AI 챗 SDK. Apache-2.0.

### otplib

**정의**: TOTP/HOTP Node 라이브러리.

### @simplewebauthn/server / /browser

**정의**: WebAuthn 서버 / 브라우저 라이브러리 세트. MIT.

### rate-limiter-flexible

**정의**: Node.js rate limiting 라이브러리. DB/Redis 스토어 지원.

### cmdk

**정의**: Command Menu UI 라이브러리. shadcn/ui Combobox 기본 엔진.

### Papa Parse

**정의**: 브라우저/Node 호환 CSV 파서(MIT). ~16KB.

### ua-parser-js

**정의**: User-Agent 파싱 라이브러리. 디바이스 이름 표기 용도.

### pg_cron

**정의**: PG 확장 cron. **거부**(ADR-005).

### pgBackRest

**정의**: 엔터프라이즈 PG 백업 도구. **거부**.

### Redis + BullMQ

**정의**: Redis 기반 큐. Upstash 무료 플랜 가능하나 본 프로젝트 **거부**(DQ-4.3).

### PostgREST

**정의**: PG → REST 자동 생성 (Haskell). 패턴만 참조.

### Auth.js v6 (NextAuth.js)

**정의**: Next.js 친화 Auth. **패턴만 차용**.

### Lucia v4

**정의**: TypeScript 경량 Auth. **패턴만 차용**.

### CodeMirror 6

**정의**: Monaco의 모듈러 대체. **Monaco 선택, 본 프로젝트 미채용**(DQ-3.5).

### drizzle-kit Studio

**정의**: Drizzle 공식 관리 UI. **임베드 거부, 패턴만 흡수**.

### Prisma Studio

**정의**: Prisma 공식 관리 UI. **임베드 거부**(DQ-3.3).

### supabase-studio

**정의**: Supabase 공식 대시보드. Apache-2.0. **패턴만 차용**(ADR-003).

### Capistrano

**정의**: Ruby 커뮤니티 symlink 배포 도구. 양평은 개념만 차용 (실제 Ruby는 미사용).

### @supabase/realtime-js

**정의**: Supabase 공식 Realtime 클라이언트. **미사용**. Presence 패턴만 포팅.

### @supabase/supabase-js

**정의**: Supabase 공식 SDK. **미사용** (AP-4).

### Pino

**정의**: Node.js JSON 구조화 로깅 라이브러리(MIT).

### journalctl

**정의**: systemd 로그 확인 도구.

### Prometheus

**정의**: 시계열 메트릭 수집 시스템. 자체 exporter 경로.

### Sentry / Datadog

**정의**: SaaS APM. **거부** (AP-5).

### Context7 MCP

**정의**: 라이브러리 공식 문서를 LLM에 주입하는 MCP 서버.

---

## 6. 아키텍처 용어

### 9-레이어 아키텍처

**정의**: L0 인프라 → L1 관측/운영 → L2 Auth Core/Vault → L3 Auth Advanced → L4 저장 → L5 Compute → L6 Dev Tools → L7 Data API → L8 UX.
**맥락**: ADR-018에서 확정. 14 카테고리가 레이어별로 매핑.
**출처**: `02-architecture/00-system-overview.md §2`

### 3-Layer Advisor

**정의**: schemalint(정적) + squawk(DDL) + splinter(런타임) 3계층 어드바이저 구조.
**출처**: ADR-011

### 3층 하이브리드 (Edge Fn)

**정의**: isolated-vm(L1) + Deno(L2) + Vercel Sandbox(L3).
**출처**: ADR-009

### 하이브리드 필수형 / 단일 솔루션형

(§2 참조)

### envelope 암호화

**정의**: KEK(루트 키)로 DEK(데이터 키)를 암호화, 실제 데이터는 DEK로 암호화. 2계층 구조.
**관련**: → MASTER_KEY, → node:crypto

### JWKS ES256

**정의**: ES256(ECDSA P-256 + SHA-256) 알고리즘을 사용하는 JWK Set.

### Capistrano-style

(§3.14 참조)

### canary

**정의**: 소수 트래픽을 신규 배포로 돌려 검증하는 배포 패턴. 양평은 서브도메인 시간차 방식.
**관련**: → canary.stylelucky4u.com

### decideRuntime()

**정의**: Edge Function의 L1/L2/L3 라우팅 결정 함수.

### SigV4

**정의**: AWS S3 인증 v4.

### 5 AP 원칙 (AP-1 ~ AP-5)

**정의**: Wave 3 비전의 5가치를 Wave 4에서 아키텍처 원칙으로 변환.
- **AP-1**: 1인 운영 > 수평 확장
- **AP-2**: 데이터 주권 100% (Local-First)
- **AP-3**: Supabase 100점 동등
- **AP-4**: Next.js 네이티브 통합
- **AP-5**: 월 $10 이하

### north star (북극성)

**정의**: 프로젝트의 단일 방향성 기준. 양평의 north star = 비전 슬로건.

### source of truth (단일 진실 소스)

**정의**: 하나의 데이터/결정의 정본 위치. 양평 DB는 PostgreSQL이 SoT.

### single source of truth of decisions

**정의**: 결정의 정본. 양평에서는 ADR Log(`01-adr-log.md`)가 이 역할.

### Server Component / Server Action

**정의**: Next.js 16 App Router의 서버 측 컴포넌트 / 액션.
**관련**: → RPC-less

### RPC-less

**정의**: 명시적 API Route 없이 Server Component가 DB 직접 호출. 타입이 네트워크 경계를 넘지 않고 전달.

### App Router

**정의**: Next.js 16의 파일 기반 라우팅 시스템. `app/` 디렉토리.

### middleware (Next.js)

**정의**: 요청 처리 전 인터셉터. JWT 검증에 사용.

### Outbox 패턴

(§3.11 참조)

### Saga / XA 트랜잭션

**정의**: 분산 트랜잭션 패턴. 양평은 **미사용** (단일 노드 가정).

---

## 7. 보안 용어

### STRIDE

**정의**: Microsoft의 위협 모델링 프레임워크. Spoofing/Tampering/Repudiation/Information Disclosure/Denial of Service/Elevation of Privilege.
**맥락**: Wave 3 `08-security-threat-model.md`가 29 STRIDE 위협 + 자체호스팅 특화 5 위협을 수록.

### RLS (Row-Level Security)

**정의**: PostgreSQL의 행 단위 접근 제어. 양평은 user-level 분리만 사용(Multi-tenancy 제외).

### Vault

(§3.12 참조)

### MASTER_KEY

**정의**: envelope 암호화의 KEK. 파일 `/etc/luckystyle4u/secrets.env` 0640 root:ypb-runtime. PM2 `env_file` 주입.

### KEK (Key Encryption Key)

**정의**: 다른 키를 암호화하는 상위 키. 양평은 MASTER_KEY가 KEK.

### DEK (Data Encryption Key)

**정의**: 실제 데이터를 암호화하는 키. 각 시크릿마다 별도 생성.

### Rate Limit

(§3.6 참조)

### Backup Code

(§3.6 참조)

### Conditional UI

(§3.6 참조)

### revokedAt / tokenFamily

**정의**: JWT refresh token rotation의 식별 컬럼. 동일 family 내 재사용 감지 시 family 전체 무효화.
**출처**: DQ-AA-8

### ua-parser-js

(§5 참조)

### CF-Connecting-IP

**정의**: Cloudflare가 주입하는 실제 클라이언트 IP 헤더. `x-forwarded-for` 대신 신뢰(DQ-AC-5).

### CSRF double-submit

**정의**: CSRF 방어 패턴. 쿠키와 헤더 두 위치에 같은 토큰 제출.

### Reuse Detection (Refresh Token)

**정의**: 이미 사용된 refresh token 재사용 시 family 전체 무효화.

### PII (Personally Identifiable Information)

**정의**: 개인 식별 정보. AI API 호출 전 redact 필수.

### redact

**정의**: 민감 정보 제거/마스킹. AI 요청 파이프라인의 필수 단계.

### OWASP Top 10

**정의**: 웹 보안 최빈 취약점 목록. 양평 NFR-SEC가 참조.

### SUPERUSER (PG)

**정의**: PostgreSQL 최상위 권한. pgsodium이 요구, 양평은 회피.

---

## 8. 운영 용어

### cluster:4

**정의**: PM2 cluster 모드에서 worker 프로세스 4개로 복제.

### RPO (Recovery Point Objective)

**정의**: 복구 시점 목표. 양평 목표 60초 (WAL archive_timeout).

### RTO (Recovery Time Objective)

**정의**: 복구 소요 시간 목표. 양평 목표 30분.

### rolling restart

**정의**: PM2 cluster worker를 1개씩 순차 재시작. 다운타임 0.

### Grace Shutdown (Graceful Shutdown)

**정의**: SIGTERM 시 in-flight 요청 drain 후 종료.

### canary.stylelucky4u.com

**정의**: 양평의 카나리 서브도메인. 포트 3002에서 별도 PM2 앱.

### 5초 롤백

(§3.14 참조)

### DR (Disaster Recovery) 호스트

**정의**: 재해 복구용 이중화 호스트. 현재 **미도입**(DQ-OPS-4).

### SLI / SLO / SLA

**정의**: Service Level Indicator / Objective / Agreement. 관측성 프레임워크.

### BCP (Business Continuity Plan)

**정의**: 사업 연속성 계획. RPO/RTO 기반.

### in-flight request

**정의**: 현재 처리 중인 요청. graceful shutdown 시 drain 대상.

### symlink 배포

**정의**: Capistrano-style 배포 핵심. `current → releases/v123` 링크 교체 = 배포.

### cron-worker

**정의**: node-cron을 단독 실행하는 별도 PM2 앱. cluster 모드 중복 방지용 fork 모드.

### kdyobserve

**정의**: 양평 관측성 자동화 스킬. ADR 재검토 트리거 감시에 활용 예정.

### $10 가드

**정의**: 월 운영비 $10 상한을 자동 감시하는 기능. NFR-COST.1 자동화.

---

## 9. 데이터 용어

### PG 29 테이블 (현재 10 → Wave 4 29)

**정의**: Wave 4에서 확정된 PostgreSQL 테이블 총 수.
**주요 테이블**: User / Folder / File / user_sessions / rate_limit_events / webauthn_credentials / totp_secrets / backup_codes / SecretItem / JwksKey / CronJob / CronJobRun / WebhookDef / WebhookDelivery / pgmq_queues / pgmq_archive / AdvisorFinding / AiThread / AiMessage / Audit / RealtimeSubscription / EdgeFunctionCode / FunctionRun / ERDLayoutPreference / (조건부) pg_graphql 리소스 등.

### SQLite 6 테이블 (현재 3 → Wave 4 6)

**정의**: SQLite 테이블 총 수. 관측/캐시/임시 데이터.
**주요 테이블**: metrics_history / request_audit / ip_allowlist (현재 3) + webauthn_challenges / edge_function_cache / plus_1 (신규 3).

### pg_notify / pg_listen

(§3.9 참조)

### CDC (Change Data Capture)

(§3.9 참조)

### logical replication slot

(§3.9 참조)

### 3-DB 전략

**정의**: PG(트랜잭션/관계) + SQLite(관측/캐시) + SeaweedFS(바이너리) 분할.
**출처**: `02-data-model-erd.md §1`

### source of truth

(§6 참조)

### SQLite WAL 모드

**정의**: Write-Ahead Log 저널 모드. 재시작 내구성.

### VACUUM FULL

**정의**: PG 테이블 재정리 명령. 비용 큰 작업.

### Prisma DMMF

(§3.3 참조)

### snake_case / PascalCase

**정의**: 네이밍 컨벤션. PG는 snake_case, Prisma 모델은 PascalCase. `@map()`로 매핑.

### advisory lock

(§3.4 참조)

### pg_partman

**정의**: PG 파티션 관리 확장. pgmq archive 정리 후보(DQ-1.31).

### PG 10→29

**정의**: 마이그레이션 대상 (신규 19개). Phase별 16-17 파일로 분할.

### SQLite 3→6

**정의**: SQLite 마이그레이션 대상 (신규 3개).

---

## 10. UI/UX 용어

### 3-pane 레이아웃

**정의**: 양평 대시보드의 기본 레이아웃. Sidebar(왼쪽) + Main Content(중앙) + Details Panel(오른쪽 선택).
**출처**: `03-ui-ux/01-layout-navigation.md`

### 다크 테마 (Dark Theme)

**정의**: 양평 기본 UI 테마. Supabase 대시보드 스타일 준용. shadcn/ui dark 토큰.

### Supabase 대시보드 스타일

**정의**: 양평 UI의 준거 스타일. 중성 톤 다크, 그린 액센트, 카드 기반.

### WCAG 2.2 AA

**정의**: Web Content Accessibility Guidelines 2.2, 중급 수준(AA). 양평 NFR-A11Y 목표.

### Sidebar

**정의**: 14 카테고리 네비게이션을 담은 좌측 패널.

### Breadcrumb

**정의**: 페이지 경로를 표시하는 상단 내비게이션.

### Command Palette (Cmd+K)

**정의**: cmdk 기반 검색/명령 실행 팝업. `Ctrl+K` / `Cmd+K`.

### Toast (Sonner)

**정의**: 일시적 알림 UI. Sonner 라이브러리.

### Monaco 테마 vs-dark

**정의**: Monaco Editor의 기본 다크 테마. 양평 채택(DQ-3.14).

### Skeleton

**정의**: 로딩 중 플레이스홀더 UI.

### Geist Sans / Geist Mono / JetBrains Mono

**정의**: 양평 웹폰트 셋. UI=Geist Sans, 코드=Geist Mono / JetBrains Mono.

### Dialog / Sheet / Popover / DropdownMenu

**정의**: shadcn/ui 오버레이 컴포넌트 4종.

---

## 11. 약어 인덱스

| 약어 | 전체 | 카테고리 |
|------|------|---------|
| **ADR** | Architecture Decision Record | 아키텍처 |
| **AGPL** | Affero General Public License | 라이선스 |
| **AI SDK** | Vercel AI SDK | UX |
| **AP** | Architecture Principle (AP-1~5) | 아키텍처 |
| **ASM** | Assumption (Wave 3 가정 목록) | 요구사항 |
| **B2** | Backblaze B2 | 스토리지 |
| **BYOK** | Bring Your Own Key | AI |
| **CDC** | Change Data Capture | Realtime |
| **CF** | Cloudflare | 인프라 |
| **CON** | Constraint (Wave 3 제약 목록) | 요구사항 |
| **CSRF** | Cross-Site Request Forgery | 보안 |
| **DEK** | Data Encryption Key | 보안 |
| **DMMF** | Data Model Meta Format (Prisma) | 데이터 |
| **DQ** | Deferred Question | 방법론 |
| **DR** | Disaster Recovery | 운영 |
| **ERD** | Entity-Relationship Diagram | 데이터 |
| **FIDO** | Fast Identity Online | 보안 |
| **FK** | Foreign Key | 데이터 |
| **FR** | Functional Requirement | 요구사항 |
| **JWKS** | JSON Web Key Set | 보안 |
| **JWT** | JSON Web Token | 보안 |
| **KEK** | Key Encryption Key | 보안 |
| **KMS** | Key Management Service | 보안 |
| **MCP** | Model Context Protocol (Anthropic) | AI |
| **MDS** | Metadata Service (FIDO) | 보안 |
| **MFA** | Multi-Factor Authentication | 보안 |
| **MVP** | Minimum Viable Product | 방법론 |
| **NFR** | Non-Functional Requirement | 요구사항 |
| **OTP** | One-Time Password | 보안 |
| **PII** | Personally Identifiable Information | 보안 |
| **PITR** | Point-In-Time Recovery | 운영 |
| **RBAC** | Role-Based Access Control | 보안 |
| **RLS** | Row-Level Security | 데이터/보안 |
| **RPO** | Recovery Point Objective | 운영 |
| **RTO** | Recovery Time Objective | 운영 |
| **SLA** | Service Level Agreement | 운영 |
| **SLI** | Service Level Indicator | 운영 |
| **SLO** | Service Level Objective | 운영 |
| **SoT** | Source of Truth | 아키텍처 |
| **STRIDE** | Spoofing/Tampering/... 위협 모델 | 보안 |
| **TCO** | Total Cost of Ownership | 비용 |
| **TD** | Technical Debt | 로드맵 |
| **TLS** | Transport Layer Security | 보안 |
| **TOTP** | Time-based One-Time Password | 보안 |
| **TTL** | Time To Live | 운영 |
| **WAL** | Write-Ahead Log | 데이터 |
| **WCAG** | Web Content Accessibility Guidelines | UX |
| **WS** | WebSocket | Realtime |
| **XA** | X/Open Distributed Transaction | 아키텍처 |

---

## 12. 용어 간 관계 그래프

### 12.1 보안 용어 관계

```
MASTER_KEY (KEK)
    │ 암호화
    ▼
 DEK (per-secret)
    │ 암호화
    ▼
SecretItem (Vault)
    │ 참조
    ▼
  Vault (node:crypto envelope)

JWT (ES256)
    │ 서명/검증
    ▼
 JWKS (jose)
    │ 공개
    ▼
/.well-known/jwks.json
    │ grace TTL 3분
    ▼
revokedAt / tokenFamily
    │
    ▼
 Session 테이블 (Lucia 패턴)
```

### 12.2 Realtime 2계층 관계

```
PG (변경 발생)
    │
    ▼
 wal2json (CDC 캡처, Slot 1)
    │
    ▼
내부 이벤트 버스
    │
    ▼
supabase-realtime 포팅 (Channel, Slot 2)
    │
    ▼
presence / presence_diff
    │
    ▼
클라이언트 (WebSocket)
```

### 12.3 Edge Functions 3층 관계

```
Request
    │
    ▼
decideRuntime()
    │
    ├── L1 isolated-vm v6 (짧은 JS, 50ms cold start)
    ├── L2 Deno 사이드카 (npm 호환, 긴 수명)
    └── L3 Vercel Sandbox 위임 (고비용 장시간)
```

### 12.4 Advisors 3-Layer 관계

```
[정적]
schemalint (TS 포팅, 컨벤션)
    │
    ▼
[DDL 단계]
squawk (CI PR 차단)
    │
    ▼
[런타임]
splinter (Node TS 포팅, 38룰)
```

### 12.5 배포 파이프라인 관계

```
GitHub Actions
    │
    ▼
빌드 (Turbopack)
    │
    ▼
WSL2 rsync
    │
    ▼
Capistrano-style symlink
    │
    ▼
PM2 cluster:4 (graceful reload)
    │
    ├── stylelucky4u.com (프로덕션, port 3000)
    └── canary.stylelucky4u.com (카나리, port 3002)
```

### 12.6 Wave 1 Compound Knowledge 분류

```
14 카테고리
    │
    ├── 하이브리드 필수형 (9)
    │   ├── Table Editor (TanStack + 자체)
    │   ├── SQL Editor (supabase-studio 패턴)
    │   ├── Schema Viz (schemalint + 자체 RLS)
    │   ├── Auth Core (jose + Lucia/Auth.js 패턴 15)
    │   ├── Auth Advanced (TOTP + WebAuthn + RL)
    │   ├── Edge Fn (3층 하이브리드)
    │   ├── Realtime (wal2json + supabase-realtime 포팅)
    │   ├── Data API (REST + pgmq + (조건부) pg_graphql)
    │   └── Advisors (3-Layer)
    │
    └── 단일 솔루션형 (5)
        ├── Storage (SeaweedFS)
        ├── DB Ops (node-cron + wal-g)
        ├── Observability (node:crypto envelope)
        ├── UX Quality (AI SDK v6)
        └── Operations (Capistrano-style)
```

### 12.7 Phase 15-22 → ADR 매핑

```
Phase 15 (Auth Advanced 22h) → ADR-007
Phase 16 (Obs+Ops 40h)       → ADR-013, ADR-015
Phase 17 (Auth Core+Storage) → ADR-006, ADR-008, ADR-017
Phase 18 (SQL+Table 400h)    → ADR-002, ADR-003
Phase 19 (Edge+Realtime 75h) → ADR-009, ADR-010
Phase 20 (Schema+DBOps+Adv)  → ADR-004, ADR-005, ADR-011
Phase 21 (Data API+UX 40h)   → ADR-012, ADR-014, ADR-016
Phase 22 (통합)              → ADR-018 재검토
```

---

> 용어집 끝. 200+ 항목 · Wave 1-5 통합 인덱스.
> 다음 문서: [02-dq-final-resolution.md](./02-dq-final-resolution.md) (DQ 64건 전수 최종 답변).
