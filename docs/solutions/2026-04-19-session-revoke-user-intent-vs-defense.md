---
title: "세션 revoke — 사용자 의도 vs 시스템 방어 분리 (감사 액션 + conditional WHERE)"
date: 2026-04-19
session: 37
tags: [auth, session-management, audit-log, defense-in-depth, prisma, naming]
category: pattern
confidence: high
---

## 문제

Phase 15-D Refresh Rotation 도입 후 세션을 "일괄 revoke" 하는 요구가 2가지 발생:

1. **시스템 방어**: refresh token reuse 탐지 시 해당 사용자의 **모든** 활성 세션을 즉시 무효화 (도둑맞은 가능성이 높으므로 신규 세션 포함 전부)
2. **사용자 의도**: 보안 페이지에서 "현재 세션 외 모두 종료" 클릭 — **현재 세션은 보존**하고 나머지만 revoke

**초기 공통화 유혹**: 두 경로 모두 `updateMany WHERE userId AND revokedAt IS NULL` 하면 되는 것처럼 보여 하나의 함수로 처리하려 함.

```ts
// Anti-pattern
export async function revokeAllUserSessions(
  userId: string,
  exceptId?: string,  // ← 나쁜 신호: 옵션 파라미터로 2가지 의도 혼합
) { ... }
```

**증상/리스크**:

- 호출 측에서 `exceptId` 전달 깜빡이면 reuse 탐지인데 모든 세션이 revoke 되어야 할 때 일부가 남거나, 반대로 사용자 의도 호출에서 현재 세션까지 revoke되는 버그.
- 감사 로그 액션을 어떻게 붙일지 불명확 — `SESSION_REVOKE_ALL` 하나로 하면 사후 조사 시 "이건 공격 대응이었나 사용자 버튼 눌렀나?" 판별 불가.
- 함수 이름이 의도를 가리키지 않음 → 호출자 측에서 주석 없이는 어떤 경우에 써야 할지 불명.

## 원인

**두 경로는 WHERE 절은 비슷해도 "의미"가 다름**:

| 축 | Reuse 탐지 | 사용자 자발 종료 |
|----|-----------|----------------|
| 트리거 | 서버 내부 (revoke된 토큰 재사용 감지) | 사용자 명시적 버튼 클릭 |
| 현재 세션 처리 | **포함** (공격자가 훔쳤을 가능성) | **제외** (정상 사용자 보존) |
| 감사 액션 | `SESSION_REUSE_DETECTED` | `SESSION_REVOKE_ALL` |
| 대응 | 재로그인 + MFA 권장 토스트 | 다른 기기만 로그아웃 |
| 빈도 | 드문 (예외 경로) | 드문~중간 (보안 점검) |
| 알림 | 보안 관리자 대시보드 우선 표시 | 일반 audit 목록 |

즉, **같은 SQL 패턴 ≠ 같은 책임**. 네이밍/감사/호출 조건이 전부 다름.

## 해결

### 2 함수로 분리 + conditional NOT 절

**파일**: `src/lib/sessions/tokens.ts`

```ts
/**
 * reuse 탐지 defense-in-depth — 현재 세션 포함 전부 revoke
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * 사용자 자발적 종료 — 현재 세션 보존
 */
export async function revokeAllExceptCurrent(
  userId: string,
  currentSessionId?: string | null,
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
```

**핵심 설계**:

- `revokeAllExceptCurrent(userId, null)` 호출은 `revokeAllUserSessions(userId)` 와 **동치** — 하지만 의도가 다르므로 호출 측에서 구분하도록 함.
- `currentSessionId` 를 전달할 수 없는 상황(쿠키 없거나 tokenHash 매칭 실패)도 자연스럽게 처리 — NOT 절 생략으로 전체 revoke 로 fallback. 사용자는 현재 세션도 같이 종료될 수 있음을 감수.

### 호출 측 감사 로그 분리

```ts
// refresh/route.ts — reuse 탐지
writeAuditLogDb({
  action: "SESSION_REUSE_DETECTED",
  detail: JSON.stringify({ userId, revokedSessionsCount }),
});

// sessions/revoke-all/route.ts — 사용자 자발
writeAuditLogDb({
  action: "SESSION_REVOKE_ALL",
  detail: JSON.stringify({
    userId,
    reason: "self",
    preservedCurrent: Boolean(currentSessionId),
    revokedCount,
  }),
});
```

`preservedCurrent` 플래그로 쿠키 부재 상황도 추적 가능.

