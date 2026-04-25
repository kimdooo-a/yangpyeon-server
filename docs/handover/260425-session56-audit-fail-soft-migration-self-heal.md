# 인수인계서 — 세션 56 (Audit fail-soft + 마이그레이션 self-heal)

> 작성일: 2026-04-25
> 이전 세션: [session55](./260425-session55-ypserver-skill-v2-deploy.md)
> 저널: [journal-2026-04-25.md](../logs/journal-2026-04-25.md) §세션 56

---

## 작업 요약

세션 55 정식 배포 직후 12:52:52 KST 에 등장한 `SqliteError: no such table: audit_logs` 로 인한 로그인 장애를 4층 결함(L1 빈 DB / L2 빌드 게이트 부재 / L3 audit-도메인 강결합 / L4 패턴 sweep 누락)으로 분해 → ADR-021 정식화 + 4 단계 순차 구현 + WSL 빌드 파이프라인 게이트 강화 + 운영 self-heal 정착.

## 대화 다이제스트

### 토픽 1: 진입 — "로그인 오류로 나오는데 확인해봐"

> **사용자**: "로그인 오류로 나오는데 확인해봐. 현재 실행중인 이 프로젝트 서버에서."

systematic-debugging 4단계 적용. PM2 로그 정독으로 `2026-04-25 12:52:52 SqliteError: no such table: audit_logs` 발견. better-sqlite3 측은 SQL 실행까지 도달하므로 ELF 가설은 자동 기각 — 진짜 원인은 **빈 SQLite DB**. `dashboard.db` 4096 bytes / 테이블 0개 확인.

**인과 사슬**: standalone 새 배포 → `data/dashboard.db` 새로 생성 (`pack-standalone.sh` 가 drizzle 마이그레이션 미동봉) → `writeAuditLogDb` 동기 throw → `login-finalizer.ts:54` await/try-catch 없는 호출 → 500 → 클라이언트 "서버 연결 오류".

**결론**: cleanup-scheduler 1곳에만 적용된 silent-failure 진단 패턴(세션 54)이 도메인 콜사이트 11개에 누락되어 있음을 확인.

### 토픽 2: 근본 해결책 — "근본적인 해결책은?"

> **사용자**: "근본적인 해결책은?"

표면 처치(L1 마이그레이션 1회 실행)와 근본 해결의 차이를 4층으로 정리:

| 층 | 원인 | 표면 영향 |
|---|------|----------|
| L1 전술 | 빈 SQLite DB | 12:52 SqliteError, 로그인 500 |
| L2 프로세스 | 배포 파이프라인 마이그레이션 게이트 부재 | 빈 DB 로 traffic 수락 |
| L3 아키텍처 | audit 동기 throw + 도메인 라우트 미격리 | audit 한 호출 실패 → 로그인 500 |
| L4 메타 | 세션 54 패턴 1곳에만 적용, 11 콜사이트 누락 | 동일 함정 잔존 |

**결론**: L1 단독은 다음 standalone 재배포에서 재발. L3(safeAudit chokepoint) + L2(빌드 게이트 + 운영 self-heal) + L4(전수 sweep) + ADR-021 4단계로 묶어 처리. SQLite vs Postgres 통합(L4-옵션)은 §5 트리거 발동 시 별도 ADR 신설로 보류.

### 토픽 3: 4 단계 순차 실행

> **사용자**: "step 1,2,3,4까지 모두 순차적으로 진행"

자율 실행 메모리(분기 질문 금지, 권장안 즉시 채택)에 따라 즉시 진행.

