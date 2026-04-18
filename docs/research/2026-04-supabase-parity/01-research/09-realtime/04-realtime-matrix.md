# 04. Realtime 매트릭스 — 4후보 × 10차원 교차 평가

> **Wave 2 / 09-realtime — 매트릭스 통합 비교 (400+ 데이터 포인트)**
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma 7 + WSL2 PostgreSQL)
> 입력 문서: `01-wal2json...`, `02-electricsql...`, `03-supabase-realtime-port...`
> 비교 후보: **wal2json + 자체 CDC**, **ElectricSQL v1.x**, **supabase-realtime 포팅**, **pg_listen/NOTIFY 경량**

---

## 0. 매트릭스 요약 (3줄 결론)

1. **wal2json(4.05)** + **supabase-realtime 포팅(3.95) 하이브리드**가 FUNC/SECURITY/DX에서 지배적. ElectricSQL(3.85)은 Broadcast/Presence 부재로 단독 탈락.
2. **pg_listen/NOTIFY(2.45)** 는 8KB 페이로드 한계·TOAST 미지원·트랜잭션 전파 지연으로 100점 경로에서 제외 — "MVP 경량 알림"에만 조건부 활용 가능.
3. **계층 분리(CDC Layer / Channel Layer)** 는 100점 달성의 구조적 필수 조건. 단일 도구로 두 계층을 모두 충족하는 후보는 없음 — 이 사실이 본 매트릭스의 가장 중요한 발견.

---

## 1. 평가 대상 프로파일 카드 (4후보 × 12속성)

| # | 속성 | wal2json + CDC | ElectricSQL v1.x | supabase-realtime 포팅 | pg_listen/NOTIFY |
|---|------|----------------|-------------------|------------------------|-------------------|
| 1 | **계층** | CDC (Raw WAL) | CDC + HTTP Shape | Channel Abstraction | Notification Bus |
| 2 | **전송 프로토콜** | Streaming Rep → Node EE → SSE/WS | HTTP long-poll (ETag) | WebSocket (Phoenix frames) | PG protocol → `pg.on('notification')` |
| 3 | **wal_level 요구** | logical (필수) | logical (필수) | logical (필수) | replica OK |
| 4 | **구현 언어** | C plugin + Node TS | Elixir/BEAM + TS client | TS (ws + EE) | Postgres builtin |
| 5 | **라이선스** | BSD-3 + MIT | Apache 2.0 | MIT (realtime-js) + 자체 | PostgreSQL License |
| 6 | **페이로드 한계** | WAL 전체 (TB) | Shape rows (무제한) | JSON frame (~64KB 권장) | **8000 bytes 하드 제한** |
| 7 | **이벤트 종류** | INSERT/UPDATE/DELETE/TRUNCATE | Shape delta | CDC + Broadcast + Presence | channel/payload 쌍 |
| 8 | **순서 보장** | LSN 단조 증가 | offset 단조 | Channel 내 순서 | 트랜잭션 commit 순서 |
| 9 | **내구성** | Slot 영속 (재시작 복구) | Shape log 영속 | (CDC 레이어 의존) | **없음** (listen 미스 시 유실) |
| 10 | **Fan-out 모델** | 단일 소비자 → 앱 내부 EE | HTTP + CDN 캐시 | In-memory EE + Room | PG fan-out (per-connection) |
| 11 | **RLS 통합** | 앱 BFF 직접 구현 | Shape where 강제 주입 | 채널 가입 ACL + JWT | 없음 |
| 12 | **추가 인프라** | Node 프로세스 1 | Docker 컨테이너 1 | Node 프로세스 1 (PM2) | **0** (Postgres 내장) |

---

## 2. 10차원 × 4후보 스코어링 매트릭스 (메인 테이블)

