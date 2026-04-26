# Almanac × 양평 부엌 서버 — Multi-Tenant 통합 가이드

> 작성: 2026-04-26 세션 62 종료 시점
> 대상: Almanac 프로젝트(almanac-flame.vercel.app) 개발팀
> 양평 부엌 서버 운영자: kimdooo@stylelucky4u.com
> 본 문서는 양평 부엌 서버가 단일 사용자 도구에서 멀티테넌트 BaaS로 전환된 결과 Almanac이 적용해야 할 변경사항을 정리합니다.

---

## 1. 한 줄 요약

> Almanac이 양평 부엌 서버의 **첫 컨슈머**로 정식 등록되었습니다. 기존 `/api/v1/almanac/*` 엔드포인트는 그대로 사용 가능(308 redirect)하지만, 신규 코드는 `/api/v1/t/almanac/*` 경로 + tenant API 키를 사용하도록 점진 마이그레이션을 권장합니다.

---

## 2. 무엇이 바뀌었나

### 2.1 백엔드 정체성 재정의 (ADR-022, 2026-04-26 세션 58)

양평 부엌 서버는 다음과 같이 재정의되었습니다:

| Before | After |
|--------|-------|
| 1인 사용자 도구 (개인 admin 대시보드) | **closed multi-tenant BaaS** — 본인 소유 10~20개 프로젝트의 공유 백엔드 |
| 단일 데이터베이스 + 단일 사용자 | tenant-scoped 데이터 격리 (Row Level Security) + 다중 컨슈머 |
| `/api/v1/*` 글로벌 엔드포인트 | `/api/v1/t/<tenant>/*` per-tenant 엔드포인트 + 글로벌은 운영자 콘솔 전용 |

**Almanac은 `tenant.slug = 'almanac'` 으로 등록되었습니다.** (UUID: `00000000-0000-0000-0000-000000000001`)

### 2.2 데이터 격리 (ADR-023, T1.4 적용 완료)

- **Row Level Security 활성화**: 모든 `content_*` 테이블에 PostgreSQL RLS 정책 적용. 각 tenant는 자기 tenant의 행만 SELECT/INSERT/UPDATE/DELETE 가능.
- **tenant_id 첫 컬럼 강제**: 모든 신규 테이블의 첫 필드는 `tenant_id String @map("tenant_id") @db.Uuid`.
- **PG 세션 변수 자동 주입**: 핸들러가 `SET LOCAL app.tenant_id = '<uuid>'`를 매 query마다 적용 (Prisma Client Extension).

→ Almanac 측에서는 **tenant_id를 직접 관리할 필요 없음**. URL path의 `/t/almanac/`만으로 자동 적용됩니다.

### 2.3 핵심 7원칙 (ADR-022 ACCEPTED)

운영자가 양보하지 않을 7원칙입니다 — 호환성에 영향:

1. **Tenant는 1급 시민**: 모든 신규 모델/route/cron/log에 `tenant_id` 첫 컬럼.
2. **플랫폼 코드와 컨슈머 코드 영구 분리**: yangpyeon = 플랫폼만. Almanac 도메인 코드는 별도 (자세한 내용은 §6 참조).
3. **장애 격리**: 한 컨슈머의 실패는 다른 컨슈머에 닿지 않음.
4. **컨슈머 추가 = 코드 수정 0줄**: TS manifest + DB row만으로.
5. **셀프 격리 + 자동 복구 + 관측성** 3종 세트 동시.
6. **불변 코어**: Auth/Audit/Cron/Router/RateLimit는 6개월에 한 번 변경.
7. **N=20 컨슈머 1인 운영 가능성**이 모든 결정의 머지 게이트.

---

## 3. 엔드포인트 변경 (즉시 적용됨)

### 3.1 새 정식 엔드포인트 (권장)

```
https://stylelucky4u.com/api/v1/t/almanac/<path>
```

