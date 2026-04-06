# DB 관리 UI 구현 방안

> Wave 2+3 리서치 문서 02  
> 작성일: 2026-04-06  
> 목적: Supabase Table Editor를 롤모델로 하되, 1인 개발 / WSL2+PM2 / 셀프호스팅 제약에 맞는 DB 관리 UI를 설계한다.

---

## 1. 왜 DB가 필요한가

### 1.1 현재 인메모리 방식의 한계

현재 양평 부엌 서버 대시보드는 모든 런타임 데이터를 Node.js 프로세스 메모리에 저장한다. 이 구조의 근본적인 문제는 **PM2 재시작 시 모든 데이터가 초기화**된다는 것이다.

**구체적인 고통 목록:**

| 데이터 종류 | 저장 위치 | PM2 재시작 시 |
|------------|---------|------------|
| 감사 로그 (로그인, API 호출) | `src/lib/audit-log.ts` 인메모리 배열 | 완전 초기화 |
| Rate Limit 카운터 | `src/lib/rate-limit.ts` Map 객체 | 초기화 (의도된 동작이지만 로그 없음) |
| 설정값 (미래 기능) | 없음 | 초기화 예정 |
| 메트릭 히스토리 (미래 기능) | 없음 | 구현 불가 |

**시나리오로 이해하기:**

```
[시나리오 1: 배포 후 로그 분실]
AM 02:00 — 비정상 접근 시도 5회 기록됨 (감사 로그)
AM 02:10 — 보안 패치 배포를 위해 PM2 재시작
AM 02:11 — 감사 로그 완전 초기화. 이상 접근 흔적 사라짐.

[시나리오 2: 메트릭 히스토리 불가]
PM 14:00 — CPU 100% 스파이크 발생
PM 14:05 — 자동 PM2 재시작으로 복구
PM 14:10 — "왜 CPU가 치솟았지?" → 히스토리 없어서 파악 불가

[시나리오 3: 설정 휘발]
알림 임계값을 CPU 85%로 설정
다음 날 PM2 재시작 → 기본값으로 초기화
```

### 1.2 영속화가 필요한 데이터 목록

Phase 1~3에서 구현할 기능 중 DB 영속화가 필요한 항목:

```
[즉시 필요]
- 감사 로그 (audit_events): 로그인/로그아웃/API 호출 이벤트
- Rate Limit 이벤트 로그 (선택): 차단된 요청 기록

[Phase 2에서 필요]
- 메트릭 히스토리 (metrics): 5분 간격 CPU/메모리/디스크 스냅샷
- 헬스 체크 결과 (health_checks): 서비스별 가용성 이력

[Phase 3에서 필요]
- 알림 규칙 (alert_rules): 임계값, 알림 채널 설정
- 사용자 (users): 다중 사용자 도입 시
- 세션 (sessions): 다중 사용자 세션 관리
```

---

## 2. DB 선택지 비교

### 2.1 후보 목록

WSL2 + PM2 환경, 1인 개발, 셀프호스팅이라는 제약 조건에서 현실적인 후보는 4가지다.

#### 후보 A: SQLite (better-sqlite3)

**개요**: 파일 하나가 데이터베이스 전체인 경량 관계형 DB. Node.js용 `better-sqlite3` 드라이버는 동기 API를 제공한다.

```
장점:
  - 제로 설정: 추가 데몬 없음, npm install 하나로 완료
  - 파일 기반: ~/dashboard/data/dashboard.db 파일 하나
  - 동기 API: Next.js Route Handler에서 async/await 없이 사용 가능
  - 빠름: 소규모 데이터에서 PostgreSQL보다 빠른 경우도 있음
  - WAL 모드: 동시 읽기/쓰기 지원 (pm2 앱 1개 환경에서 충분)
  - 백업 단순: 파일 복사만으로 백업 완료

단점:
  - 단일 쓰기 잠금: 동시 쓰기는 직렬화됨 (1인 운영 환경에서는 문제 없음)
  - 수평 확장 불가: 멀티 서버 환경에서는 사용 불가
  - JSON 지원 제한: PostgreSQL JSONB보다 기능이 약함 (json_extract로 가능)
  - 일부 SQL 기능 미지원: FULL OUTER JOIN, RIGHT JOIN 없음

적합 용도: 단일 서버, 소규모 데이터 (수백만 행 이하), 단일 쓰기 프로세스
```

#### 후보 B: PostgreSQL

**개요**: Supabase가 사용하는 오픈소스 관계형 DB. 가장 기능이 풍부하다.

