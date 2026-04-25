# 인수인계서 — 세션 57 (yangpyeon-aggregator-spec v1.0 → v1.1 정합화)

> 작성일: 2026-04-26
> 이전 세션: [session56](./260425-session56-audit-fail-soft-migration-self-heal.md)

---

## 작업 요약

`docs/assets/yangpyeon-aggregator-spec/` v1.0 초안(2026-04-25 작성) 검토 요청에서 출발 — P0 1건 발견 → Approach B(`feat/aggregator-v1`) 적용 시 81개 컴파일 에러 노출 → 백아웃 후 `spec/aggregator-fixes` 브랜치에서 18개 파일 일괄 정합화 → tsc 셋업 외 0 에러 검증. Almanac × yangpyeon 콘텐츠 어그리게이터의 외부 spec을 yangpyeon 환경에서 즉시 적용 가능한 v1.1로 끌어올림.

## 대화 다이제스트

### 토픽 1: 자산 검토 요청
> **사용자**: "E:\00_develop\260406_luckystyle4u_server\docs\assets\yangpyeon-aggregator-s ... 확인해봐."

`docs/assets/yangpyeon-aggregator-spec/` 디렉토리 전수 정독 — README + 01-overview + 02-applying-the-patch + code/(prisma/, src/) + seeds/ + verification/. 작성 일자 2026-04-25, v1.0 초안. Almanac (`almanac-flame.vercel.app`) 의 `/explore` 페이지에 콘텐츠를 공급할 어그리게이션 파이프라인 풀 패치 (스키마 6 모델 + 코드 ~45KB TS + 시드 SQL + 검증 가이드).

**P0 결함 발견**: `suggestedCategoryId` (스키마 line 145) vs `suggestedCategorySlug` (코드 runner.ts/promote.ts/llm.ts/types.ts 6곳). promote.ts의 `categoryIdBySlug.get(item.suggestedCategorySlug)` 패턴이 결정적 — staging은 슬러그를 보유하고 promote 시점에 ID로 룩업하는 2-stage 디자인이 정답. 따라서 스키마 쪽이 잘못됨.

**결론**: 3 옵션 제시 — (a) spec 위치 수정, (b) 신규 브랜치에서 본 코드 적용하며 동시 수정, (c) 부분 적용.

### 토픽 2: 권장 액션 + B 결정
> **사용자**: "너의 권장 액션을 순차적으로 진행하고 B로 진행"

권장 액션 4건 (P0 ×3 + P1 ×1 + P2):
- P0-1: schema-additions.prisma:145 `suggestedCategoryId` → `suggestedCategorySlug`
- P0-2: migration-aggregator.sql:129 컬럼명 동일 변경
- P0-3: allowlist-additions.ts:71 동일 변경
- P1: Step 2-2 CronKind enum 수동 추가 강조 (append만으로는 안 됨)
- P2: API key 발급은 관리자 UI 경유 (SQL 직접 INSERT 금지)

Approach B = `feat/aggregator-v1` 브랜치 생성 후 spec 적용. 14개 task 생성:
- P0-1/2/3: spec 3 파일 수정 (잔존 `suggested_category_id` 0건 검증)
- B-1: 브랜치 생성 (`git checkout -b feat/aggregator-v1`)
- B-2: prisma/schema.prisma 확장 — CronKind enum에 AGGREGATOR 추가 + schema-additions.prisma append (총 +250줄, 5 모델 + 3 enum)
- B-3 ~ B-6: src/lib/aggregator/, api-guard-publishable.ts, REST 5 라우트, 관리자 4 페이지 복사
- B-7: cron/runner.ts 머지 (AGGREGATOR 분기 + import + kind 시그니처 확장)
- B-8: data-api/allowlist.ts 4 엔트리 인라인 (allowlist-additions 파일 의존 제거)
- B-9: supabase-clone.ts CronKindPayload union 확장
- B-10: 빌드/타입 체크

**B-10 검증 결과**: prisma generate 성공 (Content* 5 모델 정상 생성) → `npx tsc --noEmit` 실행 → **81 src/ 에러 + 21 파일 영향**.

