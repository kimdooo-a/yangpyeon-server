# 인수인계서 — 세션 64 (스티커 메모 + 메신저 도메인 PRD 산출)

> 작성일: 2026-04-26
> 이전 세션: [session63 (Almanac 통합)](./260426-almanac-tenant-integration.md)
> 저널 원본: [journal-2026-04-26.md](../logs/journal-2026-04-26.md)

---

## 작업 요약

**(1) 스티커 메모 기능** 구현·배포·운영 적용 + **(2) CLAUDE.md 운영 정책** 강화 (Claude 직접 마이그레이션 적용 강제) + **(3) 메신저 도메인 풀스택 PRD** 산출 (ADR-030 + `docs/research/messenger/` 7 산출물 + Phase 20 마스터 계획). 사용자 명시 요청에 따라 코드 구현보다 기획서에 세션 역량 집중.

---

## 대화 다이제스트

### 토픽 1: 윈도우 스티커 스타일 메모 공유 기능 추가
> **사용자**: "윈도우의 스티커 처럼 메모 공유 기능도 추가해줘."

자율 정책(`feedback_autonomy`)에 따라 분기 질문 없이 즉시 설계·구현 진행.

**설계 결정**:
- 멀티테넌트 BaaS 룰(ADR-022 §1) 준수 — 신규 모델은 `tenantId` 첫 컬럼 + RLS 강제
- 운영 콘솔 패턴 차용: `sql_queries` 동일 패턴(`DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000"` + `runWithTenant({bypassRls: true})` + `prismaWithTenant`) — ESLint `no-raw-prisma-without-tenant` 만족
- 공유 의미는 `visibility: PRIVATE | SHARED` enum 신설 (sql_queries `QueryScope` 재사용 대신 의미 명확성)
- Sticky Notes 스타일: 드래그 가능 위치(posX/posY), 색상 팔레트(7종), 핀 고정(z-index), 인라인 편집

**산출물**:
- prisma `StickyNote` 모델 + `StickyNoteVisibility` enum
- 마이그 `20260428000000_add_sticky_notes` (RLS + GRANT 포함)
- API 4종 (`/api/v1/sticky-notes[/:id]`)
- Zod 스키마 (HEX 색·길이·범위 검증)
- UI 2 컴포넌트 (`sticky-board`, `sticky-note-card`) + `/notes` 페이지 + 사이드바 등록
- vitest 8/8 통과, tsc 0 errors, eslint 새 파일 0 issues

**결론**: 기능 완성. 운영 적용까지 진행.

---

### 토픽 2: CLAUDE.md 운영 정책 강화 (Claude 직접 마이그 적용)
> **사용자**: "이 프로젝트 claude.md 에 명시적으로 기록좀해놔줘. 이 컴퓨터에에서 서버가 (E:\00_develop\260406_luckystyle4u_server\standalone) wsl로 운영된다고. 이렇한 상황에서 모든 마이그레이션은 claude code가 직접 모두 실행 적용해야한다고."

CLAUDE.md에 영구 규칙으로 명문화 + memory에도 강한 feedback으로 저장.

**조치**:
- CLAUDE.md "운영 환경 및 마이그레이션 정책 (Claude 직접 적용)" 섹션 신설:
  - 위치: 이 컴퓨터 WSL2 + standalone 경로 명시
  - 마이그레이션 정책(강제): 작성 즉시 `npx prisma migrate deploy` 직접 실행 + 결과 보고 + 실패 시 rollback
  - 예외: 사용자가 명시적으로 "지금은 적용하지 마"라고 지시한 경우만 보류
- `memory/feedback_migration_apply_directly.md` 신설 + MEMORY.md 인덱스 추가

**결론**: 향후 모든 세션에서 자동 인지. 사용자가 후속에 직접 CLAUDE.md를 수정해서 standalone 위치 명세를 세션 52 NFT 회피 결정 반영하여 더 정확하게 보강함.

---

### 토픽 3: 스티커 메모 마이그 즉시 적용
> **사용자**: "ㅇㅇ" (방금 추가한 마이그 적용 권유에 동의)

`npx prisma migrate deploy` Claude 직접 실행 → 1건 적용 성공.

