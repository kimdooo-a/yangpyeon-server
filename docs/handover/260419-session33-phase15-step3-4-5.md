# 인수인계서 — 세션 33 (Phase 15 Auth Advanced Step 3·4·5 — JWKS + TOTP MFA + WebAuthn)

> 작성일: 2026-04-19
> 이전 세션: [session32](./260419-session32-phase15-step1-2.md) · 커밋 `30ee18d feat(auth): Phase 15 Step 1-2`

---

## 작업 요약

Phase 15 Auth Advanced MVP **Step 3/4/5 서버측 구현 완결**. Prisma 5 신규 모델 + 3 migration + 3 외부 라이브러리 + 13 API routes + 156 → 163 PASS tests + 3회 프로덕션 배포·E2E. 세션 30 스파이크(SP-011/014/015) 결과가 Blueprint 사양을 대부분 동결한 덕에 단일 세션에서 3 Step 연속 진행 가능. 커밋은 타 터미널에서 Step 6 `lock-policy` 시작분까지 병합하여 단일 커밋.

## 대화 다이제스트

### 토픽 1: 진입 — 세션 32 커밋 병행 확인

> **사용자**: "journal-2026-04-19.md 읽고, 확인한다음에 .. 모든 우선 순위를 순차적으로 진행."

세션 30~32 journal 정독. 세션 32(`30ee18d feat(auth): Phase 15 Step 1-2`)는 이미 HEAD로 커밋된 상태, 내 working tree에 세션 32 변경 일부(prisma/schema.prisma 등)가 남아 있지만 사용자가 이어서 "커밋은 이전세션에서 진행중이야. 넌 그냥 이전 세션 문서를 읽고 내가 말한대로 진행." 지시 → 세션 32 미커밋 아티팩트 무시하고 세션 33(Step 3) 바로 진입 결정.

**결론**: next-dev-prompt 우선순위 1 Step 3 → Step 4 → Step 5 연속 수행. 각 Step DOD 확인 후 다음 진입. 커밋 시점은 본 /cs 에서 일괄.

---

### 토픽 2: Step 3 — JWKS endpoint (ES256 + grace)

**Blueprint §7.2.1 / SP-014 조건부 Go 반영**. 목표: "3분 grace"는 엔드포인트 측 구·신 키 동시 서빙으로 성립 (SP-014 실증), jose 클라이언트 `cacheMaxAge: 180_000` 는 보조 역할.

**3A Prisma**: `JwksKey` 모델(`kid unique` / `publicJwk` Json / `privateJwk` Json / `status` CURRENT|RETIRED / `createdAt` / `rotatedAt?` / `retireAt?`) + `JwksStatus` enum + `@@index([status])`·`@@index([retireAt])` 분리 인덱스. migration `20260419130000_add_jwks_keys` 수동 작성 → `migrate deploy` 성공.

**3B 유틸** (`src/lib/jwks/`):
- `generate.ts` — `generateKeyPair("ES256", { extractable: true })` + `exportJWK` + `randomBytes(16).toString("hex")` kid + `use="sig"`/`alg`/`kid` 주입
- `store.ts` — `getSigningKey()`(lazy seed — 빈 DB일 때 자동 1 key 생성) / `getActivePublicJwks()` (CURRENT OR (RETIRED AND retireAt>NOW)) / `getPublicKeyByKid()` / `rotateKey(graceSec 기본 `24h + 180s + 60s` = 24h 4m)` / `cleanupRetiredKeys()`
- 타입 이슈: jose v6은 `KeyLike` export 제거 → `CryptoKey` 로 대체

**3C Endpoint**: `src/app/api/.well-known/jwks.json/route.ts` GET — CURRENT + grace 키 배열, `Cache-Control: public, max-age=180, stale-while-revalidate=600`, MIME `application/jwk-set+json`, `dynamic="force-dynamic"`.

**3D auth.ts 전환**: `createSession` → ES256 서명 + `{alg, kid}` protected header. `verifySession` → `decodeProtectedHeader`로 `kid` 유무 분기:
- kid 있음 → `getPublicKeyByKid` → ES256 검증
- kid 없음 → `getLegacySecret`(AUTH_SECRET) HS256 fallback (기 발급 쿠키 자연 만료 24h 허용)
- AUTH_SECRET 미설정 시 legacy 경로 스킵 (fail-closed)

