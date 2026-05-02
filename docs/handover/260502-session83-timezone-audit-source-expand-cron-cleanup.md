# 인수인계서 — 세션 83 (S82 follow-up: timezone audit P1 + 60 sources 확장 + multipart cron + SSE 라이브 e2e)

> 작성일: 2026-05-02
> 이전 세션: [session82 (M3 user 채널 + M2 라이브 + 4 latent fix)](./260502-session82-m3-user-m2-live-prisma-rls-fixes.md)
> 저널 원본: [journal-2026-05-02.md](../logs/journal-2026-05-02.md) §"세션 83"

---

## 작업 요약

S82 종료 시 5 follow-up 인계 + 사용자가 P1 격상한 PrismaPg timezone audit 합 6 task 모두 완료. **코드 commit 0** (운영 액션 + 신규 untracked 2 파일). WSL 빌드+재배포 1회 (M3 SSE route 라이브 진입).

## 대화 다이제스트

### 토픽 1: 베이스라인 점검 + 6 todo 등록
> **사용자**: "남은 작업 모두 순차적으로 진행..." (S82 종료 시점 5 follow-up 인계)

`feedback_baseline_check_before_swarm` + `feedback_concurrent_terminal_overlap` 룰 적용. `git log --oneline -8` + `git status --short` + 최신 next-dev-prompt 읽기. 워킹 트리 깨끗 (settings/lock leftover만), 다른 터미널 충돌 0.

todo 6개 등록: #1 24h cron 관찰 / #2 60 sources 점진 확장 (5씩) / #3 anthropic-news / #4 S78-H multipart cron / #5 M3 SSE 라이브 e2e / #6 timezone shift 영향 audit (S82 follow-up).

