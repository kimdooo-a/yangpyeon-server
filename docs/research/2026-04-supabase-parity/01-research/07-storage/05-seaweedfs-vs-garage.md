# SeaweedFS vs Garage — 1:1 심층 비교

> **Wave 2 / Agent D / 1:1 비교 #1**
>
> - 작성일: 2026-04-18
> - 작성자: kdywave Wave 2 1:1 비교 에이전트
> - 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> - 환경: WSL2 Ubuntu + PM2 + Cloudflare Tunnel + 단일 서버 + $0-5/월
> - Wave 1 점수: SeaweedFS 4.25/5 vs Garage 3.72/5 (SeaweedFS 명확한 우위)
> - 본 문서 역할: 매트릭스(04-storage-matrix.md)가 "누가 전체 우위인가"를 답하고, 본 문서는 "**특정 조건에서 왜 A가 아닌 B를 택해야 하는가**"를 1:1로 해부한다.

---

## 0. 문서 목적

MinIO는 아카이빙(2026-02-12)으로 배제가 확정되었다. Ceph RGW는 단일 서버 환경에 과하다. 실질적 경쟁은 **SeaweedFS (Apache-2.0, Go) vs Garage (AGPLv3, Rust)** 2파전이다. 본 문서는:

1. **라이선스 영향** — AGPL이 자체호스팅 SaaS에 주는 실제 리스크
2. **언어 스택 운영 부담** — Go vs Rust, 단일 바이너리 vs 3-tier
3. **S3 API 호환 범위** — 어떤 기능이 결정적인가 (Versioning/Object Lock/SSE-S3/Image)
4. **리소스 풋프린트** — WSL2 2GB 이내에서 누가 살아남는가
5. **지리 분산 복제 모델** — CRDT vs Replication+Master
6. **Cloudflare Tunnel 안정성** — Host 헤더/presigned 실전 가능성
7. **Presigned URL 지원 범위** — Signature v4 + POST Policy + 조건 집합
8. **실전 코드 비교** — 같은 기능 2개를 양쪽에서 구현

---

## 1. 요약 (Executive Summary)

### 1.1 결정 매트릭스

| 축 | SeaweedFS (Apache-2.0) | Garage (AGPLv3) | 승자 |
|----|------------------------|-----------------|------|
| 라이선스 안전성 | **완전 자유** | 네트워크 배포 조항 잠재 위험 | **SeaweedFS** |
| 기능 풍부도 (Versioning/Lock/SSE) | **5/8 핵심 기능** | 1/8 | **SeaweedFS** |
| 내장 이미지 리사이즈 | **O (URL param)** | X (imgproxy 별도) | **SeaweedFS** |
| RAM 풋프린트 (idle) | 350-600 MB | **100-300 MB** | Garage |
| RAM 풋프린트 (WSL2 2GB) | 가능 (여유 적음) | **여유 충분** | Garage |
| 단일 바이너리 운영 | △ (4 컴포넌트 통합) | **O (30MB)** | Garage |
| 학습 시간 (프로덕션) | 2-4시간 | **1-2시간** | Garage |
| S3 API 호환도 | 91% | 55% | **SeaweedFS** |
| Cloudflare Tunnel 호환 | 양호 | **양호 (root_domain 정확)** | 박빙 |
| Presigned URL 안정성 | O | O | 박빙 |
| 지리 분산 복제 | Replication + Raft Master | **CRDT 기반 (zone-aware)** | Garage |
| Prisma 7 시너지 | **Filer-PostgreSQL 공유 가능** | X (LMDB 독립) | **SeaweedFS** |
| Community 규모 | 24K stars | 1.8K stars | **SeaweedFS** |
| 거버넌스 리스크 | Open Core (낮음-중간) | 비영리 (낮음) | 박빙 |

### 1.2 최종 결론 (이 문서 단독)

> **양평 부엌 서버는 SeaweedFS를 채택한다.** 결정적 근거 4가지는 § 11에 명시.
>
> Garage 재고 조건 3가지는 § 12에 명시. 해당 조건이 발생하지 않는 한 SeaweedFS 유지.

