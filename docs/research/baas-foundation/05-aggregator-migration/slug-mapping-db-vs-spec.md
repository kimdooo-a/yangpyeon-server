# Aggregator 슬러그 매핑 — DB 시드 (37) vs spec classify.ts (40)

> 작성: 2026-05-02 세션 80 B-pre
> 트리거: aggregator T4 (classify.ts port) 진입 전 R2 위험 검증 (`docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md` §9 R2)
> 결론: **DB 시드를 source of truth 로 사용. classify.ts 포팅 시 slug 필드를 DB 값으로 정정.** spec 의 slug 는 그대로 못 씀 (FK 제약 때문에 INSERT 즉시 실패).
> 단일 진실 소스: `prisma/seeds/almanac-aggregator-categories.sql`

---

## 0. 요약

| 차원 | DB 시드 (운영 진실) | classify spec | 정확 매치 |
|---|---|---|---|
| 총 슬러그 | 37 | 40 | 8 |
| hustle | 6 | 7 | 3 (monetization, creator-economy, freelance) |
| work | 6 | 5 | 0 |
| build | 7 | 10 | 3 (open-source-llm, ai-companies, devtools) |
| invest | 6 | 5 | 1 (ipo-acquisition) |
| learn | 6 | 7 | 0 |
| community | 6 | 6 | 1 (hiring) |

차이의 원인:
1. **단/복수 컨벤션 차이**: spec `tutorials` ↔ DB `tutorial`, spec `conferences` ↔ DB `conference`
2. **명시 정도 차이**: DB `funding` ↔ spec `ai-funding`, DB `infrastructure` ↔ spec `ai-infrastructure`
3. **DB 한국 특화**: `korean-tech`, `korean-community` (spec 에는 없음)
4. **DB 누락 spec 항목**: spec `model-releases`, `fine-tuning`, `ai-safety`, `benchmarks` 등 10개 (DB 에는 미등록)
5. **spec 누락 DB 항목**: DB `data-science`, `system-design`, `career-growth`, `discussion`, `macro-economy`, `market-analysis`, `public-markets` 등 9개

---

## 1. Track 별 매핑 표 (T4 사용)

### 1.1 hustle (DB 6 ↔ spec 7)

| DB slug | spec slug | 매핑 결정 | 비고 |
|---|---|---|---|
| `side-project` | `side-projects` | **DB 사용** | 단/복수 차이만 |
| `indie-hacker` | `indie-hackers` | **DB 사용** | 단/복수 차이만 |
| `monetization` | `monetization` | **그대로** | ✅ 정확 매치 |
| `freelance` | `freelance` | **그대로** | ✅ 정확 매치 |
| `creator-economy` | `creator-economy` | **그대로** | ✅ 정확 매치 |
| `saas-bootstrap` | `saas-business` | **DB 사용** | 의미 좁힘 (bootstrap = VC 없이) |
| (없음) | `marketing-growth` | **drop** | DB 미등록 |

→ classify.ts hustle: 7 슬러그 → **6 매처 (DB slug 사용)**, marketing-growth 제거

### 1.2 work (DB 6 ↔ spec 5)

| DB slug | spec slug | 매핑 결정 | 비고 |
|---|---|---|---|
| `productivity` | `productivity-tools` | **DB 사용** | 도구 한정 → 일반 |
| `automation` (없음) | `automation` | **drop** | DB 미등록 (대신 `no-code` 가까움) |
| `team-ops` | `team-collaboration` | **DB 사용** | 의미 차이 (협업 → 운영) |
| `ai-workflow` | `ai-at-work` | **DB 사용** | 표현 차이 |
| `knowledge-mgmt` | `knowledge-management` | **DB 사용** | 약어 |
| `no-code` | (없음) | **DB 신규 매처 추가** | spec 미포함 — 키워드: zapier/n8n/make.com 등 |
| `remote-work` | (없음) | **DB 신규 매처 추가** | spec 미포함 — 키워드: remote/distributed/asynchronous |

→ classify.ts work: 5 매처 → **6 매처 (DB slug 사용)**, automation drop, no-code/remote-work 신규

### 1.3 build (DB 7 ↔ spec 10)

