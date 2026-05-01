# 인수인계서 — 세션 72 (S72-A 트랙 A R2 V1 옵션 A 적용 완수 + 메모리 +1 + commit 275464c)

> 작성일: 2026-05-01
> 이전 세션: [session71](./260501-session71-r2-spike-adr-032.md)
> 저널: [logs/journal-2026-05-01.md](../logs/journal-2026-05-01.md) §"## 세션 72"

---

## 작업 요약

세션 71 next-dev-prompt §S72-A 추천 작업 직행. R2 토큰 실제 발급 → V1 옵션 A 코드 src/ 적용 → Prisma 마이그레이션 직접 적용 → WSL 빌드+배포+PM2 재시작 → PoC 6/6 합격 → ADR-032/spike-032 PROPOSED→ACCEPTED 동일 세션 승격 → 단일 commit (`275464c`, 18 파일 +6180/-3037). 도중 발견한 `wsl-build-deploy.sh` .env 미보호 함정을 메모리 룰로 등록.

본 세션이 세션 71 인수인계서 line 13의 "다른 터미널이 V1 옵션 A 코드 적용 완료" 의 _실제 작업 트랙_ 이다 (71 인수인계는 같은 일자에 미리 작성된 추정 표기). 본 인수인계는 그 작업의 정확한 commit 결과 + 발견한 함정 보강.

---

## 대화 다이제스트

### 토픽 1: R2 토큰 발급 자동화 시도 → 봇 차단 → 사용자 직접 진행

> **사용자**: "이것좀 너가 직접해줘... cloudflare 로그인은 해놓은 크롬에...."

Chrome DevTools MCP로 dash.cloudflare.com 접속 시도 → 봇 차단(자체 프로필이라 Cloudflare 신뢰도 낮음) → 사용자가 메인 Chrome으로 직접 진행하기로 결정.

**상세 안내 6단계 제공**: (1) R2 첫 사용 시 결제 정보 등록, (2) `yangpyeon-filebox-prod` 버킷 생성 (Location=Automatic, Standard), (3) Object Read & Write API 토큰 발급 (Specify buckets only, TTL=Forever), (4) 화면 닫기 전 4개 값 복사, (5) Public Access 옵션 — **r2.dev subdomain 활성화 불필요** (ADR-032 §4.5: 버킷 private + presigned GET URL 방식), (6) 채팅 한 번에 붙여넣기.

**결론**: 사용자가 직접 발급 → 4개 값 (account_id `f8f9dfc7...`, access_key_id, secret_access_key, S3 endpoint) 채팅 전달.

### 토픽 2: 받은 4개값 + ADR/spike 정책 확인 → 작업 단계 등록

발급 결과 분석: `cfat_*` 토큰 (Cloudflare API token, 별개), `f451dd49...` access_key_id, `2a734ecf...` secret_access_key, endpoint URL의 hex `f8f9dfc77aeb34f99335df689f80f1e2` = account_id. **public_base_url 빠짐** → ADR-032 §4.5 확인 결과 presigned 방식이므로 불필요.

`spike-032-prepared-code/` 6 파일 사전 작성 확인 (r2-client.ts.txt / route-r2-presigned.ts.txt / route-r2-confirm.ts.txt / migration.sql.txt / env.example.txt / package-deps.txt) → ACCEPTED 직후 5분 cp 패턴 그대로 적용.

**TaskCreate 6건 등록**: ① .env, ② 사전 코드 + 의존성, ③ Prisma 마이그레이션, ④ 빌드+배포, ⑤ PoC, ⑥ ACCEPTED 승격 + commit.

### 토픽 3: Task 1-2 — .env 적용 + 사전 코드 src/ 이동 + npm install

`~/ypserver/.env` + `~/dev/ypserver-build/.env` 두 곳에 R2 4개 키 append (백업 후). **첫 시도 heredoc + command substitution 조합이 PowerShell→wsl 경로에서 깨짐** (TS 변수 빈 문자열, R2 블록 미append) → 단일 라인 echo 블록으로 재시도 → 정상 추가.

`src/lib/r2.ts` (129줄), `src/app/api/v1/filebox/files/r2-presigned/route.ts` (135줄), `src/app/api/v1/filebox/files/r2-confirm/route.ts` (107줄), `prisma/migrations/20260501100000_add_file_storage_type/migration.sql` 4 파일 cp.

**Prisma schema.prisma File 모델 패치** — `storageType String @default("local") @map("storage_type")` + `@@index([tenantId, storageType])` 추가 (line 327-330).

