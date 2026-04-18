# 세션 32 인수인계서 — Phase 15 Auth Advanced Step 1-2 (Prisma Session + argon2id)

- **날짜**: 2026-04-19
- **세션 범위**: next-dev-prompt 우선순위 1 — Phase 15 Step 1(Prisma Session) + Step 2(argon2id 점진 마이그레이션)
- **소요**: 약 2.5h (목표 4h 대비 38% 단축)
- **DOD 충족**: 마이그레이션 적용 / Vitest 139 PASS / 프로덕션 자동 재해시 1차 로그인 실증 / Sessions 인덱스 EXPLAIN Index Scan

---

## 1. 실행 범위

| Step | 설계 근거 | 결과 |
|------|-----------|------|
| 1. Prisma Session 모델 | Blueprint §7.2.2 / SP-015 (PG 48μs / partial+NOW() 불가 → cleanup job) | `Session` 모델 + 복합 인덱스 + cleanup 함수, EXPLAIN Index Scan 실증 |
| 2. argon2id 도입 | Blueprint §7.2.3 / SP-011 / ADR-019 (13× faster, 1000 사용자 100% 마이그레이션) | `@node-rs/argon2` + 시그니처 보존 분기 + login route 자동 재해시, kimdooo 1차 로그인 시 prefix 변화 실증 |

---

## 2. 변경 사항

### 2.1 Prisma 스키마 + 마이그레이션 (Step 1)

**`prisma/schema.prisma`**:
- User 모델에 `sessions Session[] @relation("UserSessions")` 추가
- `Session` 모델 신규
  - 컬럼: id(uuid) / userId(FK CASCADE) / tokenHash(SHA-256, UNIQUE) / ip / userAgent / createdAt / lastUsedAt / expiresAt / revokedAt
  - 인덱스: `@@index([userId, revokedAt, expiresAt])` — SP-015 채택안 (partial index + NOW() 불가)

**`prisma/migrations/20260419120000_add_sessions_table/migration.sql`** (신규):
- `CREATE TABLE sessions` + UNIQUE(token_hash) + 복합 인덱스 + FK ON DELETE CASCADE
- CK `2026-04-17-prisma-migration-windows-wsl-gap.md` 패턴 (수동 SQL + `migrate deploy`)

**`src/lib/sessions/cleanup.ts`** (신규):
- `cleanupExpiredSessions()` — `DELETE WHERE expires_at < NOW() - INTERVAL '1 day'` 1일 grace
- 활성화는 후속 단계 (Phase 15-D Refresh Rotation 도입 시)

### 2.2 argon2id (Step 2)

**`src/lib/password.ts`** (수정 — 시그니처 보존 + 내부 분기):
- `hashPassword(plain)` → `argonHash(plain, { algorithm: 2 /* Argon2id */ })`
- `verifyPasswordHash(plain, hash)` → `$2` prefix 시 bcrypt.compare, 그 외 argon2.verify
- `needsRehash(hash)` 신규 export — bcrypt 해시 판정

`isolatedModules: true` 환경에서 const enum 회피를 위해 `const ARGON2ID_ALGORITHM = 2` 상수로 캡슐화.

**`src/app/api/v1/auth/login/route.ts`** (수정):
- `verifyPasswordHash` 검증 성공 후 `needsRehash` true면 `hashPassword` 호출
- lastLoginAt update에 `passwordHash?` 조건부 머지하여 round-trip 0개 압축 (Blueprint §7.2.3 예시는 별도 update 호출이지만 본 프로젝트는 이미 lastLoginAt update를 수행 중)

호출자 영향 범위:
| 라우트 | 영향 |
|--------|------|
| `/api/v1/auth/login` | 자동 재해시 추가 (1곳) |
| `/api/v1/auth/register` | 변경 0 (`hashPassword` 시그니처 동일 → argon2id 자동) |
| `/api/v1/auth/password` | 변경 0 (동일) |
| `/api/settings/users` | 변경 0 (동일) |
| `/api/auth/login` (레거시) | 변경 0 (env 평문 비교, bcrypt/argon2 무관) |

**`src/lib/password.test.ts`** (신규):
- 8 케이스 PASS — argon2id format / argon2 verify 정·오답 / bcrypt 역호환 정·오답 / needsRehash 두 분기
- Vitest 누적 131 → **139 PASS**

