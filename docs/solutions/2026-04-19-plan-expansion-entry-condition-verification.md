---
title: 플랜 outline→풀 디테일 확장 직후 실제 진입 조건 실측 (실행 전 동기화 가드)
date: 2026-04-19
session: 49
tags: [writing-plans, subagent-driven-development, pre-execution-check, operational-drift, phase-16]
category: pattern
confidence: high
---

## 문제

장기 phase 를 multi-session 에 걸쳐 진행 시, 이전 세션 handover 에 기재된 "종결 상태" 가 실제 인프라 상태와 일치하지 않을 수 있다. 특히:

- "프로덕션 배포 완결" 이라 기록돼 있으나 실제로는 dev DB 만 반영
- secrets/env 파일 경로가 handover 와 달리 존재하지 않음
- 이전 세션이 "권장 경로 A" 대신 "회피 경로 B" 를 선택했으나 상세 기록이 없음
- 사용자가 대화 초두에 "진입 조건 100% 충족" 이라 주장해도, 실측 결과 불일치 존재

writing-plans → subagent-driven-development 체인으로 바로 이어질 때, 실행이 시작되기 전에 **이 불일치가 포착되지 않으면** 서브에이전트가 잘못된 전제로 동작하거나 live 작업 중에야 실패가 드러난다.

세션 49 에서 "S49 진입 조건 100% 충족" 사용자 진술 → writing-plans 로 848줄 확장 → subagent-driven-development 디스패치 직전 `secrets.env` MISSING / ~/dashboard flat 유지 등 3-4건 불일치가 실측으로 드러난 사례.

## 원인

1. **Session handover 의 시제 표현 모호성**: "세션 48 에서 완결" 이 실제로 마무리 지점 직전이었을 수 있다 (사용자 /cs 시점 분기). 예: S48 핸드오버는 "프로덕션 배포만 남음" 이라 기재 → 읽는 쪽 해석에 따라 "배포는 이미 된 거" 로 오독.
2. **dev/prod 동일 인스턴스 경로**: DB 가 dev/prod 분리 없이 같은 PostgreSQL 인스턴스를 쓰면 "dev 에만 반영" 이 사실상 prod 도 반영이지만 handover 는 분리 상태처럼 기록.
3. **사용자의 선언적 상태 주장**: 사용자가 사전 점검 없이 "조건 충족" 이라 말한 것은 계획 기준으로는 정상이나, 실측 없이 신뢰하면 실행 시점에 괴리.
4. **writing-plans → subagent-driven-development 체인의 틈새**: 두 스킬 모두 "plan 이 맞음" + "subagent 가 plan 대로 실행" 을 전제. **중간에 "plan 전제 재검증" 단계가 스킬 본문에 없음**.

## 해결

**writing-plans 로 풀 디테일 확장 직후, subagent-driven-development 디스패치 **전에** 아래 3 체크리스트를 기계적으로 수행**:

### 체크리스트 (5분 이내)

```bash
# 1) 이전 세션 handover 의 "완결" 상태 vs 실측 — 주요 산출물 존재 확인
for path in <plan 에 기재된 전제 파일/디렉토리/심링크>; do
  wsl -e bash -c "ls -la $path 2>&1"
done

# 2) 시스템 인프라 실측 (배포 상태)
wsl -e bash -c "pm2 list | grep -E 'dashboard|cloudflared'"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000

# 3) DB 상태 (마이그레이션, seed, 특정 row 존재)
psql <DATABASE_URL> -c "<plan 의 DOD 와 관련된 SELECT>"
```

### 불일치 발견 시 경로 선택 프레임

사용자에게 A/B/C 3안 제시:
- **A — 이전 단계 완결 후 진입**: 정공법, 소요 예상 명시
- **B — 대안 경로로 진입**: 기술 부채 감수 근거 명시
- **C — 하이브리드**: 완결 가능한 부분 + 이월 부분

사용자는 본인 상황 (시간·리스크 허용도) 에 따라 지명. 파괴적 작업 예외 조항으로 이 결정은 질문 정당.

### subagent-driven-development 스킬 내재화 제안

`implementer-prompt.md` 템플릿에 "Pre-execution actual-state verification" 블록 추가:
```
## 전제 재확인 (서브에이전트 수행 전, controller 실행)
- [ ] plan 에 기재된 전제 파일/디렉토리 실측 확인
- [ ] pm2 list + curl 헬스
- [ ] DB 핵심 row 존재
- [ ] 사용자 주장 "조건 충족" 의 evidence
```

## 교훈

1. **Handover 는 계획 기록이지 상태 증명이 아니다** — 실측만 상태를 증명한다. 다음 세션 handover 는 "검증 증거" 섹션에 명령어 출력을 스냅샷으로 포함.
2. **dev/prod 분리 부재는 "이미 반영" 을 안전처럼 보이게 한다** — "already migrated" 응답은 정상 경로일 수도, 사고 잔재일 수도 있다. `kek_version`, `created_at`, 암호문 길이 등 메타로 확증.
3. **파괴적 작업 예외 조항의 정의** — "작업이 파괴적" 뿐 아니라 "작업 전제가 불확실" 도 질문 정당화 사유다. 자율 실행 메모리 있어도 미검증 전제로 파괴적 작업 착수는 금지.
4. **scope 제약이 느슨한 서브에이전트 디스패치 금지** — "write + unit test only, DO NOT execute live" 같은 명시 경계가 있어야 `wsl -e bash -c "... bootstrap.sh"` 같은 프로덕션 침습을 차단.

## 관련 파일

- `docs/handover/260419-session48-phase16a-vault.md` — S48 "완결" 기록
- `docs/handover/260419-session49-s49b-plan-expansion-phase16a-deploy.md` — S49 실측 불일치 발견 + 경로 A 수행 기록
- `docs/superpowers/plans/2026-04-19-phase-16-plan.md §세션 49` — outline→풀 디테일 848줄 확장 대상
- `scripts/phase16-vault-verify.sh` — 선행 가드 (이번 세션에서 `=== PASS ===` 확증)
- Skill 참조: `superpowers:writing-plans`, `superpowers:subagent-driven-development`