**RLS 검증** (psql):
- `relrowsecurity=t` / `relforcerowsecurity=t` 확인
- policy `tenant_isolation` (USING + WITH CHECK) 확인
- 테이블 구조 정상 (13 컬럼 + 2 인덱스)

**결론**: 운영 적용 완료. standalone 재배포 권유로 마무리.

---

### 토픽 4: 메신저 + 파일 송수신 OSS 도입 검토
> **사용자**: "파일도 주고 받을 수 있는 메신저 기능이 필요해. 깃헙에서 참조할 만한 메신저 앱 프로젝트를 검색해서 이 프로젝트에 내재화 하는 것은 어떻게 생각해?"

**권장**: OSS 포크/내재화 대신 **네이티브 신설**.

근거:
- Mattermost(MIT)/Rocket.Chat(MIT)/Zulip(Apache) 모두 자체 auth/스키마/실시간 레이어 → ADR-022 멀티테넌트(tenant_id+RLS) + Cookie/JWT + SSE+filebox+TenantMembership 위에 얹으려면 70% 재작성 + 듀얼 유지보수 부채
- 본 프로젝트는 메신저에 필요한 1차 부품이 모두 존재 — 4모델만 추가하면 충분 (Conversation/ConversationMember/Message/MessageAttachment-File FK)
- 1~2주 작업으로 깔끔히 맞춰짐. OSS 포크보다 오히려 빠름

**시나리오 추가 질문**: (a) 운영자+팀 내부 협업 메신저인가, (b) 컨슈머 일반 사용자 간 대화까지 열건가?

**결론**: 사용자 추가 결정 대기.

---

### 토픽 5: 사용자 요구 명확화 → 2-track 출시 전략
> **사용자**: "그럼 B로 가야되. 팀협업이 필요하거든, 그리고 메신저 역할을 해야하 여러 사용자간에. 그런 메신저 앱도 만들 예정이고."

세 가지 요구가 동시에 들어옴: 팀 협업 + 일반 사용자 메신저 + 별도 메신저 앱.

**제안 (자율 결정)**: 2-track 단계 출시
- **Phase 1 (4-6주)**: 양평 콘솔 임베디드 코어 메신저 — 같은 tenant 내 사용자 간 (팀 협업)
- **Phase 2 (DAU/요구 도달 시)**: 동일 모델을 `packages/tenant-messenger/` plugin으로 분리 — 컨슈머 메신저 앱이 자체 tenant 호스트
- **Phase 3 (WAU 1000+)**: WebRTC 통화, E2E 암호화, 다중 디바이스 sync

**Cross-tenant DM 차단 절대 원칙** — 두 사용자가 같은 메신저 앱 tenant에 모두 가입한 경우에만 대화 가능.

**기술 결정**:
- 실시간: Phase 1 in-memory EventEmitter, Phase 2 PG LISTEN/NOTIFY 전환
- 첨부: 기존 filebox `File` 모델 FK 재사용 — 별도 storage 0
- 4 모델 (Conversation/Member/Message/Attachment) 시작, +6 (Mention/Receipt/Block/Report/NotifPref/Bookmark)

**결론**: 사용자 동의. 다음 단계로 진행.

---

### 토픽 6: kdywave/kdyspike/kdyswarm 필요성 평가
> **사용자**: "너가 보기에 kdywave나 kdyspike, kdyswarm이 필요할 것 같아?"

**평가 결과**:
- **kdywave (✗)** — 메신저는 Slack/Discord/Mattermost로 패턴 굳어진 well-trodden 도메인. cross-tenant 정책·plugin 분리·실시간 전송 방식 직전 답변에서 결정됨. wave-수준 unknowns 부족.
- **kdyspike (△, 마이크로만)** — `pg_notify` → SSE broadcast 정합성 1점 검증 가치 (이 프로젝트 spike-002에서 SSE+Tunnel만 검증, LISTEN/NOTIFY 페이로드 8KB 한도·Cloudflare Tunnel 장기 connection drop·다중 채널 동시 LISTEN connection 누수 미검증). **30분 마이크로 스파이크**가 적정. 풀 스파이크는 과함.
- **kdyswarm (✗)** — 4모델·3-4 페이지·1 SSE 핸들러는 의존 그래프 선형. 워크트리 N개 격리 + 의존순 통합 오버헤드가 단일 세션 직진보다 더 큼.

