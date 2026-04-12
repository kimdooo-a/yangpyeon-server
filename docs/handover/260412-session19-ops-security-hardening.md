# 인수인계서 — 세션 19 (세션 18 후속: 운영/보안 잔가지 정리)

> 작성일: 2026-04-12
> 이전 세션: [session18](./260412-session18-auth-refactor.md)
> 세션 저널: [journal-2026-04-12.md](../logs/journal-2026-04-12.md)

---

## 작업 요약

세션 18(`0e59be0`) 직후 이어진 후속 세션. 세션 18이 남긴 **3대 잔여 이슈(npm audit moderate 9 / Turbopack NFT 경고 / Table Editor 수동 E2E)** 를 순차 정리하고, 운영·보안 잔가지 묶음(**#2 auth-guard 감사 로그 / #3 instrumentation data/ mkdir / #4 프로덕션 E2E 실행**)을 완성. 마지막으로 다음 세션용 Phase 14b CRUD 프롬프트를 자기완결형 지시문으로 준비. 총 5 커밋.

## 대화 다이제스트

### 토픽 1: 세션 18 리포트 검토 + runtime 수정 커밋 상태 확인
> **사용자**: 세션 18 완료 리포트 11 커밋 표 공유 후 "로컬 미커밋: proxy.ts의 runtime 선언 제거 수정분이 아직 커밋되지 않았습니다 ··· 커밋하시려면 알려주세요."

`git status`로 `M src/proxy.ts` 확인 후 커밋 여부 묻기 직전에 사용자가 "다른 터미널에 완료함. 확인해봐" 보고. 검증 결과 `77be0fe fix(build): proxy.ts의 export const runtime 제거` + `0e59be0 docs: 세션 18 종료` 두 커밋이 다른 터미널에서 이미 반영되어 있었고, 내 워킹카피에는 `current.md`/`journal-2026-04-12.md` 편집 중간 상태가 uncommitted로 남아 있음을 발견.

**결론**: 다른 터미널이 세션 18 종료 작업(current/journal/handover)을 완료 중임을 인지하고 내 터미널에서는 해당 파일들을 건드리지 않기로 방침 수립.

---

### 토픽 2: 세션 18 잔여 이슈 3건 순차 정리
> **사용자**: "넌 잔여이슈를 순차적으로 진행해줘."

TaskCreate 3건(npm audit / NFT 경고 / E2E 가이드).

**#1 npm audit moderate 9 분석**:
- `@hono/node-server` (GHSA-92pp-h63x-v22m) via `prisma → @prisma/dev` → `prisma dev` 서브커맨드 전용(playground 서버), `next start`/`prisma migrate deploy` 경로 미사용
- `dompurify` 4건 via `monaco-editor` → Monaco는 hover/completion 마크다운 렌더 경로에서만 DOMPurify.sanitize 호출, 프로젝트는 커스텀 provider 0건(SQL editor 단일 사용, SQL 언어만) → 공격 경로 부재
- `esbuild` (GHSA-67mh-4wv8-2f99) via `drizzle-kit → @esbuild-kit` → `drizzle-kit`은 devDependencies, 빌드/마이그레이션 전용
- `npm audit fix --force`는 `prisma@6.19.3`, `drizzle-kit@0.18.1` breaking downgrade 유발 — **미적용**

**#2 Turbopack NFT 경고 추적**:
- 원인: `/api/v1/backups` 라우트의 `fs.readdir`/`spawn`/`path.join(..., userInput)` 조합을 Turbopack이 보수적으로 추적 → next.config.ts → pgdump.ts → route.ts 체인 전부 트레이스
- 시도 1: `/*turbopackIgnore: true*/` 주석 → 경고 지속
- 시도 2: `paths.ts` 경량 유틸 분리 → download 라우트는 해결, list/create 라우트는 여전
- 시도 3: 동적 import로 체인 끊기 → Turbopack이 청크로 flatten, 무효
- **결론**: backup 모듈은 구조적으로 NFT가 포기해야 하는 경계. cosmetic 경고로 확정. `outputFileTracingExcludes`는 번들 제외 효과 유지.

**#3 /tables UI 수동 E2E 가이드**:
- `docs/guides/tables-e2e-manual.md` 작성 — 7 시나리오(S1 인증 가드 / S2 VIEWER 차단 / S3 목록 / S4 개별 / S5 읽기 전용 강제 / S6 식별자 주입 / S7 롤 경로), 실패 조치 매트릭스, 통과 기준 포함

**결론**: 커밋 `dec6abe docs/chore: 잔여 이슈 3건 처리 — NFT 경고 문서화 + Table Editor E2E 가이드` + 푸시.

---

### 토픽 3: 다음 작업 선정 + Phase 14b 프롬프트 파일 준비
> **사용자**: "이제 다음 남은 작업은 뭐야?"

`next-dev-prompt.md` 기반으로 7개 후보 제시(Phase 14b / auth 감사 로그 / data mkdir / E2E 실행 / Phase 15b / 15a / 15c). 추천: "오늘은 #2+#3+#4 운영/보안 잔가지 묶음(2~3시간) → 다음 세션에 #1(Phase 14b) brainstorming".

> **사용자**: "#1에 대해서 새로운 터미널에 다음 작업 실시할 수 있는 상세 프롬프트 만들어줘."

Phase 14a 구조(API 3개, runReadonly/app_readonly, identifier 정규식) 재확인 후 `docs/handover/phase-14b-crud-prompt.md` 작성. 구조:
- 세션 목표 + 프로젝트 컨텍스트 + 필독 파일 10개
- 핵심 설계 결정 5개(PK 감지 / 값 타입 coercion / 파라미터 바인딩 / 감사 페이로드 / 권한 매트릭스)
- `app_readwrite` PG 롤 SQL + `runReadwrite` 헬퍼 설계
- 작업 순서(brainstorming → writing-plans → executing-plans 체인 권장)
- 보안 체크리스트 + DoD 10개

**결론**: 프롬프트 파일은 작성만 하고 커밋은 보류(이후 묶음에서 커밋).

---

### 토픽 4: #2 + #3 + #4 운영/보안 잔가지 순차 실행
> **사용자**: "순차적으로 진행해줘...#2 + #3 + #4 (운영/보안 잔가지 묶음, 2~3시간)"

**#2 auth-guard 감사 로그 배선**:
- `requireSessionApi()` / `requireRoleApi(role)` 시그니처를 `(request)` / `(request, role)`로 변경 — request **필수** 도입
- 세션 부재 → `AUTH_FAILED`(401) + role 부족 → `FORBIDDEN`(403) writeAuditLog 자동 기록(method/path/IP/email/요구 role)
- 타입 강제로 신규 라우트에서 감사 로그 누락 구조적 방지
- 8개 호출처(settings/users, settings/ip-whitelist, settings/env, pm2 4종) 일괄 업데이트 — `tsc --noEmit` 0 오류 확인

**#3 instrumentation data/ 선제 생성**:
- 기존: `getDb()` 최초 호출 시 mkdirSync → 그 이전 경로에서 "Cannot open database because the directory does not exist" 노이즈 누적
- 개선: `src/instrumentation.ts`의 `register()`가 서버 기동 시 1회 `mkdirSync('data', {recursive:true})` → Cron `ensureStarted()` 체인

**#4 Table Editor 프로덕션 E2E 실행** (Chrome DevTools MCP):
| 시나리오 | 결과 |
|---|---|
| S1 인증 가드 | ✅ `/tables` → 307 `/login` / `/api/auth/me` → 401 |
| S2 VIEWER 차단 | ⏭ SKIP — VIEWER 계정 미보유 |
| S3 테이블 목록 | ✅ 11 테이블 렌더. cosmetic: "행 ~-1" |
| S4 users 테이블 | ✅ 10 컬럼 + 타입 배지 + 1행 + "총 1" 페이지네이션 |
| S5 쓰기 차단 | ✅ PATCH/POST/DELETE 405 + SQL UPDATE 400 DANGEROUS_SQL |
| S6 식별자 주입 6종 | ✅ 모두 400/403/404 차단, SQL 도달 0건 |
| S7 app_readonly 경로 | ⚠ PARTIAL — SELECT 200 정상, PM2 로그 `SET LOCAL ROLE` 문자열은 별도 WSL 터미널 |

**결론**: 4 커밋(`59ead98`, `189785c`, `e36e598`, `ae07e67`) 분할 + 푸시 → 원격 `ae07e67` 반영.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | NFT 경고 cosmetic 확정 | A) turbopackIgnore 주석 B) paths.ts 분리 C) 동적 import D) 수용 | A/B/C 모두 실패. 백업 모듈은 동적 fs 연산이 본질적 요구 — Turbopack NFT의 구조적 한계. `outputFileTracingExcludes`로 번들 제외는 유지 |
| 2 | npm audit `--force` 미적용 | A) 적용(breaking) B) 수용+문서화 | dev-only + 업스트림 미배포 + 공격 경로 부재. breaking downgrade(prisma@6/drizzle-kit@0.18)가 오히려 위험 |
| 3 | auth-guard `request` **필수** 도입 | A) optional(기존 호환) B) required(파괴적) | required로 타입 시스템 강제 → 신규 라우트에서 감사 로그 누락 원천 차단. 14 호출처 일괄 수정 비용 수용 |
| 4 | 세션 종료/감사 로그 파일은 건드리지 않음 | A) 내가 기록 B) 다른 터미널 진행 유지 | 다른 터미널이 세션 18 종료 작업 수행 중. 같은 파일 편집 시 머지 충돌 + 중복 기록 위험 |
| 5 | Phase 14b 프롬프트는 별도 파일 + 루트 지시문 구조 | A) 단일 긴 프롬프트 B) 루트+상세 분리 | 복사 편의성 + 토큰 효율 + brainstorming 체인 강제 가능. 새 세션은 루트 지시문만 읽고 시작 |
| 6 | E2E는 프로덕션에서 수행 | A) 스킵 B) dev 서버 재기동 후 로컬 C) 프로덕션 수행 | C — 시나리오가 전부 비파괴(SELECT/405/400/403/404), ADMIN 계정 보유, 세션 18 결과물 자체가 프로덕션 배포됨 |