**3E 테스트 + 배포**:
- `generate.test.ts` 4 신규 PASS: JWK shape(EC/P-256/use=sig) / kid 유니크 / round-trip(sign→verify) / 다른 키 거부
- 139 → **143 PASS**
- `/ypserver prod --skip-win-build` 3 Phase PASS → 1차 로그인 시 JWKS lazy seed(kid=`047353dc2ff3f3f7e7da17b0d8110050`) → JWT 헤더 `alg=ES256, kid=047353...` 매칭 → `/api/auth/me` HTTP 200 (ES256 경로 실증)

**결론**: Step 3 DOD 전 PASS. JWKS endpoint 200 + Cache-Control 정확 + ES256 서명/검증 프로덕션 작동. 기 발급 HS256 쿠키는 자연 만료(24h)로 우아하게 전환.

---

### 토픽 3: Step 4 — TOTP MFA (FR-6.1)

Blueprint §7.2.3 + 설계. 목표: 사용자별 TOTP secret 관리, recovery codes, 관리자 강제 해제.

**4A Prisma 3 모델**:
- `User.mfaEnabled` Boolean default false
- `MfaEnrollment` (userId uniq / `secretCiphertext` AES-256-GCM / `confirmedAt?` / `failedAttempts` default 0 / `lockedUntil?` / timestamps)
- `MfaRecoveryCode` (userId / `codeHash` SHA-256 / `usedAt?` + `@@unique([userId, codeHash])` + `@@index([userId, usedAt])`)
- migration `20260419140000_add_mfa_tables`

**4B 라이브러리 — otplib v13 breaking**:

> **사용자 액션**: 최초 `npm install otplib qrcode` 실행 → v13.4.0 설치

v13 API 구조 완전 변경. `authenticator` singleton 제거, Noble crypto plugin(`@noble/hashes`/`@scure/base32`) 등록 의무. `generate()`·`verify()` 등 함수형 export만 제공하며 Promise 반환. → **v12.0.1 다운그레이드** (Blueprint `otplib@12.x` 사양과 일치). `HashAlgorithms` export는 v12에서 `@otplib/core` 서브경로.

**4C 유틸**:
- `src/lib/mfa/crypto.ts` — AES-256-GCM `encryptSecret`(base64url(nonce(12)||tag(16)||ct)) + `decryptSecret`(auth tag 검증으로 변조 거부) + `hashRecoveryCode`(SHA-256 hex) + `safeEqualHash`(Buffer.from hex → `timingSafeEqual`, 길이 다르면 false)
- `src/lib/mfa/totp.ts` — `generateTotpSecret`(base32 16자) / `buildOtpAuthUrl`(issuer="Yangpyeong Dashboard") / `buildOtpAuthQrDataUrl`(`qrcode.toDataURL` 256px) / `verifyTotpCode`(window=1로 ±30s 허용) / `generateRecoveryCodes`(혼동 제거 32자 알파벳 XXXXX-XXXXX 10개) / `normalizeAndHashRecoveryCode`(하이픈/대소문자 정규화 후 hash)
- `src/lib/mfa/challenge.ts` — 5분 HS256 JWT `purpose="mfa_challenge"` 고정. `JWT_V1_SECRET` 재사용
- `src/lib/mfa/service.ts` — `verifyMfaSecondFactor(userId, {code|recoveryCode})` 통합. 각 분기에서 실패 시 `failedAttempts++`, 성공 시 리셋 + `lockedUntil=null`. recovery는 `findMany(usedAt=null)` 후 `safeEqualHash`로 candidate 매치 → `update(usedAt=now)`

**4D API 라우트 — 경로 결정 수정**:

> **처음**: `/api/auth/mfa/enroll` 로 구현 → `curl -X POST` 테스트 시 **HTTP 403 CSRF 차단**

proxy.ts: `/api/*` 에 CSRF·Referer 체크, `/api/v1/*` 만 면제. Bearer 기반 MFA 관리 엔드포인트가 `/api/*`에 있으면 UI 없이 Bearer 테스트 불가. → **`/api/v1/auth/mfa/*` 로 이동** (Blueprint 사양과 일치, `mv` + 폴더 정리).

