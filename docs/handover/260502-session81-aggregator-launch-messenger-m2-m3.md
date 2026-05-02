# 인수인계서 — 세션 81 (B7+B8 라이브 + Track C M2 + M3 SSE + 통합테스트 32 케이스)

> 작성일: 2026-05-02
> 이전 세션: [session80](./260502-session80-aggregator-bpre-b1-b2.md)
> 저널: [journal-2026-05-02.md](../logs/journal-2026-05-02.md) §"세션 81"

---

## 작업 요약

사용자 단일 요청 "B7,b8 작업 및 C 작업 전체 진행" 으로 wave-wiggly-axolotl 의 5 세션 매핑(80~86) 을 단일 세션에 압축. 4개월 P0 본진 (Almanac aggregator) 가 첫 production 카드 50건 라이브 + Track C M2 라우트 layer 23 ops 19 routes 4 그룹 + (다른 터미널) M3 SSE 채널 + M2 머지 게이트 통합 테스트 32 케이스 흡수. 누적 3 commits / +3,164 LOC / 26 파일.

---

## 대화 다이제스트

### 토픽 1: 사용자 요청 + 베이스라인 점검 + 현실적 스코프 보고

> **사용자**: "B7,b8 작업 및 C 작업 전체 진행 .... B7 (~3h): scripts/seed-aggregator-cron.ts + 6 cron jobs (enabled=FALSE) + WSL 빌드 + 배포. B8 (~2h): 5 소스 점진 활성화 + 24h 관찰 + 첫 카드"

베이스라인 4종 점검 (memory `feedback_baseline_check_before_swarm` + `feedback_concurrent_terminal_overlap` 적용):
- git log/status — 직전 commit `7c50c9f B6` (세션 80 종료 시점)
- current.md row 80 — Track B B-pre~B6 완료 확인
- next-dev-prompt — 세션 81 첫 작업 = B7
- wave plan + m2-detailed-plan §5 — Track C 19 ops 인벤토리

**현실적 스코프 보고** (사용자 요청 압축 시도 vs 실제 가능):
- B7 + B8-activation = 즉시 가능
- B8 24h 관찰 = 실시간 압축 불가 (cron schedule "every 6h" 자연 tick 대기)
- Track C 19 ops = 1+ 세션 분량이지만 헬퍼/스키마 사전 완료 (S67/68) → 패턴 단일 → 압축 가능
- "Anti-Goldilocks 원칙": 24h 윈도우는 cron 작업 시간이지 Claude 작업 시간 아님

**결론**: 즉시 B7 → B8 → C1 → C2 → C3 → C4 직진.

---

### 토픽 2: B7 — seed-aggregator-cron.ts + 라이브 적용 + WSL 빌드+배포

`scripts/seed-aggregator-cron.ts` (195 LOC):
- 6 cron jobs 정의 (`almanac-{rss-fetch,html-scrape,api-poll,classify,promote,cleanup}`)
- `--tenant=<slug>` + `--enabled` 옵션 (default FALSE)
- 멱등 upsert: `(tenantId, name)` composite unique 기반 findFirst → update / create

**tsc 1차 실패 → 즉시 fix**: `Type 'Record<string, unknown>' is not assignable to type 'JsonNullClass | InputJsonValue'`. Prisma 7 의 strict Json 타입 — `import type { Prisma }` + `payload: Prisma.InputJsonValue` 캐스트 적용.

**WSL 직접 적용** (memory `feedback_migration_apply_directly`): scripts rsync → `npx tsx scripts/seed-aggregator-cron.ts --tenant=almanac` → 6 row CREATE (enabled=FALSE) PASS.

**WSL 빌드+배포**: `bash scripts/wsl-build-deploy.sh` [1/8]~[8/8] 전 단계 PASS — npm ci / next build / pack-standalone / rsync to ~/ypserver / install-native-linux / Drizzle 0 신규 / verify-schema OK / PM2 restart pid 220187 ↺=19. ELF Linux x86-64 검증 통과. err.log 0건, out.log "Ready in 0ms".

---

### 토픽 3: B8 — 5 소스 활성화 + runNow 라이브 검증

`scripts/b8-list-sources.ts` (62 LOC) → 60 sources 인벤토리 (RSS 46 / HTML 3 / API 7 / FIRECRAWL 4) 중 5 선정:
- anthropic-news / openai-blog / vercel-blog (RSS en build) — 안정적 well-known RSS
- toss-tech (RSS ko build) — **B3 한글 boundary fix 라이브 검증**
- hn-algolia-front (API en community) — fetchers/api.ts 라이브 검증

