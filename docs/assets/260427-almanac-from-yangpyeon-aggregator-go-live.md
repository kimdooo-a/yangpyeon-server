# 양평 → Almanac 인수인계 — Phase 2 / T2.5 Day 4 양평 측 인프라 GO-LIVE

> 일자: 2026-04-26 (양평 세션 69 종료)
> 짝 문서:
> - 받은 (Almanac → 양평): `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md`
> - 양평 측 인수인계: `docs/handover/260426-session66-aggregator-day1.md` (시드+/categories) + `docs/handover/260426-session69-aggregator-day2.md` (잔여 4 endpoint + 키 발급)

---

## 0. 한 줄 요약

> 양평 측 인프라가 **100% 가동** 되었습니다. `/explore` 페이지의 "껍데기(트랙·카테고리 네비게이션)"은 이미 표시 가능하며, "카드 콘텐츠"는 양평 측 aggregator 비즈니스 로직(~28h, T2.5 본체) 이식 후 자동 채워집니다. Almanac 측 추가 코드 작업은 **0줄** 입니다.

---

## 1. 가동 상태 체크리스트

| 항목 | 상태 | 비고 |
|---|---|---|
| Tenant 등록 | ✅ | `slug='almanac'`, `id='00000000-0000-0000-0000-000000000001'`, `status='active'` |
| API 키 발급 | ✅ | `srv_almanac_4EJMXSLc...` (평문 별도 안전 채널 전달 완료) |
| 5 REST 엔드포인트 | ✅ | `/categories`, `/contents`, `/sources`, `/today-top`, `/items/[slug]` |
| K3 cross-tenant 차단 | ✅ | 검증: 다른 tenant 라우트 호출 시 403 FORBIDDEN |
| Scope 가드 | ✅ | 검증: 글로벌 라우트 호출 시 401 INVALID_TOKEN |
| RLS 격리 | ✅ | 22 테이블 enable + force, `(tenant_id, slug)` composite unique |
| Cloudflare Tunnel | ✅ | uptime 24h+, online |
| PM2 ypserver | ✅ | restart #6, healthy |
| 시드 데이터 | ✅ | 37 카테고리 + 60 소스(모두 `active=FALSE` 안전 상태) |
| ContentItem 데이터 | ⏳ | 0건 — aggregator 비즈니스 로직 이식 후 |

---

## 2. 사용 가능한 엔드포인트 — 인증 + URL + 응답 명세

### 공통 인증

```http
Authorization: Bearer srv_almanac_<32-char-random>
```

(평문 키는 별도 안전 채널로 전달됨. 분실 시 양평 운영자에게 재발급 요청.)

### CORS

`ALMANAC_ALLOWED_ORIGINS` 화이트리스트에 등록된 Origin 만 통과. 등록 누락 시 양평 운영자에게 추가 요청.

### 2.1 GET `/api/v1/t/almanac/categories`

**용도**: 트랙별 카테고리 네비게이션 + 카테고리별 활성 콘텐츠 카운트.

**Query**:
- `track?: hustle|work|build|invest|learn|community` — 특정 트랙만 조회

**캐시**: `public, s-maxage=300, stale-while-revalidate=900` (5분)

**응답** (현재 ContentItem 0건이라 모든 `count=0`):

```json
{
  "success": true,
  "data": {
    "byTrack": {
      "hustle": [
        { "slug": "side-project", "name": "사이드 프로젝트", "nameEn": "Side Project",
          "icon": "Rocket", "sortOrder": 1, "description": "...", "count": 0 },
        ...
      ],
      "work": [...],
      "build": [...],
      "invest": [...],
      "learn": [...],
      "community": [...]
    }
  }
}
```

총 37 row (build 7 / 나머지 5 트랙 6).

### 2.2 GET `/api/v1/t/almanac/contents`

**용도**: `/explore` 메인 카드 피드.

**Query**:
- `track?` — 트랙 필터
- `category?` — 카테고리 슬러그 필터
- `q?` (1-120자) — 제목 부분 일치 (case-insensitive)
- `language?` (2-8자) — ISO language code
- `source?` — 소스 슬러그 필터
- `from?`, `to?` — ISO datetime 또는 `YYYY-MM-DD`
- `cursor?` (base64url) — 페이지네이션 커서
- `limit?` (1-50, default 20)
- `sort?: latest|popular|featured` (default `latest`)

