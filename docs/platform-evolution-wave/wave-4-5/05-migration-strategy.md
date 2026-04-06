# Wave 4+5 — 인메모리 → SQLite 마이그레이션 전략

> 문서 번호: 05  
> 작성일: 2026-04-06  
> 대상: 현재 인메모리 구조 → SQLite (better-sqlite3) + Drizzle ORM  
> 원칙: 하위 호환 유지, 단계별 전환, 롤백 가능

---

## 1. 현재 인메모리 데이터 현황

마이그레이션 전, 현재 어떤 데이터가 어디에 인메모리로 존재하는지 파악한다.

### 1.1 감사 로그 (`src/lib/audit-log.ts`)

```
구조:     배열 (AuditLog[])
용량:     최대 1,000건 순환 버퍼
문제점:   PM2 재시작 시 전체 초기화
          서버 메모리에만 존재 (프로세스 간 공유 불가)
파일:     src/lib/audit-log.ts
```

### 1.2 Rate Limit (`src/lib/rate-limit.ts`)

```
구조:     Map<string, { count: number; resetAt: number }>
문제점:   PM2 재시작 시 초기화 (DDoS 방어 효과 일시 소멸)
          단일 프로세스 내에서만 유효
파일:     src/lib/rate-limit.ts
```

### 1.3 인증 (`src/middleware.ts` + 환경변수)

```
구조:     하드코딩 비밀번호 (ADMIN_PASSWORD_HASH 환경변수)
          세션: JWT 또는 쿠키 (HttpOnly)
문제점:   사용자 추가/변경 불가 (배포 없이)
          다중 사용자 불가
파일:     src/middleware.ts, .env
```

### 1.4 시스템 메트릭

```
구조:     히스토리 없음 — 요청 시점 즉시 조회만
문제점:   과거 데이터 조회 불가
          차트용 시계열 데이터 불가
```

---

## 2. 목표 DB 스키마

```sql
-- Drizzle 스키마 (src/db/schema.ts)

-- 사용자 테이블
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL UNIQUE,
  password_hash TEXT  NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

-- 세션 테이블
CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,  -- UUID
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 감사 로그 테이블
CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username    TEXT,                 -- 삭제된 사용자 대비 이름 보존
  action      TEXT    NOT NULL,     -- LOGIN, LOGOUT, PM2_RESTART, SQL_EXECUTE 등
  resource    TEXT,                 -- API 경로
  method      TEXT,                 -- HTTP 메서드
  status      TEXT    NOT NULL CHECK (status IN ('success', 'failure')),
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    TEXT,                 -- JSON 문자열
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- 메트릭 스냅샷 테이블
CREATE TABLE metric_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cpu_usage       REAL    NOT NULL,
  memory_used     INTEGER NOT NULL,
  memory_total    INTEGER NOT NULL,
  disk_used       INTEGER NOT NULL,
  disk_total      INTEGER NOT NULL,
  load_avg_1m     REAL,
  load_avg_5m     REAL,
  load_avg_15m    REAL,
  recorded_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_metric_snapshots_recorded_at ON metric_snapshots(recorded_at DESC);

-- 설정 테이블 (key-value)
CREATE TABLE settings (
  key         TEXT    PRIMARY KEY,
  value       TEXT    NOT NULL,     -- JSON 문자열
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 알림 규칙 테이블
CREATE TABLE alert_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  metric        TEXT    NOT NULL CHECK (metric IN ('cpu', 'memory', 'disk', 'process_down')),
  operator      TEXT    NOT NULL CHECK (operator IN ('gt', 'lt', 'gte', 'lte')),
  threshold     REAL    NOT NULL,
  duration_sec  INTEGER NOT NULL DEFAULT 60,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 알림 이벤트 테이블
CREATE TABLE alert_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_rule_id INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  value         REAL    NOT NULL,
  triggered_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at   INTEGER
);
```

---

## 3. 마이그레이션 단계별 계획

### Step 1: SQLite + Drizzle 설치 및 초기화

**목적**: DB 파일 생성, 연결 확립, Drizzle 마이그레이션 도구 세팅

**변경 파일 목록**:
```
신규 생성:
- src/db/index.ts          ← DB 연결 싱글턴
- src/db/schema.ts         ← Drizzle 스키마 정의
- drizzle.config.ts        ← Drizzle Kit 설정
- .gitignore               ← data/ 디렉토리 추가

수정:
- package.json             ← better-sqlite3, drizzle-orm, drizzle-kit 추가
- .env.example             ← DB_PATH 추가
```

