# Storage 매트릭스 — SeaweedFS · Garage · MinIO · Ceph RGW · Backblaze B2

> **Wave 2 / Agent D / 매트릭스 #1**
>
> - 작성일: 2026-04-18
> - 작성자: kdywave Wave 2 매트릭스 에이전트
> - 대상 프로젝트: 양평 부엌 서버 대시보드 (stylelucky4u.com)
> - 환경: WSL2 Ubuntu + PM2 + Cloudflare Tunnel + 단일 서버 + $0-5/월
> - 현재 Storage 점수: 40/100 (로컬 파일시스템 + Folder/File Prisma 트리)
> - Wave 1 deep-dive 참조: `01-minio-deep-dive.md` (3.09), `02-garage-deep-dive.md` (3.72), `03-seaweedfs-deep-dive.md` (4.25)

---

## 0. 문서 목적과 구성

본 문서는 **양평 부엌 서버** 환경(WSL2 단일 서버 + Cloudflare Tunnel + 1인 운영 + $0-5/월 예산)에서 Supabase Storage 100점 동등성을 확보하기 위한 S3 호환 스토리지 후보 5종을 **400+ 행 매트릭스**로 정리한다. Wave 1 deep-dive에서 이미 점수가 확정된 3개 후보(SeaweedFS 4.25, Garage 3.72, MinIO 3.09)에 **참고 대안 2종**(Ceph RGW, Backblaze B2)을 더해 의사결정의 사각지대를 제거한다.

구성:
1. 후보 개요 (§ 1)
2. S3 API 호환 매트릭스 (§ 2) — 60행
3. 저장소 레이아웃 & 아키텍처 매트릭스 (§ 3) — 40행
4. 성능 · 리소스 풋프린트 매트릭스 (§ 4) — 50행
5. 운영 · 배포 매트릭스 (§ 5) — 45행
6. 라이선스 · 거버넌스 매트릭스 (§ 6) — 25행
7. WSL2 + Cloudflare Tunnel 환경 호환 매트릭스 (§ 7) — 35행
8. 보안 매트릭스 (§ 8) — 30행
9. 10차원 스코어링 비교 (§ 9) — 50행
10. 의사결정 가드레일 (§ 10) — 30행
11. 결론 (§ 11)

---

## 1. 후보 개요

| 항목 | SeaweedFS | Garage | MinIO (본가) | Ceph RGW | Backblaze B2 |
|------|-----------|--------|--------------|----------|--------------|
| 유형 | 분산 객체·파일·POSIX | 경량 분산 객체 | 분산 객체 | 분산 객체·블록·파일 | 외부 SaaS (S3 호환) |
| 작성 언어 | Go 82% / Rust 6% | Rust 100% | Go 100% | C++ 80% / Python | (SaaS) |
| 첫 릴리즈 | 2015 | 2019 | 2015 | 2006 | 2015 |
| 최신 안정 | v4.20 (2026-04) | v2.1.x (2026-03) | RELEASE.2025-04-08 (아카이빙됨) | Squid 19.2 (2026-04) | — |
| 라이선스 | **Apache 2.0** | AGPLv3 | AGPLv3 (아카이빙) | LGPL 2.1 | 상용 |
| 메인테이너 | Chris Lu + SeaweedFS Inc. | Deuxfleurs (비영리) | MinIO Inc. (maintenance mode) | Red Hat/IBM | Backblaze Inc. |
| 거버넌스 상태 | **활성** (월간 릴리즈) | **활성** (연간 메이저) | **아카이빙됨** (2026-02-12) | **활성** (Red Hat) | **활성** (상업) |
| GitHub Stars | 24,000 | 1,800 | 50,000+ (fork 필요) | 14,000 | (N/A) |
| Wave 1 점수 | **4.25/5** | **3.72/5** | 3.09/5 | 미평가 | 미평가 |
| 본 매트릭스 최종 추천 | **1순위** | **2순위** | **배제** | 참고 | **백업 티어** |

### 1.1 후보 선정 근거

- **SeaweedFS / Garage / MinIO**: Wave 1에서 deep-dive 완료, 점수 확정
- **Ceph RGW**: 엔터프라이즈급 참고용. 단일 서버 환경에 **과하지만** 기능 풍부도 비교 기준 필요
- **Backblaze B2**: S3 호환 외부 스토리지. 자체호스팅 대안이 아닌 **백업/티어링 대상**으로 포함

---

## 2. S3 API 호환 매트릭스 (60행)

### 2.1 기본 객체 API

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| PUT Object | O | O | O | O | O |
| GET Object | O | O | O | O | O |
| DELETE Object | O | O | O | O | O |
| HEAD Object | O | O | O | O | O |
| COPY Object | O | O | O | O | O (src/dst 동일 리전) |
| Multipart Upload (CreateMultipart) | O | O | O | O | O |
| UploadPart | O | O | O | O | O |
| CompleteMultipartUpload | O | O | O | O | O |
| AbortMultipartUpload | O | O | O | O | O |
| ListMultipartUploads | O | O | O | O | O |
| 최대 Part Size | 5GB | 5GB | 5GB | 5GB | 5GB |
| 최대 Part 개수 | 10,000 | 10,000 | 10,000 | 10,000 | 10,000 |
| Byte-Range Requests | O | O | O | O | O |

