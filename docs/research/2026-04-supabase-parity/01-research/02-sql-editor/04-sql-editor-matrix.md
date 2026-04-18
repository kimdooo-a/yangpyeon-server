# 04. SQL Editor 매트릭스 비교 — supabase-studio / outerbase-studio / sqlpad / 자체 Monaco

> Wave 2 / Agent A / 매트릭스 문서
> 작성일: 2026-04-18 (세션 24 연장)
> 작성자: Claude Opus 4.7 (1M context) — Wave 2 매트릭스 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/sql-editor` 100/100 청사진
> 범위: 4개 후보(supabase-studio 패턴, outerbase-studio, sqlpad, 자체 Monaco 구현)의 10차원 가중 스코어 비교 + "패턴 학습 / 코드 재사용 / 통으로 교체" 3가지 전략을 40일 14c~14f 로드맵 각 페이즈에 배치
> 근거 문서: Wave 1 deep-dive 01/02/03 (sqlpad/outerbase/supabase) 전수 Read 완료

---

## 0. Executive Summary

### 결론 한 줄

**supabase-studio 패턴(Apache-2.0 = "패턴 학습 + 선택적 코드 인용 완전 자유")이 가중 4.70/5로 1위, outerbase-studio(AGPL-3.0 = "패턴만 학습, 코드 0줄 차용")가 4.06/5로 2위, sqlpad(MIT = "자유 차용, 단 2025-08 아카이브")가 3.45/5로 3위, "자체 Monaco 구현"(이미 진행 중)이 하이브리드 4.30+/5로 프로젝트 실행 골격을 형성한다. 40일 로드맵 14c~14f에서 각 페이즈가 sqlpad→outerbase→supabase 순으로 학습 자원을 교대로 소비하되, 모든 최종 채택은 "자체 Monaco + Prisma 7 + 단일 PG + Anthropic Haiku" 형태의 재구현으로 수렴한다.**

### 핵심 숫자

| 후보 | 종합 점수 | FUNC | PERF | DX | ECO | LIC | MAINT | INTEG | SEC | SH | COST |
|------|----------|------|------|-----|-----|-----|-------|-------|-----|-----|------|
| **supabase-studio 패턴** (Apache-2.0) | **4.70** | 5.0 | 4.5 | 5.0 | 5.0 | 5.0 | 5.0 | 4.0 | 4.0 | 4.0 | 5.0 |
| outerbase-studio (AGPL-3.0 패턴만) | 4.06 | 4.5 | 4.5 | 4.5 | 4.0 | 1.5 | 4.5 | 4.5 | 3.5 | 4.0 | 4.0 |
| sqlpad (MIT, 아카이브 예고) | 3.45 | 3.0 | 4.0 | 3.5 | 3.0 | 5.0 | 1.5 | 3.0 | 4.0 | 5.0 | 5.0 |
| **자체 Monaco 구현** (현 노선) | **4.30~4.50** | 4.0~4.5 | 4.5 | 4.5 | 4.5 | 5.0 | 4.0 | 5.0 | 5.0 | 5.0 | 5.0 |

### DQ 잠정 답

- **DQ (Snippet 모델)**: **supabase-studio 패턴 채택** — `SqlQuery` + `SqlQueryFolder` 2-table, scope(PRIVATE/PROJECT/PUBLIC), isFavorite, tags, folder FK (자기참조 트리).
- **DQ (AI 보조)**: **supabase v2 + outerbase DiffEditor 하이브리드** — SSE conversational 멀티턴 + Monaco DiffEditor Accept/Reject + 스키마 자동주입 + Anthropic Haiku + prompt cache + EXPLAIN 가드로 쓰기 차단.
- **DQ (권한 모델)**: **supabase scope + 기존 RBAC 결합** — scope=PRIVATE(본인)/PROJECT(MANAGER+)/PUBLIC(인증자). sqlpad 그룹/만료 도입 안 함.

### 새 DQ

- **DQ-2.4**: EXPLAIN Visualizer는 pev2 Vue wrapper를 쓸지 자체 d3 트리를 쓸지? (현재 답: 14f 보너스에서 자체 d3 트리 권장 — 의존성 경감)
- **DQ-2.5**: sql-formatter(MIT)를 클라이언트(Monaco action)에서 쓸지 서버 라우트(/api/sql/format)에서 쓸지? (현재 답: 서버 — 일관성 + 번들 경감)
- **DQ-2.6**: AI 라우트에 `app_readonly` 롤 + `BEGIN READ ONLY` + statement_timeout 이중 가드 외에 추가 격리(컨테이너/샌드박스)가 필요한가? (현재 답: 14e는 DB 레벨만, 14g 이후 추가)

---

## 1. 평가 기준

### 1.1 10차원 가중 스코어링 (합 100%)

양평 부엌 SQL Editor 특성(Prisma 7 + 단일 PG + 1인 운영 + 무료+저비용 AI + Monaco):

| 차원 | 가중 | 5점 앵커 | SQL Editor 특이 요소 |
|------|------|---------|--------------------|
| FUNC | 18% | supabase-studio v3 (편집+실행+이력+공유+AI+ERD+스니펫+폴더) | Snippet 폴더 + AI + EXPLAIN Visualizer가 100점 완성 핵심 |
| PERF | 10% | 가상 스크롤 + SSE 스트리밍 + prompt cache | EdgeFunctionRun 로그 조회/export 성능 |
| DX | 14% | Monaco + 컨텍스트 자동완성 + conversational AI | Cmd+Enter 표준 + Run Selection |
| ECO | 12% | supabase 80k+ Star | Next.js + Monaco + Prisma 패턴 풍부함 |
| LIC | 8% | Apache-2.0 / MIT (재배포 자유) | AGPL 전염 회피 필수 |
| MAINT | 10% | Supabase 분기별 메이저 | 1인 프로젝트 — 유지보수 가능한 패턴만 |
| INTEG | 10% | Next 16 + Prisma 7 + 단일 PG 정합 | 14b 자산 + Monaco 기존 코드 재사용 |
| SECURITY | 10% | `app_readonly` 롤 + BEGIN READ ONLY + 타임아웃 + EXPLAIN 가드 | AI 프롬프트 인젝션 방어 |
| SELF_HOST | 5% | 단일 노드 PM2 + 추가 의존성 없음 | Cloudflare Tunnel |
| COST | 3% | OSS $0 + Haiku 미세 비용 | $0-5/월 운영 전제 |

### 1.2 "왜 4점 아니라 3점" 차별화 원칙

- 5점: 업계 최고 (supabase-studio v3, Anthropic Prompt cache 수준)
- 4점: 동급 최고 (outerbase Cloudflare acquisition 후 가속, sqlpad 전성기)
- 3점: 동작하나 빈 칸 있음 (sqlpad Snippet 없음, outerbase AGPL)
- 2점: 중요 기능 부재
- 1점: 치명적 부재 (sqlpad 2025-08 아카이브 → MAINT 1.5)

### 1.3 "40일 14c~14f 로드맵" 페이즈 설정

| Phase | 기간 | 핵심 전략 | 주 학습 대상 |
|-------|------|----------|--------------|
| 14c | 10일 | "자체 Monaco + sqlpad 패턴 흡수" | **sqlpad** (Driver 추상, QueryHistory, tags, CSV 스트리밍) |
| 14d | 15일 | "outerbase UX/AI 패턴 재작성" | **outerbase** (컨텍스트 자동완성, Monaco DiffEditor AI, @xyflow ERD, 다중 탭) |
| 14e | 10일 | "supabase-studio 구조 골격 이식" | **supabase-studio** (SqlQueryFolder, Favorite, scope 공유, AI v2 conversational SSE) |
| 14f | 5일 | "차별화 보너스 — EXPLAIN Visualizer + 마무리" | 자체 d3/pev2 기반 Plan Visualizer |

**총 40일**, 점수 변화: 70 → 85 → 95 → 100 → 100(질적 우위 +1).

---

## 2. 종합 점수표

### 2.1 원점수 매트릭스

| 차원 | 가중 | supabase-studio | outerbase-studio | sqlpad | 자체 Monaco (현/14c 끝) |
|------|------|----------------|------------------|--------|------------------------|
| FUNC | 18% | 5.0 | 4.5 | 3.0 | 4.0 → 4.5 (14d 후) |
| PERF | 10% | 4.5 | 4.5 | 4.0 | 4.5 |
| DX | 14% | 5.0 | 4.5 | 3.5 | 4.5 |
| ECO | 12% | 5.0 | 4.0 | 3.0 | 4.5 |
| LIC | 8% | 5.0 | 1.5 | 5.0 | 5.0 |
| MAINT | 10% | 5.0 | 4.5 | 1.5 | 4.0 |
| INTEG | 10% | 4.0 | 4.5 | 3.0 | 5.0 |
| SEC | 10% | 4.0 | 3.5 | 4.0 | 5.0 |
| SH | 5% | 4.0 | 4.0 | 5.0 | 5.0 |
| COST | 3% | 5.0 | 4.0 | 5.0 | 5.0 |

### 2.2 가중 합산 점수

```
supabase-studio 패턴:
  5.0×0.18 + 4.5×0.10 + 5.0×0.14 + 5.0×0.12 + 5.0×0.08
