# 세션 66 인수인계 — Phase 2 / T2.5 Day 1 시동: Almanac aggregator 시드 + 첫 핸들러 + 운영 배포

> 일자: 2026-04-26
> 짝 문서:
> - 받은 인수인계: `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` (Almanac → 양평)
> - 보낸 인수인계: `docs/handover/260426-almanac-tenant-integration.md` (세션 62)
> - 직전 세션: `docs/handover/260426-session65-deploy-filebox-standalone.md`
> - 다음 세션: `docs/handover/next-dev-prompt.md` (세션 67용으로 갱신됨)
> 브랜치: `spec/aggregator-fixes`

---

## 0. 한 줄 요약

> Almanac 측 인수인계서를 받아 Phase 2 / T2.5 Day 1 (시드 적용 + 5개 endpoint 중 1개 핸들러 + 운영 배포)을 마쳤습니다. Almanac /explore 가시화의 전제 데이터 + 라우팅 인프라가 가동되었고, 잔여 4 endpoint + API 키 발급은 세션 67로 이월합니다.

---

## 1. 시작 컨텍스트

세션 시작 시점 사용자 입력은 단순 파일 경로 1줄: `docs/assets/260427-yangpyeon-phase2-aggregator-handover.md`. 인수인계서를 읽고 단계별 권장안 후, 사용자 "순서대로 진행해줘" 한 마디로 자율 실행 시작.

**받은 인수인계서의 양평 측 잔존 작업** (§1.2):
1. 5 REST 핸들러 (`/contents`, `/categories`, `/sources`, `/today-top`, `/items/[slug]`)
2. Aggregator 비즈니스 로직 (fetcher / dedupe / classify / llm / promote / cron 분기)
3. 시드 (37 카테고리 + 60 소스)
4. Cron 6종 등록
5. (옵션) 관리자 UI 4페이지

세션 66은 **시드 + 첫 핸들러(/categories)** 만 처리.

---

## 2. 산출물 (변경 파일)

### 2.1 신규 파일

| 경로 | 행 수 | 비고 |
|---|---|---|
| `docs/assets/yangpyeon-aggregator-spec/` (42 파일) | — | 워크트리(`agent-a91a67dda0a0efc63`)에서 메인 저장소로 복원. spec 패키지 전체 (README + 3 가이드 + 10 aggregator 모듈 + 5 route + 12 admin UI + prisma + 2 seed + 3 verification). |
| `prisma/seeds/almanac-aggregator-categories.sql` | 89 | spec seed 변환본. BEGIN/SET LOCAL/COMMIT 래퍼 + ON CONFLICT (tenant_id, slug). 37 row INSERT. |
| `prisma/seeds/almanac-aggregator-sources.sql` | 181 | 동일 래퍼 + 모든 active TRUE → FALSE 강제 + ON CONFLICT (tenant_id, slug). 60 row INSERT. |
| `src/app/api/v1/t/[tenant]/categories/route.ts` | 142 | 첫 명시 tenant 라우트. withTenant + prismaWithTenant.contentCategory.findMany/groupBy. byTrack 객체 응답. |

### 2.2 운영 DB 변경 (적용 완료)

```sql
-- almanac tenant_id = '00000000-0000-0000-0000-000000000001'
INSERT INTO content_categories ... (37 rows)
INSERT INTO content_sources ... (60 rows, all active=FALSE)
```

검증:
```
track     | cats         kind      | count       active | count
----------+------       -----------+------       -------+------
build     |    7        RSS       |    46       f      |   60
community |    6        HTML      |     3
hustle    |    6        API       |     7       FK 무결성
invest    |    6        FIRECRAWL |     4       60/60 default_category_id 매칭
learn     |    6
work      |    6
```

### 2.3 운영 인프라 변경

- WSL 빌드+배포 1회 (`/ypserver` 스킬). PM2 ypserver restart #4 (pid 81099). ELF 검증 통과.
- 신규 마이그레이션 0건 (schema 변경 0 — T1.6에서 이미 적용됨).

---

## 3. 핵심 의사결정

### 3.1 spec 패키지를 그대로 복붙하지 않은 이유

받은 spec은 **단일 테넌트 baseline** (T1.6 이전 작성). 다음 3 차이가 있어 핸들러 코드는 신규 작성:

| spec | 우리 환경 |
|---|---|
| `withApiKey(["PUBLISHABLE"], ..., { allowAnonymous: true })` | `withTenant(...)` (인증 강제) |
| `prisma.contentCategory.findMany(...)` | `prismaWithTenant.contentCategory.findMany(...)` |
| `/api/v1/almanac/categories/route.ts` | `/api/v1/t/[tenant]/categories/route.ts` (ADR-027 §2.2 명시 라우트 우선) |
| schema-additions.prisma (37 row, tenant_id 없음) | schema.prisma 이미 (tenantId, slug) composite unique |

