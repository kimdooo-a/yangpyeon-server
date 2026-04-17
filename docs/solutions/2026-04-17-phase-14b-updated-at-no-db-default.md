---
title: Prisma @updatedAt 필드의 DB DEFAULT 부재 — Table Editor raw SQL INSERT가 NOT NULL 위반
date: 2026-04-17
session: 22
tags: [prisma, postgresql, phase-14b, table-editor, raw-sql, migration, schema]
category: bug
confidence: high
---

## 문제

세션 22 프로덕션 E2E(curl 기반) 재수행 중 `/api/v1/tables/folders` POST가 **updated_at 컬럼 누락 시 500**을 반환:

```bash
# Payload: id + name + owner_id만 제공 (updated_at "keep")
curl -X POST .../api/v1/tables/folders \
  -d '{"values":{"id":{...},"name":{...},"owner_id":{...}}}'
# → {"success":false,"error":{"code":"QUERY_FAILED",
#     "message":"null value in column \"updated_at\" of relation \"folders\" violates not-null constraint"}}
# __HTTP__500
```

`updated_at`을 명시적으로 제공하면 200 통과. 하지만 Phase 14b `RowFormModal`은 `updated_at`을 자동 주입하지 않으며 3상태 기본값이 `"keep"`이라 **현재 프로덕션 UI "행 추가"를 누르면 실사용자가 매번 500을 받게 됨**.

## 원인

PostgreSQL `\d folders` 실사 결과:
```
 created_at | timestamp(3) | not null | CURRENT_TIMESTAMP  ← DB DEFAULT O
 updated_at | timestamp(3) | not null |                    ← DB DEFAULT X
```

Prisma 스키마 관점:
- `@default(now())` → **마이그레이션이 SQL DEFAULT를 생성**(`created_at`)
- `@updatedAt` → **Prisma 클라이언트가 쓰기 시점마다 값 갱신**, **DB 레벨 DEFAULT는 생성하지 않음**

Phase 14b CRUD는 Prisma 클라이언트가 아니라 `runReadwrite`의 **raw SQL INSERT** 경로이므로 `@updatedAt` 메타데이터의 혜택을 받지 못함. 결과: NOT NULL + DEFAULT 없음 → INSERT 실패.

동일 구조의 다른 테이블도 위험: `User`, `File`, `SqlQuery`, `EdgeFunction`, `Webhook`, `CronJob`, `ApiKey`, `LogDrain`(Prisma `@updatedAt` 사용 시 전부 동일).

## 세션 21 통과 기록과의 관계

`docs/logs/journal-2026-04-17.md` 토픽 10의 "S8 POST folders → 200 + row.id 반환"은 실제 payload 기록이 누락돼 있음. 재현 결과를 종합하면 세션 21 curl은 **updated_at을 수동으로 포함**했던 것으로 판단. 즉 버그는 세션 21 → 세션 22 사이에 회귀된 것이 아니라, **세션 21이 curl로 검증했을 뿐 UI keep 경로는 끝까지 드러나지 않았음**.

## 해결 방안

### 권장 — Option A: 마이그레이션으로 DB DEFAULT 추가

Prisma 스키마에서 `@default(now())`를 `@updatedAt`과 **병기**:

```prisma
// prisma/schema.prisma
model Folder {
  ...
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamp(3)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamp(3)
  //                  ^^^^^^^^^^^^^^^ 추가 — 마이그레이션이 SQL DEFAULT 생성
}
```

변경 후 `npx prisma migrate dev -n "add_updated_at_default"` → 생성된 SQL:
```sql
ALTER TABLE "folders" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
```

영향:
- raw SQL INSERT가 updated_at을 생략해도 DB가 기본값 채움 (근본 해결)
- Prisma 클라이언트 쓰기 시 `@updatedAt`의 갱신 동작은 유지 (클라이언트가 값을 덮어씀)
- Phase 14c 인라인 편집/낙관적 잠금 설계에도 DB DEFAULT 전제가 더 자연스러움

