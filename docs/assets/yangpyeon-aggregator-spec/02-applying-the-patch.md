# 02. Applying the Patch — 단계별 적용 절차

이 가이드는 **yangpyeon-server 저장소**에서 직접 따라 실행한다. WSL2 Ubuntu + PM2 환경 가정.

> 모든 명령은 `cd ~/yangpyeon-server` 상태에서 실행. 백업 권장: `git checkout -b feat/aggregator-v1` 먼저.

---

## Step 0. 사전 점검

```bash
# Node, npm, Prisma 상태
node --version          # 20.x 권장
npm --version           # 10.x 권장
npx prisma --version    # 5.x 또는 6.x

# Postgres 접속 확인 (psql 또는 prisma)
npx prisma db pull --print

# 현재 cron 잡 상태
psql $DATABASE_URL -c "SELECT id, name, kind, schedule, enabled, last_status FROM cron_jobs;"

# 현재 사용자 확인 (ADMIN 1명 이상 있어야 함)
psql $DATABASE_URL -c "SELECT id, email, role FROM users WHERE role='ADMIN';"
```

이상이 있으면 멈추고 운영 런북(verification/operations-runbook.md) 참조.

---

## Step 1. 의존성 추가

### 1-1. npm 패키지 (3종)

```bash
npm install rss-parser cheerio @google/genai
# 타입은 패키지에 포함 (rss-parser는 별도 @types 불필요)
npm install --save-dev @types/cheerio  # 선택
```

`package.json`이 변경되면 `npm install`로 lockfile 동기화.

### 1-2. shadcn/ui 컴포넌트 (9종)

yangpyeon `src/components/ui/`에 button/card/dialog만 있는 경우 다음을 추가한다 (이미 있는 컴포넌트는 자동 skip).

```bash
npx shadcn@latest add tabs table badge input select textarea checkbox switch label
```

> 만약 yangpyeon `Button`이 `asChild` prop를 미지원(`@base-ui/react/button` 직접 래핑)인 경우, 본 스펙은 이를 회피하는 패턴(`<Link className="...">`, controlled `<Dialog>` + 일반 `<Button onClick>`)을 이미 사용한다. 즉 yangpyeon `Button`을 그대로 쓸 수 있다.

### 1-3. Prisma 클라이언트 (이미 yangpyeon에 있음)

yangpyeon는 `prisma-client` provider를 사용하며 출력 경로는 `src/generated/prisma`다. 본 스펙의 코드는 모두 `@/generated/prisma/client`로 import한다 (전통적인 `@prisma/client` 아님 — yangpyeon 컨벤션).

---

## Step 2. Prisma 스키마 확장

### 2-1. schema-additions.prisma append

`docs/assets/yangpyeon-aggregator-spec/code/prisma/schema-additions.prisma` 내용을 yangpyeon `prisma/schema.prisma` 파일 **끝에** 그대로 append. (기존 모델 사이에 끼우지 말 것 — 충돌 위험)

```bash
cat /path/to/almanac/docs/assets/yangpyeon-aggregator-spec/code/prisma/schema-additions.prisma >> prisma/schema.prisma
```

### 2-2. CronKind enum 확장

기존 `enum CronKind` 정의를 찾아 `AGGREGATOR` 추가:

```prisma
enum CronKind {
  SQL
  FUNCTION
  WEBHOOK
  AGGREGATOR  // 추가
}
```

### 2-3. 마이그레이션 실행

```bash
npx prisma migrate dev --name add_content_aggregator
```

마이그레이션 성공 후:

```bash
psql $DATABASE_URL -c "\dt content_*"
# 5개 테이블 표시되어야 함:
#   content_sources
#   content_categories
#   content_ingested_items
#   content_items
#   content_item_metrics
```

### 2-4. Prisma 클라이언트 재생성

```bash
npx prisma generate
```

---

## Step 3. 소스 코드 배치

### 3-1. 신규 파일 그대로 복사

다음 파일들은 신규이므로 그대로 yangpyeon 저장소에 복사:

