# 00. 시스템 개요 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](./01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 4 · Tier 1 (A1) 산출물 — kdywave W4-A1 (Agent Architecture-1)
> 작성일: 2026-04-18 (세션 27/28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 참조: [README.md](../README.md) · [_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md) · [00-vision/](../00-vision/)

---

## 목차

- [0. 문서 목적 및 사용법](#0-문서-목적-및-사용법)
- [1. 시스템 비전 및 원칙](#1-시스템-비전-및-원칙)
- [2. 레이어드 아키텍처 다이어그램](#2-레이어드-아키텍처-다이어그램)
- [3. 14 카테고리 지도](#3-14-카테고리-지도)
- [4. 공통 횡단 관심사 (Cross-cutting Concerns)](#4-공통-횡단-관심사-cross-cutting-concerns)
- [5. 배포 토폴로지 다이어그램](#5-배포-토폴로지-다이어그램)
- [6. NFR 매핑 테이블](#6-nfr-매핑-테이블)
- [7. 역방향 피드백 대비](#7-역방향-피드백-대비)
- [부록 Z. 근거 인덱스](#부록-z-근거-인덱스)

---

## 0. 문서 목적 및 사용법

### 0.1 이 문서의 역할

본 문서(System Overview)는 Wave 4 "카테고리별 아키텍처 청사진"의 **마스터 지도**다. Tier 2(B1~B7)가 작성할 14 카테고리 Blueprint, Tier 3(U1/I1/I2)가 작성할 UI/UX 5 문서 + Integration 4 문서가 모두 이 지도를 공통 참조 기준점으로 삼는다. 이 문서는 "무엇을 만들 것인가"(FR)와 "어떻게 만들 것인가"(Blueprint) 사이에 위치하는 **전체 구조의 단일 진실 소스(Single Source of Truth for Architecture)** 다.

### 0.2 문서 간 관계

```
[Wave 3 입력]
  00-product-vision.md        (비전 · 가치 5 · 원칙 7)
  02-functional-requirements  (FR 55개)
  03-non-functional-requirements (NFR 38개)
  04-constraints-assumptions  (CON 12 · ASM 12)
  09-multi-tenancy-decision    (ADR-001)
  10-14-categories-priority    (Phase 15-22 매핑)
         │
         ▼
[Wave 4 Tier 1 — 지금 이 세 문서]
  00-system-overview.md        ← 전체 지도 (이 문서)
  01-adr-log.md                ← 누적 의사결정 로그
  02-data-model-erd.md         ← PG + SQLite 통합 ERD
         │
         ▼
[Wave 4 Tier 2/3 — 다음 에이전트]
  02-architecture/03~17 (14 카테고리 Blueprint)
  03-ui-ux/00~04       (디자인 시스템 등 5개)
  04-integration/00~03 (Cloudflare, PG 확장, 외부 서비스)
         │
         ▼
[Wave 5]
  05-roadmap/          (Phase 15~22 정밀 로드맵)
  06-prototyping/      (스파이크 N건)
```

### 0.3 이 문서의 독자

| 독자 | 이 문서 사용 방법 |
|------|------------------|
| **Tier 2 B1~B7 에이전트 (Blueprint 작성자)** | §3에서 자신이 담당할 카테고리의 레이어/Phase/DQ를 확인 → §2 레이어 위치에서 자신이 구축할 컴포넌트의 상·하위 의존성 확인 → §4 횡단 관심사(로깅/에러/감사)를 Blueprint 내부에 반드시 반영 |
| **Tier 3 U1 에이전트 (UI/UX 작성자)** | §2 L8 UX 레이어 + §4 "국제화·키보드 단축키" → 디자인 시스템의 공통 원칙으로 사용 |
| **Tier 3 I1/I2 에이전트 (Integration)** | §5 배포 토폴로지 + §4 "설정 관리" → Cloudflare Tunnel + WSL2 환경 연동 전제 |
| **Wave 5 Roadmap 작성자** | §3 Phase 매핑 + §6 NFR 매핑 → 시간순 구현 순서 + NFR 충족 시점 결정 |
| **구현 단계 개발자 (미래의 김도영)** | 새 기능 추가 시 "이게 어느 레이어에 속하는가"를 §2에서 확인 → 영향 범위·의존성 판단 |

### 0.4 문서 사용 규칙

1. **최상위 기준점**: 이 문서가 Blueprint와 충돌하면 **이 문서가 우선**. Blueprint에서 이 문서의 원칙을 변경하고자 하면 §7 역방향 피드백 절차 수행.
2. **갱신 권한**: Wave 4 Tier 1이 초안 작성. 이후 변경은 §7 절차 + ADR 등록 필수.
3. **인용 의무**: Blueprint 각 섹션에서 이 문서의 어느 §를 근거로 하는지 명시 (예: "본 섹션은 `00-system-overview.md §2 L4`를 따른다").

---

## 1. 시스템 비전 및 원칙

### 1.1 비전 선언 (Wave 3 V1 인용)

Wave 3 `00-product-vision.md §A1.1`에서 확정한 한 문장 슬로건을 아키텍처의 북극성(north star)으로 삼는다:

> "양평 부엌 서버 대시보드는 1인 개발자/운영자가 Supabase Cloud 의존과 월 수십 달러의 과금 부담·데이터 주권 상실 문제를 Next.js 16 네이티브 통합 + 자체호스팅 100점 동등성 + 월 운영비 $10 이하라는 가치로 해결하는 자체호스팅 관리형 백엔드 대시보드이다."

아키텍처의 모든 결정은 이 문장의 5가지 가치에 구속된다: (1) 1인 운영, (2) Supabase 100점 동등, (3) $10/월 이하, (4) 데이터 주권 100%, (5) Next.js 네이티브 통합. 아래 §1.2에서 이 5가치를 **아키텍처 원칙**으로 번역한다.

<출처: `00-vision/00-product-vision.md §A1.1`, `A1.2`, `A4.1~A4.5`>

### 1.2 아키텍처 원칙 5개 (핵심 가치 → 설계 제약 변환)

#### AP-1. 1인 운영 가능성 > 수평 확장성

**가치**: 1인 운영 (Wave 3 §A4 #4)

**설계 제약**:
- 단일 WSL2 서버 + PM2 cluster:4 고정 (CON-1)
- 쿠버네티스/도커 컴포즈 여러 컨테이너 **금지** — Supabase Self-Hosted가 실패한 지점
- 컴포넌트 추가는 "프로세스 1개 + 설정 1파일" 패턴을 따라야 한다 (PostgreSQL, SeaweedFS, cloudflared 3개가 이 패턴)
- 모든 배포는 `/ypserver prod` 한 명령으로 완결 (Wave 3 A6-12M-10 "주당 ≤ 1시간 운영")

**함의**:
- 분산 시스템 고려(CAP theorem, eventual consistency, leader election) → **적용 안 함**. 단일 노드 가정이 설계를 극단적으로 단순화한다.
- 서비스 간 통신은 IPC/로컬 TCP/로컬 HTTP만. 네트워크 파티션 시나리오는 논외.
- 데이터 일관성은 PostgreSQL 트랜잭션과 SQLite WAL로만 보장. 분산 트랜잭션(XA, Saga) 불필요.

<출처: Wave 3 `00-product-vision.md §A7-P4`, `04-constraints-assumptions.md CON-1, CON-3`>

#### AP-2. 데이터 주권 100% — 로컬 우선 (Local-First)

**가치**: 데이터 주권 100% (Wave 3 §A4 #1)

**설계 제약**:
- Primary storage 전부 로컬 디스크: PostgreSQL(`/var/lib/postgresql/17/main`), SeaweedFS(`/opt/seaweedfs/vol`), SQLite(`./data/metrics.sqlite`)
- 외부 클라우드 전송은 **엄격히 2가지만**: (a) Cloudflare Tunnel HTTPS 전송(TLS 암호화), (b) B2 백업(AES-256-GCM envelope 암호화 후 PUT)
- JWT 서명 키, Vault MASTER_KEY, bcrypt salt 모두 로컬 파일시스템(`/etc/luckystyle4u/secrets.env` 0640 root:ypb-runtime) — Cloud KMS/AWS Secrets Manager 호출 0회
- AI API 호출 시 PII/시크릿 redact 파이프라인 필수 (NFR-SEC CON-12 개인정보보호법)

**함의**:
- "캐시는 Cloudflare Edge에 두면 빠르다" → **거절**. PII 포함 가능성 있는 응답은 Edge 캐싱 금지. `Cache-Control: private, no-store` 기본값.
- 관측 데이터(Prometheus/Grafana)도 로컬. Datadog/Sentry SaaS 거절.
- AI Assistant(Wave 3 §A4 #5)는 Anthropic API를 호출하지만 `mcp-luckystyle4u`가 스키마 요약·redact 계층을 강제.

<출처: Wave 3 `00-product-vision.md §A4.1`, `04-constraints-assumptions.md CON-12`, Wave 2 Observability 결론>

#### AP-3. Supabase 100점 동등성 — 기능 커버리지 95% + 양평 5% 특화

**가치**: Supabase 동등 기능 100점 (Wave 3 §A4 #2, `05-100점-definition.md §1.1`)

**설계 제약**:
- 14 카테고리 각각이 Supabase Cloud 2025 기능의 95% 커버
- 양평 특화 5%: 한국어 UI 1등급, Cloudflare Tunnel 친화, Multi-tenancy 제거로 얻는 UX 단순화
- **"단일 OSS로 100점 불가 → 하이브리드 필수형 9"**와 **"단일 채택 + 보조 1개로 90+ 도달 → 단일 솔루션형 5"** 분류를 Blueprint 구조 축으로 사용 (Wave 1 Compound Knowledge 패턴 1)
- API 호환성: PostgREST 방언 URL 기본 지원률 80% (NFR-CMP.1). Supabase 클라이언트(`@supabase/supabase-js`)의 **읽기 경로** 이식성 확보

**함의**:
- 신기능 추가 시 "Supabase Cloud에 있는가?" 질문 필수. 없다면 → 양평 특화 5% 범위 내인지 검증.
- Blueprint 각각에 "Supabase 동등 매핑 표" 섹션 포함 필수.

<출처: Wave 3 `00-product-vision.md §A4.2`, `05-100점-definition.md §1.1~§1.4`>

#### AP-4. Next.js 16 네이티브 통합 — 외부 SDK 최소화

**가치**: Next.js 통합 (Wave 3 §A4 #5)

**설계 제약**:
- 단일 Next.js 16 앱 (App Router) + 단일 `package.json` — 모노레포 분할 금지 (NFR-MNT.1)
- DB 접근: Prisma 7 Server Component 직접 호출. `@supabase/supabase-js` **사용 안 함**
- Auth 쿠키: jose `jwtVerify()` + Next.js middleware. `@supabase/auth-helpers-nextjs` **사용 안 함**
- Realtime: Next.js Route Handler SSE (wal2json → broadcast). `@supabase/realtime-js` **사용 안 함**
- Storage: Next.js API Route + SeaweedFS HTTP. `@supabase/storage-js` **사용 안 함**
- 허용되는 외부 npm SDK: AI SDK v6 (Anthropic BYOK), isolated-vm, simplewebauthn/server, otplib, wal-g CLI 래퍼. 그 외는 ADR 검토 필요.

**함의**:
- Server Component가 Prisma 호출 → TypeScript strict + 타입 추론이 클라이언트까지 전달 (RPC-less)
- API Route는 외부 노출 전용 (PostgREST 호환 REST). 내부 사용은 Server Action/Component 직접 호출.
- 서버 사이드에서만 Prisma 사용. 클라이언트 번들에 Prisma 포함 금지 (`"use server"` 명시).

<출처: Wave 3 `00-product-vision.md §A4.5`, Wave 2 F Data API 결론>

#### AP-5. 월 $10 이하 운영 — 비용 우선 아키텍처

**가치**: 월 운영비 $10 이하 (Wave 3 §A4 #3)

**설계 제약**:
- 정기 비용 항목 화이트리스트: 도메인($1/월), B2 백업($0.3/월), AI BYOK($2.5/월), 전기료(산입 제외) — 합 $4/월, 여유 $6 (NFR-COST.1)
- SaaS 의존성 추가 시 ADR + 비용 시나리오 필수. AWS/GCP 관리형 서비스 **금지**.
- AI 라우팅: Haiku 우선, Sonnet 승격은 복잡도 ≥ 4 조건만 (AP-5와 kdyllmcost 스킬 원칙 일치, NFR-COST.2)
- Cloudflare 무료 플랜 내 유지 (ASM-8). 트래픽 폭증 조기 경보 기준 월 50만 요청.

**함의**:
- "캐싱 레이어 Redis 추가하자" → 거절. PostgreSQL `UNLOGGED TABLE` 또는 SQLite로 대체.
- "OpenTelemetry + Tempo + Loki 전체 스택" → 거절. Pino JSON 구조화 로그 + PM2 logs + journalctl 조합.
- AI 응답은 세션 종료 시 휘발 (DQ 답변: "AI 응답 영구 저장 금지") — 디스크 공간/비용 모두 절감.

<출처: Wave 3 `00-product-vision.md §A4.3`, `03-non-functional-requirements.md NFR-COST.1~2`>

### 1.3 원칙 간 충돌 해결 우선순위

실무에서 원칙이 충돌할 때 적용하는 우선순위 (Wave 3 `00-product-vision.md §A7` 원칙 7개와 정합):

```
1. AP-1 (1인 운영 가능성)      ← 최상위
2. AP-2 (데이터 주권)          ← 법적 요구
3. AP-5 (비용)                  ← 프로젝트 지속성
4. AP-3 (100점 동등)            ← 기능 목표
5. AP-4 (Next.js 네이티브)      ← 구현 편의 (타협 가능)
```

예시 1: "Deno 사이드카 도입이 Next.js 네이티브와 충돌" → AP-4보다 AP-3 우선 (Supabase Edge Function parity). Deno 사이드카는 별도 프로세스로 도입하되, 라우팅은 Next.js `decideRuntime()`이 일원화 (AP-4 부분 준수).

예시 2: "Kubernetes 도입하면 수평 확장 가능" → AP-1 위배 (1인 운영 부담). AP-3 100점 달성에 불필요. **거절**.

예시 3: "Datadog APM 도입으로 관측성 95점" → AP-5(월 $30) 위배. 자체 node:crypto + Pino + Prometheus로 대체.

---

## 2. 레이어드 아키텍처 다이어그램

### 2.1 9-레이어 구조 개요

양평 대시보드는 아래에서 위로 9개 레이어로 구성된다. **하위 레이어는 상위 레이어의 의존 대상**이며, 역방향 의존(상위→하위)은 금지된다. 같은 레이어 내 수평 의존은 허용 (예: L4 PostgreSQL과 L4 SQLite는 동시 사용 가능).

```
┌────────────────────────────────────────────────────────────────────────┐
│ L8. UX 레이어 (UX Quality · 카테고리 13)                                 │
│    AI SDK v6 + Anthropic BYOK + mcp-luckystyle4u (자체 MCP)              │
│    shadcn/ui 다크 테마 + 한국어 i18n + Ctrl+K 명령 팔레트                │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ 호출
┌────────────────────────────────────────────────────────────────────────┐
│ L7. 통합 계층 (Data API · 카테고리 11)                                   │
│    REST (PostgREST 호환) + pgmq 큐 + Webhook Outbox                      │
│    [조건부] pg_graphql (4 수요 트리거 중 2+ 시 도입)                     │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ 호출
┌────────────────────────────────────────────────────────────────────────┐
│ L6. 개발자 도구 (카테고리 1, 2, 3, 10)                                    │
│    SQL Editor (Monaco + supabase-studio 패턴)                            │
│    Table Editor (TanStack v8 + 14c-α)                                    │
│    Schema Visualizer (schemalint + xyflow/elkjs + 자체 RLS Monaco)       │
│    Advisors 3-Layer (schemalint + squawk + splinter Node 포팅)           │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ 호출
┌────────────────────────────────────────────────────────────────────────┐
│ L5. Compute 계층 (Edge Fn · 카테고리 8, Realtime · 카테고리 9)           │
│    Edge Functions 3층 하이브리드:                                         │
│       - L1: isolated-vm v6 (짧은 JS 스니펫)                              │
│       - L2: Deno 사이드카 (npm 호환 + 긴 수명)                           │
│       - L3: Vercel Sandbox 위임 (고비용 장시간, 선택)                    │
│    Realtime 2계층:                                                        │
│       - CDC: wal2json → Node consumer                                     │
│       - Channel: supabase-realtime 포팅 (broadcast/presence)             │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ 읽기/쓰기
┌────────────────────────────────────────────────────────────────────────┐
│ L4. 데이터 저장 계층 (Storage · 카테고리 7, DB Ops · 카테고리 4)         │
│    PostgreSQL 17 (Prisma 7 ORM, 기본 DB)                                  │
│       확장: wal2json, pgmq, [조건부] pg_graphql                          │
│    SQLite (Drizzle ORM, 관측·메타데이터 · 로컬 캐시)                     │
│    SeaweedFS (파일/객체 저장, S3 호환)                                    │
│    B2 백업 (AES-256-GCM envelope, off-site, wal-g)                       │
│    node-cron (DB Ops 스케줄), wal-g (PITR)                               │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ 인증 컨텍스트
┌────────────────────────────────────────────────────────────────────────┐
│ L3. 보안 고급 (Auth Advanced · 카테고리 6)                               │
│    TOTP (otplib) + WebAuthn (@simplewebauthn/server)                     │
│    Rate Limit (DB counter table, Redis 미사용)                           │
│    [조건부] OAuth Providers (Phase 18+), Cloudflare Turnstile            │
│    MFA 백업 코드 (8개 일회용)                                             │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ JWT 검증
┌────────────────────────────────────────────────────────────────────────┐
│ L2. 보안 기반 (Auth Core · 카테고리 5, Vault · 카테고리 12 일부)         │
│    jose JWT ES256 + JWKS 엔드포인트 (.well-known/jwks.json)              │
│    bcrypt 패스워드 해시 (argon2 이주는 CON-10 장기 로드맵)                │
│    세션 테이블 + Refresh Token (Lucia/Auth.js 패턴 15개 차용)            │
│    Vault (node:crypto AES-256-GCM envelope, KEK→DEK)                     │
│    MASTER_KEY = /etc/luckystyle4u/secrets.env (DQ-12.3 확정)             │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ 로깅/메트릭
┌────────────────────────────────────────────────────────────────────────┐
│ L1. 관측 & 운영 계층 (Observability · 카테고리 12, Operations · 14)      │
│    Pino 구조화 JSON 로그 → PM2 logs → WSL2 journalctl                    │
│    Prometheus + Grafana (로컬, 메트릭 + 알림)                             │
│    Capistrano-style symlink 배포 + canary.stylelucky4u.com 카나리         │
│    /ypserver prod 단일 명령 파이프라인 (Win build → rsync → migrate)     │
│    PM2 cluster:4 + ecosystem.config.js                                    │
└────────────────────────────────────────────────────────────────────────┘
                     ▲ 실행
┌────────────────────────────────────────────────────────────────────────┐
│ L0. 인프라 계층                                                           │
│    Cloudflare Tunnel (cloudflared, 인바운드 HTTPS only)                   │
│    WSL2 Ubuntu 22.04 LTS (x86_64)                                         │
│    Node.js 24 LTS + Next.js 16 + React 19                                 │
│    UFW (외부 3000/tcp 차단)                                               │
│    systemd units (postgresql, seaweedfs, cloudflared)                     │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 레이어별 책임 및 채택 기술 상세

#### L0. 인프라 계층

**책임**: 프로세스/네트워크/OS 레벨. "이 애플리케이션이 어디서 어떻게 실행되는가"의 외부 경계.

**구성 요소**:
- **Cloudflare Tunnel** (cloudflared 2024+): 공용 IP 없이 HTTPS 인바운드. DDoS/WAF/Bot Management 전부 Cloudflare 엣지에서 종결. 실 클라이언트 IP는 `CF-Connecting-IP` 헤더.
- **WSL2 Ubuntu 22.04 LTS**: 단일 인스턴스. Windows 11 호스트에서 실행. ext4 파일시스템, 리눅스 커널 5.15+.
- **Node.js 24 LTS**: `package.json engines.node` 강제. 이전 버전 설치 시 실패.
- **UFW**: 외부 인바운드 3000/tcp 차단. localhost만 바인딩.
- **systemd**: `postgresql@17-main.service`, `seaweedfs.service`, `cloudflared.service`.

**Wave 2 G Operations 결정**: Docker 이행 조건 0개 충족 → 네이티브 프로세스 유지.

<출처: `01-research/14-operations/*.md`, `04-constraints-assumptions.md CON-1, CON-2, CON-6, NFR-CMP.3, NFR-CMP.4`>

#### L1. 관측 & 운영 계층

**책임**: 시스템 상태의 가시성(visibility) + 배포·운영 자동화.

**구성 요소**:
- **Pino** (구조화 JSON 로그): 모든 Next.js 라우트 + Edge Fn + CronJob에서 단일 로거 인스턴스 사용. 출력 스트림은 stdout → PM2 로그 로테이션.
- **PM2 ecosystem.config.js**: `cluster:4` 워커, `max_memory_restart: 500M`, `autorestart: true`. `pm2 logs --json --raw`로 JSON 파이프.
- **Prometheus** (로컬, 9090 포트 localhost 바인딩 + PM2 exporter): `pm2_restart_count`, `http_request_duration_seconds`, `queue_lag_seconds` 등 골든 시그널.
- **Grafana** (로컬, 3001 포트): Prometheus 데이터 소스, 3 대시보드 (시스템/앱/쿼리).
- **Capistrano-style symlink 배포**: `/srv/luckystyle4u/releases/YYYYMMDDHHMMSS/` 아래 빌드 → `/srv/luckystyle4u/current` 심링크 스왑 → PM2 reload. 롤백은 symlink 되돌리기(5초).
- **canary.stylelucky4u.com**: 카나리 서브도메인. 신 버전 30분 검증 후 production으로 승격.

**Wave 2 G Operations 스코어 89.0점**: 롤백 5초, 다운타임 0초.

<출처: `01-research/12-observability/*.md`, `01-research/14-operations/*.md`, Wave 2 F/G, NFR-REL.3~4>

#### L2. 보안 기반 (Auth Core + Vault)

**책임**: 인증 주체(subject) 식별 + 시크릿 저장. 모든 상위 레이어가 신뢰할 수 있는 "누가 요청했는가"를 확립.

**구성 요소**:
- **jose JWT ES256**: P-256 ECDSA 서명. `.well-known/jwks.json` 공개, 키 2개 병렬 노출(current + next), 24시간 rotate. `iss=stylelucky4u.com`.
- **JWKS endpoint** (Next.js Route `/auth/.well-known/jwks.json`): Cloudflare Edge에서 10분 캐싱(`Cache-Control: public, max-age=600`).
- **bcrypt 패스워드 해시**: cost 12. argon2 교체는 CON-10 장기 로드맵.
- **세션 테이블** (`user_sessions`): UUID ID는 SHA-256 해시 저장(DQ-AC-6). `revokedAt`, `deviceInfo`, `ipHash`, `lastSeenAt` 컬럼.
- **Refresh Token**: 30일 만료, 회전 시 예전 토큰 즉시 무효화(Reuse Detection).
- **Vault**: `vault_secrets` 테이블 (PostgreSQL), AES-256-GCM envelope 암호화. Per-secret unique DEK, MASTER_KEY가 KEK.
- **MASTER_KEY**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640 mode). PM2 `env_file`로만 주입. DQ-12.3 확정.

**Wave 2 C Auth Core 스코어 4.08/5**. Lucia/Auth.js 패턴 15개 차용, 라이브러리 미채용.

<출처: `01-research/05-auth-core/*.md`, `01-research/12-observability/*.md`, Wave 2 C/F, NFR-SEC.1, NFR-SEC.2, DQ-12.3, DQ-AC-6, DQ-AC-10>

#### L3. 보안 고급 (Auth Advanced)

**책임**: 인증 강화 (MFA, Rate Limit, 봇 방어). Auth Core가 "누구인가"를 확립한 후 "정말 맞는가 + 악의적 시도 아닌가"를 검증.

**구성 요소**:
- **TOTP** (otplib): 30초 윈도우, 시계 드리프트 ±30s 허용. 시드는 Vault에 저장(Per-user).
- **WebAuthn** (@simplewebauthn/server + /browser): `rpID=stylelucky4u.com`, `origin=https://stylelucky4u.com`. Challenge는 `mfa_challenge_cache` SQLite 테이블(TTL 60s, 1회성 DQ-AA-2).
- **Rate Limit**: DB counter `rate_limit_events` 테이블. 기본 100 req/min/IP, `/login` 10 req/min/IP. 초과 시 429 응답 ≤ 10ms (NFR-SEC.4).
- **MFA 백업 코드**: 8개 일회용, SHA-256 해시 저장, 사용 시 소거.
- **Admin MFA 강제**: role=admin 계정은 TOTP 또는 WebAuthn 중 최소 1개 활성 필수. 모두 비활성 시 로그인 403 차단 (NFR-SEC.3).

**Wave 2 C Auth Advanced 스코어 4.59/5**. TOTP+WebAuthn+RL 전부 동시 채택 (Phase 15~17 22h).

<출처: `01-research/06-auth-advanced/*.md`, Wave 2 C, NFR-SEC.3, NFR-SEC.4, DQ-AA-2>

#### L4. 데이터 저장 계층

**책임**: 영속성. 트랜잭션성/관계성은 PostgreSQL, 휘발성/단순 KV는 SQLite, 바이너리는 SeaweedFS.

**구성 요소**:
- **PostgreSQL 17** (`/var/lib/postgresql/17/main`): 기본 DB. Prisma 7 ORM. 확장: `wal2json` (Realtime CDC), `pgmq` (Job Queue), `[조건부] pg_graphql`. `archive_command`로 WAL 세그먼트를 60초 주기 B2 업로드 (RPO 60s, NFR-REL.1).
- **SQLite** (Drizzle ORM, `./data/metrics.sqlite`): 현재 3 테이블(`audit_logs`, `metrics_history`, `ip_whitelist`). Wave 4 확장 예정(`cache_runtime_events`, `mfa_challenge_cache` 등).
- **SeaweedFS** (`/opt/seaweedfs`, filer + volume 1노드): S3 호환 API, 권장 상한 50GB. Apache-2.0 라이선스.
- **B2** (Backblaze, off-site 백업): `wal-g` CLI가 base backup + WAL 세그먼트를 envelope 암호화 후 업로드. 월 $0.3 미만(< 50GB).
- **node-cron**: Node 내부 cron 스케줄러. 단일 인스턴스 (PM2 fork 모드). pg_cron은 1인 환경 과한 의존으로 거부 (Wave 1 패턴 3).

**Wave 2 B/D 결정**: node-cron + wal-g 4.36/5, SeaweedFS 4.25/5 단독.

<출처: `01-research/04-db-ops/*.md`, `01-research/07-storage/*.md`, Wave 2 B/D, NFR-REL.1, NFR-PERF.6, CON-11>

#### L5. Compute 계층 (Edge Fn + Realtime)

**책임**: 사용자 정의 코드 실행 + 실시간 데이터 구독.

**구성 요소 — Edge Functions 3층**:
- **L1: isolated-vm v6**: 짧은 JS 스니펫 (< 5s, 50MB 메모리, npm 미지원). Cold start < 50ms 목표(NFR-PERF.4).
- **L2: Deno 사이드카**: `deno run` 별도 프로세스. npm 호환(`node:` specifier), 긴 수명(> 5s), 사용자 코드 격리.
- **L3: Vercel Sandbox 위임** (선택적, Phase 22+): 고비용/장시간 작업 (예: 이미지 변환 100MB+). 비용 가드 필수.
- **Router `decideRuntime()`**: 사용자 지정 런타임 또는 자동 판정(코드 분석 → 레이어 결정).

**구성 요소 — Realtime 2계층**:
- **CDC 계층 (wal2json)**: PostgreSQL logical replication slot → wal2json → Node consumer. `realtime_events` 브로드캐스트 버스.
- **Channel 계층 (supabase-realtime 포팅)**: 클라이언트 구독 관리. `supabase.channel().on('postgres_changes', ...)` 호환 API. 백프레셔, 재연결, 클라이언트별 메시지 quota.

**Wave 2 D/E 결정**: Edge Fn 4.22/5 (3층 하이브리드), Realtime 4.05/5 (wal2json + supabase-realtime 포팅).

<출처: `01-research/08-edge-functions/*.md`, `01-research/09-realtime/*.md`, Wave 2 D/E, ASM-5, ASM-6>

#### L6. 개발자 도구 계층

**책임**: 운영자(김도영)가 DB를 관리하는 통합 GUI.

**구성 요소**:
- **SQL Editor** (Monaco + supabase-studio 패턴): 멀티탭, 자동완성, EXPLAIN Visualizer, AI Assist (BYOK), Savepoint DRY-RUN.
- **Table Editor** (TanStack v8 + 14c-α): 서버 페이지네이션, Inline edit(낙관적 업데이트), 복합 필터, RLS UI(14c-β).
- **Schema Visualizer** (xyflow + elkjs + schemalint + 자체 RLS): ERD 자동 생성, `/database/{policies,functions,triggers}` 신설.
- **Advisors 3-Layer**: schemalint(컨벤션) + squawk(DDL 위험) + splinter Node 포팅(38룰 런타임).

**Wave 2 A/B/E 결정**: Table 4.54/5, SQL 4.70/5, Schema Viz 4.30/5, Advisors 3.95/5.

<출처: `01-research/01-table-editor/*.md`, `01-research/02-sql-editor/*.md`, `01-research/03-schema-visualizer/*.md`, `01-research/10-advisors/*.md`, Wave 2 A/B/E>

#### L7. 통합 계층 (Data API)

**책임**: 외부 시스템과 양평 사이의 경계. REST/GraphQL/Job Queue.

**구성 요소**:
- **REST API** (Next.js Route Handler, `/api/v1/...` 및 `/rest/v1/{table}?select=...`): PostgREST 방언 호환 기본 지원률 80% (NFR-CMP.1). Prisma + Zod 검증 + Rate Limit.
- **pgmq**: PostgreSQL 확장 기반 Job Queue. Outbox 패턴. 컨슈머는 Node 워커(PM2 별도 앱 `job-worker`).
- **Webhook**: DB 이벤트(INSERT/UPDATE/DELETE) → Outbox → 외부 HTTP. pgmq 재시도 + 지수 백오프.
- **[조건부] pg_graphql**: 4 수요 트리거(팀>1, 모바일, 복잡도, FE팀 요청) 중 2개+ 충족 시 도입. ADR-012.

**Wave 2 F Data API 스코어 4.29/5** (REST+pgmq 즉시 86.84점, pg_graphql 조건부).

<출처: `01-research/11-data-api/*.md`, Wave 2 F, NFR-CMP.1, NFR-PERF.5>

#### L8. UX 레이어

**책임**: 운영자와의 직접 접점. UI 품질 + AI 보조.

**구성 요소**:
- **shadcn/ui + Tailwind 4**: 다크 테마 기본, CSS 변수 토큰화. WCAG AA 4.5:1 대비.
- **한국어 i18n** (`kdyi18n` 스킬 스캔): UI 문자열 100% 커버리지, 하드코딩 ≤ 10건.
- **Ctrl+K 명령 팔레트**: 글로벌 단축키 ≥ 10개 (NFR-UX.4).
- **AI SDK v6** (Anthropic BYOK): Claude Haiku 기본, Sonnet 복잡도 ≥ 4 조건만. 월 $5 이하(NFR-COST.2).
- **mcp-luckystyle4u** (자체 MCP): Cursor/Claude Code가 양평 DB 스키마를 안전하게 조회. Redact 파이프라인 내장.
- **Sonner**: 토스트 알림. 에러 메시지 3요소(원인/결과/다음) 템플릿(NFR-UX.5).

**Wave 2 G UX Quality 스코어 87.2점** (AI SDK v6 LangChain 대비 33% 경량).

<출처: `01-research/13-ux-quality/*.md`, Wave 2 G, NFR-UX.1~5, NFR-COST.2>

### 2.3 레이어 간 의존성 규칙

#### 의존 방향

```
L8 UX ──→ L7 Data API ──→ L6 Dev Tools ──→ L5 Compute ──→ L4 Storage ──→ L3 Auth Adv ──→ L2 Auth Core/Vault ──→ L1 Obs/Ops ──→ L0 Infra
   (호출)        (호출)            (호출)             (읽기)          (인증)           (JWT)               (로깅)          (실행)
```

- **상향 의존 금지**: L2 Auth Core가 L6 SQL Editor를 호출하면 안 된다. 역방향 의존은 순환 참조 + 재시작 순서 문제 발생.
- **스킵 의존 허용**: L6 SQL Editor가 L4 PostgreSQL을 직접 호출 가능. 반드시 L5를 경유할 필요 없음.
- **같은 레이어 수평 의존 허용**: L4 PostgreSQL과 L4 SQLite는 서로 사용 가능. 단, 트랜잭션은 분리.

#### 인증 컨텍스트 전파

모든 요청은 L2가 JWT 검증 → `request.user = { id, role, sessionId }` 주입 → 하위 레이어 전파. Prisma 쿼리는 `user.id` 기반 RLS 자동 적용 (§4.3 상세).

#### 데이터 흐름 예시: "SQL Editor에서 EXPLAIN 실행"

```
L8 UX: [사용자 Ctrl+Enter 누름]
  │
  ▼ (Server Action)
L7: POST /api/v1/sql/explain  (Zod 검증, Rate Limit)
  │
  ▼ (미들웨어)
L3: Rate Limit 카운터 증가
L2: JWT 검증 → request.user = admin
  │
  ▼ (Server Action)
L6 SQL Editor: SQL 위험도 판정 (squawk)
  │
  ▼ (Prisma $queryRaw)
L4 PostgreSQL: EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  │
  ▼ (결과)
L6: JSON → xyflow 노드/엣지 구조 변환
L1: Pino 로그 {user.id, sql_hash, duration_ms, exec_plan_node_count}
  │
  ▼
L8 UX: Plan Visualizer 렌더
```

각 Blueprint는 자신이 담당하는 카테고리의 "대표 데이터 흐름" 섹션에서 위 형식을 따른다.

---

## 3. 14 카테고리 지도

### 3.1 카테고리 → 레이어 → Phase → Blueprint 매핑 표

| # | 카테고리 | 주 레이어 | Phase | 현재점수 | 목표점수 | Blueprint 경로 | MVP | 분류 |
|---|---------|---------|-------|---------|---------|----------------|-----|------|
| 6 | Auth Advanced | L3 | **15** | 15 | 100 | `02-architecture/03-auth-advanced.md` | ✅ MVP | 하이브리드 |
| 12 | Observability | L1 (+L2 Vault) | **16** | 65 | 85 | `02-architecture/04-observability.md` | ✅ MVP | 단일 |
| 14 | Operations | L1 (+L0) | **16** | 80 | 95 | `02-architecture/05-operations.md` | ✅ MVP | 단일 |
| 5 | Auth Core | L2 | **17** | 70 | 90 | `02-architecture/06-auth-core.md` | ✅ MVP | 하이브리드 |
| 7 | Storage | L4 | **17** | 40 | 90 | `02-architecture/07-storage.md` | ✅ MVP | 단일 |
| 2 | SQL Editor | L6 | **18** | 70 | 100 | `02-architecture/08-sql-editor.md` | Beta | 하이브리드 |
| 1 | Table Editor | L6 | **18** | 75 | 100 | `02-architecture/09-table-editor.md` | Beta | 하이브리드 |
| 8 | Edge Functions | L5 | **19** | 45 | 92 | `02-architecture/10-edge-functions.md` | Beta | 하이브리드 |
| 9 | Realtime | L5 | **19** | 55 | 100 | `02-architecture/11-realtime.md` | Beta | 하이브리드 |
| 3 | Schema Visualizer | L6 | **20** | 65 | 95 | `02-architecture/12-schema-visualizer.md` | v1.0 | 하이브리드 |
| 4 | DB Ops | L4 | **20** | 60 | 95 | `02-architecture/13-db-ops.md` | v1.0 | 단일 |
| 10 | Advisors | L6 | **20** | 65 | 95 | `02-architecture/14-advisors.md` | v1.0 | 하이브리드 |
| 11 | Data API | L7 | **21** | 45 | 85 | `02-architecture/15-data-api.md` | v1.0 | 하이브리드 |
| 13 | UX Quality | L8 | **21** | 75 | 95 | `02-architecture/16-ux-quality.md` | v1.0 | 단일 |

<출처: `00-vision/10-14-categories-priority.md §4.1, §8`>

### 3.2 MVP vs Beta vs v1.0 분류

```
MVP (Phase 15~17, 18주)
  Auth Advanced → Observability+Operations → Auth Core+Storage
  → "운영 가능한 보안 기반" 완성

Beta (+ Phase 18~19, 14주)
  SQL+Table Editor → Edge Functions+Realtime
  → "Supabase 핵심 기능 동등" 완성

v1.0 (+ Phase 20~22, 10주+)
  Schema Viz+DB Ops+Advisors → Data API+UX Quality → 100점 통합
  → "Supabase Self-Hosted 100점 동등"
```

### 3.3 Wave 4 DQ 28건 → Blueprint 매핑

Wave 3 `07-dq-matrix.md`에서 Wave 4로 재분배된 DQ 28건이 각 Blueprint에서 답변된다. Tier 1(본 문서)는 DQ를 직접 답하지 않고 **위치만 매핑**한다. Tier 2 Blueprint가 실제 답변한다.

| DQ 번호 | 주제 | 답변 Blueprint |
|---------|------|----------------|
| DQ-1.10 ~ 1.11 | Realtime 백프레셔, 클라이언트 quota | `11-realtime.md` §4 |
| DQ-1.12 ~ 1.14 | isolated-vm 보안 한계, Deno 포트, Sandbox 비용 가드 | `10-edge-functions.md` §5 |
| DQ-1.15 ~ 1.17 | SeaweedFS 50GB 부하, B2 오프로드, tus resumable | `07-storage.md` §4 |
| DQ-1.18 ~ 1.20 | WebAuthn Safari, TOTP 시드 rotate, Rate Limit 패턴 | `03-auth-advanced.md` §4 |
| DQ-1.21 ~ 1.24 | Realtime 채널 관리 UI, presence 상태 전파 | `11-realtime.md` §5 |
| DQ-2.1 ~ 2.4 | SQL Editor AI 비용 가드, Plan Visualizer, 스키마 토큰, Folder 마이그레이션 | `08-sql-editor.md` §5 |
| DQ-2.5 ~ 2.11 | Auth Core jose JWT 범위, argon2 교체, Anonymous role, SQLite ROI, Slack 다이제스트, 룰 음소거, PR 차단 | `06-auth-core.md` §5, `14-advisors.md` §5 |
| DQ-3.4 | ERD 레이아웃 저장 위치 | `12-schema-visualizer.md` §5 |
| DQ-3.15 | /database/policies UI 정책 완전성 경고 | `12-schema-visualizer.md` §6 |
| DQ-4.4, 4.6 | Cron 실패 90일 보관, 수동 실행 감사 로그 | `13-db-ops.md` §5 |
| DQ-12.3 | MASTER_KEY 위치 (**이미 확정**: `/etc/luckystyle4u/secrets.env`) | `04-observability.md` §4 (인용) |
| DQ-12.8, 12.14 | Vault 감사 로그, JWKS alg 검증 | `04-observability.md` §5 |
| DQ-14.x | Capacitor 모바일, 마이그레이션 롤백 | `05-operations.md` §6 |

총 28건. 각 Blueprint는 자신에게 할당된 DQ를 §4~6에서 명시 답변 후 "DQ-X.Y → ADR-00N 승격" 형식으로 ADR Log에 반영할 ADR 번호를 제안한다.

<출처: `00-vision/07-dq-matrix.md` (Wave 4 = 28건 재분배)>

### 3.4 Blueprint 구조 표준 (모든 Blueprint 공통 스켈레톤)

Tier 2 B1~B7 Blueprint 작성자는 **다음 9개 섹션 구조를 반드시 준수**:

1. **§1. 카테고리 개요 및 Supabase 동등 매핑** (현재/목표 점수 + Supabase Cloud 해당 기능 표)
2. **§2. 책임과 경계** (이 카테고리가 담당하는/않는 것)
3. **§3. 기술 스택 + Wave 1-2 근거 재확인** (채택 기술 + 거부한 대안 + 근거 문서 경로)
4. **§4. 데이터 모델** (`02-data-model-erd.md` 인용 + 이 카테고리에서 추가되는 테이블)
5. **§5. 컴포넌트/모듈 설계** (Next.js 라우트 + Server Component + Prisma 호출 다이어그램)
6. **§6. API/Interface** (REST 엔드포인트, Server Action, 이벤트 payload)
7. **§7. UI/UX 요구** (Tier 3 U1과의 계약 — 와이어프레임 링크, 컴포넌트 목록)
8. **§8. 운영 가이드** (Phase 몇에 어떤 순서로 구현, 롤백, 모니터링, DQ 답변 전체)
9. **§9. 테스트 전략 + NFR 충족** (Unit/Integration/E2E + 이 카테고리가 충족하는 NFR 번호)

Blueprint는 **700줄 이상**을 기준으로 한다.

---

## 4. 공통 횡단 관심사 (Cross-cutting Concerns)

이 §4는 14 카테고리 **전부에 적용되는 규칙**을 정의한다. Blueprint에서 이 내용을 **중복 정의하지 말고 인용**한다.

### 4.1 로깅 전략

#### 4.1.1 로깅 계층

```
애플리케이션 코드 (Pino 로거 단일 인스턴스)
   │
   ▼ JSON line
PM2 stdout/stderr 로테이션 (`pm2 logs`, 100MB rotation)
   │
   ▼ copy
WSL2 journalctl (systemd-journald, 7일 보관)
   │
   ▼ (선택적 장기 보관)
SQLite `audit_logs` (감사 이벤트만, 365일 보관)
```

#### 4.1.2 로그 필드 표준

모든 로그 라인은 아래 필드를 공통 포함:

```typescript
interface LogRecord {
  time: number;         // epoch ms (Pino 기본)
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  pid: number;          // PM2 cluster worker PID
  hostname: 'ypb-wsl2';
  service: 'next' | 'cron' | 'edge-fn' | 'realtime-consumer';
  category: string;     // "sql-editor" | "auth-core" | ... (14 카테고리 중 하나)
  event: string;        // "query.explain" | "login.success" | ...
  userId?: string;      // 인증 컨텍스트 (L2에서 주입)
  sessionId?: string;
  traceId: string;      // 요청별 고유 UUID (middleware에서 생성)
  msg: string;          // 사람이 읽는 메시지
  [key: string]: unknown; // 카테고리별 추가 필드
}
```

#### 4.1.3 로그 레벨 정책

| 레벨 | 사용처 | 예 |
|------|-------|-----|
| `debug` | 개발 환경만, 프로덕션에서 OFF | `prisma query debug` |
| `info` | 정상 비즈니스 이벤트 | `login.success`, `query.executed` |
| `warn` | 복구 가능한 이상 | `rate_limit.triggered`, `webhook.retry` |
| `error` | 복구 불가 비즈니스 에러 (4xx/5xx 사용자 노출) | `query.invalid`, `auth.forbidden` |
| `fatal` | 시스템 에러 (PM2 재시작 유발) | `db.connection_lost`, `vault.master_key_missing` |

#### 4.1.4 민감 정보 redact

자동 redact 필드 (Pino `redact` 옵션):
```
[
  'password', 'passwordHash', 'secret', 'apiKey', 'keyHash',
  'authorization', 'cookie', 'creditCard', '*.password'
]
```

Blueprint는 자신의 로그에 `userId`는 포함하되 `email`은 redact(또는 해시)한다.

### 4.2 에러 처리 4계층

에러는 발생 근원에 따라 4가지로 분류하고, **에러 코드(ERR_xxxx)로 구분**한다.

#### 4.2.1 레이어 1: 사용자 입력 에러 (1xxx)

- **원인**: Zod 스키마 검증 실패, 파라미터 누락, 잘못된 형식
- **HTTP**: 400, 422
- **에러 코드**: `ERR_INPUT_1001` (형식 오류), `ERR_INPUT_1002` (필수 필드 누락) 등
- **사용자 노출**: Sonner 토스트로 한국어 3요소 메시지
- **로깅**: `level=warn` (비정상 아니지만 추적용)

#### 4.2.2 레이어 2: 시스템 에러 (2xxx)

- **원인**: 코드 버그, 예상치 못한 상태, 로직 실패
- **HTTP**: 500
- **에러 코드**: `ERR_SYS_2001` (null 참조), `ERR_SYS_2099` (미분류)
- **사용자 노출**: "일시적 오류입니다. 잠시 후 다시 시도해주세요."
- **로깅**: `level=error` + stack trace + traceId → 장기 추적

#### 4.2.3 레이어 3: 외부 서비스 에러 (3xxx)

- **원인**: Anthropic API 실패, Cloudflare Tunnel 순단, B2 PUT 실패
- **HTTP**: 502, 503, 504
- **에러 코드**: `ERR_EXT_3001` (AI API), `ERR_EXT_3002` (Cloudflare), `ERR_EXT_3003` (B2), `ERR_EXT_3004` (SeaweedFS 내부 HTTP)
- **사용자 노출**: "외부 서비스 일시 장애 — 자동 재시도 중"
- **로깅**: `level=error` + 재시도 카운터

#### 4.2.4 레이어 4: 데이터 에러 (4xxx)

- **원인**: PostgreSQL 제약 위반(UNIQUE, FK, CHECK), 데이터 불일치, 마이그레이션 실패
- **HTTP**: 409 (conflict), 422 (unprocessable)
- **에러 코드**: `ERR_DATA_4001` (UNIQUE violation), `ERR_DATA_4002` (FK violation), `ERR_DATA_4003` (optimistic concurrency 충돌)
- **사용자 노출**: 한국어로 "이미 존재하는 이메일입니다" 등 구체적 문구
- **로깅**: `level=warn` + PK/FK 값

#### 4.2.5 에러 매핑 레지스트리

`src/lib/errors/messages.ts` 단일 파일에 전 에러 코드 + 한국어 메시지 매핑. NFR-UX.5 "3요소(원인/결과/다음 단계)" 커버리지 ≥ 95%.

```typescript
export const ERROR_MESSAGES: Record<string, ErrorMessage> = {
  ERR_DATA_4001: {
    cause: '이미 존재하는 {field}입니다',
    consequence: '해당 레코드가 중복으로 생성되지 않았습니다',
    nextStep: '다른 {field}로 다시 시도하시거나, 기존 레코드를 확인하세요',
  },
  // ... 최소 80건
};
```

### 4.3 인증 컨텍스트 전파 (JWT → Route → Prisma RLS)

#### 4.3.1 흐름 다이어그램

```
[클라이언트 요청 + Cookie: session=<JWT>]
  │
  ▼
Next.js Middleware (src/middleware.ts)
  - jose.jwtVerify(token, JWKS, { algorithms: ['ES256'] })
  - 실패: 401 Response (더이상 처리 안 함)
  - 성공: request.headers 에 'x-user-id', 'x-user-role', 'x-session-id' 주입
  │
  ▼
Route Handler / Server Component / Server Action
  - getAuthContext(): { userId, role, sessionId }
  - L3 Rate Limit 카운터 증가 (`rate_limit_events` incr)
  - L4 Prisma 쿼리 실행 시 `auth.uid = userId` SET 세션 변수
  │
  ▼
PostgreSQL (Prisma 쿼리)
  - session variable: SET LOCAL app.current_user_id = $1
  - RLS 정책: USING (user_id = current_setting('app.current_user_id')::uuid)
  - 감사 로그: INSERT INTO audit_logs ... WITH user_id FROM app.current_user_id
```

#### 4.3.2 RLS 전파 표준

모든 사용자 데이터 테이블은 RLS 기본 활성 (NFR-SEC.7). Blueprint는 각 테이블에 다음 형식의 정책을 생성:

```sql
-- 예: file_box의 files 테이블
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY files_own_data ON files
  FOR ALL
  USING (owner_id = current_setting('app.current_user_id')::uuid);

-- admin은 전체 접근 (role 분리)
CREATE POLICY files_admin_all ON files
  FOR ALL
  TO app_admin
  USING (true);
```

Prisma는 `app_writer` 또는 `app_admin` role로 접속. SUPERUSER 접속 **금지** (DQ-3.8).

#### 4.3.3 Server Action 내부 표준

```typescript
'use server';

export async function deleteFile(fileId: string) {
  const { userId, role, sessionId } = await getAuthContext();
  if (!userId) throw new AuthError('ERR_AUTH_401');

  // Prisma 자동 RLS: user_id 기반
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL app.current_user_id = ${userId}`;
    await tx.file.delete({ where: { id: fileId } });
    await tx.auditLog.create({
      data: {
        userId, action: 'file.delete',
        resourceType: 'file', resourceId: fileId,
        result: 'success', sessionId,
      },
    });
  });
}
```

### 4.4 감사 로그 (Audit Log)

#### 4.4.1 WHO / WHAT / WHEN / RESULT 5-tuple

모든 관리자 행동은 감사 로그에 append-only 기록 (NFR-SEC.10):

```typescript
interface AuditLogEntry {
  id: number;           // SQLite autoinc 또는 PG serial
  timestamp: Date;      // UTC epoch
  userId: string;       // WHO (auth.users.id)
  sessionId: string;    // WHO session
  action: string;       // WHAT: "user.role.changed" | "policy.created" | "file.deleted"
  resourceType: string; // WHAT target type: "user" | "policy" | "file"
  resourceId: string;   // WHAT target ID
  oldValue?: Json;      // 변경 전 (role 변경 등)
  newValue?: Json;      // 변경 후
  result: 'success' | 'failure'; // RESULT
  errorCode?: string;   // 실패 시
  ip: string;           // WHERE (CF-Connecting-IP)
  userAgent?: string;
  traceId: string;      // 로그 상관관계
}
```

#### 4.4.2 저장 위치 — 2-DB 분할 전략

- **SQLite `audit_logs`**: 시스템 레벨 이벤트 (로그인, 관리자 행동, API 호출). 이미 존재 (`src/lib/db/schema.ts`).
- **PostgreSQL `audit_logs_pg`** (확장): 비즈니스 엔티티 변경 (role 변경, RLS 정책 변경 등). UPDATE/DELETE 트리거로 차단. PG 트랜잭션 안에 포함되어야 하는 케이스.

두 테이블은 용도 분리 (상세 `02-data-model-erd.md §5`). Blueprint는 "어느 테이블에 쓸지" 명시.

#### 4.4.3 불변성 강제

```sql
-- PostgreSQL audit_logs_pg
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs_pg is append-only (NFR-SEC.10)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_pg_no_update
  BEFORE UPDATE OR DELETE ON audit_logs_pg
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

### 4.5 설정 관리

#### 4.5.1 3-tier 설정 계층

```
tier 1: 공개 환경변수 (.env)
   → NEXT_PUBLIC_*, NODE_ENV, PORT (3000)
   → Git 커밋 가능, 클라이언트 번들에 포함

tier 2: 서버 환경변수 (.env.local, .env.production)
   → DATABASE_URL, NEXT_PUBLIC_SITE_URL, SEAWEEDFS_URL
   → Git 커밋 금지, `.env.local` .gitignore

tier 3: 시크릿 (/etc/luckystyle4u/secrets.env)
   → MASTER_KEY, JWT_PRIVATE_KEY_PEM, B2_APPLICATION_KEY
   → root:ypb-runtime 0640 mode, systemd/PM2 env_file로만 주입
   → DQ-12.3 확정
```

#### 4.5.2 시크릿 파일 포맷

`/etc/luckystyle4u/secrets.env`:
```bash
# 시크릿 파일 — root:ypb-runtime 0640
# 이 파일은 절대 Git에 커밋되지 않음
# PM2 ecosystem.config.js의 env_file에서 참조

MASTER_KEY=<base64 encoded 32 bytes AES-256 KEK>
JWT_PRIVATE_KEY_CURRENT=<base64 encoded PEM>
JWT_PRIVATE_KEY_NEXT=<base64 encoded PEM>
JWT_KEY_ROTATED_AT=<ISO timestamp>
B2_APPLICATION_KEY_ID=<B2 account>
B2_APPLICATION_KEY=<B2 secret>
ANTHROPIC_API_KEY=<만약 운영자 단일 계정 사용 시; BYOK 사용자는 DB Vault 저장>
```

#### 4.5.3 애플리케이션 내부 설정 로딩

```typescript
// src/lib/config.ts
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  MASTER_KEY: z.string().length(44), // base64 32bytes = 44chars
  JWT_PRIVATE_KEY_CURRENT: z.string().min(200),
  // ... 모든 필수 환경변수
});

export const config = configSchema.parse(process.env);
// 런타임 시작 시 스키마 검증. 실패 시 프로세스 종료.
```

검증 실패 시 PM2가 재시작 시도 → MAX_RESTART(10) 도달 → 알림. 시크릿 누락은 서비스 자동 시작을 차단한다(NFR-REL.3).

### 4.6 국제화 — 단일 언어 한국어

**정책 (ASM-2 아님, 명시적 설계 결정)**:
- UI 언어는 한국어 단 하나. i18n 프레임워크(`next-intl`) **미도입**. 하드코딩된 한국어 문자열 직접 사용.
- 이유: 1인 운영, 영문 UI 추가 공수 > 이득 (Wave 3 §A3 한국어 1등급).
- 예외: 에러 코드(`ERR_AUTH_401`)와 기술 용어(SQL 키워드, HTTP 상태명)는 영문.
- 향후 확장 가능성: 영문 UI는 오픈소스 릴리스(24개월+ Wave 3 §A1.3 단계) 시 재검토.

NFR-UX.2 "UI 문자열 번역 커버리지 100%"는 "한국어 1종 100%"로 해석.

### 4.7 키보드 단축키 레지스트리

전 페이지 공통 단축키 표준 (NFR-UX.4):

| 키 | 동작 |
|----|------|
| `Ctrl+K` | 글로벌 명령 팔레트 열기 |
| `G T` | Table Editor로 이동 |
| `G S` | SQL Editor로 이동 |
| `G D` | Database (schema viz) |
| `G A` | Advisors |
| `G L` | Logs |
| `G M` | Metrics |
| `?` | 단축키 도움말 오버레이 |
| `Ctrl+Enter` | SQL 실행 (SQL Editor) |
| `Ctrl+/` | 주석 토글 (Monaco) |
| `Esc` | 모달 닫기 / 편집 취소 |

Blueprint U1(UX)는 이 표준을 디자인 시스템에 반영한다. 카테고리 특화 단축키는 Blueprint 내부에서 정의.

### 4.8 Trace ID 전파

모든 요청은 Middleware에서 `traceId = crypto.randomUUID()` 생성 → 헤더 `X-Trace-Id`로 응답에 포함 → 로그 전 필드에 자동 포함. 클라이언트 에러 보고 시 운영자(김도영)가 traceId로 PM2 로그 + SQLite audit_log를 교차 검색 가능.

---

## 5. 배포 토폴로지 다이어그램

### 5.1 물리 토폴로지

```
┌──────────────────────────────────────────────────────────────────────┐
│                           인터넷 사용자                              │
│                           (전 세계)                                   │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS (TLS 1.3)
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge Network                           │
│  - WAF (OWASP 규칙셋)                                                │
│  - DDoS 방어 (L3/L4/L7)                                              │
│  - Bot Management                                                    │
│  - 정적 자산 캐시 (Next.js /_next/static/*)                           │
│  - JWKS endpoint 10분 캐시                                           │
│  - canary.stylelucky4u.com 서브도메인 (카나리)                       │
│  - stylelucky4u.com 프로덕션                                         │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ Cloudflare Tunnel (QUIC, HTTP/2 폴백)
                              │ cloudflared outgoing connection
                              ▼
┌══════════════════════════════════════════════════════════════════════┐
║                  Windows 11 Host (운영자: 김도영)                      ║
║                                                                      ║
║   ┌────────────────────────────────────────────────────────────┐    ║
║   │           WSL2 Ubuntu 22.04 LTS (x86_64, ext4)              │    ║
║   │                                                              │    ║
║   │   systemd                                                     │    ║
║   │   ├── cloudflared.service  (Tunnel client)                   │    ║
║   │   │       (outgoing: CF edge → localhost:3000)               │    ║
║   │   │                                                           │    ║
║   │   ├── postgresql@17-main.service  (port 5432, localhost만)   │    ║
║   │   │       /var/lib/postgresql/17/main                         │    ║
║   │   │       확장: wal2json, pgmq, [조건부] pg_graphql          │    ║
║   │   │       archive_command → /opt/wal-g/upload-wal.sh          │    ║
║   │   │                                                           │    ║
║   │   ├── seaweedfs.service  (port 9333 master + 8080 volume)    │    ║
║   │   │       /opt/seaweedfs/vol (50GB limit)                    │    ║
║   │   │                                                           │    ║
║   │   └── PM2 (user: ypb-runtime)                                 │    ║
║   │       ├── next-app        (cluster 4, port 127.0.0.1:3000)   │    ║
║   │       │   Next.js 16 + Prisma 7 + TanStack 전체               │    ║
║   │       │   /srv/luckystyle4u/current → releases/YYYYMMDDHHMMSS │    ║
║   │       │   env_file: /etc/luckystyle4u/secrets.env             │    ║
║   │       │                                                        │    ║
║   │       ├── cron-worker     (fork 1, port 없음)                 │    ║
║   │       │   node-cron 전용 워커, 중복 방지                      │    ║
║   │       │                                                        │    ║
║   │       ├── realtime-consumer (fork 1)                          │    ║
║   │       │   wal2json → SSE broadcast                            │    ║
║   │       │                                                        │    ║
║   │       ├── job-worker      (fork 2)                            │    ║
║   │       │   pgmq consumer                                       │    ║
║   │       │                                                        │    ║
║   │       └── deno-sidecar    (Deno 1.40+, localhost:3001)       │    ║
║   │           isolated edge functions L2                          │    ║
║   │                                                              │    ║
║   │   데이터 디스크 (ext4):                                       │    ║
║   │   ├── /var/lib/postgresql/17/main (PG data)                  │    ║
║   │   ├── /opt/seaweedfs/vol (objects)                           │    ║
║   │   ├── /srv/luckystyle4u/releases/... (Next.js 빌드 N개)     │    ║
║   │   ├── /srv/luckystyle4u/data/metrics.sqlite (SQLite)        │    ║
║   │   └── /etc/luckystyle4u/secrets.env (MASTER_KEY)            │    ║
║   │                                                              │    ║
║   │   관측:                                                       │    ║
║   │   ├── prometheus.service (port 9090)                          │    ║
║   │   └── grafana.service (port 3001)                            │    ║
║   └────────────────────────────────────────────────────────────┘    ║
╚══════════════════════════════════════════════════════════════════════╝
                              │
                              │ HTTPS 아웃바운드 (AES-256-GCM envelope)
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Backblaze B2 (us-west)                                  │
│              - WAL 세그먼트 (60초마다 업로드, RPO 60s)               │
│              - Base backup (일 1회)                                  │
│              - Storage 콜드 tier (SeaweedFS 오프로드, 선택)          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│              Anthropic Claude API (us-east)                          │
│              - Haiku 기본 / Sonnet 조건부                            │
│              - BYOK 또는 단일 계정                                   │
│              - Redact 파이프라인 경유                                │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 로직 토폴로지 (요청 수명주기)

```
 Client (Chrome/Safari)
  │
  ▼ DNS stylelucky4u.com → Cloudflare 1.1.1.1
 Cloudflare Edge
  │ WAF check → Rate Limit(Edge) → Cache check
  ▼ (캐시 미스)
 Cloudflare Tunnel → WSL2 localhost:3000
  │
  ▼
 Next.js Middleware
  │ traceId 생성 → JWT 검증(L2) → Rate Limit(L3 DB 카운터)
  ▼
 Next.js Route Handler / Server Component
  │ getAuthContext → Prisma 쿼리 (SET LOCAL + RLS)
  ▼
 PostgreSQL (localhost:5432)
  │ 쿼리 + audit log INSERT
  ▼
 응답 반환 → Pino log INFO → 클라이언트
```

### 5.3 `/ypserver prod` 배포 파이프라인

기존 `ypserver` 스킬이 수행하는 단계를 아키텍처 관점에서 정리:

```
[Windows 11 개발기]
  1. TypeScript strict 컴파일 체크
  2. Vitest 테스트 (`npm run test`)
  3. Next.js 빌드 (`npm run build`)
  4. `.next/` + `package.json` + `prisma/` 패키징

[로컬 → WSL2 rsync]
  5. rsync -az .next/ ypb-wsl2:/tmp/deploy/<timestamp>/
  6. rsync -az prisma/ ypb-wsl2:/tmp/deploy/<timestamp>/prisma/

[WSL2 Ubuntu]
  7. mkdir /srv/luckystyle4u/releases/<timestamp>
  8. mv /tmp/deploy/<timestamp>/* /srv/luckystyle4u/releases/<timestamp>/
  9. cd <timestamp> && npm ci --production
 10. prisma migrate deploy (자동, NFR-MNT.2)
 11. 심링크 스왑:
      ln -sfn releases/<timestamp> /srv/luckystyle4u/current
 12. PM2 reload next-app (zero-downtime)
 13. healthcheck: curl localhost:3000/api/health → 200
 14. 실패 시 자동 symlink 되돌리기 (5초 롤백, NFR-REL.4)

[Cloudflare]
 15. canary.stylelucky4u.com에 먼저 배포한 경우, 30분 관찰 후
     prod 도메인으로 승격 (DNS 변경 없이 Tunnel 라우팅 변경)
```

### 5.4 카나리 서브도메인 설계

- `canary.stylelucky4u.com`: 신 버전 검증용. 프로덕션과 **같은 DB + SeaweedFS + MASTER_KEY** 공유. 단지 다른 포트(3002) + 다른 `/srv/luckystyle4u/canary/current/` 심링크.
- 카나리 배포:
  ```
  1. /srv/luckystyle4u/canary/releases/<timestamp> 생성
  2. PM2 앱 'next-app-canary' (cluster 1, port 3002)
  3. Cloudflare Tunnel: canary.stylelucky4u.com → localhost:3002
  4. 30분 관찰 (에러율 <1%, p95 <2배)
  5. 통과 → `/srv/luckystyle4u/current`로 심링크 스왑 (production 승격)
  6. 실패 → canary만 폐기, prod 영향 없음
  ```

### 5.5 데이터 복구 시나리오 (RTO 30분)

```
장애 감지 (Prometheus alert: pg_up=0 지속 60초)
  │
  ▼ T+0
김도영 Slack/이메일 알림 수신
  │
  ▼ T+5분 (인지)
SSH to WSL2 → systemctl status postgresql
  │
  ▼ T+10분 (진단)
Case A: 단순 재시작으로 복구 가능
  → systemctl restart postgresql → 완료 (T+15분)

Case B: 디스크 손상 / 데이터 파일 깨짐
  → wal-g restore-from-backup <latest>
  → wal-g wal-fetch <timestamp> (RPO 60초 이내 복구)
  → systemctl start postgresql
  → PM2 reload next-app
  → curl /api/health → 200
  → 완료 (T+25~30분)
```

### 5.6 보안 토폴로지

- **외부 인바운드**: Cloudflare Tunnel만. UFW는 3000/tcp DENY ALL.
- **내부 프로세스 간**: localhost 소켓 통신. PostgreSQL UDS(`/var/run/postgresql/.s.PGSQL.5432`) 선호.
- **MASTER_KEY 보호**: systemd MountAPIVFS + PrivateTmp. PM2 user `ypb-runtime`가 0640 읽기만 가능.
- **Vault envelope 검증**: 모든 DEK 복호화 시 GCM auth tag 검증 실패 → 즉시 `ERR_VAULT_5001` + audit log.

---

## 6. NFR 매핑 테이블

### 6.1 38 NFR × 레이어/카테고리 매핑

| NFR | 목표 | 주 레이어 | 주 카테고리 | 주 Blueprint |
|-----|------|---------|-----------|-------------|
| NFR-PERF.1 | Table 정렬 p95 800ms | L6/L4 | Table Editor | `09-table-editor.md` |
| NFR-PERF.2 | EXPLAIN p95 500ms | L6/L4 | SQL Editor | `08-sql-editor.md` |
| NFR-PERF.3 | Realtime 지연 p95 200ms | L5 | Realtime | `11-realtime.md` |
| NFR-PERF.4 | isolated-vm cold start 50ms | L5 | Edge Fn | `10-edge-functions.md` |
| NFR-PERF.5 | API p95 300ms + pgmq 30s SLA | L7/L4 | Data API + DB Ops | `15-data-api.md`, `13-db-ops.md` |
| NFR-PERF.6 | SeaweedFS write 80MB/s | L4 | Storage | `07-storage.md` |
| NFR-PERF.7 | Schema Viz 렌더 p95 1.5s | L6 | Schema Viz | `12-schema-visualizer.md` |
| NFR-PERF.8 | LCP p95 1.8s | L8 | UX Quality | `16-ux-quality.md` |
| NFR-SEC.1 | JWT ES256 + 24h 회전 | L2 | Auth Core + Obs | `06-auth-core.md`, `04-observability.md` |
| NFR-SEC.2 | MASTER_KEY envelope | L2 | Observability | `04-observability.md` |
| NFR-SEC.3 | Admin MFA 강제 | L3 | Auth Advanced | `03-auth-advanced.md` |
| NFR-SEC.4 | Rate Limit 100 req/min | L3 | Auth Adv + Data API | `03-auth-advanced.md`, `15-data-api.md` |
| NFR-SEC.5 | Cloudflare Tunnel + UFW | L0/L1 | Operations | `05-operations.md` |
| NFR-SEC.6 | Prepared Statement 강제 | L7/L4 | Advisors + Data API | `14-advisors.md`, `15-data-api.md` |
| NFR-SEC.7 | RLS 95% 커버 | L4 | Schema Viz + Advisors | `12-schema-visualizer.md`, `14-advisors.md` |
| NFR-SEC.8 | OWASP Top 10 | 전 레이어 | 전 카테고리 | 전 Blueprint |
| NFR-SEC.9 | CSRF + CORS | L2 | Auth Core + Data API | `06-auth-core.md`, `15-data-api.md` |
| NFR-SEC.10 | Audit Log 불변 | L4 | Observability + 전 카테고리 | `04-observability.md`, 전 Blueprint `§4` |
| NFR-UX.1 | 학습 곡선 1일 | L8 | UX Quality | `16-ux-quality.md` |
| NFR-UX.2 | 한국어 100% | L8 | UX Quality | §4.6 (본 문서), `16-ux-quality.md` |
| NFR-UX.3 | 다크 테마 WCAG AA | L8 | UX Quality | `16-ux-quality.md` |
| NFR-UX.4 | 단축키 ≥ 10개 | L8 | UX Quality | §4.7 (본 문서), `16-ux-quality.md` |
| NFR-UX.5 | 에러 3요소 95% | 전 레이어 | 전 카테고리 | §4.2.5 (본 문서) |
| NFR-REL.1 | RPO 60초 | L4/L1 | DB Ops + Observability | `13-db-ops.md`, `04-observability.md` |
| NFR-REL.2 | RTO 30분 | L1/L0 | Operations + DB Ops | `05-operations.md`, `13-db-ops.md` |
| NFR-REL.3 | PM2 자동 재시작 ≤ 3s | L1 | Operations | `05-operations.md` |
| NFR-REL.4 | 카나리 롤백 ≤ 60s, 0 다운타임 | L1 | Operations | `05-operations.md` |
| NFR-REL.5 | SPOF 자동 복구 4개 | L0/L1 | Operations | `05-operations.md` |
| NFR-MNT.1 | 모노레포 setup 15분 | 전 레이어 | Operations | `05-operations.md` |
| NFR-MNT.2 | Prisma migrate 자동 | L4 | DB Ops + Operations | `13-db-ops.md`, `05-operations.md` |
| NFR-MNT.3 | 테스트 커버리지 90% 순수함수 | 전 레이어 | 전 카테고리 | 각 Blueprint §9 |
| NFR-MNT.4 | 문서화 100% API | L7 | Data API + Operations | `15-data-api.md`, `05-operations.md` |
| NFR-CMP.1 | PostgREST 호환 80% | L7 | Data API | `15-data-api.md` |
| NFR-CMP.2 | PG 15+ 지원 | L4 | DB Ops | `13-db-ops.md` |
| NFR-CMP.3 | Node 24 LTS | L0 | Operations | `05-operations.md` |
| NFR-CMP.4 | Linux x86_64 + WSL2 | L0 | Operations | `05-operations.md` |
| NFR-COST.1 | 월 $10 이하 | 전 레이어 | Operations + Storage | `05-operations.md`, `07-storage.md` |
| NFR-COST.2 | AI $5 이하 | L8 | UX Quality | `16-ux-quality.md` |

### 6.2 카테고리별 NFR 요약

| 카테고리 | 주 충족 NFR | 보조 충족 NFR |
|---------|-------------|---------------|
| Auth Advanced | SEC.3, SEC.4 | UX.5 |
| Observability | SEC.2, SEC.10, REL.1 (WAL) | COST.1 |
| Operations | REL.2~5, MNT.1, CMP.3~4, COST.1 | SEC.5 |
| Auth Core | SEC.1, SEC.9 | — |
| Storage | PERF.6, COST.1 | — |
| SQL Editor | PERF.2 | UX.4 |
| Table Editor | PERF.1 | UX.5 |
| Edge Functions | PERF.4 | — |
| Realtime | PERF.3 | — |
| Schema Viz | PERF.7, SEC.7 | — |
| DB Ops | PERF.5, REL.1, MNT.2, CMP.2 | — |
| Advisors | SEC.6, SEC.7 | MNT.3 |
| Data API | PERF.5, CMP.1, SEC.4 | — |
| UX Quality | PERF.8, UX.1~5, COST.2 | — |

각 Blueprint §9에서 자신이 충족해야 할 NFR을 **명시적으로 인용**하고 달성 전략을 기술.

### 6.3 카테고리 × NFR 카테고리 요약 매트릭스

| 카테고리 | PERF | SEC | UX | REL | MNT | CMP | COST |
|---------|------|-----|-----|-----|-----|-----|------|
| Auth Advanced | — | 주 | 보조 | — | — | — | — |
| Observability | — | 주 | — | 주 | — | — | — |
| Operations | — | 보조 | — | 주 | 주 | 주 | 주 |
| Auth Core | — | 주 | — | — | — | — | — |
| Storage | 주 | — | — | — | — | — | 주 |
| SQL Editor | 주 | — | 보조 | — | — | — | — |
| Table Editor | 주 | — | 보조 | — | — | — | — |
| Edge Fn | 주 | — | — | — | — | — | — |
| Realtime | 주 | — | — | — | — | — | — |
| Schema Viz | 보조 | 주 | — | — | — | — | — |
| DB Ops | 주 | — | — | 주 | 주 | 주 | — |
| Advisors | — | 주 | — | — | 보조 | — | — |
| Data API | 주 | 주 | — | — | — | 주 | — |
| UX Quality | 주 | — | 주 | — | — | — | 주 |

주 = primary contributor, 보조 = secondary contributor.

---

## 7. 역방향 피드백 대비

이 §은 Tier 2 Blueprint가 이 문서의 원칙과 충돌하는 설계를 제안할 경우의 **피드백 루프 절차**를 정의한다. 피드백은 Tier 1(본 문서)을 개선하거나, Blueprint를 이 문서 원칙에 맞게 조정하는 양방향 프로세스다.

### 7.1 충돌 유형 분류

| 유형 | 설명 | 예시 | 해결 |
|------|------|------|------|
| **T1. 원칙 위배** | Blueprint가 AP-1~5 중 하나를 명백히 위배 | B3 Storage Blueprint가 AWS S3 사용 제안 (AP-2 위배) | Blueprint 수정, AP 우선 |
| **T2. 레이어 혼란** | Blueprint가 속한 레이어 경계를 벗어남 | B5 Realtime Blueprint가 L2 Auth 로직 재구현 | Blueprint 수정, 레이어 존중 |
| **T3. 횡단 관심사 재정의** | §4 규칙을 Blueprint 내부에서 다르게 정의 | B1 Auth Advanced가 자체 로깅 포맷 사용 | Blueprint §4 인용으로 회귀 |
| **T4. NFR 미달** | Blueprint 설계가 §6 NFR 목표치 달성 불가 | B5 Realtime 설계가 p95 200ms 달성 설명 없음 | Blueprint 보강 또는 NFR 조정(ADR) |
| **T5. 원칙 개선 제안** | Blueprint가 발견한 새로운 패턴이 본 문서에 없음 | B4 SQL Editor가 "SQL 트랜잭션 Savepoint 패턴" 일반화 제안 | 본 문서 §4에 통합 + ADR 등록 |

### 7.2 피드백 절차

#### Step 1. Blueprint 내 충돌 식별

Tier 2 Blueprint 작성자는 본 문서를 읽은 후 자신의 설계 초안에서 충돌을 발견하면 Blueprint 문서 끝에 "§X. 역방향 피드백" 섹션을 추가:

```markdown
## §X. 역방향 피드백 (Tier 1 00-system-overview.md 대상)

### FB-1 유형: T4 (NFR 미달)
참조: 00-system-overview.md §6 NFR-PERF.3 Realtime 지연 p95 200ms
본 Blueprint 설계: wal2json → SSE 브로드캐스트 p95 300ms 예상
근거: wal2json 자체 지연 80ms + SSE flush 120ms + 네트워크 100ms = 300ms
제안: NFR-PERF.3을 p95 300ms로 조정 (또는 별도 캐싱 레이어 도입)
```

#### Step 2. 분류 및 우선순위

- **T1~T3**: Blueprint 수정 의무. 본 문서 원칙이 우선.
- **T4~T5**: 본 문서와 Blueprint 양쪽 모두 변경 가능. ADR 작성 + 논의 필요.

#### Step 3. 해결

- **Blueprint 수정**: Tier 2 에이전트가 Blueprint를 본 문서 원칙에 맞게 재작성.
- **본 문서 개정**: T4/T5 수용 시 본 문서 §에 변경 반영 + ADR Log에 "ADR-NNN: System Overview §X 개정" 등록. 변경 이력 부록 Z에 추가.

### 7.3 예상 충돌 시나리오 3개

#### 시나리오 1: Storage Blueprint(B3)가 SeaweedFS + B2 오프로드 없이 설계

**문제**: AP-5(비용) + §2 L4 "SeaweedFS 권장 상한 50GB, B2 오프로드" 원칙 위배.

**해결**: Blueprint §4에서 B2 오프로드 스케줄(예: Hot 30일 → Cold B2 이전)을 명시. ADR-008에 이미 결정됨.

#### 시나리오 2: Edge Functions Blueprint(B3)가 Deno만 사용 (isolated-vm 제외)

**문제**: AP-3(100점 동등) + §2 L5 "3층 하이브리드" 원칙 위배. isolated-vm cold start 50ms 목표(NFR-PERF.4)도 달성 불가.

**해결**: Blueprint §5에서 `decideRuntime()` 라우터 구현 의무화. 최소 L1(isolated-vm)과 L2(Deno) 둘 다 구현.

#### 시나리오 3: Auth Core Blueprint(B1)가 argon2 즉시 도입 제안

**문제**: CON-10 "bcrypt → argon2 마이그레이션 비용 제외" 명시적 제약 위배.

**해결**: Blueprint에서 argon2 지원은 "Phase 20+ 장기 로드맵"으로 명시. 현재 bcrypt 유지. ADR-006에 반영.

### 7.4 ADR을 통한 공식 변경 절차

본 문서의 원칙 변경은 반드시 `01-adr-log.md`에 ADR을 등록하고 승인(김도영 검토)을 거쳐야 한다. ADR 없는 변경은 무효. 이 절차는 Wave 5 로드맵까지 지속 유지된다.

---

## 부록 Z. 근거 인덱스

### Z.1 이 문서가 의존하는 Wave 1-3 결과 (정밀 출처 표)

| 본문 섹션 | 참조 문서 경로 | 근거 내용 |
|----------|---------------|-----------|
| §1.1 비전 인용 | `00-vision/00-product-vision.md §A1.1` | 한 문장 슬로건 |
| §1.2 AP-1 1인 운영 | `00-vision/00-product-vision.md §A4.4, §A7-P4` | 1인 운영 부담 주당 1h |
| §1.2 AP-2 데이터 주권 | `00-vision/00-product-vision.md §A4.1`, `04-constraints-assumptions.md CON-12` | 데이터 위치 고정 |
| §1.2 AP-3 100점 | `00-vision/05-100점-definition.md §1.1~§1.4` | 95%+5% 정의 |
| §1.2 AP-4 Next.js 네이티브 | `00-vision/00-product-vision.md §A4.5`, `01-research/02-sql-editor/*.md` | SDK 미사용 원칙 |
| §1.2 AP-5 월 $10 | `00-vision/03-non-functional-requirements.md NFR-COST.1~2` | 비용 상한 |
| §2.1 레이어 구조 | Wave 1 Compound Knowledge "하이브리드 9:단일 5" 분류 | README.md "14 카테고리" |
| §2.2 L0 Cloudflare | `04-constraints-assumptions.md CON-2`, `01-research/14-operations/*.md` | Tunnel 전제 |
| §2.2 L1 Obs/Ops | `01-research/12-observability/*.md`, `01-research/14-operations/*.md` | Pino + PM2 + Capistrano |
| §2.2 L2 Auth Core | `01-research/05-auth-core/*.md`, Wave 2 C | jose JWT + 패턴 차용 |
| §2.2 L3 Auth Adv | `01-research/06-auth-advanced/*.md`, Wave 2 C | TOTP+WebAuthn+RL |
| §2.2 L4 데이터 | `01-research/04-db-ops/*.md`, `01-research/07-storage/*.md` | PG+SQLite+SeaweedFS |
| §2.2 L5 Compute | `01-research/08-edge-functions/*.md`, `01-research/09-realtime/*.md` | 3층 + CDC/Channel |
| §2.2 L6 Dev Tools | `01-research/01/02/03/10/*.md` | 통합 대시보드 |
| §2.2 L7 Data API | `01-research/11-data-api/*.md`, Wave 2 F | REST+pgmq |
| §2.2 L8 UX | `01-research/13-ux-quality/*.md`, Wave 2 G | AI SDK v6 |
| §3 14 카테고리 | `00-vision/10-14-categories-priority.md §3~§4` | Phase 15-22 매핑 |
| §3.3 DQ 매핑 | `00-vision/07-dq-matrix.md` | Wave 4 = 28 DQ |
| §4 횡단 관심사 | `03-non-functional-requirements.md` 전체, `08-security-threat-model.md` | NFR + STRIDE |
| §4.5 시크릿 관리 | DQ-12.3 확정 (Wave 2 F) | MASTER_KEY 위치 |
| §5 배포 | `01-research/14-operations/*.md`, Wave 2 G | Capistrano + PM2 |
| §6 NFR 매핑 | `03-non-functional-requirements.md §8.1` | NFR→FR 매트릭스 |
| §7 피드백 | Wave 2 "역방향 피드백 발생 없음" 원칙 | Wave 2 결론 |

### Z.2 Wave 1/2/3 문서 수 및 줄 수 (이 문서의 기반)

- Wave 1: 33 deep-dive, 26,941줄
- Wave 2: 28 매트릭스+1:1, 18,251줄
- Wave 3: 11 Vision Suite, 8,350줄
- **누적: 72 문서 / 53,542줄** — 이 문서는 그 결론을 단 하나의 "지도"로 압축한 것이다.

### Z.3 Prisma schema 현재 (2026-04-18)

현재 `prisma/schema.prisma`는 10 모델: User, Folder, File, SqlQuery, EdgeFunction, EdgeFunctionRun, Webhook, CronJob, ApiKey, LogDrain. 상세는 `02-data-model-erd.md §2`.

### Z.4 SQLite schema 현재 (2026-04-18)

`src/lib/db/schema.ts`: `audit_logs`, `metrics_history`, `ip_whitelist` 3 테이블. 상세는 `02-data-model-erd.md §4`.

### Z.5 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent A1 (Opus 4.7 1M) | Wave 4 Tier 1 초안 — §0~§7 + 부록 Z |

### Z.6 후속 Wave 4 산출물 연결

- → `01-adr-log.md` (Tier 1): 이 문서의 설계 결정을 ADR 15+건으로 누적
- → `02-data-model-erd.md` (Tier 1): §2 L4의 PG/SQLite 스키마 상세
- → `02-architecture/03-auth-advanced.md` (Tier 2 B1): §2 L3 + Phase 15 상세
- → `02-architecture/04-observability.md` (Tier 2 B2): §2 L1+L2 Vault + Phase 16
- → `02-architecture/05-operations.md` (Tier 2 B2): §5 배포 토폴로지 구체화
- → `02-architecture/06-auth-core.md` (Tier 2 B1): §2 L2 + Phase 17
- → `02-architecture/07-storage.md` (Tier 2 B3): §2 L4 SeaweedFS
- → `02-architecture/08-sql-editor.md` (Tier 2 B4): §2 L6 SQL + Phase 18
- → `02-architecture/09-table-editor.md` (Tier 2 B4): §2 L6 Table
- → `02-architecture/10-edge-functions.md` (Tier 2 B3): §2 L5 3층
- → `02-architecture/11-realtime.md` (Tier 2 B5): §2 L5 2계층
- → `02-architecture/12-schema-visualizer.md` (Tier 2 B6): §2 L6 Schema
- → `02-architecture/13-db-ops.md` (Tier 2 B6): §2 L4 DB Ops
- → `02-architecture/14-advisors.md` (Tier 2 B6): §2 L6 3-Layer
- → `02-architecture/15-data-api.md` (Tier 2 B5): §2 L7 REST+pgmq
- → `02-architecture/16-ux-quality.md` (Tier 2 B7): §2 L8 AI+MCP
- → `03-ui-ux/00~04` (Tier 3 U1): §2 L8 + §4.6, §4.7 기반 디자인 시스템
- → `04-integration/00~03` (Tier 3 I1/I2): §5 배포 토폴로지 + Cloudflare/PG 확장/외부

---

> **시스템 개요 끝.** Wave 4 · A1 · 2026-04-18 · 양평 부엌 서버 대시보드 — Supabase 100점 동등성 아키텍처 마스터 지도.