**설치 명령어**:
```bash
npm install better-sqlite3 drizzle-orm
npm install -D drizzle-kit @types/better-sqlite3
```

**DB 연결 싱글턴**:
```typescript
// src/db/index.ts

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"
import path from "path"

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data/app.db")

// 싱글턴 (Next.js dev 모드 HMR 대응)
declare global {
  var __db: ReturnType<typeof createDb> | undefined
}

function createDb() {
  const sqlite = new Database(DB_PATH)
  // WAL 모드 활성화 (성능 향상 + 동시 읽기)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  return drizzle(sqlite, { schema })
}

export const db = globalThis.__db ?? (globalThis.__db = createDb())
```

**drizzle.config.ts**:
```typescript
import type { Config } from "drizzle-kit"

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./data/app.db",
  },
} satisfies Config
```

**롤백**: 패키지만 설치된 상태 — 기존 코드 변경 없음, `npm uninstall`로 원복

**테스트**:
```bash
# 마이그레이션 SQL 미리보기
npx drizzle-kit generate
npx drizzle-kit push  # 개발 환경 직접 적용
node -e "const db = require('./src/db'); console.log('DB OK')"
```

---

### Step 2: 초기 시드 데이터

**목적**: 기존 환경변수의 관리자 계정을 DB로 이전

**변경 파일 목록**:
```
신규 생성:
- src/db/seed.ts           ← 초기 데이터 시드
- src/db/migrate.ts        ← 마이그레이션 실행 스크립트
```

**시드 스크립트**:
```typescript
// src/db/seed.ts

import { db } from "./index"
import { users, settings } from "./schema"
import bcrypt from "bcryptjs"

export async function seed() {
  const existingAdmin = await db.select()
    .from(users)
    .where(eq(users.username, "admin"))
    .get()

  if (!existingAdmin) {
    // 기존 환경변수 비밀번호 해시를 그대로 사용하거나 재해시
    const rawPassword = process.env.ADMIN_PASSWORD ?? "changeme"
    const hash = await bcrypt.hash(rawPassword, 12)
    
    await db.insert(users).values({
      username: "admin",
      passwordHash: hash,
      role: "admin",
    })
    console.log("시드: admin 사용자 생성 완료")
  }

  // 기본 설정값 삽입
  const defaultSettings = [
    { key: "serverName", value: JSON.stringify("양평 부엌 서버") },
    { key: "metricIntervalSec", value: JSON.stringify(30) },
    { key: "metricRetentionDays", value: JSON.stringify(30) },
    { key: "logRetentionDays", value: JSON.stringify(90) },
    { key: "alertEnabled", value: JSON.stringify(true) },
    { key: "timezone", value: JSON.stringify("Asia/Seoul") },
  ]

  for (const setting of defaultSettings) {
    await db.insert(settings)
      .values(setting)
      .onConflictDoNothing()
  }
  console.log("시드: 기본 설정 완료")
}
```

**package.json scripts 추가**:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:seed": "tsx src/db/seed.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

**롤백**: 시드는 `onConflictDoNothing()` — 중복 실행 안전. `data/app.db` 파일 삭제로 초기화.

---

### Step 3: 감사 로그 DB 전환

**목적**: 인메모리 배열 → `audit_logs` 테이블

**변경 파일 목록**:
```
수정:
- src/lib/audit-log.ts          ← DB 삽입으로 교체
- src/app/api/audit/route.ts    ← DB 조회로 교체

기존 파일 (백업 후 수정):
- src/lib/audit-log.ts.bak      ← 인메모리 버전 보존
```

**Before (인메모리)**:
```typescript
// src/lib/audit-log.ts (현재)
const logs: AuditLog[] = []
export function addAuditLog(log: Omit<AuditLog, "id" | "timestamp">) {
  logs.unshift({ ...log, id: ++counter, timestamp: new Date() })
  if (logs.length > 1000) logs.pop()
}
export function getAuditLogs() { return logs }
```