**캐시**: `public, s-maxage=60, stale-while-revalidate=300` (1분)

**응답**:

```json
{
  "success": true,
  "data": {
    "items": [],
    "nextCursor": null,
    "filters": {
      "track": null, "category": null, "q": null, "language": null,
      "source": null, "from": null, "to": null, "sort": "latest"
    }
  }
}
```

**커서 페이지네이션**:
- `nextCursor` 가 `null` 이 아니면 다음 페이지 존재
- 다음 호출 시 `?cursor=<nextCursor>&limit=20` 전달
- 커서 형식: `base64url("<publishedAt.toISOString()>|<id>")` (Almanac 측에서 디코드 불필요 — opaque token)

### 2.3 GET `/api/v1/t/almanac/sources`

**용도**: 활성 소스 메타 (출처 표시 / 출처 필터 UI).

**Query**:
- `kind?: RSS|HTML|API|FIRECRAWL`
- `country?` — ISO 2자리 (대소문자 무관)

**캐시**: `public, s-maxage=3600, stale-while-revalidate=86400` (1시간)

**응답** (현재 60개 모두 `active=FALSE` 라 빈 배열):

```json
{
  "success": true,
  "data": { "sources": [] }
}
```

소스가 활성화되면 다음 형태로 채워짐:

```json
{
  "sources": [
    { "slug": "openai-blog", "name": "OpenAI Blog", "kind": "RSS",
      "country": "US", "defaultTrack": "build", "lastSuccessAt": "2026-04-27T..." },
    ...
  ]
}
```

### 2.4 GET `/api/v1/t/almanac/today-top`

**용도**: 트랙별 오늘의 TOP 10.

**Query**:
- `date?: YYYY-MM-DD` (default = today UTC)

**알고리즘**: `score_today = (0.4 * views + 0.6 * item.score) * (24h이내 ? 1.5 : 1.0)`

**캐시**: `public, s-maxage=600, stale-while-revalidate=1800` (10분)

**응답**:

```json
{
  "success": true,
  "data": {
    "date": "2026-04-26",
    "byTrack": {
      "hustle": [], "work": [], "build": [],
      "invest": [], "learn": [], "community": []
    }
  }
}
```

### 2.5 GET `/api/v1/t/almanac/items/[slug]`

**용도**: 콘텐츠 상세.

**Path**:
- `slug` — `/^[a-z0-9][a-z0-9-]*$/`, 1-200자

**캐시**: `public, s-maxage=120, stale-while-revalidate=600` (2분)

**부수효과**: `viewCount += 1` (fire-and-forget, 응답 차단 X)

**응답** (정상):

```json
{
  "success": true,
  "data": {
    "id": "...", "slug": "...", "title": "...", "excerpt": "...",
    "aiSummary": "...", "track": "build", "url": "https://...",
    "imageUrl": "https://...", "language": "en", "score": 75.0,
    "pinned": false, "featured": false, "qualityFlag": "auto_ok",
    "viewCount": 0, "publishedAt": "...", "createdAt": "...",
    "category": { "slug": "...", "name": "...", "nameEn": "...",
                  "track": "build", "icon": "..." },
    "source": { "slug": "...", "name": "...", "kind": "RSS" }
  }
}
```

**404 NOT_FOUND**: slug 미존재 OR `qualityFlag === "blocked"`.

---

## 3. 에러 응답 표준

```json
{
  "success": false,
  "error": { "code": "<UPPER_SNAKE_CASE>", "message": "<사람용 한국어>" }
}
```

