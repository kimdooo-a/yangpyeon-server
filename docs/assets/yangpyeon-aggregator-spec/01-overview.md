# 01. Overview — 아키텍처·데이터 흐름·제약

## 1. 시스템 컨텍스트

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           외부 콘텐츠 소스                                │
│  RSS 60+ ── 공식 블로그/뉴스 (OpenAI/a16z/Cursor/HuggingFace ...)         │
│  HTML  ── 한국 6사 (GeekNews/요즘IT/네이버 D2/카카오 기술/브런치/벨로그) │
│  API   ── HN Algolia / Reddit JSON / Product Hunt GraphQL / ArXiv         │
│  FIRECRAWL ── 폴백 (RSS·셀렉터 미제공 사이트)                              │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ pull (cron tick)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  yangpyeon-server (Next.js 16 / Node.js / PM2 / Cloudflare Tunnel)        │
│                                                                           │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │ Cron Registry (registry.ts) — 매분 tick                           │   │
│   │  AGGREGATOR kind dispatcher → src/lib/aggregator/runner.ts        │   │
│   └────────────────────────────┬─────────────────────────────────────┘   │
│                                ▼                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │ src/lib/aggregator/                                              │   │
│   │   fetchers/{rss,html,api,index}.ts  ── 외부 소스 fetch            │   │
│   │   dedupe.ts                          ── URL 정규화 + sha256       │   │
│   │   classify.ts                        ── 트랙 + 서브카 키워드매처  │   │
│   │   llm.ts                             ── Gemini Flash throttle     │   │
│   │   promote.ts                         ── ingested → content_items  │   │
│   └────────────────────────────┬─────────────────────────────────────┘   │
│                                ▼                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │ Postgres (prisma)                                                │   │
│   │   content_sources ─→ content_ingested_items ─→ content_items     │   │
│   │   content_categories  content_item_metrics                        │   │
│   └────────────────────────────▲─────────────────────────────────────┘   │
│                                │                                          │
│   ┌────────────────────────────┴─────────────────────────────────────┐   │
│   │ /api/v1/almanac/{contents,categories,sources,today-top,items}    │   │
│   │ withApiKey(['PUBLISHABLE'])  +  RateLimit  +  CORS                │   │
│   └────────────────────────────┬─────────────────────────────────────┘   │
│                                                                           │
│   ┌────────────────────────────┴─────────────────────────────────────┐   │
│   │ /admin/aggregator/{sources,categories,items,dashboard}            │   │
│   │ ADMIN/MANAGER 큐레이션 + 통계                                     │   │
│   └──────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ HTTPS (server-side fetch, ISR)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Almanac (Next.js 16 / Vercel)                                            │
│   src/lib/almanac/yangpyeon-client.ts  (server-only, fail-open)           │
│   /explore                              (분야별 라이브러리 페이지)         │
│   /[track]                              (서브카 칩 + 2탭)                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 데이터 흐름 (단일 아이템 라이프사이클)

```
[1] cron tick → fetcher 호출 (kind별 dispatch)
[2] fetcher: 외부 fetch → RawItem 배열 반환
[3] dedupe: URL 정규화 → sha256 → 기존 row 비교 → 신규만 통과
[4] DB INSERT content_ingested_items (status='pending')

[5] cron tick(classifier) → status='pending' 50건 조회
[6] classify: 규칙 키워드로 트랙 + 서브카 1차 결정
[7] llm: throttle 6.5초로 Gemini Flash 호출 → JSON {track, subcategory, summary, tags, language}
[8] DB UPDATE content_ingested_items (status='ready')

[9] cron tick(promoter) → status='ready' 조회
[10] promote: slug 생성 → content_items UPSERT
[11] DB INSERT content_items (qualityFlag='auto_ok')

[12] Almanac이 /api/v1/almanac/contents 호출
[13] DB SELECT content_items WHERE filters → JSON 반환
[14] Almanac 어댑터 → /explore 렌더
```

품질 플래그가 `manual_review`면 관리자 UI에서 검토. `blocked`은 응답 제외.

---

## 3. 의존성

### npm 패키지
- `rss-parser ^3.13` — RSS XML 파싱
- `cheerio ^1.0` — HTML 셀렉터
- `@google/genai ^1.50` — Gemini Flash
- `zod` (이미 있음)
- `@prisma/client` (이미 있음)

### 환경변수
README의 환경변수 섹션 참조.

### yangpyeon 내부 (그대로 재사용)
- `@/lib/prisma` — Prisma client
- `@/lib/api-guard` — `withAuth`, `withRole`
- `@/lib/api-response` — `successResponse`, `errorResponse`, `paginatedResponse`
- `@/lib/audit-log` — `writeAuditLog`, `extractClientIp`
- `@/lib/cron/registry` — `ensureStarted`, `runNow`
- `@/lib/cron/runner` — `dispatchCron` (여기에 `AGGREGATOR` 분기 추가)
- 기존 `RateLimitBucket` 모델 + bucket 헬퍼