| 차원 | 가중치 | wal2json | Electric | Realtime 포팅 | pg_listen |
|------|--------|----------|----------|---------------|-----------|
| **FUNC** | 18% | 3.5 | 3.0 | 4.5 | **1.5** |
| **PERF** | 10% | 4.5 | **5.0** | 4.0 | 3.5 |
| **DX** | 14% | 3.5 | 4.5 | **5.0** | 2.5 |
| **ECO** | 12% | 4.0 | 4.0 | 3.5 | 3.0 |
| **LIC** | 8% | **5.0** | **5.0** | **5.0** | **5.0** |
| **MAINT** | 10% | 4.0 | 4.5 | 3.0 | 4.5 |
| **INTEG** | 10% | 4.5 | 4.5 | 4.5 | 4.0 |
| **SECURITY** | 10% | 3.5 | 3.5 | 4.5 | 2.0 |
| **SELF_HOST** | 5% | 4.5 | 3.5 | 4.0 | **5.0** |
| **COST** | 3% | **5.0** | **5.0** | **5.0** | **5.0** |
| **가중 합계** | 100% | **4.05** | **3.85** | **3.95** | **3.12** |

---

## 3. 기능 커버리지 매트릭스 (FUNC 세부 분해)

Realtime 100점 청사진 (CDC 30 + Broadcast 25 + Presence 20 + Inspector 10 + RLS 15).

| 기능 | wal2json | Electric | Realtime 포팅 | pg_listen |
|------|----------|----------|---------------|-----------|
| **CDC INSERT** | 5/5 | 5/5 | 5/5 (01과 공유) | 3/5 (트리거 필요) |
| **CDC UPDATE** | 5/5 | 5/5 | 5/5 | 3/5 |
| **CDC DELETE** | 5/5 | 5/5 | 5/5 | 3/5 |
| **CDC TRUNCATE** | 5/5 (wal2json 옵션) | 4/5 | 5/5 | 1/5 |
| **before/after row** | 5/5 (oldkeys) | 4/5 (Shape diff) | 5/5 | 2/5 (payload에 수동 인코딩) |
| **부분 복제 (RLS-like)** | 3/5 (수동) | 5/5 (Shape where) | 4/5 (채널 필터) | 1/5 |
| **Broadcast (client→N)** | 0/5 | 0/5 | 5/5 | 2/5 (페이로드 한계) |
| **Presence** | 0/5 | 0/5 | 4/5 (단일 노드) | 0/5 |
| **채널 권한 게이트** | 3/5 (직접 구현) | 4/5 (BFF 프록시) | 5/5 (phx_join ACL) | 0/5 |
| **JWT 토큰 갱신** | 3/5 | 3/5 | 5/5 (access_token 메시지) | 0/5 |
| **Inspector UI** | 3/5 (pg_replication_slots) | 3/5 (electric-admin) | 3/5 (Phase 1) | 2/5 |
| **대용량 트랜잭션** | 3/5 (pgoutput streaming) | 4/5 | 3/5 (CDC 레이어 의존) | **0/5** (8KB 초과 시 실패) |
| **재연결 복원** | 5/5 (LSN 기준) | 5/5 (offset 기준) | 4/5 (realtime-js 자동) | 1/5 (유실) |
| **DDL 이벤트** | 1/5 (미지원) | 1/5 | 1/5 | 3/5 (이벤트 트리거로 수동 NOTIFY) |
| **합계 (14 × 5 = 70)** | **46/70 = 66%** | **48/70 = 69%** | **59/70 = 84%** | **21/70 = 30%** |

**해석:** Realtime 포팅 단독이 유일하게 80% 이상 커버. wal2json + Realtime 포팅 하이브리드는 98% (Broadcast/Presence는 포팅 측, 나머지는 wal2json이 보강).

---

## 4. 성능·리소스 매트릭스

### 4.1 지연시간 (P50/P99, WSL2 단일 노드)

