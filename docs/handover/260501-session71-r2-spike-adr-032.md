# 인수인계서 — 세션 71 (S71-A 파일박스 R2 hybrid spike + ADR-032 ACCEPTED + V1 옵션 A 적용 + 베이스라인 검증 메모리 룰)

> 작성일: 2026-05-01
> 이전 세션: [session70](./260501-session70-boot-manual-filebox-diag.md)
> 저널: [logs/journal-2026-05-01.md](../logs/journal-2026-05-01.md)

---

## 작업 요약

세션 70 P1 추천 작업 **S71-A 파일박스 large-file (1GB+) 지원** 의 spike + ADR + V1 사전 코드 작성. 추가로 SP-013/SP-016 측정 사양 강화 + 큰 발사 전 베이스라인 우선 검증 메모리 룰 등록(B-1/B-2 outdated 함정 회피로 발견). 본 터미널 코드 변경 0 — 모두 docs/ + memory 영역.

**세션 71 동안 다른 터미널이 트랙 A 를 끝까지 진행** — R2 토큰 발급 + PoC 6/6 합격 (presigned avg 1.8ms / 1MB+100MB PUT 100% / fetch PUT 200) + ADR-032 PROPOSED → **ACCEPTED 동일 세션 승격** + V1 옵션 A 코드 적용 (npm install + prisma 마이그레이션 작성 + 라우트 2개 + r2.ts). spike-032 frontmatter / _SPIKE_CLEARANCE row / ADR-032 §1 상태 모두 ACCEPTED 갱신. 미커밋 상태로 세션 71 종료(별도 또는 통합 commit). 본 터미널은 영역 분리(docs/만)로 충돌 0.

---

## 대화 다이제스트

### 토픽 1: Wave 진행도 점검 → 트랙 A/B/C 분류

> **사용자**: "wave 기반 개발 진행도 점검"

3 Wave 프로젝트 누적 점검: (1) platform-evolution-wave (S, 종료 2026-04-06), (2) 2026-04-supabase-parity (L, 123문서/106,588줄 완주), (3) baas-foundation 압축형 4 sub-wave (M, 31파일/16,826줄). DQ 72/72, ADR 30+ ACCEPTED. 구현 단계 진행: Phase 0~1 거의 완료, Phase 2 T2.5 Almanac aggregator 진행 중. M3 게이트(2번째 컨슈머 코드 0줄)가 다음 큰 마일스톤.

**결론**: 외부 프로젝트(Almanac/메신저) + 메모(/notes) 제외 후 잔여 작업 5개 추출 → S71-A부터 순차 진행.

### 토픽 2: S71-A 파일박스 large-file spike + ADR-032 PROPOSED

> **사용자**: "외부 프로젝트와 연결된 것 말고. 메모 페이지 및 관련 기능 제외하고 나머지 순차적으로 진행"

진단 문서 `2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md` (세션 70) 입력으로 4단 게이트 (Cloudflare 100MB / MAX_FILE_SIZE 50MB / quota 500MB / formData OOM) 해소 옵션 매트릭스 5개 비교 — 옵션 0(현 상태) / A(R2 단일 PUT) / B(R2 multipart) / C(TUS) / D(Web Stream) / E(SeaweedFS). **옵션 A/B 만이 4 게이트 동시 해소** (Cloudflare 100MB는 R2 직접 PUT 으로만 우회 가능). V1 = 옵션 A (16h, 5GB 한도) → V2 = 옵션 B (3개월 진화, multipart resumable). local+R2 hybrid 50MB 경계.

**산출**:
- `docs/research/spikes/spike-032-filebox-large-file-uploads.md` (ACCEPTED, **Go (PoC 6/6 합격)** — 다른 터미널이 frontmatter 갱신)
- `docs/research/decisions/ADR-032-filebox-large-file-uploads.md` (**Accepted 2026-05-01 세션 71** — 다른 터미널이 §1 상태 갱신 + V1 옵션 A 적용)
- `docs/solutions/2026-05-01-...md` 후속 링크 추가
- `docs/research/_SPIKE_CLEARANCE.md` SP-032 row 등록 + Go 판정 갱신

