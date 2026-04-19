---
title: "@simplewebauthn/server v10 API shape — registrationInfo 평탄 구조 + authenticator singular 필드 + types 서브패키지 분리"
date: 2026-04-19
session: 33
tags: [webauthn, simplewebauthn, passkey, mfa, api-shape, types-migration]
category: pattern
confidence: high
---

## 문제

Phase 15 Step 5 (WebAuthn / Passkey) 구현 중 `@simplewebauthn/server@10.0.1` + `@simplewebauthn/browser@^10` 기반 코드 작성. Blueprint 예시가 가정한 API shape 과 **실제 설치된 v10 의 shape 이 달랐고**, 공식 문서 검색도 v9 이전/v11+ 자료가 섞여 있어 혼란.

**증상** (Blueprint 예시 shape 그대로 작성 시):
```ts
// ❌ Blueprint / 구 자료 패턴 (v9 이전 or v11+ 혼재)
const info = verified.registrationInfo;
const credentialId = info.credential.id;          // undefined — v10 은 credential 중첩 없음
const publicKey = info.credential.publicKey;       // undefined
// TypeError: Cannot read properties of undefined (reading 'id')

// ❌ verifyAuthenticationResponse authenticator 필드 이름
await verifyAuthenticationResponse({
  ...,
  credential: { id, publicKey, counter, transports },  // v10 은 authenticator (singular, 구 명칭 유지)
});
// 타입 에러 또는 verify 실패
```

추가 증상:
- `RegistrationResponseJSON` / `AuthenticationResponseJSON` / `AuthenticatorTransportFuture` 타입을 `@simplewebauthn/server` 에서 import 시도 → v10 에서는 `@simplewebauthn/types` 서브패키지로 분리됨
- `counter` 필드가 숫자인지 BigInt 인지 문서 모호 — Prisma 스키마 선택 실수 시 overflow 위험
- `transports` 를 `registrationInfo` 에서 찾지 못함 (실제로는 브라우저 response 최상위)

## 원인

**핵심**: SimpleWebAuthn 은 v8 → v9 → v10 → v11+ 동안 `registrationInfo` 객체 shape 을 여러 차례 리팩터링. v10 은 **평탄(flat)** 구조를 채택하되 `verifyAuthenticationResponse` 의 `authenticator` 파라미터명은 과거 호환을 위해 singular 로 유지되는 **혼합 과도기**.

### v10 shape 실측 (`d.ts` 기준)

```ts
// VerifiedRegistrationResponse.registrationInfo (v10, 평탄)
{
  credentialID: string;               // base64url, 평탄
  credentialPublicKey: Uint8Array;    // COSE public key, 평탄
  counter: number;                    // 등록 시점 카운터 (보통 0)
  credentialDeviceType: "singleDevice" | "multiDevice";
  credentialBackedUp: boolean;
  // NOTE: transports 는 여기에 없음 — 브라우저 response 최상위에서 가져와야 함
}

// verifyAuthenticationResponse 파라미터 (v10)
{
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  expectedOrigin: string,
  expectedRPID: string,
  authenticator: {                    // ← singular 필드명 (v10 유지)
    credentialID: string,
    credentialPublicKey: Uint8Array,
    counter: number,
    transports?: AuthenticatorTransportFuture[],
  },
  requireUserVerification?: boolean,
}
```

### 타입 패키지 분리

v10 은 `@simplewebauthn/types` 를 별도 서브패키지로 분리. `server` / `browser` 양쪽이 공유. 구 자료의 `import type { ... } from "@simplewebauthn/server"` 는 v10 에서 일부 타입이 빠져 실패.

### counter 와 Prisma BigInt

- SimpleWebAuthn 의 `counter` 는 v10 에서 JS `number` 로 제공 (≤ 2^53-1)
- 하지만 WebAuthn 스펙상 counter 는 **unsigned 32-bit 정수**이고 서명마다 증가
- Prisma 에서는 **BigInt** 로 저장하는 것이 안전 (미래 확장·일관성) → JS `number` ↔ Prisma `BigInt` 변환 경계 명시 필요

**문서 검색의 함정**: Google / Stack Overflow 에서 "simplewebauthn verifyRegistrationResponse" 를 검색하면 v8~v12 예시가 혼재. 버전 명시 없는 스니펫을 복사하면 반드시 깨짐. **`node_modules/@simplewebauthn/server/esm/index.d.ts` 를 직접 읽는 것이 검색보다 빠르고 정확**.

## 해결

**원칙**: server/browser 버전 동기 고정 + 실 `d.ts` 기반 구현 + counter BigInt 경계 명시.

### 1) `package.json` 버전 동기 고정

```json
{
  "dependencies": {
    "@simplewebauthn/server": "^10.0.1",
    "@simplewebauthn/browser": "^10.0.0"
  }
}
```

server / browser 는 같은 major 로 반드시 동기. mismatch 시 challenge 형식·response JSON 형식 불일치로 verify 실패.

### 2) v10 호출 패턴 (실제 `src/lib/mfa/webauthn.ts`)

**types 서브패키지에서 import**:
```ts
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
```

