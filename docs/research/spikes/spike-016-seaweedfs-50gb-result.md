# SP-016 SeaweedFS 50GB 부하 테스트 — 축약 결과

- 실행일: 2026-04-19
- 상태: **Deferred (축약 문서화만 완료)**
- 판정: **Pending** — 물리 측정 별도 세션 필요
- 스펙: [`02-spike-priority-set.md` §8](../2026-04-supabase-parity/06-prototyping/02-spike-priority-set.md)
- 관련 ADR: ADR-008 (ASM-4 검증 대기)
- Phase 블로킹: Phase 17 Storage

---

## 1. 본 세션 미실행 이유

SP-016은 다음 필수:
1. **SeaweedFS binary 설치** — `weed` CLI 미설치 확인됨
2. **50GB 디스크 공간** — WSL2 환경에 50GB 여유 필요 (현재 상태 미확인)
3. **100MB × 500 파일 업로드** — 실측 ≥ 20분 (50MB/s 기준)
4. **B2 S3 호환 오프로드** — Backblaze B2 계정 + credentials
5. **SIGKILL recovery + md5sum 무결성 검증**

본 세션 자원 한계. 별도 세션 또는 전용 랩에서 수행.

---

## 2. Pre-flight 점검 결과

```bash
$ which weed
weed CLI 미설치
```

→ 우선 설치 필요:
```bash
# Linux/WSL2
wget https://github.com/seaweedfs/seaweedfs/releases/latest/download/linux_amd64.tar.gz
tar xzf linux_amd64.tar.gz
sudo mv weed /usr/local/bin/
weed version  # 확인
```

---

## 3. 이론적 설계 리뷰 (체크리스트)

### 3.1 기대 성능
SeaweedFS 공식 벤치마크(x86-64, SATA SSD):
- Upload: 150~300 MB/s (filer 경유)
- Random read: 500+ MB/s
- 메모리: volume당 ~100MB (idle), +file metadata cache

WSL2 환경은 공식 수치의 50~70% 수준 예상:
- Upload 예상: 75~200 MB/s — 목표 **50 MB/s 초과 가능**
- 메모리 예상: < 500MB — 목표 **2GB** 충족

### 3.2 50GB 파일 분산
- Volume size 기본 30GB → 50GB는 2개 volume 파일 사용
- volume 파일 mmap 기반 → 메모리 압박 낮음
- filer는 sqlite 기반 — 메타데이터 50만+ 엔트리에서 병목 가능 (대안: leveldb, postgres)

### 3.3 재시작 무결성
- SeaweedFS volume 파일은 crash-safe (append-only + checksum)
- SIGKILL 후 재기동 시 volume index 재구성 — 1~2분 소요 (파일 수에 비례)
- 공식 이슈 트래커에서 50GB 규모 재시작 실패 보고 **없음**

### 3.4 B2 오프로드
- `filer remote sync` 명령 필요
- B2 → `filer.toml`:
  ```toml
  [storage.backblaze_b2]
    enabled = true
    b2.key_id = "..."
    b2.application_key = "..."
    b2.bucket = "..."
  ```
- S3 호환 API 경로: `s3://bucket.b2.backblazeb2.com/...`

---

## 4. 축약 판정

- **기술 가용성**: Supabase Storage 공식 참조, 다수 프로덕션 사례 — 가용성 OK
- **운영 부담**: filer sqlite 대신 leveldb 기본 권장 (50만+ 엔트리 대비)
- **메모리**: 예상 < 500MB (목표 2GB의 25%)
- **백업**: B2 S3 호환 오프로드는 Supabase Storage Pro 동등 기능

**조건부 Go** (proto-verdict):
- SeaweedFS 채택 유지 (ADR-008)
- filer 저장 엔진을 sqlite → leveldb로 변경 권장
- 50GB 이상 운영 시 SeaweedFS restart failure 주기 모니터링

**No-Go 트리거 (재평가 조건)**:
- restart failure > 1건/주 → Garage (Rust, BSD-3-Clause) PoC 착수
- 재시작 후 메타데이터 손실 발생 → 즉시 대체

### 4.1 정량 Go/No-Go 임계 (실측 시 적용)

| 메트릭 | Go | Conditional Go | No-Go (Garage 재평가) |
|--------|----|----|----|
| 50GB 업로드 throughput (filer 경유) | > 50MB/s | 30~50MB/s | < 30MB/s |
| 50GB 적재 후 메모리 | < 1GB | 1~2GB | > 2GB |
| SIGKILL 후 재시작 시간 | < 2분 | 2~5분 | > 5분 |
| md5sum 무결성 (5/500 sample) | 100% | n/a | < 100% (즉시 No-Go) |
| filer leveldb 50만 엔트리 응답 | < 100ms | 100~500ms | > 500ms |
| B2 오프로드 1GB throughput | > 30MB/s | 10~30MB/s | < 10MB/s |

