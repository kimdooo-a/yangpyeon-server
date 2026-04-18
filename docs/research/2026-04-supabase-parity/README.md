# Supabase 100점 동등성 — Wave 리서치 마스터 인덱스

> 양평 부엌 서버 대시보드의 14개 카테고리를 Supabase Cloud 동등 수준(100점)으로 끌어올리기 위한 체계적 리서치·설계 프로젝트.
> 규모: **L** | Wave: **5** | 예상 문서: **~91개** (Wave 1 = 33 ✅)
> 시작: 2026-04-18 (세션 24) | 근거: [이전 평가표](../../../) + [_PROJECT_VS_SUPABASE_GAP.md](../../references/_PROJECT_VS_SUPABASE_GAP.md)

상위: [CLAUDE.md](../../../CLAUDE.md) → [docs/](../../) → [research/](../) → **여기**

---

## 진행 상태 대시보드

| Wave | 단계 | 상태 | 문서 수 | 줄 수 |
|------|------|------|---------|-------|
| 1 | 기초 deep-dive | ✅ **완료** | **33/33** | **26,941** |
| 2 | 비교 매트릭스 + 1:1 | 🔄 다음 세션 권장 | 0/~28 | — |
| 3 | 100점 정의 + FR/NFR | ⏳ 대기 | 0/6 | — |
| 4 | 카테고리별 청사진 | ⏳ 대기 | 0/14 | — |
| 5 | 로드맵 + 스파이크 | ⏳ 대기 | 0/12 | — |

## 14 카테고리 — Wave 1 1순위 + 100점 청사진

| # | 카테고리 | 현재 | 1순위 채택 | Wave 1 점수 | 100점 도달 단계 |
|---|---------|------|-----------|-------------|----------------|
| 1 | Table Editor | 75 | **TanStack v8 + 14c-α 자체구현** | 4.6/5 | 14c-α(85)→14c-β(93)→14d(99)→14e(100) |
| 2 | SQL Editor | 70 | **Supabase Studio 패턴(4.70)** + Outerbase + sqlpad 3중 흡수 | 4.07/5 | 14c→14d→14e→14f 보너스, 40일 |
| 3 | Schema Visualizer | 65 | **schemalint 4.42 + 자체 RLS 4.18 + Trigger 4.31** (스튜디오 임베드 거부) | 4.30/5 | 14d-1~11, /database/{policies,functions,triggers} 신설, 50h |
| 4 | DB Ops Webhooks/Cron/Backups | 60 | **node-cron 자체 4.32 + wal-g 4.41** | 4.36/5 | 14d-A~J + 14e-1~10, RPO 60s, RTO 30m, 68h |
| 5 | Auth Core | 70 | **jose JWT + Lucia 패턴 + Auth.js 패턴** (라이브러리 미채용) | 3.48/5 | 6 Phase, 30h |
| 6 | Auth Advanced ★ | 15 | **TOTP + WebAuthn + Rate Limit (전부 동시)** | 4.59/5 | Phase 15(TOTP)→16(WebAuthn)→17(Rate Limit) = 60점, OAuth/CAPTCHA로 +40 |
| 7 | Storage ★ | 40 | **SeaweedFS 단독(4.25)** | 4.25/5 | 단일 채택만으로 90~95점 |
| 8 | Edge Functions ★ | 45 | **3층 하이브리드** (isolated-vm v6 + Deno 사이드카 + Sandbox 위임) | 4.22/5 | 92~95점 |
| 9 | Realtime ★ | 55 | **wal2json + supabase-realtime 포팅 하이브리드** | 4.05/5 | 100/100 |
| 10 | Advisors | 65 | **3-Layer** (schemalint 컨벤션 + squawk DDL + splinter 38룰) | 3.94/5 | 80h, 점진 머지 |
| 11 | Data API + Integrations | 45 | **REST 강화 + pgmq + SQLite 보조** (GraphQL은 수요 트리거 시 pg_graphql) | 4.29/5 | 45→80~85 (즉시), 100은 GraphQL 트리거 시 |
| 12 | Observability + Settings | 65 | **node:crypto envelope + jose JWKS ES256** | 0.87 권고도 | Vault + JWKS + Infrastructure 페이지 |
| 13 | UX Quality | 75 | **AI SDK v6 + Anthropic BYOK + 자체 MCP `mcp-luckystyle4u`** | 0.84 권고도 | ~$5/월, AI Assistant 통합 |
| 14 | Operations | 80 | **Capistrano-style + PM2 cluster:4 + canary.stylelucky4u.com 시간차** | 0.87 권고도 | 자체 Capistrano + 자동 symlink 롤백 |