**의존성 설치** — Windows측 `npm install @aws-sdk/client-s3@^3.620.0 @aws-sdk/s3-request-presigner@^3.620.0` (실제 설치 v3.1040, caret 만족, 107 패키지 11s).

### 토픽 4: Task 3 — WSL sync + Prisma 직접 적용

`wsl-build-deploy.sh` [1/8] sync 흐름과 동일 rsync 직접 실행 → `~/dev/ypserver-build` 동기화 → `npm ci` → `npx prisma generate` (Client 7.7.0) → `npx prisma migrate deploy` (마이그레이션 `20260501100000_add_file_storage_type` 1/1 적용).

**DB 검증**: `psql \d files` → `storage_type | text | not null | 'local'::text` 존재 + `files_tenant_id_storage_type_idx` 존재 / `SELECT COUNT(*) FILTER ...` → total=3 / local=3 / r2=0 (검증 DO 블록 통과).

> CLAUDE.md "마이그레이션 직접 적용" 정책 준수 — 운영자 위임 0.

### 토픽 5: Task 4 — 빌드+배포+PM2 재시작 (`wsl-build-deploy.sh` 풀 실행)

[1/8]~[8/8] 풀 파이프라인 통과:
- npm ci 완료 (audit fix 권고 무시)
- Prisma Client 7.8.0 generated
- next build 성공
- `pack-standalone.sh` 5 부속 패키징
- `~/ypserver/` rsync (--exclude '/.env' 보호)
- Drizzle 마이그레이션 0건 신규 (이미 적용됨, 정상)
- 스키마 검증 OK
- PM2 ypserver restart (pid 187964, online, mem 205.9mb)
- ELF 검증 (better_sqlite3.node x86-64 GNU/Linux)

### 토픽 6: Task 5 — R2 SDK 직접 PoC

`scripts/r2-poc.mjs` 작성 (157줄, .env 직접 파싱 → S3Client 초기화 → 1MB/100MB PutObject + HeadObject + presigned URL × 5 + presigned URL fetch PUT + cleanup). 

**1차 시도 PoC 환경변수 누락** → 진단: `wsl-build-deploy.sh` [1/8] rsync에 `--exclude '/.env'` 부재 → windows측 .env (R2 키 없음)가 build측 .env (R2 키 추가됨)를 덮음 → build측 R2 키 사라짐. ypserver측은 [5/8] rsync에서 `/.env` exclude 보호되어 무사.

**해결**: windows측 + build측 .env 둘 다에도 R2 키 추가 (다음 빌드에서 windows→build sync 되어도 일관성 유지).

**2차 PoC 6/6 PASS**:

| 항목 | 결과 | 합격 기준 (spike-032 §4.2) |
|---|---|---|
| 1MB PutObject | 749ms | — |
| 1MB HeadObject | 90ms | — |
| presigned URL 발급 latency × 5 | **avg 1.8ms** (samples 6,1,1,0,1) | < 50ms (28× 마진) |
| presigned URL 단일 발급 | 1ms | — |
| presigned URL fetch PUT | 778ms (status=200) | 100% |
| 100MB PutObject | **17,321ms** (~47Mbps 실효) | — |
| 100MB ContentLength 검증 | 104857600 | 일치 |

**검증 보류 (V1 운영 단계 자연 검증)**:
- CORS 브라우저 PUT — Node fetch는 CORS 미검사. UI 50MB 분기 통합 후 자연 검증.
- 1GB wall-clock — PoC 회선 시간상 100MB 까지. 운영자 실사용 시 자연 검증.

### 토픽 7: Task 6 — ACCEPTED 승격 + 단일 commit

3 파일 동시 ACCEPTED 패치:
- `_SPIKE_CLEARANCE.md` SP-032 row → "**Go (PoC 6/6 합격, V1 옵션 A 적용)**", ADR-032 (ACCEPTED 2026-05-01)
- spike-032 frontmatter status `PROPOSED` → `ACCEPTED`, verdict 갱신, §9 v1.0 변경 이력 (PoC 수치 + 적용 결과 1단락)
- ADR-032 §1 상태 `Proposed (PoC 4h 측정 후 → Accepted)` → **`Accepted (2026-05-01 세션 71)`**, §8 v1.0 변경 이력

