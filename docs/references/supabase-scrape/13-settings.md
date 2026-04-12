---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: settings
---

# 13. Settings (General / Compute / Infrastructure / Integrations / API Keys / JWT Keys / Log Drains / Add-ons / Data API / Vault)

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문 (병합 — Settings 하위 9개 페이지)

```
Settings
Configuration
General
Compute and Disk
Infrastructure
Integrations
API Keys
JWT Keys
Log Drains
Add-ons
Integrations
Data API
Vault
Beta
Billing
Subscription
Usage
```

### General
```
Project Settings
General configuration, domains, ownership, and lifecycle
General settings
Crypto Chart Analysi
Project name
enksnhshciyvllwfiwrm
Project ID
Project access — Organization-wide access — Manage members
Project availability — Restart project / Pause project
Custom domains — $10/month per domain (Pro Plan add-on)
Transfer project / Delete project
```

### Compute and Disk
```
Nano   $0       / hour — Up to 0.5 GB, Shared CPU
Micro  $0.01344 / hour — 1 GB, 2-core ARM
Small  $0.0206  / hour — 2 GB, 2-core ARM
Medium $0.0822  / hour — 4 GB, 2-core ARM
Large  $0.1517  / hour — 8 GB, 2-core ARM
XL     $0.2877  / hour — 16 GB, 4-core ARM
Disk Size 8 GB (0.29 used) — Autoscaling / WAL / System
```

### Infrastructure
```
Auth version       2.188.1
PostgREST version  13.0.5
Postgres version   17.6.1.054  (upgrade to 17.6.1.104 available)
CPU / Memory / Disk IO Bandwidth 최근 7일 차트
Nano Baseline 43 Mbps, Burst 2,085 Mbps, 30 mins/day
```

### Integrations
```
GitHub Integration — Sync preview branches with GitHub branch
Vercel Integration — Auto-update env vars across Vercel projects
AWS PrivateLink — Team/Enterprise plan
```

### API Keys
```
Publishable and secret API keys (new)
  sb_publishable_bc17JXfT1zFP8HD3LqQ5ZQ_Ppp8glCo  (safe to share)
  sb_secret_I6Kwt••••••••••••••••                 (server-only)
Legacy anon, service_role API keys
  anon (public JWT)     — usable from browser with RLS
  service_role (secret) — bypasses RLS; never share
Disable legacy API keys — migration option
```

### JWT Keys
```
JWT Signing Keys (new) vs Legacy JWT Secret
"Migrate JWT secret" — transition to signing keys
```

### Log Drains
```
Pro+ only, $60/month per drain
Destinations: Datadog / Loki / Sentry / Custom endpoint
```

### Add-ons
```
IPv4 — Dedicated IPv4 address
PITR — Point in time recovery
Custom Domain
```

### Integrations → Data API
```
RESTful endpoint for querying and managing your database
https://<project-ref>.supabase.co
Enable Data API — toggles PostgREST on configured schemas
```

### Integrations → Vault (Beta)
```
Application level encryption for your project
pg_graphql required extension
Secrets — stored using Authenticated Encryption on disk
Available in decrypted form through a Postgres view
```

## 드러난 UI / 기능 목록

- **General**: 프로젝트명/ID, Members(RBAC), Restart/Pause/Transfer/Delete
- **Compute & Disk**: 6-tier 가격표, 디스크 사용량 스택(Autoscale/WAL/System)
- **Infrastructure**: Auth/PostgREST/Postgres 버전 + 업그레이드 안내 + 7일 CPU/Mem/Disk IO 히스토그램
- **Integrations**: GitHub(브랜치 동기화), Vercel(env 자동 주입), AWS PrivateLink
- **API Keys 이중화**:
  - 신식: `sb_publishable_*` / `sb_secret_*` (랜덤 문자열 + 해시 저장)
  - 레거시: JWT 기반 `anon` / `service_role`
  - 레거시 비활성 옵션
- **JWT Keys**: Legacy secret → Signing Keys(공개키 분리, 로테이션 가능) 마이그레이션
- **Log Drains**: 유료 add-on, 4가지 목적지
- **Add-ons**: IPv4, PITR, Custom Domain
- **Data API** 스위치: PostgREST 활성화/비활성화
- **Vault(Beta)**: 애플리케이션 레벨 암호화 시크릿 + 복호화된 뷰 제공

## 추론되는 기술 스택

- **가격/플랜 엔진**: Stripe Metered Billing + 조직별 usage aggregation
- **Project 수명주기**: Restart/Pause는 컨테이너 레벨(ECS/Fargate/K8s) 라이프사이클
- **API Keys(신식)**: 해시 저장 + prefix로 식별 + 발급 시 1회만 평문 노출
- **JWT Signing Keys**: JWKS 공개키 엔드포인트, RS256/ES256, key rotation
- **Log Drains**: Vector/Fluentbit-like 애그리게이터 + 목적지 어댑터
- **Vault**: `pgsodium`(libsodium) + 키 계층(root → KEK → DEK)
- **이 프로젝트로의 이식 우선순위**:
  - P0: API Keys(publishable/secret 이중화 + 해시 저장), JWT Signing Keys 로테이션, Log Drains 설정 UI, Backups UI(dev-DB 한정)
  - P1: Compute/Infrastructure 메트릭 탭, 버전 정보(Auth/PostgREST 대신 프로젝트 자체 버전)
  - P2: Add-ons(IPv4/PITR/Custom Domain) — 자체 호스팅이므로 Cloudflare Tunnel로 충분
