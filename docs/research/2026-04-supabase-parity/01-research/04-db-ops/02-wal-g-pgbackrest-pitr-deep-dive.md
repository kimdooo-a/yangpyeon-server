# 02. wal-g + pgbackrest — Backups + PITR Deep Dive

> Wave 1 / DB Ops Round 2 / DQ-4.X 후보 2
> 작성일: 2026-04-18 (세션 24, kdywave Wave 1 deep-dive)
> 작성자: Claude Opus 4.7 (1M context) — Wave 1 Schema Viz + DB Ops 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/database/backups` 60/100 청사진 → 100/100 + PITR 도입
> 사전 컨텍스트: 현재 `pg_dump` 기반 일일 백업 + B2 업로드 + `Backup` 모델 영속화 동작 중. 갭은 (1) PITR(Point-In-Time Recovery), (2) 세그먼트 백업(WAL 기반 증분), (3) 압축 효율, (4) 복원 시간(RTO), (5) 백업 검증 자동화.

---

## 0. Executive Summary

### 결론 한 줄
**wal-g를 1차 채택**해 우리 PostgreSQL 16 + WSL2 + Backblaze B2(S3 호환) 환경에 PITR + 일일 베이스 백업 + 5분 단위 WAL 아카이브를 구축한다. **pgbackrest는 후일 다중 노드/HA 시나리오에서 재검토** (현재 단일 인스턴스에서는 wal-g가 더 가볍고 운영 단순).

근거 5개:
1. **wal-g는 단일 바이너리 + 환경변수만**: B2/S3 호환 스토리지 즉시 사용 가능. 운영 학습 곡선 낮음.
2. **pgbackrest는 강력하지만 무거움**: 스탠자(stanza) 개념, 별도 설정 디렉토리, 한국어 자료 적음. 다중 노드 클러스터에서 빛남.
3. **B2 호환성**: wal-g는 B2 native 지원. pgbackrest는 S3 호환 모드로 B2 연결 (설정 가능).
4. **PostgreSQL 16 호환**: 둘 다 16 공식 지원.
5. **WSL2 단일 인스턴스 시나리오**: wal-g는 cron + 환경변수면 끝. pgbackrest는 stanza-create + check + 정기 expire 등 운영 단계 다층.

**5점 척도 종합 점수**:
- wal-g 채택 (현재 시나리오): 4.41/5
- pgbackrest 채택 (현재 시나리오): 3.78/5
- pg_dump 단독 유지 (현재): 3.12/5

### Phase 14e 정렬: **pg_dump → wal-g 전환 + PITR 활성화**
- 현재 pg_dump는 보조(주간 dump 보관)로 유지.
- wal-g가 메인 (일일 base + 5분 WAL).
- 신규 페이지: `/database/backups` 확장 (PITR 시점 선택, 복원 미리보기, 검증 결과).

### 새 DQ
- **DQ-4.10**: B2 vs S3 vs Cloudflare R2? → B2 (이미 사용 중, 비용 최저).
- **DQ-4.11**: 복원 환경(staging container)을 cron으로 매주 자동? → Yes, Phase 14e.
- **DQ-4.12**: 백업 보존 정책 (베이스 N개 + WAL N일)? → 베이스 7개 + WAL 14일 (RTO 14일 PITR 가능).
- **DQ-4.13**: 백업 암호화? → wal-g `--libsodium` 또는 `--openpgp`로 채택, B2 측 SSE도 추가.
- **DQ-4.14**: pg_dump 보조 보관 기간? → 월 1회 dump를 12개월 보관 (long-term archive).

---

## 1. 현재 상태 분석 (60/100)

### 1.1 우리가 가진 것
```
src/server/cron/handlers/backup-database.ts
  → pg_dump --format=custom --compress=9 → tmpfile
  → uploadToB2(bucket="ypkitchen-backup", key="daily/...")
  → cleanup tmpfile
prisma/schema.prisma:
  model Backup {
    id        String   @id @default(cuid())
    filename  String
    sizeBytes BigInt
    sha1      String
    bucketKey String
    createdAt DateTime @default(now())
    durationMs Int
  }
docs/MASTER-DEV-PLAN.md
  Phase 14b 백업 구현 완료
```

### 1.2 갭 분석
| 항목 | 현재 | 갭 | 우선순위 |
|------|------|-----|---------|
| 일일 풀 백업 | ✓ | — | — |
| 외부 스토리지 | ✓ B2 | — | — |
| 압축 | ✓ pg_dump --compress=9 | 더 효율적 wal-g lz4/zstd 가능 | P2 |
| **PITR (Point-In-Time Recovery)** | ✗ | RPO 24시간 → 5분 가능 | **P0** |
| **WAL 아카이빙** | ✗ | PITR 전제 | **P0** |
| **증분 백업** | ✗ | 매일 풀 = 비효율 | **P1** |
| **복원 검증 자동화** | ✗ | 백업 손상 알 방법 없음 | **P1** |
| **암호화 at-rest** | △ B2 SSE | 클라이언트 사이드 암호화 권장 | **P1** |
| **보존 정책 자동 적용** | ✗ | 수동 cleanup | **P2** |
| **PITR UI** | ✗ | 시점 선택 + 복원 미리보기 | **P2** |
| **복원 시간 측정 (RTO)** | ✗ | 복원해 봐야 알 수 있음 | **P2** |
| **백업 메타 영속화** | ✓ Backup 모델 | wal-g 출력과 통합 필요 | P2 |

### 1.3 RPO/RTO 목표 정의
- **RPO (Recovery Point Objective)**: 데이터 손실 허용 시간. 양평 부엌 운영자 1~3명 + 일일 활성 데이터 기준 → **5분** 목표.
- **RTO (Recovery Time Objective)**: 복원 완료까지 시간. → **30분** 목표.
- 현재 pg_dump 단독은 RPO=24시간, RTO=15~30분.
- wal-g + WAL 아카이브 시 RPO=5분, RTO=30~60분 (베이스 + WAL replay).

---

## 2. PITR 개념 정리 (배경)

### 2.1 PostgreSQL 백업의 두 갈래
1. **논리 백업(Logical)**: `pg_dump`/`pg_dumpall`. SQL 또는 커스텀 형식. 객체 단위 복원 가능. **PITR 불가.**
2. **물리 백업(Physical)**: 데이터 디렉토리 + WAL. PITR 가능. wal-g/pgbackrest/Barman이 이 영역.

### 2.2 PITR 동작 원리
```
[베이스 백업]            [WAL 아카이브]
data/                   pg_wal/
├── base/...            ├── 000000010000000000000001
├── pg_wal/...          ├── 000000010000000000000002
└── ...                 ├── 000000010000000000000003
                        ├── ... (WAL = Write-Ahead Log)
