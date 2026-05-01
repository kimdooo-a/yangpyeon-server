# ADR-033: 파일박스 객체 스토리지 — SeaweedFS 자가호스팅 (옵션 C)

- **상태**: **ACCEPTED 2026-05-01 (세션 77 옵션 C)**
- **날짜**: 2026-05-01 (세션 77 옵션 C 새 터미널, 운영자 가치관 충돌 표면화 직후)
- **결정자**: 프로젝트 오너 (smartkdy7@naver.com) — 옵션 C 채택 + R2 콘솔 즉시 삭제
- **이전 ADR**: [ADR-032](./ADR-032-filebox-large-file-uploads.md) (2026-05-01 세션 71 Accepted → 본 ADR 로 SUPERSEDED 2026-05-01 세션 77)
- **입력**:
  - 가치관 점검 누락 패턴: `docs/solutions/2026-05-01-external-service-adr-value-alignment-gap.md` (세션 77)
  - 정량 검증: [SP-016 SeaweedFS 50GB 부하 테스트](../spikes/spike-016-seaweedfs-50gb-result.md) §5 실측 (2026-05-01, 4/4 임계 PASS)
  - 진단 (역사): `docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md` (세션 70)
- **상위 ADR**: ADR-022~030 (baas-foundation), ADR-008 Storage (supabase-parity, ASM-4 검증 완료)

---

## 1. 컨텍스트 — 운영자 가치관 충돌 표면화

### 1.1 ADR-032 결정 후 노출된 모순

세션 77 운영자 핵심 질문:
> "왜 R2 같은 지출 서비스를 쓰게 만들었나? 내 컴퓨터, 돈 안 쓰는 자가 서버."

ADR-032 §"결정자" = "프로젝트 오너 (R2 토큰 직접 발급 + PoC 6/6 합격 후 V1 옵션 A 즉시 적용)" 로 명시되어 있으나, 결정 시점에 운영자 본인의 핵심 가치관 ("내 컴퓨터, 돈 안 쓰는, 외부 의존 0") 정합성 점검 누락이 사후 표면화. 즉 ADR-032 의 트레이드오프 매트릭스 (§3 옵션 A~E) 에서 "비용/부담 vs 외부 의존" 축이 운영자 가치관 가중치 없이 평가됨.

### 1.2 R2 hybrid 의 근본 동기 = Cloudflare Tunnel 100MB 우회

ADR-032 채택의 핵심 동기는 cloudflare tunnel 무료/Pro 의 **request body 100MB hard limit** 우회. R2 endpoint (`r2.cloudflarestorage.com`) 가 cloudflare 외부라 브라우저 직접 PUT 시 tunnel 통과 X.

이 우월점이 옵션 C SeaweedFS 자가호스팅 시 부분 상실 — SeaweedFS endpoint (`http://127.0.0.1:8333`) 는 localhost only 라 외부 노출 시 cloudflare tunnel 통과 강제 → 100MB 한계 부활.

### 1.3 동적 IP + ISP CGNAT 인프라 제약

세션 77 토론에서 운영자 정확히 제기:
> "IP가 고정이 아니기 때문에 계속 cloudflare에 의존하는 구조라서 그렇다."

가정용 인터넷 (KT/SK/LG) 의 동적 IP + ISP CGNAT 환경에서:

| 외부 노출 방식 | 동적 IP 대응 | CGNAT 대응 | 비용 | 결과 |
|--------------|------------|-----------|-----|------|
| 정적 IP + DNS A 레코드 | ❌ | ❌ | KT 정적 IP +$30/월 | 가치관 위배 |
| DDNS + 라우터 포트포워딩 | ✅ | ❌ CGNAT 시 무용 | $0 | CGNAT 환경 불가 |
| **Cloudflare Tunnel** (현재) | ✅ outbound | ✅ outbound | $0 | **100MB hard limit** |
| Tailscale Funnel | ✅ outbound | ✅ outbound | $0 | 동등 100MB 패턴 (beta) |
| Self-hosted VPS relay | ✅ | ✅ | VPS $5~10/월 | 가치관 위배 |

→ "내 컴퓨터, 돈 안 쓰는, 동적 IP, CGNAT 가능" 4 조건 교집합 = Cloudflare Tunnel 사실상 강제. 100MB 한계는 **회피 불가능한 인프라 상수**.

→ 따라서 회피는 **코드 측면 multipart upload** 만 가능 (S3 multipart API, 각 part < 100MB).

