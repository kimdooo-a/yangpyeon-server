# 세션 37 인수인계서 — Phase 15-D 보강 + revoke 의도-혼동 버그 수정

> 상위: [`handover/_index.md`](./_index.md)
> 일자: 2026-04-19
> 소요: ~2h
> 상태: 완결 (E2E before/after PASS + 3 CK 추가)

## 세션 목표

세션 36 위임 5건을 순차 실행:
1. ①MFA UI + 활성 세션 카드 브라우저 11 시나리오
2. ②KST 03:00 자동 cleanup 관찰
3. ③Phase 15-D 보강 (revoke-all / lastUsedAt)
4. ④SP-013/016 물리 측정
5. ⑤CK 2건 후보

## 실행 결과

### 실행 가능 · 완결 (③⑤)

**③Phase 15-D 보강** — 다른 터미널(`ffb3e0f`)이 본 세션 중 기초 구현 완료:
- `revokeAllExceptCurrent(userId, currentId?)` in tokens.ts
- POST `/api/v1/auth/sessions/revoke-all` + withAuth + SESSION_REVOKE_ALL audit
- GET `/api/v1/auth/sessions` 에서 현재 세션 `touchSessionLastUsed` 호출
- `/account/security` UI "현재 세션 외 모두 종료" 버튼
- vitest 188 → 201 (+13)

**⑤CK 2건** — `login-finalize-helper-centralization.md` + `session-revoke-user-intent-vs-defense.md` 작성.

### 세션 중 발견 — 자기파괴 버그 (🚨 기능적)

ffb3e0f 커밋 구현의 실제 E2E 중 발견:

```
A, B 계정 각 로그인 → 2 세션 활성
A 에서 POST /revoke-all → B revoke, A 보존 (preservedCurrent:true)
B 브라우저가 access 만료 후 자동 /refresh 호출
→ 기대: B 만 401
→ 실제: A 도 revoke. 다음 요청 401 (자기파괴)
```

**원인**: refresh route 가 `status==="revoked"` 만 보고 **무조건** defense-in-depth 발동. rotation reuse / 사용자 자발 / logout 등 6가지 revoke 원인을 구분하지 못함.

**수정**: `Session.revokedReason` 필드 도입 + 6 경로 태깅 + refresh route 분기.
- `rotation` → 진짜 reuse 의심 → `revokeAllUserSessions` + `SESSION_REUSE_DETECTED`
- 나머지(`self`/`self_except_current`/`logout`/`reuse_detected`/`admin`) → 조용히 401 + `SESSION_REFRESH_REJECTED`

### 실행 불가 — 이월 (①②④)

- **①MFA UI + 활성 세션 카드 브라우저 검증**: WebAuthn biometric (Touch ID / Windows Hello) 사용자 인터랙션 강제, 자동화 불가.
- **②KST 03:00 자동 cleanup 관찰**: 미래 시점(익일 새벽) 필요.
- **④SP-013/016 물리 측정**: wal2json 슬롯 + 50GB 디스크 환경 미확보.

## 산출물

### 코드 변경 (modified 5 / new 1 / migration 1)

**modified**:
- `prisma/schema.prisma` — Session.revokedReason String? 추가
- `src/lib/sessions/tokens.ts` — `SessionRevokeReason` type 신설 / rotation·revokeSession·revokeAllUserSessions·revokeAllExceptCurrent 4경로 모두 reason 태깅 / findSessionByToken select 확장
- `src/app/api/v1/auth/refresh/route.ts` — `isRotationReuse` 분기 / `SESSION_REFRESH_REJECTED` audit 신설
- `src/app/api/v1/auth/logout/route.ts` — `revokeSession(id, "logout")` 명시
- `src/lib/sessions/tokens.test.ts` — reason 태깅 테스트 5건 추가

**new**:
- `prisma/migrations/20260419170000_add_session_revoked_reason/migration.sql` — `ALTER TABLE "sessions" ADD COLUMN "revoked_reason" TEXT`

### Compound Knowledge 3건 (누적 24 → 27)

