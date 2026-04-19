# 세션 38 인수인계서 — Phase 15-D 보강 (touch throttle + activity fingerprint)

> 상위: [`handover/_index.md`](./_index.md)
> 일자: 2026-04-19
> 소요: ~1h
> 상태: 완결 (tsc 0 / vitest 231 PASS / 프로덕션 E2E curl 3 시나리오 + Playwright MCP 브라우저 자동화 전부 PASS)

## 세션 목표

`/kdyguide` 자율 실행 위임 — 4-Phase 스코어링 후 Phase 15-D 보강 5개 중 **가장 작고 독립적이며 낮은 리스크인 2개** 를 자동 선택·구현·검증·배포.

선택 근거:
- ❌ HS256 legacy 제거 — 기존 쿠키 무효화 리스크라 단독 세션 + 사용자 확인 권장
- ❌ admin forced revoke — 권한 UI 설계까지 포함 → 중간 규모
- ❌ SESSION_EXPIRE audit — CLEANUP_EXECUTED summary 에 이미 담겨 수요 낮음
- ✅ **touch throttle** — GET /sessions 마다 touch 1회 → 1분 디바운스로 DB 쓰기 감소
- ✅ **activity fingerprint** — UA 파싱해 "Chrome 130 · Windows" 라벨, UI 가독성 개선

## 실행 결과

### 신규 파일 (2건)

**`src/lib/sessions/activity.ts`** — pure function 2개 분리 (DB 접근 / 외부 상태 / 시계 side-effect 전부 제거, `now` 주입):
```typescript
export const TOUCH_THROTTLE_MS = 60_000;

export function shouldTouch(
  lastUsedAt: Date,
  now: Date = new Date(),
  thresholdMs: number = TOUCH_THROTTLE_MS,
): boolean {
  return now.getTime() - lastUsedAt.getTime() >= thresholdMs;
}

export function parseUserAgent(raw: string | null | undefined): string {
  // Chrome/Firefox/Safari/Edge × Windows/macOS/Linux/iOS/Android + curl
  // ua-parser-js (~20KB) 는 과투자 — regex 2 쌍으로 충분
  ...
}
```

**`src/lib/sessions/activity.test.ts`** — 25 테스트 (TDD, 구현보다 먼저 작성):
- shouldTouch: 경계값 (59.999s / 60.001s) / 동시각 / 시계역행 (now < lastUsedAt) / 커스텀 threshold / threshold=0
- parseUserAgent: Windows Chrome / macOS Chrome / iOS Safari / Android Chrome / Linux Firefox / Edge (Edg 우선) / curl (OS 생략) / null / undefined / "" / 파싱 불가 / OS 만 탐지 / 브라우저만 탐지 / macOS Safari

**iOS Safari regex 1회 fail → 수정**: 초기 `Version\/(\d+)[^\s]*\s+Safari` 는 "Version/17.0 Mobile/15E148 Safari/604.1" 패턴에서 중간 `Mobile/...` 토큰이 끼어 실패. 최종: "Safari/ 토큰 존재 + Chrome/Edge 부재 시 Version/N 매치".

### 수정 파일 (3건)

**`src/lib/sessions/tokens.ts`**:
- `SessionLookup.session` 에 `lastUsedAt: Date` 추가 (shouldTouch 판정용)
- `findSessionByToken` select 에 `lastUsedAt` 추가
- `ActiveSessionSummary` 에 `userAgentLabel: string` 필드 추가
- `listActiveSessions` map 에서 `parseUserAgent(r.userAgent)` 호출

**`src/app/api/v1/auth/sessions/route.ts`**:
- 무조건 `touchSessionLastUsed` → `shouldTouch(lookup.session.lastUsedAt)` 분기 후 조건부 호출
- Import `{ shouldTouch } from "@/lib/sessions/activity"`

**`src/app/(protected)/account/security/page.tsx`**:
- `SessionInfo` 인터페이스에 `userAgentLabel: string` 필드
- 활성 세션 카드 UA 표시: `{s.userAgent ?? "..."}` → `{s.userAgentLabel}` + `title={s.userAgent ?? "..."}` 툴팁

## 검증

### 유닛
- `npx tsc --noEmit`: 0 에러
- `npx vitest run`: 206 → **231 PASS** (+25 activity.test.ts, 회귀 0)

### 배포
- `/ypserver prod --skip-win-build`: 통과
- Prisma migrate deploy: "No pending migrations" (세션 37 revoked_reason 이미 적용)
- PM2 restart ↺=4 / online / HTTP 307

### 프로덕션 E2E curl (3 시나리오)

스크립트: `/tmp` 인라인 bash. stylelucky4u.com 대상 실제 API 호출.

```
[시나리오 1] throttle 실증 (3초 간격)
  lastUsedAt[1] = 2026-04-19T01:53:26.159Z
  sleep 3
  lastUsedAt[2] = 2026-04-19T01:53:26.159Z   ← 동일 ✓
  결과: THROTTLE WORKS — 3초 <= 60초 임계치

[시나리오 2] userAgentLabel 변환
  userAgent:      "curl/8.5.0"
  userAgentLabel: "curl 8"                    ← OS 분기 생략 (curl 브랜치) ✓

[시나리오 3] touch 발동 (70초 후)
  sleep 70
  lastUsedAt[3] = 2026-04-19T01:54:42.042Z    ← 갱신 ✓
  결과: TOUCH WORKS — 76초 diff >= 60초 임계치
```

### Playwright MCP 브라우저 자동화 (추가 검증)

