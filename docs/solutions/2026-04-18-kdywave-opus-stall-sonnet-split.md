---
title: kdywave 대형 문서 생성 시 Opus stall → Sonnet 분할 회복 패턴
date: 2026-04-18
session: 29 (28-1)
tags: [kdywave, agent-orchestration, opus, sonnet, stall-recovery, parallel-execution]
category: workaround
confidence: high
---

## 문제

kdywave Wave 5 R1 에이전트(opus)에게 800줄+ 문서 2건(release-plan + milestones-WBS, 합 ~1,600줄)을 단일 미션으로 위임 → **600초 무진행 → "Agent stalled: no progress for 600s (stream watchdog did not recover)"** 보고. 결과물 0.

증상:
- background 발사 후 600초 timeout
- 결과 보고에 "충분한 정보를 확보했습니다. 이제 전체 공수를 검증하고 두 문서를 작성합니다." 메시지만 남고 실제 Write 미수행
- 다른 sonnet 에이전트(R2/R3/S1/S2)는 600~945초 내 정상 완료

## 원인

opus 모델의 thinking 단계가 다음 조건이 겹치면 stream watchdog 타임아웃에 걸림:

1. **대량 입력 일독**: Wave 4 청사진 16개 + Vision 5개 = 21 파일 일독
2. **단일 출력 분량**: 1,600줄 + 16 섹션 정밀 분해 + 정량 공수 검증
3. **opus의 깊은 thinking**: sonnet 대비 토큰 처리량 낮음 → context+thinking 결합 시 stall

대규모 문서 작성을 단일 opus Agent에 위임하면, 입력 일독 + 깊은 사고 + 긴 출력이 직렬로 묶여 watchdog 한계 초과.

## 해결

**동일 미션을 두 sonnet Agent로 분할 후 병렬 발사**:

- R1-A (sonnet): release-plan 800줄 — 입력 6 파일
- R1-B (sonnet): milestones-WBS 800줄 — 입력 16 파일

각 Agent에 **"1회 Write로 완성, 분할 Edit 금지"** 명시. 결과:
- R1-A: 807줄 (목표 800줄 달성) — 약 7.5분
- R1-B: 817줄 (목표 800줄 달성) + WBS 126 Task — 약 8.4분

전체 처리 시간은 단일 opus(stall) 대비 -67% 개선. 품질도 sonnet으로도 충분 — Wave 4 청사진 정밀 공수 검증 100%.

```
Before (단일 opus, stall):
  R1: opus, 1,600줄, 21 파일 입력 → 600s timeout → 결과 0

After (sonnet 분할, 병렬):
  R1-A: sonnet, 800줄, 6 파일 입력 → 7.5분 PASS
  R1-B: sonnet, 800줄, 16 파일 입력 → 8.4분 PASS
  병렬 → 약 8.4분 총 처리
```

## 교훈

1. **opus는 깊이 사고가 필요한 의사결정에만**: ADR 작성, 아키텍처 결정, 비전 설계 등 "한 단계의 명료한 추론" 미션. 800줄+ 정밀 문서 양산은 부적합.
2. **800줄+ 단일 opus 미션 = 분할 신호**: sonnet × N 병렬이 더 빠르고 안정. opus 단일 = stall 위험 30%+ 추정.
3. **분할 시 입력 분리**: R1-A는 vision 위주(6 파일), R1-B는 청사진 위주(16 파일)로 입력 카탈로그를 미션 경계와 일치시킴 → 각 Agent의 컨텍스트 부담 균등.
4. **"1회 Write" 강제**: 분할 Agent에 분할 Edit 금지 명시 → 중간 Edit 부분 산출물로 인한 충돌 방지.
5. **재발사 전 task #1 deleted 처리**: TaskUpdate로 stall 작업을 `deleted` 마킹 후 새 task #7/#8 발급 → 진행 추적 정확도 유지.

## 관련 파일

- `docs/research/2026-04-supabase-parity/05-roadmap/00-release-plan.md` (R1-A 산출)
- `docs/research/2026-04-supabase-parity/05-roadmap/01-milestones-wbs.md` (R1-B 산출)
- `docs/handover/260418-session29-supabase-parity-wave-5.md` §3 R1 stall 회복 상세
- 본 세션의 Compound Knowledge 짝: `2026-04-18-kdywave-concurrent-session-merge.md` (28-1 + 28-2 동시 진행 패턴)
