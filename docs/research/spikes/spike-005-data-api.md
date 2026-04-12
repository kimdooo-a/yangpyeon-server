# Spike 005 — Data API (Supabase/PostgREST 스타일 자동 REST)

- 작성일: 2026-04-12
- 상태: Research
- 스택: Next.js 15 + Prisma + PostgreSQL + WSL2/PM2

## 1. 목적

DB 스키마(User/Folder/File)에서 REST 엔드포인트를 자동 생성하여, 프론트/외부 클라이언트가 `/api/v1/data/[table]?column=eq.value` 형태로 Supabase Data API와 동일한 DX를 얻도록 한다. 개별 라우트를 손으로 쓰는 비용을 제거하고, 필터/정렬/페이징/셀렉트 프로젝션을 쿼리스트링으로 일관되게 노출한다.

## 2. GitHub 레퍼런스

1. **PostgREST/postgrest** — https://github.com/PostgREST/postgrest
   - Haskell로 작성된 공식 구현. Postgres 테이블/뷰/함수를 즉시 REST로 노출. RLS와 JWT claim을 `SET LOCAL role`로 매핑.
   - 통합 방식: 별도 바이너리를 사이드카로 띄우고 Next.js는 `/api/v1/data/*`를 rewrite로 프록시. 운영 부담은 있으나 필터 문법/임베딩을 공짜로 얻음.

