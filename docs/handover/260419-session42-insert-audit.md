# 인수인계서 — 세션 42 (Prisma INSERT timestamptz 시프트 검증 + 선제적 방어)

> 작성일: 2026-04-19
> 이전 세션: [session41](./260419-session41-orm-date-audit.md)
> 저널: [logs/journal-2026-04-19.md](../logs/journal-2026-04-19.md) (세션 42 섹션)

---

## 작업 요약

세션 41 CK 잔존 과제 §1 (`prisma-orm-tz-naive-filter-gotcha` 의 "INSERT-side binding 시프트" 가설) 을 실측으로 검증. 프로덕션 로그인 → PG 직접 SELECT 로 **DB 저장 TTL = 604800 sec 정확** 확인 → **INSERT 시프트 없음** 확정, §1 해소. 부수적으로 (A) `create().select({expiresAt})` read-back parsing-side 시프트 재확인 → `issueSession` / `rotateSession` 에서 read-back 제거 + JS-side expiresAt 반환 (선제적 방어, caller 영향 0) / (B) Set-Cookie `Expires` +9h cosmetic 시프트 발견 — RFC 6265 §5.2.2 에 따라 Max-Age 우선이라 실 동작 영향 0, §3 신규로 후속 조사 이월. tsc 0 · vitest 244 PASS (회귀 0) · /ypserver 재배포 · E2E 재검증 새 세션 TTL 604800 정확. CK 1건 갱신 (누적 32 유지).

## 대화 다이제스트

### 토픽 1: 다음 세션 권장 작업 선택
> **사용자**: "다음 세션 권장 작업 수행...."

세션 41 의 "추천 다음 작업" 7건 재정렬:
1. prisma INSERT timestamptz 시프트 검증 (1h) — CK 잔존 과제 §1
2. KST 03:00 자동 cleanup tick 관찰 (익일)
3. MFA biometric 브라우저 수동 QA
4. HS256 legacy 제거
5. Phase 16 진입
6. SP-013/016 물리 측정
7. `/kdygenesis --from-wave`

즉시 착수 가능 + 1h 이내 + 비환경·비생체 + CK 직접 인계 기준으로 **#1 선택**. 메모리 `feedback_autonomy.md` (자율 실행 우선) 에 따라 분기 질문 없이 진행.

**결론**: #1 진입.

### 토픽 2: 검증 절차 설계
세션 41 CK (`orm-date-filter-audit-sweep.md`) 의 잔존 과제 섹션에서 명시된 검증 방법:
1. 실사용 로그인 (curl POST `/api/v1/auth/login`)
2. PG 직접 SELECT — `expires_at - created_at` 의 초 단위 차이
3. 기대값 604800 sec (7d, `REFRESH_TOKEN_MAX_AGE_MS`) 와 대조
4. ±32400 (9h) 범위면 시프트 확인

WSL `/tmp/session42-insert-audit.sh` 작성: login → Set-Cookie 분석 → `psql -c "SELECT ... EXTRACT(EPOCH FROM (expires_at - created_at)) AS ttl_seconds FROM sessions ORDER BY created_at DESC LIMIT 3"` → webauthn_challenges 동일 패턴 검증.

**결론**: 스크립트 준비 완료.

### 토픽 3: E2E 실측 결과

```
created_at_utc      | 2026-04-18 21:52:27.678
expires_at_utc      | 2026-04-25 21:52:27.674
expires_at_text     | 2026-04-26 06:52:27.674+09
ttl_seconds         | 604800   ← 기대값 정확 일치
```

- **DB `ttl_seconds = 604800` 정확** → INSERT binding-side 시프트 **없음**.
- `expires_at_text` 의 `+09` offset 은 PG 서버 timezone 이 `Asia/Seoul` 이라 timestamptz 출력이 로컬 offset 으로 나올 뿐, 내부 UTC 는 정확.

**결론**: 가설 기각. CK 잔존 과제 §1 해소.

### 토픽 4: 부수 발견 (A) — create().select read-back parsing-side 시프트

Set-Cookie 응답 `v1_refresh_token=...; Path=/api/v1/; Expires=Sun, 26 Apr 2026 06:52:27 GMT; Max-Age=604800; ...` 관측. `Expires` 를 UTC 로 파싱하면 DB `expires_at_utc` 대비 +9h 시프트.

하지만 이 시프트는 쿠키 설정 코드의 `maxAge` 에서 오는 것이 아니다 (login-finalizer.ts:85-91 에서 `session.expiresAt` 을 쿠키 옵션에 전달하지 않음, `maxAge: REFRESH_TOKEN_MAX_AGE_SEC` 만 사용).

