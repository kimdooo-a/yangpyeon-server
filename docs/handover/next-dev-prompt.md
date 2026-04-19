# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + SQLite (Drizzle)
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 배포 — /ypserver prod (세션 24e에서 5 갭 보강 완료):
#   /ypserver prod                      # Phase 1~5 자동 (Windows 빌드 → 복사 → migrate → PM2)
#   /ypserver prod --skip-win-build     # Windows 빌드 항상 실패 환경에서 사용
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |

## 필수 참조 파일 ⭐ 세션 39 종료 시점 — Phase 15-D 보강 4/5 완결 (touch throttle + UA label + SESSION_EXPIRE audit + admin forced revoke, HS256 legacy 제거만 이월)

```
CLAUDE.md
docs/status/current.md
docs/handover/260419-session39-session-expire-admin-revoke.md     ⭐ 최신 (SESSION_EXPIRE per-row audit + 관리자 forced revoke + PG TZ 버그 국소 회피)
docs/handover/260419-session38-phase-15d-touch-throttle-ua-label.md  (touch throttle + activity fingerprint + Playwright MCP)
docs/handover/260419-session37-revoked-reason-intent-fix.md       (Session.revokedReason intent 태깅 + 자기파괴 버그 수정 + CK 3건)
docs/handover/260419-session36-phase-15d-refresh-rotation.md      (Phase 15-D Refresh Rotation + Cleanup 수동 실행 UI + E2E 9 시나리오 PASS)
docs/handover/260419-session35-cleanup-scheduler-ck-batch.md      (Cleanup Scheduler + CK 4건 + MFA QA 가이드)
docs/handover/260419-session34-phase15-ui-and-mfa-status.md      (세션 34 UI 통합 + 라이브 디버깅 2건)
docs/handover/260419-session33-phase15-step3-4-5.md              (JWKS + TOTP + WebAuthn + Step 6 백엔드)
docs/handover/260419-session32-phase15-step1-2.md                (Prisma Session + argon2id)
docs/handover/260419-session31-cleanup-safeguard-adr-reflect.md  (safeguard + ADR/DQ 반영)
docs/handover/260419-session30-spike-priority-set.md             (스파이크 7건 완결)
docs/guides/mfa-browser-manual-qa.md                             ⭐ 세션 35 — 8 시나리오 SOP (우선순위 1 실행 대상)
docs/research/_SPIKE_CLEARANCE.md                                15 엔트리 (SP-013/016 Pending 유지)
docs/research/spikes/spike-013-wal2json-slot-result.md           Pending (물리 측정)
docs/research/spikes/spike-016-seaweedfs-50gb-result.md          Pending (물리 측정)
docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md    ADR-001~019
docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md  §7.2.1~7.2.3
docs/research/2026-04-supabase-parity/00-vision/07-dq-matrix.md       DQ-AC-1/AC-2/4.1/12.4 Resolved
docs/solutions/2026-04-19-*.md (18건)                             ⭐ Compound Knowledge 세션 33·34·35·36·37·38·39 (누적 30건)
  - otplib-v13-breaking-noble-plugin.md                          세션 33 외부 라이브러리
  - simplewebauthn-v10-api-shape.md                              세션 33 외부 라이브러리
  - mfa-challenge-token-2fa-pattern.md                           세션 33 설계 패턴
  - bcrypt-argon2-progressive-rehash-merged-update.md            세션 32 설계 패턴
  - pg-timestamp-naive-js-date-tz-offset.md                      세션 34 디버깅
  - rate-limit-defense-in-depth-conflict.md                      세션 34 디버깅
  - opaque-refresh-rotation-reuse-detection.md                   세션 36 아키텍처
  - login-finalize-helper-centralization.md                      세션 37 DRY 패턴
  - session-revoke-user-intent-vs-defense.md                     세션 37 함수 분리
  - revoked-reason-intent-tagging.md                             세션 37 버그픽스 (severity: functional)
  - ios-safari-ua-regex-trap.md                                  세션 38 bug-fix (Version/N ... Safari/N 중간 Mobile/ 토큰 끼임)
  - prisma-orm-tz-naive-filter-gotcha.md                         ⭐ 세션 39 bug-fix-pattern (Prisma 7 adapter-pg + PG TIMESTAMP(3) 9h KST 조용한 filter 실패 → raw SQL NOW()-INTERVAL 위임)
  - per-row-audit-on-batch-delete.md                             ⭐ 세션 39 pattern (DB ops 는 entries 반환, audit 정책은 호출자 scheduler 에서 → 집계 + per-row 병행)
docs/security/skill-audit-2026-04-19.md                          /ypserver safeguard 감사 PASS
docs/MASTER-DEV-PLAN.md
src/lib/cleanup-scheduler.ts                                      세션 35 신설 + 세션 36 CleanupActor 확장
src/lib/sessions/activity.ts                                      ⭐ 세션 38 신설 (shouldTouch 60s 디바운스 + parseUserAgent UA label)
src/lib/sessions/activity.test.ts                                 ⭐ 세션 38 신설 (25 pure function 테스트)
src/lib/sessions/tokens.ts                                        ⭐ 세션 36 신설 (opaque 토큰 + DB Session rotation), 세션 38 userAgentLabel/lastUsedAt 필드
src/lib/sessions/login-finalizer.ts                               ⭐ 세션 36 신설 (3 로그인 경로 공통 helper)
src/app/api/v1/auth/refresh/route.ts                              ⭐ 세션 36 신설 (rotate + reuse 탐지)
src/app/api/v1/auth/sessions/route.ts                             ⭐ 세션 36 신설 (GET 활성 세션)
src/app/api/v1/auth/sessions/[id]/route.ts                        ⭐ 세션 36 신설 (DELETE self-revoke)
src/app/api/admin/cleanup/run/route.ts                            ⭐ 세션 36 신설 (수동 트리거)
src/app/(protected)/(admin)/settings/cleanup/page.tsx             ⭐ 세션 36 신설 (UI)
src/app/api/v1/auth/sessions/revoke-all/route.ts                  ffb3e0f 커밋 + 세션 37 reason 태깅 (POST /revoke-all)
src/app/api/admin/users/[id]/sessions/route.ts                    ⭐ 세션 39 신설 (DELETE admin forced revoke + reason="admin" + SESSION_ADMIN_REVOKE_ALL audit)
src/lib/sessions/cleanup.ts                                       ⭐ 세션 39 재설계 (raw SQL 2-step + expiredEntries 반환 + buildSessionExpireAuditDetail 순수 함수)
src/lib/sessions/cleanup.test.ts                                  ⭐ 세션 39 신설 (11 tests)
src/instrumentation.ts                                            세션 35 ensureCleanupScheduler 통합
prisma/migrations/20260419170000_add_session_revoked_reason/      세션 37 (Session.revokedReason TEXT)
scripts/session39-e2e.sh + session39-helper.cjs                   ⭐ 세션 39 E2E (admin revoke + SESSION_EXPIRE audit 12 step 검증)
```