**ACCEPTED 승격 결과**: R2 토큰 발급 + PoC 6/6 합격 (presigned avg 1.8ms / 1MB+100MB PUT 100% / fetch PUT 200) + 옵션 A 채택. 다른 터미널이 동일 세션에 V1 코드까지 적용 (미커밋, 분리 commit 권장).

### 토픽 3: R2 V1 사전 코드 6 파일 (.txt 보관)

ACCEPTED 직후 5분 내 src/ 이동 가능하도록 사전 작성. **`.txt` 확장자 → lint/tsc/build 무관**, fallback 시 `rm -rf` 한 번이면 폐기.

| 파일 | 적용 위치 |
|------|---------|
| `migration.sql.txt` | `prisma/migrations/<TS>_add_file_storage_type/migration.sql` (additive 1 컬럼) |
| `r2-client.ts.txt` | `src/lib/r2.ts` (S3Client + presign PUT/GET + HEAD + tenants/{tenantId}/users/{userId}/{uuid}-{name} key builder) |
| `route-r2-presigned.ts.txt` | `POST /api/v1/filebox/files/r2-presigned` (Zod + folder 소유권 + R2 quota 사전 검증) |
| `route-r2-confirm.ts.txt` | `POST /api/v1/filebox/files/r2-confirm` (HEAD 검증 + key prefix 검증 + size ±10% 허용) |
| `env.example.txt` | `.env` 추가 5 변수 |
| `package-deps.txt` | npm install 명령 (2 의존성) |

**보안 핵심**:
- 객체 키 prefix `tenants/{tenantId}/users/{user.sub}/` 강제 — 타인 객체 confirm 차단
- HEAD 단계에서 R2 실제 존재 + 크기 검증 — eventual consistency 회피
- presigned URL 5분 만료 + Content-Length 강제

위치: `docs/research/spikes/spike-032-prepared-code/`

### 토픽 4: SP-013/SP-016 측정 사양 강화

이미 95% 완성된 spike 결과 파일에 정량 Go/No-Go 임계 매트릭스 + ADR-032 결정 트리거 매핑 추가:

- **SP-013 wal2json**: 5 메트릭 임계 (WAL lag/recovery 시간/wal_status/메모리 누수/presence_diff RTT) + ADR-032와 독립 영역 명시
- **SP-016 SeaweedFS 50GB**: 6 메트릭 임계 (throughput/메모리/재시작/md5sum/leveldb 응답/B2 오프로드) + **ADR-032 R2 hybrid 결정 트리거 정량화** (50GB / $5월 / restart failure)

### 토픽 5: 트랙 B (B-1 Phase 15 / B-2 baas-foundation Phase 3) 두 건 모두 취소

> **사용자**: "트랙 B는 너가 직접해야겠어..." (다른 터미널 Claude의 정적 분석 결과 회신)

다른 터미널이 kdyswarm 발사 직전에 정적 분석으로 차단:
- **B-1 Phase 15 Auth Advanced**: 이미 세션 32-34 commit `58a517b`로 백엔드 완결 + s34 UI + s36-39 refresh rotation. prod 배포 중. 6 모델(MfaEnrollment / MfaRecoveryCode / WebAuthnAuthenticator / WebAuthnChallenge / JwksKey / RateLimitBucket) + 9 라우트. **kdyswarm 발사 시 prod 파괴 위험.**
- **B-2 baas-foundation Phase 3**: M3 게이트(2번째 컨슈머 코드 0줄) 미통과 + 메신저 정책 제외로 후보 부재. 진입 시점은 다른 컨슈머 결정 후.

**원인**: 본 터미널이 `2026-04-supabase-parity Wave 5 roadmap (2026-04-18)` 권고만 보고 트랙 B 추천. 그 사이 세션 32-34에서 Phase 15 우선 구현 완료, roadmap 산출물의 status 갱신 부재. **베이스라인(current.md / next-dev-prompt / 최근 handover / 실제 코드) 우선 검증 누락**.

**조치**:
- 트랙 B 영구 취소 (다른 터미널 Claude 닫음)
- 메모리 룰 등록: `feedback_baseline_check_before_swarm.md` — kdyswarm/대규모 발사 전 베이스라인 4개 사전 점검 강제
- MEMORY.md 인덱스 갱신

