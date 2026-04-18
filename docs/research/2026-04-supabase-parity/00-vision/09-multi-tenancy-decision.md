# ADR-001: Multi-tenancy 의도적 제외

> Wave 3 — M3 산출물 1/2  
> 작성: 2026-04-18 (세션 26)  
> 근거: [README.md](../README.md) · [_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md)  
> 상위: [00-vision/](.)

---

## 1. ADR 메타

| 항목 | 값 |
|------|-----|
| **ADR 번호** | ADR-001 |
| **제목** | Multi-tenancy 의도적 제외 |
| **상태** | 확정 |
| **결정 날짜** | 2026-04-06 (프로젝트 시작 시) |
| **최종 검토** | 2026-04-18 (Wave 3 공식 문서화) |
| **결정자** | 프로젝트 오너 (1인 운영) |
| **영향 범위** | 전체 아키텍처 — DB 스키마, Auth 계층, 라우팅, API 응답 구조 |
| **연관 ADR** | ADR-002 (예정: 단일 PostgreSQL 인스턴스 운영 정책) |
| **재검토 트리거** | 이 문서 §6 참조 |

---

## 2. 맥락 (Context)

### 2.1 프로젝트 현황

양평 부엌 서버 대시보드는 **1인 운영 + 단일 팀 사용**을 전제로 설계된 자체호스팅 Supabase 호환 관리 대시보드이다. 배포 환경은 WSL2 Ubuntu + PM2 + Cloudflare Tunnel이며, 단일 물리 서버(또는 VPS)에서 전체 스택을 실행한다.

현재 확정된 기술 스택:
- **Next.js 16** (단일 앱 인스턴스)
- **PostgreSQL + Prisma 7** (단일 DB 인스턴스)
- **SQLite + Drizzle** (메타데이터/세션 보조 DB)
- **PM2** (프로세스 관리)
- **Cloudflare Tunnel** (도메인 노출: stylelucky4u.com)

이 스택 어디에도 "테넌트 분리"를 위한 별도 인프라 계층이 없다.

### 2.2 Supabase Cloud의 Multi-tenancy 구조

Supabase Cloud는 다음 계층의 Multi-tenancy를 지원한다:

| 계층 | Supabase Cloud | 양평 대시보드 |
|------|---------------|-------------|
| Organizations | 복수 조직, 멤버십 관리 | 단일 조직 |
| Projects | 조직당 N개 프로젝트 | 단일 프로젝트 |
| Databases | 프로젝트당 1 DB (격리) | 단일 DB |
| Users | 프로젝트별 auth.users | 단일 users 테이블 |
| Storage Buckets | 프로젝트 격리 | 단일 버킷 네임스페이스 |
| Edge Functions | 프로젝트별 격리 실행 | 단일 런타임 |

Supabase Cloud의 Multi-tenancy는 **서비스형(SaaS) 플랫폼**으로서의 필수 요건이지, self-hosted 사용 시에는 명시적으로 선택 사항이다. 공식 Self-Hosted 문서에서도 단일 인스턴스 배포를 기본 권장 설정으로 제시한다.

### 2.3 "자체호스팅 + 1인 운영"과 Multi-tenancy의 불일치

1인 운영자가 Multi-tenancy를 도입하면 다음 부담이 발생한다:

- **스키마 복잡도**: 모든 테이블에 `tenant_id` 또는 별도 스키마(schema per tenant) 필요
- **RLS 정책 증폭**: 기존 user-level 정책 × N 테넌트 = 지수적 증가
- **마이그레이션 위험**: tenant-level 분리 하에서의 스키마 변경은 테넌트별 롤아웃 필요
- **운영 부담**: 테넌트별 모니터링, 백업, 복구 계획 필요
- **디버깅 복잡도**: 버그 재현 시 "어느 테넌트에서 발생했는가?" 추적 필요
- **비용**: 테넌트 격리를 위한 추가 인프라 (DB, 스토리지, 네트워킹)

이 모든 부담을 **1인 운영자가** 부담하면서 얻는 이점은 현재 "단일 조직, 단일 팀, 단일 운영자" 컨텍스트에서 사실상 **0**이다.

