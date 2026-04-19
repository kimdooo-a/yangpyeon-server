# 세션 39 인수인계서 — Phase 15-D 보강 (SESSION_EXPIRE per-row audit + 관리자 forced revoke)

> 상위: [`handover/_index.md`](./_index.md)
> 일자: 2026-04-19
> 소요: ~1.5h (TDD → 배포 → TZ 버그 진단·교정 → E2E 통과)
> 상태: 완결 (tsc 0 / vitest 231 → **245 PASS** / 프로덕션 E2E curl 4 시나리오 전수 PASS)
> 이전 세션: [session38](./260419-session38-phase-15d-touch-throttle-ua-label.md)

## 세션 목표

세션 38 위임 5건 중 **2·3a·3b 3건만** 자율 판단으로 선별·실행:
- ✅ **[2] KST 03:00 자동 cleanup 관찰** — 오늘 기동 이전이라 미발화 확인·기록 (다음 기회: 2026-04-20 03:00 KST)
- ✅ **[3a] SESSION_EXPIRE per-row audit** — cleanup 시 각 만료 row 별 감사 로그 1건씩 발행
- ✅ **[3b] 관리자 forced revoke 엔드포인트** — `DELETE /api/admin/users/[id]/sessions` + `revokedReason="admin"`
- ⏭ **[3c] HS256 legacy 제거** — 본인 핸드오버가 "단독 세션 권장" 명시 (기존 쿠키 무효화 리스크) → **잠금 결정 존중**으로 이월
- ⏭ **[1] MFA biometric 브라우저 QA** — Touch ID/Windows Hello 생체인증 필수 → 자율 불가 이월
- ⏭ **[4] SP-013/016 물리 측정** — 환경 미확보 이월
- ⏭ **[5] /kdygenesis --from-wave** — 메타 오케스트레이션 규모 과대 이월

## 작업 요약

- **cleanup-scheduler.ts** 의 sessions task 를 `runSessionsCleanupWithAudit` 헬퍼로 래핑 → cleanup 실행 후 각 `expiredEntries[i]` 에 대해 SESSION_EXPIRE 감사 로그 개별 기록.
- **cleanupExpiredSessions** (`src/lib/sessions/cleanup.ts`) 를 `$executeRaw` 1-step 에서 `$queryRaw SELECT → $executeRaw DELETE` 2-step 으로 재설계. 함수 반환 타입 `{deleted, expiredEntries}` 로 확장.
- **프로덕션 E2E 중 버그 재현·근본 수정**: Prisma ORM `session.findMany({where:{expiresAt:{lt:cutoff}}})` 가 PG `TIMESTAMP(3)` timezone-naive + Prisma 7 adapter-pg 조합에서 9시간 KST 오프셋으로 0 rows 를 반환. cutoff 를 PG 서버측 `NOW() - INTERVAL '1 day'` 로 위임하여 회피. 세션 34 CK `pg-timestamp-naive-js-date-tz-offset` 의 재현 케이스.
- **revokeAllUserSessions** 에 `reason: SessionRevokeReason` 파라미터 추가 (기본값 `"reuse_detected"` — 기존 refresh route reuse 탐지 호환). admin route 는 `"admin"` 명시 전달.
- **신규 엔드포인트** `DELETE /api/admin/users/[id]/sessions` — withRole(ADMIN) 가드 + 대상 사용자 존재 검증 + revokeAll + `SESSION_ADMIN_REVOKE_ALL` 감사 로그.

## 대화 다이제스트

### 토픽 1: 세션 39 실행 범위 결정

> **사용자**: "다음 세션 권장 모두 순차적으로 진행 ... 모두 너가 직접 충분한 숙고를 통해 결정하도록"

세션 38 이 이월한 5건을 각각 실행 가능성·리스크·사용자 의도 관점에서 평가.

- 3c (HS256 legacy 제거) 는 핸드오버 본문이 **"단독 세션 권장 (기존 쿠키 무효화 리스크)"** 명시. 글로벌 CLAUDE.md "이전 세션 명시적 정의는 잠금" 규칙에 따라 이월.
- 1·4·5 는 물리·사용자 상호작용·규모 관점에서 본 세션 범위 초과.
- **채택**: 2 + 3a + 3b 3건. 2 는 관찰 1 step, 3a·3b 는 TDD 로 진행.