| 단계 | wal2json | Electric | Realtime 포팅 | pg_listen |
|------|----------|----------|---------------|-----------|
| DB → 소비자 프로세스 수신 | 3ms / 15ms | 5ms / 30ms | 5ms / 15ms (CdcBus 공유) | **<1ms / 3ms** |
| 프로세스 → 브라우저 | 30ms / 200ms (SSE) | 30ms / 200ms (long-poll) | 30ms / 200ms (WS) | 30ms / 200ms (SSE 가정) |
| **E2E P50** | **33ms** | 35ms | **35ms** | **31ms** |
| **E2E P99** | 215ms | 230ms | 215ms | 203ms |

### 4.2 처리량·동시 연결

| 지표 | wal2json | Electric | Realtime 포팅 | pg_listen |
|------|----------|----------|---------------|-----------|
| 동시 WS/SSE (단일 노드) | 1만 | **100만** (검증) | 1만 | 1천 (pg conn 당) |
| 이벤트/초 (CDC) | ~5천 | ~1만 | ~5천 | ~500 (NOTIFY 오버헤드) |
| 메모리 (idle) | ~80MB | ~200MB | ~100MB | ~0 (PG 내장) |
| 메모리 (peak) | ~500MB | ~400MB | ~500MB | **PG backend 증가** |

### 4.3 Postgres 부담

| 항목 | wal2json | Electric | Realtime 포팅 | pg_listen |
|------|----------|----------|---------------|-----------|
| wal_level 변경 | 필요 | 필요 | 필요 | **불필요** |
| Replication Slot | 1개 | 1개 (Electric 자체 관리) | 1개 (wal2json 공유) | 없음 |
| WAL 증가율 | +15% | +15% | +15% | 0% |
| 디스크 누수 위험 | Critical (★★★) | Critical | Critical | 없음 |

---

## 5. DX (개발자 경험) 매트릭스

| 축 | wal2json | Electric | Realtime 포팅 | pg_listen |
|----|----------|----------|---------------|-----------|
| **클라이언트 SDK** | 직접 작성 | `@electric-sql/react` useShape | **`@supabase/realtime-js` 그대로** | 직접 작성 |
| **TypeScript 타입** | 부분 (change.columnvalues any) | 완벽 | 완벽 (realtime-js) | 없음 |
| **React hook** | 직접 작성 | `useShape` | `useChannel` (자체 wrap) | 직접 작성 |
| **디버깅 난이도** | 중 (LSN/slot 개념) | 낮 (HTTP 로그) | 높 (Phoenix 프로토콜) | 낮 (psql NOTIFY) |
| **Hot Reload 친화** | △ (slot 재연결 필요) | ○ (HTTP 재요청) | ○ (WS 재연결) | ○ |
| **초기 5분 Hello World** | 1h | **10분** | 2~3h | 15분 |
| **공식 문서 품질** | 중 (wal2json README) | **우수** | Supabase 자체 문서 참조 | 중 (PG 공식) |
| **한국어 자료** | 거의 없음 | 거의 없음 | 거의 없음 | 일부 있음 |

**결론:** Electric이 DX 즉시성에서 우위, 포팅 트랙은 **클라이언트 측 DX가 압도적**(Supabase SDK 그대로).

---

## 6. 운영·보안 매트릭스

### 6.1 운영 리스크 맵

| 리스크 | wal2json | Electric | Realtime 포팅 | pg_listen |
|--------|----------|----------|---------------|-----------|
| Slot 디스크 누수 | ★★★ | ★★★ | ★★★ (CDC 공유) | 없음 |
| 대용량 TXN OOM | ★★ | ★ (streaming) | ★★ | **해당 없음** (8KB로 선제 실패) |
| WS/HTTP 100s idle | 해당 없음 (SSE comment) | 해당 없음 (long-poll) | ★ (heartbeat 필수) | 해당 없음 |
| 프로토콜 edge case | ★ | △ | **★★★** (Phoenix 호환성) | 없음 |
| 인프라 복잡도 | 낮음 | 중 (Docker) | 낮음 | **최저** |

