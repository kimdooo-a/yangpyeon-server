# 다음 세션 프롬프트 (세션 87)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 85 종료 — 양 chunk 동시 진행: 메인 wave 평가 + 보조 시크릿 회수 + git history purge)

세션 85 = 두 터미널 동시 진행 + 영역 분리 (wave 평가 vs 보안 사건 대응) → 머지 충돌 0 운용. **메인 chunk** = 다른 터미널 wave 진척도 종합 평가 (S58~S84 27 세션 누적, A-(87/100), Track A 95% / B 100%코드+81%TDD / C 70% / D stabilized). **보조 chunk** = GitGuardian 시크릿 평문 회수 + filter-repo history purge.

- **세션 85 보조 chunk 핵심** (commit `a4e1ef9` → filter-repo로 `5c56676` SHA rewrite, force pushed): GitGuardian 알람으로 admin 비밀번호 + Postgres superuser 비밀번호 평문 **21파일 31위치** 노출 (이전 분석 5파일 한정 → grep 6배 확대). 1) **노출 매트릭스**: scripts/ 10건 + src/lib/password.test.ts 1건 + docs/ 14건. 두 변형 동시 (`Knp13579!yan` 운영 + `Knp13579yan` postgres). 2) **1순위 코드 정리**: scripts/ env-only 강제 패턴 (`${VAR:?msg}`, fallback default 제거), `.spec.ts` 명시적 throw, password.test.ts 운영-fixture 분리 (`"test-password-fixture-only"`), docs/ placeholder (`<ADMIN_PASSWORD>` / `<DB_PASSWORD>`). 3) **memory 룰 신설** `feedback_no_secret_defaults_in_scripts.md` (재발 방지 게이트). 4) **사용자 회전 거부** ("회전은 안할꺼야. 2순위 진행해") → 2순위 직행. 5) **filter-repo 안전망 3중**: pip 설치 + 백업 브랜치 + working tree stash 3건 + `--force-with-lease`. 6) **filter-repo 실행**: 300 commits rewrite 4.31초, origin 자동 제거 후 수동 복구. HEAD = `3ae830f fix(cron): runNow에 recordResult` — 다른 터미널 cron/runNow circuit-breaker P2 fix 자연 합류 (보너스). 7) **force push**: main `847dbe3`→`fd29ca7`, spec/aggregator-fixes `9957798`→`3ae830f`. 8) **백업 브랜치 즉시 삭제** (사용자 명시적 요청, GitHub reflog 90일 잔존 → 안전).

