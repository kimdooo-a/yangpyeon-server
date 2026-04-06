# 대시보드 플랫폼 진화 — Wave 리서치 마스터 인덱스

> 생성일: 2026-04-06
> 규모: S (~20문서)
> Wave: 3 (S규모 Wave 통합)
> 상태: ✅ 완료

---

## 프로젝트 프로필

| 항목 | 값 |
|------|-----|
| 리서치 주제 | Supabase를 롤모델로 한 대시보드 플랫폼 진화 설계 |
| 핵심 질문 | Supabase의 어떤 기능·UX 패턴을 이 프로젝트에 적용하여 "프로젝트별 데이터 관리 플랫폼"으로 진화시킬 수 있는가? |
| 현재 상태 | 서버 모니터링 대시보드 (CPU/메모리/PM2/로그) |
| 목표 상태 | Supabase-like 프로젝트 관리 플랫폼 |
| 기존 자산 | docs/supabase-wave/ (Supabase 서비스 심층 분석 8문서) |
| 제약 | 1인 개발, WSL2 + PM2, 셀프호스팅, Next.js 16 + TypeScript |

---

## Wave 진행 현황

| Wave | 주제 | 문서 수 | 상태 |
|------|------|---------|------|
| Wave 1 | 롤모델 해부 | 6 | ✅ 완료 |
| Wave 2+3 | 기능 선별 & 기술 비교 | 7 | ✅ 완료 |
| Wave 4+5 | 아키텍처 & 로드맵 | 7 | ✅ 완료 |

---

## Wave 1: 롤모델 해부

| # | 문서 | 상태 |
|---|------|------|
| 1-01 | [Supabase 대시보드 UX 해부](wave-1/01-supabase-dashboard-anatomy.md) | ✅ |
| 1-02 | [Firebase Console 해부](wave-1/02-firebase-console-anatomy.md) | ✅ |
| 1-03 | [Coolify·Portainer 해부](wave-1/03-coolify-portainer-anatomy.md) | ✅ |
| 1-04 | [Railway·Render 해부](wave-1/04-railway-render-anatomy.md) | ✅ |
| 1-05 | [공통 대시보드 UX 패턴](wave-1/05-admin-dashboard-patterns.md) | ✅ |
| 1-06 | [현재 대시보드 갭 분석](wave-1/06-feature-gap-analysis.md) | ✅ |

---

## Wave 2+3: 기능 선별 & 기술 비교

| # | 문서 | 상태 |
|---|------|------|
| 2-01 | [기능 우선순위 매트릭스](wave-2-3/01-feature-priority-matrix.md) | ✅ |
| 2-02 | [DB 관리 UI 구현 방안](wave-2-3/02-db-management-ui.md) | ✅ |
| 2-03 | [Auth 관리 UI 진화](wave-2-3/03-auth-management-evolution.md) | ✅ |
| 2-04 | [스토리지·파일 관리](wave-2-3/04-storage-file-manager.md) | ✅ |
| 2-05 | [실시간 이벤트·로그 강화](wave-2-3/05-realtime-log-events.md) | ✅ |
| 2-06 | [기술 스택 비교](wave-2-3/06-tech-stack-comparison.md) | ✅ |
| 2-07 | [비전 + 요구사항](wave-2-3/07-vision-requirements.md) | ✅ |

---

## Wave 4+5: 아키텍처 & 로드맵

| # | 문서 | 상태 |
|---|------|------|
| 4-01 | [시스템 아키텍처](wave-4-5/01-system-architecture.md) | ✅ |
| 4-02 | [DB 스키마 설계](wave-4-5/02-data-model-schema.md) | ✅ |
| 4-03 | [컴포넌트 아키텍처](wave-4-5/03-component-architecture.md) | ✅ |
| 4-04 | [API 라우트 설계](wave-4-5/04-api-design.md) | ✅ |
| 4-05 | [마이그레이션 전략](wave-4-5/05-migration-strategy.md) | ✅ |
| 4-06 | [단계별 로드맵](wave-4-5/06-phase-roadmap.md) | ✅ |
| 4-07 | [스파이크 사양](wave-4-5/07-spike-specs.md) | ✅ |

---

## 의사결정 질문 (DQ)

| ID | 질문 | 답변 Wave | 상태 |
|----|------|----------|------|
| DQ-1.1 | Supabase의 어떤 핵심 기능/UX가 이 프로젝트에 가장 가치 있는가? | Wave 1 | ⏳ |
| DQ-1.2 | 셀프호스팅(Coolify/Portainer) vs 클라우드(Supabase) 패턴 중 어느 쪽이 적합한가? | Wave 1 | ⏳ |
| DQ-2.1 | DB를 SQLite(로컬)로 갈 것인가 PostgreSQL로 갈 것인가? | Wave 2 | ⏳ |
| DQ-2.2 | 1차 MVP에 포함할 기능 범위는? | Wave 2 | ⏳ |
| DQ-3.1 | 기존 서버 모니터링과 새 데이터 관리 기능의 네비게이션 통합 방안? | Wave 4 | ⏳ |

---

## 참조 자산

- `docs/supabase-wave/wave-1/08-studio-dashboard.md` — Supabase Studio 기능 상세 분석
- `docs/supabase-wave/wave-1/01-database.md` — Supabase Database 분석
- `docs/supabase-wave/wave-1/02-auth.md` — Supabase Auth 분석
- `docs/supabase-wave/wave-1/03-storage.md` — Supabase Storage 분석
