# 서버리스 데이터베이스 비교: Supabase DB vs PlanetScale vs Neon

> 작성일: 2026-04-06  
> 목적: 양평 부엌 서버 대시보드 및 향후 프로젝트의 DB 선택 의사결정 가이드

---

## 목차

1. [서비스 개요 및 포지셔닝](#1-서비스-개요-및-포지셔닝)
2. [아키텍처 비교](#2-아키텍처-비교)
3. [기능 비교](#3-기능-비교)
4. [성능](#4-성능)
5. [가격](#5-가격)
6. [개발자 경험 (DX)](#6-개발자-경험-dx)
7. [운영](#7-운영)
8. [의사결정 가이드](#8-의사결정-가이드)
9. [7항목 스코어링](#9-7항목-스코어링)

---

## 1. 서비스 개요 및 포지셔닝

### 1.1 Supabase DB

Supabase는 Firebase의 오픈소스 대안으로 시작했으며, 현재는 PostgreSQL을 핵심으로 하는 풀스택 백엔드 플랫폼이다. DB, 인증, 스토리지, Edge Functions, Realtime을 하나의 패키지로 제공한다.

- **데이터베이스 엔진**: PostgreSQL (순수 관리형)
- **포지셔닝**: "Firebase 대체" + 풀스택 BaaS
- **운영 모델**: 각 프로젝트는 독립된 전용 PostgreSQL 인스턴스 위에서 실행됨
- **오픈소스**: 핵심 인프라 모두 오픈소스 (Apache 2.0 / MIT)
- **설립**: 2020년, 현재 Series C 펀딩 완료
- **고객 규모**: 1,000,000개 이상의 데이터베이스 운영

### 1.2 PlanetScale

PlanetScale은 원래 Vitess 기반의 MySQL 서버리스 데이터베이스로 유명했다. 2024년 초 무료 티어를 폐지하며 논란이 됐으나, 2025-2026년 사이 Postgres 지원을 추가하고 가격 구조를 재편했다. Vitess는 YouTube가 MySQL을 수평 확장하기 위해 개발한 오픈소스 클러스터링 솔루션이다.

- **데이터베이스 엔진**: Vitess/MySQL (기존) + PostgreSQL (신규 추가, 2025 후반)
- **포지셔닝**: "Git처럼 다루는 데이터베이스" — 브랜칭, 배포 요청(deploy request), 무중단 스키마 변경
- **운영 모델**: 전용 Metal 클러스터 (NVMe SSD 기반), 항상 온라인(always-on)
- **오픈소스**: Vitess 자체는 오픈소스, PlanetScale 플랫폼은 상용

### 1.3 Neon

Neon은 PostgreSQL을 완전히 서버리스로 재설계한 플랫폼이다. 컴퓨트(compute)와 스토리지를 분리(disaggregated architecture)하고, 유휴 상태에서 컴퓨트를 0으로 스케일하는(scale-to-zero) 독특한 구조를 갖는다. 2025년 5월 Databricks가 약 10억 달러에 인수했다.

- **데이터베이스 엔진**: PostgreSQL (완전한 서버리스 재설계)
- **포지셔닝**: "진정한 서버리스 Postgres" — 사용한 만큼만 과금, 브랜칭 특화
- **운영 모델**: 컴퓨트/스토리지 완전 분리, AWS S3 호환 레이어 위에 구축
- **오픈소스**: Apache 2.0 라이선스로 핵심 엔진 공개
- **특이 사항**: Databricks(데이터 레이크하우스 선두) 인수로 AI/ML 워크로드 지향 강화

---

## 2. 아키텍처 비교

### 2.1 스토리지 아키텍처

#### Supabase DB — 전통적 Managed Postgres

```
클라이언트
    │
    ▼
Supavisor (커넥션 풀러, PgBouncer 대체)
    │
    ▼
PostgreSQL 전용 인스턴스
  ├── 컴퓨트 (EC2/GCE 위에 올려진 실제 서버)
  └── 스토리지 (EBS/네트워크 디스크 — 컴퓨트와 결합)
```

- 컴퓨트와 스토리지가 **결합(coupled)**: 전통적인 PostgreSQL 운영 방식과 동일
- 각 프로젝트는 독립된 Postgres 인스턴스를 가짐 → 멀티테넌트 노이즈 없음
- 인스턴스는 항상 켜져 있음 → 콜드 스타트 없음, 하지만 항상 컴퓨트 비용 발생
- 무료 티어 프로젝트는 **7일 비활성 시 자동 일시 정지** (재개는 즉시 가능)

#### PlanetScale — Vitess 클러스터 + Metal

```
클라이언트
    │
    ▼
PlanetScale 프록시 레이어 (쿼리 라우팅, 연결 관리)
    │
    ▼
Vitess 클러스터
  ├── VTGate (쿼리 라우터)
  ├── VTTablet (MySQL 인스턴스 래퍼)
  └── Metal 노드 (NVMe SSD — 로컬 디스크)
```

- Metal 클러스터: EBS 같은 네트워크 스토리지가 아닌 **로컬 NVMe** → 극도로 낮은 레이턴시
- Vitess가 수평 샤딩(horizontal sharding)과 재샤딩(resharding)을 투명하게 처리
- 항상 온라인(always-on) → 콜드 스타트 없음
- 2025년 후반 **PostgreSQL 지원 추가** (별도 postgres_single 플랜)

#### Neon — 컴퓨트/스토리지 완전 분리 (Disaggregated)

```
클라이언트
    │
    ▼
Neon Proxy (자동 컴퓨트 웨이크업, SNI 기반 라우팅)
    │
    ├── 컴퓨트 레이어 (Neon Compute — PostgreSQL 커스텀 빌드)
    │     └── 유휴 5분 후 자동 스케일 투 제로
    │
    └── 스토리지 레이어 (Neon Pageserver)
          ├── AWS S3 호환 영구 스토리지
          └── Copy-on-Write (CoW) 레이어 → 브랜칭의 핵심
```

- 컴퓨트와 스토리지 완전 분리: 스토리지는 항상 가용, 컴퓨트만 스케일 조정
- **Copy-on-Write**: 브랜치 생성 시 데이터 복사 없음 → 수백 GB 데이터베이스도 즉시 브랜치 생성
- 스케일 투 제로: 트래픽 없으면 컴퓨트 비용 0원
- 콜드 스타트: 유휴 후 첫 연결 시 300~500ms 지연 발생

### 2.2 서버리스 정의 비교

| 항목 | Supabase | PlanetScale | Neon |
|------|----------|-------------|------|
| 스케일 투 제로 | 부분 (무료 7일 후 일시정지) | 없음 (always-on) | 있음 (5분 유휴 후) |
| 자동 스케일 업 | 컴퓨트 플랜 수동 업그레이드 | Metal 플랜 내 자동 | 자동 (설정한 max CU까지) |
| 콜드 스타트 | 없음 (유료) / 일시정지 재개 | 없음 | 300~500ms |
| 진정한 서버리스 | 반서버리스 | 아님 | 예 |

### 2.3 브랜칭(Branching) 아키텍처

**PlanetScale 브랜칭**: Git 브랜치와 동일한 개념으로 스키마 변경을 관리한다. 브랜치를 생성하면 소스 브랜치의 **스키마(schema)만** 복사되며, 데이터는 복사되지 않는다. 개발 브랜치에서 스키마를 변경 후 배포 요청(deploy request)을 열면, 자동으로 온라인 스키마 변경(online DDL)이 실행된다.

- 강점: **무중단 스키마 변경** — 기존 MySQL에서 45분 걸리던 작업이 30초 이내 완료
- 약점: 브랜치에 실제 운영 데이터가 없음 → 실데이터 기반 테스트 불가

**Neon 브랜칭**: Copy-on-Write 스토리지 레이어 덕분에 스키마뿐 아니라 **데이터 포함 전체 DB 스냅샷**을 즉시 복제한다. PR마다 독립된 전체 DB 환경을 제공할 수 있다.

- 강점: 실제 운영 데이터 포함 브랜치 → 더 현실적인 테스트 환경
- 강점: 수백 GB DB도 즉시 (수초 내) 브랜치 생성
- 약점: 브랜치 수가 많아지면 스토리지 비용 증가

**Supabase 브랜칭**: 2024년 도입된 비교적 신기능. Git 브랜치와 연동하여 Preview 환경을 자동 생성한다. Neon과 유사하게 전체 DB(스키마 + 데이터)를 복제하는 방식이나, 내부 구현은 기존 Postgres 복제(replication) 기반이라 Neon의 CoW만큼 즉각적이지는 않다.

---

## 3. 기능 비교

### 3.1 스키마 관리

| 기능 | Supabase | PlanetScale | Neon |
|------|----------|-------------|------|
| 마이그레이션 도구 | 내장 SQL 에디터, Supabase CLI | 자체 CLI + deploy request | Neon CLI, drizzle-orm, prisma |
| GUI 스키마 편집 | Table Editor (Studio) | 웹 콘솔 | Neon Console |
| 무중단 DDL | PostgreSQL 기본 지원 수준 | Vitess 기반 비블로킹 DDL | PostgreSQL 기본 지원 수준 |
| 스키마 버전 관리 | Supabase CLI 마이그레이션 | Deploy Request (Git-like) | 마이그레이션 히스토리 |
| Type-safe 스키마 생성 | supabase gen types | 없음 (MySQL은 TypeScript 미지원) | pg-typegen, Drizzle introspect |

### 3.2 브랜칭

| 기능 | Supabase | PlanetScale | Neon |
|------|----------|-------------|------|
| 데이터 포함 브랜칭 | 예 (2024 이후) | 아니요 (스키마만) | 예 (CoW 기반) |
| 브랜치 생성 속도 | 중간 (수십 초) | 빠름 (스키마만 복사) | 즉시 (CoW, 데이터 무관) |
| 브랜치 수 제한 | Pro: 10개 | 플랜별 상이 | 무제한 (스토리지 비용) |
| CI/CD 연동 | GitHub Actions 공식 지원 | GitHub Actions 지원 | GitHub Actions + Vercel 지원 |
| 브랜치 데이터 리셋 | 수동 | 불가 (스키마 전용) | Parent 브랜치 기준 자동 리셋 |

### 3.3 읽기 복제본 (Read Replicas)

| 기능 | Supabase | PlanetScale | Neon |
|------|----------|-------------|------|
| 지원 여부 | 예 (2024 GA) | 예 (Vitess 내장) | 예 (2025 지원) |
| 라우팅 방식 | 지오-라우팅 (2025년 4월 개편) | 자동 쿼리 라우팅 | 수동 또는 자동 |
| 가격 | 추가 컴퓨트 비용 | 플랜에 따라 포함 | 별도 컴퓨트 과금 |
| 전파 지연 | 수 밀리초 | 수 밀리초 | 수 밀리초 |
| 지리적 분산 | 리전 선택 가능 | 리전 선택 가능 | 리전 선택 가능 |

### 3.4 PostgreSQL 확장(Extensions)

Supabase와 Neon은 PostgreSQL이므로 거의 모든 확장을 지원한다. PlanetScale은 MySQL 기반이므로 PostgreSQL 확장을 사용할 수 없다 (2025년 후반 Postgres 플랜에서는 일부 지원).

| 확장 | Supabase | PlanetScale (MySQL) | PlanetScale (Postgres) | Neon |
|------|----------|---------------------|------------------------|------|
| pgvector (벡터 검색) | 예 (기본 제공) | 아니요 | 예 | 예 |
| PostGIS (지리 데이터) | 예 | 아니요 | 예 | 예 |
| pg_cron | 예 | 아니요 | 미확인 | 예 |
| pg_stat_statements | 예 | 아니요 | 예 | 예 |
| TimescaleDB | 예 | 아니요 | 예 | 예 (단, 일부 제한) |
| FDW (Foreign Data Wrapper) | 예 | 아니요 | 미확인 | 예 |
| uuid-ossp | 예 | 아니요 | 예 | 예 |
| 총 지원 확장 수 | 50+ | 해당 없음 | 제한적 | 50+ |

### 3.5 FDW (Foreign Data Wrapper)

Supabase는 Wrappers라는 자체 FDW 레이어를 제공하여 외부 데이터 소스(Stripe, Firebase, S3, BigQuery, Redis 등)를 PostgreSQL 테이블처럼 쿼리할 수 있다.

```sql
-- Supabase Wrappers 예시: Stripe 데이터를 SQL로 조회
SELECT * FROM stripe.customers WHERE email = 'user@example.com';
```

Neon도 postgres_fdw, file_fdw 등 표준 FDW를 지원하나, Supabase의 Wrappers만큼 다양한 SaaS 통합은 아직 미흡하다.

### 3.6 벡터 검색 (AI/ML)

AI 시대에 벡터 검색은 점점 더 중요해지고 있다.

**Supabase + pgvector**
- pgvector를 기본 확장으로 제공
- HNSW (Hierarchical Navigable Small World) 인덱스 지원 → 고성능 ANN 검색
- IVFFlat 인덱스도 지원
- LangChain, LlamaIndex와의 공식 통합 제공
- `supabase.from('embeddings').select(...)` 형태의 벡터 검색 지원

**Neon + pgvector**
- pgvector 지원 (Databricks 인수 이후 AI 워크로드 강화)
- 서버리스 특성상 임시 벡터 쿼리 워크로드에 비용 효율적
- 브랜칭을 활용한 임베딩 파이프라인 테스트 가능

**PlanetScale (MySQL)**
- MySQL 기반에서는 pgvector 불가
- MySQL 9.0+의 벡터 타입 지원이 있으나, pgvector 대비 생태계 미흡

---

## 4. 성능

### 4.1 벤치마크 개요

2025년 주요 독립 벤치마크(pilcrow.vercel.app, devtoolreviews.com 등)에 따르면:

| 지표 | Supabase (Pro) | PlanetScale (ps_5) | Neon (Launch) |
|------|----------------|---------------------|---------------|
| p50 쿼리 레이턴시 | ~2-5ms | ~1-3ms | ~2-4ms |
| p95 쿼리 레이턴시 | ~10-20ms | ~5-10ms | ~8-15ms |
| p99 쿼리 레이턴시 | ~50-100ms | ~20-40ms | ~30-60ms |
| 초당 처리량 (TPS) | 높음 | 매우 높음 | 중간-높음 |
| 콜드 스타트 | 없음 | 없음 | 300~500ms |
| 연결 후 첫 쿼리 | <10ms | <5ms (NVMe) | <10ms (풀링 시) |

**PlanetScale의 p99 우위**: Metal 클러스터의 로컬 NVMe 스토리지 덕분에 특히 꼬리 레이턴시(tail latency)에서 우수한 성능을 보인다. 이는 EBS(네트워크 스토리지) 기반 Supabase/Neon 대비 이점이다.

### 4.2 콜드 스타트 심화 분석 (Neon)

Neon의 스케일 투 제로는 비용 효율성의 핵심이지만, 콜드 스타트 레이턴시가 사용자 경험에 영향을 줄 수 있다.

```
활성 상태 쿼리:       < 5ms
유휴 후 첫 연결:      300~500ms (컴퓨트 웨이크업)
PgBouncer 풀링 후:    < 100ms (연결 재사용)
```

**콜드 스타트 완화 방법**:
1. **Connection Pooling 활성화**: PgBouncer를 통한 커넥션 재사용
2. **최소 컴퓨트 설정**: 자동 정지 비활성화 (추가 비용 발생)
3. **Warm-up 쿼리**: 서버리스 함수에서 주기적 ping 쿼리 전송
4. **Vercel 통합**: Vercel의 Neon 통합은 함수와 DB를 같은 리전에 배치

### 4.3 커넥션 풀링

| 항목 | Supabase | PlanetScale | Neon |
|------|----------|-------------|------|
| 풀러 종류 | Supavisor (자체 개발) | 자체 프록시 | PgBouncer |
| 풀링 모드 | Transaction mode, Session mode | 내장 | Transaction mode |
| 최대 연결 수 | 플랜별 상이 (Free: 60) | 내장 관리 | 플랜별 상이 |
| 서버리스 함수 지원 | 예 (Transaction mode) | 예 | 예 (Transaction mode) |
| Direct 연결 | 예 | 제한적 | 예 |

Supabase의 Supavisor는 PgBouncer의 한계(단일 프로세스)를 극복하기 위해 Elixir로 재작성한 분산 커넥션 풀러다. Neon의 콜드 스타트 문제를 PgBouncer가 완화해 주는 것과 유사하게, Supabase의 Supavisor는 서버리스 환경에서의 대규모 연결 폭발(connection burst)을 처리하는 데 최적화되어 있다.

### 4.4 쿼리 성능 최적화

**Supabase**:
- PostgreSQL EXPLAIN ANALYZE 완전 지원
- pg_stat_statements로 슬로우 쿼리 추적
- Studio에서 시각적 쿼리 계획(EXPLAIN) 분석 가능

**PlanetScale**:
- 자체 쿼리 인사이트 대시보드 제공
- Vitess의 쿼리 플래닝으로 샤딩 환경에서 최적 라우팅
- 인덱스 권장 사항 자동 분석

**Neon**:
- 표준 PostgreSQL EXPLAIN/ANALYZE
- pg_stat_statements 지원
- Databricks 통합을 통한 분석 쿼리 최적화 강화 중

---

## 5. 가격

### 5.1 무료 티어 비교 (2026년 4월 기준)

| 항목 | Supabase Free | PlanetScale Free | Neon Free |
|------|--------------|-----------------|-----------|
| 프로젝트/DB 수 | 2개 | 제한적 | 10개 (프로젝트당 0.5GB) |
| 스토리지 | 500MB DB | 10GB | 0.5GB/프로젝트 |
| 컴퓨트 | 포함 (공유) | 포함 | 100 CU-hours/월 |
| 비활성 정책 | 7일 후 일시정지 | 없음 | 5분 후 스케일 투 제로 |
| MAU (인증) | 50,000 | 해당 없음 | 해당 없음 |
| 파일 스토리지 | 1GB | 해당 없음 | 해당 없음 |
| 대역폭 | 5GB | 포함 | 포함 |
| 브랜칭 | 제한 | 포함 | 무제한 |
| PITR | 없음 | 없음 | 6시간 |
| 가격 | $0 | $0 | $0 |

> **PlanetScale 무료 티어 역사**: 2024년 3월 Hobby 플랜을 폐지했으나, 2025-2026년에 다시 무료 티어를 재도입했다. 단, 이전 폐지 이력이 있어 지속 가능성에 대한 커뮤니티 우려가 있다.

### 5.2 유료 플랜 비교

#### Supabase

| 플랜 | 가격 | 주요 포함 사항 |
|------|------|--------------|
| Free | $0/월 | 500MB DB, 50K MAU, 1GB 스토리지 |
| Pro | $25/월 + 사용량 | 8GB DB, 100K MAU, 100GB 스토리지 |
| Team | $599/월 | Pro + SSO, 감사 로그, 팀 기능 |
| Enterprise | 문의 | 전용 인프라, HIPAA, 99.9% SLA |

Pro 플랜 컴퓨트 추가 옵션:
- Micro: $10/월 (0.5 vCPU, 1GB RAM)
- Small: $15/월 (2 vCPU, 2GB RAM)
- Medium: $60/월 (2 vCPU, 4GB RAM)
- Large: $120/월 (2 vCPU, 8GB RAM)

#### PlanetScale (2026년 기준)

| 플랜 | 가격 | 주요 포함 사항 |
|------|------|--------------|
| Free | $0/월 | 개발용, 10GB 스토리지 |
| postgres_single | $5/월 | 단일 노드 Postgres, 저트래픽 운영 |
| ps_5 | $15/월 | 운영 워크로드용 |
| metal_ha | $50/월 | 고성능, NVMe, HA 구성 |
| Enterprise | 문의 | 전용 Metal 클러스터, SLA |

#### Neon

| 플랜 | 가격 | 주요 포함 사항 |
|------|------|--------------|
| Free | $0/월 | 100 CU-hours, 0.5GB/프로젝트, 10개 프로젝트 |
| Launch | $19/월 | 300 CU-hours, 10GB 스토리지, 10개 프로젝트 |
| Scale | $69/월 | 750 CU-hours, 50GB, 50개 프로젝트 |
| Business | $700/월 | 1,000 CU-hours, 500GB |
| Enterprise | 문의 | 커스텀 |

컴퓨트 단가: $0.16/CU-hour (2025년 15-25% 인하 후)
스토리지 단가: $0.35/GB-월 (2025년 약 80% 인하 후, 기존 $1.75)
스냅샷 스토리지: $0.09/GB-월 (2026년 5월 1일부터 청구 시작)

### 5.3 초과 과금 (Overage)

| 항목 | Supabase Pro | PlanetScale | Neon Launch |
|------|-------------|-------------|-------------|
| 스토리지 초과 | $0.125/GB-월 | 플랜 업그레이드 | $0.35/GB-월 |
| 대역폭 초과 | $0.09/GB | 포함 | 포함 |
| 컴퓨트 초과 | 상위 컴퓨트 플랜 | 플랜 업그레이드 | $0.16/CU-hour |
| MAU 초과 (인증) | $0.00325/MAU | 해당 없음 | 해당 없음 |

### 5.4 실제 비용 시뮬레이션

#### 시나리오 A: 소규모 스타트업 (사용자 5,000명, DB 2GB, 트래픽 적음)

| 서비스 | 월 비용 | 비고 |
|--------|---------|------|
| Supabase Free | $0 | MAU 5K는 무료 50K 내, DB 2GB > 500MB이므로 Pro 필요 → 사실상 $25 |
| Supabase Pro | $25 + α | 컴퓨트 Micro $10 추가 시 $35 |
| PlanetScale postgres_single | $5 | 단순 Postgres, 인증은 별도 |
| Neon Free | $0 | 0.5GB × 10 프로젝트 = 5GB 총량 내 가능 |
| Neon Launch | $19 | 10GB, 스케일 투 제로로 실제 비용 최소화 |

→ **소규모 스타트업**: Neon Free 또는 $5 PlanetScale이 최저 비용

#### 시나리오 B: 중규모 앱 (MAU 50,000, DB 20GB, 트래픽 보통)

| 서비스 | 월 비용 | 비고 |
|--------|---------|------|
| Supabase Pro | $25 + $10(컴퓨트) + $1.5(초과 DB 12GB) ≈ $37 | MAU 50K는 Pro 포함 내 |
| PlanetScale ps_5 | $15 | 인증 서비스 별도 필요 ($15~$30 추가) |
| Neon Scale | $69 + 사용량 | 50K MAU는 별도 인증 서비스 필요 |

→ **중규모 앱**: Supabase Pro가 인증 포함 시 가장 경제적 ($35~50 범위)

#### 시나리오 C: 고성능 요구 (MAU 200K, DB 100GB, 고트래픽)

| 서비스 | 월 비용 | 비고 |
|--------|---------|------|
| Supabase Pro | $25 + $120(Large 컴퓨트) + $11.25(초과 DB) + $325(MAU 초과 100K) ≈ $481 | 비용 급증 |
| Supabase Team | $599 | MAU 제한 확인 필요 |
| PlanetScale metal_ha | $50 + 인증 비용 | 스케일에 강함, 인증 별도 |
| Neon Business | $700 | 컴퓨트 여유 있음 |

→ **고성능/고트래픽**: PlanetScale Metal + 별도 인증이 DB만 놓고 보면 가장 저렴, 하지만 Supabase의 올인원 패키지와 비교 시 운영 복잡도 고려 필요

---

## 6. 개발자 경험 (DX)

### 6.1 CLI 도구

#### Supabase CLI

```bash
# 설치
npm install -g supabase

# 프로젝트 초기화
supabase init
supabase start  # 로컬 Docker 환경 실행

# 마이그레이션
supabase migration new add_users_table
supabase db push

# 타입 생성 (자동)
supabase gen types typescript --project-id <id> > types/supabase.ts
```

Supabase CLI의 특징: **로컬 풀 스택 에뮬레이션**. `supabase start`로 Docker Compose를 통해 로컬에서 Postgres + Auth + Storage + Studio를 모두 실행할 수 있다.

#### PlanetScale CLI

```bash
# 설치
brew install planetscale/tap/pscale

# 브랜치 워크플로우
pscale branch create my-db new-feature
pscale connect my-db new-feature --port 3309

# 배포 요청
pscale deploy-request create my-db new-feature
```

#### Neon CLI

```bash
# 설치
npm install -g neonctl

# 인증
neonctl auth

# 브랜치 관리
neonctl branches create --name feature/new-feature
neonctl branches list
neonctl connection-string --branch feature/new-feature

# 컴퓨트 제어
neonctl branches suspend  # 수동 일시 정지
```

### 6.2 마이그레이션 도구

| 도구 | Supabase 지원 | PlanetScale 지원 | Neon 지원 |
|------|--------------|-----------------|-----------|
| Prisma | 공식 지원 | 공식 지원 (MySQL) | 공식 지원 |
| Drizzle ORM | 공식 지원 | 지원 | 공식 지원 |
| Flyway | 지원 | 지원 | 지원 |
| Liquibase | 지원 | 지원 | 지원 |
| django-migrate | 지원 | 지원 | 지원 |
| TypeORM | 지원 | 지원 | 지원 |
| Knex.js | 지원 | 지원 | 지원 |
| 자체 마이그레이션 | Supabase CLI | Deploy Request | Neon CLI |

### 6.3 TypeScript 타입 생성

Supabase는 `supabase gen types typescript` 명령으로 DB 스키마를 기반으로 TypeScript 타입을 자동 생성하는 기능을 제공한다. 이는 DX 측면에서 큰 장점이다.

```typescript
// 자동 생성된 타입 예시 (supabase gen types)
export type Database = {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; created_at: string }
        Insert: { id?: string; email: string }
        Update: { id?: string; email?: string }
      }
    }
  }
}

// 사용 시 완전한 타입 안전성
const { data } = await supabase.from('users').select('*')
// data는 Database['public']['Tables']['users']['Row'][] 타입
```

PlanetScale은 MySQL 기반이므로 TypeScript 타입 생성 도구가 상대적으로 제한적이다. Neon은 Drizzle의 `drizzle-kit introspect` 또는 `pg-typegen`을 활용한다.

### 6.4 SDK 및 클라이언트 라이브러리

**Supabase**:
- JavaScript/TypeScript: `@supabase/supabase-js`
- Python: `supabase-py`
- Swift, Flutter, Kotlin 공식 SDK 제공
- REST API 자동 생성 (PostgREST)
- GraphQL 지원 (pg_graphql 확장)
- Realtime 구독 내장

**PlanetScale**:
- 표준 MySQL 드라이버 사용 (`mysql2`, `@planetscale/database`)
- HTTP 기반 쿼리 드라이버 (`@planetscale/database`) — 서버리스 환경(Edge Runtime)에서도 동작
- 특이사항: HTTP 드라이버는 TCP 연결 없이 쿼리 가능

**Neon**:
- `@neondatabase/serverless` — 서버리스/Edge 환경 전용 HTTP/WebSocket 드라이버
- 표준 `pg` 드라이버 호환
- Prisma, Drizzle, Kysely 공식 통합

---

## 7. 운영

### 7.1 백업

| 항목 | Supabase Free | Supabase Pro | PlanetScale | Neon |
|------|--------------|-------------|-------------|------|
| 백업 유형 | 없음 | 일별 자동 | 자동 스냅샷 | PITR |
| 보관 기간 | - | 7일 | 14일 | 7일 (Free: 6시간) |
| PITR (시점 복원) | 없음 | Pro+: 7일 | 없음 | 모든 유료 플랜 |
| 수동 백업 | 없음 | 가능 | 가능 | 브랜치로 스냅샷 |
| 백업 비용 | - | 포함 | 포함 | $0.09/GB-월 (2026.5 이후) |

Neon의 PITR(Point-in-Time Recovery): WAL(Write-Ahead Log) 기반으로 특정 시점의 DB 상태로 정확하게 복구 가능. 무료 티어는 6시간, 유료는 7~30일.

### 7.2 모니터링

**Supabase Studio**:
- 쿼리 성능 모니터링 (pg_stat_statements)
- 실시간 데이터베이스 상태
- 느린 쿼리 식별
- 연결 수 모니터링
- 알림 설정 (이메일)

**PlanetScale**:
- Query Insights 대시보드
- 초당 QPS, 레이턴시, 오류율 시각화
- 인덱스 최적화 권장 사항
- Vitess 내부 메트릭

**Neon**:
- 컴퓨트 사용량 모니터링
- 브랜치별 스토리지 사용량
- 연결 현황
- 외부 모니터링 툴 통합 (Datadog, Grafana)

### 7.3 스케일링

| 전략 | Supabase | PlanetScale | Neon |
|------|----------|-------------|------|
| 수직 스케일 | 컴퓨트 플랜 업그레이드 (다운타임 없음) | 플랜 업그레이드 | 자동 (max CU 내) |
| 수평 스케일 | 읽기 복제본 추가 | Vitess 샤딩 | 읽기 복제본 + 브랜치 |
| 자동 스케일 | 없음 (수동) | 없음 (수동) | 있음 (컴퓨트 자동) |
| 최대 스케일 | Large 컴퓨트 (8GB RAM) | Metal HA | 제한 없음 (이론상) |
| 수평 샤딩 | 없음 | 예 (Vitess 핵심 기능) | 없음 |

**PlanetScale의 수평 샤딩**: Vitess의 핵심 강점. 단일 DB의 처리 한계를 넘어설 때 데이터를 여러 MySQL 인스턴스에 분산할 수 있다. YouTube, GitHub 등 초대형 서비스가 사용하는 방식.

### 7.4 SLA 및 가용성

| 항목 | Supabase Free | Supabase Pro | PlanetScale | Neon |
|------|--------------|-------------|-------------|------|
| SLA | 없음 | 99.9% | 99.99% (Metal HA) | 99.95% (유료) |
| 업타임 보장 | 없음 | 99.9% | 엔터프라이즈: 99.99% | 99.95% |
| 지원 채널 | 커뮤니티 | 이메일 | 이메일/채팅 | 이메일/채팅 |
| 지원 응답 시간 | N/A | 영업일 내 | <4시간 (Pro+) | <8시간 |

---

## 8. 의사결정 가이드

### 8.1 Supabase를 선택해야 하는 경우

**적합한 상황**:
- **풀스택 BaaS 필요**: DB + 인증 + 스토리지 + Realtime + Edge Functions를 하나로 관리하고 싶을 때
- **빠른 프로토타이핑**: Studio의 시각적 UI로 스키마 설계 및 데이터 확인이 필요할 때
- **PostgreSQL 생태계 활용**: pgvector, PostGIS, FDW, pg_cron 등 다양한 확장이 필요할 때
- **TypeScript 타입 안전성**: `gen types`를 통한 완전한 타입 안전성 원할 때
- **Firebase 마이그레이션**: Firebase에서 이전하는 경우
- **예산 중간~소규모**: $25~50/월 범위에서 올인원 서비스 원할 때

**부적합한 상황**:
- 수평 샤딩이 필요한 초대형 트래픽 (Vitess 기반 PlanetScale이 더 적합)
- 극한의 성능(p99)이 중요한 경우 (PlanetScale Metal이 더 유리)
- 컴퓨트 비용 최소화가 최우선인 경우 (Neon 서버리스가 더 유리)

### 8.2 PlanetScale을 선택해야 하는 경우

**적합한 상황**:
- **MySQL 기반 기존 앱**: 이미 MySQL을 사용하고 있고 PlanetScale로 이전하는 경우
- **무중단 스키마 변경이 핵심**: 24/7 운영 중인 서비스에서 다운타임 없는 DDL이 필수적일 때
- **Git-like 스키마 워크플로우**: 팀이 코드처럼 스키마를 관리하고 싶을 때
- **고성능 + 예측 가능한 레이턴시**: NVMe 기반 Metal 클러스터로 극한 성능이 필요할 때
- **대규모 수평 확장 예정**: 미래에 Vitess 샤딩이 필요한 규모로 성장할 계획이 있을 때
- **독립적인 DB 전용 서비스**: 인증/스토리지는 다른 서비스로 처리할 수 있는 경우

**부적합한 상황**:
- PostgreSQL 확장(pgvector, PostGIS 등)이 필수인 경우 (MySQL 기반에서는 불가)
- 소규모로 시작하여 가격이 중요한 경우 (현재 무료 티어 지속성 불확실)
- 올인원 BaaS가 필요한 경우 (PlanetScale은 DB 전용)

### 8.3 Neon을 선택해야 하는 경우

**적합한 상황**:
- **진정한 서버리스 + 비용 최소화**: 간헐적 트래픽, 개발/스테이징 환경에서 유휴 시 비용 0을 원할 때
- **CI/CD 브랜칭 워크플로우 핵심**: PR마다 완전한 DB 스냅샷으로 통합 테스트하고 싶을 때
- **여러 스테이징 환경**: 10개 이상의 독립된 DB 환경이 필요한 멀티 테넌트 개발
- **Vercel/Edge 배포**: Neon의 HTTP/WebSocket 드라이버가 Vercel Edge Runtime과 최적화됨
- **사용량 기반 과금 선호**: 고정 비용 없이 사용한 만큼만 내고 싶을 때
- **AI/ML 워크로드 (향후)**: Databricks 통합으로 데이터 레이크하우스와의 시너지

**부적합한 상황**:
- 콜드 스타트가 허용되지 않는 지연 민감 서비스 (항상 켜져 있어야 하는 경우)
- MySQL이 필수인 경우
- 수평 샤딩이 필요한 초대형 서비스

### 8.4 비교 요약 매트릭스

| 사용 케이스 | 최선 선택 | 차선 | 비고 |
|-----------|---------|------|------|
| Next.js 스타트업, 빠른 출시 | Supabase | Neon | 올인원 DX 최고 |
| 비용 최소화, 저트래픽 | Neon Free | PlanetScale Free | 스케일 투 제로 |
| MySQL 레거시 이전 | PlanetScale | Supabase (스키마 변환) | MySQL 호환 |
| CI/CD 브랜칭 강조 | Neon | PlanetScale | 데이터 포함 브랜치 |
| 엔터프라이즈 고성능 | PlanetScale Metal | Supabase | NVMe 우위 |
| AI/벡터 검색 | Supabase | Neon | pgvector 생태계 |
| 풀스택 BaaS | Supabase | 해당 없음 | 유일한 올인원 |
| 무중단 DDL | PlanetScale | Supabase | Vitess 비블로킹 |
| 수평 샤딩 | PlanetScale | 해당 없음 | Vitess 전용 기능 |

---

## 9. 7항목 스코어링

> 1점 = 매우 부족, 5점 = 최고 수준

### 9.1 스코어카드

| 항목 | 가중치 | Supabase | PlanetScale | Neon |
|------|--------|----------|-------------|------|
| **기능 풍부성** | 20% | 5 | 3 | 4 |
| **개발자 경험 (DX)** | 20% | 5 | 4 | 4 |
| **성능** | 15% | 4 | 5 | 4 |
| **가격 효율성** | 15% | 3 | 4 | 5 |
| **운영 편의성** | 15% | 4 | 4 | 3 |
| **확장성** | 10% | 3 | 5 | 4 |
| **생태계/지속성** | 5% | 5 | 3 | 4 |

### 9.2 가중치 적용 총점

| 서비스 | 가중 평균 |
|--------|---------|
| Supabase | **4.20** |
| PlanetScale | **3.90** |
| Neon | **4.00** |

### 9.3 항목별 세부 평가

**기능 풍부성**
- Supabase (5): DB + Auth + Storage + Realtime + Edge Functions + FDW + pgvector 올인원. 경쟁자가 없음.
- Neon (4): PostgreSQL 전체 기능 + 브랜칭 + PITR. AI 기능 강화 중.
- PlanetScale (3): MySQL/Vitess 강점 + 스키마 브랜칭. PostgreSQL 생태계 미흡.

**개발자 경험 (DX)**
- Supabase (5): 로컬 에뮬레이션, Studio, 타입 생성, 직관적 API. DX 업계 최고 수준.
- PlanetScale (4): Git-like 워크플로우, 깔끔한 CLI, 직관적 배포 요청 흐름.
- Neon (4): 브랜칭 워크플로우 매우 우수. CLI 개선 중. Vercel/Databricks 통합 강점.

**성능**
- PlanetScale (5): NVMe Metal, 꼬리 레이턴시 최저, Vitess의 샤딩 수평 확장성.
- Supabase (4): EBS 기반이지만 충분히 빠름. Supavisor로 연결 풀링 최적화.
- Neon (4): 콜드 스타트를 제외하면 우수. PgBouncer 활성화 시 경쟁력 있음.

**가격 효율성**
- Neon (5): 스케일 투 제로, 사용량 기반 과금, Databricks 인수 후 대폭 인하.
- PlanetScale (4): $5~$50 플랜으로 진입 장벽 낮음. 무료 티어 재도입.
- Supabase (3): Pro $25는 합리적이나, 고트래픽 시 MAU + 컴퓨트 초과 비용 누적.

**운영 편의성**
- Supabase (4): Studio 대시보드가 매우 직관적. 슬로우 쿼리 분석, 로그, 모니터링 내장.
- PlanetScale (4): 쿼리 인사이트, 배포 요청 감사 로그, 자동 인덱스 권장.
- Neon (3): 기본적인 모니터링 제공. 대규모 운영 도구는 아직 성숙도 낮음.

**확장성**
- PlanetScale (5): Vitess 수평 샤딩은 세계 최대 규모 데이터베이스에서 검증된 기술.
- Neon (4): 서버리스 자동 스케일 + 읽기 복제본. Databricks 통합으로 분석 스케일 강점.
- Supabase (3): 단일 인스턴스 수직 확장 + 읽기 복제본. 수평 샤딩 없음.

**생태계/지속성**
- Supabase (5): 오픈소스 커뮤니티 강력, 투자 충분, 1M+ 사용자. 지속성 가장 안정적.
- Neon (4): Databricks($43B) 산하, 오픈소스. 재정적 안정성 높음. 단, AI 플랫폼 방향 전환 리스크.
- PlanetScale (3): 무료 티어 폐지→재도입 이력으로 비즈니스 안정성 불확실. 커뮤니티 신뢰 회복 중.

---

## 부록: 한국 프로젝트 관점 참고사항

- **리전**: 세 서비스 모두 ap-northeast-2 (서울) 리전 지원. Supabase와 Neon은 ap-northeast-1 (도쿄)도 지원.
- **문서 언어**: 세 서비스 모두 영어 공식 문서. 한국어 커뮤니티는 Supabase가 가장 활성화.
- **결제 수단**: 세 서비스 모두 신용카드(해외 결제) 필수.
- **데이터 주권**: 국내 규정이 있는 금융/의료 서비스는 데이터 리전 선택 주의 필요.

---

*Sources:*
- [Supabase Pricing 2026 - UI Bakery](https://uibakery.io/blog/supabase-pricing)
- [PlanetScale Pricing 2026](https://costbench.com/software/database-as-service/planetscale/)
- [Neon New Usage-Based Pricing](https://neon.com/blog/new-usage-based-pricing)
- [Serverless PostgreSQL 2025: Supabase, Neon, PlanetScale - DEV](https://dev.to/dataformathub/serverless-postgresql-2025-the-truth-about-supabase-neon-and-planetscale-7lf)
- [Neon Database Review 2026 - Autonoma](https://www.getautonoma.com/blog/neon-database)
- [Supabase vs PlanetScale vs Neon (2026) - DevToolReviews](https://www.devtoolreviews.com/reviews/supabase-vs-planetscale-vs-neon)
- [PlanetScale Hobby Plan Deprecation FAQ](https://planetscale.com/docs/plans/hobby-plan-deprecation-faq)
- [Neon Latency Benchmarks](https://neon-latency-benchmarks.vercel.app/)