```
장점:
  - 기능 풍부: JSONB, 전문 검색, 파티셔닝, RLS
  - 확장성: 수십만 동시 연결 지원
  - 성숙도: 가장 검증된 오픈소스 DB
  - ORM 지원: Prisma/Drizzle 등 최고 수준의 지원

단점:
  - 데몬 필요: PostgreSQL 서비스 별도 운영 필요
  - 설정 복잡: pg_hba.conf, postgresql.conf 등 설정 필요
  - 메모리: 최소 100~200MB RAM 상시 사용
  - WSL2 PATH 이슈: pg_ctl, psql 경로 설정 필요
  - 백업 복잡: pg_dump, WAL 아카이브 등 추가 설정

적합 용도: 멀티 서버, 팀 운영, 대규모 데이터, 복잡한 쿼리
```

#### 후보 C: Turso (libSQL)

**개요**: SQLite와 완전 호환되는 분산 DB. 로컬 파일 모드 또는 클라우드 엣지 복제 모드로 사용 가능.

```
장점:
  - SQLite 완전 호환: better-sqlite3와 API 유사
  - 엣지 복제: 클라우드에 자동 복제 (선택)
  - HTTP 모드: REST API로 접근 가능 (원격 조회 편리)
  - 로컬 파일 모드 지원: SQLite처럼 파일 기반 사용 가능

단점:
  - 상대적으로 새로운 기술: 2023년 등장, 성숙도 낮음
  - 클라우드 의존 옵션: 셀프호스팅 원칙에 반함
  - 추가 의존성: @libsql/client 패키지
  - better-sqlite3와 API 약간 다름: 비동기 API 사용

적합 용도: 엣지 배포, SQLite에서 점진적 확장이 필요한 경우
```

#### 후보 D: LowDB (JSON 파일)

**개요**: JSON 파일을 DB처럼 사용하는 초경량 라이브러리.

```
장점:
  - 초경량: lodash 수준의 의존성
  - 설정 제로: JSON 파일 하나로 시작
  - 인간이 읽기 쉬운 형식: 텍스트 에디터로 직접 편집 가능
  - TypeScript 지원: 타입 추론 우수

단점:
  - 성능: 모든 읽기/쓰기가 전체 파일 파싱
  - 동시성 없음: 파일 락 없어서 동시 쓰기 시 데이터 손실 위험
  - 쿼리 기능 없음: SQL 없이 JS 필터링만 가능
  - 확장 불가: 수천 건 이상에서 성능 저하

적합 용도: 설정 파일, 소규모 목록 데이터 (수백 건 이하)
```

### 2.2 비교 매트릭스

| 항목 | SQLite | PostgreSQL | Turso | LowDB |
|------|--------|-----------|-------|-------|
| 설치 복잡도 | ★★★★★ | ★★☆☆☆ | ★★★★☆ | ★★★★★ |
| WSL2 친화성 | ★★★★★ | ★★★☆☆ | ★★★★☆ | ★★★★★ |
| 운영 부담 | 없음 | 높음 | 낮음 | 없음 |
| 쿼리 기능 | 높음 | 매우 높음 | 높음 | 낮음 |
| 동시성 | 제한적 | 뛰어남 | 제한적 | 없음 |
| 백업 난이도 | 파일 복사 | pg_dump | 파일 복사 | 파일 복사 |
| TypeScript 지원 | 우수 | 우수 | 우수 | 우수 |
| 현 환경 적합성 | ★★★★★ | ★★☆☆☆ | ★★★★☆ | ★★☆☆☆ |

### 2.3 추천: SQLite (better-sqlite3)

**추천 근거:**

1. **제약 조건 최적 부합**: WSL2 단일 서버 + PM2 + 1인 운영 환경에서 추가 데몬이 없는 파일 기반 DB가 가장 단순하고 안정적이다.

2. **운영 부담 제로**: PostgreSQL은 서비스 관리, 연결 풀링, 백업 스케줄링 등 추가 운영 작업이 필요하다. SQLite는 파일 하나로 시작하고, 파일 복사만으로 백업이 완료된다.

3. **동기 API의 장점**: `better-sqlite3`의 동기 API는 Next.js Route Handler에서 try/catch 없이 사용하기 편리하고, 비동기 처리 실수로 인한 버그를 줄인다.

4. **확장 경로 명확**: 향후 데이터가 수백만 건을 초과하거나 멀티 서버 환경이 되면 `better-sqlite3` → `@libsql/client` (Turso 로컬) → PostgreSQL 순으로 마이그레이션이 가능하다. Drizzle ORM을 사용하면 이 마이그레이션 경로에서 코드 변경을 최소화할 수 있다.

5. **이미 검증된 조합**: Hacker News 통계에 따르면 수백만 건의 읽기 전용 데이터도 SQLite + WAL 모드에서 무리 없이 처리된다. 현재 예상 데이터 규모(하루 수백~수천 건의 감사 로그, 288개/일 메트릭 스냅샷)는 SQLite의 한계에 전혀 가깝지 않다.

```typescript
// 추천 설치
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

---

## 3. ORM / 쿼리 빌더 비교

### 3.1 후보 목록

#### 후보 A: Prisma

**개요**: 스키마 파일(`schema.prisma`)을 정의하면 TypeScript 타입과 마이그레이션 SQL을 자동 생성하는 타입 안전 ORM.

```typescript
// schema.prisma 예시
model AuditEvent {
  id        Int      @id @default(autoincrement())
  action    String
  userIp    String
  createdAt DateTime @default(now())
}