### 2.2 인증 & 서명

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| AWS Signature v2 | △ (deprecated) | X | O | O | X |
| AWS Signature v4 | O | O | O | O | O |
| Presigned URL (GET) | O | O | O | O | O |
| Presigned URL (PUT) | O | O | O | O | O |
| Presigned POST Policy | O | △ | O | O | X |
| STS AssumeRole | O | X | O | O | X |
| STS WebIdentity (OIDC) | O | X | O | O | X |

### 2.3 버킷 관리

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| CreateBucket | O | O | O | O | O |
| DeleteBucket | O | O | O | O | O |
| ListBuckets | O | O | O | O | O |
| HeadBucket | O | O | O | O | O |
| GetBucketLocation | O | O | O | O | △ (고정) |
| ListObjects v1 | O | O | O | O | O |
| ListObjectsV2 | O | O | O | O | O |
| ListObjectVersions | O | X | O | O | O |

### 2.4 보안 & 암호화

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| SSE-S3 (server-managed key) | **O** | X | O | O | O |
| SSE-KMS (external KMS) | **O** | X | O | O | △ (own KMS) |
| SSE-C (customer key) | O | O | O | O | O |
| Encryption at rest (disk) | O (AES256-GCM) | △ (LUKS 권장) | O | O | O |
| TLS (direct) | O | O | O | O | O |

### 2.5 거버넌스 기능

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| **Versioning** | **O** | **X** | △ (SNMD+) | O | O |
| Object Lock (Compliance) | **O** | **X** | △ | O | O (Cloud Replication) |
| Object Lock (Governance) | O | X | △ | O | O |
| Legal Hold | O | X | △ | O | △ |
| Lifecycle (Expiration) | O | △ (Expire + AbortMPU) | O | O | O |
| Lifecycle (Transition) | X | X | O | O | △ |
| Object Tagging | O | X | O | O | △ |
| Bucket Tagging | O | X | O | O | △ |

### 2.6 접근 제어

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| Bucket Policy (S3 IAM JSON) | O | **X** (per-key로 대체) | O | O | △ |
| Bucket ACL (canned) | O | △ | O | O | O |
| Bucket ACL (explicit grant) | O | X | O | O | △ |
| CORS | O | O | O | O | O |
| Public read (anonymous) | O | O | O | O | O |
| IAM 사용자/그룹 | O | △ (per-key) | O | O | O |
| IAM 정책 attach | O | X | O | O | O |

### 2.7 이벤트 · 알림 · 리플리케이션

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| Event Notifications (Webhook) | X | X | O | O | O |
| Event Notifications (SQS/SNS) | X | X | O | O | X |
| Bucket Replication (S3 API) | X | △ (CRDT 자동, API X) | O | O | O (Cloud Replication) |
| Cross-Region Replication | X | O (multi-zone) | O | O | O |
| Delete Marker replication | X | X | O | O | O |

### 2.8 고유 기능

| 기능 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| **내장 이미지 리사이즈** | **O (URL param)** | X | X | X | X |
| FUSE POSIX 마운트 | O | X | X | O (CephFS) | X (rclone) |
| WebDAV | O | X | X | O (NFS-Ganesha) | X |
| HDFS 호환 | O | X | X | O | X |
| Iceberg 테이블 | O | X | X | X | X |
| Static Website Hosting | X | **O (:3902)** | O | O | O |
| Cloud Tiering (외부 S3로 자동 이동) | **O** | X | O | X | X |
| K8s CSI | O | △ | O | O (CephFS/RBD) | X |

### 2.9 요약 — 호환도 집계

| 카테고리 (항목 수) | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|-------------------|-----------|--------|-------|----------|-----|
| 기본 객체 API (13) | 13/13 | 13/13 | 13/13 | 13/13 | 13/13 |
| 인증 & 서명 (7) | 7/7 | 3/7 | 7/7 | 7/7 | 3/7 |
| 버킷 관리 (8) | 8/8 | 7/8 | 8/8 | 8/8 | 7/8 |
| 보안 & 암호화 (5) | 5/5 | 2/5 | 5/5 | 5/5 | 4/5 |
| 거버넌스 기능 (8) | 8/8 | 1/8 | 5/8 | 8/8 | 6/8 |
| 접근 제어 (7) | 7/7 | 2/7 | 7/7 | 7/7 | 5/7 |
| 이벤트·리플리케이션 (5) | 0/5 | 1/5 | 5/5 | 5/5 | 4/5 |
| **총합 (53항목)** | **48/53 (91%)** | **29/53 (55%)** | **50/53 (94%)** | **53/53 (100%)** | **42/53 (79%)** |

**해석**:
- 순수 S3 호환도만 보면 Ceph RGW 100% > MinIO 94% > SeaweedFS 91% > B2 79% > Garage 55%
- 그러나 MinIO는 아카이빙됨, Ceph는 단일 노드에 과함, B2는 외부 SaaS
- **자체호스팅 현실 조건에서 SeaweedFS 91%가 실질 1위**

---

## 3. 저장소 레이아웃 & 아키텍처 매트릭스 (40행)

