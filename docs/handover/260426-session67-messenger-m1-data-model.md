# 인수인계서 — 세션 67 (메신저 Phase 1 M1 — 데이터 모델 + RLS + 6 마이그)

> 작성일: 2026-04-26
> 이전 세션: [session66 (aggregator Day 1)](./260426-session65-deploy-filebox-standalone.md)
> 저널: [journal-2026-04-26.md](../logs/journal-2026-04-26.md) (세션 67 토픽 3건)

---

## 작업 요약

세션 64 ADR-030 ACCEPTED + 메신저 PRD 18 섹션 후속의 첫 코드 산출 세션. 사용자 "다음 작업 진행" 자율 채택으로 2 단계 순차 수행:
1. **M0.3 kdyspike #1** — PG NOTIFY + SSE 정합성 PoC (마이크로 스파이크 30분, 조사 기반). 검증 항목 3가지(NOTIFY 8KB / Cloudflare 100초 idle / 다중 채널 LISTEN connection 누수) 모두 답안 도출. Conditional Go — Phase 1 in-memory bus 유지, Phase 2 진입 시 ADR-031 작성 + POC 5건 측정 필수.
2. **M1 (W1) 데이터 모델** — milestones.md 정의 그대로 prisma 9 model + 6 enum 신설 + User backref 9개 추가. **6 마이그 작성·Claude 직접 deploy 적용**(20260501000000~20260501050000). RLS 9 테이블 enabled+force, tenant_isolation 정책 9건. RLS 단위 테스트 신설(env-gated 13 case).

검증 5/5 PASS — `prisma migrate status` up to date(28 마이그) / `prisma generate` ok / `tsc --noEmit` 0 errors / `vitest tests/messenger/` 13 skipped(env 기본값) / RLS self-check 마이그 #6에서 raise exception 미발생.

본 세션 변경 14 파일 (스키마 1 + 마이그 6 + 테스트 1 + spike 1 + clearance 1 + journal/logs/handover/index/next-dev-prompt 5).

## 대화 다이제스트

### 토픽 1: M0.3 kdyspike #1 — PG NOTIFY + SSE 정합성 PoC (30분)

> **사용자**: "다음 작업 진행"

세션 66 종료 직후 메신저 트랙 진입. milestones.md M0.3 정의(30분 마이크로 스파이크) 충족하는 형태로 kdyspike 스킬 호출 + 3 web search.

**검증 항목 3건과 결정**:

| Q | 발견 | 결정 |
|---|------|------|
| Q1 NOTIFY 8KB 한계 | hard limit 8000B (재구성 불가) — Socket.IO PG adapter / Rails ActionCable 모두 메타-only 패턴 채택 | ✅ `{convId, messageId, kind, senderId}` ~200B (한계의 2.5%) 메타-only NOTIFY |
| Q2 Cloudflare 100초 idle | Free/Pro 100초 timeout 확정 (524 error). 기존 spike-002에서 해소됨 | ✅ 30초 keepalive + last-event-id 재연결 (M3 적용) |
| Q3 다중 채널 LISTEN | LISTEN connection-affixed → pool 사용 불가. PgBouncer transaction pool 비호환. notification queue 누적 위험 | ✅ 단일 listener connection + tenant 단위 channel grouping (`messenger:tenant:default`) — 1인 운영 N=20 = 20 채널 |

**Phase 2 진입 시 POC 필수 5건** 명문화 (spike 문서 §6): NOTIFY→SSE p95 < 50ms / listener 24h 안정성 / PM2 cluster:4 LISTEN fork 분리 / queue 80% 알람 / PgBouncer session pool 분리.

**ADR-031은 의도적 보류** — milestones M0.3 명시대로 Phase 2 진입 시 작성 (spike 문서가 입력 자료). spike 문서 §8에 ADR-031 골자 사전 작성.

**산출물**:
- `docs/research/spikes/spike-006-pg-notify-sse.md` (신규, 10 섹션)
- `docs/research/_SPIKE_CLEARANCE.md` (1 행 추가)

