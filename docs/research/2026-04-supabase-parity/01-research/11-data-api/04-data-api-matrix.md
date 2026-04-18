# 04. Data API 매트릭스 — REST 강화 + pgmq + pg_graphql(보류) vs 외부 GraphQL 레이어

> **Wave 2 / 11-data-api / 매트릭스 단계 (Agent F)**
> 작성일: 2026-04-18 · 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com) · 단일 진실 소스: 본 문서
>
> **Wave 1 필수 참조**
> - `01-research/11-data-api/01-pg-graphql-deep-dive.md` (권고도 4.21 / 5)
> - `01-research/11-data-api/02-postgraphile-v5-deep-dive.md` (권고도 4.31 / 5, 컨텍스트 가중 후 2순위)
> - `01-research/11-data-api/03-pgmq-vs-bullmq-vs-sqlite-queue-deep-dive.md` (pgmq 4.34 / 5)
>
> **연관 산출물**: `_PROJECT_VS_SUPABASE_GAP.md`(Data API 45/100 → 80~85 즉시, 100은 GraphQL 수요 트리거 후), `_SUPABASE_TECH_MAP.md`의 PostgREST/pg_graphql/pgmq 세 모듈을 단일 Route Handler 레이어 + 확장 1~2개로 흡수.

---

## 0. TL;DR (4문장)

1. **현재 45/100 → 80~85 점프는 "GraphQL 없이도 가능"** 하다. 핵심은 기존 `/api/v1/data/[table]` Route Handler를 (1) operator parser 완성, (2) optimistic locking, (3) CSRF 가드, (4) DMMF 기반 정적 스키마 노출로 4축 강화하는 것이고, 여기에 **pgmq 확장 1개**가 결합되면 "비동기 작업"이라는 마지막 기능 갭이 해소된다. 이 경로의 추가 의존성은 PG 확장 1개(pgmq) + Node 패키지 3~4개로 끝난다.
2. **100점 도달은 GraphQL 수요가 실측된 시점에만** 시도한다. 현재 1인 운영 + 운영자 ≤ 50명 컨텍스트에서 GraphQL을 선제 도입하면 DX 가산점보다 MAINT/SELF_HOST 감점이 크다 (pg_graphql=4.21, PostGraphile=4.31의 컨텍스트 가중 차감 포함). 트리거 조건을 사전에 수치로 정의해 두면 "의사결정 지연 비용" 자체가 0이 된다.
3. **tRPC는 원천 제외**. 공개 API 호환성(외부 CLI, curl, BI 도구, 잠재 모바일) 요구가 상위 제약이고, tRPC는 TypeScript client-server 강결합이 본질이라 공개 표면(OpenAPI/GraphQL/REST 중 무엇이 되었든)을 제공할 수 없다. 내부 Next.js → Next.js 호출이라면 tRPC가 이상적이지만 우리 시나리오는 그 반대다.
4. **Hasura는 비교용으로만 포함**. self-host 시 metadata DB 분리 + Docker 컨테이너 운영이 1인 운영 부담을 초과하며, Cloud 모델은 $0~5/월 제약과 충돌한다.

---

## 1. 스코프 & 대상 기술

### 1.1 매트릭스에 들어가는 7개 후보

| # | 후보 | 역할 | 우리 선택 위치 |
|---|------|------|----------------|
| A | **REST Route Handler 강화 (자체)** | `/api/v1/data/[table]` + operator parser + DMMF | **채택 (진행중)** |
| B | **pg_graphql** | PG 확장, `graphql.resolve()` SQL 함수 | **보류 (조건부 채택)** — Wave 1 #01 |
| C | **pgmq** | PG 확장, Outbox + 잡 큐 | **채택 예정 (Phase 14e)** — Wave 1 #03 |
| D | **SQLite (보조 큐/캐시)** | better-sqlite3, process-local | **부분 채택** — Wave 1 #03 |
| E | **PostGraphile v5 (Grafserv+Grafast)** | Node 어댑터 GraphQL | **마이그레이션 옵션** — Wave 1 #02 |
| F | **Hasura** | Docker, metadata DB 분리 | **비교용, 미채택** |
| G | **tRPC** | Next.js 내부 호출 | **원천 제외** (공개 API 호환성 위반) |

### 1.2 현재 위치 정량화

Wave 1 / `_PROJECT_VS_SUPABASE_GAP.md` 기준 현 Data API = **45/100**.
차감 원인은 (1) operator 공백(=, in, like 일부만) 10점, (2) 정렬/페이지네이션 표준화 5점, (3) 낙관적 락 10점, (4) CSRF 가드 5점, (5) 자동 OpenAPI 5점, (6) 공개/비밀키 이중화 5점, (7) async job 15점.

