---
title: "Prisma ORM Date 비교 전수 감사 — 4파일 8곳 raw SQL 전환"
date: 2026-04-19
session: 41
tags: [prisma, postgres, timezone, adapter-pg, audit, refactor, raw-sql]
category: pattern
confidence: high
---

## 맥락

세션 39 → 40 → 41 로 이어지는 Prisma 7 adapter-pg TZ 시프트 이슈의 마무리 단계.

- 세션 39: `cleanup.ts` 단일 함수에서 raw SQL 회피를 도입 (CK `prisma-orm-tz-naive-filter-gotcha`).
- 세션 40: TIMESTAMPTZ(3) 마이그레이션으로 컬럼 측은 해결했으나, ORM binding/parsing 경계의 시프트는 별도로 존재함을 E2E 로 재확인 (CK `timestamp-to-timestamptz-migration-using-clause`). 본 CK 의 "영향 범위" 섹션이 본 세션 41 의 착수 트리거.
- 세션 41: 영향 범위 섹션이 나열한 4파일 전수 검토 → 8개 취약 패턴 발견 → raw SQL 로 일괄 전환.

## 발견된 위험 패턴

프로젝트 전체 `src/` 에서 두 종류의 취약 구문을 스캔:

1. **ORM WHERE Date 비교** (binding-side 시프트):
   `prisma.X.findMany/deleteMany({ where: { <dateCol>: { lt|gt|lte|gte: jsDate } } })`
2. **JS-side Date 비교** (parsing-side 시프트):
   `row.<dateCol> <|>|<=|>= new Date()` 또는 `<|>|<=|>= now`

두 패턴 모두 Prisma 7 adapter-pg (timestamptz 컬럼에서도) 의 KST +9h 시프트로 인해 조용한 오판 발생 가능. 특히 만료 임박 시점의 경계 데이터를 포함/배제 반대로 처리.

### 발견 8곳 (4파일)

| # | 파일 | 라인 | 함수 | 패턴 | 영향 |
|---|------|------|------|------|------|
| 1 | `src/lib/jwks/store.ts` | 55 | `getActivePublicJwks` | `retireAt: { gt: now }` (ORM WHERE) | RETIRED grace 내 키가 JWKS 응답에서 누락될 수 있음 → 검증 중 토큰 JWKS lookup 실패 |
| 2 | `src/lib/jwks/store.ts` | 71 | `getPublicKeyByKid` | `record.retireAt <= now` (JS) | 동일 방향 영향 |
| 3 | `src/lib/jwks/store.ts` | 125 | `cleanupRetiredKeys` | `retireAt: { lt: now }` (ORM WHERE) | 만료 9h 전 키도 함께 삭제될 수 있음 → grace 기간 단축 |
| 4 | `src/lib/mfa/webauthn.ts` | 203 | `consumeChallenge` | `rec.expiresAt <= new Date()` (JS) | 만료 9h 전 챌린지는 "유효"로 오인 → 5분 TTL 정책 깨짐 |
| 5 | `src/lib/mfa/webauthn.ts` | 213 | `cleanupExpiredChallenges` | `expiresAt: { lt: new Date() }` (ORM WHERE) | 만료 9h 전 챌린지까지 삭제 |
| 6 | `src/lib/mfa/service.ts` | 30 | `verifyMfaSecondFactor` | `enrollment.lockedUntil > now` (JS) | 락 해제 시각 오판 — 정상 사용자 잠금 유지 또는 락이 조기 해제 |
| 7 | `src/lib/sessions/tokens.ts` | 117 | `findSessionByToken` | `row.expiresAt < new Date()` (JS) | 만료 세션을 active 로 오인 → 보안 위험 |
| 8 | `src/lib/sessions/tokens.ts` | 234 | `listActiveSessions` | `expiresAt: { gt: new Date() }` (ORM WHERE) | UI 활성 세션 목록에서 만료 임박 세션 누락 또는 추가 |

## 수정 패턴 — 3가지

### 패턴 A: WHERE + DELETE 경로 → `raw SELECT id + ORM deleteMany(id)`

`cleanup.ts` 세션 39 에서 정립한 표준 패턴. jwks/store.ts 와 webauthn.ts cleanup 에 적용.

