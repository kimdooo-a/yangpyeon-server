# Wave 4+5 — API 라우트 설계

> 문서 번호: 04  
> 작성일: 2026-04-06  
> 스택: Next.js 15 App Router + TypeScript + Zod + better-sqlite3 + Drizzle  
> 대상 브랜치: wave-4-5 (DB 기반 API 확장)

---

## 1. 개요

현재 API는 최소 기능(PM2 제어, 시스템 메트릭, 로그인)만 제공한다.  
Wave 4+5에서는 Supabase 스타일의 풀 플랫폼 API로 확장하며, 다음 원칙을 따른다.

**설계 원칙**:
1. **RESTful**: 리소스 중심 URL + 표준 HTTP 메서드
2. **일관된 응답 형식**: 성공/에러 모두 동일한 래퍼 구조
3. **Zod 스키마 검증**: 모든 입력(body, query, params) 검증 필수
4. **인증 미들웨어**: 공개 엔드포인트 외 모두 세션 검증
5. **Rate Limiting**: 엔드포인트 유형별 제한 적용
6. **감사 로그**: 모든 변경 작업 자동 기록

---

## 2. 공통 패턴

### 2.1 응답 형식

```typescript
// 성공 응답
{
  "data": <payload>,        // 단일 객체 또는 배열
  "meta": {                 // 페이지네이션 시 포함
    "page": 1,
    "pageSize": 20,
    "total": 245,
    "pageCount": 13
  }
}

// 에러 응답
{
  "error": "사람이 읽을 수 있는 에러 메시지",
  "code": "MACHINE_READABLE_CODE",
  "details": { ... }        // 선택적, 검증 에러 상세 등
}
```

### 2.2 에러 코드 규격

| HTTP 상태 | 코드 | 설명 |
|----------|------|------|
| 400 | `VALIDATION_ERROR` | Zod 검증 실패 |
| 400 | `INVALID_QUERY` | SQL 쿼리 오류 |
| 400 | `INVALID_FILE_TYPE` | 허용되지 않는 파일 형식 |
| 401 | `UNAUTHORIZED` | 인증되지 않은 요청 |
| 403 | `FORBIDDEN` | 권한 부족 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `CONFLICT` | 중복 (이미 존재) |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate Limit 초과 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |
| 503 | `DB_ERROR` | 데이터베이스 오류 |

### 2.3 페이지네이션 쿼리 파라미터

모든 목록 API에 공통 적용:

```
GET /api/<resource>?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc
```

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `page` | number | 1 | 페이지 번호 (1부터 시작) |
| `pageSize` | number | 20 | 페이지당 항목 수 (최대 100) |
| `sortBy` | string | (리소스별 기본값) | 정렬 기준 필드 |
| `sortOrder` | `asc` \| `desc` | `desc` | 정렬 방향 |

**공통 Zod 스키마**:

```typescript
// src/lib/api/schemas/pagination.ts

import { z } from "zod"

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

export type PaginationQuery = z.infer<typeof paginationSchema>
```

### 2.4 인증 미들웨어 패턴

```typescript
// src/lib/api/middleware/auth.ts

import { cookies } from "next/headers"
import { verifySession } from "@/lib/auth/session"
import type { NextRequest } from "next/server"

export async function requireAuth(req: NextRequest) {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get("session")?.value
  
  if (!sessionToken) {
    return Response.json(
      { error: "인증이 필요합니다.", code: "UNAUTHORIZED" },
      { status: 401 }
    )
  }
  
  const session = await verifySession(sessionToken)
  if (!session) {
    return Response.json(
      { error: "세션이 만료되었습니다.", code: "UNAUTHORIZED" },
      { status: 401 }
    )
  }
  
  return session  // 세션 반환 (사용자 정보 포함)
}
```

### 2.5 Rate Limiting 규칙

