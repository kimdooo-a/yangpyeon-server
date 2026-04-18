---
title: PostgreSQL TIMESTAMP(µs) vs TIMESTAMP(3)(ms) 정밀도 불일치가 낙관적 잠금 WHERE 매칭을 항상 깨트림
date: 2026-04-18
session: 24-β
tags: [postgresql, prisma, timestamp, precision, optimistic-locking, phase-14c, gotcha]
category: bug
confidence: high
---

## 컨텍스트

세션 24-β Phase 14c-β 복합 PK 지원 검증을 위해 임시 테스트 테이블 `_test_composite`를 생성. 처음에는 `TIMESTAMP DEFAULT NOW()`로 정의(PostgreSQL 기본 정밀도 = µs).

α 버그(폴더명 `_composite` private 처리 — `2026-04-18-nextjs-private-folder-routing.md`)를 해결하고 E2E 2차 실행 → 라우팅은 정상화됐으나 **B1(정상 PATCH 락 일치)이 여전히 409 CONFLICT** 반환. 잠금 비교가 실패할 이유가 없는 시나리오에서 실패.

## 증상

```bash
# Seed INSERT 응답에서 updated_at 추출
INSERT_RES=$(curl -X POST .../api/v1/tables/_test_composite ...)
INITIAL_UPDATED_AT=$(echo "$INSERT_RES" | python3 -c '...["data"]["row"]["updated_at"]')
# → INITIAL_UPDATED_AT = "2026-04-18T05:22:22.739Z"

# B1: 즉시 PATCH (방금 받은 값 그대로 사용)
curl -X PATCH .../api/v1/tables/_test_composite/composite \
  -d "{\"pk_values\":{...},\"values\":{...},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}"
# → HTTP 409
# → {"success":false,"error":{"code":"CONFLICT",
#     "message":"행이 다른 세션에서 수정되었습니다",
#     "current":{"...","updated_at":"2026-04-18T05:22:22.739Z"}}}
```

`expected_updated_at`과 응답의 `current.updated_at`이 **문자열로 완전히 동일** — 그런데 SQL WHERE 비교는 실패.

## 진단

`psql`로 직접 실측:

```sql
SELECT updated_at, EXTRACT(EPOCH FROM updated_at) * 1000000 AS micros
FROM _test_composite
WHERE tenant_id = '<seed>' AND item_key = 'k1';
-- updated_at | 2026-04-18 05:22:22.739821
-- micros     | 1745214142739821
```

DB는 µs까지(`.739821`) 저장. pg 드라이버의 ISO 직렬화는 ms까지만(`.739`) 노출. JS `Date` 객체도 ms 정밀도. WHERE에 들어가는 값은 `.739000`로 잘려서 `.739821`과 불일치.

```
저장된 실제 값:    2026-04-18T05:22:22.739821 (µs)
응답의 직렬화 값:  2026-04-18T05:22:22.739    (ms로 truncate)
다시 보낸 expected_updated_at → JS Date → .739000 → SQL WHERE
DB 비교:           .739000 ≠ .739821 → FALSE → rowCount=0 → CONFLICT
```

비교는 **항상 실패**. C2/B2 같은 "진짜 CONFLICT" 시나리오와 구분 불가능한 false negative.

## 근본 원인

**TIMESTAMP 정밀도 불일치**:
- PostgreSQL `TIMESTAMP` (정밀도 미지정) = `TIMESTAMP(6)` = µs (마이크로초)
- PostgreSQL `TIMESTAMP(3)` = ms (밀리초) — Prisma의 `@db.Timestamp(3)` 매핑
- JavaScript `Date` = ms 정밀도
- pg 노드 드라이버 ISO 직렬화 = ms (`.toISOString()`은 항상 ms)

라운드트립 손실:
1. `INSERT ... DEFAULT NOW()` → DB에 µs 정밀도로 저장 (`.739821`)
2. `RETURNING *` → 드라이버가 ms로 truncate (`.739`)
3. 클라이언트 응답 → `.toISOString()` (`.739Z`)
4. 다시 보낸 `expected_updated_at` → `new Date(...)` → ms 정밀도 (`.739000`)
5. WHERE 비교 → `.739000 ≠ .739821` → 매칭 실패

**프로덕션 9개 모델은 모두 Prisma `@db.Timestamp(3)`** 사용 → ms 정밀도로 저장 → 라운드트립 안전. 임시 `_test_composite`만 기본 `TIMESTAMP`(µs)로 만들었기 때문에 이 버그가 노출됨.

## 해결

테스트 테이블을 `TIMESTAMP(3)` 정밀도로 재생성:

```sql
DROP TABLE IF EXISTS _test_composite;
CREATE TABLE _test_composite (
  tenant_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMP(3) DEFAULT NOW(),  -- ← TIMESTAMP(3) 명시
  PRIMARY KEY (tenant_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON _test_composite TO app_readwrite;
GRANT SELECT ON _test_composite TO app_readonly;
```

스크립트 주석에 명시 (`scripts/e2e/phase-14c-beta-curl.sh`):

