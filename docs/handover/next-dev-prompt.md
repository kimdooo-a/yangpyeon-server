# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma) + SQLite (Drizzle)
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
# 개발 서버
npm run dev

# WSL2 배포 — /ypserver 스킬 사용 권장 (Windows 빌드 불가, WSL2가 진실 소스)
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |

## 필수 참조 파일

```
docs/MASTER-DEV-PLAN.md                              — 세션별 개발 마스터 계획서 (단일 진실 소스)
CLAUDE.md                                            — 프로젝트 규칙 + 문서 트리
docs/status/current.md                               — 현재 상태 + 세션 요약표
docs/handover/260412-session19-ops-security-hardening.md — 최신 인수인계서 (세션 19) ⭐
docs/handover/phase-14b-crud-prompt.md               — Phase 14b CRUD 전용 상세 프롬프트 ⭐
docs/handover/260412-session18-auth-refactor.md      — 세션 18 인수인계서
docs/handover/260412-session17-monaco-xyflow.md      — 세션 17 인수인계서
docs/handover/260412-session16-supabase-deploy.md    — 세션 16
docs/handover/260412-session15-supabase-clone.md     — 세션 15
docs/references/_SUPABASE_TECH_MAP.md                — Supabase 이식 기술 매핑
docs/references/_PROJECT_VS_SUPABASE_GAP.md          — 현 프로젝트 vs Supabase 갭
docs/research/decisions/ADR-002-supabase-adaptation-strategy.md — Supabase 이식 전략
docs/solutions/2026-04-12-nextjs16-proxy-migration-cve.md — 세션 18 근본 auth 마이그레이션 솔루션
docs/solutions/2026-04-12-cookie-authz-bug-first-admin-fallback.md — 세션 18 authZ 버그 솔루션
docs/solutions/2026-04-12-*.md                       — 세션 17 Compound Knowledge (Monaco SSR, xyflow+ELK, Windows lightningcss)
```

## 최근 완료된 작업

- 세션 1~4: 프로젝트 초기화 + 대시보드 + 보안 + 디자인
- 세션 5: kdywave 종합 분석 + 마스터 계획서
- 세션 6: SPIKE 검증 + Zod
- 세션 7: 회원관리 + 파일박스 v2 (PostgreSQL)
- 세션 8~12: 토스트, 감사로그DB, IP화이트리스트, 메트릭차트, SSE실시간, 감사로그UI, 환경변수관리, DB인증통합, 역할접근제어, Cmd+K
- 세션 13: 회원관리 백엔드 + PostgreSQL + 이메일/비밀번호 로그인 + Warm Ivory 테마
- 세션 14: Phase 13d 완료 (9개 페이지 스켈레톤 + EmptyState)
- 세션 15: Supabase 관리 체계 이식 — Phase A(리서치 23문서) + Phase B(Prisma +7 모델, 11 P0 모듈 55 파일)
- 세션 16: 세션 15 프로덕션 배포 — 마이그레이션 + `app_readonly` PG 롤 + monaco/xyflow/elkjs 설치 + Cloudflare Tunnel PM2 등록
- 세션 17: SQL Editor Monaco 치환 + Schema Visualizer xyflow/elkjs 치환 + 12 P0 Playwright E2E (콘솔 에러 0건) + `FROM "User"` → `FROM users` 수정
- **세션 19 (최신)**: **세션 18 후속 — 운영/보안 잔가지 정리** (5 커밋, `dec6abe..ae07e67`)
  - auth-guard API `request` 필수화 + AUTH_FAILED/FORBIDDEN 감사 로그 자동 기록
  - `src/instrumentation.ts`에 `data/` 선제 `mkdirSync` 추가 — SQLite cold start 로그 노이즈 제거
  - Table Editor 프로덕션 E2E S1/S3~S6 실행 — 6 injection 벡터 + 4 write vector 전부 차단 확인
  - `docs/handover/phase-14b-crud-prompt.md` — 다음 세션(Phase 14b CRUD) 자기완결형 프롬프트
  - npm audit moderate 9 비익스플로이트 분류, Turbopack NFT 경고 구조적 한계 cosmetic 확정
