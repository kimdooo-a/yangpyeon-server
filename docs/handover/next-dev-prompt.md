# 다음 세션 프롬프트 (세션 77)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 76 종료)

- **세션 76 핵심 (R2 객체 즉시 삭제 best-effort + 운영 모니터링 가이드, commit `8bf1b5f` + `82fadb1`)**:
  1. **`deleteR2Object(key)` 신규** (`src/lib/r2.ts` +28-1, commit `8bf1b5f`): `DeleteObjectCommand` 호출. NotFound 은 success swallow (호출자가 DB row 먼저 삭제한 정상 케이스), 그 외 에러 throw — 라이브러리는 라이브러리, swallow 정책은 호출자 영역.
  2. **`deleteFile()` R2 분기 보강** (`src/lib/filebox-db.ts` +10-3, commit `8bf1b5f`): `prisma.file.delete()` 후 `try { await deleteR2Object(file.storedName) } catch { console.warn(...) }` (best-effort). DB row 는 이미 사라졌으므로 R2 잔존 객체는 24h cleanup cron 의 회수 대상.
  3. **3단계 분리 결정**: 24h pending cleanup cron 은 cron runner `kind` enum (SQL/FUNCTION/WEBHOOK) 가 R2 SDK 호출 미지원 → 새 kind 또는 별도 스케줄러 필요. 별도 PR (§S77-A).
  4. **R2 운영 모니터링 가이드 신규** (`docs/guides/r2-monitoring.md` +101, commit `82fadb1`): §S73-D 운영 절차를 자동 발화 가능 가이드로 문서화. 3종 트리거(T1 $5/월 / T2 50GB / T3 1GB wall-clock >120s) + 트리거별 1주 내 / 1개월 내 액션 매트릭스 + 24h cleanup cron 부채 §6 추적. ADR-032 본체 미수정 (머지 충돌 회피).
  5. **검증**: `npx tsc --noEmit` exit 0.
  6. **본 conversation /cs 산출**: journal §"세션 76" 보강 / current.md row 76 보강 / logs/2026-05.md s76 entry 보강 / handover s76 보강 / 본 prompt 보강. 다른 터미널이 row 76 등을 사전 시뮬레이션 작성해 둔 상태였고, 본 /cs 는 commit `82fadb1` 흡수만 보강.
  7. **세션 77 첫 작업** = §S77-A 24h pending cleanup cron 또는 §S77-B R2 콘솔 CORS 적용 + R2 모니터링 가이드 §2.1 청구 알람 1회 설정 (운영자 본인 8분).

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 75 종료)

- **세션 75 핵심 (redundant verification — M1~M4 doc cleanup 동시 작업 충돌)**:
  1. **본 세션이 시도한 작업**: S72 R2 V1 검증 후 마무리 6건(M1~M6) 식별 → M1~M4 자율 cleanup 진행 (spike-032 §4.2 PoC 표 / §3 헤더 / §9 v0.3 / ADR-032 §7 게이트 / wsl-build-deploy.sh /.env exclude).
  2. **결과**: 같은 워킹트리에서 동시 진행 중인 다른 터미널이 동일 M1~M4 cleanup 을 commit `6061cdc docs(s73-followup): M1-M4 spike-032/ADR-032 PoC 실측 정리 + wsl-build-deploy .env 보호` 로 먼저 적용. 본 세션의 spike/ADR/wsl-build-deploy.sh edits 는 byte-identical → unstaged 단계에서 자동으로 no-op. M5/M6 도 다른 터미널 s73 (commit `9eac758`) 에서 적용 완료, s74 = ALS 마이그레이션 (commit `c7f1c39`) 도 별도 마감.
  3. **본 세션 산출**: session-end 문서만 (current.md s75 row / logs/2026-05.md s75 entry / journal s75 / handover `260501-session75-r2-doc-cleanup-overlap.md` / 본 prompt 갱신). 코드/마이그레이션/의존성 변경 0.
  4. **교훈 (메모리 룰 후보)**: 같은 워킹트리에서 동시 진행 중인 다른 터미널 작업과 task overlap 가능. `/cs` 단계 진입 전 `git log --oneline -5` 로 동일 영역 commit 여부 사전 확인 → byte-identical no-op 누적 방지. (S71 의 `feedback_baseline_check_before_swarm` 룰의 자매 룰 후보)
  5. **세션 76 첫 작업** = 운영자 R2 콘솔 CORS 적용(아래 §S76-A 1단계, 3분) + 50MB+ 브라우저 PUT 실측(5분).

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 74 종료)