### 2.4 "Multi-tenancy 불필요"를 뒷받침하는 현황 데이터

| 지표 | 현재 값 | Multi-tenancy 필요 임계값 |
|------|--------|--------------------------|
| 실제 조직 수 | 1개 | 2개 이상 |
| 동시 사용 팀 수 | 1개 | 2개 이상 |
| 월간 활성 사용자 | 1명 | 2명 이상 6개월 지속 시 재검토 |
| B2B SaaS 전환 계획 | 없음 | 명시적 전환 결정 시 재검토 |
| 데이터 격리 법적 요건 | 없음 | GDPR 테넌트 격리 요건 발생 시 재검토 |

---

## 3. 결정 (Decision)

### 3.1 핵심 결정

**양평 부엌 서버 대시보드는 Multi-tenancy를 지원하지 않는다.**

이 결정은 "현재 지원 불가"가 아니라 **의도적이고 명시적인 설계 결정**이다. 추후 요건 변화 없이는 재검토하지 않는다.

### 3.2 구체적 결정 항목

#### 3.2.1 단일 Next.js 앱 배포

```
# 확정 배포 구조
stylelucky4u.com → Cloudflare Tunnel → localhost:3000 (단일 Next.js 인스턴스)

# 제외된 구조
tenant-a.stylelucky4u.com → 인스턴스 A
tenant-b.stylelucky4u.com → 인스턴스 B
```

단일 Next.js 앱이 모든 기능을 담당한다. 서브도메인 기반 테넌트 라우팅 미구현.

#### 3.2.2 단일 PostgreSQL 데이터베이스

```sql
-- 확정: 단일 DB, 단일 네임스페이스
-- 모든 테이블은 public 스키마 (또는 기능별 서브 스키마)

-- 제외: tenant_id 컬럼
-- Bad (Multi-tenancy 방식):
CREATE TABLE users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  ...
);

-- Good (양평 방식):
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  ...
);
```

모든 Prisma 모델에서 `tenantId` 필드 미포함. 마이그레이션에 `tenant_id` 관련 DDL 불포함.

#### 3.2.3 단일 도메인

- **운영 도메인**: `stylelucky4u.com` (단일)
- **카나리 도메인**: `canary.stylelucky4u.com` (배포 테스트용, 테넌트 분리 목적 아님)
- **테넌트 서브도메인**: 미구현 (예: `tenant-a.stylelucky4u.com` 없음)

#### 3.2.4 단일 관리자 워크스페이스

Supabase Cloud의 "Organization → Projects" 계층 대신, 양평 대시보드는 **단일 워크스페이스(Workspace)** 개념을 사용한다:

```
Supabase Cloud:             양평 대시보드:
Organization                없음 (단일 워크스페이스)
  └── Project A             없음 (단일 프로젝트)
        └── DB              단일 PostgreSQL
        └── Auth            단일 Auth 시스템
        └── Storage         단일 Storage 네임스페이스
```

UI에서 "프로젝트 선택" 드롭다운 미구현. 모든 기능은 단일 컨텍스트에서 직접 접근.

#### 3.2.5 RLS는 user-level 분리만

Row Level Security는 **사용자(user) 수준** 데이터 분리에만 사용한다:

```sql
-- 확정: user-level RLS
CREATE POLICY "users_own_data" ON profiles
  FOR ALL
  USING (auth.uid() = user_id);

-- 제외: tenant-level RLS
-- Bad:
CREATE POLICY "tenant_isolation" ON data_table
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );
```

RLS 정책은 "내 데이터만 접근"이지, "내 테넌트 데이터만 접근"이 아니다.

### 3.3 API 호환성 처리

Supabase의 일부 API 응답에는 `project_id`, `org_id` 등 Multi-tenancy 관련 필드가 포함된다. 양평 대시보드에서 이 필드들은 다음과 같이 처리한다:

| Supabase 필드 | 양평 처리 방식 |
|--------------|-------------|
| `project_id` | 고정값 `"default"` 반환 |
| `org_id` | 고정값 `"yangpyeong"` 반환 |
| `X-Client-Info` 헤더 | 수신만, tenant 라우팅에 미사용 |
| `anon_key` / `service_role_key` | 단일 키셋, 테넌트별 키 없음 |

이 처리 방식으로 Supabase 클라이언트 라이브러리(`@supabase/supabase-js`)와의 기본 호환성을 유지한다.

---

## 4. 결과 (Consequences)

### 4.1 이점

#### 4.1.1 아키텍처 단순화

Multi-tenancy 제외로 인한 아키텍처 단순화 효과:

| 복잡도 요소 | Multi-tenancy 있을 때 | 양평 (Multi-tenancy 없음) |
|-----------|---------------------|--------------------------|
| 테이블 컬럼 수 | 모든 테이블 +1 (`tenant_id`) | 없음 |
| RLS 정책 수 | 기존 N개 × 테넌트 계층 | 기존 N개만 |
| Prisma 모델 복잡도 | 모든 모델에 `tenantId` + 관계 | 없음 |
| 인증 미들웨어 | JWT 파싱 + 테넌트 컨텍스트 주입 | JWT 파싱만 |
| 마이그레이션 전략 | 테넌트별 롤아웃 필요 | 단순 순차 마이그레이션 |

#### 4.1.2 PostgreSQL 스키마 복잡도 감소

테넌트 격리를 위한 `schema per tenant` 방식을 채택하지 않으므로:
- Prisma 스키마 파일이 단일 (`schema.prisma`)
- `prisma migrate` 명령이 단순 (멀티 스키마 타깃 없음)
- `pg_stat_activity` 모니터링 쿼리가 테넌트 필터 불필요

#### 4.1.3 구현 공수 30-40% 절감

Wave 4-5 청사진 기준 공수 추정:

| 카테고리 | Multi-tenancy 있을 때 추가 공수 | 절감 |
|---------|-------------------------------|------|
| Auth Core | +10h (테넌트 컨텍스트 주입) | ✅ |
| Auth Advanced | +8h (테넌트별 TOTP 시드 분리) | ✅ |
| Storage | +12h (버킷별 테넌트 격리) | ✅ |
| Edge Functions | +15h (테넌트별 실행 환경 분리) | ✅ |
| Realtime | +10h (테넌트별 채널 격리) | ✅ |
| DB Ops | +15h (테넌트별 백업/복구) | ✅ |
| **합계 추정** | **+70h** | **~30-40% 절감** |

Wave 1 추정 총 공수(270h + SQL 320h = 590h) 기준으로 약 12% 전체 절감.

#### 4.1.4 1인 운영 부담 대폭 감소

운영 관점에서의 이점:

```
모니터링: 1개 DB 인스턴스만 추적
백업: 1개 DB 백업 정책으로 충분 (wal-g 단일 설정)
장애 대응: "어느 테넌트?" 추적 불필요
보안 감사: 단일 RLS 정책 세트 감사
업그레이드: 테넌트별 롤아웃 없이 단순 배포
```

#### 4.1.5 버그 위험 제거

Multi-tenancy에서 가장 치명적인 버그 유형인 **테넌트 데이터 크로스 리크**가 구조적으로 불가능해진다:

```
테넌트 격리 버그: 테넌트 A가 테넌트 B의 데이터를 볼 수 있음
발생 조건: tenant_id RLS 정책 누락 또는 잘못된 JOIN
양평 대응: tenant_id 자체가 없으므로 이 클래스의 버그 존재 불가
```

### 4.2 비용 (트레이드오프)

#### 4.2.1 Supabase Cloud 호환성 일부 상실

Supabase의 Multi-tenancy 관련 API 엔드포인트는 지원하지 않는다:

| Supabase 엔드포인트 | 양평 지원 여부 |
|--------------------|--------------|
| `GET /v1/organizations` | 고정 응답 (단일 조직) |
| `GET /v1/projects` | 고정 응답 (단일 프로젝트) |
| `POST /v1/projects` | 미구현 |
| `DELETE /v1/projects/{ref}` | 미구현 |
| `GET /v1/organizations/{slug}/members` | 단순화된 단일 멤버 목록 |