**After (DB)**:
```typescript
// src/lib/audit-log.ts (변경 후)
import { db } from "@/db"
import { auditLogs } from "@/db/schema"
import { desc, eq, and, between } from "drizzle-orm"

export interface AuditLogInput {
  userId?: number
  username: string
  action: string
  resource?: string
  method?: string
  status: "success" | "failure"
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

// 비동기로 변경 (DB 삽입)
export async function addAuditLog(input: AuditLogInput): Promise<void> {
  await db.insert(auditLogs).values({
    ...input,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  })
}

export async function getAuditLogs(options?: {
  page?: number
  pageSize?: number
  userId?: number
  action?: string
  from?: Date
  to?: Date
}) {
  const { page = 1, pageSize = 50 } = options ?? {}
  const offset = (page - 1) * pageSize
  
  // 필터 조건 동적 구성
  const conditions = []
  if (options?.userId) conditions.push(eq(auditLogs.userId, options.userId))
  if (options?.action) conditions.push(eq(auditLogs.action, options.action))
  // ...
  
  const [rows, [{ count }]] = await Promise.all([
    db.select().from(auditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: count() }).from(auditLogs)
      .where(conditions.length ? and(...conditions) : undefined),
  ])
  
  return { rows, total: Number(count) }
}
```

**하위 호환성**: `addAuditLog` 호출부는 `await` 추가 필요 (비동기 전환). API 응답 형식 유지.

**롤백 방법**:
```bash
# audit-log.ts를 인메모리 버전으로 복원
cp src/lib/audit-log.ts.bak src/lib/audit-log.ts
# DB 파일은 그대로 유지 (데이터 보존)
```

**테스트**:
```bash
# 로그인 후 /api/audit 호출 → DB에서 조회되는지 확인
curl -b "session=..." http://localhost:3000/api/audit
# DB 직접 확인
sqlite3 data/app.db "SELECT * FROM audit_logs LIMIT 5;"
```

---

### Step 4: 인증 DB 전환

**목적**: 환경변수 하드코딩 비밀번호 → `users` 테이블 + `sessions` 테이블

**변경 파일 목록**:
```
신규 생성:
- src/lib/auth/session.ts        ← 세션 생성/검증 (DB 기반)
- src/lib/auth/password.ts       ← bcrypt 래퍼

수정:
- src/middleware.ts              ← DB 세션 검증으로 교체
- src/app/api/auth/login/route.ts ← DB 사용자 조회로 교체
- src/app/api/auth/logout/route.ts ← DB 세션 삭제로 교체
```

**세션 관리**:
```typescript
// src/lib/auth/session.ts

import { db } from "@/db"
import { sessions, users } from "@/db/schema"
import { eq, and, gt } from "drizzle-orm"
import { randomUUID } from "crypto"

export async function createSession(userId: number, meta: {
  ipAddress?: string
  userAgent?: string
}): Promise<string> {
  const sessionId = randomUUID()
  const expiresAt = Math.floor(Date.now() / 1000) + 86400  // 24시간

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    ...meta,
  })

  return sessionId
}

export async function verifySession(sessionId: string) {
  const now = Math.floor(Date.now() / 1000)
  
  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(sessions.id, sessionId),
      gt(sessions.expiresAt, now)
    ))
    .get()

  if (!result) return null

  // 마지막 사용 시간 갱신
  await db.update(sessions)
    .set({ lastUsedAt: now })
    .where(eq(sessions.id, sessionId))

  return { session: result.session, user: result.user }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

// 만료 세션 정리 (cron 또는 로그인 시 호출)
export async function cleanExpiredSessions(): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.delete(sessions).where(lt(sessions.expiresAt, now))
}
```

**미들웨어 변경**:
```typescript
// src/middleware.ts (변경 후)

import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/auth/session"

const PUBLIC_PATHS = ["/login", "/api/auth/login"]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const sessionId = req.cookies.get("session")?.value
  if (!sessionId) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // DB 세션 검증
  const result = await verifySession(sessionId)
  if (!result) {
    const res = NextResponse.redirect(new URL("/login", req.url))
    res.cookies.delete("session")
    return res
  }

  return NextResponse.next()
}
```

**롤백 방법**:
```bash
# middleware.ts를 환경변수 기반으로 복원
git checkout HEAD -- src/middleware.ts src/app/api/auth/
```

**테스트**:
```bash
# 로그인 테스트
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'

# 세션 DB 확인
sqlite3 data/app.db "SELECT * FROM sessions;"
```

---

### Step 5: 메트릭 히스토리 저장

**목적**: 시스템 메트릭 주기적 스냅샷 → `metric_snapshots` 테이블