**결론**: Conditional Go — Phase 1 영향 0(in-memory bus 그대로), Phase 2 진입 게이트로 보존.

### 토픽 2: M1 (W1) 데이터 모델 — 6 마이그 + RLS + 테스트 (4-5h 압축)

> **사용자**: "진행."

milestones.md M1 정의(5 작업일) 압축 수행. 9 task 분해 + 순차 진행.

**1단계 — schema.prisma 편집** (단일 파일, 30분):
- 6 enum 추가: `ConversationKind / ConversationMemberRole / MessageKind / AttachmentKind / AbuseReportStatus / AbuseReportTargetKind`
- 9 model 추가: `Conversation / ConversationMember / Message / MessageAttachment / MessageMention / MessageReceipt / UserBlock / AbuseReport / NotificationPreference`
- User에 backref 9개 추가 (UserBlock 2 + AbuseReport 2 포함)
- **trap 1 발견·즉시 정정** — `NotificationPreference @@id([tenantId, userId])` 복합 PK는 1:1 관계 보장 안 됨 (Prisma validate가 P1012 raise). `userId @unique` 추가로 해소. CK +1 후보 (다음 섹션).

PushSubscription/Notification(데이터모델 §2.10/2.11 Phase 1.5)는 M6에서 추가하기로 보류 — milestones M1 정확히 9 모델 + 6 마이그.

**2단계 — 6 마이그 SQL 작성·적용** (각 5-15분):

| 마이그 | 내용 | 결과 |
|---|---|---|
| #1 `20260501000000_messenger_phase1_enums` | CREATE TYPE × 6 | ✓ |
| #2 `20260501010000_messenger_phase1_conversations` | conversations + conversation_members 2 테이블, last_read_message_id FK 보류 | ✓ |
| #3 `20260501020000_messenger_phase1_messages` | messages + 부속 3, last_read_message_id FK 후행 추가 | ✓ |
| #4 `20260501030000_messenger_phase1_safety` | user_blocks + abuse_reports + notification_preferences | ✓ |
| #5 `20260501040000_messenger_phase1_indexes_partial` | pg_trgm extension + messages_active_idx + messages_search_gin | ✓ |
| #6 `20260501050000_messenger_phase1_grants` | RLS 9 테이블 ENABLE/FORCE + tenant_isolation 정책 + 명시 GRANT + self-check raise exception | ✓ |

각 마이그 핵심 패턴:
- `gen_random_uuid()` for id default (sticky_notes 패턴)
- `COALESCE((current_setting('app.tenant_id', true))::uuid, '00000000-...000'::uuid)` for tenant_id default (20260428100000 fix 패턴, missing_ok 보장)
- `now()` for created_at/updated_at default (CURRENT_TIMESTAMP 대신, 기존 컨벤션 일치)
- 마이그 #6 self-check가 RAISE EXCEPTION으로 RLS 9 테이블 enable+force + 9 policy 검증 → 미충족 시 마이그 자동 rollback

**trap 2 발견** — WSL bash에서 `npx` 실행 시 `/mnt/c/Program Files/nodejs/npx`(Windows Node) 호출 → UNC 경로 변환 실패로 CMD가 invoked. 우회: localhost:5432가 WSL postgres와 양방향 호환이므로 **Windows 측 `npx prisma migrate deploy` 직접 호출**로 해결.

**3단계 — Prisma generate + tsc + RLS 검증** (10분):
- `npx prisma generate` ✓ (src/generated/prisma 갱신)
- `npx tsc --noEmit` 0 errors
- WSL psql 직접 검증: 9 테이블 모두 `relrowsecurity=t, relforcerowsecurity=t`
- `npx prisma migrate status` Database schema is up to date