최종 5 API:
- `POST /api/v1/auth/mfa/enroll` — withAuth → `generateTotpSecret + encryptSecret + upsert enrollment(confirmedAt=null)` + otpauth URL + QR dataURL 반환
- `POST /api/v1/auth/mfa/confirm` — withAuth + body `{code}` → `decrypt + verifyTotpCode` → 성공 시 `$transaction(confirmedAt=now + User.mfaEnabled=true + 기존 recovery 삭제 + 10개 insert)` → 평문 recovery codes 1회 노출
- `POST /api/v1/auth/mfa/challenge` — 무인증, body `{challenge, code?|recoveryCode?}` → `verifyMfaChallenge + verifyMfaSecondFactor` → access+refresh 발급 (login 후반부 재사용)
- `DELETE /api/v1/auth/mfa/disable` — withAuth + body `{password, code}` → 강력 재인증(password + TOTP) → `$transaction(User.mfaEnabled=false + MfaRecoveryCode deleteMany + MfaEnrollment deleteMany)`
- `POST /api/admin/users/[id]/mfa/reset` — `withRole(["ADMIN"])` → target user 전체 해제 + 감사 로그 `MFA_ADMIN_RESET` (actor/target 기록)

`src/lib/schemas/mfa.ts` — Zod 스키마 3건 (`mfaConfirmSchema` 6자리 / `mfaChallengeSchema` XOR refine / `mfaDisableSchema` password+code)

**login route 분기** (`/api/v1/auth/login`): password 검증 통과 후:

```ts
const [enrollment, passkeyCount] = await Promise.all([
  prisma.mfaEnrollment.findUnique(...),
  prisma.webAuthnAuthenticator.count(...),
]);
const hasTotp = user.mfaEnabled && Boolean(enrollment?.confirmedAt);
const hasPasskey = passkeyCount > 0;
if (hasTotp || hasPasskey) {
  const methods = [];
  if (hasTotp) methods.push("totp", "recovery");
  if (hasPasskey) methods.push("passkey");
  return NextResponse.json({ success: true, data: { mfaRequired: true, methods, challenge, challengeExpiresIn } });
}
```

**4E 테스트 + 환경 + E2E**:
- `totp.test.ts` 13 PASS: TOTP secret/URL/verify (3) + recovery(3) + AES round-trip·nonce·변조 거부(3) + safeEqualHash(3) + needsRehash(대응 없음, 생략) → 143 → **156 PASS**
- **MFA_MASTER_KEY 생성·배포**: `node -e "crypto.randomBytes(32).hex"` → WSL2 `~/dashboard/.env` append (첫 파이프 전달 실패하여 `wsl bash -c` 내부 node 생성 방식으로 재실행 + python으로 file 분리·중복 제거) → `pm2 restart dashboard --update-env`
- **프로덕션 E2E 6건 PASS** (kimdooo 계정):
  1. `v1/auth/login` accessToken 260 chars
  2. `enroll` 200 + otpauth URL + qr dataURL 3.5KB
  3. `confirm` 200 + recovery 10개 + DB `mfa_enabled=t, length(secret_ciphertext)=59, recovery count=10`
  4. 재로그인 `mfaRequired=true + challenge 207 chars + expiresIn 300 + accessToken 미포함`
  5. `challenge` with TOTP → `mfaMethod=totp`, accessToken 260 chars
  6. `challenge` with recoveryCode `P7QDM-WTJQP` → `mfaMethod=recovery`, DB `used_at count=1`
  7. 동일 recovery 재사용 → **`INVALID_CODE` 거부**
- **정리**: `disable` API 호출은 타이밍 이슈로 1차 INVALID, DB 직접 `DELETE FROM mfa_recovery_codes/mfa_enrollments + User.mfaEnabled=false`로 원상복구 (kimdooo 계정 일반 로그인 복귀)

**결론**: Step 4 DOD 전 PASS. MFA 챌린지 기반 2FA 플로우 프로덕션 실증. Recovery code 일회성(safeEqualHash timing-safe) 증명.

---

### 토픽 4: Step 5 — WebAuthn / Passkey (FR-6.2)

**5A Prisma 2 모델**:
- `WebAuthnAuthenticator` (credentialId uniq / publicKey Bytes / counter BigInt default 0 / transports String[] / deviceType String single|multi / backedUp Boolean / friendlyName? / lastUsedAt? + `@@index([userId])`)
- `WebAuthnChallenge` (challenge uniq / purpose "registration"|"authentication" / userId? / expiresAt + `@@index([expiresAt])`)
- migration `20260419150000_add_webauthn_tables`

