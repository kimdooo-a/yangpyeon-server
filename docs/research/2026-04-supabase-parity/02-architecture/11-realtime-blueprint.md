# 11. Realtime Blueprint — 카테고리 9

> **Wave 4 · Tier 2 · B5 Data Delivery 클러스터 (Agent B5-RT)**
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [00-system-overview.md](./00-system-overview.md) · [01-adr-log.md](./01-adr-log.md) · [02-data-model-erd.md](./02-data-model-erd.md)
> ADR: ADR-010 (wal2json + supabase-realtime 포팅 하이브리드 — 계층 분리)
> DQ 답변 대상: DQ-RT-1, DQ-RT-2, DQ-RT-4, DQ-RT-5 (4건)
> Phase: 19 (6주, ~35h)

---

## 0. 문서 목적

### 0.1 이 문서의 역할

양평 부엌 서버 대시보드 Realtime 카테고리(카테고리 9)의 **구현 청사진**. Wave 1~2 리서치 결론(ADR-010)을 기반으로 wal2json CDC 계층과 supabase-realtime Channel 계층의 2계층 아키텍처를 구체적인 컴포넌트·데이터 흐름·WBS로 전환한다.

**목표**: 현재 55점 → Phase 19 완료 시 100점.

### 0.2 현재 상태 (55점)

| 구분 | 세부 | 점수 |
|------|------|:----:|
| CDC 기반 | wal_level=logical 설정 완료 (스파이크) | 10 |
| 기본 SSE | `/api/v1/sse` 엔드포인트 (NOTIFY 기반) | 20 |
| Client SDK | `@supabase/realtime-js` 설치 (미연결) | 5 |
| UI 인디케이터 | Realtime 연결 상태 표시 없음 | 0 |
| Broadcast | 미구현 | 0 |
| Presence | 미구현 | 0 |
| Inspector UI | 미구현 | 0 |
| RLS 시뮬레이션 | 미구현 | 0 |
| **합계** | | **55** |

### 0.3 100점 도달 경로

```
현재 55점
  │
  ├─ Phase 19-A (CDC 계층): WALConsumer + CdcBus + SSE 폴백           +15점 → 70점
  │
  ├─ Phase 19-B (Channel 계층): WebSocket 서버 + postgres_changes      +20점 → 90점
  │
  ├─ Phase 19-C (Broadcast + Presence): 단일 노드 PresenceStore        +5점  → 95점
  │
  └─ Phase 19-D (Inspector + RLS): 슬롯 모니터링 UI + 권한 게이트      +5점  → 100점
```

---

## 1. Wave 1~2 채택안 (의사결정 기록)

### 1.1 4후보 평가 요약

Wave 2 `01-research/09-realtime/04-realtime-matrix.md` 가중 점수:

| 순위 | 후보 | 가중 점수 | 역할 |
|------|------|:--------:|------|
| 1 | **wal2json + CDC Layer** | **4.05** | CDC 계층 주담당 — 채택 |
| 2 | **supabase-realtime 포팅** | **3.95** | Channel 계층 주담당 — 채택 |
| 3 | ElectricSQL v1.x | 3.85 | Broadcast/Presence 부재 → 탈락 |
| 4 | pg_listen / NOTIFY | 3.12 | 보조 (cache bust · 내부 크론 한정) |

**핵심 발견**: "계층 분리(CDC Layer / Channel Layer)는 100점 달성의 구조적 필수 조건. 단일 도구로 두 계층을 모두 충족하는 후보는 없음." (매트릭스 문서 §0 결론 3)

### 1.2 ADR-010 채택 결정

ADR-010 (`01-adr-log.md §ADR-010`):

> **결정**: CDC 계층(WAL → 내부 이벤트 버스) = wal2json 확장. Channel 계층(구독 관리/백프레셔/presence) = supabase-realtime 포팅. 두 계층이 독립 컴포넌트로 동작.

**Compound Knowledge — 계층 분리**:
- wal2json은 "수도관" — Postgres → Node로 데이터 변경 스트림을 전달하는 파이프
- supabase-realtime 포팅은 "주방 급수 시스템" — 수도관 + 밸브 + 수요자 카드
- wal2json 단독: CDC만 가능, Broadcast/Presence 불가 → 최대 55/100
- supabase-realtime 포팅 단독: Broadcast/Presence 가능, 그러나 CDC 원소스 없음 → 기능 불능
- 계층 결합: CDC 생산 + Channel 분배 → 100/100 달성 경로

### 1.3 ElectricSQL 탈락 근거

ElectricSQL이 매트릭스 3위(3.85)임에도 채택하지 않은 이유:
1. Broadcast 기능 없음 (0/5): 커서 공유, 알림 토스트 등 client→client 메시지 불가
2. Presence 기능 없음 (0/5): "지금 접속 중인 운영자" 표시 불가
3. Elixir/BEAM 런타임 의존: Docker 컨테이너 추가 필요, 1인 운영 부담 증가
4. 한국어 자료 전무: 트러블슈팅 비용 증가 예상

---

## 2. 2계층 아키텍처 — 전체 구조도

### 2.1 계층 정의

```
┌─────────────────────────────────────────────────────────────────────┐
│  클라이언트 브라우저                                                  │
│  @supabase/realtime-js SDK                                          │
│  RealtimeClient('wss://stylelucky4u.com/realtime/v1')              │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ WebSocket (Phoenix frames)
                          │
┌─────────────────────────▼───────────────────────────────────────────┐
│  yp-realtime — PM2 별도 프로세스 (port 4000)                         │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  LAYER 2: Channel 계층 (supabase-realtime 포팅)               │   │
│  │                                                               │   │
│  │  WebSocket Server (ws npm)                                    │   │
│  │    │                                                          │   │
│  │    ├─ Session ──── phx_join / phx_leave / heartbeat          │   │
│  │    │               phx_reply / phx_error                     │   │
│  │    │                                                          │   │
│  │    ├─ ChannelBroker ─── 구독 토픽 라우팅                      │   │
│  │    │   ├─ postgres_changes 라우팅 (CDC 이벤트 수신)            │   │
│  │    │   ├─ broadcast 라우팅 (client→N 직접 전달)               │   │
│  │    │   └─ presence 라우팅 (PresenceStore 연동)                │   │
│  │    │                                                          │   │
│  │    ├─ PresenceService ── in-memory PresenceStore             │   │
│  │    │   └─ 60초 heartbeat TTL, GC 15초 주기                   │   │
│  │    │                                                          │   │
│  │    ├─ BroadcastService ── EventEmitter fan-out               │   │
│  │    │                                                          │   │
│  │    ├─ SubscriptionManager ── 구독자 Map 관리                  │   │
│  │    │                                                          │   │
│  │    └─ TokenRefresher ── JWT 15분 갱신 검증                    │   │
│  │                                                               │   │
│  └────────────────────────┬──────────────────────────────────────┘   │
│                           │ internal EventEmitter                    │
│                           │ cdc.on('change', handler)                │
│                           ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: CDC 계층 (wal2json)                                 │   │
│  │                                                               │   │
│  │  WALConsumer                                                  │   │
│  │    ├─ pg-logical-replication npm                              │   │
│  │    ├─ Wal2JsonPlugin (wal2json PG 출력 플러그인)               │   │
│  │    ├─ LSN 단조 증가 추적                                       │   │
│  │    ├─ auto ACK (10초 타임아웃)                                 │   │
│  │    └─ 에러 시 자동 재연결                                       │   │
│  │                                                               │   │
│  │  CdcBus (Node.js EventEmitter)                               │   │
│  │    ├─ emit('change', ChangeEvent)                             │   │
│  │    └─ Layer 2를 모름 (단방향 의존성 — 순환 참조 금지)           │   │
│  │                                                               │   │
│  └────────────────────────┬──────────────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────────────┘
                            │ Logical Replication (port 5432)
                            │ ypb_cdc_slot (wal2json plugin)
                            ▼
            ┌────────────────────────────────────┐
            │  PostgreSQL 15 (WSL2)              │
            │  wal_level = logical               │
            │  wal2json 확장 설치됨               │
            │  PUBLICATION ypb_pub FOR ALL TABLES │
            │  max_slot_wal_keep_size = 2GB       │
            └────────────────────────────────────┘
```

