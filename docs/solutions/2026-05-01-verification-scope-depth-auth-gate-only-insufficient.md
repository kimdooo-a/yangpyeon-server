---
title: 검증 깊이 부족 — auth-gate ping 만으론 actual flow 회귀 놓침
date: 2026-05-01
session: 78
tags: [verification, regression-testing, auth-gate, architectural-validation, ci-gap]
category: pattern
confidence: high
sibling: 2026-05-01-plan-estimate-vs-reality-gap-infrastructure-blind-spot.md
---

## 문제

**증상**: s77 옵션 C C1 commit `28273a0` 가 PHASE 4 회귀 검증 통과 (auth-gate ping 9/9 + 신규 500 0건) 후 origin push. s78 진입 시점에 그 머지가 architecturally broken 상태였음 발견:

```
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:8333  (localhost only)
SeaweedFS S3 :8333 = 127.0.0.1 only (외부 도달 불가)
cloudflared ingress = stylelucky4u.com → :3000 만 (S3 ingress 부재)
→ presigned URL host = http://127.0.0.1:8333/...  → 브라우저 도달 불가능
→ r2-presigned + r2-confirm 라우트 architecturally broken
```

**재현 조건**: 외부 의존 (S3/DB/HTTP) 의 endpoint/host/protocol 변경 + 회귀 검증을 auth-gate ping 만 으로 끝낸 PR.

**파급**: PR 머지 후 외부 사용자가 actual flow 로 호출하기 전까지 침묵하는 회귀 (silent regression). 다음 PR 진입 시점에야 발견. 이번 사례는 다행히 본인 운영 + 작업 흐름상 다음 PR (s78 multipart 통합) 직후에 잡혔으나, plan-estimate gap (cc231fd 자매 CK) 와 결합하면 발견 시점이 운영 사용자 1.4GB 이송 등 외부 trigger 까지 늦춰질 수 있다.

## 원인

s77 PHASE 4 검증 = "회귀 ping 9 라우트 (401×6 + 403×1 + 405×2 auth gate 차단) + 신규 500 0건". Auth-gate 까지만 검증, 인증 핸들러 진입 후 **외부 의존 호출 흐름 (presigned URL → 브라우저 PUT)** 검증이 빠짐.

근본 이유 1: **회귀 ping 의 false-confidence 효과**. "9/9 통과" 라는 큰 숫자가 검증 깊이의 부족을 가린다. 실제로는 9 라우트 모두 단 1 step 만 진행 (auth-gate) — coverage 폭은 넓지만 깊이는 얕다.

근본 이유 2: **운영자 인지된 검증 한계가 사후 처리됨**. s77 운영자 자체 분석 (저널 [3]) 에서 "ALS 진짜 회귀 검증은 인증 50MB+ PUT 실측 (S78-E) 에 의존" 라고 명시했었음. 그러나 PHASE 4 머지 시점에는 그 한계가 PR 본문이나 검증 출력의 일부가 아니었다 → "테스트 통과" 신호가 한계 명시를 압도.

근본 이유 3: **architectural 변경이 코드 변경으로만 보임**. C1 = "endpoint 교체 ~62줄". 코드 단위로는 작은 변경이지만 endpoint *위치* (localhost vs 외부) 가 바뀐 architectural change. 코드 레벨 검증 (tsc/lint/회귀 ping) 은 architectural assumptions 변화를 잡지 못한다.

## 해결

### 즉시 (s78 처리)

1. r2-presigned/r2-confirm 라우트 삭제 (architecturally broken)
2. multipart 4 라우트 신규 (X1 server proxy 패턴, browser → tunnel → ypserver SDK PutObject → SeaweedFS localhost) — 다운로드 패턴과 대칭
3. ADR-033 §2.5 신설 — 결정 근거 + 매트릭스 + s77 PHASE 4 검증 gap 분석 baked-in
4. memory rule 신규 — `feedback_verification_scope_depth.md` (이 머신 모든 세션 자동 적용)

### 장기 (워크플로우 룰)