**권장 순서**: ADR-030 → 30분 마이크로 spike → Phase 1 M1~M6 직진.

**결론**: 사용자 동의 후 다음 명시 요구로 이동.

---

### 토픽 7: 기획서 집중 요청 + Plan mode 진입
> **사용자**: "일단 기획안을 만드는데 이 번 세션의 남은 역량을 집중하자. 코드 구현보다. 구체적이면서 상세한 계획서가 필요해. 롤모델은 line, kakao고."

Plan mode 자동 진입.

**Phase 1 (Initial Understanding)** — Explore 에이전트 3 병렬 발사:
- Agent A: 백엔드 인프라 매핑 (8개 영역 — 인증/실시간/파일/감사/레이트리미트/Cron/Plugin)
- Agent B: UI 디자인 토큰 + 컴포넌트 매핑
- Agent C: 프로젝트 ADR/Plugin 규약 + 라인/카카오 50+ 기능 매트릭스 (WebSearch 포함)

**Phase 2 (Design)** — Plan 에이전트 1로 PRD 18 섹션 도출 (Vision/Personas/IA/기능명세/데이터모델/API/실시간/UI/페이지/마이그/Plugin/NFR/KPI/마일스톤/리스크/결정 근거).

**Phase 4 (Final Plan)** — `~/.claude/plans/agile-imagining-harbor.md` 작성 → ExitPlanMode → 사용자 승인.

**핵심 절충**:
- 라인의 미니멀리즘 + 카카오의 정보 밀도 (12px radius / 1분 묶음 시간 / 안 읽은 N명 / 답장 인용 카드 / 이모지 6종)
- 본인 버블 brand #2D9F6F, 상대 surface-200

**결론**: Plan 승인됨.

---

### 토픽 8: 기획서를 프로젝트 docs에 영구 이식
사용자 요구("기획서에 집중")에 따라 plan 파일을 프로젝트 풀뿌리 트리에 정착.

**산출물 (9 신규 파일)**:
- ADR-030 — `docs/research/baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md` (옵션 비교 4종 + 결정 옵션 C + 부속 결정 7건 + 재검토 트리거 5종)
- `docs/research/messenger/_index.md` — 풀뿌리 진입점
- `docs/research/messenger/PRD-v1.md` — 메인 PRD 15섹션
- `docs/research/messenger/personas-scenarios.md` — 페르소나 4종 + BDD 시나리오 24건 + 권한 매트릭스
- `docs/research/messenger/line-kakao-feature-matrix.md` — 50+ 기능 비교 + 양평 채택 40개 + 차별화 4축
- `docs/research/messenger/wireframes.md` — ASCII 와이어 12종 + 데이터 흐름 시퀀스 3종 + a11y
- `docs/research/messenger/data-model.md` — Prisma 모델 11종 + enum 6종 + RLS SQL + 인덱스 + ESLint 가드
- `docs/research/messenger/api-surface.md` — 라우트 19개 + SSE 채널 14종 + 에러 코드 표준 + UI hook 시그니처
- `docs/research/messenger/milestones.md` — Phase 1 M0-M6 + Phase 2/3 트리거 + Open Questions 결정 시점

**MASTER-DEV-PLAN.md** 갱신: Phase 20 (Messenger Phase 1) + Phase 21 (Plugin) + Phase 22 (고급) 추가 + 단일 진실 소스 링크.

**current.md** 갱신: 세션 63 + 64 두 row 추가 + 최종 수정 라벨 갱신.

**결론**: 기획서가 프로젝트 풀뿌리 트리에 영구 정착. 다음 세션 진입 비용 0.

---

## 의사결정 요약

