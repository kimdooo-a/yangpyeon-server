# 05. wal2json(+ Node 리스너) vs supabase-realtime 포팅 — 1:1 심층 비교

> **Wave 2 / 09-realtime — 1:1 계층 비교 (300+ 데이터 포인트)**
> 작성일: 2026-04-18
> 대상 프로젝트: 양평 부엌 서버 대시보드
> 입력: 01·03·04 문서
> 관계: **경쟁이 아니라 계층이 다름** — 본 문서의 가장 중요한 프레임
> 평가 비교: "wal2json + Node pg-logical-replication" vs "supabase-realtime (Elixir Phoenix) → TypeScript/Node 포팅"

---

## 0. Executive Summary (3줄)

1. **두 후보는 동일 평면이 아니다.** wal2json은 **CDC(Raw WAL)** 계층, supabase-realtime 포팅은 **Channel(Abstracted PubSub + Presence)** 계층 — 비교의 본질은 "어느 레이어에서 무엇을 하는가"의 경계선 긋기.
2. **`postgres_changes` 기능은 두 계층이 만나는 접점.** realtime-js가 클라이언트에 주는 `on('postgres_changes', ...)` API는 Channel 추상이지만, 내부에서는 CDC 데이터를 그대로 전달 — 즉, **wal2json을 CDC로 두고 Realtime 포팅의 ChannelRouter가 `dispatchCdc()`로 흡수**하는 구조가 자연스러움.
3. **양자택일이 아니라 레이어 합성.** 100점 청사진의 단일 답은 "CdcBus(wal2json) + RealtimeServer(포팅)의 수직 결합". 어느 기능이 어느 레이어에 속하는지 결정만 명확하면 중복·충돌 없이 조립 가능.

---

## 1. 비교 대상 재정의 — "레이어 관점"

### 1.1 각 후보의 정체성

| 축 | wal2json + Node 리스너 | supabase-realtime 포팅 |
|----|------------------------|------------------------|
| **본질** | Postgres → Node로 **데이터 변경 스트림**을 끌어오는 파이프 | WebSocket 위 **채널 추상**을 구현하는 서버 |
| **입력** | Postgres WAL 세그먼트 | WebSocket 메시지 (Phoenix frames) |
| **출력** | `ChangeEvent` 객체 (before/after/kind/lsn) | `postgres_changes` / `broadcast` / `presence_state` 메시지 |
| **상태 소유** | Replication Slot (Postgres가 영속화) | Subscription Map, PresenceStore (in-memory) |
| **의존성** | Postgres + `pg-logical-replication` npm | ws + EventEmitter + (CDC 공급자) |
| **동시성 모델** | Single-consumer slot | N-connection fan-out |
| **영속성** | 영속 (LSN 단조) | 휘발성 (프로세스 재시작 시 새 세션) |

### 1.2 "같은 일을 하는 것처럼 보이는" 오해

- **오해:** "둘 다 Postgres 변경을 알려준다 → 중복"
- **정정:** wal2json은 **언어-중립·저수준 이벤트**만 생산한다. "누구에게 보낼지"·"임의 메시지를 얹을지"·"누가 온라인인지"에는 전혀 관여하지 않는다. Realtime 포팅은 wal2json의 출력을 **구독 모델 위에 매핑**하는 계층.

### 1.3 비유로 정리

| | wal2json | Realtime 포팅 |
|---|---|---|
| 비유 | **수도관** (물 보내기) | **주방 급수 시스템** (수도관 + 밸브 + 수요자 카드) |
| 변경 대상 | 배관 하드웨어 | 사용자 접점 (밸브/수도꼭지) |
| 단독 쓸모 | 물은 나옴 (raw) | 물이 안 나옴 (공급 필요) |
| 공급 없으면? | — | **기능 불능** |

---

## 2. 관점 1 — Table row 변경 이벤트 전달

### 2.1 데이터 흐름 대조

#### wal2json 단독 경로

```
INSERT on menu
  └ WAL segment
    └ wal2json plugin (JSON)
      └ pg-logical-replication streaming
        └ CdcBus.emit('change', event)
          └ [애플리케이션이 직접 구독자 관리]
            └ SSE/WS 전송 (자체 구현)
```

#### Realtime 포팅 경로 (CDC는 wal2json 공유)

