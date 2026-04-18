# 03. Auth Advanced Blueprint — 양평 부엌 서버 대시보드

> Wave 4 · Tier 2 (B1) 산출물 — kdywave W4-B1 (Agent Security-1)
> 작성일: 2026-04-18 (세션 28)
> 카테고리 6: Auth Advanced (Phase 15 MVP 1순위)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md)
> 근거: Wave 1 `01-research/06-auth-advanced/` 5문서 · Wave 2 C 매트릭스 · Wave 3 Vision Suite

---

## 0. 문서 목적

이 Blueprint는 카테고리 6(Auth Advanced)의 **구현 설계도**다. Wave 5 로드맵이 이 문서에서 WBS를 추출하고, 개발자가 Phase 15 착수 시 이 문서를 단일 참조 진실 소스로 사용한다.

**현재 점수 15점 → Phase 15 목표 60점 → Phase 22 보너스 100점**

---

## 1. 요약

### 1.1 카테고리 현황

| 항목 | 내용 |
|------|------|
| 카테고리 | Auth Advanced (카테고리 #6) |
| 현재 점수 | 15 / 100 — 14개 카테고리 중 최하위 |
| Phase 15 목표 | 60 / 100 (+45점, 22h) |
| Phase 22 보너스 목표 | 100 / 100 |
| 구현 우선순위 | **1순위** (Wave 3 `10-14-categories-priority.md §5.1`) |
| 핵심 결정 ADR | ADR-007 (Accepted, 2026-04-18) |
| Phase 레이어 | L3 Auth Advanced (ADR-018 9-레이어 구조) |

### 1.2 Phase 15 목표 달성 경로

```
현재 15점
  +12 TOTP MFA (FR-6.1) ─────────── Phase 15-A (4h)
  +15 WebAuthn/Passkey (FR-6.2) ─── Phase 15-B (8h)
  +10 Rate Limit PG (FR-6.3) ──────── Phase 15-C (6h)
  +8  백업 코드 + 감사 로그 ─────────── Phase 15-D (4h)
= 60점 도달 (22h 총 공수)
```

### 1.3 핵심 결정 3줄 요약

1. **TOTP + WebAuthn + Rate Limit 동시 채택**: 단일 MFA 방식은 피싱·호환성 취약점을 구조적으로 해결 불가. 3종 동시 구현으로 최대 +45점 달성 (ADR-007).
2. **PostgreSQL UNLOGGED 테이블 기반 Rate Limit**: Redis 미도입 (ADR-007 §결정). `rate_limit_events` PG counter로 Brute-force 방어. QPS 임계 초과 시 Redis 이전 트리거 명시.
3. **revokedAt + tokenFamily 하이브리드 Refresh Rotation**: DQ-AA-8 확정 답변 — 단순 `revokedAt` 방식은 Reuse Detection 불완전, `tokenFamily` 테이블 병행으로 가족 단위 무효화 지원.

---

## 2. Wave 1-2 채택안 인용

### 2.1 Wave 1 Deep-dive 결론 (5 문서)

**`01-research/06-auth-advanced/01-otplib-totp-deep-dive.md` §11.3**

> "DQ-1.1 잠정 답변: 동시 지원 (TOTP 우선 도입 + WebAuthn 후속). 근거: otplib + simplewebauthn 스키마 충돌 없음. TOTP만 선택하면 피싱에 취약하고, WebAuthn만 선택하면 Safari iOS 16 이전 미지원 위험."

채택안: **`otplib@12.x`** — RFC 6238 TOTP, HOTP 구현. MIT 라이선스. totp.generate() / totp.verify() API. base32 secret 호환.

**`01-research/06-auth-advanced/02-simplewebauthn-passkey-deep-dive.md` §12.3**

> "최종 답변: 동시 지원. TOTP only +12, WebAuthn only +18, 동시 지원 +30 최대. @simplewebauthn/server + @simplewebauthn/browser 조합. Node.js 18+, Next.js App Router 호환 확인."

채택안: **`@simplewebauthn/server@10.x`** + **`@simplewebauthn/browser@10.x`** — FIDO2/CTAP2 완전 구현. 피싱 저항형. Platform authenticator (Touch ID, Windows Hello) + Roaming key (YubiKey) 모두 지원.

**`01-research/06-auth-advanced/03-rate-limiter-flexible-deep-dive.md` §12.3**

> "DQ-1.2 최종 답변: PostgreSQL (Prisma 어댑터). 이유: 이미 운영 중인 PG, cluster 전환 시 코드 변경 불필요, 감사 로그와 JOIN 가능. rate-limiter-flexible PostgreSQL 어댑터 사용."

채택안: **`rate-limiter-flexible@5.x`** — PostgreSQL 어댑터 (`RateLimiterPostgres`). 고정 윈도우 + 슬라이딩 윈도우 지원. in-memory fallback 내장.

**`01-research/06-auth-advanced/04-auth-advanced-matrix.md` §0 Executive Summary**

> "구현 순서: Phase 15(TOTP 4h) → Phase 16(RL 6h) → Phase 17(WebAuthn 8h) → Phase 18(CAPTCHA 3h, 선택) = 약 21h. 상위 3개(B/A/C)는 점수 격차가 0.12 이내 → 함께 채택 권장."

Wave 2 C 매트릭스 최종 점수: **otplib 4.60 / SimpleWebAuthn 4.64 / rate-limiter-flexible 4.52** — 14개 카테고리 전체 중 Auth Advanced 채택안이 Wave 2에서 **최고 평균 점수(4.59/5)** 기록.

**`01-research/06-auth-advanced/05-webauthn-vs-totp.md`**

> "결론: TOTP 백업 코드 8개 (SHA-256 해시 저장), WebAuthn 1인 최대 5 credential 등록. 동시 활성 상태에서 WebAuthn 우선, TOTP는 WebAuthn 실패 시 대안. 사용자 선택 (DQ-AA-1 잠정답변)."

### 2.2 Wave 2 C 매트릭스 핵심 표

| 후보 | 가중점수 | FUNC | SECURITY | SELF_HOST | 채택 여부 |
|------|---------|------|---------|---------|---------|
| B SimpleWebAuthn | **4.64** | 5.0 | 5.0 | 5.0 | 채택 |
| A otplib | **4.60** | 4.0 | 5.0 | 5.0 | 채택 |
| C rate-limiter-flexible | **4.52** | 4.0 | 4.0 | 5.0 | 채택 |
| D hCaptcha | 3.90 | 4.0 | 4.0 | 2.0 | 조건부 (Turnstile 대체) |

---

## 3. 컴포넌트 설계

### 3.1 6개 모듈 구조

```
src/lib/auth/advanced/
├── MFAController.ts         ← MFA 흐름 오케스트레이터
├── TOTPService.ts           ← TOTP 생성/검증 (otplib)
├── WebAuthnService.ts       ← WebAuthn 등록/검증 (@simplewebauthn)
├── MFABackupCodeService.ts  ← 백업 코드 생성/검증/재발급
├── RateLimitGuard.ts        ← Rate Limit 미들웨어 (rate-limiter-flexible)
└── MFAEnforcementPolicy.ts  ← MFA 강제 정책 (admin 100%, editor 선택)
```

### 3.2 `MFAController`

MFA 인증 흐름의 **최상위 오케스트레이터**. 로그인 후 MFA 단계를 조율하고 Partial Token을 발급한다.

```typescript
// src/lib/auth/advanced/MFAController.ts

import { TOTPService } from './TOTPService'
import { WebAuthnService } from './WebAuthnService'
import { MFABackupCodeService } from './MFABackupCodeService'
import { MFAEnforcementPolicy } from './MFAEnforcementPolicy'
import type { User } from '@prisma/client'

export interface MFAVerifyResult {
  success: boolean
  method: 'totp' | 'webauthn' | 'backup_code'
  sessionUpgraded: boolean
  error?: string
}

export interface PartialToken {
  sub: string           // user_id
  partial: true
  mfa_required: true
  methods: Array<'totp' | 'webauthn'>
  exp: number           // 5분 유효
}

export class MFAController {
  constructor(
    private totp: TOTPService,
    private webauthn: WebAuthnService,
    private backup: MFABackupCodeService,
    private policy: MFAEnforcementPolicy
  ) {}

  /**
   * 로그인 1단계 완료 후 MFA 필요 여부 판단
   * @returns { required: true, partialToken } | { required: false }
   */
  async checkMFARequired(user: User): Promise<
    | { required: true; partialToken: string; methods: string[] }
    | { required: false }
  > {
    const isRequired = await this.policy.isMFARequired(user)
    if (!isRequired) return { required: false }

    const methods = await this.getAvailableMethods(user.id)
    const partialToken = await this.issuePartialToken(user, methods)
    return { required: true, partialToken, methods }
  }

  /**
   * MFA 검증 통합 처리
   */
  async verifyMFA(
    userId: string,
    method: 'totp' | 'webauthn' | 'backup_code',
    payload: unknown
  ): Promise<MFAVerifyResult> {
    switch (method) {
      case 'totp':
        return this.totp.verify(userId, payload as string)
      case 'webauthn':
        return this.webauthn.verifyAssertion(userId, payload)
      case 'backup_code':
        return this.backup.consume(userId, payload as string)
      default:
        return { success: false, method, sessionUpgraded: false, error: '지원하지 않는 MFA 방식' }
    }
  }

  private async getAvailableMethods(userId: string): Promise<Array<'totp' | 'webauthn'>> {
    const [hasTotp, hasWebauthn] = await Promise.all([
      this.totp.isEnrolled(userId),
      this.webauthn.hasCredentials(userId)
    ])
    const methods: Array<'totp' | 'webauthn'> = []
    if (hasWebauthn) methods.push('webauthn') // WebAuthn 우선
    if (hasTotp) methods.push('totp')
    return methods
  }

  private async issuePartialToken(user: User, methods: string[]): Promise<string> {
    // jose SignJWT — 5분 유효 Partial Token
    // Auth Core JWTService.signPartial() 호출
    const { JWTService } = await import('../core/JWTService')
    return JWTService.signPartial({ sub: user.id, methods })
  }
}
```

### 3.3 `TOTPService`

```typescript
// src/lib/auth/advanced/TOTPService.ts

import * as OTPAuth from 'otpauth'
import { prisma } from '@/lib/db/prisma'
import { VaultService } from '@/lib/observability/VaultService'
import type { MFAVerifyResult } from './MFAController'

export class TOTPService {
  private vault: VaultService

  constructor() {
    this.vault = new VaultService()
  }

  /**
   * TOTP 등록 시작 — 시드 생성 + QR URI 반환
   * 단, activatedAt = null (사용자가 첫 코드 검증 후 활성화)
   */
  async beginEnrollment(userId: string): Promise<{
    secret: string        // base32 (UI 표시용, 한번만 노출)
    otpAuthUri: string    // QR 코드 생성용
    qrDataUrl: string     // base64 PNG
  }> {
    const totp = new OTPAuth.TOTP({
      issuer: '양평 부엌 대시보드',
      label: userId,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.generate(20), // 20 bytes = 32 base32 chars
    })

    const plainSecret = totp.secret.base32
    // Vault를 통해 AES-256-GCM 암호화 저장
    const encryptedPayload = await this.vault.encrypt(plainSecret, `mfa.totp.${userId}`)

    await prisma.mfaTotpSecret.upsert({
      where: { userId },
      create: {
        userId,
        encryptedSeed: Buffer.from(encryptedPayload.ciphertext, 'base64'),
        dekId: encryptedPayload.dekId,
        activatedAt: null,
      },
      update: {
        encryptedSeed: Buffer.from(encryptedPayload.ciphertext, 'base64'),
        dekId: encryptedPayload.dekId,
        activatedAt: null,
      },
    })

    const QRCode = await import('qrcode')
    const qrDataUrl = await QRCode.toDataURL(totp.toString())

    return { secret: plainSecret, otpAuthUri: totp.toString(), qrDataUrl }
  }

  /**
   * TOTP 코드 검증 (등록 확인 + 로그인 검증 공통)
   */
  async verify(userId: string, token: string): Promise<MFAVerifyResult> {
    const record = await prisma.mfaTotpSecret.findUnique({ where: { userId } })
    if (!record) {
      return { success: false, method: 'totp', sessionUpgraded: false, error: 'TOTP 미등록' }
    }

    const plainSecret = await this.vault.decrypt({
      ciphertext: record.encryptedSeed.toString('base64'),
      dekId: record.dekId,
    })

    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(plainSecret),
      digits: 6,
      period: 30,
    })

    // ±30초 드리프트 허용 (window: 1)
    const delta = totp.validate({ token, window: 1 })

    if (delta === null) {
      return { success: false, method: 'totp', sessionUpgraded: false, error: '잘못된 TOTP 코드' }
    }

    // 최초 검증 시 activatedAt 설정
    if (!record.activatedAt) {
      await prisma.mfaTotpSecret.update({
        where: { userId },
        data: { activatedAt: new Date(), lastUsedAt: new Date() },
      })
    } else {
      await prisma.mfaTotpSecret.update({
        where: { userId },
        data: { lastUsedAt: new Date() },
      })
    }

    return { success: true, method: 'totp', sessionUpgraded: true }
  }

  async isEnrolled(userId: string): Promise<boolean> {
    const record = await prisma.mfaTotpSecret.findUnique({ where: { userId } })
    return !!record?.activatedAt
  }

  async revoke(userId: string): Promise<void> {
    await prisma.mfaTotpSecret.deleteMany({ where: { userId } })
  }
}
```

### 3.4 `WebAuthnService`

```typescript
// src/lib/auth/advanced/WebAuthnService.ts

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/types'
import { prisma } from '@/lib/db/prisma'
import type { MFAVerifyResult } from './MFAController'

const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'stylelucky4u.com'
const RP_NAME = '양평 부엌 대시보드'
const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? 'https://stylelucky4u.com'
const CHALLENGE_TTL_MS = 60_000 // 60초 (DQ-AA-2: Prisma 임시 테이블)
const MAX_CREDENTIALS_PER_USER = 5

export class WebAuthnService {
  /**
   * 등록 옵션 생성 — challenge는 SQLite webauthn_challenges 테이블에 저장
   */
  async beginRegistration(userId: string, userEmail: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existingCredentials = await prisma.mfaWebauthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    })

    if (existingCredentials.length >= MAX_CREDENTIALS_PER_USER) {
      throw new Error(`최대 ${MAX_CREDENTIALS_PER_USER}개 credential만 등록 가능합니다.`)
    }

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: userEmail,
      attestationType: 'none', // 단순화 — MDSv3 Phase 22에서 강화
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: existingCredentials.map(c => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransport[],
      })),
    })

    // SQLite에 challenge 임시 저장 (TTL 60초)
    const { drizzle } = await import('@/lib/db/drizzle')
    await drizzle.webauthnChallenges.upsert(userId, {
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    })

    return options
  }

  /**
   * 등록 응답 검증 및 credential 저장
   */
  async completeRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    nickname?: string
  ): Promise<{ credentialId: string; deviceType: string }> {
    const challenge = await this.consumeChallenge(userId)

    const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    })

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('WebAuthn 등록 검증 실패')
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    await prisma.mfaWebauthnCredential.create({
      data: {
        userId,
        credentialId: Buffer.from(credential.id),
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        deviceType: credentialDeviceType,
        backupEligible: credentialBackedUp,
        backupState: credentialBackedUp,
        transports: response.response.transports ?? [],
        nickname: nickname ?? `기기 ${Date.now()}`,
      },
    })

    return { credentialId: Buffer.from(credential.id).toString('base64url'), deviceType: credentialDeviceType }
  }

  /**
   * 인증 옵션 생성
   */
  async beginAuthentication(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await prisma.mfaWebauthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    })

    if (credentials.length === 0) throw new Error('등록된 WebAuthn credential 없음')

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: credentials.map(c => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransport[],
      })),
    })

    const { drizzle } = await import('@/lib/db/drizzle')
    await drizzle.webauthnChallenges.upsert(userId, {
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    })

    return options
  }

  /**
   * 인증 응답 검증
   */
  async verifyAssertion(userId: string, response: unknown): Promise<MFAVerifyResult> {
    const challenge = await this.consumeChallenge(userId)
    const authResponse = response as AuthenticationResponseJSON

    const credentialId = Buffer.from(authResponse.id, 'base64url')
    const credential = await prisma.mfaWebauthnCredential.findFirst({
      where: { userId, credentialId },
    })

    if (!credential) {
      return { success: false, method: 'webauthn', sessionUpgraded: false, error: 'credential 미등록' }
    }

    let verification: VerifiedAuthenticationResponse
    try {
      verification = await verifyAuthenticationResponse({
        response: authResponse,
        expectedChallenge: challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: credential.credentialId,
          publicKey: credential.publicKey,
          counter: Number(credential.counter),
          transports: credential.transports as AuthenticatorTransport[],
        },
        requireUserVerification: false,
      })
    } catch {
      return { success: false, method: 'webauthn', sessionUpgraded: false, error: 'WebAuthn 검증 실패' }
    }

    if (!verification.verified) {
      return { success: false, method: 'webauthn', sessionUpgraded: false, error: 'WebAuthn 검증 실패' }
    }

    // counter 업데이트 (replay 방지)
    await prisma.mfaWebauthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    })

    return { success: true, method: 'webauthn', sessionUpgraded: true }
  }

  async hasCredentials(userId: string): Promise<boolean> {
    const count = await prisma.mfaWebauthnCredential.count({ where: { userId } })
    return count > 0
  }

  private async consumeChallenge(userId: string): Promise<string> {
    const { drizzle } = await import('@/lib/db/drizzle')
    const record = await drizzle.webauthnChallenges.findAndDelete(userId)
    if (!record || record.expiresAt < new Date()) {
      throw new Error('Challenge 만료 또는 미존재 (60초 이내 완료 필요)')
    }
    return record.challenge
  }
}
```

### 3.5 `MFABackupCodeService`

```typescript
// src/lib/auth/advanced/MFABackupCodeService.ts

import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import type { MFAVerifyResult } from './MFAController'

const BACKUP_CODE_COUNT = 8
const CODE_LENGTH_BYTES = 5 // 10 hex chars

export class MFABackupCodeService {
  /**
   * 백업 코드 8개 생성 — 평문 반환 후 SHA-256 해시만 저장 (DQ-AA-10: 한번만 표시)
   */
  async generate(userId: string): Promise<string[]> {
    // 기존 코드 전부 삭제
    await prisma.mfaBackupCode.deleteMany({ where: { userId } })

    const codes: string[] = []
    const records: Array<{ userId: string; codeHash: string }> = []

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      const raw = randomBytes(CODE_LENGTH_BYTES).toString('hex').toUpperCase()
      const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}` // XXXXX-XXXXX 형식
      const hash = createHash('sha256').update(formatted).digest('hex')
      codes.push(formatted)
      records.push({ userId, codeHash: hash })
    }

    await prisma.mfaBackupCode.createMany({ data: records })

    return codes // 평문은 이 시점에만 반환
  }

  /**
   * 백업 코드 소비 (1회용)
   */
  async consume(userId: string, code: string): Promise<MFAVerifyResult> {
    const normalized = code.replace(/[-\s]/g, '').toUpperCase()
    const reformatted = `${normalized.slice(0, 5)}-${normalized.slice(5)}`
    const hash = createHash('sha256').update(reformatted).digest('hex')

    const record = await prisma.mfaBackupCode.findFirst({
      where: { userId, codeHash: hash, usedAt: null },
    })

    if (!record) {
      return {
        success: false,
        method: 'backup_code',
        sessionUpgraded: false,
        error: '잘못된 백업 코드이거나 이미 사용된 코드입니다.',
      }
    }

    await prisma.mfaBackupCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    })

    // 남은 코드 수 확인 → 2개 이하면 UI 경고
    const remaining = await prisma.mfaBackupCode.count({
      where: { userId, usedAt: null },
    })

    return {
      success: true,
      method: 'backup_code',
      sessionUpgraded: true,
      ...(remaining <= 2 && { warning: `백업 코드가 ${remaining}개 남았습니다. 재발급을 권장합니다.` }),
    }
  }

  async getRemainingCount(userId: string): Promise<number> {
    return prisma.mfaBackupCode.count({ where: { userId, usedAt: null } })
  }
}
```

### 3.6 `RateLimitGuard`

```typescript
// src/lib/auth/advanced/RateLimitGuard.ts

