# ADR-032: 파일박스 large-file 업로드 — Cloudflare R2 hybrid + 4단 게이트 해소

- **상태**: **Accepted (2026-05-01 세션 71)**
- **날짜**: 2026-05-01 (세션 71, PROPOSED → ACCEPTED 동일 세션 승격)
- **결정자**: 프로젝트 오너 — R2 토큰 발급 + PoC 6/6 합격 후 V1 옵션 A 즉시 적용
- **입력**:
  - 진단 문서: `docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md` (세션 70)
  - Spike: [SP-032](../spikes/spike-032-filebox-large-file-uploads.md)
- **상위 ADR 로그**: ADR-022~030 (baas-foundation), ADR-021 (audit cross-cutting)
- **관련 ADR**: ADR-008 Storage (supabase-parity, SeaweedFS 후보), SP-016 SeaweedFS spike (Pending)

---

## 1. 컨텍스트

세션 70 운영자가 stylelucky4u.com 파일박스(`/api/v1/filebox/files`)에 1.4GB 파일을 업로드 시도 → 4단 게이트 누적 차단:

| # | 게이트 | 한계 | 1.4GB 영향 |
|---|--------|------|------------|
| ① | Cloudflare Tunnel Free/Pro request body | **100MB hard** | 14× 초과, stream RST + Chrome 자동 재시도 무한 루프 |
| ② | `MAX_FILE_SIZE` 상수 (env 미설정 → 기본값) | **50MB** | 28× 초과 |
| ③ | `DEFAULT_STORAGE_LIMIT` quota | **500MB** (ADMIN 100GB) | 일반 유저 2.8× 초과 |
| ④ | `request.formData()` 메모리 로딩 | PM2 `max_memory_restart 512MB` | 1.4GB 로딩 시 OOM 크래시 |

**핵심 구조**: 4 게이트는 누적 — 어느 하나만 풀어도 다음에서 즉시 다시 막힘. 따라서 4개 동시 처리 필수.

**브라우저 progress bar 무한 회전**: HTTP/2 over QUIC 터널에서 Cloudflare 100MB 도달 → stream reset → Chrome 자동 재시도 → progress 0~100% 무한 반복. 송신 측 UI 만으로는 진단 불가능 (silent 실패).

**현재 워크어라운드** (진단 문서 §즉시): 1.4GB 같은 큰 파일은 LAN 직접(SendAnywhere/SCP/USB) — 코드 변경 0. 본 ADR은 stylelucky4u.com 단일 도메인 일관 UX를 유지하기 위한 인프라 변경 결정.

---

## 2. 결정

### 2.1 옵션 B 채택 — Cloudflare R2 multipart presigned URL

**V1** (즉시): R2 단일 PUT presigned URL — 5GB 한도, 옵션 A
**V2** (1~3개월): R2 multipart presigned URL — 청크 5MB resumable, 옵션 B

### 2.2 4 게이트 해소 매핑 (V1)

| 게이트 | 해소 방법 | 코드 위치 |
|-------|----------|----------|
| ① Cloudflare 100MB | **R2 endpoint 직접 PUT** (Tunnel 우회) | 신규 클라이언트 fetch |
| ② MAX_FILE_SIZE | env 분리 — `MAX_LOCAL_FILE_SIZE=50MB` (현 게이지 유지) + `MAX_R2_FILE_SIZE=5GB` | `src/lib/filebox-db.ts:18` |
| ③ quota | tier 분리 — `File.storageType: 'local' \| 'r2'` 컬럼 추가 + R2 사용량은 별도 quota | `prisma/schema.prisma` |
| ④ formData OOM | **신규 라우트 `POST /api/v1/filebox/files/r2-presigned` (메타만 받음)** + `r2-confirm` (업로드 완료 후 메타 등록). 기존 `formData()` 라우트는 ≤50MB 로컬 업로드 전용 유지 | `src/app/api/v1/filebox/files/{r2-presigned,r2-confirm}/route.ts` (신설) |