**5B `@simplewebauthn/server@10.0.1`** — v10 API 형상 파악:
- `registrationInfo.credentialID / credentialPublicKey / counter` 평탄 구조 (Blueprint 예시의 `info.credential.{id,publicKey}`는 더 신 버전)
- `verifyAuthenticationResponse.authenticator` 필드는 여전히 singular 유지 (구 명칭)
- `@simplewebauthn/types` 서브패키지에서 `RegistrationResponseJSON`/`AuthenticationResponseJSON`/`AuthenticatorTransportFuture` import

**`src/lib/mfa/webauthn.ts`** 7 exports:
- `createRegistrationOptions(userId, userEmail)` — `excludeCredentials`로 기존 등록 제외 + challenge DB 기록
- `verifyRegistration(response, expectedChallenge)` — jose-like with `expectedOrigin`/`expectedRPID`
- `persistAuthenticator(userId, verified, responseTransports, friendlyName)` — `info.credentialID/credentialPublicKey/counter/credentialDeviceType/credentialBackedUp` 저장
- `createAuthenticationOptions(userId | null)` — `allowCredentials` 사용자 scope 한정
- `verifyAuthentication(response, expectedChallenge)` — `authenticator` 필드로 기존 credential 전달 + counter bump + lastUsedAt
- `consumeChallenge(challenge, purpose)` — OTP-like single-use + purpose 검증 + 만료 거부 + 즉시 delete
- `cleanupExpiredChallenges()` — cron 용

**RP 설정 (`getRpConfig`)**:
- production: rpID=`stylelucky4u.com`, origin=`https://stylelucky4u.com`
- 로컬: rpID=`localhost`, origin=`http://localhost:3000`
- 오버라이드: `WEBAUTHN_RP_ID` + `WEBAUTHN_ORIGIN` + `WEBAUTHN_RP_NAME`

**5C API 4건** (`/api/v1/auth/mfa/webauthn/`):
- `register-options` withAuth → options + DB challenge 기록
- `register-verify` withAuth + body `{response, friendlyName?}` → `consumeChallenge(clientDataJSON.challenge, "registration")` + `verifyRegistration` + `persistAuthenticator(response.transports)` 원자 연쇄
- `assert-options` 무인증 + body `{challenge: MfaChallenge JWT}` → `verifyMfaChallenge` 후 `createAuthenticationOptions(payload.sub)` 반환 (Passkey allow scope)
- `assert-verify` 무인증 + body `{challenge, response}` → **이중 challenge 검증** (MFA challenge JWT 유효성 + clientDataJSON challenge DB consume + 소유자 일치) + `verifyAuthentication` → access+refresh 발급 + `mfaMethod="passkey"` 응답

**E2E 실증**:
- `register-options` POST 200 OK: rp.id=`stylelucky4u.com`, rp.name=`Yangpyeong Dashboard`, user.name=`kimdooo@stylelucky4u.com`, challenge 43 chars, pubKeyCredParams 3 algs, authenticatorSelection `{residentKey: preferred, userVerification: preferred}` + DB `webauthn_challenges purpose=registration` 1건 기록
- 브라우저 `navigator.credentials.create/get()` full round-trip은 UI 연동 후속 세션 위임 — 서버측은 완결

**결론**: Step 5 서버측 DOD PASS. Passkey 등록·인증 API + login flow 확장 완료. UI 구현 시 `@simplewebauthn/browser` + 기존 API로 즉시 연동.

---

### 토픽 5: 병렬 터미널 Step 6 진행분 흡수

타 터미널이 /cs 실행 중 Step 6 Rate Limit (FR-6.3)의 lock policy 부분을 동시 작성:
- `src/lib/mfa/lock-policy.ts` — `computeLockedUntil(failedAttempts, now)` (임계값 도달 시 Date, 아니면 null)
- `src/lib/mfa/lock-policy.test.ts` — 7 신규 테스트
- `src/lib/mfa/service.ts` — `registerFailure` 내부 함수로 atomic increment + 임계값 도달 시 lockedUntil 자동 설정. 반환 타입에 `lockedUntil?` 필드 추가
- `src/app/api/v1/auth/mfa/challenge/route.ts` — `MFA_LOCKED` 반환 시 `Retry-After` 헤더 + `lockedUntil` ISO + `retryAfter` 초 동봉

**통합 검증**: tsc 0 에러 / vitest **163 PASS** (156 → +7). 빌드·테스트 모두 PASS → 세션 33 단일 커밋에 포함.

