# ADR-030 — Messenger 도메인 도입 + 2-track Phasing

| 항목 | 값 |
|------|-----|
| 상태 | **PROPOSED** |
| 결정 | **ACCEPTED (2026-04-26, 옵션 C — 코어 임베디드 P1 → Plugin 분리 P2)** |
| 작성 | 2026-04-26 (세션 63, 기획안 산출 — Plan 산물 `~/.claude/plans/agile-imagining-harbor.md`) |
| 작성자 | Claude (1인 운영 BaaS 컨텍스트) |
| Supersedes | — (신설 도메인) |
| Related | ADR-022 (BaaS 정체성), ADR-023 (데이터 격리), ADR-024 (Plugin 코드 격리), ADR-025 (단일 인스턴스), ADR-026 (Manifest), ADR-027 (Multi-tenant Router), ADR-029 (관측성) |
| 영향 범위 | 신규 도메인 (Conversation/Message/Attachment 등 11모델) + UI 페이지 트리 + 사이드바 + SSE 채널 + Audit 이벤트 + 마이그 10건 |
| 결정 마감 | Phase 1 코드 작성 시작 전 (현 세션 후속) |

---

## 1. 컨텍스트

### 1.1 트리거 — 두 요구의 동시 발생 (세션 63)

**요구 A (팀 협업 메신저)**: 운영자 김도영 + 양평팀 동료가 양평 콘솔 안에서 1:1, 그룹, 답장, 멘션, 첨부, 검색을 사용. 라인/카카오 수준 UX.

**요구 B (컨슈머 메신저 앱 백엔드)**: 별도 출시 예정인 메신저 제품(라인/카카오 류)의 일반 사용자 풀이 양평 BaaS를 백엔드로 사용. cross-user DM/그룹/채널.

두 요구는 동일한 메시지 도메인 모델을 공유하지만, **호스트 위치 + 사용자 풀 + 가시성 정책**이 다르다.

### 1.2 ADR-022 7원칙과의 정면 충돌점

| 원칙 | 충돌 지점 | 본 ADR이 해결할 것 |
|---|---|---|
| §1 tenant 1급 시민 | "두 tenant 사용자가 어떻게 같은 대화방에서 만나는가?" | cross-tenant DM 차단 명시 + 메신저 앱은 자체 tenant 안에서 모든 사용자가 공존 |
| §2 코어/plugin 분리 | "메신저는 코어인가 plugin인가?" | 두 답을 모두 채택 (Phase 1 코어, Phase 2 plugin) |
| §3 컨슈머 격리 | "메신저 앱 장애가 양평팀 협업에 영향?" | plugin 분리 후 각각 독립 SSE/quota |
| §6 불변 코어/가변 plugin | "메신저 코어 = 6개월 불변?" | 모델·SSE 채널 키 = 코어 (불변), 스티커·봇·UI = plugin (가변) |

### 1.3 기존 인프라 재사용 가능성 (이미 확정)

세션 63 탐색 결과 — **8개 영역 전부 재사용 가능**:
- 인증/권한: `withAuth`, `withRole`, `withTenant` (api-guard, api-guard-tenant)
- 테넌트 컨텍스트: `runWithTenant`, `prismaWithTenant`, `withTenantTx` (packages/core, db/prisma-tenant-client)
- 실시간: `src/lib/realtime/bus.ts` (in-memory EventEmitter), `src/app/api/sse/realtime/channel/[channel]/route.ts`
- 파일: `src/lib/filebox-db.ts` + prisma `File` 모델 (메시지 첨부 = File FK 재사용)
- 감사: `auditLogSafe()` (이벤트 10종 신설)
- 레이트리미트: `src/lib/rate-limit-db.ts` (typing 1/sec, 신고 분당 N)
- 멤버십: `TenantMembership` (cross-tenant 차단 게이트)
- 마이그 패턴: `phase1_4_rls_stage3` 헤더/RLS 정책 그대로

→ **신규 인프라 도입 0**. 메신저는 도메인 로직만 신설.

### 1.4 1인 운영 부담 제약

ADR-022 §7: "모든 결정은 1인 운영 가능한 N의 상한으로 검증". 본 ADR이 답해야 할 질문:

> N=20 컨슈머 + 1개 양평팀 협업 메신저 = 총 21개 메신저 인스턴스(논리적). 이걸 김도영 1명이 운영 가능한가?

답: 가능. 메신저 인프라는 동일하고, tenant별 격리는 RLS + `TenantCronPolicy` 패턴 그대로 자동 적용.

---

## 2. 옵션 비교

