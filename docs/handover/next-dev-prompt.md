# 다음 세션 프롬프트 (세션 81)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 80 종료, B3 동일 세션 추가)

- **세션 80 핵심 (Track B Aggregator 첫 진입 — B-pre + B1 + B2 + B3, 7 commits +2,835 LOC)**:
  1. **wave 진행도 plan 작성** (Plan mode + 3 Explore 병렬): Track A BaaS Phase 0~4 (~85%) / Track B Aggregator T1~T9 (0%) / Track C Messenger M0~M6 (~30%) / Track D Filebox (stabilized) 4 트랙 시퀀싱 결정. plan 파일 `C:\Users\smart\.claude\plans\wave-wiggly-axolotl.md`. 결론: Track B 우선 (세션 80~84 직진), Track C 병행 86~.
  2. **베이스라인 검증 plan 가정 3건 정정** (메모리 룰 `feedback_baseline_check_before_swarm` 적용):
     - T1.7 audit-metrics tenant 차원 ✅ **이미 구현** (`src/lib/audit-metrics.ts:42` byTenant Map + AuditMetricsTenant 타입 + 6 단위 테스트). 초기 Explore grep 한계로 missed.
     - R1 withTenantTx ✅ **존재** (`src/lib/db/prisma-tenant-client.ts:188`). plan "정의 위치 미확인" 잘못된 정보.
     - R2 슬러그 — "3개 부족" 가설 반증, **DB 시드 37 vs spec 40 정확 매치 단 8개**. DB = source of truth 결정 (T1.6 마이그 `20260427140000_t1_6_aggregator_with_tenant` 의 RLS+dbgenerated+composite unique 활성, spec slug 강행 시 promote.ts FK violation → cron consecutiveFailures 자동 비활성화). 매핑표 `docs/research/baas-foundation/05-aggregator-migration/slug-mapping-db-vs-spec.md` 신규 (440 LOC, T4 진입 게이트).
  3. **s79 leftover 회복** (다른 터미널 동시 push `0647b14` 와 폴더 충돌 0): `journal-2026-05-01.md` (188줄) + `2026-05.md` (55줄) ff05a07 staging 누락분 회복. 2 commits 분리 (`046fce8` + `6a8a9eb`).
  4. **B-pre commit** (`c20d90d`): aggregator T1~T9 plan staging + 슬러그 매핑 분석 (622 LOC). 코드 변경 0 — 모두 문서.
  5. **B1 commit** (`0d9a225`): `npm install rss-parser@3.13.0 cheerio@1.2.0 @google/genai@1.51.0` (plan 의 `^0.X` 가정 정정, 1.51.0 latest, peer 충돌 0). `.env.example` 6 vars + 3곳 .env 동기화 (windows + ypserver-build + ypserver, 메모리 룰 `feedback_env_propagation`). secret 4개 빈 값, defaults 2개 명시값. 656 insertions.
  6. **B2 commit** (`a121289`): types.ts (95) + dedupe.ts (158) + dedupe.test.ts (TDD 25). multi-tenant 적응 = `tenantPrismaFor(ctx)` closure 패턴 (메모리 룰 `project_workspace_singleton_globalthis` 적용 — Prisma 7 ALS propagation 회피). 545 insertions.
  7. **TDD 가 spec dedupe.ts multi-value bug 1건 발견 + fix**: 케이스 12 (`tag=b&tag=a` → expected `?tag=a&tag=b` / 1차 실제 `?tag=a&tag=a&tag=b&tag=b`). 진단 = spec 의 `URLSearchParams.keys()` 가 동일 키 multi-value 를 별도 entry 로 노출 → keepKeys 중복 → getAll() N×N 복제. spec 주석 "중복 키 보호" 와 정반대 동작 = spec 자체 bug. fix = `Array.from(new Set(keepKeys))` unique 화. 2차 25/25 PASS.
  8. **검증**: tsc exit 0 / 전체 397/457 pass (60 skip env-gated DB) / 25 신규 PASS / 회귀 0.
  9. **CK 신규**: `2026-05-02-spec-port-tdd-multivalue-bug.md` — spec port 시 TDD 가 spec 자체 bug 발견 패턴, "Spec 동결판도 source of truth 아님" baked-in. 자매 CK = `2026-05-01-verification-scope-depth-...md` (verification depth) + `2026-05-02-nextjs16-standalone-proxy-body-truncation.md` (infrastructure layer 함정).
  10. **b46918c "/cs 의식"** (다른 터미널, docs only) 후 **동일 세션 B3 추가** (`e74f3ef`, 769 LOC).
  11. **B3 commit** (`e74f3ef`): classify.ts (308 LOC) + classify.test.ts (40 TDD). DB 시드 매핑 41 항목 변경 (drop 14 / 단복수 7 / 의미 7 / 병합 3 / 신규 11). **한글 `\\b` boundary spec bug 2번째 차단**: spec 의 `\\b` 가 ASCII `\\w` 전용이라 가-힣 음절 양쪽 boundary 가 잡히지 않음 → spec 의 모든 한글 키워드 (TRACK_RULES 6+ + 서브카테고리 다수) 가 production 매치 안 되는 silent regression. fix = `compilePattern` 을 lookbehind/lookahead `(?<![\\w가-힣])(?:키워드)(?![\\w가-힣])` 로 교체. 한글 12개 케이스 강제 검증.
  12. **iteration order 결정**: korean-tech 를 infrastructure 보다 앞에 배치 (한글 fix 후 '인프라' 양쪽 노출 시 한국 회사명 우선 채택). test 22 강제 검증.
  13. **검증** (B3): tsc 0 / 40/40 PASS / 전체 437/497 pass (B2 397 + B3 40, 회귀 0).
  14. **CK 신규 2번째**: `2026-05-02-classify-korean-boundary-spec-bug.md` — JS `\\b` ASCII-only 함정 + 한글 boundary 해결책. B2 자매 (동일 세션 두 번째 spec port-time bug).
  15. **세션 81 첫 작업** = **B4 4 fetchers** (P0 다음, ~5h, nock/msw mock 패턴, B3 한글 fix 후속 효과 = fetcher 측 source title/summary 한글 처리도 자동 정상).

