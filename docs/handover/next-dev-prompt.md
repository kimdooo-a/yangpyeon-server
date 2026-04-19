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

## 필수 참조 파일 ⭐ 세션 44 종료 시점 — 0-row 테이블 17 파일 Date 직렬화 선제 일괄 수정 + 공용 헬퍼 도입

```
CLAUDE.md
docs/status/current.md
docs/handover/260419-session44-zero-row-tables-date-fix.md        ⭐ 최신 (12 API 헬퍼 적용 + 5 미수정 판별 + E2E 5건 diff_ms=0)
docs/handover/260419-session43-users-date-fix.md                  (users 4 API 파일 7 핸들러 패턴 B/C 수정 + §3 기각)
docs/handover/260419-session42-insert-audit.md                    (INSERT 시프트 검증 + 선제적 방어 + §3 신규)
docs/handover/260419-session41-orm-date-audit.md                  (ORM Date 비교 전수 감사 + 3 전환 패턴 A/B/C + Wave 충실이행도 평가)
docs/handover/260419-session40-timestamptz-migration.md           (TIMESTAMPTZ 마이그레이션 + cleanup 정공법 + binding-side 시프트 잔존 발견)
docs/handover/260419-session39-session-expire-admin-revoke.md     (SESSION_EXPIRE per-row audit + 관리자 forced revoke + PG TZ 버그 국소 회피)
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
docs/solutions/2026-04-19-*.md (20건)                             ⭐ Compound Knowledge 세션 33·34·35·36·37·38·39·40·41 (누적 32건)
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
  - prisma-orm-tz-naive-filter-gotcha.md                         ⭐ 세션 39 bug-fix + 세션 40 정정 (TIMESTAMPTZ 마이그레이션 후에도 binding-side 9h 시프트 잔존, 정공법 = raw SELECT + ::text)
  - per-row-audit-on-batch-delete.md                             ⭐ 세션 39 pattern (DB ops 는 entries 반환, audit 정책은 호출자 scheduler 에서 → 집계 + per-row 병행)
  - timestamp-to-timestamptz-migration-using-clause.md           ⭐ 세션 40 pattern (USING AT TIME ZONE '<server_tz>' 결정 + dry-run BEGIN/ROLLBACK + 한계 명시)
  - orm-date-filter-audit-sweep.md                               ⭐ 세션 41 pattern (4파일 8곳 raw SQL 전환, A/B/C 전환 패턴 가이드 + 재발 방지 체크리스트 + 잔존 과제 2종 인계)
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

## 현재 상태 (세션 44 종료 시점)

### 완료된 Phase
- Phase 1~14c-γ 전부 완료
- **kdywave Wave 1-5 완주**: 123 문서 / 106,588줄
- **세션 30**: 우선 스파이크 7건 완결 (5 실측 + 2 축약)
- **세션 31**: safeguard + ADR/DQ 반영 + CK 5건 (타 터미널)
- **세션 32**: Phase 15 Step 1-2 — Prisma Session + argon2id 자동 재해시
- **세션 33**: Phase 15 Step 3·4·5·6 서버측 일괄 완결 (commit `58a517b`)
- **세션 34**: Phase 15 UI 통합 + 라이브 디버깅 2건 (commit `9a6b4ff`)
- **세션 35**: Cleanup Scheduler + CK 4건 + MFA QA 가이드 (commit `a29ac1b`)
- **세션 44** ⭐ — 0-row 테이블 17 파일 Date 직렬화 선제 일괄 수정 + 공용 헬퍼 도입
  - **P3** (잔존 `::uuid` grep): 0건 즉시 종결 (세션 43 5곳 제거 후 추가 도입 없음)
  - **P2** (0-row 17 파일 선제): 공용 헬퍼 `src/lib/date-fields.ts` 신규 (ALLOWED_TABLES Set + COLUMN_RE 정규식 두 겹 화이트리스트 + `fetchDateFieldsText` + `toIsoOrNull`) + 단위 테스트 10건. 12 API 라우트 수정(cron×2/webhooks×2/api-keys×2/log-drains×2/functions×3/mfa-status). 수정 불필요 5 파일 판별(write-only 응답에 Date 없음). functions/route.ts nested runs 처리 (fnDateMap+runDateMap), mfa/status enrollment.id select 추가
  - **P1** (KST 03:00 자동 tick): baseline 스냅샷 — 0 entries (uptime 67분, 정상). 익일 발동 예정
  - 신규 E2E `scripts/session44-verify.sh` (지속 자산) — 5건 diff_ms=0 (webhook POST/GET-single/GET-list, cron POST, log-drain POST)
  - 검증: tsc 0 / vitest 244 → **254 PASS** (+10 헬퍼, 회귀 0) / `/ypserver prod --skip-win-build` (PM2 ↺=15, Tunnel 9h online)
  - CK 갱신 1건 (32 유지): `orm-date-filter-audit-sweep.md` 잔존 과제 §2 해소 + 세션 44 추가 섹션
- **세션 43** — 세션 42 이월 3건 순차 처리 (P1 관찰 + P2 users 4 파일 확산 + P3 기각)
  - **P1** (KST 03:00 자동 cleanup tick): PM2 uptime 111분(↺=12 직후)로 자동 tick 미발동, 현 상태 관찰만 + 다음 세션(uptime 24h+) 이월
  - **P2** (세션 41 CK §2 기타 API route Date 직렬화): `scripts/session43-parsing-repro.ts` 로 Prisma 7 adapter-pg parsing-side +9h 시프트 실측 재현 성공 (diff=32,400,147ms 정확). DB 인벤토리상 users 만 데이터 있음 → users 4 API 파일 7 핸들러 수정 (패턴 B/C 확장)
  - **P3** (세션 42 CK §3 Next.js Set-Cookie Expires +9h): `@edge-runtime/cookies/index.js` 소스 추적 + 실측 완료 — 9h 시프트 **재현 불가**, 가설 기각
  - 파생 버그: `::uuid` 캐스트 오남용 (users.id 는 PG `text`) → 500 발생 → 5곳 수정
  - 검증: tsc 0 / vitest 13 files 244 PASS (회귀 0, 2회) / /ypserver prod 2차 재배포 (PM2 ↺=13→14) / E2E 응답 `createdAt="2026-04-06T14:11:17.147Z"` === PG UTC 완벽 일치
  - CK 갱신 2건 (누적 32 유지): orm-date-filter-audit-sweep.md (§2 진전) + prisma-orm-tz-naive-filter-gotcha.md (§3 기각)
  - 신규 스크립트 2건 (지속 가치): session43-parsing-repro.ts + session43-verify.sh
- **세션 42** — Prisma INSERT timestamptz 시프트 검증 완결 (CK 잔존 과제 §1 해소) + 선제적 방어
  - 세션 41 CK 잔존 과제 §1 (`prisma-orm-tz-naive-filter-gotcha` 의 "INSERT-side binding 시프트" 가설) 실측 검증
  - `curl POST /api/v1/auth/login` + `psql EXTRACT(EPOCH FROM expires_at - created_at)` → **DB TTL = 604800 sec 정확** → **시프트 없음** 확정, §1 해소
  - 부수 발견 (A): `prisma.session.create({select:{expiresAt}})` read-back 은 여전히 parsing-side +9h 시프트 → `issueSession`/`rotateSession` 에서 read-back 제거 + JS-side expiresAt 반환 (선제적 방어, caller 영향 0)
  - 부수 발견 (B): Set-Cookie `Expires=... GMT` 가 `Max-Age=604800` 로부터 계산될 때 +9h 시프트 — RFC 6265 §5.2.2 Max-Age 우선이라 cosmetic, 실 동작 영향 0. §3 신규 과제로 이월
  - 검증: tsc 0 / vitest 244 PASS (회귀 0) / `/ypserver prod` rsync+build+PM2 ↺=12 / E2E 재검증 새 세션 TTL 604800 정확
  - CK +1 갱신 (32 유지): `prisma-orm-tz-naive-filter-gotcha.md` 에 "세션 42 추가 검증" 섹션 추가 (§1 해소 + §3 신규)
- **세션 41** — Wave 충실이행도 87/100 평가 + ORM Date 비교 전수 감사 (4파일 8곳 raw SQL 전환)
  - Wave 1~5 (123 문서 / 106,588줄) 6차원 충실도 평가 — 기술 채택 98 / 스키마 95 / MVP 72 / ADR 95 / 스파이크 80 / 지식보존 100 — "설계-구현 정합성 A, 진도 C+"
  - 세션 40 권장 7건 중 #1 (ORM 시간 비교 전수 검토) 선택 · 1-2h 스코프 · 즉시 착수
  - 프로젝트 `src/` 정규식 2종 전수 스캔: `{lt|gt: (new Date|now)}` (ORM WHERE, 4건) + `row.\w+(At|Until) < new Date()` (JS-side, 4건) = **8곳 취약 패턴**
  - **3 가지 전환 패턴 A/B/C** 설계·적용: A=cleanup (SELECT id + ORM deleteMany), B=목록+display (전체 raw SELECT with `::text`), C=ORM join 유지 (보조 boolean 쿼리)
  - 수정 4 파일: `jwks/store.ts` (3 함수) / `mfa/webauthn.ts` (2) / `mfa/service.ts` (1 + `locked_until::text` 응답 복원) / `sessions/tokens.ts` (2)
  - tsc 0 / vitest **244 PASS** (세션 40 대비 회귀 0) / 재스캔 양패턴 0 match
  - **CK +1 신규** (31 → **32**): `orm-date-filter-audit-sweep.md` (pattern/high, 패턴 A/B/C + 체크리스트 + 잔존 과제 2종 — INSERT-side 시프트 / 기타 API route Date 직렬화)
  - 커밋 `90ad952` 푸시 완료 (`25e908d → 90ad952`)
- **세션 40** — TIMESTAMPTZ 마이그레이션 완결 (17 모델 / 47 DateTime 컬럼) + cleanup 정공법 정착
  - 6 권장 중 2·3b·5 자율 채택, HS256(잠금)·MFA biometric·SP-013/016 측정·kdygenesis 제외
  - schema.prisma 모든 DateTime 에 `@db.Timestamptz(3)` + migration `20260419180000_use_timestamptz` (17 ALTER TABLE, USING AT TIME ZONE 'Asia/Seoul')
  - pg_dump 5.3MB 백업 + BEGIN/ROLLBACK dry-run 17 ALTER OK + migrate deploy 적용
  - **cleanup.ts ORM 복원 1차 시도 → 실패** (Prisma 7 adapter-pg binding-side 9h 시프트가 timestamptz 컬럼에서도 별도 존재함이 E2E 재현으로 발견)
  - **정공법**: raw SELECT (PG NOW()-INTERVAL '1 day' 위임) + `expires_at::text` 캐스팅 + ORM `deleteMany({where:{id:{in:ids}}})` 하이브리드
  - cleanup.test.ts 10 PASS / vitest 245 → **244 PASS** / tsc 0 / `/ypserver prod --skip-win-build` 2회 통과 (PM2 ↺=10, 11)
  - E2E 12 step 전수 PASS — `summary.sessions=2` 정확, SESSION_EXPIRE per-row audit 정확 기록
  - **CK +1 신규 1건 갱신** (30→31): `timestamp-to-timestamptz-migration-using-clause` 신규 + `prisma-orm-tz-naive-filter-gotcha` 정정 섹션 추가
- **세션 39** — Phase 15-D 보강 2건 완결 + PG TZ 버그 국소 회피 (SESSION_EXPIRE per-row audit + 관리자 forced revoke)
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

~~우선순위 1: 다른 모듈 ORM 시간 비교 전수 검토~~ ✅ **세션 41 완결** (4파일 8곳 raw SQL 전환, 3 전환 패턴 A/B/C 정립, CK `orm-date-filter-audit-sweep.md` 신규)
~~우선순위 (A) INSERT-side binding 시프트 검증~~ ✅ **세션 42 완결** — DB TTL 604800 정확, 가설 기각, §1 해소. 부수적으로 `issueSession`/`rotateSession` 선제적 방어 적용 (read-back 제거).
~~우선순위 (B) 기타 API route Date 직렬화 (users 테이블)~~ ✅ **세션 43 완결** — users 4 파일 7 핸들러 수정, parsing-side +9h 재현 실측 확증.
~~우선순위 (C) Next.js 16 Set-Cookie Expires +9h 근본 조사~~ ❌ **세션 43 기각** — 재현 불가, `@edge-runtime/cookies` 소스 UTC 기준 정확.

### 우선순위 1: KST 03:00 자동 cleanup tick 관찰 (익일 이후)

세션 35 cleanup-scheduler 의 자동 실행을 프로덕션 실측 확인:
```bash
wsl -e bash -c "source ~/.nvm/nvm.sh && pm2 logs dashboard --lines 200 | grep -i cleanup"
# audit_logs WHERE action='CLEANUP_EXECUTED' (자동) vs 'CLEANUP_EXECUTED_MANUAL' (UI)
```
PM2 restart 누적 ↺=15 (세션 44 재배포 1회) — uptime 24h+ 확보 위해 당분간 재배포 없이 대기 필요. 세션 44 baseline = 0 entries 정상.

~~우선순위 2: 0-row 테이블 17 파일 Date 직렬화 선제적 일괄 수정~~ ✅ **세션 44 완결** — 12 API 헬퍼 적용 + 5 미수정 판별 + E2E 5건 diff_ms=0. 헬퍼 `src/lib/date-fields.ts` 도입.

~~우선순위 3: 잔존 `::uuid` 캐스트 grep~~ ✅ **세션 44 완결** — 0건 (세션 43 5곳 제거 후 추가 도입 없음).

### 우선순위 2: MFA UI + Phase 15-D 활성 세션 카드 브라우저 직접 실행 (1-2h)

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

### 우선순위 5: Phase 15-D 추가 보강 — HS256 legacy 제거 (~1.5h, 단독 세션 권장)

세션 36·37·38·39 로 핵심 경로 + revoke-all + intent 태깅 + touch throttle + activity fingerprint + **SESSION_EXPIRE audit + 관리자 forced revoke** 완결. 남은 1건:
- **HS256 legacy 쿠키 제거** ⭐ 단독 세션 — 세션 33 JWKS ES256 전환 후 24h 만료 초과. `AUTH_SECRET` 제거 + `src/lib/auth.ts` HS256 fallback 코드 정리. 기존 쿠키 무효화 리스크 존재 → 작업 직전 활성 사용자 세션 전수 확인 필요.

~~touch throttle~~ ✓ 세션 38 완결
~~activity fingerprint~~ ✓ 세션 38 완결
~~SESSION_EXPIRE audit~~ ✓ 세션 39 완결
~~관리자 forced revoke~~ ✓ 세션 39 완결

~~우선순위 3b: PG TIMESTAMPTZ 컬럼 마이그레이션~~ ✅ **세션 40 완결** (17 모델 / 47 컬럼).
~~다른 모듈 ORM 시간 비교 전수 검토~~ ✅ **세션 41 완결** (4파일 8곳 raw SQL 전환, 3 전환 패턴 A/B/C).

### 우선순위 +: Phase 16 진입 고려 (24h, Wave 충실이행도 개선)

세션 41 Wave 충실이행도 평가에서 "설계 충실도 A, 진도 C+" 진단. Phase 15-D 보강 마무리 후 Phase 16 진입으로 진도 승격 가능:
- Vault VaultService AES-256-GCM envelope (8h)
- Capistrano-style 배포 자동화 (8h)
- Canary stylelucky4u.com 시간차 배포 (4h)
- Infrastructure 페이지 (PM2 / PG / 디스크 실시간) + deploy_events UI (4h)

### 우선순위 6: SP-013/016 물리 측정 (13h, 환경 확보 시)
- **SP-013 wal2json** (5h): PG + wal2json 설치 + 30분 DML + 슬롯 손상 recovery
- **SP-016 SeaweedFS 50GB** (8h): weed 설치 + 50GB 디스크 + B2 오프로드

### 우선순위 7: `/kdygenesis --from-wave` 연계
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

### 세션 44 신규

- **`src/lib/date-fields.ts` 헬퍼는 ALLOWED_TABLES 갱신 필수** — 새 테이블 라우트 추가 시 Set 에 테이블명 추가 안 하면 `테이블 화이트리스트 위반` throw 로 즉시 발견. 누락 위험 낮음.
- **`COLUMN_RE = /^[a-z][a-z0-9_]*$/`** — PG snake_case 강제. camelCase (e.g. `createdAt`) 전달 시 throw. 헬퍼 호출부에서는 항상 SQL 컬럼명 그대로 사용.
- **functions/route.ts nested runs select 에 `id: true` 추가** — runDateMap 헬퍼 호출 위해. 향후 select 변경 시 id 유지 주의.
- **mfa/status enrollment.id select 추가** — findUnique({where:{userId}}) 가 id 미선택 → 헬퍼 호출 위해 select 에 추가. 응답 shape 영향 없음.
- **수정 불필요 5 파일 (write-only)** — cron/[id]/run / webhooks/[id]/trigger / log-drains/[id]/test / functions/[id]/run / mfa/webauthn/authenticators/[id] DELETE — Prisma update 후 응답에 Date 미포함이라 시프트 영향 없음. 향후 응답 형태 변경 시 헬퍼 적용 필요.
- **회귀 가드 자산 3종 누적**: `scripts/session43-parsing-repro.ts` (시프트 재현) + `scripts/session43-verify.sh` (users) + `scripts/session44-verify.sh` (webhooks/cron/log-drains). 향후 Prisma 패치 / adapter 교체 / 새 테이블 추가 시 30초 실행으로 회귀 즉시 탐지.

### 세션 43 신규

- **`users.id` 컬럼 타입은 PG `text`** (Prisma `String @id` 기본 매핑, uuid 포맷 저장하지만 컬럼 타입 자체는 text). 신규 raw SQL 작성 시 `::uuid` 캐스트 금지 (text = uuid operator 오류). 다른 테이블 id 도 대개 text. `information_schema.columns` 로 사전 확인 필수.
- ~~**0-row 테이블 17 파일의 Date 직렬화 경로는 잠재 위험**~~ ✅ **세션 44 완결** — 12 파일 헬퍼 적용 (5 파일은 write-only 응답 미포함). 데이터 유입 시 자동 차단.
- **`scripts/session43-parsing-repro.ts` + `session43-verify.sh` 는 지속 자산** — 향후 다른 테이블 재검증 시 30초 실행으로 시프트 상태 확인 가능.
- ~~**Next.js 16 Set-Cookie Expires +9h cosmetic 시프트**~~ ❌ **세션 43 기각** — 재현 불가, `@edge-runtime/cookies` 소스는 UTC 기준 정확. 세션 42 관측값은 원인 불명 일시 현상.

### 세션 42 신규

- ~~**Prisma `session.create({ select: { expiresAt: true } })` read-back 은 여전히 parsing-side +9h 시프트**~~ — 구조적 문제는 유효하지만 세션 42 에서 issueSession/rotateSession 선제적 방어, 세션 43 에서 users 4 파일 패턴 B 확산. **실측 기준**: parsing-side 시프트는 여전히 모든 ORM-read Date 에 존재하며, `.toISOString()` 또는 `getTime()` 사용 시 +9h 오차.
- **Prisma `session.create({ select: { expiresAt: true } })` read-back 은 여전히 parsing-side +9h 시프트** — INSERT 자체(DB 저장값)는 정확(TTL 604800) 이지만, create 결과의 `session.expiresAt` Date 는 adapter-pg parsing 경계에서 +9h. 세션 42 에서 `issueSession`/`rotateSession` 은 JS-side 원본 반환으로 선제적 방어 적용. 다른 `prisma.<model>.create({select: {someAt}})` 경로도 동일 함정 가능.
- **Next.js 16 `response.cookies.set({ maxAge })` Set-Cookie `Expires` 헤더 +9h cosmetic 시프트** — RFC 6265 §5.2.2 에 따라 Max-Age 우선이라 브라우저 실제 만료는 정확. 외부 observability 도구가 Expires 를 파싱하면 혼란 가능. Next.js 내부 cookies 빌더가 maxAge 로부터 Expires 계산 시 local wall-clock 사용 추정. 근본 조사는 CK §3 신규 과제.
- ~~**prisma INSERT 시도 시프트하는지 검증 미완**~~ ✅ **세션 42 해소** — DB TTL 604800 정확, 시프트 없음.

### 세션 40 신규

- **Prisma 7 adapter-pg 의 timestamptz 컬럼 binding-side TZ 시프트** — TIMESTAMPTZ 마이그레이션 적용 후에도 ORM `findMany({where:{ts:{lt: jsDate}}})` 가 9h 시프트로 0 rows 반환. 컬럼 측 변경만으로 해소 안 됨. 정공법 = raw SELECT (PG NOW()-INTERVAL 위임 + `::text` 캐스팅) + ORM CRUD (id 기반). cleanup.ts 적용 완료, **다른 모듈 전수 검토 필요** (우선순위 1).
- **prisma INSERT 시도 시프트하는지 검증 미완** — 실제 사용자 로그인 시 만들어지는 session row 의 expires_at 정확성 확인 필요. helper 측 raw pg INSERT 는 9h 시프트 확인됨. prisma 측 INSERT 동작은 별도 검증 (우선순위 2).
- **audit_logs.timestamp 단위 sec/ms 불일치** — Drizzle INTEGER 컬럼에 `Math.floor(Date.now()/1000)` (sec) 저장하는데 UI 코드가 ms 가정으로 표시 시 1970년 표기 (`1970-01-21T13:29:30Z` 형태). 본 세션 범위 밖.
- **마이그레이션 USING 절 결정 원칙**: PG 서버 timezone (`SHOW TIMEZONE` = 'Asia/Seoul') 의 wall-clock 의미를 보존하려면 `USING ts AT TIME ZONE 'Asia/Seoul'` 명시. 잘못된 USING 은 데이터 영구 시프트 — CK `2026-04-19-timestamp-to-timestamptz-migration-using-clause.md` 참조.
- **pg_dump 백업 보존**: `/tmp/luckystyle4u-pre-tz-migration-20260419-150722.dump` (5.3MB). 마이그레이션 rollback 필요 시 `pg_restore` 사용.

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