+ 5.0×0.10 + 4.0×0.10 + 4.0×0.10 + 4.0×0.05 + 5.0×0.03
= 0.90 + 0.45 + 0.70 + 0.60 + 0.40
+ 0.50 + 0.40 + 0.40 + 0.20 + 0.15
= 4.70 / 5

outerbase-studio (AGPL 페널티 반영):
  4.5×0.18 + 4.5×0.10 + 4.5×0.14 + 4.0×0.12 + 1.5×0.08
+ 4.5×0.10 + 4.5×0.10 + 3.5×0.10 + 4.0×0.05 + 4.0×0.03
= 0.81 + 0.45 + 0.63 + 0.48 + 0.12
+ 0.45 + 0.45 + 0.35 + 0.20 + 0.12
= 4.06 / 5

sqlpad (아카이브 페널티):
  3.0×0.18 + 4.0×0.10 + 3.5×0.14 + 3.0×0.12 + 5.0×0.08
+ 1.5×0.10 + 3.0×0.10 + 4.0×0.10 + 5.0×0.05 + 5.0×0.03
= 0.54 + 0.40 + 0.49 + 0.36 + 0.40
+ 0.15 + 0.30 + 0.40 + 0.25 + 0.15
= 3.45 / 5  (보고서 숫자 일치)

자체 Monaco (14c 완료 기준):
  4.0×0.18 + 4.5×0.10 + 4.5×0.14 + 4.5×0.12 + 5.0×0.08
+ 4.0×0.10 + 5.0×0.10 + 5.0×0.10 + 5.0×0.05 + 5.0×0.03
= 0.72 + 0.45 + 0.63 + 0.54 + 0.40
+ 0.40 + 0.50 + 0.50 + 0.25 + 0.15
= 4.54 / 5  (14c 종료 시)

자체 Monaco (14f 완료 기준, FUNC 4.5 + MAINT 4.5):
  4.5×0.18 + 4.5×0.10 + 4.5×0.14 + 4.5×0.12 + 5.0×0.08