import { RateLimiterPostgres, RateLimiterRes } from 'rate-limiter-flexible'
import { Pool } from 'pg'
import type { NextRequest } from 'next/server'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// 정책 1: 인증 엔드포인트 (로그인/회원가입/재설정) — IP 기반 5회/분
const authLimiter = new RateLimiterPostgres({
  storeClient: pool,
  tableName: 'rate_limit_events',
  keyPrefix: 'auth_ip',
  points: 5,           // 5회
  duration: 60,        // 1분 윈도우
  blockDuration: 900,  // 차단 시 15분 잠금
})

// 정책 2: 일반 API — IP 기반 300회/분
const apiLimiter = new RateLimiterPostgres({
  storeClient: pool,
  tableName: 'rate_limit_events',
  keyPrefix: 'api_ip',
  points: 300,
  duration: 60,
})

// 정책 3: 사용자별 MFA 시도 — 10회/10분
const mfaLimiter = new RateLimiterPostgres({
  storeClient: pool,
  tableName: 'rate_limit_events',
  keyPrefix: 'mfa_user',
  points: 10,
  duration: 600,
  blockDuration: 3600,
})

export type RateLimitPolicy = 'auth' | 'api' | 'mfa'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number
}

export class RateLimitGuard {
  /**
   * Cloudflare Tunnel 환경: CF-Connecting-IP 우선 (DQ-AC-9 통일 정책)
   */
  static getClientIP(req: NextRequest): string {
    return (
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      '0.0.0.0'
    )
  }

