# SeaweedFS 운영 모니터링 가이드

> 상위: [CLAUDE.md](../../CLAUDE.md) → [docs/guides/](./README.md) → **여기**
> 관련 ADR: [ADR-033 SeaweedFS 자가호스팅](../research/decisions/ADR-033-seaweedfs-self-hosted-object-storage.md) (ACCEPTED 2026-05-01)
> 관련 SP: [SP-016 SeaweedFS 50GB 부하 테스트](../research/spikes/spike-016-seaweedfs-50gb-result.md) (ACCEPTED 2026-05-01, 4/4 임계 PASS)
> 이전 가이드: ~~[r2-monitoring.md](./r2-monitoring.md)~~ (SUPERSEDED 2026-05-01)

## 1. 목적

ADR-033 SeaweedFS 자가호스팅 운영 단계에서 다음 3종 트리거를 사람 눈 의존 없이 모니터링.

R2 가이드의 청구/저장/wall-clock 3종 트리거와 달리 외부 청구 부담 0. 대신 **자가호스팅 인프라 측면 모니터링** (디스크 / 메타데이터 / process 건강성) 으로 트리거 재정의.

| 트리거 | 임계 | 발화 액션 |
|-------|------|----------|
| **T1. 디스크 사용량** | WSL `/dev/sdd` 80% | cleanup cron (multipart 부분 객체) 또는 외주 오프로드 정책 결정 |
| **T2. 디스크 사용량** | WSL `/dev/sdd` 90% | 즉시 비활성 파일 정리 / 운영자 PUT 차단 / 외주 오프로드 즉시 |
| **T3. SeaweedFS process 다운** | PM2 `seaweedfs` errored 또는 status != online | `pm2 restart seaweedfs` + 로그 분석 + 24h 내 SeaweedFS 4.x → Garage 재평가 검토 |
| **T4. filer 응답 시간** | filer port 8888 평균 > 500ms | leveldb 전환 (sqlite → leveldb) — `~/seaweedfs/filer.toml` 적용 + weed restart |
| **T5. SIGKILL 후 재시작** | > 60s 평균 1주 지속 | Garage(Rust) PoC 진입 (No-Go 트리거, ADR-033 §6) |

## 2. 자동화 명령

### 2.1 디스크 사용량 (T1/T2)

```bash
# WSL2 안에서
wsl -- bash -lic 'df -h / | awk "NR==2 { sub(/%/,\"\",\$5); print \$5 \"%\" }"'
```

또는 SeaweedFS volume 디렉토리만:
```bash
wsl -- bash -lic 'du -sh ~/seaweedfs/data ~/seaweedfs/filer'
```

**알림 자동화 옵션** (선택):
- WSL crontab 1일 1회 디스크 80% 도달 시 운영자 이메일/텔레그램 (별도 PR)
- 또는 ypserver 내 cron `disk-monitor` 등록 (cron runner kind 확장 필요)

### 2.2 SeaweedFS process 건강성 (T3)

```bash
# PM2 status
wsl -- bash -lic 'pm2 jlist | jq ".[] | select(.name==\"seaweedfs\") | { status: .pm2_env.status, restart: .pm2_env.restart_time, uptime: (now * 1000 - .pm2_env.pm_uptime) }"'
```

기대값:
- `status = "online"`
- `restart_time` 변화 없음 (24h 내 +0)
- `uptime > 1h` (잦은 재시작 경계 5분 이내 = 불안정)

### 2.3 filer 응답 시간 (T4)

```bash
# filer HTTP API ping (5회 평균)
wsl -- bash -lic 'for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{time_total}\n" http://127.0.0.1:8888/; done | awk "{ s+=\$1 } END { printf \"%.0fms\n\", s/NR*1000 }"'
```

### 2.4 multipart 누적 (cleanup 부채)