## 현재 상태 (세션 39 종료 시점)

### 완료된 Phase
- Phase 1~14c-γ 전부 완료
- **kdywave Wave 1-5 완주**: 123 문서 / 106,588줄
- **세션 30**: 우선 스파이크 7건 완결 (5 실측 + 2 축약)
- **세션 31**: safeguard + ADR/DQ 반영 + CK 5건 (타 터미널)
- **세션 32**: Phase 15 Step 1-2 — Prisma Session + argon2id 자동 재해시
- **세션 33**: Phase 15 Step 3·4·5·6 서버측 일괄 완결 (commit `58a517b`)
- **세션 34**: Phase 15 UI 통합 + 라이브 디버깅 2건 (commit `9a6b4ff`)
- **세션 35**: Cleanup Scheduler + CK 4건 + MFA QA 가이드 (commit `a29ac1b`)
- **세션 39** ⭐ — Phase 15-D 보강 2건 완결 + PG TZ 버그 국소 회피 (SESSION_EXPIRE per-row audit + 관리자 forced revoke)
  - 5 이월 항목 중 HS256(단독 세션 잠금) · MFA biometric · SP013/016 · /kdygenesis 제외, 2·3a·3b 3건 자율 채택
  - TDD: `cleanup.test.ts` 11 신규 + `tokens.test.ts` admin/logout 3 신규 → **vitest 231→245 PASS**
  - `cleanup.ts`: `$executeRaw` 1-step → `$queryRaw + $executeRaw` 2-step 재설계 + `{deleted, expiredEntries}` 반환 + `buildSessionExpireAuditDetail` 순수 함수 신규
  - `cleanup-scheduler.ts`: `runSessionsCleanupWithAudit` 래퍼 — 각 entry 별 `SESSION_EXPIRE` audit 기록 (try/catch 격리), 집계 `CLEANUP_EXECUTED` 와 병행
  - `tokens.ts`: `revokeAllUserSessions(userId, reason?)` optional 파라미터 — default `"reuse_detected"` (refresh route 호환 유지)
  - 신규 `src/app/api/admin/users/[id]/sessions/route.ts` — withRole(ADMIN) + revokeAll("admin") + `SESSION_ADMIN_REVOKE_ALL` audit (writeAuditLogDb 즉시)
  - **E2E 중 버그 재현**: Prisma 7 adapter-pg + PG `TIMESTAMP(3)` timezone-naive 조합에서 `session.findMany({where:{expiresAt:{lt:cutoff}}})` 가 조용히 0 rows. 9h KST 오프셋 (세션 34 CK `pg-timestamp-naive-js-date-tz-offset` 재현 케이스). 서버측 `NOW() - INTERVAL '1 day'` + `expires_at::text` 캐스팅으로 국소 회피
  - **검증**: tsc 0 / `/ypserver prod --skip-win-build` 통과 (PM2 ↺ 누적 9, HTTP 307, Tunnel OK) / E2E curl 12 step 전수 PASS
  - **CK +2** (누적 28 → 30): `prisma-orm-tz-naive-filter-gotcha` (bug-fix-pattern, high) / `per-row-audit-on-batch-delete` (pattern, high)