### 토픽 3: 결함 카테고리 분석 + 3 경로 제시

81 에러를 4 카테고리로 분류:

**A. 스펙 내부 결함 vs 자체 스키마** (~30 에러):
- `nameKo` (categories/{actions, page, form}, items/page) vs schema `name`
- `categoryId` (categories/page groupBy) — staging은 `suggestedCategorySlug`만 있음
- `qualityFlag`, `reviewedById`, `reviewNote`, `track` (items/{actions, page}) — 스키마 미존재
- `thumbnailUrl` vs `imageUrl`, `externalUrl` vs `url`
- `'published'` 상태 — enum에 없음
- `ContentSource.id` Int를 actions에서 string으로 처리
- `ContentSourceKind` 소문자 'rss/html/api' vs schema 대문자
- `_count: true` boolean vs `_count: { _all: true }` 객체 misuse
- promote.ts excerpt(필수) null 처리, publishedAt(필수) null 처리

**B. Prisma 클라이언트 경로** (~5 에러):
- REST 라우트의 `import { Prisma } from "@prisma/client"` — yangpyeon은 `prisma-client` provider + `@/generated/prisma/client` 출력
- aggregator의 `import { ... } from "@/generated/prisma"` — barrel index 미존재, `/client` 명시 필요

**C. yangpyeon 어댑터 불일치** (~12 에러):
- `session.userId` (admin actions) — yangpyeon `DashboardSessionPayload`는 `{ sub, email, role, authenticated }`
- `AuditEntry.actor` — yangpyeon AuditEntry는 `{ timestamp, method, path, ip, status?, action?, userAgent?, detail? }`
- `extractClientIp(request)` — yangpyeon은 `extractClientIp(headers: Headers)`
- `apiKey.expiresAt` — yangpyeon ApiKey 모델 미존재 (revokedAt만)
- `<Button asChild>` (`@base-ui/react/button` 직접 래핑이라 asChild 미지원), `<DialogTrigger asChild>`, `<TabsTrigger asChild>` 동일

**D. 환경 셋업 누락** (~24 에러, 02-applying-the-patch.md Step 1에서 예고):
- 9 shadcn 컴포넌트: tabs, table, badge, input, select, textarea, checkbox, switch, label
- 3 npm 패키지: cheerio, rss-parser, @google/genai

**평가** ★Insight★:
- 스펙 v1.0은 type-check 한 번도 안 거친 초안. 작성자가 yangpyeon 실제 스키마/계약 미참조 상태로 패키징.
- 초기 P0 한 건만 수정하면 빌드 통과할 거라는 Approach B의 가정 깨짐 — 81 에러 중 약 57개(A+B+C)가 실제 코드 결함.
- 카테고리 D만 진짜 setup, A·B·C는 진짜 버그 — D가 24개로 가시성 높지만 실제 가치 결함은 A·B·C.

**3 경로 제시**:
1. 풀 어댑테이션 (~3-4h, 21 파일 일괄 수정)
2. 백아웃 + 스펙 재작성 (권장) — `spec/aggregator-fixes` 브랜치, spec을 yangpyeon 환경에서 type-check 통과 상태로 정합화
3. 부분 보존 (스키마 + aggregator 코어만, admin/REST 회귀)

**권장 근거**: A 카테고리는 spec 작성자의 자체 스키마 오해라 spec 측 수정이 정답. 두 군데 동기화 회피.

### 토픽 4: 사용자 결정 — 백아웃
> **사용자**: "너의 권장안대로. 진행"

경로 2 채택. 백아웃 단계 + spec 재작성 + 검증 8 task 추가:
- R-1: feat/aggregator-v1 백아웃 (브랜치 삭제 + 추적 파일 4 git checkout + 신규 4 디렉터리 rm -rf + prisma generate)
- R-2: spec/aggregator-fixes 브랜치 생성
- R-3: yangpyeon 어댑터 계약 조사 (사실 확인 → 결정 set 확정)
- R-4 ~ R-7: spec 카테고리 A ~ D 수정
- R-8: 임시 적용 후 tsc 검증

