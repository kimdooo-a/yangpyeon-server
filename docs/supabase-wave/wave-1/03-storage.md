# Supabase Storage 심층 분석

> Wave 1 리서치 문서 | 작성일: 2026-04-06
> 참고: 공식 Supabase 문서 + GitHub 저장소 기준 (최신 상태 기준)

---

## 목차

1. [개요 및 아키텍처](#1-개요-및-아키텍처)
2. [핵심 기능 — 버킷 관리](#2-핵심-기능--버킷-관리)
3. [파일 업로드 / 다운로드](#3-파일-업로드--다운로드)
4. [이미지 변환 (Image Transformation)](#4-이미지-변환-image-transformation)
5. [CDN 캐싱 및 글로벌 배포](#5-cdn-캐싱-및-글로벌-배포)
6. [접근 제어 — Storage Policies (RLS)](#6-접근-제어--storage-policies-rls)
7. [서명된 URL (Signed URLs)](#7-서명된-url-signed-urls)
8. [S3 프로토콜 호환 API](#8-s3-프로토콜-호환-api)
9. [내부 아키텍처 상세](#9-내부-아키텍처-상세)
10. [제한사항 및 플랜별 차이](#10-제한사항-및-플랜별-차이)
11. [보안 가이드](#11-보안-가이드)
12. [운영 및 최적화](#12-운영-및-최적화)

---

## 1. 개요 및 아키텍처

### 1.1 Supabase Storage란?

Supabase Storage는 **S3 호환 객체 저장소**로, 파일 메타데이터를 PostgreSQL에 저장하고
실제 바이트 데이터는 S3 호환 백엔드(AWS S3, MinIO 등)에 저장하는 하이브리드 아키텍처를 사용한다.

핵심 가치 제안:
- 파일 저장 + PostgreSQL 메타데이터 + RLS 기반 권한 제어가 **하나의 시스템**으로 통합
- 세 가지 접근 프로토콜 (REST API / TUS 재개 가능 업로드 / S3 프로토콜) 동시 지원
- 285개 이상 도시의 글로벌 CDN 엣지 네트워크를 통한 빠른 콘텐츠 전달
- imgproxy를 통한 온-더-플라이 이미지 변환

### 1.2 스토리지 버킷 타입 (3종)

Supabase Storage는 세 가지 목적별 버킷 타입을 제공한다:

| 타입 | 설명 | 주요 용도 |
|------|------|-----------|
| **Files Buckets** | 전통적인 파일 저장소 | 이미지, 동영상, 문서, PDF |
| **Analytics Buckets** | Apache Iceberg 테이블 포맷 지원 | 데이터 레이크, 시계열 데이터, ETL |
| **Vector Buckets** | AI/ML 임베딩 저장 최적화 | 벡터 인덱싱(HNSW, Flat), 유사도 검색 |

이 문서는 **Files Buckets** 를 중심으로 다룬다.

### 1.3 전체 아키텍처 다이어그램

```
클라이언트 요청
      │
      ▼
┌─────────────────────────────────┐
│         Supabase API Gateway     │
│   (Kong / PostgREST 기반)         │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│       Storage API Server         │  ← Node.js/Fastify 기반
│  (storage.supabase.co)           │     GitHub: supabase/storage
│                                  │
│  ┌─────────┐  ┌──────────────┐  │
│  │  REST   │  │  TUS Server  │  │  ← 재개 가능 업로드 엔진
│  │  API    │  │  (v3+)       │  │
│  └────┬────┘  └──────┬───────┘  │
│       └──────┬────────┘          │
│              ▼                   │
│  ┌───────────────────────────┐  │
│  │    RLS Policy Checker     │  │  ← PostgreSQL에서 권한 검사
│  └───────────┬───────────────┘  │
└──────────────┼──────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌────────────┐  ┌──────────────────┐
│ PostgreSQL │  │  S3 Object Store  │
│ (메타데이터) │  │ (실제 파일 바이트) │
│            │  │                  │
│ storage.   │  │  AWS S3 /        │
│ buckets    │  │  MinIO /         │
│ storage.   │  │  호환 스토리지   │
│ objects    │  │                  │
└────────────┘  └──────────────────┘
                        │
                        ▼
               ┌────────────────┐
               │   CDN + imgproxy│
               │  (285+ 도시)    │
               └────────────────┘
```

### 1.4 PostgreSQL 스토리지 스키마

파일의 바이트 데이터는 S3에 저장되지만, **메타데이터는 전부 PostgreSQL**에 저장된다:

```sql
-- storage.buckets 테이블 (버킷 정의)
CREATE TABLE storage.buckets (
    id               text PRIMARY KEY,
    name             text UNIQUE NOT NULL,
    owner            uuid REFERENCES auth.users(id),
    public           boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit  bigint,           -- 버킷별 파일 크기 제한
    allowed_mime_types text[],         -- 허용된 MIME 타입 목록
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

-- storage.objects 테이블 (파일 메타데이터)
CREATE TABLE storage.objects (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id        text REFERENCES storage.buckets(id),
    name             text,             -- 버킷 내 파일 경로 (예: "avatars/user-123.png")
    owner            uuid REFERENCES auth.users(id),
    owner_id         text,             -- owner의 텍스트 표현
    metadata         jsonb,            -- Content-Type, size, ETag 등
    path_tokens      text[],           -- name을 '/' 기준으로 분리한 배열
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now(),
    last_accessed_at timestamptz DEFAULT now(),
    version          text,
    UNIQUE (bucket_id, name)
);
```

> **중요**: API를 통해서만 스토리지를 조작해야 한다. 직접 테이블을 수정하면 S3의 실제 파일과 메타데이터가 불일치할 수 있다.

---

## 2. 핵심 기능 — 버킷 관리

### 2.1 Public vs Private 버킷

**Private 버킷 (기본값)**
- 모든 작업에 RLS 정책 강제 적용
- 다운로드 시 JWT Authorization 헤더 또는 Signed URL 필요
- 민감한 문서, 사용자별 파일에 적합

**Public 버킷**
- 파일 URL만 알면 누구든 다운로드 가능
- 업로드/삭제/이동은 여전히 RLS 정책 적용
- 캐싱 전략이 다르기 때문에 성능이 더 우수
- 프로필 이미지, 블로그 썸네일, 공개 미디어에 적합

> **주의**: Public 버킷 설정은 "다운로드 허용"만을 의미한다. 무단 업로드를 막으려면
> 반드시 INSERT 정책을 명시적으로 설정해야 한다.

### 2.2 버킷 생성 — 코드 예제

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 1. 기본 Private 버킷 생성
const { data, error } = await supabase.storage.createBucket('documents', {
  public: false,
})

// 2. Public 버킷 생성 (파일 크기 및 MIME 타입 제한 포함)
const { data: publicBucket, error: publicError } = await supabase.storage
  .createBucket('avatars', {
    public: true,
    fileSizeLimit: 1024 * 1024 * 2, // 2MB 제한
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  })

// 3. 버킷 목록 조회
const { data: buckets } = await supabase.storage.listBuckets()

// 4. 버킷 설정 업데이트
const { data: updated } = await supabase.storage.updateBucket('avatars', {
  public: true,
  fileSizeLimit: 1024 * 1024 * 5, // 5MB로 변경
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
})

// 5. 버킷 삭제 (비어 있어야 삭제 가능)
const { data: deleted } = await supabase.storage.deleteBucket('old-bucket')
```

### 2.3 파일 목록 조회

```typescript
// 버킷 내 파일 목록 조회
const { data: files, error } = await supabase.storage
  .from('documents')
  .list('folder-name', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
    search: 'report',    // 파일명 검색
  })

// 중첩 폴더 구조 예시
// 버킷: 'user-uploads'
// 경로: 'user-123/avatars/profile.png'
//        └─ 폴더: user-123
//             └─ 폴더: avatars
//                  └─ 파일: profile.png

const { data: userFiles } = await supabase.storage
  .from('user-uploads')
  .list(`user-${userId}/avatars`)
```

---

## 3. 파일 업로드 / 다운로드

### 3.1 기본 업로드 (Standard Upload)

6MB 이하 파일에 권장:

```typescript
// 1. 파일 객체로 업로드 (브라우저 환경)
const file = event.target.files[0]
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`public/${userId}/avatar.png`, file, {
    cacheControl: '3600',   // CDN 캐시 TTL (초)
    upsert: false,          // true면 기존 파일 덮어쓰기 허용
    contentType: 'image/png',
  })

// 2. ArrayBuffer로 업로드
const { data } = await supabase.storage
  .from('documents')
  .upload('reports/q1-2026.pdf', arrayBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })

// 3. Base64 문자열로 업로드
const base64Data = 'base64encodedstring...'
const { data } = await supabase.storage
  .from('images')
  .upload('photo.jpg', decode(base64Data), {
    contentType: 'image/jpeg',
  })

// 응답 구조
// data: { id, path, fullPath }
// error: StorageError | null
```

### 3.2 재개 가능 업로드 (Resumable Uploads — TUS Protocol)

6MB 초과 파일 또는 불안정한 네트워크 환경에서 권장:

```typescript
import { Upload } from 'tus-js-client'

const file = document.getElementById('file-input').files[0]

// 기본 업로드 URL과 다르게 storage 전용 엔드포인트 사용
// https://[project-id].storage.supabase.co/storage/v1/upload/resumable
// (일반 URL보다 성능 최적화)

const upload = new Upload(file, {
  endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
  retryDelays: [0, 3000, 5000, 10000, 20000], // 재시도 간격 (ms)
  headers: {
    authorization: `Bearer ${session.access_token}`,
    'x-upsert': 'true',  // 기존 파일 덮어쓰기 허용
  },
  metadata: {
    bucketName: 'documents',
    objectName: `uploads/${userId}/${file.name}`,
    contentType: file.type,
    cacheControl: '3600',
  },
  chunkSize: 6 * 1024 * 1024, // 고정 청크 크기: 6MB (변경 불가)
  onError: (error) => {
    console.error('업로드 실패:', error)
  },
  onProgress: (bytesUploaded, bytesTotal) => {
    const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2)
    console.log(`진행률: ${percentage}%`)
  },
  onSuccess: () => {
    console.log('업로드 완료!')
  },
})

// 이전에 중단된 업로드 재개 시도
upload.findPreviousUploads().then((previousUploads) => {
  if (previousUploads.length) {
    upload.resumeFromPreviousUpload(previousUploads[0])
  }
  upload.start()
})
```

**TUS 프로토콜 주요 특성:**
- 청크 크기: **고정 6MB** (조정 불가)
- 업로드 URL 유효 기간: **최대 24시간**
- 동일 URL에 동시 업로드: **1개 클라이언트만 허용** (충돌 시 409 Conflict)
- `x-upsert: true` 설정 시 마지막 완료 클라이언트가 우선

### 3.3 서명된 업로드 URL (Presigned Upload)

서버에서 서명된 업로드 URL을 발급하여 클라이언트가 직접 업로드:

```typescript
// 서버 측 (Edge Function 또는 API Route)
const { data, error } = await supabase.storage
  .from('user-uploads')
  .createSignedUploadUrl(`${userId}/document.pdf`)

// 반환값: { signedUrl, token, path }

// 클라이언트 측 — 서명된 URL로 업로드
const { data: uploadResult } = await supabase.storage
  .from('user-uploads')
  .uploadToSignedUrl(data.path, data.token, file)
```

### 3.4 파일 다운로드

```typescript
// 1. Public 버킷 — 공개 URL 생성 (CDN 경유)
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl('public/user-123/avatar.png')
// data.publicUrl: "https://[project].supabase.co/storage/v1/object/public/avatars/..."

// 2. Private 버킷 — 인증된 다운로드
const { data: blob, error } = await supabase.storage
  .from('documents')
  .download('private/report.pdf')

// 3. 파일 이동
const { data } = await supabase.storage
  .from('documents')
  .move('old-path/file.pdf', 'new-path/file.pdf')

// 4. 파일 복사
const { data } = await supabase.storage
  .from('documents')
  .copy('original.pdf', 'backup/original-copy.pdf')

// 5. 파일 삭제 (복수 동시 삭제 가능)
const { data } = await supabase.storage
  .from('documents')
  .remove(['file1.pdf', 'file2.pdf', 'folder/file3.pdf'])
```

---

## 4. 이미지 변환 (Image Transformation)

### 4.1 개요

Supabase Storage는 **imgproxy**를 내부 엔진으로 사용하여 이미지를 온-더-플라이로
변환하고 최적화한다. 별도 서버나 사전 처리 없이 URL 파라미터만으로 이미지 크기 조절,
포맷 변환, 압축이 가능하다.

> **플랜 제한**: 이미지 변환 기능은 **Pro Plan 이상**에서만 사용 가능.
> Free 플랜에서는 비활성화됨.

### 4.2 지원 포맷

**입력 포맷 (12종)**: PNG, JPEG, WebP, AVIF, GIF, ICO, SVG, HEIC, BMP, TIFF 등

**출력 포맷**: PNG, JPEG, WebP (HEIC 출력 불가)

### 4.3 변환 파라미터

| 파라미터 | 타입 | 범위 | 기본값 | 설명 |
|----------|------|------|--------|------|
| `width` | integer | 1–2500 | 원본 | 출력 너비 (px) |
| `height` | integer | 1–2500 | 원본 | 출력 높이 (px) |
| `quality` | integer | 20–100 | 80 | 압축 품질 |
| `resize` | enum | cover/contain/fill | cover | 리사이즈 모드 |
| `format` | string | origin | auto | 'origin'으로 자동 변환 비활성화 |

**resize 모드 상세:**
- `cover`: 비율 유지하며 지정 크기를 가득 채움 → 초과 부분 크롭
- `contain`: 비율 유지하며 지정 크기 안에 맞춤 → 여백 발생
- `fill`: 비율 무시하고 지정 크기에 정확히 맞춤 → 왜곡 발생 가능

### 4.4 변환 코드 예제

```typescript
// 1. Public URL에 변환 옵션 적용
const { data } = supabase.storage
  .from('product-images')
  .getPublicUrl('shoes/nike-air-max.jpg', {
    transform: {
      width: 400,
      height: 400,
      resize: 'cover',
      quality: 85,
    },
  })
// 결과: CDN에서 400x400 WebP로 자동 변환 및 캐시

// 2. 썸네일 생성 (다양한 크기)
const sizes = [
  { name: 'thumbnail', width: 150, height: 150 },
  { name: 'medium',    width: 600, height: 400 },
  { name: 'large',     width: 1200, height: 800 },
]

const urls = sizes.map(({ name, width, height }) => ({
  name,
  url: supabase.storage
    .from('photos')
    .getPublicUrl('hero.jpg', {
      transform: { width, height, resize: 'cover', quality: 80 },
    }).data.publicUrl,
}))

// 3. Signed URL에도 변환 적용 (Private 버킷)
const { data: signedUrl } = await supabase.storage
  .from('private-photos')
  .createSignedUrl('family-photo.jpg', 3600, {  // 1시간 유효
    transform: {
      width: 800,
      height: 600,
      resize: 'contain',
      format: 'origin',  // 원본 포맷 유지 (WebP 자동 변환 비활성)
    },
  })

// 4. 다운로드 시 변환
const { data: blob } = await supabase.storage
  .from('documents')
  .download('photo.jpg', {
    transform: {
      width: 200,
      height: 200,
      resize: 'cover',
    },
  })
```

### 4.5 자동 포맷 최적화

별도 코드 없이 클라이언트의 Accept 헤더를 분석하여 최적 포맷을 자동 선택:
- Chrome, Edge, Firefox → **WebP** 자동 반환
- Safari 14+ → **WebP** 자동 반환
- 구형 브라우저 → 원본 포맷 반환
- AVIF 지원 (향후 지원 예정)

포맷 자동 변환을 비활성화하려면:
```typescript
.getPublicUrl('image.png', {
  transform: { format: 'origin' }
})
```

### 4.6 변환 기술 제한

| 항목 | 제한값 |
|------|--------|
| 최대 입력 파일 크기 | 25MB |
| 최대 해상도 | 50MP (5000만 픽셀) |
| 최대 width/height | 2500px |
| 최소 quality | 20 |

### 4.7 변환 비용 (Pro Plan 기준)

- 포함: **월 1,000 원본 이미지당 100회 변환** (100,000회 기본 포함)
- 초과 비용: $5 / 1,000회 변환
- Team Plan: 더 높은 기본 할당량 + 맞춤 협상 가능
- Enterprise: 별도 협상

---

## 5. CDN 캐싱 및 글로벌 배포

### 5.1 Smart CDN 아키텍처

Supabase Storage v2부터 **Smart CDN**이 도입되었다. 285개 이상 도시에 엣지 노드를 두고
파일을 캐시한다.

**캐시 동작 방식:**
- **Public 버킷**: URL 기반 캐시 → 최초 요청 후 엣지에서 서빙
- **Private 버킷**: 인증 토큰 포함 → 캐시 우회 또는 제한적 캐시
- **이미지 변환 결과**: 변환 파라미터를 포함한 URL을 키로 캐시

### 5.2 Cache-Control 설정

```typescript
// 업로드 시 CDN 캐시 TTL 설정
await supabase.storage
  .from('product-images')
  .upload('hero.jpg', file, {
    cacheControl: '31536000',  // 1년 캐시 (변경 없는 정적 파일)
    upsert: false,
  })

// 자주 변경되는 파일
await supabase.storage
  .from('news')
  .upload('latest-thumbnail.jpg', file, {
    cacheControl: '3600',  // 1시간만 캐시
    upsert: true,
  })

// 캐시 방지 (항상 최신 버전 제공)
await supabase.storage
  .from('live-feed')
  .upload('current-status.json', file, {
    cacheControl: 'no-cache',
    upsert: true,
  })
```

### 5.3 캐시 무효화 전략

Supabase Storage는 명시적 캐시 무효화 API가 없다. 대신:

**방법 1: URL 버전 관리 (권장)**
```typescript
// 파일명에 타임스탬프 또는 버전 포함
const filename = `avatar-${Date.now()}.png`
const { data } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/${filename}`, file)

// 이전 파일 삭제
await supabase.storage
  .from('avatars')
  .remove([`${userId}/avatar-${oldTimestamp}.png`])
```

**방법 2: upsert + 낮은 TTL**
```typescript
// Cache-Control을 짧게 + upsert: true
await supabase.storage
  .from('dynamic-content')
  .upload('thumbnail.jpg', newFile, {
    cacheControl: '60',  // 60초
    upsert: true,
  })
```

### 5.4 대역폭 요금

| 플랜 | 포함 대역폭 | 초과 요금 |
|------|-------------|-----------|
| Free | 5GB (캐시됨) + 5GB (미캐시) = 10GB | 유료 업그레이드 필요 |
| Pro | 250GB | $0.09/GB |
| Team | 250GB 이상 | 협상 |
| Enterprise | 맞춤 | 협상 |

---

## 6. 접근 제어 — Storage Policies (RLS)

### 6.1 개요

Supabase Storage는 PostgreSQL의 **Row Level Security (RLS)** 를 활용하여 파일 접근을
제어한다. `storage.objects` 테이블에 정책을 정의하며, 다음 4가지 작업을 제어한다:

| 작업 | SQL Operation | 설명 |
|------|--------------|------|
| 업로드 | INSERT | 새 파일 생성 |
| 덮어쓰기 | INSERT + SELECT + UPDATE | 기존 파일 대체 |
| 다운로드 | SELECT | 파일 읽기 |
| 삭제 | DELETE | 파일 제거 |

> **기본 동작**: RLS 정책이 없으면 **모든 업로드 차단**. 명시적으로 허용해야만 작동.

### 6.2 Helper 함수

Supabase Storage는 정책 작성을 위한 SQL 헬퍼 함수를 제공한다:

```sql
-- 파일 경로의 폴더명 배열 반환
-- 예: 'folder/subfolder/file.jpg' → ['folder', 'subfolder', 'file.jpg']
storage.foldername(name text) RETURNS text[]

-- 파일 이름만 반환
-- 예: 'folder/subfolder/file.jpg' → 'file.jpg'
storage.filename(name text) RETURNS text

-- 파일 확장자 반환 (점 포함)
-- 예: 'folder/file.jpg' → '.jpg'
storage.extension(name text) RETURNS text
```

### 6.3 기본 정책 패턴

```sql
-- 패턴 1: 인증된 사용자 전체 버킷 업로드 허용
CREATE POLICY "인증 사용자 업로드 허용"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- 패턴 2: 자신의 폴더에만 업로드 (사용자 ID 폴더)
CREATE POLICY "본인 폴더에만 업로드"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'user-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 패턴 3: Public 다운로드 허용
CREATE POLICY "퍼블릭 이미지 조회 허용"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'public-images');

-- 패턴 4: 본인 파일만 다운로드
CREATE POLICY "본인 파일 다운로드"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'private-docs'
    AND auth.uid() = owner::uuid
);

-- 패턴 5: 본인 파일 삭제
CREATE POLICY "본인 파일 삭제"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'user-uploads'
    AND auth.uid() = owner::uuid
);

-- 패턴 6: upsert 허용 (INSERT + SELECT + UPDATE 모두 필요)
CREATE POLICY "파일 덮어쓰기 허용 INSERT"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "파일 덮어쓰기 허용 UPDATE"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'avatars'
    AND auth.uid() = owner::uuid
);

CREATE POLICY "파일 덮어쓰기 허용 SELECT"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'avatars'
    AND auth.uid() = owner::uuid
);
```

### 6.4 고급 정책 — 비즈니스 로직 연동

```sql
-- 패턴 7: 커스텀 테이블과 조인 (팀 기반 접근 제어)
CREATE POLICY "팀 멤버 파일 접근"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'team-docs'
    AND (
        SELECT EXISTS (
            SELECT 1
            FROM team_members tm
            WHERE tm.user_id = auth.uid()
            AND tm.team_id = (storage.foldername(name))[1]::uuid
        )
    )
);

-- 패턴 8: 파일 확장자 제한
CREATE POLICY "이미지만 업로드 허용"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'photos'
    AND storage.extension(name) IN ('jpg', 'jpeg', 'png', 'webp', 'gif')
);

-- 패턴 9: 관리자 전체 접근
CREATE POLICY "관리자 전체 접근"
ON storage.objects FOR ALL TO authenticated
USING (
    (auth.jwt() ->> 'role') = 'admin'
)
WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin'
);
```

### 6.5 서비스 역할 키

Service Role Key는 RLS를 완전히 우회하여 모든 Storage API에 무제한 접근:

```typescript
// 서버 사이드에서만 사용 (클라이언트 노출 절대 금지)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // NEXT_PUBLIC_ 절대 금지!
)

// 관리 작업 예시: 사용자 파일 강제 삭제
await supabaseAdmin.storage
  .from('user-uploads')
  .remove([`${userId}/profile.jpg`])
```

---

## 7. 서명된 URL (Signed URLs)

### 7.1 개요

서명된 URL은 Private 버킷의 파일을 인증 없이 시간 제한부로 공유할 때 사용한다.
HMAC 서명 기반으로 위변조 불가.

### 7.2 단일 파일 Signed URL

```typescript
// 1시간 유효한 서명된 URL 생성
const { data, error } = await supabase.storage
  .from('private-docs')
  .createSignedUrl('reports/q4-2025.pdf', 3600)  // 3600초 = 1시간

// data.signedUrl로 직접 다운로드 가능

// 이미지 변환과 함께 사용
const { data: transformedSignedUrl } = await supabase.storage
  .from('private-photos')
  .createSignedUrl('portrait.jpg', 86400, {  // 24시간 유효
    transform: {
      width: 400,
      height: 400,
      resize: 'cover',
    },
  })

// 다운로드 강제 (Content-Disposition: attachment 헤더)
const { data: downloadUrl } = await supabase.storage
  .from('private-docs')
  .createSignedUrl('report.pdf', 3600, {
    download: true,  // 브라우저에서 다운로드 다이얼로그 표시
    // download: 'custom-filename.pdf'  // 파일명 지정 가능
  })
```

### 7.3 복수 파일 Signed URL (배치)

```typescript
// 여러 파일에 대한 서명된 URL 일괄 생성
const { data, error } = await supabase.storage
  .from('private-gallery')
  .createSignedUrls(
    ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
    3600  // 1시간 유효
  )

// data: Array<{ path: string, signedUrl: string, error: string | null }>
```

### 7.4 서명된 업로드 URL

클라이언트가 서버 인증 없이 직접 업로드할 수 있는 업로드 전용 URL:

```typescript
// 서버에서 업로드 URL 발급
const { data } = await supabase.storage
  .from('user-uploads')
  .createSignedUploadUrl(`${userId}/document.pdf`)

// data: { signedUrl, token, path }
// 이 URL을 클라이언트에 전달

// 클라이언트에서 직접 업로드 (인증 불필요)
const { data: uploadResult } = await supabase.storage
  .from('user-uploads')
  .uploadToSignedUrl(
    data.path,
    data.token,
    file,
    { contentType: 'application/pdf' }
  )
```

---

## 8. S3 프로토콜 호환 API

### 8.1 개요

Supabase Storage는 **AWS Signature Version 4** 인증을 사용하는 S3 호환 프로토콜을 지원한다.
기존 S3 클라이언트(AWS SDK, s3cmd, rclone 등)를 그대로 사용 가능.

### 8.2 활성화 방법

Supabase Dashboard → Storage → Settings → "S3 Connection" 활성화 후
Access Key ID와 Secret Access Key 발급.

### 8.3 AWS SDK v3 연동 예제

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  forcePathStyle: true,  // Supabase Storage 필수 설정
  region: 'ap-northeast-2',  // 임의 리전 값 (Supabase는 무시)
  endpoint: `${process.env.SUPABASE_URL}/storage/v1/s3`,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY!,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY!,
  },
})

// 파일 업로드
await s3Client.send(new PutObjectCommand({
  Bucket: 'my-bucket',
  Key: 'folder/file.pdf',
  Body: fileBuffer,
  ContentType: 'application/pdf',
}))

// Presigned URL 생성 (5분 유효)
const presignedUrl = await getSignedUrl(
  s3Client,
  new GetObjectCommand({ Bucket: 'my-bucket', Key: 'folder/file.pdf' }),
  { expiresIn: 300 }
)

// Multipart 업로드 (대용량 파일)
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3'

// 멀티파트 업로드 시작
const { UploadId } = await s3Client.send(
  new CreateMultipartUploadCommand({ Bucket: 'large-files', Key: 'video.mp4' })
)

// 파트 업로드 (5MB 이상 파트 필요)
// ... 각 파트 업로드 후 ETag 수집

// 멀티파트 업로드 완료
await s3Client.send(new CompleteMultipartUploadCommand({
  Bucket: 'large-files',
  Key: 'video.mp4',
  UploadId,
  MultipartUpload: { Parts: collectedParts },
}))
```

### 8.4 지원되는 S3 엔드포인트

**버킷 작업 (지원):**
- `ListBuckets`, `HeadBucket`, `CreateBucket`, `DeleteBucket`, `GetBucketLocation`

**객체 작업 (지원):**
- `HeadObject`, `GetObject`, `PutObject`, `DeleteObject`, `DeleteObjects`
- `ListObjects`, `ListObjectsV2`
- `CopyObject` (조건부 작업 포함)
- `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`
- `AbortMultipartUpload`, `ListParts`

**미지원 기능:**
- S3 버저닝 (삭제된 파일 복구 불가)
- 서버 측 암호화 (SSE-C, SSE-KMS)
- ACL 및 태깅
- 버킷 라이프사이클 정책
- MFA 삭제
- 객체 잠금

---

## 9. 내부 아키텍처 상세

### 9.1 Storage API 서버 (supabase/storage)

GitHub: `github.com/supabase/storage`

- **언어**: TypeScript (Node.js + Fastify)
- **역할**: REST API, TUS 서버, S3 프로토콜 게이트웨이 통합
- **인증**: JWT 파싱 후 PostgreSQL RLS 정책 실행
- **메타데이터 동기화**: 업로드 완료 시 `storage.objects` 테이블 자동 업데이트

### 9.2 S3 백엔드

실제 파일 바이트가 저장되는 곳:
- **Supabase Cloud**: AWS S3 (리전별 버킷)
- **Self-hosting**: 설정에 따라 MinIO, Ceph, GCS, R2 등 모든 S3 호환 스토리지 사용 가능

```yaml
# Docker Compose 셀프 호스팅 예시 (supabase/self-hosted)
STORAGE_BACKEND: s3
S3_BUCKET: storage
S3_REGION: us-east-1
S3_ENDPOINT: https://minio.internal:9000
S3_ACCESS_KEY: minio-access-key
S3_SECRET_KEY: minio-secret-key
S3_FORCE_PATH_STYLE: true
```

### 9.3 imgproxy

이미지 변환 엔진:
- **언어**: Go
- **역할**: URL 파라미터 기반 리사이즈, 크롭, 포맷 변환
- **CDN 통합**: 변환된 이미지를 CDN이 캐시 → 반복 요청 시 재변환 없음
- **보안**: URL 서명으로 무단 변환 방지 (Supabase가 내부적으로 관리)

### 9.4 요청 흐름 (업로드)

```
1. 클라이언트 → Storage API (POST /object/{bucket}/{path})
2. Storage API → JWT 검증 (Supabase Auth)
3. Storage API → PostgreSQL에서 RLS 정책 평가
   - 정책 통과 → 4번으로
   - 정책 실패 → 403 Forbidden 반환
4. Storage API → S3에 파일 업로드
5. Storage API → storage.objects 테이블에 메타데이터 INSERT
6. 클라이언트 ← 업로드 완료 응답 { id, path, fullPath }
```

### 9.5 요청 흐름 (다운로드 — Public)

```
1. 클라이언트 → CDN 엣지 노드
2. CDN → 캐시 HIT? → 파일 즉시 반환
          캐시 MISS? → Storage API로 원본 요청
3. Storage API → S3에서 파일 조회
4. Storage API → CDN 캐시에 저장 + 클라이언트에 반환
```

---

## 10. 제한사항 및 플랜별 차이

### 10.1 파일 크기 제한

| 플랜 | 전역 파일 크기 상한 |
|------|-------------------|
| Free | 50 MB |
| Pro | 500 GB |
| Team | 500 GB |
| Enterprise | 맞춤 설정 |

버킷별 제한을 전역보다 낮게 설정 가능 (높게는 설정 불가):

```typescript
// 버킷 생성 시 파일 크기 및 MIME 제한
await supabase.storage.createBucket('uploads', {
  fileSizeLimit: 1024 * 1024 * 10,  // 10MB
  allowedMimeTypes: ['image/*', 'application/pdf'],
})
```

### 10.2 스토리지 용량

| 플랜 | 포함 용량 | 추가 비용 |
|------|-----------|-----------|
| Free | 1 GB | 업그레이드 필요 |
| Pro | 100 GB | $0.021/GB/월 |
| Team | 100 GB 이상 | 협상 |
| Enterprise | 맞춤 | 협상 |

### 10.3 대역폭 (Egress)

| 플랜 | 포함 | 초과 비용 |
|------|------|-----------|
| Free | 5 GB (캐시됨) + 5 GB (미캐시) | 업그레이드 필요 |
| Pro | 250 GB | $0.09/GB |
| Team | 협상 | 협상 |

### 10.4 이미지 변환

| 플랜 | 가용 여부 | 포함 변환 수 | 추가 비용 |
|------|----------|-------------|-----------|
| Free | 미지원 | — | — |
| Pro | 지원 | 100회/1,000원본 이미지 (월간) | $5/1,000회 |
| Team | 지원 | 높은 할당량 | 협상 |

### 10.5 S3 미지원 기능 요약

- 버저닝 (삭제 복구 불가)
- 서버 측 암호화 (SSE-C, SSE-KMS)
- ACL / 태깅 / 수명 주기 정책
- 객체 잠금
- 버킷 소유자 유효성 검사 헤더
- MFA 삭제

---

## 11. 보안 가이드

### 11.1 Storage Policy 설계 원칙

1. **최소 권한 원칙**: 필요한 작업만 허용하고 나머지는 기본 차단
2. **버킷 ID 명시**: 정책에 반드시 `bucket_id = '...'` 조건 포함
3. **사용자 격리**: 사용자 데이터는 `auth.uid()` 기반 폴더로 분리
4. **MIME 타입 검증**: 서버 사이드에서 허용 타입 화이트리스트 적용

### 11.2 업로드 보안 검증 패턴

```typescript
// API Route / Edge Function에서 업로드 전 검증
async function validateAndUpload(file: File, userId: string) {
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_SIZE = 5 * 1024 * 1024  // 5MB

  // 1. 파일 크기 검증
  if (file.size > MAX_SIZE) {
    throw new Error('파일 크기는 5MB를 초과할 수 없습니다.')
  }

  // 2. MIME 타입 검증 (클라이언트 전달 타입 신뢰 불가 → 직접 확인)
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('허용되지 않은 파일 형식입니다.')
  }

  // 3. 파일 시그니처 검증 (Magic bytes — 더 안전)
  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)
  const isJPEG = uint8[0] === 0xFF && uint8[1] === 0xD8
  const isPNG  = uint8[0] === 0x89 && uint8[1] === 0x50
  if (!isJPEG && !isPNG) {
    throw new Error('파일 형식이 유효하지 않습니다.')
  }

  // 4. 파일명 sanitize (경로 이동 방지)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${Date.now()}-${safeName}`

  // 5. 업로드 (서비스 역할 키 사용 — 서버 사이드에서만)
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  return supabaseAdmin.storage
    .from('user-uploads')
    .upload(path, file, { contentType: file.type })
}
```

### 11.3 MIME 타입 버킷 설정

```sql
-- 버킷 생성 시 허용 타입 지정 (SQL)
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'avatars',
  'avatars',
  true,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  2097152  -- 2MB
);
```

### 11.4 공개 URL 보안 고려사항

- Public 버킷 파일은 URL 유출 시 누구나 접근 가능 → 민감 파일은 반드시 Private 버킷 사용
- Signed URL 만료 시간을 최소화 (짧은 수명 → 보안 강화)
- 로그에 Signed URL 기록 금지 (토큰 포함)

### 11.5 서비스 역할 키 보안

```bash
# 환경변수 규칙
NEXT_PUBLIC_SUPABASE_URL=...       # ✅ 공개 가능
NEXT_PUBLIC_SUPABASE_ANON_KEY=...  # ✅ 공개 가능 (RLS 보호)
SUPABASE_SERVICE_ROLE_KEY=...      # ❌ 절대 NEXT_PUBLIC_ 금지
                                   # ❌ 클라이언트 번들 포함 금지
                                   # ✅ 서버 사이드 / Edge Function 전용
```

---

## 12. 운영 및 최적화

### 12.1 대용량 파일 관리 전략

```typescript
// 스트리밍 다운로드 (대용량 파일 메모리 절약)
async function streamLargeFile(bucket: string, path: string) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path)

  if (error) throw error

  // Blob → ReadableStream으로 처리
  const stream = data.stream()
  return new Response(stream, {
    headers: { 'Content-Type': data.type }
  })
}