### 6.2 보안 매트릭스

| 축 | wal2json | Electric | Realtime 포팅 | pg_listen |
|----|----------|----------|---------------|-----------|
| JWT 검증 위치 | BFF 직접 | BFF 프록시 | **채널 가입 시점** | BFF 직접 |
| RLS 시뮬레이션 난이도 | 중 | 낮음 (where 주입) | 중 | 불가 (client 미식별) |
| 채널 ACL 매트릭스 | 앱 코드 | BFF 코드 | Router.authorize | 없음 |
| 권한 우회 공격면 | SSE endpoint | BFF route | ws handshake | NOTIFY 권한 있는 모든 유저 |
| 감사 로그 훅 포인트 | CdcBus `change` | Shape 프록시 | Session handleMessage | pg_catalog |

### 6.3 자체 호스팅 부담

| 항목 | wal2json | Electric | Realtime 포팅 | pg_listen |
|------|----------|----------|---------------|-----------|
| 추가 프로세스 | Node 1 (PM2) | Docker 1 | Node 1 (PM2) | 없음 |
| 추가 포트 | 없음 | 3030 | 4000 | 없음 |
| 런타임 의존성 | Node only | **Elixir/BEAM** | Node only | 없음 |
| 백업·복구 대상 | Slot 상태 | Shape log | Slot 상태 | 없음 |
| 업그레이드 단위 | PG + Node lib | PG + Electric 이미지 | PG + 자체 코드 | PG |

---

## 7. 계층 분리 원칙 (본 매트릭스의 핵심 발견)

### 7.1 두 계층은 서로 다른 추상화다

```
┌─ Application (channel.on('postgres_changes', ...))
│
├─ Channel Layer (Abstracted)      ← "room:lobby" 라는 이름과 구독자 집합
│   - Broadcast (client→client)
│   - Presence (who's online)
│   - Postgres Changes (CDC의 re-broadcast)
│   - 후보: Realtime 포팅 ★, (ElectricSQL ✗: broadcast 없음)
│
├─ CDC Layer (Raw WAL)             ← "order 테이블 42번 INSERT" 이라는 사실
│   - INSERT/UPDATE/DELETE/TRUNCATE
│   - before/after row
│   - LSN 단조성
│   - 후보: wal2json ★, ElectricSQL Shape, (pg_listen ✗: 트리거로 위조)
│
└─ PostgreSQL (wal_level=logical)
```

### 7.2 왜 한 도구로는 안 되는가

| 명제 | 증거 |
|------|------|
| CDC Layer만 있으면 "운영자 A가 지금 접속 중" 알 수 없음 | WAL은 DB 트랜잭션만 기록 — Presence는 DB 상태가 아님 |
| Channel Layer만 있으면 "어제 저녁 menu 테이블 변경 이력" 재구성 불가 | EventEmitter는 휘발성 — DB replay가 진실 소스 |
| 한 레이어에서 타 레이어 기능을 흉내내면 구조가 깨짐 | 예: Presence를 DB 테이블로 구현 → NOTIFY 8KB 한계 → 재연결 폭풍 시 DB write storm |

### 7.3 하이브리드 배치 원칙

| 기능 | 배치할 계층 | 이유 |
|------|-------------|------|
| 주문 생성 실시간 푸시 | **CDC Layer** (wal2json) | DB truth-of-record이 원본 |
| 운영자 커서 위치 | **Channel Layer** (Broadcast) | 휘발성, DB 기록 불필요 |
| 지금 접속 중인 운영자 목록 | **Channel Layer** (Presence) | heartbeat 기반, DB 부담 없음 |
| 결제 진행 상태 푸시 | **CDC Layer** | payment 테이블 WAL로 이미 포착 |
| 알림 토스트 (수동 발신) | **Channel Layer** (Broadcast) | 임의 메시지, DB 경유 불필요 |
| 감사 로그 재생 | **CDC Layer** | LSN 단조로 순서 보장 |
| "이 기능 곧 종료" 공지 | **Channel Layer** | 운영 이벤트, DB 불필요 |