### 토픽 5: yangpyeon 어댑터 계약 조사 (R-3)

7개 핵심 계약 사실 확인 (병렬 Read):

| 계약 | yangpyeon 실제 |
|---|---|
| `AuditEntry` | `{ timestamp, method, path, ip, status?, action?, userAgent?, detail? }` (in-memory buffer, audit-log-db.ts 별도) |
| `extractClientIp(headers: Headers)` | NextRequest 미수용 |
| `Button` | `@base-ui/react/button` 직접 래핑, asChild 미지원 |
| `successResponse/errorResponse` | 시그니처 일치 |
| `ApiKey` 모델 | `expiresAt` 없음 (revokedAt만) |
| Prisma import | `@/generated/prisma/client` (표준), `@/generated/prisma/enums` |
| 세션 | `DashboardSessionPayload { sub, email, role, authenticated }` — `userId` 아님 |

이 사실들로 모든 R-4/R-6 결정 set 확정.

### 토픽 6: spec 일괄 수정 (R-4 + R-5 + R-6 + R-7)

**R-5 Prisma 경로** (가장 간단, 첫 처리):
- sed로 9개 파일 일괄 변경 — `@prisma/client` / `@/generated/prisma` (barrel) → `@/generated/prisma/client`
- 잔존 0건 검증 (comment line 1건만 — `*    설정에 따라 import 경로는 "@/generated/prisma" 가 됨.`)

**스키마 보강** (R-4 핵심):
- `ContentIngestedItem`에 큐레이션 4필드 추가:
  - `qualityFlag ContentQualityFlag @default(auto_ok) @map("quality_flag")`
  - `reviewedById String? @map("reviewed_by_id")` (User.id FK 비참조 — 운영 단순화)
  - `reviewedAt DateTime? @db.Timestamptz(3)`
  - `reviewNote String? @db.Text`
- `ContentIngestStatus`에 `promoted` 추가 (promote 후 재픽업 차단)
- migration-aggregator.sql 동기화 (4 컬럼 + enum 'promoted')
- allowlist-additions.ts에 4 필드 노출 추가

**18 파일 재작성/대폭 수정**:

1. `schema-additions.prisma` — `suggestedCategorySlug` (P0) + 큐레이션 4필드
2. `migration-aggregator.sql` — 컬럼명 + enum 'promoted'
3. `allowlist-additions.ts` — `suggestedCategorySlug` (P0) + 큐레이션 4필드
4. `aggregator/promote.ts` — **전면 재작성**
   - excerpt 필수 폴백: `aiSummary?.trim() || summary?.trim() || title.slice(0, 200)`
   - track 필수 폴백: `suggestedTrack ?? "general"`
   - publishedAt 필수 폴백: `publishedAt ?? fetchedAt`
   - ContentItem 비참조 필드 제거: `urlHash`, `status`, `promotedAt` (스키마에 없음)
   - staging update: `status: "promoted"` (신규 enum 값)
   - source include 제거 (불필요)
5. `aggregator/fetchers/rss.ts` — `FeedItem` 타입 정의 + 명시 어노테이션 (TS7006 implicit any 해소)
6. `api-guard-publishable.ts` — **전면 재작성**
   - expiresAt 로직 제거 (yangpyeon ApiKey 미지원)
   - revokedAt만 키 무효화 신호
   - 주석으로 만료 정책 추가 시점 가이드
7. `api/v1/almanac/contents/route.ts` — 4건 edit
   - `Prisma.DateTimeNullableFilter` → `Prisma.DateTimeFilter` (publishedAt non-nullable)
   - select 필드: `summary` → `excerpt + aiSummary`
   - `encodeCursor` 시그니처: `publishedAt: Date | null` → `Date` (non-nullable)
   - audit log: `actor` 필드 제거, yangpyeon AuditEntry shape (`timestamp/method/path/ip/action/userAgent/detail`), `extractClientIp(request.headers)`, actor는 detail JSON에 인코딩