★ = 사전 스파이크 검증 카테고리 (4건 모두 "조건부 GO")

## Wave 1 Compound Knowledge — 핵심 패턴 발견

### 패턴 1: "단일 솔루션 vs 하이브리드" 분류 (Wave 4 청사진 축)

| 분류 | 카테고리 | 이유 |
|------|---------|------|
| **하이브리드 필수형 (9)** | Table Editor / SQL Editor / Schema Viz / Auth Core / Auth Advanced / Edge Functions / Realtime / Data API / Advisors | 어떤 단일 OSS도 100점 만들지 못함 — 패턴 차용 + 자체 결합 필수 |
| **단일 솔루션형 (5)** | Storage(SeaweedFS) / DB Ops(node-cron+wal-g) / Observability(node:crypto) / UX(AI SDK v6) / Operations(자체 Capistrano) | 단일 채택 + 보조 도구 1개로 90+ 도달 |

### 패턴 2: "라이브러리 채택 vs 패턴 차용" 결정

- Auth Core: Lucia/Auth.js — **라이브러리 거부, 패턴만 차용** (이미 jose 자산 + 마이그레이션 비용)
- Schema Viz: Prisma Studio/drizzle-kit — **임베드 거부, 패턴만 흡수**
- SQL Editor: supabase-studio Apache-2.0 — **자유 활용, sqlpad는 아카이브 예정 → 패턴만**

→ **"기존 자산 보존 + 외부 패턴 학습 자체구현"**이 1인 운영 컨텍스트의 일반 해법

### 패턴 3: "PostgreSQL 확장 vs Node 자체구현" 결정

| 카테고리 | 결정 | 이유 |
|---------|------|------|
| Realtime CDC | **wal2json (확장)** | 표준화, 검증 |
| Vault | **node:crypto (자체)** | pgsodium = SUPERUSER + 빌드 부담 + Prisma 비호환 |
| Cron | **node-cron (자체)** | pg_cron = 1인 환경 과한 의존성 |
| Queue | **pgmq (확장)** | Outbox 패턴 + PG 트랜잭션 일관성 |
| GraphQL | **pg_graphql (확장)** | 단, 도입 자체는 수요 트리거 후 |
| Backup | **wal-g (외부)** | pgbackrest는 단일 노드 과잉 |
| Advisors | **splinter 포팅 (Node TS)** | PL/pgSQL 직접 실행 의존 회피 |

→ **"확장 도입 비용 vs 자체 구현 부담"의 균형이 카테고리마다 다름**

## DQ 답변 현황

### Wave 1 잠정 답변 완료 (9건)

| DQ# | 카테고리 | 잠정 답변 |
|-----|---------|----------|
| DQ-1.1 | auth-advanced | ✅ TOTP + WebAuthn 동시 지원 |
| DQ-1.2 | auth-advanced | ✅ PostgreSQL/Prisma 어댑터 |
| DQ-1.3 | storage | ✅ SeaweedFS |
| DQ-1.4 | edge-functions | ✅ isolated-vm v6 + Deno 사이드카 + Sandbox 위임 (3층) |
| DQ-1.5 | realtime | ✅ wal2json + supabase-realtime 포팅 (하이브리드) |
| DQ-1.6 | data-api | ✅ pg_graphql 1순위 (도입은 수요 트리거 시) |
| DQ-1.7 | data-api | ✅ pgmq + SQLite 보조 |
| DQ-1.8 | observability | ✅ node:crypto AES-256-GCM + envelope (KEK→DEK) |
| DQ-1.9 | table-editor | ✅ TanStack v8 자체구현 + 14c-α |

### 신규 DQ 64건 (Wave 2~5에서 답변)