- **세션 85 메인 chunk 핵심** (다른 터미널, `260504-session85-wave-completion-eval.md` handover): kdywavecompletion 스킬 + 3 병렬 Explore 에이전트로 4-Track 매트릭스 평가. **Track A 100% 완료** (잔여 = prod TimeZone=UTC 의사결정 1건) / **Track B 100% 코드 + 81% TDD** (170 약속 → 139 실측, llm/promote/runner 32 case 미달, PR 게이트 룰 #4 미적용 영역) / **Track C 70% 실측** (60% 주장 보수적, M4 UI Phase 1 진입 + Phase 2~6 + M5 + M6 ~15작업일 잔여) / **Track D stabilized** (S78~S81 multipart + standalone proxy 정착). 다음 단일 가장 큰 가치 = Track C M4 UI Phase 2~6 + M5 + M6.

- **검증 통합**: 시크릿 grep 0건 (전체 history `--all -p`) / `git push --force-with-lease` 양 브랜치 success / stash pop 2건 (anthropic RSS 복원 ✓ + cron/registry no-op = `3ae830f` 흡수 정상). **WSL 배포 = 보류** (S85에서 미수행 — 메인 chunk wave 평가는 코드 변경 없음, 보조 chunk는 git 작업만). S86에서 배포 처리 (cleanup 모듈 + M4 Phase 1 + cron/runNow P2 fix 동시 활성화).

- **CK 신규**: `2026-05-04-secret-recovery-fallback-default-pattern.md` — fallback default = git history 영구 노출 매개체 패턴. memory `feedback_no_secret_defaults_in_scripts.md` 자매.

---

## ⭐ 세션 87 첫 작업 우선순위 (세션 86 메인 후속 chunk 종료 시점, 2026-05-04)

세션 86 메인 후속 chunk 결과: S85 P0 prod 배포 + 라이브 발견 P2 fix + S83 이월 + S82/S83 의사결정 **4건 동시 처리 완료**. commits `d438303→3ae830f`(P2 fix, force push 후 SHA 변환) + `ce50988`(anthropic-news Olshansk). prod 라이브 검증 1 cron 실행으로 P2 fix + TimeZone fix 동시 측정 (cf 1→0, last_success_at NULL→22:42:57, last_run_at = wall clock 일치). 세션 86 우선순위 표 (line 79+ § "세션 86 첫 작업 우선순위") 의 S86-DEPLOY/S84-A/S86-RSS/S86-CRON-P2 모두 완료.

| # | 작업 | 우선 | 소요 | 차단 사항 / 상태 |
|---|------|------|------|----------|
| **S87-CRON-VERIFY** | **23:00/23:30/03:00 KST 자연 cron tick 후 stored value 정확화 검증** | **P0** | 각 ~5분 (3 회) | TimeZone=UTC 자연 path 검증. rss-fetch 23:00 → classify+promote 23:30 → cleanup 03:00. 신규 stored value `last_run_at` 가 wall clock 과 일치하는지 확인 + cf=0 / state=CLOSED 유지. dedupe Fix B 8 source fetch 정합 (sources=8 fetched=N inserted/duplicates 분포). |
| **S86-PUSH** | **origin push 1 commit (`ce50988`)** | **P1 사용자** | 즉시 | spec/aggregator-fixes 1 commit ahead. 사용자 push 명령 대기. |
| **S87-ENV-CLEANUP** | **`.env.bak-*` 3개 정리 + `.gitignore` 패턴 검토** | P2 운영자 | 5분 | windows + build + ypserver 3 백업 (.env.bak-20260504-223541 등). 안전 보존 후 삭제 + `.gitignore` 에 `.env.bak-*` 패턴 추가 검토. |
| **S87-RSS-ACTIVATE** | **anthropic-news active=false → true** (+ 4 feed 확장 결정) | P2 운영자 | 30분 | DB url 갱신 완료 (Olshansk/rss-feeds GitHub Actions hourly scrape). 운영자 결정 = (a) news 1 feed 만 활성화 (b) 4 feed 모두 (engineering/research/red 추가 source) (c) 라이선스 검토 후 결정. |
| **S87-CK-WSL** | **Compound Knowledge 산출 — WSL2 SIGHUP 함정 + tsx .env 미로드** | P2 | 30분 | `docs/solutions/2026-05-04-wsl2-background-sighup-trap.md` — `setsid + nohup + disown` 으로도 wsl 외부 호출 시 child SIGHUP. 단일 foreground wsl 호출 패턴 표준화. tsx 가 .env 자동 로드 안 함 — PowerShell `$env:DATABASE_URL = ...` 우회 패턴. |
| **S87-TZ-MONITOR** | **24h TimeZone=UTC 모니터링 마일스톤** | P2 | 03:00 KST cleanup tick 후 5분 + 24h 후 5분 | active session 강제 만료 영향 (본인 운영자만 = 자기만 재로그인) 관찰. UI 시각 비일관 24~48h. M3 SSE / 메신저 / 운영 콘솔 정상 동작 확인. |
| ~~S86-DEPLOY~~ | ~~WSL 빌드+배포 cleanup + M4 Phase 1 + cron/runNow P2 fix~~ | — | — | ✅ **세션 86 메인 후속 완료** (PM2 ypserver pid 670992→688860, ↺22→24, ELF Linux x86-64 verified). |
| ~~S84-A~~ | ~~prod DATABASE_URL `?options=-c TimeZone=UTC` 적용~~ | — | — | ✅ **세션 86 메인 후속 완료** (3계층 .env 동기화 + PM2 restart `--update-env` 자동 활성화 + prod 검증 wall=stored=display 일치). |
| ~~S86-RSS~~ | ~~anthropic-news RSS feed URL working tree commit~~ | — | — | ✅ **세션 86 메인 후속 완료** (commit `ce50988`, 8 후보 404 검증 + Olshansk/rss-feeds 채택, 205 items RSS 2.0 verified). |
| ~~S86-CRON-P2~~ | ~~runNow recordResult 누락 P2 fix~~ | — | — | ✅ **세션 86 메인 후속 완료** (commit `3ae830f` after force push, TDD 6/6, cron 19/19 회귀 0, prod 라이브 cf 1→0 + last_success_at 갱신 검증). |
| **S85-F2** | **M4 UI Phase 2** — Composer 인터랙티브 + SSE wiring + User name lookup | **P0 messenger** | 5-6 작업일 | (S85+86에서 미진입) textarea autosize + Enter 송신 + clientGeneratedId UUIDv7 + 낙관적 업데이트 + 답장 인용 카드 + 멘션 popover cmdk + use-sse 로 conv/user 채널 구독 → 캐시 invalidate + DIRECT peer name 표시. backend 17 라우트 활용. |
| **S86-SEC-1** | **GitHub repo public/private 확인** | **P0 운영자** | 30초 | (S86 미수행) github.com/kimdooo-a/yangpyeon-server → Settings 확인. **public 이면 Archive Program/scraper 캐시 회수 불가** — 비밀번호 회전 권고 강화. |
| **S86-SEC-2** | **pre-commit hook gitleaks 도입** | P1 보안 | ~30분 | (S86 미수행) `pip install detect-secrets` 또는 `npm i -D @gitleaks/gitleaks` + husky 또는 `.git/hooks/pre-commit`. memory `feedback_no_secret_defaults_in_scripts` 게이트의 자동화 보강. |
| **S84-C** | **24h+ 관찰 후 sources 14 확장** (9 → 14) | P1 | ~30분 | S83 신규 5 소스 cron 자연 fire 안정성 확인 후 추가 5 활성. (S87-CRON-VERIFY 결과로 24h 관찰 충족) |
| **S85-INFRA-1** | **SWR + jsdom + @testing-library/react 도입** | P2 인프라 | ~3h | M4 Phase 1 의 `useState + useEffect + fetch` 패턴 → SWR 표준화. vitest config 분기 (server lib = node, ui = jsdom). 컴포넌트 렌더 자체 테스트 가능. |
| S85-WAVE-1 | Track B TDD 81% → 100% (llm/promote/runner 32 case) | P1 | ~4h | 메인 chunk wave 평가 §최대 발견 갭 — non-BYPASSRLS 라이브 테스트 미적용 영역. |
| S84-E | M3 SSE browser publish/subscribe e2e | P1 | ~30분 | 운영자 본인 (auth cookie + 실 conversation). 또는 M4 Phase 2 진입 시 자연 검증. |
| S84-G | M5 첨부 + 답장 + 멘션 + 검색 | P1 messenger | 3-4 작업일 | M4 Phase 2 후속. |
| S84-H | M6 알림 + 차단/신고 + 운영자 패널 + 보안 리뷰 | P1 messenger | 3-4 작업일 | M5 후속. |
| ~~S84-I~~ | ~~totp.test.ts AES-GCM tamper flake fix~~ | — | — | ✅ **이미 commit `66689e9` 으로 fix됨**, 회귀 0 확인 후 close. |
| S84-J | Phase 2 plugin (`packages/tenant-almanac/`) | P2 | ~5h | M3 게이트 통과 후. |
| S84-K | Windows port 3000 leftover node.exe (pid 6608) 정리 | P3 | 5분 | ypserver 무관 dev 잔재. |
| S84-L | Almanac Vercel `ALMANAC_TENANT_KEY` env + redeploy | P0 운영자 | 5분 | almanac-flame.vercel.app /explore 가시화. |

### S87 진입 시 첫 행동

1. `git status --short` + `git log --oneline -5` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (세션 86 1 commit ahead `ce50988` 가 사용자 push 후 자연 합류)
3. **S87-CRON-VERIFY P0 우선** — 자연 cron tick 시각 (23:00/23:30/03:00 KST) 도래 시 즉시 측정. 측정 SQL: `PGPASSWORD=<...> psql -h localhost -U postgres -d luckystyle4u -t -A -c "SELECT name||' | last_run='||to_char(last_run_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI')||' | cf='||consecutive_failures FROM cron_jobs WHERE name LIKE 'almanac-%' ORDER BY name"`. 적용 후 신규 stored value 가 wall clock 정확 일치하는지 확인.
4. 배포 검증 후 → S85-F2 (M4 UI Phase 2) 진입 또는 S87-CK-WSL Compound Knowledge 산출.

### 영구 룰 (세션 86 정착)

**WSL 빌드 = 단일 foreground wsl 호출** — `setsid + nohup + disown` 으로도 다음 wsl 외부 호출 시 child process SIGHUP (WSL2 HCS 추정). 빌드 같은 long-running task 는 `wsl -d Ubuntu -- bash -lc "bash /mnt/e/.../wsl-build-deploy.sh 2>&1 | tail -80"` 형태로 단일 호출 + Bash tool timeout 600s 내 완료. 본 패턴 메모리 등록 후보.

**WSL DB 호출 = PGPASSWORD direct + 명시적 -h/-U** — `sudo -u postgres psql` 은 password prompt 로 hang. `PGPASSWORD=<...> psql -h localhost -U postgres -d luckystyle4u` 패턴 통일. 테이블명 정정 (`source` → `content_sources`, `tenant` → `tenants`, `audit_log` → `audit_logs`).

**tsx CLI script 실행 시 .env auto-load 안 함** — DATABASE_URL 미설정 에러. PowerShell `$env:DATABASE_URL = (Get-Content .env | Select-String '^DATABASE_URL=').ToString() -replace '^DATABASE_URL="?', '' -replace '"$', ''` 패턴 또는 `dotenv-cli` 도입.

---

## ⭐ 세션 86 첫 작업 우선순위 (세션 85 종료 시점, 2026-05-04)

| # | 작업 | 우선 | 소요 | 차단 사항 / 상태 |
|---|------|------|------|----------|
| ~~S85-DEPLOY~~ | ~~WSL 빌드+배포 cleanup + M4 Phase 1~~ | — | — | ⏸️ S85에서 미수행 (양 chunk 모두 코드 commit 0) → S86 첫 작업으로 이월 |
| **S86-DEPLOY** | **WSL 빌드+배포** (cleanup 모듈 + M4 Phase 1 + cron/runNow P2 fix 동시 활성화) | **P0** | **~10분** | spec/aggregator-fixes 최신 = `3ae830f`. 단일 `wsl-build-deploy.sh` 실행으로 cleanup module + M4 Phase 1 + cron/runNow P2 fix 동시 활성화. b8-check.ts 로 cleanup cron 정상 + `/messenger` 라우트 응답 확인 + cf=0/last_ok_kst != NULL 회귀 검증. |
| **S86-SEC-1** | **GitHub repo public/private 확인** | **P0 운영자** | 30초 | github.com/kimdooo-a/yangpyeon-server → Settings 확인. **public 이면 Archive Program/scraper 캐시 회수 불가** — 비밀번호 회전 권고 강화. private 이면 추가 조치 불필요. |
| **S86-SEC-2** | **pre-commit hook gitleaks 도입** | P1 보안 | ~30분 | `pip install detect-secrets` 또는 `npm i -D @gitleaks/gitleaks` + husky 또는 `.git/hooks/pre-commit`. memory `feedback_no_secret_defaults_in_scripts` 게이트의 자동화 보강. 재발 방지. |
| **S85-F2** | **M4 UI Phase 2** — Composer 인터랙티브 + SSE wiring + User name lookup | **P0 messenger** | **5-6 작업일 chunk** | (S85에서 미진입, 동일) textarea autosize + Enter 송신 + clientGeneratedId UUIDv7 + 낙관적 업데이트 + 답장 인용 카드 + 멘션 popover cmdk + use-sse 로 conv/user 채널 구독 → 캐시 invalidate + DIRECT peer name 표시. backend 17 라우트 활용. |
| **S84-A** | **prod DATABASE_URL `?options=-c TimeZone=UTC` 적용** | **P1 (사용자 의사결정)** | **~10분 + 24h 모니터** | audit §4.1 권고. 트래픽 저점 (KST 03:00~05:00). 영향 = 재로그인 1회. 데이터 손실 0. |
| **S84-C** | **24h+ 관찰 후 sources 14 확장** (9 → 14) | P1 | ~30분 | S83 신규 5 소스 cron 자연 fire 안정성 확인 후 추가 5 활성. |
| **S85-INFRA-1** | **SWR + jsdom + @testing-library/react 도입** | P2 인프라 | ~3h | M4 Phase 1 의 `useState + useEffect + fetch` 패턴 → SWR 표준화. vitest config 분기 (server lib = node, ui = jsdom). 컴포넌트 렌더 자체 테스트 가능. |
| S85-WAVE-1 | Track B TDD 81% → 100% (llm/promote/runner 32 case) | P1 | ~4h | 메인 chunk wave 평가 §최대 발견 갭 — non-BYPASSRLS 라이브 테스트 미적용 영역. |
| S84-E | M3 SSE browser publish/subscribe e2e | P1 | ~30분 | 운영자 본인 (auth cookie + 실 conversation). 또는 M4 Phase 2 진입 시 자연 검증. |
| S84-G | M5 첨부 + 답장 + 멘션 + 검색 | P1 messenger | 3-4 작업일 | M4 Phase 2 후속. |
| S84-H | M6 알림 + 차단/신고 + 운영자 패널 + 보안 리뷰 | P1 messenger | 3-4 작업일 | M5 후속. |
| S84-I | totp.test.ts AES-GCM tamper flake fix | P2 | ~30분 | (이미 commit `66689e9` 으로 fix됨, 회귀 0 확인 후 close) |
| S84-J | Phase 2 plugin (`packages/tenant-almanac/`) | P2 | ~5h | M3 게이트 통과 후. |
| S84-K | Windows port 3000 leftover node.exe (pid 6608) 정리 | P3 | 5분 | ypserver 무관 dev 잔재. |
| S84-L | Almanac Vercel `ALMANAC_TENANT_KEY` env + redeploy | P0 운영자 | 5분 | almanac-flame.vercel.app /explore 가시화. |
| **S86-RSS** | anthropic-news RSS feed URL working tree commit | P2 | 5분 | 다른 터미널 WIP `prisma/seeds/almanac-aggregator-sources.sql` (Olshansk/rss-feeds GitHub Actions third-party scrape) — working tree 잔존. 검토 후 commit 또는 폐기. |

### S86 진입 시 첫 행동

1. `git status --short` + `git log --oneline -5` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (보조 chunk force push로 새 SHA — fetch 시 fast-forward이 아닌 reset 필요할 수 있음, **세션 85 보조 chunk가 force push 했음에 주의**)
3. **S86-DEPLOY 실행** (P0 우선): `wsl -d Ubuntu -- bash -lic 'bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/wsl-build-deploy.sh'` — cleanup module + M4 Phase 1 + cron/runNow P2 fix 동시 활성화.
4. **S86-SEC-1** (운영자): GitHub repo visibility 확인 → public이면 비밀번호 회전 결정 재검토.
5. 배포 검증 후 → S85-F2 (M4 UI Phase 2 chunk 진입) 또는 S84-A timezone fix 사용자 확인.

### 영구 룰 (세션 85 정착)

**fallback default = secret committed** — bash `${VAR:-default}` 또는 TS `??` 의 default가 시크릿이면 git history 영구 노출. memory `feedback_no_secret_defaults_in_scripts.md` 게이트. 다음 세션의 Claude가 검증 스크립트 작성 시 즉시 발화 차단.

**force push 후 working tree 동기화 주의** — 세션 85 보조 chunk가 main + spec/aggregator-fixes 양 브랜치를 force push 했음. 다른 워크트리에서 작업 시 `git fetch && git reset --hard origin/<branch>` 또는 `git pull --rebase` 로 새 SHA 동기화 필요. **그 전에 working tree 변경분 stash 보호 필수**.

---

## (세션 84 종료 시점 컨텍스트 — 참고용 보존)

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 84 종료 — 양 터미널 동시 진행: 메인 wave 평가 + S84-D Fix A/B + cleanup cron 부채 해소 + 다른 터미널 M4 UI Phase 1)

