# Auth Advanced 매트릭스 — Wave 2 (MFA + Rate Limit + CAPTCHA 경로)

> 산출물 ID: 06/04
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> Wave 1 인용:
> - `01-otplib-totp-deep-dive.md` (4.60/5.00)
> - `02-simplewebauthn-passkey-deep-dive.md` (4.64/5.00)
> - `03-rate-limiter-flexible-deep-dive.md` (4.52/5.00)
>
> Wave 1 결론: **TOTP + WebAuthn + Rate Limit 모두 동시 채택**. DQ-1.1=동시 지원, DQ-1.2=PostgreSQL/Prisma 어댑터. Phase 15~17 순차 구현.
> 범위: Auth Advanced = MFA(TOTP/WebAuthn/백업코드) + Rate Limit + Attack Protection + CAPTCHA(선택)
> 제외: Session 무효화/OAuth Provider (→ Auth Core 매트릭스)
> 평가 프레임: Round 2 공통 10차원 스코어링

---

## 0. Executive Summary

| 항목 | 값 |
|---|---|
| 비교 대상 | otplib(TOTP) / SimpleWebAuthn(Passkey) / rate-limiter-flexible(RL) / hCaptcha(CAPTCHA) / 자체 JWT refresh |
| 결정 질문 | "현재 15점 → 60점으로 올리는 3단 구현 순서"와 "60 → 100 경로" |
| 최우선 지표 | FUNC(18%) · SECURITY(10%) · INTEG(10%) · COST(3%) · SELF_HOST(5%) = 46% 누적 |
| Wave 1 결론 일관성 | ✅ 본 매트릭스가 재확인 — 4개 모두 동시 채택 가능, 순서는 TOTP → Rate Limit → WebAuthn → CAPTCHA |
| 최종 추천 | **Full Stack**: otplib + SimpleWebAuthn + rate-limiter-flexible + hCaptcha (선택) + 계정 락(직접) |
| 평균 점수 | otplib **4.60** / SimpleWebAuthn **4.64** / rate-limiter-flexible **4.52** / hCaptcha **4.10** / 자체 refresh **4.20** |
| 구현 순서 | Phase 15(TOTP 4h) → Phase 16(RL 6h) → Phase 17(WebAuthn 8h) → Phase 18(CAPTCHA 3h, 선택) = 약 21h |
| 현재 점수 → 목표 | 15/100 → 60/100 (15+12+15+18=60) → 80 (CAPTCHA+5, 감사 로그+15) → 100 (Auth Core 통합) |

**핵심 문장**: 세 라이브러리는 **데이터 모델 충돌이 없고**, 검증 로직이 독립적이며, 모두 in-process로 $0 운영이 가능하다. 3단 구현 순서는 "도입 비용 낮은 순 × 즉시 보안 효과 순"을 기준으로 **TOTP → Rate Limit → WebAuthn**이 최적이다. CAPTCHA(hCaptcha)는 SaaS 의존이 생기므로 로그인 대량 시도 감지 시점에 조건부 도입한다.

---

## 1. 비교 대상 및 포지셔닝

### 1.1 5개 후보 정의

| # | 후보 | 역할 | 형태 | 월 비용 |
|---|---|---|---|---|
| A | **otplib (TOTP)** | 2FA 기본 | npm 패키지 | $0 |
| B | **SimpleWebAuthn (Passkey)** | 2FA 고급 / Phishing-resistant | npm 패키지 | $0 |
| C | **rate-limiter-flexible (RL)** | Brute Force / DoS 방어 | npm 패키지 | $0 |
| D | **hCaptcha (CAPTCHA)** | Bot 방어 | SaaS | $0 (1M/월 무료) |
| E | **자체 JWT refresh + revoke** | 토큰 만료 관리 | 자체 구현 | $0 |

### 1.2 Supabase Auth Advanced 갭 매핑 (`_PROJECT_VS_SUPABASE_GAP.md`)