8. `api/v1/almanac/today-top/route.ts` — `summary` → `excerpt + aiSummary` (2 위치)
9. `admin/aggregator/items/actions.ts` — **전면 재작성**
   - id: number → id: string (cuid)
   - session.userId → session.sub (4곳)
   - qualityFlag 값: 'ok' → 'auto_ok' (enum 정합)
   - blockItem: status='blocked' (enum 미존재) → status='rejected' + qualityFlag='blocked'
   - reclassifyItem: track/categoryId/classifiedAt 필드 → suggestedTrack/suggestedCategorySlug/processedAt
10. `admin/aggregator/categories/actions.ts` — id: number → string, nameKo → name, 검증 메시지 정정
11. `admin/aggregator/sources/actions.ts` — **전면 재작성**
    - kind: 'rss'/'html'/'api' lowercase → ContentSourceKind enum 강제 (대문자)
    - parseKind() 헬퍼 + KIND_VALUES const
    - parseJson 반환 타입: `unknown` → `Prisma.InputJsonValue`
    - lastFetchAt → lastFetchedAt (오타 수정)
12. `admin/aggregator/categories/category-form.tsx` — Cat 타입 export, id: string, nameKo → name
13. `admin/aggregator/items/item-row-actions.tsx` — id: string, externalUrl → url
14. `admin/aggregator/sources/source-row-actions.tsx` — Switch onCheckedChange 명시 타입(implicit any 해소)
15. `admin/aggregator/sources/new-source-dialog.tsx` — **재작성**
    - DialogTrigger 제거, controlled Dialog 패턴 (open + setOpen + 일반 Button onClick)
    - SelectItem 값 대문자 'RSS/HTML/API/FIRECRAWL'
    - TRACKS 통일 (hustle/work/build/invest/learn/community)
16. `admin/aggregator/items/page.tsx` — **재작성**
    - 필드 매핑: thumbnailUrl→imageUrl, externalUrl→url, track→suggestedTrack, categoryId→suggestedCategorySlug
    - category 관계 제거 (FK 비참조), 별도 슬러그→이름 룩업 (suggestedCategorySlug→ContentCategory.slug→ContentCategory.name)
    - TabsTrigger asChild 회피 → `TabLink` 컴포넌트 (Link styled-as-tab)
    - WhereInput 타입: `Prisma.ContentIngestedItemWhereInput`
17. `admin/aggregator/categories/page.tsx` — **재작성**
    - nameKo → name, count Map<string, number> (cuid string)
    - groupBy: categoryId → suggestedCategorySlug
    - TRACKS: hustle/work/build/invest/learn/community
    - Cat type import (category-form에서)
18. `admin/aggregator/dashboard/page.tsx` — **재작성**
    - 'published' status 제거 — staging은 'ready' 카운트, ContentItem.firstSeenAt 별도 카운트
    - Button asChild 제거 → Link styled-as-button (className 직접 + buttonVariants 회피)
    - $queryRaw에 `kind::text AS kind` 추가 (enum→string 캐스트)
19. `prisma/seed-aggregator.ts` — `new PrismaClient()` (인자 부족) → `import { prisma } from "@/lib/prisma"` (lazy proxy 재사용)
20. `README.md` — DB 모델 섹션 보강 (큐레이션 필드, ContentIngestStatus 머신, ContentQualityFlag), 의존성 섹션에 shadcn 9컴포넌트 + Prisma 경로 명시, v1.1 changelog
21. `02-applying-the-patch.md` — Step 1을 1-1/1-2/1-3 분할: npm 3종 + shadcn 9종 + Prisma client 경로 안내

### 토픽 7: R-8 검증 — tsc 셋업 외 0 에러

scratch 적용 (재현 가능 검증 패턴):
1. `prisma/schema.prisma`에 CronKind+AGGREGATOR 추가 + schema-additions append
2. `cp -r src/lib/aggregator src/app/api/v1/almanac src/app/admin/aggregator + api-guard-publishable.ts`
3. `npx prisma generate` (Content* 5모델 정상)
4. `npx tsc --noEmit` 실행

**결과**:
- src/ 영역 18 에러
- docs/assets/ 영역 19 에러 (1 추가 = seed-aggregator.ts PrismaClient 인자 부족)

