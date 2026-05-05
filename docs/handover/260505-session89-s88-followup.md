# 인수인계서 — 세션 89 (S88 마무리 chunk: silent catch 표면화 + PR 게이트 룰 #4 BYPASSRLS=t 확장)

> 작성일: 2026-05-05
> 직전 세션 (보조 chunk): [session 88](./260505-session88-app-admin-grants-fix.md) — sticky_notes 운영 콘솔 fix (app_admin role GRANT 누락 systemic, 4개월 prod latent)
> 본 세션: S87 메인 chunk (`b46bf2e` `effd6fa` `8bc785b`) + S88 보조 chunk (다른 터미널 GRANT hotfix 7 untracked + 3 modified docs + handover 미완) 위에서 마무리 commit + follow-up 처리.

---

## 작업 요약

S88 보조 chunk 가 prod 사고 (`app_admin` BYPASSRLS=t + zero GRANT) 를 진단/마이그레이션 적용/검증 까지 마쳤지만 commit + handover/_index 갱신 + follow-up (silent catch fix, PR 게이트 룰 확장, audit 보강) 미완 상태로 떠남. 본 세션이 그 chunk 의 commit 마무리 + follow-up 3건 + audit 1건 추가 = 깔끔한 종료.

---

## 대화 다이제스트

### 토픽 1: 두 컨텍스트 (S87 종료 결과 + S88 GRANT 핫픽스 결과) 검토 + 추진

> **사용자**: "다음 두 내용을 확인해서 이세션에서 진행할 내용을 정리 및 추진해줘"

베이스라인 검증 (memory `feedback_baseline_check_before_swarm` + `feedback_concurrent_terminal_overlap` 적용) 부터:
- `git status --short` → 다른 터미널 7 untracked (5 diag scripts + apply script + migration 디렉토리) + 3 modified docs (logs/2026-05.md + logs/journal-2026-05-05.md + status/current.md)
- `git log --oneline -10` → S87 3 commits ahead (`b46bf2e` `effd6fa` `8bc785b`), origin behind 0
- next-dev-prompt §S88 우선순위 정독 — S87 가 7건을 "다른 터미널 산출 stage 제외" 로 인계
- 마이그레이션 prod 적용 검증 (`scripts/diag-app-admin-missing.sh`) → **0 missing tables** = GRANT 가 prod 에 정착됨

핵심 진단: 다른 터미널이 사실상 S88 보조 chunk 작업 완료 + 인계서 미작성 + commit 미실행. 본 세션이 마무리 chunk 로 처리.

**결론**: A1~A4 + B1+B2 의 6 작업 시퀀스 정의 → 자율 실행 메모리 적용으로 분기 질문 없이 즉시 진입.

---

### 토픽 2: ops-only 라우트 audit (drizzle 측 함정 가능성)

다른 터미널 핫픽스 3 follow-up 권고 중 #2 = "drizzle 측 SQL Editor/Edge Functions/Webhooks 콘솔도 같은 함정 가능". CLAUDE.md 가 "SQLite (Drizzle)" 명시 — drizzle 은 PG 사용 안 함. 코드 grep 결과 진짜 의도는 `src/lib/pg/pool.ts` 의 raw pg client (= Webhooks 콘솔 / SQL Editor 의 read/write 경로):

```
src/lib/pg/pool.ts:58:        await client.query("SET LOCAL ROLE app_readonly");
src/lib/pg/pool.ts:101:       await client.query("SET LOCAL ROLE app_readwrite");
```

이건 `app_admin` 와는 다른 두 role 이라 별개 latent bug 가능성. 즉시 audit 스크립트 (`scripts/diag-readwrite-grants.sh`) 신규 작성 + WSL 호출:

| role | sel | ins | upd | del | total | 의도 |
|---|---|---|---|---|---|---|
| `app_readonly` | 37 | 0 | 0 | 0 | 37 | SELECT 만 (의도대로) ✅ |
| `app_readwrite` | 37 | 37 | 37 | 37 | 37 | ALL granted ✅ |
| 누락 테이블 | — | — | — | — | 0 | ✅ |

DEFAULT PRIVILEGES 매트릭스도 5 roles 등록 완료 (`app_readonly r / app_readwrite arwd / app_migration arwdDxt / app_runtime arwd / app_admin arwdDxt`).

