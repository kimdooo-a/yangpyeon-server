# 인수인계서 — 세션 77 옵션 C 새 터미널 실행 (R2 → SeaweedFS 자가호스팅)

> 작성일: 2026-05-01
> 자매 handover: [260501-session77-r2-questioning-seaweedfs-pivot.md](./260501-session77-r2-questioning-seaweedfs-pivot.md) (본 터미널 = 가치관 충돌 표면화 + 옵션 C 결정)
> 본 handover: 옵션 C 새 터미널 = 본 conversation = 7 PHASE 마이그레이션 직접 실행
> 결과: 5 commits (ee68a07 / 87de464 / 28273a0 / 63521d2 + 다른 터미널 19454d4)

---

## 1. 본 세션 정체성

세션 77 본 터미널이 §S77-W 배포 + §S77-B Step 2 R2 청구 알람 진행 중 운영자 가치관 충돌 표면화 (저널 [4]) → 옵션 C 채택 → **새 터미널용 7 PHASE self-contained 프롬프트 작성** (저널 [5]). 본 conversation = 그 새 터미널 역할로서 7 PHASE 직접 실행.

## 2. 7 PHASE 실행 결과

| PHASE | 작업 | 결과 | commit |
|-------|------|------|--------|
| 0 | S77-A R2_CLEANUP cron supersede 통보 | ✅ | `ee68a07` |
| 1 | SP-016 SeaweedFS 50GB 정량 검증 | ✅ ACCEPTED 4/4 임계 PASS | `87de464` |
| 2 | SeaweedFS 운영 모드 PM2 등록 | ✅ (코드 변경 0, PM2 dump only) | — |
| 3 | R2 → SeaweedFS endpoint 교체 (C1 옵션 A) | ✅ +42/-20 | `28273a0` |
| 4 | 빌드 + 배포 + 회귀 검증 | ✅ HTTP 307×3, 회귀 ping 9/9, 신규 에러 0건 | (코드 commit 없음) |
| 5 | ADR-032 SUPERSEDED + ADR-033 ACCEPTED + 가이드 supersede | ✅ +364/-3, 4 파일 | `63521d2` |
| 6 | 운영자 R2 콘솔 정리 안내 | ✅ **운영자가 PHASE 0 시점 이미 콘솔 삭제 완료** (안내 무용) | — |
| 7 | /cs 의식 + push | 진행 중 (본 handover) | (다음 commit) |

## 3. 핵심 발견 — Cloudflare Tunnel 100MB 한계 vs 동적 IP/CGNAT 인프라 강제

PHASE 3 진입 직전 plan 미검토 영역 표면화. 본 세션 분석 (운영자 가설 검증):

> "IP가 고정이 아니기 때문에 계속 cloudflare에 의존하는 구조라서 그렇다."

**검증 결과 정확히 맞음.** 동적 IP + ISP CGNAT 가능성 → cloudflare tunnel outbound-only persistent connection 이 사실상 강제. 100MB hard limit 은 인프라 측 회피 불가능 → 코드 측 multipart upload 가 유일한 회수 경로.

이 분석으로 결정 트리 재정의:

| 우회 방식 | 가치관 정합 | 코드 영향 | 결과 |
|---------|----------|---------|------|
| cloudflare tunnel 추가 hostname | 동일 | 0 | ❌ 100MB 동일 |
| DDNS + 라우터 포트포워딩 | ✅ | 0 (인프라) | ❌ CGNAT 직격 |
| **Multipart upload (S3 multipart)** | ✅ | +50~100줄 / 후속 PR ~530줄 | ✅ 정석 |
| Cloudflare Business($200/mo) | ❌ 가치관 위배 | 0 | ❌ |

본 세션 채택: **C1 endpoint 교체 + 다운로드 stream + 50~90MB 즉시 작동 + multipart 후속 PR S78-? 별도**.

## 4. 작동 범위 (현 시점, C1 머지 후)

| 파일 사이즈 | 분기 | 작동 |
|----------|------|------|
| < 50MB | local storage (변경 없음) | ✅ |
| 50MB ~ 90MB | 단일 PUT presigned URL via SeaweedFS S3 | ✅ (cloudflare tunnel 통과) |
| 90MB ~ 100MB | 단일 PUT (margin 위험) | ⚠️ 99% OK |
| **100MB+** | 단일 PUT 시 stream RST | **❌ 회귀 — multipart S78-? 까지** |