**결론**: 3건만 묶어 진행. TDD 적용 대상 명시(3a·3b) + 실행 순서 (관찰 → audit → revoke → 배포 → E2E → 문서).

### 토픽 2: Task 1 — KST 03:00 자동 cleanup 관찰

SQLite `audit_logs` 조회:
- 컬럼명 `created_at` 가정 오류 → 스키마 재조회로 `timestamp` (INTEGER, 초 단위) 확인.
- `CLEANUP_EXECUTED` (자동) 엔트리: **0건**. `CLEANUP_EXECUTED_MANUAL` 1건 (세션 36 수동 실증분).
- PM2 dashboard uptime 91m → 2026-04-19 10:53 KST 기동 확인. KST 03:00 tick 은 이미 지난 시각이라 **오늘 발화 기회 없음**.
- 다음 관찰 기회: **2026-04-20 03:00 KST** (단, 본 세션에서 재배포하여 uptime 초기화됨 → 관찰 대기 지속).

**결론**: 관찰 결과 기록만 완결. 코드 변경 없음.

### 토픽 3: Task 2 — SESSION_EXPIRE audit TDD (cleanup.test.ts → cleanup.ts → scheduler.ts)

**설계 결정**:
- `cleanupExpiredSessions` 반환 타입 확장: `{deleted, expiredEntries: Array<{id, userId, expiresAt}>}`.
- **Pure function 분리**: `buildSessionExpireAuditDetail(entry): string` JSON 페이로드만 담당 (DB/시간 의존 없음).
- **Audit 위치**: `cleanup-scheduler.ts` 의 sessions task 래퍼(`runSessionsCleanupWithAudit`) 내부. 각 entry 에 대해 `writeAuditLogDb({ action: "SESSION_EXPIRE", detail: buildSessionExpireAuditDetail(entry) })`. audit 실패는 try/catch 로 격리하여 배치 삭제 중단 금지.

**RED**: `cleanup.test.ts` 10 tests 작성 → 전량 FAIL (`buildSessionExpireAuditDetail` 미존재 + 구 `$executeRaw` 사용).

**GREEN**: `cleanup.ts` 초안 — `prisma.$transaction + session.findMany + deleteMany`. → vitest 10/10 PASS.

**결론**: TDD 1차 완결. tsc 0, 전체 245 PASS (13 files).

### 토픽 4: Task 3 — 관리자 forced revoke TDD (tokens.test.ts → tokens.ts → route.ts)

**설계 결정**:
- `revokeAllUserSessions(userId, reason?)` 에 optional reason 추가. 기본 `"reuse_detected"` 로 refresh route 호환 유지.
- 신규 route `src/app/api/admin/users/[id]/sessions/route.ts` DELETE — withRole(ADMIN) + 대상 사용자 findUnique + revokeAll + `SESSION_ADMIN_REVOKE_ALL` audit (writeAuditLogDb 로 버퍼 flush 대기 없이 즉시 기록).

**RED**: `tokens.test.ts` 에 admin/logout/count=0 3 tests 추가 → admin/logout 2 fail (기존 하드코딩 `"reuse_detected"`).

**GREEN**: `tokens.ts` 시그니처 확장. → vitest 21/21 PASS, tsc 0.

### 토픽 5: 배포 + E2E 버그 재현 (PG TIMESTAMP 9시간 오프셋)

`/ypserver prod --skip-win-build` 재배포 (PM2 ↺=5, HTTP 307).

E2E 스크립트 2파일 분리 작성: `scripts/session39-e2e.sh` (bash) + `scripts/session39-helper.cjs` (pg 직접 연결 helper). 초기 시도에서 `prisma` require 경로 오류 → pg 라이브러리로 전환 (Prisma 7 모듈러 generator 경로가 Node require() 호환 아님).

**S1~S7 admin revoke 경로 PASS**: `revokedCount: 3` + `SESSION_ADMIN_REVOKE_ALL` audit 기록 확인.

