# SeaweedFS Deep Dive — Storage Wave 1

> 작성: kdywave Wave 1 deep-dive 에이전트
> 작성일: 2026-04-18
> 컨텍스트: 양평 부엌 서버 대시보드 (stylelucky4u.com) — Supabase 동등 Storage 도달
> 환경: WSL2 Ubuntu + PM2 + Cloudflare Tunnel + 단일 서버 + $0/month
> 현재 Storage 점수: 40/100

---

## 1. 요약 (Executive Summary)

SeaweedFS는 2015년부터 개발된 분산 객체·파일 스토리지 시스템으로, "**O(1) disk seek로 수십억 파일을 처리**"한다는 명확한 설계 목표를 가진다. Apache 2.0 라이선스, Go(82%) + Rust(6%) 작성, 2026년 4월 현재 v4.20 릴리즈. 본가 MinIO가 사실상 종료되면서 **기능 풍부함과 프로덕션 검증을 모두 갖춘 1순위 대체재**로 부상했다.

핵심 차별점은 ① **Filer + Volume + Master 3-tier 아키텍처**, ② Versioning/Object Lock/SSE 풀 지원, ③ **이미지 리사이즈 내장** (Volume server URL 파라미터로 즉석), ④ FUSE 마운트, WebDAV, Hadoop, Iceberg, K8s CSI 등 광범위 통합, ⑤ Apache 2.0 (라이선스 안전), ⑥ MinIO보다 작은 파일 워크로드에서 압도적 성능. 특히 **이미지 리사이즈 내장**은 Garage·MinIO 대비 결정적 우위로, Supabase Storage의 imgproxy 기능을 별도 사이드카 없이 부분 대체한다.

단점도 명확하다 ① **3-tier 아키텍처가 1인 운영자에게 학습 부담** — Master/Volume/Filer 각각의 역할을 이해해야 함, ② 모든 컴포넌트를 단일 노드에 띄우면 RAM 600MB~2GB로 Garage보다 무거움, ③ 메타데이터 백엔드 선택지(SQLite/Postgres/Redis 등)가 다양하지만 잘못 고르면 성능/안정성 영향, ④ S3 API 호환성은 우수하나 일부 엣지케이스(Multipart의 특수 헤더 등)에서 갭 존재.

본 문서는 점수 **4.25/5**로 산출하며, Garage(3.72)보다 명확히 높고 본 Wave 1 Storage 후보 중 최고점이다. **DQ-1.3 답변에서 SeaweedFS가 명확한 1순위**이며, 결정 기준은 다음과 같다:
- **이미지 변환 + 풀 기능 우선** → SeaweedFS
- **자원 절약 + 단순 운영 우선** → Garage

양평 부엌 서버처럼 갤러리·이미지가 많고 Supabase 동등성을 100점으로 끌어올리려면 SeaweedFS가 유리하다.

---

## 2. 프로젝트 배경

### 2.1 역사와 거버넌스

- **2015**: Chris Lu (chrislusf) 개인 프로젝트로 출발, Facebook Haystack 논문 영향 받음
- **2016~**: GitHub 스타 폭발 성장, 커뮤니티 기여 활성화
- **2020**: Apache 2.0 유지하며 엔터프라이즈 버전(seaweedfs.com) 별도 출시 (open-core 모델)
- **2024**: Iceberg 테이블 지원 추가, 데이터 레이크 워크로드 확장
- **2026-04**: v4.20 안정 릴리즈

### 2.2 Open Core 모델

SeaweedFS는 **OSS Community Edition (Apache 2.0)** + **Enterprise Edition (유료)** 분리:
- Community: 모든 핵심 기능 포함, 프로덕션 사용 가능
- Enterprise: 추가 도구, 전문 지원, 컴플라이언스 인증

이 모델은 MinIO Inc.의 비극(OSS 죽이고 상용만 남김)을 답습할 위험이 있긴 하다. 그러나 SeaweedFS는 ① 단일 개인이 주도해 라이선스 협상 단순함, ② Apache 2.0이라 영구 fork 가능, ③ 10년 동안 일관된 라이선스 정책 유지로 상대적 안전.

### 2.3 GitHub 통계 (2026-04 기준)

- **Stars**: 약 24,000 ⭐
- **Forks**: 약 2,300
- **Contributors**: 200+
- **Releases**: 200+ (v0.x → v4.20)
- **활성도**: 매주 커밋, 월간 릴리즈

---

## 3. 아키텍처

### 3.1 3-Tier 구성

SeaweedFS의 핵심 아키텍처:

```
┌─────────────────────────────────────────┐
│ Client (S3 SDK / FUSE / WebDAV / HTTP)  │
└──────────┬──────────────────────────────┘
           │
┌──────────▼──────────┐    ┌──────────────────┐
│ S3 Gateway / Filer  │◄──►│ Master Server(s) │
│ - 메타데이터 관리   │    │ - Volume 위치    │
│ - POSIX/S3 변환     │    │ - Topology       │
└──────────┬──────────┘    │ - Heartbeat      │
           │               └──────────────────┘
           │
┌──────────▼──────────────────────────────┐
│ Volume Server(s)                         │
│ - 실제 데이터 저장 (append-only volumes) │
│ - O(1) disk seek                         │
│ - 이미지 리사이즈                        │
└──────────────────────────────────────────┘
```