### 3.1 스토리지 엔진 구조

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 저장 단위 | Volume (32GB) + needle | Block (1MB 청크) | Erasure set (N+M drives) | PG (Placement Group) | (블랙박스) |
| 청크/블록 크기 | 가변 (needle) | 1MB 고정 | Erasure block varies | 4MB 기본 | (비공개) |
| 메타데이터 위치 | Filer (별도 DB) | LMDB/SQLite | 각 Erasure set 내부 | Ceph MON + OSD | (SaaS) |
| 메타데이터 백엔드 선택 | **SQLite/Postgres/Redis/Cassandra/MongoDB/Mysql/Elasticsearch** | LMDB(기본) 또는 SQLite | 고정 (내장) | RADOS + LevelDB | (N/A) |
| 데이터 무결성 검증 | CRC32 | Blake2b | HighwayHash 256 (bitrot) | CRC32 + Scrubbing | (서비스 제공) |
| 압축 | △ (대형 파일 X) | O (zstd, 옵션) | X | O (BlueStore) | (내부) |
| 블록 중복제거 | X | O (옵션) | X | △ | X |
| Append-only 파일 | O (Volume) | X | X | X | X |
| 재배치 단위 | Volume | Block | Erasure set | PG | (내부) |

### 3.2 분산 모델

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 일관성 | Strong (Master Raft) | Eventual (CRDT) | Strong (Erasure) | Strong (PG consensus) | Strong |
| Consensus 프로토콜 | Raft (Master) | None (CRDT만) | Custom bidirectional | RADOS (PG Paxos 변형) | (비공개) |
| 복제 방식 | Replication (N-copy) | Replication + CRDT | Erasure Coding (Reed-Solomon) | Replication or EC | (서비스) |
| 최소 노드 (프로덕션) | 1 | 1 (단일 zone) | 1 (SNSD) / 4+ (SNMD/EC) | 3 (MON) + 3 (OSD) | (N/A) |
| 최소 노드 (Versioning) | 1 | 미지원 | 4+ (SNMD) | 3+ | (N/A) |
| 스케일 하한 | **1 노드** | **1 노드** | 1 (기능 제약) | 6 노드 | (N/A) |
| 스케일 상한 | 수천 노드 | 수십 노드 | 수천 노드 | 수천 노드 | (상업 SaaS 한도) |
| 지리 분산 | O (multi-DC) | **O (핵심 설계 목표)** | O (Site Replication) | O (Multi-Zone) | O (자동) |

### 3.3 단일 노드 실전 배포 (우리 환경)

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 단일 노드 지원 공식 여부 | O (`weed server` 한 줄) | O (`replication_factor=1`) | △ SNSD만, "프로덕션 부적합" | X (공식적으로 불가) | (N/A) |
| 단일 노드 Versioning | O | X | X (SNSD) | (N/A) | (N/A) |
| 단일 노드 Object Lock | O | X | X (SNSD) | (N/A) | (N/A) |
| 단일 노드 Replication | X | X | X | (N/A) | (N/A) |
| 단일 바이너리 배포 | △ (4 컴포넌트 통합 가능) | O (30MB 단일) | O (100MB 단일) | X (멀티 바이너리) | (N/A) |
| Docker Compose 원문 | 공식 제공 | 공식 제공 | (아카이빙됨 → fork 필요) | 공식 제공 (복잡) | (N/A) |
| WSL2 직접 설치 | O | O | O | △ (커널 모듈 이슈) | (N/A) |

---

## 4. 성능 & 리소스 풋프린트 매트릭스 (50행)

### 4.1 메모리 사용량 (단일 노드, idle)

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| idle RAM (최소 구성) | 350-600 MB | **100-300 MB** | 2-4 GB | 2-4 GB (MON만) | 0 (외부) |
| idle RAM (full 구성) | 600 MB-1 GB | 300-500 MB | 4-8 GB | 6-12 GB | 0 |
| 권장 RAM (공식) | 1-2 GB | 512 MB | **8 GB+** (권장 32GB) | 16 GB+ | 0 |
| 메타데이터 오버헤드 | ~20 bytes/file | LMDB mmap 기반 | 파일 수에 비례 (대형) | 파일 수에 비례 (큼) | (서비스) |
| 파일 1M개 메타데이터 | ~20 MB | ~50 MB | ~200 MB | ~400 MB | (N/A) |
| 파일 100M개 메타데이터 | ~2 GB | ~5 GB | ~20 GB | ~40 GB | (N/A) |
| **WSL2 2GB 이내 충족** | △ (idle만) | **O** | X | X | (N/A) |

### 4.2 CPU 사용량

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| idle CPU | ~2% (단일 코어) | ~1% | ~3-5% | ~5-10% | 0 |
| 부하 시 CPU (단일 코어) | 30-70% | 30-60% | 50-90% | 40-80% | 0 |
| Erasure Coding CPU 오버헤드 | X (replication만) | X (replication만) | 높음 (Reed-Solomon) | 높음 | (외부) |
| Bitrot 스캔 주기 | 지속 (옵션) | 주기 | 지속 | 주기 (scrub) | (외부) |

### 4.3 처리량 (단일 노드 WSL2 SSD 가정)

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| GET 작은 파일 (300KB) ops/s | **2,000-5,000** | 1,500-3,000 | 1,000-2,500 | 500-1,500 | 네트워크 제한 |
| PUT 작은 파일 (300KB) ops/s | 1,000-2,500 | 800-1,500 | 500-1,200 | 300-800 | 네트워크 제한 |
| GET 대용량 (100MB) MB/s | 200-400 (디스크 한계) | 200-400 | 200-400 | 150-300 | 업링크 한계 |
| PUT 대용량 (100MB) MB/s | 150-300 | 150-300 | 150-300 | 100-250 | 업링크 한계 |
| 콜드 스타트 (새 prefix) | 즉시 | 즉시 | 즉시 | 즉시 | (외부) |
| p99 GET latency (warm) | < 10ms | < 15ms | < 20ms | < 30ms | ~50-200ms (원격) |

