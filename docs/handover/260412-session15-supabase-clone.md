# 인수인계서 — 세션 15 (Supabase 관리 체계 이식)

> 작성일: 2026-04-12
> 이전 세션: [session14](./260412-session14-phase13d-complete.md)
> 계획 파일: `C:\Users\smart\.claude\plans\indexed-knitting-reef.md`
> 결정 ADR: [ADR-002](../research/decisions/ADR-002-supabase-adaptation-strategy.md)

---

## 작업 요약

Supabase 대시보드 13개 페이지 스크랩을 출발점으로 프로젝트 관리 체계를 이식. Phase A(리서치+문서화 23건) → Phase B(Prisma +7 모델, 11 P0 모듈 스캐폴드, 55 신규 소스 파일) 완료. `npx tsc --noEmit` 0 에러, Prisma 스키마 유효. 마이그레이션 실적용은 사용자 수동 승인 후.

## 대화 다이제스트

### 토픽 1: 요청 접수 — Supabase 스크랩
> **사용자**: "다음이 supabase의 각 페이지를 드래그로 텍스트를 긁은 거야... 목적은 supabase의 프로젝트별 관리 체계를 모방해서 이 프로젝트에 반영하려고.... 내용을 보고 기술을 추론해서 그 기술에 대해서 1차적으로 깃헙 등에서 코드를 가져오고, 2차적으로 코드 관련 웹 사이트에서 가져오고. 3차적으로 자체 구현에 대한 방식으로 기술 목표 달성도를 높여줘.... 그리고 위에 내가 긁은 내용들을 이 프로젝트의 자료 저장체계에 맞춰서 저장하고 연결시켜놔줘."

스크랩 분량: 13개 페이지 원본 텍스트 (Projects, Overview, Table Editor, SQL Editor, Database, Authentication, Storage, Edge Functions, Realtime, Advisors, Observability, Logs & Analytics, Integrations, Settings×9).

**결론**: Plan Mode 진입 → Explore 2개 병렬로 현황 스캔 → Option 3개 설계 → AskUserQuestion으로 범위 확정.

### 토픽 2: 범위 확정 — AskUserQuestion
> **사용자 답변**: "리서치+모든 미구현 모듈 병렬 구현" + user notes: "1번을 진행하고 완료되면, 별도 요청없이 [3번으로] 진행" / 저장 위치: `docs/references/supabase-scrape/` (Recommended)

**결론**: Phase A(리서치) 후 Phase B(구현) 자동 연속 실행. 원본은 references 산하.

### 토픽 3: 아키텍처 결정 — Option A vs B vs C
세 안을 검토:
- **A**. Supabase 전체 self-host: ✅ 100% 호환, ❌ 6 컨테이너·RAM 2GB↑·기존 자체 구현과 중복.
- **B**. UI 학습 + Next.js 네이티브 재구현: ✅ 단일 프로세스 유지, ✅ 기존 Prisma/파일박스/세션 활용, ❌ Supabase 업데이트 추적 불가(의도된 trade-off).
- **C**. PostgREST만 사이드카: ❌ 3 모델 규모에 Haskell 바이너리 과도, ❌ RLS 재설계.

**결론**: **Option B 채택**. 신규 의존성 최소화, Cloudflare Tunnel 엔드포인트 유지. ADR-002에 기록.

### 토픽 4: Phase A 병렬 리서치 — 5 스파이크
Explore+Plan 에이전트 5개 + 프로젝트 패턴 Explore 1개를 병렬 백그라운드 실행:
1. **SQL Editor**: monaco + `pg` 읽기전용 풀 + `app_readonly` 롤. Prisma `$queryRawUnsafe` 금지 확인.
2. **Schema Visualizer**: `@xyflow/react` + Prisma DMMF + information_schema. `keonik/prisma-erd-generator` 파서 재사용.
3. **Advisors**: `supabase/splinter` 규칙 TS 포팅. TOP 5 규칙 + `pg_stat_statements` 선결 확인.
4. **Edge Functions**: **vm2 금지(DEPRECATED + 탈출 PoC)**. v1 = `node:vm` + `worker_threads` + safeFetch 화이트리스트. v2 = `isolated-vm`. v3 = Vercel Sandbox.
5. **Data API**: PostgREST 사이드카 거부. Prisma DMMF + 동적 `[table]` 라우트 + operator parser 9종.
6. **프로젝트 패턴**: 기존 `withAuth`/`withRole`/`successResponse`/`errorResponse`/SSE/audit-log 패턴과 최신 `package.json`(Next 16.2.2 + React 19 + Prisma 7 adapter-pg + cmdk + lucide-react) 확인.

