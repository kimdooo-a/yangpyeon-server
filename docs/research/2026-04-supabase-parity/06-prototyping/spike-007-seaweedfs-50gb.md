# Spike-007 — SeaweedFS 50GB+ 운영성 검증

- **상태**: Wave 5 S1 — Phase 17 진입 전 필수 검증
- **작성일**: 2026-04-18 (kdywave Wave 5 S1 에이전트)
- **대상**: 양평 부엌 서버 대시보드 (stylelucky4u.com)
- **스택**: SeaweedFS 3.x (latest stable) + WSL2 Ubuntu + Backblaze B2 + k6
- **상위 청사진**: `02-architecture/07-storage-blueprint.md` (Phase 17, 30h)
- **선행 리서치**: `01-research/07-storage/03-seaweedfs-deep-dive.md` (Wave 1 deep-dive, 4.25/5)
- **관련 ADR**: ADR-008 (SeaweedFS 단독 + B2 오프로드 채택)
- **관련 DQ**: DQ-1.3 / DQ-STO-1 / DQ-STO-2
- **관련 TD**: TD-005 (SeaweedFS 50GB+ 운영 미검증 — ASM-4)
- **kdyspike 명령**: `/kdyspike --full seaweedfs-50gb --max-hours 12`

---

## 0. 문서 목적 및 위치

### 0.1 이 스파이크가 필요한 이유

Storage Blueprint(`07-storage-blueprint.md §10`)는 ADR-008에서 식별된 **ASM-4 리스크("SeaweedFS 50GB+ 운영 미검증")**를 "Phase 17 배포 전 spike-007에서 검증 완료 필수"로 명시한다.

Wave 1~4를 거쳐 확보된 SeaweedFS 지식:
- **Wave 1 deep-dive**: 4.25/5점, "이미지 리사이즈 내장 + Filer-PostgreSQL 공유 + Apache 2.0" 확정
- **Wave 2 매트릭스**: SeaweedFS 4.25 > Garage 3.72 > MinIO 배제(AGPL 전환)
- **Wave 3 리스크**: Storage = 리스크 TOP 3 (`10-14-categories-priority.md §6.2 R-TOP-3`)
- **Wave 4 Blueprint**: 운영 한계 "권장 50GB" 임시 기재, 실측 미확인

세 가지 질문이 미해결 상태다:

1. SeaweedFS volume server 1개로 50GB 저장 시 RSS가 실제로 1GB 이내인가?
2. 10MB 파일 업로드/다운로드 p95가 200ms/100ms 이내인가?
3. B2 Lifecycle 정책이 50GB 도달 시 자동 오프로드를 실제로 트리거하는가?

이 스파이크는 12시간 타임박스 안에 위 세 질문을 실측으로 답변하고, Phase 17 `go/no-go` 판정을 제공한다.

### 0.2 Blueprint §10과의 관계

Blueprint §10(`07-storage-blueprint.md §10`)에서 이미 테스트 시나리오 골격을 제시했다. 이 스파이크는 그 골격을 **실행 가능한 코드·명령으로 상세화**하고, 실제 실행 절차를 완성한다.

| Blueprint §10 시나리오 | 이 스파이크 실험 번호 | 심화 내용 |
|-----------------------|---------------------|----------|
| 시나리오 1 (점진적 부하) | 실험 1~3 | 1GB 단위 → 10GB 단위 → 50GB 도달 |
| 시나리오 2 (동시 읽기/쓰기) | 실험 2~3 | k6 VU 10~100 단계별 |
| 시나리오 3 (장애 복구) | 실험 5 | 24h 안정성 + OOM 후 재기동 |
| - | 실험 4 (신규) | 100k 소파일 메타데이터 조회 |
| - | 실험 6 (신규) | B2 Lifecycle 정책 실제 동작 확인 |

---

## 1. 목적 (Phase 17 진입 전 검증)

### 1.1 검증 핵심

**SeaweedFS 단일 인스턴스(Master + Filer + Volume, WSL2 단일 노드)가 50GB+ 데이터에서 메모리/지연/안정성 임계를 어떻게 보이는지 실측하여, B2 오프로드 트리거 결정과 Phase 17 운영 한계 수치를 확정한다.**

현재 Blueprint §10.5 go/no-go 기준은 이론 기반이다. 이 스파이크가 실측 데이터를 제공하여:

- "권장 50GB" 수치의 신뢰성을 확보하거나,
- "권장 30GB로 하향 + B2 오프로드 적극화"로 계획을 수정한다.

### 1.2 Phase 17과의 연계

```
spike-007-seaweedfs-50gb (1.5일, 12h)
    │
    ├─ 성공 → Storage Blueprint §운영 한계 "권장 50GB" 확정
    │         Phase 17 STO-01~STO-11 신뢰 있게 진행
    │         B2 오프로드 Phase 17에서 동시 구축
    │
    ├─ 부분 성공 → 권장 한계 30GB로 하향
    │              B2 오프로드 우선 구축 (STO-07 우선 순위 상향)
    │              SeaweedFS memoryLimitMB 조정
    │
    └─ 실패 → SeaweedFS 단독 폐기 검토
              MinIO 재고 (50GB+ 확장 필요 시 재평가)
              또는 직접 B2 운영 (Hot Tier 없이 Cold Tier 직접 접근)
```

---

## 2. 가설 (5건)

### H1 — SeaweedFS 50GB RSS ≤ 1GB

**가설**: SeaweedFS volume server 1개로 50GB 데이터를 저장할 때 전체 SeaweedFS 프로세스(master + filer + volume) 합산 RSS가 1GB 이내를 유지한다.

**배경**: Wave 1 deep-dive(`03-seaweedfs-deep-dive.md §1`)에서 "단일 노드 RAM 600MB~2GB 상주"로 문서화됐다. 50GB 데이터가 있을 때 메타데이터 인덱스 크기가 RSS를 얼마나 증가시키는지 실측이 필요하다.

SeaweedFS volume server의 메모리 모델:
- Volume 인덱스는 **메모리 맵(mmap)** 기반 — 실제 데이터는 디스크, 파일 ID→오프셋 맵만 메모리
- 1GB 볼륨 파일의 인덱스 크기: 약 8MB (needle 당 8바이트 × 1M needle/GB)
- 50GB = 약 400MB 인덱스 (이론) + volume server 기본 상주 200MB = ~600MB 예상

**검증 방법**:
```bash
# 0GB 기준선 측정
ps aux | grep weed | grep -v grep
# 10GB 증가마다 RSS 측정
watch -n 60 "ps aux | grep weed | grep -v grep | awk '{sum+=$6} END {print sum/1024, \"MB\"}'"
```

**성공 조건**: 50GB 도달 후 RSS ≤ 1,024MB (1GB)

### H2 — 업로드/다운로드 p95 ≤ 200ms/100ms (10MB 파일)

**가설**: 10MB 파일 기준으로 SeaweedFS 업로드 p95 ≤ 200ms, 다운로드 p95 ≤ 100ms이다. (WSL2 NVMe 기준, 동시 클라이언트 10개)

**배경**: Blueprint §10.3 "시나리오 2: p95 읽기 < 500ms, p99 < 2s"가 보수적 목표이다. 이 스파이크에서 더 구체적인 10MB 파일 기준 p95를 측정하여 Phase 17의 실제 성능 보장 수치를 확정한다.

**검증 방법**:
```bash
# k6 부하 테스트 스크립트 사용
k6 run --vus 10 --duration 60s seaweedfs-bench.js
# 별도로 wrk 사용 (다운로드)
wrk -t4 -c10 -d60s "http://localhost:8333/bucket/test-10mb.bin"
```

**성공 조건**: 업로드 p95 ≤ 200ms / 다운로드 p95 ≤ 100ms