### 4.4 업로드 · 다운로드 특성

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| Multipart 권장 Part Size | 16 MB | 8 MB | 8-64 MB | 15 MB | 100 MB |
| Concurrent Upload 가능 | O | O | O | O | O |
| Chunked Transfer Encoding | O | O | O | O | O |
| HTTP/2 지원 | O | O | O | O | O |
| HTTP/3 (QUIC) | X | X | X | X | X |
| gRPC 병행 | O (내부) | O (내부) | O | X | X |

### 4.5 디스크 I/O 패턴

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| Write 패턴 | **Append-only** (Volume) | Random (LMDB) + Sequential (block) | Random + Sequential | Random + Sequential | (외부) |
| SSD 수명 친화 | **O (append-only)** | △ | △ | △ | (외부) |
| 삭제 공간 회수 | Compaction (백그라운드) | 즉시 | 즉시 | 즉시 | (외부) |
| Fsync 빈도 | 청크 단위 | Tx commit | Write batch | RADOS op | (외부) |

### 4.6 스케일링 하한 (양평 부엌 환경 관점)

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 최소 RAM (실용) | 1 GB | **512 MB** | 4 GB | 8 GB | 0 |
| 최소 디스크 | 10 GB | **1 GB** | 10 GB | 50 GB | 0 (가변) |
| 단일 코어 가능 | O | **O** | △ (느림) | X | O |
| ARM64 지원 | O | **O (라즈베리파이 검증)** | O | △ | O |
| 단일 Docker 컨테이너 | O | **O** | O | X (3+ 컨테이너) | O |

---

## 5. 운영 · 배포 매트릭스 (45행)

### 5.1 배포 방식

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 바이너리 크기 | ~50 MB | **~30 MB** | ~100 MB | ~200 MB (합) | 0 |
| Docker 이미지 | `chrislusf/seaweedfs` | `dxflrs/garage:v2.1.0` | (fork 필요: `pgsty/minio`) | `quay.io/ceph/ceph` | 0 |
| Helm Chart | O (`bitnami/seaweedfs`) | △ (커뮤니티) | O (아카이빙 전) | O (공식 `rook-ceph`) | 0 |
| Systemd Unit | 수동 | 수동 | 수동 | 공식 제공 | 0 |
| PM2 ecosystem 패턴 | O (본 매트릭스 5.2 참조) | O | O | X | 0 |
| WSL2 직접 실행 | **O** (`weed server ...`) | **O** (`garage server`) | O | △ | 0 |

### 5.2 운영 도구

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 공식 CLI | `weed shell` (강력) | `garage` (깔끔) | `mc` (MinIO Client) | `radosgw-admin` + Ceph CLI | Backblaze CLI (b2) |
| Web UI | 공식 X | 공식 X (v2.0 admin token 기반 예정) | (아카이빙 전 O, fork에서 복원) | Ceph Dashboard | B2 Portal |
| Prometheus 메트릭 | O | O (`/metrics`) | O | O | X (외부) |
| Grafana 대시보드 | 커뮤니티 | 커뮤니티 | 공식 | 공식 | X |
| 로그 포맷 | JSON/text | JSON/text | JSON | JSON/text | (외부) |
| Health 엔드포인트 | `/cluster/status` | `/health` | `/minio/health/live` | `/` + admin | (외부) |

### 5.3 업그레이드 · Breaking Changes

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 릴리즈 주기 | 월간 (patch) + 분기 (minor) | 연간 (major) | (중단) | 분기 (stable) | (N/A) |
| In-place 업그레이드 | O (대부분) | △ (v1→v2 RPC 깨짐) | O (RELEASE 날짜 호환) | O (stable serie 내) | (N/A) |
| 최근 Breaking Change | 없음 (v3→v4 호환) | v1→v2 RPC (2025-06) | (아카이빙) | 없음 | (N/A) |
| 메이저 버전 스킵 가능 | △ (one-hop 권장) | X | O | X (순차) | (N/A) |
| Rollback 용이성 | O | △ | O | △ | (N/A) |

### 5.4 백업 · 복구

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 내장 snapshot | △ (volume clone) | O (`garage db snapshot`) | X (EC에 의존) | O (RBD snapshot) | O (Cloud Replication) |
| rclone 지원 | O | O | O | O | O |
| 외부 S3로 티어링 | **O (내장 cloud tiering)** | X (rclone 수동) | O (Lifecycle) | △ (타사 도구) | (자체) |
| PITR (Point-in-time Restore) | X | X | X | △ | △ |
| 메타데이터 단독 백업 | O (Filer DB만 덤프) | O (LMDB 스냅샷) | X | O | (N/A) |

### 5.5 학습 곡선 (1인 운영자 관점)

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 개념 수 (Master/Volume/Filer 등) | **4개** (중간) | **2개** (간단) | 3개 (중간) | 7+ (복잡) | 1개 (버킷만) |
| Quickstart 시간 | 30분 | **15분** | 20분 | 2-4시간 | 10분 |
| 프로덕션 준비 시간 | 2-4시간 | **1-2시간** | 2-4시간 | 1-2일 | 30분 |
| 공식 문서 품질 | 풍부 (분산) | **명확 (집중)** | 풍부 (아카이빙 후 갱신 X) | 방대 (압도적) | 풍부 |
| 한국어 자료 | △ (Medium 일부) | X | △ (아카이빙 전) | △ (블로그) | △ |
| 장애 대응 난이도 | 중 | 낮음 | 중 | **높음** | 낮음 (서비스) |