운영자 본인 일상 파일 (≤80MB 추정) 즉시 복구. 1GB+ 큰 파일은 후속 PR 까지 일시 회귀.

## 5. 인프라 변경 결과

- **PM2**: ypserver online (pid 192531 → 205677, restart 15→16) + cloudflared 5D + **seaweedfs neu pid 199807 (uptime 76m+)**
- **버킷**: `yangpyeon-filebox` (SeaweedFS, weed shell s3.user.provision)
- **IAM**: ypserver user readwrite role + access key (.env 적용)
- **디스크**: 944GB 여유 / 65MB SeaweedFS data (50GB 부하 후 cleanup, content-addressing 효과)
- **R2 (Cloudflare)**: bucket 삭제 + API token revoke + 알람 삭제 (운영자 본인, PHASE 0 시점)

## 6. 코드 변경 요약 (5 commits, +750/-30)

| commit | 내용 | 파일 | +/- |
|--------|------|------|----|
| `ee68a07` | next-dev-prompt §S77-A SUPERSEDED note | 1 | +7/-1 |
| `87de464` | spike-016 §5 결과 + sp016-load-test.py | 2 | +308/-7 |
| `28273a0` | r2.ts endpoint + [id]/route.ts stream | 2 | +42/-20 |
| `63521d2` | ADR-032 SUPERSEDED + ADR-033 + r2-monitoring SUPERSEDED + seaweedfs-monitoring | 4 | +364/-3 |
| (다른 터미널) `19454d4` | docs(s77): /cs 세션 종료 (가치관 충돌 표면화 + 옵션 C 결정) | (별도) | (별도) |

총 본 세션 코드/문서: 9 파일, +721/-31.

memory 영역 (별도):
- `reference_r2_alarm_threshold.md` SUPERSEDED note (+7)
- `reference_seaweedfs_self_hosted.md` 신규 (+62)
- `MEMORY.md` 인덱스 갱신 (R2 supersede + SeaweedFS 신규 row)

## 7. 검증 결과 (PHASE 4)

```
빌드:        ✅ WSL 네이티브 (better_sqlite3 ELF Linux x86-64)
패키징:      ✅ pack-standalone.sh + ELF 검증
배포:        ✅ ~/ypserver/ 동기화
Drizzle:    ✅ 4 마이그 모두 applied (skip 0건)
PM2:        ✅ ypserver online — pid 205677, restart 16
Tunnel:     ✅ cloudflared 5D
헬스체크:    ✅ localhost:3000 → HTTP 307 × 3
신규 에러:   ✅ 0건 (ERR_DLOPEN_FAILED / Prisma / EADDRINUSE 0)
회귀 ping:   ✅ 9 라우트 (401×6, 403×1, 405×2) — auth gate 차단
```

## 8. 미해결 — 후속 작업 (S78-?)

### S78-A. multipart upload 통합 (P0, ~3.5h, ~530줄 PR)

- **이유**: 90MB+ 파일 PUT 회귀 회수
- **범위**:
  - `src/lib/r2.ts` (또는 `object-storage.ts` rename) multipart 함수 4개 추가 (`presignMultipartCreate`, `presignUploadPart` × N, `completeMultipart`, `abortMultipart`)
  - 신규 라우트 3개 (`/api/v1/filebox/files/multipart/{create, complete, abort}`)
  - `src/components/filebox/file-upload-zone.tsx` chunk 분할 + 병렬 PUT × 3-5 + 진행률 통합 + abort 처리
  - chunk size 50~80MB (cloudflare 100MB 안전 마진)
  - presigned URL 만료 시간 1h 로 설정 (default 5분 — 1GB 파일 13 chunk 5분 부족)
- **테스트**: 단위 (chunk 분할 / ETag 수집) + E2E (1 chunk → 2 chunk → 13 chunk 점진)
- **주의**: SeaweedFS multipart S3 표준 호환 + `s3.clean.uploads -timeAgo=24h` 자체 cleanup 제공 (24h+ stale auto abort)

### S78-B. multipart cleanup cron (P1, ~30분, S78-A 후속)

`s3.clean.uploads` 명령 cron 등록 (주 1회). 또는 cron runner kind 확장 — `S77-A SUPERSEDED 다음 sub-task` 의 부활.

### S78-C. filer leveldb 전환 (P2, 50만 entry 도달 시)

운영 누적 시 sqlite default → leveldb 전환. 1회 작업 ~30분. ADR-033 §위험 R4 트리거.

