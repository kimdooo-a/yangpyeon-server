# 인수인계서 — 세션 18 (근본 auth 재설계 + 기술부채 정리 + Phase 14a)

> 작성일: 2026-04-12
> 이전 세션: [session17](./260412-session17-monaco-xyflow.md)
> 세션 저널: [journal-2026-04-12.md](../logs/journal-2026-04-12.md)

---

## 작업 요약

Next.js 16 `middleware.ts` → `proxy.ts` 전환을 단순 리네임(L)이 아닌 **CVE-2025-29927 구조적 방어**(M)로 격상. auth 책임을 proxy에서 Layout + Route Handler로 이관, 기존 `checkDashboardSession`의 "첫 ADMIN 반환" authZ 버그도 동시 수정. Turbopack NFT + npm audit HIGH + Cron 부트스트랩 정리 후 Phase 14a Table Editor(읽기 전용)까지 포함해 11 커밋 푸시.

## 대화 다이제스트

### 토픽 1: 세션 진입 + 작업 선택
> **사용자**: "새로운 세션...."  → 선택지 제시 후 **"3"** (세션 18 신규 작업) → **"정리형 ... 순차적으로 실행"**

마스터 계획 후속 항목 5종 제시(A Table Editor / B CRUD / C Webhook / D 기술부채 / E P1 신규). 사용자가 D 우선 + A 후속의 순차 경로 지정. TaskCreate 5건으로 착수.

**결론**: D→A 순서, 각 단계 독립 커밋.

---

### 토픽 2: D1 범위 격상 (L → M)
> **사용자**: "L이 근본적인 해결책이야?"

D1 착수 직후 Skill(routing-middleware) 문서에서 "proxy.ts에 auth 두지 말라(CVE-2025-29927)"를 확인. 단순 리네임(L)은 deprecation 경고만 제거하고 CVE 취약 패턴을 그대로 proxy로 옮길 뿐.

솔직 답변:
- L = 미봉책. auth 로직 그대로 → `x-middleware-subrequest` 조작 우회 위험 지속
- M = 근본 해결. proxy(네트워크 경계)에서 auth 제거 + Layout/Handler에서 재검증(프레임워크 경계)

사용자 **"근본적인 해결로 접근... 순차적이고 종합적으로"** → Plan Mode 진입.

**결론**: D1을 5단계(D1-1~D1-5)로 분할 설계. 전체 세션 9+2 커밋으로 계획.

---

### 토픽 3: Plan Mode (Phase 1~5)

Phase 1 — Explore 3병렬:
- ① 현 auth 표면 전수(middleware/auth.ts/jwt-v1/api-guard/role 체크 지점) + 책임 이관 매트릭스
- ② 기술부채 3건 실체(NFT 트레이스 원인/npm audit JSON/Cron 진입점)
- ③ Table Editor 자산 재사용 지점(TanStack audit/page.tsx/introspect.ts/pool.runReadonly)

Phase 2 — Plan 1건:
- D1-1 ~ D1-5 세부 구현 설계 + 롤백 플랜 + E2E 시나리오 (600줄)

Phase 4 — Plan 파일 `C:\Users\smart\.claude\plans\jaunty-forging-beacon.md`에 종합 계획 확정.

Phase 5 — ExitPlanMode 승인.

**결론**: 순차 11 커밋 + WSL2 빌드·E2E·푸시까지 세션 내 전수 수행.

---

### 토픽 4: D1-1 auth-guard 헬퍼
설계 핵심:
- `NextRequest` 인자를 **받지 않음** → `cookies()` 직접 호출. `x-middleware-subrequest` 헤더 조작 경로 구조적 차단
- 4개 함수: `requireSession`/`requireRole`(Layout용 redirect) + `requireSessionApi`/`requireRoleApi`(Handler용 NextResponse)
- Discriminated union `{session}|{response}` 반환 → 핸들러에서 session 검증 누락 불가능