```bash
# (Almanac 프로젝트 기준 절대 경로)
SPEC_ROOT="/path/to/almanac/docs/assets/yangpyeon-aggregator-spec/code"

# 라이브러리 모듈
cp -r $SPEC_ROOT/src/lib/aggregator src/lib/

# REST 라우트
mkdir -p src/app/api/v1/almanac
cp -r $SPEC_ROOT/src/app/api/v1/almanac/* src/app/api/v1/almanac/

# 관리자 UI
mkdir -p src/app/admin/aggregator
cp -r $SPEC_ROOT/src/app/admin/aggregator/* src/app/admin/aggregator/

# 신규 가드 파일
cp $SPEC_ROOT/src/lib/api-guard-publishable.ts src/lib/
```

### 3-2. 기존 파일에 머지 (3개)

#### A. `src/lib/data-api/allowlist.ts`

`code/src/lib/data-api/allowlist-additions.ts`의 4개 엔트리를 기존 `DATA_API_ALLOWLIST` Record에 머지. 기존 User/Folder/File 엔트리는 유지하고 ContentSource/ContentCategory/ContentIngestedItem/ContentItem 추가.

#### B. `src/lib/cron/runner.ts`

기존 `dispatchCron` 함수의 if-else 체인 끝에 `AGGREGATOR` 분기 추가. `code/src/lib/cron/runner-additions.ts` 참조 — 그 파일 안에 정확한 추가 코드 블록과 위치(`if (job.kind === "WEBHOOK") { ... }` 다음, `return failure(...)` 직전)가 명시되어 있음.

import 추가:
```typescript
import { runAggregatorModule } from "@/lib/aggregator/runner";
```

#### C. `src/lib/types/supabase-clone.ts` (있다면)

`CronKindPayload` 타입에 `AGGREGATOR` 케이스 추가:
```typescript
| { kind: "AGGREGATOR"; module: "rss-fetcher" | "html-scraper" | "api-poller" | "classifier" | "promoter"; batch?: number }
```

---

## Step 4. 환경변수 설정

`.env.local` (또는 PM2 ecosystem.config.js의 env)에 추가:

```env
# Almanac × Aggregator
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash

# 선택
FIRECRAWL_API_KEY=fc-...

# CORS
ALMANAC_ALLOWED_ORIGINS=https://www.almanac-flame.vercel.app,https://almanac-flame.vercel.app

# 봇 식별
AGGREGATOR_BOT_USER_AGENT=AlmanacBot/1.0 (+https://stylelucky4u.com)
AGGREGATOR_LLM_DAILY_BUDGET=200
AGGREGATOR_MAX_ITEMS_PER_SOURCE=20
```

PM2면:
```bash
pm2 reload ecosystem.config.js --update-env
```

---

## Step 5. 시드 데이터

### 5-1. 카테고리 마스터

```bash
psql $DATABASE_URL -f /path/to/almanac/docs/assets/yangpyeon-aggregator-spec/seeds/categories.sql
```

또는 TypeScript 시드:
```bash
npx tsx /path/to/almanac/docs/assets/yangpyeon-aggregator-spec/code/prisma/seed-aggregator.ts
```

확인:
```bash
psql $DATABASE_URL -c "SELECT track, slug, name FROM content_categories ORDER BY track, sort_order;"
# ~40 row 표시되어야 함
```

### 5-2. 소스 레지스트리 시드

```bash
psql $DATABASE_URL -f /path/to/almanac/docs/assets/yangpyeon-aggregator-spec/seeds/feed-sources.sql
```

확인:
```bash
psql $DATABASE_URL -c "SELECT slug, kind, default_track, country, active FROM content_sources;"
# 60+ row, active=true 다수
```

---

## Step 6. 빌드 및 가동

```bash
npm run build
# 타입 에러 0 확인. 에러가 나면 prisma generate 후 재시도

npm run lint  # 옵션

# PM2 배포
pm2 reload yangpyeon-server  # 기존 프로세스명 사용
pm2 logs yangpyeon-server --lines 50

# 또는 dev로 1차 검증
npm run dev
```

브라우저로 https://stylelucky4u.com 접속해서 정상 가동 확인.

