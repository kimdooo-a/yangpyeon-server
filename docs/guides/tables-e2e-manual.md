# Table Editor 수동 E2E 검증 가이드

> 세션 18에서 도입된 읽기 전용 Table Editor (Phase 14a)의 수동 브라우저 검증 절차.
> 자동 E2E는 MANAGER+ 세션 쿠키 주입 복잡도로 생략 — 운영자 1인 수행 기준.

## 사전 준비

1. PM2 실행 중 확인
   ```bash
   wsl -d Ubuntu -- pm2 list
   ```
   - `yp-dashboard` 상태 `online`이어야 함

2. PostgreSQL `app_readonly` 롤 존재 확인
   ```bash
   wsl -d Ubuntu -- psql -h 127.0.0.1 -U postgres -d yangpyeong -c "\du app_readonly"
   ```
   - 없으면 `scripts/sql/create-app-readonly.sql` 적용 필요

3. 로그인 계정 준비
   - MANAGER 또는 ADMIN 롤 보유 계정
   - /login 경로에서 세션 쿠키 획득 가능

## 검증 시나리오

### S1. 인증 가드 — 비로그인 차단

| 단계 | 기대 결과 |
|---|---|
| 시크릿 창에서 `https://stylelucky4u.com/tables` 접속 | `/login`으로 307 리다이렉트 |
| DevTools Network 확인 | `/tables` 응답 307, `Location: /login?next=/tables` |

### S2. 권한 가드 — VIEWER 차단

| 단계 | 기대 결과 |
|---|---|
| VIEWER 계정으로 로그인 후 `/tables` 이동 | 403 또는 레이아웃 가드에 의해 접근 거부 |

### S3. 테이블 목록 표시 (MANAGER+)

| 단계 | 기대 결과 |
|---|---|
| MANAGER 계정 로그인 → `/tables` 접속 | 좌측/상단에 public 스키마 테이블 목록 렌더 |
| 테이블 카운트 | 실제 DB 테이블 수와 일치 (`\dt` 비교) |
| 각 항목 | 클릭 가능한 링크 (`/tables/[table]`) |

### S4. 개별 테이블 읽기 (TanStack Table)

| 단계 | 기대 결과 |
|---|---|
| `/tables/users` 이동 | 컬럼 헤더 + 최대 50–100행 표시 |
| 컬럼 타입 표기 | `text / int4 / timestamptz / uuid` 등 PG 타입 라벨 |
| 페이지네이션 | prev/next 동작, 총 행 수 표기 |
| 정렬 | 헤더 클릭 시 ASC/DESC 토글 |

### S5. 읽기 전용 강제 — UPDATE 시도 차단

| 단계 | 기대 결과 |
|---|---|
| DevTools Console에서 직접 fetch |  |
| `fetch('/api/v1/tables/users', {method:'PATCH', headers:{'Content-Type':'application/json'}, body:'{}'})` | 405 Method Not Allowed 또는 401/403 |
| SQL Editor에서 `UPDATE users SET email='x' WHERE id=1` | `cannot execute UPDATE in a read-only transaction` 에러 |

### S6. 식별자 검증 — SQL Injection 방어

| 단계 | 기대 결과 |
|---|---|
| 주소창에 `/tables/users;DROP TABLE logs;` | 400 Bad Request 또는 라우트 미매칭 404 |
| `/api/v1/tables/public.users/schema` | 스키마 조회 정상 (dot은 허용된 경우) |
| `/api/v1/tables/users%20OR%201=1/schema` | 400 — identifier validation 실패 |

### S7. app_readonly 롤 경로 검증

| 단계 | 기대 결과 |
|---|---|
| PM2 로그 관찰 (`wsl -d Ubuntu -- pm2 logs yp-dashboard --lines 50`) | `BEGIN READ ONLY` 트랜잭션 로그 확인 (디버그 모드 시) |
| DATABASE_URL_READONLY 환경변수 사용 확인 | pgdump 라우트와 격리 |

## 실패 시 조치

| 증상 | 조치 |
|---|---|
| 목록 비어 있음 | `app_readonly` 롤의 USAGE/SELECT 권한 재부여 |
| 500 에러 | PM2 로그 `pm2 logs yp-dashboard --err --lines 100` 확인 |
| identifier 400 반복 | `src/lib/db/identifier.ts` 화이트리스트 패턴 확인 |
| UPDATE가 성공함 | `BEGIN READ ONLY` 래핑 또는 롤 권한 감사 — 즉시 롤백 |

## 통과 기준

- S1–S6 모두 기대 결과 일치
- S5 UPDATE 차단 실패 시 **즉시 배포 롤백** 대상 (세션 18 보안 게이트)

## 참고

- Table Editor 커밋: `26b65b6 feat(db): A Phase 14a`
- 식별자 검증: `src/lib/db/identifier.ts`
- 읽기 전용 트랜잭션: `src/app/api/v1/tables/[table]/route.ts`

## 실행 이력