- **세션 18**: **근본 auth 아키텍처 재설계** + 기술부채 정리 + **Phase 14a Table Editor** (11 커밋)
  - `middleware.ts` → `proxy.ts` (Next.js 16 + **CVE-2025-29927 구조적 방어**)
  - `(protected)` 라우트 그룹 + Layout `requireSession`/`requireRole` 재검증 (15 페이지 git mv)
  - 쿠키 Route Handler 8개에 `requireSessionApi`/`requireRoleApi` 배선
  - `api-guard` `checkDashboardSession` authZ 버그 수정 → `resolveCookieSession` (실제 세션 주체 기반, 기존은 "첫 ADMIN" 반환)
  - `next.config.ts` `outputFileTracingExcludes` (Turbopack NFT)
  - `next` 16.2.2 → 16.2.3 (npm audit HIGH 해결)
  - `src/instrumentation.ts` (Cron 부트스트랩 즉시)
  - **Phase 14a Table Editor**: `/api/v1/tables/*` 3 라우트 + `/tables` 2 페이지 + TanStack Table v8 + 타입 배지. 보안 3중 방어(정규식/DB 대조/quote_ident + app_readonly + READ ONLY)

## 현재 DB 구조

### PostgreSQL (Prisma) — 10 테이블 (세션 16 적용 완료)
- User (id, email, name, phone, passwordHash, role, isActive, lastLoginAt)
- Folder (id, name, parentId, ownerId) — 자기참조 트리
- File (id, name, storedName, mimeType, size, folderId, ownerId)
- **세션 15 추가분**: SqlQuery / EdgeFunction / EdgeFunctionRun / Webhook / CronJob / ApiKey / LogDrain
- **enums**: QueryScope, FunctionRuntime, RunStatus, WebhookEvent, CronKind, ApiKeyType, DrainType
- **PG 롤**: `app_readonly` NOLOGIN + SELECT ALL + DEFAULT PRIVILEGES (Table Editor + SQL Editor에서 사용)

### SQLite (Drizzle) — data/dashboard.db
- audit_logs, metrics_history, ip_whitelist

## 현재 Auth 아키텍처 (세션 18 이후)

```
요청 흐름
  ↓
proxy.ts [네트워크 경계 — IP/Rate/CORS/CSRF/감사로그]
  ↓
app/(protected)/layout.tsx [Layout 재검증 — requireSession()]
  ↓
app/(protected)/(admin)/layout.tsx [ADMIN 재검증 — requireRole("ADMIN")]
  ↓
Server Component / Route Handler
  ├─ 쿠키 기반 API → requireSessionApi / requireRoleApi (auth-guard.ts)
  └─ v1 API → withAuth / withRole (api-guard.ts, Bearer 우선 + 쿠키 fallback)
```

**핵심 원칙**:
- proxy.ts에는 **auth 로직 없음** (CVE-2025-29927 구조적 차단)
- Route Handler가 `cookies()`/`request.cookies`로 **직접** 세션 재검증 (middleware 우회 경로 없음)
- api-guard의 cookie fallback은 `resolveCookieSession`으로 **실제 세션 주체**의 role 사용 (하드코딩 ADMIN 금지)

## 현재 Git 상태

```
브랜치: main
리모트: origin → https://github.com/kimdooo-a/yangpyeon-server.git
최신: ae07e67 (세션 19 푸시 완료)
```

## 배포 상태 주의 ⚠️

- **원격 main**: `ae07e67` (세션 19)
- **프로덕션(WSL2 PM2)**: `0e59be0` (세션 18 종료) — 세션 19 커밋 미반영
- **다음 세션 시작 시**: `/ypserver` 스킬로 배포해야 auth-guard 감사 로그 + data/ mkdir 반영됨

## 추천 다음 작업

### 즉시 가능 (세션 19 후속)
1. **세션 19 커밋 배포** — `/ypserver` 스킬로 WSL2 PM2 재빌드. 배포 후 `/audit` 페이지에서 비로그인 `fetch('/api/settings/users')` 시도해 AUTH_FAILED 기록 확인
2. **Phase 14b CRUD 에디터** — ⭐ `docs/handover/phase-14b-crud-prompt.md` 참조. 새 터미널 세션 권장. superpowers:brainstorming → writing-plans → executing-plans 체인
3. **VIEWER 테스트 계정 생성** — S2 시나리오 + Phase 14b 권한 매트릭스 검증용
4. **Phase 15b Webhook/Alert 완성** — 세션 15 스캐폴드 → 이벤트 트리거 + 시그니처 검증 + 재전송 로직
5. **테이블 목록 행 수 정확화 (cosmetic)** — 현재 "행 ~-1" 표시. `information_schema.reltuples` 또는 `COUNT(*)` 전환
6. **identifier regex 길이 제한 (cosmetic)** — `^[a-zA-Z_][a-zA-Z0-9_]{0,62}$`로 PG 최대 63자 적용
7. **S7 PM2 로그 검증** — WSL2에서 `pm2 logs yp-dashboard --lines 200 | grep "SET LOCAL ROLE"` 수행

