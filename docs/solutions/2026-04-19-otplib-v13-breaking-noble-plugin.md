---
title: "otplib v13 major breaking — authenticator singleton 제거 + Noble crypto plugin 의무화"
date: 2026-04-19
session: 33
tags: [otplib, mfa, totp, breaking-change, dependency-pin, noble-crypto]
category: bug-fix
confidence: high
---

## 문제

Phase 15 Step 4 (TOTP MFA) 구현 중 `npm install otplib qrcode` 를 실행했더니 v13.4.0 이 설치되었고, `src/lib/mfa/totp.ts` 빌드/실행이 전부 실패.

**증상** (v13 설치 상태에서):
```ts
import { authenticator } from "otplib";
// ❌ Module '"otplib"' has no exported member 'authenticator'.

// v13 은 함수형 export 로 강제 전환
import { generate, verify } from "otplib";
const code = await generate(secret); // ❌ Promise 반환 — 기존 동기 API 호출부 전부 깨짐
```

추가 증상:
- `authenticator.options = {...}` 형태의 글로벌 옵션 설정 API 부재 — 매 호출마다 옵션 인자 전달 필요
- `@noble/hashes` / `@scure/base32` crypto plugin 을 명시적으로 등록해야 생성/검증 동작
- plugin 미등록 시 런타임에서 `No SHA-1 implementation registered` 류 에러
- Blueprint §7.2 (Auth Advanced) 가 지정한 `otplib@12.x` 사양과 정면 충돌

## 원인

**핵심**: otplib v13 은 v12 와 완전 비호환한 major breaking. API 구조·의존성·호출 모델 3축이 동시에 바뀜.

| 축 | v12 (이 프로젝트 기준) | v13 (breaking) |
|---|---|---|
| 엔트리 API | `authenticator` singleton (`.generateSecret/.check/.keyuri/.options`) | 함수형 export (`generate`/`verify`/`keyuri`) |
| 호출 모델 | 동기 boolean/string | Promise 반환 (await 필수) |
| Crypto 공급 | 내부 `crypto` 모듈 자동 | `@noble/hashes` + `@scure/base32` plugin 등록 의무 |
| 옵션 전파 | 글로벌 `authenticator.options` | 매 호출 인자 |
| `HashAlgorithms` | `@otplib/core` 서브경로 | 재조직됨 |

프로젝트는 Blueprint `otplib@12.x` 사양을 따르도록 설계되었고, 세션 4B TOTP wrapper (`totp.ts`) 는 `authenticator` 싱글톤 기반 동기 API 가정으로 작성. v13 로 설치되면 **import 단계에서 타입 에러**, 운 좋게 adaptation 해도 **모든 호출부를 async 화**해야 하고, **Noble plugin 등록 설정**이 신규 필요.

더 치명적인 것은 **기존 TOTP secret 호환성**: v12 와 v13 은 base32 디코딩 구현이 다를 수 있고, plugin 조합 변경 시 동일 secret 에서 다른 OTP 가 생성될 수 있음. 이미 등록된 사용자 MFA enrollment 가 전량 무효화될 위험.

## 해결

**원칙**: v12 고정. v13 adaptation 은 MFA 사용자가 존재하는 한 **시도 금지**.

### 1) `package.json` 핀 고정

```json
{
  "dependencies": {
    "otplib": "^12.0.1",
    "qrcode": "^1.5.4",
    "@types/qrcode": "^1.5.6"
  }
}
```

`^12.0.1` — minor/patch 는 허용, major 12→13 점프 차단. `npm install otplib` 대신 명시적 `npm install otplib@^12.0.1` 로 재설치 후 `package-lock.json` 확인.

### 2) v12 호출 패턴 (실제 `src/lib/mfa/totp.ts`)