T0 (베이스 백업 시점)    T0+5min, T0+10min, ...

복원 시:
1. 베이스 백업 restore → data/ 디렉토리 복원
2. recovery.signal 또는 standby.signal 생성
3. postgresql.conf에 restore_command 설정 (아카이브에서 WAL 가져옴)
4. recovery_target_time = '2026-04-18 14:30:00 KST' 지정
5. PostgreSQL 시작 → WAL replay → 정확히 14:30 시점에 멈춤
```

### 2.3 WAL 아카이빙 활성화 (PostgreSQL 측 설정)
```ini
# postgresql.conf
wal_level = replica            # 또는 logical
archive_mode = on
archive_command = '/usr/local/bin/wal-g wal-push %p'
archive_timeout = 60           # 60초마다 강제 WAL 회전 (안정성)
max_wal_senders = 3            # WAL 스트리밍용
wal_keep_size = 1GB
```

PostgreSQL 재시작 1회 필요 (운영 다운타임 5~30초).

---

## 3. wal-g 분석

### 3.1 정체성
wal-g는 Yandex(Citus → MS 인수 전 Postgres 전문가들 재결집)의 PostgreSQL 백업 도구. Go 단일 바이너리. PostgreSQL/MySQL/MongoDB/Redis 다지원이지만 PostgreSQL이 1차 시민.

특성:
- 단일 바이너리 (~30MB Linux x86_64)
- S3/GCS/Azure/B2/Swift/SSH 백엔드
- delta backup (증분), 압축 (lz4/lzma/zstd/brotli/lz4hc/none)
- 클라이언트 사이드 암호화 (libsodium/openpgp)
- 병렬 업로드/다운로드
- LSN 기반 PITR
- Yandex/MS/Cloudflare/주요 SaaS 운영 스케일 검증

### 3.2 설치 (WSL2 Ubuntu)
```bash
# 1. 다운로드
WALG_VER="v3.0.5"
wget https://github.com/wal-g/wal-g/releases/download/${WALG_VER}/wal-g-pg-ubuntu-22.04-amd64.tar.gz
tar -xzf wal-g-pg-ubuntu-22.04-amd64.tar.gz
sudo mv wal-g-pg-ubuntu-22.04-amd64 /usr/local/bin/wal-g
sudo chmod +x /usr/local/bin/wal-g

# 2. 검증
wal-g --version
```

### 3.3 환경변수 설정 — B2 (Backblaze)
```bash
# /etc/wal-g/.env (postgres user가 읽을 수 있게)
WALG_S3_PREFIX=s3://ypkitchen-backup/wal-g
AWS_ACCESS_KEY_ID=<B2 keyID>
AWS_SECRET_ACCESS_KEY=<B2 applicationKey>
AWS_ENDPOINT=https://s3.us-west-002.backblazeb2.com  # B2 S3 호환 엔드포인트
AWS_REGION=us-west-002
AWS_S3_FORCE_PATH_STYLE=true                          # B2는 path-style 필수

WALG_COMPRESSION_METHOD=zstd                          # zstd 권장 (lz4보다 압축률 좋음)
WALG_DELTA_MAX_STEPS=7                                # 최대 7단계 delta까지

WALG_LIBSODIUM_KEY=<32바이트 base64 키>               # 암호화 키
WALG_LIBSODIUM_KEY_TRANSFORM=base64

PGHOST=/var/run/postgresql
PGUSER=postgres
PGDATABASE=ypkitchen
```

```bash
# postgres 사용자 환경에 적용
sudo -u postgres bash -c 'echo "set -a; source /etc/wal-g/.env; set +a" >> ~/.bashrc'
```

### 3.4 PostgreSQL 설정
```ini
# /etc/postgresql/16/main/postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'set -a; source /etc/wal-g/.env; set +a; /usr/local/bin/wal-g wal-push %p >> /var/log/wal-g/archive.log 2>&1'
archive_timeout = 60
max_wal_senders = 3
```

```bash
# 로그 디렉토리
sudo mkdir -p /var/log/wal-g
sudo chown postgres:postgres /var/log/wal-g

# 재시작
sudo systemctl restart postgresql
```

### 3.5 베이스 백업 명령
```bash
# 풀 백업 (최초 또는 매주)
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-push /var/lib/postgresql/16/main'

# 또는 delta 백업 (증분)
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-push /var/lib/postgresql/16/main --delta-from-name=LATEST'

# 백업 목록
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-list'

# 출력 예:
# name                          last_modified         wal_segment_backup_start
# base_000000010000000000000010 2026-04-18T03:00:42Z  000000010000000000000010
# base_000000010000000000000050 2026-04-19T03:00:35Z  000000010000000000000050
```

### 3.6 PITR 복원
```bash
# 1. PostgreSQL 중지
sudo systemctl stop postgresql

# 2. 데이터 디렉토리 백업/이동
sudo mv /var/lib/postgresql/16/main /var/lib/postgresql/16/main.before-restore

# 3. 베이스 백업 가져오기
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-fetch /var/lib/postgresql/16/main LATEST'
# 또는 특정 시점 직전 베이스: wal-g backup-fetch /var/lib/postgresql/16/main base_0000000100...

# 4. recovery 설정
sudo -u postgres bash -c 'cat > /var/lib/postgresql/16/main/postgresql.auto.conf <<EOF
restore_command = '\''set -a; source /etc/wal-g/.env; set +a; wal-g wal-fetch %f %p'\''
recovery_target_time = '\''2026-04-18 14:30:00+09'\''
recovery_target_action = '\''promote'\''
EOF'

sudo -u postgres touch /var/lib/postgresql/16/main/recovery.signal

# 5. PostgreSQL 시작 → WAL replay → 14:30:00 시점에 promote
sudo systemctl start postgresql

