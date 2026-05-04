# 인수인계서 — 세션 86 (메인 터미널 — P2 cron runNow recordResult + anthropic-news Olshansk + TimeZone=UTC + prod 배포 검증)

> 작성일: 2026-05-04
> 같은 날 선행 chunks (다른 터미널):
>   - [260504-session85-wave-completion-eval.md](./260504-session85-wave-completion-eval.md) — 메인 wave 평가 (S58~S84 누적 A- 87/100)
>   - [260504-session85-secret-recovery-history-purge.md](./260504-session85-secret-recovery-history-purge.md) — 보조 (시크릿 회수 + filter-repo)
> 이전 세션: [260503-session84-main-wave-eval-dedupe-cleanup.md](./260503-session84-main-wave-eval-dedupe-cleanup.md)
> 세션 저널: [`docs/logs/journal-2026-05-04.md`](../logs/journal-2026-05-04.md)

---

## 작업 요약

S85 메인 chunk의 P0 이월 항목 (prod 배포) + S85 prod 라이브에서 발견된 P2 (`runNow` 가 `recordResult` 호출 누락) + S83 이월 (anthropic-news 대체 endpoint) + S82/S83 의사결정 대기 항목 (TimeZone=UTC 적용) **4건 동시 처리**. TDD 6 케이스로 회귀 가드 영구 설치, Olshansk/rss-feeds 채택으로 anthropic-news 4개월 endpoint 부재 우회, `?options=-c TimeZone=UTC` prod DATABASE_URL 적용으로 PrismaPg -9h 시프트 영구 차단. 1 cron 실행으로 P2 fix + TimeZone fix 동시 prod 검증 (cf 1→0, last_success_at NULL→22:42:57, last_run_at = wall clock 일치).

## 대화 다이제스트

### 토픽 1: 세션 시작 컨텍스트 (E+F 작업 결과 인계)

> **사용자**: (이전 메시지 recap 인용 — E 단계 prod 배포 7 commits 흡수, F 단계 cleanup 모듈 prod 첫 실행 SUCCESS deleted=0)

직전 세션 (다른 터미널 메인 wave 평가) 의 prod 배포 + 검증 결과를 인계받음. 후속 P2 (runNow recordResult 누락) + S83 이월 (anthropic-news endpoint 부재) 식별 후 사용자에게 다음 작업 옵션 제시.

> **사용자**: "지근 너가 할 수있는 작업 모두 순차적으로 진행."

**결론**: 자율 진행 모드 — 분석부터 prod 검증까지 11개 task 순차 실행.

### 토픽 2: P2 진단 — runNow 가 recordResult 호출 누락

`src/lib/cron/registry.ts` 정독으로 두 경로 비교:
- 자연 tick `runJob` (line 210-268): `dispatchCron` → `prisma.cronJob.update` → **`recordResult(jobId, success).catch(() => {})`** ← 핵심
- 수동 ADMIN `runNow` (line 319-344): `dispatchCron` → `prisma.cronJob.update` → **(end)** ← `recordResult` 호출 없음

`circuit-breaker.recordResult` 동작 (`src/lib/cron/circuit-breaker.ts` line 90-167):
- SUCCESS → `consecutiveFailures=0 + circuitState 전이 + circuitOpenedAt=null + lastSuccessAt=new Date()` 한 트랜잭션
- FAILURE/TIMEOUT → `consecutiveFailures+1 + (threshold 도달 시) circuitState=OPEN`

→ ADMIN runNow SUCCESS 후 `cf` 그대로/`last_success_at` NULL 유지 = 모니터링 대시보드 false-negative 신호.

**결론**: TDD 적용. `runJob` line 224-232 패턴 그대로 복제 + `.catch(() => {})` 로 ADR-021 cross-cutting fail-soft 보존.

### 토픽 3: TDD — registry.test.ts 신규 (RED→GREEN)

기존 `circuit-breaker.test.ts` vi.mock 패턴 참조 → 5 모듈 mock (`@/lib/prisma`, `@/lib/audit-log-db`, `./runner`, `./circuit-breaker`, `./lock`).

