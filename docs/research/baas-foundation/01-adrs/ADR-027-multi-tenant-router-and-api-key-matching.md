# ADR-027 — Multi-tenant Router 패턴 + API Key 매칭 전략

> **상태**: ACCEPTED · **결정**: ACCEPTED (2026-04-26)
> 작성: 2026-04-26 (sub-agent #6 / baas-foundation Wave)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/baas-foundation/](../) → [01-adrs/](./) → **이 문서**
> 연관: ADR-022 (정체성 재정의), ADR-024 (Plugin 격리), ADR-026 (Tenant Manifest)
> 참조 컨텍스트:
> - [00-context/01-existing-decisions-audit.md](../00-context/01-existing-decisions-audit.md)
> - [00-context/02-current-code-audit.md](../00-context/02-current-code-audit.md)
> - [04-integration/02-cloudflare-deployment-integration.md](../../2026-04-supabase-parity/04-integration/02-cloudflare-deployment-integration.md)
> - 코드: `src/lib/api-guard.ts`, `src/lib/auth.ts`, `src/lib/auth/keys.ts`

---

## 0. 요약 (TL;DR)

본 ADR은 **N=10~20개 tenant**(예: `almanac`, `recipe`, `memo` 등 1인 운영자가 보유한 독립 프로젝트)가 단일 양평 서버에서 공존할 때:

1. **컨슈머의 API 호출을 어떻게 tenant scope으로 라우팅할 것인가?** (Router 패턴)
2. **컨슈머가 제시한 API key를 어떻게 tenant와 매칭하고 cross-tenant 침범을 차단할 것인가?** (Key 매칭 전략)

두 질문에 대해 4×3개 옵션을 평가하고 권고안을 제시한다.

**권고**:
- Router: **옵션 A (URL path 기반 — `/api/v1/t/<tenant>/...`)**
- Key 매칭: **옵션 K3 (prefix 추론 + DB FK + cross-validation 둘 다)**
- 가드: **`withTenant()` 신규 추가** (기존 `withAuth`/`withRole`는 그대로 유지)

**핵심 근거**:
- Cloudflare Tunnel single hostname 제약으로 옵션 B(서브도메인)는 사실상 불가
- 1인 운영 + 10~20 tenant 규모에 path 기반이 디버깅·로깅·라우팅 충돌 측면에서 압도적으로 유리
- K3는 운영 부담이 미미하면서도 계약적 안전성(prefix 위변조 + DB FK 위변조 동시 발생 시에만 침범 가능 → 사실상 불가능) 확보

---

## 1. 컨텍스트

### 1.1 문제 상황

ADR-022(정체성 재정의)와 ADR-026(Tenant Manifest)에서 양평 서버는 "단일 운영자 김도영이 N=10~20개의 독립 BaaS 프로젝트(이하 tenant)를 호스팅하는 mini-Supabase"로 재정의된다. 각 tenant는:

- 독립된 contents/users/api-keys 데이터셋 보유
- 자체 컨슈머(브라우저 SPA, 모바일 앱, 외부 시스템)가 양평 API를 호출
- 공통 PostgreSQL/SQLite/SeaweedFS 인프라 위에서 동작

이 상황에서 `https://stylelucky4u.com`으로 도착한 HTTP 요청을 어떻게 **올바른 tenant scope으로 라우팅**하고, **API key가 자기 tenant 외 데이터에 접근하지 못하도록 차단**할 것인가가 본 ADR의 결정 대상이다.

### 1.2 현재 코드 가정 (단일 tenant 전제)

[02-current-code-audit.md §3](../00-context/02-current-code-audit.md) 인용:

```
/api/v1/
  ├── auth/
  ├── api-keys/           ← user.sub의 키만 (ADMIN)
  ├── members/            ← 글로벌 User 테이블
  ├── functions/[id]/run  ← fn.ownerId === user.sub
  ├── sql/execute         ← ADMIN/MANAGER, read-only PG 롤
  └── (기타)              ← 모두 /api/v1/* 패턴
```

- 모든 라우트가 `user.sub` 글로벌 identity 가정
- `withAuth`/`withRole` 가드는 tenant 인식 없음 (글로벌 role만 확인)
- ApiKey 테이블에 `tenantId` 컬럼 없음, `verifyApiKey()`는 호출자 sub === ownerId만 검증

### 1.3 인프라 제약 — Cloudflare Tunnel

[04-integration/02-cloudflare-deployment-integration.md §1.1, §2.1, §4.3](../../2026-04-supabase-parity/04-integration/02-cloudflare-deployment-integration.md) 인용:

```
Cloudflare Edge (글로벌 Anycast)
  Tunnel: 2e18470f-b351-46ab-bf07-ead0d1979fb9
  stylelucky4u.com        → CF Proxy → Tunnel → localhost:3000
  canary.stylelucky4u.com → CF Rule  → Tunnel → localhost:3002
  api.stylelucky4u.com    → CF Proxy → Tunnel → localhost:3000/api/*  (잠재 경로, 미활성)
```

- Cloudflare Tunnel ingress는 hostname → service URL 매핑이 **명시적으로 각 hostname마다 1행씩 등록**되어야 한다.
- DNS 레코드는 가비아 → Cloudflare 위임 후 Cloudflare 대시보드에서 CNAME으로 등록되며, **wildcard CNAME은 Free 플랜에서 Cloudflare가 SSL 발급을 보장하지 않는다** (Universal SSL은 wildcard 미지원, Advanced Certificate Manager 유료 플랜 $10/월 필요).
- 즉 `*.api.stylelucky4u.com` 같은 와일드카드 hostname을 도입하려면 Cloudflare 유료 플랜 또는 별도 Origin Certificate 운영이 필요. **1인 운영 비용 정책상 옵션 B는 실질적으로 차단됨.**

### 1.4 결정 범위 (in scope)

- 컨슈머 → 양평 서버 HTTP 요청의 tenant scope 결정 메커니즘
- API key 발급 시 tenantId 바인딩 + 검증 시 cross-tenant 차단
- `withAuth`/`withRole` 가드와의 통합 방식 (확장 vs 신규 가드)
- 기존 `/api/v1/*` 라우트의 마이그레이션 경로

### 1.5 결정 범위 외 (out of scope, 다른 ADR)

- 데이터 격리 모델(schema-per-tenant vs RLS) — **ADR-023**
- Plugin/도메인 코드 격리 — **ADR-024**
- 인스턴스 모델 — **ADR-025**
- Tenant Manifest 스키마 — **ADR-026**
- Cron Worker per-tenant lock key — **ADR-028**
- Per-tenant audit/metrics — **ADR-029**

---

## 2. Router 패턴 옵션

### 2.1 옵션 A — URL path 기반 (`/api/v1/t/<tenant>/contents`)

**구현 형태**:
```
src/app/api/v1/t/[tenant]/[...path]/route.ts
```
- Next.js dynamic catch-all route
- Handler에서 `params.tenant` 추출 → Tenant Manifest(ADR-026) 조회 → 실제 핸들러 dispatch
- 또는 명시적 라우트 트리: `src/app/api/v1/t/[tenant]/contents/route.ts`, `.../api-keys/route.ts` 등

**예시 컨슈머 호출**:
```http
GET /api/v1/t/almanac/contents?limit=20
Authorization: Bearer pub_alm_a1b2c3d4...
```

**장점**:
- ✅ **명시성 최고** — URL만 보고 어느 tenant인지 즉시 식별 가능 (Cloudflare Analytics, Pino 로그, `pm2 logs` 모두에서 1초 내 파악)
- ✅ **디버깅 용이** — `curl https://stylelucky4u.com/api/v1/t/almanac/health` 로 특정 tenant 건강성 확인
- ✅ **라우팅 충돌 없음** — Next.js dynamic route + tenant prefix로 정적 분리, framework 레벨에서 conflict 없음
- ✅ **Cloudflare Tunnel 무수정** — 기존 `stylelucky4u.com → localhost:3000` 단일 ingress 그대로 사용
- ✅ **점진적 마이그레이션** — 기존 `/api/v1/*` 유지하면서 신규 tenant부터 `/api/v1/t/<tenant>/*` 추가 가능
- ✅ **테스트/Mocking** — path만 바꾸면 다른 tenant 흉내, e2e 테스트 작성 단순

**단점**:
- △ 모든 컨슈머 URL이 `/t/<tenant>/` prefix 가짐 → 컨슈머 코드 1회 마이그레이션 필요
- △ Tenant 이름 변경 시 URL 변경 → 컨슈머 영향 (단, slug는 immutable로 ADR-026에서 고정 가능)
- △ Almanac spec(`/api/v1/almanac/contents` 가정)과 충돌 → §6.2 spec 영향 분석 참조

---

### 2.2 옵션 B — 서브도메인 기반 (`almanac.api.stylelucky4u.com/v1/contents`)

**구현 형태**:
```
Cloudflare Tunnel 또는 reverse proxy에서 host header → tenant 식별
미들웨어 또는 라우트 핸들러에서 req.headers.host 파싱
```

**예시 컨슈머 호출**:
```http
GET https://almanac.api.stylelucky4u.com/v1/contents?limit=20
Host: almanac.api.stylelucky4u.com
Authorization: Bearer pub_alm_a1b2c3d4...
```

**장점**:
- ✅ 깔끔한 URL — tenant마다 독립적 도메인
- ✅ 컨슈머별 CORS/CSP 정책을 tenant 도메인별 설정 가능
- ✅ 향후 tenant를 별도 서버로 분리 시 DNS만 수정하면 됨

**단점**:
- ❌ **Cloudflare Tunnel single hostname 제약 치명적**:
  - Tunnel ingress는 각 hostname마다 1행 추가 필요 (10~20 tenant = 10~20행)
  - Wildcard CNAME(`*.api.stylelucky4u.com`)은 Cloudflare Free 플랜에서 Universal SSL 미발급 → tenant 추가 시마다 수동 CNAME + 인증서 검증 필요
  - Advanced Certificate Manager $10/월 (1인 운영 비용 정책 위반)
- ❌ Tenant 추가 시 DNS 작업 + Cloudflare 대시보드 클릭 + Tunnel config 수정 + cloudflared 재시작 → 30~40초 propagation lag (§11.3 인용) → 1인 운영 마찰
- ❌ Local 개발 시 `/etc/hosts` 또는 `dnsmasq` 설정 필요 → 협업 비용
- ❌ Cloudflare Tunnel을 PM2로 관리하므로 ingress 변경 시 `pm2 restart cloudflared` 필요 → 30~40초 다운타임 위험
- ❌ Test 시나리오: `almanac.api.stylelucky4u.com.local` 같은 host 트릭 필요

**판정**: **사실상 불가능**. 1인 운영 비용/마찰 정책 + Cloudflare Free 플랜 제약 기준.

---

### 2.3 옵션 C — JWT/API key 기반 라우팅 (URL은 동일)

**구현 형태**:
```
URL: /api/v1/contents (path는 모든 tenant 공통)
인증: Authorization: Bearer <token> — 토큰의 tenant_id 클레임으로 tenant 결정
핸들러: WHERE tenantId = req.user.tenantId 자동 필터
```

**장점**:
- ✅ 기존 `/api/v1/*` 라우트 호환 — URL 변경 없음
- ✅ 컨슈머 코드 마이그레이션 부담 0

**단점**:
- ❌ **같은 path가 tenant마다 다른 동작** → 디버깅 시 "어느 tenant 요청인지" 로그를 깊이 파야 식별 가능
- ❌ Cloudflare Analytics에서 path별 통계는 모든 tenant 합산 → tenant별 트래픽 분리 불가
- ❌ **인증 실패 시 tenant 식별 자체 불가** → 401 에러 로그에서 어느 tenant가 영향받는지 알 수 없음
- ❌ Anonymous 라우트(예: 로그인 전 health check) 구현 시 tenant 결정 메커니즘 별도 필요
- ❌ 라우트 정의 충돌 위험 — 동일 path가 tenant별로 다른 비즈니스 로직 가질 경우 if/else hell
- ❌ External API 통합 시 컨슈머가 항상 인증 토큰을 가지고 있어야 함 (webhook, public RSS 등 anonymous 시나리오 차단)

**판정**: **부적합**. 단일 사용자 SaaS에는 좋지만, BaaS-style 다중 컨슈머 + 다중 tenant 환경에서는 디버깅 비용이 폭증.

---

### 2.4 옵션 D — Header 기반 (`X-Tenant-Id: almanac`)

**구현 형태**:
```http
GET /api/v1/contents
X-Tenant-Id: almanac
Authorization: Bearer pub_alm_a1b2c3d4...
```

**장점**:
- ✅ 단순 — middleware에서 헤더 1줄 읽기

**단점**:
- ❌ **잘못 설정 시 cross-tenant 호출** → 컨슈머 SDK 버그가 곧 보안 침해
- ❌ 비표준 — `X-` 접두사는 RFC 6648에서 deprecated 권장
- ❌ Browser fetch에서 CORS preflight 추가 (커스텀 헤더 → preflight OPTIONS 요청 발생)
- ❌ URL 만으로 tenant 식별 불가 → 옵션 C와 동일한 디버깅 문제
- ❌ `curl` 테스트 시 `-H "X-Tenant-Id: ..."` 매번 추가 필요

**판정**: **부적합**. Header는 path/subdomain의 보조 수단으로만 가치 있음 (예: tenant 식별용은 path, 환경 식별용은 header).

---

### 2.5 비교 매트릭스

| 차원 | A (path) | B (subdomain) | C (JWT/key) | D (header) |
|------|----------|---------------|-------------|------------|
| **명시성** (URL만 보고 tenant 식별) | ✅ 즉시 | ✅ 즉시 | ❌ 불가 | △ 헤더 검사 필요 |
| **Cloudflare Tunnel 호환** (현재 single ingress) | ✅ 무수정 | ❌ 와일드카드 cert 필요 (유료) | ✅ 무수정 | ✅ 무수정 |
| **URL 깔끔함** | △ `/t/<tenant>/` prefix | ✅ subdomain | ✅ 동일 path | ✅ 동일 path |
| **라우팅 충돌 위험** | 저 (framework dispatch) | 저 (DNS 분리) | 고 (path overload) | 중 (조건부 dispatch) |
| **디버깅** (로그/Analytics) | ✅ path별 분리 | ✅ host별 분리 | △ 토큰 디코딩 필요 | △ 헤더 파싱 필요 |
| **익명 요청 지원** (health, RSS) | ✅ path로 식별 | ✅ host로 식별 | ❌ 토큰 없음 | △ 헤더 강제 필요 |
| **점진적 마이그레이션** | ✅ 기존 라우트와 공존 | ❌ DNS 작업 필요 | ❌ 핸들러 일괄 수정 | △ 조건 분기 추가 |
| **테스트/Mocking** | ✅ path만 변경 | △ host trick 필요 | ❌ 토큰 위조 필요 | △ 헤더 변경 |
| **1인 운영 적합** (마찰 비용) | ✅ 코드만 | ❌ DNS+cert+restart | △ 디버깅 비용 | △ SDK 일관성 비용 |
| **컨슈머 SDK 단순성** | ✅ baseURL에 prefix | ✅ baseURL에 host | ✅ 변경 없음 | △ 헤더 강제 |
| **CVE/보안 위험** | 저 | 저 | 중 (토큰 누수 = tenant 누수) | 중 (헤더 위조) |
| **종합 점수** (1~5) | **4.5** | 2.0 | 2.5 | 2.0 |

---

## 3. API Key 매칭 옵션

### 3.1 옵션 K1 — Prefix가 tenant 식별자 포함 (`pub_alm_xxx`)

**키 형식**:
```
pub_<tenant_slug>_<random>     예: pub_alm_a1b2c3d4e5f6...
srv_<tenant_slug>_<random>     예: srv_alm_z9y8x7w6v5u4...
```

- 발급 시 tenant slug를 키 prefix에 박음
- 검증 시 키 자체에서 tenant 추론 가능

**장점**:
- ✅ DB 조회 없이 키 첫 조각만으로 tenant 후보 추출 가능 (캐시 키 설계 단순화)
- ✅ 운영자가 키 문자열만 보고 어느 tenant 키인지 즉시 식별

**단점**:
- ❌ 키 prefix 변경 = 키 전체 변경 → tenant slug 변경 시 모든 키 재발급 필요
- ❌ Prefix만 신뢰하면 위변조 위험 (단독 사용 시) → 반드시 DB 검증 필요

---

### 3.2 옵션 K2 — ApiKey 테이블에 tenantId FK 컬럼

**스키마**:
```prisma
model ApiKey {
  id          String   @id
  prefix      String   @unique
  hash        String
  ownerId     String
  tenantId    String   // 신규
  scope       Scope
  // ...
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
}
```

- 키 발급 시 명시적 `tenantId` 지정 (UI에서 tenant 선택)
- 검증 시 `prisma.apiKey.findUnique({ where: { prefix } })` → `key.tenantId` 추출

**장점**:
- ✅ DB가 단일 진실 소스 — prefix는 단순 식별자, tenant는 FK
- ✅ Tenant slug 변경에 키 영향 없음
- ✅ 표준 RDBMS 모델, ORM 친화

**단점**:
- ❌ 검증 시 항상 DB 조회 (단, Drizzle/Prisma 캐시로 완화 가능)
- ❌ 키 문자열만 보고 tenant 식별 불가 (운영자 디버깅 비용 ↑)

---

### 3.3 옵션 K3 — 둘 다 (prefix 추론 + DB FK + cross-validation)

**스키마**: K2와 동일

**키 형식**: K1과 동일 (`pub_<tenant_slug>_<random>`)

**검증 로직**:
```typescript
async function verifyApiKey(rawKey: string, pathTenant: string) {
  // 1. Prefix 파싱
  const match = rawKey.match(/^(pub|srv)_([a-z0-9]+)_(.+)$/);
  if (!match) return { ok: false, reason: "INVALID_FORMAT" };
  const [, scope, prefixTenantSlug, secret] = match;

  // 2. DB 조회 (prefix 단위로 캐시 가능)
  const dbKey = await prisma.apiKey.findUnique({
    where: { prefix: `${scope}_${prefixTenantSlug}_${secret.slice(0, 8)}` },
    include: { tenant: true },
  });
  if (!dbKey) return { ok: false, reason: "NOT_FOUND" };

  // 3. Hash 검증 (argon2id)
  if (!(await argon2.verify(dbKey.hash, rawKey))) {
    return { ok: false, reason: "INVALID_HASH" };
  }

  // 4. Cross-validation 1: prefix slug == DB tenant slug
  if (dbKey.tenant.slug !== prefixTenantSlug) {
    // 키 위변조 감지 (DB와 prefix 불일치)
    await audit.log({ event: "key_prefix_mismatch", keyId: dbKey.id });
    return { ok: false, reason: "TENANT_MISMATCH_INTERNAL" };
  }

  // 5. Cross-validation 2: path tenant == DB tenant slug
  if (dbKey.tenant.slug !== pathTenant) {
    // Cross-tenant 침범 시도 차단
    await audit.log({
      event: "cross_tenant_attempt",
      keyId: dbKey.id,
      keyTenant: dbKey.tenant.slug,
      pathTenant,
    });
    return { ok: false, reason: "CROSS_TENANT_FORBIDDEN" };
  }

  return { ok: true, key: dbKey, tenant: dbKey.tenant };
}
```

**장점**:
- ✅ **3중 방어** — 공격자가 침범하려면 (a) prefix 위조 + (b) DB FK 위조 + (c) hash 위조를 동시에 성공해야 함 → 사실상 불가능
- ✅ 운영자 디버깅 — prefix만 보고 tenant 식별 (K1 장점)
- ✅ Tenant slug 변경 시 영향 — slug immutable로 ADR-026에서 고정하면 0
- ✅ **Audit log fingerprint** — prefix mismatch / cross-tenant 시도가 발생하면 즉시 감사 로그 + Slack 알람 (ADR-021 audit fail-soft 인프라 재활용)
- ✅ 캐시 효율 — prefix만 캐시 키로 사용 가능 (full key는 캐시하지 않음)

**단점**:
- △ 검증 로직 복잡도 ↑ (단, 5단계 중 4~5번은 단순 문자열 비교, 성능 영향 미미)
- △ 키 문자열에 tenant slug가 노출됨 → tenant slug가 비밀이어야 한다면 부적합 (단, slug는 운영자 식별자, 비밀이 아님)

---

### 3.4 K1/K2/K3 비교

| 차원 | K1 (prefix only) | K2 (DB FK only) | K3 (둘 다) |
|------|------------------|-----------------|-----------|
| **운영자 디버깅** | ✅ | ❌ | ✅ |
| **DB 조회 필요** | ❌ (prefix만으로 cache) | ✅ | ✅ |
| **Tenant slug 변경 영향** | 키 전체 재발급 | 영향 0 | slug immutable이면 0 |
| **Cross-tenant 침범 차단** | △ (DB 검증 필수) | ✅ | ✅✅ (3중) |
| **Audit fingerprint** | △ | ✅ | ✅✅ |
| **구현 복잡도** | 저 | 중 | 중-고 |
| **종합** | 2.5 | 3.5 | **4.5** |

---

## 4. 권고안

### 4.1 결정 (PROPOSED)

| 항목 | 결정 |
|------|------|
| Router 패턴 | **옵션 A — URL path 기반 `/api/v1/t/<tenant>/...`** |
| API Key 매칭 | **옵션 K3 — prefix(`pub_<slug>_<rand>`) + DB FK(tenantId) + cross-validation** |
| 가드 통합 | **`withTenant()` 신규 가드 추가** (기존 `withAuth`/`withRole`은 무수정) |
| 마이그레이션 | **점진적** — 기존 `/api/v1/*` 유지, 신규 라우트는 `/api/v1/t/<tenant>/*`에 작성 |

### 4.2 권고 근거

1. **Cloudflare Tunnel single hostname 제약** — 옵션 B 사실상 불가, A가 인프라 무수정 채택 가능한 유일 옵션
2. **1인 운영 + 10~20 tenant 규모** — 디버깅·로깅·DNS 마찰 비용을 최소화하는 path 기반이 최적
3. **K3의 3중 방어** — 보안 경계가 가장 두꺼우면서도 구현·성능 비용은 K2 대비 미미
4. **점진적 마이그레이션 가능** — 기존 라우트 파괴 없이 신규 tenant부터 적용, ADR-022~029 전체 wave를 점진 진행 가능

---

## 5. 가드 통합 — `withTenant()` 신규 추가

### 5.1 현재 `withAuth`/`withRole` 구조 (참조)

`src/lib/api-guard.ts` 인용:
```typescript
export function withAuth(handler: AuthenticatedHandler) {
  return async (request, context) => {
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      const payload = await verifyAccessToken(bearerToken);
      if (payload) return runHandler(handler, request, payload, context);
      return errorResponse("INVALID_TOKEN", ..., 401);
    }
    const cookieUser = await resolveCookieSession();
    if (cookieUser) return runHandler(handler, request, cookieUser, context);
    return errorResponse("UNAUTHORIZED", ..., 401);
  };
}

export function withRole(roles: Role[], handler: AuthenticatedHandler) {
  return withAuth(async (request, user, context) => {
    if (!roles.includes(user.role)) return errorResponse("FORBIDDEN", ..., 403);
    return handler(request, user, context);
  });
}
```

### 5.2 `withTenant()` 설계 (제안)

**원칙**: 기존 가드 시그니처를 변경하지 않고, tenant scope이 필요한 라우트에만 추가 가드로 감싼다.

```typescript
// src/lib/api-guard-tenant.ts (신규)
import { type AuthenticatedHandler, withAuth } from "./api-guard";
import { errorResponse } from "./api-response";
import { resolveTenantFromPath, verifyApiKeyForTenant } from "./tenant-router";
import { audit } from "./audit-log";

export type TenantAuthenticatedHandler = (
  request: NextRequest,
  user: AccessTokenPayload,
  tenant: ResolvedTenant,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

export function withTenant(handler: TenantAuthenticatedHandler) {
  return withAuth(async (request, user, context) => {
    // 1. URL path에서 tenant slug 추출
    const params = await context?.params;
    const pathTenantSlug = params?.tenant;
    if (!pathTenantSlug) {
      return errorResponse("TENANT_MISSING", "tenant param 필요", 400);
    }

    // 2. Tenant Manifest 조회 (ADR-026)
    const tenant = await resolveTenantFromPath(pathTenantSlug);
    if (!tenant) {
      return errorResponse("TENANT_NOT_FOUND", `${pathTenantSlug} 미등록`, 404);
    }
    if (!tenant.active) {
      return errorResponse("TENANT_DISABLED", `${pathTenantSlug} 비활성`, 410);
    }

    // 3. 인증 경로별 cross-validation
    const bearerToken = extractBearerToken(request);
    if (bearerToken && bearerToken.startsWith("pub_") || bearerToken?.startsWith("srv_")) {
      // API key 경로 — K3 검증
      const result = await verifyApiKeyForTenant(bearerToken, tenant.slug);
      if (!result.ok) {
        if (result.reason === "CROSS_TENANT_FORBIDDEN") {
          await audit.log({
            event: "cross_tenant_attempt",
            pathTenant: tenant.slug,
            user: user.email,
          });
          return errorResponse("FORBIDDEN", "cross-tenant 차단", 403);
        }
        return errorResponse(result.reason, "API key 검증 실패", 401);
      }
    } else {
      // 쿠키/JWT 경로 — Membership 검증 (ADR-026 §3 멤버십)
      const membership = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.sub } },
      });
      if (!membership) {
        return errorResponse("FORBIDDEN", "tenant 멤버 아님", 403);
      }
    }

    return handler(request, user, tenant, context);
  });
}

export function withTenantRole(
  roles: Role[],
  handler: TenantAuthenticatedHandler
) {
  return withTenant(async (request, user, tenant, context) => {
    if (!roles.includes(user.role)) {
      return errorResponse("FORBIDDEN", "권한 부족", 403);
    }
    return handler(request, user, tenant, context);
  });
}
```

### 5.3 라우트 적용 예시

```typescript
// src/app/api/v1/t/[tenant]/contents/route.ts
import { withTenant } from "@/lib/api-guard-tenant";

export const GET = withTenant(async (request, user, tenant) => {
  const items = await prisma.content.findMany({
    where: { tenantId: tenant.id },
    take: 20,
  });
  return Response.json({ items, tenant: tenant.slug });
});
```

### 5.4 기존 가드와의 호환성

| 라우트 그룹 | 가드 | tenant 인식 |
|------------|------|------------|
| `/api/v1/auth/login` (글로벌 운영자 로그인) | `withAuth` (무수정) | ❌ 글로벌 |
| `/api/v1/api-keys/*` (글로벌 운영자 키 관리 UI) | `withRole(["ADMIN"])` (무수정) | ❌ 글로벌 |
| `/api/v1/t/<tenant>/contents` (BaaS 컨슈머) | `withTenant` (신규) | ✅ tenant scope |
| `/api/v1/t/<tenant>/admin/keys` (tenant 운영자) | `withTenantRole(["ADMIN"])` (신규) | ✅ tenant scope |
| `/api/v1/health` (글로벌 헬스체크) | 가드 없음 | ❌ 글로벌 |

→ 기존 글로벌 운영자 UI는 그대로, 컨슈머 BaaS 라우트는 `withTenant`로 분리. **2 가드 시스템 공존** 모델.

---

## 6. 마이그레이션 전략

### 6.1 점진적 전환 (권장)

| 단계 | 기간 | 작업 |
|------|------|------|
| **Phase 0** | 0주 | ADR-027 결정 + Tenant 모델 신규 (ADR-026) |
| **Phase 1** | 1주 | `withTenant()` 가드 + `tenant-router.ts` 구현 + 첫 tenant `almanac` 등록 |
| **Phase 2** | 2~3주 | `/api/v1/t/almanac/contents` 등 신규 라우트 트리 작성 (기존 `/api/v1/contents`와 병행) |
| **Phase 3** | 1주 | Almanac 컨슈머 SDK base URL 변경 (`/api/v1/` → `/api/v1/t/almanac/`) |
| **Phase 4** | 2주 | 기존 `/api/v1/*` 라우트에 deprecation header (`Sunset: <date>`) 추가, 6개월 grace |
| **Phase 5** | 1주 | 두 번째 tenant `recipe` 추가 (Phase 1~3 반복) |
| **Phase 6** | 1~2주 | grace 만료 후 글로벌 라우트 제거 또는 `default` tenant로 흡수 |

### 6.2 Almanac spec 영향 분석

**현재 spec(가정)**: `/api/v1/almanac/contents`

**ADR-027 옵션 A 결정 시**: `/api/v1/t/almanac/contents`

**충돌 검토**:
| 측면 | 현재 spec | 본 ADR 결정 | 마찰 |
|------|----------|-----------|------|
| URL prefix | `/api/v1/almanac/` | `/api/v1/t/almanac/` | △ `/t/` 2글자 추가 |
| 컨슈머 SDK base URL | `https://stylelucky4u.com/api/v1/almanac/` | `https://stylelucky4u.com/api/v1/t/almanac/` | △ baseURL 1회 변경 |
| 라우트 트리 | `src/app/api/v1/almanac/...` | `src/app/api/v1/t/[tenant]/...` | △ 디렉토리 이동 |
| API key 형식 | (미정) | `pub_alm_<rand>` | (영향 없음, 신규 정의) |

**권고**:
1. Almanac spec 작업자에게 본 ADR 공유 → `/api/v1/t/almanac/...` 패턴 채택 권장
2. 만약 spec이 이미 `/api/v1/almanac/`로 동결됐다면:
   - 옵션 1: spec 수정 (가장 깨끗, 권고)
   - 옵션 2: `src/app/api/v1/almanac/[...path]/route.ts`에 thin proxy → `/api/v1/t/almanac/`로 internal redirect (운영 복잡도 ↑)
3. 결정 보류 시: §10 결정 보류 사유에 명시

### 6.3 빅뱅 마이그레이션 (비권장)

기존 `/api/v1/*`를 한 번에 `/api/v1/t/<tenant>/*`로 전환:
- ❌ 모든 컨슈머 SDK 동시 업데이트 필요 → 다운타임 또는 호환성 깨짐
- ❌ ADR-022~029의 점진적 wave 정책과 상충
- → **비권장**

---

## 7. Cross-tenant 침범 차단 시나리오 분석

### 7.1 공격 시나리오 → 차단 메커니즘

| # | 공격 시도 | 차단 메커니즘 | 차단 위치 |
|---|----------|--------------|----------|
| 1 | tenant_almanac 키로 `/api/v1/t/recipe/contents` 호출 | K3 §3.3 step 5: prefix slug=alm, path=recipe → `CROSS_TENANT_FORBIDDEN` 403 | `withTenant` 가드 |
| 2 | tenant slug 위조 (`pub_recipe_<almanac의 random>`) | K3 step 2: DB lookup으로 prefix unique 위반 → `NOT_FOUND` 401 | `verifyApiKey` |
| 3 | API key hash 위조 | argon2.verify 실패 → `INVALID_HASH` 401 | `verifyApiKey` |
| 4 | path tenant 정상이지만 키 발급 시 tenantId 위조 (DB 직접 INSERT) | K3 step 4: prefix slug != DB tenant slug → `TENANT_MISMATCH_INTERNAL` + audit alert | `verifyApiKey` |
| 5 | 정상 키로 `WHERE tenantId = ?` 누락된 raw SQL 실행 | ADR-023 (RLS) 또는 핸들러에서 자동 tenantId 주입 | data layer |
| 6 | Bearer 없이 직접 호출 (anonymous cross-tenant) | `withTenant` → `withAuth` → `UNAUTHORIZED` 401 | `withAuth` |
| 7 | 쿠키 세션으로 멤버 아닌 tenant 호출 | `withTenant` step 3 cookie path: `tenantMembership` 조회 실패 → `FORBIDDEN` 403 | `withTenant` |

### 7.2 audit log 통합 (ADR-021 인프라 재활용)

ADR-021 §amendment-1의 `audit-failure` 카운터 메트릭을 다음 이벤트로 확장:
- `cross_tenant_attempt` — 시도 횟수 카운트 → 1분당 5회 이상이면 Slack 알람
- `key_prefix_mismatch` — 위변조 의심, 즉시 Slack 알람
- `tenant_membership_missing` — 권한 누락 (운영 실수일 수 있음)

→ 기존 audit-log fail-soft 11개 콜사이트에 3개 신규 추가 (총 14개).

---

## 8. NFR 영향 분석

### 8.1 성능

| 메트릭 | 현재 (단일 tenant) | ADR-027 적용 후 | 영향 |
|--------|-------------------|----------------|------|
| API key 검증 p95 | argon2.verify ~10ms (SP-011) | argon2 + DB FK lookup ~12ms | +20% (캐시 hit 시 +0%) |
| 라우트 dispatch | Next.js direct match | dynamic [tenant] catch | +0.1ms (negligible) |
| Cross-validation 비용 | N/A | 문자열 비교 2회 ~1μs | negligible |

→ **성능 영향 거의 없음**. 캐시 hit률 99% 가정 시(SP-014) 추가 비용은 캐시 miss 1%에서만 발생.

### 8.2 운영 복잡도

| 측면 | 영향 |
|------|------|
| Cloudflare Tunnel config | **변경 없음** (옵션 A 채택) |
| DNS | **변경 없음** |
| PM2 ecosystem | **변경 없음** |
| 로그 분석 | **개선** (path별 tenant 분리) |
| 디버깅 | **개선** (URL만 보고 식별) |
| 신규 tenant 추가 | DB INSERT 1행 + Tenant Manifest 등록 (ADR-026) |

### 8.3 보안

| 측면 | 영향 |
|------|------|
| Cross-tenant 침범 | **3중 방어** (prefix + FK + cross-validation) |
| Key 누수 영향 범위 | tenant scope으로 제한 (전체 시스템 침해 X) |
| Audit fingerprint | **개선** (cross_tenant_attempt 등 신규 이벤트) |

---

## 9. 위험 / 미해결 / 후속 작업

### 9.1 위험 (R)

| ID | 위험 | 심각도 | 대응 |
|----|------|-------|------|
| R-1 | Almanac spec 충돌 (`/api/v1/almanac/` vs `/api/v1/t/almanac/`) | 중 | spec 작업자와 협의 필수 (§6.2) |
| R-2 | tenant slug 변경 시 prefix 재발급 부담 | 저 | ADR-026에서 slug immutable 명시 권장 |
| R-3 | dynamic catch-all `[tenant]` 라우트가 정적 라우트와 충돌 | 저 | `/api/v1/t/` prefix로 격리, 정적 라우트는 `/api/v1/` 직속에만 |
| R-4 | `withTenant`/`withAuth` 2 가드 시스템 공존이 신규 개발자에게 혼란 | 중 | docs/rules/coding-stacks/typescript-react.md에 가드 선택 가이드 추가 |
| R-5 | API key 누수 시 tenant 운영자가 모를 수 있음 | 중 | Tenant 운영자 대시보드에 "최근 키 사용 IP" 표시 (별도 기능) |

### 9.2 미해결 (Open Questions)

1. **Q-1**: 글로벌 운영자(김도영)가 모든 tenant 데이터에 접근 가능해야 하나? → ADR-026 §멤버십 모델에서 결정 (`super_admin` role)
2. **Q-2**: tenant 간 데이터 공유 시나리오(예: almanac → recipe로 data export)는? → out of scope, ADR-024 (plugin) 또는 별도 ADR
3. **Q-3**: `/api/v1/t/<tenant>/auth/login`이 가능한가? (tenant별 사용자 회원가입) → ADR-026 §사용자 모델에서 결정
4. **Q-4**: API key 발급 UI 위치는? — 글로벌 대시보드(현재 `/api-keys/`) 유지 vs tenant 별 대시보드 신설 → ADR-026 후속
5. **Q-5**: Bearer 토큰이 `pub_`/`srv_` prefix가 아닌 일반 JWT일 때, JWT 클레임의 tenant_id를 어떻게 처리? → §5.2 cookie 경로와 동일하게 membership 검증

### 9.3 후속 작업 (Spike/구현)

| ID | 작업 | 예상 공수 | 우선순위 |
|----|------|---------|---------|
| F-1 | `withTenant()` 가드 구현 + 단위 테스트 | 4h | 높음 |
| F-2 | `tenant-router.ts` (resolve + verifyApiKeyForTenant) 구현 | 6h | 높음 |
| F-3 | `prisma/schema.prisma`에 ApiKey.tenantId FK 추가 (ADR-026 의존) | 2h | 높음 |
| F-4 | Almanac spec 작업자와 `/api/v1/t/<tenant>/...` 적용 협의 | 2h | 즉시 |
| F-5 | 첫 tenant 라우트 트리 (`almanac/contents`) 작성 + e2e 테스트 | 8h | 중 |
| F-6 | docs/rules/coding-stacks/typescript-react.md에 가드 선택 가이드 추가 | 2h | 중 |
| F-7 | Audit log에 `cross_tenant_attempt` 등 3개 이벤트 추가 (ADR-021 fail-soft 적용) | 3h | 중 |
| F-8 | 컨슈머 SDK 마이그레이션 가이드 작성 | 4h | 낮음 (Phase 3) |

---

## 10. 결정 (Decision)

| 항목 | 결정 내용 |
|------|----------|
| Router 패턴 | **ACCEPTED** — 옵션 A (URL path `/api/v1/t/<tenant>/...`) |
| API Key 매칭 | **ACCEPTED** — 옵션 K3 (prefix + DB FK + cross-validation) |
| 가드 구조 | **ACCEPTED** — `withTenant()` 신규, `withAuth`/`withRole` 무수정 공존 |
| 마이그레이션 | **ACCEPTED** — 점진적 (Phase 0~6, 약 8~10주) |
| Almanac spec 충돌 처리 | **ACCEPTED** — **v1.0 출시 후 마이그레이션** (Almanac은 spec 그대로 출시, 출시 후 `/api/v1/almanac/*` → `/api/v1/t/almanac/*` 재구조) |

### 결정 (2026-04-26 세션 58)

사용자 권고 채택. 단, **Almanac spec 충돌 처리는 옵션 A (출시 후 마이그레이션)**으로 결정 — 현재 spec/aggregator-fixes 브랜치 작업 무중단, 출시 게이트 통과 후 plugin 재구조화.

**다음 액션**:
- Phase 1에서 `withTenant()` 가드 + 라우트 catch-all 구현
- Phase 2 plugin system 가동 시 Almanac을 packages/tenant-almanac/으로 재구조화

### 10.1 결정 보류 사유

본 ADR은 ADR-022~029 wave 전체의 일부이므로 단독 확정이 아닌 wave 동시 결정 권장:
- ADR-026 (Tenant Manifest)에서 `tenant.slug` 필드 immutable 여부 → 본 ADR K3 동작에 영향
- ADR-023 (데이터 격리)에서 RLS vs schema-per-tenant → 본 ADR 옵션 A의 핸들러 내부 WHERE 절 자동 주입 방식에 영향
- Almanac spec 작업자와 협의 필요 (§6.2)

---

## 11. 참조

### 11.1 인용 문서

- [00-context/01-existing-decisions-audit.md](../00-context/01-existing-decisions-audit.md) — Wave/Spike 결정 + 멀티테넌트 전환 영향 분석
- [00-context/02-current-code-audit.md](../00-context/02-current-code-audit.md) — 현재 코드의 단일테넌트 가정 매핑 (~30개 파일)
- [04-integration/02-cloudflare-deployment-integration.md](../../2026-04-supabase-parity/04-integration/02-cloudflare-deployment-integration.md) §1.1, §2.1, §4.3 — Cloudflare Tunnel 제약
- ADR-001 (멀티테넌시 의도적 제외 — supersede 대상)
- ADR-021 (감사 fail-soft — `cross_tenant_attempt` 이벤트 통합)
- SP-011 (argon2id — API key 검증 성능 근거)
- SP-014 (JWKS 캐시 — 캐시 hit 99% 근거)

### 11.2 인용 코드

- `src/lib/api-guard.ts` (전문) — `withAuth`/`withRole` 현재 구조
- `src/lib/auth.ts` (전문) — `DashboardSessionPayload`, `getSessionFromCookies`
- `src/lib/auth/keys.ts:72~94` — `verifyApiKey` 현재 구조 (참조: 02-current-code-audit §2.2)

### 11.3 관련 ADR (cross-link)

- **ADR-022** (정체성 재정의) — N=10~20 tenant 운영 정체성 확정
- **ADR-023** (데이터 격리) — RLS/schema/DB-per-tenant 결정 → 본 ADR 핸들러 WHERE 절 자동 주입에 영향
- **ADR-024** (Plugin 코드 격리) — Edge Functions 화이트리스트의 tenant scope
- **ADR-025** (인스턴스 모델) — 단일 vs Tier — 본 ADR은 단일 인스턴스 가정
- **ADR-026** (Tenant Manifest) — `Tenant` 모델 스키마 + `slug` immutable 여부
- **ADR-028** (Cron Worker per-tenant) — advisory lock key tenant 분리
- **ADR-029** (Per-tenant Observability) — audit/metrics tenant_id 차원

---

## 12. 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 0.1 | 2026-04-26 | sub-agent #6 (Opus 4.7 1M, baas-foundation Wave) | 초안 — Router 4 옵션 + Key 3 옵션 평가 + 권고 (PROPOSED) |

---

> **문서 끝**. ADR-027 PROPOSED — 결정 대기. ADR-022~029 wave 동시 확정 권장.