이 경로로 호출하면:
- 자동으로 `app.tenant_id = '00000000-0000-0000-0000-000000000001'` (almanac UUID) 가 PG 세션에 SET
- 모든 SELECT/INSERT 가 RLS 정책에 의해 'almanac' 행만 노출/생성
- audit_logs, metrics 등 관측성 데이터에 `tenant_id = 'almanac UUID'` 자동 라벨링

### 3.2 레거시 alias (호환 보장 — 한시적)

기존 `/api/v1/almanac/*` 호출은 **308 Permanent Redirect**로 자동 변환됩니다:

```
GET /api/v1/almanac/health
→ 308 Permanent Redirect
   Location: /api/v1/t/almanac/health
```

- HTTP 메서드 보존 (308이라 GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS 모두 보존)
- 클라이언트의 redirect-following이 활성화되어 있으면 (대부분 fetch/axios 기본값) **코드 수정 없이 동작**
- query string 보존
- body 보존 (308 사양상)

**alias 종료 일정**: §7 참조 (Phase 2 plugin 마이그레이션 완료 후, ~5~7일).

### 3.3 클라이언트 코드 마이그레이션 예시

```typescript
// Before (현재 작동 — 308 redirect로 자동 동작)
const API_BASE = "https://stylelucky4u.com/api/v1/almanac";
fetch(`${API_BASE}/content/items`)

// After (권장 — redirect 1회 절약 + 명시적 multi-tenant)
const API_BASE = "https://stylelucky4u.com/api/v1/t/almanac";
fetch(`${API_BASE}/content/items`)
```

---

## 4. 인증 — Tenant API 키 (T1.3 ApiKey K3 매칭)

### 4.1 새 키 형식

기존 글로벌 API 키 (`sb_publishable_*` / `sb_secret_*`) 외에 **tenant 키**가 도입되었습니다:

```
pub_almanac_<random_base64url_32>   ← Publishable (브라우저 노출 허용)
srv_almanac_<random_base64url_32>   ← Server (백엔드 전용, 노출 금지)
```

형식 정의 (ADR-027 §5.1):
- `<scope>` = `pub` (publishable) | `srv` (server)
- `<tenant_slug>` = `almanac` (immutable)
- `<random>` = 32자 base64url (24바이트)

### 4.2 키 발급 절차

Almanac 개발팀이 양평 부엌 서버 운영자에게 요청:

```
받는 사람: kimdooo@stylelucky4u.com
제목: [Almanac] tenant API 키 발급 요청
본문:
  - scope: pub 1개 + srv 1개 (또는 필요한 만큼)
  - 용도: <설명 — 예: "Vercel 배포된 Almanac 프론트엔드 + edge function">
  - scopes (권한): ["read:content", "write:content"] 등
  - 만료일 (선택): YYYY-MM-DD
```

운영자가 발급 후 평문 전달 (1회 노출). 평문은 안전하게 저장 (Vercel env, 1Password 등).

### 4.3 인증 헤더

```http
GET /api/v1/t/almanac/content/items HTTP/1.1
Host: stylelucky4u.com
Authorization: Bearer srv_almanac_<random>
```

검증 흐름 (자동, 클라이언트 무관):
1. 토큰 형식 정규식 검증 (`pub|srv`_`<slug>`_`<random>`)
2. DB lookup (prefix unique)
3. bcrypt hash 검증
4. revokedAt 검사
5. **Cross-validation 1**: `dbTenant.slug === prefixSlug` (DB 위조 차단)
6. **Cross-validation 2**: `dbTenant.slug === pathTenant.slug` (cross-tenant 차단 — 401 또는 403)

### 4.4 K3 시나리오 매트릭스 (ADR-027 §8)

| 시나리오 | 예 | 응답 |
|---------|-----|------|
| 0. 정규식 불일치 | `Bearer foo` | 401 INVALID_FORMAT |
| 1. 정상 키의 cross-tenant | `srv_almanac_<x>` 로 `/api/v1/t/<other>/...` 호출 | **403** CROSS_TENANT_FORBIDDEN |
| 2. slug 위조 (DB miss) | `srv_fake_<random>` | 401 NOT_FOUND |
| 3. random 추측 실패 | `srv_almanac_<wrong>` | 401 INVALID_HASH |
| 4. DB 위조 (FK 불일치) | DB 직접 변조 사례 | **401** TENANT_MISMATCH_INTERNAL + audit high |
| 5. revokedAt 채워진 키 | 폐기된 키 | 401 REVOKED |
| 6. 정상 키 + 정상 path | 정상 호출 | **200/그 외** (핸들러 응답) |

