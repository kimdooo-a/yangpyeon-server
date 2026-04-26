---
title: Incremental monorepo — workspace 인프라와 src 이동 분리
date: 2026-04-26
session: 59
tags: [monorepo, pnpm, turborepo, refactor, deployment-safety, staged-migration]
category: pattern
confidence: high
---

## 문제

Phase 0.2 모노레포 변환은 sprint plan §0.2 에 따르면 다음을 한 번에 수행해야 한다 (6h 추정):
1. `pnpm-workspace.yaml` + `turbo.json` 작성
2. `apps/web/`로 src/, public/, app/ 등 **이동**
3. `packages/core/` 골격 생성

그러나 (2)는 다음 영향:
- `scripts/pack-standalone.sh` Line 17: `SRC=$ROOT/.next/standalone` — 현 루트 구조 가정
- `scripts/wsl-build-deploy.sh` 의 6/8 단계 모두 src/ 위치 강결합
- `next.config.ts` standalone 모드 빌드 산출물 위치
- `ecosystem.config.cjs` PM2 시작 경로
- 결과: 한 번에 4-5 스크립트 동시 갱신, 빌드/배포 회귀 위험 큼

또한 사용자가 "phase 0 부터 모두 순차적 진행" 자율 실행 지시했지만, 6h 작업을 한 세션에서 안전 종료하기 위험.

## 원인

모노레포 변환의 두 가지 작업이 본질적으로 **다른 위험 프로파일**을 가지는데도 sprint plan은 한 묶음으로 잡았다:

| 작업 | 위험 | 가역성 |
|------|------|--------|
| 워크스페이스 인프라 (yaml + turbo.json + packages/core/) | **낮음** — 신규 파일 추가만, 기존 빌드 무영향 | 즉시 — `git revert` |
| src/ → apps/web/ 이동 | **높음** — 4-5 스크립트 동시 갱신, 빌드 깨짐 가능 | 어려움 — 스크립트 + Next.js cache + PM2 영향 |

이 두 작업을 같은 PR에 묶으면, src 이동 검증 실패 시 인프라까지 함께 롤백 → 시간 낭비.

## 해결

**Incremental approach** — 같은 sprint plan task 를 두 PR 로 분할:

### PR 1 (본 세션, T0.2 commit `d24ea37`): 인프라만 추가

```
pnpm-workspace.yaml          # apps/* + packages/* 패턴
turbo.json                   # build/test/lint 파이프라인 + env 화이트리스트
packages/core/
├── package.json             # @yangpyeon/core skeleton, exports 4종
├── src/index.ts             # CORE_VERSION + 4 불변 인터페이스 로드맵 stub
├── tsconfig.json            # composite + 루트 상속
└── README.md                # Phase 1.1~2.1 모듈 추가 일정

tsconfig.json exclude 확장:  # 이중 typecheck 방지
  - packages/**
  - apps/**
```

**호환성 보장**:
- 루트 `package.json` 변경 0 — npm 빌드 무영향
- `package-lock.json` 변경 0 — npm install 흐름 유지
- `scripts/pack-standalone.sh` 무영향 — 현 루트 구조 그대로
- `npm run build` ✓ Compiled successfully (Next.js standalone)
- `npx tsc --noEmit` 0 에러 (루트 + packages/core/ 양쪽)

### PR 2 (보류, 별도 작업): src/ → apps/web/ 이동

Phase 1+ 별도 PR 로 분리. 사전 작업 필요:
1. `scripts/pack-standalone.sh` 의 SRC 경로 갱신 + 멱등 검증
2. `scripts/wsl-build-deploy.sh` 6/8 단계 갱신
3. `next.config.ts` standalone output 위치 검증
4. `ecosystem.config.cjs` PM2 경로 갱신
5. PR 본체에서 src/ → apps/web/ 이동 + 빌드/배포 회귀 테스트

### "부재한 알람" 패턴 — 4 불변 인터페이스 stub

`packages/core/src/index.ts` 와 `README.md` 에 다음을 명시:
```ts
// 4 불변 인터페이스 (변경 시 ADR amendment 필수):
//   - withTenant(handler): Route → tenant 컨텍스트 주입
//   - withTenantTx(fn): 트랜잭션 + RLS SET LOCAL
//   - dispatchTenantJob(payload): cron worker pool 위임
//   - computeEffectiveConfig(tenantId): manifest + DB override 병합
```

**효과**: Phase 1+ 의 sub-agent (kdyswarm 또는 직접 구현) 가 다른 시그니처로 작성하면 즉시 README와 충돌 인식. 명시적 기준점이 없으면 sub-agent 들이 제각기 다른 시그니처를 만들어 통합 단계에서 머지 비용 발생.

## 교훈

1. **Sprint plan task 는 "한 번에 끝낼 수 있는가" 가 아닌 "한 번에 머지해도 안전한가" 로 분할** — 6h 작업이라도 위험 분리되면 두 PR 로.
2. **인프라 vs 마이그레이션 = 분리 우선 후보** — 새 시스템 도입(인프라)과 기존 시스템 이동(마이그레이션)은 항상 별도 PR. 인프라 회귀는 즉시 롤백 가능, 마이그레이션 회귀는 매우 비싸다.
3. **불변 인터페이스 stub = 부재한 알람** — 본 구현이 없어도 README에 시그니처를 명시하면 미래의 sub-agent 들의 작업물이 자연스럽게 정합. "stub은 미래의 자기 자신에게 보내는 알림" 패턴.
4. **사용자 자율 실행 지시 != 무조건 한 번에** — `feedback_autonomy` 메모리 우선이지만, 파괴적/되돌리기 어려운 작업은 의식적 분리. 사용자가 더 좋아하는 결과는 "안전하게 7 commits" > "위험하게 1 commit + 롤백".

## 관련 패턴 (CK 누적)

- **CK-38** (cross-cutting fail-soft) — silent failure 차단
- **CK-40** (audit fail-soft + migration self-heal) — 빌드 게이트 + self-heal 이중 안전망
- **CK-41** (spec typecheck driven rewrite) — 외부 spec 적용 시 scratch + tsc + 백아웃
- **CK-42** (compressed kdywave on existing wave) — 기존 산출물 위 압축형 sub-wave
- **CK-43** (본 패턴) — sprint plan task 의 위험 분리 분할

## 관련 파일

- `pnpm-workspace.yaml` (T0.2 산출)
- `turbo.json` (T0.2 산출)
- `packages/core/README.md` (4 불변 인터페이스 로드맵)
- `tsconfig.json` (exclude 확장)
- `docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/00-roadmap-overview.md` (§0.2 원본)
- `docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md` (§5.3 자율 실행 vs 사용자 확인 매트릭스)
- `scripts/pack-standalone.sh` (강결합 분석 대상)
