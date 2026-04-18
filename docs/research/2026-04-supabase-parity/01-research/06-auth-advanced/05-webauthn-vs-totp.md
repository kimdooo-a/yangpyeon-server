# SimpleWebAuthn (Passkey/FIDO2) vs otplib (TOTP) — 1:1 비교 (Wave 2)

> 산출물 ID: 06/05
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> Wave 1 인용: `02-simplewebauthn-passkey-deep-dive.md` (4.64/5.00), `01-otplib-totp-deep-dive.md` (4.60/5.00)
> Wave 2 매트릭스 인용: `04-auth-advanced-matrix.md` (Phase 15 TOTP → Phase 17 WebAuthn)
> 핵심 질문: UX 마찰, 디바이스 손실 복구, 피싱 저항성, RP ID(stylelucky4u.com), 백업 코드 정책
> 결론 요약: **양쪽 모두 채택**. TOTP(Phase 15, 모든 사용자)를 먼저 도입, WebAuthn(Phase 17, 권장) 추가. 관리자/고위험 역할은 WebAuthn 강제.

---

## 0. Executive Summary

| 항목 | SimpleWebAuthn (Passkey) | otplib (TOTP) |
|---|---|---|
| 정체성 | 공개키 암호 기반 phishing-resistant 인증 | HMAC-SHA1 기반 시간제 OTP |
| 표준 | W3C WebAuthn L3 / FIDO2 | RFC 4226 (HOTP) / 6238 (TOTP) |
| 사용자 디바이스 | Touch ID, Face ID, Windows Hello, Yubikey, iCloud Keychain, 1Password 8, Google PM | Google/Microsoft/Authy/1Password Authenticator 앱 |
| 피싱 저항성 | **매우 강함** (origin/RP ID 자동 검증) | **약함** (phishing 사이트에서 코드 입력 유도 가능) |
| UX 마찰 | 낮음 (등록 후 1-tap) | 중간 (앱 열기 → 6자리 입력) |
| 등록 난이도 | 중간 (RP ID/HTTPS 필수, 브라우저 Dialog) | 낮음 (QR 스캔 1회) |
| 백업 / 복구 | Synced Passkey(iCloud/1Password)로 다기기 가능 | 8~10개 백업 코드 별도 관리 |
| 구현 복잡도 | 중 (challenge 저장, RP ID 설정) | 낮음 (stateless 검증) |
| 브라우저 호환성 | 96%+ (Chrome/Safari/Firefox/Edge 최신) | 100% (라이브러리 무관 — 사용자 앱에서만 동작) |
| Wave 1 점수 | 4.64 / 5.00 | 4.60 / 5.00 |
| 본 프로젝트 권장 | 모든 사용자에게 권장, 관리자에게 강제 | 모든 사용자 기본 2FA, 백업 코드 병행 |

---

## 1. 포지셔닝

### 1.1 TOTP의 철학: Universal Compatibility + Simple Secret

> "Authenticator 앱 하나만 있으면 어디서든 쓸 수 있는 6자리 코드. 시크릿은 한 번 QR로 교환하고 끝." — RFC 6238 의도

- **모든 사용자에게 작동**: 특수 하드웨어/생체 인증 불필요
- **오프라인 동작**: 앱이 시간만 맞으면 네트워크 없이도 코드 생성
- **저장소 위험**: 시크릿 DB 유출 시 전체 우회 가능
- **Phishable**: 사용자가 fake 사이트에 코드 입력 시 공격자가 30초 내 재사용 가능

### 1.2 SimpleWebAuthn의 철학: Phishing-Resistant + Origin-Bound

> "Passkey는 origin에 바인딩된 공개키다. Phishing 사이트는 자동으로 차단된다." — W3C WebAuthn L3

- **Origin 자동 검증**: 인증기가 등록 시 RP ID 저장 → 다른 RP 요청 거부
- **공개키 암호**: 서버에는 공개키만 저장 → DB 유출해도 안전
- **디바이스 의존**: Touch ID/Yubikey 필수 (구형 기기 미지원)
- **Cross-device**: Synced Passkey(iCloud/1Password)로 기기 간 sync

### 1.3 양평 부엌 서버와의 매핑

직원 30명, 관리자 1~3명, 1인 운영 환경. 기기 분포:
- 맥북 (관리자): Touch ID / iCloud Keychain → WebAuthn 완벽
- 안드로이드 / Windows: Google Password Manager / Windows Hello → WebAuthn 가능
- iPhone / iPad: iCloud Keychain → WebAuthn 완벽
- 일부 직원 구형 기기: WebAuthn 미지원 → TOTP fallback 필수

**결론**: **둘 다 필요**. TOTP는 universal fallback, WebAuthn은 phishing-resistant 업그레이드.