| 엔드포인트 유형 | 제한 | 윈도우 |
|--------------|------|--------|
| 로그인 | 5회 | 15분 |
| 비밀번호 변경 | 3회 | 1시간 |
| SQL 실행 | 60회 | 1분 |
| 파일 업로드 | 10회 | 1분 |
| 일반 읽기 | 200회 | 1분 |
| 일반 쓰기 | 60회 | 1분 |
| SSE 스트림 | 5 동시 연결 | — |

```typescript
// src/lib/api/middleware/rate-limit.ts

export interface RateLimitConfig {
  max: number           // 최대 요청 수
  windowMs: number      // 윈도우 시간 (ms)
  keyFn?: (req: NextRequest) => string  // 키 생성 함수 (기본: IP)
}

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<{ success: boolean; remaining: number; resetAt: Date }>
```

---

## 3. 인증 API

### 3.1 POST /api/auth/login

로그인. 세션 쿠키 발급.

**인증 불필요** | Rate Limit: 5/15분

**요청**:
```typescript
// Zod 스키마
const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
})

// Body 예시
{
  "username": "admin",
  "password": "plaintext_password"
}
```

**응답 200**:
```json
{
  "data": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "lastLoginAt": "2026-04-06T09:15:00Z"
  }
}
```
→ Set-Cookie: `session=<token>; HttpOnly; SameSite=Strict; Max-Age=86400`

**에러**:
- 400 `VALIDATION_ERROR`: 입력 검증 실패
- 401 `INVALID_CREDENTIALS`: 아이디/비밀번호 불일치
- 429 `RATE_LIMIT_EXCEEDED`: 시도 초과

---

### 3.2 POST /api/auth/logout

로그아웃. 세션 쿠키 삭제.

**인증 필요** | Rate Limit: 일반

**요청**: Body 없음

**응답 200**:
```json
{ "data": { "success": true } }
```
→ Set-Cookie: `session=; Max-Age=0`

---

### 3.3 GET /api/auth/me

현재 로그인한 사용자 정보 조회.

**인증 필요** | Rate Limit: 일반 읽기

**응답 200**:
```json
{
  "data": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "createdAt": "2026-01-01T00:00:00Z",
    "lastLoginAt": "2026-04-06T09:15:00Z"
  }
}
```

---

### 3.4 PUT /api/auth/password

비밀번호 변경.

**인증 필요** | Rate Limit: 3/1시간

**요청**:
```typescript
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: "영문 대소문자 + 숫자 포함 8자 이상"
    }),
})
```

**응답 200**:
```json
{ "data": { "success": true } }
```

**에러**:
- 400 `VALIDATION_ERROR`: 비밀번호 형식 불일치
- 401 `INVALID_CREDENTIALS`: 현재 비밀번호 틀림

---

## 4. 사용자 관리 API

### 4.1 GET /api/users

사용자 목록 조회.

**인증 필요 (admin)** | Rate Limit: 일반 읽기

**쿼리 파라미터**: `page`, `pageSize`, `sortBy` (기본: `createdAt`), `sortOrder`

**응답 200**:
```json
{
  "data": [
    {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "createdAt": "2026-01-01T00:00:00Z",
      "lastLoginAt": "2026-04-06T09:15:00Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 3, "pageCount": 1 }
}
```

---

### 4.2 POST /api/users

새 사용자 생성.

**인증 필요 (admin)** | Rate Limit: 일반 쓰기

**요청**:
```typescript
const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "viewer"]).default("viewer"),
})
```

**응답 201**:
```json
{
  "data": {
    "id": 2,
    "username": "viewer1",
    "role": "viewer",
    "createdAt": "2026-04-06T09:00:00Z"
  }
}
```

**에러**:
- 409 `CONFLICT`: 이미 존재하는 사용자명

---

### 4.3 PUT /api/users/[id]

사용자 정보 수정 (역할 변경, 비밀번호 초기화).

**인증 필요 (admin)** | Rate Limit: 일반 쓰기

