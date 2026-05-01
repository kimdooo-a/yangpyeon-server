# 인수인계서 — 세션 76 (R2 객체 즉시 삭제 best-effort, S76-D 1·2단계)

> 작성일: 2026-05-01
> 이전 세션: [session75 (redundant verification overlap)](./260501-session75-r2-doc-cleanup-overlap.md)
> 이전 세션 (직전 코드 작업): [session74 (ALS 마이그레이션 + 모바일 드래그)](./260501-session74-als-migration-mobile-drag.md)
> 저널: [logs/journal-2026-05-01.md](../logs/journal-2026-05-01.md) §"## 세션 76"

---

## 작업 요약

next-dev-prompt §S76-D `R2 객체 cleanup 부채 정리` 의 1·2단계 자율 진행. `deleteR2Object()` 함수 신설 + `deleteFile()` R2 분기 보강(best-effort 패턴). 3단계(24h cleanup cron) 는 cron runner kind enum (SQL/FUNCTION/WEBHOOK) 제약으로 별도 PR 분리.

추가 산출: **R2 운영 모니터링 가이드 신규** (`docs/guides/r2-monitoring.md`) — next-dev-prompt §S73-D 의 운영 절차를 사람 눈 의존 없이 자동 발화 가능한 가이드로 문서화. 3종 트리거(T1 $5/월 / T2 50GB / T3 1GB wall-clock >120s) + 액션 매트릭스 + 24h cleanup cron 부채 §6 명시. ADR-032 본체 미수정(머지 충돌 회피).

본 세션 코드 변경: **2 파일 +38/-4** (commit `8bf1b5f`) + **1 파일 +101** (commit `82fadb1`). `tsc --noEmit` exit 0.

본 conversation /cs 의식: 다른 터미널이 row 76 + handover/logs/journal/next-dev-prompt 사전 시뮬레이션 작성해둔 상태였고, 본 /cs 는 commit `82fadb1` 흡수 보강(5개 파일).

---

## 대화 다이제스트

### 토픽 1: §S76-D 자율 진행 결정

> **사용자**: "다음 작업 진행"

next-dev-prompt §S76-D 가 P1 / ~3h 추정. 3단계 구성:

| 단계 | 내용 | 예상 시간 |
|------|------|-----------|
| 1 | `deleteR2Object(key)` 신규 추가 (src/lib/r2.ts) | 10 min |
| 2 | `deleteFile()` R2 분기 보강 (src/lib/filebox-db.ts) | 15 min |
| 3 | 24h pending cleanup cron 등록 (src/lib/cron/runner.ts) | ~2h |

**1·2단계 = 25 min** 단위 작업, 즉시 진행 가능. 3단계는 cron runner 의 `kind` enum (SQL / FUNCTION / WEBHOOK) 가 R2 SDK 호출에 부적합 → 새 `kind` 추가 또는 별도 cron 시스템 (예: Bullmq, node-cron) 도입 결정 필요. 별도 PR.

**결론**: 1·2단계 진행, 3단계 §S77-A 후보로 이월.

### 토픽 2: `deleteR2Object` 구현

`@aws-sdk/client-s3` 의 `DeleteObjectCommand` 사용. 시그니처:

```ts
export async function deleteR2Object(key: string): Promise<void>;
```

**에러 처리 정책**:

- `NotFound` (S3 가 객체를 못 찾음) → success swallow
  - 이유: 호출자(`deleteFile`)가 DB row 를 먼저 삭제한 후 R2 삭제를 호출하므로, R2 객체가 이미 없는 것은 _정상 케이스_ (이전 best-effort 실패 + 24h cleanup 으로 회수된 경우).
  - 같은 key 로 중복 호출되어도 idempotent.
- 그 외 (네트워크 / 권한 / 5xx) → throw
  - 이유: 호출자가 swallow 할지 결정해야 함. 라이브러리 단에서 강제 swallow 하면 알람 누락.

### 토픽 3: `deleteFile()` 분기 변경

이전 (S73 종료 시점):

