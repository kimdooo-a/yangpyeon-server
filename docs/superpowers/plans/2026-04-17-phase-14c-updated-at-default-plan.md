# Phase 14c 1순위 — @updatedAt DB DEFAULT 병기 + 4테이블 신규 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prisma `@updatedAt` 어노테이션이 DB DEFAULT를 생성하지 않아 Phase 14b raw SQL INSERT가 500을 반환하는 버그를 단일 마이그레이션으로 근본 수정하고, curl E2E 매트릭스로 UI "keep" 기본값 실사용자 경로까지 검증한다.

**Architecture:**
- `prisma/schema.prisma`의 5개 `@updatedAt` 필드에 `@default(now())` 병기(기존 모델) + 4개 모델(File/Webhook/ApiKey/LogDrain)에 `updatedAt` 필드 신규 추가.
- Prisma `migrate dev --create-only`로 DDL 자동 생성 후 B2 백필(`updated_at = created_at`) UPDATE 4줄 수동 추가.
- `/ypserver prod`로 WSL2 빌드/재기동 + `prisma migrate deploy`로 DDL 적용 + curl E2E 11개 시나리오(S8a~S11 + 신규 S8d/S8e)로 회귀 제로 확인.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL, WSL2 PM2, Cloudflare Tunnel (우회: WSL localhost).

**Spec:** `docs/superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md`

**사전 준비 — 로그인 크리덴셜을 환경변수로 설정** (WSL 셸에서 E2E 작업 전 1회):

```bash
export DASH_EMAIL="kimdooo@stylelucky4u.com"
export DASH_PASS="Knp13579!yan"
export DASH_BASE="http://localhost:3000"
```

크리덴셜 출처: `docs/handover/next-dev-prompt.md` L25. WSL 내 bash에서 실행. `DASH_BASE`는 Cloudflare Tunnel 530 우회용 WSL localhost.

**Tasks 6–11은 동일한 WSL 셸 세션에서 연속 실행하거나, 아래 ID를 `/tmp` 파일로 persist한다.** Fresh subagent per task 실행 시 `$NEW_FOLDER_ID`, `$OWNER_ID`, `$ACCESS_TOKEN` 등이 휘발하므로 각 Task 도입부에서 `cat /tmp/<var>.txt`로 복원하는 단계를 포함시킨다. 아래 Task들은 file persistence 방식으로 작성돼 있어 subagent 방식에도 안전.

---

## Task 1: `prisma/schema.prisma` 9개 모델 변경

**Files:**
- Modify: `prisma/schema.prisma:20` (User — `@default(now())` 병기)
- Modify: `prisma/schema.prisma:41` (Folder — 병기)
- Modify: `prisma/schema.prisma:57` (File — `updatedAt` 필드 신규)
- Modify: `prisma/schema.prisma:83` (SqlQuery — 병기)
- Modify: `prisma/schema.prisma:101` (EdgeFunction — 병기)
- Modify: `prisma/schema.prisma:134` (Webhook — 신규)
- Modify: `prisma/schema.prisma:150` (CronJob — 병기)
- Modify: `prisma/schema.prisma:167` (ApiKey — 신규)
- Modify: `prisma/schema.prisma:183` (LogDrain — 신규)

- [ ] **Step 1: User 모델 병기**

Line 20 편집:
```
-  updatedAt     DateTime       @updatedAt @map("updated_at")
+  updatedAt     DateTime       @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 2: Folder 모델 병기**

Line 41 편집:
```
-  updatedAt DateTime @updatedAt @map("updated_at")
+  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 3: File 모델에 `updatedAt` 신규 추가**

Line 57 `createdAt` 바로 다음에 추가:
```
   createdAt    DateTime @default(now()) @map("created_at")
+  updatedAt    DateTime @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 4: SqlQuery 모델 병기**

Line 83 편집:
```
-  updatedAt DateTime   @updatedAt @map("updated_at")
+  updatedAt DateTime   @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 5: EdgeFunction 모델 병기**