- **세션 74 핵심 (메모 사고 후속 — 모바일 드래그 + ALS 마이그레이션)**:
  1. **모바일 드래그 PointerEvent 전환** — `sticky-note-card.tsx` `MouseEvent` → `PointerEvent` 통합. `setPointerCapture` + `touchAction: 'none' (owner only)` + `pointercancel` 핸들러. 헤더 owner-only 차단 + read-only 사용자 page scroll 정상 보존.
  2. **28→31 라우트 ALS 마이그레이션 일괄 적용**: 운영 콘솔 22(`OPS_CTX = { tenantId, bypassRls: true } as const` 패턴, functions/log-drains 7 파일은 bypassRls 미설정 정책 유지) + 테넌트 5(`tenantPrismaFor({ tenantId: tenant.id })` 가드 arg 활용) + 메신저 라이브러리 4(`getCurrentTenant() + ctx 캐시`, `withTenantTx` 그대로 유지). 다중 statement `runWithTenant` 블록은 `db = tenantPrismaFor(...)` 캐시 + sequence 분해.
  3. **의도적 제외 3건**: `lib/filebox-db.ts` (raw prisma + ADR-024 부속결정 T1.5), `lib/tenant-router/membership.ts` (tenant 결정 *전* 단계 base prisma 정당), `app/api/v1/filebox/files/r2-presigned/route.ts` (TODO T1.5).
  4. **검증**: `tsc --noEmit` exit 0, 잔여 `prismaWithTenant.X` 호출 0건. 메모리 `project_workspace_singleton_globalthis.md` 함정 2 섹션에 마이그레이션 완료 사실 추가.
  5. **미커밋**: 32 파일 + 메모리 1. 세션 75 진입 시 commit + WSL 배포 + 폰 실측 필요.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 73 종료)

- **세션 73 핵심 (다른 터미널 — R2 UI 50MB 분기 + 다운로드 302)**: 세션 72 백엔드 위에 **UI 50MB 분기 + XHR 진행률 + 다운로드 302 redirect** 적용 완료. 코드는 운영 검증 가능 상태. 단 **R2 콘솔 CORS 1회 작업 보류** — 현 토큰이 Object Read/Write 한정, bucket-level 정책 변경 시 AccessDenied(403). 콘솔 작업 또는 admin 토큰 발급 필요.
  1. **변경 5건**: `src/components/filebox/file-upload-zone.tsx` (50MB 분기 + XHR 진행률 + 5GB cap) / `src/lib/filebox-db.ts` (getFileForDownload R2 분기 + deleteFile R2 분기 — R2 객체 잔존 TODO) / `src/lib/r2.ts` (presignR2GetUrl `responseContentDisposition` 옵션) / `src/app/api/v1/filebox/files/[id]/route.ts` (storageType='r2' 시 302 redirect) / `scripts/r2-cors-apply.mjs` (admin 토큰 발급 후 사용 가능).
  2. **세션 74 첫 작업** = 운영자 R2 콘솔 CORS 적용(아래 §S74-A 1단계, 3분) + 50MB+ 브라우저 PUT 실측(5분).
  3. **R2 객체 잔존 부채**: deleteFile 가 R2 파일은 DB row 만 삭제. deleteR2Object 추가 + 24h cleanup cron(미등록 객체 회수)이 다음 PR.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 72 종료)

