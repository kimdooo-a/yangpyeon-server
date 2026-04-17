# Supabase 100점 동등성 — Wave 리서치 마스터 인덱스

> 양평 부엌 서버 대시보드의 14개 카테고리를 Supabase Cloud 동등 수준(100점)으로 끌어올리기 위한 체계적 리서치·설계 프로젝트.
> 규모: **L** | 예상 Wave: **5** | 예상 문서: **~88개**
> 시작: 2026-04-18 (세션 24) | 근거: [이전 평가표](../../../) + [_PROJECT_VS_SUPABASE_GAP.md](../../references/_PROJECT_VS_SUPABASE_GAP.md)

상위: [CLAUDE.md](../../../CLAUDE.md) → [docs/](../../) → [research/](../) → **여기**

---

## 진행 상태 대시보드

| Wave | 단계 | 상태 | 문서 수 | 에이전트 |
|------|------|------|---------|---------|
| 1 | 기초 deep-dive | ⏳ 대기 | 0/28 | 8-10 |
| 2 | 비교 매트릭스 | ⏳ 대기 | 0/28 | 8-10 |
| 3 | 100점 정의·요구사항 | ⏳ 대기 | 0/6 | 4-6 |
| 4 | 카테고리별 청사진 | ⏳ 대기 | 0/14 | 8-10 |
| 5 | 로드맵·스파이크 | ⏳ 대기 | 0/12 | 6-8 |
| **합계** | | | **0/88** | |

## 14 카테고리 (Multi-tenancy 의도적 제외)

| # | 카테고리 | 현재 점수 | 100점까지 갭 | Wave 1 후보 | 폴더 |
|---|---------|----------|-------------|-------------|------|
| 1 | Table Editor | 75 | 인라인 편집·낙관적 잠금·CSV 가져오기·외래키 selector | TanStack Table v8 + AG Grid + Glide DataGrid | [01-table-editor/](01-research/01-table-editor/) |
| 2 | SQL Editor | 70 | 쿼리 공유·Snippets·Plan Visualizer·Saved 쿼리 권한 | sqlpad·outerbase·Supabase Studio | [02-sql-editor/](01-research/02-sql-editor/) |
| 3 | Schema Visualizer | 65 | RLS 편집기·Trigger/Function UI·Replication UI·Wrappers | drizzle-kit studio·Prisma Studio·Schemalint | [03-schema-visualizer/](01-research/03-schema-visualizer/) |
| 4 | DB Ops (Webhooks/Cron/Backups) | 60 | PITR·세그먼트 백업·Trigger source 6종·재시도 정책 | pg_cron 직접 vs node-cron·pg_dump+wal-g·pgbackrest | [04-db-ops/](01-research/04-db-ops/) |
| 5 | Auth Core (RBAC/감사) | 70 | Hooks·Custom claims·SCIM·Org/Team 모델 | GoTrue 패턴 포팅·Lucia·Auth.js v6 | [05-auth-core/](01-research/05-auth-core/) |
| 6 | Auth Advanced (MFA/OAuth/Rate Limit) | 15 | TOTP·WebAuthn·OAuth 6종·per-email rate limit·CAPTCHA | otplib + simplewebauthn·rate-limiter-flexible·hCaptcha | [06-auth-advanced/](01-research/06-auth-advanced/) |
| 7 | Storage | 40 | S3 호환·서명 URL·이미지 변환·MIME 정책·버킷 RLS | MinIO·Garage·SeaweedFS·sharp·@aws-sdk/s3 호환 | [07-storage/](01-research/07-storage/) |
| 8 | Edge Functions | 45 | Deno 호환·HTTP 트리거·Secrets 통합·로그 스트리밍 | isolated-vm v2·Deno embed·Vercel Sandbox·Cloudflare Workers self | [08-edge-functions/](01-research/08-edge-functions/) |
| 9 | Realtime | 55 | Postgres CDC(WAL)·Broadcast·Presence·Inspector 고도화 | wal2json + logical replication·ElectricSQL·PowerSync·realtime-js 포팅 | [09-realtime/](01-research/09-realtime/) |
| 10 | Advisors | 65 | splinter 전체 룰·Query Performance·자동 알림 | splinter 풀 포팅·squawk·schemalint·pganalyze 패턴 | [10-advisors/](01-research/10-advisors/) |
| 11 | Data API + Integrations | 45 | GraphQL·Queues·고급 필터·실시간 구독·OpenAPI 자동생성 | pg_graphql·PostGraphile·pgmq·BullMQ·zod-to-openapi | [11-data-api/](01-research/11-data-api/) |
| 12 | Observability + Settings | 65 | JWT 로테이션·Vault·Infrastructure·Custom Reports·Geo | jose JWKS·pgsodium vs node-crypto·Grafana embed·Loki 직접 | [12-observability/](01-research/12-observability/) |
| 13 | UX Quality (Studio 동등성) | 75 | AI Assistant·키보드 단축키 매트릭스·Diff 뷰어·세션 공유 | Vercel AI SDK·CodeMirror diff·Yjs·@kbar/react | [13-ux-quality/](01-research/13-ux-quality/) |
| 14 | Operations (CI/CD·헬스·카나리) | 80 | GitHub Actions·헬스체크·롤링 배포·자동 롤백 | act·PM2 reload·Watchtower·Caddy + Cloudflare | [14-operations/](01-research/14-operations/) |