**결론**: 5 스파이크 문서 `docs/research/spikes/spike-005-*.md` 저장. ADR-002 근거로 편입.

### 토픽 5: Phase A 문서화 (23건)
메인 스레드에서 직접 작성:
- 스크랩 14 md (frontmatter + 원문 보존 + UI 목록 + 추론 기술 스택)
- `_SUPABASE_TECH_MAP.md` (13 모듈 → OSS 매핑 표 + 각 항목 1차 GitHub / 2차 docs / 3차 자체구현)
- `_PROJECT_VS_SUPABASE_GAP.md` (50+ 기능 매트릭스 + P0/P1/P2 + DAG 계층)
- `ADR-002-supabase-adaptation-strategy.md`
- 색인/트리 갱신: `_index.md`, `_SPIKE_CLEARANCE.md`, `CLAUDE.md`, `MASTER-DEV-PLAN.md`

**결론**: Phase A 완료. Phase B 즉시 진입(사용자 notes에 따라 자동 연속).

### 토픽 6: Phase B-L0 계약 레이어
- `prisma/schema.prisma`에 **7 모델 + 7 enum** 추가. User에 3 역방향 관계 추가.
- `src/lib/types/supabase-clone.ts` — Advisor/DataAPI/SqlRun/EdgeFunction/Realtime/Cron/Webhook/ApiKey/LogDrain/Schema 공용 타입 10+종
- `src/components/layout/sidebar.tsx` — 기존 메뉴를 **5 그룹**(운영/콘텐츠/데이터베이스/개발 도구/감사·설정)으로 재편 + 11 신규 메뉴 + **2단계 RBAC 필터**(`ADMIN_ONLY_PATHS` + `MANAGER_PLUS_PATHS`)

**결론**: 단일 파일(schema.prisma, sidebar.tsx)의 선결 확정이 L2 병렬화의 열쇠. 머지 충돌 0 확보.

### 토픽 7: Phase B-L1 공용 라이브러리
- `src/lib/pg/pool.ts`: `getPgPool()` 싱글턴(globalThis), `runReadonly<T extends QueryResultRow>()` — `BEGIN READ ONLY` + `SET LOCAL statement_timeout` + `SET LOCAL ROLE app_readonly` (롤 없는 환경은 fallthrough).
- `src/lib/pg/introspect.ts`: `buildSchemaGraph`, `listColumns`/`listPrimaryKeys`/`listForeignKeys`/`listIndexedColumns` — information_schema + pg_catalog 조회.
- `src/lib/runner/isolated.ts`: `runIsolatedFunction(code, ctx)` — `node:vm` + `codeGeneration: {strings:false, wasm:false}` + `timeout` + 코드 256KB 한계 + 화이트리스트 fetch (Private IP 차단).

**결론**: Schema Visualizer/Data API/Advisors가 introspect 공유. Edge Functions/Cron이 isolated runner 공유.

### 토픽 8: Phase B-L2 3 클러스터 병렬 구현 (55 파일)
에이전트 3개를 백그라운드 병렬 실행. 각자 독립 파일 트리만 수정.