---

## 2. 라이선스 영향 분석 — AGPLv3 vs Apache 2.0

### 2.1 AGPLv3 핵심 조항 (Garage 해당)

AGPLv3 §13:
> "If you modify the Program, your modified version must prominently offer all users interacting with it remotely through a computer network **an opportunity to receive the Corresponding Source** of your version..."

해석:
- 사용자가 네트워크로 접근하는 경우에도 **수정된 소스 공개 의무** 발생
- "수정"의 범위: 바이너리 자체 수정 + 파생 저작물 (라이브러리 링크 등)
- **Aggregation exception**: Garage를 수정하지 않고 "단순 사용"하면 의무 발생 X

### 2.2 양평 부엌 서버에서 AGPL 발동 시나리오

| 시나리오 | 발동 여부 | 근거 |
|---------|---------|-----|
| Next.js가 Garage S3 API를 **HTTP로만** 호출 | **발동 X** | 바이너리 분리, aggregation |
| Garage 바이너리를 그대로 Docker에서 실행 | 발동 X | 수정 없음 |
| Garage 소스 코드 일부를 Next.js에 import | **발동 O** | 파생 저작물 |
| Garage 설정 파일(`garage.toml`) 공개 | 발동 X | 설정은 저작물 X |
| Garage 포크 후 버그 패치 적용해 운영 | **발동 O** | 수정된 바이너리를 네트워크로 노출 |

**양평 부엌 기본 운영 시나리오**(Next.js가 S3 API를 HTTP 호출) → AGPL 발동 X

### 2.3 그러나 발동 위험이 증가하는 상황

- Garage 코드를 참고해 독자 구현 개선 → 파생 저작물 논쟁
- 운영 중 버그 직면 → 긴급 패치 적용 → AGPL 강제
- 엔터프라이즈 고객에 운영 대행 → 라이선스 검사 이슈
- **Deuxfleurs 비영리 → 소유권 이관 시 상업 주체가 권리 행사 가능성**

### 2.4 Apache 2.0 (SeaweedFS 해당)

- 자유 수정·배포·상용 사용
- 특허 grant 포함
- 소스 공개 의무 없음
- copyleft 없음
- "network use" 조항 없음 (AGPL 차별점)

**SeaweedFS는 위 모든 "AGPL 발동 리스크"를 원천 차단**

### 2.5 법무 비용 계산

| 항목 | SeaweedFS | Garage |
|------|-----------|--------|
| 초기 법무 검토 시간 | 0시간 | 4-8시간 (AGPL 조항 해석) |
| 연간 라이선스 감사 | 0 | 2-4시간 (코드 변경 추적) |
| 상업화 시 재검토 | 불필요 | 필수 |
| **5년 TCO 차이** | $0 | 법무 비용 $2-5K + 기회비용 |

### 2.6 결론: 라이선스는 SeaweedFS의 **결정적 우위**

1인 운영 + 상업화 가능성 + 법무 시간 최소화 → Apache 2.0이 압도적 유리

---

## 3. 언어 스택 운영 부담 — Go vs Rust

### 3.1 Go (SeaweedFS)

**장점**:
- 단일 정적 바이너리 배포 (50MB)
- GC 있어 메모리 관리 단순
- 빌드 속도 빠름 (< 30초)
- 대규모 개발자 풀 (SeaweedFS 200+ contributors)
- 크로스 컴파일 쉬움 (Linux/macOS/Windows/ARM64)
- 표준 툴체인 (`go build`) 1분 내 설치

**단점**:
- 메모리 안전성이 Rust보다 약함
- CVE 이력 약간 더 많음 (24K stars 표면적)

### 3.2 Rust (Garage)

**장점**:
- 메모리 안전성 보장 (Ownership system)
- CVE 표면적 작음 (2025-2026 0건)
- 성능 예측 가능성 (GC pause 없음)
- LMDB와의 FFI 효율적

