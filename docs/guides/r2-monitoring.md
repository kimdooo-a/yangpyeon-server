# R2 운영 모니터링 가이드

> 상위: [CLAUDE.md](../../CLAUDE.md) → [docs/guides/](./README.md) → **여기**
> 관련 ADR: [ADR-032 R2 hybrid](../research/decisions/ADR-032-filebox-large-file-uploads.md) (ACCEPTED 2026-05-01)
> 관련 SP: [SP-016 SeaweedFS](../research/spikes/spike-016-seaweedfs-50gb-result.md) (Pending — 트리거 발화 시 진행)

## 1. 목적

ADR-032 V1 옵션 A (R2 단일 PUT presigned URL) 운영 단계에서 다음 3종 트리거를 사람 눈 의존 없이 자동 발화시키기 위함.

| 트리거 | 임계 | 발화 액션 |
|-------|------|----------|
| **T1. 청구 임계** | $5 / 월 | SP-016 SeaweedFS 검증 본격 진입 (ADR-032 §"V2 진화" 갈래 K) |
| **T2. 저장 임계** | 50 GB 누적 | 위 T1 과 동일 (둘 중 먼저 도달 발화) |
| **T3. 1GB wall-clock** | >120s (PoC §4.2 추정 173s) | V2 multipart presigned URL PR 진입 (ADR-032 §7 보류 게이트) |

## 2. 청구 알람 ($5/월) — T1

### 2.1 1회 설정 (운영자 본인, ~5분)

1. <https://dash.cloudflare.com> 로그인 → 우측 상단 프로필 → **Billing**
2. 좌측 사이드바 → **Notifications**
3. **Add** → **Billing Notifications** 선택
4. 임계 입력:
   - **Notification type**: Spending threshold
   - **Threshold (USD)**: `5`
   - **Frequency**: Monthly
5. **Notification destinations**: 운영자 이메일 (kimdooo@stylelucky4u.com 또는 동등) 체크
6. **Save**

### 2.2 검증

- 익월 1일 청구 사이클 시작 후 R2 PUT 테스트 1회 → 실시간 사용량 1MB 적재 확인 (`Cloudflare Dashboard → R2 → yangpyeon-filebox-prod → Metrics`)
- 알람 미발화는 임계 미도달이 정상 — 5GB+ 적재 후 첫 청구 시점에 발화 여부 검증

### 2.3 발화 시 액션 (자동 트리거)

```
이메일 수신 → 본 문서 §4 액션 매트릭스 참조
→ SP-016 SeaweedFS 검증 본격 진입 (Phase 1 ADR-008 ASM-4 50GB 부하 테스트)
→ V2 multipart PR 우선순위 ↑ (이미 청구 발생 = R2 사용 활발 = 1GB+ 시도 가능성)
```

## 3. 저장 임계 (50 GB) — T2

R2 무료 한도 10GB / 월 + Class A operations 1M / 월. 50GB 누적은 **유료 구간 진입 후 수개월** 시점.

### 3.1 월간 사용량 점검 (운영자 또는 자동)

| 점검 위치 | 주기 | 임계 |
|----------|------|------|
| Cloudflare Dashboard → R2 → `yangpyeon-filebox-prod` → Metrics → Storage | 월 1회 | 50 GB |
| 또는 `wrangler r2 bucket info yangpyeon-filebox-prod` | 자동화 시 | 위와 동일 |

### 3.2 자동화 후보 (옵션, 미구현)

- 양평 cron `kind=SQL` 신규 등록: R2 청구 API 폴링 → 50GB 도달 시 audit_log 에 `R2_STORAGE_THRESHOLD_REACHED` event 기록 → SP-016 진입 알림.
- 현 단계는 운영자 월 1회 수동 점검만 — 자동화는 첫 5GB 도달 후 PR 화 권고.

## 4. 1GB wall-clock (T3)

### 4.1 측정 기준

ADR-032 §7 보류 게이트 #2: `1GB 단일 PUT 실측 < 120s` 미달 시 V2 multipart 우선 진입.

PoC §4.2 추정: 17.3s/100MB × 10 = ~173s → **이미 추정상 미달**. V1 운영 중 실측이 추정에 부합하면 즉시 V2 PR.

### 4.2 실측 절차

1. `~/dev/ypserver-build/scripts/r2-poc.mjs` 와 동등한 1GB 더미 파일 PUT 1회 시도
2. 양평 서버 로그(`pm2 logs ypserver`)에서 presigned URL 발급 시점 + R2 응답 시점 차 계산
3. 또는 브라우저 Network 탭 — `r2-presigned` 응답부터 PUT 200 까지 wall-clock 시간 측정
4. **120s 초과 시**: V2 multipart presigned URL PR 진입 (ADR-032 §"V2 진화" 옵션 B)

### 4.3 V2 진입 게이트

- 트리거 1건만 충분: T1 청구 임계 OR T2 저장 임계 OR T3 1GB wall-clock
- V2 도입 시 V1 옵션 A 는 ≤50MB 로컬 업로드 + 50MB~100MB R2 단일 PUT 라인만 유지 (≥100MB 는 V2 multipart 로 라우팅)

## 5. 액션 매트릭스 (트리거 발화 시)

| 트리거 발화 | 첫 작업 (1주 내) | 두번째 작업 (1개월 내) |
|-----------|----------------|---------------------|
| **T1. $5 청구** | R2 사용량 분석 — 어느 tenant/user/file이 비중 차지? `prisma file aggregate by ownerId` | SP-016 SeaweedFS 검증 진입 |
| **T2. 50GB** | (위와 동일) | (위와 동일) |
| **T3. >120s** | V2 multipart PR — `presignR2MultipartUrl()` + 클라이언트 청크 5MB resumable | V1 옵션 A 라우팅 ≤100MB 제한 |

## 6. 운영 부채 (24h cleanup cron — 미구현)

S75-D 메인 PR 에서 **즉시 삭제(deleteR2Object)** 만 적용. 다음 보조 PR 필요:

- `r2-presigned` 발급 후 PUT 안 되거나 confirm 안 된 R2 객체가 누적 가능
- ListObjectsV2 (prefix=`tenants/`) → DB `File` row 매핑 → 미참조 + LastModified > 24h 만 DeleteObject
- cron runner 가 SQL/FUNCTION/WEBHOOK kind 만 지원 → 새 kind `R2_CLEANUP` 또는 별도 스케줄러 신설 필요
- 권고 주기: 매주 1회 (`0 4 * * 0` 일요일 새벽 4시)

## 7. 변경 이력

| 일자 | 변경 | 트리거 |
|-----|------|-------|
| 2026-05-01 | 초안 작성 (S75-D 후속 — R2 알람 설계) | next-dev-prompt §S73-D / §S76-D |