- **Cluster A (13 파일)**: SQL Editor(`/sql-editor`, danger-check + execute API + queries CRUD), Data API(`/data-api`, allowlist + query-parser + handler + `[table]`/`[id]` 동적 라우트), Schema Visualizer(`/database/schema`, API + 카드 그리드 UI — xyflow는 TODO).
- **Cluster B (14 파일)**: Edge Functions(`/functions`, CRUD + run + runs, 템플릿 3종, ADMIN), Cron(`/database/cron`, registry + runner + SQL/FUNCTION/WEBHOOK 디스패치), Realtime(`/realtime`, EventEmitter bus + SSE 구독 + broadcast).
- **Cluster C (28 파일)**: Advisors(5 규칙 파일 + runner + Sec/Perf 페이지), Webhooks(sourceTable allowlist 6종, HTTPS only + Private IP 차단 + 5s timeout + secret header), API Keys(`sb_publishable_`/`sb_secret_` prefix + bcrypt hash + 평문 1회 노출), Backups(pg_dump spawn + gzip + 2분 timeout + ENABLE_DB_BACKUPS 가드), Log Drains(HTTP/Loki 어댑터).

**결론**: 3 클러스터 모두 성공. 유일한 잔존 에러는 `pg/pool.ts`의 `QueryResultRow` 제약 누락 1건 — 즉시 수정.

### 토픽 9: 타입 에러 수정 + 검증
- `src/lib/pg/pool.ts`: `runReadonly<T extends QueryResultRow>`로 제약 추가 + `QueryResultRow` import.
- `src/lib/advisors/runner.ts`: 컨텍스트의 `query<T>`가 `QueryResultRow` 제약을 피하도록 `rows as T[]` 캐스트.
- `npx tsc --noEmit` → **에러 0**.
- `npx prisma validate` → 유효.
- `prisma migrate diff --from-empty --to-schema` → SQL 드래프트 231줄, 10 테이블+7 enum 확인.

**결론**: 빌드 수준 검증 완료. 런타임 검증(dev server + DB migrate apply)은 사용자 승인 후.

### 토픽 10: 자동 연속 — Phase B 전 구간 완료 후 세션 정리
ADR-002의 "프로덕션 DB 파괴 작업 금지" 가드레일에 따라 `prisma migrate dev` 자동 실행은 보류. 사용자 수동 절차(롤 생성 + migrate dev --create-only + ENABLE_DB_BACKUPS)를 handover·next-dev-prompt에 명시.

**결론**: /cs 세션 종료로 전환.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | Phase A→B 자동 연속 | A만 / 1 MVP / 전 모듈 | 사용자가 명시적으로 "리서치+모든 미구현 병렬 구현" 선택 |
| 2 | Option B(네이티브 재구현) | A: full self-host / B: UI 학습 + 재구현 / C: PostgREST 사이드카 | 단일 Next.js 유지, 기존 인프라 재사용, 신규 의존성 최소 |
| 3 | vm2 금지 | vm2 / node:vm / isolated-vm / Vercel Sandbox | vm2 DEPRECATED + 탈출 PoC. v1은 node:vm+worker_threads로 충분 |
| 4 | Prisma `$queryRawUnsafe` 금지 | Prisma raw / `pg` 직접 | 공식 경고. `pg` + `app_readonly` 롤 + READ ONLY + timeout 다층 |
| 5 | PostgREST 사이드카 미도입 | PostgREST / 자체 구현 | 3 모델 규모에 Haskell 바이너리 운영 비용 과다 |
| 6 | 사이드바 5 그룹 재편 | 평면 / 2 그룹 / 5 그룹 | 11 메뉴 추가로 네비 부담 — 영역 분리가 필수 |
| 7 | migrate apply 보류 | 자동 / 보류 | dev/prod DB 모호 + ADR-002 가드레일 |
| 8 | Vercel 관련 스킬(injected) 전부 스킵 | 사용 / 스킵 | ADR-002에 Vercel 미사용 확정 + WSL2+PM2+Tunnel 자체 호스팅 |

## 수정 파일 (총 ~80개)

### 신규 문서 (23개)
| # | 파일 |
|---|------|
| 1 | `docs/references/supabase-scrape/_index.md` |
| 2-15 | `docs/references/supabase-scrape/{00-organization-projects..13-settings}.md` (14개) |
| 16 | `docs/references/_SUPABASE_TECH_MAP.md` |
| 17 | `docs/references/_PROJECT_VS_SUPABASE_GAP.md` |
| 18 | `docs/research/decisions/ADR-002-supabase-adaptation-strategy.md` |
| 19-23 | `docs/research/spikes/spike-005-{sql-editor,schema-visualizer,advisors,edge-functions,data-api}.md` |

