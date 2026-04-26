# Almanac → 양평 부엌 서버 — Phase 2 Aggregator 인수인계

> 작성: 2026-04-27
> 보내는 쪽: Almanac 개발팀 (almanac-flame.vercel.app)
> 받는 쪽: 양평 부엌 서버 운영자 (kimdooo@stylelucky4u.com)
> 짝 문서: `docs/assets/260426-almanac-tenant-integration.md` (양평 → Almanac, 세션 62)
> 참조 패키지: `docs/assets/yangpyeon-aggregator-spec/` (v1.0 spec, 41 파일)

---

## 0. TL;DR

> Almanac이 `/explore` 라우트와 yangpyeon 호출 클라이언트 구축을 마쳤습니다. **Almanac은 즉시 트래픽을 받을 준비가 되어 있고**, 양평 측 Phase 2(T2.5)가 완료되어 `content_items` 가 채워지기 시작하면 자동으로 가동됩니다. 본 문서는 Phase 2에서 양평이 구현해야 할 **(1) crawler/classify/promote 비즈니스 로직** + **(2) 5개 REST 엔드포인트의 응답 계약** + **(3) 우선순위·검증 시나리오**를 정합니다.

---

## 1. 현재 상태 (2026-04-27 기준)

### 1.1 양평 측 — **완료** (세션 62, 2026-04-26)

✅ Multi-tenant BaaS 전환 (ADR-022)
✅ `tenants` 테이블에 `slug='almanac'` row 시드 (UUID `00000000-0000-0000-0000-000000000001`)
✅ `content_*` 5 테이블 + 3 enum 마이그레이션 (T1.6, RLS 활성)
✅ `CronKind` enum에 `AGGREGATOR` 추가
✅ Tenant API 키 발급 인프라 (pub_almanac / srv_almanac)
✅ `/api/v1/t/almanac/*` 라우터 + JWKS + Cross-validation
✅ `/api/v1/almanac/*` → 308 alias

### 1.2 양평 측 — **미완료** (Phase 2 / T2.5 대상)

❌ 5개 REST 엔드포인트 핸들러 (`/api/v1/t/almanac/{contents,categories,sources,today-top,items/[slug]}`)
❌ Aggregator 비즈니스 로직 (`packages/tenant-almanac/aggregator/*` 또는 동등 경로)
   - fetchers (rss/html/api/firecrawl)
   - dedupe (URL canonicalize + sha256 → urlHash)
   - classify (트랙 + 서브카 키워드 매처)
   - llm (Gemini Flash throttle + RPD 한도)
   - promote (ingested → content_items)
   - cron AGGREGATOR 분기 핸들러
❌ 시드 데이터 적재 (카테고리 37 + 소스 60+)
❌ Cron job 6종 등록 (rss-fetch / html-scrape / api-poll / classify / promote / cleanup)
❌ (옵션) 관리자 UI 4페이지

### 1.3 Almanac 측 — **완료** (이번 세션, 2026-04-27)

✅ `src/lib/almanac/yangpyeon-client.ts` — server-only fetch, Bearer 인증, ISR 300s, fail-open
✅ `src/lib/almanac/yangpyeon-types.ts` — 응답 타입 정의 (양평이 반드시 충족할 shape)
✅ `src/lib/almanac/aggregator-adapter.ts` — yangpyeon item → AlmanacPost 변환
✅ `/explore` 라우트 + 4개 컴포넌트 (TodayTopRail / CategoryTree / SourceBundle / AggregatorFeed)
✅ 헤더 네비 "분야별 모음" 메뉴 (4개 언어 i18n)
✅ sitemap.ts에 `/explore` 추가
✅ next.config.ts `images.remotePatterns` 25개 호스트
✅ 피처 플래그 `NEXT_PUBLIC_AGGREGATOR_ENABLED` 로 점진 출시 제어

### 1.4 운영 절차 — **미완료** (양평 → Almanac 인수)

❌ `srv_almanac_*` API 키 발급 → Vercel `ALMANAC_TENANT_KEY` 환경변수 등록
❌ `NEXT_PUBLIC_AGGREGATOR_ENABLED=true` 설정 (Phase 2 데이터 가동 후)
❌ 출시 게이트 4개 검증

---

## 2. Almanac이 양평을 어떻게 호출하는지 (참고)

### 2.1 호출 패턴