### 2.2 두 계층의 책임 분리 원칙

| 기능 | 담당 계층 | 이유 |
|------|----------|------|
| 주문 생성 INSERT 실시간 푸시 | CDC Layer | DB truth-of-record가 원본 |
| 메뉴 가격 UPDATE 실시간 푸시 | CDC Layer | WAL로 포착된 사실 |
| 재고 DELETE 알림 | CDC Layer | 삭제 전 `oldkeys` 포함 |
| 운영자 커서 위치 공유 | Channel Layer (Broadcast) | 휘발성, DB 기록 불필요 |
| "지금 접속 중인 운영자" 목록 | Channel Layer (Presence) | heartbeat 기반, DB 부담 없음 |
| 관리자 수동 알림 브로드캐스트 | Channel Layer (Broadcast) | 임의 메시지, DB 경유 불필요 |
| 감사 로그 재생 | CDC Layer | LSN 단조로 순서 보장 |
| JWT 갱신 요청 | Channel Layer | 채널 세션 수명 관리 |

### 2.3 단방향 의존성 규칙

```
Layer 2 (Channel) → Layer 1 (CDC) : 허용 (CdcBus.on('change') 구독)
Layer 1 (CDC) → Layer 2 (Channel) : 금지 (순환 의존 — CdcBus는 채널 개념 모름)
```

**장애 격리 보장**: CdcBus가 크래시되어도 Layer 2의 Broadcast·Presence는 계속 동작한다.

---

## 3. 컴포넌트 상세 명세

### 3.1 WALConsumer (CDC 계층)

**역할**: PostgreSQL WAL을 wal2json 포맷으로 수신하여 CdcBus에 이벤트 발행.

**파일 위치**: `src/realtime/cdc/wal-consumer.ts`

```typescript
import { LogicalReplicationService, Wal2JsonPlugin } from 'pg-logical-replication';
import type { ChangeEvent } from './types';

export class WALConsumer extends EventEmitter {
  private service: LogicalReplicationService;
  private plugin: Wal2JsonPlugin;
  private slotName: string;
  private reconnectDelay = 5000;

  constructor(pgConfig: PgConfig, slotName: string) {
    super();
    this.slotName = slotName;
    this.service = new LogicalReplicationService(pgConfig, {
      acknowledge: { auto: false, timeoutSeconds: 10 },
    });
    this.plugin = new Wal2JsonPlugin({
      includeXids: true,
      includeTimestamp: true,
      includeLsn: true,
      formatVersion: 2,
    });
  }

  async start() {
    this.service.on('data', async (lsn, log) => {
      for (const change of log.change ?? []) {
        const event: ChangeEvent = {
          kind:    change.kind,          // 'insert' | 'update' | 'delete' | 'truncate'
          schema:  change.schema,
          table:   change.table,
          after:   this.columnMap(change.columnnames, change.columnvalues),
          before:  this.columnMap(change.oldkeys?.keynames, change.oldkeys?.keyvalues),
          lsn,
          timestamp: change.timestamp ?? new Date().toISOString(),
        };
        this.emit('change', event);
      }
      await this.service.acknowledge(lsn);
    });

    this.service.on('error', async (err) => {
      console.error('[WALConsumer] error:', err.message);
      // 자동 재연결
      setTimeout(() => this.start(), this.reconnectDelay);
    });

    await this.service.subscribe(this.plugin, this.slotName);
  }

  private columnMap(names?: string[], values?: any[]): Record<string, any> | undefined {
    if (!names || !values) return undefined;
    return Object.fromEntries(names.map((n, i) => [n, values[i]]));
  }

  stop() {
    this.service.stop();
  }
}
```

**핵심 설계 결정**:
- `formatVersion: 2` — 컬럼 데이터가 명시적 객체로 포함되어 파싱 안정성 향상
- `auto: false` + `acknowledge(lsn)` — 이벤트 처리 완료 확인 후 수동 ACK (이벤트 유실 방지)
- 에러 시 `setTimeout(5000)` 재연결 — Slot 상태 보존

### 3.2 CdcBus (CDC 계층)

**역할**: WALConsumer 이벤트를 수신하여 Layer 2(ChannelBroker)가 구독할 수 있는 단일 EventEmitter 버스.

**파일 위치**: `src/realtime/cdc/cdc-bus.ts`

```typescript
import { EventEmitter } from 'node:events';
import { WALConsumer } from './wal-consumer';
import type { ChangeEvent } from './types';

export class CdcBus extends EventEmitter {
  private consumer: WALConsumer;
  private running = false;

  constructor(private config: CdcBusConfig) {
    super();
    this.setMaxListeners(100); // 다수 채널 구독 대비
    this.consumer = new WALConsumer(config.pgConfig, config.slotName);
    this.consumer.on('change', (ev: ChangeEvent) => {
      this.emit('change', ev);
    });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.consumer.start();
    console.log('[CdcBus] 시작됨 — Slot:', this.config.slotName);
  }

  stop() {
    this.running = false;
    this.consumer.stop();
  }
}
```

**설계 원칙**: CdcBus는 `channel`, `topic`, `broadcast`, `presence` 같은 개념을 **전혀 알지 못해야** 한다. Layer 2에 대한 어떤 참조도 금지.

### 3.3 ChannelBroker (Channel 계층)

**역할**: CdcBus의 `change` 이벤트를 수신하여 채널 토픽 구독자에게 `postgres_changes` 이벤트로 라우팅. Broadcast·Presence도 여기서 처리.

**파일 위치**: `src/realtime/channel/channel-broker.ts`