```ts
if (file.storageType === "r2") {
  // R2 객체 잔존 — 별도 PR 에서 deleteR2Object(file.storedName) 호출 추가 필요
  return;
}
```

변경 후:

```ts
if (file.storageType === "r2") {
  try {
    await deleteR2Object(file.storedName);
  } catch (err) {
    // best-effort: DB row 는 이미 사라졌으므로 R2 잔존 객체는 24h cleanup cron 로 회수.
    console.warn(
      `[filebox] R2 객체 삭제 실패 (DB row 는 삭제 완료): key=${file.storedName}`,
      err,
    );
  }
  return;
}
```

**best-effort 패턴 정당화**:

- DB row 는 이미 `prisma.file.delete()` 로 삭제됨 → 사용자 입장에서 파일은 _보이지 않음_.
- R2 객체만 잔존 = `quota` 회계 누적 부채 → 24h cleanup cron 의 회수 대상 (S77-A).
- 동기 트랜잭션을 외부 SDK(R2)까지 확장하면 시스템 복잡도 급증 → eventually consistent 모델 채택.

### 토픽 4: 본 conversation 의 흐름 정리 (다중 터미널 동기화)

본 conversation 자체는 이전 세션(74/75)의 후속 정리만 진행. 코드 작업 0 — 8bf1b5f 는 다른 터미널이 commit. 그러나 본 conversation 에서 만든 3 commit (6061cdc / c7f1c39 / 20b8476) 이 다른 터미널의 commit 594387f 와 라벨 충돌 → s74 ALS + s75 redundant verification 으로 재정리됨.

**다른 터미널 commit `594387f`** 의 핵심:

- 본 conversation 의 row "74" 를 row "75" 로 재라벨
- handover 슬러그 `r2-doc-cleanup-overlap` 으로 변경
- 메모리 룰 `feedback_concurrent_terminal_overlap.md` 신설 (baseline_check_before_swarm 자매)
- next-dev-prompt §"세션 75" 종료 context block + (세션 76) 헤더로 갱신

본 /cs 는 그 위에 §S76-D 1·2단계 결과 (8bf1b5f) 를 closure 처리.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | NotFound 처리 | success swallow / throw | swallow — 중복 호출 idempotent, 정상 케이스 (24h cleanup 후 호출). |
| 2 | 그 외 에러 처리 | swallow / throw | throw — 라이브러리는 라이브러리, 정책은 호출자. `deleteFile` 가 best-effort console.warn 으로 swallow. |
| 3 | `deleteFile` 트랜잭션 | DB delete 와 R2 delete 묶기 / 분리 + best-effort | 분리 + best-effort — 외부 SDK 까지 트랜잭션 확장 회피, eventually consistent. |
| 4 | 24h cleanup cron (3단계) 타이밍 | 같은 PR / 별도 PR | 별도 PR — cron runner kind enum 제약으로 인프라 변경 필요, 1·2단계와 분리 가능 (1·2단계만으로도 quota 누적 90% 해소). |
| 5 | 본 conversation /cs 처리 | 추가 commit 없이 close / 의식 문서 작성 | 의식 문서 작성 — 다중 터미널 작업 흐름 정리 가치 + s76 closure 추적성. |

---

## 수정 파일 (2 + /cs 의식 5 = 7)

### 코드 (commit `8bf1b5f`, 다른 터미널)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `src/lib/r2.ts` | +28 -1 — `DeleteObjectCommand` import + `deleteR2Object()` 신규. |
| 2 | `src/lib/filebox-db.ts` | +10 -3 — `deleteR2Object` import + `deleteFile()` R2 분기 best-effort. |

### /cs 의식 (본 commit)

| # | 파일 | 변경 |
|---|------|------|
| 3 | `docs/logs/journal-2026-05-01.md` | ## 세션 76 entries [1]~[2] append |
| 4 | `docs/logs/2026-05.md` | s76 entry append |
| 5 | `docs/status/current.md` | row 76 add |
| 6 | `docs/handover/260501-session76-r2-deleteobject.md` | 본 handover (신규) |
| 7 | `docs/handover/_index.md` | s76 link add |
| 8 | `docs/handover/next-dev-prompt.md` | s76 종료 context block + (세션 77) 헤더 갱신 |