전수 분석 — **18 src/ 에러 모두 TS2307 "Cannot find module"**:
- 9× `@/components/ui/X` (shadcn 미설치)
- 3× `cheerio`, `rss-parser`, `@google/genai` (npm 미설치)
- 그 외 0개

즉 **순수 셋업 갭만 잔존**. 02-applying-the-patch.md Step 1 1회 실행으로 해결 보장.

**seed-aggregator.ts 추가 수정**: yangpyeon `PrismaClient`는 `PrismaPg` 어댑터 강제 → `import { prisma } from "@/lib/prisma"` 로 lazy proxy 재사용.

scratch 정리: `git checkout -- prisma/schema.prisma` + 4 디렉터리 rm + prisma generate. spec/aggregator-fixes 작업 트리는 docs/assets/ 변경만 잔존.

**최종 검증**: 셋업 외 잔존 에러 0개. spec v1.1은 type-check 클린 상태.

**결론**: 81 → 0 (셋업 외). spec 자체는 즉시 적용 가능.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | suggestedCategoryId → suggestedCategorySlug | (a) FK 강제 (b) 스키마 그대로 두고 코드 변경 | promote.ts categoryIdBySlug 룩업 패턴이 슬러그 staging 의도 명백, 2-stage 디자인 보존 |
| 2 | Approach B 적용 후 81 에러 → 백아웃 + 재작성 (경로 2) | 풀 어댑테이션 / 부분 보존 | spec 자체 결함 다수, 두 군데 동기화 비용 회피, 다음 세션이 깨끗한 spec으로 적용 가능 |
| 3 | 큐레이션 필드 4개 schema 추가 | actions를 minimum API로 다이어트 | README 큐레이션 기능 명시 + 코드 의도와 매칭, 기능 보존 |
| 4 | reviewedById = String? (FK 비참조) | User 명시 관계 | yangpyeon User 모델에 back-relation 추가 회피, contract 변경 최소화 |
| 5 | ContentIngestStatus에 'promoted' 추가 | 'ready' 유지 + processedAt 필터 | promote 후 분류기/promoter 재픽업 명시적 차단 |
| 6 | asChild 회피 (Link with className / controlled Dialog) | yangpyeon Button에 asChild 추가 | yangpyeon 컨트랙트 변경 회피, spec이 yangpyeon 환경에 적응 |
| 7 | seed-aggregator.ts → import { prisma } from "@/lib/prisma" | new PrismaClient({ adapter }) 추가 | lazy proxy 재사용으로 어댑터 의존 우회, 단일 출처 |
| 8 | spec 검증 패턴: scratch 적용 → tsc → 백아웃 | 적용한 채 머지 / 적용 안 함 | 작업 트리 깨끗 유지, 검증 결과만 남김, 재현 가능 |

## 수정 파일 (21개 — docs/assets/ 18 + status/log/handover/index/journal 5 + CK 1, but commit 시 표시)

