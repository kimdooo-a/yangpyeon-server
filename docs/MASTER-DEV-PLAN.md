# 양평 부엌 서버 대시보드 — 마스터 개발 계획서

> 작성일: 2026-04-06  
> 근거: Supabase Wave (46문서) + Platform Evolution Wave (20문서) 종합  
> 목적: 세션별 실행 가능한 상세 개발 로드맵. 각 세션 시작 시 이 파일을 참조한다.

---

## 0. 프로젝트 비전

> **"집에서 운영하는 서버도 프로덕션처럼 — 양평 부엌의 모든 데이터와 프로세스를 하나의 대시보드에서 안전하게 관리한다."**

### 현재 상태 (Phase 10 완료)

| 항목 | 현재 | 목표 |
|------|------|------|
| 인증 | JWT 쿠키 + 하드코딩 비밀번호 | bcrypt + DB 사용자 |
| 감사 로그 | 인메모리 (PM2 재시작 시 휘발) | SQLite 영속화 |
| DB | 없음 | SQLite + Drizzle ORM |
| 실시간 | 3-5초 폴링 | SSE (Server-Sent Events) |
| 입력 검증 | 없음 | Zod 전체 적용 |
| UI | 커스텀 Tailwind | shadcn/ui (점진 전환) |
| 알림 | 없음 | 웹훅 + 이메일 |

### 확정 기술 스택 (Wave 4+5 결정)

| 레이어 | 기술 | 선택 이유 |
|--------|------|----------|
| DB | SQLite (better-sqlite3) | 제로 설정, 단일 파일, 동기 API |
| ORM | Drizzle ORM | TypeScript 퍼스트, 경량 |
| UI | shadcn/ui + Tailwind CSS 4 | Radix 기반, 접근성 |
| 테이블 | TanStack Table v8 | Headless, 유연 |
| 실시간 | SSE | 단방향 충분, 폴링 대비 95% 절감 |
| Auth | 직접 구현 + bcrypt | 1인 운영, OAuth 불필요 |
| 코드 에디터 | Monaco Editor | SQL Editor용 |
| 토스트 | Sonner (~4KB) | 가벼움, 다크 테마 |
| 검증 | Zod | Next.js 생태계 표준 |
| 차트 | Recharts | React 생태계, SVG 기반 |
| 커맨드 | cmdk | shadcn Command 기반 |

---

## 1. 전체 로드맵 개요

```
                    Phase 11          Phase 12          Phase 13
                  Quick Win +       모니터링 강화      Auth + UX
                  DB 기반 구축                          완성
세션 ──→  S05 ─── S06 ─── S07 ─── S08 ─── S09 ─── S10 ─── S11 ─── ...
          SPIKE   Zod     SQLite   메트릭   SSE     감사    Auth
          검증    Toast   Drizzle  차트     실시간   로그UI  bcrypt

                    Phase 14              Phase 15
                  데이터 관리           자율 운영 체계
세션 ──→  S12 ─── S13 ─── S14 ─── S15 ─── S16
          Table   CRUD    SQL     파일     알림
          Viewer  Editor  Editor  매니저   시스템

총 예상: 12-15 세션 (세션당 3-4시간)
```

### Phase별 요약

| Phase | 제목 | 핵심 결과물 | 예상 세션 | 선행 조건 |
|-------|------|------------|---------|---------|
| SPIKE | 기술 검증 | 5개 스파이크 실험 결과 | 1 | 없음 |
| 11 | Quick Win + DB | Zod + Sonner + SQLite + 감사 로그 영속화 | 2-3 | SPIKE-01 |
| 12 | 모니터링 강화 | 메트릭 차트 + SSE 실시간 + 감사 로그 UI | 2-3 | Phase 11 |
| 13 | Auth + UX | DB 인증 + 다중 사용자 + Cmd+K | 2 | Phase 11 |
| 14 | 데이터 플랫폼 | Table Editor + SQL Editor | 3-4 | Phase 13 |
| 15 | 자율 운영 | 파일 매니저 + 알림 + shadcn 전환 | 2-3 | Phase 12+14 |

---

## 2. 세션별 상세 계획

---

### 세션 5: SPIKE 기술 검증

**목표**: Phase 11-15의 기술적 불확실성 해소  
**시간 예산**: 3-4시간

#### 작업 목록