| # | 결정 | 검토한 대안 | 선택 이유 |
|---|------|-------------|----------|
| 1 | 스티커 메모는 sql_queries 패턴 차용 | (a) 새 패턴 신설, (b) sql_queries 그대로 | 운영 콘솔 표준 패턴 일관성 + ESLint 룰 만족 |
| 2 | StickyNoteVisibility enum 신설 | (a) sql_queries QueryScope 재사용, (b) 별도 enum | 의미 명확성 (PRIVATE/SHARED) — 메모 도메인의 공유 의미가 sql_queries의 SHARED와 다름 |
| 3 | CLAUDE.md 운영 정책을 별도 섹션으로 신설 | (a) 기존 "프로젝트별 규칙"에 추가, (b) 별도 섹션 | 마이그 직접 적용은 강한 행동 강제 — 별도 섹션으로 가시성 확보 |
| 4 | 메신저는 OSS 포크 대신 네이티브 신설 | (a) Mattermost MIT 포크, (b) Rocket.Chat MIT, (c) 네이티브 4모델 | 본 프로젝트의 SSE+filebox+TenantMembership+RLS 위에 OSS 얹으면 70% 재작성 + 듀얼 유지보수 |
| 5 | 메신저 2-track 단계 출시 (옵션 C) | (a) Plugin-first, (b) Plugin-only, (c) 단계적, (d) 코어영구 | 정량 점수 77 (vs 60/53/51). 모델 검증 + premature abstraction 회피 + ADR-024 §4.2 Almanac 패턴 재현 |
| 6 | kdyspike #1 (30분 마이크로) 사전 수행 | (a) skip, (b) 마이크로 30분, (c) 풀 1-2일 | PG NOTIFY+SSE 정합성은 미검증 + Phase 1 도중 발견 시 비용 비대칭. 풀 스파이크는 과함 |
| 7 | kdywave/kdyswarm 미사용 | wave/swarm 적용 vs 단순 single agent | 도메인 well-trodden + 의존 그래프 선형. wave/swarm 오버헤드가 직진보다 큼 |
| 8 | Phase 1 in-memory bus 유지 | (a) 즉시 PG NOTIFY, (b) 즉시 Redis, (c) in-memory 유지 | ADR-025 단일 노드 가정 + 신규 인프라 도입 비용 0 + Phase 2에 별도 ADR로 전환 |
| 9 | 첨부는 filebox File FK 재사용 | (a) 새 storage, (b) File 재사용 | tenant_id RLS 자동 상속 + 별도 storage 운영 부담 0 |
| 10 | 그룹 100명 시작 (라인 500/카카오 1000 보수적) | 100/500/1000 | SSE bus 부하 + 1인 운영 부담 회피. 부하 테스트 후 확장 |
| 11 | 사이드바 "커뮤니케이션" 그룹 신설 | (a) 콘텐츠 그룹에 추가, (b) 신설 | 향후 공지/이메일/푸시 캠페인 자연 확장 |
| 12 | clientGeneratedId 멱등 송신 | (a) server-side 생성, (b) client UUIDv7 + UNIQUE | 라인 LocalMessageId 패턴 + 오프라인 재시도 안전 |
| 13 | 마이그 단계별 1개씩 deploy | (a) 일괄, (b) 단계별 | 메신저 마이그 10건 — 단계별 RLS 검증 명확 |
| 14 | 본 세션은 세션 64 (저널 세션 63은 별개) | (a) 세션 63 통합, (b) 세션 64 분리 | 저널 세션 63 = kdyswarm + Almanac 통합 별개 작업, 본 세션은 다른 컨텍스트 시작 — 분리가 정확 |

---

## 수정 / 신규 파일 (총 18개)

### 신규 (스티커 메모)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `prisma/migrations/20260428000000_add_sticky_notes/migration.sql` | StickyNote 테이블 + enum + RLS + GRANT (Claude 직접 deploy 적용) |
| 2 | `src/app/api/v1/sticky-notes/route.ts` | GET 목록 + POST 생성 |
| 3 | `src/app/api/v1/sticky-notes/[id]/route.ts` | PATCH 수정 + DELETE 삭제 (소유자 검증) |
| 4 | `src/lib/schemas/sticky-notes.ts` | Zod create/update 스키마 |
| 5 | `src/components/sticky-notes/sticky-board.tsx` | 보드 + 드래그 + 낙관적 업데이트 |
| 6 | `src/components/sticky-notes/sticky-note-card.tsx` | 카드 + 색상 팔레트 + 공유/고정/삭제 |
| 7 | `src/app/(protected)/notes/page.tsx` | `/notes` 페이지 |
| 8 | `tests/sticky-notes-schema.test.ts` | vitest 8/8 통과 |