### H3 — 100k 파일 메타데이터 조회 p95 ≤ 50ms

**가설**: SeaweedFS Filer(PostgreSQL 메타데이터 백엔드)에서 100,000개 소파일(1KB~10KB) 메타데이터 조회 p95가 50ms 이내다.

**배경**: DQ-STO-1("PostgreSQL Filer 백엔드 p95 < 20ms")은 파일 1만 개 기준이었다. 10배 규모(100k 파일)에서 인덱스 히트율 저하 여부를 검증한다. PostgreSQL `idx_files_key` 인덱스가 이 쿼리 패턴에 충분한지 실측 필요.

**검증 방법**:
```bash
# 100k 소파일 업로드 후 랜덤 조회
k6 run --vus 50 --duration 60s seaweedfs-metadata-bench.js
# PostgreSQL EXPLAIN ANALYZE로 쿼리 플랜 확인
psql -c "EXPLAIN ANALYZE SELECT * FROM files WHERE storage_key = 'test-key-50000';"
```

**성공 조건**: 메타데이터 조회 p95 ≤ 50ms

### H4 — GC 지연 ≤ 5초 (volume compaction 중)

**가설**: SeaweedFS volume compaction(GC) 실행 중에도 읽기/쓰기 서비스 지연이 ≤ 5초를 유지한다.

**배경**: SeaweedFS의 삭제 연산은 실제로 파일을 삭제하지 않고 "tombstone" 마킹만 한다. 주기적 compaction으로 실제 공간을 회수하는데, 이 과정에서 volume이 읽기 전용으로 전환되는 시간이 있다. 50GB 규모에서 compaction 지연이 얼마나 발생하는지 미확인이다.

**검증 방법**:
```bash
# 1. 50GB에서 30% 파일 삭제 (tombstone 생성)
k6 run --vus 5 --duration 30s seaweedfs-delete.js

# 2. compaction 트리거
curl "http://localhost:9333/vol/vacuum"  # Master API

# 3. compaction 중 읽기 지연 측정
k6 run --vus 10 --duration 120s seaweedfs-read-during-gc.js

# 4. PM2 로그에서 compaction 시작/완료 시각 확인
pm2 logs seaweedfs-master --lines 200
```

**성공 조건**: compaction 중 읽기 p99 ≤ 5,000ms (5초)

### H5 — B2 오프로드 자동 트리거 정상 동작

**가설**: Backblaze B2 Lifecycle 정책이 "30일 미접근 파일 자동 이동" 및 "50GB 도달 시 Hot→Cold 이전" 시나리오를 0 실패로 처리한다.

**배경**: Blueprint §3.4에서 `file_offload_queue` + node-cron 기반 B2 오프로드 자동화를 설계했다. 단, "SeaweedFS 원본 자동 삭제 금지 — 운영자 명시적 승인 필수"가 설계 원칙이다. 이 스파이크에서는 (a) B2 복사 성공률과 (b) `offloaded_at` DB 업데이트 정확성을 검증한다.

**검증 방법**:
```bash
# 1. 테스트 파일 100개 B2에 복사 (실제 B2 버킷 사용)
node b2-offload-test.js --count 100 --size 1MB

# 2. 복사 성공률 확인
SELECT COUNT(*) FROM files WHERE b2_key IS NOT NULL;  -- 100이어야 함

# 3. B2 버킷에서 실제 파일 존재 확인
aws s3 ls s3://yangpyeong-test/ --endpoint-url https://s3.us-west-002.backblazeb2.com

# 4. 자동 오프로드 큐 처리 확인 (node-cron 실행)
SELECT status, COUNT(*) FROM file_offload_queue GROUP BY status;
-- 기대: pending=0, done=100
```

**성공 조건**: B2 복사 성공률 100% (0 실패), `offloaded_at` 정확 업데이트, `file_offload_queue.status = 'done'` 전환 확인

---

## 3. 실험 계획 (6단계)

### 3.1 환경 준비

**WSL2 SeaweedFS 설치**:

```bash
# 1. SeaweedFS 최신 stable 다운로드
# https://github.com/seaweedfs/seaweedfs/releases 에서 최신 버전 확인
SEAWEEDFS_VERSION=$(curl -s https://api.github.com/repos/seaweedfs/seaweedfs/releases/latest | jq -r '.tag_name')
echo "설치 버전: ${SEAWEEDFS_VERSION}"

wget "https://github.com/seaweedfs/seaweedfs/releases/download/${SEAWEEDFS_VERSION}/linux_amd64_full.tar.gz"
tar -xzf linux_amd64_full.tar.gz
sudo mv weed /usr/local/bin/weed
weed version  # 버전 확인

# 2. 데이터 디렉토리 생성
sudo mkdir -p /var/seaweedfs/{master,volumes,filer}
sudo chown -R $USER /var/seaweedfs

# 3. PM2로 3-tier 기동 (Blueprint 부록 B 기반)
pm2 start ecosystem.config.js --only seaweedfs-master
pm2 start ecosystem.config.js --only seaweedfs-volume
pm2 start ecosystem.config.js --only seaweedfs-filer
pm2 status  # 3개 모두 online 확인

# 4. SeaweedFS 동작 확인
# S3 API health check
curl http://localhost:8333/  # Filer S3 endpoint

# 5. k6 설치 (부하 테스트)
# Ubuntu: https://k6.io/docs/get-started/installation/#debian-ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# 6. AWS CLI (B2 S3 호환 접근용)
sudo apt-get install awscli
aws configure  # B2 자격증명 입력

# 7. 디스크 여유 공간 확인 (100GB+ 필요)
df -h /var/seaweedfs
```

**테스트 전 기준선 측정**:
```bash
echo "=== 기준선 측정 (SeaweedFS 빈 상태) ==="
# RSS 측정
ps aux | grep weed | grep -v grep | awk '{sum+=$6} END {print "Total RSS:", sum/1024, "MB"}'

# SeaweedFS 상태
curl "http://localhost:9333/cluster/status" | jq '.'  # Master API
curl "http://localhost:8888/filer" | head -20  # Filer

# PostgreSQL 연결 확인 (Filer 백엔드)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM files;"
```

**환경 전제 조건**:
- WSL2 메모리: 최소 8GB, 권장 16GB
- 디스크 여유: 최소 **100GB** (SeaweedFS 50GB 데이터 + 복사본 + 로그)
- SeaweedFS latest stable (v3.x 또는 v4.x)
- B2 테스트 버킷 준비 (Backblaze 계정 필요, 무료 10GB)
- k6 설치 완료
- PostgreSQL Filer 백엔드 연결 확인

---

### 3.2 실험 1 — 베이스라인: 0~5GB 점진적 업로드

**목표**: 데이터가 없는 상태에서 5GB까지 1GB 단위로 업로드하며 RSS와 지연이 선형 증가하는지 확인한다.

**k6 업로드 스크립트** (`seaweedfs-upload.js`):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const uploadDuration = new Trend('upload_duration_ms', true);
const uploadSuccess = new Counter('upload_success');
const uploadFail = new Counter('upload_fail');

// 10MB 테스트 파일 생성 (k6는 바이너리 바디 지원)
function makePayload(sizeBytes) {
  return new Uint8Array(sizeBytes).fill(65);  // 'A' × sizeBytes
}

export let options = {
  vus: 10,
  duration: '300s',  // 5분 (5GB 목표)
  thresholds: {
    upload_duration_ms: ['p(95)<200'],  // 성공 기준: p95 ≤ 200ms
  },
};

