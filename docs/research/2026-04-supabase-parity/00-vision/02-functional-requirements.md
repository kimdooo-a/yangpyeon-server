# 기능 요구사항서 (Functional Requirements)

> Supabase 100점 동등성 프로젝트 — Wave 3 R1 산출물
> 작성: 2026-04-18 (세션 26, kdywave Wave 3 Agent R1)
> 근거: Wave 1 (33 deep-dive, 26,941줄) + Wave 2 (28 매트릭스+1:1, 18,251줄) 채택안
> 상위: [README.md](../README.md) → [00-vision/](./) → **여기**
> 연관: `00-product-vision.md`, `01-user-stories.md`, `03-non-functional-requirements.md`

---

## 문서 개요

### 목적

양평 부엌 서버 대시보드를 **Supabase Cloud 동등 수준(100점)** 으로 끌어올리기 위한 14개 카테고리 전 기능 요구사항을 단일 문서로 통합. Wave 4 청사진의 직접 입력(input) 역할을 수행하며, Wave 5 로드맵 Phase 매핑의 기반.

### 적용 범위

- **포함**: 14 카테고리 (Table Editor ~ Operations) FR 전부
- **제외**: Multi-tenancy (의도적 배제 — `09-multi-tenancy-decision.md` 참조)
- **전제 스택**: Next.js 16, TypeScript 5.x, PostgreSQL/Prisma 7, SQLite/Drizzle, Tailwind 4, shadcn/ui, jose, bcrypt, PM2, Cloudflare Tunnel, Monaco, xyflow/elkjs, TanStack Table v8, Sonner

### 우선순위 정의

| 우선순위 | 의미 | 투입 Phase | 포함 기준 |
|---------|------|-----------|----------|
| **P0 (MVP)** | v1.0 릴리즈 차단 조건 | Phase 15~18 | Wave 2 채택안의 "MVP 필수" 기능, Supabase 50점대 기준선 확보 |
| **P1 (v1.1)** | 1차 강화 릴리즈 | Phase 19~22 | Wave 2 채택안의 "v1.1 진입" 기능, 75~85점 구간 도달 |
| **P2 (v1.2+)** | 수요 트리거 시 착수 | Phase 23+ | "도입 조건 충족 시" 로직 (pg_graphql, Sandbox 위임 등) |

### FR 통계

- **총 FR 수**: 55개 (최소 45개 기준 충족)
- **P0 비율**: 27개 / 55개 = **49.1%** (기준 40~50% 충족)
- **P1 비율**: 22개 / 55개 = 40.0%
- **P2 비율**: 6개 / 55개 = 10.9%
- **카테고리 분포**: 14 카테고리 × 평균 3.93 FR

### 검증 방법 표기

- **Unit**: Vitest 기반 순수 함수/클래스 단위 (모킹 포함)
- **Integration**: Next.js 16 API Route + Prisma 실제 DB 연결
- **Manual QA**: 관리자 계정으로 브라우저 체크리스트 수행
- **Performance Benchmark**: k6 또는 Artillery 부하/지연 측정

---

## FR-1: Table Editor

> Wave 2 채택: **TanStack v8 + 14c-α 자체 구현** (4.54/5)
> 100점 도달: 14c-α(85) → 14c-β(93) → 14d(99) → 14e(100)
> 관련 스토리: E1-S1 ~ E1-S4 (01-user-stories.md 참조)

### FR-1.1 Row 페이지네이션 (서버 정렬)

| 항목 | 내용 |
|------|------|
| **설명** | TanStack Table v8의 manual pagination 모드로 PostgreSQL `LIMIT/OFFSET` 쿼리를 서버 측에서 수행하고, UI는 페이지 번호·페이지 크기(25/50/100/500)를 제어한다. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E1-S1 (대용량 테이블 탐색) |
| **구현 기술** | TanStack Table v8 (manual mode), Prisma 7 `findMany` + `take/skip`, PostgreSQL B-tree 인덱스 |
| **입력** | 테이블 이름, 페이지 번호, 페이지 크기, 정렬 컬럼/방향 |
| **출력** | 행 배열 + 총 row count (서버 계산) |

**세부 요구사항:**
1. 서버 라우트 `/api/tables/:schema/:name/rows` GET 쿼리 파라미터: `page`, `size`, `sort`, `order`
2. `count(*)` 쿼리는 `/api/tables/:schema/:name/count` 분리 (캐시 TTL 30초)
3. 서버 정렬은 화이트리스트 방식 — Prisma introspection 결과에 있는 컬럼만 허용 (SQL 인젝션 차단)
4. 페이지 크기 500 초과 시 403 응답 (DoS 방어)
5. 결과는 `ETag`로 캐시, 미변경 시 304 응답

**검증:**
- Unit: 정렬·페이지네이션 쿼리 빌더 순수 함수 (컬럼 화이트리스트 검증 포함)
- Integration: 10만 row 더미 테이블에서 page=500, size=100 요청 → 응답 < 300ms
- Performance Benchmark: k6 동시 50 사용자, 페이지 전환 p95 < 500ms

### FR-1.2 Inline Edit 낙관적 업데이트

| 항목 | 내용 |
|------|------|
| **설명** | 셀 더블클릭 → 편집 모드 진입, Enter 저장 시 낙관적 UI 반영 후 서버 PATCH 요청. 실패 시 롤백 + Sonner 토스트. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E1-S2 (신속 데이터 교정) |
| **구현 기술** | TanStack Query v5 `useMutation` + `onMutate` rollback, Prisma `update`, Zod 런타임 타입 검증 |
| **입력** | PK 값, 컬럼명, 새 값, 기존 값 (CAS 비교용) |
| **출력** | 업데이트된 row 객체 또는 409 Conflict (동시성 충돌) |

**세부 요구사항:**
1. 편집 중 ESC 누르면 원복, Enter 누르면 저장 개시
2. 서버는 `WHERE pk = ? AND updated_at = ?` 조건으로 CAS (optimistic concurrency) 수행
3. 충돌 시 409 + 서버 현재값 반환 → 클라이언트 "다른 세션이 먼저 수정했습니다" 토스트 + 값 갱신
4. NOT NULL / CHECK 제약 위반은 422 + 에러 메시지 한국어 매핑
5. 감사 로그 (Audit Log) 테이블에 `user_id, table, pk, column, old_value, new_value, timestamp` 기록

**검증:**
- Unit: `useOptimisticRowMutation` hook 롤백 로직 (onError 콜백 테스트)
- Integration: 두 세션이 같은 row를 동시에 수정 → 후행 요청 409 확인
- Manual QA: ESC/Enter 키 동작, 에러 토스트 한국어 표시 확인

### FR-1.3 컬럼 필터 + 복합 조건

| 항목 | 내용 |
|------|------|
| **설명** | 각 컬럼 헤더 드롭다운에서 연산자(=, !=, >, <, LIKE, IN, IS NULL) 선택 + 값 입력. AND 조합으로 다중 필터 적용. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E1-S3 (데이터 검색/필터) |
| **구현 기술** | TanStack Table v8 column filters, Prisma `where` 조건 동적 생성, Zod 필터 DSL 파서 |
| **입력** | 컬럼명, 연산자, 값 (배열 가능) |
| **출력** | 필터링된 row 배열 + 매칭 count |

**세부 요구사항:**
1. 연산자 셋: `=, !=, >, >=, <, <=, LIKE, ILIKE, IN, NOT IN, IS NULL, IS NOT NULL`
2. 타입별 자동 캐스팅 — timestamp 컬럼은 달력 위젯, boolean은 체크박스, enum은 드롭다운
3. 필터 조건 URL 쿼리 파라미터로 직렬화 (북마크/공유 가능) — `?filter=name.like.%25김%25,age.gt.30`
4. 최대 10개 필터 조건 동시 적용 (성능 한계)
5. 실행 시 Prisma `EXPLAIN ANALYZE` 결과를 백그라운드 로깅 (비정상 느린 쿼리 추적)

**검증:**
- Unit: 필터 DSL 파서 (정상/에러 케이스 20+)
- Integration: 필터 3개 조합 쿼리 실행 계획 검증
- Manual QA: URL 공유 → 다른 브라우저에서 같은 결과 재현

### FR-1.4 RLS 정책 UI 생성기 (14c-β)

| 항목 | 내용 |
|------|------|
| **설명** | 테이블별로 RLS 정책을 폼 기반 UI로 생성/수정/삭제. SELECT/INSERT/UPDATE/DELETE 4개 명령별 USING/WITH CHECK 표현식 입력, 미리보기 SQL 제공. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E1-S4 (보안 정책 관리) |
| **구현 기술** | 자체 구현 (schemalint 패턴 차용), Monaco 에디터 (SQL 표현식), pg_policies 카탈로그 조회 |
| **입력** | 정책명, 테이블, 명령, Role, USING 표현식, WITH CHECK 표현식 |
| **출력** | 생성된 `CREATE POLICY` DDL + 적용 결과 |

**세부 요구사항:**
1. 기존 정책 목록을 `pg_policies` 시스템 뷰에서 조회하여 테이블 옆 뱃지 표시
2. 표현식 필드는 Monaco + SQL 린팅 (squawk 규칙 일부 적용)
3. 미리보기 버튼 → 생성될 DDL을 모달에 표시 (복사 가능)
4. 적용 전 샘플 row 3개에 대해 DRY-RUN 평가 (`EXPLAIN` 아닌 실제 조건 평가)
5. 삭제 시 "정말 이 정책을 제거하시겠습니까?" 2단계 확인

**검증:**
- Unit: SQL 생성기 (정책명 식별자 이스케이프, 표현식 sanitize)
- Integration: 정책 CREATE → SELECT로 역 확인 → DROP 왕복 테스트
- Manual QA: RLS 활성 후 비관리자 계정 로그인 → 제한 동작 확인

---

## FR-2: SQL Editor

> Wave 2 채택: **supabase-studio 패턴 인용** (4.70/5) + outerbase/sqlpad 패턴 흡수
> 100점 도달: 14c → 14d → 14e → 14f 보너스, 총 40일 (~320h)