- **Step 1 (L1)**: 운영 DB 에 drizzle 마이그레이션 직접 적용. better-sqlite3 (Linux) + crypto + heredoc node 스크립트로 `0000_old_maverick.sql` 실행 → 4 테이블 생성. WAL 모드라 PM2 재시작 불필요.
- **Step 2 (L3+L4)**: `src/lib/audit-log-db.ts` 에 `safeAudit(entry, context?)` 추가, `writeAuditLogDb` 는 `@internal` 마킹. 11개 콜사이트 일괄 sweep (replace_all). cleanup-scheduler 의 세션 54 수동 try/catch 는 safeAudit 가 동등 처리하므로 제거하고 context 인자로 진단성 보존.
- **Step 3 (L1+L2)**: `src/lib/db/migrate.ts` (TS, instrumentation 용 self-heal) + `scripts/run-migrations.cjs` + `scripts/verify-schema.cjs` 신규. `pack-standalone.sh` 가 drizzle migrations → `<bundle>/db-migrations/` 동봉. `wsl-build-deploy.sh` 6→8 단계 확장: [6/8] migrate / [7/8] verify (실패 시 PM2 reload 차단). `instrumentation.ts` 부팅 시 self-heal 호출 (best-effort, warn-only).
- **Step 4**: ADR-021 작성 + CK +1 + next-dev-prompt 알려진 이슈 갱신.

**검증**: tsc 0 errors / cleanup-scheduler.test.ts 13/13 PASS / 운영 verify-schema.cjs OK / run-migrations.cjs 멱등 skip / PM2 12:52:52 이후 신규 SqliteError 0건.

### 토픽 4: 빌드 게이트 자체 검증 — "순차적으로 진행 ... wsl-build-deploy.sh 1회 실행"

> **사용자**: "순차적으로 진행 ... 1. bash /mnt/e/.../scripts/wsl-build-deploy.sh 1회 실행 — 새 [6/8] [7/8] 단계가 운영 환경에서 자체 검증되는지 확인"

WSL 빌드 파이프라인 1회 실행. 새 단계 결과:
- [6/8] migrate: `[migrate] skip 0000_old_maverick (already applied)` → 멱등성 검증 ✓
- [7/8] verify: `[verify-schema] OK — required tables present` → fail-fast 게이트 정상 ✓
- [8/8] PM2 restart: ↺=4→5, ELF Linux 양쪽 확인, Ready 0ms ✓

**부가 발견**: 빌드 중 `npm error gyp ERR!` 가 보이지만 install-native-linux.sh `[1/2] 소스 재빌드 실패 → prebuilt 폴백` 정상 흐름 (폴백 결과 ELF Linux 검증 통과).

### 토픽 5: 세션 번호 충돌 정정

세션 종료 직전 current.md 정독 중 **세션 55가 이미 점유**되어 있음 발견 (12:47 ypserver 스킬 v2 + 운영 재배포). 본 대화는 그 부팅 직후 12:52 SqliteError 로 시작된 별개 세션이므로 **세션 56**. ADR-021 본문 / CK frontmatter / next-dev-prompt 의 "세션 55" 레퍼런스 모두 56 으로 정정.