## 수정 파일 (13개, 5 커밋 누적)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/auth-guard.ts` | request 필수화 + AUTH_FAILED/FORBIDDEN writeAuditLog 배선 |
| 2 | `src/lib/backup/pgdump.ts` | paths.ts re-export 코멘트 (paths.ts 자체는 다른 터미널 `0e59be0`에서 도입) |
| 3 | `src/instrumentation.ts` | mkdirSync('data') 기동 시점 선제 호출 |
| 4 | `next.config.ts` | NFT 경고 cosmetic 주석 명확화 (outputFileTracingExcludes는 유지) |
| 5 | `src/app/api/settings/users/route.ts` | GET() → GET(request), 3개 requireRoleApi 호출에 request 주입 |
| 6 | `src/app/api/settings/ip-whitelist/route.ts` | 동일 패턴, 3 호출 |
| 7 | `src/app/api/settings/env/route.ts` | 동일 패턴, 3 호출 |
| 8 | `src/app/api/pm2/route.ts` | GET() → GET(request), requireSessionApi(request) |
| 9 | `src/app/api/pm2/logs/route.ts` | requireSessionApi() → requireSessionApi(request) |
| 10 | `src/app/api/pm2/detail/route.ts` | 동일 |
| 11 | `src/app/api/pm2/[action]/route.ts` | requireRoleApi(request, "ADMIN") |
| 12 | `docs/guides/tables-e2e-manual.md` | 신규 — 7 시나리오 + 실행 이력 블록(2026-04-12 22:10) |
| 13 | `docs/handover/phase-14b-crud-prompt.md` | 신규 — 자기완결형 세션 프롬프트 255줄 |