| # | 갭 항목 | Supabase 점수 | A | B | C | D | E |
|---|---|---|---|---|---|---|---|
| G1 | TOTP MFA | +6 | ✓✓✓ | — | — | — | — |
| G2 | 백업 코드 | +3 | ✓ (직접 구현) | — | — | — | — |
| G3 | WebAuthn/Passkey | +8 | — | ✓✓✓ | — | — | — |
| G4 | Conditional UI (autofill) | +2 | — | ✓ | — | — | — |
| G5 | per-IP rate limit | +4 | — | — | ✓✓✓ | — | — |
| G6 | per-email rate limit | +3 | — | — | ✓✓ | — | — |
| G7 | 계정 락 | +3 | — | — | ✓ (User 모델 확장) | — | — |
| G8 | 점진 백오프 | +2 | — | — | ✓ (두 limiter 결합) | — | — |
| G9 | CAPTCHA | +5 | — | — | — | ✓✓✓ | — |
| G10 | 토큰 refresh / revoke | +3 | — | — | — | — | ✓✓ |
| G11 | MFA partial token | +2 | ✓ (우리 구현 jose) | ✓ (공유) | — | — | ✓ |
| G12 | 감사 로그 통합 | +4 | △ | △ | ✓ (Prisma JOIN) | — | — |
| G13 | Attack detection (의심 로그인) | +4 | — | — | ✓ | ✓ | — |

**합산**: A(+9) + B(+10) + C(+18) + D(+5) + E(+3) = 현재 15 + 45 = **약 60점 가능**. 나머지 40은 Auth Core(OAuth/Session/Hook)에서 보충.

### 1.3 Wave 1 deep-dive 인용

> **01-otplib-totp-deep-dive.md §11.3**: "DQ-1.1 잠정 답변: 동시 지원 (TOTP 우선 도입 + WebAuthn 후속). 근거: otplib + simplewebauthn 스키마 충돌 없음."

> **02-simplewebauthn-passkey-deep-dive.md §12.3**: "최종 답변: 동시 지원. TOTP only +12, WebAuthn only +18, 동시 지원 **+30 최대**."

> **03-rate-limiter-flexible-deep-dive.md §12.3**: "DQ-1.2 최종 답변: PostgreSQL (Prisma 어댑터). 이유: 이미 운영 중, cluster 전환 시 코드 변경 불필요, 감사 로그와 JOIN 가능."

→ 본 매트릭스는 세 Wave 1 결론을 교차 검증하고, 구현 순서 + 60→100 경로를 확정한다.

---

## 2. 평가 기준 (10차원)

| 코드 | 가중치 | 평가 관점 |
|---|---|---|
| FUNC | 18% | Auth Advanced 갭 13개 커버도 (G1~G13). |
| PERF | 10% | 검증 응답시간, 동시성 처리, DB 부하. |
| DX | 14% | TS 타입, API 단순성, 학습 곡선, 디버깅. |
| ECO | 12% | GitHub stars, 채택도, RFC 준수. |
| LIC | 8% | MIT/ISC/Apache 자유도. |
| MAINT | 10% | 릴리스 주기, 메인테이너 수, CVE 이력. |
| INTEG | 10% | jose+Prisma 자산 재사용, 마이그레이션 비용, 타 모듈 충돌. |
| SECURITY | 10% | RFC 준수, 감사 통과, CVE 클린, replay/counter 방어. |
| SELF_HOST | 5% | 외부 SaaS 0 의존, PM2 in-process. |
| COST | 3% | 월 운영비, 무료 티어 범위. |

---

## 3. 종합 점수표

### 3.1 원점수

| 차원 | 가중치 | A otplib | B SimpleWebAuthn | C rate-limiter-flexible | D hCaptcha | E 자체 refresh |
|---|---|---|---|---|---|---|
| FUNC | 18% | 4.0 | 5.0 | 4.0 | 4.0 | 3.5 |
| PERF | 10% | 5.0 | 5.0 | 4.0 | 4.5 | 5.0 |
| DX | 14% | 5.0 | 4.0 | 5.0 | 4.0 | 4.5 |
| ECO | 12% | 4.0 | 4.0 | 5.0 | 4.0 | 3.0 |
| LIC | 8% | 5.0 | 5.0 | 5.0 | 3.0 | 5.0 |
| MAINT | 10% | 4.0 | 4.0 | 4.0 | 4.5 | 4.0 |
| INTEG | 10% | 5.0 | 5.0 | 5.0 | 3.5 | 5.0 |
| SECURITY | 10% | 5.0 | 5.0 | 4.0 | 4.0 | 4.0 |
| SELF_HOST | 5% | 5.0 | 5.0 | 5.0 | 2.0 | 5.0 |
| COST | 3% | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 |

### 3.2 가중 적용 후