---

## ⭐ 세션 81 첫 작업 우선순위 (세션 80 종료 + B3 추가 시점, 2026-05-02)

| # | 작업 | 우선 | 소요 | 차단 사항 |
|---|------|------|------|----------|
| ~~B3~~ | ~~classify.ts port~~ | ✅ **세션 80 추가 완료** (`e74f3ef`) | — | 매핑 41 항목 적용 + 한글 boundary fix |
| **B4** | 4 fetchers (rss/html/api/firecrawl) port + mocked 30 케이스 | **P0 다음** | ~5h | nock/msw mock 패턴, 한글 source title/summary 처리는 B3 fix 로 자동 정상 |
| B5 | llm.ts + promote.ts port + 27 케이스 | P0 다음 | ~4h | GEMINI_API_KEY 운영자 발급 (graceful 가능) |
| **S78-H** | multipart cleanup cron (`s3.clean.uploads -timeAgo=24h` 주 1회) | P1 | ~30분 | B5 와 같은 commit 사이클로 묶기 권고 |
| B6 | runner.ts + cron AGGREGATOR dispatcher (kind union 확장) | P0 다음 | ~6h | `dispatchCron` `kind` literal union 확장 시 caller 시그니처 일괄 수정 — 단일 commit 필수 |
| B7 | seed 6 cron jobs (disabled) + WSL 빌드 + 배포 | P0 다음 | ~3h | enabled=FALSE 시작 |
| B8 | 5 소스 점진 활성화 + 24h 관찰 + 첫 카드 | P0 다음 | ~2h | 60 소스 중 5만, 24h 관찰 후 60 점진 확장 |
| S78-D | 폰 모바일 드래그 실측 (c7f1c39 PointerEvent) | P1 | ~5분 | 보너스, 어느 세션이든 |
| S78-I | filer leveldb 전환 | P2 | ~30분 | 50만 entry 도달 시만 (현재 0건) |
| S78-J | PM2 startup 자동화 | P2 | 운영자 결정 | "내 컴퓨터" 정합성 영향 별개 |

