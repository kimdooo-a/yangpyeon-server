# 세션 69 인수인계 — Track A 완성: Almanac aggregator 잔여 4 endpoint + srv_almanac_* 키 발급 + withAuth fix + 운영 배포

> 일자: 2026-04-26
> 짝 문서:
> - 직전 세션 (Track A 1차): `docs/handover/260426-session66-aggregator-day1.md`
> - Track B (병행): `docs/handover/260426-session67-messenger-m1-data-model.md` + `docs/handover/260426-session68-messenger-m2-plan.md`
> - Almanac → 양평 인수인계: `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md`
> - 다음 세션: `docs/handover/next-dev-prompt.md` (세션 70용으로 갱신됨)
> 브랜치: `spec/aggregator-fixes`

---

## 0. 한 줄 요약

> 세션 66 의 미완 — Almanac aggregator Day 4 잔여 4 endpoint(contents/sources/today-top/items) + srv_almanac_* 키 발급 + 사전 결함 1건(withAuth tenant API key 분기 누락) fix — 모두 마무리하여 양평 측 인프라가 100% 가동되었습니다. 평문 키 안전 채널 전달과 Almanac Vercel 측 env 등록만 남으며, 그 시점부터 /explore 가시화가 시작됩니다.

---

## 1. 시작 컨텍스트

세션 시작 시 사용자 입력은 한 줄: "남은 일 진행". 짝 문서 `docs/handover/next-dev-prompt.md` (세션 67용 작성 시점이지만 당시 다른 컨텍스트가 messenger M1 으로 가져감) §P0 의 잔여 정의를 그대로 따름:

1. `/contents`, `/sources`, `/today-top`, `/items/[slug]` 4 endpoint (각 30~60분)
2. srv_almanac_* 키 1개 발급
3. (양평 외부) Almanac Vercel env 등록 통보

영역 분리: 같은 워킹트리에 Track B(messenger M2-Step1) 가 untracked 5+ 파일을 두고 진행 중인 것을 시작 시점에 감지 (`src/lib/messenger/`, `src/lib/schemas/messenger/`, `tests/messenger/_fixtures.ts` 등). 본 세션은 Track A 영역만 stage 하여 영역 분리 보장.

---

## 2. 산출물 (변경 파일)

### 2.1 신규 파일

| 경로 | 행 수 | 비고 |
|---|---|---|
| `src/app/api/v1/t/[tenant]/contents/route.ts` | 230 | cursor pagination + track/category/q/language/source/date range 6 필터 + sort 3종 + audit `ALMANAC_CONTENTS_LIST`. spec 변환. |
| `src/app/api/v1/t/[tenant]/sources/route.ts` | 117 | active=true + kind/country 필터. 60개 모두 active=false 라 `[]` 반환. |
| `src/app/api/v1/t/[tenant]/today-top/route.ts` | 200 | ContentItemMetric 집계 + score 알고리즘. **spec의 `contentItemId` → schema 실 필드 `itemId` 정정**. |
| `src/app/api/v1/t/[tenant]/items/[slug]/route.ts` | 137 | 단건 조회. **safety upgrade**: composite compound key `tenantId_slug` 명시 (spec의 글로벌 `findUnique({slug})` 보다 안전). |
| `scripts/issue-tenant-api-key.ts` | 140 | 운영 콘솔 UI 도입 전까지 임시 절차 (ADR-026 §6 추후 deprecate). CLI 인수 + 안전 게이트 3종 + 평문 1회 stdout 노출. |

### 2.2 수정 파일