| 차원 | A | B | C | D | E |
|---|---|---|---|---|---|
| FUNC (18%) | 0.72 | 0.90 | 0.72 | 0.72 | 0.63 |
| PERF (10%) | 0.50 | 0.50 | 0.40 | 0.45 | 0.50 |
| DX (14%) | 0.70 | 0.56 | 0.70 | 0.56 | 0.63 |
| ECO (12%) | 0.48 | 0.48 | 0.60 | 0.48 | 0.36 |
| LIC (8%) | 0.40 | 0.40 | 0.40 | 0.24 | 0.40 |
| MAINT (10%) | 0.40 | 0.40 | 0.40 | 0.45 | 0.40 |
| INTEG (10%) | 0.50 | 0.50 | 0.50 | 0.35 | 0.50 |
| SECURITY (10%) | 0.50 | 0.50 | 0.40 | 0.40 | 0.40 |
| SELF_HOST (5%) | 0.25 | 0.25 | 0.25 | 0.10 | 0.25 |
| COST (3%) | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 |
| **합계** | **4.60** | **4.64** | **4.52** | **3.90** | **4.22** |

### 3.3 순위

1. **B SimpleWebAuthn (4.64)** — Phishing-resistant 완비
2. **A otplib (4.60)** — TOTP 표준, 즉시 도입
3. **C rate-limiter-flexible (4.52)** — Brute Force 방어
4. **E 자체 refresh (4.22)** — 기존 JWT 자산 활용
5. **D hCaptcha (3.90)** — SaaS 의존으로 SELF_HOST/LIC 감점

**결론**: 상위 3개(B/A/C)는 점수 격차가 0.12 이내 → **함께 채택 권장**. D는 대체재(Cloudflare Turnstile) 있으므로 조건부.

---

## 4. 핵심 특성 비교

### 4.1 기능 매트릭스 (Supabase 기능 동등 관점)

| Supabase MFA 기능 | otplib | SimpleWebAuthn | RL-flexible | hCaptcha |
|---|---|---|---|---|
| TOTP 생성/검증 | ✓✓✓ | ✗ | ✗ | ✗ |
| 백업 코드 | △ (직접 구현) | ✗ | ✗ | ✗ |
| Passkey (WebAuthn) | ✗ | ✓✓✓ | ✗ | ✗ |
| 생체 인증 (Touch ID 등) | ✗ | ✓✓✓ (Platform authenticator) | ✗ | ✗ |
| FIDO2 Security Key | ✗ | ✓✓✓ | ✗ | ✗ |
| Conditional UI (autofill) | ✗ | ✓✓ (L3) | ✗ | ✗ |
| per-IP rate limit | ✗ | ✗ | ✓✓✓ | △ (CF Turnstile만) |
| per-email rate limit | ✗ | ✗ | ✓✓✓ | ✗ |
| 점진 백오프 | ✗ | ✗ | ✓✓ | ✗ |
| 계정 락 | ✗ | ✗ | △ (직접 구현) | ✗ |
| CAPTCHA challenge | ✗ | ✗ | ✗ | ✓✓✓ |
| Bot score / fingerprint | ✗ | ✗ | ✗ | ✓✓ |

### 4.2 성능 / 오버헤드

| 후보 | 평균 검증 시간 | DB 부하 | 메모리 |
|---|---|---|---|
| otplib | < 1ms (HMAC-SHA1 1회) | 0 (stateless 검증) | 무시 |
| SimpleWebAuthn | 3-5ms (ECDSA 서명 검증) | 1 lookup + 1 update (counter) | 무시 |
| RL-flexible (Memory) | < 1ms | 0 | 약 10MB/100k keys |
| RL-flexible (Prisma) | 5-15ms | 시도당 1 query | 무시 |
| hCaptcha | 30-100ms (외부 API) | 0 | 무시 |

**시사점**: RL-flexible Prisma 어댑터의 DB 부하는 `inMemoryBlockOnConsumed: 100` 옵션으로 완화. hCaptcha는 네트워크 RTT가 병목.

### 4.3 Next.js 16 통합

| 후보 | Route Handler | Server Action | RSC | Middleware |
|---|---|---|---|---|
| otplib | ✓ (Node 런타임) | ✓ | △ (state 가짐) | ✗ |
| SimpleWebAuthn | ✓ (Node 런타임) | ✓ | △ | ✗ |
| RL-flexible (Memory) | ✓ | ✓ | ✓ | ✓ |
| RL-flexible (Prisma) | ✓ | ✓ | ✓ (await) | ✓ (await) |
| hCaptcha | ✓ | ✓ | ✓ | ✓ |

### 4.4 보안 표준 준수