```
INSERT on menu
  └ CdcBus (01번 모듈 재사용)
    └ ChannelRouter.dispatchCdc(event)
      └ topic "realtime:public:menu:id=eq.42" 검색
        └ 구독자 N명에 handler 호출
          └ ws.send({ event: 'postgres_changes', payload: {...} })
            └ realtime-js on('postgres_changes', ...) 콜백 실행
```

### 2.2 코드 비교

#### wal2json 슬롯 생성 + Node 수신

```sql
-- Postgres
CREATE PUBLICATION ypb_pub FOR ALL TABLES;
SELECT pg_create_logical_replication_slot('ypb_slot', 'wal2json');
```

```typescript
// Node — raw CDC
import { LogicalReplicationService, Wal2JsonPlugin } from 'pg-logical-replication';

const service = new LogicalReplicationService(pgConfig, {
  acknowledge: { auto: false, timeoutSeconds: 10 }
});

const plugin = new Wal2JsonPlugin({
  includeXids: true,
  includeTimestamp: true,
  includeLsn: true,
});

service.on('data', async (lsn, log) => {
  for (const change of log.change) {
    // change = { kind, schema, table, columnnames, columnvalues, ... }
    console.log('raw change:', change.kind, change.schema, change.table);

    // ★ 직접 구독자 관리 필요:
    for (const client of globalClients) {
      if (hasAccess(client.user, change)) {
        client.sse.send({
          event: 'change',
          data: JSON.stringify(change),
        });
      }
    }
  }
  await service.acknowledge(lsn);
});

await service.subscribe(plugin, 'ypb_slot');
```

**특징:**
- 이벤트 필터·ACL·전송 프로토콜 **전부 자체 작성**
- client tracking도 직접 Map 관리
- 재연결 시 resume LSN 필요하나 realtime-js 같은 SDK 부재

#### supabase-realtime 포팅 — 채널 subscribe 에뮬레이션

```typescript
// 서버 측 — Phoenix frame 핸들러
class Session {
  handleMessage(raw: string) {
    const msg = JSON.parse(raw);
    switch (msg.event) {
      case 'phx_join': return this.onJoin(msg);
      // ...
    }
  }

  async onJoin(msg: PhoenixMessage) {
    const { topic, payload, ref } = msg;
    // topic = "realtime:public:menu:id=eq.42"
    const allowed = await this.router.authorize(this.user, topic, payload.config);
    if (!allowed) return this.reply(topic, ref, { status: 'error' });

    const sub = this.router.subscribe(this.user, topic, payload.config, (event, p) => {
      this.send(topic, event, p);
    });
    this.subscriptions.set(topic, sub);
    this.reply(topic, ref, { status: 'ok', response: { postgres_changes: [...] } });
  }
}

// ChannelRouter — CDC 공급을 채널로 매핑
class ChannelRouter {
  constructor(cdc: CdcBus /* ★ wal2json 모듈 그대로 */) {
    cdc.on('change', (ev) => this.dispatchCdc(ev));
  }

  private dispatchCdc(ev: ChangeEvent) {
    for (const [topic, subs] of this.channels) {
      const parsed = parseTopic(topic);
      if (parsed.schema !== ev.schema || parsed.table !== ev.table) continue;
      if (!matchesFilter(ev.after, parsed.filter)) continue;
      for (const { handler } of subs) {
        handler('postgres_changes', {
          data: {
            type: ev.kind.toUpperCase(),
            table: ev.table,
            schema: ev.schema,
            record: ev.after,
            old_record: ev.before,
            commit_timestamp: ev.timestamp,
          },
        });
      }
    }
  }
}
```

```typescript
// 클라이언트 측 — Supabase SDK 그대로
import { RealtimeClient } from '@supabase/realtime-js';

const client = new RealtimeClient('wss://stylelucky4u.com/realtime/v1', {
  params: { apikey: jwt, eventsPerSecond: 10 },
});

const channel = client.channel('realtime:public:menu:id=eq.42');
channel
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'menu' },
    (payload) => console.log('menu change', payload))
  .subscribe();
```

### 2.3 동일 이벤트를 양측이 표현하는 차이