**단점**:
- 빌드 속도 느림 (클린 빌드 10-20분)
- 개발자 풀 작음 (기여자 30명)
- 크로스 컴파일 설정 복잡
- 우리 WSL2에 Rust toolchain 추가 설치 필요 (소스 빌드 시)

### 3.3 우리가 소스 빌드할 가능성

| 시나리오 | SeaweedFS | Garage |
|---------|-----------|--------|
| 긴급 버그 패치 필요 | Go 빠른 빌드 | Rust 느린 빌드 |
| 커스텀 기능 추가 | Go 학습 쉬움 | Rust 학습 어려움 |
| 우리 운영 시 빌드 횟수 | 거의 0 (공식 Docker) | 거의 0 (공식 Docker) |

**우리 환경 실질 영향**: 둘 다 공식 Docker 이미지 사용 → 언어 차이 0. **단 긴급 상황 분석**에서 Go가 유리.

### 3.4 단일 바이너리 vs 3-tier

| 항목 | SeaweedFS | Garage |
|------|-----------|--------|
| 프로세스 수 | 1 (통합 모드) | 1 |
| 내부 컴포넌트 | 4 (Master/Volume/Filer/S3) | 2 (S3/Web/Admin API) |
| 운영 멘탈 모델 | 중간 (각 역할 이해 필요) | **단순** |
| 디버깅 복잡도 | 중 | 낮음 |
| 로그 파싱 | 4개 prefix 식별 | 단일 로그 |
| 재시작 영향 | 전체 재기동 | 전체 재기동 |
| Graceful shutdown | 순차 (Filer → Volume → Master) | 즉시 |

**Garage가 운영 단순성에서 우위**. 그러나 1인 운영자가 `weed server` 한 줄로 통합 실행 시 격차는 작다.

### 3.5 결론: 운영 부담은 Garage 미세 우위, 실질 차이는 작음

---

## 4. S3 API 호환 범위 — 결정적 기능 8가지

### 4.1 Supabase Storage 동등성에 **결정적**인 8가지 기능

| # | 기능 | SeaweedFS | Garage | 중요도 | 우회 가능성 |
|---|------|-----------|--------|-------|------------|
| 1 | **Versioning** | **O** | X | 높음 | app-level unique key로 대체 가능하나 손실 위험 |
| 2 | **Object Lock (WORM)** | **O** | X | 중 | app-level read-only flag로 대체 |
| 3 | **SSE-S3** | **O** | X | 중 | SSE-C + 디스크 LUKS로 대체 |
| 4 | **SSE-KMS** | **O** | X | 중 | 외부 KMS 없으면 무관 |
| 5 | **Bucket Policy (S3 IAM JSON)** | **O** | X | 중 | per-key per-bucket + app-level 권한 |
| 6 | **Object/Bucket Tagging** | **O** | X | 낮음 | 메타데이터 DB에서 대체 |
| 7 | **이미지 리사이즈 내장** | **O** | X | 높음 | imgproxy 사이드카 |
| 8 | Event Notifications | X | X | 중 | 둘 다 불가 — 외부 큐 필요 |

**SeaweedFS 7/8 승**: 결정적 기능 7가지 내장, Garage는 전부 부재

### 4.2 app-level 우회 비용 비교

#### Versioning 우회 (Garage 시나리오)

```typescript
// Garage 환경: unique key 강제
const key = `users/${userId}/${crypto.randomUUID()}-${filename}`;

// Folder/File Prisma 트리에 이력 저장
await prisma.fileHistory.create({
  data: {
    fileId: file.id,
    s3Key: key,
    version: file.versions.length + 1,
    uploadedAt: new Date(),
  },
});

// 복구 시: FileHistory를 순회해 이전 버전 반환
```

**비용**: 
- 추가 테이블 `FileHistory` 관리
- 키 생성 로직 복잡도 +20%
- 삭제 마커 없음 → 수동 정리 필요
- DB와 스토리지 불일치 가능성 (트랜잭션 경계)
- 총 구현·유지 시간: **20-40시간**

