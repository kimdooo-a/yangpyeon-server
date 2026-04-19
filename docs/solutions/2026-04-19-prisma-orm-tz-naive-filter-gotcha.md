---
title: Prisma 7 adapter-pg + PG TIMESTAMP(3) timezone-naive filter 조용한 실패
date: 2026-04-19
session: 39
tags: [prisma, postgres, timezone, adapter-pg, orm, timestamp-naive, cleanup]
category: bug-fix-pattern
confidence: high
---

## 문제

`prisma.session.findMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } })` 가 실제로는 조건에 부합하는 row 2건이 DB 에 존재함에도 **0 rows** 를 반환. 에러 없음, 예외 없음. 세션 38→39 프로덕션 E2E 에서 재현.

### 증상

- raw SQL 직접 질의 (`SELECT ... WHERE expires_at < NOW() - INTERVAL '1 day'`): 2 rows ✓
- Prisma ORM 동일 의도 filter: 0 rows ✗
- 디버그 `console.log` 로 Prisma 반환 `expiresAt` 을 확인: 원본 DB 값 대비 **+9시간 시프트** (`2026-04-18T02:32:50Z` 가 `2026-04-18T11:32:50Z` 로 읽힘).

### 재현 조건

- Prisma `^7.6.0` + `@prisma/adapter-pg ^7.6.0`
- 컬럼 타입 `DateTime` (기본 매핑 → PG `TIMESTAMP(3)` **timezone-naive**)
- 서버 timezone = KST(+9) — `SHOW timezone` 이 KST 반환
- JS `new Date()` 는 UTC 로 저장되지만 pg adapter 가 TIMESTAMP 컬럼 바인딩 시 KST local 로 변환하여 전송.

## 원인

1. **INSERT 경로**: `new Date(Date.now() - 25h)` (UTC) → pg adapter 가 `toLocaleString` 류 변환 → DB 에 KST local 문자열 저장 (`2026-04-18 11:32:50`).
2. **READ 경로**: DB → pg adapter → JS Date. adapter 는 저장된 naive 문자열을 **UTC 라고 가정**하여 Date 생성 → UTC 기준 `2026-04-18T11:32:50Z` 를 반환. 실제 개발자 의도는 UTC `02:32:50Z` 였으므로 9시간 시프트 발생.
3. **FILTER 경로**: Prisma 가 JS Date 를 binding 할 때 동일하게 KST local 변환 → WHERE 조건의 좌변(DB 저장 값 그대로, 예: `2026-04-18 11:32:50`) 과 우변(cutoff KST 변환, 예: `2026-04-18 12:40:00`) 비교. 운 나쁘게 스킵되는 경계 케이스 존재.

요컨대 저장/조회/필터 3단계에서 **일관되지 않은 KST 해석**이 누적되어 조건부 0 rows 가 발생.

## 해결

Filter 는 **PG 서버측 `NOW() - INTERVAL`** 로 위임. 클라이언트 timezone 변환 경로 전체를 우회.

```ts
// Before (조용히 실패)
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
const rows = await prisma.session.findMany({
  where: { expiresAt: { lt: cutoff } },
  select: { id: true, userId: true, expiresAt: true },
});

// After ($queryRaw 서버측 연산)
const rows = await prisma.$queryRaw<Array<{ id: string; userId: string; expiresAt: string }>>`
  SELECT id, user_id AS "userId", (expires_at::text) AS "expiresAt"
  FROM sessions
  WHERE expires_at < NOW() - INTERVAL '1 day'
`;
// expires_at::text 캐스팅으로 adapter 재해석 방지 — 애플리케이션 측에서 필요 시 UTC 간주 Date 재생성
const entries = rows.map((r) => ({
  id: r.id,
  userId: r.userId,
  expiresAt: new Date(r.expiresAt.replace(" ", "T") + "Z"),
}));
```

- SELECT 에서 `expires_at::text` 캐스팅으로 adapter 의 Date 재해석을 차단하고 원본 문자열을 받음.
- DELETE 는 `$executeRaw DELETE ... WHERE id = ANY($ids::text[])` 로 race 방지.

## 교훈

- **PG 컬럼을 기본 `DateTime` 으로 두면 TIMESTAMP(3) (naive) 로 매핑됨**. production 앱에서는 `@db.Timestamptz(3)` 를 명시하거나 마이그레이션을 통해 `TIMESTAMPTZ` 로 변경해야 Prisma ORM filter 가 정상 동작.
- **시간 필터는 가능하면 DB 서버측으로 위임**. `NOW()`, `CURRENT_TIMESTAMP`, `INTERVAL` 은 DB 의 한 점 기준이라 timezone 불일치 리스크 0.
- **증상이 "조용한 0 rows" 이면 timezone 의심**. 에러 스택이 없는 filter 실패는 이 계열을 상위 가설로.
- **raw SQL 직접 질의 vs ORM 결과 비교**가 진단의 첫 단계. 두 경로의 read-back 값이 다르면 adapter TZ 해석 이슈 확정.

## 관련 파일