> Multi-tenancy(Organization/Projects/Billing)는 1인 자체호스팅 컨텍스트에 무관하므로 의도적 제외.

## 핵심 의사결정 질문 (DQ)

| DQ# | 카테고리 | 질문 | 상태 | 답변 Wave |
|-----|---------|------|------|----------|
| DQ-1.1 | auth-advanced | TOTP는 otplib만? WebAuthn(passkey)도 동시 지원? | ❓ | 1 |
| DQ-1.2 | auth-advanced | Rate Limit 저장소: Redis(추가 의존) vs DB(SQLite)? | ❓ | 1 |
| DQ-1.3 | storage | S3 호환 엔진: MinIO(성숙) vs Garage(경량) vs SeaweedFS(대규모)? | ❓ | 1 |
| DQ-1.4 | edge-functions | 런타임: isolated-vm v2 vs Deno embed vs Vercel Sandbox 원격? | ❓ | 1 |
| DQ-1.5 | realtime | CDC 구현: wal2json 직접 vs ElectricSQL 임베드 vs realtime-js 포팅? | ❓ | 1 |
| DQ-1.6 | data-api | GraphQL: pg_graphql 확장 vs PostGraphile vs 자체구현? | ❓ | 1 |
| DQ-1.7 | data-api | Queue: pgmq 확장 vs BullMQ vs 자체 SQLite 큐? | ❓ | 1 |
| DQ-1.8 | observability | Vault: pgsodium 확장 설치 vs node:crypto + master key? | ❓ | 1 |
| DQ-1.9 | table-editor | 셀 인라인 편집 라이브러리: 자체구현 vs AG Grid Community vs Glide? | ❓ | 1 |
| DQ-2.1~14 | (전 카테고리) | 각 카테고리별 1순위 기술 최종 선택 | ❓ | 2 |
| DQ-3.1~14 | (전 카테고리) | 각 카테고리 "100점 = 무엇"의 측정 가능 정의 | ❓ | 3 |
| DQ-4.1 | 통합 | Phase 16~20 전체 데이터 모델 변경 (Prisma schema diff)? | ❓ | 4 |
| DQ-4.2 | 통합 | 신규 의존성 합산 번들 크기 영향? | ❓ | 4 |
| DQ-4.3 | 통합 | 신규 백그라운드 워커 / 데몬 / 확장 PG 추가 영향? | ❓ | 4 |
| DQ-5.1 | 로드맵 | 14 카테고리의 우선순위·세션 매핑 (Phase 16-20)? | ❓ | 5 |
| DQ-5.2 | 로드맵 | MVP(70→85점 묶음) vs Full(85→100점 묶음) 분리? | ❓ | 5 |
| DQ-5.3 | 로드맵 | 검증 스파이크: 어떤 5-8개를 사전 검증? | ❓ | 5 |

상태: ❓ 미답변 / 🔄 진행 중 / ✅ 확정 / ⚠️ 충돌 / 🔁 변경

## 산출물 구조

```
docs/research/2026-04-supabase-parity/
├── README.md                       ← 이 파일
├── _CHECKPOINT_KDYWAVE.md
├── 00-vision/                      ← Wave 3
│   ├── 00-100-points-definition.md      "100점이란 무엇인가" 카테고리별 측정 정의
│   ├── 01-functional-requirements.md    FR-001~FR-100+ (카테고리별 그룹)
│   ├── 02-non-functional-requirements.md NFR (성능·보안·운영)
│   ├── 03-constraints-assumptions.md    1인 운영·WSL2·Cloudflare 제약
│   ├── 04-user-stories-admin.md         관리자 시나리오
│   └── 05-user-stories-developer.md     개발자(API/SDK) 시나리오
│
├── 01-research/                    ← Wave 1-2
│   ├── 01-table-editor/                  deep-dive·matrix·comparison
│   ├── 02-sql-editor/
│   ├── ...
│   └── 14-operations/
│
├── 02-architecture/                ← Wave 4 (카테고리별 1 청사진)
│   ├── 01-table-editor-blueprint.md
│   ├── ...
│   └── 14-operations-blueprint.md
│
├── 03-ui-ux/                       ← Wave 4 (Studio 동등 UX)
├── 04-integration/                 ← Wave 4 (data model diff·deps audit·worker map)
│
├── 05-roadmap/                     ← Wave 5
│   ├── 01-phase-16-20-roadmap.md       세션 매핑 + 의존성
│   ├── 02-mvp-vs-full.md
│   └── 03-risk-mitigation.md
│
├── 06-prototyping/                 ← Wave 5 (스파이크 사양 5-8개)
│
└── 07-appendix/
    ├── 01-glossary.md
    ├── 02-references.md
    └── 03-tool-versions.md
```

## 다음 작업

- 사용자 승인 → Phase 2 Wave 1 실행 (8-10 Agent 병렬, 28 deep-dive)
- Wave 1 완료 후 `/cs` 권장 (대규모 컨텍스트 종료)
- 중단 시: `/kdywave --resume`로 재개

---

> 최종 수정: 2026-04-18 (세션 24, Phase 1 완료 시점)