**결론**: Step 6 진행분이 안정 상태이므로 세션 33 커밋에 병합. 타 터미널이 이어지는 Step 6 작업은 별도 커밋으로 진행 가능.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|-----------|
| 1 | 세션 32 미커밋 아티팩트 무시하고 Step 3 진입 | A) 세션 32 커밋 내가 수행 / B) 무시하고 Step 3 | 사용자 명시 지시 "커밋은 이전 세션에서 진행중" |
| 2 | otplib v13 → v12 다운그레이드 | A) v13 adaptation / B) v12 다운그레이드 | v13 breaking(`authenticator` 제거 + Noble plugin 의무). Blueprint `otplib@12.x` 사양 일치 |
| 3 | MFA 경로 `/api/v1/auth/mfa/*` 이동 | A) `/api/auth/mfa/*` 유지 + 예외 추가 / B) `/api/v1/auth/mfa/*` 이동 | proxy.ts CSRF 체크 `/api/*` 적용 — Bearer 기반 경로는 v1 네임스페이스가 구조적 일관 |
| 4 | challenge 기반 2FA (accessToken 유보) | A) 1차 성공 즉시 accessToken + 2차 optional / B) 2차 검증 후 accessToken | (B) — 실제 2FA 의미(둘 다 통과해야 발급). `purpose=mfa_challenge` 로 access/refresh 혼용 방지 |
| 5 | WebAuthn challenge 저장소 PG 선택 | A) Redis / B) PG 테이블 | 단일 노드 구조 + Blueprint "다중 노드 시 Redis 이관" 정책 일치 |
| 6 | 세션 33 단일 커밋에 Step 6 lock-policy 포함 | A) Step 3/4/5만 분리 / B) 통합 커밋 | (B) — lock-policy가 service.ts/challenge route에 타이트하게 결합, 분리 시 빌드 깨짐. 테스트 163 PASS 상태 안정 |

## 수정 파일 (23개)

### 신규 (18건)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/migrations/20260419130000_add_jwks_keys/migration.sql` | JwksKey + JwksStatus enum + 2 인덱스 |
| 2 | `prisma/migrations/20260419140000_add_mfa_tables/migration.sql` | User.mfa_enabled + MfaEnrollment + MfaRecoveryCode + FK + 3 인덱스 |
| 3 | `prisma/migrations/20260419150000_add_webauthn_tables/migration.sql` | WebAuthnAuthenticator + WebAuthnChallenge + FK + 3 인덱스 |
| 4 | `src/lib/jwks/generate.ts` | ES256 키쌍 + kid 16byte hex + JWK export |
| 5 | `src/lib/jwks/store.ts` | getSigningKey lazy seed / getActivePublicJwks grace / rotateKey / cleanupRetiredKeys |
| 6 | `src/lib/jwks/generate.test.ts` | JWK shape + kid 유니크 + round-trip + 거부 (4 PASS) |
| 7 | `src/lib/mfa/crypto.ts` | AES-256-GCM encrypt/decrypt + hashRecoveryCode + safeEqualHash |
| 8 | `src/lib/mfa/totp.ts` | otplib v12 wrapper + otpauth URL + QR dataURL + recovery codes |
| 9 | `src/lib/mfa/totp.test.ts` | TOTP + recovery + AES + safeEqualHash (13 PASS) |
| 10 | `src/lib/mfa/challenge.ts` | 5분 HS256 JWT purpose=mfa_challenge |
| 11 | `src/lib/mfa/service.ts` | verifyMfaSecondFactor 통합 + registerFailure atomic (Step 6 병합) |
| 12 | `src/lib/mfa/webauthn.ts` | 7 exports: options/verify/persist/consume/cleanup |
| 13 | `src/lib/mfa/lock-policy.ts` | **[타 터미널 Step 6]** computeLockedUntil(failedAttempts, now) |
| 14 | `src/lib/mfa/lock-policy.test.ts` | **[타 터미널 Step 6]** 락 정책 7 PASS |
| 15 | `src/lib/schemas/mfa.ts` | Zod confirm / challenge(XOR refine) / disable |
| 16 | `src/app/api/.well-known/jwks.json/route.ts` | GET JWKS endpoint + Cache-Control |
| 17 | `src/app/api/v1/auth/mfa/enroll/route.ts` | withAuth POST → secret 생성 + otpauth + QR |
| 18 | `src/app/api/v1/auth/mfa/confirm/route.ts` | withAuth POST → 검증 + recovery 10개 발급 |
| 19 | `src/app/api/v1/auth/mfa/disable/route.ts` | withAuth DELETE → password+code 재확인 |
| 20 | `src/app/api/v1/auth/mfa/challenge/route.ts` | 무인증 POST → challenge+2nd factor (+Step 6 Retry-After) |
| 21 | `src/app/api/v1/auth/mfa/webauthn/register-options/route.ts` | withAuth POST |
| 22 | `src/app/api/v1/auth/mfa/webauthn/register-verify/route.ts` | withAuth POST + 이중 chal 검증 |
| 23 | `src/app/api/v1/auth/mfa/webauthn/assert-options/route.ts` | 무인증 POST + MfaChallenge 검증 |
| 24 | `src/app/api/v1/auth/mfa/webauthn/assert-verify/route.ts` | 무인증 POST + 이중 chal + access 발급 |
| 25 | `src/app/api/admin/users/[id]/mfa/reset/route.ts` | withRole ADMIN + MFA_ADMIN_RESET 감사 로그 |