**변경 파일 목록**:
```
신규 생성:
- src/lib/metrics/collector.ts   ← 주기적 수집 (setInterval)
- src/lib/metrics/history.ts     ← DB 조회 헬퍼

수정:
- src/app/api/system/route.ts    ← 현재 API 유지 (변경 없음)
신규:
- src/app/api/system/history/route.ts ← 히스토리 API
```

**수집기 (`src/lib/metrics/collector.ts`)**:
```typescript
import { db } from "@/db"
import { metricSnapshots } from "@/db/schema"
import { getSystemMetrics } from "@/lib/system"
import { lt } from "drizzle-orm"

let collectorInterval: NodeJS.Timeout | null = null

export function startMetricsCollector(intervalSec = 30) {
  if (collectorInterval) return  // 중복 시작 방지

  collectorInterval = setInterval(async () => {
    try {
      const metrics = await getSystemMetrics()
      await db.insert(metricSnapshots).values({
        cpuUsage: metrics.cpu.usage,
        memoryUsed: metrics.memory.used,
        memoryTotal: metrics.memory.total,
        diskUsed: metrics.disk.used,
        diskTotal: metrics.disk.total,
        loadAvg1m: metrics.loadAverage[0],
        loadAvg5m: metrics.loadAverage[1],
        loadAvg15m: metrics.loadAverage[2],
      })
    } catch (err) {
      console.error("[MetricsCollector] 수집 실패:", err)
    }
  }, intervalSec * 1000)
}

// 오래된 데이터 정리 (보존 기간 초과)
export async function pruneOldMetrics(retentionDays = 30) {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400
  await db.delete(metricSnapshots)
    .where(lt(metricSnapshots.recordedAt, cutoff))
}
```

**시작 위치**: `src/app/layout.tsx` 또는 `src/lib/startup.ts`에서 앱 시작 시 한 번 호출

**롤백**: 수집기 미시작 시 히스토리 테이블에 데이터 쌓이지 않음 — 기존 동작과 동일

---

### Step 6: 설정 DB 전환

**목적**: 환경변수 및 하드코딩 설정 → `settings` 테이블

**변경 파일 목록**:
```
신규 생성:
- src/lib/settings.ts            ← 설정 조회/수정 헬퍼
신규:
- src/app/api/settings/route.ts  ← GET/PUT 설정 API
```

**설정 헬퍼**:
```typescript
// src/lib/settings.ts

import { db } from "@/db"
import { settings } from "@/db/schema"
import { eq } from "drizzle-orm"

export interface AppSettings {
  serverName: string
  metricIntervalSec: number
  metricRetentionDays: number
  logRetentionDays: number
  alertEnabled: boolean
  timezone: string
}

const DEFAULTS: AppSettings = {
  serverName: "양평 부엌 서버",
  metricIntervalSec: 30,
  metricRetentionDays: 30,
  logRetentionDays: 90,
  alertEnabled: true,
  timezone: "Asia/Seoul",
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings)
  const map = Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]))
  return { ...DEFAULTS, ...map }
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  for (const [key, value] of Object.entries(partial)) {
    await db.insert(settings)
      .values({ key, value: JSON.stringify(value) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
  }
  return getSettings()
}
```

---

### Step 7: Rate Limit DB 전환 (선택)

**목적**: 인메모리 Map → `rate_limit_entries` 테이블 (PM2 재시작 후에도 제한 유지)

**판단 기준**:
- 보안 요구사항이 높으면 적용 (로그인 시도 제한 등)
- 일반 API Rate Limit은 인메모리로도 충분

**스키마 추가 (선택)**:
```sql
CREATE TABLE rate_limit_entries (
  id          TEXT    PRIMARY KEY,  -- "{ip}:{endpoint}"
  count       INTEGER NOT NULL DEFAULT 0,
  reset_at    INTEGER NOT NULL
);
```

**현재 권장**: 로그인 엔드포인트만 DB 기반, 나머지는 인메모리 유지

---

## 4. 하위 호환성 보장

### 4.1 API 응답 형식 유지 원칙

각 마이그레이션 단계에서 기존 프론트엔드 코드가 변경 없이 동작해야 한다.

