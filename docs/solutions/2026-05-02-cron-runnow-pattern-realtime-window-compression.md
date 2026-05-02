---
title: cron schedule 자연 tick 의 의미적 동등 = registry.runNow force-run (실시간 윈도우 압축 패턴)
date: 2026-05-02
session: 81
tags: [cron, observation-window, debugging, e2e-validation, time-compression, aggregator]
category: pattern
confidence: high
---

## 문제

신규 cron 모듈 (`AGGREGATOR` dispatch, 4 fetcher + classify + promote) 을 production 배포한 직후, `enabled=TRUE` 로 활성화는 했으나 cron schedule 이 "every 6h" / "every 30m" 이라 다음 자연 tick 까지 결정적 회귀 검증이 불가능. 24h 관찰 윈도우는 wave plan 에 명시된 "세션 85" 의 책임.

문제: **사용자가 "B7+B8 동일 세션 압축" 을 요청했고, 자연 tick 대기는 압축 불가능. 그러나 활성화만 하고 검증 없이 종료하면 회귀 시 24h 후에야 발견됨.**

## 원인

cron tick 의 본질 = "스케줄 만료 + circuit CLOSED + lock 획득" 3 조건 동시 만족. 그러나 "결정적 회귀 검증" 의 본질은 **"코드가 데이터를 정확히 처리하는가"** 이지 **"스케줄러가 제 시간에 작동하는가"** 가 아님. 이 둘은 분리 가능.

스케줄러 자체의 신뢰성은 tick 한 번 작동 = 일반화 가능 (스케줄러 = 시스템 컴포넌트, deterministic). 도메인 로직 회귀는 tick 마다 = 검증 필요 (도메인 = 데이터 의존, non-deterministic).

## 해결

**registry.runNow(jobId) force-run** — 스케줄/circuit/lock 모두 무시하고 dispatchCron 을 즉시 1회 실행. 운영 콘솔의 "수동 실행" 버튼이 사용하는 동일 진입점.

```ts
// scripts/b8-runnow.ts
import { prisma } from "@/lib/prisma";
import { runNow } from "@/lib/cron/registry";

const job = await prisma.cronJob.findFirst({
  where: { tenantId: t.id, name: jobName },
  select: { id: true },
});
const result = await runNow(job.id);  // dispatchCron 즉시 호출
console.log(`${result.status} — ${result.message}`);
```

production 사이클 라이브 검증 (S81):
```
runNow almanac-rss-fetch  SUCCESS (13s)  — 60 INSERT, 1 err 격리
runNow almanac-classify   SUCCESS (237ms) — 50 classified
runNow almanac-promote    SUCCESS (303ms) — 50 → content_items
→ items=50 (첫 production 카드 가시화)
```

**전체 파이프라인 회귀 검증을 30초 안에 완료**. 24h 윈도우는 자연 tick 의 cumulative behavior (60 → 24h 후 240+ 등) 검증을 위해 별도 유지.

## 교훈

1. **자연 tick 의 의미적 동등은 force-run** — "윈도우 종료까지 대기" 가 본질이 아니라 "도메인 로직이 정확한가" 가 본질. 스케줄러는 시스템 컴포넌트로 분리.
2. **외부 장애 격리는 첫 force-run 에서 자연 노출됨** — anthropic-news 404 가 첫 runNow 에서 표면화 → consecutiveFailures=1, 다른 4 소스 차단 0. ADR-022 §3 "한 컨슈머 실패 격리" 첫 production 실증.
3. **"24h 압축 불가" 와 "코드 회귀 검증 압축 가능" 분리** — 사용자 요청 "B7+B8 단일 세션" 에 대해 "B8 24h 관찰은 실시간 압축 불가" 는 사실이지만, "B8 활성화 직후 코드 회귀 검증" 은 force-run 으로 압축 가능. 두 차원을 합치면 "B8 압축 불가" 결론, 분리하면 "B8-1 (활성화 + force-run 회귀 검증) 즉시 가능 + B8-2 (24h 누적 검증) 별도" 구조.
4. **runNow 패턴은 모든 cron 도메인에 일반화** — aggregator, multipart cleanup, audit GC, R2 cleanup 등 모든 cron 의 첫 production 배포 시 "활성화 → force-run → 검증" 표준 시퀀스로 사용.

## 관련 파일

- `scripts/b8-runnow.ts` — 본 패턴의 표준 구현
- `src/lib/cron/registry.ts:319` — runNow 정의 (ADMIN 수동 실행, schedule/circuit/lock 무시)
- `src/lib/cron/runner.ts:194` — dispatchCron entrypoint
- `docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md` §6 T8/T9 — 24h 관찰 vs 코드 회귀 분리 근거
- handover/260502-session81-aggregator-launch-messenger-m2-m3.md §"토픽 3" — 라이브 검증 결과