- **프로젝트명**: 양평 부엌 서버 — **1인 운영자의 멀티테넌트 백엔드 플랫폼** (stylelucky4u.com)
- **정체성**: closed multi-tenant BaaS (본인 소유 10~20개 프로젝트 공유 백엔드, 외부 가입 없음)
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL 16 (Prisma 7) + SQLite (Drizzle)
- **첫 컨슈머**: Almanac (almanac-flame.vercel.app) — 명시 라우트 5종 가동 + srv_almanac_* 키 발급(s69) + Vercel env 등록 대기. aggregator 비즈니스 로직 ~28h 대기.

- **세션 72 핵심** (S71-A 트랙 A 의 _실제 작업 트랙_, commit `275464c`):
  1. **R2 토큰 발급 + V1 옵션 A 적용 완수**: 사용자 메인 Chrome 직접 발급(MCP Chrome 봇 차단 우회) → 4값 수신(`yangpyeon-filebox-prod`, account_id `f8f9dfc7...`) → spike-032-prepared-code/ 6 파일 src/ cp + Prisma `storage_type` 컬럼 + `@aws-sdk/client-s3@3.1040` + WSL 빌드+배포+PM2 재시작.
  2. **PoC 6/6 PASS** — presigned URL 발급 avg **1.8ms** (목표 <50ms 28× 마진) / 1MB PutObject 749ms / 100MB PutObject 17.3s (~47Mbps) / fetch presigned PUT 200 / DB storage_type 인덱스 + 3 row backfill 검증.
  3. **ADR-032 + spike-032 PROPOSED → ACCEPTED 동일 세션 승격** — _SPIKE_CLEARANCE Go 판정 + 양 문서 변경 이력 v1.0 추가.
  4. **단일 commit `275464c`** 18 파일 +6180/-3037. 명시적 `git add` 12 경로로 다른 무관한 미커밋 파일(sticky-notes / cron / members / webhooks 등) 분리.
  5. **함정 발견 + 메모리 룰 +1**: `wsl-build-deploy.sh` [1/8] rsync에 `--exclude '/.env'` 부재 → windows측 .env가 build측 .env를 덮음. [5/8]은 ypserver측 보호 있음 — 비대칭 정책. **3곳 동기화 정책 채택** + `feedback_env_propagation.md` 메모리 등록.
  6. **CK +1**: `docs/solutions/2026-05-01-wsl-build-deploy-env-not-protected.md` (workaround/high).

- **세션 71 핵심** (참고): 트랙 A R2 hybrid spike-032/ADR-032 PROPOSED + V1 사전 코드 6 파일(`spike-032-prepared-code/`) + 트랙 B 두 건 outdated 함정 회피 + `feedback_baseline_check_before_swarm.md` 메모리 룰 + SP-013/016 정량 임계 강화. (S72에서 사전 코드 src/ cp 적용 완료)

- **세션 70 핵심** (참고): 부팅/종료 매뉴얼 전면 개정 + docx 재생성(v1 인라인 양식 baked-in) + 파일박스 1.4GB 진단(4단 게이트, 코드 변경 0).

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 운영 배포 (ypserver 스킬 v2):
#   /ypserver                       # 전체 파이프라인 (rsync → npm ci → build → pack → deploy → PM2)
#   /ypserver --migrate             # 빌드 후 prisma migrate deploy
#   /ypserver --quick               # rsync/npm ci 스킵, 빠른 코드 패치 검증

# 마이그레이션만 즉시 적용 (Claude 직접 적용 정책):
#   wsl -- bash -lic 'cd /mnt/e/00_develop/260406_luckystyle4u_server && \
#     DATABASE_URL="postgresql://postgres:<DB_PASSWORD>@localhost:5432/luckystyle4u?schema=public" \
#     npx prisma migrate deploy'

# tenant API 키 발급 (운영 콘솔 UI 도입 전 임시 절차):
#   wsl -- bash -lic 'cd ~/dev/ypserver-build && set -a && source ~/ypserver/.env && set +a && \
#     npx tsx scripts/issue-tenant-api-key.ts \
#       --tenant=<slug> --scope=pub|srv --name="<label>" --owner=<adminUserId> \
#       [--scopes=a,b,c]'
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |
| Almanac alias | https://stylelucky4u.com/api/v1/almanac/* (308 → /api/v1/t/almanac/*) |
| Almanac 정식 (5 endpoint) | https://stylelucky4u.com/api/v1/t/almanac/{categories,contents,sources,today-top,items/[slug]} |

