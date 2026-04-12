---
source: supabase-dashboard-scrape
captured: 2026-04-12
module: authentication
---

# 05. Authentication

상위: [\_index.md](./_index.md) → **여기**

## 스크랩 원문

```
Authentication
Manage
Users
OAuth Apps
Notifications
Email
Configuration
Policies
Sign In / Providers
OAuth Server
Beta
Sessions
Rate Limits
Multi-Factor
URL Configuration
Attack Protection
Auth Hooks
Beta
Audit Logs
Performance
Users

Email address
Search by email
All columns

Sorted by user ID

Add user
```

## 드러난 UI / 기능 목록

- **Manage**:
  - Users — 사용자 목록/검색/추가
  - OAuth Apps — Supabase를 OAuth 공급자로 사용하는 앱 등록
  - Notifications — 이메일 알림 템플릿/채널
  - Email — 이메일 전송 설정(SMTP/Resend)
- **Configuration**:
  - Policies — 사용자 생성/로그인 정책
  - Sign In / Providers — 이메일/Google/GitHub/Apple 등 공급자
  - OAuth Server (Beta) — 다른 앱이 Supabase로 로그인하도록 허용
  - Sessions — 세션 TTL/리프레시 정책
  - Rate Limits — 로그인/가입 시도 제한
  - Multi-Factor — TOTP/SMS MFA
  - URL Configuration — redirect allowlist, site URL
  - Attack Protection — captcha / email throttling
  - Auth Hooks (Beta) — 가입/로그인 이벤트 webhook
- **Audit Logs** — 인증 관련 감사 로그
- **Performance** — 인증 서비스 메트릭
- 사용자 테이블: Email, Search by email, All columns 필터, Sorted by user ID, Add user 버튼

## 추론되는 기술 스택

- **GoTrue** (`supabase/auth`, Go) — JWT 기반 Auth 서버
- **OAuth Apps 공급자 통합**: Passport/OAuth2 표준
- **OAuth Server (자체 IdP)**: `ory/hydra` 유사 기능
- **Sessions**: refresh token rotation + JWT access token
- **MFA**: `otplib` + backup codes
- **Attack Protection**: reCAPTCHA/hCaptcha + IP-based rate limit(Redis)
- **Rate Limits**: sliding window counter(Redis) per-endpoint
- **Auth Hooks**: pre/post signup/signin webhook 호출
- **Email 전송**: SMTP + Resend/Postmark 등 공급자 추상화
- **Audit Logs**: Auth 이벤트(signup/signin/signout/pwd-reset) → 전용 컬렉션
- **이 프로젝트와의 차이**: 현재 자체 JWT(`jose`) + bcrypt + DB User 모델로 **직접 구현** 완료. MFA/Attack Protection/Auth Hooks가 미구현.