### Prisma updateMany 의 NOT 절 트릭

```ts
where: {
  ...base,
  ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}),
}
```

- Prisma `NOT` 은 반드시 **객체**. `{ NOT: { id: x } }` 는 `id != x` 로 SQL 번역.
- `currentSessionId` 가 `null`/`undefined`/`""` 일 때 spread 가 빈 객체 → WHERE 절에 영향 없음.
- 빈 문자열은 의도적으로 falsy 취급 (route 경계에서 `""` 도 "not provided" 로 해석).

## 결과

### 테스트 (세션 37 신규 5건)

`src/lib/sessions/tokens.test.ts` — Prisma `updateMany` 만 mock:

1. currentSessionId 제공 → `NOT: { id: currentSessionId }` 포함 검증
2. null 제공 → NOT 절 생략
3. undefined → NOT 절 생략
4. 빈 문자열 → falsy → NOT 절 생략
5. Prisma 에러 전파 (상위 try/catch 에서 처리)

→ 196 → **201 PASS** (+5, 회귀 0)

### 프로덕션 E2E (예정 — 세션 37 배포 후)

1. 브라우저 A / B 각각 로그인 → 활성 세션 2건
2. A 에서 POST /revoke-all → `{revokedCount:1, preservedCurrent:true}` + SESSION_REVOKE_ALL 감사
3. B 에서 API 호출 → 401 (revoked)
4. A 에서 GET /sessions → 1건 (자기만)
5. A 에서 쿠키 삭제 후 POST /revoke-all → `preservedCurrent:false` + A 도 revoke (다음 요청 401)

## 일반화 원칙

### "같은 SQL ≠ 같은 책임" 판별 체크리스트

| 질문 | "같은 함수" | "분리" |
|------|-----------|-------|
| 호출 트리거가 같은가? | ○ | X (분리) |
| 감사 로그 액션이 같은가? | ○ | X |
| 파라미터 기본값이 자연스러운가? | ○ | X (의미 달라서) |
| 호출 조건이 같은가? | ○ | X |
| 사후 조사 시 구분 필요한가? | X | ○ |
| 함수 이름으로 의도 표현 가능한가? | ○ | X (이름 2개 필요) |

**위 중 1개라도 "분리" 쪽이면 2 함수**. 코드 중복 수줄은 이미 허용 가능한 비용.

### 안티패턴 — 옵션 파라미터 오남용

```ts
// BAD: 옵션 플래그로 의도 변경
revokeUserSessions(userId, { includeCurrent: boolean })

// GOOD: 이름이 의도를 말함
revokeAllUserSessions(userId)            // 전부
revokeAllExceptCurrent(userId, currentId) // 현재 제외
```

Boolean 플래그는 호출 측 가독성 저하 + 리버스 리뷰 어려움. 네이밍으로 분리하면 grep 으로 모든 "defense-in-depth" 호출 지점을 한 번에 찾을 수 있음.

### 관련 패턴

- **Named Constructor / Named Factory** — 같은 데이터 구조를 의도별로 다른 이름 함수로 만듦 (e.g. `Date.from_unix_timestamp()` vs `Date.from_iso_string()`).
- **Command 패턴** — revoke 의도 자체를 객체로 모델링하고 executor 가 분기. 이 프로젝트 규모엔 과함.

## 교차 참조

- `src/lib/sessions/tokens.ts` — `revokeAllUserSessions` / `revokeAllExceptCurrent`
- `src/app/api/v1/auth/refresh/route.ts` — reuse 탐지 호출 지점
- `src/app/api/v1/auth/sessions/revoke-all/route.ts` — 사용자 자발 호출 지점
- `docs/solutions/2026-04-19-opaque-refresh-rotation-reuse-detection.md` (세션 36 — reuse 탐지 설계 원본)
- `docs/solutions/2026-04-19-rate-limit-defense-in-depth-conflict.md` (세션 34 — 유사한 "같은 스코프 ≠ 같은 책임" 케이스)

## 메타

- **발견 세션**: 37 (Phase 15-D 보강 — "다른 모든 세션 종료" 버튼 요구사항)
- **재사용 가치**: 높음 — audit 스키마 + conditional WHERE 패턴은 "soft delete 대상의 일괄 처리" 모든 곳에 적용 (notification revoke, API key rotation, role-based bulk update 등)
- **검증 수준**: unit 5/5 PASS, 프로덕션 E2E 예정 (세션 37 배포)