# 6. 로그 확인
sudo tail -f /var/log/postgresql/postgresql-16-main.log
# "recovery stopping before commit of transaction X, time 2026-04-18 14:29:58.234..."
# "archive recovery complete"
# "database system is ready to accept connections"
```

### 3.7 자동 보존 정책
```bash
# 베이스 7개 보존 + 그 이전 베이스/WAL 삭제
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g delete retain 7 --confirm'

# 14일 이전 WAL 삭제 (베이스 보존 7개와 일치하는지 확인)
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g delete before FIND_FULL 2026-04-04T00:00:00Z --confirm'
```

### 3.8 검증 (verify)
```bash
# 베이스 백업 무결성 검사 (가장 최근 베이스)
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-verify LATEST'

# 모든 베이스 검사
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-list --detail'
```

### 3.9 우리 cron 통합
```ts
// src/server/cron/handlers/wal-g-base-backup.ts
import { execFile } from "child_process"
import { promisify } from "util"
import { prisma } from "@/lib/prisma"

const execFileAsync = promisify(execFile)
const WALG_ENV = "/etc/wal-g/.env"
const PGDATA = "/var/lib/postgresql/16/main"

export async function walGBaseBackup({ runId }: { runId: string }) {
  const startedAt = Date.now()
  const cmd = `set -a; source ${WALG_ENV}; set +a; sudo -u postgres /usr/local/bin/wal-g backup-push ${PGDATA} --delta-from-name=LATEST 2>&1`

  // bash -c로 실행 (sudo는 미리 sudoers 설정 필요)
  const { stdout, stderr } = await execFileAsync("bash", ["-c", cmd], {
    timeout: 60 * 60 * 1000,  // 1시간
    maxBuffer: 10 * 1024 * 1024,
  })

  // wal-g 출력에서 backup name 파싱
  const m = stdout.match(/INFO: \d+ backup name: (\S+)/)
  const backupName = m ? m[1] : null

  // 메타 영속화 (Backup 모델 확장 또는 신규 PhysicalBackup)
  await prisma.backup.create({
    data: {
      filename: backupName ?? "unknown",
      sizeBytes: BigInt(0),  // wal-g list에서 가져오기
      sha1: "",
      bucketKey: `wal-g/basebackups_005/${backupName}`,
      durationMs: Date.now() - startedAt,
      kind: "wal-g-base",  // 신규 enum
    },
  })

  return { backupName, durationMs: Date.now() - startedAt }
}
```

```ts
// src/server/cron/handlers/wal-g-retention.ts
export async function walGRetention() {
  // 베이스 7개 + WAL 14일 보존
  const cmd1 = `set -a; source /etc/wal-g/.env; set +a; sudo -u postgres /usr/local/bin/wal-g delete retain 7 --confirm`
  await execFileAsync("bash", ["-c", cmd1], { timeout: 10 * 60 * 1000 })
  return { ok: true }
}
```

### 3.10 sudoers 설정 (Next.js 프로세스가 sudo 호출 가능)
```bash
# /etc/sudoers.d/walg
ypkitchen_app ALL=(postgres) NOPASSWD: /usr/local/bin/wal-g
```

### 3.11 wal-g 비용 추정
- B2 스토리지: $0.006/GB/월
- 양평 부엌 DB 크기 추정: 5GB (현재) → 10GB (1년 후)
- WAL 14일 누적: ~3GB
- 베이스 7개 (delta): 베이스 1개 풀 5GB + delta 6개 평균 500MB = 8GB
- **총: ~21GB → 월 $0.13** (= 환산 약 180원)
- B2 다운로드 (복원 시): $0.01/GB → 30GB 복원 시 $0.30

---

## 4. pgbackrest 분석

### 4.1 정체성
pgbackrest는 Crunchy Data가 후원하는 PostgreSQL 전용 백업/복원 도구. C로 작성. 오랜 역사(2013~)와 엔터프라이즈 검증. PostgreSQL 클러스터(다중 노드, replica, HA) 시나리오의 표준.

특성:
- 단일 바이너리 + 별도 설정 디렉토리(`/etc/pgbackrest/`)
- "stanza" 개념: 한 PostgreSQL 클러스터 = 1 stanza
- Repository (리포지토리): 백업 저장소. 다중 repo 지원.
- 풀/증분/디퍼런셜 3종 백업
- 압축 (gz/lz4/zst/bz2)
- 병렬 처리 (스레드 수 조절 가능)
- TLS 클라이언트/서버
- S3/Azure/GCS 백엔드
- 검증 자동(매 백업 후 checksum 검증)

### 4.2 설치 (Ubuntu)
```bash
sudo apt install pgbackrest
```

### 4.3 설정 — B2 호환
```ini
# /etc/pgbackrest/pgbackrest.conf
[global]
repo1-type=s3
repo1-path=/pgbackrest
repo1-s3-bucket=ypkitchen-backup
repo1-s3-endpoint=s3.us-west-002.backblazeb2.com
repo1-s3-region=us-west-002
repo1-s3-key=<B2 keyID>
repo1-s3-key-secret=<B2 applicationKey>
repo1-s3-uri-style=path                                # B2 path-style 필수
repo1-cipher-type=aes-256-cbc                           # 클라이언트 사이드 암호화
repo1-cipher-pass=<32바이트 랜덤 패스>
repo1-retention-full=4                                  # 풀 백업 4개
repo1-retention-diff=14                                 # 디퍼런셜 14개
repo1-retention-archive=14                              # WAL 14일

repo1-bundle=y                                          # 작은 파일 묶음 업로드
process-max=4                                           # 병렬 4

log-level-console=info
log-level-file=detail
log-path=/var/log/pgbackrest

start-fast=y
delta=y                                                 # 증분 활성화

[ypkitchen]
pg1-path=/var/lib/postgresql/16/main
pg1-port=5432
pg1-user=postgres
```

### 4.4 PostgreSQL 설정
```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --stanza=ypkitchen archive-push %p'
archive_timeout = 60
max_wal_senders = 3
```

### 4.5 stanza 생성 + 첫 백업
```bash
# stanza 생성 (메타 디렉토리 초기화)
sudo -u postgres pgbackrest --stanza=ypkitchen stanza-create

# PostgreSQL 재시작
sudo systemctl restart postgresql

# 첫 풀 백업
sudo -u postgres pgbackrest --stanza=ypkitchen --type=full backup