### docs/assets/yangpyeon-aggregator-spec/ — 스펙 v1.0 → v1.1 (18 파일)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `code/prisma/schema-additions.prisma` | `suggestedCategorySlug` + 큐레이션 4필드 + `promoted` enum |
| 2 | `code/prisma/migration-aggregator.sql` | 컬럼명 정합 + 큐레이션 4컬럼 + enum 'promoted' |
| 3 | `code/src/lib/data-api/allowlist-additions.ts` | 노출 컬럼 정합 + 큐레이션 필드 노출 |
| 4 | `code/src/lib/aggregator/promote.ts` | 전면 재작성 — 필수 필드 폴백 + ContentItem 비참조 제거 + 'promoted' staging |
| 5 | `code/src/lib/aggregator/fetchers/rss.ts` | FeedItem 타입 + 명시 어노테이션 |
| 6 | `code/src/lib/aggregator/fetchers/api.ts` | Prisma 경로 (sed) |
| 7 | `code/src/lib/aggregator/fetchers/html.ts` | Prisma 경로 (sed) |
| 8 | `code/src/lib/aggregator/fetchers/index.ts` | Prisma 경로 (sed) |
| 9 | `code/src/lib/aggregator/runner.ts` | Prisma 경로 (sed) |
| 10 | `code/src/lib/api-guard-publishable.ts` | 전면 재작성 — expiresAt 로직 제거, revokedAt만 |
| 11 | `code/src/app/api/v1/almanac/contents/route.ts` | Prisma 경로 + AuditEntry shape + extractClientIp(headers) + DateTimeFilter + excerpt |
| 12 | `code/src/app/api/v1/almanac/categories/route.ts` | Prisma 경로 |
| 13 | `code/src/app/api/v1/almanac/sources/route.ts` | Prisma 경로 |
| 14 | `code/src/app/api/v1/almanac/today-top/route.ts` | summary → excerpt + aiSummary |
| 15 | `code/src/app/admin/aggregator/items/actions.ts` | 전면 — id:string, session.sub, qualityFlag enum |
| 16 | `code/src/app/admin/aggregator/categories/actions.ts` | id:string, name (NOT nameKo) |
| 17 | `code/src/app/admin/aggregator/sources/actions.ts` | 전면 — kind 대문자, lastFetchedAt, Prisma.InputJsonValue |
| 18 | `code/src/app/admin/aggregator/categories/category-form.tsx` | Cat type export, id:string, name |
| 19 | `code/src/app/admin/aggregator/items/item-row-actions.tsx` | id:string, externalUrl→url |
| 20 | `code/src/app/admin/aggregator/sources/source-row-actions.tsx` | Switch onCheckedChange 명시 타입 |
| 21 | `code/src/app/admin/aggregator/sources/new-source-dialog.tsx` | controlled Dialog, SelectItem 대문자 |
| 22 | `code/src/app/admin/aggregator/categories/page.tsx` | 재작성 — name, suggestedCategorySlug groupBy, Cat 임포트 |
| 23 | `code/src/app/admin/aggregator/items/page.tsx` | 재작성 — imageUrl/url/suggestedTrack/suggestedCategorySlug, TabLink |
| 24 | `code/src/app/admin/aggregator/dashboard/page.tsx` | 재작성 — 'published' 제거, asChild → Link with className |
| 25 | `code/prisma/seed-aggregator.ts` | new PrismaClient → import { prisma } |
| 26 | `README.md` | DB 모델 섹션 + 셋업 명시 + v1.1 changelog |
| 27 | `02-applying-the-patch.md` | Step 1 → 1-1/1-2/1-3 (npm + shadcn + Prisma 경로) |

### 세션 추적 파일

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `docs/status/current.md` | 세션 57 row + 진행 상태 |
| 2 | `docs/logs/2026-04.md` | 세션 57 항목 추가 |
| 3 | `docs/logs/journal-2026-04-26.md` | 신규 — 세션 저널 |
| 4 | `docs/handover/260426-session57-aggregator-spec-rewrite.md` | 신규 — 본 인수인계서 |
| 5 | `docs/handover/_index.md` | 2026-04-26 그룹 + 세션 57 row |
| 6 | `docs/handover/next-dev-prompt.md` | 세션 57 종료 갱신 |
| 7 | `docs/solutions/2026-04-26-spec-typecheck-driven-rewrite.md` | 신규 CK |

## 상세 변경 사항

### 1. 스키마 보강 (큐레이션 + promoted)

`schema-additions.prisma` ContentIngestedItem 모델에 4 필드:
```prisma
qualityFlag         ContentQualityFlag  @default(auto_ok) @map("quality_flag")
reviewedById        String?             @map("reviewed_by_id") // User.id (FK 비참조 — 운영 단순화)
reviewedAt          DateTime?           @map("reviewed_at") @db.Timestamptz(3)
reviewNote          String?             @db.Text @map("review_note")
```

ContentIngestStatus에 'promoted' 추가:
```prisma
enum ContentIngestStatus {
  pending
  classifying
  ready
  promoted    // 신규 — promote 후 분류기/promoter 재픽업 차단
  rejected
  duplicate
}
```

migration-aggregator.sql에 동일 4 컬럼 + enum 값 추가.

### 2. 어댑터 패턴 — yangpyeon 컨트랙트 정합

