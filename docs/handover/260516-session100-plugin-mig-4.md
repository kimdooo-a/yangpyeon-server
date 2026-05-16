# 인수인계서 — 세션 100 (PLUGIN-MIG-4 Almanac 5 모델 fragment 분리 + RLS 라이브)

> 작성일: 2026-05-16
> 이전 세션: [session99 후속](./260510-session99-postscript-plugin-mig-3-abc.md)

---

## 작업 요약

S99 후속 (`33e6721` PLUGIN-MIG-3 cutover) + S99 후속 docs (`175d3e7`) 직후 새 세션 진입. /kdynext 7차원 진단 → 사용자 "/ypserver → PLUGIN-MIG-4 자율" 선택. **/ypserver 운영 적용** (PLUGIN-MIG-3 production 라이브 검증) + **PLUGIN-MIG-4 6 step 완주** (~3h) — Prisma 7 multi-file schema GA 활용, 5 Content* 모델 + 3 enum 을 `packages/tenant-almanac/prisma/fragment.prisma` 로 이전, support libs 8 파일 packages 이전, `tests/almanac/` 8 testcase 라이브 RLS 검증 (rls-isolation 5 + composite-unique 3) 모두 PASS. commit `67091d4` push.

**최대 메타 발견**: next-dev-prompt 의 PLUGIN-MIG-4 가이드가 **T1.6 마이그레이션(2026-04-27) 시점에 외부에서 추정한 16h** 예상이었으나 실제로 T1.6 이 이미 tenantId/RLS/composite unique 를 5/5 모델에 적용해 둠 → 본 작업의 실질은 "schema 파일 위치 분리" 만 — 위험한 backfill/RLS 신설은 이미 완료된 상태. 가이드 outdated 인식 후 **~8h 재산정 → 실제 ~3h 완료** (사용자에게 명시 보고).

## 대화 다이제스트

### 토픽 1: /kdynext 7차원 진단

> **사용자**: "/kdynext"

7차원 건강 스캔 (D1 구조 / D2 코드품질 / D3 문서화 / D4 의존성 / D5 정리 / D6 테스트 / D7 자산 신선도) 실행. 빠른 직접 점검으로 축약 (next-dev-prompt 가 매우 명확한 P0 first action 을 이미 제시한 상태):
- **D1~D5 모두 A 등급**: packages/ 골격 정착, TODO 8건 모두 ADR 추적 future work, Windows 측 standalone leftover 정리 완료
- **D6 테스트**: 846 PASS / `skipIf(!fx.hasDb)` = PR 게이트 #4 정합
- **D7 자산 신선도**: B+ (handover 110개 누적 — 정상 운영)
- **건강 등급 = A** (위생 결함 사실상 0)

**진짜 차이를 만드는 작업**: next-dev-prompt 의 P0 = `/ypserver` 운영 적용 + PLUGIN-MIG-4 묶음.

### 토픽 2: S100 방향 선택

> **사용자**: 분기 질문 → "/ypserver → PLUGIN-MIG-4 자율" 선택

자율 진입 메모리 (`feedback_autonomy.md`) 와 메모리 `feedback_pm2_servers_no_stop` (재배포는 명시적 종료 없이 OK) 고려. 본 작업 흐름 결정:
1. /ypserver (5분, P0 first) — PLUGIN-MIG-3 cutover production 적용
2. PLUGIN-MIG-4 6 step 본격 진입

**결론**: 사용자 결정 즉시 자율 진입. TaskCreate 6 등록.

### 토픽 3: /ypserver 운영 적용 (PLUGIN-MIG-3 라이브 검증)

> **자율 진행 — PLUGIN-MIG-3 dev :3100 smoke 만으로 production 라이브 검증 안 되어 있음**

Phase 1 사전 점검:
- PM2 list = ypserver online (pid 1346133, 5일 uptime, ↺=25)
- schema.prisma diff = 0 → `--migrate` 불필요
- src diff = dev에 `src/app/admin` + `src/app/api/.well-known` 추가분 (정상)
- generated/prisma 다수 차이 = Prisma generate 재생성 시 자연 발생

Phase 2: `scripts/wsl-build-deploy.sh` 백그라운드 실행 (~10분).
- better-sqlite3 source 재빌드 실패 → prebuilt 폴백 (정상 패턴, install-native-linux.sh L1 자가치유 작동)
- Drizzle 4 migration up-to-date
- Schema 검증 통과
- PM2 restart 26회차 → pid 1396667