### B4 진입 시 게이트 (필수)

1. **B3 의 한글 boundary fix 패턴 답습**: classify.ts `compilePattern` 의 lookbehind/lookahead `[\\w가-힣]` 통합 word-class. fetcher 들에서 url normalization / title 추출 / summary 추출 시 한글 처리 필요한 곳 동일 패턴 적용.
2. **mock 패턴**: 4 fetcher (rss/html/api/firecrawl) 외부 HTTP 호출 격리 — nock 또는 msw. dedupe.test.ts 의 `vi.mock("@/lib/db/prisma-tenant-client", ...)` 패턴 참고.
3. **TDD ~30 케이스**: fetcher 별 7~8 케이스 (happy path / 빈 응답 / 잘못된 형식 / 인코딩 / 타임아웃 / 한글 title / 동시 호출 / fail-after-N-retry).
4. **TenantContext closure**: 모든 fetcher 가 `tenantPrismaFor(ctx)` 사용 (`project_workspace_singleton_globalthis` 메모리 룰 — Prisma 7 ALS propagation 회피).

### S81 진입 시 첫 행동

1. `git status` + `git log --oneline -5` 점검 (다른 터미널 동시 작업 여부 — 메모리 룰 `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (필요 시)
3. plan 파일 `C:\Users\smart\.claude\plans\wave-wiggly-axolotl.md` 와 plan 본문 `docs/research/baas-foundation/05-aggregator-migration/2026-04-26-plan.md` §6 T5 동시 read
4. spec 4 fetchers (`docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/{rss,html,api,firecrawl}-fetcher.ts`) read
5. B4 commit 진입

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 79 종료)

- **세션 79 핵심 (S78-C 본진 검증 → multipart truncation 회귀 발견 → fix + 재검증)**:
  1. **S78-C 1차 시도 (운영자 71.3MB 업로드, 20:27 KST)** — 실패. PM2 err.log: `Request body exceeded 10MB for /api/v1/filebox/files/upload-multipart/part?...&partNumber={1,2}` 두 건. multipart 4 라우트 (s78 commit `963eba5`) 가 인증 후 진입 자체는 성공했으나 part 가 10MB 로 truncate 되어 SeaweedFS UploadPart 실패.
  2. **회귀 진단** — Next.js 16 standalone router-server proxy 가 모든 request 에 `cloneBodyStream(default 10MB)` attach. middleware/proxy layer 의 `finalize()` 가 truncated PassThrough 로 원본 request body 를 replace → route handler 의 `request.arrayBuffer()` 가 잘린 데이터 수신. 위치: `node_modules/next/dist/server/body-streams.js:73,85` + `next-server.js:1274` (`experimental.proxyClientMaxBodySize` 미설정 시 default 적용).
  3. **fix 적용** (commit `fd4d666`, +6/-0): `next.config.ts` 에 `experimental.proxyClientMaxBodySize: '100mb'` 추가 (route MAX_PART_SIZE 동일값). 신규 권장 setting 이름; deprecated alias `middlewareClientMaxBodySize` (warning 메시지 링크) 는 둘 다 set 시 throw.
  4. **WSL 빌드 + 배포 + PM2 재시작** — pid 210927 → 213048, ELF Linux x86-64, 마이그레이션 0건, 스키마 검증 PASS, 부팅 정상 (20:33:56).
  5. **S78-C 2차 시도 (운영자 동일 71.3MB 재업로드, 20:39 KST)** — **PASS**. DB `files.size = 74,724,323 bytes` (71.265 MB, client 원본 기록), SeaweedFS `yangpyeon-filebox_8.dat = 74,724,808 bytes` (volume header 485B 포함). `original_name = '260117 heath-infer-step01.zip'`, `created_at = 2026-05-01 11:39:23.499+09 (KST 20:39:23)`. multipart 4 라우트 (init→part×2→complete) + ADR-033 X1 server proxy 가 본격 production 트래픽에서 정상 작동.
  6. **새 memory 등록** — `reference_nextjs_proxy_body_limit.md`. Next.js 16 standalone proxyClientMaxBodySize 함정 메커니즘 + 처리 + setting 이름 변천 + 검증 임계.
  7. **검증 패턴 실증** — s77 직후 등록된 `feedback_verification_scope_depth.md` (auth-gate ping ≠ actual flow 검증) 가 정확히 한 세션 만에 실증. 동일 함정 4-step 패턴 (기능 X 추가 → X 자체 정확 → 빌드/번들/런타임 layer 가 silently 변형 → 표면 응답만 검증) 발견됨. 방어책 = "데이터 보존 검증" (응답 status 가 아니라 client byte 가 server 까지 도달했는지 비교).
  8. **세션 80 첫 작업** = S78-H multipart cleanup cron (P1, ~30분, abandoned upload 회수) 또는 S78-E Almanac aggregator 비즈니스 로직 (P0 본진, ~28h) 또는 S78-D 폰 모바일 드래그 실측 (P1 보너스, ~5분) 중 선택.

---

## ⭐ 세션 80 첫 작업 우선순위 (세션 79 종료 시점, 2026-05-01)

| # | 작업 | 우선 | 소요 | 차단 사항 |
|---|------|------|------|----------|
| **S78-E** | Almanac aggregator 비즈니스 로직 (spec 10 모듈 multi-tenant 이식) | **P0 본진** | ~28h | filebox 안정화 후 본격 진행 |
| S78-H | multipart cleanup cron (`s3.clean.uploads -timeAgo=24h` 주 1회) | P1 | ~30분 | abandoned upload 회수, s78 1차 시도 부산물 포함 |
| S78-D | 폰 모바일 드래그 실측 (c7f1c39 PointerEvent) | P1 | ~5분 | 보너스 |
| S78-I | filer leveldb 전환 | P2 | ~30분 | 50만 entry 도달 시만 |
| S78-J | PM2 startup 자동화 | P2 | 운영자 결정 | "내 컴퓨터" 정합성 영향 별개 |
| S78-F | 메신저 M2-Step1 도메인 헬퍼 4개 | P0 Track B | ~ | S78-E 와 병행 가능 |

### S78-C ✅ 완료 — 결정적 회귀 검증 통과

71.3MB 업로드 PASS. multipart upload 의 architectural 계층 (s78 → s79) 모두 검증 완료. 동일 패턴 (폰/태블릿/큰 파일/ZIP/MP4 등) 으로 추가 실측 시 회귀 가능성 매우 낮음.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 77 종료)

- **세션 77 핵심 (비대칭 분할 → 운영자 가치관 충돌 표면화 → 옵션 C SeaweedFS 자가호스팅 전환 결정)**:
  1. **S77-W 배포 통과** (코드 변경 0): `/ypserver` 8단계 / PM2 ypserver pid 190213 → 192531 (restart 14→15) / ELF Linux x86-64 / curl localhost:3000 → HTTP 307×3 / 회귀 ping 7 라우트 (405×6 + 401×1) / 신규 에러 0건. **단 ALS 진짜 회귀 검증은 인증 50MB+ PUT 실측 (S78-C) 에 의존** (저널 [3] 사용자 직접 분석: "11:03~11:12 KST 의 ALS 73건 → 0건 이행은 빌드 전후 결정적이 아닌 traffic 중단 효과 가능").
  2. **S77-B Step 2 R2 청구 알람** (운영자 적용 완료): Cloudflare Notifications UI 가 USD 가 아닌 bytes only 발견 → T1 정수 매핑 `10737418240` (10 GiB, 무료 티어 끝) 채택. 가이드 §2.1 정정 + USD↔bytes 변환표 신규 + 메모리 룰 `reference_r2_alarm_threshold.md` 등록 (T2 50GB = `53687091200` 사전 변환 포함).
  3. **운영자 핵심 질문 → 가치관 충돌 표면화** (저널 [4]): 사용자 "왜 R2 같은 지출 서비스를 쓰게 만들었나? 내 컴퓨터, 돈 안 쓰는 자가 서버." → ADR-032 §"결정자" = 운영자 본인 (s71~72 토큰 직접 발급) 인정 + **결정 시점 가치관 충돌 점검 누락 인정**. 4 옵션 (A 유지 / B 외부 채널 / C SeaweedFS / D 보류) 제시.
  4. **옵션 C 채택** → 새 터미널용 7 PHASE 풀 패키지 프롬프트 작성 (저널 [5]): PHASE 0 S77-A 캔슬 / 1 SP-016 50GB 정량 검증 / 2 SeaweedFS 운영 모드 / 3 R2 → SeaweedFS endpoint 교체 (~10줄, S3 API 호환) / 4 빌드+배포+인증 50MB PUT 실측 / 5 ADR-032 supersede + ADR-033 ACCEPTED + SP-016 ACCEPTED + 가이드/메모리 supersede / 6 운영자 R2 콘솔 정리 / 7 /cs.
  5. **CK 신규**: `docs/solutions/2026-05-01-external-service-adr-value-alignment-gap.md` — 외부 서비스 도입 ADR 결정 시 운영자 가치관 점검 누락 패턴. 향후 ADR-034 부터 §"운영자 가치관 정합성 점검" 6 항목 신설 권장.
  6. **검증**: 코드 변경 0 → tsc/build 영향 X. PM2 ypserver online (pid 192531). 회귀 ping 통과. cloudflared 5D uptime.
  7. **세션 78 첫 작업** = S78-A (옵션 C 새 터미널 결과 통합) 또는 S78-B (본 세션 직접 진행) 또는 S78-C (인증 50MB PUT 실측) 중 선택.

---

## 세션 78~79 추천 작업 (이미 처리)

### ~~S78-C.~~ **인증 50MB+ PUT 실측 (ALS + multipart 결정적 회귀 검증)** ✅ **완료 2026-05-01 세션 79** (commit `fd4d666`)

운영자 본인 71.3MB ZIP 업로드 → 1차 실패 (10MB body truncation) → fix → 2차 PASS. DB files.size 74,724,323 + SeaweedFS yangpyeon-filebox_8.dat 74,724,808. 상세 = 세션 79 §1~7.

---

## 세션 78 추천 작업 (이미 처리)

### ~~S78-A.~~ **옵션 C 새 터미널 결과 통합** ✅ **완료 2026-05-01**

새 터미널 (= 옵션 C 새 conversation, handover [260501-session77-option-c-new-terminal-execution.md](./260501-session77-option-c-new-terminal-execution.md)) PHASE 0~7 모두 완료 + push (origin `19454d4..632d26a`). 5 commits:
- `ee68a07` PHASE 0 §S77-A SUPERSEDED note
- `87de464` PHASE 1 SP-016 ACCEPTED 4/4 임계 PASS + sp016-load-test.py
- `28273a0` PHASE 3 C1 endpoint 교체 (~62/-20)
- `63521d2` PHASE 5 ADR-032 SUPERSEDED + ADR-033 ACCEPTED + 가이드/메모리
- `632d26a` PHASE 7 handover + _index.md

PHASE 6 운영자 R2 콘솔 정리도 운영자 본인이 PHASE 0 시점에 이미 처리 완료 (bucket + API token + 알람 모두 삭제). **잔여 회귀: 100MB+ 파일 PUT 회귀 (S78-G multipart 통합 까지 지속)**.

### ~~S78-B.~~ **옵션 C 본 세션 직접 진행** ❌ **무용** (S78-A 완료로 superseded)

S78-A 새 터미널이 7 PHASE 모두 완료 → 본 세션 직접 진행은 중복 작업.

### ~~S78-G.~~ **multipart upload 통합 PR** ✅ **완료 2026-05-01** (commit `963eba5`, +495/-160)

S78-A 본 세션 자체가 S78-G 의 실행. 단 **계획 단계 가정과 실제 아키텍처 갭 발견**:

- **plan 가정**: SeaweedFS presigned PUT URL 을 browser 가 직접 PUT (R2 패턴 그대로) + multipart presigned 발급
- **실제 발견** (S78-A 진입 시): C1 commit `28273a0` 의 `OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:8333` 가 localhost only + cloudflared S3 ingress 부재 → 브라우저가 presigned PUT URL 에 도달 불가능 → s77 PHASE 4 가 auth-gate ping 만 검증해서 architectural broken 상태가 머지된 것이 표면화
- **선택**: **X1 server proxy** 채택 (browser → tunnel → ypserver SDK PutObject → SeaweedFS localhost). vs X2 cloudflared S3 ingress (DNS + CORS 신규 필요, 가치관 위배). ADR-033 §2.5 결정 근거.

산출:
1. `src/lib/r2.ts` — multipart 4 함수 (`createMultipartUpload` / `uploadPart` / `completeMultipartUpload` / `abortMultipartUpload`) + dead presign 4개 제거 (browser → localhost 도달 불가능)
2. `/api/v1/filebox/files/upload-multipart/{init,part,complete,abort}` 4 라우트 신규 (X1 server proxy)
3. `r2-presigned` / `r2-confirm` 2 라우트 삭제 (architecturally broken)
4. `file-upload-zone.tsx` — `uploadMultipart()` 50MB part + 워커풀 동시 3 슬롯 + part 별 byte 진행률 합산 + 첫 에러 시 abort

검증: tsc 0 / WSL 빌드 + 배포 PASS / 9 라우트 회귀 ping 401 / 신규 ALS 에러 0. **단 인증 50MB+ PUT 실측 = S78-C (운영자 본인) 가 결정적 회귀 검증**.

### ~~S78-H.~~ **multipart cleanup cron** (P1, ~30분, S78-G 후속) — 후속 PR 대기

`s3.clean.uploads -timeAgo=24h` 명령 cron 등록 (주 1회). cron runner kind 확장 또는 별도 스케줄러. abandoned multipart upload 회수.

### S78-I. **filer leveldb 전환** (P2, 50만 entry 도달 시)

운영 누적 시 sqlite default → leveldb 전환. 1회 작업 ~30분. ADR-033 §위험 R4 트리거.

### S78-J. **PM2 startup 자동화** (P2, 운영자 결정)

WSL2 자체 crash 후 수동 `pm2 resurrect` 부담 — `pm2 startup` 적용 시 자동 복원. 운영자 가치관 ("내 컴퓨터" 정합성) 영향 별개 결정.

### ~~S78-K.~~ **CGNAT 여부 즉시 확인** ✅ **완료 2026-05-01** (S78-A 시작 시 5초)

`curl ifconfig.me` → `118.33.222.67` (KT 정상 IPv4 대역, NOT CGNAT 100.64.0.0/10). 운영자 가설 "동적 IP/CGNAT 강제" 반증. 단 §3.5 옵션 (DDNS + 라우터 포트포워딩) 거부 이유 (운영 부담 ↑ + Let's Encrypt 갱신 + 보안) 그대로 유효 → Cloudflare Tunnel 강제 결정 영향 0. ADR-033 §1.3 footnote 추가.

### ~~S78-B (구).~~ **옵션 C 본 세션 직접 진행** (P0 alt, ~3.5h, 새 터미널 미실행 시) — 무용

저널 [5] 의 7 PHASE 를 본 세션이 직접 수행:

| PHASE | 작업 | 소요 |
|---|---|---|
| 0 | S77-A R2_CLEANUP cron 작업 캔슬 통보 | 5분 |
| 1 | SP-016 SeaweedFS 50GB 정량 검증 6종 임계 | ~70분 |
| 2 | SeaweedFS 운영 모드 (filer leveldb + S3 API + PM2) | 10분 |
| 3 | R2 → SeaweedFS endpoint 교체 (~10줄) | 45분 |
| 4 | 빌드+배포+회귀 검증 + 인증 50MB PUT 실측 | 15분 |
| 5 | ADR-032 supersede + ADR-033 ACCEPTED + SP-016 ACCEPTED + 가이드/메모리 supersede | 60분 |
| 6 | 운영자 본인 R2 콘솔 정리 | 5분 |
| 7 | /cs 의식 + push | 10분 |

상세 절차: `docs/handover/260501-session77-r2-questioning-seaweedfs-pivot.md` §"토픽 5: 옵션 C 채택" + 저널 [5].

### ~~S78-C (구).~~ **인증 50MB+ PUT 실측** ✅ **세션 79 완료** (위 §S78-C 참조)

### S78-D. **폰 모바일 드래그 실측** (P1, 보너스, ~5분)

c7f1c39 PointerEvent 마이그레이션 검증. 폰 → /memo → 헤더 드래그 / 본문 편집 / 페이지 스크롤 owner-only 차단.

### S78-E. **Almanac aggregator 비즈니스 로직** (P0 본진, ~28h)

spec 의 10 모듈 multi-tenant adaptation 이식. 위치: `packages/tenant-almanac/aggregator/` (T2.5 plugin) 또는 `src/lib/aggregator/` (M3 게이트 이전 임시).

cron 6종 등록 (rss-fetch / html-scrape / api-poll / classify / promote / cleanup) → 소스 5개 점진 활성화 → 24h 관찰 → 첫 카드.

### S78-F. **메신저 M2-Step1** (P0 Track B, 병행 가능)

`docs/research/messenger/m2-detailed-plan.md` §3 도메인 헬퍼 4개 시그니처 그대로.

---

## ~~세션 77 컨텍스트~~ (S77-A/B/W 흡수)

### ~~S77-A.~~ **24h pending cleanup cron** ❌ **옵션 C 채택으로 SUPERSEDED 2026-05-01**

SeaweedFS 자가호스팅 전환으로 R2_CLEANUP cron 자체가 무용. S78-B PHASE 0 에서 다른 터미널 진행 여부 git log 점검 + 작업 폐기.

### ~~S77-W.~~ **WSL 배포 + ALS 회귀 ping** ✅ **세션 77 완료** (코드 변경 0)

`/ypserver` 8단계 통과 + 회귀 ping 7 라우트 500 0건. 단 인증 50MB+ PUT 실측은 S78-C 로 이월.

### ~~S77-B Step 2.~~ **R2 청구 알람** ✅ **세션 77 완료** (운영자 적용)

운영자가 본인 콘솔에서 적용 완료 (`R2 $5/월 임계 알람`, threshold=`10737418240`, email=smartkdy7@). 옵션 C 채택으로 PHASE 6 에서 삭제 예정.

### ~~S77-B Step 1·3·4.~~ **R2 CORS / 50MB 실측 / 폰 드래그** ❌ **옵션 C 채택으로 SUPERSEDED**

R2 자체 폐기 예정 → CORS 무용. 50MB 실측은 SeaweedFS 환경 PHASE 4 진행. 폰 드래그는 S78-D 로 이월.

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