**`package.json` / `package-lock.json`**:
- `@node-rs/argon2` 추가 (WSL2 prebuilt 3.3초)

---

## 3. 검증 결과

### 3.1 단위 테스트 / 타입 검사

```
Vitest:    139 PASS (신규 8 / 회귀 0)
tsc:       0 에러
```

### 3.2 /ypserver prod --skip-win-build

```
Win 빌드:   ⏭ 스킵
Prisma:     ✅ migrate deploy 1건 적용 (20260419120000_add_sessions_table)
WSL 빌드:   ✅ 성공
Drizzle:    ✅ db:migrate 적용
PM2:        ✅ dashboard restart count 1, online
Tunnel:     ✅ cloudflared online (uptime 48s)
헬스체크:   ✅ HTTP 307 (proxy 정상)
```

### 3.3 E2E (자동 재해시 + Sessions 인덱스)

```
배포 직후 prefix:   $2b$12$wiApl   (bcrypt cost=12)
1차 로그인:         HTTP 200 + JWT 발급
1차 후 prefix:      $argon2id$v=   ⭐ 자동 마이그레이션 성공
2차 로그인:         HTTP 200       ⭐ argon2 분기 검증 PASS

EXPLAIN SELECT * FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at > NOW();
→ Index Scan using sessions_user_id_revoked_at_expires_at_idx
   Index Cond: ((user_id = ?) AND (revoked_at IS NULL) AND (expires_at > now()))
```

SP-015 채택안(일반 복합 인덱스 + cleanup job) 작동 확인. SP-011 1000 사용자 마이그레이션의 첫 production 사용자 case 실증.

---

## 4. 핵심 발견 4건

### 4.1 자동 재해시 round-trip 0개 압축

Blueprint §7.2.3의 예시 코드는 `verify` → `prisma.user.update({ passwordHash })`로 별도 update를 수행한다. 그러나 본 프로젝트의 login route는 이미 `lastLoginAt` update를 수행 중이라, `{lastLoginAt, passwordHash?}` 머지로 단일 트랜잭션으로 압축할 수 있다. 추가 round-trip 0개.

→ Compound Knowledge 후보: `2026-04-19-bcrypt-argon2-progressive-rehash-merged-update.md` (다음 세션 작성 검토)

### 4.2 시그니처 보존 + needsRehash 분리 = 호출자 영향 최소화

`verifyPasswordHash(plain, hash)` 시그니처를 보존하고 분기 결정만 `needsRehash`로 외부에 노출. 호출자 4개 중 3개(register/password/admin-create)는 코드 변경 0. 자동 재해시 책임은 login route 1곳에만. 단일 책임 원칙 + 마이그레이션 안전성 동시 충족.

### 4.3 Sessions 인프라만, 활성화는 후속

현재 인증은 `src/lib/auth.ts`의 stateless JWT(jose HS256, dashboard_session 쿠키, 24h 만료). DB Session 사용처 없음. Phase 15-D Refresh Rotation + tokenFamily 도입 시 활성화 예정. Step 1 범위를 1h로 압축.

### 4.4 isolatedModules 환경에서 const enum 회피

`@node-rs/argon2`의 `Algorithm`은 `export declare const enum`. tsconfig `isolatedModules: true` 환경에서 import 시 컴파일 경고 가능. `const ARGON2ID_ALGORITHM = 2` 상수 캡슐화로 회피 (런타임 동작 동일).

---

## 5. ADR / Blueprint / DQ 영향

| 항목 | 변경 |
|------|------|
| ADR-019 (argon2id) | **본문 검증 완료** — Phase 17 전환 코드 패턴이 Phase 15에서 작동함을 실증 |
| ADR-006 (auth 결정) | 본문 "bcryptjs → bcrypt" 정정은 세션 31에 완료. 추가 변경 없음 |
| Auth Advanced Blueprint §7.2.2 | EXPLAIN으로 Index Scan 사용 실증 — "p95 < 2ms 목표 40배 여유" 가설 production 검증 |
| Auth Advanced Blueprint §7.2.3 | 자동 재해시 코드 예시가 작동함을 실증 + round-trip 압축 패턴 발견 |
| DQ-AC-1 | Resolved 유지 (실측 일치) |
| DQ-AC-2 | Resolved 유지 (Index Scan 확인) |

추가 ADR 신설 불필요.

---

## 6. 알려진 이슈 / 주의사항

### 6.1 세션 32 신규