### 4.5 키 폐기

운영자에게 키 ID 또는 prefix를 전달하여 폐기 요청. 양평 운영 콘솔에서 즉시 적용.

---

## 5. 데이터 모델 (T1.6 적용 — 운영 DB 마이그레이션 완료 2026-04-26)

### 5.1 신규 5개 테이블 + 3개 enum

운영 PostgreSQL에 다음 테이블이 생성되었습니다 (모두 RLS enabled, tenant_id 첫 컬럼):

| 테이블 | 역할 | 주요 unique |
|--------|------|------------|
| `content_categories` | Track × Slug 카테고리 트리 | `(tenant_id, slug)`, `(tenant_id, track, slug)` |
| `content_sources` | RSS/HTML/API 소스 정의 | `(tenant_id, slug)` |
| `content_ingested_items` | 수집된 원본 아이템 (정규화 전) | `(tenant_id, url_hash)` |
| `content_items` | 발행된 콘텐츠 (피드/카테고리 노출 단위) | `(tenant_id, slug)`, `ingested_item_id` (글로벌 — 1:1) |
| `content_item_metrics` | 일별 노출/클릭 메트릭 | PK `(tenant_id, item_id, date)` |

신규 enum:
- `ContentSourceKind`: `RSS / HTML / API / FIRECRAWL`
- `ContentIngestStatus`: `pending / classifying / ready / promoted / rejected / duplicate`
- `ContentQualityFlag`: `auto_ok / manual_review / blocked`

상세 스키마 정의:
- 원본 spec: `docs/assets/yangpyeon-aggregator-spec/code/prisma/schema-additions.prisma`
- 적용본: `prisma/schema.prisma` (양평 master 브랜치)
- 마이그레이션 SQL: `prisma/migrations/20260427140000_t1_6_aggregator_with_tenant/migration.sql`

### 5.2 cron 통합

기존 `enum CronKind`에 `AGGREGATOR` 값이 추가되었습니다. Almanac 콘텐츠 수집 cron은 양평 cron worker pool (T1.5) 안에서 격리 실행됩니다:

- per-tenant timeout / concurrency cap (ADR-028)
- 한 컨슈머 cron 실패가 다른 컨슈머에 영향 없음

### 5.3 'almanac' tenant row

운영 DB의 `tenants` 테이블에 다음 row가 시드되었습니다:

```
id           = 00000000-0000-0000-0000-000000000001
slug         = 'almanac'
display_name = 'Almanac'
active       = true
```

---

## 6. Almanac 코드 분리 일정 (ADR-024)

### 6.1 결정 사항

ADR-024 옵션 D (hybrid): 컨슈머 도메인 코드는 양평 모노레포의 `packages/tenant-<slug>/` plugin으로 분리.

### 6.2 현재 상태 (Phase 1 진행 중)

- **Almanac aggregator spec v1.0**: spec/aggregator-fixes 브랜치에 일부 적용 중 (양평 측)
- **본 통합**: T1.6에서 schema + tenant_id + alias만 우선 적용. 핵심 aggregator 비즈니스 로직(runner.ts/classify.ts/promote.ts/dedupe.ts)은 미적용.

### 6.3 향후 마이그레이션 (Phase 2 — T2.5, ~5~7일)

다음 시점에 양평 측에서 진행:

1. v1.0 출시 후 Almanac aggregator 비즈니스 로직을 `packages/tenant-almanac/` plugin으로 이동
2. plugin manifest 등록 (ADR-026)
3. `/api/v1/almanac/*` alias 종료 → 410 Gone 응답
4. **M3 게이트**: 2번째 컨슈머 추가 시 코드 0줄 수정 입증

