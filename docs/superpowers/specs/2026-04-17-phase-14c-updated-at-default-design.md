---
title: Phase 14c 1순위 — `@updatedAt` DB DEFAULT 병기 + 4개 테이블 `updated_at` 신규 추가
date: 2026-04-17
session: 23 (예정)
status: design-approved
authors: [kimdooo-a]
related:
  - docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md
  - docs/handover/260417-session22-phase-14b-e2e-updatedat-bug.md
  - docs/research/decisions/ADR-003-phase-14b-table-editor-crud.md
tags: [prisma, postgresql, migration, phase-14c, table-editor, raw-sql]
---

## 배경 및 목표

세션 22 프로덕션 E2E 재수행 중 `/api/v1/tables/folders` POST가 `updated_at` 누락 시 500 (NOT NULL 위반)을 반환하는 버그가 확인됐다. 원인은 Prisma `@updatedAt` 어노테이션이 DB 레벨 DEFAULT를 생성하지 않는다는 것 — ORM 클라이언트 전용이라 Phase 14b의 `runReadwrite` raw SQL 경로가 혜택을 받지 못한다.

현재 프로덕션 `RowFormModal`은 3상태 기본값이 `"keep"`이라 **실사용자가 "행 추가"를 누르면 매번 500**을 받고 있다. Phase 14b의 DOD는 curl 기반으로 통과했으나, UI 실사용자 경로는 검증되지 않은 상태였다.

이 spec의 목표는 **단일 마이그레이션으로 근본 원인을 제거**하고 **curl 전 매트릭스 재실행으로 Phase 14b를 실사용자 경로 수준에서 완전 종결**하는 것이다. 세션 22 교훈("curl payload가 UI 기본값을 흉내내지 않으면 실사용자 경로는 영원히 검증되지 않는다")을 E2E 매트릭스 수준에서 내재화한다.

## 범위

**이 spec에서 하는 것**:
- Prisma 스키마의 `@updatedAt` 선언된 5개 모델에 `@default(now())` 병기
- `updated_at` 컬럼이 없던 4개 모델에 `updatedAt` 필드 신규 추가 + B2 백필(`updated_at = created_at`)
- 생성된 마이그레이션 파일에 수동 UPDATE 문 추가
- `/ypserver prod` 재배포 + 전 E2E 매트릭스(S8~S11 + 신규 테이블 스모크) curl 검증
- `docs/solutions/*-updated-at-no-db-default.md` "해결됨" 마커

**이 spec에서 하지 않는 것**:
- RowFormModal / API POST 레이어 코드 변경 (Option B/C 제외)
- Vitest 도입 / 유닛 테스트 작성 (ADR-003 §5 조건부 연기 유지)
- `/ypserver` 스킬 개선 (필요 시 **별도 후속 커밋**으로 분리)
- Phase 14c 본 작업(인라인 편집/낙관적 잠금/복합 PK) — 다음 spec에서 설계
- `edge_function_runs`에 `updatedAt` 추가 (log-append 성격 유지)

## 확정된 의사결정

### D1 — 수정 방식: Option A (schema `@default(now())` 병기)
세션 22 솔루션 문서 §해결 방안의 Option A 채택. Option B(API 자동 주입)와 Option C(UI 자동 주입)는 애플리케이션 레이어 패치로 DB/ORM 진실 소스 불일치를 덮는 구조라 기각.

### D2 — 대상 모델 범위: A2 (9개 모델 = 5 기존 + 4 신규 필드)
**`@updatedAt` 이미 보유한 5개 모델** (→ DB DEFAULT 부재 버그 영향권):
- `User` (schema.prisma L20)
- `Folder` (L41)
- `SqlQuery` (L83)
- `EdgeFunction` (L101)
- `CronJob` (L150)

**`updated_at` 컬럼이 없는 4개 모델** (→ 신규 필드 추가 대상):
- `File` (L47~60)
- `Webhook` (L123~137)
- `ApiKey` (L156~170)
- `LogDrain` (L173~186)

**제외**:
- `EdgeFunctionRun` (L107~120) — log-append 성격. `startedAt`/`finishedAt`만 존재. 재기록 개념 없음.

handover/솔루션 문서가 언급한 "9개 모델" 숫자는 grep 실측(5)과 일치하지 않았으며, 실제 범위는 A2 결정으로 "기존 5 + 신규 4 = 9"로 재정의된다.

