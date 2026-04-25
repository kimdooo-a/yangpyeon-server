# Yangpyeon × Almanac Content Aggregator — 구축 명세서

**대상 프로젝트**: `yangpyeon-server` (https://stylelucky4u.com)
**소비자**: `Almanac` (https://almanac-flame.vercel.app)
**작성일**: 2026-04-25
**버전**: v1.0 (초안)

---

## 무엇을 만드는가

Almanac이 "분야별로 콘텐츠를 왕창 모아 제공"하는 페이지를 가지려면, 백엔드 쪽에 **콘텐츠 어그리게이션 파이프라인**이 필요하다. 이를 yangpyeon-server에 구축한다.

핵심 책임:

1. **수집** — RSS 60+개, 한국어 사이트 HTML(GeekNews/요즘IT/네이버 D2/카카오 기술/브런치/벨로그), 외부 API(HN/Reddit/PH/ArXiv), Firecrawl 폴백
2. **정제** — URL 정규화 + sha256 dedupe, 트랙×서브카테고리 2단 분류(규칙 + Gemini Flash)
3. **저장** — `content_sources`, `content_categories`, `content_ingested_items`, `content_items`, `content_item_metrics`
4. **공개** — `/api/v1/almanac/{contents,categories,sources,today-top,items/[slug]}` REST 엔드포인트 (PUBLISHABLE API key + Rate limit)
5. **운영** — Cron으로 자동 수집·분류·승격·정리, 관리자 대시보드에서 큐레이션

Almanac 쪽은 이 REST를 server-side fetch(ISR `revalidate=300`)로 호출만 한다. 콘텐츠 데이터는 yangpyeon에 단일 저장.

---

## 왜 yangpyeon인가

- yangpyeon은 이미 Next.js 16 + Prisma + PostgreSQL + JWT/JWKS + Cron 레지스트리 + Audit log + Rate limit + API key 발급을 갖춘 BaaS형 백오피스다. 어그리게이션 인프라의 60% 이상을 그대로 재사용 가능.
- Almanac에 같은 인프라를 만들면 Vercel serverless의 Cron 빈도/실행 시간 한계 + Supabase 무료 한도와 충돌한다.
- yangpyeon은 사용자 단일 운영(PM2 + Cloudflare Tunnel)이라 **장기 실행 작업·잦은 외부 fetch가 자유롭다**.

---

## 핵심 의사결정

| 항목 | 결정 | 비고 |
|---|---|---|
| 분류 축 | 6 트랙 × 6~7 서브카테고리 ≈ 40개 | Almanac 트랙 그대로 유지 |
| 저장 위치 | yangpyeon PostgreSQL | Supabase 동기화 없음 (단일 진실 소스) |
| 노출 방식 | 전용 라우트 `/api/v1/almanac/*` | Data API 동적 CRUD 우회(보안 표면 ↓) |
| 인증 | PUBLISHABLE API key (`x-api-key` 헤더) + 익명 폴백(rate limit 강화) | ADMIN/MANAGER는 쿠키/Bearer로 별도 라우트 |
| 크롤러 실행 | yangpyeon 내부 정적 모듈(`src/lib/aggregator/`) + 전용 cron tick 라우트 | EdgeFunction(node:vm)은 외부 fetch 화이트리스트·30s 타임아웃 제약으로 부적합 |
| LLM | Gemini Flash 무료 티어 (250 RPD, 6.5초 throttle) | Almanac에서 키 이전. classify 결과 캐시로 절감 |

---

## 패키지 구조

```
docs/assets/yangpyeon-aggregator-spec/
├── README.md                      ← 이 파일 (마스터 가이드)
├── 01-overview.md                 아키텍처·데이터 흐름·의존성
├── 02-applying-the-patch.md       단계별 적용 절차 (의존성 → schema → 코드 → cron → 테스트)
├── code/                          그대로 yangpyeon 저장소에 복사할 파일들
│   ├── prisma/
│   │   ├── schema-additions.prisma        # schema.prisma 끝에 append
│   │   ├── migration-aggregator.sql       # raw SQL 마이그레이션 (옵션)
│   │   └── seed-aggregator.ts             # 카테고리 + 소스 시드 스크립트
│   ├── src/lib/aggregator/                # 크롤러·분류·LLM·승격
│   │   ├── fetchers/
│   │   │   ├── rss.ts
│   │   │   ├── html.ts                    # cheerio + parserConfig
│   │   │   ├── api.ts                     # HN/Reddit/PH/ArXiv/Firecrawl
│   │   │   └── index.ts                   # kind 디스패처
│   │   ├── dedupe.ts                      # URL 정규화 + sha256
│   │   ├── classify.ts                    # 트랙 + 서브카 키워드 매처
│   │   ├── llm.ts                         # Gemini throttle + JSON 파싱
│   │   ├── promote.ts                     # ingested → content_items
│   │   └── runner.ts                      # cron 진입점 dispatcher
│   ├── src/lib/api-guard-publishable.ts   # withApiKey 신규 가드
│   ├── src/lib/data-api/allowlist-additions.ts  # DATA_API_ALLOWLIST 추가분
│   ├── src/lib/cron/runner-additions.ts   # cron runner의 AGGREGATOR 분기
│   └── src/app/api/v1/almanac/            # 외부 노출 라우트
│       ├── contents/route.ts
│       ├── categories/route.ts
│       ├── sources/route.ts
│       ├── today-top/route.ts
│       └── items/[slug]/route.ts
│   └── src/app/admin/aggregator/          # 관리자 UI
│       ├── sources/page.tsx
│       ├── categories/page.tsx
│       ├── items/page.tsx
│       └── dashboard/page.tsx
├── seeds/
│   ├── categories.sql                     # 카테고리 마스터 ~40개
│   └── feed-sources.sql                   # RSS/HTML/API 소스 60+개
└── verification/
    ├── manual-tests.md                    # 손으로 따라가는 검증 시나리오
    ├── e2e-checklist.md                   # 출시 게이트 4개 체크리스트
    └── operations-runbook.md              # 일상 운영(장애·차단·키 회전)
```

---

## 적용 순서 요약 (자세한 절차는 `02-applying-the-patch.md`)

1. **의존성 추가** — `npm i rss-parser cheerio @google/genai zod` (zod는 이미 있음)
2. **Prisma 마이그레이션** — `prisma/schema.prisma` 끝에 `code/prisma/schema-additions.prisma` 내용 append → `npx prisma migrate dev --name add_content_aggregator`
3. **소스 코드 배치** — `code/src/lib/aggregator/*`, `code/src/app/api/v1/almanac/*`, `code/src/app/admin/aggregator/*` 를 yangpyeon 저장소의 동일 경로에 복사
4. **기존 파일에 추가**:
   - `src/lib/data-api/allowlist.ts` ← `code/src/lib/data-api/allowlist-additions.ts` 4개 엔트리 머지
   - `src/lib/cron/runner.ts` ← `code/src/lib/cron/runner-additions.ts` 의 `AGGREGATOR` 분기 추가
5. **환경변수 설정** — `.env`에 `GEMINI_API_KEY`, `FIRECRAWL_API_KEY`(옵션), `ALMANAC_ALLOWED_ORIGINS`, `AGGREGATOR_BOT_USER_AGENT`, `AGGREGATOR_LLM_DAILY_BUDGET=200` 추가
6. **시드 적용** — `npx tsx prisma/seed-aggregator.ts` 또는 `seeds/categories.sql` + `seeds/feed-sources.sql` 직접 적용
7. **API key 발급** — 관리자 대시보드에서 PUBLISHABLE 키 1개 발급, Almanac에 전달(`ALMANAC_API_KEY` 환경변수)
8. **Cron 등록** — 관리자 UI(또는 SQL)로 6개 cron job 등록(아래 표)
9. **수동 검증** — `verification/manual-tests.md` 따라 6개 cron 수동 트리거 → 데이터 흐름 확인
10. **정식 가동** — Cron enable. 24h 후 운영 대시보드에서 SLA 확인.

---

## Cron 잡 6종 (등록 시 참고)

| 이름 | schedule | kind | payload |
|---|---|---|---|
| `aggregator:rss-fetch` | `every 15m` | `AGGREGATOR` | `{"module":"rss-fetcher"}` |
| `aggregator:html-scrape` | `every 30m` | `AGGREGATOR` | `{"module":"html-scraper"}` |
| `aggregator:api-poll` | `every 20m` | `AGGREGATOR` | `{"module":"api-poller"}` |
| `aggregator:classify` | `every 5m` | `AGGREGATOR` | `{"module":"classifier","batch":50}` |
| `aggregator:promote` | `every 10m` | `AGGREGATOR` | `{"module":"promoter"}` |
| `aggregator:cleanup` | `0 3 * * *` | `SQL` | `{"sql":"DELETE FROM content_ingested_items WHERE status='duplicate' AND fetched_at < NOW() - INTERVAL '7 days'"}` |

> **주의**: `AGGREGATOR`는 `CronKind` enum에 신규 추가하는 값이다 (Prisma 마이그레이션에 포함). 기존 `SQL/FUNCTION/WEBHOOK`로 처리할 수 없는 이유: ① EdgeFunction(node:vm)은 외부 fetch 화이트리스트(api.github.com/stylelucky4u.com만)와 30초 타임아웃이라 RSS 수집 불가, ② SQL은 read-only라 INSERT 불가, ③ WEBHOOK은 외부 호출용. 따라서 yangpyeon 본 프로세스에서 직접 import해 실행하는 4번째 분기가 필요.

---

## REST 엔드포인트 5종 (Almanac이 호출)

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/v1/almanac/contents` | 콘텐츠 목록 (track/category/q/source/from/to/cursor/limit/sort) |
| GET | `/api/v1/almanac/categories` | 트랙별 서브카테고리 트리 |
| GET | `/api/v1/almanac/sources` | 활성 소스 메타 (UI 필터용) |
| GET | `/api/v1/almanac/today-top` | 트랙×카테고리별 TOP N |
| GET | `/api/v1/almanac/items/[slug]` | 단건 |

가드: `withApiKey(['PUBLISHABLE'], handler)`. 익명 호출은 IP 기반 rate limit(60/min). 인증 호출은 600/min.
응답 표준: `{success:true, data:...}` (yangpyeon 기존 `successResponse` 패턴 그대로).

---

## DB 모델 6종

`code/prisma/schema-additions.prisma` 참고. 핵심 요약:

- `ContentSource` — RSS/HTML/API/FIRECRAWL 소스 레지스트리. `parserConfig` Json에 셀렉터/헤더/페이지네이션. `id Int autoincrement`
- `ContentCategory` — `(track, slug)` unique. 트랙 하위 서브카테고리 마스터. `name` 단일 한국어 필드 + `nameEn` 옵션. `id String cuid`
- `ContentIngestedItem` — staging. `urlHash` (sha256) unique 가 dedupe 핵심. 큐레이션 필드(`qualityFlag`/`reviewedById`/`reviewedAt`/`reviewNote`) 포함. `id String cuid`
- `ContentItem` — 공개용 정제본. `slug` unique. `track`+`categoryId` 인덱스. `excerpt` 필수, `publishedAt` 필수
- `ContentItemMetric` — `(itemId, date)` 일별 카운터 (today-top 산출)
- enum 확장: `CronKind`에 `AGGREGATOR` 추가, `ContentIngestStatus`에 `promoted` 포함

### staging 상태 머신 (`ContentIngestStatus`)

```
pending → classifying → ready → promoted   (정상 흐름, ContentItem으로 승격됨)
              ↓
           rejected   (수동 거부 + qualityFlag=blocked)
pending → duplicate   (urlHash 충돌, dedupe 단계)
```

### 큐레이션 플래그 (`ContentQualityFlag`)

`auto_ok | manual_review | blocked` — staging과 ContentItem 양쪽에 동일 enum.
- staging의 qualityFlag=blocked인 항목은 promote가 픽업하지 않음 (이중 안전망)
- ContentItem.qualityFlag=blocked는 외부 API에서 응답 제외 (`/api/v1/almanac/*`의 `where: { qualityFlag: { not: 'blocked' } }`)

---

## 일정 가이드 (총 ~15 작업일, 사용자 페이스)

| 일자 | 산출물 | 검증 |
|---|---|---|
| Day 1 | Prisma 마이그레이션 + 시드 | `\dt content_*` 5개 테이블 확인 |
| Day 2 | dedupe.ts + classify.ts + llm.ts + 단위 테스트 | `vitest src/lib/aggregator` PASS |
| Day 3 | RSS fetcher + 5개 소스 등록 + 수동 1회 실행 | `content_ingested_items` 레코드 ≥ 30 |
| Day 4 | promote + cron AGGREGATOR 분기 + 5개 cron 등록 | 1시간 자동 가동 확인 |
| Day 5 | HTML fetcher + 한국 6사 셀렉터 시드 | `cheerio` parse 성공 5/6 |
| Day 6 | API fetcher (HN/Reddit/PH/ArXiv) | 각 소스 30분 내 수집 ≥ 5 |
| Day 7 | REST 5개 라우트 + withApiKey + CORS | curl 응답 5/5 |
| Day 8 | 관리자 UI 4페이지 (sources/categories/items/dashboard) | UI에서 큐레이션 가능 |
| Day 9 | 24h 안정화 + 메트릭 집계 cron | content_items ≥ 200, today-top 작동 |
| Day 10 | RSS 풀 50개 추가 + Firecrawl 폴백 | 24h 수집 ≥ 300 |
| Day 11 | Audit log 강화 + Sentry hookup + Rate limit 튜닝 | LOG 정상 |
| Day 12 | API key 발급 + Almanac 측 client 연결 | Almanac /explore에서 표시 |
| Day 13 | 부하 테스트 + p95 측정 + 캐시 헤더 | 200 동시 60s p95 < 400ms |
| Day 14 | 운영 런북 작성 + 인수인계 | docs/handover 갱신 |
| Day 15 | 1.0 출시 게이트 검증 → 가동 | 4개 게이트 OK |

---

## 출시 게이트 (4개 모두 OK 시 1.0)

1. 60+ 소스 활성, 24h 수집 ≥ 300건
2. 분류 정확도 spot-check 20건 ≥ 90%
3. yangpyeon API p95 < 250ms (캐시 hit), < 500ms (miss)
4. Almanac `/explore` LCP < 2.5s, CLS < 0.1

---

## 핵심 환경변수 (yangpyeon `.env`)

```env
# Almanac에서 이전
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash

# 옵션
FIRECRAWL_API_KEY=fc-...

# Almanac 측 호스트 (CORS)
ALMANAC_ALLOWED_ORIGINS=https://www.almanac-flame.vercel.app,https://almanac-flame.vercel.app

# 봇 식별 + 한도
AGGREGATOR_BOT_USER_AGENT=AlmanacBot/1.0 (+https://stylelucky4u.com)
AGGREGATOR_LLM_DAILY_BUDGET=200       # Gemini RPD 안전선
AGGREGATOR_MAX_ITEMS_PER_SOURCE=20    # 한 회 fetch 상한
```

> `ALMANAC_API_KEY`는 yangpyeon이 발급(PUBLISHABLE)해서 Almanac에 전달. yangpyeon 자체에는 저장 안 함.

---

## 의존성 추가

### npm (3종)

```jsonc
// package.json
{
  "dependencies": {
    "rss-parser": "^3.13.0",
    "cheerio": "^1.0.0-rc.12",
    "@google/genai": "^1.50.1"
  }
}
```

(이미 yangpyeon에 있는 `zod`, `prisma`, `next` 등은 그대로 사용)

### shadcn/ui 컴포넌트 (9종)

yangpyeon이 button/card/dialog만 갖고 있을 가능성이 높으므로 다음을 일괄 추가한다:

```bash
npx shadcn@latest add tabs table badge input select textarea checkbox switch label
```

> Button의 `asChild` 미지원 환경: 본 스펙 admin UI는 `<Link className="...">` 직접 스타일링 또는 controlled `<Dialog>` 패턴을 사용해 `asChild` 의존을 회피한다.

---

## 다음 단계

각 영역의 상세 산출물은 아래 파일을 참조:

- `01-overview.md` — 아키텍처 다이어그램·데이터 흐름·실패 시나리오
- `02-applying-the-patch.md` — 의존성 설치부터 가동까지 명령어 단위 절차
- `code/prisma/schema-additions.prisma` — 그대로 append 가능한 Prisma 모델
- `code/src/lib/aggregator/*` — 크롤러 코드 풀파일 (TypeScript, 한국어 주석)
- `code/src/app/api/v1/almanac/*` — REST 라우트 풀파일
- `code/src/app/admin/aggregator/*` — 관리자 UI 페이지 (App Router, shadcn/ui)
- `seeds/*.sql` — 카테고리·소스 시드 SQL
- `verification/*.md` — 검증·운영 가이드

---

## 변경 이력

- **v1.1** (2026-04-26) — 스펙 v1.0 적용 시도(`feat/aggregator-v1` 브랜치) 결과 81개 컴파일 에러 발견 → 백아웃 후 `spec/aggregator-fixes` 브랜치에서 일괄 정합화. 주요 변경:
  - 스키마: `ContentIngestedItem`에 큐레이션 필드(`qualityFlag`, `reviewedById`, `reviewedAt`, `reviewNote`) 추가, `ContentIngestStatus`에 `promoted` 추가
  - 필드명: `nameKo` → `name`, `thumbnailUrl` → `imageUrl`, `externalUrl` → `url`, `lastFetchAt` → `lastFetchedAt`
  - import 경로: `@prisma/client` / `@/generated/prisma` → `@/generated/prisma/client` (yangpyeon prisma-client provider 컨벤션)
  - yangpyeon 어댑터: `session.userId` → `session.sub`, `extractClientIp(req)` → `extractClientIp(req.headers)`, AuditEntry shape 정합, ApiKey.expiresAt 로직 제거 (revokedAt만 사용)
  - UI: Button/DialogTrigger/TabsTrigger의 `asChild` 의존 제거 (Link with className 또는 controlled Dialog 패턴)
  - ContentSourceKind: 소문자 `rss/html/api` → 대문자 `RSS/HTML/API/FIRECRAWL` 강제
  - admin actions: ID 타입 정정 — `ContentSource.id`는 Number 변환, `ContentIngestedItem.id`/`ContentCategory.id`는 string 시그니처
  - promote.ts: `excerpt`/`track`/`publishedAt` 필수 필드 폴백 도입, ContentItem에 없는 필드(`urlHash`, `status`, `promotedAt`) 제거
- v1.0 (2026-04-25) — 초안 작성. Almanac × yangpyeon 분리, 외부 fetch 제약 우회를 위한 `AGGREGATOR` cron kind 도입.