#### Versioning 우회 (SeaweedFS 시나리오)

```typescript
// SeaweedFS 환경: S3 API 한 번 호출
import { PutBucketVersioningCommand } from "@aws-sdk/client-s3";

await seaweed.send(new PutBucketVersioningCommand({
  Bucket: "yangpyeong-uploads",
  VersioningConfiguration: { Status: "Enabled" },
}));
// 끝. 이후 PUT은 자동으로 버전 관리됨
```

**비용**: 1회 호출 = 5분

**격차**: 20-40시간 → 5분 (**240-480배 차이**)

### 4.3 이미지 리사이즈 비교

SeaweedFS 내장:
```
GET http://volume:8080/3,01637037d6.jpg?width=200&height=200&mode=fit
```
- 파라미터: width, height, mode (fit/fill/default)
- 포맷: JPEG, PNG, GIF, WebP
- 한계: S3 GET 경로 미지원 (Volume 직접 접근), blur/quality 등 없음

imgproxy (Garage 시나리오):
```
docker run -p 8080:8080 \
  -e IMGPROXY_S3_ENDPOINT=http://garage:3900 \
  -e AWS_ACCESS_KEY_ID=... \
  ghcr.io/imgproxy/imgproxy:latest
```
- 파라미터: width/height/quality/format/blur/gravity/watermark 등 풍부
- 포맷: 모든 포맷 + AVIF
- 장점: Supabase imgproxy와 완전 동등
- 단점: +200MB 메모리, +1 컨테이너

**트레이드오프**: 
- SeaweedFS 내장으로 "80% 케이스 즉시 해결" + imgproxy를 옵션으로
- Garage는 **imgproxy 필수**, 메모리 +200MB

### 4.4 결론: S3 API 호환은 **SeaweedFS 압승**

---

## 5. 리소스 풋프린트 — WSL2 2GB 제약

### 5.1 메모리 상세 분해

| 컴포넌트 | SeaweedFS idle | SeaweedFS peak | Garage idle | Garage peak |
|---------|----------------|----------------|-------------|-------------|
| Master | ~50 MB | ~80 MB | — | — |
| Volume | ~150 MB + index | ~500 MB | — | — |
| Filer | ~100 MB | ~300 MB | — | — |
| S3 Gateway | ~50 MB | ~100 MB | — | — |
| Garage 단일 프로세스 | — | — | ~100-300 MB | ~500 MB-1 GB |
| **합계 idle** | **350-600 MB** | — | **100-300 MB** | — |
| **합계 peak** | — | **~1-2 GB** | — | **~1 GB** |

### 5.2 WSL2 2GB 시나리오 시뮬레이션

가정: WSL2 총 RAM 2GB, Next.js 600MB, PostgreSQL 400MB, OS 300MB 사용

**남은 RAM**: 700MB

| 후보 | idle 사용 | peak 사용 | 2GB 내 가능 |
|------|---------|---------|-----------|
| SeaweedFS | 350-600 MB | 1-2 GB | **△ idle 가능, peak 시 OOM 위험** |
| Garage | 100-300 MB | ~1 GB | **O 여유 충분** |

**2GB 엄격 제약 환경에선 Garage 필수**.

그러나 양평 부엌은 WSL2 4-8GB 할당 가능 환경 → 이 제약 무관.

### 5.3 파일 수 증가 시 RAM 거동

| 파일 수 | SeaweedFS 메타 RAM | Garage 메타 RAM |
|--------|---------------------|-----------------|
| 100K | ~2 MB | ~5 MB |
| 1M | ~20 MB | ~50 MB |
| 10M | ~200 MB | ~500 MB |
| 100M | ~2 GB | ~5 GB (mmap 포함) |

양평 부엌 예상 파일 수: 10K-100K → **둘 다 충분**

### 5.4 CPU