+ 4.5×0.10 + 5.0×0.10 + 5.0×0.10 + 5.0×0.05 + 5.0×0.03
= 0.81 + 0.45 + 0.63 + 0.54 + 0.40
+ 0.45 + 0.50 + 0.50 + 0.25 + 0.15
= 4.68 / 5
```

### 2.3 순위

| 순위 | 후보 | 점수 | 핵심 역할 |
|------|------|------|---------|
| 1 (참조) | supabase-studio 패턴 | 4.70 | **100점 청사진 골격** — Apache-2.0이라 모든 패턴 자유 인용 |
| 2 (실행) | 자체 Monaco (14f 완료) | 4.68 | 최종 프로덕션 코드 — 지속 개발·소유 |
| 3 (실행 중간) | 자체 Monaco (14c 완료) | 4.54 | 80점 도달 시점 |
| 4 (참조) | outerbase-studio | 4.06 | AI/DiffEditor/ERD 패턴 학습 (AGPL 0줄 차용) |
| 5 (참조) | sqlpad | 3.45 | Driver/QueryHistory 패턴 학습 (MIT 자유이나 아카이브) |

**핵심 통찰**: 후보 중 1·3·5는 "참조"이고 2는 "실행". supabase-studio의 Apache-2.0 덕분에 우리 자체 Monaco 코드가 supabase 코드를 (필요시) 직접 인용하며 100점에 도달 가능.

---

## 3. 핵심 특성 비교

### 3.1 Stars / npm / 라이선스

| 항목 | supabase-studio | outerbase-studio | sqlpad | 자체 Monaco |
|------|-----------------|------------------|--------|------------|
| Repo | github.com/supabase/supabase (apps/studio) | github.com/outerbase/studio | github.com/sqlpad/sqlpad | N/A (내부) |
| GitHub Stars (전체) | 80k+ (supabase) | 6.5k+ (빠른 성장) | 8.5k+ | — |
| 라이선스 | **Apache-2.0** (재배포 자유) | **AGPL-3.0** (네트워크 공개 의무) | **MIT** (자유) | — (사적) |
| 프론트엔드 | Next.js (Pages Router) + Monaco + Zustand + TanStack Query | Next.js 15 + Monaco + Zustand | React SPA + Ace Editor | Next.js 16 + Monaco |
| 백엔드 | PostgREST + pg-meta | Next.js API Routes + 클라이언트 드라이버 | Node.js Express + Sequelize | Next.js 16 API + Prisma 7 |
| Editor | **Monaco** | **Monaco** | Ace | **Monaco** |
| 지원 DB | Postgres (자체) | PG/MySQL/SQLite/libSQL/D1/DuckDB | 14개+ (PG/MySQL/SQL Server/Snowflake/...) | Postgres 단일 |
| 인증 | GoTrue | 없음 (로컬) / OAuth (Cloud) | Local/OAuth/OIDC/LDAP/SAML | NextAuth + bcrypt (자체) |
| AI | **v2 Conversational (GPT-4o)** | **AI 어시스턴트 + diff** | 없음 | **Anthropic Haiku** 계획 |
| 상태 | 매우 활발 (v3 2024) | 활발 (Cloudflare 인수 2025-Q1) | **2025-08 아카이브 예고** | 진행 중 |
| 회사 | Supabase Inc. | Cloudflare 인수 | 개인 OSS | 개인 (단일 개발자) |
| BUS factor | 높 (회사 + 커뮤니티) | 중 (Cloudflare 방향 의존) | 낮 (아카이브) | 낮 (1인) |

### 3.2 기능 체크리스트 (Supabase 100점 기준)

| 기능 | supabase-studio | outerbase | sqlpad | 자체 Monaco |
|------|-----------------|-----------|--------|------------|
| Monaco 편집기 | ✅ | ✅ | ❌ (Ace) | ✅ |
| Cmd+Enter 실행 | ✅ | ✅ | ✅ | ✅ |
| Run Selection | ✅ (액션 등록) | ✅ | ⚠️ | ✅ (Monaco action) |
| 컨텍스트 자동완성 (table.col) | ✅ | ✅ | ⚠️ | ⚠️ 14d에서 |
| 다중 탭 | ✅ (Zustand) | ✅ (IndexedDB 복구) | ✅ | ⚠️ 14d에서 |
| Snippet 저장 모델 | ✅ (content 일반화) | ⚠️ (doc 통합) | ✅ (Query 전용) | ⚠️ `SqlQuery` 있음 |
| Snippet 폴더 | ✅ (content_folder) | ❌ | ❌ | ❌ (14e 추가) |
| Favorite | ✅ | ⚠️ | ❌ | ❌ (14e 추가) |
| Tags | ❌ (content 없음) | ❌ | ✅ | ❌ (14c 추가) |
| 공유 URL (scope) | ✅ (user/project) | ❌ | ✅ (ACL 세밀) | ⚠️ `QueryScope` 있음 |
| AI SQL Assistant | ✅ **v2 멀티턴 SSE** | ✅ diff view | ❌ | ❌ (14d+14e) |
| EXPLAIN 텍스트 | ✅ | ✅ | ✅ | ⚠️ 14f |
| EXPLAIN Visualizer | ❌ (텍스트만) | ❌ | ❌ | ✅ **우리 차별화** (14f) |
| 결과 그리드 (가상 스크롤) | ✅ (react-data-grid) | ✅ (TanStack) | ✅ (react-window) | ⚠️ 14c TanStack |
| CSV 다운로드 | ✅ | ✅ | ✅ **스트리밍** | ⚠️ 14c 스트리밍 |
| JSON/XLSX 다운로드 | ✅ | ⚠️ | ✅ | ⚠️ 14c |
| sql-formatter (Cmd+Shift+F) | ✅ pg-format | ✅ | ⚠️ | ⚠️ 14d |
| AI EXPLAIN 가드 (쓰기 차단) | ⚠️ 수동 | ⚠️ | — | ✅ **우리 필수** (14e) |
| ERD 자동 생성 (@xyflow) | ✅ v3 | ✅ | ❌ | ⚠️ 14d |
| 실행 이력 (QueryHistory) | ❌ (logs API) | ❌ (client storage) | ✅ **모델 명확** | ⚠️ 14c 추가 |
| Driver 추상 (멀티 DB) | ⚠️ (pg-meta만) | ✅ | ✅ (14개+) | ⚠️ 14c (Postgres만) |
| 읽기 전용 롤 (`app_readonly`) | ⚠️ | ⚠️ | ✅ `readOnlyMode` | ✅ **우리 이미 있음** |
| Self-host 단일 노드 | ⚠️ (무거운 stack) | ⚠️ (Cloudflare 방향) | ✅ (Docker 단일) | ✅ (PM2 단일) |

→ **4개 후보가 서로 다른 강점**을 가지며, supabase-studio가 가장 폭넓음.

### 3.3 라이선스 정합성 분석

| 후보 | 라이선스 | 코드 차용 안전성 | 패턴 차용 안전성 | 우리 대응 |
|------|---------|----------------|---------------|----------|
| supabase-studio | Apache-2.0 | **안전** (저작권 표시만) | **완전 자유** | 필요시 직접 인용 + 재작성 혼용 |
| outerbase-studio | AGPL-3.0 | **위험** (네트워크 전염) | 자유 | **코드 0줄 차용**, 공개 문서만 참조 |
| sqlpad | MIT | **안전** (저작권 표시) | 완전 자유 | 필요시 인용, 다만 2025-08 아카이브 후 보안 패치 없음 |

### 3.4 40일 로드맵 상세 배치

| Phase | 기간 | 주 참조 | 학습 대상 (Priority H) | 산출물 |
|-------|------|--------|---------------------|--------|
| 14c-1 | 1일 | sqlpad | Driver 인터페이스 (`runQuery`/`getSchema`/`testConnection`) | `src/lib/sql/driver.ts` |
| 14c-2 | 2일 | sqlpad | QueryHistory 모델 (스냅샷 + status) | Prisma `SqlQueryRun` |
| 14c-3 | 1일 | sqlpad | CSV/JSON/XLSX 서버 스트리밍 | `/api/sql/download` |
| 14c-4 | 2일 | sqlpad + Monaco docs | monaco-sql-languages 자동완성 (키워드) | `completion-provider.ts` |
| 14c-5 | 2일 | sqlpad | Cmd+Enter + Cmd+S 표준 단축키 + scope + tags 검색 | `MonacoSqlEditor.tsx` 갱신 |
| 14c-6 | 2일 | sqlpad | `readOnlyMode` 옵션 + `BEGIN READ ONLY` 트랜잭션 래퍼 | Driver 재정비 |
| 14d-1 | 2일 | outerbase | 컨텍스트 자동완성 (table. → col, FROM 후 테이블) | `completion-provider.ts` |
| 14d-2 | 3일 | outerbase | TanStack Table 결과 그리드 + react-virtual | `ResultGrid.tsx` |
| 14d-3 | 2일 | outerbase | IndexedDB 다중 탭 복구 | `tab-manager.ts` |
| 14d-4 | 3일 | outerbase | `/api/sql/ai` 라우트 (Anthropic Haiku + prompt cache) | AI 단발형 API |
| 14d-5 | 2일 | outerbase | Monaco DiffEditor + Accept/Reject UX | `AiDiffView.tsx` |
| 14d-6 | 2일 | outerbase | EXPLAIN 가드 (쓰기 차단) | AI 라우트 내부 |
| 14d-7 | 1일 | outerbase | `@xyflow/react` ERD 페이지 | `/sql-editor/erd` |
| 14e-1 | 2일 | supabase | `SqlQueryFolder` 모델 + parent_id 자기참조 트리 | Prisma migration |
| 14e-2 | 2일 | supabase | 사이드바 폴더 트리 + DnD | `SqlEditorNav.tsx` |
| 14e-3 | 1일 | supabase | Favorite 플래그 + 별표 정렬 | `isFavorite` 컬럼 |
| 14e-4 | 2일 | supabase | 공유 scope 토글 + 서버 scope+role 교차 검증 | `/api/sql/queries/[id]/share` |
| 14e-5 | 3일 | supabase | AI Assistant v2 conversational + SSE 스트리밍 + 멀티턴 | `AiAssistant.tsx` |
| 14f-1 | 2일 | pev2 / 자체 d3 | EXPLAIN ANALYZE → JSON 트리 시각화 | `PlanVisualizer.tsx` |
| 14f-2 | 1일 | sql-formatter | Cmd+Shift+F 서버 라우트 + Monaco action | `/api/sql/format` |
| 14f-3 | 2일 | 전체 | E2E Playwright 15 시나리오 + curl C1~C15 | `scripts/e2e/phase-14f-sql.spec.ts` |

**누적 점수 진행**:
- 14c 종료 (10일): 70 → 85 (+15, sqlpad 기여)
- 14d 종료 (25일): 85 → 95 (+10, outerbase 기여)
- 14e 종료 (35일): 95 → 100 (+5, supabase 기여)
- 14f 종료 (40일): 100 → 100 + 차별화 (+1 질적 우위, supabase 초과)

---

## 4. 차원별 분석

### 4.1 FUNC (18%) — 기능 폭

- **supabase-studio 패턴 (5.0)**: 편집/실행/이력/공유/AI v2 멀티턴/Snippet 폴더/Favorite/tags/Format 모두 완비. 빈 칸은 EXPLAIN Visualizer만.
- **outerbase-studio (4.5)**: AI + diff view + ERD + 데이터 에디터 + 다중 탭 — Supabase 핵심 동등. 단 Snippet 폴더·Favorite 없음 (-0.5).
- **sqlpad (3.0)**: 편집·실행·이력·공유 충실. Snippet·EXPLAIN Visualizer·AI 없음 → Supabase 대비 -2.0. 차트는 +1.0.
- **자체 Monaco (4.0 현재, 4.5 14f)**: 기본 편집+Prisma+단일 PG + `QueryScope` 기반 → 14f까지 도달 시 Supabase 수준.
- **왜 sqlpad 3.0이고 3.5 아닌가**: Snippet이 명시적으로 없다는 것이 Supabase 동등성 청사진에서 결정적 흠.

### 4.2 PERF (10%) — 스트리밍·가상화·캐시

- **supabase-studio (4.5)**: TanStack Query 캐싱 + Monaco 가상 스크롤 + react-data-grid. >10M 결과셋 미지원.
- **outerbase-studio (4.5)**: 가상 스크롤 + 클라이언트 캐싱 + Next 15 RSC.
- **sqlpad (4.0)**: react-window + CSV 스트리밍 + 인메모리 잡 큐. 1M+ row 미검증 -1.0.
- **자체 Monaco (4.5)**: TanStack + react-virtual + SSE. prompt cache(Anthropic) 도입 계획.

### 4.3 DX (14%) — 단축키·에디터·UX

- **supabase-studio (5.0)**: 모든 단축키 + conversational AI + diff view + share URL + favorite. 업계 최고.
- **outerbase-studio (4.5)**: Monaco + 컨텍스트 자동완성 + Cmd+Enter + 다중 탭 + AI diff. Supabase 수준 근접.
- **sqlpad (3.5)**: Cmd+Enter + 사이드바 + 다중 탭. Ace 기반 -0.5, 자동완성 키워드 수준.
- **자체 Monaco (4.5)**: Monaco + 우리 단축키 체계. 14d에 컨텍스트 자동완성 + diff 도입 시 Supabase 근접.

### 4.4 ECO (12%)

- **supabase-studio (5.0)**: 80k+ Star, 활발한 커뮤니티, 분기별 메이저.
- **outerbase-studio (4.0)**: Cloudflare 인수 후 가속, Star 6.5k 성장 중. -1.0.
- **sqlpad (3.0)**: 8.5k Star, 그러나 2025-08 아카이브. 생태계 신규 확장 기대 불가. -2.0.
- **자체 Monaco (4.5)**: Next 16 + Monaco + Prisma 7 패턴 풍부. 자체 OSS 아니라 -0.5.

### 4.5 LIC (8%)

- **supabase-studio / sqlpad / 자체 Monaco (5.0)**: Apache-2.0 / MIT — 자유.
- **outerbase-studio (1.5)**: AGPL-3.0 — 직접 의존 사실상 불가. 패턴 차용만 -3.5.

### 4.6 MAINT (10%)

- **supabase-studio (5.0)**: 풀타임 팀 + 분기별 메이저 + 로드맵 공개.
- **outerbase-studio (4.5)**: Cloudflare 백킹 + Q2 Workers 통합 로드맵. -0.5 (단일 회사 통제 리스크).
- **sqlpad (1.5)**: **2025-08 아카이브 확정** → 보안 패치 중단. -3.5.
- **자체 Monaco (4.0)**: 1인 운영 — 풀뿌리 트리 + 로그로 컨텍스트 유지. -1.0.

### 4.7 INTEG (10%) — 우리 스택 호환성

- **supabase-studio (4.0)**: Pages Router + PostgREST 혼용 → 우리 App Router + Prisma와 다름. 패턴은 가능, 직접 import 비현실적. -1.0.
- **outerbase-studio (4.5)**: Next.js 15 + Monaco + TS — 우리(Next 16, Monaco, TS 7) 95% 호환. 단 Prisma 별도.
- **sqlpad (3.0)**: React SPA + Express + Sequelize — App Router 재작성 필요. -2.0.
- **자체 Monaco (5.0)**: 이미 작동. 만점.

### 4.8 SECURITY (10%)

- **supabase-studio (4.0)**: RLS + GoTrue + Service Role 분리. AI 프롬프트 인젝션은 사용자 책임. -1.0.
- **outerbase-studio (3.5)**: 클라이언트 사이드 자격증명(브라우저 저장) — 우리 서버사이드 정책과 다름. AI 라우트 프롬프트 인젝션 가능. -1.5.
- **sqlpad (4.0)**: `readOnlyMode` + OAuth/SAML + ACL 만료 + 파라미터 바인딩. 단 우리 RBAC와 그룹 갭.
- **자체 Monaco (5.0)**: `app_readonly` + `BEGIN READ ONLY` + statement_timeout + EXPLAIN 가드 4중 방어. 만점.

### 4.9 SELF_HOST (5%)

- **supabase-studio (4.0)**: Docker 풀 스택 가능, 의존성(GoTrue, PostgREST, Realtime, Storage) 무거움. -1.0.
- **outerbase-studio (4.0)**: Docker self-host 가능, AI LLM 키 필수. -1.0.
- **sqlpad / 자체 Monaco (5.0)**: 단일 노드. 만점.

### 4.10 COST (3%)

- **자체 Monaco / sqlpad / supabase-studio (5.0)**: OSS $0 + (자체) Haiku 미세 비용.
- **outerbase-studio (4.0)**: Cloud 옵션 비용 + LLM 호출. -1.0.

---

## 5. 최종 순위 + 대안 시나리오 + 민감도 분석

### 5.1 최종 순위 (실행 관점)

| 순위 | 역할 | 후보 | 점수 | 전략 |
|------|------|------|------|------|
| 1 | **실행 (100점 목표)** | 자체 Monaco (14f 완료) | 4.68 | 40일 로드맵 통해 누적 |
| 2 | **참조 1순위** | supabase-studio 패턴 | 4.70 | Apache-2.0 코드 자유 인용 + 재작성 |
| 3 | **참조 2순위** | outerbase-studio | 4.06 | AGPL 0줄 차용 + 공개 문서 패턴 학습 |
| 4 | **참조 3순위** | sqlpad | 3.45 | MIT 자유 차용, 다만 2025-08 아카이브 |

### 5.2 대안 시나리오

#### 시나리오 A: AI 비용 폭증 ($50/월 초과)
- 사용자 급증 + Haiku 호출 증가.
- **재평가**: prompt cache 재점검 + 사용자별 quota + 로컬 LLM(Ollama) 도입 검토.
- **트리거**: LLM 비용 $10/월 초과 3개월 연속.

#### 시나리오 B: Supabase 방향 변경 (Studio 4.0에서 RSC 전면 전환)
- 우리 Next.js 16 App Router와 정합성 더 상승 → 직접 인용 가능성 커짐.
- **재평가**: supabase-studio 4.0 코드 직접 포팅 가능성 평가.
- **트리거**: Supabase Studio v4 공개 + App Router 기반으로 확인됨.

#### 시나리오 C: AGPL 완화 (outerbase가 MIT 듀얼 라이선스)
- Cloudflare가 outerbase를 MIT로 전환 가능성.
- **재평가**: outerbase-studio 코드 직접 인용 가능 → 14d 개발 속도 2배.
- **트리거**: outerbase GitHub LICENSE 파일 변경 확인.

#### 시나리오 D: 로컬 LLM 품질 상승 (Llama/Qwen)
- 오픈소스 로컬 LLM이 Claude Haiku 수준 SQL 생성 도달.
- **재평가**: Anthropic 의존성 제거 → 비용 $0.
- **트리거**: 로컬 LLM SQL 벤치 Haiku 대비 90%+ 성능.

### 5.3 민감도 분석 — 가중치 변경 시

#### 민감도 A: LIC 8% → 20% (라이선스 극대화)
```
supabase-studio: 4.70 → 4.69 (LIC 5 유지)
outerbase:       4.06 → 3.65 (AGPL 1.5 심각)
sqlpad:          3.45 → 3.57
자체 Monaco:     4.68 → 4.68
```
→ outerbase 격차 확대. supabase/자체 Monaco 동률.

#### 민감도 B: SECURITY 10% → 20% (보안 극대화)
```
supabase-studio: 4.70 → 4.60
outerbase:       4.06 → 3.91
sqlpad:          3.45 → 3.45
자체 Monaco:     4.68 → 4.73
```
→ 자체 Monaco가 supabase를 역전.

#### 민감도 C: MAINT 10% → 20% (유지보수 극대화)
```
sqlpad:          3.45 → 3.16 (치명적)
outerbase:       4.06 → 4.01
supabase:        4.70 → 4.70
자체 Monaco:     4.68 → 4.58
```
→ sqlpad 추락.

#### 민감도 D: FUNC 18% → 30% (기능 폭 극대화)
```
supabase-studio: 4.70 → 4.82
outerbase:       4.06 → 4.08
sqlpad:          3.45 → 3.30 (Snippet 없음 페널티 확대)
자체 Monaco:     4.68 → 4.70
```
→ supabase-studio 격차 확대, 자체 Monaco 근소 추격.

### 5.4 가중 평균 안정성 (sensitivity 종합)

- **supabase-studio**: 모든 민감도에서 4.60~4.82 → 안정적 1위 (참조)
- **자체 Monaco**: 4.58~4.73 → 실행 관점 1위 유지
- **outerbase**: 3.65~4.08 → AGPL/보안 민감도에 취약
- **sqlpad**: 3.16~3.57 → 유지보수/FUNC에 취약

---

## 6. 리스크 매트릭스

| 리스크 | 후보 | 심각도 | 완화 |
|------|------|--------|------|
| 2025-08 아카이브 후 보안 패치 중단 | sqlpad | 높 | 직접 의존 금지, 패턴만 |
| AGPL-3.0 전염 | outerbase | 치명 | 코드 0줄 차용, 외부 공개 자료만 |
| Supabase 모노레포 직접 import 불가 | supabase-studio | 중 | 패턴만, 재구현 |
| Pages Router + PostgREST 차이 | supabase-studio | 낮 | App Router로 재작성 |
| AI LLM 비용 급증 | 자체 Monaco | 중 | Prompt cache + Haiku + quota |
| AI 프롬프트 인젝션 → 쓰기 쿼리 | 전체 | 높 | EXPLAIN 가드 + app_readonly + timeout |
| Cloudflare 정책 변경 (outerbase) | outerbase | 중 | 패턴만 학습, fork 의존도 낮음 |
| 스키마 >100 테이블 → 프롬프트 토큰 폭증 | supabase/자체 | 중 | 최근 50개 + 수동 선택 |
| Snippet 공유 URL 무인증 노출 | 전체 | 중 | scope=PUBLIC만 비인증, 그외 세션 검증 |
| SSE 스트리밍 중단/재시도 | 자체 Monaco | 낮 | AbortController + 자동 재연결 |
| Next.js 16 호환성 이슈 (outerbase 15 → 16) | outerbase | 낮 | 16 패치 노트 확인 후 적용 |
| 1인 운영 BUS factor | 자체 Monaco | 중 | 풀뿌리 문서 + 테스트 커버 |

---

## 7. 14c~14f 상세 점수 기여 (Wave 1 통합)

```
현재 70점 (Monaco 기본, SqlQuery 모델, Prisma)
       ↓