```
Vercel Edge / Server Component
  ↓ fetch (Authorization: Bearer srv_almanac_<random>)
  ↓ next: { revalidate: 300, tags: ['almanac:aggregator'] }
https://stylelucky4u.com/api/v1/t/almanac/<endpoint>
  ↓ 양평 withTenant + withApiKey
  ↓ Phase 2: aggregator handler
  ↓ Prisma + RLS (tenant_id 자동 격리)
PostgreSQL
```

- **모두 server-side fetch** — CORS 사실상 무관
- **fail-open**: 양평이 4xx/5xx/타임아웃이면 Almanac은 빈 배열로 폴백 + "동기화 중" 메시지
- **ISR**: 응답은 5분간 캐시, 그 후 백그라운드 revalidate
- **타임아웃**: 8초

### 2.2 정확한 클라이언트 호출 코드 (Almanac 측, 양평이 알아둘 것)

```typescript
// src/lib/almanac/yangpyeon-client.ts
const url = `${YANGPYEON_BASE_URL}/api/v1/t/almanac/contents?limit=20&sort=latest`;
fetch(url, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${ALMANAC_TENANT_KEY}`,
    Accept: "application/json",
  },
  next: { revalidate: 300, tags: ["almanac:aggregator"] },
});
```

### 2.3 Almanac이 호출하는 5개 엔드포인트

| # | 엔드포인트 | 호출 빈도 | 캐시 | 목적 |
|---|---|---|---|---|
| 1 | `GET /contents` | /explore 진입마다 (5분 ISR) | s-maxage=60 권장 | 메인 피드 (track/category/q/source 필터) |
| 2 | `GET /categories` | /explore 진입마다 (10분 ISR) | s-maxage=300 | 트랙별 서브카 트리 + 카운트 |
| 3 | `GET /sources` | /explore 진입마다 (30분 ISR) | s-maxage=1800 | 소스 묶음 표시 |
| 4 | `GET /today-top` | /explore 진입마다 (10분 ISR) | s-maxage=600 | 트랙별 오늘의 TOP |
| 5 | `GET /items/[slug]` | 미사용 (현재 Almanac은 외부 URL로 직접 이동) | — | 단건 조회 (예약) |

**MVP 우선순위**: 1, 2, 3 → Phase 2 1주차. 4 → 2주차. 5 → 보류 가능.

---

## 3. API 계약 (Contract) — 반드시 이 shape를 따를 것

> Almanac `src/lib/almanac/yangpyeon-types.ts` 와 1:1 매칭. 변경 시 Almanac 빌드 깨짐. Almanac 측 수정 없이 양평이 이 shape를 충족해야 함.

### 3.1 공통 응답 envelope

성공:
```json
{
  "success": true,
  "data": { ... }
}
```

실패 (Almanac은 모두 fail-open):
```json
{
  "success": false,
  "error": { "code": "STRING_CODE", "message": "한국어 메시지" }
}
```

### 3.2 GET `/api/v1/t/almanac/contents`

**쿼리 파라미터** (모두 optional):
- `track`: `hustle | work | build | invest | learn | community`
- `category`: 카테고리 slug (예: `open-source-llm`)
- `q`: 제목/요약 부분 검색
- `language`: `ko | en | ja` 등
- `source`: 소스 slug (예: `openai-blog`)
- `from`, `to`: ISO datetime
- `cursor`: 다음 페이지 커서 (양평이 정의한 형식 그대로 사용 — Almanac은 opaque로 취급)
- `limit`: 1~50 (기본 20)
- `sort`: `latest | popular | featured` (기본 `latest`)

**응답 data**:
```json
{
  "items": [
    {
      "id": "string (cuid 또는 uuid)",
      "slug": "string (URL-safe)",
      "title": "string",
      "excerpt": "string",
      "aiSummary": "string | null",
      "url": "string (canonical, 외부 URL)",
      "imageUrl": "string | null",
      "author": "string | null",
      "publishedAt": "ISO datetime",
      "firstSeenAt": "ISO datetime (optional)",
      "language": "string | null",
      "tags": ["string", "..."],
      "keywords": ["string", "..."],
      "track": "hustle|work|build|invest|learn|community",
      "categoryId": "string | null",
      "category": {
        "slug": "string",
        "name": "string (한국어)",
        "track": "string"
      } | null,
      "source": {
        "slug": "string",
        "name": "string",
        "kind": "RSS|HTML|API|FIRECRAWL"
      },
      "score": 0.0,
      "pinned": false,
      "featured": false,
      "qualityFlag": "auto_ok|manual_review",
      "viewCount": 0,
      "clickCount": 0
    }
  ],
  "nextCursor": "string | null",
  "filters": { "track": "build", "category": "open-source-llm" }
}
```

> **중요**: `qualityFlag === "blocked"` 인 행은 응답에서 제외. Almanac은 `auto_ok` 와 `manual_review` 만 받는다고 가정.

### 3.3 GET `/api/v1/t/almanac/categories`

**쿼리 파라미터**: `track` (optional)

**응답 data**:
```json
{
  "byTrack": {
    "build": [
      { "slug": "open-source-llm", "name": "오픈소스 LLM", "nameEn": "Open-source LLM", "icon": "Cpu", "sortOrder": 1, "count": 42 },
      { "slug": "ai-companies", "name": "AI 회사 공지", "nameEn": "AI Companies", "icon": "Building", "sortOrder": 2, "count": 28 }
    ],
    "hustle": [...],
    "...": "..."
  }
}
```

> `count` 는 `qualityFlag != 'blocked'` 인 `content_items` 만 카운트. 정렬은 `sortOrder` ASC.

### 3.4 GET `/api/v1/t/almanac/sources`

**쿼리 파라미터**: `kind` (optional, RSS/HTML/API/FIRECRAWL), `country` (optional)

**응답 data**:
```json
{
  "sources": [
    {
      "slug": "openai-blog",
      "name": "OpenAI Blog",
      "kind": "RSS",
      "country": "en",
      "defaultTrack": "build",
      "lastSuccessAt": "2026-04-27T08:00:00Z"
    }
  ]
}
```

> `active = true` 만 응답. Almanac은 `country`/`slug` 패턴으로 그룹화 (한국어/AI회사/VC/커뮤니티/연구).

### 3.5 GET `/api/v1/t/almanac/today-top`

**쿼리 파라미터**: `date` (optional, YYYY-MM-DD, 기본 오늘)

**응답 data**:
```json
{
  "date": "2026-04-27",
  "byTrack": {
    "build": [ /* contents/route.ts 의 item과 동일 shape, 각 트랙당 10개 권장 */ ],
    "hustle": [...],
    "...": "..."
  }
}
```

추천 알고리즘:
```
score_today = (0.4 * metric.views + 0.6 * item.score) * (publishedAt 24h 이내 ? 1.5 : 1.0)
```
트랙별 Top 10 → byTrack 객체로 그룹.

### 3.6 GET `/api/v1/t/almanac/items/[slug]`

단건 조회. 현재 Almanac은 미사용이지만 향후 디테일 페이지용. 응답은 contents item 1개와 동일 shape (단, `category`, `source` 항상 포함). 없거나 `qualityFlag='blocked'` 면 404.

---

## 4. 인증 & 인가

### 4.1 인증 헤더 (Almanac이 보낼)

```http
GET /api/v1/t/almanac/contents HTTP/1.1
Host: stylelucky4u.com
Authorization: Bearer srv_almanac_<32-base64url>
Accept: application/json
```

### 4.2 양평이 검증해야 할 것 (ADR-027 §8 기준)

- 정규식 `^(pub|srv)_almanac_[A-Za-z0-9_-]{32,}$`
- DB lookup → bcrypt hash 검증 → revokedAt null
- Cross-validation 1: `dbTenant.slug === 'almanac'`
- Cross-validation 2: `dbTenant.slug === pathTenant.slug`
- 위반 시 401 또는 403 (K3 매트릭스)

### 4.3 인가 정책

- 5개 GET 엔드포인트는 `srv` 키 또는 `pub` 키 모두 허용
- `read:content` scope만 요구 (옵션 — scope 검증 안 해도 됨)
- 익명 호출은 **거부** 권장 (Almanac은 항상 키를 보냄)

---

## 5. 데이터 흐름 — Phase 2에서 양평이 구현해야 할 비즈니스 로직

### 5.1 라이프사이클 (단일 콘텐츠)

```
[1] Cron tick (매 15분) → fetcher 호출
[2] fetcher: 외부 fetch → RawItem[] 반환
[3] dedupe: urlHash 비교 → 신규만 통과
[4] DB INSERT content_ingested_items (status='pending', tenant_id='almanac UUID')