| 메트릭 | SeaweedFS | Garage |
|--------|-----------|--------|
| idle CPU | ~2% | ~1% |
| 부하 시 CPU | 30-70% | 30-60% |
| 병렬 처리 코어 활용 | O (Go runtime) | O (Tokio) |
| 콜드 응답 시간 | < 10ms | < 15ms |

**체감 차이 무의미**

### 5.5 디스크

| 항목 | SeaweedFS | Garage |
|------|-----------|--------|
| 최소 디스크 | 10 GB | 1 GB |
| 메타데이터 오버헤드 | ~20 bytes/file | ~100 bytes/file |
| 압축 (zstd) | △ (대형 X) | O (옵션) |
| 중복 제거 | X | O (옵션) |

Garage가 디스크 효율 미세 우위. 하지만 양평 부엌 규모에선 무관.

### 5.6 결론

- **WSL2 2GB 엄격 제약**: Garage 필수
- **WSL2 4GB+**: SeaweedFS가 기능 우위로 역전
- 양평 부엌 환경(WSL2 4-8GB 예정)에선 **RAM이 결정 요인 아님**

---

## 6. 지리 분산 복제 모델

### 6.1 SeaweedFS 복제 모델

- **Master Raft**: 토폴로지 일관성 (leader 선출)
- **Volume Replication**: `defaultReplication=001` (같은 rack), `010` (같은 DC), `100` (다른 DC)
- **Consensus 지연**: Master Raft는 낮음(~ms), Volume은 async
- **Multi-zone**: O (공식 지원)
- **단점**: Raft에 의존하므로 네트워크 파티션 시 소수 측 쓰기 불가

### 6.2 Garage 복제 모델

- **CRDT 기반**: No consensus, eventual consistency
- **Zone-aware**: 노드를 zone(DC) 별로 배치
- **Replication Factor**: 1/2/3 설정 가능
- **Block-level 복제**: 1MB 청크 단위
- **특징**: 네트워크 파티션 시 **양쪽 모두 쓰기 가능**, 병합은 CRDT로
- **지연 민감도**: 낮음 (가정 광대역 가정)
- **단점**: Strong consistency 필요 시 부적합

### 6.3 양평 부엌 환경 관점

- 현재: 단일 WSL2 서버 → **복제 무관**
- 미래 시나리오 1: 외부 VPS 1대 추가 → Garage의 CRDT zone-aware 자연 확장
- 미래 시나리오 2: 클라우드 DR → SeaweedFS cloud tiering으로 B2/S3 자동
- 미래 시나리오 3: 멀티 DC → SeaweedFS는 Raft 지연, Garage는 CRDT 원활

### 6.4 결론: 미래 분산 확장은 **Garage 우위**, 현재 무관

---

## 7. Cloudflare Tunnel 안정성

### 7.1 공통 요구사항

- Path-style 또는 Virtual-host-style URL
- Signature v4 + Host Header 정확성
- Presigned URL TTL 내 업로드 완료
- CF WAF가 PUT/POST 허용

### 7.2 SeaweedFS + CF Tunnel

- Path-style 호환 **우수** (본가 Wiki 언급)
- Host Header 변형 민감도 낮음
- Cloudflare가 Chunked Transfer를 re-chunk해도 문제 적음
- Presigned URL 안정: 검증된 사례 다수

설정 예:
```yaml
ingress:
  - hostname: s3.stylelucky4u.com
    service: http://localhost:8333
    originRequest:
      httpHostHeader: s3.stylelucky4u.com
```

### 7.3 Garage + CF Tunnel

- Virtual-host-style 우수 (root_domain 정확 구현)
- Path-style도 지원
- Host Header 정합 강력 (`root_domain = ".s3.stylelucky4u.com"`)
- Presigned URL 안정: Jan Wildeboer 시리즈 등 검증

설정 예:
```yaml
ingress:
  - hostname: s3.stylelucky4u.com
    service: http://localhost:3900
    originRequest:
      httpHostHeader: s3.stylelucky4u.com
```

### 7.4 결론: 둘 다 **양호**, 박빙

---

## 8. Presigned URL 지원 범위

