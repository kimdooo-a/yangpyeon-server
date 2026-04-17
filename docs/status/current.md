# 프로젝트 현황

> 상위: [CLAUDE.md](../../CLAUDE.md) → **여기**

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| 프로젝트명 | 양평 부엌 서버 대시보드 |
| 스택 | Next.js 16 + TypeScript + Tailwind CSS 4 |
| 최종 수정 | 2026-04-12 (세션 19) |

## 현재 진행 상태

- [x] Phase 1: 초기화 (개발 체계 셋팅)
- [x] Phase 2: Next.js 프로젝트 생성 + 대시보드 v1
- [x] Phase 3: 서버 모니터링 API + UI
- [x] Phase 4: PM2 프로세스 관리
- [x] Phase 5: Cloudflare Tunnel 상태
- [x] Phase 6: 로그 뷰어
- [x] Phase 7: 배포 (PM2 + Cloudflare Tunnel)
- [x] Phase 8: 보안 Wave 1 (인증, 명령어 주입 방지, CORS/CSRF, 보안 헤더)
- [x] Phase 9: 대시보드 기능 개선 (그래프, 프로세스 모달, 로그 검색, 반응형 사이드바)
- [x] Phase 9b: 프론트엔드 디자인 전면 개선 (5개 페이지 + 공통 컴포넌트 + 사이드바)
- [ ] Phase 9c: 추가 개선 (네트워크 트래픽, 알림 페이지)
- [x] Phase 10: 보안 Wave 2 (Rate Limiting, 감사 로그)
- [x] Phase 11a: Zod 입력 검증 (전체 API Route)
- [x] Phase 11b: Sonner 토스트 알림
- [x] Phase 11d: SQLite + Drizzle 도입 (3 테이블)
- [x] Phase 11e: 감사 로그 인메모리 → DB 영속화
- [x] Phase 11f: IP 화이트리스트 CRUD + 미들웨어 검사
- [x] Phase 12a: 메트릭 히스토리 Recharts 차트
- [x] Phase 12b: SSE 실시간 스트리밍 (폴링 → SSE 전환)
- [x] Phase 12c: 감사 로그 전용 페이지 (TanStack Table)
- [x] Phase 12d: 환경변수 관리 UI
- [x] Phase 13a: DB 인증 통합 (하드코딩 → PostgreSQL User)
- [x] Phase 13b: 역할 기반 접근 제어 + 사용자 관리
- [x] Phase 13c: Cmd+K 커맨드 팔레트
- [x] Phase 13d: 스켈레톤 UI + 빈 상태 컴포넌트 (9개 페이지 일괄)
- [x] Phase 14b: Table Editor CRUD (세션 21 완료) — app_readwrite 롤 + runReadwrite fail-closed + identifier/coerce/table-policy 유틸 + POST/PATCH/DELETE API + RowFormModal 3상태 입력 + 민감 테이블 차단 + PK 쿼리 pg_catalog 전환. 6 커밋 푸시, WSL2 배포+E2E S8~S11 통과(TABLE_ROW_INSERT/UPDATE/DELETE 감사 로그 + OPERATION_DENIED + INVALID_TABLE 전부 확인).
- [x] **Phase 14c 1순위 (세션 23)**: `@updatedAt` DB DEFAULT 근본 수정 — 5개 기존 모델(User/Folder/SqlQuery/EdgeFunction/CronJob)에 `@default(now())` 병기 + 4개 모델(File/Webhook/ApiKey/LogDrain)에 `updatedAt` 신규 + B2 백필 UPDATE(4 테이블 전부 0행). `20260417140000_add_updated_at_default` migrate deploy 적용. E2E 전 매트릭스 통과 — S8a `updated_at` 생략 payload 200 ✅ (세션 22 500 버그 수정 증명), S8d/S8e 신규 테이블 200, S9~S11 전체 PASS.
- [ ] Phase 14~15: 데이터 관리 + 자율 운영 → [docs/MASTER-DEV-PLAN.md](../MASTER-DEV-PLAN.md)
- [x] Phase 14-S (세션 15): Supabase 관리 체계 이식 Phase A+B — Prisma +7 모델, 11 P0 모듈(/sql-editor, /database/schema, /data-api, /database/{webhooks,cron,backups}, /functions, /realtime, /advisors/{security,performance}, /settings/{api-keys,log-drains}) 스캐폴드.
- [x] Phase 14-S 배포 (세션 16): Prisma 증분 마이그레이션 적용(`20260412120000_supabase_clone_session_14`), `app_readonly` PG 롤 + SELECT 권한, `.env`에 `ENABLE_DB_BACKUPS=true`, monaco/xyflow/elkjs 설치, 12개 신규 페이지 HTTP 307 smoke 통과, 레거시 런타임 에러 2건(감사 로그 디렉토리, 스테일 세션 FK) 수정, Cloudflare Tunnel PM2 등록.
- [x] 세션 17: SQL Editor Monaco 치환 + Schema Visualizer xyflow/elkjs 치환 + 12 P0 페이지 Playwright E2E + SQL 기본값 오류 수정.
- [x] 세션 18: **근본 auth 아키텍처 재설계** — middleware.ts → proxy.ts (Next.js 16 + CVE-2025-29927 방어), (protected) 라우트 그룹 + Layout/Handler 재검증, api-guard `checkDashboardSession` authZ 버그 수정(resolveCookieSession 기반), Turbopack NFT 예외, next 16.2.3, instrumentation.ts Cron 부트스트랩, **Phase 14a Table Editor** 구현·배포·E2E 통과. 총 11 커밋.
- [x] 세션 19: **세션 18 후속 — 운영/보안 잔가지 묶음.** npm audit moderate 9 비익스플로이트 분류, Turbopack NFT 경고 구조적 한계 확정(paths.ts 분리), auth-guard에 AUTH_FAILED/FORBIDDEN 감사 로그 배선, instrumentation에서 data/ 선제 생성, Table Editor 프로덕션 E2E S1/S3~S6 실행·통과, Phase 14b CRUD 프롬프트 준비. 5 커밋.
- [x] Phase 14-S UI 고도화 (세션 17): SQL Editor `textarea` → Monaco(dynamic, Ctrl+Enter), Schema Visualizer 카드 그리드 → xyflow + elkjs layered(RIGHT) 자동 레이아웃, Playwright로 12 P0 페이지 E2E 0 에러 검증, 기본 쿼리 `"User"` → `users` 부수 수정.

