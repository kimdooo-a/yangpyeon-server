# 가격 비교 매트릭스: BaaS/백엔드 플랫폼 비용 완전 분석

> 작성일: 2026-04-06  
> 비교 대상: Supabase / Firebase / PlanetScale / Neon / Clerk / Vercel  
> 목적: 프로젝트 규모별 현실적인 월 비용 파악 및 비용 최적화 전략

---

## 목차

1. [플랫폼별 무료 티어 한도 비교](#1-플랫폼별-무료-티어-한도-비교)
2. [유료 플랜 기본 가격표](#2-유료-플랜-기본-가격표)
3. [시나리오별 월 비용 시뮬레이션](#3-시나리오별-월-비용-시뮬레이션)
4. [숨겨진 비용 분석](#4-숨겨진-비용-분석)
5. [이그레스(Egress) 비용 비교](#5-이그레스egress-비용-비교)
6. [초과 과금 구조 비교](#6-초과-과금-구조-비교)
7. [필수 애드온 비용](#7-필수-애드온-비용)
8. [비용 최적화 전략](#8-비용-최적화-전략)
9. [TCO(총소유비용) 종합 분석](#9-tco총소유비용-종합-분석)

---

## 1. 플랫폼별 무료 티어 한도 비교

### 1-1. Supabase 무료 티어 (Free Plan)

| 리소스 | 무료 한도 | 초과 시 |
|---|---|---|
| 프로젝트 수 | 2개 | 추가 불가 (유료 전환) |
| 데이터베이스 스토리지 | 500 MB | 무료 초과 시 프로젝트 일시정지 |
| DB Egress (대역폭) | 5 GB/월 | |
| MAU (월간 활성 사용자) | 50,000명 | |
| 파일 스토리지 | 1 GB | |
| 스토리지 Egress | 5 GB/월 | |
| Edge Function 호출 | 500,000회/월 | |
| Realtime 동시 접속 | 200 | |
| 비활성 프로젝트 일시정지 | 7일 미사용 시 자동 정지 | 재시작 수동 |
| 고객 지원 | 커뮤니티만 | |

> **주의**: 7일 비활성 시 자동 정지 정책으로 프리 티어는 프로덕션 사용 부적합

### 1-2. Firebase 무료 티어 (Spark Plan)

| 리소스 | 무료 한도 | 초과 시 |
|---|---|---|
| Firestore 문서 읽기 | 50,000회/일 | 당일 서비스 차단 |
| Firestore 문서 쓰기 | 20,000회/일 | 당일 서비스 차단 |
| Firestore 문서 삭제 | 20,000회/일 | 당일 서비스 차단 |
| Firestore 저장 용량 | 1 GB | |
| Firebase Storage | 5 GB | |
| Storage 다운로드 | 1 GB/일 | |
| Hosting (스토리지) | 10 GB | |
| Hosting (전송량) | 360 MB/일 | |
| Authentication MAU | 무제한 (Google 제공) | |
| Cloud Functions | Blaze 플랜만 (무료 불가) | 전화 인증도 Blaze 필요 |
| RTDB (Realtime DB) | 동시 접속 100명 | |
| RTDB 저장 용량 | 1 GB | |

> **주의**: 일별 초과 시 해당 서비스가 월말까지 차단됨. Cloud Functions는 Spark에서 전혀 사용 불가 (2026년 정책 변경)

### 1-3. PlanetScale 플랜 (2026 기준)

| 플랜 | 가격 | 스토리지 | 행 읽기/쓰기 |
|---|---|---|---|
| Hobby (폐지됨) | ~~무료~~ | N/A | N/A |
| Scaler | $29/월 | 10 GB | 1B 읽기 / 10M 쓰기 |
| Scaler Pro (ps_5) | $15/월 (단일 인스턴스) | 10 GB | 무제한 (리소스 제한) |
| Metal HA | $50/월 | 10 GB | 무제한 |

> **주의**: PlanetScale은 2024년에 무료 티어를 완전히 폐지. 최소 $15/월부터 시작.

### 1-4. Neon 무료 티어 (Free Plan)

| 리소스 | 무료 한도 |
|---|---|
| 프로젝트 수 | 1개 |
| 브랜치 수 | 10개 |
| 스토리지 | 0.5 GB |
| 컴퓨트 (CU-hours/월) | 100 CU-hours |
| 최대 컴퓨트 크기 | 2 vCPU / 8 GB RAM |
| 자동 스케일-투-제로 | ✅ (아이들 시 자동 중지) |
| 신용카드 불필요 | ✅ |
| 만료 기간 | 없음 (영구 무료) |
| 상업적 사용 | ✅ 허용 |

> 2025년 10월 Neon이 Databricks에 인수된 후 무료 CU-hours를 50 → 100으로 2배 증가

### 1-5. Clerk 무료 티어 (Free Plan)

| 리소스 | 무료 한도 |
|---|---|
| MAU (월간 활성 사용자) | 50,000명 (2026년 10K → 50K로 증가) |
| 애플리케이션 수 | 무제한 |
| 소셜 로그인 | ✅ |
| 이메일/비밀번호 | ✅ |
| MFA | ✅ |
| SAML SSO | ❌ (Pro만) |
| 조직 수 | 100개까지 무료 |
| 커스텀 도메인 | ❌ (Pro만) |

### 1-6. Vercel 무료 티어 (Hobby Plan)

| 리소스 | 무료 한도 |
|---|---|
| 대역폭 | 100 GB/월 |
| 빌드 시간 | 6,000분/월 |
| Edge Function 실행 | 500,000회/월 |
| Serverless Function 실행 시간 | 100GB-시간/월 |
| 팀원 수 | 1명 (개인만) |
| 커스텀 도메인 | ✅ |
| 분석 | 기본 |
| Edge Config 읽기 | 500,000회/월 |
| 초과 시 처리 | 초과 없이 서비스 일시 중단 |

---

## 2. 유료 플랜 기본 가격표

### 2-1. Supabase 유료 플랜

| 플랜 | 월 기본 요금 | 포함 리소스 | 추가 비용 |
|---|---|---|---|
| **Pro** | $25/월 | DB 8GB, 스토리지 100GB, MAU 100K, Egress 250GB | DB: $0.125/GB, 스토리지: $0.021/GB, Egress: $0.09/GB |
| **Team** | $599/월 | Pro 전체 + 팀 협업 도구, SOC2 리포트, 우선 지원 | 사용량 초과분 별도 |
| **Enterprise** | 협의 | 커스텀 SLA, 전용 VPC, 99.9% SLA | 커스텀 |

**Pro 플랜 주요 추가 비용**

| 항목 | 단가 |
|---|---|
| 추가 DB 스토리지 (GB/월) | $0.125 |
| 추가 파일 스토리지 (GB/월) | $0.021 |
| 추가 Egress (GB) | $0.09 |
| 읽기 복제본 (노드당/월) | $25 |
| 컴퓨트 업그레이드 (small) | +$10/월 |
| 컴퓨트 업그레이드 (medium) | +$50/월 |
| 컴퓨트 업그레이드 (large) | +$100/월 |
| 브랜칭 (Supabase Branches) | $0.32/일 |

### 2-2. Firebase 유료 플랜 (Blaze - 종량제)

Blaze는 기본 요금 없이 사용량만큼 과금하되, Spark 무료 한도는 유지

| 서비스 | 무료 한도 포함 | 초과 단가 |
|---|---|---|
| Firestore 저장 용량 | 1 GB | $0.18/GB/월 |
| Firestore 문서 읽기 | 50K/일 | $0.06 / 100K 건 |
| Firestore 문서 쓰기 | 20K/일 | $0.18 / 100K 건 |
| Firestore 문서 삭제 | 20K/일 | $0.02 / 100K 건 |
| Firestore Egress | 10 GB/월 | $0.12/GB (미국) / $0.21/GB (아시아) |
| Firebase Storage | 5 GB | $0.026/GB/월 |
| Storage 다운로드 | 1 GB/일 | $0.12/GB |
| Cloud Functions | 2M 호출/월 | $0.0000004/호출 |
| Functions 컴퓨트 | 400K GB-초/월 | $0.0000025/GB-초 |
| Authentication MAU | 10K/월 | $0.0055/MAU |
| 전화 인증 | 10K/월 | $0.006/SMS |
| Hosting | 10 GB 스토리지, 360 MB/일 | $0.026/GB 스토리지, $0.15/GB 전송 |

### 2-3. PlanetScale 유료 플랜

| 플랜 | 월 요금 | 스토리지 | 특징 |
|---|---|---|---|
| ps_5 (Scaler) | $15/월 | 10 GB | 단일 리전, 기본 HA |
| Metal HA | $50/월 | 10 GB | 3노드 고가용성 클러스터 |
| Enterprise | 협의 | 커스텀 | 커스텀 리소스 |
| 추가 스토리지 | $0.50/GB/인스턴스/월 | — | |

### 2-4. Neon 유료 플랜

| 플랜 | 월 기본 요금 | 컴퓨트 포함 | 스토리지 포함 |
|---|---|---|---|
| **Launch** | $19/월 | 300 CU-hours | 10 GB |
| **Scale** | $69/월 | 750 CU-hours | 50 GB |
| **Business** | $700/월 | 1,000 CU-hours | 500 GB |
| **Enterprise** | 협의 | 커스텀 | 커스텀 |

**Neon 추가 비용**

| 항목 | 단가 (2026 기준 - 2025년 말 인하 후) |
|---|---|
| 추가 컴퓨트 (CU-hour) | $0.16 (기존 $0.23에서 인하) |
| 추가 스토리지 (GB/월) | $0.35 (기존 $1.75에서 대폭 인하) |
| 데이터 전송 (GB) | $0.09 |

### 2-5. Clerk 유료 플랜

| 플랜 | 월 기본 요금 | 포함 MAU | 초과 MAU |
|---|---|---|---|
| **Free** | $0 | 50,000 | 업그레이드 필요 |
| **Pro** | $25/월 | 10,000 | $0.02/MAU |
| **B2B 애드온** | +$100/월 | — | 조직 기능 |
| **Enterprise** | 협의 | 커스텀 | 커스텀 |

> 주의: Pro $25에는 10K MAU만 포함. 50K MAU까지는 추가로 $0.02 × 40K = $800 → 사실상 Free 티어 50K MAU가 훨씬 유리

### 2-6. Vercel 유료 플랜

| 플랜 | 월 요금 | 대역폭 | 팀원 수 |
|---|---|---|---|
| **Hobby** | $0 | 100 GB | 1명 |
| **Pro** | $20/인/월 | 1 TB | 무제한 |
| **Enterprise** | 협의 | 커스텀 | 무제한 |

**Vercel Pro 추가 비용**

| 항목 | 단가 |
|---|---|
| 추가 대역폭 (GB) | $0.15 |
| 추가 Edge 요청 (백만 건) | $2.00 |
| 추가 빌드 시간 (분) | $0.005 |
| Serverless Function 실행 (GB-시간) | $0.18 |

---

## 3. 시나리오별 월 비용 시뮬레이션

### 시나리오 A: 개인 프로젝트 (소규모)

**가정**: MAU 500명, DB 1GB, 파일 200MB, 월간 API 호출 10만 건, Edge Function 5만 건

| 플랫폼 | 구성 | 예상 월 비용 | 비고 |
|---|---|---|---|
| **Supabase Free** | 무료 플랜 | $0 | 비활성 7일 정지 주의 |
| **Supabase Pro** | 기본 Pro | $25 | 모든 한도 여유 |
| **Firebase Spark** | 무료 플랜 | $0 | Functions 불가 |
| **Firebase Blaze** | 최소 사용 | ~$1~3 | 사용량 매우 낮음 |
| **Neon Free** | 무료 플랜 | $0 | 0.5GB 스토리지 제한 |
| **Neon Launch** | $19 플랜 | $19 | DB만 (Auth 별도 필요) |
| **PlanetScale** | ps_5 | $15 | DB만, Auth 없음 |
| **Clerk Free** | 무료 플랜 | $0 | 500명은 무료 한도 내 |
| **Vercel Hobby** | 무료 플랜 | $0 | 개인 사용 |

**추천 스택 (무료 최적화)**
```
Vercel Hobby (호스팅, $0)
+ Neon Free (DB, $0)  
+ Clerk Free (Auth, $0)
= 총 $0/월
```

**추천 스택 (단순성 최적화)**
```
Supabase Free → Pro ($25)
= 총 $0~25/월 (DB+Auth+Storage+Functions 올인원)
```

---

### 시나리오 B: 스타트업 MVP (중규모)

**가정**: MAU 5,000명, DB 8GB, 파일 스토리지 20GB, 월간 Egress 50GB, Edge Functions 50만 건, Realtime 동시 100명

| 플랫폼 | 구성 | 예상 월 비용 | 상세 계산 |
|---|---|---|---|
| **Supabase Pro** | Pro 기본 | $25 | 모든 수치 기본 한도 내 (DB 8GB, 스토리지 100GB, MAU 100K) |
| **Firebase Blaze** | 종량제 | ~$15~30 | Firestore 읽기 5M 건(월)/쓰기 2M 건 + Storage 20GB + Functions |
| **Neon Launch + Clerk Free + Vercel Pro** | 분리 스택 | $19+$0+$20 = $39 | DB+Auth+호스팅 별도 |
| **PlanetScale Metal HA + Clerk + Vercel** | 분리 스택 | $50+$0+$20 = $70 | 고가용성 DB |
| **Amplify (AWS)** | Pay-as-go | ~$30~60 | AppSync + Cognito + S3 + Lambda |

**Supabase Pro 상세 계산 (시나리오 B)**
```
기본 요금:             $25.00
DB 스토리지 8GB:       포함 ($0)
파일 스토리지 20GB:    포함 ($0, 100GB 포함)
Egress 50GB:          포함 ($0, 250GB 포함)
MAU 5,000명:          포함 ($0, 100K 포함)
소계:                 $25/월
```

**Firebase Blaze 상세 계산 (시나리오 B)**
```
Firestore 읽기 5M건/월: (5M-1.5M무료)/100K × $0.06 = $2.10
Firestore 쓰기 2M건/월: (2M-600K무료)/100K × $0.18 = $2.52
Firestore 저장 8GB:     (8-1)GB × $0.18 = $1.26
Storage 20GB:           (20-5)GB × $0.026 = $0.39
Storage 다운로드 50GB:  (50-30무료)GB × $0.12 = $2.40
Functions 50만건:       포함 (무료 한도)
소계:                  ~$8.67/월
```

> Firebase가 낮아 보이지만, MAU 5K 수준의 실 서비스에서는 Firestore 읽기/쓰기가 예상보다 빠르게 증가함

---

### 시나리오 C: 성장기 SaaS (대규모)

**가정**: MAU 50,000명, DB 100GB, 파일 스토리지 1TB, 월간 Egress 5TB, Edge Functions 1천만 건, Realtime 동시 2,000명, 팀 5명

| 플랫폼 | 구성 | 예상 월 비용 | 상세 |
|---|---|---|---|
| **Supabase Pro (확장)** | Pro + 추가 리소스 | ~$550~900 | 아래 상세 참조 |
| **Supabase Team** | Team 플랜 | $599 + 초과분 | 팀 협업 + 우선 지원 포함 |
| **Firebase Blaze** | 종량제 | ~$300~600 | 트래픽에 따라 편차 큼 |
| **AWS Amplify 풀스택** | 다양한 AWS 서비스 | ~$400~1,000 | 운영 복잡도 높음 |
| **Neon Scale + Clerk Pro + Vercel Pro** | 분리 스택 | $69+$25+(5명×$20) = $194 + 초과분 | DB/Auth/호스팅 최적화 |

**Supabase Pro 상세 계산 (시나리오 C)**
```
기본 요금:                            $25.00
추가 DB 스토리지 (100-8)GB×$0.125:   $11.50
추가 파일 스토리지 (1024-100)GB×$0.021: $19.40
추가 Egress (5000-250)GB×$0.09:      $427.50
추가 MAU (50K-100K):                  포함 ($0)
읽기 복제본 1개:                      $25.00
컴퓨트 업그레이드 (large):            $100.00
소계:                                ~$608/월
```

**Firebase Blaze 상세 계산 (시나리오 C)**
```
Firestore 읽기 100M건/월:    (100M-1.5M)/100K × $0.06 = $58.71
Firestore 쓰기 30M건/월:     (30M-600K)/100K × $0.18 = $52.92
Firestore 저장 100GB:        (100-1)GB × $0.18 = $17.82
Storage 1TB:                 (1024-5)GB × $0.026 = $26.49
Storage 다운로드 5TB:        (5000-30)GB × $0.12 = $596.40
Functions 1천만건:            (10M-2M)/1M × $0.40 = $3.20
Auth MAU 50K:                (50K-10K) × $0.0055 = $220.00
소계:                        ~$975/월
```

> Egress 비용이 최대 변수. Firebase Storage 다운로드가 $596로 압도적. CDN 캐싱 전략이 필수.

**Neon + Clerk + Vercel 분리 스택 (시나리오 C)**
```
Neon Scale (50GB 포함):              $69.00
추가 스토리지 (100-50)GB×$0.35:     $17.50
추가 컴퓨트 초과분 (대략):           ~$30.00
Clerk Pro (10K MAU 포함):            $25.00
추가 MAU (50K-10K)×$0.02:           $800.00 ← 고비용 주의
Vercel Pro (5명×$20):                $100.00
추가 대역폭 (5TB-5TB×1GB×5명):       별도
소계:                               ~$1,041/월 (Clerk 비용 폭증)
```

> Clerk은 대용량 MAU에서 비용이 급증. 50K MAU는 Free 티어로 처리하고 Pro로 전환 시 MAU 과금 주의.

---

## 4. 숨겨진 비용 분석

### 4-1. Supabase 숨겨진 비용

| 항목 | 내용 | 예상 비용 |
|---|---|---|
| **Egress 비용 폭탄** | 대용량 파일 서빙 시 $0.09/GB 급증 | 1TB Egress = $90 추가 |
| **컴퓨트 업그레이드** | Pro 기본 컴퓨트는 매우 낮음 (shared CPU, 0.5GB RAM) | +$10~$100+/월 |
| **읽기 복제본** | 고가용성 위해 복제본 추가 시 | +$25/복제본/월 |
| **프로젝트 정지 재시작** | 프리 티어 7일 정지 → 재시작 시 콜드 스타트 | 운영 영향 |
| **Supabase Branches** | 개발/스테이징 환경 분기 | $0.32/일/브랜치 = ~$9.60/월 |
| **Vector (pgvector)** | Pro에서 pgvector 사용 시 추가 컴퓨트 필요 | +$50~$100/월 |
| **Log 보존** | 로그 보존 기간 연장 | 별도 요금 |

### 4-2. Firebase 숨겨진 비용

| 항목 | 내용 | 예상 비용 |
|---|---|---|
| **데이터 Egress (아시아 리전)** | 아시아 리전 Egress는 미국의 1.75배 | 100GB = $21 (아시아) vs $12 (미국) |
| **Cloud Functions 컴퓨트** | 메모리×실행시간으로 계산 | 1M 호출 × 256MB × 200ms = ~$0.50 |
| **전화 인증 SMS** | Blaze 필요 + SMS 비용 | $0.006/SMS |
| **Firebase ML** | 비전/텍스트 API 사용 시 | 추가 GCP 비용 |
| **Realtime DB 대역폭** | RTDB 다운로드 별도 과금 | $1/GB |
| **Firebase Hosting 초과** | CDN 전송량 초과 | $0.15/GB |
| **Google Cloud Logging** | Functions 로그 장기 보존 | $0.01/GB (첫 50GB 무료) |
| **App Check** | 앱 검증 서비스 | 무료 (현재) |
| **냉각 비용** | 콜드 스타트로 인한 지연이 사용자 이탈로 이어질 수 있음 | 매출 기회비용 |

### 4-3. Neon 숨겨진 비용

| 항목 | 내용 | 예상 비용 |
|---|---|---|
| **콜드 스타트 지연** | Scale-to-zero 후 재시작 시 1~3초 지연 | UX 영향 |
| **컴퓨트 낭비** | 브랜치별로 각각 컴퓨트 소비 | 다수 브랜치 시 CU-hours 증가 |
| **데이터 전송** | 리전 간 데이터 전송 | $0.09/GB |

### 4-4. Clerk 숨겨진 비용

| 항목 | 내용 | 예상 비용 |
|---|---|---|
| **MAU 과금 폭탄** | Pro에서 10K 초과 후 $0.02/MAU | 100K MAU = $1,800/월 |
| **B2B 애드온** | 조직 기능 사용 시 | +$100/월 |
| **SAML SSO** | Enterprise SSO 필요 시 | Pro 이상 필요 |
| **커스텀 도메인** | 화이트라벨링 | Pro 이상 필요 |

### 4-5. Vercel 숨겨진 비용

| 항목 | 내용 | 예상 비용 |
|---|---|---|
| **대역폭 초과** | 1TB 초과 시 $0.15/GB | 1TB 초과 시 급증 |
| **Edge Config** | 500K 이상 읽기 | $0.50/100만 건 |
| **분석 Pro** | 고급 분석 기능 | 별도 요금 |
| **보안 헤더** | Vercel Firewall | Pro 이상 |
| **팀원 추가** | 팀원당 $20/월 | 5명 팀 = $100/월 기본 |

---

## 5. 이그레스(Egress) 비용 비교

이그레스는 서버에서 클라이언트로 전송되는 데이터 비용으로, 대용량 미디어 서비스에서 가장 큰 비용 항목

| 플랫폼 | 서비스 | 무료 한도 | 초과 단가 (미국) | 초과 단가 (아시아) |
|---|---|---|---|---|
| Supabase | DB Egress | 5 GB (Free) / 250 GB (Pro) | $0.09/GB | $0.09/GB |
| Supabase | Storage Egress | 5 GB (Free) / 250 GB (Pro) | $0.09/GB | $0.09/GB |
| Firebase | Firestore Egress | 10 GB/월 | $0.12/GB | $0.21/GB |
| Firebase | Storage 다운로드 | 1 GB/일 (30GB/월) | $0.12/GB | $0.21/GB |
| Firebase | Hosting CDN | 360MB/일 (약 11GB/월) | $0.15/GB | $0.15/GB |
| Neon | 데이터 전송 | — | $0.09/GB | $0.09/GB |
| Vercel | 대역폭 | 100 GB (Hobby) / 1 TB (Pro) | $0.15/GB | $0.15/GB |
| AWS (Amplify) | CloudFront CDN | 1 TB/월 (무료 12개월) | $0.0085~$0.12/GB | $0.12~$0.19/GB |

**이그레스 비용 절감 전략**

1. **CDN 적극 활용**: Cloudflare Free CDN을 앞단에 배치하면 원본 Egress를 90% 이상 절감 가능
2. **Firebase Storage → Cloudflare R2 마이그레이션**: Cloudflare R2는 Egress 무료. 대용량 파일은 R2 권장
3. **Supabase Storage + Cloudflare CDN**: Supabase Storage를 Cloudflare로 프록시 시 Egress 절감

---

## 6. 초과 과금 구조 비교

### 6-1. 초과 과금 방식 비교

| 플랫폼 | 초과 과금 방식 | 알림 제공 | 상한선 설정 |
|---|---|---|---|
| Supabase | 월말 정산 (청구서) | ✅ 이메일 알림 | ⚠️ 예산 알림만 |
| Firebase | 일별 초과 시 서비스 차단 (Spark) / 즉시 과금 (Blaze) | ✅ GCP 예산 알림 | ✅ 지출 한도 설정 가능 |
| PlanetScale | 월말 정산 | ✅ | ✅ |
| Neon | 월말 정산 (usage-based) | ✅ | ✅ |
| Clerk | 월말 정산 | ✅ | ⚠️ |
| Vercel | 초과 시 서비스 일시 중단 (Hobby) / 자동 과금 (Pro) | ✅ | ✅ Pro에서 설정 |

### 6-2. 예상치 못한 비용 발생 시나리오

**시나리오: 바이럴 트래픽 (트래픽 100배 급증)**

| 플랫폼 | 24시간 100배 트래픽 예상 추가 비용 |
|---|---|
| Supabase Pro | ~$50~200 (Egress 위주) |
| Firebase Blaze | ~$100~500 (읽기 + Egress) |
| Vercel Pro | ~$50~150 (대역폭 위주) |
| Neon | ~$20~50 (컴퓨트 위주) |
| Clerk | 트래픽 급증 = 신규 MAU 아니면 과금 없음 |

---

## 7. 필수 애드온 비용

실제 서비스 운영 시 추가로 필요한 서비스 비용

### 7-1. 실제 서비스 운영 필수 스택

**Supabase 기반 스타트업 MVP**

| 서비스 | 역할 | 월 비용 |
|---|---|---|
| Supabase Pro | DB + Auth + Storage + Functions | $25 |
| Vercel Pro (1인) | 호스팅 | $20 |
| Resend | 이메일 발송 (3,000/월 무료) | $0~$20 |
| Cloudflare | DNS + CDN + DDoS 보호 | $0 (무료 플랜) |
| **소계** | | **$45~65/월** |

**Firebase 기반 스타트업 MVP**

| 서비스 | 역할 | 월 비용 |
|---|---|---|
| Firebase Blaze | DB + Auth + Storage + Functions | ~$10~30 |
| Vercel Pro (1인) | 호스팅 | $20 |
| SendGrid | 이메일 발송 (100/일 무료) | $0~$15 |
| Cloudflare | DNS + CDN | $0 |
| **소계** | | **$30~65/월** |

**분리 스택 (Neon + Clerk + Vercel)**

| 서비스 | 역할 | 월 비용 |
|---|---|---|
| Neon Launch | PostgreSQL DB | $19 |
| Clerk Free | Auth (50K MAU) | $0 |
| Vercel Pro (1인) | 호스팅 | $20 |
| Cloudflare R2 | 파일 스토리지 (Egress 무료) | $0.015/GB/월 |
| Resend | 이메일 | $0 |
| **소계** | | **$39/월** (스토리지 제외) |

---

## 8. 비용 최적화 전략

### 8-1. Supabase 비용 최적화

**1. 프리 티어 7일 정지 방지**
```bash
# GitHub Actions로 매 6일마다 ping 보내기 (Cron)
# .github/workflows/supabase-ping.yml
on:
  schedule:
    - cron: '0 12 */6 * *'  # 6일마다 정오
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -s ${{ secrets.SUPABASE_URL }}/rest/v1/ > /dev/null
```

**2. Egress 최소화**
- Supabase Storage 파일을 Cloudflare CDN으로 서빙 (Transform Rules 활용)
- 자주 읽는 데이터는 엣지 캐시 또는 Redis 레이어 추가
- 이미지는 WebP 변환 후 저장 (파일 크기 50~70% 절감)

**3. 컴퓨트 최적화**
- Connection Pooler (Supavisor) 설정으로 DB 연결 수 최적화
- Pro 기본 컴퓨트(0.5 vCPU, 1GB RAM)로 충분한 아키텍처 설계
- Edge Functions 활용으로 DB 직접 호출 최소화

**4. 스토리지 최적화**
- Supabase Storage → Cloudflare R2로 대용량 파일 이전
- Supabase는 메타데이터 + 소형 파일만 유지

### 8-2. Firebase 비용 최적화

**1. Firestore 읽기 최소화**
```javascript
// Bad: 매번 전체 쿼리
const docs = await getDocs(collection(db, 'products'));

// Good: 캐시 활용 + 페이지네이션
const q = query(collection(db, 'products'), 
  limit(20), 
  startAfter(lastDoc)
);
// 오프라인 캐시 활성화
enableMultiTabIndexedDbPersistence(db);
```

**2. Firebase Storage Egress 최소화**
- 대용량 파일은 Cloudflare R2로 이전
- Firebase Storage URL에 Cloudflare 프록시 적용

**3. Cloud Functions 비용 최소화**
- Cold Start 최소화: 최소 인스턴스 1개 유지 (`minInstances: 1`)
- 메모리 최소화: 128MB로 시작, 필요 시 증가
- Gen2 Functions 사용으로 실행 효율 개선

**4. 비용 알림 설정 (필수)**
```
GCP Console → Billing → Budgets & alerts
→ 월 예산 $50 설정 → 80%, 100% 도달 시 이메일 알림
```

### 8-3. Neon 비용 최적화

**1. Scale-to-Zero 적극 활용**
- 개발/스테이징 환경은 Scale-to-Zero로 CU-hours 절약
- 프로덕션은 최소 컴퓨트 유지로 콜드 스타트 방지

**2. 브랜치 활용 최적화**
```
main (프로덕션)     → 항상 활성
staging             → Scale-to-Zero
dev-feature-*       → 필요 시만 활성화, 사용 후 삭제
```

**3. 스토리지 최적화**
- Neon 스토리지는 $0.35/GB (2026 인하 후) — 경제적
- 큰 blob은 외부 스토리지(R2, S3)로 분리

### 8-4. 전체 스택 비용 최적화 원칙

| 원칙 | 실천 방법 |
|---|---|
| **CDN 우선** | 모든 정적 자산과 파일은 CDN으로 서빙 → Egress 90% 절감 |
| **무료 티어 조합** | 각 서비스의 무료 한도를 조합해 $0 스택 구성 |
| **Egress 제로 서비스 활용** | Cloudflare R2 (Egress 무료), Cloudflare Workers (Egress 없음) |
| **MAU 기준 플랜 선택** | Clerk처럼 MAU 기반 과금 서비스는 무료 한도 내에서 최대한 활용 |
| **모니터링 자동화** | 예산 알림 설정 → 비용 폭탄 예방 |
| **읽기 캐시** | Redis/Upstash 등 인메모리 캐시로 DB 쿼리 수 최소화 |

---

## 9. TCO(총소유비용) 종합 분석

### 9-1. 규모별 연간 비용 비교 요약

| 시나리오 | Supabase | Firebase | 분리 스택 (Neon+Clerk+Vercel) | AWS Amplify |
|---|---|---|---|---|
| 개인 프로젝트 | $0~$300/년 | $0~$36/년 | $0~$468/년 | $0~$120/년 |
| 스타트업 MVP | $300~$600/년 | $180~$360/년 | $468~$936/년 | $360~$720/년 |
| 성장기 SaaS | $6,500~$11,000/년 | $3,600~$7,200/년 | $2,500~$15,000/년 | $5,000~$12,000/년 |

### 9-2. 숨겨진 비용 포함 TCO

단순 클라우드 비용 외에 고려해야 할 TCO 항목:

| 비용 항목 | Supabase | Firebase | AWS Amplify | Appwrite(셀프) |
|---|---|---|---|---|
| 초기 셋업 시간 (인건비) | 낮음 (1~2시간) | 낮음 (1~2시간) | 높음 (8~40시간) | 중간 (2~8시간) |
| 운영 복잡도 (인건비) | 낮음 | 낮음 | 높음 | 중간 |
| 벤더 종속 탈출 비용 | 낮음 (PostgreSQL 표준) | 높음 (독점 API) | 매우 높음 | 없음 |
| 데이터 마이그레이션 비용 | 낮음 | 높음 | 높음 | 낮음 |
| 학습 비용 | 낮음 | 중간 | 매우 높음 | 중간 |
| 서버 비용 (셀프호스팅) | 월 $10~50 (VPS) | 해당 없음 | 해당 없음 | 월 $5~20 (VPS) |

### 9-3. 최종 비용 효율 추천

**MAU 50K 이하 스타트업**: Supabase Pro ($25/월) - 올인원, 최소 관리 비용
**MAU 50K~500K 성장기**: Supabase Team ($599) vs Firebase Blaze + CDN 최적화 비교 필요
**대용량 파일 서비스**: Firebase + Cloudflare R2 또는 AWS S3 + CloudFront
**AI/벡터 서비스**: Supabase (pgvector 통합으로 별도 벡터 DB 비용 절감)
**완전 무료 개인 프로젝트**: Neon Free + Clerk Free + Vercel Hobby = $0/월

---

*참고 출처: Supabase 공식 가격 페이지, Firebase 공식 가격 페이지, PlanetScale 공식 가격 페이지, Neon 공식 가격 페이지, Clerk 공식 가격 페이지, Vercel 공식 가격 페이지, UI Bakery Blog, CheckThat.ai, DesignRevision.com (2026-04 기준)*
