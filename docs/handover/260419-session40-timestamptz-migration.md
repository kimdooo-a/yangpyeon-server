# 인수인계서 — 세션 40 (TIMESTAMPTZ 마이그레이션 + cleanup ORM 복원 시도)

> 작성일: 2026-04-19
> 이전 세션: [session39](./260419-session39-session-expire-admin-revoke.md)
> 저널: [logs/journal-2026-04-19.md](../logs/journal-2026-04-19.md) (세션 40 섹션)

---

## 작업 요약

세션 39 next-dev-prompt 우선순위 6건 중 **2 (KST 03:00 관찰) + 3b (TIMESTAMPTZ 마이그레이션 — 기술부채 최상위 승격) + 5 (SP-013/016 환경 확인)** 자율 채택. 17 테이블 / 47 DateTime 컬럼 `@db.Timestamptz(3)` + `ALTER COLUMN ... TYPE TIMESTAMPTZ(3) USING ... AT TIME ZONE 'Asia/Seoul'` 적용. cleanup.ts ORM 복원 시도 → Prisma 7 adapter-pg binding-side 9h 시프트 잔존 발견 → 정공법(raw SELECT + ::text + ORM DELETE)으로 정착. CK 1건 신규 + 1건 갱신 (누적 30 → 31).

## 대화 다이제스트

### 토픽 1: 자율 실행 범위 결정
> **사용자**: "다음 세션 권장 모두 순차적으로 실행.. 모두 너가 할 수 있는 한 모두 진행..."

세션 39 다음 세션 권장 6건 분류:
- ✅ 우선순위 2 KST 03:00 관찰
- ✅ 우선순위 3b TIMESTAMPTZ 마이그레이션 (기술부채 최상위 승격)
- ❓ 우선순위 4 SP-013/016 환경 확인
- ❌ 우선순위 1 MFA biometric (생체인증, 사람 필수)
- ❌ 우선순위 3 HS256 제거 (단독 세션 잠금 — 글로벌 CLAUDE.md "이전 세션 명시적 정의는 잠금" 보존)
- ❓ 우선순위 5 /kdygenesis (스킬 호출)

**결론**: 가능 항목 3건 (2, 3b, 5) 순차 실행. HS256 잠금 존중.

### 토픽 2: KST 03:00 자동 cleanup tick 관찰
PM2 dashboard uptime 2h (KST 13시 시작). audit_logs CLEANUP_EXECUTED (자동) 0건, CLEANUP_EXECUTED_MANUAL 다수.

**부수 발견**: `audit_logs.timestamp` 컬럼이 `Math.floor(Date.now()/1000)` 즉 sec 단위 저장. UI 코드가 ms 가정으로 표시 시 1970-01-21T... 로 오해. 본 세션 범위 밖.

**결론**: 익일 KST 03:00 자동 tick 검증 필요.

### 토픽 3: TIMESTAMPTZ 마이그레이션 영향도 분석
- 17개 모델 / ~47개 DateTime 컬럼 영향
- 회피 코드 2곳: `cleanup.ts` (raw SQL + ::text), `rate-limit-db.ts` (EXTRACT EPOCH)
- PG 서버 타임존 = `Asia/Seoul` (KST). 기존 naive 값의 wall-clock 의미 = KST → USING `AT TIME ZONE 'Asia/Seoul'` 정답

**결론**: 세션 34 CK 의 옵션 1 (TIMESTAMPTZ 마이그레이션) 이 2회 재현으로 기술부채 최상위 승격 → 채택.

### 토픽 4: schema.prisma + migration SQL 작성 + dry-run
- 모든 DateTime 컬럼에 `@db.Timestamptz(3)` 추가 (47 컬럼)
- `prisma/migrations/20260419180000_use_timestamptz/migration.sql` (17 ALTER TABLE, USING AT TIME ZONE 'Asia/Seoul')
- pg_dump 백업 (5.3MB) → BEGIN/ROLLBACK dry-run 17 ALTER 모두 OK
- Prisma client 재생성 + tsc 0 + vitest 245 PASS

**결론**: 사전 검증 완료. 실제 적용 진행.