---

## 4. 외부 fetch 제약 처리

yangpyeon EdgeFunction(node:vm)은 외부 fetch가 **`api.github.com`/`stylelucky4u.com`만** 허용된다 (`src/app/api/v1/functions/[id]/run/route.ts:15`). 이는 의도된 보안 잠금이다.

크롤링은 EdgeFunction이 아닌 **yangpyeon 본 프로세스에서 정적 import**한 `src/lib/aggregator/runner.ts`가 직접 Node fetch로 수행한다. 이 경로는 화이트리스트가 없다(애초에 적용되지 않음). 따라서:

- **새 cron kind `AGGREGATOR`** 추가 (Prisma enum 확장 + dispatchCron 분기)
- runner.ts에서 `module` payload 키로 분기 (`rss-fetcher`, `html-scraper`, `api-poller`, `classifier`, `promoter`)

EdgeFunction을 안 쓰는 부수 이점: 30초 타임아웃 제한 회피 (RSS 60개 fetch는 1분+ 걸릴 수 있음).

---

## 5. 보안 표면

| 표면 | 위협 | 대응 |
|---|---|---|
| `/api/v1/almanac/*` 외부 노출 | 무인증 abuse | PUBLISHABLE API key 옵션 + 익명 IP rate limit 60/min |
| Cross-origin 요청 | 토큰 탈취·CSRF | server-side fetch 위주 → CORS는 ALLOWED_ORIGINS 화이트리스트 fallback |
| 외부 fetch (크롤링) | SSRF | RFC1918·loopback 호스트 금지(allowlist 명시), Content-Length 상한, redirect 제한 |
| HTML 파싱 | XSS 저장 | 본문은 textContent만 저장. HTML 본문은 절대 그대로 저장 안 함 |
| 검색 쿼리 | SQL injection | Prisma ORM. raw SQL 절대 안 씀 |
| `parserConfig` JSON | 셀렉터 주입 | ADMIN만 편집. cheerio는 셀렉터 안전 |
| Gemini API 키 | 누출 | server only, .env, never client. 키 회전 절차 운영 런북 참조 |

---

## 6. 실패 시나리오와 폴백

| 실패 | 영향 | 대응 |
|---|---|---|
| 외부 소스 200 외 응답 | 해당 소스 1회 스킵 | `consecutiveFailures++`. ≥5면 자동 비활성. `lastError` 기록 |
| Gemini 한도 초과 | 분류 지연 | LLM 스킵, 규칙 기반 결과만 사용. 다음 cron tick에 재시도 |
| Cloudflare Tunnel 단절 | Almanac fetch 실패 | Almanac 클라이언트 fail-open(빈 배열) + "동기화 중" 폴백 표시 |
| Postgres 연결 실패 | cron 전체 실패 | retry 1회 후 audit log "FAILURE" 기록. 다음 tick에서 자동 복구 |
| HTML 셀렉터 변경 (사이트 리뉴얼) | 0건 수집 | 24h 0건이면 자동 알림 → 관리자가 `parserConfig` 수정 |
| 중복 URL 폭주 | DB write 폭증 | `urlHash` unique constraint가 INSERT 단계에서 차단. 잘 작동 |
| 본문 hotlink 이미지 차단 | 썸네일 미표시 | yangpyeon 이미지 프록시(옵션) 또는 favicon 폴백 |

---

## 7. 성능 목표

- **수집 throughput**: cron tick 5분 단위로 ≥ 100 신규 / 시간 (정상 운영시)
- **분류 throughput**: Gemini RPD 200 한도 내, 미분류 큐 ≤ 100 유지
- **API p95**: 캐시 hit 250ms, miss 500ms (서울 리전 측정)
- **DB 크기**: 6개월간 약 50GB (180일 보존, 일일 5,000 row × 평균 10KB)

---

## 8. 미래 확장 여지 (이번 범위 밖)

- 검색 인덱싱 (Postgres tsvector → pg_trgm 또는 외부 Meilisearch)
- 추천 엔진 (사용자 행동 collaborative filtering)
- 임베딩 기반 유사도 (OpenAI text-embedding-3-small 또는 Gemini embedding)
- 댓글·반응 어그리게이션 (Almanac engagement layer 확장)
- 다국어 자동 번역 (Gemini)
- 일일 뉴스레터 자동 발송

이 명세서는 위 항목을 명시적으로 제외한다. 1.0은 "수집·분류·노출"에 집중.