- `src/lib/sessions/cleanup.ts` — 본 세션의 근본 수정 (raw SQL 2-step).
- `src/lib/rate-limit-db.ts` — 세션 34 에서 `EXTRACT(EPOCH FROM ...)` 로 동일 회피 적용한 선례.
- `docs/solutions/2026-04-19-pg-timestamp-naive-js-date-tz-offset.md` — 세션 34 CK, 본 문서의 전신.

## 재발 방지 체크리스트

- [ ] 신규 시간 filter 가 Prisma ORM 을 쓰면 곧바로 raw SQL 대안도 고려
- [ ] Prisma 반환 Date 를 UI 에 표시하기 전에 원본 DB 값과 대조
- [ ] 가능한 한 `TIMESTAMPTZ` 컬럼으로 통일 (장기 해결)
- [ ] 이 패턴이 재발견되면 TIMESTAMPTZ 마이그레이션을 기술부채 최상위로 승격

---

## 세션 40 추가 정정 — TIMESTAMPTZ 마이그레이션 후에도 binding-side 시프트 잔존

세션 40 에서 모든 DateTime 컬럼을 `TIMESTAMPTZ(3)` 로 마이그레이션 적용 (CK `2026-04-19-timestamp-to-timestamptz-migration-using-clause.md`). 본 CK 의 "교훈 4번" 의 가설 ("컬럼 변경이 근본 해결") 이 절반만 맞음.

### 재현 (E2E)

마이그레이션 후 cleanup.ts 를 ORM `prisma.session.findMany({where:{expiresAt:{lt:cutoff}}})` 로 복원하여 배포. 세션 39 E2E 스크립트 재실행:

- helper INSERT 만료 세션 2건 (past = `Date.now() - 25h`)
- PG 직접 검증: `expires_at < NOW() - INTERVAL '1 day'` → 2 rows (만료 인식 ✓)
- Prisma ORM cleanup: `summary.sessions: 0` (회귀!)

### 원인

PG 컬럼이 timestamptz 임에도 Prisma 7 adapter-pg 가:
- **binding 측**: JS `Date` (UTC ms) 를 PG 쿼리 인자로 보낼 때 server timezone (KST) wall-clock 으로 변환하여 전송하는 듯
- **parsing 측**: PG timestamptz 응답을 JS Date 로 변환 시 server timezone wall-clock 을 UTC ms 로 직접 해석

즉 컬럼 측은 정확한 UTC offset 보존이지만, ORM↔PG 경계에서 양방향 시프트.

### 정공법 — raw SELECT (PG NOW()-INTERVAL) + ::text + ORM DELETE

`cleanup.ts` (세션 40 최종 형태):

```typescript
const rows = await prisma.$queryRaw<
  Array<{ id: string; userId: string; expiresAt: string }>
>`
  SELECT id, user_id AS "userId", (expires_at::text) AS "expiresAt"
  FROM sessions
  WHERE expires_at < NOW() - INTERVAL '1 day'
`;
if (rows.length === 0) return { deleted: 0, expiredEntries: [] };
const ids = rows.map((r) => r.id);
const result = await prisma.session.deleteMany({
  where: { id: { in: ids } },
});
return {
  deleted: result.count,
  expiredEntries: rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    expiresAt: new Date(r.expiresAt),  // ::text → ISO+offset 문자열 → Date
  })),
};
```

핵심:
- **cutoff**: PG 측 `NOW() - INTERVAL '1 day'` 위임 — JS 측 cutoff Date binding 회피
- **expires_at::text 캐스팅**: PG 가 정확한 ISO+offset 문자열 (예: `"2026-04-18 05:14:19.232+00"`) 반환 — pg adapter parsing 우회
- **DELETE**: ORM `deleteMany({where:{id:{in:ids}}})` — id 기반이라 timezone 무관, race-safe

### 교훈 (세션 40 추가)

5. **TIMESTAMPTZ 마이그레이션은 컬럼 측 절반의 해결**. Prisma 7 adapter-pg 의 binding-side TZ 시프트는 별도. ORM filter (where: {field: {lt: jsDate}}) 사용 전 E2E 검증 필수.
6. **시간 비교는 PG 위임이 안전한 디폴트**. `NOW() - INTERVAL '<duration>'` 패턴이 클라이언트 timezone 변환 경로 자체를 우회.
7. **`::text` 캐스팅은 timestamptz 컬럼에서도 유효** — pg adapter parsing 우회. PG 가 직접 ISO 문자열 반환하면 JS `new Date()` 가 정확 파싱.

### 영향 범위 — 다음 세션 후속 작업

- **prisma 가 INSERT 시도 시프트하는지** 검증 미완 — 실제 사용자 로그인 시 만들어지는 session row 의 expires_at 정확성 확인 필요. 만약 시프트하면 새 session 만료가 9h 빨리 됨 (보안 측면 over-conservative 이지만 사용자 경험 영향).
- **다른 모듈의 ORM 시간 비교 코드 전수 검토** — `tokens.ts`, `webauthn.ts`, `jwks/store.ts`, `mfa/service.ts` 등에서 `where: {expiresAt: {lt|gt|lte|gte: jsDate}}` 패턴 검색 후 동일 정공법 적용 필요.