1. **`2026-04-19-login-finalize-helper-centralization.md`** (pattern / high) — 3+ 경로의 access/refresh/audit/cookie 묶음을 `finalizeLoginResponse` 하나로 수렴하는 DRY 원칙 + 추출 판단 체크리스트 + Template Method / Facade 비교 + 안티패턴 회피.
2. **`2026-04-19-session-revoke-user-intent-vs-defense.md`** (pattern / high) — `revokeAllUserSessions` vs `revokeAllExceptCurrent` 네임 분리 정당화 / "같은 SQL ≠ 같은 책임" 판별 체크리스트 / 옵션 파라미터 오남용 안티패턴.
3. **`2026-04-19-revoked-reason-intent-tagging.md`** (bug-fix-pattern / high, **severity: functional-bug**) — 자기파괴 버그 발견·수정의 일반화. "write 시점 intent 태깅, read 시점 branch" 패턴이 주문취소/계정정지/구독종료/세션revoke/알림dismiss 모든 soft-delete 도메인에 적용 가능. 컬럼 폭발 vs 다형 테이블 vs enum 대안 분석.

## 검증

### 유닛

- `npx tsc --noEmit`: 0 에러
- `npx vitest run`: 201 → **206 PASS** (+5 회귀 0)
  - revokeAllExceptCurrent reason 태깅 테스트 (+1)
  - revokeAllUserSessions reason 태깅 (+1)
  - revokeSession 파라미터 3건 (+3)

### 배포

- `/ypserver prod --skip-win-build` 통과
- Prisma migrate deploy: `20260419170000_add_session_revoked_reason` 적용 완료
- PM2 restart ↺=3 / HTTP 307 / Tunnel OK

### 프로덕션 E2E (before/after 비교)

스크립트: `/tmp/session37-e2e.sh`

```
7단계 시나리오:
  1. Session A 로그인 (cookie jar A)
  2. Session B 로그인 (cookie jar B)
  3. A — GET /sessions → 2건 + A current ✓
  4. A — POST /revoke-all → {revokedCount:1, preservedCurrent:true}
  5. A — GET /sessions → 1건 (A 만) ✓
  6. B — POST /refresh → 401 SESSION_REVOKED
  7. audit log 확인
```

**Before (ffb3e0f 기초 구현)**:
```
SESSION_REVOKE_ALL      revokedCount=1 preservedCurrent=true
SESSION_REUSE_DETECTED  revokedSessionsCount=1  ← A 도 죽음 ❌
```

**After (세션 37 수정)**:
```
SESSION_REVOKE_ALL       revokedCount=1 preservedCurrent=true
SESSION_REFRESH_REJECTED revokedReason="self_except_current"  ← A 생존 ✓
```

GET /sessions 재호출로 A 의 count=1 유지 확인.

## 다음 세션 권장 작업

### 우선순위 1: MFA UI + Phase 15-D 활성 세션 카드 브라우저 직접 실행 (1-2h)

세션 36·37 E2E curl 9+7 시나리오 전 PASS. 남은 검증은 브라우저 biometric 포함 11 시나리오 수동 수행:

- MFA 8: TOTP Enroll / Login TOTP / Passkey Enroll / Login Passkey / Passkey Delete / Recovery 사용+재사용거부 / (선택) Rate limit / TOTP Disable
- Phase 15-D UI 3: "활성 세션" 카드 노출 / 다른 창 revoke 후 401 리다이렉트 / "현재 세션 외 모두 종료" 버튼

가이드: `docs/guides/mfa-browser-manual-qa.md`.

### 우선순위 2: KST 03:00 자동 cleanup 관찰 (익일)

세션 35·36 수동 실행은 완결. 자동 tick 증적만 남음:
```bash
wsl -e bash -c "source ~/.nvm/nvm.sh && pm2 logs dashboard --lines 200 | grep -i cleanup"
# + audit_logs action='CLEANUP_EXECUTED' (수동은 _MANUAL 로 구분)
```

### 우선순위 3: Phase 15-D 추가 보강 (~2-3h)

- **`SESSION_EXPIRE` audit** — cleanup 시 각 expired row 별 건수 기록
- **activity fingerprint** — UA 파싱으로 "Chrome 130 on macOS" 같은 사람 읽기 쉬운 문자열 표시
- **touch throttle** — GET /sessions 마다 touch 는 현재는 1회 / 요청. 1분 단위 디바운스로 DB 쓰기 감소
- **관리자 forced revoke** — `/api/admin/users/[id]/sessions DELETE all` + `revokedReason="admin"` 활용

### 우선순위 4: SP-013/016 물리 측정 (13h, 환경 확보 시)