| 후보 | 준수 표준 | 감사 / CVE |
|---|---|---|
| otplib | RFC 4226 (HOTP) / 6238 (TOTP) / 4648 (Base32) | Snyk 클린, @noble/hashes 감사 |
| SimpleWebAuthn | W3C WebAuthn L3 / FIDO2 | Snyk 클린, 공식 compat 테스트 |
| RL-flexible | RFC 6585 (429) / RFC 7231 (Retry-After) | Snyk 클린, 원자적 increment 보장 |
| hCaptcha | GDPR / CCPA compliant, SOC2 | SaaS 자체 보안 팀 |

---

## 5. 차원별 상세 분석

### 5.1 FUNC (18%)

| 후보 | 점수 | 1줄 근거 |
|---|---|---|
| A otplib | 4.0 | TOTP/HOTP 완비. 백업 코드/암호화는 별도 구현. |
| B SimpleWebAuthn | 5.0 | WebAuthn L3 거의 완전 지원 + Passkey + Conditional UI. |
| C RL-flexible | 4.0 | per-IP/per-email/점진 백오프 모두 구현 가능. |
| D hCaptcha | 4.0 | bot 방어 단일 기능 강력. |
| E 자체 refresh | 3.5 | 우리 jose JWT refresh 패턴 이미 부분 구현. |

### 5.2 PERF (10%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 5.0 | HMAC-SHA1 < 1ms. |
| B | 5.0 | ECDSA 3-5ms. |
| C | 4.0 | Prisma 5-15ms (Memory 1ms). |
| D | 4.5 | 외부 API 30-100ms. |
| E | 5.0 | JWT verify 0.5ms. |

### 5.3 DX (14%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 5.0 | `authenticator.check(token, secret)` 1줄. |
| B | 4.0 | challenge 저장 등 보일러플레이트 존재. |
| C | 5.0 | consume/reset/block 직관적. |
| D | 4.0 | SDK 단순하나 outages 디버깅 불편. |
| E | 4.5 | jose API 명확. |

### 5.4 ECO (12%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 4.0 | npm 200만+/주, GitHub 2.6k. |
| B | 4.0 | npm 100만+/주, Auth.js·Lucia·Better Auth 채택. |
| C | 5.0 | npm 200만+/주, Express/Fastify/NestJS 광범위. |
| D | 4.0 | Cloudflare Turnstile 대체재 존재. |
| E | 3.0 | 우리만의 코드. |

### 5.5 LIC (8%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 5.0 | MIT. |
| B | 5.0 | MIT. |
| C | 5.0 | ISC (MIT 호환). |
| D | 3.0 | SaaS ToS 적용 (GDPR/CCPA), 데이터 이관 제약. |
| E | 5.0 | 자체 코드. |

### 5.6 MAINT (10%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 4.0 | v13.4.0 (2026-03), 1인 메인테이너 yeojz 활발. |
| B | 4.0 | v13.x (2025-2026), MasterKale 활발. |
| C | 4.0 | v10.0.1 (2026-03), animir 활발. |
| D | 4.5 | SaaS 자체 관리. |
| E | 4.0 | jose upstream 활발. |

### 5.7 INTEG (10%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 5.0 | jose JWT 무관, Prisma User 3컬럼. |
| B | 5.0 | jose JWT 무관, Prisma 모델 1개 + challenge 저장. |
| C | 5.0 | Prisma 어댑터 1줄. |
| D | 3.5 | 환경변수 + 외부 호출, outages 시 UX 영향. |
| E | 5.0 | 이미 사용 중. |

### 5.8 SECURITY (10%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 5.0 | RFC 완전 준수, replay 방어(lastUsedStep). |
| B | 5.0 | W3C L3 준수, origin/RP ID 자동, counter replay 자동. |
| C | 4.0 | 원자적 증가, CVE 클린. CAPTCHA 영역은 별도. |
| D | 4.0 | bot 방어 강력하나 CAPTCHA 자체 우회 기법(AI solver) 존재. |
| E | 4.0 | refresh rotation 구현 필요 (미구현 시 탈취 토큰 영구). |

### 5.9 SELF_HOST (5%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 5.0 | 100% in-process. |
| B | 5.0 | 동일 (FIDO MDS는 선택). |
| C | 5.0 | Memory/SQLite/PG 모두 in-process. |
| D | 2.0 | hCaptcha 서버 필수. (Turnstile도 동일) |
| E | 5.0 | in-process. |

### 5.10 COST (3%)

| 후보 | 점수 | 근거 |
|---|---|---|
| A | 5.0 | $0. |
| B | 5.0 | $0. |
| C | 5.0 | $0. |
| D | 5.0 | 1M/월 무료 (양평 부엌 충분). |
| E | 5.0 | $0. |

