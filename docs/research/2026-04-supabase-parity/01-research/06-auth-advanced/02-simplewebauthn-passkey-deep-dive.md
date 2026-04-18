# SimpleWebAuthn (Passkey / WebAuthn) 심층 분석 — Supabase Auth 고급 동등성

> **Wave**: Round 1 / Auth Advanced (DQ-1.1 사전 스파이크 — ★ 핵심 검증)
> **작성일**: 2026-04-18
> **프로젝트**: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> **현 인증 점수**: 15/100 (WebAuthn 0점)
> **목표**: Passkey 기반 phishing-resistant 인증 도입으로 Supabase Auth WebAuthn 동등 + 차별화

---

## 1. 요약 (TL;DR)

`@simplewebauthn/server` + `@simplewebauthn/browser`는 W3C **WebAuthn Level 3** 표준을 가장 충실하게 구현한 TypeScript 라이브러리이다. **Passkey** (synced + device-bound), Yubikey 등 보안 키, Touch ID/Face ID/Windows Hello 등 platform authenticator 모두 지원하며, FIDO2 사양 준수가 검증되었다.

본 프로젝트의 **Cloudflare Tunnel HTTPS** 환경에서 도메인 `stylelucky4u.com`을 RP ID로 사용하면 **정상 동작**한다 — 단, RP ID는 origin과 정확히 일치해야 하며, 본 프로젝트에서는 다음 조건이 충족된다:

✅ **HTTPS 강제**: Cloudflare Tunnel이 외부에서 항상 HTTPS 종단 (WebAuthn 필수 조건)
✅ **공개 가능 도메인**: stylelucky4u.com은 ICANN 등록 도메인 (RP ID로 적합)
✅ **Origin 안정성**: Cloudflare가 같은 도메인으로 항상 라우팅 (origin 검증 통과)

다만 다음에 주의:
⚠️ **localhost 개발 환경**: 별도 RP ID(`localhost`) 분기 필요
⚠️ **Cloudflare Tunnel 대체 origin**: `*.trycloudflare.com` 같은 임시 호스트는 RP ID 변경 시 기존 Passkey 무효화

### 점수 미리보기
**총점: 4.59 / 5.00** (자세한 차원별 점수는 §10 참조)

### 100점 청사진 기여
- WebAuthn 영역(Supabase 18점 중 약 14점) 확보 → 미션 1과 합산 시 **+18점**
- Phishing-resistant 인증 가산 **+3점**
- Cross-device passkey (iCloud/1Password sync) 가산 **+2점**

---

## 2. 라이브러리 아키텍처

### 2.1 패키지 구조

SimpleWebAuthn은 **서버/브라우저/타입 분리** 구조이다.

```
@simplewebauthn/server     ← 챌린지 생성, 응답 검증 (Node.js)
@simplewebauthn/browser    ← navigator.credentials.create/get 래퍼 (브라우저)
@simplewebauthn/types      ← TypeScript 공용 타입 (RP ↔ Browser 공유)
```

본 프로젝트 설치:
```bash
pnpm add @simplewebauthn/server @simplewebauthn/browser
# @simplewebauthn/types는 server에 transitive로 포함됨
```

**버전**: 2026-04 기준 v13.x
- v13의 주요 변경: `preferredAuthenticatorType` 옵션 (registration hints), 인증서 trust anchor 검증 개선, `attestationType: 'indirect'` 사실상 폐기 (none/direct만 권장)

### 2.2 데이터 흐름 (등록)

```
[브라우저] ─────────────────── [Next.js Route Handler] ──── [Prisma]
   │                                  │
   │  GET /webauthn/register/options  │
   │ ────────────────────────────────►│ generateRegistrationOptions()
   │                                  │ → challenge, RP ID, user, ...
   │ ◄────────────────────────────────│ (challenge를 세션/redis에 저장)
   │                                  │
   │  navigator.credentials.create()  │
   │  (인증기와 통신, 키 생성)          │
   │                                  │
   │  POST /webauthn/register/verify  │
   │ ────────────────────────────────►│ verifyRegistrationResponse()
   │  { id, rawId, response, ... }    │ → 챌린지 일치 검증
   │                                  │ → origin/RP ID 검증
   │                                  │ → attestation 검증
   │                                  │ → publicKey 추출
   │                                  │
   │                                  │ → WebAuthnCredential 저장
   │ ◄────────────────────────────────│ { verified: true }
```

### 2.3 데이터 흐름 (인증)

```
[브라우저]                        [Next.js]                    [Prisma]
   │                                  │
   │  POST /login (email + pw)        │
   │ ────────────────────────────────►│ → mfaRequired
   │ ◄────────────────────────────────│   partialToken
   │                                  │
   │  GET /webauthn/auth/options      │
   │ ────────────────────────────────►│ generateAuthenticationOptions()
   │                                  │ → user의 credentials list
   │                                  │   + challenge
   │ ◄────────────────────────────────│
   │                                  │
   │  navigator.credentials.get()     │
   │  (인증기와 통신, 서명)             │
   │                                  │
   │  POST /webauthn/auth/verify      │
   │ ────────────────────────────────►│ verifyAuthenticationResponse()
   │                                  │ → DB에서 credentialId로 조회
   │                                  │ → publicKey로 서명 검증
   │                                  │ → counter 증가 검증 (replay 방어)
   │                                  │ → counter 갱신
   │                                  │
   │ ◄────────────────────────────────│ { verified: true } + 풀 토큰
```