**결론**: 커밋 `8f22829`, 호출자 0 (비파괴).

---

### 토픽 5: D1-2 (protected) 라우트 그룹 + 15 페이지 이동
전략: 파일 이동 vs route group 경로 조정 중 **물리 이동 채택**. 근거:
1. Layout 상속으로 "보호 의도"를 타입 시스템 + 파일 트리에 명시
2. 신규 페이지를 (protected) 하위에 만들면 자동 보호 (휴먼 에러 방지)
3. Route group은 URL에 미반영 → 사이드바·CommandPalette·북마크 변경 0

`git mv` 15개 (MANAGER+ 13 + ADMIN 2). `.next/types/validator.ts` 스테일 캐시로 tsc가 이전 경로 오류 → `rm -rf .next` 후 정상.

**결론**: 커밋 `b50c40f`, git rename 인식으로 히스토리 보존.

---

### 토픽 6: D1-3 Route Handler 재검증 배선
실제 쿠키 기반 API 식별: 11개가 아닌 **8개**(filebox는 v1 Bearer였음).

특이점 2건:
- `/api/pm2/route.ts` GET: 현재 auth 체크 0 — middleware가 유일한 방어벽. 이관 시 **반드시 추가** 필요
- `/api/settings/users`: `api-guard.withRole` 사용 중 → D1-5에서 Bearer 전용화되면 쿠키 호출자 파손 → `requireRoleApi("ADMIN")`로 이관

Vercel 스킬 훅의 "local filesystem write / searchParams async / observability" 경고는 모두 WSL2 PM2 환경 + URL API 사용 + 자체 감사로그라 해당 없음, 스킵.

**결론**: 커밋 `03a2da9` (8 파일).

---

### 토픽 7: D1-4 proxy.ts 도입 + middleware.ts 삭제
proxy.ts 잔여 책임: IP 화이트리스트, Rate Limit, CORS/CSRF, 감사 로그 4종. auth 블록 완전 제거.

Windows 빌드 lightningcss 네이티브 바이너리 부재로 실패(세션 17 기록). WSL2 빌드가 진실 소스 — 세션 18에서도 동일 경로.

**결론**: 커밋 `cf04c57`.

---

### 토픽 8: D1-5 Bearer 전용화 → 회귀 → 재조정
**1차 구현** (`bb89723`): api-guard에서 cookie fallback 제거, Bearer 전용. tsc 통과.

**A 착수 중 회귀 발견**:
- `grep "fetch.*api/v1" src/app/(protected) src/components` → 30여 지점 확인. 모두 같은 origin fetch(쿠키 자동 전송)에 의존 중. Bearer 전용화 → 전부 401 파손.
- 추가로 기존 `checkDashboardSession`이 **실제 세션 주체와 무관하게 DB의 "첫 ADMIN 계정"을 반환**하는 authZ 버그 포착 (CVE와 무관).

**재조정** (`db65b02`):
- CVE-2025-29927은 middleware 레벨의 `x-middleware-subrequest` 헤더 우회 버그. Route Handler의 `request.cookies` 직접 읽기는 **영향권 밖** → 쿠키 fallback 자체는 안전
- 신규 `resolveCookieSession`: `getSessionFromCookies()` → `prisma.user.findUnique({id: session.sub})` + `isActive` 확인 → 실제 세션 주체의 role 사용. 레거시 `sub="legacy"`만 DB 조회 생략
- withAuth는 Bearer 우선 + 쿠키 fallback 동시 지원. 대시보드 UI 복구 + authZ 버그 제거

**결론**: 근본 해결 = CVE 방어(구조) + authZ 버그 수정(로직) 둘 다 달성.

---

### 토픽 9: D2 Turbopack NFT / D3 npm audit / D4 instrumentation
**D2** (`4f7ead2`): `next.config.ts`에 `outputFileTracingExcludes: { "/api/v1/backups": ["**/pg_dump*", "**/node_modules/@prisma/engines/**"] }` 추가. 빌드 오류 사라짐, 경고는 잔존(산출물 정상).