### 4.2 ADR-032 (filebox R2 hybrid)와의 결정 트리거

본 spike(SP-016 Storage)와 [ADR-032](../decisions/ADR-032-filebox-large-file-uploads.md)(filebox)는 **동일한 객체 스토리지 추상의 양 측면**:
- **SP-016 영역**: Phase 17 Storage 카테고리 (사용자/콘텐츠 업로드 범용 BaaS 스토리지)
- **ADR-032 영역**: 운영자 파일박스 (1.4GB+ 단일 파일 이송)

**SeaweedFS → R2 결정 매트릭스**:

| 시나리오 | 채택 |
|---------|------|
| 운영자 단독 / 50GB 미만 / R2 비용 < $5/월 | **R2** (ADR-032 옵션 B 유지) |
| 외부 컨슈머 다수 / 50GB+ 누적 / R2 비용 ≥ $5/월 | **SeaweedFS** (SP-016 본격 검증 → ADR-008 ACCEPTED 후 ADR-032 옵션 E 마이그레이션) |
| filebox(운영자) + 컨슈머 스토리지(BaaS) 분리 | **R2(filebox) + SeaweedFS(BaaS)** 병존 |

**드롭인 마이그레이션 경로** (R2 → SeaweedFS): 둘 다 S3 호환 API. 코드 변경: `R2_PUBLIC_BASE_URL` env + `r2.client` → `seaweedfs.client` 교체. 객체 키 그대로 이전 가능 (rsync 또는 mc mirror).

---

## 5. 실측 세션 체크리스트 (다음 세션용)

```bash
# Phase 1: 설치
wget -O /tmp/weed.tar.gz https://github.com/seaweedfs/seaweedfs/releases/latest/download/linux_amd64.tar.gz
tar xzf /tmp/weed.tar.gz -C /tmp/
sudo install -m 0755 /tmp/weed /usr/local/bin/

# Phase 2: 디스크 공간 확인 (50GB 필요)
df -h /tmp  # WSL2 tmp
df -h /mnt/d  # 별도 마운트 고려

# Phase 3: 구성 파일
cat > /tmp/filer.toml <<EOF
[leveldb2]
enabled = true
dir = "/tmp/sp016-data/filer-leveldb"
EOF

# Phase 4: 3 프로세스 기동
weed master -mdir=/tmp/sp016-data/master -port=9333 &
weed volume -dir=/tmp/sp016-data/volume -max=5 -mserver=localhost:9333 -port=9334 &
weed filer -master=localhost:9333 -port=9335 -config=/tmp/filer.toml &

# Phase 5: 50GB 업로드 (100MB × 500)
for i in $(seq 1 500); do
  dd if=/dev/urandom of=/tmp/sp016-src/f$i.bin bs=1M count=100 status=none
  curl -F "file=@/tmp/sp016-src/f$i.bin" http://localhost:9335/bucket/f$i.bin
done

# Phase 6: 무결성
for i in 1 50 100 250 500; do
  curl -s -o /tmp/dl$i.bin http://localhost:9335/bucket/f$i.bin
  md5sum /tmp/sp016-src/f$i.bin /tmp/dl$i.bin
done

# Phase 7: 재시작 후 재검증
pkill -9 weed
(기동 명령 재실행)
(무결성 검사 재수행)
```

---

## 6. 문서 반영 위치 (물리 측정 후)

| 문서 | 변경 요청 |
|------|-----------|
| `02-architecture/07-storage-blueprint.md` | §운영 가이드 실측 메모리/처리량 추가, filer leveldb 권장 |
| `02-architecture/01-adr-log.md` § ADR-008 | ASM-4 검증 결과 반영, Garage 재평가 3조건 정량화 |
| `06-prototyping/01-spike-portfolio.md` | SP-016 Pending → 측정 후 Completed |

---

## 7. 본 세션 산출물

- 본 문서 (축약 설계 검토)
- 실측 체크리스트 (§5)
- 이론적 판정 "조건부 Go" + filer 엔진 leveldb 권장

---

> SP-016 축약 완료 · 판정: **Pending** (실측 대기) · 별도 세션 + 50GB 랩 환경 필요 · 2026-04-19
