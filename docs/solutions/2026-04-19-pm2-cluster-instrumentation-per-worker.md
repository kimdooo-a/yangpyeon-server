---
title: PM2 cluster 모드 instrumentation 은 worker 별 독립 실행 — singleton 코드는 fork 분리 필수
date: 2026-04-19
session: 47
tags: [pm2, cluster, instrumentation, scheduler, nodejs, singleton, next.js]
category: pattern
confidence: high
---

## 문제

Next.js + PM2 서비스를 fork 모드 (instances: 1) 에서 cluster 모드 (instances: 4) 로 전환할 때, 다음과 같은 "시스템 전체에서 1회만 실행되어야 하는" 코드가 조용히 **worker 수 만큼 중복 실행**된다:

- `src/instrumentation.ts` 의 `ensureCleanupScheduler()` (KST 03:00 cleanup tick)
- `globalThis.__cleanupScheduler` 가드 패턴
- 유사한 cron / background worker / rate-limit leader / webhook dispatcher / canary-router

증상은 두 가지로 나타난다:

1. **조용한 중복 DML**: cleanup job 이 4번 실행되어 4× DELETE 시도, 첫 실행만 성공하고 나머지 3개는 0 rows affected (처럼 보이나, race window 에서 lost update 가능)
2. **audit 로그 중복**: `CLEANUP_EXECUTED` 이벤트가 4건 동시 기록되어 "왜 같은 시각에 4번 돌았지?" 조사 유발

## 원인

PM2 cluster 모드는 Node.js `cluster` 모듈 래퍼로, 동일 스크립트를 **여러 독립 Node 프로세스**로 spawn 한다 (포트 공유는 master 의 TCP socket 상속). 각 worker 는:

- **자체 V8 heap** 을 가짐 → `globalThis` 는 worker 별 독립 (`globalThis.__X = ...` 는 worker 내부에서만 유효)
- **자체 instrumentation 실행** → Next.js 의 `src/instrumentation.ts` 는 각 worker startup 시 1회씩 호출됨
- 결과: 4 worker = 4× 초기화

SP-019 스파이크 실측 (2026-04-19, PM2 6.0.14 + Node v24.14.1 + WSL2):

```
{"worker":0,"type":"instrumentation_init","id":"scheduler-w0-1776599004033"}
{"worker":1,"type":"instrumentation_init","id":"scheduler-w1-1776599004042"}
{"worker":2,"type":"instrumentation_init","id":"scheduler-w2-1776599004047"}
{"worker":3,"type":"instrumentation_init","id":"scheduler-w3-1776599004071"}
```

4 worker 가 **40ms 범위 내에 각자 scheduler 를 init**. `globalThis.__spike019Scheduler` 가드는 worker 내부에서는 유효하나 cross-worker 로는 무력.

Node.js `cluster` 모듈 문서가 명시하는 것과 동일한 동작 — 하지만 PM2 의 추상화 때문에 "magic 하게 공유된다" 고 오해하기 쉬움. 특히 `fork` → `cluster` 전환 시 단 instances 수만 변경하므로 이 차이가 눈에 띄지 않음.

## 해결

### 패턴 A — Scheduler 류를 별도 fork 프로세스로 분리 (권장)

PM2 ecosystem.config.js 에서 **3 앱 구조** 채택:

```
- dashboard         : exec_mode=cluster, instances=4   → HTTP 요청 처리 전용
- dashboard-canary  : exec_mode=cluster, instances=1   → canary 배포 전용 (선택)
- cleanup-scheduler : exec_mode=fork,    instances=1   → singleton 백그라운드 작업
```

`instrumentation.ts` 에서 `ensureCleanupScheduler()` 를 **환경변수 또는 app name 분기**로 호출:

```ts
// src/instrumentation.ts
if (process.env.PM2_APP_NAME === 'cleanup-scheduler' || !process.env.NODE_APP_INSTANCE) {
  await ensureCleanupScheduler();
}
```

dashboard cluster 워커들은 scheduler 를 등록하지 않고, fork 앱만 등록. HTTP 처리 부하와 분리되어 CPU/메모리도 예측 가능해짐.

### 패턴 B — DB advisory_lock 기반 leader election (단일 앱 내 다중 worker)

fork 분리 없이 cluster 내부에서 "아무 worker 하나만 실행" 을 보장해야 한다면 PG advisory lock 활용:

```ts
async function runWithLeaderLock(lockId: number, task: () => Promise<void>) {
  const result = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${lockId}) AS locked
  `;
  if (!result[0]?.locked) return; // 다른 worker 가 이미 리더
  try {
    await task();
  } finally {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(${lockId})`;
  }
}
```

- `lockId` 는 task 별 고유 정수 (예: cleanup=1001, canary-router=1002)
- PG 세션 종료 시 자동 해제되므로 worker crash 내성 있음
- 단점: 매 tick 마다 PG 조회 필요, fork 분리보다 복잡

### 패턴 C — Redis/etcd leader election

다중 노드로 확장된 경우 (Phase 16 범위 초과). `ioredis-lock` 또는 `etcd3 lease` 사용.

## 교훈

1. **`instances: 4` 는 "내부 구현 디테일" 이 아니다** — 스케줄러/cron/leader 보유 코드의 invariant 를 직접적으로 깬다. fork → cluster 전환은 reviewers 가 "앱 로직 중 singleton 요구가 있는가?" 를 명시적으로 질문해야 함.
2. **`globalThis.__X` 가드는 worker 내부 스코프만 보호** — cross-worker 조정이 필요한 모든 상태는 PG/Redis/SQLite(WAL + 단일 writer 파일 잠금) 같은 외부 consensus store 로 내보내야 함.
3. **가장 간단한 해결은 패턴 A (fork 분리)** — 아키텍처 복잡도 증가 없이 singleton 을 보장. PM2 ecosystem 3 앱 구조는 해당 프로젝트의 Phase 16c 설계 표준으로 확정 (세션 50 Task 50-1).
4. **SP-019 스파이크 선행의 가치** — 이 패턴을 S48 이후 구현 단계에서 발견했다면 "왜 cleanup 이 4번 돌지?" 디버깅에 최소 2~3 세션 소모 가능 (세션 40~44 TIMESTAMPTZ 드리프트 경험과 동일 함정). 사전 스파이크 6h 투자로 해당 리스크 사전 차단.

## 관련 파일

- `spikes/sp-019-pm2-cluster/write-contention-test.js` — instrumentation duplicate 검증 실험
- `spikes/sp-019-pm2-cluster/README.md` — SP-019 Conditional GO 결정 및 3가지 패턴 비교
- `src/instrumentation.ts` — 현재 fork 모드 가드 `globalThis.__cleanupScheduler` (세션 35 도입)
- `src/lib/cleanup-scheduler.ts` — 이동 대상, Phase 16c Task 50-1 에서 별도 fork 앱으로 분리
- `docs/superpowers/plans/2026-04-19-phase-16-plan.md §"세션 50: 16c PM2 cluster:4 + Canary"` Task 50-1
- `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md` ADR-015 PM2 cluster:4 (보완 대기)