**결론**: 순차 진행 시작 (Task #1).

### 토픽 2: Task #1 — 24h cron 관찰 + PrismaPg -9h shift prod 발현 empirical 확인

`b8-check.ts` 로 cron + sources 1줄 dump:
- `almanac-rss-fetch` (every 6h) last_run = 2026-05-01 23:21+09 (S81 의 runNow 결과)
- `almanac-classify`/`almanac-promote` (every 30m) last_run = 02:00:31+09 — 실제 11:00 KST natural tick (디스플레이 -9h shifted)
- `items=60` stable, `ingested=0` (promote 가 staging → final 이전 후 staging 비움)

`b8-runnow.ts` 수동 실행 (10:55 wall) → DB last_run_at = `01:57:23+09` 저장. **wall 10:55 KST = 01:55 UTC, DB 표시 01:57:23+09 = 16:57 UTC May 1 → 정확히 -9h shift 재현**. CK `2026-05-02-prismapg-asia-seoul-timestamptz-shift.md` 의 prod 양방향 cancel 가설 = 사실. 단 cron 자체는 정상 작동 (matchesSchedule = JS Date 기반).

**결론**: cron 정상 + items 안정 + sources stable. PrismaPg shift 가 prod 에 발현됨을 empirical 수치로 재확인.

### 토픽 3: Task #2 — 60 sources 점진 확장 (5 신규 활성)

mature builders + Korean 다양성 5 선정:
- `github-blog` (en/build) / `huggingface-blog` (en/build) / `stripe-blog` (en/build) / `kakao-tech` (ko/build) / `techcrunch-ai` (en/build)

직접 SQL UPDATE (`b8-activate.ts` 는 5 hardcode 이라 수정 부담 → SQL 1줄 효율): `SET app.tenant_id` + UPDATE 5 rows active=TRUE.

**결론**: 5 row UPDATE 성공. runNow 라이브 검증은 토픽 7 에서 (timezone audit 우선 인터럽트).

### 토픽 4: 사용자 인터럽트 — Task #6 P1 격상 (timezone audit 우선)
> **사용자**: "지금 작업트리에 다음 내용도 확인 및 필요시 진행 목록 추가.. 가장 큰 발견 — S83 우선 follow-up. prod PrismaPg + Asia/Seoul timezone +9hr 시프트 가 read/write 양방향 cancel 로 가려져 있는 사안 (CK prismapg-asia-seoul-timestamptz-shift). rate-limit / edit-15min / recall-24h / session expiry / cron schedule 비교 로직에 잠재 영향. P1, ~2h audit 권장."

Task #2 의 runNow 검증 일시 보류 + Task #6 P1 진입. CK 본문 read 후 코드 패턴 전수 grep:

**스캔 결과 (12 위치 분류)**:

| 분류 | 코드 위치 | prod 안전성 |
|---|---|---|
| Prisma round-trip cancel | messages.ts edit/recall window, today-top boost, search window, webauthn challenge, MFA challenge retryAfter, circuit-breaker cooldown | ✅ 정확 |
| DB-side calc only | rate-limit-db (S40 TIMESTAMPTZ(3) 마이그레이션 후), cleanup-scheduler `expires_at < NOW() - INTERVAL '1 day'` | ✅ 정확 |
| raw SQL workaround 인지 | sessions/tokens.ts `expires_at <= NOW()`, MFA service.ts `(locked_until::text)` 캐스트 | ⚠️ 9h 일찍 만료 신호 (사용자 미체감) |
| 외부 timestamp 파싱 | RSS publishedAt / API created_at — Prisma write 통과로 cancel | ✅ 정확 |

**적용 영향 분석** (`?options=-c TimeZone=UTC`):
- 신규 write/read 모두 정확
- 기존 row: -9h shifted 채로 저장됨 → 적용 직후 active sessions 다수 expired 처리 → **재로그인 1회 외 영향 미미**
- 기존 message 의 createdAt: UI 시각 일시 비일관 (24~48h normalization)

**산출**: `docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md` (5 단계 — 동기/empirical/스캔/영향/권고). 권고 = §4.1 prod DATABASE_URL TimeZone=UTC 적용 (트래픽 저점).

**결론**: prod 데이터 손실 0, 사용자 체감 거의 0. 신규 코드 유입 위험 실재 (S82 통합 test 가 그 case). 사용자 의사결정 대기.

### 토픽 5: Task #3 — anthropic-news 비활성화

운영 RSS 4 path probe (`/news/rss.xml`/`/news/atom.xml`/`/news/feed.xml`/`/feed`/`/rss.xml`) 모두 404. anthropic.com 측 RSS 제거 확인. SQL UPDATE active=FALSE + notes 갱신 (재활성 트리거 = 대체 endpoint 발견 시).

**결론**: 9 RSS active 로 안정화 (S81 5 + 신규 5 - anthropic 1 = 9).

### 토픽 6: Task #4 — multipart cleanup cron (S78-H 부채)

`weed shell` 의 `s3.clean.uploads -timeAgo=24h` 명령을 cron 등록. 옵션 비교:
- ❌ cron registry (FUNCTION/SQL/WEBHOOK/AGGREGATOR 만, weed 외부 명령 X)
- ✅ WSL crontab (Linux 표준)
- ❌ PM2 schedule (가능하나 외부 명령 단순)

WSL crontab 선택. 산출:
- `scripts/seaweedfs-clean-multipart.sh` — weed shell 호출 + 로그 누적 (`~/logs/seaweedfs-clean.log`)
- WSL `~/scripts/seaweedfs-clean-multipart.sh` 사본 + chmod +x
- crontab `0 4 * * 0 /home/smart/scripts/seaweedfs-clean-multipart.sh ...` (매주 일요일 04:00 KST)
- 수동 1회 실행 PASS (24h+ stale uploads = 0건)

**결론**: S78-H 부채 해소. 매주 자동 24h+ stale multipart 회수.

### 토픽 7: Task #5 — M3 SSE 라이브 e2e + 빌드+재배포

`/api/v1/t/almanac/messenger/conversations/<id>/events` 엔드포인트 401 ping 시도 → 404 응답. 진단:
- `~/ypserver/.next/server/.../conversations/[id]/` → events 디렉토리 부재
- `~/dev/ypserver-build/src/.../conversations/[id]/` → 동일 부재

S81 commit `069705c` 의 events route 가 마지막 deploy 이후 추가됨 → 미동기. WSL 빌드+배포 1회 (CLAUDE.md 신규 룰 — restart 는 stop 아님 → 허용):

```bash
# tsc 사전 검증 → 0 errors
bash /mnt/e/.../scripts/wsl-build-deploy.sh
```

8단계 빌드+rsync+drizzle migrate(applied=0)+verify schema+pm2 restart 모두 PASS, ELF Linux x86-64. ypserver pid 226263 → 252403, ↺=21.

재배포 후 401 응답 확인 (events route 정상 빌드+로딩). publish/subscribe 풀 e2e = auth cookie + 실 conversation 필요 → browser 플로우 별도. 단위 테스트 27 케이스 (sse 8 + sse-additional 7 + m2-integration 12) 가 wire format + fan-out 보장.

**부수 발견**: Windows port 3000 leftover node.exe (pid 6608) — Windows curl localhost:3000 = 그 process 로, WSL 내부 curl 만 ypserver 도달. ypserver 무관 dev 잔재.

**결론**: events route 라이브 + 401 가드 정상. publish/subscribe e2e 는 운영자 본인 browser 로 별도 검증 필요.

### 토픽 8: Task #2 재개 — 9 RSS sources runNow 검증

배포 후 `b8-runnow.ts` 1회: sources=8 fetched=130 inserted=0 duplicates=130 errors=0. 9 RSS 모두 SUCCESS, fails=0. `b8-check` 결과 — 9 sources 모두 fetched=02:23:5x (= 11:23 wall actual) 정상.

inserted=0 duplicates=130 — 5 신규 소스가 기존 60 ContentItem 의 canonical URL 과 중첩 (예상: github/stripe/techcrunch 가 OpenAI/Anthropic 글을 인용·전재). dedupe 너무 적극적 의심도 있음 — 별도 진단 후보 (소스 정상 작동 자체는 확인됨).

**결론**: 9 RSS active + consecutiveFailures=0 안정.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | timezone audit 권고 = DATABASE_URL TimeZone=UTC | (a) 적용 / (b) 코드리뷰 체크리스트만 / (c) Prisma 업그레이드 대기 | 신규 코드 유입 위험 영구 차단 + 데이터 손실 0 + 적용 비용 = 재로그인 1회. 사용자 의사결정 대기 |
| 2 | 60 sources 확장 5 선정 = github/huggingface/stripe/kakao/techcrunch | mature builder 위주 / Korean 다양성 / 신규 분야 | 안정성 (mature) + 다양성 (Korean kakao) + B3 한글 boundary 추가 검증 |
| 3 | multipart cron = WSL crontab | cron registry / PM2 schedule / WSL crontab | weed 외부 명령 가장 단순. cron registry 는 SQL/FUNCTION/WEBHOOK/AGGREGATOR 만 |
| 4 | M3 SSE 라이브 e2e 후 빌드+재배포 진행 | (a) 재배포 + 401 ping / (b) 미배포 보류 / (c) 운영자 본인 검증 위임 | events route 가 S82 commit 됐으나 미배포 = 라이브 e2e 자체 불가능 → 재배포 필수. CLAUDE.md 신규 룰 = restart 는 stop 아님 → 허용 |
| 5 | anthropic-news 비활성 (대체 endpoint 미탐색) | (a) 비활 / (b) X/Twitter 등 대체 추가 | 4 path 모두 404 확정. 대체 endpoint 탐색은 운영자 가이드 영역 |

## 수정 파일 (신규 untracked 2)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `docs/solutions/2026-05-02-prismapg-timezone-prod-audit.md` | 12 코드 위치 분류 + 적용 영향 분석 + 권고 4.1/4.2/4.3 (S82 CK 의 prod follow-up) |
| 2 | `scripts/seaweedfs-clean-multipart.sh` | weed shell s3.clean.uploads 호출 + 로그 누적 (S78-H 부채 해소) |

## 운영 액션 (코드 변경 외)

| 액션 | 결과 |
|---|---|
| WSL postgres `content_sources` UPDATE × 6 | 5 신규 active=TRUE + anthropic-news active=FALSE |
| WSL `~/scripts/seaweedfs-clean-multipart.sh` 설치 + chmod +x | 매뉴얼 1회 실행 PASS |
| WSL `crontab` 1행 추가 | 매주 일요일 04:00 KST 자동 실행 |
| `wsl-build-deploy.sh` 실행 (PM2 restart) | ypserver pid 252403 (↺=21), M3 SSE events route 라이브 |

## 검증 결과

- `npx tsc --noEmit` — 0 errors (배포 사전)
- WSL 빌드+배포 8단계 모두 PASS, ELF Linux x86-64
- `/events` 401 응답 (route 정상 빌드+withTenant guard)
- weed shell s3.clean.uploads 수동 실행 PASS (24h+ stale uploads = 0건)
- `b8-runnow.ts` 10792ms PASS (sources=8 fetched=130 errors=0)

## 터치하지 않은 영역

- **M4 UI 보드** (5-7일 chunk, 별도 세션 권장)
- **Phase 2 plugin** (`packages/tenant-almanac/`, M3 충분 안정 후)
- **timezone fix 실제 적용** (사용자 의사결정 대기)
- **M3 SSE browser publish/subscribe 풀 e2e** (운영자 본인)
- **Windows port 3000 leftover node.exe (pid 6608) 정리** (별도 세션)
- **dedupe 너무 적극 진단** (inserted=0 issue)
- **anthropic-news 대체 endpoint 탐색**
- **totp.test.ts AES-GCM tamper flake** (S82 부터 미해결)
- **M5+M6 messenger Phase 1 잔여**

## 알려진 이슈

- **5 신규 소스 inserted=0 duplicates=130** — 기존 canonical URL 중첩 또는 dedupe 너무 적극. 별도 진단 후보. 소스 자체는 정상 작동 (consecutiveFailures=0).
- **Windows port 3000 leftover node.exe (pid 6608)** — Windows curl localhost:3000 라우팅 잘못됨. WSL 내부에서는 정상. ypserver 무관 dev 잔재.
- **PrismaPg -9h shift prod 발현 지속** — audit 보고서 §4.1 권고 대기 중. 사용자 체감 거의 0 이지만 신규 코드 유입 위험 실재.

## 다음 작업 제안

### P1 (사용자 의사결정 + 즉시 실행 가능)
- **prod DATABASE_URL TimeZone=UTC 적용** (audit §4.1 권고). 트래픽 저점 (KST 03:00~05:00). 절차:
  1. `~/ypserver/.env` DATABASE_URL 수정 — `?options=-c%20TimeZone%3DUTC` 추가
  2. `pm2 restart ypserver`
  3. Smoke test: 로그인 + 메시지 + cron lastRunAt 1줄
  4. 24h 후 active session count 모니터

### P2 (정기 관찰 + 점진 확장)
- **60 sources 자연 cron 24h+ 안정 관찰** 후 추가 5 확장 (현재 9 → 14)
- **inserted=0 dedupe 진단** — canonical URL 중첩 vs dedupe 너무 적극 구분
- **M3 SSE browser publish/subscribe e2e** — 운영자 본인 (실제 conversation + auth cookie)

### P3 (별도 세션 챕터)
- **M4 UI 보드 5-7일 chunk** (대화 목록 + 채팅창 + composer)
- **Phase 2 plugin** (`packages/tenant-almanac/`) — M3 안정 + 두 번째 컨슈머 등록 시
- **anthropic-news 대체 endpoint** 탐색

### P4 (잡일)
- Windows port 3000 leftover node.exe 정리
- totp.test.ts AES-GCM tamper flake fix
- M5+M6 messenger Phase 1 잔여

---
[← handover/_index.md](./_index.md)