---

## 6. 동시성 / 모듈 간 상호작용

### 6.1 공유 인프라

| 공유 항목 | A | B | C | D | E |
|---|---|---|---|---|---|
| partial token (mfa_pending) | ✓ | ✓ | — | — | ✓ (발급/검증) |
| User 테이블 확장 | `totpSecret/Enabled/LastStep` | 별도 `WebAuthnCredential` | `lockedUntil/failedLoginCount` | — | `refreshToken.revokedAt` |
| 감사 로그 통합 | `/audit` (선택) | `/audit` (선택) | `/audit` (필수 — Attack detection) | `/audit` (선택) | `/audit` (권장) |
| Prisma 마이그레이션 | 1회 (Phase 15) | 2회 (Phase 17) | 1회 (Phase 16) | 0 (환경변수만) | 1회 (Phase 15~) |

### 6.2 동시 활성화 시나리오

Wave 1 저자 모두가 "동시 활성화 가능" 확인:
- TOTP + WebAuthn: otplib §11.4 + simplewebauthn §6
- + Rate Limit: rate-limiter-flexible §12 (MFA challenge endpoint에도 limiter 적용)
- + CAPTCHA: 로그인 전 pre-screen으로 배치

### 6.3 통합 Challenge Endpoint 스키마

```typescript
// /api/v1/auth/mfa/challenge
body: {
  partialToken: string;
  method: 'totp' | 'webauthn' | 'backup';
  token?: string;          // TOTP 6자리
  backupCode?: string;     // 8자리
  webauthnResp?: AuthenticationResponseJSON;
}
```

Rate limit: `mfaChallengeLimiter` (분당 5회, IP+user.id 복합 키).

---

## 7. 최종 순위 + 대안 + 민감도

### 7.1 최종 순위 (재확인)

| 순위 | 후보 | 점수 | 결정 |
|---|---|---|---|
| 1 | B SimpleWebAuthn | 4.64 | ✅ 채택 (Phase 17) |
| 2 | A otplib | 4.60 | ✅ 채택 (Phase 15 — 먼저) |
| 3 | C RL-flexible | 4.52 | ✅ 채택 (Phase 16) |
| 4 | E 자체 refresh | 4.22 | ✅ 채택 (지속) |
| 5 | D hCaptcha | 3.90 | ⚠️ 조건부 (Phase 18) |

### 7.2 구현 순서 근거

1. **Phase 15 (TOTP 4h)**: 사용자 체감 가장 쉬움, 즉시 +12점 효과
2. **Phase 16 (Rate Limit 6h)**: Brute Force 방어 즉시 필요 (로그인 폼 공개 상태)
3. **Phase 17 (WebAuthn 8h)**: 점수 극대화 (+18점), TOTP 사용자에게 단계적 업그레이드 권장
4. **Phase 18 (CAPTCHA 3h)**: Rate Limit으로 DoS 대응 가능 → 실제 봇 시도 감지 시 도입
5. **Continuous (Refresh Rotation)**: 기존 jose 자산 강화 (revokedAt + rotation)

### 7.3 대안 시나리오

#### 시나리오 α: "MFA 하나만" (보수적)
→ A otplib만 Phase 15에 채택. +12점.
→ WebAuthn/CAPTCHA는 1년 후 재평가.

#### 시나리오 β: "Phishing 최우선"
→ B SimpleWebAuthn을 먼저 (Phase 15 대신 Phase 17을 앞당김). +18점 즉시.
→ 단 UX 마찰 크고 TOTP fallback 없어 비권장.

#### 시나리오 γ: "봇 대응 시급"
→ D hCaptcha를 Phase 15에 추가. +5점.
→ 단 양평 부엌 서버는 봇 위협 낮음 → 우선순위 낮음.

#### 시나리오 δ (현재 권장): "점진 / 전체 채택"
→ A → C → B 순 Phase 15~17. 합계 +45점, 21h.
→ D는 시그널 감지 시 추가.

### 7.4 민감도 분석

| 시나리오 | 가중치 조정 | 순위 영향 |
|---|---|---|
| SECURITY 15% (+5%p) | +0.25~0.25 all | B/A/C 간격 유지. D 약간 상승. |
| SELF_HOST 15% (+10%p) | +0.50 A/B/C/E | D 급락 (0.30 → 0.20). |
| COST 10% (+7%p) | +0.35 all | D 여전 하위. |
| INTEG 5% (-5%p) | -0.25 all | D 격차 축소 (0.4). |