Line 101 편집:
```
-  updatedAt   DateTime          @updatedAt @map("updated_at")
+  updatedAt   DateTime          @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 6: Webhook 모델에 `updatedAt` 신규 추가**

Line 134 `createdAt` 바로 다음에 추가:
```
   createdAt       DateTime     @default(now()) @map("created_at")
+  updatedAt       DateTime     @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 7: CronJob 모델 병기**

Line 150 편집:
```
-  updatedAt  DateTime @updatedAt @map("updated_at")
+  updatedAt  DateTime @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 8: ApiKey 모델에 `updatedAt` 신규 추가**

Line 167 `createdAt` 바로 다음에 추가:
```
   createdAt  DateTime   @default(now()) @map("created_at")
+  updatedAt  DateTime   @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 9: LogDrain 모델에 `updatedAt` 신규 추가**

Line 183 `createdAt` 바로 다음에 추가:
```
   createdAt       DateTime  @default(now()) @map("created_at")
+  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at")
```

- [ ] **Step 10: 변경 검증 — grep count**

Run (Windows Git Bash 또는 WSL):
```bash
grep -c "@updatedAt" prisma/schema.prisma
```
Expected: `9`

Run:
```bash
grep -c "@default(now()) @updatedAt" prisma/schema.prisma
```
Expected: `9`

수치 불일치 시 누락 모델 역추적 후 수정.

- [ ] **Step 11: Prisma format & 스키마 구문 검증**

Run:
```bash
npx prisma format
npx prisma validate
```
Expected: `validate` 종료 코드 0, format 종료 후 의미 없는 공백 변화만 있어야 함. 의미 있는 diff 발생 시 재검토.