| HTTP | code | 의미 |
|---|---|---|
| 400 | VALIDATION_ERROR | 쿼리 파라미터 형식 오류 |
| 400 | TENANT_MISSING | URL 에 tenant slug 누락 |
| 400 | TENANT_INVALID_SLUG | tenant slug 형식 오류 |
| 401 | UNAUTHORIZED | Authorization 헤더 없음 |
| 401 | INVALID_TOKEN | JWT 검증 실패 / API key 가 `/api/v1/t/*` 외 라우트 호출 |
| 401 | INVALID_FORMAT | API key prefix 정규식 불일치 |
| 401 | NOT_FOUND (의 401 변형) | API key prefix DB miss |
| 401 | INVALID_HASH | API key random 부분 위조 |
| 401 | REVOKED | API key 가 폐기됨 |
| 401 | INVALID_KEY | API key 무결성 위반 (운영자 감사 대상) |
| 403 | FORBIDDEN | Cross-tenant 시도 (Almanac 키로 다른 tenant 라우트 접근 시) |
| 404 | NOT_FOUND | 리소스 미존재 (slug 등) |
| 404 | TENANT_NOT_FOUND | URL tenant slug 가 DB 미등록 |
| 410 | TENANT_DISABLED | tenant `status !== 'active'` |
| 500 | INTERNAL_ERROR | 양평 측 미예상 에러 (양평 운영자 통보) |

---

## 4. Almanac 측 권장 검증 절차 (Vercel Redeploy 후)

### 4.1 양평 정상성 확인 (5 호출)

```bash
KEY="srv_almanac_<your-key>"
BASE="https://stylelucky4u.com/api/v1/t/almanac"

# 1) 카테고리 — 실 데이터 (37 row, count=0)
curl -s -H "Authorization: Bearer $KEY" "$BASE/categories" | jq '.data.byTrack | keys'
# → ["build","community","hustle","invest","learn","work"] 기대

# 2) 콘텐츠 — 빈 배열
curl -s -H "Authorization: Bearer $KEY" "$BASE/contents?limit=5" | jq '.data.items | length'
# → 0 기대

# 3) 소스 — 빈 배열 (모두 inactive)
curl -s -H "Authorization: Bearer $KEY" "$BASE/sources" | jq '.data.sources | length'
# → 0 기대

# 4) 트랙별 TOP — 모두 빈 배열
curl -s -H "Authorization: Bearer $KEY" "$BASE/today-top" | jq '.data.byTrack.build | length'
# → 0 기대

# 5) 단건 — 404
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $KEY" "$BASE/items/foo"
# → 404 기대
```

### 4.2 보안 가드 동작 확인 (2 호출, 선택)

```bash
# Cross-tenant 차단 — 다른 tenant 라우트로 같은 키 시도 → 403
curl -s -H "Authorization: Bearer $KEY" "https://stylelucky4u.com/api/v1/t/default/categories" | jq .
# → {"success":false,"error":{"code":"FORBIDDEN","message":"cross-tenant 차단"}}

# Scope 가드 — 글로벌 라우트로 tenant 키 시도 → 401
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $KEY" "https://stylelucky4u.com/api/v1/api-keys"
# → 401
```

### 4.3 Almanac /explore 동작 확인

- 트랙 메뉴 6개 (build / hustle / invest / learn / work / community) 표시
- 카테고리 chip 37개 표시 (트랙별 6~7개)
- 카드 영역: **빈 상태**가 정상 (Almanac 측 fail-open + ISR 5분 캐시 동작 검증)
- 카드 0건 시점에서 `/explore` 페이지가 깨지지 않으면 fail-open 정상

---

## 5. 양평 측 다음 마일스톤 — 카드 노출까지

| 작업 | 추정 | 상태 | 카드 노출 영향 |
|---|---|---|---|
| aggregator 비즈니스 로직 이식 (10 모듈) | ~28h | 양평 다음 세션 P0-1 | **필수** — fetcher/dedupe/classify/promote |
| cron 6종 등록 (rss-fetch / html-scrape / api-poll / classify / promote / cleanup) | ~2h | aggregator 후 | **필수** |
| 소스 점진 활성화 (5/60) | 24h 관찰 | cron 후 | **필수** — 첫 묶음: openai-blog, anthropic-news, huggingface-blog, hn-frontpage, arxiv-cs-cl |
| 첫 fetch 사이클 완료 | 1~6h | 활성화 후 | **자동** — ContentIngestedItem → ContentItem 승격 |