### D3 — 백필 전략: B2 (`updated_at = created_at`)
Prisma 자동 생성 마이그레이션의 `ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP`는 기존 행 전부에 마이그레이션 실행 시각을 주입(B1 효과)한다. 이력 의미 보존을 위해 직후 `UPDATE ... SET updated_at = created_at`으로 덮는다. NOT NULL 유지 가능, raw SQL 경로와 호환.

### D4 — 마이그레이션 패키징: 단일 파일
Approach 3 채택 — 9개 모델 변경을 단일 마이그레이션으로 묶는다. 비파괴 변경이며, 분리로 얻는 롤백 이점보다 배포 2회의 운영 부담이 더 크다.

### D5 — 검증 범위: 전 매트릭스 + UI 기본값 흉내 1회차
curl 자동화 S8~S11 전부 재실행 + 신규 테이블(webhooks/log_drains) INSERT 스모크 2건 추가. S8a는 **`updated_at` 생략 payload**로 시작해 UI "keep" 경로의 통과를 보장한다.

## 아키텍처

### 변경의 본질

Prisma ORM의 `@updatedAt`은 **클라이언트 전용** 어노테이션이라 raw SQL INSERT 경로(Phase 14b `runReadwrite`)에서 이점이 없다. `@default(now())`를 **병기**하면 Prisma 마이그레이션이 `DEFAULT CURRENT_TIMESTAMP` DDL을 생성해 raw SQL/ORM 양쪽에서 동일한 보증을 얻는다.

Prisma 클라이언트 쓰기 시 동작은 유지된다. Prisma는 명시값이 있으면 우선 사용하고, `undefined`/`null`일 때만 DB DEFAULT를 활용한다. `@updatedAt`의 "쓰기 시점마다 값 갱신" 의미는 클라이언트 측에서 그대로 작동.

### 변경 파일 목록

| 파일 | 변경 유형 | 설명 |
|---|---|---|
| `prisma/schema.prisma` | 수정 | 5개 모델 `@default(now())` 병기 + 4개 모델에 `updatedAt` 필드 신규 |
| `prisma/migrations/<timestamp>_add_updated_at_default/migration.sql` | 신규 | Prisma 자동 생성 + **B2 백필 UPDATE 문 수동 추가** |
| `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` | 사후 업데이트 | "해결됨" 마커 + 세션 23 검증 링크 |
| `docs/guides/tables-e2e-manual.md` | 선택적 수정 | S8 매뉴얼의 payload 설명에서 "updated_at 주의" 각주 제거 |

### 건드리지 않는 영역

- **애플리케이션 코드 0파일** — `route.ts` / `row-form-modal.tsx` / `runReadwrite` 동작 유지
- **감사 로그 경로** — 기존 `TABLE_ROW_*` 이벤트 계속 기록
- **Drizzle(SQLite)** — Phase 14b는 PostgreSQL 측이라 무관
- **기존 `@updatedAt` ORM 동작** — Prisma 클라이언트가 쓰기 시점 값을 덮어쓰므로 DB DEFAULT와 충돌 없음

## 마이그레이션 상세

### 스키마 변경 (diff 요약)

**5개 모델 — `@default(now())` 병기**:
```prisma
-  updatedAt DateTime @updatedAt @map("updated_at")
+  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")
```
적용 모델: User / Folder / SqlQuery / EdgeFunction / CronJob. 들여쓰기/`@db.Timestamp(3)` 타입 지정자는 현 스키마에 없으므로 **추가하지 않는다** (일관성 유지).

**4개 모델 — `updatedAt` 필드 신규**:
```prisma
   createdAt    DateTime @default(now()) @map("created_at")
+  updatedAt    DateTime @default(now()) @updatedAt @map("updated_at")
```
적용 모델: File / Webhook / ApiKey / LogDrain. 각 모델의 `createdAt` 선언 바로 다음 줄에 삽입.

### 마이그레이션 SQL (자동 생성 + 수동 편집)

**1단계: `npx prisma migrate dev --name "add_updated_at_default" --create-only`**

