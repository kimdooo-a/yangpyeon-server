---
title: 배치 삭제에 per-row 감사 로그 결합 — 집계 로그와 병행
date: 2026-04-19
session: 39
tags: [audit-log, cleanup, batch-delete, pattern, separation-of-concerns]
category: pattern
confidence: high
---

## 문제

주기적 cleanup job (만료 세션, rate-limit 버킷, webauthn challenge 등) 은 보통 "N 건 삭제" 집계 로그 하나만 남긴다. 하지만 보안 감사 관점에서는 **어떤 세션이 언제 왜 없어졌는지** 를 row 단위로 추적할 필요가 생긴다 (forensic / dispute / compliance).

### 해결 안이 잘못 설계된 예

- **옵션 A (거부)**: DB ops 함수 안에 감사 로그 write 를 직접 넣는다.
  - 문제: audit 대상 DB (SQLite) 와 ops 대상 DB (PG) 가 분리된 아키텍처에서 ops 함수가 두 DB 를 모두 알게 되어 결합도 상승. 테스트 모킹도 복잡.
- **옵션 B (거부)**: scheduler 가 cleanup 함수를 두 번 부른다 (SELECT 전용 → 감사 기록 → DELETE 전용).
  - 문제: race. SELECT 결과의 id 가 DELETE 사이에 사라질 수 있어 집계와 감사 불일치.

## 해결

**DB ops 함수가 삭제된 entries 를 반환**하고, **scheduler (호출자) 가 audit 기록을 담당**하는 형태로 관심사 분리.

```ts
// src/lib/sessions/cleanup.ts — DB ops 만
export interface CleanupResult {
  deleted: number;
  expiredEntries: ExpiredSessionEntry[];
}

export async function cleanupExpiredSessions(): Promise<CleanupResult> {
  const rows = await prisma.$queryRaw<...>`
    SELECT id, user_id AS "userId", (expires_at::text) AS "expiresAt"
    FROM sessions
    WHERE expires_at < NOW() - INTERVAL '1 day'
  `;
  if (rows.length === 0) return { deleted: 0, expiredEntries: [] };
  const ids = rows.map((r) => r.id);
  const deletedCount = await prisma.$executeRaw`
    DELETE FROM sessions WHERE id = ANY(${ids}::text[])
  `;
  return { deleted: Number(deletedCount), expiredEntries: /* re-hydrated */ };
}

// src/lib/cleanup-scheduler.ts — 감사 정책 만
async function runSessionsCleanupWithAudit(): Promise<number> {
  const result = await cleanupExpiredSessions();
  for (const entry of result.expiredEntries) {
    try {
      writeAuditLogDb({
        timestamp: new Date().toISOString(),
        method: "SYSTEM",
        path: "/internal/cleanup-scheduler/session-expire",
        ip: "127.0.0.1",
        action: "SESSION_EXPIRE",
        detail: buildSessionExpireAuditDetail(entry),
      });
    } catch {
      // audit 실패가 배치 중단을 일으키지 않도록 격리 — warn 만
      console.warn("[cleanup-scheduler] SESSION_EXPIRE audit write failed", entry.id);
    }
  }
  return result.deleted;
}
```

**집계 로그는 상위 레벨** (`runCleanupsNow` → `writeCleanupAudit("CLEANUP_EXECUTED", summary)`) 이 이미 기록하므로 per-row 로그와 중복 없이 쌓인다.

### Pure function 분리

`buildSessionExpireAuditDetail(entry): string` — JSON payload 만 담당. DB/시간/외부 상태 의존 없음 → 순수 단위 테스트 가능.

```ts
// src/lib/sessions/cleanup.ts
export function buildSessionExpireAuditDetail(entry: ExpiredSessionEntry): string {
  return JSON.stringify({
    sessionId: entry.id,
    userId: entry.userId,
    expiresAt: entry.expiresAt.toISOString(),
    reason: "expired",
  });
}
```

## 교훈

- **DB ops 는 "무엇을 지웠나" 를 반환하라**. 감사 책임은 호출자로 넘겨야 batch 모드 / manual 모드 / admin-triggered 모드 각각의 audit 정책이 유연해진다.
- **Per-row audit 는 상위 집계 audit 와 충돌하지 않는다**. "이번 배치에 N 건 정리했다" (CLEANUP_EXECUTED) + "어떤 row 들이 정리됐다" (SESSION_EXPIRE × N) 는 상호 보완.
- **Audit write 는 try/catch 로 격리**. 감사 실패가 배치 중단으로 번지면 장애 복구 중 "감사 못 하니 복구도 못 함" 교착 발생.
- **Pure function 분리로 audit payload 는 별도 단위 테스트**. DB 모킹 없이 빠르게 회귀 검증.

## 적용 대상 (향후 확장)

동일 패턴으로 확장 가능한 기존 cleanup:
- `cleanupExpiredRateLimitBuckets` — `RATE_LIMIT_BUCKET_EXPIRE` 감사 (쓸모 낮음, 양 많음)
- `cleanupRetiredKeys` — `JWKS_KEY_RETIRE` (JWKS 키 폐기는 보안 이벤트, 감사 가치 높음)
- `cleanupExpiredChallenges` — `WEBAUTHN_CHALLENGE_EXPIRE` (일상적, 감사 가치 낮음)

**추천**: JWKS 키 폐기만 추가 우선.

## 관련 파일

- `src/lib/sessions/cleanup.ts` — 함수 반환 타입 확장 사례
- `src/lib/cleanup-scheduler.ts` — `runSessionsCleanupWithAudit` wrapper
- `src/lib/sessions/cleanup.test.ts` — `buildSessionExpireAuditDetail` 순수 단위 테스트
