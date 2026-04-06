# 회원관리 백엔드 시스템 설계서

> 작성일: 2026-04-06
> 상태: 승인됨

## 개요

stylelucky4u.com 백엔드 서비스 플랫폼에 회원관리 체계를 추가한다.
WSL2 로컬 PostgreSQL + Prisma ORM 기반, 회원 CRUD + RBAC를 제공하는 REST API.

## 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| DB | WSL2 로컬 PostgreSQL | 외부 의존 없이 완전한 제어권 |
| ORM | Prisma | 타입 안전, 마이그레이션 관리 편리 |
| API 패턴 | Next.js API Route 확장 | 기존 프로젝트 구조와 자연스럽게 합류 |
| 인증 | JWT (Bearer Token) | 클라이언트 앱 범용 호환 |
| 해싱 | bcrypt | 업계 표준, 타이밍 공격 방지 내장 |
| 검증 | Zod | 전체 API 입력 검증 통합 |

## 1. 데이터 모델

### Prisma 스키마

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  name          String?
  phone         String?
  role          Role      @default(USER)
  isActive      Boolean   @default(true) @map("is_active")
  lastLoginAt   DateTime? @map("last_login_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  @@map("users")
}

enum Role {
  ADMIN
  MANAGER
  USER
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK, 자동 생성 |
| email | string (unique) | 로그인 식별자 |
| passwordHash | string | bcrypt 해시 |
| name | string? | 이름 (선택) |
| phone | string? | 전화번호 (선택) |
| role | enum | ADMIN / MANAGER / USER |
| isActive | boolean | soft delete용 (false = 비활성) |
| lastLoginAt | datetime? | 마지막 로그인 시각 |
| createdAt | datetime | 생성 시각 |
| updatedAt | datetime | 수정 시각 |

## 2. API 엔드포인트

### 공개 API (인증 불필요)

| 메서드 | 경로 | 설명 | 요청 Body |
|--------|------|------|-----------|
| POST | /api/v1/auth/register | 회원가입 | `{ email, password, name?, phone? }` |
| POST | /api/v1/auth/login | 로그인 | `{ email, password }` |
| POST | /api/v1/auth/logout | 로그아웃 | - |

### 인증 필요 (Bearer Token)

| 메서드 | 경로 | 설명 | 요청 Body |
|--------|------|------|-----------|
| GET | /api/v1/auth/me | 내 정보 | - |
| PUT | /api/v1/auth/me | 내 정보 수정 | `{ name?, phone? }` |
| PUT | /api/v1/auth/password | 비밀번호 변경 | `{ currentPassword, newPassword }` |

### ADMIN/MANAGER 전용

| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | /api/v1/members | ADMIN, MANAGER | 회원 목록 (검색, 페이지네이션) |
| GET | /api/v1/members/:id | ADMIN, MANAGER | 회원 상세 |
| PUT | /api/v1/members/:id | ADMIN, MANAGER | 회원 정보 수정 |
| PUT | /api/v1/members/:id/role | ADMIN | 역할 변경 |
| DELETE | /api/v1/members/:id | ADMIN | 회원 비활성화 (soft delete) |

### 응답 형식 (공통)

```typescript
// 성공
{ success: true, data: T }

// 실패
{ success: false, error: { code: string, message: string } }

// 목록 (페이지네이션)
{
  success: true,
  data: T[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number
  }
}
```

## 3. 인증 흐름

### 로그인

```
POST /api/v1/auth/login { email, password }
  → bcrypt.compare(password, user.passwordHash)
  → 성공 시:
    - Access Token 생성 (15분 만료, body 응답)
    - Refresh Token 생성 (7일 만료, httpOnly 쿠키)
    - lastLoginAt 업데이트
  → 실패 시:
    - Rate Limit 적용 (기존 슬라이딩 윈도우 재사용)
    - 401 응답
```

### 토큰 구조

```typescript
// Access Token payload
{
  sub: userId,       // 사용자 ID
  email: string,
  role: Role,
  type: 'access',
  iat: number,
  exp: number        // 15분
}

// Refresh Token payload
{
  sub: userId,
  type: 'refresh',
  iat: number,
  exp: number        // 7일
}
```

### 기존 대시보드 인증과의 공존

| 항목 | 대시보드 (기존) | v1 API (신규) |
|------|----------------|---------------|
| 인증 방식 | 단일 비밀번호 + JWT 쿠키 | 이메일/비밀번호 + Bearer 토큰 |
| 쿠키명 | dashboard_session | v1_refresh_token |
| 미들웨어 | src/lib/middleware.ts | src/lib/api-guard.ts |
| 경로 | /api/auth/* | /api/v1/auth/* |
| 용도 | 서버 관리 | 서비스 회원 관리 |

## 4. RBAC (역할 기반 접근 제어)

### 역할 계층

```
ADMIN > MANAGER > USER
```

### 권한 매트릭스

| 기능 | ADMIN | MANAGER | USER |
|------|-------|---------|------|
| 내 정보 조회/수정 | O | O | O |
| 비밀번호 변경 | O | O | O |
| 회원 목록 조회 | O | O | X |
| 회원 상세 조회 | O | O | X |
| 회원 정보 수정 | O | O | X |
| 역할 변경 | O | X | X |
| 회원 비활성화 | O | X | X |

### 미들웨어 패턴

```typescript
// withAuth: JWT 검증 + 사용자 정보 주입
// withRole: 역할 검사
export const GET = withRole(['ADMIN', 'MANAGER'], async (req, user) => {
  // user.role이 ADMIN 또는 MANAGER인 경우만 실행
})
```

## 5. 입력 검증 (Zod)

```typescript
// 회원가입
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(50).optional(),
  phone: z.string().regex(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/).optional(),
})

// 로그인
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// 회원 목록 쿼리
const memberListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.coerce.boolean().optional(),
})
```

## 6. 파일 구조

```
# 새로 추가되는 파일/디렉토리

prisma/
  schema.prisma                    ← DB 스키마

src/
  lib/
    prisma.ts                      ← Prisma 클라이언트 싱글톤
    password.ts                    ← bcrypt 해싱/검증
    jwt-v1.ts                      ← v1 API용 JWT (Bearer 토큰)
    api-guard.ts                   ← withAuth, withRole 미들웨어
    schemas/
      auth.ts                      ← 인증 관련 Zod 스키마
      member.ts                    ← 회원 관련 Zod 스키마

  app/api/v1/
    auth/
      register/route.ts            ← POST 회원가입
      login/route.ts               ← POST 로그인
      logout/route.ts              ← POST 로그아웃
      me/route.ts                  ← GET, PUT 내 정보
      password/route.ts            ← PUT 비밀번호 변경
    members/
      route.ts                     ← GET 회원 목록
      [id]/
        route.ts                   ← GET, PUT, DELETE 회원 상세
        role/route.ts              ← PUT 역할 변경

  app/(dashboard)/members/
    page.tsx                       ← 회원 목록 UI (대시보드)
    [id]/page.tsx                  ← 회원 상세 UI (대시보드)
```

## 7. 새 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| prisma | latest | CLI + 마이그레이션 |
| @prisma/client | latest | DB 클라이언트 |
| bcrypt | latest | 비밀번호 해싱 |
| @types/bcrypt | latest | 타입 정의 |
| zod | latest | 입력 검증 |

## 8. 환경변수 (추가)

```env
# PostgreSQL 연결 (WSL2)
DATABASE_URL="postgresql://user:password@localhost:5432/luckystyle4u"

# JWT 시크릿 (v1 API용, 기존 AUTH_SECRET와 별도)
JWT_V1_SECRET="..."
JWT_V1_REFRESH_SECRET="..."
```

## 9. 보안 고려사항

- bcrypt salt rounds: 12 (기본값)
- Rate Limit: 기존 슬라이딩 윈도우 재사용 (회원가입 5/분, 로그인 5/분)
- 비밀번호 정책: 최소 8자
- soft delete: 실제 삭제 대신 isActive=false
- ADMIN 자기 자신 비활성화 방지
- 역할 변경 시 ADMIN만 가능, 자기 자신 역할 변경 방지

## 10. 기존 시스템과의 관계

- 기존 대시보드 인증(`/api/auth/*`)은 그대로 유지
- 새 API(`/api/v1/*`)는 별도 인증 체계로 운영
- 대시보드 회원 관리 UI는 v1 API를 호출
- 사이드바에 "회원 관리" 메뉴 추가
