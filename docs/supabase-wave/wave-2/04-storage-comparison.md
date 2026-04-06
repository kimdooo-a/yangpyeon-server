# 스토리지 플랫폼 비교: Supabase Storage vs AWS S3 vs Cloudflare R2

> Wave-2 리서치 문서 | 작성일: 2026-04-06  
> 대상 독자: 풀스택 개발자, 인프라 설계자  
> 목적: 프로젝트 규모별 최적 스토리지 플랫폼 선택 가이드

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [핵심 기능 비교](#2-핵심-기능-비교)
3. [가격 구조 상세 비교](#3-가격-구조-상세-비교)
4. [SDK 및 통합](#4-sdk-및-통합)
5. [성능 및 글로벌 분산](#5-성능-및-글로벌-분산)
6. [의사결정 가이드](#6-의사결정-가이드)
7. [7항목 스코어링](#7-7항목-스코어링)

---

## 1. 아키텍처 개요

### 1.1 Supabase Storage — S3 호환 통합 스토리지

Supabase Storage는 PostgreSQL 기반의 메타데이터 관리와 S3 호환 오브젝트 스토리지를 결합한 통합형 솔루션이다. 단순한 파일 스토리지가 아니라, Supabase의 인증(Auth) 및 RLS(Row Level Security) 정책과 깊게 결합되어 있다는 점이 가장 큰 특징이다.

**내부 구조:**
```
클라이언트 요청
    ↓
Supabase Storage API (PostgREST 기반)
    ↓
PostgreSQL (storage.objects, storage.buckets 테이블 — 메타데이터)
    ↓
실제 파일 저장소 (S3 호환 백엔드)
    ↓
Smart CDN (285개 이상 도시 글로벌 캐시)
```

Supabase Storage의 백엔드는 실제로 S3 호환 오브젝트 스토리지 위에 구축되어 있다. 파일 메타데이터(경로, 소유자, MIME 타입, 크기)는 PostgreSQL의 `storage.objects` 테이블에 저장되며, 이것이 RLS 정책을 통한 세밀한 접근 제어를 가능하게 하는 핵심이다.

**주요 특징:**
- PostgreSQL RLS 정책으로 행 단위 파일 접근 제어
- Supabase Auth JWT와 원활한 통합
- S3 호환 API 지원 (기존 S3 SDK 사용 가능)
- Smart CDN 기본 포함 (변경사항 60초 내 글로벌 전파)
- 이미지 변환 API (별도 과금)

**아키텍처 강점:** 인증과 스토리지가 동일 플랫폼에서 동작하므로, 사용자별 파일 접근 제어 로직을 별도로 구현하지 않아도 된다. Supabase JWT에서 `sub` 클레임이 자동으로 파일 소유자(owner)로 매핑된다.

---

### 1.2 AWS S3 — 오브젝트 스토리지의 원조

Amazon S3(Simple Storage Service)는 2006년 출시된 클라우드 오브젝트 스토리지의 표준이다. 현재 시장에 존재하는 대부분의 "S3 호환" 서비스는 AWS S3의 API를 모방한 것이다. AWS 생태계의 중심축으로, EC2, Lambda, CloudFront, IAM 등 수백 개의 AWS 서비스와 긴밀하게 통합된다.

**내부 구조:**
```
클라이언트 요청
    ↓
S3 API 엔드포인트 (리전별)
    ↓
스토리지 클래스 선택 (Standard / IA / Glacier 등)
    ↓
AWS 글로벌 인프라 (리전 내 다중 AZ 복제)
    ↓
CDN: CloudFront 별도 구성 필요 (리전 간 이그레스 무료)
```

**스토리지 클래스 계층:**

| 클래스 | 용도 | 월 요금 (GB당) |
|--------|------|---------------|
| S3 Standard | 자주 접근하는 데이터 | $0.023 |
| S3 Standard-IA | 드물게 접근 | $0.0125 |
| S3 One Zone-IA | 단일 AZ, 저가 | $0.01 |
| S3 Glacier Instant | 아카이브, 즉시 복원 | $0.004 |
| S3 Glacier Flexible | 아카이브, 1-5분 복원 | $0.0036 |
| S3 Glacier Deep Archive | 장기 아카이브 | $0.00099 |

**아키텍처 강점:** 99.999999999%(11 nine) 내구성 보장, 다양한 스토리지 클래스로 비용 최적화, AWS 생태계 전체와 네이티브 통합. 버전 관리, 수명 주기 정책, 복제 등 엔터프라이즈급 기능이 기본 포함.

---

### 1.3 Cloudflare R2 — 제로 이그레스 오브젝트 스토리지

Cloudflare R2는 2022년 정식 출시된 S3 호환 오브젝트 스토리지로, "이그레스 비용 없음(Zero Egress)"을 핵심 차별점으로 내세운다. AWS S3의 가장 큰 비용 요소인 대역폭 과금을 완전히 제거하여, 대용량 파일 서빙이 필요한 애플리케이션에서 극적인 비용 절감을 제공한다.

**내부 구조:**
```
클라이언트 요청
    ↓
Cloudflare 글로벌 네트워크 (330+ 데이터센터)
    ↓
R2 버킷 (지역 선택: APAC / EEUR / ENAM / WNAM / OC)
    ↓
Cloudflare Workers 통합 (엣지에서 직접 접근)
    ↓
이그레스: 무료 (모든 스토리지 클래스)
```

**스토리지 클래스:**
- **Standard**: 자주 접근하는 데이터 — $0.015/GB/월
- **Infrequent Access**: 드물게 접근, 30일 최소 보관 — $0.01/GB/월 (검색 비용 별도)

**아키텍처 강점:** Cloudflare Workers와 직접 R2 버킷을 바인딩하여 엣지에서 파일을 처리할 수 있다. CDN과 스토리지가 동일 네트워크 위에 있어 이그레스 비용이 발생하지 않는다. S3 호환 API로 기존 S3 SDK를 그대로 사용할 수 있다.

---

## 2. 핵심 기능 비교

### 2.1 이미지 변환 (Image Transformation)

#### Supabase Storage 이미지 변환

Supabase는 스토리지 URL에 쿼리 파라미터를 추가하는 방식으로 동적 이미지 변환을 제공한다.

```typescript
// 이미지 변환 예시
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl('user-123.jpg', {
    transform: {
      width: 300,
      height: 300,
      resize: 'cover',    // 'cover' | 'contain' | 'fill'
      format: 'webp',     // 자동 WebP 변환
      quality: 80,
    },
  })
```

**지원 변환 옵션:**
- 리사이즈 (width, height)
- 크롭 모드 (cover, contain, fill)
- 포맷 변환 (WebP 자동 최적화)
- 품질 조정 (1-100)
- Smart CDN 캐싱으로 변환 결과 캐시

**과금:** 이미지 변환은 별도 과금. Pro 플랜 기준 월 100개 무료, 이후 $5/100개 변환.

#### AWS S3 이미지 변환

S3 자체는 이미지 변환 기능이 없다. 별도 서비스 조합 필요:
- **CloudFront + Lambda@Edge**: URL 요청 시 Lambda에서 Sharp로 변환
- **AWS Amplify**: 이미지 최적화 미들웨어 제공
- **Imgix / Cloudinary**: 서드파티 이미지 CDN 연동

설정 복잡도가 높지만 완전한 커스터마이징이 가능하다.

#### Cloudflare R2 이미지 변환

R2 자체는 이미지 변환 기능이 없다. 그러나 Cloudflare 생태계 내에서:
- **Cloudflare Images**: 별도 서비스, 월 $5부터 (최대 20개 변종 per 이미지)
- **Workers + Wasm**: Rust/C로 컴파일된 이미지 처리 라이브러리를 Workers에서 실행
- **Image Resizing** (Workers Plans에서 사용 가능): URL 기반 동적 리사이징

---

### 2.2 CDN 및 글로벌 배포

| 기능 | Supabase Storage | AWS S3 | Cloudflare R2 |
|------|-----------------|--------|---------------|
| CDN 기본 포함 | 예 (Smart CDN) | 아니오 (CloudFront 별도) | 예 (Cloudflare 네트워크) |
| 글로벌 PoP | 285개 도시 | 리전 내 (CloudFront 450+) | 330개 이상 데이터센터 |
| CDN 이그레스 무료 | 부분적 (250GB/월) | S3→CloudFront 무료 | 완전 무료 |
| 캐시 무효화 | 60초 내 자동 | 수동 또는 자동 (비용 발생) | Cloudflare Cache 규칙 사용 |
| 커스텀 도메인 | 예 (Pro 플랜) | CloudFront 통해 | 예 (기본 제공) |

---

### 2.3 접근 제어

#### Supabase Storage 접근 제어

Supabase Storage의 가장 독보적인 기능은 PostgreSQL RLS(Row Level Security) 기반 접근 제어다.

```sql
-- 예시: 사용자 자신의 파일만 다운로드 허용
CREATE POLICY "개인 파일 다운로드"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'private-files'
  AND auth.uid() = owner
);

-- 예시: 팀 멤버만 팀 폴더 접근 허용
CREATE POLICY "팀 파일 접근"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'team-files'
  AND (storage.foldername(name))[1] IN (
    SELECT team_id::text FROM team_members
    WHERE user_id = auth.uid()
  )
);
```

버킷은 기본적으로 **비공개(Private)**이며, 명시적 RLS 정책이 없으면 어떤 업로드도 차단된다. 공개 버킷으로 설정하면 다운로드는 제한 없이 허용되지만 업로드/삭제는 여전히 RLS 적용.

#### AWS S3 접근 제어

S3는 다층적 접근 제어를 제공한다:
- **버킷 정책 (Bucket Policy)**: JSON 형식의 리소스 기반 정책
- **IAM 정책**: 사용자/역할 기반 자격증명 정책
- **ACL (Access Control List)**: 레거시 방식 (신규 버킷은 ACL 비활성화 권장)
- **VPC 엔드포인트 정책**: 특정 VPC에서만 접근 허용
- **MFA Delete**: 삭제 시 MFA 인증 요구

```json
// 버킷 정책 예시: 특정 IAM 역할만 허용
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::123456789012:role/MyAppRole" },
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}
```

#### Cloudflare R2 접근 제어

R2는 두 가지 접근 방식을 제공한다:
- **공개 버킷**: 모든 사용자가 읽기 가능
- **비공개 버킷 + API 토큰**: R2 API 토큰으로 접근
- **Presigned URLs**: 임시 서명된 URL로 시간 제한 접근
- **Workers 미들웨어**: Workers에서 인증 로직 직접 구현

R2는 S3처럼 IAM 정책 시스템이 없으며, 세밀한 사용자별 접근 제어가 필요하면 Workers를 사용해야 한다.

---

### 2.4 서명 URL (Signed URLs / Presigned URLs)

| 기능 | Supabase Storage | AWS S3 | Cloudflare R2 |
|------|-----------------|--------|---------------|
| 서명 URL 생성 | 예 (createSignedUrl) | 예 (getSignedUrl) | 예 (AWS SigV4 호환) |
| 만료 시간 설정 | 예 | 예 (최대 7일) | 예 |
| 업로드용 서명 URL | 예 (createSignedUploadUrl) | 예 (PUT presigned) | 예 |
| 다운로드용 서명 URL | 예 | 예 | 예 |
| 일괄 서명 URL | 예 (createSignedUrls) | 예 | 아니오 (개별 생성) |

```typescript
// Supabase Storage 서명 URL 예시
const { data, error } = await supabase.storage
  .from('private-bucket')
  .createSignedUrl('path/to/file.pdf', 3600) // 1시간 유효

// 업로드용 서명 URL
const { data: uploadData } = await supabase.storage
  .from('uploads')
  .createSignedUploadUrl('user-uploads/document.pdf')
```

---

### 2.5 재개 가능 업로드 (Resumable Upload)

대용량 파일 업로드 시 네트워크 중단에 대응하는 재개 가능 업로드 지원 여부:

| 기능 | Supabase Storage | AWS S3 | Cloudflare R2 |
|------|-----------------|--------|---------------|
| 멀티파트 업로드 | 예 (TUS 프로토콜) | 예 (네이티브 멀티파트) | 예 (멀티파트 API) |
| 재개 가능 업로드 | 예 (TUS 표준 구현) | 예 | 예 |
| 최소 파트 크기 | 5MB | 5MB (마지막 파트 제외) | 5MB (마지막 파트 제외) |
| 최대 파일 크기 | 50GB (Pro 기준) | 5TB | 5GB (단일 객체) |
| 최대 파트 수 | 제한 없음 | 10,000개 | 10,000개 |

**Supabase TUS 업로드 예시:**
```typescript
import { Upload } from 'tus-js-client'

const upload = new Upload(file, {
  endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
  retryDelays: [0, 3000, 5000, 10000],
  headers: {
    authorization: `Bearer ${session.access_token}`,
    'x-upsert': 'true',
  },
  uploadDataDuringCreation: true,
  metadata: {
    bucketName: 'videos',
    objectName: `${userId}/upload.mp4`,
    contentType: 'video/mp4',
  },
  onError: (error) => console.error('업로드 실패:', error),
  onProgress: (bytesUploaded, bytesTotal) => {
    const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2)
    console.log(`진행률: ${percentage}%`)
  },
  onSuccess: () => console.log('업로드 완료'),
})

// 이전 업로드 이어서 재개
upload.findPreviousUploads().then((previousUploads) => {
  if (previousUploads.length > 0) {
    upload.resumeFromPreviousUpload(previousUploads[0])
  }
  upload.start()
})
```

---

## 3. 가격 구조 상세 비교

### 3.1 저장 비용 (Storage Cost)

| 서비스 | 스토리지 요금 | 무료 포함량 |
|--------|--------------|------------|
| Supabase Storage (Free) | 무료 | 1GB |
| Supabase Storage (Pro, $25/월) | 포함 100GB, 초과 $0.021/GB | 100GB |
| AWS S3 Standard | $0.023/GB/월 | 5GB (12개월) |
| AWS S3 Standard-IA | $0.0125/GB/월 | - |
| Cloudflare R2 Standard | $0.015/GB/월 | 10GB/월 (영구) |
| Cloudflare R2 Infrequent Access | $0.01/GB/월 | - |

**100GB 기준 월 저장 비용 비교:**
- Supabase (Pro): $0 (100GB 포함)
- AWS S3 Standard: ~$2.30
- Cloudflare R2: ~$1.50 (무료 10GB 제외 시 $1.35)

---

### 3.2 이그레스(Egress) 비용 — 가장 중요한 차이점

이그레스(Egress)는 스토리지에서 인터넷으로 데이터를 전송할 때 발생하는 비용이다. 파일 다운로드, CDN 서빙, API 응답 등이 모두 해당된다.

| 서비스 | 이그레스 요금 | 무료 포함량 |
|--------|--------------|------------|
| Supabase Storage (Pro) | 초과 $0.09/GB | 250GB/월 |
| AWS S3 | $0.09/GB (9.9TB까지) | 100GB/월 |
| AWS S3 → CloudFront | 무료 | 무료 (동일 리전) |
| Cloudflare R2 | **$0 (완전 무료)** | 무료 (무제한) |

**실제 비용 시뮬레이션: 10TB/월 이그레스**

| 서비스 | 이그레스 비용 |
|--------|--------------|
| Supabase Storage (Pro) | (10,000 - 250) × $0.09 = **$877.50** |
| AWS S3 (직접) | (10,000 - 100) × $0.09 = **$890.10** |
| AWS S3 → CloudFront | ~$0 (동일 리전) + CloudFront $850/월 |
| Cloudflare R2 | **$0** |

R2의 제로 이그레스 정책은 비디오 스트리밍, 대용량 파일 다운로드 서비스에서 연간 수천만 원의 비용 절감 효과를 낸다. 10TB 이그레스 기준, R2 vs S3 연간 차이는 약 $10,500(약 1,400만 원).

---

### 3.3 요청 비용 (Request Cost)

| 서비스 | 쓰기 요청 (PUT/POST) | 읽기 요청 (GET) | 목록 조회 (LIST) |
|--------|---------------------|----------------|-----------------|
| Supabase Storage | 요청 비용 별도 없음 | 요청 비용 별도 없음 | - |
| AWS S3 Standard | $0.005/1,000건 | $0.0004/1,000건 | $0.005/1,000건 |
| Cloudflare R2 Standard | $4.50/백만 건 | $0.36/백만 건 | $4.50/백만 건 |
| Cloudflare R2 (무료 포함) | 1백만 건/월 | 10백만 건/월 | - |

**요청 비용 비교 (월 1백만 쓰기 + 1천만 읽기):**
- AWS S3: $5.00 + $4.00 = **$9.00**
- Cloudflare R2: $4.50 + $3.60 = **$8.10** (무료 티어 제외 시)
- Supabase: 플랜 요금에 포함 (추가 없음)

---

### 3.4 전체 비용 시나리오 요약

**소규모 앱 (100GB 저장, 500GB 이그레스/월, 1M 요청):**

| 서비스 | 월 비용 |
|--------|--------|
| Supabase Storage (Pro) | $25 (플랜 내 포함) |
| AWS S3 + CloudFront | ~$10 (저장) + ~$42.5 (이그레스) = **~$52.5** |
| Cloudflare R2 | ~$1.35 (저장) + $0 (이그레스) + ~$4.50 (요청) = **~$5.85** |

**중규모 앱 (1TB 저장, 10TB 이그레스/월, 10M 요청):**

| 서비스 | 월 비용 |
|--------|--------|
| Supabase Storage (Pro) | $25 + ~$190 (저장 초과) + ~$877 (이그레스 초과) = **~$1,092** |
| AWS S3 + CloudFront | ~$23 (저장) + ~$890 (이그레스) + ~$9 (요청) = **~$922** |
| Cloudflare R2 | ~$15 (저장) + $0 (이그레스) + ~$45 (요청) = **~$60** |

중규모 이상에서 R2의 비용 우위가 극명하게 드러난다.

---

## 4. SDK 및 통합

### 4.1 Supabase Storage SDK

Supabase는 공식 클라이언트 라이브러리를 통해 스토리지 API를 제공한다.

```typescript
// 파일 업로드
const { data, error } = await supabase.storage
  .from('avatars')
  .upload('public/avatar1.png', fileBody, {
    cacheControl: '3600',
    upsert: false,
  })

// 파일 다운로드 URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl('public/avatar1.png')

// 파일 이동/복사
await supabase.storage
  .from('avatars')
  .move('public/avatar1.png', 'private/avatar1.png')

// 파일 삭제
await supabase.storage
  .from('avatars')
  .remove(['public/avatar1.png', 'public/avatar2.png'])

// 버킷 내 파일 목록
const { data: files } = await supabase.storage
  .from('avatars')
  .list('public', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  })
```

**지원 언어/환경:** JavaScript/TypeScript, Flutter/Dart, Swift, Kotlin, Python, C#

**S3 호환 API 직접 사용:**
```typescript
// AWS SDK v3로 Supabase Storage 접근
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  forcePathStyle: true,
  region: 'ap-southeast-1',
  endpoint: 'https://<project-ref>.supabase.co/storage/v1/s3',
  credentials: {
    accessKeyId: SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: SUPABASE_S3_SECRET_KEY,
  },
})
```

---

### 4.2 AWS S3 SDK

AWS는 가장 성숙하고 광범위한 SDK 생태계를 가지고 있다.

```typescript
// AWS SDK v3 (현재 권장)
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const client = new S3Client({ region: 'ap-northeast-2' })

// 업로드
await client.send(new PutObjectCommand({
  Bucket: 'my-bucket',
  Key: 'path/to/file.jpg',
  Body: fileBuffer,
  ContentType: 'image/jpeg',
}))

// 서명 URL 생성 (15분 유효)
const url = await getSignedUrl(client, new GetObjectCommand({
  Bucket: 'my-bucket',
  Key: 'path/to/file.jpg',
}), { expiresIn: 900 })
```

**지원 언어:** JavaScript/TypeScript, Python (boto3), Java, .NET, Go, Ruby, PHP, C++, Rust 등 거의 모든 언어

**프레임워크 통합:**
- Next.js: `@aws-sdk/client-s3` + API Routes
- NestJS: `@aws-sdk/client-s3` + DI 컨테이너
- Django: `django-storages` + `boto3`
- Laravel: `league/flysystem-aws-s3-v3`

---

### 4.3 Cloudflare R2 SDK

R2는 S3 호환 API를 제공하므로 기존 AWS SDK를 그대로 사용할 수 있다.

```typescript
// AWS SDK v3로 R2 접근 (S3 호환)
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
})

// Cloudflare Workers에서 직접 R2 바인딩
// wrangler.toml 설정:
// [[r2_buckets]]
// binding = "MY_BUCKET"
// bucket_name = "my-bucket"

// Workers 코드
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // R2를 Workers에서 직접 접근 (네트워크 없이)
    const object = await env.MY_BUCKET.get('path/to/file.jpg')
    if (!object) return new Response('Not Found', { status: 404 })
    return new Response(object.body, {
      headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
    })
  },
}
```

**Presigned URL 생성:**
```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const url = await getSignedUrl(r2Client, new GetObjectCommand({
  Bucket: 'my-bucket',
  Key: 'private/document.pdf',
}), { expiresIn: 3600 })
```

---

### 4.4 Next.js 통합 비교

| 통합 방식 | Supabase Storage | AWS S3 | Cloudflare R2 |
|-----------|-----------------|--------|---------------|
| 서버 컴포넌트 | supabase 서버 클라이언트 | AWS SDK v3 | AWS SDK v3 |
| API Route | supabase admin client | AWS SDK v3 | AWS SDK v3 |
| 클라이언트 직접 업로드 | 서명 URL 방식 | 서명 URL 방식 | 서명 URL 방식 |
| next/image 최적화 | 커스텀 loader 필요 | CloudFront loader | 커스텀 loader 필요 |
| 환경변수 설정 | 2개 (URL, ANON_KEY) | 3개 (KEY, SECRET, REGION) | 3개 (ACCOUNT_ID, KEY, SECRET) |

---

## 5. 성능 및 글로벌 분산

### 5.1 업로드 성능

**단일 파일 업로드:**
- 세 서비스 모두 네트워크 대역폭이 병목 — 스토리지 API 자체의 처리 속도 차이는 미미
- Cloudflare R2: 클라이언트에서 가장 가까운 Cloudflare PoP로 업로드 → 지연 최소화
- AWS S3: 지정 리전으로 직접 업로드 (서울 리전: ap-northeast-2)
- Supabase Storage: 프로젝트 리전으로 업로드 (기본 한국은 ap-southeast-1 싱가포르)

**대용량 파일 멀티파트 업로드:**
- 병렬 파트 업로드 지원 (세 서비스 동일)
- 일반적으로 부분 병렬화로 단일 연결 대비 2-5배 빠른 처리
- R2: Workers 바인딩으로 엣지에서 병렬 처리 가능

### 5.2 다운로드 성능

**CDN 히트율에 따른 성능 차이:**

| 지표 | Supabase Storage | AWS S3 + CloudFront | Cloudflare R2 |
|------|-----------------|---------------------|---------------|
| CDN PoP 수 | 285개 도시 | 450개+ PoP | 330개+ 데이터센터 |
| 한국 PoP | 있음 (서울 포함) | 있음 (서울, 부산) | 있음 (서울 포함) |
| 첫 바이트 시간 (한국) | ~20-50ms (CDN 히트) | ~10-30ms (CDN 히트) | ~10-30ms (CDN 히트) |
| 캐시 미스 시 | 오리진 풀 (느림) | 오리진 풀 | 오리진 풀 |
| 캐시 TTL 제어 | Cache-Control 헤더 | Cache-Control 헤더 | Cache-Control 헤더 |

### 5.3 가용성 및 내구성

| 지표 | Supabase Storage | AWS S3 | Cloudflare R2 |
|------|-----------------|--------|---------------|
| 내구성 | 99.999999999% | 99.999999999% (11 nines) | 99.999999999% |
| 가용성 SLA | 99.9% | 99.99% (Standard) | 99.9% |
| 다중 AZ 복제 | 예 | 예 (Standard) | 예 |
| 지역 간 복제 | 아니오 | 예 (Cross-Region Replication) | 아니오 (단일 지역 내) |
| 버전 관리 | 아니오 | 예 (Versioning) | 아니오 |

---

## 6. 의사결정 가이드

### 6.1 프로젝트 규모별 최적 선택

#### 개인 프로젝트 / 스타트업 (월 이그레스 < 100GB)

**추천: Supabase Storage**
- 이유: 인증과 스토리지가 동일 플랫폼 → 개발 속도 극대화
- RLS 정책으로 복잡한 권한 시스템을 SQL로 간단히 구현
- Free 티어 1GB, Pro 100GB 포함으로 소규모 사용에 충분
- 단점: 이그레스 250GB 초과 시 $0.09/GB 부과

#### 미디어/파일 공유 서비스 (월 이그레스 > 1TB)

**추천: Cloudflare R2**
- 이유: 이그레스 완전 무료 → 대역폭 비용 제거
- 저장 비용도 S3 대비 ~35% 저렴
- Cloudflare Workers와 통합으로 엣지 처리 가능
- 단점: 세밀한 IAM 권한 관리 부재, 이미지 변환 별도

#### 엔터프라이즈 / AWS 생태계 통합

**추천: AWS S3**
- 이유: Lambda, EC2, RDS 등 AWS 서비스와 네이티브 통합
- 버전 관리, 수명 주기 정책, 복제 등 고급 기능
- IAM 기반 세밀한 권한 제어
- 11 nine 내구성 + 99.99% 가용성 SLA
- CloudFront 통해 이그레스 비용 최적화 가능
- 단점: 설정 복잡도 높음, 이그레스 비용 주의 필요

#### Supabase 기반 앱 + 대용량 파일

**추천: Supabase Storage (소규모) → R2 마이그레이션 (성장 시)**
- 초기: Supabase Storage로 빠르게 개발
- 월 이그레스 250GB 임박 시: R2로 대용량 파일 이관
- Supabase Auth는 유지, 파일만 R2로 이동
- R2 접근에 Supabase Edge Functions 활용

### 6.2 사용 사례별 매핑

| 사용 사례 | 최적 선택 | 이유 |
|-----------|----------|------|
| 사용자 아바타/프로필 이미지 | Supabase Storage | RLS로 소유자 제어 간편 |
| 공개 정적 에셋 (JS, CSS) | Cloudflare R2 | 무료 이그레스, 빠른 CDN |
| 비디오 스트리밍 | Cloudflare R2 | 이그레스 비용 없음 |
| 기업 문서 관리 | AWS S3 | 버전 관리, 감사 로그, 규정 준수 |
| 사용자 업로드 파일 (SaaS) | Supabase Storage → R2 | 초기 개발 속도, 이후 비용 최적화 |
| 백업/아카이브 | AWS S3 Glacier | 저장 비용 최소화 ($0.00099/GB) |
| CDN 원본 스토리지 | Cloudflare R2 | Cloudflare CDN과 동일 네트워크 |
| AI/ML 데이터셋 | AWS S3 | SageMaker, Athena 등 AI 서비스 연동 |

### 6.3 마이그레이션 경로

**Supabase Storage → R2 마이그레이션:**
```
1. R2 버킷 생성 + Cloudflare Workers로 프록시 설정
2. 기존 파일을 R2로 복사 (aws-sdk의 CopyObject 활용)
3. Supabase 앱에서 파일 URL 업데이트 (마이그레이션 스크립트)
4. 새 업로드는 R2로 직접 → Supabase에는 메타데이터만 저장
5. 기존 Supabase Storage 버킷 비활성화
```

---

## 7. 7항목 스코어링

> 10점 만점 기준. 가중치는 일반 웹/SaaS 앱 기준.

| 항목 | 가중치 | Supabase Storage | AWS S3 | Cloudflare R2 |
|------|--------|:---:|:---:|:---:|
| **1. 비용 효율성** | 20% | 7 | 5 | **10** |
| **2. 개발자 경험 (DX)** | 20% | **10** | 6 | 7 |
| **3. 보안 / 접근 제어** | 15% | **10** | 9 | 6 |
| **4. 성능 / CDN** | 15% | 7 | 9 | **9** |
| **5. 기능 완성도** | 15% | 7 | **10** | 7 |
| **6. 확장성** | 10% | 6 | **10** | 9 |
| **7. 생태계 / 통합** | 5% | 8 | **10** | 8 |

**가중 합산 점수:**

| 서비스 | 가중 점수 |
|--------|----------|
| Supabase Storage | **8.05** |
| AWS S3 | **7.85** |
| Cloudflare R2 | **8.30** |

### 항목별 상세 근거

**비용 효율성:**
- R2(10): 이그레스 완전 무료, 저장 비용도 S3 대비 35% 저렴
- Supabase(7): Free/Pro 티어 포함량 내에서는 우수, 초과 시 급격한 비용 상승
- S3(5): 이그레스 비용이 가장 크게 발생, CloudFront 없이는 고비용

**개발자 경험 (DX):**
- Supabase(10): 인증-DB-스토리지 일체형, 5분이면 파일 업/다운 구현
- R2(7): S3 호환으로 기존 SDK 재사용 가능, Workers 통합 우수
- S3(6): IAM, 버킷 정책, CORS 등 초기 설정이 복잡

**보안 / 접근 제어:**
- Supabase(10): PostgreSQL RLS로 행 단위 파일 접근 제어, Auth JWT 원클릭 통합
- S3(9): IAM 정책, 버킷 정책, MFA Delete 등 다층 보안
- R2(6): 공개/비공개 버킷 + 서명 URL만 기본, 세밀한 제어는 Workers 필요

**성능 / CDN:**
- S3/R2(9): CloudFront 450+ PoP / Cloudflare 330+ 데이터센터로 강력한 CDN
- Supabase(7): 285개 도시 CDN은 우수하지만 S3/R2 대비 PoP 수 적음

**기능 완성도:**
- S3(10): 버전 관리, 복제, 수명 주기 정책, 인텔리전트 티어링 등 완전한 기능
- Supabase/R2(7): 기본 스토리지 기능 충실, 고급 기능 일부 미지원

**확장성:**
- S3(10): 무제한 스케일, 글로벌 리전 선택, 다양한 스토리지 클래스
- R2(9): S3 호환으로 확장 용이, 멀티리전 지원 개선 중
- Supabase(6): 프로젝트 단위 제약, 대규모 파일 서비스엔 한계

---

## 요약

| 시나리오 | 최종 추천 |
|---------|---------|
| Supabase 스택 소규모 앱 | Supabase Storage |
| 고트래픽 미디어 서비스 | Cloudflare R2 |
| AWS 환경 또는 엔터프라이즈 | AWS S3 |
| 비용 최우선 | Cloudflare R2 |
| 개발 속도 최우선 | Supabase Storage |
| 이미 Cloudflare 사용 중 | Cloudflare R2 |

---

## 참고 자료

- [Supabase Storage 공식 문서](https://supabase.com/docs/guides/storage)
- [Supabase Storage 가격](https://supabase.com/docs/guides/storage/pricing)
- [Supabase Storage CDN](https://supabase.com/docs/guides/storage/cdn/fundamentals)
- [Supabase Image Transformations](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [AWS S3 공식 가격](https://aws.amazon.com/s3/pricing/)
- [Cloudflare R2 공식 가격](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 vs AWS S3 비교](https://www.cloudflare.com/pg-cloudflare-r2-vs-aws-s3/)
- [Cloud Storage Pricing 비교 2026](https://www.buildmvpfast.com/api-costs/cloud-storage)