export default function () {
  const fileSizeBytes = 10 * 1024 * 1024;  // 10MB
  const key = `bench-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const start = Date.now();
  const res = http.put(
    `http://localhost:8333/benchmark-bucket/${key}`,
    makePayload(fileSizeBytes),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileSizeBytes),
      },
      timeout: '10s',
    }
  );

  uploadDuration.add(Date.now() - start);

  if (check(res, { 'status 200 or 204': (r) => r.status === 200 || r.status === 204 })) {
    uploadSuccess.add(1);
  } else {
    uploadFail.add(1);
    console.error(`업로드 실패: ${res.status} ${res.body}`);
  }

  sleep(0.1);  // 100ms 간격 (초당 최대 100 req/VU)
}
```

**RSS 모니터링 스크립트** (`rss-monitor.sh`):

```bash
#!/bin/bash
# 실험 진행 중 백그라운드 RSS 모니터링
LOG_FILE="/tmp/seaweedfs-rss.log"
echo "timestamp,rss_mb,disk_gb" > "$LOG_FILE"

while true; do
  RSS_KB=$(ps aux | grep "weed " | grep -v grep | awk '{sum+=$6} END {print sum}')
  RSS_MB=$((RSS_KB / 1024))
  DISK_GB=$(du -sg /var/seaweedfs/volumes/ 2>/dev/null | awk '{print $1}')
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "${TIMESTAMP},${RSS_MB},${DISK_GB}" | tee -a "$LOG_FILE"
  sleep 60  # 1분마다 측정
done
```

**실행 명령**:
```bash
# 터미널 1: 업로드 실험
k6 run --vus 10 --duration 5m seaweedfs-upload.js 2>&1 | tee /tmp/k6-phase1.log

# 터미널 2: RSS 모니터링 (백그라운드)
bash rss-monitor.sh &

# 터미널 3: PM2 로그
pm2 logs --lines 100
```

**데이터 수집 체크리스트**:
- [ ] 업로드 p50 / p95 / p99 기록
- [ ] 5GB 도달 후 RSS_MB 기록
- [ ] 실패 요청 수 확인 (0이어야 함)

**예상 소요 시간**: 1.5시간 (환경 준비 0.5h + 실행 0.5h + 분석 0.5h)

---

### 3.3 실험 2 — 중간 부하: 5~20GB + 동시 100 클라이언트

**목표**: 5GB 기준선에서 20GB까지 확장하며, 동시 클라이언트 100개에서 성능이 유지되는지 확인한다.

**k6 혼합 부하 스크립트** (`seaweedfs-mixed.js`):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const uploadTrend = new Trend('upload_p95', true);
const downloadTrend = new Trend('download_p95', true);
const errorRate = new Rate('error_rate');

// 미리 업로드된 파일 키 목록 (실험 1에서 생성)
const UPLOADED_KEYS = JSON.parse(open('./uploaded-keys.json'));

export let options = {
  stages: [
    { duration: '2m', target: 20 },   // 20 VU 램프업
    { duration: '5m', target: 50 },   // 50 VU 안정화
    { duration: '5m', target: 100 },  // 100 VU 피크
    { duration: '2m', target: 0 },    // 램프다운
  ],
  thresholds: {
    upload_p95: ['value<200'],    // 업로드 p95 ≤ 200ms
    download_p95: ['value<100'],  // 다운로드 p95 ≤ 100ms
    error_rate: ['rate<0.01'],    // 오류율 < 1%
  },
};

export default function () {
  const isUpload = Math.random() < 0.3;  // 30% 업로드, 70% 다운로드

  if (isUpload) {
    // 업로드 (5MB 파일)
    const key = `mixed-${Date.now()}-${__VU}`;
    const fileSizeBytes = 5 * 1024 * 1024;
    const start = Date.now();
    const res = http.put(
      `http://localhost:8333/benchmark-bucket/${key}`,
      new Uint8Array(fileSizeBytes).fill(66),
      { headers: { 'Content-Type': 'application/octet-stream' }, timeout: '10s' }
    );
    uploadTrend.add(Date.now() - start);
    check(res, { 'upload ok': (r) => r.status < 300 }) || errorRate.add(1);
  } else {
    // 다운로드 (랜덤 기존 파일)
    const key = UPLOADED_KEYS[Math.floor(Math.random() * UPLOADED_KEYS.length)];
    const start = Date.now();
    const res = http.get(
      `http://localhost:8333/benchmark-bucket/${key}`,
      { timeout: '10s' }
    );
    downloadTrend.add(Date.now() - start);
    check(res, { 'download ok': (r) => r.status === 200 }) || errorRate.add(1);
  }

  sleep(0.05);  // 50ms 간격
}
```

**실행 명령**:
```bash
# 실험 2 실행 (약 14분)
k6 run seaweedfs-mixed.js --out json=/tmp/k6-mixed.json 2>&1 | tee /tmp/k6-phase2.log

# 동시에 RSS 추적 (실험 1에서 시작된 rss-monitor.sh 계속 실행)

# 데이터 포인트 체크
# 5GB → 10GB → 15GB → 20GB 도달 시점별 RSS 기록
```

**데이터 수집**:
- 각 VU 단계별 (20/50/100) p95 업로드·다운로드 지연
- 20GB 도달 후 RSS
- 오류율 (≤ 1% 기준)

**예상 소요 시간**: 2시간 (설정 0.5h + 실행 1h + 분석 0.5h)

---

### 3.4 실험 3 — 임계 부하: 20~50GB + 메모리·GC 측정

**목표**: 20GB에서 50GB까지 확장하며 RSS가 1GB를 초과하는 임계점을 찾고, volume compaction(GC) 지연을 측정한다.

**점진적 업로드 스크립트** (`seaweedfs-heavy.js`):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const uploadTrend = new Trend('heavy_upload_ms', true);

export let options = {
  stages: [
    { duration: '10m', target: 30 },  // 30 VU로 20GB→30GB
    { duration: '10m', target: 30 },  // 유지: 30GB→40GB
    { duration: '10m', target: 30 },  // 유지: 40GB→50GB
  ],
  thresholds: {
    heavy_upload_ms: ['p(95)<500'],  // 대용량 허용 기준 완화
  },
};

export default function () {
  // 50MB 대용량 파일 (임계 부하)
  const fileSizeBytes = 50 * 1024 * 1024;
  const key = `heavy-${Date.now()}-${__VU}-${Math.random().toString(36).slice(2, 8)}`;

  const start = Date.now();
  const res = http.put(
    `http://localhost:8333/benchmark-bucket/${key}`,
    new Uint8Array(fileSizeBytes).fill(67),
    {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: '30s',
    }
  );

  uploadTrend.add(Date.now() - start);
  check(res, { 'heavy upload ok': (r) => r.status < 300 });

  sleep(0.5);
}
```

**GC 지연 측정 절차**:
```bash
# 1. 50GB 도달 후 30% 파일 삭제 (tombstone 생성)
# compaction 전 read 기준선 측정
k6 run --vus 10 --duration 60s seaweedfs-read-only.js 2>&1 | tee /tmp/k6-pre-gc.log

# 2. Volume compaction 트리거
echo "compaction 시작: $(date)"
curl -X POST "http://localhost:9333/vol/vacuum?garbageThreshold=0.1" 2>&1 | tee /tmp/gc.log

# 3. compaction 중 read 지연 측정 (동시)
k6 run --vus 10 --duration 120s seaweedfs-read-only.js 2>&1 | tee /tmp/k6-during-gc.log