**ETA**: 양평 측 작업 우선순위에 따라 **3~7일 이내** 첫 카드 노출 가능 (단, 양평이 다른 트랙—메신저—과 병행 중이라 ETA 변동 가능).

소스 활성화는 5개씩 24h 관찰 후 다음 5개 — 60개 전체 활성화는 약 12일 소요. 첫 5개부터 카드는 보이기 시작.

---

## 6. Almanac 측 작업 (옵션) — 양평 카드 도착 전 준비

### 6.1 빈 상태 UI 강화 (P0)

`/explore` 가 카드 0건 일 때:
- 양평 측 수집 진행 상태 안내 ("새 콘텐츠를 수집 중입니다 — 곧 채워집니다")
- 카테고리 chip 은 표시 (count=0 이라도 네비게이션 의미는 있음)
- skeleton placeholder 또는 illustration

### 6.2 첫 카드 도착 알림 (P1, 옵션)

양평 측 첫 ContentItem promote 시점을 Almanac 측이 알고 싶다면:
- 5분 ISR 폴링으로 `/contents?limit=1` 호출하여 `items.length > 0` 감지
- 또는 양평 운영자(=본인)가 Slack/메신저로 직접 통보 (현 운영 규모상 권장)

### 6.3 viewCount 활용 (P2)

`/items/[slug]` 호출이 자동으로 `viewCount += 1` 합니다. Almanac 측 별도 ping 불필요. 단, SSR/ISR 캐시 hit 시에는 양평 viewCount 가 증가하지 않음 — 정확한 view 메트릭이 필요하면 Almanac 측에서 별도 client-side ping 추가 검토 (양평 측 metrics 엔드포인트는 미설계).

---

## 7. 통신 채널 / 변경 사항 알림

### 7.1 양평 → Almanac 알림 트리거 (양평이 알림 보내는 시점)

- aggregator 비즈니스 로직 이식 완료 → cron 등록 후 첫 활성화 직전
- 첫 5 소스 활성화 시점 (수집 트래픽 시작)
- 첫 ContentItem promote 시점 ("이제 카드가 나옵니다")
- 양평 측 장애 발생 시 (5xx 비율 급증, Cloudflare Tunnel down 등)
- API 명세 변경 시 (응답 필드 추가/제거)

### 7.2 Almanac → 양평 알림 권장 시점

- Vercel Redeploy 완료 후 §4.1 검증 결과 (이상 발견 시 즉시)
- 빈 상태 UI 변경 시 (양평 측 수집 ETA 정합 필요 시)
- 양평 응답 형식이 Almanac 측 SSR 코드와 불일치 발견 시 (필드명 / null 처리 등)

---

## 8. fail-open 재확인 — 중요

Almanac 측은 양평 응답 실패(5xx / timeout / network error) 시 빈 배열로 폴백하는 fail-open 패턴을 이미 구현했다고 받은 인수인계서(§8) 에서 명시되어 있습니다. 이 동작이 양평 측 어떤 상태(배포 중 / 일시 다운 / 점진 활성화 중) 에서도 `/explore` 를 보호합니다.

**즉 양평 측에서 이번 세션 이후로 어떤 변경/배포가 있어도 Almanac 측 페이지는 깨지지 않습니다.** 첫 카드 도착까지 인내심 갖고 기다리시면 됩니다.

---

## 9. 첨부 / 참조

### 양평 측 산출물 (Almanac 운영자 참고)

- `docs/handover/260426-session66-aggregator-day1.md` — 시드(37 카테고리 + 60 소스) + /categories endpoint
- `docs/handover/260426-session69-aggregator-day2.md` — 잔여 4 endpoint + 키 발급 + withAuth fix
- `docs/solutions/2026-04-26-withauth-tenant-api-key-bearer-routing.md` — 본 세션의 사전 결함 fix 패턴 (참고용)

### Almanac → 양평 원본 인수인계

- `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` — 본 문서의 짝 문서

---

## 10. 변경 이력

- v1.0 (2026-04-26 양평 세션 69 종료) — 초안 작성. 양평 측 인프라 GO-LIVE 보고 + Almanac 측 검증 절차 + 다음 마일스톤.