### 2.1 옵션 A — Phase 1부터 Plugin 분리 (Plugin-first)

#### 정의
처음부터 `packages/tenant-messenger/` 패키지 신설. manifest 등록. 양평 콘솔도 plugin 임포트하는 구조.

#### 장점
- ADR-024 옵션 D(hybrid) 정신에 100% 부합 (Complex tier로 곧장 진입)
- 코드 이동 작업 없음 (이미 분리)

#### 단점
- **모델 검증 전 추상화** — 메신저 도메인은 라인/카카오 정도의 복잡성. 6주 구현 중 모델이 3~5번 깨질 가능성. plugin 경계가 깨질 때마다 fragment.prisma + manifest 수정 비용 비대칭
- monorepo build 복잡도 증가 (Prisma fragment 합치는 build script 필요)
- 양평팀 첫 사용자 1명 (운영자 김도영) 단계에서 plugin 분리는 over-engineering

#### 1인 운영 적합도
**중**. 추상화 비용을 처음부터 지불.

### 2.2 옵션 B — Plugin-only (코어 메신저 무, 컨슈머 앱만)

#### 정의
양평 콘솔은 메신저 미탑재. `packages/tenant-messenger/` plugin만 신설. 양평팀 협업은 별도 도구(슬랙 등) 사용.

#### 장점
- 코어/plugin 분리 명확
- 양평 콘솔 부담 0

#### 단점
- **요구 A 미해결**. 사용자 명시 요구("팀 협업 메신저 + 컨슈머 앱 양쪽")의 절반만 충족
- plugin 단독 검증은 외부 사용자 진입까지 시간 소요 (장기간 음영)

#### 1인 운영 적합도
**저**. 요구 미충족.

### 2.3 옵션 C — 코어 임베디드 P1 → Plugin 분리 P2 (단계적, 권장)

#### 정의
**Phase 1 (4-6주)**: 양평 콘솔 안에 메신저 직접 임베드 (`src/app/(protected)/messenger/`, `src/app/api/v1/conversations/`). 같은 tenant 내 사용자 간 대화. 모든 사용자가 `default` tenant.

**Phase 2 (DAU/요구 도달 시)**: 동일 도메인 모델을 `packages/tenant-messenger/` plugin으로 분리. 컨슈머 메신저 앱은 자체 tenant(`tenant-messenger-app`)를 가지며, 일반 사용자가 그 tenant에 가입.

**Phase 3 (WAU 1000+)**: WebRTC 통화, E2E 암호화, 다중 디바이스 sync.

#### 장점
- **Phase 1에서 모델 검증 완료** 후 분리 → premature abstraction 회피 (ADR-024 §1.4의 Almanac 패턴과 동일 — 코어 직접 작성 후 ADR-024 채택 시 packages/로 이동)
- **요구 A·B 모두 충족** (시간차)
- **plugin 분리 시 코드 이동 매핑이 명확** (§3.3)
- ADR-024 §4.2 "Almanac은 Complex로 분류되므로 옵션 A와 동일하게 workspace 패키지로 이동"의 패턴 재현 — 이미 검증된 절차

#### 단점
- Phase 1→2 코드 이동 비용 (Almanac 5작업일 추정 → 메신저는 모델 11종 + UI 트리 더 큼 → 5~8 작업일)
- 두 단계의 Prisma 스키마 위치가 다름 (Phase 1 = core schema, Phase 2 = plugin fragment)

#### 1인 운영 적합도
**고**. 점진적 진입, 검증 후 분리.

### 2.4 옵션 D — 코어 임베디드 영구 (Plugin 분리 없음)

#### 정의
양평 콘솔에만 메신저 탑재. plugin 분리 영구 보류. 컨슈머 앱은 자체 인스턴스 별도 운영.

#### 장점
- 단순. 빌드 1개.

#### 단점
- **컨슈머 앱이 양평 BaaS를 안 쓰게 됨** → BaaS 정체성(ADR-022) 부분 후퇴
- 컨슈머 앱이 별도 인프라 → 1인 운영 부담 증가

#### 1인 운영 적합도
**저~중**. 미래 컨슈머 앱 출시 시 인프라 분기 비용.

---

## 3. 비교 매트릭스

| 차원 | 가중치 | A plugin-first | B plugin-only | **C 단계적** | D 코어영구 |
|------|---|---|---|---|---|
| 요구 A 충족 | 3 | 5 | 1 | 5 | 5 |
| 요구 B 충족 | 3 | 5 | 5 | 4 (지연) | 1 |
| Phase 1 속도 | 3 | 2 | 4 | 5 | 5 |
| 모델 검증성 | 3 | 2 | 3 | 5 | 5 |
| ADR-022 §6 부합 | 2 | 5 | 5 | 5 | 2 |
| 1인 운영 부담 | 3 | 3 | 3 | 4 | 3 |
| 미래 plugin 비용 | 2 | 0 (이미 분리) | 0 | 5 (이동 5~8일) | — |
| **가중 합** | | 60 | 53 | **77** | 51 |

