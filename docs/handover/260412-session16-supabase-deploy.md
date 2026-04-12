# 인수인계서 — 세션 16 (Supabase 클론 배포 + 레거시 수정 + Tunnel 복구)

> 작성일: 2026-04-12
> 이전 세션: [session15](./260412-session15-supabase-clone.md)

---

## 작업 요약
세션 15에서 스캐폴드만 된 Supabase 클론(11 P0 모듈)을 프로덕션 DB/런타임에 실제로 배포했다. Prisma 증분 마이그레이션 적용, `app_readonly` PG 롤 발급, UI 패키지 설치, 12개 P0 페이지 HTTP smoke 통과. 동시에 런타임 로그에서 발견된 레거시 에러 2건(감사 로그 SQLite 디렉토리 누락, 스테일 세션 FK 위반)을 방어 수정했고, 죽어있던 Cloudflare Tunnel을 PM2로 복구했다.

## 대화 다이제스트

### 토픽 1: 사전 점검 — 세션 15 스캐폴드 상태 검증
> **사용자**: "다음 작업을 순차적으로 시작하는데... 이 작업들과 문제는 없는지 점검하면서 진행"

- `git status` / `npx tsc --noEmit` / `npx prisma validate` / 스키마(10 model + 8 enum) 1:1 일치 확인
- 발견된 문제 2건:
  1. `prisma/migrations-draft/supabase_clone_session_14.sql`이 실제 마이그레이션이 아닌 **5줄 에러 출력**(`migrate diff` 실패 로그)
  2. `all_tables_from_empty.sql`(231줄)은 **빈 DB → 전체 스키마** 스냅샷이라 기존 3 테이블(users/folders/files)과 충돌 — 증분으로 돌리면 안 됨
- **결론**: 혼동 유발 파일 삭제 + `session_14_incremental.sql` 신규 작성(7 enum + 7 테이블 + FK/index만). `app_readonly` 부재/`ENABLE_DB_BACKUPS` 미설정은 소프트 페일 — 블로커 아님 확인.

### 토픽 2: Ubuntu WSL2로 전환 + 환경 준비
> **사용자**: "지금 ubuntu 야. 실행해야될 명령을 상세하게 알려줘."

- `/mnt/e/00_develop/260406_luckystyle4u_server`에 이동, `.env`의 `DATABASE_URL`에서 Prisma 전용 쿼리 파라미터 `?schema=public`을 제거한 `PG_URL` 변수 셋업 (psql은 이 파라미터를 거부)
- `psql`의 pager(less)/heredoc 들여쓰기/붙여넣기 개행 누락 등 **인터랙티브 실행 트러블** 반복 — 작은따옴표 단일 `-c`/`--pset pager=off`/ `&&` 체인 등 방어 패턴으로 정리
- **결론**: 이후 모든 psql 호출은 `psql "$PG_URL" --pset pager=off -c '...'` 표준화.

### 토픽 3: 증분 마이그레이션 적용
- 베이스라인 확인: 3 테이블(users/folders/files) + 1 enum(Role) + 2 마이그 (init_users, add_filebox)
- `prisma/migrations/20260412120000_supabase_clone_session_14/migration.sql`에 증분 SQL 배치 후 `npx prisma migrate deploy` 실행
- **결론**: 11 테이블 + 8 enum + 3 마이그 기록 → 성공. 적용 타임스탬프 `2026-04-12 19:49:38.364161+09`.

### 토픽 4: `app_readonly` 롤 + 이중 방어 검증
- `psql` 히어닥 종료 토큰 들여쓰기 문제로 2회 실패 → 개별 `-c` 호출로 분해
- 5개 SQL 분할 실행: `CREATE ROLE NOLOGIN` (DO 블록) / `GRANT USAGE` / `GRANT SELECT ON ALL TABLES` / `ALTER DEFAULT PRIVILEGES ... GRANT SELECT` / `GRANT app_readonly TO CURRENT_USER`
- 검증: `BEGIN READ ONLY; SET LOCAL ROLE app_readonly; SELECT count(*) FROM users;` → 통과, `INSERT` → `cannot execute INSERT in a read-only transaction` 에러로 차단
- **결론**: 이중 방어 작동 확인(`BEGIN READ ONLY` + `app_readonly` 롤).