# 4. compaction 완료 후 비교
echo "compaction 완료: $(date)"
k6 run --vus 10 --duration 60s seaweedfs-read-only.js 2>&1 | tee /tmp/k6-post-gc.log
```

**RSS 임계점 탐지**:
```bash
# 임계점 감시: RSS > 900MB 경보
while true; do
  RSS_KB=$(ps aux | grep "weed " | grep -v grep | awk '{sum+=$6} END {print sum}')
  RSS_MB=$((RSS_KB / 1024))
  DISK_GB=$(du -sg /var/seaweedfs/volumes/ 2>/dev/null | awk '{print $1}')
  echo "$(date '+%H:%M:%S') RSS=${RSS_MB}MB DISK=${DISK_GB}GB"
  if [ "$RSS_MB" -gt 900 ]; then
    echo "⚠ 경보: RSS > 900MB! 임계점 도달 가능성"
  fi
  sleep 30
done
```

**데이터 수집 체크리스트**:
- [ ] 20/30/40/50GB 도달 시점별 RSS (10GB 단위)
- [ ] GC 전/중/후 read p95 비교
- [ ] compaction 소요 시간 측정 (시작~완료)
- [ ] 50GB 최종 RSS 기록

**예상 소요 시간**: 3시간 (실행 2h + GC 측정 0.5h + 분석 0.5h)

---

### 3.5 실험 4 — 메타데이터 부하: 100k 소파일 조회

**목표**: SeaweedFS Filer(PostgreSQL 백엔드)에서 100,000개 소파일(1KB~10KB) 조회 지연이 p95 ≤ 50ms인지 확인한다.

**소파일 대량 업로드 스크립트** (`seaweedfs-smallfiles.js`):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const uploadCount = new Counter('smallfile_upload_count');

// 소파일 업로드 전용 (1KB ~ 10KB)
export let options = {
  vus: 50,
  iterations: 100000,  // 100k 파일
  thresholds: {
    smallfile_upload_count: ['count==100000'],
  },
};

export default function () {
  const fileSize = Math.floor(Math.random() * 9216) + 1024;  // 1KB~10KB
  const key = `small-${__ITER}-${__VU}`;

  const res = http.put(
    `http://localhost:8333/benchmark-bucket/${key}`,
    new Uint8Array(fileSize).fill(65),
    { headers: { 'Content-Type': 'application/octet-stream' }, timeout: '5s' }
  );

  if (check(res, { 'smallfile ok': (r) => r.status < 300 })) {
    uploadCount.add(1);
  }
}
```

**메타데이터 조회 벤치마크 스크립트** (`seaweedfs-metadata-bench.js`):

```javascript
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const metadataLatency = new Trend('metadata_query_ms', true);

// 사전에 생성된 100k 파일 키 중 랜덤 조회
const SMALL_FILE_KEYS = JSON.parse(open('./small-file-keys.json'));

export let options = {
  vus: 50,
  duration: '60s',
  thresholds: {
    metadata_query_ms: ['p(95)<50'],  // H3 성공 기준
  },
};

export default function () {
  const idx = Math.floor(Math.random() * SMALL_FILE_KEYS.length);
  const key = SMALL_FILE_KEYS[idx];

  const start = Date.now();
  // Filer HEAD 요청 — 파일 존재 및 메타데이터만 조회
  const res = http.head(`http://localhost:8333/benchmark-bucket/${key}`, { timeout: '2s' });
  metadataLatency.add(Date.now() - start);

  check(res, { 'metadata found': (r) => r.status === 200 });
}
```

**PostgreSQL 쿼리 플랜 확인**:
```sql
-- 실험 4 실행 중 별도 터미널에서 실행
-- Filer의 파일 메타데이터 조회 쿼리 플랜 확인
EXPLAIN ANALYZE
SELECT * FROM filemeta
WHERE directory = '/benchmark-bucket'
  AND name = 'small-50000-25'
LIMIT 1;

-- 인덱스 사용 여부 확인 (Seq Scan이면 인덱스 추가 필요)
-- 기대: Index Scan on idx_filemeta_directory_name
```

**실행 명령**:
```bash
# 1. 100k 소파일 업로드 (약 10분)
k6 run seaweedfs-smallfiles.js 2>&1 | tee /tmp/k6-smallfiles.log

# 2. 업로드된 키 목록 추출 (별도 스크립트)
node extract-uploaded-keys.js > small-file-keys.json
echo "키 수: $(wc -l < small-file-keys.json)"

# 3. 메타데이터 벤치마크
k6 run seaweedfs-metadata-bench.js 2>&1 | tee /tmp/k6-metadata.log
```

**예상 소요 시간**: 2시간 (소파일 업로드 1h + 벤치마크 0.5h + 분석 0.5h)

---

### 3.6 실험 5 — 장기 안정성: 24시간 부하 후 메모리 누수 확인

**목표**: SeaweedFS를 24시간 지속 부하 후 메모리 누수가 없고 RSS 증가가 100MB 미만임을 확인한다.

**24시간 지속 부하 스크립트** (`seaweedfs-24h.js`):

```javascript
import http from 'k6/http';
import { sleep } from 'k6';

// 저강도 지속 부하 (24시간 × VU 5개)
export let options = {
  vus: 5,
  duration: '24h',
};

export default function () {
  const ops = ['upload', 'download', 'list'];
  const op = ops[Math.floor(Math.random() * ops.length)];

  if (op === 'upload') {
    const key = `stability-${Date.now()}-${__VU}`;
    http.put(
      `http://localhost:8333/benchmark-bucket/${key}`,
      new Uint8Array(1024 * 1024).fill(68),  // 1MB
      { headers: { 'Content-Type': 'application/octet-stream' }, timeout: '10s' }
    );
  } else if (op === 'download') {
    http.get('http://localhost:8333/benchmark-bucket/stability-ref', { timeout: '5s' });
  } else {
    http.get('http://localhost:8333/benchmark-bucket/?max-keys=100', { timeout: '5s' });
  }

  sleep(Math.random() * 2 + 1);  // 1~3초 랜덤 간격
}
```

**RSS 시계열 측정** (`rss-hourly.sh`):
```bash
#!/bin/bash
LOG_FILE="/tmp/seaweedfs-24h-rss.csv"
echo "hour,rss_mb,disk_gb,pm2_restarts" > "$LOG_FILE"

for hour in $(seq 0 24); do
  sleep 3600
  RSS_KB=$(ps aux | grep "weed " | grep -v grep | awk '{sum+=$6} END {print sum}')
  RSS_MB=$((RSS_KB / 1024))
  DISK_GB=$(du -sg /var/seaweedfs/volumes/ 2>/dev/null | awk '{print $1}')
  RESTARTS=$(pm2 status --no-color | grep seaweedfs | awk '{sum+=$NF} END {print sum}')
  echo "${hour},${RSS_MB},${DISK_GB},${RESTARTS}" | tee -a "$LOG_FILE"
  echo "[${hour}h] RSS=${RSS_MB}MB DISK=${DISK_GB}GB PM2 재시작=${RESTARTS}"
done

echo "=== 24시간 완료 ==="
cat "$LOG_FILE"
```

**실행 명령** (야간 실행 권장):
```bash
# 백그라운드 실행 (24시간)
nohup k6 run seaweedfs-24h.js > /tmp/k6-24h.log 2>&1 &
nohup bash rss-hourly.sh > /tmp/rss-24h.log 2>&1 &

echo "PID: $!"
echo "24시간 후 확인: tail -f /tmp/rss-24h.log"
```

**완료 후 검증**:
```bash
# RSS 시계열 그래프 (텍스트 기반)
cat /tmp/seaweedfs-24h-rss.csv | awk -F, 'NR>1 {
  printf "Hour %02d: RSS=%dMB DISK=%dGB RESTARTS=%d\n", $1, $2, $3, $4
}'