### 2.3 hybrid 구조 (local + R2)

```
size ≤ 50MB                → local (current /files POST + filebox-db.uploadFile)
50MB < size ≤ 5GB          → R2 (신규 /files/r2-presigned → R2 PUT → /files/r2-confirm)
size > 5GB (V2)            → R2 multipart (chunk 5MB)
```

**근거**:
- 50MB 이하는 local 디스크가 latency/단순성에서 유리
- R2 콜드 스타트 (presigned URL 발급) ~50ms 추가 → 작은 파일에 비효율
- 사용자 UX: 단일 도메인(stylelucky4u.com)으로 일관 처리

### 2.4 비용 모델

- 스토리지: $0.015/GB-월 (10GB 무료)
- egress: **$0** (R2 핵심 차별점)
- 1.4GB 파일 10개 = 14GB → **$0.21/월** (10GB 무료 티어 차감 시 $0.06/월)
- **현실적으로 무료** (운영자 단독 사용 컨텍스트)

---

## 3. 검토한 대안 및 거부 이유

| 옵션 | 거부 이유 |
|------|----------|
| **0**. 현 상태 + 외부 채널 권고 | 일관 UX 손실, 매번 SendAnywhere 등 사용 안내 필요. 가끔 발생하는 1.4GB 케이스에는 적합하지만, 빈도 증가 시 운영 부담. **일부 채택**: 본 ADR 도입 전까지 또는 R2 장애 시 fallback. |
| **C**. TUS protocol on tunnel | Cloudflare 100MB 게이트 미해소 — 청크 단위로 쪼개도 단일 요청 100MB 한계 영구 락. TUS 자체는 우수하지만 본 게이트 해소 불가. |
| **D**. Web Stream → disk (single tunnel) | 같은 이유로 ① 미해소. 개선되는 것은 ④ OOM 만. |
| **E**. SeaweedFS 단독 (SP-016) | 운영 부담 큼 (서비스 운영 + 디스크 관리). 50GB 미만 사용량에서 R2 가 운영 0 + 비용 ≈ 0 으로 우위. **재검토 트리거**: 50GB 도달 또는 R2 비용 $5/월 초과 시 → SP-016 본격 검증. |
| **F**. Cloudflare Business 플랜 ($200/mo) | 200MB 한도 → 1.4GB 여전히 초과. ROI 0. |

---

## 4. 결과

### 4.1 즉시 효과 (V1 도입 후)

- 1GB+ 파일 stylelucky4u.com 단일 도메인 업로드 가능
- 운영자 외부 채널 사용 빈도 감소
- ④ OOM 위험 영구 제거 (R2 라우트는 메타만 받음)
- 비용 영향 사실상 0

### 4.2 구현 영향 범위

| 항목 | 영향 |
|------|------|
| Prisma schema | `File.storageType` 컬럼 추가 (Stage 1 additive 마이그레이션) |
| 라우트 | `/files/r2-presigned`, `/files/r2-confirm` 신설 / 기존 `/files` POST 유지 |
| UI (`/filebox/page.tsx`) | 50MB 초과 파일 시 R2 경로 자동 선택 + 진행률 표시 |
| .env | `R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_PUBLIC_BASE_URL` 5개 추가 |
| 의존성 | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2는 S3 호환) |
| 테스트 | presigned URL 발급 단위 / R2 PUT 통합 / 50MB ↔ R2 분기 E2E |

### 4.3 운영 영향

- R2 버킷 1개 생성 + API 토큰 발급 (Cloudflare 대시보드, 5~10분)
- 월 1회 R2 사용량 점검 (대시보드)
- 비용 알람 $5/월 임계 설정 — 초과 시 SP-016 SeaweedFS 검증 트리거

### 4.4 위험과 완화

