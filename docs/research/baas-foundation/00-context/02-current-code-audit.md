# 02 — 현재 코드의 단일테넌트 가정 매핑

> 작성: 2026-04-26 (Explore sub-agent #2 산출물)
> 목적: 멀티테넌트 BaaS 전환 시 영향 받는 파일과 변경 지점을 식별.

---

## 1. 데이터 모델의 단일테넌트 가정

| 모델 | tenant_id | 소유권 | 단일테넌트 문제 |
|------|-----------|-------|-----------------|
| **User** | 없음 | 글로벌 user 레지스트리 (email 유니크) | 모든 사용자가 단일 테이블 공유. email이 가정적 분리 키 |
| **Folder/File** | 없음 | ownerId → User. parentId 트리 | (parentId, name, ownerId) 유니크. 테넌트 개념 부재 |
| **ApiKey** | 없음 | ownerId → User. prefix 유니크 | 발급 시 user.sub가 ownerId. 단일 사용자 = 단일 테넌트 가정 |
| **SqlQuery/EdgeFunction** | 없음 | ownerId 필드. scope = PRIVATE/SHARED/FAVORITE | 소유자가 곧 테넌트. 타테넌트 접근 차단 원칙 없음 |
| **CronJob** | 없음 | 소유자 필드 없음. name 유니크 | 모든 cron이 전역 레지스트리(globalThis). 테넌트 격리 불가 |
| **Webhook** | 없음 | 소유자 필드 없음 | cron과 동일 |
| **MfaEnrollment/WebAuthnAuthenticator** | 없음 | userId 1:1/1:N | 테넌트 경계 없음 |
| **Session** | 없음 | userId 인덱스. opaque tokenHash | 사용자에만 바인딩 |
| **JwksKey** | 없음 | 글로벌 싱글톤 (status=CURRENT 1개) | 모든 클라이언트가 동일 공개 키셋 |
| **RateLimitBucket** | 없음 | bucketKey ("scope:dimension:value") | 키가 IP/email 기준. 테넌트 차원 없음 |
| **SecretItem** | 없음 | name 유니크 (글로벌) | MFA_MASTER_KEY 등 환경 전역. 테넌트 분리 필요 시 (tenantId, name) 조합 |

**핵심 발견**: 모든 테이블이 ownerId/userId만으로 사용자 수준 분리. **테넌트(조직/워크스페이스) 계층이 완전히 부재**.

---

## 2. 인증 흐름의 단일테넌트 가정

### 2.1 JWT/JWKS 구조
```typescript
DashboardSessionPayload { sub, email, role, authenticated }
AccessTokenPayload      { sub, email, role, type: "access" }
```
- **aud (audience) 없음**: 모든 토큰이 동일 서버에만 유효
- **tenant/org 클레임 없음**
- **role은 사용자 글로벌 속성**: ADMIN은 모든 리소스 접근 가정

### 2.2 API Key 검증
`verifyApiKey()` (src/lib/auth/keys.ts:72~94):
- prefix → ApiKey 조회 → ownerId
- 호출자 sub === key.ownerId 면 인증 성공
- **테넌트 검증 없음**: 같은 테넌트 내 다른 사용자 키로 그 사용자 리소스 접근 가능

### 2.3 withAuth/withRole 가드
- **테넌트 인식 없음**: 글로벌 롤만 확인
- 쿠키 경로는 DB 재조회로 정확하지만, 테넌트 레이어 없음

---

## 3. 라우트 패턴

```
/api/v1/
  ├── auth/
  ├── api-keys/           ← user.sub의 키만 (ADMIN)
  ├── members/            ← 글로벌 User 테이블
  ├── functions/[id]/run  ← fn.ownerId === user.sub
  ├── sql/execute         ← ADMIN/MANAGER, read-only PG 롤
  ├── cron/[id]/run       ← ADMIN
  └── (기타)              ← 모두 /api/v1/* 패턴
```
**문제**: 라우트가 user.sub 글로벌 identity 가정. 다중테넌트에선 `/api/v1/t/<tenant>/...` 로 재구조 필요. 핸들러가 context에서 tenantId 추출 로직 부재.

---

## 4. Cron 실행 모델

`src/lib/cron/registry.ts`: `globalThis.__cronRegistry` 싱글톤. matchesSchedule() 분 단위 tick.
`src/lib/cron/runner.ts`: kind별(SQL/FUNCTION/WEBHOOK) 디스패치.

```typescript
async function tick() {
  for (const job of s.jobs.values()) {
    if (!matchesSchedule(job.schedule, now)) continue;
    void runJob(job);  // fire-and-forget
  }
}
```
- CronJob 테이블에 ownerId/tenantId 없음
- registry 전역: 모든 cron이 같은 프로세스/워커
- 격리 수준 없음: 한 job 오류가 전역 상태에 영향
- timeout: SQL 10초, FUNCTION 30초 하드코딩 (tenant별 정책 불가)

---

## 5. EdgeFunction/SQL Execute 제약

### EdgeFunction (src/app/api/v1/functions/[id]/run/route.ts)
```typescript
const ALLOWED_FETCH_HOSTS = ["api.github.com", "stylelucky4u.com"]; // 하드코딩

if (fn.ownerId !== user.sub) return 403;
await runIsolatedFunction(fn.code, {
  allowedFetchHosts: ALLOWED_FETCH_HOSTS,  // 모든 사용자 동일
  timeoutMs: 30_000
});
```
**문제**: 화이트리스트가 전역 상수. 테넌트/사용자별 정책 불가.

### SQL Execute (src/app/api/v1/sql/execute/route.ts)
```typescript
withRole(["ADMIN", "MANAGER"], async (request, user) => {
  checkDangerousSql(sql);   // 1차: 위험 키워드 차단
  await runReadonly(sql, [], { timeoutMs: 10_000 }); // 2차: PG app_readonly 롤
});
```
**문제**: ADMIN/MANAGER면 모든 테이블 스캔. 테넌트 필터 없음. timeout/row limit 하드코딩.

---

## 6. Audit/Rate Limit 차원

### Audit Log
```typescript
interface AuditEntry {
  timestamp, method, path, ip, status?, action?, detail?
}
```
- **user/tenant 차원 없음**: detail에 user.email 텍스트 저장. 쿼리 불가.
- 사용자/테넌트 FK 없음.

### Rate Limit
```typescript
buildBucketKey(scope, dimension, value) {
  return `${scope}:${dimension}:${value.toLowerCase()}`;
}
// 예: "v1Login:ip:1.2.3.4" / "v1Login:email:user@example.com"
```
- bucketKey가 이메일 기반이면 다중테넌트 시 모든 테넌트 사용자와 섞임
- tenant1 user@x.com과 tenant2 user@x.com이 같은 버킷 공유

---

## 7. 멀티테넌트 전환 시 영향 받는 파일 (~30개)

### Critical (반드시 수정)
| 파일 | 변경 |
|------|-----|
| **prisma/schema.prisma** | 모든 모델에 tenantId FK + Tenant 모델 신규 |
| **src/lib/auth.ts, jwt-v1.ts** | Payload에 tenantId/aud 추가 |
| **src/lib/api-guard.ts** | withAuth/withRole 내부에 tenantId 검증, withTenant() 신규 |
| **src/app/api/v1/** 모든 라우트 | `/api/v1/t/<tenant>/...` 또는 context에서 자동 추출 |
| **src/lib/cron/registry.ts** | globalThis 싱글톤 → Map<tenantId, RegistryState> |
| **src/lib/cron/runner.ts** | dispatchCron(job, tenantId). ALLOWED_FETCH → DB 정책 |
| **src/lib/rate-limit-db.ts** | buildBucketKey에 tenantId 차원 |

### High
- **src/lib/jwks/store.ts** — getSigningKey(tenantId?), JWKS endpoint 다중화
- **src/lib/auth/keys.ts** — verifyApiKey/issueApiKey에 tenantId
- **src/lib/runner/isolated.ts** — buildSafeFetch(tenantId) DB 정책 조회
- **src/lib/audit-log.ts, audit-log-db.ts** — userId, tenantId 필드
- **src/app/api/v1/auth/login** — 로그인 후 tenantId 결정 (다중 멤버십 시 선택)
- **src/app/api/v1/members/** — WHERE 절 tenantId 필터
- **src/app/api/v1/api-keys/** — 조회/발급 tenantId 필터
- **src/app/api/v1/functions/[id]/run/** — DB 정책, tenant 경계
- **src/app/api/v1/sql/execute/** — runReadonly 자동 tenant 필터
- **src/app/api/v1/cron/[id]/run/** — runNow(jobId, tenantId)

### Medium/Low
- **src/lib/sql/danger-check.ts** — 구조 미변경, 호출 시 tenantId 자동 필터
- **src/lib/pg/pool.ts** — runReadonly(sql, tenantId) 시그니처

---

## 8. spec/aggregator-fixes 브랜치 충돌 회피

현재 브랜치: `spec/aggregator-fixes`. git diff: `standalone/README.md`만 변경 중.

**충돌 위험 파일** (다른 터미널이 수정 중일 가능성):
- src/lib/cron/registry.ts (시스템 동작)
- src/lib/cron/runner.ts
- src/lib/pg/pool.ts (DB 자주 수정)

**권장**: cron 관련 수정은 spec/aggregator-fixes 머지 후 진행. ADR 문서 작성은 docs/research/baas-foundation/에만 새 파일 추가하므로 무충돌.

---

## 9. 추가 발견

### A. 글로벌 Role의 한계
Role enum (ADMIN/MANAGER/USER) 글로벌 적용. 다중테넌트에선 user.role=ADMIN이어도 다른 테넌트에선 권한 없을 수 있음. **테넌트별 멤버십 모델 필요** (User ⟷ Organization with Role).

### B. SecretItem 글로벌 키
MFA_MASTER_KEY, JWKS_ACTIVE_KID 등 환경 전역. 테넌트별 분리 시 (tenantId, name) 조합으로 재설계.

### C. JWKS 회전 복잡성
현재 getSigningKey() = "CURRENT" 1개. 다중테넌트 시:
- 테넌트별 고유 키셋 (격리 강, 운영 부담)
- 또는 모든 테넌트 동일 키 공유 (운영 단순, 격리 약)

### D. 대시보드/v1 API 인증 이원화
- 대시보드: 쿠키 (ES256 JWT)
- v1 API: Bearer (HS256) 또는 쿠키 fallback
- 다중테넌트: 쿠키에 tenantId, Bearer aud claim으로 테넌트 식별

---

**문서 신뢰도**: 코드 직접 읽기 100% (수정은 별도 터미널)
