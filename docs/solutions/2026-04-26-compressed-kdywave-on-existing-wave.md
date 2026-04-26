---
title: 압축형 kdywave — 기존 Wave 산출물 위 4 sub-wave 패턴
date: 2026-04-26
session: 58
tags: [kdywave, sub-agent, parallelism, context-management, adr, architecture-design]
category: pattern
confidence: high
---

## 문제

기존 프로젝트에 이미 **kdywave 풀 5-Wave 산출물(123 문서, 106,588줄)** 이 있고 그 위에서 ADR 8건이 ACCEPTED된 직후, 본격 아키텍처 설계 wave를 추가로 돌려야 하는 상황. kdywave 표준 5-Wave (deep-dive → comparison → vision → architecture → roadmap)를 그대로 적용하면:

1. **중복 작업 폭발**: Wave 1~3 (deep-dive, comparison, vision)이 기존 supabase-parity Wave 1~5와 8 ADR로 이미 답변됨 → 같은 결정을 또 함
2. **메인 컨텍스트 비대화**: sub-agent 12+ 개가 모두 큰 컨텍스트(8 ADR + 2 spike + 30+ 영향 파일)를 받으면 메인 대화가 보고 결과로 가득참
3. **결정 트리거 인지 실패**: ADR-001 같이 명시적 재검토 트리거가 박힌 결정이 자동 발동 인지 안 됨

또한 다른 터미널이 동시에 같은 repo의 다른 브랜치(`spec/aggregator-fixes`)에서 작업 중이라 **충돌 회피**가 동시 요구사항.

## 원인

kdywave 표준 워크플로우는 **신규 프로젝트** 가정. 기존 wave 결과 위에 추가하는 incremental 모드가 없음. 또한:

- ADR 재검토 트리거 자동 감지 메커니즘 부재 — 수동으로 트리거 조건을 점검해야 발견됨
- sub-agent 발사 시 컨텍스트 비용 추정/제어 패턴 부재
- 동시 작업 브랜치와의 파일 충돌 회피 가이드 부재

결과적으로 표준대로 따르면 1) 시간 낭비 2) 컨텍스트 폭증 3) 중복 결정 위험 4) 다른 터미널 작업 깨짐.

## 해결

### 1. 4-Round 자율 흐름 패턴

수동/대화형 wave 진행 대신 4 Round 자율 실행:

```
R1: 컨텍스트 흡수 (병렬 2 Explore agent)
  - 기존 Wave/ADR/spike 통합 감사 (재결정 금지 항목 식별)
  - 현재 코드의 영향 받는 파일 매핑 (~30개)
  → docs/research/baas-foundation/00-context/ 에 저장 (재참조용)

R2: ADR 초안 (병렬 8 sub-agent + 1)
  - ADR-022~029 8건 (각 1 agent)
  - CLAUDE.md 변경 제안서 (1 agent)
  - 모든 결정 칸 [PENDING] 유지

R3: spike 검증 (병렬 2 spike sub-agent)
  - 가장 위험한 기술 가정 PoC 보고서
  - **spike 결과로 ADR 권고 변경 가능** ← 게임 체인저

R4: 결정 적용 (병렬 8 sub-agent + 4 직접 편집)
  - 사용자 결정 ACCEPTED 일괄 적용
  - CLAUDE.md, current.md, handover, next-dev-prompt 갱신
```

각 Round 사이 사용자에게 결정 요청 가능 (선택). 단순 권고 따르는 경우는 자율 진행.

### 2. 압축형 kdywave (Wave 4+5만)

표준 5-Wave 대신 **이미 답변된 Wave는 흡수, Wave 4+5만 4 sub-wave**:

```
표준:    W1 deep-dive → W2 comparison → W3 vision → W4 architecture → W5 roadmap
압축형:  ───────── 흡수 (기존 결과 + ADR) ─────────  →  W4+5 = 4 sub-wave

Sub-wave A: Architecture (5-Plane Overview + 8 ADR 구현 specs, 9 sub-agent)
Sub-wave B: Sprint Plan (Phase 0~4 + Task DAG, 1 sub-agent)
Sub-wave C: Migration (5 Stage + Wave 호환성, 1 sub-agent)
Sub-wave D: Validation (운영 시나리오 + 7원칙 준수, 1 sub-agent)
```