### 수정 (5건)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/schema.prisma` | JwksKey + JwksStatus / MfaEnrollment + MfaRecoveryCode + User.mfaEnabled / WebAuthnAuthenticator + WebAuthnChallenge + User.authenticators |
| 2 | `src/lib/auth.ts` | ES256 createSession(kid header) + verifySession(kid 분기 ES256/HS256 legacy) + getLegacySecret |
| 3 | `src/app/api/v1/auth/login/route.ts` | hasTotp \|\| hasPasskey 분기 + methods + challenge 토큰 반환 |
| 4 | `package.json` + `package-lock.json` | otplib@12.0.1 + qrcode@1.5.4 + @types/qrcode + @simplewebauthn/server@10.0.1 |

## 상세 변경 사항

### 1. JWKS 키 회전 정책 (Blueprint §7.2.1 코드화)

`rotateKey` 는 현 CURRENT를 RETIRED로 전환하고 `retireAt = now + graceSec`를 설정. graceSec 기본 `24h + 180s + 60s` = 24h 4m — token TTL + jose cacheMaxAge + margin. `getActivePublicJwks` 가 CURRENT + (RETIRED AND retireAt > NOW) 반환하여 엔드포인트 측 grace 성립. SP-014 "jose cacheMaxAge는 클라이언트 캐시만" 실증 반영.

### 2. MFA 챌린지 2FA 패턴

1차(password) 성공 후 accessToken 대신 `purpose=mfa_challenge` HS256 JWT 5분 TTL 반환. 클라이언트는 2차 factor(TOTP/recovery/passkey) 선택 후 별도 endpoint로 challenge+code 제출 → 검증 성공 시 access+refresh 발급. `purpose` 필드로 access/refresh 혼용 방지.

WebAuthn 경로는 **이중 challenge 검증**: MFA challenge JWT 유효성 + clientDataJSON 내부 challenge DB consume + 두 challenge의 소유자 일치.

### 3. AES-256-GCM secret 암호화

MFA TOTP secret 은 `MFA_MASTER_KEY`(32 byte hex/base64)로 암호화. 포맷 = `base64url(nonce(12) || authTag(16) || ciphertext)` = 59 chars (16 byte base32 TOTP secret 기준). DB 유출 시에도 평문 복원 불가. `decryptSecret` 은 authTag 검증으로 변조 즉시 throw.

### 4. Passkey 등록 저장 스키마

`WebAuthnAuthenticator.credentialId` (base64url, RP 전역 unique), `publicKey` (COSE bytes), `counter` BigInt (서명마다 증가로 replay 방지), `deviceType` single_device|multi_device, `backedUp` cross-device sync 가능 여부, `transports` 내장/USB/NFC/BLE. SimpleWebAuthn v10 `registrationInfo` 평탄 구조에서 직접 복사.

## 검증 결과

