# Spike 005 — Supabase 스타일 SQL Editor 이식 리서치

- **작성일**: 2026-04-12
- **스택 전제**: Next.js 15 + TypeScript + Tailwind + Prisma(메인) + Drizzle(보조) + PostgreSQL
- **목표**: 운영 대시보드에 read-only SQL Editor(monaco + 결과 테이블 + 저장/즐겨찾기) 이식 가능성 판정

---

## 1. 목적

관리자가 브라우저에서 직접 PostgreSQL 쿼리를 작성·실행·저장할 수 있는 Supabase Studio 스타일 에디터를 자체 대시보드에 이식한다. 운영 중 데이터 확인 빈도가 높아 Prisma Studio/외부 GUI 의존을 줄이는 것이 1차 동기. 단, **프로덕션 DB 파괴 위험**이 있으므로 실행 범위·권한 제약이 핵심 과제다.

## 2. GitHub 레퍼런스 (검증 완료)

| # | 레포 | 경로 | 재사용 포인트 |
|---|------|------|---------------|
| 1 | [supabase/supabase](https://github.com/supabase/supabase) | `apps/studio/components/interfaces/SQLEditor/` (`SQLEditor.tsx`, `MonacoEditor.tsx`, `UtilityPanel/`, `SQLTemplates/`, `RunQueryWarningModal.tsx`, `hooks.ts`) | Monaco 통합 패턴, 위험 쿼리 경고 모달(`RunQueryWarningModal`), Valtio 기반 스니펫/폴더 상태관리, 템플릿 구조. 라이선스(Apache 2.0) — 구조 참고 및 부분 발췌 가능 |
| 2 | [sqlpad/sqlpad](https://github.com/sqlpad/sqlpad) | `client/` (React) + `server/` (Express) | 쿼리 저장/공유/태그 모델, 커넥션 분리, 결과 테이블 가상화. Next.js가 아니라 CRA 기반이라 컴포넌트만 포팅. 라이선스 MIT |
| 3 | [outerbase/studio](https://github.com/outerbase/studio) | `develop` 브랜치 루트 (Next.js + 브라우저 GUI) | Next.js 기반, PG/MySQL/SQLite 드라이버 추상화, 결과 그리드(수천 행 렌더 최적화), 스테이징 편집 UX. 구조 전체가 본 프로젝트와 가장 유사 |
| 4 | [DTStack/monaco-sql-languages](https://github.com/DTStack/monaco-sql-languages) | 패키지 루트 | Monaco용 PG/MySQL 방언별 하이라이팅·키워드 컴플리션 — 별도 언어 서비스 구축 불필요 |

> 보조: [suren-atoyan/monaco-react](https://github.com/suren-atoyan/monaco-react) — `@monaco-editor/react` 공식 레포(webpack 설정 불필요한 React 래퍼).

## 3. 공식 docs

- **@monaco-editor/react**: [npm](https://www.npmjs.com/package/@monaco-editor/react) — v4 계열, React 19는 v4.7.0-rc.0. CDN 로더 또는 `loader.config()`로 self-host 전환 가능.
- **node-postgres(pg)**: [transactions](https://node-postgres.com/features/transactions) — `BEGIN READ ONLY` / `COMMIT` 패턴, 동일 `client` 인스턴스 재사용 필수.
- **Prisma Raw Queries**: [Raw queries](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries) — `$queryRaw` tagged template = 안전(파라미터 바인딩), `$queryRawUnsafe`는 원시 문자열 실행 → **사용자 입력 SQL을 그대로 넣으면 SQL Injection 불가피**. 관리자 한정이라도 범위 제어 레이어 필수. 대안: [TypedSQL](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql)은 컴파일 타임 SQL이라 본 용도(동적 사용자 쿼리)에는 부적합.

## 4. 자체 구현 난이도

**판정: M (중간, 3~5일)**

근거:
- Monaco + shadcn Dialog/Table 조합은 설치형 파츠라 하루 이내 동작.
- 어려운 포인트는 **실행 안전성**과 **결과 직렬화(bigint/Date/jsonb)** 2가지. 나머지(저장/목록/리네임)는 CRUD.
- Supabase/Outerbase는 멀티 DB·AI 어시스트까지 포함하므로 그대로 포팅은 L이지만, "관리자 read-only + 저장"으로 축소하면 M.

### 실행 위험 차단(다층 방어)

1. **DB 역할 분리**: `app_readonly` PostgreSQL 롤 생성 → `GRANT SELECT` 만 부여, SQL Editor 전용 커넥션 풀(별도 `DATABASE_URL_READONLY`)에서만 사용. → DROP/UPDATE 시도 자체가 DB 단에서 거절됨(가장 강한 방어).
2. **트랜잭션 읽기 전용 고정**: 매 실행마다 `BEGIN READ ONLY; … ; ROLLBACK;` 래핑. WRITE 시도 시 PG가 즉시 오류. (`node-postgres` 공식 패턴 기반)
3. **정적 파서 블랙리스트**: `libpg-query-node` 또는 정규식으로 `DROP|TRUNCATE|ALTER|GRANT|CREATE|DELETE|UPDATE|INSERT|COPY|VACUUM` 키워드 사전 차단. 다중 문장(`;`) 거절.
4. **statement_timeout**: 실행 전 `SET LOCAL statement_timeout = '5s'`로 장기 쿼리 차단.
5. **요청 검증**: Zod 스키마(`{ sql: z.string().max(10_000) }`) + CSRF + 관리자 ADMIN 역할 게이트.
6. **행 수 상한**: 결과 10,000행 초과 시 서버에서 절단 후 메타 반환.

## 5. 권장 아키텍처

```
UI (src/app/sql/page.tsx, 'use client')
 ├─ <Editor language="sql" /> (@monaco-editor/react + DTStack/monaco-sql-languages)
 ├─ <SavedQueriesSidebar/>  (shadcn)
 ├─ <ResultsTable/>          (shadcn Table + TanStack Table 가상화)
 └─ <RunQueryWarningModal/>  (shadcn Dialog — 위험 키워드 감지 시)
         │
         ▼  fetch(POST)
API (Next.js Route Handler, runtime='nodejs')
 ├─ POST /api/v1/sql/execute  (Zod 검증 → 파서 블랙리스트 → 읽기전용 풀 → BEGIN READ ONLY → SET LOCAL statement_timeout → 직렬화 → ROLLBACK)
 ├─ GET  /api/v1/sql/queries          (Prisma SqlQuery 목록)
 ├─ POST /api/v1/sql/queries          (저장)
 ├─ PATCH /api/v1/sql/queries/:id     (리네임/즐겨찾기 토글)
 └─ DELETE /api/v1/sql/queries/:id
```

### Prisma 스키마 추가

```prisma
model SqlQuery {
  id          String   @id @default(cuid())
  title       String
  sql         String   @db.Text
  isFavorite  Boolean  @default(false)
  folderId    String?
  createdBy   String   // User.id
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([createdBy, isFavorite])
}
```

### 실행 엔진 선택

`pg` 직접 사용 권장(읽기전용 풀 격리가 깔끔). Prisma는 앱 본체 전용으로 유지. Drizzle은 개입 없음. Prisma `$queryRawUnsafe`는 **사용 금지** — 내부적으로 안전 장치가 없어 동적 SQL 실행기로 쓰기 부적합(공식 경고).

## 6. 결정: **RECOMMEND (조건부)**

구현을 권장하되 **세션 별도 분리** 및 아래 게이트를 선행 조건으로 둔다:
- [ ] PostgreSQL `app_readonly` 롤 + 별도 `DATABASE_URL_READONLY` 발급 (DB 관리자 작업)
- [ ] ADMIN 역할 미들웨어 재사용 확인 (회원관리 세션 산출물)
- [ ] 키워드 블랙리스트 테스트(happy + adversarial) 10케이스 이상

게이트 미충족 시 → DEFER. 읽기 전용 롤 없이 앱 레벨 가드만 있으면 사고 위험 과도.

## 7. 다음 세션 TODO

1. DBA 작업: `CREATE ROLE app_readonly LOGIN; GRANT CONNECT ON DATABASE … ; GRANT USAGE ON SCHEMA public; GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly; ALTER DEFAULT PRIVILEGES …;`
2. `.env.example`에 `DATABASE_URL_READONLY` 추가(시크릿 커밋 금지 확인).
3. `prisma/schema.prisma`에 `SqlQuery` 추가 → 마이그레이션.
4. `src/lib/sql-runner.ts`(pg Pool, `BEGIN READ ONLY`, `statement_timeout`, 직렬화 헬퍼) 스파이크 구현 + 유닛 테스트.
5. `src/app/sql/page.tsx` + `src/app/api/v1/sql/**` 스캐폴딩, shadcn `dialog`/`table` 설치.
6. 어드버서리얼 테스트: `DROP TABLE users; --`, `SELECT pg_sleep(60)`, `COPY … TO PROGRAM` 등 거절 확인.
