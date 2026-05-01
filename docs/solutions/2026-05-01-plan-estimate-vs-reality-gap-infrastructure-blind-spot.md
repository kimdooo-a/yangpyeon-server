---
title: plan 추정 줄수가 인프라 한계 미검토 영역의 신호일 수 있음 — 50× 격차 패턴
date: 2026-05-01
session: 77 (옵션 C 새 터미널)
tags: [planning, plan-validation, infrastructure-constraint, cloudflare-tunnel, multipart-upload, claude-workflow]
category: pattern
confidence: high
---

## 문제

운영자가 작성한 7 PHASE 풀 패키지 plan 의 PHASE 3 추정:

> "PHASE 3 (45분) — R2 → SeaweedFS endpoint 교체 (~10줄, S3 API 호환으로 코드 거의 그대로)"

그러나 PHASE 3 진입 전 분석 결과 실제 PR 사이즈:

- **C1 단순 endpoint 교체**: ~62줄 (~6× plan 추정) — 50~90MB 작동, 90MB+ 회귀 지속
- **V1 multipart 통합**: ~530줄 (~50× plan 추정) — 모든 사이즈 작동
- **V2 + cleanup cron**: ~700줄 (~70× plan 추정)

50× 격차의 원인은 **plan 작성 시 cloudflare tunnel 100MB body limit 미검토**. ADR-032 R2 hybrid 채택의 핵심 동기가 바로 이 100MB 우회였는데, plan 은 SeaweedFS 자가호스팅이 R2 의 우월점 (cloudflare 외부 endpoint) 을 동시에 잃는다는 점을 검토하지 않음. SeaweedFS endpoint = `127.0.0.1:8333` localhost only → 외부 노출 시 cloudflare tunnel 강제 → 100MB 한계 부활 → 단일 PUT 으로는 해결 불가능 → multipart upload 코드 분기 +400줄.

## 원인

**plan 의 추정 단위 = 함수 시그니처 변경 단순 매트릭스**:
- `R2_ACCOUNT_ID` → `OBJECT_STORAGE_ENDPOINT` (env 1개)
- `region: 'auto'` → `'us-east-1'` (1줄)
- `forcePathStyle: true` 추가 (1줄)
- endpoint URL 하드코딩 → env 변수 (3줄)
- 합계 ~10줄

**plan 미검토 영역 = 인프라 측 트레이드오프 변화**:
- R2 (cloudflare 외부) ↔ SeaweedFS (cloudflare tunnel 내부) endpoint 위치 차이가 가져오는 cloudflare tunnel 100MB body limit 적용 여부 변화
- 다운로드 (response body) 도 동일 한계 적용되는지 확인 누락 — 실제로는 chunked transfer 로 무관하나 plan 시점 미검토
- 클라이언트 직접 PUT 흐름 (브라우저 → SeaweedFS) 이 endpoint 위치상 불가능 → ypserver stream forward 로 변경 필요 (+30줄 다운로드 분기)

즉 **plan 은 "S3 API 호환 = 코드 거의 그대로" 라는 표면 매트릭스만 보고, S3 API 호환의 외피 아래 인프라 측 트레이드오프 변화를 검토 안 함**.

## 해결

### 즉시 (본 세션 처리)

**PHASE 3 진입 직전에 plan 미검토 영역 표면화 + 운영자 결정 받기**:

1. plan 의 "~10줄" 추정과 실제 코드 분석 결과 격차 인지
2. 격차 원인 분석 — 인프라 측 변화 (cloudflare tunnel 100MB) 가 있는가?
3. 운영자에게 **결정 옵션 매트릭스 제시** (P3a/P3b/P3c) — plan 그대로 진행 시 50MB+ 회귀 위험 명시
4. 운영자 가설 ("IP 가 고정이 아니라 cloudflare 의존 강제") 검증으로 결정 단순화 — 동적 IP + ISP CGNAT 매트릭스 분석으로 cloudflare tunnel outbound-only 가 사실상 인프라 강제 → multipart 가 유일한 회수 경로