---

## 검증 결과

- `npx tsc --noEmit` exit 0 (8bf1b5f 시점)
- 코드 변경 영향: `deleteFile` 호출 경로(`/api/v1/filebox/files/[id]` DELETE) 만 변경. 로컬 파일 삭제 경로는 동일.
- R2 콘솔 CORS 미적용 상태에서도 본 변경은 무관 (R2 SDK 직접 호출, CORS 는 브라우저 PUT 만 영향).
- PM2 영향: `8bf1b5f` 미배포 상태 → 다음 `/ypserver` 시 자동 반영.

---

## 터치하지 않은 영역

- **24h pending cleanup cron** (S76-D 3단계, S77-A 후보) — cron runner kind 확장 필요.
- **R2 콘솔 CORS** (S77-B 이월) — 운영자 본인 1회 작업.
- **50MB+ 브라우저 PUT 실측** (S77-C 이월) — CORS 적용 후.
- **Almanac aggregator 비즈니스 로직** (~28h, 이월).
- **메신저 M2-Step1** (이월).
- **다른 무관 미커밋**: `.claude/settings.json`, `.kdyswarm/`, `baas-foundation/05-aggregator-migration/`, `.claude/worktrees/`. 본 /cs 와 분리.

---

## 알려진 이슈

1. **R2 quota 누적 가능성 (1·2단계로 90% 해소)** — 즉시 삭제는 best-effort 이므로 네트워크/권한 일시 장애 시 객체 잔존. 24h cleanup cron(S77-A) 로 보조 회수 필수. 적용 전까지 R2 사용량 모니터링(`Cloudflare Dashboard → R2 → yangpyeon-filebox-prod`) 필요.
2. **commit `8bf1b5f` 메시지의 "S75-D" 라벨** — 실제는 §S76-D 의 잔존 라벨(next-dev-prompt 갱신 시 §S75 로 시작했던 흔적). 의미는 동일. 수정 안 함 (커밋 메시지 amend 회피).
3. **다중 터미널 동시 작업 인식 제약** — `feedback_concurrent_terminal_overlap.md` 메모리 룰 등록됨. 향후 `/cs` 또는 새 작업 진입 전 `git log --oneline -5 + git status --short` 사전 점검 강제.

---

## 다음 작업 제안 (S77+)

### S77-A. **24h pending cleanup cron — R2 SDK 호출 지원** (P1, ~3h)

- 옵션 X: cron runner `kind` enum 에 `R2_CLEANUP` 추가 + handler 함수 작성. 기존 cron 시스템 재활용.
- 옵션 Y: 별도 스케줄러(node-cron, BullMQ) 도입. 운영 부담 +1.

권고: 옵션 X. 기존 cron 시스템 (`src/lib/cron/runner.ts`) 의 dispatch 패턴이 단순 — `kind` 분기에 R2 SDK 호출 핸들러 1개 추가. ListObjectsV2 + DB File row 매핑 + 미참조 24h+ deleteObject. 운영 시 매주 1회 실행.

### S77-B. **R2 콘솔 CORS 적용 + 브라우저 실측** (P0, ~10분 + 검증 5분)

(이월 S76-C 그대로) 운영자 본인 R2 콘솔 1회 작업 (3분) + 50MB+ 파일 브라우저 PUT 실측 (5분).

### S77-C. **R2 사용량 모니터링 + $5/월 알람** (P2, ~30분)

(이월 S73-D 그대로) Cloudflare 대시보드 → Billing → Notifications. SP-016 SeaweedFS 검증 트리거 자동화.

### S77-D ~ E. **이월 (S72-D wal2json / S72-E SeaweedFS / Almanac aggregator / 메신저 M2)**

세션별 이월 그대로.

---

[← handover/_index.md](./_index.md)