→ **C >> A > B > D**

---

## 4. 결정 (Decision)

**옵션 C 채택**. 코어 임베디드 Phase 1 → Plugin 분리 Phase 2 → 통화/E2E Phase 3.

### 4.1 핵심 부속 결정 7건

1. **Cross-tenant 차단 절대 원칙**: Phase 1·2 모두에서 메시지/대화/멤버십은 `tenant_id` 첫 컬럼 + RLS `tenant_isolation` 정책으로 격리. cross-tenant DM은 두 사용자가 모두 동일 tenant(예: 메신저 앱 tenant)에 가입한 경우에만 일어남.

2. **In-memory EventEmitter 유지 (P1)**: ADR-025 단일 노드 가정. 신규 인프라(Redis/PG NOTIFY) 도입 비용 회피. Phase 2 진입 시 별도 ADR-031로 PG LISTEN/NOTIFY 전환.

3. **첨부 = filebox `File` 모델 FK 재사용**: 별도 storage 신설 안 함. 첨부는 자동으로 tenant_id RLS 상속.

4. **clientGeneratedId 멱등 송신**: 라인 LocalMessageId 패턴. UNIQUE `(tenantId, conversationId, clientGeneratedId)` 제약 + 충돌 시 기존 fetch return.

5. **Phase 1 검색 = LIKE 30일 윈도**: 데이터 적은 초기는 LIKE로 충분. Phase 2에 tsvector + GIN 도입, Phase 3에 별도 검색 엔진(Meilisearch 후보).

6. **사이드바 "커뮤니케이션" 그룹 신설**: 사이드바 두 번째 위치(운영 그룹 아래). 향후 공지/이메일/푸시 캠페인 자연 확장.

7. **마이그 단계별 1개씩 deploy**: 메신저 마이그가 10건. CLAUDE.md 운영 정책에 따라 Claude가 직접 적용하되, 단계별 RLS 검증 쿼리(`SELECT relrowsecurity FROM pg_class`) 자동 실행.

### 4.2 명시적 비목표 (영구/단기 제외)

- **Phase 3 이후**: 음성/영상 통화, E2E 암호화, 다중 디바이스 sync, 챗봇 SDK, 백업/복원
- **영구 제외**: 광고 모듈, 광고 ID 추적, 위치 공유(개인정보 리스크 過大), 송금
- **Phase 2까지 보류**: 채널 모더레이션 큐, 메시지 fwd-to-LINE/Kakao, 캘린더 통합

---

## 5. 결과 (Consequences)

### 5.1 즉시 영향

- prisma/schema.prisma에 enum 6종 + 모델 11종 추가 (ADR-022 §1 패턴)
- `src/components/layout/sidebar.tsx`에 "커뮤니케이션" 그룹 신설 + 5진입점 등록
- `src/lib/realtime/bus.ts`에 fan-out 채널 키 규칙 추가 (`conv:`, `user:`, `presence:`)
- `src/app/api/sse/realtime/channel/[channel]/route.ts`에 channel 권한 검증 게이트 추가
- 마이그 10건(`20260501000000_messenger_phase1_*` 외)
- Audit 이벤트 카탈로그 10종 추가

### 5.2 Phase 2 진입 시 영향

- `packages/tenant-messenger/` 신설 (5~8 작업일)
- ADR-031 작성 (Realtime 백본 PG LISTEN/NOTIFY 전환)
- ADR-032 작성 (Messenger Plugin Manifest 스키마)
- `prisma/schema.prisma`의 메신저 모델 → `packages/tenant-messenger/src/prisma.fragment.prisma`로 이동, build-time merge script

### 5.3 Phase 3 진입 시 영향

- WebRTC TURN 서버 자가호스팅 또는 외부(Twilio) — 운영비 증가
- libsignal-client 통합 (E2E)
- 메시지 본문 ciphertext blob 저장 (검색 한계, 별도 ADR 필요)

---

## 6. 알려진 한계 / Open Questions