### S78-D. PM2 startup 자동화 (P2, 운영자 결정)

WSL2 자체 crash 후 수동 `pm2 resurrect` 부담 — `pm2 startup` 적용 시 자동 복원. 운영자 가치관 ("내 컴퓨터" 정합성) 영향 별개 결정.

### S78-E. 인증 50MB+ PUT 실측 (이월 from S78-C 자매 handover)

운영자 본인 stylelucky4u.com → /filebox 로그인 → 60MB 파일 PUT → 진행률 + 업로드 완료 + 다운로드 stream + 삭제 검증. SeaweedFS 환경에서 ALS 진짜 회귀 검증 + 본 옵션 C C1 마이그레이션 작동 검증 동시.

### S78-F. CGNAT 여부 즉시 확인 (P2, 5초)

`curl ifconfig.me` 결과 vs 라우터 LAN WAN IP 비교. 다르면 CGNAT 확정. 같으면 옵션 P5 (DDNS + 직접 노출) 재고 가능 (보안 부담 별개).

## 9. 학습 / 메타

### 9.1 운영자 가치관 정합성 점검 매트릭스 (CK 1호 적용)

ADR-033 §7 "운영자 가치관 정합성 점검 6 항목" 신설 — `docs/solutions/2026-05-01-external-service-adr-value-alignment-gap.md` 의 패턴을 ADR 본문에 baked-in. 향후 ADR-034+ 부터 §"운영자 가치관 정합성 점검" 섹션 신설 권장.

### 9.2 plan 검증 — 인프라 강제 vs 코드 회피

운영자 plan PHASE 3 옵션 A "~10줄" 추정과 실제 PR 사이즈 (~530줄) 의 50× 격차는 **plan 작성 시 cloudflare tunnel 100MB 한계 미검토** 에 기인. 운영자 plan 도 검증 필요 — Claude 가 plan 따라가면 검증 누락 위험. 본 세션은 PHASE 3 진입 전에 한계 표면화 + 운영자 결정 받음.

→ 메모리 룰 후보 (다음 세션): "운영자 plan 의 추정 줄수가 함수 시그니처 변경 단순 매트릭스를 넘어가면 plan 미검토 영역 의심 — 진입 전 확인" (가칭 `feedback_plan_estimation_skepticism.md`).

### 9.3 동시 터미널 작업 안전성

본 세션 진행 중 다른 터미널이 next-dev-prompt.md 갱신 (§S78 추천 작업) + commit `19454d4 docs(s77): /cs 세션 종료` push. 본 세션 PHASE 0 commit `ee68a07` 위에 다른 터미널 19454d4 가 합류, 본 세션 PHASE 1+ commits 가 19454d4 위에 쌓이는 비순차 합류 발생. 충돌 0 — 영역 분리 (다른 터미널 = handover/journal/current.md, 본 세션 = 코드/ADR/가이드/메모리).

`feedback_concurrent_terminal_overlap.md` 의 baseline check 룰이 효력 발휘 — 본 세션 PHASE 0 진입 시 git log 점검으로 R2_CLEANUP commit 0건 확인 → safe.

## 10. 다음 세션 권장 첫 작업

1. **S78-F CGNAT 확인** (5초) — `curl ifconfig.me` vs 라우터 WAN IP 비교
2. **S78-E 인증 50MB+ PUT 실측** (운영자 본인, 10분) — C1 작동 검증 + ALS 회귀 결정적 검증
3. **S78-A multipart 통합 PR** (P0, ~3.5h) — 90MB+ 파일 회귀 회수
4. (이월) Almanac aggregator 비즈니스 로직 (~28h, S78-E 별도 트랙)

본 세션 잔존 미커밋: `.claude/settings.json` (운영자 임의 변경, 본 작업 무관) + 잔재 untracked.

## 11. 관련 문서

- ADR-033: `docs/research/decisions/ADR-033-seaweedfs-self-hosted-object-storage.md`
- SP-016: `docs/research/spikes/spike-016-seaweedfs-50gb-result.md` §5
- 운영 가이드: `docs/guides/seaweedfs-monitoring.md`
- 자매 handover: `docs/handover/260501-session77-r2-questioning-seaweedfs-pivot.md`
- 메모리: `~/.claude/projects/.../memory/reference_seaweedfs_self_hosted.md`
- 부하 테스트 도구: `scripts/sp016-load-test.py`