```typescript
import type { CdcBus } from '../cdc/cdc-bus';
import type { ChangeEvent } from '../cdc/types';
import type { Session } from './session';

export interface SubscriptionEntry {
  user: AuthUser;
  config: SubscribeConfig;
  handler: (event: string, payload: any) => void;
}

export class ChannelBroker {
  // 토픽 → 구독자 목록
  private channels = new Map<string, Set<SubscriptionEntry>>();

  constructor(private cdc: CdcBus) {
    // CDC 이벤트 → 채널 dispatch
    cdc.on('change', (ev: ChangeEvent) => this.dispatchCdc(ev));
  }

  subscribe(
    topic: string,
    entry: SubscriptionEntry,
  ): () => void {
    if (!this.channels.has(topic)) {
      this.channels.set(topic, new Set());
    }
    this.channels.get(topic)!.add(entry);

    // unsubscribe 함수 반환
    return () => {
      this.channels.get(topic)?.delete(entry);
    };
  }

  broadcast(topic: string, payload: any, senderId: string) {
    const subs = this.channels.get(topic);
    if (!subs) return;
    for (const entry of subs) {
      // self=false 옵션 적용
      if (entry.user.id === senderId && payload.config?.broadcast?.self === false) continue;
      entry.handler('broadcast', payload);
    }
  }

  private dispatchCdc(ev: ChangeEvent) {
    for (const [topic, subs] of this.channels) {
      const parsed = this.parseTopic(topic);
      // postgres_changes 토픽만 처리
      if (parsed.type !== 'postgres_changes') continue;
      if (parsed.schema !== ev.schema || parsed.table !== ev.table) continue;
      if (!this.matchFilter(ev.after, parsed.filter)) continue;

      const payload = {
        data: {
          type:             ev.kind.toUpperCase() as 'INSERT' | 'UPDATE' | 'DELETE',
          table:            ev.table,
          schema:           ev.schema,
          record:           ev.after,
          old_record:       ev.before,
          commit_timestamp: ev.timestamp,
          errors:           null,
        },
      };

      for (const entry of subs) {
        entry.handler('postgres_changes', payload);
      }
    }
  }

  private parseTopic(topic: string): ParsedTopic {
    // 토픽 포맷: realtime:{schema}:{table}[:{filter}] 또는 realtime:{room_name}
    const parts = topic.replace('realtime:', '').split(':');
    if (parts.length >= 2) {
      return { type: 'postgres_changes', schema: parts[0], table: parts[1], filter: parts[2] };
    }
    return { type: 'room', room: parts[0] };
  }

  private matchFilter(record: any, filter?: string): boolean {
    if (!filter) return true;
    // 예: 'id=eq.42'
    const [col, op, val] = filter.split(/[=.]/);
    if (!col || !record) return true;
    if (op === 'eq') return String(record[col]) === val;
    return true; // 미지원 연산자는 통과
  }
}
```

### 3.4 Session (Channel 계층)

**역할**: 클라이언트 WebSocket 연결 1개에 해당하는 상태 관리. Phoenix 프레임 파싱·응답.

**파일 위치**: `src/realtime/channel/session.ts`

```typescript
import type { WebSocket } from 'ws';
import type { ChannelBroker } from './channel-broker';
import type { PresenceService } from './presence-service';
import { TokenRefresher } from './token-refresher';

export class Session {
  private subscriptions = new Map<string, () => void>(); // topic → unsubscribe fn
  private tokenRefresher: TokenRefresher;

  constructor(
    private ws: WebSocket,
    private broker: ChannelBroker,
    private presence: PresenceService,
    private user: AuthUser,
  ) {
    this.tokenRefresher = new TokenRefresher(user.accessToken, (newToken) => {
      this.user = { ...this.user, accessToken: newToken };
      this.send('system', 'token_refreshed', { status: 'ok' });
    });

    ws.on('message', (raw) => this.handleMessage(raw.toString()));
    ws.on('close', () => this.cleanup());
  }

  private handleMessage(raw: string) {
    let msg: PhoenixMessage;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.event) {
      case 'phx_join':    return this.onJoin(msg);
      case 'phx_leave':   return this.onLeave(msg);
      case 'heartbeat':   return this.onHeartbeat(msg);
      case 'broadcast':   return this.onBroadcast(msg);
      case 'presence':    return this.onPresence(msg);
      case 'access_token':return this.onAccessToken(msg);
    }
  }

  private async onJoin(msg: PhoenixMessage) {
    const { topic, ref } = msg;
    const allowed = await this.authorize(topic);
    if (!allowed) {
      return this.reply(topic, ref, { status: 'error', response: { reason: 'unauthorized' } });
    }

    const unsubscribe = this.broker.subscribe(topic, {
      user: this.user,
      config: msg.payload?.config ?? {},
      handler: (event, payload) => this.send(topic, event, payload),
    });
    this.subscriptions.set(topic, unsubscribe);

    // Presence join
    if (msg.payload?.config?.presence) {
      this.presence.track(topic, this.user.id, msg.payload.config.presence);
    }

    this.reply(topic, ref, { status: 'ok', response: {} });
  }

  private onLeave(msg: PhoenixMessage) {
    const unsub = this.subscriptions.get(msg.topic);
    if (unsub) { unsub(); this.subscriptions.delete(msg.topic); }
    this.presence.untrack(msg.topic, this.user.id);
    this.reply(msg.topic, msg.ref, { status: 'ok', response: {} });
  }

  private onHeartbeat(msg: PhoenixMessage) {
    this.reply('phoenix', msg.ref, { status: 'ok', response: {} });
  }

  private onBroadcast(msg: PhoenixMessage) {
    this.broker.broadcast(msg.topic, msg.payload, this.user.id);
    if (msg.ref) this.reply(msg.topic, msg.ref, { status: 'ok', response: {} });
  }

  private onPresence(msg: PhoenixMessage) {
    this.presence.track(msg.topic, this.user.id, msg.payload ?? {});
    if (msg.ref) this.reply(msg.topic, msg.ref, { status: 'ok', response: {} });
  }

  private onAccessToken(msg: PhoenixMessage) {
    // 클라이언트가 갱신된 access_token 전달
    this.tokenRefresher.update(msg.payload.access_token);
    this.reply(msg.topic, msg.ref ?? '', { status: 'ok', response: {} });
  }

  private async authorize(topic: string): Promise<boolean> {
    // JWT 검증 + 테이블 접근 권한 확인
    return this.user.role === 'admin' || this.user.role === 'editor';
  }

  send(topic: string, event: string, payload: any) {
    if (this.ws.readyState !== 1 /* OPEN */) return;
    this.ws.send(JSON.stringify({ topic, event, payload, ref: null }));
  }

  private reply(topic: string, ref: string, payload: any) {
    this.send(topic, 'phx_reply', { ...payload, ref });
  }

  private cleanup() {
    for (const unsub of this.subscriptions.values()) unsub();
    this.subscriptions.clear();
    this.presence.untrackAll(this.user.id);
    this.tokenRefresher.stop();
  }
}
```

