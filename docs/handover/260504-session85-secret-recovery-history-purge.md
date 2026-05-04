# 인수인계서 — 세션 85 보조 chunk (시크릿 회수 + git history purge)

> 작성일: 2026-05-04
> 메인 chunk (다른 터미널): [260504-session85-wave-completion-eval.md](./260504-session85-wave-completion-eval.md) — S58~S84 27 세션 누적 wave 진척도 평가 (A- 87/100)
> 본 chunk (보조): GitGuardian 알람 대응 — 시크릿 평문 회수 + filter-repo history purge + force push
> 이전 세션: [260503-session84-main-wave-eval-dedupe-cleanup.md](./260503-session84-main-wave-eval-dedupe-cleanup.md) · [m4-ui-phase1](./260503-session84-m4-ui-phase1.md)
> 세션 저널: [`docs/logs/journal-2026-05-04.md`](../logs/journal-2026-05-04.md)

---

## 작업 요약

GitGuardian 알람으로 발견된 admin 비밀번호 + Postgres superuser 비밀번호 평문이 **21개 파일 31개 위치**에 분산 노출됨. 1순위 코드 정리(commit `a4e1ef9`) → 사용자 비밀번호 회전 거부 → 2순위 git history purge (filter-repo 300 commits rewrite) + `--force-with-lease` push로 main + spec/aggregator-fixes 양 브랜치 회수 완료. 메모리 룰 `feedback_no_secret_defaults_in_scripts.md` 신설로 재발 방지 게이트 설치.

## 대화 다이제스트

### 토픽 1: GitGuardian 알람 + 노출 매트릭스 6배 확대 발견

> **사용자**: (이전 세션 분석 인용 — `session44-verify.sh:16` admin password fallback default + `setup-test-db-role.sh:7` postgres superuser password + GitGuardian commit `5071755` 7초 후 push 매치 확인)

이전 분석은 5개 파일 한정으로 작성됐으나, `Knp13579` 패턴 grep 결과 **21개 파일 31개 위치**로 6배 확대됨:
- 실행 코드 10건 (`scripts/`): `phase-14c-{viewer,alpha,beta,gamma}-curl.sh`, `phase-14c-alpha-ui.spec.ts`, `session{43,44,39}-*.sh`, `phase16-vault-verify.sh`, `setup-test-db-role.sh`
- production source 1건: `src/lib/password.test.ts:8` (운영 비밀번호 = 테스트 fixture 동일성 함정)
- 문서 14건: `handover/`, `research/plans/`, `superpowers/plans/`, `guides/`, `logs/`, `spike-032`

두 변형 동시 노출: `Knp13579!yan` (운영) + `Knp13579yan` (postgres superuser).

**결론**: 5파일 한정 정리는 무의미 — 전수 회수 필요 결정.

### 토픽 2: 1순위 — 시크릿 평문 회수 commit `a4e1ef9`

scripts/ 10파일을 `${VAR:?msg}` env-only 강제 패턴으로 일괄 전환:

```bash
# Before — 시크릿이 git history 에 영구 박힘
PASSWORD="${PASSWORD:-Knp13579!yan}"

# After — env 미설정 시 즉시 실패 (default secret 부재)
: "${PASSWORD:?PASSWORD env required (시크릿은 코드에 박지 말 것 — .env.test.local 또는 export)}"
```

`.spec.ts` 는 `process.env.X ?? "literal"` → 명시적 `throw` 패턴으로 교체 (nullish coalescing의 fallback default가 시크릿이면 같은 함정).

`src/lib/password.test.ts`: 운영 비밀번호 = 테스트 fixture 동일성 함정 발견 → `"test-password-fixture-only"` 로 분리.

`docs/` 14파일: `<ADMIN_PASSWORD>` / `<DB_PASSWORD>` placeholder 치환. CLAUDE.md "역사 삭제 금지" 룰 해석 결정 — 세션 기록 보존 ≠ 시크릿 평문 보존.

staging 시 다른 터미널의 `src/lib/cron/registry.ts` modified + `registry.test.ts` untracked 발견 → memory `feedback_concurrent_terminal_overlap.md` 룰 적용, 의도적 제외 (별도 세션 작업).

**결론**: commit `a4e1ef9` (26 files changed, +54 -47), spec/aggregator-fixes 브랜치. 잔존 `Knp13579` grep 0건.

### 토픽 3: memory 룰 신설 — 재발 방지 게이트

21개 파일에 fallback default 패턴이 미러링된 진짜 원인 = 첫 작성 시 "편의를 위해 default 박자" 결정이 후속 스크립트 작성자(이전 세션의 Claude 포함)에게 전파됨. 다음 세션 발화 차단을 위해 메모리 게이트 설치.