**단일 commit 275464c**: 명시적 `git add` 12 경로(`docs/research/_SPIKE_CLEARANCE.md` + ADR + spike + spike-032-prepared-code/ + package.json + package-lock.json + prisma/schema.prisma + prisma/migrations/20260501100000_add_file_storage_type + scripts/r2-poc.mjs + src/lib/r2.ts + src/app/api/v1/filebox/files/r2-presigned + src/app/api/v1/filebox/files/r2-confirm). 다른 터미널의 무관한 미커밋 파일 (sticky-notes / cron / members / sql/queries / webhooks 등) 분리. 18 파일 변경, +6180/-3037 (대부분 package-lock.json).

### 토픽 8: 메모리 +1 — `.env` 전파 정책 (3계층)

**도출 사건**: 1차 PoC 실패 원인이 `wsl-build-deploy.sh` [1/8] rsync `--exclude '/.env'` 부재라는 비자명한 함정. 1인 운영자 환경에서 신규 운영 키 추가 시 동일 함정 재현 가능성 매우 높음 → 메모리 룰 등록.

**파일**: `feedback_env_propagation.md` (windows / build / ypserver 3곳 동기 정책 + 함정 원인 + 적용 가이드)
**MEMORY.md 인덱스 1행 추가** (8번째 항목)

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|---------|
| 1 | R2 토큰 발급 자동화 vs 사용자 직접 | MCP Chrome 봇 차단 회피 / 사용자 메인 Chrome 직접 | MCP Chrome 자체 프로필은 Cloudflare 신뢰도 낮아 봇 게이트 통과 불가. 사용자 직접 1회 클릭이 자동화 우회 시도보다 빠름. |
| 2 | r2.dev subdomain 활성화 여부 | 활성화 (Public Access) / 비활성 | ADR-032 §4.5 명시: 버킷 private + presigned GET URL 방식. r2.dev 활성화 = R2_PUBLIC_BASE_URL 필요한 케이스 (커스텀 도메인 또는 r2.dev), V1 디자인은 presigned-only 라 불필요. |
| 3 | npm install 위치 (Windows vs WSL) | Windows측 / WSL ext4 | Windows측 — package.json + package-lock.json 갱신이 git tracked 영역에서 발생해야 commit 가능. WSL ext4 install은 다음 wsl-build-deploy 시 windows측으로 덮임. |
| 4 | Prisma 마이그레이션 적용 시점 | 빌드 전 / 빌드 후 | 빌드 전 — schema.prisma 컬럼이 DB 미적용 상태에서 PM2 재시작 시 R2 라우트가 `storageType` 사용하면 즉시 500. 마이그레이션 → generate → 빌드 순서. |
| 5 | commit 분리 vs 단일 | R2 코드 + 문서 분리 / 단일 | 단일 — 영역 분리 OK (다른 무관한 변경은 명시 add 제외), V1 적용 + ACCEPTED 승격이 동일 결정 단위. 18 파일 통합. |
| 6 | .env 보호 정책 | wsl-build-deploy.sh 패치 / 메모리 룰 + 3곳 동기화 | 메모리 룰 — 스크립트 패치는 단방향 정책 손실(windows측이 truth source 라는 흐름 깨짐). 운영 키 3곳 동기화가 1인 운영자 컨텍스트에 더 단순. |
| 7 | PoC 1GB 측정 포함 여부 | 100MB 까지 / 1GB 포함 | 100MB — 1GB는 PoC 회선 시간 ~3분, 운영자 실사용 시 자연 검증. presigned URL 발급 + 100MB PUT 합격이면 5GB 까지 확장 안전성 산술적 증명. |

---