하지만 별개로 `tokens.ts:55` 의 `select: { id: true, expiresAt: true }` 로 read-back 된 `session.expiresAt` Date 는 Prisma 7 adapter-pg parsing 경계에서 +9h 시프트. 이 값이 `IssuedSession.expiresAt` 으로 반환됨. 현재 caller 는 이 값을 쿠키에 쓰지 않아 영향 0 이지만, **향후 caller 가 로그·응답 payload·대시보드에 사용하면 혼란 발생** 가능.

**선제적 방어 수정** (시맨틱 동일, caller 영향 0):

```ts
// Before
const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
const session = await prisma.session.create({
  data: { ..., expiresAt },
  select: { id: true, expiresAt: true },
});
return { token, sessionId: session.id, expiresAt: session.expiresAt };

// After
const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
const session = await prisma.session.create({
  data: { ..., expiresAt },
  select: { id: true },
});
return { token, sessionId: session.id, expiresAt };
```

`rotateSession` 에도 동일 수정.

**결론**: 선제적 방어 채택. DB 스키마/마이그레이션 변경 없음.

### 토픽 5: 부수 발견 (B) — Set-Cookie Expires 헤더 +9h cosmetic 시프트

쿠키 설정에 `maxAge` 만 지정했는데도 Set-Cookie 헤더에 `Expires=` 가 포함됨 → Next.js 16 `response.cookies.set()` 내부 빌더가 `maxAge` 로부터 `Expires` 계산. 계산된 Expires 가 실제 UTC 대비 +9h.

RFC 6265 §5.2.2:
> If a cookie attribute with an attribute name "Max-Age" is recognized, the user agent MUST use the information in that attribute, overriding any information in the "Expires" attribute.

따라서 브라우저는 `Max-Age=604800` 을 우선 적용 → 실제 쿠키 만료 정확. `Expires` 헤더만 cosmetic.

원인 추정: Next.js 16 의 cookies 빌더가 Expires 계산 시 `new Date(Date.now() + maxAge*1000).toUTCString()` 대신 local wall-clock 을 사용. 우리 코드 범위 밖.

**결론**: 실 동작 영향 0. CK §3 신규로 후속 조사 이월.

### 토픽 6: 검증 + 배포 + 재확인

- `npx tsc --noEmit` — 0 에러
- `npx vitest run` — 13 files / 244 PASS (세션 41 과 동일, 회귀 0)
- `rsync /mnt/e/.../src/ ~/dashboard/src/` + `npm run build` + `pm2 restart dashboard --update-env` (↺=12)
- E2E 재실행: 새 session `d1bdcc85-2143-4a91-bdb9-c5924c838e5b` TTL=604800 정확

**결론**: 회귀 0, 선제적 방어 반영.

### 토픽 7: CK 갱신 + /cs 자동 마감

`prisma-orm-tz-naive-filter-gotcha.md` 에 "세션 42 추가 검증" 섹션 추가:
- 검증 절차 (curl + psql)
- 결과 (TTL 604800 정확)
- 부수 발견 (A) + (B)
- 잔존 과제 재정렬 (§1 해소 / §2 유지 / §3 신규)

`/cs` 스킬로 current/logs/handover/next-dev-prompt/journal 일괄 갱신 + 커밋 + 푸시.

**결론**: 세션 42 완결.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|---|---|---|
| 1 | 세션 41 권장 7건 중 #1 선택 | #1 INSERT 검증 / #2 KST tick / #3 MFA QA / #4 HS256 / #5 Phase 16 / #6 SP 측정 / #7 genesis | 1h 스코프 + 비환경/비생체 + CK 잔존 과제 직접 인계 |
| 2 | 가설 검증 결과 → 시프트 없음 | ORM INSERT 일괄 전환 / 검증 결과 수용 | DB TTL 604800 정확 → 가설 기각. 불필요한 리팩토링 회피 |
| 3 | 선제적 방어 채택 | 수정 없음 / read-back 제거 | 시맨틱 동일 + caller 영향 0 + 향후 오용 차단. 한 줄 수정으로 함정 제거 |
| 4 | Set-Cookie Expires 시프트 후속 이월 | 즉시 조사 / §3 신규 이월 | 실 동작 영향 0 (RFC 6265 Max-Age 우선) + Next.js 내부 이슈로 추정. 본 세션 스코프 외 |

## 수정 파일 (2개)

| # | 파일 | 변경 |
|---|---|---|
| 1 | `src/lib/sessions/tokens.ts` | `issueSession` / `rotateSession` 의 `select: {id, expiresAt}` → `{id}` + 반환 `expiresAt` 을 JS-side 원본으로 고정 (주석으로 이유 명시) |
| 2 | `docs/solutions/2026-04-19-prisma-orm-tz-naive-filter-gotcha.md` | "세션 42 추가 검증" 섹션 추가 — §1 해소 + 부수 발견 (A)(B) + 잔존 과제 재정렬 |

## 상세 변경 사항