**요청**:
```typescript
const updateUserSchema = z.object({
  role: z.enum(["admin", "viewer"]).optional(),
  password: z.string().min(8).max(200).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "변경할 필드가 하나 이상 필요합니다."
})
```

**에러**:
- 403 `FORBIDDEN`: 자기 자신의 역할 변경 시도
- 404 `NOT_FOUND`: 사용자 없음

---

### 4.4 DELETE /api/users/[id]

사용자 삭제.

**인증 필요 (admin)** | Rate Limit: 일반 쓰기

**응답 200**:
```json
{ "data": { "success": true } }
```

**에러**:
- 403 `FORBIDDEN`: 자기 자신 삭제 시도
- 404 `NOT_FOUND`: 사용자 없음

---

## 5. 시스템 메트릭 API

### 5.1 GET /api/system

현재 시스템 메트릭 즉시 조회 (기존 유지, 응답 형식 표준화).

**인증 필요** | Rate Limit: 일반 읽기

**응답 200**:
```json
{
  "data": {
    "cpu": {
      "usage": 23.5,
      "cores": 8,
      "model": "Intel Core i7-1165G7"
    },
    "memory": {
      "used": 12884901888,
      "total": 17179869184,
      "usagePercent": 75.0
    },
    "disk": {
      "used": 107374182400,
      "total": 240000000000,
      "usagePercent": 44.7
    },
    "uptime": 864000,
    "loadAverage": [1.2, 1.5, 1.3],
    "timestamp": "2026-04-06T09:15:00Z"
  }
}
```

---

### 5.2 GET /api/system/stream

Server-Sent Events 실시간 메트릭 스트림.

**인증 필요** | Rate Limit: 5 동시 연결

**응답**: `Content-Type: text/event-stream`

```
event: metric
data: {"cpu":{"usage":24.1},"memory":{"usagePercent":76.2},"timestamp":"2026-04-06T09:15:01Z"}

event: metric
data: {"cpu":{"usage":22.8},"memory":{"usagePercent":76.0},"timestamp":"2026-04-06T09:15:11Z"}

event: heartbeat
data: {}
```

**이벤트 유형**:
- `metric`: 시스템 메트릭 (10초 간격)
- `heartbeat`: 연결 유지 (30초 간격)
- `error`: 메트릭 수집 오류

```typescript
// src/app/api/system/stream/route.ts

export async function GET(req: NextRequest) {
  const session = await requireAuth(req)
  if (session instanceof Response) return session

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(async () => {
        const metrics = await getSystemMetrics()
        const data = `event: metric\ndata: ${JSON.stringify(metrics)}\n\n`
        controller.enqueue(encoder.encode(data))
      }, 10_000)

      req.signal.addEventListener("abort", () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    }
  })
}
```

---

### 5.3 GET /api/system/history

메트릭 히스토리 조회 (DB 저장된 스냅샷).

**인증 필요** | Rate Limit: 일반 읽기

**쿼리 파라미터**:
```
?from=2026-04-06T00:00:00Z&to=2026-04-06T23:59:59Z&resolution=5m
```

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `from` | ISO 8601 | 1시간 전 | 시작 시간 |
| `to` | ISO 8601 | 현재 | 종료 시간 |
| `resolution` | `1m`\|`5m`\|`1h` | `5m` | 데이터 집계 간격 |

**응답 200**:
```json
{
  "data": [
    {
      "timestamp": "2026-04-06T08:00:00Z",
      "cpu": 20.1,
      "memoryPercent": 72.3,
      "diskPercent": 44.7
    }
  ],
  "meta": { "from": "...", "to": "...", "resolution": "5m", "count": 12 }
}
```

---

## 6. 데이터베이스 API

### 6.1 GET /api/db/tables

SQLite 테이블 목록 조회.

**인증 필요** | Rate Limit: 일반 읽기