---

## 2. 기능 비교표 (15+ 항목)

### 2.1 보안 속성

| # | 속성 | WebAuthn | TOTP | 비고 |
|---|---|---|---|---|
| 1 | Phishing 저항성 | ✓✓✓ (origin 자동) | ✗ (코드 복제 가능) | WebAuthn 압승 |
| 2 | MITM 저항성 | ✓✓✓ (TLS + public key) | △ (TLS 의존) | WebAuthn 우위 |
| 3 | DB 유출 영향 | ✓ (공개키만 유출) | ✗ (시크릿 유출 = 영구 우회) | WebAuthn 압승 |
| 4 | Replay 방어 | ✓ (counter 자동) | △ (lastUsedStep 직접) | WebAuthn 자동 |
| 5 | 디바이스 탈취 영향 | ✗ (인증기 = 사용자) | ✗ (앱 접근 = 코드 생성) | 동률 |
| 6 | Social engineering (전화 등) | ✓✓ (인증기 요구) | ✗ (말로 전달 가능) | WebAuthn 우위 |

### 2.2 사용자 경험

| # | 항목 | WebAuthn | TOTP | 비고 |
|---|---|---|---|---|
| 7 | 등록 시간 | 15-30초 (브라우저 Dialog + 인증기) | 30-60초 (앱 설치 + QR 스캔) | WebAuthn 우위 |
| 8 | 로그인 시간 | 2-5초 (1-tap 또는 생체) | 10-15초 (앱 열기 + 코드 입력) | WebAuthn 압승 |
| 9 | 키 보드 입력 필요 | ✗ | ✓ (6자리) | WebAuthn 우위 |
| 10 | 모바일 UX | ✓✓✓ (Face ID) | ✓ (앱 간 전환) | WebAuthn 우위 |
| 11 | 데스크톱 UX | ✓✓ (Touch ID / PIN) | ✓ (앱 또는 데스크톱 Authenticator) | WebAuthn 우위 |
| 12 | 오프라인 동작 | ✗ (서버 검증 필수) | ✓ (앱은 코드 생성 가능) | TOTP 우위 — 단 로그인엔 무관 |

### 2.3 관리 / 운영

| # | 항목 | WebAuthn | TOTP | 비고 |
|---|---|---|---|---|
| 13 | 디바이스 분실 복구 | 다른 Passkey / 백업 코드 / 관리자 | 백업 코드 / 관리자 | 동률 |
| 14 | 디바이스 여러 개 | Synced Passkey 자동 + 개별 등록 가능 | 여러 앱에 같은 시크릿 등록 (보안 약화) | WebAuthn 우위 |
| 15 | 사용자 교육 비용 | 낮음 (OS 네이티브 Dialog) | 중간 (Authenticator 앱 선택, QR 설명) | WebAuthn 우위 |
| 16 | 관리자 reset | 동일 (credential 삭제) | 동일 (totpEnabledAt = null) | 동률 |
| 17 | 감사 로그 | `credentialId` + `deviceType` | `totpLastUsedStep` | 동률 |

### 2.4 기술 / 구현

| # | 항목 | WebAuthn | TOTP | 비고 |
|---|---|---|---|---|
| 18 | 서버 검증 복잡도 | 중 (ECDSA + counter + RP ID) | 낮음 (HMAC-SHA1) | TOTP 간결 |
| 19 | Challenge 저장 필요 | ✓ (5분 TTL) | ✗ (stateless) | TOTP 우위 |
| 20 | HTTPS 필수 | ✓ (localhost 제외) | ✗ (단 권장) | TOTP 우위 |
| 21 | RP ID 설정 | 필요 (도메인 변경 시 모든 키 무효) | 불필요 | TOTP 우위 |
| 22 | 마이그레이션 부담 | 중 (Prisma 2모델 + 라우트 4개) | 낮음 (User 3컬럼 + 라우트 3개) | TOTP 우위 |

---

## 3. 코드 비교 (2시나리오)

### 3.1 시나리오 1: 등록 플로우

#### 3.1.1 TOTP (otplib)

```typescript
// /app/api/v1/auth/mfa/totp/setup/route.ts
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { encryptSecret } from "@/lib/auth/mfa/totp-crypto";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return errorResponse("UNAUTHORIZED", "...", 401);
  if (user.totpEnabledAt) return errorResponse("ALREADY_ENABLED", "...", 409);

  // 1. 시크릿 생성 (160비트 Base32)
  const secret = authenticator.generateSecret();

  // 2. OTPAuth URL + QR
  const otpauthUrl = authenticator.keyuri(
    user.email,
    "stylelucky4u.com",
    secret
  );
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  // 3. 암호화 저장
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptSecret(secret), totpEnabledAt: null },
  });

  return NextResponse.json({
    success: true,
    data: { qrDataUrl, otpauthUrl },
  });
}
```