**결론**: 충돌 해소 후 정식 /cs 4단계 진행.

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|-------------|-----------|
| 1 | safeAudit chokepoint + 11 콜사이트 sweep (L3+L4) | (a) writeAuditLogDb 자체에 try/catch 매립 (b) audit 비동기 큐 (outbox) | (a)는 테스트가 throw 검증 못 함 + "audit 실패를 의도적으로 노출" 케이스 차단. (b)는 본 사고 직접 원인 아니며 오버엔지니어링 — 트래픽 증가 시 재검토. safeAudit 단일 chokepoint 가 도메인 라우트와 audit 의 관심사 분리를 가장 명확하게 표현. |
| 2 | 빌드 게이트 (fail-fast) + 운영 self-heal (best-effort) 이중 안전망 | (a) self-heal 만 (b) 빌드 게이트만 (c) 둘 다 fail-fast | (a)는 빈 DB 가 미감지로 가능성. (b)는 다중 인스턴스 / 핫스왑 시 신규 .sql 적용 윈도우 누락. (c)는 부팅 자체가 차단되어 복구 불가 — 빌드는 fail-fast 가 합리적이지만 부팅은 기존 트래픽 흐름 보호가 우선. 같은 검사를 두 지점에서 다른 정책으로. |
| 3 | SQLite vs Postgres audit 통합 보류 | 즉시 통합 | 백업/리텐션 정책 재설계 미완 + 본 사고 직접 원인 아님. ADR-021 §5 에 정량 트리거 3건 명시(audit 실패율 > 0.1%/일 / DB 1GB+ / Postgres 트랜잭션 합류 요구). |
| 4 | scripts/run-migrations.cjs + src/lib/db/migrate.ts 별도 구현 | 단일 TS 모듈 + ts-node CLI | dev/prod 환경 모두 ts-node 의존이 부담. CJS CLI 는 builddir 의 better-sqlite3 (Linux) 즉시 사용. 두 구현이 동일 `__drizzle_migrations` 테이블을 공유하므로 멱등 — 약 50줄 중복 비용은 환경 매트릭스 단순화 대비 합리. |
| 5 | cleanup-scheduler.ts 의 세션 54 수동 try/catch 제거 (safeAudit 통합) | 보존 | safeAudit 가 동등 처리 + context 인자로 진단성 보존. 두 패턴 공존은 향후 혼동 유발. 세션 54 의 진단 가능성은 safeAudit 의 warn 로그가 그대로 계승. |

## 수정 파일 (21개: 16 modified + 5 new)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/audit-log-db.ts` | `safeAudit(entry, context?)` 추가, `writeAuditLogDb` `@internal` 마킹 |
| 2 | `src/lib/sessions/login-finalizer.ts` | `writeAuditLogDb` → `safeAudit` |
| 3 | `src/lib/sessions/cleanup.ts` | JSDoc 정정 |
| 4 | `src/lib/cleanup-scheduler.ts` | 수동 try/catch 제거 + `safeAudit(..., context)` 통합 |
| 5 | `src/instrumentation.ts` | 부팅 시 `applyPendingMigrations()` + `verifySchema()` (best-effort) |
| 6 | `src/app/api/admin/users/[id]/sessions/route.ts` | sweep + JSDoc 정정 |
| 7 | `src/app/api/v1/auth/logout/route.ts` | sweep |
| 8 | `src/app/api/v1/auth/refresh/route.ts` | sweep (3 calls) |
| 9 | `src/app/api/v1/auth/sessions/[id]/route.ts` | sweep |
| 10 | `src/app/api/v1/auth/sessions/revoke-all/route.ts` | sweep |
| 11 | `src/app/api/v1/tables/[table]/route.ts` | sweep |
| 12 | `src/app/api/v1/tables/[table]/[pk]/route.ts` | sweep (3 calls) |
| 13 | `src/app/api/v1/tables/[table]/composite/route.ts` | sweep (3 calls) |
| 14 | `scripts/pack-standalone.sh` | drizzle migrations → `<bundle>/db-migrations/` 동봉 추가 |
| 15 | `scripts/wsl-build-deploy.sh` | 6→8 단계 확장 ([6/8] migrate / [7/8] verify) |
| 16 | `docs/handover/next-dev-prompt.md` | "세션 56 신규" 블록 추가 |
| 17 | `src/lib/db/migrate.ts` (신규) | TS migrator + verifier (instrumentation 용) |
| 18 | `scripts/run-migrations.cjs` (신규) | CJS migrator (빌드 게이트용) |
| 19 | `scripts/verify-schema.cjs` (신규) | CJS verifier (빌드 게이트용) |
| 20 | `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md` (신규) | ADR-021 정식화 |
| 21 | `docs/solutions/2026-04-25-audit-fail-soft-and-migration-self-heal.md` (신규) | CK +1 (39→**40**) |

## 상세 변경 사항

### 1. `safeAudit` chokepoint (audit-log-db.ts)