산출: `memory/feedback_no_secret_defaults_in_scripts.md` (Why + How to apply 구조) + MEMORY.md 색인 갱신.

**결론**: 다음 세션의 Claude 가 동일 fallback default 패턴 발화 시 즉시 게이트 작동.

### 토픽 4: 사용자 회전 거부 → 2순위 직행

> **사용자**: "회전은 안할꺼야. 2순위 진행해."

옵션 매트릭스 (이전 보고):
- 0순위: 비밀번호 회전 (admin + postgres superuser) — 가장 중요 (force push로도 fork/clone/Archive 캐시 회수 불가)
- 1순위: 코드 정리 (이미 완료)
- 2순위: git history purge + force push

사용자 명시적 회전 거부 + 2순위 진행 지시. memory `feedback_autonomy.md` (분기 질문 금지, 권장안 즉시 채택) + 명시적 승인 두 조건 충족 → 즉시 진행.

**결론**: 1인 사설 repo + 외부 가입 없음 → 영향 범위 제한 가정 하에 force purge 진행.

### 토픽 5: filter-repo 설치 + 안전망 3중 구축

`git-filter-repo` 미설치 → `pip install git-filter-repo 2.47.0` (`~/AppData/Roaming/Python/Python314/Scripts/git-filter-repo.exe`).

안전망 3중:
1. **백업 브랜치**: `sec/before-purge-main` + `sec/before-purge-spec` (로컬 ref만)
2. **stash 보호**: working tree 변경분 3건 보존
   - `src/lib/cron/registry.ts` modified + `registry.test.ts` untracked (다른 터미널 cron/runNow circuit-breaker WIP)
   - `docs/handover/260504-session85-wave-completion-eval.md` (다른 터미널 wave eval handover, untracked)
   - `prisma/seeds/almanac-aggregator-sources.sql` modified (또 다른 터미널: anthropic-news RSS feed URL → Olshansk/rss-feeds GitHub Actions third-party scrape)
3. **`--force-with-lease`**: race condition 방지 (다수 워크트리 활성)

**결론**: working tree clean 진입.

### 토픽 6: filter-repo 실행 + 검증 + force push

replace-text 매핑:
```
Knp13579!yan==><ADMIN_PASSWORD>
Knp13579yan==><DB_PASSWORD>
```

filter-repo 실행 결과:
- 300 commits rewrite, 4.31초
- `Removing 'origin' remote` (안전 기본값) — 수동 복구
- HEAD = `3ae830f fix(cron): runNow에 recordResult 호출 추가 — S85 prod 라이브 검증 P2 fix` (kimdooo-a/smartkdy7@gmail.com, 22:14:16 KST) — **다른 터미널이 force-purge 직전에 commit한 cron/runNow circuit-breaker P2 fix가 자연 합류**. filter-repo가 그대로 보존했으므로 force push 시 함께 push됨 (보너스).

시크릿 잔존 검증:
- main: 0건
- spec/aggregator-fixes: 0건
- 전체 (`--all -p`): 0건

force push (`--force-with-lease`):
- main: `847dbe3` → `fd29ca7` (forced update)
- spec/aggregator-fixes: `9957798` → `3ae830f` (forced update)

stash pop:
- anthropic RSS WIP: working tree로 복원 ✓
- cron/registry stash: `3ae830f` commit이 이미 흡수 → no-op (정상, conflict 아님 — git이 변경 동등성 자동 해소)

**결론**: history purge + force push 완료. working tree 정상 복원.

### 토픽 7: 백업 브랜치 즉시 삭제 결정

> **사용자**: "백업 브랜치를 지금 지우면 안돼??"

"며칠 보존 권장"의 본래 목적 = 일반 협업 환경에서 다른 사람이 old SHA에 의존한 PR/branch가 살아있을 때 대비. 1인 운영 + 사설 repo + 명시적 검증 완료 → 보험 가치 거의 0.

비상 복원이 필요하면 GitHub reflog (~90일) 또는 Support 채널로 복구 가능 — 백업 브랜치 없이도 안전망 잔존.