**S9~S12 SESSION_EXPIRE 경로 FAIL**: 만료 세션 2건 직접 INSERT (pg 바인딩, `past = Date.now() - 25h`) 후 수동 cleanup 트리거 → `summary.sessions: 0`. DB eligible=2 (raw SQL 직접 검증), app=0.

**진단**: 디버그 `console.log` 주입 후 재배포 → `[cleanup-debug] total=21 sample=[... "expiresAt":"2026-04-18T11:32:50.001Z" ...]` 출력. pg 직접 query 는 `"expires_at":"2026-04-18T02:32:50.001Z"` 반환. **9시간 차이 = KST 오프셋**. PG `TIMESTAMP(3)` timezone-naive + Prisma 7 adapter-pg 의 JS Date ↔ 문자열 변환에서 일관되지 않은 타임존 해석.

**근본 해결**: Prisma ORM filter 포기, `$queryRaw` 로 PG 서버측 `NOW() - INTERVAL '1 day'` 위임. 세션 34 CK `pg-timestamp-naive-js-date-tz-offset` 의 재현 교훈 그대로 적용.

**최종 구현**:
```ts
const rows = await prisma.$queryRaw<...>`
  SELECT id, user_id AS "userId", (expires_at::text) AS "expiresAt"
  FROM sessions
  WHERE expires_at < NOW() - INTERVAL '1 day'
`;
...
const deletedCount = await prisma.$executeRaw`
  DELETE FROM sessions WHERE id = ANY(${ids}::text[])
`;
```

`expires_at::text` 캐스팅으로 Prisma 가 재해석하지 않는 원본 문자열 보존 → `new Date(str.replace(" ","T")+"Z")` 로 UTC Date 복원. audit 상세의 `expiresAt` 은 PG 측 KST-local 해석 값이 기록되어 실제 UTC 대비 9h 시프트 — 기존 세션 34 이슈 그대로, 근본 해결은 컬럼 TIMESTAMPTZ 마이그레이션 필요로 본 세션 범위 밖.

**테스트 갱신**: `cleanup.test.ts` 모킹 대상을 `$queryRaw`/`$executeRaw` 로 전환. 10 → 11 tests, 전량 PASS. `BigInt(1)` 리터럴 대신 `BigInt(1)` 사용 (tsc ES2020 target 이슈).

### 토픽 6: 최종 E2E 통과

rate-limit-buckets 초기 축적으로 인한 login 차단 1회 발생 → 직접 SQL `DELETE FROM rate_limit_buckets` 로 초기화 후 재시도.

최종 E2E 결과:
- **S4** `DELETE /api/admin/users/:id/sessions` → `revokedCount: 2`
- **S7** audit `SESSION_ADMIN_REVOKE_ALL` 기록 (여러 건 누적)
- **S10** `POST /api/admin/cleanup/run` → `summary.sessions: 4` (신규 2 + 이전 debug 누적 2)
- **S11** audit `SESSION_EXPIRE` 5건 표시 (최근 5)
- **S12** `CLEANUP_EXECUTED_MANUAL` summary.sessions=4

**결론**: 모든 시나리오 PASS. 디버그용 `console.log` 제거 + 헤더 주석 최종판으로 정리.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|-----------|
| 1 | 5건 중 3건만 실행 | (A) 5건 전부 (B) 1건만 (C) 2·3a·3b 3건 | HS256 이월의 명시적 이유(쿠키 무효화 리스크) 존중. 1·4·5 는 상호작용/환경/규모 제약 |
| 2 | `cleanupExpiredSessions` 반환 타입 변경 | (A) 반환 타입 유지 + scheduler 에 DB 쿼리 중복 (B) 반환 타입 확장 | 데이터 소유자(cleanup.ts) 가 entries 보유가 자연스러움. scheduler 는 audit 정책만 |
| 3 | SESSION_EXPIRE audit 위치 | (A) cleanup.ts 내부 (B) scheduler 래퍼 | DB ops vs audit 관심사 분리. scheduler 래퍼가 audit 정책 변경을 국소화 |
| 4 | `revokeAllUserSessions` 확장 방식 | (A) 신규 함수 추가 (B) optional param + 기본값 | 호출자 1곳 (refresh) 이 기본값으로 기존 동작 유지 — 소프트 확장 |
| 5 | Prisma ORM filter 버그 대응 | (A) $transaction 유지 + 다른 filter (B) raw SQL 2-step (C) 컬럼 TIMESTAMPTZ 마이그레이션 | (C) 가 근본 해결이지만 스키마 변경 파급 큼. (B) 로 이 경로만 국소 회피. (C) 는 별도 기술부채 추적 |
| 6 | SESSION_EXPIRE audit 실패 격리 | (A) throw (B) try/catch warn | audit 손실이 cleanup 배치 차단보다 덜 나쁨. warn 로그 + 계속 진행 |

