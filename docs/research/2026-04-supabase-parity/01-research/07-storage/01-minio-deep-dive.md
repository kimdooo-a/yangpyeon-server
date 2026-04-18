# MinIO Deep Dive — Storage Wave 1 / 사전 스파이크 DQ-1.3

> 작성: kdywave Wave 1 deep-dive 에이전트
> 작성일: 2026-04-18
> 컨텍스트: 양평 부엌 서버 대시보드 (stylelucky4u.com) — Supabase 동등 Storage 도달
> 환경: WSL2 Ubuntu + PM2 + Cloudflare Tunnel + 단일 서버 + $0/month
> 현재 Storage 점수: 40/100 (로컬 파일시스템 + Folder/File Prisma 트리)

---

## 1. 요약 (Executive Summary)

MinIO는 한때 자체호스팅 S3 호환 객체 스토리지의 사실상 표준이었으나, **2026년 2월 12일 GitHub 리포지토리가 공식 아카이빙**되면서 사실상 Community Edition이 종료되었다. 2025년 5월 어드민 콘솔이 제거되었고, 10월에 공식 Docker 이미지/바이너리 배포가 중단되었으며, 12월 maintenance mode 선언 후 2개월 만에 read-only 상태가 되었다. 본 문서는 "MinIO를 채택해도 되는가"를 묻는 DQ-1.3의 잠정 답변을 마련하기 위해 (a) 본가 MinIO의 마지막 안정 버전(RELEASE.2025-04-08T15-41-24Z) 기준 기술 스택과 (b) 커뮤니티 포크인 `pgsty/minio` (Pigsty 진영) 및 `OpenMaxIO`의 실제 가용성을 양 갈래로 평가한다.

핵심 결론을 먼저 말하면, **양평 부엌 서버 환경(WSL2 1인 단독 운영, Cloudflare Tunnel, $0/month)에서 본가 MinIO는 채택 비추천**이다. 사유는 ① 업스트림 단절로 보안 패치 공급망이 비공식 포크에 종속됨, ② AGPLv3 — 비공개 SaaS 코드 노출 리스크, ③ Cloudflare Tunnel 경유 시 SignatureDoesNotMatch 다발(Cloudflare가 헤더를 변형), ④ Single-Node Single-Drive(SNSD) 모드에서 Versioning/Replication 등 핵심 기능 부재, ⑤ 8GB+ RAM 권장으로 단일 노드 부담 큼. 다만 만약 (i) 포크 운영 리스크를 감수하고 (ii) Cloudflare Tunnel을 우회(Cloudflare 프록시 OFF, DNS Only 또는 직접 도메인 라우팅)하며 (iii) 본 프로젝트가 클로즈드 소스가 아니라 GPL 호환 라이선스라면 후보에 남을 수 있다.

본 문서는 MinIO의 5년치 아키텍처 결정과 2026년 현재의 거버넌스 위기를 모두 다룬다. 점수는 **3.09/5** (본가) / **3.30/5** (`pgsty/minio` 포크)로 최종 산출하며 (10개 차원 가중평균), 동등 후보인 Garage(3.72)·SeaweedFS(4.25)와 비교 시 본가 MinIO는 명백한 후순위다. 단, 만약 어떤 조건으로든 MinIO 계열이 강제된다면 `pgsty/minio` 포크가 합리적 선택이다.

---

## 2. 거버넌스 타임라인 (2014 → 2026)

MinIO의 5년 점진적 폐쇄 과정을 이해하지 못하면 2026년의 의사결정이 불가능하다. 시간순으로 정리한다.