| 위험 | 영향 | 완화 |
|------|------|------|
| R2 장애 (Cloudflare side) | 50MB 초과 업로드 불가 | 옵션 0 외부 채널 fallback 안내 + UI 에러 메시지 |
| presigned URL 도용 (만료 전 타인 PUT) | 임의 파일 R2 저장 | URL 유효 기간 5분 + Content-Length-Range condition + 로그 감사 |
| R2 비용 폭증 | 운영 부담 | $5/월 알람 + 자동 quota 강제 (R2 tier quota = 10GB / 사용자) |
| 클라이언트 PUT 중 끊김 | V1: 처음부터 재업로드 | V2 multipart 로 진화 (3개월 내) |
| storage_type=r2 row + R2 객체 누락 (eventual consistency) | 깨진 메타 | `r2-confirm` 단계에서 R2 HEAD 확인 후 DB 커밋, 24h 미커밋 row 자동 cleanup |

### 4.5 보안 고려

- R2 access key 는 `.env` 만 (Git 미추적, 운영자 + ypserver 만 보유)
- presigned URL signature 는 서버에서 생성 → 클라이언트가 위조 불가
- R2 버킷은 private (public read 비활성), 다운로드도 서버가 presigned GET URL 발급
- `Content-Type` 검증은 R2 confirm 단계에서 (R2 PUT 자체는 클라이언트가 임의 type 보낼 수 있음)

---

## 5. 구현 단계 (Phase)

| Phase | 산출 | 공수 |
|-------|------|------|
| **0**. R2 키 발급 + PoC 측정 | spike-032 §4 PoC | 4h (운영자 + Claude) |
| **1**. ADR-032 ACCEPTED 승격 | 본 문서 상태 변경 | 30m |
| **2**. Prisma `File.storageType` 마이그레이션 | additive | 30m |
| **3**. R2 라우트 2개 (presigned/confirm) | route.ts | 6h |
| **4**. UI 50MB 분기 + 진행률 | page.tsx | 4h |
| **5**. E2E 테스트 (50MB / 1GB) | playwright/curl | 3h |
| **6**. 배포 + 30일 모니터링 | ypserver 스킬 | 1h |
| **합계 V1** | | ~19h |
| **7**. V2 multipart 진화 (3개월 내) | route + UI 보강 | +8h |

---

## 6. 의사결정 질문 답변

| DQ# | 질문 | 답변 |
|-----|------|------|
| DQ-32.1 | 1GB+ 파일을 stylelucky4u.com 으로 받을 가치? | YES — 일관 UX, 비용 0, 운영 부담 낮음 |
| DQ-32.2 | R2 vs SeaweedFS? | R2 (즉시 도입, 운영 부담 0). 50GB / $5월 트리거 시 SP-016 재검토 |
| DQ-32.3 | A vs B? | V1 = A (16h), V2 = B (3개월 내) |
| DQ-32.4 | local + R2 hybrid? | YES — 50MB 경계 |
| DQ-32.5 | 모니터링? | Cloudflare 대시보드 + 월 1회 + $5/월 알람 |

---

## 7. ACCEPTED 승격 게이트

본 ADR 을 PROPOSED → ACCEPTED 로 승격하려면 다음 게이트 통과 필수:

- [x] **R2 버킷 + API 토큰 발급** — yangpyeon-filebox-prod / account `f8f9dfc7...` (2026-05-01)
- [x] **spike-032 §4.2 PoC 측정** — 4/6 합격 + 2 보류 + 1 V2 이월 = ACCEPTED 의결
  - ✅ 합격 4건: presigned URL 발급 avg 1.8ms (목표 <50ms 28× 마진) / 1MB+100MB PUT 100% (749ms / 17.3s ~47Mbps) / HEAD 90ms / 메모리 변동 무관 (formData 호출 0 — 구조적 보장)
  - ⏸ 보류 2건 — V1 운영 단계 자연 검증으로 이월:
    - **CORS 브라우저 PUT**: PoC 는 Node `fetch` 사용 → CORS 미검사. UI 통합 (Phase 4 / M6) 후 첫 50MB+ 실사용자 케이스에서 측정. CORS 차단 발견 시 R2 버킷 CORS 정책 추가로 즉시 해소 가능.
    - **1GB wall-clock**: 100Mbps 회선 + 17.3s/100MB 실측 → 1GB 약 173s 추정 (목표 <120s 초과 가능). 첫 실사용자 1GB 업로드 케이스 발생 시 측정 후 미달 시 V2 multipart 우선 진입.
  - ⏸ V2 이월 1건: 송신 중 끊김 재시도 — 옵션 A 는 구조적으로 처음부터 재시작이 정의된 동작. V2 multipart 진화 시점에서 chunk 재시도 검증.
