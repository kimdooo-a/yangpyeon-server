# 양평 부엌 서버 — 1인 운영자의 멀티테넌트 백엔드 플랫폼

## CLAUDE.md 관리 규칙 (이 섹션 삭제 금지)

## 프로젝트 정보
- 프로젝트명: 양평 부엌 서버 (stylelucky4u.com) — 1인 운영자의 멀티테넌트 백엔드 플랫폼
- 정체성: 본인 소유 10~20개 프로젝트의 공유 백엔드 (closed multi-tenant BaaS, 외부 가입 없음)
- 스택: Next.js 16 + TypeScript + PostgreSQL (Prisma 7) + SQLite (Drizzle) + Tailwind CSS 4
- 시작일: 2026-04-06 (단일 사용자 도구) → 2026-04-26 (멀티테넌트 BaaS 전환 결정, ADR-022 ACCEPTED 세션 58)
- 배포 환경: WSL2 Ubuntu (PM2) + Cloudflare Tunnel + 단일 PostgreSQL
- 도메인: stylelucky4u.com (본인 사용자 운영 콘솔) + /api/v1/t/<tenant>/* (각 컨슈머 백엔드)
- 포트: 3000 (localhost)
- 첫 컨슈머: Almanac (almanac-flame.vercel.app) — spec/aggregator-fixes 브랜치 진행 중, v1.0 출시 후 plugin 마이그레이션

## 문서 체계 (풀뿌리 트리)

이 파일(CLAUDE.md)이 루트입니다. 모든 기록은 아래 트리를 따라 빠짐없이 연결됩니다.
**역사는 절대 삭제하지 않습니다.**

```
CLAUDE.md (루트 — 지금 이 파일)
│
├─→ docs/rules/_index.md ················ 프로젝트 규칙
│   ├─→ coding-stacks/ ················ 스택별 코딩 규칙
│   ├─→ resource-requests.md ··········· 외부 리소스 요청 양식
│   ├─→ image-files.md ················ 이미지 파일 관리
│   └─→ navigation-connectivity.md ···· 페이지 연결성 규칙 (고아 페이지 방지)
│
├─→ docs/status/current.md ·············· 프로젝트 현황 + 세션 요약표
│   └─→ docs/logs/_index.md ··········· 세션 기록 아카이브 색인
│       └─→ YYYY-MM.md / sessions-MMDD.md
│
├─→ docs/references/_index.md ············ 기술 레퍼런스 색인
│   ├─→ _TEMPLATE_REFERENCE.md ········ 레퍼런스 작성 템플릿
│   ├─→ _NAVIGATION_MAP.md ············ 페이지 라우트 맵 & 연결성 추적
│   │   └─ ⚠️ kdyweb 사용 시 _WEB_CONTRACT.md가 이 파일을 대체
│   ├─→ _WEB_CONTRACT.md ·············· (kdyweb 사용 시) 웹 구조 계약 — 단일 진실 소스
│   ├─→ _SUPABASE_TECH_MAP.md ········· Supabase 13개 모듈 → OSS 기술 매핑 (세션 14)
│   ├─→ _PROJECT_VS_SUPABASE_GAP.md ··· 현 프로젝트 vs Supabase 갭 분석 + P0/P1/P2 (세션 14)
│   └─→ supabase-scrape/ ·············· Supabase 대시보드 스크랩 원본 14개 (세션 14)
│
├─→ docs/handover/_index.md ·············· 인수인계서 마스터 목록
│   ├─→ next-dev-prompt.md ··········· 다음 세션 프롬프트
│   └─→ README.md ····················· 인수인계 프로토콜
│
├─→ docs/guides/README.md ················ 운영 가이드 디렉토리
│
├─→ docs/MASTER-DEV-PLAN.md ··············· 세션별 개발 마스터 계획서 (단일 진실 소스)
│
├─→ docs/research/_SPIKE_CLEARANCE.md ···· 스파이크 코딩 허가 레지스트리
│   └─→ docs/research/decisions/ ········ ADR (Architecture Decision Records)
│
├─→ docs/research/baas-foundation/ ········ 멀티테넌트 BaaS 전환 설계 (ADR-022~029, 2026-04-26~)
│   ├─→ 00-context/ ···················· 사전 분석 (기존 결정 + 코드 매핑)
│   ├─→ 01-adrs/ ······················· ADR-022~029 결정 문서 (8건 ACCEPTED 2026-04-26)
│   │   ├─ ADR-022 (BaaS 정체성 재정의 — ADR-001 부분 supersede)
│   │   ├─ ADR-023 (데이터 격리 — shared+RLS 옵션 B)
│   │   ├─ ADR-024 (Plugin 코드 격리 — hybrid 옵션 D)
│   │   ├─ ADR-025 (인스턴스 모델 — 단일 인스턴스 옵션 A)
│   │   ├─ ADR-026 (Tenant Manifest — TS+DB hybrid 옵션 C)
│   │   ├─ ADR-027 (Multi-tenant Router — URL path A + K3)
│   │   ├─ ADR-028 (Cron Worker Pool — hybrid 옵션 D)
│   │   └─ ADR-029 (Per-tenant Observability — M1+L1+T3 → Phase 4 OTel)
│   ├─→ 02-proposals/ ·················· CLAUDE.md 정체성 재정의 제안서
│   └─→ 03-spikes/ ····················· spike-baas-001 (Prisma) + spike-baas-002 (worker pool)
│
├─→ spikes/README.md ····················· 기술 검증 결과 색인 + Quick Reference
│   ├─→ spike-001-frontend-design/ ······ 프론트엔드 디자인 리서치
│   ├─→ spike-001-sqlite-drizzle-result.md SQLite+Drizzle 검증
│   ├─→ spike-002-sse-result.md ········· SSE+Tunnel 검증
│   └─→ spike-004-shadcn-result.md ······ shadcn/ui 호환 검증
│
├─→ docs/research/spikes/ ················· 추가 기술 스파이크 (세션 14~)
│   ├─→ spike-005-sql-editor.md ······· SQL Editor (monaco + pg 읽기전용)
│   ├─→ spike-005-schema-visualizer.md  Schema Visualizer (@xyflow + DMMF)
│   ├─→ spike-005-advisors.md ········· Advisors (splinter TS 포팅)
│   ├─→ spike-005-edge-functions.md ··· Edge Functions lite (worker_threads)
│   └─→ spike-005-data-api.md ········· Data API auto-gen (Prisma DMMF)
│
└─→ docs/commands/_index.md ·············· 명령어 모음 (복사해서 사용)
```

## 핵심 원칙
- **역사 삭제 금지** — 세션 기록, 인수인계서 등 모든 기록은 영구 보존
- **풀뿌리 연결** — 위 트리를 따라가면 모든 기록에 도달 가능해야 함
- **페이지 연결성** — 모든 페이지는 홈(/)에서 클릭으로 도달 가능해야 함 (`docs/rules/navigation-connectivity.md`)
  - kdyweb 스킬 사용 시: `docs/references/_WEB_CONTRACT.md`가 페이지 라우트 맵의 단일 진실 소스이며, `_NAVIGATION_MAP.md`를 대체합니다
- .env, .env.local, nul 파일 커밋 금지
- 시크릿 키 클라이언트 노출 금지
- 이미지/API키 등 외부 리소스 필요 시 정해진 형식으로 요청

## 멀티테넌트 BaaS 핵심 7원칙 (ADR-022 ACCEPTED 2026-04-26)

이 프로젝트는 1인 운영자가 자기 소유 10~20개 프로젝트의 공유 백엔드로 사용한다. 다음 7원칙은 양보 불가:

1. **Tenant는 1급 시민, prefix가 아니다.** 모든 신규 모델/route/cron/log에 `tenant_id` 첫 컬럼. (ADR-023 옵션 B + RLS)
2. **플랫폼 코드와 컨슈머 코드 영구 분리.** yangpyeon 코드베이스 = 플랫폼만. 컨슈머 도메인 = `packages/tenant-<id>/` plugin. (ADR-024 옵션 D)
3. **한 컨슈머의 실패는 다른 컨슈머에 닿지 않는다.** worker pool 격리, per-tenant timeout/concurrency cap. (ADR-028 옵션 D)
4. **컨슈머 추가는 코드 수정 0줄.** TS manifest + DB 운영 토글만으로 router/cron/auth 자동 구성. (ADR-026 옵션 C)
5. **셀프 격리 + 자동 복구 + 관측성 = 3종 세트 동시.** 셋 중 둘만 가진 기능은 머지 금지. (ADR-029 M1+L1+T3)
6. **불변 코어, 가변 plugin.** 코어(Auth/Audit/Cron/Router/RateLimit)는 6개월에 한 번 변경. 컨슈머별 요구는 plugin으로.
7. **모든 결정은 "1인 운영 가능한 N의 상한"으로 검증.** N=20 컨슈머에서 1인 운영자 감당 가능성이 머지 게이트.

## 프로젝트별 규칙
- 주석/커밋 메시지 한국어
- 스택별 코딩 규칙: docs/rules/coding-stacks/typescript-react.md
- UI: 다크 테마, Supabase 대시보드 스타일 (사이드바 네비게이션, 카드 기반)
- 한국어 UI
- 배포: PM2로 프로세스 관리, Cloudflare Tunnel 경유

### 멀티테넌트 BaaS 운영 규칙 (ADR-022~029 ACCEPTED 2026-04-26)
- **신규 모델 추가 시**: prisma/schema.prisma 첫 줄에 `tenantId String` 강제 + RLS 정책 (ADR-023). PR 리뷰 게이트.
- **신규 라우트 추가 시**: `/api/v1/t/<tenant>/...` 경로 + `withTenant()` 가드 (ADR-027). 글로벌 라우트는 운영 콘솔 전용.
- **컨슈머 등록**: 코드 수정 0줄. `packages/tenant-<id>/manifest.ts` + DB tenants 테이블 row 추가만 (ADR-026).
- **장애 격리 검증**: 새 기능이 cross-tenant 전파 없음을 PR 본문에 증명 (테스트 또는 설계 근거).
- **첫 컨슈머 Almanac**: spec/aggregator-fixes v1.0 그대로 출시, 출시 후 `packages/tenant-almanac/`로 마이그레이션 (ADR-024 부속 결정).

## 세션 시작/종료
- **시작**: `docs/status/current.md` + 최신 `docs/handover/` 인수인계서 확인
- **종료** (4단계):
  1. `docs/status/current.md` 세션 요약표에 1행 추가
  2. 해당 날짜 아카이브에 상세 기록 (`docs/logs/`)
  3. 인수인계서 작성 (`docs/handover/`)
  4. `docs/handover/next-dev-prompt.md` 갱신