- SP-013 wal2json (5h): PG wal2json 설치 + 30분 DML + 슬롯 손상 recovery
- SP-016 SeaweedFS 50GB (8h): weed 설치 + 50GB 디스크 + B2 오프로드

### 우선순위 5: HS256 legacy 쿠키 제거

세션 33 JWKS ES256 도입 후 24h 만료 허용. 세션 37 기준 기간 초과 — `AUTH_SECRET` 환경변수 제거 + jwt-v1 HS256 fallback 코드 경로 정리 가능.

## 알려진 이슈 · 주의사항

### 세션 37 신규

- **Session.revokedReason 는 TEXT nullable** — NULL 은 "revoke 이전 버전" (하위 호환). refresh route 는 `=== "rotation"` 만 reuse 트리거 → NULL 은 암묵적으로 non-rotation 처리 = stale 세션 (조용히 401). 세션 36 이전에 revoke 된 기존 행은 자동으로 stale 취급.
- **`revokedReason` 값은 string literal union (`SessionRevokeReason`)** — DB 에는 TEXT 지만 TS 레벨에서 6개 값 강제. enum 변경 시 schema + type 두 곳 동기화 필요.
- **reuse 탐지는 이제 "진짜 rotation reuse" 만** — 이전엔 모든 revoked 접근이 defense-in-depth 였음. 보안 강도는 rotation 경로 (실제 공격 벡터) 에서 유지되고, 사용자 의도 경로에서만 완화됨.
- **B 세션의 /refresh 는 `SESSION_REFRESH_REJECTED` 로 기록** — admin audit UI 에서 이 action 엔트리는 "정상 로그아웃 패턴" 이며 `SESSION_REUSE_DETECTED` 와 다르게 알림 불필요.
- **테스트에서 revokeSession 기본 인자** — `revokeSession(id)` 만 호출하면 reason="self" default. 로그아웃은 `revokeSession(id, "logout")` 명시 필수. logout route.ts 이미 수정됨.

### 세션 36 신규 (이월)

- 기 발급 v1_refresh_token 은 refresh 불가 (opaque 로 전환 후) — 프로덕션 admin 1 계정만이라 영향 없음
- dashboard_session (24h ES256) 별개 유지
- `touchSessionLastUsed` 는 이제 GET /sessions 호출 시 활성화 (ffb3e0f 커밋 후)
- Session DB reuse 탐지는 Prisma unique index 기반 → PM2 cluster 도 안전

## 타임라인

- 10:20 — 세션 37 시작, 상태 파악 (current.md / next-dev-prompt.md / tokens.ts / login-finalizer.ts)
- 10:22 — 위임 5건 분류 (③⑤만 실행 가능 판정)
- 10:23 — revokeAllExceptCurrent + POST /revoke-all + UI 버튼 + 5 tests (201 PASS)
- 10:24 — 다른 터미널 ffb3e0f 커밋 감지 (기초 구현 중복)
- 10:25 — CK 2건 작성 (login-finalize / user-intent-vs-defense)
- 10:26 — /ypserver prod --skip-win-build 1차 배포 / HTTP 307 OK
- 10:29 — 1차 E2E 실행 → **자기파괴 버그 발견** (SESSION_REUSE_DETECTED revokedCount=1)
- 10:31 — schema Session.revokedReason + migration + 6 경로 태깅 + refresh route 분기 + 5 tests (206 PASS)
- 10:33 — /ypserver prod 2차 배포 / migrate deploy 적용
- 10:34 — 2차 E2E → SESSION_REFRESH_REJECTED + A 생존 확인 ✓
- 10:35 — CK 3번째 작성 (revoked-reason-intent-tagging bug-fix-pattern)
- 10:36 — 마감 문서 병렬 작성

## 교차 참조

- 상위 인수인계: [`260419-session36-phase-15d-refresh-rotation.md`](./260419-session36-phase-15d-refresh-rotation.md)
- 병렬 터미널 커밋: `ffb3e0f docs: /cs 세션 36 마감 — CK 1건 + revoke-all/lastUsedAt 보강`
- Compound Knowledge 3건: `docs/solutions/2026-04-19-{login-finalize-helper-centralization,session-revoke-user-intent-vs-defense,revoked-reason-intent-tagging}.md`
- 다음 세션 프롬프트: [`next-dev-prompt.md`](./next-dev-prompt.md)
- 세션 저널: [`../logs/2026-04.md`](../logs/2026-04.md#세션-37)