| # | 항목 | 옵션 | 결정 기한 |
|---|---|---|---|
| Q1 | Web Push 방식 | (a) VAPID self-host (권장), (b) Firebase, (c) PWA only | M5 (Phase 1 5주차) |
| Q2 | 메시지 검색 엔진 | (a) LIKE P1, (b) tsvector P2, (c) Meilisearch P3 | Phase 2 진입 |
| Q3 | 봇 SDK | (a) HTTP webhook, (b) Edge Function, (c) 별도 SDK | Phase 3 |
| Q4 | 프로필 사진 처리 | (a) filebox 그대로 (권장), (b) avatar 테이블+thumbnail 자동화 | M4 |
| Q5 | 그룹 인원 한도 | (a) 100 (권장 시작), (b) 500 (라인), (c) 1000 (카카오) | 부하 테스트 후 |
| Q6 | typing indicator 저장 | (a) 무저장 publish only (권장), (b) Redis presence P2 | M3 |
| Q7 | iOS Safari Web Push | PWA 설치 강제 vs 알림 OFF 안내 | M6 |
| Q8 | 회수 시 첨부 cleanup | (a) 즉시 dereference, (b) 30일 cron (권장) | M5 |
| Q9 | Phase 2 plugin 분리 시점 | DAU N=? 또는 컨슈머 앱 요구 시점 (둘 중 빠른 쪽) | DAU 측정 데이터 기반 |
| Q10 | E2E 암호화 채택 시 검색 호환 | server-side 검색 포기 vs 클라이언트 사이드 검색 | Phase 3 진입 직전 |

---

## 7. 재검토 트리거 (Triggers)

본 ADR은 다음 중 하나 발생 시 재검토:

1. **Phase 1 모델이 6주 안에 안정화 실패** → 옵션 A(plugin-first)로 후퇴 검토 ("코어 임베디드 후 분리"가 비대칭 비용으로 판명될 경우)
2. **컨슈머 메신저 앱 출시 일정이 Phase 1 종료 전으로 앞당겨짐** → Phase 2 조기 진입 또는 옵션 A로 변경
3. **단일 노드 SSE 한계 도달** (tenant당 connection 200 초과 또는 메시지 분당 1000 초과) → ADR-031 즉시 작성
4. **첨부 폭주로 filebox quota 자주 초과** → 첨부 전용 storage 분리 검토(별도 ADR)
5. **법적 리스크 발생** (라인/카카오 UI 유사성 등) → 시각 차별화 강화 또는 비공개 BaaS 한정 명시화

---

## 8. Out-of-Scope (본 ADR이 다루지 않음)

- **메신저 plugin 내부 manifest 스키마**: ADR-032(Messenger Plugin Manifest)에서 별도 결정
- **PG LISTEN/NOTIFY 백본 전환 절차**: ADR-031에서 별도 결정 (kdyspike #1 결과 첨부)
- **WebRTC TURN/STUN 서버 호스팅**: Phase 3 진입 직전 별도 ADR
- **E2E 암호화 프로토콜 선택**: Signal Protocol vs MLS vs custom — Phase 3 직전 별도 ADR
- **외부 저장소 archival**: Phase 3 메시지 30일+ cold storage 정책

---

## 9. 참고 산출물

- 메인 PRD: `~/.claude/plans/agile-imagining-harbor.md` (세션 63 plan, ACCEPTED 2026-04-26)
- 프로젝트 영구 사본: `docs/research/messenger/PRD-v1.md` (세션 63에서 이식 예정)
- 화면 와이어: `docs/research/messenger/wireframes.md`
- 기능 매트릭스: `docs/research/messenger/line-kakao-feature-matrix.md`
- 페르소나/시나리오: `docs/research/messenger/personas-scenarios.md`

---

## 10. 결정 근거 (Why) — 한 줄씩

1. **옵션 C 채택**: 모델 검증 + 점진적 plugin 분리, ADR-024가 Almanac에 적용한 패턴 재현
2. **In-memory bus 유지**: ADR-025 단일 노드, 신규 인프라 0
3. **filebox 재사용**: tenant_id RLS 자동 상속, 별도 storage 무
4. **clientGeneratedId 멱등**: 라인 패턴, 오프라인 안전성
5. **그룹 100명 시작**: 라인 500 / 카카오 1000 대비 보수적 (부하 테스트 후 확장)
6. **이모지 6종 P1**: 라인식, 캐싱·UI 단순
7. **통화/E2E P3 보류**: 1인 운영 부담 비대칭, MVP 범위 초과
8. **카카오식 읽음 숫자 + 라인식 답장 카드**: best-of-both
9. **검색 LIKE→tsvector→engine 진화**: 데이터량 따라 비용 최적화
10. **사이드바 "커뮤니케이션" 신설**: 향후 공지/이메일/푸시 자연 확장
