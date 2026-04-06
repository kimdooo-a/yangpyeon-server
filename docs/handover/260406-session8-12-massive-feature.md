# 인수인계서: 세션 8~12 — 대규모 기능 구현 스프린트

> 작성일: 2026-04-06
> 세션: 8, 9, 10, 11, 12 (마스터 계획 세션 번호 기준)
> 작업자: Claude Code (2개 터미널 병렬 작업)

---

## 1. 완료된 Phase 요약

| Phase | 세션 | 내용 | 핵심 파일 |
|-------|------|------|----------|
| 11b | 8 | Sonner 토스트 알림 | `use-pm2-action.ts`, `layout.tsx` |
| 11d+11e | 8 | 감사 로그 인메모리→SQLite 영속화 | `audit-log-db.ts`, `audit-log.ts` (Edge 분리) |
| 11f | 8 | IP 화이트리스트 CRUD + 미들웨어 | `ip-whitelist.ts`, `ip-whitelist-cache.ts` |
| 12a | 8 | 메트릭 히스토리 Recharts 차트 | `metrics-collector.ts`, `metrics-area-chart.tsx` |
| 12b | 9 | SSE 실시간 (폴링→SSE 전환) | `use-sse.ts`, `sse-headers.ts`, SSE 엔드포인트 3개 |
| 12c | 10 | 감사 로그 전용 페이지 | `audit/page.tsx` (TanStack Table) |
| 12d | 10 | 환경변수 관리 UI | `settings/env/page.tsx`, `api/settings/env/route.ts` |
| 13a | 11 | DB 인증 통합 | `auth.ts` (role 포함 JWT), `login-v2/route.ts` |
| 13b | 11 | 역할 기반 접근 제어 | `middleware.ts`, `use-current-user.ts`, `settings/users/page.tsx` |
| 13c | 12 | Cmd+K 커맨드 팔레트 | `command-menu.tsx` (cmdk) |

## 2. 아키텍처 결정사항

### 듀얼 DB 체계
- **PostgreSQL (Prisma)**: 회원(User), 파일박스(Folder/File) — 관계형 데이터
- **SQLite (Drizzle)**: 감사 로그, 메트릭 히스토리, IP 화이트리스트 — 운영 데이터

### Edge Runtime 우회 패턴 (3가지)
미들웨어는 Edge Runtime → better-sqlite3(네이티브 모듈) 직접 사용 불가

1. **감사 로그**: 미들웨어 → 인메모리 buffer push → API Route에서 flush to SQLite
2. **IP 화이트리스트**: DB 변경 시 인메모리 Set 캐시 동기화 → 미들웨어는 캐시만 조회
3. **메트릭 수집**: API Route 첫 호출 시 setInterval lazy 시작

### 인증 통합 아키텍처
```
로그인 페이지 → v1 API (/api/v1/auth/login) → Bearer Token
    ↓
login-v2 → v1 Token 검증 → 대시보드 쿠키 (sub, email, role 포함)
    ↓
미들웨어 → 쿠키 JWT에서 role 추출 → ADMIN_ONLY_PATHS 보호
```
- 레거시 JWT (role 없음) → ADMIN 간주 (30일 전환 기간)
- 환경변수 DASHBOARD_PASSWORD fallback 유지 (비상 접근)

### SSE 전환
- 대시보드/프로세스/로그 페이지: setInterval 폴링 → EventSource SSE
- 공통 유틸 추출: `system-metrics.ts`, `pm2-metrics.ts` (REST + SSE 공유)
- 폴백: 3회 실패 → 자동 폴링 전환
- 연결 상태 인디케이터: `sse-indicator.tsx`

## 3. 신규 라우트 (이번 스프린트 추가분)

### 페이지
| 경로 | 용도 |
|------|------|
| `/audit` | 감사 로그 (TanStack Table + 필터 + 내보내기) |
| `/metrics` | 메트릭 히스토리 차트 (Recharts) |
| `/settings/ip-whitelist` | IP 화이트리스트 관리 |
| `/settings/env` | 환경변수 관리 |
| `/settings/users` | 사용자 관리 (ADMIN 전용) |

### API
| 경로 | 용도 |
|------|------|
| `GET/POST/DELETE /api/settings/ip-whitelist` | IP 화이트리스트 CRUD |
| `GET /api/metrics/history?range=` | 메트릭 시계열 (다운샘플링) |
| `GET/POST/DELETE /api/settings/env` | 환경변수 CRUD |
| `GET/POST/PATCH /api/settings/users` | 사용자 CRUD |
| `GET /api/auth/me` | 현재 사용자 정보 |
| `GET /api/sse/metrics` | 시스템 메트릭 SSE (5초) |
| `GET /api/sse/pm2` | PM2 상태 SSE (5초) |
| `GET /api/sse/logs` | 로그 테일 SSE (2초) |

## 4. 미완료/보류 작업

- [ ] **Phase 13d: 스켈레톤 UI** — 다른 터미널에서 테마 배색 작업 진행 중, 충돌 방지를 위해 보류
- [ ] **Phase 14: 데이터 관리 (Table Editor + CRUD + SQL Editor)** — 마스터 계획 세션 13~15
- [ ] **Phase 15: 자율 운영 (파일 매니저 + 알림 + shadcn 전환)** — 마스터 계획 세션 16~18

## 5. 주의사항

- `src/middleware.ts`: Next.js 16에서 `proxy`로 이름 변경 권장 경고 (기능 영향 없음)
- 다른 터미널에서 배색/테마 작업 중 — `globals.css`, 각 페이지 Tailwind 클래스 수정될 수 있음
- `.env`에 PostgreSQL + JWT 시크릿 설정 필요 (DATABASE_URL, JWT_V1_SECRET, JWT_V1_REFRESH_SECRET)
- ADMIN 계정: kimdooo@stylelucky4u.com (DB에 직접 삽입됨)

## 6. 빌드 상태

- `npm run build`: 46개 라우트 전부 정상 (최종 확인 시점)
- TypeScript 에러 없음
- 경고: middleware deprecated (proxy 전환 권장)

---
[← handover/_index.md](./_index.md)
