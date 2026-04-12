# Phase 14b — Table Editor CRUD 개발 프롬프트

> 이 프롬프트는 새 터미널 세션에 전달하기 위한 자기완결형 지시문입니다.
> 복사해서 새 Claude Code 세션 첫 메시지로 사용하세요.

---

## 세션 목표

**Phase 14b: Table Editor에 CRUD(INSERT / UPDATE / DELETE) 기능 추가.**
세션 18에서 완료된 Phase 14a(읽기 전용)를 확장하여 MANAGER 이상 권한자가 UI에서 행 생성/수정/삭제를 수행할 수 있게 만든다.

## 프로젝트 컨텍스트 (요약)

- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + TanStack Table v8
- **배포**: WSL2 PM2 + Cloudflare Tunnel → `https://stylelucky4u.com`
- **도메인 규칙**: 주석/커밋 메시지 한국어, 역사 삭제 금지, 문서 풀뿌리 연결
- **로그인 계정 (테스트용)**: `kimdooo@stylelucky4u.com / Knp13579!yan` (ADMIN)

## 필독 파일 (순서대로)

**시작 전 반드시 읽기**:
1. `CLAUDE.md` — 프로젝트 규칙
2. `docs/status/current.md` — 최신 상태
3. `docs/handover/260412-session18-auth-refactor.md` — 세션 18 인수인계
4. `docs/handover/next-dev-prompt.md` — 전체 잔여 작업

**Phase 14a 기존 코드 (확장 대상)**:
5. `src/app/api/v1/tables/[table]/route.ts` — 읽기 라우트 (확장 기준)
6. `src/app/api/v1/tables/[table]/schema/route.ts` — 스키마 introspect
7. `src/app/(protected)/tables/[table]/page.tsx` — Table UI
8. `src/lib/pg/pool.ts` — `runReadonly` 헬퍼 (여기서 `runReadwrite` 파생 예정)

**Auth / Audit 패턴**:
9. `src/lib/api-guard.ts` — `withRole` 가드
10. `src/lib/audit-log.ts` — `writeAuditLog` 스키마

## 현재 상태 (Phase 14a 완료 지점)

```
읽기 흐름:
  GET /api/v1/tables/[table]
    → withRole(["ADMIN","MANAGER"])
    → identifier 정규식 검증 (/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    → information_schema.columns 대조 (실제 존재 컬럼만 order 허용)
    → runReadonly() 호출:
       • BEGIN READ ONLY
       • SET LOCAL statement_timeout = 10000
       • SET LOCAL ROLE app_readonly  (PG 롤, NOLOGIN + SELECT only)
       • 쿼리 실행
       • COMMIT
    → TanStack Table로 렌더
```

## 작업 정의 (Phase 14b)

### 신규 API 라우트 3개

| 메서드 | 경로 | 역할 | 비고 |
|---|---|---|---|
| POST | `/api/v1/tables/[table]` | MANAGER+ | 행 1개 삽입, 반환값은 생성된 행(모든 컬럼) |
| PATCH | `/api/v1/tables/[table]/[pk]` | MANAGER+ | 행 1개 부분 업데이트, 변경된 컬럼만 `SET` |
| DELETE | `/api/v1/tables/[table]/[pk]` | **ADMIN only** | 행 1개 삭제, 감사로그 필수 |

> DELETE를 ADMIN으로 제한하는 이유: 데이터 소실은 비가역. Phase 14c에서 soft-delete 도입 여부 결정 예정.

### 신규 라이브러리 헬퍼

`src/lib/pg/pool.ts`에 `runReadwrite` 추가:
- `BEGIN` (READ ONLY 제거)
- `SET LOCAL ROLE app_readwrite` (신규 PG 롤)
- `SET LOCAL statement_timeout = 10000`
- 실패 시 `ROLLBACK`
- 반환: `{ rows, rowCount }`

### 신규 PG 롤: `app_readwrite`

DB 마이그레이션 스크립트 `scripts/sql/create-app-readwrite.sql`:
```sql
-- LOGIN 불가, 세션에서 SET LOCAL ROLE로만 전환 가능
CREATE ROLE app_readwrite NOLOGIN;
GRANT USAGE ON SCHEMA public TO app_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_readwrite;

-- app_readonly 보유자가 role switch 가능하도록
GRANT app_readwrite TO postgres;
```

배포 시: `wsl -d Ubuntu -- psql -h 127.0.0.1 -U postgres -d yangpyeong -f scripts/sql/create-app-readwrite.sql`

### UI 확장

