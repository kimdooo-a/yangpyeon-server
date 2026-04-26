# LINE / KakaoTalk 기능 매트릭스 + Yangpyeong 채택 전략

> **소스**: 세션 63 (2026-04-26) WebSearch + 도메인 분석 · ADR-030 §1.1 차별화 4축 보강
> **사용처**: Phase 1/2/3 기능 우선순위 결정, 디자인 리뷰, 개발 범위 협상

---

## 1. 50+ 기능 비교 매트릭스

`O` = 핵심 기능 / `△` = 부분/제한 / `X` = 미지원 / `✱` = 양평 채택 / `⏸` = Phase 보류 / `🚫` = 영구 제외

### 1.1 메시지 (12개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 1 | 1:1 DM | O | O | ✱ | | | 페어 멱등 (DIRECT kind) |
| 2 | 그룹 채팅 | O (≤500) | O (무제한) | ✱ ≤100 | 확장 ≤500 | | 보수적 시작 (Q5) |
| 3 | 채널 (1:N broadcast) | O 공식계정 | O 오픈채팅/플러스친구 | | ✱ | | write owner-only |
| 4 | 메시지 답장 (reply) | O | O | ✱ | | | replyToId self-FK |
| 5 | 메시지 편집 | X | O 15분 | ✱ 15분 | | | 카카오 채택 |
| 6 | 메시지 회수 | O 24h | O 5분 | ✱ 24h self / admin∞ | + 15분 전체회수 | | 라인+카카오 절충 |
| 7 | 메시지 삭제 (자기 화면) | O | O | ✱ (회수와 통합) | | | soft delete |
| 8 | 멘션 (@user) | △ | O | ✱ | | | 그룹 채팅 핵심 |
| 9 | 읽음 표시 | O Read 표시 | O 안 읽은 N명 | ✱ 카카오식 N | | | 그룹에서 우월 |
| 10 | 타이핑 인디케이터 | O | O | ✱ | | | 무저장 publish (Q6) |
| 11 | 메시지 검색 (본문) | O | O | ✱ LIKE 30일 | tsvector | engine | LIKE→GIN→Meili |
| 12 | 즐겨찾기/북마크 | △ | O | | ✱ | | message_bookmarks |

### 1.2 첨부 (7개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 13 | 사진 | O | O | ✱ | | | filebox 재사용 |
| 14 | 동영상 | O | O | | | ✱ | 코덱/스트리밍 복잡 |
| 15 | 음성 메모 | O | O | | ✱ | | WebAudio→ogg/opus |
| 16 | 일반 파일 | O 300MB | O 300MB | ✱ | | | filebox 화이트리스트 |
| 17 | 위치 공유 | △ | O | | | 🚫 | 개인정보 리스크 |
| 18 | 연락처 공유 | △ | O | | ✱ | | vCard 형식 |
| 19 | 캘린더/일정 | △ | △ | | ⏸ | | Phase 2 보류 |

### 1.3 풍부 표현 (5개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 20 | 이모지 (유니코드) | O | O | ✱ | | | 클라이언트 표준 |
| 21 | 스티커 | O LINE Store | O 300k+ 카카오프렌즈 | | ✱ | | filebox 폴더 단위 운영자 업로드 |
| 22 | 이모지 반응 (emoji react) | △ 6종 | X | | ✱ 6종→전체 | | 라인 패턴 시작 |
| 23 | GIF 검색 | O | O | | | ✱ | Giphy API |
| 24 | 큰 이모지 (애니메이션) | O | O | | | ⏸ | Phase 2 미정 |

### 1.4 음성/영상 통화 (4개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 25 | 1:1 음성 통화 | O | O | | | ✱ | WebRTC + TURN |
| 26 | 1:1 영상 통화 | O | O | | | ✱ | |
| 27 | 그룹 통화 | O ≤200 | O 무제한 | | | ✱ | SFU 아키텍처 |
| 28 | 화면 공유 | O | △ | | | ⏸ | Phase 3 미정 |

### 1.5 소셜·디스커버리 (8개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 29 | 친구 추천 (ML) | O | O | | | ⏸ | 머신러닝 비용 |
| 30 | QR 친구 추가 | O | O | | ✱ | | tenant-scoped UUID QR |
| 31 | 전화번호 친구 추가 | O | O | | | 🚫 | PII 회피 |
| 32 | 프로필 (사진/이름) | O | O | ✱ | | | filebox (Q4) |
| 33 | 상태 메시지 | O | O 24h 임시 | ✱ | | | 단순 텍스트 |
| 34 | 친구 목록 | O | O | ✱ | | | TenantMembership 기반 |
| 35 | 채널 구독 | O LINE Timeline | O 오픈프로필 | | | ⏸ | 1:N broadcast 모델 |
| 36 | 오픈채팅 (무명) | △ | O 강함 | | | ⏸ | 모더레이션 큐 필요 |

