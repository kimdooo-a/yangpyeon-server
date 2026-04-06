# 단계별 구현 로드맵

> Wave 4+5 리서치 문서 06  
> 작성일: 2026-04-06  
> 목적: Wave 2+3 기능 우선순위 매트릭스 결과를 바탕으로, 양평 부엌 서버 대시보드의 전체 플랫폼 진화를 Phase별로 상세 계획한다.

---

## 0. 전제 조건

### 0.1 현재 상태 (Phase 10 완료 기준)

| 항목 | 현재 상태 |
|------|-----------|
| 인증 | JWT 쿠키 기반 (파일 저장, 인메모리 세션) |
| 감사 로그 | 인메모리 (`Map<string, AuditEntry[]>`) — PM2 재시작 시 휘발 |
| DB | 없음 (모든 상태 인메모리 또는 파일) |
| 실시간 | 클라이언트 폴링 (3-5초 간격) |
| 입력 검증 | 없음 (Zod 도입 전) |
| UI 라이브러리 | 커스텀 Tailwind 컴포넌트 |
| 알림 | 없음 |

### 0.2 확정 기술 스택

| 레이어 | 기술 | 버전 | 비고 |
|--------|------|------|------|
| DB | SQLite (better-sqlite3) | 최신 | 동기 API, 단일 파일 |
| ORM | Drizzle ORM | 최신 | TypeScript 퍼스트 |
| UI | shadcn/ui | 최신 | Radix UI 기반 |
| 테이블 | TanStack Table v8 | 최신 | Headless |
| 실시간 | SSE (Server-Sent Events) | Web API | 폴링 대체 |
| Auth | 직접 구현 + bcrypt | - | NextAuth 불사용 |
| 코드 에디터 | Monaco Editor | @monaco-editor/react | SQL Editor용 |

### 0.3 구현 순서 원칙 (Wave 2+3 매트릭스 결과)

```
Phase 1 우선 원칙: 기반 인프라(DB) 먼저, 그 위에 기능 쌓기
Phase 2 원칙: 운영자 가시성 극대화 (모니터링 강화)
Phase 3 원칙: Auth 견고화 + UX 완성
Phase 4 원칙: 데이터 플랫폼 (Supabase-like)
Phase 5 원칙: 스토리지 + 알림으로 자율 운영 체계 완성
```

---

## 1. Phase 11: Quick Win + 기반 구축

**목표**: 현재 가장 큰 운영 고통(인메모리 휘발, 입력 검증 부재)을 해소하고 DB 기반 아키텍처로 전환한다.  
**예상 세션**: 2-3 세션  
**마일스톤**: SQLite DB 동작 + 감사 로그 영속화 + 기본 입력 검증

---

### Phase 11a: Zod 입력 검증 (전체 API Route)

**목적**: 악의적 입력 및 잘못된 요청으로 인한 서버 오류 방지  
**예상 시간**: 1-2시간

#### 변경 파일 목록

```
src/app/api/
├── auth/login/route.ts          ← loginSchema 추가
├── pm2/[action]/route.ts        ← actionSchema + processNameSchema
├── pm2/detail/route.ts          ← querySchema
├── audit/route.ts               ← auditQuerySchema
├── system/route.ts              ← 불필요한 body 파싱 제거
└── logs/route.ts                ← logsQuerySchema (app, lines, level)

src/lib/
└── validators.ts                ← 공통 Zod 스키마 모음 (신규)
```

#### 의존성

```
npm install zod
```

기존 rate-limit.ts, audit-log.ts와 독립적으로 적용 가능.

#### 주요 구현 패턴

```typescript
// src/lib/validators.ts
import { z } from 'zod'

export const loginSchema = z.object({
  password: z.string().min(1).max(128),
})

export const pm2ActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'delete', 'reload']),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
})

export const logsQuerySchema = z.object({
  app: z.string().optional(),
  lines: z.coerce.number().int().min(10).max(1000).default(100),
  level: z.enum(['all', 'error', 'info', 'warn']).default('all'),
  since: z.string().datetime().optional(),
})
```

#### API Route 적용 패턴

```typescript
// 모든 API Route에 동일하게 적용
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', details: parsed.error.issues },
      { status: 400 }
    )
  }
  // 이후 로직은 parsed.data 사용
}
```

#### 검증 방법

```bash
# 악의적 입력 테스트
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": ""}'
# 기대: 400 Bad Request

curl -X POST http://localhost:3000/api/pm2/restart \
  -H "Content-Type: application/json" \
  -d '{"name": "../../etc/passwd"}'
# 기대: 400 Bad Request (regex 패턴 불일치)
```

#### 완료 기준

- [ ] 모든 API Route에 Zod 스키마 적용
- [ ] 잘못된 입력에 400 응답 반환
- [ ] 기존 기능 정상 동작 (E2E 테스트)

---

### Phase 11b: 토스트 알림 시스템

**목적**: PM2 재시작, 로그 다운로드 등 작업 결과를 즉시 시각적으로 피드백  
**예상 시간**: 1-2시간

#### 라이브러리 선택: sonner

```
sonner 선택 이유:
- 번들 크기 ~4KB (가장 작은 편)
- Next.js App Router와 완벽 호환
- Tailwind CSS와 자연스러운 통합
- 다크 테마 기본 지원
- 기존 컴포넌트 교체 없이 추가만
```

#### 변경 파일 목록

```
src/app/
└── layout.tsx                    ← <Toaster /> 추가

src/components/ui/
└── sonner.tsx                    ← shadcn add sonner

src/hooks/
└── use-pm2-action.ts             ← PM2 액션 훅 (toast 포함, 신규)

src/components/processes/
└── process-card.tsx              ← usePm2Action 훅 사용으로 교체

src/components/logs/
└── log-toolbar.tsx               ← 다운로드 완료 toast
```

#### 의존성

```
npm install sonner
npx shadcn@latest add sonner
```

#### 토스트 사용 패턴

```typescript
// src/hooks/use-pm2-action.ts
import { toast } from 'sonner'

export function usePm2Action() {
  const execute = async (action: string, name: string) => {
    const toastId = toast.loading(`${name} ${action} 중...`)
    try {
      const res = await fetch(`/api/pm2/${action}`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success(`${name} ${action} 완료`, { id: toastId })
    } catch (err) {
      toast.error(`${name} ${action} 실패: ${err}`, { id: toastId })
    }
  }
  return { execute }
}
```