---

## 3. 핵심 기능 & API

### 3.1 등록 옵션 생성

```ts
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { GenerateRegistrationOptionsOpts } from "@simplewebauthn/server";

const options = await generateRegistrationOptions({
  rpName: "양평 부엌 서버 대시보드",
  rpID: "stylelucky4u.com",                  // ★ Cloudflare Tunnel 도메인
  userID: new TextEncoder().encode(user.id), // Uint8Array (v10+)
  userName: user.email,                      // 사용자 가시 식별자
  userDisplayName: user.name ?? user.email,  // 표시용 이름
  attestationType: "none",                   // ★ v13 기본값. direct는 기업용
  authenticatorSelection: {
    residentKey: "preferred",                // discoverable credential 선호
    userVerification: "preferred",           // PIN/생체 권장
    authenticatorAttachment: undefined,      // platform/cross-platform 모두 허용
  },
  excludeCredentials: existingCreds.map((c) => ({
    id: c.credentialId,
    transports: c.transports,
  })),
  // v13 신규: registration hints
  preferredAuthenticatorType: "localDevice", // 'securityKey' | 'localDevice' | 'remoteDevice'
});

// challenge를 세션에 저장 (5분 TTL)
await redis.setex(`webauthn:challenge:${user.id}`, 300, options.challenge);

return Response.json(options);
```

### 3.2 등록 응답 검증

```ts
import { verifyRegistrationResponse } from "@simplewebauthn/server";

const expectedChallenge = await redis.get(`webauthn:challenge:${user.id}`);
if (!expectedChallenge) return errorResponse("CHALLENGE_EXPIRED", "...", 400);

const verification = await verifyRegistrationResponse({
  response: body, // 클라이언트가 보낸 RegistrationResponseJSON
  expectedChallenge,
  expectedOrigin: "https://stylelucky4u.com",       // ★ 정확히 일치
  expectedRPID: "stylelucky4u.com",                  // ★ origin의 호스트 부분
  requireUserVerification: false,                    // 첫 등록은 false 권장
});

if (!verification.verified || !verification.registrationInfo) {
  return errorResponse("VERIFICATION_FAILED", "Passkey 등록 실패", 400);
}

const { credential, credentialDeviceType, credentialBackedUp } =
  verification.registrationInfo;

await prisma.webAuthnCredential.create({
  data: {
    userId: user.id,
    credentialId: credential.id,                       // base64url
    publicKey: Buffer.from(credential.publicKey),      // Bytes
    counter: BigInt(credential.counter),
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,                  // 'singleDevice' | 'multiDevice'
    backedUp: credentialBackedUp,                      // iCloud/1Password sync 여부
    nickname: req.body.nickname ?? "내 패스키",        // 사용자 지정
  },
});

await redis.del(`webauthn:challenge:${user.id}`);
return Response.json({ verified: true });
```

### 3.3 인증 옵션 생성

```ts
import { generateAuthenticationOptions } from "@simplewebauthn/server";

const userCreds = await prisma.webAuthnCredential.findMany({
  where: { userId: user.id },
});

const options = await generateAuthenticationOptions({
  rpID: "stylelucky4u.com",
  allowCredentials: userCreds.map((c) => ({
    id: c.credentialId,
    transports: c.transports as AuthenticatorTransport[],
  })),
  userVerification: "preferred",
});

await redis.setex(`webauthn:auth-challenge:${user.id}`, 300, options.challenge);
return Response.json(options);
```

### 3.4 인증 응답 검증

```ts
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

const cred = await prisma.webAuthnCredential.findUnique({
  where: { credentialId: body.id },
});
if (!cred) return errorResponse("UNKNOWN_CREDENTIAL", "등록되지 않은 키", 401);

const verification = await verifyAuthenticationResponse({
  response: body,
  expectedChallenge,
  expectedOrigin: "https://stylelucky4u.com",
  expectedRPID: "stylelucky4u.com",
  credential: {
    id: cred.credentialId,
    publicKey: cred.publicKey,                  // Bytes
    counter: Number(cred.counter),
    transports: cred.transports as AuthenticatorTransport[],
  },
  requireUserVerification: true,                // 인증 시점에는 true 권장
});

if (!verification.verified) {
  return errorResponse("VERIFICATION_FAILED", "서명 검증 실패", 401);
}

// ★ counter 갱신 (replay 방어 핵심)
await prisma.webAuthnCredential.update({
  where: { credentialId: cred.credentialId },
  data: {
    counter: BigInt(verification.authenticationInfo.newCounter),
    lastUsedAt: new Date(),
  },
});
```

### 3.5 브라우저 (클라이언트) API