### 토픽 5: `.env` 개행 누락 버그
- `echo "ENABLE_DB_BACKUPS=true" >> .env` 후 `grep` 했더니 `JWT_V1_REFRESH_SECRET="..."ENABLE_DB_BACKUPS=true` 한 줄로 붙음 → JWT 값 파싱 오염 위험
- 원인: 이전 줄이 개행 없이 끝남 → `>>`가 그 자리에 이어붙임
- **결론**: `sed -i 's/"ENABLE_DB_BACKUPS=true/"\nENABLE_DB_BACKUPS=true/' .env`로 분리 복구. 13번 라인 단독 확인.

### 토픽 6: 빌드 + PM2 재시작 + 스모크
- `npm i @monaco-editor/react @xyflow/react elkjs` → +29 packages, −7
- `npx prisma generate` → Client 재생성
- `npx tsc --noEmit` → 에러 0
- `npm run build` → 84 라우트 컴파일 (12 신규 P0 포함)
  - 경고: `middleware → proxy` 전환 권장 (Next.js 16), Turbopack NFT 경고(`next.config.ts`→`pgdump.ts` 트레이스), `npm audit` 11건 (moderate 10, high 1)
- `pm2 restart dashboard --update-env` → pid 3040 online, `Ready in 77ms`
- 12개 P0 페이지 `curl` → 전부 `307` (로그인 리다이렉트 = 정상)
- **결론**: 프로덕션 빌드 + 런타임 smoke 통과.

### 토픽 7: 레거시 런타임 에러 2건 발견 & 수정
- `pm2 logs dashboard`에서 pre-existing 에러 2건 발견:
  1. **`P2003 folders_owner_id_fkey`** on `prisma.folder.create()` — 원인: DB 리셋/재마이그레이션 이후에도 유효한 JWT 세션의 `user.sub`가 DB에 없는 유저 참조
  2. **`Cannot open database because the directory does not exist`** — 원인: `src/lib/db/index.ts`가 `{cwd}/data/dashboard.db`를 열지만 PM2의 cwd에 `data/`가 없는 경우가 있음
- **수정**:
  - `src/lib/db/index.ts`: `fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })` 추가 (한 줄)
  - `src/lib/filebox-db.ts`: `StaleSessionError` 커스텀 에러 + `getOrCreateRootFolder`에서 `prisma.user.findUnique({ where: { id }, select: { id: true } })` 선검증, 없으면 throw
  - `src/lib/api-guard.ts`: `runHandler` 래퍼 신설 → `err.name === "StaleSessionError"`이면 `errorResponse("STALE_SESSION", ..., 401)`로 변환, 아니면 rethrow. Bearer/쿠키 두 경로 모두 적용
- `npx tsc --noEmit` → 에러 0
- **결론**: 커밋 `90c1c1e` 후 `origin/main` 푸시. 클라이언트가 스테일 토큰 보유 시 500 대신 401 받고 재로그인 유도 가능.

### 토픽 8: Cloudflare Tunnel 1033 진단 + 복구
> **사용자**: "Error 1033 Ray ID: 9eb1ca2a5c81892f ... Cloudflare is currently unable to resolve it."

- 진단: systemd에 `cloudflared.service` 없음, `ps aux | grep cloudflared`도 없음 → 데몬 미기동 상태
- 설정은 정상 (`~/.cloudflared/config.yml` + UUID `2e18470f-b351-46ab-bf07-ead0d1979fb9` + `ingress: stylelucky4u.com → http://localhost:3000`)
- 이전엔 수동 `nohup` 또는 foreground로 돌았던 것으로 추정 — Windows/셸 재시작 시 사라짐
- **결론**: `pm2 start cloudflared --name cloudflared -- tunnel run` → id 1, pid 3136, 4 connection(icn01/05/06×2 서울 리전). `pm2 save` → `~/.pm2/dump.pm2`. `curl -sI https://stylelucky4u.com` → `HTTP/2 307 → /login` 정상. 비블로커 경고 2건(ICMP ping group, UDP rmem) 무시.

### 토픽 9: 비밀번호 문의
> **사용자**: "smartkdy7@gmail.com 비번좀 알려줘."

