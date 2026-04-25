---
title: 감사 로그 fail-soft 격리 + 마이그레이션 자가치유 — 4층 결함 일괄 해결
date: 2026-04-25
session: 56
tags: [audit-log, cross-cutting, fail-soft, drizzle, migration, build-pipeline, instrumentation, ADR-021]
category: pattern
confidence: high
---

## 문제

세션 56 시작 시 사용자가 로그인하면 "서버 연결 오류" 메시지로 로그인 불가. PM2 에러 로그에는:

```
2026-04-25 12:52:52 +09:00: ⨯ SqliteError: no such table: audit_logs
```

이 에러는 세션 54에서 적용한 cleanup-scheduler silent-failure 진단 패치 덕분에 비로소 가시화 — 즉 패치가 즉시 ROI 입증. 하지만 그 패턴이 cleanup-scheduler 1곳에만 적용되어, 도메인 라우트(login 등)는 여전히 audit 실패가 응답을 깨뜨리는 구조.

## 원인 — 4층 결함

| 층 | 원인 |
|---|------|
| L1 전술 | `/home/smart/ypserver/data/dashboard.db` 가 4096 bytes 빈 파일 (테이블 0개) — drizzle 마이그레이션 미적용 |
| L2 프로세스 | `wsl-build-deploy.sh` 6단계에 `db:migrate` 게이트 부재 + `pack-standalone.sh` 가 prisma 마이그레이션만 동봉, drizzle 누락 |
| L3 아키텍처 | `writeAuditLogDb` 동기 throw + `login-finalizer.ts:54` 가 `await/try-catch` 없이 호출 → 500 응답 |
| L4 메타 | 세션 54 silent-failure 패턴이 1곳에만 적용 — 11개 도메인 콜사이트 누락 |

L1만 고치면 다음 standalone 재배포에서 같은 사고 반복. L2가 없으면 모든 신규 콜사이트가 L3 함정에 빠짐. L4는 "패턴은 발견했지만 sweep 미완료"라는 메타 결함.

## 해결 — Step 1~4 순차 적용 (ADR-021 정식화)

### Step 1: 운영 DB 즉시 복구 (L1)

```bash
# 운영 환경에서 1회 실행. better-sqlite3 (Linux .node) 가 있는 deploy dir 컨텍스트에서.
cd /home/smart/ypserver && node <<'EOF'
const Db = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const SQL = fs.readFileSync('/path/to/migrations/0000_old_maverick.sql', 'utf8');
const db = new Db('data/dashboard.db');
db.pragma('journal_mode = WAL');
db.prepare('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)').run();
const txn = db.transaction(() => {
  for (const stmt of SQL.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) {
    db.prepare(stmt).run();
  }
  db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
    crypto.createHash('sha256').update(SQL).digest('hex'), Date.now()
  );
});
txn();
EOF
```

WAL 모드라 PM2 재시작 불필요 — better-sqlite3 가 다음 쿼리에서 새 스키마 자동 인식.

### Step 2: `safeAudit()` 도입 + 11개 콜사이트 sweep (L3 + L4)