### 1.6 알림 (5개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 37 | in-app 알림 | O | O | ✱ | | | SSE bus |
| 38 | Push 알림 | O FCM/APNS | O | ⏸ P1.5 | ✱ | | VAPID self-host (Q1) |
| 39 | 알림 미리보기 | O | O | | ✱ | | 암호화 미리보기 |
| 40 | 알림 끄기 (mute/conversation) | O | O | ✱ | | | mutedUntil 컬럼 |
| 41 | 우선 대화 (priority) | △ 고정 | O 중요 | | ✱ | | pinnedAt 컬럼 |

### 1.7 보안·관리 (8개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 42 | 차단 (user-level) | O | O | ✱ | | | UserBlock UNIQUE |
| 43 | 신고 (Report) | O | O | ✱ | | | abuse_reports + UNIQUE |
| 44 | 차단 후 그룹 만남 처리 | △ | O | ✱ | | | S3.2 시나리오 |
| 45 | E2E 암호화 (Secret Chat) | O 채팅 단위 | O 별도 모드 | | | ✱ | Signal Protocol (Q10) |
| 46 | 다중 디바이스 sync | O | O | | | ✱ | device_id ack 필요 |
| 47 | 백업/복원 | △ | O KakaoCloud | | | ✱ | tenant 단위 export |
| 48 | 메시지 자동 삭제 (TTL) | O Letter Sealing | △ | | ⏸ | | Phase 2 미정 |
| 49 | 화면 캡처 차단 알림 | △ | △ | | | ⏸ | 모바일 OS 제한 |

### 1.8 봇 / 외부 통합 (5개)

| # | 기능 | LINE | Kakao | YP P1 | YP P2 | YP P3 | 비고 |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| 50 | 챗봇 SDK | O Messaging API | O i 비즈 | | | ✱ | Edge Function (Q3) |
| 51 | 슬래시 명령 | X | X | | | ✱ | `/help`, `/status` |
| 52 | webhook 수신 (incoming) | O | O | | ⏸ | | Phase 2 미정 |
| 53 | webhook 발신 (outgoing event) | O | O | | ✱ | | message.created→외부 알림 |
| 54 | API key scopes | O | O | ✱ (기존 ApiKey 재사용) | 정밀화 | | scopes: read/write/moderate |

### 1.9 결제·커머스 (4개) — 영구 제외

| # | 기능 | LINE | Kakao | YP | 비고 |
|---|---|:-:|:-:|:-:|---|
| 55 | 송금/페이 | O LINE Pay | O 카카오페이 | 🚫 | 금융 라이선스 |
| 56 | 광고 | O | O | 🚫 | 비즈니스 모델 차이 |
| 57 | 쇼핑 | △ LINE Shopping | O 카카오쇼핑 | 🚫 | 범위 외 |
| 58 | IAP / 스티커 마켓 | O | O | 🚫 | 콘텐츠 시장 운영 부담 |

---

## 2. 양평 채택 전략 — 4가지 차별화 축

### 축 1: Multi-tenant 격리 (LINE/Kakao 미지원)
- 모든 메시지/대화/멤버십 `tenant_id` 첫 컬럼 + RLS (ADR-022 §1)
- cross-tenant DM 차단 — 같은 tenant 멤버끼리만 대화 가능
- tenant별 quota / SLA / 격리된 SSE 채널

### 축 2: Plugin 아키텍처 (LINE의 Messaging API보다 깊음)
- `packages/tenant-messenger/` plugin 분리 (Phase 2)
- manifest.ts로 cron / routes / permissions / quota 선언적 정의 (ADR-026)
- 컨슈머 추가 = 코드 수정 0줄 (ADR-022 §4)

### 축 3: 1인 운영 친화 (LINE/Kakao는 대규모 팀 운영 가정)
- 운영자 1클릭 차단/회수 도구 (S1.1, S1.4)
- tenant quota 자동 throttle (S1.3)
- 헬스 1화면 — 20개 tenant 한 눈 (S1.6)
- audit log 표준화 (10이벤트, 운영자 디버깅 단일 소스)

### 축 4: 점진적 출시 (라인/카카오의 빅뱅 출시와 반대)
- Phase 1 4-6주 → 코어 임베디드, 모델 검증
- Phase 2 → plugin 분리, 풍부 표현 (이모지/스티커/QR)
- Phase 3 → 통화/E2E (완전 옵션)

---

## 3. 라인 vs 카카오 핵심 차이 5가지 (양평 의사결정 영향)

### 3.1 그룹 인원 한도
- 라인: 500명, 카카오: 무제한
- **양평 채택**: 100명 시작 (보수적), 부하 테스트 후 500까지 확장 (Q5)
- 이유: 그룹 100명 + 메시지 fan-out = SSE bus 부하 200 connection × 100 = 20000 events/sec 잠재. 1인 운영 부담 회피.

### 3.2 스티커 생태계
- 라인: LINE Store 중심, 유료 스티커 수익 모델
- 카카오: 카카오프렌즈 IP 30만+, 무료 무수
- **양평 채택**: filebox 폴더 단위 운영자 업로드. 유료 마켓 미운영 (🚫)
- 이유: IP/콘텐츠 시장 운영은 1인 부담 비대칭