세션 84 = 두 터미널 동시 진행 + 영역 분리 (backend/docs vs frontend) → 머지 충돌 0 운용. 5 commits push 완료 (`da39576` `0bcc283` `f4bdf8f` `f8caa26` 메인 + `f3bf611` 다른 터미널). prod 배포는 운영자 또는 다음 세션 (다른 터미널 WIP transient 가 일시 차단했으나 commit 후 해소됨).

- **세션 84 메인 핵심** (4 commits): 1) **wave 진척도 종합 평가** — 4-Track 매트릭스 (A ~95% / B 100% / C 60% / D stabilized) + S81 5x 압축 통계 + S82 4 latent bug 분석. 2) **외부 plan 영속화** — `~/.claude/plans/wave-wiggly-axolotl.md` → git tracked `docs/research/baas-foundation/04-architecture-wave/wave-tracker.md`. 3) **CLAUDE.md PR 리뷰 게이트 룰 5 항목 정착** — RLS / withTenant / tenantPrismaFor closure / **non-BYPASSRLS 라이브 테스트** / timezone-sensitive 비교. 4) **S84-D dedupe Fix A** (TDD 26): WHERE tenantId 명시 (defense-in-depth, BYPASSRLS 회피). 5) **S84-D Fix B 데이터 마이그레이션** (직접 SQL, 사전 0 충돌 → UPDATE 130 default→almanac → 사후 cross-tenant FK 0). 6) **cleanup cron 부채 해소** (TDD 6) — `almanac-cleanup` SQL kind readonly 풀 한계 → AGGREGATOR module=cleanup 신설. DB row UPDATE + b8-runnow 라이브 SUCCESS 23ms deleted=0. 7) **다른 터미널 위임 프롬프트 작성** (M4 UI Phase 1 frontend chunk).

- **세션 84 다른 터미널 핵심** (1 commit): M4 UI 보드 Phase 1 — 사이드바 "커뮤니케이션" 그룹 4 항목 + 시각 분류 헬퍼 2종 (TDD 8) + 컴포넌트 4종 (ConversationListItem/ConversationList/MessageBubble/MessageList) + 데이터 fetch hook 2종 (useConversations/useMessages, SWR 미설치 → 순수 fetch) + 라우트 2종 ((protected)/messenger + [id]). 위임 프롬프트 vs 실제 환경 갭 4건 적응 (페이지 위치 / SWR 미설치 / @testing-library 미설치 / lucide-react 정상). 검증 tsc 0 + vitest 547 + production build PASS.

- **검증 통합**: tsc 0 / vitest 547 pass + 91 skip (회귀 0, 신규 14 = 메인 7 + 다른 터미널 8) / 메인 4 commits + 다른 터미널 1 commit 모두 push 완료. **WSL 배포 = 보류** (다른 터미널 WIP 시점 transient 가 차단했으나 그들 commit 후 해소됨, 다음 세션 또는 운영자 본인 1회 배포로 cleanup 모듈 + M4 Phase 1 동시 활성화).

