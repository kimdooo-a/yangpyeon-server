# Auth 관리 UI 진화 방안

> Wave 2+3 리서치 문서 · 작성일: 2026-04-06
> 상위: [platform-evolution-wave README](../README.md)

---

## 목차

1. [현재 상태 분석](#1-현재-상태-분석)
2. [진화 단계 로드맵](#2-진화-단계-로드맵)
3. [Auth 관리 UI 설계](#3-auth-관리-ui-설계)
4. [구현 기술 선택](#4-구현-기술-선택)
5. [보안 고려사항](#5-보안-고려사항)
6. [마이그레이션 전략](#6-마이그레이션-전략)
7. [결론 및 권장 사항](#7-결론-및-권장-사항)

---

## 1. 현재 상태 분석

### 1-1. 인증 아키텍처 현황

현재 이 대시보드의 인증 시스템은 다음 구조로 동작한다.

```
사용자 → /login 페이지 → POST /api/auth/login
                              ↓
                   환경변수 비밀번호 비교 (DASHBOARD_PASSWORD)
                              ↓
                   성공 시 JWT 생성 (jose, HS256)
                              ↓
                   쿠키 설정 (dashboard_session, httpOnly, sameSite: lax)
                              ↓
                   middleware.ts 에서 모든 요청 검증
```

**핵심 파일:**
- `src/lib/auth.ts` — 세션 생성/검증, 비밀번호 비교
- `src/app/api/auth/login/route.ts` — 로그인 API, 브루트포스 방지
- `src/middleware.ts` — JWT 검증 + Rate Limiting + 감사 로그

### 1-2. 현재 구현의 장점

| 항목 | 상태 | 설명 |
|------|------|------|
| JWT 기반 세션 | ✅ 구현됨 | `jose` 라이브러리, HS256 알고리즘 |
| httpOnly 쿠키 | ✅ 구현됨 | XSS 방지 |
| 타이밍 공격 방지 | ✅ 구현됨 | 고정 시간 문자 비교 |
| IP 기반 브루트포스 방지 | ✅ 구현됨 | 5회 실패 → 5분 잠금 |
| Rate Limiting | ✅ 구현됨 | 미들웨어 레벨 |
| CSRF 방지 | ✅ 구현됨 | Referer 검증 |
| 감사 로그 | ✅ 구현됨 | 인메모리 (재시작 시 초기화) |

### 1-3. 현재 구현의 한계

```
한계 1: 단일 사용자
  - 환경변수 DASHBOARD_PASSWORD 하나만 존재
  - 여러 사람이 같은 비밀번호를 공유해야 함
  - 특정 사용자만 차단하거나 권한을 줄이는 것이 불가능

한계 2: 세션 관리 부재
  - 현재 로그인된 세션 목록 확인 불가
  - 특정 세션만 강제 로그아웃 불가
  - 동시 로그인 세션 수 제한 없음
  - JWT는 상태가 없어 발급 후 취소(revoke)가 불가능

한계 3: 사용자 관리 UI 없음
  - 비밀번호 변경: 환경변수 직접 수정 + PM2 재시작 필요
  - 접근 이력 확인 불가 (감사 로그는 있지만 UI 없음)
  - 역할/권한 구분 없음

한계 4: 감사 로그 휘발성
  - 현재 인메모리 Map 구조 (writeAuditLog)
  - PM2 재시작 시 모든 로그 삭제
  - 장기 이력 분석 불가

한계 5: 비밀번호 정책 없음
  - 비밀번호 복잡도/길이 강제 없음
  - 만료 정책 없음
  - 이전 비밀번호 재사용 방지 없음
```

### 1-4. Supabase Auth와의 비교

Supabase Auth는 다음 기능을 기본 제공한다:

```
Supabase Auth 기능 목록:
├── 사용자 테이블 (auth.users) — UUID, email, created_at, last_sign_in_at
├── 세션 관리 — access_token + refresh_token, 만료 처리
├── 사용자 관리 UI — 목록, 상세, 비활성화, 삭제
├── 이메일/소셜/전화 로그인 다중 지원
├── MFA (다중 인증)
├── 행 수준 보안 (RLS)
├── 비밀번호 정책 설정
└── 웹훅 (사용자 이벤트)
```

우리 대시보드는 이 중 극히 일부만 구현돼 있다. 아래에서 1인 프로젝트에 맞는 진화 경로를 단계별로 설계한다.

---

## 2. 진화 단계 로드맵

### Level 0 (현재)
```
인증 방식: 환경변수 비밀번호 1개
사용자 수: 1명 (공유 비밀번호)
세션 관리: 없음 (JWT 발급 후 만료까지 유효)
UI: 없음
DB: 없음
공수: 0 (이미 완료)
```

### Level 1 — DB 기반 사용자 + bcrypt (MVP)

**목표:** 비밀번호를 환경변수에서 DB로 이동. 동적 변경 가능.

**추가할 것:**
- SQLite (better-sqlite3) 또는 JSON 파일 기반 사용자 저장소
- bcrypt 해싱 (10 rounds)
- 비밀번호 변경 API (`POST /api/auth/change-password`)
- 초기 사용자 시드 스크립트

```typescript
// 사용자 테이블 스키마 (SQLite)
CREATE TABLE users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username    TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'admin',  -- admin | viewer
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- 초기 admin 계정 삽입 (시드 스크립트에서)
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2b$10$...', 'admin');
```

**구현 공수:** 약 4~6시간 (1인 기준)
- `better-sqlite3` 설치, DB 초기화 스크립트
- `bcrypt` 또는 `bcryptjs` 설치
- `/api/auth/login` 수정 (환경변수 → DB 조회)
- 비밀번호 변경 API + 간단한 UI

**마이그레이션 경로:**
```bash
# 현재 환경변수에서 초기 해시 생성
node -e "const bcrypt = require('bcryptjs'); 
  bcrypt.hash(process.env.DASHBOARD_PASSWORD, 10).then(h => console.log(h))"
```

### Level 2 — 다중 사용자 + 역할 관리 + 비밀번호 변경 UI

**목표:** Supabase Auth Users 테이블 수준의 사용자 관리.

**추가할 것:**
- 사용자 목록 페이지 (`/settings/users`)
- 사용자 생성/편집/비활성화 UI
- 역할 기반 접근 제어 (RBAC)
  - `admin`: 모든 기능 + 사용자 관리
  - `viewer`: 조회만 가능, PM2 제어 불가
- JWT 페이로드에 역할 포함
- 미들웨어에서 역할 검증

```typescript
// JWT 페이로드 확장
interface SessionPayload {
  userId: string;
  username: string;
  role: 'admin' | 'viewer';
  iat: number;
  exp: number;
}

// 미들웨어 역할 검증 예시
const payload = await jwtVerify(token, secret);
const role = payload.payload.role as string;

// PM2 제어는 admin만
if (pathname.match(/^\/api\/pm2\/\w+$/) && method === 'POST') {
  if (role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
}
```

**역할별 접근 권한 매트릭스:**

| 기능 | admin | viewer |
|------|-------|--------|
| 대시보드 조회 | ✅ | ✅ |
| 로그 조회 | ✅ | ✅ |
| 네트워크 조회 | ✅ | ✅ |
| PM2 프로세스 조회 | ✅ | ✅ |
| PM2 제어 (시작/중지/재시작) | ✅ | ❌ |
| 사용자 관리 | ✅ | ❌ |
| 시스템 설정 | ✅ | ❌ |
| 감사 로그 조회 | ✅ | ❌ |

**구현 공수:** 약 8~12시간

### Level 3 — 세션 목록/무효화 + 로그인 이력 + IP 제어

**목표:** 엔터프라이즈 수준의 세션 가시성.

**추가할 것:**
- 세션 테이블 (DB 기반)
- 활성 세션 목록 UI (장치, IP, 마지막 활동)
- 특정 세션 강제 만료
- 로그인 이력 테이블 (성공/실패, IP, 타임스탬프, User Agent)
- IP 허용/차단 목록 관리

```typescript
// 세션 테이블
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  last_active  DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address   TEXT,
  user_agent   TEXT,
  is_revoked   INTEGER NOT NULL DEFAULT 0
);

// 로그인 이력 테이블
CREATE TABLE login_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT REFERENCES users(id),
  username   TEXT NOT NULL,  -- 실패 시 users에 없을 수 있으므로 별도 저장
  ip_address TEXT,
  user_agent TEXT,
  success    INTEGER NOT NULL,
  reason     TEXT,  -- '비밀번호 오류', '계정 잠김' 등
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**세션 무효화 구현:**
현재 JWT는 상태가 없어 취소가 불가능하다. Level 3에서는 **토큰 블랙리스트** 또는 **세션 ID 기반** 방식으로 전환해야 한다.

```
방법 A — 토큰 블랙리스트 (단순)
  JWT에 jti(JWT ID) 포함 → 로그아웃/강제만료 시 블랙리스트 테이블에 추가
  미들웨어에서 jti DB 조회 → 블랙리스트 항목이면 거부
  단점: 요청마다 DB 조회 발생

방법 B — 세션 ID 기반 (권장)
  JWT 대신 opaque 세션 토큰 (랜덤 32바이트 hex) 사용
  sessions 테이블에 저장
  미들웨어에서 세션 ID로 DB 조회 (is_revoked 확인)
  장점: 즉시 무효화 가능, 세션 메타데이터 풍부
  단점: 모든 요청마다 DB 읽기 (캐시로 완화 가능)
```

**구현 공수:** 약 12~16시간

### Level 4 — OAuth/소셜 로그인, 2FA (선택적)

**이 프로젝트에 필요한가?**

솔직히 말하면 **필요 없다**. 이유:

1. **사용자 규모**: 1~3명 내외의 서버 관리자만 사용
2. **네트워크 환경**: Cloudflare Tunnel 뒤에 있어 이미 외부 접근이 제한됨
3. **셀프호스팅**: OAuth 제공자 연동은 콜백 URL, 앱 등록 등 추가 복잡도 상당
4. **개발 비용**: OAuth + 2FA 구현은 Level 1~3 전체보다 공수가 더 큼

**예외 시나리오 (이럴 때는 고려):**
- 팀 규모가 5명 이상으로 늘어날 때
- 감사 요건 상 개인별 계정이 반드시 필요할 때
- Google Workspace 등 기존 SSO 인프라가 있을 때

**2FA의 경우:**
- TOTP(Google Authenticator 방식)는 `speakeasy` 또는 `otpauth` 라이브러리로 구현 가능
- 하지만 서버 대시보드 특성상 IP 화이트리스팅이 더 실용적

**결론:** Level 3까지가 이 프로젝트의 합리적인 상한선.

---

## 3. Auth 관리 UI 설계

### 3-1. 사용자 목록 페이지 (`/settings/users`)

Supabase Auth의 Users 탭을 참고한 레이아웃:

```
┌─────────────────────────────────────────────────────────┐
│  사용자 관리                          [+ 사용자 추가]   │
├─────────────────────────────────────────────────────────┤
│  [검색창...]              [역할 필터 ▼] [상태 필터 ▼]  │
├───────────┬────────────┬─────────┬──────────┬──────────┤
│  사용자명  │   역할     │  상태   │ 마지막 로그인│  액션  │
├───────────┼────────────┼─────────┼──────────┼──────────┤
│  admin    │ ● 관리자   │ ● 활성  │ 2분 전   │ [편집] ⋮ │
│  viewer1  │ ○ 뷰어     │ ● 활성  │ 3일 전   │ [편집] ⋮ │
│  old-user │ ○ 뷰어     │ ○ 비활성│ 30일 전  │ [편집] ⋮ │
└───────────┴────────────┴─────────┴──────────┴──────────┘
│  총 3명                                      1 / 1 페이지│
└─────────────────────────────────────────────────────────┘
```

**컴포넌트 분해:**
```
/settings/users/page.tsx          ← 페이지 조합
├── UserTable.tsx                 ← 사용자 목록 테이블
├── UserTableRow.tsx              ← 행 컴포넌트
├── UserEditSlideOver.tsx         ← 편집 패널 (오른쪽 슬라이드)
├── CreateUserModal.tsx           ← 생성 모달
├── UserRoleBadge.tsx             ← 역할 배지 (admin/viewer)
└── UserStatusBadge.tsx           ← 상태 배지 (활성/비활성)
```

### 3-2. 사용자 편집 슬라이드오버

```
┌──────────────────────────────────────┐
│ ← 사용자 편집            [×] 닫기   │
├──────────────────────────────────────┤
│                                      │
│  사용자명                            │
│  ┌──────────────────────────────┐   │
│  │ admin                        │   │
│  └──────────────────────────────┘   │
│                                      │
│  역할                                │
│  ◉ 관리자  ○ 뷰어                  │
│                                      │
│  상태                                │
│  ◉ 활성    ○ 비활성                 │
│                                      │
│  ──────────────────────────────────  │
│  비밀번호 변경                       │
│  ┌──────────────────────────────┐   │
│  │ 새 비밀번호                  │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │ 비밀번호 확인                │   │
│  └──────────────────────────────┘   │
│                                      │
│  ──────────────────────────────────  │
│  [저장]                  [삭제] ⚠️  │
└──────────────────────────────────────┘
```

### 3-3. 로그인 이력 페이지 (`/settings/login-history`)

```
┌─────────────────────────────────────────────────────────┐
│  로그인 이력                      [CSV 내보내기]        │
├─────────────────────────────────────────────────────────┤
│  [사용자 필터 ▼]  [결과 필터 ▼: 성공/실패]  [날짜 범위]│
├─────────┬───────────┬────────────────┬────────┬────────┤
│  시각   │  사용자명  │    IP 주소     │ User Agent│ 결과 │
├─────────┼───────────┼────────────────┼────────┼────────┤
│ 2분 전  │  admin    │ 192.168.1.100  │ Chrome │ ✅ 성공│
│ 10분 전 │  unknown  │ 1.2.3.4        │ curl   │ ❌ 실패│
│ 1시간 전│  admin    │ 192.168.1.100  │ Chrome │ ✅ 성공│
└─────────┴───────────┴────────────────┴────────┴────────┘
```

### 3-4. 활성 세션 관리 (`/settings/sessions`)

Level 3 구현 후 추가:

```
┌─────────────────────────────────────────────────────────┐
│  활성 세션                    [모든 세션 종료]          │
├─────────┬─────────────┬──────────────┬──────────────────┤
│  세션   │  마지막 활동 │    IP 주소   │       액션       │
├─────────┼─────────────┼──────────────┼──────────────────┤
│ 현재 ● │ 방금 전     │ 192.168.1.100│ [현재 세션]      │
│         │ 2시간 전    │ 192.168.1.101│ [강제 종료]      │
└─────────┴─────────────┴──────────────┴──────────────────┘
```

### 3-5. 설정 페이지 네비게이션

현재 사이드바에 없는 `/settings` 섹션 추가:

```
사이드바
├── 대시보드 /
├── 프로세스 /processes
├── 로그 /logs
├── 네트워크 /network
└── ── 설정 ──
    ├── 사용자 관리 /settings/users       (Level 2+)
    ├── 로그인 이력 /settings/login-history (Level 3+)
    ├── 활성 세션 /settings/sessions      (Level 3+)
    └── 시스템 설정 /settings/system      (향후)
```

---

## 4. 구현 기술 선택

### 4-1. 주요 옵션 비교

#### 옵션 A — NextAuth.js v5 (Auth.js)

```
장점:
- Next.js 공식 파트너 라이브러리
- OAuth/Credentials/Email 다양한 Provider 지원
- 세션 관리, JWT, DB 어댑터 내장
- 문서 풍부, 커뮤니티 활성

단점:
- 이 프로젝트에 비해 오버스펙
- Credentials Provider는 기능이 제한적 (리프레시 토큰 없음)
- DB 어댑터 연동 학습 곡선
- v4 → v5 브레이킹 체인지 이력

1인 프로젝트 적합도: ★★★☆☆
```

#### 옵션 B — Lucia Auth

```
장점:
- 경량, 타입 안전
- 세션 기반 (JWT 아님) → 즉시 무효화 가능
- DB 어댑터: SQLite, PostgreSQL, MySQL 지원
- 최소한의 추상화 (코드가 이해하기 쉬움)

단점:
- v3에서 아카이브됨 (2024년 말 유지보수 종료 선언)
- 커뮤니티 축소 중

1인 프로젝트 적합도: ★★☆☆☆ (아카이브로 비추천)
```

#### 옵션 C — 직접 구현 (현재 방향의 연장)

```
장점:
- 현재 코드베이스와 완벽히 일치
- 불필요한 추상화 없음
- 100% 제어권
- 추가 의존성 최소
- 학습 비용 없음 (이미 작동 중인 JWT 코드 존재)

단점:
- 보안 버그 책임이 직접 개발자에게
- 기능 구현 공수가 라이브러리 대비 높음
- OAuth 등 고급 기능 확장 어려움

1인 프로젝트 적합도: ★★★★★ (권장)
```

#### 옵션 D — better-auth

```
장점:
- 2024-2025년 등장한 신흥 라이브러리
- TypeScript 퍼스트, Next.js App Router 지원
- 플러그인 방식 (필요한 것만 추가)
- SQLite 포함 여러 DB 어댑터

단점:
- 아직 성숙도가 낮음 (v1.x)
- 커뮤니티/문서 미성숙
- 프로덕션 안정성 미검증

1인 프로젝트 적합도: ★★★☆☆ (고려 가능)
```

### 4-2. JWT vs 세션 기반 비교

```
JWT (현재):
  장점: 무상태, 수평 확장, DB 조회 없음
  단점: 즉시 취소 불가, 페이로드 크기 제한
  적합: 마이크로서비스, 다중 서버

세션 기반 (DB):
  장점: 즉시 취소, 세션 메타데이터 풍부, 단순
  단점: DB 조회 필요, 단일 서버에 묶임
  적합: 서버 대시보드처럼 단일 서버 앱

이 프로젝트 판단:
  → 단일 서버(WSL2), 1인 운영, 세션 가시성이 중요
  → 세션 기반이 더 적합 (Level 2 이상에서 전환 권장)
```

### 4-3. DB 선택

```
SQLite (better-sqlite3) — 권장:
  - 서버에 추가 프로세스 불필요
  - 파일 하나로 백업 가능
  - 동시 쓰기는 낮지만 대시보드 트래픽에 충분
  - Next.js App Router와 동기 API로 사용 가능

JSON 파일:
  - 극히 단순하지만 동시성 문제 위험
  - Level 1 임시 방편으로만 사용

PostgreSQL/MySQL:
  - 대시보드 규모에 과도함
  - 추가 서비스 실행 필요
```

### 4-4. 최종 권장 선택

```
Level 1: 직접 구현 + better-sqlite3 + bcryptjs
Level 2: Level 1 확장, JWT 페이로드에 role 추가
Level 3: JWT → 세션 기반(DB) 전환 + 세션 테이블
Level 4: 필요 시 better-auth 또는 NextAuth 도입 고려
```

---

## 5. 보안 고려사항

### 5-1. 비밀번호 저장

```typescript
// 잘못된 방법 (현재 환경변수 방식의 한계)
// DASHBOARD_PASSWORD=plaintext  ← 환경변수에 평문 저장

// 올바른 방법 (Level 1+)
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12; // 12가 현재 권장 최솟값 (2025 기준)

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

**Salt Rounds 선택 기준 (2025년):**
- 10 rounds: 약 65ms (이전 권장)
- 12 rounds: 약 250ms (현재 권장)
- 14 rounds: 약 1초 (고보안)
- 서버 대시보드: 12 rounds 적절 (로그인은 빈번하지 않음)

### 5-2. CSRF 방지

현재 미들웨어의 Referer 검증을 유지하되, Level 2+에서 Double Submit Cookie 패턴 추가:

```typescript
// CSRF 토큰 생성 (서버사이드)
import { randomBytes } from 'crypto';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

// 로그인 페이지 렌더링 시 CSRF 토큰을 hidden input에 포함
// POST 요청 시 쿠키의 CSRF 토큰과 폼의 CSRF 토큰 비교
```

### 5-3. 세션 탈취 방지

```
방어 층위:
1. httpOnly 쿠키 → JavaScript XSS로 토큰 탈취 불가
2. Secure 플래그 → HTTPS에서만 전송 (프로덕션)
3. SameSite: lax → CSRF 기본 방어
4. 세션 고정 공격 방지: 로그인 성공 시 새 세션 ID 발급
5. User Agent 바인딩 (선택): 세션 생성 시 UA 저장, 요청마다 비교
6. IP 바인딩 (선택): 주의 — CGNAT, 모바일 환경에서 IP 변경 빈번

세션 고정 공격 방지 예시:
// 로그인 전 세션이 있으면 반드시 새 세션으로 교체
const oldSession = req.cookies.get('dashboard_session');
if (oldSession) {
  // 구 세션 무효화
  await revokeSession(oldSession.value);
}
// 새 세션 발급
const newToken = await createSession(userId);
```

### 5-4. 비밀번호 정책

Level 2에서 추가할 정책:

```typescript
interface PasswordPolicy {
  minLength: 12;         // 최소 12자 (NIST SP 800-63B 2024 개정판 권장)
  maxLength: 128;        // 최대 128자 (bcrypt 72자 제한 주의)
  requireUppercase: false; // NIST: 복잡도 규칙보다 길이가 중요
  requireNumber: false;    // 과도한 복잡도 규칙은 패턴 예측 유발
  requireSpecial: false;
  prohibitCommon: true;    // HaveIBeenPwned API 또는 로컬 단어 목록
  prohibitUsername: true;  // 사용자명과 동일한 비밀번호 금지
}

// bcrypt는 72바이트 이상을 무시하므로 반드시 사전 제한
function validatePasswordLength(password: string): boolean {
  const bytes = Buffer.byteLength(password, 'utf8');
  return bytes >= 12 && bytes <= 72;
}
```

### 5-5. SQL 인젝션 방지

```typescript
// SQLite 사용 시 반드시 매개변수화 쿼리
const db = require('better-sqlite3')('./data/dashboard.db');

// 잘못된 방법
const user = db.prepare(`SELECT * FROM users WHERE username = '${username}'`).get();

// 올바른 방법
const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
```

### 5-6. IP 기반 접근 제어 (Level 3)

```typescript
// 허용 IP 목록 (CIDR 지원)
const ALLOWED_IPS = [
  '127.0.0.1',
  '::1',
  '192.168.0.0/24',   // 로컬 네트워크
  '10.0.0.0/8',       // 사설 네트워크
];

// 미들웨어에서 IP 검증
function isIpAllowed(ip: string): boolean {
  return ALLOWED_IPS.some(allowed => {
    if (allowed.includes('/')) {
      return isInCidrRange(ip, allowed); // 별도 유틸 필요
    }
    return ip === allowed;
  });
}
```

---

## 6. 마이그레이션 전략

### 6-1. 현재 → Level 1 마이그레이션

**무중단 전환 절차:**

```
Step 1: SQLite DB 초기화
  - npm install better-sqlite3 bcryptjs
  - scripts/init-db.ts 작성
  - npx tsx scripts/init-db.ts 실행 (현재 비밀번호 해싱 후 삽입)

Step 2: 새 auth 로직 작성 (기존 유지)
  - src/lib/auth-v2.ts 신규 작성
  - 기존 src/lib/auth.ts 유지

Step 3: API 라우트 전환
  - /api/auth/login: env 비교 → DB 조회로 교체
  - 테스트 후 기존 DASHBOARD_PASSWORD 환경변수 제거

Step 4: 검증
  - 로그인 테스트
  - 비밀번호 변경 테스트
  - PM2 재시작 후 로그인 유지 확인
```

### 6-2. Level 1 → Level 2 마이그레이션

```
- users 테이블에 role 컬럼 추가 (already in schema)
- JWT 페이로드 업데이트 (userId, role 추가)
- 미들웨어 역할 검증 로직 추가
- /settings/users 페이지 신규 구현
- 기존 단일 admin 계정에 역할 할당
```

### 6-3. Level 2 → Level 3 마이그레이션 (JWT → 세션 기반)

이 전환은 가장 큰 변경이므로 신중하게 진행:

```
변경 범위:
- src/lib/auth.ts: createSession → generateSessionToken + DB 저장
- src/middleware.ts: jwtVerify → DB 세션 조회
- /api/auth/logout: 쿠키 삭제 + DB 세션 삭제
- DB: sessions 테이블 추가

롤백 계획:
- Git 브랜치로 분리 개발
- 이전 JWT 코드 보존 (feature 플래그 방식)
- 새 세션 방식 배포 후 24시간 모니터링
```

---

## 7. 결론 및 권장 사항

### 7-1. 구현 우선순위

```
즉시 (다음 세션):
  [ ] Level 1: SQLite + bcrypt 전환
  [ ] 비밀번호 변경 API + UI (헤더에 '비밀번호 변경' 버튼)
  [ ] 감사 로그 DB 영속화

단기 (1~2주):
  [ ] Level 2: 사용자 관리 UI (/settings/users)
  [ ] 역할 기반 접근 제어
  [ ] 로그인 이력 UI

중기 (1달):
  [ ] Level 3: 세션 테이블 + 활성 세션 관리
  [ ] IP 허용 목록 UI

Level 4 (OAuth/2FA): 이 프로젝트 규모에서는 불필요
```

### 7-2. 이 프로젝트의 인증 철학

1인 셀프호스팅 서버 대시보드에서 인증의 역할은 명확하다:
**"권한 없는 사람이 서버를 제어하지 못하게 막는 것"**

Supabase처럼 수만 명의 사용자를 다루는 시스템이 아니므로, OAuth·2FA·MFA 등 복잡한 기능보다는 **단순하지만 안전한 구현**이 우선이다.

현재 구현(JWT + httpOnly 쿠키 + Rate Limiting + 감사 로그)은 이미 대부분의 공격 시나리오를 방어한다. Level 1(bcrypt + DB)만 추가해도 보안 수준이 크게 향상된다.

> 참고: OWASP Authentication Cheat Sheet (2025)
> https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
>
> NIST SP 800-63B (Digital Identity Guidelines, 2024 개정)
> https://pages.nist.gov/800-63-4/

---

*작성: kdywave 리서치 에이전트 · 2026-04-06*
*다음 문서: [04-storage-file-manager.md](./04-storage-file-manager.md)*
