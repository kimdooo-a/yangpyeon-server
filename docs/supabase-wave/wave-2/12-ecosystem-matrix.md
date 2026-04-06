# 생태계/커뮤니티 비교 매트릭스
## Supabase vs Firebase vs AWS Amplify vs Appwrite

> 작성일: 2026-04-06
> 평가 기준: 각 항목 1~5점 (5점 = 최우수)
> 조사 기준 시점: 2025년 Q4 ~ 2026년 Q1

---

## 목차

1. [평가 개요](#1-평가-개요)
2. [GitHub 지표](#2-github-지표)
3. [npm 패키지 다운로드 트렌드](#3-npm-패키지-다운로드-트렌드)
4. [서드파티 통합](#4-서드파티-통합)
5. [프레임워크 지원](#5-프레임워크-지원)
6. [교육 자료](#6-교육-자료)
7. [상용 사례 및 고객군](#7-상용-사례-및-고객군)
8. [투자 및 재정 건전성](#8-투자-및-재정-건전성)
9. [종합 생태계 점수 및 분석](#9-종합-생태계-점수-및-분석)

---

## 1. 평가 개요

BaaS 플랫폼의 장기적 지속 가능성과 실무 활용 가능성은 기술 스펙만큼이나 생태계의 건전성에 달려있다. 아무리 뛰어난 기술이라도 커뮤니티가 없고, 서드파티 통합이 부족하고, 재정적으로 불안정하다면 프로덕션 도입 결정은 위험하다. 이 문서는 Supabase, Firebase, AWS Amplify, Appwrite의 생태계를 8개 차원으로 분석한다.

### 평가 대상 요약

| 플랫폼 | 운영사 | 비즈니스 모델 | 셀프호스팅 |
|--------|--------|-------------|----------|
| **Supabase** | Supabase Inc. (샌프란시스코) | SaaS 구독 + 엔터프라이즈 | 가능 (오픈소스) |
| **Firebase** | Google LLC | Google Cloud 종량제 | 불가 (독점) |
| **AWS Amplify** | Amazon Web Services | AWS 서비스 연계 과금 | 부분 가능 |
| **Appwrite** | Appwrite Inc. (텔아비브) | SaaS 구독 + 셀프호스팅 | 가능 (오픈소스) |

---

## 2. GitHub 지표

### 2.1 Supabase GitHub — 점수: **5/5**

**핵심 지표 (2026년 4월 기준)**

| 지표 | 수치 |
|------|------|
| Stars (supabase/supabase) | **100,304** |
| Forks | **11,987** |
| Contributors | **1,742명 이상** |
| Commits | **35,000건 이상** |
| GitHub 전체 순위 | 상위 100위 (99위) |

**별 성장 속도**: Supabase는 2020년 출시 이후 약 5년 만에 100,000 스타를 달성했다. 이는 오픈소스 프로젝트 중 역사상 가장 빠른 성장 속도 중 하나다. 비교 지점으로는 React가 100,000 스타 달성에 약 6년이 걸렸다.

**릴리스 빈도**: supabase/cli 리포지토리는 월 2~4회 릴리스를 꾸준히 유지한다. 2025년 기준 연간 40회 이상의 릴리스가 기록되었다.

**이슈 응답 시간**: 커뮤니티 기여자와 Supabase 팀 직원이 적극적으로 이슈에 응답하며, 버그 리포트의 경우 평균 1~3일 이내 팀 멤버의 초기 응답이 이루어진다.

**핵심 리포지토리**
- `supabase/supabase`: 메인 모노레포 (100k+ stars)
- `supabase/supabase-js`: JavaScript/TypeScript SDK
- `supabase/cli`: CLI 도구 (Go)
- `supabase/auth`: GoTrue 기반 인증 서버 (Go)
- `supabase/realtime`: Elixir 기반 실시간 서버
- `supabase/storage-api`: 파일 저장소 API

---

### 2.2 Firebase GitHub — 점수: **3/5**

Firebase는 Google 소유의 독점 서비스이므로 핵심 서버 코드는 오픈소스가 아니다. 오픈소스로 공개된 것은 클라이언트 SDK 일부다.

**핵심 지표 (2025년 기준)**

| 지표 | 수치 |
|------|------|
| firebase/firebase-js-sdk Stars | **5,100+** |
| firebase/firebase-tools Stars | ~3,500 |
| firebase/firebase-admin-node Stars | ~1,800 |
| Google 공식 기여자 수 | 제한적 (내부 팀 주도) |

**낮은 오픈소스 활성도의 이유**
Firebase의 핵심(Firestore 엔진, Auth 서버, Cloud Functions 런타임)은 Google의 사유 코드다. 따라서 외부 기여자가 핵심 기능을 개선하거나 버그를 수정하는 것이 불가능하다. 클라이언트 SDK는 오픈소스이지만, 기여보다는 이슈 리포트와 풀 리퀘스트의 느린 처리로 커뮤니티 불만이 적지 않다.

**이슈 응답**: Google 내부 팀의 응답은 비교적 느리며, 일부 이슈가 수개월 이상 미해결 상태로 남아있는 경우가 보고된다. Google의 조직 규모로 인해 우선순위 결정이 느리다.

---

### 2.3 AWS Amplify GitHub — 점수: **3/5**

**핵심 지표 (2025~2026년 기준)**

| 지표 | 수치 |
|------|------|
| aws-amplify/amplify-js Stars | **9,600+** |
| aws-amplify/amplify-cli Stars | 2,878 |
| aws-amplify/amplify-flutter Stars | 1,352 |
| aws-amplify/amplify-ui Stars | 1,118 |

**기여자 구성**: AWS 내부 엔지니어가 대부분의 커밋을 담당하며, 외부 기여자 비율이 Supabase에 비해 낮다. AWS는 Amplify를 내부 제품으로 운영하는 성격이 강하다.

**릴리스 빈도**: 활발한 릴리스 주기를 유지하고 있으나, Gen 1 → Gen 2 전환 과정에서 일부 불안정한 시기가 있었다.

**이슈 관리**: GitHub Issues보다 AWS re:Post(유료 지원 포럼)를 통한 공식 지원을 권장하는 경향이 있어, 무료 오픈소스 기여 문화가 약하다.

---

### 2.4 Appwrite GitHub — 점수: **4/5**

**핵심 지표 (2025년 기준)**

| 지표 | 수치 |
|------|------|
| appwrite/appwrite Stars | **53,000+** |
| Forks | 4,200+ |
| Contributors | 800명 이상 |
| GitHub Universe 2025 선정 | Open Source Zone 참여 |

**커뮤니티 참여 문화**: Appwrite는 오픈소스 문화를 강하게 추구한다. 2025년 Hacktoberfest에서 47개의 커뮤니티 제출이 이루어졌으며, 공개 로드맵을 GitHub에서 운영한다.

**공개 로드맵**: 커뮤니티에서 가장 많이 요청한 기능 중 하나가 "공개 로드맵"이었으며, Appwrite는 이를 실제로 구현하여 개발 방향의 투명성을 높였다.

**이슈 응답**: 소규모 팀임에도 불구하고 이슈 응답 속도가 빠른 편이다. Discord를 통한 팀 직접 응답도 활성화되어 있다.

---

### GitHub 지표 소계

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|------|----------|----------|-------------|---------|
| Stars/인지도 | 5 | 2 | 3 | 4 |
| 오픈소스 활성도 | 5 | 2 | 3 | 4 |
| 이슈 응답 | 5 | 3 | 3 | 4 |
| 릴리스 빈도 | 5 | 4 | 4 | 4 |
| **소계 (평균)** | **5.0** | **2.8** | **3.3** | **4.0** |

---

## 3. npm 패키지 다운로드 트렌드

### 3.1 Supabase npm 트렌드 — 점수: **5/5**

**주요 패키지 다운로드 (2026년 1분기 기준)**

| 패키지명 | 주간 다운로드 | 용도 |
|---------|------------|------|
| `@supabase/supabase-js` | **2,000,000+** | 메인 클라이언트 SDK |
| `@supabase/ssr` | 500,000+ | SSR 환경 인증 |
| `supabase` (CLI) | 300,000+ | CLI 도구 (npm/npx) |
| `@supabase/auth-ui-react` | 100,000+ | 드롭인 인증 UI |

**성장 궤적**: 2025년 기준 `@supabase/supabase-js`의 주간 다운로드는 2023년 대비 약 5배 증가했다. 이는 Next.js + Vercel + Supabase 스택이 스타트업 표준으로 자리잡으면서 나타난 현상이다.

**2026년 Q1 시장 점유율**: Supabase의 BaaS 시장 점유율은 2025년 12%에서 2026년 Q1 28%로 급증했다. Firebase 대비 상대적 점유율 역전이 시작된 시점이다.

---

### 3.2 Firebase npm 트렌드 — 점수: **4/5**

**주요 패키지 다운로드**

| 패키지명 | 주간 다운로드 (추정) | 용도 |
|---------|------------------|------|
| `firebase` (v9+) | **3,000,000~5,000,000+** | 메인 클라이언트 SDK |
| `firebase-admin` | 1,500,000+ | 서버사이드 Admin SDK |
| `firebase-tools` | 200,000+ | CLI 도구 |

**절대적 규모**: Firebase는 여전히 절대적인 다운로드 수에서 앞서있다. 10년 이상의 역사와 수백만 개의 기존 프로젝트가 Firebase를 계속 사용하고 있기 때문이다. 다만 성장률은 Supabase에 비해 훨씬 낮으며, 일부 지표에서는 정체 또는 감소 추세가 나타나고 있다.

---

### 3.3 AWS Amplify npm 트렌드 — 점수: **3/5**

**주요 패키지 다운로드**

| 패키지명 | 주간 다운로드 (추정) | 용도 |
|---------|------------------|------|
| `aws-amplify` | 500,000~800,000 | 메인 SDK |
| `@aws-amplify/ui-react` | 150,000+ | UI 컴포넌트 |
| `@aws-amplify/backend` | 100,000+ | Gen 2 백엔드 정의 |

**Gen 2 전환 영향**: Gen 2 출시(2024년 5월 GA) 이후 `@aws-amplify/backend` 등 새 패키지의 다운로드가 증가 추세이나, 전체적인 개발자 기반은 Supabase에 비해 성장 속도가 느리다.

---

### 3.4 Appwrite npm 트렌드 — 점수: **3/5**

**주요 패키지 다운로드**

| 패키지명 | 주간 다운로드 (추정) | 용도 |
|---------|------------------|------|
| `appwrite` (Web SDK) | 80,000~150,000 | 클라이언트 SDK |
| `node-appwrite` | 50,000~80,000 | Node.js Admin SDK |

**상대적 규모**: Appwrite의 npm 다운로드는 Supabase, Firebase에 비해 낮다. 이는 Appwrite가 주로 셀프호스팅 사용자를 타겟으로 하며, Docker로 직접 설치하는 방식이 중심이라 npm 다운로드 지표가 실제 사용량을 덜 반영한다는 특성이 있다.

---

### npm 다운로드 소계

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|------|----------|----------|-------------|---------|
| 다운로드 절대량 | 4 | 5 | 3 | 2 |
| 성장률 | 5 | 2 | 3 | 3 |
| 트렌드 방향 | 5 | 3 | 3 | 3 |
| **소계 (평균)** | **4.7** | **3.3** | **3.0** | **2.7** |

---

## 4. 서드파티 통합

### 4.1 Supabase 서드파티 통합 — 점수: **5/5**

Supabase는 "Works With Supabase" 공식 파트너십 프로그램을 운영하며, 2025년 기준 100개 이상의 공식 통합을 지원한다.

**핵심 통합**

| 카테고리 | 통합 파트너 | 통합 품질 |
|---------|-----------|---------|
| **호스팅** | Vercel (공식 파트너, Marketplace 등록) | ★★★★★ |
| **호스팅** | Netlify | ★★★★ |
| **결제** | Stripe (Supabase + Stripe 공식 가이드 존재) | ★★★★★ |
| **이메일** | Resend (공식 통합, Edge Functions 예제) | ★★★★★ |
| **이메일** | SendGrid | ★★★★ |
| **CMS** | Sanity | ★★★★ |
| **ORM** | Prisma (Supabase 공식 Prisma 가이드) | ★★★★★ |
| **ORM** | Drizzle ORM | ★★★★★ |
| **인증 확장** | Clerk (Supabase JWT 통합) | ★★★★ |
| **실시간** | Trigger.dev | ★★★★ |
| **AI/벡터** | OpenAI (pgvector + embeddings) | ★★★★★ |
| **AI** | LangChain (Supabase Vector Store) | ★★★★★ |
| **워크플로우** | n8n | ★★★★ |
| **모니터링** | Datadog, Sentry | ★★★ |

**Vercel 통합의 특별함**: Supabase는 Vercel Marketplace에 공식 등록되어 있어, Vercel 대시보드에서 Supabase 프로젝트를 직접 생성하고 환경 변수를 자동 동기화할 수 있다. Preview 브랜치 배포 시 Supabase 브랜치 환경도 자동 생성된다.

**Stripe 통합**: Supabase + Stripe + Next.js 조합은 SaaS 스타터킷의 사실상 표준이 되었다. Makerkit, Supastarter 등 여러 상용 SaaS 보일러플레이트가 이 스택을 기반으로 한다.

---

### 4.2 Firebase 서드파티 통합 — 점수: **4/5**

Firebase는 Google 생태계와의 통합이 탁월하다. 동시에 독립 서드파티 통합도 방대하다.

**핵심 통합**

| 카테고리 | 통합 파트너 | 통합 품질 |
|---------|-----------|---------|
| **호스팅** | Vercel (기본 지원) | ★★★★ |
| **호스팅** | Firebase Hosting (자체) | ★★★★★ |
| **결제** | Stripe (Firebase Extensions 포함) | ★★★★ |
| **분석** | Google Analytics (네이티브 통합) | ★★★★★ |
| **광고** | Google Ads (Firebase 링크) | ★★★★★ |
| **ML** | Google ML Kit | ★★★★★ |
| **앱 배포** | Firebase App Distribution | ★★★★★ |
| **테스트** | Google Test Lab | ★★★★★ |
| **ORM** | Prisma (Firebase 어댑터 없음, 한계) | ★★ |

**Google 생태계 우위**: Google Analytics, Google Ads, BigQuery, Google ML Kit 등 Google 제품과의 네이티브 통합은 독보적이다. 특히 모바일 앱 개발에서 Analytics + Crashlytics + App Distribution 통합 경험은 타 플랫폼이 따라오기 힘든 수준이다.

**Prisma 한계**: Firestore는 NoSQL이므로 Prisma 같은 관계형 ORM을 사용할 수 없다. 이는 TypeScript 프로젝트에서 큰 불편함이다.

---

### 4.3 AWS Amplify 서드파티 통합 — 점수: **4/5**

AWS Amplify의 서드파티 통합은 AWS 서비스 에코시스템과의 통합에서 독보적이다.

**핵심 통합**

| 카테고리 | 통합 파트너 | 통합 품질 |
|---------|-----------|---------|
| **CI/CD** | AWS CodePipeline (네이티브) | ★★★★★ |
| **호스팅** | Vercel (기본 지원) | ★★★ |
| **결제** | Stripe (직접 통합, Lambda 함수) | ★★★ |
| **검색** | AWS OpenSearch | ★★★★★ |
| **AI/ML** | Amazon SageMaker, Bedrock | ★★★★★ |
| **이메일** | Amazon SES | ★★★★★ |
| **CDN** | AWS CloudFront (네이티브) | ★★★★★ |
| **보안** | AWS WAF, AWS Shield | ★★★★★ |
| **모니터링** | AWS CloudWatch, X-Ray | ★★★★★ |

**AWS 에코시스템의 강점**: 160개 이상의 AWS 서비스와의 완벽한 통합은 다른 어떤 플랫폼도 제공하지 못하는 수준이다. 특히 Amazon Bedrock(생성형 AI), SageMaker(ML), Rekognition(이미지 분석) 등과의 통합은 엔터프라이즈 AI 앱 개발에 유리하다.

**독립 서드파티 한계**: Stripe, Resend 등 독립 SaaS 서비스와의 통합은 Lambda 함수를 통해 가능하지만, Supabase처럼 "단 몇 줄의 코드로 연결" 수준의 간편함은 없다.

---

### 4.4 Appwrite 서드파티 통합 — 점수: **3/5**

Appwrite는 2025년 이후 통합 생태계를 적극적으로 확장하고 있지만, 아직 Supabase나 Firebase 수준에는 미치지 못한다.

**핵심 통합**

| 카테고리 | 통합 파트너 | 통합 품질 |
|---------|-----------|---------|
| **인증 OAuth** | Google, GitHub, Facebook, Apple 등 30+ | ★★★★★ |
| **결제** | Stripe (Functions 통해 구현) | ★★★ |
| **이메일** | Mailgun, SendGrid (내장 지원) | ★★★★ |
| **메시징** | Twilio, Firebase FCM | ★★★★ |
| **호스팅** | Appwrite Sites (자체, 2025년 출시) | ★★★ |
| **Functions 런타임** | Node.js, Python, PHP, Ruby, Swift, Kotlin, Dart | ★★★★★ |

**Appwrite Sites (2025년 출시)**: 2025년 초 런칭한 Appwrite Sites는 Vercel 대안으로 포지셔닝되었다. Next.js, Nuxt, SvelteKit, Angular, Astro, Remix, Flutter Web 등을 지원하며, Appwrite 백엔드와의 통합 개발 경험을 제공한다. 2025년 8월 1일까지 무료 베타 운영 후 유료 전환.

**통합 생태계의 한계**: Supabase처럼 "Works With" 공식 파트너십 프로그램이나 Vercel Marketplace 등록은 아직 없다. 서드파티 통합은 주로 Functions를 통한 수동 구현에 의존한다.

---

### 서드파티 통합 소계

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|------|----------|----------|-------------|---------|
| 웹 개발 도구 통합 | 5 | 4 | 3 | 3 |
| 결제/이메일 통합 | 5 | 4 | 3 | 3 |
| 클라우드 서비스 통합 | 3 | 5 | 5 | 2 |
| **소계 (평균)** | **4.3** | **4.3** | **3.7** | **2.7** |

---

## 5. 프레임워크 지원

### 5.1 Supabase 프레임워크 지원 — 점수: **5/5**

Supabase는 어떤 플랫폼보다 광범위한 프레임워크를 지원하며, 공식 Quick Start 가이드를 제공한다.

**웹 프레임워크**

| 프레임워크 | 지원 수준 | 공식 가이드 |
|-----------|---------|-----------|
| **Next.js** (App Router) | 완전 지원 | 공식 가이드 + Vercel 템플릿 |
| **Next.js** (Pages Router) | 완전 지원 | 공식 가이드 |
| **Remix** | 완전 지원 | 공식 Quick Start |
| **SvelteKit** | 완전 지원 | 공식 Quick Start |
| **Nuxt 3** | 완전 지원 | 공식 Quick Start |
| **Angular** | 지원 | 공식 Quick Start |
| **Astro** | 지원 | 공식 Quick Start |
| **Solid.js** | 커뮤니티 지원 | 커뮤니티 가이드 |

**모바일/크로스 플랫폼**

| 프레임워크 | 지원 수준 | 비고 |
|-----------|---------|-----|
| **Flutter/Dart** | 완전 지원 | 공식 `supabase_flutter` 패키지 |
| **React Native** | 완전 지원 | `@supabase/supabase-js` 호환 |
| **Swift (iOS)** | 완전 지원 | 공식 `supabase-swift` 패키지 |
| **Android (Kotlin)** | 완전 지원 | 공식 `gotrue-kt` 패키지 |

**`@supabase/ssr` 패키지**: 2023년 도입된 `@supabase/ssr` 패키지는 Next.js App Router의 Server Components, React Server Components, Remix Loaders 등 SSR 환경에서의 쿠키 기반 인증을 표준화했다. 이는 모던 풀스택 개발에서 Supabase의 경쟁력을 크게 높였다.

---

### 5.2 Firebase 프레임워크 지원 — 점수: **4/5**

Firebase는 10년 이상의 역사로 대부분의 주요 플랫폼을 지원하지만, 웹 프레임워크보다는 모바일에 더 강하다.

**웹 프레임워크**

| 프레임워크 | 지원 수준 | 비고 |
|-----------|---------|-----|
| **Next.js** | 지원 | 공식 가이드 존재, SSR 지원 복잡 |
| **Remix** | 커뮤니티 지원 | 공식 가이드 부족 |
| **SvelteKit** | 커뮤니티 지원 | 비공식 통합 |
| **Nuxt** | 커뮤니티 지원 | nuxt-firebase 패키지 |

**모바일 플랫폼 (강점)**

| 플랫폼 | 지원 수준 |
|--------|---------|
| **iOS (Swift)** | 완전 지원, 10년 이상 성숙 |
| **Android (Kotlin/Java)** | 완전 지원, 10년 이상 성숙 |
| **Flutter** | 완전 지원, 공식 FlutterFire |
| **React Native** | 완전 지원 (react-native-firebase) |
| **Unity** | 완전 지원 (게임 개발) |
| **C++** | 완전 지원 (게임 개발) |

**모바일의 독보적 강점**: Firebase의 모바일 SDK는 업계 최고 수준이다. Crashlytics, Performance Monitoring, App Distribution, Remote Config, A/B Testing 등 모바일 앱 개발 라이프사이클 전반을 커버한다.

---

### 5.3 AWS Amplify 프레임워크 지원 — 점수: **4/5**

**웹 프레임워크**

| 프레임워크 | 지원 수준 | 비고 |
|-----------|---------|-----|
| **Next.js** | 완전 지원 | SSR, SSG, ISR 모두 지원 |
| **React** | 완전 지원 | 가장 성숙한 지원 |
| **Angular** | 완전 지원 | 공식 가이드 |
| **Vue** | 완전 지원 | 공식 가이드 |
| **Nuxt** | 지원 | |
| **Remix** | 지원 | |

**모바일**

| 플랫폼 | 지원 수준 |
|--------|---------|
| **Flutter** | 완전 지원 |
| **React Native** | 완전 지원 |
| **iOS (Swift)** | 완전 지원 |
| **Android** | 완전 지원 |

**Amplify Hosting과의 통합**: AWS Amplify Gen 2는 Git 기반 CI/CD 배포가 내장되어 있다. Next.js, Nuxt, SvelteKit 앱을 git push만으로 배포할 수 있으며, Preview 브랜치도 자동 생성된다.

---

### 5.4 Appwrite 프레임워크 지원 — 점수: **4/5**

**웹 프레임워크**

| 프레임워크 | 지원 수준 | 비고 |
|-----------|---------|-----|
| **Next.js** | 완전 지원 | 공식 Quick Start |
| **React** | 완전 지원 | |
| **SvelteKit** | 완전 지원 | 공식 Quick Start + 네이티브 Svelte SDK |
| **Nuxt** | 완전 지원 | 공식 Quick Start |
| **Astro** | 완전 지원 | 공식 Quick Start |
| **Remix** | 완전 지원 | 공식 Quick Start |
| **Angular** | 완전 지원 | 공식 Quick Start |

**모바일**

| 플랫폼 | 지원 수준 |
|--------|---------|
| **Flutter** | 완전 지원 (공식 Flutter SDK) |
| **React Native** | Expo 통해 지원 |
| **iOS (Swift)** | 공식 Swift SDK |
| **Android** | 공식 Kotlin SDK |

**Functions 다중 런타임 (차별점)**: Appwrite Functions는 Node.js, Python, PHP, Ruby, Swift, Kotlin, Java, Go, Dart, .NET, Deno 등 다양한 런타임을 지원한다. 이는 Supabase(Deno/TypeScript), Firebase(Node.js/Python)보다 훨씬 광범위하다.

---

### 프레임워크 지원 소계

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|------|----------|----------|-------------|---------|
| 웹 프레임워크 커버리지 | 5 | 3 | 4 | 5 |
| 모바일 지원 | 4 | 5 | 4 | 4 |
| SSR 지원 품질 | 5 | 3 | 4 | 4 |
| **소계 (평균)** | **4.7** | **3.7** | **4.0** | **4.3** |

---

## 6. 교육 자료

### 6.1 Supabase 교육 자료 — 점수: **5/5**

Supabase는 지난 3년간 교육 콘텐츠 생태계가 폭발적으로 성장했다.

**공식 교육 채널**
- **공식 YouTube 채널**: 정기적인 튜토리얼, Launch Week 발표 영상, "Build in a Weekend" 시리즈
- **공식 블로그**: `supabase.com/blog` — 심층 기술 아티클, 고객 사례, 기능 발표
- **공식 Cookbook**: `supabase.com/docs/guides/ai/examples` — 벡터 검색, AI 통합 예제 모음

**서드파티 교육 콘텐츠**
- **Fireship.io**: 수백만 조회수의 Supabase 소개 영상
- **Theo - t3.gg**: Supabase를 적극 추천하는 인기 YouTube 개발자
- **Kevin Zuniga Cuellar**: Supabase 심화 튜토리얼 시리즈
- **Udemy/Coursera**: 10개 이상의 유료 Supabase 강좌
- **Dev.to**: 수천 개의 커뮤니티 작성 튜토리얼

**한국어 콘텐츠**: 한국 개발자 커뮤니티에서도 Supabase 튜토리얼이 빠르게 증가하고 있다. Velog, 티스토리, YouTube 등에서 한국어 자료를 쉽게 찾을 수 있다.

---

### 6.2 Firebase 교육 자료 — 점수: **4/5**

Firebase는 10년의 역사로 절대적인 교육 자료량을 자랑한다. 모든 언어, 모든 플랫폼에 대한 자료가 존재한다.

**공식 교육 채널**
- **Firebase YouTube**: 수백 개의 공식 튜토리얼 영상
- **Firebase Codelabs**: Google의 인터랙티브 튜토리얼 플랫폼, 고품질 단계별 실습
- **Firebase Blog**: `firebase.blog` — 정기 업데이트
- **Google I/O**: 매년 Google I/O에서 Firebase 세션 발표

**약점**: 많은 교육 자료가 레거시 v8 API 기준으로 작성되어 있어, 최신 v9 Modular API를 학습하는 데 혼란을 준다. Google의 제품 변경(예: Firebase ML Kit → ML Kit 분리)으로 인해 구버전 자료가 잘못된 방향을 안내하는 경우가 있다.

---

### 6.3 AWS Amplify 교육 자료 — 점수: **3/5**

Amplify의 교육 자료는 AWS 공식 문서와 일부 커뮤니티 자료로 구성되지만, 전반적인 접근성이 낮다.

**공식 교육 채널**
- **AWS YouTube**: Amplify 관련 영상이 있으나 AWS 전체에 분산되어 있어 찾기 어렵다
- **AWS Amplify Blog**: 기능 발표 위주, 심층 튜토리얼 부족
- **re:Invent 영상**: AWS re:Invent에서 Amplify 세션 발표

**약점**: Gen 2 관련 고품질 서드파티 튜토리얼이 아직 부족하다. "AWS Amplify Gen 2 tutorial"을 검색하면 결과가 많지 않고, 존재하는 자료도 구버전(Gen 1) 내용이 섞여있다. 커뮤니티 중심의 교육 생태계가 형성되지 않았다.

---

### 6.4 Appwrite 교육 자료 — 점수: **4/5**

Appwrite는 규모에 비해 교육 콘텐츠 생태계가 탄탄하게 구축되어 있다.

**공식 교육 채널**
- **Appwrite YouTube**: 정기적인 튜토리얼, 기능 발표 영상
- **Appwrite Blog**: 기술 아티클 및 커뮤니티 기여 게시물
- **Appwrite Docs Tutorial**: 각 Quick Start가 상세한 단계별 코드 포함
- **Appwrite Hacktoberfest**: 교육 내용 포함된 연례 해커톤

**커뮤니티 기여**: Appwrite 커뮤니티는 활발하게 튜토리얼과 블로그 포스트를 작성한다. Hashnode, Dev.to 등에서 Appwrite 관련 양질의 커뮤니티 자료를 찾을 수 있다.

**약점**: 절대적인 자료 양에서 Supabase, Firebase에 비해 부족하다. 한국어 자료는 특히 제한적이다.

---

### 교육 자료 소계

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|------|----------|----------|-------------|---------|
| 공식 콘텐츠 품질 | 5 | 4 | 3 | 4 |
| 커뮤니티 콘텐츠 양 | 5 | 5 | 2 | 3 |
| 최신성 | 5 | 3 | 3 | 4 |
| **소계 (평균)** | **5.0** | **4.0** | **2.7** | **3.7** |

---

## 7. 상용 사례 및 고객군

### 7.1 Supabase 고객군 — 점수: **4/5**

Supabase는 2024~2025년을 거치며 스타트업 중심에서 미드마켓 및 엔터프라이즈로 고객 기반을 확장했다.

**주요 사용 기업 및 사례**

| 기업/서비스 | 규모 | 활용 방식 |
|-----------|------|---------|
| **Mozilla** | 대기업 | 내부 개발자 도구 |
| **Zapier** | 중견기업 | 백엔드 데이터 관리 |
| **Vercel** | 중견기업 (공식 파트너) | 내부 도구, 생태계 협력 |
| **1Password** | 대기업 | 특정 서비스 백엔드 |
| **Airplane.dev** | 스타트업 (Atlassian 인수) | 내부 도구 플랫폼 |
| **Shotgun** | 스타트업 | 이벤트 플랫폼 |

**스타트업 생태계**: Supabase는 특히 Y Combinator, Sequoia 포트폴리오 스타트업들 사이에서 압도적으로 선호되는 백엔드 플랫폼이다. 2025년 기준 1,200만 명의 활성 개발자 사용자를 보유하고 있으며, 이 중 상당수가 스타트업 개발자다.

**엔터프라이즈 확장**: Supabase는 2025년 SOC 2 Type II 인증, HIPAA 컴플라이언스, GDPR 준수 등 엔터프라이즈 요구사항을 충족하는 기능을 강화했다. 2026년에는 AWS 프라이빗 링크 지원, 커스텀 엔터프라이즈 SLA도 제공한다.

---

### 7.2 Firebase 고객군 — 점수: **5/5**

Firebase는 가장 방대한 고객 기반을 보유한다. Google의 영업력과 10년의 역사가 결합된 결과다.

**주요 사용 기업 및 사례**

| 기업/서비스 | 규모 | 활용 방식 |
|-----------|------|---------|
| **Lyft** | 대기업 (상장) | 드라이버/라이더 앱 |
| **Duolingo** | 대기업 (상장) | 교육 앱 |
| **Alibaba** | 초대기업 | 특정 모바일 서비스 |
| **NPR** | 중견기업 | 미디어 앱 |
| **Shazam** (Apple 인수) | 중견기업 | 음악 인식 앱 |
| **The New York Times** | 대기업 | 뉴스 앱 특정 기능 |
| **Trivago** | 중견기업 | 여행 검색 앱 |

**모바일 앱 시장 지배**: Firebase는 특히 모바일 앱(iOS/Android) 시장에서 압도적인 점유율을 가지고 있다. Google Play Store의 상위 앱 중 상당수가 Firebase를 사용한다.

**Google Cloud의 후광**: Google Cloud 고객이라면 Firebase는 자연스럽게 첫 번째 선택지가 된다. 기업 소프트웨어 조달에서 "Google 제품"이라는 신뢰도는 경쟁사가 쉽게 대체할 수 없는 요소다.

---

### 7.3 AWS Amplify 고객군 — 점수: **4/5**

AWS Amplify는 AWS 고객사(특히 엔터프라이즈 및 공공기관) 내에서 강한 지지기반을 가진다.

**주요 고객 패턴**

| 고객 유형 | 규모 | 특징 |
|---------|------|-----|
| AWS 기존 고객 | 대기업 | AWS 통합 투자 보호 |
| 공공기관 | 대/중견 | FedRAMP, HIPAA 컴플라이언스 |
| 금융 기관 | 대기업 | AWS 보안 인증 활용 |
| 스타트업 (AWS Activate) | 스타트업 | AWS 크레딧 활용 |

**AWS Activate 프로그램**: 스타트업에게 AWS 크레딧을 제공하는 AWS Activate 프로그램을 통해 초기 비용 없이 Amplify를 시작할 수 있다. 이는 스타트업 초기 채택을 유도하는 효과적인 전략이다.

---

### 7.4 Appwrite 고객군 — 점수: **3/5**

Appwrite의 고객군은 주로 셀프호스팅을 선호하는 개발자와 소규모 팀이다.

**주요 고객 패턴**

| 고객 유형 | 특징 |
|---------|-----|
| 인디 해커/1인 개발자 | 셀프호스팅 + 오픈소스 선호 |
| 데이터 프라이버시 민감 스타트업 | GDPR, 데이터 주권 요구 |
| 교육/비영리 | 무료 셀프호스팅 활용 |
| 다중 런타임 요구 팀 | Python/PHP/Ruby Functions 필요 |

**엔터프라이즈 확장 중**: Appwrite는 2025년 엔터프라이즈 기능(MFA, RBAC, SSO, Audit Log)을 강화하며 중견기업 시장 진출을 시도하고 있다. 그러나 아직 대기업 레퍼런스 케이스는 제한적이다.

---

### 상용 사례 소계

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|------|----------|----------|-------------|---------|
| 대기업 레퍼런스 | 4 | 5 | 4 | 2 |
| 스타트업 채택 | 5 | 4 | 3 | 3 |
| 다양성/산업 커버리지 | 4 | 5 | 4 | 2 |
| **소계 (평균)** | **4.3** | **4.7** | **3.7** | **2.3** |

---

## 8. 투자 및 재정 건전성

### 8.1 Supabase 재정 — 점수: **5/5**

Supabase는 2024~2025년 급격한 투자 유치로 재정적 안정성이 크게 강화되었다.

**펀딩 이력**

| 시기 | 라운드 | 금액 | 주요 투자자 | 밸류에이션 |
|------|--------|------|----------|---------|
| 2020년 | Seed | $2M | Mozilla Ventures 등 | 미공개 |
| 2021년 | Series A | $30M | Coatue, YC Continuity | ~$300M |
| 2022년 | Series B | $80M | Felicis Ventures | ~$600M |
| 2024년 9월 | Series C | **$80M** | Peak XV, Craft Ventures | ~$765M |
| 2025년 3월 | Series D | **$200M** | Accel | **$2B** |
| 2025년 10월 | Series E | **$100M** | Accel, Peak XV | **$5B** |

**누적 펀딩 총액**: $500M 이상 (2025년 10월 기준)

**재정 지표**
- 2024년 ARR: $16M
- 2025년 ARR (예상): $27M
- 2026년 활성 개발자: 1,200만 명 (2025 대비 300% 증가)
- 주간 npm 다운로드: 2,000,000+ (2026년 Q1)
- BaaS 시장 점유율: 28% (2026년 Q1, 2025년 12%에서 급증)

**IPO 가능성**: $5B 밸류에이션과 급속 성장으로 2026~2027년 IPO 가능성이 업계에서 거론되고 있다. Forge (사전 IPO 거래 플랫폼)에서도 Supabase 주식이 거래되고 있다.

**투자자 신뢰도**: Accel, Sequoia 스핀오프 Peak XV, YC Continuity 등 최상위 VC의 연속 투자는 장기 지속 가능성에 대한 강한 신호다.

---

### 8.2 Firebase 재정 — 점수: **4/5**

Firebase는 Google(Alphabet) 소유이므로 독립적인 펀딩이나 밸류에이션 정보가 없다. Google의 재정 규모는 물론 어마어마하지만, Firebase가 Google 내에서 어떤 전략적 중요도를 가지는지가 핵심 리스크 요소다.

**강점**
- Google(Alphabet)의 압도적인 재정 지원 잠재력
- 2.9조 달러 시가총액의 모기업
- Google Cloud 매출과 연계된 성장 인센티브

**리스크 요소**
- "Google 제품 종료(Google Graveyard)" 이력: Google+, Allo, Inbox, Google Wave 등 Google의 제품 종료 전력
- Firebase 자체의 독립적 수익 투명성 부재
- Google의 전략 변화 시 Firebase 우선순위 하락 가능성
- 2024~2025년 Google의 AI 집중으로 Firebase 투자 상대적 감소 우려

**안정성 평가**: 단기적으로는 Google의 지원으로 안전하지만, 10년 이상의 의존은 전략적 리스크다. 실제로 일부 Firebase 기능(예: Firebase ML Kit의 일부 기능)이 다른 Google 제품으로 통합/이전되는 변화가 있었다.

---

### 8.3 AWS Amplify 재정 — 점수: **4/5**

AWS Amplify는 Amazon Web Services의 일부이므로 Amazon(AMZN)의 재정 규모 전체를 배경으로 한다.

**강점**
- Amazon의 $2.2조 시가총액
- AWS 매출 ($1,000억 달러/연 규모, 2025년 기준)
- 기업 고객 기반에서의 AWS 브랜드 신뢰도

**리스크 요소**
- AWS의 방대한 서비스 포트폴리오 내에서 Amplify의 우선순위 불확실
- AWS CodeCommit 같은 서비스 종료 전례 (2024년 신규 고객 수용 중단)
- 독립적인 Amplify 팀 규모와 투자 수준이 외부에서 파악 불가

---

### 8.4 Appwrite 재정 — 점수: **3/5**

Appwrite는 상대적으로 초기 단계의 회사다.

**펀딩 이력**

| 시기 | 라운드 | 금액 | 주요 투자자 |
|------|--------|------|----------|
| 2021년 | Seed | $10M | Bessemer Venture Partners, Flybridge Capital |
| 2022년 4월 | Series A | $27M | Tiger Global Management, Bessemer VP |

**재정 지표**
- 누적 펀딩: $37M
- 추정 연간 매출: $6.9M (2025년 기준, 추정치)
- 직원 수: 50~100명 추정

**리스크 분석**
- 누적 펀딩 $37M은 Supabase $500M 대비 매우 낮은 수준
- Tiger Global의 포트폴리오 정리 압박으로 인한 후속 펀딩 불확실성
- 오픈소스 수익화 모델의 특성상 Pro/Cloud 전환율이 재정 건전성의 핵심

**긍정 요소**
- 완전 오픈소스로 클라우드 서비스 없이도 생존 가능한 비즈니스 모델
- 운영 비용이 Supabase 대비 낮을 가능성 (인력 규모 차이)
- 2025년 가격 정책 개편(Pro $15 → $25/월)으로 수익 구조 개선 시도

---

### 투자/재정 건전성 소계

| 항목 | Supabase | Firebase | AWS Amplify | Appwrite |
|------|----------|----------|-------------|---------|
| 재정 안정성 | 5 | 4 | 4 | 2 |
| 성장 지표 | 5 | 3 | 3 | 3 |
| 장기 지속 가능성 | 5 | 4 | 4 | 3 |
| **소계 (평균)** | **5.0** | **3.7** | **3.7** | **2.7** |

---

## 9. 종합 생태계 점수 및 분석

### 9.1 항목별 최종 생태계 점수 매트릭스

| 생태계 평가 항목 | 가중치 | Supabase | Firebase | AWS Amplify | Appwrite |
|--------------|--------|----------|----------|-------------|---------|
| GitHub 지표 | 15% | **5.0** | 2.8 | 3.3 | 4.0 |
| npm 다운로드 트렌드 | 10% | **4.7** | 3.3 | 3.0 | 2.7 |
| 서드파티 통합 | 15% | **4.3** | **4.3** | 3.7 | 2.7 |
| 프레임워크 지원 | 15% | **4.7** | 3.7 | 4.0 | 4.3 |
| 교육 자료 | 15% | **5.0** | 4.0 | 2.7 | 3.7 |
| 상용 사례 | 15% | 4.3 | **4.7** | 3.7 | 2.3 |
| 투자/재정 건전성 | 15% | **5.0** | 3.7 | 3.7 | 2.7 |
| **가중 합계** | **100%** | **4.72** | **3.80** | **3.44** | **3.20** |

### 9.2 종합 생태계 순위

```
1위  Supabase      4.72 / 5.00  ████████████████████ 94.4%
2위  Firebase      3.80 / 5.00  ███████████████░░░░░ 76.0%
3위  AWS Amplify   3.44 / 5.00  █████████████░░░░░░░ 68.8%
4위  Appwrite      3.20 / 5.00  ████████████░░░░░░░░ 64.0%
```

### 9.3 DX + 생태계 통합 순위 (11-dx-matrix.md와 합산)

| 플랫폼 | DX 점수 (11번) | 생태계 점수 (12번) | **통합 점수** |
|--------|-------------|----------------|-----------|
| **Supabase** | 4.88 | 4.72 | **4.80** |
| **Firebase** | 3.79 | 3.80 | **3.80** |
| **AWS Amplify** | 3.17 | 3.44 | **3.31** |
| **Appwrite** | 3.72 | 3.20 | **3.46** |

### 9.4 플랫폼별 생태계 종합 분석

#### Supabase (4.72/5) — 빠르게 성장하는 생태계의 정점

Supabase의 생태계 강점은 단순한 기술 우월성이 아니라 "커뮤니티-투자-성장"의 선순환에 있다. 2025년 $300M 이상의 펀딩은 엔지니어링 투자를 가속했고, 이는 더 나은 제품으로 이어져 더 많은 개발자를 끌어들이는 구조다.

**핵심 생태계 차별점**
1. **Vercel 파트너십**: 현대 웹 개발의 사실상 표준 배포 플랫폼과의 공식 파트너십
2. **오픈소스 + VC 펀딩 조합**: 오픈소스의 투명성과 VC 자금의 실행력을 동시에 갖춘 희귀한 조합
3. **AI/벡터 생태계 선점**: pgvector 통합으로 2024~2025년 AI 붐의 핵심 인프라 역할

**잠재적 리스크**: 급격한 성장 이후의 제품 집중도 저하 가능성, IPO 이후 오픈소스 정책 변경 가능성. 그러나 현재로서는 모든 지표가 긍정적이다.

---

#### Firebase (3.80/5) — 성숙한 거인, 혁신 압박

Firebase는 절대적인 규모(가입자 수, 기업 레퍼런스, 교육 자료)에서 여전히 우위이지만, 성장 모멘텀이 Supabase에 역전되었다. 특히 2025년 Stack Overflow Developer Survey에서 "사용은 하지만 좋아하지 않는" 플랫폼으로 분류된 것은 상징적이다.

**핵심 생태계 약점**
1. **Google 종료 리스크**: 개발자들이 Firebase 채택을 주저하는 가장 큰 이유
2. **오픈소스 생태계 부재**: 핵심 코드가 비공개이므로 커뮤니티 기여가 불가능
3. **모바일 외 경쟁력 약화**: 웹/TypeScript 중심 현대 개발에서의 경쟁력 감소

**Firebase의 미래**: 모바일 앱 개발(특히 Flutter, iOS, Android)에서는 여전히 1위를 유지할 가능성이 높다. Google의 생태계(Analytics, ML Kit, Crashlytics)와의 네이티브 통합은 독보적이다.

---

#### AWS Amplify (3.44/5) — 기업 시장의 강자, 개발자 선호 약점

AWS Amplify의 생태계는 규모에서는 크지만 개발자 친화도는 낮다. AWS의 160개 이상 서비스와의 통합, FedRAMP/HIPAA 컴플라이언스, 글로벌 인프라는 대기업에게 설득력 있는 가치를 제공한다.

**장기 포지셔닝**: Amplify는 "개발자의 첫 번째 선택"보다는 "기업의 안전한 선택"으로 포지셔닝되어 있다. 이 포지션이 유지된다면 생태계 점수의 절대적 수치보다 더 큰 비즈니스 가치를 창출할 수 있다.

---

#### Appwrite (3.20/5) — 오픈소스 커뮤니티의 다크호스

Appwrite는 $37M 펀딩이라는 상대적으로 제한된 재원에도 불구하고 53,000+ GitHub Stars와 활발한 커뮤니티를 구축했다. 이는 제품 자체의 품질과 오픈소스 문화에 대한 진정성이 만들어낸 결과다.

**차별화된 포지션**: Appwrite는 "Supabase의 열등한 대안"이 아니라 "셀프호스팅 + 다중 런타임 + 완전 오픈소스"를 원하는 개발자를 위한 최선의 선택이다. 데이터 주권이 중요한 유럽, 한국 등의 시장에서 경쟁력이 있다.

**재정 우려**: 가장 큰 리스크는 재정 건전성이다. 2022년 Series A 이후 추가 펀딩 소식이 없으며, 수익 모델 강화(Pro 요금 인상)가 사용자 이탈로 이어지지 않도록 균형을 맞추는 것이 과제다.

---

### 9.5 2026년 생태계 예측

| 트렌드 | Supabase | Firebase | AWS Amplify | Appwrite |
|--------|---------|---------|------------|---------|
| AI/벡터DB 수요 | 최대 수혜 (pgvector) | 중립 | AWS Bedrock 연계 강점 | 제한적 |
| 모바일 앱 시장 | 성장 중 | 지속 강세 | 강세 | 제한적 |
| 엣지 컴퓨팅 | Deno Edge Functions | Firebase Hosting CDN | CloudFront | Appwrite Functions |
| 셀프호스팅 수요 | 지원 | 불가 | 제한적 | 최대 수혜 |
| 스타트업 채택 | 지속 증가 | 감소 추세 | 안정 | 성장 중 |

---

### 9.6 최종 권장사항

| 의사결정 기준 | 최적 플랫폼 | 근거 |
|-------------|-----------|-----|
| TypeScript 스타트업, 빠른 출시 | **Supabase** | DX 4.88, 생태계 4.72, Vercel 통합 |
| 모바일 앱 (iOS/Android 우선) | **Firebase** | 성숙한 모바일 SDK, Crashlytics |
| AI/벡터 검색 백엔드 | **Supabase** | pgvector 네이티브, LangChain 통합 |
| AWS 기반 엔터프라이즈 | **AWS Amplify** | AWS 서비스 통합, 컴플라이언스 |
| 셀프호스팅 / 데이터 주권 | **Appwrite** | 완전 오픈소스, 다중 런타임 |
| 장기 재정 안정성 기준 | **Supabase** | $5B 밸류에이션, $500M 펀딩 |

---

*이 문서는 2026년 4월 6일 기준으로 작성되었다. BaaS 시장은 급변하므로 6개월 주기 업데이트를 권장한다. 관련 DX 비교는 `11-dx-matrix.md` 참조.*

---

## 참고 출처

- [Supabase Series E $100M 발표 - TechCrunch](https://techcrunch.com/2025/10/03/supabase-nabs-5b-valuation-four-months-after-hitting-2b/)
- [Supabase Series C $80M - TechCrunch](https://techcrunch.com/2024/09/25/supabase-a-postgres-centric-developer-platform-raises-80m-series-c/)
- [Supabase $5B 밸류에이션 분석 - UV Netware](https://articles.uvnetware.com/software-engineering/supabase-backend-platform-architecture/)
- [Appwrite 펀딩 정보 - Tracxn](https://tracxn.com/d/companies/appwrite/)
- [AWS Amplify Gen 2 GA - InfoQ](https://www.infoq.com/news/2024/05/aws-amplify-gen2/)
- [Firebase vs Supabase vs Appwrite 2026 - UI Bakery](https://uibakery.io/blog/appwrite-vs-supabase-vs-firebase)
- [Supabase Vercel 통합 공식 블로그](https://supabase.com/blog/using-supabase-with-vercel)
- [Appwrite Sites 발표 - Appwrite 공식 블로그](https://appwrite.io/blog/post/announcing-appwrite-sites)
- [2026 BaaS 선택 가이드 - Appwrite](https://appwrite.io/blog/post/choosing-the-right-baas-in-2025)
- [Supabase 통계 2025 - Taptwice Digital](https://taptwicedigital.com/stats/supabase)
- [Supabase GitHub 리포지토리](https://github.com/supabase/supabase)
- [Firebase vs Supabase 2026 비교 - Tech Insider](https://tech-insider.org/supabase-vs-firebase-2026/)
- [2025 Stack Overflow Developer Survey](https://survey.stackoverflow.co/2025/)
- [Appwrite 가격 정책 업데이트](https://appwrite.io/blog/post/appwrite-pricing-update)
- [Supabase vs Firebase for AI Startups - Athenic](https://getathenic.com/blog/supabase-vs-firebase-vs-amplify-ai-startups)