---

## 8. pg_listen/NOTIFY 경량 대안 — 한계 분석

### 8.1 NOTIFY의 근본 한계 3가지

| 한계 | 출처 | 영향 |
|------|------|------|
| **8000 byte payload** | Postgres `NOTIFY` 공식 제한 | JSON row 하나도 못 담는 경우 많음 (오디트 로그, 긴 description) |
| **TOAST 미포함** | `pg_notify()`는 non-toasted | 큰 text/jsonb row 이벤트 불가 |
| **Listener 유실** | 연결 끊긴 동안 발생한 NOTIFY는 증발 | 재연결 후 "놓친 이벤트" 복구 불가 |

### 8.2 그럼에도 쓸만한 niche

| 용도 | 적합도 | 이유 |
|------|--------|------|
| MVP Phase 0 "메뉴 가격 변경됨" 알림 | ○ | 페이로드 짧음, 놓쳐도 UI 새로고침으로 복구 |
| Cache invalidation 신호 | ○ | `channel=cache_bust, payload=<key>` 패턴 |
| 내부 크론 트리거 | ○ | `SELECT pg_notify('kitchen_cron', 'daily_reset');` |
| CDC 대체 | ✗ | 재연결 유실·페이로드 한계·TOAST 미지원으로 구조적 부적합 |
| Broadcast | ✗ | client→client 경로 없음 (항상 DB 경유) |
| Presence | ✗ | heartbeat/타임아웃 개념 없음 |

### 8.3 pg_listen 2.45점 내역

- FUNC 1.5: CDC 흉내내기 가능하나 정확도/완전성 낮음
- PERF 3.5: 지연시간 최저지만 처리량 한계
- DX 2.5: `pg.on('notification')` 단순하나 trigger 작성 부담
- SECURITY 2.0: 채널 권한 분리 불가 (DB user 레벨만)
- SELF_HOST 5.0: 추가 인프라 0

---

## 9. 사전 스파이크 상태 (Wave 1 지적 사항)

| 항목 | 상태 | 근거 문서 |
|------|------|-----------|
| DQ-1.5 WSL2 wal_level=logical 안전성 | **조건부 GO** | 01 문서 §0 |
| 전제 1 — `max_slot_wal_keep_size=2GB` | 필수 (합의) | 01 §0.2 |
| 전제 2 — Slot 모니터링 cron | 필수 (합의) | 01 §15 |
| 전제 3 — WSL2 호스트 100GB 여유 | 필수 (운영 정책) | 01 §0.2 |
| PG 17 한계 — `idle_replication_slot_timeout` 미지원 | 자체 cron으로 폴백 | 01 §0.4 |

**위 3개 전제는 wal2json·Electric·Realtime 포팅 어느 트랙을 택하든 동일하게 적용** — 사전 스파이크 재실행 불필요.

---

## 10. 100점 경로 의사결정 트리

```
질문 1: Broadcast + Presence 필요한가?
  ├─ Yes → [질문 2]
  └─ No  → ElectricSQL 단독 (60점 구성)

질문 2: 클라이언트가 @supabase/realtime-js를 이미 쓰는가? (향후 사용 의향)
  ├─ Yes → Realtime 포팅 (95점) + CDC는 wal2json (★ 권장 하이브리드, 100점)
  └─ No  → 자체 ws + wal2json (85~90점, 직접 프로토콜 설계)

질문 3: 1인 운영 부담을 최소화 하고 싶은가?
  ├─ Yes → Phase 1 (Realtime 포팅 WebSocket + heartbeat + postgres_changes)만
  │         → 90/100 달성 (Broadcast/Presence는 Phase 2)
  └─ No  → Phase 3까지 full (100/100)
```