## 상세 변경 사항

### 1. auth-guard API 시그니처 변경 (59ead98)
```ts
// Before
export async function requireSessionApi(): Promise<AuthApiResult>
export async function requireRoleApi(role: Role | Role[]): Promise<AuthApiResult>

// After
export async function requireSessionApi(request: NextRequest): Promise<AuthApiResult>
export async function requireRoleApi(request: NextRequest, role: Role | Role[]): Promise<AuthApiResult>
```
세션 부재 / role 부족 시 `writeAuditLog({method, path, ip, status, action, detail})` 자동 호출. action은 `AUTH_FAILED`/`FORBIDDEN`, detail은 `${email} role=${userRole} required=${allowed.join("|")}`.

### 2. instrumentation data/ 선제 생성 (189785c)
```ts
if (process.env.NEXT_RUNTIME !== "nodejs") return;
const { mkdirSync } = await import("node:fs");
const { join } = await import("node:path");
mkdirSync(join(process.cwd(), "data"), { recursive: true });
const { ensureStarted } = await import("@/lib/cron/registry");
ensureStarted();
```

### 3. Table Editor E2E (e36e598)
실행 이력 블록을 `docs/guides/tables-e2e-manual.md` "## 실행 이력" 섹션에 추가. S5 침투 스크립트는 `fetch('/api/v1/tables/users', {method:'PATCH',...})` + `fetch('/api/v1/sql/execute', {body:'UPDATE users SET ...'})` 등 4건. S6 injection 6종(`users--DROP`, `users;DROP TABLE logs`, `users";--`, `%u0075sers`, `../users`, 300자 영문명).