#### 검증 방법

- 브라우저에서 PM2 프로세스 재시작 → 로딩 → 성공 토스트 순서 확인
- 의도적 실패 (잘못된 프로세스명) → 에러 토스트 확인
- 다크 테마에서 가독성 확인

#### 완료 기준

- [ ] 모든 PM2 액션에 로딩/성공/실패 토스트
- [ ] 로그 다운로드 성공/실패 토스트
- [ ] 레이아웃에 Toaster 컴포넌트 등록

---

### Phase 11c: 로그 다운로드 + 고급 필터 강화

**목적**: 운영자가 로그를 분석하고 보관할 수 있도록 내보내기 기능 제공  
**예상 시간**: 1-2시간

#### 변경 파일 목록

```
src/app/api/logs/
├── route.ts                      ← 기존 (수정)
└── download/route.ts             ← 신규: 파일 다운로드 엔드포인트

src/components/logs/
├── log-viewer.tsx                ← 다운로드 버튼 + 고급 필터 UI 추가
├── log-filters.tsx               ← 신규: 필터 패널 컴포넌트
└── log-toolbar.tsx               ← 신규: 툴바 컴포넌트
```

#### 다운로드 API

```typescript
// src/app/api/logs/download/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const app = searchParams.get('app') ?? 'all'
  const format = searchParams.get('format') ?? 'txt' // txt | json | csv

  const logs = await fetchLogs({ app, lines: 5000 })
  const content = format === 'json'
    ? JSON.stringify(logs, null, 2)
    : logs.map(l => l.raw).join('\n')

  const filename = `logs-${app}-${new Date().toISOString().slice(0,10)}.${format}`

  return new Response(content, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json' : 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

#### 고급 필터 항목

| 필터 | 타입 | 기본값 |
|------|------|--------|
| 앱 선택 | Select (PM2 프로세스 목록) | all |
| 로그 레벨 | MultiSelect (all/error/warn/info) | all |
| 시작 시간 | DateTimePicker | 1시간 전 |
| 종료 시간 | DateTimePicker | 현재 |
| 키워드 | Text (정규식 지원 옵션) | - |
| 라인 수 | Number (10-5000) | 200 |

#### 완료 기준

- [ ] TXT/JSON 형식 다운로드 동작
- [ ] 필터 적용 후 다운로드 시 필터된 결과만 포함
- [ ] 고급 필터 열기/닫기 토글 UI

---

### Phase 11d: SQLite + Drizzle 도입 (초기 스키마)

**목적**: 인메모리 한계 극복. 모든 영속화 데이터의 기반 인프라 구축  
**예상 시간**: 2-3시간  
**선행 조건**: SPIKE-01 완료 (Next.js + better-sqlite3 호환 검증)

#### 의존성

```bash
npm install better-sqlite3 drizzle-orm
npm install -D @types/better-sqlite3 drizzle-kit
```

#### 변경 파일 목록

```
src/lib/db/
├── index.ts                      ← DB 연결 싱글톤 (신규)
├── schema.ts                     ← Drizzle 스키마 정의 (신규)
└── migrations/                   ← 마이그레이션 파일 (자동 생성)

drizzle.config.ts                 ← Drizzle Kit 설정 (신규)
data/
└── dashboard.db                  ← SQLite 파일 (gitignore)