spec의 시드 SQL은 본문 변경 최소화 (BEGIN/SET LOCAL 래퍼 + ON CONFLICT 컬럼만 수정 + 소스 active 강제).

### 3.2 소스 60개 모두 `active=FALSE` 강제

cron이 자동 가동되면 외부 60개 사이트에 즉시 fetch 트래픽이 시작됩니다. 운영자(=본인)가 점진 활성화할 때까지 inactive 유지. 활성화 절차:

```sql
UPDATE content_sources
SET active = TRUE
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND slug IN ('openai-blog', 'anthropic-news', 'huggingface-blog', 'hn-frontpage', 'arxiv-cs-cl');
```

### 3.3 `/contents` 가 아닌 `/categories` 부터 작성한 이유

받은 인수인계 §6 Week 1 일정은 Day 1~5 중 Day 4에 핸들러를 만들도록 안내. 하지만:
- `/categories` 는 contract 가 가장 단순 (byTrack 객체 1건, 시드만 있으면 동작)
- `/contents` 는 cursor 페이지네이션 + 다중 필터 (track/category/q/source) + ContentItem JOIN 이라 시드만으로는 빈 응답
- ContentItem 자체가 비어 있으니 (`content_items` 카운트 0) `/categories` 가 가장 빨리 의미있는 응답을 만듦

세션 67에서 contents/sources 추가 후 첫 카드가 표시될 가능성 높아짐.

---

## 4. 검증 결과

### 4.1 라우트 매칭 검증

```bash
curl -i http://localhost:3000/api/v1/t/almanac/categories
# → HTTP/1.1 401 UNAUTHORIZED
# → {"success":false,"error":{"code":"UNAUTHORIZED","message":"인증 토큰이 필요합니다"}}
```

**핵심 신호**: 401 UNAUTHORIZED 가 떨어지면 = 명시 라우트(`src/app/api/v1/t/[tenant]/categories/route.ts`)가 catch-all (`[...path]/route.ts`)보다 먼저 매칭됨 = ADR-027 §2.2 의 "Phase 2+ 부터 명시 라우트가 catch-all 흡수 범위를 줄인다" 동작 검증.

만약 404 `ROUTE_NOT_FOUND` 였다면 catch-all 의 dispatchTenantRoute (HANDLER_TABLE 빈 객체) 가 매칭된 것 = 명시 라우트가 빌드되지 않은 회귀 신호.

### 4.2 회귀 시그니처

PM2 로그 점검 (`pm2 logs ypserver --lines 30 --nostream`):
- ✅ `ERR_DLOPEN_FAILED` / `invalid ELF header` — 0 건
- ✅ `PrismaClientInitializationError` — 0 건
- ✅ `EADDRINUSE` — 0 건
- ⚠ `Tenant context missing` 1건 (timestamp 20:16:10) — **배포 전 인스턴스 잔재**, 새 부팅(20:21:17) 이후 발생 0. 우리 변경과 무관 (자세한 추적 → 세션 67 이월).

### 4.3 헬스체크

| 검증 | 결과 |
|---|---|
| localhost:3000 헬스 | HTTP 307 (프로텍트 라우트 리다이렉트) |
| `/api/v1/t/almanac/categories` 인증 없이 | 401 UNAUTHORIZED |
| `/api/v1/t/almanac/categories` 잘못된 키 | 401 INVALID_TOKEN (JWT 파싱 단계 거부) |
| `/api/v1/t/almanac/nonexistent-resource` 잘못된 키 | 401 (catch-all + withAuth) |
| Cloudflare Tunnel | online (uptime 23h) |

---

## 5. 다음 세션 (67) 즉시 시작 가능한 작업

### 5.1 P0 — 잔여 4 endpoint 완성

| Endpoint | spec 참조 | 난이도 | 핵심 |
|---|---|---|---|
| `/contents` | `docs/assets/yangpyeon-aggregator-spec/code/src/app/api/v1/almanac/contents/route.ts` | 중 | cursor 페이지네이션 + track/category/q/source 필터 + ContentItem JOIN |
| `/sources` | 동일 폴더 | 하 | active=true 만 (운영 활성화 후), country 그룹 |
| `/today-top` | 동일 폴더 | 중 | ContentItemMetric 집계 + score 알고리즘 |
| `/items/[slug]` | 동일 폴더 | 하 | 단건 조회. `qualityFlag='blocked'` → 404 |

각각 `/categories` 와 동일 변환 패턴 (withTenant + prismaWithTenant). 1개당 30~60분 예상.

### 5.2 P0 — API 키 발급