  static async check(
    key: string,
    policy: RateLimitPolicy
  ): Promise<RateLimitResult> {
    const limiter = policy === 'auth' ? authLimiter : policy === 'mfa' ? mfaLimiter : apiLimiter

    try {
      const res = await limiter.consume(key)
      return {
        allowed: true,
        remaining: res.remainingPoints ?? 0,
        resetAt: new Date(Date.now() + res.msBeforeNext),
      }
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(Date.now() + err.msBeforeNext),
          retryAfter: Math.ceil(err.msBeforeNext / 1000),
        }
      }
      // DB 장애 시 fail-open (가용성 우선, NFR-REL.2)
      console.error('[RateLimitGuard] DB 오류 — fail-open:', err)
      return { allowed: true, remaining: -1, resetAt: new Date() }
    }
  }

  /**
   * Next.js Route Handler 미들웨어용 헬퍼
   */
  static async middleware(req: NextRequest, policy: RateLimitPolicy): Promise<Response | null> {
    const ip = this.getClientIP(req)
    const result = await this.check(ip, policy)

    if (!result.allowed) {
      return new Response(
        JSON.stringify({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.', retryAfter: result.retryAfter }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': policy === 'auth' ? '5' : '300',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000)),
            'Retry-After': String(result.retryAfter ?? 60),
          },
        }
      )
    }

    return null // 통과
  }
}
```

### 3.7 `MFAEnforcementPolicy`

```typescript
// src/lib/auth/advanced/MFAEnforcementPolicy.ts

import { prisma } from '@/lib/db/prisma'
import type { User } from '@prisma/client'

export class MFAEnforcementPolicy {
  /**
   * MFA 강제 여부 판단 (NFR-SEC.3)
   * - admin: 항상 강제 (TOTP 또는 WebAuthn 중 1개 필수)
   * - editor: 선택 (미래에 정책 변경 가능)
   * - viewer: 선택
   */
  async isMFARequired(user: User): Promise<boolean> {
    if (user.role === 'ADMIN') return true
    // 향후: 시스템 설정 테이블에서 role별 정책 조회
    return false
  }

  /**
   * MFA 미설정 admin 로그인 차단 시 리다이렉트 경로
   */
  getEnforcementRedirect(userId: string): string {
    return `/settings/security?setup=required&user=${userId}`
  }
}
```

---

## 4. API 설계

### 4.1 Route 목록 (8개 이상 엔드포인트)

| 메서드 | 경로 | 역할 | Rate Limit 정책 |
|-------|------|------|----------------|
| POST | `/api/v1/auth/mfa/totp/enroll` | TOTP 등록 시작 (QR 생성) | mfa (10/10min) |
| POST | `/api/v1/auth/mfa/totp/verify` | TOTP 코드 검증 (활성화 또는 로그인) | mfa |
| DELETE | `/api/v1/auth/mfa/totp` | TOTP 비활성화 | mfa |
| POST | `/api/v1/auth/mfa/webauthn/register/begin` | WebAuthn 등록 옵션 요청 | mfa |
| POST | `/api/v1/auth/mfa/webauthn/register/complete` | WebAuthn 등록 검증 | mfa |
| POST | `/api/v1/auth/mfa/webauthn/authenticate/begin` | WebAuthn 인증 옵션 요청 | mfa |
| POST | `/api/v1/auth/mfa/webauthn/authenticate/complete` | WebAuthn 인증 검증 | mfa |
| DELETE | `/api/v1/auth/mfa/webauthn/:credentialId` | 특정 credential 삭제 | mfa |
| POST | `/api/v1/auth/mfa/backup-codes/generate` | 백업 코드 재발급 | mfa |
| POST | `/api/v1/auth/mfa/backup-codes/verify` | 백업 코드 소비 | mfa |
| GET | `/api/v1/auth/mfa/status` | 현재 사용자 MFA 설정 현황 | api |
| GET | `/api/v1/auth/rate-limit/status` | 현재 IP rate limit 상태 조회 | api |

### 4.2 요청/응답 스키마 (TypeScript interface)

```typescript
// src/types/auth-advanced.ts

/** POST /api/v1/auth/mfa/totp/enroll */
export interface TOTPEnrollResponse {
  secret: string          // base32 (한번만 표시)
  otpAuthUri: string      // otpauth://totp/... (QR 생성용)
  qrDataUrl: string       // data:image/png;base64,...
  expiresIn: number       // 등록 세션 유효 시간 (초)
}

/** POST /api/v1/auth/mfa/totp/verify */
export interface TOTPVerifyRequest {
  code: string            // 6자리 숫자
  partialToken?: string   // 로그인 흐름 중이면 포함
}
export interface TOTPVerifyResponse {
  success: boolean
  sessionToken?: string   // 로그인 흐름 완료 시 발급
  activated?: boolean     // 첫 검증 시 활성화 여부
}

/** POST /api/v1/auth/mfa/webauthn/register/begin */
export interface WebAuthnRegisterBeginRequest {
  nickname?: string       // 기기 별명 (예: "MacBook Touch ID")
}
export interface WebAuthnRegisterBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON
}

