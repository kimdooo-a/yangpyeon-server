# Supabase: Self-hosting vs Managed 비교 분석

> 작성일: 2026-04-06  
> 대상: Supabase 도입을 검토 중인 개발팀  
> 출처: Supabase 공식 문서, supascale.app, flexprice.io, costbench.com 등

---

## 목차

1. [비용 분석](#1-비용-분석)
2. [기능 차이](#2-기능-차이)
3. [운영 부담](#3-운영-부담)
4. [하이브리드 전략](#4-하이브리드-전략)
5. [의사결정 매트릭스](#5-의사결정-매트릭스)
6. [결론 및 권고](#6-결론-및-권고)

---

## 1. 비용 분석

### 1-1. Supabase Managed 플랜 구조

Supabase Cloud는 2026년 현재 4개 플랜을 제공한다.

| 플랜 | 월 기본료 | 포함 사양 | 주요 특징 |
|------|-----------|-----------|-----------|
| **Free** | $0 | DB 500MB, MAU 50,000, 스토리지 1GB | 1개 조직, 일시 중지(7일 미사용) |
| **Pro** | $25 | DB 8GB, MAU 100,000, 스토리지 100GB | 컴퓨트 크레딧 $10 포함, Spend Cap 기본 활성화 |
| **Team** | $599 | Pro 전체 + SSO, SOC 2 보고서, 로그 28일 보관 | 팀 전체에 Pro 기능 적용 |
| **Enterprise** | 협의 | 커스텀 SLA, 24/7 지원, BYO Cloud 옵션 | 규정 준수, 전용 Slack 채널 |

#### 초과 사용 요금 (Pro 기준)

- **스토리지**: $0.021/GB (100GB 초과분)
- **이그레스(Egress)**: $0.09/GB
- **컴퓨트**: 小 인스턴스 기준 ~$10/월부터 (추가 업그레이드 시 $25~$450/월)
- **PITR (Point-in-Time Recovery)**: 소형 컴퓨트 add-on 필수 + 별도 요금
- **Edge Functions 호출**: 200만 회 초과 시 과금

**실제 월 청구액 예시 (Pro 플랜, MAU 2만, 스토리지 50GB, 이그레스 50GB):**
- 기본료: $25
- 이그레스: $4.5
- 컴퓨트 크레딧: -$10
- **실질 지불: ~$19.5~25**

> Pro 플랜은 Spend Cap을 기본 활성화하여 예상치 못한 초과 요금을 차단한다.

---

### 1-2. 셀프호스팅 인프라 비용

셀프호스팅의 실질 비용은 **인프라 비용 + 운영 인건비**의 합산이다.

#### 주요 클라우드/VPS 비교

| 제공업체 | 스펙 | 월 비용 | 특징 |
|----------|------|---------|------|
| **Hetzner CX22** | 2 vCPU, 4GB RAM | €3.29 (~$3.5) | 소규모, 개인 프로젝트 |
| **Hetzner CPX31** | 4 vCPU, 8GB RAM | ~$15 | 중소규모 권장 |
| **Hetzner CCX33** | 8 vCPU, 32GB RAM | ~$50 | 중규모 프로덕션 |
| **DigitalOcean Droplet** | 4 vCPU, 8GB RAM | ~$48 | 관리형 Kubernetes 옵션 |
| **AWS EC2 t3.large** | 2 vCPU, 8GB RAM | ~$60 (온디맨드) | Reserved 시 ~$38 |
| **GCP n2-standard-2** | 2 vCPU, 8GB RAM | ~$55 | 커밋 시 ~$35 |

#### 셀프호스팅 전체 스택 비용 (중규모 기준, Hetzner)

| 항목 | 월 비용 |
|------|---------|
| 앱 서버 (CPX31) | ~$15 |
| 전용 DB 서버 (CCX33) | ~$50 |
| S3 호환 스토리지 (Wasabi/B2) | ~$7 (1TB) |
| 이메일 서비스 (Resend/SES) | ~$3 |
| 모니터링 (Grafana Cloud Free 또는 별도) | $0~$10 |
| 도메인 + SSL (Let's Encrypt) | ~$1 |
| **소계 (인프라만)** | **~$76~86** |

> AWS/GCP 동급 스펙: ~$120~180 (이그레스 포함 시 더 높음)  
> 핵심: Hetzner 등 유럽 VPS는 AWS 대비 이그레스 비용이 거의 없어 트래픽이 많을수록 유리하다.

---

### 1-3. 시나리오별 비교

#### 소규모 (1인 개발자, MAU 5,000 이하, 트래픽 소)

**Managed (Pro)가 절대적으로 유리하다.**

| 항목 | Managed (Pro) | 셀프호스팅 |
|------|---------------|-----------|
| 인프라 비용 | $25/월 | $15~50/월 |
| 운영 시간 | 거의 0 | 5~10시간/월 |
| 인건비 환산 (시간당 $30) | $0 | $150~300 |
| **총 비용** | **~$25** | **~$165~350** |

1인 개발자에게 인프라 관리 시간은 곧 개발 시간의 손실이다. Free 플랜으로 시작하여 성장 후 Pro로 전환하는 경로가 가장 합리적이다.

---

#### 중규모 (팀 4~10인, MAU 10만, 스토리지 500GB)

**분기점 구간. 세부 조건에 따라 달라진다.**

| 항목 | Managed (Team) | 셀프호스팅 (Hetzner) |
|------|----------------|---------------------|
| 기본 구독료 | $599/월 | $0 |
| 인프라 비용 | 포함 | ~$100~150 |
| DevOps 인건비 (0.2 FTE) | $0 | ~$2,000~3,000 |
| 보안 패치/업그레이드 | 자동 | 자직접 처리 |
| **총 비용 (인건비 포함)** | **~$599** | **~$2,100~3,150** |

Managed Team 플랜이 여전히 비용 경쟁력이 있다. 단, 팀 내 전담 DevOps 엔지니어가 이미 존재하고 여러 프로젝트를 운영 중이라면 셀프호스팅 고려가 가능해진다.

> **분기점 분석**: MAU 10만 기준, 인건비를 제외한 순수 인프라 비용만 따지면 셀프호스팅이 저렴하다. 그러나 **인건비를 포함하면** Managed가 유리하다. Team 플랜 $599은 SOC 2, 28일 로그 보관, 자동 백업, SSO를 포함하므로 이를 직접 구축하는 비용과 비교해야 한다.

---

#### 대규모 (MAU 100만+, 데이터 수 TB 규모)

**셀프호스팅이 유리해지는 구간이다.**

| 항목 | Managed (Enterprise) | 셀프호스팅 |
|------|---------------------|-----------|
| 월 비용 (협의) | ~$5,000~20,000+ | ~$500~2,000 (인프라) |
| 전담 DevOps | 불필요 | 1 FTE (~$8,000~15,000/월) |
| 데이터 주권 | 클라우드 의존 | 완전 통제 |
| 커스텀 PostgreSQL 확장 | 제한적 | 완전 자유 |
| 멀티리전 구성 | 플랜 제한 있음 | 자유 설계 |
| **총 비용** | **$5,000~20,000+** | **$8,500~17,000** |

대규모에서는 데이터 주권, 규정 준수(국내 서버 의무 등), 특수 PostgreSQL 확장 필요성, 비용 최적화 등 비금전적 요인도 중요해진다. 특히 **이그레스 비용**이 Supabase Cloud에서 수천 달러에 달할 수 있는 구간에서는 Hetzner 등 자체 인프라의 가격 이점이 극대화된다.

---

### 1-4. 총소유비용(TCO) 요약

```
소규모: Managed >>> 셀프호스팅
중규모: Managed >= 셀프호스팅 (조건부)
대규모: 셀프호스팅 < Managed (조건부, DevOps 역량 있을 때)
```

> supascale.app 분석에 따르면, 셀프호스팅의 TCO는 월 $1,150~$6,300으로 추산된다 (인건비 포함, 중규모 기준). 50인 이하 팀에서는 Managed가 재무적으로 유리한 경우가 대부분이다.

---

## 2. 기능 차이

### 2-1. Managed에서만 가능한 기능

#### Database Branching

- **Cloud 전용 기능**: GitHub 연동을 통한 자동 브랜칭, 또는 대시보드에서 직접 브랜치 생성
- **셀프호스팅 불가**: 공식 문서 및 커뮤니티 확인 결과, 브랜칭은 Cloud 플랫폼 전용 기능
- **실용 가치**: 개발/스테이징/프로덕션 환경을 독립 DB로 분리하여 안전한 마이그레이션 테스트 가능

#### Edge Functions 글로벌 배포

- **Cloud**: Deno 런타임 기반 Edge Functions를 전 세계 리전에 자동 배포
  - 최대 CPU 시간 2초/요청, 최대 함수 크기 20MB
  - Cloudflare 네트워크 활용한 저지연 실행
- **셀프호스팅**: Edge Functions는 **베타 상태**, 단일 서버에서만 실행 (글로벌 분산 불가)
  - API/설정 옵션에 Breaking Change 발생 가능성 있음
  - Fly.io, DigitalOcean 등 별도 플랫폼에 수동 배포 필요

#### 자동 백업

| 기능 | Free | Pro | Team | 셀프호스팅 |
|------|------|-----|------|-----------|
| 일일 백업 | 없음 | 7일 보관 | 28일 보관 | 직접 구성 |
| Point-in-Time Recovery | 없음 | add-on | add-on | 직접 구성 (WAL-G 등) |
| 백업 복원 | 없음 | 있음 | 있음 | 직접 스크립트 |
| 원클릭 복원 | 없음 | 있음 | 있음 | 없음 |

PITR(Point-in-Time Recovery)은 Pro/Team/Enterprise에서 add-on으로 제공된다. 초 단위 복원이 가능하나, 소형 컴퓨트 add-on이 필수 조건이다.

셀프호스팅에서 PITR을 구현하려면 WAL-G 또는 pgBackRest와 같은 도구를 직접 설치·설정해야 하며, 이는 상당한 PostgreSQL 운영 지식을 요구한다.

#### CDN (Content Delivery Network)

- **Cloud**: Supabase Storage는 CloudFront 기반 CDN으로 정적 에셋 전 세계 캐싱
- **셀프호스팅**: 내장 CDN 없음 → Cloudflare R2, BunnyCDN 등 별도 연동 필요

#### 컴퓨트 자동 스케일링

- **Cloud**: 트래픽 급증 시 컴퓨트 추가(Compute Add-on)로 스케일업 가능 (수동 조정)
- **셀프호스팅**: PgBouncer 튜닝, 읽기 복제본 수동 추가 등 직접 처리

---

### 2-2. Studio 기능 차이

Supabase Studio(대시보드)는 셀프호스팅에서도 제공되지만 기능 격차가 존재한다.

| 기능 | Cloud Studio | 셀프호스팅 Studio |
|------|-------------|-----------------|
| 테이블 에디터 | 있음 | 있음 |
| SQL 에디터 | 있음 | 있음 |
| Auth 설정 UI | 있음 | **제한적** (일부 env 변수로만 설정) |
| Edge Functions 관리 | 있음 | **없음** (최근 일부 추가) |
| Realtime Inspector | 있음 | **제한적** |
| 로그 탐색기 | 있음 (플랜별 보관 기간) | **없음** (별도 로깅 시스템 필요) |
| Security Advisor | 있음 | **없음** |
| AI Assistant (SQL) | 있음 | **없음** |
| 멀티 프로젝트 관리 | 있음 | **없음** |
| Branching UI | 있음 | **없음** |
| 사용량/빌링 대시보드 | 있음 | **없음** |
| 성능 인사이트 | 있음 | **없음** |

> 2025년 Community 토론 기준, 셀프호스팅에서 "Email Template, Auth Providers, Realtime 설정이 Studio에서 누락되어 있다"는 피드백이 다수 존재한다. 이는 Docker env 변수로 대체 설정 가능하지만 UX가 불편하다.

---

### 2-3. 기술적 제한 사항 (셀프호스팅)

1. **멀티 프로젝트 격리 없음**: Cloud는 프로젝트 단위 격리, 셀프호스팅은 단일 인스턴스
2. **Read Replicas**: Cloud는 Pro+ 플랜에서 제공, 셀프호스팅은 PostgreSQL Streaming Replication 직접 구성
3. **커스텀 도메인**: Cloud에서 공식 지원, 셀프호스팅은 기본값
4. **Email 서비스**: Cloud는 기본 이메일 발송 포함, 셀프호스팅은 SMTP 서버 직접 연결 필수
5. **pg_net 등 확장**: 셀프호스팅 시 일부 PostgreSQL 확장이 AWS RDS/Aurora에서 미지원 (공식 문서 명시)

---

## 3. 운영 부담

### 3-1. Managed 플랜의 운영 편의성

Supabase Cloud를 사용하면 아래 항목을 플랫폼이 처리한다:

| 영역 | 플랫폼 책임 |
|------|------------|
| PostgreSQL 버전 업그레이드 | 자동 (공지 후 적용) |
| 보안 패치 | 자동 적용 |
| OS 패치 | 자동 |
| SSL 인증서 갱신 | 자동 (Let's Encrypt) |
| 장애 복구 | HA 아키텍처, 자동 페일오버 |
| 데이터 백업 | 플랜별 자동 |
| 모니터링 알림 | 기본 제공 |
| 스케일링 | 컴퓨트 add-on으로 조정 |

개발팀은 **애플리케이션 로직과 RLS 정책**에만 집중하면 된다.

---

### 3-2. 셀프호스팅의 운영 체크리스트

셀프호스팅 시 직접 관리해야 하는 항목:

#### PostgreSQL 관리
- [ ] 정기 버전 업그레이드 (마이그레이션 테스트 필수)
- [ ] Vacuum 정책 튜닝
- [ ] 인덱스 최적화
- [ ] 연결 풀링 (PgBouncer 설정)
- [ ] WAL 관리 및 아카이빙

#### 인프라 보안
- [ ] OS 보안 패치 (최소 월 1회)
- [ ] Docker 이미지 업데이트
- [ ] SSL/TLS 인증서 갱신 (Let's Encrypt 90일 주기)
- [ ] 방화벽 규칙 관리
- [ ] SSH 키 로테이션
- [ ] fail2ban 설정 및 모니터링

#### 백업 및 복구
- [ ] 일일 pg_dump 또는 WAL-G 설정
- [ ] 백업 무결성 정기 검증 (복원 테스트)
- [ ] 오프사이트 백업 복사 (최소 3-2-1 규칙)
- [ ] 복구 시간 목표(RTO) 설정 및 훈련

#### 모니터링
- [ ] Prometheus + Grafana 또는 동급 도구 설정
- [ ] 디스크 사용량 알림
- [ ] DB 연결 수 알림
- [ ] 메모리/CPU 알림
- [ ] 에러 로그 집계 (ELK, Loki 등)

#### Supabase 서비스 업그레이드
- [ ] docker-compose.yml 버전 변경
- [ ] 마이그레이션 스크립트 검토 (기존 데이터 디렉토리 비재실행 주의)
- [ ] Kong 설정 변경 검토
- [ ] GoTrue (Auth), PostgREST, Realtime, Storage 각 서비스 호환성 확인

> 실제 커뮤니티 피드백: "업그레이드 경로가 가장 큰 도전이다. 마이그레이션이 기존 데이터 디렉토리에서 재실행되지 않아 프로덕션 버전 업을 두렵게 만든다."

---

### 3-3. 운영 부담 정량화

| 업무 영역 | Managed | 셀프호스팅 (추정 시간/월) |
|-----------|---------|--------------------------|
| 인프라 모니터링 | 0 | 5~10시간 |
| 보안 패치 적용 | 0 | 2~4시간 |
| 백업 검증 | 0 | 1~2시간 |
| 버전 업그레이드 | 0 | 2~8시간 |
| 장애 대응 | 없음 (플랫폼 처리) | 불규칙 (0~수십 시간) |
| **월 합계** | **~0시간** | **~10~24시간+** |

---

### 3-4. 장애 대응 시나리오

**Managed 플랜 장애 시:**
1. Supabase Status (status.supabase.com) 확인
2. 조직 알림 수신
3. Supabase 엔지니어링팀이 복구 처리
4. 개발팀은 대기 또는 재시도 로직으로 대응

**셀프호스팅 장애 시:**
1. 직접 원인 분석 (DB? 네트워크? Kong? Auth?)
2. 11개 Docker 컨테이너 상태 점검
3. 로그 분석 (각 서비스별 별도 수집 필요)
4. 복구 직접 실행 (데이터 복구 포함)
5. 재발 방지 조치

> 평균 MTTR(Mean Time to Recover): Managed는 분~시간, 셀프호스팅은 시간~일

---

## 4. 하이브리드 전략

### 4-1. 전략 A: 개발 = Cloud Free, 프로덕션 = Managed Pro/Team

**가장 일반적이고 권장되는 접근법이다.**

```
개발자 로컬 → Supabase CLI (로컬 Docker)
↓
개발/스테이징 → Supabase Cloud Free 티어
↓
프로덕션 → Supabase Cloud Pro/Team
```

**장점:**
- 개발~프로덕션 환경 완전한 기능 일관성
- Database Branching으로 안전한 마이그레이션 테스트
- Vercel/Netlify 등과 CI/CD 연동 최적화
- 팀원 모두가 동일한 Studio 대시보드 사용

**단점:**
- 모든 환경이 Supabase Cloud에 의존
- 데이터가 Supabase 인프라에 보관

---

### 4-2. 전략 B: 개발 = Cloud, 프로덕션 = 셀프호스팅

**데이터 주권, 규정 준수, 비용 최적화를 동시에 추구하는 전략이다.**

```
개발자 로컬 → Supabase CLI
↓
스테이징 → Supabase Cloud Pro (저렴한 환경)
↓
프로덕션 → 셀프호스팅 (자체 서버/Hetzner/AWS)
```

**장점:**
- 개발 편의성(Cloud Studio, Branching) 유지
- 프로덕션 데이터 완전 통제
- 대규모 이그레스 비용 절감
- 규정 요구사항(국내 서버 의무 등) 충족

**단점:**
- 스테이징→프로덕션 환경 차이로 인한 버그 위험
- 셀프호스팅 운영 부담 존재
- 마이그레이션 스크립트를 양 환경에서 검증해야 함

---

### 4-3. 전략 C: 프로젝트별 분리

**여러 서비스를 운영하는 팀에 적합하다.**

```
마케팅 사이트 → Cloud Free (저트래픽)
SaaS 핵심 기능 → Cloud Pro (중요 기능, 지원 필요)
데이터 집약적 배치 → 셀프호스팅 (대량 데이터 처리)
```

이 전략은 서비스별 특성에 맞춰 비용과 운영 부담을 최적화한다. 단, 멀티 환경 관리 복잡도가 증가한다.

---

### 4-4. 전략 D: Managed에서 시작, 셀프호스팅으로 마이그레이션

**스타트업의 성장 경로로 많이 활용된다.**

1. **초기**: Cloud Free/Pro로 빠른 출시
2. **성장기**: Pro → Team 업그레이드
3. **성숙기**: MAU 50만+ 도달 시 TCO 분석 후 마이그레이션 결정
4. **마이그레이션**: pg_dump 또는 Supabase CLI 마이그레이션 도구 활용

> Supabase는 오픈소스이므로 클라우드→셀프호스팅 마이그레이션 경로가 존재한다. 그러나 Branching, 자동 백업 등 Cloud 전용 기능은 셀프호스팅 이후 직접 구현해야 한다.

---

## 5. 의사결정 매트릭스

### 5-1. 핵심 판단 기준

아래 항목에 가중치를 부여하여 판단하라.

| 기준 | Managed 유리 | 셀프호스팅 유리 |
|------|-------------|----------------|
| **팀 규모** | 1~20인 | 50인+ (전담 DevOps 보유) |
| **기술 역량** | PostgreSQL/Docker 전문가 없음 | DBA + DevOps 상시 보유 |
| **예산** | 예산 예측 가능성 중요 | 비용 최소화 최우선 |
| **MAU** | ~50만 | 100만+ |
| **스토리지/이그레스** | 소~중 규모 | 대용량 (수백 GB 이그레스) |
| **데이터 주권** | 요구 없음 | 법적 국내 보관 의무 |
| **컴플라이언스** | SOC2/HIPAA는 Cloud Team/Enterprise | 완전 자체 감사 필요 시 |
| **출시 속도** | 빠른 출시 최우선 | 충분한 준비 시간 있음 |
| **가용성 요구** | 99.9%+ (SLA 필요) | 직접 HA 구성 의향 있음 |
| **커스텀 확장** | 표준 확장으로 충분 | 특수 PostgreSQL 확장 필수 |

---

### 5-2. 시나리오별 권고

#### 1인 개발자 / 사이드 프로젝트
**→ Cloud Free 또는 Pro**
- 운영 부담 없이 빠른 개발에 집중
- Free 플랜으로 충분히 검증 후 성장 시 Pro 전환

#### 초기 스타트업 (팀 2~5인, Seed 단계)
**→ Cloud Pro ($25/월)**
- 제품 시장 적합성(PMF) 탐색 단계에서 인프라에 시간 낭비 금지
- 월 $25는 엔지니어 1시간 인건비보다 저렴

#### 성장 스타트업 (팀 5~20인, Series A)
**→ Cloud Pro/Team**
- MAU 급증 구간에서 안정적인 스케일업 필요
- Team 플랜($599)의 SSO, SOC 2, 28일 로그가 B2B 영업에 유리

#### 중견 팀 (팀 20~50인, 전담 DevOps 보유)
**→ 하이브리드 또는 셀프호스팅 검토 시작**
- TCO 분석 후 결정
- 셀프호스팅 시 Hetzner + Coolify/Dokku로 비용 최적화

#### 대기업 / 데이터 집약 서비스
**→ Enterprise Cloud 또는 완전 셀프호스팅**
- 법적 컴플라이언스, 데이터 주권, SLA 요구가 결정 요인
- BYO Cloud 옵션 (Enterprise 플랜) 검토

---

### 5-3. 규정 요구사항별 가이드

| 규정 | Managed | 셀프호스팅 |
|------|---------|-----------|
| **SOC 2 Type 2** | Team/Enterprise 플랜에서 보고서 제공 | 직접 감사 준비 필요 |
| **HIPAA** | Enterprise + BAA 체결 필요 | 직접 보안 설계 + BAA 불필요 |
| **GDPR** | 리전 선택으로 EU 내 데이터 보관 가능 | 직접 서버 위치 통제 |
| **국내 데이터 보관 의무** | 불가 (현재 한국 리전 없음) | 가능 |
| **ISO 27001** | 미인증 (커뮤니티 요청 중) | 직접 인증 획득 가능 |
| **금융/의료 규제** | 개별 협의 필요 | 직접 설계 |

> **한국 서비스 주의**: 현재 Supabase Cloud에는 한국 리전이 없다. 일부 금융·의료 서비스는 국내 서버 보관이 법적 의무일 수 있으므로, 해당 요구사항이 있는 경우 셀프호스팅이 유일한 선택지다.

---

## 6. 결론 및 권고

### 판단 흐름도

```
Q1. 전담 DevOps/DBA 엔지니어가 있는가?
  NO  → Managed Cloud (종료)
  YES → Q2

Q2. MAU가 50만을 초과하거나 예상되는가?
  NO  → Managed Cloud (종료)
  YES → Q3

Q3. 데이터 주권/법적 국내 보관이 필수인가?
  YES → 셀프호스팅 필수 (종료)
  NO  → Q4

Q4. 월 인프라+운영 비용이 Cloud Enterprise보다 저렴한가?
  YES → 셀프호스팅 고려
  NO  → Enterprise Cloud 협의
```

### 최종 요약

| 규모 | 권고 | 이유 |
|------|------|------|
| 개인/소규모 | **Cloud Free → Pro** | TCO 압도적 우위, 운영 부담 없음 |
| 스타트업 초기 | **Cloud Pro** | 속도 > 비용 최적화 |
| 성장 스타트업 | **Cloud Team** | B2B 컴플라이언스, 자동 스케일 |
| 중견/대기업 | **분석 후 결정** | TCO + 규정 요구사항 종합 판단 |
| 데이터 주권 필수 | **셀프호스팅** | 유일한 선택지 |

> "가장 비싼 선택은 잘못된 인프라에 엔지니어 시간을 쓰는 것이다." — 실제 커뮤니티 피드백

---

## 참고 출처

- [Supabase 공식 요금표](https://supabase.com/pricing)
- [The True Cost of Self-Hosting Supabase — Supascale](https://www.supascale.app/blog/the-true-cost-of-selfhosting-supabase-a-breakdown)
- [Supabase Self-Hosted vs Cloud: Complete Comparison — Supascale](https://www.supascale.app/blog/supabase-selfhosted-vs-cloud-complete-comparison)
- [Supabase Pricing 2026 — CostBench](https://costbench.com/software/database-as-service/supabase/)
- [Supabase Pricing: Real Costs at 10K-100K Users — DesignRevision](https://designrevision.com/blog/supabase-pricing)
- [The Complete Guide to Supabase Pricing — Flexprice](https://flexprice.io/blog/supabase-pricing-breakdown)
- [Self-Hosting Supabase on DigitalOcean — Medium](https://triforce.medium.com/self-hosting-supabase-escaping-the-599-mo-price-tag-on-digitalocean-app-platform-738b83f639a8)
- [Are all features available in self-hosted Supabase? — Supabase Docs](https://supabase.com/docs/guides/troubleshooting/are-all-features-available-in-self-hosted-supabase-THPcqw)
- [Database Backups — Supabase Docs](https://supabase.com/docs/guides/platform/backups)
- [Best PostgreSQL Hosting 2026 — DEV Community](https://dev.to/philip_mcclarence_2ef9475/best-postgresql-hosting-in-2026-rds-vs-supabase-vs-neon-vs-self-hosted-5fkp)