- **세션 38** — Phase 15-D 보강 2/5 완결 (touch throttle + activity fingerprint)
  - `/kdyguide` 자율 실행 위임 → 5 보강 항목 중 가장 작고 독립적·낮은 리스크인 2개 선정
  - 신규 `src/lib/sessions/activity.ts` — pure function 2개(shouldTouch 60초 디바운스 + parseUserAgent Chrome/Firefox/Safari/Edge × Windows/macOS/Linux/iOS/Android + curl regex)
  - 신규 `activity.test.ts` +25 tests (TDD, iOS Safari UA regex 1회 fail → 수정: "Safari 토큰 존재 + Chrome/Edge 부재" 조건)
  - `tokens.ts` SessionLookup lastUsedAt + ActiveSessionSummary userAgentLabel / `sessions/route.ts` shouldTouch 분기 / `security/page.tsx` 라벨+툴팁
  - **검증**: tsc 0 / vitest 206→**231 PASS**(+25, 회귀 0) / `/ypserver prod --skip-win-build` PM2 ↺=4 / **프로덕션 E2E curl 3 PASS**(throttle·label·touch) / **Playwright MCP 브라우저 자동화 완결** — 로그인→/account/security→"Chrome 147 · Windows" 라벨+raw UA title 툴팁 보존 확인 + 스크린샷 증적
  - 커밋 `b454e3c`
- **세션 36** — Phase 15-D Refresh Token Rotation + Cleanup 수동 실행 UI
  - **P4 cleanup UI**: `/api/admin/cleanup/run` POST + `(admin)/settings/cleanup` 페이지. `cleanup-scheduler.ts` CleanupActor 확장(하위 호환). 사이드바 엔트리.
  - **P2 조기 검증**: 수동 트리거로 webauthn-challenges 1건 삭제 실측 + audit actor 정보 확인. 자동 스케줄 KST 03:00 병행.
  - **P3 Phase 15-D**: opaque 32 bytes hex + SHA-256 hash + Prisma Session DB-backed rotation. 신규 `src/lib/sessions/{tokens,login-finalizer}.ts` + `tokens.test.ts`(+8). API 3건(`POST /refresh` reuse 탐지 / `GET /sessions` / `DELETE /sessions/[id]`). logout 서버측 revoke. 로그인 3경로 finalizeLoginResponse. `/account/security` 활성 세션 카드. 사이드바 v1+dashboard logout 병행. jwt-v1 미사용 export 정리. 감사 4종 신규(SESSION_LOGIN/ROTATE/REVOKE/REUSE_DETECTED).
  - **검증**: tsc 0 / vitest 188→**201 PASS**(+13, 회귀 0) / `/ypserver prod --skip-win-build` 통과 / **프로덕션 E2E curl 9 시나리오 전 PASS**