이 제한으로 인해 Supabase 공식 CLI(`supabase link`, `supabase projects list`)의 일부 기능이 동작하지 않을 수 있다.

#### 4.2.2 향후 "사용자에게 서비스 제공"으로 전환 시 재설계 필요

현재 단일 테넌트 구조에서 Multi-tenancy로 전환 시 예상 작업:

```
1. 스키마 마이그레이션
   - 모든 테이블에 tenant_id 컬럼 추가
   - 기존 데이터에 기본 tenant_id 할당
   - RLS 정책 전면 재작성
   예상: 30-50h

2. Auth 미들웨어 재설계
   - JWT 클레임에 tenant_id 추가
   - 모든 API 라우트에 테넌트 컨텍스트 주입
   예상: 20h

3. UI 재설계
   - Organization/Project 개념 도입
   - 워크스페이스 전환 UI
   예상: 15h

4. 테스트 재작성
   - 멀티 테넌트 격리 테스트
   예상: 15h

총 전환 비용: ~80-100h
```

이 전환 비용은 **재검토 트리거 발동 시 명시적으로 수용**해야 한다.

#### 4.2.3 팀 A/B 분리 불가

현재 아키텍처에서는 동일 서버에서 두 독립 조직을 운영하는 것이 불가능하다:

```
불가 시나리오:
- "팀 A의 DB"와 "팀 B의 DB"를 동일 양평 대시보드로 관리
- 팀 A와 팀 B가 각자의 Edge Functions를 독립적으로 배포
- 팀 A와 팀 B의 Storage 버킷을 완전 격리

대안 (필요 시):
- 별도 서버에 양평 대시보드 인스턴스를 각각 배포
- (두 인스턴스가 완전히 독립적으로 운영)
```

---

## 5. 대안 검토 (Alternatives Considered)

### Alt 1: Row-level tenant_id (행 수준 분리)

**설명**: 모든 테이블에 `tenant_id UUID NOT NULL` 컬럼 추가 + PostgreSQL RLS 정책으로 테넌트 격리.

```sql
-- Alt 1 구조 예시
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL,
  ...
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON profiles
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id')::UUID
  );

-- Next.js 미들웨어에서:
await supabase.rpc('set_config', {
  setting: 'app.current_tenant_id',
  value: tenantId
});
```

**점수 평가**:

| 기준 | 점수 | 이유 |
|------|------|------|
| 구현 복잡도 | 2/5 | 모든 테이블 + 모든 쿼리 수정 필요 |
| 운영 안전성 | 1/5 | RLS 정책 누락 시 데이터 유출 |
| 1인 운영 적합성 | 1/5 | 지속적 RLS 감사 필요 |
| 성능 | 3/5 | `current_setting()` 오버헤드 |
| 전환 용이성 | 3/5 | 나중에 제거보다 추가가 어려움 |

**거부 이유**:
1. **복잡도**: 현재 14 카테고리 구현에서 모든 Prisma 모델 + 모든 쿼리를 테넌트 인식으로 수정 필요 → Wave 4-5 공수 30-40% 증가
2. **실수 시 데이터 유출 위험**: RLS 정책 하나 누락 = 테넌트 A가 테넌트 B 데이터 접근 가능. 이 버그는 테스트에서 발견 어려움 (같은 테스트 DB이므로)
3. **1인 운영 부적합**: 테넌트별 RLS 정책 감사를 정기적으로 수행할 운영 인력 없음
4. **현재 이득 없음**: 현재 테넌트가 1개이므로 도입 이유 없음

### Alt 2: 스키마별 분리 (Schema per Tenant)

**설명**: PostgreSQL에서 테넌트마다 별도 스키마 생성 (`tenant_a.users`, `tenant_b.users` 등). `search_path` 설정으로 테넌트 격리.

