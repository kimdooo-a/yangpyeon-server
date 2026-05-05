# 인수인계서 — 세션 88 (sticky_notes 운영 콘솔 fix: app_admin role GRANT 누락 systemic, 4개월 prod latent)

> 작성일: 2026-05-05
> 이전 세션 (메인 chunk): [session 87](./260505-session87-cron-verify-cleanup-ck-hook-tdd.md) — S87 다중 작업 5건 압축
> 본 세션 (보조 chunk): 사용자 보고 → systematic-debugging Phase 1~4 → app_admin role GRANT systemic fix
> 영역 분리: 메인 = aggregator/cron/security/TDD, 보조 = DB role grants. 머지 충돌 0.

---

## 작업 요약

iPhone Safari에서 `/notes` 미작동 사용자 보고 → systematic-debugging skill 가이드대로 Phase 1~4 사이클 → root cause = `app_admin` PostgreSQL role 의 `BYPASSRLS=t + zero GRANT` (4개월 prod hidden latent, sticky_notes/webhooks/sql_queries/cron_jobs 외 37 테이블 모두 latent broken) → 마이그레이션 1건 직접 적용 + DEFAULT PRIVILEGES 등록 으로 systemic 차단 + 향후 신설 객체 자동 GRANT.

---

## 대화 다이제스트

### 토픽 1: 사용자 보고 — iPhone Safari /notes 미작동

> **사용자**: "핸드폰(아이폰16프로맥스)에서 사파리로 들어왔는데도 메모 작동이 안돼."

`superpowers:systematic-debugging` skill invoke. Phase 1 (Root Cause Investigation) 진입. "메모" 가 코드베이스 어디인지 grep — `(protected)/notes/page.tsx` + `sticky-board.tsx` + `sticky-note-card.tsx` + `/api/v1/sticky-notes/[id]/route.ts` = sticky-notes 보드.

코드 정독 중 발견된 **부수 잠재 버그** (root cause 아님): `sticky-note-card.tsx:114` `endDrag` 가 React 클로저 캡처로 인해 setPosition 직전의 `position` 을 사용 — 드래그 종료 시 시작 좌표 저장 가능성 (별도 PR 권고).

**결론**: 1차 정보로는 root cause 확정 불가. AskUserQuestion 으로 정확 증상 좁힘.

---

### 토픽 2: AskUserQuestion 4개 — 1차 가설 (모바일 Safari) 폐기

4 questions 병렬:
- 정확히 어느 단계? → **"/notes 페이지 자체가 안 열림"**
- 데스크톱 비교? → **"데스크톱에서도 같은 증상"** ⚠️
- 접속 URL? → stylelucky4u.com/notes (운영 도메인)
- Safari 모드? → 일반 모바일 / 쿠키 허용 / 일반 탭

**결론**: "데스크톱도 동일" 단 한 줄로 모바일 Safari/ITP/touch/cookie 가설 전면 폐기. 이건 환경 무관 = 배포된 빌드 또는 DB 또는 env 문제.

---

### 토픽 3: Phase 1 step 4 — multi-component evidence 수집

3 명령 병렬:
- `curl -I /notes` → 307 → /login (anon, 정상)
- `curl -I /api/v1/sticky-notes` → 401 (anon, 정상)
- `pm2 logs ypserver --err --lines 80 --nostream` → ⨯ **`Error [DriverAdapterError]: permission denied for table sticky_notes`** (PG 42501) 반복

**root cause 단서 발견**. 동시에 메타 단서: `sticky-board.tsx:35` `} catch { /* 무시 */ }` 가 PM2 stderr 의 명백한 42501 을 UI 단에서 silently 차단. "안 열림" 으로만 보이는 게 정확한 메커니즘.

`psql peer auth` 1차 실패 (postgres = password auth 만 허용) → ypserver `.env` 의 DATABASE_URL 사용. PowerShell→WSL→bash 다중 quoting 충돌 + Prisma URL 의 `?schema=public&options=-c%20TimeZone%3DUTC` 를 psql 이 거부 (`invalid URI query parameter "schema"`) → 임시 스크립트 파일 패턴 + `?...` strip 으로 정제.

**결론**: 42501 가 root cause 단서. 다음 단계 = ACL 진단 + 코드 분석.

---

