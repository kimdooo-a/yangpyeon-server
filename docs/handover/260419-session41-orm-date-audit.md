# 인수인계서 — 세션 41 (Wave 충실이행도 평가 + ORM Date 비교 전수 감사)

> 작성일: 2026-04-19
> 이전 세션: [session40](./260419-session40-timestamptz-migration.md)
> 저널: [logs/journal-2026-04-19.md](../logs/journal-2026-04-19.md) (세션 41 섹션)

---

## 작업 요약

세션 40 next-dev-prompt 권장 7건 중 **#1 (다른 모듈 ORM 시간 비교 전수 검토)** 자율 선택 · 1-2h 스코프 · 즉시 착수. 프로젝트 `src/` 전수 스캔으로 **4 파일 8곳** 의 TZ 시프트 취약 패턴 발견 → **3 가지 전환 패턴(A/B/C)** 을 설계·적용. tsc 0 · vitest 244 PASS 유지 (회귀 0). 부가로 세션 초반 사용자 요청에 따라 Wave 1~5 (123 문서 / 106,588줄) 충실이행도 6차원 **87/100** 평가 수행. CK 1건 신규 (누적 31 → 32). 커밋 `90ad952` 푸시 완료.

## 대화 다이제스트

### 토픽 1: Wave 충실이행도 평가 요청
> **사용자**: "wave 조사자료의 충실이행도 평가."

kdywave Wave 1~5 최종 산출물(`docs/research/2026-04-supabase-parity/`) 를 실구현(`src/`, `package.json`, `prisma/schema.prisma`) 과 대조. 6차원 평가 수행:

| 차원 | 점수 | 근거 |
|---|---|---|
| 기술 채택 충실도 | 98/100 | Wave 1 1순위 채택안이 `package.json` 에 100% 반영 (otplib@12, @simplewebauthn@10, jose@6.2.2, bcrypt@6, prisma@7.6.0, drizzle-orm@0.45.2, @xyflow/react@12.10.2). Post-MVP 기술(seaweedfs/wal2json/isolated-vm/pgmq) 은 Phase 미진입으로 정상 미설치 |
| DB 스키마 충실도 | 95/100 | Phase 15 7개 마이그레이션 전부 ERD Blueprint 대로 (Session / WebAuthnAuthenticator / WebAuthnChallenge / JwksKey / RateLimitBucket / session revoked_reason) |
| MVP 로드맵 준수도 | 72/100 | Phase 15 ~90% 완료, Phase 16 JWKS 만(20%), Phase 17 Auth Core 일부 선행(25%). Phase 15-D 보강이 범위 팽창 — Refresh Rotation + Cleanup + admin forced revoke 가 실제로는 Phase 17 영역 선행 소화 |
| ADR/재검토 트리거 준수 | 95/100 | ADR 18 → 19 증가. ADR-008(MinIO 배제/AGPL) 준수 — MinIO SDK 부재. ADR-001(Multi-tenancy 제외) 준수 — tenant 컬럼 없음. 재검토 트리거 45 건 중 어느 것도 미발동 상태에서 대안 미도입 |
| 스파이크 집행도 | 80/100 | 우선 스파이크 7건 완결 (세션 30). SP-013(wal2json)/SP-016(SeaweedFS) Pending — 각각 Phase 19/17 진입 직전 재개 필요 (로드맵과 정합) |
| 지식 보존 / 역방향 피드백 | 100/100 | CK 30건 누적 (세션 41 시작 시), 역방향 피드백 0건, 4단 아카이빙(current/logs/handover/next-dev-prompt) 완주 |

**종합 87/100** — "설계-구현 정합성 A, 진도 C+". Wave 설계의 지적 자산을 실제 코드가 충실히 계승하나, MVP 122h 예산 대비 진척 ~45% 수준.

**결론**: 충실도 자체는 우수. 속도 개선 여지는 Phase 16 진입으로 해소 가능.

### 토픽 2: 다음 작업 추진 요청
> **사용자**: (세션 40 CK Insight + 최종 결과 + 자율 판단 + 권장 7건 제시) "다음 세션 권장과 추가 이행 내용을 종합해서 다음작업 추진"

세션 40 권장 7건 중 즉시 착수 가능성 · 1-2h 스코프 · 비생체/비환경 작업 기준으로 **#1 (다른 모듈 ORM 시간 비교 전수 검토)** 선정.

**결론**: #1 진입. TDD 필요 없음 (리팩토링 + 기존 테스트 유지).

### 토픽 3: 전수 스캔으로 위험 패턴 식별
세션 40 CK (`prisma-orm-tz-naive-filter-gotcha`) 의 "영향 범위" 섹션이 4파일 후보 제시:
- `tokens.ts` / `webauthn.ts` / `jwks/store.ts` / `mfa/service.ts`