- **S82 부채 패턴 영구 차단 메커니즘 정착**: PR 리뷰 게이트 룰 5 항목 (특히 #4 non-BYPASSRLS 라이브 테스트) 가 S82 의 4 latent bug 와 S84-D 의 130 default-tenant 행 같은 prod-BYPASSRLS-가려진-RLS-bug 패턴을 머지 게이트 단계에서 차단. dedupe.ts case 26 (`expect(callArgs.where.tenantId).toBe(...)`) 가 그 unit test 모범.

---

## ⭐ 세션 85 첫 작업 우선순위 (세션 84 종료 시점, 2026-05-03)

| # | 작업 | 우선 | 소요 | 차단 사항 / 상태 |
|---|------|------|------|----------|
| ~~S84-D dedupe~~ | ~~Fix A 코드 + Fix B 데이터~~ | — | — | ✅ **세션 84 메인 완료** (`da39576` Fix A + 직접 SQL Fix B, cross-tenant FK 0) |
| ~~cleanup cron~~ | ~~AGGREGATOR module=cleanup~~ | — | — | ✅ **세션 84 메인 완료** (`f4bdf8f`, b8-runnow 라이브 SUCCESS) |
| ~~S84-F1 M4 UI Phase 1~~ | ~~사이드바 + 라우트 + 컴포넌트 4 + hooks 2~~ | — | — | ✅ **세션 84 다른 터미널 완료** (`f3bf611`) |
| **S85-DEPLOY** | **WSL 빌드+배포 (cleanup 모듈 prod 활성화 + M4 Phase 1 라이브)** | **P0** | **~10분** | 다른 터미널 commit `f3bf611` + 메인 4 commits 모두 push 완료. 단일 `wsl-build-deploy.sh` 실행으로 5 commits 동시 활성화. cleanup 모듈 다음 03:00 KST 자연 fire 시 SUCCESS deleted=0 자동. M4 라우트 (/messenger + /messenger/[id]) prod 가시화. |
| **S85-F2** | **M4 UI Phase 2** — Composer 인터랙티브 + SSE wiring + User name lookup | **P0 messenger** | **5-6 작업일 chunk** | textarea autosize + Enter 송신 + clientGeneratedId UUIDv7 + 낙관적 업데이트 + 답장 인용 카드 + 멘션 popover cmdk + use-sse 로 conv/user 채널 구독 → 캐시 invalidate + DIRECT peer name 표시. backend 17 라우트 활용. |
| **S84-A** | **prod DATABASE_URL `?options=-c TimeZone=UTC` 적용** | **P1 (사용자 의사결정)** | **~10분 + 24h 모니터** | audit §4.1 권고. 트래픽 저점 (KST 03:00~05:00). 영향 = 재로그인 1회. 데이터 손실 0. |
| **S84-C** | **24h+ 관찰 후 sources 14 확장** (9 → 14) | P1 | ~30분 | S83 신규 5 소스 cron 자연 fire 안정성 확인 후 추가 5 활성. |
| **S85-INFRA-1** | **SWR + jsdom + @testing-library/react 도입** | P2 인프라 | ~3h | M4 Phase 1 의 `useState + useEffect + fetch` 패턴 → SWR 표준화. vitest config 분기 (server lib = node, ui = jsdom). 컴포넌트 렌더 자체 테스트 가능. |
| S84-E | M3 SSE browser publish/subscribe e2e | P1 | ~30분 | 운영자 본인 (auth cookie + 실 conversation). 또는 M4 Phase 2 진입 시 자연 검증. |
| S84-G | M5 첨부 + 답장 + 멘션 + 검색 | P1 messenger | 3-4 작업일 | M4 Phase 2 후속. AttachmentPicker (filebox 통합) + cmdk 멘션 popover + 검색 페이지 (PG GIN trgm index). |
| S84-H | M6 알림 + 차단/신고 + 운영자 패널 + 보안 리뷰 | P1 messenger | 3-4 작업일 | M5 후속. in-app 알림 종 + NotificationPreference + BlockUserDialog + admin/messenger/{moderation,health,quota}. kdysharpedge 보안 리뷰. |
| S84-I | totp.test.ts AES-GCM tamper flake fix | P2 | ~30분 | base64 last-char flip → middle byte flip 결정적 변조. |
| S84-J | Phase 2 plugin (`packages/tenant-almanac/`) | P2 | ~5h | M3 게이트 통과 후. ADR-022 §1 Phase 2 트리거 (DAU 임계 도달 또는 두번째 컨슈머 등록). |
| S84-K | Windows port 3000 leftover node.exe (pid 6608) 정리 | P3 | 5분 | ypserver 무관 dev 잔재. |
| S84-L | Almanac Vercel `ALMANAC_TENANT_KEY` env + redeploy | P0 운영자 | 5분 | almanac-flame.vercel.app /explore 가시화. 운영자 본인. |

### S85 진입 시 첫 행동

1. `git status --short` + `git log --oneline -5` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes`
3. **S85-DEPLOY 실행** (P0 우선): `wsl -d Ubuntu -- bash -lic 'bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/wsl-build-deploy.sh'` — 5 commits 동시 활성화. PM2 ypserver restart 확인 + `b8-check.ts` 로 cleanup cron 정상 + `/messenger` 라우트 응답 확인.
4. 배포 검증 후 → S85-F2 (M4 UI Phase 2 chunk 진입) 또는 S84-A timezone fix 사용자 확인.

### 영구 룰 (세션 84 정착)

**PR 리뷰 게이트 룰 5 항목** — CLAUDE.md §"PR 리뷰 게이트 룰 (S82 4 latent bug 재발 차단)" 정착. 모든 backend PR 본문에 5 항목 필수 명시. wave-tracker.md 가 영구 진척도 추적 (세션 종료마다 row 갱신).

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 83 종료 — S82 follow-up 6 task 일괄: timezone audit P1 + 60 sources 확장 + multipart cron + SSE 라이브)

- **세션 83 핵심 (코드 commit 0, 신규 untracked 2 + WSL 빌드+재배포 1회)** — S82 종료 시 5 follow-up 인계 + 사용자가 P1 격상한 PrismaPg timezone audit 합 6 task 모두 완료. 모두 운영 액션 + 새 정책 산출 영역 (코드 변경 X).
  1. **24h 관찰 + PrismaPg shift prod 발현 empirical 재확인**: cron 정상 (classify 11:00 KST 자연 tick = DB 02:00:31+09 표시). runNow 10:55 wall → DB last_run_at = `01:57:23+09` (정확히 -9h). cron 자체는 matchesSchedule = JS Date 기반이라 영향 0.
  2. **60 sources 점진 확장**: 5 신규 활성 (github-blog/huggingface-blog/stripe-blog/kakao-tech/techcrunch-ai). 9 RSS active (anthropic-news 비활). runNow 검증 sources=8 fetched=130 errors=0. 단 inserted=0 duplicates=130 — 신규 소스가 기존 60 canonical URL 중첩 의심 (별도 진단).
  3. **anthropic-news 비활성화**: RSS endpoint anthropic.com 측 제거 4 path 모두 404 확인. SQL UPDATE active=FALSE + notes 갱신.
  4. **S78-H multipart cleanup cron**: `scripts/seaweedfs-clean-multipart.sh` (weed shell 호출 + 로그) + WSL `~/scripts/` 설치 + crontab `0 4 * * 0 ...` (매주 일요일 04:00 KST). 수동 1회 실행 PASS.
  5. **M3 SSE 라이브 e2e**: events route (S81 commit `069705c`) 가 마지막 deploy 이후 추가됨 → 미배포 발견. WSL 빌드+재배포 1회 (PM2 ypserver pid 226263 → 252403, ↺=21, ELF Linux x86-64). 재배포 후 401 응답 확인 (events route 정상 빌드+withTenant guard). publish/subscribe 풀 e2e = browser auth 필요 (별도). 부수: Windows port 3000 leftover node.exe (pid 6608, ypserver 무관) 발견.
  6. **[P1] PrismaPg timezone audit** (`docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md`): 12 코드 위치 분류 — ✅ Prisma round-trip cancel (edit/recall window/today-top/search/circuit-breaker/MFA challenge) / ✅ DB-side calc only (rate-limit-db S40 마이그레이션 후, cleanup-scheduler) / ⚠️ raw SQL workaround 인지 (sessions tokens.ts `expires_at <= NOW()` -9h 시프트로 7일 → 6일 15시간, 사용자 미체감 / MFA service.ts ::text 캐스트) / ✅ 외부 timestamp 파싱 (RSS publishedAt). prod 데이터 손실 0, 사용자 체감 거의 0. 신규 코드 유입 위험 실재 (S82 통합 test 가 그 case). **권고 = `?options=-c TimeZone=UTC` prod DATABASE_URL 적용** (트래픽 저점, 적용 직후 active session 1회 재로그인 외 영향 미미) — **사용자 의사결정 대기**.
  7. **검증**: tsc 0 / WSL 빌드+배포 PASS / `/events` 401 응답 / weed shell 수동 PASS / runNow 10792ms PASS.
  8. **본 세션 교훈**: S82 의 5 follow-up 인계 + 사용자 P1 추가 격상 1건 = 6 task 단일 세션 압축. 코드 commit 0 (모두 운영 액션 + 분석 산출). PrismaPg shift 영구 fix 가 P1 우선순위로 부상.

- **세션 82 핵심 (3 commits `152562d` + `8bef896` + `5449f9e`, +625 LOC, 17 파일)** — S81 6 후보 중 진행 가능 3 작업 동시 압축. M3 user 채널 4 이벤트 wiring + M2 통합 32 케이스 라이브 활성화 (이때 Prisma extension + AbuseReport @map + Asia/Seoul timezone + 세션 67/80 fixture/test 4 latent bug 동시 노출/fix) + M3 SSE wire format 자동 검증.

- **세션 82 핵심 (3 commits `152562d` + `8bef896` + `5449f9e`, +625 LOC, 17 파일)** — S81 6 후보 중 진행 가능 3 작업 동시 압축. M3 user 채널 4 이벤트 wiring + M2 통합 32 케이스 라이브 활성화 (이때 Prisma extension + AbuseReport @map + Asia/Seoul timezone + 세션 67/80 fixture/test 4 latent bug 동시 노출/fix) + M3 SSE wire format 자동 검증.
  1. **M3 user 채널** (`152562d`, +292 LOC, 6 파일): mention/dm/report/block 4 이벤트. sendMessage 반환 확장 (conversationKind + otherMemberId, helper 가 이미 query 중) → 라우트가 추가 DB query 0 으로 publish 결정. buildSnippet 80자 컷 (TEXT 한정). **block.created 가 blocker 본인 채널** (cross-device sync, stalker risk 차단). 4 PRD payload 계약 + cross-tenant 격리 5 신규 테스트 + sendMessage DIRECT/GROUP 분기 2 env-gated.
  2. **M2 라이브 + 4 latent bug fix** (`8bef896`, +180 LOC, 8 파일): WSL postgres `luckystyle4u_test` 신규 DB (38 tables + 30 RLS policies + role GRANTs, schema-only clone) 첫 실행 67 fail/25 pass 에서 4 함정 동시 노출:
     - **(A.3) Prisma extension `query(args)` escape — 가장 큰 발견**: `tenantPrismaFor`/`prismaWithTenant` 의 `$transaction` 안에서 `tx.$executeRawUnsafe('SET LOCAL app.tenant_id')` 적용 후 `query(args)` 호출 시 query 가 우리 tx connection 을 사용하지 않고 base client 의 새 conn 으로 escape → SET LOCAL 무효 → RLS always-fail (0 rows). **prod 가 BYPASSRLS postgres 사용해서 가려져 있던 latent bug**. 비-bypass role(`app_test_runtime`)로 테스트하는 첫 시도에서 노출. 수정: `tx[modelCamel][operation](args)` 직접 호출 + raw operation 은 args array spread 로 tx 에 binding (양 함수 동일 적용).
     - **(A.4) PrismaPg + Asia/Seoul timezone +9hr 시프트**: WSL postgres session timezone = Asia/Seoul. PrismaPg adapter 가 TIMESTAMPTZ 의 +09 offset 을 ignore 하고 local 시각을 UTC 로 mis-parse → 9시간 시프트. prod read/write 양방향 동시 시프트로 cancel 되어 보이지 않으나 admin pool (raw pg) + Prisma 혼용 시 노출. 회피: `?options=-c TimeZone=UTC`. **prod 영향 가시화 follow-up 별도 필요** (rate-limit/edit/recall/session 비교 audit).
     - **(A.2) AbuseReport.targetKind @map 누락**: schema 가 `targetKind` (camelCase, no @map), DB 가 `target_kind` (snake_case). prod 미운영 라우트라 latent. session 80 Track C M2 추가 시 누락된 채 머지된 흔적.
     - **(A.1) 세션 67/80 fixture/test 5건**: tenant_memberships ON CONSTRAINT 명 미실재 (INDEX 형태) / files-folders cascade cleanup 누락 / message_receipts.lastReadAt 미실재 / notification_preferences.id+created_at 미실재 (composite PK) / DUPLICATE_REPORT regex vs Korean message — 모두 라이브 테스트 한 번도 안 돌아서 통과한 채로 머지된 흔적.
     - **인프라 영구 정착**: `scripts/setup-test-db-role.sh` (app_test_runtime password 발급) + `scripts/run-integration-tests.sh` (bash 러너, WSL→Win cross-OS env 손실 노트 포함) + `.env.test.example` (env 템플릿). 메신저 92/92 PASS.
  3. **M3 SSE wire format** (`5449f9e`, +153 LOC, 3 파일): events/route.ts 의 인라인 SSE 형식을 `encodeSseEvent(event, payload)` + `encodeSseComment(text)` 헬퍼로 추출. 7 신규 테스트 (wire format 4 + ReadableStream+TextEncoder 통합 1 + multiple subscribers 1 + 한글·이모지 unescape 1). 브라우저 EventSource 라이브 검증 자동화 대체.
  4. **M4 = UI 보드** (PRD 확인): 사용자 message 의 "M4 push notification (web push subscribe)" 는 mis-naming. 실제 PRD 의 messenger Phase 1 M4 = UI 보드 (대화목록 + 채팅창 + composer, 5-7 작업일). web push (Service Worker / VAPID) 자체 Phase 1 미포함 (M6 가 in-app SSE only). 진입 안 함.
  5. **검증**: tsc 0 / vitest 532 pass + 91 skip (베이스라인 525/89 → +7 sse wire-format) / live 92/92 / 5-run 4 깔끔 + 1 totp.test.ts AES-GCM tamper 플레이크 (pre-existing, base64 padding 한정 flip).
  6. **본 세션 교훈**: 라이브 테스트 첫 시도가 4 latent bug 동시 노출. prod = BYPASSRLS = RLS 검증 회피 + 양방향 timezone 시프트 cancel = bug 가려짐 = 머지 통과. 라이브 검증 부재 시 회귀 누적의 전형. 인프라 정착 후 향후 모든 messenger 도메인 변경 회귀 자동 차단.

---

## ⭐ 세션 84 첫 작업 우선순위 (세션 83 종료 시점, 2026-05-02)

| # | 작업 | 우선 | 소요 | 차단 사항 / 상태 |
|---|------|------|------|----------|
| ~~S83-A timezone audit~~ | ~~12 위치 분류 + 영향 분석 + 권고~~ | — | — | ✅ **세션 83 완료** (`docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md`). 사용자 의사결정 대기. |
| ~~S83-B 60 sources 5 확장~~ | ~~github/huggingface/stripe/kakao/techcrunch~~ | — | — | ✅ **세션 83 완료** (9 RSS active, runNow PASS) |
| ~~S83-H anthropic-news 비활~~ | ~~RSS endpoint 404 확인 후 active=FALSE~~ | — | — | ✅ **세션 83 완료** (대체 endpoint 탐색은 별도) |
| ~~S78-H multipart cron~~ | ~~scripts/seaweedfs-clean-multipart.sh + crontab~~ | — | — | ✅ **세션 83 완료** (매주 일요일 04:00 KST) |
| ~~M3 SSE 빌드+재배포~~ | ~~events route 라이브 진입~~ | — | — | ✅ **세션 83 완료** (PM2 ypserver pid 252403, ↺=21) |
| **S84-A** | **prod DATABASE_URL `?options=-c TimeZone=UTC` 적용** | **P1 (사용자 의사결정)** | **~10분 + 24h 모니터** | audit §4.1 권고. 트래픽 저점 (KST 03:00~05:00). 절차: `~/ypserver/.env` 수정 → `pm2 restart ypserver` → smoke test (로그인+메시지+cron lastRunAt) → 24h 후 active session count 모니터. 영향: 적용 직후 active sessions 다수 expired 처리 → 사용자 재로그인 1회. 데이터 손실 0. |
| **S84-B** | **untracked 2 파일 commit + push** | **P0 정합화** | **5분** | `docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md` + `scripts/seaweedfs-clean-multipart.sh` — git status 확인 후 단일 commit. |
| **S84-C** | **24h+ 관찰 후 추가 5 sources 확장** (9 → 14) | **P0** | ~30분 | S83 신규 5 소스의 cron 자연 fire 안정성 (consecutiveFailures<3) 확인 후. 안정 시 추가 5 활성. anthropic-news 는 대체 endpoint 발견 시 재활성. |
| **S84-D** | **inserted=0 dedupe 진단** | **P1** | ~1h | runNow 의 inserted=0 duplicates=130 원인 — canonical URL 중첩 (예상) vs dedupe 너무 적극 구분. promote.ts + dedupe.ts 의 dedup key 추적 + 표본 ContentItem 수동 비교. 너무 적극이면 정책 완화 PR. |
| S84-E | **M3 SSE browser publish/subscribe e2e** | P1 | ~30분 | 운영자 본인 (auth cookie + 실 conversation). 또는 다음 M4 UI 진입 시 자연 검증. |
| ~~S84-F1 Phase 1~~ | ~~사이드바 그룹 + ConversationList/Item + MessageBubble/List + hooks 2 + 라우트 2 + TDD 8~~ | — | — | ✅ **세션 84 다른 터미널 완료** (`docs/handover/260503-session84-m4-ui-phase1.md`). 13 파일, tsc 0 / vitest 547 / build PASS. |
| S84-F | **M4 UI 보드 진입** (대화목록 + 채팅창 + composer) | P0 messenger | 5-7 작업일 | 별도 세션 chunk. wireframes.md §1 + PRD §9. /messenger 라우트 + 사이드바 "커뮤니케이션" 그룹. SWR + SSE 통합 hook (useConversation/useMessages). axe-core 통합. ✅ Phase 1 = S84-F1 완료. **잔여 = Phase 2~5 (S85-F2 부터)**. |
| **S85-F2** | **M4 UI Phase 2** — Composer 인터랙티브 (textarea autosize + Enter 송신 + clientGeneratedId UUIDv7 + 낙관적 업데이트 + 답장 인용 카드 + 멘션 popover cmdk) + SSE wiring (use-sse 로 conv/user 채널 구독 → 캐시 invalidate) + User name lookup (DIRECT peer name) | **P0 messenger** | **5-6 작업일** | S84-F1 산출물 위에 진입. composer placeholder 활성화 + SSE realtime + peer 이름 표시. backend 17 라우트 중 POST /messages + PATCH /messages/:id (편집) + DELETE /messages/:id (회수) + POST /typing + POST /receipts 활용. 분기 cycle: M2 Phase 3 = 정보 패널 + 검색 / M3 Phase 4 = 컨슈머 generic UI + Almanac 마이그레이션. |
| **S85-INFRA-1** | **SWR 도입 + jsdom + @testing-library/react** — 컴포넌트 렌더 테스트 인프라 정착 | P2 인프라 | ~3h | S85-F2 진입 직전 또는 동시. SWR 표준화 (Phase 1 의 `useState + useEffect + fetch` 대체) + vitest config 분기 (server lib = node, ui = jsdom) + Phase 1 의 시각 분류 헬퍼 외에 컴포넌트 렌더 자체 테스트. |
| S84-G | **M5 첨부 + 답장 + 멘션 + 검색** | P1 messenger | 3-4 작업일 | M4 후속. AttachmentPicker (filebox 통합) + cmdk 멘션 popover + 검색 페이지 (PG GIN trgm index). |
| S84-H | **M6 알림 + 차단/신고 + 운영자 패널 + 보안 리뷰** | P1 messenger | 3-4 작업일 | M5 후속. in-app 알림 종 + NotificationPreference 페이지 + BlockUserDialog + ReportMessageDialog + admin/messenger/{moderation,health,quota}. kdysharpedge 보안 리뷰. |
| S84-I | totp.test.ts AES-GCM tamper 플레이크 fix | P2 | ~30분 | base64 last-char flip → decoded buffer middle byte flip 으로 변경. 결정적 변조 보장. |
| S84-J | Phase 2 plugin 마이그레이션 (`packages/tenant-almanac/`) | P2 | ~5h | M3 게이트 통과 후. ADR-022 §1 Phase 2 트리거. |
| S84-K | Windows port 3000 leftover node.exe (pid 6608) 정리 | P3 | 5분 | ypserver 무관 dev 잔재. Windows curl localhost:3000 라우팅 정상화 목적. |
| S84-L | Almanac Vercel `ALMANAC_TENANT_KEY` env + redeploy | P0 운영자 | 5분 | almanac-flame.vercel.app /explore 가시화. S69 `srv_almanac_*` 키 발급 완료. 운영자 본인 작업. |

### 영구 룰 (S82 후속 추가, commit `04e441b`)

**PM2 운영 서버 임의 종료 절대 금지** — `CLAUDE.md` §"PM2 운영 서버 — 임의 종료 절대 금지 규칙" + `memory/feedback_pm2_servers_no_stop.md`. "모든 서버 종료" / "전부 다 내려" 같은 광범위 표현은 **세션 기동분 한정** (dev 서버, vitest worker 등). PM2 운영 4개 (ypserver/cloudflared/seaweedfs/pm2-logrotate) 는 명시적 지시 ("PM2 운영 서버 종료" / "ypserver 정지" / "pm2 stop all") 시에만 정지. 정지 전 영향 범위 1줄 보고 + 확인 필수.

### S84 진입 시 첫 행동

1. `git status` + `git log --oneline -5` (memory `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (필요 시)
3. **untracked 2 파일 정리** (S84-B): `docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md` + `scripts/seaweedfs-clean-multipart.sh` — 단일 commit + push
4. **timezone fix 적용 결정** (S84-A): 사용자 확인 후 트래픽 저점 적용 또는 보류
5. **24h+ 관찰 후 60 sources 추가 확장** (S84-C, 9 → 14): cron `last_status` + ContentItem count + Gemini 한도 + consecutiveFailures<3 확인 후
6. **inserted=0 dedupe 진단** (S84-D): runNow 의 130/130 dup 원인 분석
7. M4 UI 진입 (S84-F, 별도 세션 chunk, 5-7일)

### 새로 정착한 인프라 (사용 패턴)

**메신저 통합 테스트 라이브 실행**:
```powershell
# PowerShell (현재 권장 — WSL→Win cross-OS env 손실 회피)
$env:RLS_TEST_DATABASE_URL='postgresql://app_test_runtime:<pwd>@localhost:5432/luckystyle4u_test?options=-c%20TimeZone%3DUTC'
$env:RLS_TEST_ADMIN_DATABASE_URL='postgresql://postgres:<pwd>@localhost:5432/luckystyle4u_test'
$env:DATABASE_URL=$env:RLS_TEST_DATABASE_URL
npx vitest run --no-file-parallelism tests/messenger/
```
또는 WSL Linux Node 설치 시 `bash scripts/run-integration-tests.sh tests/messenger/`.

**`.env.test.local`** (gitignored, S82 셋업 완료):
- `RLS_TEST_RUNTIME_PASSWORD` = app_test_runtime password
- `RLS_TEST_ADMIN_PASSWORD` = postgres superuser password (prod 와 동일)

**테스트 DB 재생성** (필요 시):
```bash
wsl -- psql -U postgres -c "DROP DATABASE IF EXISTS luckystyle4u_test; CREATE DATABASE luckystyle4u_test;"
wsl -- pg_dump -U postgres --schema-only --no-owner luckystyle4u | wsl -- psql -U postgres -d luckystyle4u_test
wsl -- bash scripts/setup-test-db-role.sh
```

### Phase 2 plugin 트리거 (DAU/요구 도달 시)

- `packages/tenant-almanac/` 신규 (현재 코드 = 단일 인스턴스 컨슈머)
- ADR-022 §1 Phase 2 트리거 도달 시 — Almanac DAU 임계 또는 다른 컨슈머 추가 시
- 단일 인스턴스 → multi-instance 분리 = Redis pubsub 도입 (M3 SSE bus.ts) + worker pool 격리 (cron registry) + tenant manifest packages 분리

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 81 종료 — wave 5 세션 매핑 단일 압축)

