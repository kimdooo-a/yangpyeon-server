---
title: "PG TIMESTAMP(3) timezone-naive 컬럼 + Prisma JS Date 변환 시 KST↔UTC 9시간 오프셋 누적"
date: 2026-04-19
session: 34
tags: [postgresql, prisma, timezone, rate-limit, debugging, timestamp]
category: bug-fix
confidence: high
---

## 문제

DB-backed rate limiter의 `Retry-After` 헤더가 60초가 아닌 **약 9시간(32453초)** 으로 응답되는 현상.

**증상**:
```
HTTP/1.1 429 Too Many Requests
retry-after: 32453    # 기대값: 60
```

**재현 조건**:
- Postgres 컬럼: `"window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` (timezone-naive)
- 클라이언트 코드: `const elapsedMs = Date.now() - windowStart.getTime();`
- 시스템 timezone: KST (UTC+9)

`32453s ≈ 9h 0m 53s` — 정확히 KST↔UTC 오프셋(32400s) + 약간의 elapsed.

## 원인

**핵심**: `TIMESTAMP(3)` (TIMESTAMPTZ 아님)은 timezone 정보를 저장하지 않는 naive timestamp.

1. PG가 `NOW()` (UTC 기준) 값을 timestamp 컬럼에 저장 — timezone 메타정보 손실.
2. Prisma가 이 값을 JS `Date` 객체로 변환할 때, JS는 **로컬 시간대(KST)** 로 해석.
3. 결과: JS Date는 같은 wall-clock 값을 9시간 미래로 인식 (UTC 기준에서).
4. `Date.now() - windowStart.getTime()` = `현재 UTC ms - (현재 UTC + 9h ms)` = **-9h ms**.
5. `windowMs - elapsedMs = 60_000 - (-32_400_000) = 32_460_000ms = 32460초` ≈ 측정값.

이것은 Prisma의 버그가 아닌 **timezone-naive 컬럼 사용의 의도된 결과** — naive timestamp를 timezone 있는 표현으로 변환할 때 어떤 timezone을 가정할지는 시스템 정책.

## 해결

**원칙**: 시간 계산은 가능한 한 **DB 한 곳에 위임**. 클라이언트 시간대 변환이 끼어들면 디버깅 지옥.

### Before (버그)

```typescript
const rows = await prisma.$queryRaw<{ hits: number; window_start: Date }[]>`
  INSERT INTO rate_limit_buckets (...) VALUES (...)
  ON CONFLICT ... RETURNING hits, window_start
`;

// ❌ 클라이언트 측 elapsed 계산 — timezone 변환 사이드이펙트
const elapsedMs = Date.now() - row.window_start.getTime();
const resetMs = Math.max(0, windowMs - elapsedMs);
```

### After (수정)

```typescript
const rows = await prisma.$queryRaw<{ hits: number; reset_ms: string }[]>`
  INSERT INTO rate_limit_buckets (...) VALUES (...)
  ON CONFLICT ... RETURNING
    hits,
    GREATEST(0, EXTRACT(EPOCH FROM (
      rate_limit_buckets.window_start + (${windowMs} * INTERVAL '1 ms') - NOW()
    )) * 1000)::text AS reset_ms
`;

// ✅ PG가 직접 잔여 ms 계산 — timezone 변환 없음
// EXTRACT(EPOCH ...)는 NUMERIC → Prisma string 직렬화 → parseFloat 필수
const resetMs = Math.max(0, Math.floor(parseFloat(row.reset_ms)));
```

### 검증
- Before: `Retry-After: 32453` (9시간 오프셋)
- After: `Retry-After: 60` (정확)

## 다른 해결 옵션 (검토함)

| 옵션 | 장점 | 단점 |
|------|------|------|
| 컬럼 타입 `TIMESTAMPTZ` 변경 | 정공법, JS Date도 정확 | 마이그레이션 필요, sessions/rate_limit_buckets 등 다수 테이블 영향 |
| Node.js `TZ=UTC` 환경변수 | 컬럼 변경 없음 | 다른 시간 표시(로그 등)에 영향, 운영 혼란 |
| **PG 측 계산 위임** ✅ | 최소 침습, 인프라 변경 0 | SQL이 약간 복잡해짐, parseFloat 필요 |

본 케이스는 옵션 3 채택 — Prisma 마이그레이션은 추가 안전 검증 필요하고, 운영 영향 없음.

## 교훈

1. **`TIMESTAMP` (naive) 사용 시 클라이언트 측 시간 산술 금지** — Prisma `Date` 변환에 timezone 가정이 끼어든다. `TIMESTAMPTZ` 사용하거나 PG 측 산술로 위임.
2. **`EXTRACT(EPOCH FROM ...)` 결과는 NUMERIC** — Prisma `$queryRaw`에서 string으로 직렬화되므로 명시적 `parseFloat`/`parseInt` 필수. 또는 `::float` 캐스트로 PG 측에서 더블 정밀도 강제.
3. **9시간(=KST 오프셋)이 결과에 나타나면 timezone 의심** — 가산/감산 부호도 단서: `+9h`면 UTC→KST 변환이, `-9h`면 KST→UTC 변환이 의도치 않게 발생.
4. **본 프로젝트 영향 범위**: `sessions.created_at/last_used_at/expires_at`, `rate_limit_buckets.window_start`, 그 외 `TIMESTAMP(3)` 컬럼 모두 동일 함정. Sessions는 expiry를 PG 측 `WHERE expires_at < NOW()`로 처리하니 안전. 새 코드 작성 시 클라이언트 elapsed 계산 패턴 자체를 회피.

## 관련 파일

- `src/lib/rate-limit-db.ts` — 수정 후 패턴 (PG 측 EXTRACT EPOCH 계산)
- `src/lib/rate-limit-db.test.ts` — 모킹 형식: `{ hits: number; reset_ms: string }`
- `prisma/migrations/20260419160000_add_rate_limit_buckets/migration.sql` — `TIMESTAMP(3)` 컬럼 정의 (의도적 유지)

## 관련 솔루션

- `2026-04-19-pg-partial-index-now-incompatibility.md` (PG NOW() STABLE 제약 — 같은 시간 함수 함정군)