| 시점 | 이벤트 | 영향 |
|------|--------|------|
| 2014 | MinIO Inc. 창립 (Anand Babu Periasamy, Harshavardhana) | 초기 Apache 2.0 |
| 2017 | MinIO 첫 안정 릴리즈, S3 호환 자체호스팅 표준으로 부상 | 커뮤니티 폭발 성장 |
| 2021-04 | **Apache 2.0 → AGPLv3 라이선스 변경** | 상용 SaaS 사용 시 소스 공개 의무 발동 |
| 2023-03 | Weka가 MinIO 사용 중단 통지 받음 (라이선스 분쟁 표면화) | "AGPL = 트랩" 인식 확산 |
| 2024 | MinIO Inc., Bessemer Venture Partners 등에서 $126M 펀딩, 1B 가치 평가 | 상업화 압력 본격화 |
| 2025-05 | **Web Console UI에서 어드민 기능 제거** (사용자/정책/버킷 정책 관리 등) | 1인 운영자 GUI 의존 깨짐 |
| 2025-10 | **공식 Docker Hub 이미지/바이너리 배포 중단** | 자체 빌드만 가능 |
| 2025-12 | "Maintenance Mode" 선언 (Issue #21714) | 신규 기능 동결 |
| 2026-02-12 | **GitHub `minio/minio` 리포지토리 공식 아카이빙 (read-only)** | Community Edition 종료 |
| 2026-02-13~ | Pigsty 창립자 Ruohang Feng가 `pgsty/minio` 포크 출시, 어드민 콘솔 복원 | 커뮤니티 자구책 |
| 2026-03 | OpenMaxIO 별도 포크도 활동 시작 | 포크 분열 |

**해석**: MinIO Inc.는 5년에 걸쳐 의도적으로 OSS 채널을 좁혔고, 결국 상용 라이선스(AIStor, 최소 연 $96,000)만 남겼다. 이는 비즈니스 결정이지만, **자체호스팅 OSS 사용자에게는 신뢰 붕괴**다. 2026년 4월 현재 MinIO 본가는 "사실상 죽은 프로젝트"이며, 신규 도입 시 반드시 포크 의존을 전제해야 한다.

---

## 3. 아키텍처

### 3.1 코어 아키텍처

MinIO는 단일 Go 바이너리(약 100MB, statically linked)로 배포된다. 내부 구성:

- **Object Layer**: HTTP S3 API → Erasure Code 처리 → Disk I/O
- **Erasure Code (EC)**: Reed-Solomon, EC:N+M 구성 (예: EC:4+4는 8 디스크 중 4개 손실 허용)
- **Bitrot Protection**: HighwayHash 256으로 청크 단위 무결성 검증
- **IAM**: 내장 사용자/그룹/정책 (S3 IAM JSON 호환), LDAP/OIDC 외부 ID 공급자 연동
- **Notifications**: Webhook, Kafka, NATS, RabbitMQ, MQTT, AMQP, MySQL, Postgres, Elasticsearch, Redis 등으로 객체 이벤트 푸시

### 3.2 배포 토폴로지 4종

| 모드 | 노드 | 디스크 | 가용성 | 용도 |
|------|------|--------|--------|------|
| **SNSD** (Single-Node Single-Drive) | 1 | 1 | 없음 (zero-parity EC) | 개발·로컬 평가 |
| **SNMD** (Single-Node Multi-Drive) | 1 | N | 디스크 N//2 손실 허용 | 단일 서버 프로덕션 |
| **MNMD** (Multi-Node Multi-Drive) | 2~32 | N | 자동 EC 분산 | 분산 프로덕션 |
| **DR** (Distributed with Site Replication) | 다중 사이트 | 다중 | 사이트 단위 페일오버 | 엔터프라이즈 |

**양평 부엌 서버 적용 시**: 단일 WSL2 인스턴스이므로 SNSD 또는 SNMD가 강제된다. 그러나 **SNSD는 Versioning, Object Locking, Site Replication 미지원**이며 "프로덕션 부적합"으로 공식 명시되어 있다. SNMD는 디스크가 여러 개여야 하지만 WSL2 환경에서 현실적이지 않다(USB HDD 4개를 WSL2에 마운트하는 것은 비현실적).

### 3.3 메모리 모델

MinIO는 다음을 메모리에 보관한다:
- 메타데이터 캐시 (LRU)
- IAM 정책/사용자 (메모리 상주)
- 멀티파트 업로드 진행 상태

공식 권장은 **노드당 최소 8GB RAM, 권장 32GB**. 양평 부엌 서버의 가용 RAM 예산이 16GB라고 가정하면 PM2 Node.js 16GB - PostgreSQL 4GB - Next.js 4GB 후 남는 RAM은 4~6GB로 권장치 미달이다.

---

## 4. 핵심 기능 (Feature Matrix)

| 기능 | 지원 | 비고 |
|------|------|------|
| S3 PUT/GET/DELETE/HEAD | O | AWS SDK v3 그대로 사용 |
| Multipart Upload | O | 5MB~5GB 파트, 최대 10000 파트 |
| Presigned URL (GET/PUT) | O | Signature v4 |
| Versioning | △ | SNSD 미지원, SNMD 이상 지원 |
| Object Locking (WORM) | △ | SNMD 이상 |
| Lifecycle Policy | O | Expiration, Transition |
| Server-Side Encryption | O | SSE-C, SSE-S3, SSE-KMS |
| Bucket Policy (S3 IAM JSON) | O | |
| Site Replication | △ | MNMD 전용 |
| Event Notifications | O | 12종 백엔드 |
| Bucket Notifications (S3 호환) | O | |
| Quota Management | O | Hard/Soft quota |
| Image Transformation | X | **내장 미지원** — 별도 imgproxy/sharp 필요 |
| Public/Private Bucket | O | Anonymous 정책 가능 |
| CORS | O | |
| 웹 어드민 콘솔 | △ | 본가 2025-05 이후 제거, `pgsty/minio` 포크에서 복원 |

**Supabase Storage와의 핵심 갭**: 이미지 트랜스포메이션(리사이즈/포맷 변환)이 MinIO 자체에 없다. Supabase는 imgproxy를 내장해서 `?width=200&height=200&quality=80` 등의 쿼리 파라미터로 즉석 변환을 제공하는데, MinIO 단독으로는 이를 못한다. 우리 프로젝트가 갤러리/이미지 업로드를 한다면 별도 imgproxy 컨테이너 또는 sharp 기반 Next.js Route Handler 구현이 필수다.

---

## 5. API & 코드 예시

### 5.1 Next.js 16 App Router에서 MinIO 연결 (AWS SDK v3)

```typescript
// app/lib/minio-client.ts
import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: "us-east-1", // MinIO는 region을 검증하지 않음, 임의값 가능
  endpoint: process.env.MINIO_ENDPOINT, // http://localhost:9000
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true, // MinIO는 vhost-style보다 path-style 권장
});
```

### 5.2 Presigned PUT URL 발급 (서버 액션)

```typescript
// app/api/upload/presign/route.ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { s3 } from "@/app/lib/minio-client";
import { z } from "zod";

const Schema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^[a-z]+\/[a-z0-9.\-+]+$/i),
  contentLength: z.number().int().positive().max(10 * 1024 * 1024), // 10MB
});

export async function POST(req: NextRequest) {
  const body = Schema.parse(await req.json());
  const key = `uploads/${crypto.randomUUID()}-${body.filename}`;

  const cmd = new PutObjectCommand({
    Bucket: "yangpyeong-uploads",
    Key: key,
    ContentType: body.contentType,
    ContentLength: body.contentLength,
  });

  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 }); // 60초
  return NextResponse.json({ url, key });
}
```

### 5.3 멀티파트 업로드 (파일 100MB 이상)

```typescript
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";

async function multipartUpload(file: File, key: string) {
  const create = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: "yangpyeong-uploads",
      Key: key,
      ContentType: file.type,
    })
  );
  const uploadId = create.UploadId!;
  const partSize = 8 * 1024 * 1024; // 8MB
  const parts: { PartNumber: number; ETag: string }[] = [];

  for (let i = 0; i * partSize < file.size; i++) {
    const blob = file.slice(i * partSize, (i + 1) * partSize);
    const buf = await blob.arrayBuffer();
    const res = await s3.send(
      new UploadPartCommand({
        Bucket: "yangpyeong-uploads",
        Key: key,
        UploadId: uploadId,
        PartNumber: i + 1,
        Body: new Uint8Array(buf),
      })
    );
    parts.push({ PartNumber: i + 1, ETag: res.ETag! });
  }

  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: "yangpyeong-uploads",
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  );
}
```

### 5.4 IAM 정책 적용 (mc CLI)

```bash
# 양평 부엌 정적 리소스용 read-only 정책
cat > /tmp/yangpyeong-public.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": ["arn:aws:s3:::yangpyeong-public/*"]
  }]
}
EOF

mc admin policy create local yangpyeong-public-read /tmp/yangpyeong-public.json
mc admin user add local appuser $(openssl rand -hex 16)
mc admin policy attach local yangpyeong-public-read --user appuser
```

### 5.5 Cloudflare Tunnel 경유 시 필수 보정

문제: Cloudflare가 다음 헤더를 변형하여 SignatureDoesNotMatch 발생:
- `Host` 헤더 재작성
- `Add Security Headers` 매니지드 트랜스포머
- 캐싱 페이로드

해결책 (`config.yml` `~/.cloudflared/config.yml`):

```yaml
tunnel: <UUID>
credentials-file: /home/user/.cloudflared/<UUID>.json

ingress:
  - hostname: s3.stylelucky4u.com
    service: http://localhost:9000
    originRequest:
      noTLSVerify: true
      disableChunkedEncoding: false
      httpHostHeader: s3.stylelucky4u.com  # ← 핵심: 원본 Host 보존
      connectTimeout: 30s
  - service: http_status:404
```

추가로 Cloudflare 대시보드에서:
- 해당 서브도메인 **DNS Only (proxy OFF)** 권장 — 그러나 이러면 Tunnel 의미가 줄어듦
- 또는 Page Rule: `s3.stylelucky4u.com/*` → Cache Level: Bypass + Disable Security
- Managed Transformers: "Add security headers" OFF

**그래도 실패 시**: presigned URL 생성 시 Endpoint를 외부 도메인이 아닌 내부로 한 다음 응답 URL의 host만 외부로 치환하는 우회. 이는 hack에 가깝고 권장되지 않음.

---

## 6. 성능

### 6.1 공식 벤치마크 (WARP, 단일 노드)

| 워크로드 | 처리량 | 비고 |
|----------|--------|------|
| GET 10KiB, 128 concurrent | 107.7 MiB/s, 10,841 obj/s | 작은 파일 |
| PUT 256KiB, 128 concurrent | 4,875 ops/s | 중간 파일 |
| GET 32MiB, 512 concurrent | 2.51 GiB/s | 대용량 |
| PUT 32MiB, 1024 concurrent | 2.79 GiB/s | 대용량 쓰기 |

### 6.2 양평 부엌 서버 환경 추정

WSL2 단일 노드 + SATA SSD 가정:
- **GET 일반 이미지(평균 300KB)**: 800~1500 ops/s 예상
- **PUT**: 400~800 ops/s
- **동시 접속자 100명, 페이지당 10이미지**: 1000 GET 동시 → 충분
- **이미지 변환 부재**: 사용자가 4MB 사진을 업로드하면 그대로 4MB가 모바일에 전송됨 (Supabase 대비 큰 약점)

### 6.3 메모리·CPU 부하

- **idle**: 80~150 MB
- **부하 시**: 500MB~2GB (캐시·버퍼)
- **권장 RAM**: 8GB+ (노드 단독 기준)
- **CPU**: Erasure Code가 CPU 집약적 — SNSD 모드에서는 EC가 zero-parity라 부담 적음

---

## 7. 생태계 (Ecosystem)

### 7.1 GitHub 통계 (아카이빙 직전, 2026-02)

- **Stars**: 약 50,000 ⭐
- **Forks**: 약 5,500
- **Contributors**: 800+
- **Issues**: 9,000+ (해결됨), 600+ (open, 영구 동결)
- **Releases**: 700+ (마지막 RELEASE.2025-04-08T15-41-24Z)

### 7.2 SDK 생태계

| 언어 | SDK | 활성도 |
|------|-----|--------|
| JavaScript | `minio-js` | 활성 (커뮤니티) |
| Go | `minio-go` | 활성 |
| Python | `minio-py` | 활성 |
| Java | `minio-java` | 활성 |
| .NET | `minio-dotnet` | 활성 |
| AWS SDK 모든 언어 | S3 호환 사용 | 별도 SDK 불필요 |

특히 AWS SDK가 그대로 동작하므로 우리 프로젝트는 `@aws-sdk/client-s3`만 쓰면 된다.

### 7.3 Pigsty/MinIO 포크 생태계

`pgsty/minio` (2026-02 출시):
- 어드민 콘솔 복원
- Docker Hub: `pgsty/minio:latest`
- APT/YUM 저장소 제공
- 문서: silo.pigsty.io
- 정책: 신규 기능 추가 X, 보안 패치만 (코어 안정성 우선)

`OpenMaxIO`:
- 별도 포크, 더 적극적 신기능 추가 시도
- 활성도 낮음 (2026-04 기준)

`RustFS`:
- MinIO 대체재로 Rust 재작성, Apache 2.0
- 현재 1.0.0-alpha.89, 프로덕션 부적합 (alpha)
- 4KB 객체 기준 MinIO 대비 2.3배 빠름 (자체 벤치)
- NVIDIA Inception 합류 (2026-04-09)

### 7.4 Next.js / Prisma 7 통합 사례

자체호스팅 사례 다수 존재:
- alexefimenko.com 블로그 "Next.js + PostgreSQL + Minio S3" 풀스택 튜토리얼
- Cloudron 등 self-hosting 패키지에서 MinIO 통합 (단, 2025 어드민 제거 후 항의 폭발)

---

## 8. 문서

본가 문서는 docs.min.io에 호스팅되었으나 2025-10 이후 `aistor.min.io` 등 상용 제품 문서로 리다이렉트 비중이 커졌다. Pigsty 진영이 silo.pigsty.io에 미러링했다.

품질 평가:
- **튜토리얼**: 우수 (배포 모드별 분리)
- **API 레퍼런스**: 우수 (S3 호환 매핑 표 명시)
- **운영 가이드**: 우수 (mc CLI 풀 카탈로그)
- **장애 대응**: 양호 (FAQ 풍부)
- **한국어 문서**: 부재 — 비공식 블로그만

---

## 9. 라이선스

### 9.1 AGPLv3 핵심 조항

> "If you distribute, host or create derivative works of the MinIO software over the network, you must distribute the complete corresponding source code of the combined work under the same GNU AGPL v3 license."

해석:
- **단순 사용**: 자체 인프라에서 자체 데이터를 저장하는 용도면 AGPL이 발동되지 않는다고 일반적으로 해석
- **네트워크 서비스 제공**: 사용자에게 MinIO 자체를 노출하면 AGPL 발동 → 우리 SaaS 코드 공개 의무
- **수정 후 재배포**: AGPL 의무 발동
- **Combined Work**: MinIO와 사용자 코드가 "결합 저작물"이면 사용자 코드도 AGPL 적용 → **법적 회색지대**

### 9.2 양평 부엌 서버에 미치는 영향

우리 프로젝트는:
- 자체 데이터(고객 주문, 서비스 콘텐츠) 저장 → 일반적으로 AGPL 발동 X
- 그러나 만약 외부 사용자가 우리 사이트를 통해 MinIO에 직접 업로드한다면? → MinIO Inc.가 광범위하게 AGPL 발동을 주장 가능
- Weka 사례(2023)처럼 MinIO Inc.가 라이선스 조사를 적극화하면 위험

### 9.3 Pigsty 포크의 라이선스

`pgsty/minio`도 AGPLv3 유지 (포크는 라이선스 변경 불가). 따라서 라이선스 리스크는 본가와 동일.

### 9.4 비교: RustFS / Garage / SeaweedFS

- **RustFS**: Apache 2.0 ← 가장 안전
- **Garage**: AGPLv3 ← MinIO와 동일 위험
- **SeaweedFS**: Apache 2.0 ← 안전

---

## 10. WSL2 / Cloudflare Tunnel 통합

### 10.1 WSL2 데이터 디렉토리

옵션 1: WSL2 내부 ext4 (`/var/lib/minio`)
- 장점: 빠름 (네이티브 파일시스템)
- 단점: Windows 측에서 백업 어려움, WSL2 디스크 동적 확장 한계

옵션 2: Windows 마운트 (`/mnt/d/minio-data`)
- 장점: Windows에서 직접 접근, 백업 쉬움
- 단점: 9P 파일시스템으로 I/O 성능 ~10배 느림 (벤치마크: 200 MB/s → 20 MB/s)
- **MinIO에 부적합** — 권장하지 않음

옵션 3: WSL2 마운트 + rsync 백업
- WSL2 내부에 MinIO 데이터, 매일 새벽 rsync로 Windows D: 또는 Backblaze B2로 백업

권장: 옵션 1 + Backblaze B2 야간 동기화

### 10.2 Cloudflare Tunnel 시나리오

세 가지 운영 모드 중 선택해야 한다:

| 모드 | 외부 접근 | Presigned URL | 보안 | 권장도 |
|------|----------|---------------|------|--------|
| A. Tunnel + 프록시 ON | O | X (signature mismatch) | 우수 | X |
| B. Tunnel + 프록시 OFF (DNS Only) | O | △ (host header 보정 필요) | 양호 | △ |
| C. Tunnel 없음, 내부 전용 + Next.js 프록시 | X (직접) / O (간접) | O | 우수 | O |

**권장**: 모드 C — MinIO를 외부 노출하지 않고, Next.js Route Handler에서 다음 패턴 사용:

```typescript
// app/api/files/[key]/route.ts
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/app/lib/minio-client";

export async function GET(
  _: Request,
  { params }: { params: { key: string } }
) {
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: "yangpyeong-uploads",
      Key: params.key,
    })
  );
  return new Response(obj.Body as ReadableStream, {
    headers: {
      "Content-Type": obj.ContentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
```

이 방식은 presigned URL을 포기하는 대신 Cloudflare 호환성을 100% 보장한다. 단, Next.js가 모든 파일 트래픽의 프록시가 되어 부하 부담.

---

## 11. 보안

### 11.1 CVE 이력 (최근 3년)

| CVE | 심각도 | 영향 | 패치 |
|-----|--------|------|------|
| CVE-2023-28432 | High | Cluster setup leak | 2023-03 패치 |
| CVE-2024-24747 | High | Subdomain takeover | 2024-02 패치 |
| CVE-2024-37151 | Medium | Authenticated OOM | 2024-06 패치 |
| (2026~) | ? | 본가 패치 중단 | `pgsty/minio` 포크가 CVE 대응 약속 |

**리스크**: 본가 아카이빙 후 새로운 CVE 발견 시 본가는 패치 X. `pgsty/minio` 포크가 백포트하지만 보장 없음.

### 11.2 보안 모범 사례

- TLS는 Cloudflare Tunnel에 위임 (MinIO 자체 cert 불필요)
- IAM 키는 Vault/sops로 관리, .env에 직접 저장 금지
- 모든 버킷 default Private, Public 노출은 명시적 정책으로
- Audit Log → PostgreSQL 또는 Loki로 푸시
- mc admin user 권한 최소화 (per-bucket per-action)

### 11.3 OWASP Top 10 매핑

- A01 Broken Access Control: IAM 정책 적절히 설계 시 차단
- A02 Cryptographic Failures: SSE-S3/SSE-KMS 권장
- A05 Security Misconfiguration: SNSD에서 Versioning 미지원이 데이터 손실 노출 ← 주의
- A09 Logging Failures: Audit Log 활성화 필수

---

## 12. 프로젝트 적합도 (양평 부엌 컨텍스트)

| 차원 | 적합도 | 근거 |
|------|--------|------|
| Next.js 16 SSR | 적합 | AWS SDK v3 그대로 |
| Prisma 7 | 무관 | DB와 분리 |
| WSL2 단일 노드 | **부적합** | SNSD 한계, Versioning X |
| Cloudflare Tunnel | **부적합** | Signature mismatch 다발 |
| 1인 운영 | **부적합** | 어드민 UI 본가 부재, 포크 의존 |
| $0/month | 적합 | 자체호스팅 |
| 한국어 문서 | 부적합 | 영문만 |
| 거버넌스 안정성 | **매우 부적합** | 본가 종료 |

**적합도 종합**: 부적합 항목이 많아 본가 MinIO는 비추천. `pgsty/minio` 포크 채택 시 일부 개선되지만 거버넌스 리스크는 잔존.

---

## 13. 스코어링 (10개 차원)

각 차원 점수와 앵커링 근거를 기술. "왜 N점인가, 왜 N+1점이 아니고 N-1점도 아닌가" 명시.

### 13.1 FUNC (18%): Supabase Storage 동등 기능 — **3.5/5**

S3 호환 풀 스택을 제공하지만 **이미지 트랜스포메이션 미내장**, SNSD에서 Versioning/Object Lock 부재. Supabase가 imgproxy를 내장으로 제공하는 점을 따라잡지 못함.
- 4점이 아닌 이유: 이미지 변환 갭이 결정적 (Supabase Storage 핵심 차별점)
- 3점이 아닌 이유: S3 API 자체는 광범위 (Multipart/Lifecycle/SSE/IAM/CORS 모두 지원)

### 13.2 PERF (10%): 처리량/동시성/메모리 — **4.0/5**

WARP 벤치 기준 단일 노드 GET 2.51 GiB/s, PUT 2.79 GiB/s. 작은 파일 10KiB도 10,841 ops/s. 메모리 8GB 권장은 단점.
- 5점이 아닌 이유: SNSD 모드에서는 EC zero-parity로 일부 최적화 손실, 8GB+ RAM 부담
- 3점이 아닌 이유: 절대 처리량은 클래스 최상위

### 13.3 DX (14%): API/타입/문서/SDK — **4.0/5**

AWS SDK v3 그대로 사용 가능, TypeScript 친화. 문서 품질 우수. mc CLI 강력. 단, 2025-05 어드민 제거로 GUI 학습곡선 악화, 포크 의존으로 문서 분산.
- 5점이 아닌 이유: 어드민 UI 분열, 본가 문서 신뢰도 하락
- 3점이 아닌 이유: 핵심 SDK·문서·CLI 모두 우수

### 13.4 ECO (12%): 커뮤니티/운영 사례 — **3.0/5**

50K+ 스타, 800+ contributors의 거대 생태계가 있었으나 2026-02 아카이빙으로 사실상 동결. `pgsty/minio` 포크가 활동하지만 신뢰 회복까지 시간 필요.
- 4점이 아닌 이유: 본가 동결, 커뮤니티 신뢰 붕괴
- 2점이 아닌 이유: Pigsty 포크 + RustFS 대체재 등 생태계는 살아있음

### 13.5 LIC (8%): 라이선스/상용 호환 — **2.0/5**

AGPLv3 — SaaS 트리거 시 소스 공개 의무 발동 가능. Apache 2.0 후보(SeaweedFS, RustFS) 대비 명백한 단점. 우리 프로젝트가 비공개 SaaS라면 위험.
- 3점이 아닌 이유: AGPL은 자체호스팅 SaaS에서 광범위 위협
- 1점이 아닌 이유: 자체 데이터 저장만 한다면 발동 안 한다고 일반 해석

### 13.6 MAINT (10%): 업그레이드/Breaking Change — **1.5/5**

본가 아카이빙으로 신규 릴리즈 없음. `pgsty/minio` 포크 의존이지만 포크가 얼마나 오래 유지될지 불확실. 보안 패치 백포트 약속만 있을 뿐 SLA 없음.
- 2점이 아닌 이유: 본가 영구 동결은 명확한 리스크
- 1점이 아닌 이유: Pigsty가 활발히 패치 시도 중

### 13.7 INTEG (10%): Next.js 16 + Prisma 7 + WSL2 + Cloudflare Tunnel — **2.5/5**

Next.js·Prisma는 무관(S3 SDK가 추상화). WSL2 동작 OK. 그러나 Cloudflare Tunnel 경유 시 SignatureDoesNotMatch 다발 — 우회는 가능하지만 운영 부담 큼.
- 3점이 아닌 이유: Cloudflare 호환성이 결정적 약점
- 2점이 아닌 이유: 우회책(Next.js 프록시)이 존재

### 13.8 SECURITY (10%): OWASP/CVE/자체호스팅 보안 — **3.0/5**

과거 CVE 이력은 평균 수준 (Critical 0건, High 2건/년). 단 본가 아카이빙으로 향후 CVE 패치 공급망이 포크 의존 → 단점.
- 4점이 아닌 이유: 미래 패치 보장 X
- 2점이 아닌 이유: 코어 보안 모델 자체는 견고 (IAM, SSE, Audit)

### 13.9 SELF_HOST (5%): 단일 서버 운영 가능성 — **2.5/5**

8GB RAM 권장은 단일 서버에 부담. SNSD는 프로덕션 부적합 명시. WSL2에서 멀티 디스크 구성 비현실적. 어드민 UI 본가 제거 → 1인 운영 난이도 ↑.
- 3점이 아닌 이유: RAM·디스크 요구가 단일 서버에 무거움
- 2점이 아닌 이유: SNSD로 형식적 동작은 가능

### 13.10 COST (3%): $0/month — **5.0/5**

자체호스팅이므로 라이선스 비용 0 (AGPL 의무 무시 시). 외부 트래픽 비용도 Cloudflare Tunnel 무료 티어로 흡수.
- 5점 확정: 비용 자체는 0원

### 13.11 가중평균

| 차원 | 점수 | 가중 | 가중점수 |
|------|------|------|----------|
| FUNC | 3.5 | 18% | 0.630 |
| PERF | 4.0 | 10% | 0.400 |
| DX | 4.0 | 14% | 0.560 |
| ECO | 3.0 | 12% | 0.360 |
| LIC | 2.0 | 8% | 0.160 |
| MAINT | 1.5 | 10% | 0.150 |
| INTEG | 2.5 | 10% | 0.250 |
| SECURITY | 3.0 | 10% | 0.300 |
| SELF_HOST | 2.5 | 5% | 0.125 |
| COST | 5.0 | 3% | 0.150 |
| **합계** | | 100% | **3.085 / 5** |

**최종 본가 점수: 3.09/5** (반올림)

### 13.12 `pgsty/minio` 포크 시나리오 (참고)

| 차원 | 본가 → 포크 변화 |
|------|-----------------|
| MAINT | 1.5 → 2.5 (+1.0) |
| ECO | 3.0 → 3.5 (+0.5) |
| SECURITY | 3.0 → 3.5 (+0.5) |
| 기타 | 동일 |

**포크 채택 시 가중평균: 3.30/5**

---

## 14. 리스크

### 14.1 거버넌스 리스크 (최고 등급)

본가 아카이빙으로 신규 도입은 모두 포크 의존. Pigsty 포크가 갑자기 중단되면 직접 패치하거나 타 후보로 마이그레이션해야 함. 1인 운영 환경에서 이는 감당 어려움.

### 14.2 라이선스 리스크 (높음)

AGPLv3 발동 조건이 모호. MinIO Inc.가 라이선스 조사·소송을 적극화한 사례(Weka, 2023) 있음. 비공개 SaaS 운영 시 잠재 폭탄.

### 14.3 Cloudflare Tunnel 호환 리스크 (중간)

Signature mismatch는 운영 중 재발 가능. Cloudflare가 Managed Transformer를 업데이트할 때마다 깨질 가능성 있음. Next.js 프록시 우회 시 처리량 병목.

### 14.4 단일 노드 한계 (중간)

SNSD는 Versioning/Object Lock 부재 → 사용자 실수로 파일 덮어쓰면 복구 불가. SNMD 전환은 WSL2에서 비현실적.

### 14.5 이미지 변환 부재 (중간)

Supabase 동등 달성을 위해 imgproxy 별도 컨테이너 또는 sharp 기반 Next.js Route Handler 필수. 추가 운영 부담.

### 14.6 RAM 압박 (낮음)

8GB+ 권장이 16GB 단일 서버에 부담. PostgreSQL/Next.js와 경합.

---

## 15. 결론

### 15.1 종합 평가

본가 MinIO는 2026년 4월 현재 **신규 도입 비추천**. 거버넌스 붕괴와 라이선스 리스크가 결정적이다. `pgsty/minio` 포크는 단기 대안이지만 장기 신뢰 부족.

만약 어떤 강한 이유로 MinIO 계열을 채택해야 한다면:
1. `pgsty/minio` 포크 사용
2. Cloudflare Tunnel 우회 (Next.js 프록시 패턴)
3. SNSD가 아닌 Single-Node Multi-Drive로 디스크 4개 LVM 구성 (WSL2에서 가상 디스크 4개 마운트)
4. AGPL 리스크는 법무 검토 후 수용 결정

### 15.2 100점 도달 청사진

본가 MinIO 채택 시 Storage 점수 변화:
- 현재: 40/100
- MinIO 본가 도입 후: **65/100** 추정
  - +20: S3 API 호환 (PUT/GET/Multipart/Presigned/IAM/Lifecycle)
  - +5: Bucket 정책 (Public/Private)
  - 빠진 25점: 이미지 변환 (별도 imgproxy 필요), Versioning/Object Lock (SNSD 한계), 거버넌스 신뢰

`pgsty/minio` 포크 + imgproxy 사이드카 + SNMD 도입 시 **75/100**까지 가능. 단, 거버넌스 리스크로 인해 80점 돌파는 어렵다.

### 15.3 DQ-1.3 잠정 답변

**MinIO는 1순위 비추천.** Garage 또는 SeaweedFS를 우선 검토하라. MinIO를 굳이 쓰겠다면 `pgsty/minio` 포크 + Next.js 프록시 패턴 + imgproxy 사이드카로 75/100 달성 가능하나, 거버넌스 리스크로 권장하지 않음.

### 15.4 실행 권고

본가 MinIO 채택은 다음 조건이 모두 만족될 때만:
- (a) 라이선스 법무 검토 완료
- (b) Pigsty 포크 의존 수용
- (c) Cloudflare Tunnel 우회 패턴 합의
- (d) imgproxy 별도 운영 합의

위 4개 중 하나라도 NO → Garage 또는 SeaweedFS로 이동.

---

## 16. 참고 자료

1. [MinIO 공식 사이트 (현재 AIStor 상용 중심)](https://www.min.io/) — 거버넌스 변화 확인
2. [GitHub minio/minio 아카이브 (read-only)](https://github.com/minio/minio) — 2026-02-12 아카이빙
3. [MinIO Single-Node Single-Drive 공식 문서](https://min.io/docs/minio/linux/operations/install-deploy-manage/deploy-minio-single-node-single-drive.html) — SNSD 정의 및 한계
4. [MinIO Single-Node Multi-Drive 공식 문서](https://min.io/docs/minio/linux/operations/install-deploy-manage/deploy-minio-single-node-multi-drive.html) — SNMD 권장 구성
5. [MinIO AGPLv3 정책 블로그](https://www.min.io/blog/from-open-source-to-free-and-open-source-minio-is-now-fully-licensed-under-gnu-agplv3) — 2021 라이선스 변경 공식 발표
6. [MinIO Commercial License 페이지](https://www.min.io/commercial-license) — 상용 가격대 명시 (연 $96K~$244K)
7. [MinIO Maintenance Mode 이슈 #21714](https://github.com/minio/minio/issues/21714) — 2025-12 종료 선언
8. [Pigsty MinIO Fork — Vonng 블로그 "MinIO Is Dead, Long Live MinIO"](https://blog.vonng.com/en/db/minio-resurrect/) — 포크 출시 배경
9. [Pigsty MinIO Module 공식 문서](https://pigsty.io/docs/minio/) — 포크 운영 가이드
10. [Cloudflare Tunnel + MinIO Signature Mismatch 토론 #20188](https://github.com/minio/minio/discussions/20188) — 알려진 문제 종합
11. [Proxmox Forum: PBS S3 backend behind Cloudflare Tunnel SignatureDoesNotMatch](https://forum.proxmox.com/threads/pbs-s3-backend-behind-cloudflare-tunnel-fails-with-signaturedoesnotmatch-against-minio-while-direct-local-access-works.181657/) — 동일 문제 사례
12. [LinkedIn: Resolving MinIO Behind Cloudflare Proxy 403 Error](https://www.linkedin.com/pulse/resolving-minio-behind-cloudflare-proxy-403-error-bhavesh-deshmukh-pk1nf) — 우회 패턴
13. [MinIO Web Console 제거 (BlocksAndFiles 2025-06)](https://www.blocksandfiles.com/ai-ml/2025/06/19/minio-users-complain-after-admin-ui-removed-from-community-edition/1610856) — 어드민 제거 여론
14. [MinIO Object Browser Controversy (Medium, Peter Rosemann)](https://medium.com/@dkdndes/minios-object-browser-controversy-why-removing-the-ui-sparked-a-community-backlash-54348fffcdea) — 커뮤니티 반응
15. [WARP S3 벤치마크 도구](https://github.com/minio/warp) — 성능 검증 도구
16. [MinIO on Single Node 성능 브리프 (Ampere Computing)](https://amperecomputing.com/briefs/minio-on-single-node-brief) — 단일 노드 벤치마크
17. [Next.js + PostgreSQL + MinIO 풀스택 튜토리얼 (alexefimenko.com)](https://www.alexefimenko.com/posts/file-storage-nextjs-postgres-s3) — 통합 패턴
18. [Cody Raymond: Solving Presigned URL Issues with MinIO (Medium)](https://medium.com/@codyalexanderraymond/solving-presigned-url-issues-in-dockerized-development-with-minio-internal-dns-61a8b7c7c0ce) — Docker/DNS 우회
19. [Self-Hosted S3 Storage in 2026 비교 가이드 (Rilavek)](https://rilavek.com/resources/self-hosted-s3-compatible-object-storage-2026) — 2026 시점 후보 비교
20. [RustFS — MinIO 대체재 공식 사이트](https://rustfs.com/) — Apache 2.0 신흥 대안
21. [The End of an Era: MinIO Community Edition is Archived (Cloud Support Engineer)](https://thecloudsupportengineer.com/the-end-of-an-era-minio-community-edition-is-archived-whats-next/) — 종합 회고
22. [Cloudian 블로그: MinIO Bait and Switch](https://cloudian.com/blog/minios-ui-removal-leaves-organizations-searching-for-alternatives/) — 엔터프라이즈 사용자 관점