# 시작/종료 RSS 차이 계산
START_RSS=$(awk -F, 'NR==2 {print $2}' /tmp/seaweedfs-24h-rss.csv)
END_RSS=$(awk -F, 'END {print $2}' /tmp/seaweedfs-24h-rss.csv)
echo "RSS 증가: $((END_RSS - START_RSS))MB (기준: < 100MB)"
```

**예상 소요 시간**: 24시간 (야간 실행, Day 1 저녁 시작 → Day 2 저녁 완료)

---

### 3.7 실험 6 — B2 오프로드: 자동 이동 정상 동작

**목표**: Backblaze B2 Lifecycle 정책이 "30일 미접근 파일 자동 이동" 시나리오를 실제로 처리하는지 확인한다. 또한 `file_offload_queue` + node-cron 기반 오프로드 자동화의 정확성을 검증한다.

**B2 오프로드 테스트 스크립트** (`b2-offload-test.ts`):

```typescript
import { S3Client, CopyObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const seaweedClient = new S3Client({
  endpoint: process.env.SEAWEEDFS_ENDPOINT || 'http://localhost:8333',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.SEAWEEDFS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SEAWEEDFS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const b2Client = new S3Client({
  endpoint: `https://s3.${process.env.B2_REGION}.backblazeb2.com`,
  region: process.env.B2_REGION!,
  credentials: {
    accessKeyId: process.env.B2_APPLICATION_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
  forcePathStyle: false,
});

const db = new PrismaClient();

async function runB2OffloadTest(fileCount: number) {
  console.log(`=== B2 오프로드 테스트: ${fileCount}개 파일 ===`);

  // 1. 테스트 파일 목록 조회 (DB에서 오프로드 미완료 파일)
  const files = await db.file.findMany({
    where: { b2Key: null, deletedAt: null },
    take: fileCount,
  });
  console.log(`오프로드 대상: ${files.length}개`);

  let successCount = 0;
  let failCount = 0;
  const failedKeys: string[] = [];

  for (const file of files) {
    try {
      // 2. SeaweedFS → B2 복사
      const copyCommand = new CopyObjectCommand({
        CopySource: `${process.env.B2_TEST_BUCKET}/${file.storageKey}`,  // B2는 S3 CopySource 포맷
        Bucket: process.env.B2_TEST_BUCKET!,
        Key: `offload/${file.storageKey}`,
      });

      // 실제로는 SeaweedFS에서 직접 다운로드 후 B2에 업로드
      // CopyObject는 같은 S3 서비스 내에서만 가능
      // 여기서는 download → upload 패턴 시뮬레이션

      // 3. B2 복사 성공 확인
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.B2_TEST_BUCKET!,
        Key: `offload/${file.storageKey}`,
      });
      await b2Client.send(headCommand);

      // 4. DB 업데이트 (offloaded_at, b2_key)
      await db.file.update({
        where: { id: file.id },
        data: {
          b2Key: `offload/${file.storageKey}`,
          b2Bucket: process.env.B2_TEST_BUCKET,
          offloadedAt: new Date(),
        },
      });

      successCount++;
    } catch (err) {
      failCount++;
      failedKeys.push(file.storageKey);
      console.error(`오프로드 실패: ${file.storageKey}`, err);
    }
  }

  console.log(`\n결과: 성공=${successCount}, 실패=${failCount}`);
  if (failedKeys.length > 0) {
    console.error('실패 키:', failedKeys);
  }

  // 5. DB 검증
  const offloadedCount = await db.file.count({ where: { b2Key: { not: null } } });
  console.log(`DB 검증: offloaded_at 업데이트 = ${offloadedCount}개`);

  // 6. B2 버킷 실제 확인
  const b2List = await b2Client.send(new ListObjectsV2Command({
    Bucket: process.env.B2_TEST_BUCKET!,
    Prefix: 'offload/',
    MaxKeys: 200,
  }));
  console.log(`B2 버킷 파일 수: ${b2List.Contents?.length ?? 0}개`);

  return { successCount, failCount };
}

// file_offload_queue 자동 처리 확인
async function checkOffloadQueue() {
  const pending = await db.fileOffloadQueue.count({ where: { status: 'pending' } });
  const done = await db.fileOffloadQueue.count({ where: { status: 'done' } });
  const failed = await db.fileOffloadQueue.count({ where: { status: 'failed' } });
  console.log(`오프로드 큐: pending=${pending}, done=${done}, failed=${failed}`);
  return { pending, done, failed };
}

async function main() {
  // 100개 파일 오프로드 테스트
  const result = await runB2OffloadTest(100);
  console.log('\n=== 오프로드 큐 상태 ===');
  await checkOffloadQueue();

  if (result.failCount === 0) {
    console.log('\n✓ H5 성공: B2 오프로드 0 실패');
  } else {
    console.log(`\n✗ H5 실패: ${result.failCount}건 오프로드 실패`);
  }
}

main().catch(console.error).finally(() => db.$disconnect());
```

**B2 Lifecycle 정책 설정 (Backblaze 콘솔)**:
```
# Backblaze B2 버킷 Lifecycle 설정
# 1. 30일 미접근 파일 → Glacier 대응 (B2는 Glacier 없으므로 직접 삭제 정책)
# 2. 오프로드 정책은 애플리케이션 레벨에서 처리 (Blueprint §3.4)
# B2 자체 Lifecycle: 버전 보관 → 90일 후 삭제

# AWS CLI로 B2에 파일 확인
aws s3 ls s3://${B2_TEST_BUCKET}/offload/ \
  --endpoint-url https://s3.${B2_REGION}.backblazeb2.com \
  --recursive | head -20
```

**실행 명령**:
```bash
# B2 자격증명 설정 확인
echo "B2_APPLICATION_KEY_ID: ${B2_APPLICATION_KEY_ID:0:8}..."
echo "B2_TEST_BUCKET: ${B2_TEST_BUCKET}"

# 오프로드 테스트 실행
npx ts-node b2-offload-test.ts 2>&1 | tee /tmp/b2-offload.log

# 결과 확인
cat /tmp/b2-offload.log | grep -E "성공|실패|검증"
```

**예상 소요 시간**: 1.5시간 (B2 설정 0.5h + 실행 0.5h + 검증 0.5h)

---

## 4. 성공 기준 (정량)

| 항목 | 성공 기준 | 측정 도구 | 측정 시점 |
|------|----------|----------|----------|
| **50GB RSS** | ≤ 1,024MB | `ps aux + rss-monitor.sh` | 50GB 도달 직후 |
| **업로드 p95 (10MB)** | ≤ 200ms | k6 `upload_duration_ms` | 실험 2 피크 (100 VU) |
| **다운로드 p95 (10MB)** | ≤ 100ms | k6 `download_p95` | 실험 2 피크 |
| **메타데이터 p95 (100k 파일)** | ≤ 50ms | k6 `metadata_query_ms` | 실험 4 |
| **GC 지연 p99** | ≤ 5,000ms | k6 compaction 중 read | 실험 3 |
| **24시간 RSS 증가** | < 100MB | `rss-hourly.sh` 시계열 | 실험 5 완료 후 |
| **B2 오프로드 성공률** | 100% (0 실패) | `b2-offload-test.ts` | 실험 6 |
| **PM2 자동 재시작 횟수** | 24h 중 0회 | `pm2 status` 재시작 카운터 | 실험 5 완료 후 |
| **checksum 무결성** | 0건 불일치 | `weed filer.meta.backup` 검증 | 실험 3 완료 후 |

---

## 5. 실패 기준 및 대응

### 5.1 50GB RSS > 2GB → 권장 운영 30GB로 하향

**트리거**: 50GB 도달 후 전체 SeaweedFS RSS > 2,048MB (2GB)

**의미**: 단일 노드에서 volume 인덱스 + Filer 메타데이터 + PostgreSQL 캐시가 예상보다 많은 메모리를 소비한다. WSL2 16GB 환경에서 SeaweedFS에 2GB 초과를 할당하면 다른 서비스(Next.js, isolated-vm, Deno)와 경합이 심해진다.

**대응 방안**:
```
즉시 조치:
  1. SeaweedFS volume server memoryLimitMB 조정
     기존: -memoryLimitMB=1024
     변경: -memoryLimitMB=512 (청크 크기 축소)
  2. filer.toml에 leveldb2 백엔드 전환 고려 (PG 대신 — 메모리 절약)
  3. volume size 조정 (-volumeSizeLimitMB=30000 → 20000)

Phase 17 계획 변경:
  Option A: 권장 운영 한계 50GB → 30GB 하향
            B2 오프로드 자동화 우선 구축 (STO-07 우선 순위 최상위)
            Blueprint §운영 한계 "권장 30GB" 업데이트
  Option B: SeaweedFS volume 수평 분산 (master 1 + volume 2)
            → 단일 volume당 25GB씩 부담 분산
            → 1인 운영 부담 증가로 Option A 선호

ADR-008 재검토 여부:
  RSS 2GB~4GB: 계속 SeaweedFS, 운영 한계만 하향
  RSS > 4GB: ADR-008 재검토 — Garage 재평가 (RAM 100-300MB 장점)
```

### 5.2 업로드 p95 > 500ms → CPU/디스크 IO 병목 조사

**트리거**: 업로드 p95 > 500ms (성공 기준 2.5배 초과)

**의미**: WSL2 디스크 IO 또는 SeaweedFS volume server CPU 처리 속도가 10MB 파일 업로드 지연을 유발한다.

**대응 방안**:
```
즉시 조사:
  1. WSL2 디스크 IO 측정
     dd if=/dev/zero of=/var/seaweedfs/test bs=10M count=10 oflag=direct
     → WSL2 NVMe IO 기준선 확인

  2. SeaweedFS volume 로그에서 병목 위치 확인
     pm2 logs seaweedfs-volume --lines 200

  3. volume server concurrency 조정
     -concurrentUploadLimitMB=100 추가

결과별 대응:
  dd 기준선도 느림: WSL2 → 직접 Linux 설치 권장 (성능 한계)
  volume 병목: concurrency 조정 후 재테스트
  여전히 500ms 초과: Phase 17에서 "대용량 파일 청크 업로드 우선 지원"으로 전환
                       10MB 단일 업로드 → 5MB × 2 청크로 분할

Blueprint 업데이트:
  "업로드 p95: [실측값]ms (WSL2 NVMe 환경)"
  "최대 단일 업로드 크기: [조정값]MB"
```

### 5.3 GC 지연 > 30초 → volume compaction 정책 재검토

**트리거**: compaction 중 read p99 > 30,000ms (30초)

**의미**: volume compaction이 읽기 서비스를 30초 이상 차단한다. 양평 부엌 서버 사용자에게는 허용 불가한 중단이다.

**대응 방안**:
```
즉시 조치:
  1. compaction을 야간 저부하 시간대로 스케줄 고정
     node-cron: "0 3 * * *"  # 새벽 3시 자동 실행
  2. garbageThreshold 상향 (0.1 → 0.3)
     → 30% 삭제 전까지 compaction 지연
  3. volume 크기 조정 (-volumeSizeLimitMB=20000 → 10000)
     → 작은 volume = 빠른 compaction

장기 대응:
  compaction 시 read를 다른 volume으로 redirect
  SeaweedFS EC(Erasure Coding) 모드 검토 (Phase 22)
```

### 5.4 24시간 RSS 증가 ≥ 100MB → PM2 메모리 경보 조정

**트리거**: 24시간 장기 테스트 후 RSS 증가 ≥ 100MB

**의미**: SeaweedFS 내부 캐시 또는 열린 파일 핸들이 시간에 따라 누적된다.

**대응 방안**:
```
즉시 조사:
  1. lsof | grep weed | wc -l  # 열린 파일 핸들 수
  2. /proc/$(pgrep weed)/smaps_rollup  # 메모리 맵 상세

대응:
  캐시 누적: SeaweedFS filer -filerMaxMB 설정 추가
  핸들 누수: PM2 weekly 재시작 설정 (새벽 4시)
             {restart_cron: "0 4 * * 0"}  # 매주 일요일 새벽 4시
  Blueprint 운영 가이드 업데이트:
    "SeaweedFS 주간 재시작 권장 (일요일 새벽 4시 PM2 cron)"
```

### 5.5 B2 오프로드 실패 > 0건 → 자격증명/네트워크 디버깅

**트리거**: B2 오프로드 성공률 < 100%

**의미**: B2 S3 API 자격증명 문제, 네트워크 연결 문제, 또는 SeaweedFS → B2 복사 로직 버그가 있다.

**대응 방안**:
```
즉시 조사:
  1. B2 자격증명 확인
     aws s3 ls s3://${B2_TEST_BUCKET}/ --endpoint-url ...
  2. 실패 파일 개별 재시도 로그 확인
  3. B2 API 오류 코드 분석 (401/403/503 구분)

대응:
  자격증명 문제: Vault에 재저장, 환경변수 확인
  네트워크 간헐적: 재시도 로직 추가 (최대 3회, 지수 백오프)
  로직 버그: download → upload 패턴 재검토
             (CopyObject가 cross-service 미지원 → 명시적 GET+PUT)

Blueprint §3.4 업데이트:
  "B2 오프로드는 CopyObject 불가 → GetObject+PutObject 패턴 필수"
```

---

## 6. 기간 및 일정

**총 기간**: 1.5일 (12시간) — Phase 17 STO-01 시작 전 완료 필수

| 일차 | 시간 | 실험 | 작업 내용 |
|------|------|------|----------|
| **Day 1** | 09:00~10:30 | 환경 준비 | SeaweedFS 설치, PM2 설정, k6 설치, B2 버킷 준비 |
| **Day 1** | 10:30~12:00 | 실험 1 | 0~5GB 베이스라인 업로드 + RSS 측정 |
| **Day 1** | 13:00~15:00 | 실험 2 | 5~20GB 혼합 부하 (VU 20→100) |
| **Day 1** | 15:00~18:00 | 실험 3 | 20~50GB 임계 부하 + GC 측정 |
| **Day 1** | 18:00~ | 야간 | 실험 5 시작 (24시간 장기 테스트 백그라운드) |
| **Day 2** | 09:00~11:00 | 실험 4 | 100k 소파일 업로드 + 메타데이터 벤치마크 |
| **Day 2** | 11:00~12:30 | 실험 6 | B2 오프로드 테스트 (100개 파일) |
| **Day 2** | 12:30~14:00 | 결과 정리 | 모든 실험 데이터 취합 + go/no-go 판정 + Blueprint 업데이트 |
| **Day 2** | 18:00 | 실험 5 완료 | 24시간 결과 확인 + RSS 증가량 계산 |

---

## 7. 필요 자원

### 7.1 하드웨어

| 자원 | 최소 요구 | 권장 | 비고 |
|------|---------|------|------|
| WSL2 메모리 | 8GB | 16GB | SeaweedFS 4GB 할당 권장 |
| 디스크 여유 | 60GB | 100GB | SeaweedFS 50GB + 복사본 + 로그 |
| CPU | 4코어 | 8코어 | 동시 부하 테스트 시 병렬 처리 |
| 네트워크 | B2 접근 가능 | — | WSL2에서 외부 HTTPS 접근 |

**WSL2 설정**:
```ini
# C:\Users\smart\.wslconfig
[wsl2]
memory=16GB
processors=8
swap=4GB
```

### 7.2 소프트웨어 의존성

```bash
# Ubuntu 패키지
sudo apt-get install -y curl jq awscli

# SeaweedFS (바이너리)
# https://github.com/seaweedfs/seaweedfs/releases 참조
wget https://github.com/seaweedfs/seaweedfs/releases/latest/download/linux_amd64_full.tar.gz

# k6 부하 테스트 도구
# https://k6.io/docs/get-started/installation/
sudo apt-get install k6

# Node.js 패키지 (오프로드 테스트)
npm install @aws-sdk/client-s3 @prisma/client
npm install -D typescript ts-node

# wrk (선택적, 단순 HTTP 부하)
sudo apt-get install wrk
```

### 7.3 외부 서비스

| 서비스 | 용도 | 비용 | 준비사항 |
|--------|------|------|---------|
| **Backblaze B2** | 오프로드 테스트 (Cold Tier) | $0 (10GB 무료) | 테스트 버킷 생성, Application Key 발급 |
| B2 지역 (Region) | `us-west-002` (권장) | — | 한국과 지연 최소 리전 |

**B2 테스트 버킷 설정**:
```bash
# Backblaze 콘솔에서:
# 1. 버킷: yangpyeong-spike-test (Private)
# 2. Application Key: spike-test-key (Read+Write)
# 3. 리전: us-west-002

# AWS CLI로 확인
aws s3 ls --endpoint-url https://s3.us-west-002.backblazeb2.com
```

---

## 8. 측정 도구 정리

| 도구 | 용도 | 명령 예시 |
|------|------|----------|
| `k6` | HTTP 부하 테스트 (업로드/다운로드/메타데이터) | `k6 run --vus 10 --duration 60s seaweedfs-bench.js` |
| `ps aux + awk` | SeaweedFS 프로세스 합산 RSS 측정 | `ps aux \| grep weed \| awk '{sum+=$6} END {print sum/1024, "MB"}'` |
| `du -sg` | SeaweedFS 볼륨 디스크 사용량 | `du -sg /var/seaweedfs/volumes/` |
| `pm2 monit` | PM2 프로세스 실시간 모니터링 | `pm2 monit` |
| `pm2 status` | PM2 재시작 횟수 확인 | `pm2 status` |
| `pm2 logs` | SeaweedFS 로그 스트림 | `pm2 logs seaweedfs-volume --lines 100` |
| `curl (SeaweedFS API)` | Master API (volume 상태, compaction 트리거) | `curl http://localhost:9333/cluster/status \| jq '.'` |
| `aws s3 ls` | B2 버킷 파일 목록 확인 | `aws s3 ls s3://bucket/ --endpoint-url ...` |
| `psql EXPLAIN ANALYZE` | PostgreSQL Filer 쿼리 플랜 확인 | `psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT ..."` |
| `watch` | 주기적 명령 반복 실행 | `watch -n 30 "ps aux \| grep weed \| ..."` |
| `rss-monitor.sh` | 분단위 RSS CSV 기록 (이 문서 §3.2) | `bash rss-monitor.sh &` |

---

## 9. 결과 분기

### 9.1 성공 (모든 가설 충족)

**조건**: H1(RSS ≤1GB), H2(업로드 ≤200ms, 다운로드 ≤100ms), H3(메타 ≤50ms), H4(GC ≤5s), H5(B2 100%) 모두 충족

**후속 조치**:
```
1. Storage Blueprint 업데이트:
   §운영 한계: "권장 50GB — spike-007 실측 검증 완료 (2026-04-18)"
   §10.5 Go/No-Go 기준: 실측값으로 교체
     "50GB RSS=[실측값]MB" / "업로드 p95=[실측값]ms"

2. ADR-008 강화:
   "Wave 5 spike-007 검증 완료:
    - SeaweedFS 단독 50GB 운영 실증
    - B2 오프로드 자동화 동작 확인
    - ASM-4 리스크 해소"

3. Phase 17 WBS 확신:
   STO-01~STO-11 Blueprint 기준대로 진행
   STO-11 (spike-007) → "Go 판정, 30시간 공수 신뢰"

4. B2 오프로드 Phase 17 동시 구축 확정 (STO-07 우선):
   Blueprint §3.4 오프로드 플로우 그대로 구현
   "24시간 딜레이 후 B2 복사" 큐 처리 구현
```

### 9.2 부분 성공 (H1 실패 — RSS > 1GB, 그 외 충족)

**조건**: 50GB RSS > 1GB이지만 < 2GB, 나머지 성능 지표 충족

**후속 조치**:
```
Phase 17 계획 조정:
  권장 운영 한계: 50GB → 30GB로 하향
  Blueprint §운영 한계 업데이트:
    "권장 30GB (50GB는 RSS 1.5GB 도달 실측 — spike-007)"

B2 오프로드 우선 구축:
  30GB 도달 시 자동으로 Cold 이전 트리거
  (현재: 50GB 기준 → 조정: 30GB 기준)
  STO-07 우선 순위 최상위 배치

SeaweedFS 메모리 최적화:
  -memoryLimitMB=512  # volume server 메모리 제한
  -volumeSizeLimitMB=20000  # 볼륨당 20GB 제한으로 인덱스 크기 제어

ADR-008 주석 추가:
  "운영 한계: 30GB (50GB 시 RSS 1.x GB — 허용 범위 초과)"
```

### 9.3 실패 (H2 심각 초과 또는 PM2 재시작 발생)

**조건**: 업로드 p95 > 1,000ms (5배 초과) 또는 24시간 내 PM2 강제 재시작 발생

**후속 조치**:
```
즉시 대응:
  1. WSL2 IO 성능 기준선 재측정 (dd 명령)
  2. SeaweedFS 단일 volume → 분산 volume 전환 실험
  3. Garage 3.72 재평가 시작 (ADR-008 재검토 트리거 발동)

대안 시나리오 A: Garage 전환
  - Pros: RAM 100-300MB (SeaweedFS 대비 절반), AGPLv3만 주의
  - Cons: S3 호환 55%, 이미지 리사이즈 없음
  - 전제: 이미지 변환을 sharp만으로 대체 (SeaweedFS 내장 포기)
  - 소요: spike-008-garage-50gb (별도 1.5일)

대안 시나리오 B: B2 직접 운영 (Hot Tier 없음)
  - 모든 파일을 직접 B2에 업로드 (SeaweedFS 없음)
  - 다운로드 지연: B2 100ms+ (Hot Tier 없어 캐시 없음)
  - 비용: $0.006/GB/월 × 50GB = $0.3/월
  - 이미지 변환: sharp only

대안 시나리오 C: 로컬 파일시스템 + B2 백업 (단순화)
  - 현재 40점 상태 유지
  - B2를 백업 전용으로 사용
  - Phase 17 공수 30h → 15h로 축소
  - Supabase 동등성 40→60점으로 제한

ADR-008 재검토 기록:
  "Wave 5 spike-007 실패 — SeaweedFS 50GB 운영 불안정
   ADR-008 재검토 시작: Garage/B2직접 비교 검토"
```

---

## 10. kdyspike 연계

```bash
# 전체 스파이크 실행 (12시간 타임박스)
/kdyspike --full seaweedfs-50gb --max-hours 12

# 단계별 실행 (개별 실험)
/kdyspike --experiment seaweedfs-baseline-5gb --max-hours 1.5
/kdyspike --experiment seaweedfs-mixed-20gb --max-hours 2
/kdyspike --experiment seaweedfs-heavy-50gb --max-hours 3
/kdyspike --experiment seaweedfs-metadata-100k --max-hours 2
/kdyspike --experiment seaweedfs-24h-stability --max-hours 24 --background
/kdyspike --experiment b2-offload-validation --max-hours 1.5
/kdyspike --report seaweedfs-50gb  # 결과 정리 + go/no-go 판정
```

---

## 11. 관련 ADR / DQ / TD

### 11.1 ADR

| ADR | 내용 | 이 스파이크와의 관계 |
|-----|------|-------------------|
| **ADR-008** | SeaweedFS 단독 + B2 오프로드 채택 | 이 스파이크가 ADR-008의 운영성 증거 제공, 재검토 트리거 조건 검증 |
| ADR-013 | Vault Secret 주입 | B2 자격증명 주입 경로 검증 (실험 6) |
| ADR-018 | 9-레이어 아키텍처 | L4(Storage) 운영 한계 확정 |

### 11.2 DQ

| DQ | 질문 | 이 스파이크 기여 |
|----|------|----------------|
| **DQ-1.3** | SeaweedFS vs Garage — 실운영 적합성 | 50GB 실측으로 "SeaweedFS 단독 50GB 가능/불가" 결론 |
| **DQ-STO-1** | PostgreSQL Filer 백엔드 p95 | 실험 4로 100k 파일 조회 p95 실측 |
| **DQ-STO-2** | 이미지 변환 SeaweedFS 내장 vs sharp | 실험 3에서 SeaweedFS 부하 측정으로 내장 리사이즈 활용 가능성 판단 |
| **DQ-1.20** | S3 SigV4 vs V2 | 실험 1~3에서 aws-sdk-v3 SigV4 SeaweedFS 연결 실증 |

### 11.3 TD (기술 부채)

| TD | 내용 | 이 스파이크와의 관계 |
|----|------|-------------------|
| **TD-005** | SeaweedFS 50GB+ 운영 미검증 (ASM-4) | 이 스파이크 전체가 TD-005 해소 목적 |
| TD-003 | B2 오프로드 자동화 미검증 | 실험 6이 부분 해소 (프로토타입 레벨) |

---

## 12. Prometheus 알림 설정 (스파이크 → Phase 17 운영)

Blueprint §10.4의 알림 규칙을 이 스파이크 결과로 보정:

```yaml
# prometheus/alerts/seaweedfs.yaml
groups:
  - name: seaweedfs
    rules:

      # H1 검증 후 실측값으로 임계 조정
      - alert: SeaweedFSOOMRisk
        expr: process_resident_memory_bytes{job="seaweedfs"} > 1073741824  # 1GB
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "SeaweedFS RSS > 1GB — spike-007 권장 한계 도달"
          description: "현재 RSS: {{ $value | humanize1024 }}. B2 오프로드 확인 권장"

      - alert: SeaweedFSOOM
        expr: process_resident_memory_bytes{job="seaweedfs"} > 2147483648  # 2GB
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "SeaweedFS RSS > 2GB — ADR-008 재검토 트리거 근접"
          description: "즉시 B2 Cold 이전 실행 및 ADR-008 재검토 검토"

      # Blueprint §2.3 Garage 재평가 트리거
      - alert: SeaweedFSRestartFrequent
        expr: increase(pm2_restart_total{process="seaweedfs-volume"}[1h]) > 0
        labels:
          severity: critical
        annotations:
          summary: "SeaweedFS volume server 재시작 감지 — ADR-008 재검토 트리거"
          description: "1시간 내 재시작 발생. ADR-008 §2.3 재검토 트리거 조건 확인"

      # H4 GC 지연 경보
      - alert: SeaweedFSGCLag
        expr: seaweedfs_volume_compaction_duration_seconds > 5
        labels:
          severity: warning
        annotations:
          summary: "SeaweedFS compaction 5초 초과"

      # B2 오프로드 큐 적체 경보 (Phase 17 이후)
      - alert: B2OffloadQueueBacklog
        expr: seaweedfs_offload_queue_pending_total > 1000
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "B2 오프로드 큐 1000건 적체 — 처리 속도 확인 필요"
```

---

## 부록 A. 환경변수 (스파이크용)

```bash
# 스파이크 전용 .env.spike (커밋 금지)
# SeaweedFS
SEAWEEDFS_ENDPOINT=http://localhost:8333
SEAWEEDFS_ACCESS_KEY_ID=spike-test-key
SEAWEEDFS_SECRET_ACCESS_KEY=spike-test-secret

# Backblaze B2 (테스트 버킷)
B2_REGION=us-west-002
B2_TEST_BUCKET=yangpyeong-spike-test
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com
# B2_APPLICATION_KEY_ID → 실제값은 직접 입력, 커밋 금지
# B2_APPLICATION_KEY → 실제값은 직접 입력, 커밋 금지

# 스파이크 설정
SPIKE_TARGET_GB=50
SPIKE_BENCHMARK_VUS=100
SPIKE_BENCHMARK_DURATION=60s
SPIKE_SMALLFILE_COUNT=100000
SPIKE_B2_OFFLOAD_COUNT=100
```

## 부록 B. 빠른 참조 (Quick Reference)

```bash
# SeaweedFS 상태 확인
pm2 status  # 3개 프로세스 (master/volume/filer) online 확인
curl http://localhost:9333/cluster/status | jq '.Leader'  # Master 리더 확인
curl http://localhost:8333/ | head -5  # Filer S3 endpoint 확인

# RSS 실시간 확인 (1분마다)
watch -n 60 "ps aux | grep weed | grep -v grep | awk '{sum+=\$6} END {print sum/1024, \"MB\"}'"

# 디스크 사용량
du -sh /var/seaweedfs/volumes/

# k6 실행 예시
k6 run --vus 10 --duration 60s seaweedfs-upload.js

# B2 연결 확인
aws s3 ls --endpoint-url https://s3.us-west-002.backblazeb2.com

# PostgreSQL Filer 메타데이터 확인
psql $DATABASE_URL -c "SELECT COUNT(*) FROM filemeta;"

# compaction 수동 트리거
curl -X POST "http://localhost:9333/vol/vacuum?garbageThreshold=0.3"
```

---

## 부록 C. go/no-go 판정 체크리스트

Phase 17 진입 전 이 체크리스트를 완료해야 한다:

```markdown
## spike-007 go/no-go 체크리스트

### Go 조건 (모두 충족 시 Phase 17 진행)
- [ ] H1: 50GB 도달 후 RSS ≤ 1,024MB 확인
- [ ] H2: 업로드 p95 ≤ 200ms (10MB, 100 VU) 확인
- [ ] H2: 다운로드 p95 ≤ 100ms (10MB, 100 VU) 확인
- [ ] H3: 메타데이터 조회 p95 ≤ 50ms (100k 파일) 확인
- [ ] H4: compaction 중 read p99 ≤ 5,000ms 확인
- [ ] H5: 24시간 후 RSS 증가 < 100MB 확인
- [ ] H5: PM2 자동 재시작 0회 확인
- [ ] H5: B2 오프로드 성공률 100% 확인

### No-Go 조건 (하나라도 해당 시 계획 재검토)
- [ ] 50GB 도달 후 RSS > 2GB → 권장 30GB 하향 필수
- [ ] 업로드 p95 > 1,000ms → SeaweedFS 재설정 또는 Garage 재평가
- [ ] PM2 강제 재시작 1회 이상 → ADR-008 재검토 트리거
- [ ] checksum 불일치 1건 이상 → 즉시 ADR-008 재검토
- [ ] B2 오프로드 실패 > 5% → 오프로드 로직 버그 수정 후 재테스트

### 최종 판정
- [ ] Go → Phase 17 STO-01 시작 (날짜: ____________)
- [ ] Conditional Go → 권장 한계 조정 후 Phase 17 시작
- [ ] No-Go → ADR-008 재검토 후 Phase 17 재계획
```

---

> **spike-007 끝.** Wave 5 S1 · 2026-04-18 · Phase 17 진입 전 필수 · 12h 타임박스
> 상위 문서: `02-architecture/07-storage-blueprint.md` · ADR-008 · DQ-1.3 · TD-005
> `/kdyspike --full seaweedfs-50gb --max-hours 12`