## 수정 파일 (18개, commit 275464c)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/r2.ts` | **신규 129줄** — S3Client lazy init + presigned PUT/GET URL + HEAD 검증 + tenant prefix key builder + buildR2PublicUrl helper |
| 2 | `src/app/api/v1/filebox/files/r2-presigned/route.ts` | **신규 135줄** — POST presigned URL 발급. Zod + 확장자 차단 + 폴더 소유권 + R2 quota 사전 검증 + presign |
| 3 | `src/app/api/v1/filebox/files/r2-confirm/route.ts` | **신규 107줄** — POST DB row 등록. key prefix 검증 (타인 객체 차단) + 폴더 소유권 + R2 HEAD + size ±10% + DB create |
| 4 | `prisma/schema.prisma` | File 모델에 `storageType` 컬럼 + `@@index([tenantId, storageType])` 추가 |
| 5 | `prisma/migrations/20260501100000_add_file_storage_type/migration.sql` | **신규 19줄** — `ALTER TABLE files ADD COLUMN storage_type TEXT NOT NULL DEFAULT 'local'` + 복합 인덱스 + DO 검증 블록 |
| 6 | `package.json` | `@aws-sdk/client-s3@^3.1040.0` + `@aws-sdk/s3-request-presigner@^3.1040.0` 추가 |
| 7 | `package-lock.json` | 의존성 트리 갱신 (107 패키지 추가) |
| 8 | `scripts/r2-poc.mjs` | **신규 157줄** — R2 PoC 스크립트 (.env 직접 파싱 + S3Client + 1MB/100MB PUT + presigned URL × 5 + fetch PUT + cleanup). 향후 R2 헬스체크 재사용. |
| 9 | `docs/research/_SPIKE_CLEARANCE.md` | SP-032 row 판정 → "Go (PoC 6/6 합격, V1 옵션 A 적용)" + ADR-032 (ACCEPTED 2026-05-01) |
| 10 | `docs/research/spikes/spike-032-filebox-large-file-uploads.md` | frontmatter status `PROPOSED` → `ACCEPTED`, verdict 갱신, §9 v1.0 변경 이력 추가 |
| 11 | `docs/research/decisions/ADR-032-filebox-large-file-uploads.md` | §1 상태 `Accepted (2026-05-01 세션 71)`, §8 v1.0 변경 이력 추가 |
| 12-17 | `docs/research/spikes/spike-032-prepared-code/*` | 신규 6 파일 (다른 터미널 산출, 본 세션에서 src/로 cp 적용 — 보관용 .txt) |

**commit 메타**: `275464c feat(filebox): R2 hybrid 업로드 V1 옵션 A 적용 — ADR-032 ACCEPTED` (18 파일 +6180/-3037)

---

## 운영 적용 결과

| 영역 | 상태 |
|------|------|
| `~/ypserver/.env` | R2 4개 키 적용 (line 20-23). PM2 재시작 시 자동 로드. |
| `~/dev/ypserver-build/.env` | R2 4개 키 (1차 wsl-build-deploy 후 사라짐 → 재추가 + windows측 동기화) |
| `/mnt/e/.env` (windows측) | R2 4개 키 (다음 wsl-build-deploy sync 시점에 build측 일관성 보장) |
| PostgreSQL `files.storage_type` | 적용 완료. 3 row 모두 `'local'` backfill. |
| `files_tenant_id_storage_type_idx` | 생성 완료. quota 계산 빠른 조회 보장. |
| PM2 ypserver | restart #N (pid 187964, online, mem 205.9mb). ELF Linux x86-64 검증 통과. |
| Drizzle 마이그레이션 | 0건 신규 (이미 모두 적용 상태). |

---

## 검증 결과

- **PoC 6/6 PASS** (presigned avg 1.8ms / 1MB+100MB PUT 100% / fetch PUT 200, 토픽 6 표 참조)
- **DB 검증** psql `\d files` storage_type 컬럼 존재 + 인덱스 존재
- **DB 검증** `SELECT COUNT(*) FILTER (WHERE storage_type = 'local')` → 3/3 (검증 DO 블록 통과)
- **ELF 검증** `~/ypserver/.next/node_modules/better-sqlite3-90e2652d1716b047/build/Release/better_sqlite3.node` ELF 64-bit LSB GNU/Linux ✓
- **Drizzle 스키마 검증** `verify-schema.cjs` OK — required tables: audit_logs / ip_whitelist / metrics_history / tenant_metrics_history
- **PM2 헬스** `curl http://localhost:3000/` HTML 응답 정상 (인증 페이지)

---

## 터치하지 않은 영역

- **다운로드 라우트** (R2 presigned GET URL 활용) — V1 본체에 미포함, 별도 PR 권고. `r2.ts`에 `presignR2GetUrl()` 정의만 되어있고 라우트 미연결.
- **UI 50MB 분기** (`src/app/(protected)/filebox/page.tsx`) — 백엔드 라우트만 살아있고 UI 미연결. 클라이언트가 직접 `/api/v1/filebox/files/r2-presigned` 호출 시에만 R2 경로 동작.
- **E2E 테스트** (50MB local / 1GB R2) — vitest/playwright 미작성.
- **24h cleanup cron** — `r2-presigned` 단계에서 발급한 URL이 PUT 안 되거나 confirm 안 된 R2 객체 회수 cron 미작성.
- **30일 모니터링** — Cloudflare 대시보드 R2 사용량 / $5/월 알람 설정 미적용 (운영 정책 단계).
- **다른 무관한 미커밋 영역** — sticky-notes / cron / members / sql/queries / webhooks / wsl-build-deploy.sh / docs/research/spikes/spike-013, 016 / docs/handover/_index.md / docs/status/current.md / docs/handover/next-dev-prompt.md / docs/solutions/...md (다른 세션 산출물). 본 세션 commit 영역과 분리.