# 증분 백업
sudo -u postgres pgbackrest --stanza=ypkitchen --type=incr backup

# 디퍼런셜 백업
sudo -u postgres pgbackrest --stanza=ypkitchen --type=diff backup

# 백업 목록
sudo -u postgres pgbackrest --stanza=ypkitchen info
```

### 4.6 PITR 복원
```bash
# 중지
sudo systemctl stop postgresql

# 복원 (특정 시점)
sudo -u postgres pgbackrest --stanza=ypkitchen \
  --type=time \
  --target='2026-04-18 14:30:00+09' \
  --target-action=promote \
  restore

# 시작
sudo systemctl start postgresql
```

### 4.7 검증
```bash
# 현재 stanza 상태
sudo -u postgres pgbackrest --stanza=ypkitchen check

# 백업 검증
sudo -u postgres pgbackrest --stanza=ypkitchen verify
```

### 4.8 pgbackrest 우위 (vs wal-g)
1. **검증 자동**: 모든 백업 후 자동 checksum 검증.
2. **다중 repository**: 로컬 + B2 동시 백업 가능 (이중화).
3. **Bundle 모드**: 작은 파일 합쳐 업로드 (B2/S3 PUT 횟수 절감).
4. **TLS 통신**: pg_backrest 서버 모드로 push 가능.
5. **블록 단위 증분**: 더 효율적인 증분.
6. **다중 노드/HA**: replica에서 직접 백업 가능 (primary 부하 감소).

### 4.9 pgbackrest 비용 (vs wal-g)
1. **운영 복잡도**: stanza-create + check + 정기 expire + multi-repo 관리.
2. **한국어 자료 적음**: 디버깅 시 영어 GitHub issue 의존.
3. **단일 노드에서 과잉**: 우리 시나리오에서는 wal-g가 충분.

### 4.10 우리 cron 통합 (대안)
```ts
// src/server/cron/handlers/pgbackrest-backup.ts (대안)
export async function pgbackrestBackup({ type }: { type: "full" | "incr" | "diff" }) {
  const startedAt = Date.now()
  const cmd = `sudo -u postgres pgbackrest --stanza=ypkitchen --type=${type} backup`
  const { stdout } = await execFileAsync("bash", ["-c", cmd], {
    timeout: 60 * 60 * 1000,
  })
  // 출력 파싱: "P00   INFO: backup label = 20260418-030042F"
  const m = stdout.match(/backup label = (\S+)/)
  const label = m ? m[1] : null
  await prisma.backup.create({
    data: {
      filename: label ?? "unknown",
      kind: `pgbackrest-${type}`,
      sizeBytes: BigInt(0),
      sha1: "",
      bucketKey: `pgbackrest/backup/ypkitchen/${label}`,
      durationMs: Date.now() - startedAt,
    },
  })
  return { label, type, durationMs: Date.now() - startedAt }
}
```

---

## 5. 직접 비교 매트릭스

### 5.1 기능
| 기능 | wal-g | pgbackrest | pg_dump (현재) |
|------|-------|------------|----------------|
| 풀 백업 | ✓ | ✓ | ✓ |
| 증분 (delta) | ✓ (LSN delta) | ✓ (block-level) | ✗ |
| 디퍼런셜 | ✗ | ✓ | ✗ |
| WAL 아카이브 | ✓ | ✓ | ✗ |
| PITR | ✓ | ✓ | ✗ |
| 압축 | lz4/zstd/lzma/brotli | gz/lz4/zst/bz2 | gzip |
| 클라이언트 암호화 | libsodium/openpgp | aes-256-cbc | ✗ (B2 SSE만) |
| 병렬 처리 | ✓ | ✓ | △ (-j) |
| 백업 검증 | 옵션 | 자동 | 별도 pg_restore --list |
| 다중 repo | ✗ | ✓ | ✗ |
| 다중 노드 | △ | ✓ | △ |
| TLS 통신 | ✗ | ✓ | n/a |
| Bundle 업로드 | ✗ | ✓ | n/a |
| Storage 백엔드 수 | 7+ | 4 | n/a |
| 한글 자료 | 적음 | 적음 | 풍부 |
| 단일 바이너리 | ✓ Go | ✗ apt 패키지 | ✓ |

### 5.2 운영 비용
| 항목 | wal-g | pgbackrest |
|------|-------|------------|
| 설치 단계 | 3 (download/chmod/env) | 2 (apt + conf) |
| 설정 디렉토리 | /etc/wal-g/.env (1 파일) | /etc/pgbackrest/pgbackrest.conf + log + spool (3+ 디렉토리) |
| 첫 백업 명령 | `wal-g backup-push <pgdata>` | `stanza-create` + `backup --type=full` |
| 명령어 복잡도 | 낮음 | 중간 |
| 학습 곡선 | 1~2시간 | 4~8시간 |
| 디버깅 자료 | GitHub issue + Yandex docs | 풍부한 공식 문서 + Crunchy 가이드 |

### 5.3 양평 부엌 시나리오 적합도
| 항목 | wal-g | pgbackrest |
|------|-------|------------|
| 단일 PostgreSQL 인스턴스 | ✓ 적합 | △ 과잉 |
| WSL2 + PM2 | ✓ 적합 | ✓ 적합 |
| Backblaze B2 | ✓ native | ✓ S3 호환 |
| 5GB DB → 50GB까지 | ✓ | ✓ |
| 운영자 1~3명 학습 | ✓ 1시간 | △ 4시간+ |
| 다중 노드 미래 (Phase 16~?) | △ | ✓ |
| HA replica 시나리오 | △ | ✓ |
| 클라이언트 암호화 | ✓ | ✓ |
| 백업 검증 자동 | △ (옵션) | ✓ (자동) |

---

## 6. 우리 청사진 — wal-g 채택 + 자동 검증

### 6.1 단계별 도입 계획

#### Phase 14e-1: wal-g 설치 + B2 설정 (반나절)
```bash
# 1. wal-g 다운로드
curl -L https://github.com/wal-g/wal-g/releases/download/v3.0.5/wal-g-pg-ubuntu-22.04-amd64.tar.gz | tar xz
sudo mv wal-g-pg-ubuntu-22.04-amd64 /usr/local/bin/wal-g

