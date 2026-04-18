---
title: PostgreSQL partial index 술어에 NOW() 불가 — TTL 테이블 cleanup job 패턴
date: 2026-04-19
session: 30 (SP-015)
tags: [postgres, index, ttl, session-table, cleanup-job, immutable-function]
category: pattern
confidence: high
---

## 문제

Session 테이블, OTP 테이블, API Key 만료 등 **TTL 기반 "활성 레코드만 인덱싱"** 을 목표로 다음과 같은 partial index를 설계하기 쉽다:

```sql
CREATE INDEX idx_session_active ON "Session" ("userId", "expiresAt")
  WHERE "expiresAt" > NOW();
```

의도: 만료된 세션 레코드는 인덱스에서 제외하여 크기 절감 + 조회 시 행 추정 정확도 향상.

실제 실행 결과:
```
ERROR:  functions in index predicate must be marked IMMUTABLE
```

SP-015 실험 재현(PG 16.13):
```sql
DROP INDEX idx_session_user_exp;
CREATE INDEX idx_session_user_partial ON "_test_session" ("userId", "expiresAt")
  WHERE "expiresAt" > NOW();
-- ERROR
```

## 원인

PostgreSQL 함수 volatility 분류:
- `IMMUTABLE`: 동일 입력 → 동일 출력 보장. 입력만으로 결정.
- `STABLE`: 같은 트랜잭션 내에서 같은 값 반환. 세션 상태에 의존 가능.
- `VOLATILE`: 호출마다 결과가 다를 수 있음.

**`NOW()`는 STABLE** — 트랜잭션 시작 시각을 반환한다. Partial index는 "인덱스가 평가하는 시점에 predicate가 이미 확정된 값"을 요구하므로 `IMMUTABLE`만 허용된다.

`CURRENT_DATE`, `CURRENT_TIMESTAMP`, `CURRENT_TIME`도 전부 STABLE → 동일 에러. 심지어 고정처럼 보이는 `random()`도 VOLATILE이라 금지.

## 해결

### 대안 1: 고정 날짜 술어 (수동 갱신 필요)
```sql
CREATE INDEX idx_session_future ON "Session" ("userId", "expiresAt")
  WHERE "expiresAt" > '2026-01-01'::timestamptz;
```
- 장점: partial index 이점 유지
- 단점: 시간이 흘러 고정 날짜가 과거가 되면 효과 상실. 주기적 재생성 필요.

### 대안 2: cleanup job + 일반 인덱스 (권장)
```sql
-- 인덱스는 일반
CREATE INDEX idx_session_user_exp ON "Session" ("userId", "expiresAt");

-- cleanup은 node-cron 또는 pg_cron으로 일 1회
DELETE FROM "Session" WHERE "expiresAt" < NOW() - INTERVAL '1 day';
```
- 장점:
  - 관리 단순
  - 데이터 볼륨 자체 제한 → 인덱스 크기 자동 유지
  - 삭제 중 advisory lock 획득 시 cluster 모드에서도 안전 (SP-010 참조)
- 단점: 약간의 쓰기 부하 (야간 실행으로 충분)

### 대안 3: 외부 캐시 (Redis) — 적용 제한적
세션을 Postgres가 아닌 Redis에 저장하면 TTL 네이티브 지원. 그러나 프로젝트는 Redis 미도입(ADR-005) — pgmq 트리거 미충족 시 도입 부담.

### SP-015 성능 비교 (100,000 행, PG 16.13)
- 일반 복합 인덱스 + cleanup job: p95 **48μs** (10만 행)
- 1M 행 추정: p95 ≈ 65μs (log10 증가)
- 목표 2ms 대비 **30~40배 여유** → partial index 이점이 체감 이점으로 이어지지 않음

## 교훈

1. **TTL 테이블 기본 패턴은 cleanup job**: partial index는 "상대적으로 static한 조건"(예: 특정 role, soft-delete flag)에 어울림. 시간 기반 조건은 대부분 cleanup job이 더 단순.
2. **함수 volatility 분류 먼저 확인**: `SELECT provolatile FROM pg_proc WHERE proname = 'now';` 로 즉시 확인 가능 (`s`=STABLE, `i`=IMMUTABLE, `v`=VOLATILE).
3. **고정 predicate도 유효한 선택**: 배포 주기가 짧고 월별 재생성을 자동화할 수 있으면 대안 1도 합리적. 그러나 일반적으로 cleanup job이 간결.
4. **blueprint 가정 재검증**: 이 설계 실수는 `02-architecture/03-auth-advanced-blueprint.md`의 "Session 만료 partial index" 표현에서 비롯. 실제 구현 가능성을 실험으로 검증하지 않은 가정.
5. **일반화 범위**: Session, OTP, WebAuthn challenge, API Key, idempotency key, dedup lock — 이 프로젝트의 모든 TTL 테이블에 동일 패턴 적용.

## 관련 파일

- `docs/research/spikes/spike-015-session-index-result.md` §3, §5 대안 B
- `02-architecture/03-auth-advanced-blueprint.md` — 수정 대상 (§세션 스키마)
- `00-vision/07-dq-matrix.md` — DQ-AC-2 Resolved 반영 대상

## Prisma 마이그레이션 예시

```prisma
// prisma/schema.prisma
model Session {
  id        String   @id @db.Char(64)
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, expiresAt])  // 복합 인덱스, partial 아님
}
```

cleanup cron:
```typescript
// src/lib/cron/cleanup-sessions.ts
import cron from "node-cron";
import { prisma } from "@/lib/db";

cron.schedule("30 3 * * *", async () => {  // 매일 03:30
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  console.log(`[cleanup] expired sessions removed: ${count}`);
});
```
