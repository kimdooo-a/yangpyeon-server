---
title: "Opaque refresh token + DB Session rotation + reuse 탐지 defense-in-depth 패턴"
date: 2026-04-19
session: 36
tags: [auth, refresh-token, session-management, jwt, rotation, reuse-detection, security, prisma]
category: architecture
confidence: high
---

## 문제

Stateless JWT refresh token 은 구현이 간단하지만 3가지 한계:

1. **서버 revoke 불가** — 유출된 토큰을 만료까지 취소할 방법 없음. 강제 로그아웃 → 모든 사용자에게 재로그인 강제 밖에 없음.
2. **Reuse 탐지 불가** — 공격자가 훔친 refresh token 재사용해도 서버는 정상 요청과 구분 불가.
3. **감사 추적 빈약** — 로그인/회전/취소 시점에 DB 레코드 없어 사후 조사 어려움.

**본 프로젝트 실제 니즈**:
- 사용자가 "활성 세션 목록" UI 에서 의심스러운 기기 즉시 종료
- 관리자가 공격 탐지 시 특정 사용자의 모든 세션 revoke
- STRIDE 위협 모델 (Blueprint §7.2.2) 중 "Replay" 대응

## 원인

Stateless 설계의 근본: 서버는 refresh token 을 "기억"하지 않고 매 요청마다 secret 로 검증만 함. 상태(revoke 여부, 만료 시점, 마지막 사용 IP)가 서버에 없으므로 위 기능 모두 불가.

해결하려면 **서버가 토큰을 기억**해야 함 = stateful 설계로 전환.

## 해결

### 설계 트레이드오프 표

| 축 | Stateless JWT | Opaque + DB |
|----|---------------|-------------|
| 토큰 형태 | JWT (payload 포함) | 32-byte 랜덤 hex |
| 검증 | secret 로 서명 확인 | DB `tokenHash` 매칭 |
| 저장 | 서버 저장 없음 | Prisma `Session` 테이블 |
| Revoke | 불가 | `revokedAt = NOW()` |
| Reuse 탐지 | 불가 | revoked 토큰 재사용 감지 가능 |
| 감사 | 토큰 자체 노출 불가 | `lastUsedAt`, IP, UA 추적 |
| 확장성 | 무한 | 단일 노드 전제 (Redis 이관으로 scale-out) |
| 쿠키 크기 | ~200 bytes | 64 chars |

### 핵심 구현 (src/lib/sessions/tokens.ts)

```ts
import crypto from "node:crypto";

// 32 bytes = 64 hex chars. Math.log2(16^64) = 256 bits 엔트로피.
export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// 쿠키 평문은 저장하지 않음. unique index 위에서 O(1) 매칭.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// 로그인 시 호출.
export async function issueSession(params: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const session = await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  return { token, sessionId: session.id, expiresAt: session.expiresAt };
}

// Rotate: 구 revoke + 신 insert 원자성 트랜잭션.
export async function rotateSession(params: {
  oldSessionId: string;
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: params.oldSessionId },
      data: { revokedAt: new Date() },
    });
    const token = generateOpaqueToken();
    const created = await tx.session.create({
      data: {
        userId: params.userId,
        tokenHash: hashToken(token),
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { token, sessionId: created.id, expiresAt: created.expiresAt };
  });
}

// Reuse 탐지 핵심: user의 모든 활성 세션 즉시 revoke.
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
```

### Refresh 엔드포인트에서 Reuse 탐지 (src/app/api/v1/auth/refresh/route.ts 발췌)

```ts
const lookup = await findSessionByToken(token);

if (lookup.status === "revoked" && lookup.session) {
  // REUSE 탐지 — 이 사용자의 모든 활성 세션 revoke (defense-in-depth)
  const revoked = await revokeAllUserSessions(lookup.session.userId);
  writeAuditLogDb({
    action: "SESSION_REUSE_DETECTED",
    detail: JSON.stringify({
      userId: lookup.session.userId,
      revokedSessionsCount: revoked,
    }),
    ...
  });
  return errorResponse("SESSION_REVOKED", ..., 401);  // 쿠키도 제거
}

if (lookup.status === "active") {
  const rotated = await rotateSession({
    oldSessionId: lookup.session.id,
    userId: lookup.session.userId,
    ip, userAgent,
  });
  writeAuditLogDb({ action: "SESSION_ROTATE", ... });
  return ... // 새 access + 새 쿠키
}
```

### Defense-in-depth: 왜 "모든 세션" revoke 인가?

**시나리오**: 공격자가 사용자 refresh token 을 훔침. 희생자는 눈치채지 못함.

1. 공격자가 한 번 refresh → 새 토큰 rotation → 희생자 기존 토큰 자동 revoke
2. 희생자가 다음 refresh 시도 → **revoked 토큰 제시** → REUSE 탐지 발동
3. 이 시점에 **공격자가 최근 발급받은 신 세션도 revoke** → 공격자 즉시 락아웃

포인트: 2번 단계에서 "어느 쪽이 정상 사용자인지" 서버는 알 수 없음. 그래서 안전하게 **양쪽 다 revoke** + 양쪽 다 재로그인 강제. 정상 사용자에게는 불편이지만, 공격 차단은 확실.

## 교훈

1. **Stateless vs Stateful 은 기능 요구에 따라 선택** — UI 에서 "활성 세션 종료" 또는 "모든 세션 종료" 버튼이 요구사항이면 stateful 필수. 없으면 JWT 도 충분.
2. **SHA-256 hash 저장은 쿠키 탈취와 DB 탈취의 분리 보호** — DB 덤프가 유출되어도 hash 만으로는 쿠키 재구성 불가. unique index 위에서 O(1) 매칭 가능.
3. **Rotate 트랜잭션 필수** — 구 revoke + 신 insert 사이에 장애 발생 시 양쪽 상태가 일관되어야 함. Prisma `$transaction` 으로 원자성 보장.
4. **Reuse 탐지에서 신 세션까지 revoke 하는 이유** — "정상 사용자 = 구 토큰 소지" 라는 가정이 깨지는 시점이므로 양쪽 다 의심스러움. 불편 < 보안.
5. **Reuse 탐지 grace 고려** — 네트워크 재시도로 인한 double-refresh 도 reuse 처럼 보일 수 있음. 현 구현은 엄격 처리. 필요 시 "직전 rotate 로부터 N초 이내 동일 토큰 제시는 허용" 정책 추가 가능 (본 프로젝트 도입 안 함 — 브라우저 HTTP/2 멀티플렉싱이 double-refresh 거의 안 일으킴).
6. **`touchSessionLastUsed` 는 refresh 외에도 access 검증 시에 호출 고려** — UI 활성 세션 카드의 "마지막 사용" 필드를 실시간화하려면 access 단계에서도 업데이트 필요. 단 매 요청마다 DB write 는 비용 — 5분 스로틀 등 도입.

## 관련 파일

- `src/lib/sessions/tokens.ts` — 토큰 생성/회전/취소 유틸
- `src/lib/sessions/login-finalizer.ts` — 3개 로그인 경로 공통화
- `src/app/api/v1/auth/refresh/route.ts` — rotate + reuse 탐지
- `src/app/api/v1/auth/sessions/route.ts` — GET 활성 세션 목록
- `src/app/api/v1/auth/sessions/[id]/route.ts` — DELETE self-revoke
- `src/app/api/v1/auth/logout/route.ts` — 서버측 revoke
- `src/app/(protected)/account/security/page.tsx` — UI 활성 세션 카드
- `prisma/schema.prisma` — `Session` 모델 (세션 32 인프라)
- `docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md` §7.2.2