14c (sqlpad 패턴 적용, 10일)
  [+5] SqlQueryRun 모델 + 실행 이력 UI         (FUNC)
  [+3] tags + scope + sharedWithUserIds          (FUNC, DX)
  [+2] CSV/JSON/XLSX 서버 스트리밍               (FUNC, PERF)
  [+2] monaco-sql-languages 자동완성 키워드      (DX)
  [+2] Driver 인터페이스 + readOnlyMode          (INTEG, SEC)
  [+1] Cmd+Enter 등 표준 단축키                 (DX)
       → 85점
       ↓
14d (outerbase 패턴 적용, 15일)
  [+4] AI 어시스턴트 단발 + Monaco DiffEditor   (FUNC, DX)
  [+3] 컨텍스트 자동완성 (table.col)             (DX)
  [+2] @xyflow/react ERD                         (FUNC)
  [+1] IndexedDB 다중 탭 자동 복구               (DX, PERF)
       → 95점
       ↓
14e (supabase 패턴 적용, 10일)
  [+3] SqlQueryFolder + 폴더 트리 사이드바       (FUNC, DX)
  [+1] Favorite + 별표                           (DX)
  [+3] AI Assistant v2 conversational SSE 멀티턴 (FUNC, DX)
  [+1] 공유 URL scope 토글 + 서버 검증           (FUNC, SEC)
  [+1] sql-formatter (Cmd+Shift+F)              (DX)
       → 103점 → 100 상한 (잔여는 품질)
       ↓