- `browser_navigate` → https://stylelucky4u.com/login
- `browser_fill_form` (Email / Password) → `browser_click` 로그인
- 리다이렉트 확인: `/` (대시보드)
- `browser_navigate` → `/account/security`
- `browser_snapshot` accessibility tree 확인:
  - 현재 세션 (118.33.222.67): **"Chrome 147 · Windows"** 라벨 표시 ✓
  - curl 세션 2건 (118.33.222.67, ::1): **"curl 8"** 표시 ✓
  - raw UA `Mozilla/5.0 (Windows NT 10.0; ...)` 가 `title` 속성에 보존 ✓
- `browser_take_screenshot` (fullPage) → `e2e-session38-account-security.png` (gitignored, 로컬 증적)

## 산출물 요약

| 항목 | 변경 |
|------|------|
| 신규 | `src/lib/sessions/activity.ts` / `activity.test.ts` |
| 수정 | `tokens.ts` / `sessions/route.ts` / `account/security/page.tsx` |
| 테스트 | 206 → 231 (+25, 회귀 0) |
| 커밋 | `b454e3c feat(auth): 세션 38 — Phase 15-D 보강 (touch throttle + activity fingerprint)` + `d9e68bf docs: /cs 세션 38 마감` |
| Compound Knowledge | +1 (`2026-04-19-ios-safari-ua-regex-trap.md` — bug-fix/high). **누적 27 → 28건** |

## 알려진 이슈 / 주의사항

- **`ua-parser-js` 의도적 배제** — 본 프로젝트가 식별해야 할 UA 범위는 "주류 브라우저 + curl" 뿐이므로 20KB 번들 비용 회피. 미탐지 UA 는 "기타 브라우저 · 기타 OS" fallback. 봇/크롤러 탐지는 범위 밖.
- **`shouldTouch` threshold 는 route handler 에만 적용** — 다른 경로(jwt rotation 시점 등)에서 touch 하고 싶다면 별도 호출. 현재는 GET /sessions 에서만 디바운스 발동.
- **라벨은 read-only** — DB 에 저장된 값은 여전히 raw `userAgent`. 라벨은 응답 시 변환. UA 파싱 로직 변경 시 저장된 데이터 마이그레이션 불필요.
- **세션 37 revokedReason 인덱스 기반 migrate 이미 적용** — 세션 38 배포 시 `No pending migrations` 확인. 신규 migration 없음.
- **iOS Safari regex 교훈** — "Safari" 토큰이 "Version" 과 공백 하나로 인접하리라 가정한 초기 regex 는 iOS UA `Version/17.0 Mobile/15E148 Safari/604.1` 에서 실패. pattern + exclusion 조건(Chrome/Edge 부재) 이 더 안전.

## 다음 세션 권장 작업

### 우선순위 1 (유지): MFA UI + 활성 세션 카드 biometric 포함 브라우저 수동 QA (1-2h)
세션 37·38 에서 biometric 불필요 항목은 자동 검증 완료. 남은 것:
- TOTP enroll / login / disable — Authenticator 앱 사용자 인터랙션
- Passkey enroll / login / delete — Touch ID / Windows Hello
- Recovery code 사용 + 재사용 거부
- (선택) Rate limit 회귀 가드
가이드: `docs/guides/mfa-browser-manual-qa.md` 8 시나리오.

### 우선순위 2 (유지): KST 03:00 자동 cleanup 관찰 — 익일

### 우선순위 3: Phase 15-D 보강 남은 3 항목 (2-3h)
세션 38 에서 2개 완결. 남은 3:
- **SESSION_EXPIRE audit** — cleanup 시 각 expired row 별 건수 기록 (현 CLEANUP_EXECUTED 는 통합 summary 만)
- **관리자 forced revoke** — `/api/admin/users/[id]/sessions DELETE all` + `revokedReason="admin"`
- **HS256 legacy 제거** — `AUTH_SECRET` 제거 + jwt-v1 HS256 fallback 코드 정리 (세션 37 24h 만료 초과, 안전)

### 우선순위 4: SP-013/016 물리 측정 (13h, 환경 확보 시)

### 우선순위 5: `/kdygenesis --from-wave` 연계

## 타임라인

- 10:47 — 세션 38 시작, `/kdyguide` 호출 → 4-Phase 자율 실행 위임
- 10:50 — Phase 15-D 보강 5개 중 touch throttle + activity fingerprint 2개 선택 (brainstorming 축약, 자율 결정)
- 10:51 — `activity.ts` + `activity.test.ts` 작성 (TDD), 25/25 중 1건 fail (iOS Safari regex) → 수정 → 25/25 PASS
- 10:52 — `tokens.ts` / `sessions/route.ts` / `security/page.tsx` 수정
- 10:52 — tsc 0 / vitest 231 PASS
- 10:53 — `/ypserver prod --skip-win-build` 배포 완료
- 10:54 — 프로덕션 E2E curl 3 시나리오 PASS
- 10:55 — Playwright MCP 브라우저 자동화 → UI 라벨 + title 툴팁 확인 + 스크린샷
- 10:56 — `b454e3c` 커밋
- 10:56 — 마감 문서 작성

## 교차 참조

- 상위 인수인계: [`260419-session37-revoked-reason-intent-fix.md`](./260419-session37-revoked-reason-intent-fix.md)
- 코드 커밋: `b454e3c feat(auth): 세션 38 — Phase 15-D 보강 (touch throttle + activity fingerprint)`
- 다음 세션 프롬프트: [`next-dev-prompt.md`](./next-dev-prompt.md)
- 세션 저널: [`../logs/2026-04.md`](../logs/2026-04.md#세션-38)
- 일일 저널: [`../logs/journal-2026-04-19.md`](../logs/journal-2026-04-19.md)
