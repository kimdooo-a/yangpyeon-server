# DB 스키마 설계 — SQLite + Drizzle ORM 데이터 모델

> Wave 4+5 설계 문서 02  
> 작성일: 2026-04-06  
> 작성 맥락: 양평 부엌 서버 대시보드 → Supabase-like 플랫폼 진화  
> DB: SQLite (better-sqlite3) + ORM: Drizzle ORM

---

## 목차

1. [테이블 목록 개요](#1-테이블-목록-개요)
2. [ERD (엔티티 관계 다이어그램)](#2-erd-엔티티-관계-다이어그램)
3. [테이블 상세 설계](#3-테이블-상세-설계)
   - 3.1 [users — 사용자](#31-users--사용자)
   - 3.2 [sessions — 세션](#32-sessions--세션)
   - 3.3 [audit_logs — 감사 로그](#33-audit_logs--감사-로그)
   - 3.4 [metric_snapshots — 시스템 메트릭 히스토리](#34-metric_snapshots--시스템-메트릭-히스토리)
   - 3.5 [settings — 글로벌 설정](#35-settings--글로벌-설정)
   - 3.6 [alerts — 알림 규칙](#36-alerts--알림-규칙)
   - 3.7 [alert_events — 알림 이벤트 이력](#37-alert_events--알림-이벤트-이력)
4. [Drizzle 전체 스키마 코드](#4-drizzle-전체-스키마-코드)
5. [관계(Relations) 정의](#5-관계relations-정의)
6. [마이그레이션 전략](#6-마이그레이션-전략)
7. [메트릭 보존 정책](#7-메트릭-보존-정책)
8. [SQLite 운영 가이드](#8-sqlite-운영-가이드)
9. [시드 데이터](#9-시드-데이터)
10. [쿼리 패턴 레퍼런스](#10-쿼리-패턴-레퍼런스)

---

## 1. 테이블 목록 개요

| 테이블 | 역할 | 예상 행 수 | 보존 기간 |
|--------|------|-----------|----------|
| `users` | 로그인 사용자 계정 | < 10 | 영구 |
| `sessions` | 로그인 세션 (JWT 추적) | < 100 | 24시간 (만료 시 삭제) |
| `audit_logs` | 관리자 액션 감사 기록 | 수만 건 | 90일 |
| `metric_snapshots` | 시스템 메트릭 히스토리 | 수십만 건 | 30일 (집계 후 축소) |
| `settings` | 키-값 형태 글로벌 설정 | < 100 | 영구 |
| `alerts` | 알림 규칙 정의 | < 50 | 영구 |
| `alert_events` | 알림 발생/해소 이력 | 수천 건 | 90일 |

---

## 2. ERD (엔티티 관계 다이어그램)

```
┌───────────────┐         ┌────────────────────┐
│   users       │         │   sessions         │
├───────────────┤         ├────────────────────┤
│ id (PK)       │──┐      │ id (PK)            │
│ username      │  │      │ user_id (FK)       │◄─┐
│ password_hash │  │      │ token              │  │
│ role          │  │      │ expires_at         │  │
│ created_at    │  │      │ ip_address         │  │
│ last_login    │  │      │ user_agent         │  │
│ is_active     │  │      │ created_at         │  │
└───────────────┘  │      └────────────────────┘  │
                   │                               │
                   └───────────────────────────────┘
                   │
                   │      ┌────────────────────┐
                   │      │   audit_logs       │
                   │      ├────────────────────┤
                   └─────►│ id (PK)            │
                          │ user_id (FK, NULL) │
                          │ action             │
                          │ target             │
                          │ details (JSON)     │
                          │ ip                 │
                          │ timestamp          │
                          └────────────────────┘

┌───────────────────────┐
│   metric_snapshots    │
├───────────────────────┤
│ id (PK)               │
│ cpu_percent           │  (독립 테이블 — 사용자 FK 없음)
│ memory_percent        │
│ memory_used_mb        │
│ memory_total_mb       │
│ disk_json             │
│ load_avg_json         │
│ network_json          │
│ timestamp             │
└───────────────────────┘

┌──────────────────┐
│   settings       │
├──────────────────┤
│ key (PK)         │  (독립 테이블)
│ value            │
│ description      │
│ updated_at       │
│ updated_by       │
└──────────────────┘

┌───────────────────┐         ┌───────────────────────┐
│   alerts          │         │   alert_events        │
├───────────────────┤         ├───────────────────────┤
│ id (PK)           │──┐      │ id (PK)               │
│ name              │  │      │ alert_id (FK)         │◄─┘
│ metric            │  └─────►│ value                 │
│ threshold         │         │ triggered_at          │
│ operator          │         │ resolved_at (NULL)    │
│ enabled           │         │ notified              │
│ created_by        │         └───────────────────────┘
│ created_at        │
│ updated_at        │
└───────────────────┘
```

---

## 3. 테이블 상세 설계

### 3.1 users — 사용자

#### 컬럼 정의

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | TEXT | PK, NOT NULL | UUID v4 |
| `username` | TEXT | UNIQUE, NOT NULL | 로그인 아이디 (영숫자 3~50자) |
| `password_hash` | TEXT | NOT NULL | bcrypt 해시 (rounds=12) |
| `role` | TEXT | NOT NULL, DEFAULT 'viewer' | admin / operator / viewer |
| `created_at` | INTEGER | NOT NULL | Unix timestamp (ms) |
| `last_login` | INTEGER | NULL | 마지막 로그인 Unix timestamp |
| `is_active` | INTEGER | NOT NULL, DEFAULT 1 | 1=활성, 0=비활성 (소프트 삭제) |

#### Drizzle 스키마

```typescript
// src/lib/db/schema.ts (users 부분)
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "operator", "viewer"] })
    .notNull()
    .default("viewer"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastLogin: integer("last_login", { mode: "timestamp_ms" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

#### 인덱스

```sql
-- 로그인 시 username으로 조회 (유일 인덱스는 자동 생성됨)
CREATE UNIQUE INDEX idx_users_username ON users(username);

-- 활성 사용자 목록 조회 최적화
CREATE INDEX idx_users_is_active ON users(is_active);
```

#### 예시 데이터

```json
{
  "id": "cm8x...",
  "username": "admin",
  "password_hash": "$2b$12$...",
  "role": "admin",
  "created_at": 1744041600000,
  "last_login": 1744041900000,
  "is_active": 1
}
```

#### CRUD 쿼리 예시

```typescript
// 사용자 조회 (로그인)
const user = await db
  .select()
  .from(users)
  .where(and(eq(users.username, username), eq(users.isActive, true)))
  .get();

// 사용자 생성
await db.insert(users).values({
  username: "operator1",
  passwordHash: await bcrypt.hash(password, 12),
  role: "operator",
});

// 마지막 로그인 갱신
await db
  .update(users)
  .set({ lastLogin: new Date() })
  .where(eq(users.id, userId));

// 비활성화 (소프트 삭제)
await db
  .update(users)
  .set({ isActive: false })
  .where(eq(users.id, userId));
```

---

### 3.2 sessions — 세션

#### 컬럼 정의

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | TEXT | PK, NOT NULL | UUID v4 |
| `user_id` | TEXT | FK(users.id), NOT NULL | 세션 소유자 |
| `token` | TEXT | UNIQUE, NOT NULL | JWT 토큰 해시 (SHA-256) |
| `expires_at` | INTEGER | NOT NULL | 만료 Unix timestamp (ms) |
| `ip_address` | TEXT | NULL | 로그인 IP |
| `user_agent` | TEXT | NULL | 브라우저 정보 |
| `created_at` | INTEGER | NOT NULL | 생성 시각 |

#### Drizzle 스키마

```typescript
export const sessions = sqliteTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

#### 인덱스

```sql
-- 토큰으로 세션 조회 (JWT 검증 시 참조)
CREATE UNIQUE INDEX idx_sessions_token ON sessions(token);

-- 사용자별 세션 목록 (관리자가 세션 강제 만료 시)
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- 만료된 세션 정리 (정기 삭제 쿼리)
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

#### 예시 데이터

```json
{
  "id": "cm9y...",
  "user_id": "cm8x...",
  "token": "sha256:a3f8...",
  "expires_at": 1744128000000,
  "ip_address": "1.2.3.4",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0...)",
  "created_at": 1744041600000
}
```

#### CRUD 쿼리 예시

```typescript
// 세션 생성 (로그인 성공 시)
import crypto from "crypto";

const tokenHash = crypto.createHash("sha256").update(jwtToken).digest("hex");

await db.insert(sessions).values({
  userId: user.id,
  token: `sha256:${tokenHash}`,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  ipAddress: clientIp,
  userAgent: request.headers.get("user-agent") ?? undefined,
});

// 세션 검증 (미들웨어에서 JWT 외 DB 조회 추가 시)
const session = await db
  .select()
  .from(sessions)
  .where(
    and(
      eq(sessions.token, `sha256:${tokenHash}`),
      gt(sessions.expiresAt, new Date()),
    ),
  )
  .get();

// 만료 세션 정리 (cron 또는 로그인 시 트리거)
await db
  .delete(sessions)
  .where(lt(sessions.expiresAt, new Date()));

// 사용자 전체 세션 강제 만료 (비밀번호 변경 시)
await db
  .delete(sessions)
  .where(eq(sessions.userId, userId));
```

---

### 3.3 audit_logs — 감사 로그

#### 컬럼 정의

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK AUTOINCREMENT | 순차 ID |
| `user_id` | TEXT | FK(users.id), NULL | 액션 주체 (시스템 작업은 NULL) |
| `action` | TEXT | NOT NULL | 액션 코드 (아래 열거형 참조) |
| `target` | TEXT | NULL | 대상 리소스 식별자 |
| `details` | TEXT | NULL | JSON 문자열 (상세 정보) |
| `ip` | TEXT | NULL | 요청 IP |
| `status` | INTEGER | NULL | HTTP 상태 코드 |
| `timestamp` | INTEGER | NOT NULL, INDEX | 발생 시각 Unix timestamp (ms) |

#### 액션 코드 열거형

```typescript
export const AUDIT_ACTIONS = {
  // 인증
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  
  // PM2 제어
  PM2_RESTART: "PM2_RESTART",
  PM2_STOP: "PM2_STOP",
  PM2_DELETE: "PM2_DELETE",
  PM2_RELOAD: "PM2_RELOAD",
  
  // 설정
  SETTING_CHANGED: "SETTING_CHANGED",
  
  // 알림
  ALERT_CREATED: "ALERT_CREATED",
  ALERT_UPDATED: "ALERT_UPDATED",
  ALERT_DELETED: "ALERT_DELETED",
  
  // 보안
  RATE_LIMITED: "RATE_LIMITED",
  CORS_BLOCKED: "CORS_BLOCKED",
  CSRF_BLOCKED: "CSRF_BLOCKED",
  UNAUTHORIZED: "UNAUTHORIZED",
  
  // 시스템
  SERVER_ERROR: "SERVER_ERROR",
  DB_QUERY_EXECUTED: "DB_QUERY_EXECUTED",  // SQL 에디터
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];
```

#### Drizzle 스키마

```typescript
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  details: text("details"),  // JSON.stringify()로 저장
  ip: text("ip"),
  status: integer("status"),
  timestamp: integer("timestamp", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
```

#### 인덱스

```sql
-- 시간 범위 쿼리 (가장 빈번한 패턴)
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- 사용자별 액션 조회
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id, timestamp DESC);

-- 액션 유형별 필터
CREATE INDEX idx_audit_logs_action ON audit_logs(action, timestamp DESC);
```

#### 예시 데이터

```json
{
  "id": 1234,
  "user_id": "cm8x...",
  "action": "PM2_RESTART",
  "target": "dashboard",
  "details": "{\"pid\":1234,\"before\":\"online\",\"after\":\"online\"}",
  "ip": "1.2.3.4",
  "status": 200,
  "timestamp": 1744041900000
}
```

#### CRUD 쿼리 예시

```typescript
// 로그 기록 (AuditService.log)
await db.insert(auditLogs).values({
  userId: context.userId ?? null,
  action: "PM2_RESTART",
  target: processId,
  details: JSON.stringify({ before: prevStatus, after: newStatus }),
  ip: context.ip,
  status: 200,
});

// 시간 범위 + 액션 필터 조회 (감사 로그 페이지)
const logs = await db
  .select({
    id: auditLogs.id,
    action: auditLogs.action,
    target: auditLogs.target,
    ip: auditLogs.ip,
    timestamp: auditLogs.timestamp,
    username: users.username,
  })
  .from(auditLogs)
  .leftJoin(users, eq(auditLogs.userId, users.id))
  .where(
    and(
      gte(auditLogs.timestamp, from),
      lte(auditLogs.timestamp, to),
      action ? eq(auditLogs.action, action) : undefined,
    ),
  )
  .orderBy(desc(auditLogs.timestamp))
  .limit(100)
  .offset(page * 100);

// 90일 이전 로그 삭제 (정기 정리)
const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
await db.delete(auditLogs).where(lt(auditLogs.timestamp, cutoff));
```

---

### 3.4 metric_snapshots — 시스템 메트릭 히스토리

#### 컬럼 정의

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK AUTOINCREMENT | 순차 ID |
| `cpu_percent` | REAL | NOT NULL | CPU 사용률 (0.0 ~ 100.0) |
| `memory_percent` | REAL | NOT NULL | 메모리 사용률 (0.0 ~ 100.0) |
| `memory_used_mb` | INTEGER | NOT NULL | 메모리 사용량 (MB) |
| `memory_total_mb` | INTEGER | NOT NULL | 전체 메모리 (MB) |
| `disk_json` | TEXT | NULL | 디스크 정보 JSON 배열 |
| `load_avg_json` | TEXT | NULL | 부하 평균 JSON (1m, 5m, 15m) |
| `network_json` | TEXT | NULL | 네트워크 I/O JSON |
| `timestamp` | INTEGER | NOT NULL, INDEX | 수집 시각 Unix timestamp (ms) |

#### JSON 컬럼 구조

```typescript
// disk_json 구조
interface DiskInfo {
  mount: string;       // "/" | "/mnt/data" 등
  total_gb: number;    // 전체 용량 (GB)
  used_gb: number;     // 사용 용량 (GB)
  percent: number;     // 사용률
}
// 저장 예: '[{"mount":"/","total_gb":500,"used_gb":120,"percent":24}]'

// load_avg_json 구조
interface LoadAvg {
  m1: number;    // 1분 평균
  m5: number;    // 5분 평균
  m15: number;   // 15분 평균
}
// 저장 예: '{"m1":0.12,"m5":0.08,"m15":0.05}'

// network_json 구조
interface NetworkIO {
  interface: string;   // "eth0" | "ens3" 등
  rx_kb: number;       // 수신 (KB, 현재 측정 주기)
  tx_kb: number;       // 송신 (KB, 현재 측정 주기)
}
// 저장 예: '[{"interface":"eth0","rx_kb":12.4,"tx_kb":3.1}]'
```

#### Drizzle 스키마

```typescript
export const metricSnapshots = sqliteTable("metric_snapshots", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  cpuPercent: real("cpu_percent").notNull(),
  memoryPercent: real("memory_percent").notNull(),
  memoryUsedMb: integer("memory_used_mb").notNull(),
  memoryTotalMb: integer("memory_total_mb").notNull(),
  diskJson: text("disk_json"),
  loadAvgJson: text("load_avg_json"),
  networkJson: text("network_json"),
  timestamp: integer("timestamp", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type MetricSnapshot = typeof metricSnapshots.$inferSelect;
export type NewMetricSnapshot = typeof metricSnapshots.$inferInsert;
```

#### 인덱스

```sql
-- 시간 범위 쿼리 (차트 데이터 조회)
CREATE INDEX idx_metric_snapshots_timestamp ON metric_snapshots(timestamp DESC);
```

#### CRUD 쿼리 예시

```typescript
// 스냅샷 저장 (10초마다 SSE 핸들러에서 호출)
await db.insert(metricSnapshots).values({
  cpuPercent: metrics.cpu,
  memoryPercent: metrics.memory.percent,
  memoryUsedMb: Math.round(metrics.memory.used / 1024 / 1024),
  memoryTotalMb: Math.round(metrics.memory.total / 1024 / 1024),
  diskJson: JSON.stringify(metrics.disks),
  loadAvgJson: JSON.stringify(metrics.loadAvg),
  networkJson: JSON.stringify(metrics.network),
});

// 최근 1시간 차트 데이터 조회 (1분 평균으로 다운샘플)
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const rawData = await db
  .select({
    cpuPercent: metricSnapshots.cpuPercent,
    memoryPercent: metricSnapshots.memoryPercent,
    timestamp: metricSnapshots.timestamp,
  })
  .from(metricSnapshots)
  .where(gte(metricSnapshots.timestamp, oneHourAgo))
  .orderBy(asc(metricSnapshots.timestamp));

// 특정 시간 범위의 분별 평균 (집계 쿼리 — SQL 직접 사용)
const sqlite = db.$client;
const avgData = sqlite.prepare(`
  SELECT
    (timestamp / 60000) * 60000 AS minute_bucket,
    AVG(cpu_percent) AS avg_cpu,
    AVG(memory_percent) AS avg_memory,
    COUNT(*) AS sample_count
  FROM metric_snapshots
  WHERE timestamp BETWEEN ? AND ?
  GROUP BY minute_bucket
  ORDER BY minute_bucket ASC
`).all(from.getTime(), to.getTime());
```

---

### 3.5 settings — 글로벌 설정

#### 컬럼 정의

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `key` | TEXT | PK | 설정 키 (점 구분, 예: `alert.cpu.threshold`) |
| `value` | TEXT | NOT NULL | 설정 값 (항상 문자열로 저장) |
| `description` | TEXT | NULL | 설정 항목 설명 |
| `updated_at` | INTEGER | NOT NULL | 마지막 수정 시각 |
| `updated_by` | TEXT | FK(users.id), NULL | 마지막 수정 사용자 |

#### 설정 키 컨벤션

```typescript
// 표준 설정 키 목록
export const SETTING_KEYS = {
  // 알림 임계값
  ALERT_CPU_THRESHOLD: "alert.cpu.threshold",         // 기본: "80"
  ALERT_MEMORY_THRESHOLD: "alert.memory.threshold",   // 기본: "85"
  ALERT_DISK_THRESHOLD: "alert.disk.threshold",       // 기본: "90"
  
  // 메트릭 수집
  METRIC_INTERVAL_SEC: "metric.interval.seconds",     // 기본: "10"
  METRIC_RETENTION_DAYS: "metric.retention.days",     // 기본: "30"
  
  // 보안
  SESSION_TTL_HOURS: "session.ttl.hours",             // 기본: "24"
  RATE_LIMIT_LOGIN: "rate_limit.login.max",           // 기본: "5"
  
  // 대시보드
  DASHBOARD_TITLE: "dashboard.title",                 // 기본: "양평 부엌 서버"
  DASHBOARD_REFRESH_SEC: "dashboard.refresh.seconds", // 기본: "10"
} as const;
```

#### Drizzle 스키마

```typescript
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
```

#### CRUD 쿼리 예시

```typescript
// 설정값 조회 (기본값 fallback 포함)
async function getSetting(key: string, defaultValue: string): Promise<string> {
  const row = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? defaultValue;
}

// 설정값 저장 (upsert)
await db
  .insert(settings)
  .values({ key, value, updatedBy: userId })
  .onConflictDoUpdate({
    target: settings.key,
    set: {
      value: sql`excluded.value`,
      updatedAt: new Date(),
      updatedBy: userId,
    },
  });

// 모든 설정 목록 조회 (설정 페이지)
const allSettings = await db
  .select()
  .from(settings)
  .orderBy(asc(settings.key));
```

---

### 3.6 alerts — 알림 규칙

#### 컬럼 정의

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK AUTOINCREMENT | 순차 ID |
| `name` | TEXT | NOT NULL | 알림 이름 (예: "CPU 과부하") |
| `metric` | TEXT | NOT NULL | 대상 메트릭 코드 |
| `threshold` | REAL | NOT NULL | 임계값 |
| `operator` | TEXT | NOT NULL | 비교 연산자 |
| `enabled` | INTEGER | NOT NULL, DEFAULT 1 | 1=활성, 0=비활성 |
| `created_by` | TEXT | FK(users.id), NULL | 생성자 |
| `created_at` | INTEGER | NOT NULL | 생성 시각 |
| `updated_at` | INTEGER | NOT NULL | 수정 시각 |

#### 메트릭 코드 및 연산자

```typescript
export const ALERT_METRICS = {
  CPU_PERCENT: "cpu_percent",
  MEMORY_PERCENT: "memory_percent",
  DISK_PERCENT: "disk_percent",          // 특정 마운트 포인트
  LOAD_AVG_1M: "load_avg_1m",
  LOAD_AVG_5M: "load_avg_5m",
} as const;

export const ALERT_OPERATORS = {
  GT: "gt",   // >
  GTE: "gte", // >=
  LT: "lt",   // <
  LTE: "lte", // <=
  EQ: "eq",   // ==
} as const;
```

#### Drizzle 스키마

```typescript
export const alerts = sqliteTable("alerts", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  metric: text("metric").notNull(),
  threshold: real("threshold").notNull(),
  operator: text("operator", { enum: ["gt", "gte", "lt", "lte", "eq"] })
    .notNull()
    .default("gte"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
```

#### CRUD 쿼리 예시

```typescript
// 활성 알림 규칙 조회 (SSE 메트릭 수집 시 매번 평가)
const activeAlerts = await db
  .select()
  .from(alerts)
  .where(eq(alerts.enabled, true));

// 알림 규칙 평가 (AlertService.evaluate)
function evaluateAlert(alert: Alert, currentValue: number): boolean {
  switch (alert.operator) {
    case "gt":  return currentValue > alert.threshold;
    case "gte": return currentValue >= alert.threshold;
    case "lt":  return currentValue < alert.threshold;
    case "lte": return currentValue <= alert.threshold;
    case "eq":  return currentValue === alert.threshold;
    default:    return false;
  }
}

// 알림 규칙 생성
await db.insert(alerts).values({
  name: "CPU 과부하",
  metric: "cpu_percent",
  threshold: 80,
  operator: "gte",
  enabled: true,
  createdBy: userId,
});
```

---

### 3.7 alert_events — 알림 이벤트 이력

#### 컬럼 정의

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK AUTOINCREMENT | 순차 ID |
| `alert_id` | INTEGER | FK(alerts.id), NOT NULL | 연관 알림 규칙 |
| `value` | REAL | NOT NULL | 임계값 초과 시점의 실제 값 |
| `triggered_at` | INTEGER | NOT NULL | 알림 발생 시각 |
| `resolved_at` | INTEGER | NULL | 알림 해소 시각 (NULL = 미해소) |
| `notified` | INTEGER | NOT NULL, DEFAULT 0 | 알림 전송 여부 (향후 확장) |

#### Drizzle 스키마

```typescript
export const alertEvents = sqliteTable("alert_events", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  alertId: integer("alert_id")
    .notNull()
    .references(() => alerts.id, { onDelete: "cascade" }),
  value: real("value").notNull(),
  triggeredAt: integer("triggered_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  notified: integer("notified", { mode: "boolean" }).notNull().default(false),
});

export type AlertEvent = typeof alertEvents.$inferSelect;
export type NewAlertEvent = typeof alertEvents.$inferInsert;
```

#### 인덱스

```sql
-- 미해소 알림 이벤트 조회 (대시보드 알림 패널)
CREATE INDEX idx_alert_events_resolved_at ON alert_events(resolved_at)
  WHERE resolved_at IS NULL;

-- 알림 규칙별 이벤트 이력
CREATE INDEX idx_alert_events_alert_id ON alert_events(alert_id, triggered_at DESC);
```

#### CRUD 쿼리 예시

```typescript
// 알림 발생 기록
await db.insert(alertEvents).values({
  alertId: alert.id,
  value: currentValue,
});

// 알림 해소 처리
await db
  .update(alertEvents)
  .set({ resolvedAt: new Date() })
  .where(
    and(
      eq(alertEvents.alertId, alertId),
      isNull(alertEvents.resolvedAt),
    ),
  );

// 미해소 알림 목록 (대시보드 배너용)
const activeEvents = await db
  .select({
    eventId: alertEvents.id,
    alertName: alerts.name,
    metric: alerts.metric,
    threshold: alerts.threshold,
    value: alertEvents.value,
    triggeredAt: alertEvents.triggeredAt,
  })
  .from(alertEvents)
  .innerJoin(alerts, eq(alertEvents.alertId, alerts.id))
  .where(isNull(alertEvents.resolvedAt))
  .orderBy(desc(alertEvents.triggeredAt));

// 90일 이전 해소된 이벤트 삭제
const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
await db
  .delete(alertEvents)
  .where(
    and(
      isNotNull(alertEvents.resolvedAt),
      lt(alertEvents.resolvedAt, cutoff),
    ),
  );
```

---

## 4. Drizzle 전체 스키마 코드

```typescript
// src/lib/db/schema.ts
// 이 파일이 DB 스키마의 단일 진실 소스(Single Source of Truth)

import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────
// users — 사용자 계정
// ─────────────────────────────────────────
export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "operator", "viewer"] })
      .notNull()
      .default("viewer"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastLogin: integer("last_login", { mode: "timestamp_ms" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [
    uniqueIndex("idx_users_username").on(t.username),
    index("idx_users_is_active").on(t.isActive),
  ],
);

// ─────────────────────────────────────────
// sessions — 로그인 세션
// ─────────────────────────────────────────
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("idx_sessions_token").on(t.token),
    index("idx_sessions_user_id").on(t.userId),
    index("idx_sessions_expires_at").on(t.expiresAt),
  ],
);

// ─────────────────────────────────────────
// audit_logs — 감사 로그
// ─────────────────────────────────────────
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    target: text("target"),
    details: text("details"),
    ip: text("ip"),
    status: integer("status"),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_audit_logs_timestamp").on(t.timestamp),
    index("idx_audit_logs_user_id").on(t.userId, t.timestamp),
    index("idx_audit_logs_action").on(t.action, t.timestamp),
  ],
);

// ─────────────────────────────────────────
// metric_snapshots — 시스템 메트릭 히스토리
// ─────────────────────────────────────────
export const metricSnapshots = sqliteTable(
  "metric_snapshots",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    cpuPercent: real("cpu_percent").notNull(),
    memoryPercent: real("memory_percent").notNull(),
    memoryUsedMb: integer("memory_used_mb").notNull(),
    memoryTotalMb: integer("memory_total_mb").notNull(),
    diskJson: text("disk_json"),
    loadAvgJson: text("load_avg_json"),
    networkJson: text("network_json"),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_metric_snapshots_timestamp").on(t.timestamp)],
);

// ─────────────────────────────────────────
// settings — 글로벌 설정 (키-값)
// ─────────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

// ─────────────────────────────────────────
// alerts — 알림 규칙
// ─────────────────────────────────────────
export const alerts = sqliteTable("alerts", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  metric: text("metric").notNull(),
  threshold: real("threshold").notNull(),
  operator: text("operator", { enum: ["gt", "gte", "lt", "lte", "eq"] })
    .notNull()
    .default("gte"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─────────────────────────────────────────
// alert_events — 알림 이벤트 이력
// ─────────────────────────────────────────
export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    alertId: integer("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    value: real("value").notNull(),
    triggeredAt: integer("triggered_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    notified: integer("notified", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("idx_alert_events_alert_id").on(t.alertId, t.triggeredAt),
    index("idx_alert_events_resolved_at").on(t.resolvedAt),
  ],
);

// ─────────────────────────────────────────
// 타입 추출
// ─────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type MetricSnapshot = typeof metricSnapshots.$inferSelect;
export type NewMetricSnapshot = typeof metricSnapshots.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type AlertEvent = typeof alertEvents.$inferSelect;
export type NewAlertEvent = typeof alertEvents.$inferInsert;
```

---

## 5. 관계(Relations) 정의

```typescript
// src/lib/db/relations.ts
import { relations } from "drizzle-orm";
import {
  users,
  sessions,
  auditLogs,
  settings,
  alerts,
  alertEvents,
} from "./schema";

// users → sessions (1:N)
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  auditLogs: many(auditLogs),
  createdAlerts: many(alerts),
}));

// sessions → users (N:1)
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// auditLogs → users (N:1, nullable)
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// alerts → users (N:1, nullable) + alertEvents (1:N)
export const alertsRelations = relations(alerts, ({ one, many }) => ({
  creator: one(users, {
    fields: [alerts.createdBy],
    references: [users.id],
  }),
  events: many(alertEvents),
}));

// alertEvents → alerts (N:1)
export const alertEventsRelations = relations(alertEvents, ({ one }) => ({
  alert: one(alerts, {
    fields: [alertEvents.alertId],
    references: [alerts.id],
  }),
}));
```

---

## 6. 마이그레이션 전략

### 6.1 Drizzle Kit 설정

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import path from "path";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./data/dashboard.db",
  },
  verbose: true,
  strict: true,
});
```

### 6.2 마이그레이션 워크플로우

```bash
# 1. 스키마 변경 후 마이그레이션 파일 생성
npx drizzle-kit generate

# 2. 마이그레이션 미리보기 (실제 적용 전 검토)
npx drizzle-kit migrate --dry-run

# 3. 마이그레이션 적용
npx drizzle-kit migrate

# 4. 현재 DB 상태 확인
npx drizzle-kit studio  # 개발 환경에서 브라우저 GUI 열기
```

### 6.3 마이그레이션 파일 구조

```
src/lib/db/migrations/
├── 0001_initial.sql           ← 초기 스키마 (모든 테이블)
├── 0002_add_alert_events.sql  ← 예: 향후 alert_events 추가
├── 0003_settings_desc.sql     ← 예: settings.description 컬럼 추가
└── meta/
    ├── _journal.json          ← 마이그레이션 적용 이력
    └── 0001_snapshot.json     ← 스키마 스냅샷
```

### 6.4 프로그래밍 방식 마이그레이션 적용

```typescript
// src/lib/db/migrate.ts
// PM2 시작 시 또는 배포 스크립트에서 호출
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";
import path from "path";

export function runMigrations() {
  console.log("DB 마이그레이션 시작...");
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/lib/db/migrations"),
  });
  console.log("DB 마이그레이션 완료");
}
```

### 6.5 SQLite 스키마 변경 제약 대응

SQLite는 `ALTER TABLE ... DROP COLUMN`, `ALTER TABLE ... RENAME COLUMN` 등 일부 DDL이 제한적이다. 이를 우회하는 방법:

```sql
-- 컬럼 삭제가 필요한 경우 (SQLite 3.35 미만):
-- 1. 새 테이블 생성
CREATE TABLE users_new AS SELECT id, username, password_hash FROM users;
-- 2. 기존 테이블 삭제
DROP TABLE users;
-- 3. 이름 변경
ALTER TABLE users_new RENAME TO users;
-- Drizzle Kit이 자동으로 이 패턴을 생성해줌
```

---

## 7. 메트릭 보존 정책

### 7.1 시간대별 보존 정책

| 시간 범위 | 보존 방식 | 샘플 간격 | 예상 행 수 |
|-----------|-----------|-----------|-----------|
| 0 ~ 1시간 | 원본 | 10초 | 360행 |
| 1시간 ~ 1일 | 1분 평균 집계 | 1분 | 1,380행 |
| 1일 ~ 7일 | 5분 평균 집계 | 5분 | 1,728행 |
| 7일 ~ 30일 | 1시간 평균 집계 | 1시간 | 552행 |
| 30일 이상 | 삭제 | — | 0행 |

**총 최대 행 수**: 약 4,020행 → SQLite에서 무시할 수준

### 7.2 집계 쿼리 (다운샘플링)

```typescript
// src/lib/db/queries/metrics.ts

// 1분 평균으로 집계 (1시간 ~ 1일 범위)
export function aggregateToMinutes(
  fromMs: number,
  toMs: number,
): MetricAggregated[] {
  const sqlite = db.$client;
  return sqlite
    .prepare(
      `
    SELECT
      (timestamp / 60000) * 60000 AS bucket,
      AVG(cpu_percent) AS cpu_percent,
      AVG(memory_percent) AS memory_percent,
      AVG(memory_used_mb) AS memory_used_mb,
      MAX(memory_total_mb) AS memory_total_mb,
      COUNT(*) AS samples
    FROM metric_snapshots
    WHERE timestamp BETWEEN ? AND ?
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
    )
    .all(fromMs, toMs) as MetricAggregated[];
}

// 5분 평균으로 집계 (1일 ~ 7일 범위)
export function aggregateToFiveMinutes(
  fromMs: number,
  toMs: number,
): MetricAggregated[] {
  const sqlite = db.$client;
  return sqlite
    .prepare(
      `
    SELECT
      (timestamp / 300000) * 300000 AS bucket,
      AVG(cpu_percent) AS cpu_percent,
      AVG(memory_percent) AS memory_percent,
      COUNT(*) AS samples
    FROM metric_snapshots
    WHERE timestamp BETWEEN ? AND ?
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
    )
    .all(fromMs, toMs) as MetricAggregated[];
}
```

### 7.3 자동 정리 전략

```typescript
// src/lib/services/system.service.ts 내부 또는 별도 cron 함수

export async function cleanupOldMetrics() {
  const sqlite = db.$client;
  const now = Date.now();
  
  // 1. 30일 이전 원본 데이터 삭제
  const cutoff30d = now - 30 * 24 * 60 * 60 * 1000;
  sqlite.prepare("DELETE FROM metric_snapshots WHERE timestamp < ?").run(cutoff30d);
  
  // 2. 7일 이전 원본 → 1시간 평균 집계 테이블로 이동 (향후 구현 시)
  // 현재는 단순 삭제 정책 유지
  
  // 3. VACUUM (단편화 제거 — 주 1회)
  // 주의: VACUUM은 DB를 잠그므로 트래픽이 없는 새벽 시간에 실행
  // sqlite.pragma("incremental_vacuum(100)");  // 점진적 VACUUM 권장
}

// PM2에서 메트릭 수집 시 주기적으로 호출 (1000회마다 정리)
let collectCount = 0;
export async function collectSnapshot() {
  // ... 메트릭 수집 로직 ...
  
  collectCount++;
  if (collectCount % 1000 === 0) {
    await cleanupOldMetrics();
  }
}
```

### 7.4 메트릭 조회 API 설계

```typescript
// GET /api/system/history?range=1h|24h|7d|30d
export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range") ?? "1h";
  const now = Date.now();
  
  let from: number;
  let aggregateFn: Function;
  
  switch (range) {
    case "1h":
      from = now - 60 * 60 * 1000;
      aggregateFn = getRawMetrics;  // 원본 (10초 간격)
      break;
    case "24h":
      from = now - 24 * 60 * 60 * 1000;
      aggregateFn = aggregateToMinutes;  // 1분 평균
      break;
    case "7d":
      from = now - 7 * 24 * 60 * 60 * 1000;
      aggregateFn = aggregateToFiveMinutes;  // 5분 평균
      break;
    case "30d":
      from = now - 30 * 24 * 60 * 60 * 1000;
      aggregateFn = aggregateToHours;  // 1시간 평균
      break;
    default:
      return Response.json({ error: "지원하지 않는 범위" }, { status: 400 });
  }
  
  const data = aggregateFn(from, now);
  return Response.json({ range, data, count: data.length });
}
```

---

## 8. SQLite 운영 가이드

### 8.1 WAL 모드 + 성능 Pragma

```typescript
// 서버 시작 시 1회 설정 (src/lib/db/index.ts)
sqlite.pragma("journal_mode = WAL");
// WAL: Write-Ahead Log — 읽기와 쓰기 동시 처리 가능, 성능 향상

sqlite.pragma("synchronous = NORMAL");
// FULL 대비 성능 향상, WAL 모드에서는 안전성 손실 없음

sqlite.pragma("cache_size = -32000");
// 32MB 페이지 캐시 (음수 = KB 단위)

sqlite.pragma("temp_store = MEMORY");
// 임시 테이블을 메모리에 저장 (정렬, 집계 성능 향상)

sqlite.pragma("mmap_size = 268435456");
// 256MB mmap — 파일 I/O 대신 메모리 맵 사용

sqlite.pragma("foreign_keys = ON");
// FK 제약 활성화 (SQLite 기본값 OFF)

sqlite.pragma("busy_timeout = 5000");
// DB 잠금 대기 시간 5초 (PM2 재시작 중 충돌 방지)
```

### 8.2 파일 크기 관리

```bash
# DB 파일 크기 확인
ls -lh data/dashboard.db

# SQLite 내부에서 페이지 수 확인
sqlite3 data/dashboard.db "PRAGMA page_count; PRAGMA page_size;"

# 단편화 확인
sqlite3 data/dashboard.db "PRAGMA freelist_count;"

# VACUUM 실행 (단편화 제거, DB 압축)
# 주의: 실행 중 DB 잠금 발생 — 사용자가 없을 때 실행
sqlite3 data/dashboard.db "VACUUM;"

# WAL 파일 강제 체크포인트 (WAL → 메인 DB 병합)
sqlite3 data/dashboard.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### 8.3 백업 스크립트

```bash
#!/bin/bash
# scripts/backup-db.sh
# 권장 실행 주기: cron 으로 매일 새벽 3시

set -e

BACKUP_DIR="$HOME/backups/dashboard-db"
DB_FILE="$HOME/projects/luckystyle4u-server/data/dashboard.db"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/dashboard_$DATE.db"

mkdir -p "$BACKUP_DIR"

# SQLite Online Backup API 사용 (잠금 없이 복사)
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

# 30일 이전 백업 삭제 (디스크 관리)
find "$BACKUP_DIR" -name "dashboard_*.db" -mtime +30 -delete

echo "백업 완료: $BACKUP_FILE"
echo "백업 크기: $(du -sh "$BACKUP_FILE" | cut -f1)"
```

```bash
# crontab 등록 (매일 새벽 3시)
# crontab -e 로 편집 후 아래 추가:
0 3 * * * /home/user/projects/luckystyle4u-server/scripts/backup-db.sh >> /home/user/logs/backup.log 2>&1
```

### 8.4 DB 상태 확인 쿼리

```sql
-- 테이블별 행 수 확인
SELECT name, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=m.name) as exists
FROM (
  SELECT 'users' as name UNION SELECT 'sessions' UNION SELECT 'audit_logs'
  UNION SELECT 'metric_snapshots' UNION SELECT 'settings'
  UNION SELECT 'alerts' UNION SELECT 'alert_events'
) m;

-- 실제 행 수
SELECT 'users' as tbl, COUNT(*) as cnt FROM users
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs
UNION ALL SELECT 'metric_snapshots', COUNT(*) FROM metric_snapshots
UNION ALL SELECT 'settings', COUNT(*) FROM settings
UNION ALL SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL SELECT 'alert_events', COUNT(*) FROM alert_events;

-- DB 파일 크기 (페이지 단위)
SELECT page_count * page_size / 1024.0 / 1024.0 AS size_mb
FROM pragma_page_count(), pragma_page_size();

-- 인덱스 사용 분석 (쿼리 최적화 확인)
EXPLAIN QUERY PLAN
SELECT * FROM audit_logs WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 100;
```

### 8.5 복구 절차

```bash
# 1. 현재 DB 손상 확인
sqlite3 data/dashboard.db "PRAGMA integrity_check;"

# 2. 손상 시 백업에서 복원
cp ~/backups/dashboard-db/dashboard_YYYYMMDD_HHMMSS.db data/dashboard.db

# 3. PM2 재시작
pm2 restart dashboard

# 4. 마이그레이션 재적용 (복원된 DB가 오래된 경우)
npx drizzle-kit migrate
```

---

## 9. 시드 데이터

### 9.1 초기 데이터 스크립트

```typescript
// src/lib/db/seed.ts
// 최초 배포 시 또는 DB 초기화 시 실행

import { db } from "./index";
import { users, settings, alerts } from "./schema";
import bcrypt from "bcrypt";
import { createId } from "@paralleldrive/cuid2";

export async function seed() {
  console.log("시드 데이터 삽입 시작...");
  
  // 1. 기본 admin 사용자
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? "changeme123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  
  await db
    .insert(users)
    .values({
      id: createId(),
      username: "admin",
      passwordHash,
      role: "admin",
    })
    .onConflictDoNothing();
  
  console.log(`admin 사용자 생성 완료 (비밀번호: ${adminPassword})`);
  console.log("⚠️  반드시 로그인 후 비밀번호를 변경하세요!");
  
  // 2. 기본 설정값
  const defaultSettings = [
    { key: "dashboard.title", value: "양평 부엌 서버", description: "대시보드 제목" },
    { key: "metric.interval.seconds", value: "10", description: "메트릭 수집 간격 (초)" },
    { key: "metric.retention.days", value: "30", description: "메트릭 보존 기간 (일)" },
    { key: "session.ttl.hours", value: "24", description: "세션 유효 시간 (시간)" },
    { key: "alert.cpu.threshold", value: "80", description: "CPU 알림 임계값 (%)" },
    { key: "alert.memory.threshold", value: "85", description: "메모리 알림 임계값 (%)" },
    { key: "alert.disk.threshold", value: "90", description: "디스크 알림 임계값 (%)" },
    { key: "rate_limit.login.max", value: "5", description: "로그인 시도 최대 횟수 (15분)" },
  ];
  
  for (const setting of defaultSettings) {
    await db
      .insert(settings)
      .values(setting)
      .onConflictDoNothing();
  }
  
  console.log(`설정 ${defaultSettings.length}개 삽입 완료`);
  
  // 3. 기본 알림 규칙
  const adminUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, "admin"))
    .get();
  
  if (adminUser) {
    const defaultAlerts = [
      {
        name: "CPU 과부하",
        metric: "cpu_percent",
        threshold: 80,
        operator: "gte" as const,
        createdBy: adminUser.id,
      },
      {
        name: "메모리 부족",
        metric: "memory_percent",
        threshold: 85,
        operator: "gte" as const,
        createdBy: adminUser.id,
      },
      {
        name: "디스크 포화",
        metric: "disk_percent",
        threshold: 90,
        operator: "gte" as const,
        createdBy: adminUser.id,
      },
    ];
    
    for (const alert of defaultAlerts) {
      await db.insert(alerts).values(alert).onConflictDoNothing();
    }
    
    console.log(`알림 규칙 ${defaultAlerts.length}개 삽입 완료`);
  }
  
  console.log("시드 데이터 삽입 완료");
}
```

### 9.2 시드 실행

```bash
# package.json scripts에 추가
# "db:seed": "tsx src/lib/db/seed.ts"

# 환경변수와 함께 실행
ADMIN_INITIAL_PASSWORD=mySecurePassword123! npm run db:seed
```

---

## 10. 쿼리 패턴 레퍼런스

### 10.1 페이지네이션 패턴

```typescript
// 커서 기반 페이지네이션 (감사 로그 등 시계열 데이터)
async function getAuditLogPage(cursor?: number, limit = 50) {
  const query = db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(limit + 1);  // +1로 다음 페이지 존재 여부 확인
  
  if (cursor) {
    query.where(lt(auditLogs.id, cursor));
  }
  
  const rows = await query;
  const hasMore = rows.length > limit;
  
  return {
    data: rows.slice(0, limit),
    nextCursor: hasMore ? rows[limit - 1].id : null,
    hasMore,
  };
}
```

### 10.2 트랜잭션 패턴

```typescript
// 알림 이벤트 발생 + 감사 로그 동시 기록 (원자적)
async function triggerAlert(alertId: number, value: number, userId?: string) {
  return db.transaction((tx) => {
    const event = tx.insert(alertEvents).values({
      alertId,
      value,
    }).returning().get();
    
    tx.insert(auditLogs).values({
      userId: userId ?? null,
      action: "ALERT_TRIGGERED",
      target: String(alertId),
      details: JSON.stringify({ value, eventId: event.id }),
    });
    
    return event;
  });
}
```

### 10.3 집계 + 조인 패턴

```typescript
// 사용자별 감사 로그 통계 (관리자 대시보드용)
const userStats = await db
  .select({
    userId: users.id,
    username: users.username,
    totalActions: count(auditLogs.id),
    lastAction: max(auditLogs.timestamp),
  })
  .from(users)
  .leftJoin(auditLogs, eq(users.id, auditLogs.userId))
  .where(eq(users.isActive, true))
  .groupBy(users.id)
  .orderBy(desc(count(auditLogs.id)));
```

### 10.4 JSON 컬럼 파싱 유틸리티

```typescript
// src/lib/utils/db-json.ts
export function parseDiskJson(json: string | null): DiskInfo[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as DiskInfo[];
  } catch {
    return [];
  }
}

export function parseLoadAvgJson(json: string | null): LoadAvg | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as LoadAvg;
  } catch {
    return null;
  }
}
```

---

*이 문서는 Wave 4+5 설계 문서의 일부입니다.*  
*관련 문서: `01-system-architecture.md` (시스템 아키텍처 전체 구조)*