// 청크 기반 처리
async function processLargeFileInChunks(bucket: string, path: string) {
  const CHUNK_SIZE = 10 * 1024 * 1024  // 10MB 청크

  // Range 요청으로 청크 단위 다운로드
  // S3 API 사용 시 GetObject range 파라미터 활용
}
```

### 12.2 CDN 최적화

```typescript
// 1. 이미지 URL에 적절한 크기 지정으로 대역폭 절약
function getOptimizedImageUrl(path: string, viewportWidth: number) {
  const width = Math.min(viewportWidth * window.devicePixelRatio, 2500)
  return supabase.storage
    .from('images')
    .getPublicUrl(path, {
      transform: { width: Math.round(width), quality: 80 }
    }).data.publicUrl
}

// 2. 정적 자산 최대 캐시 (변경 시 새 경로 사용)
const staticAssets = ['logo.svg', 'placeholder.jpg']
// 업로드 시: cacheControl: '31536000' (1년)
// 변경 시: 새 파일명으로 업로드 후 참조 URL 변경

// 3. 이미지 srcset 구성
function buildSrcSet(imagePath: string) {
  const widths = [320, 640, 768, 1024, 1280, 1920]
  return widths
    .map(w =>
      `${supabase.storage.from('photos').getPublicUrl(imagePath, {
        transform: { width: w, quality: 80 }
      }).data.publicUrl} ${w}w`
    )
    .join(', ')
}
```

### 12.3 비용 관리

```typescript
// 미사용 파일 정리 (주기적 실행 권장)
async function cleanupOrphanFiles(userId: string) {
  // 1. DB에서 사용 중인 파일 경로 조회
  const { data: usedFiles } = await supabase
    .from('user_profiles')
    .select('avatar_url')
    .eq('user_id', userId)

  const usedPaths = usedFiles?.map(f => extractPathFromUrl(f.avatar_url)) ?? []

  // 2. Storage에서 사용자 파일 목록 조회
  const { data: storedFiles } = await supabase.storage
    .from('avatars')
    .list(userId)

  // 3. 사용되지 않는 파일 삭제
  const orphanFiles = storedFiles
    ?.filter(f => !usedPaths.includes(`${userId}/${f.name}`))
    .map(f => `${userId}/${f.name}`)

  if (orphanFiles?.length) {
    await supabase.storage.from('avatars').remove(orphanFiles)
  }
}

