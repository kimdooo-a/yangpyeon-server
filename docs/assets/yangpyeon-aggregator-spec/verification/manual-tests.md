# Manual Tests — 콘텐츠 어그리게이터 가동 검증

> **목적**: 신규 환경(스테이징/프로덕션 첫 배포)에서 어그리게이터가 정상 동작하는지 손으로 따라가며 확인합니다.
> 각 단계는 **명령어 / 예상 결과 / 실패 시 확인할 곳** 순서로 구성됩니다.
> 약 30~40분 소요.

## 0. 사전 조건

- [ ] yangpyeon `npm run build` 성공
- [ ] Prisma 마이그레이션 적용됨
  ```bash
  npx prisma migrate deploy
  psql "$DATABASE_URL" -c "\dt content_*"
  # → content_categories, content_ingested_items, content_sources,
  #   content_source_runs, content_publish_log 5개 보여야 함
  ```
- [ ] 시드 적용됨
  ```bash
  npm run seed:aggregator
  psql "$DATABASE_URL" -c "SELECT count(*) FROM content_categories;"   # ≥ 40
  psql "$DATABASE_URL" -c "SELECT count(*) FROM content_sources;"      # ≥ 60
  ```
- [ ] 환경 변수 (`.env.local` 또는 Vercel)
  - `DATABASE_URL`
  - `GEMINI_API_KEY` (분류용)
  - `AGGREGATOR_FETCH_INTERVAL_MIN=10` (cron 주기)
  - `AGGREGATOR_USER_AGENT="AlmanacBot/1.0 (+https://almanac-flame.vercel.app)"`
- [ ] 관리자 계정 로그인됨 (`/admin/aggregator/dashboard` 접근 가능)

---

## 1. 단일 RSS 소스 수동 fetch

대표적인 RSS 소스 1개 (예: `slug='ai-times-feed'`)를 강제 수집합니다.

```sql
-- last_fetch_at을 NULL로 만들면 다음 cron tick에 우선 처리됩니다.
UPDATE content_sources
SET last_fetch_at = NULL, last_error = NULL
WHERE slug = 'ai-times-feed';
```

또는 관리자 UI: `/admin/aggregator/sources` → 해당 행의 **"지금 fetch"** 클릭.

**예상 결과**

```sql
SELECT count(*) FROM content_ingested_items
WHERE source_id = (SELECT id FROM content_sources WHERE slug='ai-times-feed')
  AND fetched_at > NOW() - INTERVAL '15 minutes';
-- ≥ 5 (RSS 피드 평균 5~30 항목)

SELECT status, count(*) FROM content_ingested_items
WHERE source_id = (SELECT id FROM content_sources WHERE slug='ai-times-feed')
GROUP BY status;
-- pending: ≥ 5 (분류기가 아직 안 돈 상태)
```

**실패 시 확인할 곳**
- `content_sources.last_error` 컬럼: 실제 에러 메시지
- pm2 로그: `pm2 logs aggregator-fetcher --lines 200`
- 외부 차단 가능성: User-Agent 변경 후 재시도

---

## 2. HTML 셀렉터 소스 수동 fetch

`kind='html'` 소스 1개 (예: `slug='openai-blog'`).

```sql
UPDATE content_sources SET last_fetch_at = NULL WHERE slug = 'openai-blog';
```

**예상 결과**
- ≥ 3건의 신규 ingested_items
- `parser_config` 의 `selector`로 추출된 `title`, `summary`, `url`이 채워짐

**실패 시**
- HTML 구조 변경 → `parserConfig` JSON 재조정
- robots.txt 차단 → 소스 비활성화

---

## 3. 외부 API 소스 수동 fetch

`kind='api'` 소스 (예: HackerNews API, Reddit JSON).

```sql
UPDATE content_sources SET last_fetch_at = NULL WHERE slug = 'hackernews-top';
```

**예상 결과**
- API 응답 파싱 → ingested_items 생성
- rate limit 헤더 로그 확인 (`X-RateLimit-Remaining`)

**실패 시**
- 401/403: API 키 만료. `parser_config.headers`에 새 키 등록
- 429: cron 주기 늘리기 (`AGGREGATOR_FETCH_INTERVAL_MIN`)

---

## 4. 분류기(classifier) 수동 실행

`status='pending'` 항목들에 대해 트랙·카테고리 분류 워커를 실행합니다.

```bash
# 일회성 워커 실행 (개발 환경)
npm run aggregator:classify -- --limit=50

# 또는 cron이 다음 tick에 자동 처리
```