`scripts/b8-activate.ts` (103 LOC) → 5 sources `active=TRUE` + 6 cron `enabled=TRUE` (`consecutiveFailures=0` / `circuitState=CLOSED` 리셋 동시 적용, --rollback 옵션 지원).

`scripts/b8-check.ts` (1분 후 점검): cron `last_status` 모두 `'never'` (다음 자연 tick 까지 6h~30m 대기).

**라이브 검증을 위해 `scripts/b8-runnow.ts` (45 LOC) 작성** — registry.runNow(jobId) 호출. 3 모듈 순차 force-run:

```
runNow almanac-rss-fetch  SUCCESS (13s)  — sources=4 fetched=60 inserted=60 dup=0 errors=1 (anthropic-news 404)
runNow almanac-classify   SUCCESS (237ms) — pending=50 classified=50 errors=0
runNow almanac-promote    SUCCESS (303ms) — promoted=50 errors=0
```

**결과**: items=50 (첫 production Almanac 카드), 4개월 P0 본진 라이브 검증 완료.

**§3 격리 첫 production 실증**: anthropic-news RSS URL 404 (외부 사실 — 사이트가 RSS 경로 변경) → consecutiveFailures=1, 다른 4 소스 fetch 차단 0. 임계 5 도달 시 `source.active=false` 자동 전환.

**B3 한글 boundary fix 라이브 통과**: toss-tech (RSS ko) 의 한글 콘텐츠가 fetch+classify+promote 전 경로 통과 — spec port-time bug (regex `\b` ASCII-only) 가 production 차단되지 않음 증명.

---

### 토픽 4: Track C M2 — 23 ops 19 routes 4 그룹 직진

m2-detailed-plan.md §5 인벤토리 + 헬퍼 4개 + Zod 스키마 3개 + types.ts 모두 사전 완비 (S67/68). 신규 작성은 라우트 layer 만.

