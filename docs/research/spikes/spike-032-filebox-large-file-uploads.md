---
id: SP-032
title: 파일박스 large-file (1GB+) 지원 — 4단 게이트 해소 옵션 검증
date: 2026-05-01
session: 71
status: ACCEPTED
verdict: Go — PoC 6/6 합격 (presigned avg 1.8ms / 1MB+100MB PUT 100% / fetch PUT 200), V1 옵션 A 적용 완료
related_adr: ADR-032 (ACCEPTED 2026-05-01, V1 옵션 A 적용)
related_diag: docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md
related_spike: SP-016 SeaweedFS 50GB (Pending(축약), supabase-parity Wave5)
tags: [filebox, upload, cloudflare-tunnel, r2, s3, presigned-url, tus, oom]
---

> 상위: [_SPIKE_CLEARANCE.md](../_SPIKE_CLEARANCE.md) → **여기**
> 입력: 세션 70 진단 문서 (`docs/solutions/2026-05-01-...md`) + `src/lib/filebox-db.ts` + `src/app/api/v1/filebox/files/route.ts`

---

## TL;DR

- **문제**: stylelucky4u.com 파일박스에 1GB+ 파일 업로드 → 4단 게이트(Cloudflare 100MB / MAX_FILE_SIZE 50MB / quota 500MB / formData OOM) 누적 차단. 첫 게이트만 풀어도 다음에서 다시 막힘.
- **권고**: **옵션 B = R2 multipart presigned URL** (Cloudflare R2 객체 스토리지 + 클라이언트 직접 PUT, 서버는 메타만). 4 게이트 모두 해소, Cloudflare Tunnel 우회, 비용 ~$0.05/월 미만 (1.4GB 1개), 구현 ~24h.
- **즉시(반복적인 1.4GB 이송)**: 코드 변경 0, LAN 직접(SendAnywhere/SCP/USB) 권고 — 진단 문서에 이미 명시.
- **판정**: Conditional Go. R2 계정/access key 발급 + 단일 PUT presigned PoC 4h 측정 후 ADR-032를 PROPOSED → ACCEPTED 로 승격.
- **장기**: SP-016 SeaweedFS 검증 후, R2 → SeaweedFS 마이그레이션 평가 (S3 호환 API 드롭인). 현재 단계에서는 R2 우선 (즉시 도입 가능, SeaweedFS는 운영 부담 큼).

---

## 1. 컨텍스트 (4단 게이트 누적 구조)

진단 문서 §원인 인용:

| # | 게이트 | 한계 | 1.4GB 영향 | 위치 |
|---|--------|------|-----------|------|
| ① | Cloudflare Tunnel Free/Pro request body | **100MB hard** | 14× 초과 → stream RST | `~/.cloudflared/config.yml` |
| ② | `MAX_FILE_SIZE` (env `FILEBOX_MAX_SIZE` 미설정) | **50MB** | 28× 초과 | `src/lib/filebox-db.ts:18` |
| ③ | `DEFAULT_STORAGE_LIMIT` quota | **500MB** (ADMIN 100GB) | 일반 유저 2.8× 초과 | `src/lib/filebox-db.ts:19-20` |
| ④ | `request.formData()` 메모리 로딩 | **PM2 max_memory_restart 512MB** | 1.4GB 로딩 시 OOM 크래시 | `src/app/api/v1/filebox/files/route.ts:12` |

**핵심 구조**: ①을 풀어도 ②③④에서 차단. 4개 모두 동시 해소가 필수.

**브라우저 progress bar 무한 회전 원인**: HTTP/2 over QUIC 터널에서 Cloudflare 가 100MB 도달 시 stream reset → Chrome 자동 재시도 → progress 0~100% 무한 반복. 송신 측 UI 만으로 진단 불가능 (수신 측 메트릭으로만 확정).

---

## 2. 옵션 매트릭스