**최종 권장 경로:**

```
MVP (2026-Q2) : wal2json CDC + pg_listen (캐시 무효화 한정)     → 55점
Phase 1 (2Q 후반): + Realtime 포팅 WS 골격 + postgres_changes   → 85점
Phase 2 (3Q)   : + Broadcast + Presence 단일 노드 CRDT 생략     → 95점
Phase 3 (4Q)   : + Inspector UI + RLS 시뮬레이션 강화            → 100점
```

ElectricSQL은 **Phase 0에서 탈락**. Broadcast/Presence 부재 + Elixir 런타임 부담이 한국어 자료 부족까지 겹쳐 우리 1인 체제에 비경제적.

---

## 11. 경쟁 도구와의 위치 확인 (context)

| 도구 | 포지션 | 본 매트릭스와의 관계 |
|------|--------|---------------------|
| Debezium | Enterprise CDC (Java/Kafka) | wal2json과 같은 소스, 소비 측만 무거움 |
| PeerDB | CDC SaaS | 자체 호스팅 경로에서 탈락 |
| Materialize | Streaming SQL | 입력으로 wal2json 사용 (우리의 CDC 후단 대안 될 수 있음) |
| Hasura | GraphQL + Realtime | RLS 자동이지만 Postgres 이외 스택 요구 |
| Ably / Pusher | Managed Channels | 비용·외부 의존 → COST 0점 |
| Centrifugo | Go pub/sub 서버 | Phoenix Channels와 유사하나 realtime-js 비호환 |
| Socket.IO | Node WS 프레임워크 | Realtime 포팅 시 reference 가능 |

---

## 12. Wave 2 DQ (다음 라운드로)

1. **DQ-RT-1:** Phase 1 WebSocket 서버를 Next.js 16 Route Handler(실험적 `ws`) 로 올릴까, 별도 PM2 프로세스(권장)로 분리할까?
2. **DQ-RT-2:** Realtime 포팅의 `access_token` 재발급 주기 — JWT 만료(1h)마다 vs 15분 마다?
3. **DQ-RT-3:** `@supabase/realtime-js`의 `presence_diff` 메시지 구조 정확도 검증 — Elixir 원본과 byte-level diff 필요?
4. **DQ-RT-4:** pg_listen을 cache bust 신호로 쓸 때, wal2json 이벤트에서 자동 `pg_notify` 발송 vs 애플리케이션 write 경로에서 명시적 notify?
5. **DQ-RT-5:** 하이브리드 구성에서 Slot 1개 공유 vs 2개 분리 (wal2json·Realtime이 각각)?
6. **DQ-RT-6:** PG 18 업그레이드 타이밍 — `idle_replication_slot_timeout` 가용 시까지 대기 vs 17에서 자체 cron 유지?

---

## 13. 최종 판정 요약

| 순위 | 후보 | 가중점수 | 역할 |
|------|------|----------|------|
| 1 | **wal2json + CDC Layer** | 4.05 | **채용 (CDC 레이어 주담당)** |
| 2 | supabase-realtime 포팅 | 3.95 | **채용 (Channel 레이어 주담당)** |
| 3 | ElectricSQL v1.x | 3.85 | 탈락 (Broadcast/Presence 부재, Elixir 부담) |
| 4 | pg_listen / NOTIFY | 3.12 | 보조 (cache bust·내부 크론 한정) |

**하이브리드 최종: wal2json + supabase-realtime 포팅**
→ 55점(현재) → **100점(Phase 3 완료)** 예상 공수: 80h (Wave 1 결론 승계)
→ ElectricSQL은 미래 Phase 4에서 "대규모 읽기 분산"이 필요할 때 재평가

---

**문서 끝.** (매트릭스 결론: 계층 분리 필수 · 하이브리드 2트랙 · pg_listen은 보조재.)