**결론**: raw pg client 경로 = 추가 코드/migration fix 불필요. `app_admin` 가 유일한 갭이었고 이미 회복. audit 스크립트는 commit A 에 자연 포함 (재사용 가능 진단 자산).

---

### 토픽 3: silent catch 패턴 grep (sticky-board.tsx + filebox/page.tsx 2 위치 발견)

`grep "} catch (...)" src/` 결과:
- `src/components/sticky-notes/sticky-board.tsx:35-37` (multiline, sticky-notes 보드)
- `src/app/(protected)/filebox/page.tsx:79` (filebox 사용량 표시)

도메인별 위계 적용:
- sticky-board.tsx = user-facing primary feature → `toast.error` (사용자 즉시 인지) + `console.error` (devtools 디버깅 단서) + 추가로 `if (!json.success)` 분기 명시화 (API 응답 success=false 도 같은 silent failure class)
- filebox/page.tsx = 사이드바 사용량 표시 (UX 비-blocking) → `console.error` 만 (toast noisy 회피)

**결론**: 2 위치 처리 완료. ops route 17개 client component catch{} 전수는 별도 sweep PR (S89+ 이월).

---

### 토픽 4: CLAUDE.md PR 게이트 룰 #4 BYPASSRLS=t 확장

기존 #4 룰 (`### PR 리뷰 게이트 룰`, line 167):

> non-BYPASSRLS role 로 라이브 테스트 1회 통과 — `bash scripts/run-integration-tests.sh tests/<domain>/` (PowerShell 권장 = WSL→Win cross-OS env 손실 회피). prod 가 BYPASSRLS postgres 사용해서 가려지는 RLS bug 차단.

확장 (S88 정착) — BYPASSRLS=t 운영 role (`app_admin` 등) 도 라이브 SET ROLE 테스트 게이트 추가. PG ACL 검사가 RLS 보다 먼저 실행 → BYPASSRLS=t 만으로는 ACL 우회 안 됨. `app_admin` GRANT 누락이 4개월 prod hidden 이었던 S88 사례 (`prisma/migrations/20260505000000_grant_app_admin_all_public/`) 를 명시 참조. 신규 BYPASSRLS=t role 추가 시 GRANT migration 동시 작성 필수, 신규 모델 추가 시 ALTER DEFAULT PRIVILEGES 가 자동 적용 (S88 마이그레이션 등록분).

자매 룰: memory `feedback_grant_check_for_bypassrls_roles.md` 신규 — BYPASSRLS=t role 도 GRANT 검증 필수 + 진단 스크립트 재사용 가이드.

**결론**: CLAUDE.md line 167 한 줄 확장 + memory 룰 + MEMORY.md 색인. 룰 자체가 다음 세션 PR 게이트로 자동 적용.

---

### 토픽 5: 검증 + commit B + S88 표 정정

검증 매트릭스:
- `npx tsc --noEmit` → 2 errors (`scripts/e2e/phase-14c-alpha-ui.spec.ts:19/20`) — **S87 인계서에 명시된 사전 존재 무관 항목** (본 변경 무관)
- `npx vitest run` → **585 PASS / 91 skipped** (S87 baseline 그대로, 회귀 0)
- secret-scan hook 자체 통과 (commit B 의 본 변경에 fallback default 없음)