| 순서 | 스파이크 | 검증 내용 | 시간 | 병렬 |
|------|---------|----------|------|------|
| 1 | SPIKE-01 | SQLite + Drizzle + Next.js 빌드 | 2h | ✅ SPIKE-04와 |
| 1 | SPIKE-04 | shadcn/ui 기존 다크 테마 호환 | 1h | ✅ SPIKE-01과 |
| 2 | SPIKE-02 | SSE + Cloudflare Tunnel 통과 | 1h | 후속 |

#### SPIKE-01: SQLite + Drizzle 통합 (2시간)

```
검증 항목:
1. better-sqlite3 npm install + Next.js build 성공 여부
2. webpack externals 설정 필요 여부
3. WAL 모드 + WSL2 파일시스템 호환
4. API Route에서 CRUD 동작
5. PM2 클러스터 모드 동시 접근

성공 기준: npm run build 통과 + CRUD 정상
실패 시 대안: sql.js (WASM, 네이티브 모듈 불필요)
```

실행 코드:
```bash
# spike/ 디렉토리에서 격리 실행
mkdir -p spike/sqlite-drizzle
cd spike/sqlite-drizzle
npm init -y
npm install better-sqlite3 drizzle-orm
npm install -D @types/better-sqlite3 drizzle-kit
# → 빌드 테스트 스크립트 작성
```

next.config.ts 확인 사항:
```typescript
// better-sqlite3 네이티브 모듈을 webpack 번들에서 제외
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
}
```

#### SPIKE-04: shadcn/ui 호환 (1시간)

```
검증 항목:
1. npx shadcn@latest init → 기존 Tailwind CSS 4 설정과 충돌 여부
2. 다크 테마 CSS 변수 호환
3. 기존 커스텀 컴포넌트와 공존 가능 여부

성공 기준: Button + Card + Dialog 추가 후 빌드 통과
실패 시 대안: Radix UI 직접 사용 (shadcn 없이)
```

#### SPIKE-02: SSE + Cloudflare Tunnel (1시간)

```
검증 항목:
1. Next.js Route Handler에서 ReadableStream + text/event-stream 응답
2. Cloudflare Tunnel 경유 시 버퍼링 방지 (X-Accel-Buffering: no)
3. PM2 재시작 후 EventSource 자동 재연결

성공 기준: 외부 URL에서 SSE 이벤트 5초 간격 수신 확인
실패 시 대안: 폴링 유지 (간격 10초로 늘려 부하 절감)
```

#### 세션 5 완료 기준

- [x] SPIKE-01 결과 기록 (성공 — `spikes/spike-001-sqlite-drizzle-result.md`)
- [x] SPIKE-04 결과 기록 (성공 — `spikes/spike-004-shadcn-result.md`)
- [x] SPIKE-02 결과 기록 (성공 — `spikes/spike-002-sse-result.md`)
- [x] `spike/` 디렉토리 정리 → `spikes/` + `docs/research/`로 관리
- [x] next.config.ts: `serverExternalPackages: ['better-sqlite3']`

#### 세션 5 인수인계 포인트

```
기록할 내용:
- webpack externals 설정 여부 + 정확한 설정값
- shadcn init 시 선택한 옵션 (style, base color, CSS variables)
- SSE Cloudflare 통과 여부 + 필요 헤더
- 실패한 스파이크가 있다면 대안 결정
```

---

### 세션 6: Phase 11a+11b — Zod + 토스트

**목표**: 입력 검증 + 사용자 피드백 시스템 기반 구축  
**시간 예산**: 3-4시간  
**선행 조건**: 없음 (SPIKE 결과와 독립)

#### Phase 11a: Zod 입력 검증 (1.5-2시간)

설치:
```bash
npm install zod
```

신규 파일:
```
src/lib/validators.ts                ← 공통 Zod 스키마 모음
```

수정 파일:
```
src/app/api/auth/login/route.ts      ← loginSchema
src/app/api/pm2/[action]/route.ts    ← pm2ActionSchema + processNameSchema
src/app/api/pm2/detail/route.ts      ← querySchema
src/app/api/audit/route.ts           ← auditQuerySchema
src/app/api/system/route.ts          ← body 파싱 제거
src/app/api/logs/route.ts            ← logsQuerySchema
```

핵심 스키마:
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
})

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  action: z.string().optional(),
})
```

검증:
```bash
# 악의적 입력 테스트
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -d '{"password": ""}'
# → 400 Bad Request

curl -X POST http://localhost:3000/api/pm2/restart \
  -H "Content-Type: application/json" -d '{"name": "../../etc/passwd"}'
