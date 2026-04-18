# Spike 009 — TOTP + WebAuthn MVP 검증

- 작성일: 2026-04-18
- 상태: Planned
- 스택: otplib@12 + @simplewebauthn/server@10 + Next.js 16 App Router / Node.js 24 / ngrok
- 관련 Phase: Auth Advanced Phase 15 착수 전 사전 검증 (22h MVP)
- 기간: 1일 (8h)
- 담당 에이전트: kdywave Wave 5 S2
- kdyspike 명령: `/kdyspike --full totp-webauthn-mvp --max-hours 8`

## 1. 목적

Phase 15 1순위 MVP(Auth Advanced 22h)를 다른 카테고리와 **병렬 시작 가능한지** 판별한다. 차단 요소(라이브러리 비호환, 도메인 RP ID 오류, FIDO MDS rate limit 등)를 사전 제거하여 Phase 15 착수일을 앞당긴다.

**구체적 문제 진술**:

1. `otplib@12` + Next.js 16 App Router — `crypto` 모듈 의존성이 Edge Runtime에서 동작하는지 미확인.
2. `@simplewebauthn/server@10` — Node.js 24 환경에서 `TextEncoder` / `SubtleCrypto` WebCrypto API 호환성 미확인.
3. stylelucky4u.com 도메인이 WebAuthn Relying Party ID(RP ID)로 동작하는지 미확인 (Cloudflare Tunnel 경유 HTTPS 환경).
4. Conditional UI (`mediation: 'conditional'`) — Chrome 121+에서 autocomplete 트리거 작동 여부 실제 확인 필요 (DQ-AA-9).
5. FIDO MDS API rate limit 정책 미확인 — 빈번한 authenticator 검증 시 차단 가능성.

---

## 2. 배경 및 컨텍스트

### 2.1 ADR-007 채택안 요약

ADR-007(Auth Advanced Blueprint §2.1):

| 라이브러리 | 버전 | 용도 | 가중 점수 |
|-----------|------|------|---------|
| `otplib` | 12.x | TOTP/HOTP RFC 6238 구현 | 4.60 |
| `@simplewebauthn/server` | 10.x | FIDO2/CTAP2 서버 검증 | 4.64 |
| `@simplewebauthn/browser` | 10.x | 브라우저 등록/인증 | 4.64 |
| `rate-limiter-flexible` | 5.x | PG 기반 Rate Limit | 4.52 |

### 2.2 Phase 15 WBS 개요

```
Phase 15-A (4h): TOTP MFA — secret 생성 + QR + 검증 + 백업 코드
Phase 15-B (8h): WebAuthn Passkey — 등록 + 인증 + credential 관리
Phase 15-C (6h): Rate Limit PG — brute-force 방어 + 감사 로그
Phase 15-D (4h): 백업 코드 8개 + 통합 감사 로그
총 22h → Auth Advanced 15점 → 60점 (+45점)
```

### 2.3 연관 DQ / ADR

| ID | 내용 | 상태 |
|----|------|------|
| DQ-1.1 | TOTP vs WebAuthn 동시 지원 여부 | 확정 (동시 지원) |
| DQ-AA-3 | FIDO MDS 통합 — authenticator metadata 검증 | 미확정 (본 스파이크) |
| DQ-AA-9 | Conditional UI 지원 여부 | 미확정 (본 스파이크) |
| ADR-007 | Auth Advanced 채택안 | Accepted |

---

## 3. 가설

### H1: otplib@12 + Next.js 16 App Router 통합 0 호환 이슈

**근거**: otplib@12는 Node.js 14+ 지원. Next.js 16 App Router는 `crypto` 모듈을 Node.js 런타임에서 정상 사용 가능. Edge Runtime은 사용하지 않음 (서버 액션 = Node.js 런타임).

**반증 조건**: `totp.generate()` / `totp.verify()` 호출 시 `crypto` 관련 ReferenceError 또는 TypeScript 타입 충돌.

### H2: SimpleWebAuthn@10 + Node.js 24 + iOS Safari 17/Chrome 121 모두 작동한다

**근거**: @simplewebauthn/server@10은 Web Cryptography API (SubtleCrypto)를 사용. Node.js 18+에서 글로벌로 사용 가능. 브라우저 호환 매트릭스는 공식 문서 기준 iOS Safari 16+, Chrome 67+.