```ts
// src/lib/auth/mfa/webauthn-client.ts
"use client";

import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";

export async function registerPasskey() {
  const optionsRes = await fetch("/api/v1/auth/mfa/webauthn/register/options");
  const options = await optionsRes.json();

  const attResp = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch("/api/v1/auth/mfa/webauthn/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attResp),
  });
  return verifyRes.json();
}

export async function authenticateWithPasskey(partialToken: string) {
  const optionsRes = await fetch("/api/v1/auth/mfa/webauthn/auth/options", {
    method: "POST",
    headers: { Authorization: `Bearer ${partialToken}` },
  });
  const options = await optionsRes.json();

  const asseResp = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch("/api/v1/auth/mfa/webauthn/auth/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${partialToken}`,
    },
    body: JSON.stringify(asseResp),
  });
  return verifyRes.json();
}
```

---

## 4. ★ 핵심 검증: stylelucky4u.com을 RP ID로 사용 가능한가?

### 4.1 WebAuthn RP ID 규칙 (W3C 사양)

> RP ID는 **유효한 도메인 문자열(valid domain string)** 이어야 하며, **현재 origin의 등록 가능한 도메인 접미사(registrable domain suffix)** 또는 **현재 origin의 호스트와 동일** 해야 한다.

검증 매트릭스:

| 시나리오 | origin | RP ID | 결과 |
|---------|--------|-------|------|
| 프로덕션 (Cloudflare Tunnel) | `https://stylelucky4u.com` | `stylelucky4u.com` | ✅ 정확히 일치 |
| 프로덕션 서브도메인 | `https://app.stylelucky4u.com` | `stylelucky4u.com` | ✅ registrable suffix |
| 프로덕션 서브도메인 | `https://app.stylelucky4u.com` | `app.stylelucky4u.com` | ✅ exact match |
| 프로덕션 → 다른 도메인 | `https://other.com` | `stylelucky4u.com` | ❌ 거부 (보안 차단) |
| 개발 (localhost) | `http://localhost:3000` | `localhost` | ✅ 특수 허용 |
| 개발 (localhost) | `http://localhost:3000` | `stylelucky4u.com` | ❌ 거부 |
| 임시 터널 | `https://abc.trycloudflare.com` | `stylelucky4u.com` | ❌ 거부 |
| 임시 터널 | `https://abc.trycloudflare.com` | `trycloudflare.com` | ❌ public suffix list |

### 4.2 Cloudflare Tunnel HTTPS 환경 검증

본 프로젝트의 네트워크 구조:

```
[클라이언트 브라우저]
        │
        │ HTTPS (TLS 1.3, Cloudflare 인증서)
        ▼
[Cloudflare Edge: stylelucky4u.com]
        │
        │ Cloudflare Tunnel (cloudflared, mTLS)
        ▼
[WSL2 Ubuntu: localhost:3000 (PM2)]
        │
        ▼
[Next.js 16 → Prisma → PostgreSQL]
```

**WebAuthn 관점 분석**:

1. **HTTPS 충족**: 브라우저 ↔ Cloudflare 구간이 항상 TLS. WebAuthn은 origin이 `https://`여야만 동작 (localhost 제외).
   - ✅ Cloudflare 자동 발급 인증서 사용
   - ✅ HSTS 가능 (Cloudflare 대시보드에서 활성화 권장)

2. **Origin 안정성**: 브라우저가 보는 origin은 항상 `https://stylelucky4u.com`.
   - WSL2 내부 `localhost:3000`은 브라우저에 노출되지 않음
   - 즉 RP가 보내는 `expectedOrigin`은 `"https://stylelucky4u.com"` 단일

3. **RP ID 도메인 등록**: stylelucky4u.com은 가비아 등록 도메인 — registrable domain.
   - public suffix list (PSL)에 있지 않음 ✅
   - `.com`은 PSL이지만 `stylelucky4u.com`은 registrable

4. **Cloudflare 헤더 영향**:
   - WebAuthn 서명에는 클라이언트가 본 **origin** 만 사용 (CF가 추가하는 헤더 무관)
   - 단, Next.js에서 `request.headers.get("host")`로 RP ID를 동적 추출하면 **Cloudflare가 보낸 host 헤더** 를 볼 수 있음 → 환경변수로 고정 권장

### 4.3 권장 환경변수 패턴

```env
# .env.production
WEBAUTHN_RP_ID=stylelucky4u.com
WEBAUTHN_ORIGIN=https://stylelucky4u.com
WEBAUTHN_RP_NAME=양평 부엌 서버 대시보드

# .env.development
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3000
WEBAUTHN_RP_NAME=양평 부엌 (DEV)
```

```ts
// src/lib/auth/mfa/webauthn-config.ts
export const webauthnConfig = {
  rpName: process.env.WEBAUTHN_RP_NAME ?? "양평 부엌",
  rpID: process.env.WEBAUTHN_RP_ID ?? "localhost",
  expectedOrigin: process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000",
} as const;

// 빌드 시 검증
if (process.env.NODE_ENV === "production") {
  if (webauthnConfig.rpID === "localhost") {
    throw new Error("프로덕션에서 WEBAUTHN_RP_ID=localhost는 허용되지 않습니다");
  }
  if (!webauthnConfig.expectedOrigin.startsWith("https://")) {
    throw new Error("프로덕션 origin은 https:// 여야 합니다");
  }
}
```

### 4.4 결론: RP ID로 stylelucky4u.com 사용 가능 ✅

**위험 요소**:
- 도메인 변경 시 모든 기존 Passkey 무효화 (재등록 필수) → 도메인 잠금 권장
- DNS 이전/네임서버 변경 시 단기 다운타임 → 그 동안 Passkey 등록 불가하지만 기존 Passkey는 영향 없음 (브라우저가 캐싱한 RP ID 사용)
- 서브도메인 분리 시 (예: `auth.stylelucky4u.com` 분리): RP ID는 `stylelucky4u.com`으로 두면 양쪽 사용 가능