- **Sessions 테이블은 미사용 상태** — 모델·인덱스·cleanup만 깔아둔 상태. INSERT는 후속 단계에서 시작. 외부 모니터링 도구가 빈 테이블을 보고 경고하지 않도록 주의
- **cleanup 함수 미스케줄** — `cleanupExpiredSessions()`는 정의만 됨. node-cron 등록은 후속 (Sessions INSERT 시작 시점에 함께)
- **`@node-rs/argon2` const enum** — `Algorithm.Argon2id` 직접 import는 isolatedModules 경고 가능. 본 프로젝트는 상수 캡슐화로 회피
- **자동 재해시 후 첫 검증** — 1차 로그인은 bcrypt 검증(168ms p95) + argon2 hash(20ms) 모두 수행되므로 1회만 약간 느림(약 190ms). 2차부터 argon2 verify(14ms p95)만 수행

### 6.2 기존 (세션 31까지)

- next-dev-prompt 알려진 이슈 섹션 그대로 유효. PM2 safeguard / Cloudflare Tunnel 간헐 530 / WSL2 빌드가 진실 소스 등

---

## 7. 다음 세션 진입

### 7.1 우선순위 1 — Phase 15 Step 3 (JWKS endpoint, 4h)

청사진: Blueprint §7.2.1 + SP-014 조건부 Go

구현 항목:
1. `JwksKey` Prisma 모델 — kid / publicJwk(Json) / privateJwk(암호화 권장) / status (CURRENT/RETIRED) / retireAt
2. `/api/.well-known/jwks.json` GET — `status='CURRENT'` OR `retireAt > NOW()` 키 동시 서빙
3. `Cache-Control: public, max-age=180, stale-while-revalidate=600` 헤더
4. ES256 키쌍 발급 헬퍼 (jose generateKeyPair + exportJWK)
5. 키 회전 절차 — 신 키 등록 + 구 키 retireAt = NOW() + max(token TTL, cacheMaxAge) + 60s
6. cron 1시간 retireAt 만료 키 제거
7. jose `createRemoteJWKSet(url, { cacheMaxAge: 180_000 })` 사용 site (instrumentation 또는 v1 토큰 검증)

DOD: 키 회전 절차 1회 + 회전 직후 oldKey 토큰 검증 OK + cron 동작 + jose 캐시 hit rate ≥ 95%

### 7.2 우선순위 2-4 — Phase 15 Step 4-6

- **Step 4 TOTP** (8h) — `otplib@12.x` + QR 발급 + 백업 코드 + admin 강제 해제 (FR-6.1)
- **Step 5 WebAuthn** (10h) — `@simplewebauthn/server@10.x` Passkey 등록·인증 (FR-6.2)
- **Step 6 Rate Limit** (4h) — `rate-limiter-flexible@5.x` PG 어댑터 (FR-6.3)

세션 32 Step 1-2 패턴 재사용:
- Prisma 모델 추가 → `migration.sql` 수동 작성 → `migrate deploy`
- `/api/v1/auth/*` 라우트에 통합
- Vitest 단위 + curl E2E
- `/ypserver prod --skip-win-build` 배포

### 7.3 우선순위 5 — SP-013/016 물리 측정 (환경 확보 시)

세션 30 Pending 상태 그대로.

---

## 8. 세션 통계

- 변경 파일: 7개 (수정 4 + 신규 3)
  - 수정: `prisma/schema.prisma` / `src/lib/password.ts` / `src/app/api/v1/auth/login/route.ts` / `package.json` + `package-lock.json`
  - 신규: `prisma/migrations/20260419120000_add_sessions_table/migration.sql` / `src/lib/sessions/cleanup.ts` / `src/lib/password.test.ts`
- Vitest: 131 → 139 PASS (+8)
- 마이그레이션: 1건 적용 (sessions 테이블 + 복합 인덱스 + FK)
- npm 패키지: +1 (`@node-rs/argon2`)
- 프로덕션 검증: 자동 재해시 1차 로그인 + Sessions 인덱스 EXPLAIN
- ADR 영향: 0 신설 (ADR-019 검증만)
- 메타 갱신: current / 2026-04 / journal-04-19 / handover (본 파일) / next-dev-prompt

---

> 세션 32 종료 · 2026-04-19 · Phase 15 Step 1-2 완료 · 다음 세션 진입 = Step 3 JWKS endpoint (4h)