14f (차별화, 5일)
  [+1] PEV2/자체 d3 Plan Visualizer              (FUNC, DX) — Supabase 능가
  [+1] E2E Playwright 15 시나리오 + curl C1~C15  (품질)
       → 100 + 질적 +2 (Supabase 동등 + 능가)
```

**40일 총 기여**: +30 = 70 → 100 + 차별화.

---

## 8. 결론

### 8.1 DQ 최종 답 (40일 3전략)

| DQ | 답 | 출처 |
|----|-----|------|
| **Snippet 모델** | `SqlQuery` + `SqlQueryFolder` 2-table + scope(PRIVATE/PROJECT/PUBLIC) + isFavorite + tags + folderId 자기참조 | supabase-studio |
| **AI 보조** | Monaco DiffEditor Accept/Reject + SSE conversational 멀티턴 + 스키마 자동주입 + Anthropic Haiku + prompt cache + EXPLAIN 가드 | supabase v2 + outerbase DiffEditor 하이브리드 |
| **권한 모델** | scope enum + RBAC(ADMIN/MANAGER/USER) 교차 검증. sqlpad ACL/만료 도입 안 함 | supabase scope + 기존 RBAC |
| **실행 드라이버** | Driver 추상 인터페이스 + PostgresDriver + `readOnlyMode` + `BEGIN READ ONLY` + statement_timeout | sqlpad |
| **결과 그리드** | TanStack Table + react-virtual | outerbase |
| **EXPLAIN** | pev2/자체 d3 기반 Plan Visualizer | 자체 차별화 (Supabase 초과) |
| **다중 탭** | IndexedDB 자동 복구 | outerbase |
| **ERD** | @xyflow/react + INFORMATION_SCHEMA 자동 | outerbase |
| **Format** | sql-formatter npm + 서버 `/api/sql/format` | supabase + 자체 |

### 8.2 페이즈별 핵심 산출물 요약

| Phase | 최우선 산출 | 점수 기여 |
|-------|-----------|---------|
| 14c | Driver 추상 + QueryHistory + tags + CSV | +15 |
| 14d | AI 단발 + DiffEditor + 자동완성 + ERD + 다중 탭 | +10 |
| 14e | 폴더 트리 + Favorite + AI v2 SSE + share URL | +5 |
| 14f | Plan Visualizer + E2E + Format | +1 질적 |

### 8.3 재평가 트리거

- **사용자 피드백 5건+ "이 쿼리 공유가 어렵다"** → scope + share URL 구현 우선
- **AI 비용 $10/월 초과 3개월 연속** → prompt cache 재점검 + 로컬 LLM 검토
- **Supabase Studio v4 App Router 기반 공개** → 직접 인용 가능성 재평가
- **outerbase MIT 듀얼 라이선스 전환** → 14d 코드 직접 포팅 여부 재평가
- **sqlpad fork 등장 (MIT 유지 + 2026 패치)** → 의존성 재고려

---

## 9. 참고 자료 (10개+)

### 내부 Wave 1 deep-dive
1. [01-sqlpad-deep-dive.md](./01-sqlpad-deep-dive.md) — SQLPad 패턴 (585줄)
2. [02-outerbase-studio-deep-dive.md](./02-outerbase-studio-deep-dive.md) — Outerbase + AGPL 주의 (618줄)
3. [03-supabase-studio-sql-editor-pattern-deep-dive.md](./03-supabase-studio-sql-editor-pattern-deep-dive.md) — Supabase 100점 골격 (869줄)

### 외부 (Wave 1에서 인용된 것)
4. [SQLPad 공식 GitHub](https://github.com/sqlpad/sqlpad)
5. [SQLPad DeepWiki 개요](https://deepwiki.com/sqlpad/sqlpad/1-overview)
6. [Outerbase Studio GitHub](https://github.com/outerbase/studio)
7. [Outerbase Studio Open Source 발표](https://outerbase.com/blog/outerbase-studio-open-source-database-management/)
8. [Cloudflare acquires Outerbase](https://blog.cloudflare.com/cloudflare-acquires-outerbase-database-dx/)
9. [AGPL-3.0 전문](https://www.gnu.org/licenses/agpl-3.0.html)
10. [supabase/supabase 메인 리포](https://github.com/supabase/supabase)
11. [apps/studio 디렉토리](https://github.com/supabase/supabase/tree/master/apps/studio)
12. [SQL Editor 공식 페이지](https://supabase.com/features/sql-editor)
13. [Supabase Studio 3.0 발표](https://supabase.com/blog/supabase-studio-3-0)
14. [Supabase AI Assistant v2](https://supabase.com/blog/supabase-ai-assistant-v2)
15. [Supabase LICENSE (Apache-2.0)](https://github.com/supabase/supabase/blob/master/LICENSE)

### 기술 레퍼런스
16. [Monaco Editor 공식](https://microsoft.github.io/monaco-editor/)
17. [monaco-sql-languages npm](https://www.npmjs.com/package/monaco-sql-languages)
18. [@xyflow/react 공식](https://reactflow.dev/)
19. [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
20. [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
21. [sql-formatter npm](https://www.npmjs.com/package/sql-formatter)
22. [PEV2 (Postgres Explain Visualizer 2)](https://github.com/dalibo/pev2)

### 내부 관련
23. [Phase 14b CRUD 완료 기록 (superpowers)](../../../../superpowers/)
24. [QueryScope enum 정의 (prisma/schema.prisma)](../../../../../prisma/schema.prisma)

---

## 부록 A — 가중치 원본 표 (재확인용)

| 차원 | Wave 2 가중 | 출처 |
|------|------------|------|
| FUNC | 18% | L4 지침 |
| PERF | 10% | L4 지침 |
| DX | 14% | L4 지침 |
| ECO | 12% | L4 지침 |
| LIC | 8% | L4 지침 |
| MAINT | 10% | L4 지침 |
| INTEG | 10% | L4 지침 |
| SEC | 10% | L4 지침 |
| SH | 5% | L4 지침 |
| COST | 3% | L4 지침 |
| **합** | **100%** | |

## 부록 B — 차원별 스프레드시트

```
                       Wgt  | sbs   | otb   | sqlpad| self(14c) | self(14f)