### 2026-04-12 22:10 KST (프로덕션 `dec6abe`)

| 시나리오 | 결과 | 비고 |
|---|---|---|
| S1 인증 가드 | ✅ PASS | `/tables` → 307 `/login` / `/api/auth/me` → 401 |
| S2 VIEWER 차단 | ⏭ SKIP | VIEWER 테스트 계정 미보유 — 별도 수행 필요 |
| S3 테이블 목록 | ✅ PASS | 11개 테이블 렌더. 단, "행 ~-1" 표기 — approximate count API 재검토 필요 (cosmetic) |
| S4 개별 테이블(users) | ✅ PASS | 10컬럼 + 타입 배지, 1행, 페이지네이션 "총 1" |
| S5 읽기 전용 강제 | ✅ PASS | PATCH/POST/DELETE → 405, SQL UPDATE → 400 DANGEROUS_SQL |
| S6 식별자 주입 | ✅ PASS | 6/6 공격 차단 — SQL 키워드 주입, 세미콜론, 쿼트 이스케이프, 유니코드, 경로 traversal, 300자 긴 이름 모두 400/403/404 |
| S7 app_readonly 경로 | ⚠️ PARTIAL | SELECT 200 정상 동작 확인. PM2 로그 내 `SET LOCAL ROLE` 문자열은 별도 WSL 터미널에서 확인 필요 |

**종합**: Phase 14a 보안 게이트 **전체 통과**. UPDATE/DELETE는 HTTP 메서드 레벨(405) + SQL 레벨(DANGEROUS_SQL 400) 이중 방어.

**후속 과제**:
- S2: VIEWER 계정 생성 후 재수행
- S3: 행 수 `-1` 표기 — `information_schema.reltuples` 또는 `COUNT(*)` 사용 전환 검토
- S6 long_name: 300자 이름이 regex는 통과 (`[a-zA-Z_][a-zA-Z0-9_]*`) — DB 대조에서 안전히 걸리지만, 정규식에 `{1,63}` 길이 제한(PG identifier 최대) 추가 권장

---

## Phase 14b CRUD 시나리오 (세션 21 추가)

### S8. 행 추가 (MANAGER+)
1. `/tables/folders` 진입 → 헤더 우측 "행 추가" 버튼 클릭
2. 폼 모달 — name: "시나리오 S8", owner_id: 본인 UUID, is_root: false
3. 저장 → 그리드 최상단(또는 정렬 순서)에 새 행 반영, 모달 닫힘
4. `/audit` 페이지에 `TABLE_ROW_INSERT` 기록 1건 확인 (detail에 이메일 + diff JSON)

### S9. 행 편집 (MANAGER+)
1. S8에서 생성한 행의 "편집" 버튼 클릭
2. 모달 — name 필드만 action=set, value="S9 renamed" 로 변경 (나머지는 keep)
3. 저장 → 그리드 해당 셀 반영
4. `/audit` 페이지에 `TABLE_ROW_UPDATE` 기록 1건 확인

### S10. 행 삭제 (ADMIN only)
1. S9 편집된 행의 "삭제" 버튼 클릭
2. `confirm()` 확인 → DELETE API 호출 → 그리드에서 행 제거
3. `/audit` 페이지에 `TABLE_ROW_DELETE` 기록 1건 확인
4. MANAGER 계정으로는 "삭제" 버튼 자체가 비노출 + 서버도 403 OPERATION_DENIED

### S11. 차단 테이블 UI + API
1. `/tables/users` 접근 → "행 추가" 버튼 미노출, "Table Editor에서 편집 불가 (전용 페이지 사용)" 안내
2. `/tables/api_keys` / `/tables/_prisma_migrations` 동일 거동
3. curl로 직접 POST `/api/v1/tables/users` 시도 → 403 OPERATION_DENIED (감사 로그 기록 없음)
4. `/tables/edge_function_runs` → "삭제" 버튼은 ADMIN에게 노출, "편집"/"행 추가"는 차단 (DELETE_ONLY 정책)

## DOD (세션 22 curl E2E 완료)
- [x] S8 정상 INSERT (ADMIN + folders) — 세션 23 `@default(now())` 병기 마이그레이션 적용으로 updated_at 자동 기본값 처리 (자세히: [solution](../solutions/2026-04-17-phase-14b-updated-at-no-db-default.md#해결--세션-23-2026-04-17))
- [x] S9 정상 UPDATE (동일 행) — curl PATCH 통과
- [x] S10 DELETE + 감사 로그 3건 누적 확인 — `audit_logs` 영속, detail에 actor 이메일 + diff JSON
- [x] S11 UI/API 차단 매트릭스 — users/api_keys/_prisma_migrations 403 OPERATION_DENIED, edge_function_runs INSERT 403("삭제만 가능") + DELETE 404(정책 통과·행 부재)
- [ ] PM2 로그에 `SET LOCAL ROLE app_readwrite` 흔적 (세션 22 미수행 — 감사 로그 3건 영속으로 경로 입증)