- **세션 37** ⭐ — Phase 15-D 보강 + revoke 의도-혼동 버그 수정 (ffb3e0f 병렬 기초 + 세션 37 버그 수정)
  - **ffb3e0f (병렬 터미널)**: `revokeAllExceptCurrent` / POST `/revoke-all` / `touchSessionLastUsed` (GET /sessions) / UI "다른 세션 모두 종료" 버튼 / +13 tests (188→201)
  - **세션 37 본류 (버그 수정)**: E2E 중 자기파괴 시나리오 발견 — revoke-all 후 B 세션의 stale /refresh 가 defense-in-depth 를 발동시켜 A 도 revoke. 사용자 의도 파괴.
  - **수정**: schema `Session.revokedReason` String? + migration `20260419170000_add_session_revoked_reason` + tokens.ts `SessionRevokeReason` type (6값) + 4경로(rotation/revokeSession/revokeAllUserSessions/revokeAllExceptCurrent) reason 태깅 + refresh route `isRotationReuse` 분기 (`rotation` 만 reuse 탐지, 나머지는 `SESSION_REFRESH_REJECTED`)
  - **검증**: tsc 0 / vitest 201→**206 PASS**(+5 회귀 0) / `/ypserver prod` 2차 배포 migrate deploy 적용 / **프로덕션 E2E before/after**: `SESSION_REUSE_DETECTED revokedCount=1` → `SESSION_REFRESH_REJECTED revokedReason="self_except_current"` + A 생존
  - **CK +3**: login-finalize-helper-centralization (pattern) / session-revoke-user-intent-vs-defense (pattern) / revoked-reason-intent-tagging (bug-fix-pattern, functional-bug). **누적 24 → 27**
- **세션 34b (세션 35 요약)** — 세션 34 위임 4건 순차 처리
  - **우선순위 1**: `docs/guides/mfa-browser-manual-qa.md` 신규 8 시나리오 SOP (WebAuthn 브라우저 인터랙션 필수라 자동화 불가 → 다음 세션 직접 실행용)
  - **우선순위 2**: `src/lib/cleanup-scheduler.ts` 신설 — 4종 cleanup(sessions/rate-limit-buckets/jwks-retired/webauthn-challenges) 매일 KST 03:00 실행. 1분 tick + `lastRunKey` dedupe + 각 task 독립 try/catch + audit `CLEANUP_EXECUTED` 기록. `cron/registry.ts` 와 분리(UI CRUD vs 시스템 내부). `computeCleanupWindow` 순수 함수로 timezone-safe. `instrumentation.ts` 통합. **vitest 175→188 PASS** (+13 회귀 0). `/ypserver prod --skip-win-build` 통과(HTTP 307, Next Ready 79ms, PM2 로그 예외 0).
  - **우선순위 3**: SP-013/016 물리 측정 환경 미확보 → Pending 유지 확인만.
  - **우선순위 4**: Compound Knowledge 6건 중 세션 34 unstaged 2건 확인(pg-timestamp-naive / rate-limit-defense-in-depth) + 신규 4건 Agent 2대 병렬 작성(otplib-v13 / simplewebauthn-v10 / mfa-challenge-token / bcrypt-argon2-rehash, 총 703줄). **CK 누적 23건**.

## 추천 다음 작업

### 우선순위 1: MFA UI + Phase 15-D 활성 세션 카드 브라우저 직접 실행 ⭐ 즉시 착수 가능 (1-2h)

`docs/guides/mfa-browser-manual-qa.md` 의 8 시나리오 SOP + **세션 36 추가**: Phase 15-D 활성 세션 카드 3 시나리오.

**MFA 기존 8 시나리오**:
1. TOTP Enroll (idle → qr+secret+6자리 → recovery 10 코드)
2. Login MFA Challenge (TOTP)
3. Passkey Enroll (WebAuthn Register + biometric)
4. Login via Passkey (WebAuthn Assert)
5. Passkey Delete (자기 자격증명 — userId 매칭 강제)
6. Recovery Code 사용 + 재사용 거부
7. (선택) Rate Limit 차단 + `Retry-After: 60` 회귀 가드
8. TOTP Disable (비밀번호 + 현재 TOTP 모두 요구)

**Phase 15-D 활성 세션 카드 신규 3 시나리오**:
9. `/account/security` 하단 "활성 세션" 카드 노출 + 현재 세션 배지 (세션 36 E2E curl 검증 완료, 브라우저 UI 만 남음)
10. 다른 브라우저(또는 시크릿 창)에서 재로그인 → 활성 세션 2건 → 하나 "종료" 클릭 → 해당 창 401 리다이렉트
11. 사이드바 "로그아웃" → `/api/v1/auth/logout` + `/api/auth/logout` 병행 호출 확인(DevTools Network) → /login 리다이렉트

**DOD**: 1~6·8 필수 + 9~11 Phase 15-D UI 확인.

### 우선순위 2: Cleanup scheduler 자동 실행 (KST 03:00 관찰) — 수동 검증은 세션 36에 완결

