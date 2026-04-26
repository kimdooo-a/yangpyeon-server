# Personas & Scenarios — Yangpyeong Messenger

> **소스**: 세션 63 (2026-04-26) · ADR-030 §1.2 페르소나 정의 보강
> **사용처**: Phase 1 M1~M6 게이트 시나리오, E2E playwright 테스트 시나리오, 운영자 디버깅용

---

## 1. 페르소나 카드 4종

### P1 — 김도영 (운영자)
| 항목 | 값 |
|---|---|
| 역할 | OWNER (모든 tenant 관리), 양평팀 협업자(일부 tenant) |
| 디바이스 | PC (Windows + WSL), 모바일 PWA (드물게) |
| 사용 빈도 | 일 3~5회 능동, 알림은 24/7 수신 |
| 핵심 needs | 신고 큐 1클릭 차단, 송신 SLO 위반 즉시 인지, tenant quota 알림, 강제 회수, 헬스 1화면 |
| 문제 시나리오 | "장애가 1tenant에 국한되는지 확인 못 함", "어느 tenant가 disk 폭주 중인지 모름", "악성 사용자 즉시 차단 못 함" |
| 성공 지표 | 신고 처리 평균 시간 < 5분, SLO 위반 인지 < 1분, quota 80% 도달 시 자동 throttle 작동 |
| 권한 | 모든 tenant의 메시지 read/회수, 모든 신고 resolve |

### P2 — 양평팀 협업자 (내부)
| 항목 | 값 |
|---|---|
| 역할 | MANAGER 또는 MEMBER (단일 tenant `default` 또는 1~2개 추가 tenant 멤버십) |
| 디바이스 | PC (메인), 모바일 PWA (이동 중) |
| 사용 빈도 | 일 10~30회, 응답 5분 내 기대 |
| 핵심 needs | 1:1+그룹 채팅, @멘션, 파일 첨부, 답장 인용, 본문 검색 |
| 문제 시나리오 | "다른 tenant 사람이랑 우연히 같은 방", "긴 대화에서 결정 사항 다시 찾기", "오프라인에서 작성한 메시지 손실" |
| 성공 지표 | 메시지 전송 p95 < 200ms, 검색 p95 < 800ms, 0 cross-tenant 누출 |
| 권한 | 본인 메시지 편집(15분)/회수(24h), 다른 사용자 차단/신고 |

### P3 — 컨슈머 앱 일반 사용자 (외부, Phase 2+)
| 항목 | 값 |
|---|---|
| 역할 | 메신저 앱 tenant(`tenant-messenger-app`)의 일반 사용자 (MEMBER) |
| 디바이스 | 모바일 PWA 우선, 데스크톱 보조 |
| 사용 빈도 | 카카오/라인 사용 패턴 — 일 50+회 push 수신, 5~10회 능동 송신 |
| 핵심 needs | QR 친구 추가, 알림 ON/OFF, 차단/신고, 프로필 비공개 옵션 |
| 문제 시나리오 | "광고성 DM 폭주", "차단해도 그룹에서 또 만남", "iOS Safari 푸시 안 옴" |
| 성공 지표 | 차단/신고 후 0 재접촉, 푸시 신뢰도 > 95%, 가입 후 첫 메시지 송신 < 60초 |
| 권한 | 본인 메시지/프로필만 수정, 신고/차단 가능 |

### P4 — 봇 / 외부 시스템 (Phase 2+)
| 항목 | 값 |
|---|---|
| 역할 | role=BOT (별도 enum 추가, Phase 2), API key 인증 |
| 디바이스 | 서버 (HTTP client) |
| 사용 빈도 | 분당 N건 송신, 이벤트 기반 |
| 핵심 needs | idempotent 송신(중복 방지), rate limit 명확, slash command 응답 |
| 문제 시나리오 | "재시도로 같은 메시지 2번", "rate limit 초과 시 재시도 폭증", "권한 회수 후에도 송신 시도" |
| 성공 지표 | clientGeneratedId 중복 → 100% 동일 응답, 429 응답에 Retry-After 정확, revoke 후 1초 내 SSE 종료 |
| 권한 | api_key scope에 따라 messenger.read / messenger.write / messenger.moderate |

---

## 2. Phase 1 시나리오 — P1 운영자 (6건)

