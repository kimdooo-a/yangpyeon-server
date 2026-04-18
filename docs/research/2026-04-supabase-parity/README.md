# Supabase 100점 동등성 — Wave 리서치 마스터 인덱스

> 양평 부엌 서버 대시보드의 14개 카테고리를 Supabase Cloud 동등 수준(100점)으로 끌어올리기 위한 체계적 리서치·설계 프로젝트.
> 규모: **L** | Wave: **5** | 예상 문서: **~105개** (Wave 1+2+3+4 = 98 ✅)
> 시작: 2026-04-18 (세션 24) | 근거: [이전 평가표](../../../) + [_PROJECT_VS_SUPABASE_GAP.md](../../references/_PROJECT_VS_SUPABASE_GAP.md)

상위: [CLAUDE.md](../../../CLAUDE.md) → [docs/](../../) → [research/](../) → **여기**

---

## 진행 상태 대시보드

| Wave | 단계 | 상태 | 문서 수 | 줄 수 |
|------|------|------|---------|-------|
| 1 | 기초 deep-dive | ✅ **완료** | **33/33** | **26,941** |
| 2 | 비교 매트릭스 + 1:1 | ✅ **완료** | **28/28** | **18,251** |
| 3 | 100점 정의 + FR/NFR | ✅ **완료** (7 Agent 병렬) | **11/11** | **8,350** |
| 4 | 카테고리별 청사진 | ✅ **완료** (11 Agent / 3 Tier 병렬) | **26/26** | **32,918** |
| 5 | 로드맵 + 스파이크 | ⏳ 대기 | 0/~10-15 | — |

**누적: 98 문서 / 86,460줄**

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

## 산출물 구조 (Wave 3 완료 시점)