세션 36 P4 UI 로 수동 트리거 1회 실행 완결(webauthn-challenges 1건 삭제 실증). KST 03:00 +1일 자동 tick 동작 검증만 남음:
- `wsl -e bash -c "source ~/.nvm/nvm.sh && pm2 logs dashboard --lines 200 | grep -i cleanup"`
- SQLite `auditLogs` `action='CLEANUP_EXECUTED'` 엔트리 확인 (수동 `_MANUAL` 과 다른 action)
- 실패 시 원인 조사 — prisma timeout / PG 연결 고갈 / instrumentation 등록 실패

### 우선순위 3: Phase 15-D 추가 보강 — 남은 1건 (~1.5h, 단독 세션 권장)

세션 36·37·38·39 로 핵심 경로 + revoke-all + intent 태깅 + touch throttle + activity fingerprint + **SESSION_EXPIRE audit + 관리자 forced revoke** 완결. 남은 1건:
- **HS256 legacy 쿠키 제거** ⭐ 단독 세션 — 세션 33 JWKS ES256 전환 후 24h 만료 초과. `AUTH_SECRET` 제거 + `src/lib/auth.ts` HS256 fallback 코드 정리. 기존 쿠키 무효화 리스크 존재 → 작업 직전 활성 사용자 세션 전수 확인 필요.

~~touch throttle~~ ✓ 세션 38 완결
~~activity fingerprint~~ ✓ 세션 38 완결
~~SESSION_EXPIRE audit~~ ✓ 세션 39 완결
~~관리자 forced revoke~~ ✓ 세션 39 완결

### 우선순위 3b (신규): PG TIMESTAMPTZ 컬럼 마이그레이션 — 기술부채 최상위 승격 (2~3h)

세션 34 + 세션 39 연 2회 재현. 대상:
- `sessions.{created_at,last_used_at,expires_at,revoked_at}` — 세션 39 에서 국소 raw SQL 회피 적용
- `rate_limit_buckets.{window_start,updated_at}` — 세션 34 에서 `EXTRACT(EPOCH FROM ...)` 회피
- `mfa_*` / `webauthn_*` 등 타임스탬프 컬럼 전수

마이그레이션 SQL: `ALTER COLUMN ... TYPE TIMESTAMPTZ(3) USING ... AT TIME ZONE 'UTC'`. 런타임 Prisma ORM filter 의 시간 기반 쿼리 모두 정상화.

### 우선순위 4: SP-013/016 물리 측정 (13h, 환경 확보 시)
- **SP-013 wal2json** (5h): PG + wal2json 설치 + 30분 DML + 슬롯 손상 recovery
- **SP-016 SeaweedFS 50GB** (8h): weed 설치 + 50GB 디스크 + B2 오프로드

### 우선순위 5: `/kdygenesis --from-wave` 연계
입력: `07-appendix/03-genesis-handoff.md` _PROJECT_GENESIS.md 초안 (85+ 태스크)
산출: 주간 실행 플로우

### 진입점 예시
```
# 우선순위 1 — MFA UI + Phase 15-D 활성 세션 카드 브라우저 직접 실행
# 1. https://stylelucky4u.com/login → admin 로그인
# 2. 사이드바 "내 계정 > MFA & 보안" → TOTP/Passkey/Recovery 기존 1~8
# 3. 동일 페이지 하단 "활성 세션" 카드 (세션 36 신규):
#    - 현재 세션 배지 표시
#    - 다른 브라우저/시크릿 창 재로그인 → 2건 → 하나 "종료" → 즉시 401
# 4. 로그아웃 → /login 리다이렉트 + DevTools Network 에서 v1 logout + dashboard logout 둘 다 200 확인

# 또는 우선순위 2 — KST 03:00 자동 cleanup 관찰 (익일)
# wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && node -e \"const Database=require('better-sqlite3');const db=new Database('data/dashboard.db',{readonly:true});console.log(JSON.stringify(db.prepare(\\\"SELECT action,substr(detail,1,100) AS detail FROM audit_logs WHERE action LIKE 'CLEANUP%' ORDER BY id DESC LIMIT 5\\\").all(),null,2));\""

# 또는 우선순위 3 — Phase 15-D revoke-all 보강
# POST /api/v1/auth/sessions/revoke-all (신규) → 현재 세션만 유지, 나머지 revoke
```

## 알려진 이슈 및 주의사항

### 세션 39 신규

