# Supabase 요금제 & 운영 가이드

> 작성일: 2026-04-06 | Wave 1 리서치 문서

---

## 목차

1. [요금제 전체 개요](#1-요금제-전체-개요)
2. [Free 플랜](#2-free-플랜)
3. [Pro 플랜](#3-pro-플랜)
4. [Team 플랜](#4-team-플랜)
5. [Enterprise 플랜](#5-enterprise-플랜)
6. [리소스 제한 상세](#6-리소스-제한-상세)
7. [초과 과금 단가](#7-초과-과금-단가)
8. [비용 최적화 전략](#8-비용-최적화-전략)
9. [SLA 및 가용성](#9-sla-및-가용성)
10. [지원 체계](#10-지원-체계)
11. [규정 준수 (Compliance)](#11-규정-준수-compliance)

---

## 1. 요금제 전체 개요

Supabase는 **하이브리드 과금 모델**을 채택하고 있다. 고정 월정액(기본 플랜) + 기준 할당량을 초과한 리소스에 대한 종량제(Pay-as-you-go) 방식이다.

### 플랜 비교 한눈에 보기

| 항목 | Free | Pro | Team | Enterprise |
|------|------|-----|------|------------|
| **월 기본 요금** | $0 | $25 | $599 | 협의 |
| **프로젝트 수** | 2개 | 무제한 | 무제한 | 무제한 |
| **DB 크기** | 500MB | 8GB | 8GB | 맞춤 |
| **Storage** | 1GB | 100GB | 100GB | 맞춤 |
| **MAU** | 50,000 | 100,000 | 100,000 | 맞춤 |
| **대역폭** | 5GB | 250GB | 250GB | 맞춤 |
| **Edge Functions** | 500K 호출/월 | 2M 호출/월 | 2M 호출/월 | 맞춤 |
| **백업 보존** | 없음 | 7일 | 14일 | 맞춤 |
| **PITR** | 없음 | 없음 | 없음 | 지원 |
| **SOC2** | 없음 | 없음 | 지원 | 지원 |
| **HIPAA** | 없음 | 없음 | 없음 | 지원 |
| **SLA** | 없음 | 없음 | 99.9% | 맞춤 |
| **지원** | 커뮤니티 | 이메일 | 우선 이메일 | 전담 지원 |

---

## 2. Free 플랜

### 개요

개인 프로젝트, 프로토타입, 학습용으로 설계된 무료 플랜이다.

### 상세 리소스 제한

| 리소스 | 제한 |
|--------|------|
| 활성 프로젝트 수 | 2개 |
| 일시정지 프로젝트 수 | 무제한 |
| DB 크기 | 500MB |
| 파일 스토리지 | 1GB |
| 대역폭 (Egress) | 5GB/월 |
| MAU (Monthly Active Users) | 50,000 |
| Edge Function 호출 | 500,000/월 |
| Edge Function 실행 시간 | 500,000 초/월 |
| Realtime 동시 연결 | 200 |
| Realtime 메시지 | 2,000,000/월 |
| 데이터베이스 커넥션 (풀링) | 최대 200 |
| 로그 보존 | 1일 |
| 자동 백업 | 없음 |

### Free 플랜 주요 제약사항

**1. 비활성 프로젝트 자동 일시정지**

```
7일 이상 활동(API 호출)이 없으면 프로젝트 자동 일시정지
→ 재활성화 시 수동으로 resume 필요
→ 데이터는 보존됨

회피 방법:
- Uptime Robot 등으로 주기적 ping 전송
- 또는 Pro 플랜 업그레이드
```

**2. 백업 없음**

```
Free 플랜은 자동 백업 미제공
→ 중요 데이터는 수동으로 pg_dump 필요
```

**3. 커스텀 도메인 없음**

```
Free: https://xxx.supabase.co (기본 도메인만)
Pro+: 커스텀 도메인 설정 가능
```

### Free → Pro 전환 시점

다음 중 하나라도 해당되면 Pro 업그레이드를 고려:
- 활성 프로젝트 3개 이상 필요
- DB 사용량 400MB 초과 (여유 100MB)
- 프로젝트 일시정지 방지 필요
- 스테이징/프로덕션 환경 분리 필요
- 백업 필요

---

## 3. Pro 플랜

### 개요

소규모 ~ 중규모 프로덕션 서비스에 적합한 플랜이다.

**월 기본 요금: $25/프로젝트**
(초과 사용량은 별도 과금)

### 포함 리소스 (기본 할당량)

| 리소스 | 포함 할당량 | 초과 시 단가 |
|--------|-----------|------------|
| 데이터베이스 크기 | 8GB | $0.125/GB |
| 파일 스토리지 크기 | 100GB | $0.021/GB |
| 스토리지 Egress | 200GB | $0.09/GB |
| 대역폭 (DB Egress) | 250GB | $0.09/GB |
| MAU | 100,000 | $0.00325/MAU |
| Edge Function 호출 | 2,000,000 | $2/백만 건 |
| Edge Function 시간 | 2,000,000초 | $2/백만 초 |
| Realtime 메시지 | 5,000,000 | $2.5/백만 건 |
| Realtime 연결 | 500 | $1/100연결 |

### Pro 플랜 주요 기능

- **자동 일시정지 없음**: 활동 여부와 무관하게 항상 실행
- **7일 자동 백업**: 일일 DB 스냅샷
- **이메일 지원**: 비즈니스 시간 내 응답
- **커스텀 도메인**: 별도 애드온 ($10/월)
- **Point-in-Time Recovery**: 없음 (Team 플랜 이상)
- **컴퓨팅 업그레이드**: Nano → Small → Medium 등 선택 가능

### Pro 플랜 컴퓨팅 업그레이드

기본 Pro 플랜은 Nano 인스턴스(0.5 vCPU, 1GB RAM)를 사용한다. 더 큰 인스턴스로 업그레이드 가능:

| 인스턴스 크기 | vCPU | RAM | 추가 요금 |
|-------------|------|-----|----------|
| Nano (기본) | 0.5 | 1GB | 포함 ($0) |
| Micro | 1 | 1GB | +$10/월 |
| Small | 1 | 2GB | +$15/월 |
| Medium | 2 | 4GB | +$40/월 |
| Large | 4 | 8GB | +$80/월 |
| XL | 8 | 16GB | +$160/월 |
| 2XL | 16 | 32GB | +$320/월 |
| 4XL | 32 | 64GB | +$640/월 |
| 8XL | 64 | 128GB | +$1280/월 |
| 16XL | 128 | 256GB | +$2560/월 |

---

## 4. Team 플랜

### 개요

팀 협업, 에이전시, 중대형 서비스에 적합하다.

**월 기본 요금: $599/조직**
(조직 내 무제한 프로젝트 + 무제한 팀 멤버)

### Team 플랜 추가 기능 (Pro 대비)

| 기능 | Pro | Team |
|------|-----|------|
| 백업 보존 기간 | 7일 | 14일 |
| Point-in-Time Recovery | 없음 | 지원 (최대 7일) |
| SOC 2 Type 2 | 없음 | 지원 |
| SSO (SAML 2.0) | 없음 | 지원 |
| 감사 로그 (Audit Log) | 없음 | 지원 |
| 우선 이메일 지원 | 없음 | 지원 |
| 커스텀 도메인 | 유료 애드온 | 포함 |
| 청구서 기반 결제 | 없음 | 지원 |
| 전용 Slack 채널 | 없음 | 선택 |

### Team 플랜 적합 대상

- 5명 이상의 개발팀
- SOC 2 인증이 필요한 B2B SaaS
- 여러 클라이언트 프로젝트를 관리하는 에이전시
- 감사 추적이 필요한 규제 산업

---

## 5. Enterprise 플랜

### 개요

대기업, 정부, 금융/의료 기관을 위한 맞춤형 플랜이다.

**요금: 연간 계약 협의** (최소 $2,000/월 이상으로 알려짐)

### Enterprise 전용 기능

| 기능 | 설명 |
|------|------|
| **HIPAA 준수** | BAA(Business Associate Agreement) 체결 |
| **전용 인프라** | 전용 서버 또는 전용 클러스터 |
| **커스텀 SLA** | 99.99% 이상 가동시간 보장 가능 |
| **전담 지원 엔지니어** | 24/7 전담 기술 지원 |
| **맞춤 리소스 한도** | DB 크기, MAU 등 모두 협의 |
| **온프레미스/VPC 배포** | 고객 VPC 내 배포 가능 |
| **PITR 최대 35일** | Point-in-Time Recovery 기간 확장 |
| **커스텀 보안 정책** | IP 화이트리스트, VPN 통합 등 |

### Enterprise 문의 방법

```
https://supabase.com/contact/enterprise
- 회사명, 규모, 사용 사례 기재
- 평균 응답 시간: 영업일 1-2일
```

---

## 6. 리소스 제한 상세

### 데이터베이스 관련

**커넥션 제한**:

| 플랜/인스턴스 | 직접 연결 | 풀링 연결 (Supavisor) |
|-------------|----------|-------------------|
| Free (Nano) | 60 | 200 |
| Pro (Nano) | 60 | 200 |
| Pro (Small) | 90 | 400 |
| Pro (Medium) | 120 | 200 |
| Pro (Large) | 160 | 300 |
| Pro (XL+) | 240 | 300 |

**트랜잭션 모드 풀링 (포트 6543)**:
```
서버리스 환경, Next.js Edge Runtime, Cloudflare Workers 등
단기 연결을 대량으로 처리할 때 사용
→ prepared statement 사용 불가
→ 각 쿼리 후 연결 즉시 반환
```

**세션 모드 풀링 (포트 5432)**:
```
일반 애플리케이션 서버에서 사용
→ prepared statement 지원
→ 세션 수준 설정 유지
```

### 인증 (Auth) MAU 계산 방식

```
MAU = 해당 월에 하나라도 인증 활동이 있는 고유 사용자 수

포함:
- 로그인 (이메일/소셜/매직링크 등)
- 회원가입
- 세션 갱신 (토큰 리프레시)
- 비밀번호 변경

미포함:
- 단순 데이터 읽기/쓰기 (로그인 상태라도 인증 갱신 없으면 카운트 안 됨)
```

### Edge Functions 제한

| 항목 | Free | Pro |
|------|------|-----|
| 함수 개수 | 10 | 무제한 |
| 요청당 최대 실행 시간 | 2초 (CPU) | 2초 (CPU) |
| 요청당 최대 벽시계 시간 | 150초 | 150초 |
| 요청당 메모리 | 256MB | 256MB |
| 월 호출 수 | 500,000 | 2,000,000 |
| 월 실행 시간 | 500,000초 | 2,000,000초 |
| 번들 크기 제한 | 20MB | 20MB |

### Realtime 제한

| 항목 | Free | Pro |
|------|------|-----|
| 동시 채널 (전체) | 200 | 500 |
| 채널당 구독자 | 100 | 100 |
| 메시지 크기 | 250KB | 250KB |
| 채널당 초당 메시지 | 10 | 10 |
| 월 총 메시지 | 2,000,000 | 5,000,000 |

---

## 7. 초과 과금 단가

### 전체 초과 과금표

| 리소스 | 단가 |
|--------|------|
| **데이터베이스 크기** | $0.125 / GB / 월 |
| **파일 스토리지 크기** | $0.021 / GB / 월 |
| **스토리지 Egress** | $0.09 / GB |
| **DB Egress** | $0.09 / GB |
| **MAU** | $0.00325 / MAU |
| **SSO MAU** | $0.015 / MAU |
| **Edge Function 호출** | $2.00 / 백만 건 |
| **Edge Function 실행 시간** | $2.00 / 백만 초 |
| **Realtime 메시지** | $2.50 / 백만 건 |
| **Realtime 동시 연결** | $1.00 / 100개 피크 연결 |
| **커스텀 도메인** | $10.00 / 프로젝트 / 월 |
| **IPv4** | $4.00 / 프로젝트 / 월 |
| **PITR (7일)** | $100.00 / 프로젝트 / 월 |
| **PITR (14일)** | $200.00 / 프로젝트 / 월 |
| **PITR (28일)** | $400.00 / 프로젝트 / 월 |

### 실제 비용 시뮬레이션

**시나리오 1: MAU 5만, 초기 스타트업**
```
Pro 기본: $25
DB 크기 2GB (8GB 내): $0
스토리지 10GB (100GB 내): $0
MAU 50,000 (100,000 내): $0
대역폭 50GB (250GB 내): $0
Edge Function 100만 건 (2M 내): $0
────────────────────────────────
합계: $25/월
```

**시나리오 2: MAU 20만, 성장 스타트업**
```
Pro 기본: $25
컴퓨팅 Medium 업그레이드: +$40
추가 MAU 100,000건: 100,000 × $0.00325 = $325
DB 크기 5GB 초과 (13GB 사용): $0.125 × 5 = $0.625
스토리지 50GB 초과 (150GB): $0.021 × 50 = $1.05
대역폭 100GB 초과 (350GB): $0.09 × 100 = $9
Edge Function 1M 초과 (3M): $2 × 1 = $2
────────────────────────────────
합계: ~$402/월
```

**시나리오 3: MAU 100만, 중규모 서비스**
```
Team 기본: $599
컴퓨팅 Large × 3 프로젝트: +$240
추가 MAU 900,000건: 900,000 × $0.00325 = $2,925
DB 크기 200GB: $0.125 × (200-8) = $24
스토리지 1TB: $0.021 × (1000-100) = $18.9
대역폭 5TB: $0.09 × (5000-250) = $427.5
────────────────────────────────
합계: ~$4,234/월
→ Enterprise 협의 고려
```

---

## 8. 비용 최적화 전략

### 8.1 커넥션 풀링으로 DB 부하 감소

```typescript
// 비효율적: 모든 요청마다 새 연결 생성
// (서버리스 환경에서 흔한 실수)
const supabase = createClient(url, key)  // 매 요청마다

// 최적: 트랜잭션 모드 풀링 사용 (포트 6543)
// next.config.js
process.env.SUPABASE_DB_URL = process.env.SUPABASE_DB_URL_TRANSACTION_POOLER
// postgresql://[user].[project-ref]:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres

// 글로벌 싱글톤으로 클라이언트 관리
let supabaseInstance: ReturnType<typeof createClient> | null = null
export function getSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key)
  }
  return supabaseInstance
}
```

### 8.2 CDN 활용으로 Egress 비용 절감

```javascript
// Supabase Storage URL 변환 (CDN 캐싱)

// 원본 URL (매번 Supabase에서 다운로드)
const originalUrl = supabase.storage
  .from('avatars')
  .getPublicUrl('user123.jpg').data.publicUrl
// https://xxx.supabase.co/storage/v1/object/public/avatars/user123.jpg

// Cloudflare CDN 설정으로 캐싱
// CNAME: cdn.yourdomain.com → xxx.supabase.co
// 이후 캐싱된 리소스는 Supabase Egress 비용 발생 안 함

// 이미지 변환 + 캐싱 (imgproxy 활용)
const optimizedUrl = supabase.storage
  .from('avatars')
  .getPublicUrl('user123.jpg', {
    transform: {
      width: 200,
      height: 200,
      format: 'webp',
      quality: 80,
    }
  }).data.publicUrl
```

### 8.3 쿼리 최적화로 DB 부하 감소

```sql
-- 문제: N+1 쿼리
-- 코드에서 users 가져오고, 각각 posts 가져오면 비효율

-- 해결: JOIN 또는 관계 쿼리 활용
SELECT
  users.id,
  users.email,
  COUNT(posts.id) AS post_count
FROM users
LEFT JOIN posts ON posts.author_id = users.id
GROUP BY users.id, users.email;
```

```typescript
// Supabase JS에서 관계 데이터 한 번에 가져오기
const { data } = await supabase
  .from('users')
  .select(`
    id,
    email,
    posts (
      id,
      title,
      created_at
    )
  `)
  // 단일 쿼리로 users + posts 동시 로드
```

### 8.4 인덱스 최적화

```sql
-- 자주 쓰는 필터 컬럼에 인덱스 생성
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_published ON posts(published) WHERE published = true;

-- 복합 인덱스 (WHERE + ORDER BY 패턴)
CREATE INDEX idx_posts_author_created
  ON posts(author_id, created_at DESC);

-- 텍스트 검색 인덱스
CREATE INDEX idx_posts_title_search
  ON posts USING gin(to_tsvector('korean', title));
```

### 8.5 Row Level Security (RLS) 성능 최적화

```sql
-- 비효율적 RLS 정책 (auth.uid() 매번 호출)
CREATE POLICY "Users can read own posts" ON posts
  FOR SELECT
  USING (author_id = auth.uid());  -- 매 행마다 함수 호출

-- 최적화: 인덱스와 함께 사용
-- posts 테이블의 author_id에 인덱스 필수
CREATE INDEX idx_posts_author_id ON posts(author_id);

-- 또는 auth.jwt() 클레임 활용 (더 빠름)
CREATE POLICY "Users can read own posts" ON posts
  FOR SELECT
  USING (author_id = (auth.jwt() ->> 'sub')::uuid);
```

### 8.6 캐싱 전략

```typescript
// Next.js App Router에서 Supabase 데이터 캐싱

// 방법 1: fetch 캐시 활용
const { data } = await supabase
  .from('categories')
  .select('*')
  // 내부적으로 fetch 사용 → Next.js가 캐싱

// 방법 2: unstable_cache 활용
import { unstable_cache } from 'next/cache'

const getCachedCategories = unstable_cache(
  async () => {
    const { data } = await supabase.from('categories').select('*')
    return data
  },
  ['categories'],
  { revalidate: 3600 }  // 1시간마다 재검증
)

// 방법 3: Redis/Upstash 활용 (외부 캐시)
import { Redis } from '@upstash/redis'
const redis = new Redis({ ... })

export async function getCategoriesCached() {
  const cached = await redis.get('categories')
  if (cached) return cached

  const { data } = await supabase.from('categories').select('*')
  await redis.set('categories', data, { ex: 3600 })
  return data
}
```

### 8.7 MAU 최적화

```typescript
// MAU 카운트 줄이기: 세션 갱신 최소화

// 짧은 JWT 만료 시간 설정 → 잦은 갱신 → MAU 증가에 영향 없음
// (MAU는 고유 사용자 기준, 갱신 횟수 아님)

// Auth 설정에서 Anonymous Sign-in 활용
// 비회원도 서비스 사용 가능, MAU로 카운트됨 주의
const { data: { session } } = await supabase.auth.signInAnonymously()

// 비회원 세션을 가능한 유지
// (회원가입 없이 익명 사용자로 처리하면 MAU 절약 가능)
```

### 8.8 스토리지 비용 절감

```typescript
// 이미지 최적화 업로드
async function uploadOptimizedImage(file: File) {
  // 업로드 전 클라이언트 사이드 압축
  const canvas = document.createElement('canvas')
  // ... 리사이즈/압축 로직

  const { data, error } = await supabase.storage
    .from('images')
    .upload(`${userId}/${Date.now()}.webp`, compressedBlob, {
      contentType: 'image/webp',
      cacheControl: '3600',  // CDN 캐싱
      upsert: false
    })
}

// 미사용 파일 정기 정리
async function cleanupOldFiles() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: files } = await supabase.storage
    .from('temp-uploads')
    .list('', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'asc' }
    })

  const oldFiles = files?.filter(f =>
    new Date(f.created_at) < thirtyDaysAgo
  )

  if (oldFiles?.length) {
    await supabase.storage
      .from('temp-uploads')
      .remove(oldFiles.map(f => f.name))
  }
}
```

---

## 9. SLA 및 가용성

### 플랜별 SLA

| 플랜 | 가동시간 SLA | 지원 응답 시간 |
|------|------------|--------------|
| Free | 없음 | 커뮤니티 (보장 없음) |
| Pro | 없음 | 영업일 이메일 |
| Team | 99.9% | 우선 이메일 (24시간 내) |
| Enterprise | 맞춤 (최대 99.99%) | 24/7 전담 |

### 99.9% SLA의 의미

```
99.9% = 월 최대 허용 다운타임 43.8분
99.95% = 월 최대 허용 다운타임 21.9분
99.99% = 월 최대 허용 다운타임 4.4분
```

### 가용성 향상을 위한 설계 패턴

```typescript
// 1. 재시도 로직 (transient 오류 대비)
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
  throw new Error('Max retries exceeded')
}

// 사용 예
const data = await withRetry(() =>
  supabase.from('posts').select('*')
)

// 2. 읽기 전용 복제본 활용 (Enterprise)
// 읽기 쿼리는 복제본에서, 쓰기는 주 DB에서
const readSupabase = createClient(replicaUrl, key)
const writeSupabase = createClient(primaryUrl, key)

// 3. 오프라인 대응 (IndexedDB + 동기화)
import { createClient } from '@supabase/supabase-js'
import Dexie from 'dexie'

// 오프라인 시 로컬 IndexedDB에 저장 후 온라인 시 동기화
```

### 상태 모니터링

```
Supabase 공식 상태 페이지:
https://status.supabase.com

구성요소별 상태 확인 가능:
- API
- Dashboard
- Database
- Realtime
- Storage
```

---

## 10. 지원 체계

### 플랜별 지원 수준

| 지원 채널 | Free | Pro | Team | Enterprise |
|----------|------|-----|------|------------|
| **GitHub Discussions** | O | O | O | O |
| **Discord 커뮤니티** | O | O | O | O |
| **이메일 지원** | X | O | O | O |
| **우선 이메일** | X | X | O | O |
| **전담 Slack 채널** | X | X | 선택 | O |
| **전담 지원 엔지니어** | X | X | X | O |
| **온보딩 세션** | X | X | X | O |

### 지원 요청 방법

**GitHub Issues (버그 리포트)**:
```
https://github.com/supabase/supabase/issues
- 버그, 기능 요청에 적합
- 공개적으로 추적 가능
```

**Discord 커뮤니티**:
```
https://discord.supabase.com
- 빠른 질문/답변
- 9만+ 멤버
- #help, #support 채널 활용
```

**이메일 지원 (Pro+)**:
```
support@supabase.com
또는 Dashboard → Help → Support
- 계정 문제, 청구 문제, 기술 지원
```

---

## 11. 규정 준수 (Compliance)

### SOC 2 Type 2

```
적용 플랜: Team, Enterprise

SOC 2 Type 2 = 6개월 이상의 보안 통제 감사
→ 서비스 제공자의 데이터 보안, 가용성, 처리 무결성,
  기밀성, 개인정보 보호 정책 검증

보고서 요청:
https://forms.supabase.com/soc2
(NDA 서명 후 제공)
```

### HIPAA (의료 정보 보호)

```
적용 플랜: Enterprise (HIPAA 애드온)

필수 조건:
1. Enterprise 플랜 가입
2. HIPAA 애드온 활성화
3. BAA (Business Associate Agreement) 체결
4. 조직의 HIPAA 의무 준수 (공유 책임 모델)

BAA 체결 후 가능한 작업:
- PHI (Protected Health Information) 저장
- HIPAA 감사 로그
- 강화된 암호화

주의: BAA는 Supabase가 기술적 보안 통제를 제공하지만,
      조직의 HIPAA 프로세스는 고객 책임
```

### GDPR (유럽 개인정보 보호법)

```
Supabase의 GDPR 지원:
- 데이터 처리 계약(DPA) 제공
- EU 지역 데이터 거주 (eu-central-1, eu-west-1 등)
- 데이터 삭제 기능 (사용자 데이터 완전 삭제)
- 데이터 내보내기 (GDPR 이동권)

프로젝트 생성 시 EU 리전 선택으로 GDPR 데이터 거주 요건 충족:
- eu-central-1 (Frankfurt, Germany)
- eu-west-1 (Ireland)
- eu-west-2 (London, UK)
```

### 데이터 거주 (Data Residency)

```
사용 가능한 리전:
ap-northeast-1   Tokyo, Japan
ap-northeast-2   Seoul, South Korea
ap-south-1       Mumbai, India
ap-southeast-1   Singapore
ap-southeast-2   Sydney, Australia
ca-central-1     Canada
eu-central-1     Frankfurt, Germany
eu-west-1        Ireland
eu-west-2        London, UK
sa-east-1        São Paulo, Brazil
us-east-1        N. Virginia, USA
us-west-1        N. California, USA

한국 서비스: ap-northeast-2 (서울) 선택 권장
```

### 공유 책임 모델

```
Supabase 책임:
- 인프라 보안 (물리적 보안, 네트워크 보안)
- PostgreSQL 패치 및 업데이트
- 백업 인프라 관리
- SOC 2 통제 구현 및 감사
- 플랫폼 가용성

고객 책임:
- 데이터베이스 접근 제어 (RLS 정책)
- API 키 보안 관리
- 애플리케이션 레벨 보안
- GDPR/HIPAA 비즈니스 프로세스
- 사용자 데이터 처리 정책
- 보안 설정 구성 (MFA 강제, 이메일 확인 등)
```

### 보안 모범 사례

```typescript
// 1. 서비스 롤 키 서버 사이드에서만 사용
// ❌ 클라이언트에 노출 금지
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
// → 절대 process.env.NEXT_PUBLIC_ 변수로 사용 금지

// 2. RLS 항상 활성화
-- 모든 테이블에 RLS 필수
ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;

-- 기본 거부 정책 (명시적 허용만)
CREATE POLICY "deny_all" ON sensitive_data AS RESTRICTIVE
  USING (false);

// 3. JWT 시크릿 강력하게 설정
// 최소 32자, 무작위 문자열
// openssl rand -base64 32

// 4. 이메일 확인 강제 (Auth 설정)
// Dashboard → Auth → Settings
// "Confirm email" 활성화

// 5. MFA 강제 (Enterprise)
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp'
})
```

---

## 참고 자료

- [Supabase 공식 요금 페이지](https://supabase.com/pricing)
- [요금 청구 가이드](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Edge Functions 요금](https://supabase.com/docs/guides/functions/pricing)
- [Realtime 요금](https://supabase.com/docs/guides/realtime/pricing)
- [SOC 2 컴플라이언스](https://supabase.com/docs/guides/security/soc-2-compliance)
- [HIPAA 컴플라이언스](https://supabase.com/docs/guides/security/hipaa-compliance)
- [상태 페이지](https://status.supabase.com)