**4단계 — RLS 단위 테스트 신설** (30분):
- `tests/messenger/rls.test.ts` (env-gated, cross-tenant-leak.test.ts 패턴 답습)
- 13 case (M1 SELECT, M2 UPDATE, M3 INSERT WITH CHECK, M4 미설정 0 row, M5×9 모델 cross-tenant leak 0)
- bootstrap: tenant_a/b conversations + messages 시드 (RLS BYPASS admin pool)
- `RLS_TEST_DATABASE_URL` 미설정 시 모두 skip (default 동작)
- **trap 3** — adminPool 타입이 `any`라 `query<T>` generic args 미허용 → row 결과를 `as Row[]` 명시 캐스트로 해소

**산출물**:
- `prisma/schema.prisma` (+6 enum, +9 model, +9 User backref, +`userId @unique` for NotificationPreference)
- `prisma/migrations/20260501{000000~050000}_*/migration.sql` × 6
- `tests/messenger/rls.test.ts` (신규, 280줄)

**결론**: M1 (W1) 데이터 모델 layer 완료. M2 (W2) API CRUD + 멱등성 + 권한 진입 가능.

### 토픽 3: M2 작업 범위 안내 + 세션 종료

> **사용자**: "m2는 무슨 작업을 하는거야?"

milestones.md M2 정의 + api-surface.md / data-model.md 결합 요약 답변. 핵심 분해:
- 도메인 헬퍼 4개 (`src/lib/messenger/{conversations,messages,blocks,reports}.ts`)
- Zod 스키마 (`src/lib/schemas/messenger/`)
- API 라우트 19개 (`src/app/api/v1/conversations/**`, `/api/v1/messages/search`, `/api/v1/{user-blocks,abuse-reports,notification-preferences}/**`, `/api/v1/admin/messenger/**`)
- 통합 테스트 시나리오 7건 (DM 페어 멱등 / clientGeneratedId 중복 / cross-tenant 침투 / 차단 송신 / 편집 한도 / 회수 한도 / 그룹 인원 한도)
- audit 5종 발화 (`message_sent`, `member_added/removed`, `message_edited/deleted`)
- 머지 게이트 5건 (테스트 통과, 커버리지 80%+, 멱등성 동시성 시뮬, tsc/eslint 0, audit 발화)

5-6 작업일. M3 (SSE 실시간) 진입 전 백본 layer 완성. 세션 단위로는 보통 2-3 세션 분할 권장.

> **사용자**: "/cs"

세션 종료.

## 의사결정 요약

| # | 결정 | 검토 대안 | 선택 이유 |
|---|------|-----------|----------|
| 1 | M0.3 spike를 30분 마이크로 트랙으로 진행 | 풀 spike (실험 코드 포함) | milestones 정의 명시 + Phase 2 측정은 별도 POC로 분리 |
| 2 | ADR-031 보류 (Phase 2 진입 시 작성) | 즉시 ADR-031 ACCEPTED | milestones M0.3 정의(input 자료 보존), Phase 1 영향 0 |
| 3 | NotificationPreference `userId @unique` 추가 | (tenantId, userId) 복합 PK만으로 충분하다고 가정 | Prisma validate P1012로 강제 — User tenant-scoped이므로 글로벌 unique 안전 |
| 4 | last_read_message_id FK를 #2가 아닌 #3에서 ALTER ADD | #2와 #3 통합 단일 마이그 | 마이그 분할 의의(독립 적용 가능성) 보존, milestones 6 마이그 정확 일치 |
| 5 | tenant_id default를 COALESCE(missing_ok=true, fallback)로 작성 | sticky_notes처럼 단순 `(current_setting(...))::uuid` | 20260428100000 fix가 이미 모든 기존 테이블에 COALESCE 적용 — 신규 테이블도 처음부터 같은 패턴이 정합 |
| 6 | 마이그 적용을 Windows 측 `npx prisma migrate deploy`로 수행 | WSL bash에서 wsl-build-deploy.sh 호출 | WSL `npx`가 Windows Node를 가리켜 UNC 변환 실패. localhost:5432가 양방향 호환이라 Windows 측 직접 호출이 단순 |
| 7 | PushSubscription/Notification (data-model §2.10/2.11) 보류 | 11 모델 모두 추가 | milestones M1 정의는 9 코어 + 6 마이그 — Phase 1.5 모델은 M6에서 별도 마이그 |
| 8 | RLS 단위 테스트는 별도 파일(tests/messenger/rls.test.ts) | 기존 tests/rls/cross-tenant-leak.test.ts에 messenger 모델 추가 | milestones 정의(`tests/messenger/rls.test.ts`) 명시 + 도메인 분리 |

