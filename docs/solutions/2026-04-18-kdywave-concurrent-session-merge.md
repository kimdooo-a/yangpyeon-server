---
title: 동일 일자 두 kdywave 라인 동시 진행 → 외부 README/체크포인트 자율 통합 패턴
date: 2026-04-18
session: 29 (28-1 + 28-2)
tags: [kdywave, parallel-sessions, README, checkpoint, conflict-resolution, dual-perspective-doc]
category: pattern
confidence: high
---

## 문제

세션 28-1(현 세션)이 kdywave Wave 5 Tier 1 5 Agent를 발사한 직후, **다른 세션 28-2가 동일 Wave 5를 별도 진행 중인 사실을 시스템 알림으로 발견**:

```
Note: README.md was modified, either by the user or by a linter. ...
Note: _CHECKPOINT_KDYWAVE.md was modified, either by the user or by a linter. ...
status: completed
last_completed_wave: 5
```

증상:
- 28-1이 만든 13 문서 계획 + 28-2가 만든 15 문서 정본 = 같은 디렉토리(`05-roadmap/`, `06-prototyping/`, `07-appendix/`)에 동일 주제 파일 다수 존재
- 28-1 `00-release-plan.md` ↔ 28-2 `01-release-plan.md` (정본)
- 28-1 `02-tech-debt-strategy.md` ↔ 28-2 `04-tech-debt-strategy.md` (정본)
- 28-1 `03-risk-register.md` ↔ 28-2 `05-risk-mitigation.md`
- 28-1 A1 `00-glossary.md` ↔ 28-2 `01-glossary.md` (정본, A1은 stall로 부분 산출)

**충돌 위험**: 두 라인이 같은 README/체크포인트를 동시 편집하면 last-write-wins 손실 가능. 그러나 28-2가 실제 통합·정본화를 자동 수행한 결과만 발견.

## 원인

이 프로젝트는 단일 디렉토리 `E:/00_develop/260406_luckystyle4u_server/`를 다중 Claude 세션이 공유. kdywave 같은 대규모 산출 스킬을 두 세션이 같은 시간대에 실행하면:

1. **상태 파일 동시 편집**: README, _CHECKPOINT가 last-write-wins으로 통합 (수동/자동)
2. **파일명 충돌 회피**: 28-1은 `00-N` prefix, 28-2는 `01-N`/`05-N` prefix → 자연 분리
3. **인덱싱 조정**: 외부 28-2가 README 인덱스 갱신 시 28-1 파일도 인지하고 "28-1 R1-A sonnet" 식으로 작성자 명시 → 자율 통합

## 해결

### 발견 즉시 정책

1. **새 산출 중지 검토**: 발사 중인 background Agent의 결과가 외부 정본과 중복인지 즉시 판단
   - 본 세션: A1(부록 3건) background 진행 중 → 외부 정본 3건 존재 → 폐기 권고
2. **부분 산출물 archive**: 역사 삭제 금지 원칙. `_archived/` 디렉토리로 이동 + 파일명에 라인 ID 포함 (`00-glossary-28-1-A1-partial.md`)
3. **이중 관점 문서화로 보존**: 28-1 "상세 레지스트리" + 28-2 "전략·관리" 등 관점이 상보적이면 둘 다 정본화 (README에 역할 명시)

### 인수인계 정리

- 단일 인수인계서로 두 라인 통합 정리 (`260418-session29-supabase-parity-wave-5.md`)
- current.md 세션 행은 1행으로 (외부가 이미 행 추가했으면 그대로 유지)
- 두 라인의 산출물 표를 별도 섹션으로 분리 ("28-1 라인" / "28-2 라인")

### 검증

- `git status`로 두 라인의 변경 충돌 없음 확인 (다른 디렉토리/파일에 작성 시 충돌 없음)
- 줄 수 합계 검증: 28-1(9,304) + 28-2(11,871) - archive(36KB / ~약 1,000줄 추정) ≈ README 표기 20,128

## 교훈

1. **`/kdywave` 다중 세션 진입 가드 부재**: 체크포인트 status가 in-progress여도 다른 세션이 동시 진입 가능. 향후 kdywave 스킬에 "다른 세션 활성" 감지 필요.
2. **README가 자율 통합 가능**: 외부 세션이 두 라인의 산출물을 모두 인덱싱 + 작성자(28-1 / 28-2) 명시 → 충돌 없는 단일 진실 소스 유지. 이는 "이중 관점 문서화" 패턴의 운영 가능성 입증.
3. **`_archived/` 디렉토리 신설**: 부분 산출 / 폐기 / 역사 보존 위해 표준 디렉토리. 인덱싱 제외(README 미참조)하되 파일은 보존.
4. **세션 번호 통합**: 동일 Wave / 동일 일자 진행이면 단일 세션 번호로 통합(28-1+28-2 → 29). current.md 가독성 유지.
5. **자율 실행 메모리의 한계**: "권장안 즉시 채택" 정책이 다중 세션 충돌을 사용자에게 보고할 기회를 줄임. 외부 변경 감지 시점에는 명시 보고가 안전.

## 관련 파일

- `docs/research/2026-04-supabase-parity/README.md` (외부 28-2가 통합 인덱싱)
- `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md` (status: completed)
- `docs/research/2026-04-supabase-parity/_archived/00-glossary-28-1-A1-partial.md` (부분 산출 archive 예시)
- `docs/handover/260418-session29-supabase-parity-wave-5.md` §5 28-2 라인 발견 + §6 A1 처리
- 본 세션의 Compound Knowledge 짝: `2026-04-18-kdywave-opus-stall-sonnet-split.md`