```typescript
// /app/api/v1/auth/mfa/totp/verify-setup/route.ts
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user || !user.totpSecret) return errorResponse(...);

  const { token } = z.object({ token: z.string().regex(/^\d{6}$/) })
    .parse(await req.json());

  // 1. 클라이언트가 QR 스캔 후 처음 본 6자리 코드 검증
  if (!verifyTotp(token, user.totpSecret)) {
    return errorResponse("INVALID_TOTP", "코드가 올바르지 않습니다", 401);
  }

  // 2. 백업 코드 10개 생성
  const codes = generateBackupCodes(10);
  await storeBackupCodes(user.id, codes);

  // 3. 활성화
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabledAt: new Date(),
      totpLastUsedStep: currentTotpStep(),
    },
  });

  return NextResponse.json({
    success: true,
    data: { enabled: true, backupCodes: codes }, // 1회만 표시
  });
}
```

**클라이언트 UX**:
```tsx
// /app/settings/mfa/totp/page.tsx
"use client";
const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
const [token, setToken] = useState("");

async function startSetup() {
  const res = await fetch("/api/v1/auth/mfa/totp/setup", { method: "POST" });
  const { data } = await res.json();
  setQrDataUrl(data.qrDataUrl);
}

async function verifySetup() {
  const res = await fetch("/api/v1/auth/mfa/totp/verify-setup", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  const { data } = await res.json();
  if (data.enabled) showBackupCodes(data.backupCodes);
}

return (
  <>
    {!qrDataUrl && <button onClick={startSetup}>TOTP 설정 시작</button>}
    {qrDataUrl && (
      <>
        <img src={qrDataUrl} alt="QR" />
        <p>Google Authenticator 앱에서 QR을 스캔하세요</p>
        <input value={token} onChange={e => setToken(e.target.value)} />
        <button onClick={verifySetup}>확인</button>
      </>
    )}
  </>
);
```

**특성**:
- 서버 코드: 약 40줄
- 클라이언트: 약 25줄
- 사용자 단계: ① 앱 설치(선택) ② QR 스캔 ③ 6자리 입력 ④ 백업 코드 저장
- 총 등록 시간: 약 45초 (첫 앱 사용자 기준)

#### 3.1.2 WebAuthn (SimpleWebAuthn)

```typescript
// /app/api/v1/auth/mfa/webauthn/register/options/route.ts
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { webauthnConfig } from "@/lib/auth/mfa/webauthn-config";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return errorResponse("UNAUTHORIZED", "...", 401);

  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: webauthnConfig.rpName,
    rpID: webauthnConfig.rpID, // "stylelucky4u.com"
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

  // Challenge DB 저장 (5분 TTL)
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

```typescript
// /app/api/v1/auth/mfa/webauthn/register/verify/route.ts
import { verifyRegistrationResponse } from "@simplewebauthn/server";

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
  if (!challengeRow) return errorResponse("CHALLENGE_EXPIRED", "...", 400);

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: webauthnConfig.expectedOrigin,
    expectedRPID: webauthnConfig.rpID,
    requireUserVerification: false,
  });

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

**클라이언트 UX**:
```tsx
// /app/settings/mfa/webauthn/page.tsx
"use client";
import { startRegistration } from "@simplewebauthn/browser";

async function registerPasskey() {
  // 1. 서버에서 options 받기
  const optsRes = await fetch("/api/v1/auth/mfa/webauthn/register/options");
  const { data: options } = await optsRes.json();

  // 2. 브라우저 Dialog → OS가 인증기와 통신 (Touch ID / Face ID / Yubikey)
  const attResp = await startRegistration({ optionsJSON: options });

  // 3. 서버 검증
  const verRes = await fetch("/api/v1/auth/mfa/webauthn/register/verify", {
    method: "POST",
    body: JSON.stringify(attResp),
  });
  const { data } = await verRes.json();
  if (data.verified) showSuccess(`${data.credentialDeviceType} 등록 완료`);
}

return <button onClick={registerPasskey}>Passkey 등록</button>;
```

**특성**:
- 서버 코드: 약 70줄
- 클라이언트: 약 15줄 (UI 단순)
- 사용자 단계: ① 버튼 클릭 ② OS Dialog에서 생체 인증 ③ 끝
- 총 등록 시간: 약 15초

#### 3.1.3 비교