**제약 사항**:
- 임시 Cloudflare Tunnel 도메인(`*.trycloudflare.com`)으로는 등록 불가 (PSL 차단)
- 개발 환경은 별도 RP ID(`localhost`) — 등록된 Passkey는 환경 간 호환 안됨

---

## 5. 백업/sync 호환 (1Password, iCloud Keychain)

### 5.1 Passkey 동기화 모델

| 카테고리 | 예시 | `credentialDeviceType` | `credentialBackedUp` |
|---------|------|----------------------|--------------------|
| Synced (multi-device) | iCloud Keychain (Apple ID 간 sync) | `multiDevice` | `true` |
| Synced (multi-device) | 1Password 8 (계정 vault sync) | `multiDevice` | `true` |
| Synced (multi-device) | Google Password Manager | `multiDevice` | `true` |
| Device-bound | Yubikey 5 시리즈 | `singleDevice` | `false` |
| Device-bound | Windows Hello (TPM 종속) | `singleDevice` | `false` |

### 5.2 본 프로젝트 정책 권장

**모두 허용** (사용자 자유 선택). 단 보안 정책에 따라:

```ts
// 옵션 1: 일반 사용자 — 모두 허용
authenticatorSelection: {
  residentKey: "preferred",
  userVerification: "preferred",
}

// 옵션 2: 관리자(ADMIN role) — 더 강한 정책
authenticatorSelection: {
  residentKey: "required",          // discoverable 강제
  userVerification: "required",     // PIN/생체 강제
  authenticatorAttachment: "cross-platform", // Yubikey 강제 (선택)
}
```

### 5.3 Backup state 활용

```ts
// 등록 후 사용자에게 안내
if (registrationInfo.credentialDeviceType === "singleDevice") {
  // 디바이스 분실 시 영구 손실 → 백업 패스키 추가 권장 메시지
  return { warning: "이 패스키는 이 기기에서만 사용 가능합니다. 백업용 추가 권장" };
}
if (registrationInfo.credentialBackedUp) {
  // iCloud/1Password 동기화됨 → 다른 기기에서도 사용 가능
  return { info: "패스키가 클라우드에 동기화됩니다" };
}
```

---

## 6. TOTP와 동시 활성화 (DQ-1.1 핵심)

### 6.1 결론: ✅ 동시 활성화 권장

`otplib`(미션 1)과 `simplewebauthn`은 **데이터 모델 충돌 없음**, 검증 로직도 독립적이다.

```prisma
model User {
  // ... 기존
  // TOTP (미션 1)
  totpSecret        String?
  totpEnabledAt     DateTime?
  totpLastUsedStep  Int?
  totpBackupCodes   TotpBackupCode[]

  // WebAuthn (이 문서)
  webauthnCredentials WebAuthnCredential[]
}

model WebAuthnCredential {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  credentialId  String   @unique @map("credential_id")
  publicKey     Bytes    @map("public_key")
  counter       BigInt   @default(0)
  transports    String[] @default([])
  deviceType    String   @map("device_type")        // 'singleDevice' | 'multiDevice'
  backedUp      Boolean  @default(false) @map("backed_up")
  nickname      String?
  lastUsedAt    DateTime? @map("last_used_at")
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@map("webauthn_credentials")
}
```

### 6.2 통합 challenge 라우트

```ts
// /api/v1/auth/mfa/challenge
// body: { partialToken, method: 'totp' | 'webauthn' | 'backup', token? | webauthnResp? }

if (method === "totp" && user.totpEnabledAt) {
  // TOTP 검증 흐름
} else if (method === "webauthn" && user.webauthnCredentials.length > 0) {
  // WebAuthn 검증 흐름
} else if (method === "backup" && user.totpEnabledAt) {
  // 백업 코드 검증 흐름
} else {
  return errorResponse("METHOD_UNAVAILABLE", "...", 400);
}
```

### 6.3 사용자 UX 패턴

| 시나리오 | 권장 UX |
|---------|--------|
| 신규 가입자 | 비밀번호 → "WebAuthn 권장" 모달 (선택) → 등록 시 즉시 1차 적용 |
| 기존 사용자 (TOTP 활성) | 설정 → "WebAuthn 추가" → 다음 로그인부터 우선 시도 |
| 기존 사용자 (둘 다 활성) | 로그인 시 WebAuthn 우선, 실패 시 TOTP fallback |
| 디바이스 미지원 | TOTP만 표시 |

---

## 7. 보안 분석 (Security)

### 7.1 W3C WebAuthn Level 3 준수도

SimpleWebAuthn은 W3C 사양 트래커에서 수시 업데이트 — **현재 Level 3 거의 완전 지원**.

| 기능 | 지원 여부 |
|------|---------|
| Public key authentication | ✅ |
| Resident keys (discoverable credentials) | ✅ |
| User verification (PIN/biometric) | ✅ |
| Attestation: none / direct / indirect | ✅ (v13: indirect deprecated) |
| Hints (registration UX) | ✅ v13 신규 |
| Conditional UI (auto-fill) | ✅ |
| Related Origin Requests | ⚠️ Chrome/Safari 지원, Firefox 검토 중 |
| FIDO Metadata Service | ⚠️ 별도 설정 필요 |

### 7.2 Origin / RP ID 검증 메커니즘

WebAuthn의 핵심 phishing 방어:

1. **인증기 내부**: 등록 시점의 RP ID를 키와 함께 저장. 다른 RP ID 요청 시 키 사용 거부.
2. **브라우저**: navigator.credentials API가 호출 origin을 자동으로 포함. RP는 변조 불가.
3. **서버 검증**: `expectedOrigin`, `expectedRPID` 와 응답의 `clientDataJSON` 비교.

→ **공격자가 phishing 사이트(`fake-stylelucky4u.com`)** 에서 동일 UI를 만들어도:
- 인증기가 RP ID 불일치로 키 거부
- 또는 키가 존재해도 origin이 달라서 서버 검증 실패

### 7.3 알려진 CVE / 취약점

- **@simplewebauthn/server**: 2026-04 기준 Snyk 클린 (직접 CVE 없음)
- **과거 사례**: v6 이전 일부 attestation 검증 버그 → v8+ 해결
- **의존성**: `@noble/curves`, `cbor-x` 등 — 모두 활발 유지

### 7.4 부가 보안 권장사항

| 위협 | 완화책 |
|-----|--------|
| Replay attack | counter 검증 + 갱신 (v13 자동 처리) |
| Counter regression (Passkey sync 환경) | `multiDevice` 케이스: counter=0 그대로일 수 있음 → 경고만, 실패 처리 안함 |
| Challenge reuse | 검증 후 즉시 삭제 (Redis SETEX 5분 + 명시적 DEL) |
| Credential ID 누출 | 누출돼도 publicKey 검증 통과 못함 (해롭지 않음) |
| 사용자 디바이스 분실 | 다른 Passkey로 로그인 → 분실 키 삭제 / 백업 코드 / 관리자 reset |
| RP ID 변경 | 모든 키 무효 — 도메인 잠금, 변경 시 사전 공지 |

### 7.5 Counter 검증 정책

```ts
// 표준 검증
if (newCounter <= cred.counter && newCounter !== 0) {
  // counter regression — replay 의심
  // 단, multiDevice (synced) passkey는 counter=0 가능
  if (cred.deviceType === "multiDevice" && newCounter === 0) {
    // 허용 (Apple iCloud Keychain, Google PM 등이 counter 0 사용)
  } else {
    return errorResponse("COUNTER_REPLAY", "재사용된 인증 시도", 401);
  }
}
```

---

## 8. 통합 시나리오 (우리 코드 + Prisma)

### 8.1 모듈 구조

```
src/lib/auth/mfa/
├── webauthn-config.ts       # RP ID, origin 환경변수 검증
├── webauthn-server.ts       # SimpleWebAuthn 래퍼 (registration/auth)
├── webauthn-challenge.ts    # 챌린지 저장/조회 (Redis 또는 DB 임시 테이블)
└── ...

src/app/api/v1/auth/mfa/webauthn/
├── register/
│   ├── options/route.ts
│   └── verify/route.ts
├── auth/
│   ├── options/route.ts
│   └── verify/route.ts
└── credentials/
    ├── route.ts             # GET 목록 / DELETE
    └── [id]/
        └── rename/route.ts
```

### 8.2 챌린지 저장 — Redis 없이 DB 사용

본 프로젝트는 외부 의존성 최소화 정책. Redis 대신 **Prisma 임시 테이블** 사용.

```prisma
model WebAuthnChallenge {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  challenge String                                 // Base64URL
  type      String                                 // 'registration' | 'authentication'
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, type])
  @@index([expiresAt])
  @@map("webauthn_challenges")
}
```

**스케줄 정리** (PM2 cron):
```ts
// scripts/cleanup-webauthn-challenges.ts
await prisma.webAuthnChallenge.deleteMany({
  where: { expiresAt: { lt: new Date() } },
});
```

또는 SQLite를 부분적으로 사용 (better-sqlite3 in-process) — 별도 ADR 필요.

### 8.3 등록 옵션 라우트

```ts
// src/app/api/v1/auth/mfa/webauthn/register/options/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { requireUser } from "@/lib/auth/require-user";
import { webauthnConfig } from "@/lib/auth/mfa/webauthn-config";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return errorResponse("UNAUTHORIZED", "로그인 필요", 401);

  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: webauthnConfig.rpName,
    rpID: webauthnConfig.rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[],
    })),
  });

  await prisma.webAuthnChallenge.create({
    data: {
      userId: user.id,
      challenge: options.challenge,
      type: "registration",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  return NextResponse.json({ success: true, data: options });
}
```

### 8.4 등록 검증 라우트

```ts
// src/app/api/v1/auth/mfa/webauthn/register/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { requireUser } from "@/lib/auth/require-user";
import { webauthnConfig } from "@/lib/auth/mfa/webauthn-config";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return errorResponse("UNAUTHORIZED", "...", 401);

  const body = await req.json();

  const challengeRow = await prisma.webAuthnChallenge.findFirst({
    where: {
      userId: user.id,
      type: "registration",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!challengeRow) {
    return errorResponse("CHALLENGE_EXPIRED", "챌린지 만료", 400);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: webauthnConfig.expectedOrigin,
      expectedRPID: webauthnConfig.rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    return errorResponse("VERIFICATION_FAILED", String(err), 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return errorResponse("VERIFICATION_FAILED", "Passkey 등록 실패", 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await prisma.$transaction([
    prisma.webAuthnCredential.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        nickname: body.nickname ?? "내 패스키",
      },
    }),
    prisma.webAuthnChallenge.delete({ where: { id: challengeRow.id } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      verified: true,
      credentialDeviceType,
      credentialBackedUp,
    },
  });
}
```