// 스토리지 사용량 모니터링 (SQL)
/*
SELECT
  bucket_id,
  COUNT(*) AS file_count,
  SUM((metadata->>'size')::bigint) / 1024 / 1024 AS total_mb
FROM storage.objects
GROUP BY bucket_id
ORDER BY total_mb DESC;
*/
```

### 12.4 자주 발생하는 오류 및 해결법

| 오류 | 원인 | 해결법 |
|------|------|--------|
| `new row violates row-level security policy` | INSERT 정책 없음 | `storage.objects` FOR INSERT 정책 추가 |
| `Bucket not found` | 버킷 미존재 또는 오타 | 버킷 ID 확인 및 생성 |
| `The resource already exists` | 동일 경로 파일 존재 | `upsert: true` 설정 또는 다른 경로 사용 |
| `Payload too large` | 파일 크기 초과 | 플랜 업그레이드 또는 파일 크기 제한 확인 |
| `Invalid MIME type` | 허용되지 않은 파일 타입 | `allowedMimeTypes` 설정 확인 |
| `Upload URL has expired` | TUS URL 24시간 만료 | 새 업로드 URL 생성 |

---

## 참고 자료

- [Supabase Storage 공식 문서](https://supabase.com/docs/guides/storage)
- [S3 호환성 문서](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Storage 버킷 기초](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [이미지 변환 문서](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control)
- [재개 가능 업로드](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [파일 크기 제한](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Storage v2 블로그 (Smart CDN + 이미지 리사이징)](https://supabase.com/blog/storage-image-resizing-smart-cdn)
- [Storage v3 블로그 (TUS 재개 가능 업로드 + 50GB 지원)](https://supabase.com/blog/storage-v3-resumable-uploads)
- [S3 프로토콜 발표 블로그](https://supabase.com/blog/s3-compatible-storage)
- [GitHub: supabase/storage](https://github.com/supabase/storage)