### 3.2 Master Server

- 클러스터 토폴로지 관리
- Volume ID → Volume Server 매핑
- 리더 선출 (Raft, 다중 마스터 시)
- 단일 노드 환경에선 마스터 1개로 충분

### 3.3 Volume Server

- **Volume**: 32GB 단위 append-only 파일 컨테이너 (기본값)
- **needle**: Volume 내부의 개별 객체 (Facebook Haystack 용어)
- **O(1) seek**: needle ID → 파일 오프셋 계산이 in-memory 인덱스로 즉시
- **이미지 리사이즈**: Volume server가 GET 요청 시 URL 파라미터(`?width=200`)로 즉석 처리

### 3.4 Filer

- POSIX 메타데이터 (디렉토리 트리, 권한, mtime 등)를 별도 DB에 저장
- 메타데이터 백엔드 선택지:
  - SQLite (단일 노드 기본)
  - PostgreSQL (양평 환경에서 이미 사용 중 ← 권장)
  - Redis, Cassandra, MongoDB, Elasticsearch, MySQL 등
- S3 API는 Filer 위에 구현됨 → S3 객체는 Filer의 디렉토리/파일과 직접 매핑

### 3.5 단일 노드 토폴로지 (양평 부엌 서버)

`weed server -dir=/data -s3` 한 줄로 다음 4개를 단일 프로세스에 모두 기동:
- Master (port 9333)
- Volume (port 8080)
- Filer (port 8888)
- S3 Gateway (port 8333)

이는 운영 단순성을 위한 설계지만 내부적으론 여전히 3-tier로 동작.

### 3.6 메모리 모델

각 컴포넌트 메모리 사용 (단일 노드, idle 기준):
- Master: ~50MB
- Volume: ~150MB + (파일 수 × 24바이트 인덱스)
- Filer: ~100MB + 메타데이터 캐시
- S3 Gateway: ~50MB
- **총 idle**: ~350~600MB

부하 시:
- 100KB 파일 1000 동시 read → +100MB (파일 버퍼)
- 32MB 파일 1000 동시 read → +32GB (큰 객체 부담) ← 단, 동시 1000은 비현실적

**양평 부엌 환경 추정**: 500MB~1.5GB로 Garage(100~500MB)보다 1.5~3배 무겁지만, MinIO(8GB+) 대비 1/4~1/8 수준.

### 3.7 메타데이터 정밀 분석

검색 결과 인용:
> "Roughly about 20 bytes is needed for each file. So if one 30GB volume has 1 million files of averaged 30KB, the volume can cost 20MB memory to hold the index."

해석: 100만 파일 = 20MB 인덱스. 양평 부엌이 1억 파일을 다룰 일은 없으므로 인덱스 메모리는 무시 가능.

---

## 4. 핵심 기능 (Feature Matrix)

### 4.1 S3 API 호환 (공식 Wiki 기준)

| 기능 | SeaweedFS | Garage | MinIO |
|------|-----------|--------|-------|
| PUT/GET/DELETE/HEAD | O | O | O |
| Multipart Upload | O | O | O |
| Presigned URL (Sig v4) | O | O | O |
| Conditional Headers (If-Match 등) | O | O | O |
| Range Requests | O | O | O |
| **Versioning** | **O** | X | △ |
| **Object Lock + Legal Hold** | **O** | X | △ |
| **SSE-S3** | **O** | X | O |
| **SSE-KMS** | **O** | X | O |
| SSE-C | O | O | O |
| **Lifecycle (Expiration)** | O | △ | O |
| Lifecycle (Transition) | X | X | O |
| **Object Tagging** | **O** | X | O |
| **Bucket Tagging** | **O** | X | O |
| **Bucket Policy (S3 IAM JSON)** | **O** | X | O |
| CORS | O | O | O |
| User Metadata | O | O | O |
| Bucket Replication | X | △ | O |
| Event Notifications | X | X | O |
| Static Website Hosting | X | O | O |
| **Image Resize/Crop (URL param)** | **O 내장** | X | X |

**중요**: SeaweedFS는 Garage가 미지원하는 Versioning, Object Lock, SSE-S3/KMS, Bucket Policy를 모두 지원. **MinIO에 가장 가까운 기능 풍부도**.

### 4.2 비-S3 인터페이스 (보너스)

- **POSIX FUSE 마운트**: `weed mount` → Linux 디렉토리로 마운트
- **WebDAV**: 클라이언트(파일탐색기, Mac Finder)에서 직접 접근
- **HDFS 호환**: Hadoop 클러스터에서 사용
- **Iceberg 테이블**: 데이터 레이크 워크로드
- **Kubernetes CSI**: PVC로 마운트
- **gRPC API**: 저수준 제어

양평 부엌 서버는 S3만 쓰면 되지만, 향후 백업 자동화 등에 FUSE/WebDAV가 유용할 수 있음.

### 4.3 이미지 리사이즈 내장 (핵심 차별점)

```
GET http://volume:8080/3,01637037d6.jpg?width=200&height=200&mode=fit
```

지원 모드:
- **fit**: 비율 유지하며 박스 안에 맞춤
- **fill**: 박스 전체 채움 (잘림 발생 가능)
- **default**: 종횡비에 따라 thumbnail/resize 자동

지원 포맷: JPEG, PNG, GIF, WebP (Lanczos 필터)