/** POST /api/v1/auth/mfa/webauthn/register/complete */
export interface WebAuthnRegisterCompleteRequest {
  response: RegistrationResponseJSON
  nickname?: string
}
export interface WebAuthnRegisterCompleteResponse {
  success: boolean
  credentialId: string    // base64url
  deviceType: string      // 'platform' | 'cross-platform'
}

/** POST /api/v1/auth/mfa/webauthn/authenticate/begin */
export interface WebAuthnAuthBeginRequest {
  partialToken: string    // MFA 1단계 완료 후 발급된 Partial Token
}

/** POST /api/v1/auth/mfa/webauthn/authenticate/complete */
export interface WebAuthnAuthCompleteRequest {
  partialToken: string
  response: AuthenticationResponseJSON
}
export interface WebAuthnAuthCompleteResponse {
  success: boolean
  sessionToken: string    // 완전한 세션 JWT
  accessToken: string
}

/** POST /api/v1/auth/mfa/backup-codes/generate */
export interface BackupCodesGenerateResponse {
  codes: string[]         // XXXXX-XXXXX 형식 8개 (한번만 표시)
  warning: string         // "이 코드를 안전한 곳에 보관하세요. 다시 표시되지 않습니다."
}

/** GET /api/v1/auth/mfa/status */
export interface MFAStatusResponse {
  totpEnabled: boolean
  totpActivatedAt?: string   // ISO 8601
  webauthnCredentials: Array<{
    id: string
    nickname: string
    deviceType: string
    lastUsedAt?: string
    createdAt: string
  }>
  backupCodesRemaining: number
  enforcementRequired: boolean  // admin = true
}

/** GET /api/v1/auth/rate-limit/status */
export interface RateLimitStatusResponse {
  ip: string              // 클라이언트 IP (CF-Connecting-IP)
  auth: {
    remaining: number
    limit: number
    resetAt: string       // ISO 8601
  }
  api: {
    remaining: number
    limit: number
    resetAt: string
  }
}
```

### 4.3 에러 응답 표준

```typescript
// 모든 MFA API 에러 응답 공통 포맷
export interface MFAErrorResponse {
  error: string           // 한국어 에러 메시지
  code: string            // 기계 판독 코드 (예: 'TOTP_INVALID', 'WEBAUTHN_CHALLENGE_EXPIRED')
  retryAfter?: number     // Rate Limit 초과 시만 포함 (초)
}
```

---

## 5. 데이터 모델

### 5.1 Tier 1 ERD 인용 (02-data-model-erd.md §3.1, §3.3)

이 Blueprint가 사용하는 테이블은 Tier 1 ERD `02-data-model-erd.md §3.1 MFA 관련` 및 `§3.3 Rate Limit`에 정의된 것을 그대로 채용하며, 아래에 Blueprint 레벨에서 정밀 튜닝(추가 인덱스, RLS, 제약)을 명시한다.

### 5.2 `mfa_totp_secrets` — 완전 CREATE TABLE

```sql
-- Phase 15-A 마이그레이션
CREATE TABLE mfa_totp_secrets (
  id             UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  encrypted_seed BYTEA       NOT NULL,          -- AES-256-GCM ciphertext
  dek_id         UUID        NOT NULL,          -- vault_secrets.id 참조 (FK는 Phase 16 Vault 완성 후 추가)
  activated_at   TIMESTAMPTZ,                   -- NULL = 미활성화
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_mfa_totp_secrets PRIMARY KEY (id)
);

-- 인덱스
CREATE INDEX idx_mfa_totp_secrets_user_id ON mfa_totp_secrets(user_id);

-- RLS
ALTER TABLE mfa_totp_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_totp_own ON mfa_totp_secrets
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- admin 조회 허용 정책 (사용자 관리 페이지)
CREATE POLICY mfa_totp_admin ON mfa_totp_secrets
  FOR SELECT
  USING (current_setting('app.current_user_role', true) = 'ADMIN');

COMMENT ON TABLE mfa_totp_secrets IS 'TOTP MFA 시드 저장. seed는 Vault AES-256-GCM 암호화. 1 user = 1 record.';
```

### 5.3 `mfa_webauthn_credentials` — 완전 CREATE TABLE

```sql
-- Phase 15-B 마이그레이션
CREATE TABLE mfa_webauthn_credentials (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id     BYTEA       NOT NULL UNIQUE,    -- raw WebAuthn credential ID
  public_key        BYTEA       NOT NULL,            -- COSE public key (CBOR 인코딩)
  counter           BIGINT      NOT NULL DEFAULT 0, -- replay 방지 카운터
  device_type       VARCHAR(20),                    -- 'platform' | 'cross-platform'
  backup_eligible   BOOLEAN     NOT NULL DEFAULT FALSE,
  backup_state      BOOLEAN     NOT NULL DEFAULT FALSE,
  transports        TEXT[]      NOT NULL DEFAULT '{}',
  nickname          VARCHAR(100),                   -- 사용자 부여 기기 이름
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_mfa_webauthn_credentials PRIMARY KEY (id),
  CONSTRAINT chk_counter_non_negative CHECK (counter >= 0)
);

-- 인덱스
CREATE INDEX idx_mfa_webauthn_user_id ON mfa_webauthn_credentials(user_id);
CREATE INDEX idx_mfa_webauthn_credential_id ON mfa_webauthn_credentials USING HASH (credential_id);

-- 사용자당 최대 5개 제약 (트리거)
CREATE OR REPLACE FUNCTION check_webauthn_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM mfa_webauthn_credentials WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'WebAuthn credential 최대 5개까지만 등록 가능합니다.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_webauthn_limit
  BEFORE INSERT ON mfa_webauthn_credentials
  FOR EACH ROW EXECUTE FUNCTION check_webauthn_limit();

-- RLS
ALTER TABLE mfa_webauthn_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_webauthn_own ON mfa_webauthn_credentials
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

COMMENT ON TABLE mfa_webauthn_credentials IS 'WebAuthn FIDO2 등록 credential. 1 user = N credential (최대 5). counter로 replay 방지.';
```

### 5.4 `mfa_backup_codes` — 완전 CREATE TABLE

```sql
-- Phase 15-D 마이그레이션
CREATE TABLE mfa_backup_codes (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   CHAR(64)    NOT NULL UNIQUE,  -- SHA-256 hex (64자)
  used_at     TIMESTAMPTZ,                  -- NULL = 미사용
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_mfa_backup_codes PRIMARY KEY (id)
);

-- 인덱스
CREATE INDEX idx_mfa_backup_codes_user_lookup
  ON mfa_backup_codes(user_id, used_at)
  WHERE used_at IS NULL;  -- 미사용 코드만 인덱싱 (파셜 인덱스)

-- RLS
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_backup_own ON mfa_backup_codes
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

COMMENT ON TABLE mfa_backup_codes IS 'MFA 백업 코드 8개. SHA-256 해시만 저장. used_at 설정으로 1회용 처리.';
```

### 5.5 `rate_limit_events` — 완전 CREATE TABLE (ADR-007, §3.3 인용)

```sql
-- Phase 15-C 마이그레이션
-- UNLOGGED: 재시작 시 휘발 가능 (성능 우선, 재시작 후 limit counter 초기화는 허용)
CREATE UNLOGGED TABLE rate_limit_events (
  id           BIGSERIAL   NOT NULL,
  bucket_key   TEXT        NOT NULL,  -- 'auth_ip:1.2.3.4' | 'mfa_user:uuid' | 'api_ip:...'
  endpoint     TEXT        NOT NULL,  -- '/api/v1/auth/login' 등
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_rate_limit_events PRIMARY KEY (id)
);

-- 핵심 인덱스 — bucket_key + 시간 범위 조회
CREATE INDEX idx_rate_limit_bucket_time
  ON rate_limit_events(bucket_key, occurred_at DESC);

-- 정리용 인덱스 (만료 레코드 삭제 cron에서 사용)
CREATE INDEX idx_rate_limit_old
  ON rate_limit_events(occurred_at)
  WHERE occurred_at < NOW() - INTERVAL '10 minutes';

-- rate_limit_events는 RLS 불필요 (서버 내부 write/read만)
-- cleanup cron (매 5분, node-cron CronJob에 등록):
-- DELETE FROM rate_limit_events WHERE occurred_at < NOW() - INTERVAL '10 minutes';