**결론**: 어떤 합리적 가중치에서도 B/A/C가 top 3. D는 SELF_HOST 가중 증가 시 결정적 감점.

---

## 8. 마이그레이션 비용 상세

### 8.1 Phase 15: TOTP (otplib) — 4h

| 작업 | 출처 | 시간 |
|---|---|---|
| Prisma 스키마: totpSecret/Enabled/LastStep + TotpBackupCode | otplib §7.1 | 0.5h |
| otplib + qrcode 설치, `createTotpSetup`/`verifyTotp` 모듈 | otplib §7.3 | 0.5h |
| AES-256-GCM 시크릿 암호화 (totp-crypto.ts) | otplib §6.2 | 0.5h |
| 백업 코드 생성/검증 (backup-codes.ts) | otplib §5 | 0.5h |
| `/mfa/totp/setup` + `/verify-setup` + `/disable` routes | otplib §7.4-5 | 1h |
| 로그인 분기: totpEnabled 시 partial token 발급 | otplib §7.6 | 0.5h |
| `/mfa/challenge` route (TOTP + 백업 코드) | otplib §7.7 | 0.5h |
| **합계** | | **4h** |

**기여 점수**: +12 (15 → 27)

### 8.2 Phase 16: Rate Limit (rate-limiter-flexible) — 6h

| 작업 | 출처 | 시간 |
|---|---|---|
| Prisma `RateLimiterFlexible` 모델 + migration | RL §7.1 | 0.5h |
| `limiters.ts` 인스턴스 정의 (7종) | RL §7.3 | 1h |
| `getClientIp()` (cf-connecting-ip 우선) | RL §5 | 0.5h |
| 계정 락 (lockedUntil/failedLoginCount) | RL §6.3 | 1h |
| 점진 백오프 (violation + backoff 함수) | RL §6.2 | 1h |
| `/login` route에 checkLoginRateLimit + timing attack 방어 | RL §7.5 | 1h |
| 응답 헤더 (Retry-After, X-RateLimit-*) | RL §8.2 | 0.5h |
| 기타 routes 적용 (signup, pwd-reset, mfa/challenge) | RL §6.1 | 0.5h |
| **합계** | | **6h** |

**기여 점수**: +15 (27 → 42)

### 8.3 Phase 17: WebAuthn (SimpleWebAuthn) — 8h

| 작업 | 출처 | 시간 |
|---|---|---|
| Prisma `WebAuthnCredential` + `WebAuthnChallenge` | WebAuthn §8.2 | 1h |
| `webauthn-config.ts` (RP ID 환경변수 검증) | WebAuthn §4.3 | 0.5h |
| `@simplewebauthn/server` + `/browser` 설치 | WebAuthn §2.1 | 0.1h |
| `/register/options` + `/register/verify` routes | WebAuthn §8.3-4 | 1.5h |
| `/auth/options` + `/auth/verify` routes (partial token 통합) | WebAuthn §8.5 | 1.5h |
| 클라이언트: startRegistration / startAuthentication 래퍼 | WebAuthn §8.6 | 1h |
| Conditional UI (autofill) | WebAuthn §부록 C | 0.5h |
| 디바이스 관리 UI (목록/이름변경/삭제) | WebAuthn §부록 D | 1h |
| TOTP/WebAuthn OR 선택 UI (로그인) | WebAuthn §6.3 | 0.5h |
| Challenge cron 정리 | WebAuthn §부록 D | 0.5h |
| **합계** | | **8h** |

**기여 점수**: +18 (42 → 60)

### 8.4 Phase 18 (선택): CAPTCHA (hCaptcha) — 3h

| 작업 | 시간 |
|---|---|
| hCaptcha 계정 발급 + 사이트 등록 | 0.5h |
| 환경변수 (HCAPTCHA_SITE_KEY/SECRET) | 0.1h |
| 로그인 폼에 위젯 통합 | 0.5h |
| `/login` route에 hCaptcha 검증 추가 | 0.5h |
| 실패 fallback 정책 (위젯 로드 실패 시) | 0.5h |
| 조건부 활성화 (rate-limit 임계 초과 시만 표시) | 0.5h |
| 테스트 | 0.4h |
| **합계** | | **3h** |

**기여 점수**: +5 (60 → 65, 선택)

### 8.5 통합 테스트 — 4h