> **CGNAT 검증 (S78-F, 2026-05-01)**: `curl ifconfig.me` → `118.33.222.67` (KT 정상 IPv4 대역, NOT CGNAT 100.64.0.0/10). 운영자 가설 "CGNAT 강제" 는 반증되었으나, §3.5 옵션 (DDNS + 포트포워딩) 거부 이유 (운영 부담 ↑ + 보안 부담 + Let's Encrypt 갱신 1인 BaaS 정합 X) 는 그대로 유효. Cloudflare Tunnel 강제 결정 영향 0.

---

## 2. 결정

### 2.1 옵션 C SeaweedFS 자가호스팅 채택

- **Endpoint**: `http://127.0.0.1:8333` (localhost only, PM2 `seaweedfs` process)
- **Filer backend**: sqlite default (SP-016 §5 실측 통과). 운영 누적 50만+ entry 도달 시 leveldb 전환 (deferred)
- **버킷**: `yangpyeon-filebox` (R2 의 `yangpyeon-filebox-prod` 와 의미 동일, `-prod` suffix 는 자가호스팅 단일 환경이라 생략)
- **인증**: SeaweedFS S3 IAM access key (`weed shell s3.user.provision -name=ypserver -bucket=yangpyeon-filebox -role=readwrite`)
- **외부 노출**: ypserver 경유 stream forward (다운로드) + presigned PUT URL (업로드, < 100MB chunk)

### 2.2 코드 마이그레이션 — 옵션 A 단순 endpoint 교체 (C1, 본 ADR 머지)

`src/lib/r2.ts` 함수명/파일명은 옵션 A 의미 재정의 (S3 호환 클라이언트의 일반화된 이름):
- `R2_ACCOUNT_ID` 의존 제거 → `OBJECT_STORAGE_ENDPOINT` 직접 사용
- `region: 'auto' (R2)` → `'us-east-1' (SeaweedFS S3 표준 default)`
- `forcePathStyle: true` 추가 (SeaweedFS virtual-host style 미지원)
- 다운로드 분기 `302 redirect` → `ypserver GetObject + transformToWebStream + NextResponse` (SeaweedFS localhost 라 redirect 불가)

함수명 (`presignR2PutUrl`, `headR2Object`, `presignR2GetUrl`, `deleteR2Object`) 그대로 유지 — 외부 컨슈머 추가 시 후속 PR 에서 `object-storage.ts` rename.

### 2.3 작동 범위 — 사이즈별 분기

| 파일 사이즈 | 분기 | tunnel 통과 | 작동 |
|----------|------|----------|------|
| < 50MB | local storage (변경 없음) | ✅ | OK |
| 50MB ~ 90MB | 단일 PUT presigned URL via SeaweedFS S3 | ✅ < 100MB | OK |
| 90MB ~ 100MB | 단일 PUT (margin 위험) | ⚠️ marginal | 99% OK |
| 100MB+ | 단일 PUT 시 stream RST | ❌ | **회귀 — multipart 후속 PR S78-? 까지** |

본 ADR-033 V1 = 50MB ~ 90MB 즉시 작동. 100MB+ 는 후속 PR multipart 통합으로 회수.

### 2.4 multipart upload — S78-A 구현 (commit `963eba5`, 2026-05-01)

cloudflare tunnel 100MB 우회 = S3 multipart upload. **X1 server proxy 패턴 채택** (§2.5 참조). +495 / -160 = 335 net (s77 추정 ~530 보다 압축 — dead presign 제거 + rename 흡수).

작동 범위 (현 시점):
- ≤50MB: 로컬 POST (FILEBOX_DIR 디스크) — 변경 없음
- 50MB ~ 5GB: multipart upload (50MB part × N, 동시 3 슬롯)
- 5GB+: 클라이언트 차단

검증: tsc 0 / WSL 빌드 + 배포 PASS / upload-multipart/{init,part,complete,abort} 401 (auth gate) / 회귀 ping 9 라우트 401 / 신규 ALS 에러 0.
S78-E 운영자 60MB+ 실측은 별도 (ALS 결정적 회귀 검증 — auth-gate 진입 후 prismaWithTenant 호출 시점).

### 2.5 X1 server proxy vs X2 cloudflared S3 ingress — 아키텍처 결정 근거

**S78-A 진입 시 발견** — s77 PHASE 4 검증이 auth-gate ping 만 수행하고 actual upload 가 빠져 있어, C1 commit `28273a0` 의 r2-presigned/r2-confirm 라우트가 architecturally broken 상태로 머지된 사실이 표면화:

```
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:8333  (localhost only)
SeaweedFS S3 :8333 = 127.0.0.1 only (외부 도달 불가)
cloudflared ingress = stylelucky4u.com → :3000 만 (S3 ingress 부재)
→ presigned PUT URL 의 host 가 127.0.0.1:8333 → 브라우저 도달 불가
```

| 옵션 | 패턴 | 운영자 가치관 정합 | 100MB 한계 | 신규 외부 의존 |
|---|---|---|---|---|
| **X1 server proxy** ✅ | browser → tunnel → ypserver (SDK PutObject) → SeaweedFS localhost | ✅ "외부 의존 0" 정합 | 적용됨 → multipart 필수 | DNS 0 / CORS 0 |
| X2 cloudflared S3 ingress | s3.stylelucky4u.com → :8333, browser 직접 PUT | ⚠️ 외부 hostname + DNS A/CNAME 추가 + SeaweedFS CORS | 적용됨 → multipart 필수 | DNS 1건 + CORS 정책 |
| X3 hostname rewrite | presigned URL host string 치환 | ❌ SigV4 signature host 검증 깨짐 | — | — |

→ **X1 채택**. 양쪽 모두 multipart 필요한 동일 한계, 그리고 §1.1 "내 컴퓨터, 외부 의존 0" 운영자 핵심 가치 정합. 다운로드 패턴 (s77 stream forward) 과 대칭 → 일관성.

X1 의 트레이드오프: ypserver 가 part body 를 메모리 buffer 로 받아 SeaweedFS SDK 호출. 50MB part × 동시 3 = peak ~150MB 메모리. 8GB+ 머신에서 무시 수준.

**§7 운영자 가치관 정합성 점검 매트릭스 적용 결과**: 6/6 PASS (X2 의 §7-B "서비스 추가" 항목 기준 미달이 X1 채택 결정 요인).

---

## 3. 거부된 대안

### 3.1 옵션 A — R2 hybrid 유지 (ADR-032)

- 이유: 운영자 가치관 ("내 컴퓨터, 돈 안 쓰는") 위배. 무료 티어 정책 변경 위험 (Cloudflare R2 free tier 10GB egress / 1M class A operations / month — 변경 가능).
- 제거된 외부 의존: Cloudflare R2 bucket / API token / 자동 청구 (2026-05-01 운영자 본인 콘솔 삭제).

### 3.2 옵션 B — 외부 BaaS 채널 (Backblaze B2 / Wasabi / Storj)

- 이유: 외부 의존 동일. 가치관 위배. 비용 절감 (R2 대비 ~50%) 만으로는 부족.

### 3.3 옵션 D — 보류 (filebox 50MB 한도 유지, large-file 미지원)

- 이유: 운영자 본인 1.4GB 파일 이송 use case 가 실제 발생 (세션 70). 코드 변경 0 의 매력 있으나 UX 손실 ↑.

### 3.4 옵션 E — Garage (Rust, BSD-3-Clause)

- 이유: SeaweedFS PoC 통과 (SP-016 §5) → Garage 진입 트리거 미발동. SP-016 §4 No-Go 트리거 (restart > 60s / metadata 손실 / disk 80%) 도달 시 재평가.

### 3.5 옵션 (이론) — DDNS + 라우터 포트포워딩 + SeaweedFS 직접 노출

- 이유: §1.3 매트릭스대로 ISP CGNAT 환경 불가. CGNAT 미사용 시도 SeaweedFS S3 API 보안 (IAM signing + Let's Encrypt SSL + WAF) 운영 부담 ↑. 1인 BaaS 의 보안 부담 정합 X.

---

## 4. 결과

### 4.1 비용 영향

| 측면 | 변경 전 (R2) | 변경 후 (SeaweedFS) |
|------|------------|------------------|
| 월 사용료 | $0 ~ $5/월 (10GB 무료 + 초과 시 $0.015/GB) | **$0** 영구 |
| 외부 청구 위험 | T1 $5/월 알람 발화 가능 | 없음 |
| 디스크 비용 | 외주 (R2) | 자가 (WSL2 Ubuntu /dev/sdd 1TB) |
| 외부 의존 | Cloudflare R2 + API token + 자동 청구 | **0** |

### 4.2 운영 부담 영향

| 측면 | 변경 전 (R2) | 변경 후 (SeaweedFS) |
|------|------------|------------------|
| 모니터링 항목 | 청구 알람 (T1/T2/T3) | **디스크 사용량 (80%/90%) + filer leveldb 응답 시간** (별도 가이드 `docs/guides/seaweedfs-monitoring.md`) |
| Process 추가 | 0 | PM2 `seaweedfs` 1개 |
| Backup | Cloudflare 측 자동 (무료 티어 미명시) | 자가 (별도 결정 필요 — V1 미적용) |
| Cleanup cron | 24h pending R2 객체 회수 (S77-A SUPERSEDED) | incomplete multipart cleanup (multipart PR 시 재부활) |

### 4.3 SP-016 정량 근거 (실측 2026-05-01)

| 임계 | Go 기준 | 실측 | 결과 | 마진 |
|------|---------|------|------|------|
| 50GB throughput | > 50 MB/s | 566.53 MB/s | ✅ Go | 11.3× |
| 메모리 | < 1024 MB | 608.8 MB | ✅ Go | 40% 여유 |
| SIGKILL → 재시작 | < 120s | 22.1s | ✅ Go | 5.4× |
| 무결성 5/500 sample | 5/5 | 5/5 PASS + 재시작후 file-250 PASS | ✅ Go | exact |
| filer leveldb 50만 entry | < 100ms | sqlite default 미측정 | ⚠️ Deferred (운영 leveldb 전환 시) | — |

상세: `docs/research/spikes/spike-016-seaweedfs-50gb-result.md` §5.

### 4.4 함의 (가치관 정합성 증명)

| 운영자 가치 | 옵션 C 정합 |
|-----------|---------|
| "내 컴퓨터" | ✅ WSL2 Ubuntu 단일 머신 |
| "돈 안 쓰는" | ✅ $0 영구 (전기료 외) |
| "외부 의존 0" | ✅ Cloudflare 의존은 tunnel 만 (인프라 강제, §1.3 분석) |
| "단순 운영" | ⚠️ PM2 process +1 + 디스크 모니터링 추가 부담 |

---

## 5. 위험 / 미결 항목

| # | 위험 | 가능성 | 영향 | 완화 |
|---|------|------|------|------|
| R1 | 100MB+ 파일 PUT 회귀 (단일 presigned + tunnel 100MB 직격) | 확정 | 100MB+ 파일 업로드 0건 (multipart 후속 PR 까지) | 후속 PR S78-? multipart 통합. 운영자 본인 사용 빈도 미상, 일시 회귀 1주 ~ 2주 수용 |
| R2 | WSL 디스크 full (50GB+ 누적) | 중간 | 모든 파일 업로드 차단 + ypserver crash | `docs/guides/seaweedfs-monitoring.md` §디스크 사용량 알림 (80%/90%) + cleanup cron 후속 |
| R3 | SeaweedFS process crash + 재시작 22초 hot path 차단 | 낮음 | 재시작 동안 파일 업로드/다운로드 503 | PM2 `max_restarts` + 모니터링. SP-016 측정값 22.1s 는 50GB 적재 상태 — 운영 누적 시 증가 가능, 임계 60s |
| R4 | filer sqlite 메타데이터 50만+ entry 시 병목 | 낮음 | 응답 100ms+ 지연 | leveldb 전환 (별도 결정, 50만 entry 도달 시 트리거) |
| R5 | SeaweedFS multipart 알려지지 않은 호환 결함 | 낮음 | multipart 후속 PR 머지 차단 | PoC 점진 검증 (1 chunk → 2 chunk → 13 chunk) |
| R6 | WSL2 자체 crash (Windows 재부팅 등) | 중간 | 모든 PM2 process 다운 | PM2 `pm2 startup` 미적용 — Windows 재부팅 시 운영자 수동 `pm2 resurrect` 필요. 복구 절차는 ypserver skill §4-5 |
| R7 | 운영자 시간 부담 (PM2 process +1) | 낮음 | 운영 task 증가 ~5% | seaweedfs-monitoring.md 가이드 + PM2 일관 관리 |

---

## 6. No-Go 트리거 (재평가 조건)

다음 발생 시 ADR-033 재평가 + Garage(Rust) PoC 진입:

- **R3** SeaweedFS restart 평균 > 60s 1주 이상 지속 → Garage PoC 트리거
- **R4** filer 응답 시간 > 500ms 발견 → leveldb 전환 (즉시) 또는 Garage PoC
- **R2** WSL 디스크 80% 도달 → cleanup cron 또는 외주 오프로드 정책 결정
- **R5** multipart 알려지지 않은 결함 → manual chunked upload 또는 옵션 D 후퇴
- **R6** WSL2 crash 빈발 (월 2회+) → Linux 전용 머신 (운영자 가치관 영향 별도)

---

## 7. 운영자 가치관 정합성 점검 — 6 항목 (CK 후속 적용 1호)

`docs/solutions/2026-05-01-external-service-adr-value-alignment-gap.md` 의 6 항목 점검 매트릭스:

| # | 점검 항목 | 옵션 C 답 |
|---|----------|---------|
| 1 | "내 컴퓨터" 정합 | ✅ WSL2 Ubuntu 단일 머신 |
| 2 | "돈 안 쓰는" 정합 | ✅ $0 영구 |
| 3 | 외부 의존 최소 | ✅ Cloudflare tunnel 만 (인프라 강제) |
| 4 | 1인 운영 가능성 | ✅ PM2 process +1 + 디스크 모니터링 |
| 5 | 회귀 시 후퇴 가능성 | ⚠️ R2 콘솔 삭제로 후퇴 어려움 (재발급 30분 + 데이터 마이그레이션 별도) |
| 6 | 결정 기록 명시성 | ✅ ADR-033 + SP-016 + 새 가이드 + 메모리 룰 |

본 ADR-033 가 외부 서비스 도입 ADR 결정 시 §7 점검 매트릭스 적용 1호. 향후 ADR-034+ 부터 §"운영자 가치관 정합성 점검" 섹션 신설 권장.

---

## 8. 변경 이력

- **2026-05-01 v1.0** ACCEPTED — 세션 77 옵션 C 새 터미널, ADR-032 SUPERSEDED + SP-016 정량 근거. 코드 commit `28273a0` (C1 endpoint 교체). 후속 multipart PR S78-? 별도.
- **2026-05-01 v1.1** — 세션 78 S78-A multipart 구현 (commit `963eba5`). §2.4 multipart 완료 + §2.5 X1 server proxy 결정 추가 + §1.3 CGNAT 검증 footnote (NOT CGNAT — 운영자 가설 반증, §3.5 거부 이유는 그대로 유효).

---

## 9. 관련 파일

- `src/lib/r2.ts` — Object Storage 클라이언트 (의미 재정의, 함수명 R2_* 그대로) + multipart 4 함수 (s78)
- `src/app/api/v1/filebox/files/[id]/route.ts` — 다운로드 stream forward
- `src/app/api/v1/filebox/files/upload-multipart/{init,part,complete,abort}/route.ts` — multipart 라우트 4건 (s78, X1 server proxy)
- `src/components/filebox/file-upload-zone.tsx` — UI 50MB 분기 + uploadMultipart (50MB part × 동시 3 슬롯, s78)
- `src/lib/filebox-db.ts` — `deleteFile()` SeaweedFS 분기 (best-effort)
- `~/seaweedfs/start-weed.sh` — PM2 daemon entry script
- `~/seaweedfs/data/` — SeaweedFS volume data
- `~/seaweedfs/filer/` — filer leveldb (deferred)
- `docs/guides/seaweedfs-monitoring.md` — 운영 모니터링 가이드 (별도 신규)
- `docs/solutions/2026-05-01-plan-estimate-vs-reality-gap-infrastructure-blind-spot.md` — CK (cc231fd, sibling session) — plan 추정 50× 격차 = 인프라 측 미검토 영역 신호. **본 s78 자체가 그 패턴 추가 사례**: s77 PHASE 4 검증 gap (auth-gate ping 만, actual upload 빠짐) → C1 머지 후 S78-A 진입 시점에 architectural broken 상태 발견.

### ~~삭제됨~~ (s78 X1 server proxy 채택으로 대체)

- ~~`src/app/api/v1/filebox/files/r2-presigned/route.ts`~~ → `upload-multipart/init/route.ts` 로 대체 (browser 도달 불가능)
- ~~`src/app/api/v1/filebox/files/r2-confirm/route.ts`~~ → `upload-multipart/complete/route.ts` 로 흡수
- `docs/research/spikes/spike-016-seaweedfs-50gb-result.md` §5 — 정량 검증 근거