### FR-2.1 Monaco 기반 SQL 에디터 + 멀티탭

| 항목 | 내용 |
|------|------|
| **설명** | Monaco 에디터에 PostgreSQL SQL 문법 하이라이팅, 자동완성 (테이블/컬럼/함수명), 멀티탭(최대 10개) 지원. 탭 상태는 SQLite에 영속화. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E2-S1 (쿼리 작성) |
| **구현 기술** | Monaco Editor `@monaco-editor/react`, `monaco-sql-languages`, Drizzle + SQLite 세션 저장 |
| **입력** | SQL 텍스트, 탭 이름 |
| **출력** | 실행 결과 테이블 + 실행 시간 + 영향받은 row 수 |

**세부 요구사항:**
1. 자동완성 소스: Prisma introspection 결과 + PostgreSQL 예약어 + 사용자 최근 쿼리 히스토리
2. 선택 영역만 실행 (Ctrl/Cmd + Enter)
3. 파괴적 쿼리 (`DROP`, `TRUNCATE`, `DELETE` WHERE 없음)는 2단계 확인 모달 강제
4. 탭 닫기 전 변경사항 있으면 저장 여부 프롬프트
5. 실행 결과는 TanStack Table로 렌더링 (FR-1.1 컴포넌트 재사용)

**검증:**
- Unit: SQL 위험도 분류기 (`DROP` 포함 → danger 반환)
- Integration: 탭 저장 → 재로그인 → 동일 탭 복원
- Manual QA: Monaco 단축키 (Ctrl+F, Ctrl+/, Alt+클릭) 전부 동작

### FR-2.2 EXPLAIN Plan Visualizer

| 항목 | 내용 |
|------|------|
| **설명** | 쿼리에 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 실행 후 결과 트리를 xyflow로 시각화. 노드별 비용/시간/row estimate 표시, 적색 경고 (느린 노드, Seq Scan on large table). |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E2-S2 (쿼리 최적화) |
| **구현 기술** | PostgreSQL `EXPLAIN` + `@xyflow/react` 트리 레이아웃, elkjs |
| **입력** | SQL 텍스트 |
| **출력** | JSON 실행 계획 + xyflow 노드/엣지 구조 + 경고 목록 |

**세부 요구사항:**
1. Plan Visualizer 실행은 기본 `EXPLAIN` (ANALYZE 없음), 버튼 클릭 시에만 ANALYZE 수행
2. 노드 크기 = `actual_total_time` 비례
3. 경고 룰: Seq Scan (1만 row 초과), Hash Join (메모리 초과 의심), Nested Loop (outer row 1000+) → 아이콘 + 한국어 설명
4. 노드 클릭 시 사이드 패널에 전체 속성 표시
5. 쿼리 + Plan 결과를 "쿼리 북마크"로 저장 (SQLite)

**검증:**
- Unit: Plan JSON → 트리 변환기 (중첩 노드 케이스)
- Integration: 10만 row 테이블 Seq Scan 쿼리 → 경고 감지 확인
- Performance Benchmark: Plan 생성 + 렌더링 p95 < 1.5s

### FR-2.3 AI SQL 어시스턴트 (BYOK)

| 항목 | 내용 |
|------|------|
| **설명** | 자연어 → SQL 생성, 에러 메시지 해설, 쿼리 최적화 제안. 스키마 컨텍스트를 자동 주입하고, AI 비용 가드(사용자 한도) 제공. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E2-S3 (초보자 쿼리 학습) |
| **구현 기술** | AI SDK v6, Anthropic Claude Haiku/Sonnet, BYOK (사용자 API 키), 자체 MCP 서버 `mcp-luckystyle4u` |
| **입력** | 자연어 프롬프트, 현재 스키마 요약, 이전 대화 |
| **출력** | SQL 텍스트 + 설명 + 예상 토큰 비용 |

**세부 요구사항:**
1. 사용자는 설정 페이지에서 Anthropic API 키 입력 (AES-256-GCM envelope 암호화 저장)
2. 스키마 토큰 예산 = 8000 토큰 초과 시 요약 (테이블 100개 제한)
3. 월 비용 한도 기본 $5, 초과 시 강제 차단 + 알림
4. 생성된 SQL은 "실행 전 확인" 상태 — 사용자가 에디터에 복사 후 수동 실행
5. AI 응답 영구 저장 금지 (세션 종료 시 메모리 소거) — DQ 답변 반영

**검증:**
- Unit: 토큰 카운터 + 비용 계산기 (모델별 단가 정확성)
- Integration: 가짜 BYOK 키 + AI SDK mock → 스트리밍 응답 정상
- Manual QA: 월 한도 $5 초과 시 차단 동작 확인

### FR-2.4 Savepoint 기반 DRY-RUN

| 항목 | 내용 |
|------|------|
| **설명** | 쿼리 실행 전 `BEGIN; ... ROLLBACK;` 또는 Savepoint를 자동 감싸서 영향 규모(row count)를 미리보고, 사용자 승인 후 실제 커밋. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E2-S4 (안전한 UPDATE/DELETE) |
| **구현 기술** | PostgreSQL Savepoint, Prisma `$transaction`, 서버 세션 기반 트랜잭션 매니저 |
| **입력** | UPDATE/DELETE/INSERT 쿼리 |
| **출력** | 영향받을 row 수 (DRY-RUN) → 커밋 또는 ROLLBACK 여부 |

**세부 요구사항:**
1. DRY-RUN 버튼 클릭 시 `BEGIN; <쿼리>; SELECT ... ROLLBACK;` 자동 생성
2. 영향받는 row 수 표시 + 샘플 3개 미리보기
3. "커밋" 버튼 누르면 같은 쿼리를 재실행 (트랜잭션 열어둘 수도, 재실행할 수도 있음 — 세션 정책)
4. 트랜잭션 타임아웃 30초 (장기 보유 차단)
5. 실패 시 자동 ROLLBACK + 에러 로깅

**검증:**
- Unit: DRY-RUN 래퍼 생성 (UPDATE/DELETE/INSERT 별 분기)
- Integration: 100 row UPDATE → ROLLBACK 후 원복 확인
- Manual QA: 커밋 vs ROLLBACK 선택 플로우

---

## FR-3: Schema Visualizer

> Wave 2 채택: **schemalint 4.42 + 자체 RLS 4.18 + Trigger 4.31** (4.30/5)
> 100점 도달: 14d-1~11, `/database/{policies,functions,triggers}` 신설, 50h

### FR-3.1 스키마 ERD 자동 생성

| 항목 | 내용 |
|------|------|
| **설명** | Prisma DMMF를 읽어 xyflow + elkjs 레이아웃으로 ERD를 자동 생성. 테이블 노드, FK 엣지, 컬럼 타입/제약 뱃지 표시. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E3-S1 (스키마 이해) |
| **구현 기술** | `prisma-dmmf` → Node 메타 변환, `@xyflow/react`, `elkjs` 레이아웃 알고리즘 (`layered`) |
| **입력** | Prisma 스키마 (introspection 결과) |
| **출력** | ERD SVG 또는 인터랙티브 xyflow 컴포넌트 |

**세부 요구사항:**
1. 첫 로드 시 layered 레이아웃 자동 실행 → 이후 사용자가 드래그로 수정 가능
2. 노드 위치는 로컬 스토리지에 저장 (사용자별 커스텀)
3. FK 엣지에 카디널리티 표시 (1:1, 1:N, N:M)
4. 확대/축소 (25%~400%), 미니맵, 키보드 단축키 (화살표로 패닝)
5. "관계 자동 추론" 버튼 — FK 없는 테이블에서 컬럼명 `_id` 패턴으로 관계 제안 (DQ-3.x 반영)

**검증:**
- Unit: DMMF → xyflow 노드 변환기 (50+ 테이블 케이스)
- Integration: 실제 Prisma 스키마 로딩 → 렌더링 성공
- Performance Benchmark: 100 테이블 / 300 관계 ERD p95 < 2s

### FR-3.2 Policies 페이지 (RLS 정책 카탈로그)

| 항목 | 내용 |
|------|------|
| **설명** | `/database/policies` 페이지에 모든 RLS 정책을 테이블로 나열. 테이블별/role별 필터, 정책 상세 보기, 신규 생성 CTA (FR-1.4 연계). |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E3-S2 (보안 감사) |
| **구현 기술** | `pg_policies` 시스템 뷰, TanStack Table, shadcn/ui Dialog |
| **입력** | 필터 조건 (테이블, role, 명령) |
| **출력** | 정책 목록 + 상세 모달 |

**세부 요구사항:**
1. 정책 활성/비활성 (`pg_class.relrowsecurity`) 상태 뱃지
2. 정책 없는 테이블 경고 아이콘 — Advisors와 연계
3. 정책 복제 기능 (템플릿화)
4. JSON Export — 전체 정책을 `.sql` 파일로 백업
5. 검색 입력은 정책명/테이블명/표현식 텍스트 전문 검색

**검증:**
- Unit: `pg_policies` 파서
- Integration: 10개 정책 생성 → 페이지 표시 확인
- Manual QA: 비활성 테이블 경고 동작

### FR-3.3 Functions/Triggers 페이지

| 항목 | 내용 |
|------|------|
| **설명** | `/database/functions` 및 `/database/triggers`에서 사용자 정의 PL/pgSQL 함수·트리거 목록 조회 + Monaco 기반 코드 뷰어. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E3-S3 (DB 로직 관리) |
| **구현 기술** | `pg_proc`, `pg_trigger` 시스템 카탈로그, Monaco (읽기 전용 모드) |
| **입력** | 스키마 필터 (public, extensions 제외 기본) |
| **출력** | 함수/트리거 목록 + 소스 코드 표시 |

**세부 요구사항:**
1. 시스템 함수 (pg_catalog) 기본 숨김, 토글로 표시 가능
2. 함수 시그니처, 반환 타입, 언어 (plpgsql/sql/c), volatility 표시
3. 트리거는 BEFORE/AFTER, INSERT/UPDATE/DELETE, Row/Statement 수준 정보 포함
4. 편집 기능은 v1.2+로 연기 (현재는 읽기 전용)
5. "이 함수를 사용하는 트리거" 역참조 링크