### 토픽 4: Phase 2 — Pattern Analysis 로 1차 가설 자가 반박

`scripts/diag-sticky-notes-grants.sh` 작성: ACL + RLS + policy + multi-tenant 비교군 ACL + role 목록 + 최근 마이그레이션. 결과:
- DATABASE_URL user = `postgres` (BYPASSRLS=t superuser)
- sticky_notes ACL: `postgres=arwdDxt / app_readonly=r / app_readwrite=arwd / app_migration=arwdDxt / app_runtime=arwd`
- 다른 multi-tenant 테이블 (`content_sources` `users`) ACL = **완전히 동일 패턴**
- RLS forced enabled, policy `tenant_isolation`

**자가 반박**: postgres user 는 BYPASSRLS=t + 모든 권한 부여 (`postgres=arwdDxt`) → 42501 이 발생할 수 없는 환경. 단순 "GRANT 누락" 가설 폐기.

**결론**: 코드가 어딘가에서 SET ROLE 하는가? CLAUDE.md PR 게이트 룰 #3 ("Prisma 호출 = `tenantPrismaFor(ctx)` closure 패턴") 단서 — `tenantPrismaFor` 가 SET ROLE 호출 추정.

---

### 토픽 5: tenantPrismaFor 코드 정독 + PM2 stderr 분포 측정

3 진단 병렬:

(1) `pm2 logs ypserver --err --lines 500 | grep "permission denied"` 분포:
| 테이블 | 횟수 |
|--------|------|
| sticky_notes | 12 |
| webhooks | 3 |
| sql_queries | 3 |
| cron_jobs | 3 |

(2) `prisma-tenant-client.ts:187-188`:
```ts
if (ctx.bypassRls) {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE app_admin`);
}
```

(3) `/api/v1/sticky-notes/route.ts:11`:
```ts
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true };
```

**4 broken 테이블 공통점**: 모두 운영 콘솔 (operator-only) 라우트 = `bypassRls=true` 경로.

**결론**: 2차 가설 = `app_admin` role 에 GRANT 누락. BYPASSRLS=t 만 부여돼서 RLS 는 우회하지만 PostgreSQL 의 ACL 검사는 RLS 보다 먼저 → 42501.

---

### 토픽 6: Phase 3 — 가설 검증 + 스코프 확장

`scripts/diag-app-admin-grants.sh`: `has_table_privilege('app_admin', ...)` 직접 측정.

| 테이블 | sel | ins | upd | del |
|--------|-----|-----|-----|-----|
| sticky_notes | f | f | f | f |
| webhooks | f | f | f | f |
| sql_queries | f | f | f | f |
| cron_jobs | f | f | f | f |

**가설 100% 확정**.

**스코프 확장 검증** (memory `feedback_verification_scope_depth` 적용 — handler 진입 후 1 step): `scripts/diag-app-admin-missing.sh` 로 public schema 전수 조사:
- 누락 테이블: **37개** (전체)
- working 비교군 (정상): **0개**
- 시퀀스 누락: 1개 (`content_sources_id_seq`)
- DEFAULT PRIVILEGES 에 app_admin **없음**

→ 이건 4 테이블 GRANT 누락이 아니라 **app_admin role 자체가 처음부터 GRANT 받은 적이 없는 시스템 결함**. 4개월 prod hidden = S82 4 latent bug 패턴 5번째 사례 (PR 게이트 룰 #4 의 BYPASSRLS=t 영역 미커버).

**결론**: Phase 4 진입 — systemic fix 한 마이그레이션으로 묶기.

---

### 토픽 7: Phase 4 — 마이그레이션 작성 + 직접 적용

CLAUDE.md "Claude 직접 마이그레이션 적용" 정책 + memory `feedback_migration_apply_directly` 따름.

**`prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql`** (123 lines):

1. `app_admin` role 존재 가드 (없으면 RAISE EXCEPTION)
2. `GRANT USAGE ON SCHEMA public TO app_admin`
3. `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin`
4. `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_admin`
5. `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_admin`
6. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres ... GRANT ALL/USAGE,SELECT,UPDATE/EXECUTE ... TO app_admin` (3종)
7. **검증 블록**: 모든 user 테이블에 SELECT+INSERT+UPDATE+DELETE 4 권한 보장. 실패 시 RAISE EXCEPTION → 자동 rollback (`--single-transaction`).