### 3.3 메시지 회수 정책
- 라인: 24시간
- 카카오: 5분
- **양평 채택**: P1 24h self / admin 무제한, P2에 15분 "전체 회수" 추가
- 이유: 24h는 평소 실수 회복용, 15분 전체 회수는 즉각 후회 시나리오 (라인+카카오 절충)

### 3.4 읽음 표시 방식
- 라인: 메시지 옆 "Read"
- 카카오: 안 읽은 사람 수 (예: "3")
- **양평 채택**: 카카오식 (안 읽은 N명)
- 이유: 그룹 채팅에서 정보 가치 우월 — "누가 안 읽었는지"가 협업 도구로 더 유용

### 3.5 답장 UI
- 라인: 메시지 위 인용 카드 (시각적 분리)
- 카카오: 본문 안 인용 (일체화)
- **양평 채택**: 라인식 인용 카드
- 이유: 긴 본문 + 인용 시 가독성 우월. 답장 카드 click → 원본으로 스크롤 점프 UX 가능.

---

## 4. 기능 우선순위 — Phase별 카운트

| Phase | 채택 (✱) | 보류 (⏸) | 영구 제외 (🚫) |
|---|---|---|---|
| **P1 (4-6주)** | 17 | — | — |
| **P2 (DAU≥30 후)** | 14 | 6 | — |
| **P3 (WAU 1000+)** | 9 | 3 | 4+ |
| **합계** | 40 | 9 | 4+ |

총 50+ 기능 중 양평 채택 40개. LINE/Kakao 핵심의 ~80% 커버.

---

## 5. 채택하지 않은 기능 분석 (왜 안 가져오는가)

### 5.1 영구 제외 (🚫) 4건 — 이유 명확
| 기능 | 이유 |
|---|---|
| 위치 공유 | 개인정보 보호법 + 1인 운영자 보안 부담 |
| 송금/페이 | 금융 라이선스 (전자금융업) |
| 광고 모듈 | BaaS 정체성과 충돌 (closed multi-tenant) |
| IAP/스티커 마켓 | 콘텐츠 시장 운영 부담 비대칭 |

### 5.2 Phase 보류 (⏸) 9건 — 시점 미정
- 캘린더 통합, 친구 추천 ML, 채널 구독, 오픈채팅, 메시지 TTL, 화면 캡처 차단, 화면 공유, 큰 이모지, incoming webhook
- 모두 "필요성 명확해질 때 별도 ADR로 도입" 원칙

---

## 6. 디자인 차별화 카드 (시각적)

```
┌─ 라인 ─────────────┐  ┌─ 카카오 ───────────┐  ┌─ 양평 ────────────┐
│ 본인=초록 #06C755  │  │ 본인=노랑 #FAE100  │  │ 본인=brand #2D9F6F │
│ 상대=흰색          │  │ 상대=흰색          │  │ 상대=surface-200   │
│ 라운드 4-corner    │  │ tail (꼬리) 있음   │  │ 12px 라운드 (꼬리X)│
│ 메시지 옆 시간     │  │ 메시지 위 그룹화   │  │ 1분 묶음 그룹화    │
│ "Read" 표시        │  │ 안 읽은 N명 숫자   │  │ 안 읽은 N명 숫자   │
│ 답장=인용 카드     │  │ 답장=본문 안 인용  │  │ 답장=인용 카드     │
│ 이모지 6종 반응    │  │ 이모지 반응 X      │  │ P1 6종 → P2 전체   │
│ 미니멀, 여백 多    │  │ 조밀, 정보 밀도 高 │  │ 라인 여백 + 카카오 │
│                    │  │                    │  │ 정보밀도 절충      │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

---

## 7. 참고 / 출처

- LINE 그룹 채팅 한도: [LINE Developers - Group Chats](https://developers.line.biz/en/docs/messaging-api/group-chats/)
- 카카오 vs LINE 비교: [Inquivix - KakaoTalk vs LINE](https://inquivix.com/kakaotalk-vs-line/)
- 카카오 이모티콘 시장: [Inquivix - Kakao Emoticons](https://inquivix.com/kakao-emoticons/)
- 아시아 메신저 비교 (WeChat 포함): [btrax - Asia's Battle of the Messaging App](https://blog.btrax.com/asias-battle-of-the-messaging-app-wechat-vs-line-vs-kakaotalk/)

---

## 8. 다음 행동 (Phase 1 진입 시)

1. 본 매트릭스 기준 Phase 1 17개 기능을 `api-surface.md`에 라우트로 표현
2. `data-model.md`에 Phase 1 모델 11종 + Phase 2 모델 2종 정의
3. `wireframes.md`에 시각 차별화 카드를 ASCII 와이어로 구현
4. 마일스톤 W6 종료 후 본 매트릭스 갱신 (실제 채택/스킵 결과 기록)