### 신규 소스 (55개)
- `src/lib/types/supabase-clone.ts`
- `src/lib/pg/{pool,introspect}.ts`
- `src/lib/runner/isolated.ts`
- **Cluster A (13)**: `src/app/sql-editor/page.tsx`, `src/app/data-api/page.tsx`, `src/app/database/schema/page.tsx`, `src/app/api/v1/sql/{execute,queries,queries/[id]}/route.ts`, `src/app/api/v1/data/[table]/{route.ts,[id]/route.ts}`, `src/app/api/v1/schema/route.ts`, `src/lib/sql/danger-check.ts`, `src/lib/data-api/{allowlist,query-parser,handler}.ts`
- **Cluster B (14)**: `src/app/functions/page.tsx`, `src/app/database/cron/page.tsx`, `src/app/realtime/page.tsx`, `src/app/api/v1/functions/{route.ts,[id]/route.ts,[id]/run/route.ts,[id]/runs/route.ts}`, `src/app/api/v1/cron/{route.ts,[id]/route.ts,[id]/run/route.ts}`, `src/app/api/v1/realtime/{broadcast,channels}/route.ts`, `src/app/api/sse/realtime/channel/[channel]/route.ts`, `src/lib/functions/templates.ts`, `src/lib/cron/{registry,runner}.ts`, `src/lib/realtime/bus.ts`
- **Cluster C (28)**: `src/app/advisors/{security,performance}/page.tsx`, `src/app/database/webhooks/page.tsx`, `src/app/database/backups/page.tsx`, `src/app/settings/api-keys/page.tsx`, `src/app/settings/log-drains/page.tsx`, `src/app/api/v1/advisors/{security,performance}/route.ts`, `src/app/api/v1/webhooks/{route.ts,[id]/route.ts,[id]/trigger/route.ts}`, `src/app/api/v1/api-keys/{route.ts,[id]/route.ts}`, `src/app/api/v1/backups/{route.ts,[filename]/download/route.ts}`, `src/app/api/v1/log-drains/{route.ts,[id]/route.ts,[id]/test/route.ts}`, `src/lib/advisors/runner.ts` + `rules/security/{fk-missing-index,password-hash-exposed,rls-not-configured}.ts` + `rules/performance/{slow-queries,unused-indexes}.ts`, `src/lib/webhooks/deliver.ts`, `src/lib/auth/{keys,signing}.ts`, `src/lib/backup/pgdump.ts`, `src/lib/drains/{http,loki,index}.ts`

### 수정 (7개)
| # | 파일 | 변경 |
|---|------|------|
| 1 | `prisma/schema.prisma` | +7 모델, +7 enum, User 관계 3개 |
| 2 | `src/components/layout/sidebar.tsx` | 5 그룹 재편 + 11 신규 메뉴 + 2단계 RBAC |
| 3 | `src/lib/pg/pool.ts` | `QueryResultRow` 제약 수정(후속 타입 에러 해결) |
| 4 | `src/lib/advisors/runner.ts` | `QueryResultRow` 우회 캐스트 |
| 5 | `docs/references/_index.md` | 신규 3개 항목 등록 |
| 6 | `docs/research/_SPIKE_CLEARANCE.md` | 스파이크 005×5 등록 |
| 7 | `CLAUDE.md` | 문서 트리 도식 갱신 |
| 8 | `docs/MASTER-DEV-PLAN.md` | 세션 14-S 부록 |
| 9 | `docs/status/current.md` | Phase 14-S 체크박스 + 세션 15 행 |

### 마이그레이션 드래프트 (1개)
- `prisma/migrations-draft/all_tables_from_empty.sql` — 231 줄, 수동 검토 후 적용

## 검증 결과