**응답 200**:
```json
{
  "data": [
    {
      "name": "users",
      "rowCount": 3,
      "columns": [
        { "name": "id", "type": "INTEGER", "notNull": true, "primaryKey": true },
        { "name": "username", "type": "TEXT", "notNull": true, "primaryKey": false },
        { "name": "role", "type": "TEXT", "notNull": true, "primaryKey": false }
      ]
    }
  ]
}
```

---

### 6.2 GET /api/db/tables/[name]

테이블 데이터 조회 (페이지네이션).

**인증 필요** | Rate Limit: 일반 읽기

**쿼리 파라미터**: `page`, `pageSize`, `sortBy`, `sortOrder`, `filter` (JSON 인코딩)

```
GET /api/db/tables/users?page=1&pageSize=20&sortBy=id&sortOrder=asc
```

**응답 200**:
```json
{
  "data": [
    { "id": 1, "username": "admin", "role": "admin" }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 3, "pageCount": 1 }
}
```

**에러**:
- 404 `NOT_FOUND`: 테이블 없음

---

### 6.3 POST /api/db/tables/[name]

테이블에 행 추가.

**인증 필요** | Rate Limit: 일반 쓰기

**요청**: 컬럼 값 객체 (Zod로 런타임 검증 — 스키마는 테이블 정의에서 동적 생성)
```json
{
  "username": "newuser",
  "role": "viewer",
  "passwordHash": "$2b$12$..."
}
```

**응답 201**:
```json
{
  "data": { "id": 4, "username": "newuser", "role": "viewer" }
}
```

---

### 6.4 PUT /api/db/tables/[name]/[id]

행 수정.

**인증 필요** | Rate Limit: 일반 쓰기

**요청**: 변경할 컬럼만 포함
```json
{ "role": "admin" }
```

**응답 200**:
```json
{
  "data": { "id": 4, "username": "newuser", "role": "admin" }
}
```

---

### 6.5 DELETE /api/db/tables/[name]/[id]

행 삭제.

**인증 필요** | Rate Limit: 일반 쓰기

**응답 200**:
```json
{ "data": { "success": true, "deletedId": 4 } }
```

---

### 6.6 POST /api/db/query

SQL 쿼리 직접 실행 (SELECT만 허용).

**인증 필요** | Rate Limit: 60/분

**요청**:
```typescript
const querySchema = z.object({
  sql: z.string()
    .min(1)
    .max(10_000)
    .refine(
      sql => /^\s*SELECT\b/i.test(sql),
      { message: "SELECT 쿼리만 실행 가능합니다." }
    ),
  params: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
})
```

**응답 200**:
```json
{
  "data": {
    "rows": [
      { "id": 1, "username": "admin" }
    ],
    "rowCount": 1,
    "executionTimeMs": 0.3,
    "columns": ["id", "username"]
  }
}
```

**에러**:
- 400 `INVALID_QUERY`: SQL 파싱 오류 또는 SELECT 외 쿼리
- 400 `VALIDATION_ERROR`: 쿼리 길이 초과

**보안 규칙**:
- `SELECT` 이외 모든 DML/DDL 차단 (정규식 + SQLite `PRAGMA query_only = ON`)
- 실행 타임아웃: 5초
- 결과 행 최대: 1,000행

---

## 7. 감사 로그 API

### 7.1 GET /api/audit

감사 로그 목록 조회 (DB 기반 — 인메모리에서 전환).

**인증 필요** | Rate Limit: 일반 읽기