- **세션 81 핵심 (B7+B8 라이브 + Track C M2 23 라우트 + M3 SSE + M2 통합테스트 32, 3 commits `ffdd2dd` + `72b5ebd` + `069705c`, +3,164 LOC, 26 파일)** — 사용자 단일 요청 "B7,b8 + C 전체" 수렴, wave-wiggly-axolotl 의 5 세션 매핑(80~84) 단일 세션 압축.
  1. **B7 시드+배포** (`ffdd2dd`, +477 LOC, 5 파일): scripts/seed-aggregator-cron.ts (Prisma.InputJsonValue 캐스트 1차 tsc 정정) + b8-list/activate/check/runnow 4 보조. WSL 직접 적용 → 6 row CREATE (enabled=FALSE). WSL 빌드+배포 pid 220187 ↺=19. ELF Linux x86-64 검증.
  2. **B8 5 소스 활성화 + runNow 라이브 검증**: 60 sources 인벤토리 → 5 선정 (anthropic-news/openai-blog/vercel-blog/toss-tech/hn-algolia-front). 6 cron enabled=TRUE + circuit reset. **runNow 강제 실행** (24h cron tick 압축, 결정적 회귀 검증의 의미적 동등): rss-fetch SUCCESS 13s → classify SUCCESS 237ms → promote SUCCESS 303ms → **items=50 첫 production Almanac 카드 라이브** (4개월 P0 본진 완주).
  3. **§3 격리 첫 production 실증**: anthropic-news 404 (외부 RSS URL 변경) → consecutiveFailures=1, 다른 4 소스 fetch 차단 0. ADR-022 §3 "한 컨슈머 실패 격리" 첫 production 검증.
  4. **B3 한글 boundary fix 라이브 통과**: toss-tech (RSS ko) 한글 콘텐츠가 fetch+classify+promote 전 경로 통과 — spec port-time bug (regex `\b` ASCII-only) 가 production 차단되지 않음 증명.
  5. **Track C M2 23 ops** (`72b5ebd`, +1,360 LOC, 17 파일): 4 그룹 (C1 conversations 5 ops / C2 messages 5 / C3 members+typing+receipts 5 / C4 safety+admin 8). 공용 `route-utils.ts` (MessengerError → HTTP status 매핑 20 코드 + emitMessengerAudit). 패턴 단일 (가드+Zod parse+helper 호출+audit+errorMapping). 헬퍼/스키마/타입 사전 완비 (S67/68) → 라우트 layer 만 신규. 17 라우트 unauth ping 모두 401. WSL 재배포 pid 226263 ↺=20.
  6. **M3 SSE 채널 + M2 통합 테스트 32 케이스** (`069705c`, +1,332 LOC, 4 신규 + 5 갱신, 다른 터미널): src/lib/messenger/sse.ts (`convChannelKey(tenantId, conversationId)` + `userChannelKey` + publishConvEvent/publishUserEvent try-catch fail-soft, tenant-namespaced 채널) + `conversations/[id]/events/route.ts` (115 LOC, withTenant + 멤버 검증 + 25s keepalive + abort cleanup) + tests/messenger/m2-integration.test.ts (969 LOC, 32 case env-gated `it.skipIf`) + tests/messenger/sse.test.ts (134 LOC, 8 case no-DB). 5 producer 라우트 wiring (message.{created,updated,deleted} / member.{joined,left} / typing.started / receipt.updated) = 8/13 conv 이벤트.
  7. **brittle test 회피**: vi.spyOn 모듈 namespace mock 의 ESM live binding flake 1회 발견 → listener-throw 패턴으로 교체 + 5-run 안정성 확인.
  8. **검증** (전체 누적): tsc 0 / vitest 520 pass + 89 skip (베이스라인 509/60 대비 +11 pass +29 skip, 회귀 0) / WSL 빌드+배포 2회 PASS / ELF Linux x86-64.
  9. **본 세션 교훈**: wave-wiggly-axolotl 5 세션 매핑 단일 압축은 (a) 헬퍼/스키마 사전 완비 + (b) 단일 패턴 + (c) cron 라이브 검증을 runNow 로 압축의 3 조건 충족 시 가능. 4개월 P0 본진 + Track C 라우트 layer + M3 실시간 인프라 + 통합 테스트 머지 게이트를 단일 세션 안에 도달.

