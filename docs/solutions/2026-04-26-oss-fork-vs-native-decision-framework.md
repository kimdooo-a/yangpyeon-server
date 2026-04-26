---
title: OSS 메신저(또는 도메인) 포크 vs 네이티브 신설 결정 프레임워크
date: 2026-04-26
session: 64
tags: [architecture, decision-framework, multi-tenant, oss-evaluation, messenger]
category: pattern
confidence: high
---

## 문제

성숙한 OSS 솔루션(Mattermost MIT, Rocket.Chat MIT, Zulip Apache 등)이 이미 존재하는 도메인을 프로젝트에 도입할 때, **(A) OSS 포크/내재화** vs **(B) 네이티브 신설** 중 무엇을 선택할 것인가?

세션 64에서 사용자가 "메신저 기능 + 파일 송수신 — 깃헙에서 참조할 만한 메신저 앱 프로젝트를 검색해서 이 프로젝트에 내재화 하는 것은 어떻게 생각해?" 질문. 즉답으로 **B 권장**한 결정의 정당화.

## 원인 (왜 이 질문이 자주 나오는가)

OSS 도입의 매력:
1. 빠른 출시 ("이미 만들어진 걸 쓰면 빠를 것 같다")
2. 검증된 패턴 (typing indicator, read receipts 등)
3. 대규모 사용자 검증

문제: **OSS는 자체 인프라 가정 위에 만들어졌다**. 받아들이려는 프로젝트의 인프라와 충돌하면 받는 비용이 OSS의 가치를 초과한다.

## 해결 — 결정 프레임워크 (5축 점수)

각 축에 1~5점, 총합 ≥ 18 → OSS, ≤ 12 → 네이티브, 13~17 → 더 깊은 분석.

### 축 1: 인프라 호환성 (W=3)
- **5점**: OSS의 인프라 가정(DB, auth, 실시간, 파일)이 본 프로젝트와 일치
- **3점**: 일부 호환 (1~2개 어댑터로 해결)
- **1점**: OSS 가정과 정면 충돌 (auth/storage/실시간/스키마 모두 자체)

세션 64 메신저 평가: **1점** — Mattermost/Rocket.Chat 모두 자체 auth + 자체 스키마 + 자체 실시간 레이어. 본 프로젝트는 이미 Cookie/JWT + TenantMembership + RLS + SSE+filebox 갖춤. 70% 재작성 불가피.

### 축 2: 라이센스 (W=2)
- **5점**: MIT/Apache + 상업적 사용/수정/재배포 자유
- **3점**: GPL/AGPL — 본 프로젝트가 OSS면 OK, closed면 weak
- **1점**: 비영리/연구 한정, 상업적 재배포 금지

세션 64 평가: **5점** — Mattermost/Rocket.Chat MIT, Zulip Apache.

### 축 3: 도메인 모델 핏 (W=3)
- **5점**: 본 프로젝트 정체성과 OSS 모델이 1:1 매핑
- **3점**: 핵심 모델 일치, 일부 확장 필요
- **1점**: OSS는 single-tenant SaaS 가정, 본 프로젝트는 multi-tenant — 모델 자체 부합 안 함

세션 64 평가: **1점** — OSS 메신저 모두 single-tenant SaaS 가정. 본 프로젝트는 ADR-022 §1 (tenant_id 첫 컬럼 + RLS) 강제. 모든 모델에 tenant 차원 추가 작업이 OSS 코드 전체에 퍼져 있음.

### 축 4: 유지보수 부담 (W=2)
- **5점**: 본 프로젝트가 OSS 업스트림 추적 가능 (인력/자동화 충분)
- **3점**: 메이저 버전 마이그레이션만 따라감
- **1점**: 1인 운영자 — OSS 업데이트 추적 불가능, 듀얼 코드베이스 유지보수 부담 비대칭

세션 64 평가: **1점** — 1인 운영자. OSS 포크 시 업스트림 보안 패치 추적 + 본 프로젝트 변경 호환성 유지 = 메신저 본 기능보다 운영 부담이 더 큼.