**쿼리 파라미터**:
```
?page=1&pageSize=50&from=2026-04-01&to=2026-04-06&action=login&userId=1
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `from` | `YYYY-MM-DD` | 시작일 필터 |
| `to` | `YYYY-MM-DD` | 종료일 필터 |
| `action` | string | 액션 유형 필터 |
| `userId` | number | 사용자 필터 |
| `status` | `success`\|`failure` | 결과 필터 |

**응답 200**:
```json
{
  "data": [
    {
      "id": 1,
      "userId": 1,
      "username": "admin",
      "action": "LOGIN",
      "resource": "/api/auth/login",
      "method": "POST",
      "status": "success",
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0 ...",
      "metadata": {},
      "createdAt": "2026-04-06T09:10:00Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 50, "total": 240, "pageCount": 5 }
}
```

---

### 7.2 GET /api/audit/stream

실시간 감사 로그 SSE 스트림.

**인증 필요** | Rate Limit: 5 동시 연결

**응답**: `Content-Type: text/event-stream`

```
event: audit
data: {"id":241,"action":"PM2_RESTART","username":"admin","status":"success","createdAt":"2026-04-06T09:20:00Z"}

event: heartbeat
data: {}
```

---

## 8. PM2 프로세스 API (기존 API 표준화)

### 8.1 GET /api/pm2

PM2 프로세스 목록 (기존 API, 응답 형식 표준화).

**인증 필요** | Rate Limit: 일반 읽기

**응답 200**:
```json
{
  "data": [
    {
      "id": 0,
      "name": "luckystyle4u",
      "status": "online",
      "cpu": 2.3,
      "memory": 157286400,
      "uptime": 86400,
      "restarts": 0,
      "pid": 12345
    }
  ]
}
```

---

### 8.2 POST /api/pm2/[action]

PM2 프로세스 제어.

**인증 필요** | Rate Limit: 일반 쓰기

**액션**: `restart` | `stop` | `start` | `delete`

**요청**:
```typescript
const pm2ActionSchema = z.object({
  processName: z.string().min(1).max(100),
})
```

**응답 200**:
```json
{
  "data": {
    "success": true,
    "action": "restart",
    "processName": "luckystyle4u"
  }
}
```

---

### 8.3 GET /api/pm2/detail

특정 프로세스 상세 정보.

**인증 필요** | Rate Limit: 일반 읽기

**쿼리 파라미터**: `name` (프로세스명)

**응답 200**:
```json
{
  "data": {
    "id": 0,
    "name": "luckystyle4u",
    "status": "online",
    "cpu": 2.3,
    "memory": 157286400,
    "uptime": 86400,
    "restarts": 0,
    "pid": 12345,
    "execPath": "/home/ubuntu/app",
    "interpreter": "node",
    "env": { "NODE_ENV": "production", "PORT": "3000" },
    "logOutPath": "/home/ubuntu/.pm2/logs/luckystyle4u-out.log",
    "logErrPath": "/home/ubuntu/.pm2/logs/luckystyle4u-error.log"
  }
}
```

---

### 8.4 GET /api/pm2/logs

PM2 로그 스트리밍 (기존 → SSE 표준화).

**인증 필요** | Rate Limit: 5 동시 연결

**쿼리 파라미터**: `name` (프로세스명), `lines` (초기 로그 줄 수, 기본 100)

**응답**: `Content-Type: text/event-stream`

```
event: log
data: {"type":"out","line":"서버 시작됨 port 3000","timestamp":"2026-04-06T09:15:00Z"}

event: log  
data: {"type":"err","line":"에러 발생","timestamp":"2026-04-06T09:15:01Z"}
```

---

## 9. 스토리지 API

### 9.1 GET /api/storage/buckets

스토리지 버킷(디렉토리) 목록.

**인증 필요** | Rate Limit: 일반 읽기

**응답 200**:
```json
{
  "data": [
    {
      "name": "backups",
      "path": "/home/ubuntu/storage/backups",
      "fileCount": 12,
      "totalSize": 1288490188,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

---

### 9.2 GET /api/storage/[bucket]/files

버킷 내 파일 목록.

**인증 필요** | Rate Limit: 일반 읽기

**쿼리 파라미터**: `page`, `pageSize`, `path` (서브디렉토리)

**응답 200**:
```json
{
  "data": [
    {
      "name": "db-backup-20260406.sqlite",
      "path": "db-backup-20260406.sqlite",
      "size": 524288000,
      "mimeType": "application/x-sqlite3",
      "isDirectory": false,
      "modifiedAt": "2026-04-06T03:00:00Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 12, "pageCount": 1 }
}
```

---

### 9.3 POST /api/storage/[bucket]/upload

파일 업로드 (멀티파트).

**인증 필요** | Rate Limit: 10/분

**요청**: `Content-Type: multipart/form-data`
- `file`: 파일 바이너리
- `path`: 저장 경로 (선택)

**서버사이드 검증**:
```typescript
const ALLOWED_MIME_TYPES = [
  "application/x-sqlite3",
  "application/gzip",
  "text/plain",
  "application/json",
  "text/csv",
]
const MAX_FILE_SIZE = 500 * 1024 * 1024  // 500MB

// 검증 로직
if (!ALLOWED_MIME_TYPES.includes(file.type)) {
  return Response.json(
    { error: "허용되지 않는 파일 형식입니다.", code: "INVALID_FILE_TYPE" },
    { status: 400 }
  )
}
if (file.size > MAX_FILE_SIZE) {
  return Response.json(
    { error: "파일 크기가 500MB를 초과합니다.", code: "FILE_TOO_LARGE" },
    { status: 400 }
  )
}
```

**응답 201**:
```json
{
  "data": {
    "name": "backup.sqlite",
    "path": "backup.sqlite",
    "size": 524288000,
    "uploadedAt": "2026-04-06T09:00:00Z"
  }
}
```

---

### 9.4 GET /api/storage/[bucket]/[...path]

파일 다운로드.

**인증 필요** | Rate Limit: 일반 읽기

**응답**: 파일 바이너리 스트림 (Content-Disposition: attachment)

---

### 9.5 DELETE /api/storage/[bucket]/[...path]

파일 삭제.

**인증 필요** | Rate Limit: 일반 쓰기

**응답 200**:
```json
{ "data": { "success": true, "deletedPath": "db-backup-20260406.sqlite" } }
```

---

## 10. 설정 API

### 10.1 GET /api/settings

설정 값 조회.

**인증 필요** | Rate Limit: 일반 읽기

**응답 200**:
```json
{
  "data": {
    "serverName": "양평 부엌 서버",
    "metricIntervalSec": 30,
    "metricRetentionDays": 30,
    "logRetentionDays": 90,
    "alertEnabled": true,
    "theme": "dark",
    "timezone": "Asia/Seoul"
  }
}
```

---

### 10.2 PUT /api/settings

설정 변경.

**인증 필요 (admin)** | Rate Limit: 일반 쓰기

**요청**:
```typescript
const settingsSchema = z.object({
  serverName: z.string().min(1).max(100).optional(),
  metricIntervalSec: z.number().int().min(10).max(300).optional(),
  metricRetentionDays: z.number().int().min(1).max(365).optional(),
  logRetentionDays: z.number().int().min(1).max(365).optional(),
  alertEnabled: z.boolean().optional(),
  timezone: z.string().optional(),
})
```

**응답 200**: 변경된 전체 설정 객체

---

## 11. 알림 규칙 API

### 11.1 GET /api/alerts

알림 규칙 목록.

**인증 필요** | Rate Limit: 일반 읽기

**응답 200**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "CPU 과부하 경고",
      "metric": "cpu",
      "operator": "gt",
      "threshold": 90,
      "durationSec": 60,
      "enabled": true,
      "createdAt": "2026-04-01T00:00:00Z"
    }
  ]
}
```

---

### 11.2 POST /api/alerts

알림 규칙 생성.

**인증 필요** | Rate Limit: 일반 쓰기

**요청**:
```typescript
const alertSchema = z.object({
  name: z.string().min(1).max(100),
  metric: z.enum(["cpu", "memory", "disk", "process_down"]),
  operator: z.enum(["gt", "lt", "gte", "lte"]),
  threshold: z.number().min(0).max(100),
  durationSec: z.number().int().min(10).max(3600).default(60),
  enabled: z.boolean().default(true),
})
```

---

### 11.3 GET /api/alerts/events

알림 이벤트 이력.

**인증 필요** | Rate Limit: 일반 읽기

**쿼리 파라미터**: `page`, `pageSize`, `alertId`, `from`, `to`

**응답 200**:
```json
{
  "data": [
    {
      "id": 1,
      "alertId": 1,
      "alertName": "CPU 과부하 경고",
      "value": 93.2,
      "triggeredAt": "2026-04-06T08:30:00Z",
      "resolvedAt": "2026-04-06T08:35:00Z"
    }
  ]
}
```

---

## 12. API 라우트 파일 구조

```
src/app/api/
├── auth/
│   ├── login/route.ts
│   ├── logout/route.ts
│   ├── me/route.ts
│   └── password/route.ts
├── users/
│   ├── route.ts             ← GET (목록), POST (생성)
│   └── [id]/route.ts        ← PUT (수정), DELETE (삭제)
├── system/
│   ├── route.ts             ← GET (현재 메트릭)
│   ├── stream/route.ts      ← GET (SSE)
│   └── history/route.ts     ← GET (히스토리)
├── pm2/
│   ├── route.ts             ← GET (목록)
│   ├── logs/route.ts        ← GET (SSE 로그)
│   ├── detail/route.ts      ← GET (상세)
│   └── [action]/route.ts    ← POST (제어)
├── db/
│   ├── tables/
│   │   ├── route.ts         ← GET (테이블 목록)
│   │   └── [name]/
│   │       ├── route.ts     ← GET/POST
│   │       └── [id]/route.ts ← PUT/DELETE
│   └── query/route.ts       ← POST (SQL 실행)
├── audit/
│   ├── route.ts             ← GET (감사 로그 목록)
│   └── stream/route.ts      ← GET (SSE)
├── storage/
│   ├── buckets/route.ts     ← GET (버킷 목록)
│   └── [bucket]/
│       ├── files/route.ts   ← GET (파일 목록)
│       ├── upload/route.ts  ← POST (업로드)
│       └── [...path]/route.ts ← GET (다운로드), DELETE
├── settings/route.ts        ← GET/PUT
└── alerts/
    ├── route.ts             ← GET/POST
    ├── [id]/route.ts        ← PUT/DELETE
    └── events/route.ts      ← GET

src/lib/api/
├── middleware/
│   ├── auth.ts              ← requireAuth
│   └── rate-limit.ts        ← rateLimit
├── schemas/
│   ├── pagination.ts        ← 공통 페이지네이션 스키마
│   ├── auth.ts
│   ├── users.ts
│   ├── db.ts
│   └── alerts.ts
└── helpers/
    ├── response.ts          ← 성공/에러 응답 생성 헬퍼
    └── audit.ts             ← 감사 로그 기록 헬퍼
```

---

## 13. 응답 헬퍼 유틸리티

```typescript
// src/lib/api/helpers/response.ts

export function successResponse<T>(
  data: T,
  options?: { status?: number; meta?: Record<string, unknown> }
): Response {
  return Response.json(
    { data, ...(options?.meta && { meta: options.meta }) },
    { status: options?.status ?? 200 }
  )
}

export function errorResponse(
  error: string,
  code: string,
  options?: { status?: number; details?: unknown }
): Response {
  return Response.json(
    { error, code, ...(options?.details !== undefined && { details: options.details }) },
    { status: options?.status ?? 400 }
  )
}

export function paginatedResponse<T>(
  data: T[],
  pagination: { page: number; pageSize: number; total: number }
): Response {
  return successResponse(data, {
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      pageCount: Math.ceil(pagination.total / pagination.pageSize),
    }
  })
}
```