Phase 3: 헬스체크 3회 HTTP 307 (인증 redirect = 정상), 에러 0건.

**결론**: PLUGIN-MIG-3 manifest dispatcher cutover 가 production 라이브 트래픽으로 검증 완료.

### 토픽 4: PLUGIN-MIG-4 가이드 outdated 발견

> **next-dev-prompt 의 PLUGIN-MIG-4 가이드 = T1.6 적용 전 시점 추정값**

Step A 정찰 중 `packages/tenant-almanac/prisma/fragment.prisma` 이미 존재 (PLUGIN-MIG-1 placeholder) + `20260427140000_t1_6_aggregator_with_tenant` 마이그레이션 발견 → 5 Content* 모델 모두에 (a) tenantId 첫 컬럼 + DEFAULT `current_setting('app.tenant_id')` (b) composite unique (tenantId, slug) (c) RLS ENABLE + FORCE + tenant_isolation 정책 **전부 이미 적용**. fragment.prisma 헤더는 "ALTER TABLE ADD COLUMN tenant_id (default 'almanac')" 미적용 가정 — 실제 schema.prisma 본체에서 5 모델 모두 적용 완료.

**재산정 매트릭스 (~16h → ~8h)**:
| 항목 | 가이드 가정 | 실제 상태 |
|---|---|---|
| tenantId 첫 컬럼 | 추가 마이그레이션 | ✅ 5/5 적용 |
| Composite unique | 검토 필요 | ✅ 적용 |
| RLS 정책 | 5건 마이그레이션 | ✅ ENABLE+FORCE 적용 |
| FK → tenants | 신설 | ✅ ON DELETE CASCADE |
| app_admin GRANT | 검증 필요 | ✅ S88에서 적용 |

**진짜 남은 작업**: (1) Prisma multi-file schema 인프라 + assemble-schema.mjs (2) 5 모델 schema.prisma → fragment.prisma 이동 (3) support libs 8 파일 packages 이전 (4) tests/almanac/ 신설 (5) 라이브 검증 + commit.

> **사용자**: "전체 진행 (~8h)"

자율 진입.

### 토픽 5: Step A — Prisma 7 multi-file schema 인프라

context7 로 Prisma 공식 문서 조회:
- `prismaSchemaFolder` preview feature GA v6.7.0+
- `prisma.config.ts` 의 `schema: "directory"` 또는 `--schema` CLI
- 모든 `.prisma` 파일 자동 머지, cross-file 모델 참조 가능

기존 발견:
- `prisma.config.ts` 이미 존재 (`schema: "prisma/schema.prisma"` 단일 파일 모드)
- `packages/core/prisma/` 없음 → base schema = `prisma/schema.prisma`
- `manifest.ts` 의 `prismaFragment: "./prisma/fragment.prisma"` 이미 등록 (Step D 사실상 완료)

설계 결정:
- `prisma.config.ts` 의 schema 를 `"prisma"` (디렉토리) 로 전환
- `scripts/assemble-schema.mjs` 신설 — `packages/tenant-*/prisma/fragment.prisma` → `prisma/<tenant-id>.prisma` 복사 (single source of truth + .gitignore 빌드 산출물)
- `.gitignore` 에 `prisma/*.prisma` 추가 (`prisma/schema.prisma` 화이트리스트)
- `package.json` 에 `prisma:assemble` + `prebuild` hook 추가

**.ts vs .mjs 의사결정**: tsx devDependency 회피 위해 `.mjs` (ESM Node) 채택. 첫 작성 시 한국어 주석 포함 → Node 24 Windows console 인코딩 충돌로 syntax error (`Unexpected identifier '들을'`). 파일 인코딩은 UTF-8 정상이었으나 Node ESM loader 가 한국어 식별자로 오인. **ASCII-only 로 재작성** → 통과.

`npm run prisma:assemble` → `prisma/almanac.prisma` 1427 bytes 생성 (placeholder fragment 사본). `npx prisma validate` → "The schemas at prisma are valid" (복수형 "schemas" = multi-file 인식 확인).

**결론**: Step A 인프라 완료. fragment 가 placeholder 상태이므로 schema.prisma 본체 무영향.