// 사용 예시
const events = await prisma.auditEvent.findMany({
  where: { action: 'LOGIN' },
  orderBy: { createdAt: 'desc' },
  take: 100,
});
```

```
장점:
  - 직관적인 스키마 정의: schema.prisma 하나로 DB 구조 파악 가능
  - 타입 자동 생성: prisma generate로 완전한 TypeScript 타입 생성
  - 마이그레이션 도구: prisma migrate dev/deploy로 스키마 변경 관리
  - Studio: 내장 DB 브라우저 (prisma studio)
  - 풍부한 문서/커뮤니티

단점:
  - 빌드 스텝 필수: prisma generate를 빌드 전에 실행해야 함
  - 번들 크기: 런타임 클라이언트가 약 2MB
  - SQLite 지원 제한: better-sqlite3 대신 자체 SQLite 드라이버 사용
  - 동기 API 없음: 모든 쿼리가 비동기
  - Edge Runtime 불가: Cloudflare Workers 등 엣지 환경 미지원
  - 개념 학습 필요: SQL을 직접 쓰지 않아서 ORM 추상화에 익숙해져야 함
```

#### 후보 B: Drizzle ORM

**개요**: TypeScript 코드로 스키마를 정의하고, SQL과 유사한 쿼리 빌더 API를 제공하는 경량 ORM.

```typescript
// schema.ts 예시
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const auditEvents = sqliteTable('audit_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  userIp: text('user_ip').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// 사용 예시 (better-sqlite3와 함께)
const events = db
  .select()
  .from(auditEvents)
  .where(eq(auditEvents.action, 'LOGIN'))
  .orderBy(desc(auditEvents.createdAt))
  .limit(100)
  .all();
```

```
장점:
  - SQL-like API: SQL을 아는 개발자에게 직관적
  - 경량: 런타임 오버헤드 최소 (약 50KB)
  - better-sqlite3 공식 지원: 동기 API 완전 지원
  - 빌드 스텝 없음: prisma generate 같은 추가 단계 없음
  - 타입 추론 우수: 쿼리 결과 타입이 자동으로 추론됨
  - 마이그레이션: drizzle-kit으로 SQL 마이그레이션 파일 생성
  - Edge Runtime 지원

단점:
  - Prisma보다 문서/커뮤니티 작음 (하지만 빠르게 성장 중)
  - 스키마를 TypeScript로 정의: SQL DDL과 다른 방식에 적응 필요
  - 상대적으로 새로운 라이브러리: 2022년 등장
```

#### 후보 C: better-sqlite3 직접 사용

**개요**: ORM 없이 SQL 쿼리를 직접 작성하는 방식.

```typescript
// 직접 사용 예시
import Database from 'better-sqlite3';

const db = new Database('./data/dashboard.db');

// 쿼리
const events = db.prepare(`
  SELECT * FROM audit_events
  WHERE action = ?
  ORDER BY created_at DESC
  LIMIT 100
`).all('LOGIN');
```

```
장점:
  - 의존성 최소: better-sqlite3만 필요
  - SQL 완전 제어: ORM 추상화 없이 최적화된 쿼리 작성 가능
  - 학습 비용 없음: SQL을 알면 바로 사용 가능
  - 빠름: ORM 레이어 없어서 성능 오버헤드 없음

단점:
  - TypeScript 타입 수동 정의: 쿼리 결과 타입을 직접 만들어야 함
  - SQL 문자열: 타입 오류를 컴파일 타임에 잡기 어려움
  - 마이그레이션 없음: 스키마 변경을 수동으로 관리해야 함
  - 보일러플레이트: 반복되는 CRUD 코드가 늘어남
```

### 3.2 ORM 비교 매트릭스

| 항목 | Prisma | Drizzle | 직접 SQL |
|------|--------|---------|---------|
| SQLite 지원 | △ (자체 드라이버) | ★ (better-sqlite3 완전 지원) | ★ |
| 동기 API 지원 | ✕ | ★ | ★ |
| 타입 안전성 | ★★★★★ | ★★★★☆ | ★★☆☆☆ |
| 빌드 스텝 | 필요 | 불필요 | 불필요 |
| 번들 크기 | 크다 | 작다 | 없음 |
| 마이그레이션 | 최고 | 우수 | 수동 |
| 1인 개발 적합 | ★★★☆☆ | ★★★★★ | ★★★☆☆ |

### 3.3 추천: Drizzle ORM + better-sqlite3

**추천 근거:**

1. **SQLite 네이티브 지원**: `better-sqlite3`와의 공식 통합으로 동기 API를 그대로 사용할 수 있다. Prisma는 자체 SQLite 드라이버를 사용하여 `better-sqlite3`의 이점이 사라진다.

2. **빌드 스텝 없음**: Next.js 빌드 시 `prisma generate`를 기억해야 하는 번거로움이 없다. WSL2 배포 스크립트를 단순하게 유지할 수 있다.

3. **SQL-like API**: SQL을 아는 개발자라면 Drizzle의 `select().from().where().limit()` API가 직관적이다. 쿼리를 보면 어떤 SQL이 실행될지 바로 예측 가능하다.

4. **경량**: 런타임 오버헤드가 최소화되어 Next.js 서버 컴포넌트 환경에서도 부담이 없다.

```typescript
// 추천 설치
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

---

## 4. Table Editor UI 설계

### 4.1 Supabase Table Editor 롤모델 분석

Supabase Table Editor의 핵심 UX 패턴은 다음과 같다.

```
[레이아웃]
┌─────────────────────────────────────────────────────────┐
│  테이블 선택  │  필터 바  │  정렬  │  + 행 추가  │ 새로고침  │
├─────────────────────────────────────────────────────────┤
│ ☐ │ id  │ action │ user_ip │ created_at │ 액션 열    │
├─────────────────────────────────────────────────────────┤
│ ☐ │  1  │ LOGIN  │ 1.2.3.4 │ 2026-04-06 │ ✏️ 🗑️      │
│ ☐ │  2  │ LOGOUT │ 1.2.3.4 │ 2026-04-06 │ ✏️ 🗑️      │
│ ☐ │  3  │ LOGIN  │ 5.6.7.8 │ 2026-04-06 │ ✏️ 🗑️      │
├─────────────────────────────────────────────────────────┤
│  1-3 / 1,234 행    │  ← 이전  │  다음 →  │  100행씩   │
└─────────────────────────────────────────────────────────┘
```

**Supabase Table Editor 핵심 기능:**
- 테이블 목록 사이드바: 클릭하면 해당 테이블 데이터 표시
- 인라인 셀 편집: 셀 클릭 → 편집 모드 → Enter로 저장
- 행 추가: 하단 "+ 행 추가" 버튼 → 새 행 인라인 편집
- 컬럼 필터: WHERE 조건 GUI (컬럼 선택 → 연산자 → 값)
- 다중 정렬: ORDER BY 여러 컬럼 GUI 지정
- 페이지네이션: 100/500/1000행씩 표시
- 선택 행 삭제: 체크박스 선택 → 삭제 버튼
- CSV 내보내기: 현재 필터 결과를 CSV로 다운로드

### 4.2 우리 프로젝트에 맞는 Table Editor 설계

완전한 Supabase Table Editor는 1인 개발 기준 수십 시간의 작업량이다. 단계별로 MVP → v2 → v3 순서로 접근한다.

#### 4.2.1 MVP (Phase 2): 감사 로그 조회 전용 테이블

**목표**: 감사 로그를 조회할 수 있는 최소 기능 테이블. 일반 Table Editor가 아닌 `audit_events` 테이블 전용 UI.

**기능 범위:**
```
✅ 포함
  - 감사 로그 테이블 조회 (페이지네이션)
  - 액션 타입 필터 (LOGIN/LOGOUT/API_CALL 등)
  - 날짜 범위 필터 (오늘/최근 7일/커스텀)
  - IP 주소 필터
  - CSV 내보내기
  - 자동 새로고침 (30초)

❌ 제외 (MVP에서)
  - 인라인 편집 (감사 로그는 읽기 전용이 맞음)
  - 행 추가 (감사 로그는 시스템이 자동 생성)
  - 테이블 스키마 변경
```

**컴포넌트 구조:**
```
src/app/audit/page.tsx              ← /audit 페이지
src/components/audit/
  ├── audit-log-table.tsx           ← 메인 테이블 컴포넌트
  ├── audit-log-filters.tsx         ← 필터 바
  ├── audit-log-pagination.tsx      ← 페이지네이션
  └── audit-log-export-button.tsx   ← CSV 내보내기 버튼
src/app/api/audit/
  ├── route.ts                      ← GET: 목록 조회 (필터/페이지네이션)
  └── export/route.ts               ← GET: CSV 다운로드
```

**API 설계:**
```typescript
// GET /api/audit?action=LOGIN&ip=1.2.3.4&from=2026-04-01&to=2026-04-06&page=1&limit=100
interface AuditQueryParams {
  action?: string;    // 필터: LOGIN, LOGOUT, API_CALL 등
  ip?: string;        // 필터: IP 주소 부분 일치
  from?: string;      // ISO 날짜 시작
  to?: string;        // ISO 날짜 종료
  page?: number;      // 기본값: 1
  limit?: number;     // 기본값: 50, 최대: 500
}

interface AuditQueryResponse {
  data: AuditEvent[];
  total: number;
  page: number;
  totalPages: number;
}
```

**구현 예시:**
```typescript
// src/lib/db.ts — DB 연결 싱글톤
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'dashboard.db');

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const sqlite = new Database(DB_PATH);
    // WAL 모드 활성화: 동시 읽기/쓰기 성능 향상
    sqlite.pragma('journal_mode = WAL');
    // 외래키 제약 활성화
    sqlite.pragma('foreign_keys = ON');
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}
```

```typescript
// src/lib/schema.ts — Drizzle 스키마 정의
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 감사 로그 테이블
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    action: text('action').notNull(),          // LOGIN, LOGOUT, API_CALL, PM2_RESTART 등
    userIp: text('user_ip'),                   // 요청 IP
    path: text('path'),                        // 요청 경로 (API 호출 시)
    method: text('method'),                    // HTTP 메서드
    statusCode: integer('status_code'),        // HTTP 상태 코드
    details: text('details'),                  // 추가 정보 (JSON 문자열)
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    actionIdx: index('action_idx').on(table.action),
    createdAtIdx: index('created_at_idx').on(table.createdAt),
    userIpIdx: index('user_ip_idx').on(table.userIp),
  })
);

// 메트릭 히스토리 테이블
export const metrics = sqliteTable(
  'metrics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cpuPercent: integer('cpu_percent').notNull(),
    memoryPercent: integer('memory_percent').notNull(),
    diskPercent: integer('disk_percent').notNull(),
    memoryUsedMb: integer('memory_used_mb'),
    diskUsedGb: integer('disk_used_gb'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    createdAtIdx: index('metrics_created_at_idx').on(table.createdAt),
  })
);

// 설정 테이블 (key-value 방식)
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// 타입 내보내기
export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
```

#### 4.2.2 v2 (Phase 3): 범용 Table Editor

**목표**: 모든 DB 테이블을 조회할 수 있는 범용 Table Editor UI.

**추가 기능:**
```
✅ v2에서 추가
  - 테이블 목록 사이드바 (동적으로 DB 테이블 목록 조회)
  - 컬럼 정렬 (헤더 클릭)
  - 간단한 필터 빌더 (컬럼 선택 → 연산자 → 값)
  - 페이지 크기 선택 (50/100/500)
  - 행 수 표시

❌ v2에서도 제외
  - 인라인 편집 (감사 로그/메트릭은 읽기 전용)
  - 행 추가/삭제 (시스템 데이터 보호)
```

**라우팅 설계:**
```
/db                          ← DB 관리 홈 (테이블 목록)
/db/[tableName]              ← 특정 테이블 조회
/db/[tableName]/[id]         ← 특정 행 상세 (v3)
```

#### 4.2.3 v3 (Phase 4+): 쓰기 기능 추가

**목표**: 설정 데이터 등 일부 테이블에서 편집/삭제 지원.

**추가 기능:**
```
✅ v3에서 추가 (보안 고려 후)
  - settings 테이블 인라인 편집
  - alert_rules 테이블 행 추가/편집/삭제
  - users 테이블 관리 (다중 사용자 도입 시)
  - 변경 이력 자동 감사 로그 기록

⚠️ 보안 고려사항
  - Admin 역할만 쓰기 가능 (E-02 다중 사용자 도입 후)
  - 시스템 테이블(audit_events, metrics)은 항상 읽기 전용
  - 모든 변경은 감사 로그에 자동 기록
  - Zod 스키마로 입력 검증 필수
```

### 4.3 React 테이블 라이브러리 선택

#### 후보 비교

**TanStack Table (구 React Table):**
```
장점:
  - 헤드리스: UI 없이 테이블 로직만 제공, Tailwind와 완전 통합 가능
  - 기능 풍부: 정렬/필터링/페이지네이션/행 선택 등 내장
  - TypeScript 우수: 제네릭 기반 타입 안전성
  - 오픈소스: 무료

단점:
  - 설정 복잡: 기본 테이블 하나 만드는 데 코드량이 많음
  - 학습 비용: API가 상당히 복잡
```

**AG Grid Community:**
```
장점:
  - 엑셀 수준 기능: 셀 편집, 클립보드, 그룹화, 피벗 등
  - 성능: 수십만 행도 가상 스크롤로 처리
  - 직관적: 설정이 선언적

단점:
  - 번들 크기: 약 500KB (Community 버전도)
  - 스타일 커스텀 어려움: Tailwind와 통합 복잡
  - 엔터프라이즈 기능 유료
```

**직접 구현 (Tailwind CSS 테이블):**
```
장점:
  - 완전한 제어: 디자인/기능 모두 자유롭게
  - 번들 최소: 추가 의존성 없음
  - 현재 프로젝트 스타일 일관성 유지

단점:
  - 시간 소요: 정렬/필터/페이지네이션 모두 직접 구현
  - 유지보수: 기능 추가/수정 시 코드량 증가
```

**추천: MVP는 직접 구현, v2+는 TanStack Table**

- MVP(감사 로그 전용)는 필터와 페이지네이션이 서버 사이드이므로 복잡한 테이블 라이브러리가 필요 없다. 직접 구현으로 번들 크기를 줄이고 현재 UI 스타일을 유지한다.
- v2(범용 Table Editor)부터 TanStack Table을 도입한다. 클라이언트 사이드 정렬/필터링이 필요해지는 시점에 도입 효과가 극대화된다.

```typescript
// MVP 감사 로그 테이블 컴포넌트 구조 예시
// src/components/audit/audit-log-table.tsx
interface AuditLogTableProps {
  data: AuditEvent[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function AuditLogTable({
  data,
  total,
  page,
  totalPages,
  onPageChange,
}: AuditLogTableProps) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#1a1a1a] border-b border-[#2a2a2a]">
          <tr>
            <th className="px-4 py-3 text-left text-gray-400 font-medium">시각</th>
            <th className="px-4 py-3 text-left text-gray-400 font-medium">액션</th>
            <th className="px-4 py-3 text-left text-gray-400 font-medium">IP</th>
            <th className="px-4 py-3 text-left text-gray-400 font-medium">경로</th>
            <th className="px-4 py-3 text-left text-gray-400 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {data.map((event) => (
            <AuditLogRow key={event.id} event={event} />
          ))}
        </tbody>
      </table>
      <AuditLogPagination
        total={total}
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
```

---

## 5. SQL Editor 가능성 검토

### 5.1 Supabase SQL Editor 분석

Supabase SQL Editor의 핵심 기능:
- Monaco Editor 기반 SQL 작성 환경 (인텔리센스, 구문 강조)
- 쿼리 실행 → 결과를 테이블로 표시
- 저장된 쿼리 목록
- AI 기반 쿼리 생성 (최근 추가)

### 5.2 우리 프로젝트에서의 검토

**구현 장점:**
- Monaco Editor는 `@monaco-editor/react`로 쉽게 설치 가능
- 디버깅 목적으로 임의의 DB 쿼리를 웹에서 실행할 수 있으면 편리
- 개발자 도구로서의 완성도를 높임

**구현 시 보안 위험:**
```
위험 1: SQL 인젝션 — 사용자 입력 SQL을 그대로 실행하면 위험하지만,
        현재 시스템에서 SQL을 실행하는 주체는 인증된 관리자뿐이므로
        신뢰도는 높음. 하지만 실수로 인한 데이터 손상 가능성은 있음.

위험 2: 파괴적 쿼리 — DROP TABLE, DELETE, UPDATE 없는 WHERE 조건 등
        실수로 인한 데이터 손상을 방지하는 로직 필요.

위험 3: 성능 — 잘못된 쿼리(전체 테이블 스캔 등)로 인한 서버 부하.
```

**권장 구현 방식 (Phase 4+ 안전 구현):**
```typescript
// 안전한 SQL Editor 구현을 위한 제약
interface SqlEditorConfig {
  // 허용 쿼리 타입: SELECT만 허용 (기본값)
  allowedStatements: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[];
  // 실행 시간 제한 (ms)
  maxExecutionTimeMs: number;
  // 결과 행 수 제한
  maxResultRows: number;
  // 허용 테이블 (undefined = 모든 테이블)
  allowedTables?: string[];
}

const SAFE_CONFIG: SqlEditorConfig = {
  allowedStatements: ['SELECT'],   // 읽기 전용만
  maxExecutionTimeMs: 5000,        // 5초 제한
  maxResultRows: 1000,             // 최대 1000행
};
```

**Monaco Editor 설치:**
```typescript
// 설치
npm install @monaco-editor/react

// 사용 예시
import Editor from '@monaco-editor/react';

<Editor
  height="300px"
  language="sql"
  theme="vs-dark"
  value={query}
  onChange={(value) => setQuery(value || '')}
  options={{
    minimap: { enabled: false },
    fontSize: 14,
    wordWrap: 'on',
  }}
/>
```

**결론**: SQL Editor는 Phase 4+에서, SELECT 전용 읽기 모드로 구현한다. 쓰기 쿼리는 허용하지 않는다.

---

## 6. 스키마 시각화 (ERD)

### 6.1 Supabase Schema Visualizer 분석

Supabase의 스키마 시각화는 `react-flow` 기반으로 구현되어 있다. 테이블을 노드로, 외래키 관계를 엣지로 표현한다.

```
[노드 구조]
┌─────────────────┐
│  audit_events   │
├─────────────────┤
│ id (PK)    INT  │
│ action     TEXT │
│ user_ip    TEXT │
│ created_at INT  │
└─────────────────┘
```

### 6.2 우리 프로젝트 ERD 설계

현재 설계된 스키마의 관계도:

```
┌─────────────────────┐     ┌─────────────────────┐
│    audit_events     │     │       metrics        │
├─────────────────────┤     ├─────────────────────┤
│ id          INTEGER │     │ id          INTEGER  │
│ action      TEXT    │     │ cpu_percent INTEGER  │
│ user_ip     TEXT    │     │ mem_percent INTEGER  │
│ path        TEXT    │     │ disk_percent INTEGER │
│ method      TEXT    │     │ mem_used_mb INTEGER  │
│ status_code INTEGER │     │ disk_used_gb INTEGER │
│ details     TEXT    │     │ created_at  INTEGER  │
│ created_at  INTEGER │     └─────────────────────┘
└─────────────────────┘
                              ┌─────────────────────┐
                              │       settings      │
                              ├─────────────────────┤
                              │ key         TEXT PK  │
                              │ value       TEXT     │
                              │ updated_at  INTEGER  │
                              └─────────────────────┘

[Phase 3+ 추가 예정]
┌─────────────────────┐     ┌─────────────────────┐
│       users         │     │      sessions       │
├─────────────────────┤     ├─────────────────────┤
│ id          INTEGER │◄────│ user_id     INTEGER │
│ username    TEXT    │     │ token       TEXT    │
│ password_hash TEXT  │     │ expires_at  INTEGER │
│ role        TEXT    │     │ created_at  INTEGER │
│ created_at  INTEGER │     └─────────────────────┘
└─────────────────────┘

┌─────────────────────┐
│     alert_rules     │
├─────────────────────┤
│ id          INTEGER │
│ metric      TEXT    │
│ threshold   INTEGER │
│ operator    TEXT    │
│ channel     TEXT    │
│ enabled     INTEGER │
│ created_at  INTEGER │
└─────────────────────┘
```

### 6.3 react-flow 기반 ERD 구현 방안

```typescript
// 설치
npm install @xyflow/react

// 스키마 → react-flow 노드 변환 예시
import { ReactFlow, Node, Edge } from '@xyflow/react';

function schemaToFlowNodes(tables: TableSchema[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = tables.map((table, index) => ({
    id: table.name,
    type: 'tableNode',
    position: { x: (index % 3) * 300, y: Math.floor(index / 3) * 250 },
    data: { table },
  }));

  const edges: Edge[] = tables.flatMap((table) =>
    table.foreignKeys.map((fk) => ({
      id: `${table.name}-${fk.referencedTable}`,
      source: table.name,
      target: fk.referencedTable,
      type: 'smoothstep',
      label: fk.column,
    }))
  );

  return { nodes, edges };
}
```

**구현 우선순위**: Phase 4+. 현재 테이블 수(3~5개)가 너무 적어서 ERD의 가치가 낮다. Phase 3 이후 테이블이 7개 이상이 되면 구현 가치가 생긴다.

---

## 7. 단계별 구현 로드맵 상세

### 7.1 DB 초기화 스크립트

```typescript
// scripts/init-db.ts
// npm run db:init 으로 실행
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'dashboard.db');

// data 디렉토리가 없으면 생성
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('data/ 디렉토리 생성 완료');
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);

// drizzle-kit으로 생성된 마이그레이션 적용
migrate(db, { migrationsFolder: './drizzle' });

console.log('DB 초기화 완료:', DB_PATH);
sqlite.close();
```

**package.json 스크립트 추가:**
```json
{
  "scripts": {
    "db:init": "tsx scripts/init-db.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

**drizzle.config.ts:**
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/dashboard.db',
  },
});
```

### 7.2 감사 로그 영속화 migration

현재 `src/lib/audit-log.ts`의 인메모리 배열을 SQLite로 교체하는 작업:

```typescript
// src/lib/audit-log.ts (변경 후)
import { getDb } from './db';
import { auditEvents, type NewAuditEvent } from './schema';
import { desc, and, gte, lte, eq, like } from 'drizzle-orm';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PM2_RESTART'
  | 'PM2_STOP'
  | 'PM2_DELETE'
  | 'API_CALL';

export interface LogAuditEventParams {
  action: AuditAction;
  userIp?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

// 감사 이벤트 기록
export function logAuditEvent(params: LogAuditEventParams): void {
  const db = getDb();
  const event: NewAuditEvent = {
    action: params.action,
    userIp: params.userIp,
    path: params.path,
    method: params.method,
    statusCode: params.statusCode,
    details: params.details ? JSON.stringify(params.details) : undefined,
    createdAt: new Date(),
  };

  db.insert(auditEvents).values(event).run();
}

// 감사 이벤트 조회
export function getAuditEvents(params: {
  action?: string;
  ip?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}) {
  const db = getDb();
  const { action, ip, from, to, page = 1, limit = 50 } = params;

  const conditions = [];
  if (action) conditions.push(eq(auditEvents.action, action));
  if (ip) conditions.push(like(auditEvents.userIp, `%${ip}%`));
  if (from) conditions.push(gte(auditEvents.createdAt, from));
  if (to) conditions.push(lte(auditEvents.createdAt, to));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = db
    .select({ count: sql<number>`count(*)` })
    .from(auditEvents)
    .where(whereClause)
    .all();

  const data = db
    .select()
    .from(auditEvents)
    .where(whereClause)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
    .offset((page - 1) * limit)
    .all();

  return {
    data,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
}
```

### 7.3 메트릭 히스토리 영속화

```typescript
// src/lib/metrics-store.ts
import { getDb } from './db';
import { metrics, type NewMetric } from './schema';
import { desc, gte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// 메트릭 스냅샷 저장 (5분 간격 cron으로 호출)
export function saveMetricSnapshot(data: {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  memoryUsedMb?: number;
  diskUsedGb?: number;
}) {
  const db = getDb();
  db.insert(metrics).values({
    ...data,
    createdAt: new Date(),
  }).run();
}

// 최근 N시간 메트릭 조회
export function getMetricsHistory(hours: number = 1) {
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return db
    .select()
    .from(metrics)
    .where(gte(metrics.createdAt, since))
    .orderBy(desc(metrics.createdAt))
    .limit(hours * 12) // 5분 간격이면 시간당 12개
    .all();
}

// 오래된 메트릭 정리 (30일 이상)
export function cleanOldMetrics() {
  const db = getDb();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = db
    .delete(metrics)
    .where(sql`${metrics.createdAt} < ${cutoff}`)
    .run();

  return result.changes;
}
```

### 7.4 배포 스크립트 수정

DB 파일을 WSL2 배포 시 유지하도록 수정이 필요하다. 현재 배포 스크립트는 `rm -rf src .next`를 실행하는데, `data/` 디렉토리는 삭제하지 않도록 수정한다.

```bash
# 현재 배포 스크립트 (next-dev-prompt.md 참조)
rm -rf src .next

# 수정 후 (data/ 디렉토리는 보존)
rm -rf src .next
# data/dashboard.db는 삭제하지 않음!

# 배포 후 마이그레이션 실행
npm run db:migrate
```

---

## 8. 보안 고려사항

### 8.1 DB 파일 보안

```
[파일 시스템 보안]
- data/dashboard.db 파일의 접근 권한: chmod 600 (소유자만 읽기/쓰기)
- .gitignore에 data/ 추가 (DB 파일 Git 업로드 방지)
- .env.example에 DB_PATH 환경변수 예시 추가

[경로 설정]
# .env.local
DB_PATH=./data/dashboard.db
```

```
# .gitignore에 추가
data/
!data/.gitkeep
```

### 8.2 쿼리 보안

```typescript
// 항상 prepared statement 사용 (SQL 인젝션 방지)
// Drizzle ORM은 자동으로 prepared statement를 사용함

// 잘못된 예 (직접 SQL 문자열 결합)
const result = db.prepare(
  `SELECT * FROM audit_events WHERE action = '${userInput}'`  // 위험!
).all();

// 올바른 예 (파라미터 바인딩)
const result = db
  .select()
  .from(auditEvents)
  .where(eq(auditEvents.action, userInput))  // Drizzle이 자동으로 바인딩
  .all();
```

### 8.3 민감 데이터 처리

```typescript
// 패스워드 해시 절대 클라이언트 응답에 포함 금지
// 사용자 테이블에서 SELECT 시 passwordHash 필드 제외
const users = db
  .select({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
    // passwordHash: usersTable.passwordHash  ← 제외!
  })
  .from(usersTable)
  .all();
```

---

## 9. 참고 자료 및 공식 문서

### 9.1 라이브러리 공식 문서

- better-sqlite3: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
- Drizzle ORM: https://orm.drizzle.team/docs/get-started-sqlite
- Drizzle + better-sqlite3: https://orm.drizzle.team/docs/get-started-sqlite#better-sqlite3
- drizzle-kit (마이그레이션): https://orm.drizzle.team/kit-docs/overview
- TanStack Table: https://tanstack.com/table/latest/docs/introduction
- Monaco Editor React: https://github.com/suren-atoyan/monaco-react
- react-flow (스키마 시각화): https://reactflow.dev/docs/quickstart/

### 9.2 관련 Wave 1 문서

- Supabase Table Editor 상세: `docs/platform-evolution-wave/wave-1/01-supabase-dashboard-anatomy.md`
- 갭 분석 (DB 관리 섹션): `docs/platform-evolution-wave/wave-1/06-feature-gap-analysis.md`
- 기능 우선순위: `docs/platform-evolution-wave/wave-2-3/01-feature-priority-matrix.md`

### 9.3 현재 코드베이스 참고

```
src/lib/audit-log.ts          ← 감사 로그 (인메모리 → SQLite 교체 대상)
src/lib/rate-limit.ts         ← Rate Limiting (인메모리 유지, 로그만 DB로)
src/app/api/audit/route.ts    ← 감사 로그 API (이미 존재)
src/middleware.ts             ← 미들웨어 (IP 화이트리스트 추가 예정)
```

---

[← 01-feature-priority-matrix.md](./01-feature-priority-matrix.md) | [← README.md](../README.md)