---

## 운영 상태 (세션 72 종료 시점)

- **PM2**: ypserver online (~/ypserver/server.js, **pid 187964**, mem 205.9MB) + cloudflared online + pm2-logrotate
- **PostgreSQL 16**: **39 테이블** RLS enabled + tenant_id 첫 컬럼 + dbgenerated COALESCE fallback (S72에서 `files.storage_type` 컬럼 + `files_tenant_id_storage_type_idx` 인덱스 추가)
- **Tenants**: 'default' (00000000-0000-0000-0000-000000000000) + 'almanac' (00000000-0000-0000-0000-000000000001) — both `status='active'`
- **R2 (ADR-032 V1 옵션 A 적용)**: 버킷 `yangpyeon-filebox-prod` / account_id `f8f9dfc7...` / Object Read & Write 토큰 적용 / `~/ypserver/.env` + `~/dev/ypserver-build/.env` + `/mnt/e/.env` 3곳 동기화 / R2 사용량 0건 / 비용 $0.
- **Almanac 콘텐츠 데이터**: 37 카테고리(6 트랙) + 60 소스 (모두 active=FALSE), ContentItem 0건
- **API 키**: `srv_almanac_4EJMXSLc...` 발급 완료 (read:contents/sources/categories/items/today-top, owner=kimdooo@). 평문은 운영자 안전 채널 보관.
- **마이그레이션**: **29 마이그 up to date** (`20260501100000_add_file_storage_type` S72 적용)
- **ESLint**: 0 / TSC: 0 (S72 R2 신규 코드 포함) / Vitest: 372 pass + 33 skipped (R2 라우트 E2E 미작성)
- **Git**: 마지막 commit `275464c feat(filebox): R2 hybrid 업로드 V1 옵션 A 적용 — ADR-032 ACCEPTED` (18 파일 +6180/-3037, 미push 상태 — /cs 단계에서 origin/spec/aggregator-fixes 로 push 예정)

---

## ⭐ 세션 77 추천 작업

> 세션 76 에서 §S76-D 1·2단계 완료 (commit `8bf1b5f`). 3단계는 cron runner kind 확장 필요로 별도 PR §S77-A. 그 외 §S76-C R2 콘솔 CORS 와 §S76-A WSL 배포 + 폰 실측은 그대로 이월.

### ~~S77-A.~~ **24h pending cleanup cron — R2 SDK 호출 지원** ⚠️ **SUPERSEDED 2026-05-01 (세션 77 옵션 C)**

> **2026-05-01 옵션 C 채택으로 본 작업 SUPERSEDED.**
> R2 폐기 + SeaweedFS 자가호스팅 전환 (ADR-033 ACCEPTED) 에 따라 R2_CLEANUP cron 자체가 불필요.
> SeaweedFS 자가호스팅은 외부 quota 회계 부채가 없고, 디스크 사용량 모니터링 + filer leveldb 오케스트레이션만 필요.
> 후속 작업: SP-016 ACCEPTED + ADR-033 (세션 77 PHASE 5 산출).
> 본 §S77-A 본문은 역사 보존 목적으로 그대로 유지.

세션 76 에서 R2 즉시 삭제 best-effort 적용. 그러나 일시 장애로 best-effort 실패하거나 r2-presigned 발급 후 confirm 안 된 객체가 누적되면 R2 quota 회계 부채 → 24h cleanup cron 으로 회수 필요.

1. **cron runner `kind` 확장**: `src/lib/cron/runner.ts` 의 dispatch 분기에 `R2_CLEANUP` kind 추가. 또는 새 cron 시스템(node-cron, BullMQ) 도입 평가.
2. **cleanup handler**: R2 `ListObjectsV2` (prefix=`tenants/`) → DB `File` row 매핑 (`storedName === key && storageType === 'r2'`) → 매핑 없는 객체 중 `LastModified > 24h` 만 `DeleteObject`.
3. **운영 등록**: 매주 1회 실행. cron 표 등록 + 실패 시 audit log.
4. **검증**: 50MB+ 파일 업로드 → confirm 안 함 → 24h+ 후 cron 실행 → R2 콘솔에서 객체 사라짐 확인.