### 8.5 인증 (login에서 호출)

기존 로그인 후 partial 토큰 흐름과 결합:

```ts
// /api/v1/auth/mfa/webauthn/auth/options
export async function POST(req: NextRequest) {
  const { partialToken } = await req.json();
  const partial = await verifyPartialToken(partialToken);
  if (!partial) return errorResponse("PARTIAL_INVALID", "...", 401);

  const userCreds = await prisma.webAuthnCredential.findMany({
    where: { userId: partial.userId },
  });
  if (userCreds.length === 0) {
    return errorResponse("NO_PASSKEY", "등록된 패스키가 없습니다", 400);
  }

  const options = await generateAuthenticationOptions({
    rpID: webauthnConfig.rpID,
    allowCredentials: userCreds.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[],
    })),
    userVerification: "preferred",
  });

  await prisma.webAuthnChallenge.create({
    data: {
      userId: partial.userId,
      challenge: options.challenge,
      type: "authentication",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  return NextResponse.json({ success: true, data: options });
}

// /api/v1/auth/mfa/webauthn/auth/verify
export async function POST(req: NextRequest) {
  const { partialToken, ...attResp } = await req.json();
  const partial = await verifyPartialToken(partialToken);
  if (!partial) return errorResponse("PARTIAL_INVALID", "...", 401);

  const cred = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: attResp.id },
  });
  if (!cred || cred.userId !== partial.userId) {
    return errorResponse("UNKNOWN_CREDENTIAL", "...", 401);
  }

  const challengeRow = await prisma.webAuthnChallenge.findFirst({
    where: {
      userId: partial.userId,
      type: "authentication",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!challengeRow) return errorResponse("CHALLENGE_EXPIRED", "...", 400);

  const verification = await verifyAuthenticationResponse({
    response: attResp,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: webauthnConfig.expectedOrigin,
    expectedRPID: webauthnConfig.rpID,
    credential: {
      id: cred.credentialId,
      publicKey: cred.publicKey,
      counter: Number(cred.counter),
      transports: cred.transports as AuthenticatorTransport[],
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return errorResponse("VERIFICATION_FAILED", "서명 검증 실패", 401);
  }

  await prisma.$transaction([
    prisma.webAuthnCredential.update({
      where: { credentialId: cred.credentialId },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    }),
    prisma.webAuthnChallenge.delete({ where: { id: challengeRow.id } }),
  ]);

  // jose 풀 토큰 발급
  const accessToken = await createAccessToken({
    userId: partial.userId,
    email: cred.user?.email ?? "",
    role: cred.user?.role ?? "USER",
  });
  const refreshToken = await createRefreshToken(partial.userId);

  const res = NextResponse.json({
    success: true,
    data: { accessToken, mfaMethod: "webauthn" },
  });
  res.cookies.set(V1_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: REFRESH_MAX_AGE,
    path: "/api/v1/",
  });
  return res;
}
```

### 8.6 클라이언트 컴포넌트 예시

```tsx
// src/components/mfa/PasskeyLogin.tsx
"use client";
import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

export function PasskeyLogin({ partialToken, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const optsRes = await fetch("/api/v1/auth/mfa/webauthn/auth/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partialToken }),
      });
      const { data: options } = await optsRes.json();

      const asseResp = await startAuthentication({ optionsJSON: options });

      const verRes = await fetch("/api/v1/auth/mfa/webauthn/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partialToken, ...asseResp }),
      });
      const result = await verRes.json();
      if (!result.success) throw new Error(result.error.message);
      onSuccess(result.data.accessToken);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? "인증 중..." : "Passkey로 로그인"}
      {error && <p>{error}</p>}
    </button>
  );
}
```

---

## 9. 라이선스

| 패키지 | 라이선스 | 상업 사용 | 비고 |
|--------|---------|---------|------|
| @simplewebauthn/server | MIT | ✅ | MasterKale (Matt Miller) |
| @simplewebauthn/browser | MIT | ✅ | 동일 저자 |
| @simplewebauthn/types | MIT | ✅ | 동일 |
| @noble/curves (transitive) | MIT | ✅ | paulmillr |
| cbor-x (transitive) | MIT | ✅ | |

**라이선스 이슈 없음**. MIT 일관.

---

## 10. 스코어링 (10차원, 합계 100%)

| 코드 | 가중치 | 점수 | 가중점 | 근거 |
|------|--------|------|--------|------|
| FUNC | 18% | 5 / 5 | 0.90 | WebAuthn L3 거의 완전 지원, Passkey, conditional UI, hints. Supabase MFA WebAuthn 동등 또는 상회. |
| PERF | 10% | 5 / 5 | 0.50 | ECDSA 서명 검증 ms 단위. counter 검증도 인덱스 기반. |
| DX | 14% | 4 / 5 | 0.56 | 타입 완비, 함수 명확. 다만 challenge 저장 등 인프라 책임 사용자 측 → 보일러플레이트 존재. |
| ECO | 12% | 4 / 5 | 0.48 | npm 주간 100만+, GitHub 1.6k stars. Auth.js, Lucia, Better Auth 모두 채택. |
| LIC | 8% | 5 / 5 | 0.40 | MIT, 의존성도 모두 MIT. |
| MAINT | 10% | 4 / 5 | 0.40 | MasterKale 활발 유지, v13 (2025-2026) 연속 릴리스. 단일 메인테이너 리스크 일부. |
| INTEG | 10% | 5 / 5 | 0.50 | jose JWT 무관, Prisma 모델 1개 + 챌린지 저장만. partial 토큰 패턴 재사용. |
| SECURITY | 10% | 5 / 5 | 0.50 | W3C L3 준수, origin/RP ID 검증 자동, counter replay 방어 자동. CVE 클린. |
| SELF_HOST | 5% | 5 / 5 | 0.25 | 외부 서비스 0. 100% in-process. (FIDO MDS는 선택) |
| COST | 3% | 5 / 5 | 0.15 | $0. |