**반증 조건**: `generateRegistrationOptions()` 또는 `verifyRegistrationResponse()` 호출 실패. iOS Safari에서 `PublicKeyCredential` 미지원 오류.

### H3: stylelucky4u.com 도메인이 WebAuthn RP ID로 검증 통과한다

**근거**: WebAuthn 스펙 — RP ID는 등록 도메인의 유효한 registrable domain suffix여야 함. stylelucky4u.com은 Cloudflare Tunnel + HTTPS 환경으로 표준 조건 충족.

**반증 조건**: `verifyRegistrationResponse` 시 `rpId mismatch` 오류. 또는 Cloudflare Tunnel의 중간 도메인(*.trycloudflare.com)이 RP ID로 강제 사용되는 경우.

### H4: TOTP secret + WebAuthn credential의 PG 저장(envelope 암호화)이 정상 작동한다

**근거**: AES-256-GCM envelope 암호화 패턴 — Node.js `crypto.createCipheriv`로 구현. PG `bytea` 컬럼에 암호문 저장. Prisma UPSERT로 관리.

**반증 조건**: 복호화 실패 (IV 불일치) 또는 Prisma `bytea` 직렬화 오류.

### H5: Conditional UI(DQ-AA-9) — Chrome/Edge 121+에서 정상 작동한다

**근거**: Conditional Mediation은 Chrome 108+에서 지원. `input[autocomplete="webauthn"]` 힌트 + `PublicKeyCredential.isConditionalMediationAvailable()` API 확인.

**반증 조건**: `isConditionalMediationAvailable()` 반환값 false. 또는 autocomplete passkey 목록 미표시.

---

## 4. 실험 계획

### 4.0 환경 구성

```
개발 서버: WSL2 + Next.js 16 dev (localhost:3000)
HTTPS 터널: ngrok http 3000 (또는 stylelucky4u.com canary 배포)
인증기 목록:
  - macOS Touch ID (플랫폼 인증기)
  - Windows Hello (플랫폼 인증기)
  - YubiKey 5 NFC (로밍 키)
브라우저 목록:
  - Chrome 121+ (Windows/macOS)
  - Edge 121+
  - Safari 17 (macOS)
  - Firefox 121+
  - iOS Safari 17
```

환경 변수 (.env.local):

```
NEXTAUTH_URL=https://<ngrok-subdomain>.ngrok.io
WEBAUTHN_RP_ID=<ngrok-subdomain>.ngrok.io
WEBAUTHN_RP_NAME=양평부엌서버대시보드
TOTP_SECRET_ENCRYPTION_KEY=<32바이트 hex>
FIDO_MDS_API_KEY=<FIDO Alliance 발급>
```

### 4.1 실험 1 — TOTP 등록 + 검증 플로우

**목표**: H1 검증 — otplib@12 + Next.js 16 App Router 0 호환 이슈.

**구현 대상** (스크래치 코드):

```typescript
// src/lib/totp/totp-service.ts (스파이크용)
import { totp, authenticator } from 'otplib';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);  // 160-bit base32
}

export function generateQrCodeUrl(secret: string, email: string): string {
  return authenticator.keyuri(email, '양평부엌서버', secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

// envelope 암호화 (AES-256-GCM)
export function encryptSecret(plaintext: string, key: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag: authTag.toString('hex'),
  });
}

export function decryptSecret(ciphertext: string, key: string): string {
  const { iv, data, tag } = JSON.parse(ciphertext);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
}
```

**서버 액션** (App Router):

```typescript
// src/app/actions/totp.ts
'use server';
import { generateTotpSecret, verifyTotp, encryptSecret } from '@/lib/totp/totp-service';

export async function setupTotp(userId: string) {
  const secret = generateTotpSecret();
  const encryptedSecret = encryptSecret(secret, process.env.TOTP_SECRET_ENCRYPTION_KEY!);
  // Prisma로 PG 저장 (totp_credentials 테이블)
  return { qrUrl: generateQrCodeUrl(secret, userId) };
}

export async function verifyTotpSetup(userId: string, token: string) {
  // PG에서 암호화된 secret 조회 → 복호화 → 검증
  return { verified: verifyTotp(token, decryptedSecret) };
}
```

**테스트 시나리오**:
1. QR 코드 생성 → Google Authenticator 스캔
2. 6자리 TOTP 입력 → `verifyTotp()` 검증 (10회 반복)
3. Authy 앱으로 동일 QR 스캔 → 검증
4. 1Password에서 TOTP 생성 → 검증