6 테스트 케이스:
1. SUCCESS → `recordResult(jobId, true)` 1회 호출
2. FAILURE → `recordResult(jobId, false)` 1회 호출
3. TIMEOUT → `recordResult(jobId, false)` 1회 호출
4. recordResult throw → runNow 흐름 보존 (fail-soft)
5. Cron row 미존재 → throw + recordResult 호출 없음
6. legacy tenantId=null → DEFAULT_TENANT 'default' 로 dispatch

**RED 측정**: 4 fail / 2 pass (4=호출 안 됨 정확 측정, 2=throw/none 시 호출 없는 게 맞음 = regression 가드).

**패치 적용 후 GREEN**: 6/6. 회귀: cron 디렉토리 19/19 (circuit-breaker 7 + worker-pool 6 + registry 6).

타입 에러 1건: `tenantJobLockKey` mock 의 BigInt literal `0n` → tsconfig target ES2019 → `BigInt(0)` 호환 패치.

**결론**: commit `d438303` (force push 후 secret-recovery 의 filter-repo rewrite 로 SHA `3ae830f` 으로 자연 변환).

### 토픽 4: anthropic-news 대체 endpoint 탐색 + Olshansk/rss-feeds 채택

8 후보 URL HEAD 체크 — 모두 404:
- `/news/rss.xml`, `/news/feed.xml`, `/feed.xml`, `/rss.xml`, `/news/rss`, `/news/feed`, `/news.xml`
- `/feed/` 는 308 redirect 후 최종 404

WebSearch: anthropic 공식 RSS feed **미존재**. 커뮤니티 대안 = `Olshansk/rss-feeds` (GitHub Actions hourly scrape). WebFetch GitHub repo 확인 — 4 feed (news/engineering/research/red).

`feed_anthropic_news.xml` 검증: HTTP 200, content_type=text/plain, 99KB, RSS 2.0, **205 items**, 최신 "Claude for Creative Work".

**결정**: news 1 feed 만 채택. URL 갱신은 즉시 적용 (active=false 유지 → 운영 영향 0).

**결론**: commit `ce50988`. 운영자 결정 영역 = (a) active=false → true 활성화 시점 (b) 4 feed 모두 채택할지 news 1개만.

### 토픽 5: TimeZone=UTC 적용 — `?options=-c TimeZone=UTC` DATABASE_URL 패치

`docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md` (S83 산출물) 권고 4.1 채택.

영향 분석 재확인 (audit 문서 §3.2):
- 데이터 손실 0 (round-trip cancel + raw SQL workaround)
- **유일한 사용자 영향** = 1회성 active session 강제 만료 (재로그인). 본인 운영자만 = 자기만 재로그인.
- UI 시각 일시 비일관 24~48h
- cron `lastRunAt` 기존 row 9h 일찍 표시, 신규 정확 → 24h 자연 normalization

3계층 동기화 (메모리 `feedback_env_propagation`):
- `~/ypserver/.env` (운영) — sed in-place + `.env.bak-{timestamp}`
- windows `.env` (dev) — 동일
- `~/dev/ypserver-build/.env` (build, sync exclude 대상) — 별도 패치

패치 패턴: `?schema=public` → `?schema=public&options=-c%20TimeZone%3DUTC` (URL-encoded).

**결론**: 3계층 모두 PATCHED 검증. PM2 restart 시 `--update-env` 로 자동 적용 → P2 fix 와 동시 활성화 가능.

### 토픽 6: WSL 빌드 + 배포 — 단일 foreground 호출로 SIGHUP 함정 우회

빌드 시작을 background 로 등록하려 했으나 3중 SIGHUP 패턴 발견:
- 1차: `wsl ... bash -lc "nohup ... &"` → rsync `received SIGINT, SIGTERM, or SIGHUP (code 20)` 즉시 종료
- 2차: `setsid + nohup + disown` → 다음 wsl 외부 호출 (pgrep) 후 또 SIGHUP
- **패턴 확정**: `wsl.exe` 새 호출마다 새 session 생성 → 호출 종료 시 disown child 도 SIGHUP 받음 (WSL2 HCS 정책 추정)