### 완료된 범위 (참고)
- Phase 1~13 전부 완료
- Phase 14-S (세션 15): Supabase 이식 Phase A+B
- Phase 14a (세션 18): Table Editor (읽기 전용)
- Phase 14c (세션 17): SQL Editor Monaco

### 세션 19+ (마스터 계획 잔여)
- [x] ~~Phase 14a: Table Editor~~ (세션 18)
- [ ] Phase 14b: CRUD 에디터
- [x] ~~Phase 14c: SQL Editor Monaco~~ (세션 17)
- [ ] Phase 15a: 파일 매니저 강화
- [ ] Phase 15b: 알림 시스템 (Webhook 완성)
- [ ] Phase 15c: shadcn/ui 점진 전환
- [ ] **P1 후속 (선택)**: MFA / OAuth / GraphQL / Queues / Vault — ADR-002 참조

> 전체 로드맵: `docs/MASTER-DEV-PLAN.md`

## 알려진 이슈 및 주의사항

- ~~middleware 경고~~ → 세션 18에서 proxy.ts 전환 완료
- ~~Cron 부트스트랩 지연~~ → 세션 18에서 `src/instrumentation.ts`로 PM2 기동 즉시 tick
- ~~`npm audit` HIGH~~ → 세션 18에서 next 16.2.3으로 해결
- ~~`data/` cold start 노이즈~~ → 세션 19에서 `instrumentation.register()`가 `mkdirSync` 선제 수행
- ~~auth 실패 감사 로그 부재~~ → 세션 19에서 `requireSessionApi`/`requireRoleApi`가 AUTH_FAILED/FORBIDDEN 자동 기록
- ~~`npm audit` moderate 9~~ → 세션 19에서 현 배포 비익스플로이트 분류 완료 (monaco 커스텀 provider 0건, @prisma/dev/drizzle-kit dev-only)
- **proxy.ts `runtime` 선언 금지**: Next.js 16 `proxy.ts`는 암시적 Node.js 런타임. `export const runtime = "nodejs"` 등 route segment config 선언 시 빌드 오류. 주석으로 대체
- **Route Handler에서 쿠키 읽기 안전**: CVE-2025-29927은 middleware 레벨의 `x-middleware-subrequest` 헤더 우회 버그. Route Handler의 `request.cookies`/`cookies()`는 영향권 밖 — api-guard cookie fallback은 구조적으로 안전
- **레거시 인증 30일 전환**: `verifySession`에서 role 없는 구형 JWT → ADMIN 간주. 전환 기간 종료 시 제거 예정 (`DASHBOARD_PASSWORD` fallback 포함)
- **Turbopack NFT 경고 잔존**: `outputFileTracingExcludes` 적용 후에도 Turbopack 로그에 경고 남음. 산출물 정상, 크기 영향 없음
- **`npm audit` moderate 9**: drizzle-kit 0.31.10 번들 `@esbuild-kit/esm-loader@2.6.5` + monaco-editor 0.55.1 → dompurify@3.2.7. `audit fix --force`는 drizzle-kit 0.18.1 다운그레이드 요구. dev-only + 업스트림 미배포라 수용
- **Windows `next build` 불가**: `lightningcss-win32-x64-msvc` 미설치. WSL2 Linux 바이너리 정상 — 배포는 문제없음. `/ypserver` Phase 1 실패하므로 WSL 빌드로 통일 또는 `npm i -D lightningcss-win32-x64-msvc` 로 복구
- **SQLite `data/` cold start**: 첫 `getDb()` 호출 전 PM2 로그에 "Cannot open database because the directory does not exist" 누적. `src/lib/db/index.ts`가 `fs.mkdirSync({recursive:true})`로 자동 생성하지만 로그 노이즈 제거용으로 PM2 pre-start mkdir 검토
- **Cloudflare Tunnel WSL2 재기동**: systemd 비활성 환경에서 Windows 재시작 시 PM2 데몬 자체가 사라질 수 있음 — `pm2 resurrect` 자동화 또는 WSL systemd 활성 검토
- **Table Editor CRUD 미구현**: 읽기 전용만 지원. Phase 14b에서 완성

---
[← handover/_index.md](./_index.md)