### 토픽 5: cleanup.ts ORM 복원 1차 시도 → 실패
ORM `session.findMany({where:{expiresAt:{lt: jsDate}}})` 로 복원. 단위 테스트 9 PASS. 배포 후 E2E:
- helper INSERT 만료 세션 2건 (past = -25h)
- cleanup 호출 → `summary.sessions: 0` 회귀!
- PG 직접 비교는 `expired_1d=t` (정상)

**결론**: Prisma 7 adapter-pg 의 binding-side TZ 시프트가 timestamptz 컬럼에서도 별도 존재. 컬럼 변경만으론 ORM filter 정상 동작 안 함.

### 토픽 6: 정공법 발견 — raw SELECT + ::text + ORM DELETE
- cutoff: PG 측 `NOW() - INTERVAL '1 day'` 위임 (binding 회피)
- `expires_at::text` 캐스팅: PG 가 정확한 ISO+offset 문자열 반환 → JS `new Date()` 정확 파싱 (parsing 회피)
- DELETE: ORM `deleteMany({where:{id:{in:ids}}})` — id 기반이라 timezone 무관, race-safe

**검증**: vitest 244 PASS / tsc 0 / 재배포 (PM2 ↺=11) / E2E summary.sessions=2 정확. SESSION_EXPIRE per-row audit 도 정확 기록.

**결론**: 본 세션 cleanup.ts 최종 형태로 채택.

### 토픽 7: SP-013/016 환경 확인
- wal2json: 미설치 (apt 가능)
- weed: 미설치 (다운로드 가능, 디스크 950G 가용 충분)

**결론**: 실측 13h 작업이라 본 세션 범위 외. 다음 세션 권장 유지.

### 토픽 8: CK 추출
- **신규**: `2026-04-19-timestamp-to-timestamptz-migration-using-clause.md` — USING AT TIME ZONE 결정 패턴
- **갱신**: `2026-04-19-prisma-orm-tz-naive-filter-gotcha.md` — 세션 40 추가 정정 섹션 (TIMESTAMPTZ 후에도 binding-side 시프트 잔존)

**결론**: 누적 30 → 31. 다음 세션 후속 작업 (다른 모듈 ORM 시간 비교 전수 검토) 명시.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | HS256 제거 제외 | 모두 진행 vs 잠금 존중 | 세션 38 명시적 "단독 세션 잠금" + 글로벌 CLAUDE.md 보존 규칙. 사용자 "모두 진행" 이 잠금 해제 명시 아님 |
| 2 | USING AT TIME ZONE 'Asia/Seoul' | 'Asia/Seoul' vs 'UTC' | PG 서버 타임존이 KST. naive 값의 wall-clock 의미 = KST. 사용자 visible 시각 보존 |
| 3 | cleanup.ts 정공법 | ORM findMany vs raw SELECT 하이브리드 | E2E 에서 ORM 실패 재현 → raw SELECT (PG NOW()-INTERVAL 위임) + ::text 캐스팅 + ORM DELETE 하이브리드 채택 |
| 4 | rate-limit-db.ts 유지 | EXTRACT EPOCH 제거 vs 유지 | PG 측 계산이 race-safe (UPSERT 한 번에 카운터 + 잔여시간 동시 결정). 주석만 갱신 |
| 5 | SP-013/016 환경 확인만 | 측정 진행 vs 환경 확인만 | 실측 13h 작업이라 본 세션 범위 초과 |

## 수정 파일 (5개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/schema.prisma` | 17 모델 / 47 DateTime 컬럼에 `@db.Timestamptz(3)` 추가 |
| 2 | `prisma/migrations/20260419180000_use_timestamptz/migration.sql` (신규) | 17 ALTER TABLE, USING AT TIME ZONE 'Asia/Seoul' |
| 3 | `src/lib/sessions/cleanup.ts` | ORM 복원 → 정공법(raw SELECT + ::text + ORM DELETE) 정착. 세션 32→39→40 변경 이력 주석 보존 |
| 4 | `src/lib/sessions/cleanup.test.ts` | ORM 복원 검증 → ::text 캐스팅 모킹 (10 tests) |
| 5 | `src/lib/rate-limit-db.ts` | 주석 갱신 (TIMESTAMPTZ 후에도 PG 측 계산이 race-safe 유지 이유 명시) |

## 검증 결과