- **PG `TIMESTAMP(3)` timezone-naive + Prisma 7 adapter-pg = 9h KST 시프트** — 세션 34(rate-limit 경로) 에 이어 세션 39(sessions 경로) 에서 재현. `session.findMany({where:{expiresAt:{lt: jsDate}}})` 가 조용히 0 rows 반환. 신규 filter 구현 시 **raw SQL `NOW() - INTERVAL` 서버측 위임** 우선 검토. 근본 해결은 TIMESTAMPTZ 마이그레이션(우선순위 3b).
- **`cleanupExpiredSessions` 는 `$queryRaw + $executeRaw` 2-step** — interactive `$transaction` 미사용. race 는 `id = ANY($ids)` 필터로 완화. 세션 39 이전의 `$executeRaw DELETE FROM sessions` 단일 쿼리 시그니처는 **Breaking Change** (반환 타입 확장). caller 는 scheduler 1곳뿐이라 이미 반영.
- **SESSION_EXPIRE audit detail 의 `expiresAt` 은 9h 시프트 상태 기록** — PG 저장 값 자체가 KST-local 해석으로 들어간 문제라 감사 상세도 의도 시각 대비 9h 뒤. "어떤 row 가 언제 배치 정리되었나" 추적은 가능. 완전 교정은 TIMESTAMPTZ 마이그레이션 종속.
- **`revokeAllUserSessions(userId, reason?)` 기본값은 `"reuse_detected"`** — refresh route 호환 유지. 새 caller (admin forced revoke 등) 는 reason 명시 전달 의무. reason 값은 `SessionRevokeReason` 타입(6값)에서 선택.
- **`DELETE /api/admin/users/[id]/sessions` 는 자기 revoke 허용** — admin 이 본인 id 로 호출해도 차단 없음. 본인 세션 전부 revoke 후 next request 가 401 → 재로그인. 의도적 동작.
- **`/api/auth/login` (deprecated) 쿠키 설정 간헐 실패** — E2E 스크립트 일부 시나리오에서 cookieA 가 비어 옴. rate-limit 버킷 축적 영향 가능성. 실사용 영향 낮음. 장기적으로 `/api/v1/auth/login` 으로 전환.

### 세션 38 신규

- **`activity.ts` 는 순수 모듈** — DB·외부 상태·Date.now() 의존 없음(now 주입). route handler 에만 적용, 다른 경로에서 touch 하려면 직접 `shouldTouch` 호출 후 `touchSessionLastUsed` 수동 호출 필요.
- **UA 라벨은 read-only 변환** — DB 에 raw `userAgent` 만 저장, 응답 시점 `parseUserAgent` 호출. 파싱 로직 변경 시 저장 데이터 마이그레이션 불필요.
- **`ua-parser-js` 의도적 배제** — 본 프로젝트 UA 탐지 범위는 주류 브라우저 + curl 뿐이라 ~20KB 라이브러리 과투자. 미탐지는 "기타 브라우저 · 기타 OS" fallback. 봇 탐지는 범위 밖.
- **iOS Safari regex 함정 교훈** — `Version/N ... Safari/N` 사이에 `Mobile/...` 토큰 끼는 패턴에서 `Version\/(\d+)[^\s]*\s+Safari` 실패. "Safari 토큰 존재 + Chrome/Edge 부재" exclusion 조건이 더 견고.
- **touch throttle 임계치 60초 고정** — `TOUCH_THROTTLE_MS` 상수로 export. 향후 환경변수/설정으로 빼고 싶다면 `shouldTouch(last, now, threshold)` 3번째 인자 활용.

### 세션 37 신규

- **Session.revokedReason 는 TEXT nullable** — 세션 36 이전에 revoke 된 기존 행은 NULL, refresh route 에서 자동으로 non-rotation → stale 취급. 하위 호환.
- **`revokedReason` 값은 `SessionRevokeReason` string literal union (6값)** — DB 에는 TEXT 지만 TS 레벨 강제. 값 추가 시 schema + type 두 곳 동기화 필요.
- **reuse 탐지는 이제 "진짜 rotation reuse" 만** — 사용자 의도 경로(self/self_except_current/logout) 에서 `SESSION_REFRESH_REJECTED` 조용히 401. rotation 경로(실제 공격 벡터) 는 여전히 defense-in-depth 발동.
- **병렬 터미널 커밋 `ffb3e0f`** — 세션 37 진행 중 다른 터미널이 기초 구현(revoke-all + lastUsedAt + UI) 커밋. 본 세션은 그 위에 버그 수정 + CK 3건 쌓음. 동시 작업이지만 파일 충돌 0건 (다른 영역 편집).
- **E2E script `/tmp/session37-e2e.sh`** — WSL 측 /tmp 에 작성. 재실행 시 `source ~/.nvm/nvm.sh && /tmp/session37-e2e.sh` (node 필요).
- **테스트 mock 패턴 확장** — `tokens.test.ts` 에 `mockUpdate` (update) + `mockUpdateMany` 2종. 향후 Session DB 로직 추가 시 동일 패턴.