### S1.1 신고 큐 1클릭 차단
- **Given** tenant `default`에서 사용자 X에 대한 신고 5건 누적
- **When** 운영자가 우상단 종 알림 → "신고 5건" 클릭
- **Then** `/admin/messenger/moderation` 진입, 신고 5건이 시간순 표시
- **And** "사용자 X 차단" 1클릭 → 모든 tenant에서 X의 메시지 수신 차단 + audit log 기록
- **Edge**: 차단 후 X가 송신 시도 → 403 + audit `messenger.block_violation_attempt`

### S1.2 송신 SLO 위반 알림
- **Given** Phase 1 NFR p95 < 200ms 목표
- **When** 5분 평균 p95가 500ms 초과
- **Then** 운영자에게 in-app 빨강 배너 + (옵션) 카카오톡 OPS 채널 알림
- **And** `/admin/messenger/health`에 영향 tenant + endpoint 표시
- **Edge**: 단일 outlier로 트리거 안 됨 (3회 연속 위반만)

### S1.3 tenant quota 80% 자동 throttle
- **Given** tenant A의 일일 메시지 quota 10000건 중 8000건 사용
- **When** 8000건 도달
- **Then** 운영자에게 푸시 + `/admin/messenger/quota` 진입 시 A 빨강 표시
- **And** A의 송신 rate-limit 자동 50% 감소 (서비스 차단 회피)
- **Edge**: 운영자가 수동으로 quota 증액 가능

### S1.4 강제 회수 (운영자 무제한)
- **Given** 사용자 X가 음란 메시지 송신, 24h 회수 시한 경과
- **When** 운영자가 메시지 → "강제 회수" (권한 OWNER/ADMIN)
- **Then** 모든 수신자 화면에서 "운영자에 의해 회수된 메시지" 표시
- **And** audit log `messenger.message_deleted by_admin`, 첨부는 30일 cron이 dereference

### S1.5 신규 tenant 메신저 enable 토글
- **Given** 신규 tenant `tenant-foo` 생성됨
- **When** 운영자가 운영 콘솔 → tenant 설정 → "메신저 enable" 토글 ON
- **Then** RLS 정책 검증 후 활성화, tenant 내 멤버에게 `/messenger` 진입 권한 부여
- **And** 첫 시스템 conversation 자동 생성 (welcome 메시지)
- **Edge**: 비활성화 시 기존 메시지는 보존, 신규 송신만 차단

### S1.6 헬스 1화면
- **When** 운영자가 `/admin/messenger/health` 진입
- **Then** 한 화면에 tenant별 카드 — 활성 SSE connection 수 / 분당 메시지 / p95 latency / quota 사용률
- **And** 빨강/노랑/초록 색상으로 SLO 위반 즉시 인지
- **Edge**: tenant 20개 → 그리드 5×4 레이아웃, 정렬 가능

---

## 3. Phase 1 시나리오 — P2 협업자 (6건)

### S2.1 새 동료 검색 (cross-tenant 차단)
- **Given** P2가 tenant A에 속함, tenant B에 속한 사용자 Y는 보이면 안 됨
- **When** `/messenger/new` → "팀원 검색" 입력
- **Then** tenant A의 멤버만 자동완성 (TenantMembership 조회)
- **And** Y는 검색 결과에 나타나지 않음
- **Edge**: P2가 A+B 둘 다 멤버면 두 tenant 멤버 모두 표시 (tenant 표식과 함께)

### S2.2 답장 인용 카드
- **Given** 그룹 채팅에서 100메시지 위에 결정 메시지 있음
- **When** 해당 메시지 hover → 답장 아이콘 클릭
- **Then** composer 상단에 인용 카드(원본 미리보기 2줄) 표시
- **And** Enter로 송신 시 카드와 답장이 함께 저장 (`replyToId` FK)
- **Edge**: 원본 회수 시 답장은 "원본이 삭제되었습니다" 카드로 표시

### S2.3 @멘션 popover
- **Given** 그룹 채팅 50명
- **When** composer에서 `@` 입력
- **Then** tenant 멤버 popover (cmdk 패턴, 아바타+이름)
- **And** 화살표키 선택 → Tab/Enter로 멘션 삽입, mention된 사용자에게 push (in-app)
- **Edge**: `@everyone` (그룹 OWNER/ADMIN만), 멘션된 사용자가 비활성/차단 상태면 발송 안 함