### 장기 (워크플로우 룰)

**plan 추정 격차 의심 신호 매트릭스** (Claude 작업 진입 전 적용):

| plan 추정 vs 실제 | 의심 영역 | 진입 전 점검 |
|--|--|--|
| 1× ~ 2× | 단순 작업, plan 정합 | 진입 OK |
| 2× ~ 5× | 함수 시그니처 변경 + 호출처 누락 가능 | grep 호출처 + import 경로 확인 |
| 5× ~ 20× | 인프라 측 트레이드오프 변화 의심 | **인프라 manifest 비교** (cloudflare/cdn/SSL/auth/quota 등) |
| **20×+** | **plan 미검토 영역 거의 확정** | **plan 작성자에게 표면화 + 결정 받기 (자율 진행 정책 예외)** |

**구체적 점검 항목** (인프라 측 트레이드오프 변화 의심 시):

1. endpoint 위치 변화 — 외부 (cloudflare/CDN 외부) vs 내부 (cloudflare tunnel 통과)
2. SSL 인증서 발급 주체 변화 — 외부 (Cloudflare) vs 자가 (Let's Encrypt)
3. 인증 흐름 변화 — 외부 IAM vs 자가 access key
4. 인프라 한계 매트릭스 — body size / connection count / rate limit / SLA
5. 동적 IP / CGNAT / 라우터 노출 가능성 등 호스팅 환경 제약
6. 청구 모델 변화 — 사용량 기반 vs 자가 디스크 vs 외주 무한

이 6 항목 중 **2개 이상 변화 시 plan 추정 5× 이상 격차 의심 + 진입 전 운영자 결정 받기**.

### Claude 측면 자율 진행 정책 보완

자율 실행 정책 ("분기 질문 금지, 권장안 즉시 채택, 파괴적 행동만 예외") 의 예외 확장:

- 기존 예외: 파괴적 행동 (배포, DB 변경, 파일 삭제, 스키마 변경, 프로덕션 영향)
- **신규 예외 후보**: plan 추정 vs 실제 격차 5× 이상 + 인프라 측 트레이드오프 변화 의심 — 사용자 결정 받기

본 패턴 등록은 메모리 룰 후보. 다음 세션에 별도 등록 검토.

## 교훈

1. **plan 의 "코드 거의 그대로" 라는 표현은 신호** — 인프라 측 트레이드오프 변화가 있는데 plan 이 그것을 미검토할 가능성 높음.
2. **endpoint 위치 변화 시 인프라 한계 매트릭스 재점검 필수** — R2 (cloudflare 외부) ↔ SeaweedFS (cloudflare tunnel 내부) 처럼 같은 S3 API 호환이라도 인프라 측면이 다르면 코드 영향 ↑.
3. **운영자 가설 검증이 가장 빠른 결정 단순화 도구** — "IP 가 고정이 아니라 cloudflare 의존" 같은 한 줄 가설을 매트릭스로 검증하면 옵션 4개 → 1개 (multipart) 로 수렴.
4. **자율 실행 정책의 결단성과 사용자 결정 받기의 균형** — 50× 격차는 자율 진행으로 묻고 진행하기에는 너무 큼. 작은 commit 분할 (C1 endpoint + multipart 후속) 로 운영자가 도중 reverse 가능하도록 안전망 확보.

## 관련 파일

- `docs/research/decisions/ADR-032-filebox-large-file-uploads.md` (SUPERSEDED 2026-05-01)
- `docs/research/decisions/ADR-033-seaweedfs-self-hosted-object-storage.md` (ACCEPTED 2026-05-01)
- `docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md` (인프라 한계 진단)
- `docs/solutions/2026-05-01-external-service-adr-value-alignment-gap.md` (자매 CK — ADR §"운영자 가치관 정합성 점검" baked-in)
- `docs/handover/260501-session77-option-c-new-terminal-execution.md` §"학습/메타" 9.2
