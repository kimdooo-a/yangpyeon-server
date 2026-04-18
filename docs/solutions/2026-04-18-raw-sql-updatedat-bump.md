---
title: Prisma @updatedAt 클라이언트 한계 — raw SQL UPDATE 경로에서 낙관적 잠금 구현 시 서버측 auto-bump 필수
date: 2026-04-18
session: 24-α
tags: [prisma, postgresql, optimistic-locking, raw-sql, phase-14c, updated_at]
category: bug
confidence: high
---

## 컨텍스트

세션 23에서 `@default(now()) @updatedAt` 병기로 raw SQL **INSERT** 경로의 `NOT NULL` 위반은 해결됨 (`2026-04-17-phase-14b-updated-at-no-db-default.md`). 그러나 세션 24-α Phase 14c-α(인라인 편집 + 낙관적 잠금)를 추가하자 raw SQL **UPDATE** 경로에서 새로운 함정이 드러남.

낙관적 잠금의 전제는 "매 UPDATE마다 `updated_at`이 단조 증가"한다는 것. ORM이 매번 새 값을 써준다는 약속이 깨지면 잠금은 의미를 상실.

## 증상

세션 24-α의 E2E 1차 실행 결과:

| # | 시나리오 | 기대 | 실제 |
|---|----------|------|------|
| C1 | 정상 PATCH (락 일치) | 200 | 200 (PASS) |
| **C2** | **CONFLICT (구 timestamp 재사용)** | **409** | **200 (FAIL — 잠금 무력화)** |

C1을 통과한 직후 동일 `expected_updated_at`으로 다시 PATCH를 보내도 **항상 통과**. WHERE 절의 `updated_at = $M` 비교가 매번 일치한다. 즉 UPDATE 후에도 `updated_at` 값이 변하지 않음.

## 진단

`psql`로 직접 확인:

```sql
SELECT id, name, updated_at FROM folders WHERE id = '<seed>';
-- updated_at = 2026-04-18T05:10:11.234Z

UPDATE folders SET name = 'X' WHERE id = '<seed>';

SELECT id, name, updated_at FROM folders WHERE id = '<seed>';
-- updated_at = 2026-04-18T05:10:11.234Z  ← 동일! 변하지 않음
```

Prisma 스키마는 `@updatedAt` 선언이 있고 마이그레이션도 정상 적용됐지만, **DB 트리거는 생성되지 않음**.

## 근본 원인

Prisma `@updatedAt`은 **PrismaClient 레이어의 마커**:
- ORM이 `prisma.folder.update({...})` 호출을 가로채 자동으로 `updated_at: new Date()`를 SET 절에 주입
- 마이그레이션은 컬럼만 만들고 트리거/DEFAULT 갱신 로직은 만들지 않음
- `@default(now())`는 INSERT 시점의 DB DEFAULT만 작동 (UPDATE는 무관)

Phase 14b/14c의 CRUD는 `runReadwrite("UPDATE folders SET name = $1 WHERE id = $2")` 같은 **raw SQL** 경로 → ORM을 우회 → `updated_at` 정체.

결과: WHERE의 `AND updated_at = $M`이 **항상 첫 INSERT 시점의 값과 일치** → 낙관적 잠금 비교가 매번 성공 → 동시 수정 충돌 미탐지 → 잠금이 사실상 비활성화.

## 해결책

`src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH 핸들러에 **서버측 auto-bump** 로직 주입. 사용자가 `updated_at`을 명시적으로 SET하지 않았고 컬럼이 존재하면 SET 절 끝에 `, updated_at = NOW()`를 자동 추가:

```typescript
// Prisma @updatedAt은 클라이언트 레벨 마커라 raw SQL UPDATE에는 적용되지 않음.
// 낙관적 잠금이 작동하려면 매 UPDATE마다 updated_at이 실제 변화해야 함.
// 사용자가 updated_at을 명시적으로 set하지 않았고 테이블에 컬럼이 있으면 자동 bump.
const hasUpdatedAtCol = meta.colTypeMap.has("updated_at");
const userSetUpdatedAt = setCols.includes("updated_at");
const autoBumpSuffix =
  hasUpdatedAtCol && !userSetUpdatedAt ? ", updated_at = NOW()" : "";

const setSql =
  setCols
    .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
    .join(", ") + autoBumpSuffix;