**AuditEntry shape** (contents/route.ts):
```typescript
// Before (잘못됨)
await writeAuditLog({
  action: "ALMANAC_CONTENTS_LIST",
  actor: apiKey ? `apikey:${apiKey.id}` : "anonymous",
  ip: extractClientIp(request),  // request 받음 (TS 에러)
  meta: { ... },
});

// After (yangpyeon 정합)
writeAuditLog({
  timestamp: new Date().toISOString(),
  method: request.method,
  path: new URL(request.url).pathname,
  ip: extractClientIp(request.headers),
  action: "ALMANAC_CONTENTS_LIST",
  userAgent: request.headers.get("user-agent") ?? undefined,
  detail: JSON.stringify({
    actor: apiKey ? `apikey:${apiKey.id}` : "anonymous",
    track, category, q, language, source, sort, limit, count: trimmed.length,
  }),
});
```

actor를 detail JSON에 인코딩하여 정보 손실 0.

**asChild 회피** (dashboard/page.tsx):
```tsx
// Before
<Button asChild variant="outline" className="border-zinc-700 text-zinc-200">
  <Link href="/admin/cron-jobs">/admin/cron-jobs 열기</Link>
</Button>

// After — Link 직접 스타일링
<Link
  href="/admin/cron-jobs"
  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-background px-2.5 text-sm font-medium text-zinc-200 transition-all hover:bg-muted hover:text-foreground"
>
  /admin/cron-jobs 열기
</Link>
```

**ContentSourceKind 대문자** (sources/actions.ts):
```typescript
const KIND_VALUES = ["RSS", "HTML", "API", "FIRECRAWL"] as const;
function parseKind(raw: unknown): ContentSourceKind {
  const upper = String(raw ?? "").toUpperCase();
  if ((KIND_VALUES as readonly string[]).includes(upper)) return upper as ContentSourceKind;
  throw new Error(`알 수 없는 kind: ${raw} — 허용값: ${KIND_VALUES.join("|")}`);
}
```

### 3. promote.ts 필수 필드 폴백

ContentItem 스키마는 `excerpt`/`track`/`publishedAt`을 non-null로 강제 → staging의 nullable 필드를 적절히 폴백:

```typescript
const excerpt = item.aiSummary?.trim() || item.summary?.trim() || item.title.slice(0, 200);
const track = item.suggestedTrack ?? DEFAULT_TRACK;
const publishedAt = item.publishedAt ?? item.fetchedAt;
```

ContentItem 비참조 필드(urlHash, status, promotedAt) 제거 → 스키마에 없는 필드를 setItem upsert에서 제외.

### 4. seed-aggregator.ts — yangpyeon prisma 재사용

yangpyeon `PrismaClient`는 `PrismaPg` 어댑터를 강제 (`new PrismaClient()` 인자 부족 에러). seed 스크립트가 자체 인스턴스를 만들지 않고 `@/lib/prisma`의 lazy proxy 재사용:

```typescript
// Before
import { PrismaClient } from "@/generated/prisma/client";
const prisma = new PrismaClient();  // TS2554

// After
import { prisma } from "@/lib/prisma";  // lazy proxy, 어댑터 자동 처리
```

### 5. spec 검증 패턴 (재현 가능)

scratch 적용 → tsc → 백아웃 패턴:

```bash
# 1. 임시 적용
git checkout -b spec/aggregator-fixes
[CronKind enum 추가]
cat docs/assets/yangpyeon-aggregator-spec/code/prisma/schema-additions.prisma >> prisma/schema.prisma
cp -r docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator src/lib/
cp docs/assets/yangpyeon-aggregator-spec/code/src/lib/api-guard-publishable.ts src/lib/
cp -r docs/assets/yangpyeon-aggregator-spec/code/src/app/api/v1/almanac/. src/app/api/v1/almanac/
cp -r docs/assets/yangpyeon-aggregator-spec/code/src/app/admin/aggregator/. src/app/admin/aggregator/
npx prisma generate
npx tsc --noEmit | grep -v "Cannot find module '@/components/ui\|cheerio\|rss-parser\|@google/genai" | wc -l
# 0 (셋업 외 잔존)

# 2. 백아웃 (작업 트리 깨끗화)
git checkout -- prisma/schema.prisma
rm -rf src/lib/aggregator src/app/api/v1/almanac src/app/admin/aggregator
rm -f src/lib/api-guard-publishable.ts
npx prisma generate
```

