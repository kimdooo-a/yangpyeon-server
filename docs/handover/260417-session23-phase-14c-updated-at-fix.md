# 인수인계서 — 세션 23 (Phase 14c 1순위 — @updatedAt DB DEFAULT 근본 수정)

> 작성일: 2026-04-17
> 이전 세션: [session22](./260417-session22-phase-14b-e2e-updatedat-bug.md)
> 세션 저널: [journal-2026-04-17.md](../logs/journal-2026-04-17.md)
> 관련 spec: [phase-14c-updated-at-default-design](../superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md)
> 관련 plan: [phase-14c-updated-at-default-plan](../superpowers/plans/2026-04-17-phase-14c-updated-at-default-plan.md)
> 신규 Compound Knowledge:
> - [prisma-migration-windows-wsl-gap](../solutions/2026-04-17-prisma-migration-windows-wsl-gap.md)
> - [curl-e2e-recipe-dashboard](../solutions/2026-04-17-curl-e2e-recipe-dashboard.md)

---

## 작업 요약

세션 22에서 발견한 `@updatedAt` DB DEFAULT 부재 버그를 Phase 14c 1순위로 근본 수정. `/kdyguide --start` → `brainstorming`(D1 Option A, D2 A2 scope, D3 B2 backfill, D4 single migration, D5 전 매트릭스) → `writing-plans`(13 Task 분해) → `subagent-driven-development`로 실행. 결과: 9개 모델(5 병기 + 4 신규 필드) 변경 + B2 백필 마이그레이션 프로덕션 적용, E2E 전 매트릭스 통과(S8a `updated_at` 생략 payload 200 확인 — 실사용자 UI keep 경로 회복).

## 대화 다이제스트

### 토픽 1: `/kdyguide --start` — Phase 14c 진입
> **사용자**: 세션 22가 Phase 14c 1순위(@updatedAt fix)를 식별했으니 `/kdyguide --start` → brainstorming → writing-plans → executing-plans 체인 실행.

Claude는 컨텍스트 스캔 후 brainstorming 스킬을 1순위로 추천. 주목할 발견: handover와 solutions 문서가 언급한 "9개 모델"이 실제 `grep @updatedAt prisma/schema.prisma` 결과(5개)와 불일치.

**결론**: brainstorming으로 진입. 모델 수 불일치는 D2 결정 시 명시적 확인 포인트.

### 토픽 2: Brainstorming D1-D5 합의
> **사용자**: A2 / B2 / Approach 3 연속 선택.

- **D1 Option A** (schema `@default(now())` 병기) 채택. Option B(API 자동 주입), Option C(UI 자동 주입)는 ORM/DB 진실 소스 불일치를 레이어에서 덮는 구조라 기각.
- **D2 A2 — 9개 모델 = 5 기존 + 4 신규 필드**. 실측 후 해명: `@updatedAt`을 이미 가진 5개(User/Folder/SqlQuery/EdgeFunction/CronJob) + `updated_at`이 없던 4개(File/Webhook/ApiKey/LogDrain)에 신규 필드 추가. `EdgeFunctionRun`은 log-append 성격이라 제외.
- **D3 B2 백필**. 기존 행의 `updated_at`을 `created_at` 값으로 정렬 → 이력 의미 보존. `ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP`의 fast default 효과(B1)를 명시적 UPDATE로 덮음.
- **D4 단일 마이그레이션**. 비파괴 변경이라 스플릿 이점 < 배포 부담.
- **D5 Approach 3 — 전 E2E 매트릭스 + UI keep 흉내 1회차**. 세션 22 교훈(curl payload가 UI 기본값을 흉내내지 않으면 실사용자 경로 미검증) 내재화.

**결론**: spec 작성 → `docs/superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md` (commit `76bf310`).

### 토픽 3: Writing-plans — 13 Task 분해 + self-review 수정
> **사용자**: ok (spec 승인).