`src/app/(protected)/tables/[table]/page.tsx`:
- **행 추가 버튼** → 스키마 기반 폼 모달 (컬럼별 타입 감지 → input 종류 결정)
- **행 인라인 편집** → TanStack Table cell 더블클릭 편집, Enter 저장 / Esc 취소
- **행 삭제 버튼** → `confirm()` 후 DELETE, 낙관적 UI + 실패 시 rollback
- **PK 자동 감지**: introspect로 PK 컬럼 조회 (복합 PK는 Phase 14b에서 제외, 단일 컬럼 PK만 지원)
- **타입별 입력 컨트롤**:
  - `bool` → 체크박스
  - `int*`, `numeric` → number input
  - `timestamptz` → datetime-local
  - `uuid` → text (validate 정규식)
  - `jsonb`/`json` → textarea + JSON parse
  - 그 외 → text

## 핵심 설계 결정 — 먼저 결정 필요

### D1. PK 감지 전략

```sql
SELECT a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE i.indrelid = 'public."<table>"'::regclass AND i.indisprimary;
```

- 단일 PK만 지원 (결과 1행만 허용)
- PK 없는 테이블 → UI에서 편집 불가로 표시 (`ctid` 사용은 거부)

### D2. 값 타입 coercion

서버 사이드에서 PG 타입별 변환:
```
int2/int4/int8    → BigInt.asIntN() 후 Number
numeric           → 문자열 그대로 전달 (정밀도 보존)
bool              → ["true", "1", true] → true, 나머지 false
timestamptz       → Date 파싱 후 toISOString()
uuid              → /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i 검증
json/jsonb        → JSON.parse() 시도, 실패 시 문자열 그대로
text/varchar      → String() 그대로
```

실패 시 400 응답 + 어느 컬럼에서 실패했는지 명시.

### D3. 파라미터 바인딩 vs 문자열 보간

- **식별자(테이블명/컬럼명)**: quote_ident 스타일 수동 escape (`replace(/"/g, '""')` + 화이트리스트 대조)
- **값**: 반드시 `$1, $2...` 파라미터 바인딩 (절대 보간 금지)

### D4. 감사 로그 페이로드

```ts
writeAuditLog({
  timestamp: new Date().toISOString(),
  method: "POST" | "PATCH" | "DELETE",
  path: `/api/v1/tables/${table}/${pk ?? ""}`,
  ip: request.headers.get("x-forwarded-for") ?? "unknown",
  action: "TABLE_ROW_INSERT" | "TABLE_ROW_UPDATE" | "TABLE_ROW_DELETE",
  detail: `${user.email} → ${table}${pk ? `(pk=${pk})` : ""}: ${JSON.stringify(diff)}`,
});
```

민감 테이블(users, api_keys 등)은 `detail`에 값 대신 컬럼명만 기록 (비밀번호 해시 로그 유출 방지).

### D5. 권한 매트릭스 최종안

| 테이블 | MANAGER INSERT | MANAGER UPDATE | MANAGER DELETE | ADMIN DELETE |
|---|---|---|---|---|
| 일반 업무 테이블 | ✅ | ✅ | ❌ | ✅ |
| `users` | ❌ | ❌ | ❌ | ❌ (별도 멤버 API만) |
| `audit_logs` | ❌ | ❌ | ❌ | ❌ (읽기 전용 영구) |
| `api_keys` | ❌ | ❌ | ❌ | ❌ (별도 관리 페이지만) |

→ `src/lib/db/table-policy.ts` 신설, 테이블별 작업 허용 여부를 반환하는 함수.

## 작업 순서 (권장)

### 0. Brainstorming 세션
먼저 `superpowers:brainstorming` 스킬 사용. 핵심 설계 결정(D1~D5) 사용자 승인 받기.

### 1. DB 준비
- [ ] `scripts/sql/create-app-readwrite.sql` 작성 + WSL2 적용
- [ ] `app_readwrite` 롤 검증 (`\du` / INSERT 테스트)

### 2. 라이브러리 레이어
- [ ] `src/lib/pg/pool.ts` — `runReadwrite` 함수 추가
- [ ] `src/lib/db/table-policy.ts` — 권한 매트릭스
- [ ] `src/lib/db/identifier.ts` (없으면 신설) — 공용 identifier escape/validate
- [ ] `src/lib/db/coerce.ts` — PG 타입별 값 coercion

### 3. API 레이어
- [ ] `src/app/api/v1/tables/[table]/route.ts` — POST 추가
- [ ] `src/app/api/v1/tables/[table]/[pk]/route.ts` — 신규 파일 (PATCH + DELETE)
- [ ] `src/app/api/v1/tables/[table]/schema/route.ts` — PK 컬럼 정보 반환 추가

### 4. UI 레이어
- [ ] `src/app/(protected)/tables/[table]/page.tsx` — 행 추가/편집/삭제 UI
- [ ] `src/components/table-editor/RowFormModal.tsx` — 신규 (스키마 기반 폼)
- [ ] `src/components/table-editor/EditableCell.tsx` — 신규 (인라인 편집)
- [ ] 낙관적 UI + 실패 시 rollback