**적용 경로 결정**: prisma migrate deploy 가 Windows 소스 ↔ WSL postgres cross-mount 에서 node 실행 안정성 의심 → psql 직접:

```bash
# scripts/apply-migration-grant-app-admin.sh
psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f migration.sql
psql "$DB_URL" -c "INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ('$MIG_ID', '$CHECKSUM', '$MIG_NAME', now(), now(), 1);"
```
- checksum = `sha256sum migration.sql` (prisma 가 다음 deploy 시 idempotent 인식)
- id = `uuidgen`
- idempotent skip 로직 (`_prisma_migrations` 에 finished_at NOT NULL 행 있으면 exit)
- 라이브 검증 SET ROLE app_admin 으로 4 broken 테이블 SELECT
- 후 검증 has_table_privilege 전수

**적용 결과**:
- 4 GRANT + 3 ALTER DEFAULT PRIVILEGES + 검증 블록 NOTICE: "37 테이블 모두 ALL 권한 부여 + DEFAULT PRIVILEGES 등록"
- _prisma_migrations 1 row 삽입
- 라이브 SET ROLE: sticky_notes=1 / webhooks=0 / sql_queries=0 / cron_jobs=6 (모두 통과)
- 후 검증: granted/total = **37/37**

---

### 토픽 8: 사후 검증 — 30s stderr 모니터

`scripts/diag-monitor-stderr-30s.sh` (전후 wc -l 차이):
- LINES_BEFORE=119, LINES_AFTER=119 → **0 new stderr lines**
- 새 42501 0건 ✅

curl probe 재실행 (anon):
- `/api/v1/sticky-notes` → 401 (정상 — 로그인 필요)
- `/notes` → 307 → /login (정상)

**PM2 restart 의도적 SKIP**: CLAUDE.md "PM2 운영 서버 임의 종료 금지" + GRANT 가 catalog-only 변경이라 restart 자체 불필요 (PostgreSQL ACL 은 매 query catalog lookup, prepared statement plan 에 hardcode 안 됨). 두 제약이 정합 — 이 fix 가 만약 restart 가 필요한 변경이었다면 룰 충돌 발생했을 수도.

**결론**: 사용자가 휴대폰에서 다시 시도하면 메모가 정상 작동해야 함. 1차 보고는 본 fix 로 해결됐다고 판단. 사용자 재시도 결과가 final 검증.

---

### 토픽 9: 메타 발견 — silent catch 의 디버깅 비용 증폭

`sticky-board.tsx:35`:
```ts
try {
  const res = await fetch("/api/v1/sticky-notes");
  ...
} catch {
  // 무시
}
```

PM2 stderr 의 명확한 42501 메시지를 UI 단에서 완전히 차단. "메모 불러오는 중…" 또는 빈 보드만 보임. 만약 `toast.error` 였다면 1 round 에 root cause 단서. PM2 stderr 가 없었다면 (또는 사용자가 PM2 접근 권한이 없었다면) 9시간+ thrashing 가능성. 후속 PR 권고:

1. `sticky-board.tsx:35` `} catch (err) { console.error(err); toast.error("메모 불러오기 실패"); }` 로 교체
2. 다른 ops route 의 catch{} 패턴 grep 후 전수 점검
3. 표준 fetch wrapper (`api-response.ts` 가 이미 있음) 강제 사용 룰 도입 검토

**결론**: 본 세션 root cause fix 와 별도 PR 로 분리. 다음 세션 우선순위 P1.