| 항목 | wal2json 단독 | Realtime 포팅 (+CDC 공유) |
|------|--------------|---------------------------|
| 필드 이름 | `kind` / `columnvalues` / `oldkeys` | `type` / `record` / `old_record` |
| 타입 매핑 | bytea/jsonb 그대로 | JSON 직렬화 (Supabase 규약) |
| 행 식별 | PK 컬럼 기준 client 부담 | Topic 내 필터로 서버 측 처리 |
| 한 번의 구독 범위 | 슬롯 단위 (전역) | 토픽 단위 (세밀) |
| 구독자 수 제한 | 앱 코드 | Channel 당 수천 가능 |
| 재연결 복원 | LSN 수동 전달 | realtime-js가 자동 |

**프로젝트 판단:** Row 변경 이벤트 **"소비 측"** 품질은 Realtime 포팅이 압도적 우위. 하지만 그 품질을 만들어내는 원재료(CDC)는 wal2json이 생산 → **역할 분담**.

---

## 3. 관점 2 — Presence (현재 접속 사용자)

### 3.1 wal2json로는 할 수 있는가? → **구조적으로 불가능**

| 시도 방법 | 한계 |
|-----------|------|
| `active_sessions` 테이블을 만들고 INSERT/DELETE로 WAL 흘리기 | 헤비 write 트래픽, heartbeat 10초마다 DB write = N명 × 6 writes/min |
| 트리거로 `last_seen` 갱신 후 wal2json이 잡기 | UPDATE마다 WAL 기록 → 1분 50명 = 300 WAL rows/min |
| TTL로 expire → 주기적 DELETE | 추가 cron 인프라 |
| **본질 문제** | **Presence는 "지금 순간의 상태"이지 "DB truth"가 아님** — 프로세스 재시작 시 WAL의 과거 ‘접속 중’ 레코드는 의미 없음 |

### 3.2 Realtime 포팅의 PresenceStore (in-memory)

```typescript
export class PresenceStore extends EventEmitter {
  private state = new Map<string, Map<string, { state: any; lastSeen: number }>>();
  private gcInterval: NodeJS.Timeout;

  constructor(private timeoutMs = 60_000) {
    super();
    this.gcInterval = setInterval(() => this.gc(), 15_000);
  }

  track(topic: string, userId: string, state: any) {
    if (!this.state.has(topic)) this.state.set(topic, new Map());
    this.state.get(topic)!.set(userId, { state, lastSeen: Date.now() });
    this.emit('change', topic, this.snapshot(topic));
  }

  private gc() {
    const now = Date.now();
    for (const [topic, m] of this.state) {
      for (const [uid, { lastSeen }] of m) {
        if (now - lastSeen > this.timeoutMs) {
          m.delete(uid);
          this.emit('change', topic, this.snapshot(topic));
        }
      }
    }
  }
}
```

**특성:**
- DB 0 writes, 메모리만 사용
- 프로세스 재시작 시 자동 리셋 (올바른 의도 — presence는 휘발성)
- heartbeat 미수신 60초 후 자동 제거
- Supabase Realtime의 CRDT는 분산 노드 동기화 목적 → 우리 단일 노드는 **불필요**

### 3.3 프로젝트 판단

Presence는 **100% Realtime 포팅 계층의 책임**. wal2json이 여기에 개입하면 비용만 늘고 정확도는 떨어짐. 두 계층의 책임 경계가 가장 선명하게 드러나는 영역.

---

## 4. 관점 3 — Broadcast (임의 메시지)

### 4.1 Broadcast의 정의

"클라이언트 A가 보낸 메시지를 같은 채널의 클라이언트 B·C·D가 받는다." — DB에 저장할 필요 없는 **휘발성 메시지**.

예시:
- 커서 위치 공유 (1초당 30회)
- "타이핑 중..." 인디케이터
- 운영자 수동 알림 "지금 점검 시작합니다"

### 4.2 wal2json로 가능한가? → **DB 경유 우회만 가능**

```sql
-- 우회: broadcast_log 테이블 INSERT → wal2json이 pickup → 구독자에 전달
CREATE TABLE broadcast_log (
  id bigserial PRIMARY KEY,
  channel text NOT NULL,
  payload jsonb NOT NULL,
  sender_id text,
  created_at timestamptz DEFAULT now()
);

-- 1시간 후 자동 삭제 (cron)
```

**비용 분석:**
| 항목 | 값 |
|------|-----|
| 커서 공유 메시지 1건당 | INSERT 1 + WAL 1 row + wal2json decode + ack |
| 30 fps × 50 user = 1500 msg/sec | **Postgres가 병목** |
| 1시간 후 삭제 cron | DELETE + WAL + autovacuum |
| 네트워크 왕복 | Client → HTTP → PG → WAL → Node → WS → Client (4 hops) |

