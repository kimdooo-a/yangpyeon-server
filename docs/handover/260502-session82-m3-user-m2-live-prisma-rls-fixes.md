# 인수인계서 — 세션 82 (M3 user 채널 wiring + M2 통합 라이브 활성화 + Prisma/RLS/timezone 4 latent bug fix)

> 작성일: 2026-05-02
> 이전 세션: [session81 (B7+B8 + Track C M2 + M3 SSE)](./260502-session81-aggregator-launch-messenger-m2-m3.md)
> 저널 원본: [journal-2026-05-02.md](../logs/journal-2026-05-02.md) §"세션 82"

---

## 작업 요약

세션 81 handover 의 6 후보 중 진행 가능 3 작업 모두 단일 conversation 압축 진행. **M3 user 채널 4 이벤트 wiring** + **M2 통합 테스트 32 케이스 라이브 활성화** (이때 Prisma extension + AbuseReport @map + Asia/Seoul timezone + 세션 67/80 fixture/test 4 latent bug 동시 노출/fix) + **M3 SSE wire format 자동 검증** + M4 PRD 확인 결과 5-7일 chunk 라 진입 안 함. 3 commits / +625 LOC / 17 파일.

## 대화 다이제스트

### 토픽 1: 다음작업 개시 — M3 user 채널 4 이벤트 wiring
> **사용자**: "다음작업 개시(기다려 여야하는 작업은 건너뛰고) ..."

세션 81 handover 의 "M3 user 채널 5 이벤트 wiring 남음" 진입. 베이스라인 검증 (`feedback_baseline_check_before_swarm` + `feedback_concurrent_terminal_overlap`) 시작 시 commit `1c28dd3 docs(s81): /cs 세션 종료` 가 다른 터미널에 의해 추가 발견 — commit 메시지가 "다른 터미널의 src/ 변경은 의도적 제외" 명시 → 양 터미널 동시성 룰 정상 작동, 충돌 0.

PRD api-surface §4.3 4 이벤트 spec 확인:
- `mention.received` payload `{messageId, conversationId, sender, snippet}`
- `dm.received` 동일 shape
- `report.resolved` `{reportId, action, note}`
- `block.created` `{blockId, blockedUserId}` — **blocker 본인 채널** (cross-device sync 목적, 차단당한 사람에게 노출 X = stalker risk 차단)

라이브러리 변경 (`src/lib/messenger/messages.ts`): `sendMessage` 반환에 `conversationKind` + `otherMemberId` 추가. helper 가 이미 conv kind + peer 를 query 하므로 반환 확장만으로 충분 (가장 비용 효율).

라우트 wiring 3 곳:
- `messages POST` → DM peer 에 `dm.received`, mention 각자에게 `mention.received`. `buildSnippet(body, kind)` 80자 컷 (TEXT 한정).
- `admin/reports/[id]/resolve POST` → reporter 에 `report.resolved`.
- `user-blocks POST` → blocker 본인에게 `block.created`.

**결론**: commit `152562d feat(messenger): M3 user 채널 wiring — mention/dm/report/block 4 이벤트 (+292 LOC)`. 검증: tsc 0 / vitest 525 pass / 회귀 0 / totp.test.ts AES-GCM tamper 플레이크는 base64 padding 한정 flip 으로 인한 pre-existing.

### 토픽 2: 남은 작업도 여기서 진행 — 3 잔여 동시 진행
> **사용자**: "남은 작업도 여기서 진행."

S81 6 후보 중 진행 가능 3건 동시 착수: A. M2 통합 라이브 활성화 / B. M3 SSE 라이브 검증 / C. M4 PRD 확인.

### 토픽 3: (A) M2 통합 테스트 라이브 활성화 — 4 latent bug 동시 노출

WSL postgres 의 `luckystyle4u_test` 신규 DB 셋업 → 첫 라이브 실행에서 67 fail / 25 pass. 4 함정 단계별 fix:

**(A.1) fixture/test 단순 버그**:
- `tenant_memberships_tenant_id_user_id_key` constraint 가 INDEX 형태 (CONSTRAINT 명 미실재) → `ON CONFLICT (tenant_id, user_id)` 컬럼 기반.
- `resetMessengerData` 가 files/folders 미정리 → users DELETE FK 차단 → mxtest-* pattern cascade cleanup 추가.
- `m2-integration.test.ts`: `message_receipts.lastReadAt` 미실재 (`@updatedAt` 자동), `notification_preferences.id`/`created_at` 미실재 (composite PK), `DUPLICATE_REPORT` regex → `toMatchObject({code})`.
- `messages.test.ts` 1초 margin → 5초 (TIMESTAMPTZ ms 절삭 안전).

**(A.2) schema 누락**:
- `prisma/schema.prisma` 의 `AbuseReport.targetKind` 가 `@map("target_kind")` 누락. Prisma 가 literal `targetKind` 컬럼 기대 / DB 는 snake_case → mismatch. **prod 미운영 라우트라 latent**. session 80 Track C M2 추가 시 누락된 채 머지된 흔적. `prisma generate` 재실행.

**(A.3) Prisma extension query escape — 가장 큰 발견**:
- `tenantPrismaFor`/`prismaWithTenant` 의 `$allOperations` 콜백 패턴: `basePrisma.$transaction` 으로 감싸 `tx.$executeRawUnsafe('SET LOCAL app.tenant_id = ...')` 적용 후 `query(args)` 호출.
- 실제 동작: Prisma extension 의 `query(args)` 는 우리가 연 tx connection 을 사용하지 않고 base client 의 새 connection 으로 escape → SET LOCAL 적용된 tx 와 실제 query 가 다른 conn → **RLS always-fail (0 rows)**.
- **prod 가 BYPASSRLS postgres superuser 사용해서 가려져 있던 latent bug**. 비-bypass role(`app_test_runtime`)로 테스트하는 첫 시도에서 노출.
- 수정: tx 안에서 `tx[modelCamel][operation](args)` 직접 호출. raw operation (`$executeRawUnsafe` 등)은 `args` array spread 로 tx 에 binding.

**(A.4) PrismaPg + Asia/Seoul timezone 함정**:
- 수정 후에도 `editMessage 15분 1초 경과 → EDIT_WINDOW_EXPIRED` 가 통과 (실제로는 throw 해야 함).
- 추적: admin pool (raw pg) 로 INSERT 한 createdAt = `2026-05-02T01:25:55.248Z` (UTC) 이 Prisma 로 read 시 `2026-05-02T10:25:55.248Z` 로 +9hr 시프트 (KST offset).
- 원인: WSL postgres session timezone = `Asia/Seoul`. PrismaPg adapter 가 TIMESTAMPTZ 의 `+09` offset 을 ignore 하고 local 시각을 UTC 로 mis-parse → 9시간 시프트.
- prod 환경에서는 read/write 양방향 동시 시프트라 cancel 되어 보이지 않으나, **admin pool (raw pg) 직접 INSERT + Prisma 읽기 혼용** 시 노출.
- 회피: `RLS_TEST_DATABASE_URL` 에 `?options=-c%20TimeZone%3DUTC` 추가.
- **prod 영향 가시화 follow-up 별도 필요** — rate-limit window / edit/recall window / session expiry 등 모든 timestamp 비교 로직에 잠재 영향.

**테스트 인프라 영구 정착**:
- `scripts/setup-test-db-role.sh` — `app_test_runtime` password 발급 + login 검증 (BYPASSRLS=false role).
- `scripts/run-integration-tests.sh` — bash 러너 (WSL→Win cross-OS env 손실 노트 포함).
- `.env.test.example` — 환경 변수 템플릿 (`.env.test.local` gitignored).
- WSL postgres `luckystyle4u_test` DB (38 tables + 30 RLS policies + role GRANTs, schema-only clone of prod).