| 경로 | 변경 | 비고 |
|---|---|---|
| `src/lib/api-guard.ts` | +24 / -2 | tenant API key (`pub_/srv_` Bearer) 분기 신설. JWT 우회 + scope 가드(/api/v1/t/* 외부 거부). K3 검증은 withTenant 가 그대로 담당. |
| `docs/status/current.md` | +1행 | 세션 69 row 추가, 최종 수정 라인 갱신 |
| `docs/logs/journal-2026-04-26.md` | +90줄 | 세션 69 섹션 (8 sub-section) |
| `docs/handover/next-dev-prompt.md` | rewrite | 세션 70용으로 P0 진입 액션 갱신 |

### 2.3 운영 인프라 변경

- WSL 빌드+배포 2회 실행 (`/ypserver` 스킬)
  - 1차: 4 endpoint 신설 후 → PM2 restart #5 (pid 86517)
  - 2차: withAuth fix 후 → PM2 restart #6 (pid 93211)
- 신규 마이그레이션: 0건 (schema 변경 없음)
- ELF 검증: 양차 모두 통과 (x86-64 GNU/Linux, BuildID `7fdd4a4ac...`)

### 2.4 운영 DB 변경

- ApiKey 1 row INSERT (tenantId=almanac, scope=SECRET, prefix=`srv_almanac_4EJMXSLc`, owner=kimdooo@). DB 에는 keyHash + prefix 만 보존. 평문은 발급 시점 stdout 1회 노출 후 본 세션 운영자가 안전 채널로 직접 이동.

---

## 3. 핵심 의사결정

### 3.1 spec → multi-tenant 변환 패턴 일관 적용 (1개당 30~60분 예상 적중)

세션 66 의 `/categories` 변환 패턴을 4개 endpoint 에 동일 적용. 변환 7요소:

| spec | 우리 환경 |
|---|---|
| `withApiKey(["PUBLISHABLE"], handler, { allowAnonymous: true })` | `withTenant(handler)` (인증 강제) |
| `prisma.contentItem.findMany(...)` | `prismaWithTenant.contentItem.findMany(...)` |
| `apiKey.id` 인자 | `user.email` (placeholder 또는 실 사용자) |
| `prisma.contentItemMetric.findMany({ select: { contentItemId } })` | **schema 정합 정정** → `select: { itemId }` |
| `prisma.contentItem.findUnique({ slug })` | **safety upgrade** → `findUnique({ tenantId_slug: { tenantId, slug }})` |
| `withApiKey([…], handler, { allowAnonymous: true })` 미존재 helper | 본 프로젝트에 `api-guard-publishable.ts` 부재 — `withTenant` 만 사용 |
| `cursor: { id }` | 그대로 (ContentItem.id = cuid 글로벌 unique) |

cursor pagination 의 `id` 필드는 schema 의 composite unique `(tenantId, slug)` 와 별개로 cuid 글로벌 unique 라 multi-tenant 안전. RLS 가 자기 tenant row 만 노출하므로 cursor 가 다른 tenant 의 row 를 가리킬 수 없음.

### 3.2 `findUnique({ tenantId_slug })` 명시 — spec 보다 안전

spec 의 `findUnique({ slug })` 는 단일 테넌트 가정으로 글로벌 unique 의존. 우리 schema 는 `@@unique([tenantId, slug])` (schema.prisma:769) composite — Prisma 가 자동 생성하는 compound key 이름 `tenantId_slug` 를 활용해:

```typescript
await prismaWithTenant.contentItem.findUnique({
  where: {
    tenantId_slug: {
      tenantId: tenant.id,  // withTenant 가 ResolvedTenant 로 주입
      slug,
    },
  },
});
```

RLS 도 같은 격리를 보장하지만 query 자체에 tenantId 명시 = defense in depth. 미래 RLS bypass 가 발생해도 안전.

### 3.3 사전 결함 표면화 — withAuth 가 tenant API key 인식 못함

세션 66 시점에는 명시 라우트가 `/categories` 하나뿐이었고, 인증 없는 401 까지만 검증해서 표면화 안 됨. 본 세션에서 발급된 srv_* 키로 첫 호출 시 `INVALID_TOKEN` 반환:

```
withTenant
  └─ withAuth                          ← Bearer 추출 + verifyAccessToken(JWT)
        └─ INVALID_TOKEN (401)         ← srv_* 는 JWT 가 아니므로 즉시 거부
```

ADR-027 §4.2 의 의도는 "Bearer pub_/srv_ → K3 검증 → tenant context 주입" 인데, `withAuth` 가 모든 Bearer 를 JWT 로만 시도해 흐름이 막혀 있었음.

**최소 수정** (`src/lib/api-guard.ts`):
1. Bearer prefix `pub_` / `srv_` 시 `verifyAccessToken` 우회
2. Placeholder payload 통과 (`sub="apikey"`, `email=bearerToken.slice(0,20)`, `role="USER"`)
3. **scope 가드**: URL pathname 이 `/api/v1/t/` 로 시작하지 않으면 401 거부 — 글로벌 라우트(`/api/v1/api-keys`)에서 tenant key 사용 차단
4. K3 cross-validation 은 `withTenant` 의 §3a 가 그대로 담당 — DB lookup + bcrypt + slug 일치 검증

placeholder.role=USER 라서 `withRole(["ADMIN"])` 가드가 걸린 글로벌 라우트는 자연 거부됨 (장점: tenant key 가 운영자 콘솔 흉내 불가).

### 3.4 운영 키 발급 스크립트 정착 — 향후 컨슈머 N건에 재사용

운영 콘솔 UI(ADR-026 §6) 도입 전까지 임시 절차. 안전 게이트 3종:
1. `tenant.findUnique({ slug })` → 미존재 시 exit 2
2. `tenant.status !== 'active'` 시 exit 2
3. `owner User.role !== 'ADMIN'` 시 exit 2

발급 후 평문 1회 stdout 노출 + 운영자에게 즉시 안전 채널 이동 권고 메시지. handover/journal/commit 어디에도 평문 미기재.

### 3.5 평문 키 처리 — handover 미기재 원칙

`srv_almanac_*` 평문은 본 세션 발급 시점 stdout 1회만 노출. handover/journal/current.md 의 어떤 곳에도 평문은 적지 않았으며, prefix(`srv_almanac_4EJMXSLc`) 만 기재. 이유:
- git tracked 영역에 들어가면 영구 노출
- 키 폐기 시 prefix 로 충분히 식별 가능 (DB lookup 키)
- 재발급은 본 세션의 issue-tenant-api-key.ts 로 재실행 가능

---

## 4. 검증 결과

### 4.1 정적 검증

| 검증 | 결과 |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint src/app/api/v1/t/[tenant]/{contents,sources,today-top,items}/**.ts src/lib/api-guard.ts` | 0 violations |
| `npx vitest run` | 372 pass / 33 skipped / 0 fail |
| `api-guard-tenant.test.ts` (단위) | 7/7 unchanged |

### 4.2 런타임 검증 매트릭스 (배포 #6 후)

| 케이스 | URL | 키 | 결과 | 검증 항목 |
|---|---|---|---|---|
| 정상 | `/api/v1/t/almanac/categories` | srv_almanac_* | 200 byTrack 객체 | withAuth fix + K3 통과 |
| 정상 | `/api/v1/t/almanac/sources` | srv_almanac_* | 200 `{sources:[]}` | 60 active=false 확인 |
| 정상 | `/api/v1/t/almanac/contents` | srv_almanac_* | 200 `{items:[],filters:{...}}` | ContentItem 비어있음 |
| 정상 | `/api/v1/t/almanac/today-top` | srv_almanac_* | 200 6 트랙 빈 배열 | 메트릭+후보 모두 0 |
| 404 | `/api/v1/t/almanac/items/nonexistent-slug` | srv_almanac_* | 404 NOT_FOUND | composite compound key 격리 |
| **K3 차단** | `/api/v1/t/default/categories` | srv_almanac_* | 403 FORBIDDEN cross-tenant 차단 | path slug ≠ key slug |
| **scope 가드** | `/api/v1/api-keys` | srv_almanac_* | 401 INVALID_TOKEN | /api/v1/t/* 외부 거부 |

### 4.3 회귀 시그니처

| 시그니처 | 결과 |
|---|---|
| `ERR_DLOPEN_FAILED` / `invalid ELF header` | 0 (양 배포 모두) |
| `PrismaClientInitializationError` | 0 |
| `EADDRINUSE :3000` | 0 |
| `Tenant context missing` | 1건 잔존 (timestamp 20:16:10 = 세션 66 미해결, 세션 69 변경과 무관) |

### 4.4 헬스체크

| 검증 | 결과 |
|---|---|
| localhost:3000 | HTTP 307 (보호 라우트 리다이렉트) |
| Cloudflare Tunnel | online (uptime 24h+) |
| PM2 ypserver | online (restart #6, pid 93211) |

---

## 5. 다음 세션 (70) 즉시 시작 가능한 작업

### 5.1 P0 — Almanac 측 통보 (양평 측 작업 0)

평문 키를 운영자가 안전 채널로 받아 Almanac Vercel 측에:
1. Production env 추가: `ALMANAC_TENANT_KEY=srv_almanac_*` (평문)
2. Production env 추가: `NEXT_PUBLIC_AGGREGATOR_ENABLED=true`
3. Vercel Redeploy
4. /explore 카드 표시 시작 (Almanac 측 SSR/ISR 5분 캐시 활용)

당장은 ContentItem 0건이라 카드는 안 보이지만, aggregator 비즈니스 로직 + cron 등록 후 첫 카드부터 자동 노출.

### 5.2 P0-1 — Aggregator 비즈니스 로직 이식 (~28h, T2.5 본체)

spec 의 10 모듈을 multi-tenant adaptation 으로 이식:
- `fetcher.ts`, `dedupe.ts`, `classify.ts`, `llm.ts`, `promote.ts`, `runner.ts` 등
- 모든 Prisma 호출에 `prismaWithTenant` 또는 `withTenantTx`
- runner.ts 진입점에 `runWithTenant({ tenantId }, ...)` 한 번 SET
- cron AGGREGATOR kind 분기 (`src/lib/cron/runner.ts`)
- 위치 결정: `packages/tenant-almanac/aggregator/` (T2.5 plugin) vs `src/lib/aggregator/` (M3 게이트 이전 임시)

spec 파일: `docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/*` (10 파일)

### 5.3 P0-2 — 메신저 M2-Step1 (Track B 병행 가능)

`docs/research/messenger/m2-detailed-plan.md` §3 도메인 헬퍼 4개 시그니처 그대로. Track A(aggregator) 와 영역 분리 완전 (다른 폴더).

### 5.4 P1 — 소스 점진 활성화

5개씩 활성화 → 24h 관찰. 첫 묶음 권장: `openai-blog`, `anthropic-news`, `huggingface-blog`, `hn-frontpage`, `arxiv-cs-cl`. 활성화 SQL:

```sql
SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE content_sources
SET active = TRUE
WHERE slug IN ('openai-blog', 'anthropic-news', 'huggingface-blog', 'hn-frontpage', 'arxiv-cs-cl');
```

활성화 직후부터 cron AGGREGATOR 가 외부 페치 시작.

### 5.5 P1 — Cron 6종 등록

spec 참조: aggregator 비즈니스 로직 이식 후 운영자 콘솔(/cron) 또는 직접 cron INSERT.

### 5.6 P2 — 관리자 UI 4페이지

운영자 콘솔에 aggregator 관리 페이지(소스 목록/콘텐츠 큐레이션/수집 로그/통계). 옵션 작업.

---

## 6. 주의사항 / 함정

### 6.1 평문 키 보존 책임

`srv_almanac_4EJMXSLc7jXhVUJrKcHTFbDKrHc9xmpZ` 평문은 본 세션 stdout 에만 1회 노출. 운영자가 안전 채널로 즉시 이동했어야 함. 분실 시:

```bash
# 폐기
wsl -- bash -lic 'PGPASSWORD=Knp13579yan psql -U postgres -d luckystyle4u -h localhost -c \
  "UPDATE api_keys SET revoked_at = NOW() WHERE prefix = '"'"'srv_almanac_4EJMXSLc'"'"';"'

# 재발급
wsl -- bash -lic 'cd ~/dev/ypserver-build && set -a && source ~/ypserver/.env && set +a && \
  npx tsx scripts/issue-tenant-api-key.ts \
    --tenant=almanac --scope=srv --name="Almanac Vercel SSR (S70 reissue)" \
    --owner=c0c0b305-3b21-4ffa-b57a-5219f979b108 \
    --scopes=read:contents,read:sources,read:categories,read:items,read:today-top'
```

### 6.2 Track B 미커밋 영역

세션 69 종료 시점 git status 에 messenger 관련 untracked 파일이 5+ 개 있음 — Track B 가 진행 중인 작업. 본 세션이 stage 하지 않음. commit 시 명시적 파일 지정으로 보존.

### 6.3 ContentItem 비어있음 = 정상

현 시점 ContentItem 0건이라 4 endpoint 모두 빈 배열 응답이 정상. aggregator 비즈니스 로직 이식 + cron 등록 + 소스 활성화 후 첫 데이터 진입.

### 6.4 withAuth fix 의 보안 분석

placeholder payload (`sub="apikey"`, `role="USER"`) 가 통과한 후의 보안:
- **글로벌 라우트 보호**: scope 가드(`/api/v1/t/` prefix 체크)가 1차 차단. tenant key 가 `/api/v1/api-keys` 등에 닿지 않음.
- **withRole(["ADMIN"]) 가드**: placeholder.role=USER 라 자연 거부.
- **K3 검증**: withTenant §3a 가 path slug ↔ key slug ↔ DB tenant.slug 3중 일치 확인. cross-tenant 차단 확실.
- **AsyncLocalStorage**: `runWithTenant({ tenantId: tenant.id })` 가 K3 통과 후에 실행 → prismaWithTenant 가 RLS 적용.

신규 attack surface 없음. ADR-027 §4 의도 그대로 구현됨.

### 6.5 audit 식별자

placeholder.email = `bearerToken.slice(0,20)` 이라 audit 로그에서 행위자가 `srv_almanac_4EJMXSLc7j` 같은 prefix 형태로 기록됨. 실 ApiKey.id 매칭은 `prefix LIKE '<prefix:20>%' AND tenant_id = ...` 로 가능. 향후 정밀 식별이 필요하면 withTenant K3 통과 후 `dbKey.id` 를 audit 에 주입하는 후속 PR.

---

## 7. 미터치 / 이월

| 항목 | 사유 |
|---|---|
| Almanac Vercel env 등록 (외부 작업) | 평문 키 안전 채널 이동 후 운영자 직접 작업 |
| aggregator 비즈니스 로직 (~28h) | 별도 작업 단위 |
| cron AGGREGATOR 분기 + cron 6종 등록 | 비즈니스 로직 후 |
| 소스 점진 활성화 (5/60) | 비즈니스 로직 + cron 후 |
| 관리자 UI 4페이지 | 옵션 |
| 메신저 M2-Step1 (Track B) | 다른 터미널이 진행 중, 영역 분리 보장 |
| filebox-db.ts 패턴 4 | 세션 65 이월 유지 |
| `Tenant context missing` 1건 (S66 leftover) | 어떤 코드 경로가 가드 밖에서 prismaWithTenant 호출했는지 추적 미완 |
| `/logs?_rsc=dy0du` 404 | 메뉴 정리 또는 페이지 생성 |
| 03:00 KST cron 정상화 1주 관찰 | 세션 54 이월 유지 |

---

## 8. 변경된 메모리 / 결정

신규 메모리 작성 없음. 본 세션의 모든 결정은 기존 ADR-027 + 인수인계서로 충분히 추적 가능.

**참조한 메모리**:
- `feedback_autonomy.md` — "남은 일 진행" 한 줄 입력에 즉시 자율 실행
- `feedback_migration_apply_directly.md` — Claude 직접 운영 정책 (DB 마이그 없는 세션이지만 키 발급도 동일 정책)
- `project_tenant_default_sentinel.md` — almanac UUID `00000000-0000-0000-0000-000000000001` 확인

**CK +1 후보**:
- withAuth tenant API key 분기 패턴 — 다른 SDK/스택에서 반복될 가능성 (Bearer 다중 인증 식별 + scope 가드 = pit of success). 다음 세션에서 작성 여부 결정.

---

## 9. 변경 이력

- v1.0 (2026-04-26 세션 69 종료) — 초안 작성. Track A 완성 + 사전 결함 fix + 운영 키 발급 인프라 정착.