[5] Cron tick (매 5분) → classifier
[6] 규칙 매처로 트랙 + 서브카 1차
[7] Gemini Flash로 enrich (요약/태그/언어)
[8] DB UPDATE status='ready'

[9] Cron tick (매 10분) → promoter
[10] slug 생성 → content_items UPSERT
[11] DB INSERT content_items (qualityFlag='auto_ok')

[12] Almanac이 GET /contents 호출
[13] Prisma + RLS → JSON 반환
[14] /explore 렌더
```

### 5.2 Cron 잡 6종 (양평이 등록할 것)

| 이름 | schedule | kind | payload |
|---|---|---|---|
| `aggregator:rss-fetch` | `every 15m` | `AGGREGATOR` | `{"module":"rss-fetcher"}` |
| `aggregator:html-scrape` | `every 30m` | `AGGREGATOR` | `{"module":"html-scraper"}` |
| `aggregator:api-poll` | `every 20m` | `AGGREGATOR` | `{"module":"api-poller"}` |
| `aggregator:classify` | `every 5m` | `AGGREGATOR` | `{"module":"classifier","batch":50}` |
| `aggregator:promote` | `every 10m` | `AGGREGATOR` | `{"module":"promoter"}` |
| `aggregator:cleanup` | `0 3 * * *` | `SQL` | `{"sql":"DELETE FROM content_ingested_items WHERE tenant_id='00000000-...' AND status='duplicate' AND fetched_at < NOW() - INTERVAL '7 days'"}` |

`AGGREGATOR` kind 분기는 양평 `src/lib/cron/runner.ts` 의 `dispatchCron` 에 추가:

```typescript
if (job.kind === "AGGREGATOR") {
  const moduleName = payload.module as string;
  const result = await runAggregatorModule({
    module: moduleName as any,
    batch: typeof payload.batch === "number" ? payload.batch : undefined,
    tenantId: job.tenantId,  // 양평 cron 인프라가 tenant 격리
  });
  return result;
}
```

### 5.3 코드 산출물 — 그대로 복붙 사용

본 spec 패키지 `docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/` 의 10개 파일:

| 파일 | 역할 | 양평 측 적용 시 |
|---|---|---|
| `types.ts` | RawItem, EnrichedItem, FetchReport | 거의 그대로 |
| `dedupe.ts` | URL canonicalize + sha256 | 그대로. **단** `dedupeAgainstDb` 는 `tenant_id` 추가 필터 적용 (RLS가 자동 처리하지만 명시적 SET 권장) |
| `classify.ts` | 트랙 + 서브카 키워드 매처 (40 슬러그) | 그대로 |
| `llm.ts` | Gemini throttle + RPD 한도 | 그대로 |
| `fetchers/rss.ts` | rss-parser | 그대로 |
| `fetchers/html.ts` | cheerio + parserConfig | 그대로 |
| `fetchers/api.ts` | HN/Reddit/PH/ArXiv/Firecrawl | 그대로 |
| `fetchers/index.ts` | 디스패처 | 그대로 |
| `promote.ts` | ingested → items | 그대로. **단** Prisma upsert 시 `tenant_id` 명시 (RLS가 강제) |
| `runner.ts` | 5 모듈 디스패처 | 그대로. **단** signature에 `tenantId` 추가 |

> **다중 테넌트 적응 포인트**: 모든 Prisma 호출은 `prisma.$queryRaw\`SET LOCAL app.tenant_id = ${tenantId}\`` 또는 양평의 tenant-aware Prisma extension 사용. 이건 양평 측 패턴에 따르되, `runner.ts` 진입점에서 1회만 SET하면 그 cron 실행 컨텍스트 전체에 적용.