- `npx tsc --noEmit` → **에러 0**
- `npx prisma validate` → **유효** (Prisma 7.6.0)
- Prisma 업그레이드 가능 안내(7.7.0) — 이번 세션 범위 외
- 빌드(`next build`)와 dev server 런타임 테스트는 **미실행**(migrate 미적용 상태라 DB 의존 코드 실행 불가)

## 터치하지 않은 영역

- `src/app/filebox/*` (세션 7의 v2 구현 그대로)
- `src/app/login`, `src/app/processes`, `src/app/members`, `src/app/audit`, `src/app/metrics`, `src/app/logs`, `src/app/network`, `src/app/settings/{env,ip-whitelist,users}` (모두 기존 동작 유지)
- `src/app/layout.tsx`, `middleware.ts`, `next.config.ts`, `prisma.config.ts`
- 기존 DB 데이터 — 마이그레이션 미적용

## 알려진 이슈

1. **Prisma migrate 미적용** — DB에는 신규 테이블이 없음. `npx prisma migrate dev --create-only --name supabase_clone_session_14`를 사용자가 dev DB에서 실행해야 앱 런타임 정상 동작.
2. **`app_readonly` 롤 미발급** — SQL Editor의 PG 롤 격리가 1차 방어만(READ ONLY 트랜잭션 + statement_timeout) 작동. 완전 방어 위해 `CREATE ROLE app_readonly; GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly; GRANT USAGE ON SCHEMA public TO app_readonly;` 필요.
3. **Backups 기본 비활성** — `ENABLE_DB_BACKUPS=true` 환경변수 미설정 시 API 403 반환. 프로덕션 DB 보호 목적.
4. **UI 고도화 지연** — SQL Editor는 textarea(monaco TODO), Schema Visualizer는 카드 그리드(xyflow TODO). 향후 `npm i @monaco-editor/react @xyflow/react elkjs` 후 교체.
5. **Cron bootstrap**: `/api/v1/cron` 첫 요청 시 `ensureStarted()` 호출 구조. PM2 재시작 직후 첫 cron 트리거까지 지연 가능.

## 다음 작업 제안

### 즉시
1. **Prisma 마이그레이션 적용** (사용자 승인 후):
   ```bash
   npx prisma migrate dev --create-only --name supabase_clone_session_14
   # SQL 검토 후
   npx prisma migrate deploy  # 또는 dev 환경은 migrate dev
   ```
2. **PG 읽기전용 롤 생성**:
   ```sql
   CREATE ROLE app_readonly;
   GRANT USAGE ON SCHEMA public TO app_readonly;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
   ```
3. `next build` + dev server로 11 신규 페이지 도달성 smoke 테스트

### 단기
- monaco/xyflow 도입 후 SQL Editor·Schema Visualizer 고도화 (spike-005-sql-editor/schema-visualizer 참조)
- `pg_stat_statements` 확장 활성화 후 Advisors Performance 슬로우 쿼리 규칙 활성화
- Cron 실제 부트스트랩: `src/lib/cron/registry.ts`의 `ensureStarted()` 호출 진입점 추가 (middleware 또는 별도 워커)
- Data API allowlist 세분화(Folder/File 컬럼 재검토)

### 중기
- P1 모듈 추가: MFA(TOTP), OAuth Providers(Google), GraphQL 엔드포인트, Queues, Vault, Custom Reports Builder
- ypserver 스킬로 배포 + kdycanary로 배포 후 모니터링

---

**관련 문서**:
- 계획: `C:\Users\smart\.claude\plans\indexed-knitting-reef.md`
- ADR: [ADR-002](../research/decisions/ADR-002-supabase-adaptation-strategy.md)
- 스크랩: [supabase-scrape/_index.md](../references/supabase-scrape/_index.md)
- 기술 매핑: [_SUPABASE_TECH_MAP.md](../references/_SUPABASE_TECH_MAP.md)
- 갭 분석: [_PROJECT_VS_SUPABASE_GAP.md](../references/_PROJECT_VS_SUPABASE_GAP.md)
- 스파이크: [spike-005-*.md](../research/spikes/)

[← handover/_index.md](./_index.md)