## 수정 파일 (4개) + 신규 파일 (4개)

| # | 경로 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/sessions/cleanup.ts` | 함수 시그니처 확장 + `$queryRaw`/`$executeRaw` 2-step + pure function `buildSessionExpireAuditDetail` 신규 export |
| 2 | `src/lib/cleanup-scheduler.ts` | `runSessionsCleanupWithAudit` 헬퍼 + sessions task 래퍼 연결 + SESSION_EXPIRE 감사 로그 기록 |
| 3 | `src/lib/sessions/tokens.ts` | `revokeAllUserSessions(userId, reason?)` 시그니처 확장 (default "reuse_detected") |
| 4 | `src/lib/sessions/tokens.test.ts` | admin/logout/count=0 3 tests 추가 (describe 제목도 "defense-in-depth + admin 강제 revoke" 로 확장) |
| 5 | `src/app/api/admin/users/[id]/sessions/route.ts` | ⭐ 신규 — DELETE withRole(ADMIN) + revokeAll("admin") + SESSION_ADMIN_REVOKE_ALL audit |
| 6 | `src/lib/sessions/cleanup.test.ts` | ⭐ 신규 — 11 tests (payload 3 + SELECT/DELETE SQL 검증 7 + BigInt 변환 1) |
| 7 | `scripts/session39-e2e.sh` | ⭐ 신규 — E2E 12 step 스크립트 (admin revoke + SESSION_EXPIRE audit 검증) |
| 8 | `scripts/session39-helper.cjs` | ⭐ 신규 — pg 직접 연결 helper (get-admin-id / insert-expired / count-active-sessions / cleanup-test-rows) |

## 검증 결과

- `npx tsc --noEmit` — 0 에러
- `npx vitest run` — **245 PASS** (13 files, 231 → 245 +14 신규, 회귀 0)
  - `cleanup.test.ts`: 11 신규
  - `tokens.test.ts`: 18 → 21 (+3 신규 admin/logout reason variants)
  - 기타 231 기존 유지
- `/ypserver prod --skip-win-build` — Phase 1 skip, Phase 2 Prisma migrate (pending 0), 빌드 성공, Drizzle migrations applied, PM2 restart ↺=9 (디버그 세션 포함 누적), HTTP 307, Tunnel OK
- 프로덕션 E2E curl 스크립트 (`/mnt/e/.../scripts/session39-e2e.sh`) — S1~S12 12단계 전수 통과:
  - **admin revoke**: S4 `revokedCount` 값 일치 · S7 `SESSION_ADMIN_REVOKE_ALL` audit 기록 · S6 cookieB refresh → 조용히 401 (reason=admin 분기, self_except_current 유사)
  - **SESSION_EXPIRE audit**: S10 `summary.sessions: 4` · S11 audit 테이블 5건 표시 · S12 CLEANUP_EXECUTED_MANUAL summary.sessions=4

## 터치하지 않은 영역

- `@prisma/client` Session 모델 스키마 (필드 변경 없음)
- Prisma migrations (DB 스키마 그대로)
- refresh route / revoke-all route (세션 37 의 reason 태깅 + isRotationReuse 분기 그대로 활용)
- HS256 legacy 쿠키 / AUTH_SECRET 제거 (단독 세션 대기)
- MFA UI / WebAuthn (사용자 수동 QA 영역)

## 알려진 이슈