**결론:** 기술적으로 가능하나 **아키텍처적 자해**. DB는 Broadcast 경로에 들어설 이유가 없음.

### 4.3 Realtime 포팅의 직접 Broadcast

```typescript
// 서버 측
onBroadcast(msg: PhoenixMessage) {
  this.router.broadcast(msg.topic, msg.payload, this.user);
  if (msg.ref) this.reply(msg.topic, msg.ref, { status: 'ok', response: {} });
}

broadcast(topic: string, payload: any, sender: User) {
  const subs = this.channels.get(topic);
  if (!subs) return;
  for (const { user, handler } of subs) {
    if (user.id === sender.id && payload.config?.broadcast?.self === false) continue;
    handler('broadcast', payload);
  }
}
```

```typescript
// 클라이언트 — realtime-js 그대로
channel.on('broadcast', { event: 'cursor' }, (payload) => {
  updateCursorOf(payload.user_id, payload.x, payload.y);
});

channel.send({
  type: 'broadcast',
  event: 'cursor',
  payload: { user_id: 'me', x: 100, y: 200 },
});
```

**비용:**
| 항목 | 값 |
|------|-----|
| 메시지 1건당 | EventEmitter 1회, ws.send N회 (구독자 수) |
| 30 fps × 50 user = 1500 msg/sec | Node process **여유** (<5% CPU) |
| DB 부담 | **0** |
| 네트워크 왕복 | Client → WS → Node → WS → Client (2 hops) |

### 4.4 프로젝트 판단

Broadcast는 **100% Realtime 포팅 계층의 책임**. wal2json은 이 경로에서 배제되어야 함. 경계가 명확.

---

## 5. 비교 매트릭스 (종합)

| 차원 | wal2json + Node 리스너 | supabase-realtime 포팅 | 결합 시 |
|------|-------------------------|------------------------|---------|
| **FUNC CDC** | 5/5 | 4/5 (CDC 위임) | 5/5 |
| **FUNC Broadcast** | 0/5 | 5/5 | 5/5 |
| **FUNC Presence** | 0/5 | 4/5 | 4/5 |
| **FUNC RLS gate** | 3/5 | 5/5 | 5/5 |
| **PERF CDC latency** | P50 3ms | P50 5ms (공유) | P50 5ms |
| **PERF fan-out** | 앱 코드 의존 | Room 단위 1만 subs | 1만+ |
| **DX 클라이언트** | 직접 구현 | realtime-js 그대로 | realtime-js |
| **DX 서버** | 단순 (1 subscribe) | 복잡 (프로토콜) | 복잡 (포팅 측) |
| **LIC** | BSD+MIT | MIT | 호환 |
| **INTEG** | PM2 단일 | PM2 단일 | PM2 단일 (같은 프로세스) |
| **SECURITY** | 앱 BFF | 채널 레벨 | **레이어 검문** |
| **SELF_HOST** | wal_level 변경 | PM2 1개 | wal_level + PM2 1개 |
| **COST** | $0 | $0 | $0 |
| **가중 합계** | 4.05 | 3.95 | **~4.30 추정** |

---

## 6. 통합 아키텍처 — 단일 프로세스, 두 레이어

```
┌───────────────────────────────────────────────────────────┐
│  yp-realtime (PM2, Node.js)                                │
│                                                            │
│  ┌─────────────────────────────────────────┐              │
│  │ Layer 2: Channel Abstraction             │              │
│  │  - WebSocket Server (ws)                 │              │
│  │  - Session / ChannelRouter               │              │
│  │  - PresenceStore (in-memory)             │              │
│  │  - Broadcast (EventEmitter fan-out)      │              │
│  └────────────────┬────────────────────────┘              │
│                   │ internal EE                            │
│                   ▼                                        │
│  ┌─────────────────────────────────────────┐              │
│  │ Layer 1: CDC                             │              │
│  │  - CdcBus (pg-logical-replication)       │              │
│  │  - wal2json 플러그인                     │              │
│  │  - 'change' 이벤트만 내보냄              │              │
│  └────────────────┬────────────────────────┘              │
└───────────────────┼───────────────────────────────────────┘
                    │ streaming replication (port 5432)
                    ▼
           ┌─────────────────┐
           │ PostgreSQL 17   │
           │ wal_level=logical│
           │ ypb_cdc_slot    │
           └─────────────────┘
```