2. **omar-dulaimi/prisma-trpc-generator** — https://github.com/omar-dulaimi/prisma-trpc-generator (+ **koskimas/kysely** 계열의 introspection 패턴)
   - Prisma DMMF를 읽어 CRUD 라우터를 빌드타임에 생성. 본 스파이크는 "런타임에 `prisma[model]` delegate를 동적 접근"하는 변형 전략을 택한다.
   - 참고: **chax-at/prisma-filter** (https://github.com/chax-at/prisma-filter) — 쿼리스트링→Prisma `where` 번역 레퍼런스.

3. **subzerocloud/subzero** — https://github.com/subzerocloud/showcase
   - PostgREST 호환 문법을 Node/Deno에서 재현. tRPC/Zodios는 "타입 공유된 RPC"가 핵심이라 테이블 단위 필터 문법이 없다 — 반면 PostgREST 스타일은 **스키마 reflection + 쿼리 DSL**이 핵심. 차별점: tRPC는 DX 정적 계약, Data API는 **스키마 즉시성**과 **URL 표현력**.

## 3. 공식 Docs

- PostgREST Tables & Views: https://postgrest.org/en/stable/references/api/tables_views.html
  - Operator 목록: `eq, neq, gt, gte, lt, lte, like, ilike, in, is, fts, cs, cd`.
  - Resource Embedding: `?select=*,files(*)`로 FK 따라 join.
  - Pagination: `Range: 0-9` 요청 + `Content-Range: 0-9/42` 응답.
  - RLS: DB 레벨 `CREATE POLICY`로 행 필터. PostgREST는 JWT role을 `SET LOCAL`로 전환.
- Prisma DMMF: `@prisma/internals`의 `getDMMF({ datamodel })`로 모델/필드 메타 획득. `Prisma.dmmf.datamodel.models`도 런타임에서 접근 가능.
- Next.js 15 동적 라우트: `app/api/v1/data/[table]/route.ts`로 단일 catch. 필요 시 `[[...path]]`로 단건 조회(`/data/users/:id`) 확장. `params`는 **async** (`const { table } = await params`).

## 4. 자체 구현 난이도 — **M (중간)**

- 모델 3개 + FK 단순 → PostgREST 전체 기능 재현은 불필요. 필터 오퍼레이터 6-7개 + pagination + orderBy + select만 재현하면 80% 커버.
- Prisma delegate 동적 접근: `(prisma as any)[modelName].findMany({ where, orderBy, skip, take, select })` — 타입 안전성만 주의.
- Resource Embedding(관계 join)은 Prisma `include`로 1:1 매핑 가능하나, 재귀/중첩 필터는 복잡도 급증 → **v1에서는 제외**.
- 예상 공수: 핸들러/파서/allowlist/RBAC 포함 **0.5~1일**. 테스트 포함 1.5일.
- 위험: ① `any` 캐스팅 남용, ② 복합 OR/AND 파싱, ③ N+1 include — 모두 v1 범위 제한으로 회피.

## 5. 권장 아키텍처

```
src/lib/data-api/
├── allowlist.ts      # { users: { select: [...], write: false }, folders: {...}, files: {...} }
├── operators.ts      # "eq.test" → { equals: "test" }, in.(a,b) → { in: [...] }
├── query-parser.ts   # URLSearchParams → Zod 검증 → { where, orderBy, skip, take, select }
├── rbac.ts           # MANAGER+ read, ADMIN write, User 테이블은 본인 행만
└── handler.ts        # GET/POST/PATCH/DELETE 공용
src/app/api/v1/data/[table]/route.ts         # 목록/생성
src/app/api/v1/data/[table]/[id]/route.ts    # 단건 조회/수정/삭제
```

- **Allowlist 우선**: schema 전량 노출 금지. 테이블별 허용 컬럼(select)/쓰기여부/필수 필터 명시.
- **오퍼레이터 파서**: `eq|neq|gt|gte|lt|lte|like|ilike|in` → Prisma filter. Zod `z.enum`으로 화이트리스트.
- **Pagination**: `?limit=20&offset=40` 기본 + 옵션 `Range` 헤더. 응답 `Content-Range` 세팅, 최대 limit 100 캡.
- **orderBy**: `?order=created_at.desc,name.asc` → `[{createdAt:'desc'}, {name:'asc'}]`.
- **Select 프로젝션**: `?select=id,email,name` → `{ select: { id:true, email:true, name:true } }` — allowlist 교집합만.
- **Zod 검증**: 쿼리스트링 전체를 `z.object`로 1차 파싱 후 오퍼레이터 파싱. 파싱 실패 시 400 + 구체 메시지.

## 6. 보안 고려

- **RLS 대체 = Prisma where 조건 주입**: 핸들러 진입 시 세션의 `userId`/`role`을 읽어 **강제 `where` 병합**. 예: `User` 테이블은 `role !== 'ADMIN'`이면 `where.id = session.userId` 병합. `File`은 `ownerId = session.userId` 강제 (MANAGER 제외).
- **Allowlist가 1차 방어선**: `passwordHash` 같은 컬럼은 select allowlist에서 영구 제외. 응답 직렬화 단계에서도 deny-list 2중 필터.
- **쓰기 제한**: ADMIN만 POST/PATCH/DELETE. User 테이블 쓰기는 기존 `/api/v1/members` 전용 라우트로 위임(Data API는 read-only 권장).
- **Rate limit**: 기존 미들웨어 재사용. 테이블당 1분 60회 기본.
- **감사 로그**: 쓰기 요청은 `audit` 테이블에 actor/table/action/diff 기록.
- **SQL 인젝션**: Prisma 파라미터 바인딩으로 원천 차단. `orderBy` 컬럼명만 allowlist 교차 검증하면 안전.

## 7. 결정

- **PostgREST 사이드카 도입 안 함** — 운영 복잡도(Haskell 바이너리, Cloudflare Tunnel 포트 추가)가 모델 3개 규모에 과함.
- **Prisma DMMF + Next.js 동적 라우트로 자체 구현** — 난이도 M, 공수 1.5일. Supabase 문법 부분 호환(`?col=eq.val`, `select=`, `order=`).
- v1 스코프: **Read 전용**, 테이블 3개, 오퍼레이터 9개, 단일 테이블 only(임베딩 제외).

## 8. 다음 TODO

- [ ] ADR 작성: `docs/research/decisions/ADR-005-data-api.md` (본 결정 확정)
- [ ] `src/lib/data-api/` 스켈레톤 + Zod 스키마 + allowlist 초안
- [ ] `/api/v1/data/[table]/route.ts` GET 구현 + 해피패스 테스트
- [ ] 오퍼레이터 파서 단위 테스트 (eq/in/like 경계값)
- [ ] RBAC 주입 테스트: USER가 타인 파일 조회 시 빈 배열 반환 검증
- [ ] 응답 deny-list(`passwordHash`) 직렬화 테스트
- [ ] v2 범위 검토: Resource Embedding(`select=*,files(*)`), 쓰기 엔드포인트, Range 헤더