**결론**: 메신저 92/92 PASS (m2-integration 32 + messages 12 + rls 13 + reports 11 + blocks 4 + conversations 4 + sse 13 + fixtures helper). 전체 vitest (env-gate 비활성) 525 pass + 91 skip — prod 경로 회귀 0. commit `8bef896 fix(messenger,db): M2 통합 테스트 32 라이브 PASS — Prisma extension + RLS 함정 4건 동시 fix` (+180 LOC, 8 파일).

### 토픽 4: (B) M3 SSE wire format 자동 검증
route.ts 의 인라인 SSE 형식 문자열을 `src/lib/messenger/sse.ts` 헬퍼로 추출:
- `encodeSseEvent(event, payload)` → `event: <name>\ndata: <json>\n\n`
- `encodeSseComment(text)` → `: <text>\n\n` (keepalive)

EventSource spec 준수 7 신규 테스트: wire format / nested payload / 한글·이모지 unescape / bus→encode 순서 보존 / **ReadableStream+TextEncoder 통합** (실제 chunk 디코딩 후 EventSource parser 시뮬레이션) / multiple subscribers 격리.

**결론**: commit `5449f9e test(messenger): M3 SSE wire format 자동 검증 + encodeSseEvent/Comment 헬퍼 추출 (+7 tests)`. 525→532 pass (+7), tsc 0.

### 토픽 5: (C) M4 PRD 확인 → 진입 안 함
> 사용자 message 의 "M4 push notification (web push subscribe)" 표현은 mis-naming.

PRD `docs/research/messenger/milestones.md` 확인 결과: messenger Phase 1 의 **M4 = UI 보드** (대화목록 + 채팅창 + composer, 5-7 작업일). M6 가 알림 (in-app SSE only, web push 없음 — Phase 1 에 Service Worker/VAPID 자체 미포함).

이번 세션 chunk 비현실 → 진입 안 함.

### 토픽 6: /cs 진입 — 모든 서버 종료 요청
> **사용자**: "모든 서버 종료하고 세션 종료 진행."

Windows 측 leftover node.exe 7개 (vitest workers, 09:55 시작) 종료 → count=0.

WSL PM2 3개 (cloudflared 6일 / seaweedfs 20h / ypserver 2h ↺=20) + pm2-logrotate 모듈 — 사전 운영 24/7 인프라, 종료 시 stylelucky4u.com OFF. 사용자 추가 확인 대기 중 /cs 사전 작업 진행.

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|-------------|----------|
| 1 | sendMessage 반환 확장 (conversationKind + otherMemberId) | (a) 반환 그대로 + 라우트가 별도 query, (b) helper 에 publish 통합 | helper 가 이미 conv kind + peer 를 query 중 — 반환 확장 0 추가 query. publish 는 route 에 두는 기존 패턴 유지 (audit 와 동일 위치) |
| 2 | block.created 가 차단당한 사람 X, blocker 본인 채널 | (a) 차단당한 사람에게도 publish, (b) blocker 만 (cross-device sync) | stalker risk 차단 — 차단됨을 모르는 게 안전. 동일 사용자 다중 디바이스 sync 목적은 본인 채널로 충분 (PRD §4.3) |
| 3 | snippet 80자 컷 + TEXT 한정 | (a) full body, (b) 50자, (c) 80자 + non-TEXT 빈 문자열 | toast/notif UI 표준 + 이미지/파일 첨부 메시지는 클라이언트가 placeholder 처리 |
| 4 | Prisma extension `query(args)` escape fix = tx[model][op] 직접 라우팅 | (a) SESSION 레벨 SET (pool 누수), (b) raw query 만 사용 (typed API 손실), (c) tx 직접 라우팅 | (c) 가 typed API 보존 + tx connection 보장. PascalCase→camelCase 변환만 추가 |
| 5 | RLS_TEST_DATABASE_URL 에 `?options=-c TimeZone=UTC` | (a) prod schema 변경, (b) Prisma adapter 패치, (c) connection-level UTC | (c) 가 격리 — prod 영향 0. prod 영향은 별도 follow-up |
| 6 | M4 진입 안 함 | (a) 진입 시도, (b) 다음 세션으로 | UI 보드 5-7일 chunk 는 단일 세션 비현실. PRD 확인이 결정 근거 |
| 7 | PM2 3개는 사용자 확인 대기 | (a) 즉시 종료, (b) 확인 대기 | 외부 도메인 OFF 위험 — 파괴적 행동, memory `feedback_autonomy` 의 "파괴적만 예외" 적용 |