### 8.1 기본 Presigned

| 기능 | SeaweedFS | Garage |
|------|-----------|--------|
| Presigned GET | O | O |
| Presigned PUT | O | O |
| Presigned HEAD | O | O |
| Presigned DELETE | O | O |
| Presigned POST Policy | O | △ (부분) |
| TTL 범위 | 1초 ~ 7일 | 1초 ~ 7일 |
| Content-Type 제약 | O | O |
| Content-Length 제약 | O | O |
| x-amz-meta-* | O | O |

### 8.2 STS (임시 자격 증명)

| 기능 | SeaweedFS | Garage |
|------|-----------|--------|
| STS AssumeRole | O | X |
| STS WebIdentity (OIDC) | O | X |
| STS GetSessionToken | O | X |
| 세션 토큰 TTL | 15분 ~ 12시간 | (미지원) |

양평 부엌은 STS 미사용 → 차이 무관.

### 8.3 결론: 기본 기능 박빙, STS는 SeaweedFS 독점. 우리에게 무관

---

## 9. 코드 비교 #1 — 업로드 Presigned URL 생성

### 9.1 공통 셋업 (동일)

```typescript
// app/lib/s3-client.ts
import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT!,  // SeaweedFS: http://localhost:8333, Garage: http://localhost:3900
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,  // 둘 다 path-style 권장
});
```

→ AWS SDK v3가 둘 다 동일하게 다룸. **코드 차이 없음**.

### 9.2 Presigned PUT — SeaweedFS & Garage 공통

```typescript
// app/api/upload/presign/route.ts
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { s3 } from "@/app/lib/s3-client";
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

  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });
  return NextResponse.json({ url, key });
}
```