**측정 항목**:
- `generateTotpSecret()` 오류 유무
- `verifyTotp()` 성공률 (10회 중 몇 회)
- 암호화/복호화 라운드트립 정확성
- 백업 코드 8개 생성 + SHA-256 해시 저장 확인

**예상 소요**: 1.5h

### 4.2 실험 2 — WebAuthn 등록 + 인증 플로우

**목표**: H2 + H3 검증 — SimpleWebAuthn@10 × Node.js 24 × 5개 브라우저.

**서버 구현** (스크래치):

```typescript
// src/lib/webauthn/webauthn-service.ts (스파이크용)
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const RP_ID = process.env.WEBAUTHN_RP_ID!;
const RP_NAME = process.env.WEBAUTHN_RP_NAME!;
const ORIGIN = `https://${RP_ID}`;

export async function startRegistration(userId: string, userName: string) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId),
    userName,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  // challenge를 세션/DB에 임시 저장
  return options;
}

export async function finishRegistration(
  userId: string,
  response: unknown,
  expectedChallenge: string
) {
  const verification = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: false,
  });
  // credential을 PG에 저장
  return verification;
}
```

**브라우저별 등록 테스트 체크리스트**:

| 브라우저 | 버전 | 플랫폼 인증기 | 등록 성공 | 인증 성공 | 비고 |
|---------|------|-------------|----------|----------|------|
| Chrome | 121+ | macOS Touch ID | | | |
| Chrome | 121+ | Windows Hello | | | |
| Edge | 121+ | Windows Hello | | | |
| Safari | 17 | macOS Touch ID | | | |
| Firefox | 121+ | YubiKey | | | |
| iOS Safari | 17 | Face ID | | | |

**예상 소요**: 2h

### 4.3 실험 3 — Conditional UI 검증 (DQ-AA-9)

**목표**: H5 검증 — Chrome 121+에서 `mediation: 'conditional'` autocomplete 트리거.

**구현 포인트**:

```typescript
// 브라우저 측 (클라이언트 컴포넌트)
'use client';
import { startAuthentication } from '@simplewebauthn/browser';

export async function initiateConditionalAuth() {
  // 1단계: Conditional UI 지원 확인
  const supported = await PublicKeyCredential.isConditionalMediationAvailable();
  if (!supported) {
    console.warn('Conditional UI 미지원 환경');
    return null;
  }

  // 2단계: 서버에서 옵션 취득
  const options = await fetch('/api/auth/webauthn/authenticate').then(r => r.json());

  // 3단계: mediation: 'conditional'로 인증 시작
  const response = await startAuthentication({
    optionsJSON: options,
    useBrowserAutofill: true,  // Conditional UI 활성화
  });

  return response;
}
```

HTML input 설정:

```html
<!-- autocomplete="webauthn" 힌트 필수 -->
<input
  type="text"
  name="username"
  autocomplete="username webauthn"
  placeholder="이메일 또는 패스키로 로그인"
/>
```

**테스트 시나리오**:
1. 사전에 passkey 1개 이상 등록 (실험 2에서)
2. 로그인 페이지 접근 → username input 클릭 또는 포커스
3. 브라우저 autocomplete 드롭다운에 passkey 목록 표시 여부 확인
4. passkey 선택 → 생체 인증 → 로그인 완료

**판정 기준**:

| 상태 | 조건 | DQ-AA-9 답변 |
|------|------|------------|
| 완전 성공 | Chrome 121+에서 autocomplete passkey 표시 | Phase 15에서 구현 |
| 부분 성공 | 일부 브라우저에서만 동작 | Phase 15 구현 + 폴백 버튼 추가 |
| 실패 | 모든 환경에서 미동작 | Phase 22+ 보류 |

**예상 소요**: 1h

### 4.4 실험 4 — FIDO MDS 통합 (DQ-AA-3)

**목표**: FIDO MDS API를 통한 authenticator metadata 검증 + rate limit 확인.

**FIDO MDS 통합 개요**:

FIDO Metadata Service(MDS3)는 인증기의 공개 메타데이터(모델명, AAGUID, 보안 등급 등)를 JSON으로 제공. 등록 시 authenticator의 AAGUID로 MDS를 조회하여 신뢰 레벨을 검증.

**구현 포인트** (스파이크용 최소 구현):

```typescript
// src/lib/webauthn/fido-mds.ts
const MDS_ENDPOINT = 'https://mds3.fidoalliance.org/';