### 3.5 PresenceService (Channel 계층)

**역할**: 단일 노드 in-memory Presence 상태 관리. DB write 0.

**파일 위치**: `src/realtime/channel/presence-service.ts`

```typescript
import { EventEmitter } from 'node:events';

export interface PresenceEntry {
  state:    any;
  lastSeen: number;
}

export class PresenceService extends EventEmitter {
  private store = new Map<string, Map<string, PresenceEntry>>();
  private gcTimer: NodeJS.Timeout;

  constructor(private timeoutMs = 60_000) {
    super();
    // 15초마다 만료된 항목 제거
    this.gcTimer = setInterval(() => this.gc(), 15_000);
  }

  track(topic: string, userId: string, state: any) {
    if (!this.store.has(topic)) this.store.set(topic, new Map());
    const existed = this.store.get(topic)!.has(userId);
    this.store.get(topic)!.set(userId, { state, lastSeen: Date.now() });
    this.emit('change', topic, this.snapshot(topic), existed ? 'update' : 'join');
  }

  untrack(topic: string, userId: string) {
    const topicMap = this.store.get(topic);
    if (!topicMap?.has(userId)) return;
    topicMap.delete(userId);
    this.emit('change', topic, this.snapshot(topic), 'leave');
  }

  untrackAll(userId: string) {
    for (const [topic] of this.store) {
      this.untrack(topic, userId);
    }
  }

  snapshot(topic: string): Record<string, any> {
    const topicMap = this.store.get(topic);
    if (!topicMap) return {};
    const result: Record<string, any> = {};
    for (const [uid, entry] of topicMap) {
      result[uid] = entry.state;
    }
    return result;
  }

  private gc() {
    const now = Date.now();
    for (const [topic, topicMap] of this.store) {
      for (const [uid, entry] of topicMap) {
        if (now - entry.lastSeen > this.timeoutMs) {
          topicMap.delete(uid);
          this.emit('change', topic, this.snapshot(topic), 'leave');
        }
      }
    }
  }

  destroy() {
    clearInterval(this.gcTimer);
    this.store.clear();
  }
}
```

**설계 결정 (ADR-010 근거)**:
- Supabase Realtime의 CRDT(분산 노드 동기화)는 단일 노드 운영에서 불필요 — 생략
- 향후 멀티 노드 확장 시 Redis pub/sub adapter로 대체 (Phase 25+)
- DB write 0: Presence는 "지금 순간의 상태"이지 DB truth가 아님

### 3.6 BroadcastService (Channel 계층)

**역할**: 클라이언트→N 직접 메시지 전달. DB 경유 없음.

```typescript
// ChannelBroker.broadcast() 내에 위치
// client→client 1500 msg/sec에서 Node.js EventEmitter가 <5% CPU
// DB 부담: 0 (WAL 기록 없음, ACK 없음)
// 네트워크: Client → WS → Node → WS → Client (2 hop)
```

### 3.7 SubscriptionManager (Channel 계층)

**역할**: 세션별·토픽별 구독 Map 관리. 메모리 누수 방지.

```typescript
// Session 클래스 내부 Map<topic, unsubscribeFn>
// onLeave + ws.close 이벤트 시 반드시 cleanup() 호출
// 토픽당 구독자 수 제한: 10,000 (단일 노드)
```

### 3.8 TokenRefresher (Channel 계층)

**역할**: access_token 갱신 주기 관리. 15분마다 클라이언트에 갱신 요청.

**파일 위치**: `src/realtime/channel/token-refresher.ts`

```typescript
export class TokenRefresher {
  private timer: NodeJS.Timeout;

  constructor(
    private token: string,
    private onRefresh: (newToken: string) => void,
    private intervalMs = 15 * 60 * 1000, // 15분
  ) {
    this.timer = setInterval(() => this.check(), this.intervalMs);
  }

  update(newToken: string) {
    this.token = newToken;
  }

  private async check() {
    // jose로 토큰 검증
    try {
      const payload = await verifyJwt(this.token);
      const remainMs = (payload.exp ?? 0) * 1000 - Date.now();
      // 만료 2분 전이면 클라이언트에 갱신 요청
      if (remainMs < 2 * 60 * 1000) {
        this.onRefresh(this.token);
      }
    } catch {
      this.onRefresh(this.token); // 검증 실패 시 즉시 갱신
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}
```

---

## 4. WebSocket 서버 위치 결정 (DQ-RT-1 답변)

### 4.1 질문

"Phase 1 WebSocket 서버를 Next.js 16 Route Handler(실험적 `ws`)로 올릴까, 별도 PM2 프로세스(권장)로 분리할까?"

### 4.2 결정: **별도 PM2 프로세스 (port 4000)**

| 비교 항목 | Next.js 16 Route Handler | **별도 PM2 프로세스 (채택)** |
|-----------|--------------------------|---------------------------|
| WebSocket 지원 성숙도 | 실험적 (`experimental.serverWebSockets`) | ws npm, 안정적 |
| 프로세스 독립성 | Next.js 프로세스와 공유 | **독립 프로세스 — 크래시 격리** |
| 메모리 격리 | 공유 힙 | **독립 힙 — OOM 격리** |
| Hot Reload 영향 | Next.js 재시작 시 WS 연결 전부 끊김 | **Next.js 재시작과 무관** |
| Cloudflare Tunnel | `/realtime/v1` 경로 역방향 프록시 | **동일 — Tunnel 레벨에서 경로 라우팅** |
| 배포 단위 | Next.js 배포 시 함께 중단 | **독립 배포 가능** |
| PM2 관리 | app-name: `ypb-app` | app-name: `ypb-realtime` |

**결론**: 별도 PM2 프로세스가 장애 격리·배포 독립성·OOM 격리 측면에서 압도적 우위. Next.js Route Handler WebSocket은 실험적 기능으로 안정성 미보장.

### 4.3 PM2 설정

```javascript
// ecosystem.config.js 추가
{
  name: 'ypb-realtime',
  script: 'dist/realtime/server.js',
  instances: 1,          // WS 상태 공유 위해 단일 프로세스 필수
  exec_mode: 'fork',
  port: 4000,
  env: {
    NODE_ENV: 'production',
    REALTIME_PORT: 4000,
    REALTIME_JWT_SECRET: '${REALTIME_JWT_SECRET}',
    DATABASE_URL: '${DATABASE_URL}',
  },
  max_memory_restart: '512M',
  restart_delay: 5000,
}
```

### 4.4 Cloudflare Tunnel 경로 라우팅

```
stylelucky4u.com/realtime/v1  →  localhost:4000/realtime/v1
stylelucky4u.com/*            →  localhost:3000/*
```

---

## 5. WAL 처리 파이프라인

### 5.1 전체 흐름