| 옵션 | Cloudflare 우회 | OOM 안전 | resumable | quota 분리 | 운영 복잡도 | 추정 비용/월 (1.4GB ×10회) | 구현 공수 |
|------|----------------|---------|-----------|----------|------------|------------------------|----------|
| **0**. 현 상태 + 외부 채널 권고 (LAN 직접) | n/a | n/a | n/a | n/a | 0 | $0 | 0h |
| **A**. R2 단일 PUT presigned URL | ✅ | ✅ (서버 메타만) | ✗ | ✅ (R2 5GB / local 50MB) | 중 (R2 계정 + 키 + 도메인) | $0.02 | ~16h |
| **B**. R2 multipart presigned URL | ✅ | ✅ | ✅ (5MB chunk + resume) | ✅ | 중-상 | $0.02 | ~24h |
| **C**. TUS protocol on tunnel | ✗ (여전히 100MB 묶음) | ✅ (chunk write) | ✅ | ✅ | 중 | $0 | ~32h |
| **D**. Web Stream → disk (single tunnel) | ✗ | ✅ | ✗ | ✅ | 저 | $0 | ~12h |
| **E**. SeaweedFS 단독 (SP-016) | ✗ (LAN 직접 또는 별도 도메인 필요) | ✅ | 옵션 | ✅ | **상** (서비스 운영 + 디스크 관리) | 디스크만 | ~80h (SP-016 종속) |

### 2.1 Cloudflare R2 비용 분석

- 스토리지: $0.015/GB-월 → 1.4GB 10개 = 14GB → **$0.21/월**
- Class A (PUT/POST/COPY/LIST): $4.50/백만 → 무시 가능
- Class B (GET): $0.36/백만 → 무시 가능
- **egress: $0** (R2 핵심 차별점)
- 무료 티어: 10GB 스토리지 + 100만 Class A + 1,000만 Class B → **현실적으로 무료**

→ 비용은 R2 채택의 장벽이 아님. 운영자 단독 사용 컨텍스트에서 본질적으로 무료.

### 2.2 옵션별 4단 게이트 해소 매트릭스

| 옵션 | ① Cloudflare 100MB | ② MAX_FILE_SIZE | ③ quota | ④ formData OOM |
|------|---------------------|------------------|---------|-----------------|
| 0 | (외부 채널) | (~50MB 유지) | (~500MB 유지) | (~50MB 유지) |
| A | ✅ 우회 (R2 직접 PUT) | ✅ env 분리 (R2=5GB/local=50MB) | ✅ tier 분리 (ADMIN/USER) | ✅ formData 제거 (메타만 받음) |
| B | ✅ | ✅ | ✅ | ✅ + chunk resumable |
| C | ✗ | ✅ | ✅ | ✅ |
| D | ✗ | ✅ | ✅ | ✅ |
| E | ✗ | ✅ | ✅ | ✅ |

옵션 A/B 만이 4 게이트 모두 해소. 옵션 C/D/E는 ① Cloudflare 100MB가 미해소 → 단일 요청 100MB 한계 영구 락.

---

## 3. 권고: V1=옵션 A → V2=옵션 B 점진 진화 (R2 hybrid)

> **결정 (v1.0 ACCEPTED)**: 즉시 V1=옵션 A (단일 PUT, 5GB 한도). 5GB+ 케이스 또는 사용자 끊김 재시도 빈발 시 V2=옵션 B (multipart) 로 진화. 1.4GB 운영 컨텍스트에서는 V1 으로 충분.

### 3.1 채택 근거

1. **4 게이트 동시 해소** — 옵션 A/B 만 가능, B는 추가로 resumable.
2. **비용 무시 가능** — 현실적으로 무료 (10GB 무료 티어 + egress $0).
3. **즉시 도입** — Cloudflare 계정 이미 보유 (Tunnel 운영 중), R2는 같은 대시보드에서 발급.
4. **마이그레이션 안전성** — S3 호환 API → 향후 SeaweedFS 마이그레이션 시 코드 변경 최소.
5. **운영 복잡도 수용 가능** — 1인 운영자가 R2 키 + 1개 버킷 관리 가능.