### 6.4 Almanac 측 작업 권장

지금 (즉시):
- `/api/v1/t/almanac/*` 경로 + tenant API 키로 호출하도록 클라이언트 점진 마이그레이션 (선택 — alias 308이 한시적으로 호환)
- 새 콘텐츠 모델(`content_*`) 사용 코드 작성

Phase 2 진입 직전 (양평 운영자 별도 통보):
- 클라이언트 base URL 최종 확정
- alias 종료 D-Day 협의

---

## 7. 알려진 제약 / DEFERRED

| 항목 | 영향 | 임시 대응 / 예정 |
|------|------|------|
| `/api/v1/almanac/*` alias 종료 미정 | 한시적 308 redirect | Phase 2 plugin 마이그레이션 후 410 Gone (별도 통보) |
| Almanac 자체 admin UI 없음 | 운영자 양평 콘솔에서 콘텐츠 관리 | Phase 3 (T3.2) Tenant Console 도입 검토 |
| Per-tenant rate limit 정책 | 글로벌 적용 | Phase 3 (T3.4) Cardinality 자동 정책 |
| 외부 콘텐츠 API 키 (OpenAI 등) | 양평 Vault에 저장 | Almanac 측에서 양평 운영자에게 발급 요청 (§4 동일 절차) |
| Edge Function 미지원 (Almanac 도메인) | Vercel Edge → 양평 Node.js fluid compute | Phase 4 evaluation |

---

## 8. 운영 검증 결과 (2026-04-26 배포)

```
ROOT      = 307 (인증 미들웨어 정상)
ALMANAC   = 308 redirect (Location: /api/v1/t/almanac/*)
TENANT    = 401 (withTenant 가드 정상 — 인증 요구)
신규 에러 = 0건
PM2       = ypserver online + cloudflared 21h+
RLS       = content_* 5 테이블 relrowsecurity=t 확인
시드      = tenants에 'almanac' row 존재 확인
```

---

## 9. 변경 이력 + 후속 통보

본 통합의 결정 근거:
- **ADR-022** (BaaS 정체성 재정의)
- **ADR-023** (데이터 격리 — shared+RLS)
- **ADR-024** (Plugin 코드 격리 — hybrid)
- **ADR-027** (Multi-tenant Router — URL path)
- 위치: `docs/research/baas-foundation/01-adrs/`

본 통합의 운영 commit:
- `0d910e8` feat(s62): T1.6 aggregator + raw-prisma sweep 130건
- `f0d4443` fix(migration/t1.4): PG 16 호환성 + 운영 DB drift 대응
- 브랜치: `spec/aggregator-fixes`

후속 통보 채널:
- 운영자 이메일: kimdooo@stylelucky4u.com
- 알림 시점: Phase 2 (T2.5 — `packages/tenant-almanac/` 마이그레이션) 진입 D-7

---

## 10. Almanac 측 액션 아이템 체크리스트

본 통합으로 Almanac 개발팀이 결정/실행해야 할 항목:

- [ ] tenant API 키 발급 요청 (§4.2 절차) — pub × N + srv × N
- [ ] 발급된 키를 안전하게 저장 (Vercel env / 1Password / etc.)
- [ ] (선택) 클라이언트 base URL을 `/api/v1/t/almanac/*` 로 점진 변경
- [ ] (선택) 신규 콘텐츠 모델(`content_*`) 사용 코드 작성 — schema 정의는 `docs/assets/yangpyeon-aggregator-spec/code/prisma/schema-additions.prisma` 참조
- [ ] Phase 2 진입 시 alias 종료 D-Day 협의
- [ ] 외부 API 키 (OpenAI 등 콘텐츠 처리에 필요한 시크릿) 양평 운영자에게 위탁 또는 자체 관리 결정

문의: kimdooo@stylelucky4u.com

---

*본 문서는 양평 부엌 서버 세션 62 종료 시점의 운영 배포 결과를 기준으로 작성됨. 이후 변경사항은 양평 운영자가 별도 통보.*
