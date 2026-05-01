# 다음 세션 프롬프트 (세션 72)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 71 종료)

- **프로젝트명**: 양평 부엌 서버 — **1인 운영자의 멀티테넌트 백엔드 플랫폼** (stylelucky4u.com)
- **정체성**: closed multi-tenant BaaS (본인 소유 10~20개 프로젝트 공유 백엔드, 외부 가입 없음)
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL 16 (Prisma 7) + SQLite (Drizzle)
- **첫 컨슈머**: Almanac (almanac-flame.vercel.app) — 명시 라우트 5종 가동 + srv_almanac_* 키 발급(s69) + Vercel env 등록 대기. aggregator 비즈니스 로직 ~28h 대기.

- **세션 71 핵심**: docs/+memory 본 터미널 + src/+prisma/ 다른 터미널 병렬 진행.
  1. **S71-A 파일박스 large-file R2 hybrid — ADR-032 ACCEPTED + V1 옵션 A 적용 완료**. 4단 게이트(Cloudflare 100MB / MAX_FILE_SIZE 50MB / quota 500MB / formData OOM) 해소 옵션 B 채택 (V1=A 단일 PUT / V2=B multipart 3개월 진화). local+R2 hybrid 50MB 경계. R2 egress $0 + 10GB 무료 = 사실상 무료. **PoC 6/6 합격** (presigned avg 1.8ms / 1MB+100MB PUT 100% / fetch PUT 200) → 다른 터미널이 V1 옵션 A 코드 적용 완료 (sub-step 미커밋 가능성 — git status 확인 필요).
  2. **트랙 A 다른 터미널 적용 영역**: package.json + package-lock.json + prisma/schema.prisma + prisma/migrations/20260501100000_add_file_storage_type/ + src/app/api/v1/filebox/files/r2-{presigned,confirm}/route.ts + src/lib/r2.ts. 본 터미널 docs/ 영역과 충돌 0.
  3. **트랙 B 두 건 영구 취소** — B-1 Phase 15 Auth Advanced = 이미 s32-34 완료(prod 배포 중), B-2 baas-foundation Phase 3 = M3 게이트 미통과 + 메신저 정책 제외로 후보 부재. supabase-parity Wave5 roadmap(2026-04-18) status 갱신 부재가 원인.
  4. **베이스라인 검증 메모리 룰 등록** — `feedback_baseline_check_before_swarm.md`. kdyswarm/대규모 발사 전 current.md/next-dev-prompt/최근 handover/실제 코드 4개 사전 점검 강제. (트랙 B outdated 함정 회피 사례에서 도출)
  5. **D 트랙 ADR 보완 4건** — 이미 세션 30(2026-04-19) 완료된 상태 → `_SPIKE_CLEARANCE` "보완 대기" 표기 갱신만 필요. 베이스라인 룰 적용 사례 1건 추가.
  6. **SP-013/016 강화** — 정량 Go/No-Go 임계 11 메트릭 + ADR-032 결정 트리거 매트릭스.

- **세션 70 핵심** (참고): 부팅/종료 매뉴얼 전면 개정 (`dashboard→ypserver`, standalone) + docx 재생성 (v1 인라인 양식 baked-in styles.xml 패턴) + 파일박스 1.4GB 진단 (4단 게이트 모두 차단 확인, 코드 변경 0).

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

## 운영 상태 (세션 71 종료 시점)

- **PM2**: ypserver online (~/ypserver/server.js, restart #6, pid 93211) + cloudflared online + pm2-logrotate
- **PostgreSQL 16**: 38 테이블 RLS enabled + tenant_id 첫 컬럼 + dbgenerated COALESCE fallback
- **Tenants**: 'default' (00000000-0000-0000-0000-000000000000) + 'almanac' (00000000-0000-0000-0000-000000000001) — both `status='active'`
- **Almanac 콘텐츠 데이터**: 37 카테고리(6 트랙) + 60 소스 (모두 active=FALSE), ContentItem 0건
- **API 키**: `srv_almanac_4EJMXSLc...` 발급 완료 (read:contents/sources/categories/items/today-top, owner=kimdooo@). 평문은 운영자 안전 채널 보관.
- **마이그레이션**: 28 마이그 up to date (세션 71 종료 시점 기준 — 트랙 A R2 마이그 추가 시 29)
- **ESLint**: 0 / TSC: 0 / Vitest: 372 pass + 33 skipped

---

## ⭐ 세션 72 추천 작업

### S72-A. **트랙 A R2 V1 후속** (P0/P1 — 다른 터미널 적용 결과 확인 + 마무리)

세션 71 종료 시점 다른 터미널이 ADR-032 ACCEPTED + V1 옵션 A 적용 완료. git status 미커밋 영역:
```
M  package.json (+ package-lock.json) — @aws-sdk/client-s3 + s3-request-presigner 추가
M  prisma/schema.prisma — File.storageType 컬럼
?? prisma/migrations/20260501100000_add_file_storage_type/
?? src/app/api/v1/filebox/files/r2-{presigned,confirm}/route.ts
?? src/lib/r2.ts
```

S72 시작 시:
1. 다른 터미널 진행 결과 확인 (commit 됐는지 / 미커밋 상태인지) — `git log --oneline -5` + `git status`
2. 미커밋이면 통합 commit 또는 별도 commit (영역 분리 OK라 한 commit 도 가능)
3. **다운로드 라우트** (R2 presigned GET URL) 신설 — V1 본체에 미포함이라 보강 PR
4. UI 50MB 분기 + 진행률 (`src/app/(protected)/filebox/page.tsx`) — 미적용일 가능성 (확인 필요)
5. E2E 테스트 (50MB local / 1GB R2) — 미적용일 가능성
6. 30일 R2 사용량 모니터링 시작 + $5/월 알람 설정

### S72-B. **S71-B 매뉴얼 docx 시각 검증 추가 패치** (P2, ~30분, 사용자 비교 피드백 필요)

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