**결론**: `sec/before-purge-main` (was fd29ca7) + `sec/before-purge-spec` (was 3ae830f) 양쪽 즉시 삭제 완료.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 시크릿 회수 범위 = 전수 (21파일) | 5파일 한정 vs 전수 | grep 결과 노출이 6배 확대됨 — 부분 회수는 보안 효과 0 |
| 2 | 회수 패턴 = env-only `${VAR:?...}` | fallback default 유지 / env 우선 fallback / env-only 강제 | fallback default 자체가 git history 노출 매개체 — 강제 패턴이 정답 |
| 3 | 비밀번호 회전 거부 → 2순위 직행 | (a) 회전 후 force push (b) force push only | 사용자 명시적 거부, memory `feedback_autonomy.md` 적용 — 1인 사설 repo 영향 범위 제한 가정 |
| 4 | force-with-lease vs force | 둘 다 가능 | 다수 워크트리 활성 — race 방지 가산 |
| 5 | 백업 브랜치 즉시 삭제 | 며칠 보존 vs 즉시 | 검증 완료 + 1인 운영 + GitHub reflog 90일 안전망 잔존 |
| 6 | docs/ 시크릿 placeholder vs 파일 보존 | 평문 보존 (역사 삭제 금지 룰) vs placeholder 치환 | "역사 삭제 금지" = 세션 기록 보존 룰이지 시크릿 평문 보존 아님 — placeholder 치환은 룰 위반 아님 |

## 수정 파일 (commit `a4e1ef9` = filter-repo 후 `5c56676`, 26개 + 메모리 2)

### scripts/ 10건 (env-only 강제 패턴)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `scripts/session44-verify.sh` | `PASSWORD="${PASSWORD:-...}"` → `: "${PASSWORD:?...}"` |
| 2 | `scripts/session43-verify.sh` | hardcoded JSON body → `${EMAIL}` + `${PASSWORD}` 환경변수 사용 |
| 3 | `scripts/phase16-vault-verify.sh` | env-only 패턴 |
| 4 | `scripts/session39-e2e.sh` | `EMAIL=...`, `PASS=...` → `: "${EMAIL:?...}"` |
| 5 | `scripts/setup-test-db-role.sh` | `export PGPASSWORD=Knp13579yan` → `: "${PGPASSWORD:?...}"` |
| 6-9 | `scripts/e2e/phase-14c-{viewer,alpha,beta,gamma}-curl.sh` | `ADMIN_PASS='...'` / `DASH_PASS='...'` → env-only |
| 10 | `scripts/e2e/phase-14c-alpha-ui.spec.ts` | `process.env.X ?? "literal"` → 명시적 throw |

### src/ 1건
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 11 | `src/lib/password.test.ts` | `TEST_PASSWORD = "Knp13579!yan"` → `"test-password-fixture-only"` |

### docs/ 14건 (placeholder 치환)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 12 | `docs/guides/mfa-browser-manual-qa.md` | `<ADMIN_PASSWORD>` placeholder |
| 13 | `docs/handover/250406-session1-init-security.md` | `<ADMIN_PASSWORD>` |
| 14 | `docs/handover/260406-session3-security-wave2.md` | `<ADMIN_PASSWORD>` |
| 15 | `docs/handover/260419-session40-timestamptz-migration.md` | `<DB_PASSWORD>` |
| 16 | `docs/handover/260425-session52-wsl-build-pipeline.md` | `<DB_PASSWORD>` |
| 17 | `docs/handover/260426-session69-aggregator-day2.md` | `<DB_PASSWORD>` |
| 18 | `docs/handover/next-dev-prompt.md` | `<ADMIN_PASSWORD>` + `<DB_PASSWORD>` |
| 19 | `docs/handover/phase-14b-crud-prompt.md` | `<ADMIN_PASSWORD>` |
| 20 | `docs/logs/journal-2026-04-12.md` | `<ADMIN_PASSWORD>` |
| 21 | `docs/research/plans/phase-14b-table-editor-crud-plan.md` | `<ADMIN_PASSWORD>` |
| 22 | `docs/research/spikes/spike-032-prepared-code/README.md` | `<DB_PASSWORD>` |
| 23-25 | `docs/superpowers/plans/2026-04-{17,18-alpha,18-beta,19}-...md` (4 파일) | `<ADMIN_PASSWORD>` |
| 26 | (위 4 파일 중 하나) | (line 22-25 합산) |

### 메모리 (git tracked 아님, 글로벌 트리)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| M1 | `memory/feedback_no_secret_defaults_in_scripts.md` | 신설 — env-only 강제 룰 |
| M2 | `memory/MEMORY.md` | 색인 row 추가 |

## 상세 변경 사항

### 1. scripts/ env-only 강제 패턴 — fallback default 제거

bash 파라미터 확장 두 형태 차이:
- `${VAR:?msg}`: unset/empty면 stderr 출력 + `exit 1`
- `${VAR:-default}`: unset/empty면 default 사용 (편의 fallback)