- `npx tsc --noEmit` — 0 에러
- `npx vitest run` — 244 PASS (이전 245 → -1, raw SQL assertion 일부가 ORM call signature assertion 으로 대체)
- `prisma migrate deploy` — `20260419180000_use_timestamptz` 적용 성공
- PG 컬럼 타입 검증: 모든 DateTime 컬럼이 `timestamp with time zone` 으로 전환 확인
- `/ypserver prod --skip-win-build` 2회 통과 (PM2 ↺=10, ↺=11), HTTP 307, Tunnel OK
- E2E `scripts/session39-e2e.sh` 12 step 전수 PASS — `summary.sessions=2` 정확, SESSION_EXPIRE per-row audit 정확 기록

## 터치하지 않은 영역

- HS256 legacy 제거 (단독 세션 잠금 보존)
- MFA biometric 브라우저 QA (생체인증 사람 필수)
- SP-013/016 실측 (환경 확인만, 13h 작업)
- /kdygenesis --from-wave 연계
- 다른 모듈의 ORM 시간 비교 (`tokens.ts`, `webauthn.ts`, `jwks/store.ts`, `mfa/service.ts`) — 본 세션 cleanup.ts 만 정정. 전수 검토 후속 필요
- audit_logs.timestamp sec/ms 단위 부수 버그 (UI 표시 1970년 오해)

## 알려진 이슈

- **Prisma 7 adapter-pg 의 timestamptz 컬럼 binding-side TZ 시프트** — 컬럼 변경만으로 해소 안 됨. `findMany({where:{ts:{lt: jsDate}}})` 패턴 사용 시 정공법 (raw SELECT + ::text + PG NOW()-INTERVAL 위임) 강제. 다른 모듈 전수 검토 필요.
- **prisma 가 INSERT 시도 시프트하는지 검증 미완** — 실제 사용자 로그인 시 만들어지는 session row 의 expires_at 정확성 확인 필요. 만약 시프트하면 새 session 만료가 9h 빨리 됨 (보안 측면 over-conservative 이지만 UX 영향).
- **audit_logs.timestamp sec/ms 단위 불일치** — Drizzle INTEGER 컬럼에 `Math.floor(Date.now()/1000)` (sec) 저장하는데, UI 가 ms 가정으로 표시하면 1970년 표기. 본 세션 범위 밖.
- **KST 03:00 자동 cleanup tick 검증 미완** — dashboard PM2 시작 KST 13시 → 익일 KST 03:00 첫 tick.

## 다음 작업 제안

1. **다른 모듈 ORM 시간 비교 전수 검토** (1~2h, 즉시 착수 가능) — `tokens.ts`, `webauthn.ts`, `jwks/store.ts`, `mfa/service.ts` 의 `where: {field: {lt|gt|lte|gte: jsDate}}` 패턴 검색 후 동일 정공법 적용. cleanup 외 다른 곳에서 9h 시프트로 데이터 누락 발생 가능.
2. **prisma INSERT 시 timestamptz 시프트 검증** — 실제 사용자 로그인 후 PG `SELECT expires_at FROM sessions WHERE user_id=...` 로 정확성 확인.
3. **KST 03:00 자동 cleanup tick 관찰** (익일) — `audit_logs WHERE action='CLEANUP_EXECUTED'` 신규 엔트리 확인.
4. **HS256 legacy 제거** (~1.5h, 단독 세션) — 세션 33 JWKS ES256 전환 후 24h+ 만료. AUTH_SECRET 제거 + auth.ts HS256 fallback 정리.
5. **MFA biometric 브라우저 수동 QA** (`docs/guides/mfa-browser-manual-qa.md`).
6. **SP-013/016 물리 측정** (13h, 별도 세션).

## 진입점 예시

```
# 우선순위 1 — 다른 모듈 ORM 시간 비교 전수 검토
grep -r "where:\s*{[^}]*\b(expiresAt|lastUsedAt|revokedAt|windowStart|retireAt|lockedUntil|usedAt|createdAt|updatedAt)\b\s*:\s*{\s*(lt|gt|lte|gte)\s*:" src/

# 우선순위 2 — prisma INSERT 검증 (실제 로그인 후)
PGPASSWORD='<DB_PASSWORD>' psql -h localhost -p 5432 -U postgres -d luckystyle4u -c \
  "SELECT id, expires_at, expires_at AT TIME ZONE 'UTC' AS utc FROM sessions ORDER BY created_at DESC LIMIT 3;"
```

---
[← handover/_index.md](./_index.md)