**D3** (`1159fe8`): `npm audit fix` 자동 적용으로 next 16.2.3 + hono/dompurify transitive 패치. HIGH 1 + MODERATE 2 해결. 잔여 9 moderate는 drizzle-kit devDep + monaco-editor 업스트림 체인 — `audit fix --force`는 drizzle-kit 0.18.1 다운그레이드 요구로 수용 후 문서화.

**D4** (`e83025d`): `src/instrumentation.ts` 생성 — `NEXT_RUNTIME === "nodejs"` 가드로 `ensureStarted()` 호출. PM2 재시작 즉시 Cron tick 시작, HTTP 트리거 대기 제거.

---

### 토픽 10: A Phase 14a Table Editor (`26b65b6`)
API 3개 (MANAGER+, app_readonly):
- `/api/v1/tables` — 목록 (`pg_tables` + `pg_class.reltuples` + 컬럼수)
- `/api/v1/tables/[table]` — 페이지네이션 조회 (limit≤200, order/dir)
- `/api/v1/tables/[table]/schema` — 컬럼 메타 + PK

보안 3중 방어:
1. identifier 정규식 `^[a-zA-Z_][a-zA-Z0-9_]*$`
2. DB 존재 대조 (`information_schema.columns` 조회로 화이트리스트)
3. 동적 `quote_ident` (`"..."`+`""` 이스케이프) + `app_readonly` + `BEGIN READ ONLY`

UI: `(protected)/tables/page.tsx` 카드 그리드 + `[table]/page.tsx` + TanStack Table v8 data grid + 타입 배지 + 클릭 정렬. 사이드바 데이터베이스 그룹 최상단에 등록.

---

### 토픽 11: WSL2 배포 + proxy.ts runtime 수정
1차 빌드 실패:
```
Error: Route segment config is not allowed in Proxy file at "./src/proxy.ts".
Proxy always runs on Node.js runtime.
```

Next.js 16 `proxy.ts`는 **암시적** Node.js 런타임이며 `runtime`/`dynamic` 등 route segment config 일체 금지. `export const runtime = "nodejs"` 제거, 주석으로 대체(`77be0fe`).

2차 빌드 성공: `ƒ Proxy (Middleware)` 인식, 전 라우트 컴파일, `Ready in 119ms`.

E2E curl 전수 통과:
- `/login` 200
- `/tables` 307 → `/login` (Layout requireSession 작동)
- `/api/v1/tables` 무인증 401
- `/processes` 307 → `/login`
- pm2 flush 후 신규 에러 로그 0건

**결론**: **CVE-2025-29927 방어 E2E 검증 완료**.

---

### 토픽 12: 커밋 & 푸시
> **사용자**: "커밋 앤 푸시"

로컬 `src/proxy.ts` 수정분 커밋(`77be0fe`) 후 `git push origin main` — 11 커밋 일괄 푸시 성공.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | D1을 L(리네임)이 아닌 M(아키텍처 재설계)으로 | L: 30분, 회귀 0, CVE 미해결 / M: 3~5h, 회귀 위험 중, CVE 구조 방어 | 사용자 "근본 해결" 명시 |
| 2 | (protected) 물리 이동 vs route group 경로 조정 | 이동: diff 큼 / 조정: 불가(route group은 물리 디렉터리 필수) | Layout 상속으로 보호 의도 타입 시스템에 명시, URL 불변 |
| 3 | D1-5 Bearer 전용화 후 재조정 | 초판 유지(30여 UI 파손) / revert(CVE 목표 무산) / 안전한 fallback 재도입 | CVE는 middleware 버그이며 Route Handler 쿠키 읽기는 영향권 밖 — 안전한 fallback + authZ 버그 동시 해결 |
| 4 | npm audit 잔여 9 moderate 수용 | --force 적용(drizzle-kit 0.18.1 다운그레이드) / 수용 | dev-only 체인 + 업스트림 미배포 상태, 런타임 미영향 |
| 5 | proxy.ts `runtime` 선언 제거 | 선언 유지(빌드 오류) / 제거 | Next.js 16 proxy는 암시적 Node.js — route segment config 금지 |