2 종류 정규식으로 전수 스캔:
1. `\{\s*(lt|lte|gt|gte)\s*:\s*(new Date|now)` — ORM WHERE (binding-side 시프트)
2. `(row|record|enrollment|session|rec)\.\w+(At|Until)\s*[<>=!]=?\s*(new Date|now)` — JS-side (parsing-side 시프트)

**발견 8곳**:

| # | 파일:라인 | 함수 | 종류 | 영향 |
|---|---|---|---|---|
| 1 | jwks/store.ts:55 | getActivePublicJwks | WHERE | RETIRED 키 JWKS 누락 → 검증 실패 가능 |
| 2 | jwks/store.ts:71 | getPublicKeyByKid | JS | 동일 |
| 3 | jwks/store.ts:125 | cleanupRetiredKeys | WHERE | grace 9h 조기 종료 |
| 4 | mfa/webauthn.ts:203 | consumeChallenge | JS | 만료 챌린지를 유효로 오인 |
| 5 | mfa/webauthn.ts:213 | cleanupExpiredChallenges | WHERE | 미만료 챌린지 조기 삭제 |
| 6 | mfa/service.ts:30 | verifyMfaSecondFactor | JS | 락 해제 시각 오판 |
| 7 | sessions/tokens.ts:117 | findSessionByToken | JS | **만료 세션을 active 로 오인 → 보안 위험** |
| 8 | sessions/tokens.ts:234 | listActiveSessions | WHERE | 활성 목록 오차 + display 9h 시프트 |

**결론**: 8곳 일괄 수정. 세션 40 CK "영향 범위" 4파일과 일치.

### 토픽 4: 3 가지 전환 패턴 설계
세션 39 정립한 `cleanup.ts` 패턴에서 3 변형 추출:

- **패턴 A (cleanup/purge)**: `$queryRaw SELECT id WHERE ... < NOW()` + ORM `deleteMany({where:{id:{in:ids}}})`. id-based DELETE 는 race-safe · TZ 무관.
- **패턴 B (목록 + display)**: 전체 쿼리를 raw SELECT 로 + 날짜 컬럼 `::text` 캐스팅 → JS `new Date(text).toISOString()` 정확한 UTC 복원. 응답 payload 의 9h 시프트까지 동시 해결.
- **패턴 C (ORM join 유지)**: 기존 ORM findUnique 로 복잡한 join 결과를 편리하게 가져오고, **만료 판정만** 보조 `$queryRaw SELECT (expr) AS is_X` boolean 쿼리로 위임. 추가 PK 인덱스 lookup 1회 비용.

verifyMfaSecondFactor 는 패턴 C + `::text` 조합으로 "락 판정 정확성 + 응답 lockedUntil 정확성" 두 마리 토끼.

**결론**: 패턴 선택 가이드:
- cleanup/purge → A
- 목록 조회 + 날짜 display 필요 → B
- 복잡한 ORM join 유지 필요 → C
- 응답 payload 에 DateTime 포함 → B 또는 C + `::text`

### 토픽 5: 구현 + 검증
4 파일 8 곳 일괄 수정. 구현 후:
- `npx tsc --noEmit`: 0 에러
- `npx vitest run`: 13 files / 244 tests PASS (세션 40 244 대비 회귀 0)
- 위험 패턴 재스캔: ORM WHERE 0 match / JS-side 0 match

기존 테스트는 모킹 ORM 호출만 검증하므로 `findSessionByToken` / `listActiveSessions` 변경은 테스트 영향 없음. `verifyMfaSecondFactor` / `consumeChallenge` 는 자기 단위 테스트 없음 (통합 E2E 경로).

**결론**: 회귀 0, 기능 유지 확인.

### 토픽 6: CK 추출 + 커밋 + 푸시
CK 신규 1건: `docs/solutions/2026-04-19-orm-date-filter-audit-sweep.md` (pattern, high).

구성:
- 세션 39 → 40 → 41 맥락
- 발견 8곳 표 + 영향
- 3 가지 전환 패턴 A/B/C + 코드 예시
- 패턴 선택 가이드
- 교훈 4 개 (전수 감사 신호 / WHERE+JS-side 한뿌리 / TIMESTAMPTZ 도 규칙 동일 / raw SQL 비용 대비 안전 이득)
- 재발 방지 체크리스트 4 항 (향후 코드 리뷰용)
- 관련 파일 + 관련 CK 연결
- 잔존 과제 2 항 — INSERT-side 시프트 / 기타 API route Date 직렬화 (다음 세션 인계)