.gitignore                        ← data/*.db 추가
```

#### 초기 스키마 (Phase 11용)

```typescript
// src/lib/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// 감사 로그 (인메모리 → DB)
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  action: text('action').notNull(),       // LOGIN, LOGOUT, PM2_ACTION 등
  userId: text('user_id'),
  ip: text('ip').notNull(),
  userAgent: text('user_agent'),
  target: text('target'),                 // 대상 프로세스명 등
  result: text('result').notNull(),       // SUCCESS | FAILURE
  detail: text('detail'),                 // JSON 직렬화 추가 정보
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
})

// 시스템 메트릭 히스토리 (Phase 12용 선행 스키마)
export const metricsHistory = sqliteTable('metrics_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  cpuPercent: real('cpu_percent').notNull(),
  memUsedMb: real('mem_used_mb').notNull(),
  memTotalMb: real('mem_total_mb').notNull(),
  diskUsedGb: real('disk_used_gb'),
  diskTotalGb: real('disk_total_gb'),
  networkRxKbps: real('network_rx_kbps'),
  networkTxKbps: real('network_tx_kbps'),
})

// IP 화이트리스트 (Phase 11f용)
export const ipWhitelist = sqliteTable('ip_whitelist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ip: text('ip').notNull().unique(),
  label: text('label'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
  createdBy: text('created_by'),
})
```

#### DB 싱글톤 패턴

```typescript
// src/lib/db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { join } from 'path'
import * as schema from './schema'

const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), 'data', 'dashboard.db')

// 싱글톤: PM2 클러스터 모드에서 각 워커가 독립 연결 유지
// SQLite WAL 모드로 읽기 동시성 향상
let db: ReturnType<typeof drizzle>

function getDb() {
  if (!db) {
    const sqlite = new Database(DB_PATH)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    db = drizzle(sqlite, { schema })
  }
  return db
}

export { getDb }
export type DB = ReturnType<typeof getDb>
```

#### drizzle.config.ts

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH ?? './data/dashboard.db',
  },
} satisfies Config
```

#### package.json 스크립트 추가

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

#### 검증 방법

```bash
# 마이그레이션 생성 및 적용
npm run db:generate
npm run db:migrate

# DB 파일 생성 확인
ls -la data/dashboard.db

# Drizzle Studio로 테이블 확인
npm run db:studio
```

#### 완료 기준

- [ ] `data/dashboard.db` 파일 생성
- [ ] `audit_logs`, `metrics_history`, `ip_whitelist` 테이블 생성
- [ ] CRUD 기본 쿼리 동작 확인

---

### Phase 11e: 감사 로그 인메모리 → DB 전환

**목적**: PM2 재시작 시 감사 로그 휘발 문제 완전 해소  
**예상 시간**: 1-2시간  
**선행 조건**: Phase 11d (SQLite + Drizzle) 완료

#### 변경 파일 목록

```
src/lib/
├── audit-log.ts                  ← 전면 수정: Map → Drizzle 쿼리로 교체
└── db/
    └── queries/
        └── audit.ts              ← 감사 로그 전용 쿼리 함수 (신규)

src/app/api/audit/route.ts        ← DB 쿼리로 교체
```

#### 마이그레이션 전략

```typescript
// src/lib/db/queries/audit.ts
import { getDb } from '../index'
import { auditLogs } from '../schema'
import { desc, gte, eq, and } from 'drizzle-orm'

export async function insertAuditLog(entry: {
  action: string
  ip: string
  userId?: string
  userAgent?: string
  target?: string
  result: 'SUCCESS' | 'FAILURE'
  detail?: Record<string, unknown>
}) {
  const db = getDb()
  await db.insert(auditLogs).values({
    timestamp: new Date(),
    ...entry,
    detail: entry.detail ? JSON.stringify(entry.detail) : null,
  })
}

export async function queryAuditLogs(opts: {
  limit?: number
  since?: Date
  action?: string
  result?: 'SUCCESS' | 'FAILURE'
}) {
  const db = getDb()
  const conditions = []
  if (opts.since) conditions.push(gte(auditLogs.timestamp, opts.since))
  if (opts.action) conditions.push(eq(auditLogs.action, opts.action))
  if (opts.result) conditions.push(eq(auditLogs.result, opts.result))

  return db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.timestamp))
    .limit(opts.limit ?? 100)
}
```

#### 이전 인메모리 코드와 API 호환성 유지

```typescript
// src/lib/audit-log.ts — 외부 인터페이스 동일, 내부만 DB로 교체
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  await insertAuditLog(event) // DB 저장
}

export async function getAuditLogs(opts?: AuditQuery): Promise<AuditEntry[]> {
  return queryAuditLogs(opts ?? {})
}
```

#### 완료 기준

- [ ] PM2 재시작 후 감사 로그 유지 확인
- [ ] 로그인/로그아웃 이벤트가 DB에 저장됨
- [ ] 기존 `/api/audit` 엔드포인트 정상 응답

---

### Phase 11f: IP 화이트리스트 (설정 기반)

**목적**: 허용된 IP에서만 대시보드 접근 가능하도록 추가 보안 레이어 제공  
**예상 시간**: 1-2시간  
**선행 조건**: Phase 11d (SQLite) 완료

#### 변경 파일 목록

```
src/middleware.ts                 ← IP 검사 로직 추가
src/lib/ip-whitelist.ts           ← 화이트리스트 조회 유틸 (신규)
src/app/api/settings/
└── ip-whitelist/route.ts         ← CRUD API (신규)
src/app/settings/
└── ip-whitelist/page.tsx         ← 관리 UI (신규)
```

#### 핵심 로직

```typescript
// src/lib/ip-whitelist.ts
// 설정: 환경변수 IP_WHITELIST_ENABLED=true 시 활성화
// 비어있는 경우(화이트리스트 없음) = 모든 IP 허용

export async function isIpAllowed(ip: string): Promise<boolean> {
  if (process.env.IP_WHITELIST_ENABLED !== 'true') return true

  const db = getDb()
  const list = await db.select().from(ipWhitelist)

  // 화이트리스트가 비어있으면 모두 허용 (실수 잠금 방지)
  if (list.length === 0) return true

  return list.some(entry => {
    // CIDR 또는 정확한 IP 매칭
    return entry.ip === ip || matchCidr(ip, entry.ip)
  })
}
```

#### 보안 고려사항

```
⚠️ 주의사항:
1. Cloudflare Tunnel 경유 시 실제 IP는 CF-Connecting-IP 헤더에 있음
2. X-Forwarded-For는 스푸핑 가능 → CF-Connecting-IP 우선 사용
3. 화이트리스트 활성화 전 반드시 현재 IP 추가 (잠금 방지)
4. 긴급 탈출구: IP_WHITELIST_ENABLED=false 환경변수로 즉시 비활성화
```

#### 완료 기준

- [ ] IP 화이트리스트 CRUD API 동작
- [ ] 미허용 IP에서 접근 시 403 응답
- [ ] 화이트리스트 관리 UI (추가/삭제)
- [ ] 기능 on/off 환경변수로 제어 가능

---

### Phase 11 마일스톤 요약

| 항목 | Phase 11a | 11b | 11c | 11d | 11e | 11f |
|------|-----------|-----|-----|-----|-----|-----|
| 예상 시간 | 1-2h | 1-2h | 1-2h | 2-3h | 1-2h | 1-2h |
| 의존성 | 없음 | 없음 | 없음 | SPIKE-01 | 11d | 11d |
| 병렬 가능 | 11a+11b+11c | - | - | - | - | 11e+11f |

**Phase 11 총 예상 시간**: 7-13시간 (2-3 세션)  
**성공 기준**: `npm run build` 통과 + 감사 로그 PM2 재시작 후 유지

---

## 2. Phase 12: 모니터링 강화

**목표**: 서버 상태를 시간 흐름으로 추적하고, 폴링 기반 UX를 실시간으로 전환한다.  
**예상 세션**: 2-3 세션  
**마일스톤**: 히스토리 차트 + SSE 실시간 + 감사 로그 UI + 환경변수 관리

---

### Phase 12a: 메트릭 히스토리 DB 저장 + 차트 페이지

**목적**: CPU/메모리 추이를 시간 단위로 확인하여 장애 원인 분석 지원  
**예상 시간**: 3-4시간  
**선행 조건**: Phase 11d (DB 스키마 `metrics_history` 존재)

#### 변경 파일 목록

```
src/lib/metrics-collector.ts      ← 신규: 주기적 메트릭 수집 + DB 저장
src/app/api/metrics/history/
└── route.ts                      ← 신규: 시계열 데이터 API
src/app/metrics/
└── page.tsx                      ← 신규: 차트 전용 페이지
src/components/charts/
├── cpu-history-chart.tsx          ← 신규
├── memory-history-chart.tsx       ← 신규
└── metrics-chart-container.tsx    ← 신규
```

#### 차트 라이브러리: Recharts

```
Recharts 선택 이유:
- React 공식 생태계 (충분히 성숙)
- SSR 호환 (Next.js App Router)
- 번들 크기 적당 (~50KB gzip)
- Tailwind 색상 변수와 잘 결합
- 별도 Canvas 렌더링 없이 SVG 기반
```

#### 수집 주기 및 보관 정책

```typescript
// src/lib/metrics-collector.ts
const COLLECT_INTERVAL_MS = 60_000   // 1분마다 수집
const RETENTION_DAYS = 30            // 30일 보관

// API Route 첫 요청 시 또는 서버 시작 시 스케줄러 초기화
// Next.js App Router에서는 전역 변수 + setInterval 패턴
```

| 기간 | 해상도 | 데이터 포인트 수 |
|------|--------|-----------------|
| 최근 1시간 | 1분 | 60 |
| 최근 24시간 | 5분 | 288 |
| 최근 7일 | 1시간 | 168 |
| 최근 30일 | 6시간 | 120 |

#### 차트 UI 명세

```
차트 페이지 (/metrics) 레이아웃:
┌─────────────────────────────────────────────┐
│ 시간 범위 선택: [1h] [24h] [7d] [30d]       │
├──────────────────┬──────────────────────────┤
│ CPU 사용률 (%)   │ 메모리 사용량 (MB)        │
│ [Recharts Line]  │ [Recharts Area]           │
├──────────────────┴──────────────────────────┤
│ 디스크 사용률 (%)                            │
│ [Recharts Bar - 낮은 업데이트 빈도]          │
└─────────────────────────────────────────────┘
```

#### 완료 기준

- [ ] 메트릭 1분마다 DB 저장
- [ ] `/metrics` 차트 페이지 접근 가능
- [ ] 1h/24h/7d/30d 시간 범위 전환
- [ ] 30일 이전 데이터 자동 삭제 (데이터 보관 정책)

---

### Phase 12b: SSE 기반 실시간 스트리밍 (폴링 교체)

**목적**: 브라우저 폴링을 SSE로 전환하여 서버 부하 감소 + 실시간성 향상  
**예상 시간**: 2-3시간  
**선행 조건**: SPIKE-02 완료 (SSE + Cloudflare Tunnel 통과 검증)

#### 변경 파일 목록

```
src/app/api/
├── sse/metrics/route.ts          ← 신규: 시스템 메트릭 SSE 스트림
├── sse/pm2/route.ts              ← 신규: PM2 프로세스 상태 SSE 스트림
└── sse/logs/route.ts             ← 신규: 실시간 로그 테일 SSE 스트림

src/hooks/
├── use-sse-metrics.ts             ← 신규: SSE 구독 훅
├── use-sse-pm2.ts                 ← 신규
└── use-sse-logs.ts                ← 신규

src/components/dashboard/
├── stat-card.tsx                  ← usePolling → useSseMetrics로 교체
└── mini-chart.tsx                 ← 동일

src/app/processes/page.tsx         ← usePolling → useSsePm2로 교체
src/app/logs/page.tsx              ← usePolling → useSseLogs로 교체
```

#### SSE Route Handler 패턴

```typescript
// src/app/api/sse/metrics/route.ts
export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // 초기 데이터 즉시 전송
      send(await getSystemMetrics())

      // 5초마다 업데이트
      const interval = setInterval(async () => {
        try {
          send(await getSystemMetrics())
        } catch {
          clearInterval(interval)
          controller.close()
        }
      }, 5000)

      // 연결 종료 시 정리
      return () => clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // Cloudflare Tunnel 버퍼링 방지
      'X-Accel-Buffering': 'no',
    },
  })
}
```

#### 클라이언트 SSE 훅 패턴

```typescript
// src/hooks/use-sse-metrics.ts
export function useSseMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/sse/metrics')
    es.onopen = () => setConnected(true)
    es.onmessage = (e) => setMetrics(JSON.parse(e.data))
    es.onerror = () => {
      setConnected(false)
      // EventSource 자동 재연결 (브라우저 기본 동작)
    }
    return () => es.close()
  }, [])

  return { metrics, connected }
}
```

#### 폴백 전략

```
SSE 실패 시 자동 폴백:
1. EventSource onerror 발생
2. 5초 후 자동 재연결 시도 (브라우저 내장)
3. 3회 실패 시 → 30초 폴링으로 전환 (사용자 알림 포함)
```

#### 완료 기준

- [ ] 메트릭 SSE 스트림이 Cloudflare Tunnel 경유 정상 동작
- [ ] PM2 상태 실시간 업데이트 (재시작 후 자동 반영)
- [ ] 로그 실시간 테일링
- [ ] 연결 상태 인디케이터 (헤더에 녹색/회색 점)
- [ ] PM2 재시작 시 자동 재연결

---

### Phase 12c: 감사 로그 전용 페이지 (필터/검색)

**목적**: DB에 쌓인 감사 로그를 운영자가 편리하게 조회하고 분석  
**예상 시간**: 2-3시간  
**선행 조건**: Phase 11e (감사 로그 DB 저장) 완료

#### 변경 파일 목록

```
src/app/audit/
└── page.tsx                      ← 신규: 감사 로그 전용 페이지

src/components/audit/
├── audit-log-table.tsx            ← 신규: TanStack Table 기반
├── audit-filters.tsx              ← 신규: 필터 패널
└── audit-export.tsx               ← 신규: CSV/JSON 내보내기

src/app/api/audit/route.ts         ← 수정: 페이지네이션 + 필터 파라미터 추가
```

#### TanStack Table 도입

Phase 12c가 TanStack Table 최초 도입 지점이다.

```typescript
// src/components/audit/audit-log-table.tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table'

const columns: ColumnDef<AuditLog>[] = [
  { accessorKey: 'timestamp', header: '시간', cell: ... },
  { accessorKey: 'action', header: '액션' },
  { accessorKey: 'ip', header: 'IP' },
  { accessorKey: 'result', header: '결과' },
  { accessorKey: 'detail', header: '상세' },
]
```

#### 감사 로그 페이지 UI 명세

```
/audit 페이지 레이아웃:
┌─────────────────────────────────────────────┐
│ 감사 로그              [CSV 내보내기] [JSON] │
├──────────────────────────────────────────────┤
│ 필터: [액션 ▼] [결과 ▼] [IP 검색] [기간 ▼]  │
├──────────────────────────────────────────────┤
│ 시간 | 액션 | IP | 사용자 | 결과 | 상세     │
│ ...  | ...  | ..│ ...     | ✅  | ...       │
│ ...  | ...  | ..│ ...     | ❌  | ...       │
├──────────────────────────────────────────────┤
│ [← 이전] 1 / 25 [다음 →]   50개씩 보기 ▼   │
└─────────────────────────────────────────────┘
```

#### 완료 기준

- [ ] 감사 로그 테이블 페이지네이션 (50개씩)
- [ ] 액션/결과/IP/기간 필터
- [ ] 컬럼 정렬
- [ ] CSV 내보내기

---

### Phase 12d: 환경변수 관리 UI + API

**목적**: PM2 환경변수를 재시작 없이 웹 UI에서 확인하고 수정  
**예상 시간**: 2-3시간

#### 변경 파일 목록

```
src/app/api/env/route.ts           ← 신규: 환경변수 CRUD API
src/app/settings/env/page.tsx      ← 신규: 환경변수 관리 페이지
src/components/settings/
└── env-editor.tsx                  ← 신규: Key-Value 편집기
```

#### 보안 설계

```
환경변수 보안 계층:
1. 민감 키(SECRET, KEY, TOKEN, PASSWORD) → 마스킹 표시 (****)
2. NEXT_PUBLIC_ 접두사 변수만 읽기 허용 (서버사이드 시크릿 보호)
3. .env 파일 직접 수정 방식 (PM2 ecosystem 통한 주입)
4. 변경 이력 감사 로그 기록 (ENV_UPDATE 액션)
5. Admin 역할만 수정 가능 (Phase 13b 이후)
```

#### 완료 기준

- [ ] 현재 환경변수 목록 조회 (민감 키 마스킹)
- [ ] 새 환경변수 추가/수정
- [ ] 변경 시 감사 로그 기록
- [ ] .env.local 파일 기반 저장

---

### Phase 12 마일스톤 요약

| 항목 | Phase 12a | 12b | 12c | 12d |
|------|-----------|-----|-----|-----|
| 예상 시간 | 3-4h | 2-3h | 2-3h | 2-3h |
| 의존성 | 11d | SPIKE-02 | 11e | 없음 |
| 병렬 가능 | 12a+12d | 12b 별도 | 12c (12a 후) | 12d 독립 |

**Phase 12 총 예상 시간**: 9-13시간 (2-3 세션)  
**성공 기준**: 실시간 SSE 작동 + 히스토리 차트 확인 + 감사 로그 UI

---

## 3. Phase 13: Auth 진화 + UX 완성

**목표**: 단일 하드코딩 비밀번호에서 DB 기반 다중 사용자 인증으로 전환. UX 완성도 높이기.  
**예상 세션**: 2 세션  
**마일스톤**: bcrypt 기반 DB 인증 + 다중 사용자 + Command Menu

---

### Phase 13a: DB 기반 사용자 인증 (bcrypt)

**목적**: 환경변수 평문 비밀번호에서 DB 기반 해시 인증으로 마이그레이션  
**예상 시간**: 2-3시간  
**선행 조건**: Phase 11d (DB) 완료

#### DB 스키마 추가

```typescript
// src/lib/db/schema.ts 추가
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull().default('viewer'),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date()).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
})
```

#### 마이그레이션 전략 (무중단)

```
마이그레이션 순서:
1. users 테이블 생성
2. 기존 ADMIN_PASSWORD 환경변수 해시 → users 테이블에 admin 계정 자동 생성
3. auth/login route: users 테이블 조회로 전환
4. 이전 환경변수 방식은 fallback으로 30일 유지 (비상 접근용)
5. 30일 후 환경변수 fallback 제거 커밋
```

#### bcrypt 설정

```typescript
import bcrypt from 'bcryptjs' // bcrypt 대신 bcryptjs (pure JS, native 의존성 없음)

const SALT_ROUNDS = 12  // 보안과 속도의 균형
```

#### 완료 기준

- [ ] `npm install bcryptjs` 후 빌드 성공
- [ ] 기존 ADMIN_PASSWORD로 로그인 계속 동작 (마이그레이션 완료 후)
- [ ] DB에 admin 계정 생성 확인
- [ ] 비밀번호 변경 API 동작

---

### Phase 13b: 다중 사용자 + 역할 (admin/viewer)

**목적**: 관리자 외 읽기 전용 사용자 지원 (가족, 지인에게 열람 권한 부여)  
**예상 시간**: 2-3시간  
**선행 조건**: Phase 13a (users 테이블) 완료

#### 역할별 권한 매트릭스

| 기능 | admin | viewer |
|------|-------|--------|
| 대시보드 조회 | ✅ | ✅ |
| 로그 조회 | ✅ | ✅ |
| 감사 로그 조회 | ✅ | ❌ |
| PM2 액션 (재시작 등) | ✅ | ❌ |
| 환경변수 조회 | ✅ | ❌ |
| 사용자 관리 | ✅ | ❌ |
| IP 화이트리스트 관리 | ✅ | ❌ |

#### 미들웨어 역할 검사

```typescript
// src/middleware.ts 확장
// JWT 페이로드에 role 포함 → 라우트별 권한 검사
const ADMIN_ONLY_PATHS = [
  '/api/env',
  '/api/settings',
  '/audit',
  '/settings',
]
```

#### 완료 기준

- [ ] viewer 계정 생성 API
- [ ] viewer 로그인 후 admin 전용 메뉴 숨김
- [ ] viewer가 PM2 액션 시도 시 403 응답

---

### Phase 13c: Command Menu (Cmd+K)

**목적**: 키보드 중심 내비게이션으로 전문 사용자 경험 향상  
**예상 시간**: 2-3시간  
**선행 조건**: Phase 11b (sonner) 완료

#### 라이브러리: cmdk

```
cmdk 선택 이유:
- shadcn/ui Command 컴포넌트의 기반 라이브러리
- Radix UI와 동일 생태계
- 접근성 (ARIA) 완벽 지원
- 번들 크기 ~7KB
```

#### Command 항목 목록

```typescript
const commands = [
  // 내비게이션
  { id: 'home', label: '홈 대시보드', icon: Home, href: '/' },
  { id: 'processes', label: '프로세스 관리', icon: Terminal, href: '/processes' },
  { id: 'logs', label: '로그 뷰어', icon: FileText, href: '/logs' },
  { id: 'metrics', label: '메트릭 히스토리', icon: BarChart, href: '/metrics' },
  { id: 'audit', label: '감사 로그', icon: Shield, href: '/audit' },
  { id: 'settings', label: '설정', icon: Settings, href: '/settings' },

  // 액션
  { id: 'restart-all', label: '모든 프로세스 재시작', icon: RefreshCw, action: 'pm2:restart-all' },
  { id: 'download-logs', label: '로그 다운로드', icon: Download, action: 'logs:download' },
  { id: 'toggle-theme', label: '테마 전환', icon: Moon, action: 'theme:toggle' },
]
```

#### 완료 기준

- [ ] Cmd+K (Mac) / Ctrl+K (Windows) 단축키 동작
- [ ] 타이핑으로 명령어 필터링
- [ ] 화살표 키 + Enter로 선택
- [ ] ESC로 닫기

---

### Phase 13d: 스켈레톤 로딩 + 빈 상태 UI

**목적**: 데이터 로딩 중 레이아웃 흔들림(CLS) 방지 + 친화적 빈 상태 메시지  
**예상 시간**: 1-2시간

#### 변경 파일 목록

```
src/components/ui/
├── skeleton.tsx                   ← shadcn add skeleton
└── empty-state.tsx                ← 신규: 빈 상태 공통 컴포넌트

src/app/
├── page.tsx                       ← 메트릭 카드 스켈레톤
├── processes/page.tsx             ← 프로세스 목록 스켈레톤
└── logs/page.tsx                  ← 로그 라인 스켈레톤
```

#### 완료 기준

- [ ] 모든 데이터 페칭 시 스켈레톤 표시
- [ ] 로그 없을 때, 프로세스 없을 때 빈 상태 메시지

---

### Phase 13 마일스톤 요약

**Phase 13 총 예상 시간**: 7-11시간 (2 세션)  
**성공 기준**: DB 기반 로그인 동작 + Cmd+K 작동 + 스켈레톤 UI

---

## 4. Phase 14: 데이터 관리 (Supabase Table Editor)

**목표**: 대시보드 내에서 SQLite 데이터를 조회하고 편집하는 Supabase-like 테이블 에디터 구현  
**예상 세션**: 3-4 세션  
**마일스톤**: 읽기 전용 Table Editor → CRUD Editor → SQL Editor

---

### Phase 14a: Table Editor MVP (읽기 전용)

**목적**: SQLite 테이블 데이터를 웹에서 바로 확인 (개발/운영 디버깅)  
**예상 시간**: 3-4시간

#### 변경 파일 목록

```
src/app/api/tables/
├── route.ts                       ← 테이블 목록 API
├── [table]/route.ts               ← 테이블 데이터 조회 API
└── [table]/schema/route.ts        ← 컬럼 스키마 API

src/app/tables/
├── page.tsx                       ← 테이블 목록 사이드바 + 에디터 레이아웃
└── [table]/page.tsx               ← 테이블 데이터 뷰

src/components/table-editor/
├── table-list-sidebar.tsx         ← 테이블 목록
├── table-data-grid.tsx            ← TanStack Table 기반 그리드
└── column-type-badge.tsx          ← 컬럼 타입 표시
```

#### 완료 기준

- [ ] 모든 SQLite 테이블 목록 표시
- [ ] 테이블 선택 시 데이터 조회 (페이지네이션)
- [ ] 컬럼 정렬 + 키워드 검색
- [ ] 컬럼 타입 표시 (INTEGER, TEXT 등)

---

### Phase 14b: Table Editor v2 (CRUD 지원)

**목적**: 행 추가/수정/삭제로 데이터 직접 편집  
**예상 시간**: 3-4시간  
**선행 조건**: Phase 14a 완료

#### 보안 고려사항

```
CRUD 보안:
1. admin 역할만 수정 가능 (viewer = 읽기 전용)
2. system_ 접두사 테이블 (내부 메타데이터) 수정 불가
3. 모든 CRUD 액션 감사 로그 기록 (TABLE_INSERT, TABLE_UPDATE, TABLE_DELETE)
4. 배치 삭제 최대 100행 제한
```

#### 완료 기준

- [ ] 행 추가 (우클릭 메뉴 또는 + 버튼)
- [ ] 셀 클릭 인라인 편집
- [ ] 행 삭제 (단건/배치)
- [ ] 변경사항 저장 확인 다이얼로그

---

### Phase 14c: SQL Editor (SELECT only, Monaco)

**목적**: 임의 SQL 쿼리로 데이터 분석 (SELECT 전용, 안전한 읽기 전용)  
**예상 시간**: 3-4시간  
**선행 조건**: SPIKE-03 완료 (Monaco 번들 크기 검증)

#### 변경 파일 목록

```
src/app/api/sql/execute/route.ts   ← SQL 실행 API (SELECT만 허용)
src/app/sql/page.tsx               ← SQL Editor 페이지
src/components/sql-editor/
├── monaco-sql-editor.tsx          ← Monaco Editor (dynamic import)
├── query-result-table.tsx         ← 결과 표시 TanStack Table
└── query-history.tsx              ← 최근 쿼리 이력
```

#### SQL 보안 레이어

```typescript
// src/app/api/sql/execute/route.ts
const FORBIDDEN_KEYWORDS = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'CREATE',
  'ALTER', 'TRUNCATE', 'REPLACE', 'ATTACH', 'DETACH']

function isSafeQuery(sql: string): boolean {
  const upper = sql.toUpperCase().trim()
  // SELECT만 허용
  if (!upper.startsWith('SELECT')) return false
  // 위험 키워드 포함 시 거부
  return !FORBIDDEN_KEYWORDS.some(kw => upper.includes(kw))
}
```

#### Monaco 설정 (SQL 특화)

```typescript
// src/components/sql-editor/monaco-sql-editor.tsx
import dynamic from 'next/dynamic'

// 코드 분할: SQL Editor 페이지 접근 시에만 Monaco 로드
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(m => m.Editor),
  { ssr: false, loading: () => <div>에디터 로딩 중...</div> }
)

// SQL 언어만 로드 (번들 크기 최소화)
monaco.languages.register({ id: 'sql' })
```

#### 완료 기준

- [ ] SQL Editor에서 SELECT 쿼리 실행
- [ ] 결과를 TanStack Table로 표시
- [ ] 비SELECT 쿼리 시 에러 메시지
- [ ] 쿼리 이력 저장 (최근 20개, localStorage)
- [ ] Ctrl+Enter로 쿼리 실행

---

### Phase 14d: 스키마 시각화 (간단 ERD)

**목적**: DB 구조를 시각적으로 파악하여 쿼리 작성 지원  
**예상 시간**: 2-3시간

#### 구현 방식

```
최소 구현 (복잡한 라이브러리 불사용):
- SQLite pragma(table_info) + pragma(foreign_key_list)로 스키마 추출
- 테이블 + 컬럼 목록을 카드 형태로 표시
- 외래키 관계를 화살표로 연결 (SVG)
- D3.js 불사용 → 순수 SVG + position 계산
```

#### 완료 기준

- [ ] 모든 테이블 카드 표시
- [ ] 컬럼명/타입/PK/FK 표시
- [ ] 외래키 관계 화살표

---

### Phase 14 마일스톤 요약

**Phase 14 총 예상 시간**: 11-15시간 (3-4 세션)  
**성공 기준**: SQL Editor SELECT 쿼리 실행 + Table Editor CRUD 동작

---

## 5. Phase 15: 스토리지 + 알림

**목표**: 파일 관리와 운영 알림으로 자율 운영 체계 완성  
**예상 세션**: 2-3 세션  
**마일스톤**: 파일 매니저 MVP + 알림 규칙 + shadcn/ui 전면 전환

---

### Phase 15a: 파일 매니저 MVP

**목적**: 서버 파일 시스템을 웹에서 탐색하고 다운로드  
**예상 시간**: 3-4시간  
**선행 조건**: SPIKE-05 완료 (Cloudflare 파일 업로드 제한 확인)

#### 변경 파일 목록

```
src/app/api/files/
├── route.ts                       ← 디렉토리 목록 API
├── download/route.ts              ← 파일 다운로드 API
└── upload/route.ts                ← 파일 업로드 API

src/app/files/
└── page.tsx                       ← 파일 매니저 페이지

src/components/file-manager/
├── file-tree.tsx                  ← 디렉토리 트리
├── file-list.tsx                  ← 파일 목록 (이름/크기/수정일)
└── file-toolbar.tsx               ← 업로드/다운로드 버튼
```

#### 보안 제한

```typescript
// 허용 루트 디렉토리 (환경변수로 설정)
const ALLOWED_ROOTS = (process.env.FILE_MANAGER_ROOTS ?? '/home,/var/log').split(',')

// 경로 트래버설 방지
function sanitizePath(userPath: string, root: string): string {
  const resolved = resolve(root, userPath)
  if (!resolved.startsWith(root)) throw new Error('경로 이탈 시도 감지')
  return resolved
}
```

#### 완료 기준

- [ ] 허용된 루트 디렉토리 탐색
- [ ] 파일 다운로드
- [ ] 파일 업로드 (크기 제한 적용)
- [ ] 경로 트래버설 공격 방어

---

### Phase 15b: 알림 규칙 시스템

**목적**: CPU/메모리 임계치 초과 시 이메일/웹훅으로 자동 알림  
**예상 시간**: 3-4시간  
**선행 조건**: Phase 12a (메트릭 히스토리) 완료

#### DB 스키마 추가

```typescript
export const alertRules = sqliteTable('alert_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  metric: text('metric').notNull(), // cpu_percent, mem_percent, disk_percent
  operator: text('operator').notNull(), // gt, lt, gte, lte
  threshold: real('threshold').notNull(),
  duration: integer('duration').notNull().default(60), // 초: N초 이상 지속 시
  channel: text('channel').notNull(), // email, webhook, both
  target: text('target').notNull(), // 이메일 주소 또는 웹훅 URL
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp' }),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(300),
})
```

#### 알림 채널

| 채널 | 구현 | 외부 의존성 |
|------|------|------------|
| 이메일 | nodemailer (SMTP) | Gmail App Password 또는 자체 SMTP |
| 웹훅 | fetch (POST JSON) | 없음 (Discord, Slack, 자체 서버) |
| 브라우저 푸시 | Web Push API | VAPID 키 생성 필요 |

1인 서버 운영 우선순위: 웹훅 → 이메일 → 브라우저 푸시

#### 완료 기준

- [ ] 알림 규칙 CRUD UI
- [ ] CPU 80% 초과 5분 지속 시 웹훅 발송 테스트
- [ ] 쿨다운 적용 (같은 알림 중복 방지)
- [ ] 알림 이력 DB 저장

---

### Phase 15c: shadcn/ui 전면 전환 (기존 컴포넌트 교체)

**목적**: 커스텀 컴포넌트를 shadcn/ui 표준으로 교체하여 유지보수성 향상  
**예상 시간**: 4-6시간  
**선행 조건**: SPIKE-04 완료 (shadcn 테마 호환 검증) + 전체 기능 구현 완료

#### 교체 대상 컴포넌트

| 현재 | shadcn/ui 대체 |
|------|---------------|
| 커스텀 Button | Button |
| 커스텀 Card | Card |
| 커스텀 Modal | Dialog |
| 커스텀 Dropdown | DropdownMenu |
| 커스텀 Badge | Badge |
| 커스텀 Input | Input |
| 커스텀 Table | Table (TanStack Table과 결합) |

교체 전략: 점진적 교체 (한 페이지씩, 기능 회귀 없음 확인 후 진행)

#### 완료 기준

- [ ] 모든 커스텀 컴포넌트 shadcn으로 교체
- [ ] 시각적 일관성 유지 (다크 테마 동일)
- [ ] 접근성 개선 (ARIA 자동 적용)

---

### Phase 15 마일스톤 요약

**Phase 15 총 예상 시간**: 10-14시간 (2-3 세션)  
**성공 기준**: 알림 웹훅 발송 동작 + 파일 다운로드 + shadcn 전환

---

## 6. 전체 타임라인 다이어그램

```
ASCII 간트 차트 (세션 단위, 1세션 ≈ 3-4시간)

Phase  │ S01 │ S02 │ S03 │ S04 │ S05 │ S06 │ S07 │ S08 │ S09 │ S10 │ S11 │ S12 │
───────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
11a-c  │▓▓▓▓▓│     │     │     │     │     │     │     │     │     │     │     │
(검증) │SPIKE│─01──│     │     │     │     │     │     │     │     │     │     │
11d-f  │     │▓▓▓▓▓│▓▓▓▓▓│     │     │     │     │     │     │     │     │     │
12a    │     │     │     │▓▓▓▓▓│     │     │     │     │     │     │     │     │
12b    │     │     │     │     │▓▓▓▓▓│     │     │     │     │     │     │     │
12c-d  │     │     │     │     │     │▓▓▓▓▓│     │     │     │     │     │     │
13a-b  │     │     │     │     │     │     │▓▓▓▓▓│     │     │     │     │     │
13c-d  │     │     │     │     │     │     │     │▓▓▓▓▓│     │     │     │     │
14a-b  │     │     │     │     │     │     │     │     │▓▓▓▓▓│▓▓▓▓▓│     │     │
14c-d  │     │     │     │     │     │     │     │     │     │     │▓▓▓▓▓│     │
15a-c  │     │     │     │     │     │     │     │     │     │     │     │▓▓▓▓▓│

범례: ▓ = 작업 세션, SPIKE = 기술 검증 (Phase 11 시작 전)
총 예상: 약 12-15 세션 (36-60시간)
```

---

## 7. Phase별 마일스톤 표

| Phase | 마일스톤 | 핵심 결과물 | 예상 세션 | 성공 기준 |
|-------|---------|------------|---------|---------|
| 11 | Quick Win + DB 기반 | Zod + SQLite + 감사 로그 영속화 | 2-3 | PM2 재시작 후 감사 로그 유지 |
| 12 | 모니터링 강화 | 히스토리 차트 + SSE + 감사 로그 UI | 2-3 | 실시간 차트 + SSE 스트림 동작 |
| 13 | Auth + UX 완성 | DB 인증 + 다중 사용자 + Cmd+K | 2 | bcrypt 로그인 + Command Menu |
| 14 | 데이터 플랫폼 | Table Editor + SQL Editor | 3-4 | SELECT 쿼리 실행 + CRUD |
| 15 | 자율 운영 | 파일 매니저 + 알림 + shadcn 전환 | 2-3 | 알림 웹훅 발송 + 파일 다운 |

---

## 8. 위험 관리

### Phase별 최대 위험 + 대응 방안

| Phase | 최대 위험 | 대응 방안 | 롤백 계획 |
|-------|----------|---------|---------|
| 11d | better-sqlite3 빌드 오류 (native module) | SPIKE-01 선행 검증, webpack externals 설정 | sql.js (WASM) 대안 |
| 12b | SSE가 Cloudflare Tunnel에서 버퍼링 | SPIKE-02 선행 검증, X-Accel-Buffering 헤더 | 폴링 유지 (간격 단축) |
| 13a | DB 인증 전환 시 기존 세션 무효화 | 30일 환경변수 fallback 병행 유지 | 환경변수 방식 롤백 |
| 14c | Monaco 번들 크기 과다 | SPIKE-03 선행 검증, dynamic import | CodeMirror 6 대안 |
| 15b | 알림 스팸 (쿨다운 미적용) | 쿨다운 기본값 300초, 테스트 모드 | 알림 일괄 비활성화 |

### 공통 위험

```
1. 빌드 실패 위험
   - 각 Phase 시작 시 빈 브랜치에서 먼저 빌드 테스트
   - npm run build 통과 후에만 다음 단계 진행

2. DB 마이그레이션 위험
   - 프로덕션 DB 변경 전 data/dashboard.db 백업 필수
   - Drizzle Kit migrate는 개발 환경에서 먼저 실행

3. 인증 잠금 위험
   - IP 화이트리스트/역할 변경 시 항상 admin 계정 유지 확인
   - 긴급 탈출 환경변수 문서화
```

---

## 9. 스코프 조정 규칙

### 세션 시간 초과 시 우선 삭감 대상

```
삭감 불가 (핵심 기능):
✅ Zod 입력 검증 (보안)
✅ SQLite + Drizzle (기반 인프라)
✅ 감사 로그 영속화 (운영 필수)
✅ bcrypt 기반 인증 (보안)

세션 초과 시 다음 Phase로 이월:
⏭ IP 화이트리스트 UI (환경변수로 임시 대체)
⏭ 감사 로그 CSV 내보내기 (조회만으로 우선)
⏭ 스켈레톤 로딩 UI (기능보다 UX)
⏭ 스키마 시각화 ERD (SQL Editor로 대체)
⏭ shadcn 전면 전환 (점진적 적용)

완전 제거 가능:
❌ Phase 14d 스키마 시각화 (SQL PRAGMA로 대체)
❌ Phase 15c 전면 전환 (점진적 교체로 대체)
❌ 브라우저 푸시 알림 (웹훅으로 충분)
```

### Phase 단순화 규칙

```
각 Phase에서 "MVP 우선, 개선 나중" 원칙:
- Table Editor: 읽기 전용(14a)이 CRUD(14b)보다 우선
- SQL Editor: SELECT only가 완전 쿼리보다 우선
- 파일 매니저: 다운로드가 업로드보다 우선
- 알림: 웹훅이 이메일/푸시보다 우선
```

---

## 10. 부록: 주요 패키지 버전 잠금

```json
{
  "better-sqlite3": "^9.x",
  "drizzle-orm": "^0.30.x",
  "drizzle-kit": "^0.21.x",
  "bcryptjs": "^2.4.x",
  "sonner": "^1.x",
  "@monaco-editor/react": "^4.x",
  "@tanstack/react-table": "^8.x",
  "recharts": "^2.x",
  "cmdk": "^1.x",
  "zod": "^3.x"
}
```

버전 잠금 이유: 1인 개발 환경에서 breaking change 위험 최소화. 마이너 업데이트는 분기별 검토.

---

> 최종 수정: 2026-04-06  
> 다음 문서: [07-spike-specs.md](./07-spike-specs.md) — 기술 검증 스파이크 사양