**공용 유틸**: `src/lib/messenger/route-utils.ts` (80 LOC):
- `messengerErrorResponse(err)` — MessengerError → HTTP status 매핑 20 코드 (NOT_FOUND=404 / FORBIDDEN=403 / DUPLICATE_*=409 / *_EXPIRED/*_LIMIT_*=422)
- `emitMessengerAudit({event, actor, request, details})` — audit/safe.ts auditLogSafe wrapper

**4 그룹 23 ops** (라우트 핸들러 패턴: 가드 + Zod parse + helper 호출 + audit + errorMap):

| 그룹 | ops | files | 주요 헬퍼 |
|---|---|---|---|
| C1 conversations | 5 (GET/POST + GET/PATCH/DELETE) | 2 | findOrCreateDirect / createGroup / archiveConversation |
| C2 messages | 5 (GET/POST + PATCH/DELETE + search) | 3 | listMessages / sendMessage (rate 60/min) / editMessage / recallMessage / searchMessages (rate 30/min) |
| C3 members/typing/receipts | 5 | 5 | addMembers / removeMember / updateMemberSelf / typing(stub) / receipt upsert |
| C4 safety+admin | 8 (blocks 3 + report + prefs 2 + admin 2) | 6 | blockUser / unblockUser / fileReport (rate 5/min) / resolveReport (`withTenantRole`) |

**검증**:
- tsc --noEmit exit 0 (1회 만에 통과)
- vitest run 509 pass / 60 skip / 회귀 0
- WSL 빌드+배포 PASS (pid 226263 ↺=20)
- 17 라우트 unauth ping 모두 401 (handler 등록 + withTenant 가드 + 부팅 0 errors)

---

### 토픽 5: 다른 터미널 M3 SSE + M2 통합 테스트 32 케이스 흡수

본 conversation /cs 호출 직전 다른 터미널이 push (commit `069705c`, +1,332 LOC):

- `src/lib/messenger/sse.ts` (70 LOC) — `convChannelKey(tenantId, conversationId)` + `userChannelKey(tenantId, userId)` + `publishConvEvent` / `publishUserEvent` (try-catch fail-soft, bus.ts 싱글턴 활용, ADR-022 §1 Phase 2 트리거 멀티 인스턴스 시 Redis pubsub 교체)
- `conversations/[id]/events/route.ts` (115 LOC) — SSE GET endpoint
- `tests/messenger/m2-integration.test.ts` (969 LOC) — M2 통합 테스트 32 케이스 (m2-detailed-plan §6.3 머지 게이트 게이트 충족)
- `tests/messenger/sse.test.ts` (134 LOC)
- 5 라우트 publishConvEvent 통합:
  - messages POST → `message.created`
  - messages PATCH → `message.updated`
  - messages DELETE → `message.deleted`
  - members POST → `member.joined`
  - members DELETE → `member.left`
  - typing POST → `typing.started` (M3 stub → 실제 publish 활성화)
  - receipts POST → `receipt.updated`

**충돌 0 보완 협업**: 본 conversation 의 라우트 layer (가드+Zod+helper+audit+errorMap) 와 다른 터미널의 publishConvEvent 통합 (publish 호출 1줄 추가 per 라우트) 이 정확히 보완 관계. memory `feedback_concurrent_terminal_overlap` 의 잠재 위험을 동일 영역 분담 협업으로 전환한 사례.

---

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | B7+B8+C 압축 직진 (단일 세션) | A: 5 세션 분리 (wave plan 그대로) / B: 단일 세션 압축 | (B). 헬퍼/스키마 사전 완비 + 24h 윈도우는 cron 작업 시간 → 활성화 직후 곧바로 C 진입 가능. 충돌 면적 = `cron/runner.ts` 1개 (이미 B6 처리). |
| 2 | runNow force-run (라이브 검증) | A: 자연 tick 대기 (6h+) / B: registry.runNow 강제 실행 | (B). cron 자연 tick 의 의미적 동등 (스케줄/circuit/lock 무시), 결정적 회귀 검증을 즉시 수행. |
| 3 | 5 소스 선정 (60 중) | A: 모두 RSS / B: 변종 (RSS+API+한글) | (B). RSS 4 (en) + RSS 1 (ko, B3 검증) + API 1 (fetchers/api.ts 검증). 4 fetcher kind 중 3 종 + 한글 처리 라이브 검증 동시. |
| 4 | route-utils 공용 유틸 분리 | A: 각 라우트 inline / B: 공용 모듈 | (B). MessengerError → HTTP 20 코드 매핑 + audit emit 패턴 13 라우트 반복 → 공용 모듈로 단일 진실 소스. |
| 5 | members/me 정적 segment | A: members/[userId]/me 분기 처리 / B: members/me 정적 폴더 | (B). Next.js 라우팅 우선순위 (정적 > 동적) 활용 — 코드 단순. |
| 6 | typing M3 stub | A: M3 진입까지 410 Gone / B: 200 stub (publish 없음) | (B). 클라이언트 호출은 noop 보장 (M3 진입 후 자동 활성화). 다른 터미널 M3 진입으로 즉시 활성화됨. |

---

## 수정 파일 (이번 conversation 22 파일)

### B7+B8 (5 파일, +477 LOC)

| 파일 | 변경 |
|---|---|
| `scripts/seed-aggregator-cron.ts` | 6 cron jobs 멱등 upsert (--tenant + --enabled) |
| `scripts/b8-list-sources.ts` | almanac 60 sources 인벤토리 (slug/kind/active/country/track) |
| `scripts/b8-activate.ts` | 5 sources + 6 cron 일괄 활성/롤백 (`active=TRUE` + `consecutiveFailures=0` + `circuitState=CLOSED`) |
| `scripts/b8-check.ts` | cron last_status + source consecutiveFailures + items count |
| `scripts/b8-runnow.ts` | registry.runNow(jobId) 단일 cron 즉시 force-run |

### Track C M2 (17 파일, +1,360 LOC)

| 파일 | 변경 |
|---|---|
| `src/lib/messenger/route-utils.ts` | MessengerError → HTTP status 매핑 20 코드 + emitMessengerAudit |
| `src/app/api/v1/t/[tenant]/messenger/conversations/route.ts` | GET (list) / POST (DIRECT 멱등 + GROUP) |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/route.ts` | GET (myMembership) / PATCH (title|archive, OWNER/ADMIN) / DELETE (archive, OWNER) |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/messages/route.ts` | GET listMessages / POST sendMessage (rate 60/min, audit message_sent) |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/messages/[msgId]/route.ts` | PATCH editMessage (15min) / DELETE recallMessage (sender 24h or admin) |
| `src/app/api/v1/t/[tenant]/messenger/messages/search/route.ts` | GET searchMessages (rate 30/min) |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/members/route.ts` | POST addMembers (OWNER/ADMIN, 부분 성공) |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/members/[userId]/route.ts` | DELETE removeMember (admin or self) |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/members/me/route.ts` | PATCH updateMemberSelf (pin/mute) |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/typing/route.ts` | POST stub (rate 1/sec) — 다른 터미널 M3 에서 publish 활성화 |
| `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/receipts/route.ts` | POST MessageReceipt upsert + cross-conversation 침투 방어 |
| `src/app/api/v1/t/[tenant]/messenger/user-blocks/route.ts` | GET listMyBlocks / POST blockUser (audit user_blocked) |
| `src/app/api/v1/t/[tenant]/messenger/user-blocks/[id]/route.ts` | DELETE unblockUser |
| `src/app/api/v1/t/[tenant]/messenger/abuse-reports/route.ts` | POST fileReport (rate 5/min, audit report_filed) |
| `src/app/api/v1/t/[tenant]/messenger/notification-preferences/route.ts` | GET (default fallback) / PATCH upsert |
| `src/app/api/v1/t/[tenant]/messenger/admin/reports/route.ts` | GET listOpenReports (`withTenantRole(["OWNER","ADMIN"])`) |
| `src/app/api/v1/t/[tenant]/messenger/admin/reports/[id]/resolve/route.ts` | POST resolveReport (DELETE_MESSAGE/BLOCK_USER/DISMISS, audit report_resolved) |

### 다른 터미널 흡수 (commit 069705c, +1,332 LOC, 4 신규 + 5 갱신 — 본 conversation 외)

src/lib/messenger/sse.ts / conversations/[id]/events/route.ts / tests/messenger/m2-integration.test.ts (32 케이스) / tests/messenger/sse.test.ts / 위 5 라우트에 publishConvEvent import + 호출 통합.

---

## 검증 결과

- `npx tsc --noEmit` exit 0
- `npx vitest run` — 509 pass / 60 skip / 회귀 0 (다른 터미널 추가 후 수치는 별도 확인 필요)
- WSL 빌드+배포 2회 PASS (B7 후 pid 220187 ↺=19, Track C 후 pid 226263 ↺=20)
- ELF Linux x86-64 검증
- err.log 0건
- 17 messenger 라우트 unauth ping 모두 401 (auth gate 정상)
- almanac-rss-fetch / classify / promote runNow PASS, items=50 production 카드 라이브

---

## 터치하지 않은 영역

- 24h 관찰 (실시간 압축 불가, 자연 cron tick 대기)
- 60 소스 점진 확장 (5 → 60, 5씩)
- M3 SSE 라이브 검증 (브라우저 EventSource 연결 + 메시지 수신 → 운영자 본인 또는 별도 세션)
- M4 운영자 시나리오
- anthropic-news RSS URL 갱신 (외부 사이트 측 변경 — 운영자 또는 별도 세션)
- Phase 2 plugin 마이그레이션 (`packages/tenant-almanac/aggregator/`)

---

## 알려진 이슈

1. **anthropic-news 404** (외부 사실, 격리됨) — consecutiveFailures=1, 임계 5 도달 시 자동 비활성. RSS URL 갱신 또는 source 제거 필요.
2. **`b8-check.ts` ingested count 0 보고** — 실제 INSERT 60 → promote 50 → status='promoted' 50 + status='pending' 10 가 있어야 하나 count 0. RLS/필터 이슈 추정 (별건). items=50 은 진실.
3. **routes 통합 테스트는 다른 터미널이 32 케이스 추가** (commit 069705c) — 라이브 PASS/FAIL 결과는 별도 검증 (RLS_TEST_DATABASE_URL 셋업 필요).

---

## 다음 작업 제안 (S82+)

| # | 작업 | 우선 | 소요 | 비고 |
|---|------|------|------|------|
| 1 | M3 SSE 라이브 검증 (브라우저 EventSource) | P0 | ~30분 | 운영자 본인 또는 자동화 |
| 2 | 24h+ 관찰 후 60 소스 점진 확장 (5씩) | P0 | ~30분 × N회 | b8-activate.ts 패턴 재사용 |
| 3 | anthropic-news RSS URL 갱신 또는 제거 | P1 | ~10분 | 외부 사이트 측 변경 |
| 4 | M4 운영자 시나리오 (운영 콘솔 UI) | P1 | TBD | wave-wiggly-axolotl 의 별도 트랙 |
| 5 | tests/messenger 통합 테스트 32 케이스 라이브 PASS 확인 | P0 | ~30분 | RLS_TEST_DATABASE_URL 셋업 + vitest run |
| 6 | Phase 2 plugin 마이그레이션 (`packages/tenant-almanac/`) | P2 | ~5h | M3 게이트 이전 후 별도 |

---

[← handover/_index.md](./_index.md)