예상 자동 출력:
```sql
-- 기존 5개 모델에 DEFAULT 추가
ALTER TABLE "users"          ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "folders"        ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sql_queries"    ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "edge_functions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "cron_jobs"      ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- 4개 신규 컬럼
ALTER TABLE "files"      ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "webhooks"   ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "api_keys"   ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "log_drains" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

**2단계: B2 백필 UPDATE 문을 migration.sql 하단에 수동 추가**
```sql
-- B2: 기존 행의 updated_at을 created_at으로 정렬
UPDATE "files"      SET "updated_at" = "created_at";
UPDATE "webhooks"   SET "updated_at" = "created_at";
UPDATE "api_keys"   SET "updated_at" = "created_at";
UPDATE "log_drains" SET "updated_at" = "created_at";
```

*주의*: PostgreSQL 13+의 `ADD COLUMN ... DEFAULT`는 테이블 재작성 없이 fast default 메타데이터를 저장하며, 기존 행은 해당 DEFAULT 값이 즉시 적용된 것처럼 읽힌다. 이후 UPDATE는 실제 값을 물리적으로 덮는 작업이다.

### 실행 순서

```
1. Windows 로컬에서 prisma/schema.prisma 수정 (2종 패턴 — 병기 5개 + 신규 4개)
2. npx prisma migrate dev --name "add_updated_at_default" --create-only
   (로컬 DB 미구성 시 WSL 내에서 수행 가능, 다만 --create-only는 DB 연결 없이도 생성됨)
3. 생성된 migration.sql 하단에 UPDATE 4줄 수동 추가
4. (로컬 DB 있으면) npx prisma migrate dev — 로컬 적용 + generate
   (없으면 skip, WSL deploy에서 일원화)
5. git add prisma/ && git commit -m "feat(db): @updatedAt 5병기 + 4신규 마이그레이션"
6. /ypserver prod — WSL2 빌드 + pm2 restart
   ⚠ 주의: /ypserver가 prisma migrate deploy를 포함하지 않으면 수동 WSL 접속 후
     cd ~/dashboard && npx prisma migrate deploy 실행 (사전 확인 필수)
7. E2E curl 매트릭스 (아래 §검증 전략) 실행
8. docs/solutions 업데이트 + /cs 세션 종료
```

### 롤백 계획

**DDL 실패 (마이그레이션 중단)**:
```bash
npx prisma migrate resolve --rolled-back add_updated_at_default
```
수동 역변경:
```sql
-- 5개 모델
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;
-- ...
-- 4개 신규 컬럼
ALTER TABLE "files" DROP COLUMN "updated_at";
-- ...
```

**애플리케이션 레벨 문제 (배포 후)**:
- Phase 14b 코드 변경 없음 → `git revert <migration commit>`만으로 복구
- Prisma 클라이언트 재생성 (`npx prisma generate`) 후 pm2 restart

## 검증 전략 (E2E 매트릭스)

### 핵심 curl 시나리오

| # | 시나리오 | Payload 조건 | 기대 | 세션 22 대비 |
|---|---|---|---|---|
| S8a | folders POST | id+name+owner_id+is_root (**updated_at 생략**) | 200 + row | 🔴 500 → ✅ 200 |
| S8b | folders PATCH (name) | name만 | 200 + 갱신 row | 동일 |
| S8c | folders DELETE | — | 200 `{deleted:true}` | 동일 |
| S9 | 감사 로그 | `/api/v1/audit?...` | TABLE_ROW_INSERT/UPDATE/DELETE 3건 신규 | 동일 |
| S10 | users POST | — | 403 OPERATION_DENIED | 동일 |
| S11a | `folders;DROP TABLE X` 인젝션 | — | 400 INVALID_TABLE | 동일 |
| S11b | edge_function_runs POST | — | 403 "삭제만 가능" | 동일 |

### 신규 테이블 INSERT 스모크 (추가)

| # | 테이블 | 필수 필드 payload | 기대 | 비고 |
|---|---|---|---|---|
| S8d | `webhooks` | name/source_table/event/url (updated_at 생략) | 200 + row | 신규 컬럼 DEFAULT 검증 |
| S8e | `log_drains` | name/type/url (updated_at 생략) | 200 + row | 신규 컬럼 DEFAULT 검증 |

*주의*: `api_keys`는 민감 테이블 차단 목록(ADR-003) 대상이라 INSERT 시 403 — 스모크 대상에서 제외. `files`는 folder_id/owner_id FK 준비 부담으로 `log_drains`로 대체.

### 백필 검증 쿼리

WSL2 psql 또는 `/api/v1/sql-editor`(읽기 전용):
```sql
SELECT
  (SELECT COUNT(*) FROM files      WHERE updated_at = created_at) AS files_match,
  (SELECT COUNT(*) FROM webhooks   WHERE updated_at = created_at) AS webhooks_match,
  (SELECT COUNT(*) FROM api_keys   WHERE updated_at = created_at) AS api_keys_match,
  (SELECT COUNT(*) FROM log_drains WHERE updated_at = created_at) AS log_drains_match;