"REST 강화 + pgmq" 경로로 얻는 항목은 **(1)~(7) 모두** — 이것이 즉시 80~85가 가능하다는 근거다.

---

## 2. 매트릭스 I — 기능 표면 (FUNC 18/100)

| 기능 | A: REST 강화 | B: pg_graphql | C: pgmq | D: SQLite 큐 | E: PostGraphile v5 | F: Hasura | G: tRPC |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 자동 스키마 introspection | △ (DMMF 정적 dump) | ✅ | n/a | n/a | ✅ | ✅ | ❌ (타입 공유) |
| CRUD 자동 노출 | ✅ (Prisma) | ✅ | n/a | n/a | ✅ | ✅ | 수동 |
| 복잡 필터 (gt/in/ilike/jsonb) | △ (operator parser 필요) | ✅ (내장 filter) | n/a | n/a | ✅ (connection-filter) | ✅ | 수동 |
| Relay cursor pagination | △ (직접 구현) | ✅ | n/a | n/a | ✅ | ✅ | 수동 |
| RLS/권한 | ✅ (TableAccess) | ✅ (RLS 직결) | PG role | 파일권한 | ✅ (pgSettings) | metadata JWT | 수동 |
| Aggregations (count/sum) | △ (직접 구현) | ✅ (1.4+) | n/a | n/a | ✅ (pg-aggregates) | ✅ | 수동 |
| Subscription/Realtime | ❌ (9-realtime 의존) | ❌ | n/a | n/a | ✅ (LISTEN/NOTIFY) | ✅ | ✅ (호환 시) |
| 비동기 작업 (queue) | ❌ | ❌ | ✅ | ✅ (작음) | ❌ | ❌ | ❌ |
| 트랜잭션 enqueue (Outbox) | ✅ (Prisma $tx) | n/a | ✅ (killer feature) | △ | n/a | n/a | n/a |
| Cron/Repeatable | ❌ | ❌ | △ (pg_cron 결합) | △ (node-cron) | n/a | ✅ (scheduled triggers) | ❌ |
| OpenAPI 자동 생성 | △ (DMMF→OpenAPI 스파이크 필요) | ❌ | n/a | n/a | ❌ | △ | ❌ |
| GraphQL 표면 | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| 공개/비밀키 이중화 | △ (14a ApiKey 모델) | — | — | — | — | — | — |
| 낙관적 락 (updated_at/etag) | △ (Phase 14c 도입중) | ❌ (미지원) | n/a | n/a | ✅ (version column) | ✅ | 수동 |
| CSRF 가드 | ✅ (Phase 14c) | — | — | — | ✅ | ✅ | ✅ |
| 공개 API 표면 | ✅ REST | ✅ GraphQL | n/a | n/a | ✅ GraphQL | ✅ REST/GraphQL | ❌ |

**소계 (FUNC 가중 18점 → 5점 환산)**

| 후보 | FUNC 점수 | 근거 |
|------|:---:|------|
| A 단독 | 3.2 | Subscription/GraphQL/Queue 없음, 나머지 완성 가능 |
| A + C | **4.2** | Subscription만 빠짐 (→ 9-realtime 카테고리에서 해소) |
| A + B + C | 4.6 | GraphQL 추가 |
| A + C + E | 4.8 | PostGraphile이 connection-filter까지 포함 |
| F (Hasura 단독) | 5.0 | 기능은 최고, 그러나 MAINT/SELF_HOST에서 역전됨 |

---

## 3. 매트릭스 II — 성능 (PERF 10/100)

### 3.1 실측 가능 지표

| 지표 | A REST 강화 | B pg_graphql | C pgmq | E PostGraphile | F Hasura |
|------|:---:|:---:|:---:|:---:|:---:|
| p50 CRUD 1건 | 3~6ms | 4~7ms | 1~2ms enqueue | 6~10ms | 5~9ms |
| p99 복합 쿼리 (2-depth filter) | 60~90ms (N+1 위험) | 80~130ms (1 SQL) | n/a | 100~150ms (Grafast plan) | 70~120ms |
| 처리량 (req/s, 4 worker) | 400~800 | 200~400 | 2k enqueue | 200~400 | 600~1000 |
| 쿼리당 SQL 수 | 1~N (수동 include 필요) | 1 | 1 | 1~3 (auto batch) | 1~3 |
| 메모리 추가 풋프린트 | 0 (Next.js 안) | 0 (PG 안) | 0 | +80~120MB | +300MB (Docker) |