### 토픽 6: Step B — 5 모델 + 3 enum 이전

- 라인 580~796 (5 model + 3 enum + 헤더) = 217줄 추출
- `packages/tenant-almanac/prisma/fragment.prisma` 갱신 (placeholder → 본체)
- `sed -i '580,796d' prisma/schema.prisma` 로 동일 영역 제거
- schema.prisma 1108 → 891 줄 (-217)
- 절단 지점: LogDrainKind enum `}` → SecretItem 주석 (깔끔)

검증:
- `npm run prisma:assemble` → `prisma/almanac.prisma` 11,949 bytes
- `npx prisma validate` → 통과 (cross-file 모델 참조 검증 = Tenant.contentCategories[] backref 가 schema.prisma 에 있고 ContentCategory 모델 자체가 almanac.prisma 에 있어도 머지)
- `npx prisma generate` → 198ms 통과
- `npx tsc --noEmit` → 0 에러
- `npm run test` → 846 PASS / 94 skip (S99 후속과 동일, 회귀 0)

**결론**: Tenant ↔ ContentCategory cross-file 관계가 Prisma 7 multi-file 자동 머지로 깔끔 작동.

### 토픽 7: Step C — support libs 8 파일 packages 이전

runner.ts 가 dead code 인지 확인 — `tests/aggregator/runner.test.ts` 에서 17개 시나리오 사용 중. PLUGIN-MIG-5 후 cron path 미사용이지만 단위 테스트 백업. **runner.ts 잔존 결정**.

`git mv` 8개:
- `src/lib/aggregator/{classify,cleanup,dedupe,fetchers/,llm,promote,types}.ts` → `packages/tenant-almanac/src/lib/`
- runner.ts 만 `src/lib/aggregator/` 잔존

Import 갱신 매핑: `@/lib/aggregator/X` → `@yangpyeon/tenant-almanac/lib/X`
- sed `-E` alternation 으로 일괄 처리 (`(types|classify|cleanup|dedupe|fetchers|llm|promote)` 7 토큰)
- 갱신 16건: packages/tenant-almanac/manifest.ts + handlers 6 + fetcher-pipeline.ts + src/lib/aggregator/runner.ts + scripts/b8-dedupe-diagnose.ts + tests/aggregator/ 7
- runner.ts 의 `from "./types"` → `from "@yangpyeon/tenant-almanac/lib/types"` (sed 패턴 따로)

검증:
- `npx tsc --noEmit` → 0 에러 (scripts/b8-dedupe-diagnose.ts 누락 1건 발견 후 추가 갱신)
- `npm run test` → 846 PASS / 94 skip (회귀 0)

**결론**: 8 파일 이동 + 14+ import 갱신 + git rename 보존 + 회귀 0.

### 토픽 8: Step E — tests/almanac/ 3 파일 신설

`tests/messenger/_fixtures.ts` 패턴 학습 (admin pool BYPASSRLS seed + runtime pool app_test_runtime 검증). Fork:
- `tests/almanac/_fixtures.ts` (261줄): TENANTS.a/b 별도 UUID (aaaa.../bbbb...) — messenger 와 격리. bootstrapTenants/resetAlmanacData (FK 역방향 metrics→items→ingested→sources→categories). createCategory/Source/Item 3 헬퍼.
- `tests/almanac/rls-isolation.test.ts` (5 testcase): 5 모델 cross-tenant 격리 — tenant a seed → tenant b 0 rows
- `tests/almanac/composite-unique.test.ts` (3 testcase): (tenantId, slug) cross-tenant 비충돌 + same-tenant 충돌

**`prismaWithTenant` 함수 호출 오류 발견 → sed 일괄 수정**: 처음 `prismaWithTenant()` 로 작성했으나 실제로는 Proxy 인스턴스 (함수 X). messenger 패턴 = `prismaWithTenant.contentCategory.findMany(...)`. sed 로 일괄 수정.

dev 검증:
- tsc 0
- vitest dev (HAS_DB=false): 846 PASS / **102 skip** (+8 almanac skipIf, 9 test files skipped — 정상)

**결론**: 코드 단위 통과. 라이브 실행은 Step F.

### 토픽 9: Step F — 라이브 RLS 테스트 (PR 게이트 #4)