```ts
// Before
const result = await prisma.X.deleteMany({
  where: { dateCol: { lt: new Date() } },
});

// After
const rows = await prisma.$queryRaw<Array<{ id: string }>>`
  SELECT id FROM x WHERE date_col < NOW()
`;
if (rows.length === 0) return { removed: 0 };
const result = await prisma.X.deleteMany({
  where: { id: { in: rows.map((r) => r.id) } },
});
```

장점: id-based DELETE 는 race-safe 하며 TZ 무관. 취약 WHERE 경로 완전 우회.

### 패턴 B: WHERE + SELECT 경로 → 전체 raw SELECT with `::text`

`listActiveSessions` (세션 41) 에 적용. display 용 날짜도 `::text` 캐스팅으로 정확한 UTC 유지.

```ts
// Before
const rows = await prisma.session.findMany({
  where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  select: { createdAt: true, lastUsedAt: true, expiresAt: true, ... },
});
return rows.map((r) => ({ ..., expiresAt: r.expiresAt.toISOString() }));
// ↑ toISOString() 결과가 실제 UTC 보다 9h 미래 (KST 환경)

// After
const rows = await prisma.$queryRaw<Array<{ ... }>>`
  SELECT
    id,
    (created_at::text) AS "createdAt",
    (last_used_at::text) AS "lastUsedAt",
    (expires_at::text) AS "expiresAt",
    ...
  FROM sessions
  WHERE user_id = ${userId}
    AND revoked_at IS NULL
    AND expires_at > NOW()
`;
return rows.map((r) => ({
  ...,
  expiresAt: new Date(r.expiresAt).toISOString(), // ::text → ISO+offset 문자열 → 정확 파싱
}));
```

장점: "binding-side + parsing-side" 양방향 시프트를 동시에 회피. UI 표시도 정확한 UTC.

### 패턴 C: JS-side 비교 → 보조 raw SELECT 로 boolean 반환

기존 ORM findUnique 로 모델 전체를 편리하게 가져오는 경로를 유지하면서 만료 판정만 PG 에 위임.
`findSessionByToken` (복잡한 `user` join) 과 `verifyMfaSecondFactor`, `consumeChallenge` 에 적용.

```ts
// Before
const row = await prisma.session.findUnique({ where: { tokenHash }, select: {...} });
if (row.expiresAt < new Date()) return { status: "expired", session: row };
// ↑ row.expiresAt 는 parsing-side 시프트로 실제 UTC 와 9h 차

// After
const row = await prisma.session.findUnique({ where: { tokenHash }, select: {...} });
const expiredRows = await prisma.$queryRaw<Array<{ expired: boolean }>>`
  SELECT (expires_at <= NOW()) AS expired FROM sessions WHERE id = ${row.id}
`;
if (expiredRows[0]?.expired) return { status: "expired", session: row };
```

추가 SELECT 1회 비용이 있으나 (`WHERE id = ?` 는 PK index), 기존 join 구조를 유지할 수 있어 리팩토링 비용 최소.

`verifyMfaSecondFactor` 는 한 단계 더: `::text` 캐스팅으로 lockedUntil 값도 정확히 돌려주어 응답 payload 의 9h 시프트까지 동시에 해결.

```ts
const lockRows = await prisma.$queryRaw<
  Array<{ locked: boolean; lockedUntilText: string | null }>
>`
  SELECT
    (locked_until IS NOT NULL AND locked_until > NOW()) AS locked,
    (locked_until::text) AS "lockedUntilText"
  FROM mfa_enrollments
  WHERE user_id = ${userId}
`;
if (lockRows[0]?.locked && lockRows[0].lockedUntilText) {
  return { ok: false, reason: "LOCKED", lockedUntil: new Date(lockRows[0].lockedUntilText) };
}
```

## 패턴 선택 가이드

| 상황 | 패턴 |
|------|------|
| cleanup/purge (delete 경로) | **A** — `SELECT id + ORM deleteMany` |
| 목록 조회 + 날짜 display 필요 | **B** — 전체 raw SELECT with `::text` 캐스팅 |
| 기존 ORM findUnique join 복잡 유지 | **C** — 보조 `SELECT (expr) AS is_X` boolean |
| 응답 payload 에 날짜 필드 포함 | B 또는 C + `::text` 필수 (parsing-side 시프트 차단) |

## 교훈