```bash
# Setup/Teardown은 외부에서 수행 (비대화형 sudo 제약 회피):
#   wsl -d Ubuntu -u postgres -- psql -d luckystyle4u -c "
#     CREATE TABLE _test_composite (..., updated_at TIMESTAMP(3) DEFAULT NOW(), ...);
#       -- TIMESTAMP(3)가 중요: Prisma schema의 실제 테이블과 동일한 ms 정밀도. TIMESTAMP(µs)면
#       -- pg 드라이버 ISO 직렬화 시 ms 절단으로 낙관적 잠금 비교가 어긋남.
```

## 검증

`TIMESTAMP(3)` 재생성 후 E2E 3차 — B1~B9 전 PASS:

| # | 시나리오 | HTTP | 결과 |
|---|----------|------|------|
| B1 | 정상 PATCH (락 일치) | 200 | PASS — TIMESTAMP(3) 정렬로 WHERE 매칭 성공 |
| B2 | CONFLICT (구 timestamp) | 409 | PASS — `current` 포함 |
| B3~B7 | 각종 가드 | 4xx | PASS |
| B8 | DELETE | 200 | PASS |
| B9 | 감사 로그 영속 | — | UPDATE=1, CONFLICT=3, DELETE=2 |

프로덕션 9개 모델(`folders`, `users`, `files`, `sql_queries`, `edge_functions`, `webhooks`, `cron_jobs`, `api_keys`, `log_drains`)은 이미 `@db.Timestamp(3)` 적용 상태 → α 시나리오 C1~C6도 처음부터 정상 통과 (이 버그는 β 임시 테이블에서만 노출).

## 재발 방지

### 신규 테이블 추가 시 체크리스트

1. **모든 timestamp 컬럼은 명시적으로 `TIMESTAMP(3)`** — 기본값(`TIMESTAMP` = µs) 절대 사용 금지
2. **Prisma 모델 추가 시 `@db.Timestamp(3)` 강제**:
   ```prisma
   createdAt DateTime @default(now()) @map("created_at") @db.Timestamp(3)
   updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamp(3)
   ```
3. **수동 마이그레이션 SQL에서도 `TIMESTAMP(3)` 명시** — `2026-04-17-prisma-migration-windows-wsl-gap.md`의 manual SQL 패턴에 적용
4. **테스트/임시 테이블도 동일 정밀도** — 검증 결과가 production과 발산하지 않도록

### Prisma 스키마 lint 룰 후속 검토 (세션 24 미적용)

`prisma format`은 정밀도 검증 안 함. 후속 ADR 또는 pre-commit hook으로:

```bash
# 검토 후보 — schema.prisma에서 @updatedAt/@default(now())가 있는 라인이 @db.Timestamp(3)을 포함하는지 확인
grep -E "(@updatedAt|@default\(now\(\)\))" prisma/schema.prisma | grep -v "@db.Timestamp(3)" && echo "MISSING TIMESTAMP(3)"
```

### 디버깅 단축 경로

낙관적 잠금이 "이유 없이" CONFLICT를 반환하면 정밀도 의심:

```sql
-- 진단 쿼리: 같은 행을 두 번 SELECT해 정밀도 확인
SELECT updated_at::text, EXTRACT(MICROSECONDS FROM updated_at) FROM <table> WHERE <pk>;
-- 결과의 micros가 ".XXX000" (ms 단위)이 아니라 ".XXXYYY" (µs)면 정밀도 불일치 의심
```

## 교훈

1. **DB 정밀도와 직렬화 정밀도가 다르면 round-trip 비교는 깨진다**. 이 함정은 "값이 같아 보이는데 비교가 실패"하는 형태로 드러나 디버깅이 매우 어렵다.
2. **Prisma `@db.Timestamp(3)`은 우연이 아닌 설계 결정** — 모든 timestamp가 ms 정밀도라는 invariant를 보장하기 위함. 이 invariant가 깨지는 순간(테스트 테이블, 직접 SQL 마이그레이션 등) 낙관적 잠금/idempotency key/dedupe 등 timestamp 비교 의존 로직 전체가 위험.
3. **테스트 환경은 production 정밀도와 정확히 일치해야 한다**. 1자리 정밀도 차이가 100% 재현되는 false negative를 만든다.
4. **`column::text`로 직접 실측이 가장 빠른 진단**. JSON 응답이나 ORM이 직렬화를 거친 값을 비교하면 실제 저장값을 확인할 수 없다.

## 관련 파일

- `scripts/e2e/phase-14c-beta-curl.sh` (L8-13: TIMESTAMP(3) 주석)
- `prisma/schema.prisma` (9개 모델의 `@db.Timestamp(3)` — 정상 사례)
- `src/app/api/v1/tables/[table]/composite/route.ts` (낙관적 잠금 WHERE)
- `docs/handover/260418-session24-phase-14c-beta.md` (버그 2 상세)

## 관련 솔루션

- [`2026-04-18-nextjs-private-folder-routing.md`](./2026-04-18-nextjs-private-folder-routing.md) — 본 버그 직전에 발견된 β의 첫 번째 함정 (라우팅)
- [`2026-04-18-raw-sql-updatedat-bump.md`](./2026-04-18-raw-sql-updatedat-bump.md) — 낙관적 잠금이 "성공"하는 false positive (auto-bump 부재)
- [`2026-04-17-phase-14b-updated-at-no-db-default.md`](./2026-04-17-phase-14b-updated-at-no-db-default.md) — 같은 컬럼의 INSERT 측 함정 (NOT NULL)