## 수정/신규/삭제 파일

### 신규 (17)

| # | 파일 | 용도 |
|---|------|------|
| 1 | `src/lib/auth-guard.ts` | cookie()+discriminated union 기반 4종 가드 |
| 2 | `src/proxy.ts` | Next.js 16 proxy (IP/RL/CORS/CSRF/감사로그) |
| 3 | `src/instrumentation.ts` | PM2 기동 직후 Cron 부트스트랩 |
| 4 | `src/app/(protected)/layout.tsx` | `requireSession()` |
| 5 | `src/app/(protected)/(admin)/layout.tsx` | `requireRole("ADMIN")` |
| 6 | `src/app/api/v1/tables/route.ts` | 테이블 목록 API |
| 7 | `src/app/api/v1/tables/[table]/route.ts` | 행 조회 API |
| 8 | `src/app/api/v1/tables/[table]/schema/route.ts` | 스키마 API |
| 9 | `src/app/(protected)/tables/page.tsx` | 목록 페이지 |
| 10 | `src/app/(protected)/tables/[table]/page.tsx` | 데이터 페이지 |
| 11 | `src/components/table-editor/table-data-grid.tsx` | TanStack Table 그리드 |
| 12 | `src/components/table-editor/column-type-badge.tsx` | 타입 배지 |
| 13 | `docs/handover/260412-session18-auth-refactor.md` | 본 인수인계서 |
| 14 | `docs/solutions/2026-04-12-nextjs16-proxy-migration-cve.md` | proxy 마이그레이션 솔루션 |
| 15 | `docs/solutions/2026-04-12-cookie-authz-bug-first-admin-fallback.md` | authZ 버그 솔루션 |

### 이동 (15 디렉터리, git mv)
`src/app/{page.tsx,processes,logs,network,metrics,filebox,members,sql-editor,database,data-api,functions,realtime,advisors}` → `(protected)/`
`src/app/{audit,settings}` → `(protected)/(admin)/`

### 삭제
- `src/middleware.ts` (proxy.ts로 교체)

### 수정
- `src/lib/api-guard.ts` — `checkDashboardSession` 제거 → `resolveCookieSession` (실제 세션 주체 기반)
- `next.config.ts` — `outputFileTracingExcludes` 추가
- `package.json`/`package-lock.json` — next 16.2.3 + transitive
- `src/components/layout/sidebar.tsx` — `/tables` 등록 + `MANAGER_PLUS_PATHS`
- 쿠키 Route Handler 8개 — `requireSessionApi`/`requireRoleApi` 삽입
- `docs/status/current.md` — 세션 18 요약행 + 이슈 메모
- `docs/handover/next-dev-prompt.md` — (다음 단계에서 갱신)
- `docs/handover/_index.md` — (다음 단계에서 갱신)
- `docs/logs/journal-2026-04-12.md` — 15 항목 append
- `docs/logs/2026-04.md` — 세션 18 상세 기록

## 검증 결과

- `npx tsc --noEmit` (각 단계 후 재실행) → 에러 0
- WSL2 `npm run build` → 84+ 라우트, `ƒ Proxy (Middleware)` 인식, `/tables`, `/tables/[table]` 정상 포함, `Ready in 119ms`
- PM2 재시작 → `dashboard` status `online` (pid 7574, 7회 restart)
- E2E curl:
  - `/login` → 200 ✓
  - `/tables` → 307 (→ `/login`, Layout `requireSession` 작동) ✓
  - `/api/v1/tables` 무인증 → 401 `UNAUTHORIZED` ✓
  - `/processes` → 307 (→ `/login`) ✓