**검증:**
- Unit: pg_proc 메타 → UI 모델 매핑
- Integration: PL/pgSQL 함수 1개 생성 → 페이지 노출
- Manual QA: Monaco 읽기 전용 모드 (편집 불가) 확인

### FR-3.4 스키마 린트 (schemalint)

| 항목 | 내용 |
|------|------|
| **설명** | schemalint 규칙 엔진을 Prisma 스키마에 적용하여 네이밍/컨벤션 위반을 리포트. Advisors와 통합. |
| **우선순위** | P2 (v1.2+) |
| **관련 스토리** | E3-S4 (스키마 품질) |
| **구현 기술** | schemalint (TS 포팅), Prisma DMMF, 자체 룰 레지스트리 |
| **입력** | Prisma 스키마 + 룰 세트 |
| **출력** | 위반 목록 (파일/라인/메시지/심각도) |

**세부 요구사항:**
1. 룰 세트: snake_case 컬럼, `id` PK 단일, `created_at/updated_at` 표준, FK 인덱스 필수
2. 위반을 Advisors 통합 페이지에 병합 (FR-10 연계)
3. 룰별 음소거 기능 (팀 컨벤션 차이 허용)
4. CI/CD에서 `npm run schema:lint` 실행 시 경고 출력
5. 자동 수정 제안 (네이밍 변경 SQL 생성)

**검증:**
- Unit: 룰 엔진 (snake_case 검사 15+ 케이스)
- Integration: 위반 스키마 → 리포트 생성
- Manual QA: 음소거 규칙 저장/복원

---

## FR-4: DB Ops (Cron + Backups)

> Wave 2 채택: **node-cron 자체 4.32 + wal-g 4.41** (4.36/5)
> 100점 도달: 14d-A~J + 14e-1~10, RPO 60s, RTO 30m, 68h

### FR-4.1 node-cron 기반 스케줄 작업

| 항목 | 내용 |
|------|------|
| **설명** | 관리자가 UI에서 cron expression 입력 → Node.js `node-cron`이 스케줄 실행. 각 작업은 SQL 쿼리, HTTP 웹훅, 또는 shell 스크립트 (허용 목록) 중 선택. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E4-S1 (주기 작업 자동화) |
| **구현 기술** | `node-cron`, PM2 단일 프로세스 (cluster 아님 — cron 중복 방지), Prisma `cron_jobs` 테이블 |
| **입력** | cron 표현식, 작업 타입, 파라미터 (SQL/URL/스크립트명) |
| **출력** | 실행 이력 (성공/실패/소요시간/로그) |

**세부 요구사항:**
1. cron 표현식 검증 — 유효성 사전 체크 + 다음 5회 실행 시각 미리보기
2. 실행 실패 시 지수 백오프 재시도 (최대 3회)
3. 실행 이력 90일 보관 후 아카이브 테이블 이동
4. 작업 타임아웃 기본 5분, 사용자 지정 최대 1시간
5. UI에서 수동 "지금 실행" 버튼 제공

**검증:**
- Unit: cron 표현식 파서 + 다음 실행 계산
- Integration: 1분 간격 작업 등록 → 5분간 5회 실행 확인
- Manual QA: 실패 시 재시도 로그 검증

### FR-4.2 wal-g PITR 백업

| 항목 | 내용 |
|------|------|
| **설명** | `wal-g` 사이드카 프로세스가 PostgreSQL WAL을 1분 주기로 Backblaze B2에 아카이브하고, 일 1회 base backup 수행. UI에서 백업 목록 조회 및 복원 지시. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E4-S2 (재해 복구) |
| **구현 기술** | `wal-g` CLI, PostgreSQL `archive_command`, Backblaze B2 (s3-compatible) |
| **입력** | 복원 시점 (timestamp 또는 LSN), 대상 스테이징 서버 |
| **출력** | 복원 작업 상태 + 완료 시각 |

**세부 요구사항:**
1. RPO (Recovery Point Objective) 60초 — `archive_timeout = 60s`
2. RTO (Recovery Time Objective) 30분 이내
3. Base backup 보관 7일, WAL 30일 (B2 lifecycle rule)
4. 복원은 프로덕션이 아닌 스테이징 서버에 먼저 적용 → 관리자 검증 → 승격 (3단계)
5. 복원 감사 로그 — 누가/언제/어느 시점으로 복원했는지 영구 기록 (DQ-4.x 반영)

**검증:**
- Unit: wal-g 명령 래퍼 (arg escaping)
- Integration: 테스트 DB에서 PITR 5분 과거 복원 성공 확인
- Performance Benchmark: 10GB DB 복원 < 30분

### FR-4.3 웹훅 이벤트 발송

| 항목 | 내용 |
|------|------|
| **설명** | 테이블 INSERT/UPDATE/DELETE 이벤트에 대해 외부 URL로 POST 웹훅 전송. 서명(HMAC-SHA256), 재시도(지수 백오프), 실패 큐(pgmq). |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E4-S3 (외부 시스템 연계) |
| **구현 기술** | PostgreSQL 트리거 → pgmq 큐 → Node.js 워커 → 외부 HTTP POST |
| **입력** | 테이블, 이벤트 타입, 대상 URL, 시크릿 |
| **출력** | 웹훅 전송 이력 (HTTP 상태, 재시도 횟수) |

**세부 요구사항:**
1. HMAC-SHA256 서명 — 헤더 `X-Webhook-Signature: sha256=<hex>`
2. 재시도: 1분 → 5분 → 30분 → 2시간 → DLQ
3. 이벤트 페이로드: `{ table, op, old_row, new_row, timestamp, request_id }`
4. 웹훅 대상 URL은 화이트리스트 (HTTPS + 도메인 검증)
5. 테스트 발송 버튼 제공 (UI에서 즉시 POST)

**검증:**
- Unit: HMAC 서명 생성 검증
- Integration: Mock HTTP 서버로 웹훅 수신 확인
- Manual QA: 실패 5회 후 DLQ 진입

### FR-4.4 백업 복원 리허설

| 항목 | 내용 |
|------|------|
| **설명** | 월 1회 자동 복원 리허설 — 최신 base backup을 격리된 컨테이너에 복원하여 무결성 검증. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E4-S2 (재해 복구 신뢰성) |
| **구현 기술** | 쉘 스크립트 + Docker compose (격리), wal-g restore |
| **입력** | 베이스 백업 ID |
| **출력** | 복원 성공 여부 + 무결성 체크 리포트 |

**세부 요구사항:**
1. 매월 1일 03:00 자동 실행 (FR-4.1 cron 활용)
2. 복원 후 주요 테이블 row 수 비교 (±1% 허용)
3. 결과 대시보드에 PASS/FAIL 표시
4. FAIL 시 관리자에게 즉시 Sonner 푸시 + 이메일
5. 리허설 이력 12개월 보관

**검증:**
- Integration: 더미 DB로 리허설 실행 → 리포트 생성
- Manual QA: FAIL 시뮬레이션 → 알림 수신 확인

---

## FR-5: Auth Core

> Wave 2 채택: **jose JWT + Lucia 패턴 + Auth.js 패턴** (4.08/5, 라이브러리 미채용 — 패턴만)
> 100점 도달: 6 Phase, 30h

### FR-5.1 이메일/비밀번호 로그인

| 항목 | 내용 |
|------|------|
| **설명** | 이메일 + 비밀번호로 로그인, bcrypt (cost 12) 검증 후 jose JWT 발급 (HS256 → 점진 ES256). |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E5-S1 (기본 인증) |
| **구현 기술** | `jose`, `bcrypt`, PostgreSQL users 테이블, HttpOnly + SameSite=Lax 쿠키 |
| **입력** | email, password |
| **출력** | Access Token (15분), Refresh Token (7일), 사용자 프로필 |

**세부 요구사항:**
1. Access Token 페이로드: `sub, email, role, iat, exp, jti`
2. Refresh Token은 DB에 해시 저장 (토큰 탈취 대응 — revoke 가능)
3. 로그인 실패 5회 누적 시 계정 15분 잠금 (FR-6.3 Rate Limit 연계)
4. 응답은 `Set-Cookie` 헤더로 전달, 쿠키 속성: `HttpOnly; Secure; SameSite=Lax; Path=/`
5. 로그인 성공 시 `last_login_at` 업데이트 + 감사 로그 기록

**검증:**
- Unit: bcrypt 해시 검증, JWT 서명/검증
- Integration: 로그인 플로우 End-to-End (쿠키 설정 확인)
- Manual QA: 잘못된 비밀번호 5회 → 잠금 동작

### FR-5.2 Session 테이블 기반 Refresh

| 항목 | 내용 |
|------|------|
| **설명** | Refresh Token은 `sessions` 테이블에 저장 (Lucia 패턴). 만료/무효화/디바이스 정보 관리. Access Token 재발급 시 rotation. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E5-S2 (장기 세션) |
| **구현 기술** | Prisma `Session` 모델, Refresh Token rotation |
| **입력** | Refresh Token |
| **출력** | 새 Access Token + 새 Refresh Token (rotation) |

**세부 요구사항:**
1. `sessions` 스키마: `id, user_id, refresh_token_hash, user_agent, ip, created_at, last_used_at, expires_at, revoked_at`
2. Refresh 요청 시 기존 토큰 무효화 + 새 토큰 발급 (rotation)
3. 동일 Refresh Token 재사용 감지 시 해당 사용자 전체 세션 강제 로그아웃
4. 사용자 설정 페이지에서 "이 기기에서 로그아웃" / "전체 로그아웃" 버튼 제공
5. 세션 만료 시각 = `now() + 7 days`, 이후 `last_used_at` 기준으로 슬라이딩 갱신

**검증:**
- Unit: 세션 로테이션 로직 (재사용 감지)
- Integration: Refresh → Access 재발급 → 기존 Refresh 무효 확인
- Manual QA: 2개 브라우저 로그인 → 한쪽에서 전체 로그아웃 → 다른 쪽도 무효화