| 기준 | TOTP | WebAuthn |
|---|---|---|
| 서버 코드 | 40줄 | 70줄 |
| 클라이언트 코드 | 25줄 | 15줄 |
| 사용자 단계 | 4 | 2~3 |
| 첫 등록 시간 | 45초 | 15초 |
| 인프라 요구 | HTTPS (권장) | HTTPS (필수, localhost 제외) |
| DB 저장 | User 3컬럼 | Credential 모델 + Challenge 임시 |
| 백업 코드 | 필수 (bcrypt 10개) | 선택 (Synced Passkey로 대체 가능) |

### 3.2 시나리오 2: 검증 플로우 (로그인 2단계)

#### 3.2.1 TOTP

```typescript
// /app/api/v1/auth/mfa/challenge/route.ts (TOTP 부분)
export async function POST(req: NextRequest) {
  const { partialToken, token } = await req.json();

  const partial = await verifyPartialToken(partialToken);
  if (!partial) return errorResponse("PARTIAL_INVALID", "...", 401);

  const user = await prisma.user.findUnique({ where: { id: partial.userId } });
  if (!user || !user.totpSecret) return errorResponse("STATE_ERROR", "...", 400);

  // Replay 방어: lastUsedStep 이후의 step만 허용
  const step = currentTotpStep();
  if (user.totpLastUsedStep && user.totpLastUsedStep >= step - 1) {
    return errorResponse("TOTP_REPLAY", "이미 사용된 코드입니다", 401);
  }

  // HMAC-SHA1 검증 (window: 1 → ±30초 허용)
  if (!verifyTotp(token, user.totpSecret)) {
    return errorResponse("MFA_INVALID", "코드가 올바르지 않습니다", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpLastUsedStep: step },
  });

  // 풀 토큰 발급
  const accessToken = await createAccessToken({ userId: user.id, email: user.email, role: user.role });
  const refreshToken = await createRefreshToken(user.id);
  // ...
  return NextResponse.json({ success: true, data: { accessToken, mfaMethod: "totp" } });
}
```

**클라이언트**:
```tsx
function TotpChallenge({ partialToken, onSuccess }: Props) {
  const [token, setToken] = useState("");
  async function submit() {
    const res = await fetch("/api/v1/auth/mfa/challenge", {
      method: "POST",
      body: JSON.stringify({ partialToken, token }),
    });
    // ...
  }
  return (
    <>
      <p>Authenticator 앱에서 6자리 코드를 입력하세요</p>
      <input value={token} onChange={e => setToken(e.target.value)} />
      <button onClick={submit}>확인</button>
    </>
  );
}
```

**사용자 단계**: ① 앱 열기 ② 코드 복사 ③ 붙여넣기 ④ 확인

#### 3.2.2 WebAuthn

```typescript
// /app/api/v1/auth/mfa/webauthn/auth/options/route.ts
import { generateAuthenticationOptions } from "@simplewebauthn/server";

export async function POST(req: NextRequest) {
  const { partialToken } = await req.json();
  const partial = await verifyPartialToken(partialToken);
  if (!partial) return errorResponse("PARTIAL_INVALID", "...", 401);

  const userCreds = await prisma.webAuthnCredential.findMany({
    where: { userId: partial.userId },
  });
  if (userCreds.length === 0) return errorResponse("NO_PASSKEY", "...", 400);

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
```

```typescript
// /app/api/v1/auth/mfa/webauthn/auth/verify/route.ts
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

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
    where: { userId: partial.userId, type: "authentication", expiresAt: { gt: new Date() } },
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

  // counter regression 방어 (multiDevice 케이스 허용)
  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter <= Number(cred.counter) && !(cred.deviceType === "multiDevice" && newCounter === 0)) {
    return errorResponse("COUNTER_REPLAY", "재사용된 인증 시도", 401);
  }

  await prisma.$transaction([
    prisma.webAuthnCredential.update({
      where: { credentialId: cred.credentialId },
      data: { counter: BigInt(newCounter), lastUsedAt: new Date() },
    }),
    prisma.webAuthnChallenge.delete({ where: { id: challengeRow.id } }),
  ]);

  const accessToken = await createAccessToken({ userId: partial.userId, /* ... */ });
  const refreshToken = await createRefreshToken(partial.userId);
  return NextResponse.json({ success: true, data: { accessToken, mfaMethod: "webauthn" } });
}
```

**클라이언트**:
```tsx
import { startAuthentication } from "@simplewebauthn/browser";

async function authenticatePasskey(partialToken: string) {
  // 1. options 받기
  const optsRes = await fetch("/api/v1/auth/mfa/webauthn/auth/options", {
    method: "POST",
    body: JSON.stringify({ partialToken }),
  });
  const { data: options } = await optsRes.json();

  // 2. 브라우저 Dialog → 생체 인증 or PIN
  const asseResp = await startAuthentication({ optionsJSON: options });

  // 3. 서버 검증 (서명 확인)
  const verRes = await fetch("/api/v1/auth/mfa/webauthn/auth/verify", {
    method: "POST",
    body: JSON.stringify({ partialToken, ...asseResp }),
  });
  return verRes.json();
}
```

