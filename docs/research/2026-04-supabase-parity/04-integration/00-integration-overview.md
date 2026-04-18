# 00. Integration Overview — 양평 부엌 서버 대시보드 통합 아키텍처 지도

> **Wave 4 · Tier 3 · I1 Integration 클러스터 (Agent I1-A)**
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [04-integration/](./) → **이 문서**
> 연관: [02-architecture/00-system-overview.md](../02-architecture/00-system-overview.md) · [02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) · [01-postgres-extensions-integration.md](./01-postgres-extensions-integration.md)
> ADR 참조: ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008, ADR-009, ADR-010, ADR-011, ADR-012, ADR-013, ADR-014, ADR-015, ADR-016, ADR-017, ADR-018

---

## 목차

- [0. 문서 목적](#0-문서-목적)
- [1. 통합 패러다임](#1-통합-패러다임)
- [2. 내부 통합 (카테고리 간)](#2-내부-통합-카테고리-간)
- [3. 외부 시스템 통합 맵](#3-외부-시스템-통합-맵)
- [4. 통합 프로토콜 카탈로그](#4-통합-프로토콜-카탈로그)
- [5. 이벤트 카탈로그](#5-이벤트-카탈로그)
- [6. 에러 전파 규칙](#6-에러-전파-규칙)
- [7. 폴백 전략 카탈로그](#7-폴백-전략-카탈로그)
- [8. Cross-cutting 통합](#8-cross-cutting-통합)
- [9. Wave 5 스파이크 연계](#9-wave-5-스파이크-연계)
- [10. ADR 참조 테이블](#10-adr-참조-테이블)
- [부록 Z. 근거 인덱스](#부록-z-근거-인덱스)

---

## 0. 문서 목적

### 0.1 이 문서의 역할

이 문서는 양평 부엌 서버 대시보드의 **모든 통합 계약을 한눈에 보는 지도**다. Wave 4 Tier 2에서 작성된 14개 Blueprint 각각이 "자신의 카테고리 내부"를 다룬다면, 이 문서는 "카테고리 간 경계"와 "외부 시스템과의 경계"를 명시한다.

구체적으로 다음을 정의한다:

1. 14 카테고리 Blueprint 사이에서 데이터·이벤트가 어떤 방식으로 흐르는가
2. Cloudflare, B2, Anthropic, Slack/Discord 등 외부 시스템과 양평 내부가 어떻게 연결되는가
3. 각 통합 경계에서 발생하는 에러가 어떻게 전파되고 처리되는가
4. 통합 포인트에서 장애가 발생했을 때 시스템이 어떻게 폴백하는가

### 0.2 이 문서를 읽어야 하는 경우

| 상황 | 참조 섹션 |
|------|----------|
| "A 카테고리에서 B 카테고리로 어떻게 신호가 가는가?" | §2 내부 통합 표 |
| "Cloudflare Tunnel을 통해 어떤 프로토콜이 흐르는가?" | §3.1, §4 |
| "wal2json 실패 시 시스템이 어떻게 동작하는가?" | §7.1, §6 |
| "새 외부 서비스를 연결하려면 어떤 절차를 따르는가?" | §3 + ADR 등록 절차 |
| "Wave 5에서 어떤 통합이 추가로 검증되어야 하는가?" | §9 |

### 0.3 문서 범위 외

- 각 카테고리 내부의 컴포넌트 설계 → 해당 Blueprint 참조
- PostgreSQL 확장 설치 절차 → `01-postgres-extensions-integration.md`
- UI/UX 통합 → `03-ui-ux/` 문서 참조

---

## 1. 통합 패러다임

### 1.1 "외부 의존 최소화" 원칙이 탄생한 이유

양평 부엌 서버 대시보드는 의도적으로 외부 서비스 의존을 최소화한다. 이 원칙은 단순한 비용 절감(AP-5, CON-9 월 $10 이하) 이상의 아키텍처적 의도를 담고 있다.

**원인 1 — 데이터 주권 (AP-2, CON-12)**

Supabase Cloud를 사용하면 PostgreSQL 데이터가 해외 서버에 저장된다. 양평은 한국 내 데이터 주권을 명시적 원칙으로 채택한다(CON-12). 외부 클라우드 전송은 두 가지만 허용된다: (a) Cloudflare Tunnel HTTPS 전송(TLS 암호화), (b) B2 백업(AES-256-GCM envelope 암호화 후 PUT). 나머지 모든 데이터는 로컬 디스크에 유지된다.

**원인 2 — 1인 운영 가능성 (AP-1, CON-3)**

외부 의존이 늘어날수록 장애 지점도 늘어난다. 김도영 1인이 24/7 on-call 없이 운영해야 하는 환경에서, 외부 서비스의 장애가 핵심 기능 불능으로 이어지면 안 된다. "자체 대기 전략(폴백)"이 없는 외부 의존은 원천 차단한다.

**원인 3 — 예산 (AP-5, CON-9)**

월 $10 이하 예산이라는 제약은 "당연히 쓰면 편한" SaaS 솔루션을 하나씩 걸러낸다. Redis($0/월 Upstash 가능하지만 추가 장애 지점), Datadog($30/월+), AWS KMS($1/월+) 모두 이 기준으로 거절됐다.

### 1.2 "내부 카테고리 간 명확한 계약" 원칙의 근거

14개 카테고리 Blueprint가 각자 독립적으로 작성되지만, 이들이 실제 동작하려면 서로 명확한 계약이 필요하다. 양평은 다음 3가지 계약 유형을 사용한다:

**API 계약**: REST/Route Handler 인터페이스. Next.js 16 App Router의 Route Handler가 카테고리 간 HTTP 기반 호출의 단일 진입점. `00-system-overview.md §2 AP-4`가 정의한 "외부 SDK 최소화" 원칙에 따라 SDK 없이 fetch/Server Action으로 직접 호출한다.

**이벤트 계약**: Node.js EventEmitter 또는 PostgreSQL LISTEN/NOTIFY. 동기 호출이 불필요한 경우(예: CDC 변경 → 캐시 무효화)에 사용. 카탈로그는 §5에 정의.

**DB 계약**: 공유 PostgreSQL 스키마를 통한 데이터 공유. 한 카테고리가 다른 카테고리의 테이블에 직접 쓰지 않는다. 읽기는 Prisma의 `include`/`select`로 허용하되, 쓰기는 해당 카테고리의 Route Handler 또는 Server Action을 통해서만 한다.

### 1.3 9-레이어 구조와 통합 방향성

`00-system-overview.md §2`의 9-레이어 구조(ADR-018)가 통합 방향성을 규정한다:

```
L8 UX Quality (AI SDK v6)
  ↓ 호출
L7 Data API (REST + pgmq + [조건부] pg_graphql)
  ↓ 호출
L6 개발자 도구 (SQL Editor, Table Editor, Schema Viz, Advisors)
  ↓ 호출
L5 Compute (Edge Functions 3층, Realtime 2계층)
  ↓ 읽기/쓰기
L4 데이터 저장 (PostgreSQL, SQLite, SeaweedFS, B2)
  ↓ 인증 컨텍스트
L3 Auth Advanced (TOTP, WebAuthn, Rate Limit)
  ↓ 기반
L2 Auth Core + Vault (jose JWT, AES-256-GCM)
  ↓ 기반
L1 Observability + Operations (PM2, wal-g, Capistrano)
  ↓ 인프라
L0 인프라 (PostgreSQL 프로세스, WSL2, Cloudflare Tunnel)
```

**통합 방향 규칙**:
- 상위 레이어 → 하위 레이어: 허용 (호출 방향)
- 하위 레이어 → 상위 레이어: **금지** (역방향 의존)
- 같은 레이어 내 수평: 허용 (같은 L5의 Edge Fn ↔ Realtime 이벤트 공유 등)
- 스킵 (L8 → L4 직접): 허용 (Prisma 직접 호출 패턴)

---

## 2. 내부 통합 (카테고리 간)

### 2.1 내부 통합 전체 표

아래 표는 Wave 4 Blueprint에서 도출된 카테고리 간 통합 계약 20개 이상을 망라한다. "방식" 컬럼의 약어: API=Route Handler 호출, Event=EventEmitter/NOTIFY, DB=공유 테이블 읽기, Action=Server Action 호출.

| # | Source 카테고리 | Target 카테고리 | 통합 방식 | 통합 내용 | Blueprint 참조 |
|---|---------------|---------------|---------|---------|--------------|
| I-01 | Observability (12) | Auth Core (5) | DB | Vault MASTER_KEY로 JWT 서명 키(KEK) 보호. `vault_secrets` 테이블에서 `jwt_signing_key` DEK 조회 | `04-observability-blueprint.md §7` |
| I-02 | Auth Core (5) | Auth Advanced (6) | DB + Event | JWT 클레임에 `mfa_verified` 플래그 포함. TOTP/WebAuthn 검증 완료 시 Auth Core 세션 테이블의 `mfa_verified_at` 업데이트 | `06-auth-core-blueprint.md §7` |
| I-03 | Auth Advanced (6) | Observability (12) | API | WebAuthn Credential 등록 시 JWKS ES256 공개키 활용. JWT 발급 시 `kid` 클레임에 현재 활성 JWKS KID 포함 → `/.well-known/jwks.json` 검증 | `03-auth-advanced-blueprint.md §3` |
| I-04 | Auth Core (5) | DB Ops (4) | Event | `auth.session.created` 이벤트 발생 시 DB Ops의 Webhook Dispatcher가 선택적 알림 발송 (관리자 설정 기반) | `13-db-ops-blueprint.md §3.2` |
| I-05 | DB Ops (4) | Observability (12) | DB | `cron_job_runs` 테이블의 성공/실패 기록 → Observability의 `audit_log` 테이블로 동기 기록 (CronJobRun 모델 공유) | `13-db-ops-blueprint.md §5` |
| I-06 | Realtime (9) | Data API (11) | Event | CDC Layer(`CdcBus`)의 `change` 이벤트가 Data API의 pgmq 큐에 `cache-bust` 메시지 발행. 읽기 캐시 무효화 트리거 | `11-realtime-blueprint.md §2` |
| I-07 | Data API (11) | Realtime (9) | API | GraphQL Subscription 요청(조건부)을 `/realtime/v1` WebSocket 채널로 위임. `pg_graphql` 도입 시 활성화 | `15-data-api-blueprint.md §2` |
| I-08 | Realtime (9) | Auth Core (5) | API | WebSocket 연결 시 JWT Bearer 검증. `TokenRefresher`가 15분마다 `jose jwtVerify()` 호출. 만료 토큰은 연결 종료 | `11-realtime-blueprint.md §4` |
| I-09 | Edge Functions (8) | Storage (7) | API | Function 내부에서 `/api/v1/storage/buckets/{bucket}/objects` Route Handler 호출. SeaweedFS 직접 접근 금지 (AP-4) | `10-edge-functions-blueprint.md §4` |
| I-10 | Storage (7) | DB Ops (4) | Event | Hot→Cold 이전 트리거: `storage.file.uploaded` 이벤트 + node-cron 일 1회 오래된 파일 B2 이전 스케줄 | `07-storage-blueprint.md §5` |
| I-11 | SQL Editor (2) | Data API (11) | DB | `query_history` 테이블 쓰기가 Data API의 OpenAPI 스펙에서 제외되는 테이블 목록에 포함 (내부 메타 테이블 숨기기) | `08-sql-editor-blueprint.md §6` |
| I-12 | SQL Editor (2) | Advisors (10) | API | EXPLAIN Visualizer 실행 결과를 Advisors Layer 2(squawk 패턴)의 slow_query_report에 동기화 | `08-sql-editor-blueprint.md §7` |
| I-13 | Table Editor (1) | Schema Viz (3) | DB | `information_schema.columns` + Prisma DMMF 공유. Table Editor의 컬럼 메타데이터를 Schema Viz ERD 렌더링에 재사용 | `09-table-editor-blueprint.md §6` |
| I-14 | Schema Viz (3) | Advisors (10) | API | schemalint 룰 엔진 결과(Layer 1 컨벤션 위반)를 Schema Viz의 "경고" 오버레이에 표시. 같은 TS 포팅 코드 공유 | `12-schema-visualizer-blueprint.md §5` |
| I-15 | Advisors (10) | DB Ops (4) | Event | splinter 38룰 포팅(Layer 3)이 slow query 감지 시 DB Ops의 Slack Notifier에 `advisor.slow_query` 이벤트 전송 | `14-advisors-blueprint.md §4` |
| I-16 | Auth Advanced (6) | Edge Functions (8) | API | Edge Function 실행 전 Auth Advanced Rate Limit 체크. `rate_limit_events` 카운터 기반으로 초당 호출 수 제한 | `10-edge-functions-blueprint.md §3` |
| I-17 | Observability (12) | Operations (14) | DB | `audit_log` 테이블의 배포 이벤트(`deployment.started`, `deployment.completed`, `deployment.rolled_back`) 기록. Operations의 Capistrano-style symlink 교체 직전/직후 삽입 | `05-operations-blueprint.md §5` |
| I-18 | Operations (14) | Auth Core (5) | API | Canary 배포 시 `canary.stylelucky4u.com`(localhost:3002)의 Health Check에서 Auth Core JWT 발급 엔드포인트 상태 확인. `/api/v1/auth/health` 200 필수 | `05-operations-blueprint.md §6` |
| I-19 | UX Quality (13) | Data API (11) | API | AI Assistant의 "자연어 쿼리" 기능이 `mcp-luckystyle4u`를 통해 Data API의 REST 엔드포인트 호출. AI가 직접 Prisma 접근 금지 (AP-4) | `16-ux-quality-blueprint.md §3` |
| I-20 | UX Quality (13) | SQL Editor (2) | Action | AI의 "쿼리 설명/최적화" 기능이 SQL Editor의 `query_history` 마지막 쿼리를 Server Action으로 읽어서 Anthropic API에 전달 | `16-ux-quality-blueprint.md §4` |
| I-21 | Data API (11) | DB Ops (4) | Event | pgmq의 `dead_letter` 큐에 메시지 누적 시 DB Ops의 `dead-letter-handler.ts`가 Slack 알림 발송 + `webhook_dead_letters` 테이블 기록 | `15-data-api-blueprint.md §3.2` |
| I-22 | Auth Core (5) | Table Editor (1) | API | Table Editor의 RLS 시뮬레이션이 Auth Core의 현재 세션 컨텍스트(`auth.uid()`, RBAC role)를 `SET LOCAL role` + `SET LOCAL request.jwt.claims`로 주입. Server Action 통해 전달 | `09-table-editor-blueprint.md §5` |
| I-23 | Realtime (9) | Operations (14) | Event | Replication Slot(`ypb_cdc_slot`) 지연 메트릭을 Operations의 Health Check 페이지에 노출. `/api/v1/realtime/slot-lag` 폴링 | `11-realtime-blueprint.md §6` |
| I-24 | Schema Viz (3) | Data API (11) | DB | `pg_graphql` 조건부 도입 시 Schema Viz가 Prisma DMMF를 읽어 `pg_graphql introspection` 결과와 diff 비교. 불일치 시 CI 실패 트리거 (DQ-1.27) | `12-schema-visualizer-blueprint.md §7` |

### 2.2 레이어 간 통합 흐름 다이어그램

```
┌──────────────────────────────────────────────────────────────────────┐
│ L8 UX Quality                                                         │
│   AI SDK v6 → [I-19] → Data API REST   [I-20] → SQL Editor query    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ 호출
┌──────────────────────────▼───────────────────────────────────────────┐
│ L7 Data API                                                           │
│   pgmq Worker → [I-21] → DB Ops dead-letter                         │
│   pgmq cache-bust ← [I-06] ← Realtime CDC                           │
│   [I-07] GraphQL Subscription → Realtime Channel                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ 호출
┌──────────────────────────▼───────────────────────────────────────────┐
│ L6 개발자 도구                                                         │
│   SQL Editor [I-12] → Advisors slow_query                           │
│   Table Editor [I-13] ← Schema Viz DMMF 공유                        │
│   Schema Viz [I-14] → Advisors schemalint 오버레이                  │
│   Schema Viz [I-24] → Data API introspection diff (조건부)          │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ 호출
┌──────────────────────────▼───────────────────────────────────────────┐
│ L5 Compute                                                            │
│   Edge Fn [I-09] → Storage Route Handler                            │
│   Realtime CDC [I-06] → Data API pgmq                               │
│   Realtime [I-08] → Auth Core JWT 검증                               │
│   Realtime [I-23] → Operations slot-lag                             │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ 읽기/쓰기
┌──────────────────────────▼───────────────────────────────────────────┐
│ L4 데이터 저장                                                         │
│   Storage [I-10] → DB Ops Hot→Cold B2 이전                          │
│   DB Ops [I-05] → Observability audit_log                           │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ 인증 컨텍스트
┌──────────────────────────▼───────────────────────────────────────────┐
│ L3 Auth Advanced                                                      │
│   [I-16] Rate Limit → Edge Fn 호출 게이트                            │
│   [I-03] JWKS 활용 → JWT 발급 검증                                   │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ 기반
┌──────────────────────────▼───────────────────────────────────────────┐
│ L2 Auth Core + Observability                                          │
│   [I-01] Vault → Auth Core JWT 서명 키                               │
│   [I-02] Auth Core → Auth Advanced MFA 검증                         │
│   [I-04] Auth Core session → DB Ops Webhook 알림                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ 기반
┌──────────────────────────▼───────────────────────────────────────────┐
│ L1 Operations                                                         │
│   [I-17] Operations 배포 → Observability audit_log                  │
│   [I-18] Operations Canary → Auth Core Health Check                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 외부 시스템 통합 맵

### 3.1 Cloudflare 통합

양평은 Cloudflare의 여러 제품 중 일부만 사용하고 나머지는 명시적으로 사용하지 않는다.

#### 3.1.1 Cloudflare Tunnel (채택 — CON-2 핵심)

**역할**: WSL2 내부의 `127.0.0.1:3000` → 인터넷 공개 `stylelucky4u.com` 연결.

**통합 방식**:
```
브라우저 → HTTPS → Cloudflare Edge
  → cloudflared 에이전트 (WSL2 내 systemd 서비스)
    → http://127.0.0.1:3000 (Next.js)
```

**설정 계약**:
- `cloudflared` 서비스: WSL2 Ubuntu 22.04 systemd unit
- 터널 UUID: `/etc/cloudflared/config.yml` 보관
- 프로토콜: QUIC 우선, HTTP/2 폴백 (§7.2 폴백 전략)
- WebSocket: `wss://stylelucky4u.com/realtime/v1` 경로에 Cloudflare WebSocket 지원 활성화 (`no_tls_verify: false`, `http2: true`)
- SSE: `text/event-stream` Content-Type 응답 → Cloudflare HTTP/2 서버 푸시 비활성 상태에서 일반 청크 스트리밍

**실 클라이언트 IP 추출**:
```typescript
// src/server/utils/get-real-ip.ts
export function getRealIP(req: NextRequest): string {
  return req.headers.get('CF-Connecting-IP')
    ?? req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    ?? 'unknown';
}
```

**Cloudflare 무료 플랜 제약 (CON-2 운영 경계)**:
- 월 트래픽 1TB 초과 시 CON-2 재검토
- `Cache-Control: private, no-store` 기본값 (PII 포함 가능 응답은 Edge 캐싱 금지 — AP-2)

#### 3.1.2 Cloudflare DNS (채택)

**역할**: `stylelucky4u.com` + `canary.stylelucky4u.com` A 레코드 관리.

**통합 계약**:
- Primary: `stylelucky4u.com` → Cloudflare Tunnel CNAME
- Canary: `canary.stylelucky4u.com` → Cloudflare Tunnel (별도 Route, localhost:3002 매핑)
- TTL: 5분 (배포 시 신속 전환 가능)

#### 3.1.3 Cloudflare Workers (미사용 — 명시적)

**거부 근거**: AP-4(Next.js 네이티브 통합)와 충돌. Edge Function은 자체 3층 하이브리드(ADR-009)로 구현. Cloudflare Workers가 Supabase와 통합하는 패턴은 양평에서 역방향.

#### 3.1.4 Cloudflare R2 (미사용 — B2로 대체)

**거부 근거**: ADR-008, AP-2(데이터 주권). 원본 저장은 SeaweedFS(로컬), 오프사이트 백업은 B2. R2는 미국 리전 불명확, 월 $0.015/GB(B2 $0.006/GB 대비 2.5배).

### 3.2 Backblaze B2 통합

**역할**: 오프사이트 콜드 백업 저장소.

**통합 방식**:
```
wal-g (WSL2) → AES-256-GCM 암호화 → B2 S3-compatible API
  → Bucket: luckystyle4u-backup (US West region)
```

**연결 설정**:
```bash
# /etc/luckystyle4u/wal-g.env (0640 root:ypb-runtime)
WALG_S3_PREFIX=s3://luckystyle4u-backup/wal-g
AWS_S3_FORCE_PATH_STYLE=true
AWS_ENDPOINT=https://s3.us-west-004.backblazeb2.com
AWS_ACCESS_KEY_ID=<B2 Application Key ID>
AWS_SECRET_ACCESS_KEY=<B2 Application Key>
WALG_LIBSODIUM_KEY=<base64-encoded-32-byte-key>
```

**통합 이벤트**:
- 매일 02:00 KST: `backup-scheduler.ts` → `wal-g backup-push` (node-cron)
- 매주 일요일 03:00 KST: 전체 base backup
- 성공/실패 시: Slack Notifier 발송

**비용 (CON-9 검증)**:
- 저장: $0.006/GB/월 × 50GB = $0.3/월 (ASM-4 50GB 가정)
- 업로드: 무료 (B2 정책)
- 다운로드: 복구 드릴 시만 발생, 월 1GB 이하 예상 $0.01

### 3.3 Anthropic API 통합

**역할**: UX Quality 카테고리의 AI Assistant 기능 백엔드.

**통합 방식**:
```
사용자 요청 (브라우저)
  → Next.js Route Handler (AI SDK v6 streamText)
    → mcp-luckystyle4u (redact 레이어)
      → Anthropic API (Claude Haiku 기본 / Sonnet 조건부)
```

**BYOK(Bring Your Own Key) 설계**:
```typescript
// src/server/ux-quality/anthropic-client.ts
import Anthropic from '@anthropic-ai/sdk';
import { getVaultSecret } from '@/lib/observability/vault-service';

export async function getAnthropicClient(): Promise<Anthropic> {
  // Vault에서 API 키 DEK 복호화 후 사용
  const apiKey = await getVaultSecret('anthropic_api_key');
  return new Anthropic({ apiKey });
}
```

**PII 보호 계약** (AP-2, CON-12):
```typescript
// src/server/ux-quality/redact-pipeline.ts
export function redactPII(query: string): string {
  // 1. 전화번호 패턴 마스킹
  // 2. 이메일 주소 마스킹
  // 3. 고유 UUID 해시화 (역추적 방지)
  // 4. Vault 시크릿 값 포함 여부 검사 (포함 시 요청 거절)
  return sanitized;
}
```

**비용 제어** (ADR-014):
- 기본 모델: Haiku ($0.25/M input tokens, $1.25/M output)
- 승격 조건: 쿼리 복잡도 ≥ 4 → Sonnet 일시 사용
- 월 예산 상한: $5 (NFR-COST.2). 초과 시 AI 기능 일시 비활성화 + Slack 알림

**데이터 비보존 계약**:
- AI 응답은 세션 종료 시 메모리에서 휘발 (디스크 기록 금지)
- `query_history` 테이블에는 원본 쿼리만 저장, AI 응답은 저장하지 않음

### 3.4 Slack/Discord Webhook 통합

**역할**: DB Ops, Data API, Observability 카테고리의 운영 알림.

**통합 방식**:
```
시스템 이벤트 → NotificationService
  → slack-notifier.ts → Slack Incoming Webhook URL
  → discord-notifier.ts → Discord Webhook URL (선택)
```

**알림 발송 트리거 목록**:

| 이벤트 | 발송 조건 | 채널 |
|--------|---------|------|
| 백업 성공/실패 | 항상 | #ops-alerts |
| Cron Job 실패 | 재시도 소진 후 | #ops-alerts |
| pgmq dead-letter 10건+ | 누적 임계치 | #data-alerts |
| WAL replication slot 지연 > 1GB | 실시간 감지 | #ops-alerts |
| AI 월 비용 > $4 (80% 임계) | 매일 체크 | #cost-alerts |
| Canary 배포 성공/실패 | 배포 시 | #deploy |
| MASTER_KEY 로드 실패 | 즉시 | #security |
| Auth brute-force 차단 10건+ | 1시간 내 | #security |

**Webhook URL 보안**:
```typescript
// Vault에 저장 (AES-256-GCM DEK)
const slackWebhookUrl = await getVaultSecret('slack_webhook_url');
const discordWebhookUrl = await getVaultSecret('discord_webhook_url');
```

**재시도 정책**:
- 최대 3회 재시도, 지수 백오프 (1s, 4s, 16s)
- 모두 실패 시 `webhook_dead_letters` 테이블 기록

### 3.5 PostgreSQL 확장 통합 (요약)

wal2json, pgmq, pg_graphql 3종 확장의 상세 통합은 `01-postgres-extensions-integration.md`에 위임. 여기서는 외부 통합 관점에서의 계약만 요약.

| 확장 | 외부 의존 | 통합 경계 |
|------|---------|---------|
| wal2json | 없음 (apt 패키지) | postgresql.conf wal_level=logical, pg_hba.conf replication 행 |
| pgmq | 없음 (pg_cron 의존 없음) | CREATE EXTENSION pgmq; 이후 Prisma $queryRaw로 접근 |
| pg_graphql (조건부) | pgrx 빌드 필요 | 트리거 2+ 충족 시 설치. 설치 전 CI introspection diff 통과 필수 |

---

## 4. 통합 프로토콜 카탈로그

양평 대시보드에서 사용하는 5가지 통합 프로토콜의 사용처와 선택 근거를 정의한다.

### 4.1 REST (HTTP/1.1 + HTTP/2)

**사용 계층**: L7 Data API, L6 개발자 도구 내부, L5 Compute(Edge Fn → Storage)

**사용처**:
- 외부 클라이언트 → `/api/v1/data/[table]` (PostgREST 80% 호환)
- Edge Function → Storage Route Handler
- Operations Health Check
- Anthropic API 호출

**선택 근거**:
- Supabase 클라이언트 SDK 호환성 요구(NFR-CMP.1) — 클라이언트가 PostgREST 방언 URL을 직접 호출하는 패턴 유지
- curl/BI 도구/모바일 클라이언트 모두 REST 사용 가능 (ADR-012, tRPC 거부 근거)

**표준**:
- JSON 응답: `{ data: T[], count: number, error: null }` 또는 `{ data: null, error: { message: string, code: string } }`
- 에러 코드: HTTP 상태 코드 + 내부 코드 (§6 참조)
- 인증: `Authorization: Bearer <JWT>` 헤더 또는 `apikey: <api_key>` 헤더

### 4.2 WebSocket

**사용 계층**: L5 Realtime Channel 계층

**사용처**:
- `wss://stylelucky4u.com/realtime/v1` — supabase-realtime 포팅(Phoenix 프레임)
- 클라이언트 측 `@supabase/realtime-js` SDK 연결점

**선택 근거**:
- CDC 변경 사항의 저지연 서버 → 클라이언트 푸시 요구 (p95 < 200ms, NFR-PERF)
- Broadcast(클라이언트 간 직접 메시지), Presence(접속자 목록) 기능은 HTTP/SSE로 구현 불가

**Cloudflare 특이사항**:
- Cloudflare HTTP/2 모드에서 WebSocket upgrade 지원 (HTTP/1.1 Upgrade 헤더 통해)
- `Connection: Upgrade`, `Upgrade: websocket` 헤더 Cloudflare Edge에서 통과

### 4.3 Server-Sent Events (SSE)

**사용 계층**: L5 Realtime CDC 보조, L1 Operations 인프라 모니터링

**사용처**:
- `/api/v1/sse` — CDC 폴백 (WebSocket 불가 시)
- `/api/v1/infrastructure/metrics` — PM2/PG/디스크 실시간 현황 (5초 갱신)
- `/api/v1/realtime/slot-lag` — Replication Slot 지연 스트리밍

**선택 근거**:
- WebSocket이 Cloudflare QUIC 터널에서 간헐적 실패 시 폴백 (§7.2)
- 서버 → 클라이언트 단방향 스트리밍에 충분
- HTTP/1.1 청크 스트리밍으로 구현 가능, 추가 프로토콜 불필요

**구현 패턴**:
```typescript
// src/app/api/v1/sse/route.ts
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      // CdcBus 구독
      cdcBus.on('change', (change) => send('change', change));
      // 연결 유지 heartbeat
      const ping = setInterval(() => send('ping', { ts: Date.now() }), 25000);
      req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

### 4.4 Webhook (HTTP POST)

**사용 계층**: L4 DB Ops, L7 Data API

**사용처**:
- DB Ops Webhook Dispatcher → 외부 서비스 알림
- pgmq Outbox 패턴 → Slack/Discord HTTP POST
- Dead-letter 재시도 → 외부 엔드포인트

**선택 근거**:
- 외부 서비스(Slack, Discord)가 수신 측이므로 공개 표준(HTTP POST + JSON) 필수
- HMAC-SHA256 서명으로 수신측 검증 가능

**서명 구현**:
```typescript
// src/lib/db-ops/webhook/hmac-signer.ts
import { createHmac } from 'node:crypto';

export function signPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = signPayload(payload, secret);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### 4.5 DB Event / LISTEN-NOTIFY

**사용 계층**: L4 DB Ops, L5 Realtime CDC(보조)

**사용처**:
- `pg_notify('ypb_internal', ...)` — DB 내부에서 Node.js 핸들러로 경량 신호 전달
- cache-bust 신호 (테이블 변경 → 읽기 캐시 무효화)
- cron-worker와 main app 간 "잡 완료" 알림

**제약**:
- NOTIFY 페이로드 크기 8000 바이트 이하 (PG 제한)
- CDC는 NOTIFY가 아닌 wal2json Logical Replication으로 처리 (ADR-010)

### 4.6 IPC (PM2 프로세스 간)

**사용 계층**: L1 Operations

**사용처**:
- `ypb-app` (Next.js, port 3000) ↔ `cron-worker` (node-cron fork)
- `ypb-app` ↔ `yp-realtime` (Realtime 서버, port 4000)
- 배포 시 `pm2 reload ypb-app` → 무중단 graceful restart

**PM2 IPC 패턴**:
```javascript
// cron-worker에서 main app으로 신호 발송
process.send({ type: 'cron_completed', jobId: 'backup-daily', success: true });

// main app에서 수신
process.on('message', (msg) => {
  if (msg.type === 'cron_completed') {
    // audit_log 기록
  }
});
```

---

## 5. 이벤트 카탈로그

양평 대시보드 내에서 발행·소비되는 주요 이벤트 15개 이상을 정의한다.

### 5.1 이벤트 스키마 표준

모든 이벤트는 다음 공통 envelope를 따른다:

```typescript
interface SystemEvent<T = unknown> {
  id: string;           // UUID v4
  type: string;         // "category.noun.verb" 형식
  ts: number;           // Unix ms timestamp
  version: '1';
  source: string;       // 발행 컴포넌트 ("auth-core", "realtime-cdc" 등)
  payload: T;
}
```

### 5.2 Auth 이벤트

#### EVT-001: `auth.session.created`

| 필드 | 값 |
|------|-----|
| **Publisher** | Auth Core — `POST /api/v1/auth/login` Route Handler |
| **Subscriber** | DB Ops Webhook Dispatcher (선택적 알림), Observability audit_log |
| **Payload Schema** | `{ userId: string, sessionId: string, ip: string, userAgent: string }` |
| **발생 조건** | 이메일/패스워드 로그인 성공, MFA 검증 완료 후 |
| **에러 시** | 세션 생성 실패 → 이벤트 미발행, HTTP 500 반환 |

#### EVT-002: `auth.mfa.challenge_succeeded`

| 필드 | 값 |
|------|-----|
| **Publisher** | Auth Advanced — TOTP 검증 또는 WebAuthn assertion 성공 직후 |
| **Subscriber** | Auth Core (`mfa_verified_at` 업데이트 트리거) |
| **Payload Schema** | `{ userId: string, method: 'totp' \| 'webauthn', challengeId: string }` |
| **발생 조건** | 6자리 TOTP 코드 일치 또는 WebAuthn authenticator assertion 검증 통과 |
| **에러 시** | 검증 실패 → 이벤트 미발행, `rate_limit_events` 카운터 증가 |

#### EVT-003: `auth.session.revoked`

| 필드 | 값 |
|------|-----|
| **Publisher** | Auth Core — 로그아웃 Route Handler, 세션 강제 취소 |
| **Subscriber** | Realtime Channel Layer(WebSocket 연결 강제 종료), audit_log |
| **Payload Schema** | `{ sessionId: string, userId: string, reason: 'logout' \| 'admin_revoke' \| 'expired' }` |
| **발생 조건** | 명시적 로그아웃, 관리자 강제 취소, 세션 만료 |

#### EVT-004: `auth.rate_limit.triggered`

| 필드 | 값 |
|------|-----|
| **Publisher** | Auth Advanced — Rate Limit 체크 미들웨어 |
| **Subscriber** | Observability audit_log, Slack Notifier (10건/시간 임계) |
| **Payload Schema** | `{ ip: string, endpoint: string, count: number, windowMs: number }` |
| **발생 조건** | 같은 IP에서 5분 내 로그인 시도 10회 초과 |

### 5.3 Storage 이벤트

#### EVT-005: `storage.file.uploaded`

| 필드 | 값 |
|------|-----|
| **Publisher** | Storage Route Handler — SeaweedFS PUT 완료 직후 |
| **Subscriber** | DB Ops (Hot→Cold 이전 스케줄 업데이트), audit_log |
| **Payload Schema** | `{ bucket: string, key: string, size: number, contentType: string, uploadedBy: string }` |
| **발생 조건** | 파일 업로드 성공 (SeaweedFS 응답 200) |

#### EVT-006: `storage.file.deleted`

| 필드 | 값 |
|------|-----|
| **Publisher** | Storage Route Handler — SeaweedFS DELETE 완료 |
| **Subscriber** | audit_log, B2 백업 메타데이터 동기화 |
| **Payload Schema** | `{ bucket: string, key: string, deletedBy: string }` |

### 5.4 Realtime CDC 이벤트

#### EVT-007: `realtime.cdc.change`

| 필드 | 값 |
|------|-----|
| **Publisher** | WALConsumer — wal2json 플러그인 디코딩 결과 |
| **Subscriber** | ChannelBroker(WebSocket 브로드캐스트), Data API pgmq cache-bust |
| **Payload Schema** | `{ table: string, schema: string, action: 'INSERT' \| 'UPDATE' \| 'DELETE', new: Record<string, unknown> \| null, old: Record<string, unknown> \| null, lsn: string }` |
| **발생 조건** | PostgreSQL WAL 로그에서 DML(INSERT/UPDATE/DELETE) 발생 |
| **RLS 필터링** | ChannelBroker가 구독자의 JWT role에 따라 행 필터링 (DQ-RT-4 답변) |

#### EVT-008: `realtime.slot.lag_high`

| 필드 | 값 |
|------|-----|
| **Publisher** | WALConsumer — 슬롯 지연 모니터링 코루틴 |
| **Subscriber** | DB Ops Slack Notifier, Operations Health Check |
| **Payload Schema** | `{ slotName: string, lagBytes: number, threshold: number }` |
| **발생 조건** | `pg_replication_slots` 조회 시 `pg_wal_lsn_diff` > 1GB |

### 5.5 Edge Function 이벤트

#### EVT-009: `edge_function.executed`

| 필드 | 값 |
|------|-----|
| **Publisher** | Edge Function 런타임 (`decideRuntime()` 완료 후) |
| **Subscriber** | audit_log, UX Quality 이벤트 히스토리 |
| **Payload Schema** | `{ fnId: string, runtime: 'isolated-vm' \| 'deno' \| 'vercel-sandbox', durationMs: number, success: boolean }` |
| **발생 조건** | 함수 실행 완료 (성공 또는 실패 모두) |

#### EVT-010: `edge_function.sandbox_escaped`

| 필드 | 값 |
|------|-----|
| **Publisher** | isolated-vm v6 감시 코드 |
| **Subscriber** | Slack Notifier(즉시), audit_log, 함수 실행 차단 |
| **Payload Schema** | `{ fnId: string, violationType: string, code: string }` |
| **발생 조건** | isolated-vm 샌드박스 탈출 시도 감지 |

### 5.6 DB Ops 이벤트

#### EVT-011: `dbops.backup.completed`

| 필드 | 값 |
|------|-----|
| **Publisher** | BackupService — wal-g backup-push 완료 후 |
| **Subscriber** | Slack Notifier, audit_log |
| **Payload Schema** | `{ type: 'full' \| 'incremental' \| 'wal', sizeBytes: number, b2Path: string, durationMs: number }` |

#### EVT-012: `dbops.cron_job.failed`

| 필드 | 값 |
|------|-----|
| **Publisher** | CronOrchestrator — RetryHandler 소진 후 |
| **Subscriber** | Slack Notifier(즉시), audit_log, `cron_job_runs` 테이블 FAILED 기록 |
| **Payload Schema** | `{ jobId: string, schedule: string, attempts: number, lastError: string }` |

### 5.7 데이터 API 이벤트

#### EVT-013: `data_api.dead_letter.accumulated`

| 필드 | 값 |
|------|-----|
| **Publisher** | PgmqWorker — dead-letter 큐 모니터링 |
| **Subscriber** | DB Ops Slack Notifier, 대시보드 알림 카드 |
| **Payload Schema** | `{ queue: string, count: number, oldestMsg: { msgId: string, enqueuedAt: string } }` |
| **발생 조건** | 특정 큐의 dead-letter 누적 10건 이상 |

#### EVT-014: `data_api.rate_limit.api_key_exceeded`

| 필드 | 값 |
|------|-----|
| **Publisher** | API Keys v2 Rate Limit 미들웨어 |
| **Subscriber** | audit_log, 선택적 Slack 알림 |
| **Payload Schema** | `{ apiKeyId: string, endpoint: string, count: number, windowMs: number }` |

### 5.8 Observability 이벤트

#### EVT-015: `vault.key.rotation_due`

| 필드 | 값 |
|------|-----|
| **Publisher** | VaultService — DEK 회전 스케줄러 |
| **Subscriber** | Slack Notifier, Operations 운영자 체크리스트 |
| **Payload Schema** | `{ secretId: string, createdAt: string, rotationDue: string, daysRemaining: number }` |
| **발생 조건** | DEK 생성일로부터 365일 이내 30일 전 |

#### EVT-016: `observability.master_key.load_failed`

| 필드 | 값 |
|------|-----|
| **Publisher** | VaultService — 프로세스 시작 시 `/etc/luckystyle4u/secrets.env` 로드 |
| **Subscriber** | PM2 restart hook, Slack Notifier(즉시, 최고 우선순위) |
| **Payload Schema** | `{ error: string, pid: number, env: string }` |
| **발생 조건** | 파일 없음, 권한 오류, 형식 오류 등 MASTER_KEY 로드 불가 시 |

---

## 6. 에러 전파 규칙

### 6.1 에러 코드 체계

양평 대시보드의 에러 코드는 4자리 숫자 + 카테고리 접두사로 구성된다:

```
{CATEGORY}-{HTTP_STATUS}-{INTERNAL_CODE}

예: AUTH-401-001 → Auth 카테고리, HTTP 401, 내부 코드 001 (JWT 만료)
    DATA-422-003 → Data API, HTTP 422, 내부 코드 003 (잘못된 필터)
    OPS-500-007  → Operations, HTTP 500, 내부 코드 007 (배포 실패)
```

**카테고리 접두사**:

| 접두사 | 카테고리 |
|--------|---------|
| AUTH | Auth Core (5) |
| MFA | Auth Advanced (6) |
| STORE | Storage (7) |
| EDGE | Edge Functions (8) |
| RT | Realtime (9) |
| DATA | Data API (11) |
| VAULT | Observability/Vault (12) |
| OPS | Operations (14) |
| DB | DB Ops (4) |
| SYS | 시스템 레벨 (Cross-cutting) |

### 6.2 통합 경계 에러 매핑

통합 경계를 넘을 때 에러가 어떻게 변환되는지 정의한다.

#### 6.2.1 pgmq 실패 → Webhook 재시도 → Dead-letter → Slack 알림

```
pgmq 메시지 처리 실패
  ↓ PgmqWorker가 포착
  ↓ RetryHandler: 최대 3회, 지수 백오프 (1s, 4s, 16s)
  ↓ 3회 모두 실패
  ↓ dead_letter 큐로 이동 (pgmq.dead_letter_QUEUE_NAME)
  ↓ DeadLetterHandler가 `webhook_dead_letters` 테이블에 기록
  ↓ 누적 10건 시 EVT-013 발행
  ↓ Slack Notifier → #data-alerts
  ↓ 관리자 수동 재처리 (대시보드 UI)

에러 코드: DATA-500-DLQ
```

#### 6.2.2 wal2json WAL Consumer 실패 → Realtime 서비스 저하

```
WALConsumer 연결 끊김
  ↓ pg-logical-replication 자동 재연결 (최대 5회, 5초 간격)
  ↓ 재연결 성공: 마지막 확인 LSN부터 재개 (AT-LEAST-ONCE)
  ↓ 5회 실패 시: CdcBus emit('error', RT-503-CDC)
  ↓ ChannelBroker가 SSE 폴백 모드로 전환
  ↓ 클라이언트에게 "realtime.degraded" 이벤트 전송
  ↓ EVT-008 슬롯 지연 모니터링 계속 → Slack 알림

에러 코드: RT-503-CDC (CDC 계층 불가, Channel 계층은 Broadcast/Presence 유지)
```

#### 6.2.3 Anthropic API 실패 → AI Assistant 비활성

```
Anthropic API 호출 실패 (4xx / 5xx / 타임아웃)
  ↓ AI SDK v6 에러 포착
  ↓ 재시도 없음 (BYOK 호출은 사용자 요청 기반)
  ↓ HTTP 503 + { error: "AI_UNAVAILABLE", fallback: "수동 쿼리 작성 필요" }
  ↓ 대시보드 AI Assistant 패널 "현재 이용 불가" 표시
  ↓ 에러 로그 기록 (Pino JSON)

에러 코드: UX-503-AI (사용자에게 우아한 저하 안내)
```

#### 6.2.4 Vault MASTER_KEY 로드 실패 → 프로세스 시작 중단

```
PM2가 ypb-app 시작
  ↓ VaultService 초기화
  ↓ /etc/luckystyle4u/secrets.env 로드 실패
  ↓ EVT-016 발행
  ↓ Slack 알림 (최고 우선순위)
  ↓ 프로세스 exit code 1 (PM2 restart 루프 진입)
  ↓ PM2가 max_restarts 초과 시 errored 상태로 중지
  ↓ 운영자 수동 개입 필수

에러 코드: VAULT-500-MASTER_KEY (기동 불가, 복구는 파일 복원 후 pm2 start)
```

#### 6.2.5 SeaweedFS 다운 → Storage 기능 저하

```
Storage Route Handler에서 SeaweedFS 접근 실패
  ↓ 3회 재시도 (1s, 3s, 9s)
  ↓ 모두 실패 시: STORE-503-SEAWEED
  ↓ 업로드 요청: 실패 (재시도 안내)
  ↓ 다운로드 요청: 실패 (캐시된 CDN URL 있으면 리다이렉트, 없으면 404)
  ↓ B2는 백업 전용 — SeaweedFS 대체 불가 (AP-2 데이터 주권)
  ↓ EVT: storage.service.degraded → Slack 알림

에러 코드: STORE-503-SEAWEED
```

### 6.3 HTTP 에러 → 내부 에러 코드 매핑 표

| HTTP 상태 | 의미 | 내부 코드 예시 |
|----------|------|-------------|
| 400 | 잘못된 요청 파라미터 | DATA-400-001 (잘못된 필터 연산자) |
| 401 | 인증 필요 | AUTH-401-001 (JWT 만료), AUTH-401-002 (JWT 없음) |
| 403 | 권한 없음 | AUTH-403-001 (RLS 차단), AUTH-403-002 (RBAC role 부족) |
| 412 | 전제조건 실패 | DATA-412-001 (낙관적 락 충돌) |
| 422 | 처리 불가 요청 | DATA-422-001 (스키마 검증 실패) |
| 428 | 전제조건 필수 | DATA-428-001 (If-Match 헤더 없음) |
| 429 | 요청 한도 초과 | MFA-429-001 (Rate Limit 초과) |
| 500 | 서버 내부 오류 | SYS-500-001 (Prisma 연결 실패) |
| 503 | 서비스 불가 | RT-503-CDC, STORE-503-SEAWEED |

---

## 7. 폴백 전략 카탈로그

양평 대시보드의 "자동 저하(graceful degradation)" 전략을 카탈로그화한다.

### 7.1 Realtime 폴백 — WebSocket 불가 시 SSE 폴링

**트리거**: WebSocket 연결 3회 실패 또는 Cloudflare WebSocket 오류

**폴백 절차**:
```
1. 클라이언트 RealtimeClient가 ws:// 연결 실패 감지
2. "realtime.connection.failed" 이벤트 발행
3. RealtimeClient가 SSE 모드로 자동 전환
   → GET /api/v1/sse (EventSource 기반)
4. 서버 측: CdcBus 이벤트를 SSE 청크로 스트리밍
5. 폴링 간격: 5초 (SSE heartbeat + 클라이언트 재연결)
6. WebSocket 복구 시: 자동 재전환 (30초마다 ws:// 재시도)

성능 영향:
- 정상: p95 < 200ms (WebSocket)
- 폴백: p95 < 5100ms (SSE 5초 간격)
- 폴백 시 사용자에게 "실시간 업데이트 지연 중" 배너 표시
```

### 7.2 Cloudflare Tunnel 프로토콜 폴백 — QUIC → HTTP/2

**트리거**: Cloudflare Tunnel이 QUIC(UDP) 연결 불가 환경 감지

**폴백 절차**:
```
1. cloudflared가 시작 시 QUIC 터널 시도
2. UDP 443 차단 환경 (일부 기업 방화벽) 감지 시
3. 자동으로 HTTP/2 over TLS(TCP 443)로 폴백
4. 사용자 측 변화 없음 (투명한 폴백)

주의: HTTP/2 폴백 환경에서 WebSocket upgrade 지원:
- HTTP/2 CONNECT 메서드 활용 (RFC 8441 WebSocket over HTTP/2)
- Cloudflare Edge에서 지원 확인됨 (spike-002-sse-result.md 참조)

성능 영향:
- QUIC: 평균 지연 ~2ms 감소 (멀티플렉싱 + 0-RTT)
- HTTP/2: +3~8ms (TCP 핸드셰이크 추가)
- 양평 목표(p95 < 800ms) 내 허용 범위
```

### 7.3 B2 미응답 → SeaweedFS 단독 유지

**트리거**: wal-g backup-push 중 B2 API 응답 없음 (타임아웃 30초)

**폴백 절차**:
```
1. BackupService가 B2 PUT 실패 감지
2. EVT: dbops.backup.failed 발행 → Slack 알림 즉시
3. SeaweedFS 로컬 볼륨은 영향 없음 (독립적으로 계속 운영)
4. 서비스 기능(조회/수정/업로드) 100% 유지
5. 백업 재시도: 다음 스케줄 (다음날 02:00 KST)
6. 7일 내 B2 복구 안 되면: 수동 드릴 (BackupService 직접 호출)

데이터 위험:
- 로컬 PostgreSQL: 정상 동작, 데이터 손실 없음
- RPO: B2 미응답 기간 × 1일 = 최대 7일 (재시도 실패 누적 시)
- 완화: SeaweedFS 로컬 스냅샷 주간 + 이메일 수동 알림
```

### 7.4 Anthropic API 실패 → AI Assistant 비활성

**트리거**: HTTP 5xx, 타임아웃 10초, 월 비용 임계 초과

**폴백 절차**:
```
1. AI SDK v6 호출 실패 / 예산 임계 초과
2. 에러: UX-503-AI
3. AI Assistant 패널: "AI 서비스를 일시적으로 이용할 수 없습니다"
4. 대안 제시: "SQL Editor에서 직접 쿼리를 작성하세요"
5. 나머지 기능(Table Editor, SQL Editor 등) 100% 유지
6. 예산 임계 초과: Slack #cost-alerts + AI 기능 자동 비활성화

성능 영향:
- AI 기능만 비활성, 핵심 관리 기능 무영향
- 이것이 ADR-014에서 LangChain 대신 AI SDK v6를 선택한 이유 중 하나
```

### 7.5 pm2 ypb-app 크래시 → 자동 재시작

**트리거**: ypb-app 비정상 종료 (unhandledRejection, OOM 등)

**폴백 절차**:
```
1. PM2 crash 감지 → 즉시 재시작 (cluster:4 중 나머지 3 인스턴스 유지)
2. `max_restarts: 10`, `restart_delay: 4000ms` (지수 백오프 아님)
3. 10회 이내: 자동 복구 (다운타임 0 — cluster:4 때문)
4. 10회 초과: PM2 errored 상태 → Slack 알림 → 수동 개입
5. cron-worker는 별도 프로세스 → ypb-app 크래시와 무관하게 유지

다운타임: 0 (cluster:4 로드밸런싱)
```

### 7.6 Replication Slot 지연 누적 → WAL 보관 전략

**트리거**: `pg_wal_lsn_diff` > 1GB (EVT-008 기준)

**폴백 절차**:
```
1. WALConsumer가 슬롯 지연 모니터링 (매 60초 pg_replication_slots 조회)
2. 지연 > 1GB: EVT-008 발행 → Slack 알림
3. 지연 > 2GB: CdcBus 일시 중단 + WALConsumer 재시작 (LSN 재동기화)
4. 지연 > max_slot_wal_keep_size(2GB): 슬롯 자동 비활성화 위험
   → 즉시 수동 개입 안내: "pg_drop_replication_slot('ypb_cdc_slot')" 후 재생성
5. Realtime 기능: SSE 폴백 모드 전환 (§7.1)

예방: max_slot_wal_keep_size = 2GB 설정으로 디스크 폭발 방지
```

---

## 8. Cross-cutting 통합

### 8.1 Observability — 모든 통합 로그

Observability 카테고리(카테고리 12)는 모든 통합 경계에서 발생하는 이벤트를 투명하게 기록하는 역할을 한다.

**로깅 표준 (Pino JSON)**:

모든 통합 경계 진입/이탈 시 Pino 구조화 로그 필수:
```typescript
// src/lib/observability/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { pid: process.pid, host: hostname() },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// 통합 경계 로깅 헬퍼
export function logIntegration(
  source: string,
  target: string,
  action: string,
  meta: Record<string, unknown>
) {
  logger.info({ integration: { source, target, action }, ...meta });
}
```

**audit_log 기록 대상 (Observability 테이블)**:

| 이벤트 | audit_log 기록 여부 |
|--------|-------------------|
| 모든 Auth 이벤트 (EVT-001~004) | 항상 기록 |
| Storage 업로드/삭제 (EVT-005~006) | 항상 기록 |
| Edge Function 실행 (EVT-009) | 항상 기록 |
| DB Ops 백업/Cron (EVT-011~012) | 항상 기록 |
| Data API dead-letter (EVT-013) | 항상 기록 |
| Vault 키 회전 (EVT-015~016) | 항상 기록 (최고 중요도) |
| Realtime CDC 이벤트 (EVT-007) | 샘플링 1% (볼륨 과다) |
| AI API 호출 (UX Quality) | 에러 시만 기록 (PII 보호) |

**감사 로그 보존**:
- `audit_log` 테이블: append-only, DELETE 금지
- 보존 기간: 90일 (node-cron 매일 정리, 90일 이전 행 삭제)
- 보존 대상 예외: VAULT, AUTH 카테고리는 365일

### 8.2 Operations — 배포 시 통합 포인트 검증

Capistrano-style 배포(ADR-015)에서 각 통합 포인트가 정상인지 검증하는 단계를 포함한다.

**배포 전 통합 포인트 체크리스트**:

```bash
# scripts/deploy/integration-health-check.sh

echo "=== 배포 전 통합 포인트 검증 ==="

# 1. PostgreSQL 연결 + wal2json 확장 확인
psql -U ypb_app -d luckystyle4u -c "SELECT extname FROM pg_extension WHERE extname IN ('wal2json', 'pgmq');"

# 2. WAL 레벨 확인
psql -U ypb_app -d luckystyle4u -c "SHOW wal_level;"

# 3. B2 연결 테스트
wal-g st ls luckystyle4u-backup/ --config /etc/luckystyle4u/wal-g.env

# 4. Cloudflare Tunnel 상태
cloudflared tunnel info luckystyle4u-tunnel

# 5. Slack Webhook 테스트
curl -s -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-type: application/json' \
  --data '{"text":"배포 전 통합 테스트 OK"}'

# 6. MASTER_KEY 로드 가능 여부
node -e "require('/etc/luckystyle4u/secrets.env'); console.log('MASTER_KEY OK')"

echo "=== 모든 통합 포인트 정상 ==="
```

**배포 후 통합 검증 (Smoke Test)**:

```typescript
// scripts/deploy/post-deploy-smoke-test.ts
const checks = [
  { name: 'Auth JWT 발급', url: '/api/v1/auth/health' },
  { name: 'Data API REST', url: '/api/v1/data/menu?limit=1' },
  { name: 'Realtime Slot', url: '/api/v1/realtime/slot-lag' },
  { name: 'JWKS 엔드포인트', url: '/.well-known/jwks.json' },
  { name: 'Storage 버킷 목록', url: '/api/v1/storage/buckets' },
];

for (const check of checks) {
  const res = await fetch(`https://stylelucky4u.com${check.url}`);
  if (!res.ok) throw new Error(`${check.name} 실패: ${res.status}`);
  console.log(`✓ ${check.name}`);
}
```

---

## 9. Wave 5 스파이크 연계

Wave 5에서 추가 PoC(스파이크)가 필요한 통합 포인트를 식별한다.

### 9.1 spike-005 Edge Functions 통합 검증

**현황**: ADR-009의 `decideRuntime()` 라우터가 설계만 완성된 상태. Edge Fn → Storage 통합(I-09)이 실제 isolated-vm / Deno 사이드카에서 동작하는지 미검증.

**Wave 5 스파이크 목표**:
1. isolated-vm v6 내에서 `fetch('/api/v1/storage/...')` 호출 가능 여부 (샌드박스 fetch 제한 확인)
2. Deno 사이드카에서 Prisma 7 Client 사용 가능 여부 (Node.js native binding 의존성)
3. `decideRuntime()` 라우터 실제 구현 후 Edge Fn → Auth Core Rate Limit 통합(I-16) 지연 측정

**성공 기준**: Edge Fn에서 Storage 파일 업로드 왕복 p95 < 500ms, isolated-vm 콜드 스타트 < 50ms.

### 9.2 spike-007 Storage 50GB 부하 통합 테스트 (ASM-4)

**현황**: SeaweedFS 50GB+ 운영 데이터에서의 성능이 미검증 (ASM-4 EWI). Storage ↔ B2 이전 통합(I-10)이 대용량에서 안정적인지 확인 필요.

**Wave 5 스파이크 목표**:
1. SeaweedFS 50GB 데이터 시뮬레이션 + `/api/v1/storage` Route Handler 성능 측정
2. wal-g B2 업로드: 50GB 풀 백업 소요 시간, 실패율
3. Hot→Cold 이전 스케줄: node-cron 실행 중 SeaweedFS 읽기 성능 저하 측정

**성공 기준**: 50GB 환경에서 파일 업로드 p95 < 1s, B2 전체 백업 < 2h.

### 9.3 pg_graphql 도입 전 통합 스파이크

**현황**: ADR-016의 4개 수요 트리거 중 2개+ 충족 시 pg_graphql 도입. 도입 전 통합 검증 필요.

**Wave 5 스파이크 목표**:
1. pg_graphql + Prisma 7 DMMF 자동 introspection diff CI (I-24) 실제 구현
2. Persisted Query 화이트리스트(DQ-1.25) 실제 구현 + Cloudflare Tunnel POST 검증
3. pg_graphql 설치 시 WAL 부하 변화 측정 (wal2json 통합 영향)

**트리거**: ADR-016 4개 조건 중 2개+ 충족 시 즉시 스파이크 착수.

### 9.4 Realtime Broadcast 멀티 운영자 통합

**현황**: Phase 19-C에서 Broadcast/Presence 구현 예정. 실제 멀티 운영자 환경(ASM-7 복수 브라우저) 통합 미검증.

**Wave 5 스파이크 목표**:
1. 브라우저 5개 동시 WebSocket 연결 → Broadcast 지연 측정
2. Presence 60초 heartbeat TTL + GC 15초 주기 실제 검증
3. Cloudflare Tunnel HTTP/2 환경에서 WebSocket multiplexing 확인

### 9.5 UX Quality MCP 외부 클라이언트 통합

**현황**: `mcp-luckystyle4u` 자체 MCP 서버 설계 완료(ADR-014). Claude Code, Cursor 등 MCP 클라이언트와의 실제 통합 미검증.

**Wave 5 스파이크 목표**:
1. MCP 서버 구현 → Claude Code 연결 테스트
2. mcp-luckystyle4u가 Data API REST 엔드포인트를 Tool로 노출하는 패턴 검증
3. PII redact 파이프라인이 MCP 채널에서도 동작하는지 확인 (AP-2)

---

## 10. ADR 참조 테이블

각 통합 결정이 어떤 ADR에 근거하는지 역참조 테이블.

| 통합 영역 | ADR 번호 | 핵심 결정 | 재검토 트리거 |
|---------|---------|----------|------------|
| Multi-tenancy 제외 (전 카테고리 통합) | ADR-001 | 단일 워크스페이스, tenant_id 없음 | 사용자 2명+, B2B 전환 |
| Table Editor 통합 (I-22, I-13) | ADR-002 | TanStack v8 헤드리스, RLS 통합 | v9 ABI 변경, 100만 row+ |
| SQL Editor 통합 (I-11, I-12, I-20) | ADR-003 | supabase-studio 패턴 흡수, AI 연동 | 라이선스 변경, Monaco v0.50+ |
| Schema Viz 통합 (I-13, I-14, I-24) | ADR-004 | schemalint + xyflow, DMMF 공유 | 200테이블+, 레이아웃 p95 > 3s |
| DB Ops 통합 (I-05, I-10, I-15, I-21) | ADR-005 | node-cron + wal-g, pg_cron 거부 | cron 50개+, wal-g 버전 호환 |
| Auth Core 통합 (I-01, I-02, I-04, I-08, I-18, I-22) | ADR-006 | jose JWT, 패턴 15개 차용 | OAuth 5개+, Node 24 호환 |
| Auth Advanced 통합 (I-02, I-03, I-16) | ADR-007 | TOTP + WebAuthn + Rate Limit 3종 | iOS 26 WebAuthn 안정화 |
| Storage 통합 (I-09, I-10) | ADR-008 | SeaweedFS 단독 + B2 오프로드 | SeaweedFS 재시작 실패 1건/주 |
| Edge Fn 통합 (I-09, I-16) | ADR-009 | isolated-vm + Deno + Vercel Sandbox 3층 | isolated-vm v6 ABI 깨짐 |
| Realtime CDC 통합 (I-06, I-07, I-08, I-23) | ADR-010 | wal2json CDC + supabase-realtime 포팅 | PG 18+ 비호환, 포팅 복잡도 초과 |
| Advisors 통합 (I-12, I-14, I-15) | ADR-011 | 3-Layer schemalint + squawk + splinter | 룰 50개+, 런타임 실행 우위 |
| Data API 통합 (I-06, I-07, I-11, I-19, I-21, I-24) | ADR-012 | REST + pgmq, pg_graphql 조건부 | GraphQL 트리거 2개+ |
| Vault 통합 (I-01) | ADR-013 | node:crypto AES-256-GCM, MASTER_KEY 위치 | 유출 의심, DEK 365일 |
| Anthropic API 통합 (I-19, I-20) | ADR-014 | AI SDK v6 + BYOK + MCP | 월 비용 > $8 × 2개월 |
| Operations 통합 (I-17, I-18) | ADR-015 | Capistrano-style + PM2 cluster:4 | 트래픽 100만/월, 팀 2명+ |
| pg_graphql 수요 트리거 (I-07, I-24) | ADR-016 | 4조건 중 2개+ 충족 시 도입 | 연 1회 정기 리뷰 |
| OAuth Providers (미래 Auth 통합) | ADR-017 | Phase 18+ 조건부, Google + GitHub 우선 | 외부 사용자 첫 가입 |
| 9-레이어 구조 (전체 통합 방향성) | ADR-018 | 상향 의존 금지, 수평 허용, 스킵 허용 | Blueprint 3개+ 레이어 경계 이탈 |

---

## 부록 Z. 근거 인덱스

### Z.1 이 문서가 인용하는 Wave 문서

| 섹션 | 근거 문서 |
|------|---------|
| §1 통합 패러다임 | `02-architecture/00-system-overview.md §1.2`, `00-vision/04-constraints-assumptions.md CON-2, CON-12` |
| §2 내부 통합 표 | Wave 4 Tier 2 Blueprint 14개 전체 (`03-auth-advanced-blueprint.md` ~ `16-ux-quality-blueprint.md`) |
| §3.1 Cloudflare | `00-vision/04-constraints-assumptions.md CON-2`, `spikes/spike-002-sse-result.md` |
| §3.2 B2 | `02-architecture/01-adr-log.md ADR-008`, `02-architecture/13-db-ops-blueprint.md §3` |
| §3.3 Anthropic | `02-architecture/01-adr-log.md ADR-014`, `02-architecture/16-ux-quality-blueprint.md §3` |
| §3.4 Slack/Discord | `02-architecture/13-db-ops-blueprint.md §3.2` |
| §4 프로토콜 | `02-architecture/11-realtime-blueprint.md §2`, `spikes/spike-002-sse-result.md` |
| §5 이벤트 카탈로그 | Wave 4 Tier 2 Blueprint 전체 (이벤트 계약 통합) |
| §6 에러 전파 | `02-architecture/15-data-api-blueprint.md §3`, `02-architecture/04-observability-blueprint.md §9` |
| §7 폴백 전략 | `docs/handover/next-dev-prompt.md` (Cloudflare QUIC 폴백 기록), `02-architecture/11-realtime-blueprint.md §3.3` |
| §9 Wave 5 스파이크 | `spikes/README.md`, `docs/research/spikes/` |
| §10 ADR 테이블 | `02-architecture/01-adr-log.md` ADR-001 ~ ADR-018 전체 |

### Z.2 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent I1-A (Claude Sonnet 4.6) | Wave 4 Tier 3 초안 — 24개 내부 통합, 5개 외부 통합, 16개 이벤트 카탈로그 |

### Z.3 후속 문서 연결

- → `01-postgres-extensions-integration.md`: wal2json, pgmq, pg_graphql 설치·설정 계약 상세
- → Wave 4 Tier 2 Blueprint: 각 §7 통합 섹션에서 이 문서의 통합 번호(I-NN) 역참조 필수
- → Wave 5 `05-roadmap/`: §9의 스파이크 목록을 Phase 정밀 로드맵에 반영

---

> **통합 개요 끝.** Wave 4 · I1 · 2026-04-18 · 양평 부엌 서버 대시보드 — 24개 내부 통합 쌍 · 5개 외부 시스템 · 16개 이벤트 · 6개 폴백 전략.