## 실행 방법

```bash
# 개발
npm run dev

# WSL2 배포 (Windows에서)
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && cp /mnt/e/00_develop/260406_luckystyle4u_server/next.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json /mnt/e/00_develop/260406_luckystyle4u_server/tailwind.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/postcss.config.mjs /mnt/e/00_develop/260406_luckystyle4u_server/package.json . && npm install && npm run build && pm2 restart dashboard"
```

## 접속 URL

| 서비스 | URL | 비고 |
|--------|-----|------|
| 로컬 | http://localhost:3000 | 개발/프로덕션 동일 포트 |
| 외부 | https://stylelucky4u.com | Cloudflare Tunnel 경유, 로그인 필요 |

## 세션 기록 요약표

> 매 세션 종료 시 1행 추가 (삭제 안 함)
> 상세 기록 → [logs/_index.md](../logs/_index.md)

| 세션 | 날짜 | 제목 | 아카이브 | 인수인계서 |
|------|------|------|----------|------------|
| 1 | 2026-04-06 | 초기화 + 대시보드 v1 + 보안 Wave 1 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/250406-session1-init-security.md) |
| 2 | 2026-04-06 | 대시보드 기능 개선 (그래프, 모달, 검색, 반응형) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session2-dashboard-improve.md) |
| 3 | 2026-04-06 | 보안 Wave 2 (Rate Limiting + 감사 로그) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session3-security-wave2.md) |
| 4 | 2026-04-06 | 프론트엔드 디자인 전면 개선 + ypserver 배포 스킬 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session4-frontend-design.md) |
| 5 | 2026-04-06 | kdywave 종합 분석 + 마스터 개발 계획서 작성 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session5-master-plan.md) |
| 6 | 2026-04-06 | ypserver 배포 + Zod 검증 + SPIKE 3건 검증 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session6-spike-zod.md) |
| 7 | 2026-04-06 | 파일박스 v1→v2 (DB 기반 폴더 관리 + 회원 통합) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session7-filebox-v2.md) |
| 8 | 2026-04-06 | Sonner 토스트 + 감사 로그 DB + IP 화이트리스트 + 메트릭 차트 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260406-session8-12-massive-feature.md) |
| 9 | 2026-04-06 | SSE 실시간 스트리밍 (폴링→SSE 전환) | [2026-04](../logs/2026-04.md) | ↑ 통합 |
| 10 | 2026-04-06 | 감사 로그 UI + 환경변수 관리 | [2026-04](../logs/2026-04.md) | ↑ 통합 |
| 11 | 2026-04-06 | DB 인증 통합 + 역할 기반 접근 제어 | [2026-04](../logs/2026-04.md) | ↑ 통합 |
| 12 | 2026-04-06 | Cmd+K 커맨드 팔레트 (스켈레톤 UI 보류) | [2026-04](../logs/2026-04.md) | ↑ 통합 |
| 13 | 2026-04-06 | 회원관리 백엔드 + PostgreSQL + Warm Ivory 테마 | [2026-04](../logs/2026-04.md) | ↑ 통합 (logs만) |
| 14 | 2026-04-12 | 중단 터미널 3개 복구 + Phase 13d 완료 (9개 페이지 스켈레톤+EmptyState) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session14-phase13d-complete.md) |
| 15 | 2026-04-12 | Supabase 관리 체계 이식 — 리서치+문서화 + 11 P0 모듈 병렬 구현 (55 신규 파일) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session15-supabase-clone.md) |
| 16 | 2026-04-12 | 세션 15 배포(마이그레이션 적용 + app_readonly 롤 + UI 패키지) + 레거시 에러 2건 수정 + Cloudflare Tunnel 복구 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session16-supabase-deploy.md) |
| 17 | 2026-04-12 | SQL Editor Monaco 치환 + Schema Visualizer xyflow/elkjs 치환 + 12 P0 페이지 Playwright E2E (기본 쿼리 오류 1건 부수 수정) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session17-monaco-xyflow.md) |
| 18 | 2026-04-12 | 근본 auth 재설계 (middleware→proxy + CVE-2025-29927 방어 + authZ 버그 수정) + 기술부채 정리 (NFT/audit/cron) + Phase 14a Table Editor | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session18-auth-refactor.md) |
| 19 | 2026-04-12 | 세션 18 후속 — auth-guard 감사 로그 + instrumentation data/ mkdir + Table Editor 프로덕션 E2E + Phase 14b CRUD 프롬프트 + NFT/audit 분류 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session19-ops-security-hardening.md) |
| 20 | 2026-04-12 | Phase 14b 설계 체인 — brainstorming(D1~D5 + 추가 3건 합의) → ADR-003 → 실행 계획(12 Task × 5 커밋, 구현 전 단계 완료) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session20-phase-14b-design.md) |
| 21 | 2026-04-17 | Phase 14b 완전 구현·배포·E2E 통과 — C1 SQL 롤 + C2 라이브러리 + C3 API + C4 UI + C5 docs + PK 쿼리 pg_catalog 전환 fix + Drizzle migrations 적용 + 프로덕션 S8~S11 E2E(TABLE_ROW_INSERT/UPDATE/DELETE 감사 로그 + users 차단 + 인젝션 차단) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260417-session21-phase-14b-implementation.md) |
| 22 | 2026-04-17 | Phase 14b E2E DOD 실수행 — `/ypserver prod` 재배포(멱등) + curl 자동화 S8~S11 전 매트릭스 통과(TABLE_ROW_INSERT/UPDATE/DELETE 감사 로그 + 차단 5종). **신규 버그 발견**: Prisma `@updatedAt`이 DB DEFAULT를 만들지 않아 raw SQL INSERT가 500 — 현 UI "행 추가" 실사용자 경로 장애. Phase 14c 1순위 수정 대상 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260417-session22-phase-14b-e2e-updatedat-bug.md) |
| 23 | 2026-04-17 | Phase 14c 1순위 — brainstorming(D1 Option A / D2 A2 scope / D3 B2 backfill / D4 single migration / D5 full matrix) → writing-plans(13 Task) → subagent-driven-development 실행. 9개 모델 변경(5 병기 + 4 신규) + `20260417140000_add_updated_at_default` migrate deploy + E2E 매트릭스 전 PASS(S8a updated_at 생략 payload 200 ✅). Compound Knowledge 2건 기록 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260417-session23-phase-14c-updated-at-fix.md) |

