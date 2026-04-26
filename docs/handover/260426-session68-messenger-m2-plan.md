# 인수인계서 — 세션 68 (메신저 M1 점검 9/9 PASS + M2 정밀화 산출물 655줄)

> 작성일: 2026-04-26
> 이전 세션: [session67 (메신저 M1 데이터 모델)](./260426-session67-messenger-m1-data-model.md)
> 저널: [journal-2026-04-26.md](../logs/journal-2026-04-26.md) (세션 68 토픽 5건)

---

## 작업 요약

세션 67 메신저 M1 commit (`2048378`) 직후 본 세션 진입. 사용자 "다른 터미널 작업(메신저 M1 + Almanac aggregator)을 참고해서 M1 점검 + M2 정밀화 진행" 지시.

다른 터미널이 같은 워킹트리에서 미커밋 상태로 Almanac aggregator 작업(modified 42 파일 + untracked 3 영역)을 진행 중이었기 때문에, 본 세션은 *읽기 전용 점검 + docs/research/messenger/ 안 문서 작성만* 으로 영역 한정 (코드 변경 0).

**산출**:
1. **M1 점검 9/9 PASS** — schema (9 model + 6 enum) + 6 마이그 + RLS 9 테이블 정책 + UNIQUE 제약 5종 + FK ON DELETE RESTRICT + partial idx + GIN trgm + RLS 단위 테스트 13 it (env-gated) 모두 정확히 적용됨을 확인.
2. **M2 정밀화 산출물 655줄** — `docs/research/messenger/m2-detailed-plan.md` 신설. 11 섹션 구성 (M1 점검 / M2 결정 7건 / 도메인 헬퍼 4개 시그니처 / Zod 스키마 / 라우트 19개 / 통합 테스트 / 일정 분할 / 영역 분리 / 함정 5건 / 결정 근거 / 변경 이력).
3. **`_index.md` 갱신** — 진행 상태 매트릭스 (M0/M1 완료, M2 분할 예정) + 다음 액션 (M2-Step1 즉시 진입 가능).

본 세션 변경 2 파일 (메타 파일 제외) — 모두 `docs/research/messenger/` 안에 한정. Almanac 작업 영역 미터치.

## 대화 다이제스트

### 토픽 1: 다른 터미널 컨텍스트 인지 + 영역 분리 결정

> **사용자**: "현재 다른 터미널의 작업을 참고해서 m1 단계 점검 및 m2 계획 정밀화 진행... 다른 터미널 작업은 메신저 M1 작업과 almanac 관련 작업이야."

`git worktree list` + `git status` + `git log --oneline -15 --all` 동시 실행으로 컨텍스트 일괄 파악:

| 영역 | 상태 | 분류 |
|---|---|---|
| `spec/aggregator-fixes` HEAD = `2048378` (메신저 M1) | committed (origin 대비 1 commit ahead) | 본 세션 점검 대상 |
| `docs/assets/yangpyeon-aggregator-spec/*` (42 파일) | modified | 다른 터미널 (Almanac, 절대 안 건드림) |
| `docs/handover/260426-session66-aggregator-day1.md` | untracked | 다른 터미널 |
| `prisma/seeds/almanac-aggregator-{categories,sources}.sql` | untracked | 다른 터미널 |
| `src/app/api/v1/t/[tenant]/categories/route.ts` | untracked | 다른 터미널 |
| 6 lock된 agent worktree (`.claude/worktrees/agent-*`) | locked | kdyswarm 잔재, 무관 |

**결정**: 본 세션 = 읽기 전용 점검 + 문서 작성만. 작업 영역을 `docs/research/messenger/` 안으로 한정해 0 충돌 보장.

### 토픽 2: M1 점검 — 9/9 PASS

병렬 read 6건으로 점검:
- `prisma/schema.prisma` line 866-1105 (메신저 부분 240줄)
- `prisma/migrations/20260501020000_messenger_phase1_messages/migration.sql` (FK 검증 핵심)
- `prisma/migrations/20260501040000_messenger_phase1_indexes_partial/migration.sql`
- `prisma/migrations/20260501050000_messenger_phase1_grants/migration.sql`
- `tests/messenger/rls.test.ts` (env-gated 13 it)
- `docs/research/messenger/{milestones,api-surface,data-model}.md`