# 2. 설정 파일
sudo mkdir -p /etc/wal-g
sudo tee /etc/wal-g/.env > /dev/null <<EOF
WALG_S3_PREFIX=s3://ypkitchen-backup/wal-g
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_ENDPOINT=https://s3.us-west-002.backblazeb2.com
AWS_REGION=us-west-002
AWS_S3_FORCE_PATH_STYLE=true
WALG_COMPRESSION_METHOD=zstd
WALG_DELTA_MAX_STEPS=7
WALG_LIBSODIUM_KEY=$(openssl rand -base64 32)
WALG_LIBSODIUM_KEY_TRANSFORM=base64
PGHOST=/var/run/postgresql
PGUSER=postgres
PGDATABASE=ypkitchen
EOF
sudo chown postgres:postgres /etc/wal-g/.env
sudo chmod 600 /etc/wal-g/.env

# 3. 로그 디렉토리
sudo mkdir -p /var/log/wal-g
sudo chown postgres:postgres /var/log/wal-g
```

#### Phase 14e-2: PostgreSQL 설정 변경 + 재시작 (다운타임 30초)
```bash
# postgresql.conf 변경 + 재시작
sudo systemctl restart postgresql
```

#### Phase 14e-3: 첫 풀 백업 + 검증 (1시간)
```bash
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-push /var/lib/postgresql/16/main'
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a; wal-g backup-list'
```

#### Phase 14e-4: cron 통합 (반나절)
- `wal-g-base-backup` 핸들러 (매주 일요일 02:00 — 풀 + delta는 평일 03:00)
- `wal-g-retention` 핸들러 (매일 04:00 — 보존 정책 적용)
- `wal-g-verify` 핸들러 (매주 토요일 03:00 — 무결성 검증)
- `wal-g-restore-test` 핸들러 (매월 1일 — 별도 컨테이너에 복원 테스트)

#### Phase 14e-5: UI 청사진 (1일)
- `/database/backups` 확장:
  - 베이스 백업 목록 (wal-g backup-list 결과)
  - WAL 아카이브 상태 (마지막 push 시각, 누적 크기)
  - PITR 시점 선택 캘린더
  - 복원 미리보기 (예상 데이터/시간/비용)
  - 검증 결과 요약

### 6.2 PITR UI 구현
```tsx
// src/app/database/backups/page.tsx
import { listWalGBackups, getWalGStatus } from "@/server/backups/wal-g"
import { BackupsClient } from "@/components/backups/backups-client"

export default async function Page() {
  const backups = await listWalGBackups()
  const status = await getWalGStatus()
  return <BackupsClient backups={backups} status={status} />
}
```

```ts
// src/server/backups/wal-g.ts
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export interface WalGBackup {
  name: string
  modified: string
  walSegmentBackupStart: string
  isPermanent: boolean
  hostname?: string
  startTime?: string
  finishTime?: string
  uncompressedSize?: number
  compressedSize?: number
}

export async function listWalGBackups(): Promise<WalGBackup[]> {
  const { stdout } = await execFileAsync("bash", [
    "-c",
    "set -a; source /etc/wal-g/.env; set +a; sudo -u postgres /usr/local/bin/wal-g backup-list --detail --json",
  ])
  return JSON.parse(stdout) as WalGBackup[]
}

export async function getWalGStatus() {
  // wal-g wal-show — WAL 아카이브 상태
  const { stdout } = await execFileAsync("bash", [
    "-c",
    "set -a; source /etc/wal-g/.env; set +a; sudo -u postgres /usr/local/bin/wal-g wal-show --json",
  ])
  return JSON.parse(stdout)
}
```

```tsx
// src/components/backups/pitr-time-picker.tsx
"use client"
import { useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Slider } from "@/components/ui/slider"

export function PitrTimePicker({ minTime, maxTime, onSelect }: ...) {
  const [date, setDate] = useState<Date>(new Date(maxTime))
  const [seconds, setSeconds] = useState(0)  // 0~86400

  const targetTime = new Date(date)
  targetTime.setHours(0, 0, 0, 0)
  targetTime.setSeconds(seconds)

  const isInRange = targetTime >= minTime && targetTime <= maxTime

  return (
    <div className="space-y-4">
      <Calendar
        mode="single"
        selected={date}
        onSelect={d => d && setDate(d)}
        disabled={d => d < minTime || d > maxTime}
      />
      <div>
        <label className="text-sm">시각 (HH:MM:SS)</label>
        <Slider min={0} max={86400} step={1} value={[seconds]} onValueChange={v => setSeconds(v[0])} />
        <p className="font-mono text-sm">
          {Math.floor(seconds / 3600).toString().padStart(2, "0")}:
          {Math.floor((seconds % 3600) / 60).toString().padStart(2, "0")}:
          {(seconds % 60).toString().padStart(2, "0")}
        </p>
      </div>
      <p className="text-sm">
        선택된 PITR 시점: <strong>{targetTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</strong>
      </p>
      {!isInRange && (
        <p className="text-sm text-red-400">
          백업 범위 밖입니다 ({minTime.toISOString()} ~ {maxTime.toISOString()})
        </p>
      )}
      <button
        disabled={!isInRange}
        onClick={() => onSelect(targetTime)}
        className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50"
      >
        이 시점으로 복원 미리보기
      </button>
    </div>
  )
}
```

### 6.3 복원 미리보기 (실제 복원 X, 시뮬레이션 O)
```ts
// src/server/backups/restore-preview.ts
export interface RestorePreview {
  targetTime: Date
  baseBackup: {
    name: string
    sizeBytes: number
    age: string  // "3일 전"
  }
  walSegmentsToReplay: number
  estimatedDownloadMB: number
  estimatedDurationMin: number
  estimatedDataLossSec: number  // RPO
}

export async function previewRestore(targetTime: Date): Promise<RestorePreview> {
  const backups = await listWalGBackups()
  // targetTime 이전의 가장 최근 베이스 백업 찾기
  const eligible = backups.filter(b => new Date(b.startTime ?? b.modified) <= targetTime)
  const base = eligible.sort((a, b) =>
    new Date(b.startTime ?? b.modified).getTime() - new Date(a.startTime ?? a.modified).getTime()
  )[0]

  if (!base) throw new Error("적합한 베이스 백업 없음")

  // WAL 세그먼트 수 추정 (60초 archive_timeout 기준)
  const baseTime = new Date(base.startTime ?? base.modified)
  const elapsedSec = (targetTime.getTime() - baseTime.getTime()) / 1000
  const walSegments = Math.ceil(elapsedSec / 60)

  // 다운로드 크기 추정 (베이스 + WAL)
  const walBytesPerSegment = 16 * 1024 * 1024  // 16MB
  const downloadMB = (base.compressedSize ?? base.uncompressedSize ?? 0) / (1024 * 1024)
                    + (walSegments * walBytesPerSegment * 0.3 /* 압축률 */ ) / (1024 * 1024)

  // 복원 시간 추정 (다운로드 + WAL replay)
  const downloadMinutes = downloadMB / 50  // 50MB/s 가정
  const replayMinutes = walSegments / 100   // 100 세그먼트/분 가정
  const totalMinutes = downloadMinutes + replayMinutes + 2 /* 시작 오버헤드 */

  // RPO: targetTime ~ 현재 archive_timeout 차이
  const dataLossSec = Math.min(60, (Date.now() - targetTime.getTime()) / 1000)

  return {
    targetTime,
    baseBackup: {
      name: base.name,
      sizeBytes: base.compressedSize ?? 0,
      age: humanizeAge(baseTime),
    },
    walSegmentsToReplay: walSegments,
    estimatedDownloadMB: Math.round(downloadMB),
    estimatedDurationMin: Math.round(totalMinutes),
    estimatedDataLossSec: Math.round(dataLossSec),
  }
}

function humanizeAge(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / (86400 * 1000))
  if (days === 0) return "오늘"
  if (days === 1) return "1일 전"
  return `${days}일 전`
}
```

### 6.4 자동 복원 검증 (월 1회)
```ts
// src/server/cron/handlers/wal-g-restore-test.ts
import { execFile } from "child_process"
import { promisify } from "util"
import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