---

## Step 7. API key 발급

관리자 대시보드 (`/admin/aggregator/dashboard`) 또는 기존 API key 발급 페이지에서 PUBLISHABLE 키 1개 발급.

또는 SQL:
```sql
-- 본인 user_id 확인
SELECT id, email FROM users WHERE role='ADMIN' LIMIT 1;

-- 키 발급 (실제 keyHash는 yangpyeon API key 서비스 헬퍼로 생성해야 함)
-- 관리자 UI 사용 권장. SQL 직접 INSERT는 keyHash 생성 헬퍼 필요.
```

발급된 키(평문)는 발급 시 1회만 노출. 즉시 Almanac에 전달:
- Vercel 대시보드 → Almanac 프로젝트 → Settings → Environment Variables
- `ALMANAC_API_KEY=pub_xxxxxxxxxxxxxxxx` 추가 (Production/Preview 둘 다)
- `YANGPYEON_BASE_URL=https://stylelucky4u.com` 추가

---

## Step 8. Cron 등록

### 옵션 A: 관리자 UI (`/admin/cron-jobs`)

기존 cron jobs 페이지에서 6개 등록. README의 Cron 표 참조.

### 옵션 B: SQL 직접 등록

```sql
INSERT INTO cron_jobs (id, name, schedule, kind, payload, enabled, owner_id) VALUES
  (gen_random_uuid(), 'aggregator:rss-fetch',   'every 15m', 'AGGREGATOR', '{"module":"rss-fetcher"}'::jsonb, true, '<ADMIN_USER_ID>'),
  (gen_random_uuid(), 'aggregator:html-scrape', 'every 30m', 'AGGREGATOR', '{"module":"html-scraper"}'::jsonb, true, '<ADMIN_USER_ID>'),
  (gen_random_uuid(), 'aggregator:api-poll',    'every 20m', 'AGGREGATOR', '{"module":"api-poller"}'::jsonb, true, '<ADMIN_USER_ID>'),
  (gen_random_uuid(), 'aggregator:classify',    'every 5m',  'AGGREGATOR', '{"module":"classifier","batch":50}'::jsonb, true, '<ADMIN_USER_ID>'),
  (gen_random_uuid(), 'aggregator:promote',     'every 10m', 'AGGREGATOR', '{"module":"promoter"}'::jsonb, true, '<ADMIN_USER_ID>'),
  (gen_random_uuid(), 'aggregator:cleanup',     '0 3 * * *', 'SQL',
    '{"sql":"DELETE FROM content_ingested_items WHERE status=''duplicate'' AND fetched_at < NOW() - INTERVAL ''7 days''"}'::jsonb,
    true, '<ADMIN_USER_ID>');
```

`<ADMIN_USER_ID>`는 Step 0에서 확인한 ADMIN의 id로 치환.

---

## Step 9. 수동 검증 (스모크 테스트)

```bash
# 1. cron 잡 1회 수동 실행 (관리자 UI의 "지금 실행" 또는 API)
curl -X POST https://stylelucky4u.com/api/v1/cron/<CRON_ID>/run \
  -H "Authorization: Bearer <ADMIN_BEARER_TOKEN>"

# 2. 5분 후 결과 확인
psql $DATABASE_URL -c "SELECT count(*) FROM content_ingested_items;"
# > 0 이어야 함

# 3. 분류기 강제 실행 (수동)
curl -X POST https://stylelucky4u.com/api/v1/cron/<CLASSIFY_CRON_ID>/run \
  -H "Authorization: Bearer <ADMIN_BEARER_TOKEN>"

# 4. promote 강제 실행
curl -X POST https://stylelucky4u.com/api/v1/cron/<PROMOTE_CRON_ID>/run \
  -H "Authorization: Bearer <ADMIN_BEARER_TOKEN>"

# 5. 공개 API 응답 확인
curl "https://stylelucky4u.com/api/v1/almanac/contents?track=build&limit=10" \
  -H "x-api-key: <PUBLISHABLE_KEY>"
# JSON {success:true, data:{items:[...], nextCursor:...}}
```