### FR-5.3 비밀번호 재설정

| 항목 | 내용 |
|------|------|
| **설명** | 이메일로 재설정 링크 발송 (15분 유효), 링크 클릭 → 신규 비밀번호 입력 → bcrypt 해시 갱신. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E5-S3 (계정 복구) |
| **구현 기술** | 서명된 링크 (jose JWT), SMTP (Resend 또는 자체 SMTP), bcrypt |
| **입력** | email (요청), token + new password (재설정) |
| **출력** | 재설정 완료 확인 |

**세부 요구사항:**
1. 재설정 요청 시 존재하지 않는 이메일이어도 200 응답 (enumeration 방지)
2. 토큰은 1회용 — 사용 후 DB에서 삭제
3. 비밀번호 정책: 최소 12자, 대소문자/숫자/특수문자 중 3종 포함, 유출 비밀번호 DB (HIBP pwnedpasswords) 체크
4. 재설정 완료 후 전체 세션 강제 로그아웃
5. 사용자 이메일로 "비밀번호가 변경되었습니다" 알림 발송

**검증:**
- Unit: 토큰 생성/검증 (만료, 재사용 거부)
- Integration: 재설정 플로우 End-to-End
- Manual QA: 미존재 이메일로 요청 → 200 응답 + 메일 미발송

### FR-5.4 역할/권한 시스템 (RBAC)

| 항목 | 내용 |
|------|------|
| **설명** | `admin`, `editor`, `viewer` 3개 기본 role + 세분화된 permission 매트릭스. 미들웨어에서 라우트별 role 검사. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E5-S4 (권한 분리) |
| **구현 기술** | Next.js 16 Middleware, Prisma `user_roles` 조인, RBAC DSL |
| **입력** | Access Token의 role 클레임 |
| **출력** | 403 차단 또는 통과 |

**세부 요구사항:**
1. Role 매트릭스 파일 `lib/auth/rbac.ts`에 정의 (단일 진실 소스)
2. 각 API 라우트/페이지에 `requireRole(['admin', 'editor'])` 헬퍼 적용
3. UI에서도 role별 버튼/메뉴 노출 제어 (서버 렌더링 시 결정)
4. role 변경은 admin만 가능 + 감사 로그 필수
5. 권한 부재 시 한국어 에러 페이지 ("이 작업을 수행할 권한이 없습니다")

**검증:**
- Unit: RBAC 매트릭스 계산기 (13 시나리오 이상 — 기존 14c-γ 테스트 재활용)
- Integration: viewer 계정으로 DELETE 요청 → 403
- Manual QA: UI에서 비권한 버튼 숨김 확인

---

## FR-6: Auth Advanced (MFA/OAuth/Rate Limit)

> Wave 2 채택: **TOTP + WebAuthn + Rate Limit 전부 동시** (4.59/5)
> 100점 도달: Phase 15(TOTP)→16(WebAuthn)→17(Rate Limit) = 60점, OAuth/CAPTCHA로 +40

### FR-6.1 TOTP 등록/검증

| 항목 | 내용 |
|------|------|
| **설명** | Google Authenticator/Authy 호환 TOTP (RFC 6238). QR 코드 + manual key 제공, 복구 코드 10개 발급. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E6-S1 (2FA 활성화) |
| **구현 기술** | `otpauth` 라이브러리 (or 자체 포팅), `qrcode` 라이브러리, PostgreSQL `user_mfa` 테이블 |
| **입력** | 사용자 UUID, TOTP 코드 (6자리) |
| **출력** | QR 이미지 (등록 시), 검증 성공/실패 (로그인 시) |

**세부 요구사항:**
1. Secret은 base32 32자 생성 후 AES-256-GCM envelope 암호화 저장
2. 검증 시 현재/이전/다음 30초 윈도우 허용 (시계 어긋남 대응)
3. 복구 코드 10개 — 1회용, 해시 저장 (bcrypt), 소진 시 재발급 안내
4. 등록 시 사용자가 코드 1회 성공 검증해야 "활성화" 상태 전환
5. 비활성화는 비밀번호 재확인 + 별도 감사 로그

**검증:**
- Unit: TOTP 생성/검증 (RFC 6238 테스트 벡터)
- Integration: 등록 → 로그인 → TOTP 검증 → 세션 발급
- Manual QA: Google Authenticator 앱으로 등록 성공

### FR-6.2 WebAuthn 등록/검증

| 항목 | 내용 |
|------|------|
| **설명** | 플랫폼 authenticator (Windows Hello, Touch ID) 또는 roaming key (YubiKey) 등록. FIDO2/CTAP2 프로토콜. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E6-S2 (passkey 로그인) |
| **구현 기술** | `@simplewebauthn/server` 또는 자체 포팅, PostgreSQL `user_credentials` 테이블 |
| **입력** | 클라이언트에서 생성한 credential + attestation |
| **출력** | 등록 확인 / 로그인 검증 성공 |

**세부 요구사항:**
1. challenge는 서버 세션에 10분 보관 (재사용 차단)
2. credential ID + public key + counter를 DB에 저장
3. 한 사용자당 최대 5개 credential 등록
4. 이름 지정 가능 (예: "MacBook Touch ID", "YubiKey 5C")
5. 비활성화는 비밀번호 + 다른 MFA (TOTP) 재확인

**검증:**
- Unit: attestation 파싱 + 서명 검증 (알려진 WebAuthn 테스트 벡터)
- Integration: Chrome 가상 authenticator로 등록 → 로그인
- Manual QA: 실제 Touch ID/YubiKey 등록 성공

### FR-6.3 Rate Limit (PG 기반)

| 항목 | 내용 |
|------|------|
| **설명** | PostgreSQL 테이블 기반 고정 윈도우 rate limit (분당/시간당 요청 수 제한). Redis 미사용 — 1인 운영 단순성. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E6-S3 (무차별 대입 차단) |
| **구현 기술** | Prisma `rate_limit_counter` 테이블, 컴포지트 PK `(key, window)`, UPSERT 쿼리 |
| **입력** | key (IP 또는 user_id), 엔드포인트, 윈도우 |
| **출력** | 허용/거부 + 남은 요청 수 |

**세부 요구사항:**
1. 기본 정책: 로그인 5회/분, API 전체 300회/분, AI 호출 30회/시간
2. 응답 헤더: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
3. 429 응답 + `Retry-After` 헤더 (초 단위)
4. 1분 주기 cron으로 만료 윈도우 카운터 삭제 (테이블 비대화 방지)
5. 관리자는 특정 IP whitelist/blacklist 가능

**검증:**
- Unit: 윈도우 계산 + 카운터 UPSERT
- Integration: 로그인 6회 연속 요청 → 6회째 429
- Performance Benchmark: 카운터 UPSERT p95 < 20ms

### FR-6.4 OAuth 소셜 로그인

| 항목 | 내용 |
|------|------|
| **설명** | Google/GitHub/Kakao/Naver 4개 provider 지원 (PKCE 플로우). 기존 이메일 계정과 link 가능. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E6-S4 (편의 로그인) |
| **구현 기술** | Auth.js 패턴 차용 (라이브러리 미사용), jose, PostgreSQL `user_oauth_providers` 테이블 |
| **입력** | Authorization code, state, code_verifier |
| **출력** | 연결된 사용자 프로필 + 세션 |

**세부 요구사항:**
1. PKCE 필수 (공개 클라이언트 보안)
2. 동일 이메일이면 기존 계정에 provider 추가 연결 (link)
3. Kakao/Naver는 국내 한정 — 기본 비활성, 설정에서 활성화
4. provider별 Client ID/Secret은 envelope 암호화로 설정 DB에 저장
5. 소셜 계정만으로 가입한 사용자는 비밀번호 설정 CTA 노출 (유실 대비)

**검증:**
- Unit: PKCE challenge/verifier 생성
- Integration: 각 provider mock 서버로 플로우 end-to-end
- Manual QA: Google OAuth 실제 로그인 성공

### FR-6.5 CAPTCHA

| 항목 | 내용 |
|------|------|
| **설명** | 로그인/회원가입/비밀번호 재설정에 Cloudflare Turnstile 삽입. 의심 IP에서는 강제, 정상은 invisible. |
| **우선순위** | P2 (v1.2+) |
| **관련 스토리** | E6-S5 (봇 차단) |
| **구현 기술** | Cloudflare Turnstile (Free tier), server-side verify |
| **입력** | Turnstile token |
| **출력** | 검증 통과 여부 |

**세부 요구사항:**
1. Turnstile Site Key / Secret Key는 환경변수 관리
2. 의심도 판별 — 최근 1시간 실패율 > 30%인 IP는 필수
3. 검증 실패 시 명시적 에러 UI
4. 장애 시 fallback — Turnstile API 5xx면 허용 (가용성 우선)
5. 검증 이력 로깅 (통과율 모니터링)

**검증:**
- Unit: Turnstile 응답 파서
- Integration: mock token → 200, 잘못된 token → 403
- Manual QA: 실제 Turnstile challenge 수행

---

## FR-7: Storage

> Wave 2 채택: **SeaweedFS 단독** (4.25/5) + B2 백업
> 100점 도달: 단일 채택만으로 90~95점

### FR-7.1 파일 업로드 (SeaweedFS + B2 백업)

| 항목 | 내용 |
|------|------|
| **설명** | 멀티파트 업로드 지원, 프론트에서 presigned URL 받아 SeaweedFS 직접 업로드. 1시간 후 비동기로 B2에 복제 (재해 백업). |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E7-S1 (파일 저장) |
| **구현 기술** | SeaweedFS (filer + volume), S3 호환 API, Backblaze B2, BullMQ 백업 큐 |
| **입력** | filename, mime type, size, bucket |
| **출력** | presigned upload URL, 업로드 완료 후 public/signed URL |

