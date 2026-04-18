# 00. 제품 비전서 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> Wave 3 · V1 산출물 — kdywave W3-V1 (Agent Vision-1)
> 작성일: 2026-04-18 (세션 26)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [00-vision/](./) → **이 문서**
> 참조: [README.md](../README.md) (마스터 인덱스) · [_CHECKPOINT_KDYWAVE.md](../_CHECKPOINT_KDYWAVE.md) (스코어링 + DQ 현황)

---

## 목차

- [A1. 비전 선언문](#a1-비전-선언문)
- [A2. 문제 정의](#a2-문제-정의)
- [A3. 타겟 사용자](#a3-타겟-사용자)
- [A4. 핵심 가치 제안](#a4-핵심-가치-제안)
- [A5. 경쟁 환경](#a5-경쟁-환경)
- [A6. 성공 지표 (KPIs)](#a6-성공-지표-kpis)
- [A7. 제품 원칙](#a7-제품-원칙)
- [부록 Z. Wave 1-2 근거 인덱스](#부록-z-wave-1-2-근거-인덱스)

---

## A1. 비전 선언문

### A1.1 한 문장 슬로건

**"양평 부엌 서버 대시보드는 1인 개발자/운영자가 Supabase Cloud 의존과 월 수십 달러의 과금 부담·데이터 주권 상실 문제를 Next.js 16 네이티브 통합 + 자체호스팅 100점 동등성 + 월 운영비 $10 이하라는 가치로 해결하는 자체호스팅 관리형 백엔드 대시보드이다."**

서브 슬로건 2종 (맥락별 사용):

- 단문형: **"Self-hosted Supabase, made for one."** — 1인이 운영하고, 1인이 소유한다.
- 원칙형: **"기존 자산 보존 + 외부 패턴 학습 자체구현."** — Wave 1 Compound Knowledge에서 도출된 운영 철학.

### A1.2 상세 설명 — 왜 자체호스팅 Supabase 클론인가 (1문단)

2024년 이후 Supabase는 Postgres 기반 BaaS 시장의 de facto 표준이 되었지만, 그 편의성의 대가로 사용자는 (1) 트래픽·DB 용량에 비례한 지속적 과금, (2) 고객 데이터가 Supabase가 선택한 AWS/Fly 리전에 머무르는 데이터 주권 의존, (3) PostgreSQL 확장·커널·JWT 구조의 "Supabase가 허용한 만큼"의 커스터마이징 한계, (4) `supabase-js`·`gotrue`·`storage-api`·`realtime` 등 수평 분할된 8~10개 서비스의 조합 복잡도를 감수해야 한다. `stylelucky4u.com`은 이 4중 부담을 1인 운영자가 단일 서버(WSL2 Ubuntu + PM2 + Cloudflare Tunnel) 위에서 Next.js 16 단일 코드베이스로 재구성한 결과물이다. PostgreSQL/Prisma 7을 단일 진실의 소스로 두고, 그 위에 Table Editor / SQL Editor / Schema Visualizer / Auth / Storage / Edge Functions / Realtime / Advisors / Data API / Observability / UX Assistant / Operations의 14개 카테고리를 각각 Wave 1-2 리서치로 검증된 최적 OSS 또는 패턴 차용 자체구현으로 대체한다. 결과물은 "Supabase Studio를 열었을 때의 운영 경험"을 `stylelucky4u.com` 도메인에서 100% 재현하되, 데이터·JWT 서명 키·파일 업로드·WAL 아카이브 전부가 내 디스크와 내 Cloudflare 터널 뒤에 머무른다.

### A1.3 3-5년 비전 (1문단)

6개월(2026-10)까지는 Supabase parity 평가 85+/100에 도달하여 "내가 Supabase Cloud에서 하던 일의 85%를 나의 양평 대시보드에서 더 편하게 한다"는 주관적 확신을 확보하는 것이 목표다. 12개월(2027-04)까지는 14개 카테고리 전부가 Wave 1-2에서 산정한 100점 청사진을 달성하여, Table Editor의 인라인 편집·SQL Editor의 AI Assistant·Schema Viz의 RLS 에디터·Realtime의 wal2json 브로드캐스트·Edge Functions의 isolated-vm 실행·Storage의 SeaweedFS 업로드가 Supabase Cloud의 동일 기능 대비 기능적으로 "동등 이상 또는 동등 미만 5% 이내"임을 자체 체크리스트로 검증한다. 24개월(2028-04)에는 (a) 오픈소스 릴리스(MIT/Apache-2.0 이중 라이선스 검토), (b) `stylelucky4u.com` 운영 경험을 기반으로 한 "1인 자체호스팅 운영 가이드" 문서화, (c) 커뮤니티 기여(splinter TS 포팅, supabase-studio 패턴 인용 PR 등)의 3단계로 외부 기여 방향을 검토한다. 3-5년 비전의 핵심은 "Supabase를 이기는 것"이 아니라 "Supabase에 의존하지 않을 자유를 1인 개발자에게 돌려주는 것"이다.

### A1.4 Supabase Cloud와의 근본적 차이 (표)

| 차원 | Supabase Cloud | 양평 부엌 서버 대시보드 |
|------|---------------|------------------------|
| **배포 모델** | 멀티테넌트 SaaS (8~10 마이크로서비스) | 자체호스팅 모놀리스 (Next.js 16 단일 앱 + PostgreSQL/SQLite) |
| **데이터 위치** | Supabase 선택 리전(AWS/Fly) | 운영자 로컬 디스크 (WSL2 / Cloudflare Tunnel 뒤) |
| **과금 모델** | Usage-based ($25/월 Pro + DB/Storage/Egress 초과) | 월 $10 이하 고정 (전기세 + 도메인 + B2 백업 + AI API BYOK) |
| **JWT 서명 키** | Supabase Vault 관리 (JWKS 공개 전 SUPERUSER 필요) | 운영자 로컬 `/etc/luckystyle4u/secrets.env` (MASTER_KEY, root:ypb-runtime 0640) |
| **확장 허용** | Supabase가 허용한 확장 + 고정 버전 | PostgreSQL 17 직접 설치, 확장 무제한 (pgmq/wal2json/pg_graphql 등 운영자 선택) |
| **코드 통합** | `@supabase/supabase-js` SDK + 별도 Next.js 앱 | Next.js 16 App Router 내부 API Route + Server Component 직접 호출 |
| **커스터마이징** | Dashboard는 사실상 블랙박스 | 100% 오픈 (Supabase Studio Apache-2.0 패턴 흡수 + 자체 UI) |
| **Multi-tenancy** | 조직(Organization) / 프로젝트 필수 2계층 | **의도적 제외** — 1명의 운영자 = 1개 대시보드 |
| **백업** | 자동(PITR Pro+만) | `wal-g` + Backblaze B2 원격 (RPO 60초, RTO 30분) |
| **업그레이드 경로** | Supabase가 결정 | 운영자가 Next.js 16 / PostgreSQL 17 / Prisma 7 업그레이드 타이밍 통제 |

→ 이 표의 모든 행이 "양평 대시보드가 Supabase Cloud의 기능을 포기하지 않으면서 소유권과 통제권을 되찾는다"를 입증한다.

---

## A2. 문제 정의

### A2.1 1인 운영자의 Pain Points (7개)

#### P1. Supabase Cloud 비용의 예측 불가능성

- **현상**: Supabase Pro $25/월 시작, DB 8GB 초과 $0.125/GB, Egress 250GB 초과 $0.09/GB, Storage 100GB 초과 $0.021/GB → 작은 프로젝트도 트래픽 급증 시 $100+/월 가능.
- **1인 운영 영향**: 매달 청구서가 불안정하면 사이드 프로젝트 경제성이 무너진다. 운영자가 "트래픽이 와도 반갑지 않은" 역설적 상태에 빠진다.
- **양평의 해결**: 전기세 + `stylelucky4u.com` 도메인 ($12/년) + B2 백업 ($6/TB/월, 현재 <50GB) + AI Assistant BYOK ($2.5/월) = **월 $10 이하 고정**.

#### P2. 데이터 주권 상실 (Data Residency)

- **현상**: 한국 개인/SMB가 Supabase를 쓰면 데이터는 보통 싱가포르/도쿄 AWS 리전에 머무른다. 개인정보보호법·GDPR·업종별 규제(의료/금융) 해석이 모호해진다.
- **1인 운영 영향**: "이 데이터, 내 서버에 있다"를 법무 검토 없이 말할 수 없다.
- **양평의 해결**: WSL2 로컬 디스크 + Cloudflare Tunnel. PostgreSQL·SeaweedFS·WAL 아카이브 **전부** 운영자 물리 디스크에 존재. B2 백업만 암호화된 envelope로 해외 전송.

#### P3. Multi-tenancy가 불필요한데 강제됨

- **현상**: Supabase는 "Organization → Project" 2계층을 필수화. 프로젝트 1개당 DB 1개, Auth·Storage·Realtime이 프로젝트에 묶임.
- **1인 운영 영향**: 내 사이드 프로젝트 3개를 운영하는데 "조직"이라는 논리 단위가 의미 없다. 대시보드 UI도 프로젝트 전환 UX에 과도한 화면 공간을 쓴다.
- **양평의 해결**: **Multi-tenancy 의도적 제외** (DQ-3.x). 1명의 운영자 = 1개 대시보드. 스키마/DB 단위로 논리 분리만 지원. UI는 프로젝트 선택 없이 바로 `/database/tables`로 진입.

#### P4. 커스터마이제이션 한계 — "Studio는 블랙박스다"

- **현상**: Supabase Studio self-hosted도 제공되지만, 내부 상태 관리(Redux/Zustand)와 API 호출 패턴이 Supabase 내부 서비스(`meta`, `gotrue-js`)에 강하게 결합되어 있어 한국어 용어/다크 테마 커스터마이징을 위한 PR 머지 비용이 높다.
- **1인 운영 영향**: "이 버튼 라벨 하나만 바꾸고 싶은데" 2시간이 든다.
- **양평의 해결**: Next.js 16 App Router 기반 자체 UI. Supabase Studio Apache-2.0 코드는 **"패턴 차용"만** (Wave 1 결정). 한국어 UI 기본, 다크 테마 기본, shadcn/ui 토큰화로 색상 변경 1줄.

#### P5. Next.js 통합 복잡도 — SDK 여러 개 + Realtime WS 관리

- **현상**: Supabase + Next.js 15/16 사용 시 `@supabase/supabase-js` + `@supabase/auth-helpers-nextjs` + `@supabase/realtime-js` + 서버/클라이언트 쿠키 동기화 + RSC/Server Action 호환성 문제.
- **1인 운영 영향**: 새 라우트 추가 시 "어느 클라이언트를 쓸까"로 매번 멈춘다. Vercel 배포 vs 자체호스팅 동작 차이 디버깅에 시간 낭비.
- **양평의 해결**: Next.js 16 App Router 내부 API Route + Prisma 7 + Server Component 직접 호출. 외부 SDK 없음. Realtime은 SSE + wal2json 파이프로 단일 fetch() 구독.

#### P6. PostgreSQL 확장·버전 의존성 잠금

- **현상**: Supabase는 PostgreSQL 15 기반, 사용 가능한 확장이 Supabase가 허용한 목록으로 제한(pgmq는 2024년부터 허용, wal2json은 Realtime 내부 전용).
- **1인 운영 영향**: "wal-g로 PITR 하고 싶다" → 불가. "pgmq로 Outbox 패턴 쓰고 싶다" → 허용된 버전만 가능.
- **양평의 해결**: PostgreSQL 17 직접 설치. 확장 자율 설치 (pgmq / wal2json / pg_graphql / pgvector 언제든). Wave 2 DQ-12.3에서 `wal-g` 채택 확정.

#### P7. 관리 도구 분열 — "Studio 따로, pgAdmin 따로, DBeaver 따로"

- **현상**: Supabase Studio는 UI 편집에 강하지만 SQL Editor Plan Visualizer, Index Advisor, WAL 조회는 약함. pgAdmin은 테이블 그리드가 거칠고 RLS 정책 편집 UX가 1990년대풍. DBeaver는 Electron 무겁고 한국어 주석 깨짐.
- **1인 운영 영향**: 스위치 비용 4초 × 일 50번 = 월 1.6시간 낭비.
- **양평의 해결**: 14 카테고리 단일 대시보드. TanStack Table v8 + 14c-α (Table) / Monaco + supabase-studio 패턴 (SQL) / xyflow + schemalint (Schema Viz) / Recharts (Advisors) 하나의 shadcn/ui 디자인 토큰 위에서 통합.

### A2.2 기존 도구의 한계 — 4개 비교

#### (a) Supabase Cloud (멀티테넌트 SaaS)

| 항목 | 한계 |
|------|------|
| 비용 | $25/월 최소 + 사용량 과금 누적 |
| 데이터 주권 | AWS 해외 리전 고정 |
| 커스터마이징 | Studio 내부 구조 폐쇄적, PR 머지 비용 높음 |
| 확장 잠금 | Supabase가 허용한 확장만 |
| Multi-tenancy | 강제 2계층 (Organization / Project) |
| **결론** | **편하지만, 1인 운영자에게 과금·주권·자유의 3중 부담** |

#### (b) pgAdmin + DBeaver 조합 (전통 DB GUI)

| 항목 | 한계 |
|------|------|
| UI/UX | 1990~2000년대 GUI 스타일, 한국어 UX 품질 낮음 |
| Auth/Storage/Realtime | **0%** 지원 — DB 관리 전용 |
| RLS 편집 | pgAdmin: 폼 UI 최소한, DBeaver: SQL 직접 |
| Visualizer | ERD는 있지만 RLS/Trigger 시각화 없음 |
| Realtime | 없음 |
| Observability | 없음 |
| **결론** | **DB 관리 기능은 강하지만 BaaS 기능(Auth/Storage/Realtime) 전무** |

#### (c) Supabase Studio self-hosted (컨테이너 실행)

| 항목 | 한계 |
|------|------|
| 배포 복잡도 | `docker-compose` 8~10 컨테이너 (studio + kong + meta + realtime + storage + auth + postgres + imgproxy + ...) |
| 리소스 요구 | RAM 2GB 이상, 단일 서버 오버헤드 |
| Next.js 통합 | 별도 앱, SDK 기반 — 네이티브 통합 아님 |
| 업그레이드 | Supabase 릴리스 주기에 종속 |
| 한국어 UX | 미지원 (Crowdin 번역은 일부만) |
| 커스터마이징 | 내부 상태 관리가 복잡, PR 머지 비용 높음 |
| **결론** | **"Studio는 쓰지만 Studio의 모든 것에 묶이는 것"이 싫은 운영자에게 부적합** |

#### (d) Retool / Appsmith (로우코드 어드민)

| 항목 | 한계 |
|------|------|
| 가격 | Retool $10~50/사용자/월, Appsmith OSS는 무료지만 자체호스팅 복잡 |
| Auth | OAuth/SAML 지원하지만 자체 Session 설계 불가 |
| RLS | 지원 안 함 (DB Row 레벨 정책 편집 개념 없음) |
| Realtime | 폴링 기반, wal2json 같은 CDC 없음 |
| Edge Functions | 없음 (웹훅만) |
| **PostgreSQL Native 기능 노출** | **부족** — "어드민 대시보드"일 뿐 "Postgres 관리 대시보드"가 아님 |
| **결론** | **Postgres 전용 깊이가 부족, BaaS 대체재가 아님** |

### A2.3 시장 기회 — 1인 개발자 + SMB 자체호스팅 시장

#### A2.3.1 배경 트렌드 (공개 자료 근거)

- **Self-hosted 회귀**: 2023년 이후 SaaS 과금 피로와 데이터 주권 관심으로 자체호스팅 재부상 (출처: Awesome-Selfhosted GitHub 스타 증가세, r/selfhosted 서브레딧 성장).
- **PostgreSQL 점유율**: Stack Overflow 2024 Developer Survey — PostgreSQL이 4년 연속 가장 선호하는 DB 1위 (전체 개발자 49%).
- **BaaS 시장 성장**: Grand View Research 2024 — BaaS 시장 2023년 $4.5B → 2030년 $35B 예상 CAGR 33%, 이 중 self-hosted BaaS는 틈새지만 고성장 segment.
- **Supabase 경쟁 지형**: Appwrite(MIT, Docker), Nhost(Hasura 기반), PocketBase(단일 Go 바이너리) 모두 OSS self-hostable을 2023~2024년에 강화. "Supabase 대안" 키워드 검색량 지속 증가.

#### A2.3.2 타겟 시장 규모 추정

| 세그먼트 | 규모 추정 | 양평 대시보드 적합도 |
|---------|----------|--------------------|
| 한국 1인 개발자 (Indie Hackers / Build-in-Public) | ~50,000명 (추정) | ★★★★★ (한국어 UI, $10/월) |
| 글로벌 1인 개발자 (영문 OSS 공개 시) | ~500,000명 | ★★★★☆ (Wave 3 단계 한국어 우선, 영문은 Wave 5+) |
| SMB 내부 관리 대시보드 (2-5인) | 글로벌 수백만 | ★★★☆☆ (Multi-tenancy 없지만 스키마 분리로 커버) |
| 프라이버시 중시 개인 (의료/법률/교육) | 니치 | ★★★★★ (데이터 주권 100%) |

→ **양평 대시보드의 초기 타겟은 "1명의 김도영"**이고, 24개월 후 검토하는 오픈소스 릴리스 대상은 이 중 상위 세그먼트 3개.

#### A2.3.3 경제성 차이

Supabase Cloud 월 $25~$100 vs 양평 월 $10 이하. 12개월 누적:
- Supabase: $300~$1,200
- 양평: $120 이하

→ **1년에 $180~$1,080 절감 × 3-5년 운영 = $540~$5,400 절감**. 1인 개발자의 사이드 프로젝트 경제성을 근본적으로 바꾼다.

---

## A3. 타겟 사용자

### A3.1 주 타겟 — 1인 개발자/운영자 (김도영 페르소나)

**페르소나 이름**: 김도영 (Kim Dooyoung)

| 항목 | 값 |
|------|-----|
| 역할 | 양평 부엌 서버 소유자 + Full-stack 1인 개발자 |
| 연령대 | 35-45 |
| 기술 스택 배경 | TypeScript / Next.js (App Router 3년) / PostgreSQL / Prisma / shadcn/ui / Tailwind / WSL2 / PM2 / Cloudflare |
| 운영 환경 | WSL2 Ubuntu + Windows 11 + `stylelucky4u.com` Cloudflare Tunnel |
| 주 업무 | (a) `stylelucky4u.com`의 비즈니스 데이터 관리, (b) 사이드 프로젝트 실험용 DB 관리, (c) 가족·지인 요청 간단한 웹앱 운영 |
| 시간 예산 | 주당 10-15시간 (본업 제외) |
| 돈 예산 | 월 $10-30 (도메인·백업·AI API 전부 포함) |
| 기술 가치관 | **자체호스팅 선호**, 벤더락인 회피, 한국어 UX, 다크 테마, 키보드 중심 |
| 불편 포인트 | Supabase 비용, pgAdmin UX, Multi-tenancy 강제, Studio Docker 8개 |
| 하루 대시보드 사용 횟수 | 10-30번 (테이블 확인, SQL 쿼리, 로그 확인) |
| 기술 결정 권한 | 100% (본인이 유일 이해관계자) |

**김도영의 하루 시나리오 (as-is → to-be)**:

- **as-is (Supabase Cloud)**: Supabase 대시보드 로그인 → 프로젝트 선택 → Table Editor 클릭 → 3초 로딩 → 데이터 수정 → SQL Editor 탭 전환 → 또 로딩 → EXPLAIN 실행 → pgAdmin 열어서 실행 계획 시각화 → 백업 확인은 "자동이니까 아마 됐겠지"
- **to-be (양평 대시보드)**: `stylelucky4u.com/admin/database/tables` 직링크 → 0.3초 렌더 → 데이터 수정 → Ctrl+/ SQL 패널 즉시 열림 → EXPLAIN Visualizer 내장 → `/backup/timeline` 에서 RPO 60초 WAL 체인 시각적 확인

### A3.2 부 타겟

#### A3.2.1 소규모 팀 (2-5인) 개발자

- **특징**: 자체호스팅 선호, DevOps 전담 없음, 팀 리드가 1인 운영자 역할 겸임
- **적합도**: ★★★★☆ — Multi-tenancy 없지만 스키마/DB 분리 + Auth 역할(role) 세분화로 커버. 단, 팀원 접근은 "하나의 관리자 계정 공유"가 아니라 개별 계정 + RBAC (Wave 2 Auth Core 결정).
- **수요**: Retool/Appsmith 대체 + pgAdmin 대체 + Supabase 대체를 한 번에 하고 싶은 팀.

#### A3.2.2 자체호스팅 선호 개인 (프라이버시 중시)

- **특징**: 기술 스택은 덜 자신 있지만 "내 데이터는 내 집에" 원칙이 강함. 의료/법률/교육/개인 일지 도메인.
- **적합도**: ★★★★★ — 데이터 주권 100%, Cloudflare Tunnel로 외부 IP 노출 없이 HTTPS.
- **수요**: "Google Drive 대신 SeaweedFS, Google Forms 대신 Next.js 폼 + 양평 Auth".

#### A3.2.3 오픈소스 기여자 / 학습자 (24개월+ 이후)

- **특징**: "Supabase가 어떻게 구성됐는지 레퍼런스로 학습하고 싶다"는 학습 수요.
- **적합도**: ★★★★☆ — Next.js 16 + Prisma 7 + PostgreSQL 17의 현대 스택을 단일 레포에서 학습 가능.
- **수요**: 양평 대시보드가 24개월 후 MIT/Apache-2.0 이중 라이선스로 공개된다면.

### A3.3 페르소나 상세 3개

#### 페르소나 1: 김도영 — 양평 부엌 운영자 (주 타겟)

- **Goal**: `stylelucky4u.com`을 안정적으로 운영하면서 사이드 프로젝트 실험 DB를 같이 관리.
- **Frustration**: Supabase 청구서 변동, pgAdmin UX, Docker 컨테이너 8개 Studio의 메모리 점유.
- **Tech Confidence**: ★★★★★ (Full-stack, TS/Next.js/Postgres 모두 자신 있음)
- **Session Pattern**: 하루 10-30번 짧게 (평균 3-5분/회). Ctrl+K 검색 명령팔레트 선호.
- **Data Volume**: 전체 < 50GB (Postgres 10GB + Storage 40GB), 활동 테이블 수 ~30개, RLS 정책 ~20개.
- **핵심 KPI**: (1) 대시보드 로딩 < 500ms, (2) 월 운영비 < $10, (3) 월 다운타임 < 5분.

#### 페르소나 2: 박민수 — 3인 스타트업 CTO (부 타겟)

- **Goal**: Supabase Cloud Pro $25 × 3명 = $75를 절감하고 고객 데이터를 국내 서버에 두고 싶음.
- **Frustration**: Supabase Organization 설정이 팀원 3명한테 불필요하게 복잡, Retool은 DB 편집 깊이 부족.
- **Tech Confidence**: ★★★★☆ (팀 리드, 백엔드 5년)
- **Session Pattern**: 하루 5-10번, 팀원 초대·RBAC 설정이 중요.
- **Data Volume**: 전체 < 200GB, 활동 테이블 ~100개, 팀원 3-5명이 동시 접속.
- **핵심 KPI**: (1) 팀원별 권한 분리, (2) 감사 로그(Audit Log), (3) 하루 동시 접속 5명 처리.
- **양평 적합성 제약**: Multi-tenancy 없음 — 3인 팀에게는 적합하지만 20인 팀 이상은 부적합 (Wave 3 DQ-3.x에서 명시).

#### 페르소나 3: 이수진 — 프라이버시 중시 개인 (부 타겟)

- **Goal**: 개인 일지·가족 사진·건강 데이터를 자택 NAS에 두고, 웹에서 간편 접근하되 외부 클라우드 경유하지 않기.
- **Frustration**: Google Drive는 프라이버시 불안, Synology DSM은 UX 구식, Supabase는 과잉.
- **Tech Confidence**: ★★★☆☆ (프론트엔드 2년, DB 기초)
- **Session Pattern**: 주 3-5번, 30초-2분 짧게.
- **Data Volume**: 전체 < 500GB (사진·동영상 위주), Postgres 메타데이터 < 1GB.
- **핵심 KPI**: (1) Storage 업로드 단순함, (2) Cloudflare Tunnel 뒤 HTTPS, (3) 백업이 B2로 암호화되어 나감.
- **양평 적합성 제약**: PostgreSQL 직접 설치가 부담 — Wave 5에서 "원클릭 설치 스크립트" 검토.

---

## A4. 핵심 가치 제안

### 가치 #1: 데이터 주권 100%

- **약속**: 모든 운영 데이터(Postgres Row, SeaweedFS Blob, WAL Segment, JWT 서명 키, Prisma 마이그레이션 히스토리)가 운영자 물리 디스크에 존재한다. 외부 클라우드 경유는 (a) Cloudflare Tunnel HTTPS 전송 암호화와 (b) B2 암호화된 envelope 백업만으로 제한된다.
- **기존 vs 양평**:

| 차원 | Supabase Cloud | 양평 대시보드 |
|------|---------------|-------------|
| Postgres 저장 위치 | AWS ap-southeast-1 등 | `/var/lib/postgresql/17/main` (운영자 디스크) |
| Storage | Supabase S3 (AWS) | SeaweedFS filer (`/opt/seaweedfs/vol`) |
| JWT Secret | Supabase Vault (내부) | `/etc/luckystyle4u/secrets.env` 0640 root:ypb-runtime |
| 백업 | Supabase 자동 | `wal-g` → B2 (AES-256-GCM envelope, 운영자 KEK) |

- **검증 방법**: Wave 4 청사전 + Wave 5 Phase 15에서 "데이터 출처 추적 테스트" — 모든 데이터 바이트의 물리 경로 문서화.

### 가치 #2: Supabase 동등 기능 100점

- **약속**: 14 카테고리 각각 Supabase Cloud 대비 자체 평가 점수 100/100 (Wave 1-2 리서치 기반 청사진).
- **기존 vs 양평**:

| 카테고리 | Supabase Cloud 기능 | 양평 동등 구현 | Wave 1-2 점수 |
|---------|--------------------|-----------------|---------------|
| Table Editor | Inline edit, CSV import, Filter/Sort | TanStack v8 + 14c-α/β | 4.54/5 |
| SQL Editor | Monaco + AI Assist | Monaco + supabase-studio 패턴 + Outerbase | 4.70/5 |
| Schema Viz | ERD | schemalint + 자체 RLS + Trigger | 4.30/5 |
| Auth | Email / OAuth / MFA | jose + Lucia/Auth.js 패턴 + TOTP/WebAuthn/RL | 4.08+4.59/5 |
| Storage | S3 호환 | SeaweedFS + B2 | 4.25/5 |
| Realtime | WS broadcast | wal2json + supabase-realtime 포팅 | 4.05/5 |
| Edge Functions | Deno | 3층 (isolated-vm + Deno + Sandbox) | 4.22/5 |
| Data API | REST + GraphQL | REST 강화 + pgmq + pg_graphql(트리거) | 4.29/5 |

- **검증 방법**: Wave 5 Phase 20에서 "100-point Parity Test" 체크리스트 실행.

### 가치 #3: 월 운영비 $10 이하

- **약속**: 정기 비용 합계가 월 $10 USD (약 13,000원)를 넘지 않는다.
- **기존 vs 양평**:

| 비용 항목 | Supabase Cloud (1인) | 양평 대시보드 |
|----------|---------------------|-------------|
| 서비스 기본료 | $25/월 (Pro) | $0 (자체호스팅) |
| DB 초과 | $0.125/GB | $0 (로컬 디스크) |
| Storage 초과 | $0.021/GB | $0 (SeaweedFS 로컬) |
| Egress | $0.09/GB | $0 (Cloudflare Tunnel 무료) |
| 도메인 | 별도 | $12/년 = $1/월 |
| 백업 | Pro 포함 | B2 $6/TB, 현재 <50GB = $0.3/월 |
| AI Assistant | Supabase AI 포함/제한 | Anthropic BYOK $2.5/월 (Haiku 라우팅) |
| **합계** | **$25-100+/월** | **$~4/월 (여유 포함 $10 이하)** |

- **검증 방법**: `stylelucky4u.com` 6개월 운영 후 실제 청구서 합산.

### 가치 #4: 1인 운영 가능

- **약속**: PM2 cluster:4 + Capistrano-style 배포 + `wal-g` 자동 백업 + 자체 Advisors 3-Layer로 운영 부담 주당 1시간 이하.
- **기존 vs 양평**:

| 운영 부담 | Supabase self-hosted (Docker 8개) | 양평 대시보드 |
|----------|--------------------------------|-------------|
| 컨테이너 수 | 8-10 (studio/kong/meta/...) | Next.js 1 앱 (PM2 cluster:4) + PostgreSQL + SeaweedFS |
| 업그레이드 | Supabase 릴리스 추적 | Next.js/Prisma/Postgres 각각 독립 |
| 백업 감시 | 수동 | node-cron + Advisors 자동 |
| 장애 복구 | 컨테이너 재시작 분석 | PM2 자동 재시작 + Canary |
| 주당 운영 시간 | 3-5h | 0.5-1h |

- **검증 방법**: Wave 4 청사진에 "Operator Time Budget" 섹션 명시, Wave 5 Phase 20에서 실측.

### 가치 #5: Next.js 16 네이티브 통합

- **약속**: Next.js 16 App Router 단일 코드베이스. Server Component에서 Prisma 직접 호출, Server Action으로 mutation, API Route로 외부 노출. 외부 SDK 없음.
- **기존 vs 양평**:

| 통합 지점 | Supabase + Next.js | 양평 (Next.js 내장) |
|----------|-------------------|--------------------|
| DB 쿼리 | `@supabase/supabase-js` 클라이언트 | `prisma.user.findMany()` 서버 직접 |
| Auth 쿠키 | `@supabase/auth-helpers-nextjs` | jose `jwtVerify()` 미들웨어 |
| Realtime | `supabase.channel().on()` WS | Next.js Route Handler SSE (wal2json → 브로드캐스트) |
| Storage | `supabase.storage.upload()` | Next.js API Route → SeaweedFS HTTP |
| Edge Fn | Supabase Functions (별도 Deno 런타임) | Next.js Route Handler + isolated-vm worker |
| SDK 개수 | 4-6개 | 0개 (내부 모듈만) |
| TypeScript | Supabase 타입 생성 별도 | Prisma 7 자동 생성 |

- **검증 방법**: Wave 4에서 "엔드포인트 목록" 제공, Wave 5에서 외부 npm 종속성 감사.

---

## A5. 경쟁 환경

### A5.1 직접 경쟁 (Supabase 대안 / BaaS OSS)

#### A5.1.1 Supabase Cloud (원본)

- **강점**: 표준화, 풍부한 커뮤니티, 공식 SDK 성숙, Vercel 통합 예제 풍부.
- **약점**: 1인 운영자 관점에서 과금·주권·강제 Multi-tenancy가 모두 부담.
- **양평 대비 포지션**: "양평은 Supabase Cloud를 쓰다가 이탈한 1인 사용자의 착륙지점." 기능 동등성은 100점을 목표, 편의성은 타협.

#### A5.1.2 Appwrite (MIT / Docker)

- **강점**: MIT 라이선스, Docker 한 번에 기동, MariaDB 기반이라 단순, 웹/모바일 SDK 좋음.
- **약점**: PostgreSQL 아님 (양평 운영자의 Prisma 7 자산 호환 불가), Realtime CDC 없음, SQL 편집기 부재.
- **양평 대비 포지션**: Appwrite는 "모바일 앱 백엔드"에 강점, 양평은 "Postgres 관리 대시보드"에 강점. 타겟 상이.

#### A5.1.3 Nhost (Hasura 기반)

- **강점**: GraphQL 자동 생성(Hasura), PostgreSQL 기반, self-host 가능.
- **약점**: Hasura 의존성 무거움, Edge Functions 제한적, Dashboard UX는 Supabase보다 단조.
- **양평 대비 포지션**: GraphQL이 메인 관심사인 사용자는 Nhost. 양평은 REST 기본 + pg_graphql은 "수요 트리거 시 도입" (Wave 2 DQ).

#### A5.1.4 PocketBase (단일 Go 바이너리)

- **강점**: 단일 실행 파일, SQLite 내장, 제로 설정.
- **약점**: SQLite → 동시성·확장성 제약, Postgres 자산 호환 0%, RLS 개념 없음.
- **양평 대비 포지션**: PocketBase는 "개인 토이 프로젝트", 양평은 "실제 프로덕션 운영용 Postgres 대시보드". 타겟 상이.

### A5.2 간접 경쟁

#### A5.2.1 Firebase (Google)

- **강점**: 모바일/웹 생태계, 실시간 동기화, 무료 티어.
- **약점**: NoSQL (Firestore), 데이터 주권 완전 부재, 벤더락인 극심.
- **양평 대비 포지션**: Firebase 사용자는 관계형 데이터 설계가 필요해지면 이탈하는데, 이들의 다음 선택지가 Supabase 또는 양평.

#### A5.2.2 Retool / Appsmith (Low-code Admin)

- **강점**: 드래그앤드롭으로 어드민 화면 빌드 빠름, SQL Custom Component.
- **약점**: Postgres 내부 기능(RLS/Trigger/Function/WAL) 노출 약함, Auth는 외부 위임, Realtime은 폴링.
- **양평 대비 포지션**: Retool은 "비즈니스 어드민 UI 빌더", 양평은 "DB 운영 대시보드". 양평은 Retool의 UI 빌더 기능을 제공하지 않지만 DB 운영 깊이는 압도.

#### A5.2.3 pgAdmin + DBeaver (전통 DB GUI)

- **강점**: 무료, PostgreSQL 공식 도구(pgAdmin), 수십 DB 엔진 지원(DBeaver).
- **약점**: Auth/Storage/Realtime 0%, UX는 1990~2000년대풍, Next.js 통합 불가.
- **양평 대비 포지션**: pgAdmin/DBeaver 사용자는 BaaS 기능이 필요해지면 Supabase 또는 양평으로 이동.

#### A5.2.4 Hasura (GraphQL 엔진 자체호스팅)

- **강점**: 즉시 GraphQL API 자동 생성, 권한 선언적.
- **약점**: Dashboard는 스키마 편집 중심, Table Editor·SQL Editor·Storage 없음.
- **양평 대비 포지션**: Hasura는 "GraphQL 레이어", 양평은 "통합 대시보드". 공존 가능 — 양평 + Hasura 조합도 유효.

### A5.3 차별화 포인트 (Unique Value Props)

#### D1. 자체호스팅 + Next.js 16 네이티브 통합

- 경쟁 제품 중 Next.js 16 App Router 네이티브(SDK 없이 Server Component 직접 호출)로 구성된 대시보드는 없다. Supabase Studio도 별도 앱.

#### D2. 1인 운영 최적화 — Multi-tenancy 의도적 제외

- Supabase / Appwrite / Nhost는 모두 Multi-tenant 전제. 양평은 "1명 = 1대시보드" 명시적 제약으로 UI/데이터 모델을 단순화.

#### D3. "하이브리드 9 : 단일 5" 분류 원칙

- Wave 1 Compound Knowledge로 발견한 분류가 14 카테고리 각각의 설계에 직접 반영됨. 경쟁 제품은 일관된 분류 원칙이 명시되어 있지 않음.

#### D4. 패턴 차용 > 라이브러리 채택

- Auth Core에서 Lucia/Auth.js **라이브러리 거부**, 패턴 15개만 차용. Schema Viz에서 Prisma Studio **임베드 거부**, UI 패턴만 흡수. 경쟁 제품은 특정 라이브러리에 강결합.

#### D5. Compound Knowledge 투명성

- 14 카테고리 × Wave 1-2 리서치 = 61 문서, 45,192줄의 의사결정 근거가 전부 공개 문서화. 경쟁 제품은 "왜 이 기술을 선택했는지"가 블로그 포스트 수준으로만 제공.

#### D6. 한국어 UI 1등급

- 경쟁 제품 대부분 영문 1등급 / 한국어 2등급 (자동 번역 또는 커뮤니티 번역). 양평은 한국어 네이티브.

#### D7. Cloudflare Tunnel 친화

- 자체호스팅 OSS 대부분 "nginx/traefik + Let's Encrypt" 가정. 양평은 Cloudflare Tunnel 1등급 시민 (포트 포워딩 불필요, 외부 IP 노출 0).

---

## A6. 성공 지표 (KPIs)

### A6.1 6개월 목표 (2026-10-18까지)

| # | 지표 | 목표값 | 측정 방법 |
|---|------|--------|----------|
| 6M-1 | Supabase parity 자체 평가 점수 | **85+/100** | Wave 5 Phase 20 체크리스트 |
| 6M-2 | 14 카테고리 중 60+ 달성 카테고리 수 | **≥10개** | 카테고리별 청사진 달성도 |
| 6M-3 | 14c-α (Table Editor) 배포 | **100% 완료** | Wave 5 Phase 16 릴리스 |
| 6M-4 | Auth Advanced 3종 (TOTP/WebAuthn/RL) | **모두 적용** | `/auth/mfa` 라우트 동작 |
| 6M-5 | 월 운영비 | **$10 이하** | 6개월 청구서 평균 |
| 6M-6 | 월 다운타임 | **< 30분** | Cloudflare Tunnel uptime |
| 6M-7 | SQL Editor 주요 쿼리 평균 응답 | **< 300ms** | PG_STAT_STATEMENTS |
| 6M-8 | 테스트 커버리지 | **≥ 70%** | Vitest `--coverage` |
| 6M-9 | 리서치 문서 총 줄 수 | **90,000+** | Wave 1-5 합산 |

### A6.2 12개월 목표 (2027-04-18까지)

| # | 지표 | 목표값 | 측정 방법 |
|---|------|--------|----------|
| 12M-1 | Supabase parity 자체 평가 | **100/100 (14 전 카테고리)** | Phase 20 완전 통과 |
| 12M-2 | 월 다운타임 | **< 5분** (SLO 99.99%) | Cloudflare Tunnel uptime + 자체 Observability |
| 12M-3 | SQL Editor AI Assist | **월 요청 1000회 + 비용 $5 이하** | AI SDK v6 usage |
| 12M-4 | Realtime (wal2json) 지연 | **< 100ms (95p)** | 자체 end-to-end 측정 |
| 12M-5 | Storage (SeaweedFS) 일일 업로드 | **≥ 1GB 무오류** | 자체 인제스트 카운터 |
| 12M-6 | Edge Functions 3층 분기 | **3 런타임 모두 동작** | `decideRuntime()` 테스트 |
| 12M-7 | Advisors 룰 | **3-Layer 합계 50+룰** | 자체 룰 카운트 |
| 12M-8 | Backup RPO / RTO | **RPO 60초 / RTO 30분** | `wal-g` 복원 훈련 |
| 12M-9 | 월 운영비 | **$10 이하 유지** | 12개월 청구서 |
| 12M-10 | 작업 시간 | **주당 ≤ 1시간 (운영)** | 자체 타임 로그 |

### A6.3 24개월 목표 (2028-04-18까지)

| # | 지표 | 목표값 | 측정 방법 |
|---|------|--------|----------|
| 24M-1 | 오픈소스 릴리스 검토 | **GitHub Public + 라이선스 확정** | 저장소 public 전환 |
| 24M-2 | 외부 기여자(if OSS) | **≥ 5명 PR merge** | GitHub contributors |
| 24M-3 | 커뮤니티 기여 (업스트림) | **≥ 3 PR** (splinter/supabase-studio 패턴 피드백 등) | GitHub PR 목록 |
| 24M-4 | 1인 운영 안정성 | **연 99.95% uptime** | 12개월 누적 |
| 24M-5 | 운영 가이드 문서화 | **전 14 카테고리 운영 매뉴얼 완성** | `docs/operations/` |
| 24M-6 | 비용 이탈 | **월 $10 유지** | 24개월 누적 청구서 |
| 24M-7 | 업그레이드 주기 | **Next.js 17 / PostgreSQL 18 적용 완료** | 릴리스 로그 |
| 24M-8 | 프로젝트 피로 지수 | **"아직 운영할 만하다" YES** | 자체 분기 리뷰 |

### A6.4 Leading Indicators (선행 지표, 주간/월간)

| 지표 | 경고 임계값 | 의미 |
|------|----------|------|
| 주당 대시보드 세션 수 | < 5 | 사용 감소 (운영 관심도 저하) |
| 대시보드 평균 응답 | > 500ms | 성능 저하 (DB 병목 또는 Next.js 번들) |
| Advisors 경고 | > 10 신규/주 | 스키마/쿼리 품질 저하 |
| 마이그레이션 롤백 | > 0 | DB 변경 프로세스 문제 |
| `wal-g` 실패 | > 0 | 백업 신뢰도 손상 (즉시 인시던트) |
| 운영 시간 | > 3h/주 | 자동화 회귀 신호 |

---

## A7. 제품 원칙

### P1. 기존 자산 보존 + 외부 패턴 학습 자체구현 (Wave 1 Compound Knowledge)

- **출처**: Wave 1 "패턴 2: 라이브러리 채택 vs 패턴 차용" 결정
- **선언**: 이미 프로젝트에 있는 자산(jose, bcrypt, Prisma 7, Drizzle, xyflow/elkjs, shadcn/ui)은 **보존**한다. 외부 라이브러리(Lucia, Auth.js, Prisma Studio, Retool)는 **패턴만 흡수하고 직접 구현**한다. 이유: 1인 운영 컨텍스트에서 마이그레이션 비용이 라이브러리 편의성을 초과.
- **적용 사례**:
  - Auth Core: Lucia/Auth.js 라이브러리 거부 → 세션 테이블 + CSRF + Refresh Token 패턴만 차용 (15개)
  - Schema Viz: Prisma Studio/drizzle-kit 임베드 거부 → UX 패턴만
  - SQL Editor: supabase-studio Apache-2.0 코드 자유 활용하되 **직접 포팅**, sqlpad는 아카이빙 예정이라 **패턴만**
- **Anti-Pattern 감지**: 신규 기능 PR에 `npm install [외부 프레임워크]`가 등장하면 → Wave 리서치 근거 없이는 차단.

### P2. 하이브리드 9 : 단일 5 분류 원칙 (Wave 4 청사진 축)

- **출처**: Wave 1 "패턴 1: 단일 솔루션 vs 하이브리드" + Wave 2 재검증
- **선언**: 14 카테고리를 **하이브리드 필수형 9개** (Table Editor / SQL Editor / Schema Viz / Auth Core / Auth Advanced / Edge Functions / Realtime / Data API / Advisors)와 **단일 솔루션형 5개** (Storage / DB Ops / Observability / UX / Operations)로 분류한다. 하이브리드형은 단일 OSS로 100점 불가, 패턴 결합이 필수. 단일 솔루션형은 단일 채택 + 보조 1개로 90+ 도달.
- **적용 사례**:
  - Realtime = wal2json (CDC) + supabase-realtime 포팅 (Channel) **계층 분리** (Wave 2 1:1 비교)
  - Storage = SeaweedFS 단독 + B2 백업 (90~95점)
- **Anti-Pattern 감지**: 하이브리드형 카테고리에 "단일 라이브러리 A로 전부 해결" 주장이 나오면 → 의심.

### P3. 확장 도입 비용 vs 자체 구현 부담 균형 (Wave 1 패턴 3)

- **출처**: Wave 1 "패턴 3: PostgreSQL 확장 vs Node 자체구현" 결정 매트릭스
- **선언**: PostgreSQL 확장 도입(pg_cron, pgsodium, wal2json, pgmq, pg_graphql, wal-g)과 Node 자체 구현(node-cron, node:crypto envelope) 중 선택은 **카테고리마다 비용/부담 저울**로 결정한다. 일률적으로 "확장 선호" 또는 "자체 선호" 금지.
- **적용 사례**:
  - Realtime CDC → **wal2json** (확장 표준화)
  - Vault → **node:crypto** (pgsodium은 SUPERUSER + Prisma 비호환)
  - Cron → **node-cron** (pg_cron은 1인 환경에서 과한 의존)
  - Queue → **pgmq** (Outbox 패턴 + PG 트랜잭션 일관성)
  - GraphQL → **pg_graphql** (단, 도입은 수요 트리거 4개 중 2개+ 만족 시)
- **Anti-Pattern 감지**: "모든 Postgres 확장은 좋다" 또는 "확장 없이 Node로만 해결하자" 둘 다 금지.

### P4. 1인 운영 가능성 > 확장성

- **출처**: Wave 1 페르소나 + Wave 2 ECO/MAINT 가중치
- **선언**: "100명 동시 접속 처리"는 우선순위가 낮다. "김도영이 주당 1시간 이하로 운영할 수 있는가"가 항상 1순위. 10명 동시 접속으로 성능이 문제되면 그때 대응.
- **적용 사례**:
  - PM2 cluster:4 (4 워커면 충분, Kubernetes 도입 거부)
  - Docker 도입 거부 (Wave 1-2에서 SELF_HOST 가중치 기반)
  - Multi-tenancy 의도적 제외
- **Anti-Pattern 감지**: "확장성을 위해 마이크로서비스 분리하자" 제안이 나오면 → 1인 운영 원칙 위배 경고.

### P5. 보안 기본값, 커스터마이징 최대

- **출처**: Wave 2 SECURITY 10% 가중치 + Auth Advanced 4.59 점수
- **선언**: 모든 보안 기능(MFA TOTP, WebAuthn, Rate Limit, RLS 기본 활성, CSRF 토큰, Content Security Policy 헤더, Cloudflare Tunnel 필수)은 **기본 ON**. 단, UI 색상·레이아웃·용어·플로우는 전부 운영자가 바꿀 수 있어야 한다.
- **적용 사례**:
  - Phase 15~17에서 TOTP/WebAuthn/RL 전부 동시 활성
  - `/etc/luckystyle4u/secrets.env` 0640 root:ypb-runtime 강제
  - Prisma 스키마에서 RLS 정책이 없는 테이블은 Advisors가 경고
- **Anti-Pattern 감지**: "보안은 선택 사항이니 기본 OFF" 제안은 거부.

### P6. 역사 삭제 금지 (기존 CLAUDE.md 규칙 반영)

- **출처**: 프로젝트 CLAUDE.md "핵심 원칙"
- **선언**: Wave 리서치 문서, ADR, 세션 기록, 인수인계서 중 **어떤 것도 삭제하지 않는다**. 잘못된 결정도 "어떤 맥락에서 왜 잘못됐는지" 히스토리로 남긴다.
- **적용 사례**:
  - Wave 1-2 61 문서 45,192줄 전부 영구 보존
  - 채택안 변경 시 ADR로 "왜 이전 결정을 뒤집는지" 기록
- **Anti-Pattern 감지**: "이 문서 오래됐으니 삭제하자" 제안 차단.

### P7. 풀뿌리 연결 (Documentation Traceability)

- **출처**: 프로젝트 CLAUDE.md "풀뿌리 트리"
- **선언**: 이 비전서(00-product-vision.md)를 시작으로 01~10 문서, Wave 1-2의 61 문서, Wave 4 청사진, Wave 5 로드맵까지 **위에서 아래로 클릭 가능한 링크 트리**를 유지한다. 고립된 문서는 금지.
- **적용 사례**:
  - 이 문서 상단/부록의 참조 경로
  - README.md의 마스터 인덱스에서 이 문서로 링크 추가 (세션 26 마감 시)
- **Anti-Pattern 감지**: 신규 문서 작성 시 상위 인덱스 업데이트 누락은 차단.

---

## 부록 Z. Wave 1-2 근거 인덱스

### Z.1 이 문서가 의존하는 Wave 1-2 결과

| 본문 섹션 | 참조 Wave 문서 | 근거 |
|----------|---------------|------|
| A1.4 Supabase 차이표 | `01-research/07-storage/01-deep-seaweedfs.md` 외 | 데이터 위치·백업 패턴 |
| A2.1 P1 비용 | `01-research/13-ux-quality/*.md` | AI BYOK $2.5 |
| A2.1 P3 Multi-tenancy | `_CHECKPOINT_KDYWAVE.md` "특수 요구" | "Multi-tenancy 의도적 제외" 명시 |
| A2.1 P5 Next.js 통합 | Wave 2 D (Storage+Edge) `decideRuntime()` | Next.js 16 네이티브 통합 근거 |
| A2.1 P7 도구 분열 | 14 카테고리 전체 | 통합 대시보드 필요성 |
| A4 가치 제안 | README.md "14 카테고리 Wave 2 최종 점수" | 100점 청사진 근거 |
| A4 #2 Supabase 동등 | Wave 2 매트릭스 1위 점수 14개 | 각 카테고리 4.05~4.70/5 |
| A4 #3 비용 $10 이하 | Wave 2 G (UX+Ops) AI SDK v6 $2.5 | 월 $2.5 BYOK |
| A4 #4 1인 운영 | Wave 2 G Capistrano 89.0점 | 자동화 근거 |
| A4 #5 Next.js 네이티브 | Wave 2 A SQL Editor 4.70 | supabase-studio 패턴 직접 포팅 |
| A5 경쟁 | Wave 1 Round 1-2 비교 행렬 | MinIO/Garage/SeaweedFS 등 |
| A6 KPI | Wave 1-2 카테고리별 목표 점수 | 85/100 → 100/100 경로 |
| A7 P1 기존 자산 | Wave 1 "패턴 2" | 라이브러리 vs 패턴 결정 |
| A7 P2 분류 축 | Wave 1 "패턴 1" + Wave 2 재검증 | 9:5 분류 |
| A7 P3 확장 비용 | Wave 1 "패턴 3" 결정 매트릭스 | 7개 확장/자체 결정 |

### Z.2 공개 외부 자료 근거

- Supabase 공식: `supabase.com/pricing`, `supabase.com/docs/guides/self-hosting`, Supabase Studio GitHub (Apache-2.0)
- BaaS 시장: Grand View Research "Backend as a Service Market Size Report 2023-2030"
- Stack Overflow Developer Survey 2024 (PostgreSQL 선호도)
- Awesome-Selfhosted GitHub repository
- PocketBase / Appwrite / Nhost 공식 문서
- Cloudflare Tunnel 공식 문서 (운영 환경 근거)
- Backblaze B2 가격 정책 (백업 비용 근거)
- Anthropic Claude API 가격 정책 (AI BYOK 비용 근거)

### Z.3 이 문서의 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent V1 (Opus 4.7 1M) | 세션 26 Wave 3 V1 초안 — A1~A7 전체 + 부록 Z |

### Z.4 후속 문서 연결 (Wave 3 다른 산출물)

- → `01-user-stories.md` (V2): 이 비전서의 A3 페르소나 → 구체 사용자 스토리 30-50개
- → `02-functional-requirements.md` (R1): A4 가치 제안 → FR 목록
- → `03-non-functional-requirements.md` (R2): A6 KPI → NFR 수치
- → `04-constraints-assumptions.md` (R2): A7 원칙 → 제약/가정
- → `05-100점-definition.md` (M1): A6.2 12M 목표 → 카테고리별 100점 정의
- → `06-operational-persona.md` (M1): A3.1 김도영 → 운영 페르소나 상세
- → `07-dq-matrix.md` (M2): Wave 1-2 DQ 64건 → 매트릭스
- → `08-security-threat-model.md` (M2): A7 P5 → STRIDE 모델
- → `09-multi-tenancy-decision.md` (M3): A2.1 P3 → 정식 ADR
- → `10-14-categories-priority.md` (M3): A6.1 6M-2 → 카테고리 우선순위 확정

---

> **비전서 끝.** Wave 3 · V1 · 2026-04-18 · 양평 부엌 서버 대시보드 — Supabase 100점 동등성.