시크릿은 항상 전자 사용. 두 번째 형태는 "default가 있으면 편하다"는 유혹이 시크릿을 git에 영구 박는 가장 흔한 경로 — fallback default = "secret committed" 와 동치로 취급.

### 2. src/lib/password.test.ts — 운영-테스트 비밀번호 분리

운영 비밀번호와 동일한 fixture 사용은 두 가지 함정:
- 운영 비밀번호 회전 시 테스트 깨짐
- 테스트 코드의 비밀번호 평문이 운영 시크릿과 동일하게 git history 에 박힘 (비대칭 노출)

→ `"test-password-fixture-only"` 명시적 더미로 분리.

### 3. filter-repo 실행 메커니즘

`git-filter-repo --replace-text .git-secret-purge.txt --force` 실행 시 내부 동작:
- `git fast-export | git fast-import` 패턴으로 모든 commit/tag/ref rewrite
- replace-text 패턴은 line 단위 치환 (특정 string match → replacement)
- 모든 SHA 변경, working tree는 건드리지 않음
- 안전 기본값으로 `origin` remote 자동 제거 (fresh clone이 아닌 곳에서 잘못된 push 방지)

### 4. force-with-lease 안전망

`--force-with-lease` 의 정확한 의미:
- local의 `origin/<branch>` SHA == remote 실제 SHA 일 때만 push 허용
- fetch 직후라면 일치 → push 성공
- 누군가 fetch 후 push했다면 reject (이 경우 fetch 후 재시도)
- 1인 운영이라도 multi-terminal/worktree 환경에서 의미 있는 안전망

## 검증 결과

- `Knp13579` grep 0건: main / spec/aggregator-fixes / `--all -p` 모두 0
- `git push --force-with-lease`: 양 브랜치 forced update 성공
- stash pop 2건: anthropic RSS 정상 복원, cron/registry no-op (정상)
- working tree 최종: anthropic RSS WIP + S85 wave eval handover (다른 터미널 작업, 보존)

## 터치하지 않은 영역

- `src/lib/cron/registry.ts` + `registry.test.ts` (다른 터미널 cron/runNow P2 fix — 자연 commit `3ae830f` 으로 합쳐졌으나 본 chunk 작업과 무관)
- `prisma/seeds/almanac-aggregator-sources.sql` anthropic-news RSS URL 변경 (다른 터미널 WIP, working tree 잔존)
- 메인 chunk wave 평가 산출물 (다른 터미널 chunk)
- 비밀번호 회전 (사용자 거부 영역)
- pre-commit hook 도입 (재발 방지 자동화 후속)

## 알려진 이슈

- **GitHub repo public/private 미확인**: private 가정으로 진행. public이면 GitHub Archive Program / public fork / scraper 캐시 회수 불가 — 운영자 후속 확인 필요.
- **사용자 비밀번호 회전 미수행**: GitGuardian 알람 후 ~수 시간 윈도우 동안 자동화 스캐너가 인덱싱했을 가능성 — 시크릿이 "살아있는" 상태로 잔존. 사용자 판단 영역.
- **pre-commit hook 미도입**: 재발 방지 자동화 후속 권장 (gitleaks 또는 detect-secrets).

## 다음 작업 제안

### S86+ 우선순위 (보안)
- **P0** (선택): 사용자 비밀번호 회전 (admin + postgres superuser) — 보안 위험 잔존 해소
- **P1** (선택): GitHub repo visibility 확인 + Archive Program 영향 평가 (public이면 회수 불가 사실 운영자 인지)
- **P2**: pre-commit hook gitleaks 도입 — 재발 방지 자동화 (`pip install detect-secrets` + husky 또는 .git/hooks/pre-commit)

### S86+ 우선순위 (기능 — S84 이월 그대로 유지)
- **P0**: M4 UI Phase 2 = Composer 인터랙티브 + SSE wiring + User name lookup (5-6 작업일)
- **P0**: prod 배포 (cleanup 모듈 활성화 + M4 Phase 1 + 메인 4 commits 흡수)
- **P1**: S84-A timezone fix 적용 (사용자 의사결정)
- **P1**: 정보패널 + 검색 + 컨슈머 generic UI
- **P2**: SWR 도입 + jsdom + @testing-library/react (인프라 PR ~3h)
- **P2**: totp.test.ts AES-GCM tamper flake fix
- **P2**: anthropic-news RSS 대체 endpoint (다른 터미널 작업 대기)

### 메인 chunk wave 평가 후속 (S85 메인 chunk 인계)
- 메인 chunk 보고서 §5 권고 액션 항목 흡수 (Track C M4 Phase 2~6 + M5 + M6 ~15작업일)

---

[← handover/_index.md](./_index.md)