**3차 = 단일 foreground 호출**: `wsl -d Ubuntu -- bash -lc "bash /mnt/e/.../wsl-build-deploy.sh 2>&1 | tail -80"` (Bash tool timeout 600000ms 내 완료) → ✅

빌드 결과:
- [1/8] rsync ✓ (windows working tree → ext4 build dir)
- [2/8] npm ci ✓ (cache 효과로 수초)
- [3/8] next build ✓ — Compiled in 7.4s + Generating static pages 86/86 in 302ms
- [4/8] pack-standalone ✓ — 78MB, ELF Linux x86-64 verified
- [5/8] deploy rsync ✓ + install-native-linux.sh: gyp 실패 → **prebuilt 바이너리 폴백** (안전망 작동)
- [6/8] Drizzle migrate `applied=0` (변경 없음, 정상)
- [7/8] verify-schema OK
- [8/8] PM2 restart ypserver: pid 670992→688860, ↺22→24, status online

**결론**: 빌드 + 배포 + restart 통합 ~3분 소요. P2 fix + TimeZone=UTC 동시 prod 활성화.

### 토픽 7: smoke + prod 라이브 검증 (P2 fix + TimeZone=UTC 동시 측정)

- HTTP localhost:3000: 500 (cold start race) → 200 → 200 (안정)
- `~/ypserver/logs/err.log`: ERR_DLOPEN/Prisma/EADDR/TypeError 0건 ✓
- 부팅 로그: `2026-05-04 22:41:48 +09:00: ✓ Ready in 0ms`

cleanup runNow 실행:
- 사전: `npx tsx scripts/b8-runnow.ts almanac-cleanup` → DATABASE_URL 미설정 에러 (tsx 가 .env 자동 로드 안 함)
- PowerShell `$env:DATABASE_URL = (Get-Content .env | Select-String '^DATABASE_URL=')...` 환경변수 export 우회
- SUCCESS (29ms) — deleted=0

사전/사후 비교 (1 cron 실행으로 2 fix 동시 검증):

| 컬럼 | 사전 | 사후 | 의미 |
|------|------|------|------|
| `cf` | 1 | **0** | ✅ recordResult 호출 작동 (cf reset) |
| `state` | CLOSED | CLOSED | 정상 유지 |
| `last_success_at` | NULL | **22:42:57 KST** | ✅ recordResult 호출 작동 (lastSuccessAt 갱신) |
| `last_run_at` | 10:53:33 KST (시프트) | **22:42:57 KST = wall clock 일치** | ✅ TimeZone=UTC 시프트 해소 |
| `last_status` | (이전) | `SUCCESS: deleted=0` | runNow 정상 |

dedupe Fix B 추가 정합 검증 (S84 회귀 안전):
- almanac items=134 / ingested=134
- default tenant items=0 / ingested=0

**결론**: 통합 deploy 의 효율성 — 한 번의 prod 검증으로 P2 fix + TimeZone fix + dedupe 회귀 모두 통과.

### 토픽 8: WSL DB 호출 우회 패턴 (sudo hang vs PGPASSWORD direct)

초기 검증 시도: `sudo -u postgres psql -d ypserver` → background 분기 + 0 byte 출력. 패턴: sudo 가 password prompt 로 hang.

DB명 정정: `ypserver` → 실제 `luckystyle4u`.

우회: `PGPASSWORD=<...> psql -h localhost -U postgres -d luckystyle4u` 직접 호출 → 정상 작동 (즉시 응답).

테이블명 정정:
- `source` → `content_sources` (Prisma snake_case + 복수)
- `tenant` → `tenants`
- `audit_log` → `audit_logs`