```
예상: 각 값이 마이그레이션 시점 테이블 총 행 수와 일치(이후 신규 INSERT는 대부분 일치, UPDATE 발생 시 불일치 허용).

### UI 수동 재현 (선택)

`@updatedAt` fix 배포 후 사용자가 브라우저에서 직접:
- `/tables/folders` → "행 추가" → 모달 → 저장(keep 기본값) → 그리드 반영
- 편집/삭제 + confirm 다이얼로그
- `/audit` 페이지에서 TABLE_ROW_* 기록 확인
- `/tables/users` 편집 불가 메시지 확인

## 수락 기준 (DOD)

- [ ] `prisma/schema.prisma` 9개 모델 변경 반영 (5 병기 + 4 신규)
- [ ] 신규 마이그레이션 파일 커밋 (UPDATE 4줄 수동 편집 포함)
- [ ] `/ypserver prod` 배포 완료 + prisma migrate deploy 실 적용 확인
- [ ] prod에서 `\d <table>` DEFAULT 설정 + 기존 행 `updated_at = created_at` 샘플 검증
- [ ] S8a~S11b + S8d/S8e curl 매트릭스 **전부 통과** (S8a의 updated_at 생략 payload 200 필수)
- [ ] `audit_logs`에 신규 TABLE_ROW_INSERT/UPDATE/DELETE 3건 추가
- [ ] `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` "해결됨" 마커 추가
- [ ] (선택) 브라우저 UI 수동 테스트 1회
- [ ] 세션 23 인수인계서 작성 (`/cs`)

## 운영 리스크 & 완화

| 리스크 | 영향 | 완화책 |
|---|---|---|
| `/ypserver` 스킬이 `prisma migrate deploy`를 포함하지 않음 | 배포 후 DB 미갱신 → 500 유지 | 배포 전 스킬 소스 점검. 미포함이면 수동 WSL 접속 또는 스킬 보강 커밋 추가 |
| fast default로 `ADD COLUMN DEFAULT`가 기존 행을 물리적으로 안 건드림 | UPDATE 누락 시 사실 왜곡(B1 효과 잔존) | UPDATE 4줄 migration.sql에 **필수 포함**, PR 체크리스트 항목 |
| Cloudflare Tunnel 간헐 530 재발 | curl E2E 불안정 | WSL localhost(`http://localhost:3000`) 경유 전환 (세션 22 선례) |
| Prisma 클라이언트와 DB DEFAULT 상호작용 | ORM 쓰기 시 DB DEFAULT가 의도 외 발동? | Prisma는 명시값 우선 → `@updatedAt` 클라이언트 동작 유지 |
| migration SQL 수동 편집 손실 | 차후 `migrate reset` 실행 시 편집 누락 재현 불가 | migration 디렉토리 커밋 후 파일 상단에 `-- manual-edit included: UPDATE backfill` 주석 |
| 차단 테이블(users)도 병기 대상 | Phase 14b 차단 정책과 무관 — DB DEFAULT 추가만 수행 | 의도적. E2E S10에서 403 유지 확인 |

## 교훈의 내재화

1. **ORM 메타데이터 ≠ DB 스키마**. Prisma `@updatedAt`이 DB DEFAULT를 만들지 않는다는 비대칭은 raw SQL 경로가 등장하는 순간 반드시 의식해야 한다.
2. **curl E2E는 "payload 편의"가 실사용 경로를 왜곡할 수 있다**. UI 기본값(3상태 keep)을 흉내내는 최소 payload를 1회차로 두는 습관 필요 — 이 spec의 S8a 조건이 그 체크포인트.
3. **`psql \d <table>` 한 줄이 수천 줄 ORM 문서보다 빠르다**. 비정상 동작 발견 시 `information_schema.columns.column_default` 또는 `\d`를 먼저 보는 것이 진실 소스 접근의 지름길.
4. **수동 마이그레이션 편집은 명시적 주석과 커밋 메시지로 보존한다**. Prisma는 다음 `migrate dev`에서 DDL만 비교하므로 DML(UPDATE) 수동 추가는 재생성되지 않는다.

## 관련 문서

- `docs/solutions/2026-04-17-phase-14b-updated-at-no-db-default.md` (원인 분석 + Option A/B/C 비교)
- `docs/handover/260417-session22-phase-14b-e2e-updatedat-bug.md` (발견 맥락)
- `docs/research/decisions/ADR-003-phase-14b-table-editor-crud.md` (차단 테이블 정책)
- `docs/guides/tables-e2e-manual.md` (E2E 매뉴얼 S8~S11)
