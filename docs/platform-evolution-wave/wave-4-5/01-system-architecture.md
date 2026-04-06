# 시스템 아키텍처 설계 — 플랫폼 진화 목표 구조

> Wave 4+5 설계 문서 01  
> 작성일: 2026-04-06  
> 작성 맥락: 양평 부엌 서버 대시보드 → Supabase-like 플랫폼 진화  
> 확정 스택: Next.js 15 + TypeScript + SQLite(better-sqlite3) + Drizzle ORM + shadcn/ui + SSE

---

## 목차

1. [현재 아키텍처 (AS-IS)](#1-현재-아키텍처-as-is)
2. [목표 아키텍처 (TO-BE)](#2-목표-아키텍처-to-be)
3. [계층 구조 상세](#3-계층-구조-상세)
4. [디렉토리 구조](#4-디렉토리-구조)
5. [데이터 흐름 다이어그램](#5-데이터-흐름-다이어그램)
6. [보안 아키텍처](#6-보안-아키텍처)
7. [에러 처리 전략](#7-에러-처리-전략)
8. [실시간 데이터 아키텍처 (SSE)](#8-실시간-데이터-아키텍처-sse)
9. [배포 아키텍처](#9-배포-아키텍처)
10. [마이그레이션 로드맵](#10-마이그레이션-로드맵)
11. [아키텍처 결정 기록 (ADR)](#11-아키텍처-결정-기록-adr)

---

## 1. 현재 아키텍처 (AS-IS)

### 1.1 전체 구조

```
외부 인터넷
    │
    ▼
Cloudflare Tunnel (HTTPS)
    │
    ▼ (HTTP → localhost:3000)
Next.js 15 프로세스 (PM2 관리)
    │
    ├── 미들웨어 (JWT 검증 + Rate Limit + CORS)
    │
    ├── /api/auth/login    → 환경변수 비밀번호 비교 → JWT 쿠키 발급
    ├── /api/system        → os 모듈 → CPU/메모리 순간값
    ├── /api/pm2/*         → child_process → PM2 명령어
    ├── /api/tunnel        → child_process → cloudflared 상태
    ├── /api/audit         → 인메모리 배열 (재시작 시 소멸)
    └── 정적 페이지        → App Router SSR
```

### 1.2 현재 데이터 흐름

```
브라우저 (폴링 3초)
    │  GET /api/system
    ▼
API Route Handler
    │
    ├── os.cpus()          ← Node.js 내장 (동기)
    ├── os.freemem()       ← Node.js 내장 (동기)
    ├── os.totalmem()      ← Node.js 내장 (동기)
    └── child_process.exec("df -h")  ← 쉘 명령어 (비동기)
    │
    ▼
JSON 응답 → 브라우저 상태 업데이트
```

### 1.3 현재 아키텍처의 한계

| 문제 | 설명 | 영향 |
|------|------|------|
| **데이터 휘발** | 감사 로그, 메트릭 히스토리가 PM2 재시작 시 전부 소멸 | 장애 분석 불가 |
| **폴링 비효율** | 3초마다 브라우저가 API 요청 → 연결 overhead 누적 | 서버 부하 + 배터리 낭비 |
| **인증 취약** | 단일 하드코딩 비밀번호, 사용자 개념 없음 | 비밀번호 변경 시 재배포 필요 |
| **세션 추적 없음** | 누가 언제 어떤 작업을 했는지 알 수 없음 | 감사 불가 |
| **UI 컴포넌트 빈약** | 기본 Tailwind만 사용, 테이블/모달/토스트 없음 | UX 한계 |
| **설정 영속성 없음** | 알림 임계값 등 설정이 환경변수에만 존재 | 런타임 설정 변경 불가 |

### 1.4 현재 파일 구조

```
src/
├── app/
│   ├── api/
│   │   ├── audit/route.ts          ← 인메모리 감사 로그
│   │   ├── auth/login/route.ts     ← 환경변수 비밀번호 검증
│   │   ├── pm2/
│   │   │   ├── route.ts            ← PM2 목록 조회
│   │   │   ├── [id]/route.ts       ← 프로세스 제어
│   │   │   └── detail/route.ts     ← 상세 정보
│   │   ├── system/route.ts         ← 시스템 메트릭 (순간값)
│   │   └── tunnel/route.ts         ← Cloudflare Tunnel 상태
│   ├── login/page.tsx
│   ├── logs/page.tsx
│   ├── processes/page.tsx
│   ├── layout.tsx
│   └── page.tsx                    ← 홈 대시보드
├── components/
│   ├── dashboard/
│   │   ├── stat-card.tsx
│   │   └── mini-chart.tsx
│   ├── layout/
│   │   └── sidebar.tsx
│   └── ui/                         ← 아직 비어있음
├── lib/
│   ├── audit-log.ts                ← 인메모리 배열 기반
│   ├── auth.ts                     ← JWT + 환경변수 비밀번호
│   └── rate-limit.ts               ← 인메모리 Map 기반
├── middleware.ts
└── types/
```

---

## 2. 목표 아키텍처 (TO-BE)

### 2.1 전체 구조

```
외부 인터넷
    │
    ▼
Cloudflare Tunnel (HTTPS/WSS)
    │
    ▼ (HTTP → localhost:3000)
Next.js 15 프로세스 (PM2 관리)
    │
    ├── 미들웨어 (JWT 검증 + Rate Limit + CORS + Zod 입력 검증)
    │
    ├── 정적 레이어
    │   └── shadcn/ui 컴포넌트 + Tailwind CSS 4
    │
    ├── API 레이어 (REST)
    │   ├── /api/auth/*       → AuthService → SQLite (users, sessions)
    │   ├── /api/system/*     → SystemService → os 모듈 + SQLite (metric_snapshots)
    │   ├── /api/pm2/*        → ProcessService → child_process + SQLite (audit_logs)
    │   ├── /api/tunnel/*     → TunnelService → child_process
    │   ├── /api/audit/*      → AuditService → SQLite (audit_logs)
    │   ├── /api/settings/*   → StorageService → SQLite (settings)
    │   ├── /api/alerts/*     → AlertService → SQLite (alerts, alert_events)
    │   ├── /api/database/*   → DatabaseService → SQLite 내성(introspection)
    │   └── /api/files/*      → FileService → 로컬 파일시스템
    │
    ├── SSE 스트림 레이어
    │   ├── /api/stream/metrics  → SystemService → SSE (10초 간격)
    │   ├── /api/stream/logs     → ProcessService → SSE (tail -f 유사)
    │   └── /api/stream/alerts   → AlertService → SSE (임계값 초과 시)
    │
    └── 파일시스템 레이어
        ├── data/dashboard.db    ← SQLite 파일 (단일 진실 소스)
        └── storage/             ← 파일 버킷 (향후 확장용)
```

### 2.2 목표 데이터 흐름

```
브라우저 (EventSource 연결)
    │  GET /api/stream/metrics  (SSE 영구 연결)
    ▼
SSE Handler (Next.js Route Handler)
    │
    ├── 10초마다 SystemService.collectMetrics() 호출
    │   ├── os 모듈로 CPU/메모리 수집
    │   └── SQLite에 metric_snapshots 저장
    │
    └── data: {...} 이벤트 전송 → 브라우저 React 상태 업데이트
```

---

## 3. 계층 구조 상세

### 3.1 계층 개요 (5-Tier)

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: 프레젠테이션 계층 (Presentation Layer)              │
│  Next.js App Router + shadcn/ui + Tailwind CSS 4             │
│  역할: UI 렌더링, 사용자 입력 처리, 상태 관리                 │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: API 계층 (API Layer)                                │
│  Route Handlers (REST) + SSE 스트림 엔드포인트               │
│  역할: HTTP 요청 수신, 입력 검증(Zod), 인증 확인, 응답 직렬화 │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: 서비스 계층 (Service Layer)                         │
│  SystemService, ProcessService, AuthService 등               │
│  역할: 비즈니스 로직, 여러 데이터 소스 조합, 트랜잭션 관리   │
├─────────────────────────────────────────────────────────────┤
│  Tier 4: 데이터 계층 (Data Layer)                            │
│  Drizzle ORM + SQLite (better-sqlite3) + 파일시스템          │
│  역할: 데이터 영속성, 쿼리 실행, 마이그레이션                │
├─────────────────────────────────────────────────────────────┤
│  Tier 5: 인프라 계층 (Infrastructure Layer)                  │
│  PM2 + Cloudflare Tunnel + WSL2 Ubuntu                       │
│  역할: 프로세스 관리, 외부 접근, OS 환경                     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 프레젠테이션 계층

**구성 요소**:
- **App Router**: Next.js 15의 서버/클라이언트 컴포넌트 혼용
- **shadcn/ui**: Radix UI 기반 접근성 보장 컴포넌트
- **TanStack Table**: 대용량 데이터 테이블 (가상화 지원)
- **Monaco Editor**: SQL 쿼리 에디터
- **react-simple-code-editor**: 설정 편집 (경량)

**페이지 구성**:

| 경로 | 컴포넌트 유형 | 데이터 소스 |
|------|-------------|------------|
| `/` | 클라이언트 (SSE) | `/api/stream/metrics` |
| `/processes` | 클라이언트 (SSE) | `/api/stream/logs` + `/api/pm2` |
| `/logs` | 클라이언트 (SSE) | `/api/stream/logs` |
| `/database` | 클라이언트 | `/api/database` |
| `/audit` | 서버 컴포넌트 (초기) + 클라이언트 (필터) | `/api/audit` |
| `/settings` | 클라이언트 | `/api/settings` |
| `/network` | 클라이언트 | `/api/tunnel` + `/api/system/network` |
| `/login` | 서버 컴포넌트 (폼) | `/api/auth/login` |

**컴포넌트 계층**:
```
app/layout.tsx
└── components/layout/
    ├── Sidebar.tsx          ← 네비게이션 + 활성 상태
    ├── Header.tsx           ← 타이틀 + 사용자 메뉴
    └── MobileNav.tsx        ← 모바일 반응형 (향후)

pages/
└── components/dashboard/
    ├── MetricCard.tsx       ← 단일 메트릭 카드 (shadcn Card)
    ├── MetricChart.tsx      ← 히스토리 차트 (recharts or tremor)
    ├── AlertBanner.tsx      ← 알림 배너
    └── QuickStats.tsx       ← 요약 통계 행

pages/processes/
└── components/
    ├── ProcessTable.tsx     ← TanStack Table 래퍼
    ├── ProcessActions.tsx   ← 제어 버튼 그룹
    ├── LogStream.tsx        ← SSE 로그 스크롤 뷰
    └── EnvEditor.tsx        ← 환경변수 편집 (react-simple-code-editor)

pages/database/
└── components/
    ├── TableList.tsx        ← 테이블 목록 사이드패널
    ├── DataTable.tsx        ← TanStack Table (편집 가능)
    └── SqlEditor.tsx        ← Monaco Editor 래퍼
```

### 3.3 API 계층

**라우팅 규칙**:
- `GET /api/{resource}` — 목록 조회
- `GET /api/{resource}/{id}` — 단건 조회
- `POST /api/{resource}` — 생성
- `PATCH /api/{resource}/{id}` — 부분 수정
- `DELETE /api/{resource}/{id}` — 삭제
- `GET /api/stream/{topic}` — SSE 스트림

**미들웨어 파이프라인** (요청당 실행 순서):
```
요청 수신
    │
    ▼ 1. 정적 파일 패스스루
    ▼ 2. 공개 경로 여부 확인 (/login, /api/auth/login)
    ▼ 3. JWT 쿠키 검증 (jose jwtVerify)
    ▼ 4. Rate Limiting (IP 기반, 인메모리 Map → 향후 SQLite로 이전)
    ▼ 5. CORS Origin 검증
    ▼ 6. CSRF Referer 검증 (POST)
    ▼ 7. Route Handler 진입
    ▼ 8. Zod 입력 스키마 검증 (Handler 내부)
    ▼ 9. Service 계층 호출
    ▼ 10. 감사 로그 기록 (상태 변경 작업)
    ▼
응답 반환
```

**입력 검증 예시** (Zod):
```typescript
// src/lib/schemas/pm2.ts
import { z } from "zod";

export const Pm2ActionSchema = z.object({
  action: z.enum(["restart", "stop", "delete", "reload"]),
  processId: z.string().min(1).max(100),
});

export const MetricQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(["10s", "1m", "5m", "1h"]).default("1m"),
});
```

### 3.4 서비스 계층

**서비스 클래스 목록**:

```typescript
// src/lib/services/index.ts 에서 싱글턴 export

export { SystemService }    // CPU/메모리/디스크 수집 + 히스토리 저장
export { ProcessService }   // PM2 제어 + 로그 스트리밍
export { AuthService }      // 사용자 인증 + 세션 관리
export { AuditService }     // 감사 로그 기록 + 조회
export { StorageService }   // 설정값 CRUD (settings 테이블)
export { AlertService }     // 알림 규칙 평가 + 이벤트 발행
export { DatabaseService }  // SQLite 내성(introspection) + 사용자 쿼리 실행
export { FileService }      // 로컬 파일시스템 CRUD (버킷)
```

**서비스 의존성 그래프** (단방향):
```
AuthService
    └── (의존) → Drizzle(users, sessions)

SystemService
    └── (의존) → os 모듈, child_process, Drizzle(metric_snapshots)

ProcessService
    └── (의존) → child_process(pm2), Drizzle(audit_logs)

AuditService
    └── (의존) → Drizzle(audit_logs)

AlertService
    └── (의존) → Drizzle(alerts, alert_events), SystemService(현재값 읽기)

StorageService
    └── (의존) → Drizzle(settings)

DatabaseService
    └── (의존) → better-sqlite3 직접 (내성 쿼리는 Drizzle 스키마 외부)

FileService
    └── (의존) → Node.js fs 모듈
```

**순환 의존성 방지 규칙**:
- 서비스 간 직접 import 금지 (이벤트 버스 또는 의존성 주입 패턴 사용)
- AlertService가 SystemService 데이터를 원할 경우: Route Handler에서 조합
- 공통 유틸리티는 `src/lib/utils/`에 분리

### 3.5 데이터 계층

```
src/lib/db/
├── index.ts          ← Drizzle 인스턴스 생성 + DB 파일 경로 설정
├── schema.ts         ← 모든 테이블 스키마 (Drizzle 정의)
├── relations.ts      ← 테이블 간 관계 정의
├── migrations/       ← Drizzle Kit 생성 마이그레이션 파일
│   ├── 0001_initial.sql
│   └── meta/
└── queries/          ← 복잡한 쿼리 함수 (단순 CRUD는 서비스에서 인라인)
    ├── metrics.ts
    ├── audit.ts
    └── users.ts
```

**DB 초기화 코드**:
```typescript
// src/lib/db/index.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data/dashboard.db");

// WAL 모드 + 성능 최적화 pragma
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("cache_size = -32000");  // 32MB 캐시
sqlite.pragma("temp_store = MEMORY");
sqlite.pragma("mmap_size = 268435456"); // 256MB mmap

export const db = drizzle(sqlite, { schema });
export { sqlite };
```

### 3.6 인프라 계층

```
WSL2 Ubuntu (Ubuntu 22.04 LTS)
├── Node.js (nvm 관리)
├── PM2
│   └── ecosystem.config.js
│       ├── dashboard (Next.js 빌드 서버, port 3000)
│       └── (향후) metric-collector (백그라운드 워커)
├── Cloudflare Tunnel
│   └── cloudflared service → stylelucky4u.com → localhost:3000
└── 파일시스템
    ├── ~/projects/luckystyle4u-server/  ← 앱 루트
    │   ├── data/dashboard.db            ← SQLite 파일
    │   └── storage/                     ← 파일 버킷
    └── ~/backups/                       ← DB 백업 (cron)
```

---

## 4. 디렉토리 구조

### 4.1 목표 디렉토리 구조 (완성 형태)

```
프로젝트 루트/
├── src/
│   ├── app/                           ← Next.js App Router
│   │   ├── (dashboard)/               ← 인증 필요 레이아웃 그룹
│   │   │   ├── layout.tsx             ← Sidebar + Header 포함
│   │   │   ├── page.tsx               ← 홈 대시보드 (/)
│   │   │   ├── processes/
│   │   │   │   └── page.tsx           ← PM2 프로세스 관리
│   │   │   ├── logs/
│   │   │   │   └── page.tsx           ← 로그 뷰어
│   │   │   ├── network/
│   │   │   │   └── page.tsx           ← 네트워크 모니터링
│   │   │   ├── database/
│   │   │   │   └── page.tsx           ← DB 테이블 뷰어 + SQL 에디터
│   │   │   ├── audit/
│   │   │   │   └── page.tsx           ← 감사 로그
│   │   │   └── settings/
│   │   │       └── page.tsx           ← 시스템 설정
│   │   ├── api/                       ← API Route Handlers
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts
│   │   │   │   └── logout/route.ts
│   │   │   ├── system/
│   │   │   │   ├── route.ts           ← 현재 메트릭
│   │   │   │   └── history/route.ts   ← 히스토리 쿼리
│   │   │   ├── pm2/
│   │   │   │   ├── route.ts
│   │   │   │   ├── [id]/route.ts
│   │   │   │   └── [id]/logs/route.ts
│   │   │   ├── tunnel/route.ts
│   │   │   ├── audit/route.ts
│   │   │   ├── settings/
│   │   │   │   └── route.ts
│   │   │   ├── alerts/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── database/
│   │   │   │   ├── tables/route.ts    ← 테이블 목록
│   │   │   │   ├── query/route.ts     ← SQL 실행
│   │   │   │   └── [table]/route.ts   ← 테이블 데이터 CRUD
│   │   │   └── stream/
│   │   │       ├── metrics/route.ts   ← SSE: 실시간 메트릭
│   │   │       ├── logs/route.ts      ← SSE: 실시간 로그
│   │   │       └── alerts/route.ts    ← SSE: 알림 이벤트
│   │   └── login/
│   │       └── page.tsx
│   │
│   ├── components/
│   │   ├── ui/                        ← shadcn/ui 설치 컴포넌트
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   └── ...
│   │   ├── dashboard/
│   │   │   ├── metric-card.tsx        ← CPU/메모리/디스크 카드
│   │   │   ├── metric-chart.tsx       ← 히스토리 라인 차트
│   │   │   ├── mini-chart.tsx         ← 현재 존재 (유지)
│   │   │   ├── stat-card.tsx          ← 현재 존재 (유지 + shadcn 통합)
│   │   │   └── alert-banner.tsx       ← 알림 배너
│   │   ├── data/
│   │   │   ├── data-table.tsx         ← TanStack Table 래퍼
│   │   │   ├── sql-editor.tsx         ← Monaco Editor 래퍼
│   │   │   └── json-viewer.tsx        ← JSON 구조 뷰어
│   │   ├── layout/
│   │   │   ├── sidebar.tsx            ← 현재 존재 (리팩토링)
│   │   │   ├── header.tsx
│   │   │   └── breadcrumb.tsx
│   │   └── shared/
│   │       ├── confirm-dialog.tsx     ← 위험 작업 확인 모달
│   │       ├── loading-spinner.tsx
│   │       └── empty-state.tsx
│   │
│   ├── lib/
│   │   ├── db/                        ← 데이터 계층
│   │   │   ├── index.ts               ← DB 인스턴스 + pragma
│   │   │   ├── schema.ts              ← Drizzle 스키마
│   │   │   ├── relations.ts           ← 관계 정의
│   │   │   ├── migrations/
│   │   │   └── queries/
│   │   │       ├── metrics.ts
│   │   │       ├── audit.ts
│   │   │       └── users.ts
│   │   ├── services/                  ← 서비스 계층
│   │   │   ├── index.ts               ← 싱글턴 export
│   │   │   ├── auth.service.ts        ← 현재 auth.ts → 이전
│   │   │   ├── system.service.ts
│   │   │   ├── process.service.ts
│   │   │   ├── audit.service.ts       ← 현재 audit-log.ts → 이전
│   │   │   ├── storage.service.ts
│   │   │   ├── alert.service.ts
│   │   │   ├── database.service.ts
│   │   │   └── file.service.ts
│   │   ├── schemas/                   ← Zod 입력 검증 스키마
│   │   │   ├── auth.ts
│   │   │   ├── pm2.ts
│   │   │   ├── metrics.ts
│   │   │   ├── settings.ts
│   │   │   └── alerts.ts
│   │   ├── utils/                     ← 순수 유틸리티 함수
│   │   │   ├── format.ts              ← 바이트/시간 포맷
│   │   │   ├── ip.ts                  ← IP 추출 (현재 audit-log.ts에서 분리)
│   │   │   └── crypto.ts              ← bcrypt 래퍼
│   │   ├── auth.ts                    ← 현재 존재 (점진적 이전)
│   │   ├── audit-log.ts               ← 현재 존재 (점진적 이전)
│   │   └── rate-limit.ts              ← 현재 존재 (유지)
│   │
│   └── types/
│       ├── index.ts                   ← 공통 타입 export
│       ├── api.ts                     ← API 응답/요청 타입
│       ├── system.ts                  ← 시스템 메트릭 타입
│       ├── process.ts                 ← PM2 프로세스 타입
│       └── db.ts                      ← DB 엔티티 타입 (Drizzle 추론)
│
├── data/                              ← SQLite DB 파일 (gitignore)
│   ├── dashboard.db
│   └── dashboard.db-wal               ← WAL 모드 임시 파일
│
├── storage/                           ← 파일 버킷 (gitignore)
│   └── .gitkeep
│
├── drizzle.config.ts                  ← Drizzle Kit 설정
├── next.config.ts
├── middleware.ts
└── package.json
```

### 4.2 네이밍 컨벤션

| 대상 | 규칙 | 예시 |
|------|------|------|
| 파일명 | kebab-case | `metric-card.tsx`, `auth.service.ts` |
| 컴포넌트 | PascalCase | `MetricCard`, `DataTable` |
| 서비스 클래스 | PascalCase + Service 접미사 | `AuthService`, `SystemService` |
| 훅 | camelCase + use 접두사 | `useMetricStream`, `useProcessList` |
| 상수 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DB_PATH` |
| 타입/인터페이스 | PascalCase (I 접두사 없음) | `MetricSnapshot`, `UserSession` |
| DB 테이블 | snake_case | `audit_logs`, `metric_snapshots` |
| API 경로 | kebab-case | `/api/alert-events`, `/api/pm2/detail` |

---

## 5. 데이터 흐름 다이어그램

### 5.1 실시간 메트릭 흐름 (SSE)

```
브라우저 (React)
    │
    │  1. EventSource("/api/stream/metrics") 연결 수립
    │     Headers: Accept: text/event-stream
    │
    ▼
미들웨어 (JWT 검증 통과)
    │
    ▼
/api/stream/metrics/route.ts
    │
    │  2. ReadableStream 생성
    │     interval: 10초
    │
    ├── 매 10초마다:
    │   │
    │   ├── SystemService.collectSnapshot()
    │   │   ├── os.cpus()          → CPU 사용률 계산
    │   │   ├── os.freemem()       → 메모리 사용률
    │   │   ├── exec("df -h /")    → 디스크 사용률
    │   │   └── exec("cat /proc/net/dev") → 네트워크 트래픽
    │   │
    │   └── db.insert(metricSnapshots).values(snapshot) → SQLite 저장
    │
    │  3. SSE 이벤트 전송:
    │     data: {"cpu":23,"memory":45,"disk":62,"timestamp":"..."}
    │
    ▼
브라우저
    │  4. onmessage: 파싱 → React setState → 차트/카드 리렌더
    │
    └── (연결 끊김/에러 시) 자동 재연결 (EventSource 내장)
```

### 5.2 감사 로그 흐름

```
브라우저 → POST /api/pm2/[id] (action: restart)
    │
    ▼ 미들웨어
    │  CSRF 검증 → Rate Limit 확인 → JWT 검증
    │
    ▼ Route Handler
    │  1. Zod 스키마로 body 검증
    │  2. ProcessService.control(id, "restart") 호출
    │     └── exec("pm2 restart [id]")
    │
    ▼ AuditService.log()
    │  3. db.insert(auditLogs).values({
    │       userId: (JWT에서 추출),
    │       action: "PM2_RESTART",
    │       target: processId,
    │       details: JSON.stringify({before, after}),
    │       ip: clientIp,
    │       timestamp: now()
    │     })
    │
    ▼ 응답 반환
    │  4. { success: true, message: "재시작 완료" }
    │
    └── 브라우저 토스트 알림 표시
```

### 5.3 설정 저장 흐름

```
브라우저 → PATCH /api/settings
    Body: { key: "alert.cpu.threshold", value: "85" }
    │
    ▼ 미들웨어 (JWT + CSRF)
    │
    ▼ Route Handler
    │  1. Zod 검증: SettingUpdateSchema
    │
    ▼ StorageService.set(key, value, userId)
    │  2. db.insert(settings)
    │       .values({ key, value, updatedAt: now(), updatedBy: userId })
    │       .onConflictDoUpdate({ target: settings.key, set: ... })
    │
    ▼ AuditService.log({ action: "SETTING_CHANGED", ... })
    │
    └── 응답: { key, value, updatedAt }
```

### 5.4 인증 흐름

```
브라우저 → POST /api/auth/login
    Body: { username: "admin", password: "..." }
    │
    ▼ 미들웨어 (Rate Limit: 5회/15분)
    │
    ▼ Route Handler
    │  1. Zod 검증: LoginSchema
    │
    ▼ AuthService.login(username, password)
    │  2. db.select().from(users).where(eq(users.username, username))
    │  3. bcrypt.compare(password, user.passwordHash)
    │  4. (성공 시) db.insert(sessions).values({
    │       userId, token: generateToken(), expiresAt, ipAddress, userAgent
    │     })
    │  5. SignJWT({ userId, username, role }).sign(AUTH_SECRET)
    │
    ▼ 응답
    │  6. Set-Cookie: dashboard_session=<JWT>; HttpOnly; SameSite=Strict
    │  7. db.update(users).set({ lastLogin: now() })
    │
    └── 브라우저: / 리다이렉트
```

---

## 6. 보안 아키텍처

### 6.1 인증 + 권한 모델

```
현재: 단일 비밀번호 → 전체 접근
목표: 역할 기반 접근 제어 (RBAC)

역할 정의:
┌──────────┬─────────────────────────────────────────┐
│ 역할     │ 접근 권한                                │
├──────────┼─────────────────────────────────────────┤
│ admin    │ 모든 기능 (사용자 관리 포함)              │
│ operator │ PM2 제어, 설정 변경, DB 조회             │
│ viewer   │ 읽기 전용 (메트릭, 로그, 감사 로그 조회) │
└──────────┴─────────────────────────────────────────┘

초기 구현: admin 단일 역할 → 추후 역할 분리
```

### 6.2 세션 보안

```typescript
// 세션 토큰 구성
JWT Payload:
{
  userId: string,      // DB users.id
  username: string,    // 표시용
  role: "admin" | "operator" | "viewer",
  iat: number,         // 발급 시각
  exp: number          // 만료 (24시간)
}

보안 속성:
- 알고리즘: HS256 (AUTH_SECRET 최소 32자)
- 쿠키: HttpOnly, SameSite=Strict, Secure (HTTPS)
- 서버 세션 DB: sessions 테이블에 토큰 해시 저장 → 강제 만료 가능
- 비밀번호: bcrypt (rounds=12)
```

### 6.3 입력 검증 레이어

모든 API 입력은 두 단계 검증:

```
1단계: 미들웨어 (요청 메타데이터)
├── JWT 토큰 서명 검증
├── Rate Limit (IP 기반)
├── CORS Origin 검증
└── CSRF Referer 검증 (POST)

2단계: Route Handler (요청 본문)
├── Zod 스키마 파싱 (타입 안전 + 런타임 검증)
├── 문자열 길이 제한
├── 허용된 enum 값만 수용
└── SQL 인젝션 방지 (Drizzle 파라미터화 쿼리)
```

### 6.4 SQL 에디터 보안 (DatabaseService)

사용자가 임의 SQL을 실행할 수 있는 `/database/query` 기능은 특별 보안 필요:

```typescript
// src/lib/services/database.service.ts
export class DatabaseService {
  // 허용된 쿼리 유형만 실행
  private readonly ALLOWED_STATEMENTS = ["SELECT", "EXPLAIN", "PRAGMA"];
  
  executeQuery(sql: string, params: unknown[] = []) {
    const trimmed = sql.trim().toUpperCase();
    
    // DDL/DML 차단 (admin 제외)
    const blocked = ["DROP", "DELETE", "UPDATE", "INSERT", "CREATE", "ALTER", "ATTACH"];
    if (blocked.some(kw => trimmed.startsWith(kw))) {
      throw new Error("SELECT/EXPLAIN/PRAGMA 쿼리만 허용됩니다");
    }
    
    // 실행 시간 제한 (10초)
    this.db.pragma("busy_timeout = 10000");
    
    // 결과 행 수 제한 (1000행)
    const limitedSql = `SELECT * FROM (${sql}) LIMIT 1000`;
    return this.db.prepare(limitedSql).all(...params);
  }
}
```

### 6.5 환경변수 보안 정책

| 변수 | 위치 | 클라이언트 노출 |
|------|------|----------------|
| `AUTH_SECRET` | `.env.local` | 금지 (서버 전용) |
| `DB_PATH` | `.env.local` | 금지 |
| `DASHBOARD_PASSWORD` | `.env.local` | 금지 (단계적 제거) |
| `NEXT_PUBLIC_SITE_URL` | `.env.local` | 허용 (HTTPS URL만) |

---

## 7. 에러 처리 전략

### 7.1 에러 계층

```
클라이언트 에러 (4xx)          서버 에러 (5xx)
├── 400 Bad Request            ├── 500 Internal Server Error
│   └── Zod 검증 실패          │   └── 예상치 못한 예외
├── 401 Unauthorized           ├── 502 Bad Gateway
│   └── JWT 만료/무효          │   └── PM2/외부 프로세스 실패
├── 403 Forbidden              ├── 503 Service Unavailable
│   └── CORS/CSRF 차단         │   └── DB 잠금 타임아웃
├── 404 Not Found              └── 504 Gateway Timeout
│   └── 리소스 없음                └── 장기 실행 쿼리
└── 429 Too Many Requests
    └── Rate Limit 초과
```

### 7.2 API 에러 응답 형식

```typescript
// 모든 에러는 이 형식으로 반환
interface ApiError {
  error: string;          // 사용자 친화적 메시지 (한국어)
  code?: string;          // 에러 코드 (예: "RATE_LIMITED", "INVALID_INPUT")
  details?: unknown;      // 개발 모드에서만 포함
  retryAfter?: number;    // 429일 때 재시도 대기 시간(초)
}

// 예시
{ "error": "요청 한도 초과. 30초 후 재시도하세요.", "code": "RATE_LIMITED", "retryAfter": 30 }
{ "error": "입력값이 올바르지 않습니다.", "code": "INVALID_INPUT", "details": [...] }
```

### 7.3 프론트엔드 에러 처리

```
React 에러 경계 (ErrorBoundary)
└── 페이지 단위로 설정
    └── 폴백 UI: "대시보드를 불러오는 데 실패했습니다. 새로고침 하세요."

API 호출 에러
├── 401 → /login 리다이렉트
├── 429 → 토스트 알림 (재시도 타이머 표시)
├── 500 → 토스트 에러 알림 + 감사 로그 기록
└── 네트워크 에러 → 토스트 알림 + 오프라인 상태 배지

SSE 연결 에러
└── EventSource onerror → 5초 후 자동 재연결 (지수 백오프)
    ├── 1회 실패: 5초 대기
    ├── 2회 실패: 10초 대기
    ├── 3회 실패: 20초 대기
    └── 5회 실패: 수동 재연결 버튼 표시
```

### 7.4 에러 로깅 정책

```
개발 환경: console.error → 터미널 출력
프로덕션 환경:
├── AuditService.log({ action: "SERVER_ERROR", details: stack }) → SQLite
├── PM2 로그 파일 (에러 레벨)
└── (향후) 슬랙/텔레그램 알림 연동 가능
```

---

## 8. 실시간 데이터 아키텍처 (SSE)

### 8.1 SSE 선택 이유

| 비교 항목 | WebSocket | SSE |
|-----------|-----------|-----|
| 방향 | 양방향 | 서버→클라이언트 단방향 |
| 구현 복잡도 | 높음 (별도 서버/라이브러리) | 낮음 (HTTP 스펙) |
| Cloudflare Tunnel 호환 | 불안정 | 안정적 |
| Next.js 지원 | 추가 설정 필요 | Route Handler 기본 지원 |
| 자동 재연결 | 직접 구현 | 브라우저 내장 |
| 적합 용도 | 채팅, 게임 | 모니터링, 로그 스트림 |

**결론**: 서버 모니터링은 단방향 데이터 푸시. SSE가 최적.

### 8.2 SSE 구현 패턴

```typescript
// src/app/api/stream/metrics/route.ts
import { NextRequest } from "next/server";
import { SystemService } from "@/lib/services/system.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";  // Edge runtime은 better-sqlite3 미지원

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };
      
      // 초기 데이터 즉시 전송
      const snapshot = await SystemService.getInstance().collectSnapshot();
      send(snapshot);
      
      // 10초 간격 폴링
      const interval = setInterval(async () => {
        try {
          const snapshot = await SystemService.getInstance().collectSnapshot();
          send(snapshot);
        } catch (error) {
          send({ error: "메트릭 수집 실패" });
        }
      }, 10_000);
      
      // 클라이언트 연결 해제 시 정리
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",  // Nginx/Cloudflare 버퍼링 방지
    },
  });
}
```

### 8.3 클라이언트 SSE 훅

```typescript
// src/lib/hooks/use-metric-stream.ts
"use client";

import { useState, useEffect, useRef } from "react";

interface MetricSnapshot {
  cpu: number;
  memory: number;
  disk: number;
  timestamp: string;
}

export function useMetricStream() {
  const [data, setData] = useState<MetricSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let es: EventSource;

    const connect = () => {
      es = new EventSource("/api/stream/metrics");
      
      es.onopen = () => {
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      };
      
      es.onmessage = (event) => {
        const snapshot = JSON.parse(event.data) as MetricSnapshot;
        setData(snapshot);
      };
      
      es.onerror = () => {
        setConnected(false);
        es.close();
        
        // 지수 백오프 재연결
        const delay = Math.min(5000 * Math.pow(2, retryCount.current), 60000);
        retryCount.current += 1;
        
        if (retryCount.current <= 5) {
          retryTimer.current = setTimeout(connect, delay);
        } else {
          setError("연결 실패. 수동으로 새로고침 하세요.");
        }
      };
    };

    connect();
    
    return () => {
      clearTimeout(retryTimer.current);
      es?.close();
    };
  }, []);

  return { data, connected, error };
}
```

---

## 9. 배포 아키텍처

### 9.1 PM2 설정

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "dashboard",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/home/user/projects/luckystyle4u-server",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // 메모리 누수 방지: 500MB 초과 시 자동 재시작
      max_memory_restart: "500M",
      // 로그 설정
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // 무중단 재배포
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
```

### 9.2 배포 스크립트

```bash
#!/bin/bash
# scripts/deploy.sh

set -e  # 에러 시 중단

echo "=== 양평 부엌 서버 대시보드 배포 시작 ==="

# 1. 의존성 설치
npm ci --production=false

# 2. DB 마이그레이션 (배포 전 적용)
npx drizzle-kit migrate

# 3. 빌드
npm run build

# 4. PM2 무중단 재시작
pm2 reload ecosystem.config.js --update-env

echo "=== 배포 완료 ==="
pm2 status
```

### 9.3 빌드 최적화

```typescript
// next.config.ts (현재 대비 추가 설정)
const nextConfig = {
  // SQLite/better-sqlite3는 서버 전용 — 클라이언트 번들 제외
  serverExternalPackages: ["better-sqlite3"],
  
  // 빌드 시 DB 연결 시도 방지
  experimental: {
    optimizePackageImports: ["@radix-ui/*", "lucide-react"],
  },
};
```

### 9.4 모니터링 및 헬스체크

```typescript
// src/app/api/health/route.ts
export async function GET() {
  const checks = {
    db: false,
    pm2: false,
    uptime: process.uptime(),
  };
  
  // SQLite 연결 확인
  try {
    db.select().from(settings).limit(1).all();
    checks.db = true;
  } catch { /* SQLite 연결 실패 */ }
  
  const healthy = checks.db;
  
  return Response.json(checks, {
    status: healthy ? 200 : 503,
  });
}
```

---

## 10. 마이그레이션 로드맵

### 10.1 단계별 전환 계획

```
Phase 0 (현재)
├── 인메모리 감사 로그
├── 환경변수 비밀번호 인증
├── 폴링 기반 메트릭
└── shadcn/ui 미설치

Phase 1 — 데이터 계층 구축 (우선순위 1)
├── better-sqlite3 + Drizzle ORM 설치
├── 스키마 생성 + 초기 마이그레이션
├── AuditService → SQLite 이전 (인메모리 제거)
├── MetricService → 히스토리 저장 시작
└── 설정 영속화 (settings 테이블)

Phase 2 — 인증 강화 (우선순위 2)
├── users/sessions 테이블 활용
├── bcrypt 비밀번호 저장
├── 세션 DB 저장 (강제 만료 기능)
└── 로그인 페이지 개선

Phase 3 — 실시간 전환 (우선순위 3)
├── SSE 엔드포인트 구축
├── 폴링 제거 → SSE 전환
└── 로그 스트리밍

Phase 4 — UI 개선 (우선순위 4)
├── shadcn/ui 설치 + 기존 컴포넌트 통합
├── TanStack Table 적용
├── 차트 컴포넌트 추가
└── 모바일 반응형

Phase 5 — 고급 기능 (우선순위 5)
├── SQL 에디터 (Monaco)
├── 알림 시스템
├── 파일 매니저
└── 사용자 관리 UI
```

### 10.2 하위 호환성 유지 원칙

- 기존 API 경로(`/api/system`, `/api/pm2/*` 등) 유지 — 경로 변경 없음
- 새 기능은 새 경로에 추가
- 미들웨어 로직은 점진적 강화 (기존 JWT 검증 방식 유지)
- 환경변수 `DASHBOARD_PASSWORD`는 마이그레이션 완료 후 단계적 제거

---

## 11. 아키텍처 결정 기록 (ADR)

### ADR-001: SQLite 선택

- **결정**: PostgreSQL 대신 SQLite(better-sqlite3) 사용
- **이유**: 1인 운영, 단일 프로세스, 제로 설정, 파일 하나로 백업
- **트레이드오프**: 다중 쓰기 프로세스 불가 (향후 워커 분리 시 재검토)
- **날짜**: 2026-04-06

### ADR-002: SSE 선택 (WebSocket 불채택)

- **결정**: 실시간 통신에 WebSocket 대신 SSE 사용
- **이유**: 서버→클라이언트 단방향으로 충분, Cloudflare Tunnel 안정성, Next.js 기본 지원
- **트레이드오프**: 클라이언트→서버 실시간 푸시 불가 (필요 시 일반 POST 사용)
- **날짜**: 2026-04-06

### ADR-003: App Router 라우트 그룹 사용

- **결정**: `(dashboard)` 라우트 그룹으로 인증 레이아웃 분리
- **이유**: 로그인 페이지와 대시보드 페이지의 레이아웃 완전 분리
- **트레이드오프**: 기존 `app/` 직접 배치 구조에서 이동 필요
- **날짜**: 2026-04-06

### ADR-004: Drizzle ORM 선택 (Prisma 불채택)

- **결정**: Prisma 대신 Drizzle ORM 사용
- **이유**: 경량, SQLite 완벽 지원, SQL-like 문법, 번들 크기 최소
- **트레이드오프**: Prisma Studio 같은 GUI 없음 (자체 DB 뷰어로 대체)
- **날짜**: 2026-04-06

---

*이 문서는 Wave 4+5 설계 문서의 일부입니다.*  
*관련 문서: `02-data-model-schema.md` (DB 스키마 상세)*