**사용자 단계**: ① 버튼 클릭 ② 생체 인증 ③ 끝

#### 3.2.3 비교

| 기준 | TOTP | WebAuthn |
|---|---|---|
| 서버 코드 | 25줄 | 75줄 (options + verify 합계) |
| 클라이언트 | 15줄 | 20줄 |
| 사용자 행동 | 4단계 | 2단계 |
| 평균 시간 | 12초 | 3초 |
| Replay 방어 코드 | `lastUsedStep` 직접 비교 | counter 자동 (v13) |
| Phishing 감지 | ✗ (사용자 입력 의존) | ✓ 자동 (RP ID) |
| 오프라인 가능 | 앱은 코드 생성 가능 (서버 검증엔 무관) | 불가 |

---

## 4. 성능 비교

### 4.1 검증 응답 시간

| 단계 | TOTP | WebAuthn |
|---|---|---|
| Partial token 검증 | 0.5ms | 0.5ms |
| User/Credential lookup | 2ms | 2ms |
| Challenge lookup (WebAuthn만) | — | 2ms |
| 서명/HMAC 검증 | < 0.1ms (HMAC-SHA1) | 3-5ms (ECDSA/RS256) |
| Counter update | 1ms (TOTP lastStep) | 2ms (BigInt + transaction) |
| 총 평균 | **3.6ms** | **9.5ms** |

### 4.2 병렬 처리

- TOTP: stateless 검증 → 동시성 무제한
- WebAuthn: challenge row lookup + credential update → row lock 가능하나 사용자당 1 session → 실질 무영향

### 4.3 사용자 체감 시간 (네트워크 포함)

| | TOTP | WebAuthn |
|---|---|---|
| 네트워크 RTT | 50ms × 2 (options 없음) = 50ms | 50ms × 2 (options + verify) = 100ms |
| 서버 처리 | 4ms | 10ms |
| 사용자 행동 | 12초 (앱 열기) | 3초 (생체) |
| 총 체감 | **12.1초** | **3.1초** |

**시사점**: WebAuthn이 네트워크 왕복 1회 더 많지만, 사용자 행동 시간 우위로 총 체감 4배 빠름.

---

## 5. 피싱 저항성 상세

### 5.1 TOTP의 취약점

공격 시나리오:
```
1. 공격자가 phishing 사이트 fake-stylelucky4u.com 구축
2. 사용자 유도: "비밀번호 만료" 메일 → fake 사이트 방문
3. 사용자가 이메일 + 비밀번호 입력 → 공격자 서버로 전송
4. 공격자가 진짜 stylelucky4u.com에 로그인 → MFA partial token 획득
5. 공격자가 fake 사이트에 "2단계 인증 코드 입력"  UI 표시
6. 사용자가 TOTP 6자리 입력 → 공격자가 30초 내 진짜 사이트에 입력
7. 공격자 로그인 성공
```

**TOTP는 이 공격을 막을 수 없다** — 코드 자체는 phishing 사이트에서 읽을 수 있기 때문.

### 5.2 WebAuthn의 방어

같은 시나리오 시도 시:
```
1~4. 동일
5. 공격자가 fake 사이트에서 navigator.credentials.get() 호출
6. 브라우저가 origin = fake-stylelucky4u.com 을 포함한 challenge를 인증기에 전달
7. 인증기는 등록 시점의 RP ID = stylelucky4u.com 과 불일치 → 키 사용 거부
8. 공격자가 사용자 서명 획득 불가 → 로그인 실패
```

**추가 방어**: 공격자가 클라이언트 코드를 수정해서 RP ID를 위조하려 해도:
- 브라우저가 자동으로 `clientDataJSON`에 origin을 포함 → 서버의 `expectedOrigin` 검증에서 차단
- 인증기 내부에 RP ID가 저장되어 있어 RP 요청을 무조건 거부

### 5.3 WebAuthn의 한계

- 사용자가 여전히 fake 사이트에서 비밀번호 입력 가능 (1단계는 약함)
- 단, 2단계가 자동 차단되므로 공격자가 로그인 완료 불가
- 완전 방어를 원하면 Passwordless (WebAuthn 단독) 전환 필요

**양평 부엌 서버 권장**: Phase 17 이후 관리자 역할은 **Passwordless**(비밀번호 + WebAuthn → WebAuthn 단독) 고려.

---

## 6. 디바이스 손실 복구 전략

