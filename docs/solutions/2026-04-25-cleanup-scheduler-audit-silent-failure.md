---
title: cleanup-scheduler audit log "silent failure" — catch 블록의 에러 무시 패턴
date: 2026-04-25
session: 54
tags: [cleanup-scheduler, audit-log, silent-failure, error-handling, observability, debugging]
category: pattern
confidence: high
---

## 문제

매일 KST 03:00 cleanup-scheduler 자동 tick 후 PM2 로그에 다음과 같은 경고가 반복적으로 출력됨:

```
[cleanup-scheduler] audit log write failed { sessions: 0, 'rate-limit': 1, jwks: 0, 'webauthn-challenges': 0 }
```

또는

```
[cleanup-scheduler] SESSION_EXPIRE audit write failed <entryId>
```

그런데 **에러 메시지·스택 트레이스가 어디에도 남지 않아** 진짜 원인 진단이 불가능. 다른 터미널에서는 "better-sqlite3 ELF mismatch"로 가설 세웠으나, cleanup이 정수 카운트를 정상 출력한 *다음에* 에러가 찍히므로 — ELF mismatch였다면 dlopen 단계에서 cleanup 자체가 시작도 못 했어야 함. 가설이 맞는지 틀린지조차 검증할 수단이 없는 상태.

## 원인

`src/lib/cleanup-scheduler.ts`의 두 catch 블록이 **에러 객체를 인자 없이 swallow**하는 패턴:

```ts
// runSessionsCleanupWithAudit (line 80-92, 수정 전)
try {
  writeAuditLogDb({ ... });
} catch {  // ← err 바인딩 없음
  console.warn("[cleanup-scheduler] SESSION_EXPIRE audit write failed", entry.id);
}

// writeCleanupAudit (line 142-156, 수정 전)
try {
  writeAuditLogDb({ ... });
} catch {  // ← err 바인딩 없음
  console.warn("[cleanup-scheduler] audit log write failed", summary);
}
```

설계 의도(주석)는 "audit 기록 실패가 cleanup 루프를 끊지 않도록 catch"였으나 — *에러를 catch는 했지만 진단 정보를 소실*. 격리(isolation) 의도는 정당하지만, 에러 객체를 로그에 노출하지 않은 건 의도된 게 아니라 누락에 가까움. 이 패턴이 silent failure로 분류되는 이유는, cleanup 루프는 보호하면서도 운영자가 "**왜 실패하는지**" 알 수 있게 했어야 하는데 후자를 빼먹은 것.

이 함정의 본질: **`catch (err)` 바인딩 없이 `catch {}`로 쓰면 lint/typescript는 통과하지만, 운영 진단 가능성을 1bit(실패 여부)로 압축**시킨다. 메시지·스택·error code·DB 제약 위반 같은 다차원 정보를 모두 0으로 만든다.

## 해결

격리 의도는 유지하되, 에러 객체를 구조화 형태로 노출:

```ts
} catch (err) {
  console.warn(
    "[cleanup-scheduler] SESSION_EXPIRE audit write failed",
    {
      entryId: entry.id,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    },
  );
}
```

```ts
} catch (err) {
  console.warn(
    "[cleanup-scheduler] audit log write failed",
    {
      summary,
      action,
      error: err instanceof Error
        ? { message: err.message, stack: err.stack }
        : err,
    },
  );
}
```

핵심:
1. **err 바인딩 추가** (TypeScript `useUnknownInCatchVariables` 환경에서도 안전)
2. **Error 인스턴스 분기**: `err instanceof Error`로 message/stack 구조화, 그 외(throw "string"; 같은 비-Error)는 그대로 직렬화
3. **컨텍스트 키 동시 노출**: summary/action/entryId 등 — 단일 라인에서 어느 작업이었는지 한눈에

## 교훈

- **`catch {}`는 운영 환경에서 silent failure의 정의 그 자체**. 에러를 격리한다는 건 "루프를 끊지 않는다"는 뜻이지 "에러를 버린다"는 뜻이 아니다. 둘은 분리 가능.
- **격리 패턴 표준 형식**: `try { ... } catch (err) { logger.warn("[<scope>] <action> failed", { ...context, error: errToJson(err) }); }`. 가능하면 프로젝트 전역 `errToJson(err)` 헬퍼로 추출.
- **PR 리뷰 시그널**: catch 블록에 err 바인딩이 없거나, 있어도 메시지에 err를 안 넘기면 silent failure 후보로 표시.
- **silent-failure-hunter 적용 영역**: cleanup-scheduler뿐 아니라 모든 격리 catch 블록 — 미들웨어·cron 잡·이벤트 핸들러·SSE 클린업 등.
- **검증 비용 비대칭**: 에러 노출은 1줄 패치로 끝나지만, 노출 없이 운영하면 가설 검증마다 *재현 대기* 비용이 24h 단위. 근본 수정 전이라도 진단 가능성부터 확보하는 게 ROI 압도.

## 관련 파일

- `src/lib/cleanup-scheduler.ts` (line 80-100, 142-162) — 패치 적용
- `src/lib/cleanup-scheduler.test.ts` — 13/13 PASS (catch 블록 미커버, 회귀 위험 0)
- `src/lib/audit-log-db.ts` — `writeAuditLogDb` 본체 (drizzle+SQLite, `process.cwd()/data/dashboard.db`)
- `src/lib/db/index.ts` — `getDb()` lazy init + better-sqlite3 + WAL/busy_timeout
- `standalone/ecosystem.config.cjs` — PM2 `cwd: __dirname` 명시 (cwd 표류 가설 기각 근거)

## 후속 검증 계획

1. **2026-04-26 03:00 KST 자동 tick 직후 PM2 로그 확인**:
   ```bash
   pm2 logs ypserver --lines 50 --nostream | grep -A 5 "audit log write failed"
   ```
   `error.message` + `error.stack` 노출되면 진짜 원인(SQLite 락 / 컬럼 NOT NULL 위반 / 타입 mismatch / 파일 권한 등)이 즉시 가시화.

2. **재발 안 하면**: ELF mismatch 가설 + WSL 재배포(commit `9a37dfb`) 흡수 + 본 패치 흡수가 모두 작용한 결과 — 격리 패턴 자체로 충분히 견고함이 입증됨.

3. **재발 + 진짜 silent 영역 발견 시**: silent-failure-hunter 시각으로 `src/lib/audit-log-db.ts` `writeAuditLogDb`의 비-throw 실패 경로(예: drizzle .run() void 반환의 에러 비전파, transaction commit 실패 등) 재조사.