```sql
-- Alt 2 구조 예시
CREATE SCHEMA tenant_a;
CREATE SCHEMA tenant_b;

-- 각 스키마에 동일한 테이블 구조 복제
CREATE TABLE tenant_a.users (LIKE public.users INCLUDING ALL);
CREATE TABLE tenant_b.users (LIKE public.users INCLUDING ALL);

-- 연결 시 search_path 설정
SET search_path TO tenant_a, public;
```

**점수 평가**:

| 기준 | 점수 | 이유 |
|------|------|------|
| 격리 강도 | 5/5 | 스키마 수준 완전 격리 |
| 구현 복잡도 | 1/5 | 동적 스키마 생성 + Prisma 비호환 |
| Prisma 7 호환성 | 1/5 | Prisma는 단일 스키마 전제 |
| 마이그레이션 복잡도 | 1/5 | 테넌트 수 × Prisma migrate |
| 1인 운영 적합성 | 1/5 | 스키마별 독립 관리 필요 |

**거부 이유**:
1. **Prisma 7 비호환**: Prisma의 `prisma migrate` 명령은 단일 스키마(`public`)를 전제. 멀티 스키마 마이그레이션은 공식 미지원 (Prisma prisma/prisma#1175 이슈, 수년째 미해결)
2. **마이그레이션 복잡도**: 테넌트 추가 시마다 스키마 생성 + 마이그레이션 적용 + Prisma 클라이언트 재생성 필요
3. **1인 운영 부적합**: N개 스키마를 독립적으로 관리 (백업, 복구, 모니터링)
4. **디버깅 어려움**: `search_path` 설정 오류 시 잘못된 스키마 접근 → 데이터 오염

### Alt 3: 데이터베이스별 분리 (DB per Tenant)

**설명**: 테넌트마다 별도 PostgreSQL 데이터베이스 인스턴스 생성. 연결 풀링은 PgBouncer로 관리.

```
Alt 3 구조:
tenant_a → PostgreSQL DB:5432 (db_tenant_a)
tenant_b → PostgreSQL DB:5433 (db_tenant_b) 또는 별도 인스턴스

양평 대시보드 → PgBouncer → 테넌트별 DB 라우팅
```

**점수 평가**:

| 기준 | 점수 | 이유 |
|------|------|------|
| 격리 강도 | 5/5 | DB 수준 완전 격리 |
| 구현 복잡도 | 1/5 | 동적 DB 생성, 연결 관리 |
| 인프라 비용 | 1/5 | 테넌트당 메모리/CPU 증가 |
| 운영 복잡도 | 1/5 | 테넌트별 백업, 복구, 모니터링 |
| 단일 서버 가능 | 2/5 | 이론적 가능, 실제는 과부하 |

**거부 이유**:
1. **인프라 비용 폭증**: PostgreSQL 인스턴스는 idle 상태에도 메모리 100-500MB 소비. 테넌트 5개 = 추가 500MB-2.5GB
2. **1인 운영 WSL2 환경 부적합**: WSL2 + PM2 환경에서 다중 PostgreSQL 인스턴스 관리 = 복잡한 포트 관리 + 프로세스 관리
3. **PgBouncer 추가 의존성**: 연결 라우팅을 위한 추가 프록시 레이어 = 추가 장애 지점
4. **현재 이득 없음**: 현재 테넌트가 1개이므로 모든 비용은 낭비

### Alt 4: 경량 "워크스페이스" 개념 도입

**설명**: Multi-tenancy는 아니지만 "워크스페이스"라는 논리적 그룹화 개념을 도입. 같은 DB에 여러 "워크스페이스"가 존재하고 UI에서 전환 가능.

```typescript
// Alt 4 구조 예시
interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  // tenant_id 없음 — 단순 라벨링
}
```

**점수 평가**:

| 기준 | 점수 | 이유 |
|------|------|------|
| 구현 복잡도 | 3/5 | 중간 (UI 변경 필요) |
| 실질적 격리 | 1/5 | 거의 없음 (같은 DB) |
| 현재 필요성 | 1/5 | 1인 운영에 불필요 |
| 향후 확장성 | 2/5 | 실제 격리로 전환 시 재설계 필요 |

**거부 이유**:
1. **실질적 격리 없음**: 데이터는 여전히 같은 테이블에 혼재 → 버그 시 "가짜 격리" 위험
2. **현재 이득 없음**: 1인 운영자에게 워크스페이스 전환 UI는 불필요
3. **향후 혼란**: "워크스페이스"가 진짜 테넌트처럼 보이지만 격리가 없음 → 미래 개발자 혼란

---

## 6. 재검토 트리거 (Revisit Triggers)

이 ADR은 다음 트리거 중 **하나라도 충족**되면 재검토한다.

### 트리거 1: 지속적 다중 사용자 (정량 기준)

```
조건: 프로젝트 사용자 수 > 2명이 6개월 이상 지속
측정: docs/status/current.md의 월별 사용자 기록
재검토 시기: 조건 충족 후 다음 세션
```

단일 사용자 추가가 아닌, **2명 이상이 6개월 이상 지속**하는 경우에만 트리거 발동. 단기 게스트 사용자는 트리거 조건에 해당하지 않는다.

### 트리거 2: B2B SaaS 전환 의사결정

```
조건: 프로젝트 오너가 명시적으로 "외부 고객에게 SaaS로 제공" 결정
측정: 비즈니스 의사결정, 코드로 측정 불가
재검토 시기: 결정 직후 (Wave X 재시작)
```

"고객 A에게 대시보드 접근 권한 부여"가 아니라, "양평 부엌 서버 대시보드를 SaaS 상품으로 판매" 수준의 전환에만 트리거 발동.

### 트리거 3: 팀 멤버 관리 기능 요건 추가

```
조건: FR(Functional Requirements)에 "별도 팀/조직 관리" 기능이 추가되는 경우
현재 상태: 03-non-functional-requirements.md에서 "단일 팀 멤버 관리"만 기술
트리거 조건: "팀 A와 팀 B를 독립적으로 관리" 요건 추가 시
```

현재 `03-non-functional-requirements.md`에서 정의된 "단일 팀 멤버 관리(E2-S3)"는 트리거 조건이 아니다. "독립적인 복수 팀 관리"가 신규 FR로 추가될 때에만 발동.

### 트리거 4: 데이터 격리 법적 요건 발생

```
조건: GDPR, PIPA(개인정보보호법) 등에서 고객 데이터를 격리해야 하는 법적 의무 발생
측정: 법률 검토 결과
재검토 시기: 법적 의무 확인 즉시
```

현재 양평 대시보드는 1인 운영자의 자체 서버 관리 도구이므로 이 트리거 발동 가능성은 낮다. 단, B2B SaaS 전환과 함께 발생할 수 있다.

### 재검토 시 예상 작업량

트리거 발동 시 수행해야 할 작업의 사전 추정:

| 작업 항목 | 예상 공수 |
|----------|----------|
| 스키마 마이그레이션 (tenant_id 추가 + RLS 재작성) | 30-50h |
| Auth 미들웨어 재설계 (테넌트 컨텍스트 주입) | 20h |
| API 라우트 전면 수정 | 20h |
| UI 재설계 (Organization/Project 개념 도입) | 15h |
| 테스트 재작성 (멀티 테넌트 격리 테스트) | 15h |
| **총 예상 전환 비용** | **100-120h** |

이 비용은 "Multi-tenancy 도입이 필요한가?"를 결정할 때 명시적으로 고려해야 한다.

---

## 7. Supabase 대비 갭 및 대응

### 7.1 Supabase의 Multi-tenancy 관련 기능

Supabase Cloud에서 Multi-tenancy를 구현하는 핵심 요소:

| 기능 | Supabase Cloud | 양평 대시보드 |
|------|---------------|-------------|
| Organizations | 복수 조직 생성/관리 | 단일 워크스페이스 (고정값) |
| Projects per Org | 조직당 N개 프로젝트 | 단일 프로젝트 (고정값) |
| API Keys per Project | 프로젝트별 `anon_key`/`service_role_key` | 단일 키셋 |
| DB per Project | 프로젝트별 독립 PostgreSQL | 단일 PostgreSQL |
| Auth per Project | 프로젝트별 `auth.users` | 단일 `users` 테이블 |
| Storage per Project | 프로젝트별 버킷 격리 | 단일 버킷 네임스페이스 |
| Edge Functions per Project | 프로젝트별 격리 실행 | 단일 런타임 |

### 7.2 API 응답 구조 호환성

Supabase 클라이언트 라이브러리가 기대하는 응답 구조를 처리하는 방식:

```typescript
// Supabase Management API 응답 호환 처리

// GET /v1/organizations
// 양평 응답:
{
  "data": [{
    "id": "yangpyeong",
    "name": "양평 부엌 서버",
    "plan": "free"
  }]
}

// GET /v1/projects
// 양평 응답:
{
  "data": [{
    "id": "default",
    "ref": "yangpyeong-default",
    "name": "양평 부엌 대시보드",
    "organization_id": "yangpyeong",
    "region": "ap-northeast-2",
    "status": "ACTIVE_HEALTHY"
  }]
}
```

### 7.3 헤더 처리

```typescript
// X-Client-Info 헤더 처리
// Supabase 클라이언트가 전송하는 헤더:
// X-Client-Info: supabase-js/2.x.x

// 양평 미들웨어:
// - 헤더 수신은 하되, tenant 라우팅에 미사용
// - 로깅에는 기록 (디버깅 목적)

export function middleware(request: NextRequest) {
  const clientInfo = request.headers.get('X-Client-Info');
  // tenant 분기 없음 — 단순 로깅만
  if (clientInfo) {
    logger.debug('client_info', { clientInfo });
  }
  return NextResponse.next();
}
```

### 7.4 "단일 워크스페이스" UI 패턴

Supabase Cloud의 "Organization → Projects" 네비게이션을 양평 대시보드에서 대체하는 방식:

```
Supabase Cloud 네비게이션:
[Organization 드롭다운] → [Project 드롭다운] → [기능 탭]

양평 대시보드 네비게이션:
[Logo: 양평 부엌 서버] → [기능 탭]
(Organization/Project 드롭다운 없음)
```

모든 기능은 홈(`/`)에서 직접 클릭으로 접근 가능. "프로젝트 선택" 단계 없음.

### 7.5 Self-hosted Supabase와의 비교

Supabase를 self-hosted로 배포할 경우에도 기술적으로는 단일 인스턴스가 기본:

| 항목 | Supabase Self-Hosted | 양평 대시보드 |
|------|---------------------|-------------|
| 기본 배포 단위 | 단일 Docker Compose 스택 | 단일 PM2 프로세스 |
| Multi-tenancy | 기술적으로 가능하지만 공식 미지원 | 명시적 제외 |
| 데이터 격리 | Docker 네트워크 격리 | N/A |
| 관리 인터페이스 | Studio (별도 앱) | 통합 대시보드 |

양평 대시보드는 Supabase Self-Hosted보다 더 단순한 아키텍처를 채택하고 있으며, 이는 1인 운영 + 단일 팀 컨텍스트에서 최적화된 선택이다.

---

## 8. 요약

| 항목 | 내용 |
|------|------|
| **결정** | Multi-tenancy 의도적 제외 |
| **근거** | 1인 운영 + 단일 팀 + 구현 공수 30-40% 절감 + 버그 위험 제거 |
| **비용** | Supabase Cloud 일부 호환성 상실 + 향후 전환 시 100-120h 비용 |
| **재검토 조건** | 사용자 2명+ 6개월 OR B2B SaaS 전환 OR 독립 팀 관리 FR 추가 OR 법적 격리 요건 |
| **API 호환** | Supabase 응답 구조는 고정값으로 대응 (`"default"`, `"yangpyeong"`) |
| **RLS 사용** | user-level 분리만 (tenant-level 없음) |

---

> 작성: Wave 3 M3 에이전트  
> 근거 문서: README.md (Wave 1~2 완료), _CHECKPOINT_KDYWAVE.md  
> 다음 관련 문서: [10-14-categories-priority.md](./10-14-categories-priority.md)