```ts
export function safeAudit(entry: AuditEntry, context?: string): void {
  try {
    writeAuditLogDb(entry);
  } catch (err) {
    console.warn("[audit] write failed", {
      context: context ?? entry.action ?? `${entry.method} ${entry.path}`,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    });
  }
}
```

invariant: cross-cutting 관심사는 도메인 응답을 깨뜨리지 않는다 (ADR-021).

### 2. 마이그레이션 러너 자동 탐색 우선순위 (migrate.ts / run-migrations.cjs)

1. `process.env.DRIZZLE_MIGRATIONS_DIR` (명시 override)
2. `<cwd>/db-migrations/` (standalone 번들)
3. `<cwd>/src/lib/db/migrations/` (dev source)

`__drizzle_migrations` 테이블 + sha256 hash 로 drizzle-kit 의 트래킹 포맷 호환. CJS / TS 두 구현이 같은 트래킹 테이블을 공유하므로 서로 멱등.

### 3. 빌드 파이프라인 게이트 ([6/8] [7/8])

```bash
echo "[6/8] Drizzle 마이그레이션 적용 (운영 DB) — ADR-021 빌드타임 게이트"
SQLITE_DB_PATH="$DEPLOY_DIR/data/dashboard.db" \
DRIZZLE_MIGRATIONS_DIR="$WSL_BUILD_DIR/src/lib/db/migrations" \
  node "$WSL_BUILD_DIR/scripts/run-migrations.cjs"

echo "[7/8] 스키마 검증 — 필수 테이블 존재 보장 (실패 시 PM2 reload 차단)"
SQLITE_DB_PATH="$DEPLOY_DIR/data/dashboard.db" \
  node "$WSL_BUILD_DIR/scripts/verify-schema.cjs"
```

### 4. 운영 self-heal (instrumentation.ts)

```ts
try {
  const { applyPendingMigrations, verifySchema } = await import("@/lib/db/migrate");
  const result = applyPendingMigrations();
  if (result.applied.length > 0) {
    console.log(`[instrumentation] migrations applied at startup: ${result.applied.join(", ")}`);
  }
  const check = verifySchema();
  if (!check.ok) {
    console.warn(`[instrumentation] schema check WARN — missing tables: ${check.missing.join(", ")} (db=${check.dbPath})`);
  }
} catch (err) {
  console.warn("[instrumentation] migrate/verify failed", err instanceof Error ? { message: err.message, stack: err.stack } : err);
}
```

부팅이 차단되지 않도록 try/catch — 빌드 게이트가 1차 fail-fast, instrumentation 은 2차 best-effort.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `vitest run cleanup-scheduler.test.ts` | 13/13 PASS |
| `wsl-build-deploy.sh` [6/8] | `[migrate] skip 0000_old_maverick (already applied)` → 멱등 |
| `wsl-build-deploy.sh` [7/8] | `[verify-schema] OK — required tables present` |
| `wsl-build-deploy.sh` [8/8] | PM2 ypserver ↺=4→5, online, Ready 0ms |
| ELF 검증 | better_sqlite3.node BuildID `7fdd4a4a...` Linux 양쪽 ✓ |
| PM2 신규 에러 | 12:52:52 SqliteError 이후 0건 |
| 운영 DB 테이블 | `__drizzle_migrations, audit_logs, ip_whitelist, metrics_history` 4개 ✓ |
| 로그인 엔드포인트 | `POST /api/v1/auth/login` → 401 INVALID_CREDENTIALS (정상) |

## 터치하지 않은 영역

- audit-failure 카운터 메트릭 (ADR-021 §결과·부정 잔류 위험 완화 — 별도 트랙)
- L4-(선택) audit_logs Postgres 통합 (§5 트리거 발동 시 별도 ADR)
- audit 비동기 큐 (outbox 패턴 — 트래픽 증가 시 재검토)
- 다른 글로벌 스킬 audit (`kdyship`/`kdydeploy`/`kdycicd` — S55 이월)
- S54/S53 잔존 6항(`_test_session` drop / DATABASE_URL rotation / MFA biometric / SP-013·016 / Windows 재부팅 실증 / Turbopack 워닝)

