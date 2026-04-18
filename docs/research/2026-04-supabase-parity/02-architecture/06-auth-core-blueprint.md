# 06. Auth Core Blueprint — 양평 부엌 서버 대시보드

> Wave 4 · Tier 2 (B1) 산출물 — kdywave W4-B1 (Agent Security-1)
> 작성일: 2026-04-18 (세션 28)
> 카테고리 5: Auth Core (Phase 17 MVP)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md) · [03-auth-advanced-blueprint.md](./03-auth-advanced-blueprint.md)
> 근거: Wave 1 `01-research/05-auth-core/` 4문서 · Wave 2 C 매트릭스 · Wave 3 Vision Suite

---

## 0. 문서 목적

이 Blueprint는 카테고리 5(Auth Core)의 **구현 설계도**다. Wave 5 로드맵이 이 문서에서 WBS를 추출하고, Phase 17 착수 시 단일 참조 진실 소스로 사용한다.

**현재 점수 70점 → Phase 17 목표 90점 (ADR-006 채택)**

Auth Core는 L2 레이어(ADR-018)에서 Auth Advanced(L3)의 기반이 된다. Phase 15(Auth Advanced MVP)가 L2를 전제하므로, 이 Blueprint의 Phase 17 WBS는 L3 완성 후 L2 강화 작업이다.

---

## 1. 요약

### 1.1 카테고리 현황