**한계**:
- S3 GET 경로(`s3:8333/bucket/key`)에선 미지원 — Volume server 직접 접근(`volume:8080/...`)에서만
- 우리 프로젝트가 이미지 변환을 활용하려면 (a) Volume server를 외부 노출하거나 (b) Next.js Route Handler가 Volume server에 프록시
- WebP 인코딩 지원은 추가, 그러나 일부 케이스에서 한계 (Issue #478)

**Supabase Storage 동등성 평가**:
- Supabase imgproxy: width/height/quality/format/blur 등 풍부
- SeaweedFS 내장: width/height/mode만
- → 부분 대체. 풀 기능 원하면 imgproxy 별도 가능

---

## 5. API & 코드 예시

### 5.1 SeaweedFS 단일 노드 설치 (Docker Compose)

```yaml
# docker-compose.yml
version: "3.8"
services:
  seaweed:
    image: chrislusf/seaweedfs:4.20
    command:
      - "server"
      - "-dir=/data"
      - "-master.port=9333"
      - "-volume.port=8080"
      - "-volume.max=0"
      - "-volume.preStopSeconds=30"
      - "-filer"
      - "-filer.port=8888"
      - "-s3"
      - "-s3.port=8333"
      - "-s3.config=/etc/seaweed/s3.json"
      - "-defaultReplication=000"
    volumes:
      - ./data:/data
      - ./s3.json:/etc/seaweed/s3.json
    ports:
      - "127.0.0.1:9333:9333"   # master
      - "127.0.0.1:8080:8080"   # volume
      - "127.0.0.1:8888:8888"   # filer
      - "127.0.0.1:8333:8333"   # s3
    restart: unless-stopped
```

```json
// s3.json — 액세스 키와 권한
{
  "identities": [
    {
      "name": "yangpyeong-app",
      "credentials": [
        {
          "accessKey": "<AKID>",
          "secretKey": "<SECRET>"
        }
      ],
      "actions": [
        "Read:yangpyeong-uploads",
        "Write:yangpyeong-uploads",
        "List:yangpyeong-uploads",
        "Tagging:yangpyeong-uploads",
        "Read:yangpyeong-public",
        "Write:yangpyeong-public",
        "List:yangpyeong-public"
      ]
    },
    {
      "name": "anonymous",
      "actions": [
        "Read:yangpyeong-public"
      ]
    }
  ]
}
```

### 5.2 Filer 메타데이터를 PostgreSQL로 (양평 환경 권장)

```toml
# filer.toml
[postgres]
enabled = true
hostname = "localhost"
port = 5432
username = "yangpyeong"
password = "<SECRET>"
database = "yangpyeong_dashboard"
sslmode = "disable"
connection_max_idle = 10
connection_max_open = 100
```

이러면 SeaweedFS의 Filer가 양평 부엌 서버의 기존 PostgreSQL을 메타데이터 스토리지로 재사용. 별도 SQLite/Redis 운영 부담 X.

### 5.3 Next.js 16 App Router에서 S3 SDK 사용

```typescript
// app/lib/seaweed-client.ts
import { S3Client } from "@aws-sdk/client-s3";

export const seaweed = new S3Client({
  region: "us-east-1",
  endpoint: process.env.SEAWEED_S3_ENDPOINT, // http://localhost:8333
  credentials: {
    accessKeyId: process.env.SEAWEED_ACCESS_KEY!,
    secretAccessKey: process.env.SEAWEED_SECRET_KEY!,
  },
  forcePathStyle: true,
});
```

### 5.4 Presigned URL (PUT) 발급

```typescript
// app/api/upload/presign/route.ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { seaweed } from "@/app/lib/seaweed-client";
import { z } from "zod";
import { auth } from "@/app/lib/auth";

const Schema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^[a-z]+\/[a-z0-9.\-+]+$/i),
  contentLength: z.number().int().positive().max(50 * 1024 * 1024),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = Schema.parse(await req.json());
  const key = `users/${session.user.id}/${crypto.randomUUID()}-${body.filename}`;

  const cmd = new PutObjectCommand({
    Bucket: "yangpyeong-uploads",
    Key: key,
    ContentType: body.contentType,
    ContentLength: body.contentLength,
    Metadata: {
      "user-id": session.user.id,
      "uploaded-at": new Date().toISOString(),
    },
  });

  const url = await getSignedUrl(seaweed, cmd, { expiresIn: 60 });
  return NextResponse.json({ url, key });
}
```

### 5.5 Versioning 활성화 (Garage·기본 MinIO 미지원 기능)

```typescript
import { PutBucketVersioningCommand } from "@aws-sdk/client-s3";

await seaweed.send(
  new PutBucketVersioningCommand({
    Bucket: "yangpyeong-uploads",
    VersioningConfiguration: { Status: "Enabled" },
  })
);

// 이후 같은 key에 PUT 시 이전 버전 보존
// 사용자 실수 복구 가능
```

### 5.6 Object Lock (WORM)

```typescript
import { PutObjectCommand } from "@aws-sdk/client-s3";

await seaweed.send(
  new PutObjectCommand({
    Bucket: "yangpyeong-archive",
    Key: "tax-2026.pdf",
    Body: pdfBuffer,
    ObjectLockMode: "COMPLIANCE",
    ObjectLockRetainUntilDate: new Date("2031-12-31"),
  })
);
// 5년간 삭제·수정 불가 (법적 보존)
```

### 5.7 이미지 리사이즈 (내장 기능 활용)

방법 1: Next.js Route Handler가 Volume server에 프록시

```typescript
// app/api/img/[...path]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { path: string[] } }
) {
  const url = new URL(req.url);
  const width = url.searchParams.get("w") ?? "";
  const height = url.searchParams.get("h") ?? "";
  const mode = url.searchParams.get("mode") ?? "fit";

  // S3 key → SeaweedFS file ID 변환은 Filer API로
  const key = params.path.join("/");
  const filerRes = await fetch(
    `http://localhost:8888/buckets/yangpyeong-public/${key}?metadata=true`
  );
  const meta = await filerRes.json();
  const fid = meta.FileId; // e.g., "3,01637037d6"

  const [vid, _] = fid.split(",");
  const volumeRes = await fetch(
    `http://localhost:8080/${fid}.jpg?width=${width}&height=${height}&mode=${mode}`
  );

  return new Response(volumeRes.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

방법 2: imgproxy 사이드카 (Garage와 동일 패턴)
- 더 풍부한 변환(blur, gravity, watermark) 필요 시
- SeaweedFS 내장은 width/height만 지원

### 5.8 멀티파트 업로드 (대용량)

```typescript
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";

async function uploadLarge(file: File, key: string) {
  const create = await seaweed.send(
    new CreateMultipartUploadCommand({
      Bucket: "yangpyeong-uploads",
      Key: key,
      ContentType: file.type,
    })
  );
  const uploadId = create.UploadId!;

  const partSize = 16 * 1024 * 1024; // 16MB (SeaweedFS 권장)
  const parts: { PartNumber: number; ETag: string }[] = [];

  for (let i = 0; i * partSize < file.size; i++) {
    const blob = file.slice(i * partSize, (i + 1) * partSize);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const res = await seaweed.send(
      new UploadPartCommand({
        Bucket: "yangpyeong-uploads",
        Key: key,
        UploadId: uploadId,
        PartNumber: i + 1,
        Body: buf,
      })
    );
    parts.push({ PartNumber: i + 1, ETag: res.ETag! });
  }

  await seaweed.send(
    new CompleteMultipartUploadCommand({
      Bucket: "yangpyeong-uploads",
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  );
}
```

---

## 6. 성능

### 6.1 일반 벤치마크

SeaweedFS는 작은 파일 워크로드에서 MinIO를 압도한다고 알려져 있다 (커뮤니티 합의). 사유:
- O(1) disk seek (Haystack 패턴)
- in-memory 인덱스
- append-only volume (write amplification 최소화)

### 6.2 단일 노드 추정 (양평 부엌 환경)

WSL2 + SATA SSD, 단일 인스턴스:
- **GET 작은 파일 (300KB)**: 2000~5000 ops/s ← MinIO/Garage보다 빠름
- **PUT 작은 파일**: 1000~2500 ops/s
- **GET 대용량 (100MB)**: 200~400 MB/s (디스크 한계)
- **이미지 리사이즈 추가 비용**: ~20% latency 증가 (CPU 단)

### 6.3 메모리/CPU

- **idle**: 350~600MB (4 컴포넌트 합)
- **부하**: 1~2GB
- **CPU idle**: ~2%
- **CPU 부하**: 단일 코어 30~70%

### 6.4 디스크 I/O 패턴

- **Append-only**: 랜덤 쓰기 없음, SSD 수명 친화
- **Volume rotation**: Volume이 32GB 차면 새 Volume 자동 생성
- **Compaction**: 삭제된 needle 회수 위해 백그라운드 compaction (옵션)

---

## 7. 생태계

### 7.1 Star/Activity

- **GitHub Stars**: 약 24,000 (Garage 1,800의 13배)
- **Contributors**: 200+
- **Helm Chart**: `bitnami/seaweedfs:4.8.x` 활발 유지
- **Docker Hub**: `chrislusf/seaweedfs` 공식 + `bitnami/seaweedfs` 두 갈래

### 7.2 사용 사례

- **JuiceFS**: SeaweedFS를 백엔드로 사용하는 분산 파일시스템 (대형 사례)
- **AWS Marketplace**: SeaweedFS S3 등재 (엔터프라이즈)
- **각종 K8s 클러스터**: PVC backend로 광범위 사용
- **블로그·튜토리얼**: 한글 자료 일부 존재 (Medium의 한국 개발자들)

### 7.3 SDK / 클라이언트

- **AWS SDK 모든 언어**: S3 호환으로 그대로 사용
- **rclone, s3cmd, mc (MinIO CLI)**: 호환
- **SeaweedFS 자체 CLI**: `weed shell`이 강력 (S3와 별도)

### 7.4 통합 도구

- **Iceberg**: 데이터 레이크 테이블 포맷 지원
- **Hadoop**: HDFS 호환 인터페이스
- **K8s CSI**: PV/PVC
- **Cloud tiering**: AWS S3, GCP, Azure, Backblaze B2로 자동 계층화 ← 양평 부엌 백업에 유용

---

## 8. 문서

- **공식 Wiki**: github.com/seaweedfs/seaweedfs/wiki — 풀 카탈로그
- **DeepWiki**: deepwiki.com/seaweedfs/seaweedfs — AI 생성 보강 문서
- **공식 사이트**: seaweedfs.com — 엔터프라이즈 중심
- **블로그**: 다수 외부 블로그 (Medium, Dev.to, 기업 블로그)

품질 평가:
- **Quickstart**: 우수 (`weed server -s3` 한 줄)
- **API 문서**: 우수 (S3 호환 표 명확)
- **운영 가이드**: 양호 (Volume rotation, compaction, backup 등)
- **장애 대응**: 양호 (Issue 풍부, 빠른 응답)
- **한국어**: 일부 (Medium에 한국 개발자 글 다수)
- **단점**: 문서가 여러 곳에 흩어져 있음 (Wiki/DeepWiki/Blog/seaweedfs.com)

---

## 9. 라이선스

### 9.1 Apache License 2.0

핵심 조항:
- 자유로운 수정·배포·상용 사용
- 특허 grant 포함
- AGPL 같은 copyleft 의무 없음
- 우리 프로젝트가 비공개 SaaS여도 안전

### 9.2 Open Core 모델 위험

Enterprise Edition이 별도 존재 → SeaweedFS Inc.가 향후 Community Edition을 약화할 가능성?
- **현재까지 경향**: Apache 2.0 핵심 기능 유지
- **MinIO 사례 학습**: 커뮤니티가 fork 가능 (Apache 2.0이라 권리 자유)
- **chrislusf 개인 의지**: 10년간 일관된 OSS 약속
- **리스크 평가**: 낮음~중간

### 9.3 비교

| 후보 | 라이선스 | 자유도 |
|------|---------|--------|
| **SeaweedFS** | **Apache 2.0** | **최고** |
| RustFS | Apache 2.0 | 최고 |
| Garage | AGPLv3 | 중간 |
| MinIO | AGPLv3 | 중간 (본가 종료) |

**라이선스 안전성에서 SeaweedFS가 명백한 우위.**

---

## 10. WSL2 / Cloudflare Tunnel 통합

### 10.1 WSL2 데이터 디렉토리

권장: WSL2 내부 ext4 (`~/seaweed/data`)
- Volume 파일은 append-only이므로 ext4가 최적
- 9P 마운트(Windows 측)는 성능 저하 큼 — 부적합

PostgreSQL Filer 사용 시:
- 메타데이터는 PostgreSQL이 관리 → SeaweedFS 데이터 디렉토리 손상이 와도 PG에서 파일 ID 복구 가능 (단, 파일 자체는 손실)

### 10.2 Cloudflare Tunnel 설정

SeaweedFS S3 Gateway는 path-style 호환 우수, 호스트 헤더 의존도 낮음 → MinIO보다 호환 양호.

```yaml
tunnel: <UUID>
credentials-file: /home/user/.cloudflared/<UUID>.json

ingress:
  # S3 API
  - hostname: s3.stylelucky4u.com
    service: http://localhost:8333
    originRequest:
      noTLSVerify: true
      httpHostHeader: s3.stylelucky4u.com

  # 이미지 변환용 Volume server (필요 시)
  - hostname: img.stylelucky4u.com
    service: http://localhost:8080
    originRequest:
      noTLSVerify: true
      httpHostHeader: img.stylelucky4u.com

  - service: http_status:404
```

Cloudflare 대시보드:
- 캐싱: 이미지 도메인은 적극 캐싱 (TTL 1년) — Volume server URL 안정적
- WAF: PUT/DELETE 허용 룰
- 보안 헤더: 기본 유지 (SeaweedFS는 헤더 변형에 덜 민감)

### 10.3 PM2 Ecosystem

```javascript
module.exports = {
  apps: [
    {
      name: "seaweedfs",
      script: "/usr/local/bin/weed",
      args: [
        "server",
        "-dir=/home/user/seaweed/data",
        "-s3",
        "-s3.config=/home/user/seaweed/s3.json",
        "-filer",
        "-filer.config=/home/user/seaweed/filer.toml",
        "-master.dir=/home/user/seaweed/master",
        "-volume.max=0",
      ],
      max_memory_restart: "3G",
      autorestart: true,
    },
    {
      name: "yangpyeong-next",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
    },
  ],
};
```

### 10.4 백업 전략

SeaweedFS 자체에 **cloud tiering** 내장:
- Hot data → 로컬 Volume
- Cold data → 자동으로 외부 S3 (AWS, B2 등)으로 이동
- 양평 부엌 백업 정책: 90일 이상 미접근 파일은 Backblaze B2로 자동 tier-down

설정 예:
```bash
weed shell
> volume.tier.move -dest=remote:b2 -source=ssd -fromDateTimeBefore=2026-01-01
```

---

## 11. 보안

### 11.1 CVE 이력

- **CVE-2024-40120** (High): SQL Injection — 4.x에서 패치됨
- **CVE-2025-45091**: 상세 미공개
- **CVE-2025-43529**: 상세 미공개
- 그 외 medium 수준 1~2건/년

24K stars 큰 프로젝트치고 CVE 빈도 보통. 활발한 패치 흐름.

### 11.2 보안 모델

- **암호화**:
  - SSE-S3 (서버 키)
  - SSE-KMS (외부 KMS)
  - SSE-C (클라이언트 키)
  - AES256-GCM (디스크 레벨)
- **인증**:
  - Signature v4
  - JWT 토큰 (Filer API)
  - mTLS (gRPC)
- **권한**: S3 IAM JSON 정책
- **감사**: HTTP 액세스 로그, gRPC 메트릭

### 11.3 OWASP

- A01 Access Control: IAM 정책 풍부, RBAC 가능
- A02 Crypto Failures: SSE-S3/KMS/C 모두 지원 → 우수
- A05 Misconfiguration: defaultReplication=000은 단일 노드 OK, 멀티노드에선 주의
- A09 Logging: 기본 충실

### 11.4 보안 모범 사례

- s3.json의 secretKey는 환경변수 또는 Vault로
- Filer-PostgreSQL 연결은 SSL (`sslmode=require`)
- Volume server를 외부 노출 시 인증 필수 (기본은 인증 X) ← 주의!
- 이미지 변환 도메인 분리 시 별도 IAM

---

## 12. 프로젝트 적합도 (양평 부엌 컨텍스트)

| 차원 | 적합도 | 근거 |
|------|--------|------|
| Next.js 16 SSR | 적합 | AWS SDK v3 그대로 |
| Prisma 7 | **시너지** | Filer가 PostgreSQL을 메타데이터로 재사용 가능 |
| WSL2 단일 노드 | 적합 | `weed server` 단일 명령 |
| Cloudflare Tunnel | 적합 | path-style 호환, 헤더 영향 적음 |
| 1인 운영 | △ | 3-tier 아키텍처 학습 부담 |
| $0/month | 적합 | Apache 2.0 자체호스팅 |
| 한국어 문서 | △ | 일부 Medium 한국어 글 |
| 거버넌스 안정성 | 적합 | 10년 안정 운영 + Apache 2.0 fork 자유 |

**적합도 종합**: 거의 모든 차원에서 적합. 1인 운영 학습 부담만 약점.

---

## 13. 스코어링 (10개 차원)

### 13.1 FUNC (18%): Supabase Storage 동등 — **4.5/5**

S3 풀 API + Versioning + Object Lock + SSE-S3/KMS/C + Bucket Policy + 이미지 리사이즈 내장. **모든 핵심 Supabase Storage 기능을 단일 시스템으로 거의 커버**.
- 5점이 아닌 이유: 이미지 변환이 Volume server 직접 접근 필요(S3 GET에선 미작동), Bucket Replication 부재
- 4점이 아닌 이유: 모든 후보 중 가장 풍부한 기능

### 13.2 PERF (10%): 처리량/동시성/메모리 — **4.5/5**

작은 파일 워크로드 클래스 최고. O(1) disk seek. idle 350~600MB. 단일 노드 GET 2000~5000 ops/s 추정.
- 5점이 아닌 이유: 멀티 컴포넌트로 오버헤드 약간
- 4점이 아닌 이유: 클래스 최고 처리량

### 13.3 DX (14%): API/타입/문서/SDK — **4.0/5**

AWS SDK v3 그대로. 문서 풀하지만 여러 곳에 흩어짐. `weed shell` CLI 강력. 한국어 자료 일부 존재.
- 5점이 아닌 이유: 문서 분산, Web UI 부재
- 3점이 아닌 이유: SDK·CLI·문서 깊이 우수

### 13.4 ECO (12%): 커뮤니티/사례 — **4.0/5**

24K stars, 200+ contributors, JuiceFS·K8s 생태계, AWS Marketplace 등재. Garage(1.8K)보다 13배 큰 커뮤니티.
- 5점이 아닌 이유: 엔터프라이즈 사용 사례는 Ceph 대비 적음
- 3점이 아닌 이유: OSS 자체호스팅 클래스 최고

### 13.5 LIC (8%): 라이선스 — **5.0/5**

Apache 2.0 — SaaS 안전, fork 자유, 특허 grant.
- 5점 확정: 라이선스 차원 최고

### 13.6 MAINT (10%): 업그레이드/Breaking Change — **4.0/5**

월간 릴리즈, 활성 패치. v3→v4 같은 메이저 변경 사례 적음. Open core 모델이 잠재 위험.
- 5점이 아닌 이유: Enterprise Edition이 향후 Community 약화 가능성 (낮음)
- 3점이 아닌 이유: 10년 일관된 OSS 약속

### 13.7 INTEG (10%): Next.js 16 + Prisma 7 + WSL2 + Cloudflare Tunnel — **4.0/5**

AWS SDK 그대로. WSL2 정상. Cloudflare Tunnel path-style 호환 양호. **Filer-PostgreSQL 통합으로 Prisma 7과 메타데이터 공유 가능**.
- 5점이 아닌 이유: 이미지 변환을 위해 Volume server 별도 노출 필요
- 3점이 아닌 이유: 통합 포인트가 매끄러움

### 13.8 SECURITY (10%): OWASP/CVE — **4.0/5**

SSE 풀 지원, IAM 풍부. CVE 빈도 보통. 활발한 패치.
- 5점이 아닌 이유: 24K stars 큰 표면적
- 3점이 아닌 이유: 보안 모델 풍부, 패치 활발

### 13.9 SELF_HOST (5%): 단일 서버 — **4.0/5**

`weed server` 한 줄로 단일 노드 가동. RAM 350~600MB로 적당. 3-tier 학습 부담 약간.
- 5점이 아닌 이유: Garage(100~300MB)보다 무겁고 학습 부담
- 3점이 아닌 이유: 운영 자체는 단순

### 13.10 COST (3%): $0/month — **5.0/5**

Apache 2.0 자체호스팅, 라이선스 비용 0. 외부 트래픽 Cloudflare 무료.
- 5점 확정

### 13.11 가중평균

| 차원 | 점수 | 가중 | 가중점수 |
|------|------|------|----------|
| FUNC | 4.5 | 18% | 0.810 |
| PERF | 4.5 | 10% | 0.450 |
| DX | 4.0 | 14% | 0.560 |
| ECO | 4.0 | 12% | 0.480 |
| LIC | 5.0 | 8% | 0.400 |
| MAINT | 4.0 | 10% | 0.400 |
| INTEG | 4.0 | 10% | 0.400 |
| SECURITY | 4.0 | 10% | 0.400 |
| SELF_HOST | 4.0 | 5% | 0.200 |
| COST | 5.0 | 3% | 0.150 |
| **합계** | | 100% | **4.250 / 5** |

**최종 점수: 4.25/5**

(가중점수 합 4.25, 클래스 최고 등급)

---

## 14. 리스크

### 14.1 3-Tier 학습 부담 (중간)

Master/Volume/Filer/S3 4개 컴포넌트를 이해해야 함. 단, `weed server`로 단일 프로세스 통합 시 운영 단순. 대응:
- 본 문서를 운영 매뉴얼로 활용
- `weed shell`로 진단 자동화 스크립트

### 14.2 Open Core 위험 (낮음~중간)

SeaweedFS Inc.가 향후 Community Edition을 약화 가능성. 대응:
- Apache 2.0이라 fork 자유 보장
- 핵심 기여자가 chrislusf 개인 → 라이선스 협상 단순
- 발생 시 RustFS 또는 fork로 마이그레이션

### 14.3 메타데이터 백엔드 선택 부담 (낮음)

SQLite/Postgres/Redis 등 옵션 다양. 잘못 선택 시 성능/안정성 영향. 대응:
- 양평 부엌은 PostgreSQL 권장 (이미 운영 중)
- 명확한 의사결정 1회

### 14.4 Volume server 외부 노출 시 보안 (중간)

이미지 변환을 위해 Volume server를 외부 노출 시 인증 약함. 대응:
- Next.js Route Handler에서 프록시 패턴 (인증 추가)
- 또는 Cloudflare Access로 Volume server 보호

### 14.5 RAM 사용량 (낮음)

Garage(100~500MB)보다 1.5~3배 무겁지만 16GB 환경에서 무관. 대응:
- 모니터링 임계값 설정 (PM2 max_memory_restart 3G)

### 14.6 WSL2 Volume 손상 (낮음)

Append-only volume이지만 비정상 종료 시 부분 손상 가능. 대응:
- Volume 파일은 단순 구조 → `weed volume.fix` 도구로 복구
- PostgreSQL Filer 백업 필수 (메타데이터 보호)

---

## 15. 결론

### 15.1 종합 평가

SeaweedFS는 **양평 부엌 서버 환경에서 가장 풍부한 기능과 라이선스 안전성을 동시에 제공**한다. Garage 대비 ① 이미지 리사이즈 내장, ② Versioning/Object Lock, ③ SSE-S3/KMS, ④ Apache 2.0 라이선스 우위. 단점은 ① 3-tier 학습 부담, ② RAM 1.5~3배 무거움.

10년 안정 운영, 24K GitHub stars, JuiceFS 같은 대형 사용 사례 → **거버넌스·생태계 신뢰 클래스 최고**. MinIO 본가 대체재로 가장 자연스러운 1순위.

### 15.2 100점 도달 청사진

SeaweedFS 채택 시 Storage 점수 변화:
- 현재: 40/100
- SeaweedFS 단독 도입: **80/100** 추정
  - +20: S3 풀 API
  - +10: Versioning + Object Lock
  - +5: SSE-S3/KMS
  - +5: 이미지 리사이즈 내장 (부분)
- + Filer-PostgreSQL 통합: **85/100**
  - +5: 메타데이터 단일 진실 소스 (Prisma와 시너지)
- + 외부 cloud tiering (B2): **90/100**
  - +5: 자동 백업 + 콜드 데이터 분리
- + Next.js 프록시 패턴 (이미지 변환 풀 노출): **95/100**
  - +5: Supabase imgproxy 동등
- 빠진 5점: Bucket Replication, Event Notifications

### 15.3 DQ-1.3 잠정 답변

**SeaweedFS 1순위, Garage 2순위 권고**.

근거 비교:

| 차원 | SeaweedFS | Garage | 승자 |
|------|-----------|--------|------|
| FUNC | 4.5 | 3.5 | **SeaweedFS** |
| PERF | 4.5 | 4.0 | SeaweedFS |
| DX | 4.0 | 3.5 | SeaweedFS |
| ECO | 4.0 | 3.0 | SeaweedFS |
| LIC | 5.0 | 3.0 | **SeaweedFS** |
| MAINT | 4.0 | 3.5 | SeaweedFS |
| INTEG | 4.0 | 4.5 | Garage |
| SECURITY | 4.0 | 4.0 | Tie |
| SELF_HOST | 4.0 | 5.0 | Garage |
| COST | 5.0 | 5.0 | Tie |

가중평균: SeaweedFS 4.25 vs Garage 3.72 — **SeaweedFS 명확한 우위**.

단, 다음 시나리오에선 Garage 우선:
- 양평 부엌이 이미지 변환을 사용하지 않는다면
- Versioning을 application-level에서 별도 관리 가능하다면
- 단일 코어 RAM 절약이 결정적이라면

기본 권고: **SeaweedFS 채택**.

### 15.4 실행 권고

1. **즉시 (1일)**: docker-compose로 SeaweedFS v4.20 시범 구동, `weed mini` 5분 학습
2. **1주 내**: Filer-PostgreSQL 연결 + Cloudflare Tunnel 통합 PoC
3. **2주 내**: Versioning 활성, 기존 Folder/File Prisma 트리에 S3 key 컬럼 추가, 마이그레이션 스크립트
4. **3주 내**: 이미지 변환 Next.js Route Handler 구현 (Volume server 프록시)
5. **1개월 내**: Cloud tiering(B2) 자동 백업 활성

---

## 16. 참고 자료

1. [SeaweedFS GitHub 공식](https://github.com/seaweedfs/seaweedfs) — 코어 리포지토리, 24K stars
2. [SeaweedFS Wiki](https://github.com/seaweedfs/seaweedfs/wiki) — 공식 문서
3. [Amazon S3 API 호환 표 (Wiki)](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API) — 지원/미지원 명시
4. [Volume Server API (Wiki)](https://github.com/seaweedfs/seaweedfs/wiki/Volume-Server-API) — 이미지 리사이즈 포함
5. [SeaweedFS 공식 사이트 (엔터프라이즈)](https://seaweedfs.com/) — Open Core 정보
6. [DeepWiki: S3 API Gateway](https://deepwiki.com/seaweedfs/seaweedfs/3.2-s3-api-gateway) — AI 보강 문서
7. [DeepWiki: Architecture Overview](https://deepwiki.com/seaweedfs/seaweedfs/1.1-architecture-overview) — 3-tier 설명
8. [DeepWiki: Read Operations](https://deepwiki.com/seaweedfs/seaweedfs/5.2-read-operations) — 이미지 변환 포함
9. [Image Resize Source (resizing.go)](https://github.com/seaweedfs/seaweedfs/blob/master/weed/images/resizing.go) — Lanczos 필터 구현
10. [WebP Resize Issue #478](https://github.com/seaweedfs/seaweedfs/issues/478) — 이미지 포맷 한계
11. [SeaweedFS Docker Compose 공식](https://github.com/seaweedfs/seaweedfs/blob/master/docker/seaweedfs-compose.yml) — 표준 배포
12. [bitnami/seaweedfs Helm Chart](https://artifacthub.io/packages/helm/bitnami/seaweedfs/4.8.3) — K8s 배포
13. [oneuptime: SeaweedFS K8s 배포](https://oneuptime.com/blog/post/2026-02-09-seaweedfs-distributed-storage/view) — 2026 가이드
14. [oneuptime: SeaweedFS Ubuntu 설정](https://oneuptime.com/blog/post/2026-03-02-how-to-configure-seaweedfs-on-ubuntu/view) — 단일 노드
15. [JuiceFS + SeaweedFS 통합 사례](https://juicefs.com/en/blog/usage-tips/seaweedfs-tikv) — 대형 사용 사례
16. [bitExpert: SeaweedFS for S3 워크로드](https://blog.bitexpert.de/blog/seaweedfs_s3) — 통합 가이드
17. [Medium: SeaweedFS Containerized Cluster](https://medium.com/@ahsifer/seaweedfs-containerized-cluster-deployment-with-fuse-mount-client-1a19b5a3b713) — 운영 사례
18. [Medium: SeaweedFS Distributed Storage Features](https://medium.com/@ahsifer/seaweedfs-distributed-storage-part-3-features-b720b00479ca) — 기능 심층
19. [Dev.to: SeaweedFS + PostgreSQL 15분 가이드](https://dev.to/benjeddou_monem_68600c6c8/supercharge-your-file-storage-seaweedfs-postgresql-in-15-minutes-407f) — Filer-PG 통합
20. [Self-Hosted S3 Storage in 2026 (Rilavek)](https://rilavek.com/resources/self-hosted-s3-compatible-object-storage-2026) — 후보 비교
21. [MinIO Alternatives 2026 (Akmatori)](https://akmatori.com/blog/minio-alternatives-2026-comparison) — 종합 비교
22. [RustFS vs SeaweedFS vs Garage (Elest.io)](https://blog.elest.io/rustfs-vs-seaweedfs-vs-garage-which-minio-alternative-should-you-pick/) — 결정 트리
23. [CVE-2024-40120 SeaweedFS SQL Injection (Vulert)](https://vulert.com/vuln-db/go-github-com-seaweedfs-seaweedfs-191628) — 보안 이력
24. [Hackanons: MinIO vs SeaweedFS vs Garage 2026](https://hackanons.com/minio-vs-seaweedfs-vs-garage-vs-hs5-vs-rustfs-2026/) — 5종 비교
25. [imgproxy 공식 (보조 사이드카 옵션)](https://docs.imgproxy.net/) — 풀 이미지 변환 백업