---

## (세션 81 종료 시점 표 — 참고용 보존, S82 에서 모두 진행됨)

(세션 82 진행 결과는 위 §"세션 83 첫 작업 우선순위" 참조)

## ⭐ 세션 82 첫 작업 우선순위 (세션 81 종료 시점, 2026-05-02)

| # | 작업 | 우선 | 소요 | 차단 사항 / 상태 |
|---|------|------|------|----------|
| ~~B7~~ | ~~scripts/seed-aggregator-cron.ts + 6 jobs + WSL 빌드+배포~~ | — | — | ✅ **세션 81 완료** (`ffdd2dd`) |
| ~~B8~~ | ~~5 소스 활성화 + runNow 라이브 검증~~ | — | — | ✅ **세션 81 완료** (runNow 압축, 첫 50개 카드 라이브) |
| ~~Track C M2~~ | ~~23 ops 19 routes 4 그룹~~ | — | — | ✅ **세션 81 완료** (`72b5ebd`) |
| ~~M3 SSE conv 8 이벤트~~ | ~~publishConvEvent 5 라우트 wiring~~ | — | — | ✅ **세션 81 완료** (`069705c`, 다른 터미널) |
| ~~M2 통합 테스트 32~~ | ~~env-gated `it.skipIf` 패턴~~ | — | — | ✅ **세션 81 완료** (RLS_TEST_DATABASE_URL export 시 자동 활성) |
| **S82-A** | **24h cron 자연 윈도우 관찰** + ContentItem count + Gemini 한도 + 60 source 점진 확장 (5씩) | **P0 본진 안정화** | **~1h (관찰) + 30분 (확장)** | cron schedule 자연 tick 대기. 안정성 확인 (consecutiveFailures<3) 후 5 소스씩 추가. anthropic-news 는 RSS URL 갱신 후 또는 비활성 유지. |
| **S82-B** | **M3 SSE 라이브 e2e** (브라우저 EventSource 또는 curl SSE 클라이언트) | **P0 Track C** | **~2h** | 본 세션 = unit test only. 라이브 = 클라이언트가 실제 typing/message publish 수신 검증. publish 가 fan-out 정확한지. |
| S82-C | **M3 user 채널 5 이벤트** (mention/dm/report/block/push) wiring | P1 | ~3h | publishUserEvent 라우팅 (sender→recipient userIds 추출 후 fan-out). mentions 차단 사용자 필터링 후 살아남은 mentions 만 publish. M4 push notification 통합 별도. |
| S82-D | **RLS_TEST_DATABASE_URL 셋업** → M2 통합 테스트 32 활성화 | P1 | ~3h | WSL postgres test DB + 모든 마이그레이션 + RLS roles + admin role 패스워드. ops 부담 vs 머지 게이트 가치 trade-off. |
| S82-E | **Almanac Vercel ALMANAC_TENANT_KEY env + redeploy** | P0 운영자 | 5분 | almanac-flame.vercel.app /explore 가시화. S69 `srv_almanac_*` 키 발급 완료. 운영자 본인 작업. |
| S82-F | anthropic-news RSS URL 갱신 (외부 사실 확인) | P2 | 5분 | 사이트 RSS 경로 변경 — 신규 URL 확인 후 source.endpoint 갱신. 또는 다른 anthropic 콘텐츠 소스 (X/Twitter, 블로그) 추가. |
| S78-H | multipart cleanup cron 등록 (`s3.clean.uploads -timeAgo=24h`) | P1 | ~30분 | 미진행 부채. 어느 세션이든. |
| S78-D | 폰 모바일 드래그 실측 (c7f1c39 PointerEvent) | P1 | 5분 | 보너스. |
| S78-I | filer leveldb 전환 | P2 | 30분 | 50만 entry 도달 시만. |