// JWT 다운로드 + 파싱 (24h 캐시)
let mdsCache: { entries: MdsEntry[]; cachedAt: number } | null = null;

export async function fetchMdsEntries(): Promise<MdsEntry[]> {
  const now = Date.now();
  if (mdsCache && now - mdsCache.cachedAt < 86_400_000) {
    return mdsCache.entries;  // 캐시 히트
  }
  const response = await fetch(MDS_ENDPOINT);
  const jwt = await response.text();
  // JWT 검증 (RS256) + payload 파싱
  const payload = parseAndVerifyMdsJwt(jwt);
  mdsCache = { entries: payload.entries, cachedAt: now };
  return mdsCache.entries;
}

export async function lookupAuthenticator(aaguid: string): Promise<MdsEntry | null> {
  const entries = await fetchMdsEntries();
  return entries.find(e => e.aaguid === aaguid) ?? null;
}
```

**측정 항목**:
- MDS JWT 다운로드 + 파싱 소요 시간 (목표 ≤ 500ms, 캐시 없을 때)
- 캐시 히트 시 응답 시간 (목표 ≤ 5ms)
- 알려진 AAGUID (YubiKey 5 NFC = `fa2b99dc-9e39-4257-8f92-4a30d23c4118`) 조회 성공 여부
- rate limit 정책 확인 (연속 1분 내 10회 이상 요청 시 응답 코드)

**캐싱 전략** (rate limit 방어):

```
전략: 24h 메모리 캐시 + PM2 재시작 시 파일 캐시 로드
캐시 키: MDS_JWT_CACHE (단일 엔트리)
만료: 24h
갱신: 만료 전 1h에 백그라운드 prefetch
```

**예상 소요**: 1h

### 4.5 실험 5 — stylelucky4u.com RP ID 시뮬

**목표**: H3 검증 — Cloudflare Tunnel 환경에서 stylelucky4u.com RP ID 사용 가능.

**시나리오 A (ngrok)**: 로컬 개발 시 ngrok 서브도메인을 RP ID로 사용.

```
WEBAUTHN_RP_ID=<ngrok-id>.ngrok.io
WEBAUTHN_RP_ORIGIN=https://<ngrok-id>.ngrok.io
```

**시나리오 B (실제 도메인)**: stylelucky4u.com canary 배포로 실제 RP ID 검증.

```
WEBAUTHN_RP_ID=stylelucky4u.com
WEBAUTHN_RP_ORIGIN=https://stylelucky4u.com
```

**검증 포인트**:
- `verifyRegistrationResponse` 시 `expectedRPID` 불일치 오류 유무
- Cloudflare Tunnel HTTPS 헤더(`X-Forwarded-For`, `CF-Visitor`) 영향 확인
- 등록된 credential이 동일 RP ID 하에서 재인증 성공 여부

**예상 소요**: 0.5h

### 4.6 실험 6 — 백업 코드 8개 생성 + 1회 사용 후 만료

**목표**: H4 추가 검증 — 백업 코드 SHA-256 해시 저장 + 소진 로직.

**구현 포인트**:

```typescript
// src/lib/auth/backup-codes.ts
import { randomBytes, createHash } from 'crypto';

export function generateBackupCodes(count: number = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(5).toString('hex').toUpperCase()  // 10자리 hex
  );
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function verifyBackupCode(
  inputCode: string,
  storedHashes: string[]
): { valid: boolean; usedIndex: number | null } {
  const inputHash = hashBackupCode(inputCode.toUpperCase().replace(/-/g, ''));
  const idx = storedHashes.indexOf(inputHash);
  return { valid: idx !== -1, usedIndex: idx };
}
```

DB 스키마 (스파이크용):

```sql
CREATE TABLE backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**테스트 시나리오**:
1. 백업 코드 8개 생성 → SHA-256 해시 → PG 저장
2. 유효한 코드 입력 → 검증 성공 → `used_at = NOW()` 업데이트
3. 동일 코드 재입력 → 검증 실패 (이미 사용됨)
4. 8개 모두 소진 → 재발급 플로우 트리거

**예상 소요**: 0.5h (결과 정리 포함)

---

## 5. 측정 도구

