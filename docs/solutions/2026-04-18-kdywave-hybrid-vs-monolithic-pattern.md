---
title: kdywave Wave 1 카테고리 분류 — 단일 솔루션 vs 하이브리드 9:5 패턴
date: 2026-04-18
session: 25
tags: [kdywave, architecture, decision-framework, supabase-parity, hybrid, pattern]
category: pattern
confidence: high
---

## 문제

자체호스팅 환경에서 상용 SaaS(Supabase) 기능 동등성 100점을 달성할 때 **각 기능 카테고리에 어떤 OSS를 채택해야 하는가**는 카테고리마다 천차만별로 보인다. 어떤 카테고리는 단일 OSS로 100점 가능하고, 어떤 카테고리는 5개를 결합해도 못 만든다. 이 차이를 *사전에 예측할 수 있는 기준*이 필요하다 — Wave 4 아키텍처 청사진을 작성할 때 카테고리별 문서 구조와 분량이 크게 달라지기 때문.

## 원인

kdywave Wave 1에서 14 카테고리에 대해 33 deep-dive를 수행한 결과, **두 가지 명확한 분류 패턴**이 등장했다:

### 분류 A: 하이브리드 필수형 (9 카테고리)

**특징**: 어떤 단일 OSS도 Supabase 동등 100점을 만들지 못함. 패턴 차용 + 자체 결합이 필수.

| 카테고리 | 1순위 결합 | 이유 |
|---------|----------|------|
| Table Editor | TanStack v8 + 14c-α 자체 EditableCell | 헤드리스가 인라인 편집·낙관적 잠금에 자체 구현 강제 |
| SQL Editor | sqlpad(아카이브) + Outerbase(AI) + Supabase Studio(snippet) | 단일 OSS가 AI/공유/Plan 모두 못 갖춤 |
| Schema Visualizer | Prisma/drizzle 패턴 흡수 + schemalint + 자체 RLS UI + Trigger 편집기 | 임베드 가능한 OSS가 RLS UI 부재 |
| Auth Core | jose + Lucia 패턴 + Auth.js Provider/Hook 패턴 | 라이브러리 마이그레이션 비용이 자산 보존 가치보다 큼 |
| Auth Advanced | TOTP + WebAuthn + PG Rate Limit 동시 채택 | MFA 단일은 phishable + UX 열등 |
| Edge Functions | isolated-vm v6 + Deno 사이드카 + Vercel Sandbox 위임 (3층) | 단일 런타임이 호환성·성능·격리 강도 못 갖춤 |
| Realtime | wal2json(CDC) + supabase-realtime 포팅(Channel) | 단일 솔루션이 CDC + Broadcast/Presence 동시 못 함 |
| Advisors | schemalint(컨벤션) + squawk(DDL) + splinter 포팅(라이브) (3-Layer) | 린트 시점이 다른 3 도구가 각 영역 담당 |
| Data API | REST DMMF 강화 + pgmq + SQLite 보조 | GraphQL은 수요 트리거 후 pg_graphql 추가 |

### 분류 B: 단일 솔루션형 (5 카테고리)

**특징**: 단일 OSS 채택 + 보조 도구 1개로 90+ 도달.

| 카테고리 | 단일 채택 | 보조 |
|---------|---------|------|
| Storage | SeaweedFS | (선택) imgproxy 사이드카 |
| DB Ops | node-cron 자체 보강 + wal-g | pg_dump 월 1회 long-term |
| Observability Vault | node:crypto AES-256-GCM + envelope | (없음) |
| UX AI | Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP | (없음) |
| Operations | 자체 Capistrano-style + PM2 cluster | canary.{도메인} 시간차 |

### 분류 기준 (사전 예측 가능 신호)