## 검증 결과

- `npx tsc --noEmit` (scratch 적용 후) — **src/ 셋업 외 잔존 에러 0개** (18 에러는 모두 TS2307 missing module — Step 1 setup으로 해소)
- `npx prisma generate` — Content* 5모델 정상 생성, 0 경고
- 백아웃 후 main 동등 상태 — `git status` = `M standalone/README.md` + `?? docs/assets/` (사전 작업 + 본 세션 산출물)

## 터치하지 않은 영역

- **실제 적용**: 본 세션은 스펙 자체의 정합화에만 집중. 다음 세션이 02-applying-the-patch.md를 따라 npm install + shadcn add 실행 후 패치 적용 가능 (이론적으로 0 에러 보장)
- **DB 마이그레이션**: prisma migrate dev 미실행 (DB 변경 = 사용자 승인 사항)
- **PM2 reload**: 운영 영향 없음 (코드 적용 0)
- **다른 글로벌 스킬 audit drift** (S55·S56 이월): 본 세션 범위 외
- **S54·S53 잔존 6항** (이월 누적): `_test_session` drop / DATABASE_URL rotation / 브라우저 E2E CSRF / MFA biometric / SP-013·016 / Windows 재부팅 실증

## 알려진 이슈

- spec 적용 시 `/api/v1/almanac/*` 라우트는 PUBLISHABLE API key 발급 필요 — 스펙 02-applying-the-patch.md Step 7에 명시되어 있으나 keyHash 헬퍼 의존성 (관리자 UI 경유 필수)
- `categoryId` FK 비참조 — staging의 suggestedCategorySlug는 ContentCategory.slug에 대한 외래키 제약이 없음 (오타로 슬러그 잘못 입력 시 promote.ts에서 categoryId=null이 됨, 이건 의도된 동작)
- `reviewedById` FK 비참조 — User.id 무결성 미강제, 사용자 삭제 시 staging에 stale ID 잔존 가능 (운영 단순화 트레이드오프)

## 다음 작업 제안

**우선 1 (S57+)**: 다음 적용 세션. spec/aggregator-fixes 머지 후 02-applying-the-patch.md 그대로 따라가기:
1. `npm install rss-parser cheerio @google/genai` (Step 1-1)
2. `npx shadcn@latest add tabs table badge input select textarea checkbox switch label` (Step 1-2)
3. CronKind에 AGGREGATOR 추가 + schema-additions.prisma append (Step 2)
4. 코드 4 디렉터리 cp + runner.ts/allowlist.ts/supabase-clone.ts 머지 (Step 3)
5. `prisma generate` + `next build` 검증 (Step 6 — 0 에러 기대)
6. `prisma migrate dev --name add_content_aggregator` (Step 2-3, DB 변경 사용자 승인)
7. seed + cron 등록 + 운영 검증 (Step 5~9)

**우선 2 (S57+)**: 2026-04-26 03:00 KST cleanup cron 첫 정상 실행 검증 (S56 이월) — `wsl -- bash -lic 'pm2 logs ypserver --lines 80 --nostream | grep -A2 "audit log write failed"'` (5일 연속 발생하던 에러가 사라져야 함)

**우선 3**: ADR-021 placeholder 충돌 6 위치 cascade 정정 (S56 §보완 2 §D 표 — 02-architecture/01-adr-log.md §1029, 16-ux-quality-blueprint §1570, 03-risk-register §649·651, 07-appendix/01-kdygenesis-handoff §4, /02-final-summary §4, /02-dq-final-resolution §591-592)

**우선 4 (S55·S56 이월)**: 다른 글로벌 스킬 drift 점검 (`kdyship`/`kdydeploy`/`kdycicd`)

---

[← handover/_index.md](./_index.md)