**룰 1: external-dependency-touch PR 본문 검증 명시**
라우트 신규/변경 + 외부 의존 (S3/DB/HTTP) 호출 변경 시, PR 본문에 "actual flow 검증 방법" 필수:
- 자동 검증 (수동 1회 / unit test mock OK / E2E test 중 하나) 명시
- 자동화 불가 시 수동 검증 단계 + 책임자 (운영자 본인 / S78-C 등) 명시
- 검증 미실행 시 한계 = "ping 까지만 통과, actual flow 회귀 검출 안 됨" 명시

**룰 2: architectural change = depth-1 검증 의무**
endpoint/protocol/host 변경 (localhost vs 외부, http vs https, presigned vs proxy 등) 은 architectural change. handler 진입 후 1 step (브라우저 도달성 / SDK call result / DB write trace) 까지 결정적 검증 필수. ping 만으론 부족.

**룰 3: 회귀 ping 출력에 "검증 깊이" 라벨링**
"9 라우트 통과" 같은 폭 메시지 외에 "검증 깊이 = auth-gate" 또는 "검증 깊이 = handler entry + 1 step (DB write)" 라벨 명시. 깊이 평가 = (1) auth-gate / (2) handler entry / (3) actual external call / (4) full flow round-trip.

**룰 4: 자동화 불가 검증 추적 메커니즘**
S78-C 처럼 운영자 본인 작업 만 가능하면 next-dev-prompt 의 "다음 세션 첫 작업 우선순위" 표 P0 명시. 검증 부채 추적 가능. 미실행 상태로 다음 PR 진입하면 회귀 누적.

### Claude 측면 자율 진행 정책 보완

**§신호 1**: "ping N/N 통과" 출력만 보고 만족하지 말 것. 검증 깊이 평가 (1~4 단계) 후 부족하면 PR 본문에 명시 또는 추가 검증.

**§신호 2**: external dependency change 감지 시 (`OBJECT_STORAGE_ENDPOINT` / `DATABASE_URL` / external API host 등) → 자동으로 깊이-1 검증 시도 (mock 또는 1회 actual call). 불가하면 PR 본문에 한계 명시.

**§신호 3**: 자동화 불가 검증 = next-dev-prompt 우선순위 P0 row 자동 추가. 다음 세션 첫 작업으로 surface.

## 교훈

1. **검증 깊이 > 검증 범위**: ping 9 라우트보다 actual flow 1 라우트 결정적 검증이 회귀 차단력 높다. coverage 폭과 검증 깊이는 다른 차원.

2. **architectural change 의 silent regression 위험**: 코드 변경이 작아도 architectural assumptions 가 바뀌면 ping 검증으로 잡히지 않는다. endpoint/protocol/host 변경은 architectural change 로 분류하고 깊이-1 검증 의무화.

3. **자동화 불가 검증의 명시 vs 묵시**: S78-C 같이 운영자 본인 작업만 가능한 검증을 PR 본문에 한계로 명시하지 않으면 "테스트 통과" false-confidence 가 silent regression 을 머지로 흘려보낸다. 명시 → 다음 세션 우선순위 P0 → 강제 surface.

4. **자매 패턴**: cc231fd CK `2026-05-01-plan-estimate-vs-reality-gap-infrastructure-blind-spot.md` 는 plan-estimate-vs-reality 측면 (50× 격차 = 인프라 미검토 영역 신호). 본 CK 는 verification-depth 측면 (auth-gate ping = 깊이 부족 사각지대). 둘 다 plan/검증 가정 vs 실제 차이의 발견 기회 — 결합 적용 시 architectural broken 머지 차단력 ↑.

## 관련 파일

- `docs/research/decisions/ADR-033-seaweedfs-self-hosted-object-storage.md` §2.5 (X1 결정 근거 + s77 PHASE 4 검증 gap 분석)
- `docs/handover/260501-session77-option-c-new-terminal-execution.md` §PHASE 4 (gap 발생 시점 회귀 ping 출력)
- `docs/handover/260501-session78-multipart-upload-x1-server-proxy.md` 토픽 2 (gap 발견 시점 분석)
- `docs/solutions/2026-05-01-plan-estimate-vs-reality-gap-infrastructure-blind-spot.md` (자매 CK, cc231fd)
- `~/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_verification_scope_depth.md` (memory rule, 이 머신 모든 세션 자동 적용)
- `~/.claude/projects/.../memory/feedback_baseline_check_before_swarm.md` (자매 메모리 — 사전 점검 4종, 본 룰은 사후 검증 측면)