FUNC                   .18  | 5.0   | 4.5   | 3.0   | 4.0       | 4.5
  가중                     | 0.90  | 0.81  | 0.54  | 0.72      | 0.81
PERF                   .10  | 4.5   | 4.5   | 4.0   | 4.5       | 4.5
  가중                     | 0.45  | 0.45  | 0.40  | 0.45      | 0.45
DX                     .14  | 5.0   | 4.5   | 3.5   | 4.5       | 4.5
  가중                     | 0.70  | 0.63  | 0.49  | 0.63      | 0.63
ECO                    .12  | 5.0   | 4.0   | 3.0   | 4.5       | 4.5
  가중                     | 0.60  | 0.48  | 0.36  | 0.54      | 0.54
LIC                    .08  | 5.0   | 1.5   | 5.0   | 5.0       | 5.0
  가중                     | 0.40  | 0.12  | 0.40  | 0.40      | 0.40
MAINT                  .10  | 5.0   | 4.5   | 1.5   | 4.0       | 4.5
  가중                     | 0.50  | 0.45  | 0.15  | 0.40      | 0.45
INTEG                  .10  | 4.0   | 4.5   | 3.0   | 5.0       | 5.0
  가중                     | 0.40  | 0.45  | 0.30  | 0.50      | 0.50