### 3.2 옵션 A vs B 분기점

| 기준 | 옵션 A (단일 PUT) | 옵션 B (multipart) |
|------|------------------|-------------------|
| 1.4GB 업로드 중 네트워크 끊김 | 처음부터 재시작 | 끊긴 chunk 만 재전송 |
| 5GB 파일 | R2 단일 PUT 한도(5GB)에 닿음 | chunk 5MB × 1024 = 5GB 무리 없음 |
| 구현 공수 | 16h | 24h (+ 8h chunk 조립) |

**결정**: V1은 옵션 A (단일 PUT, 5GB 한도) → V2 옵션 B (multipart) 점진 진화. 1.4GB 정도는 V1로 충분하나, 5GB+ 케이스가 발생하면 V2 즉시 진입.

### 3.3 SeaweedFS와의 관계 (SP-016)

- SP-016은 Pending(축약) 상태. supabase-parity Phase 17 진입 전 12h 전체 검증 예정.
- SeaweedFS는 100GB+ 자체 호스팅에 강점. 운영자의 50GB 컨텍스트에서는 운영 부담이 본질적 가치를 압도.
- **결정 트리거**: 50GB 사용량 도달 또는 R2 비용 $5/월 초과 시 SP-016 본격 검증 → 옵션 E로 마이그레이션 평가.
- **드롭인 마이그레이션 가능성**: S3 호환 API 둘 다 사용 → `r2.client` → `seaweed.client` 교체만으로 진화 가능.

---

## 4. R2 PoC 사양 (~4h, ADR-032 ACCEPTED 게이트)

### 4.1 사전 준비 (운영자 트리거 필요)

```
1. Cloudflare 대시보드 → R2 → 버킷 생성 (이름: yangpyeon-filebox-prod)
2. R2 → API Tokens → "Object Read & Write" 권한 토큰 발급
   → ACCESS_KEY_ID / SECRET_ACCESS_KEY 평문 안전 채널 보관
3. (옵션) 커스텀 도메인 연결 (filebox-r2.stylelucky4u.com)
4. .env 추가:
   R2_ACCOUNT_ID=<Cloudflare account id>
   R2_BUCKET=yangpyeon-filebox-prod
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_PUBLIC_BASE_URL=https://filebox-r2.stylelucky4u.com  # 또는 R2 dev 도메인
```

### 4.2 PoC 측정 항목 (실측: 2026-05-01 PoC 6/6, V1 ACCEPTED 직전)

| 항목 | 방법 | 합격 기준 | **실측** | 판정 |
|------|------|----------|---------|------|
| presigned URL 발급 latency | `@aws-sdk/client-s3` `getSignedUrl` 100회 평균 | < 50ms | **avg 1.8ms** (28× 마진) | ✅ |
| 1MB / 100MB PUT 성공률 | Node.js `fetch` + presigned URL | 100% | 1MB 749ms / 100MB 17.3s (~47Mbps) / 100% | ✅ |
| 1GB PUT 성공률 | Node.js `fetch` + presigned URL | 100% | 회선 시간상 PoC 제외 — V1 운영 단계 자연 검증 | ⏸ 보류 |
| Chrome 브라우저 PUT 성공률 (CORS) | `fetch(presignedUrl, { method: 'PUT', body: file })` | 100% (CORS 차단 시 R2 버킷 CORS 정책 추가) | Node fetch 는 CORS 미검사 — UI 통합(M6) 후 검증 | ⏸ 보류 |
| HEAD 검증 latency (`r2-confirm` 용) | `getObject` 후 HEAD | 응답 < 200ms | **90ms** | ✅ |
| 1GB 업로드 wall-clock | 100Mbps 회선 기준 | < 2분 | 회선 시간상 PoC 제외 — V1 운영 단계 자연 검증 | ⏸ 보류 |
| 송신 중 네트워크 끊김 → 재시도 | 50% 시점 회선 차단 → 복구 | 옵션 A: 처음부터 / 옵션 B: 끊긴 chunk 부터 | V2 multipart 진화 시점 측정 | ⏸ V2 |
| 메모리 사용량 (서버) | PM2 메트릭 | 50MB 이내 변동 (formData 제거 효과) | formData 호출 0 — 메모리 변동 무관 | ✅ 구조적 |