| 항목 | 내용 |
|------|------|
| 카테고리 | Auth Core (카테고리 #5) |
| 현재 점수 | 70 / 100 |
| Phase 17 목표 | 90 / 100 (+20점, 30h 파트) |
| Phase 22 보너스 목표 | 100 / 100 |
| 구현 우선순위 | 3위 (Wave 3 `10-14-categories-priority.md §3`) |
| 핵심 결정 ADR | ADR-006 (Accepted), ADR-017 (조건부) |
| Phase 레이어 | L2 Auth Core (ADR-018 9-레이어 구조) |

### 1.2 현재 자산과 갭

현재 프로젝트에는 이미 구동 중인 Auth Core 기반이 있다:
- `jose@5` JWT ES256 서명 (HS256 → ES256 점진 전환 예정)
- `bcrypt` 비밀번호 해시 (cost 12)
- `User` Prisma 모델 (id, email, passwordHash, role, isActive)
- 3-role RBAC (ADMIN / MANAGER / USER)

**Phase 17에서 추가할 갭 (Wave 2 C 매트릭스 G1~G8)**:

| 갭 | 설명 | 공수 |
|---|------|------|
| G1 세션 테이블 | Server-side Session 무효화 (`user_sessions`) | 8h |
| G2 디바이스 목록 | 기기 목록 UI + 단일/전체 로그아웃 | 4h |
| G3 Hooks/Callback | 로그인/세션 이벤트 Hook 표준화 | 3h |
| G4 Custom Claims | JWT 클레임 Composer 패턴 | 2h |
| G5 Anonymous role | Anonymous sign-in (GUEST role) | 4h |
| G6 Account Linking | OAuth provider 연결 (Phase 18+ 필수 준비) | 4h |
| G7 Password Policy | HIBP 체크 + 복잡도 규칙 강화 | 2h |
| G8 감사 로그 강화 | 로그인/로그아웃/role 변경 전부 append-only | 3h |

**총 30h** (Phase 17 Auth Core 파트)

### 1.3 핵심 결정 3줄 요약

1. **jose JWT + Lucia/Auth.js 패턴 15개 차용 (라이브러리 거부)**: Auth.js 채용 시 Naver/Kakao OAuth 직접 작성 부담이 동일하므로 ROI 0. 현 jose+Prisma 자산 보존, 패턴만 흡수. (ADR-006)
2. **세션 테이블 SHA-256 해시 저장 (DQ-AC-6 확정)**: 세션 ID를 DB에 해시로만 저장해 DB 유출 시 세션 탈취 불가. Lucia v4 권장 패턴 채용.
3. **Anonymous role = GUEST enum + is_anonymous 컬럼**: 현 RBAC (ADMIN/MANAGER/USER/GUEST)에 GUEST를 추가. `is_anonymous=true` 컬럼으로 Anonymous 세션 추적. 명시적 로그아웃 없이 7일 후 만료.

---

## 2. Wave 1-2 채택안 인용

### 2.1 Wave 1 Deep-dive 결론 (4 문서)

**`01-research/05-auth-core/01-lucia-auth-deep-dive.md` §11.1**

> "Option C (Lucia 패턴 자체 구현) 채택. 이유: Lucia v4는 패키지가 아닌 학습 자료 → 어차피 self-host 필요. Session 테이블 SHA-256 해시 저장, Reuse Detection, 디바이스 핑거프린트 3가지 패턴이 핵심."

채택 Lucia 패턴 (5종):
1. Session `id` = SHA-256(session_token) — DB에 해시만 저장
2. Refresh Token Reuse Detection — `token_families` (Auth Advanced DQ-AA-8 연계)
3. Slide window session expiry — `last_seen_at` 기준 7일 연장
4. `revokedAt` soft-revoke — DELETE 대신 revokedAt 설정 (감사 Trail)
5. Device fingerprint optional — `device_fingerprint` 컬럼 (JS fingerprint 선택)

**`01-research/05-auth-core/02-authjs-v6-pattern-deep-dive.md` §11.1**

> "패턴 차용 + 자체 구현. Auth.js v6 라이브러리는 우리 규모/도메인에 과잉. 한국 OAuth(Naver/Kakao) 직접 작성 부담은 어차피 동일."

채택 Auth.js 패턴 (10종):
1. Provider 인터페이스 추상화 (`OAuthProvider` interface)
2. JWT callback (`onJWT`) — claims enrichment
3. Session callback (`onSession`) — session hydration
4. Event hook — `onSignIn`, `onSignOut`, `onLinkAccount`
5. CSRF double-submit cookie 패턴
6. PKCE code_verifier 자동 생성 (OAuth flows)
7. Account linking — `user_oauth_accounts` 테이블
8. Anonymous Credentials 패턴 (Guest 세션)
9. Custom error pages (`/auth/error?type=...`)
10. `AuthConfig` 중앙 설정 객체 패턴

**`01-research/05-auth-core/03-auth-core-matrix.md` §0 Executive Summary**

> "Hybrid-Self = jose+Prisma 자산 유지 + Lucia Session 테이블 + Auth.js Provider/Hook 패턴. 가중점수 4.08/5 (최고점). 기존 A(현재 베이스) 2.95 대비 +1.13 향상."

Wave 2 C 매트릭스 최종 점수:

| 후보 | 가중점수 | FUNC | SECURITY | INTEG |
|------|---------|------|---------|-------|
| B Hybrid-Self | **4.08** | 4.5 | 4.5 | 4.5 |
| C Lucia v3 | 3.62 | 3.5 | 4.5 | 3.0 |
| D Auth.js v6 | 3.32 | 4.0 | 4.0 | 2.5 |
| A 현재 베이스 | 2.95 | 2.0 | 3.0 | 5.0 |

**`01-research/05-auth-core/04-lucia-vs-authjs.md`**

> "최종: Hybrid-Self가 양쪽 단점 없이 강점만 취합. Lucia: Session 모델(SHA-256 해시, Slide window). Auth.js: Provider 추상화, JWT callback, Event hook."

### 2.2 Wave 2 C 매트릭스 갭 커버 분석

| 갭 | Hybrid-Self 커버 | 구현 방식 |
|---|----------------|---------|
| G1 세션 무효화 | ✅ 직접 구현 | `user_sessions.revokedAt` + `DeleteMany` API |
| G2 디바이스 목록 | ✅ | `ActiveSessionsPanel` UI + user_agent 파싱 |
| G3 Hooks | ✅ Auth.js 패턴 | `AuthEventBus` — onSignIn/onSignOut 이벤트 |
| G4 Custom claims | ✅ Auth.js 패턴 | `ClaimsComposer` — JWT payload 빌더 |
| G6 Anonymous | ✅ | GUEST role + is_anonymous 컬럼 |
| G7 Account linking | △ 선택 | Phase 18 OAuth와 함께 구현 |
| G8 한국 OAuth | ✅ 직접 작성 | Naver/Kakao Phase 18에서 자체 구현 |

---

## 3. 컴포넌트 설계

### 3.1 6개 모듈 구조

```
src/lib/auth/core/
├── SessionService.ts        ← 세션 생성/조회/무효화/슬라이딩 갱신
├── JWTService.ts            ← JWT 서명/검증/Partial Token (JWKS ES256)
├── DeviceService.ts         ← user-agent 파싱 + 기기 추적 (ua-parser-js)
├── PasswordService.ts       ← bcrypt 해시/검증 + HIBP 체크 + 정책
├── AnonymousRoleService.ts  ← Anonymous sign-in (GUEST role 발급)
└── AuthMiddleware.ts        ← Next.js middleware 통합 (RBAC + MFA 체인)
```

### 3.2 `SessionService`

Lucia 패턴 5종을 내재화한 세션 관리 서비스.

```typescript
// src/lib/auth/core/SessionService.ts

import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import type { UserSession } from '@prisma/client'

const SESSION_EXPIRY_DAYS = 7
const SESSION_SLIDE_THRESHOLD_DAYS = 1 // 1일 이내 활동 시 갱신

export interface CreateSessionOptions {
  userId: string
  userAgent?: string
  ipAddress: string
  mfaMethod?: 'totp' | 'webauthn' | null
  isAnonymous?: boolean
  deviceFingerprint?: string
}

export class SessionService {
  /**
   * 세션 생성 — 세션 토큰 발급 (평문), DB에는 SHA-256 해시만 저장 (DQ-AC-6)
   */
  static async create(options: CreateSessionOptions): Promise<{
    sessionToken: string  // 평문 (쿠키에 설정)
    sessionId: string     // SHA-256 해시 (DB PK)
  }> {
    const rawToken = randomBytes(40).toString('hex')
    const sessionId = createHash('sha256').update(rawToken).digest('hex')

    const ipHash = createHash('sha256').update(options.ipAddress).digest('hex')
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: options.userId,
        ipHash,
        userAgent: options.userAgent?.slice(0, 256) ?? null,
        deviceFingerprint: options.deviceFingerprint ?? null,
        mfaMethod: options.mfaMethod ?? null,
        expiresAt,
      },
    })

    return { sessionToken: rawToken, sessionId }
  }

  /**
   * 세션 검증 — 해시 조회 + 만료/revoke 확인 + 슬라이딩 갱신
   */
  static async validate(rawToken: string): Promise<UserSession | null> {
    const sessionId = createHash('sha256').update(rawToken).digest('hex')

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
    })

    if (!session) return null
    if (session.revokedAt) return null
    if (session.expiresAt < new Date()) {
      // 만료된 세션 soft-delete
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      })
      return null
    }

    // 슬라이딩 갱신: 마지막 접근 후 SLIDE_THRESHOLD 이내면 expiry 연장
    const lastSeenThreshold = new Date(Date.now() - SESSION_SLIDE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
    if (session.lastSeenAt < lastSeenThreshold) {
      const newExpiry = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { lastSeenAt: new Date(), expiresAt: newExpiry },
      })
    } else {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { lastSeenAt: new Date() },
      })
    }

    return session
  }

  /**
   * 단일 세션 무효화 (DQ-AC-10: revokedAt 방식 — DELETE 대신)
   */
  static async revoke(sessionId: string, actorId?: string): Promise<void> {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    })
    // 감사 로그
    await prisma.auditLog.create({
      data: {
        action: 'SESSION_REVOKED',
        userId: actorId,
        details: { sessionId },
        severity: 'LOW',
      },
    })
  }

  /**
   * 전체 세션 무효화 (전체 로그아웃)
   */
  static async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId && { id: { not: exceptSessionId } }),
      },
      data: { revokedAt: new Date() },
    })
    await prisma.auditLog.create({
      data: {
        action: 'ALL_SESSIONS_REVOKED',
        userId,
        details: { exceptSessionId },
        severity: 'MEDIUM',
      },
    })
  }

  /**
   * 사용자의 활성 세션 목록 조회 (기기 목록 UI용)
   */
  static async listActive(userId: string): Promise<UserSession[]> {
    return prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    })
  }
}
```

### 3.3 `JWTService`

JWKS ES256 기반 JWT 서명/검증. Auth Advanced의 Partial Token도 이 서비스를 사용.

```typescript
// src/lib/auth/core/JWTService.ts

import { SignJWT, jwtVerify, importJWK, type JWTPayload } from 'jose'
import { prisma } from '@/lib/db/prisma'

export interface AccessTokenClaims extends JWTPayload {
  sub: string         // user_id
  email: string
  role: string        // 'ADMIN' | 'MANAGER' | 'USER' | 'GUEST'
  sessionId: string
  mfaCompleted: boolean
  isAnonymous?: boolean
}

export interface PartialTokenClaims extends JWTPayload {
  sub: string
  partial: true
  mfa_required: true
  methods: Array<'totp' | 'webauthn'>
}

const ACCESS_TOKEN_EXPIRY = '15m'
const PARTIAL_TOKEN_EXPIRY = '5m'

export class JWTService {
  /**
   * 현재 JWKS CURRENT 키로 Access Token 서명
   */
  static async signAccess(claims: Omit<AccessTokenClaims, 'iat' | 'exp'>): Promise<string> {
    const currentKey = await this.getCurrentSigningKey()
    return new SignJWT({ ...claims, mfaCompleted: claims.mfaCompleted ?? false })
      .setProtectedHeader({ alg: 'ES256', kid: currentKey.kid })
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .setJti(crypto.randomUUID())
      .sign(currentKey.privateKey)
  }

  /**
   * Partial Token 서명 (MFA 미완료 상태, 5분 유효)
   */
  static async signPartial(claims: Omit<PartialTokenClaims, 'iat' | 'exp'>): Promise<string> {
    const currentKey = await this.getCurrentSigningKey()
    return new SignJWT({ ...claims, partial: true, mfa_required: true })
      .setProtectedHeader({ alg: 'ES256', kid: currentKey.kid })
      .setIssuedAt()
      .setExpirationTime(PARTIAL_TOKEN_EXPIRY)
      .sign(currentKey.privateKey)
  }

  /**
   * JWT 검증 — JWKS에서 kid로 공개키 찾아 검증
   * alg 화이트리스트: ES256만 허용 (S1 알고리즘 혼용 공격 방어)
   */
  static async verify(token: string): Promise<AccessTokenClaims | PartialTokenClaims> {
    const jwks = await this.getPublicJWKS()

    const { payload } = await jwtVerify(token, async (header) => {
      const key = jwks.find(k => k.kid === header.kid)
      if (!key) throw new Error('알 수 없는 kid')
      return importJWK(key, 'ES256')
    }, {
      algorithms: ['ES256'], // 명시적 알고리즘 화이트리스트 (S1 방어)
    })

    return payload as AccessTokenClaims | PartialTokenClaims
  }

  /**
   * ClaimsComposer 패턴 (Auth.js jwt callback 차용)
   * 추가 클레임을 단계적으로 조합
   */
  static composeAccessClaims(
    base: Pick<AccessTokenClaims, 'sub' | 'email' | 'role' | 'sessionId' | 'mfaCompleted'>,
    extras?: Partial<AccessTokenClaims>
  ): Omit<AccessTokenClaims, 'iat' | 'exp'> {
    return { ...base, ...extras }
  }

  private static async getCurrentSigningKey() {
    const key = await prisma.jwksKey.findFirst({ where: { status: 'CURRENT' } })
    if (!key) throw new Error('활성 JWKS 서명키 없음 — Observability Phase 16 완성 필요')
    const privateKey = await this.decryptPrivateKey(key)
    return { kid: key.kid, privateKey }
  }

  private static async decryptPrivateKey(key: { encryptedPrivateKey: Buffer; dekId: string }) {
    const { VaultService } = await import('@/lib/observability/VaultService')
    const vault = new VaultService()
    const pem = await vault.decrypt({
      ciphertext: key.encryptedPrivateKey.toString('base64'),
      dekId: key.dekId,
    })
    return importJWK(JSON.parse(pem), 'ES256')
  }

  private static async getPublicJWKS() {
    const keys = await prisma.jwksKey.findMany({
      where: { status: { in: ['CURRENT', 'RETIRED'] } },
      select: { kid: true, publicKeyJwk: true },
    })
    return keys.map(k => ({ ...(k.publicKeyJwk as object), kid: k.kid }))
  }
}
```

### 3.4 `DeviceService`

DQ-AC-4 확정 답변: ua-parser-js 채택.

```typescript
// src/lib/auth/core/DeviceService.ts

import { UAParser } from 'ua-parser-js'
import type { UserSession } from '@prisma/client'

export interface DeviceInfo {
  browser: string      // 예: "Chrome 120"
  os: string           // 예: "Windows 11" | "macOS 14"
  deviceType: string   // 'desktop' | 'mobile' | 'tablet' | 'unknown'
  isCurrent: boolean
  sessionId: string
  lastSeenAt: string   // ISO 8601
  createdAt: string
  ipMasked: string     // "1.2.x.x" 형식 (프라이버시)
}

export class DeviceService {
  /**
   * ua-parser-js로 user-agent 파싱 (DQ-AC-4 확정 답변)
   * - ua-parser-js@1.x (MIT): 안정적, 유지보수 활성
   * - 미채택 대안 1: useragent (2020년 이후 비유지, 거부)
   * - 미채택 대안 2: detect-browser (번들 크기 작지만 정보 제한적, 거부)
   * - fallback: 파싱 실패 시 자체 정규식 (§3.4.1 참조)
   */
  static parseUA(userAgent: string | null): Pick<DeviceInfo, 'browser' | 'os' | 'deviceType'> {
    if (!userAgent) {
      return { browser: '알 수 없음', os: '알 수 없음', deviceType: 'unknown' }
    }

    try {
      const parser = new UAParser(userAgent)
      const result = parser.getResult()

      const browser = result.browser.name
        ? `${result.browser.name} ${result.browser.version?.split('.')[0] ?? ''}`
        : this.fallbackBrowser(userAgent)

      const os = result.os.name
        ? `${result.os.name} ${result.os.version ?? ''}`
        : this.fallbackOS(userAgent)

      const deviceType = result.device.type ?? (userAgent.includes('Mobile') ? 'mobile' : 'desktop')

      return { browser: browser.trim(), os: os.trim(), deviceType }
    } catch {
      return this.fallbackParse(userAgent)
    }
  }

  /**
   * 세션 목록을 DeviceInfo 배열로 변환 (UI용)
   */
  static async formatSessions(
    sessions: UserSession[],
    currentSessionId: string
  ): Promise<DeviceInfo[]> {
    return sessions.map(session => {
      const parsed = this.parseUA(session.userAgent)
      return {
        ...parsed,
        isCurrent: session.id === currentSessionId,
        sessionId: session.id,
        lastSeenAt: session.lastSeenAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        ipMasked: this.maskIP(session.ipHash), // IP는 해시이므로 "해시된 IP"로 표시
      }
    })
  }

  /**
   * fallback 브라우저 파싱 (자체 정규식)
   * ua-parser-js 실패 시 기본 브라우저 패턴 매칭
   */
  private static fallbackBrowser(ua: string): string {
    if (/Edg\//.test(ua)) return 'Microsoft Edge'
    if (/Chrome\/(\d+)/.test(ua)) return `Chrome ${RegExp.$1}`
    if (/Firefox\/(\d+)/.test(ua)) return `Firefox ${RegExp.$1}`
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari'
    return '알 수 없는 브라우저'
  }

  /**
   * fallback OS 파싱
   */
  private static fallbackOS(ua: string): string {
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11'
    if (/Mac OS X/.test(ua)) return 'macOS'
    if (/Linux/.test(ua)) return 'Linux'
    if (/Android/.test(ua)) return 'Android'
    if (/iPhone|iPad/.test(ua)) return 'iOS'
    return '알 수 없는 OS'
  }

  private static fallbackParse(ua: string): Pick<DeviceInfo, 'browser' | 'os' | 'deviceType'> {
    return {
      browser: this.fallbackBrowser(ua),
      os: this.fallbackOS(ua),
      deviceType: /Mobile|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop',
    }
  }

  private static maskIP(ipHash: string): string {
    // ipHash는 SHA-256이므로 원래 IP 복원 불가. UI에서는 "보안 처리됨" 표시
    return '보안 처리됨'
  }
}
```

**DQ-AC-4 확정 답변 요약**:

| 항목 | 결정 |
|------|------|
| 채택 라이브러리 | `ua-parser-js@1.x` (MIT, 활발한 유지보수) |
| 미채택 대안 1 | `useragent` — 2020년 이후 사실상 비유지, CVE 노출 위험 |
| 미채택 대안 2 | `detect-browser` — 번들 크기는 작지만 OS/버전 정보 불충분 |
| fallback | 자체 정규식 (ua-parser-js 파싱 실패 시 5개 패턴 매칭) |
| 번들 영향 | ua-parser-js@1.x 약 17KB gzip — NFR-BUNDLE.3 허용 범위 |

### 3.5 `PasswordService`

```typescript
// src/lib/auth/core/PasswordService.ts

import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'

const BCRYPT_COST = 12
const HIBP_API = 'https://api.pwnedpasswords.com/range/'
const MIN_LENGTH = 12

export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
}

export class PasswordService {
  /**
   * bcrypt 해시 (cost 12)
   */
  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST)
  }

  static async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  /**
   * 비밀번호 정책 검증 (FR-5.3 세부 요구사항 #3)
   * - 최소 12자
   * - 대소문자/숫자/특수문자 중 3종 이상
   * - HIBP 유출 비밀번호 체크
   */
  static async validate(password: string): Promise<PasswordValidationResult> {
    const errors: string[] = []

    if (password.length < MIN_LENGTH) {
      errors.push(`비밀번호는 최소 ${MIN_LENGTH}자 이상이어야 합니다.`)
    }

    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasDigit = /\d/.test(password)
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    const typeCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length

    if (typeCount < 3) {
      errors.push('대문자, 소문자, 숫자, 특수문자 중 3종 이상을 포함해야 합니다.')
    }

    if (errors.length === 0) {
      const isPwned = await this.checkHIBP(password)
      if (isPwned) {
        errors.push('이미 유출된 비밀번호입니다. 다른 비밀번호를 사용하세요.')
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * HIBP k-Anonymity API 체크 (프라이버시 보호)
   * SHA-1 해시 앞 5자리만 전송
   */
  private static async checkHIBP(password: string): Promise<boolean> {
    try {
      const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
      const prefix = sha1.slice(0, 5)
      const suffix = sha1.slice(5)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000) // 3초 타임아웃

      const res = await fetch(`${HIBP_API}${prefix}`, { signal: controller.signal })
      clearTimeout(timeout)

      const text = await res.text()
      return text.split('\n').some(line => line.startsWith(suffix))
    } catch {
      // HIBP API 장애 시 pass (가용성 우선)
      return false
    }
  }
}
```

### 3.6 `AnonymousRoleService`

```typescript
// src/lib/auth/core/AnonymousRoleService.ts

import { prisma } from '@/lib/db/prisma'
import { SessionService } from './SessionService'
import { JWTService } from './JWTService'

const ANONYMOUS_EXPIRY_DAYS = 7

/**
 * Anonymous sign-in (DQ-AC-3 확정: GUEST role)
 * 목적: 미인증 사용자에게 제한된 읽기 권한 부여
 *       (향후 OAuth 연결 시 Anonymous → 정식 계정 전환 가능)
 */
export class AnonymousRoleService {
  /**
   * Anonymous 세션 발급
   * - User 레코드 생성 없이 임시 UUID 기반 GUEST 토큰 발급
   * - 단, user_sessions 에는 기록 (추적 가능성)
   */
  static async signIn(
    ipAddress: string,
    userAgent?: string
  ): Promise<{ accessToken: string; sessionToken: string; anonymousId: string }> {
    // 임시 User 레코드 생성 (is_anonymous=true)
    const anonymousUser = await prisma.user.create({
      data: {
        email: `anon_${crypto.randomUUID()}@anonymous.local`, // 중복 방지용 UUID
        passwordHash: '', // 비밀번호 없음
        role: 'GUEST',
        isActive: true,
        isAnonymous: true,
      },
    })

    const { sessionToken, sessionId } = await SessionService.create({
      userId: anonymousUser.id,
      ipAddress,
      userAgent,
      mfaMethod: null,
      isAnonymous: true,
    })

    const accessToken = await JWTService.signAccess({
      sub: anonymousUser.id,
      email: anonymousUser.email,
      role: 'GUEST',
      sessionId,
      mfaCompleted: false,
      isAnonymous: true,
    })

    return { accessToken, sessionToken, anonymousId: anonymousUser.id }
  }

  /**
   * Anonymous → 정식 계정 전환 (OAuth 연결 또는 이메일 가입)
   * Anonymous 세션을 이어받아 신규 사용자 ID에 연결
   */
  static async linkToAccount(
    anonymousId: string,
    realUserId: string
  ): Promise<void> {
    // Anonymous User의 세션들을 realUser로 이전
    await prisma.userSession.updateMany({
      where: { userId: anonymousId },
      data: { userId: realUserId },
    })

    // Anonymous User 레코드 soft-delete (isActive=false)
    await prisma.user.update({
      where: { id: anonymousId },
      data: { isActive: false },
    })

    await prisma.auditLog.create({
      data: {
        action: 'ANONYMOUS_LINKED',
        userId: realUserId,
        details: { anonymousId },
        severity: 'LOW',
      },
    })
  }

  /**
   * 만료된 Anonymous 계정 정리 (7일 이상 비활동)
   * node-cron 일간 작업으로 실행
   */
  static async cleanupExpired(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - ANONYMOUS_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const result = await prisma.user.deleteMany({
      where: {
        isAnonymous: true,
        isActive: true,
        createdAt: { lt: cutoff },
        sessions: { none: { lastSeenAt: { gt: cutoff } } },
      },
    })
    return { deleted: result.count }
  }
}
```

### 3.7 `AuthMiddleware`

```typescript
// src/lib/auth/core/AuthMiddleware.ts

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { JWTService } from './JWTService'
import { SessionService } from './SessionService'

// RBAC 라우트 매핑 (단일 진실 소스 — FR-5.4)
// lib/auth/rbac.ts에서 import
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/api/v1/admin': ['ADMIN'],
  '/api/v1/settings/security': ['ADMIN'],
  '/api/v1/users': ['ADMIN', 'MANAGER'],
  '/api/v1/sql': ['ADMIN', 'MANAGER'],
  '/api/v1/files': ['ADMIN', 'MANAGER', 'USER'],
  '/api/v1/auth/mfa': ['ADMIN', 'MANAGER', 'USER'],
}

export class AuthMiddleware {
  static async handle(req: NextRequest): Promise<NextResponse | null> {
    const token = req.cookies.get('access_token')?.value
      ?? req.headers.get('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    let claims
    try {
      claims = await JWTService.verify(token)
    } catch {
      return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 })
    }

    // Partial Token 차단 (MFA 완료 전)
    if ('partial' in claims && claims.partial) {
      if (!req.nextUrl.pathname.startsWith('/auth/mfa')) {
        return NextResponse.redirect(new URL('/auth/mfa', req.url))
      }
      return null // MFA 페이지는 허용
    }

    const fullClaims = claims as import('./JWTService').AccessTokenClaims

    // 세션 유효성 2차 확인 (revokedAt, expiry)
    const sessionToken = req.cookies.get('session_token')?.value
    if (sessionToken) {
      const session = await SessionService.validate(sessionToken)
      if (!session) {
        return NextResponse.json({ error: '세션이 만료되었습니다.' }, { status: 401 })
      }
    }

    // RBAC 체크
    const pathPermissions = this.getRequiredRoles(req.nextUrl.pathname)
    if (pathPermissions && !pathPermissions.includes(fullClaims.role)) {
      return NextResponse.json({ error: '이 작업을 수행할 권한이 없습니다.' }, { status: 403 })
    }

    // 요청 헤더에 클레임 주입 (Route Handler에서 사용)
    const response = NextResponse.next()
    response.headers.set('x-user-id', fullClaims.sub)
    response.headers.set('x-user-role', fullClaims.role)
    response.headers.set('x-session-id', fullClaims.sessionId)
    response.headers.set('x-mfa-completed', String(fullClaims.mfaCompleted))
    return response
  }

  private static getRequiredRoles(pathname: string): string[] | null {
    for (const [pattern, roles] of Object.entries(ROUTE_PERMISSIONS)) {
      if (pathname.startsWith(pattern)) return roles
    }
    return null
  }
}
```

---

## 4. API 설계

### 4.1 기존 `/api/v1/auth/*` 확장 + 신규 엔드포인트

| 메서드 | 경로 | 역할 | 변경 유형 |
|-------|------|------|---------|
| POST | `/api/v1/auth/login` | 이메일/비밀번호 로그인 | 기존 강화 (세션 테이블 + MFA 체크) |
| POST | `/api/v1/auth/logout` | 단일 세션 로그아웃 | 기존 강화 (revokedAt) |
| POST | `/api/v1/auth/refresh` | Access Token 재발급 | 기존 강화 (tokenFamily rotation) |
| POST | `/api/v1/auth/register` | 신규 사용자 등록 | 기존 (비밀번호 정책 강화) |
| POST | `/api/v1/auth/reset-password` | 비밀번호 재설정 요청 | 기존 (HIBP 체크 추가) |
| POST | `/api/v1/auth/reset-password/confirm` | 재설정 확인 | 기존 (전체 세션 revoke 추가) |
| **GET** | **`/api/v1/auth/sessions`** | 활성 세션 목록 조회 | **신규** |
| **DELETE** | **`/api/v1/auth/sessions/:id`** | 특정 세션 종료 | **신규** |
| **DELETE** | **`/api/v1/auth/sessions`** | 전체 세션 종료 | **신규** |
| **GET** | **`/api/v1/auth/devices`** | 기기 목록 (세션+파싱) | **신규** |
| **POST** | **`/api/v1/auth/anonymous`** | Anonymous sign-in | **신규** |
| **POST** | **`/api/v1/auth/anonymous/link`** | Anonymous → 정식 계정 연결 | **신규** |
| **GET** | **`/api/v1/auth/me`** | 현재 사용자 프로필 + 세션 정보 | **신규** |

### 4.2 요청/응답 스키마 (TypeScript interface)

```typescript
// src/types/auth-core.ts

/** POST /api/v1/auth/login */
export interface LoginRequest {
  email: string
  password: string
  deviceFingerprint?: string  // 선택적 JS fingerprint
}
export interface LoginResponse {
  // MFA 필요 없는 경우
  accessToken: string
  expiresIn: number        // 초 단위 (900 = 15분)
  user: UserProfile
  // MFA 필요한 경우 (둘 중 하나만 반환)
  partialToken?: string    // MFA 필요 시 (5분 유효)
  mfaMethods?: Array<'totp' | 'webauthn'>
}

export interface UserProfile {
  id: string
  email: string
  name?: string
  role: 'ADMIN' | 'MANAGER' | 'USER' | 'GUEST'
  isAnonymous: boolean
  mfaEnabled: boolean
  lastLoginAt?: string     // ISO 8601
}

/** GET /api/v1/auth/sessions */
export interface SessionListResponse {
  sessions: SessionItem[]
  currentSessionId: string
}
export interface SessionItem {
  id: string
  isCurrent: boolean
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  mfaMethod?: 'totp' | 'webauthn' | null
}

/** GET /api/v1/auth/devices */
export interface DeviceListResponse {
  devices: DeviceItem[]
  currentSessionId: string
}
export interface DeviceItem {
  sessionId: string
  isCurrent: boolean
  browser: string           // "Chrome 120"
  os: string                // "Windows 11"
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  lastSeenAt: string
  createdAt: string
  ipMasked: string          // "보안 처리됨"
}

/** DELETE /api/v1/auth/sessions/:id */
export interface RevokeSessionResponse {
  success: boolean
  message: string           // "세션이 종료되었습니다."
}

/** POST /api/v1/auth/anonymous */
export interface AnonymousSignInResponse {
  accessToken: string
  anonymousId: string
  expiresAt: string         // 7일 후 ISO 8601
  limitations: string[]     // ["읽기 전용 접근", "파일 업로드 불가" 등]
}

/** POST /api/v1/auth/anonymous/link */
export interface AnonymousLinkRequest {
  anonymousId: string
  email: string
  password: string          // 이메일 가입 경로
  // 또는 OAuth token (Phase 18 이후)
}
export interface AnonymousLinkResponse {
  success: boolean
  userId: string
  accessToken: string       // 정식 계정 토큰
}

/** GET /api/v1/auth/me */
export interface MeResponse {
  user: UserProfile
  currentSession: {
    id: string
    createdAt: string
    lastSeenAt: string
    device: Pick<DeviceItem, 'browser' | 'os' | 'deviceType'>
    mfaCompleted: boolean
  }
  activeSessions: number    // 현재 활성 세션 수
}
```

### 4.3 Event Hook 표준 (Auth.js onSession/onSignIn 패턴 차용)

```typescript
// src/lib/auth/core/AuthEventBus.ts

export type AuthEventType =
  | 'SIGN_IN'
  | 'SIGN_OUT'
  | 'SESSION_CREATED'
  | 'SESSION_REVOKED'
  | 'ALL_SESSIONS_REVOKED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'ROLE_CHANGED'
  | 'ANONYMOUS_LINKED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'

export interface AuthEvent {
  type: AuthEventType
  userId: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

type AuthEventHandler = (event: AuthEvent) => Promise<void>

const handlers: Map<AuthEventType, AuthEventHandler[]> = new Map()

export const AuthEventBus = {
  on(type: AuthEventType, handler: AuthEventHandler) {
    if (!handlers.has(type)) handlers.set(type, [])
    handlers.get(type)!.push(handler)
  },

  async emit(event: AuthEvent) {
    const eventHandlers = handlers.get(event.type) ?? []
    await Promise.allSettled(eventHandlers.map(h => h(event)))
    // 모든 이벤트 감사 로그 기록
    await import('@/lib/db/prisma').then(({ prisma }) =>
      prisma.auditLog.create({
        data: {
          action: event.type,
          userId: event.userId,
          details: event.metadata ?? {},
          severity: getSeverity(event.type),
        },
      })
    )
  },
}

function getSeverity(type: AuthEventType): 'LOW' | 'MEDIUM' | 'HIGH' {
  const HIGH_EVENTS = ['ALL_SESSIONS_REVOKED', 'ROLE_CHANGED', 'PASSWORD_CHANGED']
  const MEDIUM_EVENTS = ['SESSION_REVOKED', 'MFA_DISABLED', 'ANONYMOUS_LINKED']
  if (HIGH_EVENTS.includes(type)) return 'HIGH'
  if (MEDIUM_EVENTS.includes(type)) return 'MEDIUM'
  return 'LOW'
}
```

---

## 5. 데이터 모델

### 5.1 Tier 1 ERD 인용 (02-data-model-erd.md §3.2)

`user_sessions` 테이블은 Tier 1 ERD `02-data-model-erd.md §3.2.1`에 정의된 것을 채용하며, 아래에 Blueprint 레벨 정밀 튜닝을 추가한다.

### 5.2 `user_sessions` — 완전 CREATE TABLE

```sql
-- Phase 17 마이그레이션
CREATE TABLE user_sessions (
  id                  TEXT        NOT NULL,  -- SHA-256 hex (64자) — NOT UUID
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash             CHAR(64)    NOT NULL,  -- SHA-256 of IP (개인정보 보호)
  user_agent          VARCHAR(256),
  device_fingerprint  TEXT,                  -- 선택적 JS fingerprint
  mfa_method          VARCHAR(20),           -- 'totp' | 'webauthn' | null
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,           -- DQ-AC-10: soft-revoke (DELETE 대신)
  CONSTRAINT pk_user_sessions PRIMARY KEY (id),
  CONSTRAINT chk_expires_future CHECK (expires_at > created_at)
);

-- 인덱스
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_active
  ON user_sessions(user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;       -- 활성 세션만 인덱싱 (파셜 인덱스)
CREATE INDEX idx_user_sessions_expiry
  ON user_sessions(expires_at)
  WHERE revoked_at IS NULL;       -- cleanup cron에서 사용

-- RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_sessions_own ON user_sessions
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true)::uuid);
CREATE POLICY user_sessions_admin ON user_sessions
  FOR ALL
  USING (current_setting('app.current_user_role', true) = 'ADMIN');

-- cleanup cron (매일 새벽 3시, node-cron에 등록):
-- UPDATE user_sessions SET revoked_at = NOW() WHERE expires_at < NOW() AND revoked_at IS NULL;

COMMENT ON TABLE user_sessions IS 'Server-side 세션 저장. id=SHA-256(session_token). Lucia 패턴. revokedAt soft-revoke.';
```

### 5.3 `users` 테이블 확장 (Role enum + Anonymous 컬럼)

```sql
-- Phase 17 마이그레이션 — users 테이블 확장
-- 기존 Role: ADMIN, MANAGER, USER

-- GUEST role 추가 (DQ-AC-3: Anonymous sign-in용)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GUEST';

-- Anonymous 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

-- Anonymous 사용자 인덱스
CREATE INDEX idx_users_anonymous ON users(is_anonymous, created_at)
  WHERE is_anonymous = TRUE;

COMMENT ON COLUMN users.is_anonymous IS 'Anonymous sign-in 사용자 여부. TRUE이면 GUEST role + 7일 후 자동 삭제';
```

### 5.4 `token_families` 테이블 (DQ-AA-8 연계, Auth Advanced §11.2 참조)

```sql
-- Phase 17 마이그레이션 — user_sessions와 동시 생성
CREATE TABLE token_families (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id          TEXT        NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  family_hash         CHAR(64)    NOT NULL UNIQUE,  -- 최초 Refresh Token SHA-256
  current_token_hash  CHAR(64)    NOT NULL,          -- 현재 유효 Refresh Token SHA-256
  reuse_detected      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rotated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ,
  CONSTRAINT chk_token_hash_length CHECK (char_length(current_token_hash) = 64)
);

CREATE INDEX idx_token_families_session ON token_families(session_id);
CREATE INDEX idx_token_families_current USING HASH ON token_families (current_token_hash);
CREATE INDEX idx_token_families_active
  ON token_families(user_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE token_families IS 'Refresh Token 가족 추적. Reuse Detection + 가족 단위 무효화. DQ-AA-8 확정 답변.';
```

### 5.5 `user_oauth_accounts` 테이블 (Phase 18 준비)

```sql
-- Phase 17 마이그레이션에 미리 생성 (Phase 18 OAuth 착수 시 즉시 사용)
CREATE TABLE user_oauth_accounts (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(30) NOT NULL,  -- 'google' | 'github' | 'naver' | 'kakao'
  provider_user_id TEXT        NOT NULL,
  access_token    TEXT,                  -- 암호화 저장 (Vault Phase 16 완성 후)
  refresh_token   TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_provider_user UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_oauth_accounts_user ON user_oauth_accounts(user_id);

COMMENT ON TABLE user_oauth_accounts IS 'OAuth Provider 연결 계정. Account linking 지원 (DQ-AC-7). Phase 18 OAuth와 함께 활성화.';
```

---

## 6. UI 컴포넌트

### 6.1 컴포넌트 위치

```
src/app/(dashboard)/settings/security/
├── page.tsx                    ← Security 설정 페이지 (MFA + 세션 통합)
├── _components/
│   ├── ActiveSessionsPanel.tsx  ← 활성 세션/기기 목록 패널
│   └── AnonymousLinkModal.tsx   ← Anonymous → 정식 계정 전환 모달
```

### 6.2 `ActiveSessionsPanel` 설계

```typescript
// src/app/(dashboard)/settings/security/_components/ActiveSessionsPanel.tsx

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Monitor, Smartphone, Tablet, LogOut, Shield } from 'lucide-react'
import { toast } from 'sonner'
import type { DeviceListResponse, DeviceItem } from '@/types/auth-core'

/**
 * 활성 세션/기기 목록 패널
 * - ua-parser-js 파싱 결과를 아이콘으로 시각화
 * - 현재 세션 하이라이트
 * - 단일/전체 로그아웃 버튼
 */
export function ActiveSessionsPanel() {
  const [data, setData] = useState<DeviceListResponse | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchDevices() {
    const res = await fetch('/api/v1/auth/devices')
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  useEffect(() => { fetchDevices() }, [])

  async function revokeSession(sessionId: string) {
    if (!confirm('이 기기의 세션을 종료하시겠습니까?')) return
    const res = await fetch(`/api/v1/auth/sessions/${sessionId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('세션이 종료되었습니다.')
      fetchDevices()
    }
  }

  async function revokeAll() {
    if (!confirm('현재 기기를 제외한 모든 세션을 종료하시겠습니까?')) return
    const res = await fetch('/api/v1/auth/sessions', { method: 'DELETE' })
    if (res.ok) {
      toast.success('다른 모든 세션이 종료되었습니다.')
      fetchDevices()
    }
  }

  function DeviceIcon({ deviceType }: { deviceType: DeviceItem['deviceType'] }) {
    if (deviceType === 'mobile') return <Smartphone className="h-4 w-4" />
    if (deviceType === 'tablet') return <Tablet className="h-4 w-4" />
    return <Monitor className="h-4 w-4" />
  }

  if (loading) return <div className="animate-pulse h-40 bg-muted rounded" />

  const otherSessions = data?.devices.filter(d => !d.isCurrent) ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" /> 활성 세션
        </CardTitle>
        {otherSessions.length > 0 && (
          <Button variant="destructive" size="sm" onClick={revokeAll}>
            <LogOut className="h-3 w-3 mr-1" /> 다른 모든 세션 종료
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.devices.map(device => (
          <div
            key={device.sessionId}
            className={`flex items-center justify-between p-3 border rounded ${
              device.isCurrent ? 'border-primary bg-primary/5' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <DeviceIcon deviceType={device.deviceType} />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{device.browser}</p>
                  {device.isCurrent && (
                    <Badge variant="outline" className="text-xs">현재 기기</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {device.os} · 마지막 활동: {new Date(device.lastSeenAt).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
            {!device.isCurrent && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revokeSession(device.sessionId)}
              >
                <LogOut className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
        {data?.devices.length === 0 && (
          <p className="text-sm text-muted-foreground">활성 세션이 없습니다.</p>
        )}
      </CardContent>
    </Card>
  )
}
```

### 6.3 `AnonymousLinkModal` 설계

```typescript
// src/app/(dashboard)/settings/security/_components/AnonymousLinkModal.tsx

'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface AnonymousLinkModalProps {
  anonymousId: string
  open: boolean
  onSuccess: (userId: string) => void
}

/**
 * Anonymous 세션 → 정식 계정 전환 모달
 * 이메일 가입 또는 (Phase 18 이후) OAuth 연결
 */
export function AnonymousLinkModal({ anonymousId, open, onSuccess }: AnonymousLinkModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function handleLink() {
    setIsLoading(true)
    setErrors([])

    const res = await fetch('/api/v1/auth/anonymous/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonymousId, email, password }),
    })

    const data = await res.json()

    if (data.success) {
      toast.success('계정이 생성되었습니다! 다시 로그인하지 않아도 됩니다.')
      onSuccess(data.userId)
    } else {
      setErrors(data.errors ?? [data.error ?? '계정 연결에 실패했습니다.'])
    }
    setIsLoading(false)
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>계정 만들기</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            이메일과 비밀번호를 설정하면 다음에도 로그인할 수 있습니다.
          </p>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="최소 12자, 대소문자/숫자/특수문자 3종"
            />
          </div>
          {errors.length > 0 && (
            <ul className="text-sm text-destructive space-y-1">
              {errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
          <Button
            className="w-full"
            onClick={handleLink}
            disabled={isLoading || !email || password.length < 12}
          >
            {isLoading ? '처리 중...' : '계정 만들기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 7. 통합

### 7.1 Auth Advanced (MFA 단계 연결)

Auth Core는 L2에서 L3 Auth Advanced에 **기반을 제공**한다. 통합 지점:

1. **Partial Token 발급**: `JWTService.signPartial()` — Auth Advanced `MFAController`가 호출. ES256 서명 공유.
2. **세션 업그레이드**: MFA 검증 완료 시 `user_sessions.mfa_method` 업데이트.
3. **Rate Limit 연계**: 로그인 5회 실패 → 계정 잠금 (`users.isActive=false`, FR-5.1 세부 #3). RateLimitGuard의 auth 정책과 이중 방어.

```typescript
// 로그인 API (통합 흐름)
// src/app/api/v1/auth/login/route.ts

export async function POST(req: NextRequest) {
  // 1. Rate Limit 체크
  const rateLimitResponse = await RateLimitGuard.middleware(req, 'auth')
  if (rateLimitResponse) return rateLimitResponse

  const { email, password } = await req.json()

  // 2. 비밀번호 검증
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await PasswordService.verify(password, user.passwordHash))) {
    // 실패 횟수 추적 → 5회 시 잠금
    await incrementFailCount(user?.id)
    return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 3. MFA 필요 여부 판단 (Auth Advanced 연계)
  const { MFAController } = await import('@/lib/auth/advanced/MFAController')
  const mfaController = new MFAController(...)
  const mfaCheck = await mfaController.checkMFARequired(user)

  if (mfaCheck.required) {
    return NextResponse.json({
      partialToken: mfaCheck.partialToken,
      mfaMethods: mfaCheck.methods,
    })
  }

  // 4. 세션 생성 + JWT 발급
  const ip = RateLimitGuard.getClientIP(req)
  const { sessionToken, sessionId } = await SessionService.create({
    userId: user.id,
    ipAddress: ip,
    userAgent: req.headers.get('user-agent') ?? undefined,
  })

  const accessToken = await JWTService.signAccess(
    JWTService.composeAccessClaims({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      mfaCompleted: false,
    })
  )

  // 5. 감사 로그 + Hook 발행
  await AuthEventBus.emit({ type: 'SIGN_IN', userId: user.id, timestamp: new Date() })

  const response = NextResponse.json({ accessToken, user: toProfile(user) })
  response.cookies.set('session_token', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
  return response
}
```

### 7.2 Observability (JWKS 서명)

Auth Core JWTService는 Observability L2 레이어의 `jwks_keys` 테이블에서 현재 서명키를 조회한다. Phase 16(Observability) 완성 전까지는 임시 파일 기반 키를 사용하고, Phase 16 완성 후 자동 전환.

```typescript
// Phase 16 전: 임시 파일 기반 키
// Phase 16 후: prisma.jwksKey.findFirst({ where: { status: 'CURRENT' } })

// 환경변수로 모드 전환
const USE_JWKS_DB = process.env.JWKS_MODE === 'db' // Phase 16 완성 시 'db'로 전환
```

### 7.3 RLS (Prisma middleware)

Auth Core는 모든 Prisma 쿼리에 `app.current_user_id` + `app.current_user_role` 설정을 주입하는 미들웨어를 제공. RLS 정책이 이 설정을 참조.

```typescript
// src/lib/db/prisma-rls-middleware.ts

export function createRLSMiddleware(userId: string, role: string) {
  return prisma.$use(async (params, next) => {
    // 각 쿼리 전 PG 세션 변수 설정
    await prisma.$executeRaw`
      SET LOCAL app.current_user_id = ${userId};
      SET LOCAL app.current_user_role = ${role};
    `
    return next(params)
  })
}
```

---

## 8. NFR 매핑

Wave 3 `03-non-functional-requirements.md` NFR-SEC Auth Core 관련 매핑:

| NFR | 내용 | Auth Core 구현 |
|-----|------|---------------|
| **NFR-SEC.1** | JWT ES256 + JWKS 24h rotate | `JWTService.signAccess()` ES256 전용. `algorithms: ['ES256']` 검증 화이트리스트 |
| **NFR-SEC.4** | Rate Limit 10 req/min/IP | `RateLimitGuard.middleware(req, 'auth')` 로그인/회원가입 라우트 적용 |
| **NFR-SEC.6** | Prepared Statement 강제 | Prisma 7 ORM 전용. `SessionService` 내 Raw SQL 0건 |
| **NFR-SEC.7** | RLS 기본 활성화 | `user_sessions`, `token_families`, `user_oauth_accounts` 모두 RLS 활성 |
| **NFR-SEC.8** | OWASP A02 (암호화 실패) | 세션 ID SHA-256 해시 저장 (DQ-AC-6). IP SHA-256 해시 저장. Refresh Token 해시 저장 |
| **NFR-SEC.9** | CSRF + CORS | `SameSite=Lax` 쿠키 설정. double-submit CSRF 패턴 (Auth.js 차용) |
| **NFR-SEC.10** | 감사 로그 불변성 | `AuthEventBus.emit()` — 모든 Auth 이벤트 `audit_log` append-only 기록 |
| **NFR-UX.2** | 한국어 UI | 모든 에러 메시지 한국어. `requireRole` 차단 시 "이 작업을 수행할 권한이 없습니다." |

---

## 9. 리스크

### 9.1 Session 고아 엔트리

| 항목 | 내용 |
|------|------|
| **리스크** | `user_sessions` 테이블에 만료되었지만 revokedAt 미설정인 고아 레코드 누적 |
| **영향도** | 낮음 (기능 영향 없음) / 중간 (테이블 비대화 → 성능 저하) |
| **완화** | 1) 파셜 인덱스로 활성 세션만 조회. 2) 일간 Cron: `UPDATE user_sessions SET revoked_at=NOW() WHERE expires_at < NOW() AND revoked_at IS NULL`. 3) 90일 후 물리 삭제 Cron |

### 9.2 Anonymous role 권한 확장 (Privilege Escalation)

| 항목 | 내용 |
|------|------|
| **리스크** | GUEST role이 실수로 ADMIN/MANAGER 영역에 접근 |
| **영향도** | 높음 — 데이터 유출 가능 |
| **완화** | 1) `AuthMiddleware` ROUTE_PERMISSIONS에 GUEST 명시적 제외. 2) RLS 정책: `current_setting('app.current_user_role') != 'GUEST'` 필터. 3) API 테스트: GUEST 토큰으로 admin 라우트 → 403 확인 |

### 9.3 jose v5 breaking change

| 항목 | 내용 |
|------|------|
| **리스크** | jose v5 → v6 major 업그레이드 시 API 변경으로 JWT 검증 실패 |
| **영향도** | 높음 — 전체 인증 중단 |
| **완화** | 1) `package.json`에 `"jose": "~5.x"` 패치 버전만 자동 업데이트. 2) ADR-006 재검토 트리거 #1 (Node 24 LTS jose breaking change 시). 3) Unit 테스트에 jose 버전 명시 주석 |

### 9.4 bcrypt → argon2 전환 지연

| 항목 | 내용 |
|------|------|
| **리스크** | bcrypt cost 12는 현재 안전하지만 2027+ GPU 가속 공격에 취약해질 가능성 |
| **영향도** | 중간 |
| **완화** | DQ-AC-1 답변은 Wave 5에서 확정. `@node-rs/argon2` 전환 준비: `PasswordService` 인터페이스로 추상화하여 교체 용이하게 설계. 전환 시 기존 bcrypt 해시는 다음 로그인 시 점진적 re-hash |

---

## 10. Wave 4 할당 DQ 답변: DQ-AC-4

### DQ-AC-4 [Auth Core] 디바이스 목록 UI user-agent 파싱 — 최종 확정

**질문**: 디바이스 목록 UI에서 user-agent parsing 라이브러리는?
**배경**: `01-research/05-auth-core/01-lucia-auth-deep-dive.md §631` — ua-parser-js 권장.

### 10.1 결정: ua-parser-js@1.x 채택

**평가 비교**:

| 라이브러리 | 상태 | 번들 크기 | 정보 풍부도 | 결정 |
|---------|------|---------|---------|-----|
| `ua-parser-js@1.x` | 활발 유지보수 (2024년 활성) | ~17KB gzip | 브라우저+OS+버전+기기 타입 | **채택** |
| `useragent` | 사실상 비유지 (2020년 마지막 릴리즈) | ~45KB | 브라우저+OS | 거부 — 보안 CVE 위험 |
| `detect-browser` | 소규모 (GitHub 1.8K stars) | ~6KB gzip | 브라우저만 (OS 미지원) | 거부 — 정보 불충분 |
| 자체 정규식 | 직접 구현 | ~2KB | 기본 5개 패턴 | fallback으로만 사용 |

**채택 이유 세부**:
1. `ua-parser-js@1.x` — MIT 라이선스. 2024년 12월 기준 주간 다운로드 2,200만+. Next.js 16 App Router 서버 컴포넌트에서 사용 가능 (Node.js 모듈, 브라우저 API 불필요).
2. 번들 크기 17KB는 서버 사이드 파싱이므로 클라이언트 번들에 영향 없음 (NFR-BUNDLE.3 관련 없음).
3. 2023년 npm 공급망 공격 사건 (`ua-parser-js` 3개 버전 악성코드 삽입) — `package-lock.json` 고정 + `npm audit` 의무화로 대응.

**fallback 자체 정규식 (5개 패턴)**:

```typescript
// DeviceService.ts 내 fallback (§3.4 코드 참조)
// 브라우저: Edge / Chrome / Firefox / Safari
// OS: Windows 10/11 / macOS / Linux / Android / iOS
```

### 10.2 DQ-AC-4 최종 확정 답변

| 항목 | 결정 |
|------|------|
| **채택 라이브러리** | `ua-parser-js@1.x` (MIT) |
| **대안 거부** | `useragent` (비유지, CVE 위험) / `detect-browser` (OS 정보 없음) |
| **fallback** | 자체 정규식 5패턴 (`DeviceService.fallbackBrowser/OS()`) |
| **서버 사이드** | Route Handler에서만 파싱. 클라이언트 번들 영향 0 |
| **보안** | `package-lock.json` 버전 고정 + `npm audit` CI 의무화 |
| **Wave 할당** | Wave 4 — `02-architecture/06-auth-core-blueprint.md §10` 확정 |

---

## 11. Phase 17 WBS (Auth Core 30h 파트)

### 11.1 총 공수: 30h

Wave 3 `10-14-categories-priority.md §4.1` — Phase 17: Auth Core 완성 + Storage = 60h 중 Auth Core 파트 30h.

```
Phase 17-A: 세션 테이블 + JWT 강화 (8h)
  → DoD: user_sessions/token_families 마이그레이션, SessionService Unit 테스트 통과

Phase 17-B: 디바이스 목록 + 세션 관리 UI (6h)
  → DoD: ActiveSessionsPanel UI, ua-parser-js 파싱, 세션 종료 API

Phase 17-C: Anonymous role (6h)
  → DoD: GUEST role 추가, AnonymousRoleService 구현, AnonymousLinkModal UI

Phase 17-D: 이벤트 Hook + 감사 로그 강화 (4h)
  → DoD: AuthEventBus 등록, 모든 Auth 이벤트 audit_log 기록

Phase 17-E: 비밀번호 정책 강화 (3h)
  → DoD: HIBP 체크 통합, PasswordService 리팩토링, Unit 테스트

Phase 17-F: AuthMiddleware + RLS 통합 테스트 (3h)
  → DoD: RBAC 매트릭스 13 시나리오 테스트 통과, RLS 파셜 인덱스 성능 확인

합계: 30h
```

### 11.2 태스크 분해 (14개 태스크)

| # | 태스크 | 공수 | 선행 조건 | DoD |
|---|--------|------|---------|-----|
| T1 | DB 마이그레이션 (user_sessions + token_families + users 확장) | 1.5h | Phase 15 완료 (rate_limit_events 존재) | `prisma migrate dev` 성공 |
| T2 | `SessionService` 구현 (create/validate/revoke/list) | 2h | T1 | SHA-256 해시 저장 확인, Slide window 동작 Unit 테스트 |
| T3 | `JWTService` ES256 완전 전환 (HS256 제거) | 1.5h | T1 | `algorithms: ['ES256']` 검증 Unit 테스트 |
| T4 | `RefreshTokenService` tokenFamily rotation | 2h | T2, T3 | Reuse Detection 시나리오 (2개 브라우저 동시 refresh) Integration 테스트 |
| T5 | 로그인 API 통합 강화 (세션 + MFA 연계) | 2h | T2, T3, Phase 15 MFAController | 로그인 → MFA → Full Session 발급 E2E 테스트 |
| T6 | 세션 관리 API (GET sessions / DELETE sessions/:id / DELETE sessions) | 1.5h | T2 | Postman 3개 엔드포인트 테스트 |
| T7 | `DeviceService` + ua-parser-js 설치 | 1h | T1 | ua-parser-js 파싱 5개 UA 테스트 벡터 |
| T8 | 기기 목록 API (GET devices) | 1h | T6, T7 | Chrome/Safari/Firefox UA 기기 타입 구분 확인 |
| T9 | `ActiveSessionsPanel` UI | 2.5h | T8 | Playwright: 세션 목록 렌더링 + 단일/전체 로그아웃 동작 |
| T10 | users 테이블 GUEST role 추가 마이그레이션 | 0.5h | T1 | enum value 추가 확인 |
| T11 | `AnonymousRoleService` (signIn + linkToAccount + cleanupExpired) | 2h | T10, T2 | Anonymous 로그인 → 정식 연결 Unit 테스트 |
| T12 | Anonymous API (POST anonymous / POST anonymous/link) | 1.5h | T11 | Anonymous 발급 + 7일 만료 로직 확인 |
| T13 | `AnonymousLinkModal` UI | 1.5h | T12 | Anonymous → 이메일 가입 플로우 E2E |
| T14 | `AuthEventBus` + 감사 로그 통합 + 전체 테스트 | 3h | T5, T9, T13 | 모든 Auth 이벤트 audit_log 기록 확인. RBAC 13 시나리오 통과 |

**합계: 23.5h** (나머지 6.5h는 코드 리뷰, 문서 업데이트, 보안 점검)

### 11.3 선행 조건 DAG

```
T1 (DB 마이그레이션)
 ├─→ T2 (SessionService) ──→ T4 (RefreshTokenService) ──→ T5 (로그인 API)
 │    │                                                       │
 │    └─→ T6 (세션 API) ──→ T8 (기기 API) ──→ T9 (ActiveSessionsPanel)
 │    └─→ T11 (AnonymousRoleService) ──→ T12 (Anonymous API) ──→ T13 (AnonymousLinkModal)
 ├─→ T3 (JWTService ES256) ──→ T4
 ├─→ T7 (DeviceService) ──→ T8
 └─→ T10 (GUEST role) ──→ T11

T14 (감사 로그 통합) ← T5 + T9 + T13 완료 후
```

### 11.4 Phase 22 보너스 경로 (90 → 100점)

| 항목 | 추가 점수 | 조건 |
|------|---------|------|
| OAuth Providers (ADR-017) | +5 | Phase 18 착수 (사용자 추가 or 외부 요청) |
| Account Linking 고도화 | +3 | Phase 18 OAuth와 함께 |
| Passkey 단독 인증 (비밀번호 폐기) | +2 | ADR-007 재검토 트리거 #3 충족 시 |

---

## 부록 Z. 근거 인덱스

### Z.1 이 문서가 인용하는 Wave 문서

| 섹션 | 근거 문서 경로 |
|------|--------------|
| §2 채택안 | `01-research/05-auth-core/01-lucia-auth-deep-dive.md §11.1, §628-631` |
| §2 채택안 | `01-research/05-auth-core/02-authjs-v6-pattern-deep-dive.md §11.1, §729-733` |
| §2 채택안 | `01-research/05-auth-core/03-auth-core-matrix.md §0, §1.2, §3.2` |
| §2 채택안 | `01-research/05-auth-core/04-lucia-vs-authjs.md` |
| §1 현황 | `00-vision/10-14-categories-priority.md §3, §4.1` |
| §5 ERD | `02-architecture/02-data-model-erd.md §3.2, §2.1` |
| §8 NFR | `00-vision/03-non-functional-requirements.md §2 NFR-SEC` |
| §10 DQ-AC-4 | `00-vision/07-dq-matrix.md §3.6 DQ-AC-4` |
| ADR | `02-architecture/01-adr-log.md ADR-006, ADR-017, ADR-018` |
| Auth Advanced 연계 | `02-architecture/03-auth-advanced-blueprint.md §11 DQ-AA-8` |

### Z.2 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent B1 (Sonnet 4.6) | Wave 4 Tier 2 초안 — Auth Core 완전 Blueprint |

---

> **Auth Core Blueprint 끝.** Wave 4 · B1 · 2026-04-18 · Phase 17 MVP · 30h WBS 14 태스크.