**원칙:**
1. 두 레이어는 **같은 프로세스**에 두되 파일로 분리 (`src/realtime/cdc/*` vs `src/realtime/channel/*`)
2. **CdcBus는 Layer 2를 모름** (역방향 의존 금지 — circular 방지)
3. Layer 2만 클라이언트 SDK와 대화 — Layer 1은 내부 기술
4. 장애 격리 — CdcBus 크래시 시 Layer 2는 Broadcast/Presence 계속 동작

---

## 7. 구현 우선순위 (계층별 배분)

| Phase | CDC Layer (wal2json) | Channel Layer (포팅) | 누적 점수 |
|-------|----------------------|---------------------|-----------|
| **P0 (사전)** | wal_level=logical 스파이크 | — | 프로젝트 준비 완료 |
| **P1 (1주)** | CdcBus 완성 + SSE fallback | WS 골격 + `phx_join` + heartbeat | 40 |
| **P2 (2주)** | PG slot 모니터링 cron | `postgres_changes` 이벤트 라우팅 | 70 |
| **P3 (3주)** | pgoutput 전환 옵션 | Broadcast 추가 | 85 |
| **P4 (4주)** | Inspector `/admin/cdc/slots` | PresenceStore + GC | 95 |
| **P5 (선택)** | — | RLS 시뮬레이션 강화 + Rate limit | 100 |

---

## 8. 주요 설계 결정 제안

### 8.1 DR-1: Slot 개수 — **1개 공유 권장**

- Rationale: WSL2 디스크 누수 위험은 슬롯 개수에 비례. 최소화.
- CdcBus 하나 + ChannelRouter 하나 = slot 1개로 충분.
- 예외: 장애 디버깅 모드에서만 `ypb_cdc_slot_debug` 임시 2번째 슬롯.

### 8.2 DR-2: CDC 포맷 — **wal2json (개발) → pgoutput (프로덕션)**

- 개발·스파이크 단계: wal2json (psql로 결과 확인 가능)
- 프로덕션 안정화 후: pgoutput 전환 (streaming 지원, 메모리 효율)
- 전환 비용: `pg-logical-replication`의 plugin 교체 한 줄

### 8.3 DR-3: Channel Topic 포맷 — **Supabase 호환**

```
realtime:{schema}:{table}[:{filter}]      # postgres_changes
realtime:{room_name}                      # broadcast + presence
```

그대로 `@supabase/realtime-js` 기본 파서와 호환.

### 8.4 DR-4: Presence의 분산 CRDT — **생략 (단일 노드 운영)**

- 우리 1인 운영 체제 + WSL2 단일 프로세스 → 분산 동기화 불필요
- 향후 멀티 노드 확장 시 Redis pub/sub adapter로 대체 (Phase 6 이상)

### 8.5 DR-5: 장애 격리 — **CdcBus 재시작이 Channel을 무너뜨리지 않게**

- CdcBus는 `try/catch` + `service.on('error', restart)` 내장
- Broadcast/Presence는 CDC 실패와 무관하게 동작
- `/admin/cdc/slots` 페이지로 CDC 상태만 모니터링

---

## 9. 실패 시나리오 매트릭스

| 시나리오 | wal2json 단독 | Realtime 포팅 단독 | 결합 구성 |
|---------|---------------|---------------------|-----------|
| DB 연결 끊김 | CDC 중단, 자동 재연결 | CDC 공급 끊김 (Broadcast/Presence는 계속) | 동일 |
| Slot 누수 → 디스크 폭증 | PG 정지 | CdcBus 정지, ws는 살아있음 | 동일 |
| Node 프로세스 OOM | 재시작, LSN resume | 모든 WS 연결 drop | 동일 (PM2가 복구) |
| realtime-js 메이저 업그레이드 | 해당 없음 | 서버 프로토콜 호환 점검 필요 | 해당 (Channel 측만) |
| wal2json plugin 업그레이드 | CdcBus 테스트 필요 | 해당 없음 | CDC 측만 |
| Cloudflare Tunnel WS idle 끊김 | SSE 영향 (comment로 방어) | WS heartbeat로 방어 | 양쪽 각각 방어 |

---

## 10. 계층이 다름을 테스트로 확인하는 방법

### 10.1 계약 테스트 (unit)