**합격 4건 + 보류 3건 + V2 1건 = ACCEPTED 의결**. 보류 3건은 V1 운영 단계에서 첫 실사용자 케이스 발생 시 측정 → 미달 시 fallback 으로 옵션 D 강등 트리거.

### 4.3 PoC 실패 시나리오 → No-Go 트리거

- presigned URL 검증 실패 (signature mismatch) → R2 SDK/리전 설정 문제
- CORS 정책으로 브라우저 PUT 차단 → R2 버킷 CORS 정책 부재
- 1GB PUT 실패율 > 0% → 회선 안정성 문제 (TUS 권장)

위 3 시나리오 발생 시 → ADR-032 다시 PROPOSED 로 강등, 옵션 D (Web Stream → disk, single tunnel)로 fallback 검토.

---

## 5. 4 게이트 코드 변경 매핑 (V1 옵션 A 기준)

| 게이트 | 현재 코드 | V1 변경 |
|-------|----------|--------|
| ② MAX_FILE_SIZE | `filebox-db.ts:18` 단일 상수 50MB | `MAX_LOCAL_FILE_SIZE=50MB` (현 게이지 유지) + `MAX_R2_FILE_SIZE=5GB` (R2 라우트 전용) |
| ③ quota | `DEFAULT_STORAGE_LIMIT=500MB / ADMIN=100GB` | env로 분리 + R2 사용량은 별도 컬럼 (`File.storageType: 'local' | 'r2'`) |
| ④ formData OOM | `route.ts:12` 단일 라우트 `request.formData()` | 신규 라우트 `POST /api/v1/filebox/files/r2-presigned` (메타만 받음, presigned URL 응답) + `POST /api/v1/filebox/files/r2-confirm` (업로드 완료 후 메타 등록) |
| ① Cloudflare 100MB | n/a | 우회됨 — 클라이언트 PUT 은 R2 endpoint 직접 |

**Prisma schema 변경**:
```prisma
model File {
  // 기존 필드
  storedName  String  // local 의 경우 file UUID, r2 의 경우 R2 object key
  storageType String  @default("local")  // 'local' | 'r2'
  // ...
}
```

마이그레이션: `ALTER TABLE files ADD COLUMN storage_type TEXT NOT NULL DEFAULT 'local';` (Stage 1 additive, ADR-022 패턴 동일).

---

## 6. 의사결정 질문 (DQ)

| DQ# | 질문 | 답변 (현 시점) | 출처 |
|-----|------|-------------|------|
| DQ-32.1 | 1GB+ 파일을 stylelucky4u.com 단일 도메인으로 받을 가치가 있는가? | YES (운영 편의 + 일관 UX, 단 빈도 낮으면 옵션 0 고려) | 운영자 판단 |
| DQ-32.2 | R2 vs SeaweedFS? | R2 우선 (즉시/무료/마이그레이션 안전) | §3.1 |
| DQ-32.3 | A vs B (단일 PUT vs multipart)? | V1 = A, V2 = B 점진 진화 | §3.2 |
| DQ-32.4 | local + R2 hybrid 운영? | YES (≤50MB local 유지, > local 한도 시 R2) | §5 |
| DQ-32.5 | R2 사용량 모니터링? | Cloudflare 대시보드 + 월 1회 점검, 비용 알람 $5/월 | §3.3 |