### S2.4 이미지 5장 drag&drop
- **Given** P2가 회의 사진 5장 보유
- **When** 5장을 채팅창에 drag&drop
- **Then** filebox 업로드 (병렬), 진행률 5개 thumbnail 표시
- **And** 모두 완료 후 "송신" 버튼 활성화, 한 메시지의 attachments[]로 묶여 전송
- **Edge**: 한 장 실패 시 재시도 버튼만 표시, 나머지는 정상

### S2.5 오프라인 재시도 (clientGeneratedId)
- **Given** P2가 LTE 끊김 상태에서 메시지 작성
- **When** "송신" 클릭 → 네트워크 오류 → 자동 재시도 (LocalStorage queue)
- **Then** 재접속 시 큐 flush, 서버는 clientGeneratedId 중복 → 기존 메시지 fetch return (멱등)
- **And** UI에는 "전송 실패 → 재시도 중 → 전송됨" 상태 전이
- **Edge**: 24시간 내 재접속 안 하면 큐 폐기 (로컬 정책)

### S2.6 본문 검색
- **Given** 1주일 전 회의에서 "납기" 단어 사용
- **When** 상단 검색바에 "납기" 입력
- **Then** `/messenger/search?q=납기` 진입, 30일 윈도 LIKE 결과 10건 표시
- **And** 결과 클릭 → 해당 conversation의 해당 메시지로 deep link (스크롤+하이라이트)
- **Edge**: 검색 결과 100건 초과 시 페이지네이션, "30일 이전" 메시지는 안내 표시

---

## 4. Phase 2 시나리오 — P3 컨슈머 사용자 (6건)

### S3.1 QR 친구 추가
- **Given** P3가 신규 가입, tenant 내 다른 사용자 Z를 추가하려 함
- **When** P3가 `/messenger/contacts` → "QR 추가" 버튼 → Z의 QR 스캔
- **Then** Z에게 친구 요청 알림, Z 승인 시 1:1 conversation 생성
- **Edge**: Z가 P3 차단 중 → 자동 거부, P3에게 일반 안내(차단 사실 노출 X)

### S3.2 차단된 사용자가 그룹 초대
- **Given** P3가 사용자 Q를 차단
- **When** 다른 사용자가 P3+Q를 같은 그룹에 초대
- **Then** P3에게 "차단한 사용자 포함된 그룹" 경고 dialog → "참여 / 차단 해제 후 참여 / 거부" 3옵션
- **Edge**: 자동 거부 옵션도 설정 가능

### S3.3 프로필 사진 업로드
- **Given** P3가 5MB jpg 프로필 사진 보유
- **When** `/messenger/settings` → 프로필 사진 → 파일 선택
- **Then** filebox 업로드 → 자동 썸네일 생성 (200x200) → users.profile_image_id 갱신
- **Edge**: 5MB 초과 시 클라이언트 사이드 리사이즈 안내

### S3.4 모바일 PWA 백그라운드 알림
- **Given** P3가 모바일 PWA 설치 + 알림 권한 허용
- **When** 백그라운드에서 새 DM 수신
- **Then** Web Push 알림 (제목: 보낸 사람 이름, 본문: 미리보기 100자)
- **Edge**: iOS Safari = PWA 설치 시만 동작 (브라우저 직접 X), Q1 결정 사항

### S3.5 광고성 메시지 신고
- **Given** P3가 광고 DM 수신
- **When** 메시지 long-press → "신고" → 사유 선택 (스팸/음란/사기/기타)
- **Then** abuse_reports 테이블에 row, 운영자 큐(P1.S1.1)에 진입
- **And** 24h 내 운영자 처리 SLA, P3에게 처리 결과 알림
- **Edge**: 동일 사용자 → 동일 메시지 중복 신고 거부 (UNIQUE)

### S3.6 메시지 회수 (15분 한도, Phase 2)
- **Given** P3가 잘못된 메시지 송신, 14:50 경과
- **When** long-press → "전체 회수"
- **Then** 모든 수신자 화면에서 "회수된 메시지" 표시 (Phase 1 24h soft delete와 별개로 Phase 2의 즉시 흔적 제거)
- **Edge**: 15분 초과 시 옵션 비활성화, 운영자 강제 회수만 가능

---

## 5. Phase 2 시나리오 — P4 봇 / 외부 시스템 (6건)