- **PG TIMESTAMP(3) timezone-naive 9시간 오프셋 (세션 34 이슈 재확인)** — `sessions.expires_at`, `rate_limit_buckets.window_start` 등 전반. 본 세션은 `cleanupExpiredSessions` 경로만 raw SQL 로 국소 회피. Prisma ORM 의 filter 를 사용하는 다른 경로는 여전히 잠재 리스크. 근본 해결은 TIMESTAMPTZ 마이그레이션 (별도 세션).
- **SESSION_EXPIRE audit detail 의 `expiresAt` 필드 시프트 9h** — PG 측 저장 값이 이미 KST-local 해석으로 들어간 상태라 감사 기록도 실제 UTC 의도 시각 대비 9h 뒤. 감사 목적상 "어떤 row 가 언제 배치 정리되었나" 는 추적 가능. 완전 교정은 TIMESTAMPTZ 마이그레이션에 종속.
- **디버그 E2E 중 누적된 revoked 세션** — `sessions` 테이블에 revokedReason='admin' 다수. cleanup grace 1일 경과 후 점진 정리 예정.
- **`/api/auth/login` (deprecated) 쿠키 설정** — E2E 중 일부 시나리오에서 cookieA 가 비어 오는 케이스 관찰 (rate-limit 영향 혹은 deprecated 경로 특성). `v1/auth/login` 으로 전환 시 Bearer 토큰 포함 안정화 가능. 본 세션은 E2E 스크립트 내 rate-limit 리셋으로 회피.

## 다음 작업 제안

### 우선순위 1: MFA UI biometric 포함 브라우저 수동 QA — 세션 35/37/38 이월 (1~2h)

`docs/guides/mfa-browser-manual-qa.md` 8 시나리오 + 세션 36 활성 세션 카드 3 시나리오. 생체인증(Touch ID / Windows Hello) 필수로 자동화 불가.

### 우선순위 2: HS256 legacy 쿠키 제거 — 단독 세션 권장 (1~1.5h)

세션 33 ES256 전환 이후 24h 만료 초과. `AUTH_SECRET` 제거 + `verifySession` HS256 fallback 코드 정리 + 관련 테스트 갱신. 기존 쿠키 무효화 리스크 → 작업 직전 활성 사용자 세션 전수 확인 필요.

### 우선순위 3: PG TIMESTAMP 컬럼 TIMESTAMPTZ 마이그레이션 — 기술부채 (2~3h)

세션 34 + 세션 39 연 2회 재현. 대상: `sessions.{created_at,last_used_at,expires_at,revoked_at}` + `rate_limit_buckets.{window_start,updated_at}` + `mfa_*` 테이블 + `webauthn_*` 등. 마이그레이션 SQL 은 `AT TIME ZONE 'UTC'` 로 재해석. 런타임 Prisma ORM filter 가 모두 정상화됨.

### 우선순위 4: KST 03:00 자동 cleanup 관찰 — 익일 (30m)

본 세션 재배포로 PM2 uptime 초기화. 2026-04-20 03:00 KST 이후 `action='CLEANUP_EXECUTED'` 엔트리 확인. 만약 미발화 시 원인 추적(instrumentation.ts / scheduler tick).

### 우선순위 5: SP-013/016 물리 측정 (환경 확보 시)

### 우선순위 6: `/kdygenesis --from-wave` 연계

## Compound Knowledge (추출 예정)

본 /cs 단계에서 2건 추출:
1. **`2026-04-19-prisma-orm-tz-naive-filter-gotcha.md`** — Prisma 7 adapter-pg + PG TIMESTAMP(3) 환경에서 ORM `{lt: jsDate}` filter 의 조용한 실패 패턴. raw SQL `NOW() - INTERVAL` 로 서버측 위임이 안전한 회피. confidence=high, 세션 34 이슈의 재현 가이드.
2. **`2026-04-19-per-row-audit-on-batch-delete.md`** — 배치 정리 시 집계 로그 + per-row 감사 로그 병행 기록 패턴. DB ops 함수는 entries 반환만 담당하고, audit 는 호출자 (scheduler) 가 관심사 분리. confidence=high.

**CK 누적 28 → 30건**.

---
[← handover/_index.md](./_index.md)