| 도구 | 용도 | 비고 |
|------|------|------|
| **Chrome DevTools** | WebAuthn 로그 (`chrome://webauthn-internals/`) | 등록/인증 상세 로그 |
| **ngrok** | HTTPS 터널 (WebAuthn 요구사항) | `ngrok http 3000` |
| **Google Authenticator** | TOTP 검증 인증기 | 실제 앱 테스트 |
| **Authy** | TOTP 검증 인증기 (멀티 기기) | 실제 앱 테스트 |
| **1Password** | TOTP + Passkey 통합 인증기 | 실제 앱 테스트 |
| **YubiKey 5 NFC** | 로밍 WebAuthn 인증기 | FIDO2 CTAP2 검증 |
| **BrowserStack** | iOS Safari 17 크로스 브라우저 테스트 | 물리 기기 없을 때 대안 |
| **Node.js console.time** | 각 API 호출 소요 시간 측정 | FIDO MDS 캐시 효과 |
| **pg_stat_statements** | Prisma 쿼리 패턴 확인 | credential 저장 쿼리 |

---

## 6. 성공 기준

| ID | 기준 | 목표값 | 측정 방법 |
|----|------|--------|----------|
| **S1** | TOTP 검증 성공률 | 10/10회 (3개 앱) | 실험 1 수동 테스트 |
| **S2** | WebAuthn 등록 + 인증 | ≥ 5개 브라우저 성공 | 실험 2 체크리스트 |
| **S3** | Conditional UI 작동 | Chrome 121+ 성공 | 실험 3 판정 |
| **S4** | FIDO MDS 응답 시간 | ≤ 500ms (콜드), ≤ 5ms (캐시) | 실험 4 측정 |
| **S5** | TOTP 암호화/복호화 라운드트립 | 정확도 100% | 실험 1 assert |
| **S6** | stylelucky4u.com RP ID 검증 통과 | `rpId mismatch` 오류 없음 | 실험 5 |
| **S7** | 백업 코드 1회 사용 후 만료 | 재사용 시 실패 | 실험 6 |

---

## 7. 실패 기준 및 대응

| 실패 조건 | 영향 | 즉각 대응 |
|-----------|------|----------|
| **F1** otplib@12 런타임 오류 | Phase 15-A 착수 불가 | otplib@11 다운그레이드 + 호환성 재확인 |
| **F2** SimpleWebAuthn@10 등록 실패 (어떤 브라우저라도) | Phase 15-B 리스크 | @simplewebauthn@9 다운그레이드 + 단순 플랫폼 인증기만 지원 |
| **F3** Conditional UI 전면 미작동 | DQ-AA-9 No | Phase 22+ 보류. "표준 버튼 방식만" 결정 |
| **F4** FIDO MDS rate limit 위반 (≥ 10회/분) | Phase 15 MDS 도입 불가 | 캐싱 우선 구현. MDS 없이 attestation: 'none' 진행 |
| **F5** stylelucky4u.com RP ID 불일치 | 프로덕션 WebAuthn 사용 불가 | Cloudflare Workers 프록시 헤더 수정 + RP ID = 서브도메인 분리 |
| **F6** PG bytea 직렬화 오류 | credential 저장 실패 | `text` 타입으로 Base64 인코딩 저장으로 대체 |

---

## 8. 결과 분기 (결정 트리)

```
실험 1 + 2 결과 (TOTP + WebAuthn 기본)
├─ 모두 성공
│   → [분기 A] Phase 15 즉시 착수 가능
│     · Auth Advanced Blueprint §FIDO MDS 정식 통합
│     · Phase 15 병렬 시작 승인
│
└─ 부분 실패 (특정 라이브러리/버전)
    → [분기 B] 라이브러리 다운그레이드 후 재검증 1h 추가
      · otplib@11 또는 @simplewebauthn@9 교체
      · Phase 15 착수 3일 지연

실험 3 결과 (Conditional UI)
├─ Chrome 121+ 성공 → DQ-AA-9: "Phase 15에서 구현"
├─ 일부 브라우저만 → DQ-AA-9: "구현 + 폴백 버튼"
└─ 전면 실패 → DQ-AA-9: "Phase 22+ 보류"

실험 4 결과 (FIDO MDS)
├─ 응답 ≤ 500ms + rate limit 없음 → MDS 정식 통합
├─ 응답 ≤ 500ms + rate limit 있음 → 24h 캐싱 후 통합
└─ 응답 > 500ms 또는 API 차단 → attestation: 'none' 우선 진행
```

---

## 9. 산출물 목록