Stage + commit B (`d10b5e9`):
- src/components/sticky-notes/sticky-board.tsx (silent catch + success=false 분기)
- src/app/(protected)/filebox/page.tsx (silent catch → console.error)
- CLAUDE.md (PR 게이트 룰 #4 확장)

memory 파일 (~/.claude/projects/.../memory/) 은 git 외 user-private 라 stage 제외 (정상). MEMORY.md 색인 line 21 추가도 user-private 영역.

**결론**: 본 commit 으로 S88 follow-up 의 코드 + 룰 정착 완료. handover index/current/logs/journal/next-dev-prompt 갱신은 본 /cs 단계.

---

### 토픽 6: 다른 터미널의 e33a318 commit 동시 출현 → 영역 분리 자연 정합

본 세션 commit A (`d18154e`) 직후, commit B 진행 중에 다른 터미널이 자기 /cs commit (`e33a318` "docs(s88): /cs 보조 chunk — CK app-admin BYPASSRLS GRANT trap + next-dev-prompt 세션 89 우선순위") 처리. 출현 산출:
- `docs/solutions/2026-05-05-app-admin-bypassrls-grants-trap.md` (CK 신규)
- `docs/handover/next-dev-prompt.md` (S89 우선순위 표 갱신)

본 세션 commit B 와 그 commit 영역 분리 = 본 세션은 코드 + CLAUDE.md + memory, 그 commit 은 docs/solutions + next-dev-prompt = 머지 충돌 0. **CK 작성을 다른 터미널에 자연 위임하고 본 세션은 룰 정착에 집중** = 두 chunk 영역 분리 패턴이 자연 작동.

본 /cs 단계에서 next-dev-prompt 의 S88 표 정정 (S88-PR-GATE-EXPAND ✅ + S88-SILENT-CATCH partial) 만 추가 처리 = 다른 터미널이 미반영한 본 세션 결과만.

**결론**: 두 commit 자연 합류 = `e33a318` (CK + 우선순위 표) + `d10b5e9` (코드 fix + 룰 + memory) 가 보조 chunk 의 docs 측면과 메인 측면을 분담.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 7 untracked + 3 modified docs commit 처리 (다른 터미널 미완 마무리) | (a) 그 터미널 commit 대기 (b) 본 세션이 흡수 | (b) — 다른 터미널이 작업 완료했지만 commit 안 한 채 떠남 = 본 세션이 마무리 chunk 로 처리하는 게 정합 (`feedback_concurrent_terminal_overlap` 의 inverse 케이스) |
| 2 | sticky-board + filebox 2 위치 모두 fix (전수 sweep 보류) | (a) sticky-board 만 (다른 터미널 권고 정확 일치) (b) 2 위치 (같은 패턴) (c) 17 ops route 전수 | (b) — 같은 silent failure class 라 같은 commit 자연 처리, 17 전수는 별도 sweep PR (~30분) S89 이월 |
| 3 | filebox 는 console.error 만 (toast 없이) | (a) 동일하게 toast.error (b) console.error 만 | (b) — 사이드바 사용량 표시는 user-blocking 아니라 toast noisy. 디버깅 단서 표면화는 console 만으로 충분 |
| 4 | PR 게이트 룰 #4 확장 (별도 PR 아님, 본 commit 흡수) | (a) 별도 PR (다른 터미널 표 P1 ~15분) (b) silent catch fix 와 같은 commit | (b) — 같은 prod 사고 후속 + S82 4 latent bug 패턴 정착 = 단일 commit 의 정체성 ("S88 마무리 chunk = follow-up 2종") |
| 5 | next-dev-prompt 정정은 /cs 단계로 분리 | (a) commit B 에 포함 (b) /cs 단계 별도 | (b) — 다른 터미널이 동시에 next-dev-prompt 갱신 중 race 회피 + /cs 가 자연 위치 |

---

## 수정 파일 (3개 + 4 docs)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/components/sticky-notes/sticky-board.tsx` | silent catch (line 31-44) → toast.error + console.error + success=false 분기 명시화 |
| 2 | `src/app/(protected)/filebox/page.tsx` | silent catch (line 79-82) → console.error |
| 3 | `CLAUDE.md` (line 167) | PR 게이트 룰 #4 확장 — BYPASSRLS=t 운영 role 라이브 SET ROLE 테스트 게이트 추가 + S88 마이그레이션 명시 참조 |
| 4 | `scripts/diag-readwrite-grants.sh` | (신규, commit A) `app_readonly`/`app_readwrite` GRANT 매트릭스 audit (정상 확인) |
| 5 | `memory/feedback_grant_check_for_bypassrls_roles.md` | (신규, repo 외 ~/.claude/) BYPASSRLS=t role GRANT 룰 자매 |
| 6 | `memory/MEMORY.md` (line 21) | (repo 외) 신규 룰 색인 추가 |
| 7 | `docs/handover/next-dev-prompt.md` | (/cs 단계) S88 표 정정: S88-PR-GATE-EXPAND ✅ + S88-SILENT-CATCH partial + S89 진입 첫 행동 4-6 정정 |
| 8 | `docs/handover/260505-session88-app-admin-grants-fix.md` | (다른 터미널 commit A 흡수) S88 보조 chunk 인계서 |
| 9 | `docs/handover/_index.md` | (commit A + /cs) row 88 + row 89 |
| 10 | `docs/status/current.md` | (commit A + /cs) row 88 + row 89 |
| 11 | `docs/logs/2026-05.md` + `docs/logs/journal-2026-05-05.md` | (commit A + /cs) row 88 + row 89 / 본 세션 섹션 추가 |
| 12 | `prisma/migrations/20260505000000_grant_app_admin_all_public/migration.sql` | (commit A 흡수) 다른 터미널 산출 — GRANT ALL + DEFAULT PRIVILEGES + 검증 블록 |
| 13 | `scripts/apply-migration-grant-app-admin.sh` + `scripts/diag-{sticky-notes-grants,app-admin-grants,app-admin-missing,app-runtime-test,monitor-stderr-30s}.sh` | (commit A 흡수) 다른 터미널 산출 6 진단/적용 스크립트 |

---

## 상세 변경 사항

### 1. sticky-board.tsx silent catch 표면화

기존 (line 31-39):

```ts
try {
  const res = await fetch("/api/v1/sticky-notes");
  const json = await res.json();
  if (json.success) setNotes(json.data);
} catch {
  // 무시
} finally {
  setLoading(false);
}
```

변경 (line 31-44):

```ts
try {
  const res = await fetch("/api/v1/sticky-notes");
  const json = await res.json();
  if (json.success) {
    setNotes(json.data);
  } else {
    toast.error(json.error?.message ?? "메모 불러오기 실패");
  }
} catch (e) {
  // S88 — silent catch 가 4개월간 PG 42501 (app_admin GRANT 누락) 을 가렸던 사고
  // 후속. fetch 실패 시 console + toast 양쪽으로 표면화.
  console.error("[sticky-notes] fetch failed", e);
  toast.error(e instanceof Error ? `메모 불러오기 실패: ${e.message}` : "메모 불러오기 실패");
} finally {
  setLoading(false);
}
```

추가 보강: API 응답 `success=false` 분기 명시화 — 같은 silent failure class.

### 2. filebox/page.tsx silent catch 표면화 (console-only 위계)

기존 (line 79):

```ts
} catch { /* 무시 */ }
```

변경 (line 79-82):

```ts
} catch (e) {
  // S88 — silent catch 패턴 제거. 사이드바 표시용이라 user-blocking 아니므로
  // toast 없이 console.error 만으로 표면화 (다음 prod 디버깅 시간 단축).
  console.error("[filebox] usage fetch failed", e);
}
```

### 3. CLAUDE.md PR 게이트 룰 #4 BYPASSRLS=t 확장

기존 (line 167):

> 4. **non-BYPASSRLS role 로 라이브 테스트 1회 통과** — ... prod 가 BYPASSRLS postgres 사용해서 가려지는 RLS bug 차단.

확장 (한 절 추가):

> **추가 게이트 (S88 정착)**: BYPASSRLS=t 운영 role (`app_admin` 등) 도 라이브 SET ROLE 테스트 통과 — RLS 우회 ≠ ACL 우회 (PG ACL 검사가 RLS 보다 먼저 실행). `app_admin` GRANT 누락이 4개월 prod hidden 이었던 S88 사례 (`prisma/migrations/20260505000000_grant_app_admin_all_public/`) 재발 차단. 신규 BYPASSRLS=t role 추가 시 GRANT migration 동시 작성 필수, 신규 모델 추가 시 ALTER DEFAULT PRIVILEGES 가 자동 적용 (S88 마이그레이션 등록분 = postgres role 의 향후 객체에 5 roles 자동 GRANT).

### 4. memory 신규 룰 + 색인

`feedback_grant_check_for_bypassrls_roles.md` — BYPASSRLS=t role GRANT 검증 룰. 진단 스크립트 재사용 가이드 (diag-app-admin-grants/missing/readwrite-grants). 자매 룰 = `feedback_verification_scope_depth` (전수 조사가 systemic vs partial 결함 식별의 결정 변수).

`MEMORY.md` line 21 색인 추가.

### 5. scripts/diag-readwrite-grants.sh 신규 (commit A 흡수)

`app_readonly` (37/0/0/0 의도대로) + `app_readwrite` (37/37/37/37) audit + 누락 테이블 0 + DEFAULT PRIVILEGES 5 roles 등록 확인. raw pg client 경로 (`src/lib/pg/pool.ts:58/101` SQL Editor / Webhooks 콘솔) 가 사용하는 두 role 의 정상성 정적 검증.

---

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 2 errors (사전 존재 phase-14c-alpha-ui.spec.ts:19/20, 본 변경 무관 — S87 인계서에 명시) |
| `npx vitest run` | **585 PASS / 91 skipped** (S87 baseline 그대로, 회귀 0) |
| `app_admin` GRANT 부여 (37 tables) | 37/37 ALL ✅ (commit A 검증 매트릭스) |
| DEFAULT PRIVILEGES 등록 | TABLES/SEQUENCES/FUNCTIONS 3종 ✅ |
| `app_readonly` audit | 37/0/0/0 (의도) ✅ |
| `app_readwrite` audit | 37/37/37/37 (ALL) ✅ |
| 라이브 SET ROLE app_admin 4/4 | sticky_notes=1, webhooks=0, sql_queries=0, cron_jobs=6 ✅ |
| 30s PM2 stderr 모니터 | 0 new lines (새 42501 0건) ✅ |
| `_prisma_migrations` row | 1 row 삽입 (idempotent skip 검증) ✅ |
| curl `/notes (anon)` | 307 → /login ✅ |
| curl `/api/v1/sticky-notes (anon)` | 401 ✅ |
| secret-scan hook 자체 통과 | ✅ (commit A + B 모두 hook 통과 = false positive 회피) |

---

## 터치하지 않은 영역

- **PM2 운영 서버 4종** (`feedback_pm2_servers_no_stop`) — restart 없이 즉시 적용 (GRANT catalog-only 변경)
- **S87 메인 chunk 산출** (commits `b46bf2e` `effd6fa` `8bc785b`) 보존
- **S85-F2 M4 UI Phase 2** (5-6 작업일 단독 chunk, S89+)
- **S87 이월 항목** (S86-SEC-1 운영자, S87-WAVE-1 sweep, S87-CK-MEMORY, S87-RSS-ACTIVATE, S87-TZ-MONITOR, S85-INFRA-1) 모두 그대로
- **`sticky-note-card.tsx:114` endDrag stale closure** (S88 보조 chunk 가 명시한 부수 잠재 버그, root cause 무관, 별도 PR P2)
- **silent catch 17 ops route 전수 sweep** — 본 세션은 sticky-board + filebox 2 위치만, ops route client component catch{} 전수는 별도 sweep PR (~30분)
- **`origin push`** — 5 commits ahead (S87 3 + S88 commit A + e33a318 + commit B = 5건). prod hotfix 는 이미 psql 직접 적용으로 활성화. push 는 사용자 결정 영역.

---

## 알려진 이슈

- **S88-USER-VERIFY P0** — 사용자 휴대폰 재시도 final 검증 미완. silent catch 표면화 후 재현 안 되어야 정상.
- **S88-OPS-LIVE P1** — 운영자 본인이 운영 콘솔 5~7 메뉴 클릭 + PM2 stderr 모니터 라이브 검증 미실행. audit 스크립트로 정적 확인은 완료.
- **3 unpushed commits + 본 세션 /cs commit** — 사용자 push 명령 시 4 commits push.

---

## 다음 작업 제안

S89 진입 시:

1. `git status --short` + `git log --oneline -5` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (다른 터미널 commit 가능성)
3. **S88-USER-VERIFY P0** — 사용자 확인 (1분, silent catch 표면화 후 1라운드 진단)
4. **S88-SILENT-CATCH-SWEEP P1 cont.** — ops route 17개 client component catch{} grep + 일괄 fix (~30분)
5. 또는 → **S85-F2 단독 chunk 진입** (5-6 작업일, S88 마무리 chunk 종료로 큰 chunk 진입 적절)

---

## 영구 룰 (S89 정착 — handover S88 와 동일)

- **BYPASSRLS=t role 도 GRANT 검증 필수** (memory `feedback_grant_check_for_bypassrls_roles`, CLAUDE.md PR 게이트 룰 #4 확장)
- **catch{} 의 빈 본문은 prod 디버깅 9배 비용 함정** — UI client fetch catch 는 최소 `console.error` (사용자 비-blocking) / `toast.error` (사용자 영역) 둘 중 하나 필수
- **`prisma migrate deploy` cross-mount 의심 시 psql 직접 적용 + `_prisma_migrations` row 수동 삽입 가능** — sha256sum + uuidgen + started_at/finished_at = now() + applied_steps_count=1

---

## 저널 참조

본 세션 누적 저널: [`docs/logs/journal-2026-05-05.md`](../logs/journal-2026-05-05.md) — 세션 87 + 세션 88 보조 chunk + 세션 89 마무리 chunk 3 섹션 누적.

---

[← handover/_index.md](./_index.md)