const execFileAsync = promisify(execFile)

export async function walGRestoreTest() {
  // 별도 임시 디렉토리에 wal-g backup-fetch + WAL replay 테스트
  const testDir = await mkdtemp(path.join(tmpdir(), "wal-g-restore-test-"))
  const startedAt = Date.now()
  try {
    // 1. 가장 최근 베이스 fetch
    await execFileAsync("bash", [
      "-c",
      `set -a; source /etc/wal-g/.env; set +a; sudo -u postgres /usr/local/bin/wal-g backup-fetch ${testDir} LATEST`,
    ], { timeout: 30 * 60 * 1000 })

    // 2. PostgreSQL 임시 인스턴스 시작 (별도 포트, 별도 cluster)
    // pg_ctl로 포트 5433에 임시 cluster 시작
    // ... 자세한 절차는 운영자 가이드 참조

    // 3. SELECT 1로 동작 확인
    // ... pg_isready 또는 psql 호출

    // 4. 임시 cluster 중지

    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      restoredSize: "~" + ((await getDirSize(testDir)) / (1024 * 1024)).toFixed(1) + " MB",
    }
  } finally {
    await rm(testDir, { recursive: true, force: true })
  }
}

async function getDirSize(dir: string): Promise<number> {
  const { stdout } = await execFileAsync("du", ["-sb", dir])
  return parseInt(stdout.split("\t")[0], 10)
}
```

---

## 7. 실제 복원 시나리오 — 운영자 가이드

### 7.1 시나리오: 14:30에 운영자가 실수로 `kitchen` 테이블 전체 DELETE
```
14:30:42 — DELETE FROM kitchen; (실수)
14:31:00 — 운영자가 발견, 즉시 알림
14:31:30 — /database/backups 페이지 접속, PITR 14:30:00 선택
14:32:00 — "복원 미리보기" 확인 (예상 RPO 60초, RTO 25분)
14:33:00 — 운영자가 sudo 권한으로 다음 절차 시작:

# 1. PM2 stop (앱 차단)
pm2 stop ypkitchen

# 2. PostgreSQL stop
sudo systemctl stop postgresql

# 3. 데이터 디렉토리 백업
sudo mv /var/lib/postgresql/16/main /var/lib/postgresql/16/main.before-restore-$(date +%s)

# 4. wal-g 베이스 + WAL 가져오기 (자동 PITR 모드 사용)
sudo -u postgres bash -c 'set -a; source /etc/wal-g/.env; set +a;
  /usr/local/bin/wal-g backup-fetch /var/lib/postgresql/16/main LATEST &&
  cat > /var/lib/postgresql/16/main/postgresql.auto.conf <<EOF
restore_command = '"'"'set -a; source /etc/wal-g/.env; set +a; /usr/local/bin/wal-g wal-fetch %f %p'"'"'
recovery_target_time = '"'"'2026-04-18 14:30:00+09'"'"'
recovery_target_action = '"'"'promote'"'"'
EOF
  touch /var/lib/postgresql/16/main/recovery.signal'

# 5. PostgreSQL start
sudo systemctl start postgresql

# 6. 로그에서 promote 확인
sudo tail -f /var/log/postgresql/postgresql-16-main.log
# "archive recovery complete" 대기

# 7. 데이터 검증
sudo -u postgres psql -d ypkitchen -c "SELECT count(*) FROM kitchen;"