```

세션 24-β에서 동일 로직을 `src/app/api/v1/tables/[table]/composite/route.ts` (복합 PK PATCH)에도 복제:

```typescript
// auto-bump updated_at (α와 동일)
const hasUpdatedAtCol = meta.colTypeMap.has("updated_at");
const userSetUpdatedAt = setCols.includes("updated_at");
const autoBumpSuffix =
  hasUpdatedAtCol && !userSetUpdatedAt ? ", updated_at = NOW()" : "";
```

## 검증

E2E 2차 (auto-bump 적용 후):

| # | 시나리오 | HTTP | 결과 |
|---|----------|------|------|
| C1 | 정상 PATCH (락 일치) | 200 | PASS — `updated_at` bump 확인 |
| C2 | CONFLICT (구 timestamp) | 409 | PASS — `error.code=CONFLICT` + `current` 포함 |
| C3 | NOT_FOUND | 404 | PASS |
| C4 | LEGACY (락 미제공) | 200 | PASS — 후방 호환 |
| C5 | MALFORMED expected_updated_at | 400 | PASS |
| C6 | 감사 로그 영속 | — | UPDATE=10 / UPDATE_CONFLICT=1 |

세션 24-β E2E B1~B9 (composite PATCH)도 동일 패턴으로 전 PASS.

## 재발 방지

### raw SQL 쓰기 경로 추가 시 체크리스트

1. **UPDATE 경로**: `updated_at` 컬럼이 있고 사용자가 명시 SET하지 않으면 `, updated_at = NOW()` 자동 주입
2. **INSERT 경로**: `@default(now()) @updatedAt` 병기 마이그레이션이 적용되었는지 확인 (세션 23 자산)
3. **신규 모델 추가 시**: `updatedAt DateTime @default(now()) @updatedAt @db.Timestamp(3)` 패턴 강제
4. **신규 raw SQL 엔드포인트 작성 시**: 코드 리뷰 항목으로 "auto-bump 적용 여부" 명시

### 후속 ADR 메모 (세션 24 미실행)

이상적인 근본 해결은 **PostgreSQL Trigger**로 컬럼 정책을 DB에 내리는 것. 후보:

```sql
CREATE OR REPLACE FUNCTION trg_bump_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER folders_updated_at_bump
  BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION trg_bump_updated_at();
```

장점: ORM/raw SQL 경로 모두 자동 적용, 진실 소스가 DB로 이동
단점: Prisma 마이그레이션이 트리거를 자동 생성하지 않음 → 수동 SQL 마이그레이션 + 모든 모델 누락 위험. 현재 9개 모델 일관성 비용이 크므로 보류.

## 교훈

1. **"ORM 메타데이터"와 "DB 동작"은 별개의 진실 소스**. `@default(now())`는 DB DEFAULT를 만들지만 `@updatedAt`은 만들지 않는다 — 이 비대칭이 raw SQL 경로의 두 종류 버그(INSERT NOT NULL, UPDATE 잠금 무력화)로 귀결.
2. **낙관적 잠금은 "타임스탬프가 단조 증가"라는 invariant에 의존**. 이 invariant를 누가 보장하는지(ORM/Trigger/애플리케이션) 명시적으로 결정해야 한다.
3. **E2E 시나리오 C2(연속 PATCH 같은 stamp)는 잠금 검증의 최소 회로**. C1만 PASS는 의미 없음 — C2가 409가 되어야 잠금이 실제 작동.

## 관련 파일

- `src/app/api/v1/tables/[table]/[pk]/route.ts` (L186-205: auto-bump 로직)
- `src/app/api/v1/tables/[table]/composite/route.ts` (L224-234: 복합 PK 동일 로직)
- `prisma/schema.prisma` (모든 `@updatedAt` 선언 — 9개 모델)
- `scripts/e2e/phase-14c-alpha-curl.sh` (C1~C6 매트릭스)
- `scripts/e2e/phase-14c-beta-curl.sh` (B1~B9 매트릭스)
- `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md`

## 관련 솔루션

- [`2026-04-17-phase-14b-updated-at-no-db-default.md`](./2026-04-17-phase-14b-updated-at-no-db-default.md) — 같은 비대칭의 INSERT 측 사례 (세션 22~23)
- [`2026-04-18-timestamp-precision-optimistic-locking.md`](./2026-04-18-timestamp-precision-optimistic-locking.md) — 잠금 비교 실패의 또 다른 원인 (정밀도 불일치)
- [`2026-04-17-prisma-migration-windows-wsl-gap.md`](./2026-04-17-prisma-migration-windows-wsl-gap.md) — 후속 trigger 마이그레이션 시 활용할 워크플로우