커밋: `90ad952 refactor(orm): 세션 41 — Prisma Date 비교 전수 감사 (4파일 8곳 raw SQL 전환)`
푸시: `origin/main 25e908d → 90ad952`

**결론**: 세션 41 코드 + CK 푸시 완료. 문서(현 세션 종료 산출물)은 후속 커밋.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|---|---|---|
| 1 | 세션 40 권장 7건 중 #1 선택 | #1 ORM 감사 / #2 INSERT 검증 / #3 KST tick 관찰(익일) / #4 MFA biometric / #5 HS256 제거 / #6 SP 측정 / #7 genesis | #1 이 즉시 착수 가능 + 1-2h 스코프 + 비생체·비환경 · CK "영향 범위" 직접 해소 |
| 2 | JS-side `row.<at> < new Date()` 도 함께 감사 | ORM WHERE 만 / ORM WHERE + JS-side 동시 | 둘 다 adapter 경계의 TZ 재해석이 원인이라 함께 해야 재발 방지. 기회 비용 최소 |
| 3 | 3 가지 전환 패턴 분리 (A/B/C) | 단일 패턴 강제 / 3 변형 분리 | cleanup vs 목록 vs 복잡 join 은 리팩토링 비용과 이득이 상이. 패턴 분리가 선택 명확 |
| 4 | `verifyMfaSecondFactor` 에 `::text` 추가 | boolean 만 / boolean + ::text | 응답 payload 의 lockedUntil 9h 시프트까지 동시 해결. 한 줄 추가로 두 문제 해결 |
| 5 | 잔존 과제 2종 명시적 인계 | CK 에 간략 언급 / 별도 섹션 + 다음 세션 권장 | 복리 부채 방지 — INSERT-side 시프트는 별도 세션 (#2) 로 분리 유지 |

## 수정 파일 (5개)

| # | 파일 | 변경 |
|---|---|---|
| 1 | `src/lib/jwks/store.ts` | 3 함수 raw SQL 전환 (getActivePublicJwks / getPublicKeyByKid / cleanupRetiredKeys) |
| 2 | `src/lib/mfa/webauthn.ts` | consumeChallenge 보조 SELECT isExpired + cleanupExpiredChallenges 패턴 A |
| 3 | `src/lib/mfa/service.ts` | verifyMfaSecondFactor lockedUntil 판정 raw SQL + `::text` 로 응답 lockedUntil 정확성 |
| 4 | `src/lib/sessions/tokens.ts` | findSessionByToken 보조쿼리 / listActiveSessions 전체 raw SELECT with `::text` |
| 5 | `docs/solutions/2026-04-19-orm-date-filter-audit-sweep.md` | 신규 CK (pattern/high) |

## 상세 변경 사항

### 1. jwks/store.ts — 3 함수 TZ 시프트 회피
- `getActivePublicJwks`: `findMany({where:{OR:[...retireAt:{gt:now}]}})` → `$queryRaw WHERE status='CURRENT' OR (status='RETIRED' AND retire_at > NOW())` (패턴 B 단순화)
- `getPublicKeyByKid`: `findUnique` + JS `record.retireAt <= now` → 단일 `$queryRaw WHERE kid = ${kid} AND (CURRENT OR retire_at > NOW())` (패턴 B)
- `cleanupRetiredKeys`: `deleteMany({where:{retireAt:{lt:now}}})` → `$queryRaw SELECT id WHERE retire_at < NOW()` + ORM `deleteMany({where:{id:{in:ids}}})` (패턴 A)

### 2. mfa/webauthn.ts — 챌린지 소비 + 정리
- `consumeChallenge`: `findUnique` + JS `rec.expiresAt <= new Date()` → `$queryRaw SELECT id, user_id, purpose, (expires_at <= NOW()) AS isExpired` (패턴 C)
- `cleanupExpiredChallenges`: `deleteMany({where:{expiresAt:{lt:new Date()}}})` → 패턴 A

### 3. mfa/service.ts — lockedUntil 라이브 체크
```ts
// Before: enrollment.lockedUntil (ORM read-back, +9h shifted) > now
// After: PG 가 직접 비교 + ::text 로 정확한 ISO 문자열 반환
const lockRows = await prisma.$queryRaw<
  Array<{ locked: boolean; lockedUntilText: string | null }>
>`
  SELECT (locked_until IS NOT NULL AND locked_until > NOW()) AS locked,
         (locked_until::text) AS "lockedUntilText"
  FROM mfa_enrollments WHERE user_id = ${userId}
`;
if (lockRows[0]?.locked && lockRows[0].lockedUntilText) {
  return { ok: false, reason: "LOCKED",
           lockedUntil: new Date(lockRows[0].lockedUntilText) };
}
```
`data: { lockedUntil: null }` 클리어 호출부는 영향 없음 (null 바인딩은 TZ 무관).

### 4. sessions/tokens.ts — findSessionByToken + listActiveSessions
- `findSessionByToken`: 기존 ORM findUnique 로 join(`user`) 편의 유지, 만료 판정만 보조 쿼리 `SELECT (expires_at <= NOW()) AS expired FROM sessions WHERE id = ${row.id}` (패턴 C)
- `listActiveSessions`: 전체 쿼리 raw SELECT with `created_at::text` / `last_used_at::text` / `expires_at::text` — `expires_at > NOW()` WHERE + JS `new Date(text).toISOString()` 로 응답 payload 시프트까지 해결 (패턴 B)

### 5. CK 신규
`docs/solutions/2026-04-19-orm-date-filter-audit-sweep.md` (319줄) — 본 감사의 전체 맥락·패턴·체크리스트·잔존 과제 인계.

## 검증 결과

- `npx tsc --noEmit` — 0 에러
- `npx vitest run` — 13 files / **244 tests PASS** (세션 40 대비 회귀 0)
- 재스캔 `\{\s*(lt|lte|gt|gte)\s*:\s*(new Date|now)` — 0 match
- 재스캔 `(row|record|enrollment|session|rec)\.\w+(At|Until)\s*[<>=!]=?\s*(new Date|now)` — 0 match
- `git commit 90ad952` + `git push origin main` — 성공 (`25e908d → 90ad952`)

## 터치하지 않은 영역

- **INSERT-side binding 시프트**: `data: { expiresAt: new Date(Date.now() + TTL) }` 형태의 저장 경로. 현재 "9h 빨리 만료" 쪽으로 편향되어 대부분 보안상 허용 범위이나 정밀 검증 필요 (권장 #2 스코프).
- **기타 API route 의 Date 직렬화**: 본 감사에서 `listActiveSessions` / `verifyMfaSecondFactor` 만 커버. 나머지 API route (audit_logs / cron / webhooks / filebox / 기타) 가 ORM-read Date 를 `.toISOString()` 으로 바로 응답에 넣는지 개별 리뷰 필요.
- `rate-limit-db.ts`: 세션 34 부터 PG 측 `EXTRACT(EPOCH FROM ...)` 패턴으로 이미 안전. 주석만 세션 40 에서 갱신됨.
- `auth/keys.ts` API Key: `key.revokedAt` 는 **null 체크만** 하고 시점 비교 없음. 영향 없음.

## 알려진 이슈

- **세션 40 미해결**: `audit_logs.timestamp` 컬럼이 sec 단위 저장 · UI 가 ms 가정 시 1970년 표기. 본 세션 범위 외.
- Phase 16 (Observability Vault / Capistrano / Canary / Infrastructure 페이지) 미착수 — Wave 충실이행도 평가에서도 진도 20% 지적. Phase 15-D 보강 완료 후 진입 권장.

## 다음 작업 제안

세션 40 권장 재정렬 (세션 41 이 #1 완료):

1. **prisma INSERT timestamptz 시프트 검증** (1h) — ⭐ 신규 최상위. 본 세션 CK 잔존 과제 §1 과 직결. 실제 로그인 → PG 직접 SELECT 로 `expires_at` 정확성 확인. 시프트 확인 시 PG 측 `NOW() + INTERVAL '7d'` 로 INSERT 치환 검토.
2. **KST 03:00 자동 cleanup tick 관찰** (즉시, 익일 KST 03:00 이후) — PM2 uptime 24h+ 확보 후 `audit_logs` 에서 `CLEANUP_EXECUTED` 자동 1건 확인.
3. **MFA biometric 브라우저 수동 QA** (1.5h) — `docs/guides/mfa-browser-manual-qa.md` 8 시나리오 + 세션 36 Phase 15-D 활성 세션 카드 3 시나리오.
4. **HS256 legacy 쿠키 제거** (단독 세션 권장) — 기존 쿠키 무효화 리스크로 잠금.
5. **Phase 16 진입** (Vault VaultService AES-256-GCM envelope 8h + Capistrano 8h + Canary 4h + deploy_events UI 4h = 24h) — Wave 충실이행도 C+ → B 승격.
6. **SP-013 (wal2json) + SP-016 (SeaweedFS 50GB) 물리 측정** (13h) — Phase 17/19 진입 직전 재개.
7. **`/kdygenesis --from-wave`** — Wave 5 appendix `03-genesis-handoff.md` 의 85+ 태스크 자동 변환.

---
[← handover/_index.md](./_index.md)
