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
