---
title: "PG TIMESTAMP(3) → TIMESTAMPTZ(3) 마이그레이션 시 USING AT TIME ZONE 결정"
date: 2026-04-19
session: 40
tags: [postgresql, prisma, migration, timezone, timestamptz, alter-column]
category: pattern
confidence: high
---

## 문제

`TIMESTAMP(3)` (timezone-naive) 컬럼을 `TIMESTAMPTZ(3)` 로 마이그레이션할 때, `USING` 절에 어떤 timezone 을 적용할지 결정. 잘못 선택하면 모든 시간 데이터가 영구히 시프트.

`ALTER COLUMN ... TYPE TIMESTAMPTZ(3) USING <expr>` 의 `<expr>` 부분.

## 원인

PG `TIMESTAMP` (without time zone) 컬럼에 저장된 값은 `wall-clock` 만 있고 timezone 정보 없음. 동일한 텍스트 `"2026-04-19 14:14:19"` 가:
- KST 14:14 = UTC 05:14 인지
- UTC 14:14 인지
- 어떤 timezone 인지

데이터 자체로는 알 수 없음. 그러나 **저장 시점의 의미** 는 컨텍스트에서 결정됨:
- PG 서버 타임존이 `Asia/Seoul` 이고 INSERT 가 `NOW()` 또는 JS `Date` (어떤 형식이든) 로 들어왔다면, 결과적으로 PG 는 server timezone 의 wall-clock 으로 변환·저장.
- 즉 naive 값의 의미 = "PG server timezone 의 wall-clock".

## 해결

### USING 결정 원칙

```sql
ALTER TABLE foo
  ALTER COLUMN ts TYPE TIMESTAMPTZ(3)
    USING ts AT TIME ZONE '<PG server timezone>';
```

**`<PG server timezone>` = `SHOW TIMEZONE` 결과** (예: `'Asia/Seoul'`).

`AT TIME ZONE 'Asia/Seoul'` 의 의미: timezone-naive 값을 KST 로 해석 → UTC offset 명시 timestamptz 로 변환.

### 검증

```sql
-- 마이그레이션 전: naive
SELECT ts FROM foo LIMIT 1;
--   ts
-- 2026-04-19 14:14:19.232

-- 마이그레이션 후: timestamptz (+09 offset 명시)
SELECT ts FROM foo LIMIT 1;
--   ts
-- 2026-04-19 14:14:19.232+09

-- UTC 로 환산: 정확히 9h 차이
SELECT ts AT TIME ZONE 'UTC' AS utc_value FROM foo LIMIT 1;
--   utc_value
-- 2026-04-19 05:14:19.232
```

사용자 visible wall-clock (KST) 보존됨. 새로 INSERT 되는 row 는 정확한 UTC ms 로 저장.

### 안전 절차

1. **백업**: `pg_dump -F c -f backup.dump <db>`
2. **dry-run**: 마이그레이션 SQL 을 `BEGIN; <ALTERs>; ROLLBACK;` 으로 감싸서 검증. ALTER COLUMN 실패하면 ROLLBACK 으로 원복.
3. **실제 적용**: `prisma migrate deploy` 또는 직접 psql.
4. **검증**: 샘플 row 의 wall-clock 시각이 마이그레이션 전후 동일한지 확인.

### Prisma schema 측

```prisma
model Foo {
  ts DateTime @map("ts") @db.Timestamptz(3)
}
```

`@db.Timestamptz(3)` annotation 으로 Prisma 가 timestamptz 컬럼임을 인식. `prisma generate` 재실행 후 client 재생성.

## 다른 해결 옵션 (검토함)

| 옵션 | 단점 |
|------|------|
| `USING ts AT TIME ZONE 'UTC'` | naive 를 UTC 로 가정 → 사용자 visible 시각이 9h 시프트 (KST 환경) |
| `USING ts::timestamptz` | 명시적 timezone 없이 PG 가 server timezone 으로 자동 변환 — `AT TIME ZONE '<server tz>'` 와 동등하지만 의도가 모호. 명시 권장 |
| 컬럼 그대로 두고 회피 코드 영구화 | 매 새 코드에서 `NOW() - INTERVAL` 패턴 강제 + Prisma ORM filter 사용 불가 |

## 한계 — Prisma 7 adapter-pg binding-side TZ 시프트

마이그레이션 후에도 Prisma 7 adapter-pg 가 timestamptz 컬럼에서 JS Date binding/parsing 시 9h 시프트가 별도 존재함이 세션 40 E2E 에서 재확인. 즉 컬럼 변경만으로는 ORM `findMany({where:{ts:{lt: jsDate}}})` 가 정상 동작 안 함.

→ 별도 CK `2026-04-19-prisma-orm-tz-naive-filter-gotcha.md` 참조. 정공법은 SELECT cutoff 를 PG 측 `NOW() - INTERVAL` 로 위임 + `ts::text` 캐스팅.

## 교훈

1. **USING 절 결정의 핵심은 "naive 값이 어떤 timezone 의 wall-clock 인가"** — PG 서버 timezone 이 default. `SHOW TIMEZONE` 으로 확인 후 동일 값 명시.
2. **마이그레이션 dry-run 은 무료 보험** — `BEGIN ... ROLLBACK` 으로 SQL 검증. 실패 row 가 있으면 USING 절 재검토.
3. **TIMESTAMPTZ 가 만병통치약은 아님** — Prisma 등 ORM 의 binding 측 동작이 별도. 컬럼 변경 + ORM filter 동작 검증 둘 다 필요.

## 관련 파일

- `prisma/migrations/20260419180000_use_timestamptz/migration.sql` — 17 테이블 ALTER 패턴
- `prisma/schema.prisma` — 47 컬럼에 `@db.Timestamptz(3)` 적용

## 관련 솔루션

- `2026-04-19-pg-timestamp-naive-js-date-tz-offset.md` — TIMESTAMP(3) 의 9h 오프셋 발생 원인
- `2026-04-19-prisma-orm-tz-naive-filter-gotcha.md` — TIMESTAMPTZ 마이그레이션 후에도 남는 binding-side 시프트