### 5.4 시드 데이터

`docs/assets/yangpyeon-aggregator-spec/seeds/` 의 두 SQL:

| 파일 | 행 수 | 비고 |
|---|---|---|
| `categories.sql` | 37 | tenant_id 컬럼 추가 필요 (현재 spec은 멀티테넌트 도입 전 작성). `INSERT ... VALUES (..., '00000000-0000-0000-0000-000000000001', ...)` 형태로 변환 |
| `feed-sources.sql` | 60 | 동일하게 tenant_id 추가 |

또는 `docs/assets/yangpyeon-aggregator-spec/code/prisma/seed-aggregator.ts` 를 멀티테넌트 시드 패턴으로 수정해서 사용.

---

## 6. 우선순위 (양평 Phase 2 일정 가이드)

### Week 1 — MVP (Almanac /explore 가시화)

목표: Almanac /explore에 카드가 1개라도 표시되는 상태.

| Day | 산출물 | Almanac 측 영향 |
|---|---|---|
| 1 | 카테고리 + 소스 시드 (5 소스만, 2 카테고리만) | `/categories`, `/sources` 응답 비어있지 않음 |
| 2 | RSS fetcher + dedupe + DB insert (수동 1회) | `content_ingested_items` 채워짐 |
| 3 | classifier (규칙만, LLM 보류) + promoter | `content_items` 채워짐 |
| 4 | `/contents` + `/categories` + `/sources` 핸들러 | Almanac /explore에 카드 표시 시작 |
| 5 | cron 5개 등록 + 자동 가동 | 24h 자동 수집 흐름 |

