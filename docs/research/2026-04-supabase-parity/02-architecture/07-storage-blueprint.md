# 07. Storage Blueprint — 카테고리 7 (Phase 17 MVP)

> Wave 4 · Tier 2 · B3 Compute 클러스터 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-B3)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [02-architecture/](./) → **이 문서**
> 연관: [01-adr-log.md](./01-adr-log.md) (ADR-008) · [00-system-overview.md](./00-system-overview.md) · [../00-vision/02-functional-requirements.md](../00-vision/02-functional-requirements.md) (FR-7.1~7.4) · [../01-research/07-storage/](../01-research/07-storage/)

---

## 0. 문서 목적 및 범위

본 문서는 양평 부엌 서버 대시보드의 **Storage 카테고리(카테고리 7)** 구현 청사진이다. Wave 1~3에서 확정된 아키텍처 결정(ADR-008: SeaweedFS 단독 + B2 오프로드)을 바탕으로, Phase 17 MVP에서 현재 40점을 90점으로 끌어올리는 구체적 설계를 제시한다.

### 문서 범위

- **포함**: StorageService 컴포넌트 설계, S3 호환 레이어, 파일 업로드 플로우, 데이터 모델, UI 라우트, 보안/접근 제어, 통합 지점, 부하 테스트 계획, DQ 답변, Phase 17 WBS
- **제외**: Wave 5 대상 Resumable Upload (P2), 100점 갭(~10점) 상세 구현

---

## 1. 요약 — 갭 40점 → 90점 달성 플랜

### 1.1 현재 상태 (40점)

Wave 2 D 매트릭스 기준 Storage 현재 점수 40점. 이유:

| 항목 | 현황 | 갭 |
|------|------|-----|
| S3 호환 객체 저장소 | 로컬 파일시스템 + Prisma Folder/File 트리 | 40점 |
| 버킷 정책 / ACL | 없음 — 모든 파일 접근 무제한 | 15점 |
| 이미지 변환 | 없음 | 10점 |
| B2 오프로드 / 티어링 | 없음 | 10점 |
| Resumable Upload | 없음 | 5점 (P2) |

**최대 갭 60점** 중 Phase 17 MVP에서 **50점 해소**, 나머지 10점(Resumable Upload P2 + 보너스 기능)은 Phase 22에서 처리.

### 1.2 Phase 17 MVP 달성 목표

```
현재: 40점
↓ FR-7.1 SeaweedFS S3 업로드/다운로드/삭제         +20점
↓ FR-7.2 Bucket 정책 (RLS + signed URL)           +15점
↓ B2 오프로드 자동 티어링                           +10점
↓ FR-7.3 이미지 변환 (sharp on-the-fly)            +5점
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
목표: 90점
```

### 1.3 채택 근거 (ADR-008 요약)

ADR-008(`01-adr-log.md §ADR-008`)의 결정을 그대로 따른다:

- **SeaweedFS 4.25 단독** — Apache-2.0, 이미지 리사이즈 내장, S3 API 91% 호환, Filer-PostgreSQL 공유 가능
- **Garage 3.72 보류** — AGPLv3 라이선스 우려, 재평가 3조건(§ 11.3)이 발동되지 않는 한 유지
- **MinIO 3.09 완전 배제** — 2026-02-12 아카이빙/AGPL 전환 VC Backed pivoting (CON-11)
- **B2 오프로드** — Backblaze B2는 S3 호환 외부 SaaS로 Cold Tier 역할, 월 $0.3 미만

---

## 2. Wave 1-2 채택안 및 재검토 트리거

### 2.1 Wave 1 점수 (deep-dive 결과)

| 후보 | Wave 1 점수 | 핵심 장점 | 핵심 단점 |
|------|-----------|---------|---------|
| **SeaweedFS** | **4.25/5** | Apache-2.0, 이미지 리사이즈, S3 91% | 3-tier 학습 부담, RAM 350-600MB |
| Garage | 3.72/5 | AGPLv3, Rust, 단일 바이너리, RAM 100-300MB | AGPLv3 잠재 위험, S3 55% 호환 |
| MinIO | 3.09/5 | 점유율 1위, GitHub 50K stars | 2026-02-12 AGPL 아카이빙 — CON-11 위반 |

### 2.2 Wave 2 매트릭스 재검증 (4.25 유지)

Wave 2 D 매트릭스(`../01-research/07-storage/04-storage-matrix.md`) 10차원 스코어링 결과:

| 차원 | SeaweedFS | Garage | MinIO |
|------|-----------|--------|-------|
| S3 API 호환 | 91% | 55% | 95% (아카이브됨) |
| 라이선스 안전성 | ✅ Apache 2.0 | △ AGPLv3 | ❌ AGPL |
| RAM (idle) | △ 350-600MB | ✅ 100-300MB | — |
| 이미지 리사이즈 내장 | ✅ O | ❌ X | ❌ X |
| Prisma 시너지 | ✅ Filer-PG | ❌ LMDB 독립 | — |
| 커뮤니티 규모 | ✅ 24K stars | △ 1.8K stars | — |
| Wave 2 종합 | **4.25/5** | 3.72/5 | **배제** |

**결론**: SeaweedFS 4.25 — Phase 17 채택안 확정.

### 2.3 Garage 재평가 3조건 (ADR-008 재검토 트리거)

아래 조건 중 하나라도 발생하면 Garage 대체 검토:

1. **SeaweedFS restart failure > 1건/주** — Prometheus `seaweedfs_restart_total > 7/week` 알림 발동 시
2. **SeaweedFS 파일 손상 1건 이상** — checksum 불일치 이벤트 발생 시
3. **SeaweedFS 커뮤니티 이탈** — Apache 2.0 → AGPL 전환 또는 major contributor 이탈 공식 발표 시

---

## 3. 컴포넌트 설계

### 3.1 컴포넌트 계층

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router                         │
│  /dashboard/storage  /dashboard/storage/[bucket]/files           │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Server Actions / Route Handlers
┌──────────────────────────────▼──────────────────────────────────┐
│                     StorageService                               │
│  upload() · download() · delete() · listFiles() · getMetadata() │
└──────┬──────────────┬──────────────────┬──────────────────┬─────┘
       │              │                  │                  │
┌──────▼─────┐ ┌──────▼──────┐ ┌────────▼────────┐ ┌──────▼──────┐
│BucketManager│ │B2OffloadSvc │ │ SignedUrlService │ │ImageTransform│
│create/list/ │ │auto-tiering │ │ HMAC-SHA256 sign │ │ sharp.js     │
│delete/quota │ │hot→cold     │ │ 5min expiry     │ │ on-the-fly   │
└──────┬─────┘ └──────┬──────┘ └────────┬────────┘ └──────┬──────┘
       │              │                  │                  │
┌──────▼──────────────▼──────────────────▼──────────────────▼──────┐
│                  S3CompatLayer (aws-sdk-v3)                       │
│  @aws-sdk/client-s3 — endpoint: SeaweedFS Filer:8333             │
└──────────────────────────────┬───────────────────────────────────┘
                               │ S3 SigV4
              ┌────────────────┴────────────────┐
    ┌─────────▼──────────┐             ┌────────▼──────────┐
    │  SeaweedFS Filer   │             │  Backblaze B2     │
    │  (Hot Tier)        │             │  (Cold Tier)      │
    │  localhost:8333    │             │  S3-compatible API │
    │  apache-2.0        │             │  SigV4 호환       │
    └────────────────────┘             └───────────────────┘
```

### 3.2 StorageService

**위치**: `src/server/storage/StorageService.ts`

```typescript
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucketManager: BucketManager;
  private readonly b2Offload: B2OffloadService;
  private readonly signedUrl: SignedUrlService;

  constructor(config: StorageConfig) {
    // SeaweedFS Filer를 엔드포인트로 설정 — aws-sdk-v3 사용
    this.s3 = new S3Client({
      endpoint: config.seaweedFsEndpoint,   // 'http://localhost:8333'
      region: 'us-east-1',                  // SeaweedFS 더미 리전
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,                 // SeaweedFS 요구사항
    });
    this.bucketManager = new BucketManager(this.s3);
    this.b2Offload = new B2OffloadService(config.b2Config);
    this.signedUrl = new SignedUrlService(config.hmacSecret);
  }

  // 단일 파일 업로드 (10MB MVP, 청크 업로드는 P2)
  async upload(params: UploadParams): Promise<UploadResult> { ... }

  // 파일 다운로드 (스트리밍)
  async download(bucket: string, key: string): Promise<Readable> { ... }

  // 파일 삭제 (SeaweedFS + B2 복사본 보존 30일)
  async delete(bucket: string, key: string): Promise<void> { ... }

  // 버킷 내 파일 목록 (페이지네이션)
  async listFiles(bucket: string, options: ListOptions): Promise<ListResult> { ... }

  // 파일 메타데이터 조회
  async getMetadata(bucket: string, key: string): Promise<FileMetadata> { ... }
}
```

**핵심 설계 결정**:
- `forcePathStyle: true` — SeaweedFS는 가상 호스팅 스타일(`bucket.host`) 미지원, 경로 스타일 필수
- 리전 `us-east-1` 더미값 — SeaweedFS는 리전을 사용하지 않지만 SDK가 요구
- 자격증명은 Vault(ADR-013)에서 runtime 주입 — `.env`에 직접 기재 금지

### 3.3 BucketManager

**위치**: `src/server/storage/BucketManager.ts`

```typescript
export class BucketManager {
  async createBucket(name: string, policy: BucketPolicy): Promise<void>
  async deleteBucket(name: string): Promise<void>
  async listBuckets(): Promise<BucketInfo[]>
  async getBucketPolicy(name: string): Promise<BucketPolicy>
  async setBucketPolicy(name: string, policy: BucketPolicy): Promise<void>
  async getBucketUsage(name: string): Promise<BucketUsage>   // 크기/파일수
  async enforceQuota(name: string): Promise<boolean>          // 10GB 기본 쿼터
}
```

버킷 메타데이터는 PostgreSQL `buckets` 테이블에 저장. SeaweedFS S3 API로 실제 버킷 생성, Prisma로 정책/쿼터 관리.

### 3.4 B2OffloadService — 자동 티어링

**위치**: `src/server/storage/B2OffloadService.ts`

```typescript
export class B2OffloadService {
  private readonly b2Client: S3Client;   // Backblaze B2 S3-compatible

  // Hot → Cold 이전 (파일 생성 후 24시간 딜레이)
  async tiereToB2(bucket: string, key: string): Promise<void>

  // B2에서 원본 복원 (SeaweedFS 삭제 후 재다운로드)
  async restoreFromB2(bucket: string, key: string): Promise<void>

  // B2 복사본 존재 여부 확인
  async existsInB2(bucket: string, key: string): Promise<boolean>