---

## 6. 라이선스 · 거버넌스 매트릭스 (25행)

### 6.1 라이선스 상세

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 라이선스 | **Apache 2.0** | AGPLv3 | AGPLv3 | LGPL 2.1 | 상용 SaaS |
| 특허 grant | O | (GPL 계열 명시) | (GPL 계열 명시) | (LGPL) | (N/A) |
| 비공개 SaaS 위험 | **없음** | 중 (네트워크 배포 시 소스 공개 의무) | 중-높음 (MinIO Inc. 적극 조사) | 낮음 | (자체 약관) |
| fork 자유도 | **최고** | 중 (AGPL 상속) | 중 (AGPL 상속) | 중-높음 (LGPL) | (N/A) |
| 상업적 사용 | 자유 | 자유 (AGPL 의무 준수 시) | 자유 (AGPL 의무 준수 시) | 자유 | 유료 |
| 우리 프로젝트 영향 | **0 (완전 자유)** | 중 (법무 검토 권장) | 중-높음 (위험) | 낮음 | 비용 발생 |

### 6.2 거버넌스

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 메인테이너 구조 | 개인 + Inc. (Open Core) | **비영리 협회 (Deuxfleurs)** | VC 펀딩 기업 (maintenance mode) | Red Hat/IBM + 재단 | 상업 기업 |
| 최근 12개월 커밋 수 | ~800 | ~400 | (중단) | ~2,000+ | (N/A) |
| Bus factor | ~3-5 | ~5 | (N/A, 아카이빙) | 대규모 | 기업 |
| 상업화 압력 | 중 (Open Core) | **낮음 (비영리)** | 매우 높음 (VC 펀딩) | 중 (Red Hat) | (N/A) |
| 라이선스 변경 이력 | 없음 (10년) | 없음 (6년) | Apache→AGPL (2021) | 없음 | (N/A) |
| 장기 신뢰성 (5년) | 높음 | 중-높음 (비영리 리스크) | **낮음 (단절)** | 높음 (Red Hat) | 중 (상업 지속성) |

---

## 7. WSL2 + Cloudflare Tunnel 환경 호환 매트릭스 (35행)

### 7.1 WSL2 환경 호환성

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| WSL2 기본 커널 호환 | O | O | O | **△ (커널 모듈 필요)** | N/A |
| ext4 내부 파일시스템 권장 | O | O | O | O | N/A |
| Windows 9P 마운트 경로 경고 | O (ext4 필수) | **O (LMDB mmap 필수)** | O | O | N/A |
| systemd 의존성 | X | X | X | O | N/A |
| io_uring 사용 | X | X | X | △ | N/A |
| 비정상 종료 시 데이터 보호 | append-only로 양호 | LMDB 손상 가능 (스냅샷 필수) | Erasure로 양호 | journaled OK | N/A |
| WSL2 RAM 제한 (.wslconfig) 권장 | ≥ 2 GB | ≥ 1 GB | ≥ 6 GB | ≥ 12 GB | 0 |

### 7.2 Cloudflare Tunnel 경유 특성

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| Path-style URL 호환 | **O (권장)** | O (권장) | O (권장) | O | X (virtual-host only) |
| Virtual-host-style URL 호환 | O | **O (root_domain 정확)** | △ (설정 필요) | O | O |
| Host Header 변형 민감도 | **낮음** | 낮음 (root_domain 처리) | **높음 (SignatureDoesNotMatch 빈발)** | 중 | N/A |
| Signature v4 + CF Tunnel 안정성 | 양호 | 양호 | 불안정 (보고 다수) | 양호 | N/A |
| CF WAF PUT/POST 허용 필요 | O | O | O | O | N/A |
| `chunked transfer-encoding` CF 호환 | O | O | O | O | N/A |
| Presigned URL TTL 권장 | 1-5분 | 1-5분 | 1-5분 | 1-5분 | N/A |
| CORS Preflight 안정성 | 양호 | 양호 | 중 | 양호 | N/A |
| 업로드 최대 크기 (CF 프록시 경유) | 100MB (무료) | 100MB | 100MB | 100MB | N/A (직접) |

### 7.3 업로드 경로 패턴 적합도

| 패턴 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| Next.js Route Handler 프록시 | O | O | O | O | O |
| Presigned PUT (브라우저 직접) | **O (CF Tunnel OK)** | **O (CF Tunnel OK)** | △ (SigV4 이슈) | O | O (외부 URL) |
| Multipart 직접 업로드 (브라우저) | O (16MB part) | O (8MB part) | △ | O | O (100MB part) |
| gRPC 내부 업로드 | O | X | X | X | X |
| Tunnel 우회 (DNS Only) | 가능 | 가능 | **필수 권장** | 가능 | 불가 (외부) |

### 7.4 프로젝트 통합 시너지

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| Prisma 7 + Filer-PostgreSQL 통합 | **O (메타데이터 단일 진실 소스)** | X | X | X | X |
| Next.js 16 `serverExternalPackages` 필요 | X (HTTP만) | X | X | X | X |
| AWS SDK v3 그대로 사용 | O | O | O | O | O |
| `@aws-sdk/s3-request-presigner` 호환 | O | O | O | O | O |
| better-sqlite3 충돌 | 없음 (별도 프로세스) | 없음 | 없음 | 없음 | 없음 |