이 시점에 Almanac에 알림 → `NEXT_PUBLIC_AGGREGATOR_ENABLED=true` 설정 → Vercel redeploy. 가시화.

### Week 2 — 확장

| Day | 산출물 |
|---|---|
| 6 | LLM enrich (Gemini Flash) 도입 |
| 7 | HTML 스크래퍼 + 한국어 6사 셀렉터 |
| 8 | 외부 API 어댑터 (HN/Reddit/PH/ArXiv) |
| 9 | RSS 풀 50개 추가 |
| 10 | `/today-top` 핸들러 + ContentItemMetric 집계 cron |
| 11 | 관리자 UI 4페이지 (옵션) |
| 12 | 안정화 + 성능 측정 |

### Week 3 — 출시

| Day | 산출물 |
|---|---|
| 13 | 부하 테스트 + Sentry hookup + Audit log 강화 |
| 14 | 출시 게이트 4개 검증 |
| 15 | 1.0 가동 + 운영 런북 정리 |

---

## 7. 검증 시나리오 (양평이 단계별로 확인)

### Step 1. 시드 적용 후

```bash
psql $DATABASE_URL -c "
SELECT track, count(*) FROM content_categories
WHERE tenant_id='00000000-0000-0000-0000-000000000001' GROUP BY track;
"
# 6 트랙 × 6~7 = 37 행
```

### Step 2. RSS fetch 1회 수동

양평 cron 관리자 UI에서 `aggregator:rss-fetch` 1회 실행. 또는:

```bash
# 양평 ADMIN bearer 토큰으로
curl -X POST -H "Authorization: Bearer <ADMIN_BEARER>" \
  https://stylelucky4u.com/api/v1/cron/<CRON_ID>/run
```

확인:
```sql
SELECT count(*), status FROM content_ingested_items
WHERE tenant_id='00000000-0000-0000-0000-000000000001'
GROUP BY status;
-- pending: > 0
```

### Step 3. classify + promote 수동 실행 후

```sql
SELECT count(*), track FROM content_items
WHERE tenant_id='00000000-0000-0000-0000-000000000001'
GROUP BY track;
-- 트랙별 분포 확인
```

### Step 4. Almanac 키로 REST 호출

```bash
KEY="srv_almanac_<발급받은 키>"

# (1) categories
curl -s -H "Authorization: Bearer $KEY" \
  https://stylelucky4u.com/api/v1/t/almanac/categories | jq .
# 예상: success:true, byTrack에 6 트랙 배열

# (2) sources
curl -s -H "Authorization: Bearer $KEY" \
  https://stylelucky4u.com/api/v1/t/almanac/sources | jq .
# 예상: sources 배열 5개 이상

# (3) contents
curl -s -H "Authorization: Bearer $KEY" \
  "https://stylelucky4u.com/api/v1/t/almanac/contents?limit=10&sort=latest" | jq .
# 예상: items 배열 + nextCursor

# (4) today-top
curl -s -H "Authorization: Bearer $KEY" \
  https://stylelucky4u.com/api/v1/t/almanac/today-top | jq .
# 예상: byTrack 객체

# (5) cross-tenant 거부 테스트
curl -i -H "Authorization: Bearer $KEY" \
  https://stylelucky4u.com/api/v1/t/other-tenant/categories
# 예상: 403 CROSS_TENANT_FORBIDDEN
```

### Step 5. Almanac 측 가시화

(양평 측이 통보 → Almanac 측에서 1줄 변경)
1. Vercel env: `NEXT_PUBLIC_AGGREGATOR_ENABLED=true`
2. Redeploy
3. https://almanac-flame.vercel.app/explore 확인
   - 헤더에 "분야별 모음" 메뉴
   - TrackGrid 6 트랙
   - 오늘의 분야별 TOP (있으면)
   - 카테고리 칩 트리
   - 소스별 묶음
   - 메인 피드 카드들