### 신규 (메신저 PRD + ADR)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 9 | `docs/research/baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md` | ADR ACCEPTED (옵션 C, 부속 결정 7건, 재검토 트리거 5종) |
| 10 | `docs/research/messenger/_index.md` | 풀뿌리 진입점 |
| 11 | `docs/research/messenger/PRD-v1.md` | 메인 PRD 15섹션 |
| 12 | `docs/research/messenger/personas-scenarios.md` | 페르소나 4종 + BDD 시나리오 24건 |
| 13 | `docs/research/messenger/line-kakao-feature-matrix.md` | 50+ 기능 비교 + 차별화 4축 |
| 14 | `docs/research/messenger/wireframes.md` | ASCII 와이어 12종 + 데이터 흐름 시퀀스 |
| 15 | `docs/research/messenger/data-model.md` | Prisma 모델 11종 + RLS SQL |
| 16 | `docs/research/messenger/api-surface.md` | 라우트 19 + SSE 채널 14 |
| 17 | `docs/research/messenger/milestones.md` | M0-M6 마일스톤 + Open Questions |

### 수정
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 18 | `prisma/schema.prisma` | StickyNote 모델 + enum 추가 |
| 19 | `src/components/layout/sidebar.tsx` | "콘텐츠" 그룹에 "메모" 메뉴 추가 (StickyNote 아이콘) |
| 20 | `CLAUDE.md` | "운영 환경 및 마이그레이션 정책" 섹션 신설 (사용자가 후속에 standalone 위치 명세 보강) |
| 21 | `docs/MASTER-DEV-PLAN.md` | Phase 20/21/22 메신저 마일스톤 추가 |
| 22 | `docs/status/current.md` | 세션 63·64 row 추가 + 최종 수정 라벨 갱신 |
| 23 | `docs/logs/2026-04.md` | 세션 63·64 항목 추가 |

### Memory (글로벌 영역, git 미추적)
| # | 파일 | 변경 내용 |
|---|------|-----------|
| 24 | `~/.claude/projects/.../memory/feedback_migration_apply_directly.md` | 신규 — Claude 직접 마이그 적용 정책 |
| 25 | `~/.claude/projects/.../memory/MEMORY.md` | 인덱스 1행 추가 |
| 26 | `~/.claude/plans/agile-imagining-harbor.md` | Plan mode 산출물 (개인 영역, 승인됨) |

---

## 검증 결과

- `npx prisma migrate deploy` — 1건 적용 성공 (`20260428000000_add_sticky_notes`)
- RLS 검증 (psql) — `relrowsecurity=t` / `relforcerowsecurity=t` / `tenant_isolation` policy 확인
- `npx vitest run tests/sticky-notes-schema.test.ts` — 8/8 통과
- `npx tsc --noEmit` — 0 errors
- `npx eslint src/app/api/v1/sticky-notes src/lib/schemas/sticky-notes.ts src/components/sticky-notes src/app/\(protected\)/notes` — 0 issues
- 메신저 PRD: 코드 구현 0 (기획서만)

---

## 터치하지 않은 영역

- 메신저 코드 자체 (PRD만 산출, 코드 구현은 Phase 1 M1~M6에서 진행)
- 기존 인프라 (api-guard, prisma-tenant-client, realtime/bus, sse-headers, filebox-db) — 회귀 0
- T1.6 Almanac aggregator (세션 63에서 처리됨)
- standalone 재배포 (스티커 메모 운영 노출 위해 권장했으나 본 세션에서 미실행)

---

## 알려진 이슈