### 6.1 TOTP 손실 시

| 상황 | 복구 방법 |
|---|---|
| 앱 삭제 but 기기 있음 | 앱 재설치 후 기존 시크릿 복원 (1Password는 자동) |
| 기기 분실 | 백업 코드 8~10개 중 1개 사용 → TOTP 재설정 |
| 백업 코드도 분실 | 관리자 reset (totpEnabledAt = null) |
| 모든 관리자 분실 | 최후의 수단: DB 직접 수정 (운영자 개입) |

### 6.2 WebAuthn 손실 시

| 상황 | 복구 방법 |
|---|---|
| Synced Passkey (iCloud/1Password) | 다른 기기에서 자동 sync로 로그인 |
| Device-bound (Yubikey, Windows Hello) | 다른 등록된 인증기 사용 |
| 모든 인증기 분실 | 관리자 reset (credential 삭제) + TOTP fallback 또는 백업 코드 |
| TOTP도 활성 | TOTP로 로그인 후 새 Passkey 등록 |

### 6.3 복구 정책 권장 (양평 부엌 서버)

**계층 구조**:
1. **1차 (자동)**: 여러 디바이스에 Passkey 등록 또는 Synced Passkey
2. **2차 (사용자)**: TOTP fallback
3. **3차 (사용자)**: 백업 코드 10개 (TOTP 설정 시 자동 생성, 1회 인쇄)
4. **4차 (관리자)**: 관리자 reset 경로 (`/admin/users/[id]/mfa-reset`)
5. **5차 (운영자)**: DB 직접 수정 (감사 로그 필수)

**정책**:
- 모든 사용자: **TOTP 필수** + **WebAuthn 권장**
- 관리자 역할: **WebAuthn 필수** + TOTP 백업
- 백업 코드: TOTP 설정 시 자동 10개, WebAuthn만 있는 사용자에게는 "복구 코드" 10개 별도 생성

---

## 7. stylelucky4u.com 도메인에서의 RP ID 설정

### 7.1 WebAuthn 전용 고려사항 (TOTP는 해당 없음)

| 시나리오 | RP ID | origin | 동작 |
|---|---|---|---|
| Production (Cloudflare Tunnel) | `stylelucky4u.com` | `https://stylelucky4u.com` | ✅ |
| 서브도메인 (`app.stylelucky4u.com`) | `stylelucky4u.com` | `https://app.stylelucky4u.com` | ✅ (registrable suffix) |
| Development | `localhost` | `http://localhost:3000` | ✅ |
| 임시 Tunnel (`*.trycloudflare.com`) | `stylelucky4u.com` | `https://abc.trycloudflare.com` | ❌ |

### 7.2 환경변수 설정

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

### 7.3 도메인 변경 리스크

WebAuthn 특이점: RP ID를 변경하면 **기존 모든 Passkey 무효**가 된다. 해결책:
- 도메인 잠금 (계약서에 stylelucky4u.com 고정)
- Related Origin Requests (Chrome/Safari 지원) — 대체 origin 사전 등록
- 변경 시 사용자에게 **30일 사전 공지** + 재등록 유도

### 7.4 TOTP는 RP ID 제약 없음

TOTP는 `keyuri(email, issuer, secret)`의 `issuer`만 사용자 가시용 이름 → 도메인 변경과 무관. 시크릿은 사용자 앱에 저장되어 서버 도메인과 독립.

---

## 8. 브라우저 호환성

### 8.1 WebAuthn

| 브라우저 | 버전 | Passkey | Conditional UI | 비고 |
|---|---|---|---|---|
| Chrome | 108+ | ✓ | ✓ | Google PM sync |
| Safari | 16+ | ✓ | ✓ | iCloud Keychain sync |
| Firefox | 122+ | ✓ | ⚠️ (부분) | 보수적 |
| Edge | 108+ | ✓ | ✓ | Windows Hello |
| iOS Safari | 16+ | ✓ | ✓ | iCloud sync |
| Android Chrome | 108+ | ✓ | ✓ | Google PM |

2026-04 기준 전세계 약 **96%+ 지원**. 구형 브라우저는 TOTP fallback.

### 8.2 TOTP

라이브러리 무관. 사용자 앱(Google Authenticator 등)이 QR만 스캔하면 어떤 브라우저에서도 6자리 입력 가능 → **100% 호환**.

---

## 9. 점수 비교

### 9.1 Wave 1 점수