```bash
# stale multipart 점검
wsl -- bash -lic 'echo "s3.clean.uploads -timeAgo=24h" | /home/smart/bin/weed shell -master=127.0.0.1:9333'
```

**주기**: 매주 1회 권장. 24h+ stale multipart 자동 삭제. (multipart 후속 PR S78-? 머지 후 부채 활성화)

## 3. 액션 매트릭스

| 트리거 | 1주 내 액션 | 1개월 내 액션 |
|-------|------------|--------------|
| T1 80% | multipart cleanup cron 실행 + 운영자 사이즈 큰 파일 정리 안내 | 디스크 추가 (USB 외장 HDD 또는 NVMe 추가 mount) |
| T2 90% | 운영자 즉시 PUT 차단 + 비활성 파일 정리 | 외주 오프로드 정책 결정 (B2 backup 또는 SeaweedFS multi-tier) |
| T3 process 다운 | `pm2 restart seaweedfs` + 로그 24h 분석 | crash 빈도 정량 — 월 2회+ 시 Garage PoC 진입 결정 |
| T4 filer 500ms+ | leveldb 전환 1회 작업 (sqlite → leveldb) — 30분 추정 | filer 백엔드 옵션 재평가 (postgres / leveldb / mysql 등) |
| T5 restart 60s+ | 적재 사이즈 점검 + volume 분할 또는 SSD 교체 | Garage(Rust) PoC 진입 — ADR-033 §6 No-Go 트리거 |

## 4. WSL2 자체 crash 복구

운영자 가치관 "내 컴퓨터" 정합성 측면의 단일 머신 단점 — Windows 재부팅 시 PM2 dump 자동 복원 미적용:

```powershell
# Windows 측 (재부팅 후)
wsl -d Ubuntu

# WSL 측
pm2 resurrect
pm2 list  # ypserver / cloudflared / seaweedfs 모두 online 확인
```

PM2 startup 자동화는 별도 결정 (운영자 가치관 영향 별도). 지금은 수동 resurrect.

## 5. multipart cleanup 부채 추적 (S78-? 머지 후)

multipart 통합 PR (S78-?) 머지 후:

| 항목 | 적용 시점 | 비고 |
|------|---------|------|
| `s3.clean.uploads -timeAgo=24h` 주 1회 cron | 머지 직후 | cron runner kind 확장 또는 별도 스케줄러 |
| `~/seaweedfs/data/` 의 `_multipart_*` 디렉토리 점검 | 매월 1회 | SeaweedFS 자체 cleanup 누락 시 manual rm |
| filer leveldb 전환 트리거 | 50만+ 메타데이터 entry 도달 시 | sqlite default 본 운영 누적 시 자연 도달 |

## 6. 비교 — R2 → SeaweedFS 운영 부담 변화

| 측면 | R2 (이전) | SeaweedFS (현재) |
|------|---------|----------------|
| 외부 청구 알람 (T1/T2/T3) | 필수 | **불필요** ($0 영구) |
| 디스크 사용량 알림 (T1/T2) | 불필요 (외주 무한) | **필수** (자가 1TB 한도) |
| Process 건강성 (T3) | 불필요 (Cloudflare 측 SLA) | **필수** (PM2 seaweedfs +1) |
| filer 응답 (T4) | 불필요 | **필수** (sqlite → leveldb 전환 트리거) |
| restart 시간 (T5) | 불필요 | **필수** (Garage PoC 트리거) |
| multipart cleanup | 24h pending R2 cleanup cron (S77-A SUPERSEDED) | multipart 후속 PR 시 재부활 |

운영 부담 +3 항목 (디스크 / process / filer) — 외부 청구 부담 0 으로 상쇄. 가치관 정합성 ↑.

## 7. 변경 이력

- **2026-05-01 v1.0** 신규 — 세션 77 옵션 C 새 터미널 PHASE 5. ADR-033 ACCEPTED 동시 적용. r2-monitoring.md SUPERSEDED.