| 작업 | 시간 |
|---|---|
| E2E: 로그인 → TOTP 설정 → 백업 코드 → 재로그인 | 1h |
| E2E: WebAuthn 등록 → 인증 → TOTP fallback | 1h |
| E2E: Rate Limit 임계 → 429 응답 확인 | 0.5h |
| 부하 테스트 (k6): 100 RPS 로그인 시도 | 1h |
| 보안 테스트: replay/counter 검증 | 0.5h |

**합계 Phase 15+16+17+테스트 = 22h / Phase 18 추가 시 25h**

---

## 9. Wave 1 → Wave 2 Traceability

| Wave 1 인용 | Wave 2 반영 | 일관성 |
|---|---|---|
| otplib §11.3 DQ-1.1: 동시 지원 | §7.1 1~3위 모두 채택 | ✅ |
| otplib §11.4: TOTP/WebAuthn 스키마 충돌 없음 | §6.1 공유 인프라 테이블 | ✅ |
| SimpleWebAuthn §12.3: +30 점수 최대 | §3.3 점수표 + §8 Phase 15~17 | ✅ |
| SimpleWebAuthn §12.4: RP ID stylelucky4u.com ✅ | §8.3 Phase 17 webauthn-config | ✅ |
| rate-limiter-flexible §12.3: DQ-1.2 Prisma 어댑터 | §8.2 Phase 16 RL 모델 | ✅ |
| rate-limiter-flexible §12.4: cf-connecting-ip 우선 | §8.2 getClientIp() | ✅ |

---

## 10. 결론

### 10.1 최종 결정

**Full Stack 채택**: otplib + SimpleWebAuthn + rate-limiter-flexible + 자체 refresh rotation. hCaptcha는 조건부(Phase 18).

근거:
1. 상위 3개(B/A/C) 점수 4.52~4.64로 격차 0.12 이내 → 서로 배제 이유 없음
2. 데이터 모델 / 검증 로직 독립 (Wave 1 모두 확인)
3. Phase 15~17로 15→60 (+45점) 21h 투자 가능
4. 모든 민감도 시나리오에서 1~3위 유지
5. Wave 1 3개 deep-dive 결론과 100% 일치

### 10.2 구현 순서

```
현재 15점
  ↓ Phase 15 (TOTP, 4h)
27점
  ↓ Phase 16 (Rate Limit, 6h)
42점
  ↓ Phase 17 (WebAuthn, 8h)
60점
  ↓ Phase 18 (CAPTCHA, 3h, 조건부)
65점
  ↓ Auth Core 통합 (Session/OAuth/Hook, 25h — 별 매트릭스)
100점 목표
```

### 10.3 60 → 100 경로 (Auth Core 통합)

Auth Core 매트릭스 §8 Phase A~F (25h)와 병합 시:
- G1/G2 (Session 무효화 / 디바이스 관리) +5
- G3/G4 (Hook / Claims) +5
- G5/G8 (OAuth Provider / 한국) +10
- G6/G7 (Anonymous / Account linking) +5
- G11 (MFA partial) +2 (이미 Phase 15에서 구현)
- G12 (감사 로그 통합) +4 (Phase 16에서 RL JOIN)
- G13 (Attack detection) +4 (Phase 16 + audit 강화)
- 합계 +35점 → **최종 95~100점**

### 10.4 채용할 핵심 패턴

1. otplib의 AES-256-GCM 시크릿 암호화
2. SimpleWebAuthn의 counter regression 정책 (multiDevice 허용)
3. rate-limiter-flexible의 per-IP + per-email + 점진 백오프 3중 방어
4. MFA partial token (5분 TTL, mfa_pending claim)
5. Timing attack 방어 (dummy bcrypt)
6. cf-connecting-ip 우선 + PM2 127.0.0.1 binding

### 10.5 미해결 DQ

| # | 질문 | 우선 답변 |
|---|---|---|
| DQ-AA-M-1 | WebAuthn 활성 사용자에게 TOTP 강제 비활성화? | 옵션 제공, 사용자 선택 |
| DQ-AA-M-2 | Challenge 저장: Redis vs Prisma 임시 테이블? | Prisma (외부 의존성 0, Wave 1 §8.2) |
| DQ-AA-M-3 | FIDO MDS 통합? | Phase 17 이후 검토 (+2점 보너스) |
| DQ-AA-M-4 | 계정 락 해제: 관리자 수동 + 시간 자동? | 둘 다 지원 (Wave 1 DQ-1.6) |
| DQ-AA-M-5 | 잠긴 계정 이메일 알림? | 권장 (Wave 1 DQ-1.7) |
| DQ-AA-M-6 | Rate limit 응답 표시: 정확한 시간 vs 모호? | 초 단위 표시 + "잠시 후" 병행 (Wave 1 DQ-1.8) |
| DQ-AA-M-7 | CAPTCHA: hCaptcha vs Cloudflare Turnstile? | Turnstile 우선 (이미 CF 사용) |
| DQ-AA-M-8 | JWT refresh rotation: revokedAt 사용 vs family table? | revokedAt + tokenFamily 하이브리드 |