13개 Task로 분해: (1) schema.prisma 9개 변경, (2) 마이그레이션 생성+백필, (3) /ypserver 사전점검, (4) 배포, (5) psql 검증, (6) 로그인, (7~11) E2E curl 매트릭스, (12) docs 해결 마커, (13) /cs 종료.

Self-review에서 2개 이슈 발견·수정:
- Task 5의 "동일 방식으로" 약어가 skill의 "repeat the code" 규칙 위반 → 9개 테이블 개별 명령 전부 나열.
- Task 6-11이 shell-local 변수 의존 → `/tmp/*.txt` 파일 persist 방식으로 변환.

**결론**: plan 저장 → `docs/superpowers/plans/2026-04-17-phase-14c-updated-at-default-plan.md` (commit `b2e4fa3`).

### 토픽 4: Subagent-Driven Development — 분업 합의
> **사용자**: 1 (Subagent-Driven 선택).

브랜치는 main 직접(현 패턴 유지). 분업 방식:
- **Subagent 위임**: Task 1(schema 편집), Task 2(마이그레이션 생성)까지 계획됐으나 2는 DB 연결 문제로 main session 수행으로 전환, Task 12(docs 해결 마커).
- **Main 세션 직접 실행**: Task 3(글로벌 스킬 읽기), Task 4(/ypserver 또는 수동 배포), Task 5(WSL psql), Task 6-11(WSL curl 세트), Task 13(/cs).

### 토픽 5: Task 1 — Schema 편집 (Subagent haiku)
Haiku 모델 subagent가 9개 편집 일괄 수행. `prisma format` + `prisma validate` + grep count 검증. 5 병기 + 4 신규 + `EdgeFunctionRun` 미변경 + `@db.Timestamp(3)` 미추가 전부 spec 준수.

**결론**: commit `a17b3d8`. Spec reviewer + code quality reviewer 모두 ✅ APPROVED.

### 토픽 6: Task 2 — 환경 gap으로 수작업 마이그레이션 전환
> **발견**: Windows `npx prisma migrate dev --create-only`가 WSL localhost:5432 연결 실패(P1001).

WSL2 NAT로 Windows에서 WSL 로컬 Postgres에 닿지 못함. 우회: 타임스탬프 형식(`20260417140000`) 직접 지정 + `migration.sql` 수작업 작성(Prisma 자동 생성 결과와 동등 DDL + B2 UPDATE 4줄). Prisma `migrate deploy`는 디렉토리 기반이라 수작업 SQL 신뢰 OK.

**결론**: commit `66c1686`. `prisma/migrations/20260417140000_add_updated_at_default/migration.sql` 생성 (9 ALTER + 4 UPDATE = 13 statements).

### 토픽 7: Task 3-5 — /ypserver 점검, 배포, psql 검증
- `/ypserver` SKILL.md 확인: `prisma migrate deploy` 미포함 + `prisma/` 디렉토리 복사 미포함. 스킬 호출 시 Phase 1 Windows build 실패로 조기 abort하는 문제도 기억됨(문서화 된 한계).
- 수동 배포: `wsl -e bash -c "rm -rf ~/dashboard/prisma && cp -r /mnt/e/<project>/prisma ~/dashboard/"` + `npx prisma migrate deploy` in WSL. 새 마이그레이션 1개만 적용됨("4 migrations found, 1 applied") — 이전 3개는 이미 DB에 존재.
- psql 검증 쿼리에서 `DATABASE_URL?schema=public` 쿼리 파라미터 때문에 `invalid URI query parameter` 에러 발생 → `sed 's/?schema=public//'`로 해결. 9개 테이블 전부 `CURRENT_TIMESTAMP` DEFAULT 확인. 4개 신규 컬럼 테이블(files/webhooks/api_keys/log_drains)은 모두 0행이라 B2 백필은 자동 충족.
- pm2 dashboard uptime 2s(WSL 재시작 후 pm2 resurrect 영향). HTTP 307 응답 — 정상 redirect.