### Step 6. 출시 게이트 4개

`docs/assets/yangpyeon-aggregator-spec/verification/e2e-checklist.md` 참조.

- [ ] 60+ 소스 활성, 24h 수집 ≥ 300건
- [ ] 분류 정확도 spot-check 20건 ≥ 90%
- [ ] yangpyeon API p95 < 250ms (cache hit), < 500ms (miss)
- [ ] Almanac /explore LCP < 2.5s, CLS < 0.1

---

## 8. Almanac 측 fail-open 동작 (양평 운영 영향)

Almanac은 양평이 어떤 상태든 페이지가 안 깨집니다:

| 양평 상태 | Almanac 응답 |
|---|---|
| 정상 200 | 카드 정상 표시 |
| 빈 응답 (`items:[]`) | "아직 수집된 콘텐츠가 없거나 동기화 중입니다" 메시지 |
| 401/403/4xx | 콘솔 워닝 + 빈 배열 fallback |
| 500/타임아웃 | 콘솔 워닝 + 빈 배열 fallback |
| 네트워크 단절 | 콘솔 워닝 + 빈 배열 fallback |

→ 양평이 Phase 2 작업 중 **언제든 배포·재시작·DB 마이그레이션 해도 Almanac은 무사**합니다.

---

## 9. 양평 측 환경변수 (Almanac이 알아둘 것)

본 통합에 필요한 양평 측 .env:

```env
# Gemini Flash (콘텐츠 분류·요약)
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash

# 옵션 — 동적 SPA 사이트 fallback
FIRECRAWL_API_KEY=fc-...

# CORS (Almanac이 server-side fetch라 사실상 불필요하지만 안전 fallback)
ALMANAC_ALLOWED_ORIGINS=https://almanac-flame.vercel.app,https://www.almanac-flame.vercel.app

# 봇 식별
AGGREGATOR_BOT_USER_AGENT=AlmanacBot/1.0 (+https://stylelucky4u.com)
AGGREGATOR_LLM_DAILY_BUDGET=200       # Gemini RPD 안전선
AGGREGATOR_MAX_ITEMS_PER_SOURCE=20    # 한 회 fetch 상한
```

---

## 10. 양평 → Almanac 통보 채널

Phase 2 진행 중 다음 이벤트는 Almanac 측에 통보 권장 (혼자 운영이지만 기록 남기는 차원):

| 이벤트 | 통보 시점 | Almanac 액션 |
|---|---|---|
| MVP Step 5 완료 (cron 자동 가동) | 그날 즉시 | `NEXT_PUBLIC_AGGREGATOR_ENABLED=true` 설정 → Redeploy |
| 출시 게이트 4개 통과 | 당일 | 1.0 정식 출시 알림 |
| `/api/v1/almanac/*` alias 종료 D-Day | 7일 전 | (Almanac은 이미 `/t/almanac/*` 정식 경로 사용 중이므로 영향 없음) |
| Gemini 한도 변경 | 변경 시 | 운영 런북 갱신 |
| 신규 소스 추가/제거 | 주간 리뷰 시 | 메뉴 그룹 정의(`SourceBundle`) 갱신 검토 |

---

## 11. 리스크와 미해결 항목

| 항목 | 영향 | 임시 / 예정 |
|---|---|---|
| `pub_almanac_*` 키 미발급 | 클라이언트 직접 호출 불가 | server-side fetch로 충분. 향후 필요 시 추가 |
| ContentItemMetric 집계 cron 미정 | today-top 점수 계산 부정확 | Phase 2 Day 10에 전용 cron 도입 |
| 본문 hotlink 차단 사이트의 이미지 | 썸네일 미표시 | (옵션) 양평 image proxy `/api/v1/t/almanac/img-proxy?url=...` 도입 검토 |
| Audit log per-tenant cardinality | 로그 폭증 | T3.4 (Phase 3) 자동 정책 |
| `/api/v1/almanac/*` alias 종료 일정 | 한시적 308 | Phase 2 완료 후 D-7 통보 → 410 Gone |
| 한국어 사이트 (요즘IT/벨로그) 셀렉터 변경 | 0건 수집 | parserConfig 갱신 절차 운영 런북에 |

---