- 메모리엔 이메일만 저장, 비밀번호는 저장하지 않음(보안). DB에도 `password_hash`만 존재하여 복원 불가
- Gmail/Cloudflare/가비아 각 서비스의 공식 재설정 루트 안내. 대시보드 관리자 계정 재설정은 `UPDATE users ... SET password_hash = ...` + bcrypt 스크립트로 가능
- **결론**: 사용자가 별도 액션 선택 전까지 대기. 세션 종료 요청으로 전환.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 증분 마이그레이션을 **수동 작성** | (a) `migrate diff --from-migrations` with shadow DB, (b) `migrate diff --from-config-datasource` with live DB, (c) 수동 추출 | WSL2 PG는 Windows 쪽에서 도달 불가 + shadow DB URL 미설정 → 수동이 가장 빠르고 안전. 적용 후 `migrate deploy`로 Prisma가 `_prisma_migrations`에 정상 기록 |
| 2 | 레거시 에러 2건을 **별도 커밋으로 분리** | 세션 15 배포에 합칠까 vs 분리 | 원인이 Session 14 이전부터 있던 버그 — 스코프 분리 유지. 커밋 `90c1c1e`로 독립 |
| 3 | `StaleSessionError`를 `filebox-db.ts`에 정의 + `err.name` 체크로 `api-guard.ts`에서 매핑 | (a) 공용 `lib/errors.ts` 신설, (b) import cycle 감수하고 instanceof | 스코프 최소화. `err.name` 문자열 체크는 직렬화/번들러 경계도 안전. 공용 에러 모듈은 추후 필요 시 승격 |
| 4 | `cloudflared`를 **PM2에 등록** | systemd 유닛 작성 vs PM2 | WSL2 시스템드는 수동 셋업 필요 + 기존 dashboard도 PM2 관리 → 운영 일관성. `pm2 save`로 dump 저장, 향후 `pm2 resurrect`로 복원 가능 |
| 5 | Vercel 플러그인 스킬(bootstrap/vercel-sandbox/vercel-functions/vercel-storage/next-forge/nextjs/next-upgrade/chat-sdk/ai-sdk 등) 일괄 스킵 | 프롬프트 훅이 강제 주입 | 본 프로젝트는 자체 호스팅(WSL2+PM2+Cloudflare Tunnel), ADR-002가 Vercel 미사용 명시 → 전부 false positive |

## 수정 파일 (3개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/db/index.ts` | better-sqlite3 연결 전 `fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })` 추가 |
| 2 | `src/lib/filebox-db.ts` | `StaleSessionError` 클래스 + `getOrCreateRootFolder`에서 user 존재 선검증 후 throw |
| 3 | `src/lib/api-guard.ts` | `runHandler` 래퍼로 try/catch, `StaleSessionError` → 401 `STALE_SESSION` 응답 매핑 (Bearer/쿠키 세션 양쪽) |

## 상세 변경 사항

### 1. `src/lib/db/index.ts` — 감사 로그 SQLite 디렉토리 자동 생성
```ts
import fs from 'fs';
// ...
if (!_db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  // ...
}
```

### 2. `src/lib/filebox-db.ts` — 스테일 세션 차단
```ts
export class StaleSessionError extends Error {
  constructor(userId: string) {
    super(`세션 유저(${userId})가 DB에 존재하지 않습니다. 재로그인이 필요합니다.`);
    this.name = "StaleSessionError";
  }
}

export async function getOrCreateRootFolder(userId: string) {
  const existing = await prisma.folder.findFirst({ where: { ownerId: userId, isRoot: true } });
  if (existing) return existing;

  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!userExists) throw new StaleSessionError(userId);

  return prisma.folder.create({ data: { name: "내 파일", ownerId: userId, isRoot: true, parentId: null } });
}
```

### 3. `src/lib/api-guard.ts` — StaleSessionError → 401 변환
```ts
async function runHandler(handler, request, user, context) {
  try {
    return await handler(request, user, context);
  } catch (err) {
    if (err instanceof Error && err.name === "StaleSessionError") {
      return errorResponse("STALE_SESSION", err.message, 401);
    }
    throw err;
  }
}
// withAuth가 handler 대신 runHandler를 호출
```