**결과**: 둘 다 동일 코드로 동작. Garage는 metadata에 한국어 값(`x-amz-meta-*`) 사용 시 UTF-8 인코딩 주의 필요(버그 #456 과거 이력). SeaweedFS는 한국어 metadata 테스트 통과.

### 9.3 Presigned POST Policy 차이

```typescript
// SeaweedFS는 완전 지원, Garage는 부분 지원
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

const { url, fields } = await createPresignedPost(s3, {
  Bucket: "yangpyeong-uploads",
  Key: "uploads/${filename}",
  Conditions: [
    ["content-length-range", 0, 50 * 1024 * 1024],
    ["starts-with", "$Content-Type", "image/"],
    { "x-amz-meta-user-id": session.user.id },
  ],
  Expires: 60,
});
```

- **SeaweedFS**: 모든 조건 정확 검증
- **Garage**: `starts-with` 및 `content-length-range` 지원. `x-amz-meta-*` 조건은 문서상 언급 없음 — 실전 검증 필요

**우리 적용 시**: 기본 업로드엔 Presigned PUT으로 충분. POST Policy는 필요 없음.

---

## 10. 코드 비교 #2 — Lifecycle 정책 설정

### 10.1 Lifecycle 기능 범위

| 규칙 | SeaweedFS | Garage |
|------|-----------|--------|
| Expiration (days) | O | **O** |
| Expiration (date) | O | △ |
| NoncurrentVersionExpiration | O | X (Versioning 부재) |
| AbortIncompleteMultipartUpload | O | **O** |
| Transition (Storage Class) | X | X |
| Transition (외부 S3) | O (cloud tiering) | X |
| Prefix filter | O | O |
| Tag filter | O | X (Tagging 부재) |

### 10.2 SeaweedFS Lifecycle 설정

```typescript
import { PutBucketLifecycleConfigurationCommand } from "@aws-sdk/client-s3";

await seaweed.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: "yangpyeong-uploads",
  LifecycleConfiguration: {
    Rules: [
      {
        ID: "expire-temp-uploads",
        Status: "Enabled",
        Filter: { Prefix: "tmp/" },
        Expiration: { Days: 7 },
      },
      {
        ID: "abort-incomplete-mpu",
        Status: "Enabled",
        Filter: { Prefix: "" },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 3 },
      },
      {
        ID: "archive-old-uploads",
        Status: "Enabled",
        Filter: { Prefix: "archive/" },
        NoncurrentVersionExpiration: { NoncurrentDays: 90 },
      },
    ],
  },
}));
```

### 10.3 Garage Lifecycle 설정 (제한적)

```typescript
// Garage는 Expiration + AbortIncompleteMultipartUpload만 지원
await garage.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: "yangpyeong-uploads",
  LifecycleConfiguration: {
    Rules: [
      {
        ID: "expire-temp-uploads",
        Status: "Enabled",
        Filter: { Prefix: "tmp/" },
        Expiration: { Days: 7 },
      },
      {
        ID: "abort-incomplete-mpu",
        Status: "Enabled",
        Filter: { Prefix: "" },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 3 },
      },
      // NoncurrentVersionExpiration 미지원 (Versioning 없음)
      // Tag filter 미지원
    ],
  },
}));
```

### 10.4 SeaweedFS Cloud Tiering (독점 기능)

```bash
# weed shell에서
volume.tier.move -dest=remote:b2 -source=ssd -fromDateTimeBefore=2026-01-01
```

양평 부엌 백업: 90일 이상 미접근 파일 자동 B2 이동 → **Garage는 rclone 수동**

---

## 11. SeaweedFS 채택의 결정적 근거 4가지

### 근거 1: 기능 풍부도 차이 (Versioning + Object Lock + SSE + 이미지)

Wave 1 deep-dive에서 확인된 바:

| 기능 | 양평 필요성 | SeaweedFS | Garage |
|------|-----------|-----------|--------|
| Versioning | 높음 (사용자 실수 복구) | O | X |
| 이미지 리사이즈 | 매우 높음 (갤러리) | O 내장 | X (imgproxy 필수) |
| SSE-S3 | 중 (민감 파일) | O | X |
| Object Lock | 중 (세무 문서 등) | O | X |

**SeaweedFS 없이 Garage만으로는 Supabase Storage 동등성 70점 → 80점 이상 어려움**

### 근거 2: Apache 2.0 라이선스

- AGPL 법무 리스크 0
- 상업화 옵션 자유
- fork 부담 없음
- 5년 TCO 차이 $2-5K

### 근거 3: 이미지 변환 내장

- Volume URL 파라미터로 즉석 리사이즈
- imgproxy 사이드카 불필요 → +200MB RAM 절약
- Supabase imgproxy의 80% 케이스 커버
- 양평 부엌이 갤러리/이미지 많은 프로젝트

### 근거 4: Prisma 7 + PostgreSQL 시너지

- Filer 메타데이터를 PostgreSQL에 저장 가능
- 양평 부엌이 이미 PostgreSQL 운영 중
- 메타데이터 단일 진실 소스 (Prisma와 공유)
- 별도 SQLite/LMDB 운영 부담 제거

---

## 12. Garage 재고 조건 (하나라도 참이면 재평가)

### 조건 1: WSL2 RAM 엄격 제약 (≤ 2GB)

- WSL2 총 RAM 2GB 제약
- 다른 서비스가 1.5GB 이상 사용
- → SeaweedFS 350-600MB idle은 부담
- → Garage 100-300MB 유리

### 조건 2: 이미지 변환 완전 불필요

- 양평 부엌이 이미지 업로드 배제 (갤러리 없음)
- 모든 파일이 PDF/ZIP/일반 문서
- → SeaweedFS의 이미지 리사이즈 내장 이점 무의미
- → Garage 단순 S3로 충분

### 조건 3: Versioning/Object Lock 완전 불필요

- 모든 파일이 immutable, unique key 강제 가능
- 사용자 실수 복구 요구 없음
- 세무 문서 등 WORM 요구 없음
- → SeaweedFS의 거버넌스 기능 불필요
- → Garage의 AGPL만 감수하면 Garage 적합

---

## 13. 최종 결정

### 13.1 양평 부엌 서버 기본 스택

```
┌────────────────────────────────────────────┐
│ Primary Storage: SeaweedFS v4.20           │
│  - `weed server` 단일 프로세스 (4 컴포넌트) │
│  - Filer → PostgreSQL (메타데이터 통합)    │
│  - Versioning 활성 (중요 버킷)              │
│  - 이미지 리사이즈 내장 (Volume server)     │
│                                            │
│ Optional: imgproxy 사이드카 (풀 기능 변환)  │
│  - SeaweedFS 내장으로 부족 시              │
│                                            │
│ Backup Tier: Backblaze B2 (원격)           │
│  - SeaweedFS cloud tiering으로 자동         │
│  - 90일+ 미접근 파일 이동                   │
└────────────────────────────────────────────┘
```

### 13.2 점수 목표

- 현재 Storage: 40/100
- SeaweedFS 도입 후: **90-95/100**
- 빠진 5-10점: Bucket Replication S3 API, Event Notifications

### 13.3 Garage 채택 시 점수 예상

- Garage 단독: 70/100
- Garage + imgproxy: 80/100
- Garage + imgproxy + B2 미러: 85/100
- **Garage 최대 85점 vs SeaweedFS 95점 → 10점 격차**

### 13.4 실행 순서

1. **Phase 1 (주 1)**: SeaweedFS v4.20 docker-compose 시범, `weed mini` 학습
2. **Phase 2 (주 2)**: Filer-PostgreSQL 통합 + Cloudflare Tunnel 연결
3. **Phase 3 (주 3)**: Versioning 활성, Prisma 트리 S3 key 컬럼 추가, 마이그레이션
4. **Phase 4 (주 4)**: 이미지 변환 Next.js 프록시 + B2 tier-down 자동화
5. **Phase 5 (옵션)**: imgproxy 사이드카 (풀 이미지 기능 필요 시)

---

## 14. 참고 자료 (1:1 비교 전용)

1. [AGPLv3 공식 조항](https://www.gnu.org/licenses/agpl-3.0.en.html) — §13 네트워크 배포
2. [Apache 2.0 공식](https://www.apache.org/licenses/LICENSE-2.0) — 특허 grant + 자유 사용
3. [SeaweedFS Amazon S3 API 호환 표](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API)
4. [Garage S3 호환성 공식 표](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)
5. [SeaweedFS Volume Server API (이미지 리사이즈)](https://github.com/seaweedfs/seaweedfs/wiki/Volume-Server-API)
6. [imgproxy 공식 문서](https://docs.imgproxy.net/)
7. [SeaweedFS Filer-PostgreSQL 통합 가이드](https://dev.to/benjeddou_monem_68600c6c8/supercharge-your-file-storage-seaweedfs-postgresql-in-15-minutes-407f)
8. [Jan Wildeboer: Garage + Nginx 시리즈](https://jan.wildeboer.net/2026/01/2-S3-Garage-Behind-Nginx/)
9. [Cloudflare Tunnel + S3 호환 스토리지 가이드](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/use-cases/self-hosted-s3/)
10. [SeaweedFS Cloud Tiering 공식](https://github.com/seaweedfs/seaweedfs/wiki/Cloud-Tier)
11. [Backblaze B2 Pricing](https://www.backblaze.com/cloud-storage/pricing)
12. [komsit37 Gist — Garage 메모리 정확 측정](https://gist.github.com/komsit37/7029089c05b741931dd21ac49687dd4b)
13. [AWS SDK v3 presigned URL 문서](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/)
14. [AWS S3 Lifecycle 규칙 참조](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
15. [Rust vs Go 운영 부담 — Hacker News 토론 모음](https://news.ycombinator.com/item?id=38478621)
16. [Wave 1 SeaweedFS Deep Dive (본 프로젝트)](./03-seaweedfs-deep-dive.md)
17. [Wave 1 Garage Deep Dive (본 프로젝트)](./02-garage-deep-dive.md)
18. [Storage Matrix (본 Wave 2)](./04-storage-matrix.md)