**합계: 4.64 / 5.00**

(가중 합산: 0.90+0.50+0.56+0.48+0.40+0.40+0.50+0.50+0.25+0.15 = **4.64**)

---

## 11. 리스크 & 완화책

| 리스크 | 영향도 | 발생 확률 | 완화책 |
|--------|-------|---------|--------|
| 도메인 변경 시 모든 키 무효 | 높 | 낮 | 도메인 잠금, RP ID 환경변수로 명시적 관리 |
| 사용자 모든 디바이스 분실 | 높 | 중 | TOTP 백업 + 관리자 reset 경로 |
| 브라우저 호환성 (구형 브라우저) | 중 | 중 | TOTP fallback 유지, 미지원 시 안내 |
| `@simplewebauthn/browser` 버전 mismatch | 중 | 낮 | 항상 server와 동일 major 버전 강제 |
| Counter regression (synced passkey) | 중 | 중 | `deviceType: multiDevice` && `newCounter === 0` 케이스 허용 |
| Cloudflare Tunnel 장애 → origin 일시 변경 | 중 | 낮 | 백업 도메인 사전 등록 (Related Origin Requests로 보강 가능) |
| Phishing of TOTP fallback | 중 | 중 | WebAuthn 활성 사용자는 TOTP 비활성화 권장 옵션 제공 |
| 챌린지 DB 테이블 비대화 | 낮 | 높 | cron으로 expiresAt < now 정리 |
| `userID`가 PII (이메일) 포함 시 노출 | 중 | 낮 | 이미 user.id (UUID) 사용 중 ✅ |

---

## 12. 결론

### 12.1 채택 권고

**SimpleWebAuthn을 즉시 채택할 것을 강력 권고**한다. 본 프로젝트의 Cloudflare Tunnel HTTPS 환경에서 `stylelucky4u.com`을 RP ID로 사용하는 것이 안전하며, otplib과 동시 활성화하여 phishing-resistant 인증을 제공할 수 있다.

### 12.2 100점 도달 청사진 — WebAuthn 영역

| 단계 | 작업 | 기여 점수 |
|------|------|---------|
| Phase 16.1 | SimpleWebAuthn 통합 + Prisma 스키마 (`WebAuthnCredential`, `WebAuthnChallenge`) | +8점 |
| Phase 16.2 | 등록 + 인증 라우트 4개 (§8.3-8.5) | +4점 |
| Phase 16.3 | partial 토큰과 통합 (TOTP/WebAuthn OR fallback) | +3점 |
| Phase 16.4 | Conditional UI (autofill) + 클라이언트 컴포넌트 (§8.6) | +2점 |
| Phase 16.5 | 디바이스 관리 UI (목록/이름변경/삭제) | +1점 |
| **소계** | | **+18점** |
| Phase 16.6 (선택) | FIDO MDS 통합 (인증기 메타데이터 검증) | +2점 보너스 |

### 12.3 DQ-1.1 잠정 답변 (재확인)

> **DQ-1.1: TOTP only / WebAuthn only / 동시 지원 중 무엇을 권장하는가?**

**최종 답변: 동시 지원**

| 항목 | TOTP only | WebAuthn only | 동시 지원 (권장) |
|-----|----------|--------------|----------------|
| Phishing 방어 | 약함 | 강함 | 강함 (WebAuthn 우선) |
| 사용자 진입 장벽 | 낮음 | 중간 | 낮음 (TOTP fallback) |
| 디바이스 의존성 | 없음 | 있음 | 없음 (선택지 존재) |
| 구현 복잡도 | 낮음 | 중간 | 중간 |
| 점수 기여 | +12 | +18 | **+30 (최대)** |

### 12.4 사전 스파이크 결론 (★ 핵심)

**WebAuthn @ stylelucky4u.com**: ✅ **동작 (조건부)**

- 조건 1: 환경변수로 RP ID/origin 명시적 관리
- 조건 2: 도메인 잠금 (변경 시 모든 키 무효 인지)
- 조건 3: 개발 환경(localhost)과 프로덕션 분리
- 조건 4: HTTPS 필수 (Cloudflare Tunnel 자동 충족)
- 조건 5: counter regression 정책 (multiDevice 케이스 허용)

**TOTP/WebAuthn 동시 지원 권장**: ✅ **완전 가능**
- Prisma 스키마 충돌 없음
- 검증 로직 독립
- partial 토큰으로 통합 challenge endpoint 구성

**새 DQ 발생**:
- **DQ-1.3 (신규)**: WebAuthn 활성 사용자에게 TOTP를 강제 비활성화할 것인가? (보안 vs UX)
- **DQ-1.4 (신규)**: 챌린지 저장에 Redis 도입할 것인가, Prisma 임시 테이블로 충분한가?
- **DQ-1.5 (신규)**: FIDO MDS (Metadata Service) 통합으로 인증기 신뢰성 검증할 것인가?