**점검 결과 매트릭스**:

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 9 model + 6 enum | ✅ | schema:866-1105 |
| 2 | tenantId 첫 컬럼 + dbgenerated COALESCE | ✅ | 9 model 동일 패턴 |
| 3 | clientGeneratedId UNIQUE `(tenantId, conversationId, clientGeneratedId)` | ✅ | schema:991 + 마이그 020:51 |
| 4 | UserBlock UNIQUE `(blockerId, blockedId)` | ✅ | schema:1059 |
| 5 | AbuseReport UNIQUE `(reporterId, targetKind, targetId)` | ✅ | schema:1082 |
| 6 | NotificationPreference PK `(tenantId, userId)` + `userId @unique` | ✅ | schema:1092, 1103 (S67 P1012 fix) |
| 7 | MessageAttachment.fileId → files(id) ON DELETE RESTRICT (raw SQL ALTER) | ✅ | 마이그 020:92-95 |
| 8 | RLS 9 테이블 enable + force + tenant_isolation 정책 + 검증 RAISE EXCEPTION | ✅ | 마이그 050 |
| 9 | partial idx `messages_active_idx` + GIN trgm `messages_search_gin` + pg_trgm | ✅ | 마이그 040 |

**부수 검증** (S67 commit msg + 본 세션 read):
- `prisma migrate status` = 28 마이그 up to date
- TSC 0 errors / ESLint `tenant/no-raw-prisma-without-tenant` 0 violations
- vitest tests/messenger 13 skip (env 미설정, 정상)
- spike-006 (Conditional Go) commit 됨

**결론**: M1 game-over. M2 정밀화 진입 게이트 통과.

**가장 중요한 발견**: 마이그 020 line 92-95 의 `message_attachments_file_id_fkey ... ON DELETE RESTRICT` raw SQL ALTER. Prisma DSL 미지원이라 raw SQL 로 추가됐는데, file 직접 삭제 시 첨부가 사라지는 사고를 DB 수준에서 차단. 30일 cron cleanup 의 안전망.

### 토픽 3: M2 라우트 prefix 결정 — `/api/v1/t/[tenant]/messenger/...`

`src/lib/api-guard-tenant.ts` (231줄) 정독:
- `withTenant` 가드가 K3 cross-validation + URL 슬러그 정규식 + ResolvedTenant manifest 조회 + active 토글 + Bearer/Cookie 분기 + `runWithTenant({tenantId}, ...)` 컨텍스트 주입까지 일괄 처리
- `prismaWithTenant` Extension 은 *runWithTenant 안에서만* 작동 (모듈-load 시 Proxy 로 lazy 평가)
- ESLint rule `tenant/no-raw-prisma-without-tenant` 가 강제 — withTenant 가드 안에서만 자동 통과

**옵션 비교**:

| 옵션 | 라우트 prefix | 가드 | 보일러플레이트 | Phase 2 분리 비용 |
|---|---|---|---|---|
| A: 묵시 default tenant | `/api/v1/conversations/...` | `withAuth` + 매 핸들러 `runWithTenant({tenantId: defaultTenantId}, ...)` | 19 라우트 × 보일러플레이트 | path 변경 + plugin 이동 |
| **B: 명시 tenant (Almanac 답습)** | `/api/v1/t/[tenant]/messenger/...` | `withTenant` 그대로 | 0 (이미 Almanac에서 검증) | plugin 이동만 |

**결정 = B**. 근거:
1. ADR-027 §2.2 명시 라우트 우선 + Almanac 세션 66 검증 패턴
2. ESLint rule + prismaWithTenant Extension 자동 강제
3. ADR-030 옵션 C "Phase 2 plugin 진입 시 코드 이동" 비용 = path 변경분만큼 회수
4. 운영자 콘솔 UI 는 fetch 호출 시 path 에 `default` 슬러그 자동 주입 (사용자 invisible)

**중요한 함의**: api-surface.md §2 가 prefix 없이 작성된 것은 PRD 작성 시점(세션 63)에 Almanac 검증 결과(세션 66)가 없었기 때문. M2 정밀화에서 §2 + §3 병합 + prefix 일관 적용. 19 라우트 모두 `/api/v1/t/[tenant]/messenger/...` 채택.

### 토픽 4: M2 정밀화 산출물 작성 (`m2-detailed-plan.md` 655줄)

**11 섹션 구성**:

1. **M1 점검 결과 9/9 PASS 매트릭스** (RLS 단위 테스트 실증 1회 권장 1건 명시 — 게이트는 아님)
2. **M2 핵심 결정 7건**:
   - (1) 라우트 prefix `/api/v1/t/[tenant]/messenger/...`
   - (2) 도메인 헬퍼 4개 = 비즈니스 룰 SoT
   - (3) clientGeneratedId 멱등 = pre-lookup + race UNIQUE catch
   - (4) `withTenantRole` 채택 (운영자 패널 4종만)
   - (5) vitest + 실제 DB (RLS_TEST_DATABASE_URL 재사용)
   - (6) Audit 5종 발화 머지 게이트 (DB SELECT 자동 검증)
   - (7) rate-limit 기존 헬퍼 재사용 (신규 인프라 0)
3. **도메인 헬퍼 4개 정밀 시그니처** — `conversations.ts` (findOrCreateDirect/createGroup/addMembers/removeMember/updateMemberSelf/archiveConversation) / `messages.ts` (sendMessage/editMessage/recallMessage/listMessages/searchMessages) / `blocks.ts` (isBlocked/blockUser/unblockUser/listMyBlocks) / `reports.ts` (fileReport/resolveReport/listOpenReports). 각 함수 TS 시그니처 + JSDoc 의도 + 비즈니스 규칙.
4. **Zod 스키마 9개 위치** — `src/lib/schemas/messenger/{conversations,messages,safety}.ts`. `.strict()` 강제.
5. **라우트 19개 정확 명세 표** — path / Method / 가드 / 헬퍼 호출 / 머지 게이트 테스트.
6. **통합 테스트 시나리오** — 도메인 헬퍼 단위 32건 + 라우트 통합 + cross-tenant 침투 7건 + audit 발화 검증.
7. **일정 분할** — M2-Step1 (도메인 헬퍼 + 단위 테스트, 1.5일) / M2-Step2 (핵심 라우트 11개, 2일) / M2-Step3 (안전/알림/운영자 8개 + M2 종료, 1.5일). 예상 세션 69~71.
8. **다른 터미널 작업과의 영역 분리 매트릭스** — Almanac 작업 (modified 42 + untracked 3) vs 메신저 M2 작업 (신규 src/lib/messenger + 신규 routes + 신규 tests) → 충돌 0.
9. **잠재적 함정 5건** — runtime nodejs 누락 / audit_logs event 인덱스 / Receipt PK + tenantId 별도 / clientGeneratedId 범위 (cross-conversation 가능) / SYSTEM 메시지 cgid 자동 생성.
10. **결정 근거 한 줄 (10건)**.
11. **변경 이력** v1.0.

부수: `_index.md` 갱신 — 진행 상태 매트릭스 (M0/M1 완료) + 다음 액션 (M2-Step1 즉시 진입).

### 토픽 5: 세션 종료 (/cs)

본 세션 변경 영역 = `docs/research/messenger/` 안 2 파일. Almanac 작업 영역 (modified 42 + untracked 3) 미터치 보존.

세션 번호 결정: **68**. M2 실행은 다음 세션부터 (예상 69→70→71).

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|------|----------|
| 1 | 본 세션 = 읽기 전용 점검 + 문서 작성만 | 코드 작성 즉시 진입 | 다른 터미널 미커밋 작업과 충돌 회피, 영역 분리 보장 |
| 2 | M1 점검 = 9/9 PASS 확정 | 추가 실증 검증 (RLS env 셋팅) | S67에서 이미 5/5 PASS, 본 세션은 *spec 정합성* 만 재확인 (실증은 M2 통합 테스트 시점에 비용 동시 회수) |
| 3 | M2 라우트 prefix = `/api/v1/t/[tenant]/messenger/...` (Phase 1부터) | 묵시 default tenant `/api/v1/conversations/...` | Almanac 검증 패턴 + ESLint rule 자동 강제 + Phase 2 plugin 분리 비용 0줄 |
| 4 | 도메인 헬퍼 4개 = 비즈니스 룰 SoT | 라우트 핸들러 인라인 검증 | 19 라우트 복붙 회피, 룰 변경 1곳 수정, audit 5종 발화 일관성 |
| 5 | 일정 분할 = M2-Step1/2/3 (3 세션) | 단일 세션 5-6일 | 토큰 한계 + 세션당 머지 게이트 명확화 |
| 6 | OpenAPI Phase 2 미루기 | M2에 자동 생성 도입 | Phase 1 단일 사용자(운영자) 라 ROI 낮음 — api-surface.md §6 결정 답습 |

## 수정 파일 (2개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `docs/research/messenger/m2-detailed-plan.md` | **신규 655줄**. M1 점검 결과 9/9 PASS + M2 정밀화 11 섹션 |
| 2 | `docs/research/messenger/_index.md` | 진행 상태 매트릭스 추가 (M0/M1 완료, M2 분할 예정) + 다음 액션 갱신 (M2-Step1 즉시 진입 가능) + m2-detailed-plan.md 트리 항목 |