### 토픽 6: D 트랙 ADR 보완 4건 — 이미 세션 30 (2026-04-19) 완료

> **사용자**: "D 진행 후 C"

4건 보완 작업이 이미 완료된 상태였음:
- ADR-006 §s30 보완 (SP-011 + SP-015): SHA-256 hex + 복합 인덱스 + cleanup job
- ADR-013 §s30 보완 (SP-014): JWKS grace 엔드포인트 운용 명료화
- ADR-015 §s30 보완 (SP-010): cluster:4 조건부 전환 + `pm2 delete all` 운영 금지
- ADR-019 신규 (SP-011 argon2id): 본문 작성 완료

`_SPIKE_CLEARANCE.md` 의 "보완 대기" 표기만 outdated → 4 row 갱신으로 완료. **베이스라인 검증 메모리 룰의 적용 사례 1건 추가**.

---

## 산출물 목록 (본 세션, docs/ + memory)

### 신규 (8 항목)
- `docs/research/spikes/spike-032-filebox-large-file-uploads.md`
- `docs/research/decisions/ADR-032-filebox-large-file-uploads.md`
- `docs/research/spikes/spike-032-prepared-code/README.md`
- `docs/research/spikes/spike-032-prepared-code/migration.sql.txt`
- `docs/research/spikes/spike-032-prepared-code/r2-client.ts.txt`
- `docs/research/spikes/spike-032-prepared-code/route-r2-presigned.ts.txt`
- `docs/research/spikes/spike-032-prepared-code/route-r2-confirm.ts.txt`
- `docs/research/spikes/spike-032-prepared-code/env.example.txt`
- `docs/research/spikes/spike-032-prepared-code/package-deps.txt`
- `~/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_baseline_check_before_swarm.md`

### 수정
- `docs/research/_SPIKE_CLEARANCE.md` (SP-032 신규 row + SP-010/011/014/015 보완 완료 표기)
- `docs/research/spikes/spike-013-wal2json-slot-result.md` (정량 임계 + ADR-032 관계)
- `docs/research/spikes/spike-016-seaweedfs-50gb-result.md` (정량 임계 + ADR-032 결정 트리거 매트릭스)
- `docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md` (후속 ADR/spike 링크)
- `~/.claude/projects/.../memory/MEMORY.md` (인덱스 1행 추가)

---

## 다른 터미널 트랙 A 진행 상태 (세션 71 종료 시점)

`git status` 로 확인된 다른 터미널 영역:

```
M  package.json                                       # @aws-sdk/* 의존성 추가
M  package-lock.json
M  prisma/schema.prisma                                # File.storageType 컬럼 추가
?? prisma/migrations/20260501100000_add_file_storage_type/
?? src/app/api/v1/filebox/files/r2-confirm/
?? src/app/api/v1/filebox/files/r2-presigned/
?? src/lib/r2.ts
```

**상태**: 트랙 A V1 옵션 A 코드가 src/ 로 이동되어 있고 의존성 추가 + prisma 마이그레이션 작성 완료. 마이그레이션 적용/빌드/배포는 그쪽 터미널 진행. 본 터미널은 docs/ + memory 만 책임.

영역 분리 명확 — 본 commit 충돌 0.

---

## Compound Knowledge

1. **`.txt` 확장자로 사전 코드 보관 패턴**: ADR PROPOSED 단계에서 코드 자산 미리 작성해 놓고 ACCEPTED 직후 `cp + rename` 으로 5분 내 진입. lint/tsc/build 어디에도 영향 0. fallback 시 `rm -rf` 한 번이면 폐기. ADR-032 prepared-code/ 가 첫 적용 사례.

2. **베이스라인 우선 검증 룰**: wave/roadmap/blueprint 산출물의 권고만 보고 큰 발사를 진행하지 말 것. **`current.md` + `next-dev-prompt.md` + 최근 N개 handover + 실제 코드** 4개 사전 검증이 outdated 함정 차단. 본 세션에서 트랙 B-1/B-2 둘 다 outdated 함정 직격 — 다른 터미널 Claude의 정적 분석으로 회피. 메모리 `feedback_baseline_check_before_swarm.md` 등록.