---

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|-----------|----------|
| 1 | 1차 가설 (모바일 Safari) 폐기 시점 | (a) 그대로 진행 / (b) 데스크톱 비교 질문 | "데스크톱도 동일" 한 줄로 환경 무관 확정. systematic-debugging Phase 1 "Reproduce Consistently" 가 정확히 이 단계. |
| 2 | 1차 fix 가설 (단순 GRANT 누락) 자가 반박 | (a) 곧장 GRANT 추가 / (b) Pattern Analysis | postgres user BYPASSRLS=t + ACL 모두 부여 = 42501 발생 불가 환경 → 가설 자체가 불가능. (a) 였다면 ACL noisy 만들고 root cause 그대로. |
| 3 | 스코프 확장 (4 → 37) | (a) 4 테이블만 GRANT / (b) 전수 검증 후 systemic | memory `feedback_verification_scope_depth` 적용 — handler 진입 후 1 step. 4만 fix 했다면 다음 세션 또 다른 latent 노출. S82 4 latent bug 패턴 정확히 동일. |
| 4 | DEFAULT PRIVILEGES 동시 등록 | (a) 기존 객체만 GRANT / (b) DEFAULT PRIVILEGES 도 등록 | 단순 GRANT 만이면 향후 마이그레이션 또 누락 가능. (b) 가 systemic 차단. postgres role 이 owner 인 모든 향후 객체 자동 GRANT. |
| 5 | psql 직접 적용 vs prisma migrate deploy | (a) `npx prisma migrate deploy` / (b) psql --single-transaction + `_prisma_migrations` 수동 | (a) 는 Windows 소스 ↔ WSL postgres cross-mount node 실행 안정성 의심. (b) 가 가장 안정적. checksum + id 수동 계산으로 prisma idempotent 보장. |
| 6 | PM2 restart SKIP | (a) `pm2 restart ypserver` / (b) restart 안 함 | (b) — CLAUDE.md "PM2 운영 서버 임의 종료 금지" + GRANT 는 catalog-only 변경 (PostgreSQL ACL 매 query lookup). 두 제약이 정합. |
| 7 | silent catch fix 별도 PR | (a) 본 fix 에 묶음 / (b) 별도 PR | (b) — 본 PR 은 DB 변경 only, silent catch 는 코드 변경 + 다른 catch{} 전수 점검 동반 필요. PR 분리가 review 깔끔. |

---

## 수정/신규 파일 (10개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql` | 신규 (123 lines) — app_admin role GRANT systemic fix |
| 2 | `scripts/apply-migration-grant-app-admin.sh` | 신규 — psql 직접 적용 + 라이브 검증 |
| 3 | `scripts/diag-sticky-notes-grants.sh` | 신규 — 진단 단계 1 (ACL/RLS/비교) |
| 4 | `scripts/diag-app-runtime-test.sh` | 신규 — app_runtime BYPASSRLS=f 검증 (대조군) |
| 5 | `scripts/diag-app-admin-grants.sh` | 신규 — broken 4 테이블 + working 비교군 |
| 6 | `scripts/diag-app-admin-missing.sh` | 신규 — 전수 조사 + DEFAULT PRIVILEGES |
| 7 | `scripts/diag-monitor-stderr-30s.sh` | 신규 — 30s stderr 새 에러 검출 |
| 8 | `docs/solutions/2026-05-05-app-admin-bypassrls-grants-trap.md` | 신규 (CK) — BYPASSRLS=t ≠ 모든 권한 함정 |
| 9 | `docs/handover/260505-session88-app-admin-grants-fix.md` | 신규 (본 파일) |
| 10 | `docs/status/current.md` + `docs/logs/journal-2026-05-05.md` + `docs/logs/2026-05.md` + `docs/handover/_index.md` + `docs/handover/next-dev-prompt.md` | 갱신 — /cs 6단계 |

---

## 검증 결과

- **마이그레이션 검증 블록 NOTICE**: "37 테이블 모두 ALL 권한 부여 + DEFAULT PRIVILEGES 등록" ✅
- **라이브 SET ROLE app_admin** 4 broken 테이블 SELECT: sticky_notes=1 / webhooks=0 / sql_queries=0 / cron_jobs=6 ✅
- **후 검증** has_table_privilege: granted/total = **37/37** ALL 권한 ✅
- **30s PM2 stderr 모니터**: 0 new lines (새 42501 0건) ✅
- **curl probe (anon)**: `/api/v1/sticky-notes` 401 + `/notes` 307→/login (모두 정상) ✅
- **_prisma_migrations**: 1 row inserted (`20260505000000_grant_app_admin_all_public`) ✅
- **WSL 빌드+배포 SKIP**: 코드 변경 = 마이그레이션 SQL + scripts only, prod 운영 영향 없음 (catalog-only). PM2 restart 도 SKIP (룰 + 변경 성격 정합).

---

## 터치하지 않은 영역