- pm2 flush 후 신규 에러 로그 0건
- Cloudflare Tunnel `online` (세션 16 등록분 유지)
- Git push: `eb35a1f..77be0fe` → `origin/main` 성공 (11 커밋)

## 터치하지 않은 영역

- Phase 14b (CRUD 에디터) — Phase 14a 읽기 전용만 구현
- Phase 15b Webhook/Alert 완성 — 스캐폴드 상태 유지
- `/api/auth/logout`, `/api/auth/me` — 각각 쿠키 소거 / 이미 `getSessionFromCookies` 사용이라 현 상태 유지
- v1 API 중 `/api/v1/filebox/**`, `/api/v1/cron/**`, `/api/v1/schema`, `/api/v1/sql/execute` 등 — api-guard.withAuth 통해 Bearer + 쿠키 fallback 이중 지원으로 자동 복구됨
- Drizzle SQLite — ip_whitelist/audit_logs/metrics_history 스키마 불변
- Prisma — 마이그레이션 없음

## 알려진 이슈

- **Turbopack NFT 경고 잔존**: `outputFileTracingExcludes` 적용 후에도 Turbopack 빌드 로그에 "Encountered unexpected file in NFT list" 경고는 남음. 산출물 정상, 크기 영향 없음 → 후속 세션에서 `turbopackIgnore` 주석 또는 pgdump 동적 require로 대체 검토
- **npm audit 잔여 9 moderate**: drizzle-kit@0.31.10 번들 `@esbuild-kit/esm-loader@2.6.5` + monaco-editor 업스트림 dompurify@3.2.7. `audit fix --force`는 drizzle-kit 0.18.1 다운그레이드 요구. dev-only 체인이라 런타임 미영향 — 업스트림 릴리스 대기
- **SQLite data/ 디렉터리 초기 부재**: `src/lib/db/index.ts`가 `fs.mkdirSync({recursive:true})`로 생성하지만 WSL2 첫 배포 시 디렉터리 부재 → cold start 로그에 `Cannot open database because the directory does not exist` 누적. 실제 첫 `getDb()` 호출 시 자동 생성됨(기존 트래픽 유입 전 로그에만 영향). 배포 자동화에 `mkdir -p data` 추가 고려
- **Table Editor CRUD 미구현**: 읽기 전용만 지원. 행 추가/수정/삭제는 Phase 14b
- **브라우저 UI E2E 미수행**: curl smoke만 통과. 로그인 후 `/tables` 페이지 렌더·데이터 그리드 상호작용·정렬은 수동 검증 권장

## 다음 작업 제안

### 즉시 가능
1. **Table Editor 브라우저 E2E** — 로그인 → `/tables` → 각 테이블 클릭 → 페이지네이션/정렬 상호작용 수동 검증
2. **Phase 14b CRUD 에디터** — `/api/v1/tables/[table]/[id]` PUT/DELETE, POST 추가. 트랜잭션 + app_readonly 해제 필요 (별도 롤 또는 session-scoped)
3. **Phase 15b Webhook/Alert 완성** — 세션 15 스캐폴드 실동작화(이벤트 트리거 + 시그니처 검증 + 재전송)

### 기술부채 후속
4. Turbopack NFT 경고 완전 제거(`turbopackIgnore` 주석 또는 spawn 지연 require)
5. `data/` 디렉터리 PM2 ecosystem에 pre-start mkdir 추가
6. 30일 전환 기간 종료 — `verifySession`의 레거시 role 없는 토큰 ADMIN fallback 제거

### 보안 후속
7. auth-guard에 `writeAuditLog({action:"AUTH_FAILED"/"FORBIDDEN"})` 추가 — 인증 실패 이벤트 관측성
8. v1 API Bearer-only 엔드포인트 별도 구분 — 관리자 자동화 스크립트용 토큰과 대시보드 쿠키 경로 명확 분리

---
[← handover/_index.md](./_index.md)