### 1. `src/lib/sessions/tokens.ts` — issueSession / rotateSession read-back 제거

```ts
// issueSession (line 43-60) — 기존 session.expiresAt 전파 → JS-side expiresAt
export async function issueSession(params: IssueSessionParams): Promise<IssuedSession> {
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  // 세션 42: JS-side 에서 만든 expiresAt (Date.now() + 7d UTC ms) 을 그대로 반환.
  // create().select 로 다시 읽으면 Prisma 7 adapter-pg parsing-side TZ 시프트(+9h KST)
  // 때문에 호출자가 쿠키 Expires / 로그 / 응답 payload 에 써서 혼란 발생. DB 는 정상.
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);
  const session = await prisma.session.create({
    data: { userId, tokenHash, ip, userAgent, expiresAt },
    select: { id: true },
  });
  return { token, sessionId: session.id, expiresAt };
}

// rotateSession (tx.session.create 부분) 동일 수정
```

타입 시그니처 (IssuedSession) 불변. caller 영향 0.

### 2. CK 갱신 — 잔존 과제 재정렬

기존 "영향 범위" 섹션 하단에 새 섹션 추가:
- **§1 INSERT-side binding 시프트**: ✅ **세션 42 해소** — 시프트 없음, 선제적 방어 반영
- **§2 기타 API route Date 직렬화**: 유지 (세션 41 미해결)
- **§3 (신규)** Next.js 16 `cookies.set({ maxAge })` Set-Cookie Expires 헤더 +9h 시프트 — cosmetic

## 검증 결과

- `npx tsc --noEmit` — 0 에러
- `npx vitest run` — 13 files / **244 tests PASS** (세션 41 대비 회귀 0)
- WSL 재배포 + PM2 restart ↺=12
- E2E 재검증:
  - 새 session `d1bdcc85-2143-4a91-bdb9-c5924c838e5b`
  - created_at_utc 2026-04-18 21:56:17.82 / expires_at_utc 2026-04-25 21:56:17.817
  - ttl_seconds = 604800 (기대 일치)

## 터치하지 않은 영역

- **§2 기타 API route Date 직렬화 전수 리뷰** — audit_logs / cron / webhooks / filebox 등 ORM-read Date `.toISOString()` 사용처 미커버. 개별 리뷰 필요.
- **§3 Next.js 16 Set-Cookie Expires 헤더 +9h 근본 조사** — Next.js 내부 cookies 빌더 소스 추적 필요. 실 동작 영향 0 이므로 후순위.
- **HS256 legacy 쿠키 제거** — 단독 세션 권장 (세션 33 이후 24h+ 경과, AUTH_SECRET 제거 리스크 평가 필요).
- **MFA biometric 브라우저 QA** — Touch ID/Windows Hello 사용자 인터랙션 필수.
- **KST 03:00 자동 cleanup tick 관찰** — 익일 KST 03:00 이후 audit_logs `CLEANUP_EXECUTED` 엔트리 확인.

## 알려진 이슈

- **Set-Cookie `Expires` 헤더 +9h 시프트** — 신규 §3. RFC 6265 Max-Age 우선이라 브라우저 실제 만료 정확, 실 동작 영향 0. Next.js 16 내부 이슈 추정.
- 세션 41 미해결 유지 — Phase 16 (Vault/Capistrano/Canary/Infrastructure) 미착수.

## 다음 작업 제안

세션 41 권장 재정렬 (#1 완료):

1. **KST 03:00 자동 cleanup tick 관찰** (즉시, 익일 KST 03:00 이후) — PM2 uptime 24h+ 확보 후 `audit_logs WHERE action='CLEANUP_EXECUTED'` 자동 1건 확인.
2. **MFA biometric 브라우저 수동 QA** (1.5h) — `docs/guides/mfa-browser-manual-qa.md` 8 시나리오 + Phase 15-D 활성 세션 카드 3 시나리오.
3. **기타 API route Date 직렬화 전수 리뷰** (1-2h, CK §2) — audit_logs/cron/webhooks/filebox 등에서 ORM-read Date 를 응답에 쓰는 경로 스캔 + 필요 시 `::text` 패턴 적용.
4. **HS256 legacy 쿠키 제거** (단독 세션 권장) — 기존 쿠키 무효화 리스크로 잠금.
5. **Phase 16 진입** (Vault VaultService AES-256-GCM envelope 8h + Capistrano 8h + Canary 4h + deploy_events UI 4h = 24h) — Wave 충실이행도 C+ → B 승격.
6. **SP-013 (wal2json) + SP-016 (SeaweedFS 50GB) 물리 측정** (13h) — Phase 17/19 진입 직전 재개.
7. **`/kdygenesis --from-wave`** — Wave 5 appendix `03-genesis-handoff.md` 의 85+ 태스크 자동 변환.

---
[← handover/_index.md](./_index.md)