## 검증 결과
- `npx prisma validate` → 유효
- `npx tsc --noEmit` → 에러 0
- `npm run build` → 84 라우트 컴파일, `Compiled successfully`
- PG `\dt` → 11 테이블, `\dT` → 8 enum, `_prisma_migrations` 3 행
- `BEGIN READ ONLY; SET LOCAL ROLE app_readonly; INSERT ...;` → 차단 정상
- 12개 P0 페이지 `curl -I http://localhost:3000/*` → 전부 `307 /login`
- `curl -sI https://stylelucky4u.com` → `HTTP/2 307 → /login` (Tunnel → WSL2 통신 OK)
- `cloudflared` → 4 connection registered (icn01/05/06×2)

## 터치하지 않은 영역
- **UI 고도화**: monaco/xyflow 패키지는 설치만 — 실제 `/sql-editor` textarea → monaco, `/database/schema` 카드 그리드 → xyflow 치환은 차기 세션
- **브라우저 수동 E2E**: 스모크는 HTTP 상태만. 각 페이지 로그인 후 기능 검증은 차기
- **middleware → proxy 리네임**: Next.js 16 deprecation 경고 해결 보류
- **`npm audit`** 11건 취약점(moderate 10, high 1)
- **Turbopack NFT 경고** (`next.config.ts` → `pgdump.ts` 전체 트레이스)
- **Cron 부트스트랩 명시화**: `src/lib/cron/registry.ts`의 `ensureStarted()` 첫 API 호출 의존 패턴 그대로

## 알려진 이슈
- **Cloudflare Tunnel ICMP 경고**: `Group ID 1000 is not between ping group` → HTTP 터널엔 영향 없음
- **Cloudflare Tunnel UDP rmem 경고**: QUIC 대용량 전송 시 성능 저하 가능 — `sysctl -w net.core.rmem_max=7500000` 고려
- **middleware 경고 (Next.js 16)**: 런타임 동작엔 문제 없음, 향후 버전 호환 대비 필요
- **PM2 `pm2 save` 생존 범위**: WSL2는 systemd 기본 비활성이라 Windows 재시작 시 PM2 데몬 자체가 사라질 수 있음 → `pm2 resurrect`를 자동화하려면 `~/.bashrc`에 등록 또는 `pm2 startup` + WSL systemd 유효화 검토

## 다음 작업 제안

### 우선순위 A (즉시)
1. **브라우저 로그인 후 12개 P0 페이지 수동 E2E**: 각 페이지 실제 데이터 페치/빈 상태 UI/에러 없음 검증
2. **SQL Editor monaco 전환**: `src/app/sql-editor/page.tsx` textarea → `@monaco-editor/react`
3. **Schema Visualizer xyflow 전환**: `src/app/database/schema/page.tsx` 카드 그리드 → `@xyflow/react` + elkjs 자동 레이아웃

### 우선순위 B (차기 세션)
4. **middleware → proxy 리네임** (Next.js 16 deprecation 해결)
5. **`npm audit` 취약점 정리**
6. **Turbopack NFT 경고 처리**: `src/lib/backup/pgdump.ts`의 fs 연산에 `turbopackIgnore` 주석 또는 static scope 이동
7. **PM2 `startup` + WSL systemd 활성화** (재부팅 자동 복원)

### 우선순위 C (마스터 계획)
- Phase 14a: TanStack Table Editor (DB 테이블 브라우저)
- Phase 14b: CRUD 에디터 (행 추가/수정/삭제)
- Phase 15a~c: 파일 매니저 강화 / 알림 시스템 / shadcn/ui 점진 전환

## 로그/아티팩트

- 상세 로그: [logs/2026-04.md](../logs/2026-04.md) 세션 16 블록
- 마이그레이션: `prisma/migrations/20260412120000_supabase_clone_session_14/migration.sql` (세션 15 커밋 `198f467` 포함, 세션 16에서 적용)
- PG 이력: `_prisma_migrations` 테이블, applied at `2026-04-12 19:49:38 KST`
- PM2 dump: `~/.pm2/dump.pm2`

---
[← handover/_index.md](./_index.md)