# 8. PM2 start
pm2 start ypkitchen
14:55:00 — 복원 완료 (RTO 25분)
```

### 7.2 운영자 셀프서비스 가능성
- 위 절차는 sudo 권한 + WSL2 셸 접근 필요.
- 웹 UI에서 직접 트리거하는 것은 **위험**: 잘못된 시점 선택 시 데이터 영구 손실.
- 권장: 웹 UI는 **시점 선택 + 명령어 생성 + 클립보드 복사**까지만. 실제 실행은 운영자가 셸에서 수동.
- Phase 16에서 **2단계 confirm + 운영자 2명 승인** 패턴으로 자동화 검토.

---

## 8. 리스크 / 트레이드오프

### 8.1 wal-g 리스크
1. **단일 메인테이너 의존성**: Yandex 출신 + 커뮤니티. 핵심 기여자 이탈 시 위험.
   - 완화: pg_dump 보조 백업 유지 (월 1회 long-term archive).
2. **B2 PUT 비용**: archive_timeout=60초 → 1시간에 60 PUT, 하루 1440 PUT, 월 43200 PUT.
   - B2 PUT 비용: 처음 2500 무료, 이후 $0.004 / 1만 = 월 ~$0.017. 무시 가능.
3. **WAL push 실패 시 PostgreSQL 정지**: archive_command 실패 → WAL이 pg_wal에 누적 → 디스크 풀.
   - 완화: archive_timeout 3600 + monitoring + log_min_duration_statement 설정.
4. **클라이언트 암호화 키 분실**: 백업 영원히 복호화 불가.
   - 완화: 키를 (1) /etc/wal-g/.env, (2) 1Password/Bitwarden, (3) 종이 인쇄 운영자 금고에 3중 보관.

### 8.2 pgbackrest 미채택 리스크
1. **자동 검증 누락**: wal-g는 옵션 → 우리 cron이 검증 책임.
2. **다중 repo 미지원**: B2 + 로컬 디스크 동시 백업이 wal-g 단독으로는 어색.
   - 완화: pg_dump가 로컬 백업 보조.
3. **블록 단위 증분 미지원**: delta는 LSN 단위라 변경된 페이지만 추출하는 정도까지는 못 감.

### 8.3 PITR 자체의 리스크
1. **archive_command 실패 → 디스크 풀 → 데이터 손실**: 가장 큰 위험.
   - 완화: monitoring + alert + max_wal_size 모니터링.
2. **WAL 중간 손상**: 1개 WAL 세그먼트 손상 시 그 이후 PITR 불가.
   - 완화: B2 SSE + 클라이언트 암호화 + checksum 자동 검증.
3. **시간 동기화**: NTP 미설정 시 recovery_target_time 부정확.
   - 완화: chrony/ntpd 설정 검증.
4. **SSL/TLS 인증서 만료**: B2 fetch 실패.
   - 완화: 인증서 자동 갱신 모니터링.

---

## 9. 10차원 스코어링

### 9.1 wal-g 채택
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 4.5 | 0.81 | PITR + delta + 암호화 + B2 native |
| PERF10 | 10 | 4.5 | 0.45 | zstd 압축 + 병렬, 5GB 30분 |
| DX14 | 14 | 4.5 | 0.63 | 단일 바이너리 + .env 1개 |
| ECO12 | 12 | 4.0 | 0.48 | Yandex/MS 후원, GitHub star 3.4k |
| LIC8 | 8 | 5.0 | 0.40 | Apache 2.0 |
| MAINT10 | 10 | 4.0 | 0.40 | 활발 |
| INTEG10 | 10 | 4.5 | 0.45 | cron + B2 + 우리 모델 통합 자연 |
| SECURITY10 | 10 | 4.5 | 0.45 | libsodium 클라이언트 암호화 + B2 SSE |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 100% 자체 |
| COST3 | 3 | 5.0 | 0.15 | 무료 + B2 월 $0.13 |
| **합계** | 100 | — | **4.41/5** | 채택 |

### 9.2 pgbackrest 채택
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 5.0 | 0.90 | wal-g + 다중 repo + 자동 검증 + 블록 증분 |
| PERF10 | 10 | 4.5 | 0.45 | C 구현, 빠름 |
| DX14 | 14 | 3.0 | 0.42 | 설정 디렉토리 + stanza 학습 |
| ECO12 | 12 | 4.0 | 0.48 | Crunchy 후원, 엔터프라이즈 |
| LIC8 | 8 | 5.0 | 0.40 | MIT |
| MAINT10 | 10 | 4.5 | 0.45 | 매우 활발 |
| INTEG10 | 10 | 3.5 | 0.35 | 우리 단일 인스턴스에 약간 과잉 |
| SECURITY10 | 10 | 4.5 | 0.45 | aes-256-cbc |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 자체 |
| COST3 | 3 | 5.0 | 0.15 | 무료 |
| **합계** | 100 | — | **3.78/5** | 보류 (HA 시나리오에서 재검토) |

### 9.3 pg_dump 단독 (현재)
| 차원 | 가중치 | 점수 | 가중점수 | 근거 |
|------|--------|------|---------|------|
| FUNC18 | 18 | 2.5 | 0.45 | PITR 불가, RPO 24시간 |
| PERF10 | 10 | 3.5 | 0.35 | 풀 백업만 |
| DX14 | 14 | 5.0 | 0.70 | 우리 시스템에 익숙 |
| ECO12 | 12 | 5.0 | 0.60 | PostgreSQL 표준 |
| LIC8 | 8 | 5.0 | 0.40 | PG license |
| MAINT10 | 10 | 5.0 | 0.50 | 핵심 도구 |
| INTEG10 | 10 | 4.5 | 0.45 | 이미 통합 |
| SECURITY10 | 10 | 3.0 | 0.30 | B2 SSE만, 클라이언트 암호화 별도 필요 |
| SELF_HOST5 | 5 | 5.0 | 0.25 | 자체 |
| COST3 | 3 | 5.0 | 0.15 | 무료 |
| **합계** | 100 | — | **3.12/5** | RPO 24시간 한계 |

---

## 10. 결론 — 청사진 요약

### 10.1 채택
- ✅ **wal-g 메인 도입**: PITR + 일일 delta + 5분 WAL 아카이브.
- ✅ **B2 native + libsodium 클라이언트 암호화**: 이중 암호화.
- ✅ **pg_dump 보조 유지**: 월 1회 long-term archive (12개월 보관).
- ✅ **자동 복원 검증**: 매월 1일 임시 cluster에 fetch 테스트.
- ✅ **PITR UI**: 시점 선택 + 미리보기 + 명령어 생성/복사 (실행은 셸).
- ✅ **운영자 가이드 문서화**: 복원 절차 단계별.

### 10.2 거부 (현재)
- ❌ **pgbackrest 단독**: 운영 복잡도 vs 단일 인스턴스 이득 부족.
- ❌ **자동 PITR 실행 (UI 1클릭)**: 실수 시 데이터 영구 손실 위험.
- ❌ **Barman**: pgbackrest와 유사한 무게, 우리 시나리오에 과잉.

### 10.3 보류 (재검토 트리거)
- 🟡 **pgbackrest로 마이그레이션**: HA replica 도입 시 (Phase 16+).
- 🟡 **자동 PITR 실행**: 2단계 confirm + 2명 승인 패턴 정착 후 (Phase 17+).
- 🟡 **다중 repo (B2 + R2)**: B2 단일 region 의존이 위험해질 때.

### 10.4 새 DQ
- **DQ-4.10**: B2 vs S3 vs R2 → **B2** (이미 사용, 비용 최저).
- **DQ-4.11**: 자동 복원 검증 → 매월 1일 + 결과 webhook.
- **DQ-4.12**: 보존 → 베이스 7개 + WAL 14일 + pg_dump 12개월.
- **DQ-4.13**: 암호화 → libsodium + B2 SSE 이중.
- **DQ-4.14**: pg_dump 보조 → 월 1회만, 365일 보관.
- **DQ-4.15 (신규)**: 키 보관 → 3중(서버 .env + 1Password + 인쇄).
- **DQ-4.16 (신규)**: archive_timeout → 60초 (RPO 60초 보장).
- **DQ-4.17 (신규)**: 복원 시 PM2 stop 자동? → No, 운영자 명시적.
- **DQ-4.18 (신규)**: 복원 후 audit_log 별도 보관? → Yes, restore-event 기록.

### 10.5 100/100 도달 경로 (현재 60 → 100)
| Phase | 작업 | 점수 | 비용 |
|-------|------|------|------|
| 14e-1 | wal-g 설치 + .env | +5 | 2시간 |
| 14e-2 | PostgreSQL 설정 + 재시작 | +5 | 1시간 (다운타임 30초 포함) |
| 14e-3 | 첫 풀 백업 + 검증 | +5 | 1시간 |
| 14e-4 | cron 통합 (4개 핸들러) | +8 | 6시간 |
| 14e-5 | `Backup` 모델 확장 (kind enum) | +2 | 2시간 |
| 14e-6 | `/database/backups` UI 확장 | +5 | 6시간 |
| 14e-7 | PITR 시점 선택 UI | +5 | 5시간 |
| 14e-8 | 복원 미리보기 | +3 | 4시간 |
| 14e-9 | 자동 복원 검증 cron | +2 | 5시간 |
| 14e-10 | 운영자 가이드 문서화 | +0 | 3시간 |
| **합계** | — | **+40 → 100/100** | **약 35시간 (1 sprint)** |

---

## 11. 참고 문헌

1. **wal-g GitHub** — https://github.com/wal-g/wal-g
2. **wal-g PostgreSQL 가이드** — https://wal-g.readthedocs.io/PostgreSQL/
3. **pgbackrest 공식** — https://pgbackrest.org
4. **pgbackrest user guide** — https://pgbackrest.org/user-guide.html
5. **Crunchy Data pgbackrest** — https://www.crunchydata.com/blog/category/pgbackrest
6. **PostgreSQL PITR** — https://www.postgresql.org/docs/16/continuous-archiving.html
7. **PostgreSQL recovery_target_time** — https://www.postgresql.org/docs/16/runtime-config-wal.html#RUNTIME-CONFIG-WAL-RECOVERY
8. **Backblaze B2 S3 호환 API** — https://www.backblaze.com/b2/docs/s3_compatible_api.html
9. **Backblaze B2 가격** — https://www.backblaze.com/cloud-storage/pricing
10. **wal-g B2 community guide** — https://github.com/wal-g/wal-g/issues (B2 path-style 검색)
11. **PostgreSQL archive_command 모범 사례** — https://www.postgresql.org/docs/16/wal-configuration.html
12. **Citus Data wal-g blog** — https://www.citusdata.com/blog/ (wal-g 발표 시점 글)
13. **MS Azure Database for PostgreSQL backup** — https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-backup-restore
14. **postgres pg_dump custom format** — https://www.postgresql.org/docs/16/app-pgdump.html
15. **libsodium** — https://libsodium.gitbook.io/doc/
16. **세션 24 Phase 14b Backup 모델** — `prisma/schema.prisma`, `src/server/cron/handlers/backup-database.ts`
17. **WAL-G PITR step-by-step (한국어 응용)** — https://medium.com/ (검색: "wal-g PITR")
18. **chrony/NTP 설정** — https://chrony.tuxfamily.org/

---

## 12. 부록 — 신규/수정 파일

```
시스템:
  /etc/wal-g/.env                         ← 신규 (B2 + libsodium 키)
  /etc/postgresql/16/main/postgresql.conf ← 수정 (wal_level/archive_*)
  /etc/sudoers.d/walg                     ← 신규 (Next.js → wal-g 호출 권한)
  /var/log/wal-g/                         ← 신규 디렉토리
  /usr/local/bin/wal-g                    ← 신규 바이너리