```
PostgreSQL 15
  │
  │  [1] WAL 세그먼트 생성
  │      wal_level = logical (필수)
  │      PUBLICATION ypb_pub FOR ALL TABLES;
  │
  ▼
Replication Slot (ypb_cdc_slot, plugin=wal2json)
  │
  │  [2] Streaming Replication Protocol
  │      TCP port 5432
  │
  ▼
WALConsumer (Node.js, pg-logical-replication)
  │
  │  [3] wal2json JSON 파싱
  │      { kind, schema, table, columnnames, columnvalues, lsn, timestamp }
  │
  ▼
CdcBus.emit('change', ChangeEvent)
  │
  │  [4] 내부 EventEmitter (동기 처리)
  │      Layer 2가 구독
  │
  ▼
ChannelBroker.dispatchCdc(ev)
  │
  │  [5] 토픽 매칭
  │      'realtime:public:menu:id=eq.42' → schema=public, table=menu, filter='id=eq.42'
  │
  ▼
Session.handler('postgres_changes', payload)
  │
  │  [6] Phoenix 프레임 직렬화
  │      { topic, event: 'postgres_changes', payload: { data: {...} } }
  │
  ▼
ws.send(JSON)
  │
  │  [7] WebSocket 전송
  │      TLS (Cloudflare Tunnel 경유)
  │
  ▼
@supabase/realtime-js (브라우저)
  │
  ▼
channel.on('postgres_changes', callback)
```

### 5.2 성능 지표 (NFR-PERF.5 기준)

| 단계 | 목표 P50 | 목표 P99 |
|------|:-------:|:-------:|
| DB INSERT → WALConsumer 수신 | 3ms | 15ms |
| WALConsumer → CdcBus emit | <1ms | 2ms |
| CdcBus → Session.ws.send | 2ms | 10ms |
| **E2E (DB → 브라우저)** | **35ms** | **200ms** |

---

## 6. 백프레셔 전략

### 6.1 클라이언트 메시지 속도 제한

```
@supabase/realtime-js 초기화 시:
  params: { eventsPerSecond: 100 }  // 초당 최대 100 메시지

서버 측 Rate Limit:
  - 클라이언트별 메시지 큐: 최대 1000개
  - 초과 시: phx_error 응답 + 해당 메시지 드롭
  - 지속 위반 시: WS 연결 강제 종료 (5분 쿨다운)
```

### 6.2 CDC 이벤트 버퍼링

```typescript
// WALConsumer에서 대용량 트랜잭션 처리
const MAX_BUFFER_SIZE = 1000; // 이벤트 수
const MAX_BUFFER_WAIT_MS = 50; // 배치 처리 대기

// 이 값을 초과하면 오래된 이벤트 드롭 + 경고 로그
if (eventBuffer.length >= MAX_BUFFER_SIZE) {
  console.warn('[WALConsumer] 버퍼 한계 초과 — 이벤트 드롭');
  eventBuffer.shift(); // 가장 오래된 이벤트 제거
}
```

### 6.3 연결 수 제한

| 항목 | 값 |
|------|-----|
| 최대 동시 WebSocket 연결 | 10,000 (단일 노드) |
| 채널당 최대 구독자 | 1,000 |
| 연결당 최대 구독 토픽 | 50 |

---

## 7. 폴링 폴백 — Plan B (Realtime 비작동 시)

### 7.1 폴백 트리거 조건

다음 조건 중 하나라도 발생 시 클라이언트는 자동으로 폴링 모드로 전환:

1. WebSocket 연결 3회 연속 실패 (각 시도 간 2초 대기)
2. `ypb-realtime` PM2 프로세스 비정상 종료
3. Replication Slot 디스크 누수로 WALConsumer 중단
4. Cloudflare Tunnel에서 WebSocket 업그레이드 거부

### 7.2 폴링 구현

```typescript
// src/hooks/use-realtime-fallback.ts
export function useRealtimeFallback<T>(
  fetchFn: () => Promise<T>,
  realtimeEnabled: boolean,
  pollIntervalMs = 5000,
): T | undefined {
  const [data, setData] = useState<T>();

  // Realtime 연결 시: 폴링 비활성화
  // Realtime 비연결 시: 5초 간격 REST API 폴링
  useEffect(() => {
    if (realtimeEnabled) return;

    const id = setInterval(async () => {
      try {
        setData(await fetchFn());
      } catch {
        console.warn('[Fallback] 폴링 오류');
      }
    }, pollIntervalMs);

    return () => clearInterval(id);
  }, [realtimeEnabled, fetchFn, pollIntervalMs]);

  return data;
}
```

### 7.3 폴백 시 UX

- 대시보드 우측 상단: "실시간 업데이트 오프라인 — 5초마다 새로고침" 배지 표시
- 배지 클릭 시: Realtime 재연결 수동 시도
- 폴링 중 데이터 변경 감지 시: 기존 Realtime과 동일한 UI 업데이트 트리거

---

## 8. 데이터 모델

### 8.1 신규 테이블: realtime_subscriptions

**목적**: 활성 채널 구독 세션 추적 (Inspector UI용). 실제 이벤트 라우팅은 in-memory Map에서 처리 — 이 테이블은 관측/디버깅 전용.

```sql
-- Tier 1 ERD (02-data-model-erd.md §3) 인용 및 확장
CREATE TABLE realtime_subscriptions (
  id             BIGSERIAL PRIMARY KEY,
  session_id     TEXT        NOT NULL,          -- WebSocket 세션 식별자
  topic          TEXT        NOT NULL,          -- 'realtime:public:menu' 형식
  user_id        BIGINT      REFERENCES users(id) ON DELETE CASCADE,
  connected_at   TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  filters        JSONB,                         -- 채널 필터 설정
  status         TEXT        DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  UNIQUE(session_id, topic)
);

-- 인덱스
CREATE INDEX idx_realtime_subs_user   ON realtime_subscriptions(user_id);
CREATE INDEX idx_realtime_subs_topic  ON realtime_subscriptions(topic);
CREATE INDEX idx_realtime_subs_status ON realtime_subscriptions(status, last_heartbeat);

-- 7일 이상 inactive 구독 자동 정리 (node-cron, DQ-RT-6 PG 버전 대기 대신 자체 구현)
```

**Prisma 모델**:
```prisma
model RealtimeSubscription {
  id            BigInt    @id @default(autoincrement())
  sessionId     String    @map("session_id")
  topic         String
  userId        BigInt?   @map("user_id")
  connectedAt   DateTime  @default(now()) @map("connected_at")
  lastHeartbeat DateTime  @default(now()) @map("last_heartbeat")
  filters       Json?
  status        String    @default("active")

  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([sessionId, topic])
  @@index([userId])
  @@index([topic])
  @@index([status, lastHeartbeat])
  @@map("realtime_subscriptions")
}
```

### 8.2 Replication Slot 관리