**세부 요구사항:**
1. 허용 MIME 화이트리스트 — 이미지/PDF/CSV/일반 문서, 실행파일(.exe, .sh) 차단
2. 개별 파일 최대 100MB, 멀티파트 1GB
3. 업로드 완료 시 서버 측 mime sniffing (libmagic) 2차 검증
4. 1시간 딜레이 후 B2 cold storage로 복제 (비용 최적)
5. SeaweedFS 원본 삭제 시 B2 복사본은 30일 retention

**검증:**
- Unit: presigned URL 서명 검증
- Integration: 10MB 파일 업로드 → SeaweedFS 저장 → B2 복제 확인
- Performance Benchmark: 100MB 업로드 p95 < 10s (로컬 네트워크)

### FR-7.2 Bucket 정책 (RLS 연동)

| 항목 | 내용 |
|------|------|
| **설명** | Bucket은 public/private 선택. private bucket은 세션 토큰 기반 signed URL (15분 유효). |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E7-S2 (접근 제어) |
| **구현 기술** | SeaweedFS ACL, 자체 signed URL 생성기 (HMAC-SHA256) |
| **입력** | bucket, key, 만료 시간 |
| **출력** | signed URL |

**세부 요구사항:**
1. private bucket 접근은 반드시 인증 통과 후 signed URL 발급
2. URL에 `expires, signature, user_id` 포함
3. 액세스 로그 — 누가 언제 어느 파일에 접근했는지 (2시간 배치 집계)
4. bucket별 크기 쿼터 (기본 10GB) + 초과 시 업로드 거부
5. public bucket은 CDN (Cloudflare) 연동 가능

**검증:**
- Unit: signed URL 서명/검증
- Integration: 비인증 접근 → 403, 인증 signed URL → 200
- Manual QA: 15분 후 URL 만료 확인

### FR-7.3 이미지 변환 (on-the-fly)

| 항목 | 내용 |
|------|------|
| **설명** | 업로드된 이미지를 요청 시점에 리사이즈/포맷 변환. URL 파라미터 `?w=400&h=300&fm=webp&q=80`. sharp 라이브러리, 결과 캐시. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E7-S3 (이미지 최적화) |
| **구현 기술** | `sharp`, Next.js 16 Image API Route, 디스크 캐시 (`/var/cache/images/`) |
| **입력** | 원본 key, width, height, format, quality |
| **출력** | 변환된 이미지 바이너리 |

**세부 요구사항:**
1. 지원 포맷: JPEG, PNG, WebP, AVIF
2. 최대 치수 4096x4096 (DoS 방지)
3. 캐시 히트 시 디스크에서 직접 서빙 (< 10ms)
4. 캐시 LRU 정책 — 디스크 2GB 초과 시 오래된 것부터 제거
5. `Cache-Control: public, max-age=31536000, immutable` 헤더 (URL 해시 포함)

**검증:**
- Unit: URL 파라미터 파서 + 한계 검증
- Integration: 원본 5MB PNG → 400px WebP 변환 확인
- Performance Benchmark: 캐시 히트 p95 < 20ms, 미스 < 500ms

### FR-7.4 Resumable Upload

| 항목 | 내용 |
|------|------|
| **설명** | TUS 프로토콜 또는 S3 multipart 기반 중단 복구 업로드. 대용량 비디오/백업 파일 대응. |
| **우선순위** | P2 (v1.2+) |
| **관련 스토리** | E7-S4 (대용량 업로드) |
| **구현 기술** | `tus-node-server` 또는 S3 multipart, SeaweedFS 세션 상태 |
| **입력** | 업로드 세션 ID, 청크 |
| **출력** | 누적 업로드 바이트 |

**세부 요구사항:**
1. 청크 크기 5MB, 최대 파일 5GB
2. 미완료 세션 48시간 후 자동 청소
3. 네트워크 장애 시 같은 URL로 PATCH 요청 재개
4. 업로드 진행률을 UI에 실시간 표시 (Sonner progress)

**검증:**
- Integration: 1GB 파일 업로드 도중 끊고 재개 → 완료 확인
- Manual QA: 느린 네트워크 시뮬레이션 후 재개 성공

---

## FR-8: Edge Functions

> Wave 2 채택: **3층 하이브리드** (isolated-vm v6 L1 + Deno 사이드카 L2 + Vercel Sandbox 위임 L3) (4.22/5)
> 100점 도달: 92~95점, `decideRuntime()` 라우팅 코드 존재

### FR-8.1 isolated-vm v6 실행 (L1)

| 항목 | 내용 |
|------|------|
| **설명** | Node.js 내 `isolated-vm`으로 사용자 JavaScript 함수를 격리 실행. 메모리/CPU 한도, 외부 네트워크 비허용 기본. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E8-S1 (가벼운 서버리스 함수) |
| **구현 기술** | `isolated-vm` v6, V8 snapshot, PM2 cluster 내 워커 |
| **입력** | 함수 소스 (TS/JS), 실행 파라미터, 환경변수 |
| **출력** | 반환값 (JSON) + stdout/stderr 로그 |

**세부 요구사항:**
1. 메모리 한도 128MB, CPU 시간 500ms 기본
2. 허용 API: `fetch` (화이트리스트 도메인), `crypto`, `console`, Prisma client (read-only)
3. 차단 API: `fs`, `child_process`, `net`, `process`
4. 함수 코드는 ESBuild로 사전 빌드 + snapshot 캐시
5. 실행 이력 + stdout/stderr 24시간 보관

**검증:**
- Unit: 격리 환경에서 금지 API 호출 → 에러
- Integration: 100+ 함수 동시 실행 → 메모리 한도 이내
- Performance Benchmark: cold start p95 < 100ms, warm p95 < 20ms

### FR-8.2 Deno 사이드카 실행 (L2)

| 항목 | 내용 |
|------|------|
| **설명** | L1 한도 초과(긴 실행, npm 패키지 필요) 함수는 별도 Deno 프로세스로 실행. PM2가 관리. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E8-S2 (복잡 함수) |
| **구현 기술** | Deno 1.x, HTTP IPC (localhost:9000), PM2 Deno 프로세스 |
| **입력** | 함수 ID, 파라미터 |
| **출력** | 반환값 + 로그 |

**세부 요구사항:**
1. Deno permission 명시: `--allow-net=:9000 --allow-read=/var/ef/code`
2. 실행 시간 30초, 메모리 256MB
3. npm 패키지 지원 (Deno 호환 목록)
4. L1 실행 실패/한도 초과 시 자동 승격 (`decideRuntime()`)
5. 빈번한 승격 대상 함수는 관리자에게 알림 ("L2로 고정 권장")

**검증:**
- Integration: npm 패키지(`zod`) 사용 함수 정상 실행
- Performance Benchmark: cold start p95 < 500ms

### FR-8.3 Vercel Sandbox 위임 (L3)

| 항목 | 내용 |
|------|------|
| **설명** | 신뢰 불가 사용자 코드(AI 생성 코드 등)는 Vercel Sandbox로 위임. Firecracker microVM 격리. |
| **우선순위** | P2 (v1.2+) |
| **관련 스토리** | E8-S3 (안전 샌드박스) |
| **구현 기술** | Vercel Sandbox API, HTTP 위임 |
| **입력** | 코드, 파라미터 |
| **출력** | 실행 결과 |

**세부 요구사항:**
1. AI 생성 코드 플래그 있으면 자동 L3 선택
2. Vercel API 키 envelope 암호화 저장
3. 실행당 평균 비용 추적 + 월 한도
4. 장애 시 L2로 fallback (degraded mode)

**검증:**
- Integration: Vercel Sandbox mock → 정상 응답
- Manual QA: 실제 Vercel 계정으로 샌드박스 실행 확인

### FR-8.4 함수 배포 / 버전 관리

| 항목 | 내용 |
|------|------|
| **설명** | 함수를 UI에서 작성 → 배포 → 버전 태그. 롤백은 이전 버전 선택. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E8-S4 (함수 관리) |
| **구현 기술** | PostgreSQL `functions`, `function_versions` 테이블, Monaco 에디터 |
| **입력** | 함수 이름, 소스 코드, 트리거 (HTTP / Cron / DB Event) |
| **출력** | 배포 버전 ID |

**세부 요구사항:**
1. 활성 버전 전환은 원자적 (DB 트랜잭션)
2. 버전 최대 20개 보관, 오래된 것부터 pruning
3. HTTP 트리거 URL: `/functions/v1/{name}` (Supabase 호환)
4. 소스 코드 Diff 뷰어 (이전 버전 비교)

**검증:**
- Unit: 버전 전환 로직
- Manual QA: 에디터에서 코드 변경 → 배포 → 이전 버전 롤백 동작

---

## FR-9: Realtime

> Wave 2 채택: **wal2json + supabase-realtime 포팅 하이브리드** (4.05/5)
> 100점 도달: 100/100 — wal2json (CDC) + supabase-realtime (Channel) 계층 분리

### FR-9.1 wal2json CDC 스트리밍

| 항목 | 내용 |
|------|------|
| **설명** | PostgreSQL wal2json 출력 플러그인으로 WAL 변경을 JSON 스트림으로 수신. Node.js publication 리스너가 SSE/WebSocket으로 브로드캐스트. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E9-S1 (실시간 변경 감지) |
| **구현 기술** | PostgreSQL `wal2json` 확장, logical replication slot, Node.js `pg-logical-replication` |
| **입력** | 구독 테이블, 필터 조건 |
| **출력** | 이벤트 스트림 (INSERT/UPDATE/DELETE) |

**세부 요구사항:**
1. replication slot 이름 `luckystyle_realtime_v1`
2. 필터: 테이블, 컬럼, 조건 (WHERE 표현식)
3. 이벤트 페이로드: `{ op, schema, table, new, old, lsn }`
4. 클라이언트 연결 끊김 시 LSN 기반 재개 지원 (24시간 내)
5. 슬롯 누적 > 1GB 경고 (디스크 보호)

**검증:**
- Unit: wal2json JSON 파서 (UPDATE old/new 추출)
- Integration: 테이블 INSERT → 구독자에게 이벤트 도달
- Performance Benchmark: 100 msg/sec 연속 2분 drop 없음

### FR-9.2 Presence 채널

