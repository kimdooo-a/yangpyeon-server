# Yangpyeong Messenger — 기획 문서 색인

> **세션 63 (2026-04-26) 산출** · ADR-030 ACCEPTED · Phase 1 4-6주 마일스톤 준비 중

이 디렉토리는 양평 부엌 BaaS 위에 라인/카카오급 메신저 도메인을 신설하기 위한 단일 진실 소스(SoT)이다. ADR-030이 결정 근거이며, 본 색인은 모든 산출물로의 진입점.

## 풀뿌리 트리

```
docs/research/messenger/
├── _index.md ················· (이 파일)
├── PRD-v1.md ················· 메인 PRD (18 섹션, 결정 근거 13건)
├── personas-scenarios.md ····· 페르소나 4종 + BDD 시나리오 24건
├── line-kakao-feature-matrix.md  라인/카카오 50+ 기능 비교 + 양평 채택/스킵/대안
├── wireframes.md ············· 화면 ASCII 와이어프레임 + 데이터 흐름 시퀀스
├── data-model.md ············· Prisma 모델 11종 상세 + RLS 정책 + 인덱스 전략
├── api-surface.md ············ API 라우트 명세 + SSE 채널 키 + 에러 코드 표준
└── milestones.md ············· Phase 1 6주 마일스톤 + Phase 2/3 트리거
```

## 관련 ADR

- **ADR-030** Messenger 도메인 + 2-track Phasing (ACCEPTED 2026-04-26) — `../baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md`
- **ADR-022** BaaS 정체성 7원칙 (메신저 모델 모두 tenant_id 첫 컬럼)
- **ADR-024** Plugin 코드 격리 (Phase 2 분리 시 패턴 참조 — Almanac 5작업일 패턴 재현)
- **ADR-025** 단일 인스턴스 (Phase 1 in-memory bus 정당화)
- **ADR-029** Per-tenant 관측성 (audit 이벤트 10종, Prometheus 메트릭)
- **ADR-031** (예정) Realtime 백본 PG LISTEN/NOTIFY 전환 — Phase 2 진입 시 작성
- **ADR-032** (예정) Messenger Plugin Manifest 스키마 — Phase 2 진입 시 작성

## 외부 산출물

- `~/.claude/plans/agile-imagining-harbor.md` — 세션 63 plan 원본 (개인 영역, ACCEPTED)
- `docs/MASTER-DEV-PLAN.md` — Phase 1 메신저 마일스톤 1행 추가
- `docs/status/current.md` — 세션 63 요약표 1행 추가

## 다음 액션

1. **Phase 1 시작 게이트**:
   - kdyspike #1 (PG NOTIFY+SSE 정합성, 30분) 수행
   - 본 디렉토리 5개 산출물 모두 작성 확인 (PRD/personas/matrix/wireframes/data-model/api-surface/milestones)
2. **Phase 1 W1**:
   - prisma/schema.prisma에 enum 6종 + 모델 11종 추가
   - 마이그 #1~6 작성 + Claude 직접 deploy
3. **Phase 1 종료 시**:
   - Phase 2 진입 결정 — DAU ≥ 30 또는 컨슈머 앱 요구 시점
   - ADR-031, ADR-032 작성 시작