**예상 결과**
```sql
SELECT status, count(*) FROM content_ingested_items
WHERE fetched_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
-- pending: 0 또는 매우 적음
-- ready:   ≥ 5
-- rejected: 약간 (분류 신뢰도 < 0.4 또는 키워드 미매칭)
```

```sql
-- 분류 결과 분포
SELECT track, count(*) FROM content_ingested_items
WHERE classified_at > NOW() - INTERVAL '1 hour'
GROUP BY track;
```

**실패 시**
- Gemini API 한도 초과 → audit 로그에서 `GEMINI_QUOTA_EXCEEDED` 검색
- 키워드 룰 누락 → `lib/aggregator/classifier-rules.ts` 보강

---

## 5. promote → published 전환

`status='ready'` 항목을 게시 상태로 승격합니다.

```bash
npm run aggregator:promote -- --limit=20
```

또는 관리자 UI에서 개별 승격: `/admin/aggregator/items?tab=pending` → "승격" 버튼.

**예상 결과**
```sql
SELECT count(*) FROM content_ingested_items
WHERE status='published' AND published_at > NOW() - INTERVAL '1 hour';
-- ≥ 20
```

`content_publish_log` 테이블에 같은 수의 행이 추가되어야 함.

---

## 6. REST `/api/v1/contents` 검증

```bash
curl -s "https://almanac-flame.vercel.app/api/v1/contents?track=ai-money&limit=10" | jq '.items | length'
# → 10
curl -s "https://almanac-flame.vercel.app/api/v1/contents?track=ai-money&limit=10" \
  | jq '.items[0] | {title, track, category, publishedAt, externalUrl}'
```

**예상 결과**
- HTTP 200
- `items` 배열, 각 항목에 `title`, `track`, `category`, `publishedAt`, `externalUrl`, `thumbnailUrl?`
- 응답 헤더: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`

**실패 시**
- 500: Vercel logs에서 stack trace
- 빈 배열: 위 1~5 단계가 끝나지 않음

---

## 7. REST `/api/v1/categories` 검증

```bash
curl -s "https://almanac-flame.vercel.app/api/v1/categories?track=automation" | jq
```

**예상 결과**
- 카테고리 배열, 각 항목에 `slug`, `nameKo`, `nameEn`, `count`
- 빈 카테고리도 포함되는지(또는 `count > 0`만 반환되는지)는 ADR 결정 따름

---

## 8. REST `/api/v1/today-top` 검증

```bash
curl -s "https://almanac-flame.vercel.app/api/v1/today-top?limit=5" | jq '.items | length'
# → 5
```

**예상 결과**
- 최근 24시간 게시된 콘텐츠 중 상위 N건
- 정렬 기준: 발행 최신순 + (선택) 내부 popularity 점수

---

## 9. CORS 테스트 (Almanac 도메인에서 호출)

브라우저 콘솔에서:

```js
fetch("https://almanac-flame.vercel.app/api/v1/contents?limit=1")
  .then(r => r.json()).then(console.log);
```

**예상 결과**
- HTTP 200, `Access-Control-Allow-Origin` 헤더 포함
- 허용되지 않은 origin (예: `https://example.com`)에서는 차단

---

## 10. Rate limit 테스트

```bash
# 익명 — 60 req/min 가정
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://almanac-flame.vercel.app/api/v1/contents?limit=1"
done | sort | uniq -c
# → 200: ~60, 429: ~10
```

```bash
# API 키 — 600 req/min 가정
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "X-Api-Key: $ALMANAC_PUB_KEY" \
    "https://almanac-flame.vercel.app/api/v1/contents?limit=1"
done | sort | uniq -c
# → 200: 100
```

**예상 결과**
- 익명 호출은 일정 횟수 후 429 응답
- API 키 호출은 한도까지 200

**실패 시**
- 항상 200: rate limit 미들웨어 미장착
- 항상 429: 한도 설정 너무 낮음 (`API_RATE_LIMIT_PER_MIN`)

---

## 검증 완료 체크

10개 단계 모두 통과하면:

```bash
# 검증 통과 마킹 (선택)
echo "$(date -Iseconds) — manual-tests passed by $(whoami)" \
  >> docs/assets/yangpyeon-aggregator-spec/verification/_RUN_LOG.md
```

**다음 단계**: `e2e-checklist.md` 의 Gate 1~4 게이트 통과 측정 → `operations-runbook.md` 의 일상 점검 절차 시행.