권고: 옵션 X (cron runner kind 확장). 기존 cron 시스템 dispatch 패턴이 단순 — 새 kind 1개 + handler 추가가 별도 스케줄러 도입보다 운영 부담 낮음.

### ~~S76-D.~~ **R2 객체 cleanup 부채 정리 1·2단계** ✅ **세션 76 완료** (commit `8bf1b5f`)

deleteR2Object 신규 + deleteFile R2 분기 best-effort 적용 완료. 3단계(24h cleanup cron) 만 §S77-A 로 이월.

### S77-W. **WSL 배포 + 폰에서 모바일 드래그 실측 + 회귀 ping smoke** (P0, ~20분)

세션 74 ALS 마이그레이션 + 모바일 드래그 commit `c7f1c39` + 세션 76 R2 cleanup commit `8bf1b5f` 모두 미배포 상태(PM2 ypserver 가 c7f1c39 이전 빌드).

1. `/ypserver` 스킬로 빌드+배포+PM2 재시작
2. 폰에서 stylelucky4u.com → /memo → 헤더 드래그 실측 (헤더만 드래그 활성, 텍스트 영역 편집 정상)
3. R2 파일 업로드 → 삭제 → R2 콘솔에서 객체 사라짐 확인 (best-effort 정상 동작)
4. **회귀 검증**: 자주 안 쓰는 라우트(log-drains/test, webhooks/[id]/trigger, cron/[id] PATCH/DELETE, admin/users/[id]/{sessions,mfa/reset}) 한 번씩 ping smoke

### ~~S76-A.~~ **세션 74 commit** ✅ **완료** (commit `c7f1c39 refactor(tenant-als): 31 라우트/lib tenantPrismaFor 마이그레이션 + 모바일 드래그 PointerEvent`)

ALS 마이그레이션 32 파일 + 모바일 드래그 1 + close ritual artifacts 6 = 38 파일 +1070-615 commit 완료. WSL 배포 + 폰 실측은 §S77-W 로 이월.

### ~~S76-B.~~ **세션 72/73 미커밋 정리** ✅ **완료** (commit `275464c` + `9eac758` 이미 존재)

세션 72 R2 V1 (`275464c feat(filebox): R2 hybrid 업로드 V1 옵션 A 적용`), 세션 73 R2 UI (`9eac758 feat(filebox): R2 UI 50MB 분기 + XHR 진행률 + 다운로드 302 redirect`) 모두 commit 됐음을 세션 75/76 에서 확인. 영역 분리 정리 완료.

### S76-C. **R2 콘솔 CORS 적용 + 브라우저 실측** (P0, ~10분 + 검증 5분)

세션 73 종료 시점 R2 백엔드/UI/다운로드 모두 코드 완료. 마지막 1마일 = R2 버킷 CORS 정책 적용.