# → 400 Bad Request
```

#### Phase 11b: 토스트 알림 (1-1.5시간)

설치:
```bash
npm install sonner
```

수정/신규 파일:
```
src/app/layout.tsx                   ← <Toaster /> 추가
src/hooks/use-pm2-action.ts          ← 신규: PM2 액션 훅 (toast 포함)
src/components/processes/*           ← usePm2Action 훅 사용으로 교체
```

#### Phase 11c: 로그 다운로드 + 고급 필터 (1시간, 시간 남을 경우)

신규 파일:
```
src/app/api/logs/download/route.ts   ← 파일 다운로드 엔드포인트
src/components/logs/log-filters.tsx  ← 필터 패널
```

#### 세션 6 완료 기준

- [x] 모든 API Route에 Zod 스키마 적용
- [x] 잘못된 입력에 400 응답 반환
- [x] PM2 액션 시 로딩/성공/실패 토스트
- [x] `npm run build` 통과
- [ ] (선택) 로그 다운로드 TXT/JSON

---

### 세션 7: Phase 11d+11e — SQLite + 감사 로그 영속화

**목표**: 인메모리 → DB 전환의 핵심 마이그레이션  
**시간 예산**: 3-4시간  
**선행 조건**: SPIKE-01 성공

#### Phase 11d: SQLite + Drizzle 도입 (2-3시간)

설치:
```bash
npm install better-sqlite3 drizzle-orm
npm install -D @types/better-sqlite3 drizzle-kit
```

신규 파일:
```
src/lib/db/index.ts                  ← DB 연결 싱글톤
src/lib/db/schema.ts                 ← 초기 스키마 (3 테이블)
src/lib/db/migrations/               ← 자동 생성
drizzle.config.ts                    ← Drizzle Kit 설정
data/                                ← SQLite 파일 디렉토리
```

초기 스키마 (3 테이블):
```
audit_logs      — 감사 로그 (인메모리 → DB)
metrics_history — 시스템 메트릭 히스토리 (Phase 12 선행)
ip_whitelist    — IP 화이트리스트 (Phase 11f 선행)
```

수정 파일:
```
next.config.ts                       ← serverExternalPackages: ['better-sqlite3']
.gitignore                           ← data/*.db 추가
package.json                         ← db:generate, db:migrate, db:studio 스크립트
```

검증:
```bash
npm run db:generate && npm run db:migrate
ls -la data/dashboard.db
npm run build
```

#### Phase 11e: 감사 로그 인메모리 → DB (1-1.5시간)

신규 파일:
```
src/lib/db/queries/audit.ts          ← 감사 로그 전용 쿼리
```

수정 파일:
```
src/lib/audit-log.ts                 ← Map → Drizzle 쿼리로 교체
src/app/api/audit/route.ts           ← DB 쿼리로 교체
```

검증:
```
1. 로그인/로그아웃 → DB에 감사 로그 저장 확인
2. PM2 재시작 → 감사 로그 유지 확인
3. /api/audit → DB에서 조회 정상
```

#### 세션 7 완료 기준

- [x] `data/dashboard.db` 파일 생성
- [x] `audit_logs`, `metrics_history`, `ip_whitelist` 테이블 존재
- [x] PM2 재시작 후 감사 로그 유지
- [x] `npm run build` 통과

---

### 세션 8: Phase 11f + Phase 12a — IP 화이트리스트 + 메트릭 히스토리

**목표**: 보안 레이어 추가 + 모니터링 데이터 영속화 시작  
**시간 예산**: 3-4시간

#### Phase 11f: IP 화이트리스트 (1.5-2시간)

신규 파일:
```
src/lib/ip-whitelist.ts              ← 화이트리스트 조회 유틸
src/app/api/settings/ip-whitelist/route.ts ← CRUD API
src/app/settings/ip-whitelist/page.tsx     ← 관리 UI
```

수정 파일:
```
src/middleware.ts                     ← IP 검사 로직 추가
```

보안 주의:
```
- Cloudflare Tunnel 경유 시 CF-Connecting-IP 헤더 사용
- 화이트리스트 비어있으면 모든 IP 허용 (잠금 방지)
- 환경변수 IP_WHITELIST_ENABLED=true로 활성화
```

#### Phase 12a: 메트릭 히스토리 DB 저장 + 차트 (2-2.5시간)

설치:
```bash
npm install recharts
```

신규 파일:
```
src/lib/metrics-collector.ts         ← 1분마다 시스템 메트릭 수집 → DB
src/app/api/metrics/history/route.ts ← 시계열 데이터 API
src/app/metrics/page.tsx             ← 차트 페이지
src/components/charts/
├── cpu-history-chart.tsx
├── memory-history-chart.tsx
└── metrics-chart-container.tsx
```

차트 시간 범위:
```
[1h] → 1분 해상도, 60 포인트
[24h] → 5분 해상도, 288 포인트
[7d] → 1시간 해상도, 168 포인트
[30d] → 6시간 해상도, 120 포인트
```

보관 정책: 30일 후 자동 삭제

#### 세션 8 완료 기준

- [x] IP 화이트리스트 CRUD 동작
- [x] 미허용 IP → 403 응답
- [x] 메트릭 1분마다 DB 저장
- [x] `/metrics` 차트 페이지 동작
- [x] 시간 범위 전환 (1h/24h/7d/30d)

---

### 세션 9: Phase 12b — SSE 실시간 스트리밍

**목표**: 폴링을 SSE로 전면 교체  
**시간 예산**: 3-4시간  
**선행 조건**: SPIKE-02 성공

#### SSE 엔드포인트 (3개)

신규 파일:
```
src/app/api/sse/metrics/route.ts     ← 시스템 메트릭 (5초 간격)
src/app/api/sse/pm2/route.ts         ← PM2 프로세스 상태
src/app/api/sse/logs/route.ts        ← 실시간 로그 테일

src/hooks/
├── use-sse-metrics.ts               ← SSE 구독 훅
├── use-sse-pm2.ts
└── use-sse-logs.ts
```

수정 파일:
```
src/components/dashboard/stat-card.tsx  ← usePolling → useSseMetrics
src/components/dashboard/mini-chart.tsx ← 동일
src/app/processes/page.tsx              ← usePolling → useSsePm2
src/app/logs/page.tsx                   ← usePolling → useSseLogs
```

핵심 헤더 (Cloudflare Tunnel 통과):
```typescript
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // 버퍼링 방지
  },
})
```

폴백: SSE 3회 실패 → 30초 폴링 전환 + 사용자 알림

#### 세션 9 완료 기준

- [x] 대시보드 메트릭 SSE 실시간 업데이트
- [x] PM2 프로세스 상태 실시간
- [x] 로그 실시간 테일링
- [x] 연결 상태 인디케이터 (헤더에 녹/회 점)
- [ ] Cloudflare Tunnel 경유 정상 동작 (배포 후 검증 필요)
- [x] PM2 재시작 시 자동 재연결 (use-sse 폴백)

---

### 세션 10: Phase 12c+12d — 감사 로그 UI + 환경변수 관리

**목표**: 운영 가시성 완성  
**시간 예산**: 3-4시간

#### Phase 12c: 감사 로그 전용 페이지 (2시간)

설치:
```bash
npm install @tanstack/react-table
```

신규 파일:
```
src/app/audit/page.tsx               ← 감사 로그 페이지
src/components/audit/
├── audit-log-table.tsx              ← TanStack Table 기반
├── audit-filters.tsx                ← 필터 패널
└── audit-export.tsx                 ← CSV/JSON 내보내기
```

수정 파일:
```
src/app/api/audit/route.ts           ← 페이지네이션 + 필터 추가
```

UI:
```
┌─────────────────────────────────────────────┐
│ 감사 로그              [CSV 내보내기] [JSON] │
├──────────────────────────────────────────────┤
│ 필터: [액션 ▼] [결과 ▼] [IP 검색] [기간 ▼]  │
├──────────────────────────────────────────────┤
│ 시간 | 액션 | IP | 사용자 | 결과 | 상세      │
├──────────────────────────────────────────────┤
│ [← 이전] 1 / 25 [다음 →]   50개씩 보기 ▼    │
└─────────────────────────────────────────────┘
```

#### Phase 12d: 환경변수 관리 UI (1.5-2시간)

신규 파일:
```
src/app/api/env/route.ts             ← 환경변수 CRUD API
src/app/settings/env/page.tsx        ← 관리 페이지
src/components/settings/env-editor.tsx ← Key-Value 편집기
```

보안: 민감 키(SECRET, KEY, TOKEN, PASSWORD) → 마스킹 표시

#### 세션 10 완료 기준

- [x] 감사 로그 테이블 페이지네이션 (50개씩)
- [x] 액션/결과/IP/기간 필터
- [x] CSV 내보내기
- [x] 환경변수 목록 조회 (마스킹)
- [x] 환경변수 추가/수정

---

### 세션 11: Phase 13a+13b — DB 인증 + 다중 사용자

**목표**: 하드코딩 비밀번호 → DB 기반 인증 전환  
**시간 예산**: 3-4시간

#### Phase 13a: DB 기반 사용자 인증 (2시간)

설치:
```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

스키마 추가 (`src/lib/db/schema.ts`):
```typescript
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull().default('viewer'),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
})
```

마이그레이션 전략:
```
1. users 테이블 생성
2. 기존 ADMIN_PASSWORD → bcrypt 해시 → admin 계정 자동 생성
3. auth/login → users 테이블 조회로 전환
4. 환경변수 fallback 30일 유지 (비상 접근)
5. 30일 후 환경변수 방식 제거
```

#### Phase 13b: 다중 사용자 + 역할 (1.5-2시간)

역할 권한:
```
| 기능              | admin | viewer |
|-------------------|-------|--------|
| 대시보드/로그 조회  | ✅    | ✅     |
| PM2 액션          | ✅    | ❌     |
| 감사 로그 조회     | ✅    | ❌     |
| 환경변수/설정      | ✅    | ❌     |
| 사용자 관리        | ✅    | ❌     |
```

수정 파일:
```
src/middleware.ts                    ← JWT에 role 포함, 라우트별 권한
src/app/api/auth/login/route.ts     ← users 테이블 조회
src/app/api/users/route.ts          ← 신규: 사용자 CRUD (admin only)
```

#### 세션 11 완료 기준

- [x] bcrypt 기반 DB 인증 동작 (PostgreSQL User + Prisma)
- [x] admin 계정: kimdooo@stylelucky4u.com (DB 직접 삽입)
- [x] 비밀번호 변경 API (/api/v1/auth/password)
- [x] viewer 계정 생성/로그인 (/settings/users)
- [x] viewer → PM2 액션 시 403 (미들웨어 ADMIN_ONLY_PATHS)

---

### 세션 12: Phase 13c+13d — Command Menu + 스켈레톤 UI

**목표**: UX 완성도 향상  
**시간 예산**: 3-4시간

#### Phase 13c: Command Menu — Cmd+K (2시간)

설치:
```bash
npm install cmdk
```

신규 파일:
```
src/components/command-menu.tsx      ← Cmd+K 커맨드 팔레트
```

명령어 목록:
```
내비게이션: 홈, 프로세스, 로그, 메트릭, 감사 로그, 설정
액션: 모든 프로세스 재시작, 로그 다운로드, 테마 전환
```

#### Phase 13d: 스켈레톤 로딩 + 빈 상태 (1.5-2시간)

```bash
npx shadcn@latest add skeleton
```

수정 파일:
```
src/app/page.tsx                     ← 메트릭 카드 스켈레톤
src/app/processes/page.tsx           ← 프로세스 목록 스켈레톤
src/app/logs/page.tsx                ← 로그 라인 스켈레톤
src/components/ui/empty-state.tsx    ← 신규: 빈 상태 공통 컴포넌트
```

#### 세션 12 완료 기준

- [x] Cmd+K / Ctrl+K 동작
- [x] 명령어 타이핑 필터링
- [ ] 모든 데이터 로딩 시 스켈레톤 (보류 — 테마 작업 후 진행)
- [ ] 빈 상태 메시지 (보류)

---

### 세션 13-14: Phase 14a+14b — Table Editor

**목표**: SQLite 데이터를 웹에서 조회/편집  
**시간 예산**: 6-8시간 (2 세션)

#### 세션 13: Phase 14a — 읽기 전용 Table Viewer (3-4시간)

신규 파일:
```
src/app/api/tables/route.ts          ← 테이블 목록
src/app/api/tables/[table]/route.ts  ← 테이블 데이터 조회
src/app/api/tables/[table]/schema/route.ts ← 스키마 정보

src/app/tables/page.tsx              ← 테이블 목록 + 에디터 레이아웃
src/app/tables/[table]/page.tsx      ← 데이터 뷰

src/components/table-editor/
├── table-list-sidebar.tsx           ← 좌측 테이블 목록
├── table-data-grid.tsx              ← TanStack Table 그리드
└── column-type-badge.tsx            ← 컬럼 타입 배지
```

#### 세션 14: Phase 14b — CRUD 지원 (3-4시간)

수정/신규 파일:
```
src/app/api/tables/[table]/rows/route.ts  ← 행 추가/수정/삭제 API
src/components/table-editor/
├── inline-cell-editor.tsx           ← 셀 인라인 편집
├── add-row-dialog.tsx               ← 행 추가 다이얼로그
└── delete-confirm.tsx               ← 삭제 확인
```

보안:
```
- admin만 수정 가능
- system_ 접두사 테이블 수정 불가
- 모든 CRUD → 감사 로그 기록
- 배치 삭제 최대 100행
```

#### 세션 13-14 완료 기준

- [ ] 모든 SQLite 테이블 목록 표시
- [ ] 데이터 페이지네이션 + 정렬 + 검색
- [ ] 행 추가/수정/삭제
- [ ] 변경 시 감사 로그

---

### 세션 15: Phase 14c — SQL Editor

**목표**: Monaco Editor 기반 SQL 쿼리 실행  
**시간 예산**: 3-4시간  
**선행 조건**: SPIKE-03 완료 (Monaco 번들 크기 확인)

설치:
```bash
npm install @monaco-editor/react
```

신규 파일:
```
src/app/api/sql/execute/route.ts     ← SQL 실행 (SELECT only)
src/app/sql/page.tsx                 ← SQL Editor 페이지

src/components/sql-editor/
├── monaco-sql-editor.tsx            ← dynamic import, SSR 비활성화
├── query-result-table.tsx           ← 결과 TanStack Table
└── query-history.tsx                ← 최근 쿼리 (localStorage)
```

보안:
```typescript
// SELECT만 허용
const FORBIDDEN = ['DROP','DELETE','UPDATE','INSERT','CREATE','ALTER','TRUNCATE']
function isSafe(sql: string): boolean {
  const upper = sql.toUpperCase().trim()
  if (!upper.startsWith('SELECT')) return false
  return !FORBIDDEN.some(kw => upper.includes(kw))
}
```

#### 세션 15 완료 기준

- [ ] Monaco Editor SQL 하이라이팅
- [ ] SELECT 쿼리 실행 + 결과 테이블
- [ ] 비SELECT → 에러 메시지
- [ ] Ctrl+Enter 실행
- [ ] 쿼리 이력 (최근 20개)

---

### 세션 16: Phase 15a — 파일 매니저

**목표**: 서버 파일 시스템 웹 탐색 + 다운로드  
**시간 예산**: 3-4시간  
**선행 조건**: SPIKE-05 완료

신규 파일:
```
src/app/api/files/route.ts           ← 디렉토리 목록
src/app/api/files/download/route.ts  ← 파일 다운로드
src/app/api/files/upload/route.ts    ← 파일 업로드

src/app/files/page.tsx               ← 파일 매니저 페이지
src/components/file-manager/
├── file-tree.tsx                    ← 디렉토리 트리
├── file-list.tsx                    ← 파일 목록
└── file-toolbar.tsx                 ← 업로드/다운로드 버튼
```

보안:
```
- 허용 루트만 탐색 (FILE_MANAGER_ROOTS 환경변수)
- 경로 트래버설 방지 (resolve → startsWith 검증)
- 파일 업로드 크기/타입 제한
```

#### 세션 16 완료 기준

- [ ] 허용 디렉토리 탐색
- [ ] 파일 다운로드
- [ ] 파일 업로드 (크기 제한)
- [ ] 경로 트래버설 방어

---

### 세션 17: Phase 15b — 알림 규칙 시스템

**목표**: 임계치 초과 시 자동 알림 (웹훅 우선)  
**시간 예산**: 3-4시간

스키마 추가:
```typescript
export const alertRules = sqliteTable('alert_rules', {
  id, name, metric, operator, threshold, duration,
  channel, target, isActive, lastTriggeredAt, cooldownSeconds
})
```

신규 파일:
```
src/app/api/alerts/route.ts          ← 알림 규칙 CRUD
src/app/alerts/page.tsx              ← 알림 관리 페이지
src/lib/alert-engine.ts              ← 임계치 모니터링 엔진
src/components/alerts/
├── alert-rule-form.tsx              ← 규칙 생성/수정 폼
└── alert-event-list.tsx             ← 알림 이력
```

채널 우선순위: 웹훅 (Discord/Slack) → 이메일 → 브라우저 푸시

#### 세션 17 완료 기준

- [ ] 알림 규칙 CRUD
- [ ] CPU 80% 초과 5분 → 웹훅 발송
- [ ] 쿨다운 (같은 알림 중복 방지)
- [ ] 알림 이력 DB 저장

---

### 세션 18 (최종): Phase 15c — shadcn/ui 전면 전환 + 마무리

**목표**: UI 일관성 완성 + 전체 점검  
**시간 예산**: 3-4시간

교체 대상:
```
커스텀 Button → shadcn Button
커스텀 Card   → shadcn Card
커스텀 Modal  → shadcn Dialog
커스텀 Badge  → shadcn Badge
커스텀 Input  → shadcn Input
```

전략: 한 페이지씩 점진 교체, 기능 회귀 없음 확인

#### 세션 18 완료 기준

- [ ] 주요 컴포넌트 shadcn 전환
- [ ] 다크 테마 일관성
- [ ] 전체 빌드 통과
- [ ] 전체 기능 E2E 점검

---

## 3. 의존성 그래프

```
SPIKE-01 ─────→ Phase 11d (SQLite) ───→ Phase 11e (감사 로그 DB)
                                    ├──→ Phase 11f (IP 화이트리스트)
                                    ├──→ Phase 12a (메트릭 히스토리)
                                    └──→ Phase 13a (DB 인증)

SPIKE-02 ─────→ Phase 12b (SSE)

SPIKE-03 ─────→ Phase 14c (SQL Editor, Monaco)

SPIKE-04 ─────→ Phase 15c (shadcn 전환)

SPIKE-05 ─────→ Phase 15a (파일 업로드)

Phase 11a (Zod)    ← 독립, 언제든 가능
Phase 11b (Toast)  ← 독립, 언제든 가능
Phase 12c (감사 UI) ← Phase 11e 후
Phase 12d (환경변수) ← 독립
Phase 13b (다중 사용자) ← Phase 13a 후
Phase 13c (Cmd+K)  ← Phase 11b 후
Phase 14a (Table Viewer) ← Phase 11d 후
Phase 14b (CRUD)   ← Phase 14a 후
Phase 15b (알림)   ← Phase 12a 후
```

### 병렬 실행 가능 조합

```
세션 6: Phase 11a + 11b (병렬 — 독립적)
세션 7: Phase 11d → 11e (순차 — 의존성)
세션 8: Phase 11f + 12a (병렬 — 11d만 의존)
세션 10: Phase 12c + 12d (병렬 — 독립적)
세션 11: Phase 13a → 13b (순차 — 의존성)
```

---

## 4. 위험 관리

| Phase | 최대 위험 | 대응 | 롤백 |
|-------|----------|------|------|
| 11d | better-sqlite3 빌드 오류 | SPIKE-01 선행 | sql.js (WASM) |
| 12b | SSE Cloudflare 버퍼링 | SPIKE-02 선행, X-Accel-Buffering | 폴링 유지 |
| 13a | DB 인증 전환 시 세션 무효화 | 30일 환경변수 fallback | 환경변수 롤백 |
| 14c | Monaco 번들 과대 | SPIKE-03 선행, dynamic import | CodeMirror 6 |
| 15b | 알림 스팸 | 쿨다운 기본 300초 | 일괄 비활성화 |

### 공통 안전 규칙

1. 각 Phase 시작 시 `npm run build` 통과 확인
2. DB 변경 전 `data/dashboard.db` 백업
3. 인증 변경 시 admin 계정 유지 확인
4. 긴급 탈출: `IP_WHITELIST_ENABLED=false` 환경변수

---

## 5. 스코프 조정 규칙

### 절대 삭감 불가 (보안/기반)

```
✅ Zod 입력 검증
✅ SQLite + Drizzle (기반 인프라)
✅ 감사 로그 영속화
✅ bcrypt 기반 인증
✅ SSE 실시간 (폴링 교체)
```

### 세션 초과 시 이월 가능

```
⏭ IP 화이트리스트 UI (환경변수로 임시 대체)
⏭ 감사 로그 CSV 내보내기
⏭ 스켈레톤 로딩 UI
⏭ 환경변수 관리 UI
```

### 완전 제거 가능

```
❌ Phase 14d 스키마 시각화 ERD (SQL PRAGMA로 대체)
❌ 브라우저 푸시 알림 (웹훅으로 충분)
❌ Phase 15c 전면 전환 (점진적 교체로 충분)
```

### MVP 우선 원칙

```
Table Editor: 읽기 전용 → CRUD
SQL Editor:   SELECT only → 완전 쿼리
파일 매니저:   다운로드 → 업로드
알림:         웹훅 → 이메일 → 푸시
```

---

## 6. 패키지 버전 잠금

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

---

## 7. 세션 운영 프로토콜

### 세션 시작 시

```
1. 이 파일(MASTER-DEV-PLAN.md)에서 해당 세션 섹션 확인
2. docs/status/current.md 현재 상태 확인
3. 최신 docs/handover/ 인수인계서 확인
4. 이전 세션 완료 기준 체크
```

### 세션 종료 시

```
1. 해당 세션 완료 기준 체크리스트 업데이트
2. docs/status/current.md 세션 요약 1행 추가
3. docs/handover/ 인수인계서 작성
4. docs/handover/next-dev-prompt.md 갱신
5. npm run build 최종 통과 확인
6. git commit + push
```

### 세션 번호 매핑

| 세션 번호 | Phase | 핵심 작업 |
|-----------|-------|----------|
| 5 | SPIKE | 기술 검증 (SQLite, SSE, shadcn) |
| 6 | 11a+11b | Zod + 토스트 |
| 7 | 11d+11e | SQLite + 감사 로그 영속화 |
| 8 | 11f+12a | IP 화이트리스트 + 메트릭 차트 |
| 9 | 12b | SSE 실시간 스트리밍 |
| 10 | 12c+12d | 감사 로그 UI + 환경변수 관리 |
| 11 | 13a+13b | DB 인증 + 다중 사용자 |
| 12 | 13c+13d | Command Menu + 스켈레톤 |
| 13 | 14a | Table Editor (읽기) |
| 14 | 14b | Table Editor (CRUD) |
| 15 | 14c | SQL Editor (Monaco) |
| 16 | 15a | 파일 매니저 |
| 17 | 15b | 알림 시스템 |
| 18 | 15c | shadcn 전환 + 마무리 |

---

## 부록: 세션 14 — Supabase 프로젝트 관리 체계 이식 (2026-04-12 추가)

세션 13(DB 인증 + Warm Ivory 테마) 완료 직후, 사용자가 Supabase 대시보드 13개 페이지의 관리 체계를 이식 요청. 기존 Phase 14(Table/SQL Editor)를 **Supabase 모델 이식 Phase 14-S**로 확장.

**범위**: P0 11개 모듈 병렬 구현. Option B(Supabase UI 학습 + Next.js 네이티브 재구현) — 상세는 ADR-002.

| # | 모듈 | 경로 | Prisma 모델 |
|---|------|------|-------------|
| 1 | SQL Editor | `/sql-editor` | `SqlQuery` |
| 2 | Schema Visualizer | `/database/schema` | — |
| 3 | Advisors Security | `/advisors/security` | — |
| 4 | Advisors Performance | `/advisors/performance` | — |
| 5 | Edge Functions (lite) | `/functions` | `EdgeFunction`, `EdgeFunctionRun` |
| 6 | Realtime Channels | `/realtime` | — |
| 7 | Data API | `/data-api` + `/api/v1/data/[table]` | — |
| 8 | Database Webhooks | `/database/webhooks` | `Webhook` |
| 9 | Cron Jobs | `/database/cron` | `CronJob` |
| 10 | API Keys | `/settings/api-keys` | `ApiKey` |
| 11 | Backups (dev DB UI) | `/database/backups` | — |
| 12 | Log Drains | `/settings/log-drains` | `LogDrain` |

**상세 실행 계획**: `C:\Users\smart\.claude\plans\indexed-knitting-reef.md`  
**근거 문서**:
- 스크랩: `docs/references/supabase-scrape/` (14 files)
- 기술 매핑: `docs/references/_SUPABASE_TECH_MAP.md`
- 갭 분석: `docs/references/_PROJECT_VS_SUPABASE_GAP.md`
- 결정: `docs/research/decisions/ADR-002-supabase-adaptation-strategy.md`
- 스파이크: `docs/research/spikes/spike-005-*.md` (5 files)

**DAG**: L0 (Prisma + types + sidebar 계약) → L1 (introspect/isolated-runner 공유 기반) → L2 (11개 모듈 병렬) → L3 (사이드바 라우팅 + RBAC 통합 + migrate dev --create-only)

**보류(P1/P2 다음 시즌)**: GraphQL, Queues, Vault, MFA, Rate Limits, OAuth Providers, Custom Reports Builder, Wrappers(FDW).

---

> **이 문서가 세션별 개발의 단일 진실 소스(Single Source of Truth)입니다.**  
> 각 세션 시작 시 해당 섹션을 참조하고, 완료 기준을 체크하세요.  
> 스코프 변경이 필요하면 섹션 5의 조정 규칙을 따릅니다.

---

> 최종 수정: 2026-04-12 (세션 14)  
> 근거 문서: [Supabase Wave](./supabase-wave/README.md) | [Platform Evolution Wave](./platform-evolution-wave/README.md)