### 3.2 트래픽 헤드룸 계산

현 운영자 ≤ 50명 + 일일 주문 ≤ 100건 + 일일 재고 변경 ≤ 500건 기준:
- 예상 read throughput: ~30~60 req/min (평균), 피크 200 req/min
- 예상 write throughput: ~2~5 req/min
- 예상 enqueue throughput: ~5~10 jobs/min (이미지/이메일/PDF)

→ A+C 조합의 "400~800 req/s" 처리량은 **실측 트래픽 대비 200배 헤드룸**. PERF 가중 10점에서 이 차이는 거의 의미 없음 — **PERF 차원은 사실상 결정 요인이 아니다**.

### 3.3 PERF 점수 (5점 환산)

| 후보 | 점수 | 근거 |
|------|:---:|------|
| A REST 강화 | 4.0 | N+1 위험 있으나 DMMF include로 해소 가능 |
| A + C | **4.3** | enqueue가 non-blocking → 주 요청 경로 단축 |
| A + B + C | 4.5 | 단일 SQL planning 이점 |
| E PostGraphile | 4.0 | Grafast plan 컴파일 1회 + process hop |
| F Hasura | 4.2 | metadata cache hit 시 빠름, 미스 시 긴 P99 |

---

## 4. 매트릭스 III — DX/개발 경험 (DX 14/100)

### 4.1 항목별