- [ ] **Step 12: Commit — schema only (마이그레이션과 분리)**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): Phase 14c — @updatedAt 5병기 + 4모델(File/Webhook/ApiKey/LogDrain) updatedAt 신규"
```

---

## Task 2: 마이그레이션 생성 + B2 백필 수동 편집 + 커밋

**Files:**
- Create: `prisma/migrations/<timestamp>_add_updated_at_default/migration.sql` (Prisma 자동 생성)
- Modify: 위 `migration.sql` (B2 UPDATE 4줄 수동 추가)

- [ ] **Step 1: `--create-only` 플래그로 마이그레이션 SQL만 생성**

Run (WSL 또는 DATABASE_URL 접근 가능한 환경에서):
```bash
npx prisma migrate dev --name "add_updated_at_default" --create-only
```
Expected: `prisma/migrations/YYYYMMDDHHMMSS_add_updated_at_default/migration.sql` 생성. 터미널 메시지 "Prisma Migrate created the following migration without applying it".

DB 연결 실패 시: DATABASE_URL이 WSL PostgreSQL을 가리키는지 확인 (`.env` 또는 shell env). Prisma `migrate dev`는 shadow DB를 요구하므로 DB 접근 필수.

- [ ] **Step 2: 생성된 migration.sql 검수**

Run:
```bash
cat prisma/migrations/*add_updated_at_default/migration.sql
```
Expected 내용(순서는 Prisma가 결정, 테이블 이름 기준):
```sql
-- AlterTable (5개)
ALTER TABLE "users"          ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "folders"        ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sql_queries"    ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "edge_functions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cron_jobs"      ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable (4개 신규 컬럼)
ALTER TABLE "files"      ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "webhooks"   ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "api_keys"   ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "log_drains" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

총 9개 `ALTER TABLE`. Prisma는 관계없는 Drop/변경을 포함할 수 있으므로 **9개 외의 DDL이 있으면 검수 후 결정** (정당하면 유지, 의도 외 변경이면 schema.prisma 재검토).

- [ ] **Step 3: B2 백필 UPDATE 4줄을 migration.sql 하단에 수동 추가**

파일 맨 아래에 다음 블록 추가:
```sql

-- ────────────────────────────────────────────────────────────
-- manual-edit included: B2 백필 (기존 행의 updated_at을 created_at으로 정렬)
-- Reason: ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP는 기존 행 전부에
--         마이그레이션 실행 시각을 보이게 만듦(B1 효과). B2 의미를 얻기 위해
--         명시적으로 created_at으로 덮어씀. 신규 INSERT는 계속 DEFAULT=NOW.
-- Related spec: docs/superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md
-- ────────────────────────────────────────────────────────────
UPDATE "files"      SET "updated_at" = "created_at";
UPDATE "webhooks"   SET "updated_at" = "created_at";
UPDATE "api_keys"   SET "updated_at" = "created_at";
UPDATE "log_drains" SET "updated_at" = "created_at";
```

- [ ] **Step 4: 수동 편집 결과 재검수**

Run:
```bash
cat prisma/migrations/*add_updated_at_default/migration.sql
```
Expected: 9개 `ALTER TABLE` + 4개 `UPDATE` + 주석 블록. 총 13개 실행 가능 SQL 문.

- [ ] **Step 5: (선택) 로컬 DB에 적용 — 로컬 PostgreSQL이 있을 때만**

Run:
```bash
npx prisma migrate dev
```
Expected: "1 migration found", 적용 성공, Prisma 클라이언트 재생성.

로컬 DB 없으면 이 단계 스킵. WSL2 배포 단계(Task 4)에서 `prisma migrate deploy`로 최초 적용됨.

- [ ] **Step 6: Commit — migration**

```bash
git add prisma/migrations/
git commit -m "feat(db): Phase 14c 마이그레이션 — 9개 모델 updated_at DEFAULT + B2 백필"
```

---

## Task 3: `/ypserver` 스킬의 `prisma migrate deploy` 포함 여부 확인

배포 실패 예방용 사전 점검. 미포함 시 수동 보완 단계를 Task 4에 포함.

**Files:**
- Read-only: `~/.claude/skills/ypserver/SKILL.md` (글로벌 스킬 정의)

- [ ] **Step 1: ypserver 스킬 정의 확인**

Run (Windows Git Bash):
```bash
grep -l "prisma migrate\|db:migrate" ~/.claude/skills/ypserver/*.md 2>/dev/null || echo "NOT_FOUND"
```
Expected: 스킬 파일 경로 출력 또는 `NOT_FOUND`.

- [ ] **Step 2: 결과에 따라 배포 절차 결정**

- 스킬에 `prisma migrate deploy` 포함: Task 4 Step 1만 실행.
- 미포함: Task 4 Step 2의 수동 보완 단계 포함.

판단 결과를 아래 체크박스 중 하나에 기록:
- [ ] (A) /ypserver에 migrate deploy 포함됨 — Task 4에서 추가 작업 불필요
- [ ] (B) 미포함 — Task 4에서 WSL 수동 `npx prisma migrate deploy` 실행 필요

---

## Task 4: 배포 — `/ypserver prod` + (필요 시) 수동 `prisma migrate deploy`

**Files:**
- None (Bash/Skill 실행만)

- [ ] **Step 1: `/ypserver prod` 실행**

Claude Code 프롬프트에서:
```
/ypserver prod
```
Expected: WSL2에 소스 복사 → `npm install` → `npm run build`(33 라우트 포함) → `pm2 restart dashboard` 정상 종료. 실패 시 로그 확인 후 원인별 대응.

- [ ] **Step 2: (Task 3 결과 B인 경우) WSL에서 수동 `prisma migrate deploy`**

Run:
```bash
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && npx prisma migrate deploy"
```
Expected: "1 migration found", "Applying migration `YYYYMMDDHHMMSS_add_updated_at_default`", 적용 성공. `Database has X migrations applied` 메시지.

실패 시: `drizzle.config.ts` 누락(세션 21 선례)처럼 `prisma/` 디렉토리가 WSL에 복사되지 않았을 가능성. 수동 복사 후 재시도:
```bash
wsl -e bash -c "cp -r /mnt/e/00_develop/260406_luckystyle4u_server/prisma ~/dashboard/ && cd ~/dashboard && npx prisma migrate deploy"
```

- [ ] **Step 3: PM2 상태 확인**

Run:
```bash
wsl -e bash -c "pm2 status"
```
Expected: `dashboard` 프로세스 `online`, uptime 초 단위(재시작 직후).

---

## Task 5: 배포 후 DDL/DML 검증 — WSL psql

**Files:**
- None (psql 쿼리만)

- [ ] **Step 1: 5개 기존 모델 + 4개 신규 컬럼 DEFAULT 일괄 확인**

Run (WSL 내, PostgreSQL 접속 정보는 `.env`의 `DATABASE_URL` 참조). 9개 테이블을 단일 호출로 검증:
```bash
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c \"
SELECT table_name, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'updated_at'
  AND table_name IN ('users','folders','sql_queries','edge_functions','cron_jobs',
                     'files','webhooks','api_keys','log_drains')
ORDER BY table_name;
\""
```
Expected: 9행 반환. 모든 행의 `is_nullable`=`NO`, `column_default`=`CURRENT_TIMESTAMP`. 9행 미만이면 누락 모델의 마이그레이션 적용 실패 — Task 4 로그 재검토.

- [ ] **Step 2: 5개 기존 모델 `\d` 상세 재확인 (반복 명시)**

개별 테이블의 full schema 출력으로 의도 외 변화 여부 재확인:
```bash
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d users' | grep updated_at"
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d folders' | grep updated_at"
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d sql_queries' | grep updated_at"
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d edge_functions' | grep updated_at"
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d cron_jobs' | grep updated_at"
```
Expected (각 호출): `updated_at | timestamp(3) without time zone | not null | CURRENT_TIMESTAMP`.

- [ ] **Step 3: 4개 신규 컬럼 테이블 `\d` 재확인**

```bash
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d files' | grep updated_at"
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d webhooks' | grep updated_at"
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d api_keys' | grep updated_at"
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c '\\d log_drains' | grep updated_at"
```
Expected (각 호출): `updated_at | timestamp(3) without time zone | not null | CURRENT_TIMESTAMP`.

- [ ] **Step 4: 백필 검증 — `updated_at = created_at` 행 수**

Run:
```bash
wsl -e bash -c "cd ~/dashboard && psql \"\$DATABASE_URL\" -c \"
SELECT
  (SELECT COUNT(*) FROM files      WHERE updated_at = created_at) AS files_match,
  (SELECT COUNT(*) FROM webhooks   WHERE updated_at = created_at) AS webhooks_match,
  (SELECT COUNT(*) FROM api_keys   WHERE updated_at = created_at) AS api_keys_match,
  (SELECT COUNT(*) FROM log_drains WHERE updated_at = created_at) AS log_drains_match,
  (SELECT COUNT(*) FROM files) AS files_total,
  (SELECT COUNT(*) FROM webhooks) AS webhooks_total,
  (SELECT COUNT(*) FROM api_keys) AS api_keys_total,
  (SELECT COUNT(*) FROM log_drains) AS log_drains_total;
\""
```
Expected: 각 `*_match`가 해당 `*_total`과 동일. 백필 직후 UPDATE가 발생했다면 `match < total` 허용 (실무 상 드물지만 이후 실제 업데이트로 갱신되면 정상).

불일치 시: B2 UPDATE가 실행되지 않은 것. `SELECT column_default FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'updated_at'`로 DEFAULT만 적용됐는지 재확인 후 수동 `UPDATE ... SET updated_at = created_at` 실행.

---

## Task 6: E2E 로그인 — `dashboard_session` 쿠키 획득

**Files:**
- Create: `/tmp/dash-cookie.txt` (WSL 임시 파일, 쿠키 저장)

- [ ] **Step 1: accessToken 발급**

Run (WSL에서, DASH_EMAIL/DASH_PASS 환경변수 설정 완료 상태):
```bash
ACCESS_TOKEN=$(curl -s -X POST "$DASH_BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$DASH_EMAIL\",\"password\":\"$DASH_PASS\"}" \
  | jq -r '.data.accessToken')
echo "Token length: ${#ACCESS_TOKEN}"
```
Expected: Token length > 100 (JWT). `null` 또는 0이면 크리덴셜 또는 서버 오류.

- [ ] **Step 2: `dashboard_session` 쿠키 설정**

Run:
```bash
curl -s -c /tmp/dash-cookie.txt -X POST "$DASH_BASE/api/auth/login-v2" \
  -H "Content-Type: application/json" \
  -d "{\"accessToken\":\"$ACCESS_TOKEN\"}" -o /dev/null
grep dashboard_session /tmp/dash-cookie.txt
```
Expected: `dashboard_session` 쿠키 라인 출력 (값 있음, `#HttpOnly_localhost` 접두어).

- [ ] **Step 3: 쿠키로 인증 확인**

Run:
```bash
curl -s -b /tmp/dash-cookie.txt "$DASH_BASE/api/auth/me" | jq '.data.user.email'
```
Expected: `"kimdooo@stylelucky4u.com"`.

실패 시(`null` 또는 401): 로그인 경로 재시도. CSRF는 v1 Bearer 경로에서 면제되므로 추가 토큰 불필요.

---

## Task 7: E2E S8a — `folders` INSERT (UI "keep" 기본값 흉내) ⭐

세션 22 500 버그가 해결됐는지 검증하는 **핵심 시나리오**. `updated_at`을 payload에서 생략.

**Files:**
- None (curl 실행만)

- [ ] **Step 1: 자신의 user ID 획득 + 파일 persist**

Run:
```bash
OWNER_ID=$(curl -s -b /tmp/dash-cookie.txt "$DASH_BASE/api/auth/me" | jq -r '.data.user.id')
echo "$OWNER_ID" > /tmp/owner_id.txt
echo "owner_id: $OWNER_ID"
```
Expected: UUID 형식(36자). `/tmp/owner_id.txt`에 저장됨 → 다른 task에서 `$(cat /tmp/owner_id.txt)`로 복원 가능.

- [ ] **Step 2: 새 folder id 생성 + 파일 persist**

Run:
```bash
NEW_FOLDER_ID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || uuidgen)
echo "$NEW_FOLDER_ID" > /tmp/new_folder_id.txt
echo "new folder id: $NEW_FOLDER_ID"
```
Expected: UUID 36자. `/tmp/new_folder_id.txt`에 저장.

- [ ] **Step 3: INSERT — `updated_at` 생략 payload로 POST**

Run:
```bash
curl -s -b /tmp/dash-cookie.txt -X POST "$DASH_BASE/api/v1/tables/folders" \
  -H "Content-Type: application/json" \
  -d "{
    \"values\": {
      \"id\":       {\"action\":\"set\",\"value\":\"$NEW_FOLDER_ID\"},
      \"name\":     {\"action\":\"set\",\"value\":\"phase14c-test-folder\"},
      \"owner_id\": {\"action\":\"set\",\"value\":\"$OWNER_ID\"},
      \"is_root\":  {\"action\":\"set\",\"value\":false}
    }
  }" | jq
```
Expected: `{ "success": true, "data": { ... id: "$NEW_FOLDER_ID", updated_at: "<ISO timestamp>" ... } }`. HTTP 200.

버그 재현(세션 22 결과): `{ "success": false, "error": { "code": "QUERY_FAILED", "message": "null value in column \"updated_at\" ..." } }` HTTP 500 — 이 응답이 나오면 Task 4/5 재검토.

---

## Task 8: E2E S8b/S8c — `folders` PATCH + DELETE

**Files:**
- Read: `/tmp/new_folder_id.txt` (Task 7에서 persist)

- [ ] **Step 1: ID 복원 + PATCH (name 변경)**

Run:
```bash
NEW_FOLDER_ID=$(cat /tmp/new_folder_id.txt)
curl -s -b /tmp/dash-cookie.txt -X PATCH "$DASH_BASE/api/v1/tables/folders/$NEW_FOLDER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "values": {
      "name": {"action":"set","value":"phase14c-test-folder-updated"}
    }
  }' | jq
```
Expected: `{ "success": true, "data": { name: "phase14c-test-folder-updated", ... } }` HTTP 200.

- [ ] **Step 2: DELETE**

Run:
```bash
NEW_FOLDER_ID=$(cat /tmp/new_folder_id.txt)
curl -s -b /tmp/dash-cookie.txt -X DELETE "$DASH_BASE/api/v1/tables/folders/$NEW_FOLDER_ID" | jq
```
Expected: `{ "success": true, "data": { "deleted": true } }` HTTP 200.

---

## Task 9: E2E S9 — 감사 로그 3건 신규 기록 확인

**Files:**
- None

- [ ] **Step 1: 최근 audit 로그 조회**

Run:
```bash
curl -s -b /tmp/dash-cookie.txt "$DASH_BASE/api/v1/audit?limit=10" \
  | jq '.data.rows[] | select(.action | startswith("TABLE_ROW_")) | {action, detail: (.detail | fromjson? | .table)}' \
  | head -30
```
Expected: `TABLE_ROW_INSERT`, `TABLE_ROW_UPDATE`, `TABLE_ROW_DELETE` 각 1건 (최근 수분 내). `detail.table`이 `folders`.

3건 미만: Task 7/8이 실패했거나 감사 로그 기록 누락. 원인 조사 후 Task 7부터 재실행.

---

## Task 10: E2E S10/S11 — 차단 시나리오

**Files:**
- None

- [ ] **Step 1: S10 — users INSERT 차단 확인**

Run:
```bash
curl -s -b /tmp/dash-cookie.txt -X POST "$DASH_BASE/api/v1/tables/users" \
  -H "Content-Type: application/json" \
  -d '{"values":{"email":{"action":"set","value":"blocked@test.local"}}}' | jq
```
Expected: `{ "success": false, "error": { "code": "OPERATION_DENIED", "message": "전용 페이지를 사용하세요" } }` HTTP 403.

- [ ] **Step 2: S11a — SQL 인젝션 차단 (테이블명)**

Run:
```bash
curl -s -b /tmp/dash-cookie.txt -X POST "$DASH_BASE/api/v1/tables/folders;DROP%20TABLE%20x" \
  -H "Content-Type: application/json" -d '{"values":{}}' | jq
```
Expected: `{ "success": false, "error": { "code": "INVALID_TABLE" } }` HTTP 400.

- [ ] **Step 3: S11b — edge_function_runs DELETE-only 정책**

Run:
```bash
curl -s -b /tmp/dash-cookie.txt -X POST "$DASH_BASE/api/v1/tables/edge_function_runs" \
  -H "Content-Type: application/json" -d '{"values":{}}' | jq
```
Expected: `{ "success": false, "error": { "code": "OPERATION_DENIED", "message": "삭제만 가능" } }` HTTP 403.

---

## Task 11: E2E S8d/S8e — 신규 컬럼 테이블 INSERT 스모크

Task 7과 동일한 원리 — `updated_at` 생략 payload가 200을 받아야 함.

**Files:**
- None

- [ ] **Step 1: S8d — `webhooks` INSERT**

Run:
```bash
NEW_WH_ID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || uuidgen)
echo "$NEW_WH_ID" > /tmp/new_wh_id.txt
curl -s -b /tmp/dash-cookie.txt -X POST "$DASH_BASE/api/v1/tables/webhooks" \
  -H "Content-Type: application/json" \
  -d "{
    \"values\": {
      \"id\":           {\"action\":\"set\",\"value\":\"$NEW_WH_ID\"},
      \"name\":         {\"action\":\"set\",\"value\":\"phase14c-test-webhook\"},
      \"source_table\": {\"action\":\"set\",\"value\":\"folders\"},
      \"event\":        {\"action\":\"set\",\"value\":\"INSERT\"},
      \"url\":          {\"action\":\"set\",\"value\":\"https://example.local/hook\"}
    }
  }" | jq
```
Expected: `{ "success": true, "data": { id: "$NEW_WH_ID", updated_at: "<ISO>", created_at: "<ISO>" } }` HTTP 200.

- [ ] **Step 2: S8d 정리 — DELETE**

Run:
```bash
NEW_WH_ID=$(cat /tmp/new_wh_id.txt)
curl -s -b /tmp/dash-cookie.txt -X DELETE "$DASH_BASE/api/v1/tables/webhooks/$NEW_WH_ID" | jq
```
Expected: `{ "success": true, "data": { "deleted": true } }`.

- [ ] **Step 3: S8e — `log_drains` INSERT**

Run:
```bash
NEW_LD_ID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || uuidgen)
echo "$NEW_LD_ID" > /tmp/new_ld_id.txt
curl -s -b /tmp/dash-cookie.txt -X POST "$DASH_BASE/api/v1/tables/log_drains" \
  -H "Content-Type: application/json" \
  -d "{
    \"values\": {
      \"id\":   {\"action\":\"set\",\"value\":\"$NEW_LD_ID\"},
      \"name\": {\"action\":\"set\",\"value\":\"phase14c-test-drain\"},
      \"type\": {\"action\":\"set\",\"value\":\"HTTP\"},
      \"url\":  {\"action\":\"set\",\"value\":\"https://example.local/drain\"}
    }
  }" | jq
```
Expected: HTTP 200 + row 반환.

- [ ] **Step 4: S8e 정리 — DELETE**

Run:
```bash
NEW_LD_ID=$(cat /tmp/new_ld_id.txt)
curl -s -b /tmp/dash-cookie.txt -X DELETE "$DASH_BASE/api/v1/tables/log_drains/$NEW_LD_ID" | jq
```
Expected: `{ "success": true, "data": { "deleted": true } }`.

---

## Task 12: `docs/solutions` 해결됨 마커 + 커밋

**Files:**
- Modify: `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` (하단에 "## 해결" 섹션 추가)
- Modify: `docs/guides/tables-e2e-manual.md` (S8 매뉴얼의 `updated_at` 각주 제거)

- [ ] **Step 1: 솔루션 문서에 해결 섹션 추가**

`docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` 맨 아래에 추가:
```markdown

## 해결 — 세션 23 (2026-04-17)

Phase 14c 1순위 spec/plan으로 근본 수정 적용 완료.

- **마이그레이션**: `prisma/migrations/<timestamp>_add_updated_at_default/migration.sql`
- **변경**: 5개 기존 모델 `@default(now())` 병기 + 4개 모델(File/Webhook/ApiKey/LogDrain) `updatedAt` 신규 + B2 백필 UPDATE 4줄
- **검증**: curl E2E S8a(updated_at 생략 payload) 200 통과, S8b~S11 + 신규 S8d/S8e 전 매트릭스 통과, audit_logs TABLE_ROW_* 3건 영속
- **관련 spec**: `docs/superpowers/specs/2026-04-17-phase-14c-updated-at-default-design.md`
- **관련 plan**: `docs/superpowers/plans/2026-04-17-phase-14c-updated-at-default-plan.md`

RowFormModal "keep" 기본값으로도 실사용자가 "행 추가" 시 500을 받지 않음.
```

- [ ] **Step 2: tables-e2e-manual.md의 `updated_at` 각주 확인/제거**

Run:
```bash
grep -n "updated_at\|updatedAt" docs/guides/tables-e2e-manual.md
```
관련 각주가 있으면 제거 (Phase 14c fix로 더 이상 필요 없음). 없으면 스킵.

- [ ] **Step 3: Commit docs**

```bash
git add docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md docs/guides/tables-e2e-manual.md
git commit -m "docs(14c): @updatedAt 버그 해결 마커 + E2E 매뉴얼 각주 정리"
```

---

## Task 13: 세션 종료 — `/cs` 스킬

**Files:**
- Modify: `docs/status/current.md` (세션 23 요약표 행 추가)
- Create: `docs/handover/260417-session23-phase-14c-updated-at-fix.md`
- Modify: `docs/handover/next-dev-prompt.md` (Phase 14c 본 작업으로 포인터 이동)
- Modify: `docs/logs/journal-2026-04-17.md` (세션 23 토픽 append)
- Modify: `docs/logs/2026-04.md` (세션 23 요약)
- Modify: `docs/handover/_index.md` (세션 23 등록)

- [ ] **Step 1: 세션 종료 스킬 실행**

Claude Code 프롬프트에서:
```
/cs
```
Expected: 세션 저널 취합, current.md 요약표 1행 추가, logs/ 상세 기록, handover 작성, next-dev-prompt 갱신. 모두 자동.

- [ ] **Step 2: 생성/변경 문서 확인 + 커밋**

Run:
```bash
git status
```
변경 파일 확인 후:
```bash
git add docs/
git commit -m "docs(14c): 세션 23 /cs — @updatedAt fix 완료 + handover/next-dev-prompt 갱신"
```

- [ ] **Step 3: 원격 푸시 (선택)**

```bash
git push origin main
```
Expected: 2~3 커밋이 원격에 반영. 프로덕션은 이미 배포 완료 상태.

---

## 실행 완료 조건 (DOD)

모든 체크박스가 [x]로 변경되면 Phase 14c 1순위 종결.

- [x] 디자인 spec 작성 완료 (이 plan의 전제)
- [ ] Task 1: schema.prisma 9개 모델 변경 + 커밋
- [ ] Task 2: 마이그레이션 생성 + B2 백필 수동 추가 + 커밋
- [ ] Task 3: /ypserver 스킬 사전 점검
- [ ] Task 4: /ypserver prod + (필요 시) 수동 prisma migrate deploy
- [ ] Task 5: WSL psql로 DDL + 백필 검증
- [ ] Task 6: 로그인 → dashboard_session 쿠키 확보
- [ ] Task 7: S8a INSERT (updated_at 생략) 200 ⭐ 핵심
- [ ] Task 8: S8b PATCH + S8c DELETE 200
- [ ] Task 9: TABLE_ROW_* 감사 로그 3건 확인
- [ ] Task 10: S10/S11 차단 시나리오 403/400
- [ ] Task 11: S8d webhooks + S8e log_drains INSERT 200
- [ ] Task 12: docs/solutions 해결됨 마커 + 커밋
- [ ] Task 13: /cs 세션 종료 + 원격 푸시

---

## 롤백 메모

배포 후 문제 발견 시:

**1. 마이그레이션 자체 실패**
```bash
npx prisma migrate resolve --rolled-back <migration_name>
```
WSL psql에서 수동 역변경:
```sql
ALTER TABLE "users"          ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "folders"        ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "sql_queries"    ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "edge_functions" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "cron_jobs"      ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "files"      DROP COLUMN "updated_at";
ALTER TABLE "webhooks"   DROP COLUMN "updated_at";
ALTER TABLE "api_keys"   DROP COLUMN "updated_at";
ALTER TABLE "log_drains" DROP COLUMN "updated_at";
```

**2. 애플리케이션 레벨 문제**
```bash
git revert <schema commit> <migration commit>
npx prisma generate
# /ypserver prod 재배포
```

**3. 부분 롤백 — 특정 모델만 문제**
해당 모델의 DEFAULT/COLUMN만 drop. 전체 마이그레이션 롤백 불필요.