**하이브리드 필수형 신호**:
- ☑ Supabase가 자체 구축한 *복합 시스템* (Studio = Editor + Snippet + AI + Plan, Auth = Email + OAuth + MFA + Rate Limit)
- ☑ 카테고리에 *시점 분리* 요구 존재 (Advisors = 컨벤션/DDL/라이브)
- ☑ 단일 OSS 매트릭스에서 1순위 점수가 4.0 미만 또는 항목별 차이가 큼
- ☑ 라이선스/플랫폼 제약으로 OSS 단일 채택 시 다른 차원 손실 (AGPL → 상용 충돌, Elixir/Phoenix → Node 스택 충돌)

**단일 솔루션형 신호**:
- ☑ 카테고리가 *단일 도메인 책임* (Storage = 객체 저장, Cron = 스케줄링, Vault = 암호화)
- ☑ 표준 프로토콜·포맷 존재 (S3, cron, AES, JWKS)
- ☑ 단일 OSS 매트릭스에서 1순위가 4.2+ 점수 + 카테고리당 항목 차이 작음
- ☑ 단일 도구의 결손이 *별도 카테고리*에 흡수됨 (예: Storage 검색 = Data API, Vault 회전 = Observability)

## 해결

### Wave 4 청사진 작성 시 카테고리별 구조 분기

```
하이브리드 필수형 (9 카테고리):
├── 1. 채택 OSS/패턴 N개 + 채택 사유
├── 2. 역할 분담 매트릭스 (어떤 OSS가 어떤 기능 담당)
├── 3. 통합 인터페이스 설계 (자체 구현 어댑터/추상)
├── 4. 데이터 모델 통합 (Prisma 모델 diff)
├── 5. 의존성·운영 부담 합산 분석
└── 6. 단계별 도입 순서 (어떤 OSS 먼저, 마이그레이션 위험)

단일 솔루션형 (5 카테고리):
├── 1. 단일 OSS 채택 근거
├── 2. 보조 도구 (있는 경우만)
├── 3. 데이터 모델 (있으면)
└── 4. 도입 단계 (단일 마일스톤)
```

→ **하이브리드 카테고리 1개 = 단일 카테고리 1개의 약 1.5~2배 분량**

### 자체 도구 vs 채택 결정 시 적용 절차

1. WebSearch로 카테고리의 OSS 후보 3-5개 수집
2. 각 후보를 10차원으로 평가 (FUNC/PERF/DX/ECO/LIC/MAINT/INTEG/SECURITY/SELF_HOST/COST)
3. 매트릭스 1위 점수 ≥ 4.2 + 항목 균등 → **단일 솔루션형**
4. 1위 점수 < 4.2 또는 항목 편차 큼 → **하이브리드 후보**
5. 하이브리드 후보면 카테고리 책임을 *시점/계층/역할*로 분해
6. 각 분해 영역에 1순위 OSS 매핑 → 통합 인터페이스 자체 구현

## 교훈

- **상용 SaaS의 카테고리는 사실 복합 시스템이 많다** — Studio/Auth/Realtime은 단일 OSS가 아닌 *내부적으로 이미 하이브리드인 것을 SaaS가 통합 표면으로 가린 것*. 자체호스팅에서는 하이브리드를 명시적으로 드러내야 한다.
- **단일 솔루션형이 가능한 카테고리는 표준 프로토콜이 있다** — S3, cron, AES, JWKS 같은 RFC/표준이 있으면 OSS 간 차이가 *기능 매트릭스*가 아닌 *운영 특성*으로 좁혀진다.
- **1인 운영 컨텍스트는 하이브리드 운영 부담을 카테고리 한도까지 받아들일 수 있다** — 9 하이브리드 카테고리도 "패턴 차용 + 자체 통합"이면 외부 운영 의존은 늘지 않음. 운영 비용 폭발은 *복수 SaaS 의존* 시 일어남.

## 관련 파일

- `docs/research/2026-04-supabase-parity/README.md` — 14 카테고리 분류 표
- `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md` — Compound Knowledge 섹션
- `docs/research/2026-04-supabase-parity/01-research/{01~14 카테고리}/` — 33 deep-dive 근거
- `docs/solutions/2026-04-18-pg-extension-vs-self-impl-decision.md` — 보조 분류 (PG 확장 결정)
