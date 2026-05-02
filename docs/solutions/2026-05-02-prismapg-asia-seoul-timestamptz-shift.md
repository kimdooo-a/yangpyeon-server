---
title: PrismaPg adapter + Asia/Seoul session timezone — TIMESTAMPTZ +9hr 시프트 함정
date: 2026-05-02
session: 82
tags: [prisma, prismapg, postgres, timezone, timestamptz, asia-seoul, kst]
category: workaround
confidence: medium
---

## 문제

WSL postgres session timezone 이 `Asia/Seoul` 인 환경에서 PrismaPg adapter 가 TIMESTAMPTZ 컬럼을 read 할 때, 실제 UTC 값에 **+9 시간 시프트** 가 발생한다.

증상:
- pg driver (raw `Pool.query`): `created_at` = `2026-05-02T01:25:55.248Z` (UTC, 정확)
- Prisma `findUnique({...}).createdAt`: `2026-05-02T10:25:55.248Z` (UTC label 이지만 실제로 +9hr 시프트된 epoch)

JS Date `getTime()` 비교:
- 원본 ms: `1777685155248`
- Prisma 읽기 ms: `1777717555248` (+32,400,000 ms = 9hr)

영향: 시간 기반 로직이 잘못된 결과 반환:
- `editMessage` 의 15분 윈도우 — 항상 미래(+9hr)로 보여 EDIT_WINDOW_EXPIRED throw 안 함
- `recallMessage` 의 24h 윈도우 — 동일
- rate-limit window, session expiry, cron schedule 등

## 원인

WSL postgres `SHOW TimeZone` = `Asia/Seoul`. PrismaPg adapter 는 TIMESTAMPTZ 의 `+09` offset 정보를 ignore 하고 local 시각 표현을 UTC 로 mis-parse하는 것으로 추정 (Prisma 7.7.0 시점, 정확한 root cause 는 adapter 내부 코드 분석 필요).

prod 환경에서 가시화되지 않는 이유:
- prod 도 동일 시프트 적용 (read/write 양방향 모두 +9hr) → cancel 되어 같은 epoch 비교는 정확
- 그러나 **외부 source (raw pg driver, REST API timestamp, cron tick, JS `Date.now()`) 와 비교 시 9hr divergence**

본 세션에서 발견한 경로:
- admin pool (raw pg) 가 `createdAt = past Date` 로 INSERT (UTC 정확 저장)
- Prisma 가 read → +9hr 시프트
- `Date.now() - msg.createdAt.getTime()` 이 음수 값 → window check 실패

## 해결

**테스트 환경 (격리 회피)**: connection string 에 `?options=-c%20TimeZone%3DUTC` 추가:

```bash
RLS_TEST_DATABASE_URL=postgresql://app_test_runtime:<pwd>@localhost:5432/luckystyle4u_test?options=-c%20TimeZone%3DUTC
```

검증 결과: Prisma 가 TIMESTAMPTZ 를 정확한 UTC 로 read.

**prod 환경 (follow-up 별도 필요)**:
- read/write 양방향 cancel 로 가려져 있으나, 외부 timestamp 비교 / cron schedule 계산 / rate-limit window 등에 잠재 영향 가능
- audit 대상:
  - `Date.now() - msg.createdAt.getTime()` 패턴 전수
  - Cron `nextRunAt` 비교
  - Session expiry (`refreshTokenExpiresAt`)
  - external API timestamp 파싱 (예: rss-fetcher 의 publishedAt)
  - rate-limit bucket window (`updatedAt`)
- 해결 옵션:
  - (a) `~/ypserver/.env` 의 prod DATABASE_URL 에 `?options=-c TimeZone=UTC` 추가 — 안전, 이미 read/write 일관 cancel 패턴 있는 코드는 영향 없음
  - (b) Prisma adapter 패치 또는 업그레이드 대기
  - (c) 모든 timestamp 비교를 raw SQL 로 (`WHERE created_at + INTERVAL '15 minutes' < NOW()`) — 코드 회피

## 교훈

- **Postgres session timezone 이 KST 일 때 PrismaPg adapter 의 TIMESTAMPTZ 파싱이 깨진다** — 본 환경 (WSL Ubuntu 24.04 + postgres 16.13 + @prisma/client 7.7.0 + @prisma/adapter-pg) 에서 결정적 재현.
- 양방향 동시 시프트로 가려져 있는 버그는 **외부 source 와 비교하는 첫 시도** 에서 노출된다. 테스트 인프라 (admin pool + Prisma 혼용) 가 이 노출 경로.
- prod DATABASE_URL 의 `TimeZone=UTC` 강제는 **안전한 보강** — 자체 cancel 패턴은 그대로 동작, 외부 비교는 정확해진다.
- 향후 PrismaPg 또는 pg-types 업그레이드 시 본 동작 변경 가능 — vitest run 으로 자동 회귀 감지 가능 (S82 인프라).

## 관련 파일

- `scripts/run-integration-tests.sh` — `?options=-c%20TimeZone%3DUTC` 강제 (테스트 환경)
- `tests/messenger/messages.test.ts` — editMessage/recallMessage 시간 기반 회귀 테스트
- `~/ypserver/.env` (prod, follow-up 대상) — `DATABASE_URL` 에 동일 옵션 추가 검토
- commit `8bef896 fix(messenger,db): M2 통합 테스트 32 라이브 PASS — Prisma extension + RLS 함정 4건 동시 fix`
- 자매 함정: `2026-05-02-prisma-extension-tx-connection-escape.md` — 같은 세션 동시 발견