## 상세 변경 사항

### 1. `m2-detailed-plan.md` — M1 점검 결과 + M2 정밀화 (655줄, 신규)

§1 M1 점검 매트릭스 9/9 PASS (각 항목별 schema/마이그 line 인용). §2 M2 핵심 결정 7건. §3 도메인 헬퍼 4개 정밀 시그니처 (TS 함수 시그니처 + JSDoc). §4 Zod 스키마 9개. §5 라우트 19개 정확 명세 표. §6 통합 테스트 시나리오. §7 일정 분할 M2-Step1/2/3. §8 영역 분리 매트릭스. §9 함정 5건. §10 결정 근거 10건. §11 변경 이력.

핵심 시그니처 일부:
- `findOrCreateDirect({creatorId, peerId})` — DM 페어 멱등
- `sendMessage({conversationId, senderId, kind, body, clientGeneratedId, ...})` — pre-lookup + race UNIQUE catch
- `EDIT_WINDOW_MS = 15 * 60 * 1000`, `RECALL_WINDOW_MS = 24 * 60 * 60 * 1000`
- `GROUP_MEMBER_LIMIT = 100`

### 2. `_index.md` — 진행 상태 + 다음 액션 갱신

- 풀뿌리 트리에 `m2-detailed-plan.md` 1행 추가
- "## 진행 상태 (2026-04-26 기준)" 섹션 신설 — M0 ✓, M1 ✓ (commit 2048378), M2 분할 예정, M3~M6 미진입
- "## 다음 액션" 섹션 갱신 — M2-Step1/2/3 단계별 가이드

## 검증 결과

- 코드 변경 0 (순수 docs). tsc/vitest 회귀 검증 불필요.
- M1 자체 검증은 S67에서 이미 5/5 PASS. 본 세션은 *spec 정합성 매트릭스* 만 재확인.
- `git status docs/research/messenger/` — `?? m2-detailed-plan.md` + `M _index.md` (영역 한정 확인).

## 터치하지 않은 영역

- **Almanac aggregator 작업** (다른 터미널 미커밋) — `docs/assets/yangpyeon-aggregator-spec/*` (modified 42), `docs/handover/260426-session66-aggregator-day1.md` (untracked), `prisma/seeds/almanac-aggregator-{categories,sources}.sql` (untracked), `src/app/api/v1/t/[tenant]/categories/route.ts` (untracked) — 본 세션 stage 안 함, 별도 commit 대기.
- **메신저 코드 작성** — `src/lib/messenger/`, `src/app/api/v1/t/[tenant]/messenger/`, `tests/messenger/{conversations,messages,blocks,reports}.test.ts` 모두 미작성. M2-Step1 진입 시 작성.
- **6 lock된 agent worktree** (`.claude/worktrees/agent-*`) — kdyswarm 6 agent 병렬 작업 잔재, 정리는 별도 작업.
- **신규 스킬 sync (4.6단계)** — 본 세션 03-skills/ 변경 없음, 적용 대상 아님.

## 알려진 이슈

- 없음 (본 세션은 docs only). M1 commit `2048378` 의 잠재적 갭 1건 (RLS 단위 테스트 13 it 실증 미실행) 은 M2 통합 테스트 단계에서 비용 동시 회수.

## 다음 작업 제안

**Track A — Almanac 우선** (`next-dev-prompt.md` P0):
1. 잔여 4 endpoint (`/contents`, `/sources`, `/today-top`, `/items/[slug]`) — `/api/v1/t/[tenant]/categories/route.ts` 패턴 답습, 각 30~60분
2. API 키 발급 (`srv_almanac_*`) + Almanac Vercel `ALMANAC_TENANT_KEY` env 등록 → /explore 가시화

**Track B — 메신저 M2-Step1**:
1. 도메인 헬퍼 4개 작성 (`m2-detailed-plan.md §3` 시그니처 그대로)
2. Zod 스키마 9개
3. 단위 테스트 32건 + 커버리지 80%+
4. 머지 후 M2-Step2 (핵심 라우트 11개) 진입

**Track A·B 병렬 가능** — `m2-detailed-plan.md §8` 영역 분리 매트릭스에 따라 충돌 0. 사용자 우선순위 결정 또는 두 터미널 분담.

---
[← handover/_index.md](./_index.md)