- **PM2 운영 서버 4종** (`ypserver` `cloudflared` `seaweedfs` `pm2-logrotate`) — `feedback_pm2_servers_no_stop` 룰 + GRANT 변경 성격이 restart 불필요
- **S87 메인 chunk 산출** (commits `b46bf2e` `effd6fa` `8bc785b`) — 영역 분리 보존
- **`sticky-note-card.tsx:114` endDrag stale closure** — root cause 와 무관한 부수 잠재 버그, 별도 PR 권고
- **silent catch 패턴 전수 정리** — 본 세션 root cause fix 와 별개, 후속 PR 권고만 (sticky-board.tsx:35 + 다른 ops route)
- **다른 ops route 라이브 검증** (Webhooks/SQL Editor/Cron 콘솔 등) — systemic fix 가 막지만 라이브 호출 미실행
- **PR 게이트 룰 #4 확장** (app_admin BYPASSRLS=t 라이브 테스트 게이트화) — CLAUDE.md 룰 PR 별도

---

## 알려진 이슈

- **사용자 휴대폰 재시도 결과 미확정**: 본 fix 가 1차 보고 해결했는지는 사용자 재시도가 final 검증. 만약 여전히 안 되면 (가능성 낮음) 다음 가설 후보 = (a) 브라우저 캐시 401 응답 (시크릿 탭 1회 또는 사이트 데이터 삭제) (b) 별개 버그 (sticky-board.tsx 의 다른 catch 또는 인증 플로우)
- **다른 ops 콘솔 latent 가능성**: 본 systemic fix 가 막지만 라이브 검증 미실행. Webhooks/SQL Editor/Cron 콘솔 사용 시 동일 함정 가능 — 운영자 사용 시 PM2 stderr 모니터 권장
- **silent catch 패턴이 다른 ops route 에도 산재**: `sticky-board.tsx:35` 외에도 비슷한 `} catch { /* 무시 */ }` 가 다른 곳에 있다면 다음 사고 시 또 디버깅 비용 증폭. 후속 grep 권고

---

## 다음 작업 제안 (S89+)

| 우선 | 작업 | 소요 |
|------|------|------|
| **P0** | 사용자 휴대폰에서 stylelucky4u.com/notes 재시도 → 정상 작동 확인 | 사용자 1분 |
| **P1** | `sticky-board.tsx:35` silent catch 교체 (`toast.error`) + 다른 ops route catch{} 전수 점검 | ~30분 |
| **P1** | 다른 ops 콘솔 라이브 호출 (Webhooks/SQL Editor/Cron 등) — systemic fix 검증 | ~30분 |
| **P1** | CLAUDE.md PR 게이트 룰 #4 확장 — "app_admin (BYPASSRLS=t) 라이브 테스트도 게이트" | ~15분 |
| P2 | `sticky-note-card.tsx:114` endDrag stale closure 별도 PR | ~30분 |
| P2 | `sticky-board.tsx` line 33 `setNotes(json.data)` JSON success 가드 보강 (data 형식 검증) | ~15분 |
| P0/P1 (S87 이월) | S85-F2 단독 chunk (M4 UI Phase 2, 5-6 작업일) / S86-SEC-1 GitHub repo visibility / S87-WAVE-1 sweep cont. | 그대로 유지 |

---

## 관련 자료

- 세션 87 메인 chunk handover: [260505-session87-cron-verify-cleanup-ck-hook-tdd.md](./260505-session87-cron-verify-cleanup-ck-hook-tdd.md)
- 세션 저널 원본: [../logs/journal-2026-05-05.md § 세션 88](../logs/journal-2026-05-05.md)
- Compound Knowledge: [../solutions/2026-05-05-app-admin-bypassrls-grants-trap.md](../solutions/2026-05-05-app-admin-bypassrls-grants-trap.md)
- 마이그레이션: [`prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql`](../../prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql)
- 적용 스크립트: [`scripts/apply-migration-grant-app-admin.sh`](../../scripts/apply-migration-grant-app-admin.sh)
- 관련 룰: CLAUDE.md "PR 리뷰 게이트 룰" #3 + #4, "PM2 운영 서버 임의 종료 금지" / memory `feedback_verification_scope_depth` `feedback_migration_apply_directly` `feedback_pm2_servers_no_stop`

---

[← handover/_index.md](./_index.md)