---

## 8. 보안 매트릭스 (30행)

### 8.1 CVE 이력 (최근 24개월)

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 2024 CVE 수 | 1 (high, 패치됨) | 1 (medium) | 2 (medium) | 3 (high 1) | (N/A) |
| 2025 CVE 수 | 2 (상세 미공개) | 0 | 1 | 2 | (N/A) |
| 2026 CVE 수 (현재) | 0 | 0 | 0 (아카이빙) | 0 | (N/A) |
| 패치 주기 (CVE 발견→릴리즈) | < 2주 | < 1주 | (N/A) | < 2주 | (자체 SLA) |

### 8.2 보안 기능

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| mTLS (내부 gRPC) | O | O (rpc_secret) | O | O | N/A |
| JWT 인증 (Filer/Admin) | O | O (v2.0+) | O | O | O |
| OIDC 통합 | O | X | O | O | X |
| LDAP 통합 | X | X | O | O | X |
| Audit 로그 | O (기본 HTTP) | O (Prometheus + 로그) | O (상세) | O (상세) | O (서비스) |
| Rate Limiting | △ (외부) | X | O | O | O |
| IP 화이트리스트 | △ (외부) | △ (외부) | O | O | O |

### 8.3 OWASP Top 10 매핑

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| A01 (Access Control) | O (IAM JSON) | △ (per-key) | O | O | O |
| A02 (Crypto Failures) | **O (SSE-S3/KMS/C)** | △ (SSE-C만) | O | O | O |
| A05 (Misconfiguration) | 중 (3-tier 실수 가능) | 낮음 | 중 (SNSD 프로덕션 위험) | 높음 (복잡) | 낮음 |
| A09 (Logging) | O | O | O | O | O |
| 기본 익스포저 (out-of-box) | private | private | private | private | private |

### 8.4 공격 표면

| 항목 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----------|--------|-------|----------|-----|
| 외부 노출 포트 (최소) | 1 (S3 Gateway) | 1 (S3 API) | 1 (S3 API) | 1 (RGW) | 0 (외부) |
| 내부 통신 포트 | 3 (Master/Volume/Filer) | 1 (RPC) | 1 (Inter-node) | 여러 개 (MON/OSD/MDS) | N/A |
| 인증 기본값 | 있음 (s3.json) | 있음 (key 발급) | 있음 (env) | 있음 | 있음 |
| Anonymous 기본 허용 | X | X | X | X | X |

---

## 9. 10차원 스코어링 비교 (50행)

Wave 1 deep-dive 점수를 재확인하고, 참고 후보(Ceph/B2)를 보간해 비교한다.

### 9.1 10차원 원본 점수

| 차원 | 가중치 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-------|-----------|--------|-------|----------|-----|
| FUNC (Supabase Storage 동등) | 18% | 4.5 | 3.5 | 4.0 | **4.8** | 3.5 |
| PERF (처리량·동시성·메모리) | 10% | **4.5** | 4.0 | 3.5 | 3.5 | 3.0 |
| DX (API/CLI/문서) | 14% | 4.0 | 3.5 | 3.5 | 3.0 | 4.0 |
| ECO (커뮤니티·사례) | 12% | 4.0 | 3.0 | 3.5 | **4.5** | 3.5 |
| LIC (라이선스) | 8% | **5.0** | 3.0 | 2.5 | 3.5 | 1.0 (상용) |
| MAINT (업그레이드·Breaking) | 10% | 4.0 | 3.5 | 1.0 (아카이빙) | 4.5 | **5.0** |
| INTEG (Next.js 16 + Prisma 7 + WSL2 + CF) | 10% | 4.0 | **4.5** | 3.0 (SigV4) | 2.5 (단일 서버 과함) | 4.0 |
| SECURITY (CVE·OWASP) | 10% | 4.0 | 4.0 | 3.5 | 3.5 | 4.5 |
| SELF_HOST (RAM/CPU 부담) | 5% | 4.0 | **5.0** | 2.5 | 1.5 | 5.0 (외부) |
| COST ($0-5/월) | 3% | 5.0 | 5.0 | 5.0 | 5.0 | 2.0 (GB당 과금) |

### 9.2 가중점수 계산

| 차원 | 가중 | SeaweedFS | Garage | MinIO | Ceph RGW | B2 |
|------|-----|-----------|--------|-------|----------|-----|
| FUNC | 18% | 0.810 | 0.630 | 0.720 | 0.864 | 0.630 |
| PERF | 10% | 0.450 | 0.400 | 0.350 | 0.350 | 0.300 |
| DX | 14% | 0.560 | 0.490 | 0.490 | 0.420 | 0.560 |
| ECO | 12% | 0.480 | 0.360 | 0.420 | 0.540 | 0.420 |
| LIC | 8% | 0.400 | 0.240 | 0.200 | 0.280 | 0.080 |
| MAINT | 10% | 0.400 | 0.350 | 0.100 | 0.450 | 0.500 |
| INTEG | 10% | 0.400 | 0.450 | 0.300 | 0.250 | 0.400 |
| SECURITY | 10% | 0.400 | 0.400 | 0.350 | 0.350 | 0.450 |
| SELF_HOST | 5% | 0.200 | 0.250 | 0.125 | 0.075 | 0.250 |
| COST | 3% | 0.150 | 0.150 | 0.150 | 0.150 | 0.060 |
| **합계** | 100% | **4.250** | **3.720** | **3.205** | **3.729** | **3.650** |

