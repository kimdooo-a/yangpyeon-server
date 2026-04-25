# 인수인계서 — 세션 54 (audit log silent failure 진단 패치 + 블로킹 사유 정리)

> 작성일: 2026-04-25
> 이전 세션: [session53](./260425-session53-priority-0-2-cascade.md) (§보완 포함)

---

## 작업 요약

세션 53 §보완의 미해결 항목 "audit log write failed 가설 부분 보류"를 선제 디버깅. cleanup-scheduler의 catch 블록 2곳이 **에러 객체를 swallow**하던 silent failure 패턴을 식별·수정 → 내일 03:00 KST 재현 시 진짜 원인 즉시 가시화 가능. 추가로 즉시 진행 불가 5건(C·E·6-E·6-F·6-G)의 사유를 next-dev-prompt.md에 명시.

## 대화 다이제스트

### 토픽 1: 사용자 진입 — 다음 작업 순차 진행 지시

> **사용자**: "다음 작업 순차적으로 모두 진행 .... ● 전 phase 완료. 종합 결과: ..." (세션 53 §보완 Phase 7 결과 + 남은 작업 7항 표 인용)

이전 세션(§보완) 결과를 컨텍스트로 받음. 남은 작업 7항 중 4항이 외부 의존성(시간/디바이스/재부팅) 또는 명시 승인 필요(DB 파괴/패스워드 rotation), 자율 가능 = audit 가설 선제 분석(A') + Turbopack 워닝(부) + 블로킹 사유 문서화 3건으로 분류.

**결론**: 자율 실행 메모리(분기 질문 금지, 권장안 즉시 채택, 파괴적 행동만 예외)에 따라 비파괴 3건만 진행, 파괴/대기 5건은 명시적 사유와 함께 보류.

### 토픽 2: audit log silent failure 근본 분석

cleanup-scheduler.ts 두 catch 블록 정독 결과:

```ts
// runSessionsCleanupWithAudit (line 89, 수정 전)
} catch {
  console.warn("[cleanup-scheduler] SESSION_EXPIRE audit write failed", entry.id);
}

// writeCleanupAudit (line 151, 수정 전)
} catch {
  console.warn("[cleanup-scheduler] audit log write failed", summary);
}
```

**핵심 단서**: catch에 `(err)` 바인딩이 없고, 로그에도 err를 넘기지 않음 → 실제 에러 메시지·스택이 PM2 로그 어디에도 남지 않는 silent failure 정의 그 자체.

**다른 터미널 ELF 가설 검증**: cleanup이 `summary={ sessions: 0, 'rate-limit': 1~4, ... }` 정수 카운트를 정상 출력한 *다음에* 에러가 찍힘. `cleanupExpiredRateLimitBuckets`는 **Prisma+Postgres**(`prisma.$executeRaw`), `writeAuditLogDb`는 **drizzle+SQLite**(`db.insert(auditLogs)`)인 하이브리드 구조 → ELF mismatch였다면 better-sqlite3 import 시점(getDb 첫 호출)에 폭발했어야 함. 따라서 **ELF 가설은 audit 실패의 단일 원인이 아니며**, audit 모듈 내부의 별도 silent fail 가설이 잔존.

PM2 ecosystem `cwd: __dirname` 명시 → cwd 표류 가설 기각. 진짜 원인 후보: (1) SQLite 일시 락 / busy_timeout 초과 / (2) audit_logs 컬럼 제약 위반 / (3) Date 변환 엣지케이스 / (4) drizzle .run() 비-Error throw 등. 모두 catch가 에러를 노출하지 않는 한 검증 불가능.

**결론**: 격리 의도(cleanup 루프를 끊지 않음)는 유지하되, 에러 객체를 `{ message, stack }` 구조로 노출하는 패치 적용. 한 줄짜리 변경이 가설 검증 비용을 24h → 즉시로 단축.

### 토픽 3: Turbopack instrumentation.ts 워닝 — 보류 결정

`instrumentation.ts`는 이미 `NEXT_RUNTIME !== "nodejs"` 가드 + 동적 `await import("node:fs")` 모범 패턴. 워닝이 진짜 cosmetic인지 vs Turbopack 정적 분석 한계인지 판단하려면 정확한 워닝 텍스트 필요.

`scripts/wsl-build-deploy.sh`는 stderr 캡처를 안 함 → 다음 빌드에서 텍스트를 캡처하도록 `2>&1 | tee logs/build-$(date +%Y%m%d-%H%M%S).log` 선행 작업 필요.

**결론**: 추측 패치 위험 큼 → 보류, 다음 세션 시 빌드 로그 캡처 후 재진입.

### 토픽 4: 블로킹 5건 사유 문서화

| # | 항목 | 사유 |
|---|------|------|
| C | DATABASE_URL 패스워드 rotation | 파괴적 (ENV 동기화 + 다운타임 가능), 명시 승인 필요 |
| E | Windows 재부팅 자동복구 실증 | 물리적 재부팅 필요, 다음 정기 재부팅 시점 |
| 6-E | `_test_session` 테이블 DROP | DB 파괴, 명시 승인 필요 |
| 6-F | MFA biometric QA 8 시나리오 | WebAuthn 디바이스 인터랙션 필수 |
| 6-G | SP-013 wal2json / SP-016 SeaweedFS | 인프라/용량 의존, 별도 트랙 |

**결론**: next-dev-prompt.md "알려진 이슈" 섹션에 "세션 54 신규" 블록으로 기록.

### 토픽 5: 검증 + 마감

```bash
npx tsc --noEmit -p tsconfig.json   # 0 errors (출력 없음)
npx vitest run src/lib/cleanup-scheduler.test.ts   # 13/13 PASS, 835ms
```

기존 테스트는 catch 블록 동작을 다루지 않아 회귀 위험 0. 빌드/배포는 보류 — 패치를 prod 반영하려면 `bash scripts/wsl-build-deploy.sh` 1회 실행 필요(비파괴이지만 PM2 reload).

> **사용자**: "/cs"

**결론**: 4단계 세션 종료 + CK +1.

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|-------------|-----------|
| 1 | audit catch 블록 진단 패치 즉시 적용 (격리 유지 + err 노출) | (a) 패치 없이 24h 재현 대기 (b) 격리 제거하고 throw로 전파 (c) 별도 audit failure 모니터링 추가 | (a)는 검증 비용 비대칭으로 비합리적, (b)는 cleanup 루프 안정성 손상, (c)는 오버엔지니어링. 한 줄 패치로 진단성 회복이 ROI 최대. |
| 2 | Turbopack 워닝 진행 보류 | (a) 추측 패치 (`config.runtime` 명시 등) | 정확한 워닝 텍스트 없이 패치 시 진짜 원인 누락 가능. wsl-build-deploy.sh에 로그 캡처 선행이 정공법. |
| 3 | 다른 터미널 변경 2건 분리 보존 | (a) 본 세션 변경과 함께 단일 커밋 | 세션 53 §보완 산출물(handover §보완 / current.md 53행 / 2026-04.md / CK-37)이라 세션 54와 의미가 다름 — 같은 커밋에 묶으면 메시지 모호. 분리 또는 세션 53 §보완 + 세션 54 cs를 단일 "세션 마감" 커밋으로 묶는 게 합리적. **최종**: 단일 commit 채택 (세션 53 §보완 + 세션 54 마감 동시 흡수, 메시지에 양쪽 명시). |
| 4 | ELF 가설 부분 기각 | (a) 가설 수용 후 패치만 적용 (b) 완전 기각 | 다른 터미널 결론을 부정하는 게 아니라 "ELF는 단일 원인 아니며 별도 silent failure 가능성 잔존"으로 정정 — 내일 검증 결과로 확정. |

## 수정 파일 (2개 + 5 cs 산출물)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/cleanup-scheduler.ts` | catch 블록 2곳에 err 바인딩 추가 + `{ message, stack }` 구조화 노출 (격리 의도 유지) |
| 2 | `docs/handover/next-dev-prompt.md` | "알려진 이슈" 섹션에 "세션 54 신규" 블록 추가 (audit 패치 + 5 블로킹 사유 + 부 항목 보류 사유) |
| cs | `docs/handover/260425-session54-audit-silent-failure-diagnostic.md` (본 파일) | 세션 54 인수인계서 |
| cs | `docs/solutions/2026-04-25-cleanup-scheduler-audit-silent-failure.md` | CK +1 (37→38, pattern/high) |
| cs | `docs/logs/2026-04.md` | 세션 54 상세 기록 append |
| cs | `docs/logs/journal-2026-04-25.md` | 세션 54 토픽 5건 append |
| cs | `docs/status/current.md` | 세션 54행 추가 |
| cs | `docs/handover/_index.md` | 세션 54 링크 |

## 상세 변경 사항

### 1. cleanup-scheduler.ts — 진단 가능성 회복

**Before** (line 80-92, 142-156):
```ts
try { writeAuditLogDb({ ... }); } catch {
  console.warn("[cleanup-scheduler] SESSION_EXPIRE audit write failed", entry.id);
}
try { writeAuditLogDb({ ... }); } catch {
  console.warn("[cleanup-scheduler] audit log write failed", summary);
}
```

**After**:
```ts
try { writeAuditLogDb({ ... }); } catch (err) {
  console.warn("[cleanup-scheduler] SESSION_EXPIRE audit write failed",
    { entryId: entry.id, error: err instanceof Error ? { message: err.message, stack: err.stack } : err });
}
try { writeAuditLogDb({ ... }); } catch (err) {
  console.warn("[cleanup-scheduler] audit log write failed",
    { summary, action, error: err instanceof Error ? { message: err.message, stack: err.stack } : err });
}
```

설계 의도(주석 갱신): "audit 실패가 cleanup 루프를 끊지 않도록 catch. 단, 에러 객체를 로그에 노출하여 silent failure 진단 가능성을 보장(세션 54)."

### 2. next-dev-prompt.md — 세션 54 신규 블록

"알려진 이슈 및 주의사항" 섹션 최상단에 추가:
- audit log silent failure 진단 패치 적용 사실 + 다른 터미널 ELF 가설 부분 기각 근거
- 블로킹 5건 (C/E/6-E/6-F/6-G) 명시적 사유
- 부 항목(Turbopack 워닝) 보류 사유 + 선행 작업(빌드 로그 캡처)

### 3. CK +1 (37→38) — silent failure 격리 패턴 표준화

`docs/solutions/2026-04-25-cleanup-scheduler-audit-silent-failure.md` (pattern/high):
- `catch {}` vs `catch (err)` 진단성 차이 (1bit vs 다차원)
- 격리 패턴 표준 형식 + `errToJson(err)` 헬퍼 권장
- silent-failure-hunter 적용 영역 (미들웨어 / cron / 이벤트 핸들러 / SSE 클린업)
- 검증 비용 비대칭 원리

## 검증 결과

| 검증 | 결과 |
|------|------|
| `npx tsc --noEmit` | 0 errors (출력 없음) |
| `npx vitest run src/lib/cleanup-scheduler.test.ts` | 13/13 PASS, 835ms |
| 빌드 / 배포 | 보류 (패치 prod 반영하려면 `wsl-build-deploy.sh` 1회 — 비파괴이지만 PM2 reload 발생) |
| 테스트 커버리지 | 기존 테스트는 catch 블록 미커버 → 회귀 위험 0. 향후 catch 동작 테스트 추가 가능 (vitest mock console.warn으로). |

## 터치하지 않은 영역

- **prod 배포**: 패치를 prod 반영하려면 `bash scripts/wsl-build-deploy.sh` 1회 실행 필요. 트래픽 한산 시점 권장 (비파괴이지만 PM2 reload 600ms 갭).
- **Turbopack instrumentation.ts 워닝**: 정확한 워닝 텍스트 미캡처 상태에서 추측 패치 회피.
- **C / 6-E**: 파괴적 작업, 명시 승인 필요.
- **E / 6-F / 6-G**: 시간/디바이스/인프라 의존.
- **다른 터미널 변경 흡수 방식**: 세션 53 §보완 산출물(uncommitted)을 본 세션 cs 커밋에 함께 흡수 (단일 커밋 메시지에 양쪽 명시).

## 알려진 이슈

- **audit log write failed 진짜 원인은 내일 03:00 KST 후 검증 대기**. 패치가 적용된 prod 빌드에서 재발하면 이번엔 `error.message`·`error.stack`이 PM2 로그에 노출되어 즉시 진단 가능.
- **prod에 패치 미반영 상태**: 현재 prod의 `~/ypserver/.next/server/...`는 commit `1ad026f` 빌드 산출물. 본 세션 패치가 반영되려면 cs 커밋 후 `wsl-build-deploy.sh` 1회 실행 필요.

## 다음 작업 제안

### 우선순위 0 (즉시)
1. **2026-04-26 03:00 KST 직후 PM2 로그 확인** — `pm2 logs ypserver --lines 50 --nostream | grep -A 5 "audit log write failed"`. 단, 본 패치가 prod 반영된 빌드여야 의미 있음 → cs 커밋 후 `wsl-build-deploy.sh` 1회 선행 권장.
2. **wsl-build-deploy.sh 로그 캡처 추가** — `2>&1 | tee logs/build-$(date +%Y%m%d-%H%M%S).log`로 빌드 stderr 영구 보존. Turbopack 워닝 텍스트 캡처가 부 항목의 선행 작업.

### 우선순위 1 (이번 주)
3. **Turbopack instrumentation.ts 워닝 처리** — 위 #2 후 캡처된 텍스트로 진짜 cosmetic vs 구조적 문제 판단 후 패치.
4. **`_test_session` 테이블 drop 사용자 승인 + 실행** (S49 이월).
5. **DATABASE_URL 패스워드 rotation** (S52 이월).
6. **브라우저 E2E CSRF 풀 플로우 검증** (S52 이월).

### 우선순위 2 (이월 — 환경/생체 의존)
7. MFA biometric QA 8 시나리오 (`docs/guides/mfa-browser-manual-qa.md`)
8. SP-013 wal2json + SP-016 SeaweedFS 50GB 물리 측정
9. Windows 재부팅 자동복구 실증

### 디버깅 후속 (audit 가설 검증 결과별 분기)
- **재발 안 함** → ELF mismatch + WSL 재배포 + 본 패치 흡수가 모두 작용. 격리 패턴이 충분히 견고함이 입증.
- **재발 + 진짜 silent 영역 발견** → silent-failure-hunter로 `src/lib/audit-log-db.ts writeAuditLogDb` 비-throw 실패 경로 재조사 (drizzle .run() 반환의 에러 비전파, transaction commit 실패 등).

---

**참조**:
- 저널: [docs/logs/journal-2026-04-25.md](../logs/journal-2026-04-25.md) §세션 54
- CK: [2026-04-25-cleanup-scheduler-audit-silent-failure.md](../solutions/2026-04-25-cleanup-scheduler-audit-silent-failure.md)

---
[← handover/_index.md](./_index.md)