적용 대상: `updatedAt DateTime @updatedAt` 선언된 모든 모델. 현재 스키마에서는 최소 `User`, `Folder`, `File`, `SqlQuery`, `EdgeFunction`, `Webhook`, `CronJob`, `ApiKey`, `LogDrain`. `grep @updatedAt prisma/schema.prisma`로 확인 후 일괄 병기.

### 보조 — Option B: API 레이어에서 자동 주입

마이그레이션 없이 해결하려면 `src/app/api/v1/tables/[table]/route.ts` POST에서 `@updatedAt` 컬럼을 감지해 `NOW()` 주입:

```ts
// information_schema + pg_attribute로 컬럼 coment/default 조회는 한계
// → 화이트리스트 Set<string> 선언 또는 Prisma DMMF에서 추출해 런타임 주입
const AUTO_UPDATED_AT = new Set(["updated_at"]); // 실제는 스키마 introspection

// insertCols 구성 후 보정
if (!insertCols.includes("updated_at") && columnMap.has("updated_at")) {
  insertCols.push("updated_at");
  insertVals.push(new Date());
}
```

단점: raw SQL 경로와 ORM 의도의 불일치를 애플리케이션에서 덮는 패치. DB 스키마가 진실 소스가 아닌 상태 유지.

### 보조 — Option C: UI가 수동 주입

`RowFormModal`이 `create` 모드이고 컬럼명이 `updated_at`/`created_at` 패턴일 때 `action="set", value=new Date().toISOString()` 기본값으로 세팅. API 로직 변경 없음. 단점: UX 혼란(사용자가 "왜 자동 값이 들어가 있지?")과 여전히 ORM 세계에서 동일 필드의 의미가 흔들림.

**결론**: Option A가 가장 깔끔. Phase 14c 1순위.

## 검증 완료 (세션 22 curl E2E)

updated_at 수동 주입 후 전체 CRUD 체인 통과 확인:

| 시나리오 | HTTP | 결과 |
|---|---|---|
| S8a INSERT (id+name+owner_id+updated_at) | 200 | row 반환, `created_at` DB 기본값 자동 |
| S8b PATCH (name만) | 200 | 정상 업데이트 |
| S8c DELETE | 200 | `{deleted:true}` |
| S9 감사 로그 | — | TABLE_ROW_INSERT/UPDATE/DELETE 3건 영속 |
| S10 users/api_keys/_prisma_migrations INSERT | 403 | OPERATION_DENIED |
| S11 edge_function_runs INSERT | 403 | "삭제만 가능" (DELETE-only) |
| S11 edge_function_runs DELETE | 404 | 정책 통과, 행 부재 NOT_FOUND |

## 교훈

1. **"ORM 메타데이터"와 "DB 스키마"는 별개의 진실 소스다**. Prisma `@updatedAt`이 DB DEFAULT를 만들지 않는다는 사실을 raw SQL 경로가 등장하는 순간 반드시 의식해야 한다. 반대로 `@default(now())`는 DB DEFAULT를 만든다 — 이 비대칭이 Phase 14b 같은 raw SQL CRUD에서 버그로 귀결됨.
2. **curl 검증은 "payload 편의"가 검증 대상의 실사용 경로를 왜곡할 수 있다**. 세션 21이 updated_at을 payload에 넣고 "통과"로 기록한 순간, 실사용자의 "keep 기본값"은 검증되지 않았다. E2E curl 스크립트도 **UI 기본값(3상태 keep)을 흉내내는 최소 payload**를 1회차로 두는 습관이 필요.
3. **DB `\d <table>` 한 번이 수천 줄 ORM 문서보다 빠르다**. 비정상 동작 발견 시 `psql \d` 또는 `information_schema.columns`의 `column_default`를 먼저 보는 것이 진실 소스 접근의 지름길.

## 관련 파일

- `prisma/schema.prisma` (모든 `@updatedAt` 선언 — Phase 14c 수정 대상)
- `src/app/api/v1/tables/[table]/route.ts` (POST, Option B 후보)
- `src/components/table-editor/row-form-modal.tsx` (Option C 후보)
- `docs/guides/tables-e2e-manual.md` (S8 매뉴얼에 updated_at 주의 각주 추가)
- `docs/solutions/2026-04-17-information-schema-role-filtering-pk-regression.md` (세션 21 자매 솔루션)