## 수정 파일 (14개)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `prisma/schema.prisma` | M — 6 enum + 9 model + 9 User backref + `userId @unique` |
| 2 | `prisma/migrations/20260501000000_messenger_phase1_enums/migration.sql` | + 6 CREATE TYPE |
| 3 | `prisma/migrations/20260501010000_messenger_phase1_conversations/migration.sql` | + conversations(8 col + 4 idx) + conversation_members(10 col + 3 idx + 2 FK) |
| 4 | `prisma/migrations/20260501020000_messenger_phase1_messages/migration.sql` | + messages(13 col + 3 idx + 3 FK) + 보류 FK 추가 + 부속 3 테이블 + file_id RESTRICT FK |
| 5 | `prisma/migrations/20260501030000_messenger_phase1_safety/migration.sql` | + 3 테이블 + UNIQUE 2건 |
| 6 | `prisma/migrations/20260501040000_messenger_phase1_indexes_partial/migration.sql` | + pg_trgm + 2 partial idx |
| 7 | `prisma/migrations/20260501050000_messenger_phase1_grants/migration.sql` | + RLS 9 테이블 + GRANT + self-check raise exception |
| 8 | `tests/messenger/rls.test.ts` | + 13 case env-gated |
| 9 | `docs/research/spikes/spike-006-pg-notify-sse.md` | + 10 섹션 spike doc |
| 10 | `docs/research/_SPIKE_CLEARANCE.md` | + 1 행 (SP-006) |
| 11 | `docs/logs/journal-2026-04-26.md` | + 세션 67 (3 토픽) |
| 12 | `docs/logs/2026-04.md` | + 세션 67 상세 |
| 13 | `docs/handover/_index.md` | + 세션 67 행 |
| 14 | `docs/handover/next-dev-prompt.md` | 세션 68 진입용 전면 갱신 |
| 15 | `docs/status/current.md` | + 세션 67 행 + 최종 수정 |
| 16 | `docs/handover/260426-session67-messenger-m1-data-model.md` | 본 파일 (신규) |
| 17 | `docs/solutions/2026-04-26-prisma-1to1-with-composite-pk.md` | + CK 신규 |

## 상세 변경 사항

### 1. spike-006 — PG NOTIFY + SSE 정합성

조사 기반 마이크로 스파이크. 3 web search + 기존 spike-002 cross-reference. 핵심 패턴 4가지 명문화:
- 메타-only NOTIFY (`pg_notify('messenger:conv:'||id, json_build_object(...)::text)`)
- 30초 SSE keepalive + last-event-id 재연결
- 단일 listener connection (autocommit, persistent)
- Tenant 단위 channel grouping (`messenger:tenant:<id>`)

ADR-031 골자(§8)와 Phase 2 POC 5건 측정 항목(§6) 사전 명문화 — Phase 2 진입 시 즉시 활용 가능.

### 2. schema.prisma 변경

User 모델 backref 9개 (line 103 다음에 삽입):
```prisma
conversationsCreated    Conversation[]          @relation("ConversationCreatedBy")
conversationMemberships ConversationMember[]    @relation("ConversationMembership")
messagesSent            Message[]               @relation("MessageSender")
mentionsReceived        MessageMention[]        @relation("UserMentioned")
blockedByMe             UserBlock[]             @relation("UserBlocker")
blockedMe               UserBlock[]             @relation("UserBlocked")
abuseReportsFiled       AbuseReport[]           @relation("AbuseReportReporter")
abuseReportsResolved    AbuseReport[]           @relation("AbuseReportResolver")
notificationPreference  NotificationPreference? @relation("UserNotifPref")
```