**결론**: WSL DB 직접 호출은 PGPASSWORD 환경변수 + 명시적 -h/-U 패턴으로 통일.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | runNow 에 recordResult 호출 추가 | (a) 코드리뷰 체크리스트 (b) 패치 | 자연 tick 와 의미론적 동치성이 모니터링 신뢰성으로 직결 — 패치가 정답 |
| 2 | TDD (test 먼저) | 직접 패치 | 회귀 가드 영구 설치, 향후 단순화 시 재발 차단 |
| 3 | anthropic-news = Olshansk 채택 | (a) inactive 유지 (b) 공식 모니터링 (c) 채택 | URL 갱신은 안전 (active=false 유지로 즉시 영향 0), 공식은 4개월 부재 |
| 4 | TimeZone=UTC 즉시 적용 | (a) 트래픽 저점 03:00 대기 (b) 즉시 | 본인 운영자 = 자기만 재로그인, 영향 최소 — 권장 시간 무시 가능 |
| 5 | 빌드 = 단일 foreground wsl 호출 | (a) background + monitor 재시도 (b) systemd-run (c) 단일 foreground | 3중 background 시도 모두 SIGHUP — 단일 호출이 가장 단순 + 확실 |
| 6 | WSL DB = PGPASSWORD direct | sudo -u postgres | sudo 가 hang (password prompt 추정), PGPASSWORD 가 즉시 응답 |

## 수정 파일 (3개 + DB UPDATE 2건 + .env 3계층)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/cron/registry.ts` | runNow 에 recordResult 호출 추가 (+20 lines, runJob 패턴 복제, ADR-021 fail-soft) |
| 2 | `src/lib/cron/registry.test.ts` | 신규 192 lines, 6 케이스 (SUCCESS/FAILURE/TIMEOUT/fail-soft/missing-row/legacy-null) |
| 3 | `prisma/seeds/almanac-aggregator-sources.sql` | line 49 anthropic-news URL Olshansk + notes 갱신 |

DB UPDATE:
- `content_sources` 1 row (slug=anthropic-news, url + notes)
- `cron_jobs` 1 row (almanac-cleanup, runNow 검증으로 cf/last_success_at/last_run_at 갱신)

`.env` 3계층:
- windows `.env` line 8 — TimeZone=UTC 추가 + `.env.bak-20260504-223541`
- `~/dev/ypserver-build/.env` — 동일
- `~/ypserver/.env` — 동일 + `.env.bak-{timestamp}`

## 상세 변경 사항

### 1. `src/lib/cron/registry.ts` runNow recordResult 호출 추가

```ts
// dispatch + lastRunAt/lastStatus 갱신 후 추가됨:
if (
  result.status === "SUCCESS" ||
  result.status === "FAILURE" ||
  result.status === "TIMEOUT"
) {
  await recordResult(row.id, result.status === "SUCCESS").catch(() => {
    // silent — runJob 의 동일 패턴
  });
}
```

JSDoc 주석 보강: 기존 "circuit/lock 무시 (운영자 의도 우선)" → "dispatch 결정 단계의 circuit/lock 은 무시. 단, 결과는 자연 tick 과 동일하게 recordResult 로 circuit-breaker 카운터에 반영"으로 의도 명확화.

### 2. `src/lib/cron/registry.test.ts` 신규

vi.mock 5 모듈 격리 + 6 케이스. `tenantJobLockKey` mock 은 `BigInt(0)` 사용 (ES2019 호환). 회귀 가드 2 케이스 (`recordResult throw 시 흐름 보존` + `Cron row 미존재 시 throw + 호출 없음`) 가 향후 누군가 `runNow` 단순화 시 자동 차단.

### 3. `prisma/seeds/almanac-aggregator-sources.sql` line 49

```diff
-('anthropic-news', 'Anthropic News', 'https://www.anthropic.com/news/rss.xml', ..., FALSE, NULL),
+('anthropic-news', 'Anthropic News', 'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml', ..., FALSE, '공식 anthropic.com/news/rss.xml 미제공 — Olshansk/rss-feeds GitHub Actions hourly scrape (third-party).'),
```