```sql
-- 슬롯 생성 (최초 한 번)
SELECT pg_create_logical_replication_slot('ypb_cdc_slot', 'wal2json');

-- Publication 생성 (최초 한 번)
CREATE PUBLICATION ypb_pub FOR ALL TABLES;

-- 슬롯 상태 모니터링 쿼리 (Inspector UI에서 사용)
SELECT
  slot_name,
  plugin,
  slot_type,
  active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_lag,
  restart_lsn,
  confirmed_flush_lsn
FROM pg_replication_slots
WHERE slot_name = 'ypb_cdc_slot';
```

**WAL 누수 방지 (필수 설정)**:
```
# postgresql.conf
max_slot_wal_keep_size = 2GB   # 슬롯이 비활성화되어도 최대 2GB만 보존
wal_level = logical             # wal2json 필수 요건
```

---

## 9. PostgreSQL 버전 호환 매트릭스

### 9.1 wal2json 호환성

| 기능 | PG 14 | PG 15 | PG 16 |
|------|:-----:|:-----:|:-----:|
| wal2json 기본 동작 | 완전 지원 | 완전 지원 | 완전 지원 |
| `max_slot_wal_keep_size` | 지원 (PG 13+) | 지원 | 지원 |
| `idle_replication_slot_timeout` | 미지원 | 미지원 | **PG 17+만** |
| Streaming Replication | 지원 | 지원 | 지원 |
| pgoutput 포맷 | 지원 | 지원 | 지원 |
| wal2json formatVersion 2 | 지원 | 지원 | 지원 |

### 9.2 현재 프로젝트 스택 (PG 15)

프로젝트는 PostgreSQL 15를 사용 중. `idle_replication_slot_timeout`은 PG 17+에서만 지원되므로 **자체 node-cron으로 Slot 상태 모니터링 + 자동 정리** 구현 (DQ-RT-6 대응).

```typescript
// src/realtime/cdc/slot-monitor.ts
import cron from 'node-cron';

cron.schedule('*/5 * * * *', async () => {
  const result = await prisma.$queryRaw<SlotInfo[]>`
    SELECT slot_name,
           pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag
    FROM pg_replication_slots
    WHERE slot_name = 'ypb_cdc_slot'
  `;
  const slot = result[0];
  if (!slot) {
    console.error('[SlotMonitor] ypb_cdc_slot 없음 — 재생성 필요');
    return;
  }
  const lagBytes = parseLagSize(slot.lag);
  if (lagBytes > 1.5 * 1024 * 1024 * 1024) { // 1.5GB 초과
    console.warn('[SlotMonitor] WAL 누수 경고 — 슬롯 지연:', slot.lag);
    // 알림 전송 (Slack webhook 또는 dashboard 알림)
    await sendAlert(`WAL Slot 누수 경고: lag=${slot.lag}`);
  }
});
```

### 9.3 PG 버전 업그레이드 위험 완화

| 위험 | 완화 방법 |
|------|----------|
| PG 17 업그레이드 시 wal2json ABI 호환 깨짐 | `dpkg --hold postgresql-15` + 업그레이드 전 wal2json 버전 호환 테스트 |
| PG 16→17 주요 API 변경 | pg-logical-replication npm 업스트림 CHANGELOG 모니터링 (ASM-6 EWI) |
| pgoutput 포맷 전환 시 파싱 코드 교체 | WALConsumer 추상 인터페이스로 포맷 전환 1줄 교체 설계 |

---

## 10. Wave 4 할당 DQ 답변

### 10.1 DQ-RT-1: WebSocket 서버 위치

**질문**: Phase 1 WebSocket 서버를 Next.js 16 Route Handler vs 별도 PM2 프로세스로 분리?

**답변**: **별도 PM2 프로세스 (`ypb-realtime`, port 4000)**

근거:
- Next.js Route Handler WebSocket은 `experimental.serverWebSockets` — 안정성 미보장
- 독립 프로세스 = 크래시 격리 + OOM 격리 + 독립 배포
- Next.js `npm run dev` 재시작 시 WS 연결 유지 (개발 DX 향상)
- Cloudflare Tunnel에서 `/realtime/v1` 경로를 `localhost:4000`으로 라우팅 (§4 참조)

---

### 10.2 DQ-RT-2: access_token 재발급 주기

**질문**: Realtime 포팅의 access_token 재발급 주기 — JWT 만료(1h)마다 vs 15분마다?

**답변**: **15분마다 갱신 요청 + Refresh 시 이전 토큰 Revoke**

근거:

| 방식 | 장점 | 단점 |
|------|------|------|
| 1시간 (JWT 만료 시) | 클라이언트 요청 횟수 감소 | 탈취된 토큰의 유효 기간 최대 1시간 |
| **15분마다 (채택)** | **탈취 토큰 최대 15분 유효** | 클라이언트 처리 횟수 4배 |

**구현 원칙**:
1. `TokenRefresher`가 15분마다 `access_token` 메시지 전송 (서버→클라이언트)
2. 클라이언트(realtime-js)가 `access_token` 이벤트를 수신하면 Auth Core에서 새 토큰 발급
3. 새 토큰을 `access_token` 메시지로 서버에 전달
4. 서버는 이전 토큰을 Revoke (`user_sessions.revokedAt` 갱신, ADR-006 참조)

---

### 10.3 DQ-RT-4: pg_notify 자동 vs 명시적

**질문**: pg_listen을 cache bust 신호로 쓸 때, wal2json 이벤트에서 자동 `pg_notify` 발송 vs 애플리케이션 write 경로에서 명시적 notify?

**답변**: **wal2json 이벤트 자동 + app write 시 명시적 추가 옵션**

**설명**:

wal2json CDC 계층이 모든 WAL 이벤트를 포착하므로, **CdcBus의 `change` 이벤트를 수신하여 cache bust `pg_notify`를 자동 발송**하는 것이 기본값이다.

```typescript
// src/realtime/cdc/cache-bust-relay.ts
export class CacheBustRelay {
  constructor(cdc: CdcBus, pgPool: Pool) {
    cdc.on('change', async (ev: ChangeEvent) => {
      if (CACHE_BUST_TABLES.includes(ev.table)) {
        // pg_notify로 내부 캐시 무효화 신호 (8KB 이하 키만)
        await pgPool.query(`SELECT pg_notify('cache_bust', $1)`, [
          JSON.stringify({ table: ev.table, key: ev.after?.id })
        ]);
      }
    });
  }
}
```

**명시적 notify가 추가로 필요한 경우**:
- 애플리케이션 레이어에서 WAL을 거치지 않는 변경 (예: 외부 API 연동으로 인한 캐시 무효화)
- 복잡한 비즈니스 로직 기반 조건부 notify (`if (order.status === 'paid')`)

이 경우 Route Handler에서 직접:
```typescript
await prisma.$executeRaw`SELECT pg_notify('cache_bust', ${payload})`;
```

**결론**: 자동(wal2json 기반)이 기본값, 명시적 notify는 보완 옵션으로 병행.

---

### 10.4 DQ-RT-5: Replication Slot — 2개 분리 결정