### S82 진입 시 첫 행동

1. `git status` + `git log --oneline -5` 점검 (`feedback_concurrent_terminal_overlap` 룰)
2. `git pull origin spec/aggregator-fixes` (필요 시)
3. **24h 관찰** — `psql` 로 `ContentItem` count + `cron_jobs.last_status` + `content_sources.consecutiveFailures` 확인
4. 안정성 확인 시 → S82-A 60 소스 점진 확장
5. 또는 → S82-B M3 SSE 라이브 e2e (병행 가능)

### Phase 2 plugin 트리거 (DAU/요구 도달 시)

- `packages/tenant-almanac/` 신규 (현재 코드 = 단일 인스턴스 컨슈머)
- ADR-022 §1 Phase 2 트리거 도달 시 — Almanac DAU 임계 또는 다른 컨슈머 추가 시
- 단일 인스턴스 → multi-instance 분리 = Redis pubsub 도입 (M3 SSE bus.ts) + worker pool 격리 (cron registry) + tenant manifest packages 분리

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 80 종료 — 3차 정합화: B4+B5+B6 추가)

- **세션 80 최종 (Track B Aggregator 본진 P0 완주 — B-pre+B1+B2+B3+B4+B5+B6, 10 commits +6,112 LOC)**:
  1. **본진 spec 6 모듈 multi-tenant 적응 완료**: types (95) + dedupe (158) + classify (308) + fetchers/{index,rss,html,api} (725) + llm (213) + promote (134) + runner (273) = **약 1,906 LOC 이식**.
  2. **spec port-time bug 4건 누적 차단** (TDD RED phase 매번 표면화):
     - B2: spec dedupe.ts `URLSearchParams.keys()` multi-value duplication
     - B3: spec classify.ts `\b` ASCII-only boundary (한글 매처 비기능)
     - B4: spec fetchers/api.ts ArXiv link regex `rel="alternate"` 위치 의존
     - B5: spec promote.ts slugify NFKD 가 한글 음절 (가-힣) 을 jamo (U+1100~) 로 분해
     - **메타**: spec 동결판은 single-environment + happy-path tested. CK 통합 1건 신규.
  3. **B6 kind union 확장 4 파일 동시 단일 commit**: `SQL|FUNCTION|WEBHOOK` → `+AGGREGATOR`. supabase-clone.ts CronKindPayload + cron/registry.ts ScheduledJob.kind + cron/runner.ts dispatchCron + API route z.enum 2개 동시.
  4. **multi-tenant 패턴 일관**: 모든 DB 사용 모듈 (dedupe/promote/runner) 이 `tenantPrismaFor(ctx)` closure 패턴 + ctx 첫 인자.
  5. **vi.mock 호이스팅 분기 룰 발견** (memory 신규): factory 의 mock 직접 참조 → `vi.hoisted` 필수, closure 안 참조 → dedupe 패턴 OK.
  6. **검증** (B6 종료): tsc 0 / 전체 509/569 (60 skip env-gated) / 신규 110 케이스 (25+40+30+27+15) PASS / 회귀 0.
  7. **CK 신규 3건** (multi-value / 한글 boundary / 4-cases 통합) + **memory 신규 1건** (vi.mock 호이스팅 분기).
  8. **세션 81 첫 작업** = **B7 시드 + 배포** (P0 본진 마지막 코드 작업, ~3h).