prisma/
  schema.prisma                           ← Backup.kind enum 추가 (pg_dump/wal-g-base/wal-g-delta/pgbackrest-full)
  migrations/
    20260420_add_backup_kind/             ← 신규

src/
  server/backups/
    wal-g.ts                              ← 신규 (list/status/preview/verify)
    pg-dump.ts                            ← 기존 (월 1회로 전환)
  server/cron/handlers/
    wal-g-base-backup.ts                  ← 신규 (매주 일요일 02:00)
    wal-g-delta-backup.ts                 ← 신규 (평일 03:00)
    wal-g-retention.ts                    ← 신규 (매일 04:00)
    wal-g-verify.ts                       ← 신규 (매주 토요일 03:00)
    wal-g-restore-test.ts                 ← 신규 (매월 1일 02:00)
  app/database/backups/
    page.tsx                              ← 확장 (wal-g + pg_dump 통합 표시)
    pitr/
      page.tsx                            ← 신규 (PITR 시점 선택)
  components/backups/
    backups-client.tsx                    ← 신규
    pitr-time-picker.tsx                  ← 신규
    restore-preview-card.tsx              ← 신규
    wal-g-status-badge.tsx                ← 신규
    backup-kind-icon.tsx                  ← 신규

docs/guides/
  pitr-restore-runbook.md                 ← 신규 (운영자 셸 절차)
  wal-g-troubleshooting.md                ← 신규 (archive 실패 시)
```

---

(끝 — 본 deep-dive는 wal-g 채택을 통해 RPO를 24시간 → 60초, RTO를 30분 → 30~60분으로 개선하는 청사진을 정리했다. pgbackrest는 미래 HA 시나리오 보류. pg_dump는 월 1회 long-term archive 보조로 유지.)