| API | 현재 응답 형식 | 마이그레이션 후 | 변경 필요 |
|----|--------------|--------------|---------|
| GET /api/audit | `AuditLog[]` | `{ data: AuditLog[], meta: {...} }` | **변경** (표준화) |
| POST /api/auth/login | `{ success: true }` | `{ data: { id, username, role, ... } }` | **변경** (정보 추가) |
| GET /api/system | 현재 형식 | `{ data: { cpu, memory, disk, ... } }` | 래퍼 추가 |
| GET /api/pm2 | `PM2Process[]` | `{ data: PM2Process[] }` | 래퍼 추가 |

**프론트엔드 대응**: API 응답 형식 변경 시 해당 페이지 컴포넌트 동시 수정 필요.

### 4.2 단계별 점진적 전환

```
기존 코드 (비동기 없음)          →    전환 후 (비동기)
─────────────────────────────────────────────────────
addAuditLog(input)               →    await addAuditLog(input)
const logs = getAuditLogs()      →    const { rows } = await getAuditLogs()
```

---

## 5. 배포 절차 변경

### 5.1 data/ 디렉토리 보존

SQLite 파일은 `data/` 디렉토리에 위치한다. 배포 시 **절대 삭제하지 않는다.**

**현재 WSL2 배포 스크립트 예상 구조**:
```bash
#!/bin/bash
# 기존 배포 스크립트 (추정)
cd /home/ubuntu/luckystyle4u
git pull origin main
npm install
npm run build
pm2 restart luckystyle4u
```

**변경 후 배포 스크립트**:
```bash
#!/bin/bash
# deploy.sh

set -e

APP_DIR="/home/ubuntu/luckystyle4u"
DATA_DIR="$APP_DIR/data"

echo "=== 배포 시작 ==="

cd "$APP_DIR"

# 1. data/ 디렉토리 보존 확인
if [ ! -d "$DATA_DIR" ]; then
  echo "data/ 디렉토리 없음 — 생성"
  mkdir -p "$DATA_DIR"
fi

# 2. DB 백업 (배포 전)
if [ -f "$DATA_DIR/app.db" ]; then
  BACKUP_NAME="app.db.backup-$(date +%Y%m%d-%H%M%S)"
  cp "$DATA_DIR/app.db" "$DATA_DIR/$BACKUP_NAME"
  echo "DB 백업 완료: $BACKUP_NAME"
fi

# 3. 코드 갱신
git pull origin main

# 4. 의존성 설치
npm install --production

# 5. Next.js 빌드
npm run build

# 6. DB 마이그레이션 적용
npm run db:push

# 7. 초기 시드 (중복 무시)
npm run db:seed

# 8. PM2 재시작
pm2 restart luckystyle4u

echo "=== 배포 완료 ==="
```

### 5.2 .gitignore 업데이트

```gitignore
# .gitignore에 추가
data/
data/*.db
data/*.db-wal
data/*.db-shm
data/*.backup-*
```

### 5.3 .env.example 업데이트

```bash
# .env.example에 추가
# DB 파일 경로 (기본: ./data/app.db)
DB_PATH=./data/app.db

# 초기 관리자 비밀번호 (최초 시드 시에만 사용)
ADMIN_PASSWORD=changeme
```

---

## 6. 위험 관리

### 6.1 SQLite 파일 손상 대비

**원인**: 서버 강제 종료, 디스크 꽉 참, 파일 시스템 오류

**대책 1: WAL 모드 활성화** (Step 1에서 설정)
```sql
PRAGMA journal_mode = WAL;
```
WAL 모드는 쓰기 중 강제 종료 시에도 DB 무결성을 유지한다.

**대책 2: 자동 일별 백업**
```bash
#!/bin/bash
# /etc/cron.daily/backup-app-db

APP_DIR="/home/ubuntu/luckystyle4u"
BACKUP_DIR="$APP_DIR/data/backups"
DB_FILE="$APP_DIR/data/app.db"

mkdir -p "$BACKUP_DIR"

# SQLite 안전 백업 (온라인 백업 API 활용)
sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/app-$(date +%Y%m%d).db'"

# 7일 이상 된 백업 삭제
find "$BACKUP_DIR" -name "app-*.db" -mtime +7 -delete

echo "[$(date)] DB 백업 완료"
```

**대책 3: 손상 감지**
```typescript
// src/lib/db-health.ts

import { db } from "@/db"

export async function checkDbHealth(): Promise<boolean> {
  try {
    const result = db.$client.prepare("PRAGMA integrity_check").get() as { integrity_check: string }
    return result.integrity_check === "ok"
  } catch {
    return false
  }
}
```