- **세션 80 1차 핵심 (B-pre + B1 + B2 + B3, 7 commits +2,835 LOC — 위 내용에 흡수)**:
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

## ⭐ 세션 81 첫 작업 우선순위 (세션 80 3차 정합화 후, 2026-05-02)

| # | 작업 | 우선 | 소요 | 차단 사항 / 상태 |
|---|------|------|------|----------|
| ~~B3~~ | ~~classify.ts port~~ | — | — | ✅ **세션 80 완료** (`e74f3ef`) |
| ~~B4~~ | ~~4 fetchers (rss/html/api/firecrawl) port~~ | — | — | ✅ **세션 80 완료** (`100ae5c`) |
| ~~B5~~ | ~~llm.ts + promote.ts port~~ | — | — | ✅ **세션 80 완료** (`58a526a`) |
| ~~B6~~ | ~~runner.ts + cron AGGREGATOR dispatcher~~ | — | — | ✅ **세션 80 완료** (`7c50c9f`) |
| **B7** | **`scripts/seed-aggregator-cron.ts` + cron_jobs 6 row INSERT (enabled=FALSE) + WSL 빌드 + PM2 배포** | **P0 본진 마지막** | **~3h** | **세션 81 첫 작업**. 마이그레이션 0건 (DDL 변경 X), `feedback_migration_apply_directly` 룰 = Claude 직접 시드 실행. cron 6 jobs (rss-fetch / html-scrape / api-poll / classify / promote / cleanup) 모두 enabled=FALSE 로 시작. |
| B8 | 5 소스 점진 활성화 + cron 6 jobs enable + 24h 관찰 + 첫 카드 | P0 본진 | ~2h | content_sources 60 중 5 active=TRUE → 24h 후 60 점진 확장. GEMINI_API_KEY 누락 시 ruleResult only (graceful). |
| **S78-H** | multipart cleanup cron 등록 (`s3.clean.uploads -timeAgo=24h` 주 1회) | P1 | ~30분 | B7 사이클로 묶기 권고 (cron 인프라 동시 작업) |
| S78-D | 폰 모바일 드래그 실측 (c7f1c39 PointerEvent) | P1 | ~5분 | 보너스, 어느 세션이든 |
| S78-I | filer leveldb 전환 | P2 | ~30분 | 50만 entry 도달 시만 (현재 0건) |
| S78-J | PM2 startup 자동화 | P2 | 운영자 결정 | "내 컴퓨터" 정합성 영향 별개 |
| **세션 85** (관찰) | 24h 관찰 SQL — ContentItem count, Gemini 한도, consecutiveFailures, 첫 카드 가시화 | P0 본진 | — | B8 직후 관찰 윈도우 |
| **세션 86~** (Track C) | Messenger M2 19 라우트 (4 그룹 직진) | P0 Track C | — | Track B 완주 후 진입 |

### B7 진입 시 게이트 (필수)

1. **시드 스크립트 위치**: `scripts/seed-aggregator-cron.ts` 신규. 기존 `scripts/issue-tenant-api-key.ts` 패턴 답습 (env 로드 + tenantPrismaFor + 멱등 upsert).
2. **6 cron jobs spec** (모두 `tenantId='almanac'`, `enabled=FALSE`, `kind='AGGREGATOR'`):
   - `almanac-rss-fetch` (every 30m, payload `{module:"rss-fetcher"}`)
   - `almanac-html-scrape` (every 1h, payload `{module:"html-scraper"}`)
   - `almanac-api-poll` (every 1h, payload `{module:"api-poller"}`)
   - `almanac-classify` (every 15m, payload `{module:"classifier", batch:50}`)
   - `almanac-promote` (every 30m, payload `{module:"promoter", batch:50}`)
   - `almanac-cleanup` (daily 04:00, payload TBD — cleanup 정책 명세 필요)
3. **마이그레이션 0건** (DDL 변경 없음 — cron_jobs 테이블은 이미 존재).
4. **배포**: `/ypserver` 스킬로 WSL 빌드 + PM2 재시작 (enabled=FALSE 라 cron 즉시 가동되지 않음 — 안전).
5. **검증**: PM2 status / 6 row 존재 (psql) / cron registry 가 enabled=FALSE 6건 모두 무시 (loadAll 시점 로그 확인) / dispatchCron 의 AGGREGATOR case 가 enable 시 작동할 준비 (B6 commit `7c50c9f` 적용).

### S81 진입 시 첫 행동

1. `git status` + `git log --oneline -5` 점검 (다른 터미널 동시 작업 여부 — 메모리 룰 `feedback_concurrent_terminal_overlap`)
2. `git pull origin spec/aggregator-fixes` (필요 시)
3. `scripts/issue-tenant-api-key.ts` read (시드 스크립트 패턴 참조)
4. `prisma/schema.prisma` 의 `model CronJob` 필드 확인 (tenantId / kind / payload Json / enabled / schedule)
5. B7 commit 진입 — 시드 스크립트 작성 + WSL 실행 (`feedback_migration_apply_directly` 룰 적용 = Claude 직접 실행) + PM2 재시작 + 검증

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