### 세션 36 신규
- **기 발급 v1_refresh_token (stateless JWT) 은 더 이상 refresh 불가** — 본 세션 배포 시점 기준. 해당 쿠키 소지자는 `/api/v1/auth/refresh` 시 401 INVALID_REFRESH_TOKEN → 재로그인 유도. 프로덕션은 admin 1계정만이라 실사용 영향 없음.
- **dashboard_session 쿠키 (24h ES256) 는 별개 유지** — v1 refresh rotation 과 무관. 로그아웃 시 `Promise.allSettled` 로 v1 + dashboard 양쪽 모두 revoke.
- **`touchSessionLastUsed` 는 미사용 export** — 현재 rotate 시점 의존. 향후 access 검증 또는 일정 주기 갱신으로 `lastUsedAt` 정확도 높이면 UI 활성 세션 카드 개선됨.
- **`revokeAllUserSessions` 는 reuse 탐지 전용** — 사용자 "모든 세션 종료" 버튼은 별도 endpoint 필요 (다음 세션 우선순위 3).
- **`/api/v1/auth/sessions` GET Bearer 단독 사용 시 `current: false`** — v1_refresh_token 쿠키로 current 판별. Bearer 만으로 호출하면 현재 세션 배지 표시 안 됨 (올바른 동작).
- **Session DB reuse 탐지는 단일 프로세스 보장** — `findSessionByToken` 는 Prisma unique index 에서 확인하므로 PM2 cluster 에서도 안전. 단 `revokeAllUserSessions` 내 update 는 트랜잭션 없이 `updateMany` → race 발생해도 최종 revoke 상태 보장됨.

### 세션 35 신규
- **Cleanup scheduler 자동 실행 (KST 03:00) 관찰 필요** — 세션 36 수동 트리거로 로직 검증 완결. 자동 tick 동작 확인은 익일 남음.
- **`globalThis.__cleanupScheduler` 는 단일 프로세스 전제** — PM2 cluster(SP-010) 도입 시 워커마다 별도 scheduler → 중복 실행. advisory_lock/Redis 리더 선출로 보강 필요. 현재 fork 모드 무관.
- **`runCleanupsNow()` 는 함수 export 만** — `/api/admin/cleanup/run` 엔드포인트 + UI 미구현 (세션 35 우선순위 4 위임).
- **audit log `action` 2종 추가** (`CLEANUP_EXECUTED`, `CLEANUP_EXECUTED_MANUAL`) — 감사 로그 UI 필터 drizzle like 로 자동 노출.
- **MFA UI 브라우저 검증은 여전히 본인 직접 실행 필수** — `docs/guides/mfa-browser-manual-qa.md` 8 시나리오.

### 세션 34 신규
- **MFA UI는 코드만 완결, 브라우저 round-trip 미실행** — 실제 WebAuthn `navigator.credentials.create/get()` 호출은 사용자 인터랙션 필요. 다음 세션 우선순위 1
- **proxy.ts `HANDLER_OWNED_RATE_LIMIT_PATHS` Set** — v1 auth 경로 3건은 handler가 DB-backed로 처리, proxy 인메모리 미적용. 새 v1 auth 경로 추가 시 이 Set 검토
- **PG TIMESTAMP(3) timezone-naive 함정** — Sessions/RateLimitBucket 등 모두 같은 컬럼 타입. 클라이언트 측 elapsed 계산 금지 — PG `EXTRACT(EPOCH ...)` 직접 위임이 안전
- **rate-limit-db `$queryRaw`의 `reset_ms` string 반환** — Postgres NUMERIC → Prisma string 직렬화. `parseFloat` 필수
- **Phase 15 UI 페이지는 (admin) 그룹 밖** — `(protected)/account/security`. USER 포함 모든 사용자 접근. 이 패턴은 사용자별 self-service 모든 페이지의 표준