**결론**: DB 단독 변경이라 애플리케이션 코드 rebuild 불필요 — `/ypserver` 실행 생략. E2E로 확인.

### 토픽 8: Task 6 — 로그인 플로우, 두 번의 시행착오
1. `jq` 미설치(WSL) → `python3 -c`로 JSON 파싱.
2. `/api/auth/login-v2`가 403 `CSRF_BLOCKED` 반환 → `proxy.ts` L101-116 확인: `/api/v1/*` 외 POST는 Referer/Origin이 `stylelucky4u.com` 또는 `localhost:3000` 포함해야 통과. `-H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE"` 추가.
3. `/api/auth/me` 응답이 `{success, user: {sub, email, role}}` — `data` 래퍼 없고 ID 키는 `sub`. Python 스크립트의 JSON access path 수정.

**결론**: `/tmp/dash-cookie.txt` 쿠키 + `/tmp/owner_id.txt`(=`sub`) persist 성공.

### 토픽 9: Task 7-11 — E2E 전 매트릭스 통과
WSL auto-shutdown이 `wsl -e bash -c` 사이에 `/tmp`를 휘발시키므로 단일 통합 E2E 스크립트(`/mnt/c/.../e2e-full.sh`)로 Tasks 6-11 전체 일괄 실행. `set -e` 생략 — 중간 실패가 있어도 나머지 평가.

결과:
| 시나리오 | HTTP | 결과 |
|---|---|---|
| S8a folders INSERT (updated_at OMITTED) | 200 | ✅ 핵심 — 세션 22 500 버그 수정 증명 |
| S8b folders PATCH | 200 | ✅ |
| S8c folders DELETE | 200 | ✅ `{deleted:true}` |
| S9 audit logs | — | ✅ TABLE_ROW_INSERT/UPDATE/DELETE 3건(14:32:04) 영속 |
| S10 users POST | 403 | ✅ OPERATION_DENIED |
| S11a `folders;DROP TABLE x` | 400 | ✅ INVALID_TABLE |
| S11b edge_function_runs POST | 403 | ✅ "삭제만 가능" |
| S8d webhooks INSERT (updated_at OMITTED) | 200 | ✅ 신규 컬럼 DB DEFAULT 작동 |
| S8e log_drains INSERT (updated_at OMITTED) | 200 | ✅ 신규 컬럼 DB DEFAULT 작동 |

`/api/audit` 경로(v1 아님) 기억: 응답 shape는 `{logs, pagination}`.

**결론**: 모든 DOD 체크박스 통과. RowFormModal "keep" 기본값 실사용자 경로 회복 확인.

### 토픽 10: Task 12 — docs 해결 마커 (Subagent haiku)
Subagent가 `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md`에 "해결 — 세션 23" 섹션(19줄) append + `docs/guides/tables-e2e-manual.md`의 DOD 체크박스 S8 각주 1줄 교체("UI keep 기본값은 500" → 해결 링크).

**결론**: commit `b56f2ee`.

### 토픽 11: `/cs` 세션 종료 + Compound Knowledge 2건
- `prisma-migration-windows-wsl-gap.md` — Windows→WSL NAT 단절 시 수작업 마이그레이션 워크플로우. 향후 schema 변경 시 재사용 가능한 표준 패턴.
- `curl-e2e-recipe-dashboard.md` — CSRF/쿠키/WSL 환경 특수성 정리한 E2E 레시피. 차후 세션의 E2E 디버깅 시 시간 절약.