## 이슈/메모
- KT 회선 포트 80/443 차단 → Cloudflare Tunnel 필수
- 기존 테스트 서버 삭제 완료, 대시보드로 대체됨
- middleware 경고 (Next.js 16 proxy 전환 권장, 현재 동작 문제 없음)
- CPU 사용률 0% 표시 이슈 (순간 스냅샷, 평균 계산 로직 필요) — 미니 그래프로 추이 확인 가능해짐
- ~~Cloudflare Tunnel: WSL 재시작 시 수동 시작 필요~~ — 세션 16에서 PM2로 등록 (`pm2 start cloudflared -- tunnel run`), `pm2 save`로 dump 저장
- ~~Turbopack NFT 경고~~ — 세션 19에서 구조적 한계로 확정(cosmetic). `outputFileTracingExcludes`로 번들 제외는 유지, `paths.ts` 분리로 download 라우트 trace 범위 축소
- ~~`npm audit` 11건~~ — 세션 19에서 잔여 9 moderate 현 배포 비익스플로이트 분류 완료 (monaco는 커스텀 hover/completion provider 0건, @prisma/dev dev-only, drizzle-kit devDeps)
- **세션 19 주의**: auth-guard API 변경으로 `requireSessionApi(request)` / `requireRoleApi(request, role)` 시그니처 — 신규 쿠키 기반 라우트 추가 시 `request` 필수. 감사 로그(AUTH_FAILED/FORBIDDEN) 자동 기록
- ~~**세션 22 (Phase 14b E2E 재수행 + `@updatedAt` 버그)**: `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` 참조. Prisma `@updatedAt` 필드는 DB DEFAULT를 생성하지 않아 Phase 14b raw SQL INSERT가 NOT NULL 위반 500. 현재 `RowFormModal` 3상태 "keep" 기본값으로 UI "행 추가" 실사용자 경로가 깨져 있음. Phase 14c에서 `@default(now()) @updatedAt` 병기 마이그레이션 권장(9개 모델 대상).~~ — **세션 23에서 해결**. 실제 범위는 5 병기 + 4 신규 = 9 (EdgeFunctionRun 제외). migrate deploy 적용 + E2E 전 매트릭스 통과.
- **세션 23 Compound Knowledge**: `docs/solutions/2026-04-17-prisma-migration-windows-wsl-gap.md` (Windows→WSL Postgres NAT 단절 시 마이그레이션 작성 워크플로우), `docs/solutions/2026-04-17-curl-e2e-recipe-dashboard.md` (WSL 환경에서 로그인+CSRF+쿠키 E2E 스크립트 레시피).
- **세션 20 (Phase 14b 설계 완료, 구현 미착수)**: ADR-003 + 실행 계획 확정. D1~D5 + 추가 3건 합의 — 민감 테이블 차단 목록(`users`/`api_keys`/`_prisma_migrations` + `edge_function_runs` DELETE-only), 모달 집중 UI, DB 영속 감사 로그, `runReadwrite` fail-closed, 3상태 폼 입력. **다음 세션은 executing-plans로 C1~C5 순차 실행 — C1(SQL 롤) WSL2 psql 수동 적용 → 코드 배포 순서 준수** (코드 선행 시 CRUD가 fail-closed 500)
- **프로젝트 단위 테스트 부재 주의**: Vitest 등 단위 러너 미설치. 신규 유틸(`identifier`/`coerce`/`table-policy`)은 curl 통합 + 브라우저 수동 E2E로 검증. 후속 세션에서 Vitest 도입 시 ADR-003 §5 재활성화
- **세션 18 주의**: Next.js 16 proxy.ts는 암시적 Node.js 런타임 — `export const runtime = "nodejs"` 선언 금지 (빌드 오류)
- **세션 18 주의**: Route Handler에서 `request.cookies`/`cookies()` 직접 읽기는 CVE-2025-29927 영향권 밖 (middleware 레벨 헤더 우회 버그). 쿠키 fallback은 안전하며 authZ는 실제 세션 주체 기반으로 수행
- Windows `next build` — `lightningcss-win32-x64-msvc` optional bin 미설치로 불가. WSL2 빌드가 진실 소스라 영향 없으나, `/ypserver` Phase 1이 항상 실패하므로 스킬 보강 필요 (세션 17)