### S4.1 idempotent 송신
- **Given** 봇이 CI 배포 완료 알림을 그룹에 송신
- **When** `POST /api/v1/conversations/:id/messages` (Bearer api_key, clientGeneratedId=UUIDv7)
- **Then** 메시지 1건 송신, 응답 코드 201
- **Edge**: 네트워크 재시도로 같은 요청 2번 → DB UNIQUE 위반 → 기존 메시지 fetch + 200 (멱등)

### S4.2 slash command 응답
- **Given** 그룹 채팅에 봇 멘션 + `/help`
- **When** 봇이 webhook으로 메시지 수신 (Phase 3)
- **Then** 봇이 응답 송신, 응답은 봇 메시지(senderId=botUserId)로 표시
- **Edge**: 알 수 없는 command → "Available: /help, /status, ..." 자동 응답

### S4.3 quota 초과
- **Given** tenant 일일 quota 10000건 도달
- **When** 봇이 송신 시도
- **Then** 429 + Retry-After 헤더 (다음 reset까지 초)
- **Edge**: 봇이 Retry-After 무시하고 재시도 → rate-limit-db로 추가 차단

### S4.4 차단된 사용자에게 송신
- **Given** 봇이 사용자 X에게 DM 시도, X가 봇 차단
- **When** `POST /messages`
- **Then** 403, audit `messenger.block_violation_attempt`
- **Edge**: 봇은 자동으로 차단 목록 조회 후 송신 회피하는 게 권장 패턴

### S4.5 권한 회수 후 SSE 즉시 종료
- **Given** 봇 api_key가 운영자에 의해 revoke
- **When** 봇이 SSE 구독 중
- **Then** 1초 내 SSE connection 종료, 봇은 401 인지 후 처리
- **Edge**: revoke와 동시에 publish 중이던 메시지는 드롭 안 됨 (트랜잭션 완료 보장)

### S4.6 webhook 재전송 폭주
- **Given** 봇이 순간 1초에 100건 송신
- **When** rate-limit-db (분당 60건 가정)
- **Then** 60건 후 429 응답 폭주 시작
- **Edge**: 봇은 exponential backoff 재시도 권장, rate-limit-db는 분당 60건 윈도우

---

## 부록 A — 페르소나 협업 시나리오 (P1+P2)

### S5.1 운영자가 협업자 신고 받음
- P2가 동료 R의 부적절한 메시지 신고
- P1(P2의 OWNER 역할)이 신고 큐에서 확인
- P1이 R에게 경고 + 메시지 강제 회수
- P2에게 처리 결과 알림 (`messenger.report_resolved`)

### S5.2 운영자가 자기 tenant에서 일반 협업
- P1은 OWNER이지만 일상에서는 P2 역할로 메시지 송수신
- 운영자 권한은 admin 페이지에 격리 (`/admin/messenger/*`)
- 일상 채팅 화면에서는 운영자 표식 비활성 (사용자 경험 유지)

---

## 부록 B — 페르소나별 권한 매트릭스 (요약)

| 액션 | P1 OWNER | P2 MEMBER | P3 외부 사용자 | P4 봇 |
|---|---|---|---|---|
| 메시지 송신 (자기 conversation) | O | O | O | O (api_key scope) |
| 메시지 편집 (자기) ≤15분 | O | O | O | O |
| 메시지 회수 (자기) ≤24h | O | O | O | O |
| 메시지 강제 회수 (admin) | O | X | X | X |
| 사용자 차단 | O | O | O | X (봇은 차단 대상) |
| 신고 작성 | O | O | O | X |
| 신고 resolve | O | X (MANAGER_PLUS면 가능) | X | X |
| `/admin/messenger/*` 진입 | O | X (MANAGER_PLUS면 일부 가능) | X | X |
| Tenant quota 변경 | O | X | X | X |
| Web Push 구독 | O | O | O | X |

---

## 부록 C — Phase별 페르소나 활성화 일정

```
Phase 1 (W1-W6, 4-6주):
  └─ P1, P2 활성화 (운영자 + 양평팀 협업)

Phase 2 (DAU≥30 또는 컨슈머 요구):
  └─ P3 활성화 (컨슈머 메신저 앱 사용자)
  └─ P4 활성화 (봇/외부 시스템)

Phase 3 (WAU 1000+):
  └─ 모든 페르소나 + 통화/E2E 등 고급 기능
```