**결론**: 세션 23 종결 — current.md/logs/handover/next-dev-prompt/journal 일괄 갱신 + git commit + push.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|-----------|
| 1 | 수정 방식 Option A | A(schema 병기) / B(API 자동 주입) / C(UI 자동 주입) | DB가 진실 소스 — ORM/DB 일관성 우선. 레이어에서 덮는 패치 기각 |
| 2 | 스코프 A2 | A1(5개만) / A2(9개 전부) / A3(명시적 연기) | 스키마 일관성 + 장래 낙관적 잠금 대비. EdgeFunctionRun은 log-append로 제외 |
| 3 | 백필 B2 | B1(NOW) / B2(created_at) / B3(nullable 3단계) | 이력 의미 보존 + NOT NULL 유지. 감사 일관성 O |
| 4 | 단일 마이그레이션 | 단일 / 2단계 분리 / 모델별 개별 | 비파괴 변경 — 분리 이점 < 배포 부담 |
| 5 | Approach 3 (전 매트릭스) | 1(최소) / 2(2단계) / 3(전체) | 세션 22 교훈 내재화 + 회귀 zero 보장 |
| 6 | Task 2 수작업 마이그레이션 전환 | --create-only 재시도 / WSL 포워딩 구성 / 수작업 | Windows↔WSL NAT gap — 수작업이 spec 결과 동등 + 가장 빠름 |
| 7 | /ypserver 생략 | /ypserver prod 호출 / 수동 배포 / 배포 skip | 코드 변경 없어 rebuild 불필요 — migrate deploy만으로 충분 |
| 8 | Tasks 6-11 통합 스크립트 | per-task wsl 호출 / 단일 스크립트 | WSL auto-shutdown으로 /tmp 휘발 → 단일 호출 강제 |

## 수정/신규 파일 (8개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/schema.prisma` | 5 모델 `@default(now())` 병기 + 4 모델 `updatedAt` 신규 필드 |
| 2 | `prisma/migrations/20260417140000_add_updated_at_default/migration.sql` | 신규 — 9 ALTER + 4 UPDATE (B2 백필) |
| 3 | `docs/superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md` | 신규 — 디자인 spec |
| 4 | `docs/superpowers/plans/2026-04-17-phase-14c-updated-at-default-plan.md` | 신규 — 13 Task 실행 계획 |
| 5 | `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` | "해결 — 세션 23" 섹션 append |
| 6 | `docs/guides/tables-e2e-manual.md` | S8 DOD 체크박스 각주 — 500 경고 → 해결 링크 |
| 7 | `docs/solutions/2026-04-17-prisma-migration-windows-wsl-gap.md` | 신규 Compound Knowledge |
| 8 | `docs/solutions/2026-04-17-curl-e2e-recipe-dashboard.md` | 신규 Compound Knowledge |

## 커밋 내역

| SHA | 메시지 |
|---|---|
| `76bf310` | docs(14c): Phase 14c 1순위 설계 spec |
| `b2e4fa3` | docs(14c): Phase 14c 1순위 실행 plan — 13 Task |
| `a17b3d8` | feat(db): Phase 14c — @updatedAt 5병기 + 4모델 신규 |
| `66c1686` | feat(db): Phase 14c 마이그레이션 — 9개 모델 updated_at DEFAULT + B2 백필 |
| `b56f2ee` | docs(14c): @updatedAt 버그 해결 마커 — 세션 23 프로덕션 E2E 통과 기록 |
| (세션 종료 시) | docs: 세션 23 /cs — Compound Knowledge 2건 + handover 완료 반영 |

## 검증 결과

- `npx prisma validate` — 스키마 유효 ✅
- `npx prisma migrate deploy` — 1 migration applied ✅
- `psql \d` — 9 테이블 전부 `updated_at DEFAULT CURRENT_TIMESTAMP` ✅
- 백필 검증 — 4 신규 컬럼 테이블 전부 0행 → 자동 충족 ✅
- E2E curl 매트릭스 — S8a~S11b + S8d/S8e 전부 HTTP 200/403/400 PASS ✅
- 감사 로그 — TABLE_ROW_INSERT/UPDATE/DELETE 신규 3건 SQLite 영속 ✅
- PM2 dashboard — online, HTTP 307 응답 정상 ✅

