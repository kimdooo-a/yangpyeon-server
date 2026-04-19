---
title: "Revoke 의도 태깅 — write 시점에 reason 기록, read 시점에 분기 (자기파괴 버그 예방)"
date: 2026-04-19
session: 37
tags: [auth, session-management, bug-fix, pattern, state-machine, soft-delete]
category: bug-fix-pattern
confidence: high
severity: functional-bug
---

## 문제 (E2E 에서 발견)

Phase 15-D Refresh Rotation + `revoke-all` 엔드포인트 통합 후 세션 37 E2E 중 다음 시나리오 발견:

```
1. 브라우저 A 로그인 → 세션 A
2. 브라우저 B 로그인 → 세션 B (같은 계정)
3. A 에서 POST /revoke-all → B revoke, A 보존 (preservedCurrent:true, revokedCount:1)
4. 화면상 A 의 "활성 세션" 카드 = 자기 1건만 ✓
5. B 브라우저가 모르고 /refresh 자동 호출 (access 15분 만료 시)
6. 예상: B 만 401, A 는 영향 없음
7. 실제: **A 도 revoke 되어 다음 요청에 401** ← 자기파괴
```

감사 로그 증거:
```
SESSION_REVOKE_ALL      {preservedCurrent:true, revokedCount:1}
... B 의 /refresh 호출 ...
SESSION_REUSE_DETECTED  {revokedSessionsCount:1}  ← A 가 죽음
```

**심각도**: 기능적 버그. "다른 세션만 종료" 버튼이 **본인까지 로그아웃시키는** UX 역작용. 방치 시 모든 `revoke-all` 사용자가 "왜 내 세션도 자동으로 끊기지?" 라는 원인 불명 문제 보고.

## 원인 — 같은 상태, 다른 의미

`Session.revokedAt != NULL` 이라는 **같은 상태**에 **2가지 의미**가 공존:

| 원인 | revokedAt 세팅 시점 | 구 토큰 재사용의 의미 |
|------|-------------------|-------------------|
| **rotation** (refresh 성공) | refresh 직후 | **진짜 reuse 공격** — 이미 신 토큰 발급됐는데 구 토큰 사용 = 도난 의심 |
| **self** (사용자 개별 종료) | 보안 페이지에서 "종료" 클릭 | 스테일 — 단순히 오래된 브라우저가 몰라서 호출 |
| **self_except_current** (revoke-all) | 다른 세션 일괄 종료 | 스테일 — 다른 창이 몰라서 호출 |
| **logout** | 로그아웃 버튼 | 스테일 |
| **reuse_detected** | defense-in-depth 연쇄 | 스테일 (이미 방어 처리됨) |
| **admin** | 관리자 강제 revoke | 스테일 (알림 후 조용히 401) |

기존 코드는 `status==="revoked"` 만 보고 **무조건** `revokeAllUserSessions` (defense-in-depth) 발동 → 6가지 원인 중 1가지(rotation) 만 맞는 대응, 나머지 5가지에서 오작동.

## 해결 — Intent Tag 패턴

### 스키마 변경

```sql
-- prisma/migrations/20260419170000_add_session_revoked_reason/migration.sql
ALTER TABLE "sessions" ADD COLUMN "revoked_reason" TEXT;
```

```prisma
model Session {
  ...
  revokedAt     DateTime? @map("revoked_at")
  revokedReason String?   @map("revoked_reason")  // 세션 37
}
```

### Write 시점 — 각 revoke 경로가 자기 reason 기록

```ts
// rotation — rotateSession 내부 (src/lib/sessions/tokens.ts)
await tx.session.update({
  where: { id: oldSessionId },
  data: { revokedAt: new Date(), revokedReason: "rotation" },
});

// 사용자 개별 종료 — DELETE /api/v1/auth/sessions/[id]
revokeSession(sessionId, "self");   // default

// 사용자 revoke-all — POST /api/v1/auth/sessions/revoke-all
await prisma.session.updateMany({
  where: { userId, revokedAt: null, NOT: { id: currentSessionId } },
  data: { revokedAt: new Date(), revokedReason: "self_except_current" },
});

// 로그아웃 — POST /api/v1/auth/logout
await revokeSession(session.id, "logout");

// defense-in-depth — revokeAllUserSessions
data: { revokedAt: new Date(), revokedReason: "reuse_detected" },
```

### Read 시점 — refresh route 분기

```ts
// src/app/api/v1/auth/refresh/route.ts
if (lookup.status === "revoked" && lookup.session) {
  const isRotationReuse = lookup.session.revokedReason === "rotation";

  if (isRotationReuse) {
    // 진짜 공격 의심 → defense-in-depth
    const revoked = await revokeAllUserSessions(userId);
    writeAuditLogDb({ action: "SESSION_REUSE_DETECTED", ... });
  } else {
    // 스테일 호출 → 조용히 401
    writeAuditLogDb({
      action: "SESSION_REFRESH_REJECTED",
      detail: { userId, revokedReason },
    });
  }

  return 401;
}
```