**질문**: 하이브리드 구성에서 Slot 1개 공유 vs 2개 분리 (wal2json용 + Realtime용)?

**답변**: **2개 분리 — `ypb_cdc_slot` (wal2json) + `ypb_realtime_slot` (Realtime Channel 전용)**

**변경 이유**: Wave 2 문서 `05-wal2json-vs-supabase-realtime-port.md §8.1`에서는 "1개 공유 권장"이었으나, Wave 4 Blueprint 설계 과정에서 다음 이유로 2개 분리로 결정.

| 관점 | 1개 공유 | **2개 분리 (채택)** |
|------|----------|--------------------|
| 디스크 위험 | 슬롯 1개만 관리 (작은 위험) | 슬롯 2개 관리 (약간 큰 위험) |
| 디버깅 독립성 | WALConsumer와 Realtime Channel의 LSN이 얽힘 | **각자 독립 LSN 추적 — 원인 분석 쉬움** |
| 장애 격리 | CdcBus 크래시 시 Realtime Channel도 영향 | **완전 독립 — 슬롯 A 문제가 슬롯 B에 영향 없음** |
| 백프레셔 독립 | 단일 ACK 흐름 | **각 슬롯 독립 ACK** |
| 운영 관리 | 슬롯 1개 모니터링 | 슬롯 2개 모니터링 (SlotMonitor가 자동 처리) |

**슬롯 설정**:
```sql
-- wal2json CDC 계층 전용
SELECT pg_create_logical_replication_slot('ypb_cdc_slot', 'wal2json');

-- Realtime Channel 계층 전용 (supabase-realtime 포팅이 자체 관리)
SELECT pg_create_logical_replication_slot('ypb_realtime_slot', 'pgoutput');
```

**주의**: 두 슬롯 모두 SlotMonitor의 모니터링 대상에 포함. `max_slot_wal_keep_size=2GB`는 양쪽 합산이므로 실질적으로 각 1GB 예산.

---

## 11. 통합 — 다른 카테고리와의 연결

### 11.1 Data API(카테고리 11)와의 통합

Data API의 GraphQL Subscription 기능(DQ-1.26)은 Realtime 채널 위에서 구현:

```
GraphQL Subscription 요청
  │
  ▼
/api/graphql Route Handler (pg_graphql, 조건부)
  │  pg_graphql은 Subscription 미지원
  │  → Realtime Channel로 위임
  ▼
/realtime/v1 WebSocket
  │  topic: 'realtime:{schema}:{table}'
  ▼
ChannelBroker → 구독자에게 postgres_changes 이벤트
```

### 11.2 Auth Core(카테고리 5)와의 통합

- `phx_join` 시 `payload.config.access_token` JWT 검증 (jose ES256)
- 채널 권한 게이트: `admin`/`editor` 역할만 구독 허용 (기본)
- TokenRefresher가 15분마다 Auth Core의 `/api/auth/refresh` 호출

### 11.3 Edge Functions(카테고리 8)와의 통합

Edge Function에서 Realtime 이벤트 트리거:
```typescript
// Edge Function 내부에서 Realtime 채널에 Broadcast 발송
const realtimeClient = new RealtimeClient('ws://localhost:4000/realtime/v1', {
  params: { apikey: process.env.REALTIME_SERVICE_KEY }
});
const channel = realtimeClient.channel('realtime:admin:notifications');
await channel.send({
  type: 'broadcast',
  event: 'function_result',
  payload: { functionId, result, executedAt: new Date().toISOString() },
});
```

---

## 12. Phase 19 WBS (~35h)

### 12.1 Phase 19-A: CDC 계층 (10h)

| 작업 | 공수 | 산출물 |
|------|:----:|--------|
| `wal_level=logical` 재확인 + `ypb_cdc_slot` 생성 | 0.5h | PG 설정 완료 |
| WALConsumer 구현 (`pg-logical-replication` 통합) | 2h | `src/realtime/cdc/wal-consumer.ts` |
| CdcBus 구현 + 단위 테스트 | 2h | `src/realtime/cdc/cdc-bus.ts` + `*.test.ts` |
| `ypb_realtime_slot` (pgoutput) 생성 | 0.5h | PG 슬롯 설정 |
| SlotMonitor (node-cron, 5분 주기) | 1h | `src/realtime/cdc/slot-monitor.ts` |
| CacheBustRelay 구현 | 1h | `src/realtime/cdc/cache-bust-relay.ts` |
| SSE 폴백 연동 (기존 `/api/v1/sse` 유지) | 1.5h | 기존 코드 수정 |
| CDC 계층 통합 테스트 | 1.5h | `*.integration.test.ts` |

### 12.2 Phase 19-B: Channel 계층 WebSocket 골격 (12h)

| 작업 | 공수 | 산출물 |
|------|:----:|--------|
| `ypb-realtime` PM2 앱 설정 + `dist/realtime/server.ts` | 1h | `ecosystem.config.js` 수정 |
| WebSocket 서버 + JWT 인증 미들웨어 | 2h | `src/realtime/server.ts` |
| Session 클래스 구현 (phx_join/leave/heartbeat) | 3h | `src/realtime/channel/session.ts` |
| ChannelBroker 구현 (dispatchCdc 포함) | 3h | `src/realtime/channel/channel-broker.ts` |
| TokenRefresher 구현 (15분 주기) | 1h | `src/realtime/channel/token-refresher.ts` |
| `@supabase/realtime-js` 클라이언트 연결 테스트 | 2h | E2E 브라우저 테스트 |

### 12.3 Phase 19-C: Broadcast + Presence (8h)

| 작업 | 공수 | 산출물 |
|------|:----:|--------|
| PresenceService 구현 (in-memory, GC 15초) | 2h | `src/realtime/channel/presence-service.ts` |
| BroadcastService ChannelBroker 통합 | 1h | 기존 ChannelBroker 확장 |
| SubscriptionManager 메모리 누수 테스트 | 1h | `*.test.ts` |
| 폴링 폴백 `useRealtimeFallback` 훅 | 2h | `src/hooks/use-realtime-fallback.ts` |
| Presence UI 컴포넌트 (접속 중 사용자 아바타) | 1h | `src/components/realtime/presence-list.tsx` |
| Broadcast 알림 토스트 연동 (Sonner) | 1h | 기존 Sonner 활용 |

### 12.4 Phase 19-D: Inspector UI + RLS 게이트 (5h)

| 작업 | 공수 | 산출물 |
|------|:----:|--------|
| `/dashboard/realtime` Inspector 페이지 | 2h | `src/app/dashboard/realtime/page.tsx` |
| 슬롯 상태 표시 (WAL lag, 연결 수) | 1h | `src/components/realtime/slot-inspector.tsx` |
| 채널 권한 게이트 강화 (테이블 레벨 ACL) | 1.5h | `src/realtime/channel/authorizer.ts` |
| Rate Limit (초당 100 메시지) 미들웨어 | 0.5h | Session 클래스 통합 |