## 12. 참고 자료 (Almanac 측 보관)

| 자료 | 위치 |
|---|---|
| **양평 → Almanac 통합 가이드** (Phase 1, 세션 62) | `docs/assets/260426-almanac-tenant-integration.md` |
| **Aggregator v1.0 spec 패키지** (코드 + 시드 + 검증) | `docs/assets/yangpyeon-aggregator-spec/` (41 파일) |
| 마스터 가이드 | `docs/assets/yangpyeon-aggregator-spec/README.md` |
| 단계별 적용 절차 | `docs/assets/yangpyeon-aggregator-spec/02-applying-the-patch.md` |
| 아키텍처 다이어그램 | `docs/assets/yangpyeon-aggregator-spec/01-overview.md` |
| Prisma 모델 (그대로 복붙) | `docs/assets/yangpyeon-aggregator-spec/code/prisma/schema-additions.prisma` |
| 크롤러 모듈 풀파일 | `docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/*` (10 파일) |
| REST 라우트 풀파일 | `docs/assets/yangpyeon-aggregator-spec/code/src/app/api/v1/almanac/*` (5 파일) |
| 관리자 UI 풀파일 | `docs/assets/yangpyeon-aggregator-spec/code/src/app/admin/aggregator/*` (12 파일) |
| 카테고리·소스 시드 | `docs/assets/yangpyeon-aggregator-spec/seeds/{categories,feed-sources}.sql` |
| 검증·운영 가이드 | `docs/assets/yangpyeon-aggregator-spec/verification/*.md` (3 파일) |
| **Almanac 클라이언트 코드** (양평이 contract 검증 시 참고) | `src/lib/almanac/yangpyeon-{client,types,adapter}.ts` |
| Almanac /explore 페이지 | `src/app/(portal)/explore/page.tsx` |
| **Almanac 키 발급·등록 절차** | `docs/handover/aggregator-key-issuance.md` |

---

## 13. 양평 측 액션 아이템 체크리스트

### Pre-Phase 2 (지금 가능)

- [ ] `docs/assets/yangpyeon-aggregator-spec/` 패키지를 양평 저장소에 복사 (또는 참조)
- [ ] spec의 5 Prisma 모델과 양평 운영 DB의 5 모델 차이점 점검 (이미 적용된 것, tenant_id 추가분)
- [ ] spec의 코드를 멀티테넌트 패턴으로 수정 검토 (각 Prisma 호출에 tenant_id, RLS aware)

### Phase 2 / T2.5 진입 시

- [ ] (Day 1) 카테고리·소스 시드 (5 + 2 MVP)
- [ ] (Day 2) RSS fetcher + dedupe + DB insert
- [ ] (Day 3) classifier + promoter
- [ ] (Day 4) **5개 REST 핸들러** — 본 문서 §3의 contract 정확히 준수
- [ ] (Day 5) cron 5개 등록 + 자동 가동
- [ ] **이 시점에 Almanac에 통보** → `NEXT_PUBLIC_AGGREGATOR_ENABLED=true`
- [ ] (Day 6+) LLM, HTML, API 어댑터 추가
- [ ] (Day 14) 출시 게이트 4개 통과

### Almanac 측 키 발급 (병행 가능)

- [ ] 양평 admin UI에서 `srv_almanac_*` 키 1개 발급
- [ ] 평문 키를 안전 채널로 Almanac 운영자에게 전달 (운영자 동일인이지만 기록상)
- [ ] Almanac이 키를 Vercel env에 등록했는지 확인 (`docs/handover/aggregator-key-issuance.md` §3)

### 출시 후 운영

- [ ] 일일 점검 — 24h 수집량 ≥ 200, 실패 소스 0
- [ ] Gemini RPD 사용률 모니터
- [ ] 신규 소스 분기 추가 (운영자 본인 큐레이션)
- [ ] 분기당 키 회전 (`docs/handover/aggregator-key-issuance.md` §7)

---

## 14. 변경 이력

- v1.0 (2026-04-27) — 초안 작성. Almanac 측 클라이언트·라우트 가동 준비 완료 시점.

---

*본 문서는 Almanac → 양평 부엌 서버 인수인계서로, 양평이 Phase 2 (T2.5) 에서 따라 구현할 contract와 우선순위를 정합니다. 모든 Almanac 측 코드는 본 contract를 가정하므로 양평 응답 shape 변경 시 Almanac도 동시 수정 필요합니다.*