## 수정 파일 (17개, 3 commits 총합)

### commit 152562d (M3 user 채널, 6 파일 +292 LOC)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/messenger/messages.ts` | sendMessage 반환에 conversationKind + otherMemberId 추가 (+57/-16) |
| 2 | `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/messages/route.ts` | dm.received + mention.received publish + buildSnippet 헬퍼 (+39) |
| 3 | `src/app/api/v1/t/[tenant]/messenger/admin/reports/[id]/resolve/route.ts` | report.resolved publish (+14) |
| 4 | `src/app/api/v1/t/[tenant]/messenger/user-blocks/route.ts` | block.created publish (+9) |
| 5 | `tests/messenger/sse.test.ts` | 4 user-channel PRD payload 계약 + cross-tenant 격리 (+116) |
| 6 | `tests/messenger/messages.test.ts` | sendMessage DIRECT/GROUP 반환 분기 검증 2 케이스 env-gated (+73) |

### commit 8bef896 (M2 라이브 활성화 + 4 latent fix, 8 파일 +180/-26)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/schema.prisma` | AbuseReport.targetKind 에 @map("target_kind") (+1/-1) |
| 2 | `src/lib/db/prisma-tenant-client.ts` | tenantPrismaFor + prismaWithTenant extension query 라우팅 (tx 직접 호출) (+76/-15) |
| 3 | `tests/messenger/_fixtures.ts` | ON CONFLICT 컬럼 기반 + files/folders cascade cleanup (+13/-2) |
| 4 | `tests/messenger/m2-integration.test.ts` | lastReadAt/id/created_at/DUPLICATE_REPORT 4 fix (+19/-26) |
| 5 | `tests/messenger/messages.test.ts` | 시간 margin 1s→5s (+6/-2) |
| 6 | `.env.test.example` | 신규 — 환경 변수 템플릿 |
| 7 | `scripts/setup-test-db-role.sh` | 신규 — app_test_runtime password 발급 |
| 8 | `scripts/run-integration-tests.sh` | 신규 — bash 러너 + WSL→Win cross-OS env 노트 |

### commit 5449f9e (M3 SSE wire format, 3 파일 +153/-6)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/messenger/sse.ts` | encodeSseEvent + encodeSseComment 헬퍼 추출 (+15) |
| 2 | `src/app/api/v1/t/[tenant]/messenger/conversations/[id]/events/route.ts` | 인라인 형식 → 헬퍼 사용 (+5/-3) |
| 3 | `tests/messenger/sse.test.ts` | wire format 4 + ReadableStream+TextEncoder 통합 1 + multiple subscribers 1 + 한글 보존 1 (+139) |