---

## 11. 참고 자료

1. Wave 1 01-otplib-totp-deep-dive.md (자체)
2. Wave 1 02-simplewebauthn-passkey-deep-dive.md (자체)
3. Wave 1 03-rate-limiter-flexible-deep-dive.md (자체)
4. otplib 공식 — https://otplib.yeojz.dev/
5. SimpleWebAuthn 공식 — https://simplewebauthn.dev/docs/packages/server/
6. rate-limiter-flexible — https://github.com/animir/node-rate-limiter-flexible
7. hCaptcha docs — https://docs.hcaptcha.com/
8. Cloudflare Turnstile — https://developers.cloudflare.com/turnstile/
9. RFC 6238 (TOTP) — https://datatracker.ietf.org/doc/html/rfc6238
10. RFC 4226 (HOTP) — https://datatracker.ietf.org/doc/html/rfc4226
11. W3C WebAuthn L3 — https://www.w3.org/TR/webauthn-3/
12. FIDO Alliance — https://fidoalliance.org/
13. OWASP Authentication Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
14. OWASP MFA Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
15. NIST 800-63B MFA — https://pages.nist.gov/800-63-3/sp800-63b.html
16. RFC 6585 (HTTP 429) — https://www.rfc-editor.org/rfc/rfc6585
17. Cloudflare cf-connecting-ip — https://developers.cloudflare.com/fundamentals/reference/http-headers/
18. Snyk DB (otplib/SimpleWebAuthn/RL) — https://security.snyk.io/
19. _SUPABASE_TECH_MAP.md (자체)
20. _PROJECT_VS_SUPABASE_GAP.md (자체)

---

## 12. 부록 A: Phase별 Prisma 마이그레이션 요약

```sql
-- Phase 15 (TOTP)
ALTER TABLE "users" ADD COLUMN "totp_secret" TEXT,
                    ADD COLUMN "totp_enabled_at" TIMESTAMP(3),
                    ADD COLUMN "totp_last_used_step" INTEGER;
CREATE TABLE "totp_backup_codes" (...);

-- Phase 16 (Rate Limit)
CREATE TABLE "rate_limiter_flexible" (key TEXT PK, points INTEGER, expire BIGINT);
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMP(3),
                    ADD COLUMN "failed_login_count" INTEGER DEFAULT 0;

-- Phase 17 (WebAuthn)
CREATE TABLE "webauthn_credentials" (...);
CREATE TABLE "webauthn_challenges" (...);
```

## 13. 부록 B: 환경변수 추가 목록

```env
# Phase 15
TOTP_KEK_HEX=64자_hex  # openssl rand -hex 32

# Phase 16
ADMIN_IP_WHITELIST=1.2.3.4,5.6.7.8

# Phase 17
WEBAUTHN_RP_ID=stylelucky4u.com
WEBAUTHN_ORIGIN=https://stylelucky4u.com
WEBAUTHN_RP_NAME=양평 부엌 서버 대시보드

# Phase 18 (선택)
HCAPTCHA_SITE_KEY=...
HCAPTCHA_SECRET=...
# 또는
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET=...
```

## 14. 부록 C: 구현 체크리스트

- [ ] Phase 15 완료 (TOTP + 백업 코드 + 암호화)
- [ ] Phase 16 완료 (Rate Limit + 계정 락 + 점진 백오프)
- [ ] Phase 17 완료 (WebAuthn + Conditional UI + 디바이스 관리)
- [ ] Phase 18 (선택) 완료 (CAPTCHA)
- [ ] 통합 `/mfa/challenge` endpoint (TOTP/WebAuthn/backup OR)
- [ ] 감사 로그에 모든 MFA/RL 이벤트 기록
- [ ] 환경변수 production/development 분리
- [ ] 관리자 MFA reset + 계정 unlock UI
- [ ] E2E 테스트 (Playwright)
- [ ] 부하 테스트 (k6)
- [ ] 문서: `docs/guides/mfa-operations.md`
- [ ] ADR 작성: "ADR-0XX: Auth Advanced Full Stack 채택"

---

(문서 끝 — Auth Advanced 매트릭스 Wave 2)