## 터치하지 않은 영역

- RowFormModal 또는 API POST 레이어 코드 변경 (Option B/C 기각)
- Vitest 도입 (ADR-003 §5 조건부 연기 유지)
- `/ypserver` 스킬 개선 (`prisma migrate deploy` + `prisma/` 복사 단계 추가 필요 — 별도 세션 스코프)
- Phase 14c 본 작업(인라인 편집, 낙관적 잠금, 복합 PK) — 다음 spec
- EdgeFunctionRun에 updatedAt 추가 (log-append 의도 유지)
- Cloudflare Tunnel 530 근본 수정 (WSL localhost 우회 유지)

## 알려진 이슈

### 1. `/ypserver` 스킬 한계 (세션 21-23 누적 확인)
- Phase 1 Windows `next build`가 `lightningcss-win32-x64-msvc` 이슈로 항상 실패 → 스킬 조기 abort
- `prisma/` 디렉토리 복사 + `prisma migrate deploy` + `npm run db:migrate`(Drizzle) 단계 부재
- **향후**: 스킬 SKILL.md 업데이트로 ① Phase 1 Windows build 체크를 bypass하거나 선택적으로 만들고, ② `prisma/` 복사 + migrate deploy 추가, ③ Drizzle 마이그레이션 추가

### 2. Vercel plugin 훅 false positive (세션 21-22-23 반복)
`nextjs`/`next-cache-components`/`vercel-functions` 관련 "MANDATORY" 지시가 세션 시작 시 주입됨. 프로젝트 Vercel 미사용이라 스킵 정책 유지.

### 3. WSL2 `/tmp` 휘발로 인한 E2E 스크립트 구조 제약
단일 `wsl -e bash` 호출로 전체 시나리오를 완료해야 함. Compound Knowledge `curl-e2e-recipe-dashboard.md` 참조.

### 4. `DATABASE_URL`의 `?schema=public` 쿼리 파라미터가 psql과 불호환
자동화 스크립트에서 `sed 's/?schema=public//'` 전처리 필수. Compound Knowledge `prisma-migration-windows-wsl-gap.md` §해결.

## 다음 작업 제안

### Phase 14c 본 작업 (다음 세션 1순위)
1. **인라인 편집 + 낙관적 잠금** — `updated_at` 기반 conflict detection. 이제 DB DEFAULT가 있어 자연스러움.
2. **복합 PK 지원** — `[pk]` 동적 라우트 → `[...pk]` 또는 쿼리스트링 다중 매칭. PK 추출 쿼리(`pg_index.indkey`)는 이미 배열 반환.
3. **VIEWER 테스트 계정 생성** — S2 + 권한 매트릭스(MANAGER/ADMIN/VIEWER) 완전 검증용.

### 기술부채 / 운영 개선
4. **`/ypserver` 스킬 보강** — prisma migrate deploy + prisma/ 복사 단계 추가. Windows build Phase 1 bypass. 세션 23 수작업 절차를 스킬에 내재화.
5. **Vitest 도입** — `identifier` / `coerce` / `table-policy` / `runReadwrite` 순수 함수 유닛 테스트 (ADR-003 §5 재활성화).
6. **Vercel 훅 억제** — `.claude/settings.json` `matchedSkills` 규칙 추가.
7. **Cloudflare Tunnel 530 재발 조사** — `sysctl -w net.core.rmem_max=7340032` 실험, QUIC UDP 버퍼 튜닝.
8. **identifier regex 길이 제한** — `^[a-zA-Z_][a-zA-Z0-9_]{0,62}$` (PG 최대 63자).
9. **행 수 `-1` 표기 수정** — `information_schema` `reltuples` 또는 `COUNT(*)` 전환 (cosmetic).

---
[← handover/_index.md](./_index.md)