## 검증 결과
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` (env-gate 비활성, prod 경로) — **532 pass / 91 skip / 0 fail**
- `bash scripts/run-integration-tests.sh` (env-gate 활성, 메신저 라이브) — **92/92 PASS**
- 5-run 안정성: 4/5 깔끔, 1/5 totp.test.ts AES-GCM tamper 플레이크 (pre-existing, base64 padding 한정 flip)

## 터치하지 않은 영역
- M4 UI 보드 (별도 5-7 작업일)
- Phase 2 plugin 마이그레이션 (`packages/tenant-almanac/`)
- 24h 윈도우 후 60 소스 점진 확장 (대기 — `b8-activate.ts` 패턴 재사용)
- anthropic-news RSS URL 갱신 (외부 사이트)
- WSL PM2 3개 (cloudflared/seaweedfs/ypserver) — 사용자 추가 확인 대기

## 알려진 이슈

1. **PrismaPg + Asia/Seoul timezone +9hr 시프트** — `~/ypserver/.env` 의 prod DATABASE_URL 에도 `?options=-c TimeZone=UTC` 추가 검토 필요. 현재는 read/write 양방향 cancel 로 가려져 있으나 cron 작업 / external API timestamp 비교 / scheduled task 시점 계산 등에 잠재 영향. **별도 spec 필요 (P1)**.
2. **totp.test.ts AES-GCM tamper 플레이크** — `src/lib/mfa/totp.test.ts` 의 `변조된 ciphertext 를 거부한다 (GCM auth tag)` 테스트가 base64 마지막 char flip 패턴이라 padding bits 한정 flip 시 실제 byte 변화 없음 → ~20% 확률 통과. 별도 fix 필요 (decoded buffer 의 중간 byte flip 으로 변경).
3. **Prisma `query(args)` escape 패턴** — 본 세션 fix 적용. 향후 Prisma 7 업그레이드 시 동작 회귀 가능성 (Prisma 가 query 콜백 binding 을 변경하면 우리 fix 가 깨질 수 있음). vitest run 에서 자동 감지 가능.

## 다음 작업 제안 (S83+)

| # | 작업 | 우선 | 소요 | 비고 |
|---|------|------|------|------|
| 1 | prod PrismaPg timezone 시프트 가시화 + 영향 분석 | P1 | ~2h | rate-limit/edit/recall/session 비교 로직 audit |
| 2 | 24h+ 관찰 후 60 소스 점진 확장 (5씩) | P0 | ~30분 × N회 | b8-activate.ts 패턴 (대기 후) |
| 3 | M4 UI 보드 진입 (대화목록 + 채팅창 + composer) | P0 | 5-7 작업일 | 별도 세션 chunk |
| 4 | M5 첨부 + 답장 + 멘션 + 검색 | P1 | 3-4 작업일 | M4 후속 |
| 5 | M6 알림 + 차단/신고 + 운영자 패널 + 보안 리뷰 | P1 | 3-4 작업일 | M5 후속, kdysharpedge 통합 |
| 6 | totp.test.ts flake 수정 | P2 | ~30분 | decoded buffer middle byte flip |
| 7 | Phase 2 plugin 마이그레이션 (`packages/tenant-almanac/`) | P2 | ~5h | M3 게이트 통과 후 |
| 8 | anthropic-news RSS URL 갱신 또는 제거 | P1 | ~10분 | 외부 사이트 측 변경 |

---

## 세션 82 후속 (/cs 2차) — CLAUDE.md PM2 운영 서버 룰 명문화

> **사용자**: "claude.md에 명시. pm2 운영서버는 명시적으로 pm2 운영서버 종료를 명령하기 전까지 계속 업데이트, 운영해야되어야한다. 세션 안에서의 서버 종료는 해당 세션에서 기동한 서버에 한한다."

직전 /cs 1차 완료 시점에 PM2 4개 (cloudflared/seaweedfs/ypserver/pm2-logrotate) 보존 + 사용자 추가 확인 대기 상태. 사용자가 광범위 표현 ("모든 서버 종료") 의 적용 범위를 영구 명문화 지시.

**산출 (commit `04e441b`)**:
- `CLAUDE.md` §"PM2 운영 서버 — 임의 종료 절대 금지 규칙" 신설 (16줄): PM2 등록 프로세스는 명시적 종료 지시 전까지 절대 정지 X / "모든 서버 종료" = 세션 기동분 한정 / 명시적 종료 명령 시 영향 범위 1줄 보고 + 확인 / 코드 변경 운영 적용은 정지가 아닌 재배포.
- `memory/feedback_pm2_servers_no_stop.md` 신규 — 광범위 표현 매핑표 + 명시적 정지 명령 처리 절차.
- `MEMORY.md` 인덱스 업데이트.

향후 모든 세션 자동 인지 — 외부 stylelucky4u.com 24/7 운영 보호.

---

[← handover/_index.md](./_index.md)