| 항목 | A | B | C | D | E | F | G |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 학습 곡선 | 낮음 (Prisma+REST 기존) | 중 (디렉티브) | 낮음 (SQL+wrapper) | 낮음 | 높음 (plugin/smart tag) | 중 (metadata UI) | 낮음 (Next 내부) |
| 타입 안정성 (end-to-end) | △ (수동 zod) | △ (codegen 별도) | ✅ (TS wrapper) | ✅ | ✅ (codegen) | △ | ✅ (zero-cost) |
| 자동 완성 | ✅ (Prisma client) | ✅ (Apollo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| IDE 통합 (GraphiQL/Playground) | ❌ | △ (외부 Sandbox) | n/a | n/a | ✅ (내장) | ✅ | n/a |
| Hot reload 스키마 | ✅ (DMMF) | ✅ (DDL 후 자동) | n/a | n/a | ✅ | ✅ | ✅ |
| 테스트 mocking | ✅ (Prisma mock) | △ (SQL mock) | ✅ (jest) | ✅ | △ | △ | ✅ |
| 마이그레이션 도구 | ✅ (prisma migrate) | ✅ (SQL) | ✅ (SQL) | ✅ | ✅ | △ (hasura cli) | n/a |
| 문서화 | 수동 | 자동 (introspect) | 수동 | 수동 | 자동 | 자동 | 타입만 |

### 4.2 DX 점수 (5점 환산)

| 후보 | 점수 | 근거 |
|------|:---:|------|
| A REST 강화 | 3.8 | DMMF로 schema drift 자동 추적, 그러나 openapi 자동 생성은 별도 작업 |
| A + C | **4.0** | SQL+wrapper가 얇아 debug 용이 |
| A + B + C | 4.3 | Apollo Sandbox로 introspection 이점 |
| E PostGraphile | 4.5 | GraphiQL 내장 + Smart Tag 강력 |
| F Hasura | 4.4 | Console UI가 가장 풍부 |

---

## 5. 매트릭스 IV — 생태계 (ECO 12/100)

| 후보 | 메인테이너 | 릴리즈 주기 | GitHub stars (2026-04 기준 추정) | 대표 사용자 |
|------|-----------|------------|-------------------------------|-------------|
| A REST 강화 | 자체 | 자체 | — | — |
| B pg_graphql | Supabase (Oliver Rice 외) | 4~8주 | 3.5k+ | Supabase Cloud 전체 |
| C pgmq | Tembo | 6~8주 | 2k+ | Tembo, 일부 Supabase Edge |
| D SQLite (better-sqlite3) | WiseLibs | 분기 | 5k+ | 광범위 |
| E PostGraphile v5 | Graphile (Benjie Gillam) | 월 | 13k+ | GraphQL self-host 진영 |
| F Hasura | Hasura Inc. | 월 (v2), v3 neon | 31k+ | 엔터프라이즈 다수 |
| G tRPC | Alex/Johnson 외 | 주~월 | 36k+ | Vercel/T3 진영 |

**ECO 점수 (5점)**

| 후보 | 점수 | 근거 |
|------|:---:|------|
| A | 3.5 | 자체이므로 star는 무의미, Prisma 생태계에 편승 |
| B | 4.0 | Supabase 1급 지원 |
| C | 3.8 | 신흥, 그러나 Supabase 내부 채택 확대 |
| E | 4.3 | v5 이행 중이나 핵심 plugin 안정 |
| F | 4.8 | 가장 큰 생태계, 그러나 v3 전환기로 불확실성 |

---

## 6. 매트릭스 V — 라이선스 (LIC 8/100)

| 후보 | 라이선스 | 상용/재배포 | 우리 영향 |
|------|---------|------------|-----------|
| A 자체 | MIT | 자유 | — |
| B pg_graphql | Apache 2.0 | 자유 | OK |
| C pgmq | PostgreSQL (BSD-like) | 자유 | OK |
| D better-sqlite3 | MIT + SQLite public domain | 자유 | OK |
| E PostGraphile v5 | MIT (코어), 일부 **Graphile Pro 상용** | 코어 자유, Pro 유료 | Pro 미사용 전제 |
| F Hasura | Apache 2.0 (CE), Cloud/EE는 별도 | CE는 자유 | OK (단 EE 기능 의존 금지) |
| G tRPC | MIT | 자유 | OK |

**LIC 점수는 전반적으로 5.0** — 유의미한 차이 없음. E/F는 pro/ee 경로만 피하면 동일.

---

## 7. 매트릭스 VI — 유지보수 (MAINT 10/100)

### 7.1 1년 총 유지보수 시간 (1인 운영 추정)

| 항목 | A REST 강화 | A+C | A+B+C | E PostGraphile | F Hasura |
|------|:---:|:---:|:---:|:---:|:---:|
| 초기 도입 | 8h (operator parser) | +4h (pgmq) | +6h (pg_graphql) | 16h (plugin 학습) | 12h (docker+metadata) |
| 분기 1회 의존 업데이트 | 1h | 2h | 3h (pgrx 재빌드 위험) | 4h | 4h (migration) |
| 신규 테이블 온보딩 | 30min | 30min | 45min (디렉티브) | 1h (smart tag) | 45min |
| 장애 debug 평균 | 낮음 (Prisma 로그) | 중 (큐 워커 별도) | 중 | 높음 (Grafast plan) | 높음 (metadata) |
| **1년 총합** | ~20h | **~30h** | ~50h | ~80h | ~100h |

### 7.2 MAINT 점수 (5점)

| 후보 | 점수 | 근거 |
|------|:---:|------|
| A 단독 | 4.5 | 기존 Prisma 스택에 완전 편승 |
| A + C | **4.3** | pgmq PG 확장 재빌드 위험 (WSL2 apt 미지원 배포시) |
| A + B + C | 3.8 | pgrx ABI 호환성 위험 |
| E | 3.3 | plugin 학습 + Node 40패키지 추가 |
| F | 2.8 | Docker + metadata DB 별도 |

---

## 8. 매트릭스 VII — 통합 (INTEG 10/100)

### 8.1 Next.js 16 + Prisma 7 + WSL2 + PM2 + Cloudflare Tunnel

| 항목 | A | B | C | E | F |
|------|:---:|:---:|:---:|:---:|:---:|
| Next.js Route Handler 통합 | ✅ (직결) | ✅ ($queryRaw 1줄) | ✅ (worker 별도) | ✅ (grafserv/node) | △ (별도 origin) |
| Prisma 7 DMMF 공존 | ✅ (본인) | ✅ | ✅ | ✅ (별도 pool) | △ |
| jose JWT 세션 통합 | ✅ | ✅ (GUC 주입) | n/a | ✅ (pgSettings) | △ (JWKS 필요) |
| Cloudflare Tunnel HTTP | ✅ | ✅ | n/a | ✅ | ✅ |
| Cloudflare Tunnel WS (subscription) | n/a | n/a | n/a | △ (5분 idle) | △ |
| PM2 fork mode | ✅ | ✅ | ✅ (worker process) | ✅ | ❌ (docker) |
| WSL2 systemd 의존 | ❌ | ❌ | ❌ | ❌ | ✅ (docker 필요) |

### 8.2 INTEG 점수

| 후보 | 점수 | 근거 |
|------|:---:|------|
| A | 4.8 | 본인 |
| A + C | **4.8** | pgmq Prisma $queryRaw로 1:1 통합 |
| A + B + C | 4.7 | RLS 이원화 비용 |
| E | 4.4 | grafserv/node 안정 |
| F | 3.2 | docker + metadata 이원화 |

---

## 9. 매트릭스 VIII — 보안 (SECURITY 10/100)

| 항목 | A | B | C | E | F |
|------|:---:|:---:|:---:|:---:|:---:|
| RLS 100% 호환 | ✅ (TableAccess) | ✅ | n/a | ✅ (pgSettings) | △ (metadata JWT) |
| CSRF 가드 | ✅ (Phase 14c) | ✅ | n/a | ✅ | ✅ |
| Persisted Query | n/a | △ (Route 측 구현) | n/a | ✅ (@grafserv/persisted) | △ |
| Depth/Cost 제한 | n/a | △ (수동) | n/a | ✅ (plugin) | ✅ |
| Introspection 차단 옵션 | n/a | ❌ (자동 노출) | n/a | ✅ | ✅ |
| CVE 이력 (2023~2026) | — | 0건 | 0건 | 0건 (core) | minor 2~3건 |
| SQL injection 차단 | ✅ (Prisma parametrize) | ✅ (함수) | ✅ | ✅ (Grafast) | ✅ |

**SECURITY 점수**: 모두 4.0~4.5 수준, 본질적 차이 없음. 결정 요인 아님.

---

## 10. 매트릭스 IX — 자체호스팅 (SELF_HOST 5/100)

| 항목 | A | B | C | D | E | F |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 추가 프로세스 | 0 | 0 | 0 (PG 안) 또는 1 (worker) | 0 | 0 (Next.js 안) | 1 (Docker) + 1 (metadata DB) |
| WSL2 친화도 | ★★★★★ | ★★★★ (apt 있으면) | ★★★★ (Tembo apt) | ★★★★★ | ★★★★★ | ★★★ (docker) |
| 백업 복구 비용 | PG 포함 | PG 포함 | PG 포함 | 파일 copy | PG 포함 | PG + metadata + yaml |
| Cloudflare Tunnel 적합 | ★★★★★ | ★★★★★ | n/a | n/a | ★★★★ (WS 주의) | ★★★ |

**SELF_HOST 점수**

| 후보 | 점수 |
|------|:---:|
| A | 5.0 |
| A + C | **5.0** |
| A + B + C | 4.8 (pgrx 빌드 리스크) |
| E | 4.0 |
| F | 2.5 |

---

## 11. 매트릭스 X — 비용 (COST 3/100)

| 후보 | $/월 |
|------|:---:|
| A | 0 |
| B | 0 |
| C | 0 |
| D | 0 |
| E | 0 (core), Pro 미사용 |
| F self-host | 0 (+전력) |
| F cloud | $10~50/월 |
| G tRPC | 0 |

**COST 점수**: A~E 모두 5.0, F cloud는 3.0 이하. 결정 요인 아님.

---

## 12. 종합 스코어 (10차원 가중)

| 차원 | 가중 | A 단독 | **A + C** | A + B + C | E PostGraphile | F Hasura CE |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| FUNC | 18 | 3.2 × 18/5 = 11.52 | **4.2 × 18/5 = 15.12** | 4.6 × 18/5 = 16.56 | 4.8 × 18/5 = 17.28 | 5.0 × 18/5 = 18.00 |
| PERF | 10 | 4.0 × 10/5 = 8.00 | **4.3 × 10/5 = 8.60** | 4.5 × 10/5 = 9.00 | 4.0 × 10/5 = 8.00 | 4.2 × 10/5 = 8.40 |
| DX | 14 | 3.8 × 14/5 = 10.64 | **4.0 × 14/5 = 11.20** | 4.3 × 14/5 = 12.04 | 4.5 × 14/5 = 12.60 | 4.4 × 14/5 = 12.32 |
| ECO | 12 | 3.5 × 12/5 = 8.40 | **3.8 × 12/5 = 9.12** | 4.0 × 12/5 = 9.60 | 4.3 × 12/5 = 10.32 | 4.8 × 12/5 = 11.52 |
| LIC | 8 | 5.0 × 8/5 = 8.00 | **5.0 × 8/5 = 8.00** | 5.0 × 8/5 = 8.00 | 4.5 × 8/5 = 7.20 | 4.5 × 8/5 = 7.20 |
| MAINT | 10 | 4.5 × 10/5 = 9.00 | **4.3 × 10/5 = 8.60** | 3.8 × 10/5 = 7.60 | 3.3 × 10/5 = 6.60 | 2.8 × 10/5 = 5.60 |
| INTEG | 10 | 4.8 × 10/5 = 9.60 | **4.8 × 10/5 = 9.60** | 4.7 × 10/5 = 9.40 | 4.4 × 10/5 = 8.80 | 3.2 × 10/5 = 6.40 |
| SECURITY | 10 | 4.3 × 10/5 = 8.60 | **4.3 × 10/5 = 8.60** | 4.2 × 10/5 = 8.40 | 4.3 × 10/5 = 8.60 | 4.0 × 10/5 = 8.00 |
| SELF_HOST | 5 | 5.0 × 5/5 = 5.00 | **5.0 × 5/5 = 5.00** | 4.8 × 5/5 = 4.80 | 4.0 × 5/5 = 4.00 | 2.5 × 5/5 = 2.50 |
| COST | 3 | 5.0 × 3/5 = 3.00 | **5.0 × 3/5 = 3.00** | 5.0 × 3/5 = 3.00 | 5.0 × 3/5 = 3.00 | 3.0 × 3/5 = 1.80 |
| **합계 (/100)** | 100 | **81.76** | **86.84** | **88.40** | **86.40** | **81.74** |

### 12.1 해석

- **A + C가 현시점 최적해** (86.84) — FUNC 손실을 MAINT/SELF_HOST 이득이 상쇄.
- A + B + C가 88.40으로 수치상 최고지만, **컨텍스트 가중 (GraphQL 수요 부재 + pgrx 재빌드 위험)** 을 반영하면 -2점 차감 → 86.40 수준 → 동점.
- **PostGraphile (86.40)** 과 **A+B+C (86.40)** 는 거의 같은 구간이나, PostGraphile은 Subscription 포함이라는 이점이 있고 A+B+C는 pg_graphql 단독 Subscription 부재.

### 12.2 결정

> **Phase 14d~15: A + C 조합 (REST 강화 + pgmq)** → 80~85/100 도달.
> **Phase 15 이후: "GraphQL 수요 트리거" 조건 충족 시 pg_graphql 추가** → 88~90/100.
> **Phase 16 이후: Subscription을 GraphQL 표면에서 처리해야 할 때만 PostGraphile v5로 마이그레이션** → 90~95/100.

---

## 13. GraphQL 도입 트리거 정량 조건

아래 **4개 조건 중 2개 이상**이 동시 충족되면 pg_graphql을 도입한다. 1개만이면 보류.

| # | 트리거 | 측정 방법 | 임계값 |
|---|--------|----------|-------|
| T1 | 외부 GraphQL 클라이언트 존재 | Capacitor 모바일 앱 또는 외부 BI 도구 (Metabase GraphQL, Apollo Studio 등) PoC 시작 | 최소 1개 |
| T2 | REST over-fetch 비용 | `/api/v1/data/*` 응답 크기 p95 | > 50KB (현재 ~5KB 추정) |
| T3 | 고객/파트너 요청 | 공개 API 문서화 요청 횟수 | ≥ 3회/분기 |
| T4 | 내부 페이지 복잡도 | 단일 페이지 당 REST 호출 수 p90 | > 5회 (현재 ~2회) |

### 13.1 측정 계측

- T2: Next.js middleware에 응답 크기 metric 추가 (`content-length` 헤더)
- T4: `pageSession` 테이블에 page_path + api_calls 카운트
- T1/T3: 수동 추적 (DQ로 관리)

### 13.2 선제 준비 (트리거 미발동 시에도 할 일)

- pg_graphql 설치 스크립트 검증 + 롤백 경로 문서화 → 트리거 발동 후 24시간 내 도입 가능 상태 유지
- `_PROJECT_VS_SUPABASE_GAP.md`에 "GraphQL 잠재 이익 +8~12점" 명시 유지

---

## 14. tRPC 제외 근거 (상세)

### 14.1 구조적 부적합

tRPC의 핵심 가치 주장은 "클라이언트와 서버가 같은 TypeScript 프로젝트일 때 타입을 무비용으로 공유"다. 우리 시나리오에서는 다음 클라이언트가 존재하거나 존재할 수 있다:

1. Next.js Server Component/Client Component (내부 — tRPC 적합)
2. Playwright E2E (**curl 가능해야 함** — tRPC 부적합)
3. Capacitor 모바일 앱 향후 (**공개 스키마 필요** — tRPC 부적합)
4. 외부 파트너/BI 도구 (**REST 또는 GraphQL 필요** — tRPC 부적합)
5. 사용자 secret_key 발급 → 외부 자동화 스크립트 (**curl 가능해야 함** — tRPC 부적합)

5개 중 4개에서 tRPC가 부적합하므로 "내부 1개"를 위해 병렬 레이어를 둘 수 없다.

### 14.2 수치 비교

| 차원 | tRPC | A REST |
|------|:---:|:---:|
| 내부 타입 안정성 | ★★★★★ | ★★★☆☆ (수동 zod) |
| 외부 API 표면 | ★☆☆☆☆ | ★★★★★ |
| 도구 생태계 (curl/postman/BI) | ★☆☆☆☆ | ★★★★★ |
| 학습 곡선 | ★★★★★ | ★★★★★ |

"외부 API 표면"이 0에 가까운 점이 결정적 — tRPC를 채택하면 **공개 API 표면을 별도로 운영해야** 하며 두 레이어 MAINT가 A 단독 대비 +100% 이상 증가. 가치보다 비용이 큼 → **원천 제외**.

---

## 15. Hasura 비교 상세

### 15.1 Hasura의 강점 (비교군으로만)

- Actions(Webhooks), Events, Scheduled Triggers — 단일 플랫폼에서 API + 큐 + cron 통합
- Console UI가 가장 성숙 (admin에게 친숙)
- Apollo Federation 완비

### 15.2 우리 시나리오와의 마찰

1. **Docker 의무** — WSL2에서 docker 데몬 별도 운영 + systemd 모드 필요 → 1인 운영 부담 +50%
2. **Metadata DB 분리 권고** — 실제 DB와 별도 PG가 이상적, 단일 PG로 통합하면 supported지만 public 테이블과 metadata 혼용
3. **JWKS 통합 방식** — Hasura JWT config에 우리 jose JWKS endpoint URL을 등록해야 함 → 회전 시 Hasura 재기동 불필요하지만 장애 경로 추가
4. **$0~5/월 제약** — self-host CE는 $0 가능, 그러나 전력/디스크/운영시간 환산 시 실질 $30~50/월 상당

### 15.3 스코어 비교

A+C (86.84) vs Hasura CE (81.74) → 약 5점 열위. 본질적으로 "Hasura가 더 풍부하지만 관리 부담이 너무 크다"는 고전적 트레이드오프.

### 15.4 언제 Hasura로 가나

- 팀 규모 ≥ 3명 + 별도 DevOps 인력 확보
- 외부 파트너 API + 공개 GraphQL + 내부 admin을 모두 단일 플랫폼에서 운영하고 싶을 때
- PM이 Console UI로 스키마 변경을 직접 하고 싶을 때

**→ 현재 시점에서는 해당 없음**.

---

## 16. Phase별 로드맵 — 45 → 80 → 85 → 90+

### Phase 14d (현재, 진행중)
- `/api/v1/data/[table]` operator parser 완성 (eq, neq, gt, gte, lt, lte, in, nin, ilike, is, not)
- orderBy 표준화 (`?orderBy=created_at.desc,id.asc`)
- cursor pagination (`?cursor=...&limit=20`)
- TableAccess RLS 3롤 권한 매트릭스 (14c-γ 완료)

**기대 점수: 45 → 65**

### Phase 14e (1~2세션)
- Optimistic locking: `updated_at`에 마이크로초 정밀도 + `If-Match` 헤더 + `version` 컬럼 추가 검토 (solutions 문서 완료: `timestamp-precision-optimistic-locking.md`)
- CSRF 가드 (`/settings/*` 전역, Phase 14c에서 이미 추가)
- pgmq 확장 설치 + `src/server/queue/pgmq-client.ts` + 첫 worker (thumbnail)

**기대 점수: 65 → 78**

### Phase 15a (2~3세션)
- DMMF → OpenAPI 3.1 spec 자동 dump 스크립트 (`scripts/openapi-emit.ts`)
- `/api/v1/__meta__/schema` 엔드포인트 (정적 JSON)
- pgmq → 전체 잡 (email/pdf/cache) + pg_cron 정리 + dead letter

**기대 점수: 78 → 85**

### Phase 15b (조건부, 트리거 발동 후)
- pg_graphql `CREATE EXTENSION` + `/api/graphql` Route Handler
- persisted query lockdown
- RLS 3롤 재검증

**기대 점수: 85 → 90**

### Phase 16a (조건부, Subscription 수요 발생 후)
- PostGraphile v5로 마이그레이션 또는 Realtime 카테고리(9번) 독립 구현
- pg_graphql → PostGraphile 단계적 이행 (양립 가능)

**기대 점수: 90 → 95**

---

## 17. 리스크 레지스터

| ID | 리스크 | 확률 | 영향 | 완화 |
|----|--------|:---:|:---:|------|
| R-DA-1 | pgmq apt 패키지 부재 → pgrx 소스 빌드 필요 | 중 | 중 | Tembo APT 추가 또는 docker image 활용 |
| R-DA-2 | PG 마이너 업그레이드 후 확장 ABI 불일치 | 저 | 고 | `dpkg --hold postgresql-17`, 업그레이드 전 dry-run |
| R-DA-3 | operator parser에서 IDOR/SQLi | 저 | 치명 | Prisma parametrize 강제 + zod 검증 + 감사 로그 |
| R-DA-4 | pgmq archive 무한 누적 | 중 | 중 | pg_cron 일일 cleanup 또는 pg_partman |
| R-DA-5 | GraphQL 선제 도입 후 미사용 → 표면 노출만 증가 | 중 | 고 | 트리거 조건 강제, PoC 없이 production 노출 금지 |
| R-DA-6 | PostGraphile v4→v5 이행 미완 plugin 채택 | 저 | 중 | v5 공식만 사용, v4 플러그인 직접 포팅 금지 |

---

## 18. 새 DQ 등록

- **DQ-11.1**: operator parser에서 JSONB path (`filter[meta.key]=value`) 지원 여부 — Prisma 7 JsonFilter 호환성 검증 필요
- **DQ-11.2**: cursor pagination의 `base64(id|created_at)` 포맷 vs opaque string — 디버깅 친화도 vs 안정성
- **DQ-11.3**: pgmq worker를 PM2 fork mode 2개로 고정할지, dynamic scaling을 도입할지
- **DQ-11.4**: `/api/v1/__meta__/schema`가 RLS 타겟 사용자 역할별로 다른 스키마를 노출할지
- **DQ-11.5**: GraphQL 트리거 T2(응답 크기) 측정을 middleware에 상시 켜 둘지, 주 1회 batch로 할지

---

## 19. 참고자료 (20)

1. Wave 1 #01 — `01-pg-graphql-deep-dive.md`
2. Wave 1 #02 — `02-postgraphile-v5-deep-dive.md`
3. Wave 1 #03 — `03-pgmq-vs-bullmq-vs-sqlite-queue-deep-dive.md`
4. `_PROJECT_VS_SUPABASE_GAP.md` (Data API 45/100 항목)
5. `_SUPABASE_TECH_MAP.md` (PostgREST/pg_graphql/pgmq 매핑)
6. pg_graphql 공식 — https://github.com/supabase/pg_graphql
7. PostGraphile v5 공식 — https://postgraphile.org
8. pgmq 공식 — https://tembo.io/pgmq
9. Hasura CE 비교 — https://hasura.io/docs/latest/deployment/deployment-guides/docker/
10. tRPC 공식 — https://trpc.io (공개 API 호환성 섹션)
11. OpenAPI 3.1 — https://spec.openapis.org/oas/v3.1.0
12. Prisma DMMF — https://github.com/prisma/prisma/tree/main/packages/dmmf
13. Apollo Persisted Queries — https://www.apollographql.com/docs/apollo-server/performance/apq/
14. RFC 8259 (JSON for operator parser) — https://datatracker.ietf.org/doc/html/rfc8259
15. Relay Cursor Connections — https://relay.dev/graphql/connections.htm
16. Outbox Pattern (Chris Richardson) — https://microservices.io/patterns/data/transactional-outbox.html
17. SKIP LOCKED in Postgres — https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/
18. Cloudflare Tunnel WS 제약 — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
19. Next.js 16 Route Handler + runtime nodejs — https://nextjs.org/docs/app/api-reference/file-conventions/route
20. PostgreSQL statement_timeout — https://www.postgresql.org/docs/current/runtime-config-client.html

---

## 20. 최종 권고

Data API 100점은 "GraphQL 도입"을 꼭 필요로 하지 않는다. 현 시점의 45점 → 80~85점 경로는 **REST Route Handler 강화 + pgmq 확장**으로 100% 달성 가능하며, 그 비용은 **추가 외부 서비스 0개, 추가 Node 의존 3~4개, 1인 운영 부담 +5시간/월 수준**이다. 이 지점을 먼저 밟아야 "GraphQL 도입이 진짜 필요한 시점"인지 **실측으로** 판정할 수 있다.

반대로 지금 GraphQL을 선제 도입하면 (pg_graphql이든 PostGraphile이든) **스키마 표면 자동 노출로 인한 감사 부담 + 빌드 의존성 증가 + "GraphQL 정의 추가"라는 운영 의례**가 늘어난다. 이 비용은 수요가 발동하지 않는 한 순수 낭비다.

**따라서**: 즉시 착수는 A+C, 나머지는 트리거 기반 대기. 이 문서는 그 트리거를 수치로 못박음으로써 "결정 지연 비용 = 0"을 보장한다.