Sticky Notes 섹션 다음에 messenger 섹션 신설 (sticky_notes:843 → messenger:845~). data-model.md §2.1-2.9 정확 복사. 9 model의 dbgenerated default + tenant_id 첫 컬럼 + @@map snake_case + @db.Uuid/Timestamptz(3)/Text 컨벤션.

### 3. 마이그 #1~#6 패턴 요약

**의존성 사슬**: #1 enum → #2 conversations → #3 messages (last_read_message_id FK 추가) → #4 safety (독립) → #5 partial idx + GIN trgm → #6 RLS + GRANT.

**일관 패턴**:
- `id UUID NOT NULL DEFAULT gen_random_uuid()` (sticky_notes 패턴)
- `tenant_id UUID NOT NULL DEFAULT COALESCE((current_setting('app.tenant_id', true))::uuid, '00000000-0000-0000-0000-000000000000'::uuid)` (20260428100000 fix 패턴)
- `created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()`
- 인덱스 명: `<table>_<col1>_<col2>_<col3>_idx` (Prisma 컨벤션)
- UNIQUE: `<table>_<col1>_<col2>_key` (Prisma 컨벤션)

**마이그 #6 self-check 패턴** (신규 — 향후 RLS 마이그에 표준화 검토):
```sql
DO $$
DECLARE rls_count INT;
BEGIN
    SELECT count(*) INTO rls_count FROM pg_class
    WHERE relname IN (...) AND relrowsecurity = true AND relforcerowsecurity = true;
    IF rls_count <> 9 THEN
        RAISE EXCEPTION 'RLS 검증 실패: 9 테이블 중 % 만 enabled+force', rls_count;
    END IF;
    -- ... 9 policy 동일 체크
END $$;
```

미적용 시 `_prisma_migrations.applied_steps_count`가 0으로 남고 마이그가 자동 실패 → safe.

### 4. tests/messenger/rls.test.ts

기존 `tests/rls/cross-tenant-leak.test.ts` 패턴 답습:
- env-gated (`HAS_DB = !!process.env.RLS_TEST_DATABASE_URL && !!process.env.RLS_TEST_ADMIN_DATABASE_URL`)
- 모든 it가 `it.skipIf(!HAS_DB)`
- bootstrap: BYPASSRLS admin pool로 tenant_a/b 시드
- reseed: 매 it 전 messages + conversations + users tenant_a/b 1쌍씩

13 케이스: M1(SELECT) / M2(UPDATE) / M3(INSERT WITH CHECK throw) / M4(미설정 0 row) / M5×9 (각 메신저 모델 leak 0).

실증 시 사용 (선택):
```bash
RLS_TEST_DATABASE_URL="postgresql://app_runtime:..." \
RLS_TEST_ADMIN_DATABASE_URL="postgresql://postgres:..." \
npx vitest tests/messenger/
```

## 검증 결과

| 검증 | 결과 |
|------|------|
| `npx prisma validate` | ✓ valid |
| `npx prisma migrate status` | ✓ up to date (28 마이그) |
| `npx prisma migrate deploy` | ✓ 6 신규 마이그 모두 적용 |
| `npx prisma generate` | ✓ Prisma Client 7.7.0 (`src/generated/prisma`) |
| `npx tsc --noEmit` | ✓ 0 errors |
| `npx vitest run tests/messenger/` | ✓ 13 skipped (env-gated, default behavior) |
| WSL psql RLS 검증 | ✓ 9 테이블 모두 `relrowsecurity=t, relforcerowsecurity=t` |
| 마이그 #6 self-check | ✓ RAISE EXCEPTION 미발생 (9 테이블 + 9 정책) |

머지 게이트 정합 (milestones M1):
- ☑ 6개 마이그 모두 적용 + RLS 검증 쿼리 통과
- ☑ RLS 단위 테스트 통과 (vitest, env-gated)
- ☑ `npx tsc --noEmit` 0 errors
- ☐ `npx eslint src/lib/messenger` 0 errors — M2 시작 시 (현재 src/lib/messenger 미존재)