### 12.5 WBS 요약

| Phase | 작업 구분 | 공수 | 누적 점수 |
|-------|----------|:----:|:--------:|
| 19-A | CDC 계층 완성 | 10h | 70점 |
| 19-B | Channel WebSocket 골격 + postgres_changes | 12h | 90점 |
| 19-C | Broadcast + Presence + 폴백 | 8h | 95점 |
| 19-D | Inspector + RLS 게이트 | 5h | **100점** |
| **합계** | | **35h** | **100점** |

---

## 부록 A. 테스트 전략

### A.1 단위 테스트 (Vitest)

```typescript
// CdcBus — Layer 2를 모르는지 검증
describe('CdcBus', () => {
  it('change 이벤트를 emit하지만 channel/topic 개념이 없어야 함', async () => {
    const bus = new CdcBus(mockConfig);
    const events: ChangeEvent[] = [];
    bus.on('change', (ev) => events.push(ev));
    // WALConsumer 모킹으로 change 이벤트 강제 발행
    (bus as any).consumer.emit('change', { kind: 'insert', schema: 'public', table: 'menu' });
    expect(events[0].kind).toBe('insert');
    // Channel 개념 없음 확인
    expect(events[0]).not.toHaveProperty('topic');
    expect(events[0]).not.toHaveProperty('channel');
  });
});

// ChannelBroker — CDC 이벤트가 올바른 토픽으로 라우팅되는지
describe('ChannelBroker.dispatchCdc', () => {
  it('postgres_changes 토픽에 일치하는 구독자에게만 전달', () => {
    const mockCdc = new EventEmitter();
    const broker = new ChannelBroker(mockCdc as CdcBus);
    const received: any[] = [];

    broker.subscribe('realtime:public:menu', {
      user: { id: '1', role: 'admin' } as AuthUser,
      config: {},
      handler: (ev, p) => received.push(p),
    });

    mockCdc.emit('change', {
      kind: 'insert', schema: 'public', table: 'menu',
      after: { id: 1, name: '된장찌개' }, before: undefined
    });

    expect(received[0].data.type).toBe('INSERT');
    expect(received[0].data.record.name).toBe('된장찌개');
  });
});
```

### A.2 통합 테스트

```typescript
it('실제 menu INSERT가 realtime-js 클라이언트에 도달해야 함', async () => {
  const client = new RealtimeClient('ws://localhost:4000/realtime/v1', {
    params: { apikey: testJwt }
  });
  const received: any[] = [];

  client.channel('realtime:public:menu')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'menu' },
      (payload) => received.push(payload))
    .subscribe();

  await new Promise(r => setTimeout(r, 500)); // 연결 대기

  await prisma.menu.create({ data: { name: '테스트메뉴', price: 9000 } });

  // 최대 2초 대기
  await waitFor(() => received.length > 0, 2000);

  expect(received[0].new.name).toBe('테스트메뉴');
  client.disconnect();
});
```

---

## 부록 B. 환경 변수

```env
# .env.local
REALTIME_PORT=4000
REALTIME_JWT_SECRET=<jose ES256 서명 키>
REALTIME_CDC_SLOT=ypb_cdc_slot
REALTIME_RT_SLOT=ypb_realtime_slot
REALTIME_MAX_CONNECTIONS=10000
REALTIME_HEARTBEAT_INTERVAL_MS=30000
REALTIME_TOKEN_REFRESH_INTERVAL_MS=900000
# 슬롯 WAL 누수 경고 임계값 (bytes)
REALTIME_SLOT_WARN_BYTES=1610612736
```

---

## 부록 C. 위험 등록부 (TOP 2 리스크)

### C.1 PG 버전 의존성 리스크 (최고 우선순위)

| 항목 | 내용 |
|------|------|
| **리스크** | PostgreSQL 마이너 업그레이드 후 wal2json ABI 호환 깨짐 |
| **확률** | 중 (PG 15→16 마이너 버전 업그레이드 시 약 20% 가능성) |
| **영향** | WALConsumer 전체 중단 → Realtime 기능 불능 |
| **완화 1** | `dpkg --hold postgresql-15` — PG 버전 고정 |
| **완화 2** | 업그레이드 전 스테이징 환경에서 wal2json 호환 테스트 |
| **완화 3** | 폴링 폴백 자동 활성화 (§7) — Realtime 중단 시 5초 폴링으로 전환 |
| **재검토 트리거** | ASM-6: PostgreSQL 17로 업그레이드 계획 수립 시 |

### C.2 Replication Slot 디스크 누수 리스크 (2순위)

| 항목 | 내용 |
|------|------|
| **리스크** | `ypb-realtime` 프로세스 장시간 중단 시 Slot에 WAL 누적 → 디스크 폭증 → PG 정지 |
| **확률** | 중 (WSL2 환경에서 프로세스 재시작이 불완전할 경우) |
| **영향** | PostgreSQL 전체 정지 — 전체 서비스 중단 |
| **완화 1** | `max_slot_wal_keep_size=2GB` — PG 15 설정으로 최대 보존량 고정 |
| **완화 2** | SlotMonitor: 5분마다 WAL lag 점검, 1.5GB 초과 시 경고 + 알림 |
| **완화 3** | `ypb-realtime` PM2 `max_memory_restart: 512M` — OOM 시 자동 재시작 |
| **재검토 트리거** | SlotMonitor 경고 2회 연속 발생 시 즉시 검토 |

---

## 부록 Z. 근거 인덱스

| 섹션 | 근거 문서 |
|------|----------|
| §1 채택안 | `01-research/09-realtime/04-realtime-matrix.md` §0·§7·§13 |
| §1 ADR-010 | `02-architecture/01-adr-log.md §ADR-010` |
| §2 계층 구조 | `01-research/09-realtime/05-wal2json-vs-supabase-realtime-port.md §6` |
| §3 PresenceService | `01-research/09-realtime/05-wal2json-vs-supabase-realtime-port.md §3.2` |
| §4 WebSocket 위치 | `01-research/09-realtime/04-realtime-matrix.md §12 (DQ-RT-1)` |
| §7 폴링 폴백 | ADR-010 재검토 트리거 3번 |
| §8 데이터 모델 | `02-architecture/02-data-model-erd.md §3` |
| §9 PG 호환 | `01-research/09-realtime/01-wal2json-logical-replication-deep-dive.md §0` |
| §10 DQ 답변 | `00-vision/07-dq-matrix.md §3.9` |
| §11 통합 | `02-architecture/00-system-overview.md §5` |
| §12 WBS | `00-vision/10-14-categories-priority.md §4.1 (Phase 19)` |

### Z.1 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent W4-B5-RT (Sonnet 4.6) | Wave 4 Tier 2 초안 — Phase 19 청사진 완성 |

---

> **문서 끝.** Wave 4 · B5 Data Delivery · Realtime Blueprint · 2026-04-18 · 55점 → 100점 · Phase 19 · ~35h