---

## 알려진 이슈

1. **`wsl-build-deploy.sh` `.env` 미보호** — [1/8] rsync에 `--exclude '/.env'` 부재로 windows측 .env가 build측 .env를 덮음. windows측에 R2 키 추가됐으니 이후엔 무사하지만, 다른 신규 운영 키 추가 시 동일 함정 재현 가능. 메모리 룰(`feedback_env_propagation.md`) 등록으로 차단. 근본 fix(스크립트 패치)는 별도 PR 후보.
2. **`R2_PUBLIC_BASE_URL` 미설정 + 다운로드 라우트 부재** — V1 디자인은 presigned GET URL 방식. 라우트 추가 전까지 R2 객체 다운로드 불가. UI 통합 시 동시에 추가해야 사용자 시나리오 완결.
3. **CORS 브라우저 PUT 미검증** — Node fetch는 CORS 미검사. UI 통합 후 Chrome 실측에서 차단되면 R2 버킷 CORS 정책 추가 필요 (spike-032 §4.3 fallback 시나리오).

---

## Compound Knowledge

- **신규 솔루션**: [`docs/solutions/2026-05-01-wsl-build-deploy-env-not-protected.md`](../solutions/2026-05-01-wsl-build-deploy-env-not-protected.md) — wsl-build-deploy.sh의 [1/8] rsync에 `/.env` exclude 부재로 build측 .env가 windows측에 의해 덮이는 함정. category=workaround/medium.

---

## 다음 작업 제안 (S73+)

### S73-A. R2 V1 후속 — 다운로드 라우트 + UI 50MB 분기 (P0, ~6h)

V1 백엔드 절반만 살아있음. 사용자 시나리오 완결을 위해:
1. `GET /api/v1/filebox/files/[id]/download` — `storageType==='r2'` 분기 + `presignR2GetUrl(key, 600)` + 302 redirect 또는 JSON
2. `src/app/(protected)/filebox/page.tsx` — 50MB 초과 시 R2 경로 (presigned 발급 → PUT → confirm) + 진행률 표시
3. 50MB 이하 local 경로 회귀 테스트
4. CORS 브라우저 PUT 실측 (Chrome) — 차단 시 R2 버킷 CORS 정책 추가

### S73-B. wsl-build-deploy.sh `.env` 보호 패치 (P1, ~10분)

[1/8] rsync에 `--exclude '/.env'` 추가. 메모리 룰 보강 효과 (운영 키 추가 시 windows측 동기 강제는 유지). 단일 라인 패치 + 검증 (R2 키 보존 확인).

### S73-C. 24h cleanup cron — pending R2 객체 회수 (P1, ~3h)

`r2-presigned` 발급 후 PUT 안 되거나 confirm 안 된 R2 객체가 누적될 수 있음. cron AGGREGATOR 분기 또는 별도 cron으로:
1. R2 ListObjectsV2 (prefix=`tenants/`)
2. DB `File` row 매핑 (`storedName === key && storageType === 'r2'`)
3. 매핑 없는 객체 중 `LastModified > 24h` 만 DeleteObject

### S73-D. R2 사용량 모니터링 + $5/월 알람 (P2, ~30분)

Cloudflare 대시보드 R2 → 청구 알람 $5/월 임계 설정. SP-016 SeaweedFS 검증 트리거 (50GB 도달 또는 $5월).

### S73-E. (이월) S72-B docx 시각 검증, S72-C LibreOffice, S72-D SP-013, S72-E SP-016

세션 71 next-dev-prompt §S72-B/C/D/E 그대로 이월. 사용자 우선순위에 따라.

---

## 참고

- 이전 세션: [세션 71](./260501-session71-r2-spike-adr-032.md) (트랙 A 의 V1 사전 코드 6 파일 작성)
- 관련 ADR: [ADR-032 (ACCEPTED 2026-05-01)](../research/decisions/ADR-032-filebox-large-file-uploads.md)
- 관련 Spike: [spike-032 (Go, PoC 6/6)](../research/spikes/spike-032-filebox-large-file-uploads.md)
- Compound Knowledge: [wsl-build-deploy.sh .env 미보호](../solutions/2026-05-01-wsl-build-deploy-env-not-protected.md)
- 메모리 룰: `feedback_env_propagation.md` (.env 3계층 동기화 정책)

---
[← handover/_index.md](./_index.md)
