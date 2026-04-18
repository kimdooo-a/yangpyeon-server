# 01. 사용자 스토리 — Supabase 100점 동등성 프로젝트

> **Wave 3 / V2 산출물** — 양평 부엌 서버 대시보드(stylelucky4u.com)의 Supabase 동등 수준 달성을 위한 Epic/User Story 사양서.
> 작성일: 2026-04-18 (세션 26) | 연관: [00-product-vision.md](./00-product-vision.md) · [README.md](../README.md) · [_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md)
> 프레임워크: Epic → Story(As a / I want / so that) → MoSCoW → Gherkin Acceptance Criteria → 14 카테고리 매핑
> 페르소나: **김도영(P1, Primary — 1인 운영자)** + **협업 개발자(P2, Future — 팀 2~5명 확장 시나리오)** + **외부 감사자(P3, 컴플라이언스 검증)**

---

## 목차

- [B1. Epic 구조](#b1-epic-구조)
  - [E1: 데이터베이스 관리 (Table + SQL + Schema Viz)](#e1-데이터베이스-관리-table--sql--schema-viz)
  - [E2: 인증 & 권한 관리 (Auth Core + Auth Advanced)](#e2-인증--권한-관리-auth-core--auth-advanced)
  - [E3: 스토리지 & 실행 환경 (Storage + Edge Functions)](#e3-스토리지--실행-환경-storage--edge-functions)
  - [E4: 실시간 & Data API (Realtime + Data API + Integrations)](#e4-실시간--data-api-realtime--data-api--integrations)
  - [E5: 관측 · DB Ops · 배포 (Observability + DB Ops + Operations)](#e5-관측--db-ops--배포-observability--db-ops--operations)
  - [E6: AI 어시스턴트 (UX Quality)](#e6-ai-어시스턴트-ux-quality)
  - [E7: 컴플라이언스 & 보안 (Advisors + 위협대응)](#e7-컴플라이언스--보안-advisors--위협대응)
- [B2. MoSCoW 분류 요약](#b2-moscow-분류-요약)
  - [Must-have 집계](#must-have-집계)
  - [Should-have 집계](#should-have-집계)
  - [Could-have 집계 (v2+ 대상)](#could-have-집계-v2-대상)
  - [Won't-have (의도적 제외)](#wont-have-의도적-제외)
- [B3. 카테고리 커버리지 매트릭스](#b3-카테고리-커버리지-매트릭스)
- [B4. 페르소나·스토리 교차](#b4-페르소나스토리-교차)

---

## B1. Epic 구조

### E1: 데이터베이스 관리 (Table + SQL + Schema Viz)

> 카테고리 #1 Table Editor(4.54) + #2 SQL Editor(4.70) + #3 Schema Visualizer(4.30) 통합.
> 핵심 가치: **"Supabase Studio를 열지 않고도 프로덕션 PostgreSQL을 안전하게 들여다보고 조작"**.

#### US-E1-01. 대용량 테이블 브라우징 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 100만 행 이상 테이블을 지연 없이 정렬/필터/페이지네이션하고,
- **So that** 프로덕션 데이터 상태를 실시간으로 파악할 수 있다.
- **관련 카테고리**: 01 Table Editor
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 1인 운영자가 /database/tables/orders 에 접속한 상태이고
    And 해당 테이블 총 행 수가 1,234,567건이며
    And 테이블에 20개 컬럼이 존재할 때
  When 14번째 컬럼(created_at DESC) 기준 서버 정렬을 수행하면
  Then 서버 사이드 정렬 + 페이지네이션 결과가 p95 < 200ms 이내에 응답되고
    And 현재 페이지 50행이 virtualized row 렌더링으로 그려지며
    And URL에 ?sort=created_at.desc&page=1&size=50 상태가 유지되고
    And 브라우저 새로고침 후에도 동일 상태가 복원된다
  ```

#### US-E1-02. 안전한 Row CRUD (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 인라인 Row 추가/수정/삭제 시 트랜잭션 기반 쓰기와 변경 이력 추적을,
- **So that** 실수로 인한 데이터 파손을 즉시 되돌릴 수 있다.
- **관련 카테고리**: 01 Table Editor + 12 Observability (audit)
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given /database/tables/users 에서 기존 행을 편집 모드로 진입한 상태에서
  When 단일 셀의 값을 "NULL"로 변경하고 Enter를 누르면
  Then "변경사항 미리보기" 모달이 팝업되어 before/after diff가 시각화되고
    And 사용자가 "확인"을 누르면 PostgreSQL 트랜잭션으로 UPDATE가 실행되며
    And audit_logs 테이블에 actor/table/pk/diff/timestamp가 기록되고
    And 실패 시 Sonner 토스트로 에러를 표시하되 Optimistic Update가 자동 롤백된다
  ```

#### US-E1-03. SQL Editor 즉시 실행 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** Monaco 기반 SQL Editor에서 임의 쿼리를 실행하고 결과를 즉시 확인하며,
- **So that** psql을 별도로 열 필요 없이 브라우저 한곳에서 진단할 수 있다.
- **관련 카테고리**: 02 SQL Editor
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given /database/sql 페이지에서 Monaco 에디터가 로드된 상태이고
    And 사용자가 "SELECT * FROM orders WHERE status='pending' LIMIT 100;" 을 입력할 때
  When Ctrl+Enter 단축키로 실행하면
  Then 쿼리는 read-only 역할(pg_read_only)로 실행되어 결과가 가상 스크롤 그리드로 렌더링되고
    And 실행 시간/영향받은 행 수/쿼리 해시가 하단 상태바에 표시되며
    And 쿼리 히스토리가 ypb_sqlite(SQLite 보조 DB)에 자동 저장되어 세션 간 유지되고
    And EXPLAIN ANALYZE 토글 시 Plan Visualizer가 활성화된다
  ```

#### US-E1-04. SQL Snippet 공유 & 버전 (Should)

- **As a** 1인 운영자(P1) 및 향후 협업자(P2),
- **I want** 자주 쓰는 SQL을 Snippet으로 저장하고 폴더/태그로 분류하며,
- **So that** 반복 작업을 템플릿화하고 팀 확장 시 지식 자산으로 남길 수 있다.
- **관련 카테고리**: 02 SQL Editor
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 SQL Editor에서 쿼리 작성 후 "Save as Snippet" 버튼을 클릭할 때
  When 제목/설명/폴더/태그를 입력하고 저장하면
  Then snippet은 ypb_sqlite.sql_snippets 에 FTS5 인덱싱과 함께 저장되고
    And 좌측 탐색 트리에서 폴더 구조로 즉시 노출되며
    And 각 snippet은 최대 10개 버전까지 자동 히스토리가 유지되고
    And 제목 기반 fuzzy 검색이 100ms 이내에 응답된다
  ```

#### US-E1-05. 스키마 시각화 & RLS 오버레이 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** @xyflow 기반 ERD와 RLS 정책 오버레이를 동시에 보고,
- **So that** FK 관계와 보안 경계를 한눈에 감사할 수 있다.
- **관련 카테고리**: 03 Schema Visualizer + 10 Advisors (RLS)
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /database/schemas 에 접속한 상태에서
  When Prisma DMMF + pg_policies 조회 결과가 병합되어 로드되면
  Then 테이블이 xyflow 노드로, FK가 간선으로 렌더링되고 elkjs로 자동 레이아웃되며
    And "RLS 오버레이 ON" 토글 시 RLS 정책이 있는 테이블에 방패 아이콘이 표시되고
    And 정책 미설정된 public 스키마 테이블은 빨간 테두리로 하이라이트되며
    And 특정 노드 클릭 시 우측 drawer에 컬럼/인덱스/정책/트리거/함수가 탭으로 펼쳐진다
  ```

#### US-E1-06. 정책/트리거/함수 관리 페이지 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** /database/{policies,triggers,functions} 전용 페이지에서 CRUD와 enable/disable을,
- **So that** pg_policies/pg_trigger/pg_proc를 직접 수정하지 않아도 된다.
- **관련 카테고리**: 03 Schema Visualizer + 06 Auth Advanced (RLS)
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /database/policies 에 접속한 상태에서
  When "New Policy" 버튼을 누르면
  Then 대상 테이블/정책명/명령(SELECT/INSERT/UPDATE/DELETE/ALL)/USING/WITH CHECK를 입력하는 폼이 열리고
    And Monaco 기반 USING 표현식 에디터에 RLS 함수(auth.uid() 등) 자동완성이 제공되며
    And 저장 시 CREATE POLICY DDL이 squawk로 린트된 뒤 트랜잭션으로 실행되고
    And 실패 시 SQL 에러 메시지가 한국어 가이드와 함께 표시된다
  ```

---

### E2: 인증 & 권한 관리 (Auth Core + Auth Advanced)

> 카테고리 #5 Auth Core(4.08) + #6 Auth Advanced(4.59) 통합.
> 핵심 가치: **"Supabase Auth의 핵심 UX(Login/TOTP/WebAuthn/Rate Limit)를 jose 자산 위에 재구축"**.

#### US-E2-01. Email + Password 로그인 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 이메일+비밀번호로 로그인하고 세션 쿠키가 안전하게 발급되기를,
- **So that** 대시보드에 접근 가능한 유일 경로가 명확히 관리된다.
- **관련 카테고리**: 05 Auth Core
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 미인증 사용자가 /login 에 접속한 상태에서
  When 올바른 이메일/비밀번호(bcrypt 검증)를 제출하면
  Then jose로 RS256 서명된 JWT가 생성되어 httpOnly+Secure+SameSite=Lax 쿠키로 발급되고
    And Session 레코드가 PostgreSQL sessions 테이블에 저장되며
    And /dashboard 로 리다이렉트되고
    And 비밀번호 실패 5회 누적 시 Rate Limit(10분) 적용 + 알림이 발송된다
  ```

#### US-E2-02. TOTP 2단계 인증 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** Google Authenticator/1Password TOTP를 2단계 인증으로 강제하고,
- **So that** 비밀번호 유출 시에도 계정 탈취를 막는다.
- **관련 카테고리**: 06 Auth Advanced
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 이미 /login 1단계 인증을 통과한 사용자 상태에서
  When /auth/mfa/totp 페이지로 리다이렉트되어 6자리 TOTP를 입력하면
  Then otplib가 HMAC-SHA1 RFC6238 기반으로 30초 window 검증하고
    And 성공 시 mfa_verified=true 클레임이 JWT에 포함되며
    And 연속 3회 실패 시 Rate Limit이 적용되고 보안 로그에 기록되며
    And 최초 등록 시 BackupCode 10개가 1회성으로 다운로드 가능하다
  ```

#### US-E2-03. WebAuthn Passkey 지원 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** YubiKey/Touch ID/Windows Hello 등 WebAuthn Passkey를 등록하고 사용하기를,
- **So that** TOTP 없이도 FIDO2 표준으로 피싱 저항성을 확보한다.
- **관련 카테고리**: 06 Auth Advanced
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /account/security 에서 "Add Passkey" 버튼을 누른 상태에서
  When 브라우저 WebAuthn navigator.credentials.create() 호출로 인증자 등록을 수행하면
  Then @simplewebauthn/server가 attestation을 검증하고
    And Credential(publicKey/counter/transports)이 webauthn_credentials 테이블에 저장되며
    And 이후 로그인 시 Passkey 옵션이 TOTP와 동등한 2FA 대안으로 제공되고
    And 동일 사용자당 최대 5개 Passkey까지 등록 가능하다
  ```

#### US-E2-04. Rate Limit & 위협 감지 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 로그인/API/Edge Function 호출에 IP·사용자 기반 Rate Limit이 적용되기를,
- **So that** 브루트포스/DDoS를 차단하고 리소스를 보호한다.
- **관련 카테고리**: 06 Auth Advanced + 12 Observability
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given Rate Limit 룰이 { path: '/api/auth/login', limit: 5/10m, key: ip+email } 으로 설정된 상태에서
  When 동일 IP에서 5회 초과 로그인 시도가 발생하면
  Then 6번째 요청부터 429 Too Many Requests + Retry-After 헤더가 반환되고
    And rate_limit_events 테이블에 블록 이벤트가 기록되며
    And 관리자 대시보드 /security/rate-limits 에 실시간으로 표시되고
    And 10분 경과 후 슬라이딩 윈도우가 리셋된다
  ```

#### US-E2-05. OAuth Provider 확장 (Should)

- **As a** 1인 운영자(P1) 및 향후 팀(P2),
- **I want** Google/GitHub OAuth 로그인을 선택적으로 활성화하고,
- **So that** 외부 협력자나 감사자에게 계정 발급 없이 제한된 접근을 제공할 수 있다.
- **관련 카테고리**: 05 Auth Core + 06 Auth Advanced
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given Admin이 /settings/auth/providers 에서 Google OAuth 클라이언트ID/Secret을 등록한 상태에서
  When 사용자가 /login 에서 "Continue with Google" 버튼을 클릭하면
  Then OAuth 2.0 Authorization Code + PKCE 플로우가 시작되고
    And 성공 시 이메일 도메인 allowlist(stylelucky4u.com 등)에 매칭되면 자동 계정 생성되며
    And allowlist 외 도메인은 거부되고 audit_logs에 기록되며
    And 기존 이메일과 충돌 시 "계정 연결" 모달이 제공된다
  ```

#### US-E2-06. 세션 관리 & 강제 로그아웃 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 활성 세션 목록을 보고 의심 세션을 즉시 만료시키기를,
- **So that** 분실된 디바이스로부터의 접근을 끊는다.
- **관련 카테고리**: 05 Auth Core
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /account/sessions 에 접속한 상태에서
  When 현재 활성 세션 리스트(IP/User-Agent/last_seen/created_at)가 로드되면
  Then 각 세션마다 "Revoke" 버튼이 제공되고
    And "Revoke All Others" 버튼 클릭 시 현재 세션 제외 전부가 sessions 테이블에서 soft-delete되며
    And 해당 JWT는 Revoked 목록에 추가되어 middleware가 차단하고
    And 60초 이내에 모든 탭에서 강제 로그아웃이 반영된다
  ```

---

### E3: 스토리지 & 실행 환경 (Storage + Edge Functions)

> 카테고리 #7 Storage(4.25) + #8 Edge Functions(4.22) 통합.
> 핵심 가치: **"SeaweedFS S3 호환 + 3층 Edge 런타임(isolated-vm/Deno/Sandbox)으로 서버리스 워크로드를 자체호스팅"**.

#### US-E3-01. 파일 업로드 & 공개 URL (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 이미지/동영상/문서를 드래그앤드롭으로 업로드하고 공개 URL을 받기를,
- **So that** Supabase Storage 없이도 CDN 배포 가능한 정적 자산 호스팅을 갖는다.
- **관련 카테고리**: 07 Storage
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /storage/buckets/public 에서 파일을 드래그앤드롭한 상태에서
  When 100MB 이하 파일 1개가 업로드되면
  Then SeaweedFS S3 API(port 8333)로 PutObject가 실행되고
    And 업로드 진행률이 Sonner 토스트로 실시간 표시되며
    And 성공 시 https://stylelucky4u.com/storage/public/{filename} 공개 URL이 발급되고
    And storage_objects 테이블에 size/mime/owner/bucket_id/created_at이 기록된다
  ```

#### US-E3-02. 이미지 Transform 파이프라인 (Should)

- **As a** 1인 운영자 김도영(P1),
- **I want** 업로드한 이미지를 on-the-fly로 resize/format 변환하기를,
- **So that** 여러 해상도 파일을 사전 생성하지 않고도 반응형 대응이 가능하다.
- **관련 카테고리**: 07 Storage
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given 이미지 hero.png 가 public 버킷에 업로드된 상태에서
  When 클라이언트가 /storage/public/hero.png?width=800&format=webp&quality=80 로 요청하면
  Then sharp 기반 Transform worker가 변환을 수행하고
    And 결과가 SeaweedFS transform-cache 버킷에 30일 TTL로 캐싱되며
    And 동일 쿼리 재요청은 캐시에서 <50ms로 응답되고
    And 입력 파일이 변경되면 ETag 기반으로 캐시가 자동 무효화된다
  ```

#### US-E3-03. 버킷 RLS 권한 관리 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 버킷 단위 public/private + Row-level 권한을 설정하기를,
- **So that** 공개 에셋과 비공개 문서를 동일 인프라에 안전하게 혼재 저장한다.
- **관련 카테고리**: 07 Storage + 06 Auth Advanced
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given Admin이 /storage/buckets/invoices 를 private로 설정한 상태에서
  When 미인증 사용자가 /storage/invoices/2026-04.pdf 로 직접 접근하면
  Then 403 Forbidden이 반환되고
    And 인증된 owner=user.id 조건의 RLS 정책을 통과한 사용자만 Signed URL(15분 TTL)로 다운로드 가능하며
    And 모든 접근 시도가 storage_access_logs 에 기록되고
    And Signed URL 공유 후 수동 revoke가 가능하다
  ```

#### US-E3-04. Edge Function 작성 & 실행 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 브라우저에서 TypeScript로 Edge Function을 작성하고 배포하기를,
- **So that** 간단한 Webhook/크론 작업을 별도 서버 없이 실행할 수 있다.
- **관련 카테고리**: 08 Edge Functions
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /functions/new 에서 Monaco로 "export default handler" 코드를 작성한 상태에서
  When "Deploy" 버튼을 누르면
  Then decideRuntime()이 요구 기능(Deno std 필요 여부/C 확장/네트워크 등)을 분석해 isolated-vm/Deno/Sandbox 중 선택하고
    And 빌드 결과가 functions/{id}/v{n}.js 로 SeaweedFS에 저장되며
    And HTTPS 엔드포인트 /functions/{slug} 가 즉시 활성화되고
    And 배포 히스토리 10개까지 즉시 롤백 가능하다
  ```

#### US-E3-05. Function 실행 로그 & 메트릭 (Should)

- **As a** 1인 운영자 김도영(P1),
- **I want** Function 실행 로그/에러/지연 히스토그램을 브라우저에서 조회하기를,
- **So that** 오류 재현과 성능 튜닝을 빠르게 할 수 있다.
- **관련 카테고리**: 08 Edge Functions + 12 Observability
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given Function "notify-email" 이 활성화된 상태이고 최근 24시간 1,200회 호출된 경우
  When 사용자가 /functions/notify-email/logs 에 접속하면
  Then 호출 타임스탬프/상태코드/지연(ms)/stdout/stderr가 가상 스크롤 테이블로 표시되고
    And "이 시각대 에러만" 필터로 5xx만 격리 가능하며
    And p50/p95/p99 지연이 Recharts 히스토그램으로 시각화되고
    And 7일 이상 된 로그는 자동 아카이브된다
  ```

---

### E4: 실시간 & Data API (Realtime + Data API + Integrations)

> 카테고리 #9 Realtime(4.05) + #11 Data API(4.29) 통합.
> 핵심 가치: **"wal2json 하이브리드 CDC + REST 강화 + pgmq 잡 큐로 Supabase Realtime/REST 전반 대응"**.

#### US-E4-01. CDC 실시간 구독 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** orders 테이블의 INSERT/UPDATE를 WebSocket으로 실시간 구독하기를,
- **So that** 대시보드에 신규 주문이 들어올 때 즉시 반영된다.
- **관련 카테고리**: 09 Realtime
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given /dashboard/orders 페이지에서 WebSocket이 /realtime/v1 에 연결된 상태에서
  When orders 테이블에 INSERT 이벤트가 발생하면
  Then wal2json이 WAL 레코드를 JSON으로 디코딩하여 Node 게이트웨이로 전달하고
    And supabase-realtime 포팅 계층이 채널 구독자(orders:INSERT)에게 payload를 푸시하며
    And DB commit → 브라우저 수신까지 p95 < 300ms 이내로 반영되고
    And 재연결 시 missed_events 복구 옵션을 통해 무손실 전달이 보장된다
  ```

#### US-E4-02. REST API 자동 생성 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** PostgREST 스타일의 자동 REST API(/rest/v1/{table})를 테이블별로 노출하기를,
- **So that** 외부 스크립트/모바일 앱에서 바로 DB를 읽고 쓸 수 있다.
- **관련 카테고리**: 11 Data API
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given Prisma DMMF가 orders 모델을 포함한 상태에서
  When GET /rest/v1/orders?status=eq.pending&select=id,total,created_at&order=created_at.desc&limit=20 요청이 들어오면
  Then 자동 생성된 핸들러가 필터/선택/정렬/페이지네이션을 SQL로 변환하여 실행하고
    And Row Level Security가 JWT sub 클레임 기반으로 적용되며
    And 결과가 application/json + Content-Range 헤더와 함께 200 OK로 반환되고
    And OpenAPI 3.1 스펙이 /rest/v1/openapi.json 으로 자동 발행된다
  ```

#### US-E4-03. pgmq 잡 큐 모니터링 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** pgmq 큐 상태(pending/in-flight/dlq)와 잡 리스트를 대시보드에서 모니터링하기를,
- **So that** 이메일 발송/이미지 처리 등 비동기 작업의 상태를 관찰할 수 있다.
- **관련 카테고리**: 11 Data API (pgmq)
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given /queues/emails 페이지에서 pgmq.queue_size() 결과가 로드된 상태에서
  When 최근 1시간 내 처리된 잡 리스트를 조회하면
  Then 잡 id/payload/try_count/last_error/vt/created_at이 표시되고
    And DLQ에 있는 잡은 빨간 배지와 함께 "Retry" 버튼이 제공되며
    And 큐 깊이가 1,000 초과 시 대시보드 상단에 경고 배너가 뜨고
    And 큐 통계(처리량/실패율)가 Recharts로 시각화된다
  ```

#### US-E4-04. GraphQL 엔드포인트 (Could)

- **As a** 향후 협업 개발자(P2),
- **I want** pg_graphql 기반 GraphQL 엔드포인트를 선택적으로 활성화하기를,
- **So that** 복잡한 관계 쿼리나 N+1 회피가 필요할 때 REST 대신 사용할 수 있다.
- **관련 카테고리**: 11 Data API
- **MoSCoW**: **Could** (수요 트리거 4개 중 2개 충족 시 활성화)
- **Acceptance Criteria**:
  ```gherkin
  Given Admin이 /settings/data-api/graphql 에서 pg_graphql 확장을 활성화한 상태에서
  When POST /graphql { ordersCollection(filter:{status:{eq:"pending"}}){ edges{ node{ id total user{ email } } } } } 요청이 들어오면
  Then pg_graphql이 단일 SQL로 컴파일하여 실행하고
    And 결과가 GraphQL 규격 JSON으로 반환되며
    And /graphql/playground 에 GraphiQL IDE가 제공되고
    And 수요 트리거(복잡 관계/N+1/타입 안전/외부 요청 4개 중 2개) 충족 시만 기본 활성화된다
  ```

---

### E5: 관측 · DB Ops · 배포 (Observability + DB Ops + Operations)

> 카테고리 #4 DB Ops(4.36) + #12 Observability(0.87) + #14 Operations(0.87) 통합.
> 핵심 가치: **"RPO 60초/RTO 30분 달성 + KEK 회전 + canary 5초 롤백"**.

#### US-E5-01. 자동 백업 & 복구 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 매일 자정 wal-g 기반 PITR 백업이 수행되고 30일 보관되기를,
- **So that** 데이터 손실 사고 시 60초 단위로 복원할 수 있다.
- **관련 카테고리**: 04 DB Ops
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given wal-g 설정이 archive_timeout=60s + base_backup_schedule=daily로 구성된 상태에서
  When 00:00 KST에 node-cron이 base backup 잡을 트리거하면
  Then wal-g backup-push 가 B2 Cloud Storage로 압축 업로드되고
    And 일일 백업 크기/소요시간이 /ops/backups 페이지에 기록되며
    And 30일 이상 된 백업은 retention 정책으로 자동 삭제되고
    And 임의 시점으로 복원 리허설이 월 1회 canary 인스턴스에 자동 수행된다
  ```

#### US-E5-02. 예약 작업(Cron) 관리 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** /ops/cron 대시보드에서 node-cron 잡을 CRUD하고 실행 이력을 확인하기를,
- **So that** 리포트 메일/데이터 집계 등 반복 작업을 코드 없이 관리한다.
- **관련 카테고리**: 04 DB Ops
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given /ops/cron 페이지에서 "New Job" 버튼을 누른 상태에서
  When cron 표현식 "0 9 * * MON-FRI", 대상 Edge Function "daily-report", 타임존 Asia/Seoul을 입력하면
  Then cron_jobs 테이블에 잡이 등록되고 PM2 cluster 중 1개가 node-cron 스케줄러로 채택되며
    And 실행 이력(started/ended/status/logs)이 cron_runs 테이블에 기록되고
    And 연속 3회 실패 시 자동 일시정지 + 알림이 발송되고
    And 수동 "Run Now" 버튼으로 즉시 테스트 가능하다
  ```

#### US-E5-03. JWT 서명키 회전 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** JWT 서명키(JWKS)를 90일마다 자동 회전하고 구키 grace period를 두기를,
- **So that** 키 유출에 대한 차단막을 확보하면서 사용자 로그아웃 없이 회전한다.
- **관련 카테고리**: 12 Observability
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 현재 활성 JWT 키가 kid="2026-01" 상태이고
  When 90일 경과 시 node-cron이 키 회전 잡을 트리거하면
  Then jose가 새 RSA 키쌍을 생성하여 kid="2026-04" 로 등록하고
    And /.well-known/jwks.json 에 두 키(current + previous)가 동시 노출되며
    And 신규 JWT는 새 키로 서명되고 기존 JWT는 구키로 검증 가능하며
    And 14일 grace period 후 구키는 JWKS에서 자동 제거된다
  ```

#### US-E5-04. KEK/DEK 시크릿 볼트 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** DB에 저장되는 민감 정보(API Token/OAuth Secret 등)를 envelope 암호화하기를,
- **So that** DB 덤프가 유출돼도 평문 키는 새어나가지 않는다.
- **관련 카테고리**: 12 Observability
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given MASTER_KEY가 /etc/luckystyle4u/secrets.env (root:ypb-runtime 0640)에 저장된 상태에서
  When 사용자가 /settings/secrets 에 새 API Key를 등록하면
  Then node:crypto가 AES-256-GCM으로 DEK를 생성하여 평문을 암호화하고
    And DEK는 MASTER_KEY(KEK)로 암호화되어 secrets.encrypted_dek 필드에 저장되며
    And 원문은 메모리에만 존재하고 DB에는 저장되지 않으며
    And KEK 회전 시 re-wrap 스크립트로 모든 DEK가 재암호화된다
  ```

#### US-E5-05. Canary 배포 & 시간차 롤백 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 새 버전을 canary.stylelucky4u.com 에 먼저 배포하고 5분 관찰 후 프로덕션에 승격하기를,
- **So that** 장애 발생 시 5초 이내에 symlink 롤백으로 복구한다.
- **관련 카테고리**: 14 Operations
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /ops/deploy 에서 v1.24.0 빌드 아티팩트를 선택한 상태에서
  When "Deploy to canary" 를 클릭하면
  Then Capistrano-style 스크립트가 /opt/app/releases/v1.24.0/ 에 배포 후 current symlink를 canary로 전환하고
    And 헬스체크 (/api/health)가 5분간 p95<200ms + 에러율<0.5% 유지 시 "Promote to prod" 버튼이 활성화되며
    And 임계치 위반 시 자동으로 이전 symlink로 롤백되고 5초 이내 복구되며
    And 모든 배포 이벤트가 audit_logs + Sonner로 기록된다
  ```

#### US-E5-06. 감사 로그 조회 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 모든 관리 작업(테이블 편집/정책 변경/배포/시크릿 갱신)의 감사 로그를 조회하기를,
- **So that** 사고 발생 시 누가/언제/무엇을 했는지 재구성할 수 있다.
- **관련 카테고리**: 12 Observability
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given audit_logs 테이블에 최근 7일 1만 건의 이벤트가 있는 상태에서
  When 사용자가 /ops/audit?actor=kdy&action=UPDATE&table=users 로 필터를 적용하면
  Then 매칭 이벤트가 시간 역순으로 페이지네이션되어 표시되고
    And 각 이벤트 클릭 시 before/after JSON diff + request_id + session_id가 확장되며
    And CSV 다운로드 버튼으로 필터 결과를 내보낼 수 있고
    And 이벤트는 append-only로 저장되어 수정/삭제가 불가능하다
  ```

---

### E6: AI 어시스턴트 (UX Quality)

> 카테고리 #13 UX Quality(0.84) 단독.
> 핵심 가치: **"AI SDK v6 + Anthropic BYOK + 자체 MCP `mcp-luckystyle4u`로 월 $5 미만 운영 + 대시보드 맥락 이해"**.

#### US-E6-01. AI SQL 보조 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** SQL Editor에서 자연어로 "지난 30일 상위 매출 고객 10명"을 입력하면 SQL이 생성되기를,
- **So that** 스키마를 기억하지 않고도 빠르게 쿼리를 작성할 수 있다.
- **관련 카테고리**: 13 UX Quality + 02 SQL Editor
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given SQL Editor 우측 AI 패널이 활성화되고 BYOK Anthropic API 키가 설정된 상태에서
  When 사용자가 "지난 30일 매출 상위 10명 고객" 이라고 한국어로 입력하면
  Then mcp-luckystyle4u MCP가 현재 스키마(DMMF)를 컨텍스트로 삼아 claude-haiku-4로 SQL을 생성하고
    And 생성된 SQL이 Monaco에 프리뷰로 삽입되며
    And "Insert" 버튼 클릭 시 최종 에디터에 반영되고
    And 월간 토큰 사용량이 /settings/ai 에 표시되며 $5 초과 시 자동 일시정지된다
  ```

#### US-E6-02. 에러 디버그 어시스턴트 (Should)

- **As a** 1인 운영자 김도영(P1),
- **I want** SQL 실행 에러 메시지를 AI가 한국어로 해설하고 수정안을 제안하기를,
- **So that** PostgreSQL 내부 에러 코드를 일일이 구글링하지 않는다.
- **관련 카테고리**: 13 UX Quality
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given SQL 실행이 "ERROR: relation 'ordre' does not exist" 로 실패한 상태에서
  When 사용자가 에러 토스트의 "Explain with AI" 버튼을 클릭하면
  Then AI가 "테이블명 오타로 보입니다(ordre → orders)" 라고 한국어로 설명하고
    And 수정된 SQL이 diff 형태로 제안되며
    And "Apply" 버튼 클릭 시 에디터에 즉시 적용되고
    And 동일 에러 패턴은 ypb_sqlite.ai_hint_cache 에 캐싱되어 재호출 비용이 절감된다
  ```

#### US-E6-03. 스키마 제안 & 마이그레이션 생성 (Could)

- **As a** 1인 운영자 김도영(P1),
- **I want** "고객 등급 컬럼을 추가해줘" 요청 시 Prisma 마이그레이션 초안을 생성하기를,
- **So that** DDL 문법을 외우지 않고도 스키마 변경을 시작할 수 있다.
- **관련 카테고리**: 13 UX Quality + 03 Schema Visualizer
- **MoSCoW**: **Could**
- **Acceptance Criteria**:
  ```gherkin
  Given 사용자가 /database/schemas 에서 AI 버튼을 누르고 "users 테이블에 tier enum 컬럼 추가" 를 입력한 상태에서
  When AI가 현재 users 스키마를 분석하면
  Then Prisma schema 변경분이 diff로 제안되고 (enum Tier { bronze silver gold })
    And 생성될 마이그레이션 SQL(ALTER TABLE ... ADD COLUMN)이 squawk로 사전 검증되며
    And "Create Migration" 버튼 클릭 시 prisma/migrations/YYYYMMDDHHMMSS_add_tier/ 가 생성되고
    And 실제 실행 전 사용자 확인 대화가 의무화된다
  ```

#### US-E6-04. 벡터 검색 기반 문서 QA (Could)

- **As a** 1인 운영자(P1) 및 향후 팀(P2),
- **I want** /docs 의 프로젝트 내부 문서를 AI가 벡터 검색으로 답변하기를,
- **So that** handover/규칙/references를 일일이 열지 않고도 질의할 수 있다.
- **관련 카테고리**: 13 UX Quality
- **MoSCoW**: **Could**
- **Acceptance Criteria**:
  ```gherkin
  Given pgvector 확장이 활성화되고 /docs 하위 마크다운이 pgvector에 임베딩된 상태에서
  When 사용자가 /assistant 에서 "wal-g 백업 주기가 얼마야?" 라고 질문하면
  Then 코사인 유사도 기반 top-5 청크가 검색되고
    And Claude가 인용 링크와 함께 한국어로 답변하며
    And 답변 하단에 참조 문서 경로가 클릭 가능한 링크로 표시되고
    And 인덱스는 문서 변경 시 파일 해시 비교로 증분 갱신된다
  ```

---

### E7: 컴플라이언스 & 보안 (Advisors + 위협대응)

> 카테고리 #10 Advisors(3.95) + 보안 위협 모델 반영.
> 핵심 가치: **"3-Layer Advisor(schemalint+squawk+splinter) + Supabase 호환 감사 체계"**.

#### US-E7-01. 3-Layer Advisor 실행 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** 스키마/DDL/런타임 3계층 Advisor를 /security/advisors 에서 원클릭 실행하기를,
- **So that** 취약점·성능 이슈·컨벤션 위반을 한곳에서 점검한다.
- **관련 카테고리**: 10 Advisors
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given /security/advisors 페이지에서 "Run All Checks" 버튼을 누른 상태에서
  When schemalint(컨벤션) + squawk(DDL 린트) + splinter 38룰(런타임)이 순차 실행되면
  Then 결과가 "Layer / Rule / Severity(critical/high/medium/low) / Table" 컬럼으로 표시되고
    And critical 이슈는 빨간 배지 + 클릭 시 수정 가이드 링크가 제공되며
    And 음소거(muted) 처리한 룰은 별도 필터로 관리 가능하고
    And 실행 결과가 advisor_runs 테이블에 30일 보관된다
  ```

#### US-E7-02. RLS 미설정 경고 (Must)

- **As a** 1인 운영자 김도영(P1),
- **I want** RLS가 비활성화된 public 스키마 테이블을 Advisor가 critical로 보고하기를,
- **So that** Data API를 통한 무단 접근을 사전에 방지한다.
- **관련 카테고리**: 10 Advisors + 06 Auth Advanced
- **MoSCoW**: **Must**
- **Acceptance Criteria**:
  ```gherkin
  Given public 스키마에 RLS 미설정 테이블 "temp_logs" 가 존재하는 상태에서
  When splinter 포팅 "rls_disabled_in_public" 룰이 실행되면
  Then critical severity로 보고되고
    And 수정 가이드 "ALTER TABLE temp_logs ENABLE ROW LEVEL SECURITY;" 가 제공되며
    And 해당 테이블이 Data API(/rest/v1/temp_logs)로 노출 중이면 더 높은 심각도로 승격되고
    And 수정 후 재실행 시 이슈가 자동 닫힌다
  ```

#### US-E7-03. PR 차단 & CI 통합 (Should)

- **As a** 향후 협업 개발자(P2),
- **I want** GitHub PR에 대해 schemalint + squawk가 자동 실행되어 critical 이슈가 있으면 머지를 차단하기를,
- **So that** 문제 있는 스키마 변경이 프로덕션에 들어가지 못한다.
- **관련 카테고리**: 10 Advisors
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given GitHub Actions 워크플로에 advisors CI job이 등록된 상태에서
  When PR에 prisma/migrations 변경이 포함되어 푸시되면
  Then schemalint + squawk가 자동 실행되고
    And critical 이슈 발견 시 PR 체크가 실패(red X)로 표시되며
    And PR 코멘트에 이슈 리스트 + 라인 번호 링크가 자동 작성되고
    And 관리자는 특정 룰을 PR 라벨("advisor:ignore:rule_name")로 일시 무시 가능하다
  ```

#### US-E7-04. Supabase 호환 감사 체계 (Should)

- **As a** 외부 감사자 페르소나(P3),
- **I want** Supabase Studio와 동일한 카테고리(Auth/Storage/Data/Security)로 감사 보고서를 생성하기를,
- **So that** Supabase 사용 조직에서 옮겨올 때 감사 절차 재작성 부담이 없다.
- **관련 카테고리**: 10 Advisors + 12 Observability
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given /security/audit-report 에서 "Generate Supabase-Compatible Report" 를 누른 상태에서
  When 지난 30일 audit_logs + advisor_runs + access_logs가 집계되면
  Then Supabase Studio 스타일(Auth/Storage/Database/Edge Functions 4대 섹션) PDF가 생성되고
    And 각 섹션에 KPI(로그인 성공률/MFA 채택율/RLS 커버리지/에러율)가 표시되며
    And 생성 파일이 storage://audit-reports/YYYYMM.pdf 로 저장되고
    And 외부 감사자에게 Signed URL(7일 TTL)로 공유 가능하다
  ```

#### US-E7-05. 위협 탐지 & 알림 (Should)

- **As a** 1인 운영자 김도영(P1),
- **I want** 비정상 패턴(대량 다운로드/비정상 IP/권한 상승 시도)이 감지되면 즉시 알림받기를,
- **So that** 공격 징후를 조기에 차단한다.
- **관련 카테고리**: 12 Observability + 06 Auth Advanced
- **MoSCoW**: **Should**
- **Acceptance Criteria**:
  ```gherkin
  Given 위협 탐지 룰이 { rule: "bulk_download", threshold: "100 files / 5m" } 로 설정된 상태에서
  When 단일 세션에서 5분간 120개 파일 다운로드가 발생하면
  Then threat_events 테이블에 critical 이벤트가 기록되고
    And Slack/이메일(smartkdy7@naver.com)로 즉시 알림이 발송되며
    And 해당 세션이 자동 lock되어 관리자 승인 없이 재사용 불가하고
    And 5분 내 false positive 판정 시 원클릭 해제가 가능하다
  ```

---

## B2. MoSCoW 분류 요약

> 총 **36 스토리** — Must 25 (69%) · Should 7 (19%) · Could 4 (11%) · Won't 10건 제외 명시.
> Must-have 비중 **69%** 로 L4 계약(≥60%) 충족.

### Must-have 집계

> MVP(Phase 1) 및 100점 도달에 필수. Wave 4 청사진에서 전부 아키텍처화, Wave 5 로드맵에서 Phase 배정.

| ID | 스토리 | 카테고리 |
|----|--------|---------|
| US-E1-01 | 대용량 테이블 브라우징 | 01 Table Editor |
| US-E1-02 | 안전한 Row CRUD | 01 Table Editor + 12 Observability |
| US-E1-03 | SQL Editor 즉시 실행 | 02 SQL Editor |
| US-E1-05 | 스키마 시각화 & RLS 오버레이 | 03 Schema Visualizer + 10 Advisors |
| US-E1-06 | 정책/트리거/함수 관리 페이지 | 03 Schema Visualizer + 06 Auth Advanced |
| US-E2-01 | Email+Password 로그인 | 05 Auth Core |
| US-E2-02 | TOTP 2단계 인증 | 06 Auth Advanced |
| US-E2-03 | WebAuthn Passkey 지원 | 06 Auth Advanced |
| US-E2-04 | Rate Limit & 위협 감지 | 06 Auth Advanced + 12 Observability |
| US-E2-06 | 세션 관리 & 강제 로그아웃 | 05 Auth Core |
| US-E3-01 | 파일 업로드 & 공개 URL | 07 Storage |
| US-E3-03 | 버킷 RLS 권한 관리 | 07 Storage + 06 Auth Advanced |
| US-E3-04 | Edge Function 작성 & 실행 | 08 Edge Functions |
| US-E4-01 | CDC 실시간 구독 | 09 Realtime |
| US-E4-02 | REST API 자동 생성 | 11 Data API |
| US-E4-03 | pgmq 잡 큐 모니터링 | 11 Data API |
| US-E5-01 | 자동 백업 & 복구 (wal-g) | 04 DB Ops |
| US-E5-02 | 예약 작업(Cron) 관리 | 04 DB Ops |
| US-E5-03 | JWT 서명키 회전 | 12 Observability |
| US-E5-04 | KEK/DEK 시크릿 볼트 | 12 Observability |
| US-E5-05 | Canary 배포 & 시간차 롤백 | 14 Operations |
| US-E5-06 | 감사 로그 조회 | 12 Observability |
| US-E6-01 | AI SQL 보조 | 13 UX Quality + 02 SQL Editor |
| US-E7-01 | 3-Layer Advisor 실행 | 10 Advisors |
| US-E7-02 | RLS 미설정 경고 | 10 Advisors + 06 Auth Advanced |

> **Must 합계: 25 / 36 = 69%** (L4 계약 60% 기준 초과 달성, Wave 4 청사진 우선 대상)

### Should-have 집계

> v1.1 ~ v1.2 릴리스 대상. Must가 안정화된 직후 순차 착수.

| ID | 스토리 | 카테고리 | 착수 조건 |
|----|--------|---------|----------|
| US-E1-04 | SQL Snippet 공유 & 버전 | 02 SQL Editor | US-E1-03 배포 후 |
| US-E2-05 | OAuth Provider 확장 (Google/GitHub) | 05 + 06 Auth | Must Auth 전체 안정화 |
| US-E3-02 | 이미지 Transform 파이프라인 | 07 Storage | US-E3-01 GA 후 |
| US-E3-05 | Function 실행 로그 & 메트릭 | 08 + 12 | Edge Functions 운영 1개월 |
| US-E6-02 | 에러 디버그 어시스턴트 | 13 UX | AI 비용 가드 확정 후 |
| US-E7-03 | PR 차단 & CI 통합 | 10 Advisors | GitHub org 전환 + 협업자 확보 |
| US-E7-04 | Supabase 호환 감사 체계 | 10 + 12 | 외부 감사 수요 발생 시 |
| US-E7-05 | 위협 탐지 & 알림 | 12 + 06 | 기본 감사 로그 안정화 후 |

### Could-have 집계 (v2+ 대상)

> 수요 트리거 기반 선택적 활성화. Wave 5 로드맵의 Phase 19~20 이후.

| ID | 스토리 | 카테고리 | 활성화 트리거 |
|----|--------|---------|--------------|
| US-E4-04 | GraphQL 엔드포인트 (pg_graphql) | 11 Data API | 수요 트리거 4개 중 2개 충족 (복잡 관계/N+1/타입 안전/외부 요청) |
| US-E6-03 | 스키마 제안 & 마이그레이션 생성 | 13 + 03 | AI 비용 한도($5/월) 확보 + 안정성 검증 |
| US-E6-04 | 벡터 검색 기반 문서 QA | 13 UX | pgvector 도입 결정 + 문서 ≥ 200개 |

### Won't-have (의도적 제외)

> Wave 3 시점에서 **명시적으로 범위 밖** 처리. Wave 5 로드맵에서 재검토 트리거만 기록.

| 제외 항목 | 카테고리 | 제외 근거 |
|----------|---------|----------|
| **Multi-tenancy (tenant 격리)** | 전체 | 1인 운영 정책 — 특수 요구에 "Multi-tenancy 의도적 제외" 명시(_CHECKPOINT_KDYWAVE.md L26) |
| **Supabase Studio 임베드** | 03 Schema Visualizer | Wave 1 거부 결정 — 패턴만 흡수 (Prisma Studio/drizzle-kit 포함) |
| **Lucia / Auth.js 라이브러리 채택** | 05 Auth Core | Wave 1 거부 — 기존 jose 자산 보존 + 패턴 15개 차용 전략 |
| **MinIO (Storage 단독 채택)** | 07 Storage | 2026-02-12 아카이빙 + SigV4 + AGPL VC로 명확 배제 (Wave 2 D팀 결론) |
| **pgsodium 기반 Vault** | 12 Observability | SUPERUSER 의존 + Prisma 비호환 + 빌드 부담 (Wave 1 결정) |
| **pg_cron 확장** | 04 DB Ops | 1인 환경 과한 의존성, node-cron 자체 + Node 핸들러 80% 비중 (Wave 2 B팀) |
| **Docker/Kubernetes 이행** | 14 Operations | 현 PM2 cluster:4 + Cloudflare Tunnel이 모든 조건 충족, 이행 트리거 0개 (Wave 2 G팀) |
| **Realtime Presence/Broadcast 고급 기능** | 09 Realtime | v1 범위는 Postgres Changes만. Presence/Broadcast는 v2+ 수요 트리거 시 |
| **Supabase Edge Runtime 직접 채택** | 08 Edge Functions | 3층 하이브리드(isolated-vm/Deno/Sandbox) 자체 구현으로 대체 |
| **Row-level 사용량 기반 과금** | 전체 | 내부 관리 대시보드 — 과금 기능 없음 |

---

## B3. 카테고리 커버리지 매트릭스

> 14 카테고리 전부 1건 이상 스토리 연결 확인 (L4 계약).

| # | 카테고리 | 직접 연결 스토리 수 | 대표 스토리 |
|---|---------|--------------------|------------|
| 01 | Table Editor | 2 | US-E1-01, US-E1-02 |
| 02 | SQL Editor | 3 | US-E1-03, US-E1-04, US-E6-01 |
| 03 | Schema Visualizer | 3 | US-E1-05, US-E1-06, US-E6-03 |
| 04 | DB Ops | 2 | US-E5-01, US-E5-02 |
| 05 | Auth Core | 3 | US-E2-01, US-E2-05, US-E2-06 |
| 06 | Auth Advanced | 6 | US-E2-02~04, US-E3-03, US-E7-02, US-E7-05 |
| 07 | Storage | 3 | US-E3-01, US-E3-02, US-E3-03 |
| 08 | Edge Functions | 2 | US-E3-04, US-E3-05 |
| 09 | Realtime | 1 | US-E4-01 |
| 10 | Advisors | 4 | US-E1-05, US-E7-01~04 |
| 11 | Data API | 3 | US-E4-02, US-E4-03, US-E4-04 |
| 12 | Observability | 6 | US-E5-03~06, US-E2-04, US-E7-05 |
| 13 | UX Quality | 4 | US-E6-01~04 |
| 14 | Operations | 1 | US-E5-05 |

> **총 연결 수 43** (스토리 36 × 평균 1.19 카테고리) — 모든 카테고리 ≥1 (L4 계약 충족).

---

## B4. 페르소나·스토리 교차

| 페르소나 | 규모 | 주요 스토리 | 비중 |
|---------|-----|------------|------|
| **P1 김도영 (1인 운영자)** | v1 시점 100% | E1~E7 전 Epic 공통 주체, Must 25건 모두 | 100% |
| **P2 협업 개발자 (2~5명 팀)** | v2+ 확장 시 | US-E1-04, US-E2-05, US-E6-04, US-E7-03 | 약 14% |
| **P3 외부 감사자** | 이벤트 기반 | US-E7-04 (Supabase 호환 감사 체계) | 약 3% |

> P1이 절대 주체이며, P2/P3 스토리도 "P1이 P2/P3에게 기능을 열어주는 형태"로 구조화됨 — 1인 운영자 컨텍스트를 파괴하지 않음.

---

## 후속 작업 (Wave 3 내)

1. **02-functional-requirements.md** (R1 Agent) — 본 스토리를 FR 항목으로 분해 (각 스토리 → 3~5개 FR)
2. **03-non-functional-requirements.md** (R2 Agent) — Gherkin 성능/보안 조건(p95<200ms, RPO 60s 등)을 NFR로 승격
3. **05-100점-definition.md** (M1 Agent) — Must 25건이 "100점 달성 최소 집합"임을 정량 증명
4. **07-dq-matrix.md** (M2 Agent) — 스토리 내 공백(DQ-1.10~, DQ-3.x, DQ-4.x)을 Wave 4로 이관
5. **Wave 4 청사진** — 각 Must 스토리 → 컴포넌트/API/데이터 모델로 전개

---

## 변경 이력

- 2026-04-18 (세션 26): 초안 작성 (V2 Agent, opus). Epic 7개, Story 36개, Must 25(69%), Should 7, Could 4, Won't 10개.

> 문서 상태: **Wave 3 완료 후 잠금(Locked)** — 이후 변경은 Change Request 절차를 따름.