```ts
// src/lib/audit-log-db.ts
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

전수 변경: `import { writeAuditLogDb }` → `import { safeAudit }`, `writeAuditLogDb(` → `safeAudit(`. 단순 `replace_all`. cleanup-scheduler 의 수동 try/catch 도 삭제(safeAudit 가 동등 처리) + context 인자로 진단성 보존.

### Step 3: 빌드 게이트 + 운영 self-heal (L1·L2)

- `src/lib/db/migrate.ts` (TS) — `applyPendingMigrations()` + `verifySchema()` — instrumentation 에서 호출.
- `scripts/run-migrations.cjs` + `scripts/verify-schema.cjs` (CJS) — wsl-build-deploy.sh 빌드타임 게이트.
- `pack-standalone.sh` 에 drizzle migrations → `<bundle>/db-migrations/` 동봉 추가.
- `wsl-build-deploy.sh` 단계 [6/8] migrate / [7/8] verify 추가 (verify 실패 시 PM2 reload 차단).
- `instrumentation.ts` 가 부팅 시 `applyPendingMigrations()` 호출 — 빌드 게이트가 1차, 부팅 self-heal 이 2차 안전망.

탐색 우선순위 — 환경별 자동 매핑:
1. `process.env.DRIZZLE_MIGRATIONS_DIR` (명시 override)
2. `<cwd>/db-migrations/` (standalone 번들)
3. `<cwd>/src/lib/db/migrations/` (dev source)

### Step 4: ADR-021 정식화

- `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md` 작성.
- §2.4 SQLite vs Postgres 통합 보류 + §5 재검토 트리거 3건 명시.

## 교훈

- **Cross-cutting 관심사는 도메인 임계 경로와 fail-tied 되면 안 된다.** Observability/audit/metrics 가 인증/세션/CRUD 응답을 깨뜨리는 건 "tail wagging the dog" anti-pattern. 단일 chokepoint(`safeAudit`) + lint/grep 컨벤션으로 강제.
- **패턴은 발견 즉시 sweep 해라.** 세션 54 가 진단 패턴은 만들었지만 cleanup-scheduler 1곳에만 적용 → 24h 후 도메인 라우트에서 동일 함정. 패턴 발견 PR 의 표준 산출물에 "전수 적용 검증" 체크리스트 추가가 합리.
- **빈 DB 로 traffic 수락은 buildtime fail-fast 게이트로 차단**. 마이그레이션 적용은 빌드 단계의 invariant 여야 함 (PM2 reload 보다 *반드시* 먼저).
- **자가치유 vs fail-fast 의 두 단계**: 빌드 게이트는 fail-fast (오류 즉시 차단), 운영 startup self-heal 은 best-effort (warn 만, 부팅 차단 안 함). 같은 검사를 두 지점에서 다른 정책으로.
- **standalone 패키저는 마이그레이션도 자기 책임**: prisma 만 동봉하고 drizzle 누락한 비대칭 = 사일런트 결함. 다른 ORM 추가 시 동일 점검 — 패키저 테스트 추가 가치.
- **`process.cwd()` 기반 경로 탐색 + env override 패턴** — dev/prod 양쪽에서 같은 코드 작동. `if (existsSync(candidate))` 우선순위로 자기서술적.

## 관련 파일

- 신규
  - `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md`
  - `src/lib/db/migrate.ts`
  - `scripts/run-migrations.cjs`
  - `scripts/verify-schema.cjs`
- 수정
  - `src/lib/audit-log-db.ts` — `safeAudit` 추가
  - `src/lib/sessions/login-finalizer.ts`
  - `src/lib/sessions/cleanup.ts` (주석)
  - `src/lib/cleanup-scheduler.ts` — 수동 try/catch 제거 + safeAudit 통합
  - `src/instrumentation.ts` — startup self-heal
  - `src/app/api/admin/users/[id]/sessions/route.ts`
  - `src/app/api/v1/auth/{logout,refresh,sessions/[id],sessions/revoke-all}/route.ts`
  - `src/app/api/v1/tables/[table]{,/[pk],/composite}/route.ts`
  - `scripts/pack-standalone.sh` — drizzle migrations 동봉
  - `scripts/wsl-build-deploy.sh` — [6/8] migrate / [7/8] verify 단계 추가

## 검증 결과

- TS: `npx tsc --noEmit` 0 errors
- 단위: `vitest run src/lib/cleanup-scheduler.test.ts` 13/13 PASS
- 운영 DB: `verify-schema.cjs` OK — `audit_logs, ip_whitelist, metrics_history` 존재
- 멱등성: `run-migrations.cjs` 재실행 시 `skip 0000_old_maverick (already applied)`

## 후속

- 다음 정식 배포 시 wsl-build-deploy.sh 가 자동 migrate/verify 게이트 통과 검증 (dry-run 권장).
- ADR-021 §5 트리거 모니터링 — audit 실패율 / SQLite 파일 크기 / Postgres 트랜잭션 합류 요구.
- audit-failure 카운터 메트릭 추가 (별도 트랙) — `safeAudit` warn 누적량을 prometheus/loki 로 내보내 모니터링 가능.