### 5. 테스트 & 문서
- [ ] API 레벨: 권한 매트릭스 검증 (VIEWER 403, MANAGER→일반 OK, MANAGER→users 거부)
- [ ] 인젝션 시도: `'"; DROP TABLE users; --` 등 정규식 차단 확인
- [ ] `docs/guides/tables-e2e-manual.md` 업데이트 — CRUD 시나리오 S8~S11 추가
- [ ] PM2 로그에서 `SET LOCAL ROLE app_readwrite` 확인

### 6. 배포
- [ ] Windows에서는 빌드 불가 — `/ypserver` 스킬로 WSL2 배포
- [ ] 프로덕션 헬스 체크 + 실제 INSERT 1건 테스트 (테스트 테이블 준비 필요)

## 보안 체크리스트 (배포 전 필수)

- [ ] 식별자는 항상 정규식 + DB 대조 + `quote_ident` 스타일 escape
- [ ] 값은 항상 `$1, $2...` 파라미터 바인딩 (문자열 보간 0건)
- [ ] INSERT/UPDATE/DELETE는 `BEGIN` + `SET LOCAL ROLE app_readwrite` 래핑
- [ ] DELETE는 ADMIN 전용
- [ ] 민감 테이블(users/audit_logs/api_keys)은 `table-policy.ts`에서 차단
- [ ] 모든 변경 → `writeAuditLog` 기록
- [ ] 비밀번호/시크릿 컬럼 값은 감사 로그 `detail`에서 제외
- [ ] `LIMIT 1` 없는 UPDATE/DELETE 절대 금지 (PK WHERE 강제)
- [ ] 동시성: 같은 행 동시 수정 시 낙관적 잠금(`updated_at` 비교) — 차후 Phase 14c

## 수용 기준 (Definition of Done)

1. ✅ 일반 테이블에 MANAGER 계정으로 INSERT/UPDATE 성공
2. ✅ VIEWER 계정은 UI에서 편집 버튼 비활성 + API 호출 시 403
3. ✅ `users`/`api_keys` 테이블은 MANAGER도 UI 편집 차단
4. ✅ DELETE는 ADMIN만 가능, `confirm()` 후 실행
5. ✅ 부적절 식별자 주입 시 400 (DB 쿼리 도달 전 차단)
6. ✅ 모든 변경에 대한 감사 로그 1건씩 기록
7. ✅ PM2 로그에 `SET LOCAL ROLE app_readwrite` 확인
8. ✅ 빌드 통과 (WSL2) + `/tables/<테이블>` 브라우저 E2E 통과
9. ✅ `docs/guides/tables-e2e-manual.md` CRUD 시나리오 추가
10. ✅ 세션 종료 4단계 (current.md / logs / handover / next-dev-prompt.md) 완료

## 알려진 주의사항 / 트랩

- **Windows 빌드 불가**: `next build`는 WSL2에서만 수행. Windows 로컬은 `next dev`만 가능.
- **proxy.ts에 auth 로직 금지**: CVE-2025-29927 구조적 방어가 세션 18에서 완성됨. Phase 14b는 proxy.ts 건드리지 않음.
- **Prisma 스키마 vs 실제 DB**: Prisma 모델이 없는 테이블(SqlQuery, EdgeFunction 등)도 Table Editor로 표시됨. CRUD 시 Prisma $executeRaw 사용 금지 — 반드시 `runReadwrite` 사용.
- **`app_readonly` 잔여**: 조회는 기존대로 `runReadonly`. `runReadwrite` 신설은 CRUD 전용.
- **Turbopack NFT 경고**: 세션 18에서 cosmetic으로 확정. 새 라우트 추가해도 무시 가능.
- **PM2 재시작**: `instrumentation.ts` 덕분에 Cron은 PM2 기동 시 즉시 시작됨. 재배포 후 별도 수동 호출 불필요.

## 시작 시 첫 지시

새 세션이 이 프롬프트를 받으면 다음을 순서대로 수행:

1. `CLAUDE.md` + `docs/status/current.md` + `docs/handover/260412-session18-auth-refactor.md` 읽기
2. `src/app/api/v1/tables/[table]/route.ts` + `src/lib/pg/pool.ts` 읽기 (Phase 14a 패턴 체득)
3. `superpowers:brainstorming` 스킬 사용 — D1~D5 설계 결정 사용자와 합의
4. 합의 후 `superpowers:writing-plans` 스킬로 실행 계획 작성
5. 계획 승인 받으면 `superpowers:executing-plans`로 순차 실행
6. 각 단계마다 커밋, 완료 후 세션 종료 4단계

---

> 본 프롬프트는 세션 18(커밋 `dec6abe`) 시점 기준으로 작성됨.
> 실제 실행 전 `git log` / `docs/status/current.md`로 최신 상태 재확인 필수.