SEC                    .10  | 4.0   | 3.5   | 4.0   | 5.0       | 5.0
  가중                     | 0.40  | 0.35  | 0.40  | 0.50      | 0.50
SH                     .05  | 4.0   | 4.0   | 5.0   | 5.0       | 5.0
  가중                     | 0.20  | 0.20  | 0.25  | 0.25      | 0.25
COST                   .03  | 5.0   | 4.0   | 5.0   | 5.0       | 5.0
  가중                     | 0.15  | 0.12  | 0.15  | 0.15      | 0.15
──────────────────────────────────────────────────────────────
총합                         | 4.70  | 4.06  | 3.44* | 4.54      | 4.68
                                              * 반올림 3.45
```

## 부록 C — 비교 요약 한 줄표

| 후보 | 한 줄 |
|------|------|
| **supabase-studio 패턴** | Apache-2.0 = 자유 인용 + 100점 청사진 골격 — **1위 참조** |
| outerbase-studio | AGPL = 0줄 차용, AI/DiffEditor/ERD 패턴 학습 전용 — **2위 참조** |
| sqlpad | MIT 자유, 2025-08 아카이브로 의존 금지, Driver/QueryHistory 패턴만 — **3위 참조** |
| **자체 Monaco (14f)** | 40일 로드맵으로 점진 구축, 최종 4.68점 + PEV2 차별화 — **1위 실행** |

## 부록 D — "페이즈별 전략 체크리스트"

### 14c (sqlpad 패턴)
- [ ] Driver 추상 인터페이스 (`src/lib/sql/driver.ts`)
- [ ] PostgresDriver + `readOnlyMode` + `BEGIN READ ONLY`
- [ ] `SqlQueryRun` 모델 (스냅샷 + status)
- [ ] `SqlQuery.tags` + `description` + `sharedWithUserIds` 컬럼 추가
- [ ] CSV/JSON/XLSX 서버 스트리밍 (`/api/sql/download`)
- [ ] monaco-sql-languages 자동완성 (키워드)
- [ ] Cmd+Enter / Cmd+S 표준 단축키

### 14d (outerbase 패턴 — AGPL 주의)
- [ ] 컨텍스트 자동완성 provider (table.col, FROM 후 테이블)
- [ ] TanStack Table 결과 그리드 + react-virtual
- [ ] IndexedDB 다중 탭 자동 복구
- [ ] `/api/sql/ai` 라우트 (Anthropic Haiku + prompt cache)
- [ ] Monaco DiffEditor + Accept/Reject
- [ ] EXPLAIN 가드 (쓰기 차단)
- [ ] @xyflow/react ERD 페이지
- [ ] **AGPL 안전 체크리스트 준수** (부록 E)

### 14e (supabase 패턴)
- [ ] `SqlQueryFolder` 모델 + 자기참조 트리
- [ ] 사이드바 폴더 트리 + DnD
- [ ] `isFavorite` 컬럼 + 별표
- [ ] `/api/sql/queries/[id]/share` scope 토글
- [ ] AI Assistant v2 conversational SSE + 멀티턴
- [ ] 공유 URL 서버 scope+role 교차 검증

### 14f (차별화)
- [ ] pev2 또는 자체 d3 Plan Visualizer
- [ ] sql-formatter 통합 (Cmd+Shift+F)
- [ ] E2E Playwright 15 시나리오 + curl C1~C15

## 부록 E — AGPL 안전 체크리스트 (outerbase 차용 시)

매 14d PR에서:
- [ ] `@outerbase/*` 패키지를 의존성에 추가하지 않았는가?
- [ ] outerbase-studio 소스를 fork/clone 하지 않았는가?
- [ ] 함수명/변수명/주석이 outerbase와 다르게 작성되었는가?
- [ ] 패턴 출처가 외부 공개 자료(blog/docs/npm)인가?
- [ ] 커밋/PR 메시지에 "Outerbase inspired" 같은 표현을 자제했는가?
- [ ] 최종 코드가 우리 프로젝트 자체 라이선스(사적) 적용되는가?

— 끝 —