`bash scripts/run-integration-tests.sh tests/almanac/` 첫 시도 (WSL bash 직접) — **rolldown native binding 에러**: `/mnt/e/` node_modules 가 Windows 바이너리, WSL Linux Node 가 import 못함. 동일 패턴이 NFT cross-platform 함정과 같음.

PowerShell 직접 두 번째 시도:
- 8 tests 모두 skip (HAS_DB 가드 OK)
- **2 test files = failed**: beforeAll 의 `bootstrapTenants()` 가 `ECONNREFUSED 127.0.0.1:5432`
- 원인: WSL postgres 가 `127.0.0.1:5432` only listen → Windows 에서 접근 불가

세 번째 시도 — WSL native env (`~/dev/ypserver-build/`):
1. `rsync -a --delete` 로 변경분을 ypserver-build 에 동기화 (node_modules/.next/.git 등 exclude)
2. `.env.test.local` cp
3. `wsl -- bash -lc 'source ~/.nvm/nvm.sh && cd ~/dev/ypserver-build && bash scripts/run-integration-tests.sh tests/almanac/'`
4. **8/8 tests passed** in 852ms (rls-isolation 5 + composite-unique 3)

**결론**: PR 게이트 #4 라이브 통과. T1.6 RLS 정책이 production-equivalent 환경에서 정확히 작동 증명.

### 토픽 10: commit + push

git status:
- 36 staged files (M 14 + R 10 + A 12)
- untracked 1: `docs/handover/260516-session100-wave-completion-eval-delta.md` (다른 터미널 작업, kdywavecompletion 보고서) — 본 commit 에서 제외 (`feedback_concurrent_terminal_overlap` 정합)

명시적 git add 로 본 PLUGIN-MIG-4 파일만 staging. commit message = PR 게이트 5항목 모두 명시.
- commit `67091d4 feat(plugin-mig-4): Almanac 5 모델 fragment 분리 + support libs 이전 + 라이브 RLS 테스트`
- push `175d3e7..67091d4 spec/aggregator-fixes` 성공

**결론**: PLUGIN-MIG-4 완전 종료. ADR-022 7원칙 #2/#4 가 schema 레이어까지 코드 사실화.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | /ypserver → PLUGIN-MIG-4 자율 | 운영만 / 전체 자율 / carry-over 먼저 / 스캔만 | 사용자 명시 |
| 2 | Prisma multi-file schema 채택 | (a) assemble concat (b) multi-file directory | context7 = v6.7.0+ GA 확인 → cross-file 모델 참조 자연 동작 |
| 3 | .ts → .mjs (assemble-schema) | tsx devDep / .mjs ESM Node | tsx 미설치 + ASCII-only 로 인코딩 함정 회피 |
| 4 | runner.ts 잔존 | 삭제 / 이동 / 잔존 | runner.test.ts 17 시나리오 사용 중, legacy compat 보존 |
| 5 | 라이브 test WSL native env | WSL bash 직접 / PowerShell 직접 / WSL ypserver-build | rolldown native binding 함정 + WSL postgres localhost-only listen → ypserver-build 가 유일하게 Linux node + Linux node_modules + localhost postgres 모두 만족 |
| 6 | wave eval delta handover 분리 | 본 commit 포함 / 분리 | 다른 터미널 작업 → 영역 분리 (`feedback_concurrent_terminal_overlap`) |