  // 오래된 B2 파일 정리 (SeaweedFS 원본 삭제 후 30일 retention)
  async cleanupExpiredB2Files(): Promise<CleanupResult>
}
```

**티어링 플로우**:
1. 파일 SeaweedFS 업로드 완료 → `file_offload_queue` 테이블에 `scheduled_at = NOW() + 24h` 레코드 삽입
2. node-cron 워커가 24시간마다 큐 처리 → B2에 복사 (`CopyObject`)
3. B2 복사 완료 → `files` 테이블의 `b2_key`, `offloaded_at` 업데이트
4. 운영자가 "Cold로 이동" 명시 → `storage_tier = 'cold'` + SeaweedFS 원본 삭제 (B2만 남김)

**주의**: SeaweedFS 원본을 자동 삭제하지 않는다. 자동 삭제는 운영자 승인 필수 (파괴적 작업 — 글로벌 규칙).

### 3.5 SignedUrlService

**위치**: `src/server/storage/SignedUrlService.ts`

```typescript
export class SignedUrlService {
  // 다운로드 Signed URL (HMAC-SHA256, 기본 5분 만료)
  generateDownloadUrl(params: SignUrlParams): string

  // 업로드 Presigned URL (S3 SigV4, 10분 만료)
  async generateUploadUrl(params: PresignParams): Promise<string>

