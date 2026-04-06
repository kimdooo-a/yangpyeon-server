# Supabase Studio & Dashboard 심층 가이드

> **대상**: Supabase Studio의 전체 기능을 체계적으로 파악하고 싶은 개발자/팀  
> **최종 업데이트**: 2026-04-06  
> **공식 문서**: https://supabase.com/docs · https://supabase.com/blog/supabase-studio-3-0

---

## 목차

1. [개요: Supabase Studio 역할과 아키텍처](#1-개요)
2. [핵심 기능 상세](#2-핵심-기능-상세)
   - [Table Editor](#21-table-editor)
   - [SQL Editor](#22-sql-editor)
   - [Authentication 관리](#23-authentication-관리)
   - [Storage 관리](#24-storage-관리)
   - [Edge Functions 관리](#25-edge-functions-관리)
   - [Database 관리](#26-database-관리)
   - [API Documentation 자동 생성](#27-api-documentation-자동-생성)
   - [Realtime Inspector](#28-realtime-inspector)
   - [Log Explorer](#29-log-explorer)
   - [Reports & Monitoring](#210-reports--monitoring)
   - [Advisors (성능 및 보안 최적화)](#211-advisors)
   - [Schema Visualizer](#212-schema-visualizer)
3. [조직 및 프로젝트 관리](#3-조직-및-프로젝트-관리)
4. [제한사항: UI vs CLI/API](#4-제한사항-ui-vs-cliapi)
5. [Self-hosted Studio](#5-self-hosted-studio)

---

## 1. 개요

### 1.1 Supabase Studio란?

Supabase Studio는 Supabase 플랫폼의 공식 관리 대시보드다. 단순한 데이터베이스 GUI를 넘어, Supabase가 제공하는 모든 서비스(Database, Auth, Storage, Edge Functions, Realtime 등)를 하나의 인터페이스에서 관리할 수 있도록 설계되어 있다.

**Studio의 3가지 접근 경로:**
1. **Supabase Cloud**: https://supabase.com/dashboard (클라우드 호스팅)
2. **로컬 개발**: `supabase start` 명령 후 `http://localhost:54323`
3. **Self-hosted**: Docker Compose로 자체 서버에 배포

### 1.2 아키텍처 개요

Supabase Studio는 Next.js 기반의 오픈소스 웹 애플리케이션이다. GitHub 저장소에서 소스코드를 확인할 수 있다 (`supabase/supabase` 리포지토리의 `apps/studio` 디렉토리).

```
[사용자 브라우저]
       |
       v
[Supabase Studio (Next.js)]
       |
   ┌───┴────────────────────────────────────┐
   |                                         |
   v                                         v
[Management API]                    [PostgREST / Direct DB]
   |                                         |
   v                                         v
[프로젝트 설정, 빌링, 팀 관리]        [테이블 데이터, 스키마, 함수]
```

### 1.3 Studio 3.0 주요 업데이트

2024년 Supabase Studio 3.0이 출시되며 다음 기능들이 추가되었다:
- **AI SQL Editor**: SQL 에디터에 AI 어시스턴트 내장
- **Schema Diagrams**: 스키마 시각화 및 ERD 도구 강화
- **Wrappers UI**: Foreign Data Wrapper 관리 UI
- **명령어 팔레트(Command Menu)**: `Cmd+K`로 전체 기능 빠른 접근

---

## 2. 핵심 기능 상세

### 2.1 Table Editor

Table Editor는 Supabase Studio의 핵심 기능 중 하나로, 스프레드시트 인터페이스로 Postgres 데이터를 직접 조회·편집할 수 있다.

#### 주요 기능

**데이터 조회 및 필터링:**
- 테이블 데이터를 스프레드시트처럼 표시
- 컬럼 기준 오름차순/내림차순 정렬
- 단일 또는 복합 조건으로 필터링 (AND/OR 조건 지원)
- 특정 컬럼만 선택하여 표시 (Column Visibility)
- 페이지네이션으로 대용량 데이터 탐색

**데이터 편집:**
- 셀 클릭으로 인라인 편집
- 신규 행 추가 (폼 방식 또는 스프레드시트 방식)
- 행 삭제 (단일 또는 다중 선택)
- CSV 파일로 데이터 내보내기

**테이블 생성 및 스키마 편집:**
- GUI로 새 테이블 생성 (컬럼 타입, 기본값, NULL 허용 여부 설정)
- 컬럼 추가/삭제/수정
- Primary Key, Foreign Key 설정
- RLS(Row Level Security) 활성화/비활성화
- 테이블에 Realtime 활성화

**지원 데이터 타입:**
Table Editor는 Postgres의 주요 데이터 타입을 지원하지만, 복잡한 타입은 SQL Editor에서 직접 처리하는 것을 권장한다.

| 범주 | 지원 타입 |
|------|-----------|
| 숫자 | int2, int4, int8, float4, float8, numeric |
| 문자 | text, varchar, char, uuid |
| 날짜/시간 | date, time, timetz, timestamp, timestamptz |
| 불리언 | bool |
| JSON | json, jsonb |
| 배열 | 위 타입들의 배열 |
| 특수 | enum, tsvector |

**제한사항:**
- 조인 쿼리 결과 직접 편집 불가
- 복잡한 집계 쿼리는 SQL Editor 사용
- 스크롤 가상화: 수백만 행이 있는 테이블도 렌더링 가능하나 필터 사용 권장

#### Table Editor 단축키

| 단축키 | 동작 |
|--------|------|
| `↑ ↓` | 행 탐색 |
| `Enter` | 셀 편집 모드 진입 |
| `Escape` | 편집 취소 |
| `Tab` | 다음 셀로 이동 |
| `Shift+Tab` | 이전 셀로 이동 |

---

### 2.2 SQL Editor

SQL Editor는 Supabase Studio에서 자유롭게 SQL을 작성하고 실행할 수 있는 풀 기능 SQL IDE다.

#### 핵심 기능

**쿼리 실행:**
- SQL 문 작성 및 즉시 실행
- 결과를 테이블 뷰로 표시
- 쿼리 실행 시간 표시
- EXPLAIN/EXPLAIN ANALYZE 결과 시각화

**쿼리 저장 및 관리:**
- 자주 사용하는 쿼리를 스니펫으로 저장
- 스니펫 이름, 설명 추가
- 팀원과 스니펫 공유 (Team/Pro 플랜)
- `supabase/snippets` Git 폴더에 SQL 스니펫 동기화 지원 (2024년 업데이트)

**AI 어시스턴트 (AI SQL Editor):**
- `Cmd+K` 또는 에디터 내 AI 버튼으로 AI 어시스턴트 활성화
- 자연어로 SQL 생성 요청: "사용자별 월간 매출을 계산하는 쿼리를 작성해줘"
- 기존 쿼리 최적화 요청
- 보안/성능 이슈 자동 감지 및 수정 제안
- Security Advisor 및 Performance Advisor 이슈 컨텍스트를 AI에 자동 전달

**탭 기반 멀티 쿼리:**
- 여러 쿼리를 탭으로 동시에 열고 전환
- 탭별 독립적인 쿼리 상태 유지

#### SQL Editor 사용 예시

```sql
-- 복잡한 분석 쿼리를 SQL Editor에서 직접 실행
WITH monthly_revenue AS (
  SELECT 
    DATE_TRUNC('month', created_at) AS month,
    SUM(total_amount) AS revenue,
    COUNT(DISTINCT user_id) AS unique_customers,
    COUNT(*) AS total_orders
  FROM orders
  WHERE status = 'completed'
    AND created_at >= NOW() - INTERVAL '12 months'
  GROUP BY 1
)
SELECT
  TO_CHAR(month, 'YYYY-MM') AS period,
  revenue,
  unique_customers,
  total_orders,
  revenue / NULLIF(unique_customers, 0) AS revenue_per_customer,
  LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue,
  ROUND(
    100.0 * (revenue - LAG(revenue) OVER (ORDER BY month)) / 
    NULLIF(LAG(revenue) OVER (ORDER BY month), 0),
    2
  ) AS mom_growth_pct
FROM monthly_revenue
ORDER BY month;
```

#### SQL Editor 2.0 업데이트

Supabase는 SQL Editor 2.0 RFC를 통해 다음 기능들을 추가했다:
- 인라인 AI 제안
- 구문 강조(Syntax Highlighting) 개선
- 쿼리 이력(History) 관리
- 쿼리 결과 CSV/JSON 내보내기
- 결과 집계 및 차트 뷰 (베타)

---

### 2.3 Authentication 관리

Supabase Auth의 모든 설정을 Dashboard에서 관리할 수 있다.

#### 사용자 관리

**사용자 목록:**
- 가입된 모든 사용자 조회 (이메일, 생성일, 마지막 로그인, 공급자)
- 이메일로 사용자 검색
- 사용자 상세 정보 (메타데이터, 연결된 소셜 계정)
- 사용자 수동 생성 (이메일/비밀번호)
- 사용자 이메일 인증 강제 완료
- 사용자 비밀번호 재설정 이메일 발송
- 사용자 삭제

**사용자 메타데이터 편집:**
- `user_metadata` (사용자가 수정 가능)
- `app_metadata` (서버/Admin API만 수정 가능)

#### 인증 공급자 설정

```
Dashboard → Authentication → Providers
```

**이메일 설정:**
- 이메일+비밀번호 인증 활성화/비활성화
- 이메일 인증(Email Confirmation) 필수 여부
- 이메일 변경 인증 필요 여부
- 안전하지 않은 이메일 변경 허용 여부
- OTP 만료 시간 설정 (기본 1시간)

**소셜 공급자 (OAuth):**
- Google, GitHub, Apple, Facebook, Twitter/X, Discord, Slack, Spotify 등 20개 이상 지원
- 각 공급자별 Client ID, Client Secret 설정
- Redirect URL 자동 생성 및 제공

**전화번호 인증 (Phone OTP):**
- Twilio, MessageBird, Vonage 연동
- SMS 또는 WhatsApp OTP

**Magic Link:**
- 비밀번호 없이 이메일 링크로 로그인
- 만료 시간 설정

**SAML 2.0 (Enterprise):**
- SSO 설정 (Team 플랜 이상)
- Identity Provider 메타데이터 URL 입력

#### 이메일 템플릿 커스터마이징

```
Dashboard → Authentication → Email Templates
```

다음 템플릿을 HTML/텍스트로 커스터마이징 가능:
- **Confirm signup**: 회원가입 이메일 인증
- **Invite user**: 사용자 초대
- **Magic Link**: 매직 링크 로그인
- **Change Email Address**: 이메일 변경 인증
- **Reset Password**: 비밀번호 재설정
- **Reauthentication**: 재인증

#### URL 설정

```
Dashboard → Authentication → URL Configuration
```

- **Site URL**: 인증 성공 후 리다이렉트 기본 URL
- **Redirect URLs**: 허용된 리다이렉트 URL 화이트리스트 (와일드카드 지원)
- **Additional Redirect URLs**: 추가 허용 URL

#### Row Level Security 정책 편집

Authentication과 연결된 RLS 정책을 Dashboard에서 직접 관리:

```
Dashboard → Authentication → Policies
```

또는 테이블별로:
```
Dashboard → Table Editor → [테이블 선택] → RLS
```

---

### 2.4 Storage 관리

Supabase Storage는 객체 스토리지 서비스로, S3 호환 API를 제공한다.

#### 버킷 관리

```
Dashboard → Storage → New Bucket
```

**버킷 생성 옵션:**
- **버킷 이름**: 소문자, 숫자, 하이픈만 허용
- **Public/Private**: Public 버킷은 인증 없이 파일 URL로 접근 가능
- **파일 크기 제한**: 업로드 허용 최대 파일 크기 (기본 50MB)
- **허용 MIME 타입**: 업로드 허용 파일 형식 제한 (예: `image/*`, `video/mp4`)

**버킷 수준 정책:**
- Public 읽기 vs 인증 필요
- 파일 업로드/삭제 권한을 RLS로 세밀하게 제어

#### 파일 브라우저

```
Dashboard → Storage → [버킷 선택]
```

- 폴더 구조 탐색 (트리 뷰)
- 파일 업로드 (드래그 앤 드롭 또는 파일 선택)
- 파일 다운로드
- 파일 삭제 (단일 또는 다중)
- 폴더 생성
- 파일 URL 복사 (Public URL 또는 Signed URL 생성)
- 이미지 미리보기 (JPG, PNG, GIF, WebP)

#### 이미지 변환 (Image Transformation)

Pro 플랜 이상에서 이미지 변환 URL 파라미터 지원:
```
https://<project-ref>.supabase.co/storage/v1/object/public/bucket/image.jpg?width=300&height=200&quality=80
```

변환 파라미터:
- `width`, `height`: 픽셀 크기
- `quality`: 0-100 (JPEG 압축률)
- `format`: webp, avif, jpg, png
- `resize`: cover, contain, fill

#### Storage RLS 정책

Storage는 `storage.objects` 테이블에 RLS를 적용하여 파일별 접근 제어:

```sql
-- 사용자가 자신의 파일만 업로드/삭제 가능
CREATE POLICY "users_own_files"
ON storage.objects
FOR ALL
USING (auth.uid()::text = (storage.foldername(name))[1]);

-- 인증된 사용자는 공개 버킷 파일 읽기 가능
CREATE POLICY "authenticated_read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'public-assets' AND auth.role() = 'authenticated');
```

---

### 2.5 Edge Functions 관리

```
Dashboard → Edge Functions
```

#### 함수 목록 및 개요

- 배포된 모든 Edge Functions 목록
- 각 함수의 상태 (활성/비활성)
- 최근 호출 횟수 및 오류율
- 배포 날짜 및 버전

#### 함수 직접 생성 (Dashboard)

Dashboard에서 코드 에디터로 직접 함수 작성 및 배포:

```
Dashboard → Edge Functions → New Function
```

**사전 제공 템플릿:**
- Stripe Webhooks 처리
- OpenAI API 프록시
- Supabase Storage 파일 업로드
- 이메일 발송 (Resend 연동)
- 슬랙 봇 메시지

#### 함수 세부 정보

각 함수를 클릭하면:
- **Overview**: 함수 URL, 지역, 보안 설정
- **Logs**: 실시간 실행 로그 (최근 1시간)
- **Details**: 배포 버전 이력, 크기, 런타임 버전

#### 환경 변수 설정

```
Dashboard → Edge Functions → [함수 선택] → Details → Environment Variables
```

또는 프로젝트 전체 환경 변수:
```
Dashboard → Project Settings → Edge Functions → Function Secrets
```

#### 함수 호출 테스트

Dashboard 내 함수 세부 페이지에서 직접 HTTP 요청 테스트:
- HTTP 메서드 선택 (GET, POST, etc.)
- 헤더 및 Body 설정
- 응답 확인

---

### 2.6 Database 관리

#### 스키마 관리

```
Dashboard → Database → Schemas
```

- 스키마 목록 조회 (public, auth, storage, extensions 등)
- 새 스키마 생성
- 스키마 삭제 (주의: 포함된 객체도 함께 삭제)
- 스키마 별 테이블, 뷰, 함수 목록

#### 테이블 및 뷰

```
Dashboard → Database → Tables
Dashboard → Database → Views
```

- 테이블/뷰 목록 (스키마 필터)
- 컬럼 상세 정보 (타입, NULL 여부, 기본값)
- 인덱스 목록
- 트리거 목록
- 제약조건(Constraints) 목록

#### 함수 및 프로시저

```
Dashboard → Database → Functions
```

- 데이터베이스 함수 목록
- 함수 정의 보기 (읽기 전용)
- 함수 삭제
- 새 함수 생성 (SQL Editor 활용 권장)

#### 트리거

```
Dashboard → Database → Triggers
```

- 테이블별 트리거 목록
- 트리거 활성화/비활성화
- 트리거 정의 보기

#### 역할(Roles) 관리

```
Dashboard → Database → Roles
```

- Postgres 역할 목록 (`anon`, `authenticated`, `service_role`, 커스텀 역할)
- 역할 권한 확인
- 새 역할 생성 (SQL로 처리 권장)
- 역할별 CONNECTION LIMIT 설정

#### 익스텐션(Extensions) 관리

```
Dashboard → Database → Extensions
```

Supabase가 지원하는 Postgres 익스텐션 목록:

| 익스텐션 | 용도 |
|---------|------|
| `pg_cron` | 크론 작업 스케줄링 |
| `pgmq` | 메시지 큐 |
| `pg_net` | 비동기 HTTP 요청 |
| `uuid-ossp` | UUID 생성 |
| `pgcrypto` | 암호화 함수 |
| `pg_trgm` | 트라이그램 기반 텍스트 검색 |
| `unaccent` | 악센트 제거 (다국어 검색) |
| `vector` | pgvector (벡터 임베딩) |
| `postgis` | 지리공간 데이터 |
| `timescaledb` | 시계열 데이터 |
| `pgsodium` | 컬럼 레벨 암호화 |
| `pg_stat_statements` | 쿼리 통계 |

각 익스텐션 카드에서 토글로 활성화/비활성화 가능.

#### 인덱스(Index) 관리

```
Dashboard → Database → Indexes
```

- 테이블별 인덱스 목록
- 인덱스 타입 (B-tree, Hash, GIN, GiST, BRIN)
- 인덱스 크기
- Index Advisor 연동: 쿼리 성능 개선을 위한 인덱스 추천

#### Migrations

```
Dashboard → Database → Migrations
```

- 적용된 마이그레이션 목록 (파일명, 적용 시간)
- 마이그레이션 상태 확인
- 주의: Dashboard에서 스키마를 직접 수정하면 CLI 마이그레이션과 충돌할 수 있음

#### Wrappers (Foreign Data Wrappers)

```
Dashboard → Database → Wrappers
```

Studio 3.0에서 추가된 기능으로, 외부 데이터 소스를 Postgres 테이블처럼 연결:

- **Stripe**: Stripe 데이터를 SQL로 조회
- **S3**: AWS S3 파일을 테이블로 읽기
- **Firebase**: Firestore 데이터 연동
- **Airtable**: Airtable 베이스 연결
- **BigQuery**: Google BigQuery 연동
- **ClickHouse**: ClickHouse 분석 DB 연결

---

### 2.7 API Documentation 자동 생성

```
Dashboard → API Docs
```

Supabase의 REST API는 데이터베이스 스키마에서 자동으로 생성되며, 스키마 변경 즉시 반영된다.

#### 자동 생성 문서 구성

**왼쪽 사이드바:**
- Tables and Views: 각 테이블/뷰별 CRUD API
- Stored Procedures: RPC로 호출 가능한 함수 목록

**각 테이블/뷰 문서 내용:**
- 읽기 (Select): 조회 쿼리 예시
- 삽입 (Insert): 단일/다중 레코드 삽입
- 수정 (Update): 조건부 업데이트
- 삭제 (Delete): 조건부 삭제
- Upsert: 삽입 또는 업데이트

**언어별 코드 예시 자동 생성:**
- JavaScript (Supabase JS 클라이언트)
- cURL (직접 HTTP 요청)

```javascript
// Dashboard에서 자동 생성되는 코드 예시
const { data, error } = await supabase
  .from('profiles')
  .select('id, username, avatar_url')
  .eq('id', userId)
  .single()
```

#### OpenAPI 스펙 접근

PostgREST가 자동 생성하는 OpenAPI 스펙에 직접 접근 가능:

```
GET https://<project-ref>.supabase.co/rest/v1/
Accept: application/json
apikey: <your-anon-key>
```

Management API를 통해 프로그래밍 방식으로 OpenAPI 스펙 조회도 가능하다.

---

### 2.8 Realtime Inspector

```
Dashboard → Realtime
```

Supabase Realtime의 연결 상태와 이벤트를 실시간으로 모니터링하는 도구.

#### Realtime Inspector 기능

**Inspector 탭:**
- 현재 활성 WebSocket 연결 목록
- 각 연결의 채널 구독 상태
- 실시간 메시지 스트림 (Broadcast, Presence, DB Changes)
- 메시지 필터링 (채널명, 이벤트 타입)

**채널 모니터링:**

```
Dashboard → Realtime → Inspector
```

- 활성 채널 목록과 구독자 수
- 채널별 초당 메시지 전송량
- Presence 데이터 (온라인 사용자 목록)

**Realtime 설정:**

```
Dashboard → Realtime → Configuration
```

- **Realtime 활성화 테이블 관리**: 어떤 테이블의 변경사항을 Realtime으로 전송할지 설정
  - `INSERT`, `UPDATE`, `DELETE` 이벤트 선택
  - Full/Minimal 레코드 전송 선택
- **Rate Limits**: 채널당 메시지 제한 설정

#### Realtime 활성화 (테이블별)

```sql
-- SQL로 직접 설정
ALTER TABLE my_table REPLICA IDENTITY FULL;

-- Realtime Publication에 테이블 추가
BEGIN;
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE my_table;
COMMIT;
```

또는 Dashboard에서:
```
Dashboard → Database → Replication → supabase_realtime publication → 테이블 토글
```

---

### 2.9 Log Explorer

```
Dashboard → Logs → Log Explorer
```

Supabase 스택의 모든 로그를 SQL로 쿼리할 수 있는 고급 로그 분석 도구.

#### 로그 소스

Log Explorer는 다음 로그 소스를 SQL 테이블처럼 쿼리할 수 있다:

| 로그 소스 | 테이블명 | 설명 |
|-----------|---------|------|
| API Gateway | `edge_logs` | 모든 API 요청/응답 로그 |
| Postgres | `postgres_logs` | DB 쿼리 및 에러 로그 |
| Auth | `auth_logs` | 인증 이벤트 로그 |
| Storage | `storage_logs` | 파일 업로드/다운로드 로그 |
| Edge Functions | `function_logs` | Edge Function 실행 로그 |
| Realtime | `realtime_logs` | WebSocket 연결 및 메시지 로그 |

#### 기본 쿼리 예시

```sql
-- 최근 1시간 API 에러 요청 조회
SELECT
  timestamp,
  event_message,
  metadata->>'status_code' AS status_code,
  metadata->>'request_url' AS url,
  metadata->>'request_method' AS method
FROM edge_logs
WHERE 
  timestamp > NOW() - INTERVAL '1 hour'
  AND (metadata->>'status_code')::int >= 400
ORDER BY timestamp DESC
LIMIT 100;
```

```sql
-- 느린 Postgres 쿼리 조회 (1초 이상)
SELECT
  timestamp,
  event_message,
  metadata->>'query' AS query,
  (metadata->>'query_duration')::float AS duration_ms
FROM postgres_logs
WHERE 
  timestamp > NOW() - INTERVAL '24 hours'
  AND (metadata->>'query_duration')::float > 1000
ORDER BY duration_ms DESC
LIMIT 50;
```

```sql
-- Edge Function 에러 로그
SELECT
  timestamp,
  event_message,
  metadata->>'function_id' AS function_id,
  metadata->>'level' AS level
FROM function_logs
WHERE 
  timestamp > NOW() - INTERVAL '1 hour'
  AND metadata->>'level' = 'error'
ORDER BY timestamp DESC;
```

#### 고급 기능

**저장된 쿼리**: 자주 사용하는 로그 쿼리를 저장하여 재사용

**로그 다운로드**: 쿼리 결과를 CSV 스프레드시트로 내보내기

**정규식 검색**: 로그 메시지에 정규식 패턴 매칭 지원

```sql
-- 특정 패턴의 에러 메시지 검색
SELECT *
FROM postgres_logs
WHERE event_message ~ 'duplicate key.*constraint'
  AND timestamp > NOW() - INTERVAL '24 hours';
```

**로그 보존 기간:**

| 플랜 | 로그 보존 기간 |
|------|---------------|
| Free | 1일 |
| Pro | 7일 |
| Team | 28일 |
| Enterprise | 협의 |

---

### 2.10 Reports & Monitoring

```
Dashboard → Reports
```

Supabase Reports는 서비스별 성능 지표를 시각화하여 실시간 모니터링과 문제 진단을 지원한다.

#### API Report

```
Dashboard → Reports → API
```

- **요청 수**: 시간별 API 호출 횟수 그래프
- **오류율**: 4xx, 5xx 에러 비율
- **응답 시간**: P50, P95, P99 지연시간 분포
- **Top Endpoints**: 가장 많이 호출되는 API 엔드포인트
- **Top Error Endpoints**: 가장 많은 에러를 발생시키는 엔드포인트
- **Bandwidth**: 송수신 데이터량
- **User Distribution**: 지역별 요청 분포

#### Database Report

```
Dashboard → Reports → Database
```

- **DB 연결 수**: 활성 커넥션 트렌드
- **쿼리 실행 시간**: 평균/최대 쿼리 실행 시간
- **Cache Hit Rate**: 버퍼 캐시 적중률 (높을수록 좋음, 99% 이상 목표)
- **Index Hit Rate**: 인덱스 사용률
- **디스크 I/O**: 읽기/쓰기 처리량
- **테이블 크기**: 가장 큰 테이블 목록
- **복제 지연**: Read Replica 사용 시 주/복제 간 지연

#### Auth Report

```
Dashboard → Reports → Auth
```

- **일별 활성 사용자(DAU)**: 매일 로그인한 고유 사용자 수
- **월별 활성 사용자(MAU)**: 플랜 사용량 한도 모니터링에 중요
- **공급자별 로그인 분포**: 이메일, Google, GitHub 등 비율
- **인증 에러**: 로그인 실패, 토큰 만료 등 에러 추이
- **신규 사용자**: 기간별 신규 가입자 수

#### Realtime Report

```
Dashboard → Reports → Realtime
```

- **WebSocket 연결 수**: 동시 접속자 추이
- **채널 수**: 활성 채널 목록
- **메시지 처리량**: 초당 메시지 수
- **Presence 이벤트**: join/leave 이벤트 빈도

#### Edge Functions Report

```
Dashboard → Reports → Edge Functions
```

- **함수별 호출 수**: 각 함수의 호출 빈도
- **실행 시간 분포**: 각 함수의 P50/P95 실행 시간
- **메모리 사용량**: 함수별 메모리 프로파일
- **지역별 분포**: 어느 엣지 리전에서 실행되었는지
- **오류율**: 함수별 실패율

#### Query Performance (쿼리 성능 분석)

```
Dashboard → Reports → Query Performance
```

`pg_stat_statements` 익스텐션 데이터 기반으로 느린 쿼리 분석:

- **Total Time 기준 Top 쿼리**: 가장 많은 DB 시간을 소비하는 쿼리
- **Mean Time 기준 Top 쿼리**: 개별 실행 당 가장 느린 쿼리
- **가장 많이 호출된 쿼리**: 호출 빈도 기준
- **각 쿼리에 대한 Index Advisor 연동**: "이 쿼리에 인덱스 추가" 버튼으로 바로 최적화

---

### 2.11 Advisors

Supabase Advisors는 데이터베이스의 보안 취약점과 성능 이슈를 자동으로 진단하는 도구다. Supabase가 오픈소스로 공개한 두 가지 도구(`index_advisor`, `splinter`)를 통합한 기능이다.

#### Performance Advisor

```
Dashboard → Advisors → Performance
```

**진단 항목 (25개 이상의 lint 규칙):**

| 카테고리 | 진단 항목 | 설명 |
|---------|-----------|------|
| 인덱스 | 미설정 Foreign Key 인덱스 | FK 참조 컬럼에 인덱스 없는 경우 |
| 인덱스 | 중복 인덱스 | 동일 컬럼에 중복된 인덱스 |
| 인덱스 | 미사용 인덱스 | 조회에 전혀 사용되지 않는 인덱스 |
| 쿼리 | Sequential Scan 과다 | 전체 테이블 스캔 빈도가 높은 경우 |
| 쿼리 | Bloat | 테이블/인덱스 블로트 비율 높은 경우 |

**Index Advisor 통합:**
- `index_advisor` 익스텐션이 가상 인덱스를 생성하여 쿼리 최적화를 시뮬레이션
- "Add Index" 버튼 클릭으로 추천 인덱스 즉시 생성 가능
- 각 추천에 대한 예상 성능 개선 %를 표시

#### Security Advisor

```
Dashboard → Advisors → Security
```

**보안 진단 항목:**

| 심각도 | 항목 | 설명 |
|--------|------|------|
| ERROR | auth.users 테이블 공개 노출 | `auth.users`를 public 스키마에서 직접 참조하는 경우 |
| ERROR | RLS 비활성화 테이블 | public 스키마 테이블에 RLS가 꺼진 경우 |
| ERROR | SECURITY DEFINER 뷰 | 보안 컨텍스트를 상승시키는 뷰 |
| WARN | 과도한 권한의 정책 | `USING (true)` 등 무제한 접근 정책 |
| WARN | 취약한 비밀번호 정책 | 최소 비밀번호 길이 미설정 |
| INFO | anon 역할 과다 권한 | anon 역할에 불필요한 테이블 접근 허용 |

**각 진단 항목에 대한 정보:**
- 문제 설명 및 발생 원인
- 보안 위험성 설명
- 수정 방법 코드 예시
- AI 어시스턴트 연동: "Fix with AI" 버튼으로 자동 수정 제안

---

### 2.12 Schema Visualizer

```
Dashboard → Database → Schema
```

또는

```
Dashboard → Table Editor → [테이블 선택] → Schema
```

#### 기능

**ERD (Entity Relationship Diagram):**
- 테이블 간 관계를 시각적으로 표시
- Foreign Key 관계를 화살표로 연결
- 테이블 박스 안에 컬럼 목록 표시 (이름, 타입, PK/FK 아이콘)
- 스키마별 필터링 (public, auth, storage 등)

**인터랙티브 조작:**
- 테이블 드래그 앤 드롭으로 레이아웃 조정
- 확대/축소(Zoom)
- 특정 테이블 중심으로 이웃 테이블만 표시
- 테이블 클릭 시 Table Editor로 바로 이동

**Visual Schema Designer (Studio 3.0+):**
- SQL 없이 드래그 앤 드롭으로 테이블과 관계 생성
- 컬럼 추가/삭제를 GUI에서 직접 처리
- 변경사항 미리보기 후 적용 (SQL DDL 자동 생성)

---

## 3. 조직 및 프로젝트 관리

### 3.1 조직(Organization) 구조

Supabase는 조직을 기반으로 프로젝트를 그룹화한다.

```
[조직(Organization)]
├── [프로젝트 A] (개발 환경)
├── [프로젝트 B] (스테이징 환경)
└── [프로젝트 C] (프로덕션 환경)
```

**조직 설정:**
```
Dashboard → [조직 이름] → Settings
```

- 조직 이름 변경
- 조직 삭제
- 결제 정보(Billing) 관리
- 팀 멤버 관리
- SSO 설정 (Team 플랜 이상)

### 3.2 팀 멤버 역할(RBAC)

```
Dashboard → [조직] → Settings → Members
```

Supabase는 4가지 역할을 제공한다:

| 역할 | 조직 설정 | 프로젝트 접근 | 데이터 접근 | 결제 관리 |
|------|-----------|--------------|------------|-----------|
| **Owner** | 모든 권한 | 모든 권한 | 모든 권한 | 가능 |
| **Administrator** | 제한 (조직 설정/프로젝트 이전 불가) | 모든 권한 | 모든 권한 | 불가 |
| **Developer** | 읽기 전용 | 콘텐츠 접근 | 읽기/쓰기 | 불가 |
| **Read Only** | 읽기 전용 | 읽기 전용 | 읽기 전용 | 불가 |

**멤버 초대:**
1. 이메일로 초대 링크 발송
2. 역할 선택 (Owner/Admin/Developer/Read Only)
3. 특정 프로젝트만 접근 제한 설정 (Team 플랜)

### 3.3 프로젝트 설정

```
Dashboard → Project Settings
```

**General:**
- 프로젝트 이름 변경
- 프로젝트 참조 ID (변경 불가)
- 프로젝트 일시정지/재개 (Free 플랜: 7일 미사용 시 자동 일시정지)
- 프로젝트 삭제

**API:**
- Project URL (변경 불가)
- API Key (anon public, service_role) 조회 및 재생성
- JWT Secret 관리

**Database:**
- 데이터베이스 비밀번호 재설정
- Connection String (Direct, Pooler - Session/Transaction 모드)
- Connection Pooling 설정 (PgBouncer)
- SSL 인증서 다운로드
- IPv4/IPv6 설정

**Auth:**
- JWT 만료 시간 설정
- Refresh Token 재사용 감지
- Rate Limiting 설정 (로그인 시도 횟수 제한)
- Password 최소 길이/강도 설정

**Edge Functions:**
- 전역 환경 변수 (Secrets) 관리

**Infrastructure:**
- 프로젝트 지역 (변경 불가)
- 컴퓨팅 리소스 업그레이드 (Pro+)
- Read Replicas 설정 (Pro+)
- PITR (Point-in-Time Recovery) 설정 (Pro+)
- 데이터베이스 업그레이드 (Postgres 버전)

### 3.4 환경 분리 전략

프로덕션과 개발 환경을 분리하는 권장 방법:

**방법 1: Supabase Branching (Pro 이상)**
```
[main 브랜치] ← 프로덕션
    |
    └── [feature/* 브랜치] ← 개발/테스트
```

Git 브랜치에 연동되어 PR 생성 시 자동으로 새 Supabase 프로젝트 스핀업.

**방법 2: 별도 프로젝트**
- 개발/스테이징/프로덕션 프로젝트를 각각 생성
- Supabase CLI로 마이그레이션 관리
- 환경변수로 연결 전환

---

## 4. 제한사항: UI vs CLI/API

### 4.1 UI에서만 가능한 작업

| 작업 | 위치 |
|------|------|
| 청구(Billing) 관리, 구독 플랜 변경 | Dashboard → Settings → Billing |
| 팀 멤버 초대 및 역할 변경 | Dashboard → Settings → Members |
| 프로젝트 일시정지/재개 | Dashboard → Settings → General |
| 소셜 로그인 제공자 OAuth 설정 UI | Dashboard → Auth → Providers |
| Storage 버킷 Public/Private 토글 | Dashboard → Storage |
| Edge Functions 대시보드 배포 (템플릿 기반) | Dashboard → Edge Functions |
| Read Replicas 추가 (GUI) | Dashboard → Settings → Infrastructure |
| Schema Visualizer 레이아웃 저장 | Dashboard → Database → Schema |

### 4.2 CLI/API가 필요한 작업

| 작업 | 도구 | 이유 |
|------|------|------|
| 마이그레이션 파일 버전 관리 | Supabase CLI | Git 연동 필요 |
| Edge Functions 로컬 개발/테스트 | Supabase CLI | `supabase functions serve` |
| 타입 자동 생성 | Supabase CLI | `supabase gen types typescript` |
| CI/CD 파이프라인 배포 | Supabase CLI / Management API | 자동화 |
| 데이터베이스 덤프/복원 | pg_dump / CLI | 대용량 데이터 |
| 프로젝트 프로그래밍 방식 생성 | Management API | 자동화 |
| 실시간 로그 스트리밍 | `supabase logs` CLI | 터미널 스트리밍 |
| 복잡한 스키마 변경 (트랜잭션 필요) | SQL Editor / CLI | DDL 트랜잭션 |

### 4.3 Dashboard 수정 vs CLI 마이그레이션 충돌 주의

Dashboard의 Table Editor나 SQL Editor로 스키마를 직접 수정하면, CLI 마이그레이션 히스토리와 충돌이 발생할 수 있다.

**권장 워크플로우:**
```bash
# 개발 환경에서 마이그레이션 파일 생성
supabase migration new add_user_profiles

# 마이그레이션 내용 작성
# supabase/migrations/20240101000000_add_user_profiles.sql

# 로컬 DB에 적용
supabase db reset

# 프로덕션에 배포
supabase db push
```

---

## 5. Self-hosted Studio

### 5.1 개요

Supabase는 완전 오픈소스이며, Docker Compose를 사용하여 로컬 또는 자체 서버에서 Studio를 실행할 수 있다.

**Self-hosted vs Cloud 차이:**

| 항목 | Cloud | Self-hosted |
|------|-------|-------------|
| Studio 기능 | 전체 | 대부분 (일부 클라우드 전용 기능 없음) |
| 빌링 관리 | 있음 | 없음 |
| 팀 멤버 관리 | 있음 | 단일 사용자 (기본) |
| Supabase 지원 | 있음 | 없음 |
| 업데이트 | 자동 | 수동 |
| 인프라 관리 | Supabase 담당 | 직접 관리 |

### 5.2 로컬 개발 환경 설정

Supabase CLI를 사용한 로컬 Studio 실행:

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트 초기화
supabase init

# 로컬 Supabase 스택 시작 (Docker 필요)
supabase start
```

실행 후 터미널 출력:
```
Started supabase local development setup.

         API URL: http://localhost:54321
     GraphQL URL: http://localhost:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323   ← Studio 접속 주소
    Inbucket URL: http://localhost:54324   ← 이메일 테스트
        JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
          anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**로컬 Studio 특이사항:**
- 단일 프로젝트만 관리 가능
- 빌링/팀 관리 기능 없음
- 인증은 기본적으로 없음 (localhost 접근 시 자동 로그인)
- Inbucket이 내장되어 이메일 발송 테스트 가능 (실제 발송 없이 UI에서 확인)

### 5.3 Docker Compose로 Self-hosted 배포

```bash
# Supabase Docker 구성 파일 다운로드
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY 등 설정

# 시작
docker compose up -d
```

**주요 환경 변수:**

```env
# .env 파일 핵심 설정
POSTGRES_PASSWORD=your-super-secret-and-long-postgres-password
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
ANON_KEY=<generated-anon-key>
SERVICE_ROLE_KEY=<generated-service-role-key>

# Studio 설정
STUDIO_DEFAULT_ORGANIZATION=Default Organization
STUDIO_DEFAULT_PROJECT=Default Project
STUDIO_PORT=3000

# 도메인 설정
SITE_URL=https://your-domain.com
SUPABASE_PUBLIC_URL=https://your-domain.com
```

### 5.4 Self-hosted Studio 접근 보안

기본 Self-hosted 설치는 인증이 없으므로, 프로덕션 배포 시 반드시 보안을 추가해야 한다.

**Nginx 기본 인증 추가 예시:**

```nginx
# /etc/nginx/sites-available/supabase-studio
server {
    listen 443 ssl;
    server_name studio.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    auth_basic "Supabase Studio";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5.5 Self-hosted에서 제한되는 기능

| 기능 | Self-hosted 제한 |
|------|-----------------|
| Supabase Branching | 클라우드 전용 |
| 프로젝트 일시정지 | 해당 없음 |
| 컴퓨팅 업그레이드 UI | 해당 없음 |
| Read Replicas UI | 직접 Postgres 설정 필요 |
| PITR (Point-in-Time Recovery) | 직접 설정 필요 |
| Edge Functions 클라우드 배포 | CLI 필요 |
| Log Explorer (Logflare) | 별도 설정 필요 |
| 멀티 프로젝트 관리 | 단일 프로젝트만 |

### 5.6 Self-hosted 업데이트

```bash
cd supabase/docker

# 최신 이미지 Pull
docker compose pull

# 재시작
docker compose up -d
```

Supabase 컴포넌트별 버전을 명시적으로 관리하는 것을 권장한다 (`.env`에서 이미지 태그 지정).

---

## 참고 자료

- [Supabase Studio 3.0 발표 블로그](https://supabase.com/blog/supabase-studio-3-0)
- [Supabase Dashboard 업데이트 블로그](https://supabase.com/blog/tabs-dashboard-updates)
- [Security & Performance Advisor](https://supabase.com/blog/security-performance-advisor)
- [Supabase Logs 공식 문서](https://supabase.com/docs/guides/telemetry/logs)
- [Supabase Reports 공식 문서](https://supabase.com/docs/guides/telemetry/reports)
- [Self-Hosting 공식 문서](https://supabase.com/docs/guides/self-hosting)
- [Local Development 공식 문서](https://supabase.com/docs/guides/local-development)
- [Access Control 공식 문서](https://supabase.com/docs/guides/platform/access-control)
- [API 자동 생성 문서](https://supabase.com/docs/guides/api/rest/auto-generated-docs)
- [Visual Schema Designer](https://supabase.com/features/visual-schema-designer)
- [Security & Performance Advisor Features](https://supabase.com/features/security-and-performance-advisor)
- [SQL Editor Features](https://supabase.com/features/sql-editor)
- [Logs & Analytics Features](https://supabase.com/features/logs-analytics)
- [splinter (Supabase Postgres Linter)](https://github.com/supabase/splinter)