| 차원 | WebAuthn | TOTP |
|---|---|---|
| FUNC (18%) | 5.0 → 0.90 | 4.0 → 0.72 |
| PERF (10%) | 5.0 → 0.50 | 5.0 → 0.50 |
| DX (14%) | 4.0 → 0.56 | 5.0 → 0.70 |
| ECO (12%) | 4.0 → 0.48 | 4.0 → 0.48 |
| LIC (8%) | 5.0 → 0.40 | 5.0 → 0.40 |
| MAINT (10%) | 4.0 → 0.40 | 4.0 → 0.40 |
| INTEG (10%) | 5.0 → 0.50 | 5.0 → 0.50 |
| SECURITY (10%) | 5.0 → 0.50 | 5.0 → 0.50 |
| SELF_HOST (5%) | 5.0 → 0.25 | 5.0 → 0.25 |
| COST (3%) | 5.0 → 0.15 | 5.0 → 0.15 |
| **합계** | **4.64** | **4.60** |

### 9.2 격차 해석

- WebAuthn이 FUNC(+0.18)에서 우위: Conditional UI, Phishing-resistant, Account linking 공식 지원
- TOTP가 DX(+0.14)에서 우위: API 단순성, challenge 저장 불필요, HTTPS 불필요

→ **0.04점 차이**는 통계적 의미 없음. 둘 다 채택 가능하며, 실질 결정은 상황별 정책에 맡김.

---

## 10. 상황별 권장

### 10.1 TOTP 단독으로 충분한 경우

- Phishing 위협 낮음 (폐쇄형 내부 도구)
- 사용자가 구형 기기 or WebAuthn 미지원 환경
- 빠른 도입 (몇 시간 안에 MFA 활성화 필요)
- 개발/테스트 환경 (localhost HTTPS 제약 회피)

### 10.2 WebAuthn 단독으로 가는 경우

- 모든 사용자가 최신 기기 (B2B/내부 직원)
- Phishing 위협 높음 (금융, 의료, 정부)
- UX 최우선 (1-tap 로그인 요구)
- Passwordless로 진화 로드맵 있음

### 10.3 둘 다 활성화 (양평 부엌 서버 권장)

| 사용자 유형 | 필수 | 권장 | 백업 |
|---|---|---|---|
| 일반 직원 (STAFF) | TOTP | WebAuthn (1개 이상) | 백업 코드 10개 |
| 매니저 (MANAGER) | TOTP | WebAuthn (2개 이상 권장) | 백업 코드 10개 |
| 관리자 (ADMIN) | WebAuthn (2개 이상) | TOTP 병행 | 백업 코드 10개 + 하드웨어 키 1개 |
| 익명 게스트 | 없음 | 없음 | — |

---

## 11. 양평 부엌 서버 결론

### 11.1 최종 결정

**둘 다 채택 (Phase 15 TOTP → Phase 17 WebAuthn)**

근거:
1. 점수 격차 0.04 → 본질적으로 동등
2. TOTP는 100% 호환, WebAuthn은 96% 호환 → TOTP가 universal fallback
3. WebAuthn은 Phishing-resistant, TOTP는 보완
4. Wave 1 두 deep-dive 모두 "동시 지원 +30점" 결론
5. 마이그레이션 비용 각 4h/8h로 합리적

### 11.2 사용자 유형별 강제/권장 정책

```typescript
// src/lib/auth/mfa/policy.ts
export function requiredMfa(user: User): {
  requireTotp: boolean;
  requireWebAuthn: boolean;
  requireBackupCodes: boolean;
} {
  if (user.role === "ADMIN") {
    return {
      requireTotp: false, // WebAuthn이 더 강함
      requireWebAuthn: true, // 최소 1개 필수
      requireBackupCodes: true, // 복구용
    };
  }
  if (user.role === "MANAGER") {
    return {
      requireTotp: true, // 기본 필수
      requireWebAuthn: false, // 권장 배너 표시
      requireBackupCodes: true,
    };
  }
  // STAFF
  return {
    requireTotp: true, // 2FA 의무화
    requireWebAuthn: false,
    requireBackupCodes: true,
  };
}
```

### 11.3 UX 패턴

```
[로그인 성공: partial token 발급]
  ↓
[MFA 선택 UI]
  - 등록된 WebAuthn 있으면 "Passkey로 인증" 버튼 (우선)
  - TOTP 활성 → "인증 앱 코드 입력"
  - 둘 다 실패 시 "백업 코드 사용"
  ↓
[성공: 풀 토큰 발급]
```

### 11.4 1인 운영 컨텍스트 — 백업 코드 정책

양평 부엌 서버 운영자(김도영, smartkdy7@naver.com) 개인 관점:
- **본인 자신은 WebAuthn 2개 + TOTP + 백업 코드 10개 모두 활성화**
- 백업 코드는 **1Password vault에 저장** (디지털 백업) + **인쇄본 금고 보관** (물리 백업)
- TOTP 시크릿 백업은 1Password Authenticator 자동 sync 활용