3. **Cloudflare R2 egress $0 의 결정적 가치**: AWS S3 였으면 1.4GB 다운로드 트래픽 누적 → 비용 폭증. R2 는 egress 무료 + 10GB 무료 티어 → 운영자 단독 컨텍스트에서 사실상 무료. ADR-032 옵션 채택 결정의 핵심 차별점.

4. **R2 객체 키 prefix `tenants/{tenantId}/users/{userId}/`**: T1.5 멀티테넌트 filebox 전환 시 RLS 적용을 위한 사전 작업. 지금은 모두 'default' 테넌트로 가지만, 향후 R2 객체 prefix 만으로도 cross-tenant leak 방어 가능.

---

## 다음 세션 (s72) 추천 작업

### A. 트랙 A 후속 (다른 터미널이 끝까지 갔다면)
- ADR-032 PROPOSED → ACCEPTED 승격 (PoC 6항목 합격 확인)
- V2 multipart 진화 평가 (1GB+ 끊김 발생 빈도 측정 후 진입)
- 다운로드 라우트 (R2 presigned GET URL) 추가 — V1 본체에 미포함

### B. 미진입 자투리
- S71-B 매뉴얼 docx v1+ 시각 검증 추가 패치 (사용자 비교 피드백 필요)
- S71-C LibreOffice 설치 (sudo 비번 필요)
- spike-013-wal2json 실측 (extension 설치 sudo 필요)
- spike-016-SeaweedFS 50GB 실측 (50GB 디스크 + 적재 20분)

### C. 다른 영역 (사용자 정책상 본 세션 제외였던 항목)
- Almanac aggregator 비즈니스 로직 이식 (P0-1, ~28h)
- 메신저 M2-Step1 (Track B 병행)

---

## 검증 결과 (트랙 A commit 275464c, 다른 터미널 종료 시점)

본 세션 71 종료 직후 다른 터미널이 ADR-032 ACCEPTED 승격까지 진행 (자기 세션 72로 명명, commit `275464c`). 본 터미널이 그 결과를 정적 검증.

**✅ 통과 8/8**:
- commit 275464c 무결성 (18 파일 +6180/-3037, 메시지 + 변경 매핑 완벽)
- `src/lib/r2.ts` ↔ `prepared-code/r2-client.ts.txt` 1:1 적용 (사전 코드 패턴 검증됨)
- 라우트 2개 (r2-presigned/r2-confirm) prepared-code 1:1
- Prisma 마이그레이션 additive + DO 검증 블록 (3 row backfill)
- ADR-032 §1 `Accepted (2026-05-01 세션 71)` (다른 터미널 명명 71)
- 의존성 `@aws-sdk/*@3.1040`
- `scripts/r2-poc.mjs` 헬스체크 재사용 보너스
- PM2 ypserver pid 187964 online

**⚠️ 마무리 부족 6건 (S73+ 정정 권장)**:
- M1 spike-032 §4.2 PoC 실측 컬럼 미기입 (1.8ms / 100% / 17.3s 가 commit 메시지에만)
- M2 §3.2 권고 "옵션 B" 그대로 (실제 V1=A 정정 미반영) + §8 v0.3 row 미추가
- M3 ADR-032 §7 ACCEPTED 게이트 체크리스트 빈칸 (CORS / 1GB wall-clock 보류 사유 미명시)
- M4 `wsl-build-deploy.sh` `/.env` exclude 패치 미적용 (메모리 룰 + 솔루션 문서만 등록)
- M5 다운로드 라우트 미신설 (V1 백엔드만)
- M6 UI 50MB 분기 미적용 (`/filebox/page.tsx` 미수정)

M1~M3 = 추적성 보강 (각 5분), M4 = 운영 부채 영구 잔존 (5분 fix), M5~M6 = V1 진화 (다음 세션 별도 PR).

## 변경 이력

- 2026-05-01 v0.1 (세션 71): 초안 작성. S71-A spike + ADR-032 PROPOSED + V1 사전 코드 + SP-013/016 강화 + 베이스라인 검증 메모리 룰. 트랙 B 두 건 outdated 함정 회피로 취소.
- 2026-05-01 v0.2 (세션 71 종료 직후): 다른 터미널 commit 275464c 검증 결과 §검증 후술. M1~M6 부족 항목 명시 (S73+ 이월).