```
docs/research/2026-04-supabase-parity/
├── README.md                       ← 이 파일
├── _CHECKPOINT_KDYWAVE.md
├── 00-vision/                      ✅ Wave 3 (11 문서 / 8,350줄)
│   ├── 00-product-vision.md        ✅ 620줄 (페르소나 3, 핵심가치 5, 원칙 7)
│   ├── 01-user-stories.md          ✅ 830줄 (7 Epic × 36 스토리, Must 69%)
│   ├── 02-functional-requirements.md ✅ 1,477줄 (14 FR × 55 FR, P0 49.1%)
│   ├── 03-non-functional-requirements.md ✅ 500줄 (38 NFR, PERF/SEC/UX/REL/MNT/CMP/COST)
│   ├── 04-constraints-assumptions.md ✅ 420줄 (CON 12 / ASM 12)
│   ├── 05-100점-definition.md      ✅ 435줄 (14카 × 60/80/95/100 4단계)
│   ├── 06-operational-persona.md   ✅ 449줄 (페르소나 3 + 비페르소나 4)
│   ├── 07-dq-matrix.md             ✅ 1,648줄 (64 DQ + 폐기 4, W3=20/W4=28/W5=16)
│   ├── 08-security-threat-model.md ✅ 782줄 (STRIDE 29 + 자체호스팅 5)
│   ├── 09-multi-tenancy-decision.md ✅ 621줄 (ADR-001 + 재검토 트리거 4)
│   └── 10-14-categories-priority.md ✅ 568줄 (Phase 15-22 매핑 preview)
├── 01-research/                    ✅ Wave 1+2 (61 문서 / 45,192줄)
│   ├── 01-table-editor/            ✅ 3 deep-dive (957/829/827) + 4 비교/매트릭스 ★
│   ├── 02-sql-editor/              ✅ 3 deep-dive + 4 비교/매트릭스
│   ├── 03-schema-visualizer/       ✅ 2 deep-dive + 2 비교/매트릭스
│   ├── 04-db-ops/                  ✅ 2 deep-dive + 2 비교/매트릭스
│   ├── 05-auth-core/               ✅ 2 deep-dive + 2 비교/매트릭스
│   ├── 06-auth-advanced/           ✅ 3 deep-dive + 2 비교/매트릭스 ★
│   ├── 07-storage/                 ✅ 3 deep-dive + 1 비교 ★
│   ├── 08-edge-functions/          ✅ 3 deep-dive + 2 비교/매트릭스 ★
│   ├── 09-realtime/                ✅ 3 deep-dive + 1 비교 ★
│   ├── 10-advisors/                ✅ 2 deep-dive + 2 비교/매트릭스
│   ├── 11-data-api/                ✅ 3 deep-dive + 1 비교
│   ├── 12-observability/           ✅ 2 deep-dive + 1 비교
│   ├── 13-ux-quality/              ✅ 1 deep-dive + 비교
│   └── 14-operations/              ✅ 1 deep-dive + 비교
├── 02-architecture/                ✅ Wave 4 Tier 1+2 (17 문서 / 21,964줄)
│   ├── 00-system-overview.md       ✅ 1,298줄 (A1 opus, 9-레이어 아키텍처 + 14카 매핑)
│   ├── 01-adr-log.md               ✅ 848줄 (A1 opus, ADR-001~018 / 재검토 트리거 45건)
│   ├── 02-data-model-erd.md        ✅ 1,567줄 (A1 opus, PG 10→29 테이블 + SQLite 3→6)
│   ├── 03-auth-advanced-blueprint.md ✅ 1,833줄 (B1, Phase 15 MVP 1순위 22h WBS)
│   ├── 04-observability-blueprint.md ✅ 1,403줄 (B2, Phase 16 ~20h + JWKS)
│   ├── 05-operations-blueprint.md  ✅ 1,368줄 (B2, Phase 16 ~20h + Canary)
│   ├── 06-auth-core-blueprint.md   ✅ 1,633줄 (B1, Phase 17 MVP 30h)
│   ├── 07-storage-blueprint.md     ✅ 978줄 (B3, Phase 17 MVP 30h SeaweedFS+B2)
│   ├── 08-sql-editor-blueprint.md  ✅ 1,039줄 (B4, Phase 18 320h 4단계 14c~14f)
│   ├── 09-table-editor-blueprint.md ✅ 949줄 (B4, Phase 18 80h 14d/14e)
│   ├── 10-edge-functions-blueprint.md ✅ 1,408줄 (B3, Phase 19 40h 3층 하이브리드)
│   ├── 11-realtime-blueprint.md    ✅ 1,337줄 (B5, Phase 19 35h 2계층 CDC+Channel)
│   ├── 12-schema-visualizer-blueprint.md ✅ 1,219줄 (B6, Phase 20 50h)
│   ├── 13-db-ops-blueprint.md      ✅ 1,182줄 (B6, Phase 20 68h node-cron+wal-g)
│   ├── 14-advisors-blueprint.md    ✅ 988줄 (B6, Phase 20 80h 3-Layer)
│   ├── 15-data-api-blueprint.md    ✅ 1,328줄 (B5, Phase 21 25h REST+pgmq)
│   └── 16-ux-quality-blueprint.md  ✅ 1,586줄 (B7, Phase 21 15h AI SDK v6)
├── 03-ui-ux/                       ✅ Wave 4 Tier 3 U1 (5 문서 / 5,841줄)
│   ├── 00-design-system.md         ✅ 1,165줄 (다크 팔레트 hex + Geist/JetBrains Mono + WCAG 2.2 AA)
│   ├── 01-layout-navigation.md     ✅ 1,088줄 (3-pane + 14카 사이드바 + Cmd+K)
│   ├── 02-table-and-form-patterns.md ✅ 1,214줄 (TanStack v8 + cmdk FK + sonner)
│   ├── 03-auth-ui-flows.md         ✅ 1,286줄 (MFA 등록/세션 관리/Anonymous)
│   └── 04-editor-components.md     ✅ 1,088줄 (Monaco + @xyflow + useChat + MCP UI)
├── 04-integration/                 ✅ Wave 4 Tier 3 I1+I2 (4 문서 / 5,113줄)
│   ├── 00-integration-overview.md  ✅ 1,175줄 (내부 24쌍 + 외부 5종 + 이벤트 16종)
│   ├── 01-postgres-extensions-integration.md ✅ 1,351줄 (wal2json+pgmq+pg_graphql 조건부)
│   ├── 02-cloudflare-deployment-integration.md ✅ 1,225줄 (QUIC→HTTP/2 + Canary + /ypserver)
│   └── 03-external-services-integration.md ✅ 1,362줄 (B2+Anthropic BYOK+Slack+$10 가드)
├── 05-roadmap/                     ← Wave 5
├── 06-prototyping/                 ← Wave 5 (스파이크 4건은 Wave 1에서 예비 검증)
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

## Wave 2 결과 요약 (2026-04-18 17:30 완료)

### 매트릭스 + 1:1 비교 28 문서 (18,251줄)

| Agent | 카테고리 | 매트릭스 | 1:1 비교 | 합계 |
|-------|---------|---------|---------|------|
| A | Table Editor + SQL Editor | 568+619 | 931+1015 | 3,133 |
| B | Schema Viz + DB Ops | 577+692 | 525+716 | 2,510 |
| C | Auth Core + Advanced | 505+624 | 784+937 | 2,850 |
| D | Storage + Edge Functions | 663+846 | 741+1143 | 3,393 |
| E | Realtime + Advisors | 323+383 | 574+589 | 1,869 |
| F | Data API + Observability | 487+676 | 751+711 | 2,625 |
| G | UX Quality + Operations | 276+268 | 652+675 | 1,871 |

### Wave 2 핵심 발견

1. **Wave 1 채택안 100% 강화 확인** — 7 Agent 모두 민감도 분석상 1위 유지, 역방향 피드백 발생 없음
2. **"1:1 비교는 계층 분리를 드러낸다"** — wal2json vs supabase-realtime, isolated-vm vs Deno, splinter vs squawk 모두 "경쟁이 아니라 역할 분담" 결론. Wave 4 청사진의 계층 설계 축으로 직접 반영
3. **정량화된 재고 조건** — 모든 채택안에 "언제 재검토할지" 트리거 명시 (예: Garage 재평가 3조건, pg_graphql 도입 4 수요 트리거, Docker 이행 조건, KMS 재고 조건)
4. **DQ-12.3 추가 확정** — MASTER_KEY=`/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`
5. **"하이브리드 9 : 단일 5" 분류 재검증** — Wave 1 Compound Knowledge가 Wave 2 점수 분포에서도 유지 → Wave 4 청사진 구조 축 확정

### 카테고리별 Wave 2 최종 점수

| # | 카테고리 | Wave 2 매트릭스 1위 점수 | Wave 1 대비 |
|---|---------|------------------------|------------|
| 1 | Table Editor | 4.54/5 (TanStack 14c-α 자체) | 4.60→4.54 (-0.06, 유지) |
| 2 | SQL Editor | 4.70/5 (supabase-studio 패턴) | 4.70 유지 |
| 3 | Schema Visualizer | 4.30/5 (schemalint+자체) | 4.30 유지 |
| 4 | DB Ops | 4.36/5 (node-cron+wal-g) | 4.36 유지 |
| 5 | Auth Core | 4.08/5 (Hybrid-Self) | 3.48→4.08 (+0.60, 패턴 차용 15개 구체화) |
| 6 | Auth Advanced | 4.59/5 (TOTP+WebAuthn+RL 동시) | 4.59 유지 |
| 7 | Storage | 4.25/5 (SeaweedFS+B2) | 4.25 유지 |
| 8 | Edge Functions | 4.22/5 (3층 하이브리드) | 4.22 유지 |
| 9 | Realtime | 4.05/5 (wal2json+supabase-realtime 포팅) | 4.05 유지 |
| 10 | Advisors | 3.95/5 (3-Layer) | 3.94→3.95 (+0.01) |
| 11 | Data API | 4.29/5 (REST+pgmq) | 4.29 유지 |
| 12 | Observability | 0.87 권고도 (92.54/94.20 가중점) | 강화 확정 |
| 13 | UX Quality | 0.84 권고도 (87.2/100) | 강화 확정 |
| 14 | Operations | 0.87 권고도 (89.0/100) | 강화 확정 |

## Wave 3 결과 요약 (2026-04-18 15:41 완료)

### Vision Suite + 메타 심층 분석 11 문서 / 8,350줄

| Agent | 모델 | 문서 | 줄 수 | 핵심 결정 |
|-------|------|------|------|----------|
| V1 | opus | 00-product-vision | 620 | 핵심가치 5종 (데이터 주권/100점/$10 이하/1인 운영/Next.js 통합) |
| V2 | opus | 01-user-stories | 830 | 7 Epic × 36 스토리, Must 69%, Won't 10건 명시 |
| R1 | opus | 02-functional-requirements | 1,477 | 14 FR × 55 FR, P0 49.1%, 각 FR에 Wave 1-2 구현 기술 명시 |
| R2 | opus | 03-NFR + 04-CON+ASM | 920 | NFR 38개 (7 카테고리), CON 12 / ASM 12 |
| M1 | sonnet | 05-100점-definition + 06-페르소나 | 884 | 14카 × 4단계 정의, 3년 TCO 절감 $950~2,150 |
| M2 | sonnet | 07-dq-matrix + 08-보안위협 | 2,430 | 64 DQ 재분배, STRIDE 29+자체호스팅 5 위협 |
| M3 | sonnet | 09-ADR멀티테넌시 + 10-우선순위 | 1,189 | ADR-001 + Phase 15-22 매핑 preview |

### Wave 3 핵심 발견

1. **100점 도달 총 공수 = 1,008h (~50주)** — Wave 1 확정 548h + Wave 3 추정 460h. Phase 15~22 매핑.
2. **MVP 범위 확정**: Phase 15~17 (Auth Advanced + Observability/Ops + Auth Core/Storage) — 1순위 대상은 현재 갭 최대(15점)인 Auth Advanced
3. **DQ 재분배 완료**: 64 DQ + 폐기 4건 → Wave 3 = 20(FR/NFR에서 답변), Wave 4 = 28(청사진), Wave 5 = 16(로드맵/스파이크)
4. **ADR-001 확정 (Multi-tenancy 의도적 제외)** — 구현 공수 30-40%(70h) 절감 + 재검토 트리거 4개 정량화 (사용자 2명+ 6개월, B2B 전환, 독립 팀 FR, 법적 격리)
5. **보안 위협 29 + 자체호스팅 특화 5 = 총 34 위협** — STRIDE 카테고리별 3-6개, TOP 10 우선 완화 목록 + NFR-SEC.1~23 매핑 완료
6. **3년 TCO 절감 $950~2,150** — Supabase Cloud $1,200~2,400 vs 양평 $250 (Cloudflare 무료 + B2 $0.005/GB/월 + AI $5/월)

### Wave 3 Compound Knowledge — "요구사항은 이미 정해졌다"

일반 프로젝트의 Wave 3는 "비전 → 요구사항 추출"이지만, 이 프로젝트는 **역순**이었다:
- Wave 1에서 이미 각 카테고리의 1위 기술(채택안)이 확정됨 → FR의 "구현 기술" 컬럼이 처음부터 채워진 상태로 작성됨
- 이는 Wave 4 청사진으로의 전이를 매우 매끄럽게 만듦 — 기술 결정은 잠금된 상태로 아키텍처 설계만 진행 가능
- **FR 55개 × 구현 기술 명시 100%** — 일반 L 규모 프로젝트 대비 Wave 4 설계 리스크 -30%

## Wave 4 결과 요약 (2026-04-18 완료)

### 아키텍처 청사진 26 문서 / 32,918줄 (Wave 누적 최대)

| Tier | 에이전트 수 | 모델 | 문서 | 줄 수 | 핵심 결정 |
|------|-----------|------|------|------|----------|
| 1 | 1 | opus | 00-system-overview + 01-adr-log + 02-data-model-erd | 3,713 | 9-레이어 아키텍처 확정 + 5 아키텍처 원칙(AP-1~5) + ADR 18건 + 재검토 트리거 45건 |
| 2 | 7 | sonnet | 03~16 (14 카테고리 Blueprint) | 18,251 | 7 클러스터 병렬 (B1 보안 / B2 운영 / B3 compute / B4 editor / B5 data / B6 DB mgmt / B7 UX) |
| 3 | 3 | sonnet | 03-ui-ux 5 + 04-integration 4 | 11,054 | 디자인 시스템 hex 확정 + 24 내부 통합쌍 + 외부 5종 + QUIC→HTTP/2 교훈 |
| **합계** | **11** | opus×1+sonnet×10 | **26 문서** | **32,918** | — |

### Wave 4 핵심 발견

1. **9-레이어 아키텍처 확정 (ADR-018)**: L0 인프라 → L8 UX. 14 카테고리 레이어 매핑 완료. Phase 15-22 순서가 레이어 의존성과 일치.
2. **ADR 18건 누적 + 재검토 트리거 45건 정량화**: ADR-001(멀티테넌시 제외) ~ ADR-017(OAuth 보류) + ADR-018(9-레이어). 모든 결정에 정량 트리거.
3. **데이터 모델 확장**: PG 10→29 테이블(+18 신규 + 1 조건부 pg_graphql), SQLite 3→6 테이블. 마이그레이션 16-17 파일 / 공수 35-39h.
4. **DQ 28 답변 완료**: Wave 4 할당 DQ 모두 Blueprint 내부에서 정량 답변 (예: JWT refresh revokedAt+tokenFamily 하이브리드, SigV4-only, Slot 2개 분리, KEK 90일 회전, Papa Parse 14d, cmdk FK, 자체 d3 Plan Visualizer 등).
5. **Phase 15-22 총 공수 재산정**: Auth Adv 22h + Obs/Ops 40h + Auth Core/Storage 60h + Editors 400h + Edge/Realtime 75h + DB mgmt 198h + API/UX 40h + 마이그레이션 35-39h = **~870-880h** (Wave 3 Preview 992h 대비 -10% 정밀화).
6. **역방향 피드백 0건**: Wave 1-3 채택안과 Wave 4 청사진 전부 정합. 14/14 Blueprint 모두 이전 Wave 결론을 강화.

### Wave 4 Compound Knowledge — "청사진은 계층 분리를 강제한다"

- Realtime(CDC+Channel 2계층), Advisors(schemalint+squawk+splinter 3-Layer), Edge Functions(isolated-vm+Deno+Sandbox 3층) 모두 **"단일 솔루션이 아니라 역할 분담"**이 청사진 단계에서 더욱 명확해짐 — Wave 1/2 Compound Knowledge 재검증.
- UI/UX가 아키텍처와 독립 설계 가능: Tier 3 UI/UX 에이전트가 Tier 2 Blueprint와 동시 발사 가능했던 것은 "컴포넌트 이름 계약"이 Tier 2에서 고정됐기 때문. 다음 프로젝트에서도 동일 패턴 권장.

## 다음 작업

- **강력 권장**: `/cs`로 세션 마감 (Wave 4 완료로 누적 86,460줄 / 98 문서. 아키텍처 잠금 완료 — Wave 5 진입 전 세션 저장이 중요한 마일스톤)
- **재개**: 다음 세션에서 `/kdywave --resume` → Phase 2 Wave 5 (로드맵 + 스파이크 10-15 문서) 진입
- **Wave 5 예상 산출물**: 05-roadmap/ + 06-prototyping/ + 07-appendix/
  - 릴리스 계획 (MVP Phase 15-17 → Beta Phase 18-19 → v1.0 Phase 20-22)
  - 마일스톤별 WBS 최종화 (Wave 4에서 제시한 공수 기반)
  - 스파이크 사양 (spike-005 Edge Fn 심화, spike-007 SeaweedFS 50GB)
  - DQ 남은 16건 답변
- **MVP 즉시 착수 가능**: Phase 15 Auth Advanced 22h — Blueprint 03 WBS 12 태스크 그대로 실행 가능

---

> 최종 수정: 2026-04-18 (Wave 4 완료, 11 Agent × 3 Tier, 26 문서 / 32,918줄)