| 항목 | 내용 |
|------|------|
| **설명** | 같은 페이지에 접속한 사용자 목록 실시간 표시. supabase-realtime Presence 포팅. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E9-S2 (협업 인지) |
| **구현 기술** | 자체 WebSocket 서버 (ws 라이브러리), in-memory 상태 + Redis optional |
| **입력** | 채널명, 사용자 메타 |
| **출력** | Presence 리스트 변경 이벤트 |

**세부 요구사항:**
1. 채널별 최대 100명 (초과 시 별칭 "…외 N명")
2. 하트비트 30초, 미수신 60초 시 leave
3. 사용자 메타 (이름, 아바타, 현재 편집 셀 등)
4. 중복 연결 시 기존 연결 유지 + 메타 merge

**검증:**
- Unit: Presence 상태 diff 계산
- Integration: 2 브라우저 접속/이탈 → 즉시 반영
- Manual QA: 실제 2 사용자 동시 접속

### FR-9.3 Broadcast 채널

| 항목 | 내용 |
|------|------|
| **설명** | 임의 이벤트를 채널에 브로드캐스트 (DB 변경 없이). supabase-realtime Broadcast 포팅. |
| **우선순위** | P2 (v1.2+) |
| **관련 스토리** | E9-S3 (사용자 간 메시지) |
| **구현 기술** | WebSocket, JSON 메시지 |
| **입력** | 채널, 이벤트 이름, 페이로드 |
| **출력** | 구독자에게 메시지 전달 |

**세부 요구사항:**
1. 페이로드 최대 64KB
2. 이벤트 이름 알파벳/숫자/언더스코어만 허용
3. ack 옵션 (송신자에게 에코 여부)
4. Rate limit: 채널당 100 msg/분

**검증:**
- Integration: 송신 → 구독자 수신 확인
- Manual QA: 채널 간 격리 확인

---

## FR-10: Advisors

> Wave 2 채택: **3-Layer** (schemalint 컨벤션 + squawk DDL + splinter 38룰 TS 포팅) (3.95/5)
> 100점 도달: 80h, 점진 머지

### FR-10.1 Security Advisor (splinter 38룰)

| 항목 | 내용 |
|------|------|
| **설명** | Supabase splinter의 38개 보안 린트 룰을 TypeScript로 포팅. 런타임에서 `pg_catalog` 조회 후 위반 리포트. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E10-S1 (보안 점검) |
| **구현 기술** | 자체 TS 포팅 (PL/pgSQL 배제), Prisma raw query, 룰 레지스트리 |
| **입력** | 스키마 (기본 public) |
| **출력** | 위반 목록 (룰 ID, 객체, 심각도, 설명, 권장 조치) |

**세부 요구사항:**
1. 룰 ID 예시: `rls_disabled_in_public`, `function_search_path_mutable`, `auth_users_exposed`
2. 심각도 4단계: ERROR / WARN / INFO / HINT
3. 룰별 ON/OFF + mute (DQ-10.x 반영)
4. 결과 캐시 TTL 5분
5. 대시보드에 "미해결 ERROR 수" 뱃지

**검증:**
- Unit: 각 룰 개별 테스트 (38개)
- Integration: 알려진 위반 스키마 → 리포트 생성
- Manual QA: 룰 음소거 저장/복원

### FR-10.2 Performance Advisor

| 항목 | 내용 |
|------|------|
| **설명** | 느린 쿼리, 누락 인덱스, dead tuple 과다, AUTOVACUUM 미적용 테이블 탐지. `pg_stat_*` 뷰 활용. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E10-S2 (성능 점검) |
| **구현 기술** | `pg_stat_statements`, `pg_stat_user_tables`, `pg_indexes` |
| **입력** | 기간 (기본 24시간) |
| **출력** | 쿼리/테이블별 권고 |

**세부 요구사항:**
1. 느린 쿼리 top 20 (평균 실행 시간 기준)
2. FK 컬럼 인덱스 누락 탐지
3. dead tuple > 20% 경고
4. 인덱스 미사용 (pg_stat_user_indexes.idx_scan = 0, 30일 이상)
5. 각 항목 "예상 영향" + "권장 DDL"

**검증:**
- Integration: 더미 느린 쿼리 → 권고 출력
- Manual QA: 권고 DDL 적용 후 재측정

### FR-10.3 DDL 린트 (squawk 통합)

| 항목 | 내용 |
|------|------|
| **설명** | SQL Editor에서 DDL(ALTER/DROP/CREATE) 실행 전 squawk 스타일 룰 검사 (잠금 시간, NOT NULL 추가 without default 등). |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E10-S3 (DDL 안전성) |
| **구현 기술** | squawk 룰 포팅 (TS), SQL 파서 (pg-query-native 또는 자체 AST) |
| **입력** | DDL SQL |
| **출력** | 린트 위반 + 실행 가드 |

**세부 요구사항:**
1. 룰: `prefer_big_int`, `disallowed_unique_constraint`, `adding_required_field`, `renaming_column`
2. ERROR 룰은 실행 차단 (사용자가 override 체크박스로 강제)
3. WARN 룰은 경고만 표시
4. PR 차단 기능 (CI/CD 연동, DQ-10.x 반영)

**검증:**
- Unit: 각 룰 테스트
- Integration: 위험 DDL → 차단 확인

---

## FR-11: Data API

> Wave 2 채택: **REST 강화 + pgmq + SQLite 보조** (4.29/5), pg_graphql은 수요 트리거 시
> 100점 도달: 45→80~85 (즉시), 100은 GraphQL 트리거 시

### FR-11.1 REST API 자동 생성 (Prisma DMMF)

| 항목 | 내용 |
|------|------|
| **설명** | Prisma 모델에서 REST 엔드포인트 자동 생성 — GET/POST/PATCH/DELETE 패턴. RLS 자동 적용. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E11-S1 (API 접근) |
| **구현 기술** | Prisma DMMF → Next.js 16 Route Handler 동적 라우팅, OpenAPI 3.1 스펙 생성 |
| **입력** | 테이블명, 쿼리 파라미터 |
| **출력** | JSON 응답 + OpenAPI 문서 |

**세부 요구사항:**
1. 엔드포인트 패턴: `/rest/v1/{table}` (Supabase 호환)
2. 쿼리 파라미터: `select, limit, offset, order, filter`
3. PostgREST-style 연산자 (eq, neq, gt, lt, like, in)
4. Prisma RLS 에뮬레이션 — Session user role 전달 (`SET LOCAL role`)
5. OpenAPI 3.1 스펙 `/rest/v1/openapi.json` 제공

**검증:**
- Unit: 쿼리 파라미터 → Prisma where 빌더
- Integration: 5개 테이블 CRUD 왕복 테스트
- Performance Benchmark: GET p95 < 100ms

### FR-11.2 Queue (pgmq)

| 항목 | 내용 |
|------|------|
| **설명** | PostgreSQL pgmq 확장으로 메시지 큐. Outbox 패턴으로 트랜잭션 일관성 보장. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E11-S2 (비동기 작업) |
| **구현 기술** | pgmq 확장, Prisma raw query, Node.js 워커 (PM2 프로세스) |
| **입력** | 큐명, 메시지 JSON |
| **출력** | msg_id, visible_at |

**세부 요구사항:**
1. 큐 생성 UI에서 dedicated/partitioned 선택
2. visibility timeout 기본 30초, 메시지 타입별 조정
3. archive 테이블 — 성공 메시지 30일 보관 (DQ-11.x 반영)
4. DLQ (Dead Letter Queue) — 5회 실패 시 이관
5. 큐 지연/처리량 대시보드

**검증:**
- Unit: 큐 클라이언트 래퍼
- Integration: send → receive → archive 전체 사이클

### FR-11.3 SQLite 로컬 DB (오프라인 보조)

| 항목 | 내용 |
|------|------|
| **설명** | 세션 상태, 캐시, 로컬 설정 등 PostgreSQL 부담 줄이기 위한 SQLite + Drizzle. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E11-S3 (설정 저장) |
| **구현 기술** | SQLite, Drizzle ORM, WAL 모드 |
| **입력** | 키-값 세션 데이터 |
| **출력** | 읽기/쓰기 성공 |

**세부 요구사항:**
1. 용도: SQL Editor 탭 상태, UI 선호 (다크모드/테이블 정렬), 단기 캐시
2. 파일 위치: `/var/luckystyle4u/local.db`
3. 주기적 VACUUM 월 1회
4. 백업 불필요 (로컬 전용, 손실 허용)

**검증:**
- Unit: Drizzle query 래퍼
- Integration: 1000 row 삽입 후 조회

### FR-11.4 pg_graphql 도입 (수요 트리거 시)

| 항목 | 내용 |
|------|------|
| **설명** | Apollo/urql 호환 GraphQL 엔드포인트. 도입 조건 4개 중 2개 이상 충족 시 활성. |
| **우선순위** | P2 (v1.2+) |
| **관련 스토리** | E11-S4 (GraphQL 요구) |
| **구현 기술** | `pg_graphql` 확장, `/graphql` 엔드포인트 |
| **입력** | GraphQL 쿼리 |
| **출력** | GraphQL JSON 응답 |

**세부 요구사항:**
1. 도입 트리거: 외부 API 클라이언트 3+, 모바일 앱 도입, AI agent integration, 복잡 N+1 발생
2. introspection CI 체크
3. Persisted Query 지원 (운영 모드에서 ad-hoc 쿼리 제한)
4. Realtime과 통합 (Subscription)

**검증:**
- Integration: 확장 활성 + 스키마 exposure 확인

---

## FR-12: Observability

> Wave 2 채택: **node:crypto envelope + jose JWKS ES256** (0.87 권고도)
> 100점 도달: Vault + JWKS + Infrastructure 페이지

### FR-12.1 Vault (envelope 암호화)

| 항목 | 내용 |
|------|------|
| **설명** | Master Key (`/etc/luckystyle4u/secrets.env`)로 Data Encryption Key 래핑. 모든 시크릿(API 키, OAuth secret)은 envelope 암호화 후 DB 저장. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E12-S1 (시크릿 관리) |
| **구현 기술** | `node:crypto` AES-256-GCM, PostgreSQL `vault_secrets` 테이블, 권한 0640 |
| **입력** | plaintext, label |
| **출력** | 암호문, DEK ID, 메타 |