### 4. Phase 14b 프롬프트 (ae07e67)
`docs/handover/phase-14b-crud-prompt.md` — 새 세션 진입용 자기완결 지시문. 특징:
- superpowers:brainstorming → writing-plans → executing-plans **체인 강제** 명시
- D1~D5 설계 결정(PK 감지 쿼리, 타입별 coercion 규칙, 감사 페이로드 구조, 권한 매트릭스)
- `app_readwrite` PG 롤 CREATE 스크립트 + `runReadwrite` 헬퍼 설계
- `src/lib/db/table-policy.ts` 신설 제안 (users/audit_logs/api_keys 차단)

## 검증 결과

| 검증 | 결과 |
|---|---|
| `npx tsc --noEmit` (세션 중 2회) | 0 오류 |
| Table Editor E2E S1/S3~S6 (프로덕션) | 전부 통과, SQL 도달 0건, write 성공 0건 |
| 콘솔 에러 (프로덕션 `/tables`) | 10건 — 모두 의도적 S5/S6 공격 테스트 예상 실패 |
| auth-guard 14 호출처 grep | `requireSessionApi()` / `requireRoleApi("ADMIN")` 잔존 0건 |
| 5 커밋 push | `0e59be0..ae07e67 main -> main` 성공 |

## 터치하지 않은 영역
- `src/proxy.ts` — 세션 18 `77be0fe`에서 runtime 제거 완료, 추가 변경 없음
- `src/lib/api-guard.ts` — v1 Bearer 전용 유지, 이번 세션 범위 밖
- `src/app/(protected)/*` Layout — 세션 18에서 완성
- `src/lib/backup/paths.ts` — 다른 터미널 `0e59be0`에서 추가, 내 터미널은 `turbopackIgnore` 주석 시도 후 revert
- `docs/status/current.md` / `docs/logs/journal-2026-04-12.md` / `docs/handover/next-dev-prompt.md` 중간 편집 (다른 터미널 세션 18 종료 소유)

## 알려진 이슈
- **auth-guard 변경분 미배포**: `59ead98`, `189785c` 등 이번 세션 커밋은 원격 main에만 반영. 실제 프로덕션(WSL2 PM2)은 `0e59be0` 기준 — 다음 세션 시작 시 `/ypserver`로 배포해야 감사 로그와 data mkdir 반영됨
- **S2 VIEWER 시나리오 미수행**: VIEWER 테스트 계정 미보유로 skip. Phase 14b CRUD 진입 전 VIEWER 계정 1개 생성 권장
- **S7 PM2 로그 확인 미수행**: `SET LOCAL ROLE app_readonly` 실제 발동 여부는 WSL2 터미널에서 `pm2 logs yp-dashboard --lines 200 | grep "SET LOCAL ROLE"` 별도 수행
- **테이블 목록 "행 ~-1"**: approximate count API가 -1 반환. cosmetic. `information_schema.reltuples` 또는 `COUNT(*)` 조회 전환 후속 과제
- **identifier regex 길이 제한 부재**: `^[a-zA-Z_][a-zA-Z0-9_]*$`은 300자도 통과 → DB 조회에서 404로 걸리지만 cosmetic 개선 권장 (`{1,63}` PG identifier 최대)

## 다음 작업 제안

### 즉시 (다음 세션)
1. **배포**: 이번 세션 커밋 반영 — `/ypserver` 스킬 실행 후 `/audit` 페이지에서 AUTH_FAILED/FORBIDDEN 이벤트 생성 검증
2. **Phase 14b CRUD** — `docs/handover/phase-14b-crud-prompt.md`를 새 터미널 프롬프트로 사용. superpowers:brainstorming 체인 진입
3. **VIEWER 계정 1개 생성** (Phase 14b CRUD 권한 매트릭스 검증용)

### 선택적 (언제든)
- Phase 15b Webhook/Alert 완성
- Phase 15a 파일 매니저 강화
- Phase 15c shadcn/ui 점진 전환
- 테이블 목록 행 수 `COUNT(*)` 또는 reltuples 전환 (cosmetic)
- identifier regex `{1,63}` 길이 제한 추가 (cosmetic)

### 참고 지식
- **감사 로그 활용**: `/audit` 페이지에서 `action=AUTH_FAILED` 필터로 무단 API 접근 시도 관측 가능. `action=FORBIDDEN`은 정상 세션 but 권한 부족 — 내부 사용자 권한 오설정 감지에 유용
- **Phase 14b 진입 전 필독**: `docs/handover/phase-14b-crud-prompt.md` — 본 인수인계서보다 상세하며 자기완결형
- **NFT 경고는 무시**: 앞으로 어떤 라우트를 추가하든 이 경고는 backup 모듈이 존재하는 한 남아있음. 번들 정상, 런타임 정상

---
[← handover/_index.md](./_index.md)