## 수정 파일 (36개)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `prisma.config.ts` | schema: "prisma/schema.prisma" → "prisma" (multi-file 모드) |
| 2 | `scripts/assemble-schema.mjs` | 신규 — fragment 머지 스크립트 |
| 3 | `package.json` | prisma:assemble + prebuild hook |
| 4 | `.gitignore` | /prisma/*.prisma + !/prisma/schema.prisma |
| 5 | `prisma/schema.prisma` | 5 model + 3 enum 제거 (-217줄, 1108→891) |
| 6 | `packages/tenant-almanac/prisma/fragment.prisma` | placeholder → 5 model + 3 enum 본체 (+205줄) |
| 7~13 | `packages/tenant-almanac/src/handlers/*.ts` (6) + `manifest.ts` | import @/lib/aggregator → @yangpyeon/tenant-almanac/lib |
| 14 | `packages/tenant-almanac/src/lib/fetcher-pipeline.ts` | 동일 import 갱신 |
| 15~24 | `packages/tenant-almanac/src/lib/{classify,cleanup,dedupe,llm,promote,types,fetchers/{api,html,index,rss}}.ts` | git rename 8 (디렉토리 1 포함) |
| 25 | `src/lib/aggregator/runner.ts` | ./types → @yangpyeon/tenant-almanac/lib/types |
| 26 | `scripts/b8-dedupe-diagnose.ts` | import 갱신 |
| 27~33 | `tests/aggregator/*.test.ts` (7) | import + vi.mock boundary 갱신 |
| 34 | `tests/almanac/_fixtures.ts` | 신규 261줄 — admin/runtime pool fixture |
| 35 | `tests/almanac/rls-isolation.test.ts` | 신규 203줄 — 5 모델 cross-tenant |
| 36 | `tests/almanac/composite-unique.test.ts` | 신규 95줄 — (tenantId, slug) |

## 상세 변경 사항

### 1. Multi-file Prisma schema 인프라

- **prisma.config.ts**: Prisma 7 GA v6.7.0+ multi-file schema 활성화. `schema: "prisma"` 디렉토리. cross-file 모델 참조 자동 머지.
- **scripts/assemble-schema.mjs (60줄)**: `packages/tenant-*/prisma/fragment.prisma` 발견 → `prisma/<tenant-id>.prisma` 로 복사 + 헤더 추가. Single source of truth = packages, build artifact = prisma/ (gitignored).
- **package.json prebuild hook**: `next build` 전에 자동 assemble 호출 → production 빌드 시 자동 머지.
- **.gitignore**: `/prisma/*.prisma` ignore + `!/prisma/schema.prisma` 화이트리스트.

### 2. 5 Content* 모델 + 3 enum 분리

- schema.prisma 580~796 (217줄) → fragment.prisma. T1.6 마이그레이션이 이미 모든 정책 적용 완료 — 본 작업은 파일 위치만 분리.
- `prisma validate` 통과 = Tenant.contentCategories[] 같은 cross-file backref 가 multi-file 자동 머지로 정상 작동.

### 3. support libs 8 파일 packages 이전

- 8 파일 `git mv` 로 rename history 보존 — fetchers/ 디렉토리 1 + classify/cleanup/dedupe/llm/promote/types 6 = 7 (fetchers 안 4 + 6 = 10 rename git 결과).
- 16 import 갱신: `@/lib/aggregator/X` → `@yangpyeon/tenant-almanac/lib/X` (alias 통한 명확한 plugin boundary).
- runner.ts (97줄) 만 잔존 — `tests/aggregator/runner.test.ts` 17 시나리오 사용 중.

### 4. tests/almanac/ 라이브 RLS 검증

- _fixtures.ts: messenger 패턴 fork. TENANTS 별도 UUID (aaaa.../bbbb...), admin pool (postgres BYPASSRLS) seed + runtime pool (app_test_runtime non-BYPASSRLS) 검증.
- rls-isolation.test.ts (5 testcase): ContentCategory/Source/IngestedItem/Item/Metric 각각 tenant a seed → tenant b 0 rows.
- composite-unique.test.ts (3 testcase): Category/Source (tenantId, slug) cross-tenant 비충돌 + Category same-tenant 충돌 (UniqueConstraintViolation).

## 검증 결과

- `npx prisma validate` — 통과 (multi-file)
- `npx prisma generate` — 198ms, Client v7.7.0 OK
- `npx tsc --noEmit` — 0 에러
- `npm run test` (dev, HAS_DB=false) — **846 PASS / 102 skip** (S99 후속 846/94 + 8 신규 skipIf)
- `bash scripts/run-integration-tests.sh tests/almanac/` (WSL native) — **8/8 PASS** in 852ms (rls-isolation 5 + composite-unique 3)
- `/ypserver` 운영 적용 — PM2 ypserver restart 26회차, HTTP 307, 에러 0건

## 터치하지 않은 영역

- PLUGIN-MIG-3 의 308 alias 제거 (`/api/v1/almanac/[...path]/route.ts` 44줄) — Almanac v1.1 frontend cutover 후 별도 sub-chunk
- FILE-UPLOAD-MIG sweep (filebox file-upload-zone → attachment-upload utility 통합)
- 사용자 carry-over: S88-USER-VERIFY (휴대폰 stylelucky4u.com/notes 재검증) + S86-SEC-1 (GitHub repo public/private 확인)
- 운영자 carry-over: S87-RSS-ACTIVATE (anthropic-news active=true) + S87-TZ-MONITOR (24h+ TimeZone=UTC 모니터링) + CRON-MA-ENABLE (messenger-attachments-deref enabled=true)
- sweep 3건: STYLE-3 (sticky-note-card.tsx:114 endDrag stale closure) / DEBOUNCE-1 (M5 검색 300ms debounce) / NEW-BLOCK-UI (대화 화면 hover → 차단 진입 메뉴)
- 다른 터미널 untracked `docs/handover/260516-session100-wave-completion-eval-delta.md` (kdywavecompletion 평가 보고서, 영역 분리)

## 알려진 이슈

1. **WSL postgres 가 127.0.0.1:5432 only listen** → Windows PowerShell 에서 직접 접근 불가. 라이브 통합 테스트는 반드시 WSL native env (`~/dev/ypserver-build/`) 에서 실행. 본 세션에서 rsync + WSL bash 절차 정착.
2. **rolldown native binding cross-platform 함정** = Windows /mnt/e/ 의 node_modules 는 WSL Linux node 가 import 못함. NFT 함정과 동일 패턴. 회피 = WSL native node_modules 사용.
3. **assemble-schema.mjs 한국어 주석 함정** = Node 24 Windows console 인코딩이 한국어 식별자로 오인. **ASCII-only 작성 권장** — 이미 본 스크립트에서 적용. 단, 다른 .mjs/.ts 스크립트 작성 시 동일 함정 가능.

## 다음 작업 제안

### P0 (코드)
- **PLUGIN-MIG-3 308 alias 제거** (~5분) — Almanac v1.1 frontend cutover 결정 시.
- **FILE-UPLOAD-MIG sweep** (~30분) — filebox file-upload-zone → attachment-upload utility 통합 (결합 0 유지).

### P0 (사용자)
- **S88-USER-VERIFY** (1분) — 휴대폰 stylelucky4u.com/notes 재검증
- **S86-SEC-1** (30초) — GitHub repo public/private 확인

### P2 (운영자)
- S87-RSS-ACTIVATE (anthropic-news 결정)
- S87-TZ-MONITOR (24h 자연 관찰)
- CRON-MA-ENABLE (30일 도달 시)

### P3 (sweep)
- STYLE-3, DEBOUNCE-1, NEW-BLOCK-UI

### S101+ 권장 흐름

PLUGIN-MIG-1~5 모두 완료 — Almanac plugin 격리가 schema/handler/route/cron 4 레이어 모두 현실화. **다음 큰 결정**:
- **2번째 컨슈머 등록** (예: jobboard) — 본 ADR-022 7원칙 #4 ("코드 수정 0줄") 가 실제 적용되는지 검증 기회. `packages/tenant-jobboard/` 생성만으로 router/cron/schema 자동 통합 가능 여부.
- 또는 **Almanac v1.1 frontend** 작업 (308 alias 제거 + UI/UX 보강)
- 또는 **M4 Phase 2 messenger UI 진행** (다른 큰 단위 사이드 트랙)

### wave 평가 시점
- `kdywavecompletion --compare session-97` — PLUGIN-MIG-3+4 완료 후. Track C(인프라) 보강 + plugin 격리 정량화 + ADR-022 7원칙 #2/#4 schema 레이어 현실화 평가. (별도 터미널이 본 세션 동시에 `260516-session100-wave-completion-eval-delta.md` 작성 중인 것으로 추정 — 그 보고서를 베이스라인으로.)

---

## 관련 문서

- 이전 세션: [session 99 후속](./260510-session99-postscript-plugin-mig-3-abc.md), [session 99 정찰](./260510-session99-plugin-mig-3-recon.md), [session 98 후속](./260510-session98-postscript-plugin-mig-2-5.md)
- compound knowledge: [2026-05-16 Prisma multi-file schema + tenant fragment 패턴](../solutions/2026-05-16-prisma-multi-file-schema-tenant-fragment.md)
- wave 트래커: [04-architecture-wave/wave-tracker.md](../research/baas-foundation/04-architecture-wave/wave-tracker.md) (S100 row 미갱신 — wave eval delta 보고서가 그 역할)

[← handover/_index.md](./_index.md)