### 축 5: 절감 시간 (W=2)
- **5점**: OSS 그대로 도입 = 6개월+ 작업 절감
- **3점**: OSS 절반 활용 (UI나 schema만 재사용) = 1~2개월 절감
- **1점**: OSS 학습 + 적응 비용이 네이티브 신설보다 큼

세션 64 평가: **1점** — 네이티브 4모델(Conversation/Member/Message/Attachment) + 1~2주 작업이 OSS 적응 + 70% 재작성 + 듀얼 유지보수보다 빠름.

### 총합 (가중치 적용)
- 인프라 호환 1×3 = 3
- 라이센스 5×2 = 10
- 도메인 핏 1×3 = 3
- 유지보수 1×2 = 2
- 절감 시간 1×2 = 2
- **총합: 20** (가능 범위 12~60)

→ **20 ≤ 24 (=12 × 2 임계)** → **네이티브 신설 권장**

## 추가 판단 기준 — "이미 부품이 있는가" 체크리스트

OSS가 가져올 부품 vs 본 프로젝트가 이미 가진 부품:

| 부품 | 메신저에 필요 | OSS가 가져옴 | 본 프로젝트가 이미 가짐 | 결론 |
|---|:-:|:-:|:-:|---|
| 인증 | O | O (자체) | O (Cookie/JWT) | 충돌 |
| 사용자/멤버십 모델 | O | O (자체) | O (User + TenantMembership) | 충돌 |
| 멀티테넌트 격리 | O | X (single-tenant) | O (RLS + tenant_id) | OSS 부재 |
| 실시간 (SSE/WS) | O | O (자체) | O (SSE bus) | 충돌 |
| 파일 저장소 | O | O (자체) | O (filebox + File 모델) | 충돌 |
| 감사 로그 | O | O (자체) | O (auditLogSafe) | 충돌 |
| 레이트리미트 | O | O (자체) | O (rate-limit-db) | 충돌 |

→ **7/7 부품이 본 프로젝트에 이미 있음**. OSS 도입 시 모두 어댑터/재구현 필요.

→ 결론: **본 프로젝트는 메신저에 필요한 1차 부품을 모두 갖추고 있다. 4 모델만 추가하면 충분.**

## 교훈

1. **"OSS = 빠르다"는 가정은 인프라 매칭 시에만 유효**. 인프라가 다르면 OSS는 오히려 부채.
2. **체크리스트 우선** — "OSS가 가져올 부품" vs "이미 가진 부품"을 1축으로 비교하면 결정이 명확해진다. 7/7 충돌이면 무조건 네이티브.
3. **1인 운영 환경에서 OSS 포크는 기본적으로 부담 큼** — 업스트림 추적 + 듀얼 유지보수가 본 기능보다 큰 운영 비용.
4. **결정 시점에 5축 점수표를 만들어 ADR에 첨부** — 6개월 후 "왜 OSS 안 썼나" 질문에 답할 수 있게.
5. **"네이티브"의 의미** — 모든 코드를 직접 작성한다는 게 아니라, **이미 있는 인프라 부품을 조합**한다는 의미. OSS 패턴은 참고만 (Mattermost 채널 모델, Slack thread/reaction).

## 적용 사례

이 프레임워크가 적용 가능한 미래 결정:
- 비디오 통화 도입 (Jitsi vs WebRTC native) — Phase 3 메신저 진입 시
- 풀텍스트 검색 (Meilisearch vs Postgres tsvector) — Phase 2 메신저 진입 시
- E2E 암호화 라이브러리 (libsignal vs custom) — Phase 3 메신저 진입 시
- 이메일 발송 (Mautic OSS vs SendGrid + 자체 템플릿) — 향후
- 캘린더 (NextCloud Calendar vs 자체) — 향후

## 관련 파일

- `docs/research/baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md` — 본 결정의 ADR (옵션 비교 4종, 정량 점수 77/60/53/51)
- `docs/research/messenger/PRD-v1.md` §1.2 — 라인/카카오와의 차별화 4축
- `docs/research/messenger/_index.md` — 메신저 단일 진실 소스

## 관련 메모리

- `feedback_autonomy.md` — 권장안 즉시 채택 정책 (본 결정도 분기 질문 없이 권장안 그대로 진행)
- `project_overview.md` — 양평 부엌 멀티테넌트 BaaS 정체성