## 검증 (E2E 재실행 후)

```
Before fix:
  SESSION_REVOKE_ALL      revokedCount=1 preservedCurrent=true
  ... B refresh ...
  SESSION_REUSE_DETECTED  revokedSessionsCount=1  ← A 죽음 ❌

After fix:
  SESSION_REVOKE_ALL      revokedCount=1 preservedCurrent=true
  ... B refresh ...
  SESSION_REFRESH_REJECTED revokedReason="self_except_current"  ← A 생존 ✓
```

GET /sessions 재호출 시 A 의 count=1 유지 확인.

## 일반화 원칙 — Intent Tag 패턴

### 언제 적용?

**"같은 상태, 다른 의미" 상황**. 체크리스트:

1. 같은 필드(`status`, `deletedAt`, `cancelledAt`, `expiredAt` 등)가 여러 경로에서 세팅되는가?
2. 경로마다 "이 상태가 된 이유" 가 다른가?
3. Read 시점에 **이유에 따라 다른 행동** 이 필요한가?

3개 모두 "예" → Intent Tag 적용.

### 적용 예

| 도메인 | 상태 필드 | Intent Tag 후보 |
|--------|----------|----------------|
| 주문 취소 | `cancelled_at` | `cancelled_reason` (user_request / merchant_cancel / payment_fail / fraud) |
| 계정 정지 | `suspended_at` | `suspension_reason` (admin_action / auto_fraud / user_request / tos_violation) |
| 구독 종료 | `ended_at` | `end_reason` (user_cancel / payment_fail / trial_end / refund) |
| 세션 revoke | `revoked_at` | `revoked_reason` (rotation / self / logout / reuse) |
| 알림 dismiss | `dismissed_at` | `dismiss_reason` (clicked / auto_timeout / bulk_clear) |

### vs. 대안 분석

**대안 1 — 여러 필드**:
```sql
ALTER TABLE sessions
  ADD COLUMN revoked_by_rotation_at TIMESTAMP,
  ADD COLUMN revoked_by_user_at TIMESTAMP,
  ADD COLUMN revoked_by_logout_at TIMESTAMP;
```
→ 같은 개념(revoke 시점)의 컬럼 폭발. 쿼리 복잡(`COALESCE(...)` 필수). 새 이유 추가 시 마이그레이션 필요.

**대안 2 — 다형 테이블**:
```
sessions + session_revocations (revocation_type, actor, reason_detail)
```
→ 과한 정규화. 단순 lookup 이 JOIN 필수.

**대안 3 — enum 컬럼**:
```sql
revoked_reason revoke_reason_enum
```
→ PG enum 확장 시 마이그레이션 필요 ("세션 37 후 새 reason 추가 → enum alter"). TEXT 가 유연.

**선택**: **단일 TEXT 컬럼** = 적절.

### 안티패턴 회피

**"추정" 에 의존 금지**: "rotation 인지 아닌지 `revokedAt` 과 `createdAt` 차이로 추정" 같은 heuristic 은 깨진다. 예: rotation 후 30초 안에 사용자가 revoke-all 해도 같은 타이밍. 명시적 태깅 필요.

**Read 시점 로직 중앙화**: reason 해석을 여러 곳에 분산하면 drift. `src/lib/sessions/revoke-policy.ts` 같은 모듈에 `shouldTriggerReuseDetection(reason): boolean` 함수로 중앙화 권장 (이 프로젝트는 1곳 분기라 아직 불필요, 확장 시 리팩토링).

## 교차 참조

- `prisma/migrations/20260419170000_add_session_revoked_reason/migration.sql` — 컬럼 추가
- `src/lib/sessions/tokens.ts` — 6 reason 설정 지점
- `src/app/api/v1/auth/refresh/route.ts` — read 시점 분기
- `docs/solutions/2026-04-19-opaque-refresh-rotation-reuse-detection.md` — 세션 36 설계 원본 (defense-in-depth 최초 도입)
- `docs/solutions/2026-04-19-session-revoke-user-intent-vs-defense.md` — 세션 37 동시 작성 (함수 분리 원칙)
- STRIDE Blueprint §7.2.2 — Replay 위협 모델 (rotation reuse 가 본래 대응 대상)

## 메타

- **발견 세션**: 37 (E2E 재실행 중 자기파괴 시나리오)
- **버그 수명**: 세션 36 → 37 (약 2시간, 프로덕션 영향 전에 차단)
- **수정 비용**: 컬럼 추가 1개 + 6개 write 지점 업데이트 + 1개 read 분기 + 테스트 5건 (~30분)
- **재사용 가치**: 매우 높음 — soft-delete / state-machine 이 있는 모든 도메인에서 재발 가능
- **검증 수준**: 프로덕션 E2E 전/후 비교 (SESSION_REUSE_DETECTED → SESSION_REFRESH_REJECTED 전환 확인)