1. **콘솔 1회 작업** (운영자 본인, 3분):
   - https://dash.cloudflare.com → R2 → `yangpyeon-filebox-prod` → Settings → CORS Policy
   - Add CORS policy → JSON paste → Save:
   ```json
   [
     {
       "AllowedOrigins": ["https://stylelucky4u.com", "http://localhost:3000"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   - 또는 admin 권한 R2 토큰 발급 → `node scripts/r2-cors-apply.mjs` 실행으로 자동화
2. **브라우저 실측** (5분):
   - https://stylelucky4u.com/filebox 로그인 → 60MB 파일 드래그 → "R2" 표기 + 진행률 % 갱신 → 업로드 완료 → 목록 등장
   - 다운로드 클릭 → Network 탭에서 302 redirect → R2 endpoint 직접 응답 확인
3. **실패 시 디버깅 순서**:
   - (a) Browser Console "CORS error" → CORS 정책 불일치 (origins 또는 headers)
   - (b) HTTP 403 + signature mismatch → Content-Type 헤더 불일치 (presign vs PUT)
   - (c) HTTP 400 expired → presigned URL 만료 (300초)

### S76-D. **R2 객체 cleanup 부채 정리** (P1, ~3h, 같은 PR 권고)

세션 73에서 deleteFile 이 R2 파일은 DB row 만 삭제 (TODO 주석 명시).

1. **deleteR2Object(key) 추가** (`src/lib/r2.ts`): `DeleteObjectCommand` 호출, NotFound 200(이미 없음) 처리.
2. **filebox-db.deleteFile 분기 보강**: storageType='r2' 시 `await deleteR2Object(file.storedName)` (DB delete 후 best-effort, 실패해도 row 는 이미 사라짐).
3. **24h pending cleanup cron** (선택): R2 객체 listObjectsV2 → 24h+ 미참조(DB file row 미존재) 객체 deleteObject. cron 등록 위치는 `src/lib/cron/runner.ts`.
4. **검증**: 50MB+ 파일 업로드 → 삭제 → R2 콘솔에서 객체 사라짐 확인.

### ~~S73-A.~~ **R2 V1 후속 — 다운로드 + UI 분기** ✅ **세션 73 완료**

S73-A line 1 (다운로드 라우트 storageType='r2' 분기) + line 2 (UI 50MB 분기 + XHR 진행률) + 다운로드 시 R2 redirect + 한국어 파일명 ResponseContentDisposition 모두 적용 commit 대기. line 4 (CORS) 만 S74-A로 남음.

### ~~S73-B.~~ **`wsl-build-deploy.sh` `.env` 보호 패치** ✅ **이미 적용됨**

[1/8] rsync에 `--exclude '/.env'` 추가 + `/data/`, `/logs/` leading `/` 앵커링 보강 모두 본 워킹트리에 적용된 상태(S73 진입 시 미커밋 상태로 발견 → 본 세션 commit에 포함). 검증은 다음 빌드 1회 실행 시 자동.

### S73-C. **24h cleanup cron — pending R2 객체 회수** (P1, ~3h)

`r2-presigned` 발급 후 PUT 안 되거나 confirm 안 된 R2 객체가 누적될 수 있음. cron AGGREGATOR 분기 또는 별도 cron으로:
1. R2 `ListObjectsV2` (prefix=`tenants/`)
2. DB `File` row 매핑 (`storedName === key && storageType === 'r2'`)
3. 매핑 없는 객체 중 `LastModified > 24h` 만 `DeleteObject`
4. 운영 시 매주 1회 실행 (cron 표 등록)

### S73-D. **R2 사용량 모니터링 + $5/월 알람** (P2, ~30분)

Cloudflare 대시보드 → Billing → Notifications. R2 청구 알람 $5/월 임계 설정. SP-016 SeaweedFS 검증 트리거(50GB 도달 또는 $5월) 발화 자동화.

### S73-E. **(이월 S72-B/C/D/E)** 매뉴얼 docx 사용자 비교, LibreOffice 설치, SP-013 wal2json 실측, SP-016 SeaweedFS 50GB 실측

세션 71 next-dev-prompt §S72-B/C/D/E 그대로 이월. 사용자 우선순위에 따라.

### S73-Z. **(참고)** 세션 72 미사용 추천 항목

(생략 — S72 추천이었으나 S73 설계로 흡수)

### (참고용 빈 자리)

세션 70에서 v1 인라인 양식을 styles.xml 에 baked-in 한 docx 재생성. 사용자가 Word 로 v1 과 비교 후 어색한 부분 보고 시:
- `_pandoc-ref-v1plus.docx` 의 styles.xml 만 패치
- `python3 scripts/build-pandoc-ref-from-v1.py` 재실행
- `pandoc --reference-doc=...` 으로 docx 재생성

### S72-C. **LibreOffice 설치** (P2, sudo 필요, 5분)

향후 docx 시각 검증 자동화 기반:
```bash
! wsl -d Ubuntu -- bash -ilc 'sudo apt install -y --no-install-recommends libreoffice-core libreoffice-writer'
```

### S72-D. **SP-013 wal2json 실측** (P2, sudo + 70분)

`docs/research/spikes/spike-013-wal2json-slot-result.md` §5.2 절차. PostgreSQL extension 설치 + 30분 DML + Consumer 다운/복구 + 5 메트릭 임계 매핑. ADR-010 보완.

### S72-E. **SP-016 SeaweedFS 50GB 실측** (P2, 50GB 디스크 + 적재 20분)

`docs/research/spikes/spike-016-seaweedfs-50gb-result.md` §5 절차. ADR-008 ASM-4 검증. ADR-032 R2 hybrid 결정 트리거 (50GB / $5월) 와의 갈래 정리.

---

## P0 (이월): Almanac Vercel env 등록 + 가시화 검증

### P0(이월)-0 — Almanac 측 env 등록 (양평 측 작업 0)

세션 69 발급 평문 키를 Almanac Vercel 측에:
1. Production env 추가: `ALMANAC_TENANT_KEY=srv_almanac_*` (운영자가 갖고 있는 평문)
2. Production env 추가: `NEXT_PUBLIC_AGGREGATOR_ENABLED=true`
3. Vercel Redeploy
4. /explore 카드 표시 시작 (Almanac 측 SSR/ISR 5분 캐시 활용)

당장은 ContentItem 0건이라 카드는 안 보이지만, aggregator 비즈니스 로직 + cron 등록 후 첫 카드부터 자동 노출.

### P0-1 — Aggregator 비즈니스 로직 이식 (~28h, T2.5 본체)

spec 의 10 모듈을 multi-tenant adaptation 으로 이식:
- 모든 Prisma 호출에 `prismaWithTenant` 또는 `withTenantTx`
- runner.ts 진입점에 `runWithTenant({ tenantId }, ...)` 한 번 SET
- cron AGGREGATOR kind 분기 (`src/lib/cron/runner.ts`)
- 위치: `packages/tenant-almanac/aggregator/` (T2.5 plugin 패턴) 또는 `src/lib/aggregator/` (M3 게이트 이전 임시)
- spec 파일: `docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/*` (10 파일)

이후 Cron 6종 등록 (rss-fetch / html-scrape / api-poll / classify / promote / cleanup) → 소스 5개 점진 활성화 → 24h 관찰 → 첫 카드.

---

## P0-2: 메신저 M2-Step1 (Track B 병행 가능)

`docs/research/messenger/m2-detailed-plan.md` §3 도메인 헬퍼 4개 시그니처 그대로. Track A(aggregator) 와 폴더 분리:
- Track A: `src/app/api/v1/t/[tenant]/{categories,contents,sources,today-top,items}/`, `src/lib/aggregator/`
- Track B: `src/lib/messenger/`, `src/app/api/v1/t/[tenant]/messenger/...`, `tests/messenger/`

---

## ⚠️ 베이스라인 검증 룰 (세션 71 등록, 메모리 자동 적용)

**kdyswarm/대규모 멀티에이전트 발사 전, 다음 4개 사전 점검 필수**:
1. `docs/status/current.md` 진행 상태 표 — 해당 Phase/모듈이 이미 완료(체크) 되어 있는가
2. `docs/handover/next-dev-prompt.md` — 다음 세션 추천 작업에 그 항목이 포함되어 있는가
3. 최근 5개 handover 파일 본문 — 해당 Phase/모듈 commit/세션 흔적
4. 실제 코드 베이스 — 라우트/모델/마이그레이션이 이미 존재하는가

세션 71에서 트랙 B-1(Phase 15) / B-2(baas-foundation Phase 3) 모두 outdated 함정 직격 → 다른 터미널 Claude 정적 분석으로 차단. 메모리 `feedback_baseline_check_before_swarm.md` 등록.

---

## 세션 74 미커밋 변경 (다음 세션 진입 시 commit 필요)

**본 세션 74 영역 (32 파일 + 메모리 1)** — 모바일 드래그 + ALS 마이그레이션:

```
[수정] src/components/sticky-notes/sticky-note-card.tsx

[수정] 운영 콘솔 22:
  src/app/api/v1/members/route.ts
  src/app/api/v1/members/[id]/route.ts
  src/app/api/v1/members/[id]/role/route.ts
  src/app/api/v1/sql/queries/route.ts
  src/app/api/v1/sql/queries/[id]/route.ts
  src/app/api/v1/webhooks/route.ts
  src/app/api/v1/webhooks/[id]/route.ts
  src/app/api/v1/webhooks/[id]/trigger/route.ts
  src/app/api/v1/cron/route.ts
  src/app/api/v1/cron/[id]/route.ts
  src/app/api/v1/functions/route.ts
  src/app/api/v1/functions/[id]/route.ts
  src/app/api/v1/functions/[id]/run/route.ts
  src/app/api/v1/functions/[id]/runs/route.ts
  src/app/api/v1/log-drains/route.ts
  src/app/api/v1/log-drains/[id]/route.ts
  src/app/api/v1/log-drains/[id]/test/route.ts
  src/app/api/v1/api-keys/route.ts
  src/app/api/v1/api-keys/[id]/route.ts
  src/app/api/settings/users/route.ts
  src/app/api/admin/users/[id]/sessions/route.ts
  src/app/api/admin/users/[id]/mfa/reset/route.ts

[수정] 테넌트 라우트 5:
  src/app/api/v1/t/[tenant]/categories/route.ts
  src/app/api/v1/t/[tenant]/sources/route.ts
  src/app/api/v1/t/[tenant]/today-top/route.ts
  src/app/api/v1/t/[tenant]/items/[slug]/route.ts
  src/app/api/v1/t/[tenant]/contents/route.ts

[수정] 메신저 라이브러리 4:
  src/lib/messenger/reports.ts
  src/lib/messenger/messages.ts
  src/lib/messenger/conversations.ts
  src/lib/messenger/blocks.ts

[메모리] ~/.claude/projects/.../memory/project_workspace_singleton_globalthis.md (함정 2 마이그레이션 완료 사실 추가)

[신규/수정] docs/handover/_index.md (세션 74 row)
            docs/handover/next-dev-prompt.md (세션 75용 갱신)
            docs/handover/260501-session74-als-migration-mobile-drag.md (신규)
            docs/logs/2026-05.md (세션 74 항목)
            docs/logs/journal-2026-05-01.md (세션 74 토픽 8개)
            docs/status/current.md (세션 74 row)
```

**다른 무관한 미커밋 영역 (분리 필요)**:
- 세션 72 R2 V1: `src/lib/r2.ts`, `src/app/api/v1/filebox/files/r2-{presigned,confirm}/route.ts`, `prisma/migrations/20260501100000_...`, `prisma/schema.prisma`, `package.json`+`package-lock.json`, `scripts/r2-poc.mjs`, `docs/research/decisions/ADR-032-...`, `docs/research/spikes/spike-032-*`
- 세션 73 R2 UI: `src/components/filebox/file-upload-zone.tsx`, `src/app/api/v1/filebox/files/[id]/route.ts`, `src/lib/filebox-db.ts` (deleteFile R2 분기), `scripts/wsl-build-deploy.sh` (.env exclude 보강), `scripts/r2-cors-apply.mjs`
- 다른 무관: `.claude/settings.json`, `.kdyswarm/`, `.claude/worktrees/`, `docs/research/baas-foundation/05-aggregator-migration/`, `docs/research/spikes/spike-013, 016`, `docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md`

---

## 세션 시작 시 첫 행동

1. `git status` 로 미커밋 영역 확인 — 세션 74 + 다른 무관 영역 분리 완성도 점검
2. **S75-A 우선 (세션 74 commit + 배포 + 모바일 실측)** — ALS 마이그레이션 회귀 위험 + 모바일 드래그 검증 보류 상태
3. **S75-B (세션 72/73 미커밋 정리)** — 영역 분리 별개 commit
4. **베이스라인 검증 룰 발동** — current.md + next-dev-prompt + 최근 handover 5개 + 실제 코드 4개 점검
5. S75-C (R2 CORS) → S75-D (R2 cleanup) 순차 또는 사용자 명시 작업