  // URL 서명 검증
  verifySignature(url: string, secret: string): boolean
}
```

**URL 구조**:
```
/api/storage/files/{bucket}/{key}?expires={unix_ts}&sig={hmac_sha256}&user_id={uid}
```

- `expires`: Unix timestamp (UTC, 5분 후 = NOW() + 300)
- `sig`: `HMAC-SHA256(secret, "bucket:key:expires:userId")`
- 검증: 현재 시각 > expires → 410 Gone

---

## 4. S3 호환 레이어 — aws-sdk-v3 사용

### 4.1 설계 원칙

ADR-008에서 확정된 원칙: **`aws-sdk-v3`를 그대로 사용하되 엔드포인트만 SeaweedFS로 포인팅**. S3 API 호환 레이어를 별도로 만들지 않는다.

이유:
- SeaweedFS는 S3 SigV4 완전 지원 (`04-storage-matrix.md §2.2`)
- aws-sdk-v3은 `endpoint` + `forcePathStyle: true` 설정만으로 임의 S3 호환 서버 지원
- 동일 코드가 B2(Cold Tier) 접근에도 사용 가능 — 엔드포인트만 교체

### 4.2 클라이언트 설정

```typescript
// SeaweedFS 클라이언트
const seaweedClient = new S3Client({
  endpoint: process.env.SEAWEEDFS_ENDPOINT,   // http://localhost:8333
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.SEAWEEDFS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SEAWEEDFS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

// Backblaze B2 클라이언트 (동일 SDK, 엔드포인트만 다름)
const b2Client = new S3Client({
  endpoint: `https://s3.${process.env.B2_REGION}.backblazeb2.com`,
  region: process.env.B2_REGION,   // 예: us-west-002
  credentials: {
    accessKeyId: process.env.B2_APPLICATION_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
  forcePathStyle: false,   // B2는 가상 호스팅 스타일 지원
});
```

### 4.3 SigV4 전용 정책

**DQ-1.20 답변**: AWS Signature V4만 허용. V2 비활성화.

- SeaweedFS는 V2를 `△ (deprecated)`로 표시 (`04-storage-matrix.md §2.2`)
- aws-sdk-v3는 기본이 SigV4 — 별도 설정 불필요
- Presigned URL 생성 시 `expiresIn` < 604800 (7일) 강제 (S3 SigV4 한계)
- V2 호환 모드를 허용하는 라이브러리 설정 금지 (`requestChecksumCalculation` 관련 옵션 포함)

### 4.4 서버 외부 패키지 설정

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: [
    'isolated-vm',      // Edge Functions
    'better-sqlite3',   // 기존 SQLite
    '@aws-sdk/client-s3',  // S3 클라이언트 — webpack 번들 제외
    '@aws-sdk/s3-request-presigner',
  ],
};
```

---

## 5. 파일 업로드 플로우

### 5.1 단계별 플로우 (MVP: 10MB 이하 단일 업로드)

```
클라이언트                 Next.js API              SeaweedFS         PostgreSQL
    │                          │                        │                  │
    ├─[1] POST /api/storage/───►│                        │                  │
    │   upload-url 요청          │─[2] 파일 크기/MIME 검증─►│                  │
    │   {bucket, filename,       │                        │                  │
    │    size, mimeType}         │─[3] 쿼터 확인──────────────────────────────►│
    │                           │◄─[4] 쿼터 OK───────────────────────────────│
    │                           │                        │                  │
    │                           │─[5] generateUploadUrl─►│                  │
    │                           │◄─[6] presigned URL──────│                  │
    │                           │                        │                  │
    │◄─[7] presigned URL─────────│                        │                  │
    │                           │                        │                  │
    ├─[8] PUT {presigned URL}───────────────────────────►│                  │
    │◄─[9] 200 OK────────────────────────────────────────│                  │
    │                           │                        │                  │
    ├─[10] POST /api/storage/───►│                        │                  │
    │   confirm {key}            │─[11] HEAD Object──────►│                  │
    │                           │◄─[12] size, etag───────│                  │
    │                           │─[13] mime sniff(magic)──►│                  │
    │                           │◄─[14] mime OK───────────│                  │
    │                           │─[15] INSERT files──────────────────────────►│
    │                           │─[16] INSERT offload_queue (24h 후)──────────►│
    │◄─[17] 업로드 완료─────────│                        │                  │
```

**단계 설명**:
1. 클라이언트가 업로드 의도를 서버에 알림 (실제 파일 데이터 없음)
2. MIME 화이트리스트 검증, 파일 크기 10MB 한도 확인 (MVP)
3. 버킷 쿼터 확인 (기본 10GB)
4-6. SeaweedFS presigned URL 생성 (SigV4, 10분 만료)
7. 클라이언트에게 presigned URL 반환
8-9. 클라이언트가 SeaweedFS에 직접 PUT (서버 우회, 트래픽 절감)
10-14. 서버에서 업로드 완료 확인 + mime sniff 2차 검증
15-16. DB에 파일 메타 저장 + B2 오프로드 큐 예약
17. 업로드 완료 응답

### 5.2 청크 업로드 확장 (P2 — Phase 22)

MVP에서는 10MB 단일 업로드만 지원. 대용량 파일(최대 1GB)은 Phase 22에서:

- S3 Multipart Upload API (`CreateMultipartUpload → UploadPart × N → CompleteMultipart`)
- 또는 TUS 프로토콜 (`tus-node-server`)
- SeaweedFS는 Multipart Upload 완전 지원 (`04-storage-matrix.md §2.1`)

### 5.3 MIME 검증 정책

```typescript
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
  'application/pdf',
  'text/csv', 'text/plain',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  // xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // docx
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.py', '.rb',
  '.php', '.dll', '.so', '.dylib',
]);
```

1차: Content-Type 헤더 화이트리스트 확인
2차: 업로드 완료 후 파일 매직 바이트 검증 (file-type npm 패키지 또는 libmagic 바인딩)

---

## 6. 데이터 모델

### 6.1 buckets 테이블

```sql
CREATE TABLE buckets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  policy          TEXT NOT NULL DEFAULT 'private',  -- 'public' | 'private'
  quota_bytes     BIGINT NOT NULL DEFAULT 10737418240,  -- 10GB
  used_bytes      BIGINT NOT NULL DEFAULT 0,
  owner_id        UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buckets_name ON buckets(name);
CREATE INDEX idx_buckets_owner ON buckets(owner_id);
```

### 6.2 files 테이블 (확장)

```sql
CREATE TABLE files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id       UUID NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  storage_key     TEXT NOT NULL,         -- SeaweedFS 내부 key (fid 또는 경로)
  original_name   TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  mime_type       TEXT NOT NULL,
  checksum        TEXT NOT NULL,         -- SHA-256 hex
  etag            TEXT,                  -- S3 ETag (MD5 또는 multipart 복합)

  -- B2 오프로드 메타
  b2_bucket       TEXT,                  -- B2 버킷명
  b2_key          TEXT,                  -- B2 오브젝트 key
  offloaded_at    TIMESTAMPTZ,           -- B2 복사 완료 시각
  storage_tier    TEXT NOT NULL DEFAULT 'hot',  -- 'hot' | 'cold'

  -- 접근 제어
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,

  -- 이미지 메타 (이미지 파일만)
  width           INT,
  height          INT,
  format          TEXT,

  -- 생명주기
  uploaded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ            -- Soft delete
);

CREATE INDEX idx_files_bucket ON files(bucket_id);
CREATE INDEX idx_files_key ON files(storage_key);
CREATE INDEX idx_files_b2_key ON files(b2_key) WHERE b2_key IS NOT NULL;
CREATE INDEX idx_files_tier ON files(storage_tier);
CREATE INDEX idx_files_deleted ON files(deleted_at) WHERE deleted_at IS NULL;
```

### 6.3 file_offload_queue 테이블

```sql
CREATE TABLE file_offload_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ NOT NULL,     -- 실행 예정 시각
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'done' | 'failed'
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_offload_queue_status ON file_offload_queue(status, scheduled_at)
  WHERE status IN ('pending', 'failed');
```

### 6.4 file_access_logs 테이블

```sql
CREATE TABLE file_access_logs (
  id              BIGSERIAL PRIMARY KEY,
  file_id         UUID NOT NULL REFERENCES files(id),
  accessed_by     UUID REFERENCES users(id),
  access_type     TEXT NOT NULL,   -- 'download' | 'view' | 'delete'
  ip_address      TEXT,
  user_agent      TEXT,
  accessed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 파티셔닝 (월별, 2시간 배치 집계 후 아카이브)
CREATE INDEX idx_access_logs_file ON file_access_logs(file_id, accessed_at);
CREATE INDEX idx_access_logs_user ON file_access_logs(accessed_by, accessed_at);
```

### 6.5 Prisma 스키마 (핵심 모델)

```prisma
model Bucket {
  id          String    @id @default(uuid())
  name        String    @unique
  policy      String    @default("private")
  quotaBytes  BigInt    @default(10737418240)
  usedBytes   BigInt    @default(0)
  ownerId     String?
  owner       User?     @relation(fields: [ownerId], references: [id])
  files       File[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@map("buckets")
}

model File {
  id            String    @id @default(uuid())
  bucketId      String
  bucket        Bucket    @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  storageKey    String
  originalName  String
  sizeBytes     BigInt
  mimeType      String
  checksum      String
  etag          String?
  b2Bucket      String?
  b2Key         String?
  offloadedAt   DateTime?
  storageTier   String    @default("hot")
  isPublic      Boolean   @default(false)
  width         Int?
  height        Int?
  format        String?
  uploadedBy    String?
  uploader      User?     @relation(fields: [uploadedBy], references: [id])
  offloadQueue  FileOffloadQueue[]
  accessLogs    FileAccessLog[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([bucketId])
  @@index([storageKey])
  @@map("files")
}
```

---

## 7. UI — 대시보드 라우트

### 7.1 라우트 구조

```
/dashboard/storage
├── page.tsx                   — Buckets 목록 (생성/삭제/정책)
└── [bucket]/
    ├── page.tsx               — 파일 브라우저 (폴더 트리 + 파일 목록)
    ├── upload/
    │   └── page.tsx           — 업로드 드롭존
    └── [key]/
        └── page.tsx           — 파일 상세 (메타/다운로드/삭제/B2 상태)
```

### 7.2 /dashboard/storage — Buckets 목록

```
┌──────────────────────────────────────────────────────────────┐
│  Storage Buckets                              [+ New Bucket]  │
├──────────────────────────────────────────────────────────────┤
│  이름          정책      사용량      파일수    최종 업로드     │
│  ─────────────────────────────────────────────────────────   │
│  👁 media      Public    2.3 GB / 10GB  1,234   2026-04-17   │
│  🔒 private    Private   0.8 GB / 10GB    89    2026-04-18   │
│  🔒 backups    Private   5.1 GB / 10GB    12    2026-04-10   │
└──────────────────────────────────────────────────────────────┘
```

**버킷 생성 모달**:
- 버킷 이름 (소문자 알파벳 + 숫자 + 하이픈, 3-63자)
- 정책 선택 (Public / Private 토글)
- 쿼터 설정 (기본 10GB, 최대 100GB)

### 7.3 /dashboard/storage/[bucket]/files — 파일 브라우저

```
┌──────────────────────────────────────────────────────────────┐
│  media / images /                    [Upload] [New Folder]   │
├──────────────────────────────────────────────────────────────┤
│  📂 /                                                        │
│  ├── 📂 images/          2026-04-17    89 files              │
│  │   ├── 🖼 hero.jpg      2.3 MB       2026-04-17  [⬇][🗑]   │
│  │   └── 🖼 logo.png       45 KB       2026-04-15  [⬇][🗑]   │
│  └── 📄 report.pdf       8.1 MB       2026-04-10  [⬇][🗑]   │
├──────────────────────────────────────────────────────────────┤
│  Storage 사용량: 2.3 GB / 10 GB    ██████░░░░ 23%            │
└──────────────────────────────────────────────────────────────┘
```

**파일 상세 패널** (우측 슬라이드):
- 파일명, 크기, MIME, checksum
- B2 상태: Hot / Cold / 오프로드 예약 중
- Signed URL 복사 버튼
- 이미지 미리보기 (< 5MB)

### 7.4 업로드 드롭존

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│          📤 파일을 여기에 드롭하거나 클릭하세요              │
│                                                              │
│    지원 형식: JPEG, PNG, WebP, PDF, CSV, XLSX, DOCX         │
│    최대 파일 크기: 10 MB (대용량은 추후 지원 예정)           │
│                                                              │
│  ─────────────────────────────────────────────────────────   │
│  🖼 hero.jpg   2.3 MB   ████████████████░░░░ 80%  업로드 중  │
│  🖼 logo.png    45 KB   ████████████████████ 완료 ✓          │
└──────────────────────────────────────────────────────────────┘
```

**구현**: `react-dropzone` + TanStack Query `useMutation` + Sonner progress

---

## 8. 보안 — 접근 제어

### 8.1 버킷 레벨 정책

| 정책 | 읽기 | 쓰기 | 삭제 |
|------|------|------|------|
| Public | 누구나 | 인증 사용자 | 인증 사용자 (owner/admin) |
| Private | Signed URL 또는 인증 사용자 | 인증 사용자 | 인증 사용자 (owner/admin) |

### 8.2 Signed URL 정책

```
기본 만료: 5분 (300초)
업로드 presigned: 10분 (600초)
최대 만료: 1시간 (3600초) — 관리자 설정 가능

URL 서명 알고리즘: HMAC-SHA256
서명 입력: "bucket:key:expires:userId"
시크릿: Vault에서 runtime 조회 (ADR-013, env_file 경유)
```

### 8.3 파일 접근 감사 로그

모든 파일 접근(다운로드/삭제/URL 발급)은 `file_access_logs`에 기록:
- 2시간마다 배치 집계 (node-cron)
- 30일 보관 후 아카이브
- 관리자 대시보드 `/dashboard/storage/audit`에서 조회

### 8.4 업로드 보안

1. **사전 승인 단계**: 서버가 업로드 허가 전 크기/MIME 1차 검증
2. **업로드 후 검증**: SeaweedFS HEAD로 실제 크기 확인 + magic bytes 2차 검증
3. **악성 파일 차단**: 실행파일 확장자 차단 목록 (§5.3 참조)
4. **Checksum 저장**: SHA-256 서버 계산 후 `files.checksum` 저장 — 무결성 검증

---

## 9. 통합 포인트

### 9.1 Edge Functions 연동 (카테고리 8 — L4 의존)

ADR-018 9-레이어 구조에서 Storage(L4)는 Edge Functions(L5)에 접근을 허용:

```typescript
// Edge Functions L1/L2에서 Storage 버킷 접근 패턴
// StorageService의 제한된 인스턴스를 Edge Functions 런타임에 주입

// decideRuntime()이 L1을 선택한 경우
const storageRef = isolate.createReference(storageAccessProxy);
context.global.setSync('storage', storageRef);

// storageAccessProxy: 읽기 전용 + 허용된 버킷만 노출
const storageAccessProxy = {
  getFile: (bucket: string, key: string) => storage.download(bucket, key),
  // 쓰기는 허용 안 함 (L1에서는 읽기 전용)
};
```

### 9.2 Auth Core 연동 (업로드 권한)

파일 업로드 권한 체계 (ADR-006 Auth Core 기반):

| 역할 | 버킷 생성 | 파일 업로드 | 다른 사용자 파일 삭제 | Public 버킷 전환 |
|------|---------|----------|------------------|----------------|
| admin | ✅ | ✅ | ✅ | ✅ |
| owner | ✅ | ✅ | 자기 소유만 | ✅ |
| member | ❌ | ✅ (허용된 버킷) | ❌ | ❌ |

### 9.3 Observability 연동 (Vault에 B2 키 저장)

B2 자격증명은 Vault에 저장 (ADR-013):

```typescript
// B2 자격증명 조회 (런타임)
const b2Creds = await vaultService.getSecret('b2_application_key');
const b2KeyId = await vaultService.getSecret('b2_application_key_id');

// StorageService 초기화 시 주입
const storageService = new StorageService({
  b2Config: {
    endpoint: `https://s3.${B2_REGION}.backblazeb2.com`,
    accessKeyId: b2KeyId.value,
    secretAccessKey: b2Creds.value,
    region: B2_REGION,
  }
});
```

---

## 10. 50GB+ 부하 테스트 계획 (spike-007)

### 10.1 테스트 목적

ADR-008에서 식별된 주요 리스크: **"SeaweedFS 50GB+ 운영 미검증 (ASM-4)"**. Phase 17 배포 전 spike-007에서 검증 완료 필수.

### 10.2 테스트 환경

```yaml
# WSL2 테스트 환경
OS: Ubuntu 22.04 on WSL2
RAM: 16GB (SeaweedFS에 4GB 할당)
Disk: NVMe SSD 500GB
SeaweedFS: v4.20 (filer + volume + master 단일 노드)
테스트 도구: k6 + 자체 Go 스크립트
```

### 10.3 테스트 시나리오

**시나리오 1: 점진적 부하 (데이터 축적)**

```
Phase 1: 0 → 10GB (10GB × 10 iterations)
  - 파일 크기: 100KB ~ 10MB 혼합
  - 동시 업로드: 10 workers
  - 목표: OOM 없이 완료, SeaweedFS RAM < 2GB

Phase 2: 10GB → 30GB
  - 파일 크기: 1MB ~ 100MB 혼합
  - 동시 업로드: 20 workers
  - 측정: Volume Server disk seek latency

Phase 3: 30GB → 50GB
  - 대용량 파일 (50MB ~ 100MB)
  - 동시 업로드: 30 workers
  - 경보 포인트: filer memory > 1.5GB
```

**시나리오 2: 동시 읽기/쓰기**

```
- 쓰기: 20 workers × 1MB 파일 × 10분
- 동시 읽기: 50 workers × 랜덤 파일 × 10분
- 측정: p95 읽기 < 500ms, p99 < 2s
```

**시나리오 3: 장애 복구**

```
1. 50GB 상태에서 SeaweedFS volume server 재시작
2. 측정: 서비스 재개까지 시간 (목표 < 60초)
3. 데이터 무결성 확인: checksum 전수 검사
```

### 10.4 OOM 경보 기준

```yaml
# Prometheus 알림 규칙 (spike-007 → Phase 17 정식 운영)
- alert: SeaweedFSOOM
  expr: process_resident_memory_bytes{job="seaweedfs"} > 2147483648  # 2GB
  for: 5m
  annotations:
    summary: "SeaweedFS RAM > 2GB — OOM 위험"

- alert: SeaweedFSRestartFrequent
  expr: increase(seaweedfs_restart_total[1h]) > 0
  annotations:
    summary: "SeaweedFS 재시작 감지 — ADR-008 재검토 트리거 근접"
```

### 10.5 Go/No-Go 기준

| 지표 | Go 조건 | No-Go 조건 | No-Go 시 대응 |
|------|--------|------------|--------------|
| OOM 발생 여부 | 0건 | 1건 이상 | volume server memoryLimit 조정 + Garage 재평가 |
| 파일 손상 | 0건 | 1건 이상 | ADR-008 재검토 즉시 |
| 50GB 업로드 완료 시간 | < 4시간 | > 6시간 | 청크 크기 조정 |
| p95 읽기 지연 | < 500ms | > 2s | Filer 메타데이터 인덱스 최적화 |
| 재시작 후 복구 | < 60초 | > 5분 | PM2 재시작 정책 강화 |

---

## 11. 리스크 TOP 3

### 11.1 리스크 1 — 50GB+ 운영 미검증 (심각도: 높음)

| 항목 | 내용 |
|------|------|
| **리스크** | SeaweedFS를 50GB 이상 운영한 실 데이터가 없음. Wave 1/2 리서치는 문서 기반 |
| **확률** | 중간 (40%) — 소규모 운영이라 실제 50GB 도달까지 시간 필요 |
| **영향** | 높음 — 데이터 손실 또는 서비스 중단 |
| **완화** | spike-007 50GB 부하 테스트 Phase 17 배포 전 완료 (§ 10) |
| **잔여 리스크** | 낮음 (테스트 통과 후) |
| **Wave 3 리스크 매트릭스** | ADR-008 재검토 트리거 1 (restart > 1건/주) |

### 11.2 리스크 2 — SeaweedFS OOM (심각도: 중간)

| 항목 | 내용 |
|------|------|
| **리스크** | 단일 노드에 Master + Filer + Volume 3 컴포넌트 동시 실행 시 RAM 600MB~2GB 상주. WSL2 환경에서 isolated-vm, better-sqlite3 등과 경합 |
| **확률** | 중간 (30%) — RAM < 4GB 환경에서 발생 가능 |
| **영향** | 중간 — SeaweedFS 프로세스 킬, 서비스 임시 중단 |
| **완화** | 1. WSL2 메모리 최소 8GB 권장 (`.wslconfig`에서 설정). 2. SeaweedFS volume server `memoryLimitMB=1024` 설정. 3. Prometheus OOM 경보 (§ 10.4). 4. PM2 `max_memory_restart: '2G'` 설정 |
| **잔여 리스크** | 낮음 |

### 11.3 리스크 3 — B2 오프로드 자동화 실수 (심각도: 높음)

| 항목 | 내용 |
|------|------|
| **리스크** | B2 오프로드 후 SeaweedFS 원본을 잘못 삭제하면 복구 불가 (B2 retention 30일). 특히 node-cron 워커 버그 또는 운영자 실수 |
| **확률** | 낮음 (10%) — 코드 버그 발생 시 |
| **영향** | 매우 높음 — 데이터 영구 손실 |
| **완화** | 1. SeaweedFS 원본 **자동 삭제 금지** — 운영자 명시적 승인 필수 (§ 3.4). 2. `storage_tier = 'cold'` 전환 전 B2 복사본 존재 확인 (`existsInB2()` 호출 후 전환). 3. Soft delete (`deleted_at`) 사용 — 30일 후 하드 삭제. 4. 삭제 감사 로그 필수 |
| **잔여 리스크** | 낮음 (운영자 승인 게이트) |

---

## 12. DQ 답변

### 12.1 DQ-1.20 — S3 호환 SigV4 vs V2

> **질문**: SeaweedFS의 S3 호환 레이어에서 AWS Signature V4와 V2 중 어느 것을 사용해야 하는가?

**답변**: **SigV4만 허용. V2 완전 비활성화.**

근거:
1. SeaweedFS `04-storage-matrix.md §2.2`에서 V2를 `△ (deprecated)`로 표시 — 호환 여부 불안정
2. aws-sdk-v3는 기본이 SigV4. V2를 강제하려면 deprecated 설정이 필요 — 코드 품질 저하
3. Backblaze B2는 V4 전용 (`04-storage-matrix.md §2.2` — V2 지원 `X`)
4. 동일 코드베이스에서 SeaweedFS(Hot)와 B2(Cold) 모두 V4로 통일 → 코드 단순화

**구현 규칙**:
- `@aws-sdk/client-s3` 기본 설정 유지 (V4 기본)
- `requestChecksumCalculation`, `responseChecksumValidation` 설정 활성화 권장 (데이터 무결성)
- Presigned URL `expiresIn` 최대 604800초 (7일) 제한 — V4 명세

**정량 기준**: V4 Presigned URL `p95 생성 시간 < 5ms`. V2 요청 시 `400 Bad Request` 즉시 반환.

### 12.2 DQ-STO-1 — SeaweedFS 메타데이터 백엔드

> **질문**: SeaweedFS Filer의 메타데이터 백엔드로 PostgreSQL vs SQLite vs LevelDB 중 무엇을 사용해야 하는가?

**답변**: **PostgreSQL (기존 Prisma PG 인스턴스 공유)**

근거:
1. `01-adr-log.md ADR-008` — "SeaweedFS Filer-PostgreSQL 공유 가능"이 Garage 대비 결정적 우위로 기록
2. SQLite는 동시 쓰기 충돌 위험 — 파일 업로드 동시성 10+ 에서 락 경합
3. LevelDB는 백업 전략 복잡 — wal-g가 PG만 백업하므로 메타 이원화 발생
4. PG 공유로 Prisma 트랜잭션 내에서 파일 메타 + SeaweedFS 메타 일관성 보장

**설정**: `seaweedfs filer -defaultStoreDir=/var/seaweedfs -filer.option postgres://...`

**정량 기준**: 메타데이터 조회 `p95 < 20ms` (파일 1만 개 기준).

### 12.3 DQ-STO-2 — 이미지 변환 서버: SeaweedFS 내장 vs sharp

> **질문**: 이미지 변환에 SeaweedFS Volume Server 내장 리사이즈 기능을 쓸지, Node.js `sharp`를 쓸지?

**답변**: **두 가지 모두 사용, 역할 분담.**

- **SeaweedFS 내장** (URL 파라미터 방식): 미리보기/썸네일처럼 간단한 리사이즈. 캐시 없이 즉시 사용. `GET /bucket/image.jpg?width=200&height=200`
- **sharp** (Next.js Route Handler): 고품질 변환(AVIF, WebP 최적화, 복잡한 crop). `/api/storage/image?w=400&h=300&fm=webp&q=80` 경로에서 처리. 디스크 캐시 적용 (§7 FR-7.3).

**정량 기준**:
- SeaweedFS 내장: 캐시 없음, p95 < 200ms
- sharp + 캐시 히트: p95 < 20ms
- sharp + 캐시 미스: p95 < 500ms (5MB 원본 PNG → 400px WebP)

---

## 13. Phase 17 WBS (공수 ~30h)

### 13.1 작업 분해

| 작업 ID | 작업명 | 담당 | 예상 공수 | 선행 작업 | 산출물 |
|---------|-------|------|--------|---------|-------|
| STO-01 | SeaweedFS 설치 + PM2 설정 | 운영자 | 2h | — | PM2 ecosystem에 seaweedfs 앱 추가 |
| STO-02 | Prisma 스키마 마이그레이션 (buckets, files, queue) | 개발 | 2h | STO-01 | `prisma migrate` 완료 |
| STO-03 | S3CompatLayer (aws-sdk-v3 SeaweedFS 연결) | 개발 | 3h | STO-01 | 연결 테스트 통과 |
| STO-04 | StorageService 핵심 (upload/download/delete) | 개발 | 4h | STO-02, STO-03 | Unit 테스트 통과 |
| STO-05 | BucketManager (생성/삭제/쿼터) | 개발 | 2h | STO-04 | API 라우트 완성 |
| STO-06 | SignedUrlService (HMAC-SHA256) | 개발 | 2h | STO-04 | URL 서명/검증 테스트 |
| STO-07 | B2OffloadService + offload queue | 개발 | 4h | STO-04 | 오프로드 큐 Integration 테스트 |
| STO-08 | UI: /dashboard/storage (Buckets 목록) | 개발 | 3h | STO-05 | Manual QA 통과 |
| STO-09 | UI: 파일 브라우저 + 업로드 드롭존 | 개발 | 4h | STO-06 | Manual QA 통과 |
| STO-10 | 이미지 변환 (sharp Route Handler) | 개발 | 2h | STO-04 | Performance Benchmark 통과 |
| STO-11 | spike-007 50GB 부하 테스트 | 개발 | 2h | STO-04 | Go/No-Go 판정 |

**총 공수**: 30h

### 13.2 마일스톤

| 마일스톤 | 완료 기준 | 예상 시점 |
|---------|---------|---------|
| M17-1 (인프라) | SeaweedFS PM2 기동 + S3 API 연결 확인 | STO-01~03 완료 |
| M17-2 (핵심 기능) | 업로드/다운로드/삭제 API 동작 | STO-04~06 완료 |
| M17-3 (오프로드) | B2 자동 티어링 큐 동작 | STO-07 완료 |
| M17-4 (UI) | 브라우저에서 파일 관리 가능 | STO-08~10 완료 |
| M17-5 (검증) | 50GB 테스트 Go 판정 | STO-11 완료 |

### 13.3 완료 기준 (Phase 17 Storage 90점)

- [ ] SeaweedFS S3 API로 업로드/다운로드/삭제 정상 동작
- [ ] Private bucket Signed URL 접근 제어 동작
- [ ] B2 오프로드 큐 24시간 딜레이 정상 처리
- [ ] sharp 이미지 변환 캐시 히트 p95 < 20ms
- [ ] spike-007 50GB 부하 테스트 Go 판정
- [ ] OOM 경보 Prometheus 설정 완료
- [ ] 파일 접근 감사 로그 `file_access_logs` 기록 확인
- [ ] /dashboard/storage UI Manual QA 체크리스트 완료

---

## 부록 A. 환경변수 목록

```bash
# SeaweedFS
SEAWEEDFS_ENDPOINT=http://localhost:8333
SEAWEEDFS_ACCESS_KEY_ID=<Vault에서 주입>
SEAWEEDFS_SECRET_ACCESS_KEY=<Vault에서 주입>
SEAWEEDFS_MASTER_PORT=9333
SEAWEEDFS_FILER_PORT=8888

# Backblaze B2 (Vault에 저장, 런타임 조회)
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com
B2_REGION=us-west-002
# B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY → Vault에서 조회

# Storage 정책
STORAGE_SIGNED_URL_SECRET=<Vault에서 주입>
STORAGE_DEFAULT_EXPIRY_SECONDS=300
STORAGE_MAX_FILE_SIZE_MB=10
STORAGE_DEFAULT_QUOTA_GB=10
```

**주의**: B2 자격증명은 `.env`에 직접 기재하지 않는다. Vault(`/etc/luckystyle4u/secrets.env`) + PM2 `env_file`로 런타임 주입 (ADR-013).

---

## 부록 B. SeaweedFS PM2 설정

```javascript
// ecosystem.config.js에 추가
{
  name: 'seaweedfs-master',
  script: 'weed',
  args: 'master -mdir=/var/seaweedfs/master',
  interpreter: 'none',
  autorestart: true,
  watch: false,
},
{
  name: 'seaweedfs-volume',
  script: 'weed',
  args: 'volume -dir=/var/seaweedfs/volumes -mserver=localhost:9333 -memoryLimitMB=1024',
  interpreter: 'none',
  autorestart: true,
  watch: false,
  max_memory_restart: '2G',
},
{
  name: 'seaweedfs-filer',
  script: 'weed',
  args: 'filer -master=localhost:9333 -filer.option postgres://yangpyeong:...@localhost:5432/yangpyeong_db',
  interpreter: 'none',
  autorestart: true,
  watch: false,
},
```

---

> **Storage Blueprint 끝.** Wave 4 · B3 · 2026-04-18 · 카테고리 7 · Phase 17 MVP · 목표 90점 · 공수 30h