| # | 산출물 | 형식 | 용도 |
|---|--------|------|------|
| 1 | `totp-service-spike.ts` | TypeScript | otplib 통합 스크래치 |
| 2 | `webauthn-service-spike.ts` | TypeScript | SimpleWebAuthn 통합 스크래치 |
| 3 | `fido-mds-spike.ts` | TypeScript | FIDO MDS 캐싱 어댑터 초안 |
| 4 | `browser-compat-matrix.md` | 표 | 5개 브라우저 × 등록/인증 결과 |
| 5 | `conditional-ui-findings.md` | Markdown | DQ-AA-9 최종 답변 |
| 6 | `spike-009-result.md` | Markdown | 최종 결과 + Phase 15 착수 승인 여부 |

---

## 10. 일정 (8h 세부)

| 시간대 | 작업 | 병렬 가능 | 산출물 |
|--------|------|----------|--------|
| 0-0.5h | 환경 구성 (ngrok + dev 서버 + 인증기 준비) | — | 환경 확인 |
| 0.5-2h | 실험 1: TOTP 등록 + 검증 (3개 앱) | — | totp-service-spike.ts |
| 2-4h | 실험 2: WebAuthn 등록 + 인증 (5개 브라우저) | 브라우저 병렬 | browser-compat-matrix.md |
| 4-5h | 실험 3: Conditional UI (Chrome/Edge 집중) | 실험 2 후 | conditional-ui-findings.md |
| 5-6h | 실험 4: FIDO MDS + rate limit 측정 | 실험 2와 병렬 | fido-mds-spike.ts |
| 6-6.5h | 실험 5: RP ID 시뮬 (stylelucky4u.com) | — | 결과 메모 |
| 6.5-7h | 실험 6: 백업 코드 생성 + 소진 검증 | — | 결과 메모 |
| 7-8h | 결과 정리 + 분기 결정 + DQ 답변 확정 | — | spike-009-result.md |

---

## 11. 관련 문서 및 ADR

| 문서/ADR | 관계 |
|---------|------|
| `02-architecture/03-auth-advanced-blueprint.md` | 본 스파이크 결과가 §FIDO MDS, §Conditional UI 섹션에 반영 |
| `01-research/06-auth-advanced/01-otplib-totp-deep-dive.md` | H1 근거 원본 |
| `01-research/06-auth-advanced/02-simplewebauthn-passkey-deep-dive.md` | H2/H3 근거 원본 |
| `01-adr-log.md §ADR-007` | Auth Advanced 채택 결정 — 본 스파이크로 실행 가능성 확정 |
| DQ-AA-3 | FIDO MDS 통합 여부 — 실험 4로 확정 |
| DQ-AA-9 | Conditional UI — 실험 3으로 확정 |

---

## 12. kdyspike 연계

```bash
# 전체 스파이크 실행
/kdyspike --full totp-webauthn-mvp --max-hours 8

# 부분 실행 (Conditional UI만)
/kdyspike --experiment conditional-ui --max-hours 1

# FIDO MDS rate limit 집중 검증
/kdyspike --experiment fido-mds --focus rate-limit --max-hours 1

# 결과 통합
/kdyspike --summarize totp-webauthn-mvp --output spike-009-result.md
```

에이전트 병렬 실행 가능 단위:
- 실험 1 (TOTP) + 실험 4 (FIDO MDS): 병렬 가능 (독립)
- 실험 2 (WebAuthn): 실험 1 환경 공유, 브라우저별 병렬
- 실험 3 (Conditional UI): 실험 2 credential 등록 후 순차
- 실험 5 + 6: 소규모 — 순차

---

## 13. 다음 TODO (스파이크 완료 후)

- [ ] `spike-009-result.md` 작성 (DQ-AA-3, DQ-AA-9 최종 답변 포함)
- [ ] ADR-007 §실행 가능성 확인 섹션 갱신
- [ ] Auth Advanced Blueprint §FIDO MDS 캐싱 전략 반영
- [ ] DQ-AA-3 답변 업데이트 (`01-adr-log.md`)
- [ ] DQ-AA-9 답변 업데이트 — Conditional UI Phase 확정
- [ ] Phase 15 착수 승인 (분기 A 시: 즉시 / 분기 B 시: 라이브러리 교체 후)
- [ ] Phase 15-B 공수 조정 (FIDO MDS 캐싱 +2h 추가 여부)