자세한 검증 시나리오는 `verification/manual-tests.md` 참조.

---

## Step 10. Almanac 측 연결 (간략)

이 명세서는 yangpyeon 측에 집중하지만, 1.0 가동을 위해 Almanac에서 최소 1개 페이지가 yangpyeon API를 호출하는지 확인이 필요:

Almanac에 다음 파일이 있어야 함 (별도 작업으로 진행):
- `src/lib/almanac/yangpyeon-client.ts` — `listContents`, `listCategories` 등
- `src/app/(portal)/explore/page.tsx` — `/explore` 페이지
- `.env.production` — `YANGPYEON_BASE_URL`, `ALMANAC_API_KEY`

스모크 테스트:
```bash
# Almanac 로컬에서
curl http://localhost:3000/explore
# HTML에 yangpyeon에서 가져온 콘텐츠 제목 일부 포함되어야 함
```

---

## Step 11. 24시간 안정화 모니터

24시간 동안 cron 잡이 정상 가동되는지 모니터:

```bash
# 1시간마다 실행
psql $DATABASE_URL -c "
SELECT
  date_trunc('hour', fetched_at) as hour,
  count(*) as ingested,
  count(*) FILTER (WHERE status='ready') as ready,
  count(*) FILTER (WHERE status='duplicate') as dup
FROM content_ingested_items
WHERE fetched_at > NOW() - INTERVAL '24 hours'
GROUP BY 1 ORDER BY 1 DESC;
"

# 소스별 마지막 성공 시각
psql $DATABASE_URL -c "
SELECT slug, kind, default_track, last_success_at, consecutive_failures, last_error
FROM content_sources
WHERE active = true
ORDER BY last_success_at DESC NULLS LAST;
"
```

`consecutive_failures >= 5`인 소스는 자동 비활성화되어 있어야 함. 차단 사유 확인 후 `parserConfig` 수정.

---

## Step 12. 출시 게이트 통과 → 1.0

`verification/e2e-checklist.md`의 4개 게이트 OK 확인:

- [ ] 60+ 소스 활성, 24h 수집 ≥ 300건
- [ ] 분류 정확도 spot-check 20건 ≥ 90%
- [ ] yangpyeon API p95 < 250ms (캐시 hit), < 500ms (miss)
- [ ] Almanac `/explore` LCP < 2.5s, CLS < 0.1

모두 OK면 `feat/aggregator-v1` 브랜치를 main에 merge → PM2 reload → 가동 완료.

---

## 롤백 절차 (문제 발생 시)

```bash
# 1. cron 즉시 비활성화
psql $DATABASE_URL -c "UPDATE cron_jobs SET enabled=false WHERE name LIKE 'aggregator:%';"

# 2. PM2 reload
pm2 reload yangpyeon-server

# 3. 원인 파악 후 git revert
git revert <merge-commit-hash>
npm install
npx prisma migrate resolve --rolled-back <migration-name>
pm2 reload yangpyeon-server
```

데이터는 보존(content_* 테이블 그대로). 단순히 cron만 멈추면 외부 노출 라우트는 빈 응답을 내고, Almanac은 fail-open으로 폴백 표시.

---

## 잘 안 되면

- `npm run build` 타입 에러 → Step 2-4 (`prisma generate`) 재실행
- Cron 등록 후 잡 안 돔 → `psql ... SELECT * FROM cron_jobs;` 확인 + `pm2 logs`에서 `[cron]` 검색 + 서버 재시작
- 외부 fetch 4xx/5xx → 소스의 `parserConfig` JSON 확인. User-Agent 차단(403)이 흔함
- Gemini 429 → `AGGREGATOR_LLM_DAILY_BUDGET` 감소 또는 분류기 batch 축소
- Almanac에서 "data:[]" → API key 헤더 확인, CORS 확인 (server-side라 보통 CORS 무관), yangpyeon `pm2 logs` 확인

---

작업 끝나면 다음 가이드:
- `verification/manual-tests.md` — 손으로 따라가는 검증 시나리오
- `verification/operations-runbook.md` — 일상 운영(장애·차단·키 회전)