운영자 콘솔(`/api/v1/api-keys` route handler) 또는 직접 SQL 로 `srv_almanac_*` 발급 → 핸들러 정상 응답 검증 → Almanac Vercel `ALMANAC_TENANT_KEY` 환경변수 등록 → `NEXT_PUBLIC_AGGREGATOR_ENABLED=true` 설정.

발급 절차 참고: `docs/handover/260426-almanac-tenant-integration.md` (현재 키 발급 핸드오버 별도 파일은 미작성 — 세션 67에서 신설 권장: `docs/handover/aggregator-key-issuance.md`).

### 5.3 P1 — Aggregator 비즈니스 로직 (~28h)

`packages/tenant-almanac/aggregator/*` 또는 `src/lib/aggregator/*` 에 spec의 10 모듈을 multi-tenant adaptation 으로 이식:
- 모든 Prisma 호출에 `prismaWithTenant` 또는 `withTenantTx`
- runner.ts 진입점에 `runWithTenant({ tenantId }, ...)` 한 번 SET
- cron AGGREGATOR kind 분기 (src/lib/cron/runner.ts)

### 5.4 P1 — Cron 6종 등록

운영자 콘솔(/cron)에서 또는 직접 cron INSERT.

### 5.5 P2 — 소스 점진 활성화

5개씩 활성화 → 24h 관찰 → 다음 5개. 첫 묶음 권장: `openai-blog`, `anthropic-news`, `huggingface-blog`, `hn-frontpage`, `arxiv-cs-cl`.

---

## 6. 주의사항 / 함정

### 6.1 spec 패키지 git 상태

`git status` 에서 `docs/assets/yangpyeon-aggregator-spec/*` 42 파일이 모두 modified (M)로 표시됩니다. 이유:
- 워크트리에서 commit 됐지만 메인 working tree 에는 없던 상태 (deleted 표시)
- 이번 세션 cp 로 복원 → modified 표시
- 실제 내용은 그대로

세션 67에서 commit 시 한 번에 정리.

### 6.2 시드 재실행 안전성

`ON CONFLICT (tenant_id, slug) DO NOTHING` 라 멱등합니다. 같은 tenant_id 로 재실행 → 0 row INSERT. 다른 tenant_id (예: 미래의 두 번째 컨슈머)로는 SET LOCAL 변경 후 동일 SQL 재실행 가능.

### 6.3 운영 DB role 분리는 아직 미적용

DATABASE_URL 은 postgres superuser. RLS 가 BYPASSRLS 로 우회됨. `prismaWithTenant` 의 `SET LOCAL app.tenant_id` 는 dbgenerated default 발동용으로만 작동 중 — 격리 자체는 어플리케이션 수준에서 강제 (where 절 + Prisma extension). 진정한 RLS 격리는 N>1 컨슈머 진입 시 app_runtime role 분리와 함께 활성화.

### 6.4 Almanac fail-open 동작

Almanac 측은 fail-open 이라 양평이 어떤 상태든 페이지가 안 깨집니다 (`docs/assets/260427-yangpyeon-phase2-aggregator-handover.md` §8). 즉 세션 67에서 추가 핸들러 작성 + 빌드 실패 + 롤백 모두 외부 영향 0.

---

## 7. 미터치 / 이월

| 항목 | 사유 |
|---|---|
| 잔여 4 endpoint (contents/sources/today-top/items) | 우선순위 + 시간 |
| API 키 발급 (srv_almanac_*) | 키 발급 인프라 검증 + 안전 채널 전달 절차 미정 |
| aggregator 비즈니스 로직 (~28h) | 별도 작업 단위 |
| cron AGGREGATOR 분기 + cron 6종 등록 | 핸들러 완성 후 |
| 관리자 UI 4페이지 | 옵션 |
| sticky-notes / messenger untracked 통합 | 세션 65 이월 유지 |
| filebox-db.ts 패턴 4 | 세션 65 이월 유지 |
| 메신저 Phase 1 M1 | 세션 64 이월 유지 |

---

## 8. 변경된 메모리 / 결정

신규 메모리 작성 없음 (이번 세션의 모든 결정은 기존 메모리 + ADR + 인수인계서로 충분히 추적 가능).

**참조한 메모리**:
- `feedback_autonomy.md` — 분기 질문 금지, 권장안 즉시 채택
- `feedback_migration_apply_directly.md` — Claude 직접 마이그레이션 적용 (시드도 동일 정책 적용)
- `project_tenant_default_sentinel.md` — almanac UUID 확인용
- `project_standalone_reversal.md` — 빌드 파이프라인 이해

---

## 9. 변경 이력

- v1.0 (2026-04-26 세션 66 종료) — 초안 작성. 잔여 작업 명확히 분류.