## 검증 결과

- `npx vitest run src/lib/cron/registry.test.ts` — **6/6 GREEN**
- `npx vitest run src/lib/cron/` — **19/19 통과** (circuit-breaker 7 + worker-pool 6 + registry 6, 회귀 0)
- `npx tsc --noEmit` — cron 디렉토리 0 에러 (BigInt literal 호환 패치 후)
- WSL 빌드 [1/8]~[8/8] 모두 통과, ELF Linux x86-64 verified
- HTTP localhost:3000 — 200 OK 안정 (cold start 1회 500 후 회복)
- err.log — ERR_DLOPEN/Prisma/EADDR/TypeError 0건
- prod cleanup runNow — SUCCESS 29ms / cf 1→0 / last_success_at NULL→22:42:57 / last_run_at = wall clock 정확 일치

## 터치하지 않은 영역

- 다른 터미널 산출 (wave-completion-eval handover, secret-recovery handover, journal 선행 섹션) — 본 chunk 는 새 섹션만 append
- `docs/status/current.md` 다른 터미널 modified 부분 (s85 row 추가) — 본 세션은 row 86 append 만
- `docs/logs/2026-05.md` 동일
- `next-dev-prompt.md` — 다른 터미널이 s86 컨텍스트로 갱신 가능, 본 세션은 최소 변경
- M4 UI Phase 2 (composer 인터랙티브, SSE wiring) — S85 P0 messenger 작업 영역, 본 chunk 무관
- 비밀번호 회전 — S85 보조 chunk 사용자 결정 영역
- anthropic-news active=false → true 토글 — 운영자 결정
- `ce50988` push — 사용자 명령 미실행

## 알려진 이슈

- **origin push 1 commit (`ce50988`)** — 사용자 push 명령 대기
- **anthropic-news active=false 유지** — 운영자 활성화 결정 + 4 feed (news/engineering/research/red) 모두 채택할지 결정
- **24h TimeZone=UTC 모니터링 미수행** — 본 세션 종료 후 수행. active session 영향 본인 운영자만이라 위험 낮음
- **5개 cron 표시값 시프트 잔존** — rss-fetch 23:00 KST / classify+promote 23:30 KST / cleanup 03:00 KST 자연 tick 후 stored value 갱신되어 자동 정확화
- **`.env.bak-*` 3개 파일** (windows + build + ypserver) — `.gitignore` 미등록, 운영자 정리 영역
- **WSL2 SIGHUP 함정** (Compound Knowledge 후보) — `setsid + nohup + disown` 으로도 wsl 외부 호출 시 child process SIGHUP 받음. 단일 foreground wsl 호출 패턴 표준화

## 다음 작업 제안 (S87+)

| 우선 | 작업 | 소요 | 차단 / 컨텍스트 |
|------|------|------|----------------|
| P0 | 23:00 / 23:30 / 03:00 KST 자연 cron tick 후 stored value 정확화 검증 | ~5분 (각 tick 후) | TimeZone=UTC 자연 path 검증 + dedupe Fix B 정합 추가 |
| P0 | M4 UI Phase 2 (Composer + SSE + name lookup) | 5-6 작업일 | S85 next-dev-prompt 정의 |
| P1 | origin push (`ce50988`) | 즉시 | 사용자 결정 |
| P1 | `.env.bak-*` 3개 정리 + `.gitignore` 패턴 추가 검토 | 5분 | 운영자 결정 |
| P2 | anthropic-news active=true 토글 + (선택) 4 feed 확장 | 30분 | 운영자 라이선스 검토 |
| P2 | Compound Knowledge 산출 (WSL2 SIGHUP 패턴 / tsx .env 미로드) | 30분 | 향후 자동화 시 재사용 |
| P2 | GitHub repo public/private 확인 (S85 보조 chunk 이월) | 5분 | filter-repo 효과 평가 |

---
[← handover/_index.md](./_index.md)