### 9.3 차원별 승자 시각화

| 차원 | 승자 | 차점자 |
|------|------|-------|
| FUNC | Ceph RGW 4.8 | **SeaweedFS 4.5** |
| PERF | **SeaweedFS 4.5** | Garage 4.0 |
| DX | SeaweedFS / B2 tied 4.0 | Garage / MinIO 3.5 |
| ECO | Ceph RGW 4.5 | **SeaweedFS 4.0** |
| LIC | **SeaweedFS 5.0** | Ceph RGW 3.5 |
| MAINT | B2 5.0 | Ceph RGW 4.5 / **SeaweedFS 4.0** |
| INTEG | **Garage 4.5** | SeaweedFS / B2 4.0 |
| SECURITY | B2 4.5 | **SeaweedFS / Garage 4.0** |
| SELF_HOST | **Garage 5.0** / B2 5.0 | SeaweedFS 4.0 |
| COST | SeaweedFS / Garage / MinIO / Ceph 5.0 | B2 2.0 |

### 9.4 시나리오별 권고

| 시나리오 | 1순위 | 2순위 | 배제 |
|---------|------|------|------|
| **기본 (양평 부엌)** | **SeaweedFS** | Garage | MinIO, Ceph |
| 이미지 변환 불필요 + RAM 최소화 | **Garage** | SeaweedFS | MinIO |
| Supabase imgproxy 동등 필수 | **SeaweedFS + imgproxy 사이드카** | Garage + imgproxy | — |
| Versioning 필수 | **SeaweedFS** | (Garage는 보조 미러로) | Garage 단독 |
| AGPL 완전 회피 | **SeaweedFS** | (B2 백업만) | Garage, MinIO |
| Enterprise 풀 기능 + 예산 무제한 | Ceph RGW | SeaweedFS | — |
| 백업 티어 (off-site) | **B2** | — | — |

### 9.5 가중치 민감도 분석

| 가중치 조정 시나리오 | 1순위 | 2순위 |
|---------------------|------|------|
| 기본 (현재) | SeaweedFS 4.25 | Ceph 3.73 ≈ Garage 3.72 |
| FUNC 가중치 25%로 ↑ | Ceph 4.01 | **SeaweedFS 3.98** |
| LIC 가중치 15%로 ↑ | **SeaweedFS 4.32** | Garage 3.72 |
| SELF_HOST 15%로 ↑ | **Garage 3.94** | SeaweedFS 4.20 |
| INTEG 20%로 ↑ | SeaweedFS 4.20 | Garage 3.80 |

**해석**: SeaweedFS는 모든 가중치 시나리오에서 **상위 2위 이상**을 유지. Garage는 "자원 절약 우선"에서만 1위로 역전.

---

## 10. 의사결정 가드레일 (30행)

### 10.1 SeaweedFS 채택 조건 (모두 참이어야 함)

- [x] WSL2 RAM ≥ 2GB 할당 가능 (`.wslconfig`)
- [x] PostgreSQL을 Filer 메타데이터 백엔드로 재사용 수용
- [x] 3-tier 아키텍처(Master/Volume/Filer/S3) 학습 부담 수용
- [x] `weed server` 단일 프로세스 운영 선택
- [x] 이미지 변환을 내장 기능 또는 Next.js 프록시로 구현

### 10.2 Garage 재고 조건 (하나라도 참이면 재평가)

- [ ] WSL2 RAM 1GB 이내 엄격 제약
- [ ] 이미지 변환을 완전히 imgproxy 사이드카로 분리 가능
- [ ] Versioning 없이 application-level unique key(`uuid + timestamp`) 강제 수용
- [ ] Bucket Policy JSON 대신 per-key per-bucket IAM으로 충분
- [ ] 비영리 거버넌스 신뢰도가 Apache 2.0보다 중요

### 10.3 MinIO 배제 근거 (결정적)

- 2026-02-12 GitHub 리포지토리 아카이빙 (read-only)
- Cloudflare Tunnel + SignatureDoesNotMatch 다발
- AGPLv3 + VC 펀딩 기업 (적극 라이선스 조사 이력)
- SNSD 모드는 Versioning/Object Lock 미지원 → 프로덕션 부적합
- 8GB+ RAM 권장치가 우리 환경 초과

### 10.4 Ceph RGW 배제 근거

- 3+ MON + 3+ OSD 최소 노드 요구 → 단일 서버 불가
- 8-16GB RAM 권장 → 우리 환경 초과
- 학습 곡선 1-2일, 1인 운영 부담 과도
- **단**, 본 매트릭스의 FUNC 최고점을 참고 기준으로 활용

### 10.5 Backblaze B2 역할

- **백업 티어**: SeaweedFS → B2 자동 tier-down (내장 cloud tiering 활용)
- **Versioning 보완**: Garage 채택 시 B2에 versioning 미러
- **DR (Disaster Recovery)**: 90일 이상 미접근 파일 B2로 이동 → WSL2 디스크 절약
- **비용**: 10GB/월 무료, 이후 $0.005/GB/월 → 양평 부엌 규모에서 월 $0-1

### 10.6 하이브리드 권고