## 터치하지 않은 영역

- **메신저 Phase 1.5 모델** — `PushSubscription`, `Notification` (data-model §2.10/2.11). M6에서 추가
- **메신저 Phase 2 모델** — `MessageReaction`, `MessageBookmark` (data-model §3.1/3.2). Phase 2 plugin 마이그
- **src/lib/messenger/ 디렉토리** — M2 시작 시 신설 예정
- **src/app/api/v1/conversations/** — M2 라우트 19개
- **세션 64-66의 untracked 영역** — `src/app/(protected)/notes/`, `src/components/sticky-notes/`, `prisma/seeds/`, `src/app/api/v1/t/[tenant]/categories/`, `docs/assets/yangpyeon-aggregator-spec/` modifications, `docs/handover/260426-almanac-tenant-integration.md` 등은 본 세션과 무관 — 기존 작업 범위 보존
- **운영 배포** — 메신저는 아직 코드(라우트/UI) 없음, 배포 의미 없음. 데이터 layer만 production DB에 적용됨

## 알려진 이슈

- **WSL bash에서 `npx` 직접 호출 시 UNC 경로 변환 실패** — Windows Node가 /mnt/c/에서 노출되어 발생. 우회: Windows 측 `npx` 직접 호출. 향후 WSL 네이티브 Node 설치 시 해소 가능 (보류).
- **RLS 단위 테스트 미실증** — env 미설정으로 모두 skip. 실증은 별도 세션 + app_runtime DATABASE_URL 설정 필요. 마이그 #6 self-check가 1차 안전망 역할.
- **세션 64-66의 untracked 파일 다수 미커밋 상태** — 본 세션 commit은 메신저 M1만 포함. untracked 파일은 향후 별도 작업으로 정리 필요.

## 다음 작업 제안

### P0 — 메신저 Phase 1 M2 (W2) — 5-6 작업일

API CRUD + 멱등성 + 권한 + audit 5종 + 통합 테스트 80%+. 분해:
1. `src/lib/messenger/{conversations,messages,blocks,reports}.ts` 도메인 헬퍼 (DM 페어 멱등 / clientGeneratedId UNIQUE 위반 mapping / 양방향 차단 / UNIQUE 신고)
2. `src/lib/schemas/messenger/` Zod 스키마
3. 19 API 라우트 (`api-surface.md` §2 정확 구현)
4. vitest 통합 테스트 (실제 DB) — 7 시나리오 (멱등 / 중복 / cross-tenant / 차단 / 편집 한도 / 회수 한도 / 그룹 한도)
5. `audit_logs` 5종 발화 (message_sent / member_added / member_removed / message_edited / message_deleted)

세션 단위 분할 권장: (a) conversations + messages 도메인 + 핵심 라우트 11개 / (b) members/blocks/reports + 운영자 패널 + 테스트 마무리.

### P1 — packages/tenant-almanac/ plugin 마이그레이션 (T2.5, ~28h)

세션 66에서 aggregator Day 1 시작 (categories 1 라우트 + 시드). 잔여 4 endpoint(contents / sources / today-top / items/[slug]) + API 키 발급 + manifest 도입.

근거: `docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md`

### P2 — 운영 부채

- 세션 64-66 untracked 파일 별도 정리 commit (sticky-notes / messenger 64 PRD / aggregator Day 1)
- filebox-db.ts 패턴 4 마이그레이션 (4h)
- `/logs?_rsc=dy0du` 404
- 03:00 KST cron 검증 (S56 이월)

### P3 — Phase 2 메신저 plugin 분리 (DAU 30+ 시 트리거)

ADR-031 작성 (spike-006 §8 골자 + Phase 2 POC 5건 결과) → packages/tenant-messenger/ → 코드 이동 + manifest + plugin import wrapper.

---
[← handover/_index.md](./_index.md)