**세부 요구사항:**
1. MASTER_KEY 저장: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640), PM2 `env_file` (DQ-12.3 확정)
2. KEK 회전 주기: 90일, 기존 데이터 재암호화 마이그레이션 지원
3. DEK 수명: 30일, 만료 시 새 DEK 발급 + 신규 데이터 적용
4. 감사 로그 — 읽기/쓰기 누가/언제
5. 복호화 캐시 5분 (빈번한 조회 최적화)

**검증:**
- Unit: envelope encrypt/decrypt 왕복
- Integration: KEK 회전 시나리오 (기존 데이터 접근 유지)
- Manual QA: MASTER_KEY 권한 확인 (`stat`)

### FR-12.2 JWKS (ES256)

| 항목 | 내용 |
|------|------|
| **설명** | JWT 서명을 HS256 → ES256 점진 전환. Public JWKS 엔드포인트 `/.well-known/jwks.json` 노출. 외부 서비스 검증 지원. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E12-S2 (토큰 무결성) |
| **구현 기술** | `jose` ES256 key pair, JWKS JSON 포맷 |
| **입력** | 서명 요청 (내부), JWKS 요청 (외부) |
| **출력** | 서명된 JWT, JWKS JSON |

**세부 요구사항:**
1. Private key는 Vault 저장
2. key rotation 90일, 이전 key는 30일 grace period (kid 사용)
3. JWKS 응답 `Cache-Control: max-age=300`
4. 외부 refresh JWKS 동기화 지원 (DQ-12.x 반영)

**검증:**
- Unit: ES256 서명/검증
- Integration: 외부 도구(`jwt.io`)에서 JWKS로 검증 성공

### FR-12.3 Infrastructure 페이지

| 항목 | 내용 |
|------|------|
| **설명** | PM2 프로세스, PostgreSQL/SeaweedFS 상태, 디스크/CPU/메모리, Cloudflare Tunnel 상태를 단일 페이지에 표시. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E12-S3 (운영 가시성) |
| **구현 기술** | PM2 API, `pg_stat_activity`, `systeminformation`, Cloudflare API |
| **입력** | 없음 (자동 수집) |
| **출력** | 메트릭 대시보드 |

**세부 요구사항:**
1. 5초 주기 폴링 (SSE로 push)
2. 임계값 알림 (CPU > 80%, 디스크 > 90%, PM2 restart > 5/h)
3. 최근 24시간 그래프 (Recharts)
4. 알림 채널 선택 (Slack, email)

**검증:**
- Integration: PM2 프로세스 강제 종료 → 알림 발생
- Manual QA: 대시보드 로드 < 2s

### FR-12.4 감사 로그 조회

| 항목 | 내용 |
|------|------|
| **설명** | Auth, Vault, Table Edit, Backup 모든 민감 액션을 `audit_log`에 기록. 페이지에서 필터/검색 가능. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E12-S4 (사후 추적) |
| **구현 기술** | PostgreSQL `audit_log` 테이블, append-only, 파티셔닝 (월별) |
| **입력** | 사용자, 액션, 리소스, 메타 JSON |
| **출력** | 필터링된 로그 |

**세부 요구사항:**
1. 보관 기간 1년, 이후 cold archive
2. 검색: 사용자, 액션, 리소스, 기간
3. JSON 내용 전문 검색 (GIN 인덱스)
4. Export CSV/JSON

**검증:**
- Integration: 액션 수행 → 로그 기록 확인
- Performance Benchmark: 100만 row에서 검색 p95 < 500ms

---

## FR-13: UX Quality (AI Assistant)

> Wave 2 채택: **AI SDK v6 + Anthropic BYOK + 자체 MCP `mcp-luckystyle4u`** (0.84 권고도)
> 100점 도달: ~$5/월, AI Assistant 통합

### FR-13.1 AI SDK v6 어시스턴트 통합

| 항목 | 내용 |
|------|------|
| **설명** | 대시보드 전역 우측 하단에 AI 어시스턴트 패널 (shadcn Sheet). 컨텍스트 인지형 (현재 페이지/테이블/쿼리), 스트리밍 응답. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E13-S1 (지능형 헬프) |
| **구현 기술** | AI SDK v6 (`ai` 패키지), Anthropic Claude Haiku/Sonnet, React Server Components |
| **입력** | 사용자 메시지, 현재 페이지 컨텍스트 |
| **출력** | 스트리밍 응답, tool call 결과 |

**세부 요구사항:**
1. 컨텍스트 자동 주입: 현재 테이블 스키마, 최근 쿼리 3개, 에러 로그 있으면 포함
2. Tool call: `lookupTable`, `runReadOnlySQL`, `searchDocs`, `openPage`
3. BYOK 기본, 미설정 시 제한된 호출 (관리자 서비스 키, 월 $5 한도)
4. 응답은 markdown → shadcn Typography 렌더
5. 대화 세션 메모리 (메시지) — 브라우저 sessionStorage, 새로고침 유지, 24시간 후 소거 (영구 저장 금지 — DQ-13.x)

**검증:**
- Unit: 컨텍스트 주입 로직
- Integration: mock LLM + tool → 정상 렌더
- Manual QA: 실제 Anthropic 키로 대화 성공

### FR-13.2 MCP 서버 (`mcp-luckystyle4u`)

| 항목 | 내용 |
|------|------|
| **설명** | Anthropic MCP 프로토콜 구현체. AI 어시스턴트가 자체 도구로 테이블 조회, RLS 정책 확인, 로그 검색 가능. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E13-S2 (도구 연계) |
| **구현 기술** | MCP SDK (TypeScript), 자체 tool 구현체 |
| **입력** | MCP 요청 (JSON-RPC) |
| **출력** | tool 실행 결과 |

**세부 요구사항:**
1. Tool: `list_tables`, `describe_table`, `read_rows`, `check_rls`, `recent_errors`
2. 모든 tool은 읽기 전용 (AI가 파괴적 작업 불가)
3. 사용자 권한 컨텍스트 전달 (RBAC 준수)
4. Claude Desktop, Cursor 등 외부 클라이언트도 연결 가능

**검증:**
- Unit: 각 tool JSON 스키마 검증
- Integration: MCP 클라이언트로 리스트/실행

### FR-13.3 토스트 알림 일관화 (Sonner)

| 항목 | 내용 |
|------|------|
| **설명** | 모든 CRUD 결과, 에러, 장기 실행 작업 진행률을 Sonner 토스트로 통일. 한국어 카피. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E13-S3 (피드백) |
| **구현 기술** | Sonner, React Context 래퍼 |
| **입력** | 메시지, 타입 (success/error/info/loading) |
| **출력** | 화면 토스트 |

**세부 요구사항:**
1. 우측 하단 고정, 최대 3개 동시 표시
2. success 3초, error 5초, loading 자동 해제 대기
3. Promise 기반 래퍼 — `toast.promise(fetchFn, {loading, success, error})`
4. 한국어 기본 카피 유형 30개 (예: "저장되었습니다", "삭제할 수 없습니다 — FK 제약")

**검증:**
- Unit: 타입별 duration 확인
- Manual QA: 실제 에러 발생 시 한국어 토스트 표시

### FR-13.4 다크 테마 (Supabase 스타일)

| 항목 | 내용 |
|------|------|
| **설명** | 사이드바 네비, 카드 기반 레이아웃, 다크 기본 + 라이트 토글. CLAUDE.md 명시 요구. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E13-S4 (브랜드 일관성) |
| **구현 기술** | Tailwind 4 CSS variables, shadcn/ui 테마 시스템 |
| **입력** | 사용자 선호 (localStorage) |
| **출력** | 테마 적용된 UI |

**세부 요구사항:**
1. 색상 팔레트 — Supabase green (`#3ECF8E`) 액센트 + 중립 회색 베이스
2. 시스템 테마 감지 (`prefers-color-scheme`)
3. 컴포넌트 토큰 — background, foreground, muted, accent, destructive
4. 접근성 대비 WCAG AA 충족

**검증:**
- Unit: 테마 토큰 일관성
- Manual QA: 라이트/다크 전환 후 모든 페이지 순회

---

## FR-14: Operations

> Wave 2 채택: **Capistrano-style + PM2 cluster:4 + canary.stylelucky4u.com 시간차** (0.87 권고도)
> 100점 도달: 자체 Capistrano + 자동 symlink 롤백

### FR-14.1 Capistrano-style 배포 스크립트

| 항목 | 내용 |
|------|------|
| **설명** | `releases/{timestamp}` 디렉토리에 새 빌드 배치 → `current` symlink 전환 → PM2 reload. 실패 시 symlink 역복원. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E14-S1 (무중단 배포) |
| **구현 기술** | bash/node 배포 스크립트, PM2 `reload` (graceful) |
| **입력** | 빌드 아티팩트 경로 |
| **출력** | 배포 로그 + 헬스 체크 결과 |

**세부 요구사항:**
1. 마지막 5개 release 보관 (롤백용)
2. 배포 단계: build 검증 → rsync → symlink swap → PM2 reload → 헬스 체크 → 유지/롤백
3. 헬스 체크 실패 시 자동 롤백 (< 5초)
4. 다운타임 0초 목표 (PM2 cluster:4 rolling)
5. 배포 이력 UI — 누가 언제 어느 버전

**검증:**
- Integration: 더미 에러 빌드 → 자동 롤백
- Manual QA: 연속 10회 배포 → 다운타임 측정 0

### FR-14.2 PM2 cluster:4 관리

| 항목 | 내용 |
|------|------|
| **설명** | PM2 cluster 4 워커로 Next.js 실행. crash 자동 재시작, 모니터링. |
| **우선순위** | P0 (MVP) |
| **관련 스토리** | E14-S2 (프로세스 안정성) |
| **구현 기술** | PM2, `ecosystem.config.js`, Next.js 16 standalone build |
| **입력** | ecosystem 설정 |
| **출력** | 4개 프로세스 상태 |