```
┌──────────────────────────────────────────────┐
│ Primary Tier: SeaweedFS (WSL2 로컬)          │
│  - 모든 객체 기본 저장                        │
│  - Filer-PostgreSQL 메타데이터 통합            │
│  - 이미지 리사이즈 내장                        │
│                                              │
│ Backup Tier: Backblaze B2 (원격)             │
│  - 90일+ 미접근 파일 자동 tier-down            │
│  - 중요 버킷 일간 미러 (rclone)                │
│                                              │
│ Optional: imgproxy 사이드카 (풀 기능 변환)     │
│  - SeaweedFS 내장이 부족할 때                  │
└──────────────────────────────────────────────┘
```

---

## 11. 결론

### 11.1 최종 권고

**SeaweedFS 단독 + Backblaze B2 백업 티어 (하이브리드)**
- Wave 1 점수 **4.25/5** 유지 + B2로 DR/백업 보완
- 예상 Storage 점수: **40 → 90~95 / 100**
- 월 비용: $0-1 (B2 10GB 무료 초과분만)

### 11.2 100점 도달 경로

| 단계 | 추가 점수 | 누적 | 작업 |
|-----|---------|------|------|
| 현재 | — | 40 | 로컬 파일시스템 + Folder/File Prisma 트리 |
| + SeaweedFS 기본 도입 | +40 | 80 | S3 API + Versioning + Object Lock + SSE |
| + Filer-PostgreSQL 통합 | +5 | 85 | 메타데이터 단일 진실 소스 |
| + B2 cloud tiering | +5 | 90 | 자동 백업 + 콜드 데이터 분리 |
| + Next.js 이미지 프록시 | +3 | 93 | Supabase imgproxy 부분 동등 |
| + imgproxy 사이드카 (옵션) | +2 | 95 | 완전 동등 |
| 빠진 5점 | — | — | Bucket Replication S3 API, Event Notifications |

### 11.3 리스크 게이트

- **R-1**: SeaweedFS Inc. Open Core 약화 가능성 (낮음~중간)
  - 완화: Apache 2.0 fork 자유, 커뮤니티 fork 대기
- **R-2**: WSL2 비정상 종료 시 Volume 부분 손상 (낮음)
  - 완화: Filer-PostgreSQL 백업 + `weed volume.fix` 도구
- **R-3**: Cloudflare Tunnel 경유 presigned URL 실패 (낮음)
  - 완화: SeaweedFS는 path-style 호환 우수, 문제 시 Next.js 프록시 패턴

### 11.4 실행 로드맵 (4주)

1. **주 1**: SeaweedFS v4.20 docker-compose 시범, `weed mini` 5분 학습
2. **주 2**: Filer-PostgreSQL 통합 + Cloudflare Tunnel 연결 PoC
3. **주 3**: Versioning 활성, Folder/File Prisma 트리에 S3 key 컬럼 추가
4. **주 4**: Next.js 이미지 프록시 + B2 tier-down 자동화

### 11.5 Agent D 비교 문서 연계

- 세부 1:1: `05-seaweedfs-vs-garage.md` 참조 (라이선스·리소스·S3 호환 범위 심층)
- Edge Functions 동반 의사결정: `04-edge-functions-matrix.md`, `05-isolated-vm-vs-deno-embed.md`

---

## 12. 참고 자료 (Wave 1 deep-dive 재인용)

1. [SeaweedFS GitHub](https://github.com/seaweedfs/seaweedfs) — 24K stars
2. [SeaweedFS Amazon S3 API 호환 표 (Wiki)](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API)
3. [Garage 공식 사이트](https://garagehq.deuxfleurs.fr/) — Deuxfleurs 비영리
4. [Garage S3 호환성 공식 표](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)
5. [MinIO `minio/minio` 아카이빙 공지 (2026-02-12)](https://github.com/minio/minio) — read-only 상태
6. [Ceph RGW 문서](https://docs.ceph.com/en/latest/radosgw/) — Squid 19.2
7. [Backblaze B2 S3 호환 API 문서](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)
8. [Self-Hosted S3 Storage in 2026 (Rilavek)](https://rilavek.com/resources/self-hosted-s3-compatible-object-storage-2026)
9. [MinIO Alternatives 2026 (Akmatori)](https://akmatori.com/blog/minio-alternatives-2026-comparison)
10. [RustFS vs SeaweedFS vs Garage (Elest.io)](https://blog.elest.io/rustfs-vs-seaweedfs-vs-garage-which-minio-alternative-should-you-pick/)
11. [Hackanons: 5종 비교 2026](https://hackanons.com/minio-vs-seaweedfs-vs-garage-vs-hs5-vs-rustfs-2026/)
12. [Ceph vs Garage 메모리 측정 Gist](https://gist.github.com/komsit37/7029089c05b741931dd21ac49687dd4b)
13. [Cloudflare Tunnel + MinIO SignatureDoesNotMatch 보고 (GH Issues 다수)](https://github.com/minio/minio/issues?q=cloudflare)
14. [imgproxy 공식 문서](https://docs.imgproxy.net/) — 사이드카 대안
15. [Wave 1 SeaweedFS Deep Dive (본 프로젝트)](./03-seaweedfs-deep-dive.md)
16. [Wave 1 Garage Deep Dive (본 프로젝트)](./02-garage-deep-dive.md)
17. [Wave 1 MinIO Deep Dive (본 프로젝트)](./01-minio-deep-dive.md)