```ts
import { authenticator } from "otplib";
import { HashAlgorithms } from "@otplib/core";
// ↑ v12 에서 HashAlgorithms 는 서브패키지 경로. "otplib" 루트에는 없음.

// RFC 6238 표준 (30초 타임스텝, SHA-1, 6자리).
authenticator.options = {
  step: 30,
  window: 1,        // 직전·직후 1 step 허용 (총 3 step = 90초) — 시계 드리프트 관용
  digits: 6,
  algorithm: HashAlgorithms.SHA1,
};

export function generateTotpSecret(): string {
  return authenticator.generateSecret();   // 동기, base32 문자열
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, TOTP_ISSUER, secret);
}

export function verifyTotpCode(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.check(token, secret);   // 동기 boolean, timing-safe 내부 구현
  } catch {
    return false;
  }
}
```

### 3) 검증

- `npm ls otplib` → `otplib@12.0.1` 고정 확인
- `src/lib/mfa/totp.test.ts` 13 PASS (TOTP + recovery + AES + safeEqualHash)
- E2E: enroll → confirm → mfaRequired login → TOTP 검증 round-trip 성공

## 재발 방지

### 1) 업그레이드 금지 트리거

`npm outdated` 또는 dependabot 이 `otplib 12 → 13` 제안하더라도 **즉시 거부**. 이유 주석을 `package.json` 인근이나 본 CK 에 인용.

### 2) 메이저 업그레이드 필요 시 마이그레이션 플랜

가상으로 v13 전환해야 한다면 최소 다음을 준비:

1. **secret 호환성 검증** — 기존 base32 secret 으로 v12 와 v13 이 같은 OTP 생성하는지 샘플 100건 비교 테스트
2. **Noble plugin 등록 전역 초기화** — 앱 boot 시 1회 `@noble/hashes`/`@scure/base32` 주입
3. **호출부 async 전환** — `verifyTotpCode` 를 `async` + 호출부 `await` 일괄 수정
4. **옵션 전파 재설계** — `authenticator.options` 글로벌 대신 매 호출 options 객체 전달
5. **`MFA_MASTER_KEY` 재암호화 여부 판단** — secret 자체는 평문 아니고 AES-GCM 암호화 저장이므로 복호화→재생성→재암호화 파이프라인 필요한지 검토

v13 전환 작업은 **MFA 사용자 0명 상태**가 아니라면 정당화 어려움. Noble 의 crypto 현대화 이익은 서버 사이드 TOTP 에서 실질적 우위 없음.

### 3) 패키지 선택 시 체크리스트 (일반화)

인증·암호화 관련 라이브러리 신규 도입 시:

1. **major 버전 안정성** — 최근 2년 내 major bump 여부, breaking changelog 분량
2. **API 스타일 일관성** — 동기/비동기, 싱글톤/함수형 전환 이력
3. **crypto 공급 방식** — 내부 crypto 모듈 vs 외부 plugin 의존
4. **영속 데이터 호환성** — secret/token 형식 변경 여부 (가장 치명적)

## 관련 구조

- `src/lib/mfa/totp.ts` — v12 API 기반 wrapper 전체
- `src/lib/mfa/totp.test.ts` — 13 PASS (secret 생성 / check window / recovery code / AES / safeEqualHash)
- `package.json` — `otplib@^12.0.1` 핀
- `docs/handover/260419-session33-phase15-step3-4-5.md` §4B — v13 발견 → v12 다운그레이드 의사결정
- `docs/handover/next-dev-prompt.md:154` — "otplib v13 금지" 주의사항
- Blueprint Phase 15 Auth Advanced §7.2 (TOTP) — `otplib@12.x` 사양 명시
- `src/lib/mfa/crypto.ts` — `MFA_MASTER_KEY` AES-256-GCM 암호화 계층 (secret 영속)

## 관련 솔루션

- `2026-04-19-simplewebauthn-v10-api-shape.md` (같은 세션 MFA 구현 중 발견한 두 번째 라이브러리 API shape 함정)