## 알려진 이슈

- **safeAudit 실패는 warn 로그만 누적** — audit 누락이 모니터링 없이 조용히 누적될 가능성. 차후 카운터 메트릭 + 알림 권장.
- **instrumentation self-heal 시 SQLite 잠금 윈도우** — 기존 PM2 인스턴스가 떠 있는 상태에서 reload 시 공존 가능. WAL 모드라 락 충돌 확률 낮음.
- **ELF mismatch 잔존 가능성** — 2026-04-19~21 ERR_DLOPEN_FAILED 4건은 WSL 재배포로 흡수된 듯하나, 다음 standalone 재배포 시 재현 검증 필요.

## 다음 작업 제안

1. **2026-04-26 03:00 KST cleanup cron 결과** — safeAudit + audit_logs 테이블 존재 후 첫 자동 실행. 정상 시 silent failure 가설 자체가 해소됨을 확정.
2. **audit-failure 카운터 메트릭** — `safeAudit` warn 발생량을 prometheus/loki 로 누적 노출 → 알림 설정. ADR-021 §결과·부정 완화.
3. **다른 글로벌 스킬 audit drift 점검** — S55 이월. `kdyship`/`kdydeploy`/`kdycicd` 등이 standalone+WSL 빌드 진화와 동기화되어 있는지 확인.
4. **S54/S53 잔존 6항 처리** — 환경/생체/파괴적 의존만 잔존 (next-dev-prompt §세션 54 신규 참조).
5. **(선택) `wsl-build-deploy.sh` stderr `tee logs/build-*.log` 추가** — Turbopack 워닝 텍스트 캡처 선행 작업 (S54 부 항목).

---

## §보완 — Audit-Failure 카운터 메트릭 (ADR-021 §amendment-1)

> 본 세션 정식 마감(commit `638d764`) 직후 동일 conversation 에서 사용자 요청("지금 메트릭 작업")으로 진행. 세션 56 의 권장 후속 작업 1건 + 본 세션 ADR-021 §결과·부정 잔류 위험 완화.

### 작업 요약

`safeAudit` 호출 결과를 in-process 카운터로 누적 + admin endpoint 로 노출. PM2 reload 시 리셋되는 1차 가시성 도구로 한정 (외부 스크래퍼 / 알림 / 영속화는 의도 보류 — ADR-021 §amendment-1 §의도된 한계).

### 변경 파일 (4건: 3 신규 + 1 수정)

| 파일 | 변경 |
|---|---|
| `src/lib/audit-metrics.ts` (신규) | in-process 카운터 — `recordAuditOutcome` / `getAuditMetrics` / `MAX_BUCKETS=200` FIFO evict / context 첫 2 segment 정규화 / `recordAuditOutcome` 절대 throw 안 함 invariant |
| `src/lib/audit-metrics.test.ts` (신규) | 9 단위 테스트 — 초기/카운트/정규화/정렬/비-Error throw/never-throw/0&1 경계/reset |
| `src/app/api/admin/audit/health/route.ts` (신규) | `GET` admin endpoint, withRole 가드, no-store |
| `src/lib/audit-log-db.ts` (수정) | safeAudit try/catch 양 분기에서 `recordAuditOutcome` 호출 + ADR-021 §amendment-1 정식화 |

### 상세 변경

```ts
// safeAudit 변경 (audit-log-db.ts)
export function safeAudit(entry: AuditEntry, context?: string): void {
  const ctx = context ?? entry.action ?? `${entry.method} ${entry.path}`;
  try {
    writeAuditLogDb(entry);
    recordAuditOutcome(true, ctx);
  } catch (err) {
    recordAuditOutcome(false, ctx, err);
    console.warn("[audit] write failed", { context: ctx, error: ... });
  }
}
```