일반 직원(30명):
- 최소 TOTP 필수 (도입 부담 최소)
- 백업 코드 **반드시 다운로드 또는 인쇄** 확인 (UI에서 체크박스 강제)
- 직원 분실 시 관리자(본인) reset 경로 — 감사 로그 기록

### 11.5 미해결 DQ

| # | 질문 | 우선 답변 |
|---|---|---|
| DQ-WT-1 | WebAuthn 활성 사용자에게 TOTP 자동 비활성화? | 사용자 선택 (옵션 제공) |
| DQ-WT-2 | Conditional UI (autofill) 활성화 시점? | Phase 17 완료 후 안정화 2주 뒤 |
| DQ-WT-3 | Passwordless 전환 (비밀번호 폐기)? | 관리자 역할만 1년 후 검토 |
| DQ-WT-4 | 백업 코드 표시 방식: 한번만 vs 재조회 가능? | 한번만 (재조회 = 재생성으로만) |
| DQ-WT-5 | 관리자 MFA reset 시 이메일 알림 누구에게? | 본인 + 운영자(김도영) 양측 |
| DQ-WT-6 | Synced Passkey (iCloud) vs Device-bound (Yubikey) 선호? | 사용자 자유, 관리자는 Yubikey 권장 |
| DQ-WT-7 | FIDO MDS 통합으로 인증기 메타데이터 검증? | Phase 17 이후 검토 (+2점 보너스) |

### 11.6 구현 체크리스트 요약

**Phase 15 (TOTP)**:
- [ ] otplib + qrcode 설치
- [ ] Prisma User 3컬럼 + TotpBackupCode 모델
- [ ] TOTP_KEK_HEX 환경변수 (openssl rand -hex 32)
- [ ] AES-256-GCM 암호화 헬퍼
- [ ] `/mfa/totp/setup` + `/verify-setup` + `/disable` 라우트
- [ ] 백업 코드 10개 생성 + bcrypt 저장
- [ ] partial token 발급/검증
- [ ] `/mfa/challenge` (TOTP + 백업 코드)
- [ ] 로그인 UX: TOTP enabled 시 입력 화면
- [ ] E2E 테스트

**Phase 17 (WebAuthn)**:
- [ ] @simplewebauthn/server + /browser 설치
- [ ] Prisma WebAuthnCredential + WebAuthnChallenge
- [ ] WEBAUTHN_RP_ID/ORIGIN/RP_NAME 환경변수
- [ ] `/mfa/webauthn/register/options` + `/verify`
- [ ] `/mfa/webauthn/auth/options` + `/verify`
- [ ] 디바이스 관리 UI (목록/이름변경/삭제)
- [ ] Conditional UI (autofill)
- [ ] 로그인 UX: WebAuthn 우선, TOTP fallback
- [ ] Challenge 정리 cron
- [ ] 감사 로그 (webauthn_register/auth/delete)
- [ ] E2E 테스트 (Touch ID 시뮬레이터)

---

## 12. 참고 자료

1. Wave 1 01-otplib-totp-deep-dive.md (자체)
2. Wave 1 02-simplewebauthn-passkey-deep-dive.md (자체)
3. Wave 2 04-auth-advanced-matrix.md (자체)
4. RFC 6238 (TOTP) — https://datatracker.ietf.org/doc/html/rfc6238
5. RFC 4226 (HOTP) — https://datatracker.ietf.org/doc/html/rfc4226
6. W3C WebAuthn Level 3 — https://www.w3.org/TR/webauthn-3/
7. FIDO Alliance — https://fidoalliance.org/specifications/
8. web.dev: WebAuthn RP ID — https://web.dev/articles/webauthn-rp-id
9. web.dev: Passkeys — https://web.dev/articles/passkey-registration
10. passkeys.com Implementation Guide — https://www.passkeys.com/guide
11. SimpleWebAuthn 공식 — https://simplewebauthn.dev/docs/
12. otplib 공식 — https://otplib.yeojz.dev/
13. OWASP MFA Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
14. NIST 800-63B (Digital Identity, AAL levels) — https://pages.nist.gov/800-63-3/sp800-63b.html
15. Yubico: Securing WebAuthn with Attestation — https://developers.yubico.com/WebAuthn/
16. Apple Passkey docs — https://developer.apple.com/passkeys/
17. Google Identity Passkeys — https://developers.google.com/identity/passkeys
18. Cloudflare Tunnel docs — https://developers.cloudflare.com/tunnel/
19. 1Password Passkeys — https://1password.com/product/passkeys
20. Can I Use WebAuthn — https://caniuse.com/webauthn

---

(문서 끝 — SimpleWebAuthn vs otplib 1:1 비교 Wave 2)