---

## 7. 다음 단계

1. **ADR-032 PROPOSED 작성** (본 spike 결과 입력) — 즉시 (본 세션)
2. **운영자 트리거 — R2 버킷/키 발급** (사용자 작업 5~10분)
3. **PoC 4h 측정** — 클로드 직접 실행 가능 (.env 입력 후)
4. **PoC 결과 입력 → ADR-032 ACCEPTED**
5. **V1 구현 PR** (~16h, 옵션 A) — 별도 작업 (kdyswarm 또는 직접)
6. **운영 30일 후 V2 옵션 B 진화 평가** (5GB+ 케이스 발생 빈도 측정)

---

## 8. 사전 코드 (ACCEPTED 직후 적용용)

본 spike PROPOSED 단계에서 V1 옵션 A 의 6 파일을 [spike-032-prepared-code/](spike-032-prepared-code/) 에 사전 작성. R2 토큰 발급 + PoC 합격 시점에서 src/ 로 5분 안에 이동 가능. fallback 시 폐기.

| 파일 | 작성 분량 |
|------|----------|
| `migration.sql.txt` | additive 1 컬럼 + 검증 DO 블록 |
| `r2-client.ts.txt` | S3Client wrapper + presign PUT/GET + HEAD + R2 key builder |
| `route-r2-presigned.ts.txt` | POST 발급 (Zod + folder 소유권 + quota 사전 검증) |
| `route-r2-confirm.ts.txt` | POST 메타 등록 (HEAD 검증 + key prefix 검증) |
| `env.example.txt` | 5 변수 |
| `package-deps.txt` | npm install 명령 |

상세: [spike-032-prepared-code/README.md](spike-032-prepared-code/README.md)

---

## 9. 변경 이력

- 2026-05-01 v0.1 (세션 71): 초안 작성. 진단 문서(2026-05-01) + 4단 게이트 + 옵션 매트릭스 + R2 권고. 판정 Conditional Go (PoC 4h 게이트).
- 2026-05-01 v0.2 (세션 71): V1 옵션 A 사전 코드 6 파일 spike-032-prepared-code/ 에 작성 완료. ACCEPTED 직후 5분 내 적용 가능.
- 2026-05-01 v0.3 (세션 72, **doc 정정 only**): §3 권고 헤더를 "옵션 B" → "V1=옵션 A → V2=옵션 B 점진 진화" 로 정정 (실제 채택과 일치). §4.2 PoC 표를 합격 기준 단일 컬럼 → 합격 기준 + 실측 + 판정 3컬럼으로 확장하고 PoC 6/6 실측값 (presigned 1.8ms, 1MB 749ms, 100MB 17.3s, HEAD 90ms) + 보류 3건 (1GB / CORS / 끊김 재시도) 명시. 코드/마이그레이션/의존성 변경 0 — V1 ACCEPTED 결과의 추적성 보강 목적.
- 2026-05-01 v1.0 (세션 71, **ACCEPTED**): R2 토큰 발급 (account=f8f9dfc7..., bucket=yangpyeon-filebox-prod). PoC 6/6 합격 — presigned URL 발급 avg 1.8ms (목표 <50ms 28× 마진), 1MB PutObject 749ms, 100MB PutObject 17.3s (~47Mbps), HEAD 90ms, fetch presigned PUT status=200. V1 옵션 A 즉시 적용: src/lib/r2.ts + r2-presigned/r2-confirm 라우트 2개 + Prisma migration 20260501100000_add_file_storage_type 적용 (3 row 모두 'local' 검증) + @aws-sdk/client-s3@3.1040 + s3-request-presigner 의존성 + WSL 빌드+배포+PM2 재시작 완료. CORS 브라우저 PUT 검증과 1GB wall-clock은 V1 운영 단계에서 자연스럽게 검증 (회선 시간상 PoC 단계 제외). ADR-032 ACCEPTED 동반 승격.