COMMENT ON TABLE rate_limit_events IS 'Rate Limit counter. UNLOGGED (재시작 시 리셋 허용). 5분 윈도우 사용.';
```

### 5.6 SQLite `webauthn_challenges` (Drizzle)

WebAuthn Challenge는 TTL 60초, 임시성 → SQLite에 저장 (Tier 1 §1.3 분류 기준).

```typescript
// src/lib/db/schema.ts (Drizzle SQLite 스키마 추가)

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const webauthnChallenges = sqliteTable('webauthn_challenges', {
  userId: text('user_id').primaryKey(),           // user UUID
  challenge: text('challenge').notNull(),          // base64url encoded challenge
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})
```

```sql
-- Drizzle migration SQLite
CREATE TABLE webauthn_challenges (
  user_id    TEXT    NOT NULL PRIMARY KEY,
  challenge  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,  -- Unix timestamp (초)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- SQLite cleanup (매 5분 cron): DELETE FROM webauthn_challenges WHERE expires_at < unixepoch();
```

---

## 6. UI 컴포넌트

### 6.1 컴포넌트 위치

```
src/app/(dashboard)/settings/security/
├── page.tsx                    ← Security 설정 페이지 (MFAStatusResponse 표시)
├── _components/
│   ├── MFASetupWizard.tsx      ← TOTP/WebAuthn 단계별 설정 위저드
│   ├── WebAuthnRegistration.tsx ← WebAuthn 기기 등록 카드
│   └── BackupCodesModal.tsx    ← 백업 코드 표시/재발급 모달
```

### 6.2 `MFASetupWizard` 설계

```typescript
// src/app/(dashboard)/settings/security/_components/MFASetupWizard.tsx

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import Image from 'next/image'

type WizardStep = 'method-select' | 'totp-qr' | 'totp-verify' | 'webauthn-register' | 'backup-codes' | 'complete'

interface MFASetupWizardProps {
  initialMethod?: 'totp' | 'webauthn'
  onComplete: () => void
}

/**
 * MFA 설정 위저드 — 3단계:
 * 1. 방법 선택 (TOTP / WebAuthn)
 * 2. 등록 (QR 스캔 또는 기기 등록)
 * 3. 백업 코드 발급 + 완료
 */
export function MFASetupWizard({ initialMethod, onComplete }: MFASetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialMethod ? `${initialMethod}-${initialMethod === 'totp' ? 'qr' : 'register'}` : 'method-select')
  const [totpData, setTotpData] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  // TOTP 등록 시작
  async function startTOTP() {
    const res = await fetch('/api/v1/auth/mfa/totp/enroll', { method: 'POST' })
    const data = await res.json()
    setTotpData({ secret: data.secret, qrDataUrl: data.qrDataUrl })
    setStep('totp-qr')
  }

  // TOTP 검증
  async function verifyTOTP() {
    const res = await fetch('/api/v1/auth/mfa/totp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: verifyCode }),
    })
    const data = await res.json()
    if (data.success) {
      // 백업 코드 자동 생성
      const bRes = await fetch('/api/v1/auth/mfa/backup-codes/generate', { method: 'POST' })
      const bData = await bRes.json()
      setBackupCodes(bData.codes)
      setStep('backup-codes')
    } else {
      toast.error(data.error ?? 'TOTP 코드가 올바르지 않습니다.')
    }
  }

  // WebAuthn 등록
  async function registerWebAuthn() {
    const { startRegistration } = await import('@simplewebauthn/browser')
    const beginRes = await fetch('/api/v1/auth/mfa/webauthn/register/begin', { method: 'POST' })
    const { options } = await beginRes.json()
    try {
      const regResponse = await startRegistration({ optionsJSON: options })
      const verifyRes = await fetch('/api/v1/auth/mfa/webauthn/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: regResponse }),
      })
      const vData = await verifyRes.json()
      if (vData.success) {
        const bRes = await fetch('/api/v1/auth/mfa/backup-codes/generate', { method: 'POST' })
        const bData = await bRes.json()
        setBackupCodes(bData.codes)
        setStep('backup-codes')
      }
    } catch (err) {
      toast.error('WebAuthn 등록 실패. 기기가 WebAuthn을 지원하는지 확인하세요.')
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>보안 강화 설정</CardTitle>
      </CardHeader>
      <CardContent>
        {step === 'method-select' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">MFA 방식을 선택하세요.</p>
            <Button className="w-full" variant="outline" onClick={startTOTP}>
              TOTP (Google Authenticator / Authy)
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setStep('webauthn-register')}>
              Passkey / 생체인증 (Touch ID, Windows Hello, YubiKey)
            </Button>
          </div>
        )}
        {step === 'totp-qr' && totpData && (
          <div className="space-y-4">
            <p className="text-sm">인증 앱으로 QR 코드를 스캔하세요.</p>
            <Image src={totpData.qrDataUrl} alt="TOTP QR" width={200} height={200} className="mx-auto" />
            <details className="text-xs text-muted-foreground">
              <summary>수동 입력 키</summary>
              <code className="block mt-1 p-2 bg-muted rounded">{totpData.secret}</code>
            </details>
            <Button className="w-full" onClick={() => setStep('totp-verify')}>다음</Button>
          </div>
        )}
        {step === 'totp-verify' && (
          <div className="space-y-4">
            <p className="text-sm">인증 앱에 표시된 6자리 코드를 입력하세요.</p>
            <Input
              placeholder="000000"
              maxLength={6}
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button className="w-full" onClick={verifyTOTP} disabled={verifyCode.length !== 6}>
              확인
            </Button>
          </div>
        )}
        {step === 'webauthn-register' && (
          <div className="space-y-4">
            <p className="text-sm">플랫폼 인증기(Touch ID, Windows Hello) 또는 외부 키(YubiKey)로 등록하세요.</p>
            <Button className="w-full" onClick={registerWebAuthn}>기기 등록</Button>
          </div>
        )}
        {step === 'backup-codes' && (
          <BackupCodesModal
            codes={backupCodes}
            onConfirm={() => { setStep('complete'); onComplete() }}
          />
        )}
        {step === 'complete' && (
          <div className="text-center space-y-2">
            <Badge variant="default" className="bg-green-600">MFA 활성화 완료</Badge>
            <p className="text-sm text-muted-foreground">계정 보안이 강화되었습니다.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

### 6.3 `WebAuthnRegistration` 설계

```typescript
// src/app/(dashboard)/settings/security/_components/WebAuthnRegistration.tsx

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Shield } from 'lucide-react'
import { toast } from 'sonner'
import type { MFAStatusResponse } from '@/types/auth-advanced'

interface WebAuthnRegistrationProps {
  credentials: MFAStatusResponse['webauthnCredentials']
  onUpdate: () => void
}

/**
 * WebAuthn 기기 목록 카드 — 등록/삭제 관리
 */
export function WebAuthnRegistration({ credentials, onUpdate }: WebAuthnRegistrationProps) {
  const [nickname, setNickname] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)

  async function addCredential() {
    setIsRegistering(true)
    const { startRegistration } = await import('@simplewebauthn/browser')
    try {
      const beginRes = await fetch('/api/v1/auth/mfa/webauthn/register/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      })
      const { options } = await beginRes.json()
      const regResponse = await startRegistration({ optionsJSON: options })
      const completeRes = await fetch('/api/v1/auth/mfa/webauthn/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: regResponse, nickname }),
      })
      const data = await completeRes.json()
      if (data.success) {
        toast.success('기기가 등록되었습니다.')
        setNickname('')
        onUpdate()
      }
    } catch {
      toast.error('기기 등록에 실패했습니다.')
    } finally {
      setIsRegistering(false)
    }
  }

  async function removeCredential(credentialId: string) {
    if (!confirm('이 기기를 삭제하시겠습니까?')) return
    const res = await fetch(`/api/v1/auth/mfa/webauthn/${credentialId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('기기가 삭제되었습니다.')
      onUpdate()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> Passkey / 생체인증 기기
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {credentials.map(cred => (
            <div key={cred.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <p className="text-sm font-medium">{cred.nickname}</p>
                <p className="text-xs text-muted-foreground">
                  {cred.deviceType === 'platform' ? '내장 인증기' : '외부 키'} ·
                  마지막 사용: {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleDateString('ko-KR') : '없음'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeCredential(cred.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {credentials.length === 0 && (
            <p className="text-sm text-muted-foreground">등록된 기기가 없습니다.</p>
          )}
        </div>
        {credentials.length < 5 && (
          <div className="flex gap-2">
            <Input
              placeholder="기기 이름 (예: MacBook Touch ID)"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
            />
            <Button onClick={addCredential} disabled={isRegistering}>
              {isRegistering ? '등록 중...' : '추가'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

### 6.4 `BackupCodesModal` 설계

```typescript
// src/app/(dashboard)/settings/security/_components/BackupCodesModal.tsx

'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface BackupCodesModalProps {
  codes: string[]
  onConfirm: () => void
}

/**
 * 백업 코드 표시 모달 — DQ-AA-10: 한번만 표시
 * 사용자가 "저장했음을 확인합니다" 체크 후에만 닫기 가능
 */
export function BackupCodesModal({ codes, onConfirm }: BackupCodesModalProps) {
  const [confirmed, setConfirmed] = useState(false)

  function copyAll() {
    navigator.clipboard.writeText(codes.join('\n'))
    toast.success('코드가 클립보드에 복사되었습니다.')
  }

  function downloadTxt() {
    const content = [
      '양평 부엌 대시보드 — MFA 백업 코드',
      `생성일: ${new Date().toLocaleString('ko-KR')}`,
      '',
      '아래 코드는 각 1회만 사용 가능합니다.',
      '',
      ...codes,
      '',
      '주의: 이 파일을 안전한 곳에 보관하세요. MFA 기기 분실 시 계정 복구에 필요합니다.',
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '양평-대시보드-백업코드.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>백업 코드 저장</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded">
            ⚠️ 이 코드는 지금 한 번만 표시됩니다. MFA 기기를 분실한 경우 계정 복구에 사용됩니다.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {codes.map(code => (
              <code key={code} className="text-sm font-mono text-center p-2 bg-muted rounded border">
                {code}
              </code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="h-3 w-3 mr-1" /> 복사
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTxt}>
              <Download className="h-3 w-3 mr-1" /> 다운로드
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="confirm" checked={confirmed} onCheckedChange={v => setConfirmed(!!v)} />
            <label htmlFor="confirm" className="text-sm">
              코드를 안전한 곳에 저장했음을 확인합니다.
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!confirmed} onClick={onConfirm}>완료</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 7. 통합

### 7.1 Auth Core 연결 (JWT 검증 체인에 MFA 추가)

Auth Advanced는 L3 레이어이며, L2 Auth Core의 JWT 서비스에 MFA 단계를 **추가**한다. 기존 JWT 흐름을 수정하지 않고 Partial Token 개념을 삽입.

```
[로그인 흐름 — 기존 Auth Core]
POST /api/v1/auth/login
  → 1단계: 이메일/비밀번호 검증 (PasswordService)
  → 조건 분기 (MFAEnforcementPolicy):
    - MFA 필요 없음 → Full Session Token 발급 (기존 흐름)
    - MFA 필요함 → Partial Token 발급 (5분 유효)
      → 클라이언트가 /api/v1/auth/mfa/* 중 하나로 검증
      → 성공 시 Full Session Token 발급
```

Partial Token 구조 (jose SignJWT):
```json
{
  "sub": "user-uuid",
  "partial": true,
  "mfa_required": true,
  "methods": ["webauthn", "totp"],
  "iat": 1713400000,
  "exp": 1713400300
}
```

Middleware에서 Partial Token을 Full Token과 구분:
```typescript
// src/middleware.ts
if (payload.partial === true) {
  // MFA 완료 페이지로만 접근 허용
  if (!req.nextUrl.pathname.startsWith('/auth/mfa')) {
    return NextResponse.redirect(new URL('/auth/mfa', req.url))
  }
}
```

### 7.2 Observability 연결 (JWKS 사용)

Partial Token과 Full Token 모두 Observability L2 레이어의 `JwksKey` (ES256)로 서명. Auth Advanced는 JWKS 서비스를 **직접 호출하지 않고** JWTService 인터페이스를 통해 간접 사용.

```typescript
// src/lib/auth/core/JWTService.ts (Observability Phase 16 완성 후 연결)
import { importJWK, SignJWT } from 'jose'
import { prisma } from '@/lib/db/prisma'

export class JWTService {
  static async signPartial(payload: object): Promise<string> {
    const currentKey = await prisma.jwksKey.findFirst({ where: { status: 'CURRENT' } })
    if (!currentKey) throw new Error('활성 JWKS 키 없음 — Observability 설정 확인')
    const privateKey = await this.decryptPrivateKey(currentKey)
    return new SignJWT({ ...payload, partial: true })
      .setProtectedHeader({ alg: 'ES256', kid: currentKey.kid })
      .setExpirationTime('5m')
      .setIssuedAt()
      .sign(privateKey)
  }
}
```

### 7.2.1 JWKS 엔드포인트 grace 운용 정책 (세션 30 / SP-014 추가)

**중요**: "3분 grace"는 jose 클라이언트의 `cacheMaxAge: 180_000` 옵션만으로 성립하지 않는다. SP-014 실험(`docs/research/spikes/spike-014-jwks-cache-result.md`)에서 다음이 실증됐다:

```
JWKS 응답이 oldKey → newKey로 단일 교체되면
→ jose 캐시 만료 시점부터 oldKey로 서명된 토큰 = ERR_JWKS_NO_MATCHING_KEY
```

**올바른 구현** — JWKS 엔드포인트가 구·신 키를 동시에 서빙:

```typescript
// src/app/api/.well-known/jwks.json/route.ts
export async function GET() {
  const keys = await prisma.jwksKey.findMany({
    where: {
      OR: [
        { status: 'CURRENT' },
        { retireAt: { gt: new Date() } },  // grace 대기 키
      ],
    },
  });
  return Response.json(
    { keys: keys.map(k => k.publicJwk) },
    {
      headers: {
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=600',
      },
    }
  );
}
```

**키 회전 절차**:
1. 신 키 등록 `status='CURRENT'`, 구 키 `status='RETIRED'` + `retireAt = NOW() + max(token TTL, cacheMaxAge) + 60s margin`
2. JWKS 응답이 자동으로 두 키 포함
3. cron 1시간마다 `retireAt < NOW()` 건 제거

**실측 성능 (SP-014)**:
- jose `cacheMaxAge: 180_000` 적용 시 검증 p95 **0.189ms**, hit rate **99.0%**
- Cloudflare Tunnel RTT p95 148ms (miss 1%) → 실효 지연 **1.62ms**
- NFR-PERF.9 50ms p95 기준 **30× 여유** → Cloudflare Workers 앞단 캐시 **현 시점 불필요**

Compound Knowledge: `docs/solutions/2026-04-19-jwks-grace-endpoint-vs-client-cache.md`

### 7.2.2 Session 테이블 인덱스 정책 (세션 30 / SP-015 추가)

Session 테이블(`sessions`)의 활성 조회 쿼리 `WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()` 에 대해:

**원래 설계 가정 (무효)**: PG partial index with NOW() 조건
```sql
-- ❌ ERROR: functions in index predicate must be marked IMMUTABLE
CREATE INDEX idx_sessions_active ON sessions (user_id, expires_at)
  WHERE expires_at > NOW();
```

**채택 설계** — 일반 복합 인덱스 + cleanup job:
```sql
CREATE INDEX idx_sessions_user_exp ON sessions (user_id, revoked_at, expires_at);

-- cleanup (node-cron 일 1회 야간)
DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '1 day';
```

**SP-015 실측**:
- 100,000 행 기준 p95 **48μs** (PG 16.13, Bitmap Index Scan)
- 목표 `p95 < 2ms`의 **40× 여유**
- 1M extrapolation p95 ≈ 65μs (log10 증가)

Compound Knowledge: `docs/solutions/2026-04-19-pg-partial-index-now-incompatibility.md`

### 7.2.3 패스워드 해시 — argon2id 전환 (세션 30 / SP-011 / ADR-019 추가)

**현행**: `bcrypt@^6.0.0` (N-API native). (**사실관계 정정**: Wave 1~5 문서의 "bcryptjs" 표기는 오기)

**Phase 17 전환**: `@node-rs/argon2` 도입 + 점진 마이그레이션

```typescript
// src/lib/auth/password.ts (Phase 17)
import { hash as argonHash, verify as argonVerify, Algorithm } from '@node-rs/argon2';
import bcrypt from 'bcrypt';

export async function verifyPassword(
  user: { id: string; passwordHash: string },
  password: string
): Promise<boolean> {
  if (user.passwordHash.startsWith('$2')) {
    // bcrypt 검증 + argon2 재해시
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (ok) {
      const newHash = await argonHash(password, { algorithm: Algorithm.Argon2id });
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
    }
    return ok;
  }
  return argonVerify(user.passwordHash, password);
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, { algorithm: Algorithm.Argon2id });
}
```

**핵심**: User 스키마 변경 **불필요** — 접두사(`$2` vs `$argon2id$`)로 자동 구분.

**SP-011 실측 (Phase 15/16/17 전제)**:
- argon2id(default) p95 hash **19.8ms** / verify **13.6ms**
- bcrypt(cost=12) p95 hash 172.2ms / verify 167.8ms
- **12~13× faster**
- 1000 사용자 점진 마이그레이션 오류 **0/1000**
- WSL2 Ubuntu 24.04 설치 3.3초 (prebuilt)

상세: ADR-019, `docs/solutions/2026-04-19-napi-prebuilt-native-modules.md`

---

## 8. NFR 매핑

Wave 3 `03-non-functional-requirements.md` NFR-SEC.1~10 중 Auth Advanced 관련 8개 매핑:

| NFR | 내용 | Auth Advanced 구현 |
|-----|------|--------------------|
| **NFR-SEC.1** | JWT ES256 + JWKS 24h rotate | Partial Token이 JWKS ES256 서명 사용. Phase 16 Observability 완성 후 자동 연결 |
| **NFR-SEC.3** | TOTP 또는 WebAuthn admin 강제 | `MFAEnforcementPolicy.isMFARequired(user)` — admin은 true 고정. 미설정 시 `/settings/security?setup=required` 리다이렉트 |
| **NFR-SEC.4** | Rate Limit 10 req/min/IP | `RateLimitGuard.middleware(req, 'auth')` — 5회/분 인증 엔드포인트. 429 + Retry-After 헤더 |
| **NFR-SEC.6** | Prepared Statement 강제 | `RateLimiterPostgres` 내부 parameterized query 사용. `rate_limit_events` 직접 SQL 없음 |
| **NFR-SEC.7** | RLS 기본 활성화 | `mfa_totp_secrets`, `mfa_webauthn_credentials`, `mfa_backup_codes` 모두 RLS 활성 + user-level policy |
| **NFR-SEC.8** | OWASP Top 10 | A07 (식별 실패): TOTP/WebAuthn으로 완화. A02 (암호화 실패): TOTP seed AES-256-GCM 암호화. A04 (안전하지 않은 설계): backup code 1회용 |
| **NFR-SEC.9** | CSRF + CORS | MFA API 라우트에 `SameSite=Lax` 쿠키 + CSRF double-submit (Auth Core JWTService와 공유) |
| **NFR-SEC.10** | 감사 로그 불변성 | TOTP 등록/비활성화, WebAuthn 등록/삭제, 백업 코드 생성/소비 모두 `audit_log` append-only 기록 |

---

## 9. STRIDE 위협 모델 매핑

Wave 3 `08-security-threat-model.md` STRIDE 29+5 위협 중 Auth Advanced Blueprint가 완화하는 위협:

### 9.1 완화하는 위협

| 위협 ID | STRIDE | 위협명 | Auth Advanced 완화 수단 |
|---------|--------|--------|------------------------|
| **S1** | Spoofing | JWT 알고리즘 혼용 공격 | Partial Token ES256 강제 (`algorithms: ['ES256']` jose 옵션). `alg: none` 구조적 차단 |
| **S2** | Spoofing | 세션 탈취 (XSS) | MFA 2단계가 세션 탈취 후 악용을 차단. Partial Token 5분 만료로 탈취 가치 감소 |
| **S3** | Spoofing | WebAuthn 재전송 공격 | `consumeChallenge()` — challenge 소비 즉시 삭제. TTL 60초. `rpID` + `origin` 검증 |
| **D1** (가정) | Denial | Brute-force 로그인 공격 | `RateLimitGuard` — 5회/분/IP 차단. 15분 blockDuration. 계정 잠금 (5회 실패 시) |
| **D2** (가정) | Denial | MFA 코드 무차별 대입 | `mfa` 정책 10회/10분. blockDuration 1시간. 백업 코드도 동일 적용 |
| **E1** (가정) | Elevation | TOTP 시드 탈취 | AES-256-GCM envelope 암호화 (Vault ADR-013). 평문 시드 DB 미저장 |
| **E2** (가정) | Elevation | MFA 우회 (admin 강제 누락) | `MFAEnforcementPolicy` — admin login flow에서 강제 체크. middleware에서 Partial Token 미완료 시 차단 |
| **R1** | Repudiation | 관리자 MFA 행동 부인 | TOTP/WebAuthn 등록·비활성화·백업 코드 생성 이벤트 모두 `audit_log` 기록 |

### 9.2 Auth Advanced가 완화하지 않는 위협 (다른 레이어 담당)

- T5 (Vault 암호문 변조): Observability Blueprint (Phase 16) 담당
- S5 (Cloudflare Tunnel 위장): Operations Blueprint 담당
- T1 (SQL Injection): Auth Core + Advisors 담당

---

## 10. 리스크

### 10.1 WebAuthn Safari 호환성

| 항목 | 내용 |
|------|------|
| **리스크** | Safari iOS 15 이하 WebAuthn 미지원. Safari 16+는 지원하지만 일부 동작 차이 존재 |
| **영향도** | 중간 — iOS 사용자 TOTP 폴백 필요 |
| **완화** | 1) TOTP를 항상 백업 방법으로 유지 (ADR-007 §결정). 2) `@simplewebauthn/browser` 내장 `browserSupportsWebAuthn()` 체크 후 UI 분기. 3) Safari 버전 감지 로직 추가 |
| **재검토 트리거** | Safari 26+ 이후 iOS WebAuthn 완전 안정화 확인 시 |

### 10.2 TOTP 시드 유출

| 항목 | 내용 |
|------|------|
| **리스크** | Vault DEK 또는 MASTER_KEY 유출 시 모든 TOTP 시드 복호화 가능 |
| **영향도** | 높음 — 전체 TOTP MFA 무력화 |
| **완화** | 1) AES-256-GCM envelope (KEK→DEK) — DEK per-user (ADR-013). 2) MASTER_KEY `/etc/luckystyle4u/secrets.env` root:0640 접근 제한. 3) 침해 의심 시 전체 사용자 TOTP 재등록 요구 + 감사 알림 |
| **재검토 트리거** | MASTER_KEY 유출 의심 이벤트 발생 시 (ADR-013 재검토 트리거 #1) |

### 10.3 Rate Limit 회피 (IP 로테이션)

| 항목 | 내용 |
|------|------|
| **리스크** | 공격자가 다수 IP/프록시 사용 시 IP 기반 Rate Limit 우회 가능 |
| **영향도** | 중간 — account-level lock이 2차 방어선 |
| **완화** | 1) IP 기반 + 계정 기반 2중 limit (bucket_key에 user UUID 별도 추적). 2) 로그인 실패 5회 시 계정 15분 잠금 (IP 무관). 3) Phase 22에서 Cloudflare Turnstile 조건부 도입 (FR-6.5) |
| **재검토 트리거** | QPS > 1000 (ADR-007 재검토 트리거 #2) |

### 10.4 rate-limiter-flexible PostgreSQL 어댑터 DB 장애

| 항목 | 내용 |
|------|------|
| **리스크** | PG 장애 시 Rate Limit 판단 불가 |
| **영향도** | 낮음 (PG 장애 시 서비스 전체 중단이므로 Rate Limit 무의미) |
| **완화** | fail-open 정책 (`RateLimitGuard.check` catch 블록에서 `allowed: true` 반환). NFR-REL.2 가용성 우선 원칙 준수 |

---

## 11. Wave 4 할당 DQ 답변: DQ-AA-8

### DQ-AA-8 [Auth Advanced] JWT Refresh Rotation 전략 확정

**질문**: JWT refresh rotation 전략 — `revokedAt` 사용 vs `tokenFamily` 테이블?
**배경**: `01-research/06-auth-advanced/04-auth-advanced-matrix.md §537` — Wave 2 잠정 답변: revokedAt + tokenFamily 하이브리드.

### 11.1 결정: revokedAt + tokenFamily 하이브리드

**단순 `revokedAt` 방식의 한계**:
- Refresh Token 재사용(Reuse Detection) 시나리오에서 **같은 토큰이 사용된 두 번째 요청**을 감지할 수는 있지만, 그 토큰이 속한 "가족" 전체를 무효화하려면 별도 조회가 필요.
- 다중 기기 로그인에서 `revokedAt`만으로는 "특정 기기 세션의 자손 토큰 전체 무효화"가 어렵다.

**tokenFamily 테이블 단독의 한계**:
- 추가 테이블 관리 오버헤드.
- 체인이 길어지면 조회 비용 증가.

**하이브리드 확정 이유**:
- `user_sessions`의 `revokedAt`으로 세션 레벨 즉시 무효화 (O(1) 조회).
- `token_families` 테이블로 Reuse Detection + 가족 단위 무효화 지원.
- 두 조건 중 하나라도 해당하면 토큰 거부 (AND가 아닌 OR).

### 11.2 스키마

```sql
-- token_families 테이블 (Phase 17 user_sessions와 함께 생성)
CREATE TABLE token_families (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      TEXT        NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  family_hash     CHAR(64)    NOT NULL UNIQUE,  -- 초기 Refresh Token SHA-256
  current_token_hash CHAR(64) NOT NULL,          -- 현재 유효 Refresh Token SHA-256
  reuse_detected  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_token_families_session ON token_families(session_id);
CREATE INDEX idx_token_families_current ON token_families USING HASH (current_token_hash);
```

### 11.3 Refresh Rotation 구현 코드

```typescript
// src/lib/auth/core/RefreshTokenService.ts

import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import { JWTService } from './JWTService'

export class RefreshTokenService {
  /**
   * 새 Refresh Token 발급 (로그인 시)
   * @returns { refreshToken, familyId } — refreshToken은 평문 (클라이언트 쿠키), familyId는 내부 추적용
   */
  static async issue(userId: string, sessionId: string): Promise<{ refreshToken: string; familyId: string }> {
    const rawToken = randomBytes(40).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    const family = await prisma.tokenFamily.create({
      data: {
        userId,
        sessionId,
        familyHash: tokenHash,      // 초기 토큰이 곧 family의 루트
        currentTokenHash: tokenHash,
      },
    })

    return { refreshToken: rawToken, familyId: family.id }
  }

  /**
   * Refresh Token으로 Access Token 재발급 (rotation)
   * 성공 시: 기존 token 무효화 + 새 token 발급
   * 재사용 감지 시: 해당 가족 전체 무효화 (전체 세션 로그아웃)
   */
  static async rotate(rawToken: string): Promise<{
    newAccessToken: string
    newRefreshToken: string
  }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    const family = await prisma.tokenFamily.findFirst({
      where: { currentTokenHash: tokenHash, revokeDetected: false, revokedAt: null },
      include: { session: true },
    })

    if (!family) {
      // Reuse Detection: 이미 회전된 토큰 재사용 시도
      await this.handleReuseDetection(tokenHash)
      throw new Error('REFRESH_TOKEN_REUSE_DETECTED')
    }

    // 세션 revokedAt 확인 (Auth Core 세션 무효화 여부)
    if (family.session.revokedAt) {
      throw new Error('SESSION_REVOKED')
    }

    // 새 Refresh Token 생성
    const newRaw = randomBytes(40).toString('hex')
    const newHash = createHash('sha256').update(newRaw).digest('hex')

    await prisma.tokenFamily.update({
      where: { id: family.id },
      data: { currentTokenHash: newHash, lastRotatedAt: new Date() },
    })

    const newAccessToken = await JWTService.signAccess({
      sub: family.userId,
      sessionId: family.sessionId,
    })

    return { newAccessToken, newRefreshToken: newRaw }
  }

  /**
   * Reuse Detection 처리 — 가족 전체 무효화 + 세션 revoke
   * 공격자가 탈취한 토큰으로 회전 시도했거나, 사용자가 탈취 피해를 입은 것으로 간주
   */
  private static async handleReuseDetection(tokenHash: string): Promise<void> {
    // family_hash가 같은 레코드 찾기 (가족 루트로부터 추적)
    const anyRecord = await prisma.tokenFamily.findFirst({
      where: {
        OR: [
          { familyHash: tokenHash },
          { currentTokenHash: tokenHash },
        ],
      },
    })

    if (!anyRecord) return

    // 해당 가족 전체 무효화
    await prisma.tokenFamily.updateMany({
      where: { sessionId: anyRecord.sessionId },
      data: { reuseDetected: true, revokedAt: new Date() },
    })

    // 세션 revoke
    await prisma.userSession.update({
      where: { id: anyRecord.sessionId },
      data: { revokedAt: new Date() },
    })

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        userId: anyRecord.userId,
        details: { sessionId: anyRecord.sessionId, familyId: anyRecord.id },
        severity: 'HIGH',
      },
    })
  }
}
```

### 11.4 DQ-AA-8 최종 확정 답변

| 항목 | 결정 |
|------|------|
| **전략** | `revokedAt` (세션 레벨) + `tokenFamily` 테이블 (Reuse Detection) 하이브리드 |
| **근거** | Wave 2 매트릭스 06 §537 잠정 답변 → Wave 4 Blueprint에서 상세 구현 확정 |
| **token_families 테이블** | Phase 17 `user_sessions`와 함께 생성 (마이그레이션 동시 처리) |
| **Reuse Detection 정책** | 이미 회전된 토큰 재사용 감지 시 → 해당 세션의 전체 가족 무효화 + `audit_log` 기록 |
| **성능** | `current_token_hash` HASH 인덱스로 O(1) 조회. 가족 전체 무효화는 `session_id` 인덱스 조회 |
| **ADR 승격** | 본 결정은 ADR-006 (Auth Core) §상세화로 처리. 별도 ADR-019 불필요 |

---

## 12. Phase 15 WBS

### 12.1 총 공수: 22h (Wave 3 `10-14-categories-priority.md §4.1`)

```
Phase 15-A: TOTP MFA (4h)
  → DoD: otplib TOTP 등록/검증 완료, QR 생성, Vault 암호화 저장, Unit 테스트 통과

Phase 15-B: WebAuthn (8h)
  → DoD: @simplewebauthn 등록/인증 완료, Chrome + Safari 크로스 테스트, SQLite Challenge 저장

Phase 15-C: Rate Limit (6h)
  → DoD: rate-limiter-flexible PG 어댑터 연결, 5회/분 인증 차단 Integration 테스트 통과

Phase 15-D: 백업 코드 + 감사 로그 + UI (4h)
  → DoD: 백업 코드 8개 생성/소비, MFASetupWizard/BackupCodesModal UI 완성, audit_log 기록

합계: 22h
```

### 12.2 태스크 분해 (12개 태스크)

| # | 태스크 | 공수 | 선행 조건 | DoD |
|---|--------|------|---------|-----|
| T1 | DB 마이그레이션 생성 (4개 테이블) | 1h | Phase 15 착수 | `prisma migrate dev` 성공, SQL 검토 |
| T2 | `TOTPService` 구현 + Unit 테스트 | 1.5h | T1 | otplib 검증 5개 TC 통과 (RFC 6238 테스트 벡터 포함) |
| T3 | TOTP API Route 구현 (enroll/verify/delete) | 1.5h | T2 | Postman 수동 테스트 통과 |
| T4 | WebAuthn DB 스키마 + SQLite Challenge | 0.5h | T1 | Drizzle schema push 성공 |
| T5 | `WebAuthnService` 구현 (등록 흐름) | 2h | T4 | Chrome 가상 authenticator 등록 성공 |
| T6 | `WebAuthnService` 구현 (인증 흐름) | 2h | T5 | Chrome 가상 authenticator 로그인 성공 |
| T7 | WebAuthn API Route 구현 (4 엔드포인트) | 1.5h | T5, T6 | Integration 테스트 통과 |
| T8 | `RateLimitGuard` 구현 + PG 어댑터 연결 | 2h | T1 | 6회 연속 로그인 → 6번째 429 응답 확인 |
| T9 | Rate Limit API Route + 헤더 | 1h | T8 | X-RateLimit-* 헤더 포함 응답 확인 |
| T10 | `MFABackupCodeService` 구현 | 1h | T2 | 8개 생성, 소비, 재사용 거부 Unit 테스트 |
| T11 | `MFAController` + `MFAEnforcementPolicy` 구현 | 1.5h | T2, T6, T10 | Partial Token 발급 + 검증 Integration 테스트 |
| T12 | UI 3개 컴포넌트 + Security 설정 페이지 | 4h | T3, T7 | MFA 설정 wizard E2E (Playwright) 통과 |
| T13 | 감사 로그 통합 + 문서화 업데이트 | 1.5h | T11, T12 | audit_log에 TOTP/WebAuthn 이벤트 기록 확인 |

**합계: 21.5h ≈ 22h**

### 12.3 선행 조건 DAG

```
T1 (DB 마이그레이션)
 ├─→ T2 (TOTPService)
 │    ├─→ T3 (TOTP API)
 │    │    └─→ T12 (UI)
 │    └─→ T10 (BackupCode)
 │         └─→ T11 (MFAController)
 │              └─→ T12
 ├─→ T4 (WebAuthn DB)
 │    ├─→ T5 (WebAuthn 등록)
 │    │    ├─→ T6 (WebAuthn 인증)
 │    │    │    └─→ T7 (WebAuthn API)
 │    │    │         └─→ T12 (UI)
 │    │    └─→ T11 (MFAController)
 │    └─→ T8 (RateLimitGuard)
 │         └─→ T9 (Rate Limit API)
 └─→ T8

T13 (감사 로그) ← T11 + T12 완료 후
```

### 12.4 Phase 22 보너스 경로 (60 → 100점)

| 항목 | 추가 점수 | 조건 |
|------|---------|------|
| OAuth Providers (ADR-017) | +15 | Phase 18, 사용자 추가 시 착수 |
| Cloudflare Turnstile CAPTCHA | +5 | Phase 22, 의심 IP 임계 초과 시 |
| FIDO MDS 통합 (DQ-AA-3) | +5 | Phase 22 보너스, Wave 5 스파이크 후 |
| WebAuthn Conditional UI (DQ-AA-9) | +5 | Phase 17 완성 후 2주 안정화 확인 후 |
| Passkey 단독 인증 (비밀번호 폐기) | +10 | ADR-007 재검토 트리거 #3 충족 시 |

---

## 부록 Z. 근거 인덱스

### Z.1 이 문서가 인용하는 Wave 문서

| 섹션 | 근거 문서 경로 |
|------|--------------|
| §2 채택안 | `01-research/06-auth-advanced/01-otplib-totp-deep-dive.md §11.3` |
| §2 채택안 | `01-research/06-auth-advanced/02-simplewebauthn-passkey-deep-dive.md §12.3` |
| §2 채택안 | `01-research/06-auth-advanced/03-rate-limiter-flexible-deep-dive.md §12.3` |
| §2 채택안 | `01-research/06-auth-advanced/04-auth-advanced-matrix.md §0, §3.3` |
| §2 채택안 | `01-research/06-auth-advanced/05-webauthn-vs-totp.md` |
| §1 현황 | `00-vision/10-14-categories-priority.md §3, §4.1, §5.1` |
| §5 ERD | `02-architecture/02-data-model-erd.md §3.1, §3.3` |
| §8 NFR | `00-vision/03-non-functional-requirements.md §2` |
| §9 STRIDE | `00-vision/08-security-threat-model.md §2 S1~S5, T1~T5` |
| §11 DQ-AA-8 | `00-vision/07-dq-matrix.md §3.7 DQ-AA-8` |
| ADR | `02-architecture/01-adr-log.md ADR-007, ADR-013, ADR-018` |

### Z.2 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent B1 (Sonnet 4.6) | Wave 4 Tier 2 초안 — Auth Advanced 완전 Blueprint |

---

> **Auth Advanced Blueprint 끝.** Wave 4 · B1 · 2026-04-18 · Phase 15 MVP 1순위 · 22h WBS 12 태스크.