| DB slug | spec slug | 매핑 결정 | 비고 |
|---|---|---|---|
| `open-source-llm` | `open-source-llm` | **그대로** | ✅ 정확 매치 |
| `ai-companies` | `ai-companies` | **그대로** | ✅ 정확 매치 |
| `infrastructure` | `ai-infrastructure` | **DB 사용** | 일반화 |
| `rag-agents` | `rag-vector` + `agents` | **DB 사용 (병합)** | 두 spec 매처를 한 DB slug 에 |
| `devtools` | `devtools` | **그대로** | ✅ 정확 매치 |
| `korean-tech` | (없음) | **DB 신규 매처** | 키워드: 네이버/카카오/라인/우아한 |
| `research-paper` | (없음 — 단 spec 에 `research-papers` learn 있음) | **DB 사용** | build 트랙 — arxiv/cs.AI/cs.LG 등 |
| (없음) | `model-releases` | **drop** | DB 미등록 |
| (없음) | `fine-tuning` | **drop** | DB 미등록 |
| (없음) | `ai-safety` | **drop** | DB 미등록 |
| (없음) | `benchmarks` | **drop** | DB 미등록 |

→ classify.ts build: 10 매처 → **7 매처 (DB slug 사용)**, 4개 drop, korean-tech 신규

### 1.4 invest (DB 6 ↔ spec 5)

| DB slug | spec slug | 매핑 결정 | 비고 |
|---|---|---|---|
| `funding` | `ai-funding` | **DB 사용** | AI 한정 → 일반 |
| `vc-thesis` | `venture-capital` | **DB 사용** | 인사이트 강조 |
| `ipo-acquisition` | `ipo-acquisition` | **그대로** | ✅ 정확 매치 |
| `market-analysis` | (없음) | **DB 신규 매처** | 키워드: market analysis/sector report |
| `public-markets` | (없음 — spec `earnings` 가 가장 가까움) | **DB 사용** | 주식/환율/채권 |
| `macro-economy` | (없음) | **DB 신규 매처** | 키워드: 금리/inflation/policy |
| (없음) | `valuation` | **drop or merge to vc-thesis** | DB 미등록 |
| (없음) | `earnings` | **merge → public-markets** | 의미 가까움 |

→ classify.ts invest: 5 매처 → **6 매처 (DB slug 사용)**, valuation drop, earnings → public-markets, market-analysis/macro-economy 신규

### 1.5 learn (DB 6 ↔ spec 7)

| DB slug | spec slug | 매핑 결정 | 비고 |
|---|---|---|---|
| `tutorial` | `tutorials` | **DB 사용** | 단/복수 |
| `deep-dive` | `deep-dives` | **DB 사용** | 단/복수 |
| `paper-summary` | `research-papers` | **DB 사용** | 요약 강조 |
| `data-science` | (없음) | **DB 신규 매처** | 키워드: data science/analysis/visualization |
| `system-design` | (없음) | **DB 신규 매처** | 키워드: system design/architecture/scalability |
| `career-growth` | (없음) | **DB 신규 매처** | 키워드: career/promotion/이직 |
| (없음) | `courses` | **drop** | DB 미등록 |
| (없음) | `guides` | **drop** | DB 미등록 |
| (없음) | `case-studies` | **drop** | DB 미등록 |
| (없음) | `explainers` | **drop** | DB 미등록 |

→ classify.ts learn: 7 매처 → **6 매처 (DB slug 사용)**, 4 drop, 3 신규

### 1.6 community (DB 6 ↔ spec 6)

| DB slug | spec slug | 매핑 결정 | 비고 |
|---|---|---|---|
| `hiring` | `hiring` | **그대로** | ✅ 정확 매치 |
| `conference` | `conferences` | **DB 사용** | 단/복수 |
| `hackathon` | `hackathons` | **DB 사용** | 단/복수 |
| `discussion` | (없음) | **DB 신규 매처** | 키워드: discussion/debate/interview |
| `korean-community` | (없음) | **DB 신규 매처** | 키워드: 긱뉴스/요즘IT/모각코 |
| `layoff-restructure` | `layoffs` | **DB 사용** | 정리해고+구조조정 병합 |
| (없음) | `meetups` | **drop or merge → discussion** | DB 미등록 |
| (없음) | `open-positions` | **merge → hiring** | 의미 동일 |

→ classify.ts community: 6 매처 → **6 매처 (DB slug 사용)**, meetups/open-positions 병합, discussion/korean-community 신규

---

## 2. T4 commit 시 적용 정책

### 2.1 SUBCATEGORY_RULES 작성 규칙

