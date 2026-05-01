# 다음 세션 프롬프트 (세션 73)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

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

## ⭐ 세션 73 추천 작업

### S73-A. **R2 V1 후속 — 다운로드 + UI + CORS 실측** (P0, ~6h)

S72에서 V1 백엔드 라우트(`r2-presigned` / `r2-confirm`)만 살아있음. 사용자 시나리오 완결 위해:
1. **다운로드 라우트** `GET /api/v1/filebox/files/[id]/download`:
   - `prisma.file.findUnique({id})` → `storageType==='r2'` 분기
   - `presignR2GetUrl(file.storedName, 600)` (10분 유효) → 302 redirect 또는 JSON
   - 권한 검증: 폴더 소유권 + 공유 정책 (기존 local 라우트 패턴 답습)
2. **UI 50MB 분기** `src/app/(protected)/filebox/page.tsx`:
   - 50MB 초과 → R2 경로: presigned 발급 → fetch PUT → confirm 호출 → row 갱신
   - 50MB 이하 → local 경로 (기존 유지)
   - 진행률 표시 (XHR upload progress event 또는 Streams API)
3. **50MB 이하 local 경로 회귀 테스트** (vitest 또는 curl)
4. **CORS 브라우저 PUT 실측** (Chrome 50MB+ 업로드):
   - 차단 시 R2 버킷 CORS 정책 추가 (Cloudflare 대시보드 → 버킷 Settings → CORS)
   - `AllowedOrigins: https://stylelucky4u.com`, `AllowedMethods: PUT,GET,HEAD`
5. **24h pending 객체 회수 cron** (선택, S73-C 와 묶음): 발급 후 confirm 안 된 R2 객체 cleanup

### S73-B. **`wsl-build-deploy.sh` `.env` 보호 패치** (P1, ~10분)

S72에서 발견한 함정 근본 fix. [1/8] rsync에 `--exclude '/.env'` 추가:

```diff
 rsync -a --delete \
+  --exclude '/.env' \
   --exclude 'node_modules/' \
   ...
   "$REPO_WIN_PATH/" "$WSL_BUILD_DIR/"
```

**검증**: 패치 후 R2 키 추가 → `wsl-build-deploy.sh` 1회 실행 → build측 .env에 R2 키 유지 확인. **메모리 룰** `feedback_env_propagation.md`는 그대로 유지(windows측 truth source 정책 일관성).

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

## 세션 71 미커밋 변경 (다음 세션 진입 시 처리 필요)

**본 터미널 (docs/ + memory) — 세션 71 종료 시 commit 시도**:
```
[신규]
docs/research/decisions/ADR-032-filebox-large-file-uploads.md
docs/research/spikes/spike-032-filebox-large-file-uploads.md
docs/research/spikes/spike-032-prepared-code/{README,migration.sql,r2-client.ts,route-r2-presigned.ts,route-r2-confirm.ts,env.example,package-deps}.txt + README.md
docs/handover/260501-session71-r2-spike-adr-032.md

[수정]
docs/research/_SPIKE_CLEARANCE.md
docs/research/spikes/spike-013-wal2json-slot-result.md
docs/research/spikes/spike-016-seaweedfs-50gb-result.md
docs/solutions/2026-05-01-cloudflare-tunnel-100mb-body-limit-large-upload.md
docs/handover/_index.md
docs/handover/next-dev-prompt.md
docs/status/current.md
```

**다른 터미널 (src/+prisma/+package.json) — 별도 commit 또는 그쪽 세션에서**:
```
[수정] package.json, package-lock.json, prisma/schema.prisma
[신규] prisma/migrations/20260501100000_add_file_storage_type/
       src/app/api/v1/filebox/files/r2-{presigned,confirm}/route.ts
       src/lib/r2.ts
```

**세션 70 잔여 (본 세션 손대지 않음)**: `.claude/settings.json`, `scripts/wsl-build-deploy.sh`, `.claude/scheduled_tasks.lock`, `.kdyswarm/`, `.claude/worktrees/`, `docs/research/baas-foundation/05-aggregator-migration/`

---

## 세션 시작 시 첫 행동

1. `git status` 로 다른 터미널 트랙 A 진행 결과 확인
2. ADR-032 PROPOSED → ACCEPTED 승격 가능 여부 확인 (PoC 결과 기록 있나)
3. **베이스라인 검증 룰 발동** — current.md + next-dev-prompt + 최근 handover 5개 + 실제 코드 4개 점검
4. 사용자 명시 작업 또는 위 추천 중 자율 진행