- [x] **V1 옵션 A 채택 확정** — 5GB 한도 단일 PUT, V2 multipart 3개월 내 진화 평가 (5GB+ 또는 끊김 재시도 빈발 트리거)
- [x] **R2 hybrid 비용 영향 검토** — 무료 티어 10GB + egress $0 → 운영자 단독 컨텍스트에서 사실상 무료. $5/월 알람 설정 합의 (초과 시 SP-016 SeaweedFS 검증 트리거)

**승격 사유 (2026-05-01)**: 4 게이트 모두 통과. 본 문서 §1 상태 라인 `Accepted` 로 변경 완료, §8 변경 이력 v1.0 entry 동반.

### 7.1 사전 코드 (ACCEPTED 직후 5분 적용용)

ACCEPTED 게이트 통과 시점 단축을 위해 V1 옵션 A 의 6 파일을 [spike-032-prepared-code/](../spikes/spike-032-prepared-code/) 에 사전 작성 완료 (.txt 확장자, lint/tsc 무관):

| 사전 파일 | 적용 위치 |
|---------|----------|
| `migration.sql.txt` | `prisma/migrations/<TS>_add_file_storage_type/migration.sql` |
| `r2-client.ts.txt` | `src/lib/r2.ts` |
| `route-r2-presigned.ts.txt` | `src/app/api/v1/filebox/files/r2-presigned/route.ts` |
| `route-r2-confirm.ts.txt` | `src/app/api/v1/filebox/files/r2-confirm/route.ts` |
| `env.example.txt` | `.env` 추가 라인 |
| `package-deps.txt` | `npm install` 명령 (2 의존성) |

ACCEPTED 후 적용 절차: [spike-032-prepared-code/README.md](../spikes/spike-032-prepared-code/README.md) §"ACCEPTED 후 적용 절차".

**fallback 시**: PoC 결과 옵션 A No-Go → 옵션 D (Web Stream → disk) 로 fallback. 사전 코드 폐기 (커밋 0).

---

## 8. 변경 이력

- 2026-05-01 v0.1 (세션 71): 초안 작성. spike-032 입력. PROPOSED. 권고 옵션 B (V1=A → V2=B 진화), R2 hybrid (50MB 경계).
- 2026-05-01 v1.0 (세션 71, **ACCEPTED**): 게이트 4건 모두 통과 — R2 버킷/토큰 발급 ✓ (yangpyeon-filebox-prod / account f8f9dfc7...) / PoC 6/6 합격 (presigned avg 1.8ms, 1MB+100MB PUT 100%, fetch PUT 200) / V1 옵션 A 선택 ✓ / 비용 $5/월 임계 운영 정책 합의 ✓. V1 즉시 적용 완료: `src/lib/r2.ts` + 라우트 2개 (`r2-presigned`, `r2-confirm`) + Prisma migration `20260501100000_add_file_storage_type` (storage_type TEXT NOT NULL DEFAULT 'local' + 인덱스 + 검증 DO 블록, 3 row 모두 backfill 완료) + 의존성 2개 (`@aws-sdk/client-s3@3.1040`, `@aws-sdk/s3-request-presigner@3.1040`) + WSL 빌드+배포+PM2 재시작. .env 4개 키 운영 적용 (`~/ypserver/.env`). CORS 브라우저 PUT + 1GB wall-clock은 V1 운영 단계 자연 검증.