### 6.2 복구 절차

**시나리오 A: WAL 파일 잔류**
```bash
# WAL 파일이 남아있으면 SQLite가 자동 복구
# 수동 복구가 필요한 경우:
sqlite3 data/app.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

**시나리오 B: DB 파일 손상**
```bash
# 1. 최신 백업으로 복원
cp data/backups/app-$(date +%Y%m%d).db data/app.db

# 2. 또는 손상된 DB에서 데이터 덤프 시도
sqlite3 data/app.db ".recover" | sqlite3 data/app_recovered.db
mv data/app.db data/app.corrupted
mv data/app_recovered.db data/app.db
```

**시나리오 C: 마이그레이션 실패**
```bash
# 배포 전 백업으로 롤백
cp data/app.db.backup-YYYYMMDD-HHMMSS data/app.db
git checkout HEAD~1  # 이전 코드 버전으로
npm run build
pm2 restart luckystyle4u
```

### 6.3 디스크 용량 모니터링

```typescript
// 메트릭 수집기에서 디스크 체크 추가
// src/lib/metrics/collector.ts

async function checkDiskUsage() {
  const dbPath = process.env.DB_PATH ?? "./data/app.db"
  const stats = await fs.stat(dbPath)
  const dbSizeMB = stats.size / 1024 / 1024
  
  if (dbSizeMB > 500) {  // 500MB 초과 시 경고
    console.warn(`[DB] 파일 크기 경고: ${dbSizeMB.toFixed(1)}MB`)
    // 알림 이벤트 생성
  }
}
```

---

## 7. 마이그레이션 체크리스트

### 단계별 완료 확인

```
Step 1: SQLite + Drizzle 설치
  [ ] better-sqlite3, drizzle-orm, drizzle-kit 설치됨
  [ ] src/db/index.ts 생성됨 (WAL 모드 포함)
  [ ] src/db/schema.ts 스키마 정의됨
  [ ] drizzle.config.ts 설정됨
  [ ] data/ 디렉토리 .gitignore에 추가됨
  [ ] npm run db:push 성공

Step 2: 초기 시드
  [ ] src/db/seed.ts 작성됨
  [ ] npm run db:seed 성공
  [ ] admin 사용자 DB에 생성됨 (sqlite3 확인)
  [ ] 기본 설정값 DB에 삽입됨

Step 3: 감사 로그 DB 전환
  [ ] addAuditLog 비동기 전환됨
  [ ] 모든 호출부 await 추가됨
  [ ] /api/audit DB 조회 확인됨
  [ ] 감사 로그 인메모리 백업 파일 보존됨

Step 4: 인증 DB 전환
  [ ] src/lib/auth/session.ts 작성됨
  [ ] 로그인 → 세션 DB 저장 확인됨
  [ ] 미들웨어 DB 세션 검증 확인됨
  [ ] 로그아웃 → 세션 DB 삭제 확인됨
  [ ] 환경변수 ADMIN_PASSWORD_HASH 더 이상 사용 안 함

Step 5: 메트릭 히스토리
  [ ] startMetricsCollector 앱 시작 시 호출됨
  [ ] 30초 후 metric_snapshots 테이블에 데이터 확인
  [ ] /api/system/history 응답 확인됨

Step 6: 설정 DB 전환
  [ ] src/lib/settings.ts 작성됨
  [ ] /api/settings GET/PUT 확인됨
  [ ] 설정 페이지 UI 연동 확인됨

배포
  [ ] deploy.sh에 data/ 보존 로직 추가됨
  [ ] 일별 백업 cron 설정됨
  [ ] WAL 체크포인트 정상 동작 확인됨
  [ ] DB 헬스체크 /api/system에 포함됨
```

---

## 8. 완료 후 기대 효과

| 항목 | 이전 | 이후 |
|-----|------|------|
| PM2 재시작 시 감사 로그 | 초기화됨 | 영구 보존 |
| 메트릭 히스토리 | 없음 | 최대 30일 |
| 사용자 관리 | 재배포 필요 | 대시보드에서 관리 |
| 설정 변경 | .env 수정 + 재시작 | 대시보드에서 즉시 |
| 데이터 탐색 | 없음 | 테이블 에디터 + SQL 에디터 |
| DB 크기 (예상 30일) | — | ~50MB (메트릭 + 로그) |