- ⚠ **prisma schema invalid (9 errors)**: 사용자가 본 세션 후반에 `prisma/schema.prisma:104~113`에 메신저 backref 9 relation을 User 모델에 미리 추가했으나, 참조 모델(Conversation/Message/UserBlock/AbuseReport/NotificationPreference 등 11종)은 아직 미생성. `npx prisma validate` 9 에러. **다음 세션 M1 W1 시작 트리거로 추정** — `docs/research/messenger/data-model.md`의 모델 11종 + enum 6종을 schema에 추가하면 즉시 해소. 마이그 #1~6 작성 + Claude 직접 deploy.
- **standalone 미재배포**: 스티커 메모 코드는 dev에는 있지만 운영 PM2가 가리키는 standalone에는 없음. 운영에서 `/notes` + `/api/v1/sticky-notes` 호출 시 404. → 다음 세션 또는 사용자 ypserver 스킬로 재배포 필요
- **Phase 1 in-memory bus 단일 노드 한계** (ADR-025 명시): 다중 인스턴스 배포 시 메시지 누락 위험. Phase 2 PG NOTIFY 전환 ADR-031 사전 작성 권장
- **메신저 검색 LIKE N×M 비용**: tenant 성장 시 응답 지연. 30일 윈도 강제 + GIN trgm 인덱스로 완화 (Phase 1 M5)
- **신규 테이블 RLS 누락 위험**: CI lint 부재. prisma diff → RLS policy presence 검증 lint 도입 권장
- **세션 번호 명명**: 본 세션은 세션 64지만 저널의 세션 63 항목은 별개 컨텍스트 산출물 — 표기 일관성 확보됨
- 세션 55부터 누적 이월: 03:00 KST cron 결과 / 글로벌 스킬 drift audit / S54 잔존(_test_session drop, DATABASE_URL rotation, MFA biometric, SP-013·016, Windows 재부팅 실증)

---

## 다음 작업 제안 (S65+)

### P0 — Phase 1 진입 게이트
1. **kdyspike #1** (30분, 마이크로) — `pg_notify` + SSE broadcast 정합성 PoC
   - 측정: payload 8KB 한도, Cloudflare Tunnel 장기 connection drop 빈도, 다중 채널 동시 LISTEN connection pool 누수
   - 산출: `docs/research/spikes/spike-006-pg-notify-sse.md`
   - 결과 활용: Phase 2 진입 시 ADR-031 작성 자료. 부정적이면 Redis Pub/Sub ADR 추가
2. **standalone 재배포** — 스티커 메모 운영 노출. ypserver 스킬 또는 `wsl-build-deploy.sh` 호출

### P0 — Phase 1 M1 시작
3. **메신저 데이터 모델 도입** (W1, ~5 작업일):
   - `prisma/schema.prisma`에 enum 6종 + 모델 11종 추가 (`docs/research/messenger/data-model.md` 정확 복사)
   - User 모델에 backref 12개 relation 추가
   - 마이그 #1~6 작성 + Claude 직접 deploy + 단계별 RLS 검증
   - Prisma client regenerate
   - RLS 단위 테스트 작성 (cross-tenant 침투 시도 → 0 rows)

### P1 — Open Questions 결정
4. Q1 Web Push 방식 (M5 시작 전, 권장 VAPID self-host)
5. Q4 프로필 사진 처리 (M4 시작 전, 권장 filebox 그대로)
6. Q6 typing indicator 저장 (M3, 권장 무저장 publish only)

### P1 — Almanac 통합 (S63 산출물 활용)
7. Almanac 팀에 `docs/handover/260426-almanac-tenant-integration.md` 전달
8. tenant API 키 발급 요청 처리

### P2 — 인프라 강화
9. CI에 prisma schema diff → RLS policy presence lint 추가 (메신저 모델 도입 전 권장)
10. T1.4 잔존 (S62 권장 P1/P2 등)
11. 누적 이월: 03:00 KST cron 결과 / 글로벌 스킬 drift audit / S54 잔존

---

## 참고 산출물 인덱스

**메신저 단일 진실 소스**: [docs/research/messenger/_index.md](../research/messenger/_index.md)

**관련 ADR**:
- [ADR-030 Messenger Domain & Phasing](../research/baas-foundation/01-adrs/ADR-030-messenger-domain-and-phasing.md) (ACCEPTED 2026-04-26)
- [ADR-022 BaaS 정체성](../research/baas-foundation/01-adrs/ADR-022-baas-identity-redefinition.md)
- [ADR-024 Plugin 코드 격리](../research/baas-foundation/01-adrs/ADR-024-tenant-plugin-code-isolation.md)
- [ADR-025 단일 인스턴스](../research/baas-foundation/01-adrs/ADR-025-instance-deployment-model.md)
- [ADR-026 Manifest](../research/baas-foundation/01-adrs/ADR-026-tenant-manifest-schema.md)

**Plan 원본**: `~/.claude/plans/agile-imagining-harbor.md` (개인 영역, ACCEPTED 2026-04-26)

---

[← handover/_index.md](./_index.md)