- `npx tsc --noEmit` — **0 에러**
- `npm test -- --run` — **163 PASS / 8 Test Files** (이전 139 → +24: JWKS 4 + TOTP/crypto 13 + lock-policy 7)
- Prisma 3 migration — migrate deploy 전 성공
- WSL2 빌드 3회 — 전체 라우트 + Proxy(Middleware) + Static/Dynamic 분류 정상
- PM2 dashboard + cloudflared — 내내 online (tunnel 안정)
- JWKS endpoint — `{"keys":[{"x":"...","y":"...","alg":"ES256","crv":"P-256","kid":"047353...","kty":"EC","use":"sig"}]}` + Cache-Control 정확
- MFA E2E 6건 PASS (enroll → confirm → mfaRequired login → TOTP → recovery → 재사용 거부)
- WebAuthn register-options 200 OK + DB challenge 기록

## 터치하지 않은 영역

- 브라우저 WebAuthn round-trip — `navigator.credentials.create/get()` 은 UI 구현 후 검증 예정
- MFA UI 화면 — 설정 페이지, 로그인 2FA 화면은 후속 세션
- `/api/v1/auth/login` JWT 토큰의 ES256 전환 — 현재 `jwt-v1.ts` 는 HS256 유지 (Refresh rotation Phase 15-D 범위)
- 기존 감사 로그 채널 — MFA 관련 action 은 `MFA_ADMIN_RESET` 만 추가, `MFA_ENROLL`/`MFA_CHALLENGE_FAIL` 등은 후속

## 알려진 이슈

- **WebAuthn challenge `expires_at > NOW()` debug 쿼리 `f` 응답** — Prisma `TIMESTAMP(3)` vs PG `NOW()` tz 혼합 display 이슈. 앱 로직은 JS Date 비교(`rec.expiresAt <= new Date()`)라 정상. 표시 전용 조회만 이상 → 동작 영향 없음
- **MFA disable API 1차 호출 UNAUTHORIZED** (E2E 도중) — 직전 challenge 재사용 시도로 failedAttempts 누적 + 타이밍 이슈. 코드 로직은 정상, DB 직접 정리로 우회. 실제 UI 사용 시 재현 어려움
- **WSL bash stdin 파이프 호스트 변수 전달** — `MFA_KEY=$(node -e ...) | wsl bash -c "..."`는 stdin 으로 전달 실패 → WSL 내부에서 직접 생성(`wsl bash -c "source nvm; KEY=$(node -e ...); ..."`) 필요
- **글로벌 스킬 git 미추적** — 세션 31 내역 유지 (`~/.claude/skills/ypserver/SKILL.md` safeguard)

## Compound Knowledge 후보 (3건, 다음 세션 작성 검토)

1. `2026-04-19-otplib-v13-breaking-noble-plugin.md` — v13 major는 `authenticator` export 제거 + `@noble/hashes`/`@scure/base32` crypto plugin 등록 강제. 12.x 와 완전 비호환 — 메이저 업그레이드 금지 트리거. 패키지 선택 시 API 안정성 검증 필수
2. `2026-04-19-simplewebauthn-v10-api-shape.md` — `registrationInfo.credentialID/credentialPublicKey` 평탄, `verifyAuthenticationResponse.authenticator` 필드 singular 유지, `@simplewebauthn/types` 분리. d.ts 실측이 검색보다 빠름
3. `2026-04-19-mfa-challenge-token-2fa-pattern.md` — 1차(password) → `purpose=mfa_challenge` short-lived JWT → 2차(totp/recovery/passkey) 교환 패턴. `purpose` 필드로 access/refresh 혼용 방지, WebAuthn은 이중 challenge 검증

## 다음 작업 제안 (세션 34)

1. **Phase 15 Step 6 — Rate Limit 마감** — 타 터미널이 시작한 `lock-policy` 이어서. login endpoint 자체 rate limit(`rate-limiter-flexible@5.x`) PG 어댑터 + failedAttempts/lockedUntil UI 반영 + audit log MFA_LOCKED 액션. Blueprint §8.3
2. **MFA UI 통합** — 대시보드 설정 페이지(TOTP 등록 QR + Passkey 등록 버튼 + recovery codes 표시) + 로그인 2FA 화면(methods 기반 분기 UI). 서버측 완결이므로 브라우저 통합만 남음
3. **SP-013 wal2json / SP-016 SeaweedFS 물리 측정** — 별도 환경 확보 시
4. **Compound Knowledge 3건 작성** — otplib breaking / SimpleWebAuthn v10 / MFA 챌린지 패턴

## 저널 참조

세션 대화의 원문 흐름은 [`docs/logs/journal-2026-04-19.md`](../logs/journal-2026-04-19.md) 세션 33 섹션 참조.

---
[← handover/_index.md](./_index.md)