```ts
// classify.ts (T4 port 시)
const SUBCATEGORY_RULES: SubcategoryRule[] = [
  // ===== build (7) — DB 시드 슬러그 사용 =====
  { slug: "open-source-llm", track: "build", pattern: ... },
  { slug: "ai-companies",    track: "build", pattern: ... },
  { slug: "infrastructure",  track: "build", pattern: ... },  // spec ai-infrastructure → DB infrastructure
  { slug: "rag-agents",      track: "build", pattern: ... },  // spec rag-vector + agents 병합
  { slug: "devtools",        track: "build", pattern: ... },
  { slug: "korean-tech",     track: "build", pattern: ... },  // 신규 (네이버/카카오/라인 키워드)
  { slug: "research-paper",  track: "build", pattern: ... },  // spec 의 learn 트랙 research-papers 와 별개
  // ===== work (6) — DB 시드 슬러그 사용 =====
  // ... 등 동일 패턴
];
```

### 2.2 검증 게이트 (T4 RLS 통합 테스트)

```ts
// tests/aggregator/classify.test.ts
test("getAvailableCategorySlugs() ↔ DB content_categories.slug 동기화", async () => {
  await runWithTenant({ tenantId: ALMANAC_UUID }, async () => {
    const dbSlugs = await prismaWithTenant.contentCategory.findMany({
      select: { slug: true },
    });
    const dbSlugSet = new Set(dbSlugs.map(r => r.slug));
    const classifySlugs = getAvailableCategorySlugs();

    for (const slug of classifySlugs) {
      expect(dbSlugSet.has(slug)).toBe(true);  // classify slug 가 DB 에 존재해야
    }
  });
});
```

**FAIL 정책**: classify.ts 의 slug 가 DB 시드에 없으면 promote.ts FK violation → cron 실패. 통합 테스트가 즉시 차단.

### 2.3 향후 추가 슬러그 정책

DB 에 새 슬러그가 추가되면 (`prisma/seeds/almanac-aggregator-categories.sql` 갱신 + 마이그레이션 또는 시드 재실행):
- classify.ts 에 매처 추가 (의미 키워드)
- 또는 매처 없이 LLM 폴백만 사용 (classify.ts 가 undefined 반환 → llm.ts 가 DB slug 목록 보고 결정)

→ classify.ts 의 매처 부재는 graceful — 전부 LLM 으로 위임 가능.

---

## 3. 위험 / 미결

| # | 항목 | 영향 | 대응 |
|---|---|---|---|
| S1 | DB 시드 갱신 시 classify.ts 와 drift | promote.ts FK violation | `tests/aggregator/classify.test.ts` 의 동기화 테스트가 차단 |
| S2 | spec 의 4개 build 슬러그 (model-releases / fine-tuning / ai-safety / benchmarks) drop 으로 인한 분류 정확도 하락 | 첫 카드 품질 저하 | 운영 후 DB 시드 추가 + classify.ts 매처 추가 (24h 관찰 후 결정) |
| S3 | DB 시드의 한국 특화 슬러그 (korean-tech, korean-community) 매처 작성 시 키워드 누락 | 한국 콘텐츠 분류 실패 | T4 단위 테스트에 한국어 케이스 5개 이상 |
| S4 | build/research-paper vs learn/paper-summary 트랙 충돌 | 같은 arxiv 논문이 다른 트랙으로 분류 | classify.ts MIN_TRACK_SCORE 우선순위 — build keyword 가 더 강한 가중치 받게 조정 |

---

## 4. 결정 근거

- DB 시드는 이미 운영 적용됨 (T1.6 `20260427140000_t1_6_aggregator_with_tenant`). RLS + dbgenerated default + composite unique 모두 활성. **DB 변경 비용** = 마이그레이션 + 시드 재실행 + 운영 검증 = ~2h.
- classify.ts 는 아직 포팅 전 (spec 만 존재). **classify.ts 변경 비용** = T4 commit 작성 시 slug 필드만 정정 = 0h 추가.
- 따라서 **DB 시드 = source of truth**.
- 추후 DB 시드를 spec 슬러그 쪽으로 진화시키려면 (`fine-tuning`, `benchmarks` 추가 등) 별도 마이그레이션 + 운영 검증 사이클로 분리.

---

## 5. 단일 진실 소스 갱신

본 문서가 작성된 시점(세션 80 B-pre)부터 다음 commit (T4 = B3) 까지의 매핑 표는 본 문서다.

T4 commit 후 classify.ts 자체가 source of truth 가 되며, 본 문서는 archived note 로 보존 (역사 삭제 금지 정책).