1. **한 건의 취약점 발견은 전수 감사의 신호**. 세션 39 `cleanup.ts` 단일 수정에서 멈추지 않고 4파일 8곳을 한 세션에 일괄 제거하여 기술부채 복리 방지.
2. **ORM WHERE 와 JS-side 비교는 같은 뿌리의 두 증상**. 둘 다 adapter 경계의 TZ 재해석이 원인이므로 함께 감사해야 재발 방지.
3. **TIMESTAMPTZ 컬럼도 "Prisma ORM WHERE 에 Date 를 바인딩하지 말라"** 는 규칙은 바뀌지 않는다. 세션 40 에서 마이그레이션으로 기대했던 "근본 해결" 가설이 절반만 맞았던 것과 같은 지점.
4. **raw SQL 회피는 비용 대비 안전 이득 최대**. 추가 개발 시간은 미미(각 수정 10분 내외)하며 런타임 비용도 무시 가능. 팀 레벨 재발 방지 효과는 큼.

## 재발 방지 체크리스트 (향후 코드 리뷰)

- [ ] `where: { ...: { lt|gt|lte|gte: ... } }` 좌변이 DateTime 필드면 raw SQL 전환
- [ ] `someRow.<dateField> <|> new Date()` JS 비교 금지
- [ ] 응답 payload 에 DateTime 을 ISO 로 직렬화할 때 `::text` 캐스팅 경유 여부 확인
- [ ] 신규 cron/cleanup 함수는 `sessions/cleanup.ts` 패턴 A 를 기본으로

## 관련 파일

### 수정 (4파일 8곳)

- `src/lib/jwks/store.ts` — getActivePublicJwks / getPublicKeyByKid / cleanupRetiredKeys
- `src/lib/mfa/webauthn.ts` — consumeChallenge / cleanupExpiredChallenges
- `src/lib/mfa/service.ts` — verifyMfaSecondFactor (lockedUntil 라이브 체크)
- `src/lib/sessions/tokens.ts` — findSessionByToken (is_expired 보조 쿼리) / listActiveSessions (전체 raw SELECT)

### 참고

- `src/lib/sessions/cleanup.ts` — 세션 39 가 정립한 표준 패턴
- `src/lib/rate-limit-db.ts` — 세션 33 부터 PG 서버측 `EXTRACT(EPOCH FROM ...)` 로 UPSERT + 잔여시간 동시 결정
- `src/lib/prisma` (Prisma Client) — 어댑터 교체 전까지는 본 CK 의 규칙이 유효

## 관련 CK

- `2026-04-19-pg-timestamp-naive-js-date-tz-offset.md` — 세션 34 최초 발견 (TIMESTAMP(3) naive)
- `2026-04-19-prisma-orm-tz-naive-filter-gotcha.md` — 세션 39 정공법 정립, 세션 40 추가 정정
- `2026-04-19-timestamp-to-timestamptz-migration-using-clause.md` — 세션 40 컬럼 마이그레이션
- **본 CK** — 세션 41 프로젝트 전수 감사 완결

## 검증

- `npx tsc --noEmit`: 0 에러
- `npx vitest run`: 13 files / 244 tests PASS (회귀 0, 세션 40 대비 동일)
- 위험 패턴 재스캔: `\{\s*(lt|lte|gt|gte)\s*:\s*(new Date|now)` → 0 match
- JS-side 패턴 재스캔: `(row|record|enrollment|session|rec)\.\w+(At|Until)\s*[<>=!]=?\s*(new Date|now)` → 0 match

## 잔존 과제 (다음 세션)

본 CK 는 **"Date 비교"** 경로만 다룬다. 별도 경로는 그대로 남음:

- **INSERT-side binding 시프트**: `data: { expiresAt: new Date(Date.now() + TTL) }` 형태의 저장 경로. 현재 보안상 "9h 빨리 만료" 쪽이라 대부분 허용 범위이나, 정밀 검증 필요 (next-dev-prompt #2). 후보 해결: PG 측 `NOW() + INTERVAL '<TTL>'` 또는 adapter 재구성.
- 그 외 HTTP 응답에서 ORM-read Date 를 `.toISOString()` 으로 직렬화하는 경로 — 본 감사에서 `listActiveSessions` 와 `verifyMfaSecondFactor` 만 커버. 나머지 API route 는 개별 리뷰 필요.