**세부 요구사항:**
1. 워커 crash 3회/분 초과 시 알림
2. `max_memory_restart: 1G` (누수 자동 복구)
3. 로그 `/var/log/pm2/{name}-{n}.log` 회전 (1일, 7일 보관)
4. `pm2 monit` 대시보드 외부 접근 차단

**검증:**
- Manual QA: 워커 강제 kill → 자동 복구 확인

### FR-14.3 Canary 배포 (canary.stylelucky4u.com)

| 항목 | 내용 |
|------|------|
| **설명** | 신규 버전을 `canary.stylelucky4u.com` 서브도메인에 먼저 배포 → 1시간 관찰 → 프로덕션 승격. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E14-S3 (리스크 감소) |
| **구현 기술** | Cloudflare Tunnel 복수 호스트, PM2 별도 앱 인스턴스 |
| **입력** | 빌드 |
| **출력** | canary URL + 승격 버튼 |

**세부 요구사항:**
1. canary 에러율 > 1%면 승격 차단
2. canary 고정 트래픽 (운영자 + 개발자)
3. DB 마이그레이션은 canary 전에 선행 (backward-compatible)
4. 승격 버튼은 admin 전용 + 2FA 재확인

**검증:**
- Integration: canary 에러 유발 → 승격 차단

### FR-14.4 자동 마이그레이션 + 롤백

| 항목 | 내용 |
|------|------|
| **설명** | Prisma migrate을 배포 파이프라인에 통합. 실패 시 이전 마이그레이션 롤백 스크립트 자동 실행. |
| **우선순위** | P1 (v1.1) |
| **관련 스토리** | E14-S4 (스키마 변경 안전) |
| **구현 기술** | Prisma 7, 자체 롤백 SQL 관리 |
| **입력** | 새 마이그레이션 |
| **출력** | 성공/롤백 로그 |

**세부 요구사항:**
1. 각 마이그레이션마다 `up.sql` + `down.sql` 쌍 필수 (DQ-14.x 반영)
2. PITR backup 직전 자동 수행 (롤백 안전망)
3. 마이그레이션 실행 시간 > 5분 시 경고
4. Shadow DB로 사전 검증

**검증:**
- Integration: 잘못된 마이그레이션 → 자동 down 실행 확인

---

## 추적성 매트릭스 (FR → 스토리 → 기술)

| FR ID | 카테고리 | 우선순위 | 스토리 | 핵심 채택 기술 |
|-------|---------|---------|--------|--------------|
| FR-1.1 | Table Editor | P0 | E1-S1 | TanStack v8 + Prisma |
| FR-1.2 | Table Editor | P0 | E1-S2 | TanStack Query v5 + Zod |
| FR-1.3 | Table Editor | P0 | E1-S3 | Prisma 동적 where |
| FR-1.4 | Table Editor | P1 | E1-S4 | schemalint 패턴 + Monaco |
| FR-2.1 | SQL Editor | P0 | E2-S1 | Monaco + monaco-sql-languages |
| FR-2.2 | SQL Editor | P1 | E2-S2 | EXPLAIN + xyflow |
| FR-2.3 | SQL Editor | P1 | E2-S3 | AI SDK v6 + BYOK |
| FR-2.4 | SQL Editor | P1 | E2-S4 | PG Savepoint |
| FR-3.1 | Schema Viz | P0 | E3-S1 | Prisma DMMF + xyflow/elkjs |
| FR-3.2 | Schema Viz | P1 | E3-S2 | pg_policies + TanStack Table |
| FR-3.3 | Schema Viz | P1 | E3-S3 | pg_proc/pg_trigger + Monaco |
| FR-3.4 | Schema Viz | P2 | E3-S4 | schemalint 포팅 |
| FR-4.1 | DB Ops | P0 | E4-S1 | node-cron |
| FR-4.2 | DB Ops | P0 | E4-S2 | wal-g + B2 |
| FR-4.3 | DB Ops | P1 | E4-S3 | PG 트리거 + pgmq |
| FR-4.4 | DB Ops | P1 | E4-S2 | wal-g restore + Docker |
| FR-5.1 | Auth Core | P0 | E5-S1 | jose + bcrypt |
| FR-5.2 | Auth Core | P0 | E5-S2 | Lucia 패턴 (Session 테이블) |
| FR-5.3 | Auth Core | P0 | E5-S3 | jose 서명 링크 + HIBP |
| FR-5.4 | Auth Core | P0 | E5-S4 | 자체 RBAC DSL |
| FR-6.1 | Auth Adv | P0 | E6-S1 | TOTP RFC 6238 |
| FR-6.2 | Auth Adv | P0 | E6-S2 | WebAuthn FIDO2 |
| FR-6.3 | Auth Adv | P0 | E6-S3 | PG Rate Limit 테이블 |
| FR-6.4 | Auth Adv | P1 | E6-S4 | Auth.js 패턴 + PKCE |
| FR-6.5 | Auth Adv | P2 | E6-S5 | Cloudflare Turnstile |
| FR-7.1 | Storage | P0 | E7-S1 | SeaweedFS + B2 |
| FR-7.2 | Storage | P0 | E7-S2 | HMAC signed URL |
| FR-7.3 | Storage | P1 | E7-S3 | sharp |
| FR-7.4 | Storage | P2 | E7-S4 | TUS/S3 multipart |
| FR-8.1 | Edge Fn | P0 | E8-S1 | isolated-vm v6 |
| FR-8.2 | Edge Fn | P1 | E8-S2 | Deno 사이드카 |
| FR-8.3 | Edge Fn | P2 | E8-S3 | Vercel Sandbox |
| FR-8.4 | Edge Fn | P1 | E8-S4 | Monaco + 자체 배포 |
| FR-9.1 | Realtime | P1 | E9-S1 | wal2json |
| FR-9.2 | Realtime | P1 | E9-S2 | supabase-realtime Presence 포팅 |
| FR-9.3 | Realtime | P2 | E9-S3 | WebSocket Broadcast |
| FR-10.1 | Advisors | P0 | E10-S1 | splinter 38룰 TS 포팅 |
| FR-10.2 | Advisors | P1 | E10-S2 | pg_stat_* 분석 |
| FR-10.3 | Advisors | P1 | E10-S3 | squawk 포팅 |
| FR-11.1 | Data API | P0 | E11-S1 | Prisma DMMF + OpenAPI |
| FR-11.2 | Data API | P0 | E11-S2 | pgmq |
| FR-11.3 | Data API | P1 | E11-S3 | SQLite + Drizzle |
| FR-11.4 | Data API | P2 | E11-S4 | pg_graphql |
| FR-12.1 | Observability | P0 | E12-S1 | node:crypto envelope |
| FR-12.2 | Observability | P0 | E12-S2 | jose ES256 JWKS |
| FR-12.3 | Observability | P1 | E12-S3 | PM2 API + systeminformation |
| FR-12.4 | Observability | P0 | E12-S4 | PG audit_log 파티셔닝 |
| FR-13.1 | UX Quality | P1 | E13-S1 | AI SDK v6 + Anthropic |
| FR-13.2 | UX Quality | P1 | E13-S2 | MCP SDK TypeScript |
| FR-13.3 | UX Quality | P0 | E13-S3 | Sonner |
| FR-13.4 | UX Quality | P0 | E13-S4 | Tailwind 4 + shadcn |
| FR-14.1 | Operations | P0 | E14-S1 | Capistrano-style 스크립트 |
| FR-14.2 | Operations | P0 | E14-S2 | PM2 cluster:4 |
| FR-14.3 | Operations | P1 | E14-S3 | Cloudflare Tunnel multi-host |
| FR-14.4 | Operations | P1 | E14-S4 | Prisma migrate up/down |

---

## 요약 통계

| 구분 | 수량 | 비율 |
|------|------|------|
| **총 FR** | **55** | 100% |
| P0 (MVP) | 27 | 49.1% |
| P1 (v1.1) | 22 | 40.0% |
| P2 (v1.2+) | 6 | 10.9% |

**카테고리별 FR 수:**

| 카테고리 | FR 수 | P0 | P1 | P2 |
|---------|------|----|----|----|
| FR-1 Table Editor | 4 | 3 | 1 | 0 |
| FR-2 SQL Editor | 4 | 1 | 3 | 0 |
| FR-3 Schema Viz | 4 | 1 | 2 | 1 |
| FR-4 DB Ops | 4 | 2 | 2 | 0 |
| FR-5 Auth Core | 4 | 4 | 0 | 0 |
| FR-6 Auth Advanced | 5 | 3 | 1 | 1 |
| FR-7 Storage | 4 | 2 | 1 | 1 |
| FR-8 Edge Functions | 4 | 1 | 2 | 1 |
| FR-9 Realtime | 3 | 0 | 2 | 1 |
| FR-10 Advisors | 3 | 1 | 2 | 0 |
| FR-11 Data API | 4 | 2 | 1 | 1 |
| FR-12 Observability | 4 | 3 | 1 | 0 |
| FR-13 UX Quality | 4 | 2 | 2 | 0 |
| FR-14 Operations | 4 | 2 | 2 | 0 |
| **합계** | **55** | **27** | **22** | **6** |

> 집계: FR-6 Auth Advanced가 5개(FR-6.1~6.5)로 확장되어 총합 55개. 평균 3.93개/카테고리.

---

## 다음 문서 연결

- **상류**: `00-product-vision.md` (Vision) → `01-user-stories.md` (Epic/Story)
- **하류**:
  - `03-non-functional-requirements.md` (NFR — 성능/보안/가용성)
  - `04-constraints-assumptions.md` (CON/ASM — 제약/가정)
  - `05-100점-definition.md` (완료 기준)
- **Wave 4 청사진 입력**: 본 FR이 카테고리별 아키텍처 설계의 직접 입력

---

> 작성 완료: 2026-04-18 (Wave 3 Agent R1)
> 다음: R2가 NFR + CON/ASM 작성, M1~M3가 보조 문서 작성
