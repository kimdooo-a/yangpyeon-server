---
title: WSL2 배포 시 Drizzle 마이그레이션 누락 — audit_logs 테이블 부재
date: 2026-04-17
session: 21
tags: [drizzle, sqlite, deployment, wsl2, pm2, ypserver, audit-log]
category: tooling
confidence: high
---

## 문제

Phase 14b C5 WSL2 배포 후 API 통합 테스트 실행:

```bash
curl -X POST http://localhost:3000/api/v1/tables/folders ...
# → {"success":false,"error":{"code":"QUERY_FAILED","message":"no such table: audit_logs"}}
```

`writeAuditLogDb`가 SQLite `audit_logs` 테이블 부재로 실패. 그러나 PG INSERT는 이미 COMMIT됐으므로 **데이터는 남고 감사 로그는 누락되는 반쪽 성공** 상태 발생.

확인 결과:
```bash
wsl -- ls -la ~/dashboard/data/
# dashboard.db  4096 bytes  ← 테이블 미생성, 파일만 존재
# dashboard.db-shm 32768 bytes
# dashboard.db-wal 0 bytes
```

`data/dashboard.db` 파일은 `src/lib/db/index.ts`의 `mkdirSync` + `new Database(DB_PATH)`로 자동 생성됐지만, **스키마는 미적용** — 빈 SQLite 파일만 존재.

## 원인

배포 스크립트가 `npm run build` + `pm2 restart`만 수행하고 **`npm run db:migrate` 단계를 누락**. 세션 19의 `instrumentation.ts` `data/` `mkdirSync`는 디렉토리 생성에만 해당하며, Drizzle 마이그레이션(`drizzle-kit migrate`)은 별개 단계.

추가로 `drizzle.config.ts` 파일 자체가 WSL2 dashboard 디렉토리에 복사되지 않아, `db:migrate` 실행 시 "config file does not exist" 오류로 실패하는 2차 함정도 존재.

## 해결

### 즉시 복구 (세션 21)

```bash
# config 파일 WSL로 복사
wsl -- cp /mnt/e/00_develop/260406_luckystyle4u_server/drizzle.config.ts ~/dashboard/

# 마이그레이션 실행
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && npm run db:migrate"
# → [✓] migrations applied successfully!
```

### 배포 스크립트 개선 (권장)

`/ypserver` 스킬 또는 배포 원커맨드에 두 단계 추가:

```bash
# 기존
cp -r src . && npm install && npm run build && pm2 restart dashboard

# 개선
cp -r src . && \
  cp /mnt/e/.../drizzle.config.ts . && \
  cp /mnt/e/.../prisma/schema.prisma prisma/ && \
  npm install && \
  npm run build && \
  npm run db:migrate && \
  npx prisma migrate deploy && \
  pm2 restart dashboard
```

특히:
- `drizzle.config.ts` + `src/lib/db/migrations/*` 복사 필수 (SQLite)
- `prisma/schema.prisma` + `prisma/migrations/*` 복사 필수 (PostgreSQL, 세션 16에서도 동일 이슈 가능성)
- `npm run db:migrate` (Drizzle) 후 `npx prisma migrate deploy` (Prisma) 순서 권장

### 장기 대안 — 앱 기동 시 자동 적용

`instrumentation.ts`에서 `migrate()` 호출 추가 검토:

```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
// ...
export async function register() {
  // 기존: mkdirSync(data/)
  // 추가: 마이그레이션 자동 적용
  const db = getDb();
  migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
}
```

**단점**: 프로덕션 기동 시점에 DDL 실행 — 다중 인스턴스 배포에서 경쟁 조건 가능. 현 구조(PM2 단일 인스턴스)에선 안전하지만 확장 시 재고.

## 교훈

1. **배포 체크리스트는 "데이터 스키마" 레이어를 명시적으로 포함해야 함** — 빌드·프로세스 재시작만으로는 스키마 변경 반영 불가. Drizzle/Prisma 모두 각자의 migrate 명령이 필요.
2. **ORM 파일 복사는 src 복사와 별개로 추적** — `cp -r src`에는 포함되지만 config는 프로젝트 루트에 있어 누락되기 쉬움. 배포 스크립트에 명시적 나열.
3. **감사 로그 실패가 "조용한 반쪽 성공"을 유발** — `writeAuditLogDb` 실패 시 catch 블록이 동일 트랜잭션의 PG INSERT를 롤백하지 않아 **데이터 없음 < 로그 없음 < 데이터+로그**의 가장 나쁜 상태(데이터만 있고 로그 없음)로 수렴. 향후 설계에서 감사 로그 실패 시 어떻게 처리할지 ADR 필요.

## 관련 파일

- `drizzle.config.ts` (프로젝트 루트)
- `src/lib/db/schema.ts` (Drizzle 스키마 — audit_logs / ip_whitelist / metrics_history)
- `src/lib/db/migrations/0000_old_maverick.sql` (초기 마이그레이션)
- `src/instrumentation.ts` (세션 19 data/ mkdir 추가)
- `~/dashboard/data/dashboard.db` (WSL2 프로덕션 SQLite 파일)
- `C:/Users/smart/.claude/skills/ypserver/` (배포 스킬 — 개선 대상)