```typescript
// CdcBus — 채널을 모름
describe('CdcBus', () => {
  it('emits change events without channel concept', async () => {
    const bus = new CdcBus(config);
    const events: ChangeEvent[] = [];
    bus.on('change', (ev) => events.push(ev));
    await bus.start();
    await prismaInsertTestRow();
    await new Promise(r => setTimeout(r, 500));
    expect(events[0].kind).toBe('insert');
    // ❌ 절대 'channel' / 'topic' / 'broadcast' 같은 개념이 없어야 함
  });
});

// ChannelRouter — CDC의 표현만 알고, 어떻게 받아왔는지 모름
describe('ChannelRouter.dispatchCdc', () => {
  it('routes change event to matching topic subscribers', () => {
    const router = new ChannelRouter(mockCdcBus, mockPresence);
    const received: any[] = [];
    router.subscribe(user, 'realtime:public:menu', {}, (ev, p) => received.push(p));
    mockCdcBus.emit('change', { schema: 'public', table: 'menu', kind: 'insert', ... });
    expect(received[0].data.type).toBe('INSERT');
  });
});
```

### 10.2 통합 테스트

```typescript
it('real menu INSERT reaches realtime-js client', async () => {
  const client = new RealtimeClient('ws://localhost:4000/realtime/v1', {...});
  const received: any[] = [];
  client.channel('realtime:public:menu')
    .on('postgres_changes', { event: '*', table: 'menu' }, (p) => received.push(p))
    .subscribe();
  await prisma.menu.create({ data: {...} });
  await waitFor(() => received.length > 0, 2000);
  expect(received[0].new.name).toBe(expected);
});
```

---

## 11. 프로젝트 결론 (왜 계층 분리가 100점 달성에 필수인가)

### 11.1 단일 레이어 접근의 한계

- **wal2json 단독:** Broadcast·Presence 불가 → 최대 55/100
- **Realtime 포팅 단독:** CDC도 자체 내장 가능하나 `pg-logical-replication`을 직접 쓰면 ChannelRouter 코드 비대 → 유지보수 비용↑, 테스트 분리 곤란
- **ElectricSQL 단독:** CDC는 좋지만 Broadcast/Presence 제로 → 최대 55/100
- **NOTIFY 단독:** 페이로드 8KB, 유실 위험 → 최대 30/100

### 11.2 계층 분리 구성의 이점

| 이점 | 근거 |
|------|------|
| **책임 명확성** | "이 기능이 어느 레이어에 속하는지" 의문의 여지 없음 |
| **테스트 용이성** | CdcBus와 ChannelRouter를 각각 단위 테스트 가능 |
| **장애 격리** | CDC 실패가 Broadcast·Presence에 전파 안 됨 |
| **교체 가능성** | wal2json → pgoutput 스트리밍 전환 시 Channel 측 코드 0 수정 |
| **클라이언트 DX 보존** | `@supabase/realtime-js` 그대로 사용 — 향후 Supabase 마이그레이션 0 비용 |
| **점진 구축** | Phase별 독립 증분 (CDC 먼저 → Broadcast → Presence) |

### 11.3 구현 우선순위 재확인 (프로젝트 최종안)

```
Phase 1 (2026-Q2): CDC Layer (wal2json + CdcBus)
  → 40/100

Phase 2 (Q2 후반): Channel Layer WS 골격 + postgres_changes
  → 70/100

Phase 3 (Q3 초): Broadcast + Presence
  → 95/100

Phase 4 (Q3 중): Inspector + RLS 강화
  → 100/100

총 공수: 80h (Wave 1 결론 유지)
```

---

## 12. 최종 요약

| 질문 | 답 |
|------|-----|
| 둘 중 어느 쪽을 택할까? | **둘 다 — 계층이 다름** |
| 동일 평면 비교 가능한가? | 아니오, 오해 |
| `postgres_changes` 기능은 누가 소유? | **CDC Layer가 생산, Channel Layer가 분배** |
| Presence/Broadcast는? | **Channel Layer 전용**. CDC로 우회 금지 |
| Slot 누수 위험은 누가 관리? | CDC Layer (Channel은 무관) |
| 클라이언트 SDK 선택은? | `@supabase/realtime-js` 공식 그대로 — Channel Layer가 호환 |

---

**문서 끝.** (1:1 비교 결론: 계층이 다름 · 합성이 정답 · Phase별 점진 구축.)