총 12 sub-agent 1회 병렬 발사로 ~10,000줄 산출 가능.

### 3. Sub-agent 컨텍스트 파일 우선 패턴

각 sub-agent prompt 첫 줄에 **"먼저 읽으세요 (필수)"** 섹션:

```markdown
**먼저 읽으세요 (필수)**:
1. {컨텍스트 파일 1 절대 경로}
2. {컨텍스트 파일 2}
3. ...
```

효과:
- **메인 대화는 컨텍스트 파일 경로만 알고**, 내용은 sub-agent가 직접 Read
- sub-agent 출력은 **압축 보고만** (200~300자) — "산출물 경로 + 줄 수 + 핵심 결정 N개"
- 메인 대화 컨텍스트 비대화 방지 (12 sub-agent 결과를 다 받아도 1~2K 토큰)

### 4. ADR 재검토 트리거 자동 감지

기존 ADR이 **명시적 재검토 트리거**를 보유하면 (예: ADR-001 §6.5의 4개 트리거), 새 사용자 요구가 들어올 때 트리거 매칭을 R1 (컨텍스트 흡수) 단계에서 자동 점검:

```
사용자 요구: "10~20개 프로젝트 공유 백엔드"
↓
ADR-001 트리거 1 ("사용자 2명+ 6개월 지속") 매칭 ✅
ADR-001 트리거 3 ("독립 팀/조직 관리") 매칭 ✅
↓
ADR-022로 supersede 정당화 자동 도출
```

R1 Explore agent prompt에 "기존 ADR의 재검토 트리거 점검" 명시 필요.

### 5. 충돌 회피 — 새 디렉토리만 사용

다른 터미널이 작업 중인 영역과 분리:

```
다른 터미널 작업 영역 (충돌 위험):
- src/, prisma/, docs/assets/yangpyeon-aggregator-spec/

본 wave 작업 영역 (안전):
- docs/research/baas-foundation/ (신설)
- 4 메타 파일 (CLAUDE.md, current.md, handover, next-dev-prompt) — 다른 터미널이 안 만지는 것 확인 후
```

git status로 다른 터미널 작업 흔적 확인 → 새 디렉토리만 추가 → push는 사용자 결정 (브랜치 충돌 가능성 명시).

## 교훈

- **기존 wave 산출물이 있으면 압축형 4 sub-wave 패턴**: Wave 1~3 표준 절차는 건너뛰고 Wave 4+5만 sub-wave로 분할. ~5h 만에 풀 사이클 가능.
- **Sub-agent 발사 시 컨텍스트 파일 우선 + 압축 보고**: prompt에 "먼저 읽으세요 (필수)" 섹션 + "보고 형식 (200자)" 명시. 12 sub-agent 결과도 메인 컨텍스트 무비대화.
- **ADR 작성 시 명시적 재검토 트리거 4가지 패턴 박기**: 사용자 수, 기간, 새 FR, 법적 요건. 미래 자동 감지 가능. 본 ADR-001 → ADR-022 supersede가 정확히 이 패턴 덕분에 정당화됨.
- **Spike 결과로 ADR 권고 변경 가능성**: ADR 권고는 "이론적 분석 기반"이고 spike는 "실제 검증 기반". spike-baas-001이 ADR-023 권고를 옵션 A → 옵션 B로 변경 → 데이터 유출 위험을 사전에 차단. **ADR 결정 전 핵심 위험 가정은 마이크로 spike 필수**.
- **다른 터미널과 동시 작업 시 새 디렉토리만 추가**: git status로 충돌 영역 점검 → 안전한 작업 분리. push는 사용자 결정 (자동 push 위험).

## 관련 파일

- `docs/research/baas-foundation/04-architecture-wave/README.md` — 4 sub-wave 인덱스
- `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` — R1 컨텍스트 흡수 산출물
- `docs/research/baas-foundation/03-spikes/spike-baas-001-prisma-schema-per-tenant.md` — ADR 권고 변경 트리거
- `docs/research/decisions/ADR-001-frontend-design.md` — 재검토 트리거 4개 패턴 원본
- `~/.claude/skills/kdywave/phases/phase-1-wave-planning.md` — 표준 5-Wave 가이드
- `docs/handover/260426-session58-baas-foundation.md` — 본 세션 인수인계서