| 출처 | 개수 | 주요 카테고리 |
|------|------|--------------|
| Round 1 (Realtime/Auth Adv/Storage/Edge Fn) | 15 | DQ-1.10~1.24 |
| SQL Editor | 4 | AI 비용 가드 / Plan Visualizer / 스키마 토큰 / Folder 마이그레이션 |
| Auth Core + Advisors | 7 | jose JWT 범위 / argon2 교체 / Anonymous role / SQLite ROI / 슬랙 다이제스트 / 룰 음소거 / PR 차단 |
| Data API | 10 | DQ-1.25~1.34 — Persisted Query / Realtime 통합 / introspection CI / pgmq archive |
| Observability + UX + Ops | 12 | MASTER_KEY 위치 / KEK 회전 / refresh JWKS 동기화 / AI 영구 저장 / Capacitor / 마이그레이션 롤백 |
| Schema Viz + DB Ops | 16 | DQ-3.x / DQ-4.x — 자동 관계 추론 / RLS Monaco / B2 / archive_timeout / restore audit |

→ Wave 2 매트릭스에서 글로벌 시퀀스(DQ-1.x ~ DQ-2.x)로 통합 재할당 예정

## 산출물 구조 (Wave 1 완료 시점)

```
docs/research/2026-04-supabase-parity/
├── README.md                       ← 이 파일
├── _CHECKPOINT_KDYWAVE.md
├── 01-research/
│   ├── 01-table-editor/            ✅ 3 deep-dive (957/829/827) ★
│   ├── 02-sql-editor/              ✅ 3 deep-dive (584/617/868)
│   ├── 03-schema-visualizer/       ✅ 2 deep-dive (932/1442)
│   ├── 04-db-ops/                  ✅ 2 deep-dive (1127/1056)
│   ├── 05-auth-core/               ✅ 2 deep-dive (675/774)
│   ├── 06-auth-advanced/           ✅ 3 deep-dive (837/1126/1092) ★
│   ├── 07-storage/                 ✅ 3 deep-dive (664/850/936) ★
│   ├── 08-edge-functions/          ✅ 3 deep-dive (790/843/801) ★
│   ├── 09-realtime/                ✅ 3 deep-dive (789/654/867) ★
│   ├── 10-advisors/                ✅ 2 deep-dive (770/651)
│   ├── 11-data-api/                ✅ 3 deep-dive (566/640/716)
│   ├── 12-observability/           ✅ 2 deep-dive (702/655)
│   ├── 13-ux-quality/              ✅ 1 deep-dive (654)
│   └── 14-operations/              ✅ 1 deep-dive (650)
├── 02-architecture/                ← Wave 4
├── 03-ui-ux/                       ← Wave 4
├── 04-integration/                 ← Wave 4
├── 05-roadmap/                     ← Wave 5
├── 06-prototyping/                 ← Wave 5 (스파이크 4건은 Round 1에서 예비 검증)
└── 07-appendix/
```

## 예상 총 구현 시간 (Wave 1 deep-dive 합산)

| 카테고리 | 시간 |
|---------|------|
| SQL Editor | 40일 (≈320h) |
| Schema Viz | 50h |
| DB Ops (Cron + Backup) | 68h |
| Auth Core | 30h |
| Advisors | 80h |
| (Auth Advanced / Storage / Edge Fn / Realtime / Data API / Observability / UX / Operations / Table Editor 14c-α~e) | Wave 4 청사진에서 정밀 산정 |
| **Wave 1 산정 합산 (5 카테고리)** | **약 270h + SQL 320h** |

→ Wave 4 청사진에서 14 카테고리 전체 시간 합산 → Wave 5 로드맵에서 Phase 16~20 매핑.

## 다음 작업

- **권장**: `/cs`로 세션 마감 (Wave 1 완료가 자연스러운 마일스톤, Round 1+2 합쳐 ~26,941줄 컨텍스트 누적)
- **재개**: 다음 세션에서 `/kdywave --resume` → Phase 2 Wave 2 (매트릭스+1:1) 진입
- **즉시 진행**: 사용자가 명시 시 Wave 2 매트릭스 발사 가능

---

> 최종 수정: 2026-04-18 14:46 (Wave 1 완료, Round 1+2 합산)