### 세션 33 신규
- **MFA_MASTER_KEY 필수** — WSL2 `~/dashboard/.env`에 64 hex 설정 완료. 서버 재구축 시 동일 키 복원 필요 (기존 TOTP secret 전부 복호화 불가). PM2 `env_file` 또는 `/etc/luckystyle4u/secrets.env` 이전 권장
- **WebAuthn rpID 도메인 엄격** — production=`stylelucky4u.com`, localhost 분리. `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`/`WEBAUTHN_RP_NAME` 오버라이드. 서브도메인·포트 변경 시 등록된 credential 전부 무효
- **otplib v13 금지** — v13은 `authenticator` export 제거 + Noble crypto plugin 의무 breaking. 패키지 업그레이드 시 v12 고정 유지 (`otplib@^12.0.1`). 이 프로젝트는 `@otplib/core` 에서 `HashAlgorithms` import
- **MFA 경로는 `/api/v1/auth/mfa/*`** — proxy.ts CSRF 체크 `/api/*`에 적용, `/api/v1/*`만 면제. Bearer 기반 관리 엔드포인트는 v1 네임스페이스 강제
- **WebAuthn challenge PG 저장** — 단일 노드 기준. 다중 노드 확장 시 Redis 이관 (Blueprint 명시)
- **HS256 legacy 쿠키 자연 만료** — 세션 33 이후 신 쿠키는 ES256(kid), 기 발급 HS256은 24h 만료까지 허용. AUTH_SECRET 제거 시점은 후속 세션

### 세션 32 신규
- **Sessions 테이블 미사용 상태** — 인프라만. 첫 INSERT는 Phase 15-D Refresh Rotation 도입 시
- **`cleanupExpiredSessions()` 미스케줄** — Sessions INSERT 시작 시점에 node-cron 등록
- **`@node-rs/argon2` const enum 회피** — `const ARGON2ID_ALGORITHM = 2` 상수 캡슐화
- **자동 재해시 첫 1회 느림** — bcrypt 검증 + argon2 hash ≈ 190ms, 2차부터 argon2 verify ≈ 14ms
- **자동 재해시 round-trip 0개 압축** — lastLoginAt update에 머지. CK 후보 미작성

### 세션 31 신규
- **글로벌 스킬 git 미추적** — `~/.claude/skills/ypserver/SKILL.md` 수정은 저장소에 없음. `kdysync` 동기화 필요
- **병렬 터미널 분담 원칙** — 같은 파일 동시 편집 시 "File has been modified" 오류
- **`.playwright-mcp/` 기 tracked 파일 제거 완료** — `cadb8ad`로 저장소 정리

### 세션 30 신규
- ~~**⚠️ PM2 v6.0.14 `delete all --namespace X` 필터 무시 버그**~~ — **세션 31 `/ypserver` §4 safeguard 내재화**
- ~~**argon2 사실관계 정정**~~ — **세션 31 ADR-019 + ADR-006 보완**
- ~~**JWKS grace**~~ — **세션 31 Auth Advanced Blueprint §7.2.1 반영 + 세션 33 코드화**
- ~~**PG partial index + NOW()**~~ — **세션 31 DQ-AC-2 Resolved + Blueprint §7.2.2 + 세션 32 인덱스 적용**
- **N-API prebuilt** — argon2/isolated-vm/better-sqlite3 모두 3~5초 설치. CK `2026-04-19-napi-prebuilt-native-modules.md` 참조
- **SP-013/016 실측 대기** — `_SPIKE_CLEARANCE.md`에 Pending 엔트리

### 기존 (세션 29까지)
- **kdywave 완주**: Phase 0-4 전체. 123 문서 / 106,588줄
- **Wave 5 이중 관점 문서화**: 05-roadmap/ 4 파일 쌍(28-1 + 28-2) 병합 금지
- **DQ-12.3 MASTER_KEY**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`
- **Compound Knowledge 누적 12건** (외부 7 + 세션 30→31 5건)
- **raw SQL UPDATE auto-bump**: `src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH
- **CSRF 경로 구분**: `/api/v1/*`만 CSRF 면제. `/api/auth/*`는 Referer/Origin 필수
- **WSL auto-shutdown + /tmp 휘발**: E2E 스크립트는 단일 호출 내부로 통합 필수
- **`DATABASE_URL?schema=public` 비호환**: psql 직접 호출 시 `sed 's/?schema=public//'` 전처리
- **Cloudflare Tunnel 간헐 530**: "100% 보증 아님, 확률적 매우 높음"
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용
- **information_schema 롤 필터링**: introspection은 `pg_catalog` 사용
- **Windows `next build` 불가**: WSL2 빌드가 진실 소스 (`/ypserver --skip-win-build`)
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임

## 사용자 기록 (메모리)

- [자율 실행 우선](../../../../Users/smart/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_autonomy.md) — 분기 질문 금지, 권장안 즉시 채택 (파괴적 행동만 예외)

---
[← handover/_index.md](./_index.md)