**등록 검증 후 평탄 shape 으로 저장 + transports 는 response 에서**:
```ts
export async function persistAuthenticator(
  userId: string,
  verified: VerifiedRegistrationResponse,
  responseTransports: AuthenticatorTransportFuture[],   // ← 브라우저 response 에서 꺼내 전달
  friendlyName: string | null,
): Promise<void> {
  const info = verified.registrationInfo;
  if (!info) throw new Error("registrationInfo 가 반환되지 않았습니다");

  await prisma.webAuthnAuthenticator.create({
    data: {
      userId,
      credentialId: info.credentialID,                  // 평탄
      publicKey: Buffer.from(info.credentialPublicKey), // 평탄, Uint8Array → Buffer
      counter: BigInt(info.counter),                    // number → BigInt 경계
      transports: responseTransports,                   // response.transports (registrationInfo X)
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      friendlyName,
    },
  });
}
```

**인증 검증 시 authenticator singular 필드**:
```ts
const verified = await verifyAuthenticationResponse({
  response,
  expectedChallenge,
  expectedOrigin: origin,
  expectedRPID: rpID,
  authenticator: {                                      // ← singular 필드명 (v10)
    credentialID: auth.credentialId,
    credentialPublicKey: new Uint8Array(auth.publicKey),
    counter: Number(auth.counter),                      // BigInt → number 경계 (v10 이 요구)
    transports: auth.transports as AuthenticatorTransportFuture[],
  },
  requireUserVerification: false,
});

if (verified.verified) {
  await prisma.webAuthnAuthenticator.update({
    where: { id: auth.id },
    data: {
      counter: BigInt(verified.authenticationInfo.newCounter), // number → BigInt 재변환
      lastUsedAt: new Date(),
    },
  });
}
```

### 3) 검증

- `register-options` POST 200 OK — rp.id/rp.name/challenge/pubKeyCredParams 정상 발급 + DB `webauthn_challenges purpose=registration` 1건 기록
- Prisma `WebAuthnAuthenticator.counter BigInt` 스키마로 저장 round-trip 성공
- 브라우저 `navigator.credentials.create/get()` round-trip 은 UI 연동 세션 위임, 서버측 완결

## 재발 방지

### 1) server/browser 버전 동기 락

둘 중 하나만 업그레이드 금지. `package.json` 주석 또는 본 CK 인용. PR 리뷰 시 `@simplewebauthn/*` diff 는 server/browser 쌍 확인 필수.

### 2) 메이저 업그레이드 시 API 이관 테스트

v10 → v11+ 시도 시 다음 체크:

1. **`registrationInfo` shape diff** — `d.ts` 직접 비교. 중첩(credential 객체) 재도입 여부
2. **`authenticator` vs `credential` 파라미터명** — v11+ 에서 singular 명칭 폐기 가능성
3. **types 패키지 경로** — `@simplewebauthn/types` 통합/분리 재변경 가능성
4. **counter 타입** — number vs bigint 로 변경되었는지
5. **기등록 credential 호환성** — `publicKey` 형식(COSE bytes) 안정성 확인. 실패 시 사용자 재등록 강제 = MFA 전체 재설정

### 3) 문서 검색보다 `d.ts` 직독

SimpleWebAuthn 은 버전별 API 차이가 크고, 웹 예시는 버전 혼재. **1차 정보원은 `node_modules/@simplewebauthn/server/esm/index.d.ts`**. 2차는 공식 GitHub `CHANGELOG.md` 의 해당 major 섹션. Stack Overflow / 블로그는 3차.

### 4) BigInt 경계 명시

WebAuthn counter 는 앱 전역에서 일관 타입 유지가 어려움 — SimpleWebAuthn 은 number, Prisma 는 BigInt. `BigInt(info.counter)` / `Number(auth.counter)` 변환 지점을 `persistAuthenticator` / `verifyAuthentication` 두 곳으로만 국한하고, 그 외 코드는 Prisma 타입(BigInt) 사용.

## 관련 구조

- `src/lib/mfa/webauthn.ts` — v10 전체 래핑 (createRegistrationOptions / verifyRegistration / persistAuthenticator / createAuthenticationOptions / verifyAuthentication / consumeChallenge / cleanupExpiredChallenges 7 exports)
- `prisma/schema.prisma` — `WebAuthnAuthenticator` (credentialId uniq / publicKey Bytes / counter BigInt / transports String[] / deviceType / backedUp / friendlyName?) + `WebAuthnChallenge`
- `prisma/migrations/20260419150000_add_webauthn_tables/migration.sql`
- `src/app/api/v1/auth/mfa/webauthn/*` — 4 라우트 (register-options / register-verify / assert-options / assert-verify)
- `package.json` — `@simplewebauthn/server@^10.0.1` + `@simplewebauthn/browser@^10.0.0` + `@simplewebauthn/types` (transitive)
- `docs/handover/260419-session33-phase15-step3-4-5.md` §5B — v10 API shape 발견 기록
- Blueprint Phase 15 Auth Advanced §7.2 (WebAuthn / Passkey)

## 관련 솔루션

- `2026-04-19-otplib-v13-breaking-noble-plugin.md` (같은 세션 MFA 구현 중 발견한 첫 번째 라이브러리 버전 함정 — 핀 고정 원칙 동일)