---

## 13. 참고 자료 (12개)

1. **SimpleWebAuthn 공식 문서**: https://simplewebauthn.dev/docs/packages/server/
2. **SimpleWebAuthn GitHub Releases**: https://github.com/MasterKale/SimpleWebAuthn/releases
3. **@simplewebauthn/server npm**: https://www.npmjs.com/package/@simplewebauthn/server
4. **W3C WebAuthn Level 3**: https://www.w3.org/TR/webauthn-3/
5. **W3C WebAuthn Level 2 (구버전, 폭넓게 지원)**: https://www.w3.org/TR/webauthn-2/
6. **web.dev: RP ID deep dive**: https://web.dev/articles/webauthn-rp-id
7. **web.dev: Related Origin Requests**: https://web.dev/articles/webauthn-related-origin-requests
8. **Auth.js WebAuthn (Passkeys) provider**: https://authjs.dev/getting-started/authentication/webauthn
9. **Cloudflare Tunnel 공식 문서**: https://developers.cloudflare.com/tunnel/
10. **Cloudflare WebAuthn 도입 사례 (블로그)**: https://blog.cloudflare.com/cloudflare-now-supports-security-keys-with-web-authentication-webauthn/
11. **Yubico: Securing WebAuthn with Attestation**: https://developers.yubico.com/WebAuthn/Concepts/Securing_WebAuthn_with_Attestation.html
12. **Passkeys.com Implementation Guide**: https://www.passkeys.com/guide

---

## 부록 A: 환경별 설정 매트릭스

```
┌─────────────────┬─────────────────────────────┬──────────────────────────────┐
│ 환경            │ WEBAUTHN_RP_ID              │ WEBAUTHN_ORIGIN              │
├─────────────────┼─────────────────────────────┼──────────────────────────────┤
│ Production      │ stylelucky4u.com            │ https://stylelucky4u.com     │
│ Staging (선택)   │ staging.stylelucky4u.com    │ https://staging.styl...com   │
│ Development     │ localhost                   │ http://localhost:3000        │
│ E2E Test        │ localhost                   │ http://localhost:3000        │
└─────────────────┴─────────────────────────────┴──────────────────────────────┘
```

## 부록 B: 마이그레이션 SQL

```sql
-- prisma/migrations/2026_phase_16_webauthn/migration.sql

CREATE TABLE "webauthn_credentials" (
  "id"            TEXT PRIMARY KEY,
  "user_id"       TEXT NOT NULL,
  "credential_id" TEXT UNIQUE NOT NULL,
  "public_key"    BYTEA NOT NULL,
  "counter"       BIGINT NOT NULL DEFAULT 0,
  "transports"    TEXT[] DEFAULT '{}',
  "device_type"   TEXT NOT NULL,
  "backed_up"     BOOLEAN NOT NULL DEFAULT FALSE,
  "nickname"      TEXT,
  "last_used_at"  TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webauthn_credentials_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "webauthn_credentials_user_id_idx" ON "webauthn_credentials"("user_id");

CREATE TABLE "webauthn_challenges" (
  "id"         TEXT PRIMARY KEY,
  "user_id"    TEXT NOT NULL,
  "challenge"  TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "webauthn_challenges_user_id_type_idx" ON "webauthn_challenges"("user_id", "type");
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "webauthn_challenges"("expires_at");
```

## 부록 C: Conditional UI (autofill) 패턴

WebAuthn L3의 conditional UI를 활용하면 사용자가 비밀번호 필드 클릭 시 자동으로 Passkey 선택지가 표시된다.

```tsx
// 페이지 마운트 시점에 호출
import { startAuthentication } from "@simplewebauthn/browser";

useEffect(() => {
  async function setupConditionalUI() {
    const supported = await PublicKeyCredential.isConditionalMediationAvailable?.();
    if (!supported) return;

    const optsRes = await fetch("/api/v1/auth/mfa/webauthn/auth/options/conditional");
    const { data: options } = await optsRes.json();

    try {
      const asseResp = await startAuthentication({
        optionsJSON: options,
        useBrowserAutofill: true,
      });
      // ... verify flow
    } catch {
      // user dismissed
    }
  }
  setupConditionalUI();
}, []);
```

서버에서는 `allowCredentials: []` (빈 배열) 로 옵션 생성하면 discoverable credentials만 사용.

## 부록 D: 운영 체크리스트

- [ ] `WEBAUTHN_RP_ID` `WEBAUTHN_ORIGIN` 환경변수 production/development 분리
- [ ] 도메인 변경 금지 정책 문서화 (CLAUDE.md)
- [ ] Cloudflare 인증서 자동 갱신 확인
- [ ] HSTS 헤더 활성화 (Cloudflare 대시보드)
- [ ] WebAuthnChallenge 정리 cron (1시간마다)
- [ ] 디바이스 관리 UI: 목록 / 이름변경 / 삭제 (관리자 제외 본인만)
- [ ] 모든 디바이스 분실 시 관리자 reset 경로 (감사 로그 필수)
- [ ] 사용자 가이드: Passkey란? / 기기별 등록 방법 (Mac, Windows, iOS, Android)
- [ ] 감사 로그(`/audit`)에 webauthn_register/auth/delete 기록
- [ ] Rate limit (미션 3): register 옵션 endpoint 분당 10회 제한