응답 shape:
```json
{
  "success": true,
  "data": {
    "startedAt": "...",
    "uptimeSeconds": 123,
    "total": { "success": 0, "failure": 0, "failureRate": 0 },
    "byBucket": []
  }
}
```

byBucket 정렬: 실패 많은 순 → 호출량 많은 순. context 정규화로 `cleanup-scheduler:SESSION_EXPIRE:abc` → `cleanup-scheduler:SESSION_EXPIRE` 버킷 (high-cardinality 차단).

### 검증

- `npx tsc --noEmit` — 0 errors
- `vitest run audit-metrics.test.ts cleanup-scheduler.test.ts` — **22/22 PASS** (9 신규 + 13 회귀)
- 운영 빌드+배포 (`wsl-build-deploy.sh`) — [6/8] migrate skip ✓ / [7/8] verify OK ✓ / [8/8] PM2 ↺=5→6 online + ELF Linux 양쪽
- `GET /api/admin/audit/health` (no auth) → 401 UNAUTHORIZED — admin 가드 정상

### 의사결정

| # | 결정 | 대안 | 선택 이유 |
|---|------|------|-----------|
| 1 | in-process 카운터 (PM2 reload 시 리셋) | (a) audit_logs 에 별도 컬럼 (b) 별도 audit_failures 테이블 (c) 외부 prometheus | (a/b) 영속 비용 + 마이그레이션. 본 카운터 목적은 "지금 silent 한가?"의 즉시 가시성, 누적 추세는 audit_logs 테이블이 source of truth. (c) 1인 운영 인프라에 prometheus 부재. JSON endpoint 가 즉시 가치 충족, 차후 텍스트 익스포터 추가 가능. |
| 2 | byBucket 카디널리티 캡 200 + FIFO evict | 무제한 / LRU | cleanup-scheduler 가 entry-id 를 context 에 포함 → 무제한 시 메모리 폭주. context 첫 2 segment 정규화로 카디널리티는 사실상 제한되지만 방어 깊이로 캡도 추가. FIFO 가 LRU 보다 단순하고 본 케이스에 충분. |
| 3 | `recordAuditOutcome` 자체에 try/catch (절대 throw 안 함) | 일반 throw 허용 | safeAudit 가 fail-soft 인데 그 메트릭이 throw 하면 cross-cutting invariant 깨짐. cross-cutting 의 cross-cutting 도 fail-soft 로 — 한 측정 손실은 허용. |
| 4 | ADR-021 §amendment-1 형태로 추가 (별도 ADR-022 신설 X) | ADR-022 로 분리 | 본 메트릭은 ADR-021 §결과·부정에서 명시한 잔류 위험 완화책 — 직접 연결됨. 별도 ADR 은 의사결정 단위가 동일하므로 amendment 가 더 자연스러움. 외부 스크래퍼 도입 같은 큰 변화 시는 ADR-022 신설. |

### 이월

- §amendment-1 §후속 트리거 — failureRate > 0.001/일 / PM2 reload 사이 추세 식별 곤란 / 외부 스크래퍼 도입 시 prometheus 텍스트 포맷 노출
- 04-26 03:00 KST cleanup cron 후 첫 카운터 측정 — `curl -H 'Authorization: Bearer <ADMIN>' /api/admin/audit/health` 로 audit_logs 정상 누적 + failure 0 확인

### 사용자 ADMIN 토큰 측정 가이드 (참고)

```bash
# 1. ADMIN 로그인하여 accessToken 획득
TOKEN=$(curl -sS -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq -r '.data.accessToken')

# 2. health 조회
curl -sS http://localhost:3000/api/admin/audit/health \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---
[← handover/_index.md](./_index.md)
